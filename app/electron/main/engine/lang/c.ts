/**
 * app/electron/main/engine/lang/c.ts — O ADAPTADOR DE C.
 *
 * A QUARTA linha da tabela do §6 de
 * `docs/research/08-multilingua-trava-deterministica.md` (linhas 866-891) e a
 * primeira da família "toolchain emite AST" (§7 item 3 chamou isso de o
 * padrão que desbloqueia Go, C# e o resto do Tier B). O modelo é o
 * `lang/python.ts`: `parse` é SÍNCRONO, por SUBPROCESSO e MEMOIZADO por
 * fonte — mas o emissor da árvore aqui é o COMPILADOR:
 *
 *     clang -std=c11 -fsyntax-only -Xclang -ast-dump=json <arquivo temp>
 *       → python3 vocab/c/extract_ast.py <arquivo temp>   (JSON do clang no stdin)
 *       → a árvore normalizada `LangNode` no stdout
 *
 * Fonte NORMATIVA de operação: `skills/study-method/references/languages.md`
 * §3.1 — a linha C MEDIDA nesta máquina: `cc -std=c11 -g … -o runner -lm &&
 * ./runner`. O PROTOCOLO DE TESTE, porém, NÃO é o dessa linha histórica: o
 * repositório DECIDIU que o teste de desafio C é o **counter_protocol**
 * (`docs/build-spec/blocks/03-tdd.md` §3.9.3, OBRIGATÓRIO — `assert.h`
 * aborta no primeiro erro e o símbolo de abort é interponível; ver o bloco
 * "A CONVENÇÃO DE TESTE C DO DESAFIO" abaixo), e os exits são NORMALIZADOS
 * 0/1 com `EXIT_BRUTO`/`DECORRIDO_MS` no stdout (D-V11, `languages.md` :374).
 * A linha de compilação é PORTADA de lá; o protocolo de teste NÃO é.
 *
 * ─── AS SETE DECISÕES DESTE ARQUIVO ───────────────────────────────────────
 *
 * 1. O PARSE EXIGE CLANG. O `-ast-dump=json` é uma extensão do clang (o gcc
 *    não a tem; medido: `gcc -Xclang` falha na primeira flag). O RUNNER aceita
 *    qualquer compilador (`cc` → `gcc` → `clang`, a ordem de `cDetect` e a
 *    mesma que o `run.sh` gerado re-probe); o PARSE não — é clang ou nada,
 *    e a degradação DIZ isso (membro 15).
 *
 * 2. O FONTE VAI A ARQUIVO TEMP, NUNCA STDIN. O `-ast-dump=json` do clang não
 *    lê fonte da entrada padrão (medido nesta máquina). `pyParse` manda o
 *    fonte pelo stdin; aqui não existe essa opção — o temp é gravado, usado
 *    nos dois subprocessos (clang e o helper python3) e removido no fim.
 *
 * 3. O EIXO `decl:` É REPROPOSTO COMO NO PYTHON. C TEM palavra-chave de
 *    declaração, mas a didática mora na FORMA: `decl:func` (definição de
 *    função) e `decl:var` (declaração de variável) são os dois eventos de
 *    currículo; o parâmetro (`ParmVarDecl`) fica no eixo `node:` — é
 *    estrutura de toda função, não aula própria.
 *
 * 4. LITERAIS NÃO GANHAM EIXO `lit:`. O §6 exemplifica `lit:<tipo>`, mas o
 *    alfabeto do repositório (`atomKeys.ts:120`, `ATOM_KEY_RE`) reconhece
 *    sete eixos e `lit` não é um deles — uma chave `lit:int` falharia na
 *    validação e nunca chegaria ao gate. O precedente do Python resolve:
 *    o literal é DISTINÇÃO DE NÓ (`node:IntegerLiteral`,
 *    `node:FloatingLiteral`, `node:CharacterLiteral`, `node:StringLiteral`)
 *    — e no clang a distinção é DE GRAÇA (são kinds diferentes, ao contrário
 *    do `ast.Constant` do CPython, que precisou de refinamento sintético).
 *
 * 5. `#include` VIRA CHAVE PRÓPRIA (`node:IncludeDirective`). O clang NÃO
 *    emite nó para a diretiva (o preprocessor a consome antes do Sema) —
 *    deixá-la "não-analisável" faria a aula 1 de C ("o que é #include e por
 *    que ele vem antes") introduzir ZERO construção nova, a violação A6
 *    exata que o refinamento do Python fechou. A diretiva é lida do FONTE
 *    (regex ancorado na margem) e vira nó PORTADOR sintético com linha e
 *    coluna próprias — o precedente é `node:Elif`/`node:MethodDef`.
 *
 * 6. AS QUATRO DISTINÇÕES QUE O CLANG COLAPSA VIRAM NÓS SINTÉTICOS:
 *    `ApiRef` (chamada a função de biblioteca → `api:printf`; a função do
 *    PRÓPRIO arquivo não é API — o mesmo partido do `from solucao import X`,
 *    que não emite `api:`), `GlobalRef` (referência livre a stdin/stdout/
 *    stderr → `global:stdout`, detectada pelo TEXTO e não pelo nome
 *    resolvido — no macOS `stdout` é macro para `__stdoutp`),
 *    `IncludeDirective` (decisão 5) e `IndirectCall` (chamada por ponteiro
 *    de função → a proibição global de C).
 *
 * 7. O LIMITE DE SEGURANÇA DO EXIT-GUARD TEM OUTRA FORMA EM C. Não existe
 *    `--require` nem monkey-patch: a defesa é ESTRUTURAL e mora no `run.sh`
 *    gerado pelo `layout()` — ver o bloco "O RELATÓRIO FORA DO ALCANCE DO
 *    CÓDIGO DO ALUNO" antes de `SM_RUNNER_SCRIPT`. Está escrito no código de
 *    propósito: limite escondido é pior que limite nenhum.
 */

import type {
  ChallengeLanguageToken,
  ChallengeLayout,
  ChallengeLayoutInput,
  DetectResult,
  EnvScrubPolicy,
  FailurePolicy,
  LangNode,
  LanguageAdapter,
  ParseOk,
  ParseOptions,
  ParseResult,
  RunCheck,
  RunCounts,
  ScopeResolution,
} from './registry';

// NOTA DE CICLO (a mesma de `javascript.ts:86-90`): o import acima é
// `import type` e TEM de continuar sendo. `registry.ts` importa o VALOR
// `cAdapter` daqui; um import de valor na volta fecharia o ciclo em tempo de
// AVALIAÇÃO. Import de tipo é apagado na compilação — não existe em runtime.

// ---------------------------------------------------------------------------
// Módulos carregados sob demanda (o mesmo padrão de `lang/python.ts:86-94`)
// ---------------------------------------------------------------------------

type ChildProcessModule = typeof import('node:child_process');
type FsModule = typeof import('node:fs');
type OsModule = typeof import('node:os');
type PathModule = typeof import('node:path');
type UrlModule = typeof import('node:url');

function carregar<T>(modulo: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(modulo) as T;
}

// ---------------------------------------------------------------------------
// Onde mora o extrator (`vocab/c/extract_ast.py`) — o mesmo resolvedor do py
// ---------------------------------------------------------------------------

let dirModuloMemo: string | null = null;

/** O diretório DESTE módulo — a âncora de todo caminho relativo abaixo. */
function dirModulo(): string {
  if (dirModuloMemo === null) {
    const path = carregar<PathModule>('node:path');
    const { fileURLToPath } = carregar<UrlModule>('node:url');
    dirModuloMemo = path.dirname(fileURLToPath(import.meta.url));
  }
  return dirModuloMemo;
}

/**
 * Resolve um artefato entre candidatos, na ordem — MESMA topologia do
 * `lang/python.ts:123-138` (env → fonte → bundle achatado → raiz do repo).
 * A variável de ambiente vem primeiro porque é ela que conserta a instalação
 * sem recompilar nada quando o `.py` não for empacotado no build.
 */
function resolverArtefato(relDoVocab: string, envVar: string): string | null {
  const path = carregar<PathModule>('node:path');
  const fs = carregar<FsModule>('node:fs');
  const dir = dirModulo();
  const candidatos = [
    process.env[envVar],
    path.join(dir, '..', 'vocab', relDoVocab),
    path.join(dir, 'vocab', relDoVocab),
    path.join(process.cwd(), 'electron', 'main', 'engine', 'vocab', relDoVocab),
    path.join(process.cwd(), 'app', 'electron', 'main', 'engine', 'vocab', relDoVocab),
  ];
  for (const candidato of candidatos) {
    if (candidato && fs.existsSync(candidato)) return candidato;
  }
  return null;
}

/** Caminho do extrator (`vocab/c/extract_ast.py`). */
export function cExtractorPath(): string | null {
  return resolverArtefato(carregar<PathModule>('node:path').join('c', 'extract_ast.py'), 'STUDY_METHOD_C_EXTRACTOR');
}

// ---------------------------------------------------------------------------
// (15) detect() — o compilador, o clang, o python3 do extrator — e a degradação
// ---------------------------------------------------------------------------

/**
 * Os binários candidatos de COMPILAÇÃO, na ordem de tentativa — a ordem da
 * linha C medida (`languages.md` §3.1 usa `cc`). `cc` primeiro porque é o
 * nome canônico do compilador do sistema em todo Unix (no macOS é o clang,
 * no Linux costuma ser symlink do gcc).
 */
export const C_BINARIOS_RUNNER: readonly string[] = ['cc', 'gcc', 'clang'];

/** O binário que o PARSE exige — decisão 1 no cabeçalho. */
export const C_PARSE_COMPILER = 'clang';

/**
 * O binário do HELPER de extração (`vocab/c/extract_ast.py` é um subprocesso
 * python3, como o do adaptador Python). Mesma rede de proteção do py: o nome
 * canônico primeiro, o genérico depois.
 */
export const C_PY_BINARIOS: readonly string[] = ['python3', 'python'];

/**
 * O binário que o spawn do runner EXECUTA. O comando de teste de C compila E
 * roda (`cc … && ./runner`), e um único spawn só executa UM programa — por
 * isso o layout gera o `run.sh` (que faz os dois) e o binário do spawn é o
 * shell que o interpreta. `sh` (POSIX) e não `bash`: existe em toda máquina
 * onde há um compilador C, sem depender da versão 3.2 do macOS.
 */
