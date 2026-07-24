import type { GitHubUser, GitHubRepo, GitHubConnection } from '../types';

const GITHUB_API = 'https://api.github.com';
const STORAGE_KEY = 'lustudio_github_connection';

// ── Token storage ─────────────────────────────────────────────────────────

export function getConnection(): GitHubConnection | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GitHubConnection;
  } catch {
    return null;
  }
}

export function setConnection(conn: GitHubConnection | null): void {
  if (conn) localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
  else localStorage.removeItem(STORAGE_KEY);
}

export function disconnect(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── OAuth flow ────────────────────────────────────────────────────────────
// Uses GitHub's device flow (no client secret needed, works from browser).
// Falls back to manual PAT (personal access token) entry.

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export async function startDeviceFlow(clientId: string): Promise<DeviceCodeResponse> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_id: clientId, scope: 'repo user' }),
  });
  if (!res.ok) throw new Error('Failed to start GitHub device flow');
  return res.json();
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export async function pollForToken(
  clientId: string,
  deviceCode: string,
): Promise<TokenResponse | 'pending' | 'expired'> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const data = await res.json();
  if (data.access_token) return data as TokenResponse;
  if (data.error === 'authorization_pending' || data.error === 'slow_down') return 'pending';
  if (data.error === 'expired_token') return 'expired';
  throw new Error(data.error_description || 'OAuth failed');
}

export async function getUser(token: string): Promise<GitHubUser> {
  const res = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error('Failed to fetch GitHub user');
  return res.json();
}

// ── Manual PAT connection ─────────────────────────────────────────────────

export async function connectWithPAT(token: string): Promise<GitHubConnection> {
  const user = await getUser(token);
  const conn: GitHubConnection = { user, accessToken: token, connectedAt: Date.now() };
  setConnection(conn);
  return conn;
}

// ── Repos ──────────────────────────────────────────────────────────────────

export async function listRepos(token: string, page = 1, perPage = 100): Promise<GitHubRepo[]> {
  const res = await fetch(
    `${GITHUB_API}/user/repos?type=all&per_page=${perPage}&page=${page}&sort=updated`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
  );
  if (!res.ok) {
    if (res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0') throw new Error('RATE_LIMIT');
    }
    throw new Error(`Failed to list repos: ${res.status}`);
  }
  return res.json();
}

// ── Git Database API sync ──────────────────────────────────────────────────

interface BlobResult { sha: string; path: string; mode: '100644'; type: 'blob'; }

async function createBlob(token: string, owner: string, repo: string, content: string): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ content, encoding: 'utf-8' }),
  });
  if (!res.ok) throw new Error(`Blob creation failed: ${res.status}`);
  const data = await res.json();
  return data.sha;
}

async function getDefaultBranchRefSha(token: string, owner: string, repo: string, branch: string): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Failed to get ref: ${res.status}`);
  const data = await res.json();
  return data.object.sha;
}

async function getCommitSha(token: string, owner: string, repo: string, sha: string): Promise<{ sha: string; tree_sha: string }> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits/${sha}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Failed to get commit: ${res.status}`);
  const data = await res.json();
  return { sha: data.sha, tree_sha: data.tree.sha };
}

async function createTree(
  token: string, owner: string, repo: string,
  baseTreeSha: string, blobs: BlobResult[],
): Promise<string> {
  const tree = blobs.map((b) => ({ path: b.path, mode: b.mode, type: b.type, sha: b.sha }));
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ base_tree: baseTreeSha, tree }),
  });
  if (!res.ok) throw new Error(`Tree creation failed: ${res.status}`);
  const data = await res.json();
  return data.sha;
}

async function createCommit(
  token: string, owner: string, repo: string,
  message: string, treeSha: string, parentSha: string,
): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
  });
  if (!res.ok) throw new Error(`Commit failed: ${res.status}`);
  const data = await res.json();
  return data.sha;
}

async function updateRef(
  token: string, owner: string, repo: string, branch: string, sha: string,
): Promise<void> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ sha, force: false }),
  });
  if (!res.ok) {
    if (res.status === 422) throw new Error('HEAD_MISMATCH');
    throw new Error(`Ref update failed: ${res.status}`);
  }
}

export interface SyncResult {
  success: boolean;
  commitSha?: string;
  error?: string;
  pushedFiles: number;
}

export async function syncToGitHub(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: Array<{ path: string; content: string }>,
  commitMessage: string,
): Promise<SyncResult> {
  try {
    // 1. Create blobs for all files
    const blobs: BlobResult[] = [];
    for (const file of files) {
      const sha = await createBlob(token, owner, repo, file.content);
      blobs.push({ sha, path: file.path, mode: '100644', type: 'blob' });
    }

    // 2. Get current HEAD commit SHA + tree SHA
    const refSha = await getDefaultBranchRefSha(token, owner, repo, branch);
    const commitInfo = await getCommitSha(token, owner, repo, refSha);

    // 3. Create new tree
    const treeSha = await createTree(token, owner, repo, commitInfo.tree_sha, blobs);

    // 4. Create commit
    const newCommitSha = await createCommit(token, owner, repo, commitMessage, treeSha, commitInfo.sha);

    // 5. Update ref (non-force)
    await updateRef(token, owner, repo, branch, newCommitSha);

    return { success: true, commitSha: newCommitSha, pushedFiles: files.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg, pushedFiles: 0 };
  }
}

// ── Fetch repo files (pull from GitHub) ────────────────────────────────────

export async function fetchRepoTree(token: string, owner: string, repo: string, branch: string): Promise<Array<{ path: string; sha: string; type: string }>> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
  );
  if (!res.ok) throw new Error(`Failed to fetch tree: ${res.status}`);
  const data = await res.json();
  return (data.tree as Array<{ path: string; sha: string; type: string }>).filter((e) => e.type === 'blob');
}

export async function fetchFileContent(token: string, owner: string, repo: string, fileSha: string): Promise<string> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs/${fileSha}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Failed to fetch blob: ${res.status}`);
  const data = await res.json();
  return atob(data.content);
}
