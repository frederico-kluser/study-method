/**
 * tests/cx-langqual-quality-progressao.test.ts — CARACTERIZAÇÃO (golden
 * master) da bateria de PROGRESSÃO A13–A16 (`engine/quality/progressao.ts`).
 * Rede de segurança para a refatoração.
 *
 * Contratos que mordem aqui — os LIMIARES EXATOS:
 *   - A13 (a/b/c): o que se ESCREVE (solution − starter), se LÊ (starter) e se
 *     LÊ ANTES (tests, fora dos spans mecânicos S13) precisa estar
 *     DEMONSTRADO (Demo ∪ Cum ∪ AX ∪ H13) — sem demonstração é ERRO; chave da
 *     lista AVISO13 (valor/termo que a prosa ensina) é AVISO;
 *   - A13d [só declared]: introduzir sem demonstrar é erro (declarar não é
 *     demonstrar);
 *   - A14a: |Novo(i)| == 0 ⇒ AVISO (aula sem incremento); == teto (default 4)
 *     passa; > teto ⇒ ERRO; e [declared] |introduces.productive| > 2 ⇒ ERRO
 *     (exatas 2 passam);
 *   - A14b: >1 CONSTRUÇÃO nova na mesma linha da solução ⇒ erro (a contagem é
 *     por construção-na-linha: `node:BinaryExpression` colapsa no `op:*` e a
 *     maquinaria let/const/var colapsa no `decl:*`);
 *   - A15a (intra-aula ≥2 desafios), A15b (reuso obrigatório de Cum, i ≥ 1) e
 *     A16 (1º desafio limitado à DemoSec1 = a seção de ÍNDICE 0) ⇒ erro;
 *   - `spansMecanicosDeTeste` isenta só a MECÂNICA (import inteiro; assinatura
 *     `test('t', () =>`; `assert.m(` até o 1º argumento; `() =>` de
 *     throws/rejects/doesNotThrow) — o corpo/argumento é autoral;
 *   - a bateria é JAVASCRIPT-ONLY com guarda explícita (outra linguagem LANÇA
 *     — veredito errado e silencioso seria o pior defeito).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AtomKey } from '../electron/main/engine/atomKeys';
import { EngineLinguagemError } from '../electron/main/engine/extract';
import type { TrackTheorySection } from '../electron/main/content/trackTypes';
import {
  H13,
  AVISO13,
  spansMecanicosDeTeste,
  auditarProgressao,
  type ProgressaoDesafioInput,
  type ProgressaoLessonInput,
} from '../electron/main/engine/quality/progressao';

// ---------------------------------------------------------------------------
// Fixtures enxutas — desafios SEM conteúdo autoral por padrão (quem prova algo
// sobre A13/A14b põe o fonte no solution/starter/tests do caso).
// ---------------------------------------------------------------------------

function secao(id: string, code: string | null): TrackTheorySection {
  return code === null
    ? { id, title: id, markdown: 'abertura em prosa' }
    : { id, title: id, markdown: 'a teoria mostra o código', code: { language: 'js', code } };
}

function desafio(slug: string, solution = '', starter = '', tests = ''): ProgressaoDesafioInput {
  return {
    slug,
    desafioFile: `modules/m/lessons/l/challenges/${slug}.json`,
    files: [{ path: 'solution.mjs', starter, solution }],
    tests,
  };
}

function aula(
  slug: string,
  opts: {
    theory?: TrackTheorySection[];
    challenges?: ProgressaoDesafioInput[];
    declared?: { productive?: AtomKey[]; receptive?: AtomKey[] } | null;
  } = {},
): ProgressaoLessonInput {
  return {
    ref: `modulo/${slug}`,
    baseDir: `modules/m/lessons/${slug}`,
    theory: opts.theory ?? [],
    challenges: opts.challenges ?? [desafio('d1')],
    ...(opts.declared !== undefined ? { declared: opts.declared } : {}),
  };
}

/** Chaves FRESCAS (fora de AX e de H13) — o que conta como "verdadeiramente novo". */
const FRESCAS: AtomKey[] = [
  'node:WhileStatement',
  'node:ForStatement',
  'node:IfStatement',
  'node:ThrowStatement',
  'node:SwitchStatement',
];

