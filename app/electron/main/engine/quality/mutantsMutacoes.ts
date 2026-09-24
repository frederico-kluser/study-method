/**
 * app/electron/main/engine/quality/mutantsMutacoes.ts — as QUATRO mutações
 * puras do gerador (P-20): UMA função por classe de defeito, UM defeito por
 * mutante.
 *
 * A prosa normativa vive na fachada `mutants.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { type DesafioParaMutacao } from './mutantsTipos';
import { somenteDesafio } from './mutantsSuporte';

/**
 * Candidatos de construção FORA do orçamento (classe a). O gerador escolhe o
 * primeiro cuja chave NÃO esteja em `requires` — se todos já estiverem
 * permitidos, a classe (a) não existe para esta base (erro, nunca mutante
 * vazio). A chave proibida é o `marcador` da mutação.
 */
export const FORA_DO_ORCAMENTO_CANDIDATOS: readonly { chave: string; snippet: string }[] = [
  { chave: 'api:Number.isFinite', snippet: 'return Number.isFinite(v);' },
  { chave: 'api:Array.isArray', snippet: 'return Array.isArray(v);' },
  { chave: 'node:WhileStatement', snippet: 'while (v > 0) { v -= 1; }' },
];

/**
 * (a) — a `solutionCode` passa a usar uma construção FORA de `requires`:
 * construção usada sem ter sido ensinada (orçamento da aula violado).
 */
export function mutarConstrucaoForaDoOrcamento(base: DesafioParaMutacao): DesafioParaMutacao {
  const candidato = FORA_DO_ORCAMENTO_CANDIDATOS.find((c) => !base.desafio.requires.includes(c.chave));
  if (candidato === undefined) {
    throw new Error(
      'mutants: toda construção candidata de "fora do orçamento" já está em `requires` desta base — a classe (a) não pode ser gerada',
    );
  }
  const solutionCode = `${base.desafio.solutionCode.trimEnd()}\nexport function auxiliar(v) {\n  ${candidato.snippet}\n}\n`;
  return somenteDesafio(base, { ...base.desafio, solutionCode });
}

/**
 * (b) — o `testsCode` passa a asserir o OPOSTO do enunciado: o teste do
 * número PAR espera `false`. Só o teste toca o assert divergente; o restante
 * (inclusive o teste do ímpar) segue o enunciado — um defeito só.
 */
export function mutarTesteDivergenteDoEnunciado(base: DesafioParaMutacao): DesafioParaMutacao {
  const assertPar = 'assert.equal(ehPar(4), true);';
  const assertMutado = 'assert.equal(ehPar(4), false);';
  const testsCode = base.desafio.testsCode.replace(assertPar, assertMutado);
  if (testsCode === base.desafio.testsCode || !testsCode.includes(assertMutado)) {
    throw new Error(
      'mutants: a mutação (b) não encontrou a asserção de paridade esperada — a fixture mudou sem o gerador acompanhar',
    );
  }
  return somenteDesafio(base, { ...base.desafio, testsCode });
}

/**
 * Os ÁTOMOS que o canal de impressão (classe c) introduz na solução mutada:
 * `global:console` (a raiz global), `api:console.log` (o membro acessado) e
 * `node:ExpressionStatement` (o `console.log(...)` vira uma expression
 * statement em vez de um `return`). São o ORÇAMENTO do mutante (c) —
 * declarados aqui no gerador, SOMADOS ao `requires` da base no artefato
 * mutado por `mutarImpressaoEmVezDeRetorno` (fail-closed: o validador da
 * classe (c) exige `chavesDaSolução ⊆ requires do mutante`, então um mutante
 * (c) cujo canal não esteja no orçamento é REJEITADO — nunca um (c) com o
 * defeito duplo (a)+(c)). A fixture NÃO usa console em nenhuma solução
 * (verificado por parser em teste), então estes átomos nunca entram no
 * `requires` da BASE: o único mutante que os declara é o (c).
 */
export const ATOMS_DO_CANAL_DE_IMPRESSAO: readonly string[] = [
  'global:console',
  'api:console.log',
  'node:ExpressionStatement',
];

/**
 * (c) — a solução PASSA a imprimir no console em vez de retornar (o modo de
 * falha nº 1 medido, §10), o `outputChannel` declarado vai para `impressao`
 * — os testes esperam o valor de retorno e recebem `undefined` — e o
 * ORÇAMENTO do mutante cresce com os átomos do canal
 * (`ATOMS_DO_CANAL_DE_IMPRESSAO`): o console usado aqui é construção ENSINADA
 * no escopo do mutante, o defeito UNO da classe é imprimir em vez de retornar
 * (nunca "usar console sem ter sido ensinado" — isso seria o defeito da
 * classe (a). O `notRequired` da base fica intocado: `notRequired` é o escopo
 * declarado, não o orçamento; o orçamento é `requires`, que o mutante (c)
 * declara com o canal).
 */
export function mutarImpressaoEmVezDeRetorno(base: DesafioParaMutacao): DesafioParaMutacao {
  const solutionCode = 'export function ehPar(n) {\n  console.log(n % 2 === 0);\n}\n';
  const requires = [...new Set([...base.desafio.requires, ...ATOMS_DO_CANAL_DE_IMPRESSAO])];
  return somenteDesafio(base, { ...base.desafio, solutionCode, outputChannel: 'impressao', requires });
}

/**
 * (d) — a solução NÃO usa a construção nova da aula (`introducesProductive`):
 * uma solução correta de paridade com divisão/multiplicação (`Math.round`),
 * construções de PRÉ-REQUISITO já em `requires`. O defeito é UNO: a solução
 * resolve o desafio sem exercitar a aula (A6/C5) e sem vazar do orçamento.
 */
export function mutarNaoExercitaAAula(base: DesafioParaMutacao): DesafioParaMutacao {
  const solutionCode = 'export function ehPar(n) {\n  return n / 2 === Math.round(n / 2);\n}\n';
  return somenteDesafio(base, { ...base.desafio, solutionCode });
}
