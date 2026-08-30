/**
 * app/electron/main/engine/phases/atomicity.ts — O TESTE DE ATOMICIDADE da
 * fase F2 (pacote P-15, `docs/16-engine-de-trilha.md` §3.6).
 *
 * Código PURO, zero LLM (A-P15-2b): a pergunta "este candidato é um átomo?"
 * é respondida por réguas determinísticas e parametrizáveis, nunca por
 * opinião de modelo. Candidato que falha em QUALQUER um dos quatro critérios
 * → DIVIDE (o orquestrador de F2 re-decompõe o candidato; este módulo só
 * julga e devolve o resultado TIPADO `{passou, falhas[], justificativa}`).
 *
 * As QUATRO réguas do §3.6, cada uma um critério:
 *
 *   1. DEMONSTRÁVEL  — cabe num worked example completo sem estourar o teto
 *      de elementos. Modelo puro: todo elemento novo (produtiva + receptiva +
 *      não-interativos declarados) precisa aparecer na demonstração; o palco
 *      suporta `teto_elementos_interagindo` se os elementos interagem, senão
 *      `teto_elementos_nao_interativos` (os dois tetos do §3.6).
 *   2. EXERCITÁVEL   — cabe num completion problem com UMA lacuna cujo span
 *      contém o átomo-alvo. Modelo puro: o span único comporta no máximo
 *      `teto_construcoes_produtivas` construções que o aluno PRECISA produzir
 *      e no máximo o teto de elementos do palco entre construções novas
 *      (produtiva + receptiva) — mais do que isso não cabe num trecho
 *      contíguo apagado. (A co-localização FÍSICA do par num único span é
 *      conferida mais tarde em F8/J6, que vê o código real; aqui a régua é de
 *      contagem, premissa declarada.)
 *   3. ORÇAMENTÁVEL   — o `element_count` somado ao que já entra na aula cabe
 *      no teto. Em F2, antes do grafo (F3) e do orçamento cumulativo (F4), a
 *      parte derivável é o teto de construções produtivas novas por aula
 *      (≤ 2, nunca 3 — Exercism: 21 exercícios ensinam 1, 8 ensinam 2, zero
 *      ensinam 3+). A parte "o que já entra na aula" depende do grafo
 *      congelado e é revalidada em F4 com dados reais — premissa declarada.
 *   4. CRONOMETRÁVEL  — o desafio correspondente cabe em `teto_tempo_resolucao_s`
 *      para quem tem o orçamento. Modelo puro: estimativa de tempo de
 *      resolução = soma de pesos por elemento novo (produtiva ~45 s —
 *      escrever E verificar; receptiva ~15 s — ler e entender; não-interativo
 *      ~10 s — processamento sucessivo). Os pesos são constantes EXPORTADAS e
 *      ajustáveis (os tetos do §3.6 são parâmetros configuráveis, não achados).
 *
 * O módulo é AGNÓSTICO de schema de nó: recebe `CandidatoAtomicidade`
 * (contagens declaradas), não um nó de F2 — assim o JULGAMENTO fica
 * reutilizável por qualquer consumidor (F2, G-ATOM, revisão) sem acoplar a
 * forma do artefato. O adaptador `candidatoDeNo` (nó F2 → candidato) vive em
 * f2Decompose.ts, que conhece o nó.
 *
 * Critérios de aceite: A-P15-2 (puro, não pergunta à LLM) e a aplicação
 * canônica do §3.6 — um candidato grosso como "variáveis" falha nos QUATRO,
 * e um átomo real como "let + atribuição" passa nos quatro.
 */

// ─── critérios e réguas ──────────────────────────────────────────────────────

/** Os QUATRO critérios obrigatórios do §3.6 — todos precisam passar. */
export const CRITERIOS_ATOMICIDADE = [
  'demonstravel',
  'exercitavel',
  'orcamentavel',
  'cronometravel',
] as const;

export type CriterioAtomicidade = (typeof CRITERIOS_ATOMICIDADE)[number];

/**
 * As quatro réguas do §3.6 como parâmetros configuráveis. Defaults da
 * tabela do documento; qualquer executante pode estreitar (ex.: o limite
 * "≤ 2 enquanto o orçamento está quase vazio" é um estreitamento de
 * `teto_elementos_interagindo` que só F4 conhece, porque depende do
 * orçamento — premissa: o DEFAULT da engine é a tabela aberta).
 */
export interface ReguaAtomicidade {
  /** Construções produtivas novas por aula — ≤ 2, nunca 3. */
  teto_construcoes_produtivas: number;
  /** Elementos novos que INTERAGEM entre si. */
  teto_elementos_interagindo: number;
  /** Elementos NÃO interativos (processamento sucessivo). */
  teto_elementos_nao_interativos: number;
  /** Tempo de resolução do desafio para quem tem o orçamento (segundos). */
  teto_tempo_resolucao_s: number;
}

