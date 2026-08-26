/**
 * electron/main/domain/progressEngine.ts — MOTOR DE PROGRESSÃO + ÁRVORE + PRÓXIMA-AULA
 * (domínio puro, onda2-arvore-progresso).
 *
 * Este motor É o dono ÚNICO da lógica de EVOLUÇÃO do tutor: quando o aluno responde
 * uma aula, decidir qual é a PRÓXIMA do mesmo assunto; a complexidade dos desafios
 * cresce conforme o aluno evolui (requisito "muita prática, pouca teoria, gradativo");
 * o botão de hint (4º clique) ou "estou perdido" QUEBRA a aula em mais aulas-filhas;
 * e tudo vira uma árvore de aprendizado visível para a UI.
 *
 * DI-FRIENDLY / PURO: TODA a função recebe árvore, contagens e aulas por PARÂMETRO.
 * NÃO importa a repo do banco nem Electron — a fiação (IPC/service) é quem chama a
 * repo e injeta os dados. Isso torna o motor 100% testável sem sqlite/DOM.
 *
 * CONTRATOS que este motor consome (formato dos dados que a fiação injeta):
 *  - `tree`: { root: TreeNode | null, nodes: TreeNode[] } — a forma exatamente do
 *    `getTree(subjectSlug)` da `createLessonRepo` (repo.ts). `TreeNode` tem
 *    `lessonId`, `title`, `parentLessonId`, `originLessonId`, `completedAt`.
 *  - `lessons`: `listLessonsBySubject(slug)` (cada um com `id`, `title`, `difficulty`,
 *    `completedAt`).
 *  - `breakPlan`: saída do `buildBreakPlan(...)` do hintEngine (onda paralela). Cada
 *    item é uma SUB-AULA FOCADA cobrindo o trecho que o aluno NÃO entendeu, com um
 *    `bodySubset` (o pedaço da aula original a refazer). `HINT_STRATEGY.MAX_HINTS=3`
 *    lá vira tipicamente 2..4 sub-aulas aqui.
 */

/** Formato de um nó da árvore, espelhando `TreeNode` da repo (para o domínio não
 * importar o módulo da repo — a fiação converte). */
export interface ProgressTreeNode {
  lessonId: string;
  title: string;
  parentLessonId: string | null;
  originLessonId: string | null;
  completedAt: string | null;
}

/** Árvore de evolução no formato do `getTree` da repo. */
export interface ProgressTree {
  root: ProgressTreeNode | null;
  nodes: ProgressTreeNode[];
}

/** Aula resumida por assunto (formato do `listLessonsBySubject`). */
export interface ProgressLesson {
  id: string;
  title: string;
  body: string;
  difficulty: number;
  completedAt: string | null;
}

/** Uma sub-aula focada do breakPlan do hintEngine. */
export interface ProgressBreakItem {
  /** Título da sub-aula-filha. */
  title: string;
  /** O pedaço FOCADO da aula original que o aluno não entendeu (a ser refeito). */
  bodySubset: string;
}

/** Saída de `buildBreakPlan`. */
export interface ProgressBreakPlan {
  items: ProgressBreakItem[];
}

/** Parâmetros do `nextStep`. */
export interface NextStepParams {
  subjectSlug: string;
  /** Ids das aulas já concluídas (para redundância; o motor lê `completedAt` da árvore). */
  completedLessonIds: string[];
  tree: ProgressTree;
  lessons: ProgressLesson[];
  answeredTotal: number;
}

/** Saída do `nextStep` — o que o tutor deve fazer a seguir. */
export type NextStepResult =
  | {
      type: 'continue-existing';
      /** Aula pendente mais básica a continuar. */
      lessonId: string;
      reason: string;
    }
  | {
      type: 'generate-new';
      /** Escala de dificuldade sugerida (1..5) para gerar a próxima aula. */
      difficultyRamp: number;
      reason: string;
    }
  | {
      type: 'none';
      reason: string;
    };

/** Onde cada aula contada entra na escala de dificuldade (base + floor(answered/target)). */
const TARGET_ANSWERS_PER_STEP = 3;
/** Cap da escala de dificuldade (1..5). */
const MAX_DIFFICULTY = 5;
/** Abaixo disso, `progressionDifficulty` fica no baseline. */
const DIFFICULTY_BASELINE_FLOOR = 1;
/** Nº de respostas respondidas a partir do qual a rampa de dificuldade é ELEVADA
 * (requisito "desafios crescem em complexidade" quando o aluno pratica mais). */
