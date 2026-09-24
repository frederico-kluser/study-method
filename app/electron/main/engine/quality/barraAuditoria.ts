/**
 * app/electron/main/engine/quality/barraAuditoria.ts — o ORQUESTRADOR da
 * barra pedagógica: deriva o orçamento, mede aula por aula (na ordem das
 * regras) e monta o relatório.
 *
 * A prosa normativa vive na fachada `barra.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import type { LoadedTrack } from '../../content/trackLoader';
import type { TrackLessonSource } from '../../content/trackTypes';
import {
  AtomKey,
  harnessReceptiveSeed,
  structuralAlwaysAllowed,
} from '../atomKeys';
import { deriveTrackBudget, type LessonBudget } from '../budget';
import {
  type AchadoDaBarra,
  type MetricaDaBarra,
  type OpcoesDaBarra,
  type RelatorioDaBarra,
} from './barraTipos';
import { lerDerivadas, papelDa } from './barraLeitura';
import { demonstracoesDa } from './barraDemo';
import { agruparPorLinha, colapsar, novasDa } from './barraGrupos';
import {
  type EntradaDaAula,
  checarA17,
  checarA18,
  checarA19,
  checarA20,
  checarA21,
  checarA22,
  checarA23,
  checarA24,
  checarBlocosNaoParseados,
} from './barraRegras';

/** O que o disco tem de uma aula (meta + contagem de desafios). */
export interface AulaDoDisco {
  meta: TrackLessonSource;
  desafios: number;
}

/** O resultado de medir UMA aula. */
export interface ResultadoDaLicao {
  achados: AchadoDaBarra[];
  metrica: MetricaDaBarra;
  blocosQueNaoParseiam: number;
}

/**
 * Mede UMA aula, na ordem em que as regras reprovam: A23 (e o colapso do par),
 * A17, A18, A19, A20, A21, A22, A24 e, por fim, o fail-closed do parse da
 * teoria (A19) — antes de montar a métrica.
 */
export function auditarLicao(
  orcamento: LessonBudget,
  doDisco: AulaDoDisco,
  adapterId: EntradaDaAula['adapterId'],
  axioma: ReadonlySet<AtomKey>,
): ResultadoDaLicao {
  const meta = doDisco.meta;
  const secoes = (meta.theory ?? []).length;
  const demo = demonstracoesDa(meta, adapterId);
  const { produtivas, todas } = novasDa(orcamento);
  const aula: EntradaDaAula = {
    ref: orcamento.ref,
    adapterId,
    meta,
    papel: papelDa(meta),
    secoes,
    demo,
    introduces: orcamento.introduces,
    desafios: doDisco.desafios,
    axioma,
    primeiraAula: orcamento.index === 0,
    produtivas,
    todas,
    derivadas: lerDerivadas(meta),
  };

  const achados: AchadoDaBarra[] = [];
  const a23 = checarA23(aula);
  achados.push(...a23.achados);
  const produtivasColapsadas = colapsar(produtivas, a23.derivadasValidas);
  const todasColapsadas = colapsar(todas, a23.derivadasValidas);

  achados.push(...checarA17(aula.ref, produtivasColapsadas));
  achados.push(...checarA18(aula, produtivasColapsadas));
  const a19 = checarA19(aula);
  achados.push(...a19.achados);
  achados.push(...checarA20(aula));
  achados.push(...checarA21(aula, todasColapsadas));
  const a22 = checarA22(aula, produtivas);
  achados.push(...a22.achados);
  const a24 = checarA24(aula);
  achados.push(...a24.achados);
  achados.push(...checarBlocosNaoParseados(aula));

  const metrica: MetricaDaBarra = {
    ref: orcamento.ref,
    index: orcamento.index,
    produtivasNovas: produtivas.length,
    produtivasColapsadas: produtivasColapsadas.length,
    novasTotais: todasColapsadas.length,
    secoesDeTeoria: secoes,
    blocosDeCodigo: demo.blocos,
    chavesSemDemonstracao: a19.semDemonstracao,
    chavesComUmaFormaSo: a22.comUmaFormaSo,
    desafios: doDisco.desafios,
    afirmacoesMedidas: a24.quiz.medidas,
    afirmacoesQueVazamPorTamanho: a24.quiz.vazamFraco,
    grupos: agruparPorLinha(todas, demo.linhasPorChave),
  };

  return { achados, metrica, blocosQueNaoParseiam: demo.naoParseados.length };
}

/** O índice disco por ref (`<moduleSlug>/<lessonSlug>` → meta + desafios). */
function indexarAulasDoDisco(track: LoadedTrack): Map<string, AulaDoDisco> {
  const porRef = new Map<string, AulaDoDisco>();
  for (const mod of track.modules) {
    for (const aula of mod.lessons) {
      porRef.set(`${mod.meta.slug}/${aula.meta.slug}`, {
        meta: aula.meta,
        desafios: aula.challenges.length,
      });
    }
  }
  return porRef;
}

/**
 * Roda a barra pedagógica sobre a trilha inteira.
 *
 * DETERMINÍSTICA e OFFLINE: a mesma trilha produz o mesmo relatório. O
 * veredito de cada regra é aritmética sobre conjuntos de átomos e contagem de
 * seções — nunca leitura humana, nunca opinião de modelo.
 */
export function auditarBarra(track: LoadedTrack, opcoes: OpcoesDaBarra = {}): RelatorioDaBarra {
  const orcamentoDaTrilha = deriveTrackBudget(track, { mode: opcoes.modo });
  const adapterId = orcamentoDaTrilha.adapterId;
  const achados: AchadoDaBarra[] = [];
  const metricas: MetricaDaBarra[] = [];
  let blocosQueNaoParseiam = 0;

  // O axioma de entrada da trilha — o que a aula 1 pode encontrar sem ensinar
  // (estruturais + semente receptiva do harness). A18 mede contra ele.
  const axioma = new Set<AtomKey>([
    ...structuralAlwaysAllowed(adapterId),
    ...harnessReceptiveSeed(adapterId),
  ]);

  const porRef = indexarAulasDoDisco(track);
  const recorte = opcoes.apenas === undefined ? null : new Set(opcoes.apenas);
  for (const orcamento of orcamentoDaTrilha.lessons) {
    const doDisco = porRef.get(orcamento.ref);
    if (doDisco === undefined) continue;
    // O recorte entra DEPOIS de o orçamento cumulativo estar derivado: a
    // entrada desta aula depende de todas as anteriores, e é ela que A17/A21
    // medem contra. Pular a aula aqui pula a EXTRAÇÃO, nunca o orçamento.
    if (recorte !== null && !recorte.has(orcamento.ref)) continue;
    const resultado = auditarLicao(orcamento, doDisco, adapterId, axioma);
    achados.push(...resultado.achados);
    metricas.push(resultado.metrica);
    blocosQueNaoParseiam += resultado.blocosQueNaoParseiam;
  }

  const erros = achados.filter((a) => a.severidade === 'erro');
  const aulasComErro = new Set(erros.map((a) => a.ref));

  return {
    trackSlug: track.root.slug,
    adapterId,
    budgetSource: orcamentoDaTrilha.source,
    achados,
    metricas,
    totais: {
      aulas: metricas.length,
      erros: erros.length,
      avisos: achados.length - erros.length,
      aulasComErro: aulasComErro.size,
      blocosQueNaoParseiam,
    },
  };
}
