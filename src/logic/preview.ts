import type { Snapshot } from '../types.ts';
import { courseKeyOf, fewerLearnersWarning, missingEmailWarning, personKeyOf, type Model } from './model.ts';

export type Preview = {
  snapshot: Snapshot;
  courseKey: string;
  isNewCourse: boolean;
  previousDate: string | null;
  newSubmissions: number | null;
  newLearners: number | null;
  missingLearners: number | null;
  duplicateOf: string | null;
  warnings: string[];
  infos: string[];
};

/** Compare an incoming snapshot with what is already stored (pure). */
export function previewSnapshot(s: Snapshot, model: Model): Preview {
  const courseKey = courseKeyOf(s);
  const course = model.courseByKey.get(courseKey);
  const warnings: string[] = [];
  const infos: string[] = [];
  const dup = model.files.find((f) => f.courseKey === courseKey && f.exportedAt === s.exportedAt);
  const mw = missingEmailWarning(s);
  if (mw) warnings.push(mw);
  if (!s.learners.length) warnings.push('Der Snapshot enthält keine Lernenden.');

  let previousDate: string | null = null, newSubmissions: number | null = null, newLearners: number | null = null, missingLearners: number | null = null;
  if (course) {
    // Latest stored snapshot strictly before (or the same day as) this one.
    const before = course.snapshots.filter((r) => r.snapshotDate <= s.snapshotDate && r.exportedAt !== s.exportedAt);
    const ref = before[before.length - 1];
    if (ref) {
      previousDate = ref.snapshotDate;
      const prevByKey = new Map<string, Map<string, number | null>>();
      for (const e of course.enrollments) {
        const p = e.points.find((x) => x.exportedAt === ref.exportedAt && x.snapshotDate === ref.snapshotDate);
        if (p) prevByKey.set(e.personKey, new Map(p.assessments.map((a) => [a.name, a.score])));
      }
      newSubmissions = 0;
      newLearners = 0;
      for (const l of s.learners) {
        const prev = prevByKey.get(personKeyOf(l));
        if (!prev) newLearners++;
        for (const a of l.assessments) if (a.score !== null && (prev?.get(a.name) ?? null) === null) newSubmissions++;
      }
      const keys = new Set(s.learners.map(personKeyOf));
      missingLearners = [...prevByKey.keys()].filter((k) => !keys.has(k)).length;
      const w = fewerLearnersWarning(ref.learnerCount, s.learners.length);
      if (w) warnings.push(w);
    }
    const last = course.snapshots[course.snapshots.length - 1];
    if (s.snapshotDate < last.snapshotDate) infos.push(`Älter als der neueste gespeicherte Snapshot dieses Kurses (${last.snapshotDate}).`);
    const sameDay = course.snapshots.find((r) => r.snapshotDate === s.snapshotDate && r.exportedAt !== s.exportedAt);
    if (sameDay && !dup) {
      infos.push(s.exportedAt > sameDay.exportedAt
        ? 'Für diesen Tag gibt es schon einen Snapshot; der neue Export ersetzt ihn in der Auswertung.'
        : 'Für diesen Tag gibt es schon einen neueren Export; dieser hier wird als «ersetzt» abgelegt.');
    }
  }
  return {
    snapshot: s, courseKey, isNewCourse: !course, previousDate, newSubmissions, newLearners, missingLearners,
    duplicateOf: dup ? dup.fileName : null, warnings, infos,
  };
}