export const C_RUNNER_BINARY = 'sh';

/** `Apple clang version 17.0.0 …` → `17.0.0`. Aceita stdout OU stderr. */
function versaoDoTexto(texto: string): string | null {
  const m = /version\s+(\d+(?:\.\d+)+)/.exec(texto);
  return m ? m[1] : null;
}

/** O estado das ferramentas — sondado UMA vez, consumido por detect() e parse(). */
interface Ferramentas {
  /** o compilador de PROVA (primeiro de `C_BINARIOS_RUNNER` que responde). */
  compilador: string | null;
  /** o binário do clang (a Porta 1 exige — decisão 1). */
  clang: string | null;
  /** o binário do helper python3. */
  python: string | null;
}

let ferramentasMemo: Ferramentas | null = null;

function sondar(binario: string): { ok: boolean; versao: string | null } {
  const { spawnSync } = carregar<ChildProcessModule>('node:child_process');
  try {
    const res = spawnSync(binario, ['--version'], { encoding: 'utf8', timeout: 10_000 });
    if (res.error || res.status !== 0) return { ok: false, versao: null };
    return { ok: true, versao: versaoDoTexto(`${res.stdout ?? ''}\n${res.stderr ?? ''}`) };
  } catch {
    return { ok: false, versao: null };
  }
}

/** Sonda a toolchain UMA vez e memoiza (`cResetDetectCache` reconstrói). */
function ferramentas(): Ferramentas {
  if (ferramentasMemo !== null) return ferramentasMemo;
  const estado: Ferramentas = { compilador: null, clang: null, python: null };
  for (const candidato of C_BINARIOS_RUNNER) {
    if (sondar(candidato).ok) {
      estado.compilador = candidato;
      break;
    }
  }
  if (sondar(C_PARSE_COMPILER).ok) estado.clang = C_PARSE_COMPILER;
  for (const candidato of C_PY_BINARIOS) {
    if (sondar(candidato).ok) {
      estado.python = candidato;
      break;
    }
  }
  ferramentasMemo = estado;
  return estado;
}

let detectMemo: DetectResult | null = null;

/**
 * Detecção da toolchain de C — `command -v` + versão, como o §6 pede, com a
 * mensagem de degradação dizendo EXATAMENTE o que deixou de funcionar:
 *   - sem compilador (cc/gcc/clang): as provas por execução NÃO rodam — o
 *     gate reprova por falta de prova, nunca aprova por omissão;
 *   - sem clang: o PARSE não roda (`-ast-dump=json` é do clang) — nem o
 *     ORÇAMENTO pode ser auditado; é degradação SEPARADA da de cima, porque
 *     as duas faltam por motivos diferentes (a de cima derruba a Porta 3, a
 *     de baixo a Porta 1);
 *   - sem python3 ou sem o extrator: a árvore normalizada não existe.
 *
 * `binary` é `C_RUNNER_BINARY` (`sh`) — o que o spawn do runner de fato
 * executa (`sh run.sh`); o compilador escolhido vai na `version` e é
 * re-probeado PELO PRÓPRIO `run.sh` com a mesma ordem.
 */
export function cDetect(): DetectResult {
  if (detectMemo !== null) return detectMemo;
  const ferr = ferramentas();
  const extrator = cExtractorPath();
  const avisos: string[] = [];

  if (ferr.compilador === null) {
    avisos.push(
      `nenhum compilador C encontrado no PATH (procurados: ${C_BINARIOS_RUNNER.join(', ')}) — ` +
        'as provas por execução de desafio C NÃO rodam e o gate reprova por falta de prova, nunca aprova por omissão',
    );
  }
  if (ferr.clang === null) {
    avisos.push(
      'clang não encontrado — o PARSE de C exige clang (o `-ast-dump=json` é uma extensão do clang; o gcc não a tem): ' +
        'sem ele não há Porta 1 para C — nenhum trecho é parseado e nenhum orçamento é auditado',
    );
  }
  if (ferr.python === null) {
    avisos.push(
      `nenhum python3 no PATH (procurados: ${C_PY_BINARIOS.join(', ')}) — o extrator ` +
        'vocab/c/extract_ast.py é um subprocesso python3 e sem ele a árvore normalizada não é produzida',
    );
  }
  if (extrator === null) {
    avisos.push(
      'vocab/c/extract_ast.py não encontrado — sem o extrator não há Porta 1 para C: ' +
        'nenhum trecho é parseado e nenhum orçamento é auditado (defina STUDY_METHOD_C_EXTRACTOR para apontar o arquivo)',
    );
  }

  const versaoCompilador = ferr.compilador === null ? null : sondar(ferr.compilador).versao;
  detectMemo = {
    ok: ferr.compilador !== null && ferr.clang !== null && ferr.python !== null && extrator !== null,
    binary: C_RUNNER_BINARY,
    version: versaoCompilador,
    degradacao: avisos.length > 0 ? avisos.join(' | ') : null,
  };
  return detectMemo;
}

/** Só para os testes: esquece a detecção memoizada. */
export function cResetDetectCache(): void {
  ferramentasMemo = null;
  detectMemo = null;
}

// ---------------------------------------------------------------------------
// (3)(4) inventory() / globals() / builtins()
// ---------------------------------------------------------------------------

/**
 * O enum FECHADO de tipos de nó: os kinds do clang que emergem na árvore
 * (`vocab/c/extract_ast.py`, tabela `_EMITIDOS` — tudo o que não está lá é
 * TRANSPARENTE: o nó derruba e os filhos sobem) MAIS os quatro portadores
 * sintéticos (decisões 5 e 6). Ordenado — determinismo do complemento.
 * É literal AQUI e tabela LÁ de propósito: o teste
 * `tests/engineLangC.test.ts` §"o inventário é fechado" compara os dois
 * sentidos (toda chave `node:` emitida está aqui; todo nome aqui é emitível).
 */
export function cInventory(): readonly string[] {
  return [
    'ApiRef',
    'ArraySubscriptExpr',
    'BinaryOperator',
    'BreakStmt',
    'CallExpr',
    'CharacterLiteral',
    'CompoundAssignOperator',
    'CompoundStmt',
    'ContinueStmt',
    'DeclRefExpr',
    'DeclStmt',
    'DoStmt',
    'FloatingLiteral',
    'ForStmt',
    'FunctionDecl',
    'GlobalRef',
    'IfStmt',
    'IncludeDirective',
    'IndirectCall',
    'InitListExpr',
    'IntegerLiteral',
    'ParmVarDecl',
    'ReturnStmt',
    'StringLiteral',
    'UnaryExprOrTypeTraitExpr',
    'UnaryOperator',
    'VarDecl',
    'WhileStmt',
  ];
}

let globaisMemo: ReadonlySet<string> | null = null;

/**
 * Os GLOBAIS de runtime de C. Em C não existe namespace global de funções —
 * o que existe de "global de runtime" que um programa iniciante nomeia sem
 * declarar são os TRÊS fluxos padrão (`stdin`/`stdout`/`stderr`, de
 * `<stdio.h>`). A detecção no extrator é pelo TEXTO (decisão 6): no macOS
 * `stdout` é macro para `__stdoutp` e o nome resolvido mudaria por
 * plataforma.
 */
export function cGlobals(): ReadonlySet<string> {
  if (globaisMemo === null) {
    globaisMemo = new Set<string>(['stdin', 'stdout', 'stderr']);
  }
  return globaisMemo;
}

/**
 * Os BUILTINS da LINGUAGEM: CONJUNTO VAZIO, e a ausência é informação. Em C
 * não há builtins fora da libc — `printf`/`scanf`/`strlen` são funções de
 * BIBLIOTECA (declaradas em headers), e o vocabulário delas é o eixo `api:`
 * (`api:printf`), não o de builtins. É o oposto do JavaScript (onde os dois
 * conjuntos coincidem) e do Python (onde `len`/`range` são builtins) — a
 * razão exata de o §6 listar `globals()`/`builtins()` com barra.
 */
export function cBuiltins(): ReadonlySet<string> {
  return new Set<string>();
}

// ---------------------------------------------------------------------------
// (1) parse(source) — a Porta 1 por SUBPROCESSO (clang → python3)
// ---------------------------------------------------------------------------

/** O que `vocab/c/extract_ast.py` devolve no stdout. */
interface NoBruto {
  type: string;
  line: number;
  column: number;
  start: number;
  end: number;
  text: string;
  attributes: Record<string, string>;
  children: NoBruto[];
  synthetic: boolean;
}

interface SaidaOk {
  ok: true;
  clangKind: string;
  root: NoBruto;
  scopes: { declared: string[]; imported: string[]; free: string[] };
}

interface SaidaErro {
  ok: false;
  error: { code: 'PARSE_ERROR'; message: string; line: number; column: number };
}

/** A árvore NATIVA que vai em `ParseOk.native` — o payload do subprocesso. */
export type CNative = SaidaOk;

/**
 * Flags FIXAS do clang ao invocar o parse (decisão 1: PARSE exige clang).
 *
 * `-fsyntax-only` NÃO emite binário. `-Xclang -ast-dump=json` pede o dump
 * JSON direto ao frontend. `-Wno-error=implicit-function-declaration`
 * DEVOLVE ao nível de warning a chamada a função não declarada — o clang 16+
 * a elevou a erro por default, e um trecho de teoria que usa `printf` sem
 * `#include <stdio.h>` PARSEARIA-ERROR inteiro por causa de um aviso que
 * não diz nada sobre a construção ensinada (a chave de `printf` sai pelo
 * `ApiRef` do `CallExpr`, não pela decl). Erro de VARIÁVEL não declarada
 * continua erro — e é certo: variável sem declaração é defeito real de C.
 */
export const C_PARSE_FLAGS: readonly string[] = [
  '-std=c11',
  '-fsyntax-only',
  '-Xclang',
  '-ast-dump=json',
  '-Wno-error=implicit-function-declaration',
];

/** Teto do memo de parse. Fonte de aula tem dezenas de linhas; 512 sobra. */
const CACHE_MAX = 512;
const CACHE_PARSE = new Map<string, ParseResult>();

