import fs from 'node:fs';
import { loadConfig, serverOrigin } from '../src/config.ts';
import { buildBookmarklet } from '../src/logic/bookmarklet.ts';

const cfg = loadConfig();
try {
  const code = buildBookmarklet(fs.readFileSync(cfg.bookmarkletSrc, 'utf8'), serverOrigin(cfg.port));
  fs.writeFileSync(cfg.bookmarkletTxt, code + '\n', 'utf8');
  console.log(`bookmarklet/bookmarklet.txt geschrieben (${code.length} Zeichen, Ziel ${serverOrigin(cfg.port)})`);
} catch (e) {
  console.error(`Fehler: ${(e as Error).message}`);
  process.exit(1);
}
