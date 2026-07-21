import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

const TERMINAL_WS_URL = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/terminal`;
})();

export default function TerminalInner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      theme: {
        background: '#0a0a0b',
        foreground: '#e5e5e5',
        cursor: '#fbbf24',
        selectionBackground: '#fbbf2440',
        black: '#0a0a0b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#fbbf24',
        blue: '#3b82f6',
        magenta: '#ec4899',
        cyan: '#06b6d4',
        white: '#e5e5e5',
        brightBlack: '#6b6b73',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fcd34d',
        brightBlue: '#60a5fa',
        brightMagenta: '#f472b6',
        brightCyan: '#22d3ee',
        brightWhite: '#f5f5f5',
      },
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    term.writeln('\x1b[33mLuStudio Terminal\x1b[0m — connecting...');

    const connect = () => {
      const ws = new WebSocket(TERMINAL_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        term.writeln('\x1b[32m✓ Connected\x1b[0m');
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'data') term.write(msg.data);
          else if (msg.type === 'exit')
            term.writeln(`\r\n\x1b[33m[process exited with code ${msg.exitCode}]\x1b[0m`);
        } catch {
          /* ignore */
        }
      };

      ws.onerror = () => term.writeln('\r\n\x1b[31m✗ Connection error\x1b[0m');

      ws.onclose = () => {
        setConnected(false);
        term.writeln('\r\n\x1b[31m✗ Disconnected. Reconnecting in 3s...\x1b[0m');
        setTimeout(() => {
          if (wsRef.current === ws) connect();
        }, 3000);
      };
    };

    connect();

    const inputDisposable = term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN)
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
    });

    const resizeObserver = new ResizeObserver(() => {
      if (fitRef.current && termRef.current) {
        fitRef.current.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN)
          wsRef.current.send(
            JSON.stringify({ type: 'resize', cols: termRef.current.cols, rows: termRef.current.rows }),
          );
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      inputDisposable.dispose();
      resizeObserver.disconnect();
      wsRef.current?.close();
      wsRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full">
      <div className="absolute left-2 top-1 z-10 flex items-center gap-1.5 text-xs text-coal-500 pointer-events-none">
        <div className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span>{connected ? 'connected' : 'disconnected'}</span>
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