/** Só para os testes: esvazia o memo de parse. */
export function cResetParseCache(): void {
  CACHE_PARSE.clear();
}

function normalizarNo(bruto: NoBruto): LangNode {
  return {
    type: bruto.type,
    line: bruto.line,
    column: bruto.column,
    start: bruto.start,
    end: bruto.end,
    text: bruto.text,
    attributes: bruto.attributes,
    children: bruto.children.map(normalizarNo),
    native: bruto,
    // O campo que diz à caminhada genérica que este nó é PORTADOR (`ApiRef`,
    // `GlobalRef`, `IncludeDirective`, `IndirectCall`) e que a chave genérica
    // `node:<type>` dele seria lixo fora do inventário. Ver
    // `LangNode.synthetic` em `registry.ts`.
    synthetic: bruto.synthetic,
  };
}

function erroDeParse(message: string, line = 1, column = 1): ParseResult {
  return { ok: false, error: { code: 'PARSE_ERROR', message, line, column } };
}

/**
 * O TETO DO PARSE E O RETRY DE CARGA (medido: com a suíte inteira rodando,
 * o spawnSync do parse já estourou ETIMEDOUT nos 30 s — ACHADO D da revisão).
 *
 * Duas defesas COMPLEMENTARES, e nenhuma viola a sincronia nem a memoização:
 *   1. o teto sobe de 30 s para 90 s por subprocesso (clang e helper python3
 *      têm cada um o seu) — sob carga da suíte, o parse real (~100 ms medido
 *      no §5) só perde quando a máquina está genuinamente asfixiada;
 *   2. UM retry DETERMINÍSTICO por subprocesso, e SÓ quando o erro é
 *      ETIMEDOUT. Determinístico por construção: mesmas entradas, mesmo
 *      comando, no máximo UMA repetição idêntica — nada de backoff, jitter
 *      ou estado. NÃO viola a memoização: o retry acontece ANTES do resultado
 *      entrar no `CACHE_PARSE` (o cache guarda o resultado FINAL, nunca um
 *      erro transitório de carga). E não viola a sincronia: `spawnSync`
 *      continua síncrono — o retry é só um segundo `spawnSync` na mesma
 *      chamada.
 */
const C_PARSE_TIMEOUT_MS = 90_000;

/** O código de erro de um resultado de spawnSync (ETIMEDOUT etc.). */
function codigoDeErroSpawn(res: { error?: Error | undefined }): string | undefined {
  return (res.error as NodeJS.ErrnoException | undefined)?.code;
}

/** Primeiro `arquivo:linha:coluna: error:` do stderr do clang (1-based). */
function erroDoDiagnostico(stderr: string): { message: string; line: number; column: number } | null {
  const m = /^\S+?:(\d+):(\d+):\s*error:\s*(.+)$/m.exec(stderr);
  if (!m) return null;
  return { message: m[3].trim(), line: Number(m[1]), column: Number(m[2]) };
}

/**
 * Parseia C invocando `clang -Xclang -ast-dump=json` sobre um ARQUIVO TEMP
 * (decisão 2) e entregando o JSON ao helper python3 (`vocab/c/extract_ast.py`
 * — decisão e armadilhas documentadas lá).
 *
 * FAIL-CLOSED em toda saída: fonte com erro (o clang SAI nonzero e a árvore
 * recuperada viria furada), clang/python/extrator ausente, timeout, stdout
 * que não é JSON — TUDO vira o MESMO `PARSE_ERROR` estruturado que
 * `extract.ts:344-357` já sabe tratar. Árvore parcial ou exceção solta seriam
 * as duas formas de o gate mentir.
 *
 * "PARSEIE TUDO, REPROVE NO ORÇAMENTO": o adaptador nunca restringe a
 * gramática — quem reprova é `budget.ts`.
 */
export function cParse(source: string, options: ParseOptions = {}): ParseResult {
  const fileName = options.fileName ?? 'trecho.c';
  const chave = `${fileName} ${source}`;
  const memo = CACHE_PARSE.get(chave);
  if (memo !== undefined) return memo;

  const resultado = cParseSemCache(source, fileName);
  if (CACHE_PARSE.size >= CACHE_MAX) {
    // FIFO simples — cache de build, não LRU de servidor (o mesmo do py).
    const primeira = CACHE_PARSE.keys().next();
    if (!primeira.done) CACHE_PARSE.delete(primeira.value);
  }
  CACHE_PARSE.set(chave, resultado);
  return resultado;
}

function cParseSemCache(source: string, fileName: string): ParseResult {
  const extrator = cExtractorPath();
  if (extrator === null) {
    return erroDeParse(
      'extrator C ausente: vocab/c/extract_ast.py não foi encontrado ' +
        '(defina STUDY_METHOD_C_EXTRACTOR para apontar o arquivo)',
    );
  }
  const ferr = ferramentas();
  if (ferr.clang === null) {
    return erroDeParse(
      'clang ausente: o parse de C exige clang (o `-ast-dump=json` é uma extensão do clang; o gcc não a tem)',
    );
  }
  if (ferr.python === null) {
    return erroDeParse(
      `python3 ausente: nenhum de ${C_PY_BINARIOS.join(', ')} respondeu a --version no PATH`,
    );
  }

  const fs = carregar<FsModule>('node:fs');
  const os = carregar<OsModule>('node:os');
  const path = carregar<PathModule>('node:path');
  const { spawnSync } = carregar<ChildProcessModule>('node:child_process');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-c-parse-'));
  try {
    // O nome do temp é o que aparece no diagnóstico do clang — um basename
    // .c (só letras seguras) mantém a mensagem limpa e o clang feliz.
    const fonteTemp = path.join(tempDir, 'fonte.c');
    fs.writeFileSync(fonteTemp, source, 'utf8');

    // Locais narrowed (ferr.clang/ferr.python são propriedades — o narrowing
    // do null-check acima não persiste dentro de closure).
    const binClang: string = ferr.clang;
    const binPython: string = ferr.python;

    const opcoesClang = {
      encoding: 'utf8' as const,
      // Timeout do PARSER, não do runner (o §5 mediu o parse do py em ~100 ms;
      // o teto de 90 s + retry é a tolerância à carga da suíte — ACHADO D).
      timeout: C_PARSE_TIMEOUT_MS,
      // Um TU com headers expande para JSON de centenas de KB.
      maxBuffer: 64 * 1024 * 1024,
      env: cApplyParseEnv(process.env),
    };
    const argsClang = [...C_PARSE_FLAGS, fonteTemp];
    let clang = spawnSync(binClang, argsClang, opcoesClang);
    if (codigoDeErroSpawn(clang) === 'ETIMEDOUT') {
      clang = spawnSync(binClang, argsClang, opcoesClang); // o ÚNICO retry determinístico
    }
    if (clang.error) {
      return erroDeParse(`falha ao executar ${ferr.clang}: ${clang.error.message}`);
    }
    if (clang.status !== 0) {
      const diag = erroDoDiagnostico(clang.stderr ?? '');
      const onde = diag === null ? '' : ` (${diag.line}:${diag.column})`;
      const mensagem = diag === null ? 'erro de sintaxe C' : diag.message;
      return erroDeParse(`clang reprovou o fonte${onde}: ${mensagem}`, diag?.line ?? 1, diag?.column ?? 1);
    }

    const opcoesHelper = {
      input: clang.stdout ?? '',
      encoding: 'utf8' as const,
      timeout: C_PARSE_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: cApplyParseEnv(process.env),
    };
    let helper = spawnSync(binPython, [extrator, fonteTemp], opcoesHelper);
    if (codigoDeErroSpawn(helper) === 'ETIMEDOUT') {
      helper = spawnSync(binPython, [extrator, fonteTemp], opcoesHelper); // o ÚNICO retry determinístico
    }
    if (helper.error) {
      return erroDeParse(`falha ao executar o extrator C: ${helper.error.message}`);
    }
    if (helper.status !== 0) {
      const stderr = (helper.stderr ?? '').trim();
      return erroDeParse(
        `o extrator C saiu com ${helper.status === null ? 'sinal ' + String(helper.signal) : 'exit ' + String(helper.status)}` +
          (stderr ? `: ${stderr.split('\n').slice(-3).join(' ')}` : ''),
      );
    }

    let payload: SaidaOk | SaidaErro;
    try {
      payload = JSON.parse(helper.stdout ?? '') as SaidaOk | SaidaErro;
    } catch {
      return erroDeParse(`saída do extrator C não é JSON: ${(helper.stdout ?? '').slice(0, 200)}`);
    }
    if (!payload.ok) {
      return { ok: false, error: { ...payload.error, code: 'PARSE_ERROR' } };
    }
    return { ok: true, root: normalizarNo(payload.root), source, native: payload };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * O ambiente dos subprocessos do PARSER. Mesma política de
 * `pyApplyParseEnv` (`lang/python.ts:486-498`): a Porta 1 é etapa de BUILD
 * determinística, e o ambiente do desenvolvedor não pode mudar o resultado
 * da análise. Os venenos de C (`CPATH`, `C_INCLUDE_PATH`, `LIBRARY_PATH`,
 * `DYLD_*`) entram via `C_ENV_SCRUB.strip` para o RUNNER; aqui vale a
 * allowlist estrita porque o parse não precisa de nada além de achar os
 * binários.
 */
export function cApplyParseEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const nome of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'PATHEXT']) {
    const valor = base[nome];
    if (valor !== undefined) env[nome] = valor;
  }
  env.LC_ALL = 'C.UTF-8';
  env.TZ = 'UTC';
  env.PYTHONIOENCODING = 'utf-8';
  env.PYTHONDONTWRITEBYTECODE = '1';
  return env;
}

// ---------------------------------------------------------------------------
// (5) resolveScopes — o que C entrega (e o limite que ele compartilha com o JS)
// ---------------------------------------------------------------------------

