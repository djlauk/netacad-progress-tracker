import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { shortId } from '../src/logic/model.ts';
import { TODAY, tempDataDir } from './helpers.ts';

const ORIGIN = 'http://localhost:8765';
const TOKEN = 'test-token';

function setup(withFixtures = true) {
  const dataDir = tempDataDir(withFixtures);
  const config = { ...loadConfig({}), dataDir };
  const { app } = createApp({ config, csrfToken: TOKEN, today: () => TODAY, log: () => {} });
  const get = (p: string, headers: Record<string, string> = {}) => app.request(ORIGIN + p, { headers });
  const post = (p: string, body: BodyInit, headers: Record<string, string> = {}) =>
    app.request(ORIGIN + p, { method: 'POST', body, headers: { Origin: ORIGIN, 'X-CSRF-Token': TOKEN, ...headers } });
  return { app, dataDir, get, post };
}

const snapshot = (exportedAt: string) => JSON.stringify({
  format: 'netacad-gradebook/1', snapshotDate: '2026-11-02', exportedAt, course: 'Test Kurs 2026/27', url: '/launch', courseId: '11111111-2222-3333-4444-555555555555',
  assessments: [{ name: 'T: Module 1', dueDate: null }],
  learners: [{ name: 'Test, Tina', email: 'tina.test.inf24@stud.example.ch', status: 'IN PROGRESS', classGrade: 10,
    assessments: [{ name: 'T: Module 1', score: 80, maxScore: 100, submittedOn: '2026-11-01' }] }],
});

test('wrong Host → 403', async () => {
  const { app } = setup(false);
  const r = await app.request('http://evil.example:8765/people');
  assert.equal(r.status, 403);
  const r2 = await app.request('http://localhost:9999/people');
  assert.equal(r2.status, 403);
  const ok = await app.request(ORIGIN + '/people');
  assert.equal(ok.status, 200);
  const ok2 = await app.request('http://127.0.0.1:8765/people');
  assert.equal(ok2.status, 200);
});

