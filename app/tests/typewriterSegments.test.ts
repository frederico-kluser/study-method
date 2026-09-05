/**
 * tests/typewriterSegments.test.ts — a REGRA DURA da onda "chat e código":
 * em NENHUM instante da digitação o aluno vê crase, asterisco ou cerca como
 * texto, e o TEMPO da seção não muda.
 *
 * O DEFEITO QUE ESTA SUÍTE TRAVA (reclamação do dono: "a maneira como está
 * escrevendo o código também [está ruim]"): `TypewriterText` cortava markdown
 * CRU por caractere e `<ReactMarkdown>` re-parseava o fragmento a cada 35,7 ms.
 * A seção mais longa da AULA 1 (`as-tres-partes-da-linha`, 564 chars — medida
 * por esta suíte, não estimada) tem 8 code spans inline, ênfase, negrito, três
 * marcadores de lista, um bloco ```python e um bloco ```text.
 *
 * O TESTE-CANHÃO desta suíte é `varredura de TODOS os cortes`: para cada
 * cut = 0..564 do markdown real da aula 1, o estado revelado é inspecionado e
 * NENHUM resto de sintaxe é tolerado.
 *
 * ─── DOIS NÚMEROS DIFERENTES; ESTA SUÍTE MEDE OS DOIS ─────────────────────
 * Até a revisão desta correção, o cabeçalho (aqui e em três arquivos de src/)
 * afirmava "206 dos 565 cortes (36,5%) mostravam sintaxe crua NA TELA". O 206
 * é um número real — mas NÃO é a tela. Ele é a contagem de `hasDanglingMarkdown`
 * sobre o markdown-FONTE retido (`md.slice(0, cut)`), e a regra da cerca daquele
 * predicado marca TODO corte com cerca aberta na fonte. Como a 1ª cerca abre no
 * índice 394 de 564, os cortes seguintes entram quase todos — inclusive depois
 * de o `<ReactMarkdown>` já ter formado um `<pre><code>` legítimo, quando não há
 * NADA cru na tela. A conta fecha exatamente: 37 cortes até a cerca + 169 depois
 * dela = 206 (travado no teste "os 206 do markdown-FONTE não são 206 na tela").
 *
 * O que o ALUNO via está medido no bloco "a TELA renderizada": os DOIS pipelines
 * rodados de verdade com `react-dom/server` (SSR puro — roda sem DOM) nos 565
 * cortes, com a contagem feita sobre o TEXTO do HTML resultante:
 *
 *     MEDIDO na TELA — pipeline ANTIGO: 41 dos 565 cortes (7,3%) exibiam
 *                      sintaxe crua;  pipeline NOVO: 0 dos 565.
 *
 * O predicado `hasDanglingMarkdown` é conservador (um par de delimitadores
 * visível, como o "``" transitório, não é marcado), então 41 é um PISO. O
 * predicado estrito — "qualquer crase ou asterisco na tela", e a seção PRONTA
 * não tem nenhum dos dois — dá ANTIGO 45, NOVO 0, e também está travado aqui.
 *
 * Reprodução de TODOS os números (o 206 da fonte, o 41 e o 45 da tela):
 *   cd app && npm test -- tests/typewriterSegments.test.ts
 *   (ou: bash tools/t.sh tests/typewriterSegments.test.ts)
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import ReactMarkdown from 'react-markdown';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { theme } from '../src/theme';
import {
  atomicSpans,
  codeFenceRole,
  normalizeFenceLang,
  revealTypewriterSegments,
  safeProseCut,
  splitTypewriterSegments,
  type CodeSegment,
  type ProseSegment,
  type RevealedCode,
  type RevealedProse,
} from '../src/lib/typewriterSegments';
import { fenceFor, typewriterCut, TYPEWRITER_TPS } from '../src/lib/trackLessonState';

const HERE = dirname(fileURLToPath(import.meta.url));
const AULA_1 = resolve(
  HERE,
  '../resources/tracks/python/modules/a-tela/lessons/a-primeira-linha/lesson.json',
);

interface TheorySectionJson {
  id: string;
  markdown: string;
  code?: { language: string; code: string; explanation?: string };
}

/** O texto que o tutor REALMENTE manda no 'next' (mesma montagem do golden master). */
function assembled(s: TheorySectionJson): string {
  if (!s.code) return s.markdown;
  const expl = s.code.explanation ? `\n\n${s.code.explanation}` : '';
  return `${s.markdown}\n\n\`\`\`${s.code.language}\n${s.code.code}\n\`\`\`${expl}`;
}

