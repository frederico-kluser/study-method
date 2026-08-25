/**
 * electron/main/services/deepseekLessonAuthor.ts — AUTOR (AuthorFn) da cadeia
 * LESSON-ORCHESTRATOR sobre o cliente DeepSeek one-shot.
 *
 * Recebe { subject, findings, memory? } e devolve um LessonDraft (aula markdown +
 * desafios), validado. É a fiação da autoria por LLM — a UI chama
 * `study:generate-lesson` que passa aqui por `createDeepSeekLessonAuthor`.
 *
 * - Sistema pt-BR com a PEDAGOGIA do tutor study-method (struct da aula).
 * - Temperature 0.2 (criativo mas aderente ao layout).
 * - Parse JSON robusto reutilizando `extractFirstJsonObject` do deepseekLlmJudge.
 * - Valida o LessonDraft (campos obrigatórios, arrays >= 1, textos não vazios,
 *   scenarios com example+boundary+error mínimos) — draft inválido lança erro
 *   claro identificando a parte que faltou.
 * - Sem chave configurada → DeepSeekError KEY_MISSING (a fiação não degrada em
 *   silêncio: autoria é obrigatória para a aula; diferente do juiz que degrada).
 *
 * NÃO importa electron; o cliente é injetável (testes isolam o autor do
 * transporte). O modelo default é o do cliente (DEEPSEEK_MODEL.id), sobrescrito
 * por `deps.model`.
 */

import { DEEPSEEK_ERROR_CODES, DeepSeekError, createDeepSeekClient, type DeepSeekClient } from './deepseekClient';
import { extractFirstJsonObject } from './deepseekLlmJudge';
import type {
  AuthorFn,
  ChallengeDraft,
  LessonDraft,
  ScenarioDraft,
  ScenarioType,
} from './lessonTypes';
import type { AuthorMemory } from './lessonTypes';

export interface DeepSeekLessonAuthorDeps {
  /** Cliente injetável (testes). Default: novo cliente com getApiKey. */
  client?: DeepSeekClient;
  /** Resolve a chave DeepSeek sob demanda. Default: '' (⇒ chave ausente). */
  getApiKey?: () => Promise<string>;
  /** Sobrescreve o model (default: DEEPSEEK_MODEL.id no cliente). */
  model?: string;
}

/** Linguagens suportadas pelo layout dos scripts (docs/05 §2). */
const SUPPORTED_LANGUAGES = ['python', 'javascript', 'go', 'rust', 'c'] as const;

/**
 * Nome da FUNÇÃO-PRINCIPAL de um desafio derivado do SLUG, no formato EXATO que a
 * semente do desafio usa (challenge-new.sh: `FUNC_SNAKE`/`FUNC_CAMEL`/`FUNC_NAME`).
 *
 * O autor precisa deste mapeamento porque a materialização/validação é RÍGIDA:
 * challenge-new.sh gera `empty_stub`, `reference` e `reference_alt_*` com um nome
 * canônico derivado do slug (--slug), e o harness (challenge-verify.sh) COPIA um
 * desses por cima do stub do aluno para rodar os testes. Se o `stubCode` (ou o
 * `testCode`) da autoria declarar/chamar a função com OUTRO nome, o teste falha
 * na linha de import/chamada (ex.: Python `ImportError: cannot import name`), e o
 * desafio é rejeitado na validação (`verify` veredito != approved).
 *
 * Regra (espelha challenge-new.sh):
 *   snake = slug com '-' → '_'; se começar com dígito prefixa `f_`
 *   camel = snake → PascalCase (cada parte com a inicial maiúscula)
 *   go                              → FUNC_NAME = camel  (função exportada em Go)
 *   python | javascript | rust | c  → FUNC_NAME = snake  (identificador local)
 *
 * `language` é normalizado (node → javascript; fora do enum → python).
 */
