import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { buildBookmarklet, checkBookmarklet } from '../src/logic/bookmarklet.ts';
import { TODAY, tempDataDir } from './helpers.ts';

const SRC = fs.readFileSync(loadConfig({}).bookmarkletSrc, 'utf8');

test('bookmarklet source builds and passes the rules', () => {
  const code = buildBookmarklet(SRC, 'http://localhost:8765');
  assert.ok(code.startsWith('javascript:(()=>{'));
  assert.ok(code.includes("'http://localhost:8765'"));
  assert.ok(!code.includes('\n'));
  // Must be syntactically valid JS
  assert.doesNotThrow(() => new Function(code.slice('javascript:'.length)));
});

test('build rejects non-ASCII, % and // comments', () => {
  assert.throws(() => buildBookmarklet("(()=>{const S='__SERVER_ORIGIN__';alert('ö');})()", 'http://x'), /Nicht-ASCII/);
  assert.throws(() => buildBookmarklet("(()=>{const S='__SERVER_ORIGIN__';const p=5%2;})()", 'http://x'), /%/);
  assert.throws(() => buildBookmarklet("(()=>{const S='__SERVER_ORIGIN__';\n// note\n})()", 'http://x'), /Kommentar/);
  assert.doesNotThrow(() => checkBookmarklet("javascript:(()=>{const u='http://localhost:1';})()"));
});

test('settings page builds the bookmarklet for the current PORT', async () => {
  const dataDir = tempDataDir(false);
  const config = { ...loadConfig({ PORT: '6003' }), dataDir };
  const { app } = createApp({ config, csrfToken: 't', today: () => TODAY, log: () => {} });
  const body = await (await app.request('http://localhost:6003/settings')).text();
  assert.match(body, /href="javascript:[^"]*localhost:6003/);
  assert.match(body, /NetAcad → Fortschritt \(:6003\)/);
  assert.doesNotMatch(body, /localhost:8765/);
});