test('POST with foreign Origin → 403; missing CSRF token → 403', async () => {
  const { app, post } = setup();
  const r = await post('/import/preview', snapshot('2026-11-02T08:00:00.000Z'), { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  const r2 = await app.request(ORIGIN + '/import/preview', { method: 'POST', body: '{}', headers: { Origin: ORIGIN } });
  assert.equal(r2.status, 403);
  const r3 = await app.request(ORIGIN + '/import/preview', { method: 'POST', body: '{}', headers: { Referer: ORIGIN + '/import', 'X-CSRF-Token': TOKEN } });
  assert.equal(r3.status, 200);
});

test('security headers incl. CSP', async () => {
  const { get } = setup(false);
  const r = await get('/people');
  const csp = r.headers.get('content-security-policy') ?? '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /base-uri 'none'/);
});

test('import: preview, commit, duplicate', async () => {
  const { post, get, dataDir } = setup();
  const json = snapshot('2026-11-02T08:00:00.000Z');
  const pv = await post('/import/preview', json, { 'Content-Type': 'application/json', 'HX-Request': 'true' });
  assert.equal(pv.status, 200);
  const pvHtml = await pv.text();
  assert.match(pvHtml, /Test Kurs 2026\/27/);
  assert.match(pvHtml, /Importieren/);
  assert.doesNotMatch(pvHtml, /<html/);

  const fd = new FormData();
  fd.append('_csrf', TOKEN);
  fd.append('json', json);
  const cm = await post('/import/commit', fd, { 'X-CSRF-Token': '' });
  assert.equal(cm.status, 303);
  assert.equal(cm.headers.get('location'), '/people');
  const files = fs.readdirSync(path.join(dataDir, 'snapshots'));
  assert.ok(files.includes('2026-11-02-Test-Kurs-202627_gradebook.json'));

  const people = await (await get('/people')).text();
  assert.match(people, /Test, Tina/);

  const pv2 = await (await post('/import/preview', json, { 'HX-Request': 'true' })).text();
  assert.match(pv2, /Bereits vorhanden/);
  const fd2 = new FormData();
  fd2.append('json', json);
  const cm2 = await post('/import/commit', fd2, { 'HX-Request': 'true' });
  assert.equal(cm2.status, 200);
  assert.match(await cm2.text(), /Bereits vorhanden/);
  assert.equal(fs.readdirSync(path.join(dataDir, 'snapshots')).length, files.length);

  // Same day, other export → suffix -2
  const fd3 = new FormData();
  fd3.append('json', snapshot('2026-11-02T15:00:00.000Z'));
  const cm3 = await post('/import/commit', fd3, { 'HX-Request': 'true' });
  assert.equal(cm3.headers.get('hx-redirect'), '/people');
  assert.ok(fs.readdirSync(path.join(dataDir, 'snapshots')).includes('2026-11-02-Test-Kurs-202627_gradebook-2.json'));
});

test('invalid snapshot in preview shows reason', async () => {
  const { post } = setup(false);
  const r = await post('/import/preview', '{"format":"netacad-gradebook/9"}', { 'HX-Request': 'true' });
  assert.match(await r.text(), /Unbekanntes Format/);
});

test('upload (multipart) → preview', async () => {
  const { post } = setup();
  const fd = new FormData();
  fd.append('_csrf', TOKEN);
  fd.append('files', new File([snapshot('2026-11-02T08:00:00.000Z')], 'a.json', { type: 'application/json' }));
  fd.append('files', new File(['kaputt'], 'b.json', { type: 'application/json' }));
  const r = await post('/files/upload', fd, { 'HX-Request': 'true', 'X-CSRF-Token': '' });
  const h = await r.text();
  assert.match(h, /Test Kurs/);
  assert.match(h, /Kein gültiges JSON/);
});

test('add contact → notes.json, backup created; delete contact', async () => {
  const { post, get, dataDir } = setup();
  const id = shortId('bruno.brach.inf24@stud.example.ch');
  const body = new URLSearchParams({ _csrf: TOKEN, date: '2026-11-01', channel: 'E-Mail', text: 'Nachgefragt', reply: '' });
  const r = await post(`/people/${id}/contacts`, body, { 'HX-Request': 'true', 'X-CSRF-Token': '' });
  assert.equal(r.status, 200);
  const frag = await r.text();
  assert.match(frag, /id="contacts"/);
  assert.doesNotMatch(frag, /<html/);
  const notes = JSON.parse(fs.readFileSync(path.join(dataDir, 'notes.json'), 'utf8'));
  assert.equal(notes.format, 'netacad-notes/1');
  const c = notes.learners['bruno.brach.inf24@stud.example.ch'].contacts;
  assert.equal(c.length, 1);
  assert.equal(c[0].text, 'Nachgefragt');

  await post(`/people/${id}/contacts`, new URLSearchParams({ date: '2026-11-01', text: 'zweiter' }));
  assert.ok(fs.existsSync(path.join(dataDir, 'notes.backup.json')));
  const backup = JSON.parse(fs.readFileSync(path.join(dataDir, 'notes.backup.json'), 'utf8'));
  assert.equal(backup.learners['bruno.brach.inf24@stud.example.ch'].contacts.length, 1);

  const page = await (await get(`/people/${id}`)).text();
  assert.match(page, /nachgefragt am 01\.11\.2026/);

  const del = await post(`/people/${id}/contacts/${c[0].id}/delete`, new URLSearchParams(), { 'HX-Request': 'true' });
  assert.equal(del.status, 200);
  const after = JSON.parse(fs.readFileSync(path.join(dataDir, 'notes.json'), 'utf8'));
  assert.equal(after.learners['bruno.brach.inf24@stud.example.ch'].contacts.length, 1);
});

test('reply added later to an existing contact', async () => {
  const { post, dataDir } = setup();
  const key = 'bruno.brach.inf24@stud.example.ch';
  const id = shortId(key);
  await post(`/people/${id}/contacts`, new URLSearchParams({ date: '2026-11-01', text: 'Nachgefragt' }));
  const read = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'notes.json'), 'utf8')).learners[key].contacts;
  const cid = read()[0].id;
  assert.equal(read()[0].reply, '');

  const r = await post(`/people/${id}/contacts/${cid}/reply`, new URLSearchParams({ reply: '  Bin dran, danke!  ' }), { 'HX-Request': 'true' });
  assert.equal(r.status, 200);
  const frag = await r.text();
  assert.match(frag, /Antwort gespeichert/);
  assert.match(frag, /Bin dran, danke!/);
  assert.match(frag, /Antwort bearbeiten/);
  const c = read();
  assert.equal(c.length, 1);
  assert.equal(c[0].reply, 'Bin dran, danke!');
  assert.equal(c[0].text, 'Nachgefragt');

  const missing = await post(`/people/${id}/contacts/c_nope/reply`, new URLSearchParams({ reply: 'x' }));
  assert.equal(missing.status, 404);
});

test('note + snooze → snoozed', async () => {
  const { post, get } = setup();
  const id = shortId('gina.pause.im26@stud.example.ch');
  const r = await post(`/people/${id}/note`, new URLSearchParams({ note: 'Prüfungsphase', snoozeUntil: '2026-12-01' }), { 'HX-Request': 'true' });
  assert.equal(r.status, 200);
  const page = await (await get('/people?status=snoozed')).text();
  assert.match(page, /Pause, Gina/);
  assert.match(page, /pausiert bis 01\.12\.2026/);
});

