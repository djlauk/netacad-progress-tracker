import { createHash } from 'node:crypto';
import type { AssessmentDef, Flag, LearnerAssessment, Snapshot, SnapshotLearner } from '../types.ts';
import type { ParseResult } from './parse.ts';

export type SnapshotFile = { fileName: string; result: ParseResult };

export type FileStatus = 'ok' | 'replaced' | 'invalid';

export type FileInfo = {
  fileName: string;
  status: FileStatus;
  reason: string | null;
  course: string | null;
  courseKey: string | null;
  snapshotDate: string | null;
  exportedAt: string | null;
  learnerCount: number | null;
  warnings: string[];
};

export type Point = {
  snapshotDate: string;
  exportedAt: string;
  classGrade: number | null;
  status: string | null;
  finalExamScore: number | null;
  finalExamSubmitted: Flag;
  surveySubmitted: Flag;
  markedComplete: Flag;
  assessments: LearnerAssessment[];
};

export type Enrollment = {
  personKey: string;
  courseKey: string;
  points: Point[];
  /** Person is listed in the newest snapshot of the course. */
  inLatest: boolean;
  firstSeen: string;
};

export type CourseSnapshotRef = { snapshotDate: string; exportedAt: string; fileName: string; learnerCount: number };

export type Course = {
  key: string;
  id: string;
  name: string;
  url: string | null;
  courseId: string;
  snapshots: CourseSnapshotRef[];
  latest: Snapshot;
  assessments: AssessmentDef[];
  enrollments: Enrollment[];
};

export type Person = {
  key: string;
  id: string;
  name: string;
  email: string | null;
  enrollments: Enrollment[];
  warnings: string[];
};

export type Model = {
  files: FileInfo[];
  courses: Course[];
  people: Person[];
  courseByKey: Map<string, Course>;
  courseById: Map<string, Course>;
  personByKey: Map<string, Person>;
  personById: Map<string, Person>;
};

