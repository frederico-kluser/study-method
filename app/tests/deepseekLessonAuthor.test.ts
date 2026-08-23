/**
 * tests/deepseekLessonAuthor.test.ts — autor (AuthorFn) DeepSeek da cadeia
 * lesson-orchestrator. Cliente fake injetado isola o autor do transporte:
 *   - o prompt system/user contém o assunto + findings (com fontes);
 *   - parse JSON válido → LessonDraft normalizado e validado;
 *   - parse inválido / shape inválido → erro claro com a parte que faltou;
 *   - chave ausente → DeepSeekError KEY_MISSING.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createDeepSeekLessonAuthor, slugifyToFunctionName, validateLessonDraft } from '../electron/main/services/deepseekLessonAuthor';
import { DEEPSEEK_ERROR_CODES, DeepSeekError } from '../electron/main/services/deepseekClient';
import type { StudyFinding } from '../shared/ipc-contract';

/** Cliente fake que grava o pedido e devolve content programável. */
function fakeClient(respond: (req: { messages: { role: string; content: string }[]; temperature?: number; model?: string }) => { content: string }) {
  const calls: Array<{ messages: { role: string; content: string }[]; temperature?: number; model?: string }> = [];
  const client = {
    chatCompletion: async (req: any) => {
      calls.push(req);
      const r = respond(req);
      return { content: r.content, model: 'deepseek-v4-flash-0731' };
    },
  };
  return { client, calls };
}

const FINDINGS: StudyFinding[] = [
  { query: 'closure js', title: 'Closures em JS', url: 'https://mdn/closure', description: 'Closures capturam léxico.', score: 0.9 },
];

/** DRAFT JSON válido produzido pelo modelo (1 desafio, cenários example/boundary/error). */
function validDraftJson(): string {
  return JSON.stringify({
    lessonTitle: 'Closures em JavaScript',
    lessonMarkdown: '## Introdução\nAnalogia: um painel de controle que lembra as portas da sala.\n\n### Worked example\n...',
    challenges: [
      {
        slug: 'closure-contador',
        language: 'javascript',
        concept: 'closure',
        difficulty: 2,
        skillLevel: 'beginner',
        title: 'Contador com closure',
        statement: 'Crie uma função que retorna um contador.',
        stubCode: 'export function criaContador() {}',
        testCode:
          "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { criaContador } from './stub.mjs';\n\ntest('incrementa', () => {\n  const c = criaContador();\n  header: assert.equal(c(), 1);\n});\n",
        referenceCode: 'export function criaContador() { let n = 0; return () => ++n; }',
        scenarios: [
          { id: 'incrementa', name: 'Incrementa', type: 'example', input: 'chama()', expected: '1', description: 'Primeira chamada retorna 1' },
          { id: 'limite_zero', name: 'Limite zero', type: 'boundary', input: 'chama 0 vezes', expected: 'sem chamada não muda', description: 'Nenhuma chamada mantém estado' },
          { id: 'sem_closure', name: 'Sem closure', type: 'error', input: 'criaContador sem closure', expected: 'não deve compartilhar', description: 'Contadores independentes' },
        ],
        expectedTestCount: 3,
      },
    ],
  });
}

test('author: monta system pt-BR e user com subject + findings (fontes) + temperature 0.2', async () => {
  const { client, calls } = fakeClient(() => ({ content: validDraftJson() }));
  const author = createDeepSeekLessonAuthor({ client });
  const draft = await author({ subject: 'Closures em JS', findings: FINDINGS });

  assert.equal(calls.length, 1);
  const req = calls[0];
  assert.equal(req.temperature, 0.2, 'temperatura deve ser 0.2');
  assert.equal(req.messages[0].role, 'system');
  assert.match(req.messages[0].content, /study-method/);
  assert.match(req.messages[0].content, /challenges/);
  assert.equal(req.messages[1].role, 'user');
  assert.match(req.messages[1].content, /Closures em JS/);
  assert.match(req.messages[1].content, /https:\/\/mdn\/closure/, 'findings deve incluir a fonte/url');
  assert.match(req.messages[1].content, /FINDINGS/);

  assert.equal(draft.lessonTitle, 'Closures em JavaScript');
  assert.equal(draft.challenges.length, 1);
  assert.equal(draft.challenges[0].language, 'javascript');
  assert.equal(draft.challenges[0].scenarios.length, 3);
});

test('author: system prompt instrui o nome da função derivado do slug (regra do challenge-new.sh)', async () => {
  const { client, calls } = fakeClient(() => ({ content: validDraftJson() }));
  const author = createDeepSeekLessonAuthor({ client });
  await author({ subject: 'Closures', findings: [] });
  const sys = calls[0].messages[0].content;
  // A instrução de naming deve citar a regra rígida e o exemplo kebab→snake.
  assert.match(sys, /NOME DA FUNÇÃO-PRINCIPAL/);
  assert.match(sys, /fatorial-recursivo/);
  assert.match(sys, /fatorial_recursivo/);
  assert.match(sys, /FatorialRecursivo/, 'go usa PascalCase (exportada)');
  assert.match(sys, /f_3_soma/, 'slug iniciado por dígito prefixa f_');
  // Não deve pedir 'unsafe-eval' nem abrir execução arbitrária — só o layout da função.
  assert.doesNotMatch(sys, /unsafe-eval/);
});

