import { html } from 'hono/html';
import type { Course, Model, Person } from '../logic/model.ts';
import { personState, type CourseState, type PersonState } from '../logic/status.ts';
import { STATUS_CODES, type Notes, type Settings, type StatusCode } from '../types.ts';
import { LEVEL_META, SOURCE_LABEL, STATUS_META, ago, fmtDate, fmtDelta, fmtPct, plural } from './format.ts';
import type { Html } from './layout.ts';

export type PeopleQuery = { status: StatusCode[]; course: string; q: string; sort: string; dir: 'asc' | 'desc' };

export function parsePeopleQuery(get: (k: string) => string | undefined, getAll: (k: string) => string[]): PeopleQuery {
  const status = getAll('status').filter((s): s is StatusCode => (STATUS_CODES as readonly string[]).includes(s));
  return {
    status,
    course: get('course') ?? '',
    q: (get('q') ?? '').trim(),
    sort: get('sort') || 'status',
    dir: get('dir') === 'desc' ? 'desc' : 'asc',
  };
}

export function peopleHref(q: PeopleQuery, over: Partial<PeopleQuery> = {}): string {
  const m = { ...q, ...over };
  const p = new URLSearchParams();
  for (const s of m.status) p.append('status', s);
  if (m.course) p.set('course', m.course);
  if (m.q) p.set('q', m.q);
  if (m.sort !== 'status') p.set('sort', m.sort);
  if (m.dir !== 'asc') p.set('dir', m.dir);
  const s = p.toString();
  return '/people' + (s ? '?' + s : '');
}

export type Row = { person: Person; state: PersonState };

export function buildRows(model: Model, notes: Notes, settings: Settings, today: string): Row[] {
  return model.people.map((person) => ({ person, state: personState(person, notes.learners[person.key], settings, today) }));
}

const ORDER = Object.fromEntries(STATUS_CODES.map((s, i) => [s, i])) as Record<StatusCode, number>;

export function filterRows(rows: Row[], model: Model, q: PeopleQuery, withStatus = true): Row[] {
  const needle = q.q.toLowerCase();
  const courseKey = q.course ? model.courseById.get(q.course)?.key : undefined;
  return rows.filter(({ person, state }) =>
    (!withStatus || !q.status.length || q.status.includes(state.status)) &&
    (!q.course || (courseKey !== undefined && person.enrollments.some((e) => e.courseKey === courseKey))) &&
    (!needle || person.name.toLowerCase().includes(needle) || (person.email ?? '').toLowerCase().includes(needle)));
}

export function sortRows(rows: Row[], model: Model, q: PeopleQuery): Row[] {
  const byName = (a: Row, b: Row) => a.person.name.localeCompare(b.person.name, 'de');
  let cmp: (a: Row, b: Row) => number;
  if (q.sort === 'name') cmp = byName;
  else if (q.sort === 'activity') cmp = (a, b) => a.state.activity.date.localeCompare(b.state.activity.date) || byName(a, b);
  else if (q.sort === 'contact') cmp = (a, b) => (a.state.lastContact ?? '').localeCompare(b.state.lastContact ?? '') || byName(a, b);
  else if (q.sort.startsWith('c:')) {
    const key = model.courseById.get(q.sort.slice(2))?.key;
    const g = (r: Row) => r.state.courses.find((c) => c.courseKey === key)?.last.classGrade ?? -1;
    cmp = (a, b) => g(a) - g(b) || byName(a, b);
  } else cmp = (a, b) => ORDER[a.state.status] - ORDER[b.state.status] || b.state.days - a.state.days || byName(a, b);
  const out = [...rows].sort(cmp);
  return q.dir === 'desc' ? out.reverse() : out;
}

export function statusBadge(s: StatusCode): Html {
  const m = STATUS_META[s];
  return html`<span class="badge badge-${s}"><span aria-hidden="true">${m.icon}</span> ${m.label}</span>`;
}

