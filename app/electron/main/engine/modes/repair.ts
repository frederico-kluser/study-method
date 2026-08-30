/**
 * app/electron/main/engine/modes/repair.ts — P-23: o MODO REPAIR da engine de
 * trilhas (pacote P-23, onda do plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §8 ("repair aplica o laço
 * revisor → plano → correção sobre conteúdo existente, respeitando os pins") e
 * §5.5 (a distinção que faz o laço convergir: `primeiraAulaQueEnsina === null`
 * → LACUNA DE CURRÍCULO → CRIAR AULA; não-null → violação de ORDEM → reescrita/
 * movimentação/reordenação — NUNCA o contrário).
 *
 * O QUE ESTE MÓDULO EXPÕE (o CLI do repair é o P-22 — este pacote entrega a
 * FUNÇÃO; o P-22 fará o comando externo):
 *
 *   1. `planejarReparo(report)` — FUNÇÃO PURA (zero IO, zero LLM): classifica
 *      cada violação do audit pelo `planoDeAcao` do P-13 (review/actionCatalog)
 *      e devolve o `PlanoDeReparo` — ordens, lacunas (com a LISTA de construções
 *      faltantes por ref) e estruturais — mais o delta esperado de cada ação.
 *   2. `repararTrilha(deps, { slug, modo })` — o modo completo:
 *      `dry-run` (zero escrita, zero LLM: só o plano e o delta esperado) ou
 *      `aplicar` (semeia a sessão do laço com pins das violações de ORDEM,
 *      roda `rodarLacoDeRevisao` com o verificador de orçamento da trilha
 *      injetado (P-35) e a LLM corretora já cabreada, grava os artefatos finais
 *      alterados, roda o audit DE NOVO e compara o placar com o inicial).
 *
 * DECISÕES DECLARADAS (v1):
 *
 *   A. SUB-FLUXO DE LACUNA — ESCOLHA B (“só ORDEM”). As lacunas de currículo
 *      NUNCA são consertadas reescrevendo desafio (§5.5 é lei e por construção:
 *      a ação do plano para lacuna é o par de CRIAR AULA — INSERT_INTERMEDIATE
 *      | MOVE_CONCEPT_TO_ENTRY_BUDGET — derivada do PRÓPRIO `planoDeAcao` do
 *      P-13, cujo tipo exclui REWRITE_IN_BUDGET). No v1 as lacunas viram LISTA
 *      DE BLOQUEIOS no relatório (nunca reescritas e nunca entram no laço: um
 *      pin de lacuna vermelho que o corretor não pode verdejar é o laço que
 *      nunca termina do §5.5). Justificativa: o spawn do autor P-11/P-17
 *      (montarDossie + gerarPromptAutor + autorizarAula) exige dossiê de 13
 *      campos pedagogicamente coerente E a re-derivação F4 exige o
 *      `ConceptGraph` (F3) — nenhum dos dois existe para conteúdo LEGADO (a
 *      trilha atual é `inferred`, sem grafo). Fabricar ambos mecanicamente
 *      seria especulativo; o plano de execução prevê o sub-fluxo como evolução
 *      (v2) sobre esta mesma estrutura. A escolha A/B está documentada nos
 *      comentários e o handoff a declara.
 *
 *   B. FIAÇÃO P-35 (review/audit2Laco.ts) — CONTRATO + ADAPTADOR REAL. O P-35
 *      JÁ ESTÁ EM MAIN (mergeado com a ordem prevista) e este módulo o importa
 *      ESTATICAMENTE. O repair declara a INTERFACE CONTRATADA
 *      (`AdaptadorAuditLaco`) — semântica inalterada — e o REAL
 *      `review/audit2Laco` é ENROLADO nela (ver `adaptadorDoModuloReal`): o
 *      P-35 mede spans no arquivo JSON INTEIRO e chaveia por `Violation.arquivo`,
 *      enquanto o repair monta artefatos por SUPERFÍCIE (`<arquivo>#<campo>`);
 *      o adaptador converte as duas vistas SEM mudar a semântica do contrato.
 *      FAIL-CLOSED imutável: adaptador ausente E módulo indisponível →
 *      `ErroDeReparo` `REPAIR_SEM_ADAPTADOR_AUDIT_LACO` ANTES de qualquer
 *      acesso — a guarda roda no passo de deps do modo `aplicar`, ANTES do
 *      audit/plano desse caminho. O DRY-RUN NÃO resolve o adaptador (o
 *      `planejarReparo` é PURO — a escolha está documentada em `repararTrilha`).
 *      Semântica contratada (o P-35 implementa contra este arquivo):
 *        - `auditEmViolacoesMecanicas(report)` — cada violação vira
 *          `ViolacaoMecanica` com `caminho` = `<arquivo>#<campo>` (o MESMO
 *          caminho de artefato que o repair monta); span [inicio, fim] pode
 *          ficar [-1, -1] — o repair re-resolve o span no conteúdo do artefato;
 *        - `criarVerificadorDeOrcamentoDaTrilha(report)` — verificador de
 *          orçamento que relê as CONSTRUÇÕES que o audit flagrou (por
 *          caminho/superfície) contra os artefatos VIVOS do laço (o repair
 *          grava o arquivo INTEIRO por superfície — para `#theory` o artefato
 *          é o lesson.json serializado e o verificador precisa achar o código
 *          dentro do JSON); violações A6 devem emitir `construcao: 'a6'`;
 *        - `snapshotDeOrcamentoDoAudit(report)` — o snapshot de orçamento
 *          aproximado (regressão) alimentando o filtro R4/R5 do laço
 *          (`chavesPermitidas`); o repair NUNCA usa o verificador default por
 *          snapshot (arteFatos JSON) — exige o verificador injetado.
 *
 *   C. DEC — construções PROIBIDAS SEMPRE (`isForbiddenAlways`): classificadas
 *      como ORDEM (REWRITE_IN_BUDGET — o artefato é reescrito SEM a
 *      construção) no PLANO, mas `executavelNoLacoV1 === false`: o laço
 *      interno regenera apontamentos com `introduzido_em === null` e o
 *      planejador as trataria como LACUNA (criar aula para construção
 *      proibida) — a remoção é decisão de conteúdo e fica declarada como
 *      bloqueio v1, jamais entra na sessão.
 *
 *   D. GATE FINAL = audit + pins (NUNCA F12/gFinal). Este módulo não importa
 *      nem chama f12Materialize; `nodejs-do-zero` é SLUG_PROIBIDO e o repair
 *      RECUSA com `REPAIR_SLUG_PROIBIDO` (fail-closed; o protocolo P-30 do
 *      PIN_PLACAR continua valendo para quem rodar o repair na trilha real via
 *      P-22 — se o placar melhorar, o pin é bumpado NO MESMO commit).
 *
 *   E. A ENGINE NÃO ESCREVE PROSA: quem reescreve é a LLM corretora (P-13/P-12
 *      — prompts META já existentes) dentro do span prescrito e do gate
 *      `validarDiffNoSpan` do laço. Nenhuma string de conteúdo didático vive
 *      neste arquivo (A-P23-2).
 *
 * FAIL-CLOSED (v1): revisor/LLM indisponível → `ErroDeReparo` estruturado
 * (`REPAIR_SEM_LLM`, `REPAIR_LACO_FALHOU`…), nunca veredito por omissão; sem
 * chave o dry-run funciona (o PLANO não precisa de LLM) e a CORREÇÃO aborta
 * DECLARANDO; sem verificador de orçamento P-35 injetado/disponível o aplicar
 * nem começa; roteamento (P-12) é validado ANTES do laço; JSON de artefato
 * corrompido pela LLM aborta antes de gravar.
 */

