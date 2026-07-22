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

// WebSocket server for terminals — mounted on /terminal
import { WebSocketServer } from 'ws';
const wss = new WebSocketServer({ server, path: '/terminal' });

const terminals = new Map();

function getShell() {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || '/bin/bash';
}

function getWorkspaceDir() {
  // 1) Where the app was launched from (Render runs `npm start` from project root)
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'package.json'))) return cwd;
  // 2) Parent of server/ directory
  const projectRoot = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(projectRoot, 'package.json'))) return projectRoot;
  // 3) HOME
  const home = process.env.HOME || '/tmp';
  if (fs.existsSync(home)) return home;
  // 4) Last resort
  return '/tmp';
}

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
      },
    });
  } catch (err) {
    console.error('[terminal] pty spawn failed:', err.message);
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

  terminals.set(id, term);

  term.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'data', data }));
  });

  term.onExit(({ exitCode }) => {
    console.log(`[terminal] shell ${id} exited: ${exitCode}`);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }));
      ws.close();
    }
    terminals.delete(id);
  });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'input' && data.data !== undefined) {
        term.write(data.data);
      } else if (data.type === 'resize') {
        const cols = Math.max(1, data.cols || 80);
        const rows = Math.max(1, data.rows || 24);
        term.resize(cols, rows);
      }
    } catch (e) {
      console.error('[terminal] parse error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`[terminal] connection ${id} closed`);
    try {
      term.kill();
    } catch {
      /* ignore */
    }
    terminals.delete(id);
  });

  ws.on('error', (err) => {
    console.error(`[terminal] ws error ${id}:`, err.message);
    try {
      term.kill();
    } catch {
      /* ignore */
    }
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

process.on('SIGTERM', () => {
  for (const [, term] of terminals) {
    try {
      term.kill();
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  for (const [, term] of terminals) {
    try {
      term.kill();
    } catch {
      /* ignore */
    }
  }
  server.close(() => process.exit(0));
});
