import fs from 'node:fs/promises';
import path from 'node:path';
import type { Contact, LearnerNotes, Notes } from '../types.ts';
import { createQueue, readJson, writeAtomic } from './fsutil.ts';

const emptyNotes = (): Notes => ({ format: 'netacad-notes/1', updatedAt: null, learners: {} });
export const emptyLearnerNotes = (): LearnerNotes => ({ note: '', contacts: [], snoozeUntil: null });

const s = (v: unknown) => (typeof v === 'string' ? v : '');

/** Normalise + stable key order (keys sorted, fixed field order, contacts by date). */
export function normalizeNotes(raw: unknown): Notes {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const src = (typeof o.learners === 'object' && o.learners !== null ? o.learners : {}) as Record<string, unknown>;
  const learners: Record<string, LearnerNotes> = {};
  for (const key of Object.keys(src).sort()) {
    const l = (src[key] ?? {}) as Record<string, unknown>;
    const contacts: Contact[] = (Array.isArray(l.contacts) ? l.contacts : [])
      .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c) => ({ id: s(c.id), date: s(c.date), channel: s(c.channel), text: s(c.text), reply: s(c.reply) }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const ln: LearnerNotes = {
      note: s(l.note),
      contacts,
      snoozeUntil: typeof l.snoozeUntil === 'string' && l.snoozeUntil ? l.snoozeUntil : null,
    };
    if (ln.note || ln.contacts.length || ln.snoozeUntil) learners[key.toLowerCase()] = ln;
  }
  return { format: 'netacad-notes/1', updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : null, learners };
}

export function createNotesStore(dataDir: string) {
  const file = path.join(dataDir, 'notes.json');
  const backup = path.join(dataDir, 'notes.backup.json');
  const enqueue = createQueue();

  async function read(): Promise<Notes> {
    const raw = await readJson(file);
    return raw === undefined ? emptyNotes() : normalizeNotes(raw);
  }

  return {
    file,
    backup,
    read,
    async get(key: string): Promise<LearnerNotes> {
      return (await read()).learners[key] ?? emptyLearnerNotes();
    },
    /** Serialised read-modify-write of one learner's notes. */
    update(key: string, fn: (n: LearnerNotes) => void): Promise<LearnerNotes> {
      return enqueue(async () => {
        const notes = await read();
        const n = notes.learners[key] ?? emptyLearnerNotes();
        fn(n);
        notes.learners[key] = n;
        notes.updatedAt = new Date().toISOString();
        const out = normalizeNotes(notes);
        try {
          await fs.copyFile(file, backup);
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        await writeAtomic(file, JSON.stringify(out, null, 2) + '\n');
        return out.learners[key] ?? emptyLearnerNotes();
      });
    },
  };
}

export type NotesStore = ReturnType<typeof createNotesStore>;