import type { LoadedTrack } from '../../content/trackLoader';
import { auditTrack, type AuditReport, type Violation } from '../audit';
import type { ExecFn } from '../exec/proofs';
import type { Apontamento, AcaoCatalogo, AcaoDeLacuna, PlanoDeAcao, PlanoDeAcaoLacuna } from '../review/actionCatalog';
import { ACOES_DE_LACUNA, ACOES_DE_ORDEM, planoDeAcao, type ApontamentoParaPlano } from '../review/actionCatalog';
import { REPRODUZIVEL_MECANICO_PREFIX } from '../review/filter';
import {
  RODADAS_DEFAULT,
  ErroEstruturadoDoLaco,
  criarSessaoDeRevisao,
  rodarLacoDeRevisao,
  type ArtefatoNoLaco,
  type ContextoDoLaco,
  type CorretorLlm,
  type PlanejadorLlm,
  type RevisorLlm,
  type ResultadoDeRodada,
  type SnapshotDeOrcamento,
  type TipoDeParada,
  type VerificadorDeOrcamento,
  type ViolacaoMecanica,
} from '../review/loop';
import { validarRoteamento, type MapaDeFamilias } from '../review/normalize';
import { criarPinParaAchado, type ProverDeDesafio } from '../review/prover';

// ---------------------------------------------------------------------------
// O slug PROIBIDO — o repair NUNCA roda sobre a trilha legada (D).
// ---------------------------------------------------------------------------

/** `nodejs-do-zero` é SLUG_PROIBIDO do modo repair (gate final nunca F12). */
export const SLUG_PROIBIDO_DO_REPAIR = 'nodejs-do-zero';

// ---------------------------------------------------------------------------
// O contrato P-35 (review/audit2Laco.ts) — import ESTÁTICO + adaptador real
// ---------------------------------------------------------------------------

/**
 * A INTERFACE CONTRATADA do pacote P-35 (`review/audit2Laco`). SEMÂNTICA
 * INALTERADA (os fakes da suíte implementam esta interface): as três funções
 * recebem o MESMO `AuditReport` (contrato) e o repair as consome com as
 * CHAVES DE SUPERFÍCIE que `montarArtefatos` produz (`<arquivo>#<campo>`,
 * span [inicio, fim] pode ficar [-1,-1] — o repair re-resolve no conteúdo do
 * artefato). O módulo REAL devolve chaves de ARQUIVO e spans no JSON inteiro;
 * `adaptadorDoModuloReal` re-embrulha o real NESTE contrato (semântica
 * preservada — ver bloco B do cabeçalho).
 */
export interface AdaptadorAuditLaco {
  auditEmViolacoesMecanicas(report: AuditReport): ViolacaoMecanica[];
  criarVerificadorDeOrcamentoDaTrilha(report: AuditReport): VerificadorDeOrcamento;
  snapshotDeOrcamentoDoAudit(report: AuditReport): SnapshotDeOrcamento;
}

/**
 * O P-35 JÁ ESTÁ EM MAIN (a ORDEM de merge previu isso): o import LAZY com
 * especificador em VARIÁVEL (`import()` dinâmico com `@vite-ignore`), que
 * existia enquanto o módulo podia não estar na worktree, é substituído pelo
 * import ESTÁTICO abaixo — o contrato de fail-closed (adaptador ausente E
 * módulo indisponível → `REPAIR_SEM_ADAPTADOR_AUDIT_LACO`) continua valendo
 * via a guarda de `repararTrilha` (passo 3, modo `aplicar`), que nesta versão
 * só dispara quando o carregamento é forçado a falhar (o seam
 * `deps.carregarAdaptadorAuditLaco` permite testar a guarda com um loader que
 * devolve null — o módulo real, importado estaticamente, não falha em build).
 */
import { auditEmViolacoesMecanicas, criarVerificadorDeOrcamentoDaTrilha, snapshotDeOrcamentoDoAudit } from '../review/audit2Laco';

/**
 * O mapa de conteúdos por ARQUIVO que o P-35 real exige
 * (`auditEmViolacoesMecanicas(report, arquivosConteudo)` — falha fechado se
 * um arquivo citado pelo audit faltar). Serializa os MESMOS caminhos que o
 * `auditTrack` produz (`modules/<m>/module.json`, `<m>/lessons/<a>/lesson.json`,
 * `<m>/lessons/<a>/challenges/<c>/challenge.json` + module-challenge e
 * proficiency.json por completude). O texto é a serialização do OBJETO vivo na
 * trilha carregada — o P-35 usa o texto só para medir spans/detalhes; o repair
 * re-resolve o span no artefato do laço de qualquer forma (contrato).
 */
function conteudosDosArquivosDaTrilha(track: LoadedTrack): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const modulo of track.modules) {
    saida[`modules/${modulo.meta.slug}/module.json`] = JSON.stringify(modulo.meta, null, 2);
    if (modulo.challenge !== null) {
      saida[`modules/${modulo.meta.slug}/challenges/${modulo.challenge.slug}/challenge.json`] = JSON.stringify(
        modulo.challenge,
        null,
        2,
      );
    }
    for (const aula of modulo.lessons) {
      saida[`modules/${modulo.meta.slug}/lessons/${aula.meta.slug}/lesson.json`] = JSON.stringify(aula.meta, null, 2);
      for (const desafio of aula.challenges) {
        saida[`modules/${modulo.meta.slug}/lessons/${aula.meta.slug}/challenges/${desafio.slug}/challenge.json`] =
          JSON.stringify(desafio, null, 2);
      }
    }
  }
  if (track.proficiency !== null) saida['proficiency.json'] = JSON.stringify(track.proficiency, null, 2);
  return saida;
}

/**
 * Projeta os artefatos do repair (chave `<arquivo>#<campo>`, conteúdo do CAMPO
 * — ou o JSON do arquivo inteiro para `#theory`/`#lesson`/`#module`/`#track`)
 * na vista por ARQUIVO que o verificador P-35 consome (`arquivo` → JSON com o
 * valor do campo decodificado). O P-35 real re-decodifica o campo e roda
 * `extractAtoms` sobre o valor — a projeção reconstitui exatamente essa forma
 * a partir do que o repair mantém vivo no laço.
 */
function projetarArtefatosNaVistaDoP35(artefatos: ReadonlyMap<string, ArtefatoNoLaco>): Map<string, ArtefatoNoLaco> {
  const porArquivo = new Map<string, Map<string, string>>();
  for (const [caminho, artefato] of artefatos) {
    const hash = caminho.lastIndexOf('#');
    if (hash <= 0) continue; // fora do contrato P-23 (o repair só monta `file#campo`)
    const arquivo = caminho.slice(0, hash);
    const campo = caminho.slice(hash + 1);
    let campos = porArquivo.get(arquivo);
    if (campos === undefined) {
      campos = new Map();
      porArquivo.set(arquivo, campos);
    }
    campos.set(campo, artefato.conteudo);
  }
  const projecao = new Map<string, ArtefatoNoLaco>();
  for (const [arquivo, campos] of porArquivo) {
    let objeto: Record<string, unknown> = {};
    for (const [campo, conteudo] of campos) {
      if (campo === 'theory' || campo === 'lesson' || campo === 'module' || campo === 'track') {
        // O conteúdo do repair JÁ É o JSON do arquivo inteiro — mescla as chaves.
        try {
          objeto = { ...objeto, ...(JSON.parse(conteudo) as Record<string, unknown>) };
        } catch {
          objeto[campo] = conteudo;
        }
      } else {
        objeto[campo] = conteudo;
      }
    }
    projecao.set(arquivo, {
      caminho: arquivo,
      nome: nomeDoArquivo(arquivo),
      conteudo: JSON.stringify(objeto, null, 2),
      ultimaEdicao: -1,
    });
  }
  return projecao;
}

/**
 * O MÓDULO REAL `review/audit2Laco` (P-35) enrolado no CONTRATO P-23. A ponte
 * é por CAMINHO: o P-35 chaveia `ViolacaoMecanica.caminho` por
 * `Violation.arquivo` (e mede o span no JSON inteiro); o repair chaveia
 * artefatos por SUPERFÍCIE (`<arquivo>#<campo>`) e re-resolve spans no
 * conteúdo do artefato (a semântica do contrato não muda — bloco B). A
 * validação de contrato é a do TIPO do import estático (build); o seam
 * `deps.carregarAdaptadorAuditLaco` preserva o fail-closed testável da guarda.
 */
