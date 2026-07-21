import { useState, useEffect } from 'react';
import { X, Key, ExternalLink, Check, Cpu } from 'lucide-react';
import { type AISettings } from '../utils/ai';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AISettings;
  onSettingsChange: (s: AISettings) => void;
}

export function SettingsModal({ open, onClose, settings, onSettingsChange }: SettingsModalProps) {
  const [local, setLocal] = useState<AISettings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) setLocal(settings);
  }, [settings, open]);

  if (!open) return null;

  const handleSave = () => {
    onSettingsChange(local);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-coal-700 bg-coal-900 p-6 shadow-2xl animate-slide-up">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-400/15 text-accent-400">
              <Key size={18} />
            </div>
            <h2 className="text-base font-semibold text-coal-100">AI Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-coal-200">
              <Key size={13} /> OpenRouter API Key
            </label>
            <input
              type="password"
              value={local.apiKey}
              onChange={(e) => setLocal((s) => ({ ...s, apiKey: e.target.value }))}
              placeholder="sk-or-..."
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full rounded-lg border border-coal-700 bg-coal-850 px-3 py-2 text-sm text-coal-100 placeholder-coal-500 outline-none transition-colors focus:border-accent-400/50"
            />
            <p className="mt-1.5 text-xs text-coal-400">
              Get your key from{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-accent-400 hover:underline"
              >
                OpenRouter <ExternalLink size={10} />
              </a>
            </p>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-coal-200">
              <Cpu size={13} /> Model ID
            </label>
            <input
              type="text"
              value={local.model}
              onChange={(e) => setLocal((s) => ({ ...s, model: e.target.value }))}
              placeholder="google/gemma-4-31b-it:free"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full rounded-lg border border-coal-700 bg-coal-850 px-3 py-2 text-sm text-coal-100 placeholder-coal-500 outline-none transition-colors focus:border-accent-400/50"
            />
            <p className="mt-1.5 text-xs text-coal-400">
              Browse models at{' '}
              <a
                href="https://openrouter.ai/models"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-accent-400 hover:underline"
              >
                OpenRouter Models <ExternalLink size={10} />
              </a>
            </p>
          </div>

          <button
            onClick={handleSave}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-400 px-4 py-2.5 text-sm font-medium text-coal-950 transition-colors hover:bg-accent-300"
          >
            {saved ? (
              <>
                <Check size={16} /> Saved!
              </>
            ) : (
              'Save Settings'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
