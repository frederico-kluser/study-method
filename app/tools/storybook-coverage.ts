#!/usr/bin/env -S npx tsx
/**
 * tools/storybook-coverage.ts — GATE DE COBERTURA de histórias do Storybook.
 *
 * A promessa do catálogo (docs/storybook/STORY-SPEC.md §8) é "TODOS os
 * componentes visuais têm história". Este script MEDÉ essa promessa: varre a
 * árvore de componentes, encontra os exports visuais e conferência-se de que
 * cada um tem uma história colocada que o cubra. Ele NÃO escreve histórias nem
 * corrige componentes — quem preenche o catálogo são as ondas de stories; aqui
 * só se mede e se reprova.
 *
 * Uso (a partir de app/):
 *   npx tsx tools/storybook-coverage.ts                   # gate sobre src/
 *   npx tsx tools/storybook-coverage.ts --allow-missing    # reporta sem falhar
 *   npx tsx tools/storybook-coverage.ts --json             # saída estruturada (CI)
 *   npx tsx tools/storybook-coverage.ts --dir <caminho>    # árvore alternativa
 *                                                          # (fixtures dos testes)
 *
 * REGRAS (as três do contrato):
 *   1. VARREDURA — `*.ts`/`*.tsx` abaixo de `--dir`. Contam para o gate os
 *      `*.tsx` COM JSX; ficam FORA da varredura (secção "Fora do gate"):
 *      histórias (`*.stories.tsx`), helpers de história
 *      (`*.stories.helpers.ts`), testes (`*.test.tsx`) e o entry (`main.tsx`).
 *   2. COMPONENTE VISUAL — export (default OU named, re-exports incluídos) que
 *      é função/arrow/classe cujo corpo devolve JSX. Um re-export segue-se no
 *      MÁXIMO 1 nível: `export { X } from './outro'` conta se `X` for visual em
 *      `./outro`; se `./outro` também só re-exportar `X`, para aí (motivo
 *      "re-export além de 1 nível").
 *   3. HISTÓRIA — `*.stories.tsx` no MESMO diretório do componente (ou em
 *      `src/storybook/foundations/`, para os casos de documentação) que o cubra.
 *      A deteção é por regex sobre o texto da história (sem parser TS): import
 *      com o nome do componente, import default do ficheiro, `component:` no
 *      meta ou menção em `satisfies Meta<typeof Nome>`.
 *
 * NÃO-VISUAIS (secção "Ignorados", sempre com motivo — nada é escondido em
 * silêncio): providers/contextos que só montam `<Ctx.Provider>`, hooks, módulos
 * `.ts` de lógica/estado, constantes e tipos. A heurística classifica a
 * maioria sozinha; o que ela não pode decidir — ex.: um provider que
 * TÉCNICAMENTE devolve JSX mas não é componente visual — fica declarado em
 * NON_VISUAL_ALLOWLIST, cada item com a sua justificação. É a lista de
 * exceções e ela vive NESTE ficheiro de propósito: mexer nela é uma decisão
 * visível no diff, nunca um salto silencioso.
 *
 * Exit codes:
 *   0  100% dos componentes visuais têm história (ou --allow-missing)
 *   1  falta alguma história (a lista sai com caminhos)
 *   2  erro de uso (flag desconhecida, --dir em falta ou inexistente)
 */
