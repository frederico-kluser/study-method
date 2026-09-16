/**
 * app/electron/main/engine/quality/minimalC.ts — o SINTETIZADOR DETERMINÍSTICO
 * de solução mínima de C (zero LLM).
 *
 * É o terceiro arquivo que o cabeçalho de `quality/minimal.ts` prometeu: "um
 * sintetizador de código mínimo de Python não é este arquivo com um parâmetro
 * a mais — é outro arquivo, com `def`, indentação significativa e outra tabela
 * de literais". C tem uma TERCEIRA estrutura de teste (o counter_protocol,
 * `docs/build-spec/blocks/03-tdd.md` §3.9.3) e uma terceira gramática de
 * literal — e por isso tem o seu próprio arquivo, no mesmo padrão dos irmãos
 * `minimal.ts` (JavaScript) e `minimalPython.ts` (Python):
 *
 *   - MESMA PERGUNTA: qual é o MENOR código que SATISFAZ os requirements do
 *     desafio e passa nos testes? O `coverage` compara os átomos desse mínimo
 *     com o orçamento da aula — 0 lacunas significa "todo átomo exigido
 *     aparece no mínimo de algum desafio".
 *   - MESMA DISCIPLINA FAIL-CLOSED (docs/16 §9.3): teste que não parseia →
 *     `PARSE_FALHOU`; prover com falha de INFRA em todas as tentativas →
 *     `PROVER_FALHOU`; nenhum candidato passa → `SEM_SOLUCAO_ACESSIVEL`.
 *     "Não sintetizei" é RESULTADO, nunca erro de infra nem veredito falso.
 *   - MESMO PROVER: cada candidato roda pelo `ProverDeDesafio` injetado — as
 *     provas de execução OFICIAIS (`verifyChallengeProofs`, com o `run.sh`
 *     gerado pelo adaptador: `cc -std=c11 -g … -o runner -lm`). Nada aqui
 *     inventa runner: COMPILAR é o typecheck de C, e é o que o runner já faz.
 *
 * ─── O ESPAÇO DE GERAÇÃO É PEQUENO, E ISSO É PROJETO ───────────────────────
 *
 * O envelope do teste C é FIXO (counter_protocol): TU sem `main` (o main é do
 * harness gerado), cenários `SM_TEST(<slug>)`, verificações
 * `checa_int/checa_long/checa_double/checa_char/checa_str` — helpers STATIC do
 * PRÓPRIO `sm_harness.h`. O testsCode DECLARA o que exercita: o PROTÓTIPO de
 * cada função do aluno vem no topo. Isso reduz o espaço do mínimo a:
 *
 *   1. IMPRIMIR  — função que a prova compara por stdout capturado
 *                  (`freopen` + `fgets` + `checa_str`): o mínimo é o corpo que
 *                  imprime, EM ORDEM, exatamente os literais esperados — um
 *                  `printf` único (literais adjacentes, a concatenação de C) e
 *                  depois um `printf` por literal. SEM dedup: a janela de três
 *                  linhas tem borda de cima e de baixo IGUAIS — dedupiar
 *                  apagaria a borda final e o mínimo falharia no teste que o
 *                  define.
 *   2. ECO       — `return <param>;` quando o teste devolve o próprio
 *                  argumento (`checa_int("x", f(n), n, …)`).
 *   3. LITERAL   — `return <literal>;` (até 3 literais distintos, na ordem do
 *                  código do teste — o análogo exato do lado JavaScript).
 *   4. SOLUÇÃO   — a solução de referência, SEMPRE como ÚLTIMO candidato
 *                  quando a forma é reconhecida (mesma decisão medida da onda
 *                  4 do Python: na fase VALOR com ≥2 casos distintos nenhum
 *                  literal passa — `return 4;` falha no caso que espera 10 — e
 *                  sem a referência TODO desafio que exige computação de
 *                  verdade sairia `SEM_SOLUCAO_ACESSIVEL`, reprovando o
 *                  coverage fail-closed da fase inteira. Teste fraco ainda
 *                  acha o literal como mínimo; teste que exige computação acha
 *                  a referência — nada menor passa).
 *
 * Numa forma NÃO reconhecida (teste sem protótipo de função do aluno e sem
 * `checa_*`) a solução de referência NÃO entra: ela seria aceita pelas provas
 * e viraria um "mínimo" que na verdade é o máximo, inflando os átomos e
 * podendo inventar LACUNA onde não há — o mesmo partido dos irmãos.
 *
 * ─── O QUE ELE NÃO SINTETIZA (limite DECLARADO, não omissão) ───────────────
 *
 * Não sintetiza COMPUTAÇÃO: laço, vetor, struct, saída por parâmetro
 * (`&min`/`&max` do M5), string construída. Para essa classe o único
 * candidato que passa é a solução de referência (o que ainda é uma medição
 * honesta — o mínimo EMPATADO com o máximo diz "o teste cobra tudo o que a
 * solução faz"); se nem a referência passar (desafio multi-arquivo, teste
 * quebrado), o veredito é `SEM_SOLUCAO_ACESSIVEL` e o desafio entra no placar
 * como NÃO MEDIDO — nunca como aprovado por omissão.
 *
 * ─── COMPILAÇÃO EM DIR TEMPORÁRIO, SEM ESCRITA FORA DA WORKTREE ────────────
 * O candidato não é escrito por este módulo: ele viaja como `solutionCode` ao
 * prover, que o entrega ao layout do adaptador (que escreve os arquivos num
 * `mkdtemp` do executor endurecido e remove no fim). Este módulo não toca
 * disco.
 */

