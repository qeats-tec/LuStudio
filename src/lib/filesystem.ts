import type { FileNode } from '../types';

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
