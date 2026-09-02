/**
 * app/electron/main/engine/lang/python.ts — O ADAPTADOR PYTHON.
 *
 * A SEGUNDA linha da tabela do §6 de
 * `docs/research/08-multilingua-trava-deterministica.md` (linhas 866-891) — e
 * a que PROVA a arquitetura, porque §7 item 3 diz exatamente isto: "é aqui que
 * se prova que o adaptador de Porta 1 pode ser um SUBPROCESSO e não só uma lib
 * npm". O `javascript.ts` roda dentro do processo com o compilador TypeScript;
 * este roda `python3` por `spawnSync` e conversa com ele por JSON.
 *
 * Fonte NORMATIVA de conteúdo: `docs/17-trilha-python.md` (a spec da trilha
 * `python-do-zero`), §"O que o `ast` esconde" e §"Vocabulário de átomos".
 * Fonte NORMATIVA de operação: `skills/study-method/scripts/challenge-new.sh`
 * (linhas 92-160, 602-611, 675-677 e 866-869), que já é um registro por
 * linguagem em bash, MEDIDO nesta máquina — os valores abaixo são PORTADOS de
 * lá, não re-derivados.
 *
 * ─── AS SEIS DECISÕES DESTE ARQUIVO ───────────────────────────────────────
 *
 * 1. `parse` É SÍNCRONO E USA `spawnSync`. A decisão está registrada em
 *    `registry.ts:28-38`: tornar a interface `async` converteria ~20 call
 *    sites de `extract.ts`/`budget.ts`/`audit.ts`. Uma invocação custa 73-106
 *    ms (medido, `docs/research/08` §5); por isso `parse` MEMOIZA por fonte
 *    (`CACHE_PARSE`) — sem o cache, uma auditoria de trilha inteira faria
 *    milhares de spawns.
 *
 * 2. O FONTE VAI PELO STDIN, NUNCA POR `-c`. Escapar o código do aluno em
 *    linha de comando é risco de quoting e, pior, destrói a fidelidade de
 *    `col_offset` — e o relatório da engine é `arquivo:linha:coluna`.
 *
 * 3. O EIXO `decl:` É REPROPOSTO PARA FORMAS DE LIGAÇÃO. Python não tem
 *    palavra-chave de declaração (não há `let`/`const`/`var`). A alternativa
 *    era deixar o eixo VAZIO; a escolha foi repropô-lo — ver o bloco
 *    "O EIXO `decl:` EM PYTHON" abaixo, que defende a decisão.
 *
 * 4. AS DOZE DISTINÇÕES VIRAM CHAVES SINTÉTICAS. O `ast` do Python colapsa
 *    distinções que são eventos de currículo (`7` e `"oi"` são o MESMO
 *    `ast.Constant`; `elif` e `else:`+`if` têm AST IDÊNTICA). Sem refinar,
 *    aulas inteiras introduziriam ZERO construção nova e violariam a regra A6.
 *    O precedente de nomenclatura é `node:ComputedNonLiteralAccess`
 *    (`engine/atomKeys.ts:170`): PascalCase, não existe no enum do parser, e
 *    mesmo assim é emitido. Ver `vocab/py/extract_ast.py`.
 *
 * 5. O EIXO `form:` ESTÁ DESABILITADO NA V1, E ISSO ESTÁ DECLARADO.
 *    `engine/form/selector.ts:344` é tipado sobre `ts.Node`; generalizar o
 *    seletor é projeto próprio. `formSupported` é `false` e
 *    `docs/17-trilha-python.md` já conta com isso — é por causa DELE que as
 *    doze distinções tiveram de virar chave sintética nos eixos `node:`/
 *    `decl:`: não há para onde empurrá-las.
 *
 * 6. NÃO EXISTE PORTE DIRETO DO `EXIT_GUARD_SOURCE`. Ver o bloco "O LIMITE DE
 *    SEGURANÇA DO EXIT-GUARD" antes de `PY_FAILURE_POLICY`. Está escrito no
 *    código de propósito: limite escondido é pior que limite nenhum.
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

// NOTA DE CICLO (a mesma de `javascript.ts:63-67`): o import acima é
// `import type` e TEM de continuar sendo. `registry.ts` importa o VALOR
// `pythonAdapter` daqui; um import de valor na volta fecharia o ciclo em tempo
// de AVALIAÇÃO. Import de tipo é apagado na compilação — não existe em runtime.

// ---------------------------------------------------------------------------
// Módulos carregados sob demanda
// ---------------------------------------------------------------------------
//
// Mesmo motivo de `javascript.ts:34-43`: `content/trackTypes.ts` importa
// `lang/registry.ts`, que importa este arquivo, e o loader de conteúdo (quem
// só quer abrir uma aula) não pode pagar por `node:child_process`.

type ChildProcessModule = typeof import('node:child_process');
type FsModule = typeof import('node:fs');
type PathModule = typeof import('node:path');
type UrlModule = typeof import('node:url');

function carregar<T>(modulo: string): T {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(modulo) as T;
}

// ---------------------------------------------------------------------------
// Onde moram os artefatos Python (o extrator e o inventário)
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
 * Resolve um artefato Python entre candidatos, na ordem. A lista existe porque
 * o mesmo arquivo é procurado em três topologias: fonte (tsx/testes,
 * `engine/lang/` → `engine/vocab/`), bundle do electron-vite (tudo achatado em
 * `out/main/`) e, por último, a raiz do repositório — que é a rede de proteção
 * de quem roda o CLI de outro diretório.
 *
 * A variável de ambiente vem PRIMEIRO por um motivo operacional: quando o
 * `.py` não for empacotado no build, é ela que conserta a instalação sem
 * recompilar nada.
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

/** Caminho do extrator (`vocab/py/extract_ast.py`). */
export function pyExtractorPath(): string | null {
  return resolverArtefato(carregar<PathModule>('node:path').join('py', 'extract_ast.py'), 'STUDY_METHOD_PY_EXTRACTOR');
}

/** Caminho do inventário gerado (`vocab/atoms.python.json`). */
export function pyAtomsPath(): string | null {
  return resolverArtefato('atoms.python.json', 'STUDY_METHOD_PY_ATOMS');
}

// ---------------------------------------------------------------------------
// (15) detect() — `python3 --version` e a mensagem de degradação
// ---------------------------------------------------------------------------

/**
 * Os binários candidatos, na ordem de tentativa. `python3` primeiro porque é
 * o que `challenge-new.sh:94` (`python:bin`) declara e o que existe em toda
 * distribuição moderna; `python` só como rede de proteção (no Windows é o
 * nome canônico e no Arch é um symlink para o 3).
 */
export const PY_BINARIOS: readonly string[] = ['python3', 'python'];

/** `Python 3.14.7` → `3.14.7`. Aceita stdout OU stderr (o 2.x escrevia no 2). */
function versaoDoTexto(texto: string): string | null {
  const m = /Python\s+(\d+\.\d+(?:\.\d+)?)/.exec(texto);
  return m ? m[1] : null;
}

let detectMemo: DetectResult | null = null;

