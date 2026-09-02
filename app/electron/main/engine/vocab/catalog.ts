/**
 * app/electron/main/engine/vocab/catalog.ts — o CATÁLOGO DE API de linguagem.
 *
 * Papel no pacote P-05 (`docs/16-engine-de-trilha.md` §3.1): o eixo `api:` do
 * vocabulário fechado não pode ser enumerado de `globalThis` cru — sem filtro,
 * medimos 342 nomes de propriedade na trilha atual, a maioria de domínio e não
 * de linguagem. O catálogo é a camada que distingue os DOIS: ele só contém
 * receptores ESCOLHIDOS (lista documentada abaixo) e, para cada um, os membros
 * enumerados por `Object.getOwnPropertyNames` em tempo de geração — nada é
 * digitado à mão e nada entra por ser "parecido com linguagem".
 *
 * Estrutura que o consumidor (ondas 2–4) deve usar:
 *   - `kind`: `class` (construtor com protótipo), `object` (objeto singleton:
 *     JSON/Math/Reflect/Intl/console) ou `module` (módulo built-in);
 *   - `members`: caminhos do RECEPTOR, ex. `Array.from` (estáticos de classe,
 *     membros de objeto/módulo);
 *   - `prototypeMembers`: caminhos `Receptor.prototype.membro`, ex.
 *     `Array.prototype.push` (só para `kind: class`).
 *   - `api_paths`: o achatamento completo, já com o prefixo `api:` (ex.
 *     `api:Array.prototype.push`) — é o que casa com as chaves que o extrator
 *     emite e com o eixo `api:` de `atoms.json`.
 *
 * REGRAS E PREMISSAS (documentação obrigatória da escolha de receptores):
 *   1. O catálogo cobre a BIBLIOTECA DE LINGUAGEM (ECMAScript) + `console`,
 *      porque o próprio cabeçalho de `atomKeys.ts` cita `api:console.log` como
 *      forma canônica e o extrator emite essa chave para código real.
 *   2. NÃO entram objetos de runtime do Node (URL, fetch, WebAssembly,
 *      structuredClone, …) como receptores de LINGUAGEM: são cobertos pelo
 *      eixo `global:` (são propriedades de `globalThis`). A prova de que o
 *      filtro existe: `fetch` existe em `globalThis` mas NÃO é receptor.
 *      NOTA P-29 (onda 2): objetos de runtime que TAMBÉM são módulos built-in
 *      entram pela porta de MÓDULO (regra 3) — `process` é módulo
 *      (`require('process')`) e o código real emite `api:process.env`; isso é
 *      dicionário de módulo, não receptor de linguagem. `Buffer`/`URL`/`fetch`
 *      continuam fora (globais sem raiz importada no código que as usa).
 *   3. Receptores de MÓDULO (`RECEPTORES_MODULO` abaixo): built-ins que (a) a
 *      trilha `nodejs-do-zero` importa com acesso a membro, ou (b) um
 *      currículo Node básico ensina. Exclusões e a forma das chaves estão
 *      documentadas no próprio array.
 *   4. `Object.getOwnPropertyNames` lê só membros com chave de STRING (propriedades
 *      com chave Symbol — `Symbol.iterator`, `Symbol.toStringTag` — ficam fora) e
 *      só os PRÓPRIOS do objeto. Consequência medida: os protótipos de
 *      TypedArray em V8 têm como próprios apenas `constructor` e
 *      `BYTES_PER_ELEMENT` (os métodos vivem no `%TypedArrayPrototype%`
 *      compartilhado, que não tem nome de receptor) — o catálogo reporta o que
 *      o runtime realmente expõe como próprio. Membros NÃO-enumeráveis entram
 *      (getOwnPropertyNames inclui), ex.: `process.domain`/`process.title`.
 *      Módulos cujo export é uma INSTÂNCIA com protótipo de superfície real
 *      (`cluster`/`process` são EventEmitters) somam os membros PRÓPIOS da
 *      CADEIA de protótipos até `Object.prototype`/`Function.prototype` —
 *      `cluster.on`, `process.on`: o código os endereça sem segmento
 *      `.prototype.`, e sem isso uma aula legítima de `cluster.on` nasceria
 *      com lacuna falsa (a motivação do P-29). Export que é CLASSE/FUNÇÃO
 *      (`assert`, `test`, `events`, `stream`, `module`) NÃO caminha: o
 *      protótipo de uma classe é superfície de instância (`new stream()`),
 *      não membro de módulo — `api:stream.pipe` seria chave falsa.
 *   5. Receptor ausente no runtime de geração é pulado (ex.: SharedArrayBuffer
 *      em um runtime antigo) — o carimbo de versão diz com que runtime o
 *      artefato foi produzido.
 *   6. O eixo `api:` de `atoms.json` é a UNIÃO módulos ∪ catálogo
 *      (`gerarEixoApi` em `generate.ts`): fechar o dicionário AUMENTA o eixo
 *      api: de atoms.json no MESMO commit — os dois artefatos andam juntos
 *      por construção, e o teste byte-a-byte exige re-gerar os dois.
 *   7. DETERMINISMO: os membros são um snapshot de `getOwnPropertyNames` no
 *      momento da geração, e a ordem do array é a ordem do require. O módulo
 *      legado `domain` (carregado por `node:repl`) anexa a propriedade própria
 *      NÃO-enumerável `domain` (valor null) a EventEmitters criados DEPOIS de
 *      carregado — por isso `cluster` (um EventEmitter) é capturado ANTES de
 *      `repl` na ordem do array: `cluster.domain` fica fora do catálogo de
 *      forma estável nos DOIS processos (gerador CLI e runner de teste seguem
 *      a MESMA ordem de `RECEPTORES_MODULO`). A superfície de
 *      `EventEmitter.prototype` (ou a de qualquer protótipo real de módulo) é
 *      estável — não depende do módulo `domain`.
 *
 * Este módulo NÃO importa `typescript` e NÃO escreve arquivo: ele monta dados
 * puros a partir de um `VocabRuntime` injetável (ver `generate.ts`, que
 * serializa, valida com `ATOM_KEY_RE` e persiste).
 */

