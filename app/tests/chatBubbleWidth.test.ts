/**
 * tests/chatBubbleWidth.test.ts — a LARGURA do balão do chat da aula: 78% da
 * coluna e NENHUM teto absoluto (ONDA-LARGURA-LIVRE).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O PEDIDO E O DEFEITO
 * ══════════════════════════════════════════════════════════════════════════
 * O dono, sobre a aula: "o texto da aula, que está dentro de uma limitação de
 * width, não deve ter mais essa limitação — o sidebar define o limite da área
 * de texto simplesmente pelo seu tamanho".
 *
 * O balão — onde a teoria da aula é apresentada — era `maxWidth: min(78%,
 * 80ch)`. Em janela larga o `80ch` vencia os 78% e a linha parava de crescer:
 * arrastar a divisória do sidebar não mudava a largura do texto. Junto com o
 * teto de 960 da coluna (LessonView, `CHAT_COLUMN_MAX_PX`, travado em
 * tests/lessonChatLayout.test.ts, bloco 2) eram os DOIS números absolutos
 * entre a divisória e a linha de texto. Os dois morreram.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTA SUÍTE TRAVA — no CSS que o SSR EMITE, não no fonte
 * ══════════════════════════════════════════════════════════════════════════
 *   1. a COLUNA do balão (o PAI da casca inline de `bubbleShellStyle`) emite
 *      `max-width:78%`, exatamente — para o tutor E para o aluno. Os 78% ficam:
 *      são semântica de chat (a folga de 22% distingue os lados), e por serem
 *      relativos escalam com o sidebar;
 *   2. nenhum `max-width` da bolha inteira usa unidade absoluta (px, ch, em,
 *      rem, vw…) nem `min()`/`clamp()`. A bolha é renderizada com a TEORIA REAL
 *      da aula 1 (prosa, lista, código inline, dois blocos de código) + uma
 *      fórmula em bloco e uma URL longa — o caminho inteiro ChatBubble →
 *      TypewriterText → SegmentedMarkdown → MarkdownView / CodeBlock passa pela
 *      varredura;
 *   3. nenhuma LARGURA fixa (`width`/`inline-size` absoluta) cai sobre um
 *      elemento que carrega texto: as únicas permitidas são as do AVATAR e dos
 *      ÍCONES (SVG), que não carregam texto.
 *
 * A técnica é a de tests/chatBubbleSurface.test.ts: `react-dom/server` (SSR
 * puro, sem jsdom) e import DINÂMICO com specifier computado — o projeto
 * composite dos testes compila sem `jsx` e sem a lib DOM, de propósito.
 *
 * NÃO COBERTO: pixel. SSR não calcula layout; o que se prova é que nenhuma
 * regra emitida carrega um teto absoluto. A cadeia de fora (main = contêiner −
 * sidebar − divisória; coluna = main − paddings) está no bloco 2 de
 * tests/lessonChatLayout.test.ts.
 *
 * Reprodução: `cd app && bash tools/t.sh tests/chatBubbleWidth.test.ts`
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
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import type { TutorChatMessage } from '../src/lib/trackLessonState';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUBBLE_MODULE = new URL('../src/components/chat/ChatBubble.tsx', import.meta.url).href;
const AULA_1 = resolve(
  HERE,
  '../resources/tracks/python-iniciante/modules/a-tela/lessons/a-primeira-linha/lesson.json',
);

interface BubbleProps {
  message: TutorChatMessage;
  isNew: boolean;
  previous?: TutorChatMessage;
}

let ChatBubble: ComponentType<BubbleProps>;

/** Um instante fixo — duas mensagens no MESMO minuto agrupam. */
const TS = Date.UTC(2026, 0, 1, 12, 34, 0);

/** Unidade ABSOLUTA de comprimento (tudo que não escala com a coluna). */
const ABSOLUTE = /-?\d*\.?\d+(px|ch|em|rem|ex|vw|vh|vmin|vmax|cm|mm|in|pt|pc)\b/;

