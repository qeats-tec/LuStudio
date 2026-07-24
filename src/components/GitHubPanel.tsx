import { useState, useEffect, useCallback } from 'react';
import { Github, GitBranch, RefreshCw, Loader as Loader2, Upload, CircleAlert as AlertCircle, Check, KeyRound, X, ExternalLink, Clock } from 'lucide-react';
import type { GitHubConnection, RepoLink, FileNode, SyncStatus } from '../types';
import {
  disconnect, connectWithPAT,
  syncToGitHub, fetchRepoTree, fetchFileContent,
} from '../lib/githubService';
import { flattenFiles, findNode } from '../lib/filesystem';

interface GitHubPanelProps {
  connection: GitHubConnection | null;
  onConnectionChange: (conn: GitHubConnection | null) => void;
  repoLink: RepoLink | null;
  onRepoLinkChange: (link: RepoLink | null) => void;
  onOpenRepoPicker: () => void;
  files: FileNode[];
  onImportFiles: (files: Array<{ path: string; content: string }>) => void;
}

export function GitHubPanel({
  connection, onConnectionChange, repoLink, onRepoLinkChange,
  onOpenRepoPicker, files, onImportFiles,
}: GitHubPanelProps) {
  const [patInput, setPatInput] = useState('');

  // ── PAT connection ──────────────────────────────────────────────────────
  const handlePATConnect = useCallback(async () => {
    if (!patInput.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      const conn = await connectWithPAT(patInput.trim());
      onConnectionChange(conn);
      setPatInput('');
    } catch {
      setError('Geçersiz token. Personal Access Token\'ınızı kontrol edin (repo + user izinleri gerekli).');
    } finally {
      setConnecting(false);
    }
  }, [patInput, onConnectionChange]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    onConnectionChange(null);
    onRepoLinkChange(null);
    setSyncStatus('synced');
    setSyncResult(null);
  }, [onConnectionChange, onRepoLinkChange]);

  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState('Update via LuStudio');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // ── Track unsaved changes ───────────────────────────────────────────────
  const fileList = connection && repoLink ? flattenFiles(files) : [];
  const [lastSyncedPaths, setLastSyncedPaths] = useState<string[]>([]);

  useEffect(() => {
    if (!connection || !repoLink) return;
    // Compare current files with last synced state
    const currentPaths = new Set(fileList);
    const syncedSet = new Set(lastSyncedPaths);
    let changed = false;
    if (currentPaths.size !== syncedSet.size) changed = true;
    else {
      for (const p of currentPaths) {
        if (!syncedSet.has(p)) { changed = true; break; }
      }
    }
    if (changed && syncStatus === 'synced') setSyncStatus('unsaved');
  }, [fileList, lastSyncedPaths, connection, repoLink, syncStatus]);

  // ── Push to GitHub ────────────────────────────────────────────────────────
  const handlePush = useCallback(async () => {
    if (!connection || !repoLink) return;
    setSyncStatus('syncing');
    setError(null);
    setSyncResult(null);

    const filesToPush = flattenFiles(files).map((p) => {
      const node = findNode(files, p);
      return { path: p, content: node?.content ?? '' };
    });

    const result = await syncToGitHub(
      connection.accessToken,
      repoLink.owner, repoLink.repo, repoLink.branch,
      filesToPush, commitMsg || 'Update via LuStudio',
    );

    if (result.success) {
      setSyncStatus('synced');
      setLastSyncedPaths(flattenFiles(files));
      setSyncResult(`${result.pushedFiles} dosya push edildi`);
      onRepoLinkChange({ ...repoLink, lastSync: Date.now() });
    } else {
      setSyncStatus('error');
      if (result.error === 'HEAD_MISMATCH') {
        setError('Uzak repo daha yeni. Üzerine yazmadan önce GitHub\'tan dosyaları çekmeniz gerekiyor.');
      } else if (result.error === 'RATE_LIMIT') {
        setError('GitHub API hız sınırına ulaşıldı. Lütfen bekleyin.');
      } else {
        setError(result.error || 'Push başarısız');
      }
    }
  }, [connection, repoLink, files, commitMsg, onRepoLinkChange]);

  // ── Pull from GitHub ──────────────────────────────────────────────────────
  const [pulling, setPulling] = useState(false);

  const handlePull = useCallback(async () => {
    if (!connection || !repoLink) return;
    setPulling(true);
    setError(null);
    try {
      const tree = await fetchRepoTree(connection.accessToken, repoLink.owner, repoLink.repo, repoLink.branch);
      const importedFiles: Array<{ path: string; content: string }> = [];
      for (const entry of tree) {
        const content = await fetchFileContent(connection.accessToken, repoLink.owner, repoLink.repo, entry.sha);
        importedFiles.push({ path: entry.path, content });
      }
      onImportFiles(importedFiles);
      setLastSyncedPaths(importedFiles.map((f) => f.path));
      setSyncStatus('synced');
      setSyncResult(`${importedFiles.length} dosya çekildi`);
      onRepoLinkChange({ ...repoLink, lastSync: Date.now() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pull başarısız');
      setSyncStatus('error');
    } finally {
      setPulling(false);
    }
  }, [connection, repoLink, onImportFiles, onRepoLinkChange]);

  // ── Not connected state ──────────────────────────────────────────────────
  if (!connection) {
    return (
      <div className="flex h-full flex-col px-4 py-4">
        <div className="mb-4 flex items-center gap-2">
          <Github size={16} className="text-coal-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-coal-400">GitHub</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-coal-850">
            <Github size={28} className="text-coal-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-coal-200">GitHub Hesabını Bağla</p>
            <p className="mt-1 text-xs text-coal-500">Repolarınızı senkronize etmek için bağlanın</p>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          <div className="w-full max-w-xs space-y-2">
            <div className="relative">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-coal-500" />
              <input
                type="password"
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePATConnect()}
                placeholder="Personal Access Token"
                className="w-full rounded-lg border border-coal-700 bg-coal-850 py-2 pl-9 pr-3 text-sm text-coal-100 placeholder-coal-500 outline-none focus:border-accent-400/50"
              />
            </div>
            <button
              onClick={handlePATConnect}
              disabled={connecting || !patInput.trim()}
              className="w-full rounded-lg bg-accent-400 py-2 text-sm font-medium text-coal-950 transition-colors hover:bg-accent-300 disabled:opacity-50"
            >
              {connecting ? <Loader2 size={16} className="mx-auto animate-spin" /> : 'Bağla'}
            </button>
            <a
              href="https://github.com/settings/tokens/new?scopes=repo,user&description=LuStudio"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-xs text-coal-500 hover:text-coal-300"
            >
              <ExternalLink size={11} /> Token oluştur
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Connected state ──────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* User card */}
      <div className="flex items-center justify-between border-b border-coal-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <img src={connection.user.avatar_url} alt="" className="h-8 w-8 rounded-full" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-coal-100">{connection.user.name || connection.user.login}</p>
            <p className="text-xs text-coal-500">@{connection.user.login}</p>
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          className="rounded-lg p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-red-400"
          title="Bağlantıyı kes"
        >
          <X size={16} />
        </button>
      </div>

      {/* Repo link */}
      <div className="border-b border-coal-800 px-4 py-3">
        {repoLink ? (
          <div className="rounded-xl border border-coal-800 bg-coal-850 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Github size={14} className="text-coal-400" />
                <span className="text-sm font-medium text-coal-100">{repoLink.repo}</span>
              </div>
              <button
                onClick={onOpenRepoPicker}
                className="text-xs text-coal-500 hover:text-coal-300"
              >
                Değiştir
              </button>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-coal-500">
              <span className="flex items-center gap-1">
                <GitBranch size={11} /> {repoLink.branch}
              </span>
              {repoLink.lastSync && (
                <span className="flex items-center gap-1">
                  <Clock size={11} /> {new Date(repoLink.lastSync).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={onOpenRepoPicker}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-coal-700 bg-coal-850 py-3 text-sm text-coal-400 transition-colors hover:border-accent-400/50 hover:text-coal-200"
          >
            <Github size={16} /> Repo Seç
          </button>
        )}
      </div>

      {/* Sync section */}
      {repoLink && (
        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
          {/* Status badge */}
          <div className="mb-3">
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
              syncStatus === 'synced' ? 'bg-green-500/10 text-green-400' :
              syncStatus === 'unsaved' ? 'bg-yellow-500/10 text-yellow-400' :
              syncStatus === 'syncing' ? 'bg-blue-500/10 text-blue-400' :
              'bg-red-500/10 text-red-400'
            }`}>
              {syncStatus === 'synced' && <Check size={14} />}
              {syncStatus === 'unsaved' && <AlertCircle size={14} />}
              {syncStatus === 'syncing' && <Loader2 size={14} className="animate-spin" />}
              {syncStatus === 'error' && <AlertCircle size={14} />}
              {syncStatus === 'synced' && 'Senkronize Edildi'}
              {syncStatus === 'unsaved' && 'Kaydedilmemiş Değişiklikler'}
              {syncStatus === 'syncing' && 'Senkronize Ediliyor...'}
              {syncStatus === 'error' && 'Hata'}
            </div>
          </div>

          {/* Changed files */}
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-coal-500">
              Dosyalar ({fileList.length})
            </p>
            <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-coal-800 bg-coal-850 p-2">
              {fileList.slice(0, 20).map((p) => {
                const isSynced = lastSyncedPaths.includes(p);
                return (
                  <div key={p} className="flex items-center gap-2 py-0.5 text-xs">
                    <span className={`h-1.5 w-1.5 rounded-full ${isSynced ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className="truncate text-coal-300">{p}</span>
                  </div>
                );
              })}
              {fileList.length > 20 && <p className="py-1 text-center text-xs text-coal-600">+{fileList.length - 20} daha</p>}
            </div>
          </div>

          {/* Commit message */}
          <div className="mb-3">
            <input
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit mesajı"
              className="w-full rounded-lg border border-coal-700 bg-coal-850 px-3 py-2 text-sm text-coal-100 placeholder-coal-500 outline-none focus:border-accent-400/50"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Result */}
          {syncResult && syncStatus === 'synced' && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-400">
              <Check size={14} /> {syncResult}
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-auto space-y-2">
            <button
              onClick={handlePush}
              disabled={syncStatus === 'syncing'}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-400 py-2.5 text-sm font-medium text-coal-950 transition-colors hover:bg-accent-300 disabled:opacity-50"
            >
              {syncStatus === 'syncing' ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              GitHub'a Push Et
            </button>
            <button
              onClick={handlePull}
              disabled={pulling}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-coal-700 bg-coal-850 py-2.5 text-sm text-coal-200 transition-colors hover:bg-coal-800 disabled:opacity-50"
            >
              {pulling ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              GitHub'dan Çek
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
