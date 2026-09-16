/**
 * tests/engineMinimalC.test.ts — o SINTETIZADOR DE SOLUÇÃO MÍNIMA DE C
 * (`engine/quality/minimalC.ts`) e o despachante por linguagem
 * (`engine/quality/minimalPorLinguagem.ts`).
 *
 * O DEFEITO QUE ESTE ARQUIVO TRAVA (onda 4 da trilha C): `npm run engine --
 * coverage c-iniciante` saía exit 2 fail-closed — "não existe sintetizador
 * para c" (`EngineLinguagemError` em `minimalPorLinguagem.ts`, cuja tabela só
 * tinha javascript + python). O sintetizador de C fecha o degrau: lê o teste
 * com o PARSER de C (clang via adaptador — protótipos, blocos `SM_TEST` e
 * verificações `checa_*` do counter_protocol) e GERA TEXTO DE C.
 *
 * Nenhum teste depende de `app/resources/tracks` para o seu ORÁCULO — os
 * `testsCode` usados são da fixture commitada
 * `tests/fixtures/tracks/trilha-c-minima`, pela convenção do repositório
 * (commit 33b0eab: oráculo de teste não pode ser conteúdo de produção). A
 * trilha REAL entra só no teste de subprocesso do CLI
 * (`engineCoverageCliC.test.ts`), que a trata como FIXTURE de leitura.
 *
 * PROVER: os unitários usam um FAKE (nenhum spawn). O último bloco roda o
 * PROVER REAL (`criarProverDeDesafio` — o runner OFICIAL do adaptador de C: o
 * `run.sh` gerado que compila com `cc -std=c11 -g` e roda) e DECLARA a
 * limitação quando não há toolchain na máquina, em vez de passar verde sem
 * ter provado nada (CONTRIBUTING: "se um gate depende de uma ferramenta que
 * falta, ele degrada declarando").
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { cDetect } from '../electron/main/engine/lang/c';
import {
  C_EMPTY_STUB_CODE,
  extrairLiteraisDoTesteC,
  formaDoTesteC,
  gerarCandidatosC,
  sintetizarCodigoMinimoC,
} from '../electron/main/engine/quality/minimalC';
import {
  LINGUAGENS_COM_SINTETIZADOR,
  exigirSintetizadorMinimo,
  sintetizarCodigoMinimoDaLinguagem,
} from '../electron/main/engine/quality/minimalPorLinguagem';
import { criarProverDeDesafio } from '../electron/main/engine/phases/f9Verifier';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';

/** A máquina tem a toolchain de C COMPLETA? (compilador + clang + python3) */
const TEM_C = cDetect().ok;

const DIR_FIXTURE = path.join(__dirname, 'fixtures', 'tracks', 'trilha-c-minima');

interface DesafioFixture {
  starterCode: string;
  solutionCode: string;
  testsCode: string;
  expectedTestCount: number;
}

async function lerDesafio(slug: string): Promise<DesafioFixture> {
  const caminho = path.join(
    DIR_FIXTURE,
    'modules',
    'modulo-1',
    'lessons',
    'a-janela-e-a-caixa',
    'challenges',
    slug,
    'challenge.json',
  );
  return JSON.parse(await fs.readFile(caminho, 'utf8')) as DesafioFixture;
}

/** Prover FAKE que APROVA o primeiro candidato (nenhum spawn). */
function proverQueAprova(vistos: string[]): (i: ChallengeProofsInput) => Promise<ChallengeProofsVerdict> {
  return async (input) => {
    vistos.push(input.solutionCode);
    return { valid: true, failures: [], declared: input.expectedTestCount, executed: input.expectedTestCount };
  };
}

