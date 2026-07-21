import { useRef, useEffect } from 'react';
import { X, Circle } from 'lucide-react';
import type { EditorTab } from '../types';

interface CodeEditorProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onContentChange: (id: string, content: string) => void;
  onSelectionChange: (code: string) => void;
}

const languageLabels: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript', tsx: 'TSX', jsx: 'JSX',
  json: 'JSON', css: 'CSS', html: 'HTML', markdown: 'Markdown', plaintext: 'Plain Text',
};

export function CodeEditor({ tabs, activeTabId, onTabSelect, onTabClose, onContentChange, onSelectionChange }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeTab = tabs.find((t) => t.id === activeTabId);

  useEffect(() => {
    if (textareaRef.current && activeTab) {
      textareaRef.current.value = activeTab.content;
    }
  }, [activeTabId, activeTab?.content]);

  const getSelectedText = () => {
    const ta = textareaRef.current;
    if (!ta) return '';
    return ta.value.substring(ta.selectionStart, ta.selectionEnd);
  };

  return (
    <div className="flex h-full flex-col bg-coal-900">
      {/* Tab bar */}
      <div className="flex items-center border-b border-coal-800 bg-coal-950 overflow-x-auto">
        {tabs.length === 0 ? (
          <div className="px-4 py-2 text-xs text-coal-500">No file open</div>
        ) : tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => onTabSelect(tab.id)}
            className={`group flex cursor-pointer items-center gap-2 border-r border-coal-800 px-3 py-2 text-xs transition-colors ${
              tab.id === activeTabId ? 'bg-coal-900 text-coal-100' : 'bg-coal-950 text-coal-400 hover:bg-coal-900 hover:text-coal-200'
            }`}
          >
            <span className="truncate max-w-[120px]">{tab.name}</span>
            {tab.dirty && <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />}
            <button
              onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
              className="rounded p-0.5 opacity-0 transition-opacity hover:bg-coal-700 group-hover:opacity-100"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Editor area */}
      {activeTab ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Line numbers */}
          <div className="select-none overflow-hidden bg-coal-950 py-3 px-2 text-right text-xs text-coal-600 font-mono leading-5" style={{ minWidth: '48px' }}>
            {activeTab.content.split('\n').map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            defaultValue={activeTab.content}
            onChange={(e) => onContentChange(activeTab.id, e.target.value)}
            onSelect={() => onSelectionChange(getSelectedText())}
            onMouseUp={() => onSelectionChange(getSelectedText())}
            spellCheck={false}
            className="flex-1 resize-none bg-coal-900 py-3 px-3 font-mono text-sm text-coal-100 outline-none leading-5"
            style={{ tabSize: 2, whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto' }}
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-center">
          <div>
            <div className="mb-2 flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-coal-850 text-coal-600">
              <Circle size={28} />
            </div>
            <p className="text-sm text-coal-400">Open a file to start editing</p>
          </div>
        </div>
      )}

      {/* Status bar */}
      {activeTab && (
        <div className="flex items-center justify-between border-t border-coal-800 bg-coal-950 px-3 py-1 text-xs text-coal-500">
          <span>{languageLabels[activeTab.language] ?? activeTab.language}</span>
          <span>{activeTab.content.split('\n').length} lines · {activeTab.content.length} chars</span>
        </div>
      )}
    </div>
  );
}