export function shortId(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

export function personKeyOf(l: Pick<SnapshotLearner, 'email' | 'name'>): string {
  const e = l.email?.trim().toLowerCase();
  return e ? e : `name:${l.name.trim()}`;
}

/**
 * Course key = NetAcad course ID (query parameter `id` of the gradebook page).
 * Not `url`: NetAcad serves every gradebook under the same path ("/launch").
 */
export function courseKeyOf(s: Pick<Snapshot, 'courseId'>): string {
  return s.courseId;
}

/** Warning if a snapshot has clearly fewer learners than the previous one. */
export function fewerLearnersWarning(prevCount: number, count: number): string | null {
  if (prevCount - count >= 2 && count < prevCount * 0.8) {
    return `deutlich weniger Lernende als im vorherigen Snapshot (${count} statt ${prevCount}): alle Seiten geladen?`;
  }
  return null;
}

export function missingEmailWarning(s: Snapshot): string | null {
  const n = s.learners.filter((l) => !l.email).length;
  return n ? `${n} ${n === 1 ? 'Person' : 'Personen'} ohne E-Mail-Adresse` : null;
}

const bySnapshotOrder = (a: Snapshot, b: Snapshot) =>
  a.snapshotDate.localeCompare(b.snapshotDate) || a.exportedAt.localeCompare(b.exportedAt);

function toPoint(s: Snapshot, l: SnapshotLearner): Point {
  return {
    snapshotDate: s.snapshotDate,
    exportedAt: s.exportedAt,
    classGrade: l.classGrade,
    status: l.status,
    finalExamScore: l.finalExamScore,
    finalExamSubmitted: l.finalExamSubmitted,
    surveySubmitted: l.surveySubmitted,
    markedComplete: l.markedComplete,
    assessments: l.assessments,
  };
}

export function buildModel(input: SnapshotFile[]): Model {
  const files: FileInfo[] = [];
  const valid: { file: FileInfo; snapshot: Snapshot }[] = [];

  for (const f of [...input].sort((a, b) => a.fileName.localeCompare(b.fileName))) {
    if (!f.result.ok) {
      files.push({
        fileName: f.fileName, status: 'invalid', reason: f.result.error, course: null, courseKey: null,
        snapshotDate: null, exportedAt: null, learnerCount: null, warnings: [],
      });
      continue;
    }
    const s = f.result.snapshot;
    const info: FileInfo = {
      fileName: f.fileName, status: 'ok', reason: null, course: s.course, courseKey: courseKeyOf(s),
      snapshotDate: s.snapshotDate, exportedAt: s.exportedAt, learnerCount: s.learners.length, warnings: [],
    };
    const w = missingEmailWarning(s);
    if (w) info.warnings.push(w);
    files.push(info);
    valid.push({ file: info, snapshot: s });
  }


  // Duplicates: same course + snapshotDate → newest exportedAt wins.
  const groups = new Map<string, { file: FileInfo; snapshot: Snapshot }[]>();
  for (const v of valid) {
    const k = `${v.file.courseKey}\u0000${v.snapshot.snapshotDate}`;
    const g = groups.get(k);
    if (g) g.push(v);
    else groups.set(k, [v]);
  }
  const effective: { file: FileInfo; snapshot: Snapshot }[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => b.snapshot.exportedAt.localeCompare(a.snapshot.exportedAt) || a.file.fileName.localeCompare(b.file.fileName));
    effective.push(g[0]);
    for (const r of g.slice(1)) {
      r.file.status = 'replaced';
      r.file.reason = `ersetzt durch ${g[0].file.fileName}`;
    }
  }

  // Per course, chronological.
  const byCourse = new Map<string, { file: FileInfo; snapshot: Snapshot }[]>();
  for (const e of effective) {
    const k = e.file.courseKey as string;
    const list = byCourse.get(k);
    if (list) list.push(e);
    else byCourse.set(k, [e]);
  }

  const courses: Course[] = [];
  const people = new Map<string, Person & { lastSeen: string }>();

  for (const [key, list] of byCourse) {
    list.sort((a, b) => bySnapshotOrder(a.snapshot, b.snapshot));
    for (let i = 1; i < list.length; i++) {
      const w = fewerLearnersWarning(list[i - 1].snapshot.learners.length, list[i].snapshot.learners.length);
      if (w) list[i].file.warnings.push(w);
    }
    const latest = list[list.length - 1].snapshot;
    const enrollments = new Map<string, Enrollment>();
    const latestKeys = new Set(latest.learners.map(personKeyOf));

    for (const { snapshot: s, file } of list) {
      const seen = new Set<string>();
      for (const l of s.learners) {
        const pk = personKeyOf(l);
        if (seen.has(pk)) {
          file.warnings.push(`Person mehrfach im Snapshot (nur erster Eintrag gilt)`);
          continue;
        }
        seen.add(pk);
        let enr = enrollments.get(pk);
        if (!enr) {
          enr = { personKey: pk, courseKey: key, points: [], inLatest: latestKeys.has(pk), firstSeen: s.snapshotDate };
          enrollments.set(pk, enr);
        }
        enr.points.push(toPoint(s, l));

        let p = people.get(pk);
        if (!p) {
          p = { key: pk, id: shortId(pk), name: l.name, email: l.email, enrollments: [], warnings: [], lastSeen: '' };
          if (!l.email) p.warnings.push('Keine E-Mail-Adresse im Snapshot; Zuordnung über den Namen');
          people.set(pk, p);
        }
        if (s.snapshotDate >= p.lastSeen) {
          p.lastSeen = s.snapshotDate;
          if (l.name) p.name = l.name;
          if (l.email) p.email = l.email;
        }
      }
    }

    // Assessment columns: newest snapshot order, plus names only seen earlier.
    const assessments: AssessmentDef[] = [...latest.assessments];
    const names = new Set(assessments.map((a) => a.name));
    for (const { snapshot: s } of list) {
      for (const a of s.assessments) if (!names.has(a.name)) { names.add(a.name); assessments.push(a); }
      for (const l of s.learners) for (const a of l.assessments) {
        if (!names.has(a.name)) { names.add(a.name); assessments.push({ name: a.name, dueDate: null }); }
      }
    }

    const course: Course = {
      key, id: shortId(key), name: latest.course, url: latest.url, courseId: latest.courseId,
      snapshots: list.map(({ snapshot: s, file }) => ({
        snapshotDate: s.snapshotDate, exportedAt: s.exportedAt, fileName: file.fileName, learnerCount: s.learners.length,
      })),
      latest, assessments, enrollments: [...enrollments.values()],
    };
    courses.push(course);
    for (const e of course.enrollments) people.get(e.personKey)!.enrollments.push(e);
  }

  courses.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const courseByKey = new Map(courses.map((c) => [c.key, c]));
  const peopleList: Person[] = [...people.values()].map(({ lastSeen: _ls, ...p }) => {
    p.enrollments.sort((a, b) => courseByKey.get(a.courseKey)!.name.localeCompare(courseByKey.get(b.courseKey)!.name, 'de'));
    return p;
  });
  peopleList.sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return {
    files,
    courses,
    people: peopleList,
    courseByKey,
    courseById: new Map(courses.map((c) => [c.id, c])),
    personByKey: new Map(peopleList.map((p) => [p.key, p])),
    personById: new Map(peopleList.map((p) => [p.id, p])),
  };
}

