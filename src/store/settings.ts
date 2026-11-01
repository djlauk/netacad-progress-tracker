import path from 'node:path';
import type { Settings } from '../types.ts';
import { readJson, writeAtomic } from './fsutil.ts';

export const DEFAULT_SUBJECT = 'NetAcad: {course}';

export const DEFAULT_TEMPLATE =
  '{salutation},\n\nich sehe im Kurs «{course}», dass sich seit dem {lastActivity} nichts mehr getan hat. ' +
  'Ist gerade einfach viel los, oder kann ich Ihnen irgendwo helfen? Melden Sie sich gern, auch wenn Sie nur eine kurze Frage haben.';

export const DEFAULT_SETTINGS: Settings = {
  warnDays: 21,
  alertDays: 42,
  contactSubject: DEFAULT_SUBJECT,
  contactTemplate: DEFAULT_TEMPLATE,
};

export function normalizeSettings(raw: unknown): Settings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const int = (k: 'warnDays' | 'alertDays') =>
    typeof o[k] === 'number' && Number.isInteger(o[k]) && (o[k] as number) > 0 ? (o[k] as number) : DEFAULT_SETTINGS[k];
  const str = (k: 'contactSubject' | 'contactTemplate') =>
    typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string) : DEFAULT_SETTINGS[k];
  return { warnDays: int('warnDays'), alertDays: int('alertDays'), contactSubject: str('contactSubject'), contactTemplate: str('contactTemplate') };
}

export type SettingsInput = Record<string, string | undefined>;

/** Validate form input; returns errors (German) or settings. */
export function validateSettings(input: SettingsInput): { ok: true; settings: Settings } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const num = (k: string, label: string) => {
    const n = Number(input[k]);
    if (!Number.isInteger(n) || n < 1 || n > 3650) errors.push(`${label}: ganze Zahl zwischen 1 und 3650 erwartet`);
    return n;
  };
  const warnDays = num('warnDays', 'Beobachten ab');
  const alertDays = num('alertDays', 'Nachfragen ab');
  if (!errors.length && warnDays >= alertDays) errors.push('«Nachfragen ab» muss grösser sein als «Beobachten ab»');
  const contactSubject = (input.contactSubject ?? '').trim();
  if (!contactSubject) errors.push('Betreff darf nicht leer sein');
  const contactTemplate = (input.contactTemplate ?? '').replace(/\r\n/g, '\n');
  if (!contactTemplate.trim()) errors.push('Nachfrage-Vorlage darf nicht leer sein');
  if (errors.length) return { ok: false, errors };
  return { ok: true, settings: { warnDays, alertDays, contactSubject, contactTemplate } };
}

export function createSettingsStore(dataDir: string) {
  const file = path.join(dataDir, 'settings.json');
  return {
    file,
    async get(): Promise<Settings> {
      return normalizeSettings(await readJson(file));
    },
    async save(s: Settings): Promise<void> {
      await writeAtomic(file, JSON.stringify(s, null, 2) + '\n');
    },
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
