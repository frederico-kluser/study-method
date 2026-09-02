/**
 * tests/engineBudgetGate.test.ts — o gate determinístico de orçamento da engine
 * de trilhas (`docs/16-engine-de-trilha.md`).
 *
 * Os contratos que mordem aqui:
 *   - extract: nome CANÔNICO de SyntaxKind (o enum do TypeScript tem marcadores
 *     de faixa que sequestram a busca reversa — `NumericLiteral` volta como
 *     `FirstLiteralToken`, e um orçamento escrito contra o nome real nunca
 *     casaria); pontuação fora do eixo `node:`; raiz importada mantém o caminho
 *     de API (`assert.throws`, não `.throws`); erro de sintaxe é erro, não silêncio.
 *   - countTestDeclarations: contagem por AST — `// test(` comentado NÃO conta.
 *     São três implementações no repositório com duas semânticas; esta é a única
 *     que não quebra com comentário.
 *   - theoryCode: bloco cercado COM tag é código; crase inline é prosa (span como
 *     `total: 3` parseia como LabeledStatement e envenena o orçamento); bloco sem
 *     tag é defeito de formato reportado; `section.code` entra na análise (é a
 *     metade que o validador semântico atual descarta).
 *   - budget: cumulativo monotônico; harness só no receptivo; cada faixa medida
 *     contra a própria entrada; origem de cada construção registrada.
 *   - audit: o CASO CANÔNICO — a aula 1 que cobra `typeof`/`throw`/`return` sem
 *     nunca os ter ensinado precisa REPROVAR; uma trilha coerente precisa PASSAR;
 *     e o desafio que não exercita o que a aula ensinou também reprova (A6).
 *
 * Sem rede, sem disco, sem LLM: as trilhas são fixtures em memória.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as path from 'node:path';

import {
  FORBIDDEN_ALWAYS,
  HARNESS_RECEPTIVE_SEED,
  STRUCTURAL_ALWAYS_ALLOWED,
  harnessReceptiveSeed,
  humanLabel,
  isForbiddenAlways,
  structuralAlwaysAllowed,
} from '../electron/main/engine/atomKeys';
import {
  RUNTIME_GLOBALS,
  countTestDeclarations,
  extractAtoms,
  kindName,
} from '../electron/main/engine/extract';
import { kindNameOf } from '../electron/main/engine/form/selector';
import {
  DEFAULT_ADAPTER_ID,
  LanguageRegistryError,
  getAdapter,
} from '../electron/main/engine/lang/registry';
import { CAMINHO_ATOMOS_DEFAULT, caminhoAtomos } from '../electron/main/engine/phases/f0Brief';
import { collectLessonCode, extractFencedBlocks } from '../electron/main/engine/theoryCode';
import { deriveTrackBudget, entryAxiom, pedagogicalOrder } from '../electron/main/engine/budget';
import { auditTrack } from '../electron/main/engine/audit';
import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import * as ts from 'typescript';

// ---------------------------------------------------------------------------
// Fixtures (PURAS — nenhuma trilha real, nenhum IO)
// ---------------------------------------------------------------------------

function theory(id: string, markdown: string, code?: string): TrackTheorySection {
  return {
    id,
    title: id,
    markdown,
    ...(code ? { code: { language: 'javascript', code } } : {}),
  };
}

function challenge(slug: string, over: Partial<TrackChallengeSource> = {}): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: slug,
    concept: 'conceito',
    difficulty: 1,
    language: 'nodejs',
    statement: `# ${slug}`,
    starterCode: 'export function f() {\n}\n',
    testsCode: "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('ok', () => { assert.equal(f(), 'a'); });\n",
    solutionCode: "export function f() {\n  return 'a';\n}\n",
    expectedTestCount: 1,
    ...over,
  };
}

function lesson(
  slug: string,
  sections: TrackTheorySection[],
  challenges: TrackChallengeSource[],
  concepts: string[] = ['conceito'],
): LoadedLesson {
  return {
    meta: {
      schemaVersion: 1,
      slug,
      title: slug,
      summary: slug,
      difficulty: 1,
      concepts,
      prerequisites: [],
      theory: sections,
      sources: [],
      challenges: challenges.map((c) => c.slug),
    },
    challenges,
  };
}

function trackOf(modules: LoadedModule[]): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'fixture',
      title: 'fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      modules: modules.map((m) => m.meta.slug),
    },
    modules,
    proficiency: null,
    dir: '/tmp/fixture',
  };
}

function moduleOf(slug: string, order: number, lessons: LoadedLesson[]): LoadedModule {
  return {
    meta: { schemaVersion: 1, slug, title: slug, order, lessons: lessons.map((l) => l.meta.slug) },
    lessons,
    challenge: null,
  };
}

// ---------------------------------------------------------------------------
// extract
// ---------------------------------------------------------------------------

describe('extract — o extrator determinístico', () => {
  const SOLUTION_AULA_1 = `export function cumprimentar(nome) {
  if (typeof nome !== 'string') {
    throw new Error('nome precisa ser um texto');
  }
  return 'Olá, ' + nome + '!';
}`;

  it('extrai do desafio da aula 1 exatamente as construções que ele exige', () => {
    const r = extractAtoms(SOLUTION_AULA_1);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    for (const esperada of [
      'node:FunctionDeclaration',
      'node:Parameter',
      'node:IfStatement',
      'op:unary:typeof',
      'op:binary:!==',
      'node:ThrowStatement',
      'node:NewExpression',
      'global:Error',
      'node:ReturnStatement',
      'op:binary:+',
    ]) {
      assert.ok(r.keys.includes(esperada), `faltou ${esperada} em: ${r.keys.join(' ')}`);
    }
  });

  it('reporta linha e coluna da PRIMEIRA ocorrência (é o que a violação cita)', () => {
    const r = extractAtoms(SOLUTION_AULA_1);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const typeofOcc = r.occurrences.find((o) => o.key === 'op:unary:typeof');
    assert.ok(typeofOcc);
    assert.equal(typeofOcc.line, 2);
    assert.equal(typeofOcc.column, 7);
    assert.ok(typeofOcc.snippet.startsWith('typeof nome'));
  });

  it('usa o nome CANÔNICO do SyntaxKind, não o marcador de faixa do enum', () => {
    // A busca reversa crua devolve o marcador — este é o bug que a tabela
    // canônica existe para evitar, e ele faria todo orçamento errar em silêncio.
    assert.equal(ts.SyntaxKind[ts.SyntaxKind.NumericLiteral], 'FirstLiteralToken');
    assert.equal(kindName(ts.SyntaxKind.NumericLiteral), 'NumericLiteral');
    const r = extractAtoms('const n = 42;');
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.keys.includes('node:NumericLiteral'));
    assert.ok(!r.keys.includes('node:FirstLiteralToken'));
  });

  it('não emite pontuação no eixo node: (o operador já vive no eixo op:)', () => {
    const r = extractAtoms("const a = 1 + 2;");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.keys.includes('op:binary:+'));
    assert.ok(!r.keys.includes('node:PlusToken'));
  });

  it('separa let, const e var — é o que permite três aulas distintas', () => {
    const keysOf = (code: string): string[] => {
      const r = extractAtoms(code);
      return r.ok ? r.keys : [];
    };
    assert.ok(keysOf('let x = 1;').includes('decl:let'));
    assert.ok(keysOf('const x = 1;').includes('decl:const'));
    assert.ok(keysOf('var x = 1;').includes('decl:var'));
    assert.ok(!keysOf('let x = 1;').includes('decl:const'));
  });

  it('mantém o caminho de API quando a raiz é importada (assert.throws, não .throws)', () => {
    const r = extractAtoms("import assert from 'node:assert/strict';\nassert.throws(() => {});");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.keys.includes('api:assert.throws'));
    assert.ok(!r.keys.includes('api:.throws'));
  });

  it('usa a forma .prop quando a raiz é variável local (sem tipo, não se afirma o receptor)', () => {
    const r = extractAtoms('const lista = [];\nlista.push(1);');
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.keys.includes('api:.push'));
  });

  it('marca acesso computado não-literal, que quebra a decidibilidade', () => {
    const r = extractAtoms('const o = {};\nconst k = "a";\no[k];');
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.keys.includes('node:ComputedNonLiteralAccess'));
    assert.ok(isForbiddenAlways('node:ComputedNonLiteralAccess'));
  });

  it('erro de sintaxe vira erro estruturado, nunca silêncio', () => {
    const r = extractAtoms('const x = ;');
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.equal(r.error.line, 1);
  });

  it('conta test() por AST — comentário não conta', () => {
    const code = [
      "test('um', () => {});",
      "// test('comentado', () => {});",
      "/* test('bloco', () => {}); */",
      "test('dois', () => {});",
    ].join('\n');
    assert.equal(countTestDeclarations(code), 2);
  });

  it('conta test.skip e test.only como declarações de teste', () => {
    assert.equal(countTestDeclarations("test('a', ()=>{});\ntest.skip('b', ()=>{});"), 2);
  });
});

