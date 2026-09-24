/**
 * app/electron/main/engine/runtime/runStateModel.ts — MODELO do estado do run
 * da engine de trilhas: layout de disco, ordem fixa das fases (F0..F12), tipos
 * do `run.json`, erro estruturado e os predicados compartilhados.
 *
 * EXTRAÍDO de `runtime/runState.ts` na refatoração L06 (arquivo ≤500 linhas,
 * CC≤8, comportamento observável preservado). O caminho PÚBLICO continua sendo
 * `runtime/runState.ts` — fachada fina que reexporta daqui e dos irmãos
 * (`runStateValidate.ts`, `runStateMachine.ts`, `runStateIo.ts`); nenhum
 * consumidor mudou de import. A documentação de DECISÃO (D-WRITE,
 * D-ESCRITOR-UNICO, D-ETAPA, CONTRATO DE RETOMADA) vive no cabeçalho da
 * fachada e nos módulos que implementam cada decisão.
 */

import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Layout de disco (declarado, não tocado)
// ---------------------------------------------------------------------------

/** Nome do arquivo de estado do run. */
export const RUN_FILENAME = 'run.json';
/** Nome do ledger append-only encadeado por hash. */
export const LEDGER_FILENAME = 'ledger.jsonl';
/** Nome do arquivo de telemetria (usage/latência/contagem). */
export const TELEMETRY_FILENAME = 'telemetry.jsonl';

/**
 * Raiz de trabalho da engine — onde run.json/ledger.jsonl/telemetry.jsonl e os
 * artefatos intermediários de F0..F12 ficam. É INJETÁVEL: o chamador passa o
 * diretório (nos testes, sempre um diretório temporário criado e limpo pelo
 * próprio teste). Esta constante declara o layout em relação à raiz do app.
 */
export const CONTENT_SRC_DIR = 'app/content-src';

/**
 * Produto final da engine — onde F12 materializa a trilha pronta. NINGUÉM
 * escreve aqui fora do integrador de F12; este pacote só declara a constante.
 */
export const TRACKS_OUTPUT_DIR = 'app/resources/tracks';

/** Raiz de trabalho de uma trilha: `app/content-src/<slug>/`. */
export function raizTrabalhoSlug(slug: string): string {
  return path.join(CONTENT_SRC_DIR, slug);
}

/** Diretório do produto final: `app/resources/tracks/<slug>/`. */
export function dirProdutoFinal(slug: string): string {
  return path.join(TRACKS_OUTPUT_DIR, slug);
}

// ---------------------------------------------------------------------------
// Fases (docs/16-engine-de-trilha.md §4) e erros estruturados
// ---------------------------------------------------------------------------

/**
 * Ordem FIXA das fases — a tabela de §4, na ordem da coluna "Fase". É a única
 * ordem aceita pela máquina: uma transição aponta sempre da fase N para N+1.
 */
export const FASES_ORDEM = [
  'F0',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
] as const;

/** Identidade de fase (união literal derivada de FASES_ORDEM). */
export type FaseId = (typeof FASES_ORDEM)[number];

/**
 * Identidade de ETAPA no mapa `modelosPorEtapa`. Nesta onda, etapa = fase
 * (D-ETAPA); ondas 2-4 podem refinar. A validação de `modelosPorEtapa` aceita
 * exatamente chaves de `FASES_ORDEM`.
 */
export type EtapaId = FaseId;

/** Status de uma fase na máquina. */
export type StatusFase = 'pendente' | 'em_andamento' | 'done';

/** Códigos de erro estruturado do runState (INV-03, A-P03-3). */
export type RunStateErrorCode =
  | 'RUN_JSON_AUSENTE' // run.json não existe — explícito, nunca null silencioso
  | 'RUN_JSON_CORROMPIDO' // arquivo não parseia como JSON
  | 'RUN_JSON_INVALIDO' // parseia, mas algum campo viola o schema
  | 'IO_ERRO' // falha de disco ao ler/gravar
  | 'SLUG_INVALIDO' // slug fora do padrão seguro (defesa de caminho)
  | 'FASE_INVALIDA' // valor que não é uma FaseId
  | 'TRANSICAO_INVALIDA'; // transição fora da ordem fixa ou do status atual

