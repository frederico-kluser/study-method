/**
 * tests/engineBarra.test.ts — a BARRA PEDAGÓGICA A17–A23 e a FIAÇÃO dela no
 * `audit` (`engine/quality/barra.ts` + `engine/audit.ts`).
 *
 * POR QUE ESTE ARQUIVO EXISTE. Medido em 2026-09-22, sobre o MESMO conteúdo,
 * antes de a barra entrar no gate:
 *
 *   npm run engine -- audit rust-iniciante --limite 0  -> 0 violacoes · 0 avisos · exit 0
 *   npm run engine -- barra rust-iniciante --limite 0  -> 20 erros em 15 aulas · 64 avisos
 *
 * A aula 1 do `rust-iniciante` declara 11 construções novas (6 produtivas + 5
 * receptivas) em UMA seção de teoria, para um aluno cujo `entryCriteria` é
 * "zero absoluto", e saía do gate com zero. O mecanismo que legalizava isso
 * está em `budget.ts:281` (`saida = entrada ∪ introduces`): declarar uma chave
 * a torna legal na própria aula — a aula legaliza o seu próprio penhasco. A
 * barra é a régua do TAMANHO DO PASSO e da EXISTÊNCIA DA DEMONSTRAÇÃO, e este
 * arquivo trava as duas coisas: que cada regra reprova o que diz reprovar, e
 * que o `auditTrack` realmente as CONTA no placar.
 *
 * O que se prova aqui, na ordem:
 *
 *   1. A aula LIMPA sai com ZERO erro — sem isso, todo pin abaixo seria
 *      "a fixture nasce errada", não "a regra reprova".
 *   2. Uma fixture por regra: A17 (6 produtivas), A18 (aula 1 com 2), A19
 *      (chave declarada sem bloco), A20 (aula sem desafio), A21 (11 chaves
 *      novas em 1 seção → carga E seções), A22 (uma forma só, AVISO), A23
 *      (derivada declarada sem co-ocorrência de linha → a chave volta a
 *      contar CHEIA no teto).
 *   3. O ENVELOPE DE FRAGMENTO (`extract.ts`): a teoria de C e de Rust
 *      demonstra em FRAGMENTO (`printf("oi");` solto), e a barra MEDE esse
 *      fragmento — sem isso ela veria zero demonstração e reprovaria todas as
 *      aulas de C e de Rust por A19, que é o falso positivo mais caro possível.
 *   4. O CURSO DE REFERÊNCIA: `python-iniciante` sai com 0 erro de barra
 *      (`npm run engine -- barra python-iniciante --limite 0`).
 *   5. A FIAÇÃO: `auditTrack` mescla os achados em `violations` com a
 *      disciplina da A13–A16 (erro conta no placar, aviso não), `totals`
 *      ganha `errosDaBarra`/`avisosDaBarra`, `metrics[].barra` traz as colunas
 *      do histograma e `report.barra.porRegra` traz as 7 regras. O ESCOPO da
 *      barra é o MODO DO ORÇAMENTO: ela vale em `declared` (as três trilhas do
 *      produto) e é DECLARADA como limitação em `inferred`
 *      (`A17-A23-NAO-RODOU-EM-INFERRED`) — os dois lados estão pinados aqui.
 *   6. A PROVA POR MUTAÇÃO SE INVERTEU: apagar TODOS os blocos de código da
 *      teoria da aula 1 MUDA o placar — era exatamente o contrário que a
 *      limitação `A13-A16-NAO-RODOU` citava (docs/19), e o texto dela mudou
 *      junto com o fato.
 *
 * OFFLINE e determinístico: fixtures em memória (exceto o pin do curso de
 * referência, que lê `resources/tracks/python-iniciante` do disco), nenhum
 * LLM, nenhuma chave de API.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { loadTrack, type LoadedLesson, type LoadedModule, type LoadedTrack } from '../electron/main/content/trackLoader';
import type {
  TrackChallengeLanguage,
  TrackChallengeSource,
  TrackTheorySection,
} from '../electron/main/content/trackTypes';
import type { AtomKey } from '../electron/main/engine/atomKeys';
import {
  auditTrack,
  linhasDeLimitacoes,
  linhasDoPlacarDaBarra,
  type AuditReport,
} from '../electron/main/engine/audit';
import { cDetect } from '../electron/main/engine/lang/c';
import { pythonAdapter } from '../electron/main/engine/lang/python';
import { REGRAS_DA_BARRA, auditarBarra, type RegraDaBarra } from '../electron/main/engine/quality/barra';
import { gerarRelatorio } from '../electron/main/engine/report/report';

const TEM_PYTHON = pythonAdapter.detect().version !== null;
/** C completo = compilador + clang + python3 (o extrator é o mesmo de `engineAuditC`). */
const TEM_C = cDetect().ok;
const TRACKS_DIR = path.resolve(__dirname, '..', 'resources', 'tracks');

