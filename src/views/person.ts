import { html } from 'hono/html';
import type { Model, Person } from '../logic/model.ts';
import { compare, type PersonState } from '../logic/status.ts';
import type { LearnerNotes, Settings } from '../types.ts';
import { gradeChart } from './charts.ts';
import { SOURCE_LABEL, ago, fmtDate, fmtNum, fmtPct, LEVEL_META } from './format.ts';
import { expandTemplate } from './template.ts';
import { csrfField, type Html } from './layout.ts';
import { statusBadge, statusExtras } from './people.ts';

const CHANNELS = ['E-Mail', 'Teams', 'persönlich'];

export function contactsSection(p: Person, notes: LearnerNotes, csrf: string, today: string, msg?: string): Html {
  const list = [...notes.contacts].reverse();
  return html`<section id="contacts">
<h2>Kontaktprotokoll</h2>
${msg ? html`<p class="msg msg-ok" role="status">${msg}</p>` : ''}
${list.length ? html`<div class="table-scroll"><table class="compact striped"><thead><tr><th>Datum</th><th>Kanal</th><th>Text</th><th>Antwort</th><th></th></tr></thead><tbody>
${list.map((c) => html`<tr><td>${fmtDate(c.date)}</td><td>${c.channel}</td><td class="pre">${c.text}</td><td class="pre">${c.reply}</td><td>
<form method="post" action="/people/${p.id}/contacts/${c.id}/delete" hx-post="/people/${p.id}/contacts/${c.id}/delete" hx-target="#contacts" hx-swap="outerHTML" hx-confirm="Diesen Kontakt löschen?">${csrfField(csrf)}<button type="submit" class="secondary outline small" title="Kontakt löschen">Löschen</button></form>
</td></tr>`)}
</tbody></table></div>` : html`<p class="muted">Noch keine Kontakte erfasst.</p>`}
<details${list.length ? '' : html` open`}><summary role="button" class="outline secondary">Kontakt erfassen</summary>
<form method="post" action="/people/${p.id}/contacts" hx-post="/people/${p.id}/contacts" hx-target="#contacts" hx-swap="outerHTML">
${csrfField(csrf)}
<div class="grid">
<label>Datum<input type="date" name="date" value="${today}" required></label>
<label>Kanal<input type="text" name="channel" list="channels" value="E-Mail" maxlength="100"></label>
</div>
<datalist id="channels">${CHANNELS.map((c) => html`<option value="${c}">`)}</datalist>
<label>Text<textarea name="text" rows="2" maxlength="5000" placeholder="z. B. Nachgefragt, ob Hilfe nötig"></textarea></label>
<label>Antwort<textarea name="reply" rows="2" maxlength="5000"></textarea></label>
<button type="submit">Kontakt speichern</button>
</form>
</details>
</section>`;
}

export function noteSection(p: Person, notes: LearnerNotes, csrf: string, msg?: string): Html {
  return html`<section id="note-section">
<h2>Notiz und Pause</h2>
${msg ? html`<p class="msg msg-ok" role="status">${msg}</p>` : ''}
<form method="post" action="/people/${p.id}/note" hx-post="/people/${p.id}/note" hx-target="#note-section" hx-swap="outerHTML">
${csrfField(csrf)}
<label>Notiz<textarea name="note" rows="3" maxlength="20000">${notes.note}</textarea></label>
<label>Pausieren bis<input type="date" name="snoozeUntil" value="${notes.snoozeUntil ?? ''}"><small>Bis zu diesem Datum gilt die Person nicht als «nachfragen». Leer lassen, um die Pause aufzuheben.</small></label>
<button type="submit">Speichern</button>
</form>
</section>`;
}

