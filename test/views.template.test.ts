import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personState } from '../src/logic/status.ts';
import { DEFAULT_SETTINGS } from '../src/store/settings.ts';
import { NO_ACTIVITY, NO_SALUTATION, PLACEHOLDERS, expandTemplate, placeholderHint, templateVars, type TemplateContext } from '../src/views/template.ts';
import { TODAY, fixtureModel } from './helpers.ts';

const model = fixtureModel();

function ctx(email: string, salutation = ''): TemplateContext {
  const person = model.personByKey.get(email)!;
  const state = personState(person, undefined, DEFAULT_SETTINGS, TODAY);
  const cs = state.courses[0];
  return { person, state, course: model.courseByKey.get(cs.courseKey)!, cs, notes: { salutation }, courseName: (k) => model.courseByKey.get(k)!.name };
}

test('all placeholders expand; values for a known person', () => {
  const c = ctx('bruno.brach.inf24@stud.example.ch');
  const keys = PLACEHOLDERS.flatMap((g) => g.items.map((p) => p.key));
  assert.equal(new Set(keys).size, keys.length, 'unique keys');
  const out = expandTemplate(keys.map((k) => `{${k}}`).join('|'), c);
  assert.doesNotMatch(out, /\{\w+\}/);
  const v = templateVars(c);
  assert.equal(v.firstName, 'Bruno');
  assert.equal(v.lastName, 'Brach');
  assert.equal(v.email, 'bruno.brach.inf24@stud.example.ch');
  assert.equal(v.progressStatus, 'nachfragen');
  assert.equal(v.course, 'JavaScript Essentials 1 2026/27');
  assert.equal(v.courseId, 'b68f5a66-bdb0-41d3-8788-65776afbf9ee');
  assert.equal(v.lastActivity, '28.08.2026');
  assert.equal(v.daysInactive, '65');
  assert.equal(v.submittedCount, '1');
  assert.equal(v.assessmentCount, '4');
  assert.equal(v.nextAssessment, 'JSE: Module 2: Module Exam');
  assert.match(v.lastAssessment, /^JSE: Module 1: Module Exam \(79\/100, 28\.08\.2026\)$/);
  assert.equal(v.markedComplete, 'nein');
  assert.equal(v.status, 'IN PROGRESS');
});

test('unknown placeholders stay; hint lists every placeholder', async () => {
  assert.equal(expandTemplate('{gibtsNicht} {firstName}', ctx('anna.aktiv.inf24@stud.example.ch')), '{gibtsNicht} Anna');
  const hint = String(await placeholderHint());
  for (const g of PLACEHOLDERS) for (const p of g.items) assert.ok(hint.includes(`{${p.key}}`), p.key);
});

test('no activity → marker in activity placeholders', () => {
  const v = templateVars(ctx('carla.leer.im26@stud.example.ch'));
  for (const k of ['lastActivity', 'daysInactive', 'lastActivityAll', 'daysInactiveAll']) assert.equal(v[k], NO_ACTIVITY, k);
});

test('salutation: stored text, else marker', () => {
  assert.equal(templateVars(ctx('bruno.brach.inf24@stud.example.ch')).salutation, NO_SALUTATION);
  assert.equal(templateVars(ctx('bruno.brach.inf24@stud.example.ch', 'Sehr geehrter Herr Brach')).salutation, 'Sehr geehrter Herr Brach');
});
