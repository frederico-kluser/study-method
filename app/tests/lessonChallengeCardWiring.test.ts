/**
 * tests/lessonChallengeCardWiring.test.ts — COMPLEMENTO de
 * tests/lessonChallengeCard.test.ts (onda1-card-desafio-inicial): a
 * LIGAÇÃO do card do desafio na abertura da aula — o que os 8 casos do
 * módulo PURO não provam.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O CONTRATO (da sub-tarefa, não do diff) — o que este arquivo trava:
 * ══════════════════════════════════════════════════════════════════════════
 *   BLOCO 1 — O card vive EXCLUSIVAMENTE no ramo de histórico vazio do chat
 *     (`chat.history.length === 0 ? (...) : (...)`): nasce na verade da
 *     bolha `lesson.chatStart` + "Começar a aula" (ABAIXO dela, dentro do
 *     MESMO Box da abertura) e NÃO aparece no ramo das bolhas (histórico
 *     presente). Exatamente UMA renderização no arquivo inteiro.
 *   BLOCO 2 — A decisão de render é do módulo PURO: `cardDecision.show &&
 *     cardDecision.challenge`, alimentado por UM useMemo que chama
 *     `lessonChallengeCard({ challenges: lesson?.challenges ?? [] })` — o
 *     `?? []` é o fail-closed da aula sem payload (lesson null → sem card),
 *     e a dependência é `[lesson]` (recalcula com o lastVerdict fresco que
 *     volta da ChallengeView). O estado do desafio destacado vem de
 *     `lessonChallengeCardStatus` — sem régua paralela na view.
 *   BLOCO 3 — `openChallengeFromCard` navega pelo MESMO mecanismo do fluxo
 *     track (`selectTrackChallenge` + `navigateToChallenge`) com target
 *     'lesson' e o desafio que o card destacou, e — a exceção do dono — NÃO
 *     consulta `challengeOpenBlockedByQuiz`. A contraprova está no MESMO
 *     arquivo: `openChallenge` (fluxo normal) CONTINUA com o gate, provando
 *     que o gate do fluxo normal não mudou uma linha.
 *   BLOCO 4 — i18n: as chaves `lesson.challengeIntroCard*` existem em pt-BR
 *     E en, com o MESMO conjunto de chaves nos dois (paridade), valores não
 *     vazios, e toda chave `challengeIntroCard*` usada na view existe nos
 *     dois locales. As chaves REAPROVEITADAS pelo card
 *     (difficulty / challengeFailedCount / challengeUntried) também.
 *   BLOCO 5 — unidade complementar do módulo puro (ramos que os 8 casos do
 *     irmão não cobrem): pendências NÃO-passadas antes de não-tentadas na
 *     ordem editorial; "passed" vence o histórico de falhas
 *     (failedCount > 0 não mantém o card); o desafio destacado é um SUMÁRIO
 *     do payload, não uma cópia recortada.
 *
 * Técnica: guarda de fonte da LessonView sem comentários (a mesma de
 * tests/lessonSidebarWiringCoverage.test.ts — nada de jsdom nesta base) +
 * unidade pura direta. Nenhum arquivo de produção é lido fora de src/.
 *
 * Reprodução: `bash tools/t.sh tests/lessonChallengeCardWiring.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  lessonChallengeCard,
  type LessonChallengeCardInput,
} from '../src/lib/lessonChallengeCard';
import type { TrackChallengeSummaryDto } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW_PATH = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
const PT_PATH = resolve(HERE, '../src/i18n/locales/pt-BR/translation.json');
const EN_PATH = resolve(HERE, '../src/i18n/locales/en/translation.json');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Quantas vezes `needle` aparece em `hay` (literal, sem regex). */
function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