export function statusExtras(st: PersonState): Html {
  return html`${st.contactedOn ? html`<small class="extra">nachgefragt am ${fmtDate(st.contactedOn)}</small>` : ''}${
    st.status === 'snoozed' && st.snoozeUntil ? html`<small class="extra">pausiert bis ${fmtDate(st.snoozeUntil)}</small>` : ''}${
    st.unchanged >= 2 && st.status !== 'completed' && st.status !== 'gone' ? html`<small class="extra">unverändert seit ${st.unchanged} Snapshots</small>` : ''}`;
}

export function courseCell(c: CourseState | undefined): Html {
  if (!c) return html`<td class="course-cell empty"></td>`;
  const delta = fmtDelta(c.gradeDelta);
  const lv = !c.inLatest ? 'gone' : c.completed ? 'completed' : c.level;
  const mark = lv !== 'active'
    ? html` <span class="level-icon" title="${lv === 'gone' ? 'nicht mehr im neuesten Snapshot' : lv === 'completed' ? 'abgeschlossen' : `seit ${c.days} Tagen keine Aktivität in diesem Kurs`}"><span aria-hidden="true">${LEVEL_META[lv].icon}</span><span class="visually-hidden">${LEVEL_META[lv].label}</span></span>`
    : '';
  const anomaly = c.anomalies.length
    ? html` <span class="anomaly" title="Punkte gesunken seit dem vorherigen Snapshot">⚠<span class="visually-hidden">Auffälligkeit</span></span>`
    : '';
  return html`<td class="course-cell level-${lv}"><span class="grade">${fmtPct(c.last.classGrade)}</span>${mark}${anomaly}<br><small>${c.submitted}/${c.total} Prüfungen${delta ? html` · <span class="${delta.cls}">${delta.text}</span>` : ''}</small></td>`;
}

function sortLink(q: PeopleQuery, key: string, label: string): Html {
  const active = q.sort === key;
  const dir = active && q.dir === 'asc' ? 'desc' : 'asc';
  const href = peopleHref(q, { sort: key, dir });
  return html`<a href="${href}" hx-get="${href}" hx-target="#results" hx-swap="outerHTML" hx-push-url="true"${active ? html` aria-sort="${q.dir === 'asc' ? 'ascending' : 'descending'}"` : ''}>${label}${active ? (q.dir === 'asc' ? ' ▲' : ' ▼') : ''}</a>`;
}

export function counters(rows: Row[], q: PeopleQuery): Html {
  const counts = new Map<StatusCode, number>();
  for (const r of rows) counts.set(r.state.status, (counts.get(r.state.status) ?? 0) + 1);
  const items = STATUS_CODES.filter((s) => counts.get(s));
  return html`<p class="counters">${items.map((s, i) => {
    const href = peopleHref(q, { status: [s] });
    const m = STATUS_META[s];
    return html`${i ? ' · ' : ''}<a href="${href}" hx-get="${href}" hx-target="#results" hx-swap="outerHTML" hx-push-url="true" title="nur «${m.label}» anzeigen">${m.icon} ${counts.get(s)}<span class="visually-hidden"> ${m.label}</span></a>`;
  })}${q.status.length ? html` · <a href="${peopleHref(q, { status: [] })}" hx-get="${peopleHref(q, { status: [] })}" hx-target="#results" hx-swap="outerHTML" hx-push-url="true">alle</a>` : ''}</p>`;
}

export function sortState(q: PeopleQuery, oob: boolean): Html {
  return html`<div id="sort-state"${oob ? html` hx-swap-oob="true"` : ''}><input type="hidden" name="sort" value="${q.sort}"><input type="hidden" name="dir" value="${q.dir}"></div>`;
}

