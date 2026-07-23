import { useState, lazy, Suspense } from 'react';
import { ChevronDown, ChevronUp, Trash2, Terminal as TerminalIcon, RefreshCw } from 'lucide-react';

interface TerminalPanelProps {
  open: boolean;
  onToggle: () => void;
  projectId: string;
  onRefreshFiles: () => void;
}

const LazyTerminal = lazy(() => import('./TerminalInner'));

export function TerminalPanel({ open, onToggle, projectId, onRefreshFiles }: TerminalPanelProps) {
  const [, forceRender] = useState(0);

  return (
    <div className="flex h-full flex-col bg-coal-950">
      <div className="flex h-9 items-center justify-between border-b border-coal-800 px-3">
        <div className="flex items-center gap-2">
          <TerminalIcon size={14} className="text-accent-400" />
          <span className="text-xs font-medium text-coal-300">Terminal</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefreshFiles}
            title="Sync files from terminal to Explorer"
            className="rounded p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => forceRender((n) => n + 1)}
            title="Clear terminal"
            className="rounded p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={onToggle}
            title={open ? 'Minimize' : 'Maximize'}
            className="rounded p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100"
          >
            {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="flex-1 overflow-hidden bg-coal-950" style={{ minHeight: '60px' }}>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-xs text-coal-500">Loading terminal...</div>
            }
          >
            <LazyTerminal projectId={projectId} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
