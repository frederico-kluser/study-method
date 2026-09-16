/**
 * app/electron/main/engine/quality/minimalRust.ts — o SINTETIZADOR
 * DETERMINÍSTICO de solução mínima de RUST (zero LLM).
 *
 * É o arquivo que o cabeçalho de `quality/minimal.ts` mandou escrever para
 * cada linguagem — o terceiro da fila, depois de `minimal.ts` (JavaScript) e
 * `minimalPython.ts`. Mesma PERGUNTA ("qual é o menor código que o teste
 * aceita?"), mesma disciplina FAIL-CLOSED, mesma ordem de minimalidade — e
 * nenhuma linha que não compile em Rust gerada.
 *
 * ─── POR QUE RUST É OUTRO ARQUIVO (e onde ele é MAIS simples) ──────────────
 *
 * Python precisou de duas formas de teste (`stdout` × `import`) porque a
 * trilha roda o arquivo do aluno de cima a baixo. Rust NÃO TEM a forma
 * `stdout`: o aluno escreve uma CRATE (`src/lib.rs`), e o teste de integração
 * (`tests/desafio.rs`) importa dela — `use desafio::dobro;`. A forma é
 * sempre `import`, e isso simplifica: não existe captura de stdout para
 * sintetizar (um `println!` no lib.rs do aluno não é a saída do teste).
 *
 * E há uma diferença que trabalha a NOSSO favor: em Rust a ASSINATURA é
 * obrigatória e o starter a traz completa (`pub fn soma(a: i32, b: i32) ->
 * i32`). O candidato mínimo não precisa INFERIR tipos — é a assinatura do
 * starter com o CORPO trocado pelo literal esperado:
 *
 *     pub fn soma(a: i32, b: i32) -> i32 { 5 }
 *
 * (em Python o análogo era `def soma(a, b): return 5` — sem tipos para
 * preservar). Quando a função-alvo NÃO está no starter, aí sim um tipo é
 * inferido do literal do assert — e SÓ para literais escalares; o que não é
 * escalar não gera candidato (a referência de referência fecha).
 *
 * ─── A ORDEM DE MINIMALIDADE, E A SOLUÇÃO DE REFERÊNCIA POR ÚLTIMO ─────────
 *
 *   1. ECO      — a assinatura com o corpo `parametro` (o teste devolve o
 *                 próprio argumento)
 *   2. LITERAL  — a assinatura com o corpo `<esperado>` (até 3 literais
 *                 distintos, na ordem do código do teste)
 *   3. SOLUÇÃO  — a solução de referência inteira, SEMPRE por último quando
 *                 a forma é reconhecida. É o conserto do defeito §3.1 item 2
 *                 de `docs/18-estado-da-fabricacao-dos-cursos.md` (medido no
 *                 Python e portado aqui SEM adaptação): um teste com ≥2
 *                 casos divergentes nunca é satisfeito por literal — `pub fn
 *                 dobro(x: i32) -> i32 { 4 }` falha no caso que espera −6 —
 *                 e, sem a referência, TODO desafio que exige computação de
 *                 verdade saía `SEM_SOLUCAO_ACESSIVEL`, reprovando o
 *                 `coverage` (fail-closed) da fase inteira. O literal
 *                 continua ANTES na ordem de minimalidade: teste fraco (um
 *                 caso só) ainda acha o literal como mínimo e expõe o
 *                 EXCESSO; teste que exige computação acha a referência —
 *                 nada menor passa. Numa forma DESCONHECIDA a referência
 *                 NÃO entra: ela viraria um "mínimo" que na verdade é o
 *                 máximo (ver `minimalPython.ts:498-510`).
 *
 * ─── FAIL-CLOSED (docs/16 §9.3, o mesmo do irmão de Python) ───────────────
 *   - teste que não parseia como Rust      → `PARSE_FALHOU` (linha/coluna)
 *   - prover com falha de INFRA em TODAS   → `PROVER_FALHOU`
 *   - nenhum candidato passa / nenhum gerado → `SEM_SOLUCAO_ACESSIVEL`
 */

import type { AtomKey } from '../atomKeys';
import { extractAtoms } from '../extract';
import type { ChallengeProofsVerdict } from '../exec/proofs';
import { RS_ENTRY_PATH, RS_TEST_PATH } from '../lang/rust';
import { getAdapter, type LangNode } from '../lang/registry';
import type { ProverDeDesafio } from '../phases/f9Verifier';
import { contarLinhas, type MinimalCtx, type MinimalVerdict } from './minimal';

/** O id do adaptador que este módulo — e só ele — sintetiza. */
export const MINIMAL_RUST_LANGUAGE = 'rust' as const;

/** O crate que o teste importa quando o desafio é da forma `import`. */
export const CRATE_DA_SOLUCAO = 'desafio';

