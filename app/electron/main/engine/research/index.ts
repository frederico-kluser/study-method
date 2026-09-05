/**
 * app/electron/main/engine/research/index.ts — A API PÚBLICA da camada de
 * pesquisa em camadas com procedência.
 *
 * É por aqui que o subcomando de CLI da onda seguinte entra. O caminho mínimo:
 *
 *   import {
 *     criarPesquisaEmCamadas, criarAnalisadorLlm, executorSurfReal,
 *   } from '../../electron/main/engine/research';
 *
 *   const pesquisa = criarPesquisaEmCamadas({
 *     executor: executorSurfReal,                 // troque por fake no teste
 *     analisador: criarAnalisadorLlm({ llm, stageVersion: 'pesquisa@1', timeoutMs: 120_000 }),
 *     config: {
 *       camadas: 2, subAgents: 5, maxDepth: 3, maxRounds: 4,
 *       lacunasPorCamada: 3, timeoutMsPorCamada: 300_000,
 *       timeoutMsDaAnalise: 120_000, stageVersion: 'pesquisa@1',
 *     },
 *   });
 *   const r = await pesquisa.executar(contexto);  // lança PesquisaError, fail-closed
 *   // r.fontes  → TrackSourceLink[] pronto para TrackLessonSource.sources
 *
 * `llm` é o `EngineLlm` de `runtime/callLlm.ts` — o transporte único (INV-01),
 * que já resolve modelo (GLM 5.3 Flash), raciocínio no máximo, semáforo,
 * backoff, timeout por etapa, cache e log sanitizado. Este módulo NÃO cria
 * transporte nenhum.
 */

export { PESQUISA_CODES, PesquisaError } from './errors';
export type { PesquisaErrorCode, PesquisaErrorOptions } from './errors';

export {
  fontesDoEnvelope,
  parseEnvelopeDoSurf,
  queriesExecutadas,
  trechosPorUrl,
  urlCitavel,
  TETO_DESCRICAO,
} from './surfEnvelope';
export type {
  FonteComProcedencia,
  SurfDiagnostics,
  SurfEnvelope,
  SurfLedger,
  SurfLedgerResult,
  SurfLedgerRow,
  SurfLedgerStats,
  SurfPlan,
  SurfPlanQuery,
  SurfSource,
} from './surfEnvelope';

export {
  BIN_SURF,
  IMPERATIVOS_DE_PROFUNDIDADE,
  MAX_DEPTH,
  MAX_ROUNDS,
  MAX_SUB_AGENTS,
  TETO_ITENS_JA_ENSINADO,
  contemImperativoDeProfundidade,
  filtrarLacunasRepetidas,
  montarArgv,
  montarBrief,
  normalizarPergunta,
  validarContexto,
} from './surfBrief';
export type {
  BriefDoSurf,
  ContextoDaTrilha,
  FerramentaDoSurf,
  Lacuna,
  OpcoesDoComando,
  TipoDeCamada,
} from './surfBrief';

export {
  SURF_EXIT,
  TETO_STDERR_EM_ERRO,
  executorSurfReal,
  interpretarSaidaDoSurf,
  redigirSegredos,
  rodarSurf,
} from './surfRunner';
export type {
  ExecutorDeProcesso,
  OpcoesDeExecucao,
  ResultadoDoSurf,
  SaidaDoProcesso,
} from './surfRunner';

export { REPROVACOES, exigirAprovacao, portaoDeQualidade } from './qualityGate';
export type {
  AfirmacaoComFonte,
  Aviso,
  ColheitaParaGate,
  MotivoDeReprovacao,
  Reprovacao,
  ResultadoDoGate,
} from './qualityGate';

export {
  SCHEMA_PESQUISA_EM_CAMADAS,
  TETO_CAMADAS,
  TETO_EVIDENCIA_PADRAO,
  TETO_LACUNAS_POR_CAMADA,
  criarAnalisadorLlm,
  criarPesquisaEmCamadas,
  extrairJson,
  montarPromptDaAnalise,
  normalizarAnalise,
  validarConfig,
} from './camadas';
export type {
  AnaliseDaColheita,
  AnalisadorDeColheita,
  ConfigDaPesquisa,
  DepsDaPesquisa,
  DepsDoAnalisadorLlm,
  EntradaDaAnalise,
  ItemDeEvidencia,
  PesquisaEmCamadas,
  RelatorioDeCamada,
  ResultadoDaPesquisa,
} from './camadas';
