/**
 * app/electron/main/engine/lang/rust.ts — O ADAPTADOR RUST.
 *
 * A QUARTA linha da tabela do §6 de
 * `docs/research/08-multilingua-trava-deterministica.md` (linhas 866-891) — e
 * a primeira PROVA da promessa do §7 item 3 fora de um interpretador de
 * script: "é aqui que se prova que o adaptador de Porta 1 pode ser um
 * SUBPROCESSO e não só uma lib npm — o que desbloqueia Go, C# e todo o resto".
 * O `python.ts` roda `python3` por `spawnSync`; este roda `node` (o host do
 * web-tree-sitter) por `spawnSync` e conversa com ele por JSON — a MESMA
 * arquitetura, outro binário host.
 *
 * Fonte NORMATIVA de operação: `docs/research/06-toolchains.md` (a ficha Rust:
 * `cargo test` é zero-install, `assert_eq!` mostra `left`/`right`, e os DOIS
 * fatos medidos que este adaptador codifica — ver RS_FAILURE_POLICY e
 * RS_TEST_COMMAND). Fonte NORMATIVA de conteúdo: o contrato da trilha
 * `rust-iniciante` é `docs/20-trilha-rust.md` — o VOCABULÁRIO de atom keys
 * deste adaptador (`vocab/atoms.rust.json`, gerado) é o inventário fechado
 * que o contrato cita; cada chave é previsível e estável por desenho.
 *
 * ─── AS SETE DECISÕES DESTE ARQUIVO ───────────────────────────────────────
 *
 * 1. `parse` É SÍNCRONO E USA `spawnSync` (a decisão do registro, decisão 1).
 *    A inicialização do web-tree-sitter é ASYNC — no SUBPROCESSO o `await` é
 *    gratuito. `parse` MEMOIZA por fonte (`CACHE_PARSE`), como o Python: uma
 *    invocação custa ~100-200 ms (node + WASM), e uma auditoria de trilha
 *    inteira faria milhares de spawns.
 *
 * 2. O PARSER É O WASM DO TREE-SITTER (`web-tree-sitter` +
 *    `tree-sitter-rust`), NÃO o módulo nativo e NÃO um binário compilado. O
 *    nativo seria o primeiro módulo nativo do Electron main (ABI, rebuild,
 *    asar.unpacked); o binário exigiria compilar no build. O WASM vem no
 *    `npm ci` e é idêntico em toda máquina. Motivo completo no cabeçalho do
 *    `vocab/rs/extract_ast.mjs`.
 *
 * 3. O EIXO `decl:` CORTA AS QUATRO FORMAS DE LIGAÇÃO DE NOME: `let`
 *    (`decl:let`), `let mut` (`decl:let-mut`), `const` (`decl:const`) e
 *    `static` (`decl:static`) — a didática está na FORMA, como `let`×`const`
 *    em JavaScript e `assign`×`ann`×`aug` em Python.
 *
 * 4. AS DISTINÇÕES QUE O PARSER COLAPSA VIRAM CHAVES SINTÉTICAS, com o
 *    precedente de `node:ComputedNonLiteralAccess` e das doze de Python:
 *    `node:MutableReference` (`&mut T`, que é `reference_type` + filho) e
 *    `node:ElseIf` (`else if`, que é `else_clause` com `if_expression`
 *    dentro). Literais NÃO precisam de refinamento: o tree-sitter já separa
 *    `integer_literal` de `string_literal` (não existe o problema do
 *    `ast.Constant` do Python).
 *
 * 5. O MANIFESTO É O HARNESS. O `Cargo.toml` escrito por `rsLayout` carrega
 *    DUAS travas que são o porte do EXIT-GUARD para Rust (ver o bloco
 *    "O EXIT-GUARD EM RUST" antes de RS_FAILURE_POLICY).
 *
 * 6. `RUSTC` É PINADO NO `fixed`, RESOLVIDO POR `detect()`. O `cargo` de uma
 *    instalação rustup é um PROXY que, sem `RUSTUP_HOME` no ambiente (o
 *    veneno do §6 obs. 2, apagado do filho), não acha toolchain — e o cargo
 *    REAL acha o `rustc` pelo PATH, que em uma máquina de dev é O PROXY. Por
 *    isso `detect()` resolve o cargo REAL (`<sysroot>/bin/cargo`) e o rustc
 *    REAL, e o envScrub impõe `RUSTC=<real>` ao filho. MEDIDO nesta máquina:
 *    sem o pin, o filho morre com "rustup could not choose a version of
 *    rustc"; com o pin, roda offline sob allowlist pura.
 *
 * 7. NÃO EXISTE PORTE DIRETO DO `EXIT_GUARD_SOURCE` (não há `--require` em
 *    Rust) — a defesa é em camadas ESTÁTICAS + o manifest, e o limite honesto
 *    está escrito em RS_FAILURE_POLICY.
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

// NOTA DE CICLO (a mesma de `python.ts:72-75`): o import acima é `import type`
// e TEM de continuar sendo. `registry.ts` importa o VALOR `rustAdapter` daqui;
// um import de valor na volta fecharia o ciclo em tempo de AVALIAÇÃO.

// ---------------------------------------------------------------------------
// Módulos carregados sob demanda
// ---------------------------------------------------------------------------
//
// Mesmo motivo de `python.ts:80-94`: `content/trackTypes.ts` importa
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
// Onde moram os artefatos Rust (o extrator e o inventário)
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
 * Resolve um artefato Rust entre candidatos, na ordem — a MESMA rede de
 * proteção de `python.ts:123-138`: fonte (tsx/testes), bundle do
 * electron-vite (tudo achatado em `out/main/`) e a raiz do repositório. A
 * variável de ambiente vem PRIMEIRO: quando o `.mjs`/`.json` não for
 * empacotado no build, é ela que conserta a instalação sem recompilar nada.
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

/** Caminho do extrator (`vocab/rs/extract_ast.mjs`). */
export function rsExtractorPath(): string | null {
  return resolverArtefato(carregar<PathModule>('node:path').join('rs', 'extract_ast.mjs'), 'STUDY_METHOD_RS_EXTRACTOR');
}

/** Caminho do inventário gerado (`vocab/atoms.rust.json`). */
export function rsAtomsPath(): string | null {
  return resolverArtefato('atoms.rust.json', 'STUDY_METHOD_RS_ATOMS');
}

// ---------------------------------------------------------------------------
// (15) detect() — `cargo --version` e a mensagem de degradação
// ---------------------------------------------------------------------------

/** Os binários candidatos, na ordem de tentativa. O override de ambiente vem
 * PRIMEIRO (é o conserto operacional de uma instalação em que o cargo do PATH
 * não é o da toolchain pinada). */
export const RS_BINARIOS: readonly string[] = ['cargo'];

/** `cargo 1.98.1 (797e8a9bc …)` → `1.98.1`. */
function versaoDoTexto(texto: string): string | null {
  const m = /cargo\s+(\d+\.\d+(?:\.\d+)?)/.exec(texto);
  return m ? m[1] : null;
}

/** O mínimo para o filho sequer achar o binário (a allowlist comum). */
function envMinimo(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const nome of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'PATHEXT']) {
    const valor = base[nome];
    if (valor !== undefined) env[nome] = valor;
  }
  env.LC_ALL = 'C.UTF-8';
  env.TZ = 'UTC';
  return env;
}

