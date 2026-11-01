import { html } from 'hono/html';
import type { Preview } from '../logic/preview.ts';
import type { SaveResult } from '../store/snapshots.ts';
import { fmtDate, fmtDateTime, plural } from './format.ts';
import { csrfField, type Html } from './layout.ts';

export type PreviewItem = { label: string; json: string } & ({ ok: true; preview: Preview } | { ok: false; error: string });

export function importPage(originNote: { kind: 'warn' | 'info'; text: string } | null): Html {
  return html`<hgroup class="page-head"><h1>Import</h1><p>Snapshot aus dem Bookmarklet prüfen und speichern</p></hgroup>
${originNote ? html`<p class="msg msg-${originNote.kind}" role="status">${originNote.text}</p>` : ''}
<div id="import-status"><p aria-busy="true">Daten werden gelesen …</p></div>
<noscript><p class="msg msg-error">Für den Import per Bookmarklet ist JavaScript nötig. Alternativ die Datei unter <a href="/files">Dateien</a> hochladen.</p></noscript>
<script src="/static/import.js" defer></script>`;
}

function previewCard(item: PreviewItem): Html {
  if (!item.ok) {
    return html`<article class="preview invalid"><header><strong>${item.label}</strong></header><p class="msg msg-error">Ungültig: ${item.error}</p></article>`;
  }
  const p = item.preview;
  const s = p.snapshot;
  const withScore = s.learners.filter((l) => l.assessments.some((a) => a.score !== null)).length;
  return html`<article class="preview">
<header><strong>${s.course}</strong><br><small>${item.label}</small></header>
<dl class="facts">
<dt>Stand</dt><dd>${fmtDate(s.snapshotDate)} <small>(exportiert ${fmtDateTime(s.exportedAt)})</small></dd>
<dt>Lernende</dt><dd>${s.learners.length} <small>(${withScore} mit mindestens einer Prüfung)</small></dd>
<dt>Prüfungen</dt><dd>${s.assessments.length}</dd>
<dt>Vergleich</dt><dd>${p.isNewCourse ? 'Neuer Kurs, noch kein Snapshot vorhanden.'
  : p.previousDate === null ? 'Kein früherer Snapshot dieses Kurses.'
  : html`${plural(p.newSubmissions ?? 0, 'neue Prüfungsabgabe', 'neue Prüfungsabgaben')} seit ${fmtDate(p.previousDate)}${
    p.newLearners ? html` · ${plural(p.newLearners, 'neue Person', 'neue Personen')}` : ''}${
    p.missingLearners ? html` · ${plural(p.missingLearners, 'Person fehlt', 'Personen fehlen')}` : ''}`}</dd>
</dl>
${p.duplicateOf ? html`<p class="msg msg-info">Bereits vorhanden (${p.duplicateOf}). Wird nicht erneut gespeichert.</p>` : ''}
${p.warnings.map((w) => html`<p class="msg msg-warn">⚠ ${w}</p>`)}
${p.infos.map((w) => html`<p class="msg msg-info">${w}</p>`)}
</article>`;
}

export function previewFragment(items: PreviewItem[], csrf: string): Html {
  const importable = items.filter((i) => i.ok && !i.preview.duplicateOf);
  return html`<div id="import-preview">
${items.map(previewCard)}
<div id="import-result">
${importable.length ? html`<form method="post" action="/import/commit" enctype="multipart/form-data" hx-encoding="multipart/form-data" hx-post="/import/commit" hx-target="#import-result" hx-swap="outerHTML">
${csrfField(csrf)}
${importable.map((i) => html`<textarea name="json" hidden>${i.json}</textarea>`)}
<button type="submit">Importieren${importable.length > 1 ? ` (${importable.length})` : ''}</button>
<a href="/people" role="button" class="secondary outline">Abbrechen</a>
</form>` : html`<p><a href="/people" role="button" class="secondary">Zur Personenübersicht</a></p>`}
</div>
</div>`;
}

export function commitResult(results: ({ ok: true; result: SaveResult } | { ok: false; error: string })[]): Html {
  return html`<div id="import-result">
${results.map((r) => !r.ok ? html`<p class="msg msg-error">Nicht gespeichert: ${r.error}</p>`
  : r.result.status === 'saved' ? html`<p class="msg msg-ok">Gespeichert: ${r.result.fileName}</p>`
  : html`<p class="msg msg-info">Bereits vorhanden: ${r.result.fileName}</p>`)}
<p><a href="/people" role="button">Zur Personenübersicht</a></p>
</div>`;
}
