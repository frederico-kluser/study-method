/**
 * app/electron/main/engine/auditCore.ts — o GATE que hoje não existe.
 *
 * Problema real: `track:validate` prova FORMA (schema válido, slug íntegro,
 * solução passa, starter falha) e passa verde numa trilha em que 43 dos 136
 * desafios cobram construção que nenhuma aula ensinou. Este arquivo é o gate
 * que faltava: ele confronta cada superfície de cada desafio contra o orçamento
 * cumulativo da aula (`budget.ts`) e devolve toda violação com arquivo, linha,
 * coluna e trecho ofensor.
 *
 * A ASSIMETRIA DAS QUATRO SUPERFÍCIES é a regra mais fácil de errar, e aplicar
 * o mesmo orçamento às quatro é exatamente o que deixa passar o desafio da
 * aula 1:
 *
 *   testsCode                        ⊆ entrada.receptivo   (o aluno LÊ o teste
 *                                                           ANTES de aprender)
 *   starterCode · statement · teoria ⊆ saida.receptivo
 *   solutionCode                     ⊆ saida.produtivo
 *
 * E existe uma quarta verificação, na direção OPOSTA, que é a mais esquecida:
 * o desafio precisa EXERCITAR o que a aula acabou de ensinar. Sem ela o gate
 * aceita uma trilha inteira de desafios que só repetem o que o aluno já sabia.
 *
 * Este módulo NÃO conserta nada e NÃO escreve aula: ele aponta. Quem corrige é
 * o autor-LLM, com o orçamento na mão, no modo `repair` da engine. Um gate que
 * também escreve o conteúdo perde a independência que o torna confiável.
 *
 * PURO/DI: recebe a trilha já carregada, não abre arquivo, não vai à rede, não
 * chama LLM nenhuma — roda sem chave de API.
 *
 * A BARRA PEDAGÓGICA A17–A23 RODA AQUI (2026-09-22), e é o que faz este gate
 * parar de dizer "0 violações" num curso com penhasco. O que estava medido
 * ANTES desta fiação, na trilha que motivou tudo (registro DATADO: o
 * `rust-iniciante` está sendo corrigido em paralelo e o número cai a cada aula
 * quebrada — o que se reproduz hoje é a IGUALDADE das duas medidas, não o 20):
 *
 *   npm run engine -- audit rust-iniciante --limite 0  -> 0 violacoes · 0 avisos · exit 0
 *   npm run engine -- barra rust-iniciante --limite 0  -> 20 erros em 15 aulas · 64 avisos
 *
 * As duas medidas eram sobre O MESMO conteúdo, no mesmo instante. O gate de orçamento (A1–A6,
 * DEC, I12–I17) confere o desafio contra o orçamento CUMULATIVO, e esse
 * orçamento é DECLARADO pela própria aula: `saida = entrada ∪ introduces`
 * (`budget.ts:281`). Declarar 11 construções novas em UMA seção de teoria é,
 * para essa régua, legal — a aula legaliza o seu próprio penhasco. Faltava a
 * régua do TAMANHO DO PASSO e da EXISTÊNCIA DA DEMONSTRAÇÃO, que é
 * `quality/barra.ts`: pura, offline e AGNÓSTICA DE LINGUAGEM (é o que a
 * A13–A16 não pode ser). Ela entra com a MESMA disciplina da A13–A16: os
 * achados são mesclados em `violations`, erro conta no placar, aviso não
 * reprova — e, como a A13–A16, ela tem um ESCOPO declarado. O dela não é a
 * linguagem: é o MODO DO ORÇAMENTO. A barra vale em `declared` e é declarada
 * como limitação em `inferred` (`barraValePara` tem o argumento medido; a
 * entrada é `A17-A23-NAO-RODOU-EM-INFERRED`). As três trilhas do produto
 * declaram `introduces` e auditam em `declared`.
 *
 * SOBREPOSIÇÃO DECLARADA (trilha JavaScript): A13 aceita a demonstração em
 * aula ANTERIOR (∪ A13d), A19 exige demonstração NESTA aula. Nas trilhas de
 * JavaScript as duas baterias rodam e o mesmo defeito pode sair com dois ids —
 * é sobreposição de réguas, declarada aqui, não contagem dupla acidental. Em
 * Python/Rust/C só a barra roda, e é ela que responde pelo passo.
 *
 * Referência: `docs/16-engine-de-trilha.md` §5.1, §5.2 e §5.5.
 *
 * ─── REFATORAÇÃO L05 ────────────────────────────────────────────────────────
 * O corpo de `auditTrack` (CC 90 no módulo único) está fatiado em
 * `auditSuperficies` (as superfícies e as baterias), `auditEstruturais`
 * (I12–I17), `auditAula` (A1–A6/A11/DEC por aula), `auditModulo` (o desafio de
 * módulo), `auditResumo` (limitações, placar e formatadores) e `auditMensagens`
 * (a tradução achado → violação). Comportamento observável preservado byte a
 * byte; a fachada pública é `audit.ts`.
 */

