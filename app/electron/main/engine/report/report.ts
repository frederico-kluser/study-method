/**
 * app/electron/main/engine/report/report.ts — o RELATÓRIO/PLACAR da engine de
 * trilhas (F12, `docs/16-engine-de-trilha.md` §9.2 e §9.4) — pacote P-24.
 *
 * PROBLEMA: a engine produz números espalhados — violações do audit (P-30),
 * medidas de qualidade dos pacotes P-19 (solubilidade J3) e P-20 (falso-passe
 * do revisor), telemetria do P-03 — e o placar final (`report.json`) precisa
 * fechá-los num artefato ÚNICO, validado por `ReportSchema`, com TODO número
 * acompanhado do comando que o reproduz e TODA limitação (sem chave, sem rede,
 * checagem não executada) DECLARADA em `limitacoes[]` — nunca omitida (§9.2).
 *
 * O QUE ESTE MÓDULO FAZ:
 *   - `gerarRelatorio(deps)` — função PURA e SÍNCRONA: recebe o `AuditReport`
 *     (obrigatório) e as medições opcionais JÁ PRODUZIDAS (telemetria lida de
 *     telemetry.jsonl, solubilidade do P-19, falso-passe do P-20) e devolve o
 *     relatório preenchido, validado com `ReportSchema.parse`.
 *   - O DETECTOR de cópia exemplo-da-teoria × solução — `normalizarCodigo` /
 *     `tokenizarPorFronteira` / `similaridadeDice` / `acusarCopia`: coeficiente
 *     de Dice sobre conjuntos de tokens de código NORMALIZADOS (comentários e
 *     whitespace removidos, tokenização por fronteira); limiar 0,70 → acusar.
 *     É a régua do REPLAN para similaridade (J2/J3): determinística, zero LLM,
 *     zero IO — a mesma para o teste A-P24-3 e para quem tem os códigos.
 *
 * O QUE ESTE MÓDULO NÃO FAZ (limites EXPLÍCITOS — todos vão para a saída):
 *   - NÃO executa as QUATRO provas de execução (`solucao_passa`,
 *     `starter_falha`, `contagem_testes`, `stub_vazio_falha`, §5.4): elas
 *     pertencem ao G-FINAL/laço. `desafios_que_falham` sai VAZIO e a limitação
 *     `prova-de-execucao` é SEMPRE declarada (A-P24-1).
 *   - NÃO calcula a similaridade por aula DENTRO do relatório: a assinatura
 *     não recebe os códigos das aulas (premissa do replan), então a seção sai
 *     vazia e a limitação `similaridade-exemplo-solucao` é SEMPRE declarada;
 *     o detector exportado roda onde o código existe (G-FINAL/CLI).
 *   - NÃO chama LLM, NÃO abre arquivo, NÃO vai à rede.
 *
 * VEREDITO (determinístico e documentado): `aprovado` SOMENTE quando nenhuma
 * checagem EXECUTADA falhou — violações de orçamento zero E (se a medição J3
 * foi entregue) pass^k verdadeiro E (se a calibração foi entregue) taxa de
 * falso-passe < (1−τ)/2 (0,45 com τ = 0,10, §6.6). Checagem NÃO executada nem
 * aprova nem reprova: ela é declarada em `limitacoes[]` e o veredito cobre só o
 * que foi medido. A prova de execução fica explicitamente fora (é do G-FINAL)
 * e isso é dito na justificativa — a omissão DECLARADA não é aprovação por
 * omissão (§9.3).
 *
 * A BARRA A17–A23 NO RELATÓRIO (2026-09-22). O `auditTrack` passou a rodar a
 * barra pedagógica (`engine/quality/barra.ts`) e a mesclar os achados dela em
 * `violations` — então TUDO o que este módulo deriva do audit já a inclui, sem
 * uma linha de cálculo aqui: `violacoes_orcamento` traz os achados A17–A23 (com
 * a evidência no `trechoOfensor`), e o `veredito` reprova quando há erro de
 * barra, pela MESMA regra de sempre (`audit.totals.violacoes > 0`).
 *
 * O que PRECISOU de código foi a justificativa. O `placar` do repositório conta
 * DESAFIO (`N passou · N falhou · N pendente`, derivado de
 * `desafiosComViolacao`), e o achado da barra é da AULA — uma trilha pode sair
 * `reprovado` com `0 falhou`. Sem dizer de onde veio o veredito, esse par
 * pareceria contradição; a seção da barra na justificativa (erros por regra,
 * aulas com erro, avisos A22, o comando que reproduz) é o que o fecha.
 *
 * PROTOCOLO INT-02 (P-30): o placar do G-AUDIT nunca piora sem declaração, e o
 * bump exige a declaração NO MESMO commit. Este módulo NÃO redigita número de
 * placar nenhum: ele DERIVA o placar do `AuditReport` que recebe.
 *
 * (2026-09-02) O pin concreto do protocolo vivia em
 * `app/tests/engineAuditPlacar.test.ts` (`PIN_PLACAR` = 717/112/249), medido
 * contra a trilha de produção `nodejs-do-zero`. A trilha foi apagada (ver
 * `docs/15-trilha-nodejs.md`) e o pin saiu com ela — hoje NÃO existe trilha
 * publicada, logo não existe número a pinar. A regra continua de pé para a
 * próxima trilha; quem a re-pinar cria o teste de pin de novo.
 *
 * COMANDOS — o campo `comando` do relatório reproduz os números centrais (o
 * audit da trilha): default `cd app && npm run engine -- audit <trilha>
 * --limite 0` (§9.4, convenção do repo), sobreponível via
 * `deps.comandos['audit']` (ou `['principal']`). Os comandos das seções
 * opcionais são declarados em `deps.comandos` nas chaves `telemetria`/`tokens`,
 * `falso-passe`/`falsoPasse`, `solubilidade`. Seção PRESENTE sem comando
 * declarado NÃO fica órfã em silêncio: gera a limitação `comando-nao-declarado`
 * (todo número tem comando — ou a falta dele é declaração).
 */