export function slugifyToFunctionName(slug: string, language: string): string {
  const lang = (language || '').trim().toLowerCase().replace(/^node$/, 'javascript');
  let snake = (slug || '')
    .trim()
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/[^a-z0-9_-]+/g, '')
    .replace(/^-+|-+$/g, '')
    .replace(/-/g, '_');
  if (!snake) snake = 'f';
  if (/^[0-9]/.test(snake)) snake = `f_${snake}`;

  if (lang === 'go') {
    // snake_case → PascalCase (função exportada do pacote de Go).
    return snake
      .split('_')
      .filter((p) => p.length > 0)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join('');
  }
  return snake;
}

/** System prompt pt-BR — pedagogia do tutor study-method. */
const SYSTEM_PROMPT_PT_BR =
  'Você é o autor de aulas do tutor study-method. Você recebe um ASSUNTO, ' +
  'as FINDINGS (fontes) da pesquisa e opcionalmente a MEMÓRIA do aluno, e deve ' +
  'produzir APENAS um objeto JSON — sem markdown fora dele, sem texto ao redor. ' +
  'O JSON segue EXATAMENTE este layout:\n' +
  '{\n' +
  '  "lessonTitle": "<título da aula em pt-BR>",\n' +
  '  "lessonMarkdown": "<markdown completo da aula: introdução com analogia do ' +
  'cotidiano, explicação do conceito, um WORKED EXAMPLE resolvido passo a passo, ' +
  'e uma seção de prática com exercícios>",\n' +
  '  "challenges": [ <1 a 2 desafios, nunca mais que 2> ]\n' +
  '}\n' +
  'Cada desafio usa ESTE layout:\n' +
  '{\n' +
  '  "slug": "<kebab-case, ex. de-duplicacao-array>",\n' +
  '  "language": "python | javascript | go | rust | c",\n' +
  '  "concept": "<concept_id snake_case do conceito-alvo>",\n' +
  '  "difficulty": 1 | 2 | 3,\n' +
  '  "skillLevel": "beginner | intermediate | advanced",\n' +
  '  "title": "<título do desafio em pt-BR>",\n' +
  '  "statement": "<enunciado claro em pt-BR para o aluno>",\n' +
  '  "stubCode": "<código do stub — o único arquivo que o aluno edita; layout da linguagem>",\n' +
  '  "testCode": "<código do teste executável; casos com os nomes EXATOS no padrão ' +
  'ch_test_name: python test_<id> (ex. test_duplica_vazia), node/javascript/rust/c ' +
  'o id curto direto, go Test<CamelCaseComId>>",\n' +
  '  "referenceCode": "<implementação de referência correta e completa>",\n' +
  '  "referenceAlternates": ["<2 implementações alternativas corretas e estruturalmente DIFERENTES da referenceCode, com a MESMA assinatura>"],\n' +
  '  "scenarios": [\n' +
  '    {\n' +
  '      "id": "<snake_case ascii>",\n' +
  '      "name": "<nome humano em pt-BR>",\n' +
  '      "type": "example | boundary | error | property",\n' +
  '      "input": "<entrada canônica do cenário>",\n' +
  '      "expected": "<valor esperado (documental)>",\n' +
  '      "description": "<o que o cenário cobre, em pt-BR, >=5 caracteres>"\n' +
  '    }\n' +
  '  ],\n' +
  '  "expectedTestCount": <número de cenários>\n' +
  '}\n' +
  'IMPORTANTE — NOME DA FUNÇÃO-PRINCIPAL (regra rígida, igual à semente do desafio):\n' +
  'a função principal que o desafio pede (a que o stub declara, a que o teste importa/chama\n' +
  'e a que a referência implementa) DEVE se chamar exatamente o nome derivado do SLUG deste\n' +
  'desafio, na linguagem dele:\n' +
  '  - python, javascript, rust, c: kebab-case do slug → snake_case (ex.: slug\n' +
  '    "fatorial-recursivo" → função `fatorial_recursivo`);\n' +
  '  - go: mesmo snake_case convertido a PascalCase (ex.: slug "fatorial-recursivo" →\n' +
  '    função `FatorialRecursivo`, exportada no pacote);\n' +
  '  - se o snake_case começar com dígito, prefixe "f_" (ex.: slug "3-soma" →\n' +
  '    `f_3_soma`).\n' +
  'O stubCode, a referenceCode E todas as chamadas no testCode DEVEM usar esse nome exato;\n' +
  'nome diferente quebra o harness (a validação copia a semente canônica e falha na\n' +
  'importação → desafio rejeitado). Escolha o slug curto em kebab-case e derive o nome\n' +
  'dele — nunca invente um nome de função fora dessa regra.\n' +
  'IMPORTANTE — REFERÊNCIA DO testCode AO CÓDIGO DO DESAFIO (identificadores FIXOS):\n' +
  'o testCode SUBSTITUI o arquivo de teste inteiro, e cada linguagem tem identificadores\n' +
  'FIXOS (sempre os mesmos, independentes do slug) que o teste DEVE usar para referenciar\n' +
  'o código do desafio:\n' +
  '  - rust: crate SEMPRE `desafio` → comece o teste com `use desafio::<função>;` (nunca\n' +
  '    `use <slug>::...`);\n' +
  '  - go: pacote SEMPRE `desafio` (go.mod `module desafio`), teste no MESMO diretório/pacote\n' +
  '    do stub → comece com `package desafio`;\n' +
  '  - javascript: stub `stub.mjs` na raiz, teste em `tests/` → importe com\n' +
  '    `import { <função> } from "../stub.mjs";`;\n' +
  '  - c: header `stub.h` na raiz, teste em `tests/` → comece com `#include "../stub.h"`\n' +
  '    (nunca inclua `../stub.c`) e mantenha o main() com o protocolo do harness\n' +
  '    (`TESTS_RUN=<n>` e `TESTS_FAILED=<m>` no stdout);\n' +
  '  - python: módulo `stub.py` na raiz → importe com `from stub import <função>` (nunca o\n' +
  '    slug como módulo).\n' +
  'Identificador errado quebra a compilação/importação e o desafio é rejeitado na validação.\n' +
  'IMPORTANTE — ASSINATURA IDÊNTICA em stubCode, testCode, referenceCode E referenceAlternates:\n' +
  'os 4 artefatos declaram a função principal com a MESMA assinatura — nunca use assinatura\n' +
  'placeholder genérica (ex.: `pub fn maior_elemento_vetor(n: u64) -> u64`) só para "esboçar"\n' +
  'o stub. O harness (challenge-verify.sh) COPIA empty_stub — a cópia canônica do stub — e\n' +
  'cada reference_alt_* por cima do stub do aluno e roda os testes contra eles; assinatura\n' +
  'diferente quebra a compilação do passo 1 (zero_tests_executed) e do passo 3\n' +
  '(rejects_correct_alternative), e o desafio é rejeitado. Exemplo Rust: os 4 artefatos\n' +
  'declaram a MESMA assinatura, ex. `pub fn maior_elemento_vetor(vetor: Vec<i32>) -> Option<i32>`\n' +
  'repetida em stubCode, testCode, referenceCode E referenceAlternates; o corpo do stubCode é\n' +
  '`unimplemented!()` (ou o equivalente da linguagem) MANTENDO a assinatura real. As 2\n' +
  'alternativas devem resolver o MESMO problema com estratégias idiomáticas DIFERENTES da\n' +
  'referenceCode (ex.: recursão vs. acumulador), nunca variantes cosméticas.\n' +

  'Regras: precise de textos completos e corretos (stub/test/reference compilam e ' +
  'rodam); os cenários de cada desafio devem incluir PELO MENOS um example, um ' +
  'boundary e um error (property opcional); testCode deve conter um caso de teste ' +
  'por cenário, com o nome no padrão ch_test_name correspondente à linguagem; ' +
  'expectedTestCount == scenarios.length; maximo 2 desafios; dificuldade entre 1 e 3.';

