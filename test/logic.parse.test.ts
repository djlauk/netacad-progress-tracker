import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSnapshot, parseSnapshotText } from '../src/logic/parse.ts';
import { fixtureModel } from './helpers.ts';

const base = { format: 'netacad-gradebook/1', snapshotDate: '2026-11-01', exportedAt: '2026-11-01T08:00:00.000Z', course: 'K', courseId: 'abc', learners: [] };

test('valid minimal snapshot; optional fields default to null', () => {
  const r = parseSnapshot({ ...base, extra: 1, learners: [{ name: 'A, B', email: 'X@Y.ch' }] });
  assert.ok(r.ok);
  assert.equal(r.snapshot.url, null);
  assert.deepEqual(r.snapshot.assessments, []);
  const l = r.snapshot.learners[0];
  assert.equal(l.classGrade, null);
  assert.equal(l.markedComplete, null);
  assert.deepEqual(l.assessments, []);
});

test('missing required fields give precise errors', () => {
  for (const k of ['snapshotDate', 'exportedAt', 'course', 'courseId', 'learners'] as const) {
    const o: Record<string, unknown> = { ...base };
    delete o[k];
    const r = parseSnapshot(o);
    assert.ok(!r.ok);
    assert.match(r.error, new RegExp(k));
  }
  const r = parseSnapshot({ ...base, learners: [{ name: 'A', classGrade: 'viel' }] });
  assert.ok(!r.ok);
  assert.match(r.error, /learners\[0\]\.classGrade/);
});

test('wrong format and broken JSON are rejected with reason', () => {
  const r1 = parseSnapshot({ ...base, format: 'netacad-gradebook/9' });
  assert.ok(!r1.ok);
  assert.match(r1.error, /Unbekanntes Format/);
  const r2 = parseSnapshotText('{ "format": ');
  assert.ok(!r2.ok);
  assert.match(r2.error, /Kein gültiges JSON/);
});

test('invalid fixture files are skipped with reason', () => {
  const m = fixtureModel();
  const bad = m.files.filter((f) => f.status === 'invalid');
  assert.deepEqual(bad.map((f) => f.fileName).sort(), ['2026-10-05-falsches-format_gradebook.json', '2026-10-06-kaputt_gradebook.json']);
  for (const f of bad) assert.ok(f.reason && f.reason.length > 5);
  assert.equal(m.courses.length, 2);
});