import type { AtomKey } from '../atomKeys';
import { extractAtoms } from '../extract';
import type { ChallengeProofsVerdict } from '../exec/proofs';
import { C_ENTRY_PATH, C_TEST_PATH, SM_COUNT_PREABULO } from '../lang/c';
import { getAdapter, type LangNode } from '../lang/registry';
import type { ProverDeDesafio } from '../phases/f9Verifier';
import { contarLinhas, type MinimalCtx, type MinimalVerdict } from './minimal';

/** O id do adaptador que este módulo — e só ele — sintetiza. */
export const MINIMAL_C_LANGUAGE = 'c' as const;

/**
 * O conteúdo do STUB VAZIO de um desafio de C: o ARQUIVO VAZIO.
 *
 * O default de `exec/proofs.ts` (`EMPTY_STUB_CODE`) é `export {};`, que é
 * JavaScript — num `solucao.c` ele nem compila, e a prova 4 ("o stub vazio
 * falha") passaria por erro de SINTAXE em vez de por ausência de solução. O
 * stub certo em C é a unidade de tradução vazia (válido por construção): ela
 * falha porque o TU de teste referencia a função do aluno e a LIGAÇÃO reprova
 * com símbolo indefinido — a falha certa, a que a prova quer demonstrar.
 */
export const C_EMPTY_STUB_CODE = '';

// ---------------------------------------------------------------------------
// Leitura do teste (AST do adaptador C — clang + vocab/c/extract_ast.py)
// ---------------------------------------------------------------------------

/** Os helpers de verificação do counter_protocol (03-tdd §3.9.3) — os MESMOS
 * nomes que `SM_HARNESS_HEADER` define e `SM_COUNT_PREABULO` prototipa. */
const CHECAS_C: ReadonlySet<string> = new Set([
  'checa_int',
  'checa_long',
  'checa_double',
  'checa_char',
  'checa_str',
]);

/**
 * Os literais da linguagem cujo TEXTO-FONTE é uma EXPRESSÃO C válida — é o
 * que permite gerar `return <texto>;` e `printf(<texto>)` copiando o teste
 * verbatim (a "tabela de literais" de C é o próprio fonte: `4`, `2.5`, `'a'`,
 * `"oi\n"` já nascem na sintaxe de C).
 */
const LITERAIS_C: ReadonlySet<string> = new Set([
  'StringLiteral',
  'CharacterLiteral',
  'IntegerLiteral',
  'FloatingLiteral',
]);

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