function adaptadorDoModuloReal(conteudos: Record<string, string>): AdaptadorAuditLaco {
  return {
    auditEmViolacoesMecanicas(report) {
      return auditEmViolacoesMecanicas(report, conteudos).map((vm) => ({
        ...vm,
        caminho: `${vm.caminho}#${vm.surface}`,
      }));
    },
    criarVerificadorDeOrcamentoDaTrilha(report) {
      const verificadorReal = criarVerificadorDeOrcamentoDaTrilha(report);
      return async (artefatos) =>
        (await verificadorReal(projetarArtefatosNaVistaDoP35(artefatos))).map((vm) => ({
          ...vm,
          // contrato P-23: o repair re-resolve o span no artefato VIVO (o span
          // do P-35 foi medido na projeção por arquivo — não vale no campo).
          caminho: `${vm.caminho}#${vm.surface}`,
          inicio: -1,
          fim: -1,
          linha: 1,
          coluna: 1,
        }));
    },
    snapshotDeOrcamentoDoAudit(report) {
      return snapshotDeOrcamentoDoAudit(report);
    },
  };
}

// ---------------------------------------------------------------------------
// Erro ESTRUTURADO do repair — fail-closed (§9.3)
// ---------------------------------------------------------------------------

export type ReparoErrorCode =
  /** `nodejs-do-zero` (ou outro slug declarado) é proibido no repair (D). */
  | 'REPAIR_SLUG_PROIBIDO'
  /** nem `deps.track` nem `deps.carregarTrilha` entregaram a trilha. */
  | 'REPAIR_TRILHA_INDISPONIVEL'
  /** aplicar exige o adaptador P-35 (`deps.auditLaco` ou review/audit2Laco). */
  | 'REPAIR_SEM_ADAPTADOR_AUDIT_LACO'
  /** aplicar exige a LLM corretora (dry-run não — a correção aborta DECLARANDO). */
  | 'REPAIR_SEM_LLM'
  /** aplicar exige o provador de desafio (P-31) — o laço falha fechado sem ele. */
  | 'REPAIR_SEM_PROVER'
  /** aplicar exige a dep de gravação (`deps.gravarArquivo`). */
  | 'REPAIR_SEM_ESCRITA'
  /** roteamento P-12 inválido (modelos ausentes/iguais, família do revisor). */
  | 'REPAIR_ROTEAMENTO_INVALIDO'
  /** uma violação aponta para um arquivo que não existe na trilha carregada. */
  | 'REPAIR_ARTEFATO_NAO_ENCONTRADO'
  /** a LLM corrompeu um artefato JSON (fail-closed: nada é gravado). */
  | 'REPAIR_ARTEFATO_INVALIDO'
  /** a escrita de um artefato final falhou (aborta; escrita parcial possível). */
  | 'REPAIR_ESCRITA_FALHOU'
  /** o laço de revisão falhou de forma estruturada (causa preservada). */
  | 'REPAIR_LACO_FALHOU';

export interface ErroDeReparoOptions {
  codigo: ReparoErrorCode;
  etapa: string;
  mensagem: string;
  causa?: unknown;
}

export class ErroDeReparo extends Error {
  readonly codigo: ReparoErrorCode;
  readonly etapa: string;
  readonly causa?: unknown;

  constructor(opts: ErroDeReparoOptions) {
    super(opts.mensagem);
    this.name = 'ErroDeReparo';
    this.codigo = opts.codigo;
    this.etapa = opts.etapa;
    if (opts.causa !== undefined) this.causa = opts.causa;
  }
}

function erroDeReparo(codigo: ReparoErrorCode, etapa: string, mensagem: string, causa?: unknown): ErroDeReparo {
  return new ErroDeReparo({ codigo, etapa, mensagem, causa });
}

// ---------------------------------------------------------------------------
// 1. planejarReparo — FUNÇÃO PURA (§5.5 × P-13)
// ---------------------------------------------------------------------------

export type TipoDeViolacaoDeReparo = 'ordem' | 'lacuna' | 'estrutural';

/** Uma violação do audit já classificada (a distinção §5.5 por `planoDeAcao`). */
export interface ViolacaoClassificadaDeReparo {
  /** índice da violação no `AuditReport.violations` (rastreabilidade). */
  index: number;
  violacao: Violation;
  tipo: TipoDeViolacaoDeReparo;
  /** o plano P-13 (null para violações ESTRUTURAIS — não mapeiam o catálogo). */
  plano: PlanoDeAcao | null;
  /**
   * DEC (`isForbiddenAlways`): construção proibida SEMPRE — classificada como
   * ordem (REWRITE_IN_BUDGET — o artefato é reescrito sem ela) mas NÃO
   * executável no laço v1: o laço interno regenera `introduzido_em === null` e
   * o planejador a trataria como LACUNA (criar aula para construção proibida).
   */
  construcaoProibidaSempre?: boolean;
  /** false ⇔ o laço v1 não a executa (DEC) — vai à lista de bloqueios. */
  executavelNoLacoV1: boolean;
  motivo: string;
}

/** UMA lacuna de currículo agregada por aula — a lista de construções faltantes. */
export interface LacunaDeReparo {
  /** `<moduleSlug>/<lessonSlug>` em cujo orçamento a construção falta. */
  ref: string;
  /** as construções que nenhuma aula ensina, na ordem estável do audit. */
  construcoesFaltantes: string[];
  /** arquivos onde a lacuna se manifesta (distintos, ordem do audit). */
  arquivos: string[];
  /** o plano P-13 da lacuna (uma aula que falta → CRIAR AULA). */
  plano: PlanoDeAcaoLacuna;
  /** ação default do par de CRIAR AULA (nunca REWRITE_IN_BUDGET — §5.5). */
  acao: AcaoDeLacuna;
  /** o par fechado de lacuna: INSERT_INTERMEDIATE | MOVE_CONCEPT_TO_ENTRY_BUDGET. */
  acoes_permitidas: readonly AcaoDeLacuna[];
  motivo: string;
}

/** O delta esperado de UMA ação — o que muda de verificável após a correção. */
export interface DeltaEsperadoDeReparo {
  arquivo: string;
  campo: string;
  construcao: string | null;
  acao: AcaoCatalogo;
  antes: string;
  depois: string;
}

/** O PLANO DE REPARO — puro, determinístico, zero IO (A-P23-1/2). */
export interface PlanoDeReparo {
  trackSlug: string;
  totalViolacoes: number;
  /** TODAS as violações, na ordem do audit, cada uma classificada. */
  classificadas: readonly ViolacaoClassificadaDeReparo[];
  /** violações de ORDEM (incl. DEC com `construcaoProibidaSempre`). */
  ordens: readonly ViolacaoClassificadaDeReparo[];
  /** lacunas de currículo agregadas por aula (CRIAR AULA — nunca reescrita). */
  lacunas: readonly LacunaDeReparo[];
  /** violações ESTRUTURAIS (regras I e código que não parseia) — bloqueios v1, fora do laço. */
  estruturais: readonly ViolacaoClassificadaDeReparo[];
  /** o delta esperado de cada ação executável (para o dry-run). */
  deltasEsperados: readonly DeltaEsperadoDeReparo[];
}

/** Regras ESTRUTURAIS do audit: `construcao === null` e não são orçamento. */
const REGRAS_ESTRUTURAIS: ReadonlySet<string> = new Set<string>(['I12', 'I14', 'I15', 'I16', 'I17']);

/**
 * O pseudo-apontamento do P-13: `planoDeAcao` do P-13 só lê
 * `evidencia.introduzido_em` — a distinção §5.5. O cast é DELIBERADO e
 * documentado: a classificação é função pura da violação do audit e o P-13 não
 * toca nenhum outro campo do apontamento.
 */
function apontamentoParaPlanoDe(v: Violation): ApontamentoParaPlano {
  return { evidencia: { introduzido_em: v.primeiraAulaQueEnsina } } as ApontamentoParaPlano;
}

