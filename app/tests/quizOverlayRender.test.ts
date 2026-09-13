/**
 * tests/quizOverlayRender.test.ts — o overlay do quiz RENDERIZADO DE VERDADE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO EXISTE, se já há guarda de fonte
 * ══════════════════════════════════════════════════════════════════════════
 * `tests/quizOverlayWiring.test.ts` lê a fonte e trava a LIGAÇÃO; ele não pode
 * afirmar nada sobre PIXEL. Só que as três perguntas que importam aqui são
 * todas sobre o que chega à tela:
 *
 *   1. o quiz aparece MESMO SOBRE A TELA quando a fase é 'sobre-a-tela'?
 *   2. respondido/minimizado, ele SAI da tela (e o ciclo continua na conversa)?
 *   3. as quatro alternativas nascem IGUAIS — a resposta não vaza antes do
 *      clique, agora que quem desenha é o overlay e não mais só o card inline?
 *
 * Este repositório não usa jsdom, e a técnica que ele já adotou para responder
 * a esse tipo de pergunta é `react-dom/server` — SSR puro, sem DOM, sem
 * dependência nova (precedente: `tests/typewriterSegments.test.ts`, bloco "a
 * TELA renderizada"). É o que este arquivo faz: monta o HOST REAL, com o TEMA
 * REAL e os textos REAIS de pt-BR, nas três fases do store, e mede o HTML.
 *
 * IMPORT DINÂMICO COM SPECIFIER COMPUTADO (a mesma razão do precedente): o
 * projeto composite dos testes compila com `lib: ES2022`, SEM DOM e sem `jsx`,
 * de propósito — é a prova mecânica de que os módulos PUROS desta onda
 * (`quizOverlayContent`, `quizOverlayBridge`) não dependem de DOM. Um import
 * estático de `.tsx` obrigaria a ligar `jsx` e a lib DOM no projeto inteiro e
 * APAGARIA essa garantia. O import dinâmico carrega o componente REAL em
 * runtime (o `tsx` compila o `.tsx`) sem colocá-lo no grafo do `tsc`.
 *
 * Reprodução: `cd app && npm test -- tests/quizOverlayRender.test.ts`
 */
import { before, beforeEach, describe, it } from 'node:test';
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
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import {
  __resetQuizOverlayForTests,
  minimizeQuizOverlay,
  openQuizOverlay,
} from '../src/lib/quizOverlayState';
import {
  QUIZ_CARD_ANCHOR_ATTR,
  quizCardAnchorSelector,
  __resetQuizOverlayContentForTests,
  publishQuizOverlayContent,
  type QuizOverlayContent,
} from '../src/components/quiz/quizOverlayContent';
import type { TrackAssertionDto } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));

const HOST_MODULE = new URL('../src/components/quiz/QuizOverlayHost.tsx', import.meta.url).href;
const CHAT_CARD_MODULE = new URL('../src/components/quiz/QuizChatCard.tsx', import.meta.url).href;

const LESSON_PATH = resolve(
  HERE,
  '../resources/tracks/python-iniciante/modules/a-tela/lessons/a-primeira-linha/lesson.json',
);
const LESSON = JSON.parse(readFileSync(LESSON_PATH, 'utf8')) as { assertions: TrackAssertionDto[] };
/** A afirmação REAL da aula 1 — as opções de verdade, na ordem de verdade. */
const ASSERTION = LESSON.assertions[0];
const QUIZ_KEY = 'as-tres-partes-da-linha::print-mostra-na-tela';

const CTX = {
  quizKey: QUIZ_KEY,
  assertionId: ASSERTION.id,
  generation: 0,
  sectionId: ASSERTION.sectionId ?? null,
  anchorIndex: 0,
};

const CONTENT: QuizOverlayContent = {
  quizKey: QUIZ_KEY,
  assertion: ASSERTION,
  quiz: undefined,
  generation: 0,
  status: 'aguardando',
  notice: null,
  onSelect: () => {},
  onMinimize: () => {},
  onRetry: null,
  onReopen: null,
};

/** Os props do card compacto (declarados aqui porque o import é dinâmico). */
interface ChatCardProps {
  quizKey: string;
  status: string;
  onScreen: boolean;
  question: string;
  generation: number;
  notice: string | null;
  onOpen: () => void;
  onRetry: (() => void) | null;
  onReopen: (() => void) | null;
}

let QuizOverlayHost: ComponentType<Record<string, never>>;
let QuizChatCard: ComponentType<ChatCardProps>;