/** Serializa o lado do usuário: assunto + findings (com fontes) + memória. */
function buildUserPrompt(ctx: { subject: string; findings: Array<{ title?: string; url?: string; description?: string }>; memory?: AuthorMemory }): string {
  const parts: string[] = [];
  parts.push(`ASSUNTO:\n${ctx.subject}`);

  if (ctx.findings && ctx.findings.length > 0) {
    const findingsLines = ctx.findings
      .slice(0, 30)
      .map((f, i) => {
        const src = f.url ? ` (fonte: ${f.url})` : '';
        return `${i + 1}. ${f.title ?? 'sem título'}${src} — ${f.description ?? 'sem descrição'}`;
      })
      .join('\n');
    parts.push(`FINDINGS (fontes da pesquisa — use como base factual e cite-as na aula):\n${findingsLines}`);
  }

  if (ctx.memory && (ctx.memory.whatWorked?.length || ctx.memory.whatDidntWork?.length || Object.keys(ctx.memory.proficiency ?? {}).length)) {
    const mem: string[] = ['MEMÓRIA DO ALUNO:'];
    if (ctx.memory.whatWorked?.length) mem.push(`- O que funcionou: ${ctx.memory.whatWorked.join('; ')}`);
    if (ctx.memory.whatDidntWork?.length) mem.push(`- O que NÃO funcionou (evite): ${ctx.memory.whatDidntWork.join('; ')}`);
    if (ctx.memory.proficiency && Object.keys(ctx.memory.proficiency).length) {
      mem.push(`- Proficiência por conceito: ${Object.entries(ctx.memory.proficiency)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ')}`);
    }
    parts.push(mem.join('\n'));
  }

  parts.push(
    'RESPOSTA: produza apenas o objeto JSON do layout acima, sem texto ao redor.'
  );
  return parts.join('\n\n');
}

