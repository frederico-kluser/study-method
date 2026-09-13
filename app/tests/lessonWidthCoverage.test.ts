/**
 * tests/lessonWidthCoverage.test.ts — ONDA-LARGURA-LIVRE: a cobertura que
 * FALTAVA para "o texto da aula não tem mais teto de largura; quem manda é a
 * divisória do sidebar" (pedido do dono — ver o cabeçalho de
 * src/views/LessonView/LessonView.tsx, `LESSON_COLUMN_SX`, e de
 * src/components/chat/ChatBubble.tsx).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ARQUIVO NOVO — rodando em PARALELO com a onda do sidebar-portal
 * ══════════════════════════════════════════════════════════════════════════
 * Um agente IRMÃO edita, na MESMA LessonView.tsx, o cabeçalho da aula (troca
 * `<CollapsibleLessonHeader>`+`<Divider/>` por um portal no sidebar). Por
 * isso este arquivo NÃO afirma nada sobre cabeçalho, Divider, imports,
 * Popover, comentários ou números de linha da LessonView — só sobre os
 * QUATRO pontos do contrato de largura: a declaração de `LESSON_COLUMN_SX`, o
 * espalhamento dela na raiz do `return` da aula ativa, o primeiro filho
 * `<Stack useFlexGap`, e a AUSÊNCIA de tetos absolutos (`CHAT_COLUMN_MAX_PX`).
 *
 * Esses quatro pontos (e o balão a 78%) já estão MUITO bem cobertos por três
 * arquivos irmãos — este arquivo NÃO os duplica:
 *   - tests/lessonChatLayout.test.ts (bloco 2) — `LESSON_COLUMN_SX` declarada,
 *     espalhada UMA vez na raiz, forma exata (`width:'100%'`/`minWidth:0`,
 *     sem `maxWidth`/`mx`), `CHAT_COLUMN_MAX_PX` morto (fonte E módulo),
 *     `useFlexGap` no Stack da coluna, painel e composer descendentes da
 *     MESMA raiz;
 *   - tests/quizOverlayWiring.test.ts ("8 e 9") — o mesmo eixo, de outro
 *     ângulo (a ordem eixo → log → entrada no texto-fonte);
 *   - tests/chatBubbleWidth.test.ts — o balão em 78% para tutor/aluno, e a
 *     teoria REAL da aula 1 sem teto absoluto em nenhuma camada
 *     (TypewriterText → SegmentedMarkdown → MarkdownView/CodeBlock).
 *
 * ── O QUE ESTE ARQUIVO ACRESCENTA (gaps do handoff da onda) ─────────────────
 *   1. a AUSÊNCIA DE TETO na cadeia de flex do shell EM VOLTA da LessonView —
 *      App.tsx (`main`: `flexGrow:1`/`minWidth:0`, sem `maxWidth`/`flexBasis`
 *      na PRÓPRIA sx dele nem na do contêiner `ref={containerRef}`) e
 *      SessionFrame.tsx (a sx do `<AppBar>` — a coluna — e a do
 *      contêiner-slot, sem `maxWidth`/`maxInlineSize`). O flex-basis/width/
 *      min-width que TRAVAM a largura da sidebar NÃO são inéditos aqui: já
 *      são guarda de fonte (mesmo regex de `flex-basis`) e prova de CSS
 *      RENDERIZADO (`flex:0 0 <px>`, `width:<px>` para 180/240/397 e
 *      `min-width:0` — mais forte, passa pelo emotion) em
 *      tests/shellSplitUi.test.ts:440 e :250-261. O inédito aqui é SÓ a
 *      ausência de teto, ancorada no bloco `sx` certo — nunca o arquivo
 *      inteiro: um `maxWidth` legítimo e não relacionado em outro canto do
 *      arquivo (um dialog futuro, por exemplo) não pode derrubar este teste
 *      sem regressão real do contrato);
 *   2. o balão em TONS que tests/chatBubbleWidth.test.ts nunca renderizou:
 *      `reply` (resposta do tutor a uma pergunta do aluno), `review`
 *      aprovado (sem `errorFor`) e `review` de ERRO (com `errorFor` — o
 *      `instant` do TypewriterText), cada um AGRUPADO e NÃO-agrupado — 78%
 *      sempre, nunca um número absoluto;
 *   3. a CADEIA INTEIRA em números — resposta DIRETA às perguntas falseáveis
 *      do orquestrador (Q1: "com o main a 1600px, sobra teto absoluto?"; Q2:
 *      "a largura do texto acompanha a divisória em QUALQUER janela?"),
 *      combinando `ratioToPx` (splitRatio.ts — a aritmética dele já é
 *      provada à exaustão em tests/shellSplitMath.test.ts) com o `%` REAL
 *      medido no balão;
 *   4. Q5 do orquestrador ("alguém dependia de `CHAT_COLUMN_MAX_PX`?") —
 *      varredura em TODO `src/`+`shared/`+`electron/`+`tools/` (os irmãos só
 *      olham a LessonView e o módulo dela).
 *
 * ── O QUE ESTE ARQUIVO NÃO RESPONDE (documentado, não escondido) ───────────
 *   - Q3 ("composer e log no MESMO eixo?") — já respondida por
 *     tests/lessonChatLayout.test.ts (bloco 2) e tests/quizOverlayWiring.test.ts;
 *   - Q4 ("outra view mudou de largura?") — respondida por EVIDÊNCIA DE DIFF,
 *     não por teste: `git diff 91414f3..9671b22 --stat` (repo principal)
 *     mostra que só ChatBubble.tsx, LessonView.tsx e três arquivos de teste
 *     mudaram nesta onda — nenhuma outra view. Os estados vazio/erro/loading
 *     da própria LessonView (`maxWidth: 640`) e os cards do quiz (LessonQuiz
 *     640 / QuizChatCard 560) ficam FORA do escopo desta onda — e fora da
 *     RESTRIÇÃO DE COLISÃO deste sub-agente (guardas de fonte em
 *     LessonView.tsx só sobre `LESSON_COLUMN_SX`/raiz/Stack/ausência-de-teto)
 *     — por isso não há guarda aqui para eles, de propósito;
 *   - pixel real: SEM jsdom não há layout — como os irmãos, a prova é SSR
 *     (CSS que o emotion emite) + guarda de fonte + aritmética pura.
 *
 * Reprodução: `bash tools/t.sh tests/lessonWidthCoverage.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import type { TutorChatMessage } from '../src/lib/trackLessonState';
import {
  DEFAULT_SHELL_SPLIT_RATIO,
  ratioToPx,
  SHELL_SPLIT_CONSTRAINTS,
} from '../src/lib/splitRatio';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const APP_PATH = resolve(HERE, '../src/App.tsx');
const SESSION_FRAME_PATH = resolve(HERE, '../src/components/shell/SessionFrame.tsx');
const VIEW_PATH = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
const BUBBLE_MODULE = new URL('../src/components/chat/ChatBubble.tsx', import.meta.url).href;

/* ═══════════════════════════════════════════════════════════════════════════
 * Ferramentas de leitura do fonte/CSS — cópia PRÓPRIA (este arquivo não
 * importa de outro tests/*.test.ts: ver o cabeçalho, "arquivo NOVO").
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Todas as regras `<seletor>{<corpo>}` das folhas embutidas no HTML do SSR. */
function rulesOf(html: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  for (const sheet of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const rule of sheet[1].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ selector: rule[1].trim(), body: rule[2].trim() });
    }
  }
  return out;
}

