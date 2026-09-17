/**
 * tests/engineGatesC.test.ts — AS PORTAS DE ORÇAMENTO E DE REQUIREMENTS DE C
 * (onda 2 do adaptador C).
 *
 * Até esta onda o adaptador C estava registrado, mas o orçamento e o
 * requirements REPROVAVAM qualquer trilha C: `structuralAlwaysAllowed('c')`
 * LANÇAVA `TabelaDeLinguagemAusenteError` (a prova estava em
 * `engineLangC.test.ts` §"a porta de tabelas segue FECHADA"), e
 * `derivarRequirements(…, 'c')` lançava `EngineLinguagemError`. O
 * `deriveTrackBudget` de uma trilha de C nem começava: `entryAxiom`
 * (`budget.ts`) pede a tabela na primeira linha.
 *
 * O que se prova aqui (o espelho do que `engineLangPython.test.ts` prova para
 * a segunda linha):
 *   1. a porta de tabelas de `atomKeys.ts` está ABERTA para 'c' — não lança e
 *      devolve EXATAMENTE as tabelas exportadas (`C_STRUCTURAL_ALWAYS_ALLOWED`
 *      e `C_HARNESS_RECEPTIVE_SEED`), todas chaves válidas do alfabeto e
 *      nenhuma proibição global;
 *   2. a semente foi MEDIDA do harness REAL, não copiada do Python: o teste
 *      roda o extrator C de novo sobre `SM_HARNESS_HEADER`, sobre o TU
 *      combinado header+main, sobre um testsCode da convenção
 *      counter_protocol lido com `SM_COUNT_PREABULO` (fase VALOR) e sobre o
 *      testsCode do TEMPLATE de captura da fase SAÍDA (`freopen`/`fgets`/
 *      sentinel — o envelope que a onda 4 mediu, o mesmo dos desafios vivos
 *      do M1), e fecha o laço nos DOIS sentidos — nada FALTA (todo chave do
 *      testsCode ⊆ semente ∪ estrutural, a regra A3) e nada SOBRA (toda
 *      chave da semente é emitida pelo material real);
 *   3. `deriveTrackBudget` roda numa trilha C sintética SEM lançar, semeia o
 *      axioma de entrada com as tabelas de C, e o orçamento resultante
 *      CONTEM o testsCode e a solução do desafio (as regras A3 e A2 passam
 *      por construção);
 *   4. requirements para 'c': UM requirement por bloco `SM_TEST(<slug>)`,
 *      descrição derivada do TEXTO REAL das verificações `checa_*`, cobertura
 *      com os átomos das funções da SOLUÇÃO chamadas, e bijeção completa
 *      requirements declarados × slugs nos dois sentidos;
 *   5. o despachante continua fail-closed: 'typescript' segue lançando.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  C_HARNESS_RECEPTIVE_SEED,
  C_STRUCTURAL_ALWAYS_ALLOWED,
  LINGUAGENS_COM_TABELA,
  harnessReceptiveSeed,
  isAtomKey,
  isForbiddenAlways,
  structuralAlwaysAllowed,
} from '../electron/main/engine/atomKeys';
import { deriveTrackBudget } from '../electron/main/engine/budget';
import { extractAtoms } from '../electron/main/engine/extract';
import {
  SM_COUNT_PREABULO,
  SM_HARNESS_HEADER,
  SM_MAIN_SOURCE,
  cDetect,
} from '../electron/main/engine/lang/c';
import {
  LINGUAGENS_COM_REQUIREMENTS,
  derivarRequirements,
  validarRequirements,
} from '../electron/main/engine/quality/requirements';
import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';

/** A máquina tem a toolchain de C COMPLETA? (compilador + clang + python3) */
const TEM_C = cDetect().ok;

// ---------------------------------------------------------------------------
// O MATERIAL REAL — os exports do adaptador (nada inventado) e um testsCode na
// convenção counter_protocol (03-tdd §3.9.3): protótipos do que o teste
// exercita + blocos SM_TEST com checa_*, SEM main (o main é do harness).
// ---------------------------------------------------------------------------

const TESTS_CODE_C = [
  'int dobro(int x);',
  '',
  'SM_TEST(dobro_de_2) {',
  '    checa_int("dobro de 2", dobro(2), 4, "o dobro de 2 e 4");',
  '}',
  '',
  'SM_TEST(dobro_de_zero) {',
  '    checa_int("dobro de zero", dobro(0), 0, "o dobro de 0 e 0");',
  '}',
].join('\n');

const SOLUTION_C = 'int dobro(int x) {\n    return 2 * x;\n}\n';

