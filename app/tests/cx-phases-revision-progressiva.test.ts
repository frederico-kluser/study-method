/**
 * tests/cx-phases-revision-progressiva.test.ts — CARACTERIZAÇÃO (golden
 * master) de `engine/revision/progressiva.ts` (a revisão progressiva).
 *
 * PINA: as regras fechadas do REPLAN A4 — LACUNA (atoms(minimal) fora do
 * orçamento ⇒ split), EXCESSO (introduces.productive não usado ⇒ ajuste, não
 * split), NÃO-REVISÁVEL (veredito não-ok ⇒ fail-closed, nunca loopa),
 * IGNORADO (multi-arquivo não reprova a aula), MEMÓRIA (feedback da N vira
 * contexto da N+1), CONVERGÊNCIA (hash estável + válvula) e NADA SE PERDE
 * (JSON + markdown pt-BR + seeds de SPLIT em disco).
 *
 * Zero LLM: prover FAKE; orçamento injetado; tmpdirs próprios.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  gerarMarkdown,
  gravarRelatorio,
  revisarCurso,
  rodarRevisaoAteConvergir,
  type OrcamentoDeAula,
  type RelatorioDeRevisao,
  type RevisarCursoOptions,
} from '../electron/main/engine/revision/progressiva';
import type { LoadedTrack } from '../electron/main/content/trackLoader';
import type { ProverDeDesafio } from '../electron/main/engine/phases/f9Verifier';
import type { ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';

// ---------------------------------------------------------------------------
// Fixtures (cast deliberado: os testes pinam o que a revisão OBSERVA do track)
// ---------------------------------------------------------------------------

function desafio(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'soma',
    language: 'javascript',
    statement: 'some dois valores',
    starterCode: 'export function soma(a, b) {\n  // TODO\n}\n',
    solutionCode: 'export function soma(a, b) {\n  return a + b;\n}\n',
    testsCode:
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { soma } from './solution.mjs';\n" +
      "test('soma dois valores', () => {\n  assert.equal(soma(1, 2), 3);\n});\n",
    expectedTestCount: 1,
    ...over,
  };
}

function trackCom(lessons: { slug: string; title: string; challenges: Record<string, unknown>[] }[]): LoadedTrack {
  return {
    root: { slug: 'trilha-teste', programmingLanguage: 'javascript' },
    modules: [
      {
        meta: { slug: 'm1', title: 'Módulo 1', order: 1 },
        challenge: null,
        lessons: lessons.map((l) => ({
          meta: { slug: l.slug, title: l.title, introduces: { receptive: [], productive: [] } },
          challenges: l.challenges,
        })),
      },
    ],
    proficiency: null,
    dir: '/tmp/nao-usado',
  } as unknown as LoadedTrack;
}

const VEREDITO_VALIDO: ChallengeProofsVerdict = { valid: true, failures: [], declared: 1, executed: 1 };

/** Prover fake SEMPRE válido (o sintetizador mínimo encontra solução). */
const proverOk: ProverDeDesafio = async () => VEREDITO_VALIDO;

/** Prover fake que REPROVA tudo (nenhum candidato passa nas provas). */
const proverReprovando: ProverDeDesafio = async () => ({
  valid: false,
  failures: [],
  declared: 1,
  executed: 0,
});

function orcamento(over: Partial<OrcamentoDeAula> = {}): OrcamentoDeAula {
  return {
    productive: new Set(['op:binary:+', 'node:ReturnStatement', 'node:FunctionDeclaration', 'node:Block', 'node:Parameter', 'node:Identifier', 'node:ExportKeyword', 'node:EndOfFileToken', 'node:NumericLiteral']),
    receptive: new Set(),
    // o mínimo deste desafio é `return 3;` — o introduces é USADO pelo mínimo.
    introducesProductive: ['node:NumericLiteral'],
    ref: 'm1/l1',
    ...over,
  };
}

function revisar(over: Partial<RevisarCursoOptions> = {}): Promise<RelatorioDeRevisao> {
  return revisarCurso({
    track: trackCom([{ slug: 'l1', title: 'Aula 1', challenges: [desafio()] }]),
    prover: proverOk,
    orcamentoPorAula: () => orcamento(),
    orcamentoFonte: 'injetado',
    language: 'javascript',
    ...over,
  });
}

// ---------------------------------------------------------------------------
// 1. Regras fechadas A4
// ---------------------------------------------------------------------------

