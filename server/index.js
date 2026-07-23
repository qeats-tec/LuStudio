import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import * as pty from 'node-pty';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

const server = http.createServer(app);

import { WebSocketServer, WebSocket } from 'ws';
const wss = new WebSocketServer({ server, path: '/terminal' });

const terminals = new Map();

// ── Per-project workspaces ───────────────────────────────────────────────
// Each project gets its own directory on disk. The terminal runs inside it,
// and files created in the terminal can be synced back to the Explorer.

const WORKSPACES_ROOT = path.join(process.env.HOME || '/tmp', '.lustudio-workspaces');

function getWorkspaceDir(projectId: string): string {
  return path.join(WORKSPACES_ROOT, projectId);
}

function ensureWorkspace(projectId: string): string {
  const dir = getWorkspaceDir(projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', '.cache', '.bolt']);

function buildTree(dir: string, baseDir: string): unknown[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: unknown[] = [];
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      nodes.push({ name: entry.name, type: 'folder', path: relPath, children: buildTree(fullPath, baseDir) });
    } else {
      nodes.push({ name: entry.name, type: 'file', path: relPath });
    }
  }
  return nodes.sort((a: any, b: any) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function safePath(projectId: string, relPath: string): string | null {
  const workspace = getWorkspaceDir(projectId);
  const resolved = path.resolve(workspace, relPath);
  if (!resolved.startsWith(workspace + path.sep) && resolved !== workspace) return null;
  return resolved;
}

// Sync localStorage files → disk workspace
app.post('/api/workspace/:projectId', (req, res) => {
  const { projectId } = req.params;
  const { files } = req.body as { files: Array<{ path: string; content: string; type: string }> };
  if (!Array.isArray(files)) return res.status(400).json({ error: 'files array required' });

  const workspace = ensureWorkspace(projectId);

  // Write each file to disk
  for (const file of files) {
    if (file.type !== 'file') continue;
    const filePath = path.join(workspace, file.path);
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, file.content ?? '');
    } catch (err) {
      console.error(`[workspace] write failed: ${file.path}`, err);
    }
  }

  res.json({ ok: true, workspace });
});

// Read disk workspace tree → Explorer
app.get('/api/workspace/:projectId/tree', (req, res) => {
  const { projectId } = req.params;
  const workspace = getWorkspaceDir(projectId);
  if (!fs.existsSync(workspace)) return res.json({ tree: [] });
  res.json({ tree: buildTree(workspace, workspace) });
});

// Read file from workspace
app.get('/api/workspace/:projectId/file', (req, res) => {
  const { projectId } = req.params;
  const filePath = safePath(projectId, req.query.path as string);
  if (!filePath) return res.status(403).json({ error: 'Access denied' });
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// Write file to workspace (when user saves in editor)
app.post('/api/workspace/:projectId/file', (req, res) => {
  const { projectId } = req.params;
  const { path: relPath, content } = req.body as { path: string; content: string };
  const filePath = safePath(projectId, relPath);
  if (!filePath) return res.status(403).json({ error: 'Access denied' });
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content ?? '');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Terminal WebSocket ───────────────────────────────────────────────────

function getShell() {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || '/bin/bash';
}

wss.on('connection', (ws, req) => {
  const id = Math.random().toString(36).slice(2);

  // Parse projectId from query string
  const url = new URL(req.url || '', 'http://localhost');
  const projectId = url.searchParams.get('projectId') || '';
  console.log(`[terminal] connection ${id} projectId=${projectId}`);

  // Start in the project workspace dir, or fall back to a temp dir
  let cwd: string;
  if (projectId) {
    cwd = ensureWorkspace(projectId);
  } else {
    cwd = process.env.HOME || '/tmp';
  }

  const shell = getShell();

  const termEnv = {
    ...process.env,
    TERM: 'xterm-256color',
    FORCE_COLOR: '1',
    COLORTERM: 'truecolor',
    PORT: '3000', // user apps use 3000, LuStudio uses its own port
  };

  let term;
  try {
    term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: termEnv,
    });
  } catch (err) {
    console.error('[terminal] pty spawn failed:', err.message);
    ws.send(JSON.stringify({ type: 'error', message: 'Terminal backend not available' }));
    ws.close();
    return;
  }

  terminals.set(id, term);

  let outputBuffer: Buffer[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const FLUSH_MS = 8;
  const MAX_BUFFER = 65536;

  function flushOutput() {
    flushTimer = null;
    if (outputBuffer.length === 0) return;
    const merged = Buffer.concat(outputBuffer);
    outputBuffer = [];
    if (ws.readyState === WebSocket.OPEN) ws.send(merged);
  }

  function scheduleFlush() {
    if (outputBuffer.length > 0 && outputBuffer.reduce((a, b) => a + b.length, 0) >= MAX_BUFFER) {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      flushOutput();
      return;
    }
    if (!flushTimer) flushTimer = setTimeout(flushOutput, FLUSH_MS);
  }

  term.onData((data) => {
    outputBuffer.push(Buffer.from(data, 'utf8'));
    scheduleFlush();
  });

  term.onExit(({ exitCode }) => {
    if (flushTimer) { clearTimeout(flushTimer); flushOutput(); }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }));
      ws.close();
    }
    terminals.delete(id);
  });

  ws.on('message', (msg, isBinary) => {
    if (isBinary) {
      try { term.write(msg); } catch { /* ignore */ }
    } else {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'resize') {
          term.resize(Math.max(1, data.cols || 80), Math.max(1, data.rows || 24));
        }
      } catch { /* ignore */ }
    }
  });

  ws.on('close', () => {
    if (flushTimer) clearTimeout(flushTimer);
    try { term.kill(); } catch { /* ignore */ }
    terminals.delete(id);
  });

  ws.on('error', () => {
    if (flushTimer) clearTimeout(flushTimer);
    try { term.kill(); } catch { /* ignore */ }
    terminals.delete(id);
  });
});

// ── Health & catch-all ───────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', terminals: terminals.size, uptime: process.uptime() });
});

app.get('*', (_req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send('Not found — run npm run build first');
});

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`LuStudio server on http://${HOST}:${PORT}`);
});

function shutdown() {
  for (const [, term] of terminals) { try { term.kill(); } catch { /* ignore */ } }
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