/**
 * Detecção da toolchain. Ao contrário do JavaScript — em que o runtime do
 * filho é o mesmo do processo e a versão sai de `process.versions` —, aqui há
 * SUBPROCESSO de verdade, e é por isso que a assinatura do §6 tem de continuar
 * síncrona (`registry.ts:28-38`).
 *
 * A `degradacao` cobre TRÊS casos distintos, e cada um diz o que deixou de
 * funcionar:
 *   - sem `python3` na máquina: nenhuma prova de execução de desafio Python
 *     roda (e o gate NÃO pode aprovar por omissão);
 *   - sem o `extract_ast.py` no disco: o parser não existe, então nem o
 *     ORÇAMENTO pode ser auditado;
 *   - versão DIFERENTE da que gerou `atoms.python.json`: o inventário mente
 *     nos dois sentidos (o 3.14 acrescentou `TemplateStr`/`Interpolation` do
 *     PEP 750), e isso é aviso, não bloqueio.
 */
export function pyDetect(): DetectResult {
  if (detectMemo !== null) return detectMemo;
  const { spawnSync } = carregar<ChildProcessModule>('node:child_process');

  let binario: string | null = null;
  let versao: string | null = null;
  for (const candidato of PY_BINARIOS) {
    let res;
    try {
      res = spawnSync(candidato, ['--version'], { encoding: 'utf8', timeout: 10_000 });
    } catch {
      continue;
    }
    if (res.error || res.status !== 0) continue;
    const achada = versaoDoTexto(`${res.stdout ?? ''}\n${res.stderr ?? ''}`);
    if (achada === null) continue;
    binario = candidato;
    versao = achada;
    break;
  }

  const extrator = pyExtractorPath();
  const avisos: string[] = [];
  if (binario === null) {
    avisos.push(
      `nenhum interpretador Python encontrado no PATH (procurados: ${PY_BINARIOS.join(', ')}) — ` +
        'as provas por execução de desafio Python NÃO rodam e o gate reprova por falta de prova, nunca aprova por omissão',
    );
  }
  if (extrator === null) {
    avisos.push(
      'vocab/py/extract_ast.py não encontrado — sem o extrator não há Porta 1 para Python: ' +
        'nenhum trecho é parseado e nenhum orçamento é auditado (defina STUDY_METHOD_PY_EXTRACTOR para apontar o arquivo)',
    );
  }
  const inventario = pyInventarioBruto();
  if (binario !== null && inventario !== null && inventario.python_version !== versao) {
    avisos.push(
      `atoms.python.json foi gerado no Python ${inventario.python_version} e a máquina tem ${versao} — ` +
        'o inventário de nós é POR VERSÃO (o 3.14 acrescentou TemplateStr/Interpolation do PEP 750); ' +
        'regere com `python3 electron/main/engine/vocab/py/gerar_inventario.py`',
    );
  }

  detectMemo = {
    ok: binario !== null && extrator !== null,
    binary: binario ?? PY_BINARIOS[0],
    version: versao,
    degradacao: avisos.length > 0 ? avisos.join(' | ') : null,
  };
  return detectMemo;
}

/** Só para os testes: esquece a detecção memoizada. */
export function pyResetDetectCache(): void {
  detectMemo = null;
}

// ---------------------------------------------------------------------------
// (3)(4) inventory() / globals() / builtins() — do artefato GERADO
// ---------------------------------------------------------------------------

/** O layout de `vocab/atoms.python.json` (gerado por `py/gerar_inventario.py`). */
export interface AtomosPythonJson {
  schema: 1;
  python_version: string;
  python_implementation: string;
  axes: { node: string[]; op: string[]; decl: string[]; global: string[]; api: string[] };
  /** subconjunto de `axes.global` que a LINGUAGEM embute (sem os dunders). */
  builtins: string[];
  total: number;
}

let inventarioMemo: AtomosPythonJson | null | undefined;

/** O JSON cru, ou `null` quando o artefato não está no disco (fail-soft). */
export function pyInventarioBruto(): AtomosPythonJson | null {
  if (inventarioMemo === undefined) {
    const caminho = pyAtomsPath();
    if (caminho === null) {
      inventarioMemo = null;
    } else {
      const fs = carregar<FsModule>('node:fs');
      try {
        inventarioMemo = JSON.parse(fs.readFileSync(caminho, 'utf8')) as AtomosPythonJson;
      } catch {
        inventarioMemo = null;
      }
    }
  }
  return inventarioMemo ?? null;
}

/** Só para os testes: esquece o inventário memoizado. */
export function pyResetInventarioCache(): void {
  inventarioMemo = undefined;
}

function semPrefixo(chaves: readonly string[] | undefined, prefixo: string): string[] {
  if (!chaves) return [];
  return chaves.map((k) => (k.startsWith(prefixo) ? k.slice(prefixo.length) : k));
}

/**
 * O enum FECHADO de tipos de nó. Sai do artefato GERADO — nunca digitado (§6:
 * "gerado do `inventory()` do adaptador, nunca digitado") — e o artefato
 * carrega a `python_version` que o produziu porque o universo MUDA por versão.
 * Inclui as chaves SINTÉTICAS das doze distinções: `IntLiteral`, `StrLiteral`,
 * `Elif`, `MethodDef`, … Não inclui `Constant` (sempre refinado) nem as
 * classes que são só operador (`Add`, `Eq`, `And` — viram eixo `op:`).
 */
export function pyInventory(): readonly string[] {
  return semPrefixo(pyInventarioBruto()?.axes.node, 'node:');
}

/**
 * Os nomes GLOBAIS de módulo: `dir(builtins)` MAIS os dunders que todo módulo
 * tem (`__file__`, `__builtins__`, `__annotations__`, …).
 */
export function pyGlobals(): ReadonlySet<string> {
  return new Set(semPrefixo(pyInventarioBruto()?.axes.global, 'global:'));
}

/**
 * Os BUILTINS da LINGUAGEM (`len`, `range`, `ValueError`) — subconjunto
 * estrito de `pyGlobals()`. É exatamente a separação que o §6 pede ao listar
 * `globals()`/`builtins()` com barra: em JavaScript os dois conjuntos
 * coincidem (tudo é propriedade de `globalThis`); em Python `len` é builtin e
 * `__file__` é global de módulo, e não são a mesma coisa.
 */
export function pyBuiltins(): ReadonlySet<string> {
  const bruto = pyInventarioBruto();
  if (bruto === null) return new Set();
  return new Set(bruto.builtins ?? semPrefixo(bruto.axes.global, 'global:'));
}

// ---------------------------------------------------------------------------
// (1) parse(source) — a Porta 1 por SUBPROCESSO
// ---------------------------------------------------------------------------

/** O que `vocab/py/extract_ast.py` devolve no stdout. */
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
  pythonVersion: string;
  implementation: string;
  root: NoBruto;
  scopes: { declared: string[]; imported: string[]; free: string[] };
}

interface SaidaErro {
  ok: false;
  error: { code: 'PARSE_ERROR'; message: string; line: number; column: number };
}

/** A árvore NATIVA que vai em `ParseOk.native` — o payload do subprocesso. */
export type PythonNative = SaidaOk;

