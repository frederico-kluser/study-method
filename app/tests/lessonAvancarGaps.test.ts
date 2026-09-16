/**
 * tests/lessonAvancarGaps.test.ts — ONDA-AVANCAR-COMPOSER, TENTATIVA 3
 * (cobertura de GAPS — o contrato já está em tests/lessonActionRow.test.ts;
 *  aqui NADA é reassertido pelo mesmo caminho: cobre só o que ficou SEM
 *  asserção depois da reescrita da onda 1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * OS GAPS QUE ESTE ARQUIVO FECHA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. PASSOS DA TABELA `lessonActionStep` NÃO EXERCITADOS. O contrato percorre
 *    a tabela por asserção, mas duas arestas de PRECEDÊNCIA ficaram sem caso:
 *      · `doneMarked` vence `theoryDone` — um remonte que devolve a aula JÁ
 *        CONCLUÍDA com a teoria "em curso" no estado restaurado (ou com a
 *        conversa ainda digitando) é 'proxima-aula', nunca 'revelar'/
 *        'quiz-secao'/'proximo': concluída é concluída, nada mais bloqueia;
 *      · `doneMarked` vence `finishBlock` de QUIZ — o contrato testa a aula
 *        concluída contra `finishBlock: 'challenges'`; o caso 'quiz' (o outro
 *        valor não-nulo do motivo) não tem caso próprio.
 *    (O `!started` no topo já tem o caso com TODOS os flags ligados no
 *    contrato — não repetido aqui.)
 *
 * 2. `lessonActionStatusKey` DE TODOS OS PASSOS, numa tabela única. O contrato
 *    asserta a chave passo a passo, espalhado; o que NÃO existe em lugar
 *    nenhum é a varredura EXAUSTIVA que:
 *      · percorre os 8 passos da união × os 2 valores de `quizCardOnScreen`,
 *        provando que a resposta é INDEPENDENTE do parâmetro para todo passo
 *        que não seja 'quiz-secao' (o único cuja frase depende dele);
 *      · exige que TODA chave não-nula exista, NÃO VAZIA, nos DOIS idiomas —
 *        a frase da linha de ação nunca pode virar o texto da chave crua.
 *
 * 3. PARIDADE i18n DAS CHAVES NOVAS, nos pontos sem cobertura:
 *      · `lesson.nextButton` MORREU — a paridade estrutural de chaves
 *        (tests/i18n-resources.test.ts) só exige o MESMO conjunto nos dois
 *        locales: ela deixaria uma chave morta idêntica nos dois passar.
 *        Aqui se cobra a AUSÊNCIA dela nos dois;
 *      · `revealGateTyping` cita o botão PELO NOME NOVO nos DOIS idiomas — o
 *        contrato mede só o pt-BR (bloco 4, frase da revelação); o en tinha
 *        ficado sem a asserção de citar "Advance" (um rótulo que existe).
 *
 * 4. A PONTE PASSO → EXISTÊNCIA DO AVANÇO. O composer não conhece passos —
 *    a view o dirige com `showAdvance={advanceVisible}`, definido como os
 *    TRÊS passos da teoria. Como o mapa é de fonte (a view não é montável
 *    aqui sem os stores), a guarda lê `advanceVisible` no fonte e o amarra à
 *    máquina PURA: para cada um dos 8 passos, produzido por
 *    `lessonActionStep` com entrada REAL, a visibilidade esperada
 *    (`revelar`/'quiz-secao'/'proximo') bate com o conjunto do fonte. É a
 *    versão "showAdvance=false em cada passo" que não depende de montar a
 *    view — o LADO RENDERIZADO (composer com showAdvance=false) é medido em
 *    tests/lessonAdvanceComposerStates.test.ts.
 *
 * Reprodução: `bash tools/t.sh tests/lessonAvancarGaps.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import { lessonFinishBlock, type LessonFinishBlockReason } from '../src/lib/trackLessonState';
/**
 * Os TIPOS do passo são DECLARADOS aqui, NÃO importados da view: um import
 * estático (mesmo `import type`) de '../src/views/LessonView/LessonView' faz o
 * tsc RESOLVER o .tsx — que entra no programa deste projeto
 * (tsconfig.node.json: tests + lib ES2022 SEM DOM, sem `jsx`) — e o lint morre
 * com TS6142 ("--jsx is not set"). É o padrão do contrato
 * tests/lessonActionRow.test.ts: tipos re-declarados localmente e o módulo da
 * view alcançado SÓ pelo import dinâmico de string não-literal (VIEW_MODULE
 * abaixo, invisível ao tsc).
 */
type LessonActionStep =
  | 'nao-comecou'
  | 'revelar'
  | 'quiz-secao'
  | 'proximo'
  | 'quiz-aula'
  | 'desafio'
  | 'concluir'
  | 'proxima-aula';

