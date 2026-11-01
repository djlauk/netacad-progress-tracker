import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { test } from 'node:test';
import { ROOT_DIR, loadConfig } from '../src/config.ts';
import { buildBookmarklet, checkBookmarklet } from '../src/logic/bookmarklet.ts';

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

test('build script writes bookmarklet.txt', () => {
  const r = spawnSync(process.execPath, ['scripts/build-bookmarklet.ts'], { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const txt = fs.readFileSync(loadConfig({}).bookmarkletTxt, 'utf8').trim();
  assert.ok(txt.startsWith('javascript:'));
});