/** Um protótipo de função do ALUNO declarado no testsCode. */
export interface PrototipoC {
  /** nome da função (`tela`). */
  nome: string;
  /**
   * o TEXTO da assinatura (sem o `;` final) — o cabeçalho pronto da DEFINIÇÃO
   * mínima (`void tela(void)`). É o contrato que o teste declara: o mínimo
   * NÃO inventa assinatura, ele a copia do protótipo.
   */
  assinatura: string;
  /** nomes dos parâmetros declarados, na ordem. */
  params: string[];
  /** offset absoluto do protótipo no testsCode parseado (ordem determinística). */
  start: number;
}

/** Uma verificação `checa_*(cenario, obtido, esperado, porque)` lida do teste. */
export interface ChecaC {
  /** qual helper (`checa_int`, `checa_str`, …). */
  helper: string;
  /**
   * nome da função do ALUNO chamada no argumento `obtido` (`dobro` em
   * `checa_int("x", dobro(2), 4, …)`) — null quando o obtido não é chamada
   * (o `linha` do `checa_str` de captura de stdout, por exemplo).
   */
  chamadaAlvo: string | null;
  /** textos-fonte dos argumentos LITERAIS da chamada ao aluno, na ordem. */
  argumentosAlvo: string[];
  /** TEXTO-FONTE do literal esperado (`"oi\n"`, `4`, `'a'`) ou null. */
  esperadoTexto: string | null;
  /** o kind do nó do esperado (`StringLiteral`, `IntegerLiteral`, …). */
  esperadoKind: string | null;
}

export interface LiteraisDoTesteC {
  /** os protótipos de função do aluno, na ordem do fonte. */
  prototipos: PrototipoC[];
  /** as verificações `checa_*`, na ordem do fonte. */
  checas: ChecaC[];
}

export type ExtrairLiteraisCResult =
  | { ok: true; dados: LiteraisDoTesteC }
  | { ok: false; error: string };

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
    // PROTÓTIPOS: `FunctionDecl` SEM corpo (`CompoundStmt`), fora do
    // harness — a expansão da macro `SM_TEST` também emite `test_<slug>` sem
    // corpo (a decl da macro) e `sm_reg_<slug>` (o construtor), e a ante-sala
    // declara os helpers `checa_*` e a ponte `sm_*`. Nenhum deles é contrato
    // com o aluno: o prefixo e a tabela dos helpers filtram.
    if (n.type === 'FunctionDecl') {
      const nome = n.attributes.name;
      const temCorpo = n.children.some((f) => f.type === 'CompoundStmt');
      if (
        nome !== undefined &&
        !temCorpo &&
        !nome.startsWith('test_') &&
        !nome.startsWith('sm_') &&
        !CHECAS_C.has(nome)
      ) {
        prototipos.push({
          nome,
          assinatura: n.text.replace(/;\s*$/, '').trim(),
          params: n.children
            .filter((f) => f.type === 'ParmVarDecl')
            .map((f) => f.attributes.name ?? '')
            .filter((p) => p !== ''),
          start: n.start,
        });
      }
    }

    // VERIFICAÇÕES `checa_*(cenario, obtido, esperado, porque)`.
    if (n.type !== 'CallExpr') return;
    const helper = checaC(n);
    if (helper === null) return;
    const args = argumentosC(n);
    const obtido = args[1];
    const esperado = args[2];

    let chamadaAlvo: string | null = null;
    const argumentosAlvo: string[] = [];
    if (obtido !== undefined && obtido.type === 'CallExpr') {
      chamadaAlvo = nomeDoCalleeC(obtido);
      for (const a of argumentosC(obtido)) {
        if (LITERAIS_C.has(a.type)) argumentosAlvo.push(a.text);
      }
    }

    checas.push({
      helper,
      chamadaAlvo,
      argumentosAlvo,
      esperadoTexto: esperado !== undefined && LITERAIS_C.has(esperado.type) ? esperado.text : null,
      esperadoKind: esperado !== undefined && LITERAIS_C.has(esperado.type) ? esperado.type : null,
    });
  });

  prototipos.sort((a, b) => a.start - b.start);
  return { ok: true, dados: { prototipos, checas } };
}

