/**
 * VALIDAÇÃO 1 — schemas dos drafts (L1 + L2 da trilha programacao-do-zero).
 * LessonDraftSchema.safeParse e ChallengeDraftSchema.safeParse dos 4 arquivos.
 * Esperado: 0 erros.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LessonDraftSchema, ChallengeDraftSchema } from '../../../electron/main/engine/schemas/artifacts';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, '..'); // content-src/programacao-do-zero
const draftsDir = path.join(raiz, 'drafts');
const aulas = ['como-o-site-confere-seu-codigo', 'valor-e-instrucao'];

let totalErros = 0;
console.log('=== CHECK 1 — SCHEMAS DOS DRAFTS (L1 + L2) ===');
for (const aula of aulas) {
  const lesson = JSON.parse(fs.readFileSync(path.join(draftsDir, aula, 'lesson-draft.json'), 'utf8'));
  const challenge = JSON.parse(fs.readFileSync(path.join(draftsDir, aula, 'challenge-draft.json'), 'utf8'));
  const lr = LessonDraftSchema.safeParse(lesson);
  const cr = ChallengeDraftSchema.safeParse(challenge);
  console.log(`${aula}: lesson-draft → ${lr.success ? 'OK (0 erros)' : 'FALHOU'}`);
  if (!lr.success) {
    console.log(JSON.stringify(lr.error.flatten(), null, 2));
    totalErros += 1;
  }
  console.log(`${aula}: challenge-draft → ${cr.success ? 'OK (0 erros)' : 'FALHOU'}`);
  if (!cr.success) {
    console.log(JSON.stringify(cr.error.flatten(), null, 2));
    totalErros += 1;
  }
}
console.log(`TOTAL DE ERROS: ${totalErros}`);
if (totalErros !== 0) process.exit(1);
