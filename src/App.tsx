import { useState, useCallback, useEffect } from 'react';
import {
  Plus, FilePlus, FolderPlus,
  ChevronRight, ChevronDown, X, Save,
  Terminal as TerminalIcon, Trash2, ArrowLeft,
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { AIAssistant } from './components/AIAssistant';
import { TerminalPanel } from './components/TerminalPanel';
import { ProjectDashboard } from './components/ProjectDashboard';
import { type AISettings } from './utils/ai';
import type { FileNode, EditorTab, ChatMessage, AIFileAction, SidebarView, Project } from './types';

const STORAGE_KEY_AI = 'lustudio_ai_settings';
const STORAGE_KEY_PROJECTS = 'lustudio_projects';
const STORAGE_KEY_ACTIVE = 'lustudio_active_project';

function genId() {
  return crypto.randomUUID();
}

function getExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function langForFile(name: string): string {
  const ext = getExt(name);
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', css: 'css', html: 'html', md: 'markdown',
    py: 'python', go: 'go', rs: 'rust', txt: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

function createFileNode(name: string, path: string, content = ''): FileNode {
  return { id: genId(), name, type: 'file', path, content, language: langForFile(name) };
}

function flattenFiles(nodes: FileNode[], prefix = ''): string[] {
  const result: string[] = [];
  for (const n of nodes) {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === 'folder') result.push(...flattenFiles(n.children ?? [], p));
    else result.push(p);
  }
  return result;
}

function findNode(nodes: FileNode[], path: string): FileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.type === 'folder' && n.children) {
      const found = findNode(n.children, path);
      if (found) return found;
    }
  }
  return null;
}

function updateNodeContent(nodes: FileNode[], path: string, content: string): FileNode[] {
  return nodes.map((n) => {
    if (n.path === path) return { ...n, content };
    if (n.type === 'folder' && n.children) return { ...n, children: updateNodeContent(n.children, path, content) };
    return n;
  });
}

