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
import { limiarDeFalsoPasse, type MedicaoDeFalsoPasse } from '../quality/judgeCalibration';
import type { MedicaoSolubilidade } from '../quality/solvable';
import type { Telemetria } from '../runtime/ledger';
import { ReportSchema } from '../schemas/artifacts';

/** O relatório validado — o z.infer do ReportSchema (INV-05: todo campo existe). */
export type Report = z.infer<typeof ReportSchema>;

/** O placar no formato do repositório (§9.2). */
export interface Placar {
  passou: number;
  falhou: number;
  pendente: number;
}

/**
 * O limiar da acusação de cópia (REPLAN: Dice ≥ 0.70 sobre tokens
 * normalizados). Exportado para o teste A-P24-3 e para quem computa a seção
 * por aula fora deste relatório.
 */
export const LIMIAR_SIMILARIDADE_COPIA = 0.7;

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

export const LIMITACAO_PROVA_EXECUCAO = 'prova-de-execucao';
export const LIMITACAO_SIMILARIDADE = 'similaridade-exemplo-solucao';
export const LIMITACAO_TELEMETRIA = 'telemetria';
export const LIMITACAO_FALSO_PASSE = 'falso-passe-revisor';
export const LIMITACAO_SOLUBILIDADE = 'solubilidade';
export const LIMITACAO_ORCAMENTO_INFERIDO = 'orcamento-inferido';
export const LIMITACAO_COMANDO_NAO_DECLARADO = 'comando-nao-declarado';

// ---------------------------------------------------------------------------
// O placar (§9.2 — formato do repositório)
// ---------------------------------------------------------------------------

/** `N passou · N falhou · N pendente` — o formato exato da convenção do repo. */
export function formatarPlacar(placar: Placar): string {
  return `${placar.passou} passou · ${placar.falhou} falhou · ${placar.pendente} pendente`;
}

function placarDoAudit(totals: AuditReport['totals']): Placar {
  return {
    passou: Math.max(0, totals.desafios - totals.desafiosComViolacao),
    falhou: totals.desafiosComViolacao,
    pendente: 0, // o audit não conhece estado "pendente"; quem prova é o G-FINAL.
  };
}

// ---------------------------------------------------------------------------
// O detector de similaridade exemplo-da-teoria × solução (Dice, determinístico)
// ---------------------------------------------------------------------------

/**
 * Remove comentários e colapsa whitespace. HEURÍSTICA DOCUMENTADA: comentários
 * de linha (`//`) são removidos quando precedidos de espaço ou início de linha
 * — `//` DENTRO de string (ex.: `'http://x'`) não é tratado aqui; para o
 * detector de cópia isto é aceitável (o custo de um falso-positivo por string
 * com `://` é nulo num relatório, e a régua é a mesma para as duas entradas).
 */