/**
 * Argumentos FIXOS do interpretador ao invocar o extrator.
 * `-I` (isolated) implica `-E` (ignora `PYTHON*` do ambiente) e `-s` (sem
 * site do usuário) e tira o diretório do script do `sys.path`; `-S` não
 * importa o `site`. Juntos garantem que nenhum `sitecustomize.py`, `.pth` ou
 * pacote do usuário participe da ANÁLISE.
 *
 * ATENÇÃO: `-I` NÃO pode ir para o RUNNER dos testes (`PY_TEST_COMMAND`), que
 * precisa do diretório corrente no `sys.path` para achar `solucao.py`.
 */
export const PY_PARSE_FLAGS: readonly string[] = ['-I', '-S'];

/** Teto do memo de parse. Fonte de aula tem dezenas de linhas; 512 sobra. */
const CACHE_MAX = 512;
const CACHE_PARSE = new Map<string, ParseResult>();

/** Só para os testes: esvazia o memo de parse. */
export function pyResetParseCache(): void {
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
  };
}

function erroDeParse(message: string, line = 1, column = 1): ParseResult {
  return { ok: false, error: { code: 'PARSE_ERROR', message, line, column } };
}

/**
 * Parseia Python invocando `python3 -I -S vocab/py/extract_ast.py` com o fonte
 * no STDIN e lendo JSON do STDOUT.
 *
 * FAIL-CLOSED em toda saída: erro de sintaxe, extrator ausente, interpretador
 * ausente, timeout, stdout que não é JSON — TUDO vira o MESMO `PARSE_ERROR`
 * estruturado que `extract.ts:344-357` já sabe tratar. Árvore parcial ou
 * exceção solta seriam as duas formas de o gate mentir.
 *
 * "PARSEIE TUDO, REPROVE NO ORÇAMENTO": o adaptador nunca restringe a
 * gramática — quem reprova é `budget.ts`.
 */
export function pyParse(source: string, options: ParseOptions = {}): ParseResult {
  const fileName = options.fileName ?? '<trecho>';
  const chave = `${fileName} ${source}`;
  const memo = CACHE_PARSE.get(chave);
  if (memo !== undefined) return memo;

  const resultado = pyParseSemCache(source, fileName);
  if (CACHE_PARSE.size >= CACHE_MAX) {
    // FIFO simples: a primeira chave inserida sai. Cache de build, não LRU de
    // servidor — a complexidade de um LRU aqui não se paga.
    const primeira = CACHE_PARSE.keys().next();
    if (!primeira.done) CACHE_PARSE.delete(primeira.value);
  }
  CACHE_PARSE.set(chave, resultado);
  return resultado;
}

function pyParseSemCache(source: string, fileName: string): ParseResult {
  const extrator = pyExtractorPath();
  if (extrator === null) {
    return erroDeParse(
      'extrator Python ausente: vocab/py/extract_ast.py não foi encontrado ' +
        '(defina STUDY_METHOD_PY_EXTRACTOR para apontar o arquivo)',
    );
  }
  const deteccao = pyDetect();
  const binario = deteccao.version === null ? null : deteccao.binary;
  if (binario === null) {
    return erroDeParse(
      `interpretador Python ausente: nenhum de ${PY_BINARIOS.join(', ')} respondeu a --version no PATH`,
    );
  }

  const { spawnSync } = carregar<ChildProcessModule>('node:child_process');
  const res = spawnSync(binario, [...PY_PARSE_FLAGS, extrator, fileName], {
    input: source,
    encoding: 'utf8',
    // Timeout do PARSER, não do runner: o §5 mediu 73/89/106 ms por invocação;
    // 30 s é três ordens de grandeza acima e só dispara em travamento real.
    timeout: 30_000,
    // Um AST de arquivo grande em JSON passa fácil do 1 MB default do Node.
    maxBuffer: 64 * 1024 * 1024,
    env: pyApplyParseEnv(process.env),
  });

  if (res.error) return erroDeParse(`falha ao executar ${binario}: ${res.error.message}`);
  if (res.status !== 0) {
    const stderr = (res.stderr ?? '').trim();
    return erroDeParse(
      `${binario} saiu com ${res.status === null ? 'sinal ' + String(res.signal) : 'exit ' + String(res.status)}` +
        (stderr ? `: ${stderr.split('\n').slice(-3).join(' ')}` : ''),
    );
  }

  let payload: SaidaOk | SaidaErro;
  try {
    payload = JSON.parse(res.stdout ?? '') as SaidaOk | SaidaErro;
  } catch {
    return erroDeParse(`saída do extrator Python não é JSON: ${(res.stdout ?? '').slice(0, 200)}`);
  }
  if (!payload.ok) {
    return { ok: false, error: { ...payload.error, code: 'PARSE_ERROR' } };
  }
  return { ok: true, root: normalizarNo(payload.root), source, native: payload };
}

/**
 * O ambiente do subprocesso do PARSER. É a allowlist do §6 obs. 2 aplicada a
 * um caso em que ela é barata: o parser não precisa de nada do ambiente além
 * do necessário para o binário ser encontrado, e `-I` já ignora as `PYTHON*`.
 * Aplicada aqui de propósito — a Porta 1 é etapa de BUILD determinística, e o
 * ambiente do desenvolvedor não pode mudar o resultado da análise.
 */
export function pyApplyParseEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const nome of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'PATHEXT']) {
    const valor = base[nome];
    if (valor !== undefined) env[nome] = valor;
  }
  env.LC_ALL = 'C.UTF-8';
  env.TZ = 'UTC';
  env.PYTHONIOENCODING = 'utf-8';
  env.PYTHONHASHSEED = '0';
  env.PYTHONDONTWRITEBYTECODE = '1';
  return env;
}

// ---------------------------------------------------------------------------
// (5) resolveScopes — o que põe Python em Tier A
// ---------------------------------------------------------------------------

/**
 * Resolução de escopo pelo `symtable` da stdlib, calculado no MESMO
 * subprocesso do parse (nenhum spawn extra). É o análogo exato do
 * `eslint-scope`, e é ELE que põe Python em Tier A — o §7 fecha com "nunca
 * promover uma linguagem a Tier A sem resolução de escopo".
 *
 * ESTRITAMENTE MELHOR QUE O CAMINHO JAVASCRIPT DE HOJE. `extract.ts:38-43` se
 * autodocumenta como cego a shadowing: a resolução lá é PLANA (junta todo nome
 * declarado no arquivo e trata como global o identificador que sobrou), e um
 * `const console = …` deliberado faria o extrator deixar de reportar
 * `global:console`. Aqui a análise é POR TABELA:
 *
 *     def f():
 *         len = 3          # sombra local
 *         return len       # NÃO é global:len — e o gate vê isso
 *     def g():
 *         return len([1])  # AQUI continua sendo global:len
 *
 * CONSEQUÊNCIA DE CONJUNTO A DECLARAR: como `free` é por escopo, um nome pode
 * aparecer em `declared` E em `free` ao mesmo tempo (o `len` do exemplo:
 * declarado em `f`, livre em `g`). Isso é correto e é o preço de ser preciso;
 * a leitura certa de `free` é "livre em ALGUM escopo", não "livre no arquivo".
 */