/** O TEXTO que chega à TELA: o HTML sem as folhas de estilo e sem as tags. */
function onScreen(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A MARCAÇÃO, sem as folhas de estilo do emotion.
 *
 * Isto não é detalhe: o `<style>` que o MUI emite declara as REGRAS de
 * `.Mui-disabled`, `.MuiButton-containedSuccess` e companhia mesmo quando
 * NENHUM elemento as usa. Medir "a alternativa nasce verde" no HTML bruto
 * daria falso positivo garantido — o que vale é a classe APLICADA.
 */
function markup(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}

function renderHost(): string {
  return renderToStaticMarkup(
    createElement(ThemeProvider, { theme }, createElement(QuizOverlayHost, {})),
  );
}

before(async () => {
  // O banner de patrocínio do i18next iria para o stdout do runner.
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  // Os textos REAIS de pt-BR: o que este teste mede é o que o aluno lê.
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção de interpolação da produção (src/i18n/index.ts:
    // `interpolation: { escapeValue: false }`). Sem ela o harness roda com o
    // default do i18next — `escapeValue` LIGADO — e passa a medir uma string
    // que o app nunca emite: `"` vira `&quot;`, o React escapa o `&` de novo, e
    // uma alternativa real como `print("boa noite")` chega ao `aria-label` como
    // `print(&amp;quot;boa noite&amp;quot;)`. O produto está certo; era o
    // harness que divergia dele.
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const host = (await import(HOST_MODULE)) as { QuizOverlayHost: typeof QuizOverlayHost };
  QuizOverlayHost = host.QuizOverlayHost;
  const card = (await import(CHAT_CARD_MODULE)) as { QuizChatCard: typeof QuizChatCard };
  QuizChatCard = card.QuizChatCard;
});

beforeEach(() => {
  __resetQuizOverlayForTests();
  __resetQuizOverlayContentForTests();
});

describe('o quiz aparece SOBRE A TELA (a fase manda no pixel)', () => {
  it('FECHADO: nada é desenhado', () => {
    publishQuizOverlayContent(CONTENT);
    const html = renderHost();
    assert.ok(!html.includes('role="dialog"'), 'sem fase aberta não existe diálogo');
    assert.equal(onScreen(html), '');
  });

  it('SOBRE A TELA: o diálogo modal aparece, com a pergunta e as 4 alternativas', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(CONTENT);
    const html = renderHost();
    const tela = onScreen(html);

    assert.ok(html.includes('role="dialog"'), 'é um diálogo');
    assert.ok(html.includes('aria-modal="true"'), 'modal — o resto da tela fica atrás');
    assert.ok(tela.includes(ASSERTION.question), 'a pergunta está na tela');
    for (const option of ASSERTION.options) {
      assert.ok(tela.includes(option), `a alternativa "${option}" está na tela`);
    }
    assert.ok(tela.includes(ptBR.lesson.quizOverlayTitle), 'o título do overlay está na tela');
    assert.ok(tela.includes(ptBR.lesson.quizOverlayHint), 'o aluno lê o que responder provoca');
  });

  it('o card FLUTUA de verdade: fixed, acima de tudo, com o backdrop borrado', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(CONTENT);
    const html = renderHost();
    assert.match(html, /position:\s*fixed/, 'o overlay é fixo na viewport');
    assert.match(html, /z-index:\s*1300/, 'a mesma camada do modal irmão');
    assert.match(html, /backdrop-filter:\s*blur\(6px\)/, 'o fundo fica borrado');
  });

  it('MINIMIZADO: o card SAI da tela (ele passa a viver na conversa)', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(CONTENT);
    assert.ok(renderHost().includes('role="dialog"'), 'estava na tela');
    minimizeQuizOverlay(QUIZ_KEY);
    const html = renderHost();
    assert.ok(!html.includes('role="dialog"'), 'depois de responder, o overlay sai');
    assert.equal(onScreen(html), '');
  });

  it('conteúdo de OUTRA chave não vira card órfão sobre a tela', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent({ ...CONTENT, quizKey: 'outra-secao::outra-afirmacao' });
    assert.ok(!renderHost().includes('role="dialog"'), 'a identidade tem de bater');
  });

  it('sem conteúdo publicado (a LessonView desmontou) nada é desenhado', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(null);
    assert.equal(onScreen(renderHost()), '');
  });
});

