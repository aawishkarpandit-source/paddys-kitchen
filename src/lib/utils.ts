import { clsx, type ClassValue } from 'clsx';

/** Classname joiner (tiny replacement for tailwind-merge). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** PostgREST `numeric` arrives as string|number in realtime payloads — always format through this. */
export function formatPrice(value: number | string | null | undefined, currency = 'EUR'): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** "4m ago" style kitchen timer. */
export function minutesSince(iso: string, nowMs = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 60_000));
}

export function relativeTime(iso: string, nowMs = Date.now()): string {
  const mins = minutesSince(iso, nowMs);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** Local date key for analytics bucketing, e.g. "2026-10-31". */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Clipboard with legacy fallback; always resolves (never throws). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return true;
  } catch {
    return false;
  }
}

/** Vibrate if available (glass feedback on Android; no-op elsewhere). */
export function buzz(pattern: number | number[] = 20): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
