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
app.use(express.json());

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

// Binary protocol:
// - Binary frames = raw terminal data (both directions)
// - Text frames   = JSON control messages: { type: "resize", cols, rows } | { type: "exit", exitCode }

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

  // Output buffer: batch small writes into larger frames for throughput
  let outputBuffer = [];
  let flushTimer = null;
  const FLUSH_MS = 8; // batch window
  const MAX_BUFFER = 65536; // flush immediately if buffer gets this big

  function flushOutput() {
    flushTimer = null;
    if (outputBuffer.length === 0) return;
    const merged = Buffer.concat(outputBuffer);
    outputBuffer = [];
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(merged); // binary frame — zero JSON overhead
    }
  }

  function scheduleFlush() {
    if (outputBuffer.length > 0 && outputBuffer.reduce((a, b) => a + b.length, 0) >= MAX_BUFFER) {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      flushOutput();
      return;
    }
    if (!flushTimer) {
      flushTimer = setTimeout(flushOutput, FLUSH_MS);
    }
  }

  term.onData((data) => {
    outputBuffer.push(Buffer.from(data, 'utf8'));
    scheduleFlush();
  });

  term.onExit(({ exitCode }) => {
    console.log(`[terminal] shell ${id} exited: ${exitCode}`);
    if (flushTimer) { clearTimeout(flushTimer); flushOutput(); }
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode })); // text frame = control
      ws.close();
    }
    terminals.delete(id);
  });

  ws.on('message', (msg, isBinary) => {
    if (isBinary) {
      // Binary frame = raw terminal input
      try {
        term.write(msg);
      } catch (e) {
        console.error('[terminal] write error:', e.message);
      }
    } else {
      // Text frame = JSON control message
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'resize') {
          const cols = Math.max(1, data.cols || 80);
          const rows = Math.max(1, data.rows || 24);
          term.resize(cols, rows);
        }
      } catch (e) {
        console.error('[terminal] control parse error:', e.message);
      }
    }
  });

  ws.on('close', () => {
    console.log(`[terminal] connection ${id} closed`);
    if (flushTimer) { clearTimeout(flushTimer); }
    try { term.kill(); } catch { /* ignore */ }
    terminals.delete(id);
  });

  ws.on('error', (err) => {
    console.error(`[terminal] ws error ${id}:`, err.message);
    if (flushTimer) { clearTimeout(flushTimer); }
    try { term.kill(); } catch { /* ignore */ }
    terminals.delete(id);
  });
});

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
  for (const [, term] of terminals) {
    try { term.kill(); } catch { /* ignore */ }
  }
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
