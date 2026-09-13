/**
 * tests/lessonChatLayout.test.ts — o LAYOUT do chat da aula: UM eixo só, a
 * conversa SEM CAIXA e a barra de entrada no molde da referência.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ESTE ARQUIVO TRAVA (medido na tela, pelo dono)
 * ══════════════════════════════════════════════════════════════════════════
 * O painel de mensagens aparecia CENTRALIZADO e a linha de entrada ENCOSTADA
 * NA ESQUERDA — com a MESMA largura declarada nos dois. A causa não era a
 * largura: era ESPECIFICIDADE. `<Stack spacing={1.5}>` (sem `useFlexGap`)
 * emite, para os próprios filhos,
 *
 *     .css-STACK > :not(style):not(style) { margin: 0; }
 *
 * cuja especificidade é (0,1,2) — uma classe mais dois seletores de tipo
 * dentro dos `:not()` — contra os (0,1,0) da classe que o `sx` do filho gera.
 * A regra do PAI vence, `margin: 0` sobrescreve o `margin-left/right: auto`
 * do filho, e o `mx: 'auto'` vira decoração morta. O painel de mensagens
 * escapava porque mora dentro de um `<Box>` comum, não de um Stack: os dois
 * eixos — o de LEITURA e o de ESCRITA — deixavam de bater.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ONDA12 — POR QUE TRÊS TESTES DESTE ARQUIVO FORAM REESCRITOS
 * ══════════════════════════════════════════════════════════════════════════
 * A revisão adversarial provou, com MUTANTE, que três testes daqui eram
 * VACUOS — passavam contra código quebrado:
 *
 *   a) "enviar vazio é impossível" procurava a substring `disabled` no HTML
 *      INTEIRO do SSR. O emotion SEMPRE emite `.Mui-disabled{…}` na folha:
 *      a condição era verdadeira independentemente do botão. Trocar
 *      `disabled={disabled || !draft.trim()}` por `disabled={disabled}`
 *      deixava a suíte verde. Agora a asserção lê a TAG DO BOTÃO — e exige
 *      também o caso POSITIVO (com pergunta escrita, o enviar está VIVO), que
 *      é o único que mata aquele mutante;
 *
 *   b) "quem centraliza a coluna é o eixo NOMEADO" só exigia que a STRING
 *      `const LESSON_COLUMN_SX = {…}` EXISTISSE. Apagar `...LESSON_COLUMN_SX`
 *      do container raiz — que remove de uma vez a largura máxima E a
 *      centralização, o defeito-título desta rodada — não reprovava nada.
 *      Agora o teste ANCORA NO CONTAINER: acha o `return (` da aula ativa,
 *      recorta a TAG DE ABERTURA da raiz e cobra o eixo ALI, provando de
 *      quebra que o nó com `role="log"` e o `<LessonComposer>` são
 *      DESCENDENTES dessa mesma raiz (é o que "um eixo só" quer dizer);
 *
 *   c) "o Stack da coluna usa useFlexGap" perguntava se ALGUM `<Stack>` do
 *      arquivo tinha `useFlexGap` — e o arquivo tem outros. Tirar o do Stack
 *      DA COLUNA não reprovava nada. Agora o teste identifica o Stack pela
 *      POSIÇÃO (primeiro filho da raiz do eixo) e cobra o `useFlexGap` NELE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ONDA-LARGURA-LIVRE — O EIXO CONTINUA UM SÓ, MAS PERDEU O TETO
 * ══════════════════════════════════════════════════════════════════════════
 * O dono, sobre a aula: "o texto da aula, que está dentro de uma limitação de
 * width, não deve ter mais essa limitação — o sidebar define o limite da área
 * de texto simplesmente pelo seu tamanho". O eixo era `maxWidth:
 * CHAT_COLUMN_MAX_PX` (960) + `mx: 'auto'`: em janela larga, arrastar a
 * divisória do sidebar só mexia na margem vazia. O contrato do bloco 2 mudou
 * de "a coluna tem um teto com nome e motivo" para o INVERSO, sem afrouxar o
 * resto: o eixo ainda é UM objeto com nome, aplicado UMA vez na raiz; ele
 * agora PREENCHE (`width: '100%'`, `minWidth: 0`) e é proibido de ter
 * `maxWidth` ou `mx`; a constante do teto não pode existir nem no código nem
 * no módulo; e nenhum filho da coluna declara teto próprio. O teto do BALÃO
 * (`min(78%, 80ch)` → `78%`) é medido no CSS renderizado em
 * tests/chatBubbleWidth.test.ts.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMO SE PROVA ISSO SEM jsdom
 * ══════════════════════════════════════════════════════════════════════════
 * Esta base não tem jsdom (a técnica dela é `react-dom/server` — precedentes
 * `tests/quizOverlayRender.test.ts` e `tests/typewriterSegments.test.ts`), e
 * SSR não calcula cascata. Então a prova vem em camadas, e cada uma faz só o
 * que consegue fazer honestamente:
 *
 *   BLOCO 1 — A FÍSICA, MEDIDA. Renderiza MUI de verdade e LÊ o CSS que o
 *     emotion emite: mostra a regra `margin: 0` do Stack existindo, compara a
 *     especificidade dela com a da classe do filho, e mostra `useFlexGap`
 *     trocando margem por `gap` (a armadilha deixa de existir). Isto não é
 *     folclore de code review: é o CSS que roda.
 *
 *   BLOCO 2 — A ÁRVORE, ANCORADA. Lê `LessonView.tsx` como TEXTO (sem
 *     comentários) — mas não procura strings soltas: recorta a árvore JSX da
 *     aula ativa a partir do `return (`, e cobra o eixo na TAG DE ABERTURA da
 *     raiz, o `useFlexGap` no PRIMEIRO FILHO dela, e a presença do painel e
 *     do composer DENTRO desse recorte.
 *     O QUE ESTE BLOCO AINDA NÃO COBRE: ele não vê pixel. Se alguém trocar
 *     o CONTEÚDO de `LESSON_COLUMN_SX` (mantendo o nome), o espalhamento na
 *     raiz continua passando — por isso o bloco 2 também exige a FORMA do
 *     objeto (desde a ONDA-LARGURA-LIVRE: `width: '100%'` + `minWidth: 0`,
 *     sem `maxWidth` e sem `mx`) e RENDERIZA o objeto para ler o CSS emitido.
 *
 *   BLOCO 3 — A BARRA DE ENTRADA, RENDERIZADA. `LessonComposer` é um
 *     componente de APRESENTAÇÃO exportado pela própria view (a view o usa;
 *     não é uma cópia para teste), então aqui não há texto nenhum: monta-se o
 *     componente REAL com o tema REAL e mede-se o HTML e o CSS aplicados —
 *     microfone FORA do campo, campo pílula ocupando o resto da linha, enviar
 *     DENTRO na borda direita, alvos de toque ≥ 44px, o `disabled` medido NO
 *     ELEMENTO e as paradas de tab que o framer inventa.
 *
 *   BLOCO 4 — A CONVERSA SEM CAIXA, RENDERIZADA. O estilo do painel saiu do
 *     JSX e virou `lessonLogSx(theme)`, exportada: dá para montá-la num `Box`
 *     e LER o CSS emitido — nível 0, sem raio, sem padding, ancorada embaixo.
 *
 * Reprodução: `bash tools/t.sh tests/lessonChatLayout.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { Box, Stack } from '@mui/material';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW_PATH = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
const VIEW_SRC = readFileSync(VIEW_PATH, 'utf8');
const VIEW_MODULE = new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).href;

/** Fonte sem comentários — só o código que realmente roda (técnica dos
 *  precedentes lessonQuizVisual / quizOverlayWiring). */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const VIEW = codeOf(VIEW_SRC);

