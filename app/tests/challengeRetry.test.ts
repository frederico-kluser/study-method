/**
 * tests/challengeRetry.test.ts — ONDA-REFAZER: refazer o MESMO desafio depois
 * de reprovado (ou de timeout).
 *
 * Pedido do dono, verbatim: "se eu erro um desafio eu não posso fazer ele de
 * novo". Antes desta onda o veredito não-aprovado era um beco SEM SAÍDA na
 * própria sessão: `concluded !== null` travava o editor (`readOnly`) e o
 * "Testar resposta" (`canSubmit` exige `!concluded`), e o único caminho que
 * zerava o `concluded` era a REGENERAÇÃO — que para `target === 'module'`
 * (desafio autoral) nem é renderizada. Para o alvo de AULA, o submit falho
 * ainda FECHAVA o painel e deixava o aluno só com "Ver a aula"/"Gerar novo
 * desafio" na bolha de erro: refazer o MESMO teste pela bolha era impossível.
 *
 * O QUE ESTE ARQUIVO MEDE (sem jsdom, mesmo padrão de challengeDraftCache
 * .test.ts / challengeFirstFailFlow.test.ts):
 *
 *   1. COMPORTAMENTO PURO de `planChallengeRetry` (exportado pelo painel) —
 *      o plano de retry tem de ser EXATAMENTE `normalizeDraftForResume`
 *      (regra ÚNICA: se as duas regras divergirem, o mutante mata aqui) e
 *      derivar dele o flag `restartClock`;
 *   2. a SEMÂNTICA DO RELÓGIO pós-retry: o primeiro tick depois do retry NÃO
 *      pode reconcluir 'timeout' na hora (o defeito exato está documentado em
 *      `normalizeDraftForResume`/`handleRetry` — a sonda usa o
 *      `restoreStarTracker` REAL);
 *   3. a FIAÇÃO do painel (cerca de fonte): o botão "Refazer desafio" existe
 *      no veredito 'failed'/'timeout' para TODOS os targets (inclusive
 *      'module', que não tem "Gerar novo desafio"), o handler reancora o
 *      relógio e recria/reconstrói o tracker nos DOIS ramos, e o retry NÃO
 *      toca no dedupe do `markAttempt` (nunca-repetir intacto);
 *   4. a BOLHA DE ERRO da aula ganhou o MESMO "Refazer desafio" (ChatBubble +
 *      LessonView) que reabre o painel do mesmo desafio — os fluxos "Ver a
 *      aula" (1ª falha antes da aula) e "Gerar novo desafio" continuam lá;
 *   5. o veredito do retry que PASSA vira o `lastVerdict` novo (append-only:
 *      `summarizeAttempts` toma a ÚLTIMA linha — verificado, não regredido);
 *   6. as chaves i18n novas existem nos DOIS locales (paridade estrita).
 *
 * Reprodução: `cd app && npm test -- tests/challengeRetry.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ChallengeDraft } from '../src/lib/challengeDraftCache';
import { summarizeAttempts } from '../electron/main/services/trackService';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ─── Fontes reais sob cerca ─────────────────────────────────────────────── */

/** Fonte sem comentários — só o código que realmente roda (mesmo `codeOf` de
 *  challengeDraftCache.test.ts: comentários não contam como fiação). */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const PANEL_SRC = readFileSync(
  resolve(HERE, '../src/views/ChallengeView/TrackChallengePanel.tsx'),
  'utf8',
);
const PANEL = codeOf(PANEL_SRC);
const CHAT_BUBBLE = codeOf(
  readFileSync(resolve(HERE, '../src/components/chat/ChatBubble.tsx'), 'utf8'),
);
const LESSON_VIEW = codeOf(
  readFileSync(resolve(HERE, '../src/views/LessonView/LessonView.tsx'), 'utf8'),
);

/** Recorte entre dois marcadores, INCLUINDO os dois (o fim é buscado DEPOIS do
 *  início) — o mesmo utilitário de challengeDraftCache.test.ts. */