test('slugifyToFunctionName: python/javascript/rust/c usam snake_case a partir do kebab-case', () => {
  assert.equal(slugifyToFunctionName('fatorial-recursivo', 'python'), 'fatorial_recursivo');
  assert.equal(slugifyToFunctionName('fatorial-recursivo', 'javascript'), 'fatorial_recursivo');
  assert.equal(slugifyToFunctionName('fatorial-recursivo', 'rust'), 'fatorial_recursivo');
  assert.equal(slugifyToFunctionName('fatorial-recursivo', 'c'), 'fatorial_recursivo');
});

test('slugifyToFunctionName: go usa PascalCase (função exportada do pacote)', () => {
  assert.equal(slugifyToFunctionName('fatorial-recursivo', 'go'), 'FatorialRecursivo');
  assert.equal(slugifyToFunctionName('duplica-array', 'go'), 'DuplicaArray');
});

test('slugifyToFunctionName: node é normalizado para javascript (snake_case)', () => {
  assert.equal(slugifyToFunctionName('ordena-lista', 'node'), 'ordena_lista');
});

test('slugifyToFunctionName: slug iniciado por dígito prefixa f_ em snake e Pascal', () => {
  assert.equal(slugifyToFunctionName('3-soma', 'python'), 'f_3_soma');
  assert.equal(slugifyToFunctionName('3-soma', 'go'), 'F3Soma');
});

test('slugifyToFunctionName: linguagem fora do enum cai no default snake_case; slug vazio vira f', () => {
  assert.equal(slugifyToFunctionName('mdc', 'haskell'), 'mdc');
  assert.equal(slugifyToFunctionName('', 'python'), 'f');
});

test('slugifyToFunctionName: saneia slug não-kebab e múltiplos hífens (só hífen vira _)', () => {
  // espaço/símbolos são removidos (não viram '_'); só o hífen vira '_'.
  assert.equal(slugifyToFunctionName('fatorial recursivo!', 'python'), 'fatorialrecursivo');
  assert.equal(slugifyToFunctionName('a--b', 'go'), 'AB');
});

test('author: memória do aluno vai ao prompt quando presente', async () => {
  const { client, calls } = fakeClient(() => ({ content: validDraftJson() }));
  const author = createDeepSeekLessonAuthor({ client });
  await author({
    subject: 'Closures',
    findings: [],
    memory: { whatWorked: ['analogia do painel'], whatDidntWork: ['fórmula abstrata'], proficiency: { closure: 'intermediate' } },
  });
  assert.match(calls[0].messages[1].content, /analogia do painel/);
  assert.match(calls[0].messages[1].content, /fórmula abstrata/);
  assert.match(calls[0].messages[1].content, /closure=intermediate/);
});

test('author: parse válido → LessonDraft normalizado', async () => {
  const { client } = fakeClient(() => ({ content: 'Texto antes\n```json\n' + validDraftJson() + '\n```\nfim' }));
  const author = createDeepSeekLessonAuthor({ client });
  const draft = await author({ subject: 'Closures', findings: [] });
  assert.equal(draft.challenges[0].slug, 'closure-contador');
  assert.equal(draft.challenges[0].scenarios[0].type, 'example');
});

test('author: JSON inválido (não-objeto) → erro claro', async () => {
  const { client } = fakeClient(() => ({ content: 'isto não é JSON algum' }));
  const author = createDeepSeekLessonAuthor({ client });
  await assert.rejects(author({ subject: 'X', findings: [] }), /LessonDraft inválido|não devolveu um LessonDraft/);
});

test('author: resposta vazia → DeepSeekError (NETWORK)', async () => {
  const { client } = fakeClient(() => ({ content: '' }));
  const author = createDeepSeekLessonAuthor({ client });
  await assert.rejects(author({ subject: 'X', findings: [] }), (e) => e instanceof DeepSeekError);
});

test('author: draft sem lessonMarkdown → erro claro apontando o campo', async () => {
  const body = JSON.parse(validDraftJson());
  delete body.lessonMarkdown;
  const { client } = fakeClient(() => ({ content: JSON.stringify(body) }));
  const author = createDeepSeekLessonAuthor({ client });
  await assert.rejects(author({ subject: 'X', findings: [] }), /lessonMarkdown/);
});

test('author: desafio sem scenarios → erro claro', async () => {
  const body = JSON.parse(validDraftJson());
  body.challenges[0].scenarios = [];
  const { client } = fakeClient(() => ({ content: JSON.stringify(body) }));
  const author = createDeepSeekLessonAuthor({ client });
  await assert.rejects(author({ subject: 'X', findings: [] }), /scenarios/);
});

