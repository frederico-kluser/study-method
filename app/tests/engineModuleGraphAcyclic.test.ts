/**
 * tests/engineModuleGraphAcyclic.test.ts — GUARDA ESTRUTURAL: o grafo de
 * imports de `electron/main/engine/**` não pode voltar a fechar o ciclo
 * `phases/ ↔ modes/`.
 *
 * O QUE ACONTECEU (a onda que este teste tranca). `f7Theory.ts` e
 * `f8Challenges.ts` faziam `JSON.parse` direto sobre a resposta do autor, e a
 * regra 18 do prompt canônico (`docs/16-engine-de-trilha.md` §7.1) manda o
 * modelo escrever um checksum de cauda DEPOIS do JSON — o parse quebrava
 * contra qualquer modelo obediente. O conserto reusou `separarJsonECauda`, já
 * escrita em `modes/curriculumGap.ts`. Funcionou, mas fechou um ciclo real no
 * grafo de módulos: `phases/f7Theory.ts → modes/curriculumGap.ts →
 * phases/f7Theory.ts` (via `blocosDeCodigoDaTeoria`, que `curriculumGap`
 * importa de F7) e, por extensão,
 * `phases/f8Challenges.ts → modes/curriculumGap.ts → phases/f7Theory.ts →
 * phases/f8Challenges.ts`. Um revisor adversarial confirmou que o ciclo era
 * empiricamente inofensivo (nenhum dos três módulos usava o binding do outro
 * em tempo de AVALIAÇÃO, só dentro de função — `tsc` limpo, suíte verde) mas
 * apontou que isso INVERTIA A CAMADA: `phases/` (o QUE fazer, F0..F12)
 * passando a depender de `modes/` (COMO orquestrar várias fases — `repair`,
 * `reorder`, `curriculumGap`), quando é `modes/` quem deveria orquestrar
 * `phases/`, nunca o contrário.
 *
 * A CORREÇÃO: `separarJsonECauda` foi extraída, byte-idêntica, para
 * `runtime/jsonTail.ts` — um módulo-FOLHA (não importa de `phases/` nem de
 * `modes/`, como nenhum dos outros arquivos de `runtime/`) — e os três
 * consumidores (`f7Theory.ts`, `f8Challenges.ts`, `curriculumGap.ts`, o dono
 * original) passaram a importar dali. `curriculumGap.ts` continua importando
 * `blocosDeCodigoDaTeoria` de `f7Theory.ts` — essa é a direção CERTA
 * (`modes/` orquestrando `phases/`) e não é, sozinha, um ciclo.
 *
 * POR QUE ESTE TESTE, E NÃO SÓ `tsc`/`npm run build`. `tsc --noEmit` TOLERA
 * ciclo de módulos ES — o ciclo antigo compilava limpo, então "`tsc` passa"
 * nunca teria pego a regressão. `npm run build` (electron-vite) é AINDA MAIS
 * fraco aqui: `engine/phases` e `engine/modes` não são alcançados pelo bundle
 * do processo principal — só o CLI via `tsx` (`tools/track-engine/cli.ts`) os
 * importa — então o rollup NUNCA "vê" esses arquivos para poder avisar. A
 * única prova real é ler o grafo de imports e procurar o ciclo diretamente,
 * como este arquivo faz (varredura estática de texto, sem `tsc`/bundler —
 * mesma técnica de "ler fonte como texto" de `tests/lessonQuizVisual.test.ts`
 * e `tests/lessonQuizKeyCoherence.test.ts`, aplicada a imports em vez de JSX).
 *
 * ESCOPO DA VARREDURA E DO QUE ELA NÃO AFIRMA. A varredura cobre TODO
 * `electron/main/engine/**.ts` e segue especificadores relativos (`./`, `../`)
 * — não segue import fora de `engine/` (ex.: `../../content/trackLoader`),
 * porque o ciclo em questão é INTERNO à engine e o enunciado da tarefa pede o
 * grafo de `engine/**`. A varredura encontrou DOIS outros ciclos, PRÉ-
 * EXISTENTES e fora do escopo desta correção (nenhum dos dois envolve
 * `phases/` nem `modes/`, e nenhum foi introduzido por esta onda):
 *   - `lang/registry.ts ↔ lang/javascript.ts` (e `↔ python.ts`, `↔
 *     typescript.ts`) — o registry importa cada adaptador de linguagem e cada
 *     adaptador importa tipos do registry de volta;
 *   - `exec/proofs.ts ↔ exec/typesCheck.ts`.
 * Este teste os DECLARA na ALLOWLIST abaixo (por NOME do par de arquivos, não
 * por trivial "ignora tudo") e falha se QUALQUER ciclo fora dela aparecer —
 * seja o ciclo antigo phases/modes voltando, seja um ciclo NOVO introduzido
 * por um refactor futuro em outro canto da engine.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = resolve(HERE, '../electron/main/engine');

/** Lista, recursivamente, todo `.ts` sob `dir` (a engine não tem `.tsx`). */
function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Resolve um especificador de import RELATIVO (`./x`, `../y`) para o arquivo
 * `.ts` real, tentando `<spec>.ts` e `<spec>/index.ts` (a única convenção de
 * diretório usada em `engine/**` é `research/index.ts`). Devolve `null` para
 * specs fora do conjunto de arquivos varrido (ex.: `../../content/...`) —
 * a varredura é INTERNA a `engine/**`, por desenho (ver cabeçalho).
 */
