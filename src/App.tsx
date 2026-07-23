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
import type { FileNode, EditorTab, ChatMessage, AIFileAction, AIStructuredAction, SidebarView, Project } from './types';
import { flattenFiles, findNode, langForFile, syncToDisk, fetchDiskTree, mergeDiskIntoLocal } from './lib/filesystem';

const STORAGE_KEY_AI = 'lustudio_ai_settings';
const STORAGE_KEY_PROJECTS = 'lustudio_projects';
const STORAGE_KEY_ACTIVE = 'lustudio_active_project';

function genId() {
  return crypto.randomUUID();
}

function createFileNode(name: string, path: string, content = ''): FileNode {
  return { id: genId(), name, type: 'file', path, content, language: langForFile(name) };
}

function createFolderNode(name: string, path: string): FileNode {
  return { id: genId(), name, type: 'folder', path, children: [] };
}

function updateNodeContent(nodes: FileNode[], path: string, content: string): FileNode[] {
  return nodes.map((n) => {
    if (n.path === path) return { ...n, content };
    if (n.type === 'folder' && n.children) return { ...n, children: updateNodeContent(n.children, path, content) };
    return n;
  });
}

function resolveActionPath(actionPath: string, name: string): string {
  let p = actionPath.trim();
  if (p === '/' || p === '') return name;
  if (p.endsWith('/')) p = p.slice(0, -1);
  if (p.startsWith('/')) p = p.slice(1);
  return `${p}/${name}`;
}

function ensureFolderPath(nodes: FileNode[], fullPath: string): FileNode[] {
  const parts = fullPath.split('/').filter(Boolean);
  if (parts.length <= 1) return nodes;
  const folderParts = parts.slice(0, -1);
  let currentNodes = nodes;
  let currentPath = '';
  for (const part of folderParts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const existing = currentNodes.find((n) => n.path === currentPath && n.type === 'folder');
    if (!existing) {
      const newFolder = createFolderNode(part, currentPath);
      currentNodes = [...currentNodes, newFolder];
    }
  }
  return currentNodes;
}

