import type { ActivityLevel, ActivitySource, StatusCode } from '../types.ts';
import { fmtNum } from '../logic/status.ts';

export { fmtNum };

export const STATUS_META: Record<StatusCode, { icon: string; label: string }> = {
  alert: { icon: '🔴', label: 'nachfragen' },
  watch: { icon: '🟡', label: 'beobachten' },
  active: { icon: '🟢', label: 'aktiv' },
  snoozed: { icon: '💤', label: 'pausiert' },
  completed: { icon: '✅', label: 'abgeschlossen' },
  gone: { icon: '⚪', label: 'nicht mehr dabei' },
};

export const LEVEL_META: Record<ActivityLevel | 'completed' | 'gone', { icon: string; label: string }> = {
  active: STATUS_META.active,
  watch: STATUS_META.watch,
  alert: { icon: '🔴', label: 'inaktiv' },
  completed: STATUS_META.completed,
  gone: STATUS_META.gone,
};

export const SOURCE_LABEL: Record<ActivitySource, string> = {
  submitted: 'Datum einer Prüfungsabgabe laut NetAcad',
  snapshot: 'Datum des Snapshots, in dem die Prüfung sichtbar wurde (NetAcad ohne Abgabedatum)',
};

/** YYYY-MM-DD → TT.MM.JJJJ */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '–';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ago(days: number): string {
  if (days <= 0) return days === 0 ? 'heute' : `in ${-days} Tagen`;
  if (days === 1) return 'gestern';
  return `vor ${days} Tagen`;
}

export function fmtDelta(d: number | null): { text: string; cls: string } | null {
  if (d === null) return null;
  const r = Math.round(d * 10) / 10;
  if (r === 0) return { text: '±0', cls: 'delta-zero' };
  return r > 0 ? { text: `+${fmtNum(r)}`, cls: 'delta-up' } : { text: `−${fmtNum(-r)}`, cls: 'delta-down' };
}

export function fmtPct(n: number | null): string {
  return n === null ? '–' : `${fmtNum(n)} %`;
}

/** First name: part after the comma ("Nachname, Vorname"). */
export function firstName(name: string): string {
  const i = name.indexOf(',');
  return (i >= 0 ? name.slice(i + 1) : name).trim() || name.trim();
}

export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
