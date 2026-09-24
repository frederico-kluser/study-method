/**
 * app/electron/main/engine/quality/minimalRustCandidatos.ts — a GERAÇÃO dos
 * candidatos de solução mínima de Rust, pura e ordenada por minimalidade
 * (ECO → LITERAL → SOLUÇÃO por último, com dedupe).
 *
 * A prosa normativa (a ordem e o porquê da referência por último) vive na
 * fachada `minimalRust.ts`. Refatoração L04: arquivo ≤500 linhas e toda função
 * com CC≤8, sem mudança de comportamento observável.
 */

import {
  type AssertRust,
  type FuncaoNoStarterRs,
  type LiteraisDoTesteRust,
} from './minimalRustTipos';
import { localizarFuncoesNoStarterRs } from './minimalRustLeitura';

/**
 * A assinatura do starter com o CORPO trocado — o candidato mínimo de Rust.
 * Preserva `pub`, parâmetros, tipos e retorno EXATAMENTE como o starter os
 * declara (é a assinatura que o teste exige; trocar o corpo não a toca).
 */
export function candidatoComCorpo(funcao: FuncaoNoStarterRs, corpo: string): string {
  return `${funcao.texto.slice(0, funcao.corpoStart)}{\n    ${corpo}\n}\n`;
}

/**
 * O tipo Rust de um literal ESCALAR (`4` → `i32`, `"oi"` → `&str`) — usado
 * SÓ quando a função-alvo não está no starter e a assinatura tem de ser
 * inventada. O que não é escalar devolve `null` (não gera candidato — nunca
 * inventa um tipo).
 */
export function tipoDeLiteralRust(texto: string): string | null {
  const t = texto.trim();
  if (/^-?\d+$/.test(t)) return 'i32';
  if (/^-?\d+\.\d+$/.test(t)) return 'f64';
  if (t === 'true' || t === 'false') return 'bool';
  if (/^'([^'\\]|\\.)'$/.test(t)) return 'char';
  if (/^"([^"\\]|\\.)*"$/.test(t)) return '&str';
  return null;
}

type ClasseDeChar = 'abre' | 'fecha' | 'virgula' | 'outro';

/** A classe de um caractere para a divisão de argumentos por vírgula de profundidade zero. */
function classeDoChar(ch: string): ClasseDeChar {
  if (ch === '(' || ch === '[' || ch === '<') return 'abre';
  if (ch === ')' || ch === ']' || ch === '>') return 'fecha';
  if (ch === ',') return 'virgula';
  return 'outro';
}

/** Os parâmetros de uma chamada, como lista de textos (`x, -3` → ['x','-3']). */
function partirArgumentos(internos: string): string[] {
  if (internos.trim() === '') return [];
  // Rust simples de trilha: vírgulas aninhadas só dentro de `f(…)`/`[…]` —
  // divide por vírgula de profundidade zero (parênteses/colchetes contados).
  const out: string[] = [];
  let profundidade = 0;
  let atual = '';
  for (const ch of internos) {
    const classe = classeDoChar(ch);
    if (classe === 'abre') profundidade += 1;
    else if (classe === 'fecha') profundidade -= 1;
    if (classe === 'virgula' && profundidade === 0) {
      out.push(atual.trim());
      atual = '';
    } else {
      atual += ch;
    }
  }
  if (atual.trim() !== '') out.push(atual.trim());
  return out;
}

/** O nome do PRIMEIRO parâmetro de uma assinatura (`a` de `a: i32, b: i32`). */
function primeiroParametroDaAssinatura(funcao: FuncaoNoStarterRs): string | null {
  const m = /\(([^)]*)\)/.exec(funcao.texto);
  if (m === null) return null;
  const primeiro = m[1].split(',')[0]?.trim() ?? '';
  const nome = /^[&*]*\s*(?:mut\s+)?([a-zA-Z_][A-Za-z0-9_]*)/.exec(primeiro);
  return nome !== null ? nome[1] : null;
}

/** A função-alvo é a MAIS referenciada pelos asserts de comparação. */
function escolherAlvo(
  funcoes: readonly FuncaoNoStarterRs[],
  dados: LiteraisDoTesteRust,
): FuncaoNoStarterRs | undefined {
  // Empate decide pela ordem de aparição no starter. Sem função no starter, a
  // primeira função-alvo importada pelo teste (aí o tipo é inferido).
  let alvo: FuncaoNoStarterRs | undefined;
  let melhor = -1;
  for (const f of funcoes) {
    const refs = dados.asserts.filter((a) => a.funcao === f.nome && a.esperado !== null).length;
    if (refs > melhor) {
      melhor = refs;
      alvo = f;
    }
  }
  return alvo;
}

/** O teste devolve o próprio argumento (`assert_eq!(f(x), x)`)? */
function temEco(comparacoes: readonly AssertRust[]): boolean {
  return comparacoes.some(
    (a) =>
      a.argumentosDaChamada !== null &&
      partirArgumentos(a.argumentosDaChamada).length >= 1 &&
      partirArgumentos(a.argumentosDaChamada)[0] === a.esperado,
  );
}

