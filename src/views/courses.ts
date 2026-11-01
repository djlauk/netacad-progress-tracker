import { html } from 'hono/html';
import type { Course, Model } from '../logic/model.ts';
import { courseStats, type CourseStats } from '../logic/status.ts';
import type { Settings } from '../types.ts';
import { fmtDate, fmtNum } from './format.ts';
import type { Html } from './layout.ts';
import { bar } from './charts.ts';

function countsLine(s: CourseStats): Html {
  return html`<p class="counters">🔴 ${s.counts.alert}<span class="visually-hidden"> inaktiv</span> · 🟡 ${s.counts.watch}<span class="visually-hidden"> beobachten</span> · 🟢 ${s.counts.active}<span class="visually-hidden"> aktiv</span> · ✅ ${s.counts.completed}<span class="visually-hidden"> abgeschlossen</span></p>`;
}

export function coursesPage(model: Model, settings: Settings, today: string): Html {
  return html`<hgroup class="page-head"><h1>Kurse</h1><p>Kennzahlen auf Basis des neuesten Snapshots</p></hgroup>
${model.courses.length ? '' : html`<p class="muted">Noch keine Snapshots. <a href="/files">Dateien hochladen</a></p>`}
<div class="cards">
${model.courses.map((c) => {
  const s = courseStats(c, settings, today);
  const last = c.snapshots[c.snapshots.length - 1];
  return html`<article>
<header><h2><a href="/courses/${c.id}" hx-boost="true">${c.name}</a></h2>
<small>Stand ${fmtDate(last.snapshotDate)} · ${c.snapshots.length} ${c.snapshots.length === 1 ? 'Snapshot' : 'Snapshots'}</small></header>
<p><strong>${s.enrolled}</strong> eingeschrieben</p>
${countsLine(s)}
<table class="compact"><thead><tr><th>Prüfung</th><th>abgelegt</th><th>Median</th></tr></thead><tbody>
${s.assessments.map((a) => html`<tr><td>${a.name}</td><td>${a.submitted}/${s.enrolled}</td><td>${a.median === null ? '–' : fmtNum(a.median)}</td></tr>`)}
</tbody></table>
</article>`;
})}
</div>`;
}

export function histogram(s: CourseStats): Html {
  const max = Math.max(1, ...s.highest.map((h) => h.count));
  return html`<table class="compact histogram"><thead><tr><th>höchste abgelegte Prüfung</th><th>Personen</th><th></th></tr></thead><tbody>
${s.highest.map((h) => html`<tr><td>${h.label}</td><td>${h.count}</td><td>${bar(h.count, max)}</td></tr>`)}
</tbody></table>`;
}

export function coursePage(c: Course, model: Model, settings: Settings, today: string): Html {
  const s = courseStats(c, settings, today);
  const last = c.snapshots[c.snapshots.length - 1];
  const current = c.enrollments.filter((e) => e.inLatest).map((e) => ({ e, p: model.personByKey.get(e.personKey)!, last: e.points[e.points.length - 1] }))
    .sort((a, b) => a.p.name.localeCompare(b.p.name, 'de'));
  const gone = c.enrollments.filter((e) => !e.inLatest).map((e) => model.personByKey.get(e.personKey)!);
  return html`<p><a href="/courses" hx-boost="true">← Kurse</a></p>
<hgroup class="page-head"><h1>${c.name}</h1><p>Stand ${fmtDate(last.snapshotDate)} · ${c.snapshots.length} Snapshots · ${s.enrolled} eingeschrieben</p></hgroup>
${countsLine(s)}
<h2>Lernende</h2>
<div class="table-scroll"><table class="compact striped wide" hx-boost="true"><thead><tr><th class="sticky">Name</th><th>Klassennote</th>
${c.assessments.map((a, i) => html`<th class="assess-col" title="${a.name}${a.dueDate ? ' · fällig ' + fmtDate(a.dueDate) : ''}">${i + 1}</th>`)}</tr></thead><tbody>
${current.map(({ p, last }) => {
  const by = new Map(last.assessments.map((a) => [a.name, a]));
  return html`<tr><td class="sticky"><a href="/people/${p.id}">${p.name || p.email}</a>${p.name && p.email ? html`<br><small class="email">${p.email}</small>` : ''}</td><td>${last.classGrade === null ? '–' : fmtNum(last.classGrade)}</td>
${c.assessments.map((a) => { const x = by.get(a.name); return html`<td class="num" title="${a.name}${x?.submittedOn ? ' · ' + fmtDate(x.submittedOn) : ''}">${x && x.score !== null ? fmtNum(x.score) : ''}</td>`; })}</tr>`;
})}
</tbody></table></div>
${gone.length ? html`<p><small>Nicht mehr im neuesten Snapshot: ${gone.map((p, i) => html`${i ? ', ' : ''}<a href="/people/${p.id}">${p.name || p.email}</a>`)}</small></p>` : ''}
<div class="grid two-col">
<section><h2>Wo stehen die Lernenden?</h2>${histogram(s)}</section>
<section><h2>Prüfungen</h2>
<div class="table-scroll"><table class="compact striped"><thead><tr><th>#</th><th>Prüfung</th><th>abgelegt</th><th>Median</th><th>früheste</th><th>späteste</th></tr></thead><tbody>
${s.assessments.map((a, i) => html`<tr><td>${i + 1}</td><td>${a.name}</td><td>${a.submitted}/${s.enrolled}</td><td>${a.median === null ? '–' : fmtNum(a.median) + (a.maxScore !== null ? '/' + fmtNum(a.maxScore) : '')}</td><td>${fmtDate(a.earliest)}</td><td>${fmtDate(a.latest)}</td></tr>`)}
</tbody></table></div></section>
</div>`;
}

export function timelinePage(model: Model, events: { date: string; personKey: string; courseKey: string; text: string }[]): Html {
  const shown = events.slice(0, 500);
  return html`<hgroup class="page-head"><h1>Zeitachse</h1><p>Prüfungsabgaben und Statuswechsel, neueste zuerst</p></hgroup>
${shown.length ? html`<ul class="timeline" hx-boost="true">${shown.map((e) => {
  const p = model.personByKey.get(e.personKey)!;
  const c = model.courseByKey.get(e.courseKey)!;
  return html`<li>${fmtDate(e.date)} · <a href="/people/${p.id}">${p.name || p.email}</a> · ${c.name} · ${e.text}</li>`;
})}</ul>${events.length > shown.length ? html`<p class="muted">… und ${events.length - shown.length} ältere Ereignisse</p>` : ''}` : html`<p class="muted">Keine Ereignisse.</p>`}`;
}