/**
 * Resolução de escopo PLANA, calculada no MESMO subprocesso do parse (o
 * helper percorre a árvore e devolve `declared`/`free`).
 *
 * O LIMITE É O DO LADO JAVASCRIPT, DECLARADO (`extract.ts:38-43`): junta os
 * nomes declarados no arquivo (funções, variáveis, parâmetros) e trata como
 * livre o identificador que sobrou. C tem escopo de bloco e shadowing legal —
 * um `int printf = 0;` local faria o extrator deixar de reportar `global:…`
 * do nome sombreado em OUTRO escopo. A alternativa seria reimplementar o
 * linker de símbolos do clang fora dele; o ganho para trecho de aula não
 * paga. O que C NÃO tem — import — não é perda: `#include` é expansão de
 * TEXTO, e `imported` é vazio POR CONSTRUÇÃO.
 */
export function cResolveScopes(parsed: ParseOk): ScopeResolution {
  const native = parsed.native as CNative | undefined;
  const escopos = native?.scopes ?? { declared: [], imported: [], free: [] };
  const globais = new Set<string>();
  for (const nome of escopos.free) if (cGlobals().has(nome)) globais.add(nome);
  return {
    declared: new Set(escopos.declared),
    imported: new Set(escopos.imported),
    free: new Set(escopos.free),
    globals: globais,
  };
}

// ---------------------------------------------------------------------------
// (2) constructKey(node) — os CINCO eixos que C cobre
// ---------------------------------------------------------------------------

/**
 * ─── OS EIXOS QUE ESTE `constructKey` COBRE ────────────────────────────────
 *
 * CINCO: `node:`, `decl:`, `op:`, `global:` e `api:` — o MESMO conjunto do
 * adaptador Python (`pyConstructKey`, `lang/python.ts:583-592`), com o MESMO
 * contrato de atributos: `declKind` → `decl:`, `globalName` → `global:`,
 * `apiPath` → `api:`, `operator`+`operatorFamily` → `op:`, e a chave genérica
 * `node:<type>` para o resto. As famílias de operador:
 *
 *   op:binary:<op>    `+ - * / % < > <= >= == != & | ^ << >>`
 *   op:logical:<op>   `&& ||`            (curto-circuito é aula própria)
 *   op:unary:<op>     `! - + ~ & * sizeof`
 *   op:update:<op>    `++ --`            (pré e pós — o clang só muda `isPostfix`)
 *   op:assign:<op>    `= += -= *= /= %=` (o par decl:var↔op:assign:= é a
 *                                        "regra do par" do vocabulário)
 *
 * FORA: `term:` (prosa pt-BR, de outro módulo) e `form:` — DESABILITADO na
 * v1 (`C_FORM_AXIS_SUPPORTED`), pelo mesmo motivo do Python:
 * `form/selector.ts:344` é tipado sobre `ts.Node`.
 */
export function cConstructKey(node: LangNode): string | null {
  const attrs = node.attributes;
  if (attrs.declKind !== undefined) return `decl:${attrs.declKind}`;
  if (attrs.globalName !== undefined) return `global:${attrs.globalName}`;
  if (attrs.apiPath !== undefined) return `api:${attrs.apiPath}`;
  if (attrs.operatorFamily !== undefined && attrs.operator !== undefined) {
    return `op:${attrs.operatorFamily}:${attrs.operator}`;
  }
  return `node:${node.type}`;
}

// ---------------------------------------------------------------------------
// (6) forbiddenInvariants — Porta 3
// ---------------------------------------------------------------------------

/**
 * PROIBIÇÕES GLOBAIS — o MÍNIMO que faz o gate de C mentir, cada item com o
 * porquê:
 *
 * 1. `node:IndirectCall` — chamada por PONTEIRO de função (`(*f)(x)` ou
 *    `f(x)` com `f` variável). É o `eval` de C: a função executada só se
 *    sabe em runtime, então o orçamento de `api:` deixa de significar nada.
 *    Ponteiro de função está fora do curso iniciante — proibir custa nada
 *    e fecha a classe inteira.
 * 2. `api:dlsym` — resolve símbolo POR NOME em runtime (`dlsym(handle,
 *    "qualquer_coisa")`): montar chamadas com strings é exatamente a
 *    construção que quebra a decidibilidade, e é o que o §5 do research 08
 *    proíbe no Python (`__import__`) e no JavaScript (`new Function`).
 * 3. `api:system` — executa linha de shell arbitrária: rede, filesystem e
 *    compilação fora do alcance do orçamento, além de não-determinismo
 *    flagrante numa prova.
 *
 * O QUE NÃO ENTROU, e por quê. Não há `eval` em C (nada a proibir — a lista
 * de JavaScript tem `global:eval`/`global:Function`, e a de Python
 * `global:eval`/`global:exec`; em C o papel dos dois é das duas entradas
 * acima). `obj[expr]` (o `node:ComputedNonLiteralAccess` do JS) não tem
 * contraparte: a indexação `a[i]` de C é o CORAÇÃO do módulo de vetores do
 * curso e é decidível — o índice é visível na árvore. `goto`/`setjmp` são
 * fuga de fluxo, não indecidibilidade de NOME — ficam para o orçamento
 * decidir por aula (Porta 2), não como invariante global.
 */
export const C_FORBIDDEN_INVARIANTS: readonly string[] = [
  'node:IndirectCall',
  'api:dlsym',
  'api:system',
];

// ---------------------------------------------------------------------------
// (7)(8) layout(challenge) — e O RELATÓRIO FORA DO ALCANCE DO CÓDIGO DO ALUNO
// ---------------------------------------------------------------------------

/** O arquivo que o teste exercita (`entryPath`). */
export const C_ENTRY_PATH = 'solucao.c';
/** O arquivo de teste — o que o `run.sh` gerado compila junto. */
export const C_TEST_PATH = 'tests/test_solucao.c';
/** O header do harness (a macro `SM_TEST` + o registro de testes). */
export const C_HARNESS_HEADER_PATH = 'tests/sm_harness.h';
/** O `main` do harness — o ÚNICO produtor da contagem (com o nonce). */
export const C_HARNESS_MAIN_PATH = 'tests/sm_main.c';
/** O script gerado que compila e roda (o `testCommand` o invoca). */
export const C_RUNNER_SCRIPT_PATH = 'run.sh';
/** A lista dos fontes do ALUNO que o `run.sh` compila (um caminho por linha). */
export const C_FONTES_LIST_PATH = 'sm_fontes.txt';

/**
 * A CONVENÇÃO DE TESTE C DO DESAFIO — O COUNTER_PROTOCOL (03-tdd §3.9.3)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * O protocolo de teste de desafio C é o **counter_protocol**
 * (`docs/build-spec/blocks/03-tdd.md` §3.9.3, código de referência em
 * `docs/05-challenges-tdd.md` §3.2) — OBRIGATÓRIO, não preferência:
 *
 *   - NUNCA `assert.h`. `assert()` aborta no PRIMEIRO erro com SIGABRT
 *     (exit 134) e esconde os demais cenários (`docs/00-contratos.md` §5.3,
 *     `03-tdd.md` §3.7.1) — inaceitável num teste cujo propósito é enumerar
 *     cenários. E pior PARA A PROVA: o símbolo de abort é DINÂMICO da libc
 *     (`__assert_rtn` no macOS, `__assert_fail` na glibc) e o TU do ALUNO,
 *     ligado ao MESMO binário, pode REDEFINI-LO como no-op e neutralizar
 *     TODA a detecção. Sem `assert()` no binário não existe símbolo a
 *     interpor — é POR ISSO que a migração para o counter_protocol fecha o
 *     vetor crítico, e o `SM_HARNESS_HEADER` ainda VENENA `assert()` no TU
 *     de teste (usá-lo vira erro de compilação; a convenção não tem exceção).
 *     Falha de teste NÃO é mais "exit 134": os helpers NUNCA abortam.
 *   - dois contadores e helpers `checa_<tipo>(cenario, obtido, esperado,
 *     porque)` que incrementam e, em divergência, imprimem em STDERR
 *     `FALHOU [<cenario>]: obtido …, esperado …. <porque>` e seguem para o
 *     próximo cenário. Tipos cobertos (derivados do §3.2 e do curso):
 *     `checa_int`, `checa_long`, `checa_double`, `checa_char` e `checa_str`
 *     (strings por `strcmp`).
 *   - os helpers e os contadores são FUNÇÕES/VARIÁVEIS **static** do TU de
 *     teste (ligação INTERNA): um símbolo global `checa_*` definido pelo
 *     aluno não conflita no link e não intercepta chamada nenhuma.
 *   - cada teste é um bloco `SM_TEST(<slug>) { … checa_*(…); … }` com a
 *     macro expandindo para `static void test_<slug>(void)` auto-registrada
 *     num construtor (é isso que `countDeclared` conta, POR AST); o arquivo
 *     de teste NÃO tem `main` — o `main` é do harness. O `testsCode` é uma
 *     UNIDADE DE COMPILAÇÃO completa e DECLARA o que exercita: o PROTÓTIPO
 *     de cada função do aluno (ou `#include` de um header do próprio
 *     desafio — o layout aceita `.h` em `files`). A compilação do runner é
 *     ESTRITA de propósito — para C, compilar É o typecheck (ver
 *     `exec/typesCheck.ts`, entrada `c`).
 *   - UM CENÁRIO = um bloco `SM_TEST`; cada `checa_*` dentro dele é uma
 *     VERIFICAÇÃO do cenário. Mapeamento da contagem (decisão deste
 *     adaptador, documentada em `cCountRun`): `TESTS_RUN` = cenários
 *     executados (não chamadas de checa), `TESTS_FAILED` = cenários com ao
 *     menos uma divergência; `pass = RUN − FAILED`; `skipped = 0` (a prova 1
 *     é passagem integral; o filtro `SM_ONLY` do `--only`, §3.9.2, é
 *     respeitado e reportado honestamente). Assim `TESTS_RUN` bate com
 *     `countDeclared` e a dupla-igualdade (declared == executed ==
 *     `expectedTestCount`) vale como em toda linguagem.
 *   - EXIT (D-V11, `languages.md` :374): o `run.sh` gerado NORMALIZA o exit
 *     do runner para **0 passou · 1 falhou** e ecoa no stdout
 *     `EXIT_BRUTO=<bruto>` e `DECORRIDO_MS=<ms>`. Os outros dois valores do
 *     D-V11 pertencem à camada da engine neste runner gerado: **2**
 *     (contagem errada) é a dupla-igualdade (`judgeCountMatches`), e **3**
 *     (timeout) é o kill imposto pelo executor da engine — o runner não tem
 *     timeout próprio. O diagnóstico bruto (134=SIGABRT, 137=morto,
 *     127=sem compilador, 139=SIGSEGV) não se perde porque `EXIT_BRUTO` vai
 *     no stdout.
 *
 * POR QUE O MAIN E O RELATÓRIO SÃO DO HARNESS: o `main` é onde moraria a
 * forja. Colocá-lo no harness gerado (que recebe o nonce em COMPILAÇÃO, fora
 * do alcance do código do aluno) e ler a contagem SÓ das linhas com nonce
 * (`SM<nonce> TESTS_RUN=…`) é o que fecha os vetores de `printf` forjado —
 * o aluno pode imprimir `TESTS_RUN=2` à vontade: linha SEM o prefixo SM com
 * nonce nunca é contagem (ver `cCountRun`).
 */