export function results(all: Row[], model: Model, q: PeopleQuery): Html {
  const base = filterRows(all, model, q, false);
  const rows = sortRows(filterRows(base, model, q, true), model, q);
  const keys = new Set(rows.flatMap((r) => r.person.enrollments.map((e) => e.courseKey)));
  const courses: Course[] = model.courses.filter((c) => keys.has(c.key));
  const emails = rows.map((r) => r.person.email).filter((e): e is string => !!e);

  return html`<section id="results" hx-boost="true">
${counters(base, q)}
<div class="toolbar">
<span>${plural(rows.length, 'Person', 'Personen')}</span>
<button type="button" class="secondary outline small" data-copy="${emails.join('; ')}"${emails.length ? '' : html` disabled`}>E-Mail-Adressen kopieren (${emails.length})</button>
</div>
${rows.length ? html`<div class="table-scroll"><table class="compact people-table striped">
<thead><tr>
<th>${sortLink(q, 'status', 'Status')}</th>
<th class="sticky">${sortLink(q, 'name', 'Name')}</th>
${courses.map((c) => html`<th class="course-col">${sortLink(q, 'c:' + c.id, c.name)}</th>`)}
<th>${sortLink(q, 'activity', 'Letzte Aktivität')}</th>
<th>${sortLink(q, 'contact', 'Letzter Kontakt')}</th>
</tr></thead>
<tbody>
${rows.map(({ person: p, state: st }) => html`<tr class="row-${st.status}">
<td>${statusBadge(st.status)}${statusExtras(st)}</td>
<td class="sticky"><a href="/people/${p.id}">${p.name || p.email}</a>${p.warnings.length ? html` <span title="${p.warnings.join('; ')}">⚠</span>` : ''}${p.name && p.email ? html`<br><small class="email">${p.email}</small>` : ''}</td>
${courses.map((c) => courseCell(st.courses.find((x) => x.courseKey === c.key)))}
<td><span title="${SOURCE_LABEL[st.activity.source]}">${fmtDate(st.activity.date)}</span><br><small>${ago(st.days)}</small></td>
<td>${st.lastContact ? fmtDate(st.lastContact) : html`<small class="muted">–</small>`}</td>
</tr>`)}
</tbody></table></div>` : html`<p class="muted">Keine Personen für diese Filter.</p>`}
</section>`;
}

export function peoplePage(all: Row[], model: Model, q: PeopleQuery): Html {
  return html`<hgroup class="page-head"><h1>Personen</h1><p>Wer kommt voran, und bei wem sollte ich nachfragen?</p></hgroup>
<form id="filters" class="filters" action="/people" method="get" hx-get="/people" hx-target="#results" hx-swap="outerHTML" hx-push-url="true" hx-trigger="change, keyup changed delay:300ms from:input[name=q], submit">
<fieldset class="status-filter"><legend>Status</legend>
${STATUS_CODES.map((s) => html`<label><input type="checkbox" name="status" value="${s}"${q.status.includes(s) ? html` checked` : ''}> ${STATUS_META[s].icon} ${STATUS_META[s].label}</label>`)}
</fieldset>
<div class="filter-row">
<label>Kurs<select name="course"><option value="">alle Kurse</option>${model.courses.map((c) => html`<option value="${c.id}"${q.course === c.id ? html` selected` : ''}>${c.name}</option>`)}</select></label>
<label>Suche<input type="search" name="q" value="${q.q}" placeholder="Name oder E-Mail" autocomplete="off"></label>
<button type="submit" class="secondary">Filtern</button>
</div>
${sortState(q, false)}
</form>
${results(all, model, q)}
<p class="hint"><small>Hinweis: Das Gradebook zeigt nur Prüfungsergebnisse. Wer Module durcharbeitet, ohne die Prüfung abzulegen, erscheint als inaktiv. Das ist ein Anlass für eine freundliche Nachfrage, kein Beweis für Untätigkeit.</small></p>`;
}

export function emptyPage(): Html {
  return html`<hgroup class="page-head"><h1>Willkommen</h1><p>Noch keine Snapshots vorhanden.</p></hgroup>
<article>
<h2>So geht es los</h2>
<ol>
<li>Unter <a href="/settings#bookmarklet">Einstellungen → Bookmarklet</a> das Bookmarklet in die Lesezeichenleiste ziehen.</li>
<li>In NetAcad das <em>Course Gradebook</em> eines Kurses öffnen, alle Lernenden sichtbar machen (Paginierung) und das Bookmarklet anklicken.</li>
<li>Im neuen Tab die Vorschau prüfen und auf <strong>«Importieren»</strong> klicken.</li>
<li>Alternativ: Snapshot-Dateien unter <a href="/files">Dateien</a> hochladen oder direkt in <code>data/snapshots/</code> legen.</li>
</ol>
</article>`;
}
