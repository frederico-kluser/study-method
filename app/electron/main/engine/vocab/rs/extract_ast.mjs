#!/usr/bin/env node
/**
 * app/electron/main/engine/vocab/rs/extract_ast.mjs — A PORTA 1 DE RUST.
 *
 * É o `ts.createSourceFile` do adaptador de Rust — o análogo exato do
 * `vocab/py/extract_ast.py` (a Porta 1 de Python): recebe o FONTE no stdin e
 * devolve em stdout UM objeto JSON com a árvore normalizada e a resolução de
 * escopo. Invocado por `lang/rust.ts` com `spawnSync`, sempre assim:
 *
 *     node <este arquivo> <fileName>      # fonte no STDIN, JSON no STDOUT
 *
 * (o binário host é `process.execPath` do adaptador, com
 * `ELECTRON_RUN_AS_NODE=1` quando o pai é o Electron — ver `rust.ts`.)
 *
 * ─── A DECISÃO DE PARSER, E POR QUE SUBPROCESSO (DE NOVO) ─────────────────
 *
 * O §7 item 3 de `docs/research/08-multilingua-trava-deterministica.md`
 * prometeu, com o adaptador de Python, que "o adaptador de Porta 1 pode ser um
 * SUBPROCESSO e não só uma lib npm — o que desbloqueia Go, C# e todo o resto".
 * Rust é a primeira prova disso fora de um interpretador de script: a árvore
 * vem do tree-sitter (`web-tree-sitter` + o WASM de `tree-sitter-rust`)
 * rodando DENTRO deste subprocesso node. Motivos, na ordem em que pesaram:
 *
 *   1. A interface do adaptador é SÍNCRONA por decisão de arquitetura
 *      (`lang/registry.ts`, decisão 1). A inicialização do web-tree-sitter é
 *      ASSÍNCRONA (`await Parser.init()` / `await Language.load()`). No
 *      SUBPROCESSO o `await` é gratuito; no processo da engine exigiria
 *      converter ~20 call sites de extract/budget/audit para async.
 *   2. O `tree-sitter` NATIVO (pacote npm `tree-sitter`, API síncrona) seria o
 *      PRIMEIRO módulo nativo do Electron main neste repositório: ABI própria
 *      (electron-rebuild), empacotamento `asar.unpacked`, prebuilds por
 *      plataforma — um risco de build inteiro para o mesmo resultado. O WASM
 *      é puro e idêntico em toda máquina.
 *   3. Um binário auxiliar compilado em Rust (o que o §7 item 7 prevê como
 *      custo da linguagem) exigiria compilar no build ou versionar binário —
 *      os dois piores modos de distribuição. O WASM do `tree-sitter-rust` já
 *      vem compilado no `npm ci`.
 *
 * ─── DETERMINISMO ──────────────────────────────────────────────────────────
 *
 * O WASM vem do disco (`node_modules`), a análise não lê ambiente nenhum e a
 * saída é função pura do fonte: mesma entrada, MESMO JSON. A posição de um nó
 * sai de `startIndex`/`endIndex`/`startPosition` do tree-sitter — offsets em
 * CARACTERES sobre a MESMA string que o adaptador devolve em `ParseOk.source`
 * (o tree-sitter conta code points; não há o problema do byte UTF-8 que o
 * `col_offset` do CPython tem).
 *
 * ─── O QUE ESTE ARQUIVO EMITE ALÉM DA ÁRVORE CRUA ─────────────────────────
 *
 * 1. Resolução de escopo (`scopes`) — é o que põe Rust em TIER A e não em
 *    Tier B (§7: "nunca promover uma linguagem a Tier A sem resolução de
 *    escopo"). DUAS CAMADAS, e a distinção importa: ITENS do arquivo
 *    (fn/struct/enum/trait/mod/const/static/use) são HOISTED — Rust é
 *    order-independent no nível de item, e uma chamada a uma fn declarada
 *    DEPOIS não é referência livre —; LET e PARÂMETROS são lexicais por bloco
 *    (uma `let String = 3;` local não apaga o `global:String` do arquivo).
 * 2. Os nós SINTÉTICOS — as distinções que o tree-sitter colapsa em tokens
 *    anônimos (`Op` para o eixo `op:`, `GlobalRef` para `global:`, `ApiRef`
 *    para `api:`, `MutableReference` para `&mut T`, `ElseIf` para `else if`)
 *    saem como NÓS PORTADORES filhos, cada um com linha e coluna próprias.
 *
 * O que este arquivo NÃO faz: não decide o que é permitido (é `budget.ts`),
 * não lê trilha, não executa o código do aluno e não escreve em disco nenhum.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Parser, Language } = require('web-tree-sitter');

/**
 * O crate que o ALUNO escreve (o `RS_CRATE_NAME` do adaptador, `desafio`).
 * O teste importa com `use desafio::soma;`; esse import NÃO é API externa e
 * por isso não emite `api:` — análogo exato do `from solucao import X` do
 * Python (`MODULO_DO_ALUNO` lá) e do import relativo de JavaScript.
 */
const CRATE_DO_ALUNO = 'desafio';

/** Caminhos raiz internos — nunca API externa. `crate`/`self`/`super` são os
 * imports internos da própria crate (`use crate::…`). */
const RAIZES_INTERNAS = new Set([CRATE_DO_ALUNO, 'crate', 'self', 'super']);

