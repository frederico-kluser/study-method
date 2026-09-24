/**
 * app/electron/main/engine/quality/barraRegras.ts — as REGRAS da barra
 * pedagógica (A17–A24), UMA função por regra, na ordem em que reprovam.
 *
 * A prosa normativa (o que cada regra mede e por quê) vive na fachada
 * `barra.ts`. Refatoração L04: arquivo ≤500 linhas e toda função com CC≤8,
 * sem mudança de comportamento observável.
 */

import type { TrackLessonSource } from '../../content/trackTypes';
import type { AtomKey } from '../atomKeys';
import { humanLabel } from '../atomKeys';
import type { LanguageId } from '../lang/registry';
import type { AchadoDaBarra } from './barraTipos';
import {
  FOLGA_DE_COMPRIMENTO_DO_QUIZ,
  MINIMO_FORMAS_POR_CHAVE,
  MINIMO_SECOES_DE_TEORIA,
  TETO_NOVAS_TOTAL,
  TETO_PRODUTIVAS_NOVAS,
  TETO_PRODUTIVAS_NOVAS_AULA_1,
} from './barraTipos';
import type { DerivadaDeclarada, DerivadasLidas } from './barraLeitura';
import { type DemonstracaoDaAula, type QuizMedido, medirVazamentoDoQuiz } from './barraDemo';

/** Tudo o que as regras de UMA aula precisam — já derivado pelo orquestrador. */
export interface EntradaDaAula {
  ref: string;
  adapterId: LanguageId;
  meta: TrackLessonSource;
  /** o `role` declarado (ausente = `regular`). */
  papel: string;
  secoes: number;
  demo: DemonstracaoDaAula;
  /** o `introduces` declarado da aula (o texto dos achados o cita). */
  introduces: { productive: readonly AtomKey[]; receptive: readonly AtomKey[] };
  desafios: number;
  /** o axioma de entrada da trilha (A18 mede contra ele). */
  axioma: ReadonlySet<AtomKey>;
  primeiraAula: boolean;
  /** o que a aula acrescenta (fora da entrada). */
  produtivas: AtomKey[];
  todas: AtomKey[];
  derivadas: DerivadasLidas;
}

// ---------------------------------------------------------------------------
// A23 — a derivada só vale com pai declarado e co-ocorrência de LINHA
// ---------------------------------------------------------------------------

/** O achado A23 de uma derivada que passou na forma mas falhou na prova. */
function achadoDeDerivada(
  ref: string,
  chave: AtomKey | null,
  evidencia: string,
  mensagem: string,
): AchadoDaBarra {
  return {
    regra: 'A23',
    ref,
    chave,
    evidencia,
    mensagem,
    acao: 'REWRITE_IN_BUDGET',
    severidade: 'erro',
  };
}

/** Valida UMA derivada declarada; null quando ela colapsa de verdade. */
function validarDerivada(
  derivada: DerivadaDeclarada,
  aula: EntradaDaAula,
  declaradas: ReadonlySet<AtomKey>,
  chavesDerivadasDeclaradas: ReadonlySet<AtomKey>,
): AchadoDaBarra | null {
  if (!declaradas.has(derivada.chave) || !declaradas.has(derivada.de)) {
    return achadoDeDerivada(
      aula.ref,
      derivada.chave,
      `derivada ${derivada.chave} declarada com pai ${derivada.de}; productive = [${aula.introduces.productive.join(', ')}]; receptive = [${aula.introduces.receptive.join(', ')}]`,
      'derivada e pai precisam estar os DOIS declarados em `introduces` (produtiva ou receptiva) — a regra do par colapsa itens do mesmo declarado, não importa de fora',
    );
  }
  if (chavesDerivadasDeclaradas.has(derivada.de)) {
    return achadoDeDerivada(
      aula.ref,
      derivada.chave,
      `${derivada.chave} deriva de ${derivada.de}, que também está declarada como derivada`,
      'cadeia de derivadas é proibida: toda derivada aponta DIRETO para a chave que distingue a construção',
    );
  }
  const linhasDaChave = aula.demo.linhasPorChave.get(derivada.chave);
  const linhasDoPai = aula.demo.linhasPorChave.get(derivada.de);
  const coocorre =
    linhasDaChave !== undefined &&
    linhasDoPai !== undefined &&
    [...linhasDaChave].some((l) => linhasDoPai.has(l));
  if (!coocorre) {
    return achadoDeDerivada(
      aula.ref,
      derivada.chave,
      `nenhuma linha de bloco desta aula tem ${derivada.chave} e ${derivada.de} juntas`,
      '"derivada inevitável" é medida no disco: a chave e o pai ocorrem na MESMA linha de um bloco de código desta aula. Sem co-ocorrência, ela conta cheia no teto',
    );
  }
  return null;
}