export function normalizarCodigo(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:\w'"])[/][/][^\n]*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenização por fronteira: identificadores, números e cada caractere de
 * pontuação isolado, tudo em minúsculas. Mesma entrada → mesma lista (puro).
 */
export function tokenizarPorFronteira(codigo: string): string[] {
  const limpo = normalizarCodigo(codigo);
  const tokens = limpo.match(/[A-Za-z_$][A-Za-z0-9_$]*|\d+(?:\.\d+)?|[^\sA-Za-z0-9_$]/g) ?? [];
  return tokens.map((t) => t.toLowerCase());
}

/**
 * Coeficiente de Dice sobre os CONJUNTOS de tokens:
 * 2·|A∩B| / (|A|+|B|). `0..1`. Dois códigos sem token algum → 0 (sem evidência
 * não é acusação). Determinístico e puro.
 */
export function similaridadeDice(a: string, b: string): number {
  const A = new Set(tokenizarPorFronteira(a));
  const B = new Set(tokenizarPorFronteira(b));
  if (A.size === 0 && B.size === 0) return 0;
  let intersecao = 0;
  for (const token of A) if (B.has(token)) intersecao += 1;
  return (2 * intersecao) / (A.size + B.size);
}

/** `similaridadeDice(a, b) >= LIMIAR_SIMILARIDADE_COPIA` — a acusação. */
export function acusarCopia(exemploDaTeoria: string, solucao: string): boolean {
  return similaridadeDice(exemploDaTeoria, solucao) >= LIMIAR_SIMILARIDADE_COPIA;
}

// ---------------------------------------------------------------------------
// Seções derivadas do AuditReport
// ---------------------------------------------------------------------------

type ViolacaoDoReport = Report['violacoes_orcamento'][number];

/** Cada violação do audit vira uma linha no formato da violação de §5.5. */
function montarViolacoes(violations: readonly Violation[]): ViolacaoDoReport[] {
  return violations.map((v) => ({
    arquivo: v.arquivo,
    campo: v.campo,
    linha: v.linha,
    coluna: v.coluna,
    eixo: v.eixo,
    construcao: v.construcao,
    faixa: v.faixa,
    trechoOfensor: v.trechoOfensor,
    primeiraAulaQueEnsina: v.primeiraAulaQueEnsina,
    mensagem: v.mensagem,
  }));
}

/** Agrupa violações por faixa — desc por contagem, desempate alfabético. */
function agruparPorFaixa(violations: readonly Violation[]): Array<[string, number]> {
  const mapa = new Map<string, number>();
  for (const v of violations) {
    const chave = v.faixa ?? '(sem faixa)';
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Agrupa violações por superfície (`campo`) — mesma ordem determinística. */
function agruparPorSuperficie(violations: readonly Violation[]): Array<[string, number]> {
  const mapa = new Map<string, number>();
  for (const v of violations) {
    mapa.set(v.campo, (mapa.get(v.campo) ?? 0) + 1);
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function formatarGrupos(grupos: Array<[string, number]>): string {
  return grupos.map(([chave, n]) => `${chave}: ${n}`).join(', ') || '(nenhuma)';
}

/**
 * Cobertura (§9.2): conceitos sem aula dona = as chaves de construção que
 * NENHUMA aula ensina (violação com `construcao` e `primeiraAulaQueEnsina`
 * null — a LACUNA DE CURRÍCULO do audit); aulas sem desafio = métricas com
 * zero desafios (a relação inversa aula → desafio).
 */
function montarCobertura(audit: AuditReport): Report['cobertura'] {
  const semDona = new Set<string>();
  for (const v of audit.violations) {
    if (v.construcao !== null && v.primeiraAulaQueEnsina === null) semDona.add(v.construcao);
  }
  return {
    conceitos_sem_aula_dona: [...semDona].sort(),
    aulas_sem_desafio: audit.metrics.filter((m) => m.desafios === 0).map((m) => m.ref),
  };
}

/** O histograma que denuncia penhasco e platô (§9.2) — direto do `novas` do audit. */
function montarDistribuicao(audit: AuditReport): Report['distribuicao_construcoes_novas'] {
  return audit.metrics.map((m) => ({ aula: m.ref, quantidade: m.novas }));
}

/** Tokens por fase — SÓ de telemetry.jsonl (fonte única do REPLAN), soma por etapa. */
function montarTokensPorFase(telemetria: readonly Telemetria[]): Report['tokens_por_fase'] {
  const porEtapa = new Map<string, number>();
  for (const linha of telemetria) {
    const total = linha.tokensEntrada + linha.tokensSaida;
    porEtapa.set(linha.etapa, (porEtapa.get(linha.etapa) ?? 0) + total);
  }
  return [...porEtapa.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([fase, tokens]) => ({ fase, tokens }));
}

// ---------------------------------------------------------------------------
// Comandos por seção
// ---------------------------------------------------------------------------

function comandoDaSecao(comandos: Readonly<Record<string, string>> | undefined, chaves: readonly string[]): string | undefined {
  if (!comandos) return undefined;
  for (const chave of chaves) {
    const valor = comandos[chave];
    if (typeof valor === 'string' && valor.trim() !== '') return valor;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// O gerador
// ---------------------------------------------------------------------------

interface JustificativaOpts {
  audit: AuditReport;
  placar: Placar;
  comando: string;
  porFaixa: Array<[string, number]>;
  porSuperficie: Array<[string, number]>;
  solubilidade: MedicaoSolubilidade | null;
  falsoPasse: MedicaoDeFalsoPasse | null;
  linhasTelemetria: number;
  veredito: Report['veredito'];
  limiar: number;
  comandos: Readonly<Record<string, string>> | undefined;
}

function montarJustificativa(o: JustificativaOpts): string {
  const { audit, placar, comando } = o;
  const pct = audit.totals.desafios > 0
    ? Math.round((audit.totals.desafiosComViolacao / audit.totals.desafios) * 100)
    : 0;

  const secoes: string[] = [
    `Trilha \`${audit.trackSlug}\`: placar ${formatarPlacar(placar)} — ${audit.totals.desafiosComViolacao} de ${audit.totals.desafios} desafio(s) com violação de orçamento (${pct}%), ${audit.totals.violacoes} violação(ões), das quais ${audit.totals.lacunasDeCurriculo} lacuna(s) de currículo. Números reproduzíveis por: \`${comando}\`.`,
    `Agrupamento das violações — por faixa: ${formatarGrupos(o.porFaixa)}; por superfície: ${formatarGrupos(o.porSuperficie)}.`,
  ];

  if (o.solubilidade !== null) {
    const s = o.solubilidade;
    const sComando = comandoDaSecao(o.comandos, ['solubilidade']);
    secoes.push(
      `J3 solubilidade (aluno simulado, pass^k, §9.1): passou=${s.passou} (${s.tentativas} tentativa(s), taxa de acerto ${s.taxaDeAcerto}); primeira construção faltante: ${s.primeiraConstrucaoFaltante ?? '(nenhuma nomeável)'}${s.avisoTarefaQuebrada ? '; AVISO: 0% de acerto é sinal de tarefa quebrada, não de aluno incapaz' : ''}. Fonte da medição: ${sComando ?? '(comando reprodutor não declarado pelo caller)'}.`,
    );
  }

  if (o.falsoPasse !== null) {
    const f = o.falsoPasse;
    const fComando = comandoDaSecao(o.comandos, ['falso-passe', 'falsoPasse']);
    secoes.push(
      `Taxa de falso-passe do revisor contra mutantes (§6.6/§9.2): ${f.taxaGeral} em ${f.frenteAMutantes} mutante(s) (${f.amostras} amostra(s)); limiar que desliga o laço: ${o.limiar}. Fonte da medição: ${fComando ?? '(comando reprodutor não declarado pelo caller)'}.`,
    );
  }

  if (o.linhasTelemetria > 0) {
    const tComando = comandoDaSecao(o.comandos, ['telemetria', 'tokens']);
    secoes.push(
      `Tokens por fase somados de telemetry.jsonl (fonte ÚNICA de tokens do REPLAN; ${o.linhasTelemetria} linha(s)). Fonte da medição: ${tComando ?? '(comando reprodutor não declarado pelo caller)'}.`,
    );
  }

  secoes.push(
    `Veredito: ${o.veredito} — regra determinística: reprovado quando há violações de orçamento, ou a medição J3 entregue tem pass^k falso, ou a taxa de falso-passe do revisor entregue é ≥ (1−τ)/2 = ${o.limiar} (τ = 0,10, §6.6). A prova de execução dos desafios NÃO entra neste veredito: é do G-FINAL/laço, e a checagem não executada está declarada em limitacoes[] (protocolo INT-02/P-30: o placar do audit nunca piora sem declaração — este placar é DERIVADO do audit recebido, nunca redigitado aqui).`,
  );

  return secoes.join('\n');
}

function montarLimitacoes(opts: {
  temTelemetria: boolean;
  temFalsoPasse: boolean;
  temSolubilidade: boolean;
  orcamentoInferido: boolean;
  secoesSemComando: string[];
}): string[] {
  const out: string[] = [];
  // Ordem FIXA e estável — a suíte depende dela.
  out.push(
    `${LIMITACAO_PROVA_EXECUCAO}: checagem NÃO executada — a prova de execução dos desafios (solucao_passa, starter_falha, contagem_testes, stub_vazio_falha, §5.4) pertence ao G-FINAL/laço; desafios_que_falham sai vazio até a execução real.`,
  );
  out.push(
    `${LIMITACAO_SIMILARIDADE}: checagem NÃO executada — a similaridade exemplo-da-teoria × solução (Dice ≥ 0.70 sobre tokens normalizados) não é calculada NESTE relatório, que não recebe os códigos das aulas; o detector determinístico (similaridadeDice/acusarCopia) roda onde o código existe (G-FINAL/CLI).`,
  );
  if (!opts.temTelemetria) {
    out.push(
      `${LIMITACAO_TELEMETRIA}: fonte de tokens AUSENTE — telemetry.jsonl não foi fornecido; tokens_por_fase sai VAZIO (REPLAN: a ÚNICA fonte de tokens é telemetry.jsonl).`,
    );
  }
  if (!opts.temFalsoPasse) {
    out.push(
      `${LIMITACAO_FALSO_PASSE}: checagem NÃO executada — a taxa de falso-passe do revisor contra mutantes (§6.6/§9.2) não foi medida; o campo sai com zeros DECLARADOS.`,
    );
  }
  if (!opts.temSolubilidade) {
    out.push(
      `${LIMITACAO_SOLUBILIDADE}: checagem NÃO executada — a solubilidade J3 (aluno simulado, pass^k, §9.1) não foi medida; o veredito NÃO considera J3.`,
    );
  }
  for (const secao of opts.secoesSemComando) {
    out.push(
      `${LIMITACAO_COMANDO_NAO_DECLARADO}: ${secao} — os números desta seção estão no relatório, mas o caller não declarou o comando reprodutor (campo comandos['${secao}']).`,
    );
  }
  if (opts.orcamentoInferido) {
    out.push(
      `${LIMITACAO_ORCAMENTO_INFERIDO}: orçamento DERIVADO por inferência (permissivo, §3.2) — todo número de violações é um PISO: o valor real é maior ou igual ao reportado.`,
    );
  }
  return out;
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
  const reprovado =
    audit.totals.violacoes > 0 ||
    (solubilidade !== null && !solubilidade.passou) ||
    (falsoPasse !== null && falsoPasse.taxaGeral >= limiar);
  const veredito: Report['veredito'] = reprovado ? 'reprovado' : 'aprovado';

  const comando =
    comandoDaSecao(comandos, ['audit', 'principal']) ?? comandoAuditPadrao(audit.trackSlug);

  // Proveniência: seções presentes sem comando declarado viram limitação.
  const secoesSemComando: string[] = [];
  if (solubilidade !== null && comandoDaSecao(comandos, ['solubilidade']) === undefined) secoesSemComando.push('solubilidade');
  if (falsoPasse !== null && comandoDaSecao(comandos, ['falso-passe', 'falsoPasse']) === undefined) secoesSemComando.push('falso-passe');
  if (telemetria.length > 0 && comandoDaSecao(comandos, ['telemetria', 'tokens']) === undefined) secoesSemComando.push('telemetria');

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
    taxa_falso_passe_revisor:
      falsoPasse === null
        ? { amostras: 0, frente_a_mutantes: 0, taxa: 0 } // zeros DECLARADOS em limitacoes.
        : { amostras: falsoPasse.amostras, frente_a_mutantes: falsoPasse.frenteAMutantes, taxa: falsoPasse.taxaGeral },
    tokens_por_fase: montarTokensPorFase(telemetria),
    limitacoes,
    justificativa,
    veredito,
  };

  return ReportSchema.parse(relatorio);
}