/** Classifica UMA violação do audit — a distinção §5.5 via P-13 (A-P23-1/2). */
function classificarViolacao(v: Violation, index: number): ViolacaoClassificadaDeReparo {
  // DEC — proibida SEMPRE: ordem de reescrita (REMOVER a construção), nunca
  // aula. No laço interno v1 não é executável (ver bloco C do cabeçalho).
  if (v.regra === 'DEC') {
    return {
      index,
      violacao: v,
      tipo: 'ordem',
      plano: {
        lacuna: false,
        acao: 'REWRITE_IN_BUDGET',
        acoes_permitidas: [...ACOES_DE_ORDEM],
        motivo:
          `construção \`${v.construcao ?? ''}\` quebra a decidibilidade da análise e é proibida em QUALQUER nível (§5.3) — ` +
          'a ação é reescrever o artefato SEM ela (REWRITE_IN_BUDGET) e NUNCA criar a aula que a ensinaria.',
      },
      construcaoProibidaSempre: true,
      executavelNoLacoV1: false,
      motivo:
        'DEC: construção proibida sempre — reescrever o artefato sem a construção; nunca criar aula (bloqueio v1: a remoção é decisão de conteúdo).',
    };
  }
  // ESTRUTURAIS — I* e código que não parseia (A2 com construcao null):
  // nenhuma construção no orçamento; não mapeiam o catálogo (bloqueios v1).
  if (v.construcao === null && (REGRAS_ESTRUTURAIS.has(v.regra) || v.regra === 'A2')) {
    return {
      index,
      violacao: v,
      tipo: 'estrutural',
      plano: null,
      executavelNoLacoV1: false,
      motivo:
        `violação ESTRUTURAL (${v.regra}): sem construção de orçamento para mapear no catálogo fechado — ` +
        'bloqueio v1, exige intervenção (nunca uma reescrita cega dentro do laço).',
    };
  }
  // Demais — a distinção §5.5 É do P-13: introduzido_em === null → LACUNA
  // (CRIAR AULA; o tipo `AcaoDeLacuna` exclui REWRITE_IN_BUDGET); não-null →
  // ORDEM (REWRITE_IN_BUDGET default — reescrita/movimentação/reordenação).
  const plano = planoDeAcao(apontamentoParaPlanoDe(v));
  return {
    index,
    violacao: v,
    tipo: plano.lacuna ? 'lacuna' : 'ordem',
    plano,
    executavelNoLacoV1: true,
    motivo: plano.motivo,
  };
}

/** Agrega as lacunas por ref, com a LISTA de construções faltantes (A-P23-1). */
function agregarLacunas(ordem: readonly ViolacaoClassificadaDeReparo[]): LacunaDeReparo[] {
  const porRef = new Map<string, LacunaDeReparo>();
  for (const c of ordem) {
    if (c.tipo !== 'lacuna' || c.plano === null) continue;
    const v = c.violacao;
    const g = porRef.get(v.ref) ?? {
      ref: v.ref,
      construcoesFaltantes: [],
      arquivos: [],
      plano: c.plano as PlanoDeAcaoLacuna,
      acao: (c.plano as PlanoDeAcaoLacuna).acao,
      acoes_permitidas: [...ACOES_DE_LACUNA],
      motivo: c.plano.motivo,
    };
    if (v.construcao !== null && !g.construcoesFaltantes.includes(v.construcao)) {
      g.construcoesFaltantes.push(v.construcao);
    }
    if (!g.arquivos.includes(v.arquivo)) g.arquivos.push(v.arquivo);
    porRef.set(v.ref, g);
  }
  for (const g of porRef.values()) g.construcoesFaltantes.sort();
  return [...porRef.values()];
}

/** O delta esperado de UMA violação executável (o dry-run imprime isto). */
function deltaEsperadoDe(c: ViolacaoClassificadaDeReparo): DeltaEsperadoDeReparo {
  const v = c.violacao;
  const acao = c.plano?.acao ?? 'REWRITE_IN_BUDGET';
  if (v.construcao === null) {
    // A6 — o desafio não exercita a aula: o delta é o desafio PASSAR a exercitar.
    return {
      arquivo: v.arquivo,
      campo: String(v.campo),
      construcao: null,
      acao,
      antes: `o desafio não exercita nenhuma construção nova da aula ${v.ref}`,
      depois: 'o desafio exercita ao menos uma construção nova da aula (verificador de orçamento verde)',
    };
  }
  return {
    arquivo: v.arquivo,
    campo: String(v.campo),
    construcao: v.construcao,
    acao,
    antes: `construção \`${v.construcao}\` presente na superfície ${v.campo}`,
    depois: `construção \`${v.construcao}\` ausente da superfície ${v.campo} (verificadores verdes — pin verde)`,
  };
}

/**
 * planejarReparo(report) — FUNÇÃO PURA: classifica cada violação do audit pela
 * distinção §5.5 via `planoDeAcao` do P-13 (A-P23-1: lacuna NUNCA vira
 * reescrita de desafio — o TIPO `AcaoDeLacuna` exclui REWRITE_IN_BUDGET) e
 * monta o plano de ações com a lista de construções faltantes por aula.
 * Determinístico: mesma entrada → mesmo plano byte a byte.
 */
export function planejarReparo(report: AuditReport): PlanoDeReparo {
  const classificadas = report.violations.map(classificarViolacao);
  const ordens = classificadas.filter((c) => c.tipo === 'ordem');
  const estruturais = classificadas.filter((c) => c.tipo === 'estrutural');
  const lacunas = agregarLacunas(classificadas);
  const deltasEsperados = ordens.filter((c) => c.executavelNoLacoV1).map(deltaEsperadoDe);
  return {
    trackSlug: report.trackSlug,
    totalViolacoes: report.violations.length,
    classificadas,
    ordens,
    lacunas,
    estruturais,
    deltasEsperados,
  };
}

// ---------------------------------------------------------------------------
// 2. repararTrilha — o modo completo (dry-run | aplicar)
// ---------------------------------------------------------------------------

export type ModoDeReparo = 'dry-run' | 'aplicar';

/** O placar comparável (as três métricas do PIN_PLACAR + contexto do total). */
export interface PlacarDoAudit {
  violacoes: number;
  desafiosComViolacao: number;
  lacunas: number;
  aulas: number;
  desafios: number;
}

/** Extrai o placar comparável de um report (A-P23-5 compara antes/depois). */
export function placarDoAudit(report: AuditReport): PlacarDoAudit {
  return {
    violacoes: report.totals.violacoes,
    desafiosComViolacao: report.totals.desafiosComViolacao,
    lacunas: report.totals.lacunasDeCurriculo,
    aulas: report.totals.aulas,
    desafios: report.totals.desafios,
  };
}

/** As dependências do repair — tudo o que cruza o mundo é INJETADO (A-P07-2). */
export interface DepsDoReparo {
  /** trilha já carregada (testes: fixture em memória; produção: P-22 carrega). */
  track?: LoadedTrack;
  /** fallback de carga por slug (usado quando `track` ausente). */
  carregarTrilha?: (slug: string) => Promise<LoadedTrack>;
  /** o audit (default `auditTrack` — sem opções, o mesmo caminho do G-AUDIT). */
  auditar?: (track: LoadedTrack) => AuditReport;
  /** a escrita dos artefatos finais (testes: memória; produção: fs). O dry-run NÃO chama. */
  gravarArquivo?: (arquivo: string, conteudo: string) => Promise<void> | void;
  /** a LLM corretora JÁ cabreada no transporte (P-12/P-13). Só `aplicar` usa. */
  llm?: { revisar: RevisorLlm; planejar: PlanejadorLlm; corrigir: CorretorLlm };
  /** o provador de desafio (contrato P-31) — `aplicar` exige (o laço falha fechado sem verificador de provas). */
  proverDesafio?: ProverDeDesafio;
  /** roteamento P-12: model(AUTOR) !== model(REVISOR) (validado ANTES do laço). */
  modeloAutor?: string;
  modeloRevisor?: string;
  familias?: MapaDeFamilias;
  /** adaptador audit→laço (P-35) INJETADO; ausente → módulo real via `carregarAdaptadorAuditLaco`. */
  auditLaco?: AdaptadorAuditLaco;
  /**
   * SEAM do carregamento do adaptador (default: o módulo real `review/audit2Laco`
   * enrolado no contrato — P-35 já em main). Existe para a GUARDA ser testável:
   * um loader que devolve `null` força `REPAIR_SEM_ADAPTADOR_AUDIT_LACO` mesmo
   * com o módulo presente (fail-closed). Recebe o mapa de conteúdos por arquivo
   * da trilha (o P-35 real o exige para medir spans).
   */
  carregarAdaptadorAuditLaco?: (conteudos: Record<string, string>) => Promise<AdaptadorAuditLaco | null>;
  /** executor endurecido para o filtro R5 do laço (opcional). */
  execDeReproducaoR5?: ExecFn;
  /** rodadas do laço (default `RODADAS_DEFAULT` = 1; teto duro 3 é do laço). */
  rodadasMaximas?: number;
  timeoutDeExecucaoMs?: number;
}

