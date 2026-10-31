import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import type { OrderStatus } from '../../types/database';
import type { RealtimeStatus } from '../../types/models';

// ── Badge ────────────────────────────────────────────────────────────────────
type Tone = 'amber' | 'green' | 'red' | 'slate' | 'blue' | 'white';

const TONE: Record<Tone, string> = {
  amber: 'bg-amber-100 text-amber-900 ring-amber-200',
  green: 'bg-emerald-100 text-emerald-900 ring-emerald-200',
  red: 'bg-red-100 text-red-800 ring-red-200',
  slate: 'bg-stone-100 text-stone-700 ring-stone-200',
  blue: 'bg-sky-100 text-sky-900 ring-sky-200',
  white: 'bg-white/90 text-stone-800 ring-stone-200',
};

export function Badge({
  tone = 'slate',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className ?? 'h-5 w-5')}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
      role="status"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({
  icon = '🍽️',
  title,
  subtitle,
  action,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="text-4xl" aria-hidden>{icon}</div>
      <h3 className="text-sm font-bold text-stone-800">{title}</h3>
      {subtitle && <p className="max-w-xs text-xs text-stone-500">{subtitle}</p>}
      {action}
    </div>
  );
}

// ── Live connection indicator ────────────────────────────────────────────────
const LIVE_LABEL: Record<RealtimeStatus, string> = {
  live: 'Live',
  connecting: 'Connecting…',
  error: 'Reconnecting…',
  disconnected: 'Offline',
};

const LIVE_DOT: Record<RealtimeStatus, string> = {
  live: 'bg-emerald-500',
  connecting: 'bg-amber-400',
  error: 'bg-red-500',
  disconnected: 'bg-stone-300',
};

export function LiveBadge({ status, showLabel = true }: { status: RealtimeStatus; showLabel?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
        status === 'live' && 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        status === 'connecting' && 'bg-amber-50 text-amber-700 ring-amber-200',
        status === 'error' && 'bg-red-50 text-red-700 ring-red-200',
        status === 'disconnected' && 'bg-stone-100 text-stone-500 ring-stone-200',
      )}
      title={`Realtime connection: ${status}`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', LIVE_DOT[status], status === 'live' && 'animate-pulse')} />
      {showLabel && LIVE_LABEL[status]}
    </span>
  );
}

// ── Order status chip ────────────────────────────────────────────────────────

export function StatusChip({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { tone: Tone; label: string; icon: string }> = {
    pending: { tone: 'amber', label: 'Received', icon: '🧾' },
    preparing: { tone: 'blue', label: 'In kitchen', icon: '🍳' },
    ready: { tone: 'green', label: 'Ready', icon: '✅' },
    completed: { tone: 'slate', label: 'Enjoy!', icon: '🍽️' },
    cancelled: { tone: 'red', label: 'Cancelled', icon: '✖️' },
  };
  const { tone, label, icon } = map[status];
  return (
    <Badge tone={tone}>
      <span aria-hidden>{icon}</span>
      {label}
    </Badge>
  );
}
