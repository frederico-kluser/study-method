/**
 * app/electron/main/engine/report/reportSecoes.ts — as SEÇÕES derivadas do
 * `AuditReport` do relatório (`report.ts`): violações, agrupamentos, cobertura,
 * distribuição, tokens por fase, a JUSTIFICATIVA e as limitações. Extraídas do
 * módulo original na refatoração do lote L05 sem NENHUMA mudança de
 * comportamento (a justificativa é contrato de saída) — a fachada `report.ts`
 * re-exporta o que é público.
 */

import { z } from 'zod';

import { ReportSchema } from '../schemas/artifacts';
import { REGRAS_DA_BARRA } from '../quality/barra';
import type { MedicaoDeFalsoPasse } from '../quality/judgeCalibration';
import type { MedicaoSolubilidade } from '../quality/solvable';
import type { Telemetria } from '../runtime/ledger';
import type { AuditReport, Violation } from '../audit';

/** O relatório validado — o z.infer do ReportSchema (INV-05: todo campo existe). */
export type Report = z.infer<typeof ReportSchema>;

export const LIMITACAO_PROVA_EXECUCAO = 'prova-de-execucao';
export const LIMITACAO_SIMILARIDADE = 'similaridade-exemplo-solucao';
export const LIMITACAO_TELEMETRIA = 'telemetria';
export const LIMITACAO_FALSO_PASSE = 'falso-passe-revisor';
export const LIMITACAO_SOLUBILIDADE = 'solubilidade';
export const LIMITACAO_ORCAMENTO_INFERIDO = 'orcamento-inferido';
export const LIMITACAO_COMANDO_NAO_DECLARADO = 'comando-nao-declarado';

type ViolacaoDoReport = Report['violacoes_orcamento'][number];

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


/** `N passou · N falhou · N pendente` — o formato exato da convenção do repo. */
export function formatarPlacar(placar: Placar): string {
  return `${placar.passou} passou · ${placar.falhou} falhou · ${placar.pendente} pendente`;
}


// ---------------------------------------------------------------------------
// Seções derivadas do AuditReport
// ---------------------------------------------------------------------------