/**
 * O header do harness — o que o `testsCode` usa via `SM_TEST`. Escrito pelo
 * `layout()`; o arquivo de teste gerado o inclui na PRIMEIRA linha.
 */
export const SM_HARNESS_HEADER = `/* tests/sm_harness.h — harness do desafio C. GERADO pelo adaptador
 * (engine/lang/c.ts, SM_HARNESS_HEADER). Leia; não edite.
 *
 * O protocolo de teste é o COUNTER_PROTOCOL (docs/build-spec/blocks/03-tdd.md
 * §3.9.3): helpers checa_<tipo> que NUNCA abortam, contadores static e
 * contagem final TESTS_RUN/TESTS_FAILED. NUNCA assert.h: assert() aborta no
 * primeiro erro (SIGABRT/134) e o símbolo de abort (__assert_rtn no macOS,
 * __assert_fail na glibc) é DINÂMICO da libc — o TU do aluno, ligado ao
 * mesmo binário, poderia redefini-lo como no-op. Sem assert() no binário não
 * existe símbolo a interpor; o veneno abaixo torna o uso de assert() no TU
 * de teste um ERRO DE COMPILAÇÃO (a convenção não tem exceção).
 * Helpers e contadores são STATIC (ligação interna): um símbolo global de
 * mesmo nome no TU do aluno não conflita no link e não intercepta nada.
 * A contagem confiável não sai pelo stdout do teste: o main do harness
 * (tests/sm_main.c, nonce em compilação) escreve o relatório NO FIM. */
#ifndef SM_HARNESS_H
#define SM_HARNESS_H

#include <stdio.h>
#include <string.h>
#include <assert.h>

typedef void (*SmTestFn)(void);
void sm_registrar(const char *nome, SmTestFn fn);
void sm_contagens(int *total, int *falhas);

/* Veneno do assert — 03-tdd §3.9.3 ("não usa assert.h") tornado estrutura. */
#undef assert
#define assert(...) _Static_assert(0, "assert() e proibido no teste do desafio (03-tdd 3.9.3, counter_protocol): use checa_int/checa_long/checa_double/checa_char/checa_str")

#ifndef SM_HARNESS_NUCLEO
/* ─── counter_protocol (§3.9.3): contadores static + helpers static ───────
 * Um cenário = um SM_TEST; cada checa_* é uma verificação do cenário. Em
 * divergência: imprime em STDERR "FALHOU [<cenario>]: obtido …, esperado ….
 * <porque>" e SEGUE para o próximo cenário (nunca aborta). */
static int sm_total = 0;
static int sm_falhas = 0;

static void checa_int(const char *cenario, int obtido, int esperado, const char *porque) {
    sm_total++;
    if (obtido != esperado) {
        sm_falhas++;
        fprintf(stderr, "FALHOU [%s]: obtido %d, esperado %d. %s\\n", cenario, obtido, esperado, porque);
    }
}

static void checa_long(const char *cenario, long obtido, long esperado, const char *porque) {
    sm_total++;
    if (obtido != esperado) {
        sm_falhas++;
        fprintf(stderr, "FALHOU [%s]: obtido %ld, esperado %ld. %s\\n", cenario, obtido, esperado, porque);
    }
}

static void checa_double(const char *cenario, double obtido, double esperado, const char *porque) {
    sm_total++;
    if (!(obtido == esperado)) {   /* NaN nunca passa */
        sm_falhas++;
        fprintf(stderr, "FALHOU [%s]: obtido %.17g, esperado %.17g. %s\\n", cenario, obtido, esperado, porque);
    }
}

static void checa_char(const char *cenario, char obtido, char esperado, const char *porque) {
    sm_total++;
    if (obtido != esperado) {
        sm_falhas++;
        fprintf(stderr, "FALHOU [%s]: obtido '%c', esperado '%c'. %s\\n", cenario, obtido, esperado, porque);
    }
}

static void checa_str(const char *cenario, const char *obtido, const char *esperado, const char *porque) {
    sm_total++;
    if (obtido == NULL || esperado == NULL || strcmp(obtido, esperado) != 0) {
        sm_falhas++;
        fprintf(stderr, "FALHOU [%s]: obtido \\"%s\\", esperado \\"%s\\". %s\\n",
                cenario, obtido == NULL ? "(null)" : obtido,
                esperado == NULL ? "(null)" : esperado, porque);
    }
}

/* A ponte para o main do harness (outro TU): os contadores são STATIC daqui,
 * então a leitura da contagem passa por esta função — nenhum TU externo
 * escreve nestes contadores. */
void sm_contagens(int *total, int *falhas) {
    if (total != NULL) *total = sm_total;
    if (falhas != NULL) *falhas = sm_falhas;
}

#define SM_TEST(slug)                                                         \\
    static void test_##slug(void);                                            \\
    __attribute__((constructor)) static void sm_reg_##slug(void)              \\
    { sm_registrar(#slug, test_##slug); }                                     \\
    static void test_##slug(void)
#endif /* SM_HARNESS_NUCLEO */

#endif /* SM_HARNESS_H */
`;

/**
 * O `main` do harness. COMPILE-SE SEMPRE com `-DSM_NONCE` e `-DSM_RELATORIO`
 * (o `run.sh` gerado o faz): os defaults abaixo são só para o arquivo
 * compilar SOZINHO — e "compilar sozinho" aqui significa escrever o relatório
 * em `/dev/null`, nunca fingir contagem.
 *
 * O RELATÓRIO SAI NO FIM, DE PROPÓSITO: um `exit(0)` do código do aluno no
 * meio dos testes mata o processo ANTES desta escrita — o arquivo não nasce,
 * o script imprime contagem ZERO e a prova 1 reprova ("exit 0 com ZERO testes
 * executados"). E a linha por-teste (`T <slug> ok`) sai com `fflush` para que
 * um abort no meio deixe registrado o que passou.
 */
export const SM_MAIN_SOURCE = `/* tests/sm_main.c — o main do harness do desafio C. GERADO pelo adaptador
 * (engine/lang/c.ts, SM_MAIN_SOURCE). Leia; não edite.
 *
 * O ÚNICO produtor da contagem confiável. O nonce e o caminho do relatório
 * entram por -DSM_NONCE/-DSM_RELATORIO NO MOMENTO DA COMPILAÇÃO, e SÓ os TUs
 * do HARNESS os recebem — o TU do aluno nunca os vê (ver run.sh). Os defaults
 * abaixo existem para o arquivo compilar sozinho: escrevem em /dev/null,
 * nunca fingem contagem.
 *
 * Os contadores e os helpers do counter_protocol (03-tdd §3.9.3) vivem no TU
 * de TESTE (static, sm_harness.h); este TU os lê pela ponte sm_contagens() e
 * escreve, NO FIM, o relatório:
 *
 *     SM<nonce> T <slug> ok|FALHOU    (uma linha por cenário executado)
 *     SM<nonce> TESTS_RUN=<n>         (cenários executados — não checas)
 *     SM<nonce> TESTS_FAILED=<n>      (cenários com ao menos uma divergência)
 *
 * O RELATÓRIO SAI NO FIM, DE PROPÓSITO: um exit(0) do código do aluno no
 * meio dos testes mata o processo ANTES desta escrita — o arquivo não nasce,
 * o script imprime contagem ZERO com TESTS_FAILED=1 e a prova 1 reprova
 * ("exit 0 com ZERO testes executados"). A linha por-cenário sai com fflush
 * para um crash no meio deixar registrado o que já passou.
 * Exit: falharam == 0 ? 0 : 1 (counter_protocol §3.9.3). */
#define SM_HARNESS_NUCLEO
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "sm_harness.h"

#ifndef SM_NONCE
#define SM_NONCE "0"
#endif
#ifndef SM_RELATORIO
#define SM_RELATORIO "/dev/null"
#endif

#define SM_MAX_TESTES 512

static SmTestFn sm_fns[SM_MAX_TESTES];
static const char *sm_nomes[SM_MAX_TESTES];
static int sm_registrados = 0;

void sm_registrar(const char *nome, SmTestFn fn) {
    if (sm_registrados < SM_MAX_TESTES) {
        sm_nomes[sm_registrados] = nome;
        sm_fns[sm_registrados] = fn;
        sm_registrados++;
    }
}

int main(void) {
    FILE *rel = fopen(SM_RELATORIO, "w");
    const char *somente = getenv("SM_ONLY");   /* filtro --only (03-tdd §3.9.2) */
    int rodou = 0, falharam = 0;
    for (int i = 0; i < sm_registrados; i++) {
        if (somente != NULL && *somente != '\\0' && strcmp(sm_nomes[i], somente) != 0) continue;
        int antes = 0;
        sm_contagens(NULL, &antes);
        sm_fns[i]();
        int depois = 0;
        sm_contagens(NULL, &depois);
        rodou++;
        int falhou_este = depois > antes;
        if (falhou_este) falharam++;
        if (rel != NULL) {
            fprintf(rel, "SM" SM_NONCE " T %s %s\\n", sm_nomes[i], falhou_este ? "FALHOU" : "ok");
            fflush(rel);
        }
    }
    if (rel != NULL) {
        fprintf(rel, "SM" SM_NONCE " TESTS_RUN=%d\\n", rodou);
        fprintf(rel, "SM" SM_NONCE " TESTS_FAILED=%d\\n", falharam);
        fclose(rel);
    }
    return falharam == 0 ? 0 : 1;
}
`;

