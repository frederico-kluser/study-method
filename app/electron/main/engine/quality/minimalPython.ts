/**
 * app/electron/main/engine/quality/minimalPython.ts — o SINTETIZADOR
 * DETERMINÍSTICO de solução mínima de PYTHON (zero LLM).
 *
 * É o arquivo que o cabeçalho de `quality/minimal.ts` mandou escrever:
 *
 *   "Um sintetizador de código mínimo de Python não é este arquivo com um
 *    parâmetro a mais — é outro arquivo, com `def`, indentação significativa e
 *    outra tabela de literais."
 *
 * Aqui está ele. Mesma PERGUNTA do irmão de JavaScript ("qual é o menor código
 * que o teste aceita?"), mesma disciplina FAIL-CLOSED, mesma ordem de
 * minimalidade — e nenhuma linha de JavaScript gerada.
 *
 * ─── POR QUE ELE EXISTIA COMO BURACO (o defeito MEDIDO) ────────────────────
 *
 * `npx tsx tools/track-engine/cli.ts coverage python` em `main@26dbc19`
 * imprimia `parse-falhou` nos 21 desafios da trilha real, com a mensagem
 * "testsCode não parseia como JavaScript" — porque a única trilha do produto é
 * Python e o sintetizador lia o teste com `ts.createSourceFile`. O placar
 * "0 lacunas" NÃO significava "nenhuma lacuna": significava "nada foi olhado".
 *
 * ─── AS DUAS FORMAS DE TESTE QUE ESTE MÓDULO RECONHECE ─────────────────────
 *
 * FORMA `stdout` (a que a trilha `python` usa nos 21 desafios). O teste roda o
 * arquivo do aluno do zero e compara TUDO o que ele imprimiu:
 *
 *     def rodar():
 *         saida = io.StringIO()
 *         with contextlib.redirect_stdout(saida):
 *             runpy.run_path("solucao.py")
 *         return saida.getvalue()
 *     ...
 *         self.assertEqual(rodar(), "oi\n")
 *
 *   O menor programa que passa nisso é UM `print` do literal esperado —
 *   `print("oi")` —, o análogo exato do `return <literal>` do lado JavaScript.
 *   Quando o esperado NÃO termina em quebra de linha, o candidato precisa do
 *   `end=""`, que é uma construção A MAIS: por isso ele vem DEPOIS na ordem de
 *   minimalidade, nunca no lugar do primeiro.
 *
 * FORMA `import` (a que a trilha ainda não tem, mas que `docs/17` promete a
 * partir da aula da virada em M4). O teste importa funções do módulo do aluno:
 *
 *     from solucao import somar
 *     ...
 *         self.assertEqual(somar(2, 3), 5)
 *
 *   Aqui o mínimo é `def somar(a, b): return 5` (literal) ou
 *   `def eco(x): return x` (eco), como no irmão de JavaScript.
 *
 * FORMA NÃO RECONHECIDA => `SEM_SOLUCAO_ACESSIVEL` com o motivo escrito. Nunca
 * um veredito de sucesso, nunca um `PARSE_FALHOU` mentiroso.
 *
 * ─── FAIL-CLOSED (docs/16 §9.3) ────────────────────────────────────────────
 *   - teste que não parseia como Python  -> `PARSE_FALHOU` (com linha/coluna)
 *   - prover com falha de INFRA em TODAS as tentativas -> `PROVER_FALHOU`
 *   - nenhum candidato passa / nenhum gerado -> `SEM_SOLUCAO_ACESSIVEL`
 *
 * ─── O QUE ELE NÃO FAZ ─────────────────────────────────────────────────────
 * Não gera PROGRAMA: gera LITERAL. Um teste cuja solução exige computação de
 * verdade (ler entrada, laço, estado) não tem candidato literal que passe — e
 * o veredito `SEM_SOLUCAO_ACESSIVEL` é o sinal correto, não uma falha.
 */

import type { AtomKey } from '../atomKeys';
import { extractAtoms } from '../extract';
import type { ChallengeProofsVerdict } from '../exec/proofs';
import { PY_ENTRY_PATH } from '../lang/python';
import { getAdapter, type LangNode } from '../lang/registry';
import type { ProverDeDesafio } from '../phases/f9Verifier';
import { contarLinhas, type MinimalCtx, type MinimalVerdict } from './minimal';

/** O id do adaptador que este módulo — e só ele — sintetiza. */
export const MINIMAL_PYTHON_LANGUAGE = 'python' as const;