describe('progressao — (0) H13, AVISO13 e os spans mecânicos S13', () => {
  it('H13 é o boilerplate ESTREITO: o AX + a mecânica do node:test (não perdoa Call/Arrow)', () => {
    for (const k of [
      'node:SourceFile',
      'node:Identifier',
      'node:Block',
      'node:ImportDeclaration',
      'api:test',
      'api:assert.equal',
      'global:test',
      'global:assert',
      'node:StringLiteral',
      'node:NumericLiteral',
    ]) {
      assert.ok((H13 as readonly string[]).includes(k), `H13 sem ${k}`);
    }
    assert.ok(!(H13 as readonly string[]).includes('node:CallExpression'), 'H13 NÃO perdoa chamada — é o ponto da lista estreita');
    assert.ok(!(H13 as readonly string[]).includes('node:ArrowFunction'));
  });

  it('AVISO13 é a lista fechada de valores/termos que a prosa pode ensinar', () => {
    assert.deepEqual(
      [...AVISO13].sort(),
      [
        'global:BigInt',
        'global:Boolean',
        'global:Infinity',
        'global:NaN',
        'global:Number',
        'global:String',
        'global:Symbol',
        'global:undefined',
        'node:FalseKeyword',
        'node:NoSubstitutionTemplateLiteral',
        'node:NullKeyword',
        'node:RegularExpressionLiteral',
        'node:TemplateExpression',
        'node:TemplateHead',
        'node:TemplateMiddle',
        'node:TemplateTail',
        'node:TrueKeyword',
      ],
    );
  });

  it('spansMecanicosDeTeste isenta SÓ a mecânica (o texto de cada span é o contrato)', () => {
    const codigo = [
      "import { test } from 'node:test';",
      "test('a', () => {",
      '  assert.equal(f(1), 2);',
      '});',
      '',
    ].join('\n');
    const spans = spansMecanicosDeTeste(codigo);
    assert.deepEqual(
      spans.map((s) => codigo.slice(s.inicio, s.fim)),
      [
        "import { test } from 'node:test';",
        "test('a', () => ",
        'assert.equal(',
      ],
    );
  });

  it('em assert.throws/rejects/doesNotThrow a assinatura `() =>` do callback TAMBÉM é mecânica', () => {
    const codigo = "test('t', () => {\n  assert.throws(() => f());\n});\n";
    const textos = spansMecanicosDeTeste(codigo).map((s) => codigo.slice(s.inicio, s.fim));
    assert.ok(textos.some((t) => t.startsWith("test('t', () =>")));
    assert.ok(textos.some((t) => t.startsWith('assert.throws(() =>')), 'a seta entra no span mecânico');
    assert.ok(!textos.some((t) => t.includes('f()')), 'o CORPO do callback é autoral');
  });
});

describe('progressao — (1) limiar EXATO do A14a', () => {
  it('|Novo| == 0 ⇒ AVISO; == 4 (o teto) passa; == 5 ⇒ ERRO', () => {
    const com4 = aula('com4', { declared: { productive: FRESCAS.slice(0, 4) } });
    const com5 = aula('com5', { declared: { productive: FRESCAS.slice(0, 5) } });
    const semNada = aula('sem-nada');

    const a14a = (ls: ProgressaoLessonInput[]) =>
      auditarProgressao(ls).violations.filter((v) => v.regra === 'A14a' && v.mensagem.includes('construções verdadeiramente novas'));

    assert.deepEqual(a14a([com4]), [], 'exatamente 4 passa (o teto é 4, estrito)');
    const cinco = a14a([com5]);
    assert.equal(cinco.length, 1);
    assert.equal(cinco[0].severidade, 'erro');
    assert.match(cinco[0].mensagem, /introduz 5 construções verdadeiramente novas — acima do teto de 4/);

    const zero = auditarProgressao([semNada]).violations.filter(
      (v) => v.regra === 'A14a' && v.severidade === 'aviso',
    );
    assert.equal(zero.length, 1);
    assert.match(zero[0].mensagem, /não introduz NENHUMA construção nova/);
  });

  it('o teto é PARÂMETRO (tetoNovos) e o A14a-declared tem o teto PRÓPRIO de 2 produtivas', () => {
    const dois = aula('dois', { declared: { productive: FRESCAS.slice(0, 2) } });
    const tres = aula('tres', { declared: { productive: FRESCAS.slice(0, 3) } });

    const viol = auditarProgressao([dois, tres]).violations.filter(
      (v) => v.mensagem.includes('construções produtivas em introduces'),
    );
    assert.equal(viol.length, 1, 'só a de 3 produtivas declaradas reprova');
    assert.equal(viol[0].ref, 'modulo/tres');
    assert.match(viol[0].mensagem, /declara 3 construções produtivas em introduces — máximo 2 \(A7\/I2\)/);

    const comTeto1 = auditarProgressao([aula('x', { declared: { productive: FRESCAS.slice(0, 2) } })], {
      tetoNovos: 1,
    }).violations.filter((v) => v.mensagem.includes('verdadeiramente novas'));
    assert.equal(comTeto1.length, 1, 'com tetoNovos: 2 novas já estouram');
  });
});

