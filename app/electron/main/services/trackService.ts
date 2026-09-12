/**
 * electron/main/services/trackService.ts — lógica de TRILHA (rodada 8).
 *
 * Conteúdo = arquivos estáticos (trackLoader); progresso = SQLite (repo).
 * Este serviço CASAMENTA os dois e produz os DTOs do contrato
 * (shared/ipc-contract.ts): lista de trilhas, detalhe com estados
 * locked/done/current, conteúdo de aula, especificação de desafio e o
 * destravamento sequencial (aula seguinte só destrava quando a anterior foi
 * concluída — OU quando o teste de proficiência, que cobre TUDO, foi passado).
 *
 * PURE/DI: `repo` é a interface mínima (TrackProgressLike) — injetável em
 * testes sem electron.
 */

import {
  DEFAULT_MIN_FIRST_STAR_MS,
  PROFICIENCY_MIN_FIRST_STAR_MS,
  TrackChallengeSource,
} from '../content/trackTypes';
import {
  LoadedLesson,
  LoadedModule,
  LoadedTrack,
  findChallenge,
  findLesson,
  findLessonAnywhere,
} from '../content/trackLoader';
import type {
  TrackChallengeSpec,
  TrackDetailPayload,
  TrackLessonEntry,
  TrackLessonPayload,
  TrackListEntry,
  TrackVerdict,
} from '../../../shared/ipc-contract';

/** Interface mínima de progresso exigida pelo serviço (subconjunto do repo). */
export interface TrackProgressLike {
  listTrackLessonProgress(trackSlug: string): Promise<{ trackSlug: string; lessonId: string; completedAt: string }[]>;
  getTrackProficiency(trackSlug: string): Promise<{ trackSlug: string; verdict: 'passed' | 'failed'; stars: number; passedAt: string } | null>;
  listGeneratedChallenges(
    trackSlug: string,
    lessonId: string,
  ): Promise<{ id: string; trackSlug: string; lessonId: string; challengeId: string; statement: string; starterCode: string; testsCode: string; solutionCode: string; expectedTestCount: number; createdAt: string }[]>;
  getAttemptsForChallenge(challengeId: string): Promise<{ id: string; subjectId: string; lessonId: string; challengeId: string; verdict: TrackVerdict; stars: number; durationMs: number; createdAt: string }[]>;
}

/**
 * O MÍNIMO QUE A CONCLUSÃO DE AULA PRECISA DO PROGRESSO: as leituras de
 * `TrackProgressLike` + a ÚNICA escrita (`markTrackLessonDone`).
 *
 * Existe para que este serviço não precise do `TrackRepoLike` do IPC (o serviço
 * não pode importar de `ipc/` — ciclo) nem invente uma segunda régua da mesma
 * capacidade: qualquer repo que já implemente a interface dos handlers e a do
 * stub E2E satisfaz esta por tipagem estrutural, sem adaptador.
 */
export interface TrackProgressWriter extends TrackProgressLike {
  markTrackLessonDone(trackSlug: string, lessonId: string): Promise<void>;
}

/**
 * Limite de tempo por dificuldade — MESMA fórmula do renderer
 * (src/lib/challengeStars.ts: T = 90s + difficulty*60s; fallback 300s).
 * Duplicada aqui de propósito: o main monta o TrackChallengeSpec e o renderer
 * roda o cronômetro; cada lado tem o seu twin testado.
 */
export function timeLimitForDifficultyMs(difficulty?: number): number {
  if (typeof difficulty !== 'number' || !Number.isFinite(difficulty) || difficulty < 1) {
    return 300_000;
  }
  return 90_000 + difficulty * 60_000;
}

/** Último veredito + estrelas + contagem de falhas de um desafio. */
export interface AttemptSummary {
  lastVerdict: TrackVerdict | null;
  stars: number;
  failedCount: number;
}

export function summarizeAttempts(
  attempts: readonly { verdict: TrackVerdict; stars: number }[],
): AttemptSummary {
  let lastVerdict: TrackVerdict | null = null;
  let stars = 0;
  let failedCount = 0;
  for (const a of attempts) {
    lastVerdict = a.verdict;
    stars = a.stars;
    if (a.verdict === 'failed' || a.verdict === 'timeout') failedCount += 1;
  }
  return { lastVerdict, stars, failedCount };
}