// ---------------------------------------------------------------------------
// theoryCode
// ---------------------------------------------------------------------------

describe('theoryCode — separar código de prosa', () => {
  it('bloco cercado COM tag é código; crase inline é prosa', () => {
    const md = 'Veja `total: 3` no texto.\n\n```js\nconst a = 1;\n```\n';
    const { blocks } = extractFencedBlocks(md);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].isJavaScript, true);
    assert.equal(blocks[0].code, 'const a = 1;');
    // A crase inline NÃO virou bloco. Se virasse, `total: 3` parsearia como
    // LabeledStatement e inventaria uma construção que ninguém escreveu.
    assert.ok(!blocks.some((b) => b.code.includes('total: 3')));
  });

  it('bloco sem tag é reportado como defeito de formato', () => {
    const { blocks, hygiene } = extractFencedBlocks('```\nconst a = 1;\n```\n');
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].isJavaScript, false);
    assert.equal(hygiene.length, 1);
    assert.equal(hygiene[0].code, 'FENCE_SEM_TAG');
  });

  it('bloco com tag não-JS não entra na análise', () => {
    const { blocks } = extractFencedBlocks('```bash\nnpm test\n```\n');
    assert.equal(blocks[0].isJavaScript, false);
  });

  it('o campo section.code entra na análise (é a metade hoje descartada)', () => {
    const { blocks } = collectLessonCode([theory('s1', 'texto sem código', 'const x = 1;')]);
    const fromField = blocks.filter((b) => b.origin === 'section-code');
    assert.equal(fromField.length, 1);
    assert.equal(fromField[0].isJavaScript, true);
  });
});

