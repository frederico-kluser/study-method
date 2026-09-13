/**
 * tests/lessonSidebarWiring.test.ts — a LIGAÇÃO do cabeçalho da aula ao
 * SIDEBAR do shell (ONDA-AULA-NO-SIDEBAR).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O PEDIDO, E O QUE ESTE ARQUIVO TRAVA
 * ══════════════════════════════════════════════════════════════════════════
 * O dono, sobre o sidebar estilo VSCode, verbatim: *"ele foi feito errado
 * porque a informação dele nunca muda, seu objetivo era pegar o header tag
 * content de cada aula e mover para essa região"*. A onda 1 construiu as duas
 * pontas — o SLOT no SessionFrame (+ `ShellSidebarPortal`) e o
 * `LessonSidebarHeader` vertical —, mas ninguém publicava no slot: o sidebar
 * continuava igual em toda aula. Esta onda LIGA as pontas: a LessonView
 * publica o cabeçalho de CADA aula no slot, e o `<header>` que morava na coluna
 * da aula (o CollapsibleLessonHeader, aposentado junto com o próprio teste)
 * sai de lá.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE GUARDAS DE FONTE (e o que elas NÃO provam)
 * ══════════════════════════════════════════════════════════════════════════
 * Nenhum teste desta base renderiza a LessonView inteira (ela é dirigida por
 * IPC e por stores de módulo), e o portal NÃO renderiza em SSR: sem slot o
 * `ShellSidebarPortal` devolve `null` — e o renderizador de servidor nem
 * suporta portais. O componente e o portal já têm prova RENDERIZADA própria
 * (tests/lessonSidebarHeader.test.ts e tests/shellSidebarSlot.test.ts). O que
 * falta provar é a FIAÇÃO, e ela é cobrada no recorte certo do fonte (sem
 * comentários — a técnica de tests/lessonChatLayout.test.ts):
 *
 *   BLOCO 1 — A PUBLICAÇÃO. A view importa o portal e o componente, usa
 *     `<LessonSidebarHeader` UMA vez, como o ÚNICO filho de `<ShellSidebarPortal>`,
 *     com as props 1:1 do contrato do componente (lido do próprio componente,
 *     sem cópia) e ligadas aos MESMOS valores do cabeçalho antigo — inclusive o
 *     `aria-expanded` dirigido pelo popover e o resumo SÓ por prop.
 *
 *   BLOCO 2 — A POSIÇÃO. O portal é IRMÃO depois do `</Stack>` da coluna
 *     (junto do Dialog de Fontes e do Popover de Desafios, as superfícies fora
 *     do fluxo): nunca o 1º filho da raiz da aula ativa, nunca dentro da coluna,
 *     e só na aula ATIVA — os estados vazio/carregando/erro retornam antes e
 *     não publicam nada (slot vazio, sem conteúdo velho). E a coluna começa
 *     DIRETO na região do chat.
 *
 *   BLOCO 3 — A APOSENTADORIA. Nenhum `<header`, `component="header"`,
 *     `CollapsibleLessonHeader` nem `<Divider` na view; o componente antigo não
 *     existe mais no disco; e NENHUM arquivo de src/ o cita em código (varredura
 *     recursiva em runtime, não uma lista fixa).
 *
 *   BLOCO 4 — O POPOVER. Aberto pelo botão do CABEÇALHO (agora na coluna
 *     ESQUERDA do shell), ele cresce para a DIREITA, sobre o main — a origem
 *     antiga o jogaria sobre o rail e o sidebar. O ramo da linha de ação ('acao')
 *     não mudou.
 *
 * O que só a GUI real prova — o h1 dentro do sidebar e fora do `main`, o
 * conteúdo trocando com a aula, o slot esvaziando fora dela, o popover visível
 * sobre o main — é medido no Electron (tests/e2e/, specs da aula).
 *
 * Reprodução: `bash tools/t.sh tests/lessonSidebarWiring.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(HERE, '../src');
const VIEW_PATH = resolve(SRC_DIR, 'views/LessonView/LessonView.tsx');
const SIDEBAR_HEADER_PATH = resolve(SRC_DIR, 'components/course/LessonSidebarHeader.tsx');
const OLD_HEADER_PATH = resolve(SRC_DIR, 'components/course/CollapsibleLessonHeader.tsx');
const OLD_HEADER_TEST_PATH = resolve(HERE, 'lessonCollapsibleHeader.test.ts');

/** Fonte sem comentários — só o código que realmente roda (técnica dos
 *  precedentes lessonChatLayout / quizOverlayWiring). */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const VIEW_SRC = readFileSync(VIEW_PATH, 'utf8');
