import type { FileNode, Project } from '../types';

function f(name: string, path: string, content: string): FileNode {
  return {
    id: crypto.randomUUID(),
    name,
    type: 'file',
    path,
    content,
    language: path.endsWith('.tsx') ? 'tsx' : path.endsWith('.ts') ? 'typescript' : path.endsWith('.css') ? 'css' : path.endsWith('.html') ? 'html' : 'plaintext',
  };
}

function folder(name: string, path: string, children: FileNode[]): FileNode {
  return { id: crypto.randomUUID(), name, type: 'folder', path, children };
}

const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LuStudio — Cloud IDE</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

const mainTsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);`;

const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; padding: 0; }
body { font-family: 'Inter', system-ui, sans-serif; background: #0a0a0b; color: #e5e5e5; overflow: hidden; }

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #404040; }

.xterm { padding: 8px; }
.xterm-viewport::-webkit-scrollbar { width: 6px; }`;

const appTsx = `import { useState } from 'react';
import { Terminal as TerminalIcon, Sparkles, Settings as SettingsIcon } from 'lucide-react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-coal-950 text-coal-100">
      <div className="flex items-center gap-2 mb-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-400 text-lg font-bold text-coal-950">L</div>
        <h1 className="text-2xl font-bold">LuStudio</h1>
      </div>
      <p className="text-coal-400 mb-6">Cloud IDE — Built with React + Vite</p>
      <button
        onClick={() => setCount((c) => c + 1)}
        className="rounded-lg bg-accent-400 px-6 py-3 font-medium text-coal-950 transition-colors hover:bg-accent-300"
      >
        Clicked {count} times
      </button>
    </div>
  );
}`;

export function createDefaultProject(): Project {
  const srcFolder = folder('src', 'src', [
    f('App.tsx', 'src/App.tsx', appTsx),
    f('main.tsx', 'src/main.tsx', mainTsx),
    f('index.css', 'src/index.css', indexCss),
  ]);

  return {
    id: crypto.randomUUID(),
    name: 'LuStudio',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    files: [
      f('index.html', 'index.html', indexHtml),
      srcFolder,
    ],
  };
}