export const MASTERY_THRESHOLD = 10;

/** Clampa num inteiro 1..MAX_DIFFICULTY para representar uma dificuldade de aula. */
function clampDifficulty(value: number): number {
  if (!Number.isFinite(value)) return DIFFICULTY_BASELINE_FLOOR;
  return Math.max(DIFFICULTY_BASELINE_FLOOR, Math.min(MAX_DIFFICULTY, Math.round(value)));
}

/**
 * Dificuldade progressiva da evolução: cresce com o nº de respostas respondidas.
 * `baseline` é a dificuldade de partida (default 1). Devolve 1..5.
 *
 *   difficulty = baseline + floor(answeredCount / TARGET_ANSWERS_PER_STEP)
 *
 * Ou seja: a cada `TARGET_ANSWERS_PER_STEP` respostas, a dificuldade sobre UMA
 * unidade, até o cap (5). Respostas poucas mantêm o baseline (mais gradual).
 */
export function progressionDifficulty(answeredCount: number, baseline = 1): number {
  const base = Number.isFinite(baseline) ? baseline : DIFFICULTY_BASELINE_FLOOR;
  const step = Math.floor(answeredCount / TARGET_ANSWERS_PER_STEP);
  return clampDifficulty(base + step);
}

/**
 * Próxima aula do MESMO assunto. REGRAS (documentadas para a fiação):
 *  1. Aula(s) incompleta(s) no assunto → `continue-existing`, a PRIMEIRA pendente
 *     em ordem de dificuldade ASCENDENTE (a mais básica vem primeiro).
 *  2. Todas completas E há aulas (`tree.nodes` não-vazio) → `generate-new`
 *     (continua evoluindo o assunto): sugere gerar a próxima com `difficultyRamp`
 *     calculado de `progressionDifficulty(answeredTotal)`; se `answeredTotal`
 *     passou o `MASTERY_THRESHOLD`, a rampa sobe mais (mais prática/desafios mais
 *     complexos — requisito "desafios crescem em complexidade").
 *  3. Sem nenhuma aula (`tree.nodes` vazio) → `none` (não há o que continuar;
 *     sugere gerar a primeira aula).
 */
export function nextStep(params: NextStepParams): NextStepResult {
  const { tree, lessons, answeredTotal } = params;

  // 3. Sem nenhuma aula ainda → nada a continuar.
  if (!tree.nodes || tree.nodes.length === 0) {
    return {
      type: 'none',
      reason: `assunto "${params.subjectSlug}" ainda não tem aulas; gere a primeira aula para começar.`,
    };
  }

  // Incompletas: usa a árvore como fonte de verdade de conclusão (completedAt null).
  const incompleteIds = new Set(
    tree.nodes.filter((n) => n.completedAt === null).map((n) => n.lessonId),
  );
  const incompleteLessons =
    Array.isArray(lessons) && lessons.length > 0
      ? lessons.filter((l) => incompleteIds.has(l.id) || !(l.completedAt != null))
      : [];

  // Fallback quando `lessons` não é informado/consistente com a árvore: deriva das
  // aulas incompletas direto da árvore (dificuldade desconhecida → assume baseline).
  const pendingNodes = tree.nodes.filter((n) => n.completedAt === null);

  if (incompleteLessons.length > 0) {
    // 1. Aula incompleta mais básica vem primeiro.
    const next = [...incompleteLessons].sort((a, b) => a.difficulty - b.difficulty)[0];
    return {
      type: 'continue-existing',
      lessonId: next.id,
      reason: `há aula(s) incompleta(s) no assunto "${params.subjectSlug}"; continue pela mais básica (dificuldade ${next.difficulty}).`,
    };
  }
  if (pendingNodes.length > 0 && incompleteLessons.length === 0) {
    // Árvore marca pendências mas `lessons` não as listou: cai na aula pendente da
    // árvore (os nós completos têm completedAt; ordena os pendentes pela posição).
    const next = [...pendingNodes].sort((a, b) =>
      (a.completedAt === null ? 0 : 1) - (b.completedAt === null ? 0 : 1),
    )[0];
    return {
      type: 'continue-existing',
      lessonId: next.lessonId,
      reason: `há aula(s) pendente(s) na árvore; continue pela primeira (não listada no resumo).`,
    };
  }

  // 2. Todas completas, há aulas → gerar a próxima, escalando a dificuldade.
  let ramp = progressionDifficulty(answeredTotal);
  if (answeredTotal > MASTERY_THRESHOLD) {
    // Mais prática acumulada → desafios mais complexos (eleva a rampa).
    ramp = progressionDifficulty(answeredTotal + TARGET_ANSWERS_PER_STEP);
  }
  const reason =
    answeredTotal > MASTERY_THRESHOLD
      ? `todas as aulas do assunto "${params.subjectSlug}" foram concluídas e o aluno já respondeu ${answeredTotal} vezes; gere a próxima aula em dificuldade ${ramp} (complexidade elevada pela prática).`
      : `todas as aulas do assunto "${params.subjectSlug}" foram concluídas; gere a próxima aula em dificuldade ${ramp} (evolução gradativa).`;
  return { type: 'generate-new', difficultyRamp: ramp, reason };
}

