import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';



const FINGERPRINT_KEY = 'lustudio_visitor_fp';

function getFingerprint(): string {
  let fp = localStorage.getItem(FINGERPRINT_KEY);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(FINGERPRINT_KEY, fp);
  }
  return fp;
}

export function useVisitorCount() {
  const [count, setCount] = useState<number | null>(null);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function registerAndCount() {
      if (!supabase) return;
      const fp = getFingerprint();

      // Upsert this visitor (insert if new, update last_seen if returning)
      const { error: upsertError } = await supabase
        .from('visitors')
        .upsert(
          { visitor_fingerprint: fp, last_seen: new Date().toISOString() },
          { onConflict: 'visitor_fingerprint' },
        )
        .select('id')
        .maybeSingle();

      if (upsertError) {
        // eslint-disable-next-line no-console
        console.warn('[visitor] upsert failed:', upsertError.message);
      }
      if (!cancelled) setRegistered(true);

      // Fetch total count
      const { count: total, error: countError } = await supabase
        .from('visitors')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        // eslint-disable-next-line no-console
        console.warn('[visitor] count failed:', countError.message);
        return;
      }
      if (!cancelled) setCount(total ?? 0);
    }

    registerAndCount();
    return () => {
      cancelled = true;
    };
  }, []);

  return { count, registered };
}