// ---------------------------------------------------------------------------
// Fixtures em memória (a forma de `tests/engineAuditLimitacoes.test.ts`)
// ---------------------------------------------------------------------------

function secao(id: string, tag: string, code: string): TrackTheorySection {
  return { id, title: id, markdown: 'a teoria mostra o código', code: { language: tag, code } };
}

/** Seção SEM bloco de código nenhum — o que a mutação deixa no lugar. */
function secaoSemCodigo(id: string): TrackTheorySection {
  return { id, title: id, markdown: 'a teoria ficou SEM nenhum bloco de código' };
}

function desafio(slug: string, language: TrackChallengeLanguage, solution: string, tests: string): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: slug,
    concept: 'conceito',
    difficulty: 1,
    language,
    statement: `# ${slug}`,
    starterCode: '',
    testsCode: tests,
    solutionCode: solution,
    expectedTestCount: 1,
  };
}

interface AulaSpec {
  slug: string;
  secoes: TrackTheorySection[];
  desafios: TrackChallengeSource[];
  productive: AtomKey[];
  receptive?: AtomKey[];
  /** o campo aditivo `introduces.derived` (a regra do par — A23). */
  derived?: unknown;
  role?: string;
}

function aula(spec: AulaSpec): LoadedLesson {
  return {
    meta: {
      schemaVersion: 1,
      slug: spec.slug,
      title: spec.slug,
      summary: spec.slug,
      difficulty: 1,
      concepts: ['conceito'],
      prerequisites: [],
      theory: spec.secoes,
      sources: [],
      challenges: spec.desafios.map((d) => d.slug),
      introduces: {
        productive: spec.productive,
        receptive: spec.receptive ?? [],
        ...(spec.derived !== undefined ? { derived: spec.derived } : {}),
      },
      ...(spec.role !== undefined ? { role: spec.role } : {}),
    } as LoadedLesson['meta'],
    challenges: spec.desafios,
  };
}

function trilha(programmingLanguage: TrackChallengeLanguage, aulas: LoadedLesson[]): LoadedTrack {
  const mod: LoadedModule = {
    meta: { schemaVersion: 1, slug: 'modulo', title: 'modulo', order: 1, lessons: aulas.map((a) => a.meta.slug) },
    lessons: aulas,
    challenge: null,
  };
  return {
    root: {
      schemaVersion: 1,
      slug: 'fixture',
      title: 'fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage,
      modules: [mod.meta.slug],
    },
    modules: [mod],
    proficiency: null,
    dir: '/tmp/fixture',
  };
}

const TESTS_PY = [
  'import unittest',
  '',
  'from solucao import dobro',
  '',
  '',
  'class TestSolucao(unittest.TestCase):',
  '    def test_dobro(self):',
  '        self.assertEqual(dobro(2), 4)',
  '',
].join('\n');

const DESAFIO_PY = desafio('dobrar', 'python', 'def dobro(x):\n    return x * 2\n', TESTS_PY);

/**
 * A AULA LIMPA — 1 produtiva nova (`global:print`), demonstrada em DUAS formas
 * sintáticas distintas, 2 seções de teoria e 1 desafio. É o piso de comparação
 * de todo pin abaixo: se ela não sair com zero erro, os outros fixtures não
 * provam nada sobre as regras.
 */
function aulaLimpa(slug = 'a-primeira-linha'): LoadedLesson {
  return aula({
    slug,
    secoes: [secao('s1', 'python', 'print("oi")\n'), secao('s2', 'python', 'print("bom dia")\n')],
    desafios: [DESAFIO_PY],
    productive: ['global:print'],
  });
}

/** Os achados de UMA regra, na trilha inteira. */
function achadosDe(track: LoadedTrack, regra: RegraDaBarra): ReturnType<typeof auditarBarra>['achados'] {
  return auditarBarra(track, { modo: 'declared' }).achados.filter((a) => a.regra === regra);
}

function metricaDe(track: LoadedTrack, ref: string): ReturnType<typeof auditarBarra>['metricas'][number] {
  const m = auditarBarra(track, { modo: 'declared' }).metricas.find((x) => x.ref === ref);
  assert.ok(m !== undefined, `métrica ausente para ${ref}`);
  return m;
}

// ---------------------------------------------------------------------------
// 1 — o piso: a aula limpa sai com ZERO erro
// ---------------------------------------------------------------------------

describe('barra — o piso de comparação', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('a aula LIMPA (1 produtiva, 2 formas, 2 seções, 1 desafio) sai com 0 erro e 0 aviso', () => {
    const r = auditarBarra(trilha('python', [aulaLimpa()]), { modo: 'declared' });
    assert.deepEqual(
      r.achados.map((a) => `${a.regra}:${a.severidade}`),
      [],
      'a fixture de referência não pode nascer errada',
    );
    assert.equal(r.totais.erros, 0);
    assert.equal(r.totais.blocosQueNaoParseiam, 0);
  });
});