describe('A RESPOSTA NÃO VAZA — medido no HTML, não na intenção', () => {
  it('antes do clique, as 4 alternativas nascem VISUALMENTE iguais', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(CONTENT);
    const html = markup(renderHost());

    // O MUI marca a alternativa "certa" de um card RESPONDIDO com a variante
    // `contained` e a cor `success`. Nenhuma das duas pode estar aplicada aqui.
    assert.ok(!html.includes('MuiButton-contained'), 'nenhuma alternativa nasce preenchida');
    assert.ok(!html.includes('Success'), 'nenhuma alternativa nasce verde');
    assert.ok(!html.includes('Error'), 'nenhuma alternativa nasce vermelha');
    // Nem ícone de veredito (CheckCircle/Cancel são o ✓ e o ✗ do card).
    assert.ok(!html.includes('data-testid="CheckCircleIcon"'), 'nenhum ✓ antes de responder');
    assert.ok(!html.includes('data-testid="CancelIcon"'), 'nenhum ✗ antes de responder');
    // E nenhuma delas nasce desabilitada: todas são clicáveis.
    assert.ok(!html.includes('Mui-disabled'), 'as quatro alternativas são clicáveis');
    // As quatro compartilham EXATAMENTE a mesma lista de classes de botão.
    // O recorte é pelo NOME ACESSÍVEL da alternativa ("Opção 2 de 4: …") e não
    // por "todo MuiButton-root da página": o modal tem outros botões seus (o
    // "Minimizar" do rodapé, desde a ONDA11), e contá-los aqui mediria a coisa
    // errada.
    const classes = [...html.matchAll(/class="([^"]*MuiButton-root[^"]*)"[^>]*aria-label="Opção /g)].map(
      (m) => m[1],
    );
    assert.equal(classes.length, ASSERTION.options.length, 'as quatro alternativas estão lá');
    assert.equal(new Set(classes).size, 1, 'nada distingue uma alternativa das outras');
  });

  it('o veredito só aparece DEPOIS da resposta (e aí sim é específico)', () => {
    openQuizOverlay(CTX);
    const errado = ASSERTION.answerIndex === 0 ? 1 : 0;
    publishQuizOverlayContent({
      ...CONTENT,
      quiz: { answered: true, selected: errado, correct: false },
    });
    const html = markup(renderHost());
    const tela = onScreen(html);
    assert.ok(html.includes('data-testid="CheckCircleIcon"'), 'a certa é apontada depois');
    assert.ok(html.includes('data-testid="CancelIcon"'), 'a marcada é apontada depois');
    assert.ok(html.includes('role="status"'), 'o veredito é anunciado (SC 4.1.3)');
    assert.ok(tela.includes(ptBR.lesson.quizWrong), 'a redação é a diagnóstica, não repreensão');
    assert.ok(!/parab|congrat/i.test(tela), 'nada de elogio ritualizado (§8.2)');
  });
});

describe('o aviso de canal (fail-closed) chega à tela, e com saída', () => {
  it('o overlay mostra o aviso e o botão de repetir', () => {
    openQuizOverlay(CTX);
    let clicado = 0;
    publishQuizOverlayContent({
      ...CONTENT,
      status: 'indisponivel',
      notice: ptBR.lesson.quizRemedialUnavailable,
      onRetry: () => {
        clicado += 1;
      },
    });
    const tela = onScreen(renderHost());
    assert.ok(tela.includes(ptBR.lesson.quizRemedialUnavailable), 'o aluno lê o que faltou');
    assert.ok(tela.includes(ptBR.lesson.quizChatRetry), 'e tem como pedir de novo');
    assert.equal(clicado, 0, 'nada é disparado só por renderizar');
  });

  // ONDA4-SAÍDA-DO-CICLO: as duas metades do quiz (o overlay e o card
  // compacto) oferecem a MESMA coisa — se divergissem, a saída existiria só
  // em uma delas e o aluno a encontraria por acaso.
  it('o overlay também oferece responder de novo a MESMA pergunta', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent({
      ...CONTENT,
      status: 'indisponivel',
      notice: ptBR.lesson.quizRemedialUnavailable,
      onRetry: () => {},
      onReopen: () => {},
    });
    const tela = onScreen(renderHost());
    assert.ok(tela.includes(ptBR.lesson.quizChatReopen), 'a saída que não depende da IA está lá');
  });

  it('sem travamento o overlay não desenha saída nenhuma de reabertura', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(CONTENT);
    const tela = onScreen(renderHost());
    assert.ok(!tela.includes(ptBR.lesson.quizChatReopen));
    assert.ok(!tela.includes(ptBR.lesson.quizChatRetry));
  });
});

