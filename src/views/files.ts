import { html } from 'hono/html';
import type { Model } from '../logic/model.ts';
import { MAX_UPLOAD_BYTES } from '../config.ts';
import { fmtDate } from './format.ts';
import { csrfField, type Html } from './layout.ts';

const STATUS_LABEL = { ok: 'ok', replaced: 'ersetzt', invalid: 'ungültig' } as const;

export function filesPage(model: Model, csrf: string, dataDir: string): Html {
  const files = [...model.files].sort((a, b) => (b.snapshotDate ?? '').localeCompare(a.snapshotDate ?? '') || a.fileName.localeCompare(b.fileName));
  const noEmail = model.people.filter((p) => !p.email);
  return html`<hgroup class="page-head"><h1>Dateien</h1><p>Snapshots in <code>${dataDir}</code></p></hgroup>
<section>
<h2>Hochladen</h2>
<form id="upload" method="post" action="/files/upload" enctype="multipart/form-data" hx-post="/files/upload" hx-encoding="multipart/form-data" hx-target="#upload-preview" hx-swap="innerHTML">
${csrfField(csrf)}
<label class="dropzone" data-dropzone>Snapshot-Dateien (JSON) auswählen oder hierher ziehen
<input type="file" name="files" accept=".json,application/json" multiple required></label>
<small>Höchstens ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Die Dateien werden geprüft und erst nach «Importieren» gespeichert.</small>
<button type="submit" class="secondary">Prüfen</button>
</form>
<div id="upload-preview"></div>
<p><small>Bookmarklet einrichten: <a href="/settings#bookmarklet">Einstellungen → Bookmarklet</a></small></p>
</section>
${noEmail.length ? html`<p class="msg msg-warn">⚠ ${noEmail.length} ${noEmail.length === 1 ? 'Person' : 'Personen'} ohne E-Mail-Adresse (Zuordnung über den Namen): ${noEmail.map((p, i) => html`${i ? ', ' : ''}<a href="/people/${p.id}">${p.name}</a>`)}</p>` : ''}
<section>
<h2>Snapshots (${files.length})</h2>
${files.length ? html`<div class="table-scroll"><table class="compact striped"><thead><tr><th>Datei</th><th>Kurs</th><th>Stand</th><th>Lernende</th><th>Status</th><th>Hinweise</th></tr></thead><tbody>
${files.map((f) => html`<tr class="file-${f.status}"><td><code>${f.fileName}</code></td><td>${f.course ?? '–'}</td><td>${fmtDate(f.snapshotDate)}</td><td>${f.learnerCount ?? '–'}</td>
<td><span class="badge badge-file-${f.status}">${STATUS_LABEL[f.status]}</span>${f.reason ? html`<br><small>${f.reason}</small>` : ''}</td>
<td>${f.warnings.map((w) => html`<small class="extra">⚠ ${w}</small>`)}</td></tr>`)}
</tbody></table></div>` : html`<p class="muted">Noch keine Dateien.</p>`}
<p><small>Snapshots werden nie verändert. Dateien, die von Hand in den Ordner gelegt oder daraus gelöscht werden, erscheinen beim nächsten Seitenaufruf.</small></p>
</section>`;
}