/**
 * ── A23 — a derivada só vale com pai declarado e co-ocorrência de LINHA ──
 *
 * A REGRA DO PAR VALE NAS DUAS FAIXAS. A primeira versão desta bateria só
 * aceitava derivada entre chaves PRODUTIVAS, e a consequência apareceu na
 * primeira aula de Rust que tentou cumprir A18: `todo!()` numa linha emite
 * `api:todo!` + `node:MacroInvocation` + `node:TokenTree` — três chaves
 * RECEPTIVAS que são UMA construção para quem lê ("a macro que marca o
 * buraco"), e contá-las cheias estourava A21 numa aula que ensina uma coisa
 * só. O que a regra exige é o mesmo nas duas faixas: pai declarado e
 * co-ocorrência na mesma linha de um bloco desta aula.
 */
export function checarA23(aula: EntradaDaAula): {
  achados: AchadoDaBarra[];
  derivadasValidas: Set<AtomKey>;
} {
  const achados: AchadoDaBarra[] = [];
  const declaradas = new Set<AtomKey>([
    ...aula.introduces.productive,
    ...aula.introduces.receptive,
  ]);
  const chavesDerivadasDeclaradas = new Set<AtomKey>(aula.derivadas.validasNaForma.map((d) => d.chave));
  const derivadasValidas = new Set<AtomKey>();

  for (const bruto of aula.derivadas.malformadas) {
    achados.push(
      achadoDeDerivada(
        aula.ref,
        null,
        `introduces.derived tem entrada malformada: ${JSON.stringify(bruto).slice(0, 120)}`,
        'cada item de `introduces.derived` é um objeto `{ "chave": "<atomo>", "de": "<atomo>" }` com as duas chaves no formato de átomo',
      ),
    );
  }
  for (const derivada of aula.derivadas.validasNaForma) {
    const erro = validarDerivada(derivada, aula, declaradas, chavesDerivadasDeclaradas);
    if (erro !== null) {
      achados.push(erro);
      continue;
    }
    derivadasValidas.add(derivada.chave);
  }

  return { achados, derivadasValidas };
}

// ---------------------------------------------------------------------------
// A17 / A18 — o teto do passo e a primeira aula
// ---------------------------------------------------------------------------

/** ── A17 — o teto do passo ──────────────────────────────────────────────── */
export function checarA17(ref: string, produtivasColapsadas: readonly AtomKey[]): AchadoDaBarra[] {
  if (produtivasColapsadas.length > TETO_PRODUTIVAS_NOVAS) {
    return [
      {
        regra: 'A17',
        ref,
        chave: null,
        evidencia: `${produtivasColapsadas.length} construções produtivas novas depois do colapso: [${produtivasColapsadas.join(', ')}]`,
        mensagem: `no máximo ${TETO_PRODUTIVAS_NOVAS} construções produtivas novas por aula (regra do par já aplicada) — o excedente é aula própria`,
        acao: 'SPLIT_LESSON',
        severidade: 'erro',
      },
    ];
  }
  return [];
}

/** ── A18 — a primeira aula do curso ─────────────────────────────────────── */
export function checarA18(aula: EntradaDaAula, produtivasColapsadas: readonly AtomKey[]): AchadoDaBarra[] {
  if (!aula.primeiraAula) return [];
  const achados: AchadoDaBarra[] = [];
  if (produtivasColapsadas.length > TETO_PRODUTIVAS_NOVAS_AULA_1) {
    achados.push({
      regra: 'A18',
      ref: aula.ref,
      chave: null,
      evidencia: `aula 1 da trilha com ${produtivasColapsadas.length} produtivas novas: [${produtivasColapsadas.join(', ')}]`,
      mensagem: `a PRIMEIRA aula do curso ensina no máximo ${TETO_PRODUTIVAS_NOVAS_AULA_1} construção produtiva nova — na aula 1 o aluno não tem orçamento nenhum para amortecer o passo`,
      acao: 'SPLIT_LESSON',
      severidade: 'erro',
    });
  }
  for (const chave of aula.todas) {
    if (aula.axioma.has(chave)) continue;
    if ((aula.demo.formasPorChave.get(chave)?.size ?? 0) > 0) continue;
    achados.push({
      regra: 'A18',
      ref: aula.ref,
      chave,
      evidencia: `${chave} está em introduces da aula 1 e não aparece em nenhum bloco de código da aula`,
      mensagem: `na aula 1 não existe "o aluno só copia": ${humanLabel(chave)} precisa de demonstração própria nesta aula, ou sai da aula`,
      acao: 'SPLIT_LESSON',
      severidade: 'erro',
    });
  }
  return achados;
}

// ---------------------------------------------------------------------------
// A19 / A20 — declarar não é demonstrar; aula sem prova não é aula
// ---------------------------------------------------------------------------