import { existsSync, promises as fs, realpathSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
// Parser TS já é dependência do repo (usado pela engine de trilha). Usamos só
// o `createSourceFile` — sem type-check, sem programa — para extrair exports e
// ver se devolvem JSX. É rápido (uma passagem por ficheiro) e muito mais
// robusto do que regex para `export default`, arrows e re-exports.
import * as ts from 'typescript';

/* ─────────────────────────────── Tipos ─────────────────────────────────── */

/** Como um ficheiro chegou à secção de ignorados. */
export type ViaIgnoramento = 'allowlist' | 'deteccao';

/** Uma exceção declarada à deteção automática de não-visuais. */
export interface ExcecaoNaoVisual {
  /**
   * Glob POSIX do ficheiro, relativo à raiz da varredura. `*` casa dentro de
   * um segmento; `**` casa segmentos inteiros. Ex.:
   * `components/sessionState/SessionStateProvider.tsx` ou `**\/*Provider.tsx`.
   */
  padrao: string;
  /** Justificação OBRIGATÓRIA — é exatamente esta frase que o relatório mostra. */
  motivo: string;
}

/** Um componente visual exportado que precisa de história. */
export interface ComponenteVisual {
  /** Nome de exibição (o que a história deve importar/usar em `meta.component`). */
  nome: string;
  /** Nomes públicos por que ele é exposto (default + named, se ambos). */
  exportacoes: string[];
  /** Ficheiro onde o export vive (relativo à raiz, posix). */
  ficheiro: string;
  /** Área = diretório do ficheiro (`components/chat`, `views/…`; `(raiz)` no topo). */
  area: string;
  /** Se é re-export: o ficheiro de origem do componente (relativo, posix). */
  origem: string | null;
  /** Tem história que o cobre? */
  coberto: boolean;
  /** História encontrada (relativa à raiz) ou null. */
  historia: string | null;
  /** Sinais que provaram a cobertura (para depuração). */
  sinais: string[];
}

/** Um ficheiro visto pela varredura e classificado como NÃO visual. */
export interface FicheiroIgnorado {
  ficheiro: string;
  motivo: string;
  via: ViaIgnoramento;
}

/** Um ficheiro fora do gate por especificação (história/teste/entry). */
export interface FicheiroExcluido {
  ficheiro: string;
  motivo: string;
}

export interface Resumo {
  total: number;
  cobertos: number;
  faltando: number;
  percentagemCobertos: number;
  percentagemFaltando: number;
  ignorados: number;
  excluidos: number;
  ficheirosVarridos: number;
}

export interface Relatorio {
  /** Raiz da varredura (caminho absoluto). */
  dir: string;
  componentes: ComponenteVisual[];
  ignorados: FicheiroIgnorado[];
  excluidos: FicheiroExcluido[];
  /** "caminho :: Nome" de tudo o que falta, pronto a colar numa issue. */
  emFalta: string[];
  resumo: Resumo;
}

/** Recetor de saída — injetável para os testes capturarem sem subprocesso. */
export interface Saida {
  stdout: (texto: string) => void;
  stderr: (texto: string) => void;
}

export interface Opcoes {
  /** `null` = não veio `--dir` (usa `src/` da raiz da app). */
  dir: string | null;
  json: boolean;
  allowMissing: boolean;
  ajuda: boolean;
}

/* ──────────────────── NON_VISUAL_ALLOWLIST (exceções) ──────────────────── */

/**
 * A lista de exceções, declarada aqui e em mais lado nenhum. Um ficheiro que
 * casa com um destes padrões NÃO conta para o total (não precisa de história),
 * mas aparece sempre em "Ignorados" com este motivo — nunca em silêncio.
 *
 * O que NÃO vem para aqui e porquê:
 *   - hooks (`use*.ts`) e módulos `.ts` de lógica/estado — a deteção automática
 *     classifica-os sozinhos ("não devolvem JSX") e o relatório lista-os;
 *   - providers/contextos SEM JSX próprio — idem (nunca chegam a parecer
 *     visuais). O que vem para aqui são os casos em que a heurística ERRARIA:
 *     um `*Provider.tsx` que monta `<Ctx.Provider>` devolve JSX, mas não é
 *     componente visual nenhum.
 */
export const NON_VISUAL_ALLOWLIST: readonly ExcecaoNaoVisual[] = [
  {
    padrao: 'components/challengeNav/ChallengeNavProvider.tsx',
    motivo:
      'Provider de contexto (ChallengeNavProvider): monta só ChallengeNavCtx.Provider e passa children — sem markup visual próprio; toda a lógica testável vive em src/lib/challengeNav.ts.',
  },
  {
    padrao: 'components/sessionState/SessionStateProvider.tsx',
    motivo:
      'Provider de contexto (SessionStateProvider): monta só SessionStateCtx.Provider e passa children — sem markup visual próprio; toda a lógica testável vive em src/lib/sessionState.ts.',
  },
  {
    padrao: 'storybook/decorators.tsx',
    motivo:
      'Infraestrutura do Storybook (decorators de API/i18n/tema): envolvem a story, não são UI do produto — uma história destas seria a decorar a si própria.',
  },
  {
    padrao: 'storybook/foundations/parts.tsx',
    motivo:
      'Peças de DOCUMENTAÇÃO das histórias de Fundamentos (secções/amostras): vivem para alimentar as histórias que as documentam, não são UI do produto (STORY-SPEC §6, DRY de layout).',
  },
];

/* ──────────────────────── Exclusões da varredura ───────────────────────── */

/** Motivo de exclusão, ou null se o ficheiro conta para a varredura. */
function motivoDeExclusao(rel: string): string | null {
  const base = path.posix.basename(rel);
  if (/\.stories\.(helpers\.)?(ts|tsx)$/.test(base)) {
    return 'história ou helper de história (fora do gate por contrato)';
  }
  if (/\.(test|spec)\.(ts|tsx)$/.test(base)) {
    return 'teste (fora do gate por contrato)';
  }
  if (/\.d\.ts$/.test(base)) {
    return 'declarações de tipos (fora do gate por contrato)';
  }
  if (rel === 'main.tsx') {
    return 'entry da app src/main.tsx (fora do gate por contrato)';
  }
  return null;
}

/* ─────────────────────────── Utilidades varias ─────────────────────────── */

function escapeRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Converte um glob simples (`*`, `**`, `?`) para regex de caminho posix. */
function padraoParaRegex(padrao: string): RegExp {
  let re = '';
  for (let i = 0; i < padrao.length; i += 1) {
    const c = padrao[i];
    if (c === '*') {
      if (padrao[i + 1] === '*') {
        // `**` casa segmentos inteiros: sozinho casa tudo, com `/` à frente
        // casa zero ou mais segmentos.
        if (padrao[i + 2] === '/') {
          re += '(?:[^/]+/)*';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += escapeRegex(c);
    }
  }
  return new RegExp(`^${re}$`);
}

function padraoCasa(padrao: string, rel: string): boolean {
  return padraoParaRegex(padrao).test(rel);
}

/** Posix relativo (o relatório e o JSON nunca mostram `\` do Windows). */
function relPosix(raiz: string, absoluto: string): string {
  return path.relative(raiz, absoluto).split(path.sep).join('/');
}

function areaDe(rel: string): string {
  const dir = path.posix.dirname(rel);
  return dir === '.' ? '(raiz)' : dir;
}

function arredonda2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ─────────────────────────── Varredura de ficheiros ────────────────────── */

const DIRS_IGNORADOS = new Set(['node_modules', 'dist', 'out', 'test-results', '.git']);

/** Todos os `*.ts`/`*.tsx` da árvore (caminhos posix relativos, ordenados). */
async function varrer(raiz: string): Promise<string[]> {
  const achados: string[] = [];
  async function passear(dir: string): Promise<void> {
    const entradas = await fs.readdir(dir, { withFileTypes: true });
    for (const entrada of entradas) {
      if (entrada.name.startsWith('.') && entrada.isDirectory()) continue;
      const abs = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (DIRS_IGNORADOS.has(entrada.name)) continue;
        await passear(abs);
      } else if (/\.(ts|tsx)$/.test(entrada.name) && !entrada.name.endsWith('.d.ts')) {
        achados.push(relPosix(raiz, abs));
      }
    }
  }
  await passear(raiz);
  return achados.sort();
}

/* ───────────────────── Análise de exports (AST do TS) ──────────────────── */

interface AlvoImportado {
  kind: 'import';
  spec: string;
  /** Nome do export no módulo alvo (`'default'` para import default). */
  nome: string;
}

type AlvoLocal = { kind: 'no'; no: ts.Node } | AlvoImportado;

interface ExportBruto {
  /** Nome de exibição (o nome local, ou o basename para default anónimo). */
  nome: string;
  /** Nomes públicos a casar nas histórias (exposto + local, quando diferem). */
  nomesPublicos: string[];
  ehDefault: boolean;
  /** Re-export: módulo alvo e nome nele (`'*'` para `export * from`). */
  reexport?: { spec: string; nome: string };
  /** Símbolo local a classificar (só quando não é re-export). */
  alvoLocal?: AlvoLocal;
}

interface CtxFicheiro {
  raiz: string;
  /** Texto de todos os ficheiros da árvore, por caminho posix relativo. */
  fontes: Map<string, string>;
  sf: ts.SourceFile;
  rel: string;
  /** Declarações locais por nome (para resolver `export default Foo`). */
  locais: Map<string, AlvoLocal>;
}

/** O nó devolve JSX (elemento, fragmento ou createElement/jsx)? */
function contemJsx(no: ts.Node): boolean {
  let achou = false;
  const visit = (n: ts.Node): void => {
    if (achou) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      achou = true;
      return;
    }
    if (ts.isCallExpression(n) && ehChamadaJsx(n)) {
      achou = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(no);
  return achou;
}

/**
 * `createElement(...)`, `jsx(...)`, `jsxs(...)`, `createPortal(...)` — devolvem
 * elemento renderizável sem sintaxe de JSX. O portal conta porque é assim que
 * `ShellSidebarPortal` e companhia publicam conteúdo no shell.
 */
function ehChamadaJsx(call: ts.CallExpression): boolean {
  const alvo = call.expression;
  const nome = ts.isIdentifier(alvo)
    ? alvo.text
    : ts.isPropertyAccessExpression(alvo)
      ? alvo.name.text
      : '';
  return nome === 'createElement' || nome === 'jsx' || nome === 'jsxs' || nome === 'createPortal';
}

function temModificador(no: ts.Node, kind: ts.SyntaxKind): boolean {
  const mods = ts.canHaveModifiers(no) ? ts.getModifiers(no) : undefined;
  return !!mods?.some((m) => m.kind === kind);
}

/** Mapa de nome → alvo local (funções, classes, consts e bindings de import). */
function construirLocais(sf: ts.SourceFile): Map<string, AlvoLocal> {
  const locais = new Map<string, AlvoLocal>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) {
      locais.set(st.name.text, { kind: 'no', no: st });
    } else if (ts.isClassDeclaration(st) && st.name) {
      locais.set(st.name.text, { kind: 'no', no: st });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) locais.set(d.name.text, { kind: 'no', no: d });
      }
    } else if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      const clause = st.importClause;
      if (!clause) continue;
      if (clause.name) {
        locais.set(clause.name.text, { kind: 'import', spec, nome: 'default' });
      }
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          locais.set(el.name.text, {
            kind: 'import',
            spec,
            nome: el.propertyName?.text ?? el.name.text,
          });
        }
      }
    }
  }
  return locais;
}

