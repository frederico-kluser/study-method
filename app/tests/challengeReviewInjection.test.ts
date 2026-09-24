/**
 * tests/challengeReviewInjection.test.ts — a MISTURA de conhecimento prévio nos
 * desafios COM controle de cobertura (pedido do dono, na íntegra: *"os desafios
 * finais da aula englobem conteúdos das aulas anteriores, misturando na prova
 * conhecimentos que ele já possui — ter um controle de modo que o aluno sempre
 * pratique num desafio de aula ou de módulo todo o conhecimento anterior"*).
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. o prompt de regeneração SEM itens de revisão continua byte-idêntico ao
 *      anterior (nenhuma seção nova aparece sozinha);
 *   2. COM itens de revisão, o prompt ganha a seção "TAMBÉM REVISE" (com o átomo
 *      e a aula de origem) e a regra de misturar nos TESTES — sem nunca
 *      afrouxar a régua "NUNCA cobrar algo não ensinado";
 *   3. `buildReviewSelection` sobre a TRILHA REAL (`python-iniciante`) devolve
 *      itens do CONHECIMENTO ANTERIOR da aula (entra na `entrada`, fora do que
 *      a aula introduz), com o teto respeitado — a seleção do controle;
 *   4. a primeira aula da trilha (sem conhecimento anterior) ⇒ [] (nada é
 *      inventado).
 *
 * Reprodução: `cd app && npm test -- tests/challengeReviewInjection.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildRegenerationPrompt, type RegenerationPromptInput } from '../electron/main/services/challengeRegenerator';
import { buildReviewSelection } from '../electron/main/services/reviewSelection';
import { deriveTrackBudget } from '../electron/main/engine/budget';
import { loadTrack, findLessonAnywhere } from '../electron/main/content/trackLoader';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRACK_DIR = resolve(HERE, '../resources/tracks/python-iniciante');

function promptInput(over: Partial<RegenerationPromptInput> = {}): RegenerationPromptInput {
  return {
    trackTitle: 'Python Iniciante',
    lesson: {
      schemaVersion: 1,
      slug: 'arredondar',
      title: 'Arredondar',
      summary: 'O round arredonda números.',
      difficulty: 2,
      concepts: ['arredondar'],
      prerequisites: [],
      theory: [{ id: 's1', title: 'Round', markdown: 'round(valor, 2) devolve duas casas.' }],
      sources: [],
      challenges: [],
    },
    failed: [],
    ...over,
  };
}

describe('challengeReviewInjection — o prompt de regeneração', () => {
  it('SEM itens de revisão: nenhuma seção nova — o prompt não muda', () => {
    const semRevisao = buildRegenerationPrompt(promptInput());
    assert.ok(!semRevisao.includes('TAMBÉM REVISE'), 'a seção não pode aparecer sozinha');
    assert.ok(!semRevisao.includes('retrieval practice'));
    assert.match(semRevisao, /NUNCA cobrar algo não ensinado/);
  });

  it('COM itens de revisão: seção "TAMBÉM REVISE" + a regra de misturar nos testes', () => {
    const comRevisao = buildRegenerationPrompt(
      promptInput({
        reviewAtoms: [
          { atom: 'global:print', origem: 'a-tela/a-primeira-linha' },
          { atom: 'op:binary:+', origem: null },
        ],
      }),
    );
    assert.match(comRevisao, /TAMBÉM REVISE \(intercalado/);
    assert.match(comRevisao, /- global:print \(ensinado em a-tela\/a-primeira-linha\)/);
    assert.match(comRevisao, /- op:binary:\+(?:\n|$)/, 'sem origem conhecida o item entra sozinho');
    assert.match(comRevisao, /misture nos TESTES os itens de TAMBÉM REVISE/);
    assert.match(comRevisao, /NUNCA cobrar algo não ensinado/, 'a régua de fora-do-contexto segue de pé');
    assert.match(comRevisao, /misturar na prova|junto com o da aula atual/);
  });
});

describe('challengeReviewInjection — a seleção sobre a trilha REAL', () => {
  it('aula avançada recebe itens do CONHECIMENTO ANTERIOR, dentro do teto', async () => {
    const track = await loadTrack(TRACK_DIR);
    const budget = deriveTrackBudget(track);
    // 'arredondar' é do meio do módulo 1 — há conhecimento anterior de sobra.
    const found = findLessonAnywhere(track, 'arredondar');
    assert.ok(found !== null, 'a aula existe na trilha real');
    const itens = buildReviewSelection(track, found.moduleSlug, 'arredondar', 3);
    assert.ok(itens.length > 0, 'há conhecimento anterior nunca/antigamente praticado');
    assert.ok(itens.length <= 3, 'o teto é respeitado');
    const atual = budget.byRef.get(`${found.moduleSlug}/arredondar`);
    assert.ok(atual !== undefined);
    const entrada = new Set([...atual.entrada.receptive, ...atual.entrada.productive]);
    const introduzidos = new Set([...atual.introduces.receptive, ...atual.introduces.productive]);
    for (const item of itens) {
      assert.ok(entrada.has(item.atom), `${item.atom} precisa ser conhecimento ANTERIOR da aula`);
      assert.ok(!introduzidos.has(item.atom), `${item.atom} é ensinado NA aula — não é revisão`);
    }
  });

  it('a PRIMEIRA aula da trilha (sem conhecimento anterior) ⇒ [] — nada inventado', async () => {
    const track = await loadTrack(TRACK_DIR);
    const found = findLessonAnywhere(track, 'a-primeira-linha');
    assert.ok(found !== null);
    const itens = buildReviewSelection(track, found.moduleSlug, 'a-primeira-linha');
    assert.deepEqual(itens, [], 'sem entrada não há o que revisar');
  });
});
