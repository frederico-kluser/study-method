/**
 * app/electron/main/engine/quality/barraDemo.ts — as DEMONSTRAÇÕES da teoria
 * da aula (formas sintáticas e linhas por chave) e a medição do vazamento do
 * quiz pelo COMPRIMENTO (A24).
 *
 * A prosa normativa vive na fachada `barra.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import type { TrackLessonSource, TrackTheorySection } from '../../content/trackTypes';
import type { AtomKey } from '../atomKeys';
import { extractAllOccurrences, type AtomOccurrence } from '../extract';
import type { LanguageId } from '../lang/registry';
import { collectLessonCode } from '../theoryCode';
import { FOLGA_DE_COMPRIMENTO_DO_QUIZ } from './barraTipos';

export interface DemonstracaoDaAula {
  /** por chave: os snippets DISTINTOS que a demonstram (A19/A22). */
  formasPorChave: Map<AtomKey, Set<string>>;
  /** por chave: as linhas (globais, por bloco) em que ela ocorre (A23). */
  linhasPorChave: Map<AtomKey, Set<string>>;
  /** quantos blocos da linguagem da trilha a aula tem. */
  blocos: number;
  /** blocos que não parseiam — fail-closed: não medido nunca é verde. */
  naoParseados: Array<{ linha: number; mensagem: string }>;
}

/**
 * A FORMA SINTÁTICA de uma ocorrência, normalizada — o que A22 compara.
 *
 * A primeira versão comparava o `snippet` cru do extrator, e um provador
 * adversarial mostrou, medindo, que isso deixava A22 ser satisfeito por NADA:
 *
 *   - por ESPAÇO EM BRANCO: em `a-tela/somar` (rust) as "duas formas" de
 *     `op:binary:+` eram `"+ b"` e `"+b"` — a MESMA forma, e a própria aula diz
 *     em prosa que o espaço é decoração;
 *   - por NOME DE VARIÁVEL: as formas de `node:Parameter` saíam como
 *     `"x: i32) -> i32 {"` e `"numero: i32) -> i32 {"` — só o nome mudou.
 *
 * A normalização mata os dois: o espaço colapsa, e todo identificador vira
 * `ID`. O que SOBREVIVE à normalização é o que muda de verdade — literal contra
 * expressão (`ID + 10` × `ID + ID`), operando de cada lado (`ID * 2` × `3 * ID`),
 * uma chamada contra duas.
 *
 * ⚑ LIMITE QUE FICA DECLARADO: o `snippet` do extrator é o SUFIXO DA LINHA a
 * partir do nó, não o texto do nó. Por isso a MESMA construção escrita em uma
 * linha e em várias ainda rende duas "formas" (`ID { 2 }` × `ID {`). Fechar isso
 * exigiria o texto do nó por `[start, end)` — que existe na ocorrência —, mas
 * para os eixos `op:` esse texto é só o token do operador, e aí A22 nunca
 * passaria. A escolha é declarada: A22 é AVISO, e um aviso que erra para o lado
 * de não acusar é melhor que um erro que acusa errado.
 */
export function formaNormalizada(snippet: string): string {
  return snippet
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[A-Za-z_][A-Za-z0-9_]*/g, 'ID');
}

/** Acumula uma ocorrência nas duas visões (formas e linhas). */
function acumularOcorrencia(
  demo: { formasPorChave: Map<AtomKey, Set<string>>; linhasPorChave: Map<AtomKey, Set<string>> },
  indiceDoBloco: number,
  ocorrencia: AtomOccurrence,
): void {
  const chave = ocorrencia.key;
  if (!demo.formasPorChave.has(chave)) demo.formasPorChave.set(chave, new Set());
  demo.formasPorChave.get(chave)!.add(formaNormalizada(ocorrencia.snippet));
  if (!demo.linhasPorChave.has(chave)) demo.linhasPorChave.set(chave, new Set());
  demo.linhasPorChave.get(chave)!.add(`${indiceDoBloco}:${ocorrencia.line}`);
}

/**
 * Extrai as demonstrações da teoria da aula, bloco por bloco, com o ADAPTADOR
 * DA TRILHA.
 *
 * `surface: 'theory'` não é decoração: é o que liga o ENVELOPE DE FRAGMENTO do
 * extrator (`extract.ts`), sem o qual a teoria de C — que demonstra em
 * fragmento, como a pedagogia manda (a aula 1 não pode mostrar `main`) — não
 * parseia e a bateria veria ZERO demonstração em toda aula de C.
 */