// ---------------------------------------------------------------------------
// 2 — uma fixture por regra
// ---------------------------------------------------------------------------

describe('barra — A17 teto do passo', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('aula com 6 produtivas novas colapsadas reprova por A17 (o teto é 2)', () => {
    const teoria = [
      'def maior(numeros):',
      '    for n in numeros:',
      '        if n > 10:',
      '            print("achei")',
      '    return numeros',
      '',
      'maior([1, 2])',
      '',
    ].join('\n');
    const track = trilha('python', [
      aulaLimpa(),
      aula({
        slug: 'seis-de-uma-vez',
        secoes: [secao('s1', 'python', teoria), secao('s2', 'python', teoria), secao('s3', 'python', teoria)],
        desafios: [DESAFIO_PY],
        productive: ['node:Call', 'node:StrLiteral', 'node:FunctionDef', 'node:Return', 'node:arg', 'node:For'],
      }),
    ]);
    const a17 = achadosDe(track, 'A17');
    assert.equal(a17.length, 1);
    assert.equal(a17[0].ref, 'modulo/seis-de-uma-vez');
    assert.match(a17[0].evidencia, /^6 construções produtivas novas depois do colapso/);
    assert.equal(a17[0].severidade, 'erro');
    assert.equal(a17[0].acao, 'SPLIT_LESSON');
    assert.equal(metricaDe(track, 'modulo/seis-de-uma-vez').produtivasColapsadas, 6);
  });
});

describe('barra — A18 a primeira aula do curso', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('a aula 1 com 2 produtivas novas reprova por A18 (na aula 1 o teto é 1)', () => {
    const track = trilha('python', [
      aula({
        slug: 'duas-na-primeira',
        secoes: [secao('s1', 'python', 'print("oi")\n'), secao('s2', 'python', 'nome = "ana"\nprint(nome)\n')],
        desafios: [DESAFIO_PY],
        productive: ['global:print', 'decl:assign'],
      }),
    ]);
    const a18 = achadosDe(track, 'A18');
    assert.equal(a18.length, 1);
    assert.match(a18[0].evidencia, /^aula 1 da trilha com 2 produtivas novas/);
    assert.match(a18[0].mensagem, /PRIMEIRA aula/);
    assert.equal(a18[0].severidade, 'erro');
  });

  it('…e a MESMA aula, como aula 2, não reprova por A18 (a régua é da posição)', () => {
    const track = trilha('python', [
      aulaLimpa(),
      aula({
        slug: 'duas-na-segunda',
        secoes: [secao('s1', 'python', 'nome = "ana"\nprint(nome)\n'), secao('s2', 'python', 'idade = 7\nprint(idade)\n')],
        desafios: [DESAFIO_PY],
        productive: ['decl:assign', 'node:StrLiteral'],
      }),
    ]);
    assert.deepEqual(achadosDe(track, 'A18'), []);
    assert.deepEqual(achadosDe(track, 'A17'), []);
  });
});

describe('barra — A19 declarar não é demonstrar', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('chave declarada que não aparece em NENHUM bloco de código da aula reprova por A19', () => {
    const track = trilha('python', [
      aulaLimpa(),
      aula({
        slug: 'declarou-e-nao-mostrou',
        secoes: [secao('s1', 'python', 'print("oi")\n'), secao('s2', 'python', 'print("tchau")\n')],
        desafios: [DESAFIO_PY],
        productive: ['node:If'],
      }),
    ]);
    const a19 = achadosDe(track, 'A19');
    assert.equal(a19.length, 1);
    assert.equal(a19[0].chave, 'node:If');
    assert.match(a19[0].evidencia, /não aparece em nenhum dos 2 bloco\(s\) `python`/);
    assert.equal(metricaDe(track, 'modulo/declarou-e-nao-mostrou').chavesSemDemonstracao, 1);
  });

  it('…e a mesma chave DEMONSTRADA na teoria da aula não reprova', () => {
    const track = trilha('python', [
      aulaLimpa(),
      aula({
        slug: 'mostrou',
        secoes: [
          secao('s1', 'python', 'if 1 > 0:\n    print("sim")\n'),
          secao('s2', 'python', 'if 2 > 5:\n    print("nao")\n'),
        ],
        desafios: [DESAFIO_PY],
        productive: ['node:If'],
      }),
    ]);
    assert.deepEqual(achadosDe(track, 'A19'), []);
  });
});

