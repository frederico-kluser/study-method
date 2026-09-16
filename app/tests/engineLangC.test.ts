/**
 * tests/engineLangC.test.ts — O ADAPTADOR DE C (a quarta linha do §6).
 *
 * Contrato normativo: `docs/research/08-multilingua-trava-deterministica.md`
 * §6 (linhas 855-957) e §7 item 3 — C é a primeira linguagem "toolchain emite
 * AST": o parse roda `clang -Xclang -ast-dump=json` por SUBPROCESSO (o modelo
 * de `lang/python.ts`) e EXIGE clang especificamente (o gcc não tem a
 * extensão), enquanto o runner aceita cc/gcc/clang.
 *
 * O que este arquivo cobre (o espelho do que `engineLangPython.test.ts` cobre
 * para a segunda linha):
 *   1. identidade e registro ('c'/'c11', tags, detect com degradação);
 *   2. a Porta 1 por subprocesso — árvore com line/column 1-based e offsets
 *      ABSOLUTOS (com acento UTF-8), PARSE_ERROR estruturado, memoização;
 *   3. resolveScopes, globals() (stdin/stdout/stderr) e builtins() VAZIOS;
 *   4. os eixos do vocabulário — node/decl/op/global/api — e o enum FECHADO;
 *   5. as QUATRO distinções que o clang colapsa (nós portadores sintéticos);
 *   6. layout, filePathPattern, testCommand;
 *   7. a dupla-igualdade (countDeclared por AST, countRun das ÚLTIMAS linhas
 *      TESTS_RUN/TESTS_FAILED com nonce) e a convenção counter_protocol nos
 *      ARTEFATOS gerados (helpers static + veneno do assert, SM_ONLY,
 *      EXIT_BRUTO/DECORRIDO_MS);
 *   8. failureExitCodes (D-V11: 0/1 normalizados, 2/3 da engine) e envScrub;
 *   9. AS QUATRO PROVAS POR EXECUÇÃO REAL num challenge `language: "c"`
 *      (compilador presente nesta máquina — pulo condicional como o py);
 *  10. RESISTÊNCIA A FORJAMENTO: os QUATRO vetores antigos (exit(0) cedo,
 *      printf forjado, construtor forjado, fork órfão) ADAPTADOS e os TRÊS
 *      NOVOS da revisão — interposição de __assert_rtn/__assert_fail,
 *      contagens TESTS_RUN/TESTS_FAILED forjadas e símbolos globais checa_*
 *      do aluno — as provas FALHAM nos sete;
 *  11. a caminhada genérica: `extractAtoms(…, { language: 'c' })` usa SÓ o
 *      vocabulário do adaptador C (nada de JS vaza), e a porta de tabelas de
 *      `atomKeys.ts` segue FECHADA para 'c' (fail-closed — é trabalho da
 *      onda do vocabulário).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  C_CHALLENGE_LANGUAGES,
  C_ENTRY_PATH,
  C_FORBIDDEN_INVARIANTS,
  C_HARNESS_HEADER_PATH,
  C_HARNESS_MAIN_PATH,
  C_RUNNER_SCRIPT_PATH,
  C_SAFE_FILE_PATH_RE,
  C_TEST_COMMAND,
  C_TEST_PATH,
  SM_HARNESS_HEADER,
  SM_MAIN_SOURCE,
  SM_RUNNER_SCRIPT,
  cAdapter,
  cDetect,
  cResetDetectCache,
  cResetParseCache,
} from '../electron/main/engine/lang/c';
import {
  ENV_ALLOWLIST_COMUM,
  ENV_NUCLEO_COMUM,
  adapterIdForChallengeLanguage,
  applyEnvScrub,
  classifyTheoryTag,
  findAdapter,
  getAdapter,
} from '../electron/main/engine/lang/registry';
import type { LangNode } from '../electron/main/engine/lang/registry';
import { structuralAlwaysAllowed } from '../electron/main/engine/atomKeys';
import { TabelaDeLinguagemAusenteError } from '../electron/main/engine/atomKeys';
import { extractAtoms } from '../electron/main/engine/extract';
import {
  judgeCountMatches,
  judgeSolutionPasses,
  verifyChallengeProofs,
  execOutput,
} from '../electron/main/engine/exec/proofs';
import { politicaDeTipos } from '../electron/main/engine/exec/typesCheck';
import {
  cleanupDir,
  prepareIsolatedDir,
} from '../electron/main/engine/exec/harness';
import { fromChallengeExec } from '../electron/main/engine/exec/adapter';
import { criarExecDeLinguagem } from '../electron/main/services/challengeExec';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const c = cAdapter;

/** A máquina tem a toolchain de C COMPLETA? (compilador + clang + python3) */
const TEM_C = cDetect().ok;

/** Chaves de um fonte, pela caminhada do PRÓPRIO adaptador (membro 2). */
function chavesDe(fonte: string): Set<string> {
  const r = c.parse(fonte);
  assert.ok(r.ok, `fixture deve parsear: ${r.ok ? '' : JSON.stringify(r.error)}`);
  if (!r.ok) return new Set();
  const chaves = new Set<string>();
  const visitar = (no: LangNode): void => {
    const k = c.constructKey(no);
    if (k) chaves.add(k);
    if (no.synthetic !== true) chaves.add(`node:${no.type}`);
    for (const filho of no.children) visitar(filho);
  };
  // A RAIZ NÃO ENTRA (a caminhada genérica de extract.ts começa nos filhos).
  for (const filho of r.root.children) visitar(filho);
  return chaves;
}

// ---------------------------------------------------------------------------
// 1. identidade e registro
// ---------------------------------------------------------------------------

