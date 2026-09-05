/**
 * tests/e2e/quizFixture.ts — a TRILHA COM QUIZ do harness E2E.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────
 * A fixture que o modo E2E materializa sozinho (`writeFixtureTrack` em
 * `electron/main/services/e2eStubs.ts`, trilha `nodejs-do-zero`) NÃO declara
 * `assertions` em nenhuma aula. `assertions` é o campo — OPCIONAL por contrato
 * — de onde a LessonView tira `lessonAssertions`, e sem ele o ciclo do quiz
 * simplesmente não existe na tela: nenhum overlay, nenhum card, nenhum gate.
 * Ou seja: sem uma aula COM afirmações, o quiz não é observável em e2e.
 *
 * Esta é a aula com afirmações — escrita pelo TESTE, no formato REAL do
 * produto, dentro da raiz que o harness já controla (`E2E_WORKSPACE_ROOT`):
 *
 *     <E2E_WORKSPACE_ROOT>/fixture-tracks/quiz-e2e/…
 *
 * `fixture-tracks/` é exatamente o diretório que o stub passa para
 * `loadAllTracks` (`track:list`) e para `loadTrack` (`track:get`,
 * `track:lesson`). Escrever OUTRA trilha ao lado da do stub é aditivo por
 * construção: `writeFixtureTrack` só reescreve `nodejs-do-zero` e nunca apaga
 * vizinhos, e `listTrackSlugs` aceita qualquer diretório com `track.json`.
 *
 * O QUE ISSO **NÃO** É: não é mock de renderer, não é patch de IPC e não é
 * código de produção alterado. O JSON abaixo passa pelo MESMO
 * `validateLessonSource`/`validateAssertions` que qualquer trilha do disco (uma
 * afirmação malformada aqui derruba o `track:list` com `TrackLoadError` — o
 * teste falha alto, nunca em silêncio). Do carregamento em diante, tudo é
 * produção: loader, `buildTrackLesson`, o renderer e os 4 canais de quiz (que
 * no modo E2E reusam o SERVIÇO REAL de remediação com um `chat` fixture).
 *
 * ─── POR QUE ESTA AULA TEM ESTA FORMA ─────────────────────────────────────
 * DUAS seções de teoria e UMA afirmação em CADA uma, e ZERO desafios:
 *   - a afirmação da seção 1 sobe o quiz logo no "Começar aula" (o overlay é
 *     observável no primeiro gesto) e trava o "Próximo" — o gate de seção;
 *   - a afirmação da seção 2 aparece quando a teoria ACABA (`done: true` do
 *     tutor stub), então quem trava é o "Concluir aula" — o gate de aula;
 *   - sem desafios, `lessonFinishBlock` só pode devolver 'quiz': o destravar
 *     do "Concluir aula" prova o gate DO QUIZ, e não o dos desafios.
 *
 * A RESPOSTA CERTA DA PRIMEIRA AFIRMAÇÃO ESTÁ NO ÍNDICE 2, de propósito: um
 * vazamento visual ("a certa nasce verde/contained/com ✓" — o bug que a onda
 * 10 matou) só é detectável quando a certa NÃO é a primeira alternativa. Se
 * ela fosse a de índice 0, um teste que comparasse as quatro entre si passaria
 * mesmo com a primeira destacada por acidente de ordem.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Slug/diretório da trilha (o mesmo nome vira pasta em fixture-tracks/). */
export const QUIZ_TRACK_SLUG = 'quiz-e2e';
/** Título da trilha — é o texto do cartão na Home. */
export const QUIZ_TRACK_TITLE = 'Trilha do Quiz (E2E)';
/** Título da aula — é o texto do item na aba Trilha e o heading do chat. */
export const QUIZ_LESSON_TITLE = 'Aula com quiz (E2E)';

/** Seção 1 (a que o "Começar aula" apresenta) e a afirmação ancorada nela. */
export const SECTION_ONE = {
  id: 'secao-um',
  title: 'Dobro',
  markdown: 'A função dobro recebe um número e devolve esse número vezes dois.',
} as const;

/** Seção 2 (a última — apresentá-la fecha a teoria: `done: true`). */
export const SECTION_TWO = {
  id: 'secao-dois',
  title: 'Sem efeito',
  markdown: 'Chamar dobro não muda o número que foi passado para ela.',
} as const;

/**
 * A afirmação da SEÇÃO 1. `options` são únicas e a certa é a de ÍNDICE 2 —
 * ver o cabeçalho (um vazamento visual na primeira alternativa passaria
 * despercebido).
 */
export const ASSERTION_ONE = {
  id: 'dobro-devolve-o-numero-vezes-dois',
  sectionId: SECTION_ONE.id,
  statement: 'A função dobro devolve o número recebido multiplicado por dois.',
  question: 'O que dobro(4) devolve?',
  options: ['dobro(4) devolve 2', 'dobro(4) devolve 6', 'dobro(4) devolve 8', 'dobro(4) devolve 44'],
  answerIndex: 2,
  feedback: 'dobro(n) multiplica n por dois, então dobro(4) devolve 8.',
  optionRationales: [
    'Esta alternativa divide por dois em vez de multiplicar.',
    'Esta alternativa soma dois em vez de multiplicar por dois.',
    'Esta é a que a seção demonstra: 4 vezes dois.',
    'Esta alternativa repete o algarismo em vez de multiplicar.',
  ],
} as const;

