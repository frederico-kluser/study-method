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
 *   5. o overlay é o IRMÃO do ChallengeGenerateModal na GEOMETRIA (blur, zIndex,
 *      posição byte a byte), mas NÃO na cor: o scrim é o token neutro do tema e
 *      a superfície do cartão segue a regra do `MuiDialog` (claro 1 · escuro 4,
 *      `applyStyles('dark')` por último). Nenhuma cor CRUA entra em
 *      `components/quiz/**` — nem hex, nem `rgb()`/`rgba()`, nem `hsl()` —, e
 *      nenhum acento `study` volta a pintar coisa nenhuma ali;
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
 *      MESMA coluna, e o painel sai da rampa `surface.level0..4` (nunca do
 *      overlay alfa `action.hover`) — no nível 0, desde que a caixa da conversa
 *      morreu;
 *  10. toda chave i18n que os três arquivos citam EXISTE em pt-BR e em en;
 *  11. o modal só abre por GESTO;
 *  12. o TECLADO: a devolução de foco tem uma âncora que sobrevive ao desmonte
 *      do CTA, e nenhum wrapper com gesto de toque deixa parada de Tab
 *      fantasma.
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
/** O TEMA: é nele que a regra do papel do modal e o token do scrim moram
 *  agora, e é contra ele que se prova que o host não tem uma cópia. */