/**
 * Erro estruturado do estado do run. TODO caminho de falha do runState passa
 * por aqui — com código, mensagem e (quando aplicável) o campo ofensor.
 * Nunca um `null` retornado em silêncio (A-P03-3).
 */
export class RunStateError extends Error {
  readonly code: RunStateErrorCode;
  /** Campo do schema que violou (quando o erro é de shape). */
  readonly campo?: string;

  constructor(code: RunStateErrorCode, mensagem: string, campo?: string) {
    super(mensagem);
    this.name = 'RunStateError';
    this.code = code;
    this.campo = campo;
  }
}

// ---------------------------------------------------------------------------
// Schema do run.json — TODO campo obrigatório (regra dura 3 do plano)
// ---------------------------------------------------------------------------

export interface RunState {
  /** Versão do schema de run.json — comparada por igualdade estrita. */
  schemaVersion: 1;
  /** Identificador do run (UUID v4, gerado em criarRun). */
  runId: string;
  /** Slug da trilha em geração (padrão seguro — defesa de caminho). */
  slug: string;
  /** Momento de criação, ISO-8601. */
  criadoEm: string;
  /** Momento da ÚLTIMA PERSISTÊNCIA, ISO-8601 (estampado por salvarRun). */
  atualizadoEm: string;
  /**
   * Fase atual da máquina: a primeira fase NÃO concluída (pendente ou
   * em_andamento) durante o run; 'F12' num run concluído.
   */
  faseAtual: FaseId;
  /** Status de cada fase da ordem fixa. */
  fases: Record<FaseId, StatusFase>;
  /** Hash sha256 (hex, 64) do orçamento congelado — derivado em F5 (P-10). */
  budgetHash: string;
  /** Hash sha256 (hex, 64) do grafo congelado — derivado em F5 (P-10). */
  graphHash: string;
  /**
   * Mapa etapa→modelo (D-ETAPA). Chaves válidas: FASES_ORDEM. O mapa é
   * PREENCHIDO LAZY — uma fase só ganha modelo quando o roteador decide — por
   * isso o tipo é PARCIAL (subset de chaves ok); chave desconhecida ou valor
   * vazio continua sendo ERRO na validação.
   */
  modelosPorEtapa: Partial<Record<EtapaId, string>>;
  /** Versão dos prompts canônicos usados no run (docs/16 §7). */
  promptVersao: string;
  /** Versão do catálogo de ações/construções usado no run. */
  catalogoVersao: string;
}

/** Entrada de criarRun — todos os campos externos obrigatórios. */
export interface CriarRunInput {
  slug: string;
  budgetHash: string;
  graphHash: string;
  modelosPorEtapa: Partial<Record<EtapaId, string>>;
  promptVersao: string;
  catalogoVersao: string;
}

/** Padrão seguro de slug de trilha — sem `.` nem `/`: impossível escapar do diretório. */
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;
/** sha256 em hex — 64 caracteres [0-9a-f]. */
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/** É um slug seguro de trilha? (exportado: F5 e o CLI revalidam a mesma regra). */
export function isSlugValido(valor: unknown): valor is string {
  return typeof valor === 'string' && SLUG_RE.test(valor);
}

/** É um hash sha256 em hex (64 chars)? (exportado: F5 e o CLI revalidam). */
export function isHashSha256(valor: unknown): valor is string {
  return typeof valor === 'string' && SHA256_HEX_RE.test(valor);
}

/** É uma FaseId da ordem fixa? */
export function isFaseId(valor: unknown): valor is FaseId {
  return typeof valor === 'string' && (FASES_ORDEM as readonly string[]).includes(valor);
}

/** É um status de fase válido? (uso interno do pacote runState). */
export function isStatusFase(valor: unknown): valor is StatusFase {
  return valor === 'pendente' || valor === 'em_andamento' || valor === 'done';
}

/** É data ISO-8601 parseável? (frouxo por design — ver cabeçalho do ledger). */
export function isDataISO(valor: unknown): valor is string {
  return typeof valor === 'string' && !Number.isNaN(Date.parse(valor));
}

/** Mensagem legível de um erro desconhecido (uso interno do pacote runState). */
export function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** O erro estruturado padrão de `run.json` inválido, nomeando o campo. */
export function invalido(campo: string, motivo: string): RunStateError {
  return new RunStateError('RUN_JSON_INVALIDO', `run.json inválido em '${campo}': ${motivo}`, campo);
}