/** Cada violação do audit vira uma linha no formato da violação de §5.5. */
export function montarViolacoes(violations: readonly Violation[]): ViolacaoDoReport[] {
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
export function agruparPorFaixa(violations: readonly Violation[]): Array<[string, number]> {
  const mapa = new Map<string, number>();
  for (const v of violations) {
    const chave = v.faixa ?? '(sem faixa)';
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** Agrupa violações por superfície (`campo`) — mesma ordem determinística. */
export function agruparPorSuperficie(violations: readonly Violation[]): Array<[string, number]> {
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
export function montarCobertura(audit: AuditReport): Report['cobertura'] {
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
export function montarDistribuicao(audit: AuditReport): Report['distribuicao_construcoes_novas'] {
  return audit.metrics.map((m) => ({ aula: m.ref, quantidade: m.novas }));
}

/** Tokens por fase — SÓ de telemetry.jsonl (fonte única do REPLAN), soma por etapa. */
export function montarTokensPorFase(telemetria: readonly Telemetria[]): Report['tokens_por_fase'] {
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

export function comandoDaSecao(comandos: Readonly<Record<string, string>> | undefined, chaves: readonly string[]): string | undefined {
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

/** O cabeçalho (placar + agrupamentos) da justificativa. */
function cabecalhoDaJustificativa(o: JustificativaOpts): string[] {
  const { audit, placar, comando } = o;
  const pct = audit.totals.desafios > 0
    ? Math.round((audit.totals.desafiosComViolacao / audit.totals.desafios) * 100)
    : 0;
  return [
    `Trilha \`${audit.trackSlug}\`: placar ${formatarPlacar(placar)} — ${audit.totals.desafiosComViolacao} de ${audit.totals.desafios} desafio(s) com violação de orçamento (${pct}%), ${audit.totals.violacoes} violação(ões), das quais ${audit.totals.lacunasDeCurriculo} lacuna(s) de currículo. Números reproduzíveis por: \`${comando}\`.`,
    `Agrupamento das violações — por faixa: ${formatarGrupos(o.porFaixa)}; por superfície: ${formatarGrupos(o.porSuperficie)}.`,
  ];
}

/**
 * A BARRA A17–A23, quando o audit a mediu. GUARDADA por `!== undefined`
 * porque `AuditReport.barra` é ADITIVO: um relatório montado à mão (fixture)
 * não a tem, e escrever "0 erros de barra" sobre uma medição que não existe é
 * a aprovação por omissão do §9.3. Só as regras COM achado entram na frase —
 * as que deram zero estão no `audit.barra.porRegra`, e o comando abaixo as
 * imprime todas.
 */
function secaoDaBarra(o: JustificativaOpts): string | null {
  if (o.audit.barra === undefined) return null;
  const b = o.audit.barra;
  const porRegra = b.porRegra
    .filter((r) => r.erros > 0)
    .map((r) => `${r.regra} ${r.erros}`)
    .join(' · ');
  // A FAIXA sai do catálogo (`REGRAS_DA_BARRA`), nunca de uma string cravada:
  // a barra ganhou A24 em 2026-09-22 e um texto fixo em "A17–A23" passaria a
  // mentir sobre o que os números desta frase contam.
  const avisos = b.porRegra.filter((r) => r.avisos > 0).map((r) => `${r.regra} ${r.avisos}`).join(' · ');
  return (
    `Barra pedagógica ${REGRAS_DA_BARRA[0]}–${REGRAS_DA_BARRA[REGRAS_DA_BARRA.length - 1]} ` +
    `(agnóstica de linguagem, quality/barra.ts — teto do passo, primeira aula, ` +
    `declarar-não-é-demonstrar, aula sem prova, carga de novidade, duas formas, regra do par): ` +
    `${b.erros} erro(s)${porRegra === '' ? '' : ` (${porRegra})`} em ` +
    `${b.aulasComErro} aula(s), ${b.avisos} aviso(s)${avisos === '' ? '' : ` (${avisos})`} e ` +
    `${b.blocosQueNaoParseiam} bloco(s) de teoria que o parser recusa. Estes erros JÁ ESTÃO ` +
    `contados em violações acima — não são um segundo placar. O par ` +
    `"placar ${formatarPlacar(o.placar)}" × "veredito" não é contradição: o placar conta DESAFIO ` +
    `(desafiosComViolacao) e o achado da barra é da AULA. Fonte da medição: ` +
    `\`cd app && npm run engine -- barra ${o.audit.trackSlug} --limite 0\`.`
  );
}

/** A seção J3 (solubilidade), quando a medição foi entregue. */
function secaoDeSolubilidade(o: JustificativaOpts): string | null {
  if (o.solubilidade === null) return null;
  const s = o.solubilidade;
  const sComando = comandoDaSecao(o.comandos, ['solubilidade']);
  return `J3 solubilidade (aluno simulado, pass^k, §9.1): passou=${s.passou} (${s.tentativas} tentativa(s), taxa de acerto ${s.taxaDeAcerto}); primeira construção faltante: ${s.primeiraConstrucaoFaltante ?? '(nenhuma nomeável)'}${s.avisoTarefaQuebrada ? '; AVISO: 0% de acerto é sinal de tarefa quebrada, não de aluno incapaz' : ''}. Fonte da medição: ${sComando ?? '(comando reprodutor não declarado pelo caller)'}.`;
}

/** A seção de falso-passe do revisor, quando a medição foi entregue. */
function secaoDeFalsoPasse(o: JustificativaOpts): string | null {
  if (o.falsoPasse === null) return null;
  const f = o.falsoPasse;
  const fComando = comandoDaSecao(o.comandos, ['falso-passe', 'falsoPasse']);
  return `Taxa de falso-passe do revisor contra mutantes (§6.6/§9.2): ${f.taxaGeral} em ${f.frenteAMutantes} mutante(s) (${f.amostras} amostra(s)); limiar que desliga o laço: ${o.limiar}. Fonte da medição: ${fComando ?? '(comando reprodutor não declarado pelo caller)'}.`;
}

/** A seção de tokens (telemetry.jsonl), quando há linhas. */
function secaoDeTokens(o: JustificativaOpts): string | null {
  if (o.linhasTelemetria <= 0) return null;
  const tComando = comandoDaSecao(o.comandos, ['telemetria', 'tokens']);
  return `Tokens por fase somados de telemetry.jsonl (fonte ÚNICA de tokens do REPLAN; ${o.linhasTelemetria} linha(s)). Fonte da medição: ${tComando ?? '(comando reprodutor não declarado pelo caller)'}.`;
}

/** A seção do VEREDITO (a regra determinística, verbatim). */
function secaoDeVeredito(o: JustificativaOpts): string {
  return `Veredito: ${o.veredito} — regra determinística: reprovado quando há violações de orçamento, ou a medição J3 entregue tem pass^k falso, ou a taxa de falso-passe do revisor entregue é ≥ (1−τ)/2 = ${o.limiar} (τ = 0,10, §6.6). A prova de execução dos desafios NÃO entra neste veredito: é do G-FINAL/laço, e a checagem não executada está declarada em limitacoes[] (protocolo INT-02/P-30: o placar do audit nunca piora sem declaração — este placar é DERIVADO do audit recebido, nunca redigitado aqui).`;
}

export function montarJustificativa(o: JustificativaOpts): string {
  const secoes: string[] = cabecalhoDaJustificativa(o);
  const barra = secaoDaBarra(o);
  if (barra !== null) secoes.push(barra);
  const solubilidade = secaoDeSolubilidade(o);
  if (solubilidade !== null) secoes.push(solubilidade);
  const falsoPasse = secaoDeFalsoPasse(o);
  if (falsoPasse !== null) secoes.push(falsoPasse);
  const tokens = secaoDeTokens(o);
  if (tokens !== null) secoes.push(tokens);
  secoes.push(secaoDeVeredito(o));
  return secoes.join('\n');
}

export function montarLimitacoes(opts: {
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

