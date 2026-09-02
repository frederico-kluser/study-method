/**
 * app/electron/main/engine/quality/progressao.ts — a BATERIA A13–A16
 * (ensino-efetivo, micro-avanço, progressividade, primeira-atividade).
 *
 * O orçamento A1–A6 garante "só cobra o que já foi ensinado" por diferença de
 * conjuntos sobre o orçamento CUMULATIVO — e tem os quatro furos que este
 * módulo fecha (spec: `app/content-src/analise-verificadores.md` §3–§6):
 *
 *   A13  ENSINO-EFETIVO — o que a atividade usa/expõe precisa ter sido
 *        DEMONSTRADO num bloco de código (teoria desta aula ou de anteriores —
 *        spec §3.2, para starter/solution E para o teste),
 *        não só liberado pelo orçamento. A semente receptiva do harness
 *        (`HARNESS_RECEPTIVE_SEED`) perdoa em silêncio o pecado nº 1 do
 *        usuário: chamada de função na atividade 1 sem NENHUMA demonstração.
 *        A13d (modo declared): declarar `introduces` não é demonstrar.
 *   A14  MICRO-AVANÇO — A14a: teto de construções VERDADEIRAMENTE novas por
 *        aula (default 4); 0 novas = aviso (aula sem incremento); no modo
 *        declared, `introduces.productive` > 2 = erro (A7/I2 no conteúdo real).
 *        A14b: no máximo 1 construção nova por linha do solutionCode (a lacuna
 *        única do completion problem é uma construção só — "exercitável" §3.6).
 *   A15  PROGRESSIVIDADE — A15a (intra-aula, com 2+ desafios): o degrau reusa
 *        algo do degrau anterior e adiciona no máximo 1 átomo não demonstrado.
 *        A15b (inter-aula): o desafio da aula N reutiliza ≥1 átomo demonstrado
 *        em aulas anteriores (recuperação espaçada, I7 em versão de conteúdo).
 *   A16  PRIMEIRA-ATIVIDADE — o 1º desafio da aula é resolvível com a PRIMEIRA
 *        seção da teoria que tem código + material anterior (§7.1 item 2).
 *
 * Definições (todas derivadas por código, zero LLM — §3.1 da spec):
 *
 *   A(K)          = átomos emitidos por extractAtoms(K)
 *   Demo(i)       = ∪ A(bloco js da teoria de i)
 *   DemoSec1(i)   = ∪ A(blocos js da PRIMEIRA seção de i que tem código)
 *   Cum(i)        = ∪_{j<i} Demo(j)
 *   InitDecl(i)   = introduces declarado de i (modo declared)
 *   AX            = STRUCTURAL_ALWAYS_ALLOWED
 *   H13           = BOILERPLATE ESTREITO (lista versionada abaixo — a semente
 *                   inteira NÃO entra: ela perdoa CallExpression/ArrowFunction
 *                   que H13 propositalmente NÃO perdoa)
 *   S13(code)     = spans MECÂNICOS da superfície (import inteiro; assinatura
 *                   de `test('t', () =>`; `assert.<m>(` até o 1º argumento;
 *                   `() =>` de assert.throws/rejects/doesNotThrow)
 *   Escrito(i)    = A(solutionCode_i) \ A(starterCode_i)
 *   Lido(i)       = A(starterCode_i)
 *   LidoAntes(i)  = A(testsCode_i)
 *
 * As sete regras (a especificação formal e as mensagens pt-BR estão na spec
 * §3–§6; as mensagens aqui são as da spec, texto por texto):
 *
 *   A13a  Escrito(i) ⊆ Demo(i) ∪ Cum(i) ∪ AX ∪ H13            (erro/aviso-D4)
 *   A13b  Lido(i)    ⊆ Demo(i) ∪ Cum(i) ∪ AX ∪ H13            (erro/aviso-D4)
 *   A13c  (LidoAntes(i) \ S13) \ H13 ⊆ Demo(i) ∪ Cum(i) ∪ AX  (erro/aviso-D4;
 *         spec §3.2: a teoria DA MESMA aula também demonstra para o teste — ver
 *         o bloco A13c abaixo; o pecado nº 1 sem demonstração em lugar nenhum
 *         continua sendo erro)
 *   A13d  InitDecl(i) ⊆ Demo(i) ∪ Cum(i)   [só declared]      (erro)
 *   A14a  |Novo(i)| > 4 → erro; == 0 → aviso; [declared] |introduces.productive| > 2 → erro
 *   A14b  >1 ocorrência de chave ∈ Novo(i) na mesma linha da solução → erro
 *   A15a  degrau sem reuso OU com >1 novo não demonstrado → erro
 *   A15b  A(solution_i) ∩ (Cum(i) \ AX) = ∅ (i ≥ 1) → erro
 *   A16b  Escrito(1º desafio) ⊆ DemoSec1(i) ∪ Cum(i) ∪ AX ∪ H13 → erro
 *
 * AVISO13 (D4 — severidade aviso até calibrar): valores/termos que a prosa da
 * teoria pode ensinar sem bloco js (`undefined`, `null`, literais de template,
 * regex, globais String/Number/…). Sem essa lista o gate viraria ruído —
 * medido: 31+18 ocorrências de ruído no corpus real.
 *
 * PURO: este módulo não abre arquivo, não vai à rede e não chama LLM — nunca.
 * Recebe a trilha já carregada (achatada em `ProgressaoLessonInput`) e devolve
 * violações no formato do `audit.ts` (que só adapta o campo `campo`/`faixa`).
 *
 * Referência: `app/content-src/analise-verificadores.md` §3–§6 e
 * `docs/16-engine-de-trilha.md` §5.
 */

