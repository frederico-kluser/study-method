/**
 * app/electron/main/engine/quality/judgeCalibrationDeteccao.ts — a RÉGUA de
 * detecção do defeito de um mutante (P-20): categoria detectora + abre rodada
 * + toque no marcador.
 *
 * O contrato e a prosa normativa vivem na fachada `judgeCalibration.ts`.
 * Refatoração L04: arquivo ≤500 linhas e toda função com CC≤8, sem mudança de
 * comportamento observável.
 */

import { type RevisaoComSeveridade } from '../prompts/reviewer';
import { abreRodada } from '../review/normalize';
import {
  type Desafio,
  type DesafioParaMutacao,
  type Mutante,
} from './mutants';
import { CATEGORIAS_QUE_DETECTAM, type MarcadorLocalizado } from './judgeCalibrationTipos';

/** Dois spans de `[inicio, fim]` se intersectam quando nenhum está antes do outro. */
function spansIntersectam(a: readonly [number, number], b: readonly [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/** O texto do marcador efetivo (o resolvido tem prioridade sobre o do mutante). */
function textoDoMarcadorDe(mutante: Mutante, marcador?: MarcadorLocalizado): string {
  return ((marcador?.texto ?? mutante.marcador) ?? '').trim();
}

/** O alvo do apontamento TOCA o marcador por interseção de span (caminho (a)). */
function alvoTocaMarcadorPorSpan(
  apontamento: RevisaoComSeveridade['apontamentos'][number],
  marcador: MarcadorLocalizado | undefined,
): boolean {
  return (
    marcador?.span !== undefined &&
    marcador.span !== null &&
    spansIntersectam(apontamento.alvo.span, marcador.span)
  );
}

/**
 * Um apontamento detecta o defeito do mutante quando (1) a categoria está no
 * conjunto detector da classe E (2) a categoria ABRE RODADA na tabela fixa do
 * §6.5 — o apontamento conta como acerto só quando mobiliza o laço — E (3),
 * quando o mutante carrega `marcador` (presente em todas as classes hoje;
 * `marcador` em branco = classe sem marcador → por categoria), o ALVO do
 * apontamento TOCA o marcador: o span do apontamento intersecta o span do
 * marcador, OU o trecho citado do apontamento (`alvo.token` e
 * `evidencia.prova` — os campos cujo contrato é citar o trecho literal do
 * defeito, §6.3/R4) menciona o marcador. Sem esta régua, um revisor que
 * aponta o trecho ERRADO do mutante contaria como acerto (falso-passe
 * subestimado — direção insegura).
 */
export function apontamentoDetectaDefeito(
  apontamento: RevisaoComSeveridade['apontamentos'][number],
  mutante: Mutante,
  marcador?: MarcadorLocalizado,
): boolean {
  const porCategoria =
    abreRodada(apontamento.categoria) && CATEGORIAS_QUE_DETECTAM[mutante.classe].includes(apontamento.categoria);
  if (!porCategoria) return false;

  const textoDoMarcador = textoDoMarcadorDe(mutante, marcador);
  if (textoDoMarcador === '') return true; // classe sem marcador → por categoria.

  if (alvoTocaMarcadorPorSpan(apontamento, marcador)) {
    return true; // (a) o alvo do apontamento toca o marcador por span.
  }

  // (b) o trecho citado do apontamento menciona o marcador — coordenadas à
  // parte, a menção literal do trecho do defeito também detecta.
  const trechoCitado = [apontamento.alvo.token, apontamento.evidencia.prova].join('\n');
  return trechoCitado.includes(textoDoMarcador);
}

/** A revisão inteira detecta o defeito quando algum apontamento detecta. */
export function revisaoDetectaDefeito(
  revisao: RevisaoComSeveridade,
  mutante: Mutante,
  marcador?: MarcadorLocalizado,
): boolean {
  return revisao.apontamentos.some((apontamento) => apontamentoDetectaDefeito(apontamento, mutante, marcador));
}

/** Os campos do desafio onde um marcador de mutação pode viver (por ordem). */
const CAMPOS_DE_CODIGO: readonly (keyof Desafio)[] = [
  'solutionCode',
  'testsCode',
  'statement',
  'starterCode',
];

/**
 * Localiza o marcador do mutante no artefato MUTADO — a régua do confronto
 * (MEDIUM-1). Procura o marcador nos campos de código do desafio mutado
 * (nesta ordem, a mesma em que os mutantes o injetam) e devolve o span em
 * caracteres DO CAMPO onde foi encontrado; mutante sem marcador → `undefined`
 * (detecção por categoria); marcador não encontrado em nenhum campo → span
 * `null` (a detecção cai para a menção no trecho citado). Quem consumir o
 * span PRECISA estar no mesmo espaço de coordenadas (revisores fake de teste
 * que apontam o marcador resolvem o span com a MESMA busca, campo a campo).
 * O parâmetro aceita só `marcador` (tipagem estrutural) — os testes usam
 * `{ marcador }` sem montar um `Mutante` inteiro.
 */
export function localizarMarcadorNoMutado(
  mutante: Pick<Mutante, 'marcador'>,
  mutado: DesafioParaMutacao,
): MarcadorLocalizado | undefined {
  const textoDoMarcador = (mutante.marcador ?? '').trim();
  if (textoDoMarcador === '') return undefined;
  for (const campo of CAMPOS_DE_CODIGO) {
    const conteudo = mutado.desafio[campo];
    if (typeof conteudo !== 'string') continue;
    const indice = conteudo.indexOf(textoDoMarcador);
    if (indice >= 0) {
      return { texto: textoDoMarcador, span: [indice, indice + textoDoMarcador.length] };
    }
  }
  return { texto: textoDoMarcador, span: null };
}
