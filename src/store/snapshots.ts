import fs from 'node:fs/promises';
import path from 'node:path';
import { buildModel, courseKeyOf, type Model, type SnapshotFile } from '../logic/model.ts';
import { parseSnapshotText } from '../logic/parse.ts';
import type { Snapshot } from '../types.ts';
import { createQueue, writeAtomic } from './fsutil.ts';

/** Same cleanup as the bookmarklet. */
export function courseSlug(course: string): string {
  return course.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
}

export function baseFileName(s: Snapshot): string {
  return `${s.snapshotDate}-${courseSlug(s.course)}_gradebook`;
}

export type SaveResult = { status: 'saved'; fileName: string } | { status: 'duplicate'; fileName: string };

export function createSnapshotStore(dataDir: string) {
  const dir = path.join(dataDir, 'snapshots');
  let cache: { sig: string; model: Model } | null = null;
  const enqueue = createQueue();

  async function listing(): Promise<{ names: string[]; sig: string }> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { names: [], sig: '' };
      throw e;
    }
    const names = entries.filter((n) => n.toLowerCase().endsWith('.json') && !n.startsWith('.')).sort();
    const parts = await Promise.all(names.map(async (n) => {
      try {
        const st = await fs.stat(path.join(dir, n));
        return st.isFile() ? `${n}:${st.size}:${st.mtimeMs}` : '';
      } catch {
        return '';
      }
    }));
    return { names, sig: parts.join('|') };
  }

  async function getModel(): Promise<Model> {
    const { names, sig } = await listing();
    if (cache && cache.sig === sig) return cache.model;
    const files: SnapshotFile[] = await Promise.all(names.map(async (fileName) => {
      try {
        return { fileName, result: parseSnapshotText(await fs.readFile(path.join(dir, fileName), 'utf8')) };
      } catch (e) {
        return { fileName, result: { ok: false as const, error: `Nicht lesbar: ${(e as Error).message}` } };
      }
    }));
    const model = buildModel(files);
    cache = { sig, model };
    return model;
  }

  async function save(s: Snapshot, raw: unknown): Promise<SaveResult> {
    await fs.mkdir(dir, { recursive: true });
    const model = await getModel();
    const key = courseKeyOf(s);
    const dup = model.files.find((f) => f.courseKey === key && f.exportedAt === s.exportedAt);
    if (dup) return { status: 'duplicate', fileName: dup.fileName };
    const base = baseFileName(s);
    for (let i = 1; ; i++) {
      const fileName = `${base}${i === 1 ? '' : '-' + i}.json`;
      const full = path.join(dir, fileName);
      let existing: string | null = null;
      try {
        existing = await fs.readFile(full, 'utf8');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      if (existing !== null) {
        const r = parseSnapshotText(existing);
        if (r.ok && r.snapshot.exportedAt === s.exportedAt) return { status: 'duplicate', fileName };
        continue;
      }
      await writeAtomic(full, JSON.stringify(raw, null, 2) + '\n');
      cache = null;
      return { status: 'saved', fileName };
    }
  }

  return { dir, getModel, save: (s: Snapshot, raw: unknown) => enqueue(() => save(s, raw)), invalidate: () => { cache = null; } };
}

export type SnapshotStore = ReturnType<typeof createSnapshotStore>;
