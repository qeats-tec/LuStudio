import { Users, Loader2 } from 'lucide-react';
import { useVisitorCount } from '../hooks/useVisitorCount';

export function VisitorCounter() {
  const { count } = useVisitorCount();

  return (
    <span className="flex items-center gap-1.5 text-xs text-coal-400" title="Toplam benzersiz ziyaretçi">
      <Users size={13} className="text-accent-400/70" />
      {count === null ? (
        <Loader2 size={11} className="animate-spin text-coal-500" />
      ) : (
        <span className="tabular-nums font-medium text-coal-300">{count.toLocaleString('tr-TR')}</span>
      )}
      <span className="text-coal-500">ziyaretçi</span>
    </span>
  );
}
