import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildModel, type SnapshotFile } from '../src/logic/model.ts';
import { parseSnapshotText } from '../src/logic/parse.ts';

export const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'snapshots');
export const TODAY = '2026-11-01';

export function fixtureFiles(): SnapshotFile[] {
  return fs.readdirSync(FIXTURES).filter((n) => n.endsWith('.json')).map((fileName) => ({
    fileName,
    result: parseSnapshotText(fs.readFileSync(path.join(FIXTURES, fileName), 'utf8')),
  }));
}

export function fixtureModel() {
  return buildModel(fixtureFiles());
}

export function tempDataDir(withFixtures = false): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'netacad-test-'));
  fs.mkdirSync(path.join(dir, 'snapshots'));
  if (withFixtures) {
    for (const n of fs.readdirSync(FIXTURES)) fs.copyFileSync(path.join(FIXTURES, n), path.join(dir, 'snapshots', n));
  }
  return dir;
}
