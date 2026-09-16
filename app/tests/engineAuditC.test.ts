/**
 * tests/engineAuditC.test.ts — O GATE DE AUDIT PARA C (onda 3 da trilha C):
 * o parse do testsCode com a ANTE-SALA, no PONTO ÚNICO, e a mensagem A2 por
 * linguagem.
 *
 * O DEFEITO (reproduzido pela revisão): `auditTrack` parseava o testsCode de C
 * VERBATIM (`extract.ts` → `adapter.parse(code)`), e o testsCode da convenção
 * counter_protocol (03-tdd §3.9.3 — blocos `SM_TEST(slug){ checa_*(…) }`) não
 * parseia standalone: a macro `SM_TEST` só é declarada pelo harness gerado. O
 * clang reprovava o TU inteiro ("parameter 'dobro_de_2' was not declared",
 * 3:9) e o gate acusava, em TODO desafio C correto, a violação A2 ENGANOSA
 * "`testsCode` não parseia como JavaScript" — mentindo DUAS vezes: no parse
 * (o fonte está íntegro para o referencial dele) e na linguagem (clang ≠
 * JavaScript). A onda 2 já abriu as portas de orçamento (a semente receptiva
 * de `atomKeys.ts` e o prepend de `quality/requirements.ts:791`) — o que
 * faltava era o audit.
 *
 * O CONSERTO é centralizado (PROIBIDO patch por call-site): o call-site que
 * sabe o que está passando declara `surface: 'testsCode'` ao extrator, e a
 * ante-sala vive em `extract.ts` (`anteSalaDoTestsCode`) — por onde
 * `extractAtoms` e `extractAllOccurrences` passam os dois. Com
 * (testsCode, 'c'), o fonte analisado é `SM_COUNT_PREABULO + '\n' + code` (a
 * MESMA ante-sala de `cCountDeclared`, importada de `lang/c.ts`), as posições
 * voltam ao referencial do testsCode e as ocorrências da própria ante-sala
 * são descartadas (o protótipo `sm_registrar` do preâmbulo não pode sombrear
 * o protótipo do autor — o dedup-para-a-primeira do extrator faria a
 * violação citar linha negativa).
 *
 * O que se prova aqui:
 *   1. auditTrack numa trilha C sintética HONESTA → ZERO violações (e ZERO
 *      A2 de parse) — o probe da revisão, agora verde;
 *   2. o A3 RODA sobre o testsCode normalizado: `decl:var`/`node:DeclStmt` no
 *      test do autor são acusados com linha/coluna DO AUTOR — o consumidor de
 *      `entrada.receptive` (a semente receptiva de C) em enforcement;
 *   3. a mensagem A2 por linguagem: testsCode de fato quebrado → o DETALHE do
 *      clang, verbatim ("clang reprovou o fonte (1:31): …"), SEM o duplo
 *      "clang reprovou" que a versão anterior prefixava (dedupe da revisão —
 *      o prefixo canônico já vem no detalhe; falha de tooling não inventa
 *      "clang reprovou") e sem "JavaScript" nenhum, com a posição da mensagem
 *      coerente com a da violação (rebase);
 *   4. o extrator no referencial do AUTOR: chaves, linhas e offsets; verbatim
 *      continua reproando (o contrato do adaptador não mudou — a superfície é
 *      que declara a ante-sala);
 *   5. SEM regressão em javascript: sem a superfície de C, a extração é byte a
 *      byte a de antes, e a mensagem A2 do JavaScript continua exatamente
 *      "`testsCode` não parseia como JavaScript: …"; python/typescript
 *      PINADOS com o rótulo CORRETO ("como Python"/"como TypeScript") — a
 *      base antiga cravava "JavaScript" para toda linguagem não-C, e o
 *      audit.ts declara essa troca como mudança intencional de diagnóstico;
 *   6. o CATÁLOGO dos call-sites: um passeio pelos fontes da engine coleta
 *      TODO call-site de extração que passa `language` e trava que os que
 *      alimentam testsCode passam `surface` — nenhum sem a normalização.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { auditTrack } from '../electron/main/engine/audit';
import { extractAllOccurrences, extractAtoms, type ExtractSurface } from '../electron/main/engine/extract';
import { cDetect } from '../electron/main/engine/lang/c';
import { pythonAdapter } from '../electron/main/engine/lang/python';
import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import type { AtomKey } from '../electron/main/engine/atomKeys';

/** A máquina tem a toolchain de C COMPLETA? (compilador + clang + python3) */
const TEM_C = cDetect().ok;
const TEM_PYTHON = pythonAdapter.detect().version !== null;

// ---------------------------------------------------------------------------
// Fixtures — a MESMA trilha C sintética de `engineGatesC.test.ts`, agora com
// o introduces DERIVADO do conteúdo (o padrão de `engineAuditLimitacoes`).
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
const STARTER_C = 'int dobro(int x) {\n    // devolva o dobro de x\n    return 0;\n}\n';
const TEORIA_C = SOLUTION_C;