/** ECO sem starter: a assinatura é inventada do literal do argumento (escalar só). */
function candidatoEcoSemStarter(
  nome: string,
  comparacoes: readonly AssertRust[],
  adicionar: (c: string | null | undefined) => void,
): void {
  const caso = comparacoes.find(
    (a) =>
      a.argumentosDaChamada !== null &&
      partirArgumentos(a.argumentosDaChamada)[0] === a.esperado,
  );
  if (caso !== undefined && caso.esperado !== null && caso.argumentosDaChamada !== null) {
    const arg = partirArgumentos(caso.argumentosDaChamada)[0];
    const tipo = tipoDeLiteralRust(arg);
    if (tipo !== null) {
      adicionar(`pub fn ${nome}(${arg.replace(/^-/, '')}: ${tipo}) -> ${tipo} {\n    ${arg.replace(/^-/, '')}\n}\n`);
    }
  }
}

/** 1. ECO — o corpo `parametro` (ou a versão inferida, sem starter). */
function candidatoEcoRust(
  alvo: FuncaoNoStarterRs | undefined,
  nome: string,
  comparacoes: readonly AssertRust[],
  adicionar: (c: string | null | undefined) => void,
): void {
  if (!temEco(comparacoes)) return;
  if (alvo !== undefined) {
    const param = primeiroParametroDaAssinatura(alvo);
    if (param !== null) adicionar(candidatoComCorpo(alvo, param));
    return;
  }
  candidatoEcoSemStarter(nome, comparacoes, adicionar);
}

/** LITERAL sem starter: a assinatura é inferida dos ARGUMENTOS (escalares só). */
function candidatoLiteralSemStarter(
  nome: string,
  a: AssertRust,
  esperado: string,
  adicionar: (c: string | null | undefined) => void,
): void {
  const argumentos = a.argumentosDaChamada !== null ? partirArgumentos(a.argumentosDaChamada) : [];
  const tipos = argumentos.map((arg) => tipoDeLiteralRust(arg));
  if (argumentos.length > 0 && tipos.every((t) => t !== null)) {
    const retorno = tipoDeLiteralRust(esperado);
    if (retorno !== null) {
      const params = argumentos
        .map((arg, i) => `p${i}: ${tipos[i]}`)
        .join(', ');
      adicionar(
        `pub fn ${nome}(${params}) -> ${retorno} {\n    ${esperado}\n}\n`,
      );
    }
  }
}

/** 2. LITERAL — até 3 literais distintos, na ordem do código do teste. */
function candidatosLiteraisRust(
  alvo: FuncaoNoStarterRs | undefined,
  nome: string,
  comparacoes: readonly AssertRust[],
  adicionar: (c: string | null | undefined) => void,
): void {
  const vistos = new Set<string>();
  for (const a of comparacoes) {
    if (a.esperado === null || vistos.has(a.esperado)) continue;
    vistos.add(a.esperado);
    if (alvo !== undefined) {
      adicionar(candidatoComCorpo(alvo, a.esperado));
    } else {
      candidatoLiteralSemStarter(nome, a, a.esperado, adicionar);
    }
    if (vistos.size >= 3) break;
  }
}

/**
 * Gera os candidatos de solução mínima, na ordem de minimalidade (o primeiro
 * que passar nas provas vence). PURO: mesma entrada, mesma saída.
 *
 *   forma `import`:
 *     1. ECO      — a assinatura com o corpo `<parametro>` (uma assinatura
 *                   de 1 parâmetro é preservada; sem starter, um tipo é
 *                   inferido do literal do argumento)
 *     2. LITERAL  — a assinatura com o corpo `<esperado>` (até 3 literais
 *                   distintos, na ordem do código do teste)
 *   sempre, por último, quando a forma é reconhecida:
 *     3. SOLUÇÃO  — a solução de referência inteira (o defeito §3.1 item 2 de
 *                   docs/18; ver o cabeçalho — o literal continua ANTES).
 */
export function gerarCandidatosRust(
  starter: string,
  solution: string,
  dados: LiteraisDoTesteRust,
): string[] {
  const candidatos: string[] = [];
  const adicionar = (c: string | null | undefined): void => {
    if (c === null || c === undefined) return;
    if (!candidatos.includes(c)) candidatos.push(c);
  };

  if (dados.forma === 'import') {
    const funcoes = localizarFuncoesNoStarterRs(starter, dados.funcoesAlvo);
    const alvo = escolherAlvo(funcoes, dados);
    const nome = alvo?.nome ?? dados.funcoesAlvo[0];
    const comparacoes = dados.asserts.filter(
      (a) => a.funcao === nome && a.esperado !== null,
    );
    if (nome !== undefined) {
      candidatoEcoRust(alvo, nome, comparacoes, adicionar);
      candidatosLiteraisRust(alvo, nome, comparacoes, adicionar);
    }
  }

  // 3. último recurso — a solução de referência, SEMPRE como o ÚLTIMO
  // candidato quando a forma é reconhecida (o defeito §3.1 item 2 de docs/18,
  // portado do `minimalPython.ts:498-513` sem adaptação). Numa forma
  // DESCONHECIDA a referência NÃO entra: ela seria aceita pelas provas e
  // viraria um "mínimo" que na verdade é o máximo.
  if (dados.forma !== 'desconhecida' && solution.trim() !== '') {
    adicionar(solution);
  }

  return candidatos.slice(0, 8);
}
