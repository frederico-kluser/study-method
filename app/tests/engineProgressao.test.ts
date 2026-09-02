/**
 * tests/engineProgressao.test.ts — a bateria A13–A16 (rodada 12).
 *
 * Spec: `app/content-src/analise-verificadores.md` §3–§6.
 * Implementação: `app/electron/main/engine/quality/progressao.ts` (pura),
 * mesclada no `auditTrack` — os testes passam pelo MESMO caminho do G-AUDIT
 * (auditTrack sem opções), nunca por uma chamada à parte.
 *
 * Os casos:
 *   1. A13c reprova a aula que manda o aluno LER chamada de função nunca
 *      demonstrada (o pecado nº 1 do usuário — spec §3.2).
 *   2. A13c aprova quando a chamada foi demonstrada em aula anterior.
 *   3. A13c aprova quando a chamada foi demonstrada na teoria DA MESMA aula
 *      (spec §3.2: "demonstrado em teoria (desta/anteriores)" — o caso da aula
 *      de abertura que demonstra `resposta()` na seção 1 e cujo próprio teste
 *      a chama; era um falso positivo A13c reportado pelo autor dessa aula).
 *   4. A13d reprova `introduces` declarado sem demonstração (modo declared).
 *   5. A14a reprova aula com 5 construções verdadeiramente novas e aprova com 2.
 *   6. A14b reprova linha da solução que combina 2 construções novas.
 *   7. A15a reprova o degrau sem reuso (e com 2 novos não demonstrados) e
 *      aprova o 2º desafio que reusa o 1º (off-by-one do k=1 corrigido).
 *   8. A15b reprova a aula que não reutiliza nada anterior e aprova a que
 *      reutiliza (recuperação espaçada, §7.1.12).
 *   9. A16 reprova 1º desafio que exige construção da 2ª seção.
 *  10. CASO FELIZ: uma sequência L1–L3 de micro-currículo passa na bateria
 *      INTEIRA — fixtures mínimas de três aulas de abertura (zero erros E
 *      zero avisos: cada aula introduz 1–3 átomos novos não-H13 e demonstra o
 *      que o 1º desafio escreve na 1ª seção com código).
 *
 * Sem rede, sem disco, sem LLM: as trilhas são fixtures em memória.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { auditTrack, type Violation } from '../electron/main/engine/audit';
import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';

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

function moduleOf(slug: string, order: number, lessons: LoadedLesson[]): LoadedModule {
  return {
    meta: { schemaVersion: 1, slug, title: slug, order, lessons: lessons.map((l) => l.meta.slug) },
    lessons,
    challenge: null,
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

function porRegra(violations: Violation[], regra: string): Violation[] {
  return violations.filter((v) => v.regra === regra);
}

// ---------------------------------------------------------------------------
// 1. A13c — ler chamada de função nunca demonstrada (spec §3.5 nº 1)
// ---------------------------------------------------------------------------

describe('A13 — ensino-efetivo', () => {
  it('A13c reprova a aula 1 que manda o aluno LER chamada de função nunca demonstrada', () => {
    // Aula SEM teoria nenhuma: nada foi demonstrado antes; o teste lê `f(1)`.
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [], [
          challenge('c1', {
            testsCode:
              "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('dobra', () => {\n  assert.equal(f(1), 2);\n});\n",
          }),
        ]),
      ]),
    ]);
    const report = auditTrack(t);
    const v = porRegra(report.violations, 'A13').find((x) => x.campo === 'testsCode' && x.construcao === 'node:CallExpression');
    assert.ok(v, `esperada violação A13 (testsCode, CallExpression): ${JSON.stringify(report.violations, null, 2)}`);
    assert.equal(v!.linha, 5, 'a posição é a da chamada DENTRO do corpo — a espinha `assert.equal(` sai pelo span mecânico S13');
    assert.match(v!.mensagem, /o aluno leu uma construção que nunca viu/);
  });

  it('A13c aprova quando a chamada foi demonstrada em aula anterior (spec §3.5 nº 2)', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        // Aula 1: teoria demonstra `f(1)`; o DESAFIO dela não lê nada autoral
        // (o teste dela é a espinha vazia — qualquer chamada aqui violaria A13c,
        // pois nada foi demonstrado ANTES da aula 1; é o test case nº 1 acima).
        lesson('a1', [theory('s1', 'exemplo', 'f(1);')], [
          challenge('c1', {
            solutionCode: 'f(1);',
            testsCode: "import { test } from 'node:test';\ntest('vazio', () => {});\n",
          }),
        ]),
        // Aula 2: a chamada já está no Cum(aula1) → testes podem ler `f(1)`.
        lesson('a2', [theory('s1', 'exemplo', 'f(1);')], [
          challenge('c2', {
            testsCode:
              "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('usa', () => {\n  assert.equal(f(1), 1);\n});\n",
            solutionCode: 'f(1);',
          }),
        ]),
      ]),
    ]);
    const report = auditTrack(t);
    const v = porRegra(report.violations, 'A13').filter((x) => x.campo === 'testsCode' && x.construcao === 'node:CallExpression');
    assert.deepEqual(v, [], JSON.stringify(report.violations, null, 2));
  });

  it('A13c aprova quando a chamada foi demonstrada na teoria DA MESMA aula (spec §3.2 — caso real da L1)', () => {
    // Aula índice 0 (nenhum acumulado anterior), teoria desta PRÓPRIA aula com
    // a chamada demonstrada (`assert.equal(resposta(), 7)` é a linha autoral do
    // teste da L1 — a espinha `assert.equal(` sai pelo span S13, a chamada
    // `resposta()` é o 1º argumento, autoral). A fórmula da spec §3.2
    // ("demonstrado em teoria (desta/anteriores)") inclui Demo(i) para o teste:
    // antes da correção esta aula violava A13c (falso positivo reportado pelo
    // autor da aula de abertura no feed integral).
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s1', 'a máquina que confere', 'assert.equal(resposta(), 7);')], [
          challenge('c1', {
            solutionCode: 'export function resposta() {\n  return 7;\n}\n',
            testsCode:
              "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { resposta } from './solution.mjs';\ntest('escolha o número 7', () => {\n  assert.equal(resposta(), 7);\n});\n",
          }),
        ]),
      ]),
    ]);
    const report = auditTrack(t);
    const v = porRegra(report.violations, 'A13').filter((x) => x.campo === 'testsCode' && x.construcao === 'node:CallExpression');
    assert.deepEqual(v, [], `a teoria DESTA aula demonstra a chamada: ${JSON.stringify(report.violations, null, 2)}`);
    // O pecado nº 1 (chamada sem NENHUMA demonstração) continua sendo pego —
    // o teste nº 1 acima prova que a aula SEM teoria viola.
  });
});

// ---------------------------------------------------------------------------
// 3. A13d — declarar não é demonstrar (modo declared)
// ---------------------------------------------------------------------------

describe('A13d — declarar não é demonstrar', () => {
  it('reprova introduces.productive declarado sem NENHUM bloco de código mostrando a construção', () => {
    const aula = lesson('a1', [theory('s1', 'só prosa sobre condições.')], [
      challenge('c1', { solutionCode: 'export function f(x) {\n  return 1;\n}\n' }),
    ]);
    const comIntroduces: LoadedLesson = {
      ...aula,
      meta: {
        ...aula.meta,
        introduces: { productive: ['node:IfStatement'], receptive: [] },
      } as LoadedLesson['meta'],
    };
    const t = trackOf([moduleOf('m1', 1, [comIntroduces])]);
    const report = auditTrack(t);
    const v = porRegra(report.violations, 'A13d');
    assert.equal(v.length, 1, JSON.stringify(report.violations, null, 2));
    assert.equal(v[0].construcao, 'node:IfStatement');
    assert.match(v[0].mensagem, /declarar não é demonstrar/);
  });

  it('aprova quando a construção declarada APARECE num bloco de código da teoria', () => {
    const aula = lesson('a1', [theory('s1', 'exemplo', 'function f(x) {\n  if (x) { return 1; }\n  return 0;\n}\n')], [
      challenge('c1', { solutionCode: 'export function f(x) {\n  if (x) { return 1; }\n  return 0;\n}\n' }),
    ]);
    const comIntroduces: LoadedLesson = {
      ...aula,
      meta: {
        ...aula.meta,
        introduces: {
          productive: ['node:IfStatement'],
          receptive: ['node:FunctionDeclaration', 'node:ReturnStatement'],
        },
      } as LoadedLesson['meta'],
    };
    const t = trackOf([moduleOf('m1', 1, [comIntroduces])]);
    const report = auditTrack(t);
    assert.deepEqual(porRegra(report.violations, 'A13d'), [], JSON.stringify(report.violations, null, 2));
  });
});

// ---------------------------------------------------------------------------
// 4. A14a — teto de construções verdadeiramente novas por aula
// ---------------------------------------------------------------------------

describe('A14a — teto de micro-avanço', () => {
  // Aula que demonstra 2 construções novas (function + return): passa.
  // Aula seguinte que demonstra 5+: viola.
  it('reprova aula com 5 construções verdadeiramente novas e aprova aula com 2', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s1', 'exemplo', 'function f() {\n  return 1;\n}\n')], [
          challenge('c1', { solutionCode: 'export function f() {\n  return 1;\n}\n' }),
        ]),
        lesson('a2', [theory('s1', 'exemplo', 'function g(x) {\n  if (x) {\n    return 1;\n  }\n  throw new Error(\'x\');\n}\n')], [
          challenge('c2', {
            solutionCode: 'export function g(x) {\n  if (x) {\n    return 1;\n  }\n  throw new Error(\'x\');\n}\n',
          }),
        ]),
      ]),
    ]);
    const report = auditTrack(t);
    const v = porRegra(report.violations, 'A14a');
    const daAula2 = v.filter((x) => x.ref === 'm1/a2' && x.severidade === 'erro');
    const daAula1 = v.filter((x) => x.ref === 'm1/a1' && x.severidade === 'erro');
    assert.equal(daAula2.length, 1, JSON.stringify(v, null, 2));
    assert.match(daAula2[0].mensagem, /acima do teto de 4/);
    assert.equal(daAula1.length, 0, 'aula com 2 novos passa no teto');
  });

  it('aviso (não erro) na aula que não introduz NENHUMA construção nova', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s1', 'só prosa.')], [challenge('c1')]),
      ]),
    ]);
    const report = auditTrack(t);
    const v = porRegra(report.violations, 'A14a');
    assert.equal(v.length, 1, JSON.stringify(report.violations, null, 2));
    assert.equal(v[0].severidade, 'aviso');
    assert.match(v[0].mensagem, /aula sem incremento/);
  });
});

// ---------------------------------------------------------------------------
// 5. A14b — combo de construções novas na mesma linha
// ---------------------------------------------------------------------------

describe('A14b — combo na mesma linha', () => {
  it('reprova a linha do solutionCode que combina return e + (2 construções novas)', () => {
    // A teoria demonstra a função com return e a CONCATENAÇÃO (+), então ambos
    // são verdadeiramente novos desta aula; na linha `return a + b;` caem os dois.
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s1', 'exemplo', "function somar(a, b) {\n  return a + b;\n}\n")], [
          challenge('c1', {
            starterCode: 'export function somar(a, b) {\n  // complete\n}\n',
            solutionCode: 'export function somar(a, b) {\n  return a + b;\n}\n',
          }),
        ]),
      ]),
    ]);
    const report = auditTrack(t);
    const v = porRegra(report.violations, 'A14b');
    assert.equal(v.length, 1, JSON.stringify(report.violations, null, 2));
    // `return a + b;` = DUAS CONSTRUÇÕES novas na linha: ReturnStatement e o
    // sinal + (op:binary:+) — o nó BinaryExpression colapsa no op (a
    // granularidade didática da spec §4.2: aula 1 L5 `return 'Olá, ' + nome +
    // '!'` = ReturnStatement + op:binary:+ = 2, apesar de DOIS `+`).
    assert.match(v[0].mensagem, /combina 2 construções novas/);
  });

  it('aprova a linha com UMA construção nova sozinha', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s1', 'exemplo', 'function f() {\n  return 1;\n}\n')], [
          challenge('c1', {
            starterCode: 'export function f() {\n  // complete\n}\n',
            solutionCode: 'export function f() {\n  return 1;\n}\n',
          }),
        ]),
      ]),
    ]);
    const report = auditTrack(t);
    assert.deepEqual(porRegra(report.violations, 'A14b'), [], JSON.stringify(report.violations, null, 2));
  });
});

// ---------------------------------------------------------------------------
// 6. A15a — degrau INTRA-aula
// ---------------------------------------------------------------------------

describe('A15a — progressividade intra-aula', () => {
  it('reprova o 2º desafio que não reusa NADA do 1º (e ainda adiciona 6 novos não demonstrados)', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s1', 'exemplo', 'function f() {\n  return 1;\n}\n')], [
          challenge('c1', { slug: 'c1', solutionCode: 'export function f() {\n  return 1;\n}\n' }),
          challenge('c2', {
            slug: 'c2',
            starterCode: '// complete\n',
            solutionCode: 'export const y = 2;\n',
          }),
        ]),
      ]),
    ]);
    const report = auditTrack(t);
    const v = porRegra(report.violations, 'A15a');
    assert.ok(v.length >= 1, JSON.stringify(report.violations, null, 2));
    assert.ok(
      v.some((x) => x.mensagem.includes('não usa NENHUM átomo do desafio anterior')),
      `esperada a violação de reuso (i): ${v.map((x) => x.mensagem).join(' | ')}`,
    );
  });

  it('aprova o 2º desafio que REUSA o 1º — off-by-one do k=1 corrigido (probe verif/probe-a15a-off-by-one.mts)', () => {
    // Antes da correção o acumulado começava VAZIO e só ganhava `solucoes[k-1]`
    // no FIM da iteração: em k=1 o 2º desafio violava "sem reuso" SEMPRE, mesmo
    // com solução IDÊNTICA à do 1º. Com o init na solução do 1º desafio, um
    // degrau que reusa algo do anterior passa (e sem novos não demonstrados).
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson('a1', [theory('s1', 'exemplo', 'function f(x) {\n  return x;\n}\n')], [
          challenge('c1', {
            slug: 'c1',
            starterCode: 'export function f(x) {\n  // lacuna\n}\n',
            solutionCode: 'export function f(x) {\n  return x;\n}\n',
          }),
          challenge('c2', {
            slug: 'c2',
            starterCode: 'export function f(x) {\n  return x;\n}\n',
            solutionCode: 'export function f(x) {\n  return x;\n}\n',
          }),
        ]),
      ]),
    ]);
    const report = auditTrack(t);
    const v = porRegra(report.violations, 'A15a');
    assert.deepEqual(v, [], JSON.stringify(report.violations, null, 2));
  });
});

// ---------------------------------------------------------------------------
// 7. A15b — arco INTEr-aula (recuperação espaçada)
// ---------------------------------------------------------------------------

describe('A15b — reuso inter-aula', () => {
  // L1 demonstra function/return/console.log; L2 só usa o NOVO dela (const) →
  // não reutiliza nada → viola; L3 (identical in novo) reusa console.log → passa.
  it('reprova a aula cuja solução só usa o novo e aprova a que reutiliza material anterior', () => {
    const l1 = lesson('a1', [theory('s1', 'exemplo', "function f() {\n  return 1;\n}\nconsole.log(f());\n")], [
      challenge('c1', { solutionCode: 'export function f() {\n  return 1;\n}\nconsole.log(f());\n' }),
    ]);
    const l2 = lesson('a2', [theory('s1', 'exemplo', 'const total = 1;\n')], [
      challenge('c2', { starterCode: '// complete\n', solutionCode: 'export const total = 1;\n' }),
    ]);
    const l3 = lesson('a3', [theory('s1', 'exemplo', 'const total = 1;\n')], [
      challenge('c3', {
        starterCode: 'export function usar() {\n  // complete\n}\n',
        solutionCode: "export function usar() {\n  console.log('ok');\n  return 1;\n}\n",
      }),
    ]);
    const t = trackOf([moduleOf('m1', 1, [l1, l2, l3])]);
    const report = auditTrack(t);
    const v = porRegra(report.violations, 'A15b');
    assert.equal(v.length, 1, JSON.stringify(report.violations, null, 2));
    assert.equal(v[0].ref, 'm1/a2', 'a2 não reutiliza nada; a3 reutiliza console.log/função');
    assert.match(v[0].mensagem, /recuperação espaçada/);
  });
});

// ---------------------------------------------------------------------------
// 8. A16 — primeira atividade resolvível com a seção inicial
// ---------------------------------------------------------------------------

describe('A16 — primeira-atividade', () => {
  it('reprova o 1º desafio que exige construção demonstrada só na 2ª seção (spec §6.5 nº 1)', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson(
          'a1',
          [
            theory('s1', 'só prosa — seção inicial sem código nenhum.'),
            theory('s2', 'exemplo', 'function f(x) {\n  if (x) { return 1; }\n  return 0;\n}\n'),
          ],
          [
            challenge('c1', {
              starterCode: 'export function f(x) {\n  // complete\n}\n',
              solutionCode: 'export function f(x) {\n  if (x) { return 1; }\n  return 0;\n}\n',
            }),
          ],
        ),
      ]),
    ]);
    const report = auditTrack(t);
    const v = porRegra(report.violations, 'A16').filter((x) => x.construcao === 'node:IfStatement');
    assert.equal(v.length, 1, JSON.stringify(report.violations, null, 2));
    assert.match(v[0].mensagem, /demonstrado só na seção "s2"/);
  });

  it('aprova quando a 1ª seção demonstra o exigido (spec §6.5 nº 2)', () => {
    const t = trackOf([
      moduleOf('m1', 1, [
        lesson(
          'a1',
          [
            theory('s1', 'exemplo', 'function f(x) {\n  if (x) { return 1; }\n  return 0;\n}\n'),
          ],
          [
            challenge('c1', {
              starterCode: 'export function f(x) {\n  // complete\n}\n',
              solutionCode: 'export function f(x) {\n  if (x) { return 1; }\n  return 0;\n}\n',
            }),
          ],
        ),
      ]),
    ]);
    const report = auditTrack(t);
    assert.deepEqual(porRegra(report.violations, 'A16'), [], JSON.stringify(report.violations, null, 2));
  });
});

// ---------------------------------------------------------------------------
// 9. CASO FELIZ — uma sequência L1–L3 de micro-currículo
//
// Fixtures mínimas com o desenho das três primeiras aulas: L1 é a aula de
// LEITURA do invólucro (a "máquina que confere"), L2 é "digite o número"
// (valor e instrução), L3 é "a lacuna é a chamada" (função e chamada).
//
// O que a bateria exige (e o que este caso prova):
//   - A13c: os testes da L2/L3 chamam `conferidor()`/`resposta()` — a CHAMADA
//     é demonstrada na 2ª seção da L1 (aula ANTERIOR), então a leitura pré-aula
//     passa. A L1 não tem desafio: a primeira aula que ESCREVE é a L2, cujos
//     testes já encontram a chamada no cumulativo. A spec §3.2 aceita o
//     veredito oposto para uma trilha que erra (aula 1 que lê chamada = o
//     pecado nº 1); aqui a sequência nasce SEM esse pecado.
//   - A14a: aulas de PRÁTICA (L2 escreve só um literal; L3 só a chamada) não
//     introduzem construções novas não-H13 → a calibração da spec §4.1 marca
//     AVISO ("aula sem incremento"), jamais erro. "Passar na bateria" = ZERO
//     ERROS — e o teste prova que os únicos avisos são esses dois, nas aulas de
//     prática, exatamente como a spec prevê.
//   - A15b: L2 e L3 reutilizam demonstração anterior (function/return/chamada
//     da L1) → o arco inter-aula passa na sequência micro do curriculo.
//   - A16: o 1º desafio de cada aula só usa o que já estava demonstrado antes
//     (a seção inicial da L2/L3 é só prosa, mas tudo que o desafio escreve é
//     literal/chamada — H13 ou cumulativo) → passa.
// ---------------------------------------------------------------------------

describe('caso feliz — L1–L3 de um micro-currículo passam na bateria inteira', () => {
  it('zero ERROS da bateria A13–A16 na sequência micro (só os 2 avisos de aula-de-prática)', () => {
    // L1 — como-o-site-confere-seu-codigo: aula de LEITURA (sem desafio).
    // Seção 1: o invólucro congelado (function + return → 2 novas). Seção 2:
    // a leitura do conferidor (`assert.equal(conferidor(), 7)` → chamada, a 3ª
    // nova) — é aqui que a chamada entra no cumulativo para os testes das
    // aulas seguintes.
    const l1 = lesson(
      'como-o-site-confere-seu-codigo',
      [
        theory('como-ler-o-desafio', 'A caixa inteira já está pronta; muda só o número.', 'export function conferidor() {\n  return 7;\n}\n'),
        theory('a-maquina-que-confere', 'O site importa a caixa e confere o que ela devolve.', 'assert.equal(conferidor(), 7);\n'),
      ],
      [],
      ['involucro'],
    );

    // L2 — valor-e-instrucao: o aluno digita o NÚMERO (lacuna única). Teoria só
    // prosa — nada novo para demonstrar: aula de PRÁTICA de leitura/escrita de
    // literal → aviso A14a (classificação correta da spec §4.1), nunca erro.
    const l2 = lesson(
      'valor-e-instrucao',
      [
        theory('valor-e-instrucao', 'Número é um VALOR; a linha congelada é a INSTRUÇÃO que entrega o número ao conferidor.'),
      ],
      [
        challenge('digitar-o-numero', {
          concept: 'valor',
          starterCode: 'export function conferidor() {\n  return 0;\n}\n',
          solutionCode: 'export function conferidor() {\n  return 7;\n}\n',
          testsCode:
            "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { conferidor } from './solution.mjs';\ntest('o número conferido é 7', () => {\n  assert.equal(conferidor(), 7);\n});\n",
        }),
      ],
      ['valor'],
    );

    // L3 — funcao-e-chamada: a lacuna é a CHAMADA (curriculo: "o primeiro ato
    // produtivo de função do aluno é a chamada"). A chamada já está no
    // cumulativo (L1 seção 2) → aula de PRÁTICA da chamada (aviso A14a).
    const l3 = lesson(
      'funcao-e-chamada',
      [
        theory('chamar', 'Chamar é escrever o nome da caixa com parênteses: a caixa roda e devolve o número.'),
      ],
      [
        challenge('chama-a-caixa', {
          concept: 'chamada',
          starterCode: 'export function conferidor() {\n  return 0;\n}\nfunction resposta() {\n  return 5;\n}\n',
          solutionCode: 'export function conferidor() {\n  return resposta();\n}\nfunction resposta() {\n  return 5;\n}\n',
          testsCode:
            "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { conferidor } from './solution.mjs';\ntest('conferidor devolve a resposta', () => {\n  assert.equal(conferidor(), 5);\n});\n",
        }),
      ],
      ['chamada'],
    );

    const t = trackOf([moduleOf('modulo-1', 1, [l1, l2, l3])]);
    const report = auditTrack(t);

    const bateria: string[] = ['A13', 'A13d', 'A14a', 'A14b', 'A15a', 'A15b', 'A16'];
    const erros = report.violations.filter((v) => bateria.includes(v.regra) && (v.severidade ?? 'erro') === 'erro');
    assert.deepEqual(erros, [], `L1–L3 passam na bateria INTEIRA (zero erros): ${JSON.stringify(erros, null, 2)}`);

    // Os únicos avisos são os 2 do A14a — as aulas de PRÁTICA (L2 literal, L3
    // chamada) introduzem zero construções novas não-H13 → "aula sem incremento"
    // (calibração §4.1), nunca erro. É a leitura honesta do micro-currículo sob
    // a bateria: aula pequena de prática = aviso, exatamente como a spec prevê.
    const avisos = report.violations.filter((v) => bateria.includes(v.regra) && v.severidade === 'aviso');
    assert.deepEqual(
      avisos.map((v) => v.ref).sort(),
      ['modulo-1/funcao-e-chamada', 'modulo-1/valor-e-instrucao'],
      JSON.stringify(avisos, null, 2),
    );
    assert.ok(avisos.every((v) => v.regra === 'A14a'));

    // A15b explícito — L2 e L3 reutilizam demonstração anterior (function/return/
    // chamada da L1): a sequência micro do curriculo passa no arco inter-aula.
    assert.deepEqual(porRegra(report.violations, 'A15b'), []);

    // Sanidade do desenho: L1 introduz 3 construções verdadeiramente novas
    // (function, return, chamada); L2/L3 nada de novo (aulas de prática).
    const metricas = new Map(report.metrics.map((m) => [m.ref, m.novosVerdadeiros]));
    assert.deepEqual(
      [
        metricas.get('modulo-1/como-o-site-confere-seu-codigo'),
        metricas.get('modulo-1/valor-e-instrucao'),
        metricas.get('modulo-1/funcao-e-chamada'),
      ],
      [3, 0, 0],
    );

    // Nada da bateria derrubou: o placar de erros da trilha inteira é zero.
    assert.equal(report.totals.violacoes, 0, JSON.stringify(report.violations, null, 2));
  });
});