export const REGUA_ATOMICIDADE_DEFAULT: ReguaAtomicidade = {
  teto_construcoes_produtivas: 2,
  teto_elementos_interagindo: 4,
  teto_elementos_nao_interativos: 7,
  teto_tempo_resolucao_s: 120,
};

// ─── entrada: o candidato (declarações, não opiniões) ────────────────────────

/**
 * Um candidato a átomo sob julgamento. Só contagens declaradas pelo
 * chamador — este módulo não deriva nada de prosa nem consulta modelo.
 */
export interface CandidatoAtomicidade {
  /**
   * Construções novas que o aluno será EXIGIDO a produzir
   * (`introduces.productive` do nó F2).
   */
  construcoes_produtivas: readonly string[];
  /**
   * Construções novas que o aluno precisará LER sem escrever
   * (`introduces.receptive` do nó F2).
   */
  construcoes_receptivas: readonly string[];
  /**
   * Elementos novos NÃO interativos fora das construções (termos, fatos,
   * contagens adicionais declaradas pelo consumidor). O nó F2 não declara
   * este número — `candidatoDeNo` usa 0; quem conhece contexto extra (F4,
   * revisão) pode declará-lo.
   */
  elementos_nao_interativos: number;
  /** true = os elementos novos só fazem sentido juntos (ei_class 'interativo'). */
  elementos_interagem: boolean;
}

// ─── saída: o resultado tipado ───────────────────────────────────────────────

/** Uma falha: o critério, o porquê citável e os números observado/teto. */
export interface FalhaAtomicidade {
  criterio: CriterioAtomicidade;
  /** Motivo em pt-BR que nomeia a régua violada (mensagem de gate citável). */
  motivo: string;
  /** Valor observado (o que o candidato pediria). */
  observado: number;
  /** Teto da régua configurada. */
  teto: number;
  /** Unidade de `observado`/`teto` para a mensagem. */
  unidade: 'construções' | 'elementos' | 'segundos';
}

/**
 * O veredito da atomicidade. `passou=false` ⇔ `falhas` não-vazio ⇔ DIVIDIR:
 * um único critério falho já impede o candidato de ser átomo (§3.6: "os
 * quatro, todos obrigatórios").
 */
export interface ResultadoAtomicidade {
  passou: boolean;
  falhas: readonly FalhaAtomicidade[];
  /** Resumo legível com os números — o que o orquestrador loga no rastro. */
  justificativa: string;
}

// ─── pesos do cronômetro (modelo declarado, exportado para ajuste) ───────────

/**
 * Pesos da estimativa de tempo de resolução (critério 4). Modelo: cada
 * construção produtiva nova custa escrever+verificar (~45 s — dá para
 * escrever a lacuna e rodar o teste uma vez com folga), cada receptiva nova
 * custa ler+entender no contexto (~15 s), cada elemento não-interativo custa
 * processamento sucessivo (~10 s). Números de ordem de grandeza, não
 * medições — por isso EXPORTADOS: quem medir com o público real recalibra
 * aqui, sem tocar na lógica.
 */
export interface PesosCronometragem {
  segundos_por_construcao_produtiva: number;
  segundos_por_construcao_receptiva: number;
  segundos_por_elemento_nao_interativo: number;
}

export const PESOS_CRONOMETRAGEM_DEFAULT: PesosCronometragem = {
  segundos_por_construcao_produtiva: 45,
  segundos_por_construcao_receptiva: 15,
  segundos_por_elemento_nao_interativo: 10,
};

// ─── o teste ─────────────────────────────────────────────────────────────────

/** Palco de elementos: que teto do §3.6 se aplica ao candidato. */
function tetoDeElementos(regua: ReguaAtomicidade, candidato: CandidatoAtomicidade): number {
  return candidato.elementos_interagem
    ? regua.teto_elementos_interagindo
    : regua.teto_elementos_nao_interativos;
}

/** Os elementos novos que um worked example precisa mostrar. */
function contagemDoWorkedExample(candidato: CandidatoAtomicidade): number {
  return (
    candidato.construcoes_produtivas.length +
    candidato.construcoes_receptivas.length +
    candidato.elementos_nao_interativos
  );
}

/** As construções novas que o span da lacuna única precisa cobrir. */
function contagemDoSpan(candidato: CandidatoAtomicidade): number {
  return candidato.construcoes_produtivas.length + candidato.construcoes_receptivas.length;
}

/** A estimativa de tempo de resolução em segundos (critério 4). */
export function tempoDeResolucaoEstimado(
  candidato: CandidatoAtomicidade,
  pesos: PesosCronometragem = PESOS_CRONOMETRAGEM_DEFAULT,
): number {
  return (
    candidato.construcoes_produtivas.length * pesos.segundos_por_construcao_produtiva +
    candidato.construcoes_receptivas.length * pesos.segundos_por_construcao_receptiva +
    candidato.elementos_nao_interativos * pesos.segundos_por_elemento_nao_interativo
  );
}

