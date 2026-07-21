import { useState } from 'react';
import { Plus, Trash2, Pencil, FolderOpen, Clock, Check, X } from 'lucide-react';
import type { Project } from '../types';

interface ProjectDashboardProps {
  projects: Project[];
  onOpenProject: (id: string) => void;
  onCreateProject: (name: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function countFiles(project: Project): number {
  let count = 0;
  const walk = (nodes: typeof project.files) => {
    for (const n of nodes) {
      if (n.type === 'file') count++;
      else if (n.children) walk(n.children);
    }
  };
  walk(project.files);
  return count;
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
  onRename,
}: {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const [hovering, setHovering] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);

  const submitRename = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== project.name) onRename(trimmed);
    else setName(project.name);
    setRenaming(false);
  };

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="group relative flex flex-col gap-3 rounded-2xl border border-coal-800 bg-coal-900 p-5 transition-all duration-200 hover:border-coal-700 hover:bg-coal-850"
    >
      <div className="flex items-start justify-between">
        <button onClick={onOpen} className="flex items-start gap-3 text-left">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-400/10 text-accent-400 transition-colors group-hover:bg-accent-400/20">
            <FolderOpen size={20} />
          </div>
        </button>
        {hovering && !renaming && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setName(project.name); setRenaming(true); }}
              className="rounded-lg p-1.5 text-coal-400 transition-colors hover:bg-coal-700 hover:text-coal-100"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={onDelete}
              className="rounded-lg p-1.5 text-coal-400 transition-colors hover:bg-coal-700 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {renaming ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') { setName(project.name); setRenaming(false); } }}
            className="flex-1 rounded-lg border border-accent-400/50 bg-coal-800 px-2 py-1 text-sm font-semibold text-coal-100 outline-none"
          />
          <button onClick={submitRename} className="rounded-lg p-1 text-accent-400 hover:bg-coal-700"><Check size={16} /></button>
          <button onClick={() => { setName(project.name); setRenaming(false); }} className="rounded-lg p-1 text-coal-400 hover:bg-coal-700"><X size={16} /></button>
        </div>
      ) : (
        <button onClick={onOpen} className="text-left">
          <h3 className="truncate text-base font-semibold text-coal-100">{project.name}</h3>
        </button>
      )}

      <div className="flex items-center gap-4 text-xs text-coal-500">
        <span className="flex items-center gap-1">
          <FolderOpen size={12} /> {countFiles(project)} files
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} /> {timeAgo(project.updatedAt)}
        </span>
      </div>
    </div>
  );
}

export function ProjectDashboard({
  projects,
  onOpenProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
}: ProjectDashboardProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateProject(trimmed);
    setNewName('');
    setShowCreate(false);
  };

  return (
    <div className="flex h-full flex-col bg-coal-950">
      <div className="flex h-14 items-center justify-between border-b border-coal-800 bg-coal-900 px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-400 text-sm font-bold text-coal-950">L</div>
          <span className="text-base font-semibold text-coal-100">LuStudio</span>
          <span className="ml-2 text-sm text-coal-500">— Project Hub</span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent-400 px-3.5 py-2 text-sm font-medium text-coal-950 transition-colors hover:bg-accent-300"
        >
          <Plus size={16} /> New Project
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {projects.length === 0 && !showCreate ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-coal-850">
              <FolderOpen size={36} className="text-coal-600" />
            </div>
            <h2 className="text-xl font-semibold text-coal-200">No projects yet</h2>
            <p className="mt-1.5 text-sm text-coal-500">Create your first project to get started.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-5 flex items-center gap-1.5 rounded-lg bg-accent-400 px-4 py-2.5 text-sm font-medium text-coal-950 transition-colors hover:bg-accent-300"
            >
              <Plus size={16} /> Create Project
            </button>
          </div>
        ) : (
          <>
            {showCreate && (
              <div className="mb-5 flex items-center gap-2 rounded-2xl border border-accent-400/30 bg-coal-900 p-4 animate-slide-up">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreate(false); setNewName(''); } }}
                  placeholder="Project name (e.g. My Cool App)"
                  className="flex-1 rounded-lg border border-coal-700 bg-coal-850 px-3 py-2 text-sm text-coal-100 placeholder-coal-500 outline-none focus:border-accent-400/50"
                />
                <button onClick={handleCreate} className="rounded-lg bg-accent-400 px-4 py-2 text-sm font-medium text-coal-950 transition-colors hover:bg-accent-300">Create</button>
                <button onClick={() => { setShowCreate(false); setNewName(''); }} className="rounded-lg px-3 py-2 text-sm text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100">Cancel</button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  onOpen={() => onOpenProject(p.id)}
                  onDelete={() => {
                    if (confirm(`Delete project "${p.name}" and all its files?`)) onDeleteProject(p.id);
                  }}
                  onRename={(name) => onRenameProject(p.id, name)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