/** ── A19 — declarar não é demonstrar ────────────────────────────────────── */
export function checarA19(aula: EntradaDaAula): {
  achados: AchadoDaBarra[];
  semDemonstracao: number;
} {
  const achados: AchadoDaBarra[] = [];
  let semDemonstracao = 0;
  for (const chave of aula.todas) {
    const formas = aula.demo.formasPorChave.get(chave)?.size ?? 0;
    if (formas > 0) continue;
    semDemonstracao += 1;
    if (aula.primeiraAula && !aula.axioma.has(chave)) continue; // já reportada por A18
    achados.push({
      regra: 'A19',
      ref: aula.ref,
      chave,
      evidencia: `${chave} está em introduces e não aparece em nenhum dos ${aula.demo.blocos} bloco(s) \`${aula.adapterId}\` da teoria desta aula`,
      mensagem: `declarar não é demonstrar: ${humanLabel(chave)} precisa aparecer em bloco cercado com tag de linguagem na teoria desta aula`,
      acao: 'REWRITE_IN_BUDGET',
      severidade: 'erro',
    });
  }
  return { achados, semDemonstracao };
}

/**
 * ── A20 — aula sem prova não é aula ──────────────────────────────────────
 *
 * O DESAFIO É EXIGIDO DE TODA AULA, qualquer que seja o `role`. A primeira
 * versão desta regra só olhava `role: regular`, e a consequência foi medida
 * na hora: das 113 aulas-esqueleto do `c-iniciante`, as que o contrato marca
 * como consolidação escapavam do gate — 70 aulas sem desafio nenhum saindo
 * como verdes. Consolidação muda o que a aula INTRODUZ (nada), nunca o fato
 * de que aula sem desafio é aula sem prova: nas duas trilhas autoradas a
 * razão é 1 desafio por aula (python 112/113, rust 101/101).
 *
 * A SEGUNDA METADE DE A20 é sobre NOVIDADE, e ela conta as DUAS FAIXAS.
 *
 * A primeira versão exigia construção PRODUTIVA nova em toda aula
 * `regular`, e a autoria do M1 de C mostrou, na aula 3, por que isso é
 * estreito demais: `devolver-zero` ensina o `return 0;` do `main` do harness
 * como LEITURA — a escrita nasce quatro módulos depois —, e "ler antes de
 * escrever" é o primeiro princípio da pedagogia deste produto
 * (`qualidade-aula.md` §1), não uma exceção. Uma aula cuja única novidade é
 * RECEPTIVA é uma aula legítima; o que não é aula é a que não acrescenta
 * NADA — nem para escrever, nem para ler.
 */
export function checarA20(aula: EntradaDaAula): AchadoDaBarra[] {
  const achados: AchadoDaBarra[] = [];
  if (aula.desafios === 0) {
    achados.push({
      regra: 'A20',
      ref: aula.ref,
      chave: null,
      evidencia: `aula \`role: ${aula.papel}\` com \`challenges[]\` vazio`,
      mensagem:
        'aula sem desafio é aula sem prova: o aluno não tem como exercitar nem como ser conferido por execução',
      acao: 'ADD_TEST',
      severidade: 'erro',
    });
  }
  if (aula.papel === 'regular' && aula.todas.length === 0) {
    achados.push({
      regra: 'A20',
      ref: aula.ref,
      chave: null,
      evidencia: `aula \`role: regular\` sem construção nova nenhuma (introduces.productive = [${aula.introduces.productive.join(', ')}], receptive = [${aula.introduces.receptive.join(', ')}])`,
      mensagem:
        'aula regular que não introduz construção nenhuma — nem para escrever, nem para ler — é reforço, e reforço se declara: `role: "consolidation"` com o degrau nomeado, ou a aula ganha o seu passo',
      acao: 'DECLARE_INTEGRATIVE',
      severidade: 'erro',
    });
  }
  return achados;
}

// ---------------------------------------------------------------------------
// A21 / A22 — a carga de novidade e as duas formas sintáticas
// ---------------------------------------------------------------------------

/** ── A21 — a carga de novidade e as seções que a sustentam ──────────────── */
export function checarA21(aula: EntradaDaAula, todasColapsadas: readonly AtomKey[]): AchadoDaBarra[] {
  const achados: AchadoDaBarra[] = [];
  if (todasColapsadas.length > TETO_NOVAS_TOTAL) {
    achados.push({
      regra: 'A21',
      ref: aula.ref,
      chave: null,
      evidencia: `${todasColapsadas.length} chaves novas (produtivas + receptivas, colapsadas): [${todasColapsadas.join(', ')}]`,
      mensagem: `no máximo ${TETO_NOVAS_TOTAL} construções novas por aula, somando o que o aluno escreve e o que ele só lê — acima disso a aula é penhasco e se quebra`,
      acao: 'SPLIT_LESSON',
      severidade: 'erro',
    });
  }
  if (aula.todas.length > 0) {
    const minimo = Math.max(MINIMO_SECOES_DE_TEORIA, Math.ceil(todasColapsadas.length / 2));
    if (aula.secoes < minimo) {
      achados.push({
        regra: 'A21',
        ref: aula.ref,
        chave: null,
        evidencia: `${aula.secoes} seção(ões) de teoria para ${todasColapsadas.length} construção(ões) nova(s)`,
        mensagem: `são necessárias ao menos ${minimo} seções de teoria nesta aula (mínimo ${MINIMO_SECOES_DE_TEORIA}, e uma a cada duas construções novas) — uma seção só não ensina duas coisas`,
        acao: 'SPLIT_LESSON',
        severidade: 'erro',
      });
    }
  }
  return achados;
}