interface TheorySectionJson {
  markdown: string;
  code?: { language: string; code: string; explanation?: string };
}

/**
 * A seção MAIS LONGA da aula 1, montada como o tutor a manda no 'next' (a
 * mesma montagem do golden master de tests/typewriterSegments.test.ts), mais o
 * que a aula real ainda não tem mas o markdown do app renderiza: fórmula em
 * bloco (KaTeX) e uma URL longa sem ponto de quebra. (Tabela NÃO entra: o app
 * não liga GFM — ver `REMARK_PLUGINS` em MarkdownView — e ela sairia como
 * parágrafo, provando nada.)
 */
function richTheory(): string {
  const raw = JSON.parse(readFileSync(AULA_1, 'utf8')) as { theory: TheorySectionJson[] };
  const assembled = raw.theory.map((s) => {
    if (!s.code) return s.markdown;
    const expl = s.code.explanation ? `\n\n${s.code.explanation}` : '';
    return `${s.markdown}\n\n\`\`\`${s.code.language}\n${s.code.code}\n\`\`\`${expl}`;
  });
  const longest = assembled.reduce((a, b) => (b.length > a.length ? b : a));
  return [
    longest,
    '$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$',
    'https://exemplo.dev/uma/url/muito/longa/sem/nenhum/ponto/de/quebra/no/meio',
  ].join('\n\n');
}

function tutor(content: string, ts = TS): TutorChatMessage {
  return { role: 'assistant', content, kind: 'message', ts };
}

function aluno(content: string, ts = TS): TutorChatMessage {
  return { role: 'user', content, kind: 'message', ts };
}

function renderRaw(props: BubbleProps): string {
  return renderToStaticMarkup(
    createElement(ThemeProvider, { theme }, createElement(ChatBubble, props)),
  );
}

/** A MARCAÇÃO, sem as folhas de estilo do emotion. */
function markup(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
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

/** Os `style=""` INLINE da marcação (a casca do balão é um deles). */
function inlineStyles(html: string): string[] {
  return [...markup(html).matchAll(/\sstyle="([^"]*)"/g)].map((m) => m[1]);
}

/**
 * A classe do emotion da COLUNA do balão — o PAI direto da casca inline.
 *
 * Numa CONTINUAÇÃO de grupo o cabeçalho (avatar + nome + hora) some, e a casca
 * — o único elemento com `border-radius` no style inline, vindo de
 * `bubbleShellStyle` — passa a ser o PRIMEIRO filho da coluna. Não há outro
 * elemento entre os dois para o recorte casar por engano.
 */
function columnClassOf(isUser: boolean): string {
  const make = isUser ? aluno : tutor;
  const html = markup(
    renderRaw({ message: make('segunda', TS + 1000), previous: make('primeira'), isNew: false }),
  );
  const m = /<div class="([^"]*)"><div style="[^"]*border-radius:/.exec(html);
  assert.ok(m, 'a casca do balão precisa ser o primeiro filho da coluna numa continuação');
  const cls = m[1].split(/\s+/).find((c) => c.startsWith('css-'));
  assert.ok(cls, 'a coluna do balão estiliza por classe do emotion (sx)');
  return cls;
}

function cssOfClass(html: string, cls: string): string {
  return rulesOf(html)
    .filter((r) => r.selector === `.${cls}`)
    .map((r) => r.body)
    .join(';');
}

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

