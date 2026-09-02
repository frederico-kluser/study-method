/**
 * tests/engineRepair.test.ts — pacote P-23: O MODO REPAIR da engine de trilhas
 * (`docs/16-engine-de-trilha.md` §8 + §5.5). Critérios de aceitação:
 *
 *   A-P23-1 — lacuna de currículo ⇒ ação de CRIAR AULA (INSERT_INTERMEDIATE),
 *             NUNCA reescrita de desafio (o TIPO `AcaoDeLacuna` do P-13 exclui
 *             REWRITE_IN_BUDGET) e a lista de construções faltantes agregada;
 *   A-P23-2 — violação de ORDEM ⇒ reescrita dentro do orçamento: o plano
 *             espera REWRITE_IN_BUDGET (e o laço, com o planejador fake,
 *             executa exatamente essa ação);
 *   A-P23-3 — dry-run NÃO escreve NADA (a dep de escrita em memória registra
 *             ZERO chamadas), NÃO chama LLM e funciona sem chave;
 *   A-P23-4 — correção que reintroduz violação já corrigida QUEBRA o pin e é
 *             REJEITADA — integração com o laço REAL (`rodarLacoDeRevisao`)
 *             com LLM fake (offline e rápido);
 *   A-P23-5 — o modo `aplicar` termina com o audit rodando DE NOVO e o placar
 *             comparado ao inicial (resultado tipado antes/depois);
 *   +      — fail-closed: sem LLM / sem adaptador P-35 / sem prover / slug
 *             proibido / roteamento inválido → ErroDeReparo estruturado.
 *
 * ESCOLHA B DO SUB-FLUXO DE LACUNA (declarada no módulo e no handoff): v1
 * "só ORDEM" — as lacunas viram LISTA DE BLOQUEIOS no relatório e NUNCA entram
 * no laço (um pin de lacuna que o corretor não pode verdejar é o laço que
 * nunca termina do §5.5). O teste 5 prova a bigorna: com uma lacuna NO MESMO
 * arquivo da violação de ordem, o laço CONVERGE na ordem e a lacuna permanece
 * intacta no audit final.
 *
 * FIAÇÃO P-35 (`review/audit2Laco.ts`): o P-35 ESTÁ EM MAIN (a ORDEM de merge
 * integrou antes deste pacote) e o repair o importa ESTATICAMENTE, ENROLADO no
 * contrato `AdaptadorAuditLaco` (chaves de superfície `<arquivo>#<campo>`,
 * span [-1,-1] — o repair re-resolve no artefato vivo). A maioria dos testes
 * injeta o FAKE (mesmo contrato, determinístico); o teste "adaptador real"
 * prova o caminho do MÓDULO REAL (sem injeção), e um teste de guarda injeta um
 * loader que FALHA para provar `REPAIR_SEM_ADAPTADOR_AUDIT_LACO` mesmo com o
 * módulo presente (fail-closed testável pelo seam `carregarAdaptadorAuditLaco`).
 *
 * OFFLINE: nenhuma trilha em disco, nenhum LLM real, nenhuma rede — a trilha
 * é fixture em memória; o audit é o `auditTrack` REAL sobre a fixture (as
 * violações são mecânicas); o loop é o REAL com LLM fake e provas fake.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import { auditTrack, type AuditReport, type Violation } from '../electron/main/engine/audit';
import { extractAtoms } from '../electron/main/engine/extract';
import { collectLessonCode } from '../electron/main/engine/theoryCode';
import { PREDICADOS_DA_AULA, type RevisaoDoRevisor } from '../electron/main/engine/prompts/reviewer';
import {
  AdaptadorAuditLaco,
  ErroDeReparo,
  planejarReparo,
  repararTrilha,
  type DepsDoReparo,
  type ResultadoDeReparo,
} from '../electron/main/engine/modes/repair';
import {
  aplicarDelta,
  criarSessaoDeRevisao,
  rodarLacoDeRevisao,
  type ArtefatoNoLaco,
  type CorretorLlm,
  type ContextoDoLaco,
  type PlanejadorLlm,
  type RevisorLlm,
  type ViolacaoMecanica,
} from '../electron/main/engine/review/loop';
import { criarPinParaAchado, type ProverDeDesafio } from '../electron/main/engine/review/prover';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';
import type { AcaoCatalogo } from '../electron/main/engine/review/actionCatalog';

// ---------------------------------------------------------------------------
// Fixtures — trilhas em memória (nada de disco)
// ---------------------------------------------------------------------------

/** Teoria que ensina function/let/if/return/===/+ e numeral (a01/b01). */
const TEORIA_COM_FUNCAO =
  "function saudacao(nome) {\n  let mensagem = 'olá';\n  let limite = 3;\n  if (nome === 'ana') {\n    mensagem = mensagem + ' ana';\n  }\n  return mensagem;\n}";

function secaoTeoria(id: string, codigo: string): TrackTheorySection {
  return { id, title: id, markdown: 'Prosa da seção.', code: { language: 'js', code: codigo } };
}

function desafioSimples(slug: string, concept: string, solutionCode: string): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: `Desafio ${slug}`,
    concept,
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
      description: 'fixture de teste do repair',
      language: 'pt-BR',
      domain: 'programming',
      modules: ['m01'],
    },
    modules: [
      {
        meta: {
          schemaVersion: 1,
          slug: 'm01',
          title: 'Módulo 1',
          order: 1,
          lessons: aulas.map((a) => a.slug),
        },
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
    dir: '/memoria/fixture',
  };
}

/**
 * FIXTURE 1 — cenário ORDEM + LACUNA no MESMO artefato. a01 usa `typeof`
 * (ensinado em a02 → violação de ORDEM) e `valor.length` (nunca ensinado →
 * LACUNA). Audit esperado sobre c1 (solutionCode): 2 ordens
 * (node:TypeOfExpression, op:unary:typeof) + 2 lacunas
 * (node:PropertyAccessExpression, a propriedade de `length`).
 */