describe('progressao — (2) A13: demonstrar ou não existir (erro × aviso-D4)', () => {
  it('solution com construção nunca demonstrada ⇒ A13 ERRO em solutionCode', () => {
    const v = auditarProgressao([
      aula('a1', { challenges: [desafio('d1', 'while (x > 1) { x = 0; }')] }),
    ]).violations;
    const erros = v.filter((x) => x.regra === 'A13' && x.campo === 'solutionCode');
    const chaves = erros.map((x) => x.construcao);
    assert.ok(chaves.includes('node:WhileStatement'), 'o while nunca demonstrado é erro');
    assert.equal(erros.every((x) => x.severidade === 'erro'), true);
    assert.equal(erros[0].faixa, 'productive');
    assert.match(erros.find((x) => x.construcao === 'node:WhileStatement')?.mensagem ?? '', /nunca mostrou/);
  });

  it('chave da lista AVISO13 (null/undefined/template…) sem demonstração é AVISO, não erro', () => {
    const v = auditarProgressao([
      aula('a2', { challenges: [desafio('d1', 'let x = null;')] }),
    ]).violations;
    const doNull = v.filter((x) => x.construcao === 'node:NullKeyword');
    assert.equal(doNull.length, 1);
    assert.equal(doNull[0].severidade, 'aviso');
    assert.match(doNull[0].mensagem, /um valor\/termo/);
  });

  it('starter lido sem demonstração ⇒ A13 em starterCode (faixa receptive)', () => {
    const v = auditarProgressao([
      aula('a3', { challenges: [desafio('d1', '', 'while (x > 1) { x = 0; }')] }),
    ]).violations;
    const doStarter = v.filter((x) => x.campo === 'starterCode' && x.construcao === 'node:WhileStatement');
    assert.equal(doStarter.length, 1);
    assert.equal(doStarter[0].faixa, 'receptive');
  });

  it('teste: o corpo do callback é AUTORAL e viola; a mecânica S13 e H13 não', () => {
    const v = auditarProgressao([
      aula('a4', { challenges: [desafio('d1', '', '', "test('t', () => {\n  while (x) { x = 0; }\n});\n")] }),
    ]).violations;
    const doTeste = v.filter((x) => x.campo === 'testsCode');
    assert.ok(doTeste.some((x) => x.construcao === 'node:WhileStatement'), 'corpo autoral sem demonstração viola');
    assert.ok(!doTeste.some((x) => x.construcao === 'node:CallExpression'), 'a chamada test( é mecânica (span S13)');
  });

  it('demonstrado na MESMA aula ou em Cum perdoa (Demo(i) ∪ Cum(i) valem para o teste)', () => {
    const teoria = [secao('s1', 'while (x > 1) { x = 0; }')];
    const v = auditarProgressao([
      aula('a5', {
        theory: teoria,
        challenges: [desafio('d1', 'while (y > 2) { y = 0; }', '', "test('t', () => {\n  while (x) { x = 0; }\n});\n")],
      }),
    ]).violations;
    assert.deepEqual(v.filter((x) => x.construcao === 'node:WhileStatement'), []);
  });
});

describe('progressao — (3) A13d declarar não é demonstrar [só declared]', () => {
  it('introduzido sem bloco nenhum ⇒ ERRO; sem `declared` (inferred) a regra não roda', () => {
    const comDeclarado = aula('d1', { declared: { productive: ['node:WhileStatement'] } });
    const viol = auditarProgressao([comDeclarado]).violations.filter((v) => v.regra === 'A13d');
    assert.equal(viol.length, 1);
    assert.equal(viol[0].severidade, 'erro');
    assert.equal(viol[0].construcao, 'node:WhileStatement');
    assert.equal(viol[0].primeiraAulaQueEnsina, 'modulo/d1', 'introduzido por declaração — não é lacuna de currículo');
    assert.match(viol[0].mensagem, /declarar não é demonstrar/);

    const semDeclared = aula('d2');
    assert.deepEqual(auditarProgressao([semDeclared]).violations.filter((v) => v.regra === 'A13d'), []);
  });
});

