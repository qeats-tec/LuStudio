import { useState, useRef, useEffect, useMemo } from 'react';
import { X, Send, Sparkles, CircleAlert as AlertCircle, Loader as Loader2, Settings as SettingsIcon, FolderPlus, FilePlus, Check } from 'lucide-react';
import type { ChatMessage, AIFileAction, AIStructuredAction } from '../types';
import { callAI, parseAIFileActions, parseAIStructuredActions, buildSystemPrompt, type AISettings } from '../utils/ai';
import { CodeCard } from './CodeCard';

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
  onApplyStructured: (actions: AIStructuredAction[]) => void;
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
  onApplyStructured,
}: AIAssistantProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
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

  const handleApply = (msg: ChatMessage) => {
    const structured = parseAIStructuredActions(msg.content);
    const fileActions = parseAIFileActions(msg.content);
    if (structured.length > 0) onApplyStructured(structured);
    if (fileActions.length > 0) onApplyFiles(fileActions);
    setAppliedIds((prev) => new Set(prev).add(msg.id));
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
            <p className="text-sm font-medium text-coal-200">Bana bir şeyler sorun</p>
            <p className="mt-1 text-xs text-coal-400">Kod yazabilirim, dosya/klasör oluştururum, soruları yanıtlarım.</p>
            <div className="mt-4 space-y-1.5 text-left">
              <p className="text-[11px] text-coal-500">Örnek:</p>
              <div className="rounded-lg bg-coal-850 px-2.5 py-1.5 text-xs text-coal-300">"components klasörü oluştur"</div>
              <div className="rounded-lg bg-coal-850 px-2.5 py-1.5 text-xs text-coal-300">"utils/helper.js dosyasını yarat"</div>
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const fileActions = useMemo(() => (msg.role === 'assistant' && !msg.pending ? parseAIFileActions(msg.content) : []), [msg]);
          const structuredActions = useMemo(
            () => (msg.role === 'assistant' && !msg.pending ? parseAIStructuredActions(msg.content) : []),
            [msg],
          );
          const hasActions = fileActions.length > 0 || structuredActions.length > 0;
          const wasApplied = appliedIds.has(msg.id);
          // Strip action tags from displayed text
          const displayContent = msg.content.replace(/<lustudio-action>[\s\S]*?<\/lustudio-action>/g, '').trim();

          return (
            <div key={msg.id} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-accent-400/15 text-coal-100'
                    : msg.error
                      ? 'bg-red-500/10 text-red-300 border border-red-500/20'
                      : 'bg-coal-850 text-coal-200'
                }`}
              >
                {msg.pending ? (
                  <div className="flex items-center gap-2 text-coal-400">
                    <Loader2 size={14} className="animate-spin" /> Düşünüyor...
                  </div>
                ) : (
                  <>
                    {displayContent && (
                      <div className="whitespace-pre-wrap break-words leading-relaxed">{displayContent}</div>
                    )}
                    {hasActions && !wasApplied && (
                      <>
                        {fileActions.length > 0 && (
                          <CodeCard
                            content={fileActions.map((a) => `// ${a.path}\n${a.content}`).join('\n\n')}
                            actions={fileActions}
                            onApply={() => handleApply(msg)}
                          />
                        )}
                        {structuredActions.length > 0 && fileActions.length === 0 && (
                          <StructuredActionBanner actions={structuredActions} onApply={() => handleApply(msg)} />
                        )}
                      </>
                    )}
                    {wasApplied && (
                      <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-green-500/20 bg-green-500/10 px-2.5 py-1.5 text-xs text-green-300">
                        <Check size={12} /> Değişiklikler uygulandı
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
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
            placeholder="Bir şeyler inşa et, dosya/klasör oluştur..."
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

function StructuredActionBanner({
  actions,
  onApply,
}: {
  actions: AIStructuredAction[];
  onApply: () => void;
}) {
  const folders = actions.filter((a) => a.action === 'create_folder');
  const files = actions.filter((a) => a.action === 'create_file');

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-accent-400/30 bg-coal-950">
      <div className="border-b border-coal-800 bg-coal-900/60 px-3 py-2">
        <span className="text-xs font-semibold text-coal-100">Değişiklikleri İncele</span>
      </div>
      <div className="space-y-1.5 px-3 py-2.5">
        {folders.map((a, i) => (
          <div key={`f-${i}`} className="flex items-center gap-2 text-xs text-coal-300">
            <FolderPlus size={13} className="text-accent-400/70" />
            <span className="font-medium">{a.name}</span>
            <span className="text-coal-500">{a.path === '/' ? '(kök)' : a.path}</span>
            <span className="ml-auto rounded bg-coal-800 px-1.5 py-0.5 text-[10px] text-coal-400">klasör</span>
          </div>
        ))}
        {files.map((a, i) => (
          <div key={`file-${i}`} className="flex items-center gap-2 text-xs text-coal-300">
            <FilePlus size={13} className="text-accent-400/70" />
            <span className="font-medium">{a.name}</span>
            <span className="text-coal-500">{a.path}</span>
            <span className="ml-auto rounded bg-coal-800 px-1.5 py-0.5 text-[10px] text-coal-400">{a.language}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-coal-800 bg-coal-900/60 px-3 py-2">
        <button
          onClick={onApply}
          className="flex items-center gap-1.5 rounded-lg bg-accent-400 px-2.5 py-1.5 text-xs font-medium text-coal-950 transition-colors hover:bg-accent-300"
        >
          <FilePlus size={12} /> Kodu Uygula
        </button>
      </div>
    </div>
  );
}
