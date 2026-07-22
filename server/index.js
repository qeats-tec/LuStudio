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

function getShell() {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || '/bin/bash';
}

function getWorkspaceDir() {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'package.json'))) return cwd;
  const projectRoot = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(projectRoot, 'package.json'))) return projectRoot;
  const home = process.env.HOME || '/tmp';
  if (fs.existsSync(home)) return home;
  return '/tmp';
}

// ── Filesystem API ──────────────────────────────────────────────────────

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', '.cache', '.bolt']);

function buildTree(dir, baseDir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes = [];
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      const children = buildTree(fullPath, baseDir);
      nodes.push({ name: entry.name, type: 'folder', path: relPath, children });
    } else {
      nodes.push({ name: entry.name, type: 'file', path: relPath });
    }
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function safePath(relPath) {
  const workspace = getWorkspaceDir();
  const resolved = path.resolve(workspace, relPath);
  if (!resolved.startsWith(workspace + path.sep) && resolved !== workspace) {
    return null;
  }
  return resolved;
}

app.get('/api/tree', (req, res) => {
  const dir = getWorkspaceDir();
  try {
    const tree = buildTree(dir, dir);
    res.json({ tree, cwd: dir });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/file', (req, res) => {
  const filePath = safePath(req.query.path);
  if (!filePath) return res.status(403).json({ error: 'Access denied' });
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/file', (req, res) => {
  const { path: relPath, content } = req.body;
  const filePath = safePath(relPath);
  if (!filePath) return res.status(403).json({ error: 'Access denied' });
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content ?? '');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/file/new', (req, res) => {
  const { path: relPath, type } = req.body;
  const filePath = safePath(relPath);
  if (!filePath) return res.status(403).json({ error: 'Access denied' });
  try {
    if (type === 'folder') {
      fs.mkdirSync(filePath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, '');
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/file', (req, res) => {
  const filePath = safePath(req.query.path);
  if (!filePath) return res.status(403).json({ error: 'Access denied' });
  try {
    if (fs.statSync(filePath).isDirectory()) {
      fs.rmSync(filePath, { recursive: true });
    } else {
      fs.unlinkSync(filePath);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cwd', (req, res) => {
  res.json({ cwd: getWorkspaceDir() });
});

// ── Terminal WebSocket ───────────────────────────────────────────────────

wss.on('connection', (ws, req) => {
  const id = Math.random().toString(36).slice(2);
  console.log(`[terminal] connection ${id} from ${req.socket.remoteAddress}`);

  const cwd = getWorkspaceDir();
  const shell = getShell();

  let term;
  try {
    term = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        FORCE_COLOR: '1',
        COLORTERM: 'truecolor',
      },
    });
  } catch (err) {
    console.error('[terminal] pty spawn failed:', err.message);
    ws.send(JSON.stringify({ type: 'error', message: 'Terminal backend not available' }));
    ws.close();
    return;
  }

  terminals.set(id, term);

  // Ensure terminal starts in the workspace directory (overrides any shell profile cd)
  term.write(`cd "${cwd}"\r`);

  let outputBuffer = [];
  let flushTimer = null;
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
    console.log(`[terminal] shell ${id} exited: ${exitCode}`);
    if (flushTimer) { clearTimeout(flushTimer); flushOutput(); }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }));
      ws.close();
    }
    terminals.delete(id);
  });

  ws.on('message', (msg, isBinary) => {
    if (isBinary) {
      try { term.write(msg); } catch (e) { console.error('[terminal] write error:', e.message); }
    } else {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'resize') {
          term.resize(Math.max(1, data.cols || 80), Math.max(1, data.rows || 24));
        }
      } catch (e) { console.error('[terminal] control parse error:', e.message); }
    }
  });

  ws.on('close', () => {
    console.log(`[terminal] connection ${id} closed`);
    if (flushTimer) clearTimeout(flushTimer);
    try { term.kill(); } catch { /* ignore */ }
    terminals.delete(id);
  });

  ws.on('error', (err) => {
    console.error(`[terminal] ws error ${id}:`, err.message);
    if (flushTimer) clearTimeout(flushTimer);
    try { term.kill(); } catch { /* ignore */ }
    terminals.delete(id);
  });
});

// ── Health & catch-all ───────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', terminals: terminals.size, uptime: process.uptime() });
});

app.get('*', (req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send('Not found — run npm run build first');
});

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`LuStudio server on http://${HOST}:${PORT}`);
  console.log(`Shell: ${getShell()} | Workspace: ${getWorkspaceDir()}`);
});

function shutdown() {
  for (const [, term] of terminals) { try { term.kill(); } catch { /* ignore */ } }
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