function templateSection(p: Person, st: PersonState, model: Model, settings: Settings): Html {
  const pool = st.courses.filter((c) => c.inLatest && !c.completed);
  const cands = pool.length ? pool : st.courses;
  const worst = cands.reduce((m, c) => (c.activity.date < m.activity.date ? c : m), cands[0]);
  const course = model.courseByKey.get(worst.courseKey)!;
  const ctx = { person: p, state: st, course, cs: worst, courseName: (k: string) => model.courseByKey.get(k)?.name ?? k };
  const subject = expandTemplate(settings.contactSubject, ctx).replace(/\s+/g, ' ').trim();
  const text = expandTemplate(settings.contactTemplate, ctx);
  const mailto = p.email
    ? `mailto:${encodeURIComponent(p.email).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
    : null;
  return html`<section id="template">
<h2>Nachfrage-Vorlage</h2>
<div class="copy-row"><input id="template-subject" type="text" value="${subject}" readonly aria-label="Betreff"><button type="button" class="secondary outline small" data-copy-target="#template-subject">Betreff kopieren</button></div>
<textarea id="template-text" rows="6" readonly aria-label="Text">${text}</textarea>
<div class="toolbar">
<button type="button" class="secondary" data-copy-target="#template-text">Text kopieren</button>
${mailto ? html`<a role="button" class="outline" href="${mailto}">E-Mail öffnen</a>` : html`<small class="muted">Keine E-Mail-Adresse bekannt.</small>`}
</div>
</section>`;
}

function courseBlock(st: PersonState['courses'][number], model: Model): Html {
  const course = model.courseByKey.get(st.courseKey)!;
  const lv = !st.inLatest ? 'gone' : st.completed ? 'completed' : st.level;
  const pts = st.enrollment.points;
  const changes = pts.slice(1).map((q, i) => ({ date: q.snapshotDate, c: compare(pts[i], q) })).filter((x) => x.c.events.length || x.c.anomalies.length).reverse();
  return html`<article class="course-block">
<header><h3><a href="/courses/${course.id}">${course.name}</a></h3>
<p><span class="badge badge-${lv === 'completed' ? 'completed' : lv === 'gone' ? 'gone' : lv}">${LEVEL_META[lv].icon} ${LEVEL_META[lv].label}</span>
Klassennote ${fmtPct(st.last.classGrade)} · ${st.submitted}/${st.total} Prüfungen · letzte Aktivität <span title="${SOURCE_LABEL[st.activity.source]}">${fmtDate(st.activity.date)}</span> (${ago(st.days)})${
  st.unchanged >= 2 ? html` · unverändert seit ${st.unchanged} Snapshots` : ''}${!st.inLatest ? html` · fehlt im neuesten Snapshot` : ''}${
  st.last.status ? html` · NetAcad-Status: ${st.last.status}` : ''}</p></header>
${gradeChart(pts, `Verlauf der Klassennote im Kurs ${course.name}`)}
<div class="table-scroll"><table class="compact striped"><thead><tr><th>Prüfung</th><th>Punkte</th><th>abgegeben</th></tr></thead><tbody>
${st.last.assessments.map((a) => html`<tr${a.score === null ? html` class="muted"` : ''}><td>${a.name}</td><td>${a.score === null ? '–' : fmtNum(a.score) + (a.maxScore !== null ? '/' + fmtNum(a.maxScore) : '')}</td><td>${fmtDate(a.submittedOn)}</td></tr>`)}
</tbody></table></div>
${changes.length ? html`<details><summary>Änderungen zwischen Snapshots (${changes.length})</summary><ul>
${changes.map(({ date, c }) => html`<li>${fmtDate(date)}: ${[
  ...c.events.map((e) => e.kind === 'score' ? `${e.name}: ${e.from === null ? 'neu' : fmtNum(e.from) + ' →'} ${fmtNum(e.to)}`
    : e.kind === 'grade' ? `Klassennote ${e.from === null ? '–' : fmtNum(e.from)} → ${fmtNum(e.to)} %`
    : e.kind === 'flag' ? ({ finalExamSubmitted: 'Abschlussprüfung abgegeben', surveySubmitted: 'Umfrage abgegeben', markedComplete: 'als abgeschlossen markiert' })[e.flag]
    : `Status ${e.from ?? '–'} → ${e.to ?? '–'}`),
].join(' · ')}${c.anomalies.length ? html` <span class="anomaly">⚠ ${c.anomalies.map((a) => a.kind === 'scoreDrop' ? `${a.name}: ${fmtNum(a.from)} → ${a.to === null ? '–' : fmtNum(a.to)}` : `Klassennote ${fmtNum(a.from)} → ${a.to === null ? '–' : fmtNum(a.to)} %`).join(' · ')} (gesunken)</span>` : ''}</li>`)}
</ul></details>` : ''}
</article>`;
}

export function personPage(p: Person, st: PersonState, notes: LearnerNotes, model: Model, settings: Settings, csrf: string, today: string): Html {
  return html`<p><a href="/people" hx-boost="true">← Personen</a></p>
<hgroup class="page-head"><h1>${p.name || p.email}</h1><p>${p.email ?? 'keine E-Mail-Adresse'}</p></hgroup>
<p class="person-status">${statusBadge(st.status)} ${statusExtras(st)} · letzte Aktivität <span title="${SOURCE_LABEL[st.activity.source]}">${fmtDate(st.activity.date)}</span> (${ago(st.days)}) · erster Snapshot ${fmtDate(st.firstSeen)}</p>
${p.warnings.map((w) => html`<p class="msg msg-warn">${w}</p>`)}
${st.courses.map((c) => courseBlock(c, model))}
<div class="grid two-col">
<div>${contactsSection(p, notes, csrf, today)}</div>
<div>${templateSection(p, st, model, settings)}${noteSection(p, notes, csrf)}</div>
</div>`;
}