// ---------------------------------------------------------------------------
// Geração de candidatos (pura, ordenada por minimalidade)
// ---------------------------------------------------------------------------

/** A forma do teste, decidida pelo que ele DECLARA. */
export type FormaDoTesteC = 'impressao' | 'valor' | 'mista' | 'desconhecida';

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

/** Monta a UNIDADE DE TRADUÇÃO mínima: cabeçalho stdio opcional + definição. */
function tuC(assinatura: string, corpo: string, comStdio: boolean): string {
  const incluir = comStdio ? '#include <stdio.h>\n\n' : '';
  return `${incluir}${assinatura} {\n    ${corpo}\n}\n`;
}

/**
 * Gera os candidatos de solução mínima, na ordem de minimalidade (o primeiro
 * que passar nas provas vence). PURO: mesma entrada, mesma saída. Teto de 8.
 *
 *   1. IMPRIMIR único — `printf(<lit1> <lit2> …);` (literais adjacentes de C,
 *      na ORDEM do teste, SEM dedup — ver o cabeçalho)
 *   2. IMPRIMIR por linha — um `printf(<lit>);` por verificação, na ordem
 *   3. ECO — `return <param>;`
 *   4. LITERAL — `return <literal>;` (até 3 literais distintos, ordem do teste)
 *   5. SOLUÇÃO — a referência, sempre a ÚLTIMA quando a forma é reconhecida
 */