function lesson1Sections(): TheorySectionJson[] {
  const raw = JSON.parse(readFileSync(AULA_1, 'utf8')) as { theory: TheorySectionJson[] };
  return raw.theory;
}

function longestSection(): string {
  const texts = lesson1Sections().map(assembled);
  return texts.reduce((a, b) => (b.length > a.length ? b : a));
}

const prose = (s: unknown): ProseSegment => s as ProseSegment;
const code = (s: unknown): CodeSegment => s as CodeSegment;

describe('splitTypewriterSegments — parte markdown em PROSA e BLOCOS de código', () => {
  it('reconstrói o markdown original byte a byte (nenhum caractere perdido)', () => {
    const md = longestSection();
    const segs = splitTypewriterSegments(md);
    assert.equal(segs.map((s) => md.slice(s.start, s.end)).join(''), md);
  });

  it('a seção mais longa da AULA 1 tem 564 chars e 5 segmentos na ordem certa', () => {
    const md = longestSection();
    assert.equal(md.length, 564);
    const segs = splitTypewriterSegments(md);
    assert.deepEqual(
      segs.map((s) => s.kind),
      ['prose', 'code', 'prose', 'code', 'prose'],
    );
    assert.equal(code(segs[1]).lang, 'python');
    assert.equal(code(segs[1]).code, 'print("boa noite")');
    assert.equal(code(segs[3]).lang, 'text');
    assert.equal(code(segs[3]).code, 'boa noite');
  });

  it('markdown SEM cerca nenhuma vira UM segmento de prosa', () => {
    const segs = splitTypewriterSegments('Só prosa, com `código inline` e **negrito**.');
    assert.equal(segs.length, 1);
    assert.equal(segs[0]?.kind, 'prose');
  });

  it('cerca SEM tag de linguagem → lang vazia (e papel de SAÍDA)', () => {
    const segs = splitTypewriterSegments('a\n\n```\nsem tag\n```\n');
    const block = code(segs.find((s) => s.kind === 'code'));
    assert.equal(block.lang, '');
    assert.equal(codeFenceRole(block.lang), 'output');
    assert.equal(block.code, 'sem tag');
  });

  it('info string com adornos vira só a primeira palavra em minúscula', () => {
    const segs = splitTypewriterSegments('```Python title="x"\nprint(1)\n```\n');
    assert.equal(code(segs[0]).lang, 'python');
  });

  it('cerca NÃO FECHADA consome o resto e nunca vaza a cerca para a prosa', () => {
    const md = 'antes\n\n```python\nprint(1)\nprint(2)';
    const segs = splitTypewriterSegments(md);
    assert.deepEqual(
      segs.map((s) => s.kind),
      ['prose', 'code'],
    );
    const block = code(segs[1]);
    assert.equal(block.unterminated, true);
    assert.deepEqual(block.lines, ['print(1)', 'print(2)']);
    assert.equal(prose(segs[0]).text.includes('`'), false);
  });

  it('CRASES INTERNAS: a cerca de 4+ crases do fenceFor() não é fechada pelo conteúdo', () => {
    const inner = 'print("```")';
    const fence = fenceFor(inner);
    assert.equal(fence, '````');
    const md = `x\n\n${fence}python\n${inner}\n${fence}\n`;
    const segs = splitTypewriterSegments(md);
    const block = code(segs.find((s) => s.kind === 'code'));
    assert.equal(block.unterminated, false);
    assert.equal(block.fence, '````');
    assert.equal(block.code, inner);
    // Só UM bloco: o run interno de 3 crases NÃO abriu nem fechou nada.
    assert.equal(segs.filter((s) => s.kind === 'code').length, 1);
  });

  it('crase na info string de uma cerca de crase NÃO abre bloco (CommonMark)', () => {
    const segs = splitTypewriterSegments('```a`b\nnão é bloco\n');
    assert.deepEqual(
      segs.map((s) => s.kind),
      ['prose'],
    );
  });

  it('cerca de TIS (~~~) também é reconhecida', () => {
    const segs = splitTypewriterSegments('~~~text\nsaída\n~~~\n');
    assert.equal(code(segs[0]).code, 'saída');
  });

  it('markdown vazio → nenhum segmento', () => {
    assert.deepEqual(splitTypewriterSegments(''), []);
  });
});

