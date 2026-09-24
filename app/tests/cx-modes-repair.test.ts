/**
 * tests/cx-modes-repair.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/modes/repair.ts`: `planejarReparo` (a distinção §5.5 via P-13),
 * `placarDoAudit`, o contrato dry-run (zero escrita, zero LLM) e o modo
 * `aplicar` (guardas fail-closed ANTES de qualquer escrita, "nada a
 * reparar", e um reparo feliz com laço REAL + LLM fake).
 *
 * OFFLINE: fixtures em memória, adaptador P-35 fake (mesmo contrato do
 * engineRepair.test.ts), LLM fake, escrita em memória. Produção intocada.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import { auditTrack, type AuditReport, type Violation } from '../electron/main/engine/audit';
import { extractAtoms } from '../electron/main/engine/extract';
import { collectLessonCode } from '../electron/main/engine/theoryCode';
import { PREDICADOS_DA_AULA, type RevisaoDoRevisor } from '../electron/main/engine/prompts/reviewer';
import type { AcaoCatalogo } from '../electron/main/engine/review/actionCatalog';
import {
  AdaptadorAuditLaco,
  ErroDeReparo,
  placarDoAudit,
  planejarReparo,
  repararTrilha,
  type DepsDoReparo,
} from '../electron/main/engine/modes/repair';
import {
  aplicarDelta,
  type CorretorLlm,
  type PlanejadorLlm,
  type RevisorLlm,
  type ViolacaoMecanica,
} from '../electron/main/engine/review/loop';
import type { ProverDeDesafio } from '../electron/main/engine/review/prover';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';

// ---------------------------------------------------------------------------
// Fixtures — trilhas em memória
// ---------------------------------------------------------------------------

const TEORIA_COM_FUNCAO =
  "function saudacao(nome) {\n  let mensagem = 'olá';\n  let limite = 3;\n  if (nome === 'ana') {\n    mensagem = mensagem + ' ana';\n  }\n  return mensagem;\n}";

const SOLUCAO_COM_TYPEOF = [
  'export function f(valor) {',
  '  let t = typeof valor;',
  "  if (t === 'number') {",
  "    return 'sim';",
  '  }',
  "  return 'nao';",
  '}',
].join('\n');

const SOLUCAO_COM_LENGTH = [
  'export function f(valor) {',
  '  let u = valor.length;',
  "  return 'ok';",
  '}',
].join('\n');

function secaoTeoria(id: string, codigo: string): TrackTheorySection {
  return { id, title: id, markdown: 'Prosa da seção.', code: { language: 'js', code: codigo } };
}

function desafio(slug: string, solutionCode: string): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: `Desafio ${slug}`,
    concept: 'conceito',
    difficulty: 1,
    language: 'nodejs',
    statement: 'Escreva a função conforme o enunciado.',
    starterCode: 'export function f(valor) {\n  // complete\n}\n',
    testsCode:
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('f', () => { assert.equal(f(1), 'sim'); });\n",
    solutionCode,
    expectedTestCount: 1,
  };
}

interface AulaDeFixture {
  slug: string;
  conceitos: string[];
  teoria: TrackTheorySection[];
  desafios: TrackChallengeSource[];
}

function fazerTrilha(slug: string, aulas: AulaDeFixture[]): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug,
      title: 'Trilha de teste',
      description: 'fixture de caracterização do repair',
      language: 'pt-BR',
      domain: 'programming',
      modules: ['m01'],
    },
    modules: [
      {
        meta: { schemaVersion: 1, slug: 'm01', title: 'Módulo 1', order: 1, lessons: aulas.map((a) => a.slug) },
        challenge: null,
        lessons: aulas.map((a) => ({
          meta: {
            schemaVersion: 1,
            slug: a.slug,
            title: `Aula ${a.slug}`,
            summary: 'Resumo.',
            difficulty: 1,
            concepts: a.conceitos,
            prerequisites: [],
            theory: a.teoria,
            sources: [],
            challenges: a.desafios.map((d) => d.slug),
          },
          challenges: a.desafios,
        })),
      },
    ],
    proficiency: null,
    dir: '/memoria/cx-fixture-repair',
  };
}

const CAMINHO_C2 = 'modules/m01/lessons/a02/challenges/c2/challenge.json';

/** ORDEM executável: a02 cobra `typeof`, ensinado em a03 (depois). */
function trilhaComOrdemSimples(): LoadedTrack {
  return fazerTrilha('cx-repair-ordem', [
    { slug: 'a01', conceitos: ['base'], teoria: [secaoTeoria('t1', TEORIA_COM_FUNCAO)], desafios: [] },
    { slug: 'a02', conceitos: ['cobra'], teoria: [secaoTeoria('t2', 'let z = 1 + 2;')], desafios: [desafio('c2', SOLUCAO_COM_TYPEOF)] },
    { slug: 'a03', conceitos: ['ensina'], teoria: [secaoTeoria('t3', "const tipo = typeof 10;")], desafios: [] },
  ]);
}

