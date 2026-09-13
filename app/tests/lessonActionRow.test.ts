/**
 * tests/lessonActionRow.test.ts — ONDA14: a LINHA DE AÇÃO é UM lugar só, e ele
 * mostra O PRÓXIMO PASSO.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * OS DOIS DEFEITOS QUE ESTE ARQUIVO TRAVA (pedidos do dono, verbatim)
 * ══════════════════════════════════════════════════════════════════════════
 * 1. *"quando clico em proximo ja tem que mostrar tudo da digitaçao anterio"*.
 *    O que o código fazia: o "Próximo" só chamava `sendNext`. Com a seção AINDA
 *    SENDO ESCRITA havia dois desfechos, ambos errados —
 *      · seção COM quiz: `nextBlockedByQuiz` já era verdadeiro (o gate conta o
 *        quiz assim que a seção entra em `presentedSections`, sem olhar
 *        `streamingIds`), então o botão nascia DESABILITADO e o clique do dono
 *        nem acontecia: ele clicava e nada revelava;
 *      · seção SEM quiz: o botão estava vivo e o clique AVANÇAVA por cima de
 *        um texto pela metade — a seção anterior sumia meio escrita.
 *    O conserto é o passo 'revelar': com a digitação em curso o botão fica
 *    VIVO e o clique COMPLETA a seção (`requestSkipTyping`), sem avançar. O
 *    gate não é afrouxado — `nextClickAction('quiz-secao') === 'nada'`, e o
 *    'revelar' NUNCA devolve 'avancar'.
 *
 * 2. *"quero que o botao de desafio continue em cima … mas quero esse botao
 *    embaixo tambem porque o ultimo 'proximo' eh o desafio"*.
 *    O que o código fazia: com a teoria concluída e o desafio pendente, a linha
 *    de ação mostrava UM botão "Concluir aula" desabilitado, com o motivo só no
 *    TOOLTIP — que um Button desabilitado nem dispara. O passo 'desafio' põe ali
 *    o CTA do desafio (mesmo destino do botão do cabeçalho) e a frase
 *    `role="status"` que DIZ o que falta; o "Concluir aula" segue ao lado,
 *    travado, mostrando o que o desafio destrava (é o mesmo elemento que
 *    tests/e2e/e2e-lesson.spec.ts mede desabilitado com o tooltip
 *    'Conclua os desafios desta aula primeiro').
 *
 * E o parêntese do dono — *"(e quando for concluido antes da aula ele libere a
 * conclusao da aula)"* — é CONFIRMADO por teste (bloco 1, último caso), contra
 * a `lessonFinishBlock` REAL: desafio com `lastVerdict: 'passed'` antes de a
 * teoria acabar → assim que a teoria acaba o passo é 'concluir', nunca
 * 'desafio'.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMO SE PROVA ISSO SEM jsdom
 * ══════════════════════════════════════════════════════════════════════════
 * Esta base não tem jsdom (a técnica dela é `react-dom/server` — precedentes
 * tests/lessonChatLayout.test.ts e tests/quizOverlayRender.test.ts), e SSR não
 * dispara evento nenhum. Então a prova vem em camadas:
 *
 *   BLOCO 1 — A DECISÃO, PURA. `lessonActionStep` / `nextClickAction` /
 *     `lessonActionStatusKey` são funções: a tabela inteira de estados é
 *     percorrida por asserção, inclusive as ordens de precedência.
 *   BLOCO 2 — A TELA, RENDERIZADA. `LessonActionRow` é exportado pela própria
 *     view (a view usa ESTE componente — não há cópia para teste): monta-se com
 *     o tema e o i18n REAIS e mede-se nome do botão, `disabled` NO ELEMENTO,
 *     alvo de toque, nome acessível do CTA de desafio e a frase role="status".
 *   BLOCO 3 — A FIAÇÃO, ANCORADA NA FONTE. O que só um clique provaria (o
 *     handler que o botão chama) é cobrado como texto, ancorado no recorte da
 *     função — e o gate do `sendNext` é cobrado junto, para que "revelar" nunca
 *     vire uma porta lateral de avanço.
 *
 * Reprodução: `bash tools/t.sh tests/lessonActionRow.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import { lessonFinishBlock, type LessonFinishBlockReason } from '../src/lib/trackLessonState';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW_PATH = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
const VIEW_SRC = readFileSync(VIEW_PATH, 'utf8');
const VIEW_MODULE = new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).href;
// ONDA2-layout: o botão "Desafios" do CABEÇALHO migrou do JSX da view para o
// componente colapsável (CollapsibleLessonHeader) — as guards que falam do
// nome/badge dele agora leem o componente também.
const HEADER_PATH = resolve(HERE, '../src/components/course/CollapsibleLessonHeader.tsx');
const HEADER_SRC = readFileSync(HEADER_PATH, 'utf8');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const VIEW = codeOf(VIEW_SRC);
const HEADER = codeOf(HEADER_SRC);

type Step =
  | 'revelar'
  | 'quiz-secao'
  | 'proximo'
  | 'quiz-aula'
  | 'desafio'
  | 'concluir'
  | 'proxima-aula';

interface StepInput {
  theoryDone: boolean;
  doneMarked: boolean;
  typingTheory: boolean;
  nextBlockedByQuiz: boolean;
  finishBlock: LessonFinishBlockReason | null;
}

interface RowProps {
  step: Step;
  busy: boolean;
  generateRunning: boolean;
  quizCardOnScreen: boolean;
  pendingQuizCount: number;
  pendingChallengeCount: number;
  onNext: () => void;
  onFinish: () => void;
  onChallenge: (anchor: unknown) => void;
  onNextLesson: () => void;
  onRegenerate: () => void;
}

let challengeOpenBlockedByQuiz: (b: LessonFinishBlockReason | null) => boolean;
let lessonActionStep: (input: StepInput) => Step;
let nextClickAction: (step: Step) => 'revelar' | 'avancar' | 'nada';
let lessonActionStatusKey: (step: Step, quizCardOnScreen: boolean) => string | null;
let challengeBadgeCount: (input: {
  theoryDone: boolean;
  pendingQuizCount: number;
  challenges: ReadonlyArray<{ lastVerdict: string | null }>;
}) => number;
let LessonActionRow: ComponentType<RowProps>;

const BASE: StepInput = {
  theoryDone: false,
  doneMarked: false,
  typingTheory: false,
  nextBlockedByQuiz: false,
  finishBlock: null,
};

const BASE_ROW: RowProps = {
  step: 'proximo',
  busy: false,
  generateRunning: false,
  quizCardOnScreen: false,
  pendingQuizCount: 0,
  pendingChallengeCount: 0,
  onNext: () => {},
  onFinish: () => {},
  onChallenge: () => {},
  onNextLesson: () => {},
  onRegenerate: () => {},
};

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção de interpolação da produção (src/i18n/index.ts) — sem ela
    // o harness mede uma string que o app nunca emite (aspas viram &quot;).
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const mod = (await import(VIEW_MODULE)) as {
    challengeOpenBlockedByQuiz: typeof challengeOpenBlockedByQuiz;
    lessonActionStep: typeof lessonActionStep;
    nextClickAction: typeof nextClickAction;
    lessonActionStatusKey: typeof lessonActionStatusKey;
    challengeBadgeCount: typeof challengeBadgeCount;
    LessonActionRow: typeof LessonActionRow;
  };
  challengeOpenBlockedByQuiz = mod.challengeOpenBlockedByQuiz;
  lessonActionStep = mod.lessonActionStep;
  nextClickAction = mod.nextClickAction;
  lessonActionStatusKey = mod.lessonActionStatusKey;
  challengeBadgeCount = mod.challengeBadgeCount;
  LessonActionRow = mod.LessonActionRow;
});

function render(props: Partial<RowProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(LessonActionRow, { ...BASE_ROW, ...props }),
    ),
  );
}

/**
 * A TAG DE ABERTURA do <button> que CONTÉM `marker` (o rótulo visível).
 *
 * Por que não "o elemento mais próximo": o rótulo de um Button do MUI vem
 * DEPOIS do <span> do ícone, então voltar até o `<` anterior devolve `</span>`
 * — uma tag que nunca carrega `disabled` nem a classe do emotion, e contra a
 * qual toda asserção passaria por engano. Aqui se procura o `<button` que
 * abre o controle, que é o elemento cujo estado se quer medir.
 */