describe('1. a coluna do balão: 78% da coluna da aula, e mais nada', () => {
  for (const [lado, isUser] of [
    ['tutor', false],
    ['aluno', true],
  ] as const) {
    it(`${lado}: a coluna emite max-width:78% — sem ch, sem min()`, () => {
      const cls = columnClassOf(isUser);
      const html = renderRaw({
        message: isUser ? aluno('uma pergunta') : tutor('uma explicação'),
        isNew: false,
      });
      assert.ok(
        markup(html).includes(cls),
        'a MESMA coluna (mesma classe) é usada quando o cabeçalho aparece',
      );
      const maxWidths = declarations(cssOfClass(html, cls))
        .filter((d) => d.prop === 'max-width')
        .map((d) => d.value);
      assert.deepEqual(
        maxWidths,
        ['78%'],
        'ONDA-LARGURA-LIVRE: o teto é SÓ os 78% da coluna. O `min(78%, 80ch)` antigo ' +
          'prendia a linha em 80ch em janela larga e a divisória do sidebar parava de ' +
          `mandar no texto (emitido: ${JSON.stringify(maxWidths)})`,
      );
      assert.doesNotMatch(maxWidths.join(' '), /ch\b|min\(|clamp\(/, 'nada de `ch` no balão');
    });
  }
});

describe('2. a teoria REAL da aula, renderizada: nenhum teto absoluto no caminho do texto', () => {
  it('todo max-width emitido pela bolha é relativo (%) — da coluna ao bloco de código', () => {
    const html = renderRaw({ message: tutor(richTheory()), isNew: false });
    // Sanidade do recorte: a varredura só vale se o caminho inteiro renderizou.
    const body = markup(html);
    assert.ok(body.includes('<pre'), 'o bloco de código (CodeBlock) foi renderizado');
    assert.ok(body.includes('katex'), 'a fórmula (KaTeX) foi renderizada');
    const tetos = [
      ...rulesOf(html).flatMap((r) => declarations(r.body)),
      ...inlineStyles(html).flatMap(declarations),
    ].filter((d) => d.prop === 'max-width' || d.prop === 'max-inline-size');
    assert.ok(tetos.length > 0, 'a varredura precisa ter achado os tetos relativos (sanidade)');
    const absolutos = tetos.filter(
      (d) => ABSOLUTE.test(d.value) || /min\(|clamp\(/.test(d.value),
    );
    assert.deepEqual(
      absolutos,
      [],
      'um teto absoluto em qualquer nível da bolha prende a linha de texto de novo e a ' +
        'divisória do sidebar volta a não mandar nela',
    );
    assert.ok(
      tetos.some((d) => d.value === '78%'),
      'e o teto da coluna do balão está entre eles',
    );
  });

  it('largura FIXA só no avatar e nos ícones — nunca num elemento que carrega texto', () => {
    const html = renderRaw({ message: tutor(richTheory()), isNew: false });
    const body = markup(html);
    // Inline: nenhuma largura fixa em style="" (a casca do balão é inline).
    const inlineFixas = inlineStyles(html)
      .flatMap(declarations)
      .filter((d) => (d.prop === 'width' || d.prop === 'inline-size') && ABSOLUTE.test(d.value));
    assert.deepEqual(inlineFixas, [], 'nenhum style inline fixa largura');
    // Classes: toda regra com largura absoluta pertence a elementos sem texto.
    const suspeitas = rulesOf(html).filter((r) =>
      declarations(r.body).some(
        (d) => (d.prop === 'width' || d.prop === 'inline-size') && ABSOLUTE.test(d.value),
      ),
    );
    for (const regra of suspeitas) {
      const cls = /^\.(css-[A-Za-z0-9_-]+)$/.exec(regra.selector)?.[1];
      assert.ok(
        cls,
        `largura absoluta num seletor composto (${regra.selector}{${regra.body}}) — ` +
          'impossível provar que não cai sobre texto',
      );
      const tags = [...body.matchAll(new RegExp(`<([a-z]+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"`, 'g'))];
      for (const t of tags) {
        const ok = t[1] === 'svg' || t[0].includes('MuiAvatar-root');
        assert.ok(ok, `largura fixa (${regra.body}) em <${t[1]}> que não é avatar nem ícone`);
      }
    }
  });
});