describe('c — identidade e registro', () => {
  it('está registrado, e o id é a LINGUAGEM', () => {
    assert.equal(c.id, 'c');
    assert.equal(findAdapter('c'), c);
    assert.equal(getAdapter('c'), c);
  });

  it("'c11' é o PADRÃO da trilha, não outra linguagem (como 'python3' para py)", () => {
    assert.deepEqual([...C_CHALLENGE_LANGUAGES], ['c', 'c11']);
    assert.equal(adapterIdForChallengeLanguage('c'), 'c');
    assert.equal(adapterIdForChallengeLanguage('C'), 'c', 'caixa normalizada');
    assert.equal(adapterIdForChallengeLanguage('c11'), 'c');
  });

  it('a tag de teoria é a de C', () => {
    assert.deepEqual([...c.theoryFenceTags], ['c']);
    assert.deepEqual(classifyTheoryTag('c'), { kind: 'codigo', adapterId: 'c', tag: 'c' });
  });

  it('detect() acha a toolchain, ou DIZ o que deixou de funcionar (nunca crash)', () => {
    const d = cDetect();
    assert.equal(typeof d.binary, 'string');
    if (TEM_C) {
      assert.equal(d.ok, true);
      assert.equal(d.degradacao, null);
      assert.match(d.version ?? '', /^\d+\.\d+/);
      assert.equal(d.binary, 'sh', 'o spawn do runner executa sh run.sh');
    } else {
      assert.equal(d.ok, false);
      assert.ok(d.degradacao && d.degradacao.length > 20, 'a degradação DIZ o que faltou');
    }
  });

  it('o memo de detect é reconstrutível (o mesmo valor depois do reset)', () => {
    const antes = cDetect();
    cResetDetectCache();
    const depois = cDetect();
    assert.deepEqual(depois, antes);
  });

  it('a QUINTA PROVA NÃO se aplica a C — a compilação já é o typecheck', () => {
    // Decisão documentada em exec/typesCheck.ts (entrada `c`): o runner de C
    // compila a solução com -std=c11 antes de rodar; uma prova separada
    // pagaria o `cc` duas vezes para repetir o mesmo julgamento.
    assert.equal(politicaDeTipos('c').required, false);
    assert.deepEqual(politicaDeTipos('c').args, []);
  });
});

// ---------------------------------------------------------------------------
// 2. a Porta 1 por SUBPROCESSO (clang → python3)
// ---------------------------------------------------------------------------

describe('c — (1) Porta 1: o parse por SUBPROCESSO', () => {
  it('parseia C real com line/column 1-based e offsets ABSOLUTOS', { skip: !TEM_C }, () => {
    const fonte = 'int dobro(int x) {\n    return x * 2;\n}\n';
    const r = c.parse(fonte);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.source, fonte);
    assert.equal(r.root.type, 'TranslationUnitDecl');
    assert.equal(r.root.start, 0);

    const achar = (tipo: string, no = r.root): LangNode | null => {
      if (no.type === tipo) return no;
      for (const filho of no.children) {
        const achado = achar(tipo, filho);
        if (achado) return achado;
      }
      return null;
    };
    const bin = achar('BinaryOperator');
    assert.ok(bin, 'a árvore expõe o BinaryOperator de `x * 2`');
    if (!bin) return;
    assert.equal(bin.line, 2, '`x * 2` está na 2ª linha');
    assert.equal(bin.attributes.operator, '*');
    assert.equal(bin.attributes.operatorFamily, 'binary');
    assert.equal(fonte.slice(bin.start, bin.end), bin.text, 'offsets indexam o fonte devolvido');

    const func = achar('FunctionDecl');
    assert.ok(func);
    assert.equal(func?.attributes.name, 'dobro');
    assert.equal(func?.attributes.declKind, 'func');
  });

  it('ACENTO: os offsets continuam certos com UTF-8 multibyte (offset é em BYTES)', { skip: !TEM_C }, () => {
    // A armadilha do py (`col_offset` em bytes) é a mesma do clang. Um
    // `printf("ação")` não pode deslocar o snippet de nada depois dele.
    const fonte = 'int main(void) {\n    printf("ação é");\n    return 0;\n}\n';
    const r = c.parse(fonte);
    assert.ok(r.ok);
    if (!r.ok) return;
    const visitar = (no: LangNode): void => {
      assert.equal(fonte.slice(no.start, no.end), no.text, `${no.type}: offsets fora do fonte`);
      for (const filho of no.children) visitar(filho);
    };
    for (const filho of r.root.children) visitar(filho);
  });

  it('CRLF: newline="" no extrator — o clang conta BYTES inclusive o \\r; linha/coluna/offsets sincronizam', { skip: !TEM_C }, () => {
    // ACHADO C da revisão: extract_ast.py abria o fonte com universal
    // newlines (convertendo \r\n em \n) enquanto o clang conta BYTES — um
    // fonte CRLF dessincronizava linha/coluna/offsets/snippet em silêncio.
    const fonte = 'int dobro(int x) {\r\n    int dobro_do_x = x * 2;\r\n    return dobro_do_x;\r\n}\r\n';
    const r = c.parse(fonte);
    assert.ok(r.ok, `fonte CRLF deve parsear: ${r.ok ? '' : JSON.stringify(r.error)}`);
    if (!r.ok) return;
    const achar = (tipo: string, no = r.root): LangNode | null => {
      if (no.type === tipo) return no;
      for (const filho of no.children) {
        const achado = achar(tipo, filho);
        if (achado) return achado;
      }
      return null;
    };
    // o VarDecl é o caso MEDIDO da revisão (coluna errada, texto truncado)
    const decl = achar('VarDecl');
    assert.ok(decl, 'a árvore expõe o VarDecl da linha 2');
    if (!decl) return;
    assert.equal(decl.line, 2, 'com CRLF o VarDecl continua na 2ª linha');
    assert.equal(decl.column, 5, 'coluna 5 — o \\r não desloca mais nada');
    assert.equal(fonte.slice(decl.start, decl.end), decl.text, 'offsets CRLF indexam o fonte');
    assert.ok(decl.text.includes('dobro_do_x'), `texto do VarDecl completo (não truncado): ${decl.text}`);
    const bin = achar('BinaryOperator');
    assert.ok(bin);
    assert.equal(bin?.line, 2);
    // e o INVARIANTE GERAL: todo nó fatia o fonte CRLF exatamente no seu texto
    const visitar = (no: LangNode): void => {
      assert.equal(fonte.slice(no.start, no.end), no.text, `${no.type}: offsets fora do fonte CRLF`);
      for (const filho of no.children) visitar(filho);
    };
    for (const filho of r.root.children) visitar(filho);
  });

  it('PARSE_ERROR estruturado em fonte quebrado — nunca exceção, nunca árvore parcial', { skip: !TEM_C }, () => {
    const r = c.parse('int main(void) { int x = ; }\n');
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.equal(r.error.line, 1);
    assert.ok(r.error.column >= 1);
    assert.ok(r.error.message.length > 0, 'a mensagem do clang vai para o autor');
  });

  it('uso de variável NÃO declarada é PARSE_ERROR (o parse de C é semântico)', { skip: !TEM_C }, () => {
    // Limite documentado: diferente do Python (ast não resolve nomes), o
    // clang resolve — variável sem declaração é defeito real de C.
    const r = c.parse('int main(void) { return y; }\n');
    assert.equal(r.ok, false);
  });

  it('MEMOIZA por fonte — sem o cache, uma auditoria faria milhares de spawns', { skip: !TEM_C }, () => {
    cResetParseCache();
    const fonte = 'int f(void) { return 1; }\n';
    const a = c.parse(fonte);
    const b = c.parse(fonte);
    assert.equal(a, b, 'MESMA referência — a árvore veio do cache');
  });
});