function tagOfElementWith(html: string, marker: string): string {
  // Percorre TODAS as ocorrências: o rótulo do botão também aparece DENTRO da
  // frase role="status" (ela cita “Próximo →” pelo nome), e essa ocorrência
  // não mora em botão nenhum.
  let at = html.indexOf(marker);
  while (at !== -1) {
    const open = html.lastIndexOf('<button', at);
    if (open !== -1 && !html.slice(open, at).includes('</button>')) {
      return html.slice(open, html.indexOf('>', open) + 1);
    }
    at = html.indexOf(marker, at + 1);
  }
  assert.fail(`nenhum <button> com "${marker}" foi renderizado`);
}

/**
 * O atributo booleano `disabled` REALMENTE presente nesta tag.
 * `\sdisabled=""` e não `includes('disabled')`: a lista de classes do MUI
 * carrega `Mui-disabled` e a folha carrega `.Mui-disabled{…}` — procurar a
 * substring solta deixa o teste verde contra um botão sempre habilitado.
 */
function isDisabled(tag: string): boolean {
  return /\sdisabled=""/.test(tag);
}

/** A classe do emotion do elemento que carrega `marker`. */
function classOfElementWith(html: string, marker: string): string {
  const cls = /class="([^"]*)"/.exec(tagOfElementWith(html, marker));
  return cls?.[1].split(/\s+/).find((c) => c.startsWith('css-')) ?? '';
}