/**
 * Observações cruas do runtime — INJETÁVEIS para que as funções puras do
 * gerador sejam testáveis com um runtime fake e determinísticas no mesmo
 * runtime real. O construtor real está em `generate.ts` (`runtimeDoProcesso`).
 */
export interface VocabRuntime {
  /** `process.version` do runtime que produziu o artefato. */
  nodeVersion: string;
  /** `ts.version` do TypeScript que produziu o artefato. */
  typescriptVersion: string;
  /** `Object.getOwnPropertyNames(globalThis)` — nomes crus dos globais. */
  globalNames: readonly string[];
  /** `require('module').builtinModules` — nomes crus ('assert', 'node:test', …). */
  builtinModules: readonly string[];
  /** `ts.SyntaxKind` como record nome→valor (para derivar universos do enum). */
  syntaxKindEnum: Readonly<Record<string, number>>;
  /**
   * O INVENTÁRIO da linguagem: os nomes CANÔNICOS de tipo de nó, ordenados.
   *
   * FONTE (onda 5): `adapter.inventory()` — o membro 3 dos 15 do §6 de
   * `docs/research/08-multilingua-trava-deterministica.md`, que o documento
   * define como "o universo enumerável de tipos de nó, gerado do `inventory()`
   * do adaptador, nunca digitado". Ele SUBSTITUI o par
   * `kindNameOf` + varredura local que existia aqui: o gerador fazia a mesma
   * varredura do enum que o adaptador já fazia, e duas varreduras da mesma
   * fonte são duas chances de discordar sobre o que é um nome canônico.
   */
  inventario: () => readonly string[];
  /** `ts.tokenToString` — texto canônico de um token de operador. */
  tokenToStringOf: (kind: number) => string | undefined;
  /** O objeto global do runtime (para ler construtores, protótipos e objetos). */
  globalObject: unknown;
  /** `Object.getOwnPropertyNames` (só chaves de string). */
  ownPropertyNames: (obj: unknown) => string[];
  /** `Object.getPrototypeOf` — superfície de protótipo de módulos que são
   *  instâncias (ex.: `cluster`/`process` são EventEmitters). */
  getPrototypeOf: (obj: unknown) => unknown;
  /** `require` — para os receptores de módulo (`assert`, `node:test`). */
  requireModule: (specifier: string) => unknown;
}