// ---------------------------------------------------------------------------
// Leitura do teste (AST do adaptador Rust — subprocesso node + WASM)
// ---------------------------------------------------------------------------

/** Um assert lido do teste de Rust. */
export interface AssertRust {
  /** nome da macro (`assert_eq!`, `assert_ne!`, `assert!`). */
  assert: string;
  /** nome da função chamada no primeiro argumento (`dobro`) ou null. */
  funcao: string | null;
  /** TEXTO-FONTE do primeiro argumento (`dobro(2)`), ou null. */
  alvo: string | null;
  /** texto-fonte dos argumentos INTERNOs da chamada (`2`, `x, -3`). */
  argumentosDaChamada: string | null;
  /** texto-fonte do literal esperado (`4`), ou null quando não é o 2º arg. */
  esperado: string | null;
  /** texto cru do assert (descrição determinística, no máximo 120 chars). */
  trecho: string;
}

/** A forma do teste — decide QUAIS candidatos fazem sentido. */
export type FormaDoTesteRust = 'import' | 'desconhecida';

export interface LiteraisDoTesteRust {
  forma: FormaDoTesteRust;
  /** funções importadas de `desafio` (forma `import`); vazio na desconhecida. */
  funcoesAlvo: string[];
  asserts: AssertRust[];
}

export type ExtrairLiteraisRustResult =
  | { ok: true; dados: LiteraisDoTesteRust }
  | { ok: false; error: string };

function caminhar(node: LangNode, fn: (n: LangNode) => void): void {
  fn(node);
  for (const filho of node.children) caminhar(filho, fn);
}

/**
 * Os ARGUMENTOS top-level de uma macro, como TEXTO-FONTE — a MESMA leitura de
 * `requirements.ts`: o extrator emite um nó sintético `MacroArg` por
 * argumento top-level (`extract_ast.mjs`, ramo `macro_invocation`), então
 * aqui é só leitura.
 */
function argumentosDoMacro(macro: LangNode): string[] {
  return macro.children
    .filter((c) => c.type === 'MacroArg' && c.synthetic)
    .map((c) => c.attributes.argText ?? '')
    .filter((t) => t !== '');
}

/** `dobro(2)` → `{ funcao: 'dobro', argumentosInternos: '2' }`. */
function partirChamada(alvo: string): { funcao: string; argumentosInternos: string } | null {
  const m = /^([a-zA-Z_][A-Za-z0-9_]*(?:::[a-zA-Z_][A-Za-z0-9_]*)?)\s*\((.*)\)\s*$/.exec(alvo.trim());
  if (m === null) return null;
  const partes = m[1].split('::');
  return { funcao: partes[partes.length - 1], argumentosInternos: m[2].trim() };
}

/**
 * Lê os asserts e a FORMA de um arquivo de teste de Rust.
 * Determinístico: mesma entrada, mesma saída. Parse falhou ⇒ `{ok:false}`.
 */
export function extrairLiteraisDoTesteRust(testsCode: string): ExtrairLiteraisRustResult {
  const adapter = getAdapter(MINIMAL_RUST_LANGUAGE);
  const parsed = adapter.parse(testsCode, { fileName: RS_TEST_PATH });
  if (!parsed.ok) {
    return {
      ok: false,
      error:
        'testsCode não parseia como Rust (' +
        parsed.error.code + ' em ' + parsed.error.line + ':' + parsed.error.column + '): ' +
        parsed.error.message,
    };
  }

  const funcoesAlvo = new Set<string>();
  const asserts: AssertRust[] = [];

  caminhar(parsed.root, (node) => {
    // `use desafio::a, b;` — as funções-alvo da forma `import`.
    if (node.type === 'UseDeclaration' && node.attributes.useRoot === CRATE_DA_SOLUCAO) {
      for (const nome of (node.attributes.imports ?? '').split(',')) {
        if (nome !== '' && nome !== 'self') funcoesAlvo.add(nome);
      }
    }
    if (node.type !== 'MacroInvocation') return;
    const nome = `${node.attributes.name ?? ''}!`;
    if (nome !== 'assert_eq!' && nome !== 'assert_ne!' && nome !== 'assert!') return;
    const argumentos = argumentosDoMacro(node);
    let funcao: string | null = null;
    let alvo: string | null = null;
    let argumentosDaChamada: string | null = null;
    if (argumentos.length > 0) {
      alvo = argumentos[0];
      const chamada = partirChamada(alvo);
      if (chamada !== null) {
        funcao = chamada.funcao;
        argumentosDaChamada = chamada.argumentosInternos;
      }
    }
    asserts.push({
      assert: nome,
      funcao,
      alvo,
      argumentosDaChamada,
      esperado: argumentos.length >= 2 ? argumentos[1] : null,
      trecho: node.text.slice(0, 120),
    });
  });

  const forma: FormaDoTesteRust = funcoesAlvo.size > 0 ? 'import' : 'desconhecida';
  return { ok: true, dados: { forma, funcoesAlvo: [...funcoesAlvo].sort(), asserts } };
}

