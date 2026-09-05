/**
 * app/electron/main/engine/quality/discriminacao.ts — A CLÁUSULA J5
 * (Discriminação) de `docs/16-engine-de-trilha.md` §9.1, especificada desde o
 * começo e nunca implementada. Zero LLM, PURO, determinístico.
 *
 * ─── A PERGUNTA QUE ESTE MÓDULO RESPONDE ──────────────────────────────────
 *
 * O `audit` já responde "o desafio EXERCITA o que a aula ensinou?" — é a regra
 * A6 (`engine/audit.ts:560-578`), e ela olha a SOLUÇÃO DE REFERÊNCIA. Este
 * módulo responde a outra, que ninguém verificava:
 *
 *     "o TESTE DISCRIMINA? Ele DERRUBA quem não usou a construção da aula?"
 *
 * São perguntas diferentes e a diferença é MEDIDA. Na trilha `python` de
 * `main@26dbc19`, `coverage` (depois de enxergar Python) deu 21 de 21 desafios
 * medidos, ZERO lacunas — nenhum desafio cobra o que a aula não ensinou, que é
 * a garantia que o dono pediu e ela está satisfeita — e 29 EXCESSOS. Os 29
 * excessos são um número, não uma explicação. A explicação é esta:
 *
 *     o código mínimo que passa em CADA um dos 21 desafios é um único
 *     `print("<saída esperada>")`.
 *
 * Todo teste da trilha compara stdout por igualdade e nenhum força a construção
 * que a aula ensinou. A aula de potência não exige `**`; a de f-string não
 * exige f-string; a de variável não exige atribuição. **Um aluno passa nos 21
 * desafios imprimindo literais.** O `audit` fica verde porque a SOLUÇÃO usa a
 * construção — e usa mesmo. O que falha é o teste, não a solução.
 *
 * ─── A PROVA ESTÁTICA (o que este módulo calcula) ─────────────────────────
 *
 * Para cada desafio, com `alvos = introduces.productive` da aula:
 *
 *     alvosNaSolucao     = alvos ∩ atoms(solutionCode)
 *     discriminados      = alvosNaSolucao ∩ atoms(minimalCode)
 *     naoDiscriminados   = alvosNaSolucao ∖ atoms(minimalCode)
 *
 * `naoDiscriminados ≠ ∅` ⇒ **o teste não discrimina**: a construção-alvo está
 * na solução E o menor código que o teste aceita NÃO a contém.
 *
 * A interseção com a solução é o que separa esta medida do `excesso` do
 * `coverage` (`introduces.productive ∖ atoms(minimal)`, sem olhar a solução).
 * `naoDiscriminados ⊆ excesso` sempre; o excesso que NÃO é falta de
 * discriminação é outra coisa — átomo declarado no `introduces` que nem a
 * solução usa, que é assunto de A6/J2, não de J5.
 *
 * ─── CLASSIFICAÇÃO: AVISO COM CONTAGEM, NUNCA VIOLAÇÃO ────────────────────
 *
 * DECISÃO DE PROJETO, congelada no tipo (`classificacao: 'aviso'` é literal, não
 * parâmetro). O repositório já separa `avisos` de `violações` no placar
 * (`app/tools/track-engine/cli.ts:270-275` conta os dois em separado,
 * justamente porque "chamar tudo de violação mentiria"). Transformar falta de
 * discriminação em reprovação pintaria o gate de vermelho em 17 das 20 aulas da
 * única trilha do produto sem decisão do dono. MEDIDO com o mesmo pipeline do
 * `coverage` — `loadTrack` → `deriveTrackBudget` →
 * `sintetizarCodigoMinimoDaLinguagem` → `avaliarDiscriminacao` sobre
 * `resources/tracks/python` — lendo `placar.aulasComAlvoNaoDiscriminado` (17)
 * sobre `placar.aulasMedidas` (20); `avaliarDiscriminacao` ainda NÃO está
 * ligada ao CLI, então essas duas contagens não saem de
 * `npm run engine -- coverage python`, que reproduz só o 21/21/29 do
 * parágrafo acima. Este módulo **MEDE e DECLARA**; quem decide reprovar é o
 * dono do produto, e no dia em que decidir a mudança é no chamador, não aqui.
 *
 * Por isso também NÃO existe função `reprovar()` nem exit code neste arquivo:
 * ele devolve relatório.
 *
 * ─── FAIL-CLOSED (docs/16 §9.3) ───────────────────────────────────────────
 *
 * Desafio cujo mínimo NÃO foi provado (`MinimalVerdict` não-ok) sai como
 * `nao-medido`, entra no contador `naoMedidos` e NUNCA como `discrimina`.
 * "Não olhei" jamais é contado como "está certo" — foi exatamente esse degrau
 * que deixou `coverage` sair 0 sobre 21 `parse-falhou` até `main@26dbc19`.
 * Solução que não parseia na linguagem da trilha idem: `nao-medido`, com o
 * motivo escrito.
 *
 * ─── O QUE ELE NÃO FAZ ────────────────────────────────────────────────────
 *
 * Não gera mutantes nem roda teste nenhum: a prova é ESTÁTICA, sobre conjuntos
 * de átomos que outros módulos já produziram. A parte executável da J5 ("cada
 * solução errada catalogada falha em ≥1 teste; nenhum par falha no mesmo
 * conjunto") é `quality/mutants.ts` e continua sendo dele. Não sintetiza o
 * mínimo: recebe o `MinimalVerdict` pronto de
 * `quality/minimalPorLinguagem.ts` — uma extração só, `docs/16` §5.3 ("se dois
 * estágios parseiam com opções diferentes, o gate vira loteria").
 * Não reescreve desafio, teste nem aula.
 */

