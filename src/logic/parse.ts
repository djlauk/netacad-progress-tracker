import type { AssessmentDef, Flag, LearnerAssessment, Snapshot, SnapshotLearner } from '../types.ts';

export type ParseResult = { ok: true; snapshot: Snapshot; raw: unknown } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

class ParseError extends Error {}

const fail = (msg: string): never => {
  throw new ParseError(msg);
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function optString(o: Obj, key: string, where: string): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') fail(`${where}.${key}: Text erwartet, erhalten ${typeName(v)}`);
  return v as string;
}

function optNumber(o: Obj, key: string, where: string): number | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where}.${key}: Zahl erwartet, erhalten ${typeName(v)}`);
  return v as number;
}

function optDate(o: Obj, key: string, where: string): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (!isIsoDate(v)) fail(`${where}.${key}: Datum im Format YYYY-MM-DD erwartet, erhalten ${JSON.stringify(v)}`);
  return v as string;
}

function optFlag(o: Obj, key: string, where: string): Flag {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean' || typeof v === 'string') return v;
  return fail(`${where}.${key}: true/false oder Text erwartet, erhalten ${typeName(v)}`);
}

function optArray(o: Obj, key: string, where: string): unknown[] {
  const v = o[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) fail(`${where}.${key}: Liste erwartet, erhalten ${typeName(v)}`);
  return v as unknown[];
}

function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'Liste';
  return typeof v === 'object' ? 'Objekt' : typeof v;
}

function parseV1(o: Obj): Snapshot {
  if (!isIsoDate(o.snapshotDate)) fail('Feld «snapshotDate» fehlt oder ist kein Datum (YYYY-MM-DD)');
  if (typeof o.exportedAt !== 'string' || Number.isNaN(Date.parse(o.exportedAt))) {
    fail('Feld «exportedAt» fehlt oder ist kein Zeitpunkt (ISO 8601)');
  }
  if (typeof o.course !== 'string' || o.course.trim() === '') fail('Feld «course» fehlt oder ist leer');
  if (typeof o.courseId !== 'string' || o.courseId.trim() === '') fail('Feld «courseId» fehlt (Kurs-ID aus der NetAcad-Adresse): mit dem aktuellen Bookmarklet neu exportieren');
  if (!Array.isArray(o.learners)) fail('Feld «learners» fehlt oder ist keine Liste');

  const assessments: AssessmentDef[] = optArray(o, 'assessments', 'snapshot').map((a, i) => {
    const w = `assessments[${i}]`;
    if (!isObj(a)) return fail(`${w}: Objekt erwartet`);
    const name = optString(a, 'name', w);
    if (!name) fail(`${w}.name fehlt`);
    return { name: name as string, dueDate: optDate(a, 'dueDate', w) };
  });

  const learners: SnapshotLearner[] = (o.learners as unknown[]).map((l, i) => {
    const w = `learners[${i}]`;
    if (!isObj(l)) return fail(`${w}: Objekt erwartet`);
    const name = optString(l, 'name', w) ?? '';
    const email = optString(l, 'email', w);
    if (!name && !email) fail(`${w}: weder «name» noch «email» vorhanden`);
    const las: LearnerAssessment[] = optArray(l, 'assessments', w).map((a, j) => {
      const w2 = `${w}.assessments[${j}]`;
      if (!isObj(a)) return fail(`${w2}: Objekt erwartet`);
      const an = optString(a, 'name', w2);
      if (!an) fail(`${w2}.name fehlt`);
      return {
        name: an as string,
        score: optNumber(a, 'score', w2),
        maxScore: optNumber(a, 'maxScore', w2),
        submittedOn: optDate(a, 'submittedOn', w2),
      };
    });
    return {
      name,
      email: email && email.trim() ? email.trim() : null,
      status: optString(l, 'status', w),
      classGrade: optNumber(l, 'classGrade', w),
      finalExamScore: optNumber(l, 'finalExamScore', w),
      finalExamSubmitted: optFlag(l, 'finalExamSubmitted', w),
      surveySubmitted: optFlag(l, 'surveySubmitted', w),
      markedComplete: optFlag(l, 'markedComplete', w),
      assessments: las,
    };
  });

  return {
    format: 'netacad-gradebook/1',
    snapshotDate: o.snapshotDate as string,
    exportedAt: o.exportedAt as string,
    course: (o.course as string).trim(),
    url: typeof o.url === 'string' && o.url.trim() ? o.url.trim() : null,
    courseId: (o.courseId as string).trim().toLowerCase(),
    assessments,
    learners,
  };
}

/** One parser per format version. Add 'netacad-gradebook/2' here later. */
const PARSERS: Record<string, (o: Obj) => Snapshot> = {
  'netacad-gradebook/1': parseV1,
};

export function parseSnapshot(raw: unknown): ParseResult {
  try {
    if (!isObj(raw)) return { ok: false, error: 'Kein JSON-Objekt' };
    if (typeof raw.format !== 'string') return { ok: false, error: 'Feld «format» fehlt' };
    const parser = PARSERS[raw.format];
    if (!parser) return { ok: false, error: `Unbekanntes Format «${raw.format}» (erwartet: ${Object.keys(PARSERS).join(', ')})` };
    return { ok: true, snapshot: parser(raw), raw };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message };
    throw e;
  }
}

export function parseSnapshotText(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return { ok: false, error: `Kein gültiges JSON: ${(e as Error).message}` };
  }
  return parseSnapshot(raw);
}