/** O par de índices que FECHA o parêntese/colchete/chave que abre em `openIdx`. */
function balanced(src: string, openIdx: number, open: string, close: string): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i += 1) {
    if (src[i] === open) depth += 1;
    else if (src[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  assert.fail(`o "${open}" que abre em ${openIdx} não fecha`);
}

const VIEW_SRC = readFileSync(VIEW_PATH, 'utf8');
const VIEW = codeOf(VIEW_SRC);

/** A condição de abertura do chat (history vazio) — usada nos Blocos 1–3. */
const COND = 'chat.history.length === 0 ? (';

/** O texto do ramo VERDADEIRO do ternário de abertura (a bolha inicial + card). */
function openingBranch(): string {
  const condAt = VIEW.indexOf(COND);
  const parenAt = condAt + COND.length - 1; // o "(" do ramo verdadeiro
  return VIEW.slice(parenAt, balanced(VIEW, parenAt, '(', ')'));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 1 — O card vive SÓ no ramo de histórico vazio do chat
 * ═════════════════════════════════════════════════════════════════════════ */
describe('BLOCO 1 — o card do desafio só existe na abertura da aula (history vazio)', () => {
  it('a abertura condicional do chat existe e é ÚNICA no arquivo', () => {
    assert.equal(count(VIEW, COND), 1, 'esperava exatamente 1 ternário de history vazio');
  });

  /** O ramo FALSO do ternário (as bolhas da conversa). */
  function falsyBranch(): string {
    const truthyEnd = balanced(VIEW, VIEW.indexOf(COND) + COND.length - 1, '(', ')');
    const elseAt = VIEW.indexOf(': (', truthyEnd);
    assert.notEqual(elseAt, -1, 'o ternário de history vazio não tem ramo falso');
    const elseParen = elseAt + ': '.length;
    return VIEW.slice(elseParen, balanced(VIEW, elseParen, '(', ')'));
  }

  it('o card nasce DENTRO do ramo de history vazio — abaixo da bolha inicial', () => {
    const truthy = openingBranch();
    // a bolha inicial e o botão "Começar a aula" estão no MESMO ramo
    assert.ok(truthy.includes('lesson.chatStart'), 'a bolha inicial deveria estar no ramo vazio');
    assert.ok(truthy.includes('lesson.startButton'), 'o "Começar a aula" deveria estar no ramo vazio');
    // ...e o card também, marcado pelo seu título i18n
    assert.ok(
      truthy.includes('challengeIntroCardTitle'),
      'o card do desafio deveria renderizar no ramo de history vazio',
    );
    // a condição de render é a decisão do módulo puro
    assert.ok(
      truthy.includes('cardDecision.show && cardDecision.challenge'),
      'a renderização deveria ser guardada por cardDecision.show && cardDecision.challenge',
    );
  });

  it('o card NÃO aparece no ramo de histórico presente (bolhas da conversa)', () => {
    const falsy = falsyBranch();
    assert.ok(
      !falsy.includes('challengeIntroCard'),
      'nenhuma chave challengeIntroCard* pode renderizar com histórico presente',
    );
    assert.ok(
      !falsy.includes('cardDecision'),
      'cardDecision não pode ser consumida no ramo das bolhas',
    );
  });

  it('exatamente UMA renderização do card no arquivo inteiro', () => {
    assert.equal(
      count(VIEW, 'challengeIntroCardTitle'),
      1,
      'o título do card não pode ter cópia em outro lugar da view',
    );
    // e a única ocorrência é a do ramo vazio (coerência com os testes acima)
    assert.equal(count(openingBranch(), 'challengeIntroCardTitle'), 1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 2 — A decisão vem do módulo PURO (fail-closed da aula sem payload)
 * ═════════════════════════════════════════════════════════════════════════ */
describe('BLOCO 2 — fiação do módulo puro na view', () => {
  it('UM useMemo chama lessonChallengeCard com o payload da aula (ou [] sem payload)', () => {
    assert.equal(
      count(VIEW, 'lessonChallengeCard({'),
      1,
      'a decisão do card deve ser calculada num único lugar',
    );
    assert.ok(
      VIEW.includes('lessonChallengeCard({ challenges: lesson?.challenges ?? [] })'),
      'a entrada deve ser lesson?.challenges ?? [] (lesson null → sem card, fail-closed)',
    );
    // a dependência do memo é [lesson] — recalcula com o payload re-buscado
    const memoAt = VIEW.indexOf('cardDecision = useMemo(');
    assert.notEqual(memoAt, -1, 'cardDecision deveria ser useMemo');
    const memoEnd = balanced(VIEW, VIEW.indexOf('(', memoAt), '(', ')');
    const memo = VIEW.slice(memoAt, memoEnd);
    assert.ok(/\[\s*lesson\s*\]/.test(memo), `memo deveria depender de [lesson]; recebi: ${memo}`);
  });

  it('o estado do desafio destacado vem de lessonChallengeCardStatus — sem régua paralela', () => {
    // A view consulta o módulo PURO em exatamente 3 pontos: 1 do card
    // original da onda 1 + 2 da onda 2 (CTA "Tentar o mesmo desafio de
    // novo" no estado failed e o chip de status do desafio-tentado-antes-
    // da-aula). A regra pura continua sendo a ÚNICA FONTE da decisão —
    // a anti-regressão aqui é ZERO lógica de status que NÃO venha de
    // `lessonChallengeCardStatus` (nenhuma regex/manual/paralela na view).
    assert.equal(
      count(VIEW, 'lessonChallengeCardStatus('),
      3,
      'o status deve vir do módulo puro lessonChallengeCardStatus, e de nenhum outro lugar (esperado: 1 card + 2 da onda 2)',
    );
  });

  it('o card mostra título, conceito, dificuldade e estado do desafio destacado', () => {
    const branch = openingBranch();
    assert.ok(branch.includes('cardDecision.challenge.title'), 'título do desafio no card');
    assert.ok(branch.includes('cardDecision.challenge.concept'), 'conceito do desafio no card');
    assert.ok(
      branch.includes('lesson.difficulty') && branch.includes('cardDecision.challenge.difficulty'),
      'dificuldade do desafio no card',
    );
    assert.ok(
      branch.includes('lesson.challengeUntried') &&
        branch.includes('lesson.challengeFailedCount'),
      'estado (nunca tentado / falhas) do desafio no card',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 3 — A navegação do card: mesmo mecanismo, SEM o gate do quiz
 * ═════════════════════════════════════════════════════════════════════════ */
describe('BLOCO 3 — openChallengeFromCard: caminho do fluxo track sem o gate', () => {
  /** O corpo do useCallback cuja declaração começa em `declIdx`. */
  function callbackBody(declIdx: number): string {
    const arrowAt = VIEW.indexOf('=>', declIdx);
    assert.notEqual(arrowAt, -1, 'useCallback sem arrow function');
    const bodyAt = VIEW.indexOf('{', arrowAt);
    const bodyEnd = balanced(VIEW, bodyAt, '{', '}');
    return VIEW.slice(bodyAt, bodyEnd + 1);
  }

  const cardDeclAt = VIEW.indexOf('const openChallengeFromCard = useCallback(');
  const normalDeclAt = VIEW.indexOf('const openChallenge = useCallback(');

  it('openChallengeFromCard existe e é o ÚNICO handler do botão do card', () => {
    assert.notEqual(cardDeclAt, -1, 'openChallengeFromCard deveria existir');
    assert.equal(
      count(VIEW, 'openChallengeFromCard'),
      2,
      'esperava declaração + 1 uso (o onClick do card)',
    );
    const truthy = openingBranch();
    assert.ok(
      truthy.includes('onClick={() => openChallengeFromCard(cardDecision.challenge!)}'),
      'o botão do card deve chamar openChallengeFromCard com o desafio destacado',
    );
  });

  it('navega pelo MESMO mecanismo do fluxo track (selectTrackChallenge + navigateToChallenge)', () => {
    const body = callbackBody(cardDeclAt);
    assert.ok(body.includes('nav.selectTrackChallenge('), 'deve selecionar o desafio de trilha');
    assert.ok(body.includes('nav.navigateToChallenge()'), 'deve navegar à ChallengeView');
    assert.ok(body.includes("target: 'lesson'"), 'o alvo é o desafio de AULA');
    assert.ok(body.includes('trackSlug: trackLesson.trackSlug'), 'a trilha vem do payload');
    assert.ok(body.includes('lessonId: trackLesson.lessonId'), 'a aula vem do payload');
    assert.ok(body.includes('challengeId: ch.slug'), 'o desafio é o que o card destacou');
    assert.ok(body.includes('title: ch.title'), 'o título vai para o cabeçalho da ChallengeView');
  });

  it('a exceção do dono: NENHUM gate de quiz no caminho do card', () => {
    const body = callbackBody(cardDeclAt);
    assert.equal(
      count(body, 'challengeOpenBlockedByQuiz'),
      0,
      'o card NÃO pode passar por challengeOpenBlockedByQuiz (é a exceção pedida pelo dono)',
    );
  });

  it('CONTRAPROVA: o gate do fluxo NORMAL (openChallenge) continua intacto', () => {
    assert.notEqual(normalDeclAt, -1, 'openChallenge (fluxo normal) deveria existir');
    const body = callbackBody(normalDeclAt);
    assert.ok(
      body.includes('if (challengeOpenBlockedByQuiz(finishBlock)) return;'),
      'a rota normal (popover/cabeçalho) deve continuar gateada pelo quiz',
    );
    assert.ok(body.includes('nav.selectTrackChallenge('), 'mesmo mecanismo de navegação');
    // e o gate continua referenciado no render (botão desabilitado diz o motivo)
    assert.ok(count(VIEW, 'challengeOpenBlockedByQuiz(finishBlock)') >= 3,
      'o gate deve continuar vivo na view (rota normal), não só no card');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 4 — i18n: paridade pt-BR × en das chaves do card
 * ═════════════════════════════════════════════════════════════════════════ */
describe('BLOCO 4 — chaves lesson.challengeIntroCard* em pt-BR e en (paridade)', () => {
  const ptLesson = (JSON.parse(readFileSync(PT_PATH, 'utf8')) as { lesson: Record<string, string> }).lesson;
  const enLesson = (JSON.parse(readFileSync(EN_PATH, 'utf8')) as { lesson: Record<string, string> }).lesson;

  const introKeys = Object.keys(ptLesson).filter((k) => k.startsWith('challengeIntroCard'));

  it('as chaves lesson.challengeIntroCard* existem em pt-BR e en com o MESMO conjunto', () => {
    assert.ok(introKeys.length >= 4, `esperava >=4 chaves de card em pt-BR; achei ${introKeys.length}`);
    for (const key of ['challengeIntroCardTitle', 'challengeIntroCardAria', 'challengeIntroCardHint', 'challengeIntroCardTry']) {
      assert.ok(introKeys.includes(key), `pt-BR deveria ter lesson.${key}`);
    }
    for (const key of introKeys) {
      assert.ok(key in enLesson, `en deveria ter lesson.${key} (paridade)`);
      assert.ok(key in ptLesson, `pt-BR deveria ter lesson.${key}`);
      assert.ok(ptLesson[key].trim().length > 0, `pt-BR: lesson.${key} não pode ser vazio`);
      assert.ok(enLesson[key].trim().length > 0, `en: lesson.${key} não pode ser vazio`);
    }
    const enIntro = Object.keys(enLesson).filter((k) => k.startsWith('challengeIntroCard'));
    assert.deepEqual(
      [...introKeys].sort(),
      [...enIntro].sort(),
      'pt-BR e en devem ter o MESMO conjunto challengeIntroCard*',
    );
  });

  it('toda chave challengeIntroCard* usada na view existe nos dois locales', () => {
    const used = new Set(VIEW_SRC.match(/challengeIntroCard\w+/g) ?? []);
    assert.ok(used.size > 0, 'a view deveria usar chaves challengeIntroCard*');
    for (const key of used) {
      assert.ok(key in ptLesson, `pt-BR: chave usada na view ausente — lesson.${key}`);
      assert.ok(key in enLesson, `en: chave usada na view ausente — lesson.${key}`);
    }
  });

  it('as chaves REAPROVEITADAS pelo card (dificuldade/estado) existem nos dois locales', () => {
    for (const key of ['difficulty', 'challengeUntried', 'challengeFailedCount']) {
      assert.ok(key in ptLesson && key in enLesson, `lesson.${key} deveria existir em pt-BR e en`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 5 — unidade complementar do módulo puro (ramos que o irmão não cobre)
 * ═════════════════════════════════════════════════════════════════════════ */
function summary(overrides: Partial<TrackChallengeSummaryDto> = {}): TrackChallengeSummaryDto {
  return {
    slug: 'ch-1',
    title: 'Desafio 1',
    concept: 'o conceito que o desafio treina',
    difficulty: 2,
    lastVerdict: null,
    stars: 0,
    failedCount: 0,
    generated: false,
    ...overrides,
  };
}

function input(challenges: TrackChallengeSummaryDto[]): LessonChallengeCardInput {
  return { challenges };
}

describe('BLOCO 5 — lessonChallengeCard: bordas complementares', () => {
  it('pendência NÃO-passada antes de não-tentada: o primeiro pendente vence, qualquer que seja o motivo', () => {
    const out = lessonChallengeCard(input([
      summary({ slug: 'falhou-antes', lastVerdict: 'failed', failedCount: 2 }),
      summary({ slug: 'nunca-tentou' }),
    ]));
    assert.equal(out.show, true);
    assert.equal(out.challenge?.slug, 'falhou-antes');
  });

  it('"passed" vence o histórico de falhas: failedCount > 0 não mantém o card de pé', () => {
    const out = lessonChallengeCard(input([
      summary({ lastVerdict: 'passed', failedCount: 3, stars: 2 }),
    ]));
    assert.equal(out.show, false, 'desafio já passado não é pendente, mesmo tendo falhado antes');
    assert.equal(out.challenge, null);
  });

  it('um pendente entre vários passados: o card destaca exatamente ele (converge com o fluxo normal)', () => {
    const alvo = summary({ slug: 'alvo-unico', title: 'O único', concept: 'c', difficulty: 3, lastVerdict: 'timeout', failedCount: 1 });
    const out = lessonChallengeCard(input([
      summary({ slug: 'p1', lastVerdict: 'passed', stars: 3 }),
      alvo,
      summary({ slug: 'p2', lastVerdict: 'passed', stars: 1 }),
    ]));
    assert.equal(out.show, true);
    assert.deepEqual(out.challenge, alvo, 'o destacado é o SUMÁRIO do payload, sem recorte');
  });

  it('sem pendentes e sem desafios têm a MESMA decisão: { show: false, challenge: null }', () => {
    const vazio = lessonChallengeCard(input([]));
    const feitos = lessonChallengeCard(input([
      summary({ slug: 'a', lastVerdict: 'passed', stars: 3 }),
      summary({ slug: 'b', lastVerdict: 'passed', stars: 3 }),
    ]));
    assert.deepEqual(vazio, feitos);
    assert.deepEqual(vazio, { show: false, challenge: null });
  });
});