export function gerarCandidatosC(
  _starterCode: string,
  solution: string,
  dados: LiteraisDoTesteC,
): string[] {
  const candidatos: string[] = [];
  const adicionar = (c: string | null | undefined): void => {
    if (c === null || c === undefined) return;
    if (!candidatos.includes(c)) candidatos.push(c);
  };

  if (dados.prototipos.length === 0) return [];

  // A função-alvo: a MAIS referenciada pelas verificações; empate decide pela
  // ordem de aparição no fonte (o mesmo desempate dos irmãos).
  const alvo = (() => {
    let melhor = dados.prototipos[0];
    let refs = -1;
    for (const p of dados.prototipos) {
      const n = dados.checas.filter((c) => c.chamadaAlvo === p.nome).length;
      if (n > refs) {
        refs = n;
        melhor = p;
      }
    }
    return melhor;
  })();

  // 1. e 2. IMPRIMIR — os literais StringLiteral esperados, NA ORDEM do teste.
  const literaisDeSaida = dados.checas
    .filter((c) => c.esperadoKind === 'StringLiteral' && c.esperadoTexto !== null)
    .map((c) => c.esperadoTexto as string);
  if (literaisDeSaida.length > 0) {
    // UM printf: a concatenação de literais adjacentes de C — o mínimo em
    // linhas. Sem dedup (a janela tem bordas iguais; dedup apagaria a última).
    adicionar(tuC(alvo.assinatura, `printf(${literaisDeSaida.join(' ')});`, true));
    // UM printf por verificação — a forma que a aula ensina primeiro.
    adicionar(
      tuC(
        alvo.assinatura,
        literaisDeSaida.map((l) => `printf(${l});`).join('\n    '),
        true,
      ),
    );
  }

  const comparacoes = dados.checas.filter((c) => c.chamadaAlvo === alvo.nome);

  // 3. ECO — o teste devolve o próprio argumento.
  if (alvo.params.length === 1) {
    const p = alvo.params[0];
    const eco = comparacoes.some(
      (c) => c.argumentosAlvo.length >= 1 && c.argumentosAlvo[0] === p && c.esperadoTexto === p,
    );
    if (eco) {
      adicionar(tuC(alvo.assinatura, `return ${p};`, false));
    }
  }

  // 4. LITERAL — até 3 literais distintos, na ordem do código do teste.
  const vistos = new Set<string>();
  for (const c of comparacoes) {
    if (c.esperadoTexto === null || vistos.has(c.esperadoTexto)) continue;
    vistos.add(c.esperadoTexto);
    adicionar(tuC(alvo.assinatura, `return ${c.esperadoTexto};`, false));
    if (vistos.size >= 3) break;
  }

  // 5. ÚLTIMO recurso — a solução de referência, SEMPRE como ÚLTIMO candidato
  // quando a forma é reconhecida (mesma decisão MEDIDA da onda 4 do Python,
  // espelhada no cabeçalho: fase VALOR com ≥2 casos nunca é satisfeita por
  // literal; sem a referência, todo desafio que exige computação sairia
  // SEM_SOLUCAO_ACESSIVEL e o coverage fail-closed reprovaria a fase inteira.
  // Numa forma DESCONHECIDA a referência NÃO entra: ela viraria um "mínimo"
  // que na verdade é o máximo, inflando os átomos e podendo inventar LACUNA).
  if (formaDoTesteC(dados) !== 'desconhecida' && solution.trim() !== '') {
    adicionar(solution);
  }

  return candidatos.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Síntese contra o prover REAL (fail-closed)
// ---------------------------------------------------------------------------

/** Motivo escrito quando a forma do teste não é nenhuma das reconhecidas. */
function motivoDeFormaDesconhecida(dados: LiteraisDoTesteC): string {
  return (
    'forma de teste de C não reconhecida: o teste não declara protótipo de função do aluno ' +
    'nem chama checa_int/checa_long/checa_double/checa_char/checa_str (counter_protocol, ' +
    '03-tdd §3.9.3) — ' + dados.checas.length + ' verificação(ões) e ' +
    dados.prototipos.length + ' protótipo(s) lidos'
  );
}

/**
 * Sintetiza o código mínimo de C que passa no teste. Roda cada candidato pelo
 * prover REAL (injetado — o runner oficial do adaptador: `run.sh` gerado que
 * compila com `cc -std=c11 -g` e roda) e devolve o PRIMEIRO que passa nas
 * provas. FAIL-CLOSED em todos os caminhos.
 */
export async function sintetizarCodigoMinimoC(
  prover: ProverDeDesafio,
  ctx: MinimalCtx,
): Promise<MinimalVerdict> {
  const extraido = extrairLiteraisDoTesteC(ctx.testsCode);
  if (!extraido.ok) {
    return { ok: false, reason: 'PARSE_FALHOU', detail: extraido.error };
  }
  const dados = extraido.dados;
  const candidatos = gerarCandidatosC(ctx.starterCode, ctx.solutionCode, dados);
  if (candidatos.length === 0) {
    return {
      ok: false,
      reason: 'SEM_SOLUCAO_ACESSIVEL',
      detail:
        formaDoTesteC(dados) === 'desconhecida'
          ? motivoDeFormaDesconhecida(dados)
          : 'nenhum candidato mínimo gerado a partir dos protótipos e das verificações do teste',
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
        language: MINIMAL_C_LANGUAGE,
        emptyStubCode: C_EMPTY_STUB_CODE,
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
        fileName: C_ENTRY_PATH,
        language: MINIMAL_C_LANGUAGE,
      });
      const atoms: AtomKey[] = extraidoAtoms.ok ? extraidoAtoms.keys : [];
      return {
        ok: true,
        minimalCode: candidato,
        atoms,
        // ENRIQUECIMENTO VAZIO, E DECLARADO (o mesmo partido do irmão de
        // Python na forma `stdout`): o trecho do teste que exerce a função do
        // aluno vive num TU cujos átomos são o HARNESS do counter_protocol
        // (freopen/fgets/fopen/SM_TEST) — emitiria o envelope como se fosse
        // o que o desafio cobra do aluno.
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
      'nenhum dos ' + tentativas + ' candidato(s) passou nas provas — o teste exige mais que o ' +
      'espaço de síntese cobre (computação, vetor, saída por parâmetro) ou está quebrado: ' +
      motivos.join(' | '),
  };
}