function FileTreeItem({
  node, depth, expanded, onToggle, onOpen, onDelete, activePath,
}: {
  node: FileNode; depth: number; expanded: Set<string>;
  onToggle: (path: string) => void; onOpen: (node: FileNode) => void;
  onDelete: (path: string) => void; activePath?: string;
}) {
  const [hovering, setHovering] = useState(false);
  const isExpanded = expanded.has(node.path);
  const paddingLeft = depth * 12 + 8;

  if (node.type === 'folder') {
    return (
      <div onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
        <div className="flex w-full items-center gap-1 py-1 text-left text-sm text-coal-300 hover:bg-coal-850" style={{ paddingLeft }}>
          <button onClick={() => onToggle(node.path)} className="flex flex-1 items-center gap-1">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-accent-400/80">{node.name}</span>
          </button>
          {hovering && (
            <button onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
              className="mr-1 rounded p-0.5 text-coal-500 transition-colors hover:bg-coal-700 hover:text-red-400">
              <Trash2 size={12} />
            </button>
          )}
        </div>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem key={child.id} node={child} depth={depth + 1} expanded={expanded}
                onToggle={onToggle} onOpen={onOpen} onDelete={onDelete} activePath={activePath} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
      onClick={() => onOpen(node)}
      className={`group flex w-full items-center gap-1.5 py-1 text-left text-sm transition-colors cursor-pointer ${
        activePath === node.path ? 'bg-coal-800 text-accent-400' : 'text-coal-300 hover:bg-coal-850'
      }`}
      style={{ paddingLeft: paddingLeft + 18 }}>
      <span className="truncate flex-1">{node.name}</span>
      {hovering && (
        <button onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
          className="mr-1 rounded p-0.5 text-coal-500 transition-colors hover:bg-coal-700 hover:text-red-400">
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (saved) { try { return JSON.parse(saved); } catch {} }
    return [];
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE) || null;
  });
  const [files, setFiles] = useState<FileNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [sidebarView, setSidebarView] = useState<SidebarView>('explorer');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AISettings>({ apiKey: '', model: '' });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // Load files when project changes
  useEffect(() => {
    if (activeProject) {
      setFiles(activeProject.files);
      setExpanded(new Set());
      setTabs([]);
      setActiveTabId(null);
    } else {
      setFiles([]);
      setTabs([]);
      setActiveTabId(null);
    }
  }, [activeProjectId]);

  // Persist projects whenever files change (debounced via effect)
  useEffect(() => {
    if (!activeProjectId) return;
    setProjects((prev) => prev.map((p) =>
      p.id === activeProjectId ? { ...p, files, updatedAt: Date.now() } : p
    ));
  }, [files]);

  // Persist projects list
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  }, [projects]);

  // Persist active project
  useEffect(() => {
    if (activeProjectId) localStorage.setItem(STORAGE_KEY_ACTIVE, activeProjectId);
    else localStorage.removeItem(STORAGE_KEY_ACTIVE);
  }, [activeProjectId]);

  // Load AI settings
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_AI);
    if (saved) { try { setAiSettings(JSON.parse(saved)); } catch {} }
  }, []);

  const handleAiSettingsChange = useCallback((s: AISettings) => {
    setAiSettings(s);
    localStorage.setItem(STORAGE_KEY_AI, JSON.stringify(s));
  }, []);

  // Project CRUD
  const handleCreateProject = useCallback((name: string) => {
    const project: Project = {
      id: genId(), name, createdAt: Date.now(), updatedAt: Date.now(), files: [],
    };
    setProjects((prev) => [project, ...prev]);
    setActiveProjectId(project.id);
  }, []);

  const handleDeleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProjectId === id) setActiveProjectId(null);
  }, [activeProjectId]);

  const handleRenameProject = useCallback((id: string, newName: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name: newName, updatedAt: Date.now() } : p)));
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setActiveProjectId(null);
  }, []);

  const handleToggleFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const handleOpenFile = useCallback((node: FileNode) => {
    const existing = tabs.find((t) => t.path === node.path);
    if (existing) { setActiveTabId(existing.id); return; }
    const tab: EditorTab = {
      id: genId(), name: node.name, path: node.path,
      content: node.content ?? '', language: node.language ?? 'plaintext', dirty: false,
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  }, [tabs]);

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(next[idx]?.id ?? next[idx - 1]?.id ?? next[0]?.id ?? null);
      }
      return next;
    });
  }, [activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeTabId) return;
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, content: value ?? '', dirty: true } : t)));
  }, [activeTabId]);

  const handleSave = useCallback(() => {
    if (!activeTab) return;
    setFiles((prev) => updateNodeContent(prev, activeTab.path, activeTab.content));
    setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? { ...t, dirty: false } : t)));
  }, [activeTab]);

  const handleSaveAll = useCallback(() => {
    setFiles((prev) => {
      let updated = prev;
      for (const tab of tabs) { if (tab.dirty) updated = updateNodeContent(updated, tab.path, tab.content); }
      return updated;
    });
    setTabs((prev) => prev.map((t) => ({ ...t, dirty: false })));
  }, [tabs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSaveAll(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSaveAll]);

  const handleNewFile = useCallback(() => {
    const name = prompt('File name (e.g. App.tsx):');
    if (!name) return;
    const node = createFileNode(name, name, '');
    setFiles((prev) => [...prev, node]);
    handleOpenFile(node);
  }, [handleOpenFile]);

  const handleDeleteNode = useCallback((path: string) => {
    if (!confirm(`Delete "${path}"?`)) return;
    setFiles((prev) => {
      const filterNodes = (nodes: FileNode[]): FileNode[] =>
        nodes.filter((n) => n.path !== path).map((n) =>
          n.type === 'folder' && n.children ? { ...n, children: filterNodes(n.children) } : n
        );
      return filterNodes(prev);
    });
    setTabs((prev) => {
      const filtered = prev.filter((t) => !t.path.startsWith(path + '/') && t.path !== path);
      if (activeTabId && !filtered.find((t) => t.id === activeTabId)) {
        setActiveTabId(filtered[0]?.id ?? null);
      }
      return filtered;
    });
  }, [activeTabId]);

  const handleApplyFiles = useCallback((actions: AIFileAction[]) => {
    setFiles((prev) => {
      let updated = prev;
      for (const action of actions) {
        const existing = findNode(updated, action.path);
        if (existing) {
          updated = updateNodeContent(updated, action.path, action.content);
        } else {
          const newNode = createFileNode(action.path.split('/').pop() ?? action.path, action.path, action.content);
          newNode.language = action.language;
          updated = [...updated, newNode];
        }
      }
      return updated;
    });
    if (actions.length > 0) {
      const first = actions[0];
      setTimeout(() => {
        setFiles((prev) => {
          const n = findNode(prev, first.path);
          if (n) handleOpenFile(n);
          return prev;
        });
      }, 50);
    }
  }, [handleOpenFile]);

  const fileList = flattenFiles(files);
  const searchResults = searchQuery
    ? fileList.filter((f) => f.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  // Dashboard view
  if (!activeProject) {
    return (
      <ProjectDashboard
        projects={projects}
        onOpenProject={setActiveProjectId}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onRenameProject={handleRenameProject}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-coal-950">
      <div className="flex h-10 items-center justify-between border-b border-coal-800 bg-coal-900 px-3">
        <div className="flex items-center gap-2">
          <button onClick={handleBackToDashboard}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-sm text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100">
            <ArrowLeft size={16} />
          </button>
          <div className="flex h-6 w-6 items-center justify-center rounded bg-accent-400 text-xs font-bold text-coal-950">L</div>
          <span className="text-sm font-semibold text-coal-100">{activeProject.name}</span>
          {activeTab?.dirty && <span className="text-xs text-coal-500">— unsaved changes</span>}
        </div>
        <div className="flex items-center gap-2">
          {aiSettings.apiKey ? (
            <span className="flex items-center gap-1 text-xs text-accent-400">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" /> AI Ready
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-coal-500">
              <span className="h-1.5 w-1.5 rounded-full bg-coal-600" /> AI Off
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          view={sidebarView}
          onViewChange={setSidebarView}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAI={() => setAiOpen(true)}
        />

        <div className="flex w-56 flex-col border-r border-coal-800 bg-coal-900">
          {sidebarView === 'explorer' && (
            <>
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-coal-400">Explorer</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={handleNewFile}
                    className="rounded p-1 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100">
                    <FilePlus size={14} />
                  </button>
                  <button className="rounded p-1 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100">
                    <FolderPlus size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {files.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-coal-500">No files yet. Create one to get started.</div>
                ) : files.map((node) => (
                  <FileTreeItem key={node.id} node={node} depth={0} expanded={expanded}
                    onToggle={handleToggleFolder} onOpen={handleOpenFile} onDelete={handleDeleteNode}
                    activePath={activeTab?.path} />
                ))}
              </div>
            </>
          )}
          {sidebarView === 'search' && (
            <>
              <div className="px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-coal-400">Search</span>
              </div>
              <div className="px-3 pb-2">
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files..."
                  className="w-full rounded-lg border border-coal-700 bg-coal-850 px-2.5 py-1.5 text-sm text-coal-100 placeholder-coal-500 outline-none focus:border-accent-400/50" />
              </div>
              <div className="flex-1 overflow-y-auto px-2">
                {searchResults.map((f) => (
                  <button key={f} onClick={() => { const node = findNode(files, f); if (node) handleOpenFile(node); }}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm text-coal-300 hover:bg-coal-850">
                    <span className="truncate">{f}</span>
                  </button>
                ))}
                {searchQuery && searchResults.length === 0 && <p className="px-2 py-2 text-xs text-coal-500">No results</p>}
              </div>
            </>
          )}
          {sidebarView === 'extensions' && (
            <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
              <p className="text-sm text-coal-400">Extensions</p>
              <p className="mt-1 text-xs text-coal-500">No extensions installed.</p>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-hidden">
          {tabs.length > 0 && (
            <div className="flex h-9 items-center border-b border-coal-800 bg-coal-900">
              {tabs.map((tab) => (
                <div key={tab.id}
                  className={`flex h-full items-center gap-1.5 border-r border-coal-800 px-3 text-sm transition-colors cursor-pointer ${
                    activeTabId === tab.id ? 'bg-coal-950 text-coal-100' : 'text-coal-400 hover:bg-coal-850'
                  }`}
                  onClick={() => setActiveTabId(tab.id)}>
                  <span>{tab.name}</span>
                  {tab.dirty && <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />}
                  <button onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
                    className="rounded p-0.5 text-coal-500 transition-colors hover:bg-coal-700 hover:text-coal-100">
                    <X size={12} />
                  </button>
                </div>
              ))}
              <div className="flex-1" />
              <button onClick={handleSave}
                className="flex h-full items-center gap-1 px-3 text-xs text-coal-400 transition-colors hover:bg-coal-850 hover:text-coal-100">
                <Save size={14} /> Save
              </button>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            {activeTab ? (
              <Editor value={activeTab.content} language={activeTab.language} onChange={handleEditorChange}
                theme="vs-dark"
                options={{
                  fontSize: 14, fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                  minimap: { enabled: false }, scrollBeyondLastLine: false,
                  padding: { top: 12, bottom: 12 }, lineNumbers: 'on', tabSize: 2, automaticLayout: true,
                }} />
            ) : (
              <div className="flex h-full items-center justify-center text-coal-500">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-coal-850">
                    <Plus size={28} className="text-coal-600" />
                  </div>
                  <p className="text-sm">Open a file or create a new one to start coding</p>
                </div>
              </div>
            )}
          </div>

          <div className={terminalOpen ? 'h-48 border-t border-coal-800' : 'h-9 border-t border-coal-800'}>
            <TerminalPanel open={terminalOpen} onToggle={() => setTerminalOpen((o) => !o)} />
          </div>
        </div>
      </div>

      <div className="flex h-6 items-center justify-between border-t border-coal-800 bg-coal-900 px-3 text-xs text-coal-400">
        <div className="flex items-center gap-3">
          <button onClick={() => setTerminalOpen((o) => !o)}
            className="flex items-center gap-1 transition-colors hover:text-coal-100">
            <TerminalIcon size={12} /> Terminal
          </button>
          {activeTab && <span>{activeTab.language}</span>}
        </div>
      </div>

      <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)}
        messages={chatMessages} onMessagesChange={setChatMessages}
        aiSettings={aiSettings}
        onOpenSettings={() => { setAiOpen(false); setSettingsOpen(true); }}
        selectedCode="" activeLanguage={activeTab?.language ?? 'plaintext'}
        fileList={fileList} onApplyFiles={handleApplyFiles} />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)}
        settings={aiSettings} onSettingsChange={handleAiSettingsChange} />
    </div>
  );
}
