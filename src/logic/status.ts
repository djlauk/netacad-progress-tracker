import type { ActivityLevel, ActivitySource, LearnerNotes, Settings, StatusCode } from '../types.ts';
import type { Course, Enrollment, Person, Point } from './model.ts';

export type ProgressEvent =
  | { kind: 'score'; name: string; from: number | null; to: number; maxScore: number | null; submittedOn: string | null }
  | { kind: 'grade'; from: number | null; to: number }
  | { kind: 'flag'; flag: 'finalExamSubmitted' | 'surveySubmitted' | 'markedComplete' }
  | { kind: 'status'; from: string | null; to: string | null };

export type Anomaly =
  | { kind: 'scoreDrop'; name: string; from: number; to: number | null }
  | { kind: 'gradeDrop'; from: number; to: number | null };

export type Comparison = {
  progress: boolean;
  events: ProgressEvent[];
  anomalies: Anomaly[];
  /** Progress that cannot be dated via submittedOn. */
  undatable: boolean;
};

const FLAGS = ['finalExamSubmitted', 'surveySubmitted', 'markedComplete'] as const;

const DAY = 86_400_000;
const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

/** Whole days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY);
}

export function addDays(d: string, n: number): string {
  return new Date(utc(d) + n * DAY).toISOString().slice(0, 10);
}

/** Progress between two snapshots (6.1). */
export function compare(prev: Point, cur: Point): Comparison {
  const events: ProgressEvent[] = [];
  const anomalies: Anomaly[] = [];
  let undatable = false;
  const before = new Map(prev.assessments.map((a) => [a.name, a]));
  let datedScore = false;

  for (const a of cur.assessments) {
    const b = before.get(a.name);
    const from = b?.score ?? null;
    if (a.score !== null && (from === null || a.score > from)) {
      events.push({ kind: 'score', name: a.name, from, to: a.score, maxScore: a.maxScore, submittedOn: a.submittedOn });
      if (a.submittedOn) datedScore = true;
      else undatable = true;
    } else if (from !== null && (a.score === null || a.score < from)) {
      anomalies.push({ kind: 'scoreDrop', name: a.name, from, to: a.score });
    }
  }
  if (cur.classGrade !== null && (prev.classGrade === null ? cur.classGrade > 0 : cur.classGrade > prev.classGrade)) {
    events.push({ kind: 'grade', from: prev.classGrade, to: cur.classGrade });
    if (!datedScore) undatable = true;
  } else if (prev.classGrade !== null && (cur.classGrade === null || cur.classGrade < prev.classGrade)) {
    anomalies.push({ kind: 'gradeDrop', from: prev.classGrade, to: cur.classGrade });
  }
  for (const f of FLAGS) {
    if (prev[f] !== true && cur[f] === true) {
      events.push({ kind: 'flag', flag: f });
      undatable = true;
    }
  }
  if ((prev.status ?? '') !== (cur.status ?? '')) {
    events.push({ kind: 'status', from: prev.status, to: cur.status });
    undatable = true;
  }
  return { progress: events.length > 0, events, anomalies, undatable };
}

export type Activity = { date: string; source: ActivitySource };

/** Last activity in one course (6.2). */
export function lastActivity(enr: Enrollment): Activity {
  let submitted: string | null = null;
  for (const p of enr.points) for (const a of p.assessments) {
    if (a.score !== null && a.submittedOn && (!submitted || a.submittedOn > submitted)) submitted = a.submittedOn;
  }
  let snapshot: string | null = null;
  for (let i = 1; i < enr.points.length; i++) {
    const c = compare(enr.points[i - 1], enr.points[i]);
    if (c.progress && c.undatable) snapshot = enr.points[i].snapshotDate;
  }
  if (submitted && (!snapshot || submitted >= snapshot)) return { date: submitted, source: 'submitted' };
  if (snapshot) return { date: snapshot, source: 'snapshot' };
  return { date: enr.firstSeen, source: 'firstSeen' };
}

const signature = (p: Point) =>
  JSON.stringify([p.classGrade, p.status, p.finalExamScore, p.finalExamSubmitted, p.surveySubmitted, p.markedComplete,
    p.assessments.map((a) => [a.name, a.score, a.submittedOn])]);

/** Number of trailing snapshots with identical data (≥ 1). */
export function unchangedCount(enr: Enrollment): number {
  const pts = enr.points;
  if (!pts.length) return 0;
  const last = signature(pts[pts.length - 1]);
  let n = 1;
  for (let i = pts.length - 2; i >= 0 && signature(pts[i]) === last; i--) n++;
  return n;
}

export function isCompleted(p: Point): boolean {
  return p.markedComplete === true || (p.status ?? '').toUpperCase().includes('COMPLET');
}

export function activityLevel(days: number, s: Pick<Settings, 'warnDays' | 'alertDays'>): ActivityLevel {
  if (days < s.warnDays) return 'active';
  if (days < s.alertDays) return 'watch';
  return 'alert';
}

export type CourseState = {
  courseKey: string;
  enrollment: Enrollment;
  last: Point;
  prev: Point | null;
  activity: Activity;
  days: number;
  level: ActivityLevel;
  completed: boolean;
  inLatest: boolean;
  submitted: number;
  total: number;
  gradeDelta: number | null;
  /** Anomalies in the latest transition. */
  anomalies: Anomaly[];
  unchanged: number;
};

