/**
 * tests/quizOverlayWiring.test.ts — GUARDA DE FONTE da ligação do overlay do
 * quiz com a tela.
 *
 * POR QUE TEXTUAL. `App.tsx`, `QuizOverlayHost` e `LessonView` são componentes
 * React e este repositório NÃO usa jsdom — não há como montá-los num
 * `node:test` para observar o que renderizam. É a MESMA razão (e a MESMA
 * técnica) dos precedentes `tests/lessonQuizVisual.test.ts` ("guarda de FONTE:
 * o JSX do card não vê answerIndex") e `tests/lessonQuizKeyCoherence.test.ts`:
 * lê-se o arquivo como TEXTO, removem-se os comentários e reprova-se o CÓDIGO
 * que roda. A lógica em si é exercitada de verdade em
 * `tests/quizOverlayCycle.test.ts`.
 *
 * O QUE ESTA SUÍTE TRAVA, e o defeito que cada item impede de voltar:
 *
 *   1. o overlay é montado NO SHELL (App.tsx). Montado dentro da LessonView
 *      ele morreria a cada troca de aba — que é exatamente o que "minimizar
 *      sem perder estado" não pode fazer;
 *   2. o host lê a fase por `useSyncExternalStore(subscribeQuizOverlay,
 *      peekQuizOverlay)` — nunca por `useState` duplicado;
 *   3. o `AnimatePresence` envolve a CONDICIONAL (o componente nunca retorna
 *      `null`): com `return null` o `exit` não roda e minimizar vira sumiço
 *      seco — o mesmo conserto já documentado no ChallengeGenerateModal;
 *   4. as saídas (Esc, backdrop, botão) MINIMIZAM; nenhuma delas FECHA — fechar
 *      é, por contrato do store, "a afirmação foi dominada", e um Esc que
 *      fechasse seria um gate dispensável com uma tecla;
 *   5. o overlay é o IRMÃO do ChallengeGenerateModal, não um widget com paleta
 *      própria: backdrop, blur e zIndex são byte a byte os mesmos, e nenhum
 *      hex novo entra em `components/quiz/**`;
 *   6. `alpha()` do MUI (que LANÇA com CSS var — MUI #9) e o ternário sobre
 *      `palette.mode` (que sob `cssVariables` resolve UMA vez e nunca mais
 *      reage ao toggle) continuam fora;
 *   7. a LessonView liga os canais do ciclo e registra a tentativa UMA vez
 *      (o `quizAttempt` já devolve a maestria recalculada — nada de um segundo
 *      invoke em `quizHistory` ATRÁS DELE; desde a ONDA3-PERSISTENCIA o
 *      `quizHistory` existe na view, no CARREGAMENTO da aula, e é o que faz a
 *      maestria sobreviver ao fechamento do app — ver
 *      tests/quizHistoryHydration.test.ts);
 *   8. `previous={prev}` chegou ao ChatBubble — sem ele o agrupamento de
 *      mensagens que a onda anterior entregou fica inerte;
 *   9. as LARGURAS batem: o painel de mensagens e a linha de entrada usam a
 *      MESMA coluna, e o painel deixou de ser `action.hover` (o único overlay
 *      alfa fora da rampa `surface.level0..4`);
 *  10. toda chave i18n que os três arquivos citam EXISTE em pt-BR e em en.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (rel: string): string => readFileSync(resolve(HERE, '..', rel), 'utf8');

/** Fonte sem comentários (só o código que realmente roda) — a técnica dos
 *  precedentes lessonQuizVisual / lessonQuizKeyCoherence. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const APP_SRC = src('src/App.tsx');
const HOST_SRC = src('src/components/quiz/QuizOverlayHost.tsx');
const CHAT_CARD_SRC = src('src/components/quiz/QuizChatCard.tsx');
const CONTENT_SRC = src('src/components/quiz/quizOverlayContent.ts');
const BRIDGE_SRC = src('src/components/quiz/quizOverlayBridge.ts');
const VIEW_SRC = src('src/views/LessonView/LessonView.tsx');
const SIBLING_SRC = src('src/components/challenge/ChallengeGenerateModal.tsx');

const APP = codeOf(APP_SRC);
const HOST = codeOf(HOST_SRC);
const CHAT_CARD = codeOf(CHAT_CARD_SRC);
const VIEW = codeOf(VIEW_SRC);

describe('1. o overlay do quiz é montado NO SHELL, como o modal irmão', () => {
  it('App.tsx importa o host de components/quiz', () => {
    assert.match(
      APP_SRC,
      /import\s*\{\s*QuizOverlayHost\s*\}\s*from\s*'\.\/components\/quiz\/QuizOverlayHost'/,
    );
  });

  it('App.tsx RENDERIZA <QuizOverlayHost /> ao lado do ChallengeGenerateModal', () => {
    assert.ok(APP.includes('<QuizOverlayHost />'), 'o host precisa estar montado no shell');
    assert.ok(APP.includes('<ChallengeGenerateModal />'), 'o irmão continua montado');
  });

  it('nenhuma view monta o host por conta própria (ele é único e global)', () => {
    assert.ok(
      !VIEW.includes('<QuizOverlayHost'),
      'montado também na LessonView, o overlay morreria a cada troca de aba',
    );
  });
});

describe('2 e 3. o host lê o store e anima a saída', () => {
  it('a fase vem de useSyncExternalStore(subscribeQuizOverlay, peekQuizOverlay)', () => {
    assert.ok(
      HOST.includes('useSyncExternalStore(subscribeQuizOverlay, peekQuizOverlay, peekQuizOverlay)'),
      'a fase do overlay é do store module-level, nunca de useState local',
    );
  });

  it('o conteúdo vem do registro publicado pela view', () => {
    assert.ok(
      HOST.includes('useSyncExternalStore('),
      'o conteúdo também vem por subscribe/peek, nunca por prop de view',
    );
    assert.ok(HOST.includes('subscribeQuizOverlayContent,'));
    assert.ok(HOST.includes('peekQuizOverlayContent,'));
  });

  it('o host NUNCA retorna null: o AnimatePresence envolve a condicional', () => {
    assert.ok(HOST.includes('<AnimatePresence>'), 'o retorno é sempre um AnimatePresence');
    assert.ok(
      !/return\s+null\s*;/.test(HOST),
      'com return null o exit do "minimizar" não animaria (o conserto BAIXO-1 do irmão)',
    );
    // A condicional tem de estar DENTRO do AnimatePresence.
    const inicio = HOST.indexOf('<AnimatePresence>');
    const cond = HOST.indexOf('? (', inicio);
    assert.ok(inicio >= 0 && cond > inicio, 'a condicional vive dentro do AnimatePresence');
  });

  it('prefers-reduced-motion desliga o overshoot (§8.1)', () => {
    assert.ok(HOST.includes('useReducedMotion()'), 'o host precisa consultar a preferência');
    assert.ok(HOST.includes('REDUCED_VARIANTS'), 'com movimento reduzido a entrada vira fade puro');
  });

  it('o diálogo é anunciado como diálogo modal e recebe foco', () => {
    assert.ok(HOST.includes('role="dialog"'));
    assert.ok(HOST.includes('aria-modal="true"'));
    assert.ok(HOST.includes('aria-label={t(\'translation:lesson.quizOverlayAria\')}'));
    assert.ok(HOST.includes('cardRef.current?.focus()'), 'o teclado entra no diálogo ao abrir');
  });
});

describe('4. as saídas MINIMIZAM — nenhuma delas fecha o ciclo', () => {
  it('Esc, backdrop e botão chamam o mesmo minimize', () => {
    assert.match(HOST, /e\.key === 'Escape'\s*\)\s*minimize\(\)/, 'Esc minimiza');
    assert.ok(HOST.includes('onClick={minimize}'), 'backdrop e botão do cabeçalho minimizam');
    assert.ok(HOST.includes('onMinimize()'), 'o minimize delega ao callback publicado pela view');
  });

  it('o host NÃO importa nem chama closeQuizOverlay', () => {
    assert.ok(
      !HOST.includes('closeQuizOverlay'),
      'fechar é "a afirmação foi dominada" — decisão do ciclo, nunca de uma tecla',
    );
  });

  it('quem fecha é a view, e só por MAESTRIA (ou ao trocar de aula)', () => {
    assert.ok(VIEW.includes('closeQuizOverlay'), 'a view é a dona do fechamento');
    assert.ok(
      VIEW.includes('isQuizMastered(chat, openKey)'),
      'sem aula carregada ou sem maestria, fechar apagaria a fase que o store preserva',
    );
  });
});

describe('5 e 6. o overlay é o irmão do ChallengeGenerateModal (nada inventado)', () => {
  it('backdrop, blur e zIndex são byte a byte os do irmão', () => {
    for (const valor of [
      "background: 'rgba(8, 10, 20, 0.66)'",
      "backdropFilter: 'blur(6px)'",
      "WebkitBackdropFilter: 'blur(6px)'",
      'zIndex: 1300',
      "position: 'fixed'",
      'inset: 0,',
    ]) {
      assert.ok(SIBLING_SRC.includes(valor), `o irmão precisa continuar com ${valor}`);
      assert.ok(HOST_SRC.includes(valor), `o overlay do quiz precisa usar ${valor}`);
    }
  });

  it('a borda e a sombra usam color-mix sobre a variável do tema, como o irmão', () => {
    assert.ok(HOST.includes('color-mix(in srgb, ${secondaryMain} 45%, transparent)'));
    assert.ok(HOST.includes('color-mix(in srgb, ${secondaryMain} 35%, transparent)'));
  });

  it('nenhum hex novo em components/quiz/**', () => {
    for (const [nome, texto] of [
      ['QuizOverlayHost', HOST],
      ['QuizChatCard', CHAT_CARD],
      ['quizOverlayContent', codeOf(CONTENT_SRC)],
      ['quizOverlayBridge', codeOf(BRIDGE_SRC)],
    ] as const) {
      const achados = texto.match(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g) ?? [];
      assert.deepEqual(achados, [], `${nome} inventou hex — o contrato é designTokens.ts`);
    }
  });

  it('alpha() do MUI e o ternário sobre palette.mode continuam fora', () => {
    for (const [nome, texto] of [
      ['QuizOverlayHost', HOST],
      ['QuizChatCard', CHAT_CARD],
    ] as const) {
      assert.ok(!/\balpha\(/.test(texto), `${nome} usa alpha() — ele LANÇA com CSS var (MUI #9)`);
      assert.ok(
        !/palette\.mode\s*===/.test(texto),
        `${nome} ramifica por palette.mode — sob cssVariables o ternário trava no galho errado`,
      );
    }
  });
});

describe('7. a LessonView liga os canais do ciclo (e só uma vez)', () => {
  it('os três canais do ciclo são chamados pela view', () => {
    for (const canal of ['track.quizAttempt(', 'track.quizExplain(', 'track.quizRemedial(']) {
      assert.ok(VIEW.includes(canal), `a view precisa chamar ${canal}`);
    }
  });

  it('quizAttempt é o ÚNICO invoke de registro — nada de quizHistory atrás dele', () => {
    // ONDA3-PERSISTENCIA: `track.quizHistory` DEIXOU de ser proibido na view.
    // Ele é o canal que faz a maestria sobreviver ao FECHAMENTO do app (o
    // cache de sessão só a fazia sobreviver à troca de aba), e a view passou a
    // lê-lo no CARREGAMENTO da aula — a guarda de que ele está lá, e lá só,
    // mora em tests/quizHistoryHydration.test.ts. O que esta asserção sempre
    // quis dizer continua valendo, e agora ela o diz com precisão: nada de uma
    // segunda ida ao banco ATRÁS da resposta, porque `quizAttempt` já devolve
    // a maestria recalculada. A fronteira é textual e disjunta — da declaração
    // de `handleQuizAnswer` para baixo, `quizHistory` não pode aparecer.
    const corte = VIEW.indexOf('const handleQuizAnswer');
    assert.ok(corte > 0, 'handleQuizAnswer precisa existir na view');
    assert.ok(
      !VIEW.slice(corte).includes('track.quizHistory'),
      'o quizAttempt já devolve a maestria recalculada; um segundo invoke atrás dele seria desperdício',
    );
    const ocorrencias = VIEW.split('track.quizAttempt(').length - 1;
    assert.equal(ocorrencias, 1, 'a tentativa é registrada num ponto só');
  });

  it('a explicação entra no histórico pela máquina pura, e o quiz novo é injetado por ela', () => {
    assert.ok(VIEW.includes('registerQuizExplanation('), 'a explicação vira bolha por registerQuizExplanation');
    assert.ok(VIEW.includes('injectRemediationQuiz('), 'o quiz novo entra por injectRemediationQuiz');
  });

  it('o fail-closed é tratado: {ok:false} vira aviso, nunca conteúdo inventado', () => {
    assert.ok(VIEW.includes("kind: 'explicacao-indisponivel'"));
    assert.ok(VIEW.includes("kind: 'quiz-indisponivel'"));
    assert.ok(VIEW.includes("kind: 'registro-nao-gravado'"));
    assert.ok(
      VIEW.includes("res.ok === true && res.explanation.trim() !== ''"),
      'uma explicação vazia é tão inútil quanto nenhuma — ela não pode virar bolha',
    );
  });

  it('a fase acompanha o passo pelo atalho declarado do store', () => {
    assert.ok(VIEW.includes('applyQuizOverlayStep('), 'a view não reimplementa o switch de fase');
    assert.ok(VIEW.includes('minimizeQuizOverlay('), 'responder MINIMIZA (o pedido do dono)');
  });

  it('a view não recalcula chave de quiz (a guarda da onda anterior segue de pé)', () => {
    assert.ok(!/sectionId\s*(\?\?|\|\|)/.test(VIEW), 'a chave é de quizKeyFor, nunca de sectionId');
    assert.ok(!VIEW.includes('::'), 'a chave composta nunca é montada na view');
  });
});

describe('8 e 9. o chat: agrupamento ligado e larguras alinhadas', () => {
  it('previous={prev} chegou ao ChatBubble', () => {
    assert.ok(
      VIEW.includes('previous={prev}'),
      'sem o prop, groupsWithPrevious devolve false sempre e o agrupamento fica inerte',
    );
  });

  it('a coluna de leitura tem UM número, com nome', () => {
    assert.match(VIEW_SRC, /export const CHAT_COLUMN_MAX_PX = 1000;/);
    assert.ok(VIEW.includes('maxWidth: CHAT_COLUMN_MAX_PX'), 'o painel de mensagens usa a constante');
  });

  it('a linha de ENTRADA usa a mesma coluna do painel de mensagens', () => {
    assert.ok(
      VIEW.includes('<Stack direction="row" spacing={1} sx={CHAT_COLUMN_SX}>'),
      'o eixo de escrita precisa bater com o de leitura',
    );
  });

  it('o painel do chat saiu do overlay alfa e entrou na rampa de superfícies', () => {
    // `action.hover` é um overlay ALFA: legítimo como ESTADO de interação
    // (`'&:hover': { bgcolor: 'action.hover' }` no item da lista de desafios
    // continua valendo), proibido como SUPERFÍCIE EM REPOUSO — era assim que
    // o painel de mensagens ficava fora da rampa `surface.level0..4`.
    const repouso = VIEW.split('\n').filter((l) => /^\s*bgcolor: 'action\.hover',\s*$/.test(l));
    assert.deepEqual(
      repouso,
      [],
      'action.hover como superfície de repouso é a única fora de surface.level0..4',
    );
    assert.ok(
      VIEW.includes('bgcolor: theme.vars.palette.surface.level2'),
      'o painel afundado é o nível 2 da rampa',
    );
  });
});

describe('10. as chaves i18n citadas existem em pt-BR e em en', () => {
  // O bloco `lesson` do JSON tem sub-objetos (`phase`), então o índice é
  // `unknown` e a leitura passa por um acessor que só devolve string.
  const ptLesson = (ptBR as unknown as { lesson: Record<string, unknown> }).lesson;
  const enLesson = (en as unknown as { lesson: Record<string, unknown> }).lesson;
  const texto = (dict: Record<string, unknown>, key: string): string => {
    const v = dict[key];
    return typeof v === 'string' ? v : '';
  };

  /** Toda chave `lesson.<algo>` citada nos arquivos desta onda. */
  const citadas = new Set<string>();
  for (const texto of [HOST_SRC, CHAT_CARD_SRC, VIEW_SRC]) {
    for (const m of texto.matchAll(/'(?:translation:)?lesson\.([A-Za-z0-9_]+)'/g)) {
      citadas.add(m[1]);
    }
  }

  it('a varredura encontrou as chaves novas do overlay', () => {
    for (const k of [
      'quizOverlayTitle',
      'quizOverlayAria',
      'quizOverlayMinimize',
      'quizOverlayHint',
      'quizChatAnswer',
      'quizChatRetry',
      'quizExplanationTitle',
      'quizExplanationChosen',
      'quizExplainUnavailable',
      'quizRemedialUnavailable',
      'quizAttemptNotSaved',
    ]) {
      assert.ok(citadas.has(k), `a chave ${k} deveria ser citada pelo código da onda`);
    }
  });

  it('toda chave citada existe, NÃO VAZIA, nos dois idiomas', () => {
    for (const k of citadas) {
      assert.notEqual(texto(ptLesson, k), '', `pt-BR sem lesson.${k}`);
      assert.notEqual(texto(enLesson, k), '', `en sem lesson.${k}`);
    }
  });

  it('o inglês dos textos de gate deixou de soar traduzido', () => {
    // A redação anterior era "An off-target option opens, in the chat, an
    // explanation of…" — ordem e artigos de tradução literal do português.
    for (const k of ['quizGateNext', 'quizGateFinish']) {
      assert.ok(
        !texto(enLesson, k).includes('An off-target option opens, in the chat, an explanation of'),
        `en.lesson.${k} continua com a redação traduzida ao pé da letra`,
      );
    }
  });

  it('nem o acerto vira elogio ritualizado, nem o erro vira repreensão (§8.2 e §8 item 3)', () => {
    for (const lesson of [ptLesson, enLesson]) {
      const certo = texto(lesson, 'quizCorrect');
      const errado = texto(lesson, 'quizWrong');
      assert.notEqual(certo, '', 'a mensagem de acerto existe');
      assert.notEqual(errado, '', 'a mensagem de erro existe');
      assert.ok(!/parab/i.test(certo), 'nada de "Parabéns!" (d = −0,40 medido)');
      assert.ok(!/congrat/i.test(certo), 'nada de "Congratulations!"');
      assert.ok(!/🎉/.test(certo), 'o acerto é informacional, não confete de texto');
      // O erro descreve ONDE a alternativa se separa do conteúdo — nunca julga
      // o aluno nem manda "tentar de novo".
      assert.ok(!/tente de novo|try again/i.test(errado));
    }
  });
});
