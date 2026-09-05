/**
 * src/lib/typewriterSegments.ts — a DIGITAÇÃO deixa de fatiar markdown CRU.
 *
 * ─── O DEFEITO QUE ESTE MÓDULO EXISTE PARA CORRIGIR ───────────────────────
 * Reclamação direta do dono: "a maneira como está escrevendo o código também
 * [está ruim]". A causa medida: `TypewriterText` cortava o markdown CRU por
 * caractere (`text.slice(0, cut)`) e o `<ReactMarkdown>` re-parseava o
 * FRAGMENTO a cada 35,7 ms (o passo de `typewriterDelayPerChar(7)`). O que o
 * aluno via, quadro a quadro — cortes MEDIDOS na seção mais longa da aula 1,
 * renderizada de verdade com `react-dom/server` (tests/typewriterSegments.test.ts):
 *
 *     corte 395  "`"    → crase solta como texto
 *     corte 396  "``"   → duas crases soltas   (2 quadros ≈ 71 ms de cerca crua)
 *     corte 397  "```"  → o parser fecha a cerca e o que aparece é uma CAIXA
 *                         VAZIA de código, que só depois enche
 *     corte 424  "…print("boa noite")\n`" → o backtick de FECHAMENTO aparece
 *                         DENTRO do bloco de código (outros 2 quadros)
 *
 * e o mesmo com `**` antes de o negrito "estalar", crases de código inline, e
 * `$x^2$` em três estados de LaTeX quebrado. Somando todos os construtos da
 * seção, 41 dos 565 cortes (7,3%) exibiam sintaxe crua na tela; com este
 * módulo, ZERO. A cada estalo a FONTE muda
 * (proporcional → mono) e a largura muda: reflow contínuo, a bolha inteira
 * redimensionando a cada caractere.
 *
 * O precedente correto já existia na base e nunca foi aplicado à teoria: a
 * bolha de ERRO (que também contém código) usa `instant`, e `fenceFor()`
 * (trackLessonState.ts) já resolve cerca-dentro-de-conteúdo. Este módulo
 * generaliza a decisão: **conteúdo com código não se digita letra a letra**.
 *
 * ─── A REGRA DURA ─────────────────────────────────────────────────────────
 * Em NENHUM instante o aluno vê crase, asterisco ou cerca como texto. Isso
 * vale nos dois eixos:
 *   1. BLOCO de código (cerca): sai do fluxo de caracteres. A cerca nunca é
 *      revelada; o bloco aparece já formatado, revelado LINHA A LINHA (nunca
 *      meia linha — meio token destruiria o highlight);
 *   2. PROSA: o corte é SNAPADO para trás até uma fronteira segura
 *      (`safeProseCut`) — um construto inline (`código`, **negrito**, [link],
 *      $fórmula$, marcador de lista/título) aparece INTEIRO ou não aparece.
 *
 * ─── O TEMPO NÃO MUDA (e é por isso que o golden master continua verde) ────
 * `tests/lessonTypewriterReadingSpeed.test.ts` trava 28 chars/s = 7 tps para a
 * teoria, e o teto de ~21 s por seção. Este módulo NÃO toca `typewriterCut`,
 * `typewriterDelayPerChar` nem `TYPEWRITER_TPS` — ele é uma função do MESMO
 * `cut` que aquelas funções já produzem. O relógio segue contando TODOS os
 * caracteres do markdown cru, cercas incluídas:
 *   - a prosa é revelada no mesmo instante de sempre (o snap só pode ATRASAR
 *     um construto por alguns caracteres, e às `cut = text.length` finais
 *     `safeProseCut` devolve o comprimento cheio — nenhum segmento termina
 *     depois);
 *   - o bloco de código consome o mesmo orçamento de caracteres que consumia,
 *     só que gasta esse tempo revelando LINHAS em vez de caracteres crus.
 * Resultado: `duração total da seção` é bit-a-bit a de antes. Nada a
 * renegociar no contrato de velocidade.
 *
 * ─── PURO DE PROPÓSITO ────────────────────────────────────────────────────
 * Zero React, zero DOM: `src/lib` é compilado pelo `tsconfig.node.json` (lib
 * ES2022, SEM DOM) e é daqui que os testes `node:test` leem, sem jsdom.
 */

/* ─── Vocabulário ─────────────────────────────────────────────────────────── */

/** Um segmento é PROSA (markdown corrente) ou um BLOCO de código cercado. */
export type TypewriterSegmentKind = 'prose' | 'code';