/**
 * O `introduces` DECLARADO da aula, derivado do que starter/teoria/solução
 * REALMENTE exigem (extração de verdade, nunca lista à mão).
 *
 * O testsCode NÃO entra na derivação — de propósito. O envelope do teste
 * (`api:SM_TEST`, os helpers `checa_*`) é a SEMENTE RECEPTIVA de C
 * (`C_HARNESS_RECEPTIVE_SEED`), que semeia só a faixa de ENTRADA: o aluno lê
 * o teste, não o escreve. Derivar introduces do testsCode tornaria o envelope
 * PERMISSÃO DE ESCRITA — a mentira exata que a semente existe para evitar.
 */
function introducesDeC(codigos: string[]): { productive: AtomKey[]; receptive: AtomKey[] } {
  const chaves = new Set<AtomKey>();
  for (const c of codigos) {
    const r = extractAtoms(c, { language: 'c', fileName: 'solucao.c' });
    assert.ok(r.ok, `fixture C deve parsear: ${r.ok ? '' : r.error.message}`);
    if (r.ok) for (const k of r.keys) chaves.add(k);
  }
  const lista = [...chaves].sort();
  return { productive: lista, receptive: lista };
}

const INTRODUCES_C = introducesDeC([TEORIA_C, STARTER_C, SOLUTION_C]);

function theoryC(markdown: string): TrackTheorySection {
  return { id: 'secao', title: 'secao', markdown };
}