// ---------------------------------------------------------------------------
// 3. resolveScopes, globals(), builtins()
// ---------------------------------------------------------------------------

describe('c — (4)(5) globals, builtins e resolveScopes (o limite PLANO declarado)', () => {
  it('globals() são os TRÊS fluxos padrão; builtins() é VAZIO (C não tem builtins fora da libc)', () => {
    assert.deepEqual([...c.globals()].sort(), ['stderr', 'stdin', 'stdout']);
    assert.equal(c.builtins().size, 0, 'printf/scanf são API de biblioteca (eixo api:), não builtins');
  });

  it('resolveScopes separa declarado, livre e global de runtime', { skip: !TEM_C }, () => {
    const r = c.parse('#include <stdio.h>\nint f(int p) { fputs("", stdout); return p; }\nint main(void) { return f(1); }\n');
    assert.ok(r.ok);
    if (!r.ok) return;
    const escopos = c.resolveScopes(r);
    assert.ok(escopos.declared.has('f'));
    assert.ok(escopos.declared.has('p'));
    assert.ok(escopos.declared.has('main'));
    assert.ok(!escopos.free.has('p'), 'nome declarado não é livre');
    assert.ok(escopos.free.has('stdout'));
    assert.ok(escopos.globals.has('stdout'), 'stdout é global de runtime e não foi declarado');
    assert.deepEqual([...escopos.imported], [], 'C não tem import — #include é expansão de texto');
  });
});

// ---------------------------------------------------------------------------
// 4. os eixos do vocabulário + o inventário fechado
// ---------------------------------------------------------------------------

describe('c — (2)(3) os eixos do vocabulário e o inventário FECHADO', () => {
  const FONTE = [
    '#include <stdio.h>',
    'int soma(int a, int b) {',
    '    return a + b;',
    '}',
    'int main(void) {',
    '    int total = 0;',
    '    int v[3] = {1, 2, 3};',
    '    v[0] = soma(1, 2);',
    '    for (int i = 0; i < 3; i++) {',
    '        if (v[i] > 1 && total != 10) {',
    '            total += v[i];',
    '        } else {',
    '            total -= 1;',
    '        }',
    '    }',
    '    while (total > 0) { total = total / 2; }',
    '    do { total++; } while (total < 0);',
    '    if (!total) { return -1; }',
    '    printf("tamanho %lu char %c str %s real %f\\n", sizeof(total), \'x\', "oi", 1.5);',
    '    return total;',
    '}',
  ].join('\n');

  it('mapeia node/decl/op/global/api num trecho representativo do curso', { skip: !TEM_C }, () => {
    const chaves = chavesDe(FONTE);
    // o eixo `decl:` — as duas formas de ligação de C
    assert.ok(chaves.has('decl:func'), [...chaves].join(' '));
    assert.ok(chaves.has('decl:var'), [...chaves].join(' '));
    // o eixo `op:` — binário, lógico, unário, update e assign
    assert.ok(chaves.has('op:binary:+'), [...chaves].join(' '));
    assert.ok(chaves.has('op:binary:/'), [...chaves].join(' '));
    assert.ok(chaves.has('op:binary:>'), [...chaves].join(' '));
    assert.ok(chaves.has('op:logical:&&'), [...chaves].join(' '));
    assert.ok(chaves.has('op:unary:!'), [...chaves].join(' '));
    assert.ok(chaves.has('op:unary:-'), [...chaves].join(' '));
    assert.ok(chaves.has('op:update:++'), [...chaves].join(' '));
    assert.ok(chaves.has('op:assign:='), [...chaves].join(' '));
    assert.ok(chaves.has('op:assign:+='), [...chaves].join(' '));
    assert.ok(chaves.has('op:assign:-='), [...chaves].join(' '));
    assert.ok(chaves.has('op:unary:sizeof'), [...chaves].join(' '));
    // o eixo `api:` — printf é API de biblioteca, não builtin
    assert.ok(chaves.has('api:printf'), [...chaves].join(' '));
    // o eixo `node:` — estruturas de controle, indexação e literais
    assert.ok(chaves.has('node:IfStmt'), [...chaves].join(' '));
    assert.ok(chaves.has('node:WhileStmt'), [...chaves].join(' '));
    assert.ok(chaves.has('node:DoStmt'), [...chaves].join(' '));
    assert.ok(chaves.has('node:ForStmt'), [...chaves].join(' '));
    assert.ok(chaves.has('node:ReturnStmt'), [...chaves].join(' '));
    assert.ok(chaves.has('node:ArraySubscriptExpr'), [...chaves].join(' '));
    assert.ok(chaves.has('node:InitListExpr'), [...chaves].join(' '));
    assert.ok(chaves.has('node:IntegerLiteral'), [...chaves].join(' '));
    assert.ok(chaves.has('node:FloatingLiteral'), [...chaves].join(' '));
    assert.ok(chaves.has('node:CharacterLiteral'), [...chaves].join(' '));
    assert.ok(chaves.has('node:StringLiteral'), [...chaves].join(' '));
    // a diretiva de preprocessor — nó portador (decisão 5 do adaptador)
    assert.ok(chaves.has('node:IncludeDirective'), [...chaves].join(' '));
    // NADA de JavaScript vaza
    for (const proibida of ['node:Identifier', 'node:BinaryExpression', 'api:console.log', 'global:console']) {
      assert.ok(!chaves.has(proibida), `vocabulário de JS vazou: ${proibida}`);
    }
  });

  it('a função do PRÓPRIO arquivo NÃO é api: (é o artefato sob teste — o partido do `from solucao import`)', { skip: !TEM_C }, () => {
    const chaves = chavesDe('int dobro(int x) { return x * 2; }\nint main(void) { return dobro(1); }\n');
    assert.ok(![...chaves].some((k) => k.startsWith('api:')), [...chaves].join(' '));
    assert.ok(chaves.has('node:CallExpr'), [...chaves].join(' '));
  });

  it('NÃO existe eixo `lit:` — literais são distinção de NÓ (fora do ATOM_KEY_RE)', { skip: !TEM_C }, () => {
    const chaves = chavesDe('int x = 1; double d = 1.5; char ch = \'c\';\n');
    assert.ok(![...chaves].some((k) => k.startsWith('lit:')), [...chaves].join(' '));
  });

  it('o inventário é FECHADO, ordenado, e cobre toda chave `node:` emitida', { skip: !TEM_C }, () => {
    const inv = c.inventory();
    assert.deepEqual([...inv], [...inv].sort(), 'ordenado (determinismo do complemento)');
    assert.ok(inv.length >= 25, `esperado ≥ 25 tipos, veio ${inv.length}`);
    const emitidas = chavesDe(FONTE);
    for (const chave of emitidas) {
      if (!chave.startsWith('node:')) continue;
      const nome = chave.slice('node:'.length);
      assert.ok(inv.includes(nome), `chave emitida fora do inventário: ${chave}`);
    }
  });

  it('(6) forbiddenInvariants: o mínimo que faz o gate de C mentir, com o porquê', () => {
    assert.deepEqual([...C_FORBIDDEN_INVARIANTS], ['node:IndirectCall', 'api:dlsym', 'api:system']);
    // indexação e dereference NÃO são proibidos: são o módulo de vetores/ponteiros
    assert.ok(!C_FORBIDDEN_INVARIANTS.includes('op:unary:*'));
    assert.ok(!C_FORBIDDEN_INVARIANTS.includes('node:ArraySubscriptExpr'));
  });

  it('chamada por PONTEIRO de função emite node:IndirectCall (a proibição global de C)', { skip: !TEM_C }, () => {
    const fonte = 'typedef int (*fn)(int);\nint main(void) { fn f = 0; return f(1); }\n';
    const chaves = chavesDe(fonte);
    assert.ok(chaves.has('node:IndirectCall'), [...chaves].join(' '));
  });
});