export function pyResolveScopes(parsed: ParseOk): ScopeResolution {
  const native = parsed.native as PythonNative | undefined;
  const escopos = native?.scopes ?? { declared: [], imported: [], free: [] };
  const builtins = pyGlobals();
  const globais = new Set<string>();
  for (const nome of escopos.free) if (builtins.has(nome)) globais.add(nome);
  return {
    declared: new Set(escopos.declared),
    imported: new Set(escopos.imported),
    free: new Set(escopos.free),
    globals: globais,
  };
}

// ---------------------------------------------------------------------------
// (2) constructKey(node) — os CINCO eixos que Python cobre
// ---------------------------------------------------------------------------

/**
 * ─── O EIXO `decl:` EM PYTHON — A DECISÃO, E O MOTIVO ─────────────────────
 *
 * Python NÃO TEM palavra-chave de declaração. Havia duas saídas:
 *   (a) deixar o eixo VAZIO — honesto, e o eixo simplesmente não existiria
 *       nesta linguagem;
 *   (b) REPROPÔ-LO para FORMAS DE LIGAÇÃO de nome.
 *
 * Escolhida a (b), e a razão é PEDAGÓGICA, não técnica. `atomKeys.ts:13-16`
 * diz por que o eixo existe: "metade da didática de JavaScript não está no
 * TIPO do nó, está no ATRIBUTO … `let`, `const` e `var` são a mesma
 * declaração", e o eixo foi criado para que "variável renda mais aulas".
 * O VALOR do eixo é a distinção de FORMA, não a palavra-chave — e em Python
 * `x = 1`, `x: int = 1`, `x += 1`, `a, b = 1, 2` e `(n := f())` são cinco
 * aulas genuinamente diferentes com o MESMO tipo de nó de ligação. Deixar o
 * eixo vazio jogaria essas cinco aulas para `node:Assign`/`node:AnnAssign` e
 * perderia justamente `decl:unpack`, que `docs/17-trilha-python.md` §"Módulo
 * 7" já pressupõe (a aula `desempacotar-dois-nomes` e `percorrer-um-dicionario`
 * dependem dele) e que NÃO é distinguível de `x = 1` no eixo de nós — a AST é
 * a mesma.
 *
 * As ONZE formas (docs/17, §"Vocabulário"): `assign`, `ann`, `aug`, `unpack`,
 * `walrus`, `global`, `nonlocal`, `vararg`, `kwarg`, `default`, `except-as`.
 *
 * ─── OS EIXOS QUE ESTE `constructKey` COBRE ───────────────────────────────
 *
 * CINCO: `node:`, `decl:`, `op:`, `global:` e `api:` — dois a mais que o
 * `jsConstructKey`, que declara cobrir só os três que saem do nó e deixa
 * `global:`/`api:` para `extract.ts:400-440`. Aqui eles cabem porque o
 * subprocesso já traz a resolução de escopo do `symtable` e marca as
 * referências livres e as cadeias de atributo como NÓS SINTÉTICOS — cada um
 * com linha e coluna próprias, que é o que o relatório
 * `arquivo:linha:coluna` exige.
 *
 * FORA: `term:` (prosa pt-BR, neutro de linguagem, produzido por outro
 * módulo) e `form:` (DESABILITADO na v1 — `form/selector.ts:344` é tipado
 * sobre `ts.Node`).
 */