describe('barra — A20 aula sem prova', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('aula com `challenges[]` vazio reprova por A20, em QUALQUER role', () => {
    for (const role of ['regular', 'consolidation', 'integration']) {
      const track = trilha('python', [
        aulaLimpa(),
        aula({
          slug: `sem-desafio-${role}`,
          secoes: [secao('s1', 'python', 'print("oi")\n'), secao('s2', 'python', 'print("ola")\n')],
          desafios: [],
          productive: ['node:StrLiteral'],
          role,
        }),
      ]);
      const a20 = achadosDe(track, 'A20');
      assert.equal(a20.length, 1, role);
      assert.match(a20[0].evidencia, new RegExp(`aula \`role: ${role}\` com \`challenges\\[\\]\` vazio`));
      assert.equal(a20[0].acao, 'ADD_TEST');
    }
  });

  it('aula `regular` que não introduz construção nenhuma também reprova por A20', () => {
    const track = trilha('python', [
      aulaLimpa(),
      aula({
        slug: 'sem-passo',
        secoes: [secao('s1', 'python', 'print("oi")\n'), secao('s2', 'python', 'print("ola")\n')],
        desafios: [DESAFIO_PY],
        productive: [],
      }),
    ]);
    const a20 = achadosDe(track, 'A20');
    assert.equal(a20.length, 1);
    assert.match(a20[0].mensagem, /consolidation/);
  });
});

describe('barra — A21 carga de novidade', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('11 chaves novas em 1 seção reprova DUAS vezes: a carga e as seções que ela exigiria', () => {
    // A forma exata do penhasco da aula 1 do `rust-iniciante`, em Python:
    // 6 produtivas + 5 receptivas, numa seção de teoria só.
    const teoria = [
      'def maior(numeros):',
      '    for n in numeros:',
      '        if n > 10:',
      '            print("achei")',
      '    return numeros',
      '',
      'maior([1, 2])',
      '',
    ].join('\n');
    const track = trilha('python', [
      aulaLimpa(),
      aula({
        slug: 'penhasco',
        secoes: [secao('s1', 'python', teoria)],
        desafios: [DESAFIO_PY],
        // `global:print` FICA DE FORA de propósito: a aula 1 já o introduziu, e o
        // que a barra conta é o que esta aula ACRESCENTA ao orçamento cumulativo.
        productive: ['node:Call', 'node:StrLiteral', 'node:FunctionDef', 'node:Return', 'node:arg', 'node:IntLiteral'],
        receptive: ['node:If', 'node:For', 'node:Compare', 'op:compare:>', 'node:List'],
      }),
    ]);
    const a21 = achadosDe(track, 'A21');
    assert.equal(a21.length, 2, 'a carga E a contagem de seções são dois achados');
    assert.match(a21[0].evidencia, /^11 chaves novas \(produtivas \+ receptivas, colapsadas\)/);
    assert.match(a21[1].evidencia, /^1 seção\(ões\) de teoria para 11 construção\(ões\) nova\(s\)/);
    assert.match(a21[1].mensagem, /ao menos 6 seções de teoria/);
    assert.equal(metricaDe(track, 'modulo/penhasco').novasTotais, 11);
  });
});

describe('barra — A22 duas formas (AVISO, nunca erro)', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('produtiva nova demonstrada em UMA forma só vira AVISO com contagem', () => {
    const track = trilha('python', [
      aula({
        slug: 'uma-forma-so',
        secoes: [secao('s1', 'python', 'print("oi")\n'), secao('s2', 'python', 'print("oi")\n')],
        desafios: [DESAFIO_PY],
        productive: ['global:print'],
      }),
    ]);
    const a22 = achadosDe(track, 'A22');
    assert.equal(a22.length, 1);
    assert.equal(a22[0].severidade, 'aviso');
    assert.equal(auditarBarra(track, { modo: 'declared' }).totais.erros, 0, 'aviso NÃO é erro');
    assert.equal(metricaDe(track, 'modulo/uma-forma-so').chavesComUmaFormaSo, 1);
  });
});