/** Achatamento das aulas na ordem da trilha (módulos por order, aulas declaradas). */
export function flattenTrackLessons(track: LoadedTrack): Array<{ moduleSlug: string; lesson: LoadedLesson }> {
  const out: Array<{ moduleSlug: string; lesson: LoadedLesson }> = [];
  const modules = [...track.modules].sort((a, b) => a.meta.order - b.meta.order);
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      out.push({ moduleSlug: mod.meta.slug, lesson });
    }
  }
  return out;
}

/**
 * Estados de destravamento da trilha (PURA — testável sem repo):
 * - done: lessonId ∈ doneSet;
 * - locked: false para a PRIMEIRA aula; para as demais, true quando a aula
 *   anterior ainda não está concluída E o aluno não passou na proficiência;
 * - current: a primeira aula destravada e não concluída (no máx. 1; nenhuma
 *   quando a trilha está 100% concluída).
 */
export interface LessonUnlockState {
  locked: boolean;
  done: boolean;
  current: boolean;
}

export function computeUnlockStates(
  track: LoadedTrack,
  doneSet: ReadonlySet<string>,
  proficient: boolean,
): Map<string, LessonUnlockState> {
  const flat = flattenTrackLessons(track);
  const out = new Map<string, LessonUnlockState>();
  let prevDone = true; // primeira aula destrava
  for (const { lesson } of flat) {
    const done = doneSet.has(lesson.meta.slug);
    const locked = !prevDone && !proficient;
    out.set(lesson.meta.slug, { locked, done, current: false });
    prevDone = done;
  }
  // current = primeira destravada e não concluída
  let foundCurrent = false;
  for (const { lesson } of flat) {
    const st = out.get(lesson.meta.slug)!;
    if (!st.locked && !st.done) {
      if (!foundCurrent) {
        st.current = true;
        foundCurrent = true;
      } else {
        st.current = false;
      }
    }
  }
  return out;
}

/** Estado da trilha inteira: doneSet + proficiência (uma leitura só). */
export async function loadTrackState(
  trackSlug: string,
  repo: TrackProgressLike,
): Promise<{ doneSet: Set<string>; proficient: boolean }> {
  const [progress, prof] = await Promise.all([
    repo.listTrackLessonProgress(trackSlug),
    repo.getTrackProficiency(trackSlug),
  ]);
  return {
    doneSet: new Set(progress.map((p) => p.lessonId)),
    proficient: prof?.verdict === 'passed',
  };
}

/**
 * PRÓXIMA aula da MESMA trilha (onda 4 next-glow) — alimenta o botão
 * "Avançar para a próxima aula" pós-conclusão (payload `nextLesson`).
 *
 * Regras (contrato do dono, documentadas aqui):
 *  (a) a própria aula NÃO conta — a busca começa DEPOIS dela na ordem dos
 *      módulos (módulos por `order`, aulas na ordem declarada);
 *  (b) devolve a primeira aula DESTRAVADA e NÃO concluída depois dela;
 *  (c) null quando a aula é a última OU não há próxima destravada e não feita;
 *  (d) DECISÃO (dono): o estado é calculado COMO SE esta aula já estivesse
 *      concluída (done simulada) — mesmo quando o payload é pedido antes da
 *      conclusão, `nextLesson` aponta para a aula que ficará destravada
 *      DEPOIS desta. Proficiência passada destrava tudo (mesma regra de
 *      computeUnlockStates), então com proficient=true a próxima não-feita
 *      nunca é pulada por travamento.
 */
export function computeNextLesson(
  track: LoadedTrack,
  currentSlug: string,
  doneSet: ReadonlySet<string>,
  proficient: boolean,
): { slug: string; title: string } | null {
  const flat = flattenTrackLessons(track);
  const currentIndex = flat.findIndex(({ lesson }) => lesson.meta.slug === currentSlug);
  if (currentIndex === -1) return null;
  // (d): simula esta aula concluída — ela destrava a seguinte.
  const simulatedDone = new Set(doneSet);
  simulatedDone.add(currentSlug);
  const states = computeUnlockStates(track, simulatedDone, proficient);
  for (let i = currentIndex + 1; i < flat.length; i++) {
    const { lesson } = flat[i];
    const st = states.get(lesson.meta.slug);
    if (st && !st.locked && !st.done) {
      return { slug: lesson.meta.slug, title: lesson.meta.title };
    }
  }
  return null;
}