/** O corpo da regra da classe (todas as declarações, concatenadas). */
function cssOfClass(html: string, cls: string): string {
  const out: string[] = [];
  for (const sheet of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const rule of sheet[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (rule[1].trim() === `.${cls}`) out.push(rule[2].trim());
    }
  }
  return out.join(';');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 1 — a DECISÃO, pura: qual é o próximo passo, e o que o clique faz
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('1. lessonActionStep — o próximo passo, e nada além dele', () => {
  it('teoria em curso, nada travando → "Próximo" avança', () => {
    assert.equal(lessonActionStep(BASE), 'proximo');
  });

  it('DIGITANDO → o passo é REVELAR (o pedido do dono), mesmo com o quiz da seção pendente', () => {
    // O caso que o dono descreveu: ele CLICA no "Próximo" durante a escrita e
    // espera ver tudo. Com quiz pendente o botão nascia desabilitado e o
    // clique não existia; agora o passo é 'revelar' nos DOIS casos.
    assert.equal(lessonActionStep({ ...BASE, typingTheory: true }), 'revelar');
    assert.equal(
      lessonActionStep({ ...BASE, typingTheory: true, nextBlockedByQuiz: true }),
      'revelar',
    );
  });

  it('digitação TERMINADA + quiz da seção sem acerto → o gate volta na hora', () => {
    assert.equal(
      lessonActionStep({ ...BASE, typingTheory: false, nextBlockedByQuiz: true }),
      'quiz-secao',
    );
  });

  it('teoria acabou: quiz pendente vem ANTES do desafio (desbloqueio mais barato)', () => {
    assert.equal(
      lessonActionStep({ ...BASE, theoryDone: true, finishBlock: 'quiz' }),
      'quiz-aula',
    );
    assert.equal(
      lessonActionStep({ ...BASE, theoryDone: true, finishBlock: 'challenges' }),
      'desafio',
    );
    assert.equal(lessonActionStep({ ...BASE, theoryDone: true, finishBlock: null }), 'concluir');
  });

  it('aula já concluída → próxima aula, e nada mais bloqueia', () => {
    assert.equal(
      lessonActionStep({
        theoryDone: true,
        doneMarked: true,
        typingTheory: true,
        nextBlockedByQuiz: true,
        finishBlock: 'challenges',
      }),
      'proxima-aula',
    );
  });

  it('O PARÊNTESE DO DONO: desafio concluído ANTES do fim da teoria LIBERA a conclusão', () => {
    // Contra a `lessonFinishBlock` REAL (src/lib/trackLessonState) — nada de
    // reimplementar a regra dentro do teste.
    const passou = [{ lastVerdict: 'passed' as const }];
    const naoPassou = [{ lastVerdict: null }];

    // Enquanto a teoria corre, o desafio já passado não muda o passo…
    assert.equal(
      lessonActionStep({ ...BASE, finishBlock: lessonFinishBlock(passou, 0) }),
      'proximo',
    );
    // …e quando ela acaba, a conclusão está LIBERADA (nunca 'desafio').
    assert.equal(
      lessonActionStep({ ...BASE, theoryDone: true, finishBlock: lessonFinishBlock(passou, 0) }),
      'concluir',
    );
    // Contraprova: desafio NÃO passado → o passo é o desafio.
    assert.equal(
      lessonActionStep({
        ...BASE,
        theoryDone: true,
        finishBlock: lessonFinishBlock(naoPassou, 0),
      }),
      'desafio',
    );
  });
});

describe('2. nextClickAction — revelar NÃO avança, e travado não avança nunca', () => {
  it('revelar completa a digitação; só o passo "proximo" pede a próxima seção', () => {
    assert.equal(nextClickAction('revelar'), 'revelar');
    assert.equal(nextClickAction('proximo'), 'avancar');
  });

  it('NENHUM outro passo devolve "avancar" — o gate do quiz não tem porta lateral', () => {
    for (const step of ['quiz-secao', 'quiz-aula', 'desafio', 'concluir', 'proxima-aula'] as const) {
      assert.equal(nextClickAction(step), 'nada', `${step} não pode avançar a teoria`);
    }
  });
});

describe('3. lessonActionStatusKey — a frase diz a verdade do momento', () => {
  it('cada passo BLOQUEADO (ou de revelação) tem o que dizer', () => {
    assert.equal(lessonActionStatusKey('revelar', false), 'lesson.revealGateTyping');
    assert.equal(lessonActionStatusKey('quiz-secao', true), 'lesson.quizGateNext');
    // Card ainda não em cena: a frase NÃO pede uma resposta impossível.
    assert.equal(lessonActionStatusKey('quiz-secao', false), 'lesson.quizGateTyping');
    assert.equal(lessonActionStatusKey('quiz-aula', false), 'lesson.quizGateFinish');
    assert.equal(lessonActionStatusKey('desafio', false), 'lesson.challengeGateFinish');
  });

  it('passo livre não inventa aviso', () => {
    assert.equal(lessonActionStatusKey('proximo', false), null);
    assert.equal(lessonActionStatusKey('concluir', false), null);
    assert.equal(lessonActionStatusKey('proxima-aula', false), null);
  });

  it('toda chave citada existe, NÃO VAZIA, nos dois idiomas', () => {
    const chaves = [
      'revealGateTyping',
      'revealTypingTooltip',
      'challengeGateFinish',
      'challengeStepButton',
      'challengeStepButtonAria',
      'quizGateNext',
      'quizGateTyping',
      'quizGateFinish',
    ];
    for (const k of chaves) {
      const pt = (ptBR.lesson as unknown as Record<string, string>)[k];
      const ingles = (en.lesson as unknown as Record<string, string>)[k];
      assert.ok(pt !== undefined && pt !== '', `pt-BR sem lesson.${k}`);
      assert.ok(ingles !== undefined && ingles !== '', `en sem lesson.${k}`);
    }
  });

  it('nada de elogio ritualizado no texto novo (§8.2, d = −0,40 medido)', () => {
    for (const dict of [ptBR.lesson, en.lesson] as unknown as Record<string, string>[]) {
      for (const k of ['revealGateTyping', 'challengeGateFinish']) {
        assert.ok(!/parab|congrat|🎉/i.test(dict[k]), `lesson.${k} vira elogio`);
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 2 — a TELA, renderizada de verdade (tema e i18n reais)
 * ═══════════════════════════════════════════════════════════════════════════ */

const PROXIMO = ptBR.lesson.nextButton;
const CONCLUIR = ptBR.lesson.finishButton;
const DESAFIO = ptBR.lesson.challengeStepButton;

describe('4. a linha de ação renderizada — um lugar, o passo atual', () => {
  it('DIGITANDO: o "Próximo" está VIVO (é ele que revela) e a frase diz isso', () => {
    const html = render({ step: 'revelar' });
    assert.ok(html.includes(PROXIMO), 'o rótulo continua "Próximo →" (o botão não muda de nome)');
    assert.ok(
      !isDisabled(tagOfElementWith(html, PROXIMO)),
      'com a seção sendo escrita o botão PRECISA estar clicável — sem isso o clique do ' +
        'dono não existe e nada é revelado',
    );
    assert.ok(html.includes('role="status"'), 'a linha anuncia o estado');
    assert.ok(html.includes(ptBR.lesson.revealGateTyping), 'e a frase é a da revelação');
  });

  it('QUIZ DA SEÇÃO: o "Próximo" está travado e o motivo está ESCRITO (não só no tooltip)', () => {
    const html = render({ step: 'quiz-secao', quizCardOnScreen: true });
    assert.ok(isDisabled(tagOfElementWith(html, PROXIMO)), 'o gate do quiz continua fechado');
    assert.ok(html.includes(ptBR.lesson.quizGateNext), 'o motivo aparece visível, em role=status');
  });

  it('TURNO EM VOO trava o avanço mesmo no passo de revelar', () => {
    assert.ok(isDisabled(tagOfElementWith(render({ step: 'revelar', busy: true }), PROXIMO)));
    assert.ok(isDisabled(tagOfElementWith(render({ step: 'proximo', busy: true }), PROXIMO)));
  });

  it('DESAFIO: o CTA do desafio aparece EMBAIXO, e o "Concluir aula" fica travado ao lado', () => {
    const html = render({ step: 'desafio', pendingChallengeCount: 1 });
    assert.ok(html.includes(DESAFIO), 'o botão do desafio está na linha de ação');
    assert.ok(!isDisabled(tagOfElementWith(html, DESAFIO)), 'e ele é o CTA VIVO do passo');
    // O "Concluir aula" continua sendo o elemento que o e2e mede desabilitado.
    assert.ok(isDisabled(tagOfElementWith(html, CONCLUIR)), 'a conclusão segue travada');
    assert.ok(
      html.includes(ptBR.lesson.challengeGateFinish),
      'e o motivo do bloqueio é DITO em role="status" — nada de botão morto e mudo',
    );
    // O tooltip que o e2e mede por hover continua no mesmo lugar.
    assert.ok(
      html.includes(`aria-label="${ptBR.lesson.finishBlockedTooltip}"`),
      'o tooltip do "Concluir aula" travado segue sendo o de desafios pendentes',
    );
  });

  it('o CTA do desafio tem nome acessível PRÓPRIO que CONTÉM o rótulo visível (SC 2.5.3)', () => {
    const html = render({ step: 'desafio', pendingChallengeCount: 2 });
    const nome = (ptBR.lesson.challengeStepButtonAria as string).replace('{{pending}}', '2');
    assert.ok(html.includes(`aria-label="${nome}"`), `nome acessível ausente: ${nome}`);
    assert.ok(nome.includes(DESAFIO), 'o nome acessível começa pelo rótulo que se lê na tela');
  });

  it('os alvos de toque do passo têm 44px', () => {
    for (const [step, marker] of [
      ['revelar', PROXIMO],
      ['desafio', DESAFIO],
      ['concluir', CONCLUIR],
    ] as const) {
      const html = render({ step, pendingChallengeCount: 1 });
      const css = cssOfClass(html, classOfElementWith(html, marker));
      assert.match(css, /min-height:\s*44px/, `${step}: alvo de toque`);
    }
  });

  it('CONCLUIR: sem bloqueio, o botão é o CTA vivo e a linha não inventa aviso', () => {
    const html = render({ step: 'concluir' });
    assert.ok(!isDisabled(tagOfElementWith(html, CONCLUIR)));
    assert.ok(!html.includes('role="status"'), 'passo livre não anuncia bloqueio nenhum');
  });

  it('QUIZ NA CONCLUSÃO: a contagem entra na frase', () => {
    const html = render({ step: 'quiz-aula', pendingQuizCount: 3 });
    assert.ok(isDisabled(tagOfElementWith(html, CONCLUIR)));
    assert.ok(
      html.includes((ptBR.lesson.quizGateFinish as string).replace('{{n}}', '3')),
      'a frase da conclusão continua interpolando quantos faltam',
    );
  });

  it('CONCLUÍDA: próxima aula + gerar novo desafio, e nenhum "Próximo"/"Concluir"', () => {
    const html = render({ step: 'proxima-aula' });
    assert.ok(html.includes(ptBR.lesson.nextLessonButton));
    assert.ok(html.includes(ptBR.lesson.generateNewChallenge));
    assert.ok(!html.includes(PROXIMO), 'a teoria acabou: nada de "Próximo"');
    assert.ok(!html.includes(CONCLUIR), 'nada de "Concluir aula" depois de concluída');
  });

  it('nenhuma casca animada vira parada de Tab fantasma', () => {
    // O <button> do MUI nasce com tabindex="0" — é ELE que deve receber o Tab.
    // O que não pode existir é um <span> tabulável: o `whileTap` do framer marca
    // tabIndex=0 na casca animada, e o teclado passa a parar num span mudo antes
    // de cada botão. Por isso a varredura é só nos <span>.
    for (const step of ['revelar', 'quiz-secao', 'desafio', 'concluir', 'proxima-aula'] as const) {
      const html = render({ step, pendingChallengeCount: 1 });
      assert.ok(
        !/<span[^>]*tabindex="0"/i.test(html),
        `${step}: casca animada tabulável — falta tabIndex={-1} no <motion.span>`,
      );
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 3 — a FIAÇÃO na view (o que só um clique provaria)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('5. a view liga o passo à ação — e o gate não ganhou porta lateral', () => {
  it('a linha de ação da aula é o <LessonActionRow>, dirigido pelo passo puro', () => {
    assert.match(VIEW, /<LessonActionRow/, 'a view usa ESTE componente (não uma cópia)');
    assert.match(VIEW, /const actionStep = lessonActionStep\(\{/, 'o passo vem da função pura');
    assert.match(VIEW, /step=\{actionStep\}/, 'e é ELE que a linha recebe');
  });

  it('o clique do "Próximo" passa por nextClickAction — revelar chama requestSkipTyping', () => {
    const at = VIEW.indexOf('const handleNextClick');
    assert.ok(at > 0, 'o handler existe');
    const corpo = VIEW.slice(at, VIEW.indexOf('}, [', at));
    assert.match(corpo, /nextClickAction\(actionStep\)/, 'a decisão é a da função pura');
    assert.match(corpo, /requestSkipTyping\(\)/, "'revelar' completa a digitação");
    assert.match(corpo, /sendNext\(\)/, "'avancar' pede a próxima seção");
    assert.ok(
      corpo.indexOf('requestSkipTyping()') < corpo.indexOf('sendNext()'),
      'revelar vem ANTES — nunca se avança para depois revelar',
    );
    assert.match(VIEW, /onNext=\{handleNextClick\}/, 'o botão chama o handler, não o sendNext cru');
  });

  it('CERCA DE REGRESSÃO: o avanço não volta a ser travado SÓ por `nextBlockedByQuiz`', () => {
    // A expressão do código antigo, literal: `disabled={busy || nextBlockedByQuiz}`.
    // Era ela que, durante a digitação de uma seção COM quiz, deixava o botão
    // morto — e o clique do dono ("mostra tudo") nunca acontecia. O gate não
    // sumiu: ele migrou para o passo ('quiz-secao'), que só existe DEPOIS que a
    // bolha termina de ser escrita.
    assert.ok(
      !/disabled=\{busy \|\| nextBlockedByQuiz\}/.test(VIEW),
      'o "Próximo" voltou a ser desabilitado pelo gate cru — com a seção sendo escrita ' +
        'isso mata o clique que REVELA a digitação',
    );
  });

  it('só a TEORIA sendo escrita vira "revelar" — a explicação do ciclo não abre o botão', () => {
    // O passo 'revelar' deixa o "Próximo" clicável. Se ele valesse para
    // QUALQUER bolha digitando, a explicação do ciclo de remediação
    // ('quiz-explanation', que também digita na velocidade de leitura) abriria
    // o botão com o quiz na tela esperando resposta — e o e2e do ciclo
    // (tests/e2e/e2e-quiz.spec.ts) mede exatamente esse "Próximo" desabilitado.
    const at = VIEW.indexOf('const typingTheory');
    assert.ok(at > 0, 'a view calcula a digitação DE TEORIA');
    const corpo = VIEW.slice(at, VIEW.indexOf('  );', at));
    assert.match(corpo, /isTheoryPresentationBubble\(chat\.history, i\)/, 'pelo critério da lib');
    assert.match(VIEW, /typingTheory,\n/, 'e é ELE que alimenta o passo');
  });

  it('sendNext mantém o guard do quiz (a corrida do fim da digitação)', () => {
    const at = VIEW.indexOf('const sendNext = useCallback');
    const corpo = VIEW.slice(at, at + 600);
    assert.match(
      corpo,
      /if \(nextBlockedByQuiz\) return;/,
      'o avanço não sai daqui com o quiz da seção pendente — nem por atalho, nem por corrida',
    );
  });

  it('o botão de desafio do CABEÇALHO continua com nome e badge (migrou para o CollapsibleLessonHeader)', () => {
    // ONDA2-layout: o botão do cabeçalho saiu do JSX da view e vive no
    // componente do cabeçalho colapsável. O CONTRATO do guard é o MESMO de
    // antes (o dono pediu os DOIS botões de desafio): o do cabeçalho segue
    // com o nome acessível interpolado e o badge de pendentes, e a view
    // segue ligando o popover a ele.
    assert.match(VIEW, /<CollapsibleLessonHeader/, 'o cabeçalho é o componente novo');
    assert.match(
      VIEW,
      /challengesExpanded=\{challengesOpen && challengesFrom === 'cabecalho'\}/,
      'o aria-expanded do botão do cabeçalho continua dirigido pelo popover',
    );
    assert.match(HEADER, /lesson\.challengesButtonAria/, 'o botão do cabeçalho segue com seu nome');
    assert.match(HEADER, /<Badge badgeContent=\{pendingChallengeCount\}/, 'e com o badge de pendentes');
  });

  it('o CTA de baixo reusa o MESMO destino: um desafio vai direto, vários abrem o MESMO popover', () => {
    const at = VIEW.indexOf('const handleChallengeStep');
    assert.ok(at > 0, 'o handler existe');
    const corpo = VIEW.slice(at, VIEW.indexOf('}, [', at));
    assert.match(corpo, /openChallenge\(pending\[0\]\)/, 'um desafio só → vai direto para ele');
    assert.match(corpo, /setChallengesAnchorEl\(anchor\)/, 'vários → o MESMO popover, ancorado aqui');
    assert.ok(
      !/nav\.(selectTrackChallenge|navigateToChallenge)/.test(corpo),
      'nenhum segundo fluxo de navegação foi inventado — o caminho é o openChallenge que já existia',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA16-PIN — O PIN DE DESAFIOS SÓ CONTA QUANDO O DESAFIO LIBERA
 *
 * O dono: "fica um pin de item em Desafios mas ele só libera no fim da aula
 * então não deveria ter esse pin". O badge contava `lastVerdict !== 'passed'`
 * desde a primeira seção; o desafio só LIBERA no fim (teoria concluída E todo
 * quiz visível dominado — o MESMO gate que produz o passo 'desafio'). A regra
 * é a função PURA `challengeBadgeCount` (exportada da LessonView, padrão de
 * `lessonActionStep`), e o GATING de abertura não muda.
 * ═════════════════════════════════════════════════════════════════════════ */
describe('ONDA16 — o pin de Desafios só conta com o desafio LIBERADO', () => {
  const desafios = [
    { lastVerdict: null },
    { lastVerdict: 'failed' },
    { lastVerdict: 'passed' },
  ] as const;

  it('DURANTE a teoria: 0 — mesmo com desafios nunca tentados (o pin prematuro morreu)', () => {
    assert.equal(
      challengeBadgeCount({ theoryDone: false, pendingQuizCount: 0, challenges: [...desafios] }),
      0,
      'o pin acendia na abertura da aula; agora vale 0 até a teoria acabar',
    );
    // Nem mesmo um desafio JÁ PASSADO muda isso — não há pin antes da hora.
    assert.equal(
      challengeBadgeCount({
        theoryDone: false,
        pendingQuizCount: 0,
        challenges: [{ lastVerdict: 'passed' }],
      }),
      0,
    );
  });

  it('teoria acabou, mas há quiz sem acerto: AINDA 0 (o gate do quiz vem primeiro)', () => {
    assert.equal(
      challengeBadgeCount({ theoryDone: true, pendingQuizCount: 2, challenges: [...desafios] }),
      0,
    );
  });

  it('liberado (teoria concluída + quiz 0): conta MESMO critério de sempre', () => {
    // null + failed = 2 pendentes; o 'passed' não conta.
    assert.equal(
      challengeBadgeCount({ theoryDone: true, pendingQuizCount: 0, challenges: [...desafios] }),
      2,
    );
  });

  it('tudo passado ou sem desafios: 0 (badge oculto, showZero=false do MUI)', () => {
    assert.equal(
      challengeBadgeCount({
        theoryDone: true,
        pendingQuizCount: 0,
        challenges: [{ lastVerdict: 'passed' }],
      }),
      0,
    );
    assert.equal(challengeBadgeCount({ theoryDone: true, pendingQuizCount: 0, challenges: [] }), 0);
  });

  it('a régua do badge concorda com o PASSO da linha de ação (uma decisão, dois lugares)', () => {
    // O badge é 0 exatamente enquanto a linha de ação NÃO está no passo
    // 'desafio'/'concluir' por causa dos desafios — amarra as duas rotas para
    // que não voltem a divergir (a lição da onda 14).
    const pendentes = [{ lastVerdict: null }] as const;
    // Teoria em curso → passo 'proximo' e badge 0.
    assert.equal(lessonActionStep(BASE), 'proximo');
    assert.equal(challengeBadgeCount({ theoryDone: false, pendingQuizCount: 0, challenges: [...pendentes] }), 0);
    // Teoria acabou, quiz pendente → 'quiz-aula' e badge 0.
    assert.equal(
      lessonActionStep({ ...BASE, theoryDone: true, finishBlock: 'quiz' }),
      'quiz-aula',
    );
    assert.equal(challengeBadgeCount({ theoryDone: true, pendingQuizCount: 1, challenges: [...pendentes] }), 0);
    // Teoria acabou, quiz 0, desafio pendente → 'desafio' e badge 1.
    assert.equal(
      lessonActionStep({ ...BASE, theoryDone: true, finishBlock: 'challenges' }),
      'desafio',
    );
    assert.equal(challengeBadgeCount({ theoryDone: true, pendingQuizCount: 0, challenges: [...pendentes] }), 1);
  });

  it('GUARDA DE FONTE: o badge da view sai da função pura, não de um filtro inline', () => {
    assert.match(VIEW, /const pendingChallengeCount = challengeBadgeCount\(/, 'a view usa a função');
    assert.ok(
      !/pendingChallengeCount = lesson\.challenges\.filter/.test(VIEW),
      'o filtro cru voltaria a acender o pin antes da hora',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA 15 — O DESAFIO TEM DUAS PORTAS, E AS DUAS PRECISAM DA MESMA CHAVE
 *
 * A regra é do dono e é anterior a esta onda: *"só vamos para o desafio depois
 * que o aluno provar que entendeu"*. A onda 14 pôs o desafio na linha de ação
 * de baixo e o gateou certo — mas a revisão adversarial mediu que a OUTRA rota,
 * o botão "Desafios" do cabeçalho (que já existia antes), abria o desafio sem
 * guard nenhum. Duas portas para o mesmo lugar, uma trancada e outra
 * escancarada: a regra valia só para quem entrasse pela primeira.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('a régua do desafio é UMA só', () => {
  it('quiz pendente TRANCA o desafio; qualquer outro estado não', () => {
    assert.strictEqual(challengeOpenBlockedByQuiz('quiz'), true, 'quiz sem acerto tranca');
    assert.strictEqual(
      challengeOpenBlockedByQuiz('challenges'),
      false,
      'faltar o desafio não pode trancar o próprio desafio',
    );
    assert.strictEqual(challengeOpenBlockedByQuiz(null), false, 'sem bloqueio, abre');
  });

  it('é a MESMA régua do passo da linha de ação — não uma segunda opinião', () => {
    // O ponto do teste: amarrar as duas rotas UMA À OUTRA. Se alguém mexer só
    // num dos lados, elas divergem de novo e ninguém percebe — foi exatamente
    // assim que a rota do cabeçalho ficou sem guard.
    const base = { theoryDone: true, doneMarked: false, typingTheory: false, nextBlockedByQuiz: false };
    const comQuiz = lessonActionStep({ ...base, finishBlock: 'quiz' });
    const comDesafio = lessonActionStep({ ...base, finishBlock: 'challenges' });
    assert.strictEqual(comQuiz, 'quiz-aula', 'com quiz pendente a linha de ação cobra o quiz');
    assert.strictEqual(comDesafio, 'desafio', 'sem quiz pendente ela oferece o desafio');
    // A régua do cabeçalho tem de concordar com a da linha de ação, estado a
    // estado: trancada exatamente quando a linha de ação NÃO oferece o desafio.
    for (const bloqueio of ['quiz', 'challenges', null] as const) {
      const passo = lessonActionStep({ ...base, finishBlock: bloqueio });
      const linhaOferece = passo === 'desafio' || passo === 'concluir';
      assert.strictEqual(
        challengeOpenBlockedByQuiz(bloqueio),
        !linhaOferece,
        `divergência em finishBlock=${String(bloqueio)}: passo="${passo}" mas a régua do cabeçalho diz ${String(challengeOpenBlockedByQuiz(bloqueio))}`,
      );
    }
  });
});
