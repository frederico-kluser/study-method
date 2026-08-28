/**
 * tests/challengeGenerateStore.test.ts — PROCESSO GLOBAL do "Gerar novo
 * desafio" (ONDA 3 — generate-flow).
 *
 * Contratos que mordem:
 *   1. startChallengeGenerate inicia 'running' na etapa 0, devolve o
 *      generationId novo (number) e retorna null quando já existe geração em
 *      voo (o modal global é o único processo).
 *   2. advanceChallengeGenerateStage só avança (idempotente para trás) e só
 *      roda em 'running'; etapa 1 (Escrevendo os testes) conclui por salto
 *      (etapas < ativa concluídas — o draft da LLM já contém os testes).
 *   3. Terminais são STICKY: o primeiro 'done'/'error' vence; writes
 *      posteriores viram no-op.
 *   4. CORRELAÇÃO por generationId (revisão ALTO-2): advance/finish/fail/
 *      applyProgress com id de um processo ANTERIOR são descartados — o
 *      terminal atrasado de A não sequestra o processo B.
 *   5. CANCELAMENTO (revisão MÉDIO-1): reset em 'running' volta a idle e os
 *      terminais atrasados (com o id antigo) são descartados — o main NÃO é
 *      abortado, só o modal desliga.
 *   6. listVersion (revisão MÉDIO-2): incrementa SÓ no done (a LessonView
 *      re-busca a lista ao observar); erro e reset não incrementam.
 *   7. applyChallengeGenerateProgress mapeia os 4 marcos do main para as
 *      etapas do modal + os terminais 'done' (com challenge) e 'error'.
 *   8. subscribe + peek formam o par do useSyncExternalStore (o snapshot é o
 *      MESMO objeto enquanto nada muda — referência estável).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetChallengeGenerateForTests,
  advanceChallengeGenerateStage,
  applyChallengeGenerateProgress,
  failChallengeGenerate,
  finishChallengeGenerate,
  peekChallengeGenerate,
  resetChallengeGenerate,
  startChallengeGenerate,
  subscribeChallengeGenerate,
} from '../src/lib/challengeGenerateStore';
import type { TrackRegenerateProgressEvent } from '../shared/ipc-contract';

describe('challengeGenerateStore — processo global de regeneração', () => {
  it('start: idle → running na etapa 0 com o contexto + generationId novo; reset volta a idle', () => {
    __resetChallengeGenerateForTests();
    const id = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' });
    assert.equal(typeof id, 'number');
    assert.ok((id as number) > 0);
    const s = peekChallengeGenerate();
    assert.equal(s.status, 'running');
    assert.equal(s.stage, 0);
    assert.equal(s.generationId, id);
    assert.equal(s.trackSlug, 'trilha');
    assert.equal(s.lessonId, 'aula-1');
    assert.equal(s.target, 'lesson');
    assert.equal(s.challengeId, null);
    assert.equal(s.errorMessage, null);
    assert.equal(s.listVersion, 0);

    resetChallengeGenerate();
    const idle = peekChallengeGenerate();
    assert.equal(idle.status, 'idle');
    assert.equal(idle.stage, -1);
    assert.equal(idle.generationId, null);
    assert.equal(idle.trackSlug, null);
  });

  it('start com geração em voo → null e NÃO altera o contexto em curso; ids são crescentes', () => {
    __resetChallengeGenerateForTests();
    const first = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' });
    const second = startChallengeGenerate({ trackSlug: 'outra', lessonId: 'aula-2', target: 'proficiency' });
    assert.equal(second, null);
    const s = peekChallengeGenerate();
    assert.equal(s.trackSlug, 'trilha'); // contexto do PRIMEIRO vence
    assert.equal(s.status, 'running');

    resetChallengeGenerate();
    const next = startChallengeGenerate({ trackSlug: 'x', lessonId: 'y', target: 'lesson' });
    assert.ok((next as number) > (first as number), 'incremento global — id novo após reset');
  });

  it('advance: só para frente, só em running, com correlação de generationId', () => {
    __resetChallengeGenerateForTests();
    const id = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;

    // Etapa 1 (Escrevendo os testes) NÃO tem evento próprio — conclui por
    // salto quando a etapa 2 (Validando) ativa: é o contrato com o modal.
    advanceChallengeGenerateStage(2, id);
    assert.equal(peekChallengeGenerate().stage, 2);

    // Para trás = no-op (evento atrasado/repetido).
    advanceChallengeGenerateStage(1, id);
    assert.equal(peekChallengeGenerate().stage, 2);

    // ALTO-2: id de OUTRO processo → no-op (correlação).
    advanceChallengeGenerateStage(3, id + 999);
    assert.equal(peekChallengeGenerate().stage, 2, 'evento de processo anterior é descartado');

    advanceChallengeGenerateStage(3, id);
    advanceChallengeGenerateStage(4, id);
    assert.equal(peekChallengeGenerate().stage, 4);

    // Acima do teto é clampado em 4.
    advanceChallengeGenerateStage(99, id);
    assert.equal(peekChallengeGenerate().stage, 4);

    // Fora de 'running' (done) → no-op.
    finishChallengeGenerate({ slug: 'novo', title: 'Novo' }, id);
    advanceChallengeGenerateStage(0, id);
    assert.equal(peekChallengeGenerate().stage, 4);
    assert.equal(peekChallengeGenerate().status, 'done');
  });

  it('terminais sticky: o primeiro done/error vence, writes posteriores são no-op', () => {
    __resetChallengeGenerateForTests();
    const id = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;
    finishChallengeGenerate({ slug: 'novo', title: 'Novo' }, id);
    const done = peekChallengeGenerate();
    assert.equal(done.status, 'done');
    assert.equal(done.challengeId, 'novo');
    assert.equal(done.challengeTitle, 'Novo');
    assert.equal(done.stage, 4);

    // Erro DEPOIS do done → ignorado (o processo já concluiu).
    failChallengeGenerate('erro tardio', id);
    assert.equal(peekChallengeGenerate().status, 'done');
    assert.equal(peekChallengeGenerate().errorMessage, null);

    // E o inverso: erro primeiro → done posterior ignorado.
    __resetChallengeGenerateForTests();
    const id2 = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;
    failChallengeGenerate('falhou', id2);
    assert.equal(peekChallengeGenerate().status, 'error');
    assert.equal(peekChallengeGenerate().errorMessage, 'falhou');
    finishChallengeGenerate({ slug: 'novo', title: 'Novo' }, id2);
    assert.equal(peekChallengeGenerate().status, 'error');
    assert.equal(peekChallengeGenerate().challengeId, null);
  });

  it('ALTO-2 (corrida): terminal ATRASADO do processo A não afeta o processo B', () => {
    __resetChallengeGenerateForTests();
    // A começa, é cancelado/abandonado (idle), e B começa em seguida.
    const idA = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;
    advanceChallengeGenerateStage(3, idA);
    resetChallengeGenerate(); // A "desaparece" (view desmontou / modal fechado)
    const idB = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;
    assert.ok(idB > idA);

    // Eventos do main referentes a A chegam ATRASADOS (o invoke de 150s não
    // aborta o main) — todos descartados pela correlação.
    applyChallengeGenerateProgress({ stage: 'executing', generationId: idA });
    assert.equal(peekChallengeGenerate().status, 'running', 'B segue running');
    assert.equal(peekChallengeGenerate().challengeId, null);
    applyChallengeGenerateProgress({
      stage: 'done',
      generationId: idA,
      challenge: { slug: 'desafio-de-A', title: 'Desafio de A' },
    });
    assert.equal(peekChallengeGenerate().status, 'running', 'done atrasado de A NÃO sequestra B');
    assert.equal(peekChallengeGenerate().challengeId, null);
    assert.equal(peekChallengeGenerate().stage, 0, 'B segue na etapa inicial');

    // O próprio done de B (com o id de B) conclui normalmente.
    applyChallengeGenerateProgress({
      stage: 'done',
      generationId: idB,
      challenge: { slug: 'desafio-de-B', title: 'Desafio de B' },
    });
    assert.equal(peekChallengeGenerate().status, 'done');
    assert.equal(peekChallengeGenerate().challengeId, 'desafio-de-B');
  });

  it('ALTO-2: finish/fail diretos das views também correlacionam por generationId', () => {
    __resetChallengeGenerateForTests();
    const idB = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;
    // A view do processo ANTERIOR tenta concluir (id antigo) → no-op.
    finishChallengeGenerate({ slug: 'de-A', title: 'De A' }, idB + 5);
    assert.equal(peekChallengeGenerate().status, 'running');
    // A view do processo ATUAL conclui com o id certo.
    finishChallengeGenerate({ slug: 'de-B', title: 'De B' }, idB);
    assert.equal(peekChallengeGenerate().challengeId, 'de-B');
  });

  it('MÉDIO-1 (cancelar): reset em running volta a idle e o terminal atrasado é descartado', () => {
    __resetChallengeGenerateForTests();
    const id = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;
    advanceChallengeGenerateStage(2, id);
    resetChallengeGenerate(); // botão Cancelar / Esc / backdrop
    assert.equal(peekChallengeGenerate().status, 'idle');
    // O main NÃO foi abortado — o terminal atrasado chega com o id antigo e é
    // descartado (o modal já fechou; nada o reabre).
    applyChallengeGenerateProgress({ stage: 'done', generationId: id, challenge: { slug: 'x', title: 'X' } });
    assert.equal(peekChallengeGenerate().status, 'idle');
    assert.equal(peekChallengeGenerate().challengeId, null);
  });

  it('MÉDIO-2 (lista stale): listVersion incrementa SÓ no done; erro e reset não incrementam', () => {
    __resetChallengeGenerateForTests();
    const id = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;
    assert.equal(peekChallengeGenerate().listVersion, 0);

    // Erro → sem bump (não há desafio novo a listar).
    failChallengeGenerate('falhou', id);
    assert.equal(peekChallengeGenerate().listVersion, 0);
    // Reset do erro → sem bump.
    resetChallengeGenerate();
    assert.equal(peekChallengeGenerate().listVersion, 0);

    // Done → bump (a LessonView observa e re-busca a lista — o novo desafio
    // chega no TOPO).
    const id2 = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;
    finishChallengeGenerate({ slug: 'novo', title: 'Novo' }, id2);
    assert.equal(peekChallengeGenerate().listVersion, 1);
    // Fechar com X (reset) NÃO desfaz o bump — a re-busca já foi disparada.
    resetChallengeGenerate();
    assert.equal(peekChallengeGenerate().listVersion, 1, 'o token sobrevive ao reset do modal');

    // Novo processo → o token continua acumulando (cada done = 1 bump).
    const id3 = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;
    finishChallengeGenerate({ slug: 'novo-2', title: 'Novo 2' }, id3);
    assert.equal(peekChallengeGenerate().listVersion, 2);
  });

  it('applyChallengeGenerateProgress: mapeia os 4 marcos + terminais do main', () => {
    __resetChallengeGenerateForTests();
    const id = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;

    // 'generating' é idempotente (etapa 0 já ativa no start).
    applyChallengeGenerateProgress({ stage: 'generating', generationId: id });
    assert.equal(peekChallengeGenerate().stage, 0);

    applyChallengeGenerateProgress({ stage: 'validating', generationId: id });
    assert.equal(peekChallengeGenerate().stage, 2);

    applyChallengeGenerateProgress({ stage: 'executing', generationId: id });
    assert.equal(peekChallengeGenerate().stage, 3);

    applyChallengeGenerateProgress({ stage: 'inserting', generationId: id });
    assert.equal(peekChallengeGenerate().stage, 4);

    // Terminal 'done' com o challenge (vem do main — a view pode já ter
    // desmontado: navegação durante a geração).
    applyChallengeGenerateProgress({ stage: 'done', generationId: id, challenge: { slug: 'novo-desafio', title: 'Novo Desafio' } });
    assert.equal(peekChallengeGenerate().status, 'done');
    assert.equal(peekChallengeGenerate().challengeId, 'novo-desafio');
    assert.equal(peekChallengeGenerate().challengeTitle, 'Novo Desafio');
  });

  it("applyChallengeGenerateProgress: terminal 'error' com mensagem (e sem contexto → validação pulada)", () => {
    __resetChallengeGenerateForTests();
    const id = startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' }) as number;

    // Sem contexto pedagógico o main NÃO emite 'validating' — 'executing'
    // chega direto e as etapas 1 e 2 concluem por salto.
    applyChallengeGenerateProgress({ stage: 'executing', generationId: id });
    assert.equal(peekChallengeGenerate().stage, 3);

    applyChallengeGenerateProgress({ stage: 'error', generationId: id, error: 'desafio gerado mas não persistiu: boom' });
    assert.equal(peekChallengeGenerate().status, 'error');
    assert.equal(peekChallengeGenerate().errorMessage, 'desafio gerado mas não persistiu: boom');

    // Terminal depois do erro → no-op.
    applyChallengeGenerateProgress({ stage: 'done', generationId: id, challenge: { slug: 'x', title: 'X' } });
    assert.equal(peekChallengeGenerate().status, 'error');
  });

  it('applyChallengeGenerateProgress: evento SEM generationId aplica (compat — fluxo legado/testes)', () => {
    __resetChallengeGenerateForTests();
    startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' });
    applyChallengeGenerateProgress({ stage: 'validating' as TrackRegenerateProgressEvent['stage'] });
    assert.equal(peekChallengeGenerate().stage, 2);
    applyChallengeGenerateProgress({ stage: 'done', challenge: { slug: 'sem-id', title: 'Sem id' } });
    assert.equal(peekChallengeGenerate().status, 'done');
  });

  it('subscribe + peek: snapshot estável enquanto nada muda; listener roda a cada mutação', () => {
    __resetChallengeGenerateForTests();
    let calls = 0;
    const off = subscribeChallengeGenerate(() => {
      calls += 1;
    });
    const before = peekChallengeGenerate();
    assert.equal(peekChallengeGenerate(), before, 'mesma referência sem mutação');

    startChallengeGenerate({ trackSlug: 'trilha', lessonId: 'aula-1', target: 'lesson' });
    assert.equal(calls, 1);
    assert.notEqual(peekChallengeGenerate(), before, 'mutação → objeto NOVO (snapshot válido)');

    // Mutação que NÃO muda o estado (start em voo) não notifica.
    startChallengeGenerate({ trackSlug: 'x', lessonId: 'y', target: 'lesson' });
    assert.equal(calls, 1);

    off();
    resetChallengeGenerate();
    assert.equal(calls, 1, 'unsubscribed → sem notificações');
  });
});