export async function buildTrackList(tracks: LoadedTrack[], repo: TrackProgressLike): Promise<TrackListEntry[]> {
  const out: TrackListEntry[] = [];
  for (const track of tracks) {
    const flat = flattenTrackLessons(track);
    const { doneSet, proficient } = await loadTrackState(track.root.slug, repo);
    const doneCount = flat.filter(({ lesson }) => doneSet.has(lesson.meta.slug)).length;
    out.push({
      slug: track.root.slug,
      title: track.root.title,
      description: track.root.description,
      domain: track.root.domain,
      moduleCount: track.modules.length,
      lessonCount: flat.length,
      doneCount,
      proficient,
    });
  }
  return out;
}

export async function buildTrackDetail(track: LoadedTrack, repo: TrackProgressLike): Promise<TrackDetailPayload> {
  const { doneSet, proficient } = await loadTrackState(track.root.slug, repo);
  const states = computeUnlockStates(track, doneSet, proficient);
  const flat = flattenTrackLessons(track);

  const modules: TrackDetailPayload['modules'] = [];
  for (const mod of [...track.modules].sort((a, b) => a.meta.order - b.meta.order)) {
    const lessons: TrackLessonEntry[] = mod.lessons.map((lesson) => {
      const st = states.get(lesson.meta.slug)!;
      return {
        slug: lesson.meta.slug,
        moduleSlug: mod.meta.slug,
        title: lesson.meta.title,
        summary: lesson.meta.summary,
        difficulty: lesson.meta.difficulty,
        locked: st.locked,
        done: st.done,
        current: st.current,
      };
    });
    // ADITIVO (rodada 9): desafio do MÓDULO — disponibilidade + estado do aluno
    // (último veredito/estrelas via getAttemptsForChallenge do slug).
    let challengeLastVerdict: TrackVerdict | null = null;
    let challengeStars = 0;
    if (mod.challenge) {
      const sum = summarizeAttempts(await repo.getAttemptsForChallenge(mod.challenge.slug));
      challengeLastVerdict = sum.lastVerdict;
      challengeStars = sum.stars;
    }
    modules.push({
      slug: mod.meta.slug,
      title: mod.meta.title,
      order: mod.meta.order,
      lessons,
      challengeAvailable: mod.challenge !== null,
      challenge: mod.challenge ? { slug: mod.challenge.slug, title: mod.challenge.title } : null,
      challengeLastVerdict,
      challengeStars,
    });
  }

  return {
    slug: track.root.slug,
    title: track.root.title,
    description: track.root.description,
    domain: track.root.domain,
    modules,
    proficiencyAvailable: track.proficiency !== null,
    proficient,
    doneCount: flat.filter(({ lesson }) => doneSet.has(lesson.meta.slug)).length,
    lessonCount: flat.length,
  };
}

/** Monta o payload de UMA aula (teoria, fontes, pré-requisitos, desafios). */
export async function buildTrackLesson(
  track: LoadedTrack,
  moduleSlug: string,
  lessonSlug: string,
  repo: TrackProgressLike,
): Promise<TrackLessonPayload | null> {
  const lesson = findLesson(track, moduleSlug, lessonSlug);
  if (!lesson) return null;
  const { doneSet, proficient } = await loadTrackState(track.root.slug, repo);
  const states = computeUnlockStates(track, doneSet, proficient);
  const st = states.get(lessonSlug)!;

  const challengeSummaries = await buildChallengeSummaries(
    track.root.slug,
    lesson,
    repo,
    track,
  );

  const prereqEntries = lesson.meta.prerequisites
    .map((slug) => {
      for (const mod of track.modules) {
        const found = mod.lessons.find((l) => l.meta.slug === slug);
        if (found) return { slug, title: found.meta.title };
      }
      return null;
    })
    .filter((x): x is { slug: string; title: string } => x !== null);

  return {
    slug: lesson.meta.slug,
    moduleSlug,
    title: lesson.meta.title,
    summary: lesson.meta.summary,
    difficulty: lesson.meta.difficulty,
    concepts: lesson.meta.concepts,
    prerequisites: prereqEntries,
    theory: lesson.meta.theory.map((s) => ({
      id: s.id,
      title: s.title,
      markdown: s.markdown,
      code: s.code,
    })),
    // ADITIVO (onda 1 schema-quiz): afirmações da aula — ausente → payload sem
    // o campo (aula sem quiz, trilhas antigas inalteradas).
    assertions: lesson.meta.assertions?.map((a) => ({
      id: a.id,
      statement: a.statement,
      question: a.question,
      options: a.options,
      answerIndex: a.answerIndex,
      feedback: a.feedback,
      // ADITIVO (onda 1 replan sectionId, REPLAN A1): a âncora que liga o quiz
      // à seção de teoria que demonstra a assertion. OPCIONAL: ausente =
      // afirmação sem âncora (o renderer cai no FALLBACK_QUIZ_SECTION).
      sectionId: a.sectionId,
    })),
    sources: lesson.meta.sources.map((s) => ({ title: s.title, url: s.url, description: s.description })),
    challenges: challengeSummaries,
    locked: st.locked,
    done: st.done,
    // ONDA 4 (next-glow): próxima aula destravada e não concluída da MESMA
    // trilha (estado como se esta já estivesse concluída — regra (d) de
    // computeNextLesson). null = última aula ou sem próxima.
    nextLesson: computeNextLesson(track, lessonSlug, doneSet, proficient),
  };
}

