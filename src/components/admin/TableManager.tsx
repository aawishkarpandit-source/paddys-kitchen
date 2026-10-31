// ════════════════════════════════════════════════════════════════════════════
//  TableManager — add/cease tables and generate QR codes client-side
//  (qrcode lib → canvas/dataURL; zero Supabase Storage usage).
//  QR payload: {origin}/menu?r={slug}&table={number}
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Badge, Spinner } from '../ui/misc';
import * as api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../context/SessionContext';
import { copyText, cn } from '../../lib/utils';

interface TableManagerProps {
  restaurantId: string;
}

interface LoadedTable {
  id: string;
  table_number: string;
  status: 'active' | 'inactive';
}

export function TableManager({ restaurantId }: TableManagerProps) {
  const { restaurant } = useSession();
  const slug = restaurant?.slug ?? '';

  const [tables, setTables] = useState<LoadedTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNumber, setNewNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrFor, setQrFor] = useState<LoadedTable | null>(null);

  useEffect(() => {
    if (!restaurantId || !slug) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error: err } = await apiFetchTables(restaurantId);
      if (cancelled) return;
      if (err) setError(err.message);
      setTables(data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, slug]);

  const menuUrl = (t: LoadedTable) =>
    `${window.location.origin}/menu?r=${encodeURIComponent(slug)}&table=${encodeURIComponent(t.table_number)}`;

  const createTable = async () => {
    if (!newNumber.trim()) return;
    setBusy(true);
    setError(null);
    await api.createTable(restaurantId, newNumber);
    setNewNumber('');
    const { data } = await apiFetchTables(restaurantId);
    setTables(data ?? []);
    setBusy(false);
  };

  const toggleStatus = async (t: LoadedTable) => {
    await api.setTableStatus(t.id, t.status !== 'active');
    const { data } = await apiFetchTables(restaurantId);
    setTables(data ?? []);
  };

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">{error}</p>}

      <div className="flex items-center gap-2">
        <input
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          placeholder="Table number / name (e.g. 7, Terrace 2)"
          className="min-w-40 flex-1 rounded-xl bg-white px-3.5 py-2 text-sm ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          onKeyDown={(e) => e.key === 'Enter' && void createTable()}
        />
        <Button onClick={createTable} disabled={busy || !newNumber.trim()}>
          {busy ? 'Adding…' : '+ Add table'}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-stone-400"><Spinner className="h-6 w-6" /></div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {tables.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200/70">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-xs font-black text-white">
                    {t.table_number.slice(0, 3).toUpperCase()}
                  </span>
                  <h4 className="truncate text-sm font-bold text-stone-900">Table {t.table_number}</h4>
                  <Badge tone={t.status === 'active' ? 'green' : 'slate'}>{t.status}</Badge>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-stone-400">{menuUrl(t)}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setQrFor(t)}>
                QR
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggleStatus(t)} className={t.status === 'active' ? 'text-red-600' : 'text-emerald-700'}>
                {t.status === 'active' ? 'Cease' : 'Activate'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {qrFor && (
        <QrModal
          title={`QR — Table ${qrFor.table_number}`}
          url={menuUrl(qrFor)}
          onClose={() => setQrFor(null)}
        />
      )}
    </div>
  );
}

async function apiFetchTables(restaurantId: string) {
  return supabase
    .from('tables')
    .select('id, table_number, status')
    .eq('restaurant_id', restaurantId)
    .order('table_number', { ascending: true })
    .returns<LoadedTable[]>();
}

// ── QR modal ────────────────────────────────────────────────────────────────
function QrModal({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, url, {
        width: 260,
        margin: 1,
        color: { dark: '#1c1917', light: '#ffffff' },
      });
    }
  }, [url]);

  const download = async () => {
    const dataUrl = await QRCode.toDataURL(url, { width: 760, margin: 2, color: { dark: '#1c1917', light: '#ffffff' } });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `paddys-qr-${title.replace(/[^\w-]+/g, '-').toLowerCase()}.png`;
    a.click();
  };

  return (
    <Modal open onClose={onClose} title={title} footer={
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => void copyText(url)}>Copy link</Button>
        <Button block onClick={() => void download()}>Download PNG (print-ready)</Button>
      </div>
    }>
      <div className="px-5 py-4">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-stone-200">
            <canvas ref={canvasRef} className="h-64 w-64" />
          </div>
          <p className="break-all rounded-xl bg-stone-50 px-3 py-2 text-center text-[11px] font-semibold text-stone-500">{url}</p>
          <p className={cn('text-[11px] text-stone-400')}>
            Print it and stand it on the table — guests scan → the menu opens with the table preselected.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export default TableManager;
