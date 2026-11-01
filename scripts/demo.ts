/* Start the server with DATA_DIR=test/fixtures/demo (fresh copy of the fixtures, dates shifted so the newest snapshot is today). */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../src/config.ts';
import { addDays, daysBetween } from '../src/logic/status.ts';

const src = path.join(ROOT_DIR, 'test', 'fixtures', 'snapshots');
const demo = path.join(ROOT_DIR, 'test', 'fixtures', 'demo');
fs.rmSync(demo, { recursive: true, force: true });
fs.mkdirSync(path.join(demo, 'snapshots'), { recursive: true });

const today = new Date().toLocaleDateString('sv-SE');
const names = fs.readdirSync(src).filter((n) => n.endsWith('.json'));
const latest = names.map((n) => n.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop() ?? today;
const shift = daysBetween(latest, today);
const DATE = /\b(\d{4}-\d{2}-\d{2})(?=T|"|_|-)/g;
const move = (s: string) => s.replace(DATE, (d) => addDays(d, shift));

for (const n of names) {
  fs.writeFileSync(path.join(demo, 'snapshots', move(n)), move(fs.readFileSync(path.join(src, n), 'utf8')));
}
fs.writeFileSync(path.join(demo, 'notes.json'), JSON.stringify({
  format: 'netacad-notes/1',
  updatedAt: new Date().toISOString(),
  learners: {
    'gina.pause.im26@stud.example.ch': {
      note: 'Will das Modul bis Ende Semester abschliessen.',
      contacts: [{ id: 'c_demo1', date: addDays(today, -3), channel: 'E-Mail', text: 'Nachgefragt, ob Hilfe nötig', reply: 'Hat Prüfungsphase, macht danach weiter' }],
      snoozeUntil: addDays(today, 30),
    },
  },
}, null, 2) + '\n');

console.log(`Demo-Daten in ${demo} (Daten um ${shift} Tage verschoben)`);
process.env.DATA_DIR = demo;
await import('../src/server.ts');