// ---------------------------------------------------------------------------
// A assinatura no starter (o que torna o candidato literal trivial)
// ---------------------------------------------------------------------------

/** Uma função-alvo localizada no starter de Rust. */
export interface FuncaoNoStarterRs {
  nome: string;
  /** o TEXTO da declaração inteira (`pub fn soma(a: i32, b: i32) -> i32 { … }`). */
  texto: string;
  /** offset do CORPO (o `block`) dentro do texto da declaração. */
  corpoStart: number;
  /** offset absoluto da declaração no starter (ordem determinística). */
  start: number;
}

/** Localiza as funções-alvo no starter (`fn nome(…) { … }`, com ou sem pub). */
export function localizarFuncoesNoStarterRs(
  starter: string,
  alvos: readonly string[],
): FuncaoNoStarterRs[] {
  const adapter = getAdapter(MINIMAL_RUST_LANGUAGE);
  const parsed = adapter.parse(starter, { fileName: RS_ENTRY_PATH });
  if (!parsed.ok) return [];
  const querido = new Set(alvos);
  const out: FuncaoNoStarterRs[] = [];
  caminhar(parsed.root, (node) => {
    if (node.type !== 'FunctionItem') return;
    const nome = node.attributes.name;
    if (nome === undefined || !querido.has(nome)) return;
    const corpo = [...node.children].reverse().find((c) => c.type === 'Block');
    if (corpo === undefined) return;
    out.push({
      nome,
      texto: node.text,
      corpoStart: corpo.start - node.start,
      start: node.start,
    });
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}

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

/** Os parâmetros de uma chamada, como lista de textos (`x, -3` → ['x','-3']). */
function partirArgumentos(internos: string): string[] {
  if (internos.trim() === '') return [];
  // Rust simples de trilha: vírgulas aninhadas só dentro de `f(…)`/`[…]` —
  // divide por vírgula de profundidade zero (parênteses/colchetes contados).
  const out: string[] = [];
  let profundidade = 0;
  let atual = '';
  for (const ch of internos) {
    if (ch === '(' || ch === '[' || ch === '<') profundidade += 1;
    else if (ch === ')' || ch === ']' || ch === '>') profundidade -= 1;
    if (ch === ',' && profundidade === 0) {
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

// ---------------------------------------------------------------------------
// Geração de candidatos (pura, ordenada por minimalidade)
// ---------------------------------------------------------------------------

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
    // A função-alvo é a MAIS referenciada pelos asserts de comparação; empate
    // decide pela ordem de aparição no starter. Sem função no starter, a
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
    const nome = alvo?.nome ?? dados.funcoesAlvo[0];
    const comparacoes = dados.asserts.filter(
      (a) => a.funcao === nome && a.esperado !== null,
    );
    if (nome !== undefined) {
      // 1. ECO — o teste devolve o próprio argumento.
      const eco = comparacoes.some(
        (a) =>
          a.argumentosDaChamada !== null &&
          partirArgumentos(a.argumentosDaChamada).length >= 1 &&
          partirArgumentos(a.argumentosDaChamada)[0] === a.esperado,
      );
      if (eco) {
        if (alvo !== undefined) {
          const param = primeiroParametroDaAssinatura(alvo);
          if (param !== null) adicionar(candidatoComCorpo(alvo, param));
        } else {
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
      }
      // 2. LITERAL — até 3 literais distintos, na ordem do código do teste.
      const vistos = new Set<string>();
      for (const a of comparacoes) {
        if (a.esperado === null || vistos.has(a.esperado)) continue;
        vistos.add(a.esperado);
        if (alvo !== undefined) {
          adicionar(candidatoComCorpo(alvo, a.esperado));
        } else {
          // Sem starter: a assinatura é inferida dos ARGUMENTOS do assert —
          // só com literais escalares (o que não é escalar não gera nada).
          const argumentos =
            a.argumentosDaChamada !== null ? partirArgumentos(a.argumentosDaChamada) : [];
          const tipos = argumentos.map((arg) => tipoDeLiteralRust(arg));
          if (argumentos.length > 0 && tipos.every((t) => t !== null)) {
            const retorno = tipoDeLiteralRust(a.esperado);
            if (retorno !== null) {
              const params = argumentos
                .map((arg, i) => `p${i}: ${tipos[i]}`)
                .join(', ');
              adicionar(
                `pub fn ${nome}(${params}) -> ${retorno} {\n    ${a.esperado}\n}\n`,
              );
            }
          }
        }
        if (vistos.size >= 3) break;
      }
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

// ---------------------------------------------------------------------------
// Síntese contra o prover REAL (fail-closed)
// ---------------------------------------------------------------------------

/**
 * O conteúdo do STUB VAZIO de um desafio de Rust: o ARQUIVO VAZIO.
 *
 * O default de `exec/proofs.ts` (`EMPTY_STUB_CODE`) é `export {};`, que é
 * JavaScript. O stub certo em Rust é o `src/lib.rs` vazio: crate válida que
 * compila, e o `use desafio::dobro;` do teste falha com `error[E0432]` —
 * exit 101, a prova 4 reprova por AUSÊNCIA de solução (medido), não por erro
 * de sintaxe estranho.
 */
export const RS_EMPTY_STUB_CODE = '';

/** Motivo escrito quando a forma do teste não é nenhuma das reconhecidas. */
function motivoDeFormaDesconhecida(dados: LiteraisDoTesteRust): string {
  return (
    'forma de teste de Rust não reconhecida: o teste não importa do crate do aluno ' +
    `\`${CRATE_DA_SOLUCAO}\` (use ${CRATE_DA_SOLUCAO}::…; forma import) — ` +
    dados.asserts.length + ' assert(s) lidos'
  );
}

/**
 * Sintetiza o código mínimo de Rust que passa no teste. Roda cada candidato
 * pelo prover REAL (injetado — o spawn do cargo sob o semáforo da engine) e
 * devolve o PRIMEIRO que passa nas provas. FAIL-CLOSED em todos os caminhos.
 */
export async function sintetizarCodigoMinimoRust(
  prover: ProverDeDesafio,
  ctx: MinimalCtx,
): Promise<MinimalVerdict> {
  const extraido = extrairLiteraisDoTesteRust(ctx.testsCode);
  if (!extraido.ok) {
    return { ok: false, reason: 'PARSE_FALHOU', detail: extraido.error };
  }
  const dados = extraido.dados;
  const candidatos = gerarCandidatosRust(ctx.starterCode, ctx.solutionCode, dados);
  if (candidatos.length === 0) {
    return {
      ok: false,
      reason: 'SEM_SOLUCAO_ACESSIVEL',
      detail:
        dados.forma === 'desconhecida'
          ? motivoDeFormaDesconhecida(dados)
          : 'nenhum candidato mínimo gerado a partir do starter e dos literais do teste',
    };
  }

  let tentativas = 0;
  let falhasDeInfra = 0;
  const motivos: string[] = [];
  for (const candidato of candidatos) {
    tentativas += 1;
    let veredito: ChallengeProofsVerdict;
    try {
      veredito = await prover({
        starterCode: ctx.starterCode,
        solutionCode: candidato,
        testsCode: ctx.testsCode,
        expectedTestCount: ctx.expectedTestCount,
        language: MINIMAL_RUST_LANGUAGE,
        emptyStubCode: RS_EMPTY_STUB_CODE,
      });
    } catch (err) {
      falhasDeInfra += 1;
      motivos.push(err instanceof Error ? err.message : String(err));
      continue;
    }
    if (veredito.execError !== undefined) {
      falhasDeInfra += 1;
      motivos.push(veredito.execError);
      continue;
    }
    if (veredito.valid) {
      const extraidoAtoms = extractAtoms(candidato, {
        fileName: RS_ENTRY_PATH,
        language: MINIMAL_RUST_LANGUAGE,
      });
      const atoms: AtomKey[] = extraidoAtoms.ok ? extraidoAtoms.keys : [];
      return {
        ok: true,
        minimalCode: candidato,
        atoms,
        // ENRIQUECIMENTO VAZIO, E DECLARADO (o mesmo do irmão de Python): em
        // Rust os átomos do teste são o harness (`use`, `#[test]`,
        // `assert_eq!`) — nunca o que o desafio cobra do aluno.
        atomsDoTeste: [],
        lines: contarLinhas(candidato),
        proofsValid: true,
      };
    }
    motivos.push(veredito.failures.map((f) => f.reason ?? f.proof).join('; '));
  }

  if (tentativas > 0 && falhasDeInfra === tentativas) {
    return {
      ok: false,
      reason: 'PROVER_FALHOU',
      detail:
        'todas as ' + tentativas + ' tentativa(s) falharam por falha de infraestrutura do ' +
        'prover: ' + motivos.join(' | '),
    };
  }
  return {
    ok: false,
    reason: 'SEM_SOLUCAO_ACESSIVEL',
    detail:
      'nenhum dos ' + tentativas + ' candidato(s) passou nas provas — o teste exige mais que ' +
      'literais ou está quebrado: ' + motivos.join(' | '),
  };
}
