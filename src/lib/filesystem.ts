import type { FileNode } from '../types';

const API_BASE = '/api';

export function getExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function langForFile(name: string): string {
  const ext = getExt(name);
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', css: 'css', html: 'html', md: 'markdown',
    py: 'python', go: 'go', rs: 'rust', txt: 'plaintext',
    sh: 'shell', yml: 'yaml', yaml: 'yaml', sql: 'sql',
  };
  return map[ext] ?? 'plaintext';
}

export function flattenFiles(nodes: FileNode[], prefix = ''): string[] {
  const result: string[] = [];
  for (const n of nodes) {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.type === 'folder') result.push(...flattenFiles(n.children ?? [], p));
    else result.push(p);
  }
  return result;
}

export function findNode(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const n of nodes) {
    if (n.path === targetPath) return n;
    if (n.type === 'folder' && n.children) {
      const found = findNode(n.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

// ── Workspace sync (disk ↔ localStorage) ─────────────────────────────────

export interface ServerFileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: ServerFileNode[];
}

function serverNodeToFileNode(node: ServerFileNode): FileNode {
  return {
    id: node.path,
    name: node.name,
    type: node.type,
    path: node.path,
    language: node.type === 'file' ? langForFile(node.name) : undefined,
    children: node.children?.map(serverNodeToFileNode),
  };
}

/** Push localStorage files → disk workspace so the terminal can see them. */
export async function syncToDisk(projectId: string, files: FileNode[]): Promise<void> {
  const flat: Array<{ path: string; content: string; type: string }> = [];
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === 'file') {
        flat.push({ path: n.path, content: n.content ?? '', type: 'file' });
      } else if (n.children) {
        walk(n.children);
      }
    }
  };
  walk(files);
  await fetch(`${API_BASE}/workspace/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: flat }),
  });
}

/** Pull disk workspace tree → FileNode[] for the Explorer. */
export async function fetchDiskTree(projectId: string): Promise<FileNode[]> {
  const res = await fetch(`${API_BASE}/workspace/${projectId}/tree`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.tree as ServerFileNode[]).map(serverNodeToFileNode);
}

/** Read a file's content from the disk workspace. */
export async function fetchDiskFile(projectId: string, filePath: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/workspace/${projectId}/file?path=${encodeURIComponent(filePath)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.content ?? '';
}

/** Write a single file to the disk workspace (used on save). */
export async function saveDiskFile(projectId: string, filePath: string, content: string): Promise<void> {
  await fetch(`${API_BASE}/workspace/${projectId}/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
}

/**
 * Merge disk tree into localStorage tree.
 * - Files that exist on disk but not in localStorage → add to localStorage.
 * - Files that exist in both → keep localStorage content (editor is source of truth).
 * - Files that exist in localStorage but not on disk → keep (user may have unsaved work).
 */
export function mergeDiskIntoLocal(localFiles: FileNode[], diskFiles: FileNode[]): FileNode[] {
  const localPaths = new Set(flattenFiles(localFiles));
  const diskPaths = flattenFiles(diskFiles);
  const newPaths = diskPaths.filter((p) => !localPaths.has(p));

  if (newPaths.length === 0) return localFiles;

  let result = [...localFiles];
  for (const newFilePath of newPaths) {
    const diskNode = findNode(diskFiles, newFilePath);
    if (!diskNode) continue;

    const parts = newFilePath.split('/');
    const name = parts[parts.length - 1];

    // Ensure parent folders exist
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
      const existing = findNode(result, currentPath);
      if (!existing) {
        result = [...result, {
          id: crypto.randomUUID(),
          name: parts[i],
          type: 'folder' as const,
          path: currentPath,
          children: [],
        }];
      }
    }

    // Add the new file
    const newNode: FileNode = {
      id: crypto.randomUUID(),
      name,
      type: 'file',
      path: newFilePath,
      content: diskNode.content ?? '',
      language: langForFile(name),
    };
    result = [...result, newNode];
  }

  return result;
}