/** Só LACUNA (`valor.length` nunca ensinado) — nada de ORDEM executável. */
function trilhaSoComLacuna(): LoadedTrack {
  return fazerTrilha('cx-repair-lacuna', [
    { slug: 'a01', conceitos: ['base'], teoria: [secaoTeoria('t1', TEORIA_COM_FUNCAO)], desafios: [desafio('c1', SOLUCAO_COM_LENGTH)] },
  ]);
}

// ---------------------------------------------------------------------------
// Fakes — P-35, LLM, provas, escrita em memória
// ---------------------------------------------------------------------------

const provasValidas: ProverDeDesafio = async (_input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => ({
  valid: true,
  failures: [],
  declared: 1,
  executed: 1,
});

function revisaoVazia(rodada = 1): RevisaoDoRevisor {
  return {
    artefato: 'repair',
    hash_artefato: 'h',
    rodada,
    apontamentos: [],
    resumo: 'revisão sintética da suíte',
    predicados: PREDICADOS_DA_AULA.map((p) => ({
      id: p.id as 'E1' | 'E2' | 'E3' | 'E4' | 'E5',
      pergunta: p.pergunta,
      justificativa: 'justificativa sintética',
      veredito: 'sim' as const,
    })),
  };
}

const revisorInerte: RevisorLlm = async () => revisaoVazia();

const planejador: PlanejadorLlm = async (entrada) => ({
  acoes: entrada.apontamentos.map((a, i) => ({
    posicao: i,
    apontamento_id: a.id,
    alvo: { arquivo: a.alvo.caminho, span: [a.alvo.span[0], a.alvo.span[1]] },
    motivo: `ação prescrita pela suíte de caracterização para ${a.id}`,
    acao: 'REWRITE_IN_BUDGET' as AcaoCatalogo,
    resultado_esperado: 'o verificador determinístico fica verde',
  })),
});

/** Corretor fake que re-encontra `busca` no conteúdo ATUAL e substitui. */
function corretorDeSubstituicao(iniciais: Map<string, string>, busca: string, substituicao: string): CorretorLlm {
  const conteudos = new Map(iniciais);
  return async (entrada) => {
    const alvo = entrada.decisao.alvo;
    const atual = conteudos.get(alvo.arquivo) ?? '';
    const inicio = atual.indexOf(busca);
    if (inicio < 0) return { rejeitado: false, delta: [] };
    const delta = [{ inicio, fim: inicio + busca.length, substituicao }];
    conteudos.set(alvo.arquivo, aplicarDelta(atual, delta));
    return { rejeitado: false, delta };
  };
}

function escritaEmMemoria(): { gravarArquivo: NonNullable<DepsDoReparo['gravarArquivo']>; arquivos: Map<string, string>; get chamadas(): number } {
  const arquivos = new Map<string, string>();
  const estado = { chamadas: 0 };
  return {
    gravarArquivo: async (arquivo, conteudo) => {
      estado.chamadas += 1;
      arquivos.set(arquivo, conteudo);
    },
    arquivos,
    get chamadas(): number {
      return estado.chamadas;
    },
  };
}

function trechoVivoDaConstrucao(conteudo: string, construcao: string): string | null {
  const r = extractAtoms(conteudo);
  if (!r.ok) return null;
  const ocorrencia = r.occurrences.find((o) => o.key === construcao);
  return ocorrencia !== undefined ? ocorrencia.snippet : null;
}

/** O FAKE do adaptador P-35 — mesmo contrato do `engineRepair.test.ts`. */
function adaptadorAuditLacoFalso(report: AuditReport): AdaptadorAuditLaco {
  const porArtefato = new Map<
    string,
    { construcoes: Set<string>; trechos: Map<string, string>; primeiroEnsina: Map<string, string | null> }
  >();
  for (const v of report.violations) {
    if (v.construcao === null) continue;
    const chave = `${v.arquivo}#${v.campo}`;
    const e = porArtefato.get(chave) ?? {
      construcoes: new Set<string>(),
      trechos: new Map<string, string>(),
      primeiroEnsina: new Map<string, string | null>(),
    };
    e.construcoes.add(v.construcao);
    if (!e.trechos.has(v.construcao)) e.trechos.set(v.construcao, v.trechoOfensor);
    if (!e.primeiroEnsina.has(v.construcao)) e.primeiroEnsina.set(v.construcao, v.primeiraAulaQueEnsina);
    porArtefato.set(chave, e);
  }
  const atomosDaSuperficie = (conteudo: string, campo: string): Set<string> => {
    if (campo === 'theory') {
      try {
        const dado = JSON.parse(conteudo) as { theory?: unknown };
        const coletado = collectLessonCode(Array.isArray(dado.theory) ? dado.theory : []);
        const set = new Set<string>();
        for (const bloco of coletado.blocks) {
          const r = extractAtoms(bloco.code);
          if (r.ok) for (const k of r.keys) set.add(k);
        }
        return set;
      } catch {
        return new Set<string>();
      }
    }
    const r = extractAtoms(conteudo);
    return r.ok ? new Set(r.keys) : new Set<string>();
  };
  return {
    auditEmViolacoesMecanicas(raw) {
      return raw.violations
        .filter((v) => v.construcao !== null)
        .map((v) => ({
          caminho: `${v.arquivo}#${v.campo}`,
          surface: String(v.campo),
          construcao: v.construcao as string,
          tipo: 'orcamento' as const,
          inicio: -1,
          fim: -1,
          linha: v.linha,
          coluna: v.coluna,
          trechoOfensor: v.trechoOfensor,
          primeiraAulaQueEnsina: v.primeiraAulaQueEnsina,
          mensagem: v.mensagem,
        })) as ViolacaoMecanica[];
    },
    criarVerificadorDeOrcamentoDaTrilha() {
      return async (artefatos) => {
        const violacoes: ViolacaoMecanica[] = [];
        for (const [caminho, entrada] of porArtefato) {
          const artefato = artefatos.get(caminho);
          if (artefato === undefined) continue;
          const campo = caminho.slice(caminho.lastIndexOf('#') + 1);
          const atomos = atomosDaSuperficie(artefato.conteudo, campo);
          for (const construcao of entrada.construcoes) {
            if (!atomos.has(construcao)) continue;
            const trecho =
              trechoVivoDaConstrucao(artefato.conteudo, construcao) ?? entrada.trechos.get(construcao) ?? construcao;
            violacoes.push({
              caminho,
              surface: campo,
              construcao,
              tipo: 'orcamento',
              inicio: -1,
              fim: -1,
              linha: 1,
              coluna: 1,
              trechoOfensor: trecho,
              primeiraAulaQueEnsina: entrada.primeiroEnsina.get(construcao) ?? null,
              mensagem: `construção ${construcao} ainda presente na superfície ${campo}`,
            });
          }
        }
        return violacoes;
      };
    },
    snapshotDeOrcamentoDoAudit(raw) {
      const construcoes = [...new Set(raw.violations.map((v) => v.construcao).filter((c): c is string => c !== null))];
      const primeiroEnsina: Record<string, string> = {};
      for (const v of raw.violations) {
        if (v.construcao !== null && v.primeiraAulaQueEnsina !== null) primeiroEnsina[v.construcao] = v.primeiraAulaQueEnsina;
      }
      const arquivos = [...new Set(raw.violations.map((v) => v.arquivo))];
      return {
        ref: raw.trackSlug,
        surfaces: arquivos.map((arquivo) => ({
          superficie: 'todos',
          caminho: arquivo,
          faixa: 'receptive' as const,
          permitidos: construcoes,
        })),
        primeiroEnsina,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Relatórios sintéticos (controle fino da classificação)
// ---------------------------------------------------------------------------

function violacao(parcial: Partial<Violation> = {}): Violation {
  return {
    regra: 'A3',
    arquivo: CAMINHO_C2,
    ref: 'm01/a02',
    campo: 'solutionCode',
    linha: 2,
    coluna: 3,
    construcao: 'op:unary:typeof',
    eixo: 'op',
    faixa: 'productive',
    trechoOfensor: 'typeof valor;',
    primeiraAulaQueEnsina: 'm01/a03',
    mensagem: 'mensagem de fixture',
    ...parcial,
  } as Violation;
}

function reportDe(violacoes: Violation[]): AuditReport {
  return {
    trackSlug: 'cx-fixture',
    budgetSource: 'inferred',
    violations: violacoes,
    metrics: [],
    totals: {
      aulas: 3,
      desafios: 1,
      desafiosComViolacao: 1,
      violacoes: violacoes.filter((v) => (v.severidade ?? 'erro') !== 'aviso').length,
      lacunasDeCurriculo: violacoes.filter((v) => v.primeiraAulaQueEnsina === null && v.construcao !== null).length,
      aulasSemConstrucaoNova: 0,
    },
    hygiene: [],
    parseErrors: [],
    limitacoes: [],
  } as AuditReport;
}

// ---------------------------------------------------------------------------
// 1. planejarReparo — a distinção §5.5 (pura, determinística)
// ---------------------------------------------------------------------------

describe('planejarReparo — lacuna NUNCA vira reescrita (A-P23-1)', () => {
  it('LACUNA agregada por ref: a lista de construções faltantes, ordenada, ação CRIAR AULA', () => {
    const plano = planejarReparo(
      reportDe([
        violacao({ ref: 'm01/a01', primeiraAulaQueEnsina: null, construcao: 'node:PropertyAccessExpression' }),
        violacao({ ref: 'm01/a01', primeiraAulaQueEnsina: null, construcao: 'op:unary:typeof', arquivo: 'outro/challenge.json' }),
        violacao({ ref: 'm01/a01', primeiraAulaQueEnsina: null, construcao: 'op:unary:typeof' }),
      ]),
    );
    assert.equal(plano.lacunas.length, 1, 'UMA lacuna por ref');
    const g = plano.lacunas[0];
    assert.deepEqual(g.construcoesFaltantes, ['node:PropertyAccessExpression', 'op:unary:typeof']);
    assert.deepEqual(g.arquivos, [CAMINHO_C2, 'outro/challenge.json']);
    assert.equal(g.acao, 'INSERT_INTERMEDIATE');
    assert.deepEqual([...g.acoes_permitidas], ['INSERT_INTERMEDIATE', 'MOVE_CONCEPT_TO_ENTRY_BUDGET']);
    assert.ok(!g.acoes_permitidas.includes('REWRITE_IN_BUDGET' as never));
  });

  it('ORDEM vira REWRITE_IN_BUDGET com delta esperado; A6 (sem construção) tem delta próprio', () => {
    const plano = planejarReparo(
      reportDe([
        violacao(),
        violacao({ regra: 'A6', construcao: null, primeiraAulaQueEnsina: 'm01/a02' }),
      ]),
    );
    assert.equal(plano.ordens.length, 2);
    assert.ok(plano.ordens.every((o) => o.tipo === 'ordem' && o.executavelNoLacoV1));
    assert.equal(plano.deltasEsperados.length, 2);
    const comConstrucao = plano.deltasEsperados.find((d) => d.construcao !== null);
    assert.match(comConstrucao?.antes ?? '', /presente na superfície solutionCode/);
    assert.match(comConstrucao?.depois ?? '', /ausente da superfície solutionCode/);
    const a6 = plano.deltasEsperados.find((d) => d.construcao === null);
    assert.match(a6?.antes ?? '', /não exercita nenhuma construção nova/);
  });

  it('DEC: classificada como ordem mas NÃO executável no laço v1 (bloqueio, não delta)', () => {
    const plano = planejarReparo(reportDe([violaçãoDEC(), violacao()]));
    const dec = plano.ordens.find((o) => o.construcaoProibidaSempre === true);
    assert.ok(dec !== undefined);
    assert.equal(dec.executavelNoLacoV1, false);
    assert.equal(plano.deltasEsperados.length, 1, 'o DEC não gera delta executável');
    function violaçãoDEC(): Violation {
      return violacao({ regra: 'DEC', construcao: 'global:eval', primeiraAulaQueEnsina: 'm01/a03' });
    }
  });

  it('ESTRUTURAIS (I*, A14a/A15a/A17/A20/A21/A24, A2 sem construção) são bloqueios v1, sem plano P-13', () => {
    const regras = ['I12', 'A14a', 'A15b', 'A17', 'A20', 'A21', 'A24', 'A2'];
    const plano = planejarReparo(reportDe(regras.map((regra) => violacao({ regra: regra as Violation['regra'], construcao: null, primeiraAulaQueEnsina: 'm01/a02' }))));
    assert.equal(plano.estruturais.length, regras.length);
    assert.ok(plano.estruturais.every((e) => e.tipo === 'estrutural' && e.plano === null && !e.executavelNoLacoV1));
    assert.deepEqual(plano.deltasEsperados, []);
  });

  it('LIMITE: relatório vazio → plano vazio; classificadas preserva a ORDEM do audit', () => {
    const vazio = planejarReparo(reportDe([]));
    assert.equal(vazio.totalViolacoes, 0);
    assert.deepEqual([...vazio.classificadas], []);
    assert.deepEqual([...vazio.ordens], []);
    assert.deepEqual([...vazio.lacunas], []);
    assert.deepEqual([...vazio.estruturais], []);
    const duas = planejarReparo(reportDe([violacao(), violacao({ construcao: 'op:binary:+' })]));
    assert.deepEqual(duas.classificadas.map((c) => c.index), [0, 1]);
  });
});

describe('placarDoAudit — o recorte comparável (A-P23-5)', () => {
  it('GOLDEN: os cinco campos derivam do totals, sem recontagem', () => {
    const report = reportDe([violacao()]);
    assert.deepEqual(placarDoAudit(report), {
      violacoes: 1,
      desafiosComViolacao: 1,
      lacunas: 0,
      aulas: 3,
      desafios: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// 2. repararTrilha — dry-run (A-P23-3) e as guardas fail-closed
// ---------------------------------------------------------------------------

describe('repararTrilha dry-run — zero escrita, zero LLM, plano completo (A-P23-3)', () => {
  it('funciona SEM nenhuma dep além da trilha: escritos [], llmChamado false, loopRodado false', async () => {
    const track = trilhaSoComLacuna();
    const r = await repararTrilha({ track }, { slug: track.root.slug, modo: 'dry-run' });
    assert.equal(r.modo, 'dry-run');
    assert.deepEqual(r.escritos, []);
    assert.equal(r.llmChamado, false);
    assert.equal(r.loopRodado, false);
    assert.ok(r.declaracoes.some((d) => d.includes('dry-run: nada é gravado')));
    assert.ok(r.declaracoes.some((d) => d.includes('dry-run funciona SEM chave de API')));
  });

  it('o dry-run JÁ TRAZ os dois executores em plano (movimentação + sub-fluxo v2) e as lacunas não resolvidas', async () => {
    const track = fazerTrilha('cx-repair-misto', [
      { slug: 'a01', conceitos: ['base'], teoria: [secaoTeoria('t1', TEORIA_COM_FUNCAO)], desafios: [desafio('c1', SOLUCAO_COM_LENGTH)] },
      { slug: 'a02', conceitos: ['cobra'], teoria: [secaoTeoria('t2', 'let z = 1 + 2;')], desafios: [desafio('c2', SOLUCAO_COM_TYPEOF)] },
      { slug: 'a03', conceitos: ['ensina'], teoria: [secaoTeoria('t3', "const tipo = typeof 10;")], desafios: [] },
    ]);
    const r = await repararTrilha({ track }, { slug: track.root.slug, modo: 'dry-run' });
    assert.equal(r.movimentacao.aplicada, false);
    assert.ok(r.movimentacao.plano.movimentos.length > 0, 'a ORDEM se resolve MOVENDO — e o plano diz quanto');
    assert.match(r.declaracoes.join('\n'), /MOVIMENTAÇÃO: \d+ movimento\(s\) planejado/);
    assert.equal(r.subFluxoDeLacuna.modo, 'dry-run');
    assert.ok(r.subFluxoDeLacuna.plano.aulasNovas.length > 0, 'a LACUNA vira aula planejada');
    assert.match(r.declaracoes.join('\n'), /SUB-FLUXO v2 DE LACUNA: \d+ aula\(s\) nova\(s\)/);
    assert.equal(r.lacunasNaoResolvidas.length, r.plano.lacunas.length, 'sem autor, nenhuma lacuna sai da lista');
  });

  it('fail-closed: sem trilha → REPAIR_TRILHA_INDISPONIVEL', async () => {
    await assert.rejects(
      repararTrilha({}, { slug: 'nao-existe', modo: 'dry-run' }),
      (e: unknown) => e instanceof ErroDeReparo && e.codigo === 'REPAIR_TRILHA_INDISPONIVEL',
    );
  });
});

describe('repararTrilha aplicar — as guardas ANTES de qualquer escrita (§9.3)', () => {
  function depsCom(track: LoadedTrack, over: Partial<DepsDoReparo> = {}): { deps: DepsDoReparo; escrita: ReturnType<typeof escritaEmMemoria> } {
    const escrita = escritaEmMemoria();
    const tem = (k: keyof DepsDoReparo): boolean => Object.prototype.hasOwnProperty.call(over, k);
    const deps: DepsDoReparo = {
      track,
      gravarArquivo: tem('gravarArquivo') ? over.gravarArquivo : escrita.gravarArquivo,
      llm: tem('llm') ? over.llm : { revisar: revisorInerte, planejar: planejador, corrigir: corretorDeSubstituicao(new Map(), 'inexistente', 'x') },
      proverDesafio: tem('proverDesafio') ? over.proverDesafio : provasValidas,
      modeloAutor: over.modeloAutor ?? 'autor-de-teste',
      modeloRevisor: over.modeloRevisor ?? 'revisor-de-teste',
      auditLaco: over.auditLaco,
      carregarAdaptadorAuditLaco: over.carregarAdaptadorAuditLaco,
      executarMovimentacao: over.executarMovimentacao,
      llmAutorDeAula: over.llmAutorDeAula,
      rodadasMaximas: 1,
    };
    return { deps, escrita };
  }

  it('adaptador P-35 ausente e loader falho → REPAIR_SEM_ADAPTADOR_AUDIT_LACO', async () => {
    const track = trilhaComOrdemSimples();
    const { deps, escrita } = depsCom(track, {
      auditLaco: undefined,
      carregarAdaptadorAuditLaco: async () => null,
    });
    await assert.rejects(
      repararTrilha(deps, { slug: track.root.slug, modo: 'aplicar' }),
      (e: unknown) => e instanceof ErroDeReparo && e.codigo === 'REPAIR_SEM_ADAPTADOR_AUDIT_LACO',
    );
    assert.equal(escrita.chamadas, 0);
  });

  it('sem LLM / sem provador / sem escrita → REPAIR_SEM_LLM / REPAIR_SEM_PROVER / REPAIR_SEM_ESCRITA', async () => {
    const track = trilhaComOrdemSimples();

    await assert.rejects(
      repararTrilha(depsCom(track, { llm: undefined }).deps, { slug: track.root.slug, modo: 'aplicar' }),
      (e: unknown) => e instanceof ErroDeReparo && e.codigo === 'REPAIR_SEM_LLM',
    );
    await assert.rejects(
      repararTrilha(depsCom(track, { proverDesafio: undefined }).deps, { slug: track.root.slug, modo: 'aplicar' }),
      (e: unknown) => e instanceof ErroDeReparo && e.codigo === 'REPAIR_SEM_PROVER',
    );
    await assert.rejects(
      repararTrilha(depsCom(track, { gravarArquivo: undefined }).deps, { slug: track.root.slug, modo: 'aplicar' }),
      (e: unknown) => e instanceof ErroDeReparo && e.codigo === 'REPAIR_SEM_ESCRITA',
    );
  });

  it('roteamento inválido (mesmo modelo) → REPAIR_ROTEAMENTO_INVALIDO, e a DELEGAÇÃO exige tudo ANTES da 1ª escrita', async () => {
    const track = trilhaComOrdemSimples();

    await assert.rejects(
      repararTrilha(depsCom(track, { modeloAutor: 'mesmo-modelo', modeloRevisor: 'mesmo-modelo' }).deps, {
        slug: track.root.slug,
        modo: 'aplicar',
      }),
      (e: unknown) => e instanceof ErroDeReparo && e.codigo === 'REPAIR_ROTEAMENTO_INVALIDO',
    );

    // delegação LIGADA sem LLM: a guarda dispara ANTES de mover qualquer arquivo
    const { deps, escrita } = depsCom(track, { executarMovimentacao: true, llm: undefined });
    await assert.rejects(
      repararTrilha(deps, { slug: track.root.slug, modo: 'aplicar' }),
      (e: unknown) => e instanceof ErroDeReparo && e.codigo === 'REPAIR_SEM_LLM',
    );
    assert.equal(escrita.chamadas, 0, 'NADA foi movido nem criado — fail-closed antes da primeira escrita');
  });

  it('"nada a reparar mecanicamente": só lacuna → termina sem LLM, paradaFinal mecanico', async () => {
    const track = trilhaSoComLacuna();
    let chamadasLlm = 0;
    const { deps } = depsCom(track, {
      llm: {
        revisar: async () => { chamadasLlm += 1; return revisaoVazia(); },
        planejar: planejador,
        corrigir: corretorDeSubstituicao(new Map(), 'inexistente', 'x'),
      },
    });
    const r = await repararTrilha(deps, { slug: track.root.slug, modo: 'aplicar' });
    assert.equal(r.modo, 'aplicar');
    assert.ok(r.modo === 'aplicar' && r.loopRodado === true);
    assert.ok(r.modo === 'aplicar' && r.paradaFinal === 'mecanico');
    assert.ok(r.modo === 'aplicar' && r.rodadas.length === 0);
    assert.ok(r.modo === 'aplicar' && r.melhorou === false);
    assert.equal(chamadasLlm, 0, 'nenhum LLM é chamado sem o que reparar');
    assert.ok(r.declaracoes.some((d) => d.includes('nada a reparar mecanicamente')));
  });

  it('DELEGAÇÃO movimentação (executarMovimentacao): move ANTES do laço, grava o module.json e re-entra sobre a trilha movida', async () => {
    const track = trilhaComOrdemSimples();
    const escrita = escritaEmMemoria();
    const { deps } = depsCom(track, {
      executarMovimentacao: true,
      llm: {
        revisar: revisorInerte,
        planejar: planejador,
        corrigir: corretorDeSubstituicao(new Map(), 'inexistente', 'x'),
      },
    });
    deps.gravarArquivo = escrita.gravarArquivo;
    const r = await repararTrilha(deps, { slug: track.root.slug, modo: 'aplicar' });
    assert.equal(r.movimentacao.aplicada, true);
    assert.deepEqual(r.movimentacao.escritos, ['modules/m01/module.json']);
    // a violação de ORDEM sumiu com o movimento: a re-entrada não tem nada a
    // reescrever e termina em `mecanico`, com o placar comparado ao ANTES
    assert.ok(r.modo === 'aplicar' && r.paradaFinal === 'mecanico');
    assert.ok(r.modo === 'aplicar' && r.melhorou === true, 'o movimento já resolveu o placar');
    assert.ok(r.declaracoes.some((d) => d.includes('MOVIMENTAÇÃO APLICADA')));
    const meta = JSON.parse(escrita.arquivos.get('modules/m01/module.json') as string) as { lessons: string[] };
    assert.deepEqual(meta.lessons, ['a01', 'a03', 'a02'], 'o array gravado é o MOVIDO, na íntegra');
  });
});

// ---------------------------------------------------------------------------
// 3. O reparo feliz — laço REAL, LLM fake (A-P23-2/A-P23-5)
// ---------------------------------------------------------------------------

describe('repararTrilha aplicar — o caminho feliz inteiro, com gravação e placar comparado', () => {
  it('repara a violação de ORDEM por reescrita, grava o artefato e MELHORA o placar', async () => {
    const track = trilhaComOrdemSimples();
    const auditInicial = auditTrack(track);
    const artefatoAlvo = `${CAMINHO_C2}#solutionCode`;
    const escrita = escritaEmMemoria();
    const deps: DepsDoReparo = {
      track,
      gravarArquivo: escrita.gravarArquivo,
      llm: {
        revisar: revisorInerte,
        planejar: planejador,
        corrigir: corretorDeSubstituicao(new Map([[artefatoAlvo, SOLUCAO_COM_TYPEOF]]), 'typeof valor', 'valor'),
      },
      proverDesafio: provasValidas,
      modeloAutor: 'autor-de-teste',
      modeloRevisor: 'revisor-de-teste',
      auditLaco: adaptadorAuditLacoFalso(auditInicial),
      rodadasMaximas: 2,
    };
    const r = await repararTrilha(deps, { slug: track.root.slug, modo: 'aplicar' });
    assert.equal(r.modo, 'aplicar');
    assert.ok(r.modo === 'aplicar' && r.loopRodado === true);
    assert.ok(r.modo === 'aplicar' && r.melhorou === true, 'A-P23-5: o placar tem de melhorar');
    // placar INICIAL e FINAL em LITERAIS (a comparação relativa `<` não dizia
    // QUANTO o reparo resolve — a reescrita tira 6 dos 10 erros do audit)
    assert.ok(r.modo === 'aplicar');
    assert.deepEqual(r.placarInicial, { violacoes: 10, desafiosComViolacao: 1, lacunas: 1, aulas: 3, desafios: 1 });
    assert.deepEqual(r.placarFinal, { violacoes: 4, desafiosComViolacao: 1, lacunas: 1, aulas: 3, desafios: 1 });
    assert.deepEqual(r.escritos, [CAMINHO_C2]);
    assert.equal(escrita.chamadas, 1);
    const gravado = JSON.parse(escrita.arquivos.get(CAMINHO_C2) as string) as { solutionCode: string };
    assert.ok(!gravado.solutionCode.includes('typeof'), 'a construção fora do orçamento saiu do artefato');
    assert.match(r.declaracoes.join('\n'), /pins semeados na sessão do laço: \d+/);
  });
});