/** ── A22 — duas formas sintáticas (aviso com contagem) ─────────────────── */
export function checarA22(aula: EntradaDaAula, produtivas: readonly AtomKey[]): {
  achados: AchadoDaBarra[];
  comUmaFormaSo: number;
} {
  const achados: AchadoDaBarra[] = [];
  let comUmaFormaSo = 0;
  for (const chave of produtivas) {
    const formas = aula.demo.formasPorChave.get(chave)?.size ?? 0;
    if (formas === 0) continue; // é A19, não A22
    if (formas >= MINIMO_FORMAS_POR_CHAVE) continue;
    comUmaFormaSo += 1;
    achados.push({
      regra: 'A22',
      ref: aula.ref,
      chave,
      evidencia: `${chave} aparece em 1 forma sintática só nos blocos desta aula`,
      mensagem: `mostre ${humanLabel(chave)} em ao menos ${MINIMO_FORMAS_POR_CHAVE} formas sintaticamente distintas (argumento literal E expressão composta; condição comparada E booleano pronto) — uma forma só faz o aluno induzir regra restrita demais`,
      acao: 'REWRITE_IN_BUDGET',
      severidade: 'aviso',
    });
  }
  return { achados, comUmaFormaSo };
}

// ---------------------------------------------------------------------------
// A24 — o quiz não pode ser acertado pelo COMPRIMENTO
// ---------------------------------------------------------------------------

/** ── A24 — o quiz não pode ser acertado pelo COMPRIMENTO ──────────────── */
export function checarA24(aula: EntradaDaAula): { achados: AchadoDaBarra[]; quiz: QuizMedido } {
  const quiz = medirVazamentoDoQuiz(aula.meta);
  const achados: AchadoDaBarra[] = [];
  if (quiz.medidas >= 2 && quiz.vazamForte === quiz.medidas) {
    achados.push({
      regra: 'A24',
      ref: aula.ref,
      chave: null,
      evidencia: `nas ${quiz.medidas} afirmações desta aula a opção correta é a MAIS LONGA, sozinha, e por mais de ${FOLGA_DE_COMPRIMENTO_DO_QUIZ} caracteres (excessos: ${quiz.excessos.join(', ')})`,
      mensagem:
        '"clique na maior" acerta o quiz inteiro desta aula sem ler nada — reescreva os distratores para que o comprimento não denuncie a resposta (o produto de-vaza a POSIÇÃO, nunca o COMPRIMENTO)',
      acao: 'REWRITE_IN_BUDGET',
      severidade: 'erro',
    });
  } else {
    for (const excesso of quiz.avisos) {
      achados.push({
        regra: 'A24',
        ref: aula.ref,
        chave: null,
        evidencia: `afirmação "${excesso.id}": a opção correta é a mais longa das 4, sozinha (${excesso.correta} chars contra ${excesso.segunda} da segunda)`,
        mensagem:
          'a opção correta ser a mais longa é coincidência em uma afirmação e sistema em todas — equilibre os comprimentos (o acaso é 25% das afirmações; medido, o rust-iniciante estava em 73%)',
        acao: 'REWRITE_IN_BUDGET',
        severidade: 'aviso',
      });
    }
  }
  return { achados, quiz };
}

// ---------------------------------------------------------------------------
// O fail-closed do parse da teoria
// ---------------------------------------------------------------------------

/** Blocos que não parseiam: A19 fail-closed — não medido nunca é verde. */
export function checarBlocosNaoParseados(aula: EntradaDaAula): AchadoDaBarra[] {
  return aula.demo.naoParseados.map((falha) => ({
    regra: 'A19' as const,
    ref: aula.ref,
    chave: null,
    evidencia: `bloco de código na linha ${falha.linha} não parseia: ${falha.mensagem}`,
    mensagem:
      'bloco de código da teoria que não parseia não demonstra nada — o gate não pode medir o que o parser recusa (fail-closed)',
    acao: 'REWRITE_IN_BUDGET' as const,
    severidade: 'erro' as const,
  }));
}