/* ═══════════════════════════════════════════════════════════════════════════
 * Ferramentas de medição do CSS que o emotion emite no SSR
 * ═══════════════════════════════════════════════════════════════════════════ */

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

/**
 * Especificidade (classes, tipos) de um seletor SIMPLES do emotion. Cobre
 * exatamente as duas formas que o MUI produz aqui: `.css-x` e
 * `.css-x>:not(style):not(style)`. `:not(<tipo>)` conta como o seletor de
 * tipo que ele carrega dentro (CSS Selectors 4, §16).
 */
function specificity(selector: string): [number, number] {
  const classes = (selector.match(/\.[A-Za-z0-9_-]+/g) ?? []).length;
  const types = (selector.match(/:not\(([A-Za-z][A-Za-z0-9-]*)\)/g) ?? []).length;
  return [classes, types];
}

function wins(a: [number, number], b: [number, number]): boolean {
  return a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1];
}

/**
 * A TAG DE ABERTURA do elemento que carrega `marker` no HTML.
 *
 * Percorre TODAS as ocorrências e devolve a primeira que está numa tag de
 * elemento com classe do emotion. Os dois descartes são reais e conhecidos:
 * (a) nomes de classe do MUI aparecem também DENTRO das folhas `<style>`, e
 * (b) o Tooltip clona o filho e copia o `title` para um `aria-label` num
 * embrulho `class=""` — o marcador casaria com o embrulho, não com o botão
 * que se quer medir.
 */
function tagOfElementWith(html: string, marker: string): string {
  let at = html.indexOf(marker);
  while (at !== -1) {
    const open = html.lastIndexOf('<', at);
    const tag = html.slice(open, html.indexOf('>', at) + 1);
    const cls = /class="([^"]*)"/.exec(tag);
    const emotion = cls?.[1].split(/\s+/).find((c) => c.startsWith('css-'));
    if (!tag.startsWith('<style') && emotion !== undefined) return tag;
    at = html.indexOf(marker, at + 1);
  }
  assert.fail(`nenhum elemento com ${marker} e classe do emotion foi renderizado`);
}