const VIEW = codeOf(VIEW_SRC);
const SIDEBAR_HEADER = codeOf(readFileSync(SIDEBAR_HEADER_PATH, 'utf8'));

/** Colapsa espaço em branco — compara expressões sem depender de quebra de linha. */
function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Quantas vezes `needle` aparece em `hay` (literal, sem regex). */
function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Ferramentas de recorte do JSX (sem DOM, sobre o fonte sem comentários)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * O índice do `>` que FECHA a tag de abertura que começa em `start` (um `<`),
 * contando chaves: dentro de `{…}` o `>` de uma arrow (`=>`) ou de uma
 * comparação não fecha nada. Devolve também se a tag é auto-fechada (`/>`).
 */
function openingTagEnd(src: string, start: number): { end: number; selfClosing: boolean } {
  let depth = 0;
  for (let i = start + 1; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return { end: i, selfClosing: src[i - 1] === '/' };
  }
  assert.fail(`a tag que começa em ${start} não fecha`);
}

/**
 * As props de uma tag JSX (a de abertura que começa em `start`), como
 * `nome → fonte do valor` (o miolo de `{…}` ou o texto entre aspas). Só lê o
 * nível ZERO da tag: o que estiver dentro de uma expressão não vira prop.
 */
function jsxProps(src: string, start: number): Map<string, string> {
  const { end } = openingTagEnd(src, start);
  const tag = src.slice(start, end + 1);
  const props = new Map<string, string>();
  // pula `<Nome`
  let i = 1;
  while (i < tag.length && /[\w.]/.test(tag[i])) i += 1;
  while (i < tag.length) {
    const rest = tag.slice(i);
    const name = /^\s+([A-Za-z_][\w-]*)/.exec(rest);
    if (name === null) break;
    i += name[0].length;
    if (tag[i] !== '=') {
      props.set(name[1], 'true');
      continue;
    }
    i += 1;
    const open = tag[i];
    if (open === '{') {
      let depth = 0;
      const from = i;
      for (; i < tag.length; i += 1) {
        if (tag[i] === '{') depth += 1;
        else if (tag[i] === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      props.set(name[1], tag.slice(from + 1, i));
      i += 1;
    } else if (open === '"' || open === "'") {
      const close = tag.indexOf(open, i + 1);
      props.set(name[1], tag.slice(i + 1, close));
      i = close + 1;
    } else {
      assert.fail(`valor de prop inesperado em ${name[1]}: ${tag.slice(i, i + 20)}`);
    }
  }
  return props;
}

/**
 * A árvore JSX da AULA ATIVA — do `return (` imediatamente antes do
 * `role="log"` (o painel de mensagens só existe na aula ativa; os estados de
 * saída antecipada voltam ANTES) até o fechamento da função. MESMA âncora de
 * tests/lessonChatLayout.test.ts, bloco 2 — as duas leituras concordam sobre o
 * que é "a raiz" e "a coluna".
 */
function activeLessonTree(): { treeAt: number; tree: string; rootTag: string } {
  const logAt = VIEW.indexOf('role="log"');
  assert.notEqual(logAt, -1, 'o painel de mensagens (role="log") precisa existir');
  const treeAt = VIEW.lastIndexOf('return (', logAt);
  assert.notEqual(treeAt, -1, 'a aula ativa precisa ser devolvida por um `return (`');
  const rest = VIEW.slice(treeAt);
  const endOfFn = rest.search(/\n\}/);
  const tree = rest.slice(0, endOfFn === -1 ? rest.length : endOfFn);
  const rootAt = tree.indexOf('<');
  const rootTag = tree.slice(0, openingTagEnd(tree, rootAt).end + 1);
  return { treeAt, tree, rootTag };
}

/** O Stack DA COLUNA: início da tag de abertura e o fim do `</Stack>` que o
 *  fecha (índices em `tree`), recortado contando aberturas e fechamentos. */
function columnStack(tree: string, rootTag: string): { start: number; end: number } {
  const start = tree.indexOf('<Stack', rootTag.length);
  assert.notEqual(start, -1, 'a coluna é um <Stack> dentro da raiz');
  const token = /<Stack\b|<\/Stack>/g;
  token.lastIndex = start;
  let depth = 0;
  for (let m = token.exec(tree); m !== null; m = token.exec(tree)) {
    depth += m[0] === '</Stack>' ? -1 : 1;
    if (depth === 0) return { start, end: m.index + m[0].length };
  }
  assert.fail('o Stack da coluna não fecha no recorte da aula ativa');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 1 — a PUBLICAÇÃO: o cabeçalho de cada aula vai para o slot do sidebar
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('1. a LessonView publica o cabeçalho da aula no SIDEBAR (portal)', () => {
  it('importa o portal do slot e o componente vertical do cabeçalho', () => {
    assert.match(
      VIEW,
      /import\s*\{\s*ShellSidebarPortal\s*\}\s*from\s*'\.\.\/\.\.\/components\/shell\/ShellSidebarSlot';/,
      'o portal do slot do sidebar (onda 1) é a ÚNICA porta para a coluna',
    );
    assert.match(
      VIEW,
      /import\s*\{\s*LessonSidebarHeader\s*\}\s*from\s*'\.\.\/\.\.\/components\/course\/LessonSidebarHeader';/,
      'o cabeçalho da aula é o componente vertical da onda 1 — não uma cópia na view',
    );
  });

  it('<LessonSidebarHeader> aparece UMA vez, como ÚNICO filho de <ShellSidebarPortal>', () => {
    assert.equal(count(VIEW, '<LessonSidebarHeader'), 1, 'um cabeçalho só — dois seriam dois h1');
    assert.equal(count(VIEW, '<ShellSidebarPortal>'), 1, 'um portal só');
    assert.equal(count(VIEW, '</ShellSidebarPortal>'), 1, 'e ele fecha uma vez');
    const open = VIEW.indexOf('<ShellSidebarPortal>');
    const close = VIEW.indexOf('</ShellSidebarPortal>');
    const inner = VIEW.slice(open + '<ShellSidebarPortal>'.length, close);
    const headerAt = inner.indexOf('<LessonSidebarHeader');
    assert.notEqual(headerAt, -1, 'o cabeçalho é publicado DENTRO do portal (fora dele cairia no main)');
    const { end, selfClosing } = openingTagEnd(inner, headerAt);
    assert.ok(selfClosing, 'o cabeçalho não recebe filhos — tudo chega por prop');
    assert.equal(
      squash(inner.slice(0, headerAt) + inner.slice(end + 1)),
      '',
      'o portal leva SÓ o cabeçalho: nada mais da aula vai para o sidebar',
    );
  });

  it('as props são 1:1 com o contrato do componente — sem `key` (o componente não tem estado)', () => {
    const contract = /export interface LessonSidebarHeaderProps \{([\s\S]*?)\n\}/.exec(SIDEBAR_HEADER)?.[1];
    assert.ok(contract, 'LessonSidebarHeaderProps não encontrado no componente');
    const fields = [...contract.matchAll(/^\s*(?:readonly\s+)?(\w+)\??:/gm)].map((m) => m[1]).sort();
    assert.ok(fields.length >= 10, `o contrato lido é implausível (${fields.length} campos)`);
    const props = jsxProps(VIEW, VIEW.indexOf('<LessonSidebarHeader'));
    assert.deepEqual(
      [...props.keys()].sort(),
      fields,
      'a view passa exatamente o contrato: nenhuma prop faltando (o cabeçalho sairia pela ' +
        'metade no sidebar) e nenhuma sobrando — inclusive `key`: o remount por aula existia ' +
        'para devolver o COLAPSO do componente antigo ao estado inicial, e o componente ' +
        'novo não tem estado',
    );
  });

  it('cada prop vem do MESMO lugar de antes (a migração não trocou dado nenhum)', () => {
    const props = jsxProps(VIEW, VIEW.indexOf('<LessonSidebarHeader'));
    const esperado: Record<string, string> = {
      title: 'lesson.title',
      summary: 'lesson.summary',
      challengeCount: 'lesson.challenges.length',
      pendingChallengeCount: 'pendingChallengeCount',
      challengesExpanded: "challengesOpen && challengesFrom === 'cabecalho'",
      onSourcesClick: '() => setSourcesOpen(true)',
      theoryProgress: 'theoryProgress',
      sectionCurrent: 'chat.presentedSections.length',
      sectionTotal: 'lesson.theory.length',
      prerequisites: 'lesson.prerequisites',
      onPrerequisiteClick: 'openPrerequisite',
    };
    for (const [prop, valor] of Object.entries(esperado)) {
      assert.equal(squash(props.get(prop) ?? '<ausente>'), valor, `${prop} mudou de origem`);
    }
  });

  it('o botão Desafios do sidebar marca a ORIGEM do popover e entrega a própria âncora', () => {
    const props = jsxProps(VIEW, VIEW.indexOf('<LessonSidebarHeader'));
    const handler = squash(props.get('onChallengesClick') ?? '');
    assert.match(handler, /^\(anchor\) => \{/, 'o handler recebe o botão (e.currentTarget) como âncora');
    assert.match(
      handler,
      /setChallengesFrom\('cabecalho'\);/,
      "sem a origem 'cabecalho' o popover abriria na direção da linha de ação e o " +
        'aria-expanded do botão do sidebar não refletiria o que ele abriu',
    );
    assert.match(handler, /setChallengesAnchorEl\(anchor\);/, 'o popover ancora no botão do sidebar');
  });

  it('o resumo da aula só chega por prop — nenhuma cópia dele desenhada na coluna', () => {
    assert.equal(
      count(VIEW, 'lesson.summary'),
      1,
      'resumo é SÓ via prop (qualquer render inline duplicaria o texto: sidebar + main)',
    );
    assert.ok(VIEW.includes('summary={lesson.summary}'), 'o resumo chega ao componente por prop');
  });

  it('o pedido do dono está registrado AO PÉ DA LETRA no fonte', () => {
    // Mesma decisão de tests/lessonAutoScroll.test.ts (bloco 5): o comentário
    // que diz POR QUE o cabeçalho mora no sidebar é o que impede o próximo
    // leitor de "devolver" o cabeçalho ao main achando que conserta algo. As
    // quebras de linha (e o ` * ` dos blocos de comentário) são desfeitas antes
    // da busca: re-quebrar o parágrafo numa edição futura não apaga o registro.
    const prosa = squash(VIEW_SRC.replace(/\n\s*(?:\*(?!\/)|\/\/)?/g, ' '));
    assert.ok(
      prosa.includes('pegar o header tag content de cada aula e mover para essa região'),
      'o registro do pedido (verbatim) sumiu da LessonView',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 2 — a POSIÇÃO: fora do fluxo, depois da coluna, só na aula ativa
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('2. o portal é irmão DEPOIS da coluna — e a coluna começa na conversa', () => {
  it('o 1º filho da raiz continua sendo o Stack da coluna (com useFlexGap), não o portal', () => {
    const { tree, rootTag } = activeLessonTree();
    const after = tree.slice(rootTag.length).replace(/^(\s|\{\})+/, '');
    assert.match(
      after,
      /^<Stack\b[^>]*\buseFlexGap\b/,
      'o portal NÃO pode ser o 1º filho da raiz: é o Stack da coluna que ocupa esse lugar ' +
        '(tests/lessonChatLayout.test.ts ancora o useFlexGap nele)',
    );
  });

  it('o portal vem DEPOIS do `</Stack>` da coluna e ANTES do fechamento da raiz', () => {
    const { tree, rootTag } = activeLessonTree();
    const column = columnStack(tree, rootTag);
    const portalAt = tree.indexOf('<ShellSidebarPortal>');
    assert.notEqual(portalAt, -1, 'o portal mora na árvore da aula ATIVA');
    assert.ok(
      portalAt > column.end,
      'o portal é IRMÃO da coluna, depois dela — dentro do Stack ele viraria mais um item do ' +
        'fluxo (com gap e tudo) ao lado de painel, avisos, ação e entrada',
    );
    assert.ok(portalAt < tree.lastIndexOf('</Box>'), 'e continua dentro da raiz da aula ativa');
  });

  it('só a aula ATIVA publica: vazio/carregando/erro voltam antes e o slot fica vazio', () => {
    const { treeAt } = activeLessonTree();
    assert.ok(
      VIEW.indexOf('<ShellSidebarPortal') > treeAt,
      'um portal num estado de saída antecipada (seletor de trilhas, carregando, erro) ' +
        'deixaria no sidebar o cabeçalho de uma aula que não está na tela',
    );
  });

  it('a coluna só tem o FLUXO: nem portal, nem cabeçalho, nem as superfícies flutuantes', () => {
    const { tree, rootTag } = activeLessonTree();
    const { start, end } = columnStack(tree, rootTag);
    const column = tree.slice(start, end);
    assert.ok(column.includes('role="log"') && column.includes('<LessonComposer'), 'recorte certo');
    for (const fora of ['<ShellSidebarPortal', '<LessonSidebarHeader', '<Dialog', '<Popover']) {
      assert.ok(!column.includes(fora), `${fora} não pertence à coluna da conversa`);
    }
  });

  it('a coluna começa DIRETO na região do chat (sem cabeçalho e sem Divider antes)', () => {
    const { tree, rootTag } = activeLessonTree();
    const { start } = columnStack(tree, rootTag);
    const { end: openEnd } = openingTagEnd(tree, start);
    const first = tree.slice(openEnd + 1).replace(/^(\s|\{\})+/, '');
    assert.match(
      first,
      /^<Box\s+ref=\{logScrollRef\}/,
      'o 1º filho da coluna é o ROLADOR do chat: a altura que o cabeçalho + Divider ocupavam ' +
        'no topo virou área de conversa',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 3 — a APOSENTADORIA do cabeçalho antigo
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Todo arquivo de código-fonte abaixo de `dir` (recursivo, em runtime). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(ent.name)) out.push(full);
  }
  return out;
}

describe('3. o cabeçalho saiu do main — e o componente antigo foi aposentado', () => {
  it('a view não tem mais <header>, component="header", Divider nem o componente antigo', () => {
    assert.ok(!/<header\b/.test(VIEW), '<header> na view');
    assert.ok(!VIEW.includes('component="header"'), 'component="header" na view');
    assert.ok(!VIEW.includes('CollapsibleLessonHeader'), 'o componente aposentado voltou à view');
    assert.ok(!/<Divider\b/.test(VIEW), 'o Divider entre cabeçalho e chat voltou à coluna');
    assert.ok(!/\bDivider\b/.test(VIEW), 'import de Divider sem uso (o tsconfig não pega)');
  });

  it('o componente antigo e o teste dele não existem mais no disco', () => {
    assert.equal(existsSync(OLD_HEADER_PATH), false, 'CollapsibleLessonHeader.tsx ressuscitou');
    assert.equal(existsSync(OLD_HEADER_TEST_PATH), false, 'lessonCollapsibleHeader.test.ts ressuscitou');
  });

  it('NENHUM arquivo de src/ cita o CollapsibleLessonHeader em código (varredura recursiva)', () => {
    const files = sourceFiles(SRC_DIR);
    assert.ok(
      files.includes(VIEW_PATH) && files.length > 50,
      `a varredura não enxergou src/ direito (${files.length} arquivos) — verde vacuoso`,
    );
    const citam = files
      .filter((f) => /CollapsibleLessonHeader/.test(codeOf(readFileSync(f, 'utf8'))))
      .map((f) => relative(SRC_DIR, f));
    assert.deepEqual(
      citam,
      [],
      'import/uso do componente aposentado — o arquivo não existe mais e o build quebraria ' +
        '(comentário de HISTÓRIA pode citá-lo; código não)',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 4 — o POPOVER de Desafios abre para o lado certo em cada origem
 * ═══════════════════════════════════════════════════════════════════════════ */

type Origin = { vertical: string; horizontal: string };

/** `{ vertical: 'x', horizontal: 'y' }` → objeto. */
function parseOrigin(literal: string): Origin {
  const vertical = /vertical:\s*'(\w+)'/.exec(literal)?.[1];
  const horizontal = /horizontal:\s*'(\w+)'/.exec(literal)?.[1];
  assert.ok(vertical && horizontal, `origem ilegível: ${literal}`);
  return { vertical, horizontal };
}

/** A prop de origem do Popover como `{ acao, cabecalho }`, a partir do ternário
 *  sobre `challengesFrom` (qualquer um dos dois lados pode vir primeiro). */
function originsByTrigger(expr: string): { acao: Origin; cabecalho: Origin } {
  const m = /^\s*challengesFrom === '(acao|cabecalho)'\s*\?\s*(\{[^}]*\})\s*:\s*(\{[^}]*\})\s*$/.exec(expr);
  assert.ok(m, `a origem do popover não é mais o ternário sobre challengesFrom: ${squash(expr)}`);
  const [, cond, sim, nao] = m;
  return cond === 'acao'
    ? { acao: parseOrigin(sim), cabecalho: parseOrigin(nao) }
    : { acao: parseOrigin(nao), cabecalho: parseOrigin(sim) };
}

describe('4. o popover de Desafios cresce para o lado de quem o abriu', () => {
  const popover = (): Map<string, string> => {
    const { tree } = activeLessonTree();
    assert.equal(count(tree, '<Popover'), 1, 'um popover de desafios só');
    return jsxProps(tree, tree.indexOf('<Popover'));
  };

  it('continua ancorado no botão que o abriu (o do sidebar ou o da linha de ação)', () => {
    const props = popover();
    assert.equal(squash(props.get('open') ?? ''), 'challengesOpen');
    assert.equal(squash(props.get('anchorEl') ?? ''), 'challengesAnchorEl');
  });

  it("ramo 'cabecalho' (botão na coluna ESQUERDA): nasce no canto superior DIREITO e cresce para a direita", () => {
    const props = popover();
    const anchor = originsByTrigger(props.get('anchorOrigin') ?? '');
    const transform = originsByTrigger(props.get('transformOrigin') ?? '');
    assert.deepEqual(
      anchor.cabecalho,
      { vertical: 'top', horizontal: 'right' },
      'o ponto de apoio é o canto superior DIREITO do botão do sidebar',
    );
    assert.deepEqual(
      transform.cabecalho,
      { vertical: 'top', horizontal: 'left' },
      'a lista se prende pelo canto superior ESQUERDO — cresce para a direita, sobre o main. ' +
        'A origem antiga (âncora bottom/right + transform top/right) crescia para a ESQUERDA: ' +
        'com o botão no sidebar, a lista cairia sobre o rail e o próprio sidebar',
    );
  });

  it("ramo 'acao' (CTA no rodapé) não mudou: abre para CIMA, centrado no botão", () => {
    const props = popover();
    assert.deepEqual(originsByTrigger(props.get('anchorOrigin') ?? '').acao, {
      vertical: 'top',
      horizontal: 'center',
    });
    assert.deepEqual(originsByTrigger(props.get('transformOrigin') ?? '').acao, {
      vertical: 'bottom',
      horizontal: 'center',
    });
  });
});