describe('o card MINIMIZADO, na conversa', () => {
  // A chave canônica de um quiz é `sectionId::assertionId`, e o `assertionId`
  // vem do JSON da trilha — texto de AUTOR. Esta usa o formato real E os dois
  // caracteres que quebrariam um seletor de atributo entre aspas (a contrabarra
  // e a aspa dupla), para que o escape de `quizCardAnchorSelector` seja
  // exercitado pelo caminho do produto e não só em teste de unidade.
  const CARD_QUIZ_KEY = 'sec-1::afirma "com \\ aspas"';

  const renderCard = (props: Partial<ChatCardProps>): string =>
    renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme },
        createElement(QuizChatCard, {
          quizKey: CARD_QUIZ_KEY,
          status: 'aguardando',
          onScreen: false,
          question: ASSERTION.question,
          generation: 0,
          notice: null,
          onOpen: () => {},
          onRetry: null,
          onReopen: null,
          ...props,
        }),
      ),
    );

  it('esperando resposta: a pergunta e o botão de responder', () => {
    const tela = onScreen(renderCard({}));
    assert.ok(tela.includes(ASSERTION.question));
    assert.ok(tela.includes(ptBR.lesson.quizChatWaiting));
    assert.ok(tela.includes(ptBR.lesson.quizChatAnswer));
  });

  it('sobre a tela: o lugar fica reservado e o botão some (o card já está aberto)', () => {
    const tela = onScreen(renderCard({ onScreen: true }));
    assert.ok(tela.includes(ptBR.lesson.quizChatOnScreen));
    assert.ok(!tela.includes(ptBR.lesson.quizChatAnswer), 'nada de dois caminhos para o mesmo card');
  });

  it('ciclo em andamento: diz o que está acontecendo e NÃO oferece botão morto', () => {
    const explicando = onScreen(renderCard({ status: 'explicando' }));
    assert.ok(explicando.includes(ptBR.lesson.quizChatExplaining));
    assert.ok(!explicando.includes(ptBR.lesson.quizChatAnswer));

    const gerando = onScreen(renderCard({ status: 'gerando' }));
    assert.ok(gerando.includes(ptBR.lesson.quizChatGenerating));
    assert.ok(!gerando.includes(ptBR.lesson.quizChatAnswer));
  });

  // ONDA16-CICLO-CARGA: com um turno do tutor em voo, o motor do ciclo ESPERA
  // a vez (não enfileira atrás do turno — a fila FIFO do LLM local estourava o
  // timeout e o ciclo morria). O card diz a verdade sobre a espera: o texto
  // novo, e NÃO o "explicando"/"gerando" de um trabalho que ainda nem saiu —
  // e nenhum botão morto, porque não há nada que o clique adiante.
  it('aguardando a vez (turno do tutor em voo): texto honesto de fila, sem botão morto', () => {
    const naFila = onScreen(renderCard({ status: 'aguardando-vez' }));
    assert.ok(naFila.includes(ptBR.lesson.quizChatQueued), 'a fila é ANUNCIADA com o texto novo');
    assert.ok(!naFila.includes(ptBR.lesson.quizChatExplaining), 'não mente "explicando"');
    assert.ok(!naFila.includes(ptBR.lesson.quizChatGenerating), 'não mente "gerando"');
    assert.ok(!naFila.includes(ptBR.lesson.quizChatAnswer), 'nenhum botão morto na espera');
  });

  it('canal fora do ar: aviso informativo + "pedir de novo" (§8 item 3, diagnóstico)', () => {
    const html = renderCard({
      status: 'indisponivel',
      notice: ptBR.lesson.quizExplainUnavailable,
      onRetry: () => {},
    });
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.lesson.quizChatUnavailable));
    assert.ok(tela.includes(ptBR.lesson.quizExplainUnavailable));
    assert.ok(tela.includes(ptBR.lesson.quizChatRetry));
    assert.ok(html.includes('role="status"'), 'o andamento também é anunciado');
  });

  // ─── ONDA4-SAÍDA-DO-CICLO ────────────────────────────────────────────────
  // Com a IA fora, "Pedir de novo" era a ÚNICA oferta — e ela depende
  // justamente da IA que não responde. O card travado passa a oferecer também
  // responder de novo a MESMA pergunta, que não depende de ninguém. As duas
  // asserções abaixo medem o que chega à tela nos dois sentidos: o botão
  // APARECE travado, e NÃO aparece em nenhum outro estado (um botão de
  // reabrir sempre visível seria um botão de pular o quiz).
  it('ciclo TRAVADO: além de "pedir de novo", a saída que não depende da IA', () => {
    const html = renderCard({
      status: 'indisponivel',
      notice: ptBR.lesson.quizRemedialUnavailable,
      onRetry: () => {},
      onReopen: () => {},
    });
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.lesson.quizChatRetry), 'a saída que depende da IA continua lá');
    assert.ok(tela.includes(ptBR.lesson.quizChatReopen), 'e a que não depende dela também');
    assert.ok(!/parab|congrat|que pena|errad/i.test(tela), 'sem elogio e sem repreensão (§8/§8.2)');
  });

  it('fora do travamento, a saída NÃO existe (nem esperando, nem em andamento, nem dominado)', () => {
    for (const status of ['aguardando', 'explicando', 'gerando', 'dominado'] as const) {
      const tela = onScreen(renderCard({ status, onReopen: null }));
      assert.ok(
        !tela.includes(ptBR.lesson.quizChatReopen),
        `o botão de reabrir apareceu em "${status}" — o gate viraria decoração`,
      );
    }
  });

  // ─── ONDA11: o card virou o CONVITE (anúncio centralizado + CTA) ────────
  // O pedido do dono: *"quero um botão de abrir quiz pro usuário acionar o
  // modal manualmente"* — e, junto, que o roxo grosso saísse. O card era um
  // BALÃO (`bubbleShellStyle(theme,'reply')`: borda de 2px no acento `study` +
  // sombra colorida) com um botão de texto discreto. Agora é o anúncio do
  // sistema da referência: negrito centralizado + um CTA preenchido e alto.
  it('o convite tem um CTA PREENCHIDO e alto (alvo >= 44px), não um botão de texto', () => {
    const html = renderCard({});
    assert.ok(html.includes('MuiButton-contained'), 'o convite é a ação primária do card');
    assert.match(html, /min-height:48px/, 'o alvo de toque passa dos 44px do §8.1');
  });

  it('o CTA tem nome acessível PRÓPRIO (três cards não podem ter três "Responder")', () => {
    const html = renderCard({});
    // O atributo sai ESCAPADO (a pergunta da aula 1 tem aspas: print("…")).
    const esperado = `${ptBR.lesson.quizChatAnswer}: ${ASSERTION.question}`.replaceAll('"', '&quot;');
    assert.ok(
      html.includes(`aria-label="${esperado}"`),
      'o nome acessível carrega a pergunta junto do verbo',
    );
  });

  it('o CHROME roxo saiu: nem borda de 2px, nem sombra do acento study', () => {
    const html = renderCard({});
    assert.ok(!/border:\s*2px solid/.test(html), 'a casca de balão do tutor não desenha mais o convite');
    assert.ok(
      !/box-shadow[^;]*palette-secondary/.test(html),
      'nada de brilho roxo — a referência do dono é neutra',
    );
  });

  // ─── ONDA12: O ÚLTIMO ROXO DA TELA ─────────────────────────────────────
  // A varredura do DOM da prova visual encontrou 7 nós em rgb(164,91,228) — o
  // `study.fill` do escuro. Um deles era o ícone "QUIZ RÁPIDO" DESTE card
  // (`secondary.main`; o tema aponta o slot `secondary` para a família
  // `study`). Ele aparecia em TODO card de quiz, era o único roxo da tela e
  // brigava com o coral do CTA logo abaixo. Virou TINTA: 8,60:1 no escuro
  // (#adadad sobre o nível 0 #0e0e0e) e 7,70:1 no claro (#544e45 sobre
  // #faf7f2) — o piso de não-texto é 3:1.
  it('o ícone do quiz é TINTA, e o acento study não pinta mais nada no card', () => {
    const html = renderCard({});
    assert.ok(html.includes('data-testid="QuizIcon"'), 'o ícone continua lá (só mudou de cor)');
    // `var(...)`, e não o nome nu: o `ThemeProvider` DECLARA a paleta inteira
    // num bloco `:root` (`--mui-palette-secondary-main:#9a54d7`) use-se ela ou
    // não. O que importa é se alguma regra do card a CONSOME.
    assert.ok(
      !/var\(--mui-palette-(?:secondary|study)-/.test(html),
      'nenhuma regra do card consome o acento study — era o único roxo da tela',
    );
    // A cor do ÍCONE, e não "existe text-secondary em algum lugar do HTML" —
    // o rótulo ao lado já é text.secondary e daria falso positivo. O recorte é
    // a classe do emotion do próprio <svg data-testid="QuizIcon">.
    const classes = /class="([^"]*MuiSvgIcon-root[^"]*)"[^>]*data-testid="QuizIcon"/.exec(html)?.[1];
    const emotion = (classes ?? '').split(' ').find((c) => c.startsWith('css-'));
    assert.ok(emotion !== undefined, 'o ícone tem classe própria do emotion');
    const regras = [...html.matchAll(new RegExp(`\\.${emotion}\\{[^}]*\\}`, 'g'))].map((m) => m[0]);
    const cores = regras.flatMap((r) => [...r.matchAll(/[{;]color:([^;}]+)/g)].map((m) => m[1]));
    assert.equal(
      cores.at(-1),
      'var(--mui-palette-text-secondary)',
      'o ícone lê como parte da etiqueta que ele acompanha',
    );
  });

  // ─── ONDA12: A ÂNCORA DE DEVOLUÇÃO DE FOCO ─────────────────────────────
  // O CTA é desmontado enquanto o modal está em cena, então o
  // `document.activeElement` gravado na abertura está SEMPRE desconectado na
  // hora de devolver o foco — e a devolução prometida no cabeçalho do host
  // nunca acontecia (Esc largava o teclado no <body>, SC 2.4.3). Quem
  // sobrevive aos dois estados é ESTE container.
  it('o card carrega a âncora de foco no DOM, e ela vale nos dois estados', () => {
    for (const props of [{}, { onScreen: true }]) {
      const html = renderCard(props);
      assert.ok(
        html.includes(`${QUIZ_CARD_ANCHOR_ATTR}=`),
        'sem o atributo no DOM o host não tem para onde devolver o foco',
      );
    }
    // E ele está no ELEMENTO RAIZ: se estivesse dentro do bloco do CTA,
    // desmontaria junto com ele e a âncora não ancoraria nada.
    assert.match(
      renderCard({}).trimStart(),
      new RegExp(`^<div [^>]*${QUIZ_CARD_ANCHOR_ATTR}=`),
      'a âncora precisa estar na raiz do card',
    );
  });

  // ONDA 13 — A ÂNCORA É ENDEREÇADA, e este teste é o que prova o elo.
  // O valor era o literal "true", então só existia o seletor GENÉRICO: com mais
  // de um quiz pendente na conversa (uma seção pode ancorar duas afirmações, e
  // o histórico guarda as anteriores), o host devolveria o foco ao PRIMEIRO
  // card do documento em vez do que o aluno acabou de fechar.
  // O teste não olha o atributo cru: ele monta o seletor pelo MESMO helper que
  // o host usa e confirma que ele CASA com o HTML que o card emite. É o elo
  // produtor↔consumidor que estava faltando — cada lado tinha teste, e a
  // divergência entre eles era o que ninguém media.
  it('a âncora carrega a CHAVE do quiz — não um valor fixo', () => {
    const raiz = renderCard({}).slice(0, renderCard({}).indexOf('>') + 1);
    const m = new RegExp(`${QUIZ_CARD_ANCHOR_ATTR}="([^"]*)"`).exec(raiz);
    assert.ok(m !== null, 'a âncora precisa estar na raiz do card');
    // O React escapa `"` como `&quot;` no atributo; decodificar é o que permite
    // comparar com a chave REAL em vez de comparar duas convenções de escape
    // (foi essa comparação ingênua que fez a primeira versão deste teste falhar
    // contra um produto correto).
    const valor = m[1]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    assert.strictEqual(
      valor,
      CARD_QUIZ_KEY,
      'a âncora precisa carregar a chave canônica: é ela que endereça ESTE card',
    );
    assert.notStrictEqual(
      valor,
      'true',
      'a âncora voltou a ser um valor fixo — com dois quizzes pendentes o foco volta para o card errado',
    );
  });

  it('o anúncio é CENTRALIZADO (é evento do sistema, não fala de ninguém)', () => {
    const html = renderCard({});
    assert.match(html, /font-weight:700;text-align:center/, 'a pergunta é o anúncio em negrito');
    // ONDA 13 — a asserção que estava aqui era `assert.match(html,
    // /align-items:center/)`, e DUAS revisões adversariais a reprovaram com o
    // mesmo mutante: o próprio `MuiButtonBase` do CTA emite
    // `display:inline-flex;align-items:center`, então ela é verdadeira mesmo
    // com a coluna do convite alinhada à esquerda. Ela media o MUI, não o card.
    // O que centraliza de verdade é um `style` INLINE no motion.div raiz — e é
    // ele que o teste passa a ler, ancorado na raiz para não casar com o CSS
    // de nenhum filho.
    const raiz = html.slice(0, html.indexOf('>') + 1);
    assert.match(
      raiz,
      /align-items:\s*center/,
      'a coluna do convite (o motion.div raiz) precisa centralizar os filhos',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA11 — O MODAL NO ESTILO DA REFERÊNCIA
 *
 * A segunda imagem que o dono mandou (o modal "Invite Friends" do Nintendo
 * Switch Online): scrim escuro, cartão em cinza NEUTRO, raio ~16px, SEM borda
 * colorida e SEM brilho colorido, título centralizado em peso normal, opções
 * como PÍLULAS DE CONTORNO empilhadas com respiro, e a saída como TEXTO
 * simples embaixo. O que existia era o oposto disso na parte que mais
 * incomodava: borda de 2px roxa (`color-mix(secondary 45%)`) e um `box-shadow`
 * roxo de 48px, herdados do ChallengeGenerateModal.
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('o modal segue a referência: cinza neutro, sem borda e sem brilho coloridos', () => {
  const renderOpen = (): string => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(CONTENT);
    return renderHost();
  };

  // ─── ONDA12: O CARTÃO PASSOU A SEGUIR O `MuiDialog` DO TEMA ────────────
  // A onda 11 fixou o NÍVEL 3 nos dois esquemas, e mediu o degrau só pelo
  // ESCURO (o #303030 da referência ≈ #313131 da rampa). No CLARO a mesma
  // linha entrega #e9e2d6, que é MAIS ESCURO que a página #faf7f2
  // (Y 0,7657 contra 0,9326): o modal lia como BURACO, não como elevação — a
  // captura mais fraca da prova visual. A regra do tema é assimétrica de
  // propósito e resolve os dois: nível 1 no claro, nível 4 no escuro, com
  // `applyStyles('dark', …)` POR ÚLTIMO. Este era o único modal fora dela.
  it('a superfície do cartão é a do MuiDialog: nível 1 no claro, nível 4 no escuro', () => {
    const html = renderOpen();
    assert.match(
      html,
      /background-color:var\(--mui-palette-surface-level1\)/,
      'no claro o cartão é o nível 1 — mais claro que a página, e não mais escuro',
    );
    // O galho escuro chega como uma REGRA DE ESQUEMA (`*:where(.dark) .css-…`),
    // que é o que `applyStyles` emite sob `colorSchemeSelector: "class"`. Medir
    // só a presença do nível 4 no HTML aceitaria um cartão nível 4 nos DOIS
    // esquemas, que é o defeito espelhado do que esta onda conserta.
    assert.match(
      html,
      /:where\(\.dark\)[^{]*\{background-color:var\(--mui-palette-surface-level4\);\}/,
      'no escuro o cartão sobe para o topo da rampa, e SÓ no escuro',
    );
    assert.ok(
      !html.includes('background-color:var(--mui-palette-surface-level3)'),
      'o degrau fixo nos dois esquemas era exatamente o defeito',
    );
    assert.match(html, /border-radius:14px/, 'o raio do cartão vem de SHAPE.md');
  });

  // ─── ONDA12: O SCRIM ────────────────────────────────────────────────────
  // Era `rgba(8, 10, 20, 0.66)`, copiado do ChallengeGenerateModal: cor CRUA
  // (o contrato de designTokens.ts proíbe) e AZULADA (B 20 contra R 8) num app
  // cuja rampa é cinza neutro desde a onda 11. O conserto passou por um
  // `color-mix` de 62% escrito à mão e terminou no TOKEN: `palette.scrim`,
  // preto puro a 55%, que é também o que o `MuiBackdrop` do tema aplica.
  //
  // A asserção mede a variável, e não a cor resolvida, DE PROPÓSITO: é a
  // variável que amarra este overlay ao mesmo valor do Backdrop e do irmão. Um
  // teste que casasse com `color-mix(... 55% ...)` continuaria verde no dia em
  // que alguém reescrevesse os 55% à mão aqui — que foi exatamente como a
  // divergência nasceu.
  it('o scrim emitido é a VARIÁVEL do token (a mesma do MuiBackdrop)', () => {
    const html = renderOpen();
    assert.match(
      html,
      /background:var\(--mui-palette-scrim\)/,
      'o scrim chega à tela como var(--mui-palette-scrim)',
    );
    assert.ok(!html.includes('rgba(8, 10, 20, 0.66)'), 'a cor crua azulada saiu');
    // E o token resolve para preto NEUTRO — a razão de ele existir. O `:root`
    // que o MUI imprime é o lugar onde o valor pode ser lido de verdade.
    assert.match(
      html,
      /--mui-palette-scrim:color-mix\(in srgb, #000000 55%, transparent\)/,
      'o valor por trás da variável é preto puro, sem viés de matiz',
    );
  });

  // ─── ONDA12: RÓTULO DE BOTÃO É TEXTO (piso 4,5:1) ──────────────────────
  // Sem `color`, `text`/`outlined` caem no default `primary`, que o tema
  // reaponta para `accentText` — calibrado contra os níveis 0, 1 e 2 e SÓ
  // eles. Sobre o cartão (nível 4 no escuro) o coral #eb614c mede 3,39:1
  // (media 3,93:1 sobre o nível 3 de antes, e 4,06:1 no claro sobre #e9e2d6).
  // Em tinta: 9,83:1 no escuro, 17,90:1 no claro.
  it('os botões do aviso pintam o rótulo com TINTA, não com o acento', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent({
      ...CONTENT,
      status: 'indisponivel',
      notice: ptBR.lesson.quizRemedialUnavailable,
      onRetry: () => {},
      onReopen: () => {},
    });
    const html = renderHost();
    // A REGRA que vale é a ÚLTIMA declarada para a classe do botão: o
    // `accentText` do tema continua sendo emitido antes, e é o `color` do `sx`
    // que vence. Medir "não existe accentText no HTML" mediria a coisa errada.
    // Toda regra em que o accentText do tema aparece como cor (o `color` do
    // `text`/`outlined`, e o `border-color` que vem junto no `outlined`) tem de
    // TERMINAR em tinta: é a última declaração que pinta.
    const regras = [...html.matchAll(/\{[^{}]*\}/g)]
      .map((m) => m[0])
      .filter((r) => r.includes('color:var(--mui-palette-primary-accentText)'));
    assert.ok(regras.length > 0, 'o tema continua declarando o accentText do MuiButton');
    // TINTA é a rampa `text.*` — primária ou secundária. O "Minimizar" do
    // rodapé já era `text.secondary` de propósito (a saída é apagada na
    // referência), e ele mede 4,99:1 no escuro (#adadad sobre #3b3b3b) e
    // 8,23:1 no claro (#544e45 sobre #ffffff): acima do piso de 4,5:1 nos
    // dois. O que não pode sobrar é uma regra que TERMINE no accentText.
    for (const regra of regras) {
      const ultimaCor = [...regra.matchAll(/(?:^|;)color:([^;}]+)/g)].at(-1)?.[1];
      assert.match(
        String(ultimaCor),
        /^var\(--mui-palette-text-(primary|secondary)\)$/,
        'o rótulo do botão dentro do modal tem de terminar em TINTA',
      );
    }
  });

  it('nenhuma borda colorida e nenhum halo do acento study no cartão', () => {
    const html = renderOpen();
    assert.ok(
      !/border:2px solid;?border-color:color-mix\(in srgb, var\(--mui-palette-secondary-main\)/.test(html),
      'a borda de 2px roxa saiu',
    );
    assert.ok(
      !/box-shadow:0 10px 48px -12px color-mix\(in srgb, var\(--mui-palette-secondary-main\)/.test(html),
      'o brilho roxo saiu',
    );
    assert.match(
      html,
      /box-shadow:0 18px 56px -20px color-mix\(in srgb, var\(--mui-palette-common-black\)/,
      'a sombra é NEUTRA (profundidade, não halo)',
    );
  });

  it('as alternativas são PÍLULAS DE CONTORNO — e as quatro pelas MESMAS regras', () => {
    const html = renderOpen();
    // A regra é de DESCENDENTE e não olha para índice nenhum: ela vale para as
    // quatro de uma vez. É isso que mantém o invariante sagrado de pé.
    assert.match(html, /\.MuiButton-root\{border-radius:999px;min-height:52px/, 'raio stadium, alvo alto');
    // ─── O CONTORNO MUDOU DE DONO NA INTEGRAÇÃO ───────────────────────────
    // Esta asserção cobrava 1px a 55% declarados AQUI, por descendência
    // (`.css-host .MuiButton-outlined:not(.Mui-disabled)` = 0,3,0). Na mesma
    // onda o LessonQuiz passou a declarar 1,5px a 72% com `&&` (0,4,0) para o
    // MESMO alvo — e 0,4,0 vence 0,3,0 sempre, sem depender da ordem de
    // inserção do emotion. As duas declarações do host nunca chegavam à tela:
    // um teste verde sobre CSS morto. O host deixou de declará-las e a
    // asserção passou a medir a regra que DE FATO pinta, com a especificidade
    // dobrada visível no seletor (`.css-x.css-x`) — que é a prova de que quem
    // ganha é ela.
    assert.match(
      html,
      /(\.css-[a-zA-Z0-9-]+)\1\.MuiButton-outlined:not\(\.Mui-disabled\)\{border-width:1\.5px;border-color:color-mix\(in srgb, var\(--mui-palette-text-primary\) 72%, transparent\)/,
      'o contorno vem da regra && do LessonQuiz: 1,5px em tinta diluída a 72%',
    );
    assert.ok(
      !/\{border-width:1px;border-color:color-mix\(in srgb, var\(--mui-palette-text-primary\) 55%/.test(html),
      'a regra morta de 1px a 55% saiu do host — CSS que não pinta não fica',
    );
    assert.match(html, /\.MuiButton-root\+\.MuiButton-root\{margin-top:12px/, 'empilhadas com respiro');
  });

  // ONDA 13 — O TÍTULO VIROU RÓTULO, e o teste mudou junto porque o
  // COMPORTAMENTO mudou de propósito.
  // O que ele provava antes: o título era `subtitle1` (18px) em peso 400. O que
  // ele prova agora: o título é um RÓTULO — corpo de `body2`, peso 600, tinta
  // secundária — e a PERGUNTA é a única voz de 18px do cartão.
  // Por que a mudança é desejada: a prova visual mediu DOIS 18px empilhados (o
  // título 18px/400 e a pergunta 18px/500), dois cabeçalhos disputando onde a
  // referência do dono tem um só. Rebaixar o título é o que devolve a hierarquia
  // sem tirar dele o papel de `heading` (o nome acessível do diálogo e a âncora
  // do e2e continuam sendo ele).
  it('o título é um RÓTULO — a PERGUNTA é a voz principal do cartão', () => {
    const html = renderOpen();
    assert.ok(html.includes('<h2 class='), 'o e2e encontra o diálogo pelo papel de cabeçalho');

    // A classe do <h2> é a que carrega o desenho do rótulo.
    const h2 = /<h2 class="([^"]+)"/.exec(html);
    assert.ok(h2 !== null, 'sem <h2> não há o que medir');
    const regraDoTitulo = new RegExp(
      `\\.${h2[1]!.split(' ').filter((c) => c.startsWith('css-'))[0]}\\{([^}]*)\\}`,
    ).exec(html);
    assert.ok(regraDoTitulo !== null, 'a folha do emotion precisa declarar a classe do título');
    const desenho = regraDoTitulo[1]!;

    assert.match(desenho, /text-align:center/, 'centralizado, como a referência');
    assert.match(desenho, /font-weight:600/, 'rótulo tem peso de rótulo');
    assert.match(
      desenho,
      /color:var\(--mui-palette-text-secondary\)/,
      'a tinta é secundária: rótulo não compete com a pergunta',
    );

    // E O PONTO DO TESTE: o título NÃO pode voltar a empatar de corpo com a
    // pergunta. `subtitle1` (o que ele era) e `body1` (o que a pergunta é) são
    // os dois 18px da escala; `body2` é 16px. Se alguém devolver o título para
    // 18px, os dois cabeçalhos voltam e este assert cai.
    const tamanho = /font-size:([0-9.]+)px/.exec(desenho);
    assert.ok(tamanho !== null, 'o título precisa declarar corpo próprio');
    assert.ok(
      Number(tamanho[1]) < 18,
      `o título mede ${tamanho[1]}px e voltou a empatar com a pergunta (18px) — dois cabeçalhos de novo`,
    );
  });

  it('a saída é TEXTO simples embaixo (e ela MINIMIZA, nunca fecha)', () => {
    const html = renderOpen();
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.lesson.quizOverlayMinimize), 'o rótulo é palavra, não ícone mudo');
    assert.match(html, /MuiButton-text[^"]*"[^>]*type="button">Minimizar/, 'variante de TEXTO, sem borda');
    assert.ok(!html.includes('data-testid="KeyboardArrowDownIcon"'), 'o ícone do cabeçalho saiu');
  });
});
