import { html } from 'hono/html';
import type { Course, Person } from '../logic/model.ts';
import type { CourseState, PersonState } from '../logic/status.ts';
import type { Flag } from '../types.ts';
import { STATUS_META, fillTemplate, firstName, fmtDate, fmtNum, fmtPct } from './format.ts';
import type { Html } from './layout.ts';

/** Context for the contact template: the person and the course with the longest inactivity. */
export type TemplateContext = {
  person: Person;
  state: PersonState;
  course: Course;
  cs: CourseState;
  courseName: (courseKey: string) => string;
};

const flag = (f: Flag) => (f === true ? 'ja' : f === false ? 'nein' : f ?? '–');
const list = (xs: string[]) => (xs.length ? xs.join(', ') : '–');

function lastName(name: string): string {
  const i = name.indexOf(',');
  return i >= 0 ? name.slice(0, i).trim() : '';
}

type Placeholder = { key: string; label: string; value: (c: TemplateContext) => string };

/** Single source for expansion and for the hint under the settings textarea. */
export const PLACEHOLDERS: { group: string; items: Placeholder[] }[] = [
  {
    group: 'Person',
    items: [
      { key: 'firstName', label: 'Vorname (Teil des Namens nach dem Komma)', value: (c) => firstName(c.person.name) },
      { key: 'lastName', label: 'Nachname (Teil vor dem Komma)', value: (c) => lastName(c.person.name) },
      { key: 'name', label: 'voller Name laut NetAcad («Nachname, Vorname»)', value: (c) => c.person.name },
      { key: 'email', label: 'E-Mail-Adresse', value: (c) => c.person.email ?? '–' },
      { key: 'progressStatus', label: 'Status in dieser Übersicht (z. B. «nachfragen»)', value: (c) => STATUS_META[c.state.status].label },
      { key: 'lastActivityAll', label: 'letzte Aktivität über alle Kurse', value: (c) => fmtDate(c.state.activity.date) },
      { key: 'daysInactiveAll', label: 'Tage seit der letzten Aktivität über alle Kurse', value: (c) => String(c.state.days) },
      { key: 'allCourses', label: 'alle Kurse der Person', value: (c) => list(c.state.courses.map((s) => c.courseName(s.courseKey))) },
    ],
  },
  {
    group: 'Kurs (der Kurs mit der längsten Inaktivität)',
    items: [
      { key: 'course', label: 'Kurstitel', value: (c) => c.course.name },
      { key: 'courseId', label: 'Kurs-ID laut NetAcad', value: (c) => c.course.courseId },
      { key: 'snapshotDate', label: 'Datum des neuesten Snapshots des Kurses', value: (c) => fmtDate(c.course.snapshots[c.course.snapshots.length - 1].snapshotDate) },
      { key: 'lastActivity', label: 'letzte Aktivität in diesem Kurs', value: (c) => fmtDate(c.cs.activity.date) },
      { key: 'daysInactive', label: 'Tage seit der letzten Aktivität in diesem Kurs', value: (c) => String(c.cs.days) },
      { key: 'firstSeen', label: 'erster Snapshot mit dieser Person im Kurs', value: (c) => fmtDate(c.cs.enrollment.firstSeen) },
      { key: 'status', label: 'Status laut NetAcad (z. B. «IN PROGRESS»)', value: (c) => c.cs.last.status ?? '–' },
      { key: 'classGrade', label: 'Klassennote in Prozent', value: (c) => fmtPct(c.cs.last.classGrade) },
      { key: 'submittedCount', label: 'Anzahl abgelegter Prüfungen', value: (c) => String(c.cs.submitted) },
      { key: 'assessmentCount', label: 'Anzahl Prüfungen im Kurs', value: (c) => String(c.cs.total) },
      { key: 'lastAssessment', label: 'zuletzt abgelegte Prüfung (nach Datum)', value: (c) => lastSubmitted(c.cs) },
      { key: 'nextAssessment', label: 'nächste offene Prüfung (nach Spaltenreihenfolge)', value: (c) => c.cs.last.assessments.find((a) => a.score === null)?.name ?? '–' },
      { key: 'openAssessments', label: 'alle offenen Prüfungen', value: (c) => list(c.cs.last.assessments.filter((a) => a.score === null).map((a) => a.name)) },
      { key: 'finalExamScore', label: 'Punkte der Abschlussprüfung', value: (c) => (c.cs.last.finalExamScore === null ? '–' : fmtNum(c.cs.last.finalExamScore)) },
      { key: 'finalExamSubmitted', label: 'Abschlussprüfung abgegeben (ja/nein)', value: (c) => flag(c.cs.last.finalExamSubmitted) },
      { key: 'surveySubmitted', label: 'Umfrage abgegeben (ja/nein)', value: (c) => flag(c.cs.last.surveySubmitted) },
      { key: 'markedComplete', label: 'als abgeschlossen markiert (ja/nein)', value: (c) => flag(c.cs.last.markedComplete) },
    ],
  },
];

function lastSubmitted(cs: CourseState): string {
  const subs = cs.last.assessments.filter((a) => a.score !== null && a.submittedOn).sort((a, b) => (b.submittedOn as string).localeCompare(a.submittedOn as string));
  if (!subs.length) return '–';
  const a = subs[0];
  return `${a.name} (${fmtNum(a.score as number)}${a.maxScore !== null ? '/' + fmtNum(a.maxScore) : ''}, ${fmtDate(a.submittedOn)})`;
}

export function templateVars(c: TemplateContext): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of PLACEHOLDERS) for (const p of g.items) out[p.key] = p.value(c);
  return out;
}

export function expandTemplate(tpl: string, c: TemplateContext): string {
  return fillTemplate(tpl, templateVars(c));
}

export function placeholderHint(): Html {
  return html`<details class="placeholders"><summary>Platzhalter (${PLACEHOLDERS.reduce((n, g) => n + g.items.length, 0)})</summary>
${PLACEHOLDERS.map((g) => html`<p><small><strong>${g.group}</strong></small></p>
<dl class="facts">${g.items.map((p) => html`<dt><code>{${p.key}}</code></dt><dd>${p.label}</dd>`)}</dl>`)}
<p><small>Gelten für Betreff und Text. Unbekannte Platzhalter bleiben unverändert stehen.</small></p>
</details>`;
}
