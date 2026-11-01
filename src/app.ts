import { randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { html } from 'hono/html';
import { secureHeaders } from 'hono/secure-headers';
import { MAX_UPLOAD_BYTES, serverOrigin, type Config } from './config.ts';
import { buildBookmarklet } from './logic/bookmarklet.ts';
import { isIsoDate, parseSnapshotText } from './logic/parse.ts';
import { previewSnapshot } from './logic/preview.ts';
import { personState, timeline } from './logic/status.ts';
import { createNotesStore } from './store/notes.ts';
import { createSettingsStore, validateSettings } from './store/settings.ts';
import { createSnapshotStore, type SaveResult } from './store/snapshots.ts';
import { coursePage, coursesPage, timelinePage } from './views/courses.ts';
import { filesPage } from './views/files.ts';
import { commitResult, importPage, previewFragment, type PreviewItem } from './views/import.ts';
import { layout, type Html, type NavKey } from './views/layout.ts';
import { buildRows, emptyPage, parsePeopleQuery, peoplePage, results, sortState } from './views/people.ts';
import { contactsSection, noteSection, personPage } from './views/person.ts';
import { settingsPage, toForm, type SettingsForm } from './views/settings.ts';

export type AppOptions = {
  config: Config;
  csrfToken?: string;
  today?: () => string;
  log?: (msg: string) => void;
};

const CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", 'data:'],
  connectSrc: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  baseUri: ["'none'"],
};

const STATIC_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export const localToday = () => new Date().toLocaleDateString('sv-SE');

const first = (v: unknown): string => (Array.isArray(v) ? first(v[0]) : typeof v === 'string' ? v : '');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