/**
 * Trecho que precisa ser revelado ATOMICAMENTE — revelar metade dele mostraria
 * a sintaxe crua (`**`, crase, `$`, `](`) ou trocaria o bloco de baixo do
 * leitor (`#` virando parágrafo antes de virar título).
 */
export interface AtomicSpan {
  readonly from: number;
  readonly to: number;
  /** Por que este trecho é atômico — só para diagnóstico e teste. */
  readonly reason:
    | 'code-span'
    | 'math'
    | 'link'
    | 'strong'
    | 'emphasis'
    | 'block-marker'
    | 'thematic-break';
}

export interface ProseSegment {
  readonly kind: 'prose';
  /** Markdown CRU deste trecho (o `<ReactMarkdown>` recebe fatias dele). */
  readonly text: string;
  /** Trechos atômicos JÁ calculados — `revealTypewriterSegments` não regex-a por tick. */
  readonly atomic: readonly AtomicSpan[];
  /** Offset inicial no markdown original. */
  readonly start: number;
  /** Offset final (exclusivo) no markdown original. */
  readonly end: number;
}

export interface CodeSegment {
  readonly kind: 'code';
  /** Info string da cerca, minúscula e só a primeira palavra ('' quando ausente). */
  readonly lang: string;
  /** Conteúdo do bloco, SEM cercas. */
  readonly code: string;
  /** As linhas de `code`. Vazio quando o bloco não tem conteúdo. */
  readonly lines: readonly string[];
  /** A cerca literal que ABRIU o bloco (``` , ```` , ~~~ …). */
  readonly fence: string;
  /** true quando o markdown acabou sem cerca de fechamento. */
  readonly unterminated: boolean;
  readonly start: number;
  /** Offset da 1ª linha de CONTEÚDO (logo após a linha da cerca de abertura). */
  readonly contentStart: number;
  readonly end: number;
}

export type TypewriterSegment = ProseSegment | CodeSegment;

/**
 * Papel do bloco na AULA — o defeito pedagógico que a §13 do briefing nomeia:
 * ```python``` (o que o ALUNO escreve) e ```text``` (o que o COMPUTADOR
 * responde) renderizavam como a MESMA caixa cinza, e o aluno não distinguia um
 * do outro.
 *
 * O mapa NÃO foi inventado: ele lê os emissores REAIS desta base —
 * `formatErrorBubble` (trackLessonState.ts) emite `${fence}text` para a SAÍDA
 * do runner e `${fence}` + a linguagem para o CÓDIGO SUBMETIDO; as trilhas em
 * `resources/tracks/**\/lesson.json` trazem `code.language` (hoje `python`)
 * para o código da teoria. Tudo que não é saída é entrada.
 */
export type CodeFenceRole = 'input' | 'output';

/** Tags que significam "isto é resposta do computador", não código-fonte. */
export const OUTPUT_FENCE_TAGS: readonly string[] = [
  '',
  'text',
  'txt',
  'plain',
  'plaintext',
  'output',
  'out',
  'saida',
  'saída',
  'console',
  'stdout',
  'stderr',
  'log',
] as const;

/** `input` (código que o aluno escreve) vs `output` (o que o computador responde). */
export function codeFenceRole(lang: string): CodeFenceRole {
  return OUTPUT_FENCE_TAGS.includes(normalizeFenceLang(lang)) ? 'output' : 'input';
}

