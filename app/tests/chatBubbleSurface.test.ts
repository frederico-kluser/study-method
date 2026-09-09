/**
 * tests/chatBubbleSurface.test.ts — o BALÃO DO CHAT medido contra a referência
 * que o dono mandou.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTA SUÍTE TRAVA
 * ══════════════════════════════════════════════════════════════════════════
 * O dono mandou a referência de chat (`~/Imagens/…Switch Online Mock 2.png`) e
 * três defeitos fotografados na tela: o AVATAR flutuando colado à borda
 * esquerda numa coluna própria, a HORA dentro do balão, e a COR — balão do
 * aluno no acento CHEIO e balão da `reply` com borda/brilho ROXOS ("as cores do
 * modo dark não ficaram boas"). As asserções abaixo são exatamente esses três,
 * mais o contraste do que a mudança de cor produz.
 *
 * As cores saem de `bubbleShellStyle` (a função REAL, com o tema REAL); a
 * estrutura sai do componente RENDERIZADO com `react-dom/server` — SSR puro,
 * sem jsdom, precedente de `tests/quizOverlayRender.test.ts` e de
 * `tests/typewriterSegments.test.ts`.
 *
 * IMPORT DINÂMICO COM SPECIFIER COMPUTADO (a mesma razão do precedente): o
 * projeto composite dos testes compila com `lib: ES2022`, SEM DOM e sem `jsx`,
 * de propósito. Um import estático de `.tsx` obrigaria a ligar `jsx` e a lib
 * DOM no projeto inteiro. O import dinâmico carrega os componentes REAIS em
 * runtime (o `tsx` compila o `.tsx`) sem colocá-los no grafo do `tsc`.
 *
 * O CONTRASTE É RECALCULADO, NUNCA COPIADO: o tint do aluno é
 * `color-mix(in srgb, <fill> USER_BUBBLE_TINT_PCT%, <paper>)`, e `color-mix` em
 * `srgb` mistura os canais JÁ codificados em gama — a mesma conta que `mixSrgb`
 * faz aqui. Assim, qualquer rebalanceamento futuro dos acentos reprova aqui se
 * derrubar a leitura do balão.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ONDA12 — OS TRÊS FUROS QUE A REVISÃO ADVERSARIAL ACHOU NESTA SUÍTE
 * ══════════════════════════════════════════════════════════════════════════
 *  1. O bloco de contraste do balão do aluno media a fração LITERAL `43` em vez
 *     da constante que o próprio arquivo importa. Mutante provado: com
 *     `USER_BUBBLE_TINT_PCT = 90` caía SÓ a asserção de igualdade (que é
 *     literalmente "repetir a constante do código") e o bloco continuava
 *     jurando AAA para uma mistura que a tela não desenhava mais. Agora tudo
 *     passa por `userBubbleHex`, e o mesmo mutante derruba a RAZÃO
 *     (claro #e14932 = 4,43:1).
 *  2. O teste do carimbo de hora media `contrastRatio(INK.secondary, level2)` —
 *     o token PURO — e era CEGO à `opacity: 0.8` que o componente aplicava. O
 *     composto real era #746e65 = 4,37:1, reprovado em AA, com o comentário do
 *     componente jurando 7,12:1. A opacidade agora é LIDA da folha do SSR
 *     (`headerOpacity`) e entra na mistura.
 *  3. Nada media o AVATAR. A varredura do DOM ainda achava rgb(164,91,228) — o
 *     roxo da família `study` — no fundo do avatar do Tutor, em TODA bolha do
 *     tutor. `usedPaletteVars` mede o CONSUMO de variável (não a definição, que
 *     o `:root` do SSR sempre imprime inteira).
 *
 * E o denominador mudou: a CAIXA da conversa morreu (o painel é transparente),
 * então tudo que era medido "sobre o painel (nível 2)" passou a ser medido
 * contra o NÍVEL 0.
 *
 * Reprodução: `cd app && bash tools/t.sh tests/chatBubbleSurface.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import type { CSSProperties } from 'react';
import type { Theme } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import {
  ACCENT_DARK,
  ACCENT_LIGHT,
  CONTRAST_FLOOR,
  INK_DARK,
  INK_LIGHT,
  SURFACE_DARK,
  SURFACE_LIGHT,
  contrastRatio,
} from '../src/lib/designTokens';
import type { ChatBubbleTone } from '../src/lib/chatBubbleStyle';
import { formatChatTime, type TutorChatMessage } from '../src/lib/trackLessonState';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..');

const BUBBLE_MODULE = new URL('../src/components/chat/ChatBubble.tsx', import.meta.url).href;
const SURFACES_MODULE = new URL('../src/components/chat/chatSurfaces.tsx', import.meta.url).href;

interface BubbleProps {
  message: TutorChatMessage;
  isNew: boolean;
  previous?: TutorChatMessage;
}

let ChatBubble: ComponentType<BubbleProps>;
let bubbleShellStyle: (theme: Theme, tone: ChatBubbleTone, grouped: boolean) => CSSProperties;
let USER_BUBBLE_TINT_PCT: number;
let TUTOR_AVATAR_SURFACE: string | undefined;

/** Um instante fixo — o rótulo HH:MM vem da mesma função que a UI usa. */
const TS = Date.UTC(2026, 0, 1, 12, 34, 0);
const HHMM = formatChatTime(TS, 'pt-BR');
/** O NOME do autor no cabeçalho, do MESMO recurso que o componente lê. */
const AUTOR_TUTOR = ptBR.lesson.tutorName;