import * as ts from 'typescript';
import type { TrackTheorySection } from '../../content/trackTypes';
import { AtomKey, axisOf, humanLabel, structuralAlwaysAllowed } from '../atomKeys';
import { exigirAdaptadorJavascript, extractAllOccurrences, type AtomOccurrence } from '../extract';
import {
  DEFAULT_ADAPTER_ID,
  classifyTheoryTag,
  type LanguageId,
} from '../lang/registry';
import { extractFencedBlocks } from '../theoryCode';
import type { BudgetSource } from '../budget';

// ---------------------------------------------------------------------------
// Vocabulário da bateria
// ---------------------------------------------------------------------------

/**
 * H13 — BOILERPLATE ESTREITO (spec §3.1, versão 1, versionada). É a mecânica
 * do runner + valores; a semente receptiva INTEIRA não entra aqui: a semente
 * existe para o ORÇAMENTO (o aluno lê o harness em todo desafio), mas a
 * bateria A13 está medindo DEMONSTRAÇÃO — e `CallExpression`, `ArrowFunction`
 * e forms só deixam de violar quando um bloco de código as mostra (ou quando o
 * span mecânico S13 as isenta no arquivo de teste).
 */
export const H13: readonly AtomKey[] = [
  ...structuralAlwaysAllowed(),
  'node:ExportKeyword',
  'node:ImportDeclaration',
  'node:ImportSpecifier',
  'node:ImportClause',
  'node:NamedImports',
  'api:node:test',
  'api:node:assert',
  'api:node:assert/strict',
  'api:test',
  'api:assert.equal',
  'api:assert.strictEqual',
  'api:assert.deepEqual',
  'api:assert.deepStrictEqual',
  'api:assert.throws',
  'api:assert.rejects',
  'api:assert.doesNotThrow',
  'api:assert.ok',
  'global:assert',
  'global:test',
  'node:PropertyAccessExpression',
  'node:StringLiteral',
  'node:NumericLiteral',
  'node:BooleanLiteral',
] as const;

const H13_SET: ReadonlySet<AtomKey> = new Set<AtomKey>(H13);

/**
 * AVISO13 (D4 — spec §3.1): valores/termos possivelmente explicados em PROSA
 * pela teoria, sem bloco js. Severidade aviso até calibrar.
 */
export const AVISO13: ReadonlySet<AtomKey> = new Set<AtomKey>([
  'global:undefined',
  'global:NaN',
  'global:Infinity',
  'node:NullKeyword',
  'node:TrueKeyword',
  'node:FalseKeyword',
  'node:RegularExpressionLiteral',
  'node:NoSubstitutionTemplateLiteral',
  'node:TemplateExpression',
  'node:TemplateHead',
  'node:TemplateMiddle',
  'node:TemplateTail',
  'global:String',
  'global:Number',
  'global:Boolean',
  'global:BigInt',
  'global:Symbol',
]);

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/** As sete regras da bateria A13–A16. */
export type ProgressaoRule = 'A13' | 'A13d' | 'A14a' | 'A14b' | 'A15a' | 'A15b' | 'A16';

export type Severidade = 'erro' | 'aviso';

/** A superfície onde a violação foi encontrada (espelha o `Surface` do audit). */
export type CampoProgressao = 'starterCode' | 'solutionCode' | 'testsCode' | 'lesson';

/** Um arquivo de desafio achatado (multi-arquivo vira N entradas). */
export interface ProgressaoArquivoInput {
  path: string;
  starter: string;
  solution: string;
}

export interface ProgressaoDesafioInput {
  slug: string;
  /** caminho do challenge.json — é a chave do `desafiosComViolacao` no audit. */
  desafioFile: string;
  files: ProgressaoArquivoInput[];
  tests: string;
}

export interface ProgressaoLessonInput {
  ref: string;
  /** `modules/<m>/lessons/<l>` — prefixo dos caminhos de arquivo (como no audit). */
  baseDir: string;
  theory: readonly TrackTheorySection[];
  challenges: ProgressaoDesafioInput[];
  /** `introduces` declarado da aula (modo declared). */
  declared?: { productive?: AtomKey[]; receptive?: AtomKey[] } | null;
}

export interface ProgressaoOptions {
  /**
   * A14a: teto de construções verdadeiramente novas por aula (spec §4.1,
   * default 4 — o parâmetro do §3.6 "interagindo").
   */
  tetoNovos?: number;
  /**
   * A14a (declared): teto de `introduces.productive` (A7/I2, default 2).
   */
  tetoIntroducesProductive?: number;
  /** A15b: quantos átomos anteriores a solução precisa reutilizar (default 1). */
  minimoReuso?: number;
  /** A15b estrito: `Cum(i)` vira `Demo(i−1)` (aula ANTERIOR IMEDIATA). */
  predecessorImediato?: boolean;
  /** Modo do orçamento — espelha o do audit (affeta A13d/A14a-declared). */
  mode?: BudgetSource;
  /**
   * ADITIVO (onda 5): o ADAPTADOR DA TRILHA (`TrackBudget.adapterId`). É ele
   * que decide qual bloco de teoria conta como DEMONSTRAÇÃO e com que parser
   * cada superfície é lida. Default: o adaptador default.
   */
  adapterId?: LanguageId;
}

