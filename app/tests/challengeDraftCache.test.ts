/**
 * tests/challengeDraftCache.test.ts — ONDA-RETOMAR: o rascunho do desafio de
 * trilha sobrevive à troca de aba.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O PEDIDO, VERBATIM
 * ══════════════════════════════════════════════════════════════════════════
 * *"quando eu saio de um desafio e volto ele recomeça do zero, arrume isso
 * também"*.
 *
 * O shell monta SÓ a view ativa (src/App.tsx: `const View = VIEWS[active]`):
 * sair da aba Desafio DESMONTA o TrackChallengePanel e o `loadSpec` seguinte
 * reiniciava tudo dos starters — o código do aluno, o cronômetro, as estrelas e
 * o veredito. O cache de sessão (src/lib/challengeDraftCache.ts) é a peça que
 * faz o painel RETOMAR a tentativa.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMO CADA CONTRATO É PROVADO
 * ══════════════════════════════════════════════════════════════════════════
 * BLOCO 1 — o CACHE, importado de verdade (sem cópia): round-trip completo,
 *   drain one-shot, clone defensivo, ausência → null, e a INJETIVIDADE da
 *   chave (trilha/alvo/aula/módulo/desafio diferentes NUNCA se misturam).
 * BLOCO 2 — o HOLDER anti-StrictMode (mesmo contrato do createLessonChatHolder):
 *   em dev o efeito de montagem roda duas vezes e o take é one-shot — sem
 *   retenção, a 2ª passada reinicializaria o desafio por cima da restauração.
 * BLOCO 3 — a FIAÇÃO do painel, ancorada na FONTE de produção (precedente
 *   tests/cadeadoIntegracao.test.ts): não há jsdom nesta base, então o que só
 *   um teste de comportamento provaria (o loadSpec restaurando, o relógio
 *   pausando) é cobrado como CERCA sobre o recorte real do arquivo — a função
 *   medida é a MESMA que roda em produção. A cerca do SAVE de unmount é de
 *   LISTA DE COMANDOS, não de presença de string: a revisão adversarial mediu
 *   que um `return;` inserido ANTES do save, mantendo todas as strings,
 *   passava com 34/34 verdes.
 * BLOCO 3b — o SAVE DO DESMONTE medido DE VERDADE: `persistDraftOnUnmount` é
 *   exportado pelo painel e chamado aqui com o cache REAL — um rascunho
 *   INICIADO tem de ENTRAR no cache (é o comportamento que o `return;` do
 *   mutante matava em silêncio).
 * BLOCO 3c — O FANTASMA DO loadSpec: um `loadSpec` em voo que resolve DEPOIS
 *   do desmonte criava um holder NOVO e o `take` DRAINAVA o cache do aluno
 *   (rascunho destruído). O guard de montagem do REF e a ordem dele perante
 *   todo consumo do cache são cobrados aqui, na fonte real.
 * BLOCO 4 — o TRACKER RESTAURADO medido DE VERDADE: `restoreStarTracker` é
 *   exportado pelo próprio painel (como `shouldMarkAbandon`) e é chamado aqui
 *   com trackers reais — é a prova de comportamento do ponto mais sutil da
 *   onda (a estrela perdida não pode voltar quando o aluno retoma o desafio).
 *
 * Reprodução: `bash tools/t.sh tests/challengeDraftCache.test.ts`
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  __resetChallengeDraftForTests,
  challengeDraftCacheKey,
  clearChallengeDraft,
  createChallengeDraftHolder,
  saveChallengeDraft,
  takeChallengeDraft,
  type ChallengeDraft,
  type ChallengeDraftKey,
} from '../src/lib/challengeDraftCache';
import { createStarTracker, type StarTracker } from '../src/lib/challengeStars';
import type { TrackSubmitResult } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  __resetChallengeDraftForTests();
});

/** Chave base dos testes: um desafio de AULA. */
const CHAVE: ChallengeDraftKey = {
  trackSlug: 'trilha-minima',
  target: 'lesson',
  lessonId: 'aula-1',
  challengeId: 'dobro-do-numero',
};

/** Saída REAL de um teste que falhou (é ela que a UI mostra no Alert de erro,
 *  junto do checklist parcial). */
const RESULTADO: TrackSubmitResult = {
  ok: true,
  passed: false,
  testsRun: 1,
  expectedTests: 1,
  output: 'AssertionError [ERR_ASSERTION]: 3 !== 4',
  checks: [{ name: 'dobra de 2', passed: false }],
  passedCount: 0,
  totalCount: 1,
};