function msg(p: Partial<TutorChatMessage> & { ts: number }): TutorChatMessage {
  // Conteúdo SEM dígitos de propósito: a busca pelo carimbo de hora dentro do
  // balão não pode casar por acidente com o texto da mensagem.
  return { role: 'assistant', content: 'a linha que aparece na tela', kind: 'message', ...p };
}

/** A MARCAÇÃO, sem as folhas de estilo do emotion (elas declaram regras de
 *  componentes que ninguém usou — medir cor no HTML bruto dá falso positivo). */
function markup(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}

function renderRaw(props: BubbleProps): string {
  return renderToStaticMarkup(
    createElement(ThemeProvider, { theme }, createElement(ChatBubble, props)),
  );
}

function render(props: BubbleProps): string {
  return markup(renderRaw(props));
}

/** SÓ as folhas de estilo emitidas pelo SSR (o inverso de `markup`). */
function styleSheet(html: string): string {
  return (html.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? []).join('\n');
}

/**
 * O HTML INTERNO do balão. O balão é o único elemento com `border-radius` no
 * style INLINE (a casca vem de `bubbleShellStyle`, que o `motion.div` aplica
 * como style plain); o resto do chat estiliza por classe do emotion. A varredura
 * conta `<div`/`</div>` para achar o fechamento do próprio balão.
 */
function bubbleInnerHtml(html: string): string {
  const marker = html.indexOf('border-radius:');
  assert.notEqual(marker, -1, 'o balão precisa ter a casca inline de bubbleShellStyle');
  const openEnd = html.indexOf('>', marker);
  let depth = 1;
  let i = openEnd + 1;
  while (i < html.length) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    assert.notEqual(nextClose, -1, 'HTML do balão sem fechamento');
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
      continue;
    }
    depth -= 1;
    if (depth === 0) return html.slice(openEnd + 1, nextClose);
    i = nextClose + 6;
  }
  throw new Error('balão não fechado');
}