export interface ProgressaoViolation {
  regra: ProgressaoRule;
  arquivo: string;
  ref: string;
  campo: CampoProgressao;
  linha: number;
  coluna: number;
  construcao: AtomKey | null;
  eixo: string | null;
  faixa: 'receptive' | 'productive' | null;
  trechoOfensor: string;
  primeiraAulaQueEnsina: string | null;
  mensagem: string;
  severidade: Severidade;
  /** presente quando a violação pertence a UM desafio (A13/A14b/A15a/A16). */
  desafioFile?: string;
}

export interface ProgressaoResult {
  violations: ProgressaoViolation[];
  /** `Novo(i)` de cada aula — exposto para o audit anexar ao placar. */
  novosPorAula: Map<string, number>;
}

// ---------------------------------------------------------------------------
// S13 — spans mecânicos do arquivo de teste
// ---------------------------------------------------------------------------

/**
 * Span mecânico (spec §3.1): um intervalo `[início, fim)` de offsets ABSOLUTOS
 * que isenta as ocorrências que caem dentro dele.
 */
export interface SpanMecanico {
  inicio: number;
  fim: number;
}

function estaDentro(span: SpanMecanico, start: number): boolean {
  return start >= span.inicio && start < span.fim;
}

/**
 * Os spans mecânicos de um arquivo de teste (S13, spec §3.1):
 *  1. nó `ImportDeclaration` inteiro;
 *  2. chamada `test('título', …)`: do callee até o começo do CORPO do callback
 *     (a assinatura `test('x', () =>` é mecânica; o corpo é autoral);
 *  3. chamadas `assert.<método>(…)`: do callee até o INÍCIO do 1º argumento
 *     (o 1º argumento é conteúdo autoral — `cumprimentar('Maria')` conta);
 *  4. em `assert.throws/rejects/doesNotThrow(…)`: adicionalmente a assinatura
 *     `() =>` do callback (o corpo é autoral).
 */
