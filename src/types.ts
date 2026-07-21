export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  content?: string;
  language?: string;
  path: string;
}

export interface EditorTab {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  dirty: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  pending?: boolean;
  error?: boolean;
}

export type SidebarView = 'explorer' | 'search' | 'extensions' | 'settings';

export interface AIFileAction {
  path: string;
  content: string;
  language: string;
}

export type AIStructuredAction =
  | { action: 'create_folder'; name: string; path: string }
  | { action: 'create_file'; name: string; path: string; content: string; language: string };

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  files: FileNode[];
}