/** Exports de um ficheiro, na forma crua (antes de classificar). */
function extrairExports(ctx: CtxFicheiro): ExportBruto[] {
  const { sf, rel } = ctx;
  const basename = path.posix.basename(rel).replace(/\.(tsx|ts)$/, '');
  const saida: ExportBruto[] = [];

  for (const st of sf.statements) {
    const ehExport = temModificador(st, ts.SyntaxKind.ExportKeyword);
    const ehDefault = temModificador(st, ts.SyntaxKind.DefaultKeyword);

    if (ts.isFunctionDeclaration(st) && (ehExport || ehDefault)) {
      const nomeLocal = st.name?.text ?? basename;
      saida.push({
        nome: nomeLocal,
        nomesPublicos: st.name
          ? [st.name.text, ...(ehDefault ? ['default'] : [])]
          : ['default'],
        ehDefault: ehDefault || !st.name,
        alvoLocal: { kind: 'no', no: st },
      });
    } else if (ts.isClassDeclaration(st) && (ehExport || ehDefault)) {
      const nomeLocal = st.name?.text ?? basename;
      saida.push({
        nome: nomeLocal,
        nomesPublicos: st.name
          ? [st.name.text, ...(ehDefault ? ['default'] : [])]
          : ['default'],
        ehDefault: ehDefault || !st.name,
        alvoLocal: { kind: 'no', no: st },
      });
    } else if (ts.isVariableStatement(st) && ehExport) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        saida.push({
          nome: d.name.text,
          nomesPublicos: [d.name.text],
          ehDefault: false,
          alvoLocal: { kind: 'no', no: d },
        });
      }
    } else if (ts.isExportAssignment(st) && !st.isExportEquals) {
      // `export default <expr>` — nome de exibição é o do identificador quando
      // há (`export default Foo`), senão o basename do ficheiro.
      const expr = st.expression;
      const nomeLocal = ts.isIdentifier(expr) ? expr.text : basename;
      saida.push({
        nome: nomeLocal,
        nomesPublicos: ['default', nomeLocal],
        ehDefault: true,
        alvoLocal: { kind: 'no', no: expr },
      });
    } else if (ts.isExportDeclaration(st)) {
      const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)
        ? st.moduleSpecifier.text
        : null;
      if (spec && !st.exportClause) {
        // `export * from './m'` — cada export visual do alvo conta como deste
        // ficheiro (expandido depois, 1 nível). `export * as ns` não é
        // componente e não entra.
        saida.push({
          nome: '*',
          nomesPublicos: [],
          ehDefault: false,
          reexport: { spec, nome: '*' },
        });
      } else if (spec && st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          const nomeAlvo = el.propertyName?.text ?? el.name.text;
          saida.push({
            nome: el.name.text,
            nomesPublicos: [el.name.text, nomeAlvo],
            ehDefault: el.name.text === 'default',
            reexport: { spec, nome: nomeAlvo },
          });
        }
      } else if (!spec && st.exportClause && ts.isNamedExports(st.exportClause)) {
        // `export { A, B as C }` — re-export de símbolos locais.
        for (const el of st.exportClause.elements) {
          const nomeLocal = el.propertyName?.text ?? el.name.text;
          saida.push({
            nome: el.name.text,
            nomesPublicos: [el.name.text, nomeLocal],
            ehDefault: el.name.text === 'default',
            alvoLocal: ctx.locais.get(nomeLocal),
          });
        }
      }
    }
  }
  return saida;
}

