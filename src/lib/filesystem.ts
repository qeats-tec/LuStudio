import type { FileNode } from '../types';

const API_BASE = '/api';

export interface ServerFileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: ServerFileNode[];
}

export async function fetchTree(): Promise<{ tree: ServerFileNode[]; cwd: string }> {
  const res = await fetch(`${API_BASE}/tree`);
  if (!res.ok) throw new Error('Failed to fetch tree');
  return res.json();
}

export async function fetchFileContent(filePath: string): Promise<string> {
  const res = await fetch(`${API_BASE}/file?path=${encodeURIComponent(filePath)}`);
  if (!res.ok) throw new Error('Failed to read file');
  const data = await res.json();
  return data.content;
}

export async function saveFile(filePath: string, content: string): Promise<void> {
  const res = await fetch(`${API_BASE}/file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
  if (!res.ok) throw new Error('Failed to save file');
}

export async function createFileOrFolder(filePath: string, type: 'file' | 'folder'): Promise<void> {
  const res = await fetch(`${API_BASE}/file/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, type }),
  });
  if (!res.ok) throw new Error('Failed to create');
}

export async function deleteFile(filePath: string): Promise<void> {
  const res = await fetch(`${API_BASE}/file?path=${encodeURIComponent(filePath)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete');
}

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

// Convert server tree (no id/language/content) to FileNode format the UI expects
export function serverNodeToFileNode(node: ServerFileNode): FileNode {
  return {
    id: node.path,
    name: node.name,
    type: node.type,
    path: node.path,
    language: node.type === 'file' ? langForFile(node.name) : undefined,
    children: node.children?.map(serverNodeToFileNode),
  };
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