function resolveRelativeImport(fromFile: string, spec: string, knownFiles: Set<string>): string | null {
  const base = dirname(fromFile);
  const resolved = resolve(base, spec);
  const candidates = [`${resolved}.ts`, join(resolved, 'index.ts')];
  for (const candidate of candidates) {
    if (knownFiles.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Extrai os especificadores de import/re-export RELATIVOS de um arquivo, por
 * regex sobre o TEXTO — captura `import ... from '...'`, `import('...')` e
 * `export ... from '...'` (qualquer forma termina em `from '<spec>'`), sem
 * precisar de um parser TS: um import span multi-linha ainda termina numa
 * única ocorrência textual de `from '<spec>'`.
 */
function relativeImportSpecs(src: string): string[] {
  const specs: string[] = [];
  const re = /from\s+['"](\.[^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) specs.push(m[1]);
  return specs;
}

/** Constrói o grafo `arquivo -> Set<arquivo que ele importa>` de `engine/**`. */
function buildImportGraph(root: string): Map<string, Set<string>> {
  const files = listTsFiles(root);
  const knownFiles = new Set(files);
  const graph = new Map<string, Set<string>>();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const edges = new Set<string>();
    for (const spec of relativeImportSpecs(src)) {
      const target = resolveRelativeImport(file, spec, knownFiles);
      if (target && target !== file) edges.add(target);
    }
    graph.set(file, edges);
  }
  return graph;
}

/**
 * Acha ciclos por DFS com 3 cores. NÃO garante enumerar TODO ciclo simples do
 * grafo (um nó já FECHADO — preto — não é revisitado, então um back-edge
 * "escondido" atrás de um nó já processado por outro caminho pode não gerar
 * uma entrada separada) — mas garante DETECTAR a EXISTÊNCIA de qualquer
 * ciclo alcançável a partir de cada raiz, que é a propriedade que os testes
 * abaixo precisam: "existe ciclo tocando phases E modes" vira `false`
 * verificável, e qualquer back-edge novo aparece em `cycles`.
 */
function findCycles(graph: Map<string, Set<string>>): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  function dfs(node: string): void {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const idx = stack.indexOf(next);
        cycles.push(stack.slice(idx).concat(next));
      } else if (c === WHITE) {
        dfs(next);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) dfs(node);
  }
  return cycles;
}

function rel(file: string): string {
  return relative(ENGINE_ROOT, file).replace(/\\/g, '/');
}

/** O CONJUNTO de arquivos (sem ordem/rotação) de um ciclo — chave de dedupe/allowlist. */
function cycleSignature(cycle: string[]): string {
  const withoutRepeat = cycle.slice(0, -1); // o DFS repete o nó inicial no fim
  return [...new Set(withoutRepeat.map(rel))].sort().join(' , ');
}

/**
 * ALLOWLIST — ciclos PRÉ-EXISTENTES, fora do escopo desta correção (ver
 * cabeçalho). Qualquer ciclo cuja assinatura NÃO esteja aqui reprova o teste
 * — o ciclo antigo phases/modes incluído, se algum refactor futuro o
 * reabrir.
 */
const CICLOS_PERMITIDOS = new Set<string>(
  [
    ['lang/registry.ts', 'lang/javascript.ts'],
    ['lang/registry.ts', 'lang/python.ts'],
    ['lang/registry.ts', 'lang/typescript.ts'],
    ['exec/proofs.ts', 'exec/typesCheck.ts'],
  ].map((pair) => [...pair].sort().join(' , ')),
);

describe('grafo de imports de engine/** — sem ciclo phases/modes (regressão da onda que extraiu jsonTail.ts)', () => {
  const graph = buildImportGraph(ENGINE_ROOT);

  it('nenhum arquivo de phases/ importa de modes/ (a camada certa: modes orquestra phases, nunca o contrário)', () => {
    const ofensores: string[] = [];
    for (const [file, edges] of graph) {
      if (!rel(file).startsWith('phases/')) continue;
      for (const target of edges) {
        if (rel(target).startsWith('modes/')) ofensores.push(`${rel(file)} -> ${rel(target)}`);
      }
    }
    assert.deepEqual(ofensores, [], 'phases/ voltou a importar de modes/ — a camada inverteu de novo');
  });

  it('runtime/ continua FOLHA: nenhum arquivo de runtime/ importa de phases/ ou modes/', () => {
    const ofensores: string[] = [];
    for (const [file, edges] of graph) {
      if (!rel(file).startsWith('runtime/')) continue;
      for (const target of edges) {
        const r = rel(target);
        if (r.startsWith('phases/') || r.startsWith('modes/')) ofensores.push(`${rel(file)} -> ${r}`);
      }
    }
    assert.deepEqual(ofensores, [], 'runtime/ deixou de ser folha — algo ali passou a importar phases/ ou modes/');
  });

  it('jsonTail.ts especificamente não importa nada de phases/ nem de modes/', () => {
    const jsonTail = resolve(ENGINE_ROOT, 'runtime/jsonTail.ts');
    const edges = [...(graph.get(jsonTail) ?? [])].map(rel);
    assert.deepEqual(
      edges.filter((e) => e.startsWith('phases/') || e.startsWith('modes/')),
      [],
      'jsonTail.ts precisa continuar folha — é a peça que fecha o ciclo se voltar a depender de phases/ ou modes/',
    );
  });

  it('f7Theory.ts, f8Challenges.ts e curriculumGap.ts importam separarJsonECauda do MESMO módulo-folha', () => {
    const f7 = resolve(ENGINE_ROOT, 'phases/f7Theory.ts');
    const f8 = resolve(ENGINE_ROOT, 'phases/f8Challenges.ts');
    const gap = resolve(ENGINE_ROOT, 'modes/curriculumGap.ts');
    const jsonTail = resolve(ENGINE_ROOT, 'runtime/jsonTail.ts');
    for (const [label, file] of [
      ['f7Theory.ts', f7],
      ['f8Challenges.ts', f8],
      ['curriculumGap.ts', gap],
    ] as const) {
      assert.ok(
        graph.get(file)?.has(jsonTail),
        `${label} deveria importar runtime/jsonTail.ts (separarJsonECauda)`,
      );
    }
  });

  it('nenhum ciclo do grafo envolve phases/ E modes/ ao mesmo tempo', () => {
    const cycles = findCycles(graph);
    const phasesEModes = cycles.filter((cycle) => {
      const rels = cycle.map(rel);
      return rels.some((r) => r.startsWith('phases/')) && rels.some((r) => r.startsWith('modes/'));
    });
    assert.deepEqual(
      phasesEModes.map((c) => c.map(rel).join(' -> ')),
      [],
      'um ciclo voltou a atravessar phases/ e modes/ ao mesmo tempo — a camada inverteu de novo',
    );
  });

  it('todo ciclo do grafo (se houver) está na allowlist de pré-existentes, documentada no cabeçalho', () => {
    const cycles = findCycles(graph);
    const assinaturas = [...new Set(cycles.map(cycleSignature))];
    const naoPermitidos = assinaturas.filter((s) => !CICLOS_PERMITIDOS.has(s));
    assert.deepEqual(
      naoPermitidos,
      [],
      'ciclo novo (fora da allowlist) apareceu no grafo de engine/** — ' +
        `assinaturas encontradas: ${assinaturas.join(' | ') || '(nenhuma)'}`,
    );
  });
});
