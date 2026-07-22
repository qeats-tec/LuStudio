import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/terminal' });

const shells = new Map();

function getShell() {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || '/bin/bash';
}

function getWorkspaceDir() {
  // Project root is the parent of the server/ directory
  const projectRoot = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(projectRoot, 'package.json'))) return projectRoot;
  // Fallback to HOME if project root doesn't look like a project
  const dir = process.env.HOME || '/tmp';
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      return '/tmp';
    }
  }
  return dir;
}

wss.on('connection', (ws, req) => {
  const id = Math.random().toString(36).slice(2);
  console.log(`[terminal] connection ${id} from ${req.socket.remoteAddress}`);

  const cwd = getWorkspaceDir();
  const shell = getShell();

  let child;
  try {
    child = spawn(shell, ['-i'], {
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.error('[terminal] spawn failed:', err.message);
    ws.send(
      JSON.stringify({
        type: 'data',
        data: '\r\n\x1b[33m*** Terminal backend not available in this environment ***\x1b[0m\r\n$ ',
      }),
    );
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type === 'input' && data.data) {
          ws.send(JSON.stringify({ type: 'data', data: data.data }));
          if (data.data === '\r') ws.send(JSON.stringify({ type: 'data', data: '\r\n$ ' }));
        }
      } catch {
        /* ignore */
      }
    });
    ws.on('close', () => console.log(`[terminal] fallback ${id} closed`));
    return;
  }

  shells.set(id, child);

  child.stdout.on('data', (data) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'data', data: data.toString() }));
  });

  child.stderr.on('data', (data) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'data', data: data.toString() }));
  });

  child.on('exit', (exitCode) => {
    console.log(`[terminal] shell ${id} exited: ${exitCode}`);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }));
      ws.close();
    }
    shells.delete(id);
  });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'input' && data.data !== undefined) {
        child.stdin.write(data.data);
      }
    } catch (e) {
      console.error('[terminal] parse error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[terminal] connection ${id} closed`);
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    shells.delete(id);
  });

  ws.on('error', (err) => {
    console.error(`[terminal] ws error ${id}:`, err.message);
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    shells.delete(id);
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', shells: shells.size, uptime: process.uptime() });
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

process.on('SIGTERM', () => {
  for (const [, child] of shells) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  for (const [, child] of shells) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
});