function trilhaComOrdemELacuna(): LoadedTrack {
  const c1 = desafioSimples(
    'c1',
    'c1',
    [
      'export function tipoDaCoisa(valor) {',
      "  let t = typeof valor;",
      '  if (t) {',
      "    return 'texto';",
      '  }',
      '  let u = valor.length;',
      '  if (u) {',
      "    return 'array';",
      '  }',
      "  return 'outro';",
      '}',
    ].join('\n'),
  );
  const c2 = desafioSimples(
    'c2',
    'c2',
    ['export function ehNumero(valor) {', "  return typeof valor === 'number';", '}'].join('\n'),
  );
  return fazerTrilha('trilha-de-teste', [
    { slug: 'a01', conceitos: ['c1'], teoria: [secaoTeoria('t1', TEORIA_COM_FUNCAO)], desafios: [c1] },
    { slug: 'a02', conceitos: ['c2'], teoria: [secaoTeoria('t2', "const tipo = typeof 10 === 'number';")], desafios: [c2] },
  ]);
}

/**
 * FIXTURE 2 — QUATRO violações de ORDEM na MESMA superfície (o cenário do
 * pin quebrado, A-P23-4): `typeof` (b02), `>=` (b04) e `<=` (b03) — todos
 * ensinados SÓ em aulas posteriores a b01.
 */
function trilhaComOrdensMultiplas(): LoadedTrack {
  const b1 = desafioSimples(
    'b1',
    'b1',
    [
      'export function f(x) {',
      '  let t = typeof x;',
      '  if (t >= 0) {',
      "    return 'sim';",
      '  }',
      '  if (t <= 0) {',
      "    return 'nao';",
      '  }',
      "  return 'talvez';",
      '}',
    ].join('\n'),
  );
  return fazerTrilha('trilha-de-orden-dupla', [
    { slug: 'b01', conceitos: ['b1'], teoria: [secaoTeoria('t1', TEORIA_COM_FUNCAO)], desafios: [b1] },
    { slug: 'b02', conceitos: [], teoria: [secaoTeoria('t2', "const tipo = typeof 10 === 'number';")], desafios: [] },
    { slug: 'b03', conceitos: [], teoria: [secaoTeoria('t3', 'const v = 1 <= 2;')], desafios: [] },
    { slug: 'b04', conceitos: [], teoria: [secaoTeoria('t4', 'const w = 1 >= 2;')], desafios: [] },
  ]);
}

/** Caminho do arquivo do desafio (o audit usa este formato). */
function caminhoDoDesafio(lessonSlug: string, desafioSlug: string): string {
  return `modules/m01/lessons/${lessonSlug}/challenges/${desafioSlug}/challenge.json`;
}

/**
 * As regras da bateria A13–A16 (rodada 12) — para o ESCOPO desta suíte.
 */
const REGRAS_DA_BATERIA_A13_A16 = new Set<string>(['A13', 'A13d', 'A14a', 'A14b', 'A15a', 'A15b', 'A16']);

/**
 * Audit com o CONTRATO ORIGINAL (A1–A6/DEC/I*). A suíte P-23 testa a MECÂNICA
 * do laço de reparo (pins, rodadas, rejeição por pin quebrado, gravação) —
 * não os NÚMEROS da bateria nova: a A13–A16 entra na MESMA máquina P-13
 * (mesmas classes lacuna/ordem por `primeiraAulaQueEnsina`) e os números dela
 * têm suíte própria (engineAuditPlacar = o pin; engineProgressao; F12). Um
 * delta exato de rodadas/pins precisa de um conjunto de violações
 * DETERMINÍSTICO — sem o escopo, cada bump de bateria reescreveria esta suíte
 * de mecânica. O repair em PRODUÇÃO segue rodando o auditTrack CHEIO (default
 * em `modes/repair.ts` sem `deps.auditar`).
 */
function auditarContratoOriginal(trilha: LoadedTrack): AuditReport {
  const relatorio = auditTrack(trilha);
  const violations = relatorio.violations.filter((v) => !REGRAS_DA_BATERIA_A13_A16.has(v.regra));
  // Re-deriva o placar sobre o conjunto filtrado (o placar nunca pode contar o
  // que a suíte decidiu não auditar).
  const erros = violations.filter((v) => (v.severidade ?? 'erro') !== 'aviso');
  return {
    ...relatorio,
    violations,
    totals: {
      ...relatorio.totals,
      violacoes: erros.length,
      avisos: violations.length - erros.length,
      lacunasDeCurriculo: erros.filter((v) => v.construcao !== null && v.primeiraAulaQueEnsina === null).length,
      desafiosComViolacao: new Set(erros.filter((v) => v.arquivo.includes('/challenges/')).map((v) => v.arquivo)).size,
      aulasSemConstrucaoNova: relatorio.totals.aulasSemConstrucaoNova,
    },
  };
}

// ---------------------------------------------------------------------------
// Fakes — adaptador P-35, LLM, provas, escrita em memória
// ---------------------------------------------------------------------------