/** `kind` de um receptor: o que distingue as superfícies de API. */
export type CatalogoReceptorKind = 'class' | 'object' | 'module';

/** Um receptor do catálogo, com caminhos já qualificados pelo nome dele. */
export interface CatalogoReceptor {
  /** Nome pelo qual o código endereça o receptor (`Array`, `console`, `assert`). */
  name: string;
  kind: CatalogoReceptorKind;
  /** Caminhos `Receptor.membro` — estáticos de classe, membros de objeto/módulo. */
  members: string[];
  /** Caminhos `Receptor.prototype.membro` — vazio para object/module. */
  prototypeMembers: string[];
}

/** O artefato `api-catalog.json` em memória (o que `generate.ts` serializa). */
export interface CatalogoApi {
  schema: 1;
  node_version: string;
  typescript_version: string;
  receivers: CatalogoReceptor[];
  /** Achatamento completo, já com prefixo `api:` — ex. `api:Array.prototype.push`. */
  api_paths: string[];
}

/**
 * Receptores de LINGUAGEM (ECMAScript + console) — a lista escolhida e
 * documentada (premissas 1–2 acima). Classes têm protótipo; JSON/Math/Reflect/
 * Intl/console são objetos singleton.
 */
export const RECEPTORES_LINGUAGEM: readonly { name: string; kind: CatalogoReceptorKind }[] = [
  { name: 'Object', kind: 'class' },
  { name: 'Function', kind: 'class' },
  { name: 'Boolean', kind: 'class' },
  { name: 'Symbol', kind: 'class' },
  { name: 'BigInt', kind: 'class' },
  { name: 'Number', kind: 'class' },
  { name: 'String', kind: 'class' },
  { name: 'Array', kind: 'class' },
  { name: 'Date', kind: 'class' },
  { name: 'RegExp', kind: 'class' },
  { name: 'Error', kind: 'class' },
  { name: 'EvalError', kind: 'class' },
  { name: 'RangeError', kind: 'class' },
  { name: 'ReferenceError', kind: 'class' },
  { name: 'SyntaxError', kind: 'class' },
  { name: 'TypeError', kind: 'class' },
  { name: 'URIError', kind: 'class' },
  { name: 'AggregateError', kind: 'class' },
  { name: 'Promise', kind: 'class' },
  { name: 'Map', kind: 'class' },
  { name: 'Set', kind: 'class' },
  { name: 'WeakMap', kind: 'class' },
  { name: 'WeakSet', kind: 'class' },
  { name: 'WeakRef', kind: 'class' },
  { name: 'FinalizationRegistry', kind: 'class' },
  { name: 'ArrayBuffer', kind: 'class' },
  { name: 'SharedArrayBuffer', kind: 'class' },
  { name: 'DataView', kind: 'class' },
  // TypedArrays — os 11 com protótipo próprio (ver premissa 4 sobre o
  // %TypedArrayPrototype% compartilhado em V8).
  { name: 'Int8Array', kind: 'class' },
  { name: 'Uint8Array', kind: 'class' },
  { name: 'Uint8ClampedArray', kind: 'class' },
  { name: 'Int16Array', kind: 'class' },
  { name: 'Uint16Array', kind: 'class' },
  { name: 'Int32Array', kind: 'class' },
  { name: 'Uint32Array', kind: 'class' },
  { name: 'Float32Array', kind: 'class' },
  { name: 'Float64Array', kind: 'class' },
  { name: 'BigInt64Array', kind: 'class' },
  { name: 'BigUint64Array', kind: 'class' },
  { name: 'JSON', kind: 'object' },
  { name: 'Math', kind: 'object' },
  { name: 'Reflect', kind: 'object' },
  { name: 'Intl', kind: 'object' },
  { name: 'console', kind: 'object' },
] as const;

