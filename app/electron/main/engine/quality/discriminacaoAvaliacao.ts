/**
 * app/electron/main/engine/quality/discriminacaoAvaliacao.ts — a AVALIAÇÃO de
 * discriminação de UM desafio (J5): a prova estática por diferença de
 * conjuntos de átomos, fail-closed.
 *
 * A prosa normativa vive na fachada `discriminacao.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

import type { AtomKey } from '../atomKeys';
import { extractAtoms } from '../extract';
import { DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';
import {
  type AvaliarDiscriminacaoOptions,
  type DesafioParaDiscriminacao,
  type DiscriminacaoDeDesafio,
  type VereditoMinimo,
} from './discriminacaoTipos';

/** Sorted + únicos — a forma canônica de todo conjunto de átomos daqui. */
function uniqSorted(items: readonly AtomKey[]): AtomKey[] {
  return [...new Set(items)].sort();
}

/**
 * O nome de arquivo que o extrator recebe, por linguagem.
 *
 * Ele NÃO abre arquivo (o conteúdo vai em `code`); serve para a mensagem de
 * erro e, em JavaScript, para o dialeto. A tabela é explícita para que uma
 * linguagem nova não herde `solution.mjs` em silêncio.
 */
const ARQUIVO_DA_SOLUCAO: Readonly<Record<string, string>> = {
  javascript: 'solution.mjs',
  typescript: 'solution.ts',
  python: 'solucao.py',
};

function arquivoDaSolucao(language: LanguageId): string {
  return ARQUIVO_DA_SOLUCAO[language] ?? `solution.${language}`;
}

/** Os átomos do código mínimo — só existem quando o veredito é ok. */
function atomsDoMinimoDe(minimal: VereditoMinimo): AtomKey[] | null {
  return minimal.ok ? uniqSorted(minimal.atoms) : null;
}

/** A razão legível de um veredito não-ok, sem inventar texto. */
function razaoDoVereditoNaoOk(minimal: VereditoMinimo): string {
  if (minimal.ok) return '';
  const detalhe = 'detail' in minimal && minimal.detail ? `: ${minimal.detail}` : '';
  return `${minimal.reason}${detalhe}`;
}

/** O veredito SEM os campos que dependem da comparação (status/motivo). */
type BaseDoVeredito = Omit<DiscriminacaoDeDesafio, 'status' | 'motivo'>;

function baseDoVeredito(desafio: DesafioParaDiscriminacao): BaseDoVeredito {
  return {
    ref: desafio.ref,
    lessonRef: desafio.lessonRef,
    alvos: uniqSorted(desafio.alvos),
    alvosNaSolucao: [] as AtomKey[],
    alvosForaDaSolucao: [] as AtomKey[],
    discriminados: [] as AtomKey[],
    naoDiscriminados: [] as AtomKey[],
    minimalCode: desafio.minimal.ok ? desafio.minimal.minimalCode : null,
    atomsDoMinimo: atomsDoMinimoDe(desafio.minimal) ?? [],
  };
}

/** `sem-alvo`: a aula não declara alvo (ou o desafio não tem aula dona). */
function semAlvo(desafio: DesafioParaDiscriminacao, base: BaseDoVeredito): DiscriminacaoDeDesafio {
  return {
    ...base,
    status: 'sem-alvo',
    motivo:
      desafio.lessonRef === null
        ? 'desafio sem aula dona (módulo/proficiência): não há `introduces.productive` para discriminar'
        : 'a aula não declara `introduces.productive`: não há construção-alvo para o teste forçar',
  };
}

/** `nao-medido` (fail-closed): "não olhei" nunca é "está certo". */
function naoMedido(base: BaseDoVeredito, motivo: string): DiscriminacaoDeDesafio {
  return { ...base, status: 'nao-medido', motivo };
}

/**
 * A comparação de fato: alvos ∩ solução, e, sobre eles, o que o código mínimo
 * também exige (discrimina) contra o que ele dispensa (não discrimina).
 */
function compararComMinimo(
  base: BaseDoVeredito,
  atomsDoMinimo: AtomKey[],
  atomsDaSolucao: readonly AtomKey[],
): DiscriminacaoDeDesafio {
  const naSolucao = new Set(atomsDaSolucao);
  const noMinimo = new Set(atomsDoMinimo);
  const alvosNaSolucao = base.alvos.filter((a) => naSolucao.has(a));
  const alvosForaDaSolucao = base.alvos.filter((a) => !naSolucao.has(a));
  const discriminados = alvosNaSolucao.filter((a) => noMinimo.has(a));
  const naoDiscriminados = alvosNaSolucao.filter((a) => !noMinimo.has(a));

  const comum = {
    ...base,
    atomsDoMinimo,
    alvosNaSolucao,
    alvosForaDaSolucao,
    discriminados,
    naoDiscriminados,
  };

  if (naoDiscriminados.length === 0) {
    return {
      ...comum,
      status: 'discrimina',
      motivo:
        alvosNaSolucao.length === 0
          ? 'nenhum alvo da aula aparece na solução de referência — não há J5 a medir aqui (é sinal de A6/J2)'
          : `o teste FORÇA ${alvosNaSolucao.length} de ${alvosNaSolucao.length} alvo(s) da aula: ` +
            `o menor código que ele aceita contém ${discriminados.join(', ')}`,
    };
  }

  return {
    ...comum,
    status: 'nao-discrimina',
    motivo:
      `o teste NÃO FORÇA ${naoDiscriminados.join(', ')}: a construção está na solução de referência ` +
      'e AUSENTE do menor código que o teste aceita — um aluno que não a use passa mesmo assim',
  };
}

/**
 * Avalia UM desafio. Exportada porque é a unidade testável da prova — e porque
 * um chamador que já tem um desafio na mão não deve precisar montar uma trilha
 * inteira para perguntar sobre ele.
 */
export function avaliarDiscriminacaoDeDesafio(
  desafio: DesafioParaDiscriminacao,
  options: AvaliarDiscriminacaoOptions = {},
): DiscriminacaoDeDesafio {
  const language = options.language ?? DEFAULT_ADAPTER_ID;
  const base = baseDoVeredito(desafio);

  if (base.alvos.length === 0) {
    return semAlvo(desafio, base);
  }

  // FAIL-CLOSED: sem mínimo provado não há o que comparar. `nao-medido` nunca
  // é `discrimina` — "não olhei" não é "está certo".
  const atomsDoMinimo = atomsDoMinimoDe(desafio.minimal);
  if (atomsDoMinimo === null) {
    return naoMedido(
      base,
      `o código mínimo não foi provado (${razaoDoVereditoNaoOk(desafio.minimal)}) — sem ele não ` +
        'existe "o menor código que o teste aceita" para comparar com a solução',
    );
  }

  const extraido = extractAtoms(desafio.solutionCode, {
    fileName: options.fileNameDaSolucao ?? arquivoDaSolucao(language),
    language,
  });
  if (!extraido.ok) {
    return naoMedido(
      base,
      `a solução de referência não parseia como ${language} (${extraido.error.message}) — sem os ` +
        'átomos dela não dá para saber quais alvos ela usa',
    );
  }

  return compararComMinimo(base, atomsDoMinimo, extraido.keys);
}