describe('barra — A23 a regra do par, medida no disco', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  /** `print("oi")` emite as três chaves NA MESMA LINHA — a derivada é legítima. */
  function comCoocorrencia(): LoadedTrack {
    return trilha('python', [
      aula({
        slug: 'derivadas-de-verdade',
        secoes: [secao('s1', 'python', 'print("oi")\n'), secao('s2', 'python', 'print("bom dia")\n')],
        desafios: [DESAFIO_PY],
        productive: ['global:print', 'node:Call', 'node:StrLiteral'],
        derived: [
          { chave: 'node:Call', de: 'global:print' },
          { chave: 'node:StrLiteral', de: 'global:print' },
        ],
      }),
    ]);
  }

  /** As mesmas três chaves, mas em LINHAS DIFERENTES — a derivada não se sustenta. */
  function semCoocorrencia(): LoadedTrack {
    const teoria = 'mensagem = "oi"\nprint(mensagem)\n';
    return trilha('python', [
      aula({
        slug: 'derivadas-declaradas-no-ar',
        secoes: [secao('s1', 'python', teoria), secao('s2', 'python', 'outra = "ola"\nprint(outra)\n')],
        desafios: [DESAFIO_PY],
        productive: ['global:print', 'node:Call', 'node:StrLiteral'],
        derived: [{ chave: 'node:StrLiteral', de: 'global:print' }],
      }),
    ]);
  }

  it('derivada com co-ocorrência de linha COLAPSA: 3 produtivas viram 1, e nada reprova', () => {
    const track = comCoocorrencia();
    assert.deepEqual(achadosDe(track, 'A23'), []);
    const m = metricaDe(track, 'modulo/derivadas-de-verdade');
    assert.equal(m.produtivasNovas, 3);
    assert.equal(m.produtivasColapsadas, 1);
    assert.deepEqual(achadosDe(track, 'A18'), [], 'colapsada, a aula 1 cabe no teto de 1 produtiva');
  });

  it('derivada declarada SEM co-ocorrência reprova por A23 — e a chave volta a contar CHEIA', () => {
    const track = semCoocorrencia();
    const a23 = achadosDe(track, 'A23');
    assert.equal(a23.length, 1);
    assert.equal(a23[0].chave, 'node:StrLiteral');
    assert.match(a23[0].evidencia, /nenhuma linha de bloco desta aula tem node:StrLiteral e global:print juntas/);
    const m = metricaDe(track, 'modulo/derivadas-declaradas-no-ar');
    assert.equal(m.produtivasNovas, 3);
    assert.equal(m.produtivasColapsadas, 3, 'sem prova de co-ocorrência, o colapso não acontece');
    assert.equal(achadosDe(track, 'A17').length, 1, 'e o teto do passo reprova as 3');
  });

  it('derivada com pai FORA do declarado reprova por A23 (não se colapsa contra o que não é da aula)', () => {
    const track = trilha('python', [
      aula({
        slug: 'pai-de-fora',
        secoes: [secao('s1', 'python', 'print("oi")\n'), secao('s2', 'python', 'print("ola")\n')],
        desafios: [DESAFIO_PY],
        productive: ['global:print'],
        derived: [{ chave: 'global:print', de: 'global:input' }],
      }),
    ]);
    const a23 = achadosDe(track, 'A23');
    assert.equal(a23.length, 1);
    assert.match(a23[0].mensagem, /derivada e pai precisam estar os DOIS/);
  });
});

// ---------------------------------------------------------------------------
// 3 — o ENVELOPE DE FRAGMENTO: a teoria de C e de Rust demonstra em fragmento
// ---------------------------------------------------------------------------

describe('barra — o fragmento da teoria de C é MEDIDO (envelope de fragmento)', {
  skip: !TEM_C ? 'toolchain C ausente (clang/python3/extrator)' : false,
}, () => {
  it('`printf("oi");` solto na teoria conta como demonstração — sem envelope, seria A19 em toda aula de C', () => {
    const testsC = ['int dobro(int x);', '', 'SM_TEST(dobro_de_2) {', '    checa_int("dobro de 2", dobro(2), 4, "ok");', '}'].join('\n');
    const track = trilha('c', [
      aula({
        slug: 'a-primeira-saida',
        secoes: [secao('s1', 'c', 'printf("oi");\n'), secao('s2', 'c', 'printf("bom dia");\n')],
        desafios: [desafio('dobrar', 'c', 'int dobro(int x) {\n    return 2 * x;\n}\n', testsC)],
        productive: ['api:printf'],
      }),
    ]);
    const r = auditarBarra(track, { modo: 'declared' });
    assert.deepEqual(r.achados.map((a) => `${a.regra}:${a.chave}`), [], 'o fragmento demonstra: nada a reprovar');
    const m = r.metricas[0];
    assert.equal(m.blocosDeCodigo, 2, 'os dois blocos `c` da teoria foram lidos');
    assert.equal(m.chavesSemDemonstracao, 0);
    assert.equal(r.totais.blocosQueNaoParseiam, 0, 'fragmento que não parseia entraria como erro A19 (fail-closed)');
  });
});

describe('barra — o fragmento da teoria de Rust é MEDIDO (envelope de fragmento)', () => {
  it('`println!("oi");` solto na teoria conta como demonstração', () => {
    const testsRs = ['#[test]', 'fn dobro_de_2() {', '    assert_eq!(dobro(2), 4);', '}'].join('\n');
    const track = trilha('rust', [
      aula({
        slug: 'a-primeira-saida',
        secoes: [secao('s1', 'rust', 'println!("oi");\n'), secao('s2', 'rust', 'println!("bom dia");\n')],
        desafios: [desafio('dobrar', 'rust', 'pub fn dobro(x: i32) -> i32 {\n    2 * x\n}\n', testsRs)],
        productive: ['api:println!'],
      }),
    ]);
    const r = auditarBarra(track, { modo: 'declared' });
    assert.deepEqual(r.achados.map((a) => `${a.regra}:${a.chave}`), []);
    const m = r.metricas[0];
    assert.equal(m.blocosDeCodigo, 2);
    assert.equal(m.chavesSemDemonstracao, 0);
    assert.equal(r.totais.blocosQueNaoParseiam, 0);
  });
});

