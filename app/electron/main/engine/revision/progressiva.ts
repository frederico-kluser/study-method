/**
 * app/electron/main/engine/revision/progressiva.ts — a REVISÃO PROGRESSIVA
 * (onda 5) — o núcleo do pedido original do dono.
 *
 * O dono pediu: "QUERO UM ALGORITMO que analisa o teste com um código com o
 * mínimo necessário para passar no teste (gerado numa etapa de validação para
 * ver se o teste realmente tem solução); e pelo código que passa no teste, vai
 * extrair tudo que REALMENTE é cobrado no teste e aí ver se aquela aula
 * precisa ser mais quebrada ou não; se for o caso não perdemos o que foi
 * gerado, é retornado o Feedback para a aula e carregamos isso na memória para
 * reavaliar o restante do curso e progressivamente da primeira aula até a
 * última faremos uma revisão reajustando tudo que tiver errado, e ao final
 * repetirmos a revisão quantas mais forem necessárias vezes até que a aula
 * tenha cobrado apenas o que oferece."
 *
 * Este módulo é a materialização determinística desse algoritmo. As peças
 * geradas nas ondas anteriores entram aqui fechadas num CONTRATO:
 *
 *   - `quality/minimalPorLinguagem.ts` (sintetizarCodigoMinimoDaLinguagem) — o
 *     VALIDADOR: produz o código MÍNIMO que passa no teste (zero LLM). É a
 *     "etapa de validação para ver se o teste realmente tem solução". ONDA 10:
 *     era `quality/minimal.ts` DIRETO, que é javascript-only — ver o comentário
 *     em `revisarDesafio` e o `NAO-REVISAVEL` medido que ele fecha;
 *   - `quality/requirements.ts` (validarRequirements) — o SINAL SECUNDÁRIO:
 *     gaps na bijeção requirements declarados × test('…') são feedback de
 *     AJUSTE, nunca motivo de SPLIT;
 *   - `budget.ts` (deriveTrackBudget, modo declared) — o ORÇAMENTO por aula:
 *     `introduces` declarado no lesson.json (a mesma fonte do audit).
 *
 * REGRAS FECHADAS (REPLAN A4 — este arquivo as implementa LITERALMENTE):
 *
 *   LACUNA      = `atoms(minimal)` ⊄ (productive ∪ receptive) da aula
 *                 (SEMPRE `atoms`, NUNCA `atomsDoTeste`). LACUNA → candidato
 *                 a SPLIT.
 *   NÃO-REVISÁVEL = veredito não-ok (SEM_SOLUCAO_ACESSIVEL / PARSE_FALHOU /
 *                 PROVER_FALHOU): documentada, NUNCA loopa (fail-closed).
 *   EXCESSO     = `introduces.productive` não usado pelo mínimo → candidato a
 *                 REMOVER do introduces OU COBRIR com desafio. Excesso
 *                 RECEPTIVO é by-design (leitura não é cobrada por teste),
 *                 nunca conta como violação.
 *   MEMÓRIA     = o feedback da aula N vira contexto da N+1 (acumulador
 *                 `memoriaDeRevisao`); o relatório final registra o que foi
 *                 aprendido e reavaliado (progressividade).
 *   NADA SE PERDE = todo feedback é gravado: artefato JSON + markdown pt-BR +
 *                 seed do SPLIT (minimalCode + atoms) em disco.
 *   CONVERGÊNCIA = `rodarRevisaoAteConvergir({ maxIteracoes = 3 })`: varredura
 *                 repetida; hash do relatório igual entre iterações ⇒
 *                 convergiu; válvula anti-loop (maxIteracoes + estabilidade).
 *   SPLIT       = minimalCode+atoms persistidos como artefato e na memória; a
 *                 aula NOVA sai de sub-agente LLM com o minimalCode como
 *                 SEMENTE (fora deste módulo — zero LLM aqui). Sem LLM na
 *                 execução, o SPLIT é REGISTRADO como pendência no relatório
 *                 com o minimalCode pronto — o feedback nunca se perde.
 *
 * ZERO LLM NO NÚCLEO: tudo aqui é determinístico (mesma trilha + mesmo prover
 * ⇒ mesmo relatório). O prover é INJETADO (`ProverDeDesafio`) — produção usa
 * `criarProverDeDesafio` (spawn node --test); testes usam um fake que importa
 * o candidato via data URL (mesmo padrão da Onda 1).
 */