/** Prover FAKE que REPROVA todo candidato (o teste exige mais que literais). */
const proverQueReprova = async (input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => ({
  valid: false,
  failures: [{ proof: 'solutionPasses', passed: false, reason: 'candidato reprovado pelo fake' }],
  declared: input.expectedTestCount,
  executed: 0,
});

/** Prover FAKE cuja INFRA falha sempre (o caso PROVER_FALHOU). */
const proverComFalhaDeInfra = async (): Promise<ChallengeProofsVerdict> => ({
  valid: false,
  failures: [{ proof: 'execError', passed: false, reason: 'boom' }],
  declared: 0,
  executed: 0,
  execError: 'boom de infraestrutura (fake)',
});

// ---------------------------------------------------------------------------
// 1. A LEITURA — protótipos e checa_* do counter_protocol, pelo parser de C
// ---------------------------------------------------------------------------

describe('minimalC — a leitura do teste de C (clang via adaptador)', { skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false }, () => {
  it('a forma de IMPRESSÃO: protótipo tela(void) e checa_str com esperado literal', async () => {
    const d = await lerDesafio('oi-na-tela');
    const r = extrairLiteraisDoTesteC(d.testsCode);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dados.prototipos.length, 1);
    assert.equal(r.dados.prototipos[0].nome, 'tela');
    assert.equal(r.dados.prototipos[0].assinatura, 'void tela(void)');
    assert.deepEqual(r.dados.prototipos[0].params, []);
    assert.equal(r.dados.checas.length, 1);
    assert.equal(r.dados.checas[0].helper, 'checa_str');
    assert.equal(r.dados.checas[0].chamadaAlvo, null, 'o obtido é o buffer linha, não chamada ao aluno');
    assert.equal(r.dados.checas[0].esperadoTexto, '"oi\\n"', 'o literal vem VERBATIM do fonte do teste');
    assert.equal(formaDoTesteC(r.dados), 'impressao');
  });

  it('a forma de VALOR: protótipo com parâmetro e checa_int chamando o aluno', async () => {
    const d = await lerDesafio('o-dobro');
    const r = extrairLiteraisDoTesteC(d.testsCode);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dados.prototipos.length, 1);
    assert.equal(r.dados.prototipos[0].nome, 'dobro');
    assert.deepEqual(r.dados.prototipos[0].params, ['n']);
    assert.equal(r.dados.checas.length, 2);
    assert.equal(r.dados.checas[0].chamadaAlvo, 'dobro');
    assert.deepEqual(r.dados.checas[0].argumentosAlvo, ['2']);
    assert.equal(r.dados.checas[0].esperadoTexto, '4');
    assert.equal(r.dados.checas[1].esperadoTexto, '10');
    assert.equal(formaDoTesteC(r.dados), 'valor');
  });

  it('a ante-sala (SM_COUNT_PREABULO) é OBRIGATÓRIA: sem ela nem o parse começa', async () => {
    // O MESMO testsCode parseia COM a ante-sala (testes acima) e o testsCode
    // sem o protótipo dos helpers não existe "parseado na mão": a prova do
    // fail-closed de parse está no bloco 2 — aqui a prova é a de que a leitura
    // reconhece a macro SM_TEST, que só existe por causa da ante-sala.
    const d = await lerDesafio('oi-na-tela');
    const r = extrairLiteraisDoTesteC(d.testsCode);
    assert.ok(r.ok && r.dados.checas.length === 1);
  });
});

// ---------------------------------------------------------------------------
// 2. A GERAÇÃO — candidatos em C, na ordem de minimalidade
// ---------------------------------------------------------------------------