describe('codeFenceRole — o que o ALUNO escreve vs. o que o COMPUTADOR responde', () => {
  it('linguagem real → entrada', () => {
    for (const lang of ['python', 'py', 'javascript', 'ts', 'json', 'bash', 'c']) {
      assert.equal(codeFenceRole(lang), 'input', lang);
    }
  });

  it('tag de saída → saída (inclui a cerca SEM tag e o `text` do formatErrorBubble)', () => {
    for (const lang of ['', 'text', 'txt', 'output', 'saida', 'saída', 'console', 'stdout', 'log']) {
      assert.equal(codeFenceRole(lang), 'output', JSON.stringify(lang));
    }
  });

  it('a classificação não depende de caixa nem de espaço', () => {
    assert.equal(codeFenceRole('  TEXT '), 'output');
    assert.equal(normalizeFenceLang('  PYTHON  '), 'python');
  });
});

describe('safeProseCut — construto inline aparece INTEIRO ou não aparece', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['código `print` aqui', '`'],
    ['isto é **forte** demais', '*'],
    ['isto é *ênfase* leve', '*'],
    ['veja [o link](https://x) ali', '['],
    ['a fórmula $x^2$ importa', '$'],
    ['bloco $$a+b$$ display', '$'],
  ];
  for (const [text, delimiter] of cases) {
    it(`nunca revela ${delimiter} solto em: ${text}`, () => {
      const spans = atomicSpans(text);
      for (let cut = 0; cut <= text.length; cut += 1) {
        const shown = text.slice(0, safeProseCut(text, cut, spans));
        assert.equal(
          hasDanglingMarkdown(shown, text),
          false,
          `cut=${cut} mostrou sintaxe crua: ${JSON.stringify(shown)}`,
        );
      }
    });
  }

  it('cut no COMPRIMENTO devolve o comprimento (o snap nunca atrasa o fim)', () => {
    const text = 'tudo **junto** no fim `assim`';
    assert.equal(safeProseCut(text, text.length), text.length);
  });

  it('construtos ANINHADOS recuam até o de fora', () => {
    const text = 'a **b `c` d** e';
    const at = text.indexOf('c');
    assert.equal(safeProseCut(text, at), text.indexOf('**'));
  });

  it('marcador de bloco só aparece com o primeiro caractere de conteúdo', () => {
    const text = '# Título';
    assert.equal(safeProseCut(text, 1), 0);
    assert.equal(safeProseCut(text, 2), 0);
    assert.equal(safeProseCut(text, 3), 3);
  });

  it('snake_case NÃO vira ênfase (o `_` do meio da palavra é ignorado)', () => {
    const text = 'use minha_variavel_longa aqui';
    assert.equal(atomicSpans(text).filter((s) => s.reason === 'emphasis').length, 0);
  });
});

/**
 * "Sintaxe crua na tela" = um delimitador de markdown que está ABERTO no
 * trecho exibido e FECHADO no texto completo. É a definição operacional do
 * defeito: o aluno vê `**` porque o par ainda não chegou.
 */