/**
 * O `run.sh` gerado — o runner de prova inteiro em um arquivo legível.
 *
 * ─── O RELATÓRIO FORA DO ALCANCE DO CÓDIGO DO ALUNO ────────────────────────
 *
 * O ATQUE que isto fecha (o análogo da CRITICAL 1 do lado JavaScript e do
 * exit-guard do Python): uma solução que chama `exit(0)` cedo, ou que imprime
 * contagens forjadas (`printf("TESTS_RUN=2\nTESTS_FAILED=0")` — com ou sem
 * prefixo SM), ou que define os símbolos de abort da libc
 * (`__assert_rtn`/`__assert_fail`) como no-op, ou que usa
 * `__attribute__((constructor))` para forjar antes do `main`.
 * As camadas, cada uma independente:
 *
 *   1. O NONCE nasce AQUI, por execução (urandom), e vai ao compilador SÓ dos
 *      TUs do HARNESS — o TU do ALUNO é compilado SEM `-DSM_NONCE`. Um
 *      relatório forjado não sabe o nonce (e as contagens que a engine lê
 *      NUNCA saem do stdout do aluno: a linha canônica vem do script e só
 *      casa com o prefixo `SM<nonce>` — `cCountRun` ignora linha sem ele).
 *   2. As contagens moram num ARQUIVO que o `main` do harness escreve NO FIM
 *      — um `exit(0)` cedo mata o processo antes da escrita; o script valida
 *      o nonce no arquivo e, sem ele, imprime contagem ZERO (TESTS_FAILED=
 *      1). A prova 1 reprova exit 0 com ZERO testes executados. E contra a
 *      interposição de `__assert_rtn`/`__assert_fail` a defesa é ESTRUTURAL:
 *      o counter_protocol não usa assert(), então não há símbolo de abort
 *      no binário para o TU do aluno neutralizar.
 *   3. A saída do processo de teste vai para um arquivo de CAPTURA: nem o
 *      `printf` forjado nem um fork órfão do código do aluno alcançam a saída
 *      que a engine lê — o stdout do script carrega SÓ as linhas com nonce.
 *
 * LIMITE (a honestidade de sempre): defesa em profundidade, não sandbox. O
 * nonce e o caminho do relatório transitam na IMAGEM do runner compilado —
 * um forjador forense que varresse a própria memória por `SM<hex>` poderia
 * recuperá-los e escrever o arquivo (mesmo uid). O mesmo grau do exit-guard
 * do lado JavaScript, que também é um monkey-patch num objeto que o filho
 * enxerga. E `envScrub` não bloqueia socket cru — o corte de rede de verdade
 * exige wrapper de SO (o slot `wrapperCommand` do harness).
 */
export const SM_RUNNER_SCRIPT = `#!/bin/sh
# run.sh — o runner do desafio C. GERADO pelo adaptador (engine/lang/c.ts,
# SM_RUNNER_SCRIPT). Leia; não edite.
#
# Compila com a linha C medida do repositório
# (skills/study-method/references/languages.md §3.1):
#     cc -std=c11 -g … -o runner -lm && ./runner
# O protocolo de teste é o counter_protocol (03-tdd §3.9.3): os helpers
# checa_* NUNCA abortam — falha de teste é TESTS_FAILED>0 e exit bruto 1,
# NUNCA SIGABRT/134. E produz o relatório de contagem FORA do alcance do
# código do aluno — as três camadas estão documentadas no cabeçalho de
# lang/c.ts.
#
# EXIT (D-V11, languages.md :374): normaliza para 0 passou · 1 falhou e ecoa
# no stdout EXIT_BRUTO e DECORRIDO_MS. Os valores 2 (contagem errada) e 3
# (timeout) do D-V11 são da camada da engine NESTE runner gerado: 2 é a
# dupla-igualdade (judgeCountMatches) e 3 é o kill do executor — o runner
# gerado não tem timeout próprio nem conhece expectedTestCount.
set -u

SM_CC=""
for sm_c in cc gcc clang; do
    if command -v "$sm_c" >/dev/null 2>&1; then SM_CC="$sm_c"; break; fi
done
if [ -z "$SM_CC" ]; then
    echo "sm: nenhum compilador C encontrado no PATH (procurados: cc, gcc, clang) — as provas de execução de C não rodam" >&2
    exit 127
fi

# Milissegundos portáveis: GNU date aceita %3N; BSD date (macOS) não — nesse
# caso cai para segundos*1000 (a granulosidade é honesta, não inventada).
sm_agora_ms() {
    sm_t="$(date +%s%3N 2>/dev/null)"
    case "$sm_t" in
        ''|*[!0-9]*)
            sm_t="$(date +%s 2>/dev/null)"
            case "$sm_t" in ''|*[!0-9]*) sm_t=0;; esac
            sm_t=$((sm_t * 1000))
            ;;
    esac
    echo "$sm_t"
}

SM_NONCE="$(od -An -N16 -tx1 /dev/urandom 2>/dev/null | tr -d ' \\n')"
if [ -z "$SM_NONCE" ]; then SM_NONCE="pid$$"; fi

SM_TMP="$(mktemp -d "\${TMPDIR:-/tmp}/sm-c-runner-XXXXXXXX")" || exit 127
SM_CAPTURA="$SM_TMP/captura"
SM_RELATORIO="$SM_TMP/relatorio"
trap 'rm -rf "$SM_TMP"' EXIT

sm_falha() {
    cat "$SM_CAPTURA" >&2
    echo "sm: $1" >&2
    exit 1
}

# 1) os TUs do ALUNO (sm_fontes.txt — um caminho por linha, validado pelo
#    filePathPattern do adaptador). NENHUM recebe o nonce (camada 1).
sm_objs=""
sm_n=0
while IFS= read -r sm_fonte; do
    [ -n "$sm_fonte" ] || continue
    sm_n=$((sm_n + 1))
    "$SM_CC" -std=c11 -g -c "$sm_fonte" -o "$SM_TMP/aluno$sm_n.o" 2>"$SM_CAPTURA" \\
        || sm_falha "falha ao compilar $sm_fonte"
    sm_objs="$sm_objs $SM_TMP/aluno$sm_n.o"
done < sm_fontes.txt

# 2) os TUs do HARNESS — os ÚNICOS que recebem o nonce e o caminho do relatório
"$SM_CC" -std=c11 -g -DSM_NONCE="\\"$SM_NONCE\\"" -DSM_RELATORIO="\\"$SM_RELATORIO\\"" \\
    -c tests/sm_main.c -o "$SM_TMP/main.o" 2>"$SM_CAPTURA" \\
    || sm_falha "falha ao compilar tests/sm_main.c"
"$SM_CC" -std=c11 -g -c tests/test_solucao.c -o "$SM_TMP/testes.o" 2>"$SM_CAPTURA" \\
    || sm_falha "falha ao compilar tests/test_solucao.c"

# 3) link — a linha medida leva -lm
"$SM_CC" $sm_objs "$SM_TMP/main.o" "$SM_TMP/testes.o" -o "$SM_TMP/runner" -lm 2>"$SM_CAPTURA" \\
    || sm_falha "falha ao ligar o runner"

# 4) roda — stdout/stderr do teste vão para a CAPTURA (camada 3)
sm_t0="$(sm_agora_ms)"
"$SM_TMP/runner" >"$SM_CAPTURA" 2>&1
sm_bruto=$?
sm_t1="$(sm_agora_ms)"
sm_ms=$((sm_t1 - sm_t0))

# 5) relatório: só o arquivo com o nonce vale (camada 2). O dump da CAPTURA
#    (as mensagens FALHOU […] do counter_protocol e o que o aluno imprimiu)
#    vem ANTES da linha canônica e SEM as linhas SM (namespace reservado do
#    relatório — uma linha FORJADA pelo aluno não vaza para a saída que a
#    engine lê). O dump vai para o STDERR: execOutput concatena stdout ANTES
#    de stderr, então o relatório com nonce (stdout) é sempre a PRIMEIRA
#    coisa que a engine lê, e cCountRun só confia em linhas SM de todo modo.
if [ "$sm_bruto" -ne 0 ]; then
    grep -v '^SM' "$SM_CAPTURA" >&2 || true
fi
if [ -f "$SM_RELATORIO" ] && grep -q "^SM$SM_NONCE " "$SM_RELATORIO"; then
    cat "$SM_RELATORIO"
else
    echo "SM$SM_NONCE TESTS_RUN=0"
    echo "SM$SM_NONCE TESTS_FAILED=1"
fi
echo "EXIT_BRUTO=$sm_bruto"
echo "DECORRIDO_MS=$sm_ms"

# 6) normalização D-V11: 0 passou · 1 falhou (2/3 são da engine — ver o topo).
sm_norm=0
if [ "$sm_bruto" -ne 0 ]; then sm_norm=1; fi
exit "$sm_norm"
`;

/**
 * O preâmbulo que o `countDeclared` coloca na FRENTE do `testsCode` antes de
 * parsear — os protótipos dos helpers do counter_protocol (03-tdd §3.9.3,
 * os MESMOS de `SM_HARNESS_HEADER`) MAIS a macro `SM_TEST`, em linha, para
 * que o clang conheça tudo sem arquivo vizinho (o `parse` é de um único
 * fonte em memória; sem os protótipos, cada `checa_*` viraria declaração
 * implícita — warning que o parse tolera, mas a árvore fica menos fiel). O
 * texto na frente desloca LINHAS do fonte — e não importa: a contagem é POR
 * AST, não por linha.
 */
export const SM_COUNT_PREABULO = [
  'typedef void (*SmTestFn)(void);',
  'void sm_registrar(const char *nome, SmTestFn fn);',
  'void sm_contagens(int *total, int *falhas);',
  'static void checa_int(const char *cenario, int obtido, int esperado, const char *porque);',
  'static void checa_long(const char *cenario, long obtido, long esperado, const char *porque);',
  'static void checa_double(const char *cenario, double obtido, double esperado, const char *porque);',
  'static void checa_char(const char *cenario, char obtido, char esperado, const char *porque);',
  'static void checa_str(const char *cenario, const char *obtido, const char *esperado, const char *porque);',
  '#define SM_TEST(slug) static void test_##slug(void); \\',
  '    __attribute__((constructor)) static void sm_reg_##slug(void) { sm_registrar(#slug, test_##slug); } \\',
  '    static void test_##slug(void)',
].join('\n');