export interface EntradaDoReparo {
  slug: string;
  modo: ModoDeReparo;
}

interface BaseDoResultadoDeReparo {
  slug: string;
  modo: ModoDeReparo;
  /** o plano puro (também é o que o dry-run imprime). */
  plano: PlanoDeReparo;
  auditInicial: AuditReport;
  placarInicial: PlacarDoAudit;
  /** escolha B v1: as lacunas NUNCA são resolvidas aqui — lista de bloqueios. */
  lacunasNaoResolvidas: readonly LacunaDeReparo[];
  /** estruturais + DEC: bloqueios v1 que o laço não executa. */
  bloqueios: readonly ViolacaoClassificadaDeReparo[];
  /** limitações DECLARADAS (sem chave, adaptador default, nada a reparar…). */
  declaracoes: readonly string[];
}

export type ResultadoDeReparo =
  | (BaseDoResultadoDeReparo & {
      modo: 'dry-run';
      /** dry-run NUNCA grava (A-P23-3): a dep de escrita não é chamada. */
      escritos: readonly string[];
      llmChamado: false;
      loopRodado: false;
    })
  | (BaseDoResultadoDeReparo & {
      modo: 'aplicar';
      auditFinal: AuditReport;
      placarFinal: PlacarDoAudit;
      /** placarFinal.violacoes < placarInicial.violacoes (A-P23-5). */
      melhorou: boolean;
      acessado: boolean;
      paradaFinal: TipoDeParada;
      rodadas: readonly ResultadoDeRodada[];
      /** arquivos físicos alterados e gravados (deltas mecânicos + correções). */
      escritos: readonly string[];
      loopRodado: true;
    });

// ---------------------------------------------------------------------------
// Ajudantes internos — trilha ↔ artefatos do laço
// ---------------------------------------------------------------------------

/**
 * Resolve um caminho de arquivo do audit dentro da trilha carregada: devolve
 * um par GET/SET sobre o objeto do arquivo (o SET existe para a re-derivação
 * do audit em memória — o repair NUNCA re-lê o disco depois do laço).
 */
function resolverArquivoNaTrilha(
  track: LoadedTrack,
  arquivo: string,
):
  | { obter: () => unknown; definir: (valor: unknown) => void }
  | null {
  const m = /^modules\/([^/]+)\/lessons\/([^/]+)\/challenges\/([^/]+)\/challenge\.json$/.exec(arquivo);
  if (m !== null) {
    const mod = track.modules.find((x) => x.meta.slug === m[1]);
    const lesson = mod?.lessons.find((l) => l.meta.slug === m[2]);
    const i = lesson?.challenges.findIndex((c) => c.slug === m[3]) ?? -1;
    if (lesson === undefined || i < 0) return null;
    return {
      obter: () => lesson.challenges[i],
      definir: (valor) => {
        lesson.challenges[i] = valor as LoadedTrack['modules'][number]['lessons'][number]['challenges'][number];
      },
    };
  }
  const lessonJson = /^modules\/([^/]+)\/lessons\/([^/]+)\/lesson\.json$/.exec(arquivo);
  if (lessonJson !== null) {
    const mod = track.modules.find((x) => x.meta.slug === lessonJson[1]);
    const lesson = mod?.lessons.find((l) => l.meta.slug === lessonJson[2]);
    if (mod === undefined || lesson === undefined) return null;
    return { obter: () => lesson.meta, definir: (valor) => { lesson.meta = valor as typeof lesson.meta; } };
  }
  const moduleJson = /^modules\/([^/]+)\/module\.json$/.exec(arquivo);
  if (moduleJson !== null) {
    const mod = track.modules.find((x) => x.meta.slug === moduleJson[1]);
    if (mod === undefined) return null;
    return { obter: () => mod.meta, definir: (valor) => { mod.meta = valor as typeof mod.meta; } };
  }
  const moduleChallenge = /^modules\/([^/]+)\/challenges\/([^/]+)\/challenge\.json$/.exec(arquivo);
  if (moduleChallenge !== null) {
    const mod = track.modules.find((x) => x.meta.slug === moduleChallenge[1]);
    if (mod === undefined) return null;
    return { obter: () => mod.challenge, definir: (valor) => { mod.challenge = valor as typeof mod.challenge; } };
  }
  if (arquivo === 'proficiency.json') {
    return { obter: () => track.proficiency, definir: (valor) => { track.proficiency = valor as typeof track.proficiency; } };
  }
  return null;
}

/** Nome legível do artefato (o campo `nome` do laço). */
function nomeDoArquivo(arquivo: string): string {
  const partes = arquivo.split('/');
  return partes[partes.length - 1] ?? 'artefato';
}

/** Converte os arquivos com violação de ORDEM executável em artefatos do laço. */
function montarArtefatos(
  track: LoadedTrack,
  ordens: readonly ViolacaoClassificadaDeReparo[],
): ArtefatoNoLaco[] {
  const artefatos: ArtefatoNoLaco[] = [];
  const vistos = new Set<string>();
  for (const ordem of ordens) {
    const v = ordem.violacao;
    const chave = `${v.arquivo}#${v.campo}`;
    if (vistos.has(chave)) continue;
    const alvo = resolverArquivoNaTrilha(track, v.arquivo);
    if (alvo === null) {
      throw erroDeReparo(
        'REPAIR_ARTEFATO_NAO_ENCONTRADO',
        'montar-artefatos',
        `a violação de ordem aponta para "${v.arquivo}", que não existe na trilha carregada (fail-closed).`,
      );
    }
    const objeto = alvo.obter() as Record<string, unknown> | null;
    if (objeto === null) {
      // superfície ausente (ex.: desafio sem solutionCode) — declarado: não acusa.
      continue;
    }
    const ehArquivoInteiro = v.campo === 'theory' || v.campo === 'lesson' || v.campo === 'module' || v.campo === 'track';
    const campo = String(v.campo);
    const conteudo = ehArquivoInteiro
      ? JSON.stringify(objeto, null, 2)
      : typeof objeto[campo] === 'string'
        ? (objeto[campo] as string)
        : null;
    if (conteudo === null) continue;
    vistos.add(chave);
    artefatos.push({ caminho: chave, nome: nomeDoArquivo(v.arquivo), conteudo, ultimaEdicao: -1 });
  }
  return artefatos;
}

/** O fecho de ORDEM executável do plano — lacunas/estruturais/DEC ficam fora. */
function chavesDeEscopoDeOrdem(plano: PlanoDeReparo): { pares: Set<string>; a6: Set<string> } {
  const pares = new Set<string>();
  const a6 = new Set<string>();
  for (const o of plano.ordens) {
    if (!o.executavelNoLacoV1) continue;
    const v = o.violacao;
    if (v.construcao !== null) {
      pares.add(`${v.arquivo}\u0000${v.construcao}`);
      pares.add(`${v.arquivo}#${v.campo}\u0000${v.construcao}`);
    } else if (v.regra === 'A6') {
      a6.add(`${v.arquivo}#${v.campo}\u0000a6`);
    }
  }
  return { pares, a6 };
}