/** As declarações `prop:valor` de um corpo de regra ou de um `style=""`. */
function declarations(body: string): { prop: string; value: string }[] {
  return body
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d.includes(':'))
    .map((d) => {
      const at = d.indexOf(':');
      return { prop: d.slice(0, at).trim().toLowerCase(), value: d.slice(at + 1).trim() };
    });
}

/** A MARCAÇÃO, sem as folhas de estilo do emotion. */
function markup(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}

/** Os `style=""` INLINE da marcação (a casca do balão é um deles). */
function inlineStyles(html: string): string[] {
  return [...markup(html).matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]);
}

/** Unidade ABSOLUTA de comprimento — tudo que não escala com a coluna. */
const ABSOLUTE = /-?\d*\.?\d+(px|ch|em|rem|ex|vw|vh|vmin|vmax|cm|mm|in|pt|pc)\b/;

/**
 * Existe exatamente UMA regra, em `html`, cuja declaração `max-width` vale
 * `78%`. Não importa em QUE seletor ela caiu (a coluna do balão gera uma
 * classe nova a cada render) nem quantas OUTRAS regras de max-width existam
 * ao lado — a prosa/código do balão emite `max-width:100%` em várias camadas
 * (MarkdownView, KaTeX, CodeBlock — medido abaixo), mas nenhuma delas é 78%.
 */
