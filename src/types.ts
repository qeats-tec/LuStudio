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

export type SidebarView = 'explorer' | 'search' | 'extensions' | 'settings' | 'github';


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

// ── GitHub Integration Types ────────────────────────────────────────────

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  private: boolean;
  default_branch: string;
  updated_at: string;
  description: string | null;
  html_url: string;
}

export interface GitHubFile {
  path: string;
  content: string;
  type: 'file' | 'folder';
}

export type SyncStatus = 'synced' | 'unsaved' | 'syncing' | 'error';

export interface GitHubConnection {
  user: GitHubUser;
  accessToken: string;
  connectedAt: number;
}

export interface RepoLink {
  owner: string;
  repo: string;
  branch: string;
  lastSync: number | null;
}