/**
 * O universo do eixo `global:` — os nomes que a stdlib põe no escopo SEM
 * import nenhum: tipos primitivos, o prelude (`std::prelude::v1`) e as raízes
 * de caminho sempre acessíveis (`std`). É a lista que `atoms.rust.json`
 * esgota em `axes.global`; `builtins()` do adaptador devolve o MESMO conjunto
 * (em Rust os dois coincidem, como em JavaScript: tudo o que a linguagem
 * embute é "global" pelo prelude — é em Python que os dois se separam, porque
 * `len` é builtin e `__file__` é global de módulo; aqui não existe essa
 * fronteira). Lista FECHADA: acrescentar um nome aqui é evento de currículo,
 * travado por `tests/engineLangRust.test.ts`.
 */
const PRELUDE_RUST = Object.freeze([
  // primitivos de valor (sempre no escopo, sem `use`)
  'i8', 'i16', 'i32', 'i64', 'i128', 'isize',
  'u8', 'u16', 'u32', 'u64', 'u128', 'usize',
  'f32', 'f64',
  'bool', 'char', 'str',
  // prelude — coleções e ponteiros
  'String', 'Vec', 'VecDeque', 'LinkedList', 'HashMap', 'HashSet',
  'BTreeMap', 'BTreeSet', 'BinaryHeap', 'Box', 'Rc', 'Arc', 'Cow',
  'RefCell', 'Cell', 'Mutex', 'RwLock',
  // prelude — Option/Result e variantes
  'Option', 'Some', 'None', 'Result', 'Ok', 'Err',
  // prelude — traits fundamentais
  'Drop', 'Fn', 'FnMut', 'FnOnce', 'Copy', 'Clone', 'Default',
  'PartialEq', 'Eq', 'PartialOrd', 'Ord', 'Hash', 'Debug',
  'Iterator', 'IntoIterator', 'Into', 'From', 'TryFrom', 'TryInto',
  'ToString', 'AsRef', 'AsMut', 'Send', 'Sync', 'Sized', 'Unpin',
  'DoubleEndedIterator', 'ExactSizeIterator', 'Extend', 'FromIterator',
  'FromStr', 'ToOwned',
  // raízes de caminho e nomes de posição
  'std', 'alloc', 'core', 'Self', 'self',
]);
const GLOBALS_RUST = new Set(PRELUDE_RUST);

/**
 * As macros do prelude que se usam SEM import (`println!`, `vec!`, …). Só
 * estas emitem `api:<nome>!` — uma macro DEFINIDA no próprio arquivo
 * (`macro_rules!`) é conteúdo do aluno, não API. Lista FECHADA, mesmo
 * espírito de `PRELUDE_RUST`.
 */
const MACROS_PRELUDE = new Set([
  'println', 'print', 'eprintln', 'eprint',
  'format', 'write', 'writeln',
  'vec', 'format_args',
  'assert', 'assert_eq', 'assert_ne',
  'panic', 'todo', 'unimplemented', 'unreachable',
  'matches', 'debug_assert', 'debug_assert_eq', 'debug_assert_ne',
  'concat', 'include_str', 'include_bytes', 'env', 'line', 'column', 'file',
  'cfg', 'stringify',
]);

// ---------------------------------------------------------------------------
// A TABELA de operadores — o eixo `op:` (famílias separadas por currículo)
// ---------------------------------------------------------------------------

/** Tokens de `binary_expression` por família. A separação de `compare` e
 * `logical` é DECISÃO DE CURRÍCULO, como em Python (`op:compare:==` não é
 * `op:binary:==`): misturar famílias faria o orçamento de uma aula de
 * igualdade liberar aritmética de graça. */
const OP_BINARY = new Set(['+', '-', '*', '/', '%', '&', '|', '^', '<<', '>>']);
const OP_COMPARE = new Set(['==', '!=', '<', '<=', '>', '>=']);
const OP_LOGICAL = new Set(['&&', '||']);
const OP_ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
const OP_RANGE = new Set(['..', '..=']);
const OP_UNARY = new Set(['!', '-', '*', '&']);

/** Família de um token de operador DENTRO de um token_tree (fora de árvore de
 * expressão). `-`, `*` e `&` existem nas duas posições; a heurística é a
 * posição de PREFIXO: depois de `(`, `[`, `,` ou de outro operador, um
 * operador prefixo é unário (`dobro(-3)`), depois de expressão é binário
 * (`a - b`). Determinístico por construção. */
function familiaDeTokenEmArvore(token, anterior) {
  if (OP_ASSIGN.has(token)) return 'assign';
  if (OP_COMPARE.has(token)) return 'compare';
  if (OP_LOGICAL.has(token)) return 'logical';
  if (OP_RANGE.has(token)) return 'range';
  if (token === '+' || token === '/' || token === '%' || token === '|' || token === '^' ||
      token === '<<' || token === '>>') return 'binary';
  if (token === '-' || token === '*' || token === '&') {
    const inicioDeExpressao = anterior === null || ['(', '[', ','].includes(anterior) ||
      familiaDeTokenEmArvore(anterior, 'x') !== null;
    return inicioDeExpressao ? 'unary' : 'binary';
  }
  return null;
}

function familiaDoOperador(token) {
  if (OP_BINARY.has(token)) return 'binary';
  if (OP_COMPARE.has(token)) return 'compare';
  if (OP_LOGICAL.has(token)) return 'logical';
  if (OP_ASSIGN.has(token)) return 'assign';
  if (OP_RANGE.has(token)) return 'range';
  if (OP_UNARY.has(token)) return 'unary';
  return null;
}

// ---------------------------------------------------------------------------
// Nomes de nó normalizados — snake_case do tree-sitter → PascalCase
// ---------------------------------------------------------------------------