export function createApp(opts: AppOptions) {
  const { config } = opts;
  const csrf = opts.csrfToken ?? randomBytes(24).toString('base64url');
  const today = opts.today ?? localToday;
  const log = opts.log ?? ((m: string) => console.log(m));

  fs.mkdirSync(path.join(config.dataDir, 'snapshots'), { recursive: true });
  const settingsStore = createSettingsStore(config.dataDir);
  const notesStore = createNotesStore(config.dataDir);
  const snapshots = createSnapshotStore(config.dataDir);

  const allowedHosts = new Set([`localhost:${config.port}`, `127.0.0.1:${config.port}`]);
  const vendorCache = new Map<string, Buffer>();

  const app = new Hono();

  // --- Security -----------------------------------------------------------
  app.use('*', async (c, next) => {
    const host = (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase();
    if (!allowedHosts.has(host)) return c.text('Forbidden: unexpected Host', 403);
    await next();
  });

  app.use('*', secureHeaders({
    contentSecurityPolicy: CSP,
    referrerPolicy: 'same-origin',
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: false,
    crossOriginResourcePolicy: 'same-origin',
    crossOriginOpenerPolicy: 'same-origin',
  }));

  const tooLarge = (c: Context) => c.text(`Zu gross (höchstens ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB)`, 413);
  app.use('/import/preview', bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: tooLarge }));
  app.use('/files/upload', bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: tooLarge }));
  app.use('/import/commit', bodyLimit({ maxSize: 4 * MAX_UPLOAD_BYTES, onError: tooLarge }));
  app.use('*', async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
    const p = c.req.path;
    if (!p.startsWith('/import/') && p !== '/files/upload') {
      return bodyLimit({ maxSize: 1024 * 1024, onError: tooLarge })(c, next);
    }
    return next();
  });

  app.use('*', async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
    const own = `http://${(c.req.header('host') ?? new URL(c.req.url).host).toLowerCase()}`;
    let origin = c.req.header('origin');
    if (!origin || origin === 'null') {
      const ref = c.req.header('referer');
      try {
        origin = ref ? new URL(ref).origin : undefined;
      } catch {
        origin = undefined;
      }
    }
    if (origin !== own) return c.text('Forbidden: cross-origin request', 403);
    let token = c.req.header('x-csrf-token');
    if (!token) {
      const ct = c.req.header('content-type') ?? '';
      if (ct.startsWith('application/x-www-form-urlencoded') || ct.startsWith('multipart/form-data')) {
        token = first((await c.req.parseBody({ all: true }))['_csrf']);
      }
    }
    const a = Buffer.from(token ?? ''), b = Buffer.from(csrf);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return c.text('Forbidden: invalid CSRF token', 403);
    return next();
  });

  // --- Helpers ------------------------------------------------------------
  const isFragment = (c: Context) =>
    c.req.header('hx-request') === 'true' && c.req.header('hx-boosted') !== 'true' && c.req.header('hx-history-restore-request') !== 'true';
  const page = (c: Context, title: string, nav: NavKey, content: Html, status: 200 | 404 | 400 | 500 = 200) =>
    c.html(layout({ title, nav, csrf, content }), status);
  const notFound = (c: Context, what = 'Seite') =>
    page(c, 'Nicht gefunden', 'home', html`<h1>Nicht gefunden</h1><p>${what} nicht gefunden. <a href="/people">Zur Personenübersicht</a></p>`, 404);

  async function load() {
    const [model, settings, notes] = await Promise.all([snapshots.getModel(), settingsStore.get(), notesStore.read()]);
    return { model, settings, notes, today: today() };
  }

  function bookmarklet() {
    const origin = serverOrigin(config.port);
    let source = '';
    try {
      source = fs.readFileSync(config.bookmarkletSrc, 'utf8');
    } catch {
      /* missing source */
    }
    try {
      return { code: fs.readFileSync(config.bookmarkletTxt, 'utf8').trim(), source, fromFile: true, origin };
    } catch {
      let code = '';
      try {
        code = buildBookmarklet(source, origin);
      } catch (e) {
        code = `Fehler: ${(e as Error).message}`;
      }
      return { code, source, fromFile: false, origin };
    }
  }

  function previewItems(inputs: { label: string; text: string | null }[], model: Awaited<ReturnType<typeof load>>['model']): PreviewItem[] {
    return inputs.map(({ label, text }) => {
      if (text === null || Buffer.byteLength(text) > MAX_UPLOAD_BYTES) return { label, json: '', ok: false, error: 'Datei grösser als 5 MB' };
      const r = parseSnapshotText(text);
      if (!r.ok) return { label, json: '', ok: false, error: r.error };
      return { label, json: JSON.stringify(r.raw), ok: true, preview: previewSnapshot(r.snapshot, model) };
    });
  }

  // --- Routes -------------------------------------------------------------
  app.get('/', async (c) => {
    const { model } = await load();
    if (model.people.length) return c.redirect('/people', 302);
    return page(c, 'Start', 'home', emptyPage());
  });

  app.get('/people', async (c) => {
    const { model, settings, notes, today: t } = await load();
    if (!model.people.length) return isFragment(c) ? c.html(emptyPage()) : page(c, 'Personen', 'people', emptyPage());
    const q = parsePeopleQuery((k) => c.req.query(k), (k) => c.req.queries(k) ?? []);
    const rows = buildRows(model, notes, settings, t);
    if (isFragment(c)) return c.html(html`${results(rows, model, q)}${sortState(q, true)}`);
    return page(c, 'Personen', 'people', peoplePage(rows, model, q));
  });

  app.get('/people/:id', async (c) => {
    const { model, settings, notes, today: t } = await load();
    const p = model.personById.get(c.req.param('id'));
    if (!p) return notFound(c, 'Person');
    const ln = notes.learners[p.key] ?? { note: '', contacts: [], snoozeUntil: null };
    const st = personState(p, ln, settings, t);
    return page(c, p.name || 'Person', 'people', personPage(p, st, ln, model, settings, csrf, t));
  });

  app.post('/people/:id/contacts', async (c) => {
    const { model, today: t } = await load();
    const p = model.personById.get(c.req.param('id'));
    if (!p) return notFound(c, 'Person');
    const body = await c.req.parseBody({ all: true });
    const date = first(body.date).trim();
    const contact = {
      id: 'c_' + randomBytes(4).toString('hex'),
      date,
      channel: first(body.channel).trim().slice(0, 100),
      text: first(body.text).trim().slice(0, 5000),
      reply: first(body.reply).trim().slice(0, 5000),
    };
    if (!isIsoDate(date)) return c.text('Ungültiges Datum', 400);
    const ln = await notesStore.update(p.key, (n) => { n.contacts.push(contact); });
    log(`contact added (${ln.contacts.length} total for one learner)`);
    if (isFragment(c)) return c.html(contactsSection(p, ln, csrf, t, 'Kontakt gespeichert.'));
    return c.redirect(`/people/${p.id}#contacts`, 303);
  });

  app.post('/people/:id/contacts/:cid/delete', async (c) => {
    const { model, today: t } = await load();
    const p = model.personById.get(c.req.param('id'));
    if (!p) return notFound(c, 'Person');
    const cid = c.req.param('cid');
    const ln = await notesStore.update(p.key, (n) => { n.contacts = n.contacts.filter((x) => x.id !== cid); });
    if (isFragment(c)) return c.html(contactsSection(p, ln, csrf, t, 'Kontakt gelöscht.'));
    return c.redirect(`/people/${p.id}#contacts`, 303);
  });

  app.post('/people/:id/note', async (c) => {
    const { model } = await load();
    const p = model.personById.get(c.req.param('id'));
    if (!p) return notFound(c, 'Person');
    const body = await c.req.parseBody({ all: true });
    const snooze = first(body.snoozeUntil).trim();
    if (snooze && !isIsoDate(snooze)) return c.text('Ungültiges Datum', 400);
    const ln = await notesStore.update(p.key, (n) => {
      n.note = first(body.note).replace(/\r\n/g, '\n').trim().slice(0, 20000);
      n.snoozeUntil = snooze || null;
    });
    if (isFragment(c)) return c.html(noteSection(p, ln, csrf, 'Gespeichert. Der Status wird beim nächsten Laden aktualisiert.'));
    return c.redirect(`/people/${p.id}`, 303);
  });

  app.get('/courses', async (c) => {
    const { model, settings, today: t } = await load();
    return page(c, 'Kurse', 'courses', coursesPage(model, settings, t));
  });

  app.get('/courses/:id', async (c) => {
    const { model, settings, today: t } = await load();
    const course = model.courseById.get(c.req.param('id'));
    if (!course) return notFound(c, 'Kurs');
    return page(c, course.name, 'courses', coursePage(course, model, settings, t));
  });

  app.get('/timeline', async (c) => {
    const { model } = await load();
    return page(c, 'Zeitachse', 'timeline', timelinePage(model, timeline(model.courses)));
  });

  app.get('/files', async (c) => {
    const { model } = await load();
    return page(c, 'Dateien', 'files', filesPage(model, csrf, snapshots.dir));
  });

  app.post('/files/upload', async (c) => {
    const { model } = await load();
    const body = await c.req.parseBody({ all: true });
    const files = list(body.files).filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) {
      const msg = html`<p class="msg msg-error">Keine Datei ausgewählt.</p>`;
      return isFragment(c) ? c.html(msg) : page(c, 'Upload', 'files', msg, 400);
    }
    const inputs = await Promise.all(files.map(async (f) => ({ label: f.name, text: f.size > MAX_UPLOAD_BYTES ? null : await f.text() })));
    const items = previewItems(inputs, model);
    log(`upload preview: ${items.length} file(s)`);
    const frag = previewFragment(items, csrf);
    return isFragment(c) ? c.html(frag) : page(c, 'Upload prüfen', 'files', html`<h1>Upload prüfen</h1>${frag}`);
  });

  app.get('/import', (c) => {
    const ref = c.req.header('referer');
    let note: { kind: 'warn' | 'info'; text: string } | null = null;
    if (ref) {
      let origin = '';
      try {
        origin = new URL(ref).origin;
      } catch {
        /* ignore */
      }
      const own = [`http://localhost:${config.port}`, `http://127.0.0.1:${config.port}`];
      if (!config.sourceOrigins.includes(origin) && !own.includes(origin)) {
        note = { kind: 'warn', text: `Unerwartete Herkunft «${origin || ref}». Nur importieren, wenn Sie das Bookmarklet selbst ausgelöst haben.` };
      }
    }
    return page(c, 'Import', 'import', importPage(note));
  });

  app.post('/import/preview', async (c) => {
    const { model } = await load();
    const text = await c.req.text();
    const items = previewItems([{ label: 'aus dem Bookmarklet', text }], model);
    log(`import preview: ${items[0].ok ? 'valid' : 'invalid'}`);
    const frag = previewFragment(items, csrf);
    return isFragment(c) ? c.html(frag) : page(c, 'Import', 'import', html`<h1>Import</h1>${frag}`);
  });

  app.post('/import/commit', async (c) => {
    const body = await c.req.parseBody({ all: true });
    const texts = list(body.json).map(first).filter(Boolean);
    const out: ({ ok: true; result: SaveResult } | { ok: false; error: string })[] = [];
    for (const t of texts) {
      if (Buffer.byteLength(t) > MAX_UPLOAD_BYTES) { out.push({ ok: false, error: 'grösser als 5 MB' }); continue; }
      const r = parseSnapshotText(t);
      if (!r.ok) { out.push({ ok: false, error: r.error }); continue; }
      out.push({ ok: true, result: await snapshots.save(r.snapshot, r.raw) });
    }
    if (!out.length) out.push({ ok: false, error: 'Keine Daten erhalten' });
    for (const r of out) log(r.ok ? `snapshot ${r.result.status}: ${r.result.fileName}` : 'snapshot rejected');
    const allSaved = out.every((r) => r.ok && r.result.status === 'saved');
    if (isFragment(c)) {
      if (allSaved) c.header('HX-Redirect', '/people');
      return c.html(commitResult(out));
    }
    if (allSaved) return c.redirect('/people', 303);
    return page(c, 'Import', 'import', html`<h1>Import</h1>${commitResult(out)}`);
  });

  const settingsView = async (c: Context, form: SettingsForm, msgs: { kind: 'error' | 'ok'; text: string }[], status: 200 | 400 = 200) => {
    const content = settingsPage(form, csrf, msgs, bookmarklet());
    if (isFragment(c)) return c.html(content, status);
    return page(c, 'Einstellungen', 'settings', content, status);
  };

  app.get('/settings', async (c) => settingsView(c, toForm(await settingsStore.get()), []));

  app.post('/settings', async (c) => {
    const body = await c.req.parseBody({ all: true });
    const input: Record<string, string> = {};
    for (const k of ['warnDays', 'alertDays', 'newDays', 'contactSubject', 'contactTemplate']) input[k] = first(body[k]);
    const v = validateSettings(input);
    if (!v.ok) return settingsView(c, input as SettingsForm, v.errors.map((text) => ({ kind: 'error' as const, text })), 400);
    await settingsStore.save(v.settings);
    snapshots.invalidate();
    log('settings saved');
    return settingsView(c, toForm(v.settings), [{ kind: 'ok', text: 'Einstellungen gespeichert.' }]);
  });

  const vendor = (file: string, type: string) => (c: Context) => {
    let buf = vendorCache.get(file);
    if (!buf) {
      buf = fs.readFileSync(file);
      vendorCache.set(file, buf);
    }
    return c.body(new Uint8Array(buf), 200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' });
  };
  app.get('/vendor/htmx.min.js', vendor(config.vendor.htmx, 'text/javascript; charset=utf-8'));
  app.get('/vendor/pico.min.css', vendor(config.vendor.pico, 'text/css; charset=utf-8'));

  app.get('/static/:file', (c) => {
    const name = c.req.param('file');
    const type = STATIC_TYPES[path.extname(name)];
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name) || !type) return c.text('Not found', 404);
    try {
      return c.body(new Uint8Array(fs.readFileSync(path.join(config.publicDir, name))), 200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    } catch {
      return c.text('Not found', 404);
    }
  });

  app.notFound((c) => notFound(c));
  app.onError((err, c) => {
    log(`error: ${err.name}: ${err.message.slice(0, 200)}`);
    return page(c, 'Fehler', 'home', html`<h1>Fehler</h1><p>Beim Verarbeiten der Anfrage ist ein Fehler aufgetreten.</p>`, 500);
  });

  return { app, csrfToken: csrf, stores: { snapshots, notes: notesStore, settings: settingsStore } };
}