// ---------------------------------------------------------------------------
// budget
// ---------------------------------------------------------------------------

describe('budget — o orçamento cumulativo', () => {
  const t = trackOf([
    moduleOf('m1', 1, [
      lesson('a1', [theory('s', 'texto', "console.log('oi');")], [challenge('c1')]),
      lesson('a2', [theory('s', 'texto', 'let x = 1;')], [challenge('c2')]),
      lesson('a3', [theory('s', 'texto', 'const y = 2;')], [challenge('c3')]),
    ]),
  ]);

  it('ordena por `order` do módulo e pela ordem do array de aulas', () => {
    const ordered = pedagogicalOrder(t);
    assert.deepEqual(
      ordered.map((o) => o.lessonSlug),
      ['a1', 'a2', 'a3'],
    );
  });

  it('o harness entra só no receptivo — nunca no produtivo', () => {
    const axiom = entryAxiom('receptive-seed');
    assert.ok(axiom.receptive.has('node:ImportDeclaration'));
    assert.ok(!axiom.productive.has('node:ImportDeclaration'));
    for (const key of HARNESS_RECEPTIVE_SEED) assert.ok(axiom.receptive.has(key), `faltou ${key}`);
  });

  it('a política `none` não semeia harness nenhum', () => {
    const axiom = entryAxiom('none');
    assert.ok(!axiom.receptive.has('node:ImportDeclaration'));
  });

  it('é cumulativo e monotônico: saída de N é entrada de N+1', () => {
    const b = deriveTrackBudget(t);
    assert.equal(b.source, 'inferred');
    for (let i = 0; i + 1 < b.lessons.length; i += 1) {
      for (const key of b.lessons[i].saida.productive) {
        assert.ok(
          b.lessons[i + 1].entrada.productive.has(key),
          `${key} sumiu do orçamento entre ${b.lessons[i].ref} e ${b.lessons[i + 1].ref}`,
        );
      }
    }
  });

  it('registra a aula de ORIGEM de cada construção (base de primeiraAulaQueEnsina)', () => {
    const b = deriveTrackBudget(t);
    assert.equal(b.firstTaughtIn.get('decl:let'), 'm1/a2');
    assert.equal(b.firstTaughtIn.get('decl:const'), 'm1/a3');
    assert.equal(b.firstTaughtIn.get('op:unary:typeof'), undefined);
  });

  it('uma construção pode entrar no produtivo depois de já estar no receptivo', () => {
    // `StringLiteral` vem semeada no receptivo pelo harness. A aula 1 a demonstra
    // e ela passa a ser exigível. Medir as duas faixas contra a receptiva (o bug
    // da primeira versão) tornaria isso impossível e fabricaria violação falsa.
    const b = deriveTrackBudget(t);
    const a1 = b.byRef.get('m1/a1');
    assert.ok(a1);
    assert.ok(a1.entrada.receptive.has('node:StringLiteral'));
    assert.ok(!a1.entrada.productive.has('node:StringLiteral'));
    assert.ok(a1.saida.productive.has('node:StringLiteral'));
  });

  it('modo declarado usa o campo introduces e ignora a teoria', () => {
    const declared = trackOf([
      moduleOf('m1', 1, [
        {
          ...lesson('a1', [theory('s', 'texto', 'const escondido = 1;')], [challenge('c1')]),
          meta: {
            ...lesson('a1', [theory('s', 'texto', 'const escondido = 1;')], [challenge('c1')]).meta,
            introduces: { productive: ['decl:let'] },
          } as LoadedLesson['meta'],
        },
      ]),
    ]);
    const b = deriveTrackBudget(declared);
    assert.equal(b.source, 'declared');
    assert.deepEqual(b.byRef.get('m1/a1')?.introduces.productive, ['decl:let']);
    // Colar código na teoria NÃO amplia o orçamento declarado — é a defesa
    // contra o golpe já registrado no repositório (a "reparação" que colou a
    // solução inteira dentro de uma seção chamada "Exemplo completo").
    assert.ok(!b.byRef.get('m1/a1')?.saida.productive.has('decl:const'));
  });
});