/** Info string → tag canônica: primeira palavra, minúscula, sem espaços. */
export function normalizeFenceLang(info: string): string {
  return (info.trim().split(/[\s,{]/, 1)[0] ?? '').toLowerCase();
}

/* ─── Segmentação ─────────────────────────────────────────────────────────── */

/**
 * Linha de ABERTURA de cerca (CommonMark §4.5): até 3 espaços de recuo, 3+
 * crases ou 3+ tis, e a info string. Numa cerca de CRASE a info string não
 * pode conter crase — é o que separa "abriu um bloco" de "escreveu `a` e `b`".
 */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/;

/** Fecha uma cerca de `char` com pelo menos `len` repetições e nada mais. */
function fenceCloseRe(char: string, len: number): RegExp {
  return new RegExp(`^ {0,3}\\${char}{${len},}[ \\t]*$`);
}

/**
 * Parte o markdown em PROSA e BLOCOS DE CÓDIGO, preservando ordem, offsets e o
 * conteúdo exato — concatenar `markdown.slice(seg.start, seg.end)` de todos os
 * segmentos reconstrói o original byte a byte.
 */
export function splitTypewriterSegments(markdown: string): readonly TypewriterSegment[] {
  const segments: TypewriterSegment[] = [];
  if (markdown.length === 0) return segments;

  const lines = markdown.split('\n');
  const lineStart: number[] = [];
  let acc = 0;
  for (const line of lines) {
    lineStart.push(acc);
    acc += line.length + 1;
  }

  const pushProse = (from: number, to: number): void => {
    if (to <= from) return;
    const text = markdown.slice(from, to);
    segments.push({ kind: 'prose', text, atomic: atomicSpans(text), start: from, end: to });
  };

  let proseFrom = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const open = FENCE_OPEN.exec(line);
    const fence = open?.[1] ?? '';
    const info = (open?.[2] ?? '').trim();
    // Cerca de crase com crase na info string NÃO abre bloco (CommonMark).
    if (open === null || (fence.startsWith('`') && info.includes('`'))) {
      i += 1;
      continue;
    }

    const start = lineStart[i] ?? 0;
    pushProse(proseFrom, start);

    const closeRe = fenceCloseRe(fence[0] ?? '`', fence.length);
    let j = i + 1;
    while (j < lines.length && !closeRe.test(lines[j] ?? '')) j += 1;
    const unterminated = j >= lines.length;
    // A cerca não fechada consome o resto do markdown — nunca "vaza" a cerca
    // de volta para a prosa.
    const lastLine = unterminated ? lines.length - 1 : j;
    const contentLines = lines.slice(i + 1, unterminated ? lines.length : j);
    const contentStart = i + 1 < lines.length ? (lineStart[i + 1] ?? markdown.length) : markdown.length;
    const end = Math.min(
      markdown.length,
      (lineStart[lastLine] ?? 0) + (lines[lastLine] ?? '').length + 1,
    );

    segments.push({
      kind: 'code',
      lang: normalizeFenceLang(info),
      code: contentLines.join('\n'),
      lines: contentLines,
      fence,
      unterminated,
      start,
      contentStart,
      end,
    });

    proseFrom = end;
    i = lastLine + 1;
  }
  pushProse(proseFrom, markdown.length);
  return segments;
}

/* ─── Corte SEGURO da prosa ───────────────────────────────────────────────── */

/**
 * Trechos atômicos da prosa. A ordem importa: os CODE SPANS são achados
 * primeiro e mascaram o resto, senão um `*` dentro de `` `a*b` `` inventaria
 * uma ênfase gigante e o corte voltaria longe demais.
 */
export function atomicSpans(text: string): readonly AtomicSpan[] {
  const spans: AtomicSpan[] = [];
  const masked = new Array<boolean>(text.length).fill(false);

  for (const span of codeSpans(text)) {
    spans.push(span);
    for (let k = span.from; k < span.to; k += 1) masked[k] = true;
  }

  const addMatches = (re: RegExp, reason: AtomicSpan['reason']): void => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      if (masked[m.index] !== true) {
        spans.push({ from: m.index, to: m.index + m[0].length, reason });
      }
    }
  };

  // Matemática ANTES de ênfase: `$a_i$` tem `_` que viraria itálico.
  addMatches(/\$\$[\s\S]+?\$\$/g, 'math');
  addMatches(/\$[^$\n]+\$/g, 'math');
  addMatches(/!?\[[^\]\n]*\]\([^)\n]*\)/g, 'link');
  addMatches(/\*\*[^\n]+?\*\*/g, 'strong');
  addMatches(/(?<![A-Za-z0-9_])__[^\n]+?__(?![A-Za-z0-9_])/g, 'strong');
  addMatches(/\*[^\s*][^\n]*?\*/g, 'emphasis');
  addMatches(/(?<![A-Za-z0-9_])_[^\s_][^\n]*?_(?![A-Za-z0-9_])/g, 'emphasis');
  // Marcador de bloco + o PRIMEIRO caractere de conteúdo: sem isso, "#"
  // sozinho renderiza como parágrafo e vira <h1> um caractere depois — o bloco
  // troca debaixo do leitor. O espaço é opcional no padrão porque o "-" antes
  // do próprio espaço já renderiza como item de lista vazio.
  addMatches(/^[ \t]*(?:#{1,6}[ \t]*|[-*+][ \t]*|\d+[.)][ \t]*|>[ \t]*)./gm, 'block-marker');
  addMatches(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, 'thematic-break');

  spans.sort((a, b) => a.from - b.from || b.to - a.to);
  return spans;
}

/** Pares de crases (run de N fechado por run de N) — código INLINE. */
function codeSpans(text: string): AtomicSpan[] {
  const spans: AtomicSpan[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '`') {
      i += 1;
      continue;
    }
    let open = 0;
    while (i + open < text.length && text[i + open] === '`') open += 1;
    let j = i + open;
    let close = -1;
    while (j < text.length) {
      if (text[j] !== '`') {
        j += 1;
        continue;
      }
      let run = 0;
      while (j + run < text.length && text[j + run] === '`') run += 1;
      if (run === open) {
        close = j + run;
        break;
      }
      j += run;
    }
    if (close >= 0) {
      spans.push({ from: i, to: close, reason: 'code-span' });
      i = close;
    } else {
      i += open;
    }
  }
  return spans;
}