export function courseState(enr: Enrollment, settings: Settings, today: string): CourseState {
  const last = enr.points[enr.points.length - 1];
  const prev = enr.points.length > 1 ? enr.points[enr.points.length - 2] : null;
  const activity = lastActivity(enr);
  const days = daysBetween(activity.date, today);
  return {
    courseKey: enr.courseKey,
    enrollment: enr,
    last,
    prev,
    activity,
    days,
    level: activityLevel(days, settings),
    completed: isCompleted(last),
    inLatest: enr.inLatest,
    submitted: last.assessments.filter((a) => a.score !== null).length,
    total: last.assessments.length,
    gradeDelta: prev && last.classGrade !== null && prev.classGrade !== null ? last.classGrade - prev.classGrade : null,
    anomalies: prev ? compare(prev, last).anomalies : [],
    unchanged: unchangedCount(enr),
  };
}

export type PersonState = {
  status: StatusCode;
  activity: Activity;
  days: number;
  firstSeen: string;
  /** Minimum over current courses: snapshots without change. */
  unchanged: number;
  /** Date of the latest contact since the current watch/alert state began. */
  contactedOn: string | null;
  lastContact: string | null;
  snoozeUntil: string | null;
  courses: CourseState[];
};

export function personState(person: Person, notes: LearnerNotes | undefined, settings: Settings, today: string): PersonState {
  const courses = person.enrollments.map((e) => courseState(e, settings, today));
  let activity = courses[0].activity;
  for (const c of courses) if (c.activity.date > activity.date) activity = c.activity;
  const firstSeen = courses.reduce((m, c) => (c.enrollment.firstSeen < m ? c.enrollment.firstSeen : m), courses[0].enrollment.firstSeen);
  const days = daysBetween(activity.date, today);
  const current = courses.filter((c) => c.inLatest);
  const unchanged = current.length ? Math.min(...current.map((c) => c.unchanged)) : 0;
  const snoozeUntil = notes?.snoozeUntil ?? null;
  const contacts = notes?.contacts ?? [];
  const lastContact = contacts.reduce<string | null>((m, c) => (!m || c.date > m ? c.date : m), null);

  let status: StatusCode;
  if (courses.every((c) => c.completed)) status = 'completed';
  else if (courses.every((c) => !c.inLatest)) status = 'gone';
  else if (snoozeUntil && snoozeUntil >= today) status = 'snoozed';
  else if (daysBetween(firstSeen, today) < settings.newDays) status = 'new';
  else status = activityLevel(days, settings);

  let contactedOn: string | null = null;
  if (status === 'watch' || status === 'alert') {
    const since = addDays(activity.date, settings.warnDays);
    for (const c of contacts) if (c.date >= since && (!contactedOn || c.date > contactedOn)) contactedOn = c.date;
  }
  return { status, activity, days, firstSeen, unchanged, contactedOn, lastContact, snoozeUntil, courses };
}

export type AssessmentStats = {
  name: string;
  submitted: number;
  median: number | null;
  maxScore: number | null;
  earliest: string | null;
  latest: string | null;
};

export type CourseStats = {
  enrolled: number;
  counts: Record<ActivityLevel | 'completed', number>;
  assessments: AssessmentStats[];
  /** Index -1 = nothing submitted; otherwise index in course.assessments. */
  highest: { label: string; count: number }[];
};

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Highest submitted assessment by column order; -1 if none. */
export function highestIndex(course: Course, p: Point): number {
  let hi = -1;
  const scored = new Set(p.assessments.filter((a) => a.score !== null).map((a) => a.name));
  course.assessments.forEach((a, i) => { if (scored.has(a.name)) hi = i; });
  return hi;
}

export function courseStats(course: Course, settings: Settings, today: string): CourseStats {
  const current = course.enrollments.filter((e) => e.inLatest);
  const counts = { active: 0, watch: 0, alert: 0, completed: 0 };
  for (const e of current) {
    const st = courseState(e, settings, today);
    if (st.completed) counts.completed++;
    else counts[st.level]++;
  }
  const lasts = current.map((e) => e.points[e.points.length - 1]);
  const assessments = course.assessments.map((def) => {
    const subs = lasts.flatMap((p) => p.assessments.filter((a) => a.name === def.name && a.score !== null));
    const dates = subs.map((a) => a.submittedOn).filter((d): d is string => !!d).sort();
    return {
      name: def.name,
      submitted: subs.length,
      median: median(subs.map((a) => a.score as number)),
      maxScore: subs.find((a) => a.maxScore !== null)?.maxScore ?? null,
      earliest: dates[0] ?? null,
      latest: dates[dates.length - 1] ?? null,
    };
  });
  const bins = new Array(course.assessments.length + 1).fill(0);
  for (const p of lasts) bins[highestIndex(course, p) + 1]++;
  const highest = bins.map((count, i) => ({ label: i === 0 ? 'noch keine' : course.assessments[i - 1].name, count }));
  return { enrolled: current.length, counts, assessments, highest };
}

export type TimelineEvent = { date: string; personKey: string; courseKey: string; text: string };

export function timeline(courses: Course[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const c of courses) for (const e of c.enrollments) {
    const last = e.points[e.points.length - 1];
    for (const a of last.assessments) {
      if (a.score !== null && a.submittedOn) {
        out.push({ date: a.submittedOn, personKey: e.personKey, courseKey: c.key, text: `${a.name} · ${fmtNum(a.score)}${a.maxScore !== null ? '/' + fmtNum(a.maxScore) : ''}` });
      }
    }
    for (let i = 1; i < e.points.length; i++) {
      const p = e.points[i - 1], q = e.points[i];
      if ((p.status ?? '') !== (q.status ?? '')) {
        out.push({ date: q.snapshotDate, personKey: e.personKey, courseKey: c.key, text: `Status ${p.status ?? '–'} → ${q.status ?? '–'}` });
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