/** Guarda de tipo para ScenarioType. */
function isScenarioType(v: unknown): v is ScenarioType {
  return v === 'example' || v === 'boundary' || v === 'error' || v === 'property';
}

/** Normaliza `language` para uma das SUPPORTED_LANGUAGES (default python). */
function normalizeLanguage(raw: unknown): string {
  if (typeof raw === 'string') {
    const l = raw.trim().toLowerCase();
    if (l === 'node' || l === 'js') return 'javascript';
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(l)) return l;
  }
  return 'python';
}

/** Valida um ScenarioDraft; devolve a mensagem de erro ou null. */
function validateScenario(s: unknown, idx: number): string | null {
  if (!s || typeof s !== 'object') return `challenges[].scenarios[${idx}] não é um objeto`;
  const o = s as Record<string, unknown>;
  const missing: string[] = [];
  if (typeof o.id !== 'string' || !o.id.trim()) missing.push('id');
  if (typeof o.name !== 'string' || !o.name.trim()) missing.push('name');
  if (!isScenarioType(o.type)) missing.push(`type (esperado example|boundary|error|property, recebi ${String(o.type)})`);
  if (typeof o.input !== 'string' || !o.input.trim()) missing.push('input');
  if (missing.length) return `challenges[].scenarios[${idx}] ausentes: ${missing.join(', ')}`;
  return null;
}