/**
 * Maior corte SEGURO <= `cut`: se o corte cai DENTRO de um trecho atômico, ele
 * recua para o início daquele trecho (e repete, porque construtos aninham —
 * `**um `código` aqui**`). Em `cut = text.length` devolve o próprio
 * comprimento: nenhum segmento termina mais tarde por causa do snap.
 */
export function safeProseCut(
  text: string,
  cut: number,
  spans: readonly AtomicSpan[] = atomicSpans(text),
): number {
  let result = Math.max(0, Math.min(text.length, cut));
  for (let guard = 0; guard <= spans.length; guard += 1) {
    let moved = false;
    for (const span of spans) {
      if (span.from < result && result < span.to) {
        result = span.from;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return result;
}

/* ─── Revelação ───────────────────────────────────────────────────────────── */

export interface RevealedProse {
  readonly kind: 'prose';
  /** Markdown VÁLIDO (nunca meio construto) pronto para o `<ReactMarkdown>`. */
  readonly text: string;
  readonly complete: boolean;
}

export interface RevealedCode {
  readonly kind: 'code';
  readonly lang: string;
  readonly role: CodeFenceRole;
  /**
   * O código INTEIRO. Vem por referência do segmento (nunca recomposto por
   * tick): é a chave de memoização do highlight no `CodeBlock`, e um
   * `lines.join()` novo a cada quadro re-parsearia a gramática 28x/s.
   */
  readonly code: string;
  /** TODAS as linhas — a caixa é reservada com a altura final antes de encher. */
  readonly lines: readonly string[];
  /** Quantas linhas já foram reveladas (0 = só a caixa vazia). */
  readonly visibleLines: number;
  readonly complete: boolean;
  readonly unterminated: boolean;
}

export type RevealedSegment = RevealedProse | RevealedCode;

/**
 * O estado VISÍVEL para um corte `cut` do markdown cru — a única função que a
 * UI chama por tick.
 *
 * Regras:
 *   - segmento que ainda não começou (`cut <= start`) não entra na lista;
 *   - a caixa do bloco de código entra assim que o corte passa da CERCA de
 *     abertura, já com todas as linhas (altura final) — a partir daí encher o
 *     bloco não reflowa mais nada;
 *   - uma linha de código é revelada quando o corte passa do seu PRIMEIRO
 *     caractere: linha inteira ou nada. Meia linha quebraria o highlight no
 *     meio de um token;
 *   - prosa cujo corte seguro é 0 não entra (renderizar `<p>` vazio faria a
 *     bolha pular de altura).
 */
export function revealTypewriterSegments(
  segments: readonly TypewriterSegment[],
  cut: number,
): readonly RevealedSegment[] {
  const out: RevealedSegment[] = [];
  for (const seg of segments) {
    if (cut <= seg.start) continue;
    if (seg.kind === 'prose') {
      const local = Math.min(seg.text.length, cut - seg.start);
      const safe = safeProseCut(seg.text, local, seg.atomic);
      if (safe <= 0) continue;
      out.push({
        kind: 'prose',
        text: seg.text.slice(0, safe),
        complete: local >= seg.text.length,
      });
      continue;
    }
    let visible = 0;
    let offset = seg.contentStart;
    for (const line of seg.lines) {
      if (cut > offset) visible += 1;
      offset += line.length + 1;
    }
    if (cut >= seg.end) visible = seg.lines.length;
    out.push({
      kind: 'code',
      lang: seg.lang,
      role: codeFenceRole(seg.lang),
      code: seg.code,
      lines: seg.lines,
      visibleLines: visible,
      complete: visible >= seg.lines.length,
      unterminated: seg.unterminated,
    });
  }
  return out;
}
