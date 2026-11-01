import { html } from 'hono/html';
import type { Point } from '../logic/model.ts';
import { daysBetween, fmtNum } from '../logic/status.ts';
import { fmtDate } from './format.ts';
import type { Html } from './layout.ts';

const W = 640, H = 220, L = 40, R = 16, T = 12, B = 30;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** classGrade over time; x proportional to time; submitted assessments as markers. */
export function gradeChart(points: Point[], label: string): Html {
  const last = points[points.length - 1];
  const markers = last.assessments
    .filter((a) => a.score !== null && a.submittedOn)
    .map((a) => ({ date: a.submittedOn as string, pct: a.maxScore ? (100 * (a.score as number)) / a.maxScore : (a.score as number), a }));
  const dates = [...points.map((p) => p.snapshotDate), ...markers.map((m) => m.date)].sort();
  const x0 = dates[0], x1 = dates[dates.length - 1];
  const span = Math.max(1, daysBetween(x0, x1));
  const x = (d: string) => r1(L + ((W - L - R) * daysBetween(x0, d)) / span);
  const y = (v: number) => r1(T + (H - T - B) * (1 - Math.min(100, Math.max(0, v)) / 100));
  const gp = points.filter((p) => p.classGrade !== null);
  const path = gp.map((p, i) => `${i ? 'L' : 'M'}${x(p.snapshotDate)},${y(p.classGrade as number)}`).join(' ');
  const ticks = [0, 25, 50, 75, 100];
  const xTicks = span === 1 && x0 === x1 ? [x0] : [x0, x1];

  return html`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid meet">
<title>${label}</title>
${ticks.map((t) => html`<line class="chart-grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="chart-label" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`)}
${xTicks.map((d, i) => html`<text class="chart-label" x="${x(d)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : 'end'}">${fmtDate(d)}</text>`)}
${markers.map((m) => html`<g class="chart-marker"><line x1="${x(m.date)}" x2="${x(m.date)}" y1="${y(0)}" y2="${y(m.pct)}"/><rect x="${x(m.date) - 4}" y="${y(m.pct) - 4}" width="8" height="8"><title>${m.a.name}: ${fmtNum(m.a.score as number)}${m.a.maxScore !== null ? '/' + fmtNum(m.a.maxScore) : ''} · abgegeben ${fmtDate(m.date)}</title></rect></g>`)}
${gp.length > 1 ? html`<path class="chart-line" d="${path}" fill="none"/>` : ''}
${gp.map((p) => html`<circle class="chart-point" cx="${x(p.snapshotDate)}" cy="${y(p.classGrade as number)}" r="4"><title>Snapshot ${fmtDate(p.snapshotDate)}: Klassennote ${fmtNum(p.classGrade as number)} %</title></circle>`)}
</svg>
<p class="chart-legend"><small><span class="legend-line" aria-hidden="true"></span> Klassennote (%) pro Snapshot · <span class="legend-marker" aria-hidden="true"></span> abgegebene Prüfung (Punkte in %)</small></p>`;
}

/** Horizontal bar for a table cell. */
export function bar(value: number, max: number): Html {
  const w = max ? r1((200 * value) / max) : 0;
  return html`<svg class="bar" viewBox="0 0 200 14" width="200" height="14" aria-hidden="true"><rect class="bar-bg" x="0" y="0" width="200" height="14"/><rect class="bar-fg" x="0" y="0" width="${w}" height="14"/></svg>`;
}