test('author: cenários sem cobertura example+boundary+error → erro claro', async () => {
  const body = JSON.parse(validDraftJson());
  body.challenges[0].scenarios = [
    { id: 'a', name: 'A', type: 'example', input: 'x', description: 'apenas example' },
  ];
  const { client } = fakeClient(() => ({ content: JSON.stringify(body) }));
  const author = createDeepSeekLessonAuthor({ client });
  await assert.rejects(author({ subject: 'X', findings: [] }), /boundary, error/);
});

test('author: mais de 2 desafios → erro claro', async () => {
  const body = JSON.parse(validDraftJson());
  body.challenges.push(JSON.parse(validDraftJson()).challenges[0]);
  body.challenges.push(JSON.parse(validDraftJson()).challenges[0]);
  const { client } = fakeClient(() => ({ content: JSON.stringify(body) }));
  const author = createDeepSeekLessonAuthor({ client });
  await assert.rejects(author({ subject: 'X', findings: [] }), /no máximo 2/);
});

test('author: sem chave (getApiKey vazio/sem client) → DeepSeekError KEY_MISSING', async () => {
  const authorNoKey = createDeepSeekLessonAuthor({ getApiKey: async () => '' });
  await assert.rejects(
    authorNoKey({ subject: 'X', findings: [] }),
    (e) => e instanceof DeepSeekError && e.code === DEEPSEEK_ERROR_CODES.KEY_MISSING
  );
  // Sem getApiKey E sem client: também KEY_MISSING.
  const authorBare = createDeepSeekLessonAuthor({});
  await assert.rejects(authorBare({ subject: 'X', findings: [] }), (e) => e instanceof DeepSeekError);
});

test('author: model injetado repassa ao cliente', async () => {
  const { client, calls } = fakeClient(() => ({ content: validDraftJson() }));
  const author = createDeepSeekLessonAuthor({ client, model: 'deepseek-v4-flash-0731' });
  await author({ subject: 'X', findings: [] });
  assert.equal(calls[0].model, 'deepseek-v4-flash-0731');
});

test('validateLessonDraft: chama direto com draft válido → devolve normalizado', () => {
  const draft = validateLessonDraft(JSON.parse(validDraftJson()));
  assert.equal(draft!.lessonTitle, 'Closures em JavaScript');
  assert.equal(draft!.challenges.length, 1);
});

test('validateLessonDraft: null / primitivo / array → lança "não devolveu um LessonDraft"', () => {
  assert.throws(() => validateLessonDraft(null), /não devolveu um LessonDraft/);
  assert.throws(() => validateLessonDraft(123), /não devolveu um LessonDraft/);
  assert.throws(() => validateLessonDraft([]), /não devolveu um LessonDraft/);
  assert.throws(() => validateLessonDraft('texto'), /não devolveu um LessonDraft/);
});

test('validateLessonDraft: lessonTitle/lessonMarkdown vazios ou não-string → erro "faltou"', () => {
  const body = JSON.parse(validDraftJson());
  body.lessonTitle = '   ';
  assert.throws(() => validateLessonDraft(body), /lessonTitle/);
  body.lessonTitle = 'Título';
  body.lessonMarkdown = '';
  assert.throws(() => validateLessonDraft(body), /lessonMarkdown/);
});

test('validateLessonDraft: scenario com input vazio → erro do cenário propaga', () => {
  const body = JSON.parse(validDraftJson());
  body.challenges[0].scenarios[0].input = '';
  assert.throws(() => validateLessonDraft(body), /challenges\[\]\.scenarios\[0\].*input/);
});

test('validateLessonDraft: cenário com type property é aceito na cobertura mínima', () => {
  const body = JSON.parse(validDraftJson());
  // mantém example/boundary/error e adiciona property.
  body.challenges[0].scenarios.push(
    { id: 'prop_ordem', name: 'Propriedade', type: 'property', input: 'x', description: 'Cobre invariante' },
  );
  body.challenges[0].expectedTestCount = 4;
  const draft = validateLessonDraft(body);
  assert.equal(draft!.challenges[0].scenarios.length, 4);
  for (const s of draft!.challenges[0].scenarios) assert.match(s.type, /example|boundary|error|property/);
});

test('author: cliente lança erro GENÉRICO → envolve em DeepSeekError NETWORK', async () => {
  const boom = new Error('falha de rede 500');
  const client = {
    chatCompletion: async () => {
      throw boom;
    },
  };
  const author = createDeepSeekLessonAuthor({ client });
  await assert.rejects(
    author({ subject: 'X', findings: [] }),
    (e) =>
      e instanceof DeepSeekError &&
      e.code === DEEPSEEK_ERROR_CODES.NETWORK &&
      (e.message as string).includes('falha de rede 500'),
  );
});

test('author: cliente lança DeepSeekError → NÃO é re-embrulhado (propaga o código)', async () => {
  const original = new DeepSeekError(DEEPSEEK_ERROR_CODES.RATE_LIMIT, 'rate limit da chave');
  const client = {
    chatCompletion: async () => {
      throw original;
    },
  };
  const author = createDeepSeekLessonAuthor({ client });
  const err = await author({ subject: 'X', findings: [] }).then(
    () => null,
    (e) => e,
  );
  assert.equal(err, original, 'deve propagar o DeepSeekError original, sem novo wrap');
});