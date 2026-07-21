import { useState } from 'react';
import {
  ChevronRight, ChevronDown, File as FileIcon, Folder, FolderOpen,
  FileCode, FileText, FileType2, Braces, Trash2, Pencil,
} from 'lucide-react';
import type { FileNode } from '../types';

interface FileTreeProps {
  nodes: FileNode[];
  activePath: string | null;
  onFileOpen: (node: FileNode) => void;
  onDeleteNode: (path: string) => void;
  onRenameNode: (path: string, newName: string) => void;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx': case 'ts': case 'jsx': case 'js': return FileCode;
    case 'json': return Braces;
    case 'css': return FileType2;
    case 'md': return FileText;
    default: return FileIcon;
  }
}

export function getLanguage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    tsx: 'tsx', ts: 'typescript', jsx: 'jsx', js: 'javascript',
    json: 'json', css: 'css', html: 'html', md: 'markdown',
  };
  return map[ext] ?? 'plaintext';
}

function TreeNode({ node, depth, activePath, onFileOpen, onDeleteNode, onRenameNode }: {
  node: FileNode; depth: number; activePath: string | null;
  onFileOpen: (n: FileNode) => void; onDeleteNode: (p: string) => void; onRenameNode: (p: string, n: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const [hovering, setHovering] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(node.name);
  const isActive = node.type === 'file' && activePath === node.path;
  const Icon = getFileIcon(node.name);

  const handleRename = () => {
    if (renameVal.trim() && renameVal !== node.name) onRenameNode(node.path, renameVal.trim());
    setRenaming(false);
  };

  if (node.type === 'folder') {
    return (
      <div onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
        <div
          onClick={() => setExpanded(!expanded)}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          className="flex w-full cursor-pointer items-center gap-1 py-1 pr-2 text-sm text-coal-200 transition-colors hover:bg-coal-850"
        >
          {expanded ? <ChevronDown size={14} className="text-coal-400 shrink-0" /> : <ChevronRight size={14} className="text-coal-400 shrink-0" />}
          {expanded ? <FolderOpen size={15} className="text-accent-400 shrink-0" /> : <Folder size={15} className="text-accent-400/70 shrink-0" />}
          {renaming ? (
            <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onBlur={handleRename}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 rounded bg-coal-700 px-1 py-0 text-sm text-coal-100 outline-none ring-1 ring-accent-400/50" />
          ) : <span className="truncate flex-1">{node.name}</span>}
          {hovering && !renaming && (
            <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { setRenameVal(node.name); setRenaming(true); }} className="rounded p-0.5 text-coal-400 hover:bg-coal-700 hover:text-coal-100"><Pencil size={12} /></button>
              <button onClick={() => onDeleteNode(node.path)} className="rounded p-0.5 text-coal-400 hover:bg-coal-700 hover:text-red-400"><Trash2 size={12} /></button>
            </div>
          )}
        </div>
        {expanded && node.children && (
          <div className="animate-fade-in">
            {node.children.map((child) => (
              <TreeNode key={child.id} node={child} depth={depth + 1} activePath={activePath}
                onFileOpen={onFileOpen} onDeleteNode={onDeleteNode} onRenameNode={onRenameNode} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
      onClick={() => onFileOpen(node)}
      style={{ paddingLeft: `${depth * 12 + 22}px` }}
      className={`flex w-full cursor-pointer items-center gap-1.5 py-1 pr-2 text-sm transition-colors ${isActive ? 'bg-coal-800 text-accent-400' : 'text-coal-200 hover:bg-coal-850'}`}>
      <Icon size={15} className="shrink-0 text-coal-300" />
      {renaming ? (
        <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onBlur={handleRename}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false); }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 rounded bg-coal-700 px-1 py-0 text-sm text-coal-100 outline-none ring-1 ring-accent-400/50" />
      ) : <span className="truncate flex-1">{node.name}</span>}
      {hovering && !renaming && (
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setRenameVal(node.name); setRenaming(true); }} className="rounded p-0.5 text-coal-400 hover:bg-coal-700 hover:text-coal-100"><Pencil size={12} /></button>
          <button onClick={() => onDeleteNode(node.path)} className="rounded p-0.5 text-coal-400 hover:bg-coal-700 hover:text-red-400"><Trash2 size={12} /></button>
        </div>
      )}
    </div>
  );
}

export function FileTree({ nodes, activePath, onFileOpen, onDeleteNode, onRenameNode }: FileTreeProps) {
  return (
    <div className="py-1">
      {nodes.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-coal-500">No files yet. Create one to get started.</div>
      ) : nodes.map((node) => (
        <TreeNode key={node.id} node={node} depth={0} activePath={activePath}
          onFileOpen={onFileOpen} onDeleteNode={onDeleteNode} onRenameNode={onRenameNode} />
      ))}
    </div>
  );
}