import type { AtomKey } from '../atomKeys';
import { extractAtoms } from '../extract';
import { DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';
import type { MinimalVerdict } from './minimal';

// ---------------------------------------------------------------------------
// Contrato público
// ---------------------------------------------------------------------------

/**
 * O veredito do sintetizador mínimo como este módulo o consome.
 *
 * É `MinimalVerdict` OU a forma não-ok que o `coverage`/`revise` já usam para
 * "desafio fora do escopo do sintetizador" (`IGNORADO`, multi-arquivo). Aceitar
 * as duas evita que o chamador tenha de inventar um veredito falso para o caso
 * que ele já sabe classificar.
 */
export type VereditoMinimo = MinimalVerdict | { ok: false; reason: string; detail?: string };

/** A entrada de UM desafio. Tudo o que o chamador já tem em mãos. */
export interface DesafioParaDiscriminacao {
  /** `<moduleSlug>/<lessonSlug>/<challengeSlug>` — a ref do `coverage`. */
  ref: string;
  /**
   * `<moduleSlug>/<lessonSlug>` da aula dona do orçamento, ou `null` para
   * desafio de módulo/proficiência (que não tem aula e por isso não tem alvo).
   */
  lessonRef: string | null;
  /** a solução de referência do desafio. */
  solutionCode: string;
  /**
   * `introduces.productive` da aula — as construções-ALVO, o que esta aula
   * ensina a ESCREVER. Vazio ⇒ não há o que discriminar (status `sem-alvo`).
   */
  alvos: readonly AtomKey[];
  /** o veredito do sintetizador mínimo para ESTE desafio. */
  minimal: VereditoMinimo;
}

/**
 * O veredito de discriminação de um desafio.
 *
 *   `discrimina`     — todo alvo presente na solução também está no mínimo;
 *   `nao-discrimina` — ao menos um alvo está na solução e NÃO no mínimo (AVISO);
 *   `sem-alvo`       — a aula não declara `introduces.productive` (ou o desafio
 *                      não é de aula): não há o que discriminar;
 *   `nao-medido`     — o mínimo não foi provado ou a solução não parseia
 *                      (fail-closed: nunca conta como `discrimina`).
 */
export type StatusDeDiscriminacao = 'discrimina' | 'nao-discrimina' | 'sem-alvo' | 'nao-medido';

export interface DiscriminacaoDeDesafio {
  ref: string;
  lessonRef: string | null;
  status: StatusDeDiscriminacao;
  /** `introduces.productive` da aula (sorted, únicos). */
  alvos: AtomKey[];
  /** alvos que a SOLUÇÃO de referência de fato usa (é o que A6/J2 exige). */
  alvosNaSolucao: AtomKey[];
  /** alvos declarados que nem a solução usa — sinal de A6/J2, não de J5. */
  alvosForaDaSolucao: AtomKey[];
  /** alvos na solução que o CÓDIGO MÍNIMO também precisa ter: o teste os força. */
  discriminados: AtomKey[];
  /** alvos na solução AUSENTES do código mínimo: o teste NÃO os força (AVISO). */
  naoDiscriminados: AtomKey[];
  /** o código mínimo que passa no teste, quando houve veredito ok. */
  minimalCode: string | null;
  /** átomos do código mínimo (`atoms(minimal)`), vazio quando não medido. */
  atomsDoMinimo: AtomKey[];
  /** frase em pt-BR determinística — sempre presente, sempre derivada. */
  motivo: string;
}

export interface PlacarDeDiscriminacao {
  desafios: number;
  /** desafios com alvo e mínimo provado — a base de qualquer conclusão. */
  medidos: number;
  /** fail-closed: mínimo não provado / solução não parseia. */
  naoMedidos: number;
  /** sem `introduces.productive` (ou sem aula dona). */
  semAlvo: number;
  discriminam: number;
  naoDiscriminam: number;
  /** soma de `alvosNaSolucao` sobre os desafios MEDIDOS. */
  alvosMedidos: number;
  alvosDiscriminados: number;
  alvosNaoDiscriminados: number;
  /** aulas distintas com ao menos um alvo não discriminado. */
  aulasComAlvoNaoDiscriminado: number;
  /** aulas distintas com ao menos um desafio medido. */
  aulasMedidas: number;
}

export interface RelatorioDeDiscriminacao {
  trilha: string;
  linguagem: LanguageId;
  /**
   * CONGELADO em `'aviso'` (ver o cabeçalho). Existe como campo para que a
   * saída DECLARE a classificação em vez de deixá-la implícita em quem lê.
   */
  classificacao: 'aviso';
  desafios: DiscriminacaoDeDesafio[];
  placar: PlacarDeDiscriminacao;
  /**
   * As limitações desta medição, em pt-BR — `docs/16` §9.2 ("toda limitação é
   * declarada na saída, nunca omitida") e `CONTRIBUTING.md` ("cada gate imprime
   * as suas no resumo").
   */
  limitacoes: string[];
}

export interface AvaliarDiscriminacaoOptions {
  /** a linguagem da trilha (`budget.adapterId`). Default: o adaptador default. */
  language?: LanguageId;
  /** nome de arquivo usado nas mensagens do extrator. Default: por linguagem. */
  fileNameDaSolucao?: string;
}

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// A avaliação (pura: mesma entrada ⇒ mesma saída, sem IO e sem rede)
// ---------------------------------------------------------------------------

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
  const alvos = uniqSorted(desafio.alvos);
  const base = {
    ref: desafio.ref,
    lessonRef: desafio.lessonRef,
    alvos,
    alvosNaSolucao: [] as AtomKey[],
    alvosForaDaSolucao: [] as AtomKey[],
    discriminados: [] as AtomKey[],
    naoDiscriminados: [] as AtomKey[],
    minimalCode: desafio.minimal.ok ? desafio.minimal.minimalCode : null,
    atomsDoMinimo: atomsDoMinimoDe(desafio.minimal) ?? [],
  };

  if (alvos.length === 0) {
    return {
      ...base,
      status: 'sem-alvo',
      motivo:
        desafio.lessonRef === null
          ? 'desafio sem aula dona (módulo/proficiência): não há `introduces.productive` para discriminar'
          : 'a aula não declara `introduces.productive`: não há construção-alvo para o teste forçar',
    };
  }

  // FAIL-CLOSED: sem mínimo provado não há o que comparar. `nao-medido` nunca
  // é `discrimina` — "não olhei" não é "está certo".
  const atomsDoMinimo = atomsDoMinimoDe(desafio.minimal);
  if (atomsDoMinimo === null) {
    return {
      ...base,
      status: 'nao-medido',
      motivo:
        `o código mínimo não foi provado (${razaoDoVereditoNaoOk(desafio.minimal)}) — sem ele não ` +
        'existe "o menor código que o teste aceita" para comparar com a solução',
    };
  }

  const extraido = extractAtoms(desafio.solutionCode, {
    fileName: options.fileNameDaSolucao ?? arquivoDaSolucao(language),
    language,
  });
  if (!extraido.ok) {
    return {
      ...base,
      atomsDoMinimo,
      status: 'nao-medido',
      motivo:
        `a solução de referência não parseia como ${language} (${extraido.error.message}) — sem os ` +
        'átomos dela não dá para saber quais alvos ela usa',
    };
  }

  const naSolucao = new Set(extraido.keys);
  const noMinimo = new Set(atomsDoMinimo);
  const alvosNaSolucao = alvos.filter((a) => naSolucao.has(a));
  const alvosForaDaSolucao = alvos.filter((a) => !naSolucao.has(a));
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
 * Avalia a trilha inteira e monta o placar.
 *
 * PURO: mesma entrada, mesma saída, sem IO e sem rede. A ordem dos desafios na
 * saída é a ordem da entrada (o chamador é quem conhece a ordem pedagógica).
 */
export function avaliarDiscriminacao(
  trilha: string,
  desafios: readonly DesafioParaDiscriminacao[],
  options: AvaliarDiscriminacaoOptions = {},
): RelatorioDeDiscriminacao {
  const language = options.language ?? DEFAULT_ADAPTER_ID;
  const avaliados = desafios.map((d) => avaliarDiscriminacaoDeDesafio(d, options));

  const medidos = avaliados.filter((a) => a.status === 'discrimina' || a.status === 'nao-discrimina');
  const aulasMedidas = new Set(medidos.map((a) => a.lessonRef).filter((r): r is string => r !== null));
  const aulasComAlvoNaoDiscriminado = new Set(
    avaliados
      .filter((a) => a.status === 'nao-discrimina')
      .map((a) => a.lessonRef)
      .filter((r): r is string => r !== null),
  );

  const placar: PlacarDeDiscriminacao = {
    desafios: avaliados.length,
    medidos: medidos.length,
    naoMedidos: avaliados.filter((a) => a.status === 'nao-medido').length,
    semAlvo: avaliados.filter((a) => a.status === 'sem-alvo').length,
    discriminam: avaliados.filter((a) => a.status === 'discrimina').length,
    naoDiscriminam: avaliados.filter((a) => a.status === 'nao-discrimina').length,
    alvosMedidos: medidos.reduce((acc, a) => acc + a.alvosNaSolucao.length, 0),
    alvosDiscriminados: medidos.reduce((acc, a) => acc + a.discriminados.length, 0),
    alvosNaoDiscriminados: medidos.reduce((acc, a) => acc + a.naoDiscriminados.length, 0),
    aulasComAlvoNaoDiscriminado: aulasComAlvoNaoDiscriminado.size,
    aulasMedidas: aulasMedidas.size,
  };

  return {
    trilha,
    linguagem: language,
    classificacao: 'aviso',
    desafios: avaliados,
    placar,
    limitacoes: limitacoesDeclaradas(placar),
  };
}

/**
 * As limitações DESTA medição, escritas na saída (`docs/16` §9.2). Elas são
 * derivadas do placar — nunca uma lista fixa que envelhece sem ninguém notar.
 */
function limitacoesDeclaradas(placar: PlacarDeDiscriminacao): string[] {
  const out: string[] = [
    'PROVA ESTÁTICA: compara conjuntos de átomos (solução × código mínimo). A parte EXECUTÁVEL da ' +
      'J5 — "cada solução errada catalogada falha em ≥1 teste; nenhum par falha no mesmo conjunto" — ' +
      'é `quality/mutants.ts` e NÃO roda aqui.',
    'CLASSIFICAÇÃO: AVISO com contagem, nunca violação — este módulo não reprova nada nem devolve ' +
      'exit code (decisão de projeto; ver o cabeçalho).',
  ];
  if (placar.naoMedidos > 0) {
    out.push(
      `${placar.naoMedidos} desafio(s) NÃO MEDIDO(S) (mínimo não provado ou solução que não parseia): ` +
        'o placar de discriminação NÃO fala por eles — fail-closed, `docs/16` §9.3.',
    );
  }
  if (placar.semAlvo > 0) {
    out.push(
      `${placar.semAlvo} desafio(s) SEM ALVO (sem aula dona ou sem \`introduces.productive\`): não há ` +
        'construção que o teste devesse forçar, então eles não entram em nenhuma conclusão sobre J5.',
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Formatação (pura — o chamador imprime; este módulo não escreve em stdout)
// ---------------------------------------------------------------------------

/**
 * O relatório como LINHAS de texto, no formato do `coverage`/`audit` do CLI.
 *
 * Está aqui, e não no CLI, porque a frase que explica um veredito é parte da
 * medição — e porque um módulo que devolve linhas é testável sem capturar
 * stdout. Quem chama decide se imprime, e o placar segue a convenção do
 * repositório (`N passou · N falhou · N pendente`, `docs/16` §9.2).
 */
export function linhasDeDiscriminacao(
  relatorio: RelatorioDeDiscriminacao,
  opcoes: { detalharTudo?: boolean } = {},
): string[] {
  const l: string[] = [];
  const p = relatorio.placar;
  l.push('');
  l.push(`TRILHA ${relatorio.trilha} — DISCRIMINACAO (J5: o teste FORCA a construcao da aula?)`);
  l.push(`linguagem: ${relatorio.linguagem} · classificacao: AVISO (mede e declara, nao reprova)`);

  for (const d of relatorio.desafios) {
    if (!opcoes.detalharTudo && d.status === 'discrimina') continue;
    l.push('');
    l.push(`  ${d.ref}  [${d.status.toUpperCase()}]`);
    l.push(`    alvos da aula (${d.alvos.length}): ${d.alvos.length > 0 ? d.alvos.join(', ') : '(nenhum)'}`);
    if (d.alvosNaSolucao.length > 0) {
      l.push(`    na solucao (${d.alvosNaSolucao.length}): ${d.alvosNaSolucao.join(', ')}`);
    }
    if (d.naoDiscriminados.length > 0) {
      l.push(`    NAO FORCADOS pelo teste (${d.naoDiscriminados.length}): ${d.naoDiscriminados.join(', ')}`);
    }
    if (d.minimalCode !== null) {
      l.push(`    minimo que passa: ${JSON.stringify(d.minimalCode)}`);
    }
    l.push(`    ${d.motivo}`);
  }

  l.push('');
  l.push('PLACAR (discriminacao — AVISO, nao reprova)');
  l.push(`  desafios ..................................... ${p.desafios}`);
  l.push(`  medidos ...................................... ${p.medidos}`);
  l.push(`  NAO MEDIDOS (fail-closed) .................... ${p.naoMedidos}`);
  l.push(`  sem alvo (sem aula dona / sem introduces) .... ${p.semAlvo}`);
  l.push(`  discriminam (o teste forca a construcao) ..... ${p.discriminam}`);
  l.push(`  AVISO: nao discriminam ....................... ${p.naoDiscriminam}`);
  l.push(`  alvos medidos (presentes na solucao) ......... ${p.alvosMedidos}`);
  l.push(`  alvos forcados pelo teste .................... ${p.alvosDiscriminados}`);
  l.push(`  AVISO: alvos NAO forcados pelo teste ......... ${p.alvosNaoDiscriminados}`);
  l.push(`  aulas com alvo nao forcado ................... ${p.aulasComAlvoNaoDiscriminado} de ${p.aulasMedidas} medida(s)`);
  l.push('');
  l.push(`  ${p.discriminam} passou · 0 falhou · ${p.naoDiscriminam + p.naoMedidos} pendente`);
  l.push('');
  l.push('LIMITACOES DECLARADAS (docs/16 §9.2 — nunca omitidas)');
  for (const lim of relatorio.limitacoes) l.push(`  - ${lim}`);
  l.push('');
  return l;
}
