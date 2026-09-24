/**
 * app/electron/main/engine/audit.ts — FACHADA FINA do gate de auditoria.
 *
 * A implementação vive, desde a refatoração do lote L05, em módulos irmãos
 * (≤500 linhas cada, todos com complexidade ciclomática ≤8 por função):
 *
 *   `auditCore.ts`        — `auditTrack` (o orquestrador) e o doc do gate;
 *   `auditTypes.ts`       — os tipos do relatório (`AuditReport`, `Violation`…);
 *   `auditSuperficies.ts` — as superfícies do desafio e as baterias A13–A23;
 *   `auditEstruturais.ts` — os invariantes I12–I17;
 *   `auditAula.ts`        — a caminhada por aula (A1–A6, A11, DEC);
 *   `auditModulo.ts`      — o desafio de módulo;
 *   `auditResumo.ts`      — limitações declaradas, placar e formatadores;
 *   `auditMensagens.ts`   — a tradução achado → violação.
 *
 * ESTE CAMINHO PÚBLICO NÃO MUDA: tudo é re-exportado pelos MESMOS nomes de
 * antes, e nenhum consumidor altera import.
 */

export { auditTrack } from './auditCore';
export { linhasDeLimitacoes, linhasDoPlacarDaBarra } from './auditResumo';
export type {
  AuditReport,
  AuditRule,
  BudgetRule,
  LessonMetrics,
  LimitacaoDeclarada,
  MetricasDaBarraNaAula,
  PlacarDaBarra,
  StructureRule,
  Surface,
  Violation,
} from './auditTypes';
