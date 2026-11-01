import { html } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export type NavKey = 'people' | 'courses' | 'timeline' | 'files' | 'settings' | 'import' | 'home';

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: 'people', href: '/people', label: 'Personen' },
  { key: 'courses', href: '/courses', label: 'Kurse' },
  { key: 'timeline', href: '/timeline', label: 'Zeitachse' },
  { key: 'files', href: '/files', label: 'Dateien' },
  { key: 'settings', href: '/settings', label: 'Einstellungen' },
];

export function layout(opts: { title: string; nav: NavKey; csrf: string; content: Html }): Html {
  const headers = JSON.stringify({ 'X-CSRF-Token': opts.csrf });
  return html`<!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="htmx-config" content='{"allowEval":false,"includeIndicatorStyles":false,"historyCacheSize":0}'>
<meta name="csrf-token" content="${opts.csrf}">
<title>${opts.title} · NetAcad-Fortschritt</title>
<link rel="stylesheet" href="/vendor/pico.min.css">
<link rel="stylesheet" href="/static/app.css">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230172ad'/><path fill='%23fff' d='M6 20h5v6H6zM13.5 13h5v13h-5zM21 6h5v20h-5z'/></svg>">
<script src="/vendor/htmx.min.js" defer></script>
<script src="/static/app.js" defer></script>
</head>
<body hx-headers='${headers}'>
<header class="container-fluid site-header">
<nav hx-boost="true">
<ul><li><a href="/people" class="brand"><strong>NetAcad-Fortschritt</strong></a></li></ul>
<ul>${NAV.map((n) => html`<li><a href="${n.href}"${n.key === opts.nav ? html` aria-current="page"` : ''}>${n.label}</a></li>`)}</ul>
</nav>
</header>
<main class="container-fluid" id="main">
${opts.content}
</main>
<footer class="container-fluid site-footer"><small>Lokal auf diesem Rechner · «Kein Fortschritt» heisst «keine Prüfung abgelegt», nicht «untätig».</small></footer>
</body>
</html>`;
}

export function csrfField(token: string): Html {
  return html`<input type="hidden" name="_csrf" value="${token}">`;
}

export function messages(list: { kind: 'error' | 'warn' | 'info' | 'ok'; text: string }[]): Html {
  return html`${list.map((m) => html`<p class="msg msg-${m.kind}" role="${m.kind === 'error' ? 'alert' : 'status'}">${m.text}</p>`)}`;
}
