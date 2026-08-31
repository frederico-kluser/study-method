/**
 * VERIFICAÇÃO A05 — check 1: schemas dos drafts.
 * LessonDraftSchema.safeParse(lesson-draft.json) e
 * ChallengeDraftSchema.safeParse(challenge-draft.json).
 * Esperado: 0 erros.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LessonDraftSchema, ChallengeDraftSchema } from '../../../electron/main/engine/schemas/artifacts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..'); // app/
const conteudo = path.join(root, 'content-src', 'let-e-atribuicao');

function parseJson(file: string): unknown {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text);
}

const lessonRaw = parseJson(path.join(conteudo, 'lesson-draft.json'));
const challengeRaw = parseJson(path.join(conteudo, 'challenge-draft.json'));

const lessonRes = LessonDraftSchema.safeParse(lessonRaw);
const challengeRes = ChallengeDraftSchema.safeParse(challengeRaw);

console.log('=== CHECK 1 — SCHEMAS DOS DRAFTS ===');
console.log(`lesson-draft.json   → ${lessonRes.success ? 'OK (0 erros)' : 'FALHOU'}`);
if (!lessonRes.success) {
  console.log(JSON.stringify(lessonRes.error.flatten(), null, 2));
}
console.log(`challenge-draft.json → ${challengeRes.success ? 'OK (0 erros)' : 'FALHOU'}`);
if (!challengeRes.success) {
  console.log(JSON.stringify(challengeRes.error.flatten(), null, 2));
}
const total = (lessonRes.success ? 0 : 1) + (challengeRes.success ? 0 : 1);
console.log(`TOTAL DE ERROS: ${total}`);
if (total !== 0) process.exit(1);