/**
 * Os arquivos do desafio em disco, na ORDEM de escrita.
 *
 * NÃO HÁ MANIFESTO — a ausência é informação, como no Python: C não tem
 * análogo do `package.json {type:'module'}` (um programa C é o que o comando
 * de compilação lista). O papel de "sem isto o runner não roda" é do
 * `tests/sm_harness.h` + `tests/sm_main.c` + `run.sh` — os três GERADOS, na
 * ordem: header (incluído pelo teste), main (o produtor da contagem), teste
 * (o preâmbulo + o `testsCode` do autor VERBATIM), a lista de fontes e o
 * script.
 */
export function cLayout(challenge: ChallengeLayoutInput): ChallengeLayout {
  const fontes: string[] = [];
  const files: { path: string; content: string }[] = [
    { path: C_HARNESS_HEADER_PATH, content: SM_HARNESS_HEADER },
    { path: C_HARNESS_MAIN_PATH, content: SM_MAIN_SOURCE },
  ];
  if (challenge.files && challenge.files.length > 0) {
    for (const f of challenge.files) {
      files.push({ path: f.path, content: f.code });
      fontes.push(f.path);
    }
  } else {
    files.push({ path: C_ENTRY_PATH, content: challenge.code });
    fontes.push(C_ENTRY_PATH);
  }
  files.push({ path: C_TEST_PATH, content: `#include "sm_harness.h"\n${challenge.testsCode}` });
  files.push({ path: C_FONTES_LIST_PATH, content: `${fontes.join('\n')}\n` });
  files.push({ path: C_RUNNER_SCRIPT_PATH, content: SM_RUNNER_SCRIPT });
  return {
    files,
    entryPath: C_ENTRY_PATH,
    testPath: C_TEST_PATH,
    manifestPath: null,
  };
}

// ---------------------------------------------------------------------------
// (8) filePathPattern
// ---------------------------------------------------------------------------

/**
 * Caminho SEGURO de arquivo de desafio C: letras/dígitos/_/-//, terminando
 * em `.c` OU `.h` — um desafio multi-arquivo de C é fonte + header (a árvore
 * medida em `languages.md` §3.2: "C/C++: stub.c · stub.h · tests/test_stub.c
 * — header ou protótipo!"). Proíbe `..`, ponto no meio e qualquer escape do
 * diretório de execução. Os arquivos GERADOS (`tests/sm_*.c`, `run.sh`) não
 * passam por aqui: o regex valida os paths que vêm DO DESAFIO, não os do
 * harness.
 *
 * SEM a flag `g`: `RegExp` com `g` guarda `lastIndex` entre chamadas e daria
 * falso-negativo alternado em `.test()`.
 */
export const C_SAFE_FILE_PATH_RE = /^[a-zA-Z0-9_\-/]+\.(c|h)$/;

// ---------------------------------------------------------------------------
// (9) testCommand
// ---------------------------------------------------------------------------

/**
 * O comando do runner: o script GERADO que compila (com a linha medida de
 * `languages.md` §3.1) e roda. Sem o binário — ele vem de `detect()`
 * (`C_RUNNER_BINARY` = `sh`).
 *
 * Por que um SCRIPT e não `['-c', 'cc … && ./runner']`: o pipeline real tem
 * cinco passos (escolher compilador, gerar nonce, compilar em três rodadas
 * para isolar o nonce do TU do aluno, rodar com captura, emitir o relatório)
 * e a engine precisa RELER cada um — um arquivo gerado é inspecionável pelo
 * autor da trilha, versionável pelo adaptador e testável isoladamente.
 */
export const C_TEST_COMMAND: readonly string[] = [C_RUNNER_SCRIPT_PATH];

// ---------------------------------------------------------------------------
// (10) countDeclared — o lado DECLARADO da dupla-igualdade
// ---------------------------------------------------------------------------

/**
 * Contagem ESTÁTICA de testes no fonte, POR AST (clang): conta a DEFINIÇÃO
 * de cada função `test_*` — a expansão da macro `SM_TEST(<slug>)` da
 * convenção (o clang emite a decl e a def como DOIS nós; ver o corpo).
 * Falha do parse (fonte quebrado, clang ausente) devolve 0 — fail-closed:
 * 0 nunca bate com um `expectedTestCount` legítimo, e a dupla-igualdade
 * reprova.
 *
 * Preserva a propriedade que `extract.ts:490-493` exige: AST, nunca regex —
 * comentário não é nó, e um `/* SM_TEST(x) *&#47;` comentado não conta.
 * Um `static void test_x(void)` definido FORA da macro também conta (é um
 * teste válido da convenção), e um `sm_reg_x` (o construtor gerado) NÃO
 * conta — não começa com `test_`.
 */
export function cCountDeclared(testsCode: string): number {
  const parsed = cParse(`${SM_COUNT_PREABULO}\n${testsCode}`, { fileName: 'tests/test_solucao.c' });
  if (!parsed.ok) return 0;
  // POR NOME ÚNICO E SÓ DEFINIÇÃO: o clang emite a MESMA `FunctionDecl`
  // DUAS vezes quando a macro primeiro declara e depois define
  // (`test_dobro_de_2` do protótipo + `test_dobro_de_2` com corpo) — contar
  // nó a nó dobraria a contagem. Definição = `FunctionDecl` com CORPO
  // (`CompoundStmt` entre os filhos); e o `Set` protege contra proto+def
  // escritos à mão. Contar por AST é o que faz comentário não contar.
  const nomes = new Set<string>();
  const contar = (no: LangNode): void => {
    if (
      no.type === 'FunctionDecl' &&
      (no.attributes.name ?? '').startsWith('test_') &&
      no.children.some((filho) => filho.type === 'CompoundStmt')
    ) {
      nomes.add(no.attributes.name as string);
    }
    for (const filho of no.children) contar(filho);
  };
  contar(parsed.root);
  return nomes.size;
}

// ---------------------------------------------------------------------------
// (11) countRun — o lado EXECUTADO da dupla-igualdade
// ---------------------------------------------------------------------------

const CONTAGEM_ZERO: RunCounts = { testsRun: 0, pass: 0, fail: 0, skipped: 0 };

/**
 * Contagem EXECUTADA, das ÚLTIMAS linhas canônicas do relatório — as linhas
 * que o `run.sh` gerado imprime a partir do arquivo escrito pelo `main` do
 * harness (counter_protocol, 03-tdd §3.9.3, com o nonce do namespace SM):
 *
 *     SM<nonce> TESTS_RUN=<n>
 *     SM<nonce> TESTS_FAILED=<n>
 *
 * O MAPEAMENTO (decisão deste adaptador, declarada no bloco "A CONVENÇÃO DE
 * TESTE C DO DESAFIO"): `testsRun` = TESTS_RUN (cenários — blocos SM_TEST —
 * executados, NÃO chamadas de checa_*; é o que bate com `countDeclared`);
 * `fail` = TESTS_FAILED (cenários com ao menos uma divergência); `pass` =
 * RUN − FAILED; `skipped` = 0 (a prova 1 é passagem integral — o filtro
 * SM_ONLY reduz RUN e é reportado honestamente). As DUAS linhas são
 * obrigatórias: uma sem a outra é relatório truncado ⇒ ZERO (fail-closed).
 *
 * POR QUE SÓ LINHAS COM NONCE (SM): o nonce é gerado por execução e
 * compilado SÓ nos TUs do harness (ver `SM_RUNNER_SCRIPT`) — o canal
 * confiável é o arquivo de relatório do main do harness, não o stdout do
 * teste. Um `printf("TESTS_RUN=2\nTESTS_FAILED=0")` forjado pelo código do
 * aluno não carrega o prefixo SM e NUNCA casa — a interposição de símbolo
 * não tem aqui nem superfície (não há assert) nem canal (contagem só sai de
 * linha com nonce).
 *
 * POR QUE AS ÚLTIMAS (o mesmo motivo de `jsCountRun`/`pyCountRun`): se algum
 * dia uma linha com nonce puder existir fora do script, a do runner real é
 * sempre a última — o script a imprime depois de o processo de teste
 * terminar. Linha ausente ⇒ 0 (fail-closed: sem relatório não há como provar
 * que algo rodou — e "exit 0 com zero testes" é exatamente a assinatura da
 * forja por `exit(0)` cedo).
 */