/** Resumo dos desafios de UMA aula: os da trilha + os regenerados do aluno.
 *
 * ONDA3 (generate-flow, pedido C do dono): os desafios GERADOS vêm PRIMEIRO
 * (o novo desafio aparece ACIMA do primeiro visível — mais recente primeiro:
 * o repo listGeneratedChallenges já ordena created_at DESC) e DEPOIS os
 * autorais (ordem declarada da trilha). */
export async function buildChallengeSummaries(
  trackSlug: string,
  lesson: LoadedLesson,
  repo: TrackProgressLike,
  _track: LoadedTrack,
): Promise<TrackLessonPayload['challenges']> {
  const out: TrackLessonPayload['challenges'] = [];
  const generated = await repo.listGeneratedChallenges(trackSlug, lesson.meta.slug);
  for (const g of generated) {
    const attempts = await repo.getAttemptsForChallenge(g.challengeId);
    const sum = summarizeAttempts(attempts);
    out.push({
      slug: g.challengeId,
      title: g.challengeId,
      concept: 'gerado',
      difficulty: 2,
      lastVerdict: sum.lastVerdict,
      stars: sum.stars,
      failedCount: sum.failedCount,
      generated: true,
    });
  }
  for (const ch of lesson.challenges) {
    const attempts = await repo.getAttemptsForChallenge(ch.slug);
    const sum = summarizeAttempts(attempts);
    out.push({
      slug: ch.slug,
      title: ch.title,
      concept: ch.concept,
      difficulty: ch.difficulty,
      lastVerdict: sum.lastVerdict,
      stars: sum.stars,
      failedCount: sum.failedCount,
      generated: false,
    });
  }
  return out;
}

/**
 * A AULA ESTÁ TRANCADA? — UMA RÉGUA SÓ, PARA TODOS OS CHAMADORES.
 *
 * (ONDA 1 destrave-desafio; extraída para cá na onda 2.)
 *
 * POR QUE ISTO VIROU FUNÇÃO, E NÃO DUAS LINHAS COPIADAS: o gate sequencial
 * nasceu no `track:lesson-done` (ONDA 15 — o bloco que explica o falso
 * destravamento mora em `ipc/track-handlers.ts`, no canal). A onda 1 deu a
 * MESMA pergunta a um SEGUNDO caminho: o destrave automático ao passar o
 * desafio da aula também precisa recusar aula trancada, senão o aluno destrava
 * a seguinte PULANDO a ordem por outra porta — o defeito exato que a ONDA 15
 * fechou. E a onda 2 deu a MESMA pergunta a um TERCEIRO: o stub do harness E2E,
 * que precisa da paridade com a produção para o gate medir o requisito. Três
 * cópias da pergunta é como as três respostas divergem.
 *
 * A régua é a MESMA de `computeUnlockStates`: a trava é a aula anterior não
 * concluída E sem proficiência. A função responde apenas "trancada?" e NÃO
 * decide o que fazer com a resposta — o `LESSON_DONE` transforma `true` em
 * `{ok:false}` (ele é um registro de conclusão; recusar é o retorno certo) e o
 * destrave automático transforma `true` em "não grava e segue" (o submit do
 * aluno não pode falhar por causa do destrave). Quem chama decide.
 *
 * Ela LANÇA se a leitura do progresso falhar — cada chamador tem o seu
 * tratamento (fail-closed no gate; silencioso no destrave e no stub).
 */
