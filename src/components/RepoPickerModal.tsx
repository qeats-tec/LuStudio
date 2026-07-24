import { useState, useEffect, useCallback } from 'react';
import { X, Search, GitBranch, Lock, Globe, RefreshCw, Loader as Loader2, CircleAlert as AlertCircle, Link2 } from 'lucide-react';
import type { GitHubRepo, GitHubConnection, RepoLink } from '../types';
import { listRepos } from '../lib/githubService';

interface RepoPickerModalProps {
  open: boolean;
  onClose: () => void;
  connection: GitHubConnection;
  onLinkRepo: (repo: GitHubRepo) => void;
  currentLink: RepoLink | null;
}

type FilterTab = 'all' | 'public' | 'private';

export function RepoPickerModal({ open, onClose, connection, onLinkRepo, currentLink }: RepoPickerModalProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadRepos = useCallback(async (pageNum: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const batch = await listRepos(connection.accessToken, pageNum, 100);
      if (batch.length < 100) setHasMore(false);
      setRepos((prev) => append ? [...prev, ...batch] : batch);
      setPage(pageNum);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg === 'RATE_LIMIT' ? 'GitHub API hız sınırına ulaşıldı. Lütfen birkaç dakika sonra tekrar deneyin.' : 'Repolar yüklenemedi.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [connection.accessToken]);

  useEffect(() => {
    if (open) {
      setRepos([]);
      setHasMore(true);
      setSearch('');
      setFilter('all');
      loadRepos(1, false);
    }
  }, [open, loadRepos]);

  const filtered = repos.filter((r) => {
    if (filter === 'public' && r.private) return false;
    if (filter === 'private' && !r.private) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-coal-700 bg-coal-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-coal-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <img src={connection.user.avatar_url} alt="" className="h-7 w-7 rounded-full" />
            <div>
              <h2 className="text-sm font-semibold text-coal-100">GitHub Repoları</h2>
              <p className="text-xs text-coal-500">{connection.user.login} olarak bağlandı</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-coal-400 transition-colors hover:bg-coal-800 hover:text-coal-100">
            <X size={18} />
          </button>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col gap-3 border-b border-coal-800 px-5 py-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-coal-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Repo ara..."
              className="w-full rounded-lg border border-coal-700 bg-coal-850 py-2 pl-9 pr-3 text-sm text-coal-100 placeholder-coal-500 outline-none focus:border-accent-400/50"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'public', 'private'] as FilterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === tab ? 'bg-accent-400 text-coal-950' : 'bg-coal-850 text-coal-400 hover:text-coal-200'
                }`}
              >
                {tab === 'all' ? 'Hepsi' : tab === 'public' ? 'Public' : 'Private'}
              </button>
            ))}
          </div>
        </div>

        {/* Repo list */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 size={24} className="animate-spin text-accent-400" />
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <AlertCircle size={24} className="text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={() => loadRepos(1, false)} className="mt-2 flex items-center gap-1 rounded-lg bg-coal-800 px-3 py-1.5 text-xs text-coal-200 hover:bg-coal-700">
                <RefreshCw size={12} /> Tekrar Dene
              </button>
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex h-32 items-center justify-center text-sm text-coal-500">
              {repos.length === 0 ? 'Hiç repo bulunamadı.' : 'Aramanızla eşleşen repo yok.'}
            </div>
          )}
          {!loading && !error && filtered.map((repo) => {
            const isLinked = currentLink?.owner === repo.owner.login && currentLink?.repo === repo.name;
            return (
              <div
                key={repo.id}
                className="mb-1.5 flex items-center justify-between rounded-xl border border-coal-800 bg-coal-850 px-4 py-3 transition-colors hover:border-coal-700"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-coal-100">{repo.name}</span>
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      repo.private ? 'bg-yellow-500/10 text-yellow-400' : 'bg-green-500/10 text-green-400'
                    }`}>
                      {repo.private ? <Lock size={10} /> : <Globe size={10} />}
                      {repo.private ? 'Private' : 'Public'}
                    </span>
                    {isLinked && (
                      <span className="flex items-center gap-1 rounded-full bg-accent-400/10 px-2 py-0.5 text-[10px] font-medium text-accent-400">
                        <Link2 size={10} /> Bağlı
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-coal-500">
                    <span className="flex items-center gap-1">
                      <GitBranch size={11} /> {repo.default_branch}
                    </span>
                    <span>{new Date(repo.updated_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>
                <button
                  onClick={() => onLinkRepo(repo)}
                  disabled={isLinked}
                  className={`ml-3 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isLinked
                      ? 'cursor-default bg-coal-800 text-coal-500'
                      : 'bg-accent-400 text-coal-950 hover:bg-accent-300'
                  }`}
                >
                  {isLinked ? 'Bağlı' : "LuStudio'ya Bağla"}
                </button>
              </div>
            );
          })}
          {!loading && !error && hasMore && filtered.length > 0 && (
            <div className="flex justify-center py-3">
              <button
                onClick={() => loadRepos(page + 1, true)}
                disabled={loadingMore}
                className="flex items-center gap-2 rounded-lg bg-coal-800 px-4 py-2 text-xs text-coal-200 hover:bg-coal-700 disabled:opacity-50"
              >
                {loadingMore ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Daha Fazla Yükle
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