/**
 * ESCOPO v1 (escolha B): o laço só enxerga violações de ORDEM executáveis.
 * Lacunas nunca entram — um pin de lacuna que o corretor não pode verdejar é
 * o laço que nunca termina (§5.5). O verificador P-35 relê TUDO que o audit
 * flagrou; este filtro derruba o que não é ordem executável E RESOLVE o span
 * no artefato VIVO quando o adaptador devolveu [-1,-1] (contrato P-35): o laço
 * (violacaoParaApontamento → provador → gate do span) exige offsets REAIS —
 * sem eles o corretor acertaria o texto mas o gate rejeitaria o diff.
 */
function escoparVerificadorAoPlano(
  verificador: VerificadorDeOrcamento,
  plano: PlanoDeReparo,
): VerificadorDeOrcamento {
  const escopo = chavesDeEscopoDeOrdem(plano);
  return async (artefatos) => {
    const violacoes = await verificador(artefatos);
    return violacoes
      .filter((vm) => {
        if (vm.construcao === 'a6') return escopo.a6.has(`${vm.caminho}\u0000a6`);
        return escopo.pares.has(`${vm.caminho}\u0000${vm.construcao}`);
      })
      .map((vm) => {
        if (vm.inicio >= 0 && vm.fim >= vm.inicio) return vm;
        const conteudo = artefatos.get(vm.caminho)?.conteudo;
        if (conteudo === undefined) return vm;
        const inicio = conteudo.indexOf(vm.trechoOfensor);
        if (inicio < 0) return vm;
        return { ...vm, inicio, fim: inicio + Math.max(vm.trechoOfensor.length, 1) };
      });
  };
}

/** Span de um trecho dentro do conteúdo — fallback determinístico sem trecho. */
function spanDoTrecho(conteudo: string, trecho: string, coluna = 0): [number, number] {
  const inicio = conteudo.indexOf(trecho);
  if (inicio >= 0) return [inicio, inicio + Math.max(trecho.length, 1)];
  const token = trecho.split(':').pop() ?? '';
  const i = token.length >= 3 ? conteudo.indexOf(token) : -1;
  if (i >= 0) return [i, i + token.length];
  return [Math.max(coluna, 0), Math.max(coluna + 1, Math.min(1, conteudo.length))];
}

/**
 * Violação MECÂNICA → apontamento (mesmo shape do laço, `MEC-…`, severidade
 * bloqueante, `reproduzivel_por` com prefixo mecânico). A única divergência
 * proposital: `evidencia.prova` cita o trecho ofensor em crases — é o que dá
 * ao provador (`trechoOfensorDoAchado`) um fragmento recuperável quando o span
 * vazio/irresolúvel, e o pin nasce FORTE (a ofensa exata some do artefato).
 */
function apontamentoDeViolacaoMecanica(vm: ViolacaoMecanica, conteudo: string, sequencia: number): Apontamento {
  const span = spanDoTrecho(conteudo, vm.trechoOfensor, vm.coluna);
  const token = vm.construcao.split(':').pop() ?? vm.construcao;
  const categoria = vm.construcao.startsWith('api:') ? ('api_nao_ensinada' as const) : ('construcao_nao_ensinada' as const);
  return {
    id: `MEC-${String(sequencia + 1).padStart(4, '0')}`,
    rodada: 0,
    artefato: vm.surface,
    alvo: {
      caminho: vm.caminho,
      linha: Math.max(vm.linha, 1),
      span,
      no_ast: vm.construcao,
      token,
    },
    evidencia: {
      tipo: 'orcamento',
      prova: `o trecho \`${vm.trechoOfensor}\` está fora do orçamento da superfície ${vm.surface} (ref ${vm.caminho}) — ${vm.mensagem}`,
      introduzido_em: vm.primeiraAulaQueEnsina,
      reproduzivel_por: `${REPRODUZIVEL_MECANICO_PREFIX} verificado pelo audit G-AUDIT na execução deste repair`,
    },
    defeito: vm.mensagem,
    regra_violada: 'C1',
    categoria,
    severity: 'bloqueante',
    acao_sugerida:
      vm.primeiraAulaQueEnsina === null
        ? 'criar a aula que ensina a construção (lacuna de currículo — §5.5), nunca reescrever para caber no furo'
        : 'reescrever o artefato sem a construção ou mover a aula que a ensina para antes (violação de ordem — §5.5)',
    confianca: 1,
  };
}

/**
 * SEMEIA a sessão do laço com pins das violações de ORDEM (A-P23-1/4): cada
 * violação executável vira um pin que FALHA HOJE (SPAN resolvido no conteúdo
 * do artefato) e passa a rodar a CADA rodada — correção que o reintroduza é
 * REJEITADA pelo laço (`rejeicoesPorPinQuebrado`, §6.7). A conversão passa
 * PELO adaptador P-35 (`auditEmViolacoesMecanicas` — o contrato); lacunas,
 * estruturais e DEC ficam fora (escopo v1).
 */
async function semearPinsNaSessao(
  sessao: ReturnType<typeof criarSessaoDeRevisao>,
  adaptador: AdaptadorAuditLaco,
  report: AuditReport,
  plano: PlanoDeReparo,
  proverDesafio: ProverDeDesafio,
): Promise<number> {
  const escopo = chavesDeEscopoDeOrdem(plano);
  const violacoesMecanicas = adaptador.auditEmViolacoesMecanicas(report);
  let semeados = 0;
  let sequencia = 0;
  for (const vm of violacoesMecanicas) {
    const noEscopo =
      vm.construcao === 'a6'
        ? escopo.a6.has(`${vm.caminho}\u0000a6`)
        : escopo.pares.has(`${vm.caminho}\u0000${vm.construcao}`);
    if (!noEscopo) continue;
    const conteudo = sessao.artefatos.get(vm.caminho)?.conteudo;
    if (conteudo === undefined) continue;
    const apontamento = apontamentoDeViolacaoMecanica(vm, conteudo, sequencia);
    const pin = await criarPinParaAchado(apontamento, {
      obterArquivo: async (caminho) => sessao.artefatos.get(caminho)?.conteudo ?? null,
      proverDesafio,
    });
    if (pin !== null) {
      sessao.pins.adicionarPin(pin);
      semeados += 1;
    }
    sequencia += 1;
  }
  return semeados;
}

/** Aplica os artefatos finais do laço sobre UM clone do arquivo (gravação E re-audit usam isto). */
function conteudosFinaisPorArquivo(
  track: LoadedTrack,
  finais: readonly ArtefatoNoLaco[],
  originais: ReadonlyMap<string, string>,
): Map<string, string> {
  const porArquivo = new Map<string, ArtefatoNoLaco[]>();
  for (const artefato of finais) {
    if ((originais.get(artefato.caminho) ?? '') === artefato.conteudo) continue;
    const hash = artefato.caminho.lastIndexOf('#');
    if (hash <= 0) continue;
    const arquivo = artefato.caminho.slice(0, hash);
    const lista = porArquivo.get(arquivo) ?? [];
    lista.push(artefato);
    porArquivo.set(arquivo, lista);
  }
  const saida = new Map<string, string>();
  for (const [arquivo, lista] of porArquivo) {
    const alvo = resolverArquivoNaTrilha(track, arquivo);
    if (alvo === null) continue;
    let objeto = structuredClone(alvo.obter()) as Record<string, unknown>;
    for (const artefato of lista) {
      const campo = artefato.caminho.slice(arquivo.length + 1);
      if (campo === 'theory' || campo === 'lesson' || campo === 'module' || campo === 'track') {
        // A LLM reescreve o JSON INTEIRO do arquivo — parsear valida (fail-closed).
        objeto = JSON.parse(artefato.conteudo) as Record<string, unknown>;
      } else {
        objeto[campo] = artefato.conteudo;
      }
    }
    saida.set(arquivo, JSON.stringify(objeto, null, 2));
  }
  return saida;
}