/**
 * Resolve o cargo REAL e o rustc REAL de uma toolchain rustup.
 *
 * O cargo do PATH é, em instalações rustup, um PROXY: sem `RUSTUP_HOME` no
 * ambiente (que a política do filho apaga — veneno do §6 obs. 2) ele não
 * escolhe toolchain; e o cargo REAL despacha o `rustc` pelo PATH — que numa
 * máquina de dev é O PROXY de novo (medido: "rustup could not choose a
 * version of rustc"). O par REAL mora em `<sysroot>/bin/` e nenhum dos dois
 * lê variável de rustup. Devolve `null` quando não há proxy a resolver ou a
 * verificação sob ambiente scrubado falha (o chamador mantém o binário
 * original e DEGRADA com a mensagem).
 */
function resolverToolchainReal(
  spawnSync: ChildProcessModule['spawnSync'],
  cargoEncontrado: string,
): { cargo: string; rustc: string | null } | null {
  const path = carregar<PathModule>('node:path');
  const fs = carregar<FsModule>('node:fs');
  // `rustc --print sysroot` é a consulta canônica; o rustc do PATH serve
  // (aqui o ambiente do PAI está intacto — é etapa de BUILD, não de prova).
  const dirDoCargo = path.dirname(cargoEncontrado);
  const candidatosRustc = [path.join(dirDoCargo, 'rustc'), 'rustc'];
  let sysroot: string | null = null;
  for (const candidato of candidatosRustc) {
    try {
      const r = spawnSync(candidato, ['--print', 'sysroot'], { encoding: 'utf8', timeout: 10_000 });
      const texto = `${r.stdout ?? ''}`.trim();
      if (!r.error && r.status === 0 && texto.length > 0 && fs.existsSync(texto)) {
        sysroot = texto;
        break;
      }
    } catch {
      continue;
    }
  }
  if (sysroot === null) return null;
  const cargoReal = path.join(sysroot, 'bin', 'cargo');
  const rustcReal = path.join(sysroot, 'bin', 'rustc');
  if (!fs.existsSync(cargoReal)) return null;
  // A PROVA de que o filho vai rodar: o binário real responde a `--version`
  // SOB O AMBIENTE SCRUBADO (sem RUSTUP_HOME/CARGO_HOME) — é exatamente o
  // ambiente que `applyEnvScrub` construirá. Se não responde, o resolution
  // não serve e devolvemos null (degradação com mensagem, nunca silêncio).
  const base = envMinimo(process.env);
  try {
    const r = spawnSync(cargoReal, ['--version'], { encoding: 'utf8', timeout: 10_000, env: base });
    if (r.error || r.status !== 0) return null;
  } catch {
    return null;
  }
  return { cargo: cargoReal, rustc: fs.existsSync(rustcReal) ? rustcReal : null };
}

let detectMemo: DetectResult | null = null;
let toolchainRealMemo: { cargo: string; rustc: string | null } | null | undefined;

/**
 * Detecção da toolchain — SUBPROCESSO de verdade, assinatura SÍNCRONA
 * (`registry.ts:28-38`). A `degradacao` cobre TRÊS casos, cada um dizendo o
 * que deixou de funcionar:
 *
 *   - sem `cargo` na máquina: nenhuma prova de execução de desafio Rust roda
 *     (e o gate NÃO pode aprovar por omissão);
 *   - sem o `extract_ast.mjs` no disco: o parser não existe, então nem o
 *     ORÇAMENTO pode ser auditado;
 *   - o cargo encontrado é um PROXY de rustup que NÃO roda sob a allowlist do
 *     filho: a prova por execução morreria em "rustup could not choose a
 *     version" — o gate reprovaria por ambiente, que não é bug de código,
 *     mas precisa estar DITO.
 */
export function rsDetect(): DetectResult {
  if (detectMemo !== null) return detectMemo;
  const { spawnSync } = carregar<ChildProcessModule>('node:child_process');

  const candidatos = process.env.STUDY_METHOD_CARGO_BIN
    ? [process.env.STUDY_METHOD_CARGO_BIN, ...RS_BINARIOS]
    : RS_BINARIOS;

  let binario: string | null = null;
  let versao: string | null = null;
  for (const candidato of candidatos) {
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

  // O PAR (cargo, rustc) REAL — resolvedor do RUSTC pinado (decisão 6).
  toolchainRealMemo = undefined;
  if (binario !== null) {
    const real = resolverToolchainReal(spawnSync, binario);
    toolchainRealMemo = real;
    if (real !== null) binario = real.cargo;
  }

  const extrator = rsExtractorPath();
  const avisos: string[] = [];
  if (binario === null) {
    avisos.push(
      `nenhum cargo encontrado no PATH (procurados: ${candidatos.join(', ')}) — ` +
        'as provas por execução de desafio Rust NÃO rodam e o gate reprova por falta de prova, nunca aprova por omissão',
    );
  } else if (toolchainRealMemo === null) {
    avisos.push(
      'o cargo encontrado parece ser um proxy de rustup e NÃO respondeu sob o ambiente scrubado do filho ' +
        '(sem RUSTUP_HOME/CARGO_HOME) — as provas por execução vão falhar em "rustup could not choose a version"; ' +
        'resolva com STUDY_METHOD_CARGO_BIN apontando o cargo REAL da toolchain',
    );
  }
  if (extrator === null) {
    avisos.push(
      'vocab/rs/extract_ast.mjs não encontrado — sem o extrator não há Porta 1 para Rust: ' +
        'nenhum trecho é parseado e nenhum orçamento é auditado (defina STUDY_METHOD_RS_EXTRACTOR para apontar o arquivo)',
    );
  }

  detectMemo = {
    ok: binario !== null && extrator !== null,
    binary: binario ?? RS_BINARIOS[0],
    version: versao,
    degradacao: avisos.length > 0 ? avisos.join(' | ') : null,
  };
  return detectMemo;
}

/** Só para os testes: esquece a detecção memoizada. */
export function rsResetDetectCache(): void {
  detectMemo = null;
  toolchainRealMemo = undefined;
}

/**
 * O binário do RUNNER (o cargo REAL quando resolvido). Separado de
 * `rsDetect().binary` só em nome da leitura: é o valor que
 * `criarExecDeLinguagem` vai spawnar.
 */
export function rsRunnerBinary(): string {
  return rsDetect().binary;
}

// ---------------------------------------------------------------------------
// (3)(4) inventory() / globals() / builtins() — do artefato GERADO
// ---------------------------------------------------------------------------

/** O layout de `vocab/atoms.rust.json` (gerado por `rs/gerar_inventario.mjs`). */
export interface AtomosRustJson {
  schema: 1;
  rust_toolchain: string | null;
  parser: { parser: string; grammar: string; grammarVersion: string | null };
  axes: { node: string[]; op: string[]; decl: string[]; global: string[]; api: string[] };
  /** igual a `axes.global` (em Rust os dois coincidem — ver rsBuiltins). */
  builtins: string[];
  total: number;
}

let inventarioMemo: AtomosRustJson | null | undefined;

/** O JSON cru, ou `null` quando o artefato não está no disco (fail-soft). */
export function rsInventarioBruto(): AtomosRustJson | null {
  if (inventarioMemo === undefined) {
    const caminho = rsAtomsPath();
    if (caminho === null) {
      inventarioMemo = null;
    } else {
      const fs = carregar<FsModule>('node:fs');
      try {
        inventarioMemo = JSON.parse(fs.readFileSync(caminho, 'utf8')) as AtomosRustJson;
      } catch {
        inventarioMemo = null;
      }
    }
  }
  return inventarioMemo ?? null;
}

/** Só para os testes: esquece o inventário memoizado. */
export function rsResetInventarioCache(): void {
  inventarioMemo = undefined;
}

function semPrefixo(chaves: readonly string[] | undefined, prefixo: string): string[] {
  if (!chaves) return [];
  return chaves.map((k) => (k.startsWith(prefixo) ? k.slice(prefixo.length) : k));
}

/**
 * O enum FECHADO de tipos de nó. Sai do artefato GERADO — nunca digitado (§6:
 * "gerado do `inventory()` do adaptador, nunca digitado") — e o artefato
 * carrega a `rust_toolchain` que o produziu. Inclui as chaves SINTÉTICAS
 * (`MutableReference`, `ElseIf`, `ForeignMod`) e NÃO inclui os portadores
 * `GlobalRef`/`ApiRef`/`Op` (a chave deles sai pelo atributo).
 */
export function rsInventory(): readonly string[] {
  return semPrefixo(rsInventarioBruto()?.axes.node, 'node:');
}

/**
 * Os nomes SEMPRE no escopo de Rust: primitivos + prelude da stdlib +
 * raízes de caminho (`std`). É a lista fechada de `PRELUDE_RUST`, publicada
 * em `atoms.rust.json`.
 */
export function rsGlobals(): ReadonlySet<string> {
  return new Set(semPrefixo(rsInventarioBruto()?.axes.global, 'global:'));
}

/**
 * Em Rust, como em JavaScript, o conjunto de BUILTINS coincide com o de
 * GLOBAIS: tudo o que a linguagem embute está no escopo pelo prelude, sem
 * import. É em Python que os dois se separam (`len` × `__file__`).
 */
export function rsBuiltins(): ReadonlySet<string> {
  const bruto = rsInventarioBruto();
  if (bruto === null) return new Set();
  return new Set(bruto.builtins ?? semPrefixo(bruto.axes.global, 'global:'));
}

// ---------------------------------------------------------------------------
// (1) parse(source) — a Porta 1 por SUBPROCESSO (node + WASM)
// ---------------------------------------------------------------------------

/** O que `vocab/rs/extract_ast.mjs` devolve no stdout. */
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
  rust: { parser: string; grammar: string; grammarVersion: string | null };
  root: NoBruto;
  scopes: { declared: string[]; imported: string[]; free: string[] };
}

