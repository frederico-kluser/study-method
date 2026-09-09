/**
 * tests/inkPropReachesScreen.test.ts — A TINTA QUE O AUTOR PEDIU CHEGA À TELA?
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO, ACHADO NA INTEGRAÇÃO DA ONDA 12 E MEDIDO AQUI
 * ══════════════════════════════════════════════════════════════════════════
 * Em @mui/material 9.3, `color` como PROP do `<Typography>` só funciona com
 * um nome de FAMÍLIA (`color="error"`, `color="primary"`, e o legado
 * `color="textSecondary"`). Com um CAMINHO de paleta — `color="text.secondary"`,
 * `color="primary.main"` — o valor é descartado em SILÊNCIO: a classe emitida
 * sai sem declaração de `color` nenhuma, e o elemento herda a tinta de quem
 * está acima. Sem erro, sem aviso, sem tipo reprovando.
 *
 * A base tinha 67 desses, em 23 arquivos, e três deles eram ENTREGAS DESTA
 * ONDA:
 *
 *   - o cabeçalho da bolha do chat foi reorganizado para o NOME ficar em tinta
 *     primária e a HORA em secundária (o conserto que substituiu a `opacity:
 *     0.8` reprovada em AA). Os dois eram prop: a tela desenhava as DUAS em
 *     tinta primária, e a hierarquia que a onda entregou não existia;
 *   - o overline "Quiz rápido" e o rebaixamento da afirmação no card do quiz;
 *   - o rodapé e o aviso do overlay.
 *
 * E o pior: os testes da onda passavam. Eles mediam `contrastRatio(INK.secondary,
 * SURFACE.level0)` — o TOKEN que o autor pediu — em vez da cor que o componente
 * EMITE. Um teste que assume a tinta não pode ver uma tinta que não chegou.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO TRAVA
 * ══════════════════════════════════════════════════════════════════════════
 *  1. a MEDIDA da armadilha (prop com ponto = sem cor; `sx` = cor). Ela é viva:
 *     se um MUI futuro passar a honrar o prop, este teste é quem avisa — e aí
 *     a guarda 2 vira preferência de estilo em vez de correção;
 *  2. a GUARDA DE FONTE: nenhum `.tsx` de src/ volta a escrever o prop com
 *     ponto. É ela que impede o defeito de renascer em arquivo novo;
 *  3. o CASO CONCRETO desta onda, medido no componente REAL: o cabeçalho da
 *     bolha emite DUAS tintas DIFERENTES, e cada uma é a que o autor pediu.
 *
 * Reprodução: `bash tools/t.sh tests/inkPropReachesScreen.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import { formatChatTime, type TutorChatMessage } from '../src/lib/trackLessonState';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..');
const SRC = resolve(APP, 'src');

const BUBBLE_MODULE = new URL('../src/components/chat/ChatBubble.tsx', import.meta.url).href;
const TYPING_MODULE = new URL('../src/components/chat/TypingIndicator.tsx', import.meta.url).href;

interface BubbleProps {
  message: TutorChatMessage;
  isNew: boolean;
  previous?: TutorChatMessage;
}
let ChatBubble: ComponentType<BubbleProps>;
let TypingIndicator: ComponentType<Record<string, never>>;

before(async () => {
  // Os textos REAIS de pt-BR: é por eles que os elementos são achados no HTML.
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
  const mod = (await import(BUBBLE_MODULE)) as { ChatBubble: typeof ChatBubble };
  ChatBubble = mod.ChatBubble;
  const typing = (await import(TYPING_MODULE)) as { TypingIndicator: typeof TypingIndicator };
  TypingIndicator = typing.TypingIndicator;
});

/* ═══════════════════════════════════════════════════════════════════════════
 * FERRAMENTA: da CLASSE aplicada à declaração de `color` que ela carrega
 * ═══════════════════════════════════════════════════════════════════════════
 * Medir cor no HTML bruto dá falso positivo garantido: o emotion imprime a
 * folha INTEIRA, com regras de componentes que ninguém montou. O que vale é a
 * regra da classe que o elemento REALMENTE tem. */