/** O módulo que o teste importa quando o desafio é da forma `import`. */
export const MODULO_DA_SOLUCAO = PY_ENTRY_PATH.replace(/\.py$/, '');

// ---------------------------------------------------------------------------
// A tabela de asserts do unittest (o análogo de ASSERTS_DE_COMPARACAO)
// ---------------------------------------------------------------------------

/** Asserts do `unittest` que comparam um valor com um ESPERADO. */
export const ASSERTS_DE_COMPARACAO_PY: ReadonlySet<string> = new Set([
  'assertEqual',
  'assertEquals',
  'assertMultiLineEqual',
  'assertListEqual',
  'assertDictEqual',
  'assertTupleEqual',
  'assertSetEqual',
  'assertIs',
]);

/** Todo assert que este módulo sabe LER (os de comparação mais os unários). */
export const ASSERTS_PY: ReadonlySet<string> = new Set([
  ...ASSERTS_DE_COMPARACAO_PY,
  'assertTrue',
  'assertFalse',
  'assertIsNone',
  'assertRaises',
]);

// ---------------------------------------------------------------------------
// repr do Python -> valor (a "outra tabela de literais")
// ---------------------------------------------------------------------------

/**
 * Decodifica o `repr()` de uma STRING do Python para o valor.
 *
 * A entrada nunca é texto arbitrário: é o `attrs["value"]` que o extrator
 * (`vocab/py/extract_ast.py:622`) escreve com `repr(node.value)`, cuja
 * gramática é estreita — aspa simples (ou dupla quando a string contém aspa
 * simples e não contém aspa dupla) e os escapes de barra invertida da tabela
 * abaixo. Caractere não-ASCII imprimível o `repr` do Python 3 NÃO escapa —
 * vem literal.
 *
 * FAIL-CLOSED: qualquer coisa fora dessa gramática devolve `null` (inclusive
 * os escapes raros que a tabela não lista, como `\a` e `\N{...}`), e o
 * chamador simplesmente não gera aquele candidato — nunca inventa um valor.
 */
export function decodificarReprDeStringPython(repr: string): string | null {
  if (repr.length < 2) return null;
  const aspa = repr[0];
  if ((aspa !== "'" && aspa !== '"') || repr[repr.length - 1] !== aspa) return null;
  const corpo = repr.slice(1, -1);
  let out = '';
  let i = 0;
  while (i < corpo.length) {
    const c = corpo[i];
    if (c !== '\\') {
      // Aspa delimitadora NÃO escapada dentro do corpo: não é um repr válido.
      if (c === aspa) return null;
      out += c;
      i += 1;
      continue;
    }
    const p = corpo[i + 1];
    if (p === undefined) return null;
    switch (p) {
      case '\\': out += '\\'; i += 2; break;
      case 'n': out += '\n'; i += 2; break;
      case 'r': out += '\r'; i += 2; break;
      case 't': out += '\t'; i += 2; break;
      case 'b': out += '\b'; i += 2; break;
      case 'f': out += '\f'; i += 2; break;
      case 'v': out += '\v'; i += 2; break;
      case "'": out += "'"; i += 2; break;
      case '"': out += '"'; i += 2; break;
      case 'x':
      case 'u':
      case 'U': {
        const largura = p === 'x' ? 2 : p === 'u' ? 4 : 8;
        const hex = corpo.slice(i + 2, i + 2 + largura);
        if (hex.length !== largura || !/^[0-9a-fA-F]+$/.test(hex)) return null;
        const ponto = Number.parseInt(hex, 16);
        if (!Number.isFinite(ponto) || ponto > 0x10ffff) return null;
        out += String.fromCodePoint(ponto);
        i += 2 + largura;
        break;
      }
      default:
        return null;
    }
  }
  return out;
}

/**
 * Serializa uma string como LITERAL de Python — sempre com aspas duplas, o
 * mínimo de escapes e nenhuma dependência da grafia do teste.
 *
 * Determinístico por construção: o mesmo valor sempre produz o mesmo texto,
 * porque o código mínimo é comparado (por hash e por olho) entre execuções.
 */
export function literalPythonDeString(valor: string): string {
  let out = '"';
  for (const ch of valor) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (cp < 0x20 || cp === 0x7f) out += '\\x' + cp.toString(16).padStart(2, '0');
    else out += ch;
  }
  return out + '"';
}

// ---------------------------------------------------------------------------
// Leitura do teste (AST do adaptador Python — subprocesso `ast` + `symtable`)
// ---------------------------------------------------------------------------

