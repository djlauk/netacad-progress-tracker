import { html } from 'hono/html';
import type { Settings } from '../types.ts';
import { csrfField, messages, type Html } from './layout.ts';
import { placeholderHint } from './template.ts';

export type SettingsForm = Record<keyof Settings, string>;

export const toForm = (s: Settings): SettingsForm => ({
  warnDays: String(s.warnDays), alertDays: String(s.alertDays),
  contactSubject: s.contactSubject, contactTemplate: s.contactTemplate,
});

export function settingsPage(form: SettingsForm, csrf: string, msgs: { kind: 'error' | 'ok'; text: string }[], bookmarklet: { code: string; source: string; fromFile: boolean; origin: string }): Html {
  return html`<hgroup class="page-head"><h1>Einstellungen</h1><p>Gespeichert in <code>data/settings.json</code></p></hgroup>
<section id="settings-form">
<form method="post" action="/settings" hx-post="/settings" hx-target="#settings-form" hx-select="#settings-form" hx-swap="outerHTML">
${csrfField(csrf)}
${messages(msgs)}
<div class="grid">
<label>Beobachten ab (Tage ohne Aktivität)<input type="number" name="warnDays" min="1" max="3650" value="${form.warnDays}" required></label>
<label>Nachfragen ab (Tage ohne Aktivität)<input type="number" name="alertDays" min="1" max="3650" value="${form.alertDays}" required></label>
</div>
<label>Betreff der Nachfrage<input type="text" name="contactSubject" value="${form.contactSubject}" required maxlength="300"></label>
<label>Nachfrage-Vorlage<textarea name="contactTemplate" rows="6" required>${form.contactTemplate}</textarea>
</label>
${placeholderHint()}
<button type="submit">Speichern</button>
</form>
</section>
<section id="bookmarklet">
<h2>Bookmarklet</h2>
<ol>
<li>Den Link <a class="bookmarklet" href="${bookmarklet.code}" draggable="true">NetAcad → Fortschritt</a> in die Lesezeichenleiste ziehen.
Alternativ ein neues Lesezeichen anlegen und den Code unten als Adresse einfügen.</li>
<li>In NetAcad das <em>Course Gradebook</em> öffnen. Alle Lernenden sichtbar machen (Paginierung: alle Zeilen auf einer Seite).</li>
<li>Das Lesezeichen anklicken. Es öffnet einen neuen Tab mit der Import-Vorschau. Dort auf «Importieren» klicken.</li>
<li>Falls der Tab nicht aufgeht, lädt das Bookmarklet die Datei herunter. Diese unter <a href="/files">Dateien</a> hochladen.</li>
</ol>
<p><small>Ziel: <code>${bookmarklet.origin}</code>${bookmarklet.fromFile ? '' : html` · <strong>bookmarklet/bookmarklet.txt fehlt</strong>, Code wurde aus der Quelle erzeugt (<code>npm run bookmarklet</code>)`}</small></p>
<label>Code<textarea id="bookmarklet-code" rows="5" readonly spellcheck="false">${bookmarklet.code}</textarea></label>
<button type="button" class="secondary" data-copy-target="#bookmarklet-code">Code kopieren</button>
<details><summary>Lesbare Quelle</summary><pre><code>${bookmarklet.source}</code></pre></details>
</section>`;
}