// ---------------------------------------------------------------------------
// 4 — o curso de REFERÊNCIA (o único pin que lê o disco)
// ---------------------------------------------------------------------------

describe('barra — o curso de referência', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('`python-iniciante` sai com 0 ERRO de barra (npm run engine -- barra python-iniciante --limite 0)', async () => {
    const track = await loadTrack(path.join(TRACKS_DIR, 'python-iniciante'));
    const r = auditarBarra(track);
    const porRegra = r.achados
      .filter((a) => a.severidade === 'erro')
      .map((a) => `${a.regra} ${a.ref} ${a.chave ?? ''} — ${a.evidencia}`);
    assert.deepEqual(porRegra, [], 'o curso que o dono considera bom é o piso da barra');
    assert.equal(r.totais.blocosQueNaoParseiam, 0);
    assert.ok(r.totais.aulas >= 100, `a trilha de referência tem ${r.totais.aulas} aulas medidas`);
  });
});

// ---------------------------------------------------------------------------
// 5 — A FIAÇÃO no `auditTrack`
// ---------------------------------------------------------------------------

/** A trilha com penhasco: aula 1 com 3 produtivas novas, 1 seção e sem desafio. */
function trilhaComPenhasco(): LoadedTrack {
  return trilha('python', [
    aula({
      slug: 'penhasco-na-aula-1',
      secoes: [secao('s1', 'python', 'nome = "ana"\nprint(nome)\n')],
      desafios: [],
      productive: ['global:print', 'decl:assign', 'node:StrLiteral', 'node:If'],
    }),
  ]);
}