/** Resolve um especificador de import para caminho posix relativo à raiz. */
function resolverModulo(ctx: CtxFicheiro, spec: string): string | null {
  const dirDoFicheiro = path.posix.dirname(ctx.rel);
  const candidatos: string[] = [];
  const empurrar = (base: string): void => {
    candidatos.push(base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`);
  };
  if (spec.startsWith('.')) {
    const resolvido = path.posix.normalize(path.posix.join(dirDoFicheiro, spec));
    empurrar(resolvido);
  } else if (spec.startsWith('@/')) {
    // Alias `@` = raiz da app (pai de `src`) — espelha tsconfig.json.
    const raizApp = path.posix.basename(ctx.raiz) === 'src' ? path.posix.dirname(ctx.raiz) : ctx.raiz;
    empurrar(path.posix.join(raizApp, spec.slice(2)));
  } else if (spec.startsWith('@shared/')) {
    const raizApp = path.posix.basename(ctx.raiz) === 'src' ? path.posix.dirname(ctx.raiz) : ctx.raiz;
    empurrar(path.posix.join(raizApp, 'shared', spec.slice('@shared/'.length)));
  } else {
    return null; // pacote externo (react, @mui/…) — nunca é componente do app
  }
  for (const c of candidatos) {
    if (ctx.fontes.has(c)) return c;
  }
  return null;
}

type Classificacao = { visual: true } | { visual: false; motivo: string };

const VISUAL: Classificacao = { visual: true };
const naoVisual = (motivo: string): Classificacao => ({ visual: false, motivo });

/**
 * O NÓ devolve JSX? Função/arrow/classe com JSX no corpo = visual; `memo(X)`,
 * `forwardRef(() => <…/>)` e companhia resolvem-se pelos argumentos; um
 * identificador resolve-se para a declaração local ou para o import (que é a
 * travessia de 1 nível dos re-exports).
 */
function classificaNo(no: ts.Node, ctx: CtxFicheiro, saltos: number, visitados: Set<string>): Classificacao {
  if (ts.isFunctionDeclaration(no) || ts.isFunctionExpression(no) || ts.isArrowFunction(no)) {
    if (!no.body) return naoVisual('função sem corpo');
    return contemJsx(no.body) ? VISUAL : naoVisual('função que não devolve JSX');
  }
  if (ts.isClassDeclaration(no) || ts.isClassExpression(no)) {
    return contemJsx(no) ? VISUAL : naoVisual('classe que não devolve JSX');
  }
  if (ts.isVariableDeclaration(no)) {
    return no.initializer
      ? classificaNo(no.initializer, ctx, saltos, visitados)
      : naoVisual('constante sem inicializador');
  }
  if (ts.isIdentifier(no)) {
    return classificaIdentificador(no.text, ctx, saltos, visitados);
  }
  if (ts.isCallExpression(no)) {
    // HOC: `memo(Foo)`, `forwardRef(() => <…/>)`, `styled(Box)\`…\`` e companhia.
    if (contemJsx(no)) return VISUAL;
    const alvo = no.expression;
    const nomeChamada = ts.isIdentifier(alvo)
      ? alvo.text
      : ts.isPropertyAccessExpression(alvo)
        ? alvo.name.text
        : '';
    if (nomeChamada === 'styled') return VISUAL; // styled() SEMPRE cria componente
    for (const arg of no.arguments) {
      const c = classificaNo(arg, ctx, saltos, visitados);
      if (c.visual) return c;
    }
    return naoVisual('chamada que não devolve JSX');
  }
  if (ts.isTaggedTemplateExpression(no)) {
    return classificaNo(no.tag, ctx, saltos, visitados);
  }
  return naoVisual('expressão que não devolve JSX');
}

function classificaIdentificador(
  nome: string,
  ctx: CtxFicheiro,
  saltos: number,
  visitados: Set<string>,
): Classificacao {
  const chave = `${ctx.rel}::${nome}`;
  if (visitados.has(chave)) return naoVisual('referência circular');
  visitados.add(chave);

  const alvo = ctx.locais.get(nome);
  if (!alvo) return naoVisual(`símbolo '${nome}' não declarado no ficheiro`);
  if (alvo.kind === 'no') {
    return classificaNo(alvo.no, ctx, saltos, visitados);
  }
  // Binding de import → segue para o outro módulo (isto É o salto de nível).
  return classificaReexport(alvo.spec, alvo.nome, ctx, saltos, visitados);
}

/** Travessia de re-export, com teto de `saltos` níveis entre ficheiros. */
function classificaReexport(
  spec: string,
  nomeNoAlvo: string,
  ctx: CtxFicheiro,
  saltos: number,
  visitados: Set<string>,
): Classificacao {
  if (saltos <= 0) return naoVisual('re-export além de 1 nível (teto do contrato)');
  const alvoRel = resolverModulo(ctx, spec);
  if (!alvoRel) return naoVisual(`módulo re-exportado '${spec}' não está na árvore`);
  const alvoCtx = contextoDe(ctx, alvoRel);
  if (!alvoCtx) return naoVisual(`módulo re-exportado '${spec}' não pôde ser lido`);

  const bruto = extrairExports(alvoCtx).find(
    (e) => e.nome === nomeNoAlvo || e.nomesPublicos.includes(nomeNoAlvo),
  );
  if (!bruto) {
    // `import X from './m'` onde o alvo tem `export default X` com outro nome
    // local — casa pelo default.
    if (nomeNoAlvo === 'default') {
      const def = extrairExports(alvoCtx).find((e) => e.ehDefault);
      if (def) return classificaExportBruto(def, alvoCtx, saltos - 1, visitados);
    }
    return naoVisual(`'${nomeNoAlvo}' não é export de '${spec}'`);
  }
  return classificaExportBruto(bruto, alvoCtx, saltos - 1, visitados);
}

function classificaExportBruto(
  bruto: ExportBruto,
  ctx: CtxFicheiro,
  saltos: number,
  visitados: Set<string>,
): Classificacao {
  if (bruto.reexport) {
    return classificaReexport(bruto.reexport.spec, bruto.reexport.nome, ctx, saltos, visitados);
  }
  if (bruto.alvoLocal) {
    if (bruto.alvoLocal.kind === 'no') {
      return classificaNo(bruto.alvoLocal.no, ctx, saltos, visitados);
    }
    return classificaReexport(bruto.alvoLocal.spec, bruto.alvoLocal.nome, ctx, saltos, visitados);
  }
  return naoVisual('export sem alvo classificável');
}

/** Constrói o contexto de análise de um ficheiro (fonte + AST + locais). */
function contextoDe(ctxBase: { raiz: string; fontes: Map<string, string> }, rel: string): CtxFicheiro | null {
  const texto = ctxBase.fontes.get(rel);
  if (texto === undefined) return null;
  const sf = ts.createSourceFile(
    rel,
    texto,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return { raiz: ctxBase.raiz, fontes: ctxBase.fontes, sf, rel, locais: construirLocais(sf) };
}

/* ─────────────────────── Detecção de histórias (regex) ─────────────────── */

interface Historia {
  rel: string;
  texto: string;
}

const RE_IMPORT = /\bimport\s+(?:type\s+)?([^'"]*?)\s+from\s*['"]([^'"]+)['"]/g;

interface ImportNaHistoria {
  clause: string;
  spec: string;
}

function extrairImports(texto: string): ImportNaHistoria[] {
  const saida: ImportNaHistoria[] = [];
  RE_IMPORT.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_IMPORT.exec(texto)) !== null) {
    saida.push({ clause: m[1], spec: m[2] });
  }
  return saida;
}

/** O especificador de import aponta para o ficheiro do componente? */
function specApontaPara(spec: string, historiaRel: string, compRel: string): boolean {
  const dirHistoria = path.posix.dirname(historiaRel);
  const semExt = (p: string): string => p.replace(/\.(tsx|ts)$/, '');
  const compSemExt = semExt(compRel);
  const specNorm = spec.replace(/\\/g, '/').replace(/\.(tsx|ts)$/, '');

  // Relativo: resolve de verdade (os ficheiros existem na árvore).
  if (spec.startsWith('.')) {
    const resolvido = path.posix.normalize(path.posix.join(dirHistoria, specNorm));
    if (resolvido === compSemExt) return true;
  }
  // Alias (`@/…`, `@shared/…`) ou qualquer outro: sufixo do caminho do ficheiro
  // (cobre `@/src/components/chat/ChatBubble` → `components/chat/ChatBubble`).
  if (specNorm === compSemExt || specNorm.endsWith(`/${compSemExt}`)) return true;
  // Mesmo diretório + basename (ex.: `./ChatBubble` de `ChatBubble.stories.tsx`).
  if (dirHistoria === path.posix.dirname(compRel)) {
    const base = path.posix.basename(compSemExt);
    if (specNorm === `./${base}` || specNorm === base) return true;
  }
  return false;
}

function temImportDefault(clause: string): boolean {
  return /^\s*(type\s+)?[A-Za-z_$][\w$]*\s*(,|$)/.test(clause);
}

/**
 * A história cobre o componente? Sinais (regex sobre o texto — a lei está em
 * STORY-SPEC §3): import com o nome, import default do ficheiro, `component:`
 * no meta ou `typeof Nome` (o `satisfies Meta<typeof Nome>` do contrato).
 */
function historiaCobre(historia: Historia, comp: ComponenteVisual): string[] {
  const sinais: string[] = [];
  const nomes = [...new Set([comp.nome, ...comp.exportacoes])].filter((n) => n && n !== 'default');

  for (const nome of nomes) {
    const reNome = new RegExp(`\\b${escapeRegex(nome)}\\b`);
    if (reNome.test(historia.texto)) {
      // Só conta como "menção do nome" quando o nome está num dos papéis do
      // contrato — nunca uma palavra perdida no meio da prosa.
      const reImport = new RegExp(`\\bimport\\b[^;'"]*?\\b${escapeRegex(nome)}\\b[^;'"]*?\\bfrom\\b`);
      const reComponent = new RegExp(`\\bcomponent\\s*:\\s*\\{?\\s*${escapeRegex(nome)}\\b`);
      const reTypeof = new RegExp(`\\btypeof\\s+${escapeRegex(nome)}\\b`);
      const reRender = new RegExp(`<(?:${escapeRegex(nome)})(?:\\s|/|>|\\.)`);
      if (reImport.test(historia.texto)) sinais.push(`import ${nome}`);
      if (reComponent.test(historia.texto)) sinais.push(`component: ${nome}`);
      if (reTypeof.test(historia.texto)) sinais.push(`typeof ${nome}`);
      if (reRender.test(historia.texto)) sinais.push(`render <${nome}/>`);
    }
  }

  for (const imp of extrairImports(historia.texto)) {
    if (specApontaPara(imp.spec, historia.rel, comp.ficheiro)) {
      if (comp.exportacoes.includes('default') && temImportDefault(imp.clause)) {
        sinais.push(`import default de ${imp.spec}`);
      } else if (nomes.some((n) => new RegExp(`\\b${escapeRegex(n)}\\b`).test(historia.texto))) {
        // Importa o ficheiro E a história fala do nome do componente — cobre.
        sinais.push(`import do ficheiro ${imp.spec}`);
      }
    }
  }
  return [...new Set(sinais)];
}

/* ────────────────────────────── Relatório ─────────────────────────────── */

/**
 * A análise inteira: varre `raiz`, classifica exports, casa histórias e devolve
 * o relatório. É a função que os testes usam diretamente (com árvores temporárias).
 */
export async function analisar(raiz: string): Promise<Relatorio> {
  const raizAbs = path.resolve(raiz);
  const stat = await fs.stat(raizAbs);
  if (!stat.isDirectory()) {
    throw new Error(`--dir não é um diretório: ${raizAbs}`);
  }

  const rels = await varrer(raizAbs);
  const fontes = new Map<string, string>();
  for (const rel of rels) {
    fontes.set(rel, await fs.readFile(path.join(raizAbs, rel), 'utf8'));
  }
  const ctxBase = { raiz: raizAbs, fontes };

  const componentes: ComponenteVisual[] = [];
  const ignorados: FicheiroIgnorado[] = [];
  const excluidos: FicheiroExcluido[] = [];

  for (const rel of rels) {
    const motivoExclusao = motivoDeExclusao(rel);
    if (motivoExclusao) {
      excluidos.push({ ficheiro: rel, motivo: motivoExclusao });
      continue;
    }

    const excecao = NON_VISUAL_ALLOWLIST.find((e) => padraoCasa(e.padrao, rel));
    if (excecao) {
      // Exceção DECLARADA — não se discute a heurística, mostra-se o motivo.
      ignorados.push({ ficheiro: rel, motivo: excecao.motivo, via: 'allowlist' });
      continue;
    }

    const ctx = contextoDe(ctxBase, rel);
    if (!ctx) continue;
    const exports = extrairExports(ctx);

    // Só os `*.tsx` COM JSX são candidatos a componente visual (regra 1). Um
    // `.ts` (barrel, hook, módulo de lógica) ou um `.tsx` sem JSX nunca precisa
    // de história — mas aparece em "Ignorados" com o motivo, nunca em silêncio.
    const ehTsx = rel.endsWith('.tsx');
    const temJsx = contemJsx(ctx.sf);
    if (!ehTsx || !temJsx) {
      ignorados.push({ ficheiro: rel, motivo: motivoIgnorado(rel, exports, ehTsx, temJsx), via: 'deteccao' });
      continue;
    }

    // `export * from './m'` expande-se para os exports visuais do alvo (1 nível).
    const linhas: ComponenteVisual[] = [];
    for (const bruto of exports) {
      if (bruto.reexport?.nome === '*') {
        const alvoRel = resolverModulo(ctx, bruto.reexport.spec);
        const alvoCtx = alvoRel ? contextoDe(ctxBase, alvoRel) : null;
        if (!alvoCtx) continue;
        for (const alvo of extrairExports(alvoCtx)) {
          if (alvo.reexport) continue; // 1 nível: o alvo que se arranje sozinho
          const c = classificaExportBruto(alvo, alvoCtx, 0, new Set());
          if (!c.visual) continue;
          linhas.push({
            nome: alvo.nome,
            exportacoes: [alvo.nome],
            ficheiro: rel,
            area: areaDe(rel),
            origem: alvoRel ?? null,
            coberto: false,
            historia: null,
            sinais: [],
          });
        }
        continue;
      }

      const c = bruto.reexport
        ? classificaReexport(bruto.reexport.spec, bruto.reexport.nome, ctx, 1, new Set())
        : classificaExportBruto(bruto, ctx, 1, new Set());
      if (!c.visual) continue;

      // Um símbolo exportado como default E named (`export function Foo` +
      // `export default Foo`) é UM componente — dedup pela chave local.
      const chave = `${rel}::${bruto.nome}`;
      const existente = linhas.find((l) => `${l.ficheiro}::${l.nome}` === chave);
      if (existente) {
        existente.exportacoes = [...new Set([...existente.exportacoes, ...bruto.nomesPublicos])];
        continue;
      }
      linhas.push({
        nome: bruto.nome,
        exportacoes: [...new Set(bruto.nomesPublicos.length ? bruto.nomesPublicos : [bruto.nome])],
        ficheiro: rel,
        area: areaDe(rel),
        origem: bruto.reexport ? (resolverModulo(ctx, bruto.reexport.spec) ?? bruto.reexport.spec) : null,
        coberto: false,
        historia: null,
        sinais: [],
      });
    }

    if (linhas.length === 0) {
      ignorados.push({
        ficheiro: rel,
        motivo: motivoIgnorado(rel, exports, ehTsx, temJsx),
        via: 'deteccao',
      });
      continue;
    }
    componentes.push(...linhas);
  }

  // ── Histórias colocadas (STORY-SPEC §1) ──
  const historiasPorDir = new Map<string, Historia[]>();
  const fundamentos: Historia[] = [];
  for (const [rel, texto] of fontes) {
    if (!/\.stories\.tsx$/.test(rel)) continue;
    const h: Historia = { rel, texto };
    const dir = path.posix.dirname(rel);
    if (/^storybook\/foundations(\/|$)/.test(dir) || /^src\/storybook\/foundations(\/|$)/.test(dir)) {
      fundamentos.push(h);
    } else {
      const lista = historiasPorDir.get(dir) ?? [];
      lista.push(h);
      historiasPorDir.set(dir, lista);
    }
  }

  for (const comp of componentes) {
    const dirComp = path.posix.dirname(comp.ficheiro);
    const candidatas: Historia[] = [
      ...(historiasPorDir.get(dirComp) ?? []),
      // Re-export: a história do componente costuma viver onde ele nasce.
      ...(comp.origem ? (historiasPorDir.get(path.posix.dirname(comp.origem)) ?? []) : []),
      ...fundamentos,
    ];
    for (const h of candidatas) {
      const sinais = historiaCobre(h, comp);
      if (sinais.length > 0) {
        comp.coberto = true;
        comp.historia = h.rel;
        comp.sinais = sinais;
        break;
      }
    }
  }

  componentes.sort((a, b) =>
    a.area.localeCompare(b.area) || a.ficheiro.localeCompare(b.ficheiro) || a.nome.localeCompare(b.nome),
  );
  ignorados.sort((a, b) => a.ficheiro.localeCompare(b.ficheiro));
  excluidos.sort((a, b) => a.ficheiro.localeCompare(b.ficheiro));

  const total = componentes.length;
  const cobertos = componentes.filter((c) => c.coberto).length;
  const faltando = total - cobertos;

  return {
    dir: raizAbs,
    componentes,
    ignorados,
    excluidos,
    emFalta: componentes
      .filter((c) => !c.coberto)
      .map((c) => `${c.ficheiro} :: ${c.nome}`),
    resumo: {
      total,
      cobertos,
      faltando,
      percentagemCobertos: total === 0 ? 100 : arredonda2((cobertos / total) * 100),
      percentagemFaltando: total === 0 ? 0 : arredonda2((faltando / total) * 100),
      ignorados: ignorados.length,
      excluidos: excluidos.length,
      ficheirosVarridos: rels.length,
    },
  };
}

/** Porque é que um ficheiro visto pela varredura não contribui componente nenhum. */
function motivoIgnorado(
  rel: string,
  exports: ExportBruto[],
  ehTsx: boolean,
  temJsx: boolean,
): string {
  const nomes = exports.map((e) => e.nome);
  const base = path.posix.basename(rel).replace(/\.(tsx|ts)$/, '');
  const soHooks = nomes.length > 0 && nomes.every((n) => /^use[A-Z]/.test(n));
  if (/^use[A-Z]/.test(base) || soHooks) {
    return 'hook — devolve estado/operações, não JSX';
  }
  if (!ehTsx) {
    return 'módulo .ts — lógica/estado/tipos/arranque de módulo, não componente';
  }
  if (!temJsx) {
    return 'ficheiro .tsx sem JSX — não é componente visual';
  }
  if (exports.length === 0) {
    return 'ficheiro .tsx com JSX mas sem exports (só uso interno)';
  }
  return 'exports sem JSX devolvido (constantes, estilos, tipos, contexto)';
}

/* ───────────────────────────── Formatação ─────────────────────────────── */

function formatarTabela(rel: Relatorio): string {
  const linhas: string[] = [];
  linhas.push('storybook-coverage — gate de cobertura de histórias');
  linhas.push(`árvore: ${rel.dir}`);
  linhas.push(
    'histórias colocadas: <área>/<Nome>.stories.tsx · documentação: src/storybook/foundations/',
  );
  linhas.push('');

  const porArea = new Map<string, ComponenteVisual[]>();
  for (const c of rel.componentes) {
    const lista = porArea.get(c.area) ?? [];
    lista.push(c);
    porArea.set(c.area, lista);
  }
  if (porArea.size === 0) {
    linhas.push('(nenhum componente visual encontrado na árvore)');
  }
  for (const area of [...porArea.keys()].sort()) {
    linhas.push(`── área: ${area} ${'─'.repeat(Math.max(2, 48 - area.length))}`);
    for (const c of porArea.get(area) ?? []) {
      const marca = c.coberto ? '✓' : '✗';
      const onde = c.coberto ? `→ ${c.historia}` : '→ (sem história)';
      const origem = c.origem ? `  [re-export de ${c.origem}]` : '';
      linhas.push(`  ${marca} ${c.nome.padEnd(30)} ${c.ficheiro.padEnd(52)} ${onde}${origem}`);
    }
    linhas.push('');
  }

  if (rel.ignorados.length > 0) {
    linhas.push(`── Ignorados (não-visuais) ${'─'.repeat(30)}`);
    for (const i of rel.ignorados) {
      linhas.push(`  · ${i.ficheiro}`);
      linhas.push(`      ${i.motivo} [${i.via}]`);
    }
    linhas.push('');
  }
  if (rel.excluidos.length > 0) {
    linhas.push(`── Fora do gate (histórias/testes/entry) ${'─'.repeat(18)}`);
    for (const e of rel.excluidos) {
      linhas.push(`  · ${e.ficheiro} — ${e.motivo}`);
    }
    linhas.push('');
  }

  const r = rel.resumo;
  linhas.push(`── Resumo ${'─'.repeat(46)}`);
  linhas.push(`  componentes visuais ....... ${r.total}`);
  linhas.push(`  cobertos .................. ${r.cobertos} (${r.percentagemCobertos}%)`);
  linhas.push(`  em falta .................. ${r.faltando} (${r.percentagemFaltando}%)`);
  linhas.push(`  ignorados (não-visuais) ... ${r.ignorados}`);
  linhas.push(`  fora do gate .............. ${r.excluidos}`);
  linhas.push(`  ficheiros varridos ........ ${r.ficheirosVarridos}`);
  linhas.push('');

  if (rel.emFalta.length > 0) {
    linhas.push(`EM FALTA (${rel.emFalta.length}):`);
    for (const f of rel.emFalta) linhas.push(`  ${f}`);
    linhas.push('');
    linhas.push('cada linha acima precisa de uma história colocada em <ficheiro>.stories.tsx');
    linhas.push('(contrato: docs/storybook/STORY-SPEC.md). exit code 1 até isto zerar.');
  } else if (r.total === 0) {
    linhas.push('⚠ nenhum componente visual medido — confirmar que --dir aponta para a árvore certa.');
  } else {
    linhas.push('100% dos componentes visuais têm história. exit code 0.');
  }
  return `${linhas.join('\n')}\n`;
}

/* ──────────────────────────────── CLI ─────────────────────────────────── */

const USO = `uso: npx tsx tools/storybook-coverage.ts [opções]

Opções:
  --dir <caminho>   árvore a varrer (default: src/, relativo a app/)
  --json            saída estruturada para a CI (um objeto JSON no stdout)
  --allow-missing   reporta as faltas sem falhar (exit 0) — para catálogo em
                    preenchimento
  -h, --help        mostra esta ajuda

Exit codes: 0 = 100% coberto · 1 = falta alguma história · 2 = erro de uso.`;

/** Analisa a linha de comando. Devolve opções OU a mensagem de erro de uso. */
export function processarArgs(argv: readonly string[]): { opcoes?: Opcoes; erro?: string } {
  const opcoes: Opcoes = { dir: null, json: false, allowMissing: false, ajuda: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') {
      const valor = argv[i + 1];
      if (!valor || valor.startsWith('--')) {
        return { erro: '--dir exige um caminho (ex.: --dir src)' };
      }
      opcoes.dir = valor;
      i += 1;
    } else if (arg === '--json') {
      opcoes.json = true;
    } else if (arg === '--allow-missing') {
      opcoes.allowMissing = true;
    } else if (arg === '-h' || arg === '--help') {
      opcoes.ajuda = true;
    } else {
      return { erro: `opção desconhecida: ${arg}` };
    }
  }
  return { opcoes };
}