export function cCountRun(output: string): RunCounts {
  // eslint-disable-next-line no-control-regex
  const linhas = output.replace(/\x1b\[[0-9;]*m/g, '').split('\n');
  let run: number | null = null;
  let falhas: number | null = null;
  for (const linha of linhas) {
    let m = /^SM\S+ TESTS_RUN=(\d+)\s*$/.exec(linha);
    if (m) run = Number(m[1]);
    m = /^SM\S+ TESTS_FAILED=(\d+)\s*$/.exec(linha);
    if (m) falhas = Number(m[1]);
  }
  if (run === null || falhas === null) return CONTAGEM_ZERO;
  return { testsRun: run, pass: Math.max(0, run - falhas), fail: falhas, skipped: 0 };
}

// ---------------------------------------------------------------------------
// (12) parseChecks — os checks individuais para a UI do aluno
// ---------------------------------------------------------------------------

/**
 * Um check por CENÁRIO, para a UI do aluno — o análogo do `✔`/`✖` do lado
 * JavaScript. O `main` do harness escreve, no arquivo de relatório, uma
 * linha POR cenário executado (um cenário = um bloco `SM_TEST`):
 *
 *     SM<nonce> T <slug> ok       (nenhuma checa_* divergiu dentro dele)
 *     SM<nonce> T <slug> FALHOU   (ao menos uma checa_* divergiu)
 *
 * e o script as ecoa junto das linhas de contagem. O counter_protocol NUNCA
 * aborta (03-tdd §3.9.3) — então um cenário vermelho não esconde os
 * seguintes: a UI mostra TODOS os cenários, cada um com o seu veredito.
 * Quem decide o gate é `countRun`; `parseChecks` alimenta a UI.
 */
export function cParseChecks(output: string): RunCheck[] {
  // eslint-disable-next-line no-control-regex
  const linhas = output.replace(/\x1b\[[0-9;]*m/g, '').split('\n');
  const checks: RunCheck[] = [];
  for (const linha of linhas) {
    const m = /^SM\S+ T (.+?) (ok|FALHOU)\s*$/.exec(linha);
    if (!m) continue;
    checks.push({ name: m[1], passed: m[2] === 'ok' });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// (13) failureExitCodes
// ---------------------------------------------------------------------------

/**
 * ─── COMO C RECONHECE FALHA — OS EXITS NORMALIZADOS DO D-V11 ───────────────
 *
 * O `run.sh` gerado NORMALIZA o exit do runner (D-V11, `languages.md` :374):
 * **0** passou · **1** falhou (cenário `FALHOU` no counter_protocol,
 * compilação/ligação quebrada — inclui o starter que não define a função
 * pedida, o link reprova com símbolo indefinido — ou infra do runner) ·
 * **2** contagem errada · **3** timeout. NESTE runner gerado, 2 e 3 são da
 * camada da engine: 2 é a dupla-igualdade (`judgeCountMatches`), 3 é o kill
 * do executor — o runner não tem timeout próprio nem conhece
 * `expectedTestCount`. O diagnóstico bruto NÃO se perde: `EXIT_BRUTO` e
 * `DECORRIDO_MS` vão no stdout do script. Exit 0 MENTE de uma forma em C —
 * o `exit(0)` do código do aluno — por isso a igualdade dupla de contagem
 * continua obrigatória (`successRequiresCountMatch` é `true` LITERAL no
 * tipo, `registry.ts:421`), reforçada pelas três camadas do
 * `SM_RUNNER_SCRIPT`.
 */
export const C_FAILURE_POLICY: FailurePolicy = {
  isFailure: (exitCode: number): boolean => exitCode !== 0,
  meaning: (exitCode: number): string => {
    // 137 (SIGKILL) não distingue timeout de OOM — a mesma honestidade de
    // `exitCodeMeaning` (`engine/exec/proofs.ts:156`): nunca afirmar qual.
    if (exitCode === 137) return 'timeout-ou-OOM';
    if (exitCode === 0) return 'exit 0 (passou)';
    if (exitCode === 1) return 'exit 1 (falhou — cenário FALHOU no counter_protocol, compilação/ligação quebrada, ou infra; EXIT_BRUTO/DECORRIDO_MS no stdout carregam o bruto)';
    if (exitCode === 2) return 'exit 2 (contagem errada — decidido pela dupla-igualdade da engine, não pelo runner gerado)';
    if (exitCode === 3) return 'exit 3 (timeout — kill da engine; o runner gerado não tem timeout próprio)';
    if (exitCode === 127) return 'exit 127 (nenhum compilador C no PATH)';
    if (exitCode === 134) {
      return 'exit 134 (SIGABRT — FORA da convenção: o counter_protocol nunca aborta; ocorre só se o teste usar assert() contra a convenção — ver EXIT_BRUTO no stdout)';
    }
    return `exit ${exitCode}`;
  },
  successRequiresCountMatch: true,
};

// ---------------------------------------------------------------------------
// (14) envScrub — ALLOWLIST (§6 obs. 2)
// ---------------------------------------------------------------------------

/**
 * A política de ambiente do filho.
 *
 * `fixed` e `strip` NUNCA se sobrepõem (obrigatório — `applyEnvScrub` aplica
 * `fixed` e DEPOIS apaga `strip`; `applyLegacyEnvScrub` faz o contrário,
 * `registry.ts:456-457`).
 *
 * `strip` é o veneno de C nomeado no §6 obs. 2 (a observação lista
 * `CFLAGS`/`CARGO_TARGET_DIR` como exemplos de "veneno de cada linguagem"):
 * flags e caminhos de include/biblioteca herdados do desenvolvedor mudariam
 * o que o desafio compila e liga sem aparecer em lugar nenhum;
 * `LD_PRELOAD`/`LD_LIBRARY_PATH`/`DYLD_*` injetam código no filho — no
 * Windows o análogo é `LIB`/`INCLUDE`/`CL`. A lista `DYLD_*` é ENUMERADA
 * explicitamente porque o strip é por NOME (não existe glob) — os principais
 * vetores de injeção do loader do macOS estão cobertos; um `DYLD_*` novo do
 * Apple é limite declarado no `scope`.
 */
export const C_ENV_SCRUB: EnvScrubPolicy = {
  // `sh` + o compilador não precisam de nada além do `ENV_ALLOWLIST_COMUM`
  // (PATH/HOME/TMPDIR/…) que `applyEnvScrub` já une — o oposto do JavaScript,
  // que precisa de `npm_node_execpath`.
  allow: [],
  fixed: {
    // Paridade de endurecimento de rede com os lados JavaScript e Python.
    NO_PROXY: '*',
    no_proxy: '*',
  },
  strip: [
    // Flags de compilação herdadas mudariam o que o desafio compila.
    'CFLAGS',
    'CPPFLAGS',
    'CXXFLAGS',
    'LDFLAGS',
    // Caminhos de include/biblioteca herdados injetariam headers e libs de
    // fora do diretório isolado na prova.
    'CPATH',
    'C_INCLUDE_PATH',
    'CPLUS_INCLUDE_PATH',
    'OBJC_INCLUDE_PATH',
    'LIBRARY_PATH',
    'COMPILER_PATH',
    // Injeção de código no loader do filho (Linux/Unix).
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    // Injeção de código no loader do filho (macOS) — enumerada por nome.
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
    'DYLD_FALLBACK_LIBRARY_PATH',
    'DYLD_FRAMEWORK_PATH',
    'DYLD_PRINT_LIBRARIES',
    // O análogo do Visual Studio (o veneno de C no Windows).
    'LIB',
    'INCLUDE',
    'CL',
    'CLFLAGS',
    // Proxies herdados (o mesmo conjunto dos lados JavaScript e Python).
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    // ANSI na saída derruba o regex de contagem (defesa em profundidade).
    'FORCE_COLOR',
  ],
  scope: [
    'LC_ALL=C.UTF-8 + TZ=UTC (o núcleo comum do registro): mesma collation e mesmo fuso em toda execução',
    'CFLAGS/CPATH/C_INCLUDE_PATH/LIBRARY_PATH removidos: o desafio compila com a linha medida, não com o ambiente do dev',
    'LD_PRELOAD/LD_LIBRARY_PATH/DYLD_* removidos: nenhum código é injetado no loader do filho',
    'remove proxies herdados e injeta NO_PROXY=*: derruba tráfego via proxy, acidental ou hostil',
    'LIMITE: a lista DYLD_* é enumerada por nome (não existe glob) — um novo vetor do loader da Apple é brecha declarada',
    'LIMITE: não bloqueia socket cru (TCP/UDP) — um payload deliberado ainda conecta via socket puro',
    'LIMITE: o nonce do relatório transita na imagem do runner compilado — forjador forense que varre a própria memória pode recuperá-lo (mesmo grau do exit-guard do JavaScript)',
    'LIMITE: a semântica VIGENTE do harness é denylist (applyLegacyEnvScrub); a allowlist do §6 obs.2 é a troca deliberada da onda 5',
  ],
};

// ---------------------------------------------------------------------------
// O ADAPTADOR
// ---------------------------------------------------------------------------

/**
 * Tags de bloco cercado que a engine trata como C executável. `h` NÃO entra:
 * um bloco `h` de teoria é header — declaração sem corpo, que o parse aceita
 * mas que não é o que uma aula de C executa.
 */
export const C_THEORY_FENCE_TAGS: readonly string[] = ['c'];

/**
 * Tokens de `challenge.language` / `track.programmingLanguage` que resolvem
 * para este adaptador. `'c'` é a LINGUAGEM (e é o id); `'c11'` é o PADRÃO da
 * trilha (o que a linha medida compila) — o mesmo papel que `'python3'` tem
 * para Python: o nome da VERSÃO da linguagem, não outra linguagem.
 */
export const C_CHALLENGE_LANGUAGES: readonly ChallengeLanguageToken[] = ['c', 'c11'];

/**
 * O `track.runtime` default: o par (toolchain, padrão). O compilador EFETIVO
 * é o primeiro de cc/gcc/clang presente (a ordem de `cDetect` e do `run.sh`);
 * o padrão é o que a linha medida crava (`-std=c11`). A versão do compilador
 * não entra aqui pelo mesmo motivo do `'cpython'` (`lang/python.ts:1175-1182`):
 * cravá-la a faria envelhecer em silêncio a cada release.
 */
export const C_DEFAULT_RUNTIME = 'cc-c11';

export const cAdapter: LanguageAdapter = {
  id: 'c',
  label: 'C',
  challengeLanguages: C_CHALLENGE_LANGUAGES,
  defaultRuntime: C_DEFAULT_RUNTIME,
  theoryFenceTags: C_THEORY_FENCE_TAGS,

  parse: cParse,
  constructKey: cConstructKey,
  inventory: cInventory,
  globals: cGlobals,
  builtins: cBuiltins,
  resolveScopes: cResolveScopes,
  forbiddenInvariants: C_FORBIDDEN_INVARIANTS,
  layout: cLayout,
  filePathPattern: C_SAFE_FILE_PATH_RE,
  testCommand: C_TEST_COMMAND,
  countDeclared: cCountDeclared,
  countRun: cCountRun,
  parseChecks: cParseChecks,
  failureExitCodes: C_FAILURE_POLICY,
  envScrub: C_ENV_SCRUB,
  detect: cDetect,
};

/**
 * O eixo `form:` NÃO está disponível em C na v1 — declarado como valor, não
 * como comentário, pelo mesmo motivo do `PY_FORM_AXIS_SUPPORTED`
 * (`lang/python.ts:1209-1217`): `engine/form/selector.ts:344` é tipado sobre
 * `ts.Node`. As distinções de currículo de C foram para os eixos
 * `node:`/`decl:`/`op:` como nós portadores.
 */
export const C_FORM_AXIS_SUPPORTED = false;