// ---------------------------------------------------------------------------
// audit
// ---------------------------------------------------------------------------

describe('audit — o gate', () => {
  it('REPROVA o caso canônico: aula 1 cobrando typeof/throw sem ter ensinado', () => {
    const quebrada = trackOf([
      moduleOf('m1', 1, [
        lesson(
          'o-que-e-programacao',
          [theory('s', 'Um programa é uma lista de instruções.', "console.log('Olá, mundo!');")],
          [
            challenge('cumprimentar', {
              starterCode: 'export function cumprimentar(nome) {\n}\n',
              solutionCode:
                "export function cumprimentar(nome) {\n  if (typeof nome !== 'string') {\n    throw new Error('x');\n  }\n  return 'Olá, ' + nome + '!';\n}\n",
              testsCode:
                "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { cumprimentar } from './solution.mjs';\ntest('ok', () => { assert.equal(cumprimentar('Maria'), 'Olá, Maria!'); });\n",
            }),
          ],
        ),
      ]),
    ]);

    const report = auditTrack(quebrada);
    const cobradas = report.violations.filter((v) => v.campo === 'solutionCode').map((v) => v.construcao);

    for (const esperada of ['op:unary:typeof', 'node:ThrowStatement', 'node:IfStatement', 'node:ReturnStatement']) {
      assert.ok(cobradas.includes(esperada), `o gate deixou passar ${esperada}: ${cobradas.join(' ')}`);
    }
    assert.ok(report.totals.desafiosComViolacao > 0);
  });

  it('classifica corretamente LACUNA DE CURRÍCULO x violação de ORDEM', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s', 'texto', "console.log('oi');")], [
          challenge('c1', {
            starterCode: 'export function f(n) {\n}\n',
            solutionCode: 'export function f(n) {\n  return n;\n}\n',
            testsCode:
              "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('ok', () => { assert.equal(f(1), 1); });\n",
          }),
        ]),
        lesson('a2', [theory('s', 'texto', 'function g() {\n  return 1;\n}')], [challenge('c2')]),
      ]),
    ]);
    const report = auditTrack(t);
    // Rodada 12: a bateria A13 também flagia `return` (A13a — usado sem
    // demonstração anterior) — o CONTRATO do orçamento é a violação A2; é ela
    // que distingue §5.5 (ordem/lacuna) e que o laço de reparo consome.
    const returnViolation = report.violations.find((v) => v.regra === 'A2' && v.construcao === 'node:ReturnStatement');
    assert.ok(returnViolation, 'o gate precisa pegar `return` cobrado antes de ser ensinado');
    // `return` É ensinado — só que depois. Logo é ORDEM, não lacuna.
    assert.equal(returnViolation.primeiraAulaQueEnsina, 'm1/a2');
    assert.match(returnViolation.mensagem, /vem DEPOIS/);
  });

  it('APROVA uma trilha coerente — o gate não é ruído', () => {
    // Sequência coerente sob a bateria INTEIRA (A1–A6 + A13–A16, rodada 12):
    //   L1 é aula de LEITURA (sem desafio): demonstra o invólucro na seção 1
    //   (function/return/parâmetro = 3 novas) e a CHAMADA na seção 2 (1 nova —
    //   a chamada entra no cumulativo ANTES de qualquer teste lê-la);
    //   L2 é o desafio: a 1ª seção demonstra o `if` (a construção nova da aula)
    //   e o 1º desafio escreve só o que a 1ª seção + o anterior demonstram. Os
    //   testes da L2 podem chamar `f(1)` porque a chamada já foi demonstrada na
    //   L1 (A13c: lido-antes ⊆ demonstrado-anterior).
    const coerente = trackOf([
      moduleOf('m1', 1, [
        lesson('a1-leitura', [theory('s1', 'O invólucro.', 'export function exemplo(x) {\n  return x;\n}'), theory('s2', 'A chamada.', 'exemplo(1);')], [
          // sem desafio: aula de leitura — nada de teste, nada de escrita
        ]),
        lesson(
          'a2',
          [
            theory(
              's',
              'Uma condição decide o caminho.',
              'export function f(n) {\n  if (n) {\n    return 1;\n  } else {\n    return 0;\n  }\n}\n',
            ),
          ],
          [
            challenge('c1', {
              starterCode: 'export function f(n) {\n}\n',
              solutionCode: 'export function f(n) {\n  if (n) {\n    return 1;\n  } else {\n    return 0;\n  }\n}\n',
              testsCode:
                "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('devolve o que recebe', () => { assert.equal(f(1), 1); });\n",
            }),
          ],
        ),
      ]),
    ]);
    const report = auditTrack(coerente);
    assert.deepEqual(
      report.violations.map((v) => `${v.regra} ${v.campo} ${v.construcao}`),
      [],
    );
  });

  it('A6 — reprova o desafio que não exercita NADA do que a aula ensinou', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s', 'texto', "export function base(x) {\n  return x;\n}\nconsole.log(base(1));")], [
          challenge('c1', {
            starterCode: 'export function f(n) {\n}\n',
            solutionCode: 'export function f(n) {\n  return n;\n}\n',
            testsCode:
              "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('ok', () => { assert.equal(f(1), 1); });\n",
          }),
        ]),
        // a2 ensina `let`, mas o desafio dela só repete o que já sabia.
        lesson('a2', [theory('s', 'texto', 'let contador = 0;\ncontador = contador;')], [
          challenge('c2', {
            starterCode: 'export function f(n) {\n}\n',
            solutionCode: 'export function f(n) {\n  return n;\n}\n',
            testsCode:
              "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('ok', () => { assert.equal(f(1), 1); });\n",
          }),
        ]),
      ]),
    ]);
    const report = auditTrack(t);
    const a6 = report.violations.filter((v) => v.regra === 'A6');
    assert.equal(a6.length, 1);
    assert.equal(a6[0].ref, 'm1/a2');
  });

  it('I12 — slug de aula duplicado é violação (é chave GLOBAL de progresso)', () => {
    const t = trackOf([
      moduleOf('m1', 1, [lesson('dup', [theory('s', 'x')], [])]),
      moduleOf('m2', 2, [lesson('dup', [theory('s', 'x')], [])]),
    ]);
    const report = auditTrack(t);
    assert.equal(report.violations.filter((v) => v.regra === 'I12').length, 1);
  });

  it('I14 — `order` de módulo duplicado é violação (a ordem pedagógica fica indefinida)', () => {
    const t = trackOf([
      moduleOf('m1', 1, [lesson('a', [theory('s', 'x')], [])]),
      moduleOf('m2', 1, [lesson('b', [theory('s', 'x')], [])]),
    ]);
    assert.equal(auditTrack(t).violations.filter((v) => v.regra === 'I14').length, 1);
  });

  it('I15 — theory[].id duplicado é violação (a segunda seção nunca aparece)', () => {
    const t = trackOf([
      moduleOf('m1', 1, [lesson('a', [theory('s', 'um'), theory('s', 'dois')], [])]),
    ]);
    assert.equal(auditTrack(t).violations.filter((v) => v.regra === 'I15').length, 1);
  });

  it('I16 — conceito de desafio que a aula não declara é violação', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a', [theory('s', 'x', 'const a = 1;')], [challenge('c', { concept: 'nao_declarado' })], ['outro']),
      ]),
    ]);
    assert.ok(auditTrack(t).violations.some((v) => v.regra === 'I16'));
  });

  it('I17 — files[].path reservado pelo runner é violação (o aluno perde o que escreveu)', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a', [theory('s', 'x', 'const a = 1;')], [
          challenge('c', {
            files: [{ path: 'test.mjs', starterCode: '', solutionCode: 'export const a = 1;' }],
            starterCode: undefined,
            solutionCode: undefined,
          }),
        ]),
      ]),
    ]);
    assert.ok(auditTrack(t).violations.some((v) => v.regra === 'I17'));
  });

  it('humanLabel cita o token, não o nome interno do nó', () => {
    assert.equal(humanLabel('op:unary:typeof'), '`typeof`');
    assert.equal(humanLabel('decl:const'), '`const`');
    assert.equal(humanLabel('api:assert.throws'), '`assert.throws`');
  });
});

