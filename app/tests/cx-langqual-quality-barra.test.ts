/**
 * tests/cx-langqual-quality-barra.test.ts — CARACTERIZAÇÃO (golden master) da
 * BARRA PEDAGÓGICA A17–A24 (`engine/quality/barra.ts`). Rede de segurança para
 * a refatoração.
 *
 * Contratos que mordem aqui — os LIMIARES EXATOS, um a um:
 *   - A17: no máximo TETO_PRODUTIVAS_NOVAS=2 produtivas novas por aula
 *     (EXATAS 2 passam; 3 reprovam) — depois do colapso da regra do par;
 *   - A18: a aula 1 tem teto PRÓPRIO (TETO_PRODUTIVAS_NOVAS_AULA_1=1: 1 passa,
 *     2 reprovam) e toda chave dela exige demonstração;
 *   - A19: declarar não é demonstrar (chave sem bloco da aula ⇒ erro; bloco
 *     que não parseia ⇒ erro fail-closed, conta em blocosQueNaoParseiam);
 *   - A20: aula sem desafio é aula sem prova (qualquer `role`); e aula
 *     `regular` sem construção nova NENHUMA é reforço não declarado (a
 *     `consolidation` escapa DESTE segundo prazo);
 *   - A21: no máximo TETO_NOVAS_TOTAL=4 novas no total (5 reprovam) e seções ≥
 *     max(MINIMO_SECOES_DE_TEORIA=2, ceil(novas/2)) — o limiar exato de
 *     seções é medido aqui também;
 *   - A22: MINIMO_FORMAS_POR_CHAVE=2 formas sintáticas por chave produtiva
 *     (1 forma ⇒ AVISO, 2 formas ⇒ silêncio);
 *   - A23: `introduces.derived` só colapsa com pai declarado E co-ocorrência de
 *     LINHA; sem co-ocorrência ⇒ erro e a chave volta a contar CHEIA;
 *     entrada malformada ⇒ erro;
 *   - A24: com ≥2 afirmações TODAS vazando FORTE (correta > segunda +
 *     FOLGA_DE_COMPRIMENTO_DO_QUIZ=8, estrito) ⇒ ERRO; vazamento fraco
 *     (correta mais longa, excesso ≤ 8) ⇒ AVISO por afirmação; empate no topo
 *     não conta.
 * E o piso: a aula LIMPA sai com ZERO achado (sem isso, todo pin acima seria
 * "a fixture nasce errada").
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type {
  TrackChallengeLanguage,
  TrackChallengeSource,
  TrackTheorySection,
} from '../electron/main/content/trackTypes';
import type { AtomKey } from '../electron/main/engine/atomKeys';
import { pythonAdapter } from '../electron/main/engine/lang/python';
import {
  TETO_PRODUTIVAS_NOVAS,
  TETO_PRODUTIVAS_NOVAS_AULA_1,
  TETO_NOVAS_TOTAL,
  MINIMO_SECOES_DE_TEORIA,
  MINIMO_FORMAS_POR_CHAVE,
  FOLGA_DE_COMPRIMENTO_DO_QUIZ,
  REGRAS_DA_BARRA,
  agruparPorLinha,
  auditarBarra,
  type RegraDaBarra,
} from '../electron/main/engine/quality/barra';

const TEM_PYTHON = pythonAdapter.detect().version !== null;

// ---------------------------------------------------------------------------
// Fixtures em memória (a forma de tests/engineBarra.test.ts, independentes)
// ---------------------------------------------------------------------------

function secao(id: string, tag: string, code: string): TrackTheorySection {
  return { id, title: id, markdown: 'a teoria mostra o código', code: { language: tag, code } };
}

function desafio(slug: string): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: slug,
    concept: 'conceito',
    difficulty: 1,
    language: 'python' as TrackChallengeLanguage,
    statement: `# ${slug}`,
    starterCode: '',
    testsCode: 'from solucao import dobro\n',
    solutionCode: 'def dobro(x):\n    return x * 2\n',
    expectedTestCount: 1,
  };
}

interface AulaSpec {
  slug: string;
  secoes: TrackTheorySection[];
  desafios?: TrackChallengeSource[];
  productive: AtomKey[];
  receptive?: AtomKey[];
  derived?: unknown;
  role?: string;
  assertions?: unknown[];
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
      challenges: (spec.desafios ?? []).map((d) => d.slug),
      introduces: {
        productive: spec.productive,
        receptive: spec.receptive ?? [],
        ...(spec.derived !== undefined ? { derived: spec.derived } : {}),
      },
      ...(spec.role !== undefined ? { role: spec.role } : {}),
      ...(spec.assertions !== undefined ? { assertions: spec.assertions } : {}),
    } as LoadedLesson['meta'],
    challenges: spec.desafios ?? [],
  };
}

function trilha(aulas: LoadedLesson[]): LoadedTrack {
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
      programmingLanguage: 'python' as TrackChallengeLanguage,
      modules: [mod.meta.slug],
    },
    modules: [mod],
    proficiency: null,
    dir: '/tmp/fixture',
  };
}

/** `print("oi")` emite global:print + node:Call + node:StrLiteral na MESMA linha. */
const TEORIA_PRINT = 'print("oi")\n';