function hasDanglingMarkdown(shown: string, full: string): boolean {
  if (shown.length === 0) return false;
  const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
  // Cerca de código NUNCA pode aparecer na prosa exibida.
  if (/^ {0,3}(`{3,}|~{3,})/m.test(shown)) return true;
  // Crase, asterisco, underline e cifrão ímpares no trecho, pareados no todo.
  const pairs: ReadonlyArray<readonly [RegExp, RegExp]> = [
    [/`/g, /`/g],
    [/\*\*/g, /\*\*/g],
    [/\$/g, /\$/g],
  ];
  for (const [reShown, reFull] of pairs) {
    if (count(shown, reShown) % 2 === 1 && count(full, reFull) % 2 === 0) return true;
  }
  // Link começado e não fechado.
  if (count(shown, /\[/g) !== count(shown, /\]/g)) return true;
  // Ênfase simples: número ÍMPAR de `*` isolados (fora de `**`).
  const singles = shown.replaceAll('**', '');
  if (count(singles, /\*/g) % 2 === 1 && count(full.replaceAll('**', ''), /\*/g) % 2 === 0) {
    return true;
  }
  return false;
}

describe('revealTypewriterSegments — a VARREDURA de todos os cortes da aula 1', () => {
  it('nenhum segmento revelado tem construto aberto (e a fatia CRUA da FONTE tem em 206)', () => {
    const md = longestSection();
    const segs = splitTypewriterSegments(md);
    let sourceOffenders = 0;
    for (let cut = 0; cut <= md.length; cut += 1) {
      // O que o código NOVO mostra.
      for (const seg of revealTypewriterSegments(segs, cut)) {
        if (seg.kind !== 'prose') continue;
        assert.equal(
          hasDanglingMarkdown((seg as RevealedProse).text, md),
          false,
          `cut=${cut}: ${JSON.stringify((seg as RevealedProse).text.slice(-40))}`,
        );
      }
      // O markdown-FONTE que o código ANTIGO retinha no MESMO corte. ATENÇÃO:
      // isto NÃO é a tela — é a string antes do parser. A tela está medida em
      // "a TELA renderizada" abaixo (41 de 565, não 206).
      if (hasDanglingMarkdown(md.slice(0, cut), md)) sourceOffenders += 1;
    }
    // EXATO, não piso: o número que o cabeçalho publica tem de ser o número que
    // a medição dá. Se a aula mudar, este teste quebra e o cabeçalho é
    // reescrito com a medição nova — nunca o contrário.
    assert.equal(
      sourceOffenders,
      206,
      `a FONTE retida deveria ter construto aberto em 206 cortes; teve em ${sourceOffenders}`,
    );
  });

  it('a CAIXA do bloco de código é reservada com a altura final antes de encher', () => {
    const md = longestSection();
    const segs = splitTypewriterSegments(md);
    const block = code(segs[1]);
    // Um caractere depois da cerca abrir, a caixa já existe com TODAS as linhas.
    const revealed = revealTypewriterSegments(segs, block.start + 1);
    const box = revealed.at(-1) as RevealedCode;
    assert.equal(box.kind, 'code');
    assert.equal(box.lines.length, 1);
    assert.equal(box.visibleLines, 0);
    assert.equal(box.complete, false);
  });

  it('linha de código é revelada INTEIRA (nunca meia linha)', () => {
    const md = 'a\n\n```python\nprimeira()\nsegunda()\n```\n';
    const segs = splitTypewriterSegments(md);
    const block = code(segs[1]);
    const seen = new Set<number>();
    for (let cut = 0; cut <= md.length; cut += 1) {
      const revealed = revealTypewriterSegments(segs, cut);
      const box = revealed.find((s) => s.kind === 'code') as RevealedCode | undefined;
      if (box) seen.add(box.visibleLines);
    }
    // 0 (caixa vazia), 1 e 2 — e nada entre elas: não existe "1,5 linha".
    assert.deepEqual([...seen].sort((a, b) => a - b), [0, 1, 2]);
    assert.equal(block.lines.length, 2);
  });

  it('no corte FINAL tudo está completo e o texto reconstruído é o original', () => {
    const md = longestSection();
    const segs = splitTypewriterSegments(md);
    const revealed = revealTypewriterSegments(segs, md.length);
    assert.equal(revealed.length, segs.length);
    for (const seg of revealed) assert.equal(seg.complete, true);
    const rebuilt = revealed
      .map((s) =>
        s.kind === 'prose'
          ? (s as RevealedProse).text
          : (s as RevealedCode).lines.join('\n'),
      )
      .join('');
    // Toda a prosa e todo o código voltaram; só as CERCAS ficaram de fora.
    for (const line of ['Olhe a linha de perto', 'print("boa noite")', 'boa noite']) {
      assert.ok(rebuilt.includes(line), line);
    }
    assert.equal(rebuilt.includes('```'), false);
  });

  it('segmento que ainda não começou não entra na lista', () => {
    const md = 'abc\n\n```python\nx\n```\n';
    const segs = splitTypewriterSegments(md);
    assert.equal(revealTypewriterSegments(segs, 0).length, 0);
    assert.equal(revealTypewriterSegments(segs, 2).length, 1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * A TELA RENDERIZADA — os DOIS pipelines rodados de verdade
 * ══════════════════════════════════════════════════════════════════════════
 * Todo o resto desta suíte mede STRINGS (o markdown-fonte retido, o texto do
 * segmento revelado). "Sintaxe crua NA TELA" é uma afirmação sobre o que sai
 * do parser, e só se prova renderizando. É o que este bloco faz: os 565 cortes,
 * nos dois pipelines, por `renderToStaticMarkup` — que é SSR puro e roda sem
 * DOM, sem jsdom e sem dependência nova.
 *
 *   ANTIGO = `<ReactMarkdown>{md.slice(0, cut)}</ReactMarkdown>`, sem plugins —
 *            exatamente o que `ChatBubble.tsx` fazia em `main` (o `components`
 *            de lá só trocava `pre`/`code` por `<Box component=…>` e repassava
 *            os children, então o TEXTO que chegava à tela era este).
 *   NOVO   = o `SegmentedMarkdown` REAL deste branch.
 *
 * POR QUE `import()` COM SPECIFIER COMPUTADO, E NÃO UM IMPORT NORMAL:
 * o projeto composite dos testes (`tsconfig.node.json`) compila com
 * `lib: ES2022` — SEM DOM — e sem `jsx`, DE PROPÓSITO: é a prova mecânica de
 * que os módulos testados aqui não dependem de DOM (o próprio arquivo diz isso
 * sobre `codeHighlight.ts`). Um `import` estático de um `.tsx` exigiria ligar
 * `jsx` e a lib DOM no projeto inteiro e APAGARIA essa garantia. O import
 * DINÂMICO com specifier computado carrega o componente REAL em runtime (o tsx
 * compila o .tsx) sem colocá-lo no grafo do tsc.
 */
const SEGMENTED_MARKDOWN_MODULE = new URL(
  '../src/components/chat/SegmentedMarkdown.tsx',
  import.meta.url,
).href;

type MarkdownPipeline = ComponentType<{ markdown: string; cut: number }>;

/** O TEXTO que chega à TELA: o HTML sem as folhas de estilo e sem as tags. */
function onScreen(html: string): string {
  return (
    html
      // As <style> do emotion trazem CSS (`calc(3 * var(…))`) que envenenaria
      // qualquer contagem de asterisco: elas saem ANTES das tags.
      .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]*>/g, '')
      .replaceAll('&quot;', '"')
      .replaceAll('&#x27;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      // `&amp;` por último: senão um `&amp;quot;` da aula viraria uma aspa.
      .replaceAll('&amp;', '&')
  );
}

/** Índices dos cortes cuja TELA tem construto aberto. */
function offendingCuts(screens: readonly string[], full: string): number[] {
  const out: number[] = [];
  screens.forEach((shown, cut) => {
    if (hasDanglingMarkdown(shown, full)) out.push(cut);
  });
  return out;
}

describe('a TELA renderizada — react-dom/server nos DOIS pipelines', () => {
  /** `screens[pipeline][cut]` = o texto visível naquele quadro. */
  const screens: { old: string[]; next: string[] } = { old: [], next: [] };

  before(async () => {
    // O banner de patrocínio do i18next iria para o stdout do runner.
    process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
    // `CodeBlock` usa `useTranslation`; sem instância o react-i18next avisa em
    // console a CADA render (seriam 565 avisos). Recursos vazios bastam: o
    // rótulo do bloco não participa de nenhuma contagem.
    await i18next.use(initReactI18next).init({ lng: 'pt', resources: { pt: { translation: {} } } });
    const { SegmentedMarkdown } = (await import(SEGMENTED_MARKDOWN_MODULE)) as {
      SegmentedMarkdown: MarkdownPipeline;
    };
    const md = longestSection();
    for (let cut = 0; cut <= md.length; cut += 1) {
      screens.old.push(
        onScreen(renderToStaticMarkup(createElement(ReactMarkdown, null, md.slice(0, cut)))),
      );
      screens.next.push(
        onScreen(
          renderToStaticMarkup(
            createElement(
              ThemeProvider,
              { theme },
              createElement(SegmentedMarkdown, { markdown: md, cut }),
            ),
          ),
        ),
      );
    }
  });

  it('pipeline NOVO: ZERO dos 565 cortes exibe sintaxe crua', () => {
    const md = longestSection();
    assert.equal(screens.next.length, md.length + 1);
    assert.deepEqual(offendingCuts(screens.next, md), []);
  });

  it('pipeline ANTIGO: 41 dos 565 cortes (7,3%) exibiam — o número dos cabeçalhos', () => {
    const md = longestSection();
    const offenders = offendingCuts(screens.old, md);
    // EXATO, não piso. Se a aula mudar, RE-MEÇA (`npm test -- este arquivo`) e
    // atualize o número aqui e nos três cabeçalhos de src/ que o citam:
    // ChatBubble.tsx, SegmentedMarkdown.tsx e lib/typewriterSegments.ts.
    assert.equal(offenders.length, 41, `cortes ofensores na tela: ${offenders.join(',')}`);
  });

  it('predicado ESTRITO: nenhuma crase e nenhum asterisco na tela (ANTIGO 45, NOVO 0)', () => {
    // Nesta seção crase e asterisco são SÓ sintaxe: a seção PRONTA não exibe
    // nenhum dos dois. Então "apareceu na tela" = "o aluno viu markdown cru",
    // sem depender de paridade — é o predicado mais duro possível aqui.
    assert.equal(/[`*]/.test(screens.old.at(-1) ?? ''), false);
    const raw = (frames: readonly string[]): number =>
      frames.filter((frame) => /[`*]/.test(frame)).length;
    assert.equal(raw(screens.next), 0);
    assert.equal(raw(screens.old), 45);
  });

  it('os 206 do markdown-FONTE não são 206 na tela: 165 já eram <pre><code> legítimo', () => {
    const md = longestSection();
    const fence = md.indexOf('```');
    assert.equal(fence, 394);
    let source = 0;
    let sourceAfterFence = 0;
    for (let cut = 0; cut <= md.length; cut += 1) {
      if (!hasDanglingMarkdown(md.slice(0, cut), md)) continue;
      source += 1;
      if (cut > fence) sourceAfterFence += 1;
    }
    assert.equal(source, 206);
    assert.equal(sourceAfterFence, 169);
    // Na TELA, desses 169 sobram 4: nos outros 165 o `<ReactMarkdown>` já tinha
    // formado a caixa de código e não havia NADA cru para o aluno ver. É a
    // diferença inteira entre o 206 publicado antes e o 41 medido agora.
    const screenAfterFence = offendingCuts(screens.old, md).filter((cut) => cut > fence);
    assert.equal(screenAfterFence.length, 4);
    assert.equal(source - sourceAfterFence, 41 - screenAfterFence.length);
  });
});

describe('o TEMPO da seção não mudou (contrato de velocidade de leitura intacto)', () => {
  it('o corte final chega no MESMO instante de antes — 20,1 s a 7 tps', () => {
    const md = longestSection();
    const seconds = md.length / (TYPEWRITER_TPS.theory * 4);
    assert.ok(Math.abs(seconds - 20.14) < 0.05, `${seconds}`);
    // `typewriterCut` continua sendo a ÚNICA fonte do corte: a segmentação lê
    // o mesmo número, não o substitui.
    const cutAtEnd = typewriterCut(md, Math.ceil(seconds * 1000), TYPEWRITER_TPS.theory);
    assert.equal(cutAtEnd, md.length);
    const revealed = revealTypewriterSegments(splitTypewriterSegments(md), cutAtEnd);
    for (const seg of revealed) assert.equal(seg.complete, true);
  });

  it('cada seção da AULA 1 completa exatamente quando o corte cru completava', () => {
    for (const section of lesson1Sections()) {
      const md = assembled(section);
      const segs = splitTypewriterSegments(md);
      const beforeEnd = revealTypewriterSegments(segs, md.length - 1);
      const atEnd = revealTypewriterSegments(segs, md.length);
      assert.equal(
        atEnd.every((s) => s.complete),
        true,
        section.id,
      );
      assert.equal(
        beforeEnd.every((s) => s.complete),
        false,
        `${section.id}: completou ANTES do último caractere`,
      );
    }
  });
});