/** Mapa `css-xxx` → corpo da regra, ignorando o `:root`/`.dark` de variáveis. */
function rulesByClass(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/\.(css-[a-zA-Z0-9-]+)\s*\{([^{}]*)\}/g)) {
    // A PRIMEIRA regra de cada classe é a do próprio elemento; regras de
    // estado (`.Mui-disabled`, `:where(.dark)`) vêm com seletor composto e o
    // regex acima já as separa por classe capturada.
    if (!out.has(m[1])) out.set(m[1], m[2]);
  }
  return out;
}

/** A declaração `color:` do elemento cujo texto é `text`. `null` = não declara
 *  cor nenhuma (herda) — que é EXATAMENTE o sintoma do prop descartado. */
function emittedColorOf(html: string, text: string): string | null {
  const rules = rulesByClass(html);
  const el = new RegExp(`<[^>]*class="([^"]*)"[^>]*>${text}<`).exec(html);
  assert.ok(el, `não achei na marcação um elemento com o texto ${JSON.stringify(text)}`);
  const cls = /css-[a-zA-Z0-9-]+/.exec(el[1]);
  assert.ok(cls, `o elemento de ${JSON.stringify(text)} não tem classe do emotion`);
  const decl = rules.get(cls[0]) ?? '';
  return (/(?:^|;)color:([^;]+)/.exec(decl) ?? [null, null])[1];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. A ARMADILHA, MEDIDA
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('1. `color` como PROP: o que o MUI 9.3 honra e o que ele descarta', () => {
  function renderTypography(props: Record<string, unknown>, texto: string): string {
    return renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme },
        createElement(Typography, { variant: 'caption', ...props } as never, texto),
      ),
    );
  }

  it('MEDIDO: o prop com CAMINHO de paleta não emite `color` nenhum', () => {
    for (const caminho of ['text.secondary', 'text.primary', 'primary.main', 'error.main']) {
      const html = renderTypography({ color: caminho }, 'X');
      assert.equal(
        emittedColorOf(html, 'X'),
        null,
        `${caminho} como PROP emitiu cor — o MUI mudou de comportamento e a ` +
          'guarda de fonte deste arquivo deixou de ser correção para virar estilo',
      );
    }
  });

  it('MEDIDO: `sx={{ color: … }}` com o MESMO caminho emite a variável do tema', () => {
    for (const [caminho, variavel] of [
      ['text.secondary', 'var(--mui-palette-text-secondary)'],
      ['text.primary', 'var(--mui-palette-text-primary)'],
      ['primary.main', 'var(--mui-palette-primary-main)'],
    ] as const) {
      const html = renderTypography({ sx: { color: caminho } }, 'X');
      assert.equal(emittedColorOf(html, 'X'), variavel, `sx com ${caminho}`);
    }
  });

  it('MEDIDO: o prop com nome de FAMÍLIA continua funcionando (por isso ninguém notou)', () => {
    // É esta metade que fazia o defeito passar despercebido em revisão: o prop
    // "funciona" — só não com a forma que a base escreveu 67 vezes.
    const html = renderTypography({ color: 'error' }, 'X');
    assert.equal(emittedColorOf(html, 'X'), 'var(--mui-palette-error-main)');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. A GUARDA DE FONTE
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('2. nenhum .tsx de src/ escreve `color="<família>.<tom>"` como PROP', () => {
  function tsxFiles(dir: string, acc: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      if (statSync(p).isDirectory()) tsxFiles(p, acc);
      else if (p.endsWith('.tsx')) acc.push(p);
    }
    return acc;
  }

  /** Sem comentários: contar o defeito no comentário é o estilo desta base, e
   *  vários arquivos citam a forma errada de propósito, para explicá-la. */
  function codeOf(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('a varredura passa em TODOS os .tsx (o conserto foi de base, não de arquivo)', () => {
    const culpados: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const code = codeOf(readFileSync(file, 'utf8'));
      for (const m of code.matchAll(/\scolor="([a-zA-Z]+\.[a-zA-Z]+)"/g)) {
        culpados.push(`${relative(APP, file)} → color="${m[1]}"`);
      }
    }
    assert.deepEqual(
      culpados,
      [],
      'prop com caminho de paleta é descartado em silêncio (ver o bloco 1): ' +
        `use sx={{ color: '…' }}.\n${culpados.join('\n')}`,
    );
  });

  it('e a varredura ENXERGA o defeito — ela não é um regex que nunca casa', () => {
    // Um teste de ausência que nunca casaria com nada seria verde para sempre.
    // Este monta o texto culpado à mão e exige que o mesmo regex o pegue.
    const falso = `      <Typography variant="caption" color="text.secondary">\n`;
    assert.match(falso, /\scolor="([a-zA-Z]+\.[a-zA-Z]+)"/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. O CASO CONCRETO: a hierarquia do cabeçalho da bolha EXISTE na tela
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('3. o cabeçalho da bolha emite DUAS tintas, e são as pedidas', () => {
  const TS = Date.UTC(2026, 0, 1, 12, 34, 0);
  const HHMM = formatChatTime(TS, 'pt-BR');

  const MSG: TutorChatMessage = {
    role: 'assistant',
    // Sem dígitos: o carimbo de hora não pode ser achado por acidente no texto.
    content: 'a linha que aparece na tela',
    kind: 'message',
    ts: TS,
  };

  it('o NOME sai em tinta primária e a HORA em secundária — declarações distintas', () => {
    const html = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme },
        createElement(ChatBubble, { message: MSG, isNew: false }),
      ),
    );
    const hora = emittedColorOf(html, HHMM);
    assert.equal(
      hora,
      'var(--mui-palette-text-secondary)',
      'a HORA é o elemento rebaixado do cabeçalho — sem cor declarada ela ' +
        'herdava a tinta primária e a hierarquia da onda não chegava à tela',
    );
    // O NOME: qualquer que seja o rótulo do autor, ele é o irmão anterior. O
    // que importa não é o valor em si, e sim que ele seja DIFERENTE da hora —
    // é a diferença que o olho lê como hierarquia.
    const nome = /<span[^>]*class="[^"]*"[^>]*>([^<>]+)<\/span>\s*<span[^>]*>(?:[^<]*)<\/span>/.exec(
      html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ''),
    );
    assert.ok(nome, 'o cabeçalho tem nome e hora lado a lado');
    const corNome = emittedColorOf(html, nome[1]);
    assert.equal(corNome, 'var(--mui-palette-text-primary)', 'o NOME é a tinta cheia');
    assert.notEqual(corNome, hora, 'sem DUAS tintas não há hierarquia — só um cabeçalho chapado');
  });

  it('o "digitando" usa a MESMA tinta de autor que a bolha (o cabeçalho é um só)', () => {
    // O TypingIndicator declara, em comentário, ser "o MESMO cabeçalho da bolha
    // do tutor". Ele era `text.secondary` e a bolha `text.primary` — e a
    // divergência ficou invisível porque AS DUAS eram prop descartado: o MUI
    // apagava as duas e os dois nomes saíam em tinta primária, iguais por
    // acidente. Converter para `sx` faria a divergência aparecer na tela pela
    // primeira vez. Esta asserção é o que impede o cabeçalho de se partir em
    // dois de novo: ela compara as tintas EMITIDAS, não as pretendidas.
    const nome = ptBR.lesson.tutorName;
    const bolha = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme },
        createElement(ChatBubble, { message: MSG, isNew: false }),
      ),
    );
    const digitando = renderToStaticMarkup(
      createElement(ThemeProvider, { theme }, createElement(TypingIndicator, {})),
    );
    assert.equal(
      emittedColorOf(digitando, nome),
      emittedColorOf(bolha, nome),
      'o nome do tutor tem uma tinta só, esteja ele acima de uma bolha ou dos três pontos',
    );
  });
});
