import { useState, useCallback, useEffect } from 'react';
import { Plus, FilePlus, FolderPlus, ChevronRight, ChevronDown, X, Save, Terminal as TerminalIcon, Trash2, ArrowLeft, Eye, Code as Code2, Zap, RefreshCw } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { AIAssistant } from './components/AIAssistant';
import { TerminalPanel } from './components/TerminalPanel';
import { ProjectDashboard } from './components/ProjectDashboard';
import { LivePreviewPanel } from './components/LivePreviewPanel';
import { VisitorCounter } from './components/VisitorCounter';
import { type AISettings } from './utils/ai';
import type { FileNode, EditorTab, ChatMessage, AIFileAction, AIStructuredAction, SidebarView } from './types';
import {
  fetchTree, fetchFileContent, saveFile, createFileOrFolder, deleteFile,
  serverNodeToFileNode, flattenFiles, findNode, langForFile,
} from './lib/filesystem';

const STORAGE_KEY_AI = 'lustudio_ai_settings';
const STORAGE_KEY_PROJECTS = 'lustudio_projects';
const STORAGE_KEY_ACTIVE = 'lustudio_active_project';

function genId() {
  return crypto.randomUUID();
}

function resolveActionPath(actionPath: string, name: string): string {
  let p = actionPath.trim();
  if (p === '/' || p === '') return name;
  if (p.endsWith('/')) p = p.slice(0, -1);
  if (p.startsWith('/')) p = p.slice(1);
  return `${p}/${name}`;
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

  // Server filesystem state — replaces the old in-memory file tree
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
  const [mainView, setMainView] = useState<'editor' | 'preview' | 'split'>('editor');
  const [autoRun, setAutoRun] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // Fetch the real file tree from the server filesystem
  const refreshTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const { tree } = await fetchTree();
      setFiles(tree.map(serverNodeToFileNode));
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setTreeLoading(false);
    }
  }, []);

  // Load tree on mount (when a project is active)
  useEffect(() => {
    if (activeProject) {
      refreshTree();
    } else {
      setFiles([]);
      setTabs([]);
      setActiveTabId(null);
    }
  }, [activeProjectId]);

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

  const handleOpenFile = useCallback(async (node: FileNode) => {
    const existing = tabs.find((t) => t.path === node.path);
    if (existing) { setActiveTabId(existing.id); return; }

    // Fetch content from server
    let content = node.content ?? '';
    try {
      content = await fetchFileContent(node.path);
    } catch {
      // use cached content if fetch fails
    }

    const tab: EditorTab = {
      id: genId(), name: node.name, path: node.path,
      content, language: node.language ?? langForFile(node.name), dirty: false,
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

  const handleSave = useCallback(async () => {
    if (!activeTab) return;
    try {
      await saveFile(activeTab.path, activeTab.content);
      setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? { ...t, dirty: false } : t)));
    } catch (err) {
      console.error('Save failed:', err);
    }
  }, [activeTab]);

  const handleSaveAll = useCallback(async () => {
    const dirtyTabs = tabs.filter((t) => t.dirty);
    for (const tab of dirtyTabs) {
      try {
        await saveFile(tab.path, tab.content);
      } catch (err) {
        console.error('Save failed:', err);
      }
    }
    setTabs((prev) => prev.map((t) => ({ ...t, dirty: false })));
  }, [tabs]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSaveAll(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSaveAll]);

  const handleNewFile = useCallback(async () => {
    const name = prompt('File name (e.g. App.tsx):');
    if (!name) return;
    try {
      await createFileOrFolder(name, 'file');
      await refreshTree();
      const node = findNode(files, name);
      if (node) handleOpenFile(node);
    } catch (err) {
      console.error('Create file failed:', err);
    }
  }, [refreshTree, files, handleOpenFile]);

  const handleDeleteNode = useCallback(async (filePath: string) => {
    if (!confirm(`Delete "${filePath}"?`)) return;
    try {
      await deleteFile(filePath);
      await refreshTree();
      setTabs((prev) => {
        const filtered = prev.filter((t) => !t.path.startsWith(filePath + '/') && t.path !== filePath);
        if (activeTabId && !filtered.find((t) => t.id === activeTabId)) {
          setActiveTabId(filtered[0]?.id ?? null);
        }
        return filtered;
      });
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [refreshTree, activeTabId]);

  const handleApplyFiles = useCallback(async (actions: AIFileAction[]) => {
    for (const action of actions) {
      try {
        await saveFile(action.path, action.content);
      } catch (err) {
        console.error('Apply file failed:', err);
      }
    }
    await refreshTree();
    if (actions.length > 0) {
      const first = actions[0];
      setTimeout(() => {
        refreshTree().then(() => {
          setFiles((prev) => {
            const n = findNode(prev, first.path);
            if (n) handleOpenFile(n);
            return prev;
          });
        });
      }, 50);
    }
  }, [refreshTree, handleOpenFile]);

  const handleApplyStructured = useCallback(async (actions: AIStructuredAction[]) => {
    for (const action of actions) {
      try {
        if (action.action === 'create_folder') {
          const fullPath = resolveActionPath(action.path, action.name);
          await createFileOrFolder(fullPath, 'folder');
        } else if (action.action === 'create_file') {
          const fullPath = resolveActionPath(action.path, action.name);
          await saveFile(fullPath, action.content);
        }
      } catch (err) {
        console.error('Apply structured failed:', err);
      }
    }
    await refreshTree();
    const firstFile = actions.find((a) => a.action === 'create_file');
    if (firstFile && firstFile.action === 'create_file') {
      const fullPath = resolveActionPath(firstFile.path, firstFile.name);
      setTimeout(() => {
        setFiles((prev) => {
          const n = findNode(prev, fullPath);
          if (n) handleOpenFile(n);
          return prev;
        });
      }, 50);
    }
  }, [refreshTree, handleOpenFile]);

  const fileList = flattenFiles(files);
  const searchResults = searchQuery
    ? fileList.filter((f) => f.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  // Dashboard view
  if (!activeProject) {
    return (
      <>
        <ProjectDashboard
          projects={projects}
          onOpenProject={setActiveProjectId}
          onCreateProject={handleCreateProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
        />
        <div className="pointer-events-none fixed bottom-4 right-4 z-50">
          <div className="pointer-events-auto rounded-full border border-coal-800 bg-coal-900/80 px-3 py-1.5 shadow-lg backdrop-blur-sm">
            <VisitorCounter />
          </div>
        </div>
      </>
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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5 rounded-md bg-coal-850 p-0.5">
            <button onClick={() => setMainView('editor')} title="Editör"
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${mainView === 'editor' ? 'bg-coal-700 text-accent-400' : 'text-coal-400 hover:text-coal-200'}`}>
              <Code2 size={12} /> Editör
            </button>
            <button onClick={() => setMainView('split')} title="Bölünmüş"
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${mainView === 'split' ? 'bg-coal-700 text-accent-400' : 'text-coal-400 hover:text-coal-200'}`}>
              <Plus size={12} /> Böl
            </button>
            <button onClick={() => setMainView('preview')} title="Önizleme"
              className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${mainView === 'preview' ? 'bg-coal-700 text-accent-400' : 'text-coal-400 hover:text-coal-200'}`}>
              <Eye size={12} /> Önizle
            </button>
          </div>
          <button onClick={() => setAutoRun((a) => !a)} title={autoRun ? 'Otomatik çalıştırma açık' : 'Otomatik çalıştırma kapalı'}
            className={`flex items-center gap-1 text-xs transition-colors ${autoRun ? 'text-accent-400' : 'text-coal-500 hover:text-coal-300'}`}>
            <Zap size={12} /> Auto
          </button>
          {aiSettings.apiKey ? (
            <span className="flex items-center gap-1 text-xs text-accent-400">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-400" /> AI Ready
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-coal-500">
              <span className="h-1.5 w-1.5 rounded-full bg-coal-600" /> AI Off
            </span>
          )}
          <VisitorCounter />
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
                  <button onClick={refreshTree} title="Refresh"
                    className="rounded p-1 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100">
                    <RefreshCw size={14} className={treeLoading ? 'animate-spin' : ''} />
                  </button>
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
                {treeError ? (
                  <div className="px-3 py-6 text-center text-xs text-red-400">{treeError}</div>
                ) : files.length === 0 && !treeLoading ? (
                  <div className="px-3 py-6 text-center text-xs text-coal-500">No files found.</div>
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

          <div className="flex flex-1 overflow-hidden">
            {(mainView === 'editor' || mainView === 'split') && (
              <div className={`flex flex-col overflow-hidden ${mainView === 'split' ? 'flex-1 border-r border-coal-800' : 'flex-1'}`}>
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
            )}

            {(mainView === 'preview' || mainView === 'split') && (
              <div className={mainView === 'split' ? 'flex-1' : 'flex-1'}>
                <LivePreviewPanel files={files} activeTabName={activeTab?.name ?? null} autoRun={autoRun} />
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
        fileList={fileList} onApplyFiles={handleApplyFiles}
        onApplyStructured={handleApplyStructured} />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)}
        settings={aiSettings} onSettingsChange={handleAiSettingsChange} />
    </div>
  );
}

// Need to import Project type
import type { Project } from './types';