/** A afirmação da SEÇÃO 2 (a última) — a que trava o "Concluir aula". */
export const ASSERTION_TWO = {
  id: 'dobro-nao-altera-o-numero',
  sectionId: SECTION_TWO.id,
  statement: 'Chamar dobro não altera o número que foi passado.',
  question: 'Depois de dobro(5), quanto vale o número 5?',
  options: ['Continua 5', 'Passa a valer 10', 'Passa a valer 0', 'Passa a valer 25'],
  answerIndex: 0,
  feedback: 'dobro devolve um valor novo; o número passado continua 5.',
  optionRationales: [
    'Esta é a que a seção demonstra: o número passado não muda.',
    'Esta alternativa confunde o valor devolvido com o valor passado.',
    'Esta alternativa supõe que a função apaga o número.',
    'Esta alternativa supõe que a função eleva o número ao quadrado.',
  ],
} as const;

/** O ÍNDICE de uma alternativa ERRADA (a primeira que não é a certa) — o clique
 *  que abre o ciclo de remediação. Devolve o índice, e não o texto, porque é o
 *  índice que monta o nome acessível ("Opção N de 4: …") no spec. */
export function wrongOptionIndex(a: typeof ASSERTION_ONE | typeof ASSERTION_TWO): number {
  const i = a.options.findIndex((_o, idx) => idx !== a.answerIndex);
  // `options` tem EXATAMENTE 4 itens (o validador do produto exige), então
  // existe sempre uma errada; o throw é a guarda muda contra uma edição futura
  // que quebrasse a fixture — melhor falhar aqui que clicar em `undefined`.
  if (i < 0) throw new Error('fixture inválida: afirmação sem alternativa errada');
  return i;
}

/**
 * A chave canônica do estado do quiz (`quizKeyFor` do renderer:
 * `sectionId::assertionId`). É ela que viaja como `sectionKey` nos 4 canais, e
 * é ela que aparece DENTRO do texto fixture do quiz remediador do stub
 * (`e2eRemedialDraft`) — por isso o teste precisa saber montá-la.
 */
export function quizKeyOf(a: typeof ASSERTION_ONE | typeof ASSERTION_TWO): string {
  return `${a.sectionId}::${a.id}`;
}

/**
 * Escreve a trilha em `<wsRoot>/fixture-tracks/<slug>/`. Síncrono de propósito:
 * roda no `beforeEach` do spec, ANTES do `launchApp` — quando o app sobe, o
 * `track:list` já encontra a trilha no disco.
 */
export function writeQuizTrack(wsRoot: string): void {
  const root = path.join(wsRoot, 'fixture-tracks', QUIZ_TRACK_SLUG);
  const moduleDir = path.join(root, 'modules', 'modulo-quiz');
  const lessonDir = path.join(moduleDir, 'lessons', 'aula-quiz');
  fs.mkdirSync(lessonDir, { recursive: true });

  const track = {
    schemaVersion: 1,
    slug: QUIZ_TRACK_SLUG,
    title: QUIZ_TRACK_TITLE,
    description: 'Trilha fixture do harness E2E com QUIZ (sem rede/LLM).',
    language: 'pt-BR',
    domain: 'programming',
    modules: ['modulo-quiz'],
  };
  const moduleMeta = {
    schemaVersion: 1,
    slug: 'modulo-quiz',
    title: 'Módulo do Quiz (E2E)',
    order: 1,
    lessons: ['aula-quiz'],
  };
  const lesson = {
    schemaVersion: 1,
    slug: 'aula-quiz',
    title: QUIZ_LESSON_TITLE,
    summary: 'Aula fixture do harness E2E com afirmações (quiz).',
    difficulty: 1,
    concepts: ['dobro'],
    prerequisites: [],
    theory: [
      { id: SECTION_ONE.id, title: SECTION_ONE.title, markdown: SECTION_ONE.markdown },
      { id: SECTION_TWO.id, title: SECTION_TWO.title, markdown: SECTION_TWO.markdown },
    ],
    assertions: [ASSERTION_ONE, ASSERTION_TWO],
    sources: [],
    // ZERO desafios: com a lista vazia, `lessonFinishBlock` só pode devolver
    // 'quiz' — o destravar do "Concluir aula" prova o gate DO QUIZ.
    challenges: [],
  };

  fs.writeFileSync(path.join(root, 'track.json'), JSON.stringify(track, null, 2), 'utf8');
  fs.writeFileSync(path.join(moduleDir, 'module.json'), JSON.stringify(moduleMeta, null, 2), 'utf8');
  fs.writeFileSync(path.join(lessonDir, 'lesson.json'), JSON.stringify(lesson, null, 2), 'utf8');
}