describe('audit — a barra está FIADA no gate principal', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('os achados da barra viram `violations` com o formato completo da violação', () => {
    const report = auditTrack(trilhaComPenhasco(), { mode: 'declared' });
    const daBarra = report.violations.filter((v) => (REGRAS_DA_BARRA as readonly string[]).includes(v.regra));
    assert.ok(daBarra.length > 0, 'a trilha com penhasco tem de produzir achado de barra');
    for (const v of daBarra) {
      assert.equal(v.arquivo, 'modules/modulo/lessons/penhasco-na-aula-1/lesson.json');
      assert.equal(v.ref, 'modulo/penhasco-na-aula-1');
      assert.ok(v.campo === 'lesson' || v.campo === 'theory', v.campo);
      assert.equal(v.linha, 1, 'a barra mede a AULA, não um ponto do arquivo');
      assert.equal(v.coluna, 1);
      assert.equal(v.faixa, null, 'a barra não confronta superfície contra faixa de orçamento');
      assert.ok(v.trechoOfensor.length > 0, 'a evidência vem antes do veredito (§6.3)');
      assert.match(v.mensagem, /acao prescrita: (SPLIT_LESSON|REWRITE_IN_BUDGET|ADD_TEST|INSERT_INTERMEDIATE|DECLARE_INTEGRATIVE)$/);
      if (v.construcao !== null) {
        assert.equal(v.eixo, v.construcao.split(':')[0]);
        assert.notEqual(
          v.primeiraAulaQueEnsina,
          null,
          'chave declarada na aula TEM aula dona: `null` seria lacuna de currículo inventada',
        );
      }
    }
    assert.equal(report.totals.lacunasDeCurriculo, 0, 'a barra não inventa lacuna de currículo');
  });

  it('o placar conta a barra: `errosDaBarra` bate com a barra rodada sozinha, e erro reprova', () => {
    const track = trilhaComPenhasco();
    const sozinha = auditarBarra(track, { modo: 'declared' });
    const report = auditTrack(track, { mode: 'declared' });
    assert.equal(report.totals.errosDaBarra, sozinha.totais.erros);
    assert.equal(report.totals.avisosDaBarra, sozinha.totais.avisos);
    assert.ok(sozinha.totais.erros > 0);
    assert.ok(
      (report.totals.violacoes ?? 0) >= sozinha.totais.erros,
      'todo erro de barra entra no contador de violações do placar',
    );
    assert.equal(report.metrics[0].violacoes >= sozinha.totais.erros, true);
  });

  it('o AVISO A22 não reprova: entra em `avisos`, nunca em `violacoes`', () => {
    const track = trilha('python', [
      aula({
        slug: 'uma-forma-so',
        secoes: [secao('s1', 'python', 'print("oi")\n'), secao('s2', 'python', 'print("oi")\n')],
        desafios: [DESAFIO_PY],
        productive: ['global:print'],
      }),
    ]);
    const report = auditTrack(track, { mode: 'declared' });
    assert.equal(report.totals.errosDaBarra, 0);
    assert.equal(report.totals.avisosDaBarra, 1);
    assert.equal(report.violations.filter((v) => v.regra === 'A22').every((v) => v.severidade === 'aviso'), true);
  });

  it('`metrics[].barra` traz as colunas do histograma que a barra mede', () => {
    const report = auditTrack(trilhaComPenhasco(), { mode: 'declared' });
    const m = report.metrics[0].barra;
    assert.ok(m !== undefined, 'orçamento `declared`: a barra mediu esta aula');
    assert.equal(m.produtivasNovas, 4);
    assert.equal(m.produtivasColapsadas, 4);
    assert.equal(m.secoesDeTeoria, 1);
    assert.equal(m.blocosDeCodigo, 1);
    assert.equal(m.chavesSemDemonstracao, 1, '`node:If` foi declarada e nunca mostrada');
    assert.ok(m.gruposDaRegraDoPar >= 1, 'os grupos são o insumo do planejador da quebra');
  });

  it('`report.barra.porRegra` traz TODAS as regras do catálogo, inclusive as que deram zero', () => {
    const report = auditTrack(trilhaComPenhasco(), { mode: 'declared' });
    assert.ok(report.barra !== undefined);
    assert.deepEqual(report.barra.porRegra.map((r) => r.regra), [...REGRAS_DA_BARRA]);
    const soma = report.barra.porRegra.reduce((t, r) => t + r.erros, 0);
    assert.equal(soma, report.barra.erros, 'o total por regra fecha com o total');
  });

  it('`linhasDoPlacarDaBarra` escreve o placar por regra, com o comando que o reproduz', () => {
    const texto = linhasDoPlacarDaBarra(auditTrack(trilhaComPenhasco(), { mode: 'declared' })).join('\n');
    assert.match(texto, new RegExp(`BARRA PEDAGOGICA ${REGRAS_DA_BARRA[0]}-${REGRAS_DA_BARRA[REGRAS_DA_BARRA.length - 1]}`));
    for (const regra of REGRAS_DA_BARRA) assert.match(texto, new RegExp(`${regra} `));
    assert.match(texto, /reproduz: npm run engine -- barra fixture --limite 0/);
  });

  it('…e devolve [] num relatório que não tem a seção (nunca zeros que ninguém mediu)', () => {
    const semBarra: AuditReport = {
      trackSlug: 'fixture',
      budgetSource: 'declared',
      violations: [],
      metrics: [],
      totals: {
        aulas: 0,
        desafios: 0,
        desafiosComViolacao: 0,
        violacoes: 0,
        lacunasDeCurriculo: 0,
        aulasSemConstrucaoNova: 0,
      },
      hygiene: [],
      parseErrors: [],
      limitacoes: [],
    };
    assert.deepEqual(linhasDoPlacarDaBarra(semBarra), []);
  });
});

describe('audit — o ESCOPO da barra é o modo do orçamento', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  /** A MESMA trilha, sem `introduces` declarado — o orçamento sai `inferred`. */
  function trilhaSemDeclaracao(): LoadedTrack {
    const semIntroduces = aula({
      slug: 'penhasco-na-aula-1',
      secoes: [secao('s1', 'python', 'nome = "ana"\nprint(nome)\n')],
      desafios: [],
      productive: [],
    });
    delete (semIntroduces.meta as unknown as Record<string, unknown>).introduces;
    return trilha('python', [semIntroduces]);
  }

  it('em `inferred` a barra NÃO roda, e a checagem não executada é DECLARADA', () => {
    const report = auditTrack(trilhaSemDeclaracao());
    assert.equal(report.budgetSource, 'inferred');
    assert.equal(report.barra, undefined, 'ausente = NÃO MEDIDO, nunca zero');
    assert.equal(report.totals.errosDaBarra, undefined);
    assert.equal(report.totals.avisosDaBarra, undefined);
    assert.equal(report.metrics[0].barra, undefined);
    const lim = report.limitacoes.find((l) => l.id === 'A17-A23-NAO-RODOU-EM-INFERRED');
    assert.ok(lim !== undefined, 'a limitação tem de estar declarada (docs/16 §9.2)');
    assert.match(lim.motivo, /A19 é VAZIA por construção/);
    assert.match(lim.motivo, /A23 é INDECLARÁVEL/);
    assert.match(lim.consequencia, /--modo declared/, 'a limitação diz QUAL comando mede');
    assert.equal(report.totals.checagensNaoExecutadas, report.limitacoes.length);
    assert.deepEqual(linhasDoPlacarDaBarra(report), [], 'sem medição, sem linhas de placar');
  });

  it('…e a MESMA trilha com `introduces` declarado é medida pela barra', () => {
    const report = auditTrack(trilhaComPenhasco(), { mode: 'declared' });
    assert.equal(report.budgetSource, 'declared');
    assert.ok(report.barra !== undefined);
    assert.ok((report.totals.errosDaBarra ?? 0) > 0);
    assert.equal(
      report.limitacoes.some((l) => l.id === 'A17-A23-NAO-RODOU-EM-INFERRED'),
      false,
      'a barra rodou: nada a declarar sobre ela',
    );
  });
});