test('salutation saved per person, used in template', async () => {
  const { post, get, dataDir } = setup();
  const id = shortId('bruno.brach.inf24@stud.example.ch');
  const r = await post(`/people/${id}/salutation`, new URLSearchParams({ salutation: '  Sehr geehrter   Herr Brach ' }), { 'HX-Request': 'true' });
  assert.equal(r.status, 200);
  const frag = await r.text();
  assert.match(frag, /^<section id="template">/);
  assert.match(frag, /Sehr geehrter Herr Brach,\n\nich sehe/);
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'notes.json'), 'utf8'));
  assert.equal(saved.learners['bruno.brach.inf24@stud.example.ch'].salutation, 'Sehr geehrter Herr Brach');
  assert.ok((await (await get(`/people/${id}`)).text()).includes('body=Sehr%20geehrter%20Herr%20Brach%2C%0A%0A'));
});

test('HX-Request → fragment, otherwise full page', async () => {
  const { get } = setup();
  const full = await (await get('/people')).text();
  assert.match(full, /^<!doctype html>/);
  assert.match(full, /id="filters"/);
  const frag = await (await get('/people?status=alert', { 'HX-Request': 'true' })).text();
  assert.doesNotMatch(frag, /<html/);
  assert.match(frag, /id="results"/);
  assert.match(frag, /hx-swap-oob/);
  assert.match(frag, /Brach, Bruno/);
  assert.doesNotMatch(frag, /Aktiv, Anna/);
  const boosted = await (await get('/people', { 'HX-Request': 'true', 'HX-Boosted': 'true' })).text();
  assert.match(boosted, /<html/);
});

test('pages render', async () => {
  const { get } = setup();
  for (const p of ['/people', '/courses', '/timeline', '/files', '/settings', '/import', `/people/${shortId('anna.aktiv.inf24@stud.example.ch')}`]) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
  }
  const courses = await (await get('/courses')).text();
  const m = /href="\/courses\/([0-9a-f]{12})"/.exec(courses);
  assert.ok(m);
  assert.equal((await get('/courses/' + m[1])).status, 200);
  assert.equal((await get('/people/000000000000')).status, 404);
  assert.equal((await get('/vendor/htmx.min.js')).status, 200);
  assert.equal((await get('/vendor/pico.min.css')).status, 200);
  assert.equal((await get('/static/app.css')).status, 200);
  assert.equal((await get('/static/..%2Fpackage.json')).status, 404);
  assert.equal((await get('/node_modules/htmx.org/package.json')).status, 404);
  const files = await (await get('/files')).text();
  assert.match(files, /ungültig/);
  assert.match(files, /ersetzt/);
});

test('no data → start page with instructions', async () => {
  const { get } = setup(false);
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /So geht es los/);
});

test('file dropped into snapshots dir appears without restart', async () => {
  const { get, dataDir } = setup(false);
  assert.doesNotMatch(await (await get('/people')).text(), /Test, Tina/);
  fs.writeFileSync(path.join(dataDir, 'snapshots', 'manual.json'), snapshot('2026-11-02T08:00:00.000Z'));
  assert.match(await (await get('/people')).text(), /Test, Tina/);
  fs.rmSync(path.join(dataDir, 'snapshots', 'manual.json'));
  assert.doesNotMatch(await (await get('/people')).text(), /Test, Tina/);
});

test('settings: invalid values are rejected, valid saved', async () => {
  const { post, dataDir } = setup(false);
  const bad = new URLSearchParams({ warnDays: '42', alertDays: '21', contactSubject: '', contactTemplate: 'Hallo {firstName}' });
  const r = await post('/settings', bad);
  assert.equal(r.status, 400);
  const errHtml = await r.text();
  assert.match(errHtml, /muss grösser sein/);
  assert.match(errHtml, /Betreff darf nicht leer sein/);
  assert.ok(!fs.existsSync(path.join(dataDir, 'settings.json')));
  const good = new URLSearchParams({ warnDays: '10', alertDays: '30', contactSubject: 'Frage zu {course}', contactTemplate: 'Hallo {firstName}' });
  assert.equal((await post('/settings', good)).status, 200);
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
  assert.equal(saved.warnDays, 10);
  assert.equal(saved.contactSubject, 'Frage zu {course}');
});

test('person page: subject from settings in field and mailto', async () => {
  const { get } = setup();
  const page = await (await get(`/people/${shortId('bruno.brach.inf24@stud.example.ch')}`)).text();
  assert.ok(page.includes('id="template-subject" type="text" value="NetAcad: JavaScript Essentials 1 2026/27"'));
  assert.ok(page.includes('subject=NetAcad%3A%20JavaScript%20Essentials%201%202026%2F27&amp;body=--%20Anrede%20fehlt%20--%2C%0A%0Aich%20sehe'));
  assert.ok(page.includes('kann ich Ihnen irgendwo helfen?'));
});