describe('progressao — (4) A14b: a lacuna única tem 1 construção por linha', () => {
  it('UMA construção nova na linha passa; DUAS na mesma linha ⇒ erro (contagem por construção)', () => {
    // `x = 1;` → op:assign:= é a única construção nova (BinaryExpression colapsa nele).
    const uma = aula('uma', {
      declared: { productive: ['op:assign:=', 'node:BinaryExpression'] },
      challenges: [desafio('d1', 'x = 1;')],
    });
    // `x = y > 1;` → op:assign:= + op:binary:> = 2 construções novas na linha.
    const duas = aula('duas', {
      declared: { productive: ['op:assign:=', 'op:binary:>', 'node:BinaryExpression'] },
      challenges: [desafio('d1', 'x = y > 1;')],
    });

    assert.deepEqual(
      auditarProgressao([uma]).violations.filter((v) => v.regra === 'A14b'),
      [],
    );
    const a14b = auditarProgressao([duas]).violations.filter((v) => v.regra === 'A14b');
    assert.equal(a14b.length, 1);
    assert.equal(a14b[0].severidade, 'erro');
    assert.equal(a14b[0].linha, 1);
    assert.match(a14b[0].mensagem, /a linha 1 do solutionCode de `modulo\/duas` combina 2 construções novas/);
  });
});

describe('progressao — (5) A15a/A15b/A16 e a guarda JAVASCRIPT-ONLY', () => {
  it('A16: o 1º desafio se limita à DemoSec1 (a seção de ÍNDICE 0 — seção 1 sem código não conta)', () => {
    const v = auditarProgressao([
      aula('s1-sem-codigo', {
        theory: [secao('abertura', null), secao('s2', 'if (x) { x = 1; }')],
        challenges: [desafio('d1', 'if (y) { y = 2; }')],
      }),
    ]).violations;
    const a16 = v.filter((x) => x.regra === 'A16');
    assert.ok(a16.some((x) => x.construcao === 'node:IfStatement'), 'a seção 2 NÃO é a "primeira com código"');
  });

  it('A15b: a solução da aula i≥1 precisa REUTILIZAR algo de Cum (sem reuso ⇒ erro)', () => {
    const v = auditarProgressao([
      aula('l1', {
        theory: [secao('s1', 'while (x > 1) { x = 0; }')],
        challenges: [desafio('d1', 'while (y > 2) { y = 0; }')],
      }),
      aula('l2', {
        challenges: [desafio('d1', 'switch (x) { case y: break; }')],
      }),
    ]).violations;
    const a15b = v.filter((x) => x.regra === 'A15b' && x.ref === 'modulo/l2');
    assert.equal(a15b.length, 1, 'a solução de l2 não reusa NADA do que l1 demonstrou');
    assert.equal(a15b[0].severidade, 'erro');
  });

  it('A15a: degrau intra-aula (≥2 desafios) — o 2º desafio tem de reusar o anterior', () => {
    const v = auditarProgressao([
      aula('intra', {
        theory: [secao('s1', 'while (x > 1) { x = 0; }'), secao('s2', 'while (y > 2) { y = 0; }')],
        challenges: [
          desafio('d1', 'while (a > 1) { a = 0; }'),
          desafio('d2', 'throw e;'),
        ],
      }),
    ]).violations;
    const a15a = v.filter((x) => x.regra === 'A15a');
    assert.equal(a15a.length, 1, 'só o prão do REUSO dispara (o degrau adiciona 1 construção só)');
    assert.equal(a15a[0].severidade, 'erro');
    assert.match(a15a[0].mensagem, /não usa NENHUM átomo do desafio anterior da própria aula/);
  });

  it('a bateria é JAVASCRIPT-ONLY com guarda explícita: adapterId de outra linguagem LANÇA', () => {
    assert.throws(
      () => auditarProgressao([], { adapterId: 'python' }),
      (e: unknown) => {
        assert.ok(e instanceof EngineLinguagemError);
        return true;
      },
    );
  });

  it('o resultado expõe novosPorAula (o placar do audit consome)', () => {
    const r = auditarProgressao([
      aula('n1', { theory: [secao('s1', 'while (x > 1) { x = 0; }')] }),
    ]);
    // WhileStatement + BinaryExpression + op:assign:= + op:binary:> — fora de AX/H13.
    assert.equal(r.novosPorAula.get('modulo/n1'), 4);
  });
});