/** `color-mix(in srgb, a p%, b)` — a mistura acontece nos canais JÁ em gama. */
function mixSrgb(a: string, b: string, percentOfA: number): string {
  const parse = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const p = percentOfA / 100;
  const ch = (x: number, y: number): string =>
    Math.round(x * p + y * (1 - p))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

/**
 * O balão do aluno, montado com a MESMA constante que o componente usa. Repetir
 * o literal `43` aqui invalidava o bloco de contraste inteiro: trocar
 * `USER_BUBBLE_TINT_PCT` para 90 fazia falhar SÓ a asserção de igualdade — que
 * é literalmente "repetir a constante do código" — enquanto as asserções de
 * AAA e de red flash continuavam medindo uma mistura que a tela não desenha.
 */
function userBubbleHex(scheme: 'light' | 'dark'): string {
  return scheme === 'light'
    ? mixSrgb(ACCENT_LIGHT.action.fill, SURFACE_LIGHT.level1, USER_BUBBLE_TINT_PCT)
    : mixSrgb(ACCENT_DARK.action.fill, SURFACE_DARK.level1, USER_BUBBLE_TINT_PCT);
}

/**
 * As variáveis de paleta que a folha do SSR realmente USA.
 *
 * Medir a folha inteira dá falso NEGATIVO: o SSR do MUI imprime, no `:root`, a
 * DEFINIÇÃO de todas as variáveis da paleta — `--mui-palette-secondary-main`
 * está sempre lá, mesmo numa árvore que não pinta nada de roxo. O que prova a
 * cor é o CONSUMO (`var(--mui-palette-…)`), e é ele que esta função extrai.
 */
function usedPaletteVars(html: string): string[] {
  return [...styleSheet(html).matchAll(/var\(--mui-palette-([A-Za-z0-9-]+)/g)].map((m) => m[1]);
}

/**
 * A OPACIDADE que o cabeçalho realmente aplica, lida da folha emitida pelo SSR.
 *
 * Sem isto o teste mede o token puro e é CEGO ao truque que derruba o composto:
 * a hora carregava `opacity: 0.8` e o comentário do componente jurava 7,12:1.
 * Lendo a folha, qualquer opacidade que volte a aparecer entra na conta. Vale a
 * MENOR encontrada — é a que manda no pior caso.
 */
function headerOpacity(html: string): number {
  const found = [...styleSheet(html).matchAll(/opacity:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  return found.length === 0 ? 1 : Math.min(...found);
}

/**
 * As VARIÁVEIS de tinta que o cabeçalho realmente emite, por papel.
 *
 * Ler o token do código-fonte do teste (o que se fazia aqui) não prova nada
 * sobre a tela: o MUI 9.3 descarta `color="text.secondary"` como PROP, e o
 * cabeçalho saía com nome e hora na MESMA tinta sem que ninguém visse. O que
 * este helper devolve é o nome da variável CSS declarada pela CLASSE de cada
 * um dos dois elementos — `text-primary`, `text-secondary`, ou nada.
 */
function headerInkVars(html: string): Record<string, string> {
  const regras = new Map<string, string>();
  for (const m of styleSheet(html).matchAll(/\.(css-[a-zA-Z0-9-]+)\s*\{([^{}]*)\}/g)) {
    if (!regras.has(m[1])) regras.set(m[1], m[2]);
  }
  const corDe = (texto: string): string => {
    const el = new RegExp(`<[^>]*class="([^"]*)"[^>]*>${texto}<`).exec(markup(html));
    assert.ok(el, `não achei o elemento de cabeçalho com o texto ${JSON.stringify(texto)}`);
    const cls = /css-[a-zA-Z0-9-]+/.exec(el[1]);
    assert.ok(cls, 'o elemento do cabeçalho não tem classe do emotion');
    const decl = regras.get(cls[0]) ?? '';
    const cor = /(?:^|;)color:var\(--mui-palette-([a-z-]+)\)/.exec(decl);
    assert.ok(
      cor,
      `o elemento de ${JSON.stringify(texto)} não declara cor nenhuma — ele HERDA. ` +
        'Foi assim que o prop descartado passou por esta suíte inteira.',
    );
    return cor[1];
  };
  // O nome do autor e o carimbo de hora, os dois papéis do cabeçalho.
  return { nome: corDe(AUTOR_TUTOR), hora: corDe(HHMM) };
}

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
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
  const bubble = (await import(BUBBLE_MODULE)) as { ChatBubble: typeof ChatBubble };
  ChatBubble = bubble.ChatBubble;
  const surfaces = (await import(SURFACES_MODULE)) as {
    bubbleShellStyle: typeof bubbleShellStyle;
    USER_BUBBLE_TINT_PCT: number;
    TUTOR_AVATAR_SURFACE: string;
  };
  bubbleShellStyle = surfaces.bubbleShellStyle;
  USER_BUBBLE_TINT_PCT = surfaces.USER_BUBBLE_TINT_PCT;
  TUTOR_AVATAR_SURFACE = surfaces.TUTOR_AVATAR_SURFACE;
});

describe('a COR do balão — o que o dono viu de errado no escuro', () => {
  it('o balão do aluno é o acento LAVADO (43% medido na referência), não o acento cheio', () => {
    const shell = bubbleShellStyle(theme, 'user', false);
    assert.equal(USER_BUBBLE_TINT_PCT, 43, 'a fração medida no balão enviado da referência');
    // `theme.vars.*` traz a variável CSS COM fallback literal
    // (`var(--mui-palette-primary-fill, #de351b)`) — daí o `[^)]*`.
    assert.match(
      String(shell.backgroundColor),
      /^color-mix\(in srgb, var\(--mui-palette-primary-fill[^)]*\) 43%, var\(--mui-palette-background-paper[^)]*\)\)$/,
      'o acento CHEIO no fundo do balão é o que gritava por cima do texto',
    );
    assert.equal(
      shell.color,
      theme.vars.palette.text.primary,
      'com o acento lavado a tinta é a NORMAL — nada de onFill',
    );
  });

  it('nenhum balão do tutor carrega o ROXO da família study (era o "brilho roxo")', () => {
    for (const tone of ['tutor', 'reply'] as const) {
      const shell = bubbleShellStyle(theme, tone, false);
      assert.equal(
        shell.backgroundColor,
        theme.vars.palette.background.paper,
        `${tone}: a superfície de leitura, pura`,
      );
      assert.equal(
        String(shell.border).includes('secondary'),
        false,
        `${tone}: o acento study não pode voltar para a borda`,
      );
      assert.equal(String(shell.border), '2px solid transparent', `${tone}: sem borda visível`);
    }
    const tutor = bubbleShellStyle(theme, 'tutor', false);
    const reply = bubbleShellStyle(theme, 'reply', false);
    assert.deepEqual(reply, tutor, 'todo balão do tutor é o MESMO objeto visual');
  });

  it('nenhum tom tem sombra colorida — o balão é chapado, como a referência', () => {
    for (const tone of ['user', 'tutor', 'reply', 'error', 'approved'] as const) {
      const shell = bubbleShellStyle(theme, tone, false);
      assert.equal(shell.boxShadow, '0 0 0 0 transparent', `${tone}: sem brilho`);
    }
  });

  it('o raio é UNIFORME nos quatro cantos (a cauda apontava para o avatar que saiu)', () => {
    for (const tone of ['user', 'tutor', 'reply', 'error', 'approved'] as const) {
      for (const grouped of [false, true]) {
        const radius = String(bubbleShellStyle(theme, tone, grouped).borderRadius);
        assert.equal(radius.includes(' '), false, `${tone}/${grouped}: raio por canto (${radius})`);
      }
    }
  });

  it('erro e aprovação MANTÊM a borda tingida — ali a cor é ESTADO, não enfeite', () => {
    for (const tone of ['error', 'approved'] as const) {
      const shell = bubbleShellStyle(theme, tone, false);
      assert.match(String(shell.border), /^2px solid color-mix\(in srgb, var\(--mui-palette-/);
    }
  });
});

describe('o CONTRASTE do que a cor nova produz (recalculado dos tokens)', () => {
  it('a tinta normal sobre o balão do aluno passa AAA nos dois esquemas', () => {
    const claro = userBubbleHex('light');
    const escuro = userBubbleHex('dark');
    const rClaro = contrastRatio(INK_LIGHT.primary, claro);
    const rEscuro = contrastRatio(INK_DARK.primary, escuro);
    assert.ok(rClaro >= CONTRAST_FLOOR.bodyAAA, `claro ${claro} = ${rClaro.toFixed(2)}:1`);
    assert.ok(rEscuro >= CONTRAST_FLOOR.bodyAAA, `escuro ${escuro} = ${rEscuro.toFixed(2)}:1`);
  });

  it('o balão do aluno fica longe do limiar de red flash (R/(R+G+B) < 0,8)', () => {
    for (const hex of [userBubbleHex('light'), userBubbleHex('dark')]) {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      assert.ok(r / (r + g + b) < 0.8, `${hex} = ${(r / (r + g + b)).toFixed(3)}`);
    }
  });

  it('o cabeçalho é lido na cor COMPOSTA que o componente emite, e passa AAA sobre o nível 0', () => {
    // ESTE É O TESTE QUE FALTAVA. Ele media `contrastRatio(INK.secondary,
    // SURFACE.level2)` — o token PURO contra um painel que já nem existe — e
    // por isso NUNCA via a `opacity: 0.8` que o componente aplicava ao carimbo
    // de hora. O composto real era #746e65 = 4,37:1 no claro: reprovado em AA.
    // Agora a opacidade é LIDA da folha do SSR e entra na conta.
    // NADA de `assert.equal(opacidade, 1)` aqui: isso seria repetir a constante
    // do código, o mesmo vício que invalidava o bloco do tint. A opacidade REAL
    // entra na mistura e quem reprova é a RAZÃO.
    //
    // ─── INTEGRAÇÃO DA ONDA 12: A OUTRA METADE TAMBÉM ERA ASSUMIDA ────────
    // O título dizia "a cor COMPOSTA que o componente emite", mas só a
    // OPACIDADE vinha do SSR: os tokens `ink.primary`/`ink.secondary` eram
    // escritos aqui, na ordem que o autor PRETENDIA. Com isso o teste ficava
    // cego ao defeito que a integração achou — `color="text.secondary"` como
    // PROP do Typography é descartado em silêncio pelo MUI 9.3, e o cabeçalho
    // saía com as DUAS linhas em tinta primária. Medido: com o componente na
    // forma antiga, esta suíte dava 17/17. Agora o TOKEN também é lido do
    // SSR, pela variável CSS que a classe do elemento declara; se a cor não
    // for emitida, não há token para compor e o teste reprova na hora.
    // (A armadilha em si, e a guarda de fonte que impede o retorno, moram em
    // tests/inkPropReachesScreen.test.ts.)
    const html = renderRaw({ message: msg({ ts: TS }), isNew: false });
    const opacidade = headerOpacity(html);
    const emitido = headerInkVars(html);
    for (const [nome, ink, surface] of [
      ['claro', INK_LIGHT, SURFACE_LIGHT],
      ['escuro', INK_DARK, SURFACE_DARK],
    ] as const) {
      const porVariavel: Record<string, string> = {
        'text-primary': ink.primary,
        'text-secondary': ink.secondary,
      };
      // A caixa da conversa morreu: o cabeçalho está sobre o NÍVEL 0.
      for (const [papel, variavel] of Object.entries(emitido)) {
        const token = porVariavel[variavel];
        assert.ok(
          token,
          `${nome}/${papel}: o cabeçalho emitiu --mui-palette-${variavel}, que não ` +
            'é tinta da rampa — a hierarquia do cabeçalho é primária + secundária',
        );
        const composto = mixSrgb(token, surface.level0, opacidade * 100);
        const razao = contrastRatio(composto, surface.level0);
        assert.ok(
          razao >= CONTRAST_FLOOR.bodyAAA,
          `${nome}/${papel}: ${token} a ${(opacidade * 100).toFixed(0)}% = ${composto} sobre ` +
            `${surface.level0} = ${razao.toFixed(2)}:1 (piso ${CONTRAST_FLOOR.bodyAAA}:1)`,
        );
      }
    }
    // E as duas linhas têm de ser tintas DIFERENTES: é a diferença que o olho
    // lê como hierarquia, e era ela que o prop descartado apagava.
    assert.notEqual(
      emitido.nome,
      emitido.hora,
      'nome e hora na mesma tinta = cabeçalho chapado (foi o que o prop no-op fez)',
    );
  });

  it('o balão continua se distinguindo do fundo agora que ele é o NÍVEL 0, não o painel', () => {
    // A caixa da conversa virou transparente: o balão do tutor (nível 1) e o do
    // aluno (tint) estão sobre o nível 0. Nenhum piso normativo se aplica a
    // superfície-contra-superfície, então o que esta guarda trava é o SINAL: os
    // dois têm que ser DIFERENTES do fundo, e o do aluno — o único colorido da
    // tela, como na referência — tem que ser o mais visível dos dois.
    for (const [nome, surface, bubble] of [
      ['claro', SURFACE_LIGHT, userBubbleHex('light')],
      ['escuro', SURFACE_DARK, userBubbleHex('dark')],
    ] as const) {
      const tutor = contrastRatio(surface.level1, surface.level0);
      const aluno = contrastRatio(bubble, surface.level0);
      assert.ok(tutor > 1, `${nome}: o balão do tutor sumiu no fundo (${tutor.toFixed(2)}:1)`);
      assert.ok(
        aluno > tutor,
        `${nome}: aluno ${aluno.toFixed(2)}:1 não pode ficar abaixo do tutor ${tutor.toFixed(2)}:1`,
      );
      // E a leitura DENTRO do balão do tutor continua sendo superfície de
      // leitura de verdade (17,90:1 claro / 15,11:1 escuro).
      const ink = nome === 'claro' ? INK_LIGHT.primary : INK_DARK.primary;
      assert.ok(
        contrastRatio(ink, surface.level1) >= CONTRAST_FLOOR.bodyAAA,
        `${nome}: a prosa do tutor caiu abaixo de AAA`,
      );
    }
  });
});

describe('a ESTRUTURA renderizada — os dois defeitos que o dono fotografou', () => {
  it('a hora está FORA do balão (era o carimbo dentro, empurrando o texto)', () => {
    const html = render({ message: msg({ ts: TS }), isNew: false });
    assert.ok(html.includes(HHMM), 'a hora continua na tela');
    assert.equal(
      bubbleInnerHtml(html).includes(HHMM),
      false,
      'a hora não pode voltar para dentro do balão',
    );
  });

  it('o avatar está no CABEÇALHO (avatar → nome → hora → balão), não numa coluna ao lado', () => {
    const message = msg({ ts: TS });
    const html = render({ message, isNew: false });
    const avatar = html.indexOf('role="img"');
    const nome = html.indexOf('Tutor');
    const hora = html.indexOf(HHMM);
    const conteudo = html.indexOf(message.content);
    assert.notEqual(avatar, -1, 'o avatar continua existindo (é a atribuição de quem fala)');
    // A ordem é a prova de que os três viram UMA linha de cabeçalho ACIMA do
    // balão. Com o avatar em coluna lateral e a hora dentro do balão, o
    // carimbo vinha DEPOIS do texto da mensagem.
    assert.ok(avatar < nome, `avatar (${avatar}) antes do nome (${nome})`);
    assert.ok(nome < hora, `nome (${nome}) antes da hora (${hora})`);
    assert.ok(hora < conteudo, `hora (${hora}) antes do texto da mensagem (${conteudo})`);
    assert.equal(
      bubbleInnerHtml(html).includes('role="img"'),
      false,
      'e o avatar não está dentro do balão',
    );
  });

  it('o avatar do TUTOR é neutro — o roxo da família study não sobrevive em lugar nenhum', () => {
    // A varredura do DOM da revisão ainda achava rgb(164,91,228) (#a45be4, o
    // `fill` escuro do `study`) no fundo do MuiAvatar do "Tutor": a onda que
    // matou o roxo da borda da `reply` não chegou até aqui, e este avatar
    // aparece em TODA bolha do tutor. Ele passa a ser o topo da rampa NEUTRA.
    assert.equal(
      typeof TUTOR_AVATAR_SURFACE,
      'string',
      'chatSurfaces precisa exportar TUTOR_AVATAR_SURFACE (o degrau neutro do avatar)',
    );
    const tutor = usedPaletteVars(renderRaw({ message: msg({ ts: TS }), isNew: false }));
    assert.ok(
      tutor.includes(String(TUTOR_AVATAR_SURFACE).replace('.', '-')),
      `o avatar do tutor precisa vir de ${TUTOR_AVATAR_SURFACE} (usadas: ${tutor.join(', ')})`,
    );
    for (const roxo of ['secondary-main', 'secondary-contrastText', 'study-main', 'study-fill']) {
      assert.equal(
        tutor.includes(roxo),
        false,
        `a bolha do tutor ainda pinta ${roxo} (a família study é o roxo)`,
      );
    }
    // E o avatar do ALUNO continua no acento `action`, que é a MESMA família do
    // tint do balão dele — a única cor de identidade da tela, como na
    // referência (o único elemento colorido da conversa é o balão enviado).
    const aluno = usedPaletteVars(
      renderRaw({
        message: { role: 'user', content: 'minha resposta', kind: 'message', ts: TS },
        isNew: false,
      }),
    );
    assert.ok(aluno.includes('primary-main'), 'o aluno continua no acento action');
  });

  it('o ícone dentro de cada avatar é legível, e o disco do tutor se separa do fundo', () => {
    // Ícone sobre o disco (piso AA, é um objeto gráfico que carrega sentido) e
    // disco sobre o NÍVEL 0 — que é o fundo agora que a caixa da conversa
    // morreu. O nível 4 é o topo da rampa: é o degrau que mais se afasta do
    // fundo sem tirar nada da superfície de leitura.
    for (const [nome, ink, surface, accent] of [
      ['claro', INK_LIGHT, SURFACE_LIGHT, ACCENT_LIGHT],
      ['escuro', INK_DARK, SURFACE_DARK, ACCENT_DARK],
    ] as const) {
      const tutorIcon = contrastRatio(ink.primary, surface.level4);
      const alunoIcon = contrastRatio(accent.action.onFill, accent.action.fill);
      assert.ok(tutorIcon >= CONTRAST_FLOOR.bodyAA, `${nome}: ícone do tutor ${tutorIcon}`);
      assert.ok(alunoIcon >= CONTRAST_FLOOR.bodyAA, `${nome}: ícone do aluno ${alunoIcon}`);
      const disco = contrastRatio(surface.level4, surface.level0);
      assert.ok(
        disco > contrastRatio(surface.level1, surface.level0),
        `${nome}: o disco do tutor (${disco.toFixed(2)}:1) tem que se destacar mais que o balão`,
      );
    }
  });

  it('numa CONTINUAÇÃO do mesmo minuto some o cabeçalho inteiro (avatar, nome e hora)', () => {
    const previous = msg({ ts: TS });
    const html = render({ message: msg({ ts: TS + 1000 }), previous, isNew: false });
    assert.equal(html.includes('role="img"'), false, 'sem avatar repetido');
    assert.equal(html.includes(HHMM), false, 'sem hora repetida');
  });

  it('o balão do aluno ancora à DIREITA e o do tutor à ESQUERDA', () => {
    // O alinhamento vem de `sx` — ou seja, de uma CLASSE do emotion, e não do
    // style inline. Por isso aqui se mede a folha emitida: o SSR do MUI só
    // escreve as regras que a árvore renderizada de fato usa, então a presença
    // de uma e a AUSÊNCIA da outra são o sinal.
    const aluno = styleSheet(
      renderRaw({
        message: { role: 'user', content: 'minha resposta', kind: 'message', ts: TS },
        isNew: false,
      }),
    );
    const tutor = styleSheet(renderRaw({ message: msg({ ts: TS }), isNew: false }));
    assert.ok(aluno.includes('justify-content:flex-end'), 'o aluno ancora à direita');
    assert.equal(aluno.includes('justify-content:flex-start'), false, 'e só à direita');
    assert.ok(tutor.includes('justify-content:flex-start'), 'o tutor ancora à esquerda');
    assert.equal(tutor.includes('justify-content:flex-end'), false, 'e só à esquerda');
  });
});

describe('o que NÃO pode regredir', () => {
  const source = readFileSync(resolve(APP, 'src/components/chat/ChatBubble.tsx'), 'utf8');

  it('o movimento tem caminho SEM overshoot (prefers-reduced-motion)', () => {
    assert.ok(source.includes('useReducedMotion'), 'o hook do motion está lá');
    assert.match(
      source,
      /whileHover=\{isReview && wantsMotion \?/,
      'o deslocamento do hover é condicionado à redução de movimento',
    );
    assert.match(
      source,
      /isApprovedReview && wantsMotion/,
      'o brilho de aprovação também respeita a redução',
    );
  });

  it('a digitação continua passando por TypewriterText + SegmentedMarkdown', () => {
    // A prosa em velocidade de LEITURA e o código revelado já formatado moram
    // nesses dois módulos (golden master em tests/lessonTypewriterReadingSpeed
    // e tests/typewriterSegments). O que esta guarda impede é a bolha voltar a
    // fatiar markdown cru por conta própria.
    assert.ok(source.includes('<TypewriterText'), 'o relógio continua sendo o TypewriterText');
    assert.ok(source.includes('<SegmentedMarkdown'), 'quem desenha continua sendo o segmentado');
    assert.ok(source.includes('skip={skip}'), 'pular a digitação continua chegando ao relógio');
    assert.ok(source.includes('instant={isErrorReview}'), 'a bolha de erro continua instantânea');
  });
});