/** A classe do emotion aplicada ao elemento que carrega `marker`. */
function classOfElementWith(html: string, marker: string): string {
  const cls = /class="([^"]*)"/.exec(tagOfElementWith(html, marker));
  return (cls?.[1].split(/\s+/).find((c) => c.startsWith('css-')) ?? '') as string;
}

/** O corpo da regra da classe (todas as declarações, concatenadas). */
function cssOfClass(html: string, cls: string): string {
  return rulesOf(html)
    .filter((r) => r.selector === `.${cls}`)
    .map((r) => r.body)
    .join(';');
}

/**
 * O atributo booleano `disabled` REALMENTE presente nesta tag.
 *
 * `\sdisabled=""` e não `includes('disabled')`: a lista de classes do MUI
 * carrega `Mui-disabled` (com hífen antes, nunca espaço) e a folha de estilo
 * carrega `.Mui-disabled{…}` — foi exatamente essa confusão que deixou o
 * teste antigo verde contra um botão sempre habilitado.
 */
function isDisabled(tag: string): boolean {
  return /\sdisabled=""/.test(tag);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 1 — a física: o que o Stack do MUI faz com a margem dos filhos
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('1. a armadilha do <Stack spacing> — medida no CSS que o MUI emite', () => {
  const child = { maxWidth: 900, width: '100%', mx: 'auto' } as const;

  it('sem useFlexGap o Stack zera a margem dos filhos com uma regra MAIS específica que a do filho', () => {
    const html = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme },
        createElement(Stack, { spacing: 1.5 }, createElement(Box, { sx: child, id: 'filho' })),
      ),
    );
    const clobber = rulesOf(html).find(
      (r) => r.selector.includes(':not(style):not(style)') && /(^|;)\s*margin:\s*0/.test(r.body),
    );
    assert.ok(clobber, 'o Stack emite a regra `> :not(style):not(style) { margin: 0 }`');

    const filho = classOfElementWith(html, 'id="filho"');
    assert.match(
      cssOfClass(html, filho),
      /margin-left:auto/,
      'o filho DECLARA a centralização (mx: auto)',
    );
    assert.ok(
      wins(specificity(clobber.selector), specificity(`.${filho}`)),
      `a regra do Stack (${clobber.selector}) precisa vencer a do filho — é isso que ` +
        'apaga o mx:auto e joga a linha de entrada para a esquerda',
    );
  });

  it('com useFlexGap a margem sai de cena e entra `gap` — a armadilha deixa de existir', () => {
    const html = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme },
        createElement(
          Stack,
          { spacing: 1.5, useFlexGap: true },
          createElement(Box, { sx: child, id: 'filho' }),
        ),
      ),
    );
    const clobber = rulesOf(html).find(
      (r) => r.selector.includes(':not(style):not(style)') && /(^|;)\s*margin:\s*0/.test(r.body),
    );
    assert.equal(clobber, undefined, 'nenhuma regra do Stack toca na margem dos filhos');
    assert.ok(
      rulesOf(html).some((r) => /gap:/.test(r.body)),
      'o espaçamento passa a ser `gap` (propriedade do CONTAINER, não do filho)',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 2 — a ÁRVORE da aula ativa: UM eixo, aplicado na RAIZ
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Recorta a árvore JSX da AULA ATIVA a partir do `return (` que a devolve.
 *
 * Como se acha: o painel de mensagens (`role="log"`) só existe na aula ativa,
 * então o `return (` imediatamente ANTES dele é o dela (os estados de saída
 * antecipada — carregando/erro/seletor — voltam antes). O fim é a primeira
 * linha que começa com `}` na coluna 0: o fechamento da função.
 *
 *   rootTag — a tag de ABERTURA da raiz (até o primeiro `>`, que é o que a
 *             fecha: nenhum prop da raiz contém `>`, e o teste cobra isso ao
 *             exigir que ela seja um `<Box` com `sx={{`);
 *   tree    — a árvore inteira. Tudo que estiver aqui dentro é DESCENDENTE da
 *             raiz — é assim que se prova "um eixo só" sem DOM.
 */
function activeLessonTree(): { rootTag: string; tree: string; firstChildTag: string } {
  const logAt = VIEW.indexOf('role="log"');
  assert.notEqual(logAt, -1, 'o painel de mensagens (role="log") precisa existir');
  const returnAt = VIEW.lastIndexOf('return (', logAt);
  assert.notEqual(returnAt, -1, 'a aula ativa precisa ser devolvida por um `return (`');
  const rest = VIEW.slice(returnAt);
  const rootTag = rest.slice(0, rest.indexOf('>') + 1);
  const endOfFn = rest.search(/\n\}/);
  const tree = rest.slice(0, endOfFn === -1 ? rest.length : endOfFn);
  const after = tree.slice(rootTag.length);
  const firstChildTag = after.slice(0, after.indexOf('>') + 1);
  return { rootTag, tree, firstChildTag };
}