interface SaidaErro {
  ok: false;
  error: { code: 'PARSE_ERROR'; message: string; line: number; column: number };
}

/** A árvore NATIVA que vai em `ParseOk.native` — o payload do subprocesso. */
export type RustNative = SaidaOk;

/** Teto do memo de parse. Fonte de aula tem dezenas de linhas; 512 sobra. */
const CACHE_MAX = 512;
const CACHE_PARSE = new Map<string, ParseResult>();

/** Só para os testes: esvazia o memo de parse. */
export function rsResetParseCache(): void {
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
    // O campo que a caminhada genérica consome (`LangNode.synthetic` em
    // registry.ts): o nó PORTADOR (`Op`, `GlobalRef`, `ApiRef`,
    // `MutableReference`, `ElseIf`, `ForeignMod`) rende SÓ a chave de
    // `constructKey` — a genérica `node:<type>` dele seria lixo fora do
    // inventário (exceto os portadores cuja chave JÁ é `node:`, como os
    // dois últimos — o comportamento é o mesmo do Python).
    synthetic: bruto.synthetic,
  };
}

function erroDeParse(message: string, line = 1, column = 1): ParseResult {
  return { ok: false, error: { code: 'PARSE_ERROR', message, line, column } };
}

/**
 * Parseia Rust invocando o extrator (`vocab/rs/extract_ast.mjs`) com o fonte
 * no STDIN e lendo JSON do STDOUT.
 *
 * O binário host é `process.execPath`: em Node puro (suíte, CLI) é o próprio
 * node; DENTRO DO ELECTRON é o binário do Electron — que roda um script como
 * node SÓ com `ELECTRON_RUN_AS_NODE=1` (injetado no ambiente do subprocesso;
 * em node puro a variável é ignorada). FAIL-CLOSED em toda saída: extrator
 * ausente, host ausente, timeout, stdout que não é JSON — TUDO vira o MESMO
 * `PARSE_ERROR` estruturado que `extract.ts:344-357` já sabe tratar.
 *
 * "PARSEIE TUDO, REPROVE NO ORÇAMENTO": o adaptador nunca restringe a
 * gramática — quem reprova é `budget.ts`.
 */
export function rsParse(source: string, options: ParseOptions = {}): ParseResult {
  const fileName = options.fileName ?? '<trecho.rs>';
  const chave = `${fileName} ${source}`;
  const memo = CACHE_PARSE.get(chave);
  if (memo !== undefined) return memo;

  const resultado = rsParseSemCache(source, fileName);
  if (CACHE_PARSE.size >= CACHE_MAX) {
    // FIFO simples: a primeira chave inserida sai (o mesmo cache de build do
    // Python — a complexidade de um LRU aqui não se paga).
    const primeira = CACHE_PARSE.keys().next();
    if (!primeira.done) CACHE_PARSE.delete(primeira.value);
  }
  CACHE_PARSE.set(chave, resultado);
  return resultado;
}

function rsParseSemCache(source: string, fileName: string): ParseResult {
  const extrator = rsExtractorPath();
  if (extrator === null) {
    return erroDeParse(
      'extrator Rust ausente: vocab/rs/extract_ast.mjs não foi encontrado ' +
        '(defina STUDY_METHOD_RS_EXTRACTOR para apontar o arquivo)',
    );
  }

  const { spawnSync } = carregar<ChildProcessModule>('node:child_process');
  const env = rsApplyParseEnv(process.env);
  const res = spawnSync(process.execPath, [extrator, fileName], {
    input: source,
    encoding: 'utf8',
    // Timeout do PARSER, não do runner: a invocação custa ~100-200 ms
    // (node + WASM, medido); 30 s é três ordens de grandeza acima.
    timeout: 30_000,
    // Uma árvore de arquivo grande em JSON passa fácil do 1 MB default.
    maxBuffer: 64 * 1024 * 1024,
    env,
  });

  if (res.error) return erroDeParse(`falha ao executar o extrator de Rust: ${res.error.message}`);
  if (res.status !== 0) {
    const stderr = (res.stderr ?? '').trim();
    return erroDeParse(
      `o extrator de Rust saiu com ${res.status === null ? 'sinal ' + String(res.signal) : 'exit ' + String(res.status)}` +
        (stderr ? `: ${stderr.split('\n').slice(-3).join(' ')}` : ''),
    );
  }

  let payload: SaidaOk | SaidaErro;
  try {
    payload = JSON.parse(res.stdout ?? '') as SaidaOk | SaidaErro;
  } catch {
    return erroDeParse(`saída do extrator de Rust não é JSON: ${(res.stdout ?? '').slice(0, 200)}`);
  }
  if (!payload.ok) {
    return { ok: false, error: { ...payload.error, code: 'PARSE_ERROR' } };
  }
  return { ok: true, root: normalizarNo(payload.root), source, native: payload };
}

/**
 * O ambiente do subprocesso do PARSER — allowlist do §6 obs. 2 aplicada a um
 * caso em que ela é barata: o extrator lê SÓ o stdin e o WASM do disco.
 * `ELECTRON_RUN_AS_NODE=1` é o que faz `process.execPath` (o Electron) rodar
 * o `.mjs` como node; em node puro a variável é ignorada.
 */