// ---------------------------------------------------------------------------
// 5. layout, filePathPattern e testCommand
// ---------------------------------------------------------------------------

describe('c — (7)(8)(9) layout, caminho seguro e comando de teste', () => {
  const TESTS = 'int dobro(int x);\nSM_TEST(dobro_de_2) { checa_int("dobro_de_2", dobro(2), 4, "o dobro de 2 e 4"); }\n';

  it('layout: header + main do harness na frente, teste com o include, fontes e run.sh', () => {
    const layout = c.layout({ code: 'int dobro(int x) { return x * 2; }\n', testsCode: TESTS });
    assert.deepEqual(
      layout.files.map((f) => f.path),
      [C_HARNESS_HEADER_PATH, C_HARNESS_MAIN_PATH, C_ENTRY_PATH, C_TEST_PATH, 'sm_fontes.txt', C_RUNNER_SCRIPT_PATH],
    );
    assert.equal(layout.entryPath, C_ENTRY_PATH);
    assert.equal(layout.testPath, C_TEST_PATH);
    assert.equal(layout.manifestPath, null, 'C não tem manifesto — a ausência é informação');
    // o teste do autor entra VERBATIM depois do include do harness
    const teste = layout.files.find((f) => f.path === C_TEST_PATH);
    assert.ok(teste);
    assert.equal(teste.content, `#include "sm_harness.h"\n${TESTS}`);
    // os três artefatos do harness são GERADOS e inspecionáveis
    const header = layout.files.find((f) => f.path === C_HARNESS_HEADER_PATH);
    assert.equal(header?.content, SM_HARNESS_HEADER);
    const main = layout.files.find((f) => f.path === C_HARNESS_MAIN_PATH);
    assert.equal(main?.content, SM_MAIN_SOURCE);
    const script = layout.files.find((f) => f.path === C_RUNNER_SCRIPT_PATH);
    assert.equal(script?.content, SM_RUNNER_SCRIPT);
  });

  it('layout MULTI-ARQUIVO preserva os arquivos do desafio (.c e .h) no disco, mas SÓ .c na lista de fontes', () => {
    const layout = c.layout({
      code: 'ignorado',
      files: [
        { path: 'util.h', code: 'int soma(int a, int b);' },
        { path: 'util.c', code: 'int soma(int a, int b) { return a + b; }' },
      ],
      testsCode: TESTS,
    });
    // o .h fica em disco (o teste e o util.c o incluem) mas NÃO entra na
    // lista: `cc -c util.h` produz PRECOMPILED HEADER ("data"), não objeto,
    // e a ligação reprova com `ld: unknown file type in '…/alunoN.o'`.
    const fontes = layout.files.find((f) => f.path === 'sm_fontes.txt');
    assert.equal(fontes?.content, 'util.c\n', 'só os .c vão para o script compilar — cabeçalho entra via #include');
    assert.ok(layout.files.some((f) => f.path === 'util.h'), 'o cabeçalho continua ESCRITO em disco');
    const teste = layout.files.find((f) => f.path === C_TEST_PATH);
    assert.ok(teste?.content.includes('#include "sm_harness.h"'));
    assert.ok(!layout.files.some((f) => f.path === C_ENTRY_PATH), 'com `files`, o solucao.c implícito não é escrito');
  });

  it('filePathPattern aceita .c e .h e recusa escape de diretório', () => {
    assert.equal(c.filePathPattern, C_SAFE_FILE_PATH_RE);
    assert.equal(C_SAFE_FILE_PATH_RE.flags, '', 'sem /g: RegExp com g guarda lastIndex');
    assert.ok(c.filePathPattern.test('solucao.c'));
    assert.ok(c.filePathPattern.test('lib/util.h'));
    assert.ok(!c.filePathPattern.test('../fuga.c'));
    assert.ok(!c.filePathPattern.test('solucao.mjs'));
    assert.ok(!c.filePathPattern.test('run.sh'));
  });

  it('testCommand roda o script GERADO — e o binário do spawn é o sh de detect()', () => {
    assert.deepEqual([...c.testCommand], [C_RUNNER_SCRIPT_PATH]);
    assert.equal(C_TEST_COMMAND.length, 1);
    assert.equal(cDetect().binary, 'sh');
  });
});

// ---------------------------------------------------------------------------
// 6. a dupla-igualdade, os checks e os exit codes
// ---------------------------------------------------------------------------