/**
 * O Stack DA COLUNA inteiro — da tag de abertura (o primeiro filho da raiz)
 * ao `</Stack>` que o fecha, recortado contando aberturas e fechamentos.
 *
 * É aqui dentro que moram painel de mensagens, avisos, ação e entrada, e é
 * aqui que nenhum teto de largura pode reaparecer. O diálogo de Fontes e o
 * popover de Desafios ficam FORA de propósito: são IRMÃOS do Stack
 * (superfícies flutuantes, em portal) com medida própria — não são a coluna de
 * leitura. O cabeçalho da aula também não mora aqui: a LessonView o publica
 * por portal no sidebar do shell, IRMÃO fora do Stack como o Dialog e o
 * Popover (tests/lessonSidebarWiring.test.ts cobra essa posição). O recorte
 * se prova certo por dentro (contém o log e o composer) e por fora (não
 * engoliu nenhuma das duas superfícies flutuantes).
 */
function columnStack(): string {
  const { tree, rootTag } = activeLessonTree();
  const start = tree.indexOf('<Stack', rootTag.length);
  assert.notEqual(start, -1, 'a coluna é um <Stack> dentro da raiz');
  const token = /<Stack\b|<\/Stack>/g;
  token.lastIndex = start;
  let depth = 0;
  for (let m = token.exec(tree); m !== null; m = token.exec(tree)) {
    depth += m[0] === '</Stack>' ? -1 : 1;
    if (depth === 0) {
      const column = tree.slice(start, m.index + m[0].length);
      assert.ok(
        column.includes('role="log"') && column.includes('<LessonComposer'),
        'o recorte da coluna precisa conter o painel de mensagens E a barra de entrada',
      );
      assert.ok(
        !column.includes('<Dialog') && !column.includes('<Popover'),
        'o recorte fechou no `</Stack>` errado: engoliu o diálogo/popover, que são irmãos',
      );
      return column;
    }
  }
  assert.fail('o Stack da coluna não fecha no recorte da aula ativa');
}