/** Um assert lido do teste de Python. */
export interface AssertPython {
  /** nome do método do unittest (`assertEqual`, `assertTrue`, ...). */
  assert: string;
  /** nome da função chamada no primeiro argumento (`rodar`, `somar`) ou null. */
  funcao: string | null;
  /** TEXTO-FONTE do literal esperado (`"oi\n"`), ou null quando não é literal. */
  esperado: string | null;
  /** `repr()` do esperado quando literal — a fonte do valor decodificado. */
  esperadoRepr: string | null;
  /** valor decodificado quando o esperado é uma STRING literal; senão null. */
  esperadoTexto: string | null;
  /** texto-fonte de cada argumento da chamada (null quando não é literal). */
  argumentos: Array<string | null>;
  /** texto cru do assert (descrição determinística, no máximo 120 chars). */
  trecho: string;
}

/** A forma do teste — decide QUAIS candidatos fazem sentido. */
export type FormaDoTestePython = 'stdout' | 'import' | 'desconhecida';

export interface LiteraisDoTestePython {
  forma: FormaDoTestePython;
  /** funções importadas de `solucao` (forma `import`); vazio na forma `stdout`. */
  funcoesAlvo: string[];
  asserts: AssertPython[];
}

export type ExtrairLiteraisPythonResult =
  | { ok: true; dados: LiteraisDoTestePython }
  | { ok: false; error: string };

/** Caminha a árvore normalizada aplicando `fn` a cada nó (pré-ordem). */
function caminhar(node: LangNode, fn: (n: LangNode) => void): void {
  fn(node);
  for (const filho of node.children) caminhar(filho, fn);
}

/** O nome chamado por um `Call`: `rodar()` -> `rodar`; `self.assertEqual(...)` -> `assertEqual`. */
function nomeDoCallee(call: LangNode): string | null {
  const func = call.children.find((c) => c.attributes.field === 'func');
  if (func === undefined) return null;
  if (func.type === 'Name') return func.attributes.id ?? null;
  if (func.type === 'Attribute') return func.attributes.attr ?? null;
  return null;
}

/** Os argumentos POSICIONAIS de um `Call`, na ordem. */
function argumentosPosicionais(call: LangNode): LangNode[] {
  return call.children.filter((c) => c.attributes.field === 'args');
}

/** Tipos de nó que o adaptador Python emite para um literal escalar. */
const LITERAIS_ESCALARES: ReadonlySet<string> = new Set([
  'StrLiteral',
  'BytesLiteral',
  'IntLiteral',
  'FloatLiteral',
  'ComplexLiteral',
  'BoolLiteral',
  'NoneLiteral',
  'EllipsisLiteral',
]);

function ehLiteral(node: LangNode): boolean {
  return LITERAIS_ESCALARES.has(node.type);
}

/**
 * Lê os asserts e a FORMA de um arquivo de teste de Python.
 *
 * Determinístico: mesma entrada, mesma saída. Parse falhou => `{ok:false}` com
 * a mensagem do adaptador (que já traz código, linha e coluna).
 */