/** A aula LIMPA: 1 produtiva, 2 formas, 2 seções, 1 desafio — o piso. */
function aulaLimpa(slug = 'a-limpa'): LoadedLesson {
  return aula({
    slug,
    secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', 'print("bom dia")\n')],
    desafios: [desafio('d1')],
    productive: ['global:print'],
  });
}

function achadosDe(track: LoadedTrack, regra: RegraDaBarra) {
  return auditarBarra(track, { modo: 'declared' }).achados.filter((a) => a.regra === regra);
}

describe('barra — (0) os limiares são um número só, e a aula limpa é o piso', () => {
  it('constantes dos tetos/folgas/regras são as do contrato pinadas', () => {
    assert.equal(TETO_PRODUTIVAS_NOVAS, 2);
    assert.equal(TETO_PRODUTIVAS_NOVAS_AULA_1, 1);
    assert.equal(TETO_NOVAS_TOTAL, 4);
    assert.equal(MINIMO_SECOES_DE_TEORIA, 2);
    assert.equal(MINIMO_FORMAS_POR_CHAVE, 2);
    assert.equal(FOLGA_DE_COMPRIMENTO_DO_QUIZ, 8);
    assert.deepEqual([...REGRAS_DA_BARRA], ['A17', 'A18', 'A19', 'A20', 'A21', 'A22', 'A23', 'A24']);
  });

  it('a aula LIMPA sai com ZERO achado (o piso de comparação)', { skip: TEM_PYTHON ? false : 'python3 ausente' }, () => {
    const r = auditarBarra(trilha([aulaLimpa()]), { modo: 'declared' });
    assert.deepEqual(r.achados, []);
    assert.equal(r.trackSlug, 'fixture');
    assert.equal(r.adapterId, 'python');
    assert.equal(r.budgetSource, 'declared');
    assert.deepEqual(r.totais, { aulas: 1, erros: 0, avisos: 0, aulasComErro: 0, blocosQueNaoParseiam: 0 });
  });
});

describe('barra — limiar EXATO do A17 (teto de produtivas novas)', { skip: TEM_PYTHON ? false : 'python3 ausente' }, () => {
  // ATENÇÃO: o orçamento é CUMULATIVO (a entrada da aula N traz o que as
  // anteriores introduziram) — por isso cada caso limiar vive na SUA trilha,
  // com chaves FRESCAS (fora do axioma do harness de Python).
  it('EXATAMENTE 2 produtivas novas passa; 3 reprova (o teto é 2, depois do colapso)', () => {
    const duas = aula({
      slug: 'duas',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['node:While', 'node:For'],
    });
    const tres = aula({
      slug: 'tres',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['node:While', 'node:For', 'node:If'],
    });
    assert.deepEqual(achadosDe(trilha([aulaLimpa(), duas]), 'A17'), []);
    const a17 = achadosDe(trilha([aulaLimpa(), tres]), 'A17');
    assert.equal(a17.length, 1);
    assert.equal(a17[0].ref, 'modulo/tres');
    assert.match(a17[0].evidencia, /^3 construções produtivas novas depois do colapso/);
  });
});

describe('barra — limiar EXATO do A18 (a aula 1 tem teto próprio)', { skip: TEM_PYTHON ? false : 'python3 ausente' }, () => {
  it('aula 1 com 1 produtiva passa; com 2 reprova (o teto dela é 1)', () => {
    const uma = aula({
      slug: 'primeira-uma',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['node:While'],
    });
    const duas = aula({
      slug: 'primeira-duas',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['node:While', 'node:For'],
    });
    assert.deepEqual(achadosDe(trilha([uma]), 'A18').filter((a) => a.chave === null), []);
    const a18 = achadosDe(trilha([duas]), 'A18').filter((a) => a.chave === null);
    assert.equal(a18.length, 1);
    assert.match(a18[0].evidencia, /^aula 1 da trilha com 2 produtivas novas/);
    assert.equal(a18[0].severidade, 'erro');
  });
});