describe('2. a coluna da aula tem UM eixo só — cobrado no CONTAINER, não no dicionário', () => {
  /**
   * Centralização permitida FORA do eixo nomeado: os estados de saída
   * antecipada da view (carregando / erro / seletor de trilhas). Cada um é a
   * RAIZ do próprio subárvore — nenhum deles é filho do Stack da coluna, e por
   * isso a regra do bloco 1 não os alcança. Eles se reconhecem pelo `maxWidth:
   * 640` que declaram na mesma linha.
   */
  const isEarlyExitState = (line: string): boolean => /maxWidth: 640/.test(line);

  it('o eixo está APLICADO na tag de abertura da raiz da aula ativa', () => {
    const { rootTag } = activeLessonTree();
    assert.match(
      rootTag,
      /^return \(\s*<Box\b[\s\S]*sx=\{\{/,
      'a raiz da aula ativa é um <Box> com `sx` — se isso mudar, o recorte deste ' +
        'teste precisa ser refeito ANTES de confiar no resto',
    );
    assert.ok(
      rootTag.includes('...LESSON_COLUMN_SX'),
      'o eixo (a coluna PREENCHENDO o main) precisa estar ESPALHADO na raiz. Sem ele a ' +
        'coluna perde o seu ÚNICO dono de largura — e é nesse vácuo que um filho volta a ' +
        'declarar eixo próprio, o defeito da onda 11 que a versão anterior deste teste ' +
        'não pegava.',
    );
  });

  it('ONDA-LARGURA-LIVRE: a raiz não ganha teto nem centralização POR FORA do eixo', () => {
    const { rootTag } = activeLessonTree();
    assert.doesNotMatch(
      rootTag,
      /\bmaxWidth\b|\bmaxInlineSize\b|\bmx:|\bm: 'auto'|\bmarginInline\b|\bmarginLeft\b|\bmarginRight\b/,
      'a raiz PREENCHE o main. Um `maxWidth` (ou `mx`) ao lado do `...LESSON_COLUMN_SX` ' +
        'devolveria o teto que o dono mandou tirar: a divisória do sidebar voltaria a ' +
        'mexer só na margem vazia, e não na linha de texto da aula.',
    );
  });

  it('o painel de mensagens e a barra de entrada são DESCENDENTES da mesma raiz', () => {
    const { tree } = activeLessonTree();
    assert.ok(tree.includes('role="log"'), 'o painel de mensagens vive nesta árvore');
    assert.ok(
      tree.includes('<LessonComposer'),
      'a barra de entrada vive na MESMA árvore — eixo de LEITURA e eixo de ESCRITA ' +
        'saem, literalmente, do mesmo objeto de estilo',
    );
  });

  it('o eixo é declarado UMA vez e aplicado UMA vez', () => {
    assert.equal(
      (VIEW.match(/\.\.\.LESSON_COLUMN_SX/g) ?? []).length,
      1,
      'dois lugares aplicando o eixo = dois eixos concorrentes de novo',
    );
    assert.equal(
      (VIEW.match(/const LESSON_COLUMN_SX = /g) ?? []).length,
      1,
      'o eixo é UM objeto com nome, declarado UMA vez. Painel de mensagens, avisos e ' +
        'barra de entrada apenas PREENCHEM o que o container definiu.',
    );
  });

  it('ONDA-LARGURA-LIVRE: o eixo PREENCHE — width 100% + minWidth 0, sem maxWidth e sem mx', () => {
    const decl = /const LESSON_COLUMN_SX = (\{[^}]*\})/.exec(VIEW);
    assert.ok(decl, 'o eixo é UM objeto literal com nome');
    const body = decl[1];
    assert.match(
      body,
      /\bwidth: '100%'/,
      'a coluna preenche o main — e quanto é o main quem decide é a divisória do sidebar',
    );
    assert.match(
      body,
      /\bminWidth: 0\b/,
      'a coluna nunca reivindica largura pelo CONTEÚDO (linha longa de código, URL sem ' +
        'quebra): quem manda é o main',
    );
    assert.doesNotMatch(
      body,
      /maxWidth|maxInlineSize/,
      'SEM teto: o `maxWidth: CHAT_COLUMN_MAX_PX` (960) era exatamente a limitação que o ' +
        'dono mandou tirar',
    );
    assert.doesNotMatch(
      body,
      /\bmx\b|\bm:|margin/,
      'SEM centralização: uma coluna do tamanho do main não tem o que centralizar',
    );
  });

  it('ONDA-LARGURA-LIVRE: o eixo RENDERIZADO emite só width:100% e min-width:0', async () => {
    // A guarda acima lê o FONTE; esta lê o CSS que o emotion emite para o
    // objeto REAL exportado pela view — um `maxWidth` que entrasse por spread,
    // por breakpoint ou por qualquer caminho que o regex não enxergue apareceria
    // aqui como `max-width`.
    const mod = (await import(VIEW_MODULE)) as { LESSON_COLUMN_SX: SxProps<Theme> };
    const html = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme },
        createElement(Box, { sx: mod.LESSON_COLUMN_SX, id: 'coluna' }),
      ),
    );
    const css = cssOfClass(html, classOfElementWith(html, 'id="coluna"'));
    assert.match(css, /(^|;)width:100%/, 'a coluna preenche o main');
    assert.match(css, /(^|;)min-width:0/, 'e pode encolher com ele até o piso da divisória');
    assert.doesNotMatch(
      css,
      /max-width|max-inline-size/,
      `teto nenhum na coluna da aula (CSS emitido: ${css})`,
    );
    assert.doesNotMatch(css, /margin/, `centralização nenhuma (CSS emitido: ${css})`);
  });

  it('ONDA-LARGURA-LIVRE: CHAT_COLUMN_MAX_PX não existe mais — nem no código, nem no módulo', async () => {
    assert.doesNotMatch(
      VIEW,
      /CHAT_COLUMN_MAX_PX/,
      'o teto da coluna morreu; uma constante com o nome dele no código é o convite para ' +
        'ele voltar a ser aplicado',
    );
    const mod = (await import(VIEW_MODULE)) as Record<string, unknown>;
    assert.equal(
      'CHAT_COLUMN_MAX_PX' in mod,
      false,
      'e o módulo não o exporta mais (nenhum outro arquivo dependia dele)',
    );
  });

  it('nenhum filho tenta se centralizar por conta', () => {
    const autoLines = VIEW.split('\n').filter((l) =>
      /mx:\s*'auto'|marginLeft:\s*'auto'|marginInline:\s*'auto'/.test(l),
    );
    const soltas = autoLines.map((l) => l.trim()).filter((l) => !isEarlyExitState(l));
    assert.deepEqual(
      soltas,
      [],
      'a aula ATIVA não tem margem automática nenhuma: desde a ONDA-LARGURA-LIVRE a coluna ' +
        'PREENCHE o main e não há o que centralizar. E margem automática num filho de ' +
        '<Stack spacing> sem useFlexGap é apagada pela regra do Stack (bloco 1 mede isso): ' +
        'a linha de entrada volta para a esquerda enquanto o painel de mensagens fica ' +
        'centrado — o eixo de leitura e o de escrita param de bater.',
    );
  });

  it('ONDA-LARGURA-LIVRE: nenhum filho da coluna declara teto de largura', () => {
    // O teto não pode voltar por BAIXO: um `maxWidth` num filho da coluna (no
    // painel, no rolador, num aviso) prenderia a linha de texto de novo e a
    // divisória do sidebar voltaria a não mandar nela. O teto do BALÃO é do
    // componente ChatBubble e é medido no CSS dele, em
    // tests/chatBubbleWidth.test.ts.
    assert.doesNotMatch(
      columnStack(),
      /maxWidth|maxInlineSize|max-width/,
      'dentro da coluna da aula ativa ninguém capa a largura — só o main (a divisória) manda',
    );
  });

  it('o Stack DA COLUNA — o primeiro filho da raiz — usa useFlexGap', () => {
    const { firstChildTag } = activeLessonTree();
    assert.match(
      firstChildTag,
      /<Stack\b[^>]*\buseFlexGap\b/,
      'o primeiro filho da raiz é o Stack da coluna, e é NELE que `useFlexGap` importa: ' +
        'sem ele a regra `> :not(style):not(style) { margin: 0 }` volta a valer para ' +
        'painel, avisos, ação e entrada. Perguntar se ALGUM <Stack> do arquivo tem ' +
        'useFlexGap (a versão anterior deste teste) não protege nada: o arquivo tem outros.',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 3 — a barra de entrada, renderizada de verdade
 * ═══════════════════════════════════════════════════════════════════════════ */

interface ComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onMicToggle: () => void;
  micTranscribing: boolean;
  disabled: boolean;
}

let LessonComposer: ComponentType<ComposerProps>;
let lessonLogSx: (t: Theme) => SxProps<Theme>;

const BASE: ComposerProps = {
  draft: '',
  onDraftChange: () => {},
  onSend: () => {},
  onMicToggle: () => {},
  micTranscribing: false,
  disabled: false,
};

function renderComposer(props: Partial<ComposerProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(LessonComposer, { ...BASE, ...props }),
    ),
  );
}

const MIC = `aria-label="${ptBR.lesson.micStart}"`;
const SEND = `aria-label="${ptBR.lesson.sendMessage}"`;
const CAMPO = `placeholder="${ptBR.lesson.askInput}"`;

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
  const mod = (await import(VIEW_MODULE)) as {
    LessonComposer: typeof LessonComposer;
    lessonLogSx: typeof lessonLogSx;
  };
  LessonComposer = mod.LessonComposer;
  lessonLogSx = mod.lessonLogSx;
});