/** Valida um ChallengeDraft; devolve a mensagem de erro ou null. */
function validateChallenge(c: unknown, idx: number): string | null {
  if (!c || typeof c !== 'object') return `challenges[${idx}] não é um objeto`;
  const o = c as Record<string, unknown>;
  const missing: string[] = [];
  if (typeof o.slug !== 'string' || !o.slug.trim()) missing.push('slug');
  if (typeof o.title !== 'string' || !o.title.trim()) missing.push('title');
  if (typeof o.concept !== 'string' || !o.concept.trim()) missing.push('concept');
  const lang = normalizeLanguage(o.language);
  if (typeof o.statement !== 'string' || !o.statement.trim()) missing.push('statement');
  if (typeof o.stubCode !== 'string' || !o.stubCode.trim()) missing.push('stubCode');
  if (typeof o.testCode !== 'string' || !o.testCode.trim()) missing.push('testCode');
  if (typeof o.referenceCode !== 'string' || !o.referenceCode.trim()) missing.push('referenceCode');
  // referenceAlternates alimentam .solution/reference_alt_* — o passo 3 do harness
  // roda o teste contra cada uma; sem >= 2 corretas o desafio é rejeitado na validação.
  const alts = Array.isArray(o.referenceAlternates) ? (o.referenceAlternates as unknown[]) : [];
  const nonEmptyAlts = alts.filter((a) => typeof a === 'string' && (a as string).trim().length > 0).length;
  if (nonEmptyAlts < 2) {
    missing.push('referenceAlternates (array com >= 2 implementações alternativas corretas e não vazias, MESMA assinatura da referenceCode)');
  }
  if (!Array.isArray(o.scenarios) || o.scenarios.length === 0) {
    missing.push('scenarios (array com >= 1 cenário)');
  }
  if (missing.length) return `challenges[${idx}] (${o.slug ?? '?'}) ausentes: ${missing.join(', ')}`;

  if (!Array.isArray(o.scenarios)) return `challenges[${idx}].scenarios ausente`;
  const scenErrors: string[] = [];
  o.scenarios.forEach((s, i) => {
    const e = validateScenario(s, i);
    if (e) scenErrors.push(e);
  });
  // Cobertura mínima de cenários: example + boundary + error (property opcional).
  const types = new Set(o.scenarios.map((s) => (s as Record<string, unknown>).type));
  const required: ScenarioType[] = ['example', 'boundary', 'error'];
  const missingTypes = required.filter((t) => !types.has(t));
  if (missingTypes.length) {
    scenErrors.push(`challenges[${idx}] scenarios não cobre: ${missingTypes.join(', ')}`);
  }
  if (scenErrors.length) return `challenges[${idx}] (${String(o.slug)}) cenários: ${scenErrors.join('; ')}`;

  return null;
}

/**
 * Valida integralmente um LessonDraft (aula + desafios). Devolve a mensagem de
 * erro humanizada com a parte que faltou, ou null se válido. NÃO lança.
 */