const THEME_SRC = codeOf(src('src/theme.ts'));

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
    // O RECORTE É O COMPONENTE, não o arquivo. Desde a ONDA12 o módulo também
    // exporta a função pura `focusReturnTarget`, e ela devolve `null` quando
    // não há a quem devolver o foco — o que é a resposta CERTA dela. O que não
    // pode voltar é o `return null` do COMPONENTE, que mataria o `exit`.
    const componente = HOST.slice(HOST.indexOf('export function QuizOverlayHost'));
    assert.ok(componente.length > 0, 'o componente continua exportado');
    assert.ok(
      !/return\s+null\s*;/.test(componente),
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
  it('blur, zIndex e geometria continuam byte a byte os do irmão', () => {
    for (const valor of [
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

  /* ─── ONDA12: O SCRIM É O TOKEN DO TEMA, E OS QUATRO SÃO UM SÓ ──────────
   * A lista acima INCLUÍA `background: 'rgba(8, 10, 20, 0.66)'`, e era ela
   * que mantinha uma cor crua no ar com carimbo de teste: "é igual ao irmão"
   * é uma boa razão para copiar geometria e uma péssima para copiar COR — o
   * contrato de designTokens.ts diz que superfície e composição saem da rampa
   * e de `color-mix`, e aquele valor ainda era AZULADO (B 20 contra R 8) numa
   * rampa que é cinza neutro desde a onda 11.
   *
   * O primeiro conserto trocou o literal por um `color-mix` de 62% escrito à
   * mão, igual ao que o `MuiBackdrop` tinha então. Na MESMA onda o tema
   * publicou `palette.scrim` (preto puro a 55%) e passou o `MuiBackdrop` a
   * consumi-lo — e a cópia de 62% virou o QUARTO scrim divergente da base
   * (Dialog, Backdrop, quiz, desafio). Copiar o VALOR e herdar o valor não são
   * a mesma coisa; por isso a asserção não pergunta mais "qual porcentagem?",
   * e sim "leu o token?". Enquanto ela estiver de pé, mudar a opacidade do
   * scrim é mudar UMA linha em designTokens.ts.
   * ──────────────────────────────────────────────────────────────────────── */
  it('o scrim é o TOKEN do tema (palette.scrim), não um valor copiado', () => {
    assert.ok(
      HOST.includes('theme.vars.palette.scrim'),
      'o scrim é lido do tema — o mesmo token que o MuiBackdrop aplica',
    );
    assert.ok(
      !HOST.includes('rgba(8, 10, 20, 0.66)'),
      'a cor crua azulada saiu do host',
    );
    // A guarda que impede a REGRESSÃO por cópia: um color-mix de preto escrito
    // aqui é, por construção, um segundo valor que ninguém reconcilia. A
    // SOMBRA do cartão continua sendo um color-mix de preto legítimo (45%), e
    // é por isso que a proibição é do padrão `<n>%` do scrim, não de black.
    assert.ok(
      !/color-mix\(in srgb, \$\{black\} (?:5[0-9]|6[0-9])%/.test(HOST),
      'nenhuma opacidade de scrim escrita à mão: o número mora no token',
    );
  });

  /* O IRMÃO fecha o ciclo: o ChallengeGenerateModal era a FONTE da cópia (o
   * quiz herdou dele o `rgba(8, 10, 20, 0.66)`). Enquanto ele ficasse no
   * literal azulado, "os quatro scrims são um só" seria falso — e o cabeçalho
   * do tema afirma exatamente isso. Um teste que só olhasse o host deixaria a
   * afirmação do tema sem prova. */
  it('o irmão (ChallengeGenerateModal) lê o MESMO token — a cópia acabou nos dois lados', () => {
    // `codeOf` porque o COMENTÁRIO daquele arquivo cita o literal antigo de
    // propósito (contar o defeito é o estilo desta base); o que não pode
    // sobreviver é o literal no CÓDIGO.
    const irmao = codeOf(SIBLING_SRC);
    assert.ok(
      irmao.includes('theme.vars.palette.scrim'),
      'o desafio também consome palette.scrim',
    );
    assert.ok(
      !irmao.includes('rgba(8, 10, 20, 0.66)'),
      'a última cor crua de modal da base saiu',
    );
  });

  // ONDA11 — O CHROME DEIXOU DE SER ROXO. O irmão continua sendo o irmão no
  // SCRIM (backdrop/blur/zIndex, acima), mas a referência que o dono mandou
  // para o modal do quiz é um cartão de cinza NEUTRO: sem borda colorida e sem
  // halo. As duas asserções abaixo medem os dois sentidos — o que saiu e o que
  // entrou —, porque só "não tem roxo" deixaria passar um cartão sem
  // superfície nenhuma.
  it('o cartão NÃO tem borda nem brilho do acento study (a referência é neutra)', () => {
    assert.ok(
      !HOST.includes('${secondaryMain}'),
      'a borda de 2px roxa e o glow roxo eram o que mais destoava da referência',
    );
    assert.ok(!/secondaryMain/.test(HOST), 'nem a variável do acento sobrou no host');
  });

  /* ─── ONDA12: A SUPERFÍCIE DO CARTÃO PASSOU A SEGUIR O `MuiDialog` ──────
   * A onda 11 fixou o NÍVEL 3 nos dois esquemas, medindo o cinza da
   * referência (#303030 ≈ #313131) e concluindo o degrau só para o ESCURO. No
   * CLARO a mesma linha entrega #e9e2d6 — MAIS ESCURO que a página #faf7f2
   * (Y 0,7657 contra 0,9326) —, e o modal lia como buraco em vez de elevação:
   * foi a captura mais fraca da prova visual. A regra que o tema já aplica a
   * todo `MuiDialog` da base resolve os dois de uma vez, e é assimétrica DE
   * PROPÓSITO: nível 1 no claro (polaridade positiva: elevar é clarear até o
   * branco), nível 4 no escuro (polaridade negativa: elevação é LUZ). Este
   * overlay era o ÚNICO modal fora dela.
   * ──────────────────────────────────────────────────────────────────────── */
  it('a superfície do cartão é a MESMA FUNÇÃO que o MuiDialog usa (não uma cópia)', () => {
    // A primeira versão deste conserto reescreveu a regra à mão no host: array
    // `sx` com o nível 1 e um `applyStyles('dark')` por último. Ela pintava
    // certo — e era exatamente a forma de erro que a onda estava consertando,
    // porque foi reescrever à mão que deixou este modal no nível 3 por onze
    // ondas sem que nada acusasse. O tema publicou `modalSurfaceStyles()` e o
    // `MuiDialog` a consome; a asserção agora exige a CHAMADA, não o desenho:
    // enquanto ela estiver de pé, o quiz e o Dialog não podem divergir, porque
    // não há dois lugares onde o degrau esteja escrito.
    assert.ok(
      HOST.includes('modalSurfaceStyles'),
      'o cartão chama a função do tema — a mesma do MuiDialog',
    );
    assert.ok(
      /import \{ modalSurfaceStyles \} from '\.\.\/\.\.\/theme'/.test(HOST),
      'e a importa do tema, em vez de manter uma cópia local',
    );
    // A prova de que a função é MESMO a do Dialog, e não uma homônima: o tema
    // tem de aplicá-la nos DOIS lugares. Sem isto, alguém poderia declarar um
    // `modalSurfaceStyles` local e a asserção acima passaria.
    assert.ok(
      /MuiDialog[\s\S]{0,900}modalSurfaceStyles\(t\)/.test(THEME_SRC),
      'o MuiDialog do tema aplica a MESMA função',
    );
    // Os níveis continuam cobrados, mas agora NO TEMA, que é onde passaram a
    // morar. `surface.level3` segue proibido no host: era o degrau fixo nos
    // dois esquemas, o defeito original.
    assert.ok(
      /modalSurfaceStyles[\s\S]{0,400}surface\.level1[\s\S]{0,200}applyStyles\('dark'[\s\S]{0,200}surface\.level4/.test(
        THEME_SRC,
      ),
      'a função dá nível 1 no claro e nível 4 no escuro, com applyStyles por último',
    );
    assert.ok(
      !HOST.includes('surface.level3'),
      'o degrau fixo nos dois esquemas era exatamente o defeito',
    );
    assert.ok(
      HOST.includes('color-mix(in srgb, ${black} 45%, transparent)'),
      'profundidade por preto diluído (color-mix, nunca alpha()) em vez de halo colorido',
    );
    assert.ok(HOST.includes('SHAPE.md'), 'o raio ~16px vem do token, não de um número solto');
    assert.ok(HOST.includes('SHAPE.pill'), 'as alternativas são pílulas (raio stadium)');
  });

  /* ─── ONDA12: A GUARDA DE COR CRUA ENXERGAVA SÓ HEX ─────────────────────
   * Esta asserção existia como "nenhum hex novo" e por isso NÃO viu o
   * `rgba(8, 10, 20, 0.66)` que morava no scrim do host desde a onda 11: a
   * violação entrou por baixo da própria guarda que deveria pegá-la. O
   * contrato de designTokens.ts não fala de notação, fala de ORIGEM — cor sai
   * da rampa/das variáveis do tema, ponto. Então a guarda passa a ver hex,
   * `rgb()`, `rgba()`, `hsl()` e `hsla()`.
   * `\b` antes de `rgb` é o que impede o falso positivo em `color-mix(in
   * srgb, …)`: entre o "s" e o "r" de "srgb" não há fronteira de palavra.
   * ──────────────────────────────────────────────────────────────────────── */
  it('nenhuma cor CRUA em components/quiz/** — nem hex, nem rgb()/rgba(), nem hsl()', () => {
    const CRUA = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b|\b(?:rgba?|hsla?)\(/g;
    for (const [nome, texto] of [
      ['QuizOverlayHost', HOST],
      ['QuizChatCard', CHAT_CARD],
      ['quizOverlayContent', codeOf(CONTENT_SRC)],
      ['quizOverlayBridge', codeOf(BRIDGE_SRC)],
    ] as const) {
      const achados = texto.match(CRUA) ?? [];
      assert.deepEqual(achados, [], `${nome} inventou cor crua — o contrato é designTokens.ts`);
    }
  });

  /* ─── ONDA12: O ÚLTIMO ROXO DA TELA ─────────────────────────────────────
   * A varredura do DOM da prova visual achou 7 nós em rgb(164,91,228) — o
   * `study.fill` do escuro. Um deles era o ícone "QUIZ RÁPIDO" deste card,
   * pintado com `secondary.main` (o tema aponta o slot `secondary` para a
   * família `study`). Era o único roxo da tela e brigava com o coral do CTA
   * logo abaixo.
   * ──────────────────────────────────────────────────────────────────────── */
  it('nenhum acento `study`/`secondary` como COR em components/quiz/**', () => {
    for (const [nome, texto] of [
      ['QuizOverlayHost', HOST],
      ['QuizChatCard', CHAT_CARD],
    ] as const) {
      assert.ok(
        !/'secondary\.[a-zA-Z]+'|palette\.secondary|palette\.study/.test(texto),
        `${nome} ainda pinta com o acento study — era o único roxo da tela`,
      );
    }
  });

  /* ─── ONDA12: RÓTULO DE BOTÃO É TEXTO, E TEXTO TEM PISO DE 4,5:1 ────────
   * Sem `color`, `text`/`outlined` caem no default `primary`, que o tema
   * reaponta para `accentText` (src/theme.ts, MuiButton) — calibrado contra
   * os níveis 0, 1 e 2 e SÓ eles. O cartão deste modal é o nível 4 no escuro:
   * medido, #eb614c sobre #3b3b3b dá 3,39:1 (e dava 3,93:1 sobre o nível 3 de
   * antes). Em tinta, 9,83:1.
   * ──────────────────────────────────────────────────────────────────────── */
  it('os botões do aviso dentro do modal pintam o rótulo com TINTA', () => {
    const inicio = HOST.indexOf('content.onRetry ? (');
    assert.ok(inicio > 0, 'o botão de repetir continua no host');
    const trecho = HOST.slice(inicio, HOST.indexOf('</Stack>', inicio));
    const botoes = trecho.split('<Button').slice(1);
    assert.equal(botoes.length, 2, 'são os dois: "pedir de novo" e "responder de novo"');
    for (const b of botoes) {
      assert.ok(
        /sx=\{\{ color: ink/.test(b),
        'sem color explícito o rótulo cai no accentText, que não vale do nível 3 para cima',
      );
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
    assert.match(VIEW_SRC, /export const CHAT_COLUMN_MAX_PX = \d+;/);
    assert.ok(
      VIEW.includes('maxWidth: CHAT_COLUMN_MAX_PX'),
      'a coluna da aula usa a constante',
    );
  });

  it('a linha de ENTRADA usa a mesma coluna do painel de mensagens', () => {
    // ONDA11: o eixo deixou de ser copiado filho a filho (`sx={CHAT_COLUMN_SX}`
    // na linha de entrada) e passou a ser do CONTAINER RAIZ — a cópia por
    // filho é justamente o que a regra de espaçamento do <Stack> apagava,
    // deixando a entrada encostada na esquerda com o painel centrado. Aqui só
    // fica a guarda de que NINGUÉM redeclara o eixo; a prova completa (o CSS
    // que o MUI emite, a barra de entrada renderizada) está em
    // tests/lessonChatLayout.test.ts.
    assert.equal(
      (VIEW.match(/maxWidth: CHAT_COLUMN_MAX_PX/g) ?? []).length,
      1,
      'o eixo de escrita bate com o de leitura por serem O MESMO container',
    );
    assert.ok(VIEW.includes('<LessonComposer'), 'a barra de entrada é o componente medido');
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
    // ONDA12 — A CAIXA DA CONVERSA MORREU. O painel deixou de ser um retângulo
    // desenhado (`surface.level2`): com uma bolha só, sobravam ~350px de cinza
    // vazio, e a referência do dono não desenha caixa nenhuma — as mensagens
    // ficam direto no fundo da tela. O que esta asserção sempre quis dizer é
    // "a superfície do painel sai da RAMPA"; o degrau agora é o 0, o fundo do
    // app. Continua não sendo `transparent` escrito à mão: é um nível da rampa
    // com nome, e é isso que a guarda mede.
    assert.ok(
      VIEW.includes('bgcolor: theme.vars.palette.surface.level0'),
      'o painel de mensagens é o nível 0 da rampa — o fundo do app, sem caixa',
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

/* ═══════════════════════════════════════════════════════════════════════════
 * 11. ONDA11 — O MODAL SÓ ABRE POR GESTO (guarda de FONTE)
 *
 * O pedido do dono, literal: *"quero um botão de abrir quiz pro usuário
 * acionar o modal manualmente"*. `tests/quizOverlayState` e
 * `tests/quizOverlayCycle` provam o COMPORTAMENTO; esta guarda impede que ele
 * volte por um caminho lateral — alguém chamar `openQuizOverlay` de dentro do
 * host (que roda a cada render) ou reintroduzir a intenção 'sobre-a-tela' na
 * função pura.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('11. o overlay não se abre sozinho por nenhum caminho', () => {
  const STATE = codeOf(src('src/lib/quizOverlayState.ts'));

  it('quizOverlayIntent não devolve a tela para passo NENHUM do ciclo', () => {
    const corpo = STATE.slice(STATE.indexOf('export function quizOverlayIntent'));
    const fim = corpo.indexOf('export function applyQuizOverlayStep');
    assert.ok(fim > 0, 'as duas funções continuam no arquivo');
    assert.ok(
      !corpo.slice(0, fim).includes("'sobre-a-tela'"),
      "um passo do ciclo voltou a pedir 'sobre-a-tela' — é assim que o modal subia sozinho",
    );
  });

  it('applyQuizOverlayStep não chama openQuizOverlay', () => {
    const corpo = STATE.slice(STATE.indexOf('export function applyQuizOverlayStep'));
    assert.ok(
      !corpo.includes('openQuizOverlay('),
      'aplicar um passo do ciclo é ESTACIONAR o quiz na conversa, nunca subi-lo',
    );
  });

  it('o HOST não abre a si mesmo (ele nem conhece a transição)', () => {
    assert.ok(
      !HOST.includes('openQuizOverlay'),
      'o host renderiza a fase; quem a muda para "sobre-a-tela" é o gesto na view',
    );
  });

  it('quem abre é a view, a partir do clique do card', () => {
    assert.ok(VIEW.includes('reopenQuizOverlay('), 'o botão do card reabre o que estava minimizado');
    assert.ok(VIEW.includes('openQuizOverlay('), 'e abre o que ainda não estava no store');
    // O gesto tem UM dono: o handler do clique. Se `openQuizOverlay` aparecer
    // dentro do EFEITO que segue o ciclo (ele reexecuta a cada mudança do
    // chat), o modal volta a subir sozinho. O recorte é o efeito inteiro —
    // do `useEffect(` que o abre ao `useEffect(` seguinte —, e não uma lista
    // de dependências literal, que envelheceria a cada refator da view.
    const passo = VIEW.indexOf('applyQuizOverlayStep(');
    assert.ok(passo > 0, 'a view continua aplicando o passo do ciclo ao overlay');
    const inicio = VIEW.lastIndexOf('useEffect(', passo);
    const seguinte = VIEW.indexOf('useEffect(', passo);
    const fim = seguinte === -1 ? VIEW.length : seguinte;
    assert.ok(inicio > 0 && fim > passo, 'o passo do ciclo é aplicado DENTRO de um efeito');
    assert.ok(
      !VIEW.slice(inicio, fim).includes('openQuizOverlay('),
      'o efeito do ciclo não pode abrir o modal — só o clique pode',
    );
  });

  it('o card da conversa oferece o botão, com nome acessível próprio', () => {
    assert.ok(CHAT_CARD.includes("variant=\"contained\""), 'o convite é a ação primária do card');
    assert.ok(CHAT_CARD.includes('aria-label={`${t('), 'o nome acessível carrega a pergunta');
    assert.ok(
      !CHAT_CARD.includes('bubbleShellStyle'),
      'o convite deixou de ser um balão de fala (borda 2px roxa + sombra colorida)',
    );
  });

  /* ─── O OUTRO LADO DA MESMA REGRA (ONDA11-INTEGRAÇÃO) ────────────────────
   * "Só o gesto abre" tem um par obrigatório: TODO gesto de responder ABRE.
   * O defeito medido na integração das quatro entregas: "Responder esta
   * pergunta de novo" (`handleQuizReopenGeneration`, a saída do ciclo travado
   * da ONDA4) é um clique do ALUNO, e ele terminava só em `setChat`. Como a
   * geração nova é OUTRA geração, o guard de `applyQuizOverlayStep` — que
   * protege apenas o MESMO quiz/geração já sobre a tela — não a segurava: o
   * efeito do ciclo empurrava o card recém-criado para 'minimizado-no-chat' e
   * o modal SUMIA na cara de quem acabara de clicar num botão escrito
   * "Responder". `tests/e2e/e2e-quiz.spec.ts` (teste 5, bloco a) já exigia o
   * contrário: `await reabrir.click()` seguido de `expect(dialog).toBeVisible()`.
   * ────────────────────────────────────────────────────────────────────── */
  it('"Responder esta pergunta de novo" TAMBÉM é gesto: o handler abre o modal', () => {
    const inicio = VIEW.indexOf('const handleQuizReopenGeneration');
    assert.ok(inicio > 0, 'a saída do ciclo travado continua na view');
    // Recorte até a PRÓXIMA declaração de topo do componente (`\n  const `),
    // que é onde o handler termina — nada de contar chaves.
    const rel = VIEW.slice(inicio + 1).search(/\n {2}const /);
    const corpo = rel === -1 ? VIEW.slice(inicio) : VIEW.slice(inicio, inicio + 1 + rel);
    assert.ok(corpo.includes('reopenStalledQuiz('), 'o recorte é mesmo o corpo do handler');
    assert.ok(
      corpo.includes('openQuizOverlay('),
      'o clique em "Responder esta pergunta de novo" precisa SUBIR a geração nova — ' +
        'sem isso o efeito do ciclo a estaciona na conversa e o modal some no clique',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 12. ONDA12 — O FOCO VOLTA DE VERDADE, E O TAB NÃO GANHA PARADA FANTASMA
 *
 * Os dois itens abaixo guardam defeitos que NÃO aparecem em nenhuma captura de
 * tela e que só o teclado sente.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('12. teclado: devolução de foco e paradas de Tab', () => {
  // ONDA 13 — ESTE TESTE FOI REESCRITO PORQUE ELE PASSAVA COM A FEATURE MORTA.
  //
  // O que ele fazia: `HOST.includes('focusReturnTarget(')` e
  // `HOST.includes('QUIZ_CARD_ANCHOR_SELECTOR')` — duas buscas de SUBSTRING no
  // fonte. Duas revisões adversariais mediram, no Electron rodando, o foco
  // caindo no `<body>` ao sair do modal ENQUANTO este teste estava verde, e o
  // padrão é o mesmo que esta onda já reprovou três vezes: exigir que a STRING
  // exista sem verificar que ela é APLICADA no momento certo.
  //
  // A causa raiz que a substring não podia ver: o host resolvia a âncora na
  // ABERTURA, com `document.activeElement.closest(...)` — e naquele instante o
  // CTA já tinha sido desmontado pelo mesmo commit que ligou o modal, então
  // `activeElement` era o `<body>`, `closest` devolvia null, e o `<body>` (que
  // é `instanceof HTMLElement` e está sempre `isConnected`) passava como
  // "abridor válido" para um `focus()` que é no-op.
  //
  // O que este teste passa a travar é a INVERSÃO que consertou isso — as duas
  // propriedades estruturais que a substring não distinguia:
  //   1. a âncora é resolvida no FECHAMENTO, no documento vivo (`querySelector`
  //      dentro do ramo `!showing`), não gravada como nó na abertura;
  //   2. o `<body>` é recusado explicitamente como abridor.
  // A prova de que o foco CHEGA ao card é e2e (tests/e2e/e2e-quiz.spec.ts) —
  // aqui não há DOM, e fingir que há foi exatamente o erro anterior.
  it('a devolução de foco resolve a âncora no FECHAMENTO, e recusa o <body>', () => {
    // O ramo de saída do efeito: entre `if (!showing) {` e o `return;` dele.
    const saida = /if \(!showing\) \{([\s\S]*?)\n      return;/.exec(HOST);
    assert.ok(saida !== null, 'o efeito precisa ter o ramo de saída (!showing)');
    assert.match(
      saida[1]!,
      /document\.querySelector/,
      'a âncora tem de ser procurada no documento VIVO no fechamento: ' +
        'gravada na abertura ela ainda não existe (o card só renasce ao minimizar)',
    );
    assert.match(saida[1]!, /focusReturnTarget\(/, 'a escolha do alvo é a função pura');

    assert.match(
      HOST,
      /!==\s*document\.body/,
      'o <body> precisa ser recusado como abridor: ele é instanceof HTMLElement e ' +
        'sempre isConnected, então passava como alvo válido para um focus() no-op',
    );
    assert.ok(
      !/if \(opener !== null && opener\.isConnected\) opener\.focus\(\);/.test(HOST),
      'a devolução de foco de uma perna só era a que nunca disparava',
    );
  });

  it('o nome do atributo da âncora tem UMA fonte (o card e o host não podem divergir)', () => {
    const CONTENT_CODE = codeOf(CONTENT_SRC);
    assert.match(
      CONTENT_CODE,
      /export const QUIZ_CARD_ANCHOR_ATTR = 'data-quiz-chat-card';/,
      'a constante mora no módulo que os dois já importam',
    );
    assert.ok(
      CHAT_CARD.includes('QUIZ_CARD_ANCHOR_ATTR'),
      'quem ESCREVE o atributo usa a constante, nunca uma string literal própria',
    );
    assert.ok(
      HOST.includes('quizCardAnchorSelector('),
      'quem PROCURA o atributo usa o seletor derivado da mesma constante',
    );
    // ONDA 13: e o VALOR do atributo é a chave do quiz, não um literal. Com o
    // valor fixo `"true"` só existia o seletor genérico, e o host devolvia o
    // foco ao PRIMEIRO card do documento — que não é necessariamente o que o
    // aluno fechou (uma seção pode ancorar duas afirmações).
    assert.ok(
      !/QUIZ_CARD_ANCHOR_ATTR\]: 'true'/.test(CHAT_CARD),
      'a âncora voltou a ser um valor fixo: a devolução de foco deixa de ser endereçada',
    );
    assert.match(
      CHAT_CARD,
      /QUIZ_CARD_ANCHOR_ATTR\]: quizKey/,
      'o valor da âncora é a chave canônica do quiz',
    );
  });

  it('todo wrapper com gesto de toque neutraliza a parada de Tab que o motion cria', () => {
    // `motion` marca `tabIndex=0` em quem tem gesto de tap
    // (framer-motion/dist/es/render/html/use-props.mjs: `if (props.tabIndex ===
    // undefined && (props.onTap || props.onTapStart || props.whileTap))`). Numa
    // casca que só anima, isso é uma parada de Tab EXTRA na frente do próprio
    // botão — o teclado para duas vezes no mesmo controle.
    for (const [nome, texto] of [
      ['QuizOverlayHost', HOST],
      ['QuizChatCard', CHAT_CARD],
    ] as const) {
      const elementos = texto.split('<motion.').slice(1);
      for (const el of elementos) {
        // O corpo da TAG de abertura: até o primeiro `>` que fecha a linha.
        const abertura = el.split(/>\s*\n/)[0];
        if (!/whileTap|onTap/.test(abertura)) continue;
        assert.ok(
          abertura.includes('tabIndex={-1}'),
          `${nome}: um <motion.*> com gesto de toque sem tabIndex={-1} — parada de Tab fantasma`,
        );
      }
    }
  });
});
