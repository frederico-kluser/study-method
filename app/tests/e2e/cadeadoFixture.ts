/**
 * tests/e2e/cadeadoFixture.ts — a TRILHA DE DUAS PORTAS do harness E2E
 * (onda11-cadeado).
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────
 * A pergunta desta onda é uma só: *concluir a aula 1 abre o cadeado da aula 2?*
 * Para observá-la é preciso CONCLUIR uma aula, e na trilha que o stub
 * materializa sozinho (`nodejs-do-zero`, em electron/main/services/e2eStubs.ts)
 * a aula 1 tem um DESAFIO — e o gate de conclusão exige o desafio passado.
 * Isso amarraria a spec do cadeado a um defeito de OUTRA tela: o
 * `TrackChallengePanel` grava 'abandoned' POR CIMA do 'passed' assim que o
 * veredito chega (o cleanup do efeito de abandono roda na troca de `concluded`
 * e só protege o 'failed'), então "Concluir aula" nunca habilita numa aula com
 * desafio. Esse defeito está reportado à parte, com evidência; a spec do
 * cadeado não deve morrer junto com ele.
 *
 * Esta trilha é o mínimo que responde à pergunta: DUAS aulas, a segunda com
 * `prerequisites: ['porta-1']`, a primeira SEM desafios e SEM afirmações — o
 * único gate de conclusão dela é ler a teoria. O que sobra na tela é
 * exatamente o cadeado.
 *
 * ─── POR QUE ISTO É ADITIVO ───────────────────────────────────────────────
 * `fixture-tracks/` é o diretório que o stub passa para `loadAllTracks`
 * (`track:list`) e `loadTrack` (`track:get`, `track:lesson`); `writeFixtureTrack`
 * só reescreve `nodejs-do-zero` e nunca apaga vizinhos. Escrever OUTRA trilha
 * ao lado é o mesmo precedente de `tests/e2e/quizFixture.ts`. O JSON abaixo
 * passa pelo MESMO validador de qualquer trilha do disco: uma aula malformada
 * aqui derruba o `track:list` (o teste falha alto, nunca em silêncio). Do
 * carregamento em diante tudo é produção — loader, `computeUnlockStates`,
 * `buildTrackDetail`, o renderer.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Slug/diretório da trilha (o mesmo nome vira pasta em fixture-tracks/). */
export const LOCK_TRACK_SLUG = 'cadeado-e2e';
/** Título da trilha — é o texto do cartão na Home e o heading da Trilha. */
export const LOCK_TRACK_TITLE = 'Trilha do Cadeado (E2E)';
/** A aula que o aluno FAZ (sem desafio, sem quiz: conclui só de ler). */
export const LESSON_ONE_TITLE = 'Primeira porta (E2E)';
/** A aula que NASCE TRAVADA e precisa abrir quando a primeira conclui. */
export const LESSON_TWO_TITLE = 'Segunda porta (E2E)';

/** As duas seções de teoria da primeira aula (duas telas de "Próximo"). */
const SECTION_ONE = {
  id: 'porta-um',
  title: 'A primeira porta',
  markdown: 'Uma aula termina quando o aluno chega ao fim da teoria dela.',
};
const SECTION_TWO = {
  id: 'porta-dois',
  title: 'A porta seguinte',
  markdown: 'Concluir uma aula é o que abre o cadeado da aula seguinte.',
};

/**
 * Escreve a trilha em `<wsRoot>/fixture-tracks/cadeado-e2e/`. SÍNCRONO de
 * propósito: roda no `beforeEach` do spec, ANTES do `launchApp` — quando o app
 * sobe, o `track:list` do primeiro render já a encontra no disco.
 */
export function writeLockTrack(wsRoot: string): void {
  const root = path.join(wsRoot, 'fixture-tracks', LOCK_TRACK_SLUG);
  const moduleDir = path.join(root, 'modules', 'modulo-cadeado');
  const lessonsDir = path.join(moduleDir, 'lessons');
  fs.mkdirSync(path.join(lessonsDir, 'porta-1'), { recursive: true });
  fs.mkdirSync(path.join(lessonsDir, 'porta-2'), { recursive: true });

  const track = {
    schemaVersion: 1,
    slug: LOCK_TRACK_SLUG,
    title: LOCK_TRACK_TITLE,
    description: 'Trilha fixture do harness E2E com DUAS aulas em sequência.',
    language: 'pt-BR',
    domain: 'programming',
    modules: ['modulo-cadeado'],
  };
  const moduleMeta = {
    schemaVersion: 1,
    slug: 'modulo-cadeado',
    title: 'Módulo do Cadeado (E2E)',
    order: 1,
    lessons: ['porta-1', 'porta-2'],
  };
  const porta1 = {
    schemaVersion: 1,
    slug: 'porta-1',
    title: LESSON_ONE_TITLE,
    summary: 'A aula que o aluno conclui para destravar a seguinte.',
    difficulty: 1,
    concepts: ['sequencia'],
    prerequisites: [],
    theory: [
      { id: SECTION_ONE.id, title: SECTION_ONE.title, markdown: SECTION_ONE.markdown },
      { id: SECTION_TWO.id, title: SECTION_TWO.title, markdown: SECTION_TWO.markdown },
    ],
    sources: [],
    // ZERO desafios e ZERO afirmações: o único gate de conclusão é a teoria.
    challenges: [],
  };
  const porta2 = {
    schemaVersion: 1,
    slug: 'porta-2',
    title: LESSON_TWO_TITLE,
    summary: 'A aula que começa TRAVADA — o cadeado desta onda.',
    difficulty: 1,
    concepts: ['sequencia'],
    prerequisites: ['porta-1'],
    theory: [{ id: 'porta-tres', title: 'Depois da porta', markdown: 'Você chegou à segunda aula.' }],
    sources: [],
    challenges: [],
  };

  fs.writeFileSync(path.join(root, 'track.json'), JSON.stringify(track, null, 2), 'utf8');
  fs.writeFileSync(path.join(moduleDir, 'module.json'), JSON.stringify(moduleMeta, null, 2), 'utf8');
  fs.writeFileSync(path.join(lessonsDir, 'porta-1', 'lesson.json'), JSON.stringify(porta1, null, 2), 'utf8');
  fs.writeFileSync(path.join(lessonsDir, 'porta-2', 'lesson.json'), JSON.stringify(porta2, null, 2), 'utf8');
}
