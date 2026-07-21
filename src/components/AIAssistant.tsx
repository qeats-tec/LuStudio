import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, AlertCircle, FileCode, Loader2, Settings as SettingsIcon } from 'lucide-react';
import type { ChatMessage, AIFileAction } from '../types';
import { callAI, parseAIFileActions, buildSystemPrompt, type AISettings } from '../utils/ai';

interface AIAssistantProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
  aiSettings: AISettings;
  onOpenSettings: () => void;
  selectedCode: string;
  activeLanguage: string;
  fileList: string[];
  onApplyFiles: (actions: AIFileAction[]) => void;
}

export function AIAssistant({
  open,
  onClose,
  messages,
  onMessagesChange,
  aiSettings,
  onOpenSettings,
  fileList,
  onApplyFiles,
}: AIAssistantProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  if (!open) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: Date.now() };
    const pendingMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: Date.now(), pending: true };
    const history = [...messages, userMsg];
    onMessagesChange([...history, pendingMsg]);
    setInput('');
    setLoading(true);

    try {
      const reply = await callAI(aiSettings, history, buildSystemPrompt(fileList));
      onMessagesChange([...history, { id: pendingMsg.id, role: 'assistant', content: reply, timestamp: Date.now() }]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      onMessagesChange([
        ...history,
        { id: pendingMsg.id, role: 'assistant', content: `Error: ${errorMsg}`, timestamp: Date.now(), error: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (content: string) => {
    const actions = parseAIFileActions(content);
    if (actions.length > 0) onApplyFiles(actions);
  };

  return (
    <div className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-coal-800 bg-coal-900 shadow-2xl animate-slide-up">
      <div className="flex items-center justify-between border-b border-coal-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-400/15 text-accent-400">
            <Sparkles size={15} />
          </div>
          <div>
            <span className="text-sm font-semibold text-coal-100">LuStudio AI</span>
            <div className="text-xs text-coal-400">
              {aiSettings.apiKey ? aiSettings.model || 'Ready' : 'No API key set'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!aiSettings.apiKey && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 rounded-lg border border-accent-400/30 bg-accent-400/10 px-2.5 py-1 text-xs text-accent-400 transition-colors hover:bg-accent-400/20"
            >
              <AlertCircle size={12} /> Set Key
            </button>
          )}
          <button
            onClick={onOpenSettings}
            className="rounded-lg p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100"
          >
            <SettingsIcon size={16} />
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-400/10 text-accent-400">
              <Sparkles size={24} />
            </div>
            <p className="text-sm font-medium text-coal-200">Ask me anything</p>
            <p className="mt-1 text-xs text-coal-400">I can write code, edit files, and answer questions.</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-accent-400/15 text-coal-100'
                  : msg.error
                    ? 'bg-red-500/10 text-red-300 border border-red-500/20'
                    : 'bg-coal-850 text-coal-200'
              }`}
            >
              {msg.pending ? (
                <div className="flex items-center gap-2 text-coal-400">
                  <Loader2 size={14} className="animate-spin" /> Thinking...
                </div>
              ) : (
                <div className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>
              )}
              {!msg.pending && msg.role === 'assistant' && !msg.error && parseAIFileActions(msg.content).length > 0 && (
                <button
                  onClick={() => handleApply(msg.content)}
                  className="mt-2 flex items-center gap-1.5 rounded-lg border border-accent-400/30 bg-accent-400/10 px-2.5 py-1 text-xs text-accent-400 transition-colors hover:bg-accent-400/20"
                >
                  <FileCode size={12} /> Apply {parseAIFileActions(msg.content).length} file(s)
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-coal-800 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask AI to build something..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-coal-700 bg-coal-850 px-3 py-2 text-sm text-coal-100 placeholder-coal-500 outline-none transition-colors focus:border-accent-400/50"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-400 text-coal-950 transition-colors hover:bg-accent-300 disabled:opacity-40"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