export function spansMecanicosDeTeste(codigo: string): SpanMecanico[] {
  const source = ts.createSourceFile('tests.mjs', codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const spans: SpanMecanico[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      spans.push({ inicio: node.getStart(source), fim: node.getEnd() });
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const args = node.arguments;
      if (ts.isIdentifier(callee) && callee.text === 'test' && args.length >= 2) {
        const callback = args[1];
        if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
          spans.push({ inicio: node.getStart(source), fim: callback.body.getStart(source) });
        }
      }
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'assert') {
        const metodo = callee.name.text;
        const primeiro = args[0];
        if (primeiro) {
          const ehCallback =
            metodo === 'throws' || metodo === 'rejects' || metodo === 'doesNotThrow';
          if (ehCallback && (ts.isArrowFunction(primeiro) || ts.isFunctionExpression(primeiro))) {
            // regra 4: `assert.throws(() =>` inteiro — o 1º argumento é o callback.
            spans.push({ inicio: node.getStart(source), fim: primeiro.body.getStart(source) });
          } else {
            // regra 3: `assert.<m>(` — o 1º argumento é autoral.
            spans.push({ inicio: node.getStart(source), fim: primeiro.getStart(source) });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
  return spans;
}

// ---------------------------------------------------------------------------
// Demo por aula — precisa ser por SEÇÃO (DemoSec1 exige a 1ª seção com código)
// ---------------------------------------------------------------------------

/**
 * Blocos de UMA seção de teoria QUE SÃO DA LINGUAGEM DA TRILHA (fences com tag
 * do adaptador + o campo `code`).
 *
 * Era `blocosJsDaSecao`, com `b.isJavaScript` e `JS_FENCE_TAGS.has(lang)`
 * cravados. Quem decide agora é o REGISTRO: `block.adapterId` (posto por
 * `theoryCode.ts` via `adapterIdForTheoryTag`) e `classifyTheoryTag` — a mesma
 * função que o §6 (linha 954) descreve como "quem diz ao extrator qual parser
 * aplicar a cada bloco cercado da teoria".
 *
 * A ASSIMETRIA DO BLOCO SEM TAG é preservada byte a byte, e não é descuido:
 * campo `code` da seção SEM `language` → adaptador DEFAULT (o schema garante
 * que é código); cerca ``` sem tag → parser NENHUM (pode ser saída de terminal
 * e envenenaria o orçamento). É a mesma regra de `collectLessonCode`
 * (`engine/theoryCode.ts:216-238`), agora escrita uma vez em cada lado com a
 * MESMA fonte.
 */
function blocosDaSecao(secao: TrackTheorySection, adapterId: LanguageId): string[] {
  const out: string[] = [];
  if (typeof secao.markdown === 'string' && secao.markdown.length > 0) {
    const fenced = extractFencedBlocks(secao.markdown);
    for (const b of fenced.blocks) if (b.adapterId === adapterId) out.push(b.code);
  }
  const code = secao.code;
  if (code && typeof code.code === 'string' && code.code.trim().length > 0) {
    const lang = (code.language ?? '').toLowerCase();
    const alvo = lang === '' ? DEFAULT_ADAPTER_ID : classifyTheoryTag(lang).adapterId;
    if (alvo === adapterId) out.push(code.code);
  }
  return out;
}

interface DemoDaAula {
  /** Demo(i) — TODOS os átomos demonstrados na teoria desta aula. */
  chaves: Set<AtomKey>;
  /** DemoSec1(i) — átomos da PRIMEIRA seção com código. */
  primeiraSecao: Set<AtomKey>;
  /** chave → (índice, título) da primeira seção da PRÓPRIA aula que a demonstra. */
  secaoDe: Map<AtomKey, { index: number; titulo: string }>;
}

function demoDaAula(secoes: readonly TrackTheorySection[], adapterId: LanguageId): DemoDaAula {
  const chaves = new Set<AtomKey>();
  const primeiraSecao: Set<AtomKey> = new Set();
  const secaoDe = new Map<AtomKey, { index: number; titulo: string }>();

  secoes.forEach((secao, index) => {
    const chavesDaSecao = new Set<AtomKey>();
    for (const codigo of blocosDaSecao(secao, adapterId)) {
      const r = extractAllOccurrences(codigo, { language: adapterId });
      if (!r.ok) continue; // bloco que não parseia não demonstra nada (mesma régua do budget)
      for (const occ of r.occurrences) chavesDaSecao.add(occ.key);
    }
    for (const k of chavesDaSecao) {
      chaves.add(k);
      if (!secaoDe.has(k)) secaoDe.set(k, { index, titulo: secao.title ?? secao.id ?? String(index) });
    }
    // DemoSec1(i) = átomos da PRIMEIRA seção (índice 0) — mesmo que ela não
    // tenha código (fica vazia). A spec §6.1 diz "a primeira seção da teoria
    // de i que tem código", mas o test case §6.5 nº 1 desambigua: "seção 1 sem
    // código, seção 2 com `if`; 1º desafio solução `if` → VIOLA" — se a seção 2
    // contasse como "primeira com código", o `if` estaria permitido e o teste
    // não violaria. Então a seção inicial é a de índice 0, e uma seção de abertura
    // sem código demonstra NADA — que é exatamente o caso do `o-que-e-programacao`
    // real ("1ª seção sem código nenhum; o desafio precisa de if/typeof/...").
    if (index === 0) {
      for (const k of chavesDaSecao) primeiraSecao.add(k);
    }
  });

  return { chaves, primeiraSecao, secaoDe };
}

/**
 * As CONSTRUÇÕES de uma linha (A14b): as chaves novas da linha COLAPSADAS na
 * granularidade didática — `node:BinaryExpression` colapsa no `op:*` (a
 * construção é o sinal), e a maquinaria da declaração
 * (VariableStatement/VariableDeclarationList/VariableDeclaration) colapsa no
 * `decl:*` (a construção é `let`/`const`/`var`). É a régua que faz o binário
 * de sanidade da spec §4.2 passar (`let x = 1;` = UMA construção) e que
 * reproduz o exemplo medido L5 (`return 'Olá, ' + nome + '!';` =
 * ReturnStatement + op:binary:+ = 2, apesar de DOIS `+` e um nó
 * BinaryExpression — "a contagem é por construção-na-linha, não por chave").
 */
function construcoesDaLinha(chaves: Iterable<AtomKey>): Set<AtomKey> {
  const construcoes = new Set<AtomKey>();
  for (const k of chaves) {
    if (k === 'node:BinaryExpression') continue; // colapsa no op: binário
    if (k === 'node:VariableStatement' || k === 'node:VariableDeclarationList' || k === 'node:VariableDeclaration') {
      continue; // colapsa no decl: (let/const/var)
    }
    construcoes.add(k);
  }
  return construcoes;
}

function tamanhoDaInterseccao(a: ReadonlySet<AtomKey>, b: ReadonlySet<AtomKey>): number {
  let n = 0;
  for (const k of a) if (b.has(k)) n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// A regra principal
// ---------------------------------------------------------------------------

/**
 * Audita uma sequência de aulas (ordem pedagógica) contra a bateria A13–A16.
 *
 * PURO: mesma entrada, mesma saída. Não abre arquivo, não vai à rede, não
 * chama LLM. Devolve as violações no formato do `audit.ts` (que as mescla) e o
 * `Novo(i)` por aula (para o placar e para o A14b).
 */
export function auditarProgressao(aulas: ProgressaoLessonInput[], options: ProgressaoOptions = {}): ProgressaoResult {
  const tetoNovos = options.tetoNovos ?? 4;
  const tetoIntroduces = options.tetoIntroducesProductive ?? 2;
  const minimoReuso = options.minimoReuso ?? 1;
  const predecessorImediato = options.predecessorImediato ?? false;
  const mode: BudgetSource = options.mode ?? (aulas.some((a) => a.declared) ? 'declared' : 'inferred');
  // GUARDA EXPLÍCITA (onda 5): esta bateria é JAVASCRIPT-ONLY por DUAS razões
  // que não se resolvem trocando o parser — `H13`/`AX` são tabelas de chaves do
  // AST do TypeScript e do runner `node:test`, e os spans mecânicos S13
  // (`spansMecanicos`) são calculados com `ts.createSourceFile`. Rodá-la numa
  // trilha de outra linguagem não daria erro: daria um veredito ERRADO E
  // SILENCIOSO (tudo "não demonstrado", todo desafio reprovado). Falha alto.
  const adapterId = exigirAdaptadorJavascript(
    'engine/quality/progressao.ts (bateria A13–A16)',
    'H13/AX são chaves do AST do TypeScript e do runner node:test, e os spans mecânicos S13 são calculados com ts.createSourceFile',
    options.adapterId ?? DEFAULT_ADAPTER_ID,
  ).id;

  const violations: ProgressaoViolation[] = [];
  const novosPorAula = new Map<string, number>();

  // ── pré-computação: Demo(i), Cum(i), primeira demonstração da trilha ─────
  const demos = aulas.map((a) => demoDaAula(a.theory, adapterId));
  const cumulativo: Set<AtomKey>[] = aulas.map(() => new Set<AtomKey>());
  {
    const acumulado = new Set<AtomKey>();
    aulas.forEach((a, i) => {
      cumulativo[i] = new Set(acumulado);
      for (const k of demos[i].chaves) acumulado.add(k);
    });
  }
  const primeiraDemonstracao = new Map<AtomKey, string>();
  aulas.forEach((a, i) => {
    for (const k of demos[i].chaves) {
      if (!primeiraDemonstracao.has(k)) primeiraDemonstracao.set(k, a.ref);
    }
  });

  aulas.forEach((aula, i) => {
    const demo = demos[i].chaves;
    const cum = cumulativo[i];
    const baseDir = aula.baseDir;

    const declarada = mode === 'declared' ? aula.declared : null;
    const chavesDeclaradas = new Set<AtomKey>([
      ...(declarada?.productive ?? []),
      ...(declarada?.receptive ?? []),
    ]);

    // Novo(i) = (Demo ∪ InitDecl) \ Cum \ (AX ∪ H13) — "verdadeiramente novos".
    const novo = new Set<AtomKey>();
    for (const k of [...demo, ...chavesDeclaradas]) {
      if (!cum.has(k) && !H13_SET.has(k)) novo.add(k);
    }
    novosPorAula.set(aula.ref, novo.size);

    // ── A14a — teto por aula ───────────────────────────────────────────────
    if (novo.size === 0) {
      violations.push({
        regra: 'A14a',
        arquivo: `${baseDir}/lesson.json`,
        ref: aula.ref,
        campo: 'lesson',
        linha: 1,
        coluna: 1,
        construcao: null,
        eixo: null,
        faixa: null,
        trechoOfensor: '',
        primeiraAulaQueEnsina: null,
        severidade: 'aviso',
        mensagem: `\`${aula.ref}\` não introduz NENHUMA construção nova — aula sem incremento; se é aula de revisão, marque \`role\` adequado, senão falta conteúdo novo (A12)`,
      });
    } else if (novo.size > tetoNovos) {
      violations.push({
        regra: 'A14a',
        arquivo: `${baseDir}/lesson.json`,
        ref: aula.ref,
        campo: 'lesson',
        linha: 1,
        coluna: 1,
        construcao: null,
        eixo: null,
        faixa: null,
        trechoOfensor: [...novo].sort().join(', '),
        primeiraAulaQueEnsina: null,
        severidade: 'erro',
        mensagem:
          `\`${aula.ref}\` introduz ${novo.size} construções verdadeiramente novas — acima do teto de ${tetoNovos} (§3.6/A12). ` +
          `O histograma aponta penhasco: divida a aula em ${Math.ceil(novo.size / tetoNovos)} (ou reordene o grafo)`,
      });
    }

    // ── A14a (declared) — introduces.productive > 2 (a A7/I2 no conteúdo real) ──
    if (declarada && (declarada.productive ?? []).length > tetoIntroduces) {
      violations.push({
        regra: 'A14a',
        arquivo: `${baseDir}/lesson.json`,
        ref: aula.ref,
        campo: 'lesson',
        linha: 1,
        coluna: 1,
        construcao: null,
        eixo: null,
        faixa: null,
        trechoOfensor: (declarada.productive ?? []).join(', '),
        primeiraAulaQueEnsina: null,
        severidade: 'erro',
        mensagem: `\`${aula.ref}\` declara ${(declarada.productive ?? []).length} construções produtivas em introduces — máximo ${tetoIntroduces} (A7/I2)`,
      });
    }

    // ── A13d — declarar não é demonstrar (só declared) ─────────────────────
    for (const k of chavesDeclaradas) {
      if (demo.has(k) || cum.has(k)) continue;
      violations.push({
        regra: 'A13d',
        arquivo: `${baseDir}/lesson.json`,
        ref: aula.ref,
        campo: 'lesson',
        linha: 1,
        coluna: 1,
        construcao: k,
        eixo: axisOf(k),
        faixa: null,
        trechoOfensor: k,
        primeiraAulaQueEnsina: aula.ref, // introduzida POR DECLARAÇÃO — não é lacuna de currículo
        severidade: 'erro',
        mensagem:
          `${humanLabel(k)} está declarado em introduces de \`${aula.ref}\`, mas não aparece em NENHUM bloco de código da teoria — ` +
          'declarar não é demonstrar (A5/A13d). Escreva o exemplo ou remova da declaração',
      });
    }

    // ── por desafio ────────────────────────────────────────────────────────
    aula.challenges.forEach((desafio, kIndex) => {
      const desafioFile = desafio.desafioFile;

      // Escrito(i) / Lido(i) / LidoAntes(i), por arquivo
      const starterKeysPorArquivo: Set<AtomKey>[] = [];
      const solutionOcorrenciasPorArquivo: AtomOccurrence[][] = [];
      const solutionKeysPorArquivo: Set<AtomKey>[] = [];
      const linhasDoStarterPorArquivo: Set<string>[] = [];

      for (const arquivo of desafio.files) {
        const sKeys = new Set<AtomKey>();
        const rStarter = extractAllOccurrences(arquivo.starter, { language: adapterId });
        if (rStarter.ok) for (const occ of rStarter.occurrences) sKeys.add(occ.key);
        starterKeysPorArquivo.push(sKeys);

        const rSol = extractAllOccurrences(arquivo.solution, { language: adapterId });
        if (rSol.ok) {
          solutionOcorrenciasPorArquivo.push(rSol.occurrences);
          solutionKeysPorArquivo.push(new Set(rSol.keys));
        } else {
          solutionOcorrenciasPorArquivo.push([]);
          solutionKeysPorArquivo.push(new Set());
        }

        const linhas = new Set<string>();
        for (const linha of arquivo.starter.split('\n')) linhas.add(linha.trim());
        linhasDoStarterPorArquivo.push(linhas);
      }

      const demoMaisCumMaisH13 = (k: AtomKey): boolean => demo.has(k) || cum.has(k) || H13_SET.has(k);

      // ── A13a — o que o aluno ESCREVE precisa estar demonstrado ───────────
      for (let f = 0; f < desafio.files.length; f += 1) {
        const arquivo = desafio.files[f];
        for (const occ of solutionOcorrenciasPorArquivo[f]) {
          if (starterKeysPorArquivo[f].has(occ.key)) continue; // o starter já expõe: Não é "escrito"
          if (demoMaisCumMaisH13(occ.key)) continue;
          const aviso = AVISO13.has(occ.key);
          violations.push({
            regra: 'A13',
            arquivo: desafioFile,
            ref: aula.ref,
            campo: 'solutionCode',
            linha: occ.line,
            coluna: occ.column,
            construcao: occ.key,
            eixo: axisOf(occ.key),
            faixa: 'productive',
            trechoOfensor: occ.snippet,
            primeiraAulaQueEnsina: primeiraDemonstracao.get(occ.key) ?? null,
            severidade: aviso ? 'aviso' : 'erro',
            mensagem: aviso
              ? `${humanLabel(occ.key)} (um valor/termo) aparece sem demonstração em código — se a prosa já o explica, rebaixe à vontade; caso contrário demonstre num bloco js`
              : `${humanLabel(occ.key)} é exigido no desafio de \`${aula.ref}\`, mas a teoria desta aula e de TODAS as anteriores nunca mostrou ${humanLabel(occ.key)} num bloco de código — sem demonstração não há ensino (A13). Reescreva dentro do que já foi demonstrado ou mova a demonstração para cá`,
            desafioFile,
          });
        }

        // ── A13b — o que o aluno LÊ no starter precisa estar demonstrado ───
        const rStarterDeNovo = extractAllOccurrences(arquivo.starter, { language: adapterId });
        if (rStarterDeNovo.ok) {
          for (const occ of rStarterDeNovo.occurrences) {
            if (demoMaisCumMaisH13(occ.key)) continue;
            const aviso = AVISO13.has(occ.key);
            violations.push({
              regra: 'A13',
              arquivo: desafioFile,
              ref: aula.ref,
              campo: 'starterCode',
              linha: occ.line,
              coluna: occ.column,
              construcao: occ.key,
              eixo: axisOf(occ.key),
              faixa: 'receptive',
              trechoOfensor: occ.snippet,
              primeiraAulaQueEnsina: primeiraDemonstracao.get(occ.key) ?? null,
              severidade: aviso ? 'aviso' : 'erro',
              mensagem: aviso
                ? `${humanLabel(occ.key)} (um valor/termo) aparece sem demonstração em código — se a prosa já o explica, rebaixe à vontade; caso contrário demonstre num bloco js`
                : `${humanLabel(occ.key)} é exposto no desafio de \`${aula.ref}\`, mas a teoria desta aula e de TODAS as anteriores nunca mostrou ${humanLabel(occ.key)} num bloco de código — sem demonstração não há ensino (A13). Reescreva dentro do que já foi demonstrado ou mova a demonstração para cá`,
              desafioFile,
            });
          }
        } else {
          // starter que não parseia: o AUDIT A1 já reporta; aqui nada a re-portar
          // (o trecho não emitiria átomos confiáveis).
        }
      }

      // ── A13c — o teste é lido ANTES da aula (spec §3.2) ───────────────────
      // Fórmula da spec (linha "A13 ENSINO-EFETIVO" do §1): átomo usado em
      // atividade (starter/tests/solution) ⊆ demonstrado em teoria (DESTA aula
      // ∪ anteriores) ∪ intro declarado ∪ axioma ∪ S13. Ou seja: para o teste
      // vale também a teoria DA MESMA aula (Demo(i)) — a L1 real demonstra
      // `resposta()` na seção 1 e o teste do próprio desafio a chama; exigir
      // só Cum(i) acusava falsamente a L1 exatamente nesse ponto (documentado
      // como "pecado nº 1 esperado" no verif/check03 Feed B — era o defeito).
      // O pecado nº 1 REAL (chamada sem NENHUMA demonstração em lugar nenhum)
      // continua sendo erro: com Demo(i) ∪ Cum(i) vazios a ocorrência viola
      // (engineProgressao.test.ts caso 1). O termo "∪ intro declarado" da
      // fórmula de prosa não vira conjunto próprio aqui: em declared o A13d
      // obriga InitDecl(i) ⊆ Demo(i) ∪ Cum(i) (declarar não é demonstrar) e em
      // inferred Init(i) = Demo(i) \ Cum(i) já está dentro de Demo(i).
      {
        const rTests = extractAllOccurrences(desafio.tests, { language: adapterId });
        if (rTests.ok) {
          const spans = spansMecanicosDeTeste(desafio.tests);
          for (const occ of rTests.occurrences) {
            if (H13_SET.has(occ.key)) continue;
            const mecanico = spans.some((s) => estaDentro(s, occ.start));
            if (mecanico) continue;
            if (demo.has(occ.key) || cum.has(occ.key)) continue; // spec §3.2: teoria DESTA aula ∪ anteriores; AX ⊆ H13 já saiu acima
            const aviso = AVISO13.has(occ.key);
            violations.push({
              regra: 'A13',
              arquivo: desafioFile,
              ref: aula.ref,
              campo: 'testsCode',
              linha: occ.line,
              coluna: occ.column,
              construcao: occ.key,
              eixo: axisOf(occ.key),
              faixa: 'receptive',
              trechoOfensor: occ.snippet,
              primeiraAulaQueEnsina: primeiraDemonstracao.get(occ.key) ?? null,
              severidade: aviso ? 'aviso' : 'erro',
              mensagem: aviso
                ? `${humanLabel(occ.key)} (um valor/termo) aparece sem demonstração em código — se a prosa já o explica, rebaixe à vontade; caso contrário demonstre num bloco js`
                : `${humanLabel(occ.key)} aparece no teste de \`${aula.ref}\`, que o aluno lê ANTES da aula, e nem a teoria desta aula nem a de nenhuma aula anterior o demonstrou num exemplo de código — o aluno leu uma construção que nunca viu. Demonstre ${humanLabel(occ.key)} na teoria desta aula ou de uma aula anterior (ou remova a ocorrência do teste)`,
              desafioFile,
            });
          }
        }
      }

      // ── A14b — combo de construções novas na MESMA linha da solução ──────
      for (let f = 0; f < desafio.files.length; f += 1) {
        const arquivo = desafio.files[f];
        const linhasDoArquivo = arquivo.solution.split('\n');
        const porLinha = new Map<number, Set<AtomKey>>();
        for (const occ of solutionOcorrenciasPorArquivo[f]) {
          if (!novo.has(occ.key)) continue; // A14a excluiu H13/AX — aqui idem
          const linha = linhasDoArquivo[occ.line - 1];
          if (linha === undefined) continue;
          // linha idêntica a uma linha do starter: não é lacuna que o aluno preenche
          if (linha.trim() !== '' && linhasDoStarterPorArquivo[f].has(linha.trim())) continue;
          const construcoes = porLinha.get(occ.line) ?? new Set<AtomKey>();
          construcoes.add(occ.key);
          porLinha.set(occ.line, construcoes);
        }
        for (const [linha, chavesCrudas] of porLinha) {
          const construcoes = construcoesDaLinha(chavesCrudas);
          if (construcoes.size <= 1) continue;
          const conteudo = linhasDoArquivo[linha - 1]?.trim() ?? '';
          const lista = [...construcoes].sort();
          violations.push({
            regra: 'A14b',
            arquivo: desafioFile,
            ref: aula.ref,
            campo: 'solutionCode',
            linha,
            coluna: 1,
            construcao: null,
            eixo: null,
            faixa: 'productive',
            trechoOfensor: conteudo.slice(0, 72),
            primeiraAulaQueEnsina: null,
            severidade: 'erro',
            mensagem:
              `a linha ${linha} do solutionCode de \`${aula.ref}\` combina ${construcoes.size} construções novas (${lista.join(', ')}) — ` +
              'a lacuna única do completion problem contém no máximo 1 (exercitável, §3.6). Quebre em linhas/passos separados',
            desafioFile,
          });
        }
      }
    });

    // ── A15a — degrau INTRA-aula (com ≥ 2 desafios) ────────────────────────
    if (aula.challenges.length >= 2) {
      const solucoes = aula.challenges.map((desafio) => {
        const keys = new Set<AtomKey>();
        for (const arquivo of desafio.files) {
          const r = extractAllOccurrences(arquivo.solution, { language: adapterId });
          if (r.ok) for (const occ of r.occurrences) keys.add(occ.key);
        }
        return keys;
      });
      // A15a (off-by-one corrigido — ver verif/probe-a15a-off-by-one.mts):
      // `anteriorAcumulado` começa com a solução do 1º desafio, ANTES do loop.
      // Antes, ele só recebia `solucoes[k-1]` no FIM da iteração: em k=1 o
      // conjunto estava VAZIO e o 2º desafio violava "sem reuso" SEMPRE, mesmo
      // com solução IDÊNTICA à do 1º (spec §5.5 — o degrau reusa o anterior).
      const anteriorAcumulado = new Set<AtomKey>(solucoes[0]);
      for (let k = 1; k < aula.challenges.length; k += 1) {
        const solK = solucoes[k];
        // reuso: o degrau usa algo do degrau anterior. Boilerplate ESTRUTURAL/H13
        // (Identifier, Block, StringLiteral…) não conta como reuso — senão TODO
        // degrau "reusaria" Identifier e a regra vira letra morta (spec §5.5).
        const solKNaoBoiler = new Set<AtomKey>();
        for (const chave of solK) if (!H13_SET.has(chave)) solKNaoBoiler.add(chave);
        let reusa = false;
        for (const chave of solKNaoBoiler) if (anteriorAcumulado.has(chave)) { reusa = true; break; }
        if (!reusa) {
          violations.push({
            regra: 'A15a',
            arquivo: aula.challenges[k].desafioFile,
            ref: aula.ref,
            campo: 'solutionCode',
            linha: 1,
            coluna: 1,
            construcao: null,
            eixo: null,
            faixa: 'productive',
            trechoOfensor: aula.challenges[k].slug,
            primeiraAulaQueEnsina: null,
            severidade: 'erro',
            mensagem:
              `o desafio "${aula.challenges[k].slug}" da aula \`${aula.ref}\` não usa NENHUM átomo do desafio anterior da própria aula — ` +
              'sem degrau, sem reuso; o aluno não exercita o que acabou de fazer (A15a)',
            desafioFile: aula.challenges[k].desafioFile,
          });
        }
        // teto do degrau: no máximo 1 átomo NÃO demonstrado adicionado
        const novosNaoDemonstrados = new Set<AtomKey>();
        for (const chave of solK) {
          if (anteriorAcumulado.has(chave)) continue;
          if (demo.has(chave) || cum.has(chave) || H13_SET.has(chave)) continue;
          novosNaoDemonstrados.add(chave);
        }
        if (novosNaoDemonstrados.size > 1) {
          violations.push({
            regra: 'A15a',
            arquivo: aula.challenges[k].desafioFile,
            ref: aula.ref,
            campo: 'solutionCode',
            linha: 1,
            coluna: 1,
            construcao: null,
            eixo: null,
            faixa: 'productive',
            trechoOfensor: [...novosNaoDemonstrados].join(', '),
            primeiraAulaQueEnsina: null,
            severidade: 'erro',
            mensagem:
              `o degrau para o desafio "${aula.challenges[k].slug}" da aula \`${aula.ref}\` adiciona ${novosNaoDemonstrados.size} construções NÃO demonstradas em teoria (${[...novosNaoDemonstrados].join(', ')}) — ` +
              'no máximo 1 por degrau; "aula inteira nova" no meio do caminho quebra a progressividade (A15a)',
            desafioFile: aula.challenges[k].desafioFile,
          });
        }
        for (const chave of solucoes[k - 1]) anteriorAcumulado.add(chave);
      }
    }

    // ── A15b — arco INTEr-aula (i ≥ 1; a aula 1 é o axioma) ────────────────
    if (i >= 1) {
      const solucoes = new Set<AtomKey>();
      for (const desafio of aula.challenges) {
        for (const arquivo of desafio.files) {
          const r = extractAllOccurrences(arquivo.solution, { language: adapterId });
          if (r.ok) for (const occ of r.occurrences) solucoes.add(occ.key);
        }
      }
      const reusaveis = predecessorImediato ? demos[i - 1].chaves : cum;
      const naoEstruturais = new Set<AtomKey>();
      for (const k of reusaveis) if (!H13_SET.has(k)) naoEstruturais.add(k);
      if (naoEstruturais.size > 0 && tamanhoDaInterseccao(solucoes, naoEstruturais) < minimoReuso) {
        violations.push({
          regra: 'A15b',
          arquivo: `${baseDir}/lesson.json`,
          ref: aula.ref,
          campo: 'lesson',
          linha: 1,
          coluna: 1,
          construcao: null,
          eixo: null,
          faixa: 'productive',
          trechoOfensor: [...solucoes].sort().join(', '),
          primeiraAulaQueEnsina: null,
          severidade: 'erro',
          mensagem:
            `o desafio da aula \`${aula.ref}\` não reutiliza NENHUM átomo demonstrado em aulas anteriores — ` +
            'não há progressão nem recuperação espaçada (§7.1.12); inclua uma construção antiga no cenário (retrieval)',
        });
      }
    }

    // ── A16 — primeira atividade resolvível com a seção inicial ────────────
    const primeiro = aula.challenges[0];
    if (primeiro) {
      const escrito = new Set<AtomKey>();
      for (const arquivo of primeiro.files) {
        const rSol = extractAllOccurrences(arquivo.solution, { language: adapterId });
        if (!rSol.ok) continue; // solução que não parseia: o teach group já reporta
        const rStarter = extractAllOccurrences(arquivo.starter, { language: adapterId });
        const starterKeys = rStarter.ok ? new Set(rStarter.keys) : new Set<AtomKey>();
        for (const occ of rSol.occurrences) {
          if (!starterKeys.has(occ.key)) escrito.add(occ.key);
        }
      }
      for (const k of escrito) {
        if (demos[i].primeiraSecao.has(k) || cum.has(k) || H13_SET.has(k)) continue;
        // Derivação (spec §6.1/§6.2): o sinal ÚNICO do A16 é "demonstrado TARDE
        // demais para a primeira atividade" — a construção existe em alguma aula,
        // mas não na seção inicial nem no cumulativo. Construção NUNCA demonstrada
        // em lugar nenhum já é o sinal do A13 (lacuna de currículo) — flagar de
        // novo aqui duplicaria a mesma falha e inflaria o placar sem informação
        // nova. As violações medidas pela spec no §6.2 são todas de átomos
        // demonstrados nas seções posteriores da PRÓPRIA aula.
        const primeiroRef = primeiraDemonstracao.get(k);
        if (primeiroRef === undefined) continue;
        const secao = demos[i].secaoDe.get(k);
        const mensagem =
          secao !== undefined
            ? `o PRIMEIRO desafio de \`${aula.ref}\` exige ${humanLabel(k)}, demonstrado só na seção "${secao.titulo}" — a primeira atividade do aluno tem de ser resolvível com a seção inicial + material anterior (§7.1.2). Adiante a demonstração ou troque o desafio inicial`
            : `o PRIMEIRO desafio de \`${aula.ref}\` exige ${humanLabel(k)}, demonstrado só em \`${primeiroRef}\` — a primeira atividade do aluno tem de ser resolvível com a seção inicial + material anterior (§7.1.2). Adiante a demonstração ou troque o desafio inicial`;
        violations.push({
          regra: 'A16',
          arquivo: primeiro.desafioFile,
          ref: aula.ref,
          campo: 'solutionCode',
          linha: 1,
          coluna: 1,
          construcao: k,
          eixo: axisOf(k),
          faixa: 'productive',
          trechoOfensor: k,
          primeiraAulaQueEnsina: primeiroRef,
          // D4 (§8.2 da spec): valores/termos explicáveis em prosa sem bloco js
          // viram aviso TAMBÉM no A16 (undefined/null etc.) — erro só no sinal
          // real de construção (if/typeof/!/await/Array.isArray…)
          severidade: AVISO13.has(k) ? 'aviso' : 'erro',
          mensagem,
          desafioFile: primeiro.desafioFile,
        });
      }
    }
  });

  return { violations, novosPorAula };
}