describe('minimalC — a geração de candidatos (texto de C, zero LLM)', { skip: !TEM_C ? 'toolchain C ausente' : false }, () => {
  it('IMPRESSÃO: um printf único com os literais adjacentes vem primeiro', async () => {
    const d = await lerDesafio('oi-na-tela');
    const r = extrairLiteraisDoTesteC(d.testsCode);
    if (!r.ok) return assert.fail('fixture deveria parsear');
    const candidatos = gerarCandidatosC(d.starterCode, d.solutionCode, r.dados);
    // UM literal só: as duas formas de IMPRIMIR colapsam na mesma string (o
    // `adicionar` deduplica) — e é o mínimo que as provas oficiais aceitam.
    assert.deepEqual(candidatos, ['#include <stdio.h>\n\nvoid tela(void) {\n    printf("oi\\n");\n}\n']);
  });

  it('IMPRESSÃO com 2+ literais: a forma por linha vem DEPOIS da forma única', () => {
    const dados = {
      prototipos: [{ nome: 'tela', assinatura: 'void tela(void)', params: [], start: 0 }],
      checas: [
        { helper: 'checa_str', chamadaAlvo: null, argumentosAlvo: [], esperadoTexto: '"a\\n"', esperadoKind: 'StringLiteral' },
        { helper: 'checa_str', chamadaAlvo: null, argumentosAlvo: [], esperadoTexto: '"b\\n"', esperadoKind: 'StringLiteral' },
      ],
    };
    const candidatos = gerarCandidatosC('', '', dados);
    assert.equal(candidatos[0], '#include <stdio.h>\n\nvoid tela(void) {\n    printf("a\\n" "b\\n");\n}\n');
    assert.equal(candidatos[1], '#include <stdio.h>\n\nvoid tela(void) {\n    printf("a\\n");\n    printf("b\\n");\n}\n');
  });

  it('IMPRESSÃO SEM DEDUP: bordas iguais da janela não são colapsadas (o mínimo falharia no teste que o define)', () => {
    const borda = '"' + '+--+' + '"'; // o literal-fonte "+--+"
    const meio = '"' + '| oi |' + '"';
    const dados = {
      prototipos: [{ nome: 'tela', assinatura: 'void tela(void)', params: [], start: 0 }],
      checas: [
        { helper: 'checa_str', chamadaAlvo: null, argumentosAlvo: [], esperadoTexto: borda, esperadoKind: 'StringLiteral' },
        { helper: 'checa_str', chamadaAlvo: null, argumentosAlvo: [], esperadoTexto: meio, esperadoKind: 'StringLiteral' },
        { helper: 'checa_str', chamadaAlvo: null, argumentosAlvo: [], esperadoTexto: borda, esperadoKind: 'StringLiteral' },
      ],
    };
    const candidatos = gerarCandidatosC('', '', dados);
    // os TRÊS literais aparecem no candidato único, na ordem — inclusive a borda repetida
    assert.match(candidatos[0], /printf\("\+--\+" "\| oi \|" "\+--\+"\);/);
  });

  it('VALOR: literal antes de literal, e a solução de referência é a ÚLTIMA', async () => {
    const d = await lerDesafio('o-dobro');
    const r = extrairLiteraisDoTesteC(d.testsCode);
    if (!r.ok) return assert.fail('fixture deveria parsear');
    const candidatos = gerarCandidatosC(d.starterCode, d.solutionCode, r.dados);
    assert.equal(candidatos[candidatos.length - 1], d.solutionCode, 'a referência é sempre o último candidato');
    assert.equal(candidatos[0], 'int dobro(int n) {\n    return 4;\n}\n');
    assert.equal(candidatos[1], 'int dobro(int n) {\n    return 10;\n}\n');
    // o candidato que NÃO imprime não carrega #include — minimalidade de átomos
    assert.doesNotMatch(candidatos[0], /#include/);
  });

  it('o teto de 8 candidatos é respeitado', async () => {
    const checas = Array.from({ length: 12 }, (_, i) => ({
      helper: 'checa_int',
      chamadaAlvo: 'f',
      argumentosAlvo: [String(i)],
      esperadoTexto: String(i),
      esperadoKind: 'IntegerLiteral',
    }));
    const dados = {
      prototipos: [{ nome: 'f', assinatura: 'int f(int n)', params: ['n'], start: 0 }],
      checas,
    };
    const candidatos = gerarCandidatosC('', '', dados);
    assert.ok(candidatos.length <= 8, `esperado ≤ 8, veio ${candidatos.length}`);
  });
});

// ---------------------------------------------------------------------------
// 3. FAIL-CLOSED — nenhum caminho devolve veredito falso
// ---------------------------------------------------------------------------

describe('minimalC — fail-closed (docs/16 §9.3)', { skip: !TEM_C ? 'toolchain C ausente' : false }, () => {
  it('teste que não parseia como C vira PARSE_FALHOU com linha e coluna', async () => {
    const v = await sintetizarCodigoMinimoC(proverQueAprova([]), {
      starterCode: '',
      solutionCode: 'int f(void) { return 1; }\n',
      testsCode: 'void tela( {\n',
      expectedTestCount: 1,
    });
    assert.equal(v.ok, false);
    if (v.ok) return;
    assert.equal(v.reason, 'PARSE_FALHOU');
    assert.match(v.detail ?? '', /não parseia como C/);
    assert.match(v.detail ?? '', /PARSE_ERROR em \d+:\d+/);
  });

  it('forma desconhecida NÃO cai na solução de referência: SEM_SOLUCAO_ACESSIVEL (nunca "passou")', async () => {
    // O testsCode parseia (TU válido) mas não declara protótipo do aluno nem
    // chama checa_* — a referência NÃO pode entrar como candidato, senão o
    // prover fake a aprovaria e o "mínimo" seria o máximo.
    const v = await sintetizarCodigoMinimoC(proverQueAprova([]), {
      starterCode: 'int f(void) { return 0; }\n',
      solutionCode: 'int f(void) { return 1; }\n',
      testsCode: 'int main(void) { return 0; }\n',
      expectedTestCount: 1,
    });
    assert.equal(v.ok, false);
    if (v.ok) return;
    assert.equal(v.reason, 'SEM_SOLUCAO_ACESSIVEL');
    assert.match(v.detail ?? '', /forma de teste de C não reconhecida/);
  });

  it('nenhum candidato passa nas provas vira SEM_SOLUCAO_ACESSIVEL (sinal honesto, nunca erro)', async () => {
    const d = await lerDesafio('oi-na-tela');
    const v = await sintetizarCodigoMinimoC(proverQueReprova, d);
    assert.equal(v.ok, false);
    if (v.ok) return;
    assert.equal(v.reason, 'SEM_SOLUCAO_ACESSIVEL');
    assert.match(v.detail ?? '', /nenhum dos \d+ candidato/);
  });

  it('falha de INFRA em todas as tentativas vira PROVER_FALHOU (nunca SEM_SOLUCAO)', async () => {
    const d = await lerDesafio('oi-na-tela');
    const v = await sintetizarCodigoMinimoC(proverComFalhaDeInfra, d);
    assert.equal(v.ok, false);
    if (v.ok) return;
    assert.equal(v.reason, 'PROVER_FALHOU');
    assert.match(v.detail ?? '', /boom de infraestrutura/);
  });
});

// ---------------------------------------------------------------------------
// 4. O CONTRATO COM O PROVER — language 'c' e stub vazio de C
// ---------------------------------------------------------------------------

describe('minimalC — o prover recebe a linguagem e o stub certos', { skip: !TEM_C ? 'toolchain C ausente' : false }, () => {
  it('language="c" e emptyStubCode="" (o arquivo vazio é o TU válido; `export {};` é JavaScript)', async () => {
    const d = await lerDesafio('oi-na-tela');
    const recebidos: ChallengeProofsInput[] = [];
    const prover = async (input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => {
      recebidos.push(input);
      return { valid: true, failures: [], declared: 1, executed: 1 };
    };
    await sintetizarCodigoMinimoC(prover, d);
    assert.equal(recebidos.length, 1);
    assert.equal(recebidos[0].language, 'c');
    assert.equal(recebidos[0].emptyStubCode, '');
    assert.equal(C_EMPTY_STUB_CODE, '');
  });

  it('os ÁTOMOS vêm do adaptador de C, e atomsDoTeste é o harness DECLARADO vazio', async () => {
    const d = await lerDesafio('oi-na-tela');
    const vistos: string[] = [];
    const v = await sintetizarCodigoMinimoC(proverQueAprova(vistos), d);
    assert.equal(v.ok, true, 'o candidato mínimo passa nas provas (prover fake)');
    if (!v.ok) return;
    assert.match(v.minimalCode, /printf\("oi\\n"\);/);
    for (const chave of ['api:printf', 'node:IncludeDirective', 'decl:func', 'node:StringLiteral']) {
      assert.ok(v.atoms.includes(chave), `o mínimo de C devia emitir ${chave}: ${v.atoms.join(', ')}`);
    }
    assert.deepEqual(v.atomsDoTeste, [], 'o trecho do teste é o HARNESS do counter_protocol — nunca cobrança');
    assert.equal(v.proofsValid, true);
  });
});

// ---------------------------------------------------------------------------
// 5. O DESPACHANTE — a tabela ganha a linha 'c' sem mexer nos irmãos
// ---------------------------------------------------------------------------

describe('minimalPorLinguagem — o despacho de C', () => {
  it("'c' está na tabela, e os irmãos não saíram dela", () => {
    assert.deepEqual(LINGUAGENS_COM_SINTETIZADOR, ['c', 'javascript', 'python']);
    assert.equal(exigirSintetizadorMinimo('c').name, 'sintetizarCodigoMinimoC');
  });

  it('sintetizarCodigoMinimoDaLinguagem(language: "c") despacha para o sintetizador de C', async () => {
    if (!TEM_C) return; // a extração do sintetizador precisa de clang
    const d = await lerDesafio('oi-na-tela');
    const vistos: string[] = [];
    const v = await sintetizarCodigoMinimoDaLinguagem(proverQueAprova(vistos), { ...d, language: 'c' });
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.match(v.minimalCode, /void tela\(void\)/);
    assert.match(v.minimalCode, /printf/);
  });

  it('linguagem SEM sintetizador continua LANÇANDO EngineLinguagemError (typescript)', () => {
    assert.throws(() => exigirSintetizadorMinimo('typescript'));
  });
});

// ---------------------------------------------------------------------------
// 6. INTEGRAÇÃO — o prover REAL roda o runner OFICIAL de C (compila e roda)
// ---------------------------------------------------------------------------

describe('minimalC — prover REAL (o run.sh gerado compila com cc -std=c11 -g)', { skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false }, () => {
  it('o mínimo da forma de IMPRESSÃO compila e passa nas provas oficiais', async () => {
    const d = await lerDesafio('oi-na-tela');
    const v = await sintetizarCodigoMinimoC(criarProverDeDesafio(), d);
    assert.equal(v.ok, true, `esperado ok, veio: ${JSON.stringify(v)}`);
    if (!v.ok) return;
    assert.equal(
      v.minimalCode,
      '#include <stdio.h>\n\nvoid tela(void) {\n    printf("oi\\n");\n}\n',
    );
    assert.ok(v.atoms.includes('api:printf'));
  });

  it('o mínimo da forma de VALOR com 2 casos distintos é a solução de referência (nada menor passa)', async () => {
    const d = await lerDesafio('o-dobro');
    const v = await sintetizarCodigoMinimoC(criarProverDeDesafio(), d);
    assert.equal(v.ok, true, `esperado ok, veio: ${JSON.stringify(v)}`);
    if (!v.ok) return;
    assert.equal(v.minimalCode, d.solutionCode, 'os literais falham num dos dois casos; a referência é o mínimo');
    assert.ok(v.atoms.includes('op:binary:*'));
  });
});