/** A trilha C sintética; `testsCode` é o campo que as seções abaixo mutam. */
function trilhaC(testsCode: string = TESTS_CODE_C): LoadedTrack {
  const desafio: TrackChallengeSource = {
    schemaVersion: 1,
    slug: 'o-dobro',
    title: 'o dobro',
    concept: 'conceito',
    difficulty: 1,
    language: 'c',
    statement: '# o dobro',
    starterCode: STARTER_C,
    testsCode,
    solutionCode: SOLUTION_C,
    expectedTestCount: 2,
  };
  const lessonMeta = {
    schemaVersion: 1,
    slug: 'a-aula',
    title: 'a aula',
    summary: 'a aula',
    difficulty: 1,
    concepts: ['conceito'],
    prerequisites: [],
    theory: [theoryC(`Aula.\n\n\`\`\`c\n${TEORIA_C}\n\`\`\`\n`)],
    sources: [],
    challenges: ['o-dobro'],
    introduces: INTRODUCES_C,
  };
  const lesson: LoadedLesson = { meta: lessonMeta as unknown as LoadedLesson['meta'], challenges: [desafio] };
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

/** As violações de UM desafio, em forma comparável (a auditoria roda declared). */
function violacoesDe(testsCode: string): Array<{
  regra: string;
  campo: string;
  linha: number;
  coluna: number;
  construcao: string | null;
  mensagem: string;
}> {
  return auditTrack(trilhaC(testsCode), { mode: 'declared' }).violations.map((v) => ({
    regra: v.regra,
    campo: v.campo,
    linha: v.linha,
    coluna: v.coluna,
    construcao: v.construcao,
    mensagem: v.mensagem,
  }));
}

// ---------------------------------------------------------------------------
// 1. O PROBE DA REVISÃO, AGORA VERDE — trilha C honesta, ZERO violações
// ---------------------------------------------------------------------------

describe('audit C — a trilha honesta não tem violação de parse (o probe da revisão)', {
  skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false,
}, () => {
  it('auditTrack numa trilha C honesta → ZERO violações, ZERO A2', () => {
    const rep = auditTrack(trilhaC(), { mode: 'declared' });
    assert.equal(rep.trackSlug, 'trilha-c-fixture');
    // o placar inteiro: nenhum A1/A2/A3/A4/A6/DEC/estutural sobrou — o desafio
    // honesto da convenção counter_protocol passa do gate INTEIRO.
    assert.deepEqual(
      rep.violations.map((v) => `${v.regra}@${v.campo}`),
      [],
      `violações inesperadas: ${JSON.stringify(rep.violations.map((v) => [v.regra, v.campo, v.linha, v.mensagem]))}`,
    );
    assert.equal(rep.totals.violacoes, 0);
    assert.equal(rep.totals.desafiosComViolacao, 0);
    // o orçamento em modo declarado não acumula erro de parse de teoria
    assert.deepEqual(rep.parseErrors, []);
  });

  it('a violação A2 ENGANOSA que motivou a onda era REAL antes — o verbatim reprova', () => {
    // O probe da revisão, fixado no nível do ADAPTADOR: sem a declaração de
    // superfície, o testsCode da convenção NÃO parseia (a macro SM_TEST não é
    // declarada). É por isso que a superfície existe — e é por isso que os
    // call-sites de testsCode PRECISAM dela (§6).
    const cru = extractAtoms(TESTS_CODE_C, { fileName: 'challenge.json#testsCode', language: 'c' });
    assert.equal(cru.ok, false);
    if (cru.ok) return;
    assert.equal(cru.error.code, 'PARSE_ERROR');
    assert.match(cru.error.message, /clang reprovou o fonte/);
  });

  it('o A3 continua valendo: chave FORA da semente receptiva de C é violação', () => {
    // o "nada FALTA" do gatesC em modo gate: o testsCode sem `decl:var` na
    // semente é cobrado quando o autor o usa (declaração DENTRO do bloco de
    // teste — no escopo de arquivo clang não emite DeclStmt).
    const tests = [
      'int dobro(int x);',
      '',
      'SM_TEST(soma) {',
      '    int y = 5;',
      '    checa_int("soma", dobro(y), 5, "soma");',
      '}',
    ].join('\n');
    const rep = auditTrack(trilhaC(tests), { mode: 'declared' });
    const doTests = rep.violations.filter((v) => v.campo === 'testsCode');
    // nenhuma violação de PARSE — o A3 roda sobre o fonte NORMALIZADO
    assert.deepEqual(
      doTests.filter((v) => v.regra === 'A2'),
      [],
      `o testsCode válido não pode reprovar em parse: ${JSON.stringify(doTests)}`,
    );
    assert.deepEqual(
      doTests.map((v) => [v.regra, v.construcao, v.linha, v.coluna]),
      [
        ['A3', 'decl:var', 4, 5],
        ['A3', 'node:DeclStmt', 4, 5],
      ],
      `A3 em enforcement: a linha 4 é a linha DO AUTOR (int y = 5;), não a do fonte combinado`,
    );
    assert.equal(rep.totals.violacoes, 2);
  });
});

// ---------------------------------------------------------------------------
// 2. A MENSAGEM A2 POR LINGUAGEM — o testsCode de fato quebrado
// ---------------------------------------------------------------------------

describe('audit C — a mensagem A2 fala a linguagem certa (clang, não JavaScript)', {
  skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false,
}, () => {
  it('testsCode quebrado: UMA violação A2, mensagem do clang, SEM JavaScript, SEM prefixo duplo', () => {
    const vs = violacoesDe('SM_TEST(quebrado) { checa_int(');
    assert.equal(vs.length, 1, JSON.stringify(vs));
    const v = vs[0];
    assert.equal(v.regra, 'A2');
    assert.equal(v.campo, 'testsCode');
    // a posição da violação é a do TESTSCODE (linha 1) — não a do fonte
    // combinado (linha 12, depois do preâmbulo de 11 linhas)
    assert.equal(v.linha, 1);
    assert.equal(v.coluna, 31);
    // DEDUPE (revisão da onda 3): a mensagem A2 é o próprio DETALHE do
    // adaptador, byte a byte. O detalhe já abre com o prefixo canônico
    // "clang reprovou o fonte (1:31): " — a versão anterior o prefixava de
    // novo ("clang reprovou o `testsCode` da trilha C: clang reprovou o
    // fonte…"), duplicando o diagnóstico; e numa falha de TOOLING ("extrator
    // C ausente", "clang ausente", timeout) o mesmo prefixo mentia sobre quem
    // falhou — agora o texto é a causa real, sem "clang reprovou" inventado.
    const cru = extractAtoms('SM_TEST(quebrado) { checa_int(', { language: 'c', surface: 'testsCode' });
    assert.equal(cru.ok, false);
    if (cru.ok) return;
    assert.equal(v.mensagem, cru.error.message);
    assert.match(v.mensagem, /^clang reprovou o fonte \(1:31\): /);
    assert.ok(!v.mensagem.includes('JavaScript'), `a mensagem não pode citar JavaScript: ${v.mensagem}`);
    // coerência interna: a posição DA FRASE é a mesma DA VIOLAÇÃO
    assert.ok(
      !v.mensagem.includes('(12:'),
      `a mensagem não pode citar o referencial do fonte combinado: ${v.mensagem}`,
    );
    // dedupe medido: UMA ocorrência do prefixo, não duas
    assert.equal(
      (v.mensagem.match(/clang reprovou/g) ?? []).length,
      1,
      `prefixo "clang reprovou" duplicado: ${v.mensagem}`,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. O EXTRATOR NO REFERENCIAL DO AUTOR (a normalização, unidade)
// ---------------------------------------------------------------------------

describe('audit C — extractAtoms com surface testsCode analisa a ante-sala e reporta o AUTOR', {
  skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false,
}, () => {
  /** As chaves que o testsCode da convenção EMITE (medido — nada à mão). */
  const CHAVES_DO_AUTOR = [
    'api:SM_TEST',
    'decl:func',
    'node:CallExpr',
    'node:CompoundStmt',
    'node:DeclRefExpr',
    'node:FunctionDecl',
    'node:IntegerLiteral',
    'node:ParmVarDecl',
    'node:StringLiteral',
  ];

  it('parseia com a ante-sala e devolve as chaves DO AUTOR, com posições ≥ 1', () => {
    const r = extractAtoms(TESTS_CODE_C, { fileName: 'challenge.json#testsCode', language: 'c', surface: 'testsCode' });
    assert.ok(r.ok, `deve parsear com a ante-sala: ${r.ok ? '' : r.error.message}`);
    if (!r.ok) return;
    assert.deepEqual(r.keys, CHAVES_DO_AUTOR);
    for (const o of r.occurrences) {
      assert.ok(o.line >= 1, `linha rebasada não pode ser ≤ 0: ${o.key} L${o.line}`);
      assert.ok(o.start >= 0, `offset rebasado não pode ser negativo: ${o.key} start=${o.start}`);
    }
    // O PROVA DO DESCARTE DA ANTE-SALA: sem ela, o protótipo sm_registrar do
    // preâmbulo (linha 2 do fonte combinado) viraria a PRIMEIRA ocorrência de
    // decl:func/node:FunctionDecl e sombrearia o protótipo DO AUTOR
    // (`int dobro(int x);` — linha 1 do testsCode, coluna 1).
    const declFunc = r.occurrences.find((o) => o.key === 'decl:func');
    assert.ok(declFunc !== undefined);
    assert.deepEqual([declFunc.line, declFunc.column, declFunc.start], [1, 1, 0]);
    // e o envelope do teste fica onde o AUTOR escreveu (SM_TEST da linha 3)
    const envelope = r.occurrences.find((o) => o.key === 'api:SM_TEST');
    assert.ok(envelope !== undefined);
    assert.deepEqual([envelope.line, envelope.column], [3, 1]);
  });

  it('extractAllOccurrences rebaseia TODAS as ocorrências (o funil da A13c)', () => {
    const r = extractAllOccurrences(TESTS_CODE_C, { fileName: 'challenge.json#testsCode', language: 'c', surface: 'testsCode' });
    assert.ok(r.ok);
    if (!r.ok) return;
    const envelopes = r.occurrences.filter((o) => o.key === 'api:SM_TEST');
    assert.deepEqual(
      envelopes.map((o) => [o.line, o.column]),
      [
        [3, 1],
        [7, 1],
      ],
      'os DOIS blocos SM_TEST ficam nas linhas do AUTOR (3 e 7)',
    );
  });

  it('a macro `#include` sintetizada (linha a linha do FONTE) rebaseia junto', () => {
    const tests = '#include <stdio.h>\n\nSM_TEST(t) { checa_int("a", dobro(1), 1, "b"); }';
    const r = extractAtoms(tests, { language: 'c', surface: 'testsCode' });
    assert.ok(r.ok);
    if (!r.ok) return;
    const include = r.occurrences.find((o) => o.key === 'node:IncludeDirective');
    assert.ok(include !== undefined, 'o include do autor deve aparecer');
    assert.deepEqual([include.line, include.column, include.start], [1, 1, 0]);
  });

  it('testsCode quebrado: o erro volta no referencial do autor, frase e campos juntos', () => {
    const r = extractAtoms('SM_TEST(quebrado) { checa_int(', { language: 'c', surface: 'testsCode' });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.equal(r.error.line, 1, 'linha 1 DO TESTSCODE (não 12 do combinado)');
    assert.match(r.error.message, /^clang reprovou o fonte \(1:\d+\): /);
  });

  it('o corte da ante-sala é por offset: literal do autor na linha 1 não vira preâmbulo', () => {
    // um testsCode que COMEÇA com conteúdo do autor (sem include): a posição
    // da primeira linha é 0 e a emissão é a do AUTOR — o offset 0 pertence ao
    // preâmbulo só no fonte combinado, que o call-site nunca vê.
    const tests = 'SM_TEST(zero) { checa_int("n", dobro(0), 0, "n"); }';
    const r = extractAtoms(tests, { language: 'c', surface: 'testsCode' });
    assert.ok(r.ok);
    if (!r.ok) return;
    const envelope = r.occurrences.find((o) => o.key === 'api:SM_TEST');
    assert.ok(envelope !== undefined);
    assert.equal(envelope.line, 1);
  });
});

// ---------------------------------------------------------------------------
// 4. SEM REGRESSÃO — javascript/python/typescript são VERBATIM como sempre
// ---------------------------------------------------------------------------

const TESTS_JS = [
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { dobro } from './solution.mjs';",
  '',
  "test('dobro de 2', () => {",
  '  assert.equal(dobro(2), 4);',
  '});',
  '',
].join('\n');

const TESTS_PY = ['def test_dobro():', '    assert dobro(2) == 4', ''].join('\n');

const TESTS_TS = [
  'const x: number = 1;',
  'export function f(a: string): string { return a; }',
  '',
].join('\n');

/**
 * A MESMA trilha do teste JS byte-idêntico, parametrizada por linguagem: uma
 * aula honesta com UM desafio cujo ÚNICO defeito é o testsCode quebrado.
 * Serve para fixar o RÓTULO da mensagem A2 por linguagem — o rótulo vem do
 * adapterId da trilha, e a base antiga cravava "JavaScript" para toda
 * linguagem não-C (o mesmo defeito que motivou a onda, agora em
 * python/typescript).
 */
function trilhaComTesteQuebrado(
  linguagem: 'javascript' | 'typescript' | 'python',
  starterCode: string,
  solutionCode: string,
  teoriaMarkdown: string,
  testsQuebrado: string,
): LoadedTrack {
  const desafio: TrackChallengeSource = {
    schemaVersion: 1,
    slug: 'dobrar',
    title: 'dobrar',
    concept: 'conceito',
    difficulty: 1,
    language: linguagem,
    statement: '# dobrar',
    starterCode,
    testsCode: testsQuebrado,
    solutionCode,
    expectedTestCount: 1,
  };
  const lessonMeta = {
    schemaVersion: 1,
    slug: 'a-aula',
    title: 'a aula',
    summary: 'a aula',
    difficulty: 1,
    concepts: ['conceito'],
    prerequisites: [],
    theory: [theoryC(teoriaMarkdown)],
    sources: [],
    challenges: ['dobrar'],
  };
  const lesson: LoadedLesson = { meta: lessonMeta as unknown as LoadedLesson['meta'], challenges: [desafio] };
  const mod: LoadedModule = {
    meta: { schemaVersion: 1, slug: 'modulo-1', title: 'modulo-1', order: 1, lessons: ['a-aula'] },
    lessons: [lesson],
    challenge: null,
  };
  return {
    root: {
      schemaVersion: 1,
      slug: `trilha-${linguagem}-fixture`,
      title: `trilha-${linguagem}-fixture`,
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage: linguagem,
      modules: ['modulo-1'],
    },
    modules: [mod],
    proficiency: null,
    dir: `/tmp/fixture-${linguagem}`,
  } as unknown as LoadedTrack;
}

describe('audit C — a normalização é CONDICIONAL: as outras linguagens não mudam', () => {
  it('javascript: com surface, as ocorrências são byte a byte as de sem surface', () => {
    const sem = extractAtoms(TESTS_JS, { fileName: 'tests.mjs', language: 'javascript' });
    const com = extractAtoms(TESTS_JS, { fileName: 'tests.mjs', language: 'javascript', surface: 'testsCode' });
    assert.ok(sem.ok && com.ok);
    if (!sem.ok || !com.ok) return;
    assert.deepEqual(com.keys, sem.keys);
    assert.deepEqual(com.occurrences, sem.occurrences);
  });

  it('typescript: idem (a superfície não muda a caminhada do ts-node)', () => {
    const sem = extractAtoms(TESTS_TS, { language: 'typescript' });
    const com = extractAtoms(TESTS_TS, { language: 'typescript', surface: 'testsCode' });
    assert.ok(sem.ok && com.ok);
    if (!sem.ok || !com.ok) return;
    assert.deepEqual(com.occurrences, sem.occurrences);
  });

  it('python: idem (a caminhada lang-node não vê a superfície)', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
    const sem = extractAtoms(TESTS_PY, { fileName: 'tests/test_solucao.py', language: 'python' });
    const com = extractAtoms(TESTS_PY, { fileName: 'tests/test_solucao.py', language: 'python', surface: 'testsCode' });
    assert.ok(sem.ok && com.ok, `python deve parsear: ${sem.ok ? '' : sem.error.message}`);
    if (!sem.ok || !com.ok) return;
    assert.deepEqual(com.occurrences, sem.occurrences);
  });

  it('a mensagem A2 do JavaScript fica EXATAMENTE a de antes (trilha JS com teste quebrado)', () => {
    // A MESMA trilha C-honesto em JavaScript: só o testsCode quebra.
    const desafio: TrackChallengeSource = {
      schemaVersion: 1,
      slug: 'dobrar',
      title: 'dobrar',
      concept: 'conceito',
      difficulty: 1,
      language: 'javascript',
      statement: '# dobrar',
      starterCode: 'export function dobro(x) {\n  return 0;\n}\n',
      testsCode: "test('quebrado'",
      solutionCode: 'export function dobro(x) {\n  return x * 2;\n}\n',
      expectedTestCount: 1,
    };
    const lessonMeta = {
      schemaVersion: 1,
      slug: 'a-aula',
      title: 'a aula',
      summary: 'a aula',
      difficulty: 1,
      concepts: ['conceito'],
      prerequisites: [],
      theory: [theoryC('```js\nexport function dobro(x) {\n  return x * 2;\n}\n```')],
      sources: [],
      challenges: ['dobrar'],
    };
    const lesson: LoadedLesson = { meta: lessonMeta as unknown as LoadedLesson['meta'], challenges: [desafio] };
    const mod: LoadedModule = {
      meta: { schemaVersion: 1, slug: 'modulo-1', title: 'modulo-1', order: 1, lessons: ['a-aula'] },
      lessons: [lesson],
      challenge: null,
    };
    const track = {
      root: {
        schemaVersion: 1,
        slug: 'trilha-js-fixture',
        title: 'trilha-js-fixture',
        description: 'fixture',
        language: 'pt-BR',
        domain: 'programming',
        programmingLanguage: 'javascript',
        modules: ['modulo-1'],
      },
      modules: [mod],
      proficiency: null,
      dir: '/tmp/fixture-js',
    } as unknown as LoadedTrack;

    const rep = auditTrack(track, { mode: 'declared' });
    const a2 = rep.violations.filter((v) => v.regra === 'A2' && v.campo === 'testsCode');
    assert.equal(a2.length, 1, JSON.stringify(rep.violations.map((v) => [v.regra, v.campo])));
    const cru = extractAtoms("test('quebrado'", { fileName: 'x.mjs' });
    assert.ok(!cru.ok);
    if (cru.ok) return;
    // BYTE A BYTE o formato antigo — nenhuma trilha JS muda a mensagem:
    assert.equal(a2[0].mensagem, `\`testsCode\` não parseia como JavaScript: ${cru.error.message}`);
  });

  it('python: o rótulo da mensagem A2 é Python — não o "JavaScript" cravado de antes', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
    // O MESMO formato do teste JS acima, agora em Python: aula honesta, só o
    // testsCode quebrado. O rótulo correto é a mudança INTENCIONAL declarada
    // no audit.ts — a base cravava "JavaScript" para TODA linguagem não-C, e
    // o "Python" de hoje é melhoria de diagnóstico, não efeito incidental.
    const testsQuebrado = 'def quebrado(';
    const rep = auditTrack(
      trilhaComTesteQuebrado(
        'python',
        'def dobro(x):\n    return 0\n',
        'def dobro(x):\n    return x * 2\n',
        '```python\ndef dobro(x):\n    return x * 2\n```',
        testsQuebrado,
      ),
      { mode: 'declared' },
    );
    const a2 = rep.violations.filter((v) => v.regra === 'A2' && v.campo === 'testsCode');
    assert.equal(a2.length, 1, JSON.stringify(rep.violations.map((v) => [v.regra, v.campo])));
    const cru = extractAtoms(testsQuebrado, { fileName: 'tests/test_solucao.py', language: 'python' });
    assert.ok(!cru.ok);
    if (cru.ok) return;
    // byte a byte o formato POR RÓTULO (o padrão do teste JS):
    assert.equal(a2[0].mensagem, `\`testsCode\` não parseia como Python: ${cru.error.message}`);
    assert.ok(!a2[0].mensagem.includes('JavaScript'), `não pode citar JavaScript: ${a2[0].mensagem}`);
  });

  it('typescript: o rótulo da mensagem A2 é TypeScript — não o "JavaScript" cravado de antes', () => {
    // Idem ao python: aula honesta em TypeScript, só o testsCode quebrado.
    const testsQuebrado = 'const x: = 1;';
    const rep = auditTrack(
      trilhaComTesteQuebrado(
        'typescript',
        'export function dobro(x: number): number {\n  return 0;\n}\n',
        'export function dobro(x: number): number {\n  return x * 2;\n}\n',
        '```ts\nexport function dobro(x: number): number {\n  return x * 2;\n}\n```',
        testsQuebrado,
      ),
      { mode: 'declared' },
    );
    const a2 = rep.violations.filter((v) => v.regra === 'A2' && v.campo === 'testsCode');
    assert.equal(a2.length, 1, JSON.stringify(rep.violations.map((v) => [v.regra, v.campo])));
    const cru = extractAtoms(testsQuebrado, { fileName: 'x.ts', language: 'typescript' });
    assert.ok(!cru.ok);
    if (cru.ok) return;
    assert.equal(a2[0].mensagem, `\`testsCode\` não parseia como TypeScript: ${cru.error.message}`);
    assert.ok(!a2[0].mensagem.includes('JavaScript'), `não pode citar JavaScript: ${a2[0].mensagem}`);
  });
});

// ---------------------------------------------------------------------------
// 5. O CATÁLOGO DOS CALL-SITES — nenhum que alimenta testsCode sem surface
// ---------------------------------------------------------------------------

/**
 * O passeio: coleta TODO call-site de `extractAtoms`/`extractAllOccurrences`
 * nos fontes da engine, com o primeiro argumento e as opções, e classifica:
 *
 *   - `language` presente  → o site pode rodar com o adaptador `c` (é ele que
 *     dispara a ante-sala; os sites SEM `language` analisam o default
 *     `javascript` e nunca são C, por construção);
 *   - `surface` presente   → o site declara a superfície (a normalização
 *     centralizada de extract.ts exige que TODO site que alimenta testsCode a
 *     passe).
 *
 * FALSIFICÁVEL 3 DA ONDA 3: "nenhum call-site ficou sem a normalização". Um
 * site NOVO com `language` e sem `surface` REPROVA aqui com a lista completa —
 * quem o acrescenta precisa declarar `surface` (se for testsCode) ou
 * registrá-lo abaixo com a razão (se a superfície dele parseia standalone).
 */

/** Arquivos .ts da engine, em ordem estável (sem o extract.ts — é a própria
 * implementação: as declarações `function extractAtoms(` não são call-sites). */
function arquivosDaEngine(): string[] {
  const raiz = path.resolve(__dirname, '..', 'electron', 'main', 'engine');
  const out: string[] = [];
  const caminha = (dir: string): void => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const cheio = path.join(dir, ent.name);
      if (ent.isDirectory()) caminha(cheio);
      else if (ent.isFile() && ent.name.endsWith('.ts')) out.push(cheio);
    }
  };
  caminha(raiz);
  return out.filter((f) => !f.endsWith(`${path.sep}extract.ts`));
}

/** Tira comentários para o scan — um `extractAtoms(` em comentário não é site. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** 1º argumento e opções de uma chamada que abre em `abre` (índice do `(`). */
function partesDaChamada(fonte: string, abre: number): { primeiroArg: string; opcoes: string } {
  let profundidade = 0;
  let virgula = -1;
  let fecha = -1;
  for (let i = abre; i < fonte.length; i++) {
    const ch = fonte[i];
    if (ch === '(') profundidade += 1;
    else if (ch === ')') {
      profundidade -= 1;
      if (profundidade === 0) {
        fecha = i;
        break;
      }
    } else if (ch === ',' && profundidade === 1 && virgula === -1) virgula = i;
  }
  if (fecha === -1) return { primeiroArg: '', opcoes: '' };
  return {
    primeiroArg: fonte.slice(abre + 1, virgula === -1 ? fecha : virgula).trim(),
    opcoes: virgula === -1 ? '' : fonte.slice(virgula + 1, fecha).trim(),
  };
}

interface SiteExtracao {
  /** `<caminho relativo a app/>#<primeiroArg>` — estável e auto-explicativo. */
  id: string;
  primeiroArg: string;
  opcoes: string;
  comLanguage: boolean;
  comSurface: boolean;
}

function sitesDeExtracao(): SiteExtracao[] {
  const sites: SiteExtracao[] = [];
  const re = /\bextract(?:Atoms|AllOccurrences)\(/g;
  for (const arquivo of arquivosDaEngine()) {
    const fonte = semComentarios(fs.readFileSync(arquivo, 'utf8'));
    const rel = path.relative(path.resolve(__dirname, '..'), arquivo);
    for (const m of fonte.matchAll(re)) {
      const { primeiroArg, opcoes } = partesDaChamada(fonte, m.index + m[0].length - 1);
      sites.push({
        id: `${rel}#${primeiroArg || '??'}`,
        primeiroArg,
        opcoes,
        // `language` largo: um falso positivo só manda o site para o registro
        // de isentos, onde é julgado — nunca silêncio.
        comLanguage: /\blanguage\b/.test(opcoes),
        // `surface` com SEPARADOR (`surface:` ou shorthand `surface,`/`surface }`):
        // um `\bsurface\b` solto casaria a VARIÁVEL `surface.caminho` dentro de
        // template (fiacao/geraTrilha) — falso positivo medido.
        comSurface: /\bsurface\b\s*[:,}]/.test(opcoes),
      });
    }
  }
  return sites;
}

/**
 * Os sites que passam `surface` e alimentam testsCode — a cobertura MÍNIMA da
 * normalização (§6 do cabeçalho). Se a igualdade abaixo quebrar, julgue o
 * site novo: testsCode → `surface: 'testsCode'`; outra superfície → registre
 * com a razão no mapa de isentos.
 */
const SITES_DE_TESTSCODE_COM_SURFACE = [
  'electron/main/engine/audit.ts#code', // o loop das superfícies do desafio (A2/A3)
  'electron/main/engine/quality/progressao.ts#desafio.tests', // A13c lê o teste
];

/**
 * Os sites com `language` e SEM `surface`, com a razão de cada um poder ficar
 * sem a normalização: a superfície dele parseia standalone (não é testsCode)
 * ou é inerte por guarda de linguagem.
 */
const ISENTOS_COM_LANGUAGE: Record<string, string> = {
  'electron/main/engine/audit.ts#block.code': 'teoria (A4) — bloco cercado parseia standalone',
  'electron/main/engine/audit.ts#s.code': 'starterCode — o starter de C parseia standalone (a macro é do testsCode)',
  'electron/main/engine/budget.ts#block.code': 'teoria — bloco cercado parseia standalone',
  'electron/main/engine/modes/curriculumGap.ts#bloco.codigo': 'teoria da aula nova (A4 do laço)',
  'electron/main/engine/quality/discriminacao.ts#desafio.solutionCode': 'solutionCode parseia standalone',
  'electron/main/engine/quality/minimalPython.ts#candidato': 'minimal Python (solutionCode), guarda própria',
  'electron/main/engine/quality/progressao.ts#arquivo.solution': 'solutionCode da bateria (javascript-only)',
  'electron/main/engine/quality/progressao.ts#arquivo.starter': 'starterCode da bateria (javascript-only)',
  'electron/main/engine/quality/progressao.ts#codigo': 'teoria (demoDaAula) — bloco cercado parseia standalone',
  'electron/main/engine/quality/requirements.ts#solutionCode': 'solutionCode para cobertura de requirements',
  'electron/main/engine/quality/requirements.ts#trecho': 'trecho do assert Python (fallback declarado)',
};

describe('audit C — o catálogo dos call-sites de extração (nenhum testsCode sem surface)', () => {
  const sites = sitesDeExtracao();
  const idsUnicos = [...new Set(sites.map((s) => s.id))].sort();
  const comSurface = [...new Set(sites.filter((s) => s.comSurface).map((s) => s.id))].sort();
  const comLanguageSemSurface = [...new Set(sites.filter((s) => s.comLanguage && !s.comSurface).map((s) => s.id))].sort();

  it('os call-sites que alimentam testsCode passam surface: testsCode', () => {
    assert.deepEqual(
      comSurface.filter((id) => SITES_DE_TESTSCODE_COM_SURFACE.includes(id)),
      SITES_DE_TESTSCODE_COM_SURFACE,
    );
    // e NENHUM site a mais passou surface sem ser julgado aqui:
    assert.deepEqual(
      comSurface.filter((id) => !SITES_DE_TESTSCODE_COM_SURFACE.includes(id)),
      [],
      'novo call-site com `surface`: se alimenta testsCode, registre-o acima; senão, a dica é ruído',
    );
  });

  it('todo call-site com language e sem surface é isento REGISTRADO (com a razão)', () => {
    const naoIsentos = comLanguageSemSurface.filter((id) => ISENTOS_COM_LANGUAGE[id] === undefined);
    assert.deepEqual(
      naoIsentos,
      [],
      'call-site(s) com `language` sem `surface` e sem registro: se alimenta testsCode, passe `surface: ' +
        "'testsCode'` (a ante-sala de C é centralizada em extract.ts); senão registre-o em ISENTOS_COM_LANGUAGE com a razão\n" +
        `  sites: ${naoIsentos.join('\n         ')}`,
    );
    // e o registro não carrega isento fantasma (renome de variável → atualize)
    const fantasmas = Object.keys(ISENTOS_COM_LANGUAGE).filter((id) => !idsUnicos.includes(id));
    assert.deepEqual(fantasmas, [], `isentos que não existem mais nos fontes: ${fantasmas.join(', ')}`);
  });

  it('os alimentadores de testsCode SEM language analisam o default JS — nunca são C', () => {
    // `fiacao/geraTrilha.ts` e `review/audit2Laco.ts` leem testsCode de drafts/
    // trilhas no LAÇO de correção sem passar `language`: o adaptador resolve
    // para o default (`javascript`) e a ante-sala de C não se aplica — são
    // JS-only por construção (limitação pré-existente, declarada aqui).
    for (const id of ['electron/main/engine/fiacao/geraTrilha.ts#valor.decodificado', 'electron/main/engine/review/audit2Laco.ts#valor.decodificado']) {
      const site = sites.find((s) => s.id === id);
      assert.ok(site !== undefined, `o site documentado sumiu dos fontes: ${id}`);
      assert.equal(site.comLanguage, false, `${id} passou a passar language — reavalie o registro (pode ser C agora)`);
    }
  });

  it('o passeio enxerga os sites de verdade (a régua não está vazia)', () => {
    // medido na onda 3: 34 call-sites, 24 ids únicos — a régua fica bem abaixo
    // para não reprovar por ruído, e bem acima de zero para não passar muda.
    assert.ok(sites.length >= 30, `o passeio encontrou ${sites.length} sites — algo quebrou na coleta`);
    assert.ok(idsUnicos.length >= 20, `ids únicos: ${idsUnicos.length} (sites: ${sites.length})`);
  });
});

// ---------------------------------------------------------------------------
// Guarda de tipo: ExtractSurface é o alfabeto que os call-sites podem passar.
// ---------------------------------------------------------------------------
const _surfaceDoTipo: ExtractSurface = 'testsCode';
void _surfaceDoTipo;