export function validateLessonDraft(raw: unknown): LessonDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Autor DeepSeek: o modelo não devolveu um LessonDraft (objeto JSON).');
  }
  const o = raw as Record<string, unknown>;
  const missing: string[] = [];
  if (typeof o.lessonTitle !== 'string' || !o.lessonTitle.trim()) missing.push('lessonTitle');
  if (typeof o.lessonMarkdown !== 'string' || !o.lessonMarkdown.trim()) missing.push('lessonMarkdown');
  if (!Array.isArray(o.challenges)) missing.push('challenges (array)');
  else if (o.challenges.length === 0) missing.push('challenges (>= 1 desafio)');
  if (missing.length) {
    throw new Error(`Autor DeepSeek: LessonDraft inválido — faltou: ${missing.join(', ')}.`);
  }

  if (!Array.isArray(o.challenges)) {
    throw new Error('Autor DeepSeek: LessonDraft.challenges não é um array.');
  }
  if (o.challenges.length > 2) {
    throw new Error('Autor DeepSeek: LessonDraft tem mais de 2 desafios (o layout permite no máximo 2).');
  }
  for (let i = 0; i < o.challenges.length; i++) {
    const err = validateChallenge(o.challenges[i], i);
    if (err !== null) throw new Error(`Autor DeepSeek: ${err}`);
  }

  const lessonTitle = String(o.lessonTitle).trim();
  const lessonMarkdown = String(o.lessonMarkdown).trim();

  const challenges: ChallengeDraft[] = o.challenges.map((c) => {
    const co = c as Record<string, unknown>;
    const lang = normalizeLanguage(co.language);
    const scenarios: ScenarioDraft[] = (co.scenarios as unknown[]).map((s) => {
      const so = s as Record<string, unknown>;
      return {
        id: String(so.id).trim(),
        name: String(so.name).trim(),
        type: so.type as ScenarioType,
        input: String(so.input),
        ...(so.expected !== undefined ? { expected: String(so.expected) } : {}),
        ...(so.description !== undefined && typeof so.description === 'string' ? { description: so.description } : {}),
      };
    });
    const expectedTestCount =
      typeof co.expectedTestCount === 'number' ? co.expectedTestCount : scenarios.length;
    return {
      slug: String(co.slug).trim(),
      language: lang,
      concept: String(co.concept).trim(),
      ...(typeof co.difficulty === 'number' ? { difficulty: co.difficulty } : {}),
      ...(typeof co.skillLevel === 'string' && co.skillLevel.trim() ? { skillLevel: co.skillLevel.trim() } : {}),
      title: String((co as { title?: unknown }).title).trim(),
      statement: String(co.statement),
      stubCode: String(co.stubCode),
      testCode: String(co.testCode),
      referenceCode: String(co.referenceCode),
      // validateChallenge já exigiu >= 2 não vazias; o array é propagado tal qual
      // (sem trim — o código deve chegar à materialização byte a byte).
      referenceAlternates: Array.isArray(co.referenceAlternates)
        ? (co.referenceAlternates as unknown[]).map((a) => String(a))
        : [],
      scenarios,
      expectedTestCount,
    };
  });

  return { lessonTitle, lessonMarkdown, challenges };
}

/**
 * Fabrica o autor DeepSeek. `getApiKey` resolve a chave sob demanda; sem chave
 * configurada lança DeepSeekError KEY_MISSING (autoria é indispensável — não
 * degrada silenciosamente como o juiz).
 */
export function createDeepSeekLessonAuthor(deps: DeepSeekLessonAuthorDeps = {}): AuthorFn {
  const client = deps.client ?? createDeepSeekClient({ apiKey: deps.getApiKey });
  const model = deps.model;

  return async function author(ctx): Promise<LessonDraft> {
    if (deps.getApiKey) {
      const key = (await deps.getApiKey()).trim();
      if (!key) {
        throw new DeepSeekError(
          DEEPSEEK_ERROR_CODES.KEY_MISSING,
          'Autor DeepSeek: chave de API não configurada. Configure a chave DeepSeek nas configurações.'
        );
      }
    } else if (!deps.client) {
      throw new DeepSeekError(
        DEEPSEEK_ERROR_CODES.KEY_MISSING,
        'Autor DeepSeek: sem getApiKey e sem cliente injetado.'
      );
    }

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT_PT_BR },
      { role: 'user', content: buildUserPrompt(ctx) },
    ];

    let raw: { content: string; model: string } | null;
    try {
      raw = await client.chatCompletion({ messages, temperature: 0.2, ...(model ? { model } : {}) });
    } catch (error) {
      if (error instanceof DeepSeekError) throw error;
      throw new DeepSeekError(
        DEEPSEEK_ERROR_CODES.NETWORK,
        `Autor DeepSeek falhou: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }

    if (!raw || !raw.content || raw.content.trim().length === 0) {
      throw new DeepSeekError(
        DEEPSEEK_ERROR_CODES.NETWORK,
        'Autor DeepSeek: o modelo devolveu resposta vazia.'
      );
    }

    const parsed = extractFirstJsonObject(raw.content);
    // validateLessonDraft valida o shape + lança erros claros; parse não-objeto
    // é convertido em erro de um único passo de validação.
    const draft = validateLessonDraft(parsed);
    return draft as LessonDraft;
  };
}