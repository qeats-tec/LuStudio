import { Files, Search, Settings as SettingsIcon, Sparkles, FileCode2 } from 'lucide-react';
import type { SidebarView } from '../types';

interface SidebarProps {
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
  onOpenSettings: () => void;
  onOpenAI: () => void;
}

export function Sidebar({ view, onViewChange, onOpenSettings, onOpenAI }: SidebarProps) {
  const items: { id: SidebarView; icon: typeof Files; label: string }[] = [
    { id: 'explorer', icon: Files, label: 'Explorer' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'extensions', icon: FileCode2, label: 'Extensions' },
  ];

  return (
    <div className="flex w-12 flex-col items-center gap-1 border-r border-coal-800 bg-coal-900 py-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active = view === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            title={item.label}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              active ? 'bg-coal-800 text-accent-400' : 'text-coal-400 hover:text-coal-100'
            }`}
          >
            <Icon size={18} />
          </button>
        );
      })}
      <div className="flex-1" />
      <button
        onClick={onOpenAI}
        title="AI Assistant"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-coal-400 transition-colors hover:bg-coal-800 hover:text-accent-400"
      >
        <Sparkles size={18} />
      </button>
      <button
        onClick={onOpenSettings}
        title="Settings"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100"
      >
        <SettingsIcon size={18} />
      </button>
    </div>
  );
}