/** Uma aula-filha pronta para persistir (resultado do `breakIntoChildren`). */
export interface ProgressChildLesson {
  title: string;
  body: string;
  difficultyK: number;
  parentLessonId: string;
  originLessonId: string;
}

/**
 * QUEBRA a aula em aulas-filhas focadas quando o aluno não entendeu (4º clique do
 * hint ou "estou perdido"). Recebe o `breakPlan` do hintEngine (as sub-aulas que
 * cobrem o trecho que ele não entendeu) + a aula sendo quebrada; monta as filhas que
 * serão persistidas:
 *  - cada filha recebe `parentLessonId` = id da aula quebrada (liga na árvore como
 *    filho) e `originLessonId` = id original (rastreável até a origem).
 *  - dificuldade: a 1ª filha RECOMEÇA no nível base (`baselineDifficulty`) — refazer
 *    o conceito que ele não entendeu de forma mais gradual; as seguintes sobem com
 *    `progressionDifficulty` para continuar a ramp.
 *  - `body` = `bodySubset` do breakPlan (a parte focada que ele não entendeu).
 */
export function breakIntoChildren(input: {
  lessonId: string;
  lessonTitle: string;
  lessonBody: string;
  difficulty: number;
  breakPlan: ProgressBreakPlan;
  /** Dificuldade de partida da 1ª filha (default 1 — mais gradual). */
  baselineDifficulty?: number;
}): ProgressChildLesson[] {
  const {
    lessonId,
    lessonTitle,
    lessonBody,
    difficulty,
    breakPlan,
    baselineDifficulty = 1,
  } = input;
  // Contracto: quebrar uma aula implica gerar "mais aulas" → SEMPRE ≥2 filhas
  // (dificuldade crescente, prática guiada). O hintEngine.buildBreakPlan gera ≥2
  // itens, mas a fiação pode injetar um plano degenerado (0 ou 1 item); o motor
  // precisa ser auto-suficiente mesmo assim.
  const items = breakPlan?.items ?? [];

  // Sem breakPlan útil E sem corpo para derivar prática → não há o que transformar
  // em aulas-filhas (não fabricamos conteúdo do nada).
  const trimmedBody = lessonBody?.trim() ?? '';
  if (items.length === 0 && trimmedBody.length === 0) return [];

  const base = Number.isFinite(baselineDifficulty)
    ? baselineDifficulty
    : DIFFICULTY_BASELINE_FLOOR;

  // Simplificação interna: deriva sempre ≥2 "unidades" de prática; quando o
  // breakPlan tem 1 item, completa a 2ª unidade com uma revisão derivada do corpo.
  const units =
    items.length >= 2
      ? items.map((item, index) => ({
          title: item.title?.trim() ? item.title : `${lessonTitle} (parte ${index + 1})`,
          body: item.bodySubset ?? '',
        }))
      : // 0 ou 1 item: ainda garante ≥2 filhas de revisão/prática derivadas.
        items.length === 1
        ? [
            // 1ª: a ideia-chave que o aluno NÃO entendeu (a sub-aula focada do plano).
            {
              title: items[0].title?.trim() ? items[0].title : `${lessonTitle} (parte 1)`,
              body: items[0].bodySubset ?? '',
            },
            // 2ª: prática guiada/revisão do próprio conceito (recapitula o corpo
            // quebrado) para honrar o contrato "≥2 filhas por quebra".
            {
              title: `${lessonTitle} (parte 2)`,
              body: trimmedBody.length > 0
                ? `Revisão guiada de "${lessonTitle}": recapitula o conceito a seguir.\n\n${trimmedBody}`
                : `Revisão guiada de "${lessonTitle}".`,
            },
          ]
        : // 0 itens com corpo não-vazio: o trecho que ele não entendeu é desconhecido,
          // mas a quebra ainda entrega prática guiada em ≥2 pedaços derivados do corpo.
          [
            {
              title: `${lessonTitle} (parte 1)`,
              body: `Leitura fatiada de "${lessonTitle}" (1/2).\n\n${trimmedBody}`,
            },
            {
              title: `${lessonTitle} (parte 2)`,
              body: `Prática guiada de revisão de "${lessonTitle}" (2/2).\n\n${trimmedBody}`,
            },
          ];

  return units.map((unit, index) => {
    // 1ª filha recomeça no nível base (mais gradual — refazer o que não entendeu);
    // cada filha seguinte acumula um alvo de prática a mais na ramp, de modo que
    // suba ~1 unidade por filha (base + 1, base + 2, ... cap 5) e continue a
    // progressão gradual da evolução.
    const childDifficulty =
      index === 0
        ? clampDifficulty(base)
        : progressionDifficulty(index * TARGET_ANSWERS_PER_STEP, base);
    return {
      title: unit.title,
      body: unit.body,
      difficultyK: childDifficulty,
      parentLessonId: lessonId,
      originLessonId: lessonId,
    };
  });
}

