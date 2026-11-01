import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildModel, type Point } from '../src/logic/model.ts';
import { parseSnapshotText } from '../src/logic/parse.ts';
import { compare, courseStats, daysBetween, lastActivity, personState, unchangedCount } from '../src/logic/status.ts';
import { DEFAULT_SETTINGS } from '../src/store/settings.ts';
import type { LearnerNotes } from '../src/types.ts';
import { TODAY, fixtureModel } from './helpers.ts';

const model = fixtureModel();
const S = DEFAULT_SETTINGS;
const person = (email: string) => {
  const p = model.personByKey.get(email);
  assert.ok(p, email);
  return p;
};
const state = (email: string, notes?: LearnerNotes) => personState(person(email), notes, S, TODAY);

test('person in 2 courses, progress in only one → active', () => {
  const st = state('anna.aktiv.inf24@stud.example.ch');
  assert.equal(person('anna.aktiv.inf24@stud.example.ch').enrollments.length, 2);
  assert.equal(st.status, 'active');
  assert.equal(st.activity.date, '2026-10-28');
  const a = st.courses.find((c) => model.courseByKey.get(c.courseKey)!.name.startsWith('JavaScript'))!;
  assert.equal(a.level, 'alert', 'course without progress still marked');
});

test('no activity for more than 42 days → alert', () => {
  const st = state('bruno.brach.inf24@stud.example.ch');
  assert.equal(st.status, 'alert');
  assert.equal(st.activity.source, 'submitted');
  assert.ok(st.days > 42);
});

test('no submitted assessment, enrolled 50 days ago → alert, firstSeen', () => {
  const st = state('carla.leer.im26@stud.example.ch');
  assert.equal(st.status, 'alert');
  assert.equal(st.activity.source, 'firstSeen');
  assert.equal(st.activity.date, '2026-09-12');
  assert.equal(st.days, 50);
});

test('two snapshots on the same day → newer export wins', () => {
  const f = model.files.find((x) => x.fileName === '2026-10-20-JavaScript-Essentials-1-202627_gradebook.json')!;
  assert.equal(f.status, 'replaced');
  const d = person('david.doppel.inf24@stud.example.ch').enrollments[0];
  assert.equal(d.points.filter((x) => x.snapshotDate === '2026-10-20').length, 1);
  const p = d.points.find((x) => x.snapshotDate === '2026-10-20')!;
  assert.equal(p.exportedAt, '2026-10-20T14:00:00.000Z');
  assert.equal(p.assessments[1].score, 90);
  assert.equal(state('david.doppel.inf24@stud.example.ch').status, 'active');
});

test('identical consecutive snapshots → unchanged since 2 snapshots', () => {
  const h = person('hans.neu.inf24@stud.example.ch');
  assert.equal(unchangedCount(h.enrollments[0]), 2);
  const st = state('hans.neu.inf24@stud.example.ch');
  assert.equal(st.unchanged, 2);
  assert.equal(st.status, 'new');
});

test('person missing in newest snapshot → gone', () => {
  assert.equal(state('eva.weg.im26@stud.example.ch').status, 'gone');
});

test('lower score → anomaly, not progress', () => {
  const e = person('felix.fallend.inf24@stud.example.ch').enrollments[0];
  const i = e.points.findIndex((p) => p.snapshotDate === '2026-10-25');
  const c = compare(e.points[i - 1], e.points[i]);
  assert.equal(c.progress, false);
  assert.ok(c.anomalies.some((a) => a.kind === 'scoreDrop'));
  assert.ok(c.anomalies.some((a) => a.kind === 'gradeDrop'));
  assert.equal(lastActivity(e).date, '2026-09-10');
  assert.equal(state('felix.fallend.inf24@stud.example.ch').status, 'alert');
});

test('snoozeUntil in the future → snoozed', () => {
  const email = 'gina.pause.im26@stud.example.ch';
  assert.equal(state(email).status, 'alert');
  assert.equal(state(email, { note: '', contacts: [], snoozeUntil: '2026-12-01' }).status, 'snoozed');
  assert.equal(state(email, { note: '', contacts: [], snoozeUntil: '2026-10-31' }).status, 'alert');
});