function FileTreeItem({
  node, depth, expanded, onToggle, onOpen, onDelete, onNewFile, onNewFolder, activePath,
}: {
  node: FileNode; depth: number; expanded: Set<string>;
  onToggle: (path: string) => void; onOpen: (node: FileNode) => void;
  onDelete: (path: string) => void; onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void; activePath?: string;
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
            <div className="mr-1 flex items-center gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); onNewFile(node.path); }}
                className="rounded p-0.5 text-coal-500 transition-colors hover:bg-coal-700 hover:text-coal-100">
                <FilePlus size={12} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onNewFolder(node.path); }}
                className="rounded p-0.5 text-coal-500 transition-colors hover:bg-coal-700 hover:text-coal-100">
                <FolderPlus size={12} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
                className="rounded p-0.5 text-coal-500 transition-colors hover:bg-coal-700 hover:text-red-400">
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
        {isExpanded && node.children && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem key={child.id} node={child} depth={depth + 1} expanded={expanded}
                onToggle={onToggle} onOpen={onOpen} onDelete={onDelete}
                onNewFile={onNewFile} onNewFolder={onNewFolder} activePath={activePath} />
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
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE) || null;
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set(['src']));
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

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // Update active project's files
  const updateActiveFiles = useCallback((updater: (files: FileNode[]) => FileNode[]) => {
    setProjects((prev) => prev.map((p) =>
      p.id === activeProjectId ? { ...p, files: updater(p.files), updatedAt: Date.now() } : p
    ));
  }, [activeProjectId]);

  // When a project is opened, sync its localStorage files to disk so the terminal can see them
  useEffect(() => {
    if (!activeProject) return;
    syncToDisk(activeProject.id, activeProject.files).catch((err) => console.error('syncToDisk failed:', err));
  }, [activeProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh Explorer from disk: pull files created in the terminal into localStorage
  const handleRefreshFromDisk = useCallback(async () => {
    if (!activeProject) return;
    setTreeLoading(true);
    try {
      const diskTree = await fetchDiskTree(activeProject.id);
      updateActiveFiles((localFiles) => mergeDiskIntoLocal(localFiles, diskTree));
    } catch (err) {
      console.error('Refresh from disk failed:', err);
    } finally {
      setTreeLoading(false);
    }
  }, [activeProject, updateActiveFiles]);

  // Persist projects
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    if (activeProjectId) localStorage.setItem(STORAGE_KEY_ACTIVE, activeProjectId);
    else localStorage.removeItem(STORAGE_KEY_ACTIVE);
  }, [activeProjectId]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_AI);
    if (saved) { try { setAiSettings(JSON.parse(saved)); } catch {} }
  }, []);

  const handleAiSettingsChange = useCallback((s: AISettings) => {
    setAiSettings(s);
    localStorage.setItem(STORAGE_KEY_AI, JSON.stringify(s));
  }, []);

  const handleCreateProject = useCallback((name: string) => {
    const project: Project = {
      id: genId(), name, createdAt: Date.now(), updatedAt: Date.now(),
      files: [
        { id: genId(), name: 'index.html', type: 'file', path: 'index.html',
          content: '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8" />\n  <title>My App</title>\n</head>\n<body>\n  <div id="root"></div>\n</body>\n</html>',
          language: 'html' },
      ],
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
      content: node.content ?? '', language: node.language ?? langForFile(node.name), dirty: false,
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
    if (!activeTab || !activeProject) return;
    updateActiveFiles((files) => updateNodeContent(files, activeTab.path, activeTab.content));
    // Also save to disk so the terminal can see the latest content
    syncToDisk(activeProject.id, [{ id: '', name: '', type: 'file', path: activeTab.path, content: activeTab.content, language: activeTab.language }]).catch(() => {});
    setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? { ...t, dirty: false } : t)));
  }, [activeTab, activeProject, updateActiveFiles]);

  const handleSaveAll = useCallback(() => {
    const dirtyTabs = tabs.filter((t) => t.dirty);
    if (dirtyTabs.length === 0 || !activeProject) return;
    updateActiveFiles((files) => {
      let result = files;
      for (const tab of dirtyTabs) {
        result = updateNodeContent(result, tab.path, tab.content);
      }
      return result;
    });
    setTabs((prev) => prev.map((t) => ({ ...t, dirty: false })));
  }, [tabs, activeProject, updateActiveFiles]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSaveAll(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSaveAll]);

  const handleNewFile = useCallback((parentPath: string) => {
    const name = prompt('File name:');
    if (!name) return;
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    const newNode = createFileNode(name, fullPath, '');
    updateActiveFiles((files) => {
      if (!parentPath) return [...files, newNode];
      const addChild = (nodes: FileNode[]): FileNode[] => nodes.map((n) => {
        if (n.path === parentPath && n.type === 'folder') {
          return { ...n, children: [...(n.children ?? []), newNode], expanded: true };
        }
        if (n.type === 'folder' && n.children) return { ...n, children: addChild(n.children) };
        return n;
      });
      return addChild(files);
    });
    setExpanded((prev) => new Set(prev).add(parentPath));
    handleOpenFile(newNode);
  }, [updateActiveFiles, handleOpenFile]);

  const handleNewFolder = useCallback((parentPath: string) => {
    const name = prompt('Folder name:');
    if (!name) return;
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    const newNode = createFolderNode(name, fullPath);
    updateActiveFiles((files) => {
      if (!parentPath) return [...files, newNode];
      const addChild = (nodes: FileNode[]): FileNode[] => nodes.map((n) => {
        if (n.path === parentPath && n.type === 'folder') {
          return { ...n, children: [...(n.children ?? []), newNode] };
        }
        if (n.type === 'folder' && n.children) return { ...n, children: addChild(n.children) };
        return n;
      });
      return addChild(files);
    });
    setExpanded((prev) => new Set(prev).add(parentPath));
  }, [updateActiveFiles]);

  const handleNewRootFile = useCallback(() => {
    const name = prompt('File name (e.g. App.tsx):');
    if (!name) return;
    const newNode = createFileNode(name, name, '');
    updateActiveFiles((files) => [...files, newNode]);
    handleOpenFile(newNode);
  }, [updateActiveFiles, handleOpenFile]);

  const handleDeleteNode = useCallback((filePath: string) => {
    if (!confirm(`Delete "${filePath}"?`)) return;
    updateActiveFiles((files) => {
      const remove = (nodes: FileNode[]): FileNode[] =>
        nodes.filter((n) => n.path !== filePath).map((n) =>
          n.type === 'folder' && n.children ? { ...n, children: remove(n.children) } : n
        );
      return remove(files);
    });
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.path !== filePath && !t.path.startsWith(filePath + '/'));
      if (activeTabId && !filtered.find((t) => t.id === activeTabId)) {
        setActiveTabId(filtered[0]?.id ?? null);
      }
      return filtered;
    });
  }, [updateActiveFiles, activeTabId]);

  const handleApplyFiles = useCallback((actions: AIFileAction[]) => {
    updateActiveFiles((files) => {
      let result = files;
      for (const action of actions) {
        result = updateNodeContent(result, action.path, action.content);
      }
      return result;
    });
    if (actions.length > 0) {
      const first = actions[0];
      setTimeout(() => {
        setProjects((prev) => {
          const proj = prev.find((p) => p.id === activeProjectId);
          if (proj) {
            const node = findNode(proj.files, first.path);
            if (node) handleOpenFile(node);
          }
          return prev;
        });
      }, 50);
    }
  }, [updateActiveFiles, activeProjectId, handleOpenFile]);

  const handleApplyStructured = useCallback((actions: AIStructuredAction[]) => {
    updateActiveFiles((files) => {
      let result = files;
      for (const action of actions) {
        const fullPath = resolveActionPath(action.path, action.name);
        if (action.action === 'create_folder') {
          const existing = findNode(result, fullPath);
          if (!existing) {
            const newFolder = createFolderNode(action.name, fullPath);
            result = [...result, newFolder];
          }
        } else if (action.action === 'create_file') {
          const existing = findNode(result, fullPath);
          if (existing) {
            result = updateNodeContent(result, fullPath, action.content);
          } else {
            result = ensureFolderPath(result, fullPath);
            const newFile = createFileNode(action.name, fullPath, action.content);
            result = [...result, newFile];
          }
        }
      }
      return result;
    });
    const firstFile = actions.find((a) => a.action === 'create_file');
    if (firstFile && firstFile.action === 'create_file') {
      const fullPath = resolveActionPath(firstFile.path, firstFile.name);
      setTimeout(() => {
        setProjects((prev) => {
          const proj = prev.find((p) => p.id === activeProjectId);
          if (proj) {
            const node = findNode(proj.files, fullPath);
            if (node) handleOpenFile(node);
          }
          return prev;
        });
      }, 50);
    }
  }, [updateActiveFiles, activeProjectId, handleOpenFile]);

  const fileList = activeProject ? flattenFiles(activeProject.files) : [];
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
                  <button onClick={handleRefreshFromDisk} title="Sync from terminal"
                    className="rounded p-1 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100">
                    <RefreshCw size={14} className={treeLoading ? 'animate-spin' : ''} />
                  </button>
                  <button onClick={handleNewRootFile} title="New file"
                    className="rounded p-1 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100">
                    <FilePlus size={14} />
                  </button>
                  <button onClick={() => handleNewFolder('')} title="New folder"
                    className="rounded p-1 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100">
                    <FolderPlus size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {activeProject.files.map((node) => (
                  <FileTreeItem key={node.id} node={node} depth={0} expanded={expanded}
                    onToggle={handleToggleFolder} onOpen={handleOpenFile} onDelete={handleDeleteNode}
                    onNewFile={handleNewFile} onNewFolder={handleNewFolder}
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
                {searchResults.map((fp) => (
                  <button key={fp} onClick={() => {
                    const node = findNode(activeProject.files, fp);
                    if (node) handleOpenFile(node);
                  }}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm text-coal-300 hover:bg-coal-850">
                    <span className="truncate">{fp}</span>
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
                <LivePreviewPanel files={activeProject.files} activeTabName={activeTab?.name ?? null} autoRun={autoRun} />
              </div>
            )}
          </div>

          <div className={terminalOpen ? 'h-48 border-t border-coal-800' : 'h-9 border-t border-coal-800'}>
            <TerminalPanel open={terminalOpen} onToggle={() => setTerminalOpen((o) => !o)} projectId={activeProject.id} onRefreshFiles={handleRefreshFromDisk} />
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
