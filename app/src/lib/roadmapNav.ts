/**
 * src/lib/roadmapNav.ts — NAVEGAÇÃO DA TRILHA (onda1-nav-ui).
 *
 * O shell monta SÓ a view ativa (App.tsx — `const View = VIEWS[active]`):
 * trocar de aba DESMONTA a RoadmapView e zera o `useState` local dela
 * (`selected`). Antes desta onda, abrir Trilha → detalhe → ir a Settings →
 * voltar à Trilha mostrava a LISTA de trilhas de novo — o histórico de
 * navegação se perdia. Este store resolve o pedido do dono ("quero que o
 * histórico se mantenha com um botão de voltar"):
 *
 *   - `setLastTrackSlug(slug)` grava a trilha ABERTA no momento;
 *   - `setLastTrackSlug(null)` grava "na lista" (botão VOLTAR / seletor);
 *   - `peekLastTrackSlug()` lê sem consumir — a RoadmapView restaura o
 *     detalhe na MONTAGEM quando não há pendência nova (Home → Trilha);
 *   - `__resetRoadmapNavForTests()` esvazia (beforeEach dos testes).
 *
 * Store EM MEMÓRIA (variável de módulo, sem React, sem listeners — nada
 * re-renderiza): sobrevive à desmontagem da view porque o módulo vive no
 * processo do renderer, não no componente. Módulo PURO (sem DOM): testável
 * via node:test, mesmo padrão de pendingSubject.ts/lessonChatCache.ts.
 *
 * SEMÂNTICA: o último a escrever vence. A RoadmapView salva ao abrir uma
 * trilha (setSelected + loadTrack) e ao voltar à lista (botão VOLTAR /
 * novo mount sem trilha aberta).
 */
let lastTrackSlug: string | null = null;

/** Grava a trilha aberta no momento (null = de volta à lista de trilhas). */
export function setLastTrackSlug(slug: string | null): void {
  lastTrackSlug = slug !== null && slug.trim().length > 0 ? slug.trim() : null;
}

/** Lê a última trilha aberta SEM consumir (peek — a view restaura no mount). */
export function peekLastTrackSlug(): string | null {
  return lastTrackSlug;
}

/* ── O QUE ACABOU DE DESTRAVAR (onda11-cadeado) ───────────────────────────── */

/**
 * O dono pediu o destravamento "com efeito". Efeito de QUÊ, exatamente? Só a
 * aula que MUDOU de estado NESTA VOLTA — pintar toda aula destravada faria a
 * trilha inteira brilhar a cada visita, o que é ruído, não informação (§8.2 do
 * ux-redesign: feedback informativo ajuda, d=+0,43; ritual de elogio atrapalha,
 * d=-0,40).
 *
 * COMO SABEMOS O QUE MUDOU. Três caminhos eram possíveis: (a) marcar a aula
 * recém-destravada no payload do main, (b) comparar com o banco, (c) comparar
 * com o que ESTA SESSÃO viu na visita anterior. Escolhemos (c):
 *   - o main não tem como saber o que o ALUNO já viu na tela — ele só sabe o
 *     estado atual; um campo `justUnlocked` no payload precisaria de um
 *     "visto/não visto" persistido, e um efeito visual não vale uma tabela
 *     nova (nem uma migração de contrato IPC);
 *   - a pergunta é literalmente sobre a TELA ("quando eu volto para a trilha, o
 *     que abriu desde a última vez que olhei?"), e isso é estado de sessão;
 *   - o snapshot é POR TRILHA, então trocar de trilha não inventa mudança.
 *
 * A PRIMEIRA visita da sessão a uma trilha NUNCA acende nada: sem snapshot
 * anterior não existe "mudou", e supor que mudou seria mentira (o aluno pode
 * ter destravado aquilo semanas atrás).
 *
 * Store EM MEMÓRIA, como o resto deste módulo: o efeito é da sessão, e um
 * app reaberto não deve reencenar destravamentos antigos.
 */
let lockSnapshots = new Map<string, Set<string>>();

/** O que o diff precisa saber de cada aula (o payload da trilha tem mais). */
export interface LessonLockState {
  slug: string;
  locked: boolean;
}

/**
 * Compara o estado ATUAL das aulas com o da última visita a ESTA trilha e
 * devolve os slugs que ACABARAM de destravar; grava o novo snapshot.
 *
 * Regras (todas medidas por tests/roadmapUnlockDiff.test.ts):
 *  - sem snapshot anterior (1ª visita da sessão) ⇒ [] e o estado é gravado;
 *  - só conta a transição travada → destravada (nunca o contrário, nunca
 *    "concluída", nunca aula nova que já nasce destravada num payload novo);
 *  - a ordem da resposta é a ordem das aulas na trilha (a tela lê de cima
 *    para baixo).
 */
export function diffUnlockedSinceLastVisit(
  trackSlug: string,
  lessons: readonly LessonLockState[],
): string[] {
  const anterior = lockSnapshots.get(trackSlug);
  const agora = new Set(lessons.filter((l) => l.locked).map((l) => l.slug));
  lockSnapshots.set(trackSlug, agora);
  if (!anterior) return [];
  return lessons.filter((l) => !l.locked && anterior.has(l.slug)).map((l) => l.slug);
}

/**
 * RETENTOR do diff para a MONTAGEM de um componente (o padrão anti-StrictMode
 * da casa — o mesmo de `createTrackLessonPendingHolder` em pendingSubject.ts).
 *
 * POR QUÊ: `diffUnlockedSinceLastVisit` é ONE-SHOT por construção (ele grava o
 * snapshot novo). Em dev o React <StrictMode> monta a view duas vezes e a
 * RoadmapView dispara o `track:get` nas duas passadas: a 1ª veria o
 * destravamento, a 2ª veria "nada mudou" — e a 2ª é a que fica na tela. O
 * efeito sumiria justamente em desenvolvimento, que é onde ele é olhado.
 * Refs do MESMO fiber sobrevivem ao ciclo setup→cleanup→setup, então um
 * holder retido num ref preserva a resposta.
 *
 * A retenção é POR TRILHA: trocar de trilha dentro da MESMA montagem (o
 * seletor da lista) calcula um diff novo, em vez de repetir o da anterior.
 * Módulo puro (sem React): testável via node:test.
 */
export function createUnlockDiffHolder(): {
  get(trackSlug: string, lessons: readonly LessonLockState[]): string[];
} {
  const retido = new Map<string, string[]>();
  return {
    get(trackSlug, lessons) {
      const jaVisto = retido.get(trackSlug);
      if (jaVisto) return jaVisto;
      const diff = diffUnlockedSinceLastVisit(trackSlug, lessons);
      retido.set(trackSlug, diff);
      return diff;
    },
  };
}

/** Reseta o estado do módulo (só para testes — chamado no beforeEach). */
export function __resetRoadmapNavForTests(): void {
  lastTrackSlug = null;
  lockSnapshots = new Map();
}