// ---------------------------------------------------------------------------
// 6 — a PROVA POR MUTAÇÃO se inverteu, e a limitação declarada diz a verdade nova
// ---------------------------------------------------------------------------

describe('audit — a mutação que ANTES não mudava nada', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  /** A MESMA aula, com e sem os blocos de código da teoria (o resto idêntico). */
  function comTeoria(temCodigo: boolean): LoadedTrack {
    return trilha('python', [
      aula({
        slug: 'a-primeira-linha',
        secoes: temCodigo
          ? [secao('s1', 'python', 'print("oi")\n'), secao('s2', 'python', 'print("bom dia")\n')]
          : [secaoSemCodigo('s1'), secaoSemCodigo('s2')],
        desafios: [DESAFIO_PY],
        productive: ['global:print'],
      }),
    ]);
  }

  it('apagar TODOS os blocos de código da teoria da aula 1 AGORA muda o placar', () => {
    const antes = auditTrack(comTeoria(true), { mode: 'declared' });
    const depois = auditTrack(comTeoria(false), { mode: 'declared' });
    assert.equal(antes.totals.errosDaBarra, 0);
    assert.ok(
      (depois.totals.violacoes ?? 0) > (antes.totals.violacoes ?? 0),
      'era exatamente esta prova por mutação que a limitação A13-A16-NAO-RODOU citava como IMUNE',
    );
    assert.ok((depois.totals.errosDaBarra ?? 0) > 0);
    const regras = new Set(depois.violations.map((v) => v.regra));
    assert.ok(regras.has('A18'), 'na aula 1, a chave sem demonstração é A18');
  });

  it('a limitação `A13-A16-NAO-RODOU` continua declarada, e o texto conta a verdade NOVA', () => {
    const r = auditTrack(comTeoria(true), { mode: 'declared' });
    assert.equal(r.limitacoes.length, 1);
    const lim = r.limitacoes[0];
    assert.equal(lim.id, 'A13-A16-NAO-RODOU');
    assert.match(lim.motivo, /javascript-only/, 'a história não foi apagada: a bateria continua javascript-only');
    assert.match(lim.consequencia, /A17–A23/, 'a barra cobre parte do buraco, e isso é dito');
    assert.match(lim.consequencia, /JÁ NÃO VALE/, 'a prova por mutação citada deixou de valer');
    for (const naoCoberta of ['A14b', 'A15a/A15b', 'A16b', 'S13']) {
      assert.ok(lim.consequencia.includes(naoCoberta), `a limitação precisa nomear o que a barra NÃO cobre: ${naoCoberta}`);
    }
    assert.match(lim.consequencia, /avisos/);
    assert.match(lim.consequencia, /novosVerdadeiros/);
    // o formatador continua imprimindo a limitação inteira
    assert.match(linhasDeLimitacoes(r).join('\n'), /\[A13-A16-NAO-RODOU\]/);
  });
});

// ---------------------------------------------------------------------------
// 7 — o RELATÓRIO (report.json) herda a barra sem redigitar número
// ---------------------------------------------------------------------------

describe('report — a barra chega ao relatório pelo audit', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  it('erro de barra REPROVA o veredito e a justificativa explica o placar de desafios', () => {
    const auditReport = auditTrack(trilhaComPenhasco(), { mode: 'declared' });
    const rel = gerarRelatorio({ auditReport });
    assert.equal(rel.veredito, 'reprovado');
    // a FAIXA é a do catálogo (`REGRAS_DA_BARRA`), não uma string cravada —
    // a barra ganhou A24 em 2026-09-22 e o texto acompanhou.
    assert.match(
      rel.justificativa,
      new RegExp(`Barra pedagógica ${REGRAS_DA_BARRA[0]}–${REGRAS_DA_BARRA[REGRAS_DA_BARRA.length - 1]}`),
    );
    assert.match(rel.justificativa, /npm run engine -- barra fixture --limite 0/);
    assert.match(rel.justificativa, /o placar conta DESAFIO/);
    // as violações da barra viajam inteiras para o relatório (formato §5.5)
    const daBarra = rel.violacoes_orcamento.filter((v) => v.campo === 'lesson' || v.campo === 'theory');
    assert.ok(daBarra.length > 0);
  });
});