describe('progressiva — regras fechadas (A4)', () => {
  it('LACUNA: atoms(minimal) fora do orçamento ⇒ precisaQuebrar + SPLIT pendente com a semente', async () => {
    const r = await revisar({ orcamentoPorAula: () => orcamento({ productive: new Set(['node:Block']) }) });
    const aula = r.aulas[0];
    assert.equal(aula.aula, 'm1/l1');
    assert.equal(aula.indice, 1);
    assert.equal(aula.precisaQuebrar, true);
    assert.equal(aula.naoRevisavel, undefined);
    assert.match(aula.motivo, /o teste cobra construção fora do orçamento da aula/);
    assert.match(aula.motivo, /Candidato a SPLIT/);
    assert.match(aula.motivo, /node:ReturnStatement/, 'a lacuna é nomeada no motivo');
    const desafioFb = aula.desafios[0];
    assert.ok(desafioFb.foraDoOrcamento.includes('node:ReturnStatement'));
    assert.ok(desafioFb.foraDoOrcamento.includes('node:Block') === false, 'node:Block está no orçamento');
    assert.deepEqual(
      desafioFb.foraDoOrcamento,
      [...desafioFb.foraDoOrcamento].sort(),
      'lacunas saem sorted+únicas (uniqSorted)',
    );
    assert.equal(r.splitsPendentes.length, 1);
    assert.deepEqual(r.splitsPendentes[0], {
      aula: 'm1/l1',
      desafio: 'soma',
      minimalCode: desafioFb.minimalCode ?? '',
      atoms: desafioFb.atomsCobrados,
      foraDoOrcamento: desafioFb.foraDoOrcamento,
    }, 'a semente (minimalCode + atoms) NUNCA se perde');
    assert.equal(r.placar.comLacuna, 1);
    assert.equal(r.placar.splitsPendentes, 1);
  });

  it('COBERTA: todo o mínimo está no orçamento e o introduces é usado ⇒ decisão ok', async () => {
    const r = await revisar();
    const aula = r.aulas[0];
    assert.equal(aula.precisaQuebrar, false);
    assert.equal(aula.naoRevisavel, undefined);
    assert.match(aula.motivo, /aula coberta/);
    assert.equal(aula.desafios[0].foraDoOrcamento.length, 0);
    assert.equal(aula.desafios[0].excesso.length, 0);
    assert.deepEqual(r.splitsPendentes, []);
    assert.deepEqual(r.placar, {
      aulas: 1,
      cobertas: 1,
      comLacuna: 0,
      naoRevisaveis: 0,
      comExcesso: 0,
      splitsPendentes: 0,
    });
  });

  it('EXCESSO: introduces.productive não usado ⇒ decisão de AJUSTE (nunca split, nunca não-revisável)', async () => {
    const r = await revisar({
      orcamentoPorAula: () => orcamento({ introducesProductive: ['op:binary:+', 'node:IfStatement'] }),
    });
    const aula = r.aulas[0];
    assert.equal(aula.precisaQuebrar, false, 'excesso não é lacuna');
    assert.equal(aula.naoRevisavel, undefined);
    assert.match(aula.motivo, /EXCESSO/);
    assert.match(aula.motivo, /REMOVER do introduces OU COBRIR com desafio/);
    assert.deepEqual(aula.desafios[0].excesso.sort(), ['node:IfStatement', 'op:binary:+'].sort());
    assert.equal(r.placar.comExcesso, 1);
  });

  it('NÃO-REVISÁVEL: veredito não-ok ⇒ fail-closed documentado, sem SPLIT e sem loop', async () => {
    const r = await revisar({ prover: proverReprovando });
    const aula = r.aulas[0];
    assert.equal(aula.naoRevisavel, true);
    assert.equal(aula.precisaQuebrar, false, 'sem mínimo não há lacuna determinável');
    assert.match(aula.naoRevisavelMotivo ?? '', /NÃO-REVISÁVEL \(fail-closed\)/);
    assert.match(aula.naoRevisavelMotivo ?? '', /nada é reexecutado em loop/);
    assert.match(aula.motivo, /veredito não-ok em 1 desafio\(s\): soma \(/);
    const v = aula.desafios[0].veredito;
    assert.equal(v.ok, false);
    if (!v.ok) {
      assert.ok(
        ['SEM_SOLUCAO_ACESSIVEL', 'PARSE_FALHOU', 'PROVER_FALHOU'].includes(v.reason) || v.reason === 'IGNORADO',
        `reason ${v.reason} ∈ o conjunto documentado`,
      );
    }
    assert.deepEqual(r.splitsPendentes, []);
    assert.equal(r.placar.naoRevisaveis, 1);
  });

  it('IGNORADO: desafio multi-arquivo não torna a aula não-revisável (fora do escopo, documentado)', async () => {
    const multi = desafio({
      files: [{ path: 'solution.mjs', code: 'export const x = 1;' }],
      starterCode: undefined,
      solutionCode: undefined,
    });
    const r = await revisar({
      track: trackCom([{ slug: 'l1', title: 'Aula 1', challenges: [multi] }]),
    });
    const aula = r.aulas[0];
    assert.equal(aula.naoRevisavel, undefined);
    assert.equal(aula.precisaQuebrar, false);
    assert.equal(aula.desafios[0].veredito.ok, false);
    const v = aula.desafios[0].veredito;
    if (!v.ok) assert.equal(v.reason, 'IGNORADO');
    assert.match(aula.motivo, /aula coberta/);
  });
});

// ---------------------------------------------------------------------------
// 2. Memória (progressividade)
// ---------------------------------------------------------------------------

describe('progressiva — memória de revisão (feedback da N vira contexto da N+1)', () => {
  it('a segunda aula herda aulaAnterior + lacunasVistas, e a repetição vira progressividade no motivo', async () => {
    const comLacuna = () => orcamento({ productive: new Set(['node:Block']), ref: null });
    const r = await revisarCurso({
      track: trackCom([
        { slug: 'l1', title: 'Aula 1', challenges: [desafio({ slug: 'soma-1' })] },
        { slug: 'l2', title: 'Aula 2', challenges: [desafio({ slug: 'soma-2' })] },
      ]),
      prover: proverOk,
      orcamentoPorAula: () => comLacuna(),
      language: 'javascript',
    });

    const [a1, a2] = r.aulas;
    assert.deepEqual(a1.memoria, { aulaAnterior: null, lacunasVistas: [], decisoes: [] }, 'snapshot ANTES da aula 1');
    assert.equal(a2.memoria.aulaAnterior, 'm1/l1');
    assert.deepEqual(a2.memoria.lacunasVistas, a1.desafios[0].foraDoOrcamento, 'lacunas da N são contexto da N+1');
    assert.deepEqual(a2.memoria.decisoes.map((d) => d.decisao), ['split']);
    assert.match(a2.motivo, /já sinalizado\(s\) como lacuna na aula anterior \(m1\/l1\)/);

    assert.equal(r.memoriaFinal.aulaAnterior, 'm1/l2', 'memória FINAL é depois da última aula');
    assert.equal(r.memoriaFinal.decisoes.length, 2);
    assert.deepEqual(r.memoriaFinal.decisoes.map((d) => d.decisao), ['split', 'split']);
    assert.equal(r.splitsPendentes.length, 2, 'um split por aula com lacuna');
    assert.equal(r.placar.aulas, 2);
    assert.equal(r.placar.comLacuna, 2);
  });
});

// ---------------------------------------------------------------------------
// 3. Convergência (hash estável + válvula anti-loop)
// ---------------------------------------------------------------------------

describe('progressiva — rodarRevisaoAteConvergir', () => {
  it('relatório estável entre iterações ⇒ convergencia=true na 2ª; instável ⇒ válvula maxIteracoes', async () => {
    const estavel = await revisar();
    const r1 = await rodarRevisaoAteConvergir({ revisarCurso: async () => ({ ...estavel }) });
    assert.equal(r1.convergencia, true, 'hash igual entre iterações');
    assert.equal(r1.iteracoes, 2);

    let n = 0;
    const instavel = await rodarRevisaoAteConvergir({
      maxIteracoes: 3,
      revisarCurso: async () => {
        n += 1;
        return { ...(await revisar()), trackSlug: `trilha-${n}` };
      },
    });
    assert.equal(instavel.convergencia, false);
    assert.equal(instavel.iteracoes, 3, 'válvula anti-loop');
    assert.equal(instavel.trackSlug, 'trilha-3', 'o relatório devolvido é o da ÚLTIMA iteração');
  });

  it('com 1 iteração não há "entre iterações": convergencia fica false (nunca verde por ignorância)', async () => {
    const base = await revisar();
    const r = await rodarRevisaoAteConvergir({ maxIteracoes: 1, revisarCurso: async () => ({ ...base }) });
    assert.equal(r.convergencia, false);
    assert.equal(r.iteracoes, 1);
  });

  it('convergencia/iteracoes são metadados do loop e NÃO entram no hash (trocar só eles converge)', async () => {
    const base = await revisar();
    const r = await rodarRevisaoAteConvergir({
      revisarCurso: async () => ({ ...base, convergencia: false, iteracoes: 99 }),
    });
    assert.equal(r.convergencia, true);
  });
});

// ---------------------------------------------------------------------------
// 4. Nada se perde — gravarRelatorio + gerarMarkdown
// ---------------------------------------------------------------------------

describe('progressiva — gravarRelatorio e gerarMarkdown (nada se perde)', () => {
  async function tmpDir(): Promise<string> {
    return fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxph-revisao-'));
  }

  it('grava JSON + markdown + seed/minimal de cada SPLIT, e devolve a lista de arquivos', async () => {
    const r = await revisar({ orcamentoPorAula: () => orcamento({ productive: new Set(['node:Block']) }) });
    const dir = await tmpDir();
    const gravacao = await gravarRelatorio(r, dir);

    assert.equal(gravacao.dir, dir);
    const relativos = gravacao.arquivos.map((a) => path.relative(dir, a)).sort();
    assert.deepEqual(relativos, [
      'relatorio-revisao.json',
      'relatorio-revisao.md',
      'splits/m1__l1--soma.minimal.mjs',
      'splits/m1__l1--soma.seed.json',
    ], 'refs viram nomes seguros (m1/l1 → m1__l1)');

    const emDisco = JSON.parse(await fsp.readFile(path.join(dir, 'relatorio-revisao.json'), 'utf8')) as RelatorioDeRevisao;
    assert.equal(emDisco.trackSlug, 'trilha-teste');
    assert.deepEqual(emDisco.placar, r.placar);

    const minimal = await fsp.readFile(path.join(dir, 'splits', 'm1__l1--soma.minimal.mjs'), 'utf8');
    assert.equal(minimal, r.splitsPendentes[0].minimalCode, 'a semente da aula nova é o minimalCode');
    const seed = JSON.parse(await fsp.readFile(path.join(dir, 'splits', 'm1__l1--soma.seed.json'), 'utf8')) as Record<string, unknown>;
    assert.deepEqual(seed, {
      aula: 'm1/l1',
      desafio: 'soma',
      atoms: r.splitsPendentes[0].atoms,
      foraDoOrcamento: r.splitsPendentes[0].foraDoOrcamento,
      minimalCode: r.splitsPendentes[0].minimalCode,
    });
  });

  it('markdown pt-BR traz placar, decisão por aula, memória vigente e a lista de splits', async () => {
    const comSplit = await revisar({ orcamentoPorAula: () => orcamento({ productive: new Set(['node:Block']) }) });
    const md = gerarMarkdown(comSplit);
    assert.match(md, /# Revisão Progressiva — trilha-teste/);
    assert.match(md, /## Placar/);
    assert.match(md, /\| Com lacuna \(candidata a SPLIT\) \| 1 \|/);
    assert.match(md, /\*\*Decisão: PRECISA QUEBRAR \(SPLIT\)\*\*/);
    assert.match(md, /\*\*Memória vigente nesta revisão\*\* — aula anterior: `\(nenhuma\)`/);
    assert.match(md, /## Splits pendentes \(nada se perde — minimalCode preservado\)/);
    assert.match(md, /## Memória final \(progressividade — o que foi aprendido e reavaliado\)/);
    assert.match(md, /- \[split\] m1\/l1:/);

    const coberta = await revisar();
    assert.match(gerarMarkdown(coberta), /\*\*Decisão: COBERTA\*\*/);

    const naoRev = await revisar({ prover: proverReprovando });
    assert.match(gerarMarkdown(naoRev), /\*\*Decisão: NÃO-REVISÁVEL\*\* \(fail-closed — nunca loopa\)/);
    assert.match(gerarMarkdown(naoRev), /- \[nao-revisavel\] m1\/l1:/);
  });

  it('sinal secundário: requirements declarado aparece no feedback; ausente é null (nunca inventado)', async () => {
    const comReq = desafio({
      requirements: [{ id: 'req-1', descricao: 'soma correta', teste: 'teste inexistente' }],
    });
    const r = await revisar({
      track: trackCom([{ slug: 'l1', title: 'Aula 1', challenges: [comReq] }]),
    });
    const fb = r.aulas[0].desafios[0];
    assert.notEqual(fb.requirements, null, 'requirements declarado é validado (sinal de AJUSTE)');
    if (fb.requirements !== null) {
      assert.equal(fb.requirements.ok, false, 'teste declarado que não existe vira gap');
      assert.deepEqual(fb.requirements.semTeste, ['req-1']);
    }
    const semReq = await revisar();
    assert.equal(semReq.aulas[0].desafios[0].requirements, null, 'desafio sem requirements não tem bijeção a validar');
  });
});