describe('c — (10)(11)(12)(13) a dupla-igualdade, os checks e os exit codes', () => {
  const TESTS = [
    'int dobro(int x);',
    '/* SM_TEST(comentado) { checa_int("comentado", 0, 1, "não conta"); } */',
    'SM_TEST(dobro_de_2) { checa_int("dobro_de_2", dobro(2), 4, "o dobro de 2 e 4"); }',
    'SM_TEST(dobro_de_menos_1) { checa_long("dobro_de_menos_1", dobro(-1), -2, "o dobro de -1 e -2"); }',
  ].join('\n');

  it('countDeclared é POR AST: protótipo + definição conta UM, comentário não conta', { skip: !TEM_C }, () => {
    assert.equal(c.countDeclared(TESTS), 2);
  });

  it('countDeclared de fonte quebrado é 0 (fail-closed: 0 nunca bate com o esperado)', { skip: !TEM_C }, () => {
    assert.equal(c.countDeclared('int x = ; SM_TEST(quebrado) {}'), 0);
  });

  it('countRun lê as ÚLTIMAS linhas SM TESTS_RUN/TESTS_FAILED — contagem anterior não ganha', () => {
    const saida = [
      'SMdeadbeef TESTS_RUN=9',
      'SMdeadbeef TESTS_FAILED=0',
      'SMabcdef12 TESTS_RUN=2',
      'SMabcdef12 TESTS_FAILED=1',
    ].join('\n');
    assert.deepEqual(c.countRun(saida), { testsRun: 2, pass: 1, fail: 1, skipped: 0 });
  });

  it('countRun SEM o prefixo SM+nonce não é contagem — o printf forjado do protocolo nunca casa', () => {
    // O canal confiável é o relatório com nonce do main do harness; as linhas
    // TESTS_RUN/TESTS_FAILED que o código do aluno imprime NÃO têm o nonce.
    assert.deepEqual(c.countRun('TESTS_RUN=2\nTESTS_FAILED=0\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
  });

  it('countRun sem relatório é ZERO (fail-closed), tolera ANSI e reprova relatório truncado', () => {
    assert.deepEqual(c.countRun('qualquer coisa\nsem relatório\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
    assert.deepEqual(
      c.countRun('\x1b[32mSMabc123 TESTS_RUN=1\x1b[0m\nSMabc123 TESTS_FAILED=0'),
      { testsRun: 1, pass: 1, fail: 0, skipped: 0 },
    );
    // as DUAS linhas são obrigatórias: uma sem a outra é relatório truncado
    assert.deepEqual(c.countRun('SMabc123 TESTS_RUN=2'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
  });

  it('parseChecks devolve um check por CENÁRIO — ok E FALHOU (o protocolo nunca esconde cenário)', () => {
    const saida = [
      'SMabc123 T dobro_de_2 ok',
      'SMabc123 T dobro_de_menos_1 FALHOU',
      'SMabc123 TESTS_RUN=2',
      'SMabc123 TESTS_FAILED=1',
    ].join('\n');
    assert.deepEqual(c.parseChecks(saida), [
      { name: 'dobro_de_2', passed: true },
      { name: 'dobro_de_menos_1', passed: false },
    ]);
  });

  it('failureExitCodes: D-V11 — 0/1 normalizados (EXIT_BRUTO carrega o bruto), 2/3 da engine', () => {
    assert.equal(c.failureExitCodes.isFailure(0), false);
    assert.equal(c.failureExitCodes.isFailure(1), true);
    assert.equal(c.failureExitCodes.isFailure(2), true);
    assert.equal(c.failureExitCodes.isFailure(3), true);
    assert.equal(c.failureExitCodes.isFailure(137), true);
    assert.match(c.failureExitCodes.meaning(1), /EXIT_BRUTO/);
    assert.match(c.failureExitCodes.meaning(2), /dupla-igualdade/);
    assert.equal(c.failureExitCodes.meaning(3), 'exit 3 (timeout — kill da engine; o runner gerado não tem timeout próprio)');
    assert.equal(c.failureExitCodes.meaning(137), 'timeout-ou-OOM');
    assert.ok(!/ocorre na convenção|falha de teste/i.test(c.failureExitCodes.meaning(134)), '134 NÃO é a semântica de falha da convenção');
    assert.equal(c.failureExitCodes.successRequiresCountMatch, true, 'a dupla-igualdade é INVARIANTE');
  });
});

// ---------------------------------------------------------------------------
// 6b. a convenção counter_protocol NOS ARTEFATOS GERADOS (03-tdd §3.9.3)
// ---------------------------------------------------------------------------

describe('c — a convenção counter_protocol nos ARTEFATOS gerados (03-tdd §3.9.3)', () => {
  it('o header define os helpers checa_* como STATIC (não interponíveis) + os contadores static', () => {
    // os tipos que o curso usa — derivados do §3.2 (checa_long) e da
    // convenção anterior (assert de int/long/double/char/string)
    for (const tipo of ['int', 'long', 'double', 'char', 'str']) {
      assert.match(SM_HARNESS_HEADER, new RegExp(`static void checa_${tipo}\\(`), `falta checa_${tipo}`);
    }
    assert.match(SM_HARNESS_HEADER, /static int sm_total = 0;/);
    assert.match(SM_HARNESS_HEADER, /static int sm_falhas = 0;/);
    assert.match(SM_HARNESS_HEADER, /FALHOU \[%s\]/, 'a mensagem didática vai para stderr, no formato do §3.9.3');
  });

  it('o header NUNCA deixa o teste usar assert() — o veneno torna uso de assert um erro de compilação', () => {
    assert.match(SM_HARNESS_HEADER, /#undef assert/);
    assert.match(SM_HARNESS_HEADER, /#define assert\(\.\.\.\) _Static_assert\(0,/, 'veneno do assert presente');
  });

  it('o main do harness respeita SM_ONLY, escreve TESTS_RUN/TESTS_FAILED com nonce e sai 0 só com zero falhas', () => {
    assert.match(SM_MAIN_SOURCE, /getenv\("SM_ONLY"\)/, 'filtro --only (03-tdd §3.9.2)');
    assert.match(SM_MAIN_SOURCE, /TESTS_RUN=%d/);
    assert.match(SM_MAIN_SOURCE, /TESTS_FAILED=%d/);
    assert.match(SM_MAIN_SOURCE, /falharam == 0 \? 0 : 1/, 'exit do counter_protocol');
  });

  it('o run.sh normaliza 0/1 e ecoa EXIT_BRUTO/DECORRIDO_MS (D-V11), com fallback fail-closed', () => {
    assert.match(SM_RUNNER_SCRIPT, /EXIT_BRUTO=/);
    assert.match(SM_RUNNER_SCRIPT, /DECORRIDO_MS=/);
    assert.match(SM_RUNNER_SCRIPT, /sm_norm=1/, 'normalização: bruto != 0 vira 1');
    assert.match(SM_RUNNER_SCRIPT, /SM\$SM_NONCE TESTS_RUN=0/, 'sem relatório → contagem ZERO (fail-closed)');
    assert.match(SM_RUNNER_SCRIPT, /SM\$SM_NONCE TESTS_FAILED=1/);
  });
});

// ---------------------------------------------------------------------------
// 7. envScrub
// ---------------------------------------------------------------------------

describe('c — (14) envScrub: o veneno de C do §6 obs. 2', () => {
  it('`fixed` e `strip` NUNCA se sobrepõem (as duas semânticas fariam o oposto)', () => {
    const strip = new Set(c.envScrub.strip);
    for (const chave of Object.keys(c.envScrub.fixed)) {
      assert.ok(!strip.has(chave), `${chave} está em fixed E em strip`);
    }
  });

  it('a allowlist constrói o ambiente do NADA e remove o veneno de C', () => {
    const base = {
      PATH: '/usr/bin',
      HOME: '/home/aluno',
      CFLAGS: '-O0 -fno-stack-protector',
      CPATH: '/veneno/include',
      C_INCLUDE_PATH: '/veneno/include',
      LIBRARY_PATH: '/veneno/lib',
      LD_PRELOAD: '/veneno/evil.so',
      LD_LIBRARY_PATH: '/veneno/lib',
      DYLD_INSERT_LIBRARIES: '/veneno/evil.dylib',
      SEGREDO_DA_MAQUINA: 'x',
    };
    const env = applyEnvScrub(c.envScrub, base);
    assert.equal(env.CFLAGS, undefined);
    assert.equal(env.CPATH, undefined);
    assert.equal(env.C_INCLUDE_PATH, undefined);
    assert.equal(env.LIBRARY_PATH, undefined);
    assert.equal(env.LD_PRELOAD, undefined);
    assert.equal(env.LD_LIBRARY_PATH, undefined);
    assert.equal(env.DYLD_INSERT_LIBRARIES, undefined);
    assert.equal(env.SEGREDO_DA_MAQUINA, undefined, 'allowlist: o que não foi permitido não passa');
    assert.equal(env.PATH, '/usr/bin', 'sem PATH o spawn nem acha o binário');
    assert.equal(env.NO_PROXY, '*');
    assert.equal(env.LC_ALL, ENV_NUCLEO_COMUM.LC_ALL);
    assert.equal(env.TZ, ENV_NUCLEO_COMUM.TZ);
  });

  it('`allow` é vazio: sh + compilador não precisam de extra além do núcleo comum', () => {
    assert.deepEqual([...c.envScrub.allow], []);
    assert.ok(ENV_ALLOWLIST_COMUM.includes('PATH'));
  });

  it('o `scope` DECLARA os limites, inclusive o do nonce na imagem do runner', () => {
    const texto = c.envScrub.scope.join('\n');
    assert.match(texto, /nonce/);
    assert.match(texto, /socket cru/);
    assert.match(texto, /DYLD/);
    assert.ok(c.envScrub.scope.some((l) => l.startsWith('LIMITE:')));
  });
});

// ---------------------------------------------------------------------------
// 8. AS QUATRO PROVAS POR EXECUÇÃO REAL (challenge language: "c")
// ---------------------------------------------------------------------------

const TESTS_CODE = [
  'int dobro(int x);',
  '',
  'SM_TEST(dobro_de_2) {',
  '    checa_int("dobro_de_2", dobro(2), 4, "o dobro de 2 e 4");',
  '}',
  'SM_TEST(dobro_de_menos_1) {',
  '    checa_long("dobro_de_menos_1", dobro(-1), -2, "o dobro de -1 e -2");',
  '}',
].join('\n');
const SOLUTION_CODE = 'int dobro(int x) {\n    return x * 2;\n}\n';
const STARTER_CODE = 'int dobro(int x) {\n    return 0; /* TODO: implemente */\n}\n';

function provadorReal(): {
  env: Parameters<typeof verifyChallengeProofs>[1];
  limpar: () => Promise<void>;
} {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-c-proof-'));
  return {
    env: {
      exec: fromChallengeExec(criarExecDeLinguagem(c)),
      prepare: (side) => prepareIsolatedDir(base, side, c),
      cleanup: cleanupDir,
    },
    limpar: async () => {
      await fs.promises.rm(base, { recursive: true, force: true }).catch(() => {});
    },
  };
}

describe('c — as quatro provas de execução REAL (challenge language: "c")', () => {
  // Pulo condicional como o py (engineLangPython): sem toolchain o adaptador
  // DEGRADA com mensagem, e as provas de execução não podem rodar.
  it('a solução passa, o starter falha, a contagem bate e o stub vazio falha', { skip: !TEM_C }, async () => {
    const { env, limpar } = provadorReal();
    try {
      const v = await verifyChallengeProofs(
        {
          solutionCode: SOLUTION_CODE,
          starterCode: STARTER_CODE,
          testsCode: TESTS_CODE,
          expectedTestCount: 2,
          language: 'c',
          emptyStubCode: '/* stub vazio: nenhuma função definida */\n',
          timeoutMs: 60_000,
        },
        env,
      );
      assert.deepEqual(v.failures, [], `provas reprovaram: ${JSON.stringify(v.failures, null, 2)}`);
      assert.equal(v.valid, true);
      assert.equal(v.declared, 2);
      assert.equal(v.executed, 2);
      assert.equal(v.types?.applicable, false, 'a quinta prova não se aplica a C');
    } finally {
      await limpar();
    }
  });

  it('os julgadores puros discriminam os dois lados com o runner REAL', { skip: !TEM_C }, async () => {
    const { env, limpar } = provadorReal();
    try {
      const dir = await env.prepare({ code: SOLUTION_CODE, testsCode: TESTS_CODE });
      const res = await env.exec(dir, [...c.testCommand], { timeoutMs: 60_000 });
      assert.equal(res.exitCode, 0, `saída:\n${execOutput(res)}`);
      const counts = c.countRun(execOutput(res));
      assert.deepEqual(counts, { testsRun: 2, pass: 2, fail: 0, skipped: 0 });
      assert.equal(judgeSolutionPasses(res, 2, c).passed, true);
      assert.equal(judgeCountMatches(2, 2, res, c).passed, true);
      // os checks nomeados saem para a UI
      const checks = c.parseChecks(execOutput(res));
      assert.deepEqual(checks, [
        { name: 'dobro_de_2', passed: true },
        { name: 'dobro_de_menos_1', passed: true },
      ]);
    } finally {
      await limpar();
    }
  });

  it('starter com corpo TODO falha com exit 1 NORMALIZADO (D-V11) e os DOIS cenários visíveis', { skip: !TEM_C }, async () => {
    const { env, limpar } = provadorReal();
    try {
      const dir = await env.prepare({ code: STARTER_CODE, testsCode: TESTS_CODE });
      const res = await env.exec(dir, [...c.testCommand], { timeoutMs: 60_000 });
      // counter_protocol: dobro(0)!=4 e dobro(0)!=-2 — os helpers NUNCA
      // abortam, então a rodada INTEIRA roda e o relatório sai inteiro.
      assert.equal(res.exitCode, 1, `saída:\n${execOutput(res)}`);
      assert.equal(c.failureExitCodes.isFailure(res.exitCode), true);
      assert.match(c.failureExitCodes.meaning(res.exitCode), /counter_protocol/);
      const saida = execOutput(res);
      assert.deepEqual(c.countRun(saida), { testsRun: 2, pass: 0, fail: 2, skipped: 0 });
      const checks = c.parseChecks(saida);
      assert.deepEqual(checks, [
        { name: 'dobro_de_2', passed: false },
        { name: 'dobro_de_menos_1', passed: false },
      ], 'um check por CENÁRIO — o protocolo não esconde os cenários seguintes');
      assert.match(saida, /FALHOU \[dobro_de_2\]/, 'a mensagem didática do §3.9.3 chega ao aluno');
    } finally {
      await limpar();
    }
  });
});

// ---------------------------------------------------------------------------
// 8b. REGRESSÃO: desafio MULTI-ARQUIVO .c + .h compila e roda de verdade
// ---------------------------------------------------------------------------

/**
 * O desafio multi-arquivo é o formato que o `filePathPattern` aceita
 * (`^[a-zA-Z0-9_\-/]+\.(c|h)$`) e o §3.2 do `languages.md` documenta
 * ("stub.c · stub.h — header ou protótipo!"). O bug: o `run.sh` alimentava
 * CADA linha de `sm_fontes.txt` ao `cc -c`, INCLUINDO o `.h` — e
 * `cc -c util.h` produz PRECOMPILED HEADER ("data"), não objeto, reprovan do
 * na LIGAÇÃO com `ld: unknown file type in '…/aluno1.o'`. Com o fix, o
 * `.h` sai da lista de TUs (entra via `#include`) e as QUATRO provas de
 * execução real passam no formato.
 */
describe('c — regressão: challenge multi-arquivo .c + .h compila e roda (as quatro provas reais)', () => {
  const UTIL_H = [
    '#ifndef UTIL_H',
    '#define UTIL_H',
    'int soma(int a, int b);',
    '#endif /* UTIL_H */',
    '',
  ].join('\n');
  const SOLUTION_FILES = [
    { path: 'util.h', code: UTIL_H },
    { path: 'util.c', code: '#include "util.h"\nint soma(int a, int b) { return a + b; }\n' },
  ];
  const STARTER_FILES = [
    { path: 'util.h', code: UTIL_H },
    { path: 'util.c', code: '#include "util.h"\nint soma(int a, int b) { return 0; /* TODO */ }\n' },
  ];
  const MULTI_TESTS_CODE = [
    // protótipo repetido no topo — a SEGUNDA forma documentada (languages.md
    // §3.2: "header ou protótipo!"). O `countDeclared` parseia num TEMP sem
    // os arquivos do desafio, então um `#include "../util.h"` no testsCode
    // viraria PARSE_ERROR e declared 0 (limitação pré-existente, fora do
    // escopo deste fix); o protótipo é a forma que as QUATRO provas aceitam.
    'int soma(int a, int b);',
    '',
    'SM_TEST(soma_de_2_e_3) {',
    '    checa_int("soma_de_2_e_3", soma(2, 3), 5, "2 + 3 e 5");',
    '}',
    'SM_TEST(soma_com_zero) {',
    '    checa_int("soma_com_zero", soma(7, 0), 7, "7 + 0 e 7");',
    '}',
  ].join('\n');

  it('as quatro provas de execução REAL passam no formato stub.c + stub.h', { skip: !TEM_C }, async () => {
    const { env, limpar } = provadorReal();
    try {
      const v = await verifyChallengeProofs(
        {
          solutionCode: 'ignorado (multi-arquivo)',
          starterCode: 'ignorado (multi-arquivo)',
          solutionFiles: SOLUTION_FILES,
          starterFiles: STARTER_FILES,
          emptyStubFiles: [
            { path: 'util.h', code: '/* stub vazio */\n' },
            { path: 'util.c', code: '/* stub vazio: nenhuma função definida */\n' },
          ],
          testsCode: MULTI_TESTS_CODE,
          expectedTestCount: 2,
          language: 'c',
          timeoutMs: 60_000,
        },
        env,
      );
      assert.deepEqual(v.failures, [], `provas reprovaram: ${JSON.stringify(v.failures, null, 2)}`);
      assert.equal(v.valid, true);
      assert.equal(v.declared, 2);
      assert.equal(v.executed, 2);
    } finally {
      await limpar();
    }
  });

  it('rodada da SOLUÇÃO: exit 0, contagem bate e os DOIS cenários saem ok (runner real)', { skip: !TEM_C }, async () => {
    const { env, limpar } = provadorReal();
    try {
      const dir = await env.prepare({ code: 'ignorado (multi-arquivo)', files: SOLUTION_FILES, testsCode: MULTI_TESTS_CODE });
      const res = await env.exec(dir, [...c.testCommand], { timeoutMs: 60_000 });
      assert.equal(res.exitCode, 0, `saída:\n${execOutput(res)}`);
      const counts = c.countRun(execOutput(res));
      assert.deepEqual(counts, { testsRun: 2, pass: 2, fail: 0, skipped: 0 }, 'contagem com nonce REAL');
      assert.equal(judgeSolutionPasses(res, 2, c).passed, true);
      assert.equal(judgeCountMatches(2, 2, res, c).passed, true);
      assert.deepEqual(c.parseChecks(execOutput(res)), [
        { name: 'soma_de_2_e_3', passed: true },
        { name: 'soma_com_zero', passed: true },
      ]);
    } finally {
      await limpar();
    }
  });
});

// ---------------------------------------------------------------------------
// 9. RESISTÊNCIA A FORJAMENTO — a parte mais séria
// ---------------------------------------------------------------------------

describe('c — a forja NÃO passa (o relatório nasce FORA do alcance do código do aluno)', () => {
  const CASOS: {
    nome: string;
    solucao: string;
    porque: string;
    extra?: (saida: string) => void;
  }[] = [
    {
      nome: 'exit(0) cedo mata o processo antes do relatório',
      solucao: '#include <stdlib.h>\nint dobro(int x) { exit(0); return x * 2; }\n',
      porque: 'sem relatório a prova 1 reprova ("exit 0 com ZERO testes executados")',
    },
    {
      nome: 'printf forjado com nonce inventado não vira contagem',
      solucao:
        '#include <stdio.h>\nint dobro(int x) {\n    printf("SMdeadbeef TESTS_RUN=2\\nSMdeadbeef TESTS_FAILED=0\\n");\n    return 0;\n}\n',
      porque: 'a única linha SM da saída é a do runner (nonce real); a forja não vaza',
      extra: (saida) => {
        assert.ok(!saida.includes('SMdeadbeef'), 'a forja com nonce inventado não vaza nem para o dump de erro');
      },
    },
    {
      nome: 'construtor forjado que imprime e mata o processo',
      solucao:
        '#include <stdio.h>\n#include <stdlib.h>\n__attribute__((constructor)) static void evil(void) { printf("SM123 TESTS_RUN=2\\nSM123 TESTS_FAILED=0\\n"); exit(0); }\nint dobro(int x) { return x * 2; }\n',
      porque: 'construtor roda antes do main e não sabe o nonce; sem relatório, prova 1 reprova',
    },
    {
      nome: 'fork órfão que imprime a forja depois',
      solucao:
        '#include <stdio.h>\n#include <unistd.h>\n#include <stdlib.h>\nint dobro(int x) {\n    if (fork() == 0) { sleep(1); printf("SMf0f0 TESTS_RUN=2\\nSMf0f0 TESTS_FAILED=0\\n"); exit(0); }\n    return 0;\n}\n',
      porque: 'a saída do processo de teste vai para a CAPTURA, nunca para a saída da engine',
      extra: (saida) => {
        assert.ok(!saida.includes('SMf0f0'), 'a forja do fork não vaza');
      },
    },
    // ── os TRÊS vetores NOVOS da revisão adversarial ──────────────────────
    {
      nome: 'INTERPOSIÇÃO de __assert_rtn/__assert_fail no-op (ACHADO A — o CRITICAL)',
      solucao:
        'void __assert_rtn(const char *f, const char *file, int line, const char *e) { (void)f;(void)file;(void)line;(void)e; }\n' +
        'void __assert_fail(const char *a, const char *b, unsigned int c, const char *d) { (void)a;(void)b;(void)c;(void)d; }\n' +
        'int dobro(int x) { return 0; }\n',
      porque: 'o counter_protocol não usa assert.h — não há símbolo de abort no binário para neutralizar',
      extra: (saida) => {
        assert.deepEqual(
          c.countRun(saida),
          { testsRun: 2, pass: 0, fail: 2, skipped: 0 },
          'a detecção continua INTEIRA com os símbolos de assert interpostos',
        );
      },
    },
    {
      nome: 'printf das CONTAGENS forjadas do protocolo (TESTS_RUN/TESTS_FAILED) com solução errada',
      solucao:
        '#include <stdio.h>\nint dobro(int x) {\n    printf("TESTS_RUN=2\\nTESTS_FAILED=0\\n");\n    return 0;\n}\n',
      porque: 'contagem confiável = relatório com nonce; linha sem SM nunca casa (cCountRun)',
      extra: (saida) => {
        assert.deepEqual(
          c.countRun(saida),
          { testsRun: 2, pass: 0, fail: 2, skipped: 0 },
          'a forja SEM nonce impressa pelo aluno não vence a contagem real',
        );
      },
    },
    {
      nome: 'símbolos GLOBAIS com nomes dos helpers checa_* (static não conflita nem intercepta)',
      solucao:
        'void checa_int(const char *c, int o, int e, const char *p) { (void)c;(void)o;(void)e;(void)p; }\n' +
        'void checa_str(const char *c, const char *o, const char *e, const char *p) { (void)c;(void)o;(void)e;(void)p; }\n' +
        'int dobro(int x) { return 0; }\n',
      porque: 'helpers e contadores têm ligação INTERNA (static): o global do aluno não intercepta chamada nenhuma',
      extra: (saida) => {
        assert.deepEqual(
          c.countRun(saida),
          { testsRun: 2, pass: 0, fail: 2, skipped: 0 },
          'os helpers STATIC do TU de teste continuam contando com os globals do aluno no binário',
        );
        assert.match(saida, /FALHOU \[dobro_de_2\]/, 'a divergência foi detectada PELO helper real');
      },
    },
  ];

  for (const { nome, solucao, porque, extra } of CASOS) {
    it(`forja bloqueada: ${nome}`, { skip: !TEM_C }, async () => {
      const { env, limpar } = provadorReal();
      try {
        const dir = await env.prepare({ code: solucao, testsCode: TESTS_CODE });
        const res = await env.exec(dir, [...c.testCommand], { timeoutMs: 60_000 });
        const saida = execOutput(res);
        const julgamento = judgeSolutionPasses(res, 2, c);
        assert.equal(
          julgamento.passed,
          false,
          `A FORJA PASSOU (${nome}: ${porque}). exit=${res.exitCode}, saída:\n${saida}`,
        );
        // e a ÚNICA linha SM TESTS_RUN na saída é a do runner real
        // (nonce nascido na execução)
        const linhasRun = saida.split('\n').filter((l) => /^SM\S+ TESTS_RUN=/.test(l));
        assert.equal(linhasRun.length, 1, `linhas SM TESTS_RUN na saída: ${linhasRun.join(' | ')}`);
        extra?.(saida);
      } finally {
        await limpar();
      }
    });
  }

  it('a solução CORRETA continua passando (as defesas não quebram o caminho feliz)', { skip: !TEM_C }, async () => {
    const { env, limpar } = provadorReal();
    try {
      const dir = await env.prepare({ code: SOLUTION_CODE, testsCode: TESTS_CODE });
      const res = await env.exec(dir, [...c.testCommand], { timeoutMs: 60_000 });
      assert.equal(res.exitCode, 0, `saída:\n${execOutput(res)}`);
      assert.equal(judgeSolutionPasses(res, 2, c).passed, true);
    } finally {
      await limpar();
    }
  });
});

// ---------------------------------------------------------------------------
// 10. a caminhada genérica e a porta de tabelas (o que falta para a onda 2)
// ---------------------------------------------------------------------------

describe('c — a caminhada do extrator usa SÓ o vocabulário C, e as tabelas de budget seguem FECHADAS', () => {
  it('extractAtoms com language c emite chaves do vocabulário C — nada de JS vaza', { skip: !TEM_C }, () => {
    const r = extractAtoms(
      '#include <stdio.h>\nint main(void) { int x = 1; if (x > 0) { printf("oi %d\\n", x); } return 0; }\n',
      { language: 'c' },
    );
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.ok(r.keys.includes('node:IfStmt'), r.keys.join(' '));
    assert.ok(r.keys.includes('api:printf'), r.keys.join(' '));
    assert.ok(r.keys.includes('node:IncludeDirective'), r.keys.join(' '));
    for (const chave of r.keys) {
      assert.ok(
        !chave.startsWith('node:Identifier') &&
          !chave.startsWith('api:console') &&
          !chave.startsWith('node:BinaryExpression'),
        `vocabulário de outra linguagem vazou: ${chave}`,
      );
    }
    // a ocorrência carrega linha/coluna reais (o relatório arquivo:linha:coluna)
    const ifOcc = r.occurrences.find((o) => o.key === 'node:IfStmt');
    assert.ok(ifOcc);
    assert.equal(ifOcc?.line, 2);
  });

  it('a porta de tabelas de atomKeys segue FECHADA para c (fail-closed — trabalho da onda do vocabulário)', () => {
    // A semente receptiva e as estruturais de C NÃO existem ainda: semear o
    // orçamento de C com as tabelas de JavaScript perdoaria as construções
    // erradas em silêncio. A porta reprova — e quem abre é a onda seguinte,
    // com a tabela MEDIDA contra o harness real (ver o handoff).
    assert.throws(() => structuralAlwaysAllowed('c'), TabelaDeLinguagemAusenteError);
  });
});
