/**
 * app/electron/main/engine/revision/progressivaDesafio.ts — a revisão de UM
 * DESAFIO da revisão progressiva (`progressiva.ts`): orçamento por aula,
 * requirements × testes (sinal secundário) e o veredito do minimalCode.
 * Extraído do módulo original na refatoração do lote L05 sem NENHUMA mudança
 * de comportamento — a fachada `progressiva.ts` re-exporta o que é público.
 */

import type { TrackChallengeSource } from '../../content/trackTypes';
import type { AtomKey } from '../atomKeys';
import type { TrackBudget } from '../budget';
import type { MinimalVerdict } from '../quality/minimal';
import { sintetizarCodigoMinimoDaLinguagem } from '../quality/minimalPorLinguagem';
import {
  validarRequirements,
  type RequirementDeclarado,
  type ValidacaoRequirements,
} from '../quality/requirements';
import type { ProverDeDesafio } from '../phases/f9Verifier';
import type { LanguageId } from '../lang/registry';
import type { FeedbackDeDesafio, OrcamentoDeAula, VereditoDeDesafio } from './progressivaTipos';

export function orcamentoDaAula(budget: TrackBudget, lessonRef: string): OrcamentoDeAula {
  const lb = budget.byRef.get(lessonRef);
  if (lb) {
    return {
      productive: lb.saida.productive,
      receptive: lb.saida.receptive,
      introducesProductive: lb.introduces.productive,
      ref: lb.ref,
    };
  }
  return { productive: new Set(), receptive: new Set(), introducesProductive: [], ref: null };
}

/** Leitura defensiva do campo aditivo `requirements` do challenge.json. */
function lerRequirementsDeclarados(challenge: TrackChallengeSource): RequirementDeclarado[] {
  const raw = (challenge as unknown as { requirements?: unknown }).requirements;
  if (!Array.isArray(raw)) return [];
  const out: RequirementDeclarado[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id === 'string' && typeof r.teste === 'string') {
      out.push({
        id: r.id,
        descricao: typeof r.descricao === 'string' ? r.descricao : undefined,
        teste: r.teste,
      });
    }
  }
  return out;
}

/**
 * SINAL SECUNDÁRIO (validarRequirements): gaps da bijeção = feedback de ajuste.
 * Fail-closed: teste que não parseia ⇒ validação com gap (nunca silêncio);
 * desafio sem campo `requirements` ⇒ null (não há bijeção para validar).
 */
function sinalSecundario(
  challenge: TrackChallengeSource,
  language: LanguageId,
): ValidacaoRequirements | null {
  const declarados = lerRequirementsDeclarados(challenge);
  if (declarados.length === 0) return null;
  try {
    return validarRequirements(challenge.testsCode, declarados, language);
  } catch {
    return { ok: false, semTeste: declarados.map((r) => r.id), testesSemRequirement: [], correspondencias: [] };
  }
}

/** Sorted + únicos. */
export function uniqSorted(items: AtomKey[]): AtomKey[] {
  return [...new Set(items)].sort();
}

// ---------------------------------------------------------------------------
// Revisão de um desafio (zero LLM — usa o sintetizador mínimo + orçamento)
// ---------------------------------------------------------------------------

export async function revisarDesafio(
  prover: ProverDeDesafio,
  aulaRef: string,
  ch: TrackChallengeSource,
  orc: OrcamentoDeAula,
  language: LanguageId,
): Promise<FeedbackDeDesafio> {
  const ref = `${aulaRef}/${ch.slug}`;

  // Desafio multi-arquivo: o sintetizador mínimo opera no arquivo único —
  // fora do escopo desta onda (mesmo tratamento do coverage). Não torna a aula
  // não-revisável.
  if (ch.files && ch.files.length > 0 && (ch.starterCode === undefined || ch.solutionCode === undefined)) {
    return {
      slug: ch.slug,
      ref,
      veredito: { ok: false, reason: 'IGNORADO', detail: 'desafio multi-arquivo (files) — fora do escopo desta onda' },
      atomsCobrados: [],
      foraDoOrcamento: [],
      excesso: [],
      requirements: null,
    };
  }

  // A LINGUAGEM DA TRILHA decide QUEM sintetiza (`quality/minimalPorLinguagem.ts`).
  // Até `main@26dbc19` esta chamada era `sintetizarCodigoMinimo` DIRETO, sem
  // `language` — e aquele módulo é javascript-only por decisão declarada. Efeito
  // MEDIDO na única trilha do produto:
  //   cd app && npx tsx tools/track-engine/cli.ts revise python --limite 1
  //   → NAO-REVISAVEL (fail-closed) · exit 1
  // Fechado do jeito certo (nunca aprovou por omissão) e ainda assim cego: o
  // veredito não era sobre o conteúdo, era sobre o parser errado.
  const veredito = await sintetizarCodigoMinimoDaLinguagem(prover, {
    starterCode: ch.starterCode ?? '',
    solutionCode: ch.solutionCode ?? '',
    testsCode: ch.testsCode,
    expectedTestCount: ch.expectedTestCount,
    language,
  });

  // Fail-closed: veredito não-ok é DOCUMENTADO no feedback; quem decide é a
  // aula (naoRevisavel) — nunca um vazio silencioso.
  if (!veredito.ok) {
    return {
      slug: ch.slug,
      ref,
      veredito,
      atomsCobrados: [],
      foraDoOrcamento: [],
      excesso: [],
      requirements: sinalSecundario(ch, language),
    };
  }

  // LACUNA = atoms(minimal) ⊄ (productive ∪ receptive) — SEMPRE `atoms`,
  // NUNCA `atomsDoTeste` (contrato A4).
  const foraDoOrcamento = uniqSorted(veredito.atoms.filter((a) => !orc.productive.has(a) && !orc.receptive.has(a)));
  // EXCESSO = introduces.productive não usado pelo mínimo (produtivo só;
  // excesso receptivo é by-design — leitura não é cobrada por teste).
  const excesso = uniqSorted(orc.introducesProductive.filter((a) => !veredito.atoms.includes(a)));

  return {
    slug: ch.slug,
    ref,
    veredito,
    minimalCode: veredito.minimalCode,
    atomsCobrados: veredito.atoms,
    foraDoOrcamento,
    excesso,
    requirements: sinalSecundario(ch, language),
  };
}

// ---------------------------------------------------------------------------
// revisarCurso — a varredura progressiva (1ª aula → última, memória acumulada)
// ---------------------------------------------------------------------------

/**
 * Percorre as aulas NA ORDEM pedagógica (1ª → última) com o acumulador
 * `memoriaDeRevisao`: o feedback da aula N vira contexto da N+1. Zero LLM —
 * determinístico: mesma trilha + mesmo prover ⇒ mesmo relatório.
 */
