# LuStudio — Cloud IDE

A browser-based IDE with real terminal (via WebSocket + node-pty), AI assistant (Gemini), file explorer, code editor, and live preview.

## Architecture

- **Frontend**: React + Vite + Tailwind CSS + xterm.js
- **Backend**: Express + ws (WebSocket) + node-pty (real shell)
- **AI**: Google Gemini 1.5 Flash API

## Local Development

```bash
npm install
npm run dev:all
```

This runs:
- Vite dev server on port 5173 (frontend)
- Express server on port 3001 (terminal backend)

Vite proxies `/terminal` WebSocket to the backend.

## Production (Render)

1. Push this repo to GitHub
2. Create a new Web Service on [Render](https://render.com)
3. Use the `render.yaml` config (auto-detected) or manually:
   - **Build**: `npm install && npm run build`
   - **Start**: `npm start`
   - **Port**: 3001 (Render assigns this)
4. The server serves the built frontend and the WebSocket terminal on the same port.

## Features

- Real terminal (bash/zsh) via WebSocket
- File explorer with create/rename/delete
- Multi-tab code editor with syntax highlighting
- AI assistant (Gemini) — can write files directly to your project
- Live preview panel (desktop/tablet/mobile)
- Search across files
- Settings with Gemini API key management

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `WORKSPACE_DIR` | `./workspace` | Terminal working directory |
| `SHELL` | `bash` | Shell to spawn |