export function rsApplyParseEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = envMinimo(base);
  env.ELECTRON_RUN_AS_NODE = '1';
  // `NODE_OPTIONS` não entra na allowlist — um `--require` herdado do
  // ambiente do desenvolvedor rodaria código arbitrário no parser.
  return env;
}

// ---------------------------------------------------------------------------
// (5) resolveScopes — o que põe Rust em Tier A
// ---------------------------------------------------------------------------

/**
 * Resolução de escopo, calculada no MESMO subprocesso do parse (nenhum spawn
 * extra) — o análogo do `symtable`, e é ELE que põe Rust em Tier A (§7:
 * "nunca promover uma linguagem a Tier A sem resolução de escopo").
 *
 * DUAS CAMADAS, e a distinção é o que o extrator entrega: ITENS do arquivo
 * (fn/struct/const/use/…) são HOISTED — Rust é order-independent no nível de
 * item, e uma chamada a uma fn declarada DEPOIS não é referência livre —;
 * `let` e parâmetros são lexicais por bloco (uma `let String = 3;` local não
 * apaga o `global:String` do arquivo).
 *
 * LIMITE DECLARADO (a honestidade do lado JavaScript, `extract.ts:38-43`,
 * repetida aqui): os itens são hoisted PARA O ARQUIVO INTEIRO — um `fn aux`
 * declarado DENTRO de uma função não fica privado a ela. O orçamento nunca
 * aprova por esse buraco: ele no máximo deixa de reportar um `global:` que
 * estaria certo, e o gate de teste (prova 1) não depende dele.
 */
export function rsResolveScopes(parsed: ParseOk): ScopeResolution {
  const native = parsed.native as RustNative | undefined;
  const escopos = native?.scopes ?? { declared: [], imported: [], free: [] };
  const universo = rsGlobals();
  const globais = new Set<string>();
  for (const nome of escopos.free) if (universo.has(nome)) globais.add(nome);
  return {
    declared: new Set(escopos.declared),
    imported: new Set(escopos.imported),
    free: new Set(escopos.free),
    globals: globais,
  };
}

// ---------------------------------------------------------------------------
// (2) constructKey(node) — os CINCO eixos que Rust cobre
// ---------------------------------------------------------------------------

/**
 * Um nó vira ITEM DE ORÇAMENTO — "tipo + atributo, não só tipo" (§6).
 *
 * Os eixos cobertos (CINCO, os mesmos do Python):
 *
 *   `decl:`  — as QUATRO formas de ligação: `let`, `let-mut`, `const`,
 *              `static` (atributo `declKind`, decisão 3);
 *   `global:`— a referência LIVRE a um nome do prelude (nó portador
 *              `GlobalRef`, atributo `globalName` — `global:String`,
 *              `global:Vec`, `global:Some`);
 *   `api:`   — a cadeia de caminho/campo (nó portador `ApiRef`, atributo
 *              `apiPath` — `api:String::from`, `api:.clone`, `api:println!`,
 *              `api:derive.Debug`), e os imports com raiz global;
 *   `op:`    — o operador com a FAMÍLIA (nó portador `Op`, atributos
 *              `operator`+`operatorFamily` — `op:binary:+`, `op:compare:==`,
 *              `op:logical:&&`, `op:unary:*`, `op:assign:+=`, `op:range:..`);
 *   `node:`  — TODO o resto, pelo tipo (incluindo os sintéticos
 *              `MutableReference`/`ElseIf`/`ForeignMod`).
 */