export function demonstracoesDa(
  meta: TrackLessonSource,
  adapterId: LanguageId,
): DemonstracaoDaAula {
  const formasPorChave = new Map<AtomKey, Set<string>>();
  const linhasPorChave = new Map<AtomKey, Set<string>>();
  const naoParseados: Array<{ linha: number; mensagem: string }> = [];
  const colhidos = collectLessonCode((meta.theory ?? []) as readonly TrackTheorySection[]);
  let blocos = 0;
  let indiceDoBloco = 0;
  for (const bloco of colhidos.blocks) {
    indiceDoBloco += 1;
    if (bloco.adapterId !== adapterId) continue;
    blocos += 1;
    const resultado = extractAllOccurrences(bloco.code, {
      language: adapterId,
      surface: 'theory',
      fileName: `${meta.slug}#teoria`,
    });
    if (!resultado.ok) {
      naoParseados.push({ linha: bloco.line, mensagem: resultado.error.message });
      continue;
    }
    for (const ocorrencia of resultado.occurrences as readonly AtomOccurrence[]) {
      acumularOcorrencia({ formasPorChave, linhasPorChave }, indiceDoBloco, ocorrencia);
    }
  }
  return { formasPorChave, linhasPorChave, blocos, naoParseados };
}

/** A medição A24 acumulada: o que mede, o que vaza (fraco/forte) e os excessos. */
export interface QuizMedido {
  /** afirmações com exatamente 4 opções e `answerIndex` válido. */
  medidas: number;
  /** afirmações em que a correta é a mais longa, sozinha. */
  vazamFraco: number;
  /** das fracas, as que vazam por MAIS de `FOLGA_DE_COMPRIMENTO_DO_QUIZ`. */
  vazamForte: number;
  /** os excessos (correta − segunda) dos vazamentos fortes. */
  excessos: number[];
  /** os vazamentos fracos, com id e comprimentos (para o aviso). */
  avisos: Array<{ id: string; correta: number; segunda: number }>;
}

/** Uma afirmação medível: os tamanhos das 4 opções e o índice da correta. */
interface AfirmacaoMedivel {
  id: unknown;
  tamanhos: number[];
  indice: number;
}

/** Só a afirmação com EXATAMENTE 4 opções e `answerIndex` em [0, 3] é medível. */
function lerAfirmacaoMedivel(item: unknown): AfirmacaoMedivel | null {
  if (typeof item !== 'object' || item === null) return null;
  const a = item as Record<string, unknown>;
  const ops = a.options;
  if (!Array.isArray(ops) || ops.length !== 4) return null;
  const indice = typeof a.answerIndex === 'number' ? a.answerIndex : -1;
  if (indice < 0 || indice > 3) return null;
  return {
    id: a.id,
    tamanhos: ops.map((o) => (typeof o === 'string' ? o.length : 0)),
    indice,
  };
}

/** Os dois maiores tamanhos (o 1º é o maior, o 2º é o segundo maior). */
function doisMaiores(tamanhos: readonly number[]): [number, number] {
  const ordenados = [...tamanhos].sort((x, y) => y - x);
  return [ordenados[0], ordenados[1]];
}

/** Mede UMA afirmação e acumula no total (só a mais longa, sozinha, vaza). */
function medirAfirmacao(lida: AfirmacaoMedivel, acc: QuizMedido): void {
  acc.medidas += 1;
  const correta = lida.tamanhos[lida.indice];
  const [maior, segunda] = doisMaiores(lida.tamanhos);
  if (correta !== maior || maior === segunda) return;
  acc.vazamFraco += 1;
  const id = typeof lida.id === 'string' ? lida.id : `#${acc.medidas}`;
  acc.avisos.push({ id, correta, segunda });
  if (correta > segunda + FOLGA_DE_COMPRIMENTO_DO_QUIZ) {
    acc.vazamForte += 1;
    acc.excessos.push(correta - segunda);
  }
}

/**
 * A24 — o vazamento do quiz pelo COMPRIMENTO das opções.
 *
 * PURA. Mede só as afirmações com EXATAMENTE 4 opções (o schema exige 4; uma
 * afirmação malformada é problema do loader, não desta bateria).
 */
export function medirVazamentoDoQuiz(meta: TrackLessonSource): QuizMedido {
  const bruto = (meta as unknown as Record<string, unknown>).assertions;
  const lista = Array.isArray(bruto) ? bruto : [];
  const acc: QuizMedido = {
    medidas: 0,
    vazamFraco: 0,
    vazamForte: 0,
    excessos: [],
    avisos: [],
  };
  for (const item of lista) {
    const lida = lerAfirmacaoMedivel(item);
    if (lida !== null) medirAfirmacao(lida, acc);
  }
  return acc;
}