describe('3. a barra de entrada segue a referência de chat', () => {
  it('o microfone é um botão FORA do campo, antes dele — não um adorno interno', () => {
    const html = renderComposer();
    assert.ok(
      !html.includes('MuiInputAdornment-positionStart'),
      'o mic saiu de dentro do campo (era startAdornment)',
    );
    const mic = html.indexOf(MIC);
    const campo = html.indexOf('MuiInputBase-root');
    assert.notEqual(mic, -1, 'o mic existe e mantém o nome acessível');
    assert.ok(mic < campo, 'o mic vem ANTES do campo na ordem do documento (e do foco)');
  });

  it('o campo é uma PÍLULA que ocupa a largura restante, com placeholder no lugar do label', () => {
    const html = renderComposer();
    assert.ok(html.includes('MuiFormControl-fullWidth'), 'o campo cresce até o fim da linha');
    assert.ok(
      !html.includes('MuiInputLabel'),
      'sem label flutuante — a referência põe o texto DENTRO do campo',
    );
    assert.ok(html.includes(CAMPO), 'o convite vive no placeholder');
    const campo = classOfElementWith(html, 'MuiInputBase-root');
    assert.match(cssOfClass(html, campo), /border-radius:\s*999px/, 'raio total (stadium)');
  });

  it('o enviar fica DENTRO do campo, na borda direita', () => {
    const html = renderComposer({ draft: 'oi' });
    assert.ok(html.includes('MuiInputAdornment-positionEnd'), 'o enviar é adorno de FIM');
    const fim = html.indexOf('MuiInputAdornment-positionEnd');
    const enviar = html.indexOf(SEND);
    assert.ok(fim !== -1 && enviar > fim, 'o botão de enviar está dentro do adorno de fim');
  });

  it('os alvos de toque têm 44px (mic e enviar)', () => {
    const html = renderComposer({ draft: 'oi' });
    for (const [nome, marker] of [
      ['mic', MIC],
      ['enviar', SEND],
    ] as const) {
      const css = cssOfClass(html, classOfElementWith(html, marker));
      assert.match(css, /(min-)?width:\s*44px/, `${nome}: largura mínima de alvo`);
      assert.match(css, /(min-)?height:\s*44px/, `${nome}: altura mínima de alvo`);
    }
  });

  it('a acessibilidade que já existia continua de pé', () => {
    const html = renderComposer();
    assert.ok(
      html.includes('data-onboarding-target="lesson-chat-input"'),
      'o alvo do tutorial não pode sumir com a reforma',
    );
    assert.ok(
      html.includes(`aria-label="${ptBR.lesson.askInput}"`),
      'sem label flutuante o campo PRECISA de nome acessível próprio',
    );
    // Enter para enviar e o Tooltip são comportamento de EVENTO/hover: sem DOM
    // não há como dispará-los aqui. Guarda de FONTE, explicitamente parcial.
    assert.match(VIEW, /e\.key === 'Enter' && !e\.shiftKey/, 'Enter continua enviando');
    assert.match(VIEW, /<Tooltip title=\{micTranscribing/, 'o Tooltip do mic continua lá');
  });

  it('enviar vazio é impossível — e com pergunta escrita o botão está VIVO', () => {
    // O par completo. Só a metade "vazio → desabilitado" deixa passar o
    // mutante `disabled={disabled}` (que desabilita NUNCA por rascunho): é a
    // metade POSITIVA que prova qual expressão está no código.
    assert.ok(
      isDisabled(tagOfElementWith(renderComposer(), SEND)),
      'rascunho vazio → enviar desabilitado',
    );
    assert.ok(
      isDisabled(tagOfElementWith(renderComposer({ draft: '   ' }), SEND)),
      'só espaço em branco não é pergunta — segue desabilitado',
    );
    assert.ok(
      !isDisabled(tagOfElementWith(renderComposer({ draft: 'oi' }), SEND)),
      'com pergunta escrita o enviar PRECISA estar habilitado — sem esta asserção o ' +
        'teste passa com `disabled={disabled}` e a regra do rascunho vazio some',
    );
  });

  it('aula ocupada trava mic, campo e enviar — cada um medido no PRÓPRIO elemento', () => {
    const ocupado = renderComposer({ draft: 'oi', disabled: true });
    const livre = renderComposer({ draft: 'oi' });
    for (const [nome, marker] of [
      ['mic', MIC],
      ['campo', CAMPO],
      ['enviar', SEND],
    ] as const) {
      assert.ok(
        isDisabled(tagOfElementWith(ocupado, marker)),
        `${nome}: aula ocupada trava (nada de pergunta em voo dupla)`,
      );
      assert.ok(
        !isDisabled(tagOfElementWith(livre, marker)),
        `${nome}: aula livre NÃO trava — sem este par, contar ocorrências de "disabled" ` +
          'no HTML inteiro dá verde até para um composer permanentemente morto',
      );
    }
  });

  it('a casca animada do framer não vira PARADA DE TAB', () => {
    // O `motion` marca `tabIndex=0` em TODO elemento com gesto quando o autor
    // não declara um (framer-motion, render/html/use-props.mjs). A sonda de
    // teclado no Electron real leu, nesta linha, um <span tabindex="0"> sem
    // role e sem nome ANTES do botão "Falar": uma parada de tab que não
    // anuncia nada e não faz nada. A asserção não pode ser "nenhum
    // tabindex=0": o ButtonBase do MUI põe `tabindex="0"` no <button> de
    // propósito. O que se cobra é QUEM pode carregá-lo.
    const html = renderComposer({ draft: 'oi' });
    const paradas = [...html.matchAll(/<([a-z]+)[^>]*\stabindex="0"/g)].map((m) => m[1]);
    assert.deepEqual(
      [...new Set(paradas)].sort(),
      ['button'],
      'só controle de verdade para o tab; a casca animada leva tabIndex={-1}',
    );
    assert.equal(
      (html.match(/<span tabindex="-1"/g) ?? []).length,
      2,
      'as DUAS cascas desta linha (mic e enviar) precisam estar explicitamente fora do tab',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 4 — a conversa SEM CAIXA (ONDA12), renderizada
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('4. a caixa da conversa morreu', () => {
  function logCss(): string {
    const html = renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme },
        createElement(Box, { sx: lessonLogSx(theme), id: 'log' }),
      ),
    );
    return cssOfClass(html, classOfElementWith(html, 'id="log"'));
  }

  it('o painel é o NÍVEL 0 (o fundo do app) — não uma superfície desenhada', () => {
    assert.match(
      logCss(),
      /background-color:var\(--mui-palette-surface-level0/,
      'a conversa fica direto no fundo, como na referência; nível 2 (o well) desenhava ' +
        'um retângulo que, com uma bolha só, era ~350px de cinza vazio',
    );
  });

  it('nem raio nem padding — caixa nenhuma sobrou', () => {
    const css = logCss();
    assert.doesNotMatch(css, /border-radius/, 'raio é o contorno da caixa que morreu');
    assert.doesNotMatch(css, /(^|;)padding/, 'padding é o respiro INTERNO de uma caixa');
  });

  it('a conversa ancora EMBAIXO — o vazio não vira retângulo no topo', () => {
    assert.match(
      logCss(),
      /(^|;)justify-content:flex-end/,
      'com uma bolha só, o resto da altura precisa ficar ACIMA dela (fundo do app), ' +
        'nunca abaixo. Quem rola é o Box de fora: este cresce com o conteúdo e nunca ' +
        'chega a ter sobra para cortar o topo.',
    );
  });

  it('o rolador guarda a folga do anel de foco que o padding do painel deixou', () => {
    // O `p: 1.5` do painel morreu com a caixa — e com ele o único inset que
    // impedia o recorte do scroll de cortar o anel de foco do primeiro
    // controle colado na borda (o "Mostrar tudo"). Um container com
    // `overflow-y: auto` recorta no PADDING BOX; o anel desta base sai 5px do
    // controle (FOCUS_RING offset 2 + width 3, src/theme.ts). A folga passou
    // para o ROLADOR, que é quem recorta — o painel segue sem padding.
    // NÃO COBERTO: o recorte acontecendo (é layout de navegador).
    const { tree } = activeLessonTree();
    const rolador = tree.slice(tree.indexOf('ref={logScrollRef}'));
    const head = rolador.slice(0, rolador.indexOf('}}') + 2);
    assert.match(head, /overflowY: 'auto'/, 'é este o container que recorta');
    assert.match(
      head,
      /px: 0\.75/,
      '0,75 * 8px = 6px ≥ os 5px do anel; sem isso o foco do primeiro controle da ' +
        'conversa é cortado pelo recorte do scroll',
    );
  });

  it('o painel continua sendo o log acessível, com o scroll e o pular-digitação', () => {
    // O elemento é o MESMO — só o estilo saiu. Se algum destes sumir com uma
    // reforma visual, o chat perde leitor de tela, scroll interno ou a saída
    // da animação. NÃO COBERTO aqui: que o `onClick` realmente complete a
    // digitação (é evento; sem DOM não há como disparar).
    const { tree } = activeLessonTree();
    const logTag = tree.slice(tree.indexOf('<Box\n            sx={lessonLogSx(theme)}'));
    const head = logTag.slice(0, logTag.indexOf('>') + 1);
    assert.ok(head.includes('role="log"'), 'role="log"');
    assert.ok(head.includes('aria-live="polite"'), 'aria-live="polite"');
    assert.ok(head.includes('ref={logScrollRef}') || tree.includes('ref={logScrollRef}'), 'scroll');
    assert.ok(head.includes('requestSkipTyping'), 'clique completa a digitação');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 5 — o CTA duplicado (ONDA12)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('5. existe UM convite para responder o quiz, e ele é o do card', () => {
  it('a view não desenha um segundo botão "Responder"', () => {
    assert.ok(
      !VIEW.includes('lesson.quizChatAnswer'),
      'o rótulo "Responder" pertence ao QuizChatCard — dois botões idênticos a ~60px um ' +
        'do outro (um deles sem dizer a QUAL pergunta pertence) é a duplicata que esta ' +
        'onda matou',
    );
  });

  it('o caminho continua o MESMO: o card chama handleQuizReopen', () => {
    const { tree } = activeLessonTree();
    assert.ok(tree.includes('<QuizChatCard'), 'o card do quiz continua na conversa');
    assert.match(
      VIEW,
      /onOpen=\{\(\) => handleQuizReopen\(visible\.key\)\}/,
      'nada de uma segunda porta com regra própria: o convite do card reabre o overlay ' +
        'pelo mesmo caminho que o botão removido usava',
    );
  });

  it('o card em cena é trazido À VISTA — ele virou o único convite', () => {
    // Sem isto a remoção do botão de baixo deixaria o aluno sem caminho: o
    // card mora DENTRO do scroll e pode estar fora da tela quando o overlay
    // desce. NÃO COBERTO aqui: o scroll acontecendo (é DOM; esta base não tem
    // jsdom). O que se trava é o CABEAMENTO — ref no card em cena + efeito
    // disparado pela chave do quiz e pela fase do overlay.
    assert.match(VIEW, /ref=\{inScene \? quizCardElRef : null\}/, 'o card em cena carrega o ref');
    assert.match(
      VIEW,
      /quizCardElRef\.current\?\.scrollIntoView\?\.\(\{ block: 'nearest'/,
      "`block: 'nearest'` rola o MÍNIMO — nada de puxar a leitura de quem já vê o card",
    );
    assert.match(
      VIEW,
      /\}, \[activeQuizKey, quizOverlay\.phase\]\);/,
      'o efeito reage à troca de quiz E ao overlay descendo (minimizar)',
    );
  });

  it('toda casca animada da view está fora do tab', () => {
    // O bloco 3 MEDE isso na barra de entrada (renderizada). Os demais
    // wrappers vivem em JSX que não dá para montar sem os stores da view —
    // aqui a guarda é de FONTE, e ela é exata: cada `whileTap` tem que trazer
    // `tabIndex={-1}` na MESMA tag.
    const semTab: string[] = [];
    for (const m of VIEW.matchAll(/whileTap=/g)) {
      const abre = VIEW.lastIndexOf('<motion.', m.index);
      assert.notEqual(abre, -1, 'todo whileTap desta view vive num <motion.*>');
      let fim = abre;
      while (fim < VIEW.length && !(VIEW[fim] === '>' && VIEW[fim - 1] !== '=')) fim += 1;
      const tag = VIEW.slice(abre, fim + 1);
      if (!tag.includes('tabIndex={-1}')) semTab.push(tag.slice(0, 60));
    }
    assert.deepEqual(
      semTab,
      [],
      'o framer marca `tabIndex=0` em quem tem gesto e não declara um: a casca vira uma ' +
        'parada de tab muda na frente do próprio botão (mesmo conserto do irmão ' +
        'components/quiz/QuizChatCard.tsx)',
    );
  });
});