// ---------------------------------------------------------------------------
// A COSTURA MULTILÍNGUA (onda 5): o gate consome o ADAPTADOR, não literais
// ---------------------------------------------------------------------------
//
// O que estes testes protegem não é uma função nova — é a ausência de CÓPIA.
// Cada `assert.equal(x, y)` aqui é "estes dois lugares que antes tinham a mesma
// lista escrita duas vezes agora leem a MESMA fonte". Um `deepEqual` passaria
// com duas cópias iguais; a igualdade de IDENTIDADE (`===`) não passa.

describe('engineBudgetGate: extrator e alfabeto consomem o adaptador de linguagem', () => {
  it('RUNTIME_GLOBALS É o globals() do adaptador (mesmo objeto, não uma cópia igual)', () => {
    assert.equal(RUNTIME_GLOBALS, getAdapter(DEFAULT_ADAPTER_ID).globals());
  });

  it('FORBIDDEN_ALWAYS É o forbiddenInvariants do adaptador (mesmo array)', () => {
    assert.equal(FORBIDDEN_ALWAYS, getAdapter(DEFAULT_ADAPTER_ID).forbiddenInvariants);
    assert.ok(isForbiddenAlways('global:eval', DEFAULT_ADAPTER_ID));
    assert.ok(!isForbiddenAlways('decl:let', DEFAULT_ADAPTER_ID));
  });

  it('kindName do extrator É a tabela canônica única (kindNames.ts), a mesma do seletor de forma', () => {
    // O nome canônico continua vencendo o marcador de faixa do enum...
    assert.equal(kindName(ts.SyntaxKind.NumericLiteral), 'NumericLiteral');
    // ...e o seletor de forma (que tinha a tabela COPIADA) devolve o mesmo nome
    // para o mesmo nó, porque agora existe uma tabela só.
    const sf = ts.createSourceFile('t.mjs', 'if (1) { }', ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const primeiro = sf.statements[0];
    assert.equal(kindNameOf(primeiro), kindName(primeiro.kind));
    assert.equal(kindNameOf(primeiro), 'IfStatement');
  });

  it('o extrator aceita language explícito e REPROVA linguagem sem adaptador (fail-closed)', () => {
    const code = "export function f(n) { return n + 1; }\n";
    const comDefault = extractAtoms(code);
    const explicito = extractAtoms(code, { language: DEFAULT_ADAPTER_ID });
    assert.ok(comDefault.ok && explicito.ok);
    assert.deepEqual(explicito.keys, comDefault.keys);

    // Linguagem que nenhum adaptador registrado atende: erro ESTRUTURADO com a
    // lista do que é válido — nunca o parser de JavaScript por descuido.
    assert.throws(
      () => extractAtoms(code, { language: 'ruby' as never }),
      (erro: unknown) => erro instanceof LanguageRegistryError && erro.code === 'ADAPTADOR_DESCONHECIDO',
    );
  });

  it('countTestDeclarations despacha por linguagem sem recursão (o corpo é o de JavaScript)', () => {
    const tests = "import test from 'node:test';\ntest('a', () => {});\ntest.skip('b', () => {});\n";
    assert.equal(countTestDeclarations(tests), 2);
    assert.equal(countTestDeclarations(tests, DEFAULT_ADAPTER_ID), 2);
    // É a MESMA contagem que o membro countDeclared do adaptador devolve —
    // o adaptador delega para esta função, e a delegação não pode virar laço.
    assert.equal(getAdapter(DEFAULT_ADAPTER_ID).countDeclared(tests), 2);
  });

  it('as tabelas de linguagem do alfabeto são fail-closed fora do adaptador default', () => {
    assert.equal(harnessReceptiveSeed(), HARNESS_RECEPTIVE_SEED);
    assert.equal(structuralAlwaysAllowed(), STRUCTURAL_ALWAYS_ALLOWED);
    for (const pedir of [() => harnessReceptiveSeed('ruby' as never), () => structuralAlwaysAllowed('ruby' as never)]) {
      assert.throws(pedir, (erro: unknown) => erro instanceof LanguageRegistryError);
    }
  });

  it('o orçamento resolve o adaptador DA TRILHA e filtra a teoria por ele', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a', [theory('s', 'x', 'const a = 1;')], [challenge('c', {})]),
      ]),
    ]);
    const budget = deriveTrackBudget(t);
    assert.equal(budget.adapterId, DEFAULT_ADAPTER_ID);

    // `programmingLanguage` aceita o TOKEN de runtime das 112 trilhas do disco
    // ('nodejs') e ele resolve para a LINGUAGEM ('javascript') — §6.
    const comRuntime: LoadedTrack = { ...t, root: { ...t.root, programmingLanguage: 'nodejs' } };
    assert.equal(deriveTrackBudget(comRuntime).adapterId, 'javascript');
    assert.deepEqual(
      [...deriveTrackBudget(comRuntime).lessons[0].saida.productive].sort(),
      [...budget.lessons[0].saida.productive].sort(),
    );
  });

  it('o artefato de vocabulário é resolvido pelo adaptador (atoms.json é o do default)', () => {
    assert.equal(caminhoAtomos(), CAMINHO_ATOMOS_DEFAULT);
    assert.ok(CAMINHO_ATOMOS_DEFAULT.endsWith(path.join('vocab', 'atoms.json')));
    assert.throws(() => caminhoAtomos('ruby' as never), (erro: unknown) => erro instanceof LanguageRegistryError);
  });
});