/** Rascunho de uma tentativa EM CURSO (código do aluno, relógio andando). */
function rascunho(over: Partial<ChallengeDraft> = {}): ChallengeDraft {
  return {
    code: 'export function dobroDoNumero(n) {\n  return n * 2;\n}',
    filesCode: {},
    activeFile: null,
    started: true,
    elapsedMs: 42_000,
    starsLeft: 2,
    concluded: null,
    result: null,
    marked: null,
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────
describe('challengeDraftCache — save/take do rascunho do desafio', () => {
  it('começa vazio (take = null)', () => {
    assert.equal(takeChallengeDraft(CHAVE), null);
  });

  it('save → take devolve o MESMO rascunho, campo a campo (o aluno volta onde parou)', () => {
    const d = rascunho();
    saveChallengeDraft(CHAVE, d);
    const taken = takeChallengeDraft(CHAVE);
    assert.ok(taken, 'o rascunho salvou e voltou');
    assert.equal(taken.code, d.code, 'o CÓDIGO do aluno é o mesmo');
    assert.deepEqual(taken.filesCode, d.filesCode);
    assert.equal(taken.activeFile, d.activeFile);
    assert.equal(taken.started, true, 'a tentativa continua começada');
    assert.equal(taken.elapsedMs, 42_000, 'o tempo decorrido volta');
    assert.equal(taken.starsLeft, 2, 'as estrelas que sobraram voltam');
    assert.equal(taken.concluded, null);
    assert.equal(taken.result, null);
    assert.equal(taken.marked, null);
  });

  it('o rascunho guarda o ESTADO DA TENTATIVA inteiro — não só o código', () => {
    // Desafio MULTI-ARQUIVO, com veredito na tela e terminal já gravado: é o
    // pior caso do "recomeça do zero" (código + saída do erro + checklist +
    // estrelas + relógio + veredito).
    const d = rascunho({
      code: '',
      filesCode: {
        'lib/soma.mjs': 'export const soma = (a, b) => a + b;',
        'index.mjs': 'import { soma } from "./lib/soma.mjs";',
      },
      activeFile: 'index.mjs',
      elapsedMs: 91_500,
      starsLeft: 1,
      concluded: 'failed',
      result: RESULTADO,
      marked: 'failed',
    });
    saveChallengeDraft(CHAVE, d);
    const taken = takeChallengeDraft(CHAVE);
    assert.ok(taken);
    assert.deepEqual(taken.filesCode, d.filesCode, 'os DOIS arquivos voltam com o código do aluno');
    assert.equal(taken.activeFile, 'index.mjs', 'a aba ativa volta na mesma');
    assert.equal(taken.elapsedMs, 91_500);
    assert.equal(taken.starsLeft, 1);
    assert.equal(taken.concluded, 'failed', 'o veredito na tela volta');
    assert.deepEqual(taken.result, RESULTADO, 'a saída/checklist do erro voltam');
    assert.deepEqual(taken.result?.checks, [{ name: 'dobra de 2', passed: false }]);
    assert.equal(taken.marked, 'failed', 'o terminal já gravado volta (não regrava)');
  });

  it('take é one-shot — a 2ª chamada devolve null (drain)', () => {
    saveChallengeDraft(CHAVE, rascunho());
    assert.ok(takeChallengeDraft(CHAVE), 'a 1ª tomada restaura');
    assert.equal(
      takeChallengeDraft(CHAVE),
      null,
      'cache já consumido: nenhum rascunho fantasma numa remontagem futura',
    );
  });

  it('take devolve CLONE — mutar o devolvido não contamina o cache', () => {
    const d = rascunho({ filesCode: { 'solution.mjs': 'código do aluno' } });
    saveChallengeDraft(CHAVE, d);
    const taken = takeChallengeDraft(CHAVE);
    assert.ok(taken);
    assert.notEqual(taken, d, 'não devolve a referência interna do snapshot');
    taken.filesCode['solution.mjs'] = 'ADULTERADO';
    // O clone de filesCode é a garantia de que o rascunho guardado segue com o
    // código original — o painel edita o mapa de arquivos a cada tecla.
    assert.equal(d.filesCode['solution.mjs'], 'código do aluno');
    assert.equal(taken.code, d.code, 'escalares vêm do snapshot');
  });

  it('rascunho AUSENTE devolve null e não lança (nem na 2ª tentativa)', () => {
    const outra: ChallengeDraftKey = { ...CHAVE, challengeId: 'nunca-visitado' };
    assert.equal(takeChallengeDraft(outra), null);
    assert.equal(takeChallengeDraft(outra), null);
    // E o cache de um desafio REAL não é afetado pela busca de um ausente.
    saveChallengeDraft(CHAVE, rascunho());
    assert.equal(takeChallengeDraft(outra), null);
    assert.ok(takeChallengeDraft(CHAVE), 'o rascunho do desafio certo segue lá');
  });

  it('clear remove pontualmente (take pós-clear = null)', () => {
    saveChallengeDraft(CHAVE, rascunho());
    clearChallengeDraft(CHAVE);
    assert.equal(takeChallengeDraft(CHAVE), null);
  });

  it('__reset esvazia TUDO (montagens novas não veem cache de teste anterior)', () => {
    saveChallengeDraft(CHAVE, rascunho());
    __resetChallengeDraftForTests();
    assert.equal(takeChallengeDraft(CHAVE), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('challengeDraftCache — a chave não mistura desafios', () => {
  it('TRILHA diferente → rascunhos diferentes (mesmo desafio, outra trilha)', () => {
    saveChallengeDraft(CHAVE, rascunho({ code: 'código da trilha A' }));
    saveChallengeDraft({ ...CHAVE, trackSlug: 'outra-trilha' }, rascunho({ code: 'código da trilha B' }));
    assert.equal(takeChallengeDraft(CHAVE)?.code, 'código da trilha A');
    assert.equal(
      takeChallengeDraft({ ...CHAVE, trackSlug: 'outra-trilha' })?.code,
      'código da trilha B',
    );
    assert.equal(takeChallengeDraft({ ...CHAVE, trackSlug: 'trilha-inexistente' }), null);
  });

  it('AULA diferente → rascunhos diferentes (mesma trilha, desafio homônimo)', () => {
    const aula2: ChallengeDraftKey = { ...CHAVE, lessonId: 'aula-2' };
    saveChallengeDraft(CHAVE, rascunho({ code: 'aula 1' }));
    saveChallengeDraft(aula2, rascunho({ code: 'aula 2' }));
    assert.equal(takeChallengeDraft(CHAVE)?.code, 'aula 1');
    assert.equal(takeChallengeDraft(aula2)?.code, 'aula 2');
  });

  it('MÓDULO diferente → rascunhos diferentes; e aula × módulo NÃO colidem', () => {
    const moduloA: ChallengeDraftKey = {
      trackSlug: 'trilha-minima',
      target: 'module',
      moduleSlug: 'mod-1',
      challengeId: 'desafio-do-modulo',
    };
    const moduloB: ChallengeDraftKey = { ...moduloA, moduleSlug: 'mod-2' };
    saveChallengeDraft(moduloA, rascunho({ code: 'módulo 1' }));
    saveChallengeDraft(moduloB, rascunho({ code: 'módulo 2' }));
    // Mesmo slug de desafio, alvo diferente (aula × módulo) → chaves distintas.
    const aulaHomonima: ChallengeDraftKey = {
      trackSlug: 'trilha-minima',
      target: 'lesson',
      lessonId: 'mod-1',
      challengeId: 'desafio-do-modulo',
    };
    saveChallengeDraft(aulaHomonima, rascunho({ code: 'aula homônima' }));
    assert.equal(takeChallengeDraft(moduloA)?.code, 'módulo 1');
    assert.equal(takeChallengeDraft(moduloB)?.code, 'módulo 2');
    assert.equal(takeChallengeDraft(aulaHomonima)?.code, 'aula homônima');
  });

  it('DESAFIO diferente (troca de desafio com o painel montado) → rascunhos diferentes', () => {
    const outro: ChallengeDraftKey = { ...CHAVE, challengeId: 'triplo-do-numero' };
    saveChallengeDraft(CHAVE, rascunho({ code: 'dobro' }));
    saveChallengeDraft(outro, rascunho({ code: 'triplo' }));
    assert.equal(takeChallengeDraft(CHAVE)?.code, 'dobro', 'a chave do desafio anterior não vazou');
    assert.equal(takeChallengeDraft(outro)?.code, 'triplo');
  });

  it('PROFICIÊNCIA × aula do mesmo slug não colidem (o alvo separa)', () => {
    const prof: ChallengeDraftKey = {
      trackSlug: 'trilha-minima',
      target: 'proficiency',
      challengeId: 'proficiencia',
    };
    const aula: ChallengeDraftKey = {
      trackSlug: 'trilha-minima',
      target: 'lesson',
      lessonId: 'proficiencia',
      challengeId: 'proficiencia',
    };
    saveChallengeDraft(prof, rascunho({ code: 'teste da trilha' }));
    saveChallengeDraft(aula, rascunho({ code: 'aula' }));
    assert.equal(takeChallengeDraft(prof)?.code, 'teste da trilha');
    assert.equal(takeChallengeDraft(aula)?.code, 'aula');
  });

  it('challengeDraftCacheKey é INJETIVA no espaço das chaves reais (o ":" não ocorre em slugs)', () => {
    // Cada eixo varia UM campo por vez, ancorado na chave base: todas as
    // chaves do conjunto têm de ser DISTINTAS duas a duas.
    const variantes: ChallengeDraftKey[] = [
      CHAVE,
      { ...CHAVE, trackSlug: 'outra-trilha' },
      { ...CHAVE, target: 'proficiency', lessonId: undefined },
      { ...CHAVE, lessonId: 'aula-2' },
      { ...CHAVE, lessonId: undefined },
      { ...CHAVE, challengeId: 'outro-desafio' },
      {
        trackSlug: 'trilha-minima',
        target: 'module',
        moduleSlug: 'aula-1',
        challengeId: 'dobro-do-numero',
      },
      {
        trackSlug: 'trilha-minima',
        target: 'module',
        moduleSlug: 'mod-2',
        challengeId: 'dobro-do-numero',
      },
    ];
    const chaves = variantes.map(challengeDraftCacheKey);
    assert.equal(
      new Set(chaves).size,
      variantes.length,
      `colisão de chave no cache: ${JSON.stringify(chaves)}`,
    );
    // O escopo é dirigido pelo ALVO: um lessonId vazio NÃO é o mesmo que o
    // moduleSlug com o mesmo texto (e um campo trocado não colide com o campo
    // do outro alvo).
    assert.notEqual(
      challengeDraftCacheKey({ ...CHAVE, lessonId: undefined, moduleSlug: 'aula-1' }),
      challengeDraftCacheKey({ ...CHAVE, lessonId: 'aula-1', moduleSlug: undefined }),
    );
    // E a mesma chave, montada em outra ordem de campos, é a MESMA string.
    assert.equal(challengeDraftCacheKey(CHAVE), challengeDraftCacheKey({ ...CHAVE }));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// createChallengeDraftHolder — anti-StrictMode (retenção entre passadas).
// O efeito de montagem do painel chama loadSpec DUAS vezes em dev (StrictMode
// double-invoke, sem cleanup naquele efeito) e o take é one-shot: sem o holder,
// a 2ª passada veria null e reinicializaria o desafio dos starters por cima da
// restauração da 1ª (o último setState vence).
describe('createChallengeDraftHolder — retenção anti-StrictMode', () => {
  it('get() no primeiro acesso drena o cache e devolve o rascunho', () => {
    const d = rascunho();
    saveChallengeDraft(CHAVE, d);
    const holder = createChallengeDraftHolder(CHAVE);
    assert.equal(holder.get()?.code, d.code);
    assert.equal(takeChallengeDraft(CHAVE), null, 'cache foi drenado no 1º acesso');
  });

  it('get() de novo (cache JÁ vazio) devolve o MESMO rascunho — 2ª passada do double-invoke', () => {
    saveChallengeDraft(CHAVE, rascunho());
    const holder = createChallengeDraftHolder(CHAVE);
    const first = holder.get();
    assert.equal(holder.get(), first, 'mesma referência retida nas passadas');
    assert.equal(holder.get()?.code, rascunho().code, 'a restauração não se perde');
    assert.equal(takeChallengeDraft(CHAVE), null, 'não re-drenou');
  });

  it('holder NOVO com cache vazio devolve null — remontagem real sem rascunho', () => {
    saveChallengeDraft(CHAVE, rascunho());
    createChallengeDraftHolder(CHAVE).get();
    const remontagem = createChallengeDraftHolder(CHAVE);
    assert.equal(remontagem.get(), null, 'a 2ª montagem cai no comportamento de sempre');
  });

  it('cache vazio no primeiro acesso → get() retorna null (e permanece null)', () => {
    const holder = createChallengeDraftHolder(CHAVE);
    assert.equal(holder.get(), null);
    assert.equal(holder.get(), null, 'retém null — nunca muda depois');
    saveChallengeDraft(CHAVE, rascunho());
    assert.equal(holder.get(), null, 'holder retido não re-drena cache novo');
  });

  it('holder de UM desafio não toca no cache de OUTRO (key-match)', () => {
    saveChallengeDraft(CHAVE, rascunho());
    const holder = createChallengeDraftHolder({ ...CHAVE, challengeId: 'outro-desafio' });
    assert.equal(holder.get(), null, 'desafio diferente → não restaura');
    assert.ok(
      takeChallengeDraft(CHAVE),
      'o rascunho do desafio certo segue lá para o alvo certo',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 3 — A FIAÇÃO DO PAINEL, ANCORADA NA FONTE (sem cópia)
 *
 * Esta base não tem jsdom: o que só um clique/desmonte provaria é cobrado como
 * CERCA sobre o recorte REAL do TrackChallengePanel.tsx (precedente
 * tests/cadeadoIntegracao.test.ts). A cerca mata os mutantes que reintroduzem o
 * defeito do dono: parar de salvar no unmount, parar de restaurar no loadSpec,
 * ou voltar a zerar o relógio/estrelas na restauração.
 * ═══════════════════════════════════════════════════════════════════════════ */
const PANEL_SRC = readFileSync(
  resolve(HERE, '../src/views/ChallengeView/TrackChallengePanel.tsx'),
  'utf8',
);

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const PANEL = codeOf(PANEL_SRC);

/** Recorte entre dois marcadores, INCLUINDO os dois (o fim é buscado DEPOIS do
 *  início) — assim o marcador final também pode ser cobrado por asserção. */
function recorte(de: string, ate: string): string {
  const ini = PANEL.indexOf(de);
  assert.notEqual(ini, -1, `não achei "${de}" no painel`);
  const fim = PANEL.indexOf(ate, ini);
  assert.notEqual(fim, -1, `não achei "${ate}" depois de "${de}" no painel`);
  return PANEL.slice(ini, fim + ate.length);
}

/** Módulo do painel pelo IMPORT DINÂMICO — é por ele que as funções exportadas
 *  (restoreStarTracker, persistDraftOnUnmount) são medidas DE VERDADE, com o
 *  código de produção, e não por cópia. */
const PANEL_MODULE = new URL('../src/views/ChallengeView/TrackChallengePanel.tsx', import.meta.url)
  .href;

/**
 * LISTA DE COMANDOS de um corpo (cleanup/função): uma linha = um comando, na
 * ORDEM em que roda. É a cerca que a revisão adversarial exigiu no lugar da
 * checagem de PRESENÇA de string: um `return;` inserido antes do save mantém
 * todas as strings e ACRESCENTA um comando — a lista muda e o teste reprova.
 */
function comandosDe(corpo: string): string[] {
  return corpo
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0);
}

/** LISTA DE CONDIÇÕES de um recorte: o texto de cada `if (...)` na ordem em que
 *  aparece. O recorte tem de ser escolhido SEM parêntese aninhado dentro do
 *  `if` (o extrator é regex, não parser) — o cabeçalho do `.then` do loadSpec
 *  é exatamente esse caso. */
function condicoesDe(recorteDeFonte: string): string[] {
  return [...recorteDeFonte.matchAll(/\bif \(([^)]*)\)/g)].map((m) =>
    m[1].replace(/\s+/g, ' ').trim(),
  );
}

/** Corpo do CLEANUP do efeito de UNMOUNT do rascunho: o efeito (do `useEffect`
 *  até o `}, []);`) e o miolo do `return () => { ... }`. */
function cleanupDoRascunho(): { efeito: string; corpo: string } {
  const ancora = 'persistDraftOnUnmount(draftSnapshotRef.current);';
  const idx = PANEL.indexOf(ancora);
  assert.notEqual(idx, -1, 'o painel parou de salvar o rascunho no desmonte');
  const inicio = PANEL.lastIndexOf('useEffect(() => {', idx);
  assert.notEqual(inicio, -1, 'não isolei o efeito de unmount');
  const fim = PANEL.indexOf('}, []);', idx);
  assert.notEqual(fim, -1, 'o efeito de unmount perdeu as deps vazias (`}, []);`)');
  const efeito = PANEL.slice(inicio, fim + '}, []);'.length);
  const abre = efeito.indexOf('return () => {');
  assert.notEqual(abre, -1, 'o save do rascunho precisa estar no CLEANUP (unmount)');
  return {
    efeito,
    corpo: efeito.slice(abre + 'return () => {'.length, efeito.lastIndexOf('};')),
  };
}

/** Corpo do save do desmonte exportado (`persistDraftOnUnmount`) — a decisão
 *  que o cleanup agora só CHAMA. */
function corpoDoPersist(): string {
  const cabeca =
    'export function persistDraftOnUnmount(snapshot: ChallengeDraftSnapshot | null): void {';
  const ini = PANEL.indexOf(cabeca);
  assert.notEqual(ini, -1, 'o painel parou de exportar persistDraftOnUnmount (o save do desmonte)');
  const fim = PANEL.indexOf('\n}', ini);
  assert.notEqual(fim, -1, 'não achei o fim de persistDraftOnUnmount');
  return PANEL.slice(ini + cabeca.length, fim);
}

describe('(fiação) o painel SALVA o rascunho no unmount', () => {
  it('o cleanup de unmount é UMA chamada ao save do desmonte (lista de comandos fechada)', () => {
    // A CERCA QUE MATA O MUTANTE MEDIDO PELA REVISÃO: um `return;` inserido
    // antes do save mantinha TODAS as strings que o teste antigo cobrava e
    // passava com 34/34 verdes. Aqui o corpo do cleanup é comparado comando a
    // comando: qualquer comando a mais (o `return;`) ou a menos reprova.
    assert.deepEqual(
      comandosDe(cleanupDoRascunho().corpo),
      ['persistDraftOnUnmount(draftSnapshotRef.current);'],
      'o cleanup de unmount ganhou/perdeu comando — um `return;` antes do save mata o desmonte em silêncio',
    );
  });

  it('o cleanup de unmount grava o snapshot pelo REF (nunca pelo closure da render antiga)', () => {
    const { efeito, corpo } = cleanupDoRascunho();
    assert.match(efeito, /^\s*useEffect\(\(\) => \{/, 'o save do rascunho não está mais num useEffect');
    assert.match(efeito, /return \(\) => \{/, 'o save do rascunho precisa estar no CLEANUP (unmount)');
    assert.match(corpo, /draftSnapshotRef\.current/, 'o snapshot tem de ser lido do REF, DENTRO do cleanup');
    assert.match(efeito, /\}, \[\]\);/, 'o efeito de unmount precisa de deps VAZIAS (só o desmonte o roda)');
    // Cleanup de unmount NÃO seta estado (nada de setState depois de desmontar).
    assert.doesNotMatch(efeito, /\bset[A-Z]\w*\(/, 'o cleanup de unmount não pode setar estado');
  });

  it('a decisão do save do desmonte tem lista de comandos fechada (nada de saída antes do save)', () => {
    assert.deepEqual(
      comandosDe(corpoDoPersist()),
      [
        'if (snapshot === null) return;',
        'if (isUntouchedDraft(snapshot.draft)) return;',
        'saveChallengeDraft(snapshot.key, snapshot.draft);',
      ],
      'um `return;` inserido antes do `saveChallengeDraft` muda esta lista (e é o mutante que passava verde)',
    );
  });

  it('o critério de "rascunho intocado" é UM só (nem começou, sem teste e sem veredito)', () => {
    const pred = recorte('function isUntouchedDraft(', '}');
    for (const condicao of [
      '!draft.started',
      'draft.concluded === null',
      'draft.result === null',
      'draft.marked === null',
    ]) {
      assert.ok(pred.includes(condicao), `isUntouchedDraft deixou de exigir "${condicao}"`);
    }
  });

  it('o snapshot carrega TUDO o que o painel zera (código, arquivos, relógio, estrelas, veredito)', () => {
    const corpo = recorte('draftSnapshotRef.current = {', '};');
    for (const campo of [
      'code,',
      'filesCode,',
      'activeFile,',
      'started,',
      'elapsedMs,',
      'starsLeft,',
      'concluded,',
      'result,',
      'marked: markedRef.current,',
    ]) {
      assert.ok(
        corpo.includes(campo),
        `o snapshot do rascunho deixou de guardar "${campo}" — este eixo volta a zerar ao trocar de aba`,
      );
    }
  });

  it('a TROCA DE DESAFIO com o painel montado salva o rascunho ANTERIOR antes de resetar', () => {
    const troca = recorte('const chaveAnterior = draftKeyRef.current;', 'draftKeyRef.current = novaChave;');
    assert.match(troca, /challengeDraftCacheKey\(chaveAnterior\) !== novaChaveStr/);
    assert.match(troca, /saveChallengeDraft\(snapshot\.key, snapshot\.draft\)/, 'a troca de desafio perde o rascunho anterior');
    // A chave não pode vazar: o snapshot só é salvo se for do desafio anterior.
    assert.match(troca, /challengeDraftCacheKey\(snapshot\.key\) === challengeDraftCacheKey\(chaveAnterior\)/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 3b — o SAVE DO DESMONTE, MEDIDO DE VERDADE (com o cache REAL)
 *
 * A cerca de fonte acima mata a PRESENÇA de string; este bloco mata o
 * COMPORTAMENTO. `persistDraftOnUnmount` é exportado pelo painel (mesmo padrão
 * de `shouldMarkAbandon`/`restoreStarTracker`) e o corpo do cleanup virou uma
 * chamada só dele — então "o save do desmonte funciona" é medido chamando a
 * função de PRODUÇÃO contra o cache de PRODUÇÃO: um rascunho iniciado tem de
 * ENTRAR no cache sob a chave do desafio. O mutante medido pela revisão (um
 * `return;` antes do save, todas as strings intactas) reprova aqui.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('(comportamento) persistDraftOnUnmount — o save do desmonte com o cache REAL', () => {
  interface Snapshot {
    key: ChallengeDraftKey;
    draft: ChallengeDraft;
  }
  let persistDraftOnUnmount: (snapshot: Snapshot | null) => void;

  before(async () => {
    const mod = (await import(PANEL_MODULE)) as {
      persistDraftOnUnmount: typeof persistDraftOnUnmount;
    };
    assert.equal(
      typeof mod.persistDraftOnUnmount,
      'function',
      'TrackChallengePanel parou de exportar persistDraftOnUnmount (o save do desmonte)',
    );
    persistDraftOnUnmount = mod.persistDraftOnUnmount;
  });

  it('O DEFEITO, LITERAL: um rascunho INICIADO entra no cache sob a chave do desafio', () => {
    // É o instante do desmonte: o aluno escreveu código e começou o cronômetro.
    // Se este rascunho não entrar no cache, sair da aba e voltar recomeça do
    // zero — o defeito do dono, de volta.
    const d = rascunho();
    persistDraftOnUnmount({ key: CHAVE, draft: d });
    const taken = takeChallengeDraft(CHAVE);
    assert.ok(
      taken,
      'o rascunho iniciado NÃO entrou no cache — trocar de aba volta a perder o trabalho',
    );
    assert.equal(taken.code, d.code, 'o código do aluno tem de voltar');
    assert.equal(taken.started, true, 'a tentativa começada tem de voltar');
    assert.equal(taken.elapsedMs, 42_000, 'o relógio tem de voltar de onde parou');
    assert.equal(taken.starsLeft, 2, 'as estrelas do aluno têm de voltar');
  });

  it('rascunho INTOCADO não entra (nem começou, sem teste e sem veredito)', () => {
    persistDraftOnUnmount({
      key: CHAVE,
      draft: rascunho({ started: false, elapsedMs: 0, starsLeft: 3 }),
    });
    assert.equal(
      takeChallengeDraft(CHAVE),
      null,
      'rascunho intocado entrou no cache — restaurá-lo daria exatamente o estado inicial',
    );
  });

  it('sem snapshot (a spec nunca chegou) não grava nada e não lança', () => {
    assert.doesNotThrow(() => persistDraftOnUnmount(null));
    assert.equal(takeChallengeDraft(CHAVE), null);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 3c — O FANTASMA DO loadSpec: um loadSpec EM VOO NÃO PODE DRENAR O CACHE
 *
 * O defeito medido pela revisão: o `.then` do loadSpec tinha um guard
 * `let cancelled = false;` que NUNCA virava `true` (a única atribuição era a
 * própria declaração e o efeito de montagem não tem cleanup). Um `loadSpec` em
 * voo que resolvia DEPOIS do desmonte criava um holder NOVO para a chave e o
 * `holder.get()` chamava `takeChallengeDraft` — que é DRAIN one-shot — e
 * DELETAVA o rascunho do aluno. Os `setState` eram no-op num fiber morto e
 * ninguém regravava (`draftSnapshotRef.current` ainda é null, a spec nunca
 * chegou): o rascunho era destruído e voltar de novo recomeçava do zero. O
 * guard certo é o `cancelledRef` (o guard de montagem do COMPONENTE, resetado
 * no mount e setado no unmount), e ele tem de vir ANTES de qualquer setState,
 * holder ou take. Sem jsdom, a prova é a cerca de FONTE abaixo — lista de
 * condições e ORDEM —, no mesmo padrão da asserção que mata o no-op do
 * `handleGoToNextLesson` em tests/cadeadoIntegracao.test.ts.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('(fiação) um loadSpec EM VOO desiste quando o painel desmontou (o fantasma não drena o cache)', () => {
  /** Corpo do `loadSpec` inteiro (fonte real, sem comentários). */
  function corpoDoLoadSpec(): string {
    const ini = PANEL.indexOf('const loadSpec = useCallback(');
    assert.notEqual(ini, -1, 'o loadSpec sumiu do painel');
    const fim = PANEL.indexOf('\n  );', ini);
    assert.notEqual(fim, -1, 'não achei o fim do loadSpec');
    return PANEL.slice(ini, fim);
  }

  /** CABEÇALHO do `.then`: do callback até o `setSpec` — onde os guards moram e
   *  onde os `if` são simples (sem parêntese aninhado) para o extrator. */
  function cabecalhoDoThen(): string {
    const corpo = corpoDoLoadSpec();
    const ini = corpo.indexOf('.then((res) => {');
    assert.notEqual(ini, -1, 'o loadSpec deixou de ter um `.then((res) => { ... })`');
    const fim = corpo.indexOf('setSpec(res.challenge);', ini);
    assert.notEqual(fim, -1, 'não achei o `setSpec(res.challenge)` do loadSpec');
    return corpo.slice(ini, fim);
  }

  it('o PRIMEIRO comando do `.then` é o guard do REF (antes de qualquer set/cache)', () => {
    const cabecalho = cabecalhoDoThen();
    // `+ 1` para pular a chave de abertura do callback (`.then((res) => {`).
    const linhas = comandosDe(cabecalho.slice(cabecalho.indexOf('{') + 1));
    assert.equal(
      linhas[0],
      'if (cancelledRef.current) return;',
      'o `.then` voltou a rodar num fiber morto — o take do rascunho DESTRÓI o cache do aluno',
    );
  });

  it('a LISTA de condições do cabeçalho do `.then` é exatamente esta, nesta ordem', () => {
    assert.deepEqual(
      condicoesDe(cabecalhoDoThen()),
      ['cancelledRef.current', 'res.ok === false', '!res.challenge'],
      'um guard inserido, removido ou reescrito no `.then` muda esta lista (é o mutante do Achado A)',
    );
  });

  it('o guard precede TODO consumo do cache e o setSpec do loadSpec', () => {
    const corpo = corpoDoLoadSpec();
    const guarda = corpo.indexOf('if (cancelledRef.current) return;');
    assert.notEqual(
      guarda,
      -1,
      'o guard de montagem do loadSpec sumiu — o fantasma volta a drenar o cache do rascunho',
    );
    for (const alvo of [
      'setSpec(res.challenge);',
      'saveChallengeDraft(snapshot.key, snapshot.draft);',
      'createChallengeDraftHolder(novaChave)',
      'draftHolderRef.current.holder.get()',
    ]) {
      const i = corpo.indexOf(alvo);
      assert.notEqual(i, -1, `o loadSpec deixou de fazer "${alvo}"`);
      assert.ok(guarda < i, `o guard de montagem tem de vir ANTES de "${alvo}"`);
    }
  });

  it('os TRÊS caminhos do loadSpec desistem pelo REF (nada de guard na variável local morta)', () => {
    const corpo = corpoDoLoadSpec();
    assert.deepEqual(
      [...corpo.matchAll(/if \(!?cancelledRef\.current\)[^;]*;/g)].map((m) => m[0].trim()),
      [
        'if (cancelledRef.current) return;',
        'if (cancelledRef.current) return;',
        'if (!cancelledRef.current) setLoading(false);',
      ],
      'o `.then`, o `.catch` e o `.finally` têm de desistir pelo guard de montagem do componente',
    );
    assert.doesNotMatch(
      corpo,
      /\blet cancelled\b/,
      'a variável local morta voltou: um guard que nunca vira `true` documenta uma proteção que não existe',
    );
    assert.doesNotMatch(corpo, /\bif \(cancelled\)/, 'sobrou um guard na variável local do loadSpec');
  });
});

describe('(fiação) o painel RESTAURA no loadSpec', () => {
  // Recorte do ramo `if (draft !== null)` — do take até a reposição do tracker
  // (o ramo tem um if/else interno de multi-arquivo, então o fim é ancorado no
  // último argumento da chamada que reconstrói o tracker).
  const restauro = recorte(
    'const draft = draftHolderRef.current.holder.get();',
    'starsLeft: draft.starsLeft,',
  );

  it('usa o holder do cache (drain one-shot retido — anti-StrictMode)', () => {
    assert.match(PANEL, /createChallengeDraftHolder\(novaChave\)/, 'o painel deixou de drenar o cache do rascunho');
    assert.match(PANEL, /draftHolderRef\.current\.holder\.get\(\)/, 'o loadSpec deixou de tomar o rascunho');
  });

  it('o que veio do cache é RESTAURADO de verdade (a restauração não é ramo morto)', () => {
    // O mutante que este assert mata é o mesmo que a revisão adversarial pegou
    // no bloco (A) do cadeadoIntegracao: um ramo que CONTINUA CONTENDO todas as
    // strings mas nunca executa. Aqui o guarda é cobrado na forma exata.
    assert.match(
      restauro,
      /const draft = draftHolderRef\.current\.holder\.get\(\);\s*setSubmissionError\(null\);\s*if \(draft !== null\) \{/,
      'a restauração virou ramo morto (guard trocado): o rascunho é drenado e jogado fora',
    );
  });

  it('a chave é a do desafio CARREGADO (spec.slug), não a da selection', () => {
    // O handler recusa um challengeId que não bata com o slug resolvido, então
    // na carga normal os dois são iguais; o slug da spec é o único correto
    // quando a regeneração troca o desafio em cena sem trocar a selection.
    assert.match(
      PANEL,
      /challengeDraftKeyFor\(sel, res\.challenge\.slug\)/,
      'o rascunho deixou de ser chaveado pelo desafio que está na tela',
    );
    assert.match(
      PANEL,
      /challengeDraftKeyFor\(selection, res\.challenge\.slug\)/,
      'a regeneração deixou de rechaver o rascunho para o desafio novo (a chave vazaria)',
    );
    assert.match(PANEL, /draftHolderRef\.current = null;/, 'o holder do drain não é descartado na regeneração');
  });

  it('restaura o estado da tentativa em vez de reinicializar dos starters', () => {
    for (const peca of [
      'setCode(draft.code)',
      'setFilesCode(draft.filesCode)',
      'setActiveFile(draft.activeFile)',
      'setStarted(draft.started)',
      'setElapsedMs(draft.elapsedMs)',
      'setStarsLeft(draft.starsLeft)',
      'setConcluded(draft.concluded)',
      'setResult(draft.result)',
      'markedRef.current = draft.marked;',
    ]) {
      assert.ok(
        restauro.includes(peca),
        `a restauração deixou de repor "${peca}" — este eixo do desafio volta ao zero`,
      );
    }
  });

  it('o RELÓGIO PAUSA: startTs reancorado no tempo decorrido (ausência não estoura o tempo)', () => {
    assert.match(
      restauro,
      /startTsRef\.current = draft\.started \? Date\.now\(\) - draft\.elapsedMs : 0;/,
      'o relógio voltou a contar a ausência — voltar depois de 10 min daria timeout',
    );
  });

  it('o tracker é reconstruído SEM devolver estrela já perdida (função pura do painel)', () => {
    assert.match(
      restauro,
      /trackerRef\.current = restoreStarTracker\(\{/,
      'o tracker restaurado deixou de ser reconstruído pela regra pura do painel',
    );
    assert.match(restauro, /elapsedMs: draft\.elapsedMs,/, 'o tracker novo não é sincronizado com o tempo decorrido');
    assert.match(
      restauro,
      /starsLeft: draft\.starsLeft,/,
      'o valor exibido tem de ser o starsLeft que o aluno TINHA',
    );
    assert.match(
      restauro,
      /setStarsLeft\(draft\.starsLeft\)/,
      'as estrelas restauradas têm de vir do rascunho, não do default 3',
    );
  });
});

describe('(fiação) a semântica de abandono continua intacta (golden master)', () => {
  it('o cleanup de abandono segue perguntando a shouldMarkAbandon pelo ref', () => {
    assert.match(
      PANEL,
      /shouldMarkAbandon\(\{ started, concluded, hasSpec: Boolean\(spec\), marked: markedRef\.current \}\)/,
      'a regra de abandono mudou — tests/cadeadoIntegracao.test.ts é o golden master dela',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 4 — O TRACKER RESTAURADO, MEDIDO DE VERDADE
 *
 * `restoreStarTracker` é exportado pelo PRÓPRIO painel (como
 * `shouldMarkAbandon`) — a função medida aqui é a MESMA que a produção chama,
 * não uma cópia. Sem jsdom, é a forma de provar COMPORTAMENTO do ponto mais
 * sutil da onda: o aluno que volta não pode ver a estrela perdida de volta
 * (o tick do painel exibe `tracker.stars()`) nem ser cobrado duas vezes.
 * ═══════════════════════════════════════════════════════════════════════════ */
interface RestoreInput {
  timeLimitMs: number;
  minFirstStarMs: number;
  elapsedMs: number;
  starsLeft: number;
}
let restoreStarTracker: (input: RestoreInput) => StarTracker;

// Desafio de dificuldade 2 (T = 90s + 2*60s = 210s), carência da 1ª estrela de
// 60s — os defaults do produto para desafio de aula.
const LIMITE_MS = 210_000;
const CARENCIA_MS = 60_000;
/** 60% e 85% do limite (os dois limiares de perda por demora). */
const DEMORA_60_MS = LIMITE_MS * 0.6;
const DEMORA_85_MS = LIMITE_MS * 0.85;

before(async () => {
  const mod = (await import(PANEL_MODULE)) as { restoreStarTracker: typeof restoreStarTracker };
  restoreStarTracker = mod.restoreStarTracker;
  assert.equal(
    typeof restoreStarTracker,
    'function',
    'TrackChallengePanel parou de exportar restoreStarTracker',
  );
});

/** Tracker restaurado com os parâmetros do desafio de aula. */
function restaurar(elapsedMs: number, starsLeft: number): StarTracker {
  return restoreStarTracker({
    timeLimitMs: LIMITE_MS,
    minFirstStarMs: CARENCIA_MS,
    elapsedMs,
    starsLeft,
  });
}

describe('restoreStarTracker — a estrela perdida NÃO volta ao retomar o desafio', () => {
  it('O DEFEITO, LITERAL: blur antes do limiar de demora → o tracker não devolve a estrela', () => {
    // O aluno começou, perdeu UMA estrela no blur (janela perdeu o foco) e
    // saiu da aba com 2 estrelas e 30s de cronômetro. Sem a reposição da perda
    // explícita, o tracker recriado diria 3 e o tick do painel
    // (`setStarsLeft(tracker.stars())`) DEVOLVERIA a estrela na cara do aluno.
    const tracker = restaurar(30_000, 2);
    assert.equal(tracker.stars(), 2, 'a estrela perdida no blur voltou — é o defeito de novo');
    // E o blur já contou: uma nova perda de foco não cobra outra estrela (é
    // exatamente o estado do tracker antigo, que já tinha disparado a causa).
    tracker.onBlur();
    assert.equal(tracker.stars(), 2, 'a causa blur foi cobrada duas vezes');
  });

  it('as perdas por DEMORA do tempo já decorrido são reproduzidas (sem cobrar duas vezes)', () => {
    // 130s (> 60% de 210s = 126s): o aluno já tinha perdido a estrela por
    // demora antes de sair — o tracker restaurado também tem de estar em 2.
    assert.equal(restaurar(130_000, 2).stars(), 2);
    // O mesmo tempo com o blur em cima: 1 (não 2, não 0).
    assert.equal(restaurar(130_000, 1).stars(), 1);
    // Acima de 85% (178,5s) são DUAS perdas por demora: resta 1.
    assert.equal(restaurar(180_000, 1).stars(), 1);
    // E o relógio segue de onde parou (a ausência não é contada).
    assert.equal(restaurar(180_000, 1).isTimedOut(180_000), false);
    assert.equal(restaurar(180_000, 1).isTimedOut(LIMITE_MS), true);
  });

  it('a CARÊNCIA da 1ª estrela vale na restauração (demora não tira antes do mínimo)', () => {
    // 90s < 120s de carência de um desafio de proficiência: nem o aluno nem o
    // tracker restaurado perdem estrela por demora.
    const tracker = restoreStarTracker({
      timeLimitMs: LIMITE_MS,
      minFirstStarMs: 120_000,
      elapsedMs: 90_000,
      starsLeft: 3,
    });
    assert.equal(tracker.stars(), 3);
    // Mas a perda EXPLÍCITA (blur) sofrida antes de sair continua contada.
    const comBlur = restoreStarTracker({
      timeLimitMs: LIMITE_MS,
      minFirstStarMs: 120_000,
      elapsedMs: 90_000,
      starsLeft: 2,
    });
    assert.equal(comBlur.stars(), 2, 'a estrela do blur voltou por causa da carência');
  });

  it('PROPRIEDADE: para todo tempo/estrelas legítimos, o tracker restaurado bate com o exibido', () => {
    for (const elapsedMs of [0, 30_000, 59_000, CARENCIA_MS, 125_999, DEMORA_60_MS, 150_000, DEMORA_85_MS, 200_000]) {
      // Quantas estrelas a DEMORA tira neste tempo (tracker novo, sem perdas
      // explícitas) — o valor de referência da reconstrução.
      const referencia = createStarTracker({ timeLimitMs: LIMITE_MS, minFirstStarMs: CARENCIA_MS });
      referencia.onTick(elapsedMs);
      const porDemora = referencia.stars();
      for (const starsLeft of [porDemora, porDemora - 1]) {
        assert.equal(
          restaurar(elapsedMs, starsLeft).stars(),
          starsLeft,
          `t=${elapsedMs}ms com ${starsLeft} estrela(s): o tracker restaurado divergiu do valor exibido`,
        );
      }
      // NUNCA a mais que o exibido (devolver estrela) e nunca mais que 3.
      assert.ok(restaurar(elapsedMs, 0).stars() >= 0, 'estrelas negativas');
      assert.ok(restaurar(elapsedMs, 3).stars() <= 3, 'estrelas acima do teto');
    }
  });
});