export async function lessonIsLocked(
  track: LoadedTrack,
  trackSlug: string,
  lessonId: string,
  progress: TrackProgressLike,
): Promise<boolean> {
  const { doneSet, proficient } = await loadTrackState(trackSlug, progress);
  return computeUnlockStates(track, doneSet, proficient).get(lessonId)?.locked === true;
}

/**
 * TODOS os desafios da aula aprovados? — PURA (autorais + regenerados).
 *
 * "A aula está completa" AQUI = TODO desafio da aula com último veredito
 * `passed` — a cláusula de DESAFIOS do `lessonFinishBlock` do renderer
 * (src/lib/trackLessonState.ts:566-568), lida sobre `buildChallengeSummaries`
 * (autorais + regenerados do aluno): a mesma lista que o payload da aula
 * entrega ao gate da tela, para os dois lados nunca discordarem sobre o que
 * falta EM DESAFIO.
 *
 * O VEREDITO RECÉM-APROVADO CONTA PELO ID: o submit NÃO persiste a tentativa
 * (quem persiste é o renderer, DEPOIS, via `study:mark-challenge-attempt`),
 * então o veredito do desafio que acabou de ser aprovado AINDA NÃO está no
 * banco neste instante — ele é contado por `submittedChallengeId`. Sem isso, o
 * último desafio da aula nunca fecharia a conta sozinho.
 */
export function lessonChallengesAllPassed(
  summaries: readonly { slug: string; lastVerdict: TrackVerdict | null }[],
  submittedChallengeId: string,
): boolean {
  return summaries.every((c) => c.slug === submittedChallengeId || c.lastVerdict === 'passed');
}