function assertOnly78(html: string, label: string): void {
  const hits = rulesOf(html).filter((r) =>
    declarations(r.body).some((d) => d.prop === 'max-width' && d.value === '78%'),
  );
  assert.equal(
    hits.length,
    1,
    `${label}: esperava exatamente UMA regra com max-width:78% (a coluna do balão) — achei ${hits.length}`,
  );
}

/**
 * Nenhum `max-width`/`max-inline-size`, em regra OU em style inline, usa
 * unidade absoluta (px/ch/em/…) ou `min()`/`clamp()` — em `html` inteiro.
 */
function assertNoAbsoluteMaxWidth(html: string, label: string): void {
  const found = [
    ...rulesOf(html).flatMap((r) => declarations(r.body)),
    ...inlineStyles(html).flatMap(declarations),
  ].filter((d) => d.prop === 'max-width' || d.prop === 'max-inline-size');
  const bad = found.filter((d) => ABSOLUTE.test(d.value) || /min\(|clamp\(/.test(d.value));
  assert.deepEqual(
    bad,
    [],
    `${label}: nenhum max-width pode usar unidade absoluta ou min()/clamp() — achei ${JSON.stringify(bad)}`,
  );
}

/**
 * O ÚNICO valor percentual de `max-width` em `html`. Usado SÓ com mensagens
 * do ALUNO (role 'user'): a bolha do aluno é `<Typography>` pura — sem o
 * embrulho de markdown que toda bolha do TUTOR carrega, e que emite o
 * PRÓPRIO `max-width:100%` mesmo em prosa simples (medido empiricamente antes
 * de escrever este arquivo — ver a seção 2). Com o aluno, o único
 * `max-width` percentual É o da coluna: dá para ler o número real sem
 * hardcodar "78" aqui, e usar esse número na aritmética da seção 3.
 */
function onlyPercentMaxWidth(html: string, label: string): number {
  const values = new Set(
    rulesOf(html)
      .flatMap((r) => declarations(r.body))
      .filter((d) => d.prop === 'max-width' && /^\d+(\.\d+)?%$/.test(d.value))
      .map((d) => d.value),
  );
  assert.equal(
    values.size,
    1,
    `${label}: esperava UM único valor percentual de max-width; achei ${JSON.stringify([...values])}`,
  );
  return parseFloat([...values][0]);
}

/** Todo arquivo .ts/.tsx sob `rootRel` (relativo à raiz do app), recursivo. */
function listSourceFiles(rootRel: string): string[] {
  const root = resolve(APP_ROOT, rootRel);
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
  }
  return out;
}

/**
 * O valor de um `sx={...}` a partir do índice onde o marcador `sx={` aparece
 * — por balanceamento de chaves/colchetes/parênteses, NUNCA uma janela fixa
 * de N caracteres (que corta no meio um `sx` em forma de array ou de função e
 * pode "vazar" para o próximo elemento). Devolve o texto ENTRE as chaves da
 * expressão JSX: objeto (`{...}`), array (`[...]`) ou função
 * (`(theme) => ({...})`), como estiver escrito no fonte — sem a chave que
 * abre/fecha a PRÓPRIA expressão JSX (o `{`/`}` de `sx={`…`}`).
 *
 * Usada pela SEÇÃO 1 para ancorar cada checagem de "sem teto" no BLOCO `sx`
 * relevante (o do `<Box component="main">`, o do `ref={containerRef}`, o do
 * `<AppBar>` e o do contêiner-slot) — nunca no arquivo inteiro. Um `maxWidth`
 * legítimo e sem relação com a largura da coluna (um dialog futuro, por
 * exemplo) em QUALQUER outro canto do arquivo não pode derrubar essas
 * checagens sem que haja uma regressão real do contrato de largura.
 */
function extractSxValue(src: string, fromIndex: number): string {
  const marker = 'sx={';
  const open = src.indexOf(marker, fromIndex);
  assert.notEqual(open, -1, `"${marker}" não encontrado a partir do índice ${fromIndex}`);
  const start = open + marker.length;
  let depth = 1; // a chave da própria expressão JSX (o `{` de `sx={`) já abriu
  let i = start;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{' || c === '[' || c === '(') depth += 1;
    else if (c === '}' || c === ']' || c === ')') depth -= 1;
    i += 1;
  }
  assert.equal(
    depth,
    0,
    `sx={ aberto no índice ${open} nunca fechou — balanceamento de chaves/colchetes/parênteses falhou`,
  );
  return src.slice(start, i - 1);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SEÇÃO 1 — a cadeia de flex do shell: nada capa o main entre a divisória e
 * a coluna da aula (guardas de FONTE — App.tsx e SessionFrame.tsx).
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('1. a cadeia de flex do shell — nada capa o main entre a divisória e a coluna da aula', () => {
  const appSrc = (): string => codeOf(readFileSync(APP_PATH, 'utf8'));
  const frameSrc = (): string => codeOf(readFileSync(SESSION_FRAME_PATH, 'utf8'));

  it('App.tsx: o <Box component="main"> tem flexGrow:1 e minWidth:0 — e a PRÓPRIA sx dele não declara maxWidth/flexBasis', () => {
    const src = appSrc();
    const at = src.indexOf('component="main"');
    assert.notEqual(at, -1, 'o main (role="tabpanel") do shell precisa existir em App.tsx');
    // Recorte ANCORADO no bloco `sx` do main (balanceamento de chaves — não
    // uma janela fixa de N caracteres, e não o arquivo inteiro): não confundir
    // com o Box IRMÃO (o contêiner do split, testado abaixo) que também tem
    // flexGrow:1/minWidth:0 um pouco acima, nem deixar que um maxWidth
    // legítimo em OUTRO canto do arquivo (sem relação com o main) derrube
    // este teste.
    const mainSx = extractSxValue(src, at);
    assert.match(
      mainSx,
      /p: \{ xs: 2, sm: 3, md: 4 \}/,
      'sanidade do recorte: essa é a ÚLTIMA propriedade da sx do main — se ela não aparecer aqui, ' +
        'o balanceamento de chaves parou cedo demais e não pegou o bloco INTEIRO',
    );
    assert.match(
      mainSx,
      /flexGrow: 1/,
      'o main precisa CRESCER para preencher o que a divisória deixar — sem isso ele fica do ' +
        'tamanho do conteúdo, não do espaço disponível',
    );
    assert.match(
      mainSx,
      /minWidth: 0/,
      'sem minWidth:0 o main não encolhe abaixo do conteúdo — a coluna da aula ' +
        '(LESSON_COLUMN_SX) ficaria refém do min-width automático do flex',
    );
    assert.doesNotMatch(
      mainSx,
      /maxWidth|maxInlineSize|flexBasis/,
      'a sx do main: um teto ou flex-basis fixo aqui devolveria um número absoluto entre a ' +
        'divisória e o texto da aula — o pedido do dono era JUSTAMENTE tirar esse número. ' +
        'Ancorado NA PRÓPRIA sx (não no arquivo inteiro): um maxWidth legítimo em outro canto de ' +
        'App.tsx não pode derrubar este teste sem uma regressão real do contrato',
    );
  });

  it('App.tsx: o contêiner que o ResizeObserver mede (sidebar+divisória+main) também não tem teto — na PRÓPRIA sx dele', () => {
    const src = appSrc();
    const at = src.indexOf('ref={containerRef}');
    assert.notEqual(
      at,
      -1,
      'o contêiner do split precisa existir — é nele que a matemática de splitRatio mede o eixo inteiro',
    );
    const containerSx = extractSxValue(src, at);
    assert.match(
      containerSx,
      /minWidth: 0 \}/,
      'sanidade do recorte: essa é a ÚLTIMA propriedade da sx do contêiner — se ela não aparecer ' +
        'aqui, o balanceamento de chaves não pegou o bloco INTEIRO',
    );
    assert.match(
      containerSx,
      /flexGrow: 1/,
      'o contêiner do split cresce para preencher tudo que sobra do rail (chrome de largura fixa)',
    );
    assert.match(containerSx, /minWidth: 0/);
    assert.doesNotMatch(
      containerSx,
      /maxWidth|maxInlineSize|flexBasis/,
      'a sx do contêiner do split: sem teto — ancorado NA PRÓPRIA sx (não no arquivo inteiro), ' +
        'senão um maxWidth legítimo em outro canto de App.tsx derrubaria este teste à toa',
    );
  });

  it('SessionFrame.tsx: nem a sx do <AppBar> (a coluna) nem a do contêiner-slot têm maxWidth/maxInlineSize', () => {
    // flex-basis/width/min-width — quem de fato TRAVA a largura da sidebar —
    // já são guarda de FONTE (mesmo regex de `flex-basis`) e prova de CSS
    // RENDERIZADO em tests/shellSplitUi.test.ts:440 e :250-261 (para
    // 180/240/397px) — mais forte, porque passa pelo emotion. Este teste NÃO
    // repete isso: só prova a AUSÊNCIA de teto, e ancorada no bloco `sx`
    // certo (não no arquivo inteiro — um maxWidth legítimo e sem relação em
    // outro canto do arquivo não pode derrubar este teste).
    const src = frameSrc();

    const appBarAt = src.indexOf('<AppBar');
    assert.notEqual(appBarAt, -1, 'o AppBar da coluna precisa existir');
    const appBarSx = extractSxValue(src, appBarAt);
    assert.match(
      appBarSx,
      /theme\.applyStyles\('dark',/,
      'sanidade do recorte: a chamada de dark-mode é a ÚLTIMA entrada do array de sx do AppBar — ' +
        'se ela não aparecer aqui, o balanceamento parou cedo demais (por exemplo, só na primeira ' +
        'função do array) e não pegou o bloco INTEIRO',
    );
    assert.doesNotMatch(
      appBarSx,
      /maxWidth|maxInlineSize/,
      'a sx do AppBar (a coluna): sem teto — quem limita a sidebar é a MATEMÁTICA da divisória ' +
        '(SHELL_SPLIT_CONSTRAINTS em splitRatio.ts) via flex-basis, nunca um número aqui',
    );

    const slotAt = src.indexOf('id={SHELL_SIDEBAR_SLOT_ID}');
    assert.notEqual(slotAt, -1, 'o contêiner-slot da view ativa precisa existir');
    const slotSx = extractSxValue(src, slotAt);
    assert.match(
      slotSx,
      /'&:empty': \{ display: 'none' \}/,
      'sanidade do recorte: essa é a ÚLTIMA propriedade da sx do contêiner-slot — se ela não ' +
        'aparecer aqui, o balanceamento não pegou o bloco INTEIRO',
    );
    assert.doesNotMatch(
      slotSx,
      /maxWidth|maxInlineSize/,
      'a sx do contêiner-slot: sem teto — o conteúdo que a view ativa publica por portal não pode ' +
        'ser limitado aqui',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * SEÇÃO 2 — o balão (ChatBubble) em TODAS as variantes de tom: 78% da
 * coluna, nunca um número absoluto. tests/chatBubbleWidth.test.ts só rendeu
 * os tons 'user' e 'tutor' (kind 'message'); aqui entram 'reply', 'review'
 * aprovado e 'review' de erro — cada um agrupado e não-agrupado.
 * ═══════════════════════════════════════════════════════════════════════════ */

interface BubbleProps {
  message: TutorChatMessage;
  isNew: boolean;
  previous?: TutorChatMessage;
}

let ChatBubble: ComponentType<BubbleProps>;

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção de interpolação da produção (src/i18n/index.ts).
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const bubble = (await import(BUBBLE_MODULE)) as { ChatBubble: typeof ChatBubble };
  ChatBubble = bubble.ChatBubble;
});

function renderBubble(message: TutorChatMessage, previous?: TutorChatMessage): string {
  return renderToStaticMarkup(
    createElement(ThemeProvider, { theme }, createElement(ChatBubble, { message, isNew: false, previous })),
  );
}

/** Instante fixo — a mensagem "anterior" 1s antes cai no MESMO minuto (agrupa). */
const TS = Date.UTC(2026, 5, 1, 9, 15, 0);

function baseUser(content: string, ts: number): TutorChatMessage {
  return { role: 'user', content, ts };
}
function baseTutor(content: string, ts: number): TutorChatMessage {
  return { role: 'assistant', kind: 'message', content, ts };
}
function baseReply(content: string, ts: number): TutorChatMessage {
  return { role: 'assistant', kind: 'reply', content, ts };
}
function baseApproved(content: string, ts: number): TutorChatMessage {
  return { role: 'assistant', kind: 'review', content, ts };
}
function baseError(content: string, ts: number): TutorChatMessage {
  return { role: 'assistant', kind: 'review', errorFor: 'desafio-exemplo', content, ts };
}

const TONE_CASES: readonly { name: string; build: (ts: number) => TutorChatMessage }[] = [
  { name: 'aluno (user)', build: (ts) => baseUser('uma pergunta do aluno', ts) },
  { name: 'tutor (message, a teoria)', build: (ts) => baseTutor('uma explicação do tutor', ts) },
  {
    name: 'tutor (reply, resposta a uma pergunta)',
    build: (ts) => baseReply('a resposta direta à pergunta', ts),
  },
  {
    name: 'review aprovado (sem errorFor)',
    build: (ts) => baseApproved('Checklist aprovado: tudo certo.', ts),
  },
  {
    name: 'review de ERRO (com errorFor — instant no TypewriterText)',
    build: (ts) => baseError('Faltou tratar o caso vazio.', ts),
  },
];

describe('2. o balão em TODAS as variantes de tom — 78% da coluna, nunca um número absoluto', () => {
  for (const { name, build } of TONE_CASES) {
    for (const grouped of [false, true] as const) {
      const label = `${name} — ${grouped ? 'agrupada (continuação, sem cabeçalho)' : 'com cabeçalho'}`;
      it(`${label}: a coluna mede EXATAMENTE 78%, e nenhum max-width é absoluto`, () => {
        const message = build(TS + 1000);
        const previous = grouped ? build(TS) : undefined;
        const html = renderBubble(message, previous);
        assertOnly78(html, label);
        assertNoAbsoluteMaxWidth(html, label);
      });
    }
  }

  it('a variante "agrupada" de fato suprime o cabeçalho — senão as duas metades do loop acima testariam a MESMA árvore', () => {
    const grouped = renderBubble(baseTutor('segunda', TS + 1000), baseTutor('primeira', TS));
    const ungrouped = renderBubble(baseTutor('unica', TS));
    assert.ok(
      !markup(grouped).includes(`>${ptBR.lesson.tutorName}<`),
      'agrupada: o nome do tutor não pode reaparecer no cabeçalho (ele já apareceu na bolha anterior)',
    );
    assert.ok(
      markup(ungrouped).includes(`>${ptBR.lesson.tutorName}<`),
      'não-agrupada: o cabeçalho (nome do tutor) precisa aparecer normalmente — prova que o par ' +
        'de testes acima não passaria "por acidente" caso o agrupamento quebrasse',
    );
  });

  it('review de ERRO com crase e bloco de código: o caminho TypewriterText→SegmentedMarkdown→CodeBlock não introduz teto absoluto', () => {
    // Nenhum teste irmão renderizou o tom 'error' com conteúdo rico — só o
    // tom 'tutor' (chatBubbleWidth.test.ts, com a teoria real da aula 1).
    // Aqui o conteúdo é o de uma bolha de erro de verdade: crase inline +
    // bloco de código, o mesmo formato que `formatErrorBubble` produz.
    const rich = baseError(
      'Faltou um `return` na função:\n\n```python\ndef soma(a, b):\n    a + b\n```\n\nRevise a linha 2.',
      TS,
    );
    const html = renderBubble(rich);
    const body = markup(html);
    assert.ok(body.includes('<pre'), 'sanidade: o bloco de código precisa ter renderizado para a varredura valer');
    assertOnly78(html, 'review de erro com bloco de código');
    assertNoAbsoluteMaxWidth(html, 'review de erro com bloco de código');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * SEÇÃO 3 — a cadeia INTEIRA, em números: divisória → main → coluna → balão.
 * Resposta direta às perguntas falseáveis Q1/Q2 do orquestrador.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('3. a cadeia inteira, em números — divisória → main → coluna → balão (Q1/Q2 do orquestrador)', () => {
  it('Q1: com o main a 1600px, o balão mede EXATAMENTE 78% dele (1248px) — nenhum teto absoluto no caminho', () => {
    const html = renderBubble(baseUser('uma pergunta qualquer', TS));
    const pct = onlyPercentMaxWidth(html, 'balão do aluno');
    assert.equal(
      pct,
      78,
      'ONDA-LARGURA-LIVRE travou o balão em 78% da coluna (ChatBubble.tsx) — e a coluna, por sua ' +
        "vez, é width:100% do main (LessonView.tsx: LESSON_COLUMN_SX, provado em " +
        'tests/lessonChatLayout.test.ts)',
    );
    const mainPx = 1600;
    const bubblePx = (mainPx * pct) / 100;
    assert.equal(
      bubblePx,
      1248,
      'main a 1600px × 78% = 1248px — sem clamp(), sem min(), sem número absoluto entre os dois',
    );
  });

  it('Q2: para QUALQUER largura de contêiner e QUALQUER razão da divisória, o balão cresce junto com a janela — nunca estaciona num platô', () => {
    const html = renderBubble(baseUser('outra pergunta qualquer', TS));
    const pct = onlyPercentMaxWidth(html, 'balão do aluno (sweep)');
    // Varredura de janelas — da colisão (piso em px dos dois painéis) a uma
    // tela bem larga — e das quatro razões-limite/representativas da
    // divisória do shell (SHELL_SPLIT_CONSTRAINTS em splitRatio.ts).
    const containerWidths = [200, 400, 800, 1200, 1600, 2400, 3200];
    const ratios = [
      SHELL_SPLIT_CONSTRAINTS.minRatio,
      DEFAULT_SHELL_SPLIT_RATIO,
      0.32,
      SHELL_SPLIT_CONSTRAINTS.maxRatio,
    ];
    for (const ratio of ratios) {
      let previousBubblePx = -1;
      for (const containerPx of containerWidths) {
        // App.tsx (seção 1): main = flexGrow:1, SEM maxWidth/flex-basis fixo
        // ⇒ recebe TUDO que a divisória não reserva para a sidebar (que TEM
        // flex-basis fixo — seção 1 também). Isso é exatamente `secondaryPx`
        // de ratioToPx — a aritmética em si já é provada à exaustão em
        // tests/shellSplitMath.test.ts ("a soma fecha EXATAMENTE o
        // contêiner"); aqui ela só alimenta a conta desta cadeia.
        const px = ratioToPx(ratio, containerPx, SHELL_SPLIT_CONSTRAINTS);
        const mainPx = px.secondaryPx;
        // LessonView (fora de escopo de colisão — já provado pelos irmãos):
        // a coluna é width:100% do main, sem maxWidth ⇒ coluna === main.
        // ChatBubble (seção 2): o balão é `pct`% dela.
        const bubblePx = (mainPx * pct) / 100;
        assert.ok(
          bubblePx > previousBubblePx,
          `ratio ${ratio}, container ${containerPx}px: o balão (${bubblePx}px) precisava CRESCER ` +
            `sobre o container anterior (${previousBubblePx}px) — um platô aqui denunciaria um ` +
            'teto absoluto escondido em algum elo da cadeia',
        );
        previousBubblePx = bubblePx;
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * SEÇÃO 4 — Q5 do orquestrador: quem mais dependia de CHAT_COLUMN_MAX_PX.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('4. Q5 do orquestrador — quem mais dependia de CHAT_COLUMN_MAX_PX', () => {
  it('nenhum arquivo de PRODUÇÃO (src/shared/electron/tools) importa ou copia CHAT_COLUMN_MAX_PX', () => {
    const files = [
      ...listSourceFiles('src'),
      ...listSourceFiles('shared'),
      ...listSourceFiles('electron'),
      ...listSourceFiles('tools'),
    ];
    const offenders: string[] = [];
    for (const file of files) {
      const raw = readFileSync(file, 'utf8');
      if (!raw.includes('CHAT_COLUMN_MAX_PX')) continue;
      // A ÚNICA sobra tolerada é a autópsia em COMENTÁRIO na própria
      // LessonView.tsx (o cabeçalho dela narra a morte da constante) — nunca
      // em código que roda, e nunca em outro arquivo. tests/*.test.ts NÃO
      // entra nesta varredura: os arquivos irmãos citam o nome morto de
      // propósito, como asserção NEGATIVA — isso é o comportamento ESPERADO,
      // não uma dependência real.
      const isLessonViewOwnComment = file === VIEW_PATH && !codeOf(raw).includes('CHAT_COLUMN_MAX_PX');
      if (!isLessonViewOwnComment) offenders.push(file);
    }
    assert.deepEqual(
      offenders,
      [],
      `CHAT_COLUMN_MAX_PX não pode sobrar fora de um comentário da própria LessonView.tsx: ${JSON.stringify(offenders)}`,
    );
  });
});
