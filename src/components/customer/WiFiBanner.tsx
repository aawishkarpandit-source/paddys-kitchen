// ════════════════════════════════════════════════════════════════════════════
//  Wi-Fi banner — the "join our network" moment. Tap SSID/password to copy;
//  note line renders the restaurant's tip. Reads restaurants.settings.wifi.
// ════════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { copyText } from '../../lib/utils';
import type { RestaurantSettings } from '../../types/models';

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        const ok = await copyText(value);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }
      }}
      className="group flex w-full items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 text-left ring-1 ring-white/40 transition-colors hover:bg-white/80"
      aria-label={`Copy ${label}`}
    >
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-widest text-emerald-900/60">
          {label}
        </span>
        <span className="block truncate text-sm font-semibold text-stone-900">{value}</span>
      </span>
      <span className="shrink-0 text-[11px] font-bold text-emerald-800">
        {copied ? '✓ Copied' : 'Tap to copy'}
      </span>
    </button>
  );
}

export function WiFiBanner({ settings }: { settings: RestaurantSettings | null }) {
  const [open, setOpen] = useState(true);
  const wifi = settings?.wifi;

  if (!wifi?.ssid) return null;

  return (
    <div className="border-b border-stone-200 bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 px-4 py-2.5 text-white shadow-inner">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 19l.01 0M7 13.5a7 7 0 0 1 10 0M3 8.5a12 12 0 0 1 18 0" />
            </svg>
          </span>
          <span className="truncate text-sm font-semibold">
            Guest Wi-Fi: <strong>{wifi.ssid}</strong>
          </span>
        </span>
        <span className="text-xs text-emerald-100/90 underline-offset-2 hover:underline">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          <CopyField label="Network (SSID)" value={wifi.ssid} />
          {wifi.password && <CopyField label="Password" value={wifi.password} />}
          {wifi.note && <p className="px-1 text-[11px] italic text-emerald-50/80">{wifi.note}</p>}
        </div>
      )}
    </div>
  );
}

export default WiFiBanner;