import type { LoadedTrack } from '../../content/trackLoader';
import {
  BudgetSource,
  deriveTrackBudget,
  pedagogicalOrder,
  trackAdapterId,
} from '../budget';
import { DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';
import type { ProverDeDesafio } from '../phases/f9Verifier';
import type {
  DecisaoDeRevisao,
  FeedbackDeAula,
  FeedbackDeDesafio,
  MemoriaDeRevisao,
  OrcamentoDeAula,
  RelatorioDeRevisao,
  RevisarCursoOptions,
  SplitPendente,
  VereditoDeDesafio,
} from './progressivaTipos';
export type {
  DecisaoDeRevisao,
  DecisaoRegistrada,
  FeedbackDeAula,
  FeedbackDeDesafio,
  MemoriaDeRevisao,
  OrcamentoDeAula,
  PlacarDeRevisao,
  RelatorioDeRevisao,
  ResultadoGravacao,
  RevisarCursoOptions,
  RodarRevisaoOptions,
  SplitPendente,
  VereditoDeDesafio,
} from './progressivaTipos';
import { orcamentoDaAula, revisarDesafio, uniqSorted } from './progressivaDesafio';
import { gerarMarkdown, gravarRelatorio, montarPlacar, rodarRevisaoAteConvergir } from './progressivaRelatorio';

// A convergência, o placar e a gravação do relatório vivem em
// `progressivaRelatorio.ts` (refatoração L05) — re-exportados pelos MESMOS
// nomes de antes.
export { gerarMarkdown, gravarRelatorio, rodarRevisaoAteConvergir } from './progressivaRelatorio';

// ---------------------------------------------------------------------------
// Helpers (puros, determinísticos)
// ---------------------------------------------------------------------------

interface OrcamentoResolvido {
  orcamentoFonte: BudgetSource | 'injetado';
  orcamentoPorAula: (lessonRef: string) => OrcamentoDeAula;
  language: LanguageId;
}

/** O orçamento por aula e a linguagem da trilha, resolvidos UMA vez. */
function resolverOrcamentoDeRevisao(opts: RevisarCursoOptions, track: LoadedTrack): OrcamentoResolvido {
  // A LINGUAGEM DA TRILHA, resolvida UMA vez e passada a todo desafio. Sem ela
  // a revisão inteira caía no sintetizador de JavaScript e a única trilha do
  // produto saía NAO-REVISAVEL (ver o comentário em `revisarDesafio`).
  let language: LanguageId = opts.language ?? DEFAULT_ADAPTER_ID;
  if (opts.orcamentoPorAula) {
    const orcamentoFonte = opts.orcamentoFonte ?? 'injetado';
    if (opts.language === undefined) language = trackAdapterId(track);
    return { orcamentoFonte, orcamentoPorAula: opts.orcamentoPorAula, language };
  }
  // A MESMA fonte do audit em modo declared: introduces do lesson.json.
  const budget = deriveTrackBudget(track, { mode: 'declared' });
  if (opts.language === undefined) language = budget.adapterId;
  return {
    orcamentoFonte: budget.source,
    orcamentoPorAula: (lessonRef) => orcamentoDaAula(budget, lessonRef),
    language,
  };
}

/** A decisão de UMA aula: não-revisável × split × coberta (+ pendências de split). */
function decidirAula(
  ref: string,
  desafios: FeedbackDeDesafio[],
  memoria: MemoriaDeRevisao,
  splitsPendentes: SplitPendente[],
): { precisaQuebrar: boolean; motivo: string; naoRevisavel: boolean | undefined; naoRevisavelMotivo: string | undefined } {
  // Predicado de tipo: veredito não-ok (fail-closed) EXCETO IGNORADO
  // (multi-arquivo — fora do escopo, não torna a aula não-revisável).
  const desafioNaoOk = (d: FeedbackDeDesafio): d is FeedbackDeDesafio & { veredito: Extract<VereditoDeDesafio, { ok: false }> } =>
    d.veredito.ok === false && d.veredito.reason !== 'IGNORADO';

  const naoRevisaveis = desafios.filter(desafioNaoOk);
  const comLacuna = desafios.filter((d) => d.foraDoOrcamento.length > 0);
  const comExcesso = desafios.filter((d) => d.excesso.length > 0);

  let precisaQuebrar = false;
  let motivo: string;
  let naoRevisavel: boolean | undefined;
  let naoRevisavelMotivo: string | undefined;

  if (naoRevisaveis.length > 0) {
    // Fail-closed: aula NÃO-revisável, documentada, NUNCA loopa. Nem SPLIT
    // (sem mínimo não há lacuna determinável).
    naoRevisavel = true;
    const razoes = naoRevisaveis.map((d) => `${d.slug} (${d.veredito.reason})`).join(', ');
    naoRevisavelMotivo =
      `veredito não-ok em ${naoRevisaveis.length} desafio(s): ${razoes}. ` +
      'A aula é NÃO-REVISÁVEL (fail-closed): o sintetizador mínimo não conseguiu provar solução, ' +
      'então nenhuma decisão de quebra é tomada e nada é reexecutado em loop.';
    motivo = naoRevisavelMotivo;
  } else if (comLacuna.length > 0) {
    precisaQuebrar = true;
    const lacunas = uniqSorted(comLacuna.flatMap((d) => d.foraDoOrcamento));
    const jaVistas = lacunas.filter((a) => memoria.lacunasVistas.includes(a));
    const progressividade =
      jaVistas.length > 0
        ? ` — ${jaVistas.join(', ')} já sinalizado(s) como lacuna na aula anterior (${memoria.aulaAnterior ?? '—'})`
        : '';
    motivo =
      `o teste cobra construção fora do orçamento da aula (${lacunas.join(', ')})${progressividade}. ` +
      'Candidato a SPLIT: o minimalCode e os atoms são preservados como artefato e registrados como pendência ' +
      '(a aula nova sai de sub-agente LLM com o minimalCode como semente — sem LLM, a pendência nunca se perde).';
    for (const d of comLacuna) {
      splitsPendentes.push({
        aula: ref,
        desafio: d.slug,
        minimalCode: d.minimalCode ?? '',
        atoms: d.atomsCobrados,
        foraDoOrcamento: d.foraDoOrcamento,
      });
    }
  } else if (comExcesso.length > 0) {
    motivo =
      `aula coberta pelo teste. EXCESSO (${comExcesso.flatMap((d) => d.excesso).length} átomo(s) de introduces.productive não usados pelo mínimo): ` +
      'candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).';
  } else {
    motivo = 'aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.';
  }

  return { precisaQuebrar, motivo, naoRevisavel, naoRevisavelMotivo };
}

/** MEMÓRIA: registra a decisão e acumula as lacunas vistas (progressividade). */
function registrarMemoria(
  memoria: MemoriaDeRevisao,
  ref: string,
  decisao: DecisaoDeRevisao,
  motivo: string,
  comLacuna: readonly FeedbackDeDesafio[],
  revisavel: boolean,
): void {
  memoria.decisoes.push({ aula: ref, decisao, motivo });
  if (revisavel) {
    for (const a of uniqSorted(comLacuna.flatMap((d) => d.foraDoOrcamento))) {
      if (!memoria.lacunasVistas.includes(a)) memoria.lacunasVistas.push(a);
    }
    memoria.lacunasVistas.sort();
  }
  memoria.aulaAnterior = ref;
}

type AulaDeRevisao = ReturnType<typeof pedagogicalOrder>[number];

/** A revisão de UMA aula: desafios, decisão, memória e feedback (o snapshot é o contexto da N+1). */
async function revisarAula(
  prover: ProverDeDesafio,
  aula: AulaDeRevisao,
  orcamentoPorAula: (lessonRef: string) => OrcamentoDeAula,
  language: LanguageId,
  memoria: MemoriaDeRevisao,
  feedbackAulas: FeedbackDeAula[],
  splitsPendentes: SplitPendente[],
): Promise<void> {
  const ref = `${aula.moduleSlug}/${aula.lessonSlug}`;
  const orc = orcamentoPorAula(ref);

  // SNAPSHOT da memória ANTES desta aula — é o "contexto da N+1" que o
  // relatório expõe por aula (o feedback da aula anterior, literalmente).
  const memoriaSnapshot: MemoriaDeRevisao = {
    aulaAnterior: memoria.aulaAnterior,
    lacunasVistas: [...memoria.lacunasVistas],
    decisoes: memoria.decisoes.map((d) => ({ ...d })),
  };

  const desafios: FeedbackDeDesafio[] = [];
  for (const ch of aula.lesson.challenges) {
    desafios.push(await revisarDesafio(prover, ref, ch, orc, language));
  }

  const comLacuna = desafios.filter((d) => d.foraDoOrcamento.length > 0);
  const { precisaQuebrar, motivo, naoRevisavel, naoRevisavelMotivo } = decidirAula(ref, desafios, memoria, splitsPendentes);

  const decisao: DecisaoDeRevisao = naoRevisavel === true ? 'nao-revisavel' : precisaQuebrar ? 'split' : 'ok';
  registrarMemoria(memoria, ref, decisao, motivo, comLacuna, naoRevisavel !== true);

  feedbackAulas.push({
    aula: ref,
    titulo: aula.lesson.meta.title,
    indice: feedbackAulas.length + 1,
    memoria: memoriaSnapshot,
    desafios,
    precisaQuebrar,
    motivo,
    ...(naoRevisavel === true ? { naoRevisavel, naoRevisavelMotivo } : {}),
  });
}

/**
 * Percorre as aulas NA ORDEM pedagógica (1ª → última) com o acumulador
 * `memoriaDeRevisao`: o feedback da aula N vira contexto da N+1. Zero LLM —
 * determinístico: mesma trilha + mesmo prover ⇒ mesmo relatório.
 */
export async function revisarCurso(opts: RevisarCursoOptions): Promise<RelatorioDeRevisao> {
  const { track, prover } = opts;
  const { orcamentoFonte, orcamentoPorAula, language } = resolverOrcamentoDeRevisao(opts, track);

  const aulas = pedagogicalOrder(track).slice(0, opts.limite ?? Number.MAX_SAFE_INTEGER);

  const memoria: MemoriaDeRevisao = { aulaAnterior: null, lacunasVistas: [], decisoes: [] };
  const feedbackAulas: FeedbackDeAula[] = [];
  const splitsPendentes: SplitPendente[] = [];

  for (const aula of aulas) {
    await revisarAula(prover, aula, orcamentoPorAula, language, memoria, feedbackAulas, splitsPendentes);
  }

  return {
    trackSlug: track.root.slug,
    orcamentoFonte,
    linguagem: language,
    aulas: feedbackAulas,
    convergencia: false,
    iteracoes: 0,
    placar: montarPlacar(feedbackAulas, splitsPendentes),
    memoriaFinal: memoria,
    splitsPendentes,
  };
}