/**
 * Corre o gate de ponta a ponta e devolve o exit code (0/1/2). A saída vai para
 * `io` (por omissão stdout/stderr) — os testes injetam buffers.
 */
export async function correr(argv: readonly string[], io?: Saida): Promise<number> {
  const saida: Saida = io ?? {
    stdout: (t: string) => process.stdout.write(t),
    stderr: (t: string) => process.stderr.write(t),
  };

  const { opcoes, erro } = processarArgs(argv);
  if (erro) {
    saida.stderr(`Erro: ${erro} — Solução: ver --help\n`);
    saida.stderr(`${USO}\n`);
    return 2;
  }
  if (!opcoes) return 2;
  if (opcoes.ajuda) {
    saida.stdout(`${USO}\n`);
    return 0;
  }

  // Sem `--dir`, a árvore é `src/` da raiz da app (o script roda de qualquer
  // lugar); com `--dir`, o caminho resolve-se contra o cwd (CLI normal).
  const raizDefault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const dirAbs = opcoes.dir === null ? raizDefault : path.resolve(opcoes.dir);

  if (!existsSync(dirAbs)) {
    saida.stderr(`Erro: a árvore não existe: ${dirAbs} — Solução: passar --dir com um caminho válido\n`);
    return 2;
  }
  const stat = await fs.stat(dirAbs);
  if (!stat.isDirectory()) {
    saida.stderr(`Erro: --dir não é um diretório: ${dirAbs} — Solução: passar um diretório\n`);
    return 2;
  }

  const relatorio = await analisar(dirAbs);
  const faltando = relatorio.resumo.faltando;
  const exitCode = faltando > 0 && !opcoes.allowMissing ? 1 : 0;

  if (opcoes.json) {
    saida.stdout(
      `${JSON.stringify({ ...relatorio, ok: faltando === 0, exitCode }, null, 2)}\n`,
    );
  } else {
    saida.stdout(formatarTabela(relatorio));
    if (faltando > 0 && opcoes.allowMissing) {
      saida.stdout(`(--allow-missing: ${faltando} em falta, mas o gate não falha)\n`);
    }
  }
  return exitCode;
}

/* ─────────────────── Execução direta vs import (testes) ───────────────── */

const ESTE_FICHEIRO = fileURLToPath(import.meta.url);

function ehExecucaoDireta(): boolean {
  const alvo = process.argv[1];
  if (!alvo) return false;
  try {
    return realpathSync(alvo) === realpathSync(ESTE_FICHEIRO);
  } catch {
    return path.resolve(alvo) === path.resolve(ESTE_FICHEIRO);
  }
}

if (ehExecucaoDireta()) {
  correr(process.argv.slice(2))
    .then((codigo) => {
      process.exit(codigo);
    })
    .catch((err: unknown) => {
      const detalhe = err instanceof Error ? err.message : String(err);
      process.stderr.write(`erro inesperado: ${detalhe}\n`);
      process.exit(2);
    });
}