function nomePalco(candidato: CandidatoAtomicidade): 'interativo' | 'não-interativo' {
  return candidato.elementos_interagem ? 'interativo' : 'não-interativo';
}

/** O rótulo humano do critério para a mensagem de falha. */
const ROTULO_CRITERIO: Record<CriterioAtomicidade, string> = {
  demonstravel: 'demonstrável',
  exercitavel: 'exercitável (uma lacuna)',
  orcamentavel: 'orçamentável',
  cronometravel: 'cronometrável',
};

/**
 * O TESTE DE ATOMICIDADE (PURO — A-P15-2b). Aplica o candidato às quatro
 * réguas; `falhas` nomeia TODAS as violações (nunca para na primeira — o
 * orquestrador precisa do quadro completo para instruir a divisão).
 */
export function testarAtomicidade(
  candidato: CandidatoAtomicidade,
  regua: ReguaAtomicidade = REGUA_ATOMICIDADE_DEFAULT,
  pesos: PesosCronometragem = PESOS_CRONOMETRAGEM_DEFAULT,
): ResultadoAtomicidade {
  const falhas: FalhaAtomicidade[] = [];
  const tetoElementos = tetoDeElementos(regua, candidato);
  const palco = nomePalco(candidato);

  // 1. DEMONSTRÁVEL — o worked example completo mostra todo elemento novo.
  const demonstracao = contagemDoWorkedExample(candidato);
  if (demonstracao > tetoElementos) {
    falhas.push({
      criterio: 'demonstravel',
      motivo: `a demonstração completa precisaria de ${demonstracao} elementos novos — estoura o teto de ${tetoElementos} do palco ${palco} (§3.6)`,
      observado: demonstracao,
      teto: tetoElementos,
      unidade: 'elementos',
    });
  }

  // 2. EXERCITÁVEL — UMA lacuna cujo span contém o átomo-alvo.
  const span = contagemDoSpan(candidato);
  if (candidato.construcoes_produtivas.length > regua.teto_construcoes_produtivas) {
    falhas.push({
      criterio: 'exercitavel',
      motivo: `${candidato.construcoes_produtivas.length} construções produtivas novas não cabem num span único de lacuna com o átomo-alvo (teto ${regua.teto_construcoes_produtivas})`,
      observado: candidato.construcoes_produtivas.length,
      teto: regua.teto_construcoes_produtivas,
      unidade: 'construções',
    });
  }
  if (span > tetoElementos) {
    falhas.push({
      criterio: 'exercitavel',
      motivo: `o span da lacuna única precisaria cobrir ${span} construções novas — estoura o teto de ${tetoElementos} do palco ${palco} (§3.6)`,
      observado: span,
      teto: tetoElementos,
      unidade: 'elementos',
    });
  }

  // 3. ORÇAMENTÁVEL — cabe no orçamento produtivo da aula (parte derivável em F2).
  if (candidato.construcoes_produtivas.length > regua.teto_construcoes_produtivas) {
    falhas.push({
      criterio: 'orcamentavel',
      motivo: `${candidato.construcoes_produtivas.length} construções produtivas novas estouram o orçamento produtivo da aula (≤ ${regua.teto_construcoes_produtivas}, nunca 3 — §3.6)`,
      observado: candidato.construcoes_produtivas.length,
      teto: regua.teto_construcoes_produtivas,
      unidade: 'construções',
    });
  }

  // 4. CRONOMETRÁVEL — o desafio cabe em 120 s para quem tem o orçamento.
  const tempo = tempoDeResolucaoEstimado(candidato, pesos);
  if (tempo > regua.teto_tempo_resolucao_s) {
    falhas.push({
      criterio: 'cronometravel',
      motivo: `tempo de resolução estimado de ${tempo}s estoura o teto de ${regua.teto_tempo_resolucao_s}s (§3.6)`,
      observado: tempo,
      teto: regua.teto_tempo_resolucao_s,
      unidade: 'segundos',
    });
  }

  const passou = falhas.length === 0;
  const justificativa = passou
    ? `cabe nas quatro réguas: ${candidato.construcoes_produtivas.length} produtivas ≤ ${regua.teto_construcoes_produtivas}, ${contagemDoWorkedExample(candidato)} elementos no palco ${palco} ≤ ${tetoElementos}, resolução estimada ${tempo}s ≤ ${regua.teto_tempo_resolucao_s}s`
    : `candidato NÃO atômico — falha em: ${falhas
        .map((f) => `${ROTULO_CRITERIO[f.criterio]} (${f.observado} > teto ${f.teto} ${f.unidade})`)
        .join('; ')}`;

  return { passou, falhas, justificativa };
}