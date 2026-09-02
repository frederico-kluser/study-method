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

import {
  DEFAULT_ADAPTER_ID,
  adapterIdForTheoryTag,
  getAdapter,
  type LanguageId,
} from './lang/registry';

/**
 * Tags de bloco cercado que a engine trata como JavaScript executável.
 *
 * VEM DO ADAPTADOR desde a onda do registro (§6 de
 * `docs/research/08-multilingua-trava-deterministica.md`): o conjunto é o
 * `theoryFenceTags` de `engine/lang/javascript.ts`, e não mais uma lista solta
 * aqui. O símbolo continua exportado porque `engine/quality/progressao.ts:79`
 * o importa.
 *
 * ONDA 5: quem quiser saber "qual parser este bloco recebe" NÃO deve usar este
 * conjunto — deve usar `block.adapterId` (abaixo) ou
 * `adapterIdForTheoryTag(tag)` do registro. Este `Set` é a resposta de UMA
 * linguagem a uma pergunta que passou a ter N respostas.
 */
export const JS_FENCE_TAGS: ReadonlySet<string> = new Set(getAdapter('javascript').theoryFenceTags);

/** Um bloco de código encontrado na teoria. */
export interface TheoryCodeBlock {
  /** de onde veio: bloco cercado do markdown ou o campo `code` da seção. */
  origin: 'fence' | 'section-code';
  /** tag declarada (`js`, `bash`, …) ou string vazia quando ausente. */
  tag: string;
  code: string;
  /** linha (1-based) em que o bloco começa dentro do markdown de origem. */
  line: number;
  /**
   * ADITIVO (onda do registro de linguagens): o ADAPTADOR que deve parsear
   * este bloco, ou `null` quando o bloco não vai a parser nenhum (tag de
   * dado/prosa, tag desconhecida, ou cerca sem tag).
   *
   * É este campo, e não `isJavaScript`, que a onda 5 deve consumir: ele é a
   * resposta do §6 (linha 954) — "é ela que diz ao extrator qual parser
   * aplicar a cada bloco cercado da teoria".
   */
  adapterId: LanguageId | null;
  /**
   * true quando a tag indica JavaScript e o bloco deve ser analisado.
   *
   * CAMPO DERIVADO, MANTIDO DE PROPÓSITO: `engine/budget.ts:210`,
   * `engine/audit.ts:355` e `engine/quality/progressao.ts:301` fazem
   * `if (!block.isJavaScript) continue;` — e três testes o afirmam
   * (`tests/engineBudgetGate.test.ts:245-269`). Removê-lo nesta onda seria
   * mudança de comportamento em arquivos de outra sub-tarefa. É EXATAMENTE
   * `adapterId === 'javascript'`; a onda 5 troca os três `continue` por
   * `block.adapterId !== <o adaptador da trilha>` e o campo sai.
   */
  isJavaScript: boolean;
}

/**
 * Monta o par (`adapterId`, `isJavaScript`) de um bloco a partir da tag —
 * ponto ÚNICO de decisão, para que a assimetria documentada em
 * `collectLessonCode` não se espalhe.
 */
function resolverAdaptador(tag: string): { adapterId: LanguageId | null; isJavaScript: boolean } {
  const adapterId = adapterIdForTheoryTag(tag);
  return { adapterId, isJavaScript: adapterId === 'javascript' };
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
        ...resolverAdaptador(tag),
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
      ...resolverAdaptador(open.tag),
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
      // O DEFAULT DE BLOCO SEM TAG, e a assimetria que ele cria (§6, linha 956
      // de docs/research/08: "68 de 262 blocos da trilha atual não têm tag de
      // linguagem nenhuma"):
      //
      //   campo `code` da seção SEM language → DEFAULT_ADAPTER_ID (javascript)
      //   cerca ``` SEM tag                  → adaptador NENHUM (não analisado)
      //
      // Parece incoerente e não é. Uma CERCA sem tag no meio da prosa pode ser
      // qualquer coisa (saída de terminal, tabela, pseudocódigo) — analisá-la
      // como JavaScript é a forma mais fácil de envenenar o orçamento com
      // construções fantasma, e por isso ela vira FENCE_SEM_TAG (defeito de
      // formato) e fica de fora. Já o CAMPO `code` de uma seção é, por
      // construção do schema, o trecho de código da aula: se ele existe, é
      // código; a tag ausente é omissão de metadado, não dúvida sobre a
      // natureza do conteúdo.
      //
      // Este é o comportamento de HOJE (`isJavaScript: language === '' ? true
      // : JS_FENCE_TAGS.has(language)`), preservado byte a byte porque
      // `engine/budget.ts:210` e `engine/audit.ts:355` dependem dele.
      const resolvido =
        language === ''
          ? { adapterId: DEFAULT_ADAPTER_ID, isJavaScript: DEFAULT_ADAPTER_ID === 'javascript' }
          : resolverAdaptador(language);
      blocks.push({
        origin: 'section-code',
        tag: language,
        code: code.code,
        line: 1,
        ...resolvido,
      });
    }
  }

  return { blocks, hygiene };
}
