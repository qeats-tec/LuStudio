import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Copy, Check, FileCode, FolderPlus, FilePlus } from 'lucide-react';
import type { AIFileAction } from '../types';

interface CodeCardProps {
  content: string;
  actions: AIFileAction[];
  onApply: (actions: AIFileAction[]) => void;
}

export function CodeCard({ content, actions, onApply }: CodeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const previewLines = useMemo(() => {
    const lines = content.split('\n');
    return expanded ? lines : lines.slice(0, 4);
  }, [content, expanded]);

  const hasMore = content.split('\n').length > 4;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const hasFolderAction = actions.some((a) => a.path.endsWith('/'));
  const fileCount = actions.length;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-coal-700 bg-coal-950">
      {/* Header — clickable to expand/collapse */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-2 border-b border-coal-800 bg-coal-900/60 px-3 py-2 text-left transition-colors hover:bg-coal-850"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-400/15 text-accent-400">
            <FileCode size={13} />
          </div>
          <span className="text-xs font-semibold text-coal-100">Değişiklikleri İncele</span>
          <span className="rounded-full bg-coal-800 px-2 py-0.5 text-[10px] text-coal-400">
            {fileCount} dosya{hasFolderAction ? ' + klasör' : ''}
          </span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-coal-400" /> : <ChevronDown size={14} className="text-coal-400" />}
      </button>

      {/* Code preview area */}
      <div className="relative">
        <pre className="max-h-[420px] overflow-auto px-3 py-2.5 font-mono text-xs leading-relaxed text-coal-300">
          <code>
            {previewLines.map((line, i) => (
              <div key={i} className="flex">
                <span className="mr-3 w-6 shrink-0 select-none text-right text-coal-600">{i + 1}</span>
                <span className="whitespace-pre">{line || ' '}</span>
              </div>
            ))}
          </code>
        </pre>

        {/* Fade-out overlay when collapsed */}
        {!expanded && hasMore && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-coal-950 to-transparent" />
        )}
      </div>

      {/* "Show more" hint when collapsed */}
      {!expanded && hasMore && (
        <button
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-center gap-1 border-t border-coal-800 bg-coal-900/40 py-1.5 text-[11px] text-coal-500 transition-colors hover:bg-coal-850 hover:text-coal-300"
        >
          <ChevronDown size={12} /> Kodun tamamını gör
        </button>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-coal-800 bg-coal-900/60 px-3 py-2">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-lg border border-coal-700 bg-coal-850 px-2.5 py-1.5 text-xs text-coal-300 transition-colors hover:bg-coal-800 hover:text-coal-100"
        >
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </button>
        <button
          onClick={() => onApply(actions)}
          className="flex items-center gap-1.5 rounded-lg bg-accent-400 px-2.5 py-1.5 text-xs font-medium text-coal-950 transition-colors hover:bg-accent-300"
        >
          <FilePlus size={12} /> Kodu Uygula
        </button>
        {hasFolderAction && (
          <span className="ml-auto flex items-center gap-1 text-[10px] text-coal-500">
            <FolderPlus size={11} /> Klasör oluşturulacak
          </span>
        )}
      </div>
    </div>
  );
}