export function pyConstructKey(node: LangNode): string | null {
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
 * PROIBIÇÕES GLOBAIS — as construções que quebram a decidibilidade da análise
 * estática. Se o código pode montar nomes em tempo de execução, nenhuma
 * promessa de orçamento se sustenta. Lista de `docs/research/08` §5 (linhas
 * 492-495) e de `docs/17-trilha-python.md` §"Os fatos da linguagem".
 *
 * DUAS DIFERENÇAS DELIBERADAS EM RELAÇÃO À LISTA DE JAVASCRIPT:
 *
 * 1. `node:ComputedNonLiteralAccess` NÃO tem contraparte aqui. Em JavaScript
 *    `obj[expr]` com chave calculada é proibido porque torna a API usada
 *    indecidível; em Python `d[chave]` com chave variável é o CORAÇÃO do
 *    módulo 7 da trilha (dicionários) e proibi-lo mataria a matéria. O que é
 *    indecidível em Python é `getattr(o, nome)` — o ATRIBUTO montado, não o
 *    ÍNDICE — e é isso que `node:ComputedNonLiteralAttribute` marca (só quando
 *    o 2º argumento NÃO é literal de texto: `getattr(o, "saldo")` é decidível
 *    e continua permitido).
 * 2. `global:arguments` e `node:WithStatement` não existem em Python; `with`
 *    é `node:With` e é matéria legítima (arquivos, `unittest.assertRaises`).
 */
export const PY_FORBIDDEN_INVARIANTS: readonly string[] = [
  'global:eval',
  'global:exec',
  'global:compile',
  'global:__import__',
  'global:globals',
  'global:locals',
  'global:vars',
  'api:importlib.import_module',
  'node:ComputedNonLiteralAttribute',
  'node:DynamicAttributeHook',
];

// ---------------------------------------------------------------------------
// (7) layout(challenge) — e o `tests/__init__.py` OBRIGATÓRIO
// ---------------------------------------------------------------------------

/** O módulo que o teste importa (`from solucao import …`). */
export const PY_ENTRY_PATH = 'solucao.py';
/** O arquivo de teste. Tem de casar `test_*.py` — é o `-p` do `discover`. */
export const PY_TEST_PATH = 'tests/test_solucao.py';
/** O pacote de testes. OBRIGATÓRIO — ver `PY_PACKAGE_MARKER_CONTENT`. */
export const PY_PACKAGE_MARKER = 'tests/__init__.py';

/**
 * ARMADILHA MEDIDA (`challenge-new.sh:866-869`): o Python 3.14 RECUSA
 * `unittest discover -t .` num diretório que não é pacote —
 * `ImportError: Start directory is not importable`. Sem este arquivo o runner
 * não roda NADA, e "nada rodou" com exit != 0 seria confundido com "falhou".
 * É por isso que ele é parte do LAYOUT e não uma conveniência.
 */
export const PY_PACKAGE_MARKER_CONTENT = `# tests/__init__.py — harness do desafio. Leia; não edite.
#
# DUAS FUNÇÕES, as duas MEDIDAS nesta máquina (CPython 3.14.7):
#
# 1. FAZ DE tests/ UM PACOTE. Sem este arquivo o \`unittest discover -t .\`
#    RECUSA o diretório: "ImportError: Start directory is not importable".
#    Nada roda — e "nada rodou" seria confundido com "falhou".
#
# 2. É O EXIT-GUARD. É o porte do \`EXIT_GUARD_SOURCE\` do lado JavaScript
#    (engine/exec/harness.ts:120), que lá entra por \`node --require\`. Em
#    Python não existe \`--require\`, mas o \`discover\` importa o PACOTE
#    \`tests\` ANTES de qualquer módulo de teste — e, portanto, antes de
#    \`solucao.py\`. Este arquivo é o primeiro código do desafio a rodar.
#
# O ATAQUE QUE ISTO BLOQUEIA (medido, é a CRITICAL 1 do lado JavaScript):
#     import os, sys
#     sys.stderr.write("Ran 2 tests in 0.001s\\n\\nOK\\n")   # relatório FORJADO
#     os._exit(0)                                          # mata o processo
# Sem o guard: exit 0 e um relatório que a engine leria como 2 testes passando.
# Com o guard: RuntimeError no import, "Ran 1 test / FAILED (errors=1)", exit 1.
#
# POR QUE \`sys.exit\` NÃO É PATCHEADO (armadilha medida): o próprio
# \`unittest.main()\` chama \`sys.exit()\` para definir o exit code — patcheá-lo
# quebra o CAMINHO FELIZ (a suíte verde passaria a sair 1). E não é preciso:
# um \`sys.exit()\` no import já é capturado pelo loader do unittest e vira
# erro do teste. O buraco de verdade é só \`os._exit\`/\`os.abort\`, que
# encerram o processo sem desempilhar nada.
#
# LIMITE: isto é defesa em profundidade, não sandbox. Um payload deliberado
# ainda alcança \`_exit\` por \`ctypes\` ou \`signal.raise_signal\` — mas aí o
# exit code não é 0, e a igualdade dupla de contagem reprova.
import os as _sm_os


def _sm_exit_guard(_nome):
    def _bloqueia(*_args, **_kwargs):
        raise RuntimeError(
            "exit-guard: os." + _nome + " bloqueado — o código sob teste não pode "
            "encerrar o processo das provas antes do relatório do unittest"
        )

    return _bloqueia


_sm_os._exit = _sm_exit_guard("_exit")
_sm_os.abort = _sm_exit_guard("abort")
`;

/**
 * Os arquivos do desafio em disco, na ORDEM de escrita.
 *
 * NÃO HÁ MANIFESTO — e a ausência é informação, não esquecimento: Python não
 * tem análogo do `package.json {type:'module'}` que o layout de JavaScript
 * escreve (não existe `"type": "module"` a declarar; um módulo Python é um
 * arquivo `.py` e ponto). Por isso `manifestPath` é `null`. O que ocupa o
 * lugar do manifesto na função de "sem isto o runner não roda" é o
 * `tests/__init__.py`.
 */
export function pyLayout(challenge: ChallengeLayoutInput): ChallengeLayout {
  const files: { path: string; content: string }[] = [
    { path: PY_PACKAGE_MARKER, content: PY_PACKAGE_MARKER_CONTENT },
  ];
  if (challenge.files && challenge.files.length > 0) {
    for (const f of challenge.files) files.push({ path: f.path, content: f.code });
  } else {
    files.push({ path: PY_ENTRY_PATH, content: challenge.code });
  }
  files.push({ path: PY_TEST_PATH, content: challenge.testsCode });
  return { files, entryPath: PY_ENTRY_PATH, testPath: PY_TEST_PATH, manifestPath: null };
}

// ---------------------------------------------------------------------------
// (8) filePathPattern
// ---------------------------------------------------------------------------

/**
 * Caminho SEGURO de arquivo de desafio Python: letras/dígitos/`_`/`-`/`/`,
 * terminando em `.py`. Proíbe `..`, ponto no meio e qualquer escape do
 * diretório de execução — a mesma forma do `JS_SAFE_FILE_PATH_RE`, com a
 * extensão trocada (§6 obs. 1: "`SAFE_FILE_PATH_RE` está travado em `.mjs`").
 *
 * SEM a flag `g`: `RegExp` com `g` guarda `lastIndex` entre chamadas e daria
 * falso-negativo alternado em `.test()`.
 */
export const PY_SAFE_FILE_PATH_RE = /^[a-zA-Z0-9_\-/]+\.py$/;

// ---------------------------------------------------------------------------
// (9) testCommand
// ---------------------------------------------------------------------------

/**
 * Comando exato do runner, PORTADO de `challenge-new.sh:602-611` (que o mediu
 * nesta máquina). Sem o binário — ele vem de `detect()`.
 *
 * `-B` NÃO É OPCIONAL. Sem ele, um mutante do MESMO TAMANHO reaproveita o
 * `.pyc` velho do `__pycache__` e o teste "passa" contra o código antigo — a
 * prova mentiria. (`PYTHONDONTWRITEBYTECODE=1` no `envScrub` é o cinto; o `-B`
 * é o suspensório: um deles pode ser removido por engano, os dois não.)
 *
 * `-t .` põe a RAIZ de importação no diretório do desafio, para que
 * `from solucao import …` resolva; e é ele que exige o `tests/__init__.py`.
 *
 * `-v` é o que faz o unittest imprimir uma linha por teste — sem ele não há
 * `parseChecks` possível (o unittest não tem saída estruturada: `-h` não
 * lista `--junit-xml` nem TAP; ver `docs/research/08` §5).
 */
export const PY_TEST_COMMAND: readonly string[] = [
  '-B',
  '-m',
  'unittest',
  'discover',
  '-s',
  'tests',
  '-t',
  '.',
  '-p',
  'test_*.py',
  '-v',
];

// ---------------------------------------------------------------------------
// (10) countDeclared — o lado DECLARADO da dupla-igualdade
// ---------------------------------------------------------------------------

function baseEhTestCase(base: LangNode, conhecidas: ReadonlySet<string>): boolean {
  // `class T(unittest.TestCase)` — o nó da base é um `Attribute`.
  if (base.type === 'Attribute') return base.attributes.attr === 'TestCase';
  // `from unittest import TestCase` + `class T(TestCase)`, ou uma classe-base
  // local que já foi reconhecida como derivada de TestCase.
  if (base.type === 'Name') {
    const id = base.attributes.id;
    return id === 'TestCase' || (id !== undefined && conhecidas.has(id));
  }
  return false;
}

/**
 * Contagem ESTÁTICA de testes no fonte, POR AST — o lado DECLARADO da
 * dupla-igualdade (§6 obs. 3), e o número que `judgeCountMatches` compara com
 * o executado.
 *
 * ESTRITAMENTE MELHOR QUE A VERSÃO JAVASCRIPT. `extract.ts:494`
 * (`countTestDeclarations`) conta toda chamada ao identificador `test` —
 * o que em Node é o certo, porque `node:test` coleta por chamada. Aqui a
 * regra do `unittest` é OUTRA e mais estrita: só conta método cujo nome
 * começa com `test` E que está no CORPO de uma classe que herda de
 * `unittest.TestCase`. Consequências reais:
 *   - `def test_x()` solto no módulo NÃO conta — e não conta certo, porque o
 *     `unittest discover` também não o coleta;
 *   - `def helper()` dentro da classe não conta;
 *   - uma classe-base local (`class Base(unittest.TestCase)`) propaga a
 *     herança para quem a estende, por ponto fixo.
 *
 * Preserva a propriedade que `extract.ts:490-493` exige: AST, nunca regex —
 * comentário não é nó, e um `# def test_x` comentado não conta.
 *
 * FAIL-CLOSED: fonte que não parseia devolve 0, e 0 nunca bate com um
 * `expectedTestCount` legítimo (a dupla-igualdade reprova).
 */
export function pyCountDeclared(testsCode: string): number {
  const parsed = pyParse(testsCode, { fileName: 'tests/test_solucao.py' });
  if (!parsed.ok) return 0;

  // 1º passo: quais ClassDef herdam de TestCase (com ponto fixo para as bases
  // locais — `class Base(unittest.TestCase)` e depois `class T(Base)`).
  const classes: LangNode[] = [];
  const coletar = (no: LangNode): void => {
    if (no.type === 'ClassDef') classes.push(no);
    for (const filho of no.children) coletar(filho);
  };
  coletar(parsed.root);

  const derivadas = new Set<string>();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const classe of classes) {
      const nome = classe.attributes.name;
      if (nome === undefined || derivadas.has(nome)) continue;
      const bases = classe.children.filter((c) => c.attributes.field === 'bases');
      if (bases.some((b) => baseEhTestCase(b, derivadas))) {
        derivadas.add(nome);
        mudou = true;
      }
    }
  }

  // 2º passo: métodos `test*` no CORPO dessas classes.
  let total = 0;
  for (const classe of classes) {
    const nome = classe.attributes.name;
    if (nome === undefined || !derivadas.has(nome)) continue;
    for (const membro of classe.children) {
      if (membro.attributes.field !== 'body') continue;
      if (membro.type !== 'FunctionDef' && membro.type !== 'AsyncFunctionDef') continue;
      if ((membro.attributes.name ?? '').startsWith('test')) total += 1;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// (11) countRun — o lado EXECUTADO da dupla-igualdade
// ---------------------------------------------------------------------------

const CONTAGEM_ZERO: RunCounts = { testsRun: 0, pass: 0, fail: 0, skipped: 0 };

function inteiro(texto: string | undefined): number {
  if (texto === undefined) return 0;
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Contagem EXECUTADA, do ÚLTIMO bloco de resumo do `unittest`.
 *
 * A LINHA SAI NA STDERR, e isso não muda nada a montante: `execOutput`
 * (`engine/exec/proofs.ts:77`) já concatena stdout+stderr antes de chamar o
 * contador. A sonda é a mesma de `challenge-new.sh:675-677`
 * (`python_unittest_ran_line`), que também toma a ÚLTIMA ocorrência.
 *
 * POR QUE A ÚLTIMA (o mesmo motivo de `parseSpecCounts`): o código sob teste
 * pode imprimir um resumo FORJADO no próprio stdout. O do runner real vem
 * sempre por último — testes rodam, depois o `unittest` imprime o fechamento.
 *
 * O `unittest` NÃO tem saída estruturada (`docs/research/08` §5: `-h` não
 * lista `--junit-xml` nem TAP), então o resumo é lido do texto:
 *
 *     Ran 3 tests in 0.001s
 *     OK
 *     OK (skipped=1)
 *     FAILED (failures=1, errors=2, skipped=1, unexpected successes=1)
 *
 * `expected failures=N` conta como PASSOU (o teste fez o que prometeu);
 * `unexpected successes=N` conta como FALHOU (é o `@expectedFailure` que
 * passou sem avisar) — que é como o próprio `unittest` decide o exit code.
 * Tolerante a ANSI, como o lado JavaScript, por defesa em profundidade.
 */
export function pyCountRun(output: string): RunCounts {
  // eslint-disable-next-line no-control-regex
  const limpo = output.replace(/\[[0-9;]*m/g, '');
  const linhas = limpo.split('\n');

  let idxResumo = -1;
  let executados = 0;
  for (let i = 0; i < linhas.length; i += 1) {
    const m = /^Ran\s+(\d+)\s+tests?\b/.exec(linhas[i]);
    if (m) {
      idxResumo = i;
      executados = Number(m[1]);
    }
  }
  if (idxResumo === -1) return CONTAGEM_ZERO;

  const bloco = linhas.slice(idxResumo);
  let falhas = 0;
  let pulados = 0;
  let veredito: 'OK' | 'FAILED' | null = null;
  for (const linha of bloco) {
    const m = /^(OK|FAILED)(?:\s*\((.*)\))?\s*$/.exec(linha.trim());
    if (!m) continue;
    veredito = m[1] as 'OK' | 'FAILED';
    // O detalhe é uma lista `chave=N` separada por vírgula, e as CHAVES TÊM
    // ESPAÇO (`expected failures=1`, `unexpected successes=1`). Por isso a
    // leitura é por par chave/valor e nunca por regex solta: `/failures=(\d+)/`
    // casaria DENTRO de `expected failures=1` e contaria como falha um teste
    // que fez exatamente o que prometeu.
    for (const parte of (m[2] ?? '').split(',')) {
      const par = /^\s*([a-z ]+?)\s*=\s*(\d+)\s*$/.exec(parte);
      if (!par) continue;
      const [, chave, valor] = par;
      if (chave === 'failures' || chave === 'errors' || chave === 'unexpected successes') {
        falhas += inteiro(valor);
      } else if (chave === 'skipped') {
        pulados += inteiro(valor);
      }
      // `expected failures` é PASSOU: o `@expectedFailure` falhou como
      // prometido — é assim que o próprio unittest decide o exit code.
    }
    break; // o PRIMEIRO veredito depois do último `Ran N tests` é o do runner
  }
  if (veredito === null) return { testsRun: executados, pass: 0, fail: 0, skipped: 0 };

  const passaram = Math.max(0, executados - falhas - pulados);
  return { testsRun: executados, pass: passaram, fail: falhas, skipped: pulados };
}

// ---------------------------------------------------------------------------
// (12) parseChecks — os checks individuais para a UI do aluno
// ---------------------------------------------------------------------------

const RESULTADO_LINHA = /\s\.\.\.\s+(ok|FAIL|ERROR|skipped\b.*|expected failure|unexpected success)\s*$/;
const NOME_LINHA = /^([A-Za-z_][A-Za-z0-9_]*)\s+\(/;

/**
 * Um check por teste, para a UI do aluno — o análogo do `✔`/`✖` do relatório
 * spec (`services/challengeExec.ts:158`). O `unittest -v` imprime:
 *
 *     test_soma (tests.test_solucao.TestSolucao.test_soma) ... ok
 *     test_erro (tests.test_solucao.TestSolucao.test_erro) ... FAIL
 *
 * ARMADILHA DO DOCSTRING: quando o método tem docstring, o `unittest` escreve
 * `str(test) + "\n" + primeira linha do docstring` ANTES do ` ... ok` — o
 * resultado cai na linha do DOCSTRING, não na do nome. Por isso o nome é
 * procurado na própria linha e, se não estiver lá, na ANTERIOR.
 *
 * `skipped` e `expected failure` contam como NÃO passou: a prova 1 exige
 * passagem INTEGRAL (`proofs.ts:197`) e um teste que não rodou não é
 * "passou". `parseChecks` alimenta a UI; quem decide o gate é `countRun`.
 */
export function pyParseChecks(output: string): RunCheck[] {
  // eslint-disable-next-line no-control-regex
  const linhas = output.replace(/\[[0-9;]*m/g, '').split('\n');
  const checks: RunCheck[] = [];
  for (let i = 0; i < linhas.length; i += 1) {
    const m = RESULTADO_LINHA.exec(linhas[i]);
    if (!m) continue;
    const nome =
      NOME_LINHA.exec(linhas[i])?.[1] ?? (i > 0 ? NOME_LINHA.exec(linhas[i - 1])?.[1] : undefined);
    if (nome === undefined) continue;
    checks.push({ name: nome, passed: m[1] === 'ok' });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// (13) failureExitCodes
// ---------------------------------------------------------------------------

/**
 * ─── O EXIT-GUARD EM PYTHON: O PORTE, E O QUE ELE NÃO COBRE ───────────────
 *
 * `engine/exec/harness.ts:120` (`EXIT_GUARD_SOURCE`) é carregado no filho de
 * JavaScript por `node --require`: ele sequestra `process.exit`/`process.abort`
 * para que o código sob teste não possa FORJAR uma prova (imprimir um resumo
 * mentiroso e matar o runner antes do relatório real). Em Python NÃO EXISTE
 * `--require`, e a pergunta é o que fazer no lugar.
 *
 * ALTERNATIVAS AVALIADAS E REJEITADAS:
 *   - `sitecustomize.py` no diretório isolado (a sugestão óbvia): exigiria
 *     depender do módulo `site` no processo de prova, o que REABRE `.pth`,
 *     `usercustomize` e site-packages do usuário. Troca uma brecha específica
 *     por uma classe inteira de brechas. REJEITADO.
 *   - runner próprio (`python3 -B sm_runner.py` chamando `unittest` por API):
 *     funcionaria, mas trocaria o comando MEDIDO de
 *     `challenge-new.sh:602-611` por código novo no caminho da prova, e
 *     mudaria a forma do relatório que `countRun`/`parseChecks` leem.
 *     REJEITADO por risco desproporcional.
 *   - `PYTHONSTARTUP`: só vale no modo interativo. Não serve.
 *
 * O QUE FOI FEITO: o guard vive no `tests/__init__.py`
 * (`PY_PACKAGE_MARKER_CONTENT`) — um arquivo que JÁ ERA OBRIGATÓRIO por outro
 * motivo medido e que o `discover` importa ANTES de qualquer módulo de teste
 * e, portanto, antes de `solucao.py`. Custo: zero arquivo novo, zero mudança
 * no `testCommand`, zero mudança na forma do relatório.
 *
 * MEDIDO nesta máquina (CPython 3.14.7), com o mesmo ataque da CRITICAL 1 do
 * lado JavaScript (`sys.stderr.write("Ran 2 tests…OK")` + `os._exit(0)` no
 * topo de `solucao.py`):
 *   - SEM o guard: exit **0**, relatório forjado é o ÚLTIMO bloco, `countRun`
 *     devolve 2/2/0/0 e a igualdade dupla PASSA. Forja bem-sucedida.
 *   - COM o guard: `RuntimeError` no import → `Ran 1 test` /
 *     `FAILED (errors=1)` / exit **1**. Forja bloqueada.
 *   - Caminho feliz intacto: solução correta continua exit 0 / `Ran 2 tests` /
 *     `OK`; solução errada, exit 1; diretório sem teste, exit 5.
 *
 * ARMADILHA MEDIDA — `sys.exit` NÃO PODE SER PATCHEADO: o próprio
 * `unittest.main()` chama `sys.exit()` para definir o exit code; patcheá-lo
 * faz a suíte VERDE sair 1. E não é preciso: um `sys.exit()` no import já é
 * capturado pelo loader do `unittest` e vira erro do teste (medido: exit 1).
 *
 * O QUE CONTINUA SEM PROTEÇÃO (o limite honesto):
 *   1. um payload deliberado ainda alcança `_exit` por `ctypes` ou
 *      `signal.raise_signal(9)` — mas nenhum dos dois sai com 0
 *      (`raise_signal(9)` dá 137, que `meaning()` reporta como
 *      "timeout-ou-OOM") e a igualdade dupla reprova;
 *   2. o guard mora num arquivo do desafio, então o código sob teste PODE
 *      reimportá-lo/reatribuí-lo (`os._exit = os.__dict__[...]`) — a proteção
 *      é do mesmo grau da do lado JavaScript, que também é um monkey-patch em
 *      objeto que o filho enxerga;
 *   3. `envScrub` não bloqueia socket cru: o corte de rede de verdade exige
 *      wrapper de SO (o slot `wrapperCommand` do harness).
 *
 * E, por baixo de tudo, a rede que não depende disto: `successRequiresCountMatch`
 * é `true` LITERAL no tipo (`registry.ts:372`) — exit 0 sozinho NUNCA prova
 * sucesso, em linguagem nenhuma.
 */
export const PY_FAILURE_POLICY: FailurePolicy = {
  // Falha = exit != 0. Portado de `challenge-new.sh` (`python:falha` = 1) e do
  // §5 do research 08: 0 passou · 1 falhou · 5 NADA RODOU. O 5 é um PRESENTE
  // em relação ao Node — lá "nada rodou" sai 0 e o gate tem de descobrir
  // sozinho; aqui o próprio interpretador avisa.
  isFailure: (exitCode: number): boolean => exitCode !== 0,
  meaning: (exitCode: number): string => {
    // 137 (SIGKILL) NÃO distingue timeout de OOM — a mesma honestidade de
    // `exitCodeMeaning` (`engine/exec/proofs.ts:156`): nunca afirmar qual.
    if (exitCode === 137) return 'timeout-ou-OOM';
    if (exitCode === 0) return 'exit 0';
    if (exitCode === 1) return 'exit 1 (teste falhou ou levantou erro)';
    if (exitCode === 5) return 'exit 5 (NADA rodou — nenhum teste foi coletado)';
    if (exitCode === 2) return 'exit 2 (erro de uso do unittest / import falhou)';
    return `exit ${exitCode}`;
  },
  successRequiresCountMatch: true,
};

/** Exit code do `unittest` para "nenhum teste foi coletado" (medido). */
export const PY_EXIT_NADA_RODOU = 5;

// ---------------------------------------------------------------------------
// (14) envScrub — ALLOWLIST (§6 obs. 2)
// ---------------------------------------------------------------------------

/**
 * A política de ambiente do filho.
 *
 * `fixed` e `strip` NUNCA se sobrepõem, e isso é obrigatório: `applyEnvScrub`
 * aplica `fixed` e DEPOIS apaga `strip` (`registry.ts:456-457`), enquanto
 * `applyLegacyEnvScrub` faz o contrário — uma chave nos dois conjuntos teria
 * comportamento OPOSTO nas duas semânticas.
 *
 * `PYTHONPATH` está em `strip` porque é o veneno nomeado no §6 obs. 2: herdado
 * do ambiente do desenvolvedor, ele injeta módulos de fora do diretório
 * isolado no processo de prova — o desafio passaria por causa de uma
 * biblioteca que o aluno não tem.
 *
 * `PYTHONHASHSEED=0` é o determinismo que o §7 de `references/languages.md`
 * exige: sem ele a ordem de iteração de `set` muda a cada execução e um teste
 * que compare `list(um_set)` fica intermitente.
 *
 * `allow` é VAZIO de propósito: `python3` não precisa de nada além do
 * `ENV_ALLOWLIST_COMUM` (PATH/HOME/TMPDIR/…) que `applyEnvScrub` já une —
 * é o oposto do JavaScript, que precisa de `npm_node_execpath`.
 */
export const PY_ENV_SCRUB: EnvScrubPolicy = {
  allow: [],
  fixed: {
    // Determinismo (o `set`/`dict` deixa de ter ordem por execução).
    PYTHONHASHSEED: '0',
    // Sem `.pyc`: cinto do `-B` do runner. Um mutante do MESMO TAMANHO
    // reaproveitaria o bytecode velho e a prova mentiria (medido).
    PYTHONDONTWRITEBYTECODE: '1',
    // Sem site-packages do USUÁRIO no filho (o análogo do `-s`, por ambiente,
    // já que o runner não pode usar `-I`).
    PYTHONNOUSERSITE: '1',
    // Saída em UTF-8 sempre: a trilha é em pt-BR e um `print("ação")` sob
    // locale POSIX levantaria UnicodeEncodeError no meio da prova.
    PYTHONIOENCODING: 'utf-8',
    // Paridade de endurecimento de rede com o lado JavaScript.
    NO_PROXY: '*',
    no_proxy: '*',
  },
  strip: [
    // O veneno nomeado no §6 obs. 2 — módulos de fora do diretório isolado.
    'PYTHONPATH',
    // Trocaria a instalação inteira do interpretador do filho.
    'PYTHONHOME',
    'PYTHONEXECUTABLE',
    'PYTHONPLATLIBDIR',
    // Mudariam o comportamento do filho sem aparecer em lugar nenhum.
    'PYTHONSTARTUP',
    'PYTHONOPTIMIZE',
    'PYTHONWARNINGS',
    'PYTHONBREAKPOINT',
    'PYTHONFAULTHANDLER',
    'PYTHONDEVMODE',
    'PYTHONTRACEMALLOC',
    'PYTHONPROFILEIMPORTTIME',
    'PYTHONASYNCIODEBUG',
    'PYTHONMALLOC',
    'PYTHONINTMAXSTRDIGITS',
    'PYTHONSAFEPATH',
    'PYTHONCASEOK',
    'PYTHONCOERCECLOCALE',
    'PYTHONUSERBASE',
    'PYTHONPYCACHEPREFIX',
    // Ambiente virtual herdado: o filho passaria a ver os pacotes de um venv
    // do desenvolvedor, e um `import numpy` acidental "funcionaria" na máquina
    // dele e falharia na do aluno.
    'VIRTUAL_ENV',
    'CONDA_PREFIX',
    'CONDA_DEFAULT_ENV',
    // Proxies herdados (o mesmo conjunto do lado JavaScript).
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    // ANSI no relatório derruba o regex de contagem (defesa em profundidade).
    'FORCE_COLOR',
  ],
  scope: [
    'PYTHONHASHSEED=0 + TZ=UTC + LC_ALL=C.UTF-8: mesma ordem de set/dict, mesmo fuso e mesma collation em toda execução',
    'PYTHONDONTWRITEBYTECODE=1 + `-B` no runner: o mutante nunca reaproveita .pyc velho (medido em challenge-new.sh)',
    'PYTHONPATH/PYTHONHOME/VIRTUAL_ENV removidos: o filho só enxerga o diretório isolado do desafio',
    'PYTHONNOUSERSITE=1: sem site-packages do usuário (o runner não pode usar `-I`, que tiraria o cwd do sys.path)',
    'remove proxies herdados e injeta NO_PROXY=*: derruba tráfego via proxy, acidental ou hostil',
    'LIMITE: não bloqueia socket cru (TCP/UDP) — um payload deliberado ainda conecta via socket puro',
    'LIMITE: NÃO existe porte do EXIT_GUARD_SOURCE do Node (não há `--require`) — ver PY_FAILURE_POLICY',
    'LIMITE: a semântica VIGENTE do harness é denylist (applyLegacyEnvScrub); a allowlist do §6 obs.2 é a troca deliberada da onda 5',
  ],
};

// ---------------------------------------------------------------------------
// O ADAPTADOR
// ---------------------------------------------------------------------------

/**
 * Tags de bloco cercado que a engine trata como Python executável.
 * `pycon` NÃO entra: um bloco `pycon` é transcrição de REPL (com `>>>` e
 * saída), que não é Python parseável — ele vive em `NON_CODE_THEORY_TAGS`.
 */
export const PY_THEORY_FENCE_TAGS: readonly string[] = ['py', 'python', 'python3'];

/**
 * Tokens de `challenge.language` / `track.programmingLanguage` que resolvem
 * para este adaptador. `'python'` é a LINGUAGEM (e é o id); `'cpython'` e
 * `'python3'` são aliases de RUNTIME/binário — o mesmo papel que `'nodejs'`
 * tem para JavaScript (§6: "`nodejs` não é uma linguagem, é um runtime").
 */
export const PY_CHALLENGE_LANGUAGES: readonly ChallengeLanguageToken[] = [
  'python',
  'python3',
  'cpython',
];

/**
 * O `track.runtime` default. `'cpython'` sem a versão: a versão PINADA vive
 * dentro de `atoms.python.json` (`python_version`), que é onde ela pode ser
 * conferida contra a máquina — cravá-la aqui a faria envelhecer em silêncio
 * a cada release do CPython. `docs/research/08` §6 exemplifica o campo da
 * TRILHA como `"cpython-3.14"`; o default do ADAPTADOR é a toolchain.
 */
export const PY_DEFAULT_RUNTIME = 'cpython';

export const pythonAdapter: LanguageAdapter = {
  id: 'python',
  label: 'Python',
  challengeLanguages: PY_CHALLENGE_LANGUAGES,
  defaultRuntime: PY_DEFAULT_RUNTIME,
  theoryFenceTags: PY_THEORY_FENCE_TAGS,

  parse: pyParse,
  constructKey: pyConstructKey,
  inventory: pyInventory,
  globals: pyGlobals,
  builtins: pyBuiltins,
  resolveScopes: pyResolveScopes,
  forbiddenInvariants: PY_FORBIDDEN_INVARIANTS,
  layout: pyLayout,
  filePathPattern: PY_SAFE_FILE_PATH_RE,
  testCommand: PY_TEST_COMMAND,
  countDeclared: pyCountDeclared,
  countRun: pyCountRun,
  parseChecks: pyParseChecks,
  failureExitCodes: PY_FAILURE_POLICY,
  envScrub: PY_ENV_SCRUB,
  detect: pyDetect,
};

/**
 * O eixo `form:` NÃO está disponível em Python na v1 — declarado como valor,
 * não como comentário, para que o consumidor possa PERGUNTAR em vez de
 * descobrir por ausência. `engine/form/selector.ts:344` é tipado sobre
 * `ts.Node`; generalizar o seletor é projeto próprio. É por causa desta
 * limitação que as doze distinções de `docs/17-trilha-python.md` tiveram de
 * virar chave sintética nos eixos `node:`/`decl:`.
 */
export const PY_FORM_AXIS_SUPPORTED = false;