const provasValidas: ProverDeDesafio = async (_input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => ({
  valid: true,
  failures: [],
  declared: 1,
  executed: 1,
});

/** Revisão vazia no schema do revisor (nunca é chamada com verificadores vermelhos). */
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

/** Planejador fake: UMA ação prescrita do catálogo por apontamento (REWRITE_IN_BUDGET). */
const planejador: PlanejadorLlm = async (entrada) => ({
  acoes: entrada.apontamentos.map((a, i) => ({
    posicao: i,
    apontamento_id: a.id,
    alvo: { arquivo: a.alvo.caminho, span: [a.alvo.span[0], a.alvo.span[1]] },
    motivo: `ação prescrita pela suíte de repair para ${a.id}`,
    acao: 'REWRITE_IN_BUDGET' as AcaoCatalogo,
    resultado_esperado: 'o verificador determinístico fica verde',
  })),
});

/**
 * Corretor fake "terapêutico": acompanha o conteúdo do artefato (aplicando os
 * próprios deltas) e, a cada chamada, RE-ENCONTRA o trecho de `busca` no
 * conteúdo ATUAL — imune a spans obsoletos entre correções. `substituicao`
 * vazia significa "não achar nada → delta vazio (já resolvido)".
 */
function corretorTerapeutico(
  iniciais: Map<string, string>,
  esquema: ReadonlyArray<{ busca: string; substituicao: string }>,
): CorretorLlm {
  const conteudos = new Map(iniciais);
  let chamada = 0;
  return async (entrada) => {
    const passo = esquema.length > 0 ? esquema[Math.min(chamada, esquema.length - 1)] : undefined;
    chamada += 1;
    const alvo = entrada.decisao.alvo;
    const atual = conteudos.get(alvo.arquivo) ?? '';
    if (passo === undefined || passo.busca.length === 0) return { rejeitado: false, delta: [] };
    const inicio = atual.indexOf(passo.busca);
    if (inicio < 0) return { rejeitado: false, delta: [] };
    const delta = [{ inicio, fim: inicio + passo.busca.length, substituicao: passo.substituicao }];
    conteudos.set(alvo.arquivo, aplicarDelta(atual, delta));
    return { rejeitado: false, delta };
  };
}

/** Escrita em memória — a "dep de gravação" do teste (A-P23-3 conta as chamadas). */
function escritaEmMemoria(): { gravarArquivo: DepsDoReparo['gravarArquivo']; arquivos: Map<string, string>; chamadas: number } {
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

/** O trecho ATUAL de uma construção num conteúdo de superfície (código cru). */
function trechoVivoDaConstrucao(conteudo: string, construcao: string): string | null {
  const r = extractAtoms(conteudo);
  if (!r.ok) return null;
  const ocorrencia = r.occurrences.find((o) => o.key === construcao);
  return ocorrencia !== undefined ? ocorrencia.snippet : null;
}

/**
 * O FAKE do adaptador P-35 (contrato documentado em `modes/repair.ts`): relê
 * as CONSTRUÇÕES que o audit flagrou (por `<arquivo>#<campo>`) contra os
 * artefatos VIVOS do laço. `#theory` exige o lesson.json serializado (o
 * repair grava o arquivo inteiro por superfície); superfícies de código são o
 * trecho cru. Span: [-1, -1] — o repair re-resolve.
 */
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
          if (!bloco.isJavaScript) continue;
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
        }));
    },
    criarVerificadorDeOrcamentoDaTrilha(raw) {
      return async (artefatos) => {
        const violacoes: ViolacaoMecanica[] = [];
        for (const [caminho, entrada] of porArtefato) {
          const artefato = artefatos.get(caminho);
          if (artefato === undefined) continue; // superfície ausente não acusa (declarado)
          const campo = caminho.slice(caminho.lastIndexOf('#') + 1);
          const atomos = atomosDaSuperficie(artefato.conteudo, campo);
          for (const construcao of entrada.construcoes) {
            if (!atomos.has(construcao)) continue;
            // Contrato P-35: o trechoOfensor é o trecho ATUAL no artefato vivo
            // (o repair resolve o span nele); cai para o trecho do audit quando
            // o trecho vivo não é recuperável.
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

/**
 * A fiação completa do repair com os fakes (a suíte passa o que varia). A
 * escrita em memória volta junto para as asserções de A-P23-3/5.
 */
function depsDeReparoCom(
  track: LoadedTrack,
  over: Partial<DepsDoReparo> = {},
): { deps: DepsDoReparo; escrita: ReturnType<typeof escritaEmMemoria> } {
  const escrita = escritaEmMemoria();
  const llmDefault = { revisar: revisorInerte, planejar: planejador, corrigir: corretorTerapeutico(new Map(), []) };
  const tem = (k: keyof DepsDoReparo): boolean => Object.prototype.hasOwnProperty.call(over, k);
  const deps: DepsDoReparo = {
    track,
    gravarArquivo: tem('gravarArquivo') ? over.gravarArquivo : escrita.gravarArquivo,
    // contrato ORIGINAL por padrão (ver auditarContratoOriginal) — a suíte de
    // mecânica não re-audita a A13–A16; o default de PRODUÇÃO segue cheio.
    auditar: tem('auditar') ? over.auditar : auditarContratoOriginal,
    llm: tem('llm') ? over.llm : llmDefault,
    proverDesafio: tem('proverDesafio') ? over.proverDesafio : provasValidas,
    modeloAutor: over.modeloAutor ?? 'autor-de-teste',
    modeloRevisor: over.modeloRevisor ?? 'revisor-de-teste',
    auditLaco: tem('auditLaco') ? over.auditLaco : adaptadorAuditLacoFalso(auditarContratoOriginal(track)),
    // o seam da guarda fica testável: undefined → loader default (módulo real);
    // loader que devolve null → REPAIR_SEM_ADAPTADOR_AUDIT_LACO.
    carregarAdaptadorAuditLaco: over.carregarAdaptadorAuditLaco,
    rodadasMaximas: over.rodadasMaximas ?? 1,
  };
  return { deps, escrita };
}

// ---------------------------------------------------------------------------
// A-P23-1/A-P23-2 — planejarReparo: a distinção §5.5 via planoDeAcao do P-13
// ---------------------------------------------------------------------------

describe('P-23 · planejarReparo — a distinção §5.5 via P-13', () => {
  const reportOrdenLacuna = auditarContratoOriginal(trilhaComOrdemELacuna());

  it('o fixture 1 audita como esperado (2 ordens + 2 lacunas, só na solução de c1)', () => {
    assert.equal(reportOrdenLacuna.trackSlug, 'trilha-de-teste');
    assert.equal(reportOrdenLacuna.totals.violacoes, 4);
    assert.equal(reportOrdenLacuna.totals.lacunasDeCurriculo, 2);
    const construcoesDaLacuna = reportOrdenLacuna.violations
      .filter((v) => v.primeiraAulaQueEnsina === null)
      .map((v) => v.construcao)
      .sort();
    assert.deepEqual(construcoesDaLacuna, ['api:.length', 'node:PropertyAccessExpression']);
    const ordens = reportOrdenLacuna.violations.filter((v) => v.primeiraAulaQueEnsina !== null).map((v) => v.construcao);
    assert.deepEqual(ordens.sort(), ['node:TypeOfExpression', 'op:unary:typeof']);
  });

  it('A-P23-1: lacuna ⇒ CRIAR AULA (INSERT_INTERMEDIATE), NUNCA reescrita de desafio', () => {
    const plano = planejarReparo(reportOrdenLacuna);
    assert.equal(plano.trackSlug, 'trilha-de-teste');
    assert.equal(plano.totalViolacoes, 4);
    assert.equal(plano.ordens.length, 2);
    assert.equal(plano.lacunas.length, 1);

    const lacuna = plano.lacunas[0];
    assert.equal(lacuna.ref, 'm01/a01');
    assert.equal(lacuna.acao, 'INSERT_INTERMEDIATE');
    assert.deepEqual([...lacuna.acoes_permitidas], ['INSERT_INTERMEDIATE', 'MOVE_CONCEPT_TO_ENTRY_BUDGET']);
    // A bigorna do §5.5: a lacuna NUNCA mapeia para reescrita de desafio.
    assert.ok(!(lacuna.acoes_permitidas as readonly string[]).includes('REWRITE_IN_BUDGET'), 'par de CRIAR AULA não contém reescrita');
    // A lista de construções faltantes está no plano (a matéria da aula nova).
    assert.deepEqual(lacuna.construcoesFaltantes, ['api:.length', 'node:PropertyAccessExpression']);
    assert.deepEqual(lacuna.arquivos, [caminhoDoDesafio('a01', 'c1')]);
    assert.equal(lacuna.plano.lacuna, true);
    assert.equal(lacuna.plano.acao, 'INSERT_INTERMEDIATE');

    // Nenhuma violação classificada como ordem carrega ação de lacuna e vice-versa.
    for (const ordem of plano.ordens) {
      assert.equal(ordem.tipo, 'ordem');
      assert.equal(ordem.plano?.lacuna, false, 'ordem nunca usa o par de criar aula');
      assert.ok(ordem.plano?.acoes_permitidas.includes('REWRITE_IN_BUDGET'));
    }
  });

  it('A-P23-2: violação de ORDEM ⇒ REWRITE_IN_BUDGET (reescrita dentro do orçamento)', () => {
    const plano = planejarReparo(reportOrdenLacuna);
    const tipoDe = plano.ordens.find((o) => o.violacao.construcao === 'op:unary:typeof');
    assert.ok(tipoDe !== undefined);
    assert.equal(tipoDe.tipo, 'ordem');
    assert.equal(tipoDe.plano?.acao, 'REWRITE_IN_BUDGET');
    assert.equal(tipoDe.violacao.primeiraAulaQueEnsina, 'm01/a02');
    assert.equal(tipoDe.executavelNoLacoV1, true);
    // O delta esperado nomeia a construção e a superfície (o dry-run o imprime).
    const delta = plano.deltasEsperados.find((d) => d.construcao === 'op:unary:typeof');
    assert.ok(delta !== undefined);
    assert.equal(delta.acao, 'REWRITE_IN_BUDGET');
    assert.equal(delta.campo, 'solutionCode');
    assert.equal(delta.arquivo, caminhoDoDesafio('a01', 'c1'));
  });

  it('DEC e estruturais: DEC é ordem PROIBIDA (não executável v1) e I*/parse são bloqueios', () => {
    const violacao = (over: Partial<Violation>): Violation => ({
      regra: 'A2',
      arquivo: 'modules/m01/lessons/a01/challenges/c1/challenge.json',
      ref: 'm01/a01',
      campo: 'solutionCode',
      linha: 1,
      coluna: 1,
      construcao: null,
      eixo: null,
      faixa: null,
      trechoOfensor: 'x',
      primeiraAulaQueEnsina: null,
      mensagem: 'mensagem de teste',
      ...over,
    });
    const report: AuditReport = {
      trackSlug: 'trilha-de-classificacao',
      budgetSource: 'inferred',
      violations: [
        violacao({ regra: 'DEC', construcao: 'global:eval', mensagem: 'eval quebra a decidibilidade.' }),
        violacao({ regra: 'I16', mensagem: 'conceito sem aula dona.' }),
        violacao({ regra: 'A2', mensagem: 'código não parseia.' }),
        violacao({ regra: 'A6', construcao: null, primeiraAulaQueEnsina: 'm01/a01', mensagem: 'desafio não exercita a aula.' }),
      ],
      metrics: [],
      totals: { aulas: 0, desafios: 0, desafiosComViolacao: 1, violacoes: 4, lacunasDeCurriculo: 0, aulasSemConstrucaoNova: 0 },
      hygiene: [],
      parseErrors: [],
    };
    const plano = planejarReparo(report);
    const [dec, i16, a2, a6] = plano.classificadas;

    assert.equal(dec.tipo, 'ordem');
    assert.equal(dec.construcaoProibidaSempre, true);
    assert.equal(dec.executavelNoLacoV1, false, 'DEC nunca vira aula nem reescrita cega v1 (bloqueio)');
    assert.equal(dec.plano?.acao, 'REWRITE_IN_BUDGET');
    assert.equal((dec.plano?.acoes_permitidas as readonly string[] | undefined)?.includes('INSERT_INTERMEDIATE'), false);

    assert.equal(i16.tipo, 'estrutural');
    assert.equal(a2.tipo, 'estrutural');
    assert.equal(i16.plano, null);
    assert.equal(a2.plano, null);

    assert.equal(a6.tipo, 'ordem', 'A6 (construcao null, mas primeiraAulaQueEnsina não-nulo) é ORDEM');
    assert.equal(a6.plano?.acao, 'REWRITE_IN_BUDGET');

    assert.equal(plano.estruturais.length, 2);
    assert.equal(plano.lacunas.length, 0);
  });
});

// ---------------------------------------------------------------------------
// A-P23-3 — dry-run: zero escrita, zero LLM, funciona sem chave
// ---------------------------------------------------------------------------

describe('P-23 · repararTrilha dry-run', () => {
  it('A-P23-3: dry-run NÃO escreve nada, NÃO chama LLM e entrega o plano + delta esperado', async () => {
    const track = trilhaComOrdemELacuna();
    let llmLigado = false;
    const resultado = await repararTrilha(
      {
        track,
        gravarArquivo: async () => { throw new Error('dry-run NÃO pode gravar'); },
        auditar: auditarContratoOriginal,
      },
      { slug: 'trilha-de-teste', modo: 'dry-run' },
    );
    // Cast para o braço dry-run (o discriminador garante em tipo; aqui só a leitura).
    assert.equal(resultado.modo, 'dry-run');
    const dry = resultado as Extract<ResultadoDeReparo, { modo: 'dry-run' }>;
    assert.equal(llmLigado, false);
    assert.deepEqual(dry.escritos, []);
    assert.equal(dry.loopRodado, false);
    assert.equal(dry.llmChamado, false);
    // O plano de ações E o delta esperado estão no resultado (nada é impresso).
    assert.equal(dry.plano.ordens.length, 2);
    assert.equal(dry.plano.lacunas.length, 1);
    assert.equal(dry.plano.deltasEsperados.length, 2);
    assert.ok(dry.lacunasNaoResolvidas[0].construcoesFaltantes.length >= 2);
    assert.equal(dry.placarInicial.violacoes, 4);
    assert.ok(dry.declaracoes.some((d) => d.includes('dry-run')), 'limitação declarada');
  });
});

// ---------------------------------------------------------------------------
// A-P23-5 — aplicar: o laço REAL converge, grava, re-audita e compara o placar
// ---------------------------------------------------------------------------

describe('P-23 · repararTrilha aplicar (laço REAL, LLM fake)', () => {
  it('A-P23-5: converge na ORDEM, grava o arquivo alterado, re-audita e compara antes/depois; a LACUNA segue intacta (escolha B)', async () => {
    const track = trilhaComOrdemELacuna();
    const arquivo = caminhoDoDesafio('a01', 'c1');
    const conteudoInicial = track.modules[0].lessons[0].challenges[0].solutionCode as string;
    const { deps, escrita } = depsDeReparoCom(track, {
      llm: {
        revisar: revisorInerte,
        planejar: planejador,
        // 2 ordens no MESMO span ('typeof valor;'): a 1ª corrige, a 2ª acha o
        // trecho já corrigido e devolve delta vazio (correção inválida, não danosa).
        corrigir: corretorTerapeutico(
          new Map([[`${arquivo}#solutionCode`, conteudoInicial]]),
          [
            { busca: 'typeof valor;', substituicao: 'valor === 11;' },
            { busca: 'typeof valor;', substituicao: 'valor === 11;' },
          ],
        ),
      },
    });

    const resultado = await repararTrilha(deps, { slug: 'trilha-de-teste', modo: 'aplicar' });
    assert.equal(resultado.modo, 'aplicar');
    const aplicado = resultado as Extract<ResultadoDeReparo, { modo: 'aplicar' }>;

    // O laço REAL convergiu na parada 0 MECÂNICA (a única porta de aceite).
    assert.equal(aplicado.acessado, true, 'laço real convergiu (parada 0 mecânica)');
    assert.equal(aplicado.paradaFinal, 'mecanico');
    assert.equal(aplicado.rodadas.length, 1);
    assert.equal(aplicado.rodadas[0].correcoes.length, 1);
    assert.equal(aplicado.rodadas[0].plano[0].acao, 'REWRITE_IN_BUDGET', 'A-P23-2: a ação executada é reescrita no orçamento');

    // Escrita: exatamente o arquivo do desafio, com o conteúdo corrigido.
    assert.deepEqual(aplicado.escritos, [arquivo]);
    assert.equal(escrita.chamadas, 1);
    const gravado = JSON.parse(escrita.arquivos.get(arquivo) as string) as { solutionCode: string };
    assert.ok(!gravado.solutionCode.includes('typeof'), 'a construção de ordem saiu da solução');
    assert.ok(gravado.solutionCode.includes('valor === 11;'));

    // O audit FINAL rodou e o placar é comparado ao inicial (A-P23-5).
    assert.equal(aplicado.placarInicial.violacoes, 4);
    assert.equal(aplicado.placarFinal.violacoes, 2, 'só restaram as lacunas');
    assert.equal(aplicado.melhorou, true);
    assert.equal(aplicado.placarFinal.lacunas, aplicado.placarInicial.lacunas, 'lacunas intocadas (escolha B — nunca reescritas)');
    assert.deepEqual(aplicado.placarFinal, {
      violacoes: 2,
      desafiosComViolacao: 1,
      lacunas: 2,
      aulas: 2,
      desafios: 2,
    });
    assert.ok(aplicado.lacunasNaoResolvidas[0].construcoesFaltantes.includes('api:.length'));
    assert.ok(aplicado.declaracoes.some((d) => d.includes('escolha B')), 'a escolha B está DECLARADA no resultado');
  });

  it('A-P23-4: correção que reintroduz violação já corrigida QUEBRA o pin e é REJEITADA (laço REAL)', async () => {
    const track = trilhaComOrdensMultiplas();
    const arquivo = caminhoDoDesafio('b01', 'b1');
    const conteudoInicial = track.modules[0].lessons[0].challenges[0].solutionCode as string;

    // Esquema em duas rodadas (a ordem dos MEC-… segue o audit, que ordena as
    // ocorrências por CHAVE — [TypeOf, `<=`, `>=`, typeof]):
    //  R1: (1) remove o typeof (a família toda: TypeOf + typeof); (2) `<=`
    //      NÃO é corrigido (delta vazio — correção inválida, `<=` segue
    //      vermelho e mantém o laço vivo); (3) corrige `>=` com '+ 0) {'
    //      (válido, `+` e numeral já ensinados — o span do operador não
    //      inclui o operando esquerdo, então o resíduo `t ` compõe);
    //      (4) typeof já corrigido → delta vazio.
    //  R2: (5) o corretor "corrige" o `<=` reescrevendo '>= 0) {' DE VOLTA —
    //      o pin do `>=` (verde desde a rodada 1) QUEBRA → REJEITADO (§6.7).
    const { deps, escrita } = depsDeReparoCom(track, {
      rodadasMaximas: 2,
      llm: {
        revisar: revisorInerte,
        planejar: planejador,
        corrigir: corretorTerapeutico(
          new Map([[`${arquivo}#solutionCode`, conteudoInicial]]),
          [
            { busca: 'typeof x;', substituicao: 'x === 11;' },
            { busca: 'nada-a-achar-na-rodada-1', substituicao: '' },
            { busca: '>= 0) {', substituicao: '+ 0) {' },
            { busca: 'typeof x;', substituicao: 'x === 11;' },
            { busca: '<= 0) {', substituicao: '>= 0) {' },
          ],
        ),
      },
    });

    const resultado = await repararTrilha(deps, { slug: 'trilha-de-orden-dupla', modo: 'aplicar' });
    assert.equal(resultado.modo, 'aplicar');
    const aplicado = resultado as Extract<ResultadoDeReparo, { modo: 'aplicar' }>;

    assert.equal(aplicado.rodadas.length, 2, 'duas rodadas (a 2ª existe porque `<=` seguiu vermelho na rodada 1)');
    // Rodada 1: duas correções aplicadas (typeof e `>=`).
    assert.equal(aplicado.rodadas[0].correcoes.length, 2);
    assert.equal(aplicado.rodadas[0].rejeicoesPorPinQuebrado.length, 0);
    // Rodada 2: a correção que reintroduz `>=` (corrigido na rodada 1) QUEBRA o
    // pin verde pin-MEC-0003 e é REJEITADA — o artefato volta (§6.7).
    assert.equal(aplicado.rodadas[1].rejeicoesPorPinQuebrado.length, 1);
    assert.equal(aplicado.rodadas[1].rejeicoesPorPinQuebrado[0].pin_id, 'pin-MEC-0003');
    assert.equal(aplicado.rodadas[1].correcoes.length, 0, 'correção que quebra pin verde NÃO é aplicada');
    assert.equal(aplicado.acessado, false);
    assert.equal(aplicado.paradaFinal, 'failsafe');

    // Estado final: a correção que reintroduz `>=` foi REJEITADA — só a correção
    // LEGÍTIMA da rodada 1 terminou no arquivo, e `<=` segue pendente.
    const gravado = JSON.parse(escrita.arquivos.get(arquivo) as string) as { solutionCode: string };
    assert.ok(gravado.solutionCode.includes('x === 11;'), 'a primeira correção (legítima) está no arquivo');
    assert.ok(!gravado.solutionCode.includes('typeof x;'), 'a ofensa original não voltou');
    assert.ok(gravado.solutionCode.includes('t + 0'), 'o `>=` corrigido prevaleceu (a reintrodução foi rejeitada)');
    assert.ok(gravado.solutionCode.includes('<= 0'), 'o `<=` segue pendente (a "correção" da rodada 2 foi rejeitada)');

    // Placar comparado: 4 ordens → 1 (só `<=` permanece).
    assert.equal(aplicado.placarInicial.violacoes, 4);
    assert.equal(aplicado.placarFinal.violacoes, 1);
    assert.equal(aplicado.melhorou, true);
    assert.equal(aplicado.placarFinal.lacunas, 0);
  });
});

// ---------------------------------------------------------------------------
// Fail-closed — deps ausentes e slugs proibidos
// ---------------------------------------------------------------------------

describe('P-23 · fail-closed', () => {
  it('repararTrilha SEM LLM aborta com REPAIR_SEM_LLM (a correção não existe sem a LLM — declarado)', async () => {
    const track = trilhaComOrdemELacuna();
    const { deps } = depsDeReparoCom(track, { llm: undefined });
    await assert.rejects(
      () => repararTrilha(deps, { slug: 'trilha-de-teste', modo: 'aplicar' }),
      (erro: unknown) => erro instanceof ErroDeReparo && erro.codigo === 'REPAIR_SEM_LLM',
    );
  });

  it('adaptador REAL (P-35 integrado em main): sem injeção o repair carrega review/audit2Laco e o USA — a guarda não dispara e o laço corrige', async () => {
    const track = trilhaComOrdemELacuna();
    const arquivo = caminhoDoDesafio('a01', 'c1');
    const conteudoInicial = track.modules[0].lessons[0].challenges[0].solutionCode as string;
    const { deps, escrita } = depsDeReparoCom(track, {
      // NÃO injeta o fake: o repair resolve o MÓDULO REAL `review/audit2Laco`
      // (P-35 em main — o teste de ontem esperava a guarda porque o módulo não
      // existia; hoje o módulo EXISTE e a guarda NÃO pode disparar).
      auditLaco: undefined,
      llm: {
        revisar: revisorInerte,
        planejar: planejador,
        // Mesmo esquema de A-P23-5: 2 ordens no MESMO trecho — a 1ª corrige, a
        // 2ª acha o trecho já corrigido e devolve delta vazio (não danosa).
        corrigir: corretorTerapeutico(
          new Map([[`${arquivo}#solutionCode`, conteudoInicial]]),
          [
            { busca: 'typeof valor;', substituicao: 'valor === 11;' },
            { busca: 'typeof valor;', substituicao: 'valor === 11;' },
          ],
        ),
      },
    });

    const resultado = await repararTrilha(deps, { slug: 'trilha-de-teste', modo: 'aplicar' });
    assert.equal(resultado.modo, 'aplicar');
    const aplicado = resultado as Extract<ResultadoDeReparo, { modo: 'aplicar' }>;

    // O MÓDULO REAL foi usado de verdade: o resultado DECLARA review/audit2Laco.
    assert.ok(
      aplicado.declaracoes.some((d) => d.includes('review/audit2Laco')),
      'o resultado declara o uso do módulo real review/audit2Laco (não o fake injetado)',
    );
    // O seed real SEMEIOU os pins das violações de ORDEM e o laço REAL corrigiu.
    assert.equal(aplicado.rodadas.length, 1);
    assert.equal(aplicado.rodadas[0].correcoes.length, 1);
    assert.deepEqual(aplicado.escritos, [arquivo]);
    assert.equal(escrita.chamadas, 1);
    const gravado = JSON.parse(escrita.arquivos.get(arquivo) as string) as { solutionCode: string };
    assert.ok(!gravado.solutionCode.includes('typeof'), 'a construção de ordem saiu da solução (correção via o P-35 real)');
    assert.ok(gravado.solutionCode.includes('valor === 11;'));
    // Re-audit final comparado ao inicial (A-P23-5) — só restaram as lacunas.
    assert.equal(aplicado.placarFinal.violacoes, 2);
    assert.equal(aplicado.melhorou, true);
  });

  it('guarda: adaptador NÃO injetado E módulo INDISPONÍVEL (loader que falha) → REPAIR_SEM_ADAPTADOR_AUDIT_LACO ANTES do audit/plano (só `aplicar`)', async () => {
    const track = trilhaComOrdemELacuna();
    let auditou = false;
    const { deps } = depsDeReparoCom(track, {
      auditLaco: undefined,
      // O SEAM pergunta ao loader: devolve null → "o módulo não pôde ser
      // carregado" — a guarda dispara MESMO com o review/audit2Laco em main
      // (o repair não acessa o adaptador sem ele existir — fail-closed).
      carregarAdaptadorAuditLaco: async () => null,
      auditar: (t) => {
        auditou = true;
        return auditTrack(t);
      },
    });
    await assert.rejects(
      () => repararTrilha(deps, { slug: 'trilha-de-teste', modo: 'aplicar' }),
      (erro: unknown) => erro instanceof ErroDeReparo && erro.codigo === 'REPAIR_SEM_ADAPTADOR_AUDIT_LACO',
    );
    assert.equal(auditou, false, 'a guarda dispara ANTES de rodar o audit/plano do caminho que usaria o adaptador');

    // ESCOLHA DOCUMENTADA: a guarda vale SÓ para `aplicar` — o dry-run é puro
    // (planejarReparo não toca o adaptador) e segue funcionando com o mesmo
    // loader que falha.
    const dry = await repararTrilha(deps, { slug: 'trilha-de-teste', modo: 'dry-run' });
    assert.equal(dry.modo, 'dry-run');
    assert.ok((dry as Extract<ResultadoDeReparo, { modo: 'dry-run' }>).plano.ordens.length >= 1);
  });

  it('SEM proverDesafio → REPAIR_SEM_PROVER; SEM escrita → REPAIR_SEM_ESCRITA', async () => {
    const track = trilhaComOrdemELacuna();
    const semProver = depsDeReparoCom(track, { proverDesafio: undefined });
    await assert.rejects(
      () => repararTrilha(semProver.deps, { slug: 'trilha-de-teste', modo: 'aplicar' }),
      (erro: unknown) => erro instanceof ErroDeReparo && erro.codigo === 'REPAIR_SEM_PROVER',
    );
    const semEscrita = depsDeReparoCom(track, { gravarArquivo: undefined });
    await assert.rejects(
      () => repararTrilha(semEscrita.deps, { slug: 'trilha-de-teste', modo: 'aplicar' }),
      (erro: unknown) => erro instanceof ErroDeReparo && erro.codigo === 'REPAIR_SEM_ESCRITA',
    );
  });

  it('roteamento inválido (modelo AUTOR === modelo REVISOR) → REPAIR_ROTEAMENTO_INVALIDO antes do laço', async () => {
    const track = trilhaComOrdemELacuna();
    const { deps } = depsDeReparoCom(track, { modeloAutor: 'mesmo-modelo', modeloRevisor: 'mesmo-modelo' });
    await assert.rejects(
      () => repararTrilha(deps, { slug: 'trilha-de-teste', modo: 'aplicar' }),
      (erro: unknown) => erro instanceof ErroDeReparo && erro.codigo === 'REPAIR_ROTEAMENTO_INVALIDO',
    );
  });

  it('nada a reparar mecanicamente (só lacunas) termina sem LLM e sem escrita (declarado)', async () => {
    const original = trilhaComOrdemELacuna();
    // Remove a aula que ensina typeof: o par typeof vira LACUNA e não há
    // ordem executável alguma — o aplicar termina declarado, sem LLM.
    const semOrdens = fazerTrilha('trilha-sem-ordens', [
      {
        slug: 'a01',
        conceitos: ['c1'],
        teoria: [secaoTeoria('t1', TEORIA_COM_FUNCAO)],
        desafios: [original.modules[0].lessons[0].challenges[0]],
      },
    ]);
    const { deps } = depsDeReparoCom(semOrdens, { llm: undefined });
    const resultado = await repararTrilha(deps, { slug: 'trilha-sem-ordens', modo: 'aplicar' });
    assert.equal(resultado.modo, 'aplicar');
    const aplicado = resultado as Extract<ResultadoDeReparo, { modo: 'aplicar' }>;
    assert.deepEqual(aplicado.escritos, []);
    assert.equal(aplicado.rodadas.length, 0);
    assert.equal(aplicado.acessado, true);
    assert.ok(aplicado.declaracoes.some((d) => d.includes('nada a reparar')), 'sem ordens, o fim é declarado');
  });
});

// ---------------------------------------------------------------------------
// O laço REAL com a sessão SEMEADA (a mecânica do pin que falha HOJE)
// ---------------------------------------------------------------------------

describe('P-23 · a sessão semeada com pins que falham hoje', () => {
  it('cada violação de ORDEM vira pin VERMELHO no início (e o revisor LLM NÃO é chamado enquanto houver violação mecânica)', async () => {
    const track = trilhaComOrdemELacuna();
    const report = auditarContratoOriginal(track);
    const adaptador = adaptadorAuditLacoFalso(report);
    const arquivo = caminhoDoDesafio('a01', 'c1');
    const plano = planejarReparo(report);
    const ordensExecutaveis = plano.ordens.filter((o) => o.executavelNoLacoV1);

    // Monta o contexto EXATAMENTE como o repair fia (verificador escopado ao
    // plano + snapshot) e a sessão com os pins semeados da conversão P-35.
    const artefatos: ArtefatoNoLaco[] = [
      { caminho: `${arquivo}#solutionCode`, nome: 'challenge.json', conteudo: track.modules[0].lessons[0].challenges[0].solutionCode as string, ultimaEdicao: -1 },
    ];
    const paresDeOrdem = new Set<string>();
    for (const o of ordensExecutaveis) {
      if (o.violacao.construcao !== null) {
        paresDeOrdem.add(`${o.violacao.arquivo}\u0000${o.violacao.construcao}`);
        paresDeOrdem.add(`${o.violacao.arquivo}#${o.violacao.campo}\u0000${o.violacao.construcao}`);
      }
    }
    const verificador = adaptador.criarVerificadorDeOrcamentoDaTrilha(report);
    const ctx: ContextoDoLaco = {
      trilha: 'trilha-de-teste',
      artefatos,
      verificadorDeOrcamento: async (mapa) =>
        (await verificador(mapa)).filter((vm) =>
          paresDeOrdem.has(`${vm.caminho}\u0000${vm.construcao}`),
        ),
      snapshotDeOrcamento: adaptador.snapshotDeOrcamentoDoAudit(report),
      proverDesafio: provasValidas,
      llm: { revisar: revisorInerte, planejar: planejador, corrigir: corretorTerapeutico(new Map(), []) },
      modeloAutor: 'autor-de-teste',
      modeloRevisor: 'revisor-de-teste',
      rodadasMaximas: 1,
    };
    const sessao = criarSessaoDeRevisao(ctx);

    // Semeia: as 2 ordens viram pins (trecho resolvido no conteúdo — falha HOJE).
    let semeados = 0;
    for (const vm of adaptador.auditEmViolacoesMecanicas(report)) {
      if (!paresDeOrdem.has(`${vm.caminho}\u0000${vm.construcao}`)) continue;
      const conteudo = sessao.artefatos.get(vm.caminho)?.conteudo ?? '';
      const pin = await criarPinParaAchado(
        {
          id: `MEC-${String(semeados + 1).padStart(4, '0')}`,
          rodada: 0,
          artefato: vm.surface,
          alvo: { caminho: vm.caminho, linha: Math.max(vm.linha, 1), span: spanDoTrechoDeTeste(conteudo, vm.trechoOfensor), no_ast: vm.construcao, token: vm.construcao },
          evidencia: {
            tipo: 'orcamento',
            prova: `o trecho \`${vm.trechoOfensor}\` está fora do orçamento (ref ${vm.caminho})`,
            introduzido_em: vm.primeiraAulaQueEnsina,
            reproduzivel_por: 'mecanico: verificado pelo audit',
          },
          defeito: vm.mensagem,
          regra_violada: 'C1',
          categoria: vm.construcao.startsWith('api:') ? 'api_nao_ensinada' : 'construcao_nao_ensinada',
          severity: 'bloqueante',
          acao_sugerida: 'reescrever sem a construção (violação de ordem — §5.5)',
          confianca: 1,
        },
        { obterArquivo: async (caminho) => sessao.artefatos.get(caminho)?.conteudo ?? null, proverDesafio: provasValidas },
      );
      if (pin !== null) {
        sessao.pins.adicionarPin(pin);
        semeados += 1;
        assert.equal(pin.afericao.tipo, 'ast', 'pin da violação de ordem é pin barato de AST');
      }
    }
    assert.equal(semeados, 2, 'as duas violações de ORDEM viraram pins');

    const vereditos = await sessao.pins.todosRodam();
    assert.equal(vereditos.filter((v) => !v.verde).length, 2, 'cada violação vira pin que FALHA HOJE');
    // A lacuna NÃO vira pin (escopo v1, escolha B): nenhum pin para Array/length.
    const redIds = vereditos.filter((v) => !v.verde).map((v) => v.pin.id);
    assert.equal(redIds.length, 2);

    // Laço REAL, uma rodada: com violação mecânica, o revisor LLM NÃO é chamado.
    let chamadasDoRevisor = 0;
    const resultado = await rodarLacoDeRevisao(
      { ...ctx, llm: { ...ctx.llm, revisar: async (entrada) => { chamadasDoRevisor += 1; void entrada; return revisaoVazia(); } } },
      sessao,
    );
    assert.equal(chamadasDoRevisor, 0, 'verificador vermelho → LLM caro não é chamado (§6.1)');
    assert.equal(resultado.rodadas[0].revisorChamado, false);
  });
});

/** Span do trecho no conteúdo — espelha o repair (fallback determinístico). */
function spanDoTrechoDeTeste(conteudo: string, trecho: string): [number, number] {
  const inicio = conteudo.indexOf(trecho);
  if (inicio >= 0) return [inicio, inicio + Math.max(trecho.length, 1)];
  return [0, Math.min(1, conteudo.length)];
}