export const SERVER_PLACEHOLDER = '__SERVER_ORIGIN__';

/** Join the readable source into a javascript: URL and check the rules (Appendix A). */
export function buildBookmarklet(source: string, serverOrigin: string): string {
  const body = source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('');
  if (!body.includes(SERVER_PLACEHOLDER)) throw new Error(`Platzhalter ${SERVER_PLACEHOLDER} fehlt in der Quelle`);
  const code = 'javascript:' + body.split(SERVER_PLACEHOLDER).join(serverOrigin);
  checkBookmarklet(code);
  return code;
}

export function checkBookmarklet(code: string): void {
  const nonAscii = /[^\x20-\x7e]/.exec(code);
  if (nonAscii) throw new Error(`Bookmarklet enthält Nicht-ASCII-Zeichen: ${JSON.stringify(nonAscii[0])} an Position ${nonAscii.index}`);
  const pct = code.indexOf('%');
  if (pct >= 0) throw new Error(`Bookmarklet enthält «%» an Position ${pct} (\\x25 verwenden)`);
  const comment = /(^|[^:\\])\/\//.exec(code.slice('javascript:'.length));
  if (comment) throw new Error(`Bookmarklet enthält einen //-Kommentar an Position ${comment.index + 'javascript:'.length}`);
}