interface LessonActionStepInput {
  started: boolean;
  theoryDone: boolean;
  doneMarked: boolean;
  typingTheory: boolean;
  nextBlockedByQuiz: boolean;
  finishBlock: LessonFinishBlockReason | null;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW_MODULE = new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).href;
const VIEW_PATH = new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).pathname;

let lessonActionStep: (input: LessonActionStepInput) => LessonActionStep;
let lessonActionStatusKey: (
  step: LessonActionStep,
  quizCardOnScreen: boolean,
) => string | null;

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

before(async () => {
  const mod = (await import(VIEW_MODULE)) as {
    lessonActionStep: typeof lessonActionStep;
    lessonActionStatusKey: typeof lessonActionStatusKey;
  };
  lessonActionStep = mod.lessonActionStep;
  lessonActionStatusKey = mod.lessonActionStatusKey;
});

const BASE: LessonActionStepInput = {
  // O caso descreve a aula EM CURSO, teoria da seção 1 viva — os desvios
  // ficam explícitos em cada caso.
  started: true,
  theoryDone: false,
  doneMarked: false,
  typingTheory: false,
  nextBlockedByQuiz: false,
  finishBlock: null,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * GAP 1 — arestas de precedência da tabela sem caso no contrato
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('lessonActionStep — arestas de precedência sem caso no contrato', () => {
  it('doneMarked vence theoryDone: aula concluída restaurada com teoria "em curso" é proxima-aula', () => {
    // Remonte híbrido: `track:lesson-done` ok na sessão, o estado do chat
    // restaurado ainda com a última seção sendo escrita e o quiz dela
    // pendente. Se `!theoryDone` falasse mais alto, a aula concluída
    // voltaria oferecendo avanço/revelação — regressão do pedido "concluída
    // é concluída".
    for (const finishBlock of [null, 'quiz', 'challenges'] as const) {
      assert.equal(
        lessonActionStep({
          ...BASE,
          doneMarked: true,
          theoryDone: false,
          typingTheory: true,
          nextBlockedByQuiz: true,
          finishBlock,
        }),
        'proxima-aula',
        `doneMarked + theoryDone=false + finishBlock=${String(finishBlock)} tem de ser proxima-aula`,
      );
    }
  });

  it('doneMarked vence finishBlock de QUIZ — o caso "quiz" (o contrato testa só "challenges")', () => {
    // Espelho do caso do contrato com o OUTRO valor não-nulo do motivo: nem
    // o gate de quiz pendente reabre uma aula já concluída.
    assert.equal(
      lessonActionStep({
        ...BASE,
        theoryDone: true,
        doneMarked: true,
        finishBlock: 'quiz',
      }),
      'proxima-aula',
    );
  });

  it('a régua do doneMarked concorda com a lessonFinishBlock REAL (nada de segunda opinião)', () => {
    // Os dois casos acima, alimentados pela função real de bloqueio — o
    // padrão do contrato (bloco 1, parêntese do dono): o teste não
    // reimplementa a regra de bloqueio, ele a IMPORTA.
    const passou = [{ lastVerdict: 'passed' as const }];
    const naoPassou = [{ lastVerdict: null }];
    assert.equal(lessonFinishBlock(passou, 0), null);
    assert.equal(lessonFinishBlock(naoPassou, 0), 'challenges');
    for (const desafios of [passou, naoPassou]) {
      for (const pendentes of [0, 1]) {
        assert.equal(
          lessonActionStep({
            ...BASE,
            theoryDone: true,
            doneMarked: true,
            finishBlock: lessonFinishBlock(desafios, pendentes),
          }),
          'proxima-aula',
          `doneMarked + lessonFinishBlock(${JSON.stringify(desafios)}, ${pendentes}) é proxima-aula`,
        );
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * GAP 2 — statusKey de TODOS os passos, numa tabela única e exaustiva
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('lessonActionStatusKey — varredura exaustiva dos 8 passos', () => {
  // Os 8 passos da união, na ordem da precedência da tabela.
  const TODOS_OS_PASSOS: LessonActionStep[] = [
    'nao-comecou',
    'revelar',
    'quiz-secao',
    'proximo',
    'quiz-aula',
    'desafio',
    'concluir',
    'proxima-aula',
  ];

  // O MESMO mapa do contrato, escrito como tabela — a intenção aqui não é
  // reassertar caso a caso (o contrato cobre), é garantir que NENHUM passo
  // ficou de fora e que a frase existe nos dois idiomas.
  const ESPERADO: Record<LessonActionStep, string | null> = {
    'nao-comecou': null,
    revelar: 'lesson.revealGateTyping',
    'quiz-secao': 'lesson.quizGateNext', // com o card em cena
    proximo: null,
    'quiz-aula': 'lesson.quizGateFinish',
    desafio: 'lesson.challengeGateFinish',
    concluir: null,
    'proxima-aula': null,
  };

  it('todos os 8 passos respondem a frase esperada — e nenhum ficou de fora da tabela', () => {
    for (const step of TODOS_OS_PASSOS) {
      assert.equal(
        lessonActionStatusKey(step, true),
        ESPERADO[step],
        `passo "${step}" com card em cena`,
      );
    }
  });

  it("quizCardOnScreen só MUDA a frase de 'quiz-secao' — os outros 7 passos são independentes dele", () => {
    // O parâmetro separa os dois estados do gate da seção; se ele vazar para
    // outro passo (ou um passo novo herdar a variação sem querer), esta
    // varredura pega.
    for (const step of TODOS_OS_PASSOS) {
      if (step === 'quiz-secao') continue;
      assert.equal(
        lessonActionStatusKey(step, false),
        lessonActionStatusKey(step, true),
        `passo "${step}" não pode depender de quizCardOnScreen`,
      );
    }
    // E o caso próprio de 'quiz-secao' sem card: a frase NÃO pede resposta
    // impossível (o contrato asserta a chave; aqui, também, que é a ÚNICA
    // variação).
    assert.equal(lessonActionStatusKey('quiz-secao', false), 'lesson.quizGateTyping');
    assert.equal(lessonActionStatusKey('quiz-secao', true), 'lesson.quizGateNext');
  });

  it('toda frase não-nula existe, NÃO VAZIA, nos DOIS idiomas — nos dois valores do parâmetro', () => {
    const dicionarios = [
      ['pt-BR', ptBR as unknown as Record<string, Record<string, string>>],
      ['en', en as unknown as Record<string, Record<string, string>>],
    ] as const;
    for (const step of TODOS_OS_PASSOS) {
      for (const card of [true, false]) {
        const key = lessonActionStatusKey(step, card);
        if (key === null) continue;
        const [ns, leaf] = key.split('.') as [string, string];
        for (const [lng, dict] of dicionarios) {
          assert.ok(
            dict[ns] !== undefined,
            `${lng}: seção "${ns}" ausente (frase do passo "${step}")`,
          );
          const valor = dict[ns][leaf];
          assert.ok(
            typeof valor === 'string' && valor.trim() !== '',
            `${lng}: lesson.${leaf} (frase do passo "${step}") ausente ou vazia`,
          );
        }
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * GAP 3 — paridade i18n das chaves novas, nos pontos sem cobertura
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('i18n da onda avançar — o que a paridade estrutural não pega', () => {
  it('lesson.nextButton MORREU nos DOIS locales (a paridade estrutural deixaria chave morta igual passar)', () => {
    // A chave velha ("Próximo →") saiu de cena com o botão renomeado. O
    // teste de paridade de chaves (tests/i18n-resources.test.ts) exige o
    // MESMO conjunto nos dois locales — uma chave morta idêntica nos dois
    // passa por ele. Aqui se cobra a AUSÊNCIA.
    for (const [lng, dict] of [
      ['pt-BR', ptBR],
      ['en', en],
    ] as const) {
      const lesson = dict.lesson as unknown as Record<string, unknown>;
      assert.ok(
        !('nextButton' in lesson),
        `${lng}: lesson.nextButton sobreviveu — o rótulo velho "Próximo →" renasce se alguém voltar a usá-la`,
      );
    }
  });

  it('revealGateTyping cita o botão PELO NOME NOVO nos DOIS idiomas (o contrato mede só o pt-BR)', () => {
    const pares = [
      ['pt-BR', ptBR],
      ['en', en],
    ] as const;
    for (const [lng, dict] of pares) {
      const lesson = dict.lesson as unknown as Record<string, string>;
      assert.ok(
        lesson.revealGateTyping.includes(lesson.advanceButton),
        `${lng}: a frase da revelação tem de citar o avanço pelo rótulo que existe ` +
          `("${lesson.advanceButton}") — um rótulo que não está na tela não pode ser nomeado`,
      );
    }
  });

  it('advanceButton e as duas dicas do avanço existem nos DOIS locales e são DIFERENTES entre si', () => {
    // O rótulo e as dicas vivem na MESMA linha do composer; dicas idênticas
    // (ou uma faltando) fariam o tooltip dizer a coisa errada num dos
    // idiomas. A distinção rótulo≠dica é a que impede "Avançar" virar tooltip.
    for (const [lng, dict] of [
      ['pt-BR', ptBR],
      ['en', en],
    ] as const) {
      const lesson = dict.lesson as unknown as Record<string, string>;
      for (const k of ['advanceButton', 'revealTypingTooltip', 'quizGateNext']) {
        assert.ok(
          typeof lesson[k] === 'string' && lesson[k].trim() !== '',
          `${lng}: lesson.${k} ausente ou vazia`,
        );
      }
      assert.notEqual(
        lesson.advanceButton,
        lesson.revealTypingTooltip,
        `${lng}: o rótulo do botão não pode ser a dica da revelação`,
      );
      assert.notEqual(
        lesson.advanceButton,
        lesson.quizGateNext,
        `${lng}: o rótulo do botão não pode ser a dica do gate do quiz`,
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * GAP 4 — a ponte passo → existência do avanço (showAdvance por passo)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('a existência do avanço por passo — a ponte entre a máquina e o composer', () => {
  /**
   * Entrada real para CADA passo: `lessonActionStep` é quem decide — o teste
   * não enumera passos à mão, ele produz cada um com uma entrada da tabela e
   * confere que o passo saído dela é o esperado (a própria tabela serve de
   * verificação cruzada do mapeamento entrada→passo usado na view).
   */
  const ENTRADA_POR_PASSO: Array<{
    passo: LessonActionStep;
    input: LessonActionStepInput;
    /** O que a view DEVE passar de showAdvance para este passo. */
    showAdvance: boolean;
  }> = [
    { passo: 'nao-comecou', input: { ...BASE, started: false }, showAdvance: false },
    { passo: 'revelar', input: { ...BASE, typingTheory: true }, showAdvance: true },
    {
      passo: 'quiz-secao',
      input: { ...BASE, nextBlockedByQuiz: true },
      showAdvance: true,
    },
    { passo: 'proximo', input: { ...BASE }, showAdvance: true },
    {
      passo: 'quiz-aula',
      input: { ...BASE, theoryDone: true, finishBlock: 'quiz' },
      showAdvance: false,
    },
    {
      passo: 'desafio',
      input: { ...BASE, theoryDone: true, finishBlock: 'challenges' },
      showAdvance: false,
    },
    { passo: 'concluir', input: { ...BASE, theoryDone: true }, showAdvance: false },
    {
      passo: 'proxima-aula',
      input: { ...BASE, theoryDone: true, doneMarked: true },
      showAdvance: false,
    },
  ];

  /** Os TRÊS passos da teoria — o conjunto do `advanceVisible` da view. */
  const PASSOS_COM_AVANCO: ReadonlySet<string> = new Set(['revelar', 'quiz-secao', 'proximo']);

  it('cada um dos 8 passos, produzido por entrada real, bate com a visibilidade esperada', () => {
    for (const { passo, input, showAdvance } of ENTRADA_POR_PASSO) {
      const saiu = lessonActionStep(input);
      assert.equal(saiu, passo, `a entrada de "${passo}" não produziu o passo esperado`);
      assert.equal(
        PASSOS_COM_AVANCO.has(saiu),
        showAdvance,
        `passo "${passo}": showAdvance deveria ser ${showAdvance}`,
      );
    }
  });

  it('GUARDA DE FONTE: o advanceVisible da view é EXATAMENTE o conjunto dos três passos da teoria', () => {
    // O LADO RENDERIZADO (composer com showAdvance=false) é medido em
    // tests/lessonAdvanceComposerStates.test.ts; aqui trava-se a DECISÃO —
    // se um passo de fim de aula entrar no conjunto (ou um da teoria sair),
    // o composer volta a oferecer avanço onde o CTA é o da linha de ação.
    const VIEW = codeOf(readView());
    const decl = /const advanceVisible =([\s\S]*?);/.exec(VIEW);
    assert.ok(decl, 'a view define advanceVisible');
    const corpo = decl[1];
    for (const passo of PASSOS_COM_AVANCO) {
      assert.match(
        corpo,
        new RegExp(`actionStep === '${passo}'`),
        `passo da teoria "${passo}" tem de estar no advanceVisible`,
      );
    }
    for (const fora of ['nao-comecou', 'quiz-aula', 'desafio', 'concluir', 'proxima-aula']) {
      assert.doesNotMatch(
        corpo,
        new RegExp(`actionStep === '${fora}'`),
        `passo de fora da teoria "${fora}" não pode acender o avanço`,
      );
    }
  });

  it('GUARDA DE FONTE: o composer recebe showAdvance={advanceVisible} — nada de segunda decisão', () => {
    const VIEW = codeOf(readView());
    assert.match(
      VIEW,
      /<LessonComposer[\s\S]*?showAdvance=\{advanceVisible\}/,
      'o gate de existência é o advanceVisible da máquina, não um booleano recalculado no JSX',
    );
    assert.equal(
      (VIEW.match(/advanceVisible/g) ?? []).length,
      2,
      'advanceVisible é declarado UMA vez e usado UMA vez (declaração + prop) — um terceiro ' +
        'uso seria uma segunda decisão de existência',
    );
  });
});

/** Fonte da view sem comentários (o mesmo recorte que os contratos leem). */
function readView(): string {
  return readFileSync(VIEW_PATH, 'utf8');
}
