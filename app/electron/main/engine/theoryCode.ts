/**
 * app/electron/main/engine/theoryCode.ts — o código que vive DENTRO da teoria.
 *
 * Problema real: o orçamento de uma aula não pode ser medido só nos desafios.
 * A construção não ensinada aparece PRIMEIRO na teoria — a aula 1 da trilha
 * atual despeja `function`, `if`, `typeof`, `!==`, `throw`, `new Error` e
 * `return` numa única seção chamada "Exemplo completo", que é a solução literal
 * do desafio. Se o extrator só olhar `challenge.json`, ele mede o sintoma e
 * perde a causa.
 *
 * Premissa (a regra de higiene que torna isso decidível):
 *
 *   BLOCO CERCADO COM TAG DE LINGUAGEM  → é CÓDIGO, entra na análise.
 *   CRASE INLINE                        → é PROSA, nunca entra.
 *   BLOCO CERCADO SEM TAG               → é DEFEITO DE FORMATO, reportado.
 *   BLOCO COM TAG `js` QUE NÃO PARSEIA  → é ERRO, nunca silêncio.
 *
 * A regra não é estética. Medido na trilha atual: 68 de 262 blocos cercados
 * (26%) não declaram linguagem, e spans de crase inline como `total: 3`,
 * `nome: string` e `arquivo:linha:coluna` são JavaScript sintaticamente válido
 * — parseiam como `LabeledStatement` e ENVENENAM o orçamento medido, criando
 * construções fantasma que ninguém escreveu. Tratar crase inline como código é
 * a forma mais fácil de fazer o gate mentir.
 *
 * O que este arquivo NÃO faz: não parseia JavaScript (é `extract.ts`) e não
 * decide o que é permitido (é `budget.ts`). Ele só separa código de prosa.
 *
 * Referência: `docs/16-engine-de-trilha.md` §5.3.
 */

/** Tags de bloco cercado que a engine trata como JavaScript executável. */
export const JS_FENCE_TAGS: ReadonlySet<string> = new Set([
  'js',
  'javascript',
  'mjs',
  'cjs',
  'node',
  'jsx',
]);

/** Um bloco de código encontrado na teoria. */
export interface TheoryCodeBlock {
  /** de onde veio: bloco cercado do markdown ou o campo `code` da seção. */
  origin: 'fence' | 'section-code';
  /** tag declarada (`js`, `bash`, …) ou string vazia quando ausente. */
  tag: string;
  code: string;
  /** linha (1-based) em que o bloco começa dentro do markdown de origem. */
  line: number;
  /** true quando a tag indica JavaScript e o bloco deve ser analisado. */
  isJavaScript: boolean;
}

/** Defeito de FORMATO — não é violação de orçamento, é higiene do gerador. */
export interface TheoryHygieneIssue {
  code: 'FENCE_SEM_TAG';
  message: string;
  line: number;
}

export interface TheoryCodeResult {
  blocks: TheoryCodeBlock[];
  hygiene: TheoryHygieneIssue[];
}

/**
 * Separa blocos cercados do markdown. PURO: não abre arquivo, não parseia JS.
 *
 * Reconhece cerca de 3 ou mais crases/tis, respeitando o comprimento de
 * abertura — uma cerca de 4 crases só fecha com 4 ou mais, que é como o
 * CommonMark define e é o que permite mostrar markdown dentro de markdown.
 */
export function extractFencedBlocks(markdown: string): TheoryCodeResult {
  const lines = markdown.split('\n');
  const blocks: TheoryCodeBlock[] = [];
  const hygiene: TheoryHygieneIssue[] = [];

  let open: { fence: string; tag: string; line: number; body: string[] } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/.exec(line);

    if (open === null) {
      if (match) {
        open = { fence: match[1], tag: match[2].toLowerCase(), line: i + 1, body: [] };
      }
      continue;
    }

    // Fechamento: mesma família de cerca, comprimento >= o de abertura, sem tag.
    const closing =
      match !== null &&
      match[1][0] === open.fence[0] &&
      match[1].length >= open.fence.length &&
      match[2] === '';

    if (closing) {
      const tag = open.tag;
      if (tag === '') {
        hygiene.push({
          code: 'FENCE_SEM_TAG',
          message:
            'bloco de código sem tag de linguagem — a engine não consegue decidir se é código ou texto; declare ```js (ou a linguagem real)',
          line: open.line,
        });
      }
      blocks.push({
        origin: 'fence',
        tag,
        code: open.body.join('\n'),
        line: open.line,
        isJavaScript: JS_FENCE_TAGS.has(tag),
      });
      open = null;
      continue;
    }

    open.body.push(line);
  }

  // Cerca aberta e nunca fechada: o conteúdo restante ainda é analisado, para
  // não perder construção só porque o gerador esqueceu a cerca de fechamento.
  if (open !== null) {
    hygiene.push({
      code: 'FENCE_SEM_TAG',
      message: 'bloco de código aberto e nunca fechado',
      line: open.line,
    });
    blocks.push({
      origin: 'fence',
      tag: open.tag,
      code: open.body.join('\n'),
      line: open.line,
      isJavaScript: JS_FENCE_TAGS.has(open.tag),
    });
  }

  return { blocks, hygiene };
}

/** Uma seção de teoria, no formato de `TrackLessonSource['theory'][number]`. */
export interface TheorySectionLike {
  id?: string;
  markdown?: string;
  code?: { language?: string; code?: string };
}

/**
 * Todo o código de uma aula: os blocos cercados da prosa MAIS o campo `code`
 * das seções.
 *
 * O campo `code` das seções é a metade que o validador semântico existente
 * ignora: `theoryMarkdown()` em `challengeContextValidator.ts` concatena apenas
 * `section.markdown` e descarta `section.code` — são 93 das 118 aulas com bloco
 * de código, cerca de 124 mil caracteres invisíveis ao juiz. Um gate cego a
 * metade do que a aula ensina erra nos dois sentidos: aprova desafio que cobra
 * o que não foi ensinado e reprova aula que ensinou direito.
 */
export function collectLessonCode(sections: readonly TheorySectionLike[]): TheoryCodeResult {
  const blocks: TheoryCodeBlock[] = [];
  const hygiene: TheoryHygieneIssue[] = [];

  for (const section of sections) {
    if (typeof section.markdown === 'string' && section.markdown.length > 0) {
      const fenced = extractFencedBlocks(section.markdown);
      blocks.push(...fenced.blocks);
      hygiene.push(...fenced.hygiene);
    }
    const code = section.code;
    if (code && typeof code.code === 'string' && code.code.trim().length > 0) {
      const language = (code.language ?? '').toLowerCase();
      blocks.push({
        origin: 'section-code',
        tag: language,
        code: code.code,
        line: 1,
        isJavaScript: language === '' ? true : JS_FENCE_TAGS.has(language),
      });
    }
  }

  return { blocks, hygiene };
}
