/**
 * app/electron/main/engine/quality/minimalPythonCandidatos.ts — a GERAÇÃO dos
 * candidatos de solução mínima de Python, pura e ordenada por minimalidade
 * (print → print end="" → eco → literal → referência por último, com dedupe).
 *
 * A prosa normativa (a ordem e o porquê de cada estágio) vive na fachada
 * `minimalPython.ts`. Refatoração L04: arquivo ≤500 linhas e toda função com
 * CC≤8, sem mudança de comportamento observável.
 */

import {
  ASSERTS_DE_COMPARACAO_PY,
  type AssertPython,
  type LiteraisDoTestePython,
} from './minimalPythonTipos';
import { localizarFuncoesNoStarterPy } from './minimalPythonLeitura';
import { literalPythonDeString } from './minimalPythonLiterais';

/**
 * O programa mínimo que imprime EXATAMENTE `saida`.
 *
 * Duas formas, nesta ordem de minimalidade:
 *   1. `print("...")` — quando a saída termina em quebra de linha (o `print`
 *      já a acrescenta). É o caso dos 21 desafios da trilha real.
 *   2. `print("...", end="")` — quando não termina; custa um argumento
 *      NOMEADO a mais, e por isso nunca vem antes de (1).
 * Saída VAZIA é caso à parte: o programa mínimo é o arquivo vazio.
 */
export function candidatosDeImpressao(saida: string): string[] {
  if (saida === '') return [''];
  const out: string[] = [];
  if (saida.endsWith('\n')) {
    out.push('print(' + literalPythonDeString(saida.slice(0, -1)) + ')\n');
  }
  out.push('print(' + literalPythonDeString(saida) + ', end="")\n');
  return out;
}

/** forma `stdout`: imprime o esperado de cada assert de comparação (≤3 saídas). */
function candidatosStdoutPy(dados: LiteraisDoTestePython, adicionar: (c: string) => void): void {
  const vistos = new Set<string>();
  for (const a of dados.asserts) {
    if (!ASSERTS_DE_COMPARACAO_PY.has(a.assert)) continue;
    if (a.esperadoTexto === null || vistos.has(a.esperadoTexto)) continue;
    vistos.add(a.esperadoTexto);
    for (const c of candidatosDeImpressao(a.esperadoTexto)) adicionar(c);
    if (vistos.size >= 3) break;
  }
}

/** A função-alvo é a MAIS referenciada pelos asserts de comparação. */
function escolherAlvoPy(
  funcoes: readonly { nome: string; params: string[] }[],
  dados: LiteraisDoTestePython,
): { nome: string | undefined; params: string[] } {
  // Empate decide pela ordem de aparição no starter. Sem função no starter, a
  // primeira função-alvo importada pelo teste (sem parâmetros conhecidos).
  let nome: string | undefined = dados.funcoesAlvo[0];
  let params: string[] = [];
  let melhor = -1;
  for (const f of funcoes) {
    const refs = dados.asserts.filter(
      (a) => a.funcao === f.nome && ASSERTS_DE_COMPARACAO_PY.has(a.assert),
    ).length;
    if (refs > melhor) {
      melhor = refs;
      nome = f.nome;
      params = f.params;
    }
  }
  return { nome, params };
}

/** 3. ECO — `def f(x): return x` (o teste devolve o próprio argumento). */
function candidatoEcoPy(
  alvo: string,
  params: readonly string[],
  comparacoes: readonly AssertPython[],
  adicionar: (c: string) => void,
): void {
  const eco = comparacoes.some(
    (a) => a.argumentos.length >= 1 && a.argumentos[0] !== null && a.argumentos[0] === a.esperado,
  );
  if (eco && params.length === 1) {
    adicionar('def ' + alvo + '(' + params[0] + '):\n    return ' + params[0] + '\n');
  }
}