import { z } from 'zod';

import type { AuditReport, Violation } from '../audit';
import type { Placar, Report } from './reportSecoes';
import { REGRAS_DA_BARRA } from '../quality/barra';
import { limiarDeFalsoPasse, type MedicaoDeFalsoPasse } from '../quality/judgeCalibration';
import type { MedicaoSolubilidade } from '../quality/solvable';
import type { Telemetria } from '../runtime/ledger';
import { ReportSchema } from '../schemas/artifacts';
import {
  agruparPorFaixa,
  agruparPorSuperficie,
  comandoDaSecao,
  formatarPlacar,
  montarCobertura,
  montarDistribuicao,
  montarJustificativa,
  montarLimitacoes,
  montarTokensPorFase,
  montarViolacoes,
} from './reportSecoes';

// O placar, as seções e o detector de cópia vivem em `reportSecoes.ts` e
// `reportSimilaridade.ts` (refatoração L05) — re-exportados pelos MESMOS
// nomes de antes.
export { formatarPlacar } from './reportSecoes';
export type { Placar } from './reportSecoes';
export {
  LIMIAR_SIMILARIDADE_COPIA,
  acusarCopia,
  normalizarCodigo,
  similaridadeDice,
  tokenizarPorFronteira,
} from './reportSimilaridade';

// O tipo `Report` vive em `reportSecoes.ts` (refatoração L05) — re-exportado
// pelo MESMO nome de antes.
export type { Report } from './reportSecoes';

/**
 * O comando canônico do audit (§9.4 e README da engine), o mesmo que o
 * REPLAN usa como exemplo: `cd app && npm run engine -- audit <slug> --limite 0`.
 */