export function rsConstructKey(node: LangNode): string | null {
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
 * estática, e em Rust a que FORJA PROVA. A lista é o porte da defesa de
 * relatório forjado (a CRITICAL 1 do lado JavaScript): o ataque
 *
 *     println!("test result: ok. 2 passed; 0 failed; 0 ignored; …");
 *     std::process::exit(0);
 *
 * dentro de uma função chamada por um teste real imprimiria um resumo
 * MENTIROSO e mataria o runner antes do relatório real — que é o ataque que o
 * `tests/__init__.py` bloqueia em Python e o `--require` bloqueia em Node.
 * Em Rust a saída é ESTÁTICA (o texto `std::process::exit` tem de estar no
 * fonte), e por isso a proibição é no ORÇAMENTO, em qualquer nível.
 *
 *   - `api:std::process::exit` / `api:std::process::abort` — o caminho direto
 *     (`std::process::exit(0)`) e o import (`use std::process::exit;`) emitem
 *     a MESMA chave, então as duas grafias caem juntas;
 *   - `api:std::process::ExitCode` — `ExitCode::SUCCESS.exit_process()`;
 *   - `node:ForeignModItem` — `extern "C" { fn exit(…) }` declara símbolo
 *     externo (o `exit` da libc, linkada em todo binário Rust): a análise
 *     estática não sabe o que o símbolo faz, e é exatamente a brecha da
 *     proibição acima. Bloqueado no nível de item, não de chamada;
 *   - `api:asm!` / `api:naked_asm!` — syscall direto (o `ctypes` de Rust);
 *   - `api:link_section` / `api:export_name` — o truque de `.init_array`
 *     (construtor que roda antes de tudo, sem crate nenhuma).
 *
 * LIMITE HONESTO (o mesmo grau do lado Python): a defesa é o GATE de
 * orçamento, não um guard de runtime — um desafio que contenha uma destas
 * construções é REPROVADO na auditoria; não há como interceptar
 * `process::exit` em processo de teste puro-std sem crate externa.
 */
export const RS_FORBIDDEN_INVARIANTS: readonly string[] = [
  'api:std::process::exit',
  'api:std::process::abort',
  'api:std::process::ExitCode',
  'node:ForeignModItem',
  'api:asm!',
  'api:naked_asm!',
  'api:link_section',
  'api:export_name',
];

// ---------------------------------------------------------------------------
// (7) layout(challenge) — o Cargo.toml OBRIGATÓRIO (e o que ele trava)
// ---------------------------------------------------------------------------

/** O crate que o teste importa (`use desafio::…`) e o MANIFESTO cria. */
export const RS_CRATE_NAME = 'desafio';
/** O fonte do aluno — o `src/lib.rs` da crate (§6 obs. 1: "com Rust o fonte vive em `src/`"). */
export const RS_ENTRY_PATH = 'src/lib.rs';
/** O arquivo de teste — um teste de INTEGRAÇÃO da crate. */
export const RS_TEST_PATH = 'tests/desafio.rs';
/** O manifesto obrigatório do runtime (o análogo do `package.json`). */
export const RS_MANIFEST_PATH = 'Cargo.toml';

/**
 * O MANIFESTO — e por que cada linha é o que é (MEDIDO nesta máquina,
 * rustc/cargo 1.98, com o ataque real da CRITICAL 1):
 *
 *   `[lib] test = false` — os `#[test]` definidos no CÓDIGO DO ALUNO
 *   (`src/lib.rs`) NÃO são coletados pelo `cargo test`. Sem esta linha, um
 *   `#[cfg(test)] mod forjado { #[test] fn f() { println!("test result: …");
 *   std::process::exit(0); } }` no lib.rs RODARIA junto com os testes do
 *   desafio — a forja sai 0 e a igualdade dupla é enganada. Com ela, o teste
 *   forjado nem compila como teste (medido: `running 2 tests` coleta só o
 *   `tests/desafio.rs`). É o porte do exit-guard: o único código sob teste
 *   que RODA é o que os testes CHAMAM.
 *
 *   `[lib] doctest = false` — doc-tests não rodam: nem invocam o `rustdoc`
 *   (que numa instalação rustup é outro proxy), nem transformam bloco de
 *   comentário em prova — comentário é prosa, não especificação executável.
 *
 *   `edition = "2021"` — pinada e declarada: a trilha cita construções de
 *   edition, e o compilador não pode adivinhar. 2021 e não 2024 porque o
 *   contrato de conteúdo da trilha vai citar a edition e ela deve rodar em
 *   qualquer toolchain ≥ 1.56.
 *
 *   `[dependencies]` VAZIO E SEM SEÇÃO DE CRATES — os desafios usam SÓ a
 *   stdlib; com `CARGO_NET_OFFLINE=true` e nenhum crate, o `cargo test`
 *   NUNCA toca a rede (e o aluno não pode adicionar dependência: o manifesto
 *   é do harness, não dele).
 */
export const RS_MANIFEST_CONTENT = [
  '# Cargo.toml — harness do desafio. Leia; não edite.',
  '#',
  '# TRAVAS MEDIDAS (ver lang/rust.ts, decisões 5 e 7):',
  '#   [lib] test = false    — os #[test] do código do aluno NÃO rodam;',
  '#   [lib] doctest = false — doc-comments não viram prova;',
  '#   [dependencies] vazio  — stdlib only; CARGO_NET_OFFLINE zera a rede.',
  '[package]',
  `name = "${RS_CRATE_NAME}"`,
  'version = "0.1.0"',
  'edition = "2021"',
  '',
  '[lib]',
  'test = false',
  'doctest = false',
  '',
  '[dependencies]',
  '',
].join('\n');

/**
 * Os arquivos do desafio em disco, na ORDEM de escrita. O manifesto vem
 * PRIMEIRO (é ele que faz o diretório ser um projeto cargo — sem ele o
 * runner não roda NADA, que é o papel do `package.json` no JavaScript e do
 * `tests/__init__.py` no Python).
 *
 * MULTI-ARQUIVO: os `files` do desafio são escritos verbatim (o aluno edita
 * todos), SEM o `src/lib.rs` implícito — o mesmo contrato do layout de
 * JavaScript/Python.
 */
export function rsLayout(challenge: ChallengeLayoutInput): ChallengeLayout {
  const files: { path: string; content: string }[] = [
    { path: RS_MANIFEST_PATH, content: RS_MANIFEST_CONTENT },
  ];
  if (challenge.files && challenge.files.length > 0) {
    for (const f of challenge.files) files.push({ path: f.path, content: f.code });
  } else {
    files.push({ path: RS_ENTRY_PATH, content: challenge.code });
  }
  files.push({ path: RS_TEST_PATH, content: challenge.testsCode });
  return {
    files,
    entryPath: RS_ENTRY_PATH,
    testPath: RS_TEST_PATH,
    manifestPath: RS_MANIFEST_PATH,
  };
}

// ---------------------------------------------------------------------------
// (8) filePathPattern
// ---------------------------------------------------------------------------

/**
 * Caminho SEGURO de arquivo de desafio Rust: letras/dígitos/`_`/`-`/`/`,
 * terminando em `.rs`. Proíbe `..`, ponto no meio e qualquer escape do
 * diretório de execução — a mesma forma do `JS_SAFE_FILE_PATH_RE`, com a
 * extensão trocada (§6 obs. 1).
 *
 * SEM a flag `g`: `RegExp` com `g` guarda `lastIndex` entre chamadas.
 */
export const RS_SAFE_FILE_PATH_RE = /^[a-zA-Z0-9_\-/]+\.rs$/;

// ---------------------------------------------------------------------------
// (9) testCommand
// ---------------------------------------------------------------------------

/**
 * Comando exato do runner, MEDIDO nesta máquina (rustc/cargo 1.98; o método
 * está em `docs/research/06-toolchains.md` — ficha Rust). Sem o binário —
 * ele vem de `detect()`.
 *
 * `test` — roda TODA a suíte do diretório isolado (o runner não filtra por
 * nome; o filtro por nome é o FOOTGUN medido do 06: `cargo test <nome-curto>`
 * sai 0 silenciosamente quando o nome não é qualificado — sem filtro, o
 * problema não existe).
 *
 * `--offline` — nunca toca a rede (o cinto). `CARGO_NET_OFFLINE=true` no
 * `envScrub.fixed` é o suspensório: um pode ser removido por engano, os dois
 * não (o mesmo par `-B` × `PYTHONDONTWRITEBYTECODE` do Python).
 */
export const RS_TEST_COMMAND: readonly string[] = ['test', '--offline'];

// ---------------------------------------------------------------------------
// (10) countDeclared — o lado DECLARADO da dupla-igualdade
// ---------------------------------------------------------------------------

/**
 * Contagem ESTÁTICA de testes no fonte, POR AST — o lado DECLARADO da
 * dupla-igualdade (§6 obs. 3), e o número que `judgeCountMatches` compara com
 * o executado.
 *
 * A regra do `cargo test` é a do `#[test] fn`: conta função (com corpo ou
 * assinatura) cujo irmão anterior é o atributo `test` — o atributo é
 * IRMÃO do item no tree-sitter, e é a CADEIA de atributos que decide
 * (`#[cfg(test)] #[test] fn` conta; `#[test]` num `mod` de dentro do arquivo
 * conta; um `// #[test]` comentado NÃO é nó e não conta). Consequências
 * reais, cobertas por teste:
 *   - `fn testa_x()` SEM `#[test]` NÃO conta — o cargo também não coleta;
 *   - `#[test]` numa função vazia ou em trait assinatura conta (o cargo
 *     compila o que está no arquivo de teste).
 *
 * FAIL-CLOSED: fonte que não parseia devolve 0, e 0 nunca bate com um
 * `expectedTestCount` legítimo (a dupla-igualdade reprova).
 */
export function rsCountDeclared(testsCode: string): number {
  const parsed = rsParse(testsCode, { fileName: RS_TEST_PATH });
  if (!parsed.ok) return 0;
  let total = 0;
  const caminhar = (no: LangNode): void => {
    if ((no.type === 'FunctionItem' || no.type === 'FunctionSignatureItem') && no.attributes.test === 'true') {
      total += 1;
    }
    for (const filho of no.children) caminhar(filho);
  };
  caminhar(parsed.root);
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
 * A linha de resumo do `libtest`:
 *
 *     test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
 *     test result: FAILED. 1 passed; 1 failed; 0 ignored; …
 *
 * `ok` × `FAILED` é o VEREDITO; os números falam por si. Tolerante a ANSI e
 * à ausência de `filtered out`/`finished` (o formato varia entre versões).
 */
const LINHA_RESULTADO =
  /^test result: (ok|FAILED)\.\s+(\d+) passed;\s+(\d+) failed;\s+(\d+) ignored;\s+(\d+) measured(?:;\s*(\d+) filtered out)?/;

/**
 * O cabeçalho do `libtest` — o "running N tests" que abre o relatório real:
 *
 *     running 2 tests
 *     running 1 test        (SINGULAR com um teste só — medido)
 *
 * É a PRIMEIRA peça de integridade do `rsCountRun`: um resumo forjado que
 * chega sozinho (a forja que escreve direto no fd e mata o runner) não tem
 * cabeçalho nenhum.
 */
const CABECALHO_TESTES = /^running\s+(\d+)\s+tests?$/;

/**
 * A INTEGRIDADE do resumo (FIX adversarial H1 — defesa em profundidade no
 * RUNTIME do aluno). O `countRun` sem a contagem declarada é tolerante (lê o
 * último bloco, ponto), porque é a régua dos TESTES unitários. Mas o RUNTIME
 * (`runStudentCode`/`verifyChallengePair`/provas) passa `declarado` — e aí o
 * bloco `test result:` só é aceito como resumo REAL do `libtest` se TODAS as
 * condições fecharem:
 *
 *   1. existe a linha `running N tests` com N === declarado (a forja que
 *      escreve o bloco direto no fd — `std::io::stdout().write_all` bypassa a
 *      captura do libtest — e mata o runner com `std::process::exit(0)` NÃO
 *      tem cabeçalho, porque o resumo real nunca sai);
 *   2. existem ≥ N linhas por-teste `test <nome> ... ok|FAILED|ignored`
 *      DISTINTAS antes do resumo (a forja do item 1 não imprime linhas
 *      por-teste nenhuma);
 *   3. o bloco é o ÚLTIMO conteúdo do libtest: depois dele não sobra linha
 *      `test …`, `running … tests` nem outro `test result:` (a linha em branco
 *      e o texto ALHEIO ao libtest — o `error: test failed` do cargo no
 *      stderr — não contam: o relatório real termina nele);
 *   4. os números do bloco são consistentes com as linhas por-teste (passed
 *      === nº de `ok`, failed === nº de `FAILED`, ignored === nº de
 *      `ignored`; e veredito `ok` com failed > 0 é contradição do libtest).
 *
 * LIMITE HONESTO (declarado de propósito): quem REIMPLEMENTAR o repórter
 * INTEIRO (cabeçalho + N linhas por-teste + resumo consistente) ainda passa
 * por aqui — a defesa real de AUTORIA contra isso continua sendo o orçamento
 * (`RS_FORBIDDEN_INVARIANTS` → `api:std::process::exit` REPROVA o desafio na
 * auditoria) e a dupla-igualdade. Esta defesa é do RUNTIME do aluno (o submit
 * do aluno não passa pelo gate de autoria), mesma classe da defesa do lado
 * JavaScript (o resumo real sai por último) na medida que o formato do
 * `libtest` permite.
 */
function resumoIntegro(
  linhas: readonly string[],
  idxResumo: number,
  veredito: 'ok' | 'FAILED',
  pass: number,
  fail: number,
  ignorados: number,
  declarado: number,
): boolean {
  // (1) o cabeçalho do relatório REAL, com a contagem declarada.
  let cabecalho = false;
  for (const linha of linhas) {
    const m = CABECALHO_TESTES.exec(linha.trim());
    if (m && inteiro(m[1]) === declarado) {
      cabecalho = true;
      break;
    }
  }
  if (!cabecalho) return false;

  // (2)+(4) as linhas por-teste ANTES do resumo, distintas, e os números do
  // bloco batendo com a contagem delas.
  const nomes = new Set<string>();
  let oks = 0;
  let falhas = 0;
  let ignoradas = 0;
  for (let i = 0; i < idxResumo; i += 1) {
    const m = LINHA_TESTE.exec(linhas[i].trim());
    if (!m) continue;
    nomes.add(m[1]);
    if (m[2] === 'ok') oks += 1;
    else if (m[2] === 'FAILED') falhas += 1;
    else ignoradas += 1;
  }
  if (nomes.size < declarado) return false;
  if (oks !== pass || falhas !== fail || ignoradas !== ignorados) return false;
  if (veredito === 'ok' && fail !== 0) return false;

  // (3) o resumo é o ÚLTIMO conteúdo do libtest (texto estranho depois —
  // stderr do cargo, por exemplo — não é relatório de teste).
  for (let i = idxResumo + 1; i < linhas.length; i += 1) {
    const linha = linhas[i].trim();
    if (linha === '') continue;
    if (
      LINHA_RESULTADO.test(linha) ||
      LINHA_TESTE.test(linha) ||
      CABECALHO_TESTES.test(linha)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Contagem EXECUTADA, do ÚLTIMO bloco `test result:` — o do runner real vem
 * sempre por último (testes rodam, depois o `libtest` imprime o fechamento),
 * e um resumo FORJADO pelo código sob teste fica para trás. Mesma defesa do
 * lado Python/JavaScript.
 *
 * COM `declarado` (o caminho do RUNTIME — o número de `rsCountDeclared` sobre
 * o `testsCode`), o bloco só vale se passar na integridade de
 * `resumoIntegro`: cabeçalho `running N tests` com N === declarado, ≥ N
 * linhas por-teste distintas, o resumo por último e os números consistentes
 * com as linhas. A forja que escreve `test result: ok. 2 passed; …` direto no
 * fd e mata o runner (exit 0, sem relatório real) REPROVA em 1 e 2 — a
 * contagem volta ZERO e a dupla-igualdade reprova.
 *
 * SEM `declarado` (os testes unitários), a leitura fica na forma fraca do
 * "último bloco" — a mesma dos outros adaptadores.
 *
 * `testsRun = passed + failed` — um teste `#[ignore]`d NÃO rodou (skipped),
 * e a prova 1 exige passagem INTEGRAL (`proofs.ts:197`). Erro de COMPILAÇÃO
 * não tem resumo nenhum → zero (e o exit 101 fala pelo resto).
 */
export function rsCountRun(output: string, declarado?: number): RunCounts {
  // eslint-disable-next-line no-control-regex
  const limpo = output.replace(/\u001B\[[0-9;]*m/g, '');
  const linhas = limpo.split('\n');

  let idxResumo = -1;
  let veredito: 'ok' | 'FAILED' | null = null;
  let pass = 0;
  let fail = 0;
  let ignorados = 0;
  for (let i = 0; i < linhas.length; i += 1) {
    const m = LINHA_RESULTADO.exec(linhas[i].trim());
    if (!m) continue;
    idxResumo = i;
    veredito = m[1] as 'ok' | 'FAILED';
    pass = inteiro(m[2]);
    fail = inteiro(m[3]);
    ignorados = inteiro(m[4]);
  }
  if (idxResumo === -1 || veredito === null) return CONTAGEM_ZERO;
  if (
    declarado !== undefined &&
    !resumoIntegro(linhas, idxResumo, veredito, pass, fail, ignorados, declarado)
  ) {
    return CONTAGEM_ZERO;
  }
  return { testsRun: pass + fail, pass, fail, skipped: ignorados };
}

// ---------------------------------------------------------------------------
// (12) parseChecks — os checks individuais para a UI do aluno
// ---------------------------------------------------------------------------

/**
 * Uma linha POR teste, impressa pelo `libtest`:
 *
 *     test testa_dobro_positivo ... ok
 *     test tests::testa_x ... ok          (o nome vem QUALIFICADO quando o
 *                                          teste vive dentro de `mod tests`)
 *     test testa_errado ... FAILED
 *     test lento ... ignored
 *
 * `ok` → passou; `FAILED` → não; `ignored` → NÃO passou (a prova 1 exige
 * passagem integral). `parseChecks` alimenta a UI; quem decide o gate é
 * `countRun`.
 */
const LINHA_TESTE = /^test\s+(\S+)\s+\.\.\.\s+(ok|FAILED|ignored)\b/;

export function rsParseChecks(output: string): RunCheck[] {
  // eslint-disable-next-line no-control-regex
  const linhas = output.replace(/\u001B\[[0-9;]*m/g, '').split('\n');
  const checks: RunCheck[] = [];
  for (const linha of linhas) {
    const m = LINHA_TESTE.exec(linha.trim());
    if (!m) continue;
    checks.push({ name: m[1], passed: m[2] === 'ok' });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// (13) failureExitCodes
// ---------------------------------------------------------------------------

/**
 * ─── O EXIT-GUARD EM RUST: O PORTE, E O QUE ELE NÃO COBRE ──────────────────
 *
 * `engine/exec/harness.ts:142` (`EXIT_GUARD_SOURCE`) é carregado no filho de
 * JavaScript por `node --require`; em Python mora no `tests/__init__.py`
 * (importado antes de tudo). Em Rust NÃO EXISTE `--require` nem um "primeiro
 * import" — e o que existe é MELHOR para este ataque, porque em Rust a forja
 * é ESTÁTICA: o atacante precisa escrever `std::process::exit` (ou um caminho
 * equivalente) NO FONTE, e texto estático é o que o orçamento vigia.
 *
 * AS TRÊS CAMADAS (todas medidas nesta máquina, rustc/cargo 1.98):
 *
 *   1. MANIFESTO (`[lib] test = false`): um `#[test]` FORJADO dentro do
 *      `src/lib.rs` do aluno NEM RODA — o `cargo test` coleta só os testes
 *      do `tests/desafio.rs` (o código do aluno roda apenas quando CHAMADO).
 *      Medido: com a forja `#[cfg(test)] mod f { #[test] fn x() {
 *      println!("test result: ok. 9 passed; …"); std::process::exit(0); } }`
 *      no lib.rs, a saída é `running 2 tests` (os dois do desafio) e exit 0
 *      LEGÍTIMO — a forja nunca executou.
 *
 *   2. PROIBIÇÃO GLOBAL (RS_FORBIDDEN_INVARIANTS): a forja que sobra é
 *      `std::process::exit(0)` dentro de uma FUNÇÃO chamada por um teste
 *      real. O texto é estático, o orçamento o vigia em qualquer nível
 *      (solução, starter, teoria) — o desafio que o contém é REPROVADO na
 *      auditoria, antes de qualquer execução.
 *
 *   3. A ÚLTIMA LINHA (rsCountRun): mesmo sem 1 e 2, o resumo do runner real
 *      é sempre o ÚLTIMO — uma forja que NÃO mate o processo perde para o
 *      relatório real. E no RUNTIME (o submit do aluno, que não passa pelo
 *      gate de autoria) `rsCountRun` ganha a integridade de `resumoIntegro`:
 *      o bloco só vale com o cabeçalho `running N tests` (N === declarado),
 *      ≥ N linhas por-teste distintas, o resumo por último e números
 *      consistentes com as linhas — a forja de UMA linha morre aí.
 *
 * O QUE CONTINUA SEM PROTEÇÃO (o limite honesto, o mesmo grau do `ctypes`
 * do lado Python): um payload deliberado que alcance um exit 0 sem NENHUMA
 * das chaves proibidas — `extern "C"` é proibido (`node:ForeignModItem`),
 * `asm!` é proibido, e o MANIFESTO não aceita crates (offline, stdlib only):
 * não sobra caminho conhecido. E quem reimplementar o REPÓRTER inteiro
 * (cabeçalho + N linhas + resumo) ainda passa pela integridade — contra isso
 * a defesa real de autoria segue sendo o orçamento, e a dupla-igualdade
 * (`successRequiresCountMatch` é `true` LITERAL no tipo) fecha o resto: exit
 * 0 sozinho NUNCA prova sucesso, em linguagem nenhuma.
 */
export const RS_FAILURE_POLICY: FailurePolicy = {
  // Falha = exit != 0. Fatos medidos (docs/research/06, ficha Rust): 0
  // passou · 101 FALHOU (panic, inclusive `assert_eq!` falho) · 101 erro de
  // COMPILAÇÃO (o rustc sai 101 e o cargo propaga) · 0 com ZERO testes é o
  // buraco do Node repetido (`running 0 tests` sai 0!) — a dupla-igualdade
  // é o que o fecha.
  isFailure: (exitCode: number): boolean => exitCode !== 0,
  meaning: (exitCode: number): string => {
    if (exitCode === 137) return 'timeout-ou-OOM';
    if (exitCode === 0) return 'exit 0';
    if (exitCode === 101) return 'exit 101 (teste falhou, panic ou erro de compilação)';
    if (exitCode === 1) return 'exit 1 (erro de uso do cargo)';
    if (exitCode === 2) return 'exit 2 (argumento inválido do cargo)';
    return `exit ${exitCode}`;
  },
  successRequiresCountMatch: true,
};

/** Exit code de panic/falha do Rust (o ERROR_EXIT_CODE do libtest — medido). */
export const RS_EXIT_PANIC = 101;

// ---------------------------------------------------------------------------
// (14) envScrub — ALLOWLIST (§6 obs. 2)
// ---------------------------------------------------------------------------

/**
 * O VENENO DE RUST (§6 obs. 2 + a memória do projeto), e o que cada um faz
 * se herdado:
 *
 *   - `RUSTFLAGS` / `CARGO_ENCODED_RUSTFLAGS` — injeta flags de compilação
 *     no filho: `-C link-arg` executa comando na LINK, e flag de cfg muda o
 *     que compila. O veneno mais direto da lista do §6;
 *   - `CARGO_TARGET_DIR` — desvia os artefatos de build para FORA do
 *     diretório isolado do desafio (o build de um desafio contaminaria — ou
 *     seria contaminado por — o de outro);
 *   - `RUSTC` / `CARGO` — trocam o compilador/runner por um binário
 *     arbitrário; `RUSTC_WRAPPER` / `RUSTC_WORKSPACE_WRAPPER` — intercalam
 *     um processo na compilação (o `sccache` do dev rodaria dentro da prova);
 *   - `RUSTUP_HOME` / `CARGO_HOME` — redirecionam a instalação inteira do
 *     toolchain (o filho passaria a usar o toolchain de quem configurou o
 *     ambiente, não o que `detect()` resolveu);
 *   - `RUSTUP_TOOLCHAIN` — força outro toolchain no proxy;
 *   - proxies HTTP — o corte de rede do lado JavaScript, o mesmo conjunto;
 *   - `FORCE_COLOR`/`CLICOLOR*`/`NO_COLOR` — ANSI derruba o regex de
 *     contagem (defesa em profundidade; `CARGO_TERM_COLOR=never` é o fixed).
 *
 * `fixed` e `strip` NUNCA se sobrepõem (obrigatório — `applyEnvScrub` aplica
 * fixed e DEPOIS apaga strip; `applyLegacyEnvScrub` faz o contrário). `RUSTC`
 * e `RUSTDOC` estão em `fixed` (PINADOS, decisão 6) e NÃO em `strip`: a
 * allowlist nunca os herdaria (não estão na lista), e o fixed é o que os
 * impõe — sem o pin, o cargo REAL acha o rustc PROXY pelo PATH e o filho
 * morre (medido).
 */
function politicaEnvBase(): EnvScrubPolicy {
  const fixed: Record<string, string> = {
    // Determinismo de build e saída.
    CARGO_NET_OFFLINE: 'true', // nunca toca crates.io (o desafio é stdlib only)
    CARGO_INCREMENTAL: '0', // build incremental é estado entre execuções
    CARGO_TERM_COLOR: 'never', // ANSI no relatório derruba o regex de contagem
    RUST_BACKTRACE: '0', // saída de panic determinística (o `note:` some)
    // Paridade de endurecimento de rede com o lado JavaScript.
    NO_PROXY: '*',
    no_proxy: '*',
  };
  // O PIN do compilador (decisão 6): resolvido por `detect()` — o cargo REAL
  // despacha o rustc pelo PATH (que é o PROXY numa máquina rustup) e o
  // rustdoc só seria invocado por doc-tests (desligados no manifesto; o pin
  // fica mesmo assim, por defesa em profundidade).
  const real = toolchainRealMemo;
  if (real !== null && real !== undefined) {
    // O RUSTC pinado: sem ele o cargo REAL despacha o `rustc` pelo PATH —
    // que numa máquina rustup é O PROXY, morto sob a allowlist (medido).
    if (real.rustc !== null) {
      fixed.RUSTC = real.rustc;
      const path = carregar<PathModule>('node:path');
      const fs = carregar<FsModule>('node:fs');
      const rustdoc = path.join(path.dirname(real.rustc), 'rustdoc');
      if (fs.existsSync(rustdoc)) fixed.RUSTDOC = rustdoc;
    }
  }
  return {
    // `allow` é VAZIO de propósito: cargo não precisa de nada além do
    // `ENV_ALLOWLIST_COMUM` (PATH/HOME/TMPDIR/…) — o oposto do JavaScript,
    // que precisa de `npm_node_execpath`.
    allow: [],
    fixed,
    strip: [
      // O veneno nomeado no §6 obs. 2.
      'RUSTFLAGS',
      'CARGO_TARGET_DIR',
      // Redirecionam toolchain/compilador — mas NÃO o `RUSTC`/`RUSTDOC`
      // pinados (fix acima; a não-sobreposição é invariante testada).
      'CARGO_HOME',
      'RUSTUP_HOME',
      'RUSTUP_TOOLCHAIN',
      'RUSTUP_DIST_SERVER',
      'RUSTUP_UPDATE_ROOT',
      'CARGO',
      'RUSTC_WRAPPER',
      'RUSTC_WORKSPACE_WRAPPER',
      'CARGO_ENCODED_RUSTFLAGS',
      'CARGO_BUILD_TARGET',
      'CARGO_BUILD_TARGET_DIR',
      'CARGO_BUILD_RUSTFLAGS',
      'CARGO_BUILD_RUSTDOCFLAGS',
      'RUST_LIB_BACKTRACE',
      'RUST_MIN_STACK',
      // Proxies herdados (o mesmo conjunto do lado JavaScript).
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'ALL_PROXY',
      'http_proxy',
      'https_proxy',
      'all_proxy',
      // ANSI no relatório derruba o regex de contagem (defesa em profundidade).
      'FORCE_COLOR',
      'CLICOLOR',
      'CLICOLOR_FORCE',
      'NO_COLOR',
    ],
    scope: [
      'CARGO_NET_OFFLINE=true + --offline no runner + [dependencies] vazio no manifesto: o desafio é stdlib only e NUNCA toca a rede',
      'RUSTFLAGS/CARGO_TARGET_DIR/CARGO_HOME/RUSTUP_HOME removidos: o filho compila com a toolchain que o detect() resolveu, no diretório isolado do desafio',
      'RUSTC/RUSTDOC pinados em fixed: o cargo REAL acha o rustc pelo PATH (o proxy do rustup, numa máquina de dev) e o filho morreria sem o pin — medido',
      '[lib] test = false + doctest = false no manifesto: o #[test] forjado no código do aluno nem roda (o porte do exit-guard para Rust)',
      'LIMITE: a defesa de relatório forjado é o GATE de orçamento (RS_FORBIDDEN_INVARIANTS), não um guard de runtime — não há --require em Rust',
      'LIMITE: não bloqueia socket cru (TCP/UDP) — um payload deliberado ainda conecta via std::net',
      'LIMITE: a semântica VIGENTE do harness usa buildChildEnv (allowlist) por adaptador; o reforço legacy (denylist) reimpõe fixed e strip',
    ],
  };
}

/**
 * A política de ambiente do filho, com o `RUSTC` pinado por `detect()`.
 * MEMOIZADA — a resolução da toolchain custa spawns, e a política é
 * consultada a cada spawn de prova.
 */
let politicaEnvMemo: EnvScrubPolicy | null = null;

export function rsEnvScrub(): EnvScrubPolicy {
  if (politicaEnvMemo === null) {
    // Garante que a resolução da toolchain rodou (é ela que põe o RUSTC no
    // fixed — a ordem importa: quem consulta a política DEPOIS de um
    // rsDetect() com cargo na máquina tem o pin; sem cargo, a política é a
    // base e o spawn falha fail-closed no detect do executor).
    rsDetect();
    politicaEnvMemo = politicaEnvBase();
  }
  return politicaEnvMemo;
}

/** Só para os testes: esquece a política (e a detecção) memoizadas. */
export function rsResetEnvScrub(): void {
  politicaEnvMemo = null;
  rsResetDetectCache();
}

// ---------------------------------------------------------------------------
// O ADAPTADOR
// ---------------------------------------------------------------------------

/**
 * Tags de bloco cercado que a engine trata como Rust executável. `rust-repl`
 * NÃO entra (não existe ainda): uma transcrição de REPL é texto, não código
 * parseável.
 */
export const RS_THEORY_FENCE_TAGS: readonly string[] = ['rust', 'rs'];

/**
 * Tokens de `challenge.language` / `track.programmingLanguage` que resolvem
 * para este adaptador. `'rust'` é a LINGUAGEM (e é o id); `'rs'` acompanha
 * pelo mesmo motivo que `'ts'` acompanha `'typescript'`: é a grafia curta (a
 * extensão do arquivo e a tag da cerca), e reprovar uma trilha por escrever a
 * MESMA coisa com dois nomes é ruído, não trava.
 */
export const RS_CHALLENGE_LANGUAGES: readonly ChallengeLanguageToken[] = ['rust', 'rs'];

/**
 * O `track.runtime` default. `'cargo'` sem a versão: a versão PINADA é
 * campo da TRILHA (a forma `cargo-1.98`), e o artefato `atoms.rust.json`
 * carrega a toolchain que o produziu para conferência — cravá-la aqui a
 * faria envelhecer em silêncio a cada release. O default do ADAPTADOR é a
 * toolchain, como `'cpython'` é o do Python e `'nodejs'` o do JavaScript.
 */
export const RS_DEFAULT_RUNTIME = 'cargo';

/**
 * O eixo `form:` NÃO está disponível em Rust na v1 — o seletor de
 * `engine/form/selector.ts` é tipado sobre `ts.Node`; generalizar é projeto
 * próprio (a mesma declaração de `PY_FORM_AXIS_SUPPORTED`).
 */
export const RS_FORM_AXIS_SUPPORTED = false;

export const rustAdapter: LanguageAdapter = {
  id: 'rust',
  label: 'Rust',
  challengeLanguages: RS_CHALLENGE_LANGUAGES,
  defaultRuntime: RS_DEFAULT_RUNTIME,
  theoryFenceTags: RS_THEORY_FENCE_TAGS,

  parse: rsParse,
  constructKey: rsConstructKey,
  inventory: rsInventory,
  globals: rsGlobals,
  builtins: rsBuiltins,
  resolveScopes: rsResolveScopes,
  forbiddenInvariants: RS_FORBIDDEN_INVARIANTS,
  layout: rsLayout,
  filePathPattern: RS_SAFE_FILE_PATH_RE,
  testCommand: RS_TEST_COMMAND,
  countDeclared: rsCountDeclared,
  countRun: rsCountRun,
  parseChecks: rsParseChecks,
  // O pin do RUSTC sai de `detect()` — por isso a política é um getter
  // memoizado, não um objeto literal: a resolução custa spawns e é lazy.
  get envScrub(): EnvScrubPolicy {
    return rsEnvScrub();
  },
  failureExitCodes: RS_FAILURE_POLICY,
  detect: rsDetect,
};