function pascalCase(tipo) {
  return tipo
    .split('_')
    .map((p) => (p.length === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join('');
}

// ---------------------------------------------------------------------------
// O emissor da árvore normalizada
// ---------------------------------------------------------------------------

class Emissor {
  constructor(src) {
    this.src = src;
    this.declarados = new Set(); // nomes ligados em QUALQUER nível (o lado `declared`)
    this.importados = new Set(); // subconjunto de `declarados`: veio de `use`
    this.itensDoArquivo = new Set(); // nomes de ITEM (fn/struct/const/…) — hoisted
    this.escopos = [new Set()]; // pilha de escopos LEXICOS (let/param) — topo = atual
  }

  // ---- posição ----------------------------------------------------------

  posDe(no) {
    const ini = no.startIndex;
    const fim = Math.max(ini, no.endIndex);
    const inicio = no.startPosition;
    return {
      line: inicio.row + 1,
      column: inicio.column + 1,
      start: ini,
      end: fim,
    };
  }

  no(tipo, pos, attrs, children = [], sintetico = false) {
    const atributos = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== null) atributos[k] = String(v);
    }
    return {
      type: tipo,
      line: pos.line,
      column: pos.column,
      start: pos.start,
      end: pos.end,
      text: this.src.slice(pos.start, pos.end),
      attributes: atributos,
      children,
      synthetic: sintetico,
    };
  }

  marcador(tipo, pos, attrs = {}) {
    return this.no(tipo, pos, attrs, [], true);
  }

  // ---- escopo ------------------------------------------------------------

  declara(nome) {
    if (nome && nome !== '_') {
      this.declarados.add(nome);
      this.escopos[this.escopos.length - 1].add(nome);
    }
  }

  /** 'local' (escopo léxico) | 'item' (hoisted no arquivo) | 'livre'. */
  resolve(nome) {
    for (let i = this.escopos.length - 1; i >= 0; i -= 1) {
      if (this.escopos[i].has(nome)) return 'local';
    }
    if (this.itensDoArquivo.has(nome)) return 'item';
    return 'livre';
  }

  // ---- cadeias (`a::b::c`, `a.b.c`) — o eixo `api:` -----------------------

  /** As partes de uma cadeia de caminho/campo, na ordem:
   * `std::io::stdout` → ['std','io','stdout']; `total.to_string().len()` →
   * ['total','to_string','len']. Recursão sobre os filhos nomeados de
   * identificador; tokens anônimos (`::`, `.`) não são nós. */
  partesDaCadeia(no) {
    const out = [];
    const caminhar = (n) => {
      for (let i = 0; i < n.childCount; i += 1) {
        const filho = n.child(i);
        if (filho === null || !filho.isNamed) continue;
        if (filho.type === 'scoped_identifier' || filho.type === 'field_expression') {
          caminhar(filho);
        } else if (filho.type === 'identifier' || filho.type === 'field_identifier' ||
                   filho.type === 'type_identifier') {
          out.push(filho.text);
        } else if (filho.type === 'generic_type' || filho.type === 'generic_type_with_turbofish') {
          // `Vec<i32>` / `parse::<i32>()`: o NOME do tipo é a parte.
          for (let j = 0; j < filho.childCount; j += 1) {
            const parte = filho.child(j);
            if (parte !== null && (parte.type === 'type_identifier' || parte.type === 'identifier')) {
              out.push(parte.text);
              break;
            }
          }
        } else {
          // Receptor não trivial (chamada, literal, índice, parênteses): a
          // cadeia PARA aqui — é o ponto onde o tipo vira indecidível.
          out.push(null);
        }
      }
    };
    caminhar(no);
    return out;
  }

  /** Tipo decidível de um receptor literal (`"abc".len()` → `str`). */
  tipoDeLiteral(no) {
    if (no === null || no === undefined) return null;
    switch (no.type) {
      case 'string_literal': return 'str';
      case 'raw_string_literal': return 'str';
      case 'integer_literal': return 'i32';
      case 'float_literal': return 'f64';
      case 'boolean_literal': return 'bool';
      case 'char_literal': return 'char';
      default: return null;
    }
  }

  /** A chave `api:` de uma cadeia — MESMA regra do Python
   * (`extract_ast.py:_cadeia_atributo`): raiz IMPORTADA ou GLOBAL-EM-ESCOPO
   * vira caminho completo com `::` (`api:String::from`, `api:std::io::stdout`);
   * receptor LOCAL vira só o método (`api:.clone`), porque o tipo do receptor
   * não é decidível sem inferência — exceto receptor LITERAL, cujo tipo É
   * decidível (`api:str.to_string`). Raiz LIVRE-e-não-global (o crate do
   * aluno, módulo externo sem `use`) NÃO emite — o artefato sob teste não é
   * API externa, e chaves com nome variável não podem ser ensinadas. */
  chaveApi(raiz, partes, raizLiteral) {
    const ultimo = partes[partes.length - 1];
    if (ultimo === null || ultimo === undefined) return null;
    if (raizLiteral !== null) return `${raizLiteral}.${ultimo}`;
    if (raiz === null || RAIZES_INTERNAS.has(raiz)) return null;
    const resolucao = this.resolve(raiz);
    if (this.importados.has(raiz)) return partes.join('::');
    if (resolucao === 'livre' && GLOBALS_RUST.has(raiz)) return partes.join('::');
    if (resolucao === 'local') return `.${ultimo}`;
    return null; // livre e NÃO global: crate do aluno / módulo desconhecido
  }

  // ---- a travessia -------------------------------------------------------

  visitar(no, emAtributo = false, marcadoTeste = false) {
    const pos = this.posDe(no);
    const tipo = pascalCase(no.type);
    const attrs = {};
    const filhos = [];
    const sinteticos = [];

    // ── nós TERMINAIS (identificadores, literais, tipos primitivos) ──────
    if (no.type === 'integer_literal' || no.type === 'float_literal' ||
        no.type === 'boolean_literal') {
      return this.no(tipo, pos, { ...attrs, value: no.text });
    }
    if (no.type === 'char_literal' || no.type === 'string_literal' ||
        no.type === 'raw_string_literal') {
      // o valor cru vai no atributo `value` (com aspas — o análogo do `repr`
      // de Python; quem decodifica é o sintetizador, não a árvore)
      return this.no(tipo, pos, { ...attrs, value: no.text });
    }
    if (no.type === 'string_content') return this.no(tipo, pos, attrs);
    if (no.type === 'primitive_type') {
      return this.no('PrimitiveType', pos, { ...attrs, value: no.text });
    }
    if (no.type === 'mutable_specifier') return this.no('MutableSpecifier', pos, attrs);
    if (no.type === 'self') {
      // `self` em posição de VALOR. Não é global nem livre: é parâmetro
      // implícito de método — e é conteúdo de aula no eixo de nós.
      return this.no('Self', pos, attrs);
    }

    // ── o eixo `decl:` — as QUATRO formas de ligação de nome ────────────
    // `let` × `let mut` × `const` × `static` (o análogo do eixo `decl:` de
    // Python: a didática está na FORMA, não no tipo do nó).
    let declKind = null;
    if (no.type === 'let_declaration') {
      declKind = this.noContem(no, 'mutable_specifier') ? 'let-mut' : 'let';
      attrs.declKind = declKind;
    } else if (no.type === 'const_item') {
      declKind = 'const';
      attrs.declKind = declKind;
    } else if (no.type === 'static_item') {
      declKind = 'static';
      attrs.declKind = declKind;
    }

    // ── o eixo `op:` — os tokens de operador são filhos ANÔNIMOS (fora de
    // namedChildren); os nós sintéticos `Op` carregam a chave com posição.
    if (no.type === 'binary_expression' || no.type === 'unary_expression' ||
        no.type === 'assignment_expression' || no.type === 'compound_assignment_expr' ||
        no.type === 'range_expression') {
      for (let i = 0; i < no.childCount; i += 1) {
        const filho = no.child(i);
        if (filho === null || filho.isNamed) continue;
        // `-`, `*` e `&` existem nas DUAS posições (binária e unária) — a
        // família vem do CONTEXTO do nó: em `unary_expression` são unários.
        const familia =
          no.type === 'unary_expression'
            ? (OP_UNARY.has(filho.type) ? 'unary' : null)
            : familiaDoOperador(filho.type);
        if (familia !== null) {
          sinteticos.push(this.marcador('Op', this.posDe(filho), {
            operator: filho.type,
            operatorFamily: familia,
          }));
        }
      }
    }
    // `&x` é `reference_expression` (nó PRÓPRIO), mas o borrow como EVENTO de
    // currículo fica no eixo `op:` — `op:unary:&`, como `*` (deref).
    if (no.type === 'reference_expression') {
      sinteticos.push(this.marcador('Op', pos, { operator: '&', operatorFamily: 'unary' }));
    }

    // ── `&mut T` × `&T` — a distinção que o tipo do nó colapsa ───────────
    // (reference_type com mutable_specifier) → nó sintético, o análogo do
    // `Elif` de Python.
    if (no.type === 'reference_type' && this.noContem(no, 'mutable_specifier')) {
      sinteticos.push(this.marcador('MutableReference', pos));
    }

    // ── `else if` × `else { }` — o análogo do `Elif` de Python ───────────
    if (no.type === 'else_clause') {
      for (let i = 0; i < no.childCount; i += 1) {
        const filho = no.child(i);
        if (filho !== null && filho.type === 'if_expression') {
          sinteticos.push(this.marcador('ElseIf', this.posDe(filho)));
        }
      }
    }

    // ── macros do prelude → `api:<nome>!` ────────────────────────────────
    // Macros LOCAIS (macro_rules! do próprio arquivo) não emitem — conteúdo.
    // DENTRO do token_tree a árvore de expressão NÃO EXISTE (tudo é token) —
    // e é exatamente ali que mora o ARGUMENTO do teste (`assert_eq!(dobro(-3),
    // -6)`). Por dois motivos este é o lugar mais importante do emissor:
    //
    //   1. OS ARGUMENTOS (`MacroArg`) — um nó sintético POR argumento
    //      top-level, com o TEXTO-FONTE dele. É o que `requirements.ts` e
    //      `minimalRust.ts` leem (o análogo dos argumentos posicionais do
    //      `ast.Call` de Python).
    //   2. OS OPERADORES (`Op`) — o análogo do ARGUMENTO de Python
    //      (`dobro(-3)` → `op:unary:-`): o conteúdo do assert entra no
    //      orçamento, e a semente NÃO o perdoa (a fronteira é medida por
    //      teste).
    if (no.type === 'macro_invocation') {
      const nome = no.childCount > 0 && no.child(0) !== null ? no.child(0).text : '';
      const nomeLimpo = nome.endsWith('!') ? nome.slice(0, -1) : nome;
      attrs.name = nomeLimpo;
      if (MACROS_PRELUDE.has(nomeLimpo)) {
        sinteticos.push(this.marcador('ApiRef', pos, { apiPath: `${nomeLimpo}!` }));
      }
      const arvore = this.filhoPorTipo(no, 'token_tree');
      if (arvore !== null) {
        // OS ARGUMENTOS top-level (vírgulas anônimas dividem os grupos).
        let grupo = [];
        const grupos = [grupo];
        for (let i = 0; i < arvore.childCount; i += 1) {
          const filho = arvore.child(i);
          if (filho === null) continue;
          if (!filho.isNamed && filho.type === ',') {
            grupo = [];
            grupos.push(grupo);
          } else {
            grupo.push(filho);
          }
        }
        let indice = 0;
        for (const g of grupos) {
          const nomeados = g.filter((c) => c.isNamed || !['(', ')', '[', ']'].includes(c.type));
          if (nomeados.length === 0) continue;
          const ini = nomeados[0].startIndex;
          const fim = nomeados[nomeados.length - 1].endIndex;
          const posArg = {
            line: 1, column: 1, // recalculado abaixo por startIndex
            start: ini, end: Math.max(ini, fim),
          };
          const p = this.posDe(nomeados[0]);
          posArg.line = p.line;
          posArg.column = p.column;
          sinteticos.push(this.marcador('MacroArg', posArg, {
            argIndex: indice,
            argText: this.src.slice(ini, fim).trim(),
          }));
          indice += 1;
        }
        // OS OPERADORES dentro do token_tree — qualquer profundidade, MENOS
        // dentro de macro_invocation aninhada (que se emite no próprio passe).
        const varrerOperadores = (n, anterior) => {
          for (let i = 0; i < n.childCount; i += 1) {
            const filho = n.child(i);
            if (filho === null) continue;
            if (!filho.isNamed) {
              const familia = familiaDeTokenEmArvore(filho.type, anterior);
              if (familia !== null) {
                sinteticos.push(this.marcador('Op', this.posDe(filho), {
                  operator: filho.type,
                  operatorFamily: familia,
                }));
              }
              varrerOperadores(filho, filho.type);
            } else if (filho.type !== 'macro_invocation') {
              varrerOperadores(filho, anterior);
            }
          }
        };
        varrerOperadores(arvore, null);
      }
    }

    // ── atributos → `api:` (derive um por trait; um argumento identificador
    // vira `api:<caminho>.<arg>`; sem argumento, `api:<caminho>`) ─────────
    if (no.type === 'attribute') {
      let caminho = null;
      const args = [];
      for (let i = 0; i < no.childCount; i += 1) {
        const filho = no.child(i);
        if (filho === null) continue;
        if (filho.type === 'identifier' || filho.type === 'scoped_identifier') {
          if (caminho === null) caminho = filho.text;
        }
        if (filho.type === 'token_tree') {
          for (let j = 0; j < filho.childCount; j += 1) {
            const arg = filho.child(j);
            if (arg !== null && arg.isNamed) args.push(arg);
          }
        }
      }
      if (caminho !== null) {
        if (caminho === 'derive') {
          for (const arg of args) {
            if (arg.type === 'identifier' || arg.type === 'scoped_identifier') {
              sinteticos.push(this.marcador('ApiRef', pos, { apiPath: `derive.${arg.text}` }));
            }
          }
        } else if (args.length === 1 && args[0].type === 'identifier') {
          sinteticos.push(this.marcador('ApiRef', pos, { apiPath: `${caminho}.${args[0].text}` }));
        } else if (args.length === 0) {
          sinteticos.push(this.marcador('ApiRef', pos, { apiPath: caminho }));
        } else {
          // `allow(dead_code)`, `cfg(feature = "x")`: argumento composto —
          // fail-soft, só o caminho (nada de inventar chave que não é aula).
          sinteticos.push(this.marcador('ApiRef', pos, { apiPath: caminho }));
        }
      }
    }

    // ── `use` — DECLARA os nomes importados. O `api:` do caminho completo é
    // emitido pelo scoped_identifier interno (raiz global → caminho cheio;
    // raiz `desafio`/`crate` → nada, o módulo do aluno não é API). Os
    // atributos `useRoot`/`imports` são o que o sintetizador e a derivação de
    // requirements leem (o análogo do `attributes.module` do `ImportFrom`). ─
    if (no.type === 'use_declaration') {
      const importados = this.nomesImportadosDe(no);
      attrs.useRoot = this.raizDoUse(no);
      attrs.imports = importados.join(',');
      for (const nome of importados) {
        this.declara(nome);
        this.importados.add(nome);
      }
    }

    // ── PROIBIÇÃO GLOBAL portada para o emissor: `extern "C" { … }`
    // (`foreign_mod_item`) declara símbolo externo — indecidível. ─────────
    if (no.type === 'foreign_mod_item') {
      sinteticos.push(this.marcador('ForeignMod', pos));
    }

    // ── a recursão: só filhos NOMEADOS. Tokens anônimos (operadores,
    // pontuação, palavras-chave) não são nós — é por isso que um `// fn f`
    // comentado não conta, como no lado Python/JavaScript. ────────────────
    // BLOCOS empilham escopo (let é por bloco). ATENÇÃO: os wrappers de nó do
    // tree-sitter NÃO são estáveis entre chamadas (`node.child(i)` devolve um
    // objeto NOVO a cada acesso) — por isso o skip de filhos já visitados é
    // por ÍNDICE, nunca por identidade de objeto.
    const empilhou = no.type === 'block' || no.type === 'declaration_list' ||
      no.type === 'enum_variant_list' || no.type === 'field_declaration_list';
    if (empilhou) this.escopos.push(new Set());
    try {
      // Índices dos filhos que o caso especial de função já visitou.
      let idxParams = -1;
      let idxCorpo = -1;
      if (no.type === 'function_item' || no.type === 'function_signature_item') {
        const nome = this.primeiroIdentificador(no, 'identifier');
        if (nome !== null) attrs.name = nome; // já declarado no pré-pass (hoisted)
        // `#[test] fn …` — o irmão ANTERIOR (ou a cadeia de atributos que o
        // precede) é o que o `cargo test` coleta. É o lado DECLARADO da
        // dupla-igualdade (`rsCountDeclared`), por AST: um `// #[test]`
        // comentado não é nó e não conta. A marcação vem do PAI
        // (`marcadoTeste`), porque é ele quem conhece os irmãos.
        if (marcadoTeste) attrs.test = 'true';
        for (let i = 0; i < no.childCount; i += 1) {
          const filho = no.child(i);
          if (filho === null) continue;
          if (filho.type === 'parameters' && idxParams === -1) idxParams = i;
          if (filho.type === 'block') idxCorpo = i; // o ÚLTIMO block é o corpo
        }
        if (idxParams !== -1) {
          for (const nomeParam of this.nomesLigadosEm(no.child(idxParams))) this.declara(nomeParam);
        }
      }
      for (let i = 0; i < no.childCount; i += 1) {
        const filho = no.child(i);
        if (filho === null || !filho.isNamed) continue;
        if (i === idxParams) {
          // parâmetros ligam nomes no escopo do item (antes de o corpo
          // empilhar o próprio) e são visitados UMA vez, no lugar deles.
          for (const nomeParam of this.nomesLigadosEm(filho)) this.declara(nomeParam);
          filhos.push(this.visitar(filho, emAtributo, this.marcadoTeste(no, i)));
          continue;
        }
        // Padrões de `let` e `for` ligam nomes — mas SÓ o padrão (a parte
        // antes de `=` / de `in`), nunca o inicializador.
        if (no.type === 'let_declaration' && this.antesDe(no, i, '=')) {
          for (const nome of this.nomesLigadosEm(filho)) this.declara(nome);
        }
        if (no.type === 'for_expression' && this.antesDe(no, i, 'in')) {
          for (const nome of this.nomesLigadosEm(filho)) this.declara(nome);
        }
        filhos.push(this.visitar(filho, emAtributo || no.type === 'attribute', this.marcadoTeste(no, i)));
      }
    } finally {
      if (empilhou) this.escopos.pop();
    }

    // ── `global:` — referência LIVRE a um nome do prelude, em posição de
    // VALOR. Identificador já declarado (local/item) resolve e não emite.
    // DENTRO DE ATRIBUTO não emite: os nomes de `#[derive(Debug, Clone)]` são
    // TRAITS, não referências de valor (já saíram como `api:derive.Debug`) ──
    if (no.type === 'identifier' && !emAtributo) {
      if (this.resolve(no.text) === 'livre' && GLOBALS_RUST.has(no.text)) {
        sinteticos.push(this.marcador('GlobalRef', pos, { globalName: no.text }));
      }
    }

    // ── `api:` — cadeias de caminho e de campo, em posição de expressão ───
    if (no.type === 'scoped_identifier' || no.type === 'field_expression' ||
        no.type === 'scoped_type_identifier') {
      if (no.type === 'scoped_type_identifier') {
        // caminho de tipo qualificado (`std::vec::Vec<i32>`): o texto É a API
        sinteticos.push(this.marcador('ApiRef', pos, { apiPath: no.text }));
      } else {
        const partes = this.partesDaCadeia(no);
        let raiz = partes.length > 0 ? partes[0] : null;
        let raizLiteral = null;
        if (no.type === 'field_expression') {
          const receptor = this.primeiroReceptor(no);
          if (receptor !== null && receptor.type !== 'identifier' &&
              receptor.type !== 'field_expression') {
            raizLiteral = this.tipoDeLiteral(receptor);
            raiz = raizLiteral;
          } else if (receptor !== null && receptor.type === 'field_expression') {
            // `a.b.c()`: receptor é cadeia — a recursão dos filhos já emite o
            // elo interno; este elo usa a raiz da cadeia inteira.
            raiz = this.partesDaCadeia(receptor)[0] ?? null;
          }
        }
        const api = this.chaveApi(raiz, partes, raizLiteral);
        if (api !== null) sinteticos.push(this.marcador('ApiRef', pos, { apiPath: api }));
      }
    }

    filhos.push(...sinteticos);
    return this.no(tipo, pos, attrs, filhos);
  }

  // ---- helpers estruturais ------------------------------------------------

  noContem(no, tipo) {
    for (let i = 0; i < no.childCount; i += 1) {
      const filho = no.child(i);
      if (filho === null) continue;
      if (filho.type === tipo) return true;
    }
    return false;
  }

  filhoPorTipo(no, tipo) {
    for (let i = 0; i < no.childCount; i += 1) {
      const filho = no.child(i);
      if (filho !== null && filho.type === tipo) return filho;
    }
    return null;
  }

  primeiroIdentificador(no, tipo = 'identifier') {
    for (let i = 0; i < no.childCount; i += 1) {
      const filho = no.child(i);
      if (filho !== null && filho.type === tipo) return filho.text;
    }
    return null;
  }

  /** `true` quando o filho de ÍNDICE `idx` vem ANTES do primeiro token
   * anônimo `token` entre os filhos de `no` (o padrão de um `let x = …` vem
   * antes do `=`; o de um `for x in …` vem antes do `in`). */
  antesDe(no, idx, token) {
    for (let i = 0; i < no.childCount && i < idx; i += 1) {
      const filho = no.child(i);
      if (filho === null) continue;
      if (!filho.isNamed && filho.type === token) return false;
    }
    return true;
  }

  /** O PRIMEIRO filho de expressão de um `field_expression` (o receptor). */
  primeiroReceptor(no) {
    for (let i = 0; i < no.childCount; i += 1) {
      const filho = no.child(i);
      if (filho === null || !filho.isNamed) continue;
      return filho;
    }
    return null;
  }

  /** `true` quando o filho de índice `idx` de `no` é um item de função
   * precedido de `#[test]` (ou de uma CADEIA de atributos em que o `test`
   * aparece — `#[test] #[should_panic] fn …`). É a detecção do PAI, porque é
   * ele quem conhece os irmãos. */
  marcadoTeste(no, idx) {
    const alvo = no.child(idx);
    if (alvo === null || (alvo.type !== 'function_item' && alvo.type !== 'function_signature_item')) {
      return false;
    }
    for (let i = idx - 1; i >= 0; i -= 1) {
      const irmão = no.child(i);
      if (irmão === null || !irmão.isNamed) continue;
      if (irmão.type === 'attribute_item') {
        if (this.caminhoDoAtributo(irmão) === 'test') return true;
        continue; // `#[cfg(x)]` antes de `#[test]`: continua procurando
      }
      return false; // qualquer outro irmão quebra a cadeia
    }
    return false;
  }

  /** O caminho de um `attribute_item` (`#[test]` → `test`; `#[cfg(test)]` →
   * `cfg`) — ou `null`. */
  caminhoDoAtributo(itemAtributo) {
    for (let i = 0; i < itemAtributo.childCount; i += 1) {
      const filho = itemAtributo.child(i);
      if (filho === null) continue;
      if (filho.type === 'attribute') {
        for (let j = 0; j < filho.childCount; j += 1) {
          const parte = filho.child(j);
          if (parte !== null && (parte.type === 'identifier' || parte.type === 'scoped_identifier')) {
            return parte.text;
          }
        }
      }
    }
    return null;
  }

  /** O primeiro segmento do caminho de um `use_declaration`
   * (`use std::io::stdout;` → `std`; `use desafio::{a, b};` → `desafio`). */
  raizDoUse(no) {
    for (let i = 0; i < no.childCount; i += 1) {
      const filho = no.child(i);
      if (filho === null || !filho.isNamed) continue;
      if (filho.type === 'scoped_identifier' || filho.type === 'scoped_type_identifier') {
        return filho.text.split('::')[0];
      }
      if (filho.type === 'scoped_use_list') {
        for (let j = 0; j < filho.childCount; j += 1) {
          const interno = filho.child(j);
          if (interno !== null && (interno.type === 'scoped_identifier' || interno.type === 'identifier' || interno.type === 'self')) {
            return interno.text.split('::')[0];
          }
        }
      }
      if (filho.type === 'identifier' || filho.type === 'self') return filho.text;
    }
    return null;
  }

  /** Os nomes LIGADOS por um padrão/parâmetro (`x`, `mut x`, `ref x`, tupla
   * `(a, b)`, `_` excluído). NÃO desce em tipos nem em inicializadores:
   * `let x: Vec<i32> = v;` liga `x`, não `Vec` nem `i32` nem `v`. */
  nomesLigadosEm(no) {
    const out = [];
    const tipoParada = new Set(['primitive_type', 'type_identifier', 'generic_type',
      'scoped_type_identifier', 'reference_type', 'tuple_type', 'function_type',
      'array_type', 'unit_type', 'block', 'expression_statement', 'where_clause']);
    const coletar = (n, fundo = false) => {
      if (n === null || !n.isNamed) return;
      if (n.type === 'identifier') {
        if (n.text !== '_') out.push(n.text);
        return;
      }
      if (n.type === 'self' || n.type === 'self_parameter' || n.type === 'mutable_specifier') return;
      if (!fundo && tipoParada.has(n.type)) return;
      for (let i = 0; i < n.childCount; i += 1) {
        coletar(n.child(i), fundo);
      }
    };
    coletar(no, no.type === 'closure_parameters');
    return [...new Set(out)];
  }

  /** Os nomes IMPORTADOS por um `use_declaration` (simples, lista, alias —
   * glob (`use std::io::*;`) não nomeia nada específico; `use a::{self, B}`
   * liga `a` (o `self`) e `B`). */
  nomesImportadosDe(no) {
    const out = [];
    const ultimoDe = (texto) => {
      const partes = texto.split('::');
      return partes[partes.length - 1];
    };
    const nomeados = (n) => {
      const itens = [];
      for (let i = 0; i < n.childCount; i += 1) {
        const filho = n.child(i);
        if (filho !== null && filho.isNamed) itens.push(filho);
      }
      return itens;
    };
    // Um use_list `{a, b as c, self}`: devolve os nomes ligados; `self` liga
    // a RAIZ do caminho que o precede (passada por `raizSelf`).
    const coletarLista = (lista, raizSelf) => {
      for (const filho of nomeados(lista)) {
        switch (filho.type) {
          case 'identifier': out.push(filho.text); break;
          case 'scoped_identifier':
          case 'scoped_type_identifier': out.push(ultimoDe(filho.text)); break;
          case 'self': if (raizSelf !== null) out.push(raizSelf); break;
          case 'use_as_clause': {
            let alias = null;
            for (const parte of nomeados(filho)) {
              if (parte.type === 'identifier' || parte.type === 'self') alias = parte.text;
            }
            if (alias !== null) out.push(alias);
            break;
          }
          case 'use_list':
          case 'nested_use_list':
            coletarLista(filho, null);
            break;
          default: break; // glob: nada específico
        }
      }
    };
    for (const filho of nomeados(no)) {
      switch (filho.type) {
        case 'scoped_identifier':
        case 'scoped_type_identifier':
          out.push(ultimoDe(filho.text));
          break;
        case 'identifier': out.push(filho.text); break;
        case 'self': out.push('self'); break;
        case 'scoped_use_list': {
          // `use caminho::{…}` — o caminho (scoped_identifier) é o MÓDULO;
          // só a lista liga nomes (e o `self` dela liga a raiz do caminho).
          let raiz = null;
          let lista = null;
          for (const interno of nomeados(filho)) {
            if (interno.type === 'scoped_identifier' || interno.type === 'scoped_type_identifier') {
              raiz = ultimoDe(interno.text);
            } else if (interno.type === 'use_list' || interno.type === 'nested_use_list') {
              lista = interno;
            }
          }
          if (lista !== null) coletarLista(lista, raiz);
          else if (raiz !== null) out.push(raiz);
          break;
        }
        case 'use_list':
        case 'nested_use_list':
          coletarLista(filho, null);
          break;
        case 'use_as_clause': {
          let alias = null;
          for (const parte of nomeados(filho)) {
            if (parte.type === 'identifier' || parte.type === 'self') alias = parte.text;
          }
          if (alias !== null) out.push(alias);
          break;
        }
        default: break; // use_wildcard/asterisk: glob não nomeia nada específico
      }
    }
    return [...new Set(out.filter((n) => n && n !== '_'))];
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function acharErro(no) {
  if (no.type === 'ERROR') return no;
  for (let i = 0; i < no.childCount; i += 1) {
    const filho = no.child(i);
    if (filho === null) continue;
    const achado = acharErro(filho);
    if (achado !== null) return achado;
  }
  return null;
}

function acharMissing(no) {
  if (no.isMissing) return no;
  for (let i = 0; i < no.childCount; i += 1) {
    const filho = no.child(i);
    if (filho === null) continue;
    const achado = acharMissing(filho);
    if (achado !== null) return achado;
  }
  return null;
}

async function analisar(src, nomeArquivo) {
  await Parser.init();
  const linguagem = await Language.load(require.resolve('tree-sitter-rust/tree-sitter-rust.wasm'));
  const parser = new Parser();
  parser.setLanguage(linguagem);
  const tree = parser.parse(src);

  let versaoGramatica = null;
  try {
    versaoGramatica = require('tree-sitter-rust/package.json').version;
  } catch {
    versaoGramatica = null;
  }
  const versoes = { parser: 'web-tree-sitter', grammar: 'tree-sitter-rust', grammarVersion: versaoGramatica };

  if (tree.rootNode.hasError) {
    const erro = acharErro(tree.rootNode) ?? acharMissing(tree.rootNode);
    const alvo = erro ?? tree.rootNode;
    const posicao = alvo.startPosition;
    return {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message:
          `erro de sintaxe (${nomeArquivo}): ` +
          (alvo.isMissing
            ? `falta ${alvo.type}`
            : 'construção não reconhecida pelo parser — verifique a linha indicada'),
        line: posicao.row + 1,
        column: posicao.column + 1,
      },
    };
  }

  const emissor = new Emissor(src);

  // PRÉ-PASS — os ITENS do arquivo (hoisted) e os `use` (importados). Rust é
  // order-independent no nível de item: uma chamada a uma fn declarada DEPOIS
  // não é referência livre. É o que separa 'item' de 'livre'.
  (function preItens(n) {
    if (n.type === 'function_item' || n.type === 'function_signature_item' ||
        n.type === 'struct_item' || n.type === 'enum_item' || n.type === 'trait_item' ||
        n.type === 'mod_item' || n.type === 'type_item' || n.type === 'union_item' ||
        n.type === 'const_item' || n.type === 'static_item' || n.type === 'macro_definition') {
      const nome = emissor.primeiroIdentificador(
        n,
        (n.type === 'struct_item' || n.type === 'enum_item' || n.type === 'trait_item' ||
          n.type === 'mod_item' || n.type === 'type_item' || n.type === 'union_item')
          ? 'type_identifier' : 'identifier',
      );
      if (nome !== null) emissor.itensDoArquivo.add(nome);
    }
    if (n.type === 'use_declaration') {
      for (const nome of emissor.nomesImportadosDe(n)) {
        emissor.itensDoArquivo.add(nome);
        emissor.importados.add(nome);
      }
    }
    for (let i = 0; i < n.childCount; i += 1) {
      const filho = n.child(i);
      if (filho !== null && filho.isNamed) preItens(filho);
    }
  })(tree.rootNode);

  for (const nome of emissor.itensDoArquivo) emissor.declarados.add(nome);
  for (const nome of emissor.importados) emissor.declarados.add(nome);

  const raizPos = emissor.posDe(tree.rootNode);
  const raiz = emissor.no('SourceFile', { ...raizPos, end: src.length }, {}, []);
  for (let i = 0; i < tree.rootNode.childCount; i += 1) {
    const filho = tree.rootNode.child(i);
    if (filho === null || !filho.isNamed) continue;
    raiz.children.push(emissor.visitar(filho, false, emissor.marcadoTeste(tree.rootNode, i)));
  }
  raiz.text = src;

  // `free` — identificadores em posição de valor que não resolveram em escopo
  // nenhum. Todo GlobalRef é livre; há livres que NÃO são globais (o crate do
  // aluno, módulos externos sem `use`) — o orçamento os vê como `free` sem
  // eixo `global:`.
  const livres = new Set();
  (function coletarLivres(n) {
    if (n.type === 'identifier') {
      if (emissor.resolve(n.text) === 'livre') livres.add(n.text);
    }
    for (const filho of n.children) coletarLivres(filho);
  })(raiz);

  return {
    ok: true,
    rust: versoes,
    root: raiz,
    scopes: {
      declared: [...emissor.declarados].sort(),
      imported: [...emissor.importados].sort(),
      free: [...livres].sort(),
    },
    globalsRust: [...GLOBALS_RUST].sort(),
  };
}

async function main() {
  const bytes = await new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
    process.stdin.on('error', reject);
  });
  let resultado;
  try {
    const src = bytes.toString('utf8');
    const nome = process.argv[2] ?? '<trecho>';
    resultado = await analisar(src, nome);
  } catch (err) {
    resultado = {
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: `falha do extrator de Rust: ${err instanceof Error ? err.message : String(err)}`,
        line: 1,
        column: 1,
      },
    };
  }
  process.stdout.write(JSON.stringify(resultado));
}

await main();