test('completed; contacted since watch/alert began', () => {
  assert.equal(state('ida.fertig.im26@stud.example.ch').status, 'completed');
  const st = state('bruno.brach.inf24@stud.example.ch', {
    note: '', snoozeUntil: null,
    contacts: [{ id: 'c_1', date: '2026-10-30', channel: 'E-Mail', text: '', reply: '' }],
  });
  assert.equal(st.contactedOn, '2026-10-30');
});

test('person without email: name key and warning', () => {
  const p = model.people.find((x) => x.key === 'name:Ohnemail, Otto');
  assert.ok(p);
  assert.ok(p.warnings.length);
  const f = model.files.find((x) => x.fileName.startsWith('2026-11-01-Networking'))!;
  assert.ok(f.warnings.some((w) => /ohne E-Mail/.test(w)));
});

test('progress not datable via submittedOn → snapshot date', () => {
  const pt = (o: Partial<Point>): Point => ({
    snapshotDate: '2026-10-01', exportedAt: '', classGrade: 10, status: 'IN PROGRESS', finalExamScore: null,
    finalExamSubmitted: false, surveySubmitted: false, markedComplete: false, assessments: [], ...o,
  });
  const enr = {
    personKey: 'x', courseKey: 'k', inLatest: true, firstSeen: '2026-09-01', points: [
      pt({ snapshotDate: '2026-09-01' }), pt({ snapshotDate: '2026-10-01', classGrade: 20 }), pt({ snapshotDate: '2026-10-15', classGrade: 20 }),
    ],
  };
  assert.deepEqual(lastActivity(enr), { date: '2026-10-01', source: 'snapshot' });
  assert.equal(unchangedCount(enr), 2);
});

const snap = (course: string, exportedAt: string, courseId: string, snapshotDate = '2026-11-01') => ({
  fileName: `${snapshotDate}-${courseId}-${exportedAt}.json`,
  result: parseSnapshotText(JSON.stringify({
    format: 'netacad-gradebook/1', snapshotDate, exportedAt, course, url: '/launch', courseId,
    learners: [{ name: 'A, B', email: 'a@b.ch' }],
  })),
});
const UUID_A = 'b68f5a66-bdb0-41d3-8788-65776afbf9ee';
const UUID_B = 'fc60568b-7bad-4fb3-9b4c-22f735042a79';

test('courseId is the key: same URL path and same day stay separate courses', () => {
  const m = buildModel([snap('Kurs A 2026/27', '2026-11-01T10:00:00Z', UUID_A), snap('Kurs B 2026/27', '2026-11-01T10:05:00Z', UUID_B)]);
  assert.equal(m.courses.length, 2);
  assert.deepEqual(m.courses.map((c) => c.key).sort(), [UUID_A, UUID_B]);
  assert.ok(m.files.every((f) => f.status === 'ok'));
  assert.equal(m.people[0].enrollments.length, 2);
});

test('renamed course stays one course (same courseId); ID is case-insensitive', () => {
  const m = buildModel([
    snap('Kurs A', '2026-10-01T10:00:00Z', UUID_A.toUpperCase(), '2026-10-01'),
    snap('Kurs A (neu)', '2026-11-01T10:00:00Z', UUID_A),
  ]);
  assert.equal(m.courses.length, 1);
  assert.equal(m.courses[0].name, 'Kurs A (neu)');
  assert.equal(m.courses[0].snapshots.length, 2);
});

test('snapshot without courseId is invalid with reason', () => {
  const r = parseSnapshotText(JSON.stringify({
    format: 'netacad-gradebook/1', snapshotDate: '2026-11-01', exportedAt: '2026-11-01T10:00:00Z', course: 'K', url: '/launch', learners: [],
  }));
  assert.ok(!r.ok);
  assert.match(r.error, /courseId/);
});

test('course stats: counts, median, histogram', () => {
  const b = model.courses.find((c) => c.name.startsWith('Networking'))!;
  const s = courseStats(b, S, TODAY);
  assert.equal(s.enrolled, 6);
  assert.equal(s.counts.completed, 1);
  assert.equal(s.assessments[0].submitted, 3);
  assert.equal(s.assessments[0].median, 75);
  assert.deepEqual(s.highest.map((h) => h.count), [3, 1, 1, 1]);
  assert.equal(daysBetween('2026-09-12', TODAY), 50);
});