/** Clone da trilha com os artefatos finais aplicados — o audit DE NOVO (A-P23-5). */
function trilhaComArtefatosFinais(
  track: LoadedTrack,
  conteudos: ReadonlyMap<string, string>,
): LoadedTrack {
  const clone = structuredClone(track) as LoadedTrack;
  for (const [arquivo, conteudo] of conteudos) {
    const alvo = resolverArquivoNaTrilha(clone, arquivo);
    if (alvo === null) continue;
    try {
      alvo.definir(JSON.parse(conteudo));
    } catch (erro) {
      throw erroDeReparo(
        'REPAIR_ARTEFATO_INVALIDO',
        'reaplicar-artefatos',
        `a LLM corrompeu o JSON de "${arquivo}" — nada é gravado (fail-closed).`,
        erro,
      );
    }
  }
  return clone;
}

// ---------------------------------------------------------------------------
// A API pública — repararTrilha
// ---------------------------------------------------------------------------

/**
 * O vértice de integração do repair com o laço: o laço REGENERA o apontamento
 * de todo pin vermelho (o pin semeado por este pacote, com o MESMO id das
 * violações mecânicas), e o verificador produz o MESMO apontamento mecânico na
 * mesma rodada — sem dedupe, a MESMA violação chegaria DUAS vezes ao
 * planejador (uma com span fresco, outra com span do estado inicial/stale) e o
 * corretor seria chamado duas vezes sobre o mesmo defeito, a segunda com o
 * span deslocado (correção de drenagem). A deduplicação é por IDENTIDADE DA
 * VIOLAÇÃO (`alvo.caminho ␟ alvo.no_ast`), não só por id: na rodada 2+ o laço
 * renumera os MEC-… e o id do pin semeado não alinha mais com o do verificador
 * — mas a IDENTIDADE continua sendo a mesma e o primeiro apontamento (o do
 * verificador, com span fresco do conteúdo ATUAL) vence.
 */