export function extrairLiteraisDoTestePython(testsCode: string): ExtrairLiteraisPythonResult {
  const adapter = getAdapter(MINIMAL_PYTHON_LANGUAGE);
  const parsed = adapter.parse(testsCode, { fileName: 'tests/test_solucao.py' });
  if (!parsed.ok) {
    return {
      ok: false,
      error:
        'testsCode não parseia como Python (' +
        parsed.error.code + ' em ' + parsed.error.line + ':' + parsed.error.column + '): ' +
        parsed.error.message,
    };
  }

  const funcoesAlvo = new Set<string>();
  const asserts: AssertPython[] = [];
  let rodaOArquivoDoAluno = false;

  caminhar(parsed.root, (node) => {
    // `from solucao import a, b` — as funções-alvo da forma `import`.
    if (node.type === 'ImportFrom' && node.attributes.module === MODULO_DA_SOLUCAO) {
      for (const alias of node.children) {
        if (alias.type === 'alias' && alias.attributes.name !== undefined) {
          funcoesAlvo.add(alias.attributes.asname ?? alias.attributes.name);
        }
      }
    }

    if (node.type !== 'Call') return;
    const nome = nomeDoCallee(node);
    if (nome === null) return;

    // `runpy.run_path("solucao.py")` — a marca da forma `stdout`.
    if (nome === 'run_path') {
      const primeiro = argumentosPosicionais(node)[0];
      if (primeiro !== undefined && primeiro.type === 'StrLiteral') {
        const alvo = decodificarReprDeStringPython(primeiro.attributes.value ?? '');
        if (alvo === PY_ENTRY_PATH) rodaOArquivoDoAluno = true;
      }
      return;
    }

    if (!ASSERTS_PY.has(nome)) return;
    const args = argumentosPosicionais(node);
    const alvo = args[0];
    const esperadoNode = ASSERTS_DE_COMPARACAO_PY.has(nome) ? args[1] : undefined;

    let funcao: string | null = null;
    const argumentos: Array<string | null> = [];
    if (alvo !== undefined && alvo.type === 'Call') {
      funcao = nomeDoCallee(alvo);
      for (const a of argumentosPosicionais(alvo)) argumentos.push(ehLiteral(a) ? a.text : null);
    }

    let esperado: string | null = null;
    let esperadoRepr: string | null = null;
    let esperadoTexto: string | null = null;
    if (esperadoNode !== undefined && ehLiteral(esperadoNode)) {
      esperado = esperadoNode.text;
      esperadoRepr = esperadoNode.attributes.value ?? null;
      if (esperadoNode.type === 'StrLiteral' && esperadoRepr !== null) {
        esperadoTexto = decodificarReprDeStringPython(esperadoRepr);
      }
    }

    asserts.push({
      assert: nome,
      funcao,
      esperado,
      esperadoRepr,
      esperadoTexto,
      argumentos,
      trecho: node.text.slice(0, 120),
    });
  });

  const forma: FormaDoTestePython = rodaOArquivoDoAluno
    ? 'stdout'
    : funcoesAlvo.size > 0
      ? 'import'
      : 'desconhecida';

  return { ok: true, dados: { forma, funcoesAlvo: [...funcoesAlvo].sort(), asserts } };
}

// ---------------------------------------------------------------------------
// Geração de candidatos (pura, ordenada por minimalidade)
// ---------------------------------------------------------------------------

/** Uma função-alvo localizada no starter (forma `import`). */
export interface FuncaoNoStarterPy {
  nome: string;
  /** parâmetros posicionais declarados, na ordem. */
  params: string[];
  /** offset absoluto da declaração (ordem determinística). */
  start: number;
}

/** Localiza as funções-alvo no starter de Python (`def nome(...)`). */
export function localizarFuncoesNoStarterPy(
  starter: string,
  alvos: readonly string[],
): FuncaoNoStarterPy[] {
  const adapter = getAdapter(MINIMAL_PYTHON_LANGUAGE);
  const parsed = adapter.parse(starter, { fileName: PY_ENTRY_PATH });
  if (!parsed.ok) return [];
  const querido = new Set(alvos);
  const out: FuncaoNoStarterPy[] = [];
  caminhar(parsed.root, (node) => {
    if (node.type !== 'FunctionDef' && node.type !== 'AsyncFunctionDef') return;
    const nome = node.attributes.name;
    if (nome === undefined || !querido.has(nome)) return;
    const args = node.children.find((c) => c.type === 'arguments');
    const params = (args?.children ?? [])
      .filter((a) => a.type === 'arg' && a.attributes.field === 'args')
      .map((a) => a.attributes.arg ?? '')
      .filter((n) => n !== '');
    out.push({ nome, params, start: node.start });
  });
  out.sort((a, b) => a.start - b.start);
  return out;
}

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
 *   sempre, e SÓ quando nada acima gerou candidato:
 *     5. SOLUÇÃO     — a solução de referência inteira (último recurso; se
 *                      houvesse candidato literal ela mascararia o sinal
 *                      `SEM_SOLUCAO_ACESSIVEL` que o dono quer ver)
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
    const vistos = new Set<string>();
    for (const a of dados.asserts) {
      if (!ASSERTS_DE_COMPARACAO_PY.has(a.assert)) continue;
      if (a.esperadoTexto === null || vistos.has(a.esperadoTexto)) continue;
      vistos.add(a.esperadoTexto);
      for (const c of candidatosDeImpressao(a.esperadoTexto)) adicionar(c);
      if (vistos.size >= 3) break;
    }
  } else if (dados.forma === 'import') {
    const funcoes = localizarFuncoesNoStarterPy(starter, dados.funcoesAlvo);
    // A função-alvo é a MAIS referenciada pelos asserts de comparação; empate
    // decide pela ordem de aparição no starter. Sem função no starter, a
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
    if (nome !== undefined) {
      const alvo = nome;
      const comparacoes = dados.asserts.filter(
        (a) => a.funcao === alvo && ASSERTS_DE_COMPARACAO_PY.has(a.assert) && a.esperado !== null,
      );
      // 3. ECO — o teste devolve o próprio argumento.
      const eco = comparacoes.some(
        (a) => a.argumentos.length >= 1 && a.argumentos[0] !== null && a.argumentos[0] === a.esperado,
      );
      if (eco && params.length === 1) {
        adicionar('def ' + alvo + '(' + params[0] + '):\n    return ' + params[0] + '\n');
      }
      // 4. LITERAL — até 3 literais distintos, na ordem do código do teste.
      const assinatura = params.join(', ');
      const vistos = new Set<string>();
      for (const a of comparacoes) {
        if (a.esperado === null || vistos.has(a.esperado)) continue;
        vistos.add(a.esperado);
        adicionar('def ' + alvo + '(' + assinatura + '):\n    return ' + a.esperado + '\n');
        if (vistos.size >= 3) break;
      }
    }
  }

  // 5. último recurso — SÓ quando a forma É reconhecida e nada acima gerou
  // candidato. Numa forma DESCONHECIDA a solução de referência NÃO entra: ela
  // seria aceita pelas provas e viraria um "mínimo" que na verdade é o máximo,
  // inflando os atoms e podendo inventar LACUNA onde não há. Sem candidato, o
  // veredito honesto é `SEM_SOLUCAO_ACESSIVEL` com o motivo escrito.
  if (candidatos.length === 0 && dados.forma !== 'desconhecida' && solution.trim() !== '') {
    adicionar(solution);
  }

  return candidatos.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Síntese contra o prover REAL (fail-closed)