describe('barra — A19 declarar não é demonstrar (e o fail-closed do parse)', { skip: TEM_PYTHON ? false : 'python3 ausente' }, () => {
  it('chave declarada sem bloco dela na aula reprova; demonstrada passa', () => {
    const comWhile = aula({
      slug: 'sem-demo',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['global:print', 'node:While'],
    });
    const a19 = achadosDe(trilha([aulaLimpa(), comWhile]), 'A19');
    assert.equal(a19.length, 1);
    assert.equal(a19[0].chave, 'node:While');
    assert.equal(a19[0].ref, 'modulo/sem-demo');
    assert.equal(a19[0].severidade, 'erro');
    assert.equal(a19[0].acao, 'REWRITE_IN_BUDGET');
  });

  it('bloco que NÃO parseia reprova por A19 fail-closed e conta em blocosQueNaoParseiam', () => {
    const quebrado = aula({
      slug: 'bloco-quebrado',
      secoes: [secao('s1', 'python', 'def f(:\n'), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['global:print'],
    });
    const r = auditarBarra(trilha([aulaLimpa(), quebrado]), { modo: 'declared' });
    assert.equal(r.totais.blocosQueNaoParseiam, 1);
    const a19 = r.achados.filter((a) => a.regra === 'A19' && a.chave === null);
    assert.equal(a19.length, 1);
    assert.match(a19[0].evidencia, /não parseia/);
  });
});

describe('barra — A20 aula sem prova não é aula', { skip: TEM_PYTHON ? false : 'python3 ausente' }, () => {
  it('aula SEM desafio reprova (qualquer role); aula regular sem construção nova reprova o 2º prazo; consolidation escapa dele', () => {
    const semDesafio = aula({
      slug: 'sem-desafio',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      productive: ['global:print'],
    });
    const reforcoNaoDeclarado = aula({
      slug: 'reforco',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: [],
    });
    const consolidacao = aula({
      slug: 'consolidacao',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: [],
      role: 'consolidation',
    });
    const track = trilha([aulaLimpa(), semDesafio, reforcoNaoDeclarado, consolidacao]);
    const a20 = achadosDe(track, 'A20');
    const refs = a20.map((a) => a.ref);
    assert.ok(refs.includes('modulo/sem-desafio'), 'sem desafio ⇒ erro');
    assert.ok(refs.includes('modulo/reforco'), 'regular sem nenhuma construção nova ⇒ erro');
    assert.ok(!refs.includes('modulo/consolidacao'), 'consolidation escapa do 2º prazo (mas ainda exige desafio)');
    assert.match(a20.find((a) => a.ref === 'modulo/reforco')?.evidencia ?? '', /sem construção nova nenhuma/);
  });
});

describe('barra — limiar EXATO do A21 (carga de novidade e seções)', { skip: TEM_PYTHON ? false : 'python3 ausente' }, () => {
  it('EXATAMENTE 4 novas colapsadas passa; 5 reprova por carga (o teto é 4)', () => {
    const quatro = aula({
      slug: 'quatro',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT), secao('s3', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['node:While', 'node:For'],
      receptive: ['node:If', 'node:Break'],
    });
    const cinco = aula({
      slug: 'cinco',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT), secao('s3', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['node:While', 'node:For'],
      receptive: ['node:If', 'node:Break', 'node:Continue'],
    });
    assert.deepEqual(achadosDe(trilha([aulaLimpa(), quatro]), 'A21'), []);
    const a21 = achadosDe(trilha([aulaLimpa(), cinco]), 'A21');
    assert.equal(a21.length, 1, 'só a de 5 novas reprova por carga');
    assert.match(a21[0].evidencia, /^5 chaves novas/);
  });

  it('seções: o mínimo é max(2, ceil(novas/2)) — 4 novas com 1 seção reprova; com 2 passa', () => {
    const umaSecao = aula({
      slug: 'uma-secao',
      secoes: [secao('s1', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['node:While', 'node:For'],
      receptive: ['node:If', 'node:Break'],
    });
    const duasSecoes = aula({
      slug: 'duas-secoes',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['node:While', 'node:For'],
      receptive: ['node:If', 'node:Break'],
    });
    assert.deepEqual(achadosDe(trilha([aulaLimpa(), duasSecoes]), 'A21'), []);
    const a21 = achadosDe(trilha([aulaLimpa(), umaSecao]), 'A21');
    assert.equal(a21.length, 1);
    assert.match(a21[0].evidencia, /^1 seção\(ões\) de teoria para 4 construção\(ões\) nova\(s\)/);
    assert.match(a21[0].mensagem, /ao menos 2 seções/);
  });
});

describe('barra — limiar EXATO do A22 (2 formas sintáticas)', { skip: TEM_PYTHON ? false : 'python3 ausente' }, () => {
  it('1 forma só ⇒ AVISO; 2 formas ⇒ silêncio', () => {
    const umaForma = aula({
      slug: 'uma-forma',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['global:print'],
    });
    const duasFormas = aula({
      slug: 'duas-formas',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', 'print("bom dia")\n')],
      desafios: [desafio('d1')],
      productive: ['global:print'],
    });
    // cada caso na SUA trilha (a aula é a PRIMEIRA — global:print é nova nela).
    const a22 = achadosDe(trilha([umaForma]), 'A22');
    assert.equal(a22.length, 1);
    assert.equal(a22[0].ref, 'modulo/uma-forma');
    assert.equal(a22[0].chave, 'global:print');
    assert.equal(a22[0].severidade, 'aviso', 'A22 é AVISO — um aviso que erra para não acusar é melhor que erro errado');
    assert.deepEqual(achadosDe(trilha([duasFormas]), 'A22'), []);
  });
});

describe('barra — A23 a regra do par só com co-ocorrência de linha', { skip: TEM_PYTHON ? false : 'python3 ausente' }, () => {
  /** aula 1 do canditato: introduz SÓ node:While (fora do axioma), 2 seções. */
  function primeiraAula(): LoadedLesson {
    return aula({
      slug: 'primeira',
      secoes: [secao('s1', 'python', 'while x > 1:\n    x = 0\n'), secao('s2', 'python', 'while y > 2:\n    y = 0\n')],
      desafios: [desafio('d1')],
      productive: ['node:While'],
    });
  }

  it('derivada VÁLIDA colapsa (3 produtivas com 2 derivadas contam 1 — sem A17)', () => {
    const valida = aula({
      slug: 'derivada-valida',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['global:print', 'node:Call', 'node:StrLiteral'],
      derived: [
        { chave: 'node:Call', de: 'global:print' },
        { chave: 'node:StrLiteral', de: 'global:print' },
      ],
    });
    const semDerivadas = aula({
      slug: 'sem-derivadas',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['global:print', 'node:Call', 'node:StrLiteral'],
    });
    const comPar = trilha([primeiraAula(), valida]);
    assert.deepEqual(achadosDe(comPar, 'A23'), [], 'a declaração é válida: pai declarado + mesma linha');
    assert.deepEqual(achadosDe(comPar, 'A17'), [], 'colapsadas = 1 — o par conta UMA construção');
    // o MESMO declarado sem o par cai no A17 — é o colapso que muda o veredito.
    assert.equal(achadosDe(trilha([primeiraAula(), semDerivadas]), 'A17').length, 1);
  });

  it('derivada SEM co-ocorrência de linha reprova por A23 e a chave volta a contar CHEIA', () => {
    const semLinha = aula({
      slug: 'derivada-sem-linha',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', 'def f(x):\n    return x\n')],
      desafios: [desafio('d1')],
      productive: ['global:print', 'node:StrLiteral', 'node:FunctionDef'],
      derived: [{ chave: 'node:StrLiteral', de: 'node:FunctionDef' }],
    });
    const a23 = achadosDe(trilha([primeiraAula(), semLinha]), 'A23');
    assert.equal(a23.length, 1);
    assert.equal(a23[0].chave, 'node:StrLiteral');
    assert.match(a23[0].evidencia, /nenhuma linha de bloco desta aula tem node:StrLiteral e node:FunctionDef juntas/);
  });

  it('entrada MALFORMADA em introduces.derived reprova por A23 (nunca ignorada em silêncio)', () => {
    const malformada = aula({
      slug: 'derivada-malformada',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['global:print'],
      derived: [{ chave: 42, de: null }, 'não é objeto'],
    });
    const a23 = achadosDe(trilha([aulaLimpa(), malformada]), 'A23');
    assert.equal(a23.length, 2);
    assert.match(a23[0].evidencia, /entrada malformada/);
  });
});

describe('barra — limiar EXATO do A24 (a folga de 8 caracteres do quiz)', { skip: TEM_PYTHON ? false : 'python3 ausente' }, () => {
  const afirmacao = (id: string, correta: number, segunda: number) => ({
    id,
    options: ['x'.repeat(correta), 'y'.repeat(segunda), 'z'.repeat(segunda), 'w'.repeat(segunda)],
    answerIndex: 0,
  });

  it('TODAS vazando FORTE por mais de 8 ⇒ ERRO; com exato 8 é fraco ⇒ só AVISOS', () => {
    const forte = aula({
      slug: 'quiz-forte',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['global:print'],
      assertions: [afirmacao('a1', 12, 3), afirmacao('a2', 12, 3)], // excesso 9 = 8+1 ⇒ forte
    });
    const exato = aula({
      slug: 'quiz-exato',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['global:print'],
      assertions: [afirmacao('b1', 11, 3), afirmacao('b2', 11, 3)], // excesso EXATO 8 ⇒ fraco
    });
    const track = trilha([aulaLimpa(), forte, exato]);
    const a24 = achadosDe(track, 'A24');
    const erros = a24.filter((a) => a.severidade === 'erro');
    const avisos = a24.filter((a) => a.severidade === 'aviso');
    assert.deepEqual(erros.map((a) => a.ref), ['modulo/quiz-forte']);
    assert.match(erros[0].evidencia, /por mais de 8 caracteres \(excessos: 9, 9\)/);
    assert.deepEqual(avisos.map((a) => a.ref), ['modulo/quiz-exato', 'modulo/quiz-exato']);
  });

  it('empate no comprimento do topo NÃO conta (maior === segunda não é vazamento)', () => {
    const empate = aula({
      slug: 'quiz-empate',
      secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['global:print'],
      assertions: [
        {
          id: 'e1',
          options: ['aaaa', 'bbbb', 'cc', 'dd'],
          answerIndex: 0,
        },
      ],
    });
    assert.deepEqual(achadosDe(trilha([aulaLimpa(), empate]), 'A24'), []);
  });
});

describe('barra — agruparPorLinha (a regra do par medida no disco) e o recorte', () => {
  it('co-ocorrência de linha une grupos; chave sem linha vira grupo unitário; ordem é estável', () => {
    const linhas = new Map<AtomKey, Set<string>>([
      ['global:print', new Set(['1:2'])],
      ['node:Call', new Set(['1:2'])],
      ['node:StrLiteral', new Set(['1:2'])],
      ['node:Return', new Set(['2:1'])],
    ]);
    const grupos = agruparPorLinha(
      ['global:print', 'node:Call', 'node:StrLiteral', 'node:Return', 'node:While'] as AtomKey[],
      linhas,
    );
    assert.deepEqual(grupos, [
      ['global:print', 'node:Call', 'node:StrLiteral'],
      ['node:Return'],
      ['node:While'],
    ]);
  });

  it('é PURA e determinística (mesma entrada, mesma saída)', () => {
    const linhas = new Map<AtomKey, Set<string>>([['a:b', new Set(['1:1'])]]);
    const chaves = ['a:b'] as AtomKey[];
    assert.deepEqual(agruparPorLinha(chaves, linhas), agruparPorLinha(chaves, linhas));
  });

  it('o RECORTE (apenas) pula a extração das demais aulas — o placar fala só do recorte', { skip: TEM_PYTHON ? false : 'python3 ausente' }, () => {
    const track = trilha([aulaLimpa(), aula({
      slug: 'outra',
      secoes: [secao('s1', 'python', TEORIA_PRINT)],
      desafios: [desafio('d1')],
      productive: ['global:print', 'node:Call', 'node:StrLiteral', 'node:Expr', 'node:Name', 'node:Load'],
    })]);
    const completo = auditarBarra(track, { modo: 'declared' });
    const recortado = auditarBarra(track, { modo: 'declared', apenas: ['modulo/a-limpa'] });
    assert.equal(completo.metricas.length, 2);
    assert.deepEqual(recortado.metricas.map((m) => m.ref), ['modulo/a-limpa']);
    assert.equal(recortado.totais.aulas, 1);
  });
});