/**
 * PASSAR NO DESAFIO DA AULA CONCLUI A AULA — E DESTRAVA A SEGUINTE.
 * (ONDA 1 — pedido do dono: "quando eu passo no desafio já quero que libere a
 * destrave a próxima aula".)
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO MEDIDO
 * ══════════════════════════════════════════════════════════════════════════
 * O `done` da aula só era gravado pelo canal `track:lesson-done` (o clique em
 * "Concluir aula"). Quem passava no desafio da aula via o veredito verde, mas
 * a aula continuava `done=false` no banco — e o botão "Avançar para a próxima
 * aula" do TrackChallengePanel caía no fallback da Trilha, porque
 * `computeUnlockStates` seguia devolvendo `locked=true` para a seguinte. O
 * aluno tinha de clicar em "Concluir aula" numa tela que já não tinha nada a
 * mostrar para receber o destrave que ele JÁ tinha provado merecer.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A DECISÃO
 * ══════════════════════════════════════════════════════════════════════════
 * A conclusão passa a ser gravada no MAIN, quando o submit aprova o desafio —
 * e não na tela: este é o registro do progresso, a última porta antes do
 * banco, e o destrave vale para toda entrada do canal. O canal
 * `track:lesson-done` continua existindo e idempotente (o clique explícito em
 * "Concluir aula" segue funcionando).
 *
 * `target === 'module'` e `target === 'proficiency'` NÃO entram: proficiência
 * já destrava a trilha inteira no canal próprio (`setTrackProficiency`), e o
 * desafio de módulo é autoral — não conclui aula nenhuma. Quem filtra o alvo é
 * o CHAMADOR (é uma cláusula do request, não da régua).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A RÉGUA REPRODUZIDA É A DE **DESAFIOS** — A CLÁUSULA DE QUIZ **NÃO** É
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE NÃO É REPRODUZIDO, E POR QUÊ: o `lessonFinishBlock` tem DUAS cláusulas
 * com precedência — `pendingQuizCount > 0 → 'quiz'` ANTES de `'challenges'`
 * (trackLessonState.ts:565) — e este caminho reproduz SÓ a de desafios. O MAIN
 * **não tem** o estado de quiz: ele vive no renderer (`quizBySection` /
 * `pendingQuizzes`, trackLessonState.ts:1863), ancorado nas seções
 * APRESENTADAS (`quizzesByMessageIndex`) — e o MAIN não conhece as seções
 * apresentadas. Não há como perguntar "há quiz visível sem maestria?" deste
 * lado sem inventar uma segunda régua da MESMA pergunta.
 *
 * ── LIMITAÇÃO DECLARADA (conhecida; medida pela revisão adversarial) ──────
 * CAMINHO RESIDUAL, reproduzível: na Aula, abrir "Desafios" ANTES de qualquer
 * quiz ficar visível (permitido — `challengeOpenBlockedByQuiz` só bloqueia
 * quando `finishBlock === 'quiz'`, LessonView.tsx:696), ir à aba Desafio e
 * NÃO submeter, voltar à Aula, apresentar a seção com o quiz e deixá-lo sem
 * resposta, voltar à aba Desafio (a seleção sobrevive — o shell monta só a
 * view ativa, `const View = VIEWS[active]`, App.tsx:78, e o `trackChallenge`
 * vive no `ChallengeNavProvider` ACIMA do Shell, App.tsx:123) e aprovar: a
 * aula sai `done=true` com o quiz pendente. Isto é DECLARADO de propósito —
 * a limitação é conhecida e não deve ser redescoberta como surpresa.
 *
 * ⚑ DECISÃO ARBITRADA (dono do produto, via orquestrador): NÃO trazer a
 * cláusula de quiz para o MAIN. O pedido explícito é "passar no desafio
 * destrava a próxima aula"; a régua extra de quiz AQUI seria uma SEGUNDA
 * RÉGUA da mesma pergunta — o repo proíbe (ver o comentário de
 * `challengeOpenBlockedByQuiz`, LessonView.tsx:687-689: "uma segunda régua
 * para a mesma pergunta é como um gate volta a divergir do outro na onda
 * seguinte") — e, se divergisse, faria o destrave FALHAR em silêncio: o pior
 * modo de falha para o pedido do dono (o aluno passou no desafio e a aula
 * seguinte continua trancada, sem nada na tela explicando por quê). A
 * cláusula de quiz segue valendo onde sempre valeu: no botão "Concluir aula"
 * (`lessonFinishBlock`), INTOCADO.
 *
 * O GATE SEQUENCIAL é o mesmo do `track:lesson-done` (`lessonIsLocked`): aula
 * trancada NÃO grava — passar um desafio de aula trancada não pode destravar
 * a seguinte por cima da ordem.
 *
 * A TRILHA JÁ CARREGADA VEM DO CHAMADOR (parâmetro `track`): produção a obtém
 * com `loadTrackOrError` (cache de conteúdo) e o stub E2E com `loadTrack` do
 * diretório fixture. Este serviço NÃO carrega trilha nem toca no cache de
 * PAYLOAD — `bumpProgressEpoch()` e `prefetchAfterTrackLessonDone(...)`
 * continuam sendo manutenção de cache de CADA LADO e ficam nos chamadores (o
 * stub E2E não tem cache de payload, então não bumpa nada). Aqui só se grava.
 *
 * SILÊNCIO POR CONTRATO: falha em qualquer passo (aula ilegível, leitura de
 * progresso, gravação) NÃO vira erro do submit — o aluno recebe o veredito
 * dele e, no pior caso, conclui a aula pelo botão de sempre. É o chamador que
 * captura; aqui a função devolve `false` (não gravou).
 *
 * @returns true APENAS quando a conclusão foi gravada (é o sinal para o
 * chamador fazer a manutenção de cache do seu lado).
 */
export async function completeLessonOnChallengePass(
  track: LoadedTrack,
  req: { trackSlug: string; lessonId: string; challengeId: string },
  progress: TrackProgressWriter,
): Promise<boolean> {
  // (a) aula inexistente na trilha → NÃO grava (silencioso).
  const found = findLessonAnywhere(track, req.lessonId);
  if (!found) return false;
  // (b) o MESMO gate de trava do `track:lesson-done`.
  if (await lessonIsLocked(track, req.trackSlug, req.lessonId, progress)) return false;
  // (c) todos os desafios da aula aprovados, contando o que acabou de passar.
  const resumos = await buildChallengeSummaries(req.trackSlug, found.lesson, progress, track);
  if (!lessonChallengesAllPassed(resumos, req.challengeId)) return false;
  // (d) a MESMA gravação do `track:lesson-done` — para que o `track:get` /
  // `track:lesson` seguintes já vejam a aula seguinte destravada.
  await progress.markTrackLessonDone(req.trackSlug, req.lessonId);
  return true;
}