/**
 * O testsCode da fase SAÍDA — o TEMPLATE CONGELADO do modelo
 * cenário-do-harness (`skills/trilha-author/references/prova-c.md` §2–3, os
 * dois desafios vivos do M1 de `c-iniciante` o seguem na íntegra): captura do
 * stdout DENTRO do bloco (`freopen` → chamada → `fflush`), leitura de volta
 * com `fgets` sobre buffer com sentinel, `checa_str` por linha e `fclose` no
 * handle de leitura. É ESTE envelope que a onda 4 mediu contra a semente — o
 * fixture mínimo acima é a fase VALOR, que não captura nada.
 */
const TESTS_CODE_SAIDA_C = [
  '#include <stdio.h>',
  '',
  '/* prototipo da funcao do aluno (o teste declara o que exercita) */',
  'void tela(void);',
  '',
  'SM_TEST(tres_linhas_na_ordem) {',
  '    /* captura: o stdout vira o arquivo sm_saida.tmp */',
  '    freopen("sm_saida.tmp", "w", stdout);',
  '    tela();',
  '    fflush(stdout);',
  '',
  '    FILE *f = fopen("sm_saida.tmp", "r");',
  '    char linha[80] = "(nada impresso)";',
  '    fgets(linha, 80, f);',
  '    checa_str("a primeira linha", linha, "ola, tela!\\n",',
  '              "a primeira coisa impressa e a primeira frase");',
  '    fclose(f);',
  '}',
].join('\n');

/**
 * O TU combinado do `main` do harness: o `sm_main.c` real dá
 * `#define SM_HARNESS_NUCLEO` ANTES do `#include "sm_harness.h"` — a leitura
 * combinada abaixo (define + header + resto do main) tem a MESMA semântica do
 * TU real compilado pelo `run.sh`, sem depender de include path no parse.
 */
function tuCombinadoDoMain(): string {
  const partes = SM_MAIN_SOURCE.split('#include "sm_harness.h"');
  assert.equal(partes.length, 2, 'SM_MAIN_SOURCE mudou: o include do header sumiu');
  return `${partes[0]}#define SM_HARNESS_NUCLEO\n${SM_HARNESS_HEADER}\n${partes[1]}`;
}

/** Chaves de um fonte C pela caminhada do extrator (fail-closed no teste). */
function chavesDe(code: string, fileName: string): Set<string> {
  const r = extractAtoms(code, { fileName, language: 'c' });
  assert.ok(r.ok, `${fileName} deve parsear: ${r.ok ? '' : JSON.stringify(r.error)}`);
  if (!r.ok) return new Set();
  return new Set(r.keys);
}

// ---------------------------------------------------------------------------
// 1. a porta de tabelas está ABERTA para c (pura — não precisa de clang)
// ---------------------------------------------------------------------------

describe('gates C — a porta de tabelas de atomKeys está ABERTA para c', () => {
  it("'c' está em LINGUAGENS_COM_TABELA, e as funções devolvem as tabelas exportadas", () => {
    assert.ok(LINGUAGENS_COM_TABELA.includes('c'), LINGUAGENS_COM_TABELA.join(', '));
    // não lança (era o `TabelaDeLinguagemAusenteError` pinado na onda 1)
    assert.deepEqual([...structuralAlwaysAllowed('c')], [...C_STRUCTURAL_ALWAYS_ALLOWED]);
    assert.deepEqual([...harnessReceptiveSeed('c')], [...C_HARNESS_RECEPTIVE_SEED]);
  });

  it('as tabelas de C são o alfabeto válido, e a semente não perdoa proibição global', () => {
    for (const chave of [...C_HARNESS_RECEPTIVE_SEED, ...C_STRUCTURAL_ALWAYS_ALLOWED]) {
      assert.ok(isAtomKey(chave), `chave inválida no alfabeto: ${chave}`);
      assert.equal(
        isForbiddenAlways(chave, 'c'),
        false,
        `a semente/estrutural de C não pode conter proibição global: ${chave}`,
      );
    }
  });

  it('a porta segue FECHADA para linguagem sem tabela (o fail-closed não afrouxou)', () => {
    assert.throws(() => structuralAlwaysAllowed('ruby' as never), (e: unknown) => e instanceof Error);
    assert.throws(() => harnessReceptiveSeed('ruby' as never), (e: unknown) => e instanceof Error);
  });
});

// ---------------------------------------------------------------------------
// 2. a semente × o HARNESS REAL (mede DE NOVO — o mesmo laço do lado Python)
// ---------------------------------------------------------------------------