/** 4. LITERAL — `def f(...): return <literal>`, até 3 literais distintos. */
function candidatosLiteraisPy(
  alvo: string,
  assinatura: string,
  comparacoes: readonly AssertPython[],
  adicionar: (c: string) => void,
): void {
  const vistos = new Set<string>();
  for (const a of comparacoes) {
    if (a.esperado === null || vistos.has(a.esperado)) continue;
    vistos.add(a.esperado);
    adicionar('def ' + alvo + '(' + assinatura + '):\n    return ' + a.esperado + '\n');
    if (vistos.size >= 3) break;
  }
}

/** A forma `import`: eco e depois literais, sobre a função-alvo escolhida. */
function candidatosImportPy(
  starter: string,
  dados: LiteraisDoTestePython,
  adicionar: (c: string) => void,
): void {
  const funcoes = localizarFuncoesNoStarterPy(starter, dados.funcoesAlvo);
  const { nome, params } = escolherAlvoPy(funcoes, dados);
  if (nome === undefined) return;
  const alvo = nome;
  const comparacoes = dados.asserts.filter(
    (a) => a.funcao === alvo && ASSERTS_DE_COMPARACAO_PY.has(a.assert) && a.esperado !== null,
  );
  candidatoEcoPy(alvo, params, comparacoes, adicionar);
  candidatosLiteraisPy(alvo, params.join(', '), comparacoes, adicionar);
}

/**
 * Gera os candidatos de solução mínima, na ordem de minimalidade (o primeiro
 * que passar nas provas vence). PURO: mesma entrada, mesma saída.
 *
 *   forma `stdout`:
 *     1. IMPRESSÃO   — `print(<literal>)` do que o teste espera na tela
 *     2. IMPRESSÃO+  — `print(<literal>, end="")` (quando (1) não serve)
 *   forma `import`:
 *     3. ECO         — `def f(x): return x` (o teste devolve o argumento)
 *     4. LITERAL     — `def f(...): return <literal>` (até 3 literais)
 *   sempre, por último, quando a forma é reconhecida:
 *     5. SOLUÇÃO     — a solução de referência inteira. ONDA 4 (medida): a
 *                      fase VALOR com ≥2 casos distintos nunca é satisfeita
 *                      por literal — `def f(x): return 4` falha no caso que
 *                      espera 10 — e sem a referência TODO desafio que exige
 *                      computação saía `SEM_SOLUCAO_ACESSIVEL`, reprovando o
 *                      `coverage` (fail-closed) da fase que `docs/17`
 *                      prescreve. O literal continua ANTES na ordem de
 *                      minimalidade: teste fraco (um caso só) ainda acha o
 *                      literal como mínimo e expõe o EXCESSO; teste que exige
 *                      computação acha a referência — nada menor passa. Com a
 *                      referência no fim, `SEM_SOLUCAO` passa a significar
 *                      "nem a referência passa" (teste quebrado).
 */
export function gerarCandidatosPython(
  starter: string,
  solution: string,
  dados: LiteraisDoTestePython,
): string[] {
  const candidatos: string[] = [];
  const adicionar = (c: string | null | undefined): void => {
    if (c === null || c === undefined) return;
    if (!candidatos.includes(c)) candidatos.push(c);
  };

  if (dados.forma === 'stdout') {
    candidatosStdoutPy(dados, adicionar);
  } else if (dados.forma === 'import') {
    candidatosImportPy(starter, dados, adicionar);
  }

  // 5. último recurso — a solução de referência, SEMPRE como o ÚLTIMO
  // candidato quando a forma é reconhecida (ver o cabeçalho). Numa forma
  // DESCONHECIDA a referência NÃO entra: ela seria aceita pelas provas e
  // viraria um "mínimo" que na verdade é o máximo, inflando os atoms e podendo
  // inventar LACUNA onde não há.
  if (dados.forma !== 'desconhecida' && solution.trim() !== '') {
    adicionar(solution);
  }

  return candidatos.slice(0, 8);
}