/**
 * Resolve a especificação de UM desafio (aula, proficiência ou módulo — ADITIVO
 * rodada 9), incluindo desafios REGENERADOS (source 'generated'). null quando
 * não existe.
 */
export async function resolveChallengeSpec(
  track: LoadedTrack,
  target: 'lesson' | 'proficiency' | 'module',
  lessonId: string | undefined,
  challengeId: string | undefined,
  repo: TrackProgressLike,
  moduleSlug?: string,
): Promise<TrackChallengeSpec | null> {
  let source: TrackChallengeSource | null = null;
  let baseMinFirstStar = DEFAULT_MIN_FIRST_STAR_MS;

  if (target === 'proficiency') {
    if (!track.proficiency || !challengeId || challengeId !== track.proficiency.slug) return null;
    source = track.proficiency;
    baseMinFirstStar = PROFICIENCY_MIN_FIRST_STAR_MS;
  } else if (target === 'module') {
    // ADITIVO (rodada 9): desafio do MÓDULO (fim do módulo) — o slug precisa
    // bater com o declarado no module.json (mesmo padrão da proficiência).
    const mod = track.modules.find((m) => m.meta.slug === moduleSlug);
    if (!mod || !mod.challenge || !challengeId || challengeId !== mod.challenge.slug) return null;
    source = mod.challenge;
  } else {
    if (!lessonId) return null;
    // desafio da trilha?
    for (const mod of track.modules) {
      const lesson = mod.lessons.find((l) => l.meta.slug === lessonId);
      if (!lesson) continue;
      source = findChallenge(lesson, challengeId ?? '');
      if (source) break;
    }
    // desafio regenerado do aluno?
    if (!source && challengeId) {
      const generated = await repo.listGeneratedChallenges(track.root.slug, lessonId);
      const g = generated.find((x) => x.challengeId === challengeId);
      if (g) {
        const attempts = await repo.getAttemptsForChallenge(g.challengeId);
        const sum = summarizeAttempts(attempts);
        return {
          slug: g.challengeId,
          title: g.challengeId,
          concept: 'gerado',
          difficulty: 2,
          statement: g.statement,
          starterCode: g.starterCode,
          expectedTestCount: g.expectedTestCount,
          minFirstStarMs: DEFAULT_MIN_FIRST_STAR_MS,
          timeLimitMs: timeLimitForDifficultyMs(2),
          source: 'generated',
          lastVerdict: sum.lastVerdict,
          stars: sum.stars,
          failedCount: sum.failedCount,
        };
      }
      return null;
    }
  }

  if (!source) return null;
  const attempts = await repo.getAttemptsForChallenge(source.slug);
  const sum = summarizeAttempts(attempts);
  return {
    slug: source.slug,
    title: source.title,
    concept: source.concept,
    difficulty: source.difficulty,
    statement: source.statement,
    // ADITIVO (rodada 9): multi-arquivo — os STARTERS por arquivo vão no spec
    // (nunca as soluções); o starterCode único carrega o do PRIMEIRO arquivo
    // (fallback — a UI usa `files` quando presente).
    files: source.files?.map((f) => ({ path: f.path, starterCode: f.starterCode })),
    starterCode: source.files && source.files.length > 0 ? (source.files[0].starterCode ?? '') : (source.starterCode ?? ''),
    expectedTestCount: source.expectedTestCount,
    minFirstStarMs: source.minFirstStarMs ?? baseMinFirstStar,
    timeLimitMs: timeLimitForDifficultyMs(source.difficulty),
    source: 'track',
    lastVerdict: sum.lastVerdict,
    stars: sum.stars,
    failedCount: sum.failedCount,
  };
}

/** Aula pelo slug em QUALQUER módulo (para o tutor abrir pré-requisito). */
export function findLessonInTrack(track: LoadedTrack, lessonSlug: string): { moduleSlug: string; lesson: LoadedLesson } | null {
  for (const mod of track.modules) {
    const lesson = mod.lessons.find((l) => l.meta.slug === lessonSlug);
    if (lesson) return { moduleSlug: mod.meta.slug, lesson };
  }
  return null;
}
