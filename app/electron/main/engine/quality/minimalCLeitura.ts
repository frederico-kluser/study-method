/**
 * app/electron/main/engine/quality/minimalCLeitura.ts — a LEITURA do testsCode
 * de C pelo AST do adaptador (clang + vocab/c/extract_ast.py): protótipos do
 * aluno, verificações `checa_*` e a forma do teste.
 *
 * A prosa normativa vive na fachada `minimalC.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { C_TEST_PATH, SM_COUNT_PREABULO } from '../lang/c';
import { getAdapter, type LangNode } from '../lang/registry';
import {
  CHECAS_C,
  LITERAIS_C,
  MINIMAL_C_LANGUAGE,
  type ChecaC,
  type ExtrairLiteraisCResult,
  type FormaDoTesteC,
  type LiteraisDoTesteC,
  type PrototipoC,
} from './minimalCTipos';

/** Caminha a árvore normalizada aplicando `fn` a cada nó (pré-ordem). */
function caminharC(node: LangNode, fn: (n: LangNode) => void): void {
  fn(node);
  for (const filho of node.children) caminharC(filho, fn);
}

/**
 * O nome do callee de uma chamada C: `checa_int(…)` → `checa_int`;
 * `dobro(2)` → `dobro`. O callee de C é o PRIMEIRO filho `DeclRefExpr` (os
 * portadores sintéticos — `ApiRef`/`IndirectCall` — são anexados ao FIM).
 * Mesma regra da derivação de `requirements.ts` (lá é privada; aqui o mesmo
 * motivo: duplicada, e o que NÃO se duplica é tabela nenhuma).
 */
function nomeDoCalleeC(call: LangNode): string | null {
  const callee = call.children[0];
  if (callee === undefined || callee.type !== 'DeclRefExpr') return null;
  return callee.attributes.name ?? null;
}

/** Os argumentos de uma chamada C, na ordem — sem os portadores sintéticos. */
function argumentosC(call: LangNode): LangNode[] {
  return call.children.slice(1).filter((c) => c.synthetic !== true);
}

/** É chamada a um helper `checa_*` do counter_protocol? Devolve o nome. */
function checaC(call: LangNode): string | null {
  const nome = nomeDoCalleeC(call);
  return nome !== null && CHECAS_C.has(nome) ? nome : null;
}

/** É um literal cujo texto-fonte é expressão C válida (a tabela `LITERAIS_C`)? */
function ehLiteralC(node: LangNode): boolean {
  return LITERAIS_C.has(node.type);
}

/**
 * O PROTÓTIPO de função do aluno (`FunctionDecl` SEM corpo, fora do harness).
 * A expansão da macro `SM_TEST` também emite `test_<slug>` sem corpo (a decl
 * da macro) e `sm_reg_<slug>` (o construtor), e a ante-sala declara os
 * helpers `checa_*` e a ponte `sm_*`. Nenhum deles é contrato com o aluno: o
 * prefixo e a tabela dos helpers filtram.
 */
function lerPrototipoC(n: LangNode): PrototipoC | null {
  if (n.type !== 'FunctionDecl') return null;
  const nome = n.attributes.name;
  if (nome === undefined) return null;
  const temCorpo = n.children.some((f) => f.type === 'CompoundStmt');
  if (temCorpo || nome.startsWith('test_') || nome.startsWith('sm_') || CHECAS_C.has(nome)) return null;
  return {
    nome,
    assinatura: n.text.replace(/;\s*$/, '').trim(),
    params: n.children
      .filter((f) => f.type === 'ParmVarDecl')
      .map((f) => f.attributes.name ?? '')
      .filter((p) => p !== ''),
    start: n.start,
  };
}

/** O alvo `obtido` de uma `checa_*`: a chamada ao aluno e seus argumentos literais. */
function alvoDaChamada(obtido: LangNode | undefined): {
  chamadaAlvo: string | null;
  argumentosAlvo: string[];
} {
  const argumentosAlvo: string[] = [];
  if (obtido === undefined || obtido.type !== 'CallExpr') {
    return { chamadaAlvo: null, argumentosAlvo };
  }
  const chamadaAlvo = nomeDoCalleeC(obtido);
  for (const a of argumentosC(obtido)) {
    if (ehLiteralC(a)) argumentosAlvo.push(a.text);
  }
  return { chamadaAlvo, argumentosAlvo };
}

/** A VERIFICAÇÃO `checa_*(cenario, obtido, esperado, porque)` — null fora da tabela. */
function lerChecaC(n: LangNode): ChecaC | null {
  if (n.type !== 'CallExpr') return null;
  const helper = checaC(n);
  if (helper === null) return null;
  const args = argumentosC(n);
  const obtido = args[1];
  const esperado = args[2];
  const esperadoLiteral = esperado !== undefined && ehLiteralC(esperado) ? esperado : null;
  return {
    helper,
    ...alvoDaChamada(obtido),
    esperadoTexto: esperadoLiteral !== null ? esperadoLiteral.text : null,
    esperadoKind: esperadoLiteral !== null ? esperadoLiteral.type : null,
  };
}

/**
 * Lê os protótipos e as verificações de um testsCode de C.
 *
 * O testsCode de C SÓ parseia com a ante-sala que a própria engine define
 * (`SM_COUNT_PREABULO`, a mesma de `cCountDeclared` e da derivação de
 * `requirements.ts`): sem ela a macro `SM_TEST` é função não declarada e o
 * clang reprova o TU inteiro. Determinístico: mesma entrada, mesma saída.
 * Parse falhou → `{ ok: false }` com código/linha/coluna do adaptador.
 */
export function extrairLiteraisDoTesteC(testsCode: string): ExtrairLiteraisCResult {
  const parsed = getAdapter(MINIMAL_C_LANGUAGE).parse(`${SM_COUNT_PREABULO}\n${testsCode}`, {
    fileName: C_TEST_PATH,
  });
  if (!parsed.ok) {
    return {
      ok: false,
      error:
        'testsCode não parseia como C (' +
        parsed.error.code + ' em ' + parsed.error.line + ':' + parsed.error.column + '): ' +
        parsed.error.message,
    };
  }

  const prototipos: PrototipoC[] = [];
  const checas: ChecaC[] = [];

  caminharC(parsed.root, (n) => {
    const prototipo = lerPrototipoC(n);
    if (prototipo !== null) prototipos.push(prototipo);
    const checa = lerChecaC(n);
    if (checa !== null) checas.push(checa);
  });

  prototipos.sort((a, b) => a.start - b.start);
  return { ok: true, dados: { prototipos, checas } };
}

/**
 * A forma reconhecida — decide se a solução de referência entra como último
 * candidato. `impressao`: só `checa_str/checa_char` (captura de stdout);
 * `valor`: só `checa_*` de comparação com chamada ao aluno; `mista`: os dois.
 * SEM protótipo e SEM checa nenhuma: `desconhecida` (a referência não entra).
 */
export function formaDoTesteC(dados: LiteraisDoTesteC): FormaDoTesteC {
  const temCaptura = dados.checas.some((c) => c.chamadaAlvo === null);
  const temValor = dados.checas.some((c) => c.chamadaAlvo !== null);
  if (temCaptura && temValor) return 'mista';
  if (temCaptura) return 'impressao';
  if (temValor) return 'valor';
  return 'desconhecida';
}