/** Um nó da árvore aninhada pronta para a UI. */
export interface ProgressViewNode {
  lessonId: string;
  title: string;
  completedAt: string | null;
  children: ProgressViewNode[];
}

/**
 * Converte o `getTree` da repo (lista plana `{root, nodes}`) numa ÁRVORE ANINHADA
 * pronta para a UI/componentes. NÃO deixa loops (nós sem pai resolvido não cravam
 * em lugar algum; refereências ausentes/ciclos são ignoradas). A raiz é `tree.root`
 * ou a primeira node sem `parentLessonId`.
 */
export function treeToView(tree: ProgressTree): ProgressViewNode[] {
  const nodes = tree?.nodes ?? [];
  if (nodes.length === 0) return [];

  const byId = new Map<string, ProgressTreeNode>();
  for (const n of nodes) byId.set(n.lessonId, n);

  // Mapa de parentId → ids (filhos). Só aceita parents que EXISTEM no conjunto
  // (evita pendurar em nó fora da lista e corta loops: nenhum nó pendura em si).
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    const pid = n.parentLessonId;
    if (pid != null && pid !== n.lessonId && byId.has(pid)) {
      const list = childrenOf.get(pid) ?? [];
      list.push(n.lessonId);
      childrenOf.set(pid, list);
    }
  }

  const seen = new Set<string>();

  function build(id: string): ProgressViewNode | null {
    const n = byId.get(id);
    if (!n || seen.has(id)) return null; // guarda contra ciclo/repetição.
    seen.add(id);
    const node: ProgressViewNode = {
      lessonId: n.lessonId,
      title: n.title,
      completedAt: n.completedAt,
      children: [],
    };
    // Ordena os filhos de forma estável (pela ordem em que aparecem na lista).
    const kids = childrenOf.get(id) ?? [];
    for (const kidId of kids) {
      const child = build(kidId);
      if (child) node.children.push(child);
    }
    return node;
  }

  const roots: ProgressViewNode[] = [];

  // 1. Se `tree.root` está presente e não tem parent, ele é a raiz.
  if (tree?.root && roots.length === 0) {
    const rootNode = build(tree.root.lessonId);
    if (rootNode) roots.push(rootNode);
  }

  // 2. Para o caso de `root` ausemte/não-encontrado: todas as nodes SEM parentLessonId
  //    resolvido são raízes flutuantes (a primeira delas é a raiz efetiva).
  if (roots.length === 0) {
    for (const n of nodes) {
      if (n.parentLessonId == null) {
        const r = build(n.lessonId);
        if (r) roots.push(r);
      }
    }
  }

  // 3. Qualquer nó que ficou de fora (parent apontando para um id não-encontrado, ou
  //    que foi pulado pela guarda de ciclo) vira raiz de último recurso para nunca
  //    "cai" fora da view.
  for (const n of nodes) {
    if (!seen.has(n.lessonId)) {
      const r = build(n.lessonId);
      if (r) roots.push(r);
    }
  }

  return roots;
}