/**
 * Receptores de MÓDULO built-in (P-29 fecha a enumeração — ver cabeçalho,
 * premissas 2–3 e 6–7).
 *
 * CONJUNTO ESCOLHIDO e critério (onda 2 batch B):
 *   - OBRIGATÓRIOS pelo CORPUS real: módulos que a trilha `nodejs-do-zero`
 *     importa com acesso a membro (`fs.readFile`, `http.createServer`,
 *     `crypto.randomUUID`, `cluster.fork`, `process.env` …) — sem eles uma
 *     aula legítima nasce com lacuna falsa no dicionário do LLM (o bug que
 *     esta sub-tarefa fecha).
 *   - CURRÍCULO: módulos que um curso introdutório de Node ensina (a seção
 *     "Built-in modules" da documentação oficial + o percurso de um curso
 *     básico de Node): path/os/url/util/events/stream/zlib/https/net/dns/
 *     readline/tty/timers/querystring/string_decoder/v8/vm/module/
 *     perf_hooks/repl/worker_threads/child_process/buffer.
 *   - EXCLUÍDOS (o motivo decide — nada sai por preguiça):
 *       - `punycode`     deprecated desde o Node 7 (DEP0040): o pacote
 *                        userland é o caminho mantido; não é superfície que
 *                        um currículo ensine.
 *       - `console`      já é receptor de LINGUAGEM (objeto singleton lido de
 *                        `globalThis`); `require('node:console')` é o MESMO
 *                        objeto — duplicar o receptor só criaria ambiguidade.
 *       - `inspector`    protocolo interno de depuração do V8, não é
 *                        superfície de ensino.
 *       - subpaths (`fs/promises`, `assert/strict`, `dns/promises`, …) e
 *                        módulos `_*` internos / experimentais (`node:sqlite`,
 *                        `node:sea`, `node:test/reporters`): a raiz que o
 *                        código escreve é a do módulo canônico (`import fs
 *                        from 'node:fs/promises'` emite `api:fs.readFile`,
 *                        coberto pelo receptor `fs`).
 *
 * FORMA DAS CHAVES (espelha o padrão assert/test, verificado no catálogo
 * commitado: `assert.throws` → `api:assert.throws`, NUNCA
 * `api:node:assert.throws`): o `name` é a RAIZ que o código escreve e os
 * membros entram como `api:<name>.<membro>`. A grafia `node:` do eixo api:
 * (`api:node:assert`) é o universo de NOMES de módulo de `atoms.json`
 * (`gerarUniversoModulos`), não de membros. O `moduleId` é o specifier do
 * require() real na geração — os novos entram na grafia canônica `node:`.
 *
 * ORDEM: `assert`/`test` primeiro (padrão histórico do harness); os demais em
 * ordem ALFABÉTICA — o que coloca `cluster` antes de `repl` (premissa 7:
 * `repl` carrega o módulo legado `domain`, que anexaria `domain` próprio em
 * `cluster` se o EventEmitter fosse criado depois). O membro é lido de
 * `require()` real; nenhum membro é digitado à mão.
 */
export const RECEPTORES_MODULO: readonly { name: string; moduleId: string }[] = [
  // harness da trilha (padrão histórico do pacote P-05)
  { name: 'assert', moduleId: 'assert' },
  { name: 'test', moduleId: 'node:test' },
  // corpus + currículo — ordem alfabética (cluster antes de repl, premissa 7)
  { name: 'buffer', moduleId: 'node:buffer' },
  { name: 'child_process', moduleId: 'node:child_process' },
  { name: 'cluster', moduleId: 'node:cluster' },
  { name: 'crypto', moduleId: 'node:crypto' },
  { name: 'dns', moduleId: 'node:dns' },
  { name: 'events', moduleId: 'node:events' },
  { name: 'fs', moduleId: 'node:fs' },
  { name: 'http', moduleId: 'node:http' },
  { name: 'https', moduleId: 'node:https' },
  { name: 'module', moduleId: 'node:module' },
  { name: 'net', moduleId: 'node:net' },
  { name: 'os', moduleId: 'node:os' },
  { name: 'path', moduleId: 'node:path' },
  { name: 'perf_hooks', moduleId: 'node:perf_hooks' },
  { name: 'process', moduleId: 'node:process' },
  { name: 'querystring', moduleId: 'node:querystring' },
  { name: 'readline', moduleId: 'node:readline' },
  { name: 'repl', moduleId: 'node:repl' },
  { name: 'stream', moduleId: 'node:stream' },
  { name: 'string_decoder', moduleId: 'node:string_decoder' },
  { name: 'timers', moduleId: 'node:timers' },
  { name: 'tty', moduleId: 'node:tty' },
  { name: 'url', moduleId: 'node:url' },
  { name: 'util', moduleId: 'node:util' },
  { name: 'v8', moduleId: 'node:v8' },
  { name: 'vm', moduleId: 'node:vm' },
  { name: 'worker_threads', moduleId: 'node:worker_threads' },
  { name: 'zlib', moduleId: 'node:zlib' },
] as const;