function recorte(fonte: string, de: string, ate: string): string {
  const ini = fonte.indexOf(de);
  assert.notEqual(ini, -1, `não achei "${de}"`);
  const fim = fonte.indexOf(ate, ini);
  assert.notEqual(fim, -1, `não achei "${ate}" depois de "${de}"`);
  return fonte.slice(ini, fim + ate.length);
}

/* ─── O módulo do painel (import dinâmico — exporta as funções puras) ───── */

const PANEL_MODULE = new URL('../src/views/ChallengeView/TrackChallengePanel.tsx', import.meta.url)
  .href;

interface RetryPlan {
  draft: ChallengeDraft;
  restartClock: boolean;
}

let planChallengeRetry: (draft: ChallengeDraft, timeLimitMs: number) => RetryPlan;
let normalizeDraftForResume: (draft: ChallengeDraft, timeLimitMs: number) => ChallengeDraft;
let restoreStarTracker: (input: {
  timeLimitMs: number;
  minFirstStarMs: number;
  elapsedMs: number;
  starsLeft: number;
}) => { stars: () => number; isTimedOut: (elapsedMs: number) => boolean };

before(async () => {
  const mod = (await import(PANEL_MODULE)) as {
    planChallengeRetry: typeof planChallengeRetry;
    normalizeDraftForResume: typeof normalizeDraftForResume;
    restoreStarTracker: typeof restoreStarTracker;
  };
  assert.equal(
    typeof mod.planChallengeRetry,
    'function',
    'TrackChallengePanel parou de exportar planChallengeRetry (o plano do "Refazer desafio")',
  );
  assert.equal(
    typeof mod.normalizeDraftForResume,
    'function',
    'TrackChallengePanel parou de exportar normalizeDraftForResume (a regra ÚNICA do retry)',
  );
  planChallengeRetry = mod.planChallengeRetry;
  normalizeDraftForResume = mod.normalizeDraftForResume;
  restoreStarTracker = mod.restoreStarTracker;
});

/* ─── Entradas realistas (TIPOS reais) ───────────────────────────────────── */

const LIMITE_MS = 210_000; // timeLimitForDifficultyMs(2) — o relógio do desafio de módulo.
const MIN_FIRST_STAR_MS = 60_000;