export function comandoAuditPadrao(trilha: string): string {
  return `cd app && npm run engine -- audit ${trilha} --limite 0`;
}

// ---------------------------------------------------------------------------
// Dependências do gerador
// ---------------------------------------------------------------------------

/**
 * Tudo o que o relatório consome. `auditReport` é obrigatório; as medições
 * opcionais, quando AUSENTES, produzem campo vazio/zero + limitação NOMEADA —
 * nunca um número fabricado (A-P24-1). `null` é aceito como ausência
 * explícita, por conveniência do chamador.
 */
export interface DepsDoRelatorio {
  auditReport: AuditReport;
  /** linhas de telemetry.jsonl (fonte ÚNICA de tokens — REPLAN). */
  telemetria?: readonly Telemetria[] | null;
  /** medição J3 (P-19) de UM desafio — resumo na justificativa, nunca inventado. */
  solubilidade?: MedicaoSolubilidade | null;
  /** calibração do revisor contra mutantes (P-20) — alimenta o placar §9.2. */
  falsoPasse?: MedicaoDeFalsoPasse | null;
  /**
   * comandos reprodutores por seção. Chaves reconhecidas:
   * `audit`/`principal` (o `comando` do relatório), `telemetria`/`tokens`,
   * `falso-passe`/`falsoPasse`, `solubilidade`.
   */
  comandos?: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Limitações NOMEADAS (A-P24-1) — `limitacoes[]` sempre com entradas nomeadas
// ---------------------------------------------------------------------------

// As limitações NOMEADAS vivem em `reportSecoes.ts` (refatoração L05) e são
// re-exportadas pelos MESMOS nomes de antes.
export {
  LIMITACAO_COMANDO_NAO_DECLARADO,
  LIMITACAO_FALSO_PASSE,
  LIMITACAO_ORCAMENTO_INFERIDO,
  LIMITACAO_PROVA_EXECUCAO,
  LIMITACAO_SIMILARIDADE,
  LIMITACAO_SOLUBILIDADE,
  LIMITACAO_TELEMETRIA,
} from './reportSecoes';

// ---------------------------------------------------------------------------
// O placar (§9.2 — formato do repositório)
// ---------------------------------------------------------------------------

function placarDoAudit(totals: AuditReport['totals']): Placar {
  return {
    passou: Math.max(0, totals.desafios - totals.desafiosComViolacao),
    falhou: totals.desafiosComViolacao,
    pendente: 0, // o audit não conhece estado "pendente"; quem prova é o G-FINAL.
  };
}

// ---------------------------------------------------------------------------
// Seções derivadas do AuditReport
// ---------------------------------------------------------------------------

/**
 * Gera o relatório/placar (F12) de uma trilha. PURO e SÍNCRONO: recebe o audit
 * e as medições prontas, devolve o `Report` validado por `ReportSchema`.
 *
 * Falha rápido (fail-closed, §9.3) quando a saída montada não valida — a
 * assinatura é o contrato: se `gerarRelatorio` produzir algo que o schema
 * rejeita, é ERRO de implementação, nunca um relatório inválido em silêncio.
 */
/** O veredito determinístico — reprovado por violações, J3 falsa ou falso-passe ≥ limiar. */
function reprovadoPor(
  audit: AuditReport,
  solubilidade: MedicaoSolubilidade | null,
  falsoPasse: MedicaoDeFalsoPasse | null,
  limiar: number,
): boolean {
  return (
    audit.totals.violacoes > 0 ||
    (solubilidade !== null && !solubilidade.passou) ||
    (falsoPasse !== null && falsoPasse.taxaGeral >= limiar)
  );
}

/** Proveniência: seções presentes sem comando declarado viram limitação. */
function secoesSemComandoDe(
  solubilidade: MedicaoSolubilidade | null,
  falsoPasse: MedicaoDeFalsoPasse | null,
  telemetria: readonly Telemetria[],
  comandos: Readonly<Record<string, string>> | undefined,
): string[] {
  const secoesSemComando: string[] = [];
  if (solubilidade !== null && comandoDaSecao(comandos, ['solubilidade']) === undefined) secoesSemComando.push('solubilidade');
  if (falsoPasse !== null && comandoDaSecao(comandos, ['falso-passe', 'falsoPasse']) === undefined) secoesSemComando.push('falso-passe');
  if (telemetria.length > 0 && comandoDaSecao(comandos, ['telemetria', 'tokens']) === undefined) secoesSemComando.push('telemetria');
  return secoesSemComando;
}

/** A taxa de falso-passe do relatório — zeros DECLARADOS em limitacoes quando ausente. */
function taxaFalsoPasseDoRelatorio(falsoPasse: MedicaoDeFalsoPasse | null): Report['taxa_falso_passe_revisor'] {
  return falsoPasse === null
    ? { amostras: 0, frente_a_mutantes: 0, taxa: 0 } // zeros DECLARADOS em limitacoes.
    : { amostras: falsoPasse.amostras, frente_a_mutantes: falsoPasse.frenteAMutantes, taxa: falsoPasse.taxaGeral };
}

/**
 * Gera o relatório/placar (F12) de uma trilha. PURO e SÍNCRONO: recebe o audit
 * e as medições prontas, devolve o `Report` validado por `ReportSchema`.
 *
 * Falha rápido (fail-closed, §9.3) quando a saída montada não valida — a
 * assinatura é o contrato: se `gerarRelatorio` produzir algo que o schema
 * rejeita, é ERRO de implementação, nunca um relatório inválido em silêncio.
 */
export function gerarRelatorio(deps: DepsDoRelatorio): Report {
  const audit = deps.auditReport;
  const telemetria = deps.telemetria ?? [];
  const solubilidade = deps.solubilidade ?? null;
  const falsoPasse = deps.falsoPasse ?? null;
  const comandos = deps.comandos;

  const placar = placarDoAudit(audit.totals);
  const porFaixa = agruparPorFaixa(audit.violations);
  const porSuperficie = agruparPorSuperficie(audit.violations);

  const limiar = limiarDeFalsoPasse();
  const veredito: Report['veredito'] = reprovadoPor(audit, solubilidade, falsoPasse, limiar) ? 'reprovado' : 'aprovado';

  const comando =
    comandoDaSecao(comandos, ['audit', 'principal']) ?? comandoAuditPadrao(audit.trackSlug);

  const secoesSemComando = secoesSemComandoDe(solubilidade, falsoPasse, telemetria, comandos);

  const limitacoes = montarLimitacoes({
    temTelemetria: telemetria.length > 0,
    temFalsoPasse: falsoPasse !== null,
    temSolubilidade: solubilidade !== null,
    orcamentoInferido: audit.budgetSource === 'inferred',
    secoesSemComando,
  });

  const justificativa = montarJustificativa({
    audit,
    placar,
    comando,
    porFaixa,
    porSuperficie,
    solubilidade,
    falsoPasse,
    linhasTelemetria: telemetria.length,
    veredito,
    limiar,
    comandos,
  });

  const relatorio: Report = {
    trilha: audit.trackSlug,
    comando,
    gerado_em: new Date().toISOString(),
    placar,
    violacoes_orcamento: montarViolacoes(audit.violations),
    desafios_que_falham: [], // provas de execução são do G-FINAL/laço — ver limitacoes.
    cobertura: montarCobertura(audit),
    distribuicao_construcoes_novas: montarDistribuicao(audit),
    similaridade_exemplo_solucao: [], // ver limitacoes — este relatório não recebe os códigos.
    taxa_falso_passe_revisor: taxaFalsoPasseDoRelatorio(falsoPasse),
    tokens_por_fase: montarTokensPorFase(telemetria),
    limitacoes,
    justificativa,
    veredito,
  };

  return ReportSchema.parse(relatorio);
}
