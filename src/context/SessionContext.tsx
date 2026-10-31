// ════════════════════════════════════════════════════════════════════════════
//  SessionContext — the customer "QR session".
//
//  URL wins:  /menu?r=paddys-kitchen&table=4  (always what a freshly scanned
//  QR carries). Otherwise fall back to localStorage so a returning guest on
//  the same device lands back on their table ("?r&table absent" case).
//
//  Zero realtime listeners here — one REST lookup, no connection budget spent.
// ════════════════════════════════════════════════════════════════════════════
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import type { RestaurantRow, TableRowSchema } from '../types/database';

const SESSION_STORAGE_KEY = 'paddys_session';

export interface PersistedSession {
  slug: string;
  tableNumber: string;
}

interface SessionState {
  restaurant: RestaurantRow | null;
  table: TableRowSchema | null;
  tables: TableRowSchema[];
  loading: boolean;
  /** Missing QR params, no stored session, or unknown slug/table — go to /. */
  invalid: boolean;
  refresh: () => void;
}

const SessionContext = createContext<SessionState>({
  restaurant: null,
  table: null,
  tables: [],
  loading: true,
  invalid: false,
  refresh: () => undefined,
});

function readUrlSession(): PersistedSession | null {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('r');
  const tableNumber = params.get('table');
  if (!slug) return null;
  return { slug: slug.toLowerCase().trim(), tableNumber: tableNumber?.trim() ?? '' };
}

function readStoredSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (parsed?.slug) return { slug: parsed.slug, tableNumber: parsed.tableNumber ?? '' };
  } catch {
    /* corrupted storage — ignore */
  }
  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isConfigured);
  const [invalid, setInvalid] = useState(false);
  const [restaurant, setRestaurant] = useState<RestaurantRow | null>(null);
  const [tables, setTables] = useState<TableRowSchema[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setInvalid(false);

    const load = async (): Promise<void> => {
      const fromUrl = readUrlSession();
      const session = fromUrl ?? readStoredSession();
      if (!session) {
        if (!cancelled) {
          setLoading(false);
          setInvalid(true);
        }
        return;
      }
      if (fromUrl) {
        // Fresh QR scan — persist for the next visit.
        try {
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(fromUrl));
        } catch {
          /* storage blocked — session is per-navigation only */
        }
      }

      const { data: restaurantRow, error: restaurantErr } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', session.slug)
        .maybeSingle();
      if (cancelled) return;

      if (restaurantErr || !restaurantRow || !restaurantRow.is_active) {
        if (!cancelled) {
          setRestaurant(null);
          setTables([]);
          setLoading(false);
          setInvalid(restaurantErr === null && (!restaurantRow || !restaurantRow.is_active));
        }
        return;
      }

      const { data: tableRows } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', restaurantRow.id)
        .order('table_number', { ascending: true });
      if (cancelled) return;

      setRestaurant(restaurantRow);
      setTables(tableRows ?? []);
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const table = useMemo(() => {
    const fromUrl = readUrlSession();
    const wanted = fromUrl?.tableNumber ?? readStoredSession()?.tableNumber ?? '';
    if (!wanted || tables.length === 0) return null;
    return (
      tables.find((t) => t.table_number === wanted && t.status === 'active') ??
      tables.find((t) => t.table_number === wanted) ??
      tables.find((t) => t.status === 'active') ??  // fallback: any seatable table
      null
    );
  }, [tables]);

  return (
    <SessionContext.Provider value={{ restaurant, table, tables, loading, invalid, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}

export default SessionProvider;