function planejadorDeduplicado(planejar: PlanejadorLlm): PlanejadorLlm {
  return async (entrada) => {
    const vistos = new Set<string>();
    const apontamentos = entrada.apontamentos.filter((a) => {
      const chave = `${a.alvo.caminho}\u0000${a.alvo.no_ast}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
    const resposta = await planejar({ ...entrada, apontamentos });
    const idsDeAcoes = new Set<string>();
    return {
      acoes: resposta.acoes.filter((ac) => {
        if (idsDeAcoes.has(ac.apontamento_id)) return false;
        idsDeAcoes.add(ac.apontamento_id);
        return true;
      }),
    };
  };
}

/**
 * repararTrilha(deps, { slug, modo }) — o modo repair completo (docs §8).
 *
 * dry-run: plano puro + delta esperado; NENHUMA escrita (a dep de gravação
 * NÃO é chamada), NENHUM LLM, o laço não roda (A-P23-3).
 *
 * aplicar: resolve o adaptador audit→laço (P-35 — injetado em deps.auditLaco
 * ou o módulo real review/audit2Laco enrolado no contrato) NO PASSO DE DEPS,
 * ANTES do audit/plano desse caminho: sem adaptador e sem módulo → erro
 * estruturado `REPAIR_SEM_ADAPTADOR_AUDIT_LACO` (fail-closed, nunca o
 * TypeError de um contrato mal-assinado). Depois converte o audit via o
 * adaptador, SEMEIA a sessão do laço com pins das violações de ORDEM, roda
 * `rodarLacoDeRevisao` com o verificador de orçamento da trilha e a LLM
 * corretora, grava os artefatos finais alterados (deltas mecânicos + o que a
 * LLM corrigiu — o gate `validarDiffNoSpan` já rodou dentro do laço), e FEChA
 * com o audit DE NOVO comparando o placar com o inicial (A-P23-5). Subtítulo
 * v1 (escolha B): as lacunas viram lista de bloqueios no relatório — nunca
 * reescritas, nunca no laço. DRY-RUN NÃO resolve o adaptador (planejarReparo
 * é puro — ver passo 3). Fail-closed em cada porta (ver cabeçalho).
 */
export async function repararTrilha(deps: DepsDoReparo, entrada: EntradaDoReparo): Promise<ResultadoDeReparo> {
  // ── 1. slug proibido (gate final nunca F12; trecho legado fora do repair) ──
  if (entrada.slug === SLUG_PROIBIDO_DO_REPAIR) {
    throw erroDeReparo(
      'REPAIR_SLUG_PROIBIDO',
      'entrada',
      `"${entrada.slug}" é SLUG_PROIBIDO do modo repair — o gate final do repair é audit + pins e o conteúdo legado fica fora (docs §8; fail-closed).`,
    );
  }

  // ── 2. trilha (in-memory ao vivo — injetada ou carregada) ──────────────────
  const track = deps.track ?? (deps.carregarTrilha !== undefined ? await deps.carregarTrilha(entrada.slug) : undefined);
  if (track === undefined) {
    throw erroDeReparo(
      'REPAIR_TRILHA_INDISPONIVEL',
      'entrada',
      `nenhuma trilha "${entrada.slug}" disponível: injete deps.track ou deps.carregarTrilha (fail-closed).`,
    );
  }

  // ── 3. ADAPTADOR audit→laço (P-35) — SOMENTE `aplicar`, ANTES do audit/plano ─
  // ESCOLHA DOCUMENTADA: o DRY-RUN NÃO resolve o adaptador — `planejarReparo` é
  // FUNÇÃO PURA (zero IO, zero LLM, não toca o contrato P-35) e o dry-run só o
  // usa (A-P23-3 funciona SEM adaptador — o teste dry-run da suíte não injeta
  // nada). O modo `aplicar` usa o adaptador em TODO o caminho do laço (semear
  // pins, verificador escopado, snapshot) — por isso a resolução + GUARDA rodam
  // AQUI, no passo de deps, ANTES do audit/plano desse caminho: sem adaptador
  // (não injetado) E sem módulo carregável → `REPAIR_SEM_ADAPTADOR_AUDIT_LACO`
  // estruturado ANTES de qualquer acesso ao adaptador (fail-closed).
  let adaptador: AdaptadorAuditLaco | undefined;
  if (entrada.modo === 'aplicar') {
    const conteudos = deps.auditLaco === undefined ? conteudosDosArquivosDaTrilha(track) : {};
    const carregar = deps.carregarAdaptadorAuditLaco ?? ((cs: Record<string, string>) => Promise.resolve(adaptadorDoModuloReal(cs)));
    const resolvido = deps.auditLaco ?? (await carregar(conteudos));
    if (resolvido === null) {
      throw erroDeReparo(
        'REPAIR_SEM_ADAPTADOR_AUDIT_LACO',
        'dependencias',
        'o adaptador audit→laço (P-35: auditEmViolacoesMecanicas, criarVerificadorDeOrcamentoDaTrilha, snapshotDeOrcamentoDoAudit) não foi injetado e o módulo review/audit2Laco não pôde ser carregado — fail-closed: o laço não começa sem ele.',
      );
    }
    adaptador = resolvido;
  }

  // ── 4. audit inicial + plano puro ──────────────────────────────────────────
  const auditar = deps.auditar ?? auditTrack;
  const auditInicial = auditar(track);
  const placarInicial = placarDoAudit(auditInicial);
  const plano = planejarReparo(auditInicial);
  const lacunasNaoResolvidas = [...plano.lacunas];
  const bloqueios = [
    ...plano.estruturais,
    ...plano.ordens.filter((o) => !o.executavelNoLacoV1),
  ];
  const declaracoes: string[] = [
    'escolha B v1 (sub-fluxo de lacuna): lacunas de currículo NUNCA são consertadas reescrevendo desafio (§5.5) —',
    'viram LISTA DE BLOQUEIOS no relatório e não entram no laço; o spawn do autor P-11/P-17 + re-derivação F4 é o v2 (exige dossiê e ConceptGraph de F3, ausentes para conteúdo legado).',
  ];

  // ── 5. dry-run — NADA escrito, NENHUM LLM (A-P23-3) ────────────────────────
  if (entrada.modo === 'dry-run') {
    return {
      slug: entrada.slug,
      modo: 'dry-run',
      plano,
      auditInicial,
      placarInicial,
      lacunasNaoResolvidas,
      bloqueios,
      declaracoes: [
        ...declaracoes,
        'dry-run: nada é gravado; o plano de ações e o delta esperado seguem em plano.deltasEsperados e plano.lacunas.',
        'dry-run funciona SEM chave de API (o plano é puro); a CORREÇÃO (aplicar) exige a LLM — declarado, fail-closed.',
      ],
      escritos: [],
      llmChamado: false,
      loopRodado: false,
    };
  }

  // ── 6. nada a reparar mecanicamente → termina sem LLM (declarado) ──────────
  const ordensExecutaveis = plano.ordens.filter((o) => o.executavelNoLacoV1);
  if (ordensExecutaveis.length === 0) {
    return {
      slug: entrada.slug,
      modo: 'aplicar',
      plano,
      auditInicial,
      placarInicial,
      lacunasNaoResolvidas,
      bloqueios,
      declaracoes: [
        ...declaracoes,
        'nada a reparar mecanicamente: nenhuma violação de ORDEM executável — lacunas e bloqueios seguem declarados no relatório (nenhum LLM chamado).',
      ],
      auditFinal: auditInicial,
      placarFinal: placarInicial,
      melhorou: false,
      acessado: true,
      paradaFinal: 'mecanico',
      rodadas: [],
      escritos: [],
      loopRodado: true,
    };
  }

  // ── 7. aplicar — dependências OBRIGATÓRIAS (fail-closed, nenhuma omissão) ──
  // O adaptador foi resolvido + guardado no passo 3 (modo `aplicar`): daqui em
  // diante é NÃO-NULO — só se chega aqui depois dos returns de dry-run e de
  // "nada a reparar" acima.
  const adaptadorAplicar = adaptador as AdaptadorAuditLaco;
  if (deps.llm === undefined) {
    throw erroDeReparo(
      'REPAIR_SEM_LLM',
      'aplicar',
      'a CORREÇÃO exige a LLM corretora (P-12/P-13) cabreada em deps.llm — sem chave o dry-run funciona (o plano é puro) e o aplicar aborta DECLARANDO (docs §8; fail-closed).',
    );
  }
  if (deps.proverDesafio === undefined) {
    throw erroDeReparo(
      'REPAIR_SEM_PROVER',
      'aplicar',
      'o laço falha fechado sem verificador de provas — injete deps.proverDesafio (contrato P-31).',
    );
  }
  if (deps.gravarArquivo === undefined) {
    throw erroDeReparo('REPAIR_SEM_ESCRITA', 'aplicar', 'aplicar exige deps.gravarArquivo (a dep de gravação — teste em memória, produção fs).');
  }
  if (deps.modeloAutor === undefined || deps.modeloRevisor === undefined) {
    throw erroDeReparo(
      'REPAIR_ROTEAMENTO_INVALIDO',
      'aplicar',
      'sem modeloAutor/modeloRevisor declarados é impossível provar o roteamento (P-12) — fail-closed, o laço nem começa.',
    );
  }
  try {
    validarRoteamento(deps.modeloAutor, deps.modeloRevisor, deps.familias);
  } catch (erro) {
    throw erroDeReparo(
      'REPAIR_ROTEAMENTO_INVALIDO',
      'aplicar',
      erro instanceof Error ? erro.message : String(erro),
      erro,
    );
  }
  // ── 8. artefatos do laço (superfícies de ORDEM) + verificador escopado ─────
  const artefatos = montarArtefatos(track, ordensExecutaveis);
  const originais = new Map<string, string>(artefatos.map((a) => [a.caminho, a.conteudo]));
  const verificador = escoparVerificadorAoPlano(adaptadorAplicar.criarVerificadorDeOrcamentoDaTrilha(auditInicial), plano);
  const snapshot = adaptadorAplicar.snapshotDeOrcamentoDoAudit(auditInicial);

  const ctx: ContextoDoLaco = {
    trilha: entrada.slug,
    artefatos,
    verificadorDeOrcamento: verificador,
    snapshotDeOrcamento: snapshot,
    proverDesafio: deps.proverDesafio,
    llm: { ...deps.llm, planejar: planejadorDeduplicado(deps.llm.planejar) },
    modeloAutor: deps.modeloAutor,
    modeloRevisor: deps.modeloRevisor,
    familias: deps.familias,
    execDeReproducaoR5: deps.execDeReproducaoR5,
    rodadasMaximas: deps.rodadasMaximas ?? RODADAS_DEFAULT,
    timeoutDeExecucaoMs: deps.timeoutDeExecucaoMs,
  };

  // ── 9. sessão do laço SEMEADA com pins das violações (cada uma falha hoje) ──
  const sessao = criarSessaoDeRevisao(ctx);
  let pinsSemeados: number;
  try {
    pinsSemeados = await semearPinsNaSessao(sessao, adaptadorAplicar, auditInicial, plano, deps.proverDesafio);
  } catch (erro) {
    if (erro instanceof ErroEstruturadoDoLaco) {
      throw erroDeReparo('REPAIR_LACO_FALHOU', 'semear-pins', erro.message, erro);
    }
    throw erroDeReparo(
      'REPAIR_LACO_FALHOU',
      'semear-pins',
      erro instanceof Error ? erro.message : String(erro),
      erro,
    );
  }

  // ── 10. o laço revisor → plano → correção (gate validarDiffNoSpan interno) ──
  let resultadoDoLaco;
  try {
    resultadoDoLaco = await rodarLacoDeRevisao(ctx, sessao);
  } catch (erro) {
    if (erro instanceof ErroEstruturadoDoLaco) {
      throw erroDeReparo('REPAIR_LACO_FALHOU', 'laco-de-revisao', erro.message, erro);
    }
    throw erroDeReparo('REPAIR_LACO_FALHOU', 'laco-de-revisao', erro instanceof Error ? erro.message : String(erro), erro);
  }

  // ── 11. gravar os artefatos finais alterados (deltas mecânicos + LLM) ──────
  const conteudos = conteudosFinaisPorArquivo(track, resultadoDoLaco.artefatosFinais, originais);
  const escritos: string[] = [];
  for (const [arquivo, conteudo] of conteudos) {
    try {
      JSON.parse(conteudo);
    } catch (erro) {
      throw erroDeReparo('REPAIR_ARTEFATO_INVALIDO', 'gravar-artefatos', `JSON inválido em "${arquivo}" — nada é gravado (fail-closed).`, erro);
    }
    try {
      await deps.gravarArquivo(arquivo, conteudo);
    } catch (erro) {
      throw erroDeReparo('REPAIR_ESCRITA_FALHOU', 'gravar-artefatos', `não foi possível gravar "${arquivo}" (escrita parcial possível — fail-closed).`, erro);
    }
    escritos.push(arquivo);
  }

  // ── 12. FINAL: o audit DE NOVO e o placar comparado ao inicial (A-P23-5) ───
  const trilhaAtualizada = trilhaComArtefatosFinais(track, conteudos);
  const auditFinal = auditar(trilhaAtualizada);
  const placarFinal = placarDoAudit(auditFinal);
  const melhorou = placarFinal.violacoes < placarInicial.violacoes;

  return {
    slug: entrada.slug,
    modo: 'aplicar',
    plano,
    auditInicial,
    placarInicial,
    lacunasNaoResolvidas,
    bloqueios,
    declaracoes: [
      ...declaracoes,
      `adaptador audit→laço: ${deps.auditLaco === undefined ? 'review/audit2Laco (P-35, import estático enrolado no contrato)' : 'injetado em deps.auditLaco'}.`,
      `pins semeados na sessão do laço: ${pinsSemeados} (só violações de ORDEM executáveis — cada uma falha hoje).`,
      ...(melhorou
        ? ['PROTOCOLO P-30: o repair melhorou o placar (' + `${placarInicial.violacoes} → ${placarFinal.violacoes} violações). Se este resultado for commitado contra a trilha real, o PIN_PLACAR é bumpado NO MESMO commit (justificativa obrigatória).`]
        : ['placar não melhorou (sem bump de PIN_PLACAR).']),
    ],
    auditFinal,
    placarFinal,
    melhorou,
    acessado: resultadoDoLaco.acessado,
    paradaFinal: resultadoDoLaco.paradaFinal,
    rodadas: resultadoDoLaco.rodadas,
    escritos,
    loopRodado: true,
  };
}