// ---------------------------------------------------------------------------

/**
 * O conteúdo do STUB VAZIO de um desafio de Python: o ARQUIVO VAZIO.
 *
 * O default de `exec/proofs.ts` (`EMPTY_STUB_CODE`) é `export {};`, que é
 * JavaScript — num `solucao.py` ele vira `SyntaxError`, e a prova 4 ("o stub
 * vazio falha") passaria por erro de sintaxe em vez de por ausência de
 * solução. O stub certo em Python é o módulo válido e vazio: ele falha porque
 * não imprime nada e não define nada, que é o que a prova quer demonstrar.
 */
export const PY_EMPTY_STUB_CODE = '';

/** Motivo escrito quando a forma do teste não é nenhuma das reconhecidas. */
function motivoDeFormaDesconhecida(dados: LiteraisDoTestePython): string {
  return (
    'forma de teste de Python não reconhecida: o teste não roda ' +
    'runpy.run_path("' + PY_ENTRY_PATH + '") (forma stdout) nem importa de ' +
    MODULO_DA_SOLUCAO + ' (forma import) — ' + dados.asserts.length + ' assert(s) lidos'
  );
}

/**
 * Sintetiza o código mínimo de Python que passa no teste. Roda cada candidato
 * pelo prover REAL (injetado) e devolve o PRIMEIRO que passa nas provas.
 * FAIL-CLOSED em todos os caminhos.
 */
export async function sintetizarCodigoMinimoPython(
  prover: ProverDeDesafio,
  ctx: MinimalCtx,
): Promise<MinimalVerdict> {
  const extraido = extrairLiteraisDoTestePython(ctx.testsCode);
  if (!extraido.ok) {
    return { ok: false, reason: 'PARSE_FALHOU', detail: extraido.error };
  }
  const dados = extraido.dados;
  const candidatos = gerarCandidatosPython(ctx.starterCode, ctx.solutionCode, dados);
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
        language: MINIMAL_PYTHON_LANGUAGE,
        emptyStubCode: PY_EMPTY_STUB_CODE,
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
        fileName: PY_ENTRY_PATH,
        language: MINIMAL_PYTHON_LANGUAGE,
      });
      const atoms: AtomKey[] = extraidoAtoms.ok ? extraidoAtoms.keys : [];
      return {
        ok: true,
        minimalCode: candidato,
        atoms,
        // ENRIQUECIMENTO VAZIO, E DECLARADO: em JavaScript `atomsDoTeste` são
        // os átomos do TRECHO do teste que chama a função-alvo. Na forma
        // `stdout` esse trecho não existe — o teste chama `rodar()`, um helper
        // do PRÓPRIO teste, e os átomos dele (io/contextlib/runpy/unittest)
        // seriam o harness, nunca o que o desafio cobra do aluno.
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