function sortUnico(lista: readonly string[]): string[] {
  return [...new Set(lista)].sort();
}

/**
 * Monta o catálogo a partir de um runtime. PURO: mesma entrada, mesma saída;
 * sem IO (o próprio `requireModule` do runtime é injetado). Receptores
 * ausentes no runtime são omitidos — o carimbo de versão documenta o runtime.
 */
export function montarCatalogo(runtime: VocabRuntime): CatalogoApi {
  const globals = runtime.globalObject as Record<string, unknown>;
  const receivers: CatalogoReceptor[] = [];

  for (const { name, kind } of RECEPTORES_LINGUAGEM) {
    const alvo = globals[name];
    if (typeof alvo !== 'function' && typeof alvo !== 'object') continue; // ausente no runtime
    const members = runtime.ownPropertyNames(alvo).map((m) => `${name}.${m}`);
    let prototypeMembers: string[] = [];
    if (kind === 'class') {
      const proto = (alvo as { prototype?: unknown }).prototype;
      if (proto !== null && (typeof proto === 'object' || typeof proto === 'function')) {
        prototypeMembers = runtime.ownPropertyNames(proto).map((m) => `${name}.prototype.${m}`);
      }
    }
    receivers.push({
      name,
      kind,
      members: sortUnico(members),
      prototypeMembers: sortUnico(prototypeMembers),
    });
  }

  for (const { name, moduleId } of RECEPTORES_MODULO) {
    let modulo: unknown;
    try {
      modulo = runtime.requireModule(moduleId);
    } catch {
      continue; // módulo ausente no runtime — omitido, versão documenta
    }
    const membros = new Set<string>(runtime.ownPropertyNames(modulo).map((m) => `${name}.${m}`));
    // Superfície de PROTÓTIPO de módulos cujo export é uma INSTÂNCIA (objeto)
    // com protótipo de superfície real (premissa 4/7): `cluster` e `process`
    // são EventEmitters — o código escreve `cluster.on`/`process.on`, membros
    // herdados de `EventEmitter.prototype`, que NÃO são próprios do objeto do
    // módulo. A mesma regra dos receptores class (membros do protótipo
    // entram), sem o segmento `.prototype.` no caminho porque é assim que o
    // código endereça. A cadeia é percorrida até
    // `Object.prototype`/`Function.prototype` (linguagem, não módulo). Export
    // que é CLASSE/FUNÇÃO (`assert`, `test`, `events` = EventEmitter,
    // `stream` = Stream, `module` = Module) NÃO caminha: o protótipo de uma
    // classe é superfície de INSTÂNCIA (`new events()`), não membro do módulo
    // — `api:stream.pipe` seria uma chave falsa.
    const prototipoDeObjeto = runtime.getPrototypeOf({});
    const prototipoDeFuncao = runtime.getPrototypeOf(() => undefined);
    if (typeof modulo === 'object' && modulo !== null) {
      let proto = runtime.getPrototypeOf(modulo);
      while (
        proto !== null &&
        proto !== undefined &&
        proto !== prototipoDeObjeto &&
        proto !== prototipoDeFuncao
      ) {
        for (const m of runtime.ownPropertyNames(proto)) {
          membros.add(`${name}.${m}`);
        }
        proto = runtime.getPrototypeOf(proto);
      }
    }
    receivers.push({
      name,
      kind: 'module',
      members: sortUnico([...membros]),
      prototypeMembers: [],
    });
  }

  receivers.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const apiPaths = sortUnico(receivers.flatMap((r) => [...r.members, ...r.prototypeMembers]).map((p) => `api:${p}`));

  return {
    schema: 1,
    node_version: runtime.nodeVersion,
    typescript_version: runtime.typescriptVersion,
    receivers,
    api_paths: apiPaths,
  };
}