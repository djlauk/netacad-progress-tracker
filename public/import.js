// @ts-check
/* Import page: read the snapshot from the URL fragment, remove it from the address bar, request a preview. */

(async () => {
  const box = document.getElementById('import-status');
  if (!box) return;
  const raw = location.hash.slice(1);
  // Remove personal data from address bar and history immediately.
  history.replaceState(null, '', location.pathname);

  /** @param {string} msg */
  const fail = (msg) => {
    box.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'msg msg-error';
    p.textContent = msg;
    box.append(p);
  };

  if (!raw) {
    fail('Keine Daten erhalten. Diese Seite wird vom Bookmarklet geöffnet. Dateien lassen sich unter «Dateien» hochladen.');
    return;
  }
  let json;
  try {
    json = decodeURIComponent(raw);
  } catch {
    fail('Die Daten in der Adresse sind beschädigt.');
    return;
  }
  const meta = document.querySelector('meta[name=csrf-token]');
  try {
    const res = await fetch('/import/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': meta instanceof HTMLMetaElement ? meta.content : '',
        'HX-Request': 'true',
      },
      body: json,
    });
    if (!res.ok) {
      fail(`Fehler ${res.status}: ${await res.text()}`);
      return;
    }
    box.innerHTML = await res.text();
    const htmx = /** @type {any} */ (window).htmx;
    if (htmx) htmx.process(box);
  } catch (e) {
    fail('Server nicht erreichbar: ' + (e instanceof Error ? e.message : String(e)));
  }
})();
