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
 *   2. NÃO entram objetos de runtime do Node (URL, fetch, timers,
 *      WebAssembly, structuredClone, …): eles são cobertos pelo eixo
 *      `global:` (são propriedades de `globalThis`) e pelo universo de
 *      MÓDULOS (`api:node:*`); o catálogo é a camada de LINGUAGEM. A prova de
 *      que o filtro existe: `fetch` existe em `globalThis` mas NÃO é receptor.
 *   3. Receptores de módulo são `assert` e `test` — os que o HARNESS da trilha
 *      usa (`HARNESS_RECEPTIVE_SEED`: `api:assert.equal`, `api:node:test` …) e
 *      que o extrator resolve como raiz importada. Os demais módulos built-in
 *      ficam no eixo `api:node:*` de `atoms.json`, sem membros.
 *   4. `Object.getOwnPropertyNames` lê só membros com chave de STRING (propriedades
 *      com chave Symbol — `Symbol.iterator`, `Symbol.toStringTag` — ficam fora) e
 *      só os PRÓPRIOS do objeto. Consequência medida: os protótipos de
 *      TypedArray em V8 têm como próprios apenas `constructor` e
 *      `BYTES_PER_ELEMENT` (os métodos vivem no `%TypedArrayPrototype%`
 *      compartilhado, que não tem nome de receptor) — o catálogo reporta o que
 *      o runtime realmente expõe como próprio.
 *   5. Receptor ausente no runtime de geração é pulado (ex.: SharedArrayBuffer
 *      em um runtime antigo) — o carimbo de versão diz com que runtime o
 *      artefato foi produzido.
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
  /** `kindName` do extrator (tabela CANÔNICA de nomes de SyntaxKind). */
  kindNameOf: (kind: number) => string;
  /** `ts.tokenToString` — texto canônico de um token de operador. */
  tokenToStringOf: (kind: number) => string | undefined;
  /** O objeto global do runtime (para ler construtores, protótipos e objetos). */
  globalObject: unknown;
  /** `Object.getOwnPropertyNames` (só chaves de string). */
  ownPropertyNames: (obj: unknown) => string[];
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
 * Receptores de MÓDULO built-in (premissa 3): `assert` e `test` são os que o
 * harness da trilha usa (`HARNESS_RECEPTIVE_SEED` cita `api:assert.equal` …
 * e `api:node:test`), e o extrator resolve raiz importada como caminho
 * completo (`assert.throws`, não `.throws`). O membro é lido de `require()`
 * real; o nome do receptor é o texto da raiz que o código escreve.
 */
export const RECEPTORES_MODULO: readonly { name: string; moduleId: string }[] = [
  { name: 'assert', moduleId: 'assert' },
  { name: 'test', moduleId: 'node:test' },
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
    receivers.push({
      name,
      kind: 'module',
      members: sortUnico(runtime.ownPropertyNames(modulo).map((m) => `${name}.${m}`)),
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