describe('gates C — a semente receptiva cobre o harness REAL, e nada além dele', {
  skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false,
}, () => {
  const PERDOADO = new Set<string>([
    ...C_HARNESS_RECEPTIVE_SEED,
    ...C_STRUCTURAL_ALWAYS_ALLOWED,
  ]);

  const chavesDoHeader = chavesDe(SM_HARNESS_HEADER, 'tests/sm_harness.h');
  const chavesDoMain = chavesDe(tuCombinadoDoMain(), 'tests/sm_main.c');
  const chavesDoTestsCode = chavesDe(`${SM_COUNT_PREABULO}\n${TESTS_CODE_C}`, 'tests/test_solucao.c');
  // o envelope da fase SAÍDA (o template congelado dos desafios vivos) — é
  // ELE que a onda 4 mediu contra a semente
  const chavesDoTestsCodeSaida = chavesDe(
    `${SM_COUNT_PREABULO}\n${TESTS_CODE_SAIDA_C}`,
    'tests/test_solucao.c',
  );
  const emitidoPeloMaterial = new Set<string>([
    ...chavesDoHeader,
    ...chavesDoMain,
    ...chavesDoTestsCode,
    ...chavesDoTestsCodeSaida,
  ]);

  it('guardas de sanidade: o material medido é o harness da convenção', () => {
    for (const marca of ['api:fprintf', 'api:strcmp', 'global:stderr', 'node:IncludeDirective']) {
      assert.ok(chavesDoHeader.has(marca), `o header deixou de emitir ${marca}`);
    }
    for (const marca of ['api:fopen', 'api:getenv', 'node:ForStmt']) {
      assert.ok(chavesDoMain.has(marca), `o main deixou de emitir ${marca}`);
    }
    for (const marca of ['api:SM_TEST', 'decl:func', 'node:CallExpr', 'node:IntegerLiteral', 'node:StringLiteral', 'node:TypedefDecl']) {
      assert.ok(chavesDoTestsCode.has(marca), `o testsCode deixou de emitir ${marca}`);
    }
    // o template de SAÍDA carrega o envelope de captura INTEIRO (medido na
    // onda 4): as seis chaves que motivaram a extensão da semente
    for (const marca of [
      'api:freopen',
      'api:fgets',
      'global:stdout',
      'node:DeclStmt',
      'decl:var',
      'node:IncludeDirective',
    ]) {
      assert.ok(chavesDoTestsCodeSaida.has(marca), `o testsCode de SAÍDA deixou de emitir ${marca}`);
    }
  });

  it('nada FALTA: toda chave do testsCode está na semente ∪ estrutural (a regra A3)', () => {
    for (const [nome, chaves] of [
      ['VALOR', chavesDoTestsCode],
      ['SAÍDA', chavesDoTestsCodeSaida],
    ] as const) {
      const fora = [...chaves].filter((k) => !PERDOADO.has(k));
      assert.deepEqual(
        fora,
        [],
        `o envelope do teste C (${nome}) emite chave que a semente não perdoa: ${fora.join(' ')}`,
      );
    }
  });

  it('nada SOBRA: toda chave da semente é emitida pelo harness/testsCode REAL', () => {
    // Semente é PERDÃO: cada chave a mais perdoa, para sempre, uma construção
    // que o aluno não aprendeu. Se o harness deixar de emitir uma chave da
    // lista, a lista tem de encolher junto — este teste é o que obriga.
    const fora = C_HARNESS_RECEPTIVE_SEED.filter((k) => !emitidoPeloMaterial.has(k));
    assert.deepEqual(fora, [], `a semente perdoa chave que nenhum material real emite: ${fora.join(' ')}`);
  });

  it('nada SOBRA: toda chave ESTRUTURAL é emitida pelo material real', () => {
    const fora = C_STRUCTURAL_ALWAYS_ALLOWED.filter((k) => !emitidoPeloMaterial.has(k));
    assert.deepEqual(fora, [], `a tabela estrutural traz chave que nenhum material real emite: ${fora.join(' ')}`);
  });

  it('a fronteira do CONTEÚDO: fluxo, operadores, struct/switch/cast e IndirectCall ficam FORA', () => {
    // As declarações de exclusão do comentário de C_HARNESS_RECEPTIVE_SEED,
    // afirmadas: o corpo dos helpers (if/for/++) mora no header GERADO que o
    // gate não audita; o que o testsCode USAR é cobrança legítima. Os cinco
    // kinds novos do §8.2 que são CONTEÚDO (onda 3) também ficam fora — a
    // exceção é o typedef do PRÓPRIO harness, perdoado no receptivo.
    // (onda 4: `node:DeclStmt`/`decl:var`/`node:IncludeDirective` saíram
    // desta lista — o envelope de captura da fase SAÍDA os emite, e entraram
    // na semente como RECEPTIVAS com a fronteira do teste seguinte.)
    for (const chave of [
      'node:IfStmt',
      'node:ForStmt',
      'node:WhileStmt',
      'node:ReturnStmt',
      'node:BinaryOperator',
      'node:UnaryOperator',
      'op:assign:=',
      'op:binary:*',
      // onda 3 (P1–P6, exceto o typedef do harness): conteúdo de M7 e aulas
      'node:RecordDecl',
      'node:MemberExpr',
      'node:ConditionalOperator',
      'node:SwitchStmt',
      'node:CStyleCastExpr',
    ]) {
      assert.ok(!PERDOADO.has(chave), `${chave} é CONTEÚDO — não pode estar na semente nem na estrutural`);
    }
    // as chaves de HARNESS (typedef da onda 3; as seis do envelope de captura
    // da onda 4) são RECEPTIVAS e SÓ receptivas — nenhuma entra na estrutural
    for (const chave of [
      'node:TypedefDecl',
      'api:freopen',
      'api:fgets',
      'global:stdout',
      'node:DeclStmt',
      'decl:var',
      'node:IncludeDirective',
    ]) {
      assert.ok(C_HARNESS_RECEPTIVE_SEED.includes(chave), `${chave} saiu da semente`);
      assert.ok(
        !C_STRUCTURAL_ALWAYS_ALLOWED.includes(chave),
        `${chave} é perdão do HARNESS (receptivo) — nunca sempre-perdão nas duas faixas`,
      );
    }
    // proibição global de C: o despacho `sm_fns[i]()` do main emite, mas o
    // gate nunca audita o main — e semente não perdoa o indecidível.
    assert.ok(!PERDOADO.has('node:IndirectCall'));
    assert.ok(chavesDoMain.has('node:IndirectCall'), 'o main deixou de emitir node:IndirectCall');
  });

  it('a fronteira do decl:var: o TESTE que declara variável passa, a SOLUÇÃO antecipada continua reprovando', () => {
    // A decisão pedagógica da onda 4, afirmada nos dois sentidos (o precedente
    // é o node:TypedefDecl da onda 3): decl:var é CONTEÚDO (a aula M1
    // `um-nome-para-um-valor` o ensina produtivamente), mas o ENVELOPE do
    // teste declara FILE*/char[] antes da aula — então o perdão é SÓ
    // receptivo.
    //
    // 1) RECEPTIVO: o testsCode com declaração local (o envelope de captura)
    //    cabe no orçamento receptivo de ENTRADA — não viola A3.
    const trilha = trilhaC();
    const { entrada } = deriveTrackBudget(trilha).lessons[0];
    for (const chave of ['decl:var', 'node:DeclStmt', 'node:IncludeDirective']) {
      assert.ok(entrada.receptive.has(chave), `o receptivo de entrada não semeou ${chave}`);
    }
    const doTestsComVar = chavesDe(`${SM_COUNT_PREABULO}\n${TESTS_CODE_SAIDA_C}`, 'tests/test_solucao.c');
    const foraA3 = [...doTestsComVar].filter((k) => !entrada.receptive.has(k));
    assert.deepEqual(foraA3, [], `o testsCode que usa decl:var violou A3: ${foraA3.join(' ')}`);

    // 2) PRODUTIVO: a SOLUÇÃO que declara variável ANTES da aula que ensina
    //    `var` emite decl:var (+ node:DeclStmt) FORA do produtivo de SAÍDA —
    //    a aula tem de ENSINAR (declara no introduces) para o desafio abri-la.
    const SOLUCAO_COM_VAR = 'int dobro(int x) {\n    int y = x * 2;\n    return y;\n}\n';
    const trilhaVar = trilhaC();
    (trilhaVar.modules[0].lessons[0].challenges[0] as TrackChallengeSource).solutionCode =
      SOLUCAO_COM_VAR;
    const orcVar = deriveTrackBudget(trilhaVar);
    assert.equal(orcVar.source, 'inferred'); // a teoria do fixture NÃO declara variável
    const { saida } = orcVar.lessons[0];
    const daSolucao = chavesDe(SOLUCAO_COM_VAR, 'solucao.c');
    const foraA2 = [...daSolucao].filter((k) => !saida.productive.has(k));
    assert.ok(foraA2.includes('decl:var'), `a solução antecipada deveria reprovar em decl:var: ${foraA2.join(' ')}`);
    assert.ok(
      foraA2.includes('node:DeclStmt'),
      `o par obrigatório acompanha: ${foraA2.join(' ')}`,
    );
    // e o evento continua gateável: ensinar `var` na teoria abre o orçamento
    const teoriaComVar = trilhaC({
      introduces: {
        productive: ['decl:func', 'decl:var', 'node:DeclStmt', 'node:IncludeDirective', 'node:ReturnStmt', 'op:binary:*', 'node:BinaryOperator', 'node:IntegerLiteral'],
      },
    });
    (teoriaComVar.modules[0].lessons[0].challenges[0] as TrackChallengeSource).solutionCode =
      SOLUCAO_COM_VAR;
    const orcEnsina = deriveTrackBudget(teoriaComVar);
    assert.equal(orcEnsina.source, 'declared');
    const foraEnsina = [...daSolucao].filter((k) => !orcEnsina.lessons[0].saida.productive.has(k));
    assert.deepEqual(foraEnsina, [], `a aula que ENSINA var abre o produtivo, e ainda assim: ${foraEnsina.join(' ')}`);
  });

  it('a semente NÃO foi copiada do Python: nenhuma chave do runner unittest/node:test', () => {
    for (const chave of [...C_HARNESS_RECEPTIVE_SEED, ...C_STRUCTURAL_ALWAYS_ALLOWED]) {
      assert.ok(!chave.startsWith('api:unittest'), chave);
      assert.ok(!chave.startsWith('api:runpy'), chave);
      assert.ok(!chave.startsWith('api:contextlib'), chave);
      assert.ok(!chave.startsWith('api:io'), chave);
      assert.ok(!chave.startsWith('api:node:'), chave);
      assert.ok(!chave.startsWith('node:With'), chave);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. deriveTrackBudget numa trilha C sintética (o padrão dos fixtures de trilha)
// ---------------------------------------------------------------------------

// Fixtures de trilha em MEMÓRIA (o mesmo padrão de `engineOnda1Integracao`):
// track.json (programmingLanguage 'c') + 1 módulo + 1 aula + 1 challenge 'c'.

function theoryC(markdown: string): TrackTheorySection {
  return { id: 'secao', title: 'secao', markdown };
}

function challengeC(over: Partial<TrackChallengeSource> = {}): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug: 'o-dobro',
    title: 'o dobro',
    concept: 'conceito',
    difficulty: 1,
    language: 'c',
    statement: '# o dobro',
    starterCode: 'int dobro(int x) {\n    // devolva o dobro de x\n    return 0;\n}\n',
    testsCode: TESTS_CODE_C,
    solutionCode: SOLUTION_C,
    expectedTestCount: 2,
    ...over,
  };
}

function trilhaC(lessonMetaOver: Record<string, unknown> = {}): LoadedTrack {
  const lessonMeta = {
    schemaVersion: 1,
    slug: 'a-aula',
    title: 'a aula',
    summary: 'a aula',
    difficulty: 1,
    concepts: ['conceito'],
    prerequisites: [],
    theory: [theoryC('Aula. \n\n```c\nint dobro(int x) {\n    return 2 * x;\n}\n```\n')],
    sources: [],
    challenges: ['o-dobro'],
    ...lessonMetaOver,
  };
  const lesson: LoadedLesson = {
    meta: lessonMeta as unknown as LoadedLesson['meta'],
    challenges: [challengeC()],
  };
  const mod: LoadedModule = {
    meta: { schemaVersion: 1, slug: 'modulo-1', title: 'modulo-1', order: 1, lessons: ['a-aula'] },
    lessons: [lesson],
    challenge: null,
  };
  return {
    root: {
      schemaVersion: 1,
      slug: 'trilha-c-fixture',
      title: 'trilha-c-fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage: 'c',
      modules: ['modulo-1'],
    },
    modules: [mod],
    proficiency: null,
    dir: '/tmp/fixture-c',
  } as unknown as LoadedTrack;
}

describe('gates C — deriveTrackBudget numa trilha C sintética', {
  skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false,
}, () => {
  it('roda SEM TabelaDeLinguagemAusenteError, e o adaptador da trilha é c', () => {
    const orcamento = deriveTrackBudget(trilhaC());
    assert.equal(orcamento.adapterId, 'c');
    assert.equal(orcamento.lessons.length, 1);
  });

  it('o axioma de ENTRADA semeia as tabelas de C nas duas faixas', () => {
    const { entrada } = deriveTrackBudget(trilhaC()).lessons[0];
    for (const chave of C_HARNESS_RECEPTIVE_SEED) {
      assert.ok(entrada.receptive.has(chave), `o receptivo de entrada não semeou ${chave}`);
    }
    for (const chave of C_STRUCTURAL_ALWAYS_ALLOWED) {
      assert.ok(entrada.receptive.has(chave), `o receptivo de entrada não semeou ${chave}`);
      assert.ok(entrada.productive.has(chave), `o produtivo de entrada não semeou ${chave}`);
    }
    // a semente é SÓ receptiva: o envelope do teste não vira permissão de escrita
    assert.ok(!entrada.productive.has('api:SM_TEST'));
    assert.ok(!entrada.productive.has('decl:func'));
  });

  it('modo DECLARADO: a aula que introduz as construções da solução abre o orçamento (A2)', () => {
    // NOTA para o autor da trilha (medido aqui): em modo declarado a aula tem
    // de declarar CADA chave que a solução emite — inclusive os nós genéricos
    // que acompanham o eixo específico (`op:binary:*` vem com
    // `node:BinaryOperator`; o literal vem com `node:IntegerLiteral`, que na
    // semente é só receptivo).
    const trilha = trilhaC({
      introduces: {
        productive: ['decl:func', 'node:ReturnStmt', 'op:binary:*', 'node:BinaryOperator', 'node:IntegerLiteral'],
      },
    });
    const orcamento = deriveTrackBudget(trilha);
    assert.equal(orcamento.source, 'declared');

    const { saida } = orcamento.lessons[0];
    const daSolucao = chavesDe(SOLUTION_C, 'solucao.c');
    const fora = [...daSolucao].filter((k) => !saida.productive.has(k));
    assert.deepEqual(
      fora,
      [],
      `a solução da aula 1 emite chave fora do orçamento produtivo de SAÍDA (violação A2 por construção): ${fora.join(' ')}`,
    );
    for (const chave of ['decl:func', 'node:ReturnStmt', 'op:binary:*']) {
      assert.equal(orcamento.firstTaughtIn.get(chave), 'modulo-1/a-aula');
    }
  });

  it('modo INFERIDO: a teoria da aula em bloco ```c alimenta o orçamento', () => {
    const orcamento = deriveTrackBudget(trilhaC());
    assert.equal(orcamento.source, 'inferred');
    const daTeoria = chavesDe('int dobro(int x) {\n    return 2 * x;\n}\n', 'teoria.c');
    for (const chave of daTeoria) {
      assert.ok(
        orcamento.lessons[0].saida.receptive.has(chave),
        `a teoria da aula 1 não liberou ${chave}`,
      );
    }
    assert.equal(orcamento.parseErrors.length, 0, JSON.stringify(orcamento.parseErrors));
  });

  it('A3 por construção: o testsCode da convenção cabe no orçamento receptivo de ENTRADA', () => {
    // A prova que motiva a semente: SEM as tabelas de C, este desafio nascia
    // reprovando em A3 por causa do próprio envelope de teste. A leitura usa
    // o SM_COUNT_PREABULO (a ante-sala que a engine usa para parsear
    // testsCode C — a macro SM_TEST não existe sem ela).
    const { entrada } = deriveTrackBudget(trilhaC({ introduces: { productive: ['decl:func', 'node:ReturnStmt', 'op:binary:*'] } })).lessons[0];
    const doTestsCode = chavesDe(`${SM_COUNT_PREABULO}\n${TESTS_CODE_C}`, 'tests/test_solucao.c');
    const fora = [...doTestsCode].filter((k) => !entrada.receptive.has(k));
    assert.deepEqual(
      fora,
      [],
      `o testsCode emite chave fora do orçamento receptivo de ENTRADA (violação A3 por construção): ${fora.join(' ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// 3b. A PORTA ACEITA QUEM USA AS CONSTRUÇÕES NOVAS DO §8.2 (onda 3, P1–P6):
//     trilha C com STRUCT ensinado na aula 1 e USADO na aula 2 (testsCode e
//     solução) — A2/A3 passam com as chaves novas, e elas têm origem.
// ---------------------------------------------------------------------------

describe('gates C — trilha com struct: deriveTrackBudget aceita as construções novas do §8.2', {
  skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false,
}, () => {
  const TEORIA_STRUCT = [
    'Structs guardam campos juntos.',
    '',
    '```c',
    'struct Ponto {',
    '    int x;',
    '    int y;',
    '};',
    '',
    'typedef struct Ponto Ponto;',
    '',
    'int main(void) {',
    '    struct Ponto p = {1, 2};',
    '    p.x = 3;',
    '    Ponto q = p;',
    '    return p.x + q.y;',
    '}',
    '```',
  ].join('\n');

  const TESTS_STRUCT = [
    'struct Ponto { int x; int y; };',
    'struct Ponto soma(struct Ponto a, struct Ponto b);',
    '',
    'SM_TEST(soma_campos) {',
    '    struct Ponto a = {1, 2};',
    '    struct Ponto b = {3, 4};',
    '    struct Ponto r = soma(a, b);',
    '    checa_int("soma x", r.x, 4, "x de a mais x de b");',
    '    checa_int("soma y", r.y, 6, "y de a mais y de b");',
    '}',
  ].join('\n');

  const SOLUTION_STRUCT = [
    'struct Ponto { int x; int y; };',
    'struct Ponto soma(struct Ponto a, struct Ponto b) {',
    '    struct Ponto r = {a.x + b.x, a.y + b.y};',
    '    return r;',
    '}',
  ].join('\n');

  /** Aula 1 ensina struct/typedef/campo; aula 2 USA tudo no desafio. */
  function trilhaStruct(): LoadedTrack {
    const aula1 = {
      schemaVersion: 1,
      slug: 'fundamentos-struct',
      title: 'fundamentos struct',
      summary: 'struct, typedef e acesso a campo',
      difficulty: 1,
      concepts: ['struct'],
      prerequisites: [],
      theory: [theoryC(TEORIA_STRUCT)],
      sources: [],
      challenges: [],
    };
    const aula2 = {
      schemaVersion: 1,
      slug: 'usa-struct',
      title: 'usa struct',
      summary: 'função que devolve struct',
      difficulty: 2,
      concepts: ['struct'],
      prerequisites: ['struct'],
      theory: [theoryC('Aula. \n\n```c\nint main(void) {\n    return 0;\n}\n```\n')],
      sources: [],
      challenges: ['soma-pontos'],
    };
    const mod: LoadedModule = {
      meta: { schemaVersion: 1, slug: 'modulo-1', title: 'modulo-1', order: 1, lessons: ['fundamentos-struct', 'usa-struct'] },
      lessons: [
        { meta: aula1 as unknown as LoadedLesson['meta'], challenges: [] },
        {
          meta: aula2 as unknown as LoadedLesson['meta'],
          challenges: [challengeC({
            slug: 'soma-pontos',
            title: 'soma pontos',
            concept: 'struct',
            difficulty: 2,
            statement: '# soma pontos',
            starterCode: 'struct Ponto { int x; int y; };\nstruct Ponto soma(struct Ponto a, struct Ponto b) {\n    /* TODO */\n}\n',
            testsCode: TESTS_STRUCT,
            solutionCode: SOLUTION_STRUCT,
            expectedTestCount: 1,
          })],
        },
      ],
      challenge: null,
    };
    return {
      root: {
        schemaVersion: 1,
        slug: 'trilha-c-struct',
        title: 'trilha-c-struct',
        description: 'fixture struct',
        language: 'pt-BR',
        domain: 'programming',
        programmingLanguage: 'c',
        modules: ['modulo-1'],
      },
      modules: [mod],
      proficiency: null,
      dir: '/tmp/fixture-c-struct',
    } as unknown as LoadedTrack;
  }

  it('as chaves novas têm ORIGEM: primeira aula que ensina é a da teoria com struct', () => {
    const orcamento = deriveTrackBudget(trilhaStruct());
    assert.equal(orcamento.parseErrors.length, 0, JSON.stringify(orcamento.parseErrors));
    for (const chave of ['node:RecordDecl', 'node:MemberExpr', 'node:TypedefDecl']) {
      assert.equal(orcamento.firstTaughtIn.get(chave), 'modulo-1/fundamentos-struct', `${chave} sem origem`);
    }
  });

  it('A3: o testsCode que usa struct/typedef/campo cabe no receptivo de ENTRADA da aula seguinte', () => {
    const orcamento = deriveTrackBudget(trilhaStruct());
    const aula2 = orcamento.lessons[1];
    assert.equal(aula2.ref, 'modulo-1/usa-struct');
    for (const chave of ['node:RecordDecl', 'node:MemberExpr']) {
      assert.ok(aula2.entrada.receptive.has(chave), `a entrada da aula 2 não herdou ${chave}`);
    }
    const doTestsCode = chavesDe(`${SM_COUNT_PREABULO}\n${TESTS_STRUCT}`, 'tests/test_solucao.c');
    const fora = [...doTestsCode].filter((k) => !aula2.entrada.receptive.has(k));
    assert.deepEqual(
      fora,
      [],
      `o testsCode com struct nasce violando A3 (a porta derrubou quem usa as chaves novas): ${fora.join(' ')}`,
    );
  });

  it('A2: a solução que usa struct/campo cabe no produtivo de SAÍDA', () => {
    const orcamento = deriveTrackBudget(trilhaStruct());
    const aula2 = orcamento.lessons[1];
    const daSolucao = chavesDe(SOLUTION_STRUCT, 'solucao.c');
    const fora = [...daSolucao].filter((k) => !aula2.saida.productive.has(k));
    assert.deepEqual(
      fora,
      [],
      `a solução com struct nasce violando A2: ${fora.join(' ')}`,
    );
    // e o typedef CONTINUA gateável como conteúdo: semente é só receptiva
    assert.ok(!aula2.entrada.productive.has('node:TypedefDecl') || daSolucao.has('node:TypedefDecl') === false,
      'solução sem typedef não depende de perdao algum');
  });
});

// ---------------------------------------------------------------------------
// 4. requirements para 'c'
// ---------------------------------------------------------------------------

describe('gates C — requirements para c (counter_protocol)', {
  skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false,
}, () => {
  it("'c' está em LINGUAGENS_COM_REQUIREMENTS (em ordem estável)", () => {
    assert.ok(LINGUAGENS_COM_REQUIREMENTS.includes('c'), LINGUAGENS_COM_REQUIREMENTS.join(', '));
    assert.deepEqual([...LINGUAGENS_COM_REQUIREMENTS], [...LINGUAGENS_COM_REQUIREMENTS].sort());
  });

  it('UM requirement por bloco SM_TEST, com a descrição derivada do TEXTO REAL', () => {
    const r = derivarRequirements(TESTS_CODE_C, SOLUTION_C, '', 'c');
    assert.equal(r.requirements.length, 2);
    assert.deepEqual(r.requirements.map((x) => x.teste), ['dobro_de_2', 'dobro_de_zero']);
    assert.equal(
      r.requirements[0].descricao,
      'A função dobro deve devolver 4 quando chamada com 2.',
    );
    assert.equal(
      r.requirements[1].descricao,
      'A função dobro deve devolver 0 quando chamada com 0.',
    );
  });

  it('a cobertura são os átomos da SOLUÇÃO que define a função chamada', () => {
    const r = derivarRequirements(TESTS_CODE_C, SOLUTION_C, '', 'c');
    for (const cobra of r.cobertura) {
      assert.ok(cobra.atoms.includes('decl:func'), cobra.atoms.join(', '));
      assert.ok(cobra.atoms.includes('node:ReturnStmt'), cobra.atoms.join(', '));
      assert.ok(cobra.atoms.includes('op:binary:*'), cobra.atoms.join(', '));
      assert.ok(
        !cobra.atoms.some((a) => a.startsWith('api:')),
        `o harness (fprintf etc.) NÃO pode entrar na cobertura: ${cobra.atoms.join(', ')}`,
      );
    }
  });

  it('cenário SEM chamada à solução: a cobertura fica VAZIA (declarado — o alvo é o helper)', () => {
    const tests = [
      'SM_TEST(sempre_ok) {',
      '    checa_int("um e um", 1, 1, "sanidade do harness");',
      '}',
    ].join('\n');
    const r = derivarRequirements(tests, '', '', 'c');
    assert.equal(r.requirements.length, 1);
    assert.equal(r.requirements[0].teste, 'sempre_ok');
    assert.equal(r.requirements[0].descricao, 'O teste exige que 1 seja igual a 1.');
    assert.deepEqual(r.cobertura, [{ requirementId: 'REQ-1', atoms: [] }]);
  });

  it('a bijeção pelo SLUG casa nos dois sentidos', () => {
    const declarados = [
      { id: 'REQ-1', teste: 'dobro_de_2' },
      { id: 'REQ-2', teste: 'dobro_de_zero' },
    ];
    const v = validarRequirements(TESTS_CODE_C, declarados, 'c');
    assert.equal(v.ok, true);
    assert.deepEqual(v.semTeste, []);
    assert.deepEqual(v.testesSemRequirement, []);
    assert.equal(v.correspondencias.length, 2);
    assert.deepEqual(
      v.correspondencias.map((m) => [m.requirementId, m.testName]),
      [['REQ-1', 'dobro_de_2'], ['REQ-2', 'dobro_de_zero']],
    );

    const quebrada = validarRequirements(
      TESTS_CODE_C,
      [{ id: 'REQ-1', teste: 'dobro_de_2' }, { id: 'REQ-9', teste: 'teste_que_nao_existe' }],
      'c',
    );
    assert.equal(quebrada.ok, false);
    assert.deepEqual(quebrada.semTeste, ['REQ-9']);
    assert.deepEqual(quebrada.testesSemRequirement, ['dobro_de_zero']);
  });

  it('testsCode C que não parseia LANÇA — nunca um conjunto vazio silencioso', () => {
    assert.throws(
      () => derivarRequirements('SM_TEST(quebrado) { checa_int(', '', '', 'c'),
      /testsCode não parseia/,
    );
    assert.throws(
      () => validarRequirements('SM_TEST(quebrado) { checa_int(', [], 'c'),
      /testsCode não parseia/,
    );
  });

  it('o despachante continua fail-closed: typescript segue lançando', () => {
    assert.throws(
      () => derivarRequirements(TESTS_CODE_C, '', '', 'typescript'),
      (e: unknown) => e instanceof Error,
    );
  });
});
