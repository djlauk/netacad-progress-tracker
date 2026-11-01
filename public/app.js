// @ts-check
/* Copy text to the clipboard: [data-copy="text"] or [data-copy-target="#selector"]. Plus a drop zone for uploads. */

/** @param {HTMLElement} btn @param {string} text */
async function copy(btn, text) {
  const label = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Kopiert ✓';
  } catch {
    btn.textContent = 'Kopieren nicht möglich';
  }
  setTimeout(() => { btn.textContent = label; }, 1500);
}

document.addEventListener('click', (ev) => {
  const t = ev.target instanceof Element ? ev.target.closest('[data-copy],[data-copy-target]') : null;
  if (!(t instanceof HTMLElement)) return;
  ev.preventDefault();
  const sel = t.dataset.copyTarget;
  if (sel) {
    const src = document.querySelector(sel);
    const text = src instanceof HTMLTextAreaElement || src instanceof HTMLInputElement ? src.value : (src?.textContent ?? '');
    void copy(t, text);
  } else {
    void copy(t, t.dataset.copy ?? '');
  }
});

document.addEventListener('dragover', (ev) => {
  const zone = ev.target instanceof Element ? ev.target.closest('[data-dropzone]') : null;
  if (!zone) return;
  ev.preventDefault();
  zone.classList.add('dragover');
});

document.addEventListener('dragleave', (ev) => {
  const zone = ev.target instanceof Element ? ev.target.closest('[data-dropzone]') : null;
  if (zone) zone.classList.remove('dragover');
});

document.addEventListener('drop', (ev) => {
  const zone = ev.target instanceof Element ? ev.target.closest('[data-dropzone]') : null;
  if (!zone || !ev.dataTransfer) return;
  ev.preventDefault();
  zone.classList.remove('dragover');
  const input = zone.querySelector('input[type=file]');
  if (!(input instanceof HTMLInputElement)) return;
  input.files = ev.dataTransfer.files;
  input.form?.requestSubmit();
});