function rascunho(over: Partial<ChallengeDraft> = {}): ChallengeDraft {
  return {
    code: 'export function dobro(n) { return n; }',
    filesCode: {},
    activeFile: null,
    started: true,
    elapsedMs: 42_000,
    starsLeft: 2,
    concluded: 'failed',
    result: {
      ok: true,
      passed: false,
      testsRun: 1,
      expectedTests: 1,
      output: '✖ dobro de 2 é 4',
      checks: [{ name: 'dobro de 2 é 4', passed: false }],
      passedCount: 0,
      totalCount: 1,
    },
    marked: 'failed',
    ...over,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. planChallengeRetry — o PLANO do retry é a regra ÚNICA (sem duplicata)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('planChallengeRetry — refazer é retomar, com a regra ÚNICA', () => {
  it("'failed' VIVO: concluded volta a null, código/evidência/relógio PRESERVADOS", () => {
    const d = rascunho({ concluded: 'failed', elapsedMs: 42_000, starsLeft: 2 });
    const plano = planChallengeRetry(d, LIMITE_MS);

    assert.equal(plano.draft.concluded, null, 'o editor e o "Testar resposta" religam por derivação');
    assert.equal(plano.draft.code, d.code, 'o aluno CORRIGE o que escreveu — o código fica');
    assert.equal(plano.draft.result, d.result, 'a evidência do erro (checklist/saída) fica na tela');
    assert.equal(plano.draft.marked, 'failed', 'o "já tem terminal gravado" não é tocado (dedupe/abandono)');
    assert.equal(plano.draft.started, true, 'a tentativa CONTINUA — não volta ao ato 1');
    assert.equal(plano.draft.elapsedMs, 42_000, 'tentativa viva: o relógio segue de onde parou');
    assert.equal(plano.draft.starsLeft, 2, 'as estrelas que o aluno tinha continuam as dele');
    assert.equal(plano.restartClock, false, 'tentativa viva NÃO ganha relógio novo de graça');
  });

  it('multi-arquivo: filesCode/activeFile preservados (o aluno corrige o arquivo errado)', () => {
    const d = rascunho({
      concluded: 'failed',
      code: '',
      filesCode: { 'src/dobro.js': 'x', 'test/dobro.test.js': 'y' },
      activeFile: 'src/dobro.js',
    });
    const plano = planChallengeRetry(d, LIMITE_MS);
    assert.deepEqual(plano.draft.filesCode, d.filesCode, 'o código de TODOS os arquivos fica');
    assert.equal(plano.draft.activeFile, 'src/dobro.js', 'o arquivo ativo não muda sozinho');
  });

  it("'failed' ESTOURADO (elapsedMs >= limite): a tentativa MORREU — relógio zera, código fica", () => {
    // O DEFEITO RESIDUAL (HIGH) da doc de `normalizeDraftForResume`: um
    // 'failed' que nasceu por cima de um timeout congelado mantinha o relógio
    // morto e o primeiro tick reancorado reconcluía 'timeout' na hora.
    const d = rascunho({ concluded: 'failed', elapsedMs: LIMITE_MS, starsLeft: 0 });
    const plano = planChallengeRetry(d, LIMITE_MS);

    assert.equal(plano.draft.concluded, null);
    assert.equal(plano.draft.elapsedMs, 0, 'a tentativa morta recomeça o relógio');
    assert.equal(plano.draft.starsLeft, 3, 'e recomeça com as 3 estrelas');
    assert.equal(plano.draft.code, d.code, 'o código do aluno é PRESERVADO (pedido do dono)');
    assert.equal(plano.draft.result, d.result, 'a evidência segue na tela');
    assert.equal(plano.restartClock, true, 'o painel tem de reancorar o relógio em Date.now()');
  });

  it("'timeout': mesma regra — tentativa morta, código/evidência preservados", () => {
    const d = rascunho({ concluded: 'timeout', elapsedMs: LIMITE_MS + 5_000, starsLeft: 1 });
    const plano = planChallengeRetry(d, LIMITE_MS);

    assert.equal(plano.draft.concluded, null);
    assert.equal(plano.draft.elapsedMs, 0);
    assert.equal(plano.draft.starsLeft, 3);
    assert.equal(plano.draft.code, d.code);
    assert.equal(plano.draft.result, d.result);
    assert.equal(plano.restartClock, true);
  });

  it("'passed'/null: nada a refazer — plano é identidade (a UI nem oferece o botão)", () => {
    for (const concluded of ['passed', null] as const) {
      const d = rascunho({ concluded, elapsedMs: 10_000 });
      const plano = planChallengeRetry(d, LIMITE_MS);
      assert.deepEqual(plano.draft, d, `'${String(concluded)}' não pode ser normalizado`);
      assert.equal(plano.restartClock, false);
    }
  });

  it('limite em que não se pode confiar (0/NaN/ausente) NUNCA zera uma tentativa viva', () => {
    // Mesma escolha conservadora documentada em `normalizeDraftForResume`: sem
    // um limite confiável, o pior erro é dar relógio novo de graça.
    for (const limite of [0, -1, Number.NaN, undefined as unknown as number]) {
      const d = rascunho({ concluded: 'failed', elapsedMs: 999_999, starsLeft: 1 });
      const plano = planChallengeRetry(d, limite);
      assert.equal(plano.draft.elapsedMs, 999_999, `limite ${String(limite)} zerou tentativa viva`);
      assert.equal(plano.draft.starsLeft, 1);
      assert.equal(plano.restartClock, false);
    }
  });

  it('NÃO muta o rascunho de entrada (o snapshot do unmount continua íntegro)', () => {
    const d = rascunho({ concluded: 'timeout', elapsedMs: LIMITE_MS, starsLeft: 0 });
    planChallengeRetry(d, LIMITE_MS);
    assert.equal(d.concluded, 'timeout', 'planChallengeRetry mutou o rascunho de entrada');
    assert.equal(d.elapsedMs, LIMITE_MS, 'planChallengeRetry mutou o relógio de entrada');
    assert.equal(d.starsLeft, 0, 'planChallengeRetry mutou as estrelas de entrada');
  });

  it('REGRA ÚNICA: o plano.devolve é IDÊNTICO ao normalizeDraftForResume (nada de segunda regra)', () => {
    // É esta igualdade que mata o mutante que reescreve a decisão por veredito
    // num dos dois lados: retry e save do desmonte TÊM de concordar sempre.
    const matriz: ChallengeDraft[] = [];
    for (const concluded of ['failed', 'timeout', 'passed', null] as const) {
      for (const elapsedMs of [0, 42_000, LIMITE_MS - 1, LIMITE_MS, LIMITE_MS + 5_000]) {
        matriz.push(rascunho({ concluded, elapsedMs, starsLeft: elapsedMs >= LIMITE_MS ? 0 : 2 }));
      }
    }
    for (const d of matriz) {
      assert.deepEqual(
        planChallengeRetry(d, LIMITE_MS).draft,
        normalizeDraftForResume(d, LIMITE_MS),
        `plano divergiu da normalização para concluded=${String(d.concluded)} elapsed=${d.elapsedMs}`,
      );
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. O RELÓGIO PÓS-RETRY — o primeiro tick não pode reconcluir 'timeout'
 *    (o defeito exato está na doc de `normalizeDraftForResume`: sem o reset,
 *    `startTsRef` reancorado no tempo bruto dava isTimedOut() true no tick 1)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('pós-retry: o primeiro tick NÃO reconclui o veredito morto', () => {
  /** O que o painel reancora ANTES do setState (handleRetry): a mesma conta. */
  function elapsedAncorado(plano: RetryPlan): number {
    return plano.restartClock ? 0 : plano.draft.elapsedMs;
  }

  it('timeout → retry: tracker novo com 3 estrelas e isTimedOut falso no tick 1', () => {
    const plano = planChallengeRetry(
      rascunho({ concluded: 'timeout', elapsedMs: LIMITE_MS, starsLeft: 0 }),
      LIMITE_MS,
    );
    const tracker = restoreStarTracker({
      timeLimitMs: LIMITE_MS,
      minFirstStarMs: MIN_FIRST_STAR_MS,
      elapsedMs: elapsedAncorado(plano),
      starsLeft: plano.draft.starsLeft,
    });
    assert.equal(
      tracker.isTimedOut(elapsedAncorado(plano)),
      false,
      'o tick 1 reconcluiu timeout — o beco do primeiro tick reancorado voltou',
    );
    assert.equal(tracker.stars(), 3, 'a tentativa nova recomeça com 3 estrelas');
  });

  it("'failed' estourado → retry: idem — relógio zero, sem re-conclusão instantânea", () => {
    const plano = planChallengeRetry(
      rascunho({ concluded: 'failed', elapsedMs: LIMITE_MS, starsLeft: 0 }),
      LIMITE_MS,
    );
    const tracker = restoreStarTracker({
      timeLimitMs: LIMITE_MS,
      minFirstStarMs: MIN_FIRST_STAR_MS,
      elapsedMs: elapsedAncorado(plano),
      starsLeft: plano.draft.starsLeft,
    });
    assert.equal(tracker.isTimedOut(elapsedAncorado(plano)), false);
    assert.equal(tracker.stars(), 3);
  });

  it("'failed' vivo → retry: o relógio reancorado continua VIVO (sem timeout, estrelas idem)", () => {
    const plano = planChallengeRetry(
      rascunho({ concluded: 'failed', elapsedMs: 42_000, starsLeft: 2 }),
      LIMITE_MS,
    );
    const tracker = restoreStarTracker({
      timeLimitMs: LIMITE_MS,
      minFirstStarMs: MIN_FIRST_STAR_MS,
      elapsedMs: elapsedAncorado(plano),
      starsLeft: plano.draft.starsLeft,
    });
    assert.equal(
      tracker.isTimedOut(elapsedAncorado(plano)),
      false,
      'tentativa viva reancorada não pode estourar no tick 1',
    );
    assert.equal(tracker.stars(), 2, 'a estrela perdida não volta nem é cobrada duas vezes');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. A FIAÇÃO DO PAINEL (cerca de fonte — precedente cadeadoIntegracao /
 *    challengeDraftCache): o botão existe para TODOS os targets e o handler
 *    faz o reset dos refs que o plano pede
 * ══════════════════════════════════════════════════════════════════════════ */

describe('(fiação) TrackChallengePanel — "Refazer desafio" no veredito não-aprovado', () => {
  /** O bloco de ações do veredito 'failed'/'timeout' (do gate ao rótulo do
   *  próximo bloco — o `proficiencyPassed`, que vem logo depois). */
  function blocoDeAcoes(): string {
    return recorte(
      PANEL,
      "{concluded === 'failed' || concluded === 'timeout' ? (",
      'challenge.proficiencyPassed',
    );
  }

  it('o gate do veredito cobre failed E timeout sem gate de target (module INCLUSO)', () => {
    // O mutante que este assert mata: voltar a `selection.target !== 'module'
    // && (...)` — o desafio de MÓDULO não tem regeneração e era o beco sem
    // saída mais fundo da sessão (ACHADO 2 da doc do painel).
    const bloco = blocoDeAcoes();
    const retry = bloco.indexOf('challenge.retryButton');
    assert.ok(retry > -1, 'o botão "Refazer desafio" sumiu do veredito não-aprovado');
    assert.ok(
      bloco.indexOf("selection.target !== 'module'") > retry,
      'o "Refazer desafio" voltou a ficar atrás do gate de target — o aluno de MÓDULO morre no beco',
    );
  });

  it('as SAÍDAS antigas continuam: "Gerar novo desafio" fora de module e "Ver a aula" na 1ª falha', () => {
    const bloco = blocoDeAcoes();
    assert.ok(bloco.includes('challenge.regenerateButton'), '"Gerar novo desafio" sumiu do veredito');
    assert.ok(bloco.includes('lesson.viewLessonButton'), '"Ver a aula" (1ª falha antes da aula) sumiu');
    // A regra de qual saída aparece continua a mesma: module sem regeneração,
    // lesson+attemptedBeforeLesson com "Ver a aula".
    assert.ok(bloco.includes("selection.target !== 'module'"), 'a regeneração voltou a aparecer para module');
    assert.ok(
      bloco.includes("selection.target === 'lesson' && selection.attemptedBeforeLesson === true"),
      'a regra "Ver a aula" × "Gerar novo desafio" foi embora',
    );
  });

  it('rótulo + aria + política "quebra, nunca recorta" + piso de toque 44px', () => {
    const bloco = blocoDeAcoes();
    assert.ok(bloco.includes('challenge.retryButton'), 'sem o rótulo i18n do retry');
    assert.ok(
      bloco.includes('challenge.retryButtonAria'),
      'sem o nome acessível do retry (o veredito tem DOIS botões — leitor de ecrã precisa da distinção)',
    );
    assert.ok(bloco.includes("whiteSpace: 'normal'"), 'o rótulo do retry corta em contêiner estreito');
    assert.ok(bloco.includes("overflowWrap: 'anywhere'"), 'o rótulo do retry corta em contêiner estreito');
    assert.ok(bloco.includes('minHeight: 44'), 'o retry ficou abaixo do piso de toque de 44px');
  });

  it('o handler é UM plano + refs antes do setState (o tick lê os refs no commit)', () => {
    const corpo = recorte(PANEL, 'const handleRetry = useCallback(', 'useEffect(() => {');
    assert.ok(
      corpo.includes('planChallengeRetry('),
      'o handleRetry deixou de usar o plano puro (as regras seriam duplicadas aqui)',
    );
    // Os DOIS ramos reancoram o relógio (o defeito do primeiro tick vive nos dois):
    assert.ok(corpo.includes('if (plano.restartClock) {'), 'sem o ramo de tentativa morta');
    assert.ok(
      corpo.includes('startTsRef.current = Date.now();'),
      'a tentativa morta não reancora o relógio em Date.now() — o tick 1 estoura',
    );
    assert.ok(
      corpo.includes('startTsRef.current = plano.draft.started ? Date.now() - plano.draft.elapsedMs : 0;'),
      'a tentativa viva não reancora o relógio onde parou — o tempo do veredito viraria timeout',
    );
    assert.ok(corpo.includes('createStarTracker({'), 'a tentativa morta não recria o tracker (3 estrelas)');
    assert.ok(
      corpo.includes('restoreStarTracker({'),
      'a tentativa viva não reconstrói o tracker — a estrela perdida voltaria',
    );
    // Ordem: refs (relógio/tracker) ANTES do setState (o efeito do tick roda
    // `tick()` no commit e lê os refs — eles precisam estar coerentes).
    const refRelogio = corpo.indexOf('startTsRef.current =');
    const setConcluded = corpo.indexOf('setConcluded(');
    assert.ok(refRelogio > -1 && setConcluded > refRelogio, 'o setState saiu na frente do reancoragem dos refs');
    // O plano é SEMPRE retomável aqui: concluded volta a null, relógio/estrelas
    // vêm do plano (nunca hardcoded).
    assert.ok(corpo.includes('setConcluded(plano.draft.concluded);'), 'o concluded não volta a null');
    assert.ok(corpo.includes('setElapsedMs(plano.draft.elapsedMs);'), 'o relógio não vem do plano');
    assert.ok(corpo.includes('setStarsLeft(plano.draft.starsLeft);'), 'as estrelas não vêm do plano');
  });

  it('o retry NÃO mexe no dedupe do markAttempt (nunca-repetir intacto) nem no marked', () => {
    const corpo = recorte(PANEL, 'const handleRetry = useCallback(', 'useEffect(() => {');
    assert.doesNotMatch(
      corpo,
      /markedRef\.current\s*=/,
      'o retry zerou o markedRef — um segundo "failed" regravaria o MESMO veredito (nunca-repetir)',
    );
    assert.doesNotMatch(corpo, /markAttempt\(/, 'o retry disparou markAttempt — retry não é veredito');
    // E o dedupe do markAttempt continua no lugar (golden master dele).
    assert.ok(
      PANEL.includes('markedRef.current === verdict'),
      'o dedupe por veredito do markAttempt foi embora',
    );
  });

  it('editor e "Testar resposta" religam POR DERIVAÇÃO (readonly/canSubmit intactos)', () => {
    // O retry não escreve estado novo: religar é consequência de `concluded`
    // voltar a null nas DUAS derivações de sempre — qualquer "solução" que
    // force readonly/canSubmit por fora seria um segundo caminho de beco.
    assert.equal(
      (PANEL.match(/readOnly=\{concluded !== null\}/g) ?? []).length,
      2,
      'o readOnly do editor deixou de ser derivado de concluded (arquivo único E multi-arquivo)',
    );
    assert.ok(PANEL.includes('!concluded'), 'o canSubmit deixou de exigir concluded null');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4. A BOLHA DE ERRO DA AULA — "Refazer desafio" ao lado das saídas antigas
 * ══════════════════════════════════════════════════════════════════════════ */

describe('(fiação) bolha de erro da aula — refazer o MESMO desafio pela bolha', () => {
  it('a ChatBubble ganhou o prop e desenha o botão SÓ na review de erro', () => {
    assert.ok(
      CHAT_BUBBLE.includes('onRetryChallenge?: () => void;'),
      'a ChatBubble não expõe mais o "Refazer desafio"',
    );
    assert.ok(CHAT_BUBBLE.includes('onClick={onRetryChallenge}'), 'o botão retry não navega');
    assert.ok(
      CHAT_BUBBLE.includes("t('translation:challenge.retryButton')"),
      'o rótulo do retry na bolha não é a chave i18n nova',
    );
    // O retry CONVIVE com as saídas antigas (não substitui nenhuma).
    assert.ok(CHAT_BUBBLE.includes('onClick={onViewLesson}'), '"Ver a aula" saiu da bolha');
    assert.ok(CHAT_BUBBLE.includes('onClick={onRegenerate}'), '"Gerar novo desafio" saiu da bolha');
    // E a política de rótulo num contêiner estreito (a bolha tem teto 78%).
    assert.ok(CHAT_BUBBLE.includes("whiteSpace: 'normal'"), 'o rótulo do retry na bolha corta');
    assert.ok(CHAT_BUBBLE.includes("overflowWrap: 'anywhere'"), 'o rótulo do retry na bolha corta');
  });

  it('a LessonView reabre o MESMO desafio pelo mecanismo de sempre (select+navigate)', () => {
    assert.ok(
      LESSON_VIEW.includes('const handleRetryChallengeFromBubble = useCallback('),
      'a LessonView perdeu o handler do "Refazer desafio" da bolha',
    );
    const handler = recorte(
      LESSON_VIEW,
      'const handleRetryChallengeFromBubble = useCallback(',
      'const handleViewLessonFromBubble',
    );
    assert.ok(handler.includes('nav.selectTrackChallenge({'), 'o retry da bolha não seleciona o MESMO desafio');
    assert.ok(handler.includes('nav.navigateToChallenge();'), 'o retry da bolha não navega ao painel');
    assert.ok(
      handler.includes('...(alvo.beforeLesson ? { attemptedBeforeLesson: true } : {})'),
      'a corrente "tentado antes da aula" não é repassada — a 2ª falha pararia de gerar desafio novo',
    );
    assert.ok(handler.includes('alvo.challengeId'), 'o retry da bolha não usa o challengeId da bolha (errorFor)');
  });

  it('o mapa de bolhas passa o retry para toda review COM desafio identificado', () => {
    // O mapa de bolhas virou bloco (blocks/LessonChatLog, extração state/view):
    // a view LIGA o handler e o bloco passa o alvo da bolha (errorFor).
    const LESSON_CHAT_LOG = readFileSync(
      resolve(HERE, '../src/views/LessonView/blocks/LessonChatLog.tsx'),
      'utf8',
    );
    assert.ok(
      LESSON_VIEW.includes('onRetryChallenge={handleRetryChallengeFromBubble}'),
      'a LessonView não plugou o onRetryChallenge no bloco do log',
    );
    assert.ok(
      LESSON_CHAT_LOG.includes('props.onRetryChallenge(retryAlvo)'),
      'o callback do retry não recebe o alvo da bolha (errorFor)',
    );
    assert.ok(
      LESSON_CHAT_LOG.includes("m.kind === 'review' && m.errorFor !== undefined"),
      'o alvo do retry não é a review COM errorFor — bolha sem desafio ganharia botão morto',
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5. O VEREDITO DO RETRY QUE PASSA — append-only, última linha vence
 *    (semântica de markAttempt/summarizeAttempts: VERIFICADA, não regredida)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('markAttempt/summarizeAttempts — o retry que passa vira o lastVerdict', () => {
  it("'failed' e depois 'passed': lastVerdict 'passed' (a última linha vence)", () => {
    const sum = summarizeAttempts([
      { verdict: 'failed', stars: 2 },
      { verdict: 'passed', stars: 3 },
    ]);
    assert.equal(sum.lastVerdict, 'passed', 'o gate da aula veria a reprovacao antiga');
    assert.equal(sum.stars, 3);
  });

  it("'timeout' e depois 'passed': idem — o veredito novo sobrescreve pela ordem", () => {
    const sum = summarizeAttempts([
      { verdict: 'timeout', stars: 1 },
      { verdict: 'passed', stars: 3 },
    ]);
    assert.equal(sum.lastVerdict, 'passed');
    assert.equal(sum.failedCount, 1, 'o histórico de falhas conta o que aconteceu — não some');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6. i18n — as chaves novas nos DOIS locales (paridade estrita do typing)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('i18n — chaves do "Refazer desafio" nos dois locales', () => {
  it('pt-BR: o rótulo pedido pelo dono ("Refazer desafio") + aria com o título', () => {
    assert.equal(ptBR.challenge.retryButton, 'Refazer desafio');
    assert.ok(
      ptBR.challenge.retryButtonAria.includes('{{title}}'),
      'a aria do retry sem o título do desafio não distingue os botões do veredito',
    );
  });

  it('en: rótulo não-vazio e distinto da chave (paridade coberta por i18n-resources)', () => {
    assert.equal(en.challenge.retryButton, 'Redo challenge');
    assert.ok(en.challenge.retryButtonAria.includes('{{title}}'));
  });
});