import type { LoadedTrack } from '../content/trackLoader';
import { deriveTrackBudget, type DeriveOptions } from './budget';
import { auditarAula, type EstadoDaAuditoria } from './auditAula';
import { auditarEstruturaisDaTrilha } from './auditEstruturais';
import { auditarDesafiosDeModulo } from './auditModulo';
import { montarLimitacoesDeAuditoria, montarPlacarDaBarra } from './auditResumo';
import { rodarBarra, rodarBateriaDeProgressao, severidadeDe } from './auditSuperficies';
import type { AuditReport, LessonMetrics, Violation } from './auditTypes';

/**
 * Audita uma trilha inteira contra o orçamento cumulativo.
 *
 * Determinístico e offline. Roda em qualquer máquina, sem chave, e é o teste de
 * aceitação da engine: se ele não reprovar o conteúdo que sabidamente está
 * quebrado, a engine não está funcionando.
 *
 * A bateria A13–A16 roda junto (rodada 12): ensino-efetivo, micro-avanço,
 * progressividade e primeira-atividade — no MESMO modo/orçamento do resto do
 * gate (`budget.source`), com as mensagens e contadores por aula da spec.
 */
export function auditTrack(track: LoadedTrack, options: DeriveOptions = {}): AuditReport {
  const budget = deriveTrackBudget(track, options);
  // O ADAPTADOR DA TRILHA, resolvido uma vez pelo orçamento (§6 linhas
  // 918-940). É ele que decide qual bloco de teoria entra no gate, com que
  // parser cada superfície é lida e quais construções quebram a decidibilidade
  // NESTA linguagem.
  const adapterId = budget.adapterId;
  const violations: Violation[] = [];
  const metrics: LessonMetrics[] = [];
  const desafiosComViolacao = new Set<string>();

  // ── bateria A13–A16 (PURO; javascript-only — ver `rodarBateriaDeProgressao`)
  //    e barra pedagógica A17–A23 (agnóstica de linguagem — ver `rodarBarra):
  //    as violações são mescladas no loop por aula (mesmo padrão dos
  //    estruturais), e as de desafio alimentam `desafiosComViolacao` com o
  //    MESMO critério dos erros (aviso não reprova).
  const progressao = rodarBateriaDeProgressao(track, budget);
  const barra = rodarBarra(track, budget);

  // ONDA 10 — O PLACAR PASSA A DIZER O QUE NÃO RODOU (ver `LimitacaoDeclarada`).
  const limitacoes = montarLimitacoesDeAuditoria(budget, progressao.bateriaRodou, barra.barraRodou);

  /**
   * Desafios de MÓDULO medidos contra o orçamento (bloco no fim desta função).
   * Contador SEPARADO de `desafios` de propósito: `totals.desafios` significa
   * "desafios de aula" desde a primeira rodada e mudar o significado dele faria
   * todo número histórico do placar passar a medir coisa diferente sem aviso.
   */
  const estado: EstadoDaAuditoria = {
    budget,
    adapterId,
    violations,
    metrics,
    desafios: 0,
    desafiosDeModulo: 0,
    desafiosComViolacao,
    progressao,
    barra,
  };

  // ── invariantes de estrutura que o loader não cobre ───────────────────────
  auditarEstruturaisDaTrilha(track, (v) => violations.push(v));

  // ── orçamento, aula por aula ──────────────────────────────────────────────
  for (const lessonBudget of budget.lessons) {
    const mod = track.modules.find((m) => m.meta.slug === lessonBudget.moduleSlug);
    const lesson = mod?.lessons.find((l) => l.meta.slug === lessonBudget.lessonSlug);
    if (!mod || !lesson) continue;
    auditarAula(estado, lessonBudget, mod.meta.slug, lesson);
  }

  // ── o DESAFIO DE MÓDULO, contra o orçamento da ÚLTIMA aula do módulo ───────
  auditarDesafiosDeModulo(estado, track);

  const placarDaBarra = montarPlacarDaBarra(barra.barra);

  return {
    trackSlug: track.root.slug,
    budgetSource: budget.source,
    violations,
    metrics,
    totals: {
      aulas: budget.lessons.length,
      desafios: estado.desafios,
      desafiosDeModulo: estado.desafiosDeModulo,
      desafiosComViolacao: desafiosComViolacao.size,
      violacoes: violations.filter((v) => severidadeDe(v) !== 'aviso').length,
      avisos: violations.filter((v) => severidadeDe(v) === 'aviso').length,
      checagensNaoExecutadas: limitacoes.length,
      lacunasDeCurriculo: violations.filter(
        (v) => severidadeDe(v) !== 'aviso' && v.construcao !== null && v.primeiraAulaQueEnsina === null,
      ).length,
      aulasSemConstrucaoNova: metrics.filter((m) => m.novas === 0).length,
      ...(barra.barra !== null ? { errosDaBarra: barra.barra.totais.erros, avisosDaBarra: barra.barra.totais.avisos } : {}),
    },
    hygiene: budget.hygiene,
    parseErrors: budget.parseErrors,
    limitacoes,
    ...(placarDaBarra !== undefined ? { barra: placarDaBarra } : {}),
  };
}
