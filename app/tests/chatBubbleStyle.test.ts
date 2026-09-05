/**
 * tests/chatBubbleStyle.test.ts — TOM e AGRUPAMENTO do balão de chat.
 *
 * DEFEITO 1 (tom): o tutor falava por dois balões radicalmente diferentes —
 * papel branco em `message`, ROXO CHAPADO em `reply` — e a cor passava a
 * significar "que turno é este" em vez de "quem falou". O tom agora é uma
 * função PURA da mensagem, e é ele que escolhe superfície, borda e sombra
 * (chatSurfaces.ts): todo balão do tutor tem a MESMA superfície de leitura, e
 * a identidade roxa da `reply` vive no ACENTO.
 *
 * DEFEITO 2 (agrupamento): o arquivo do chat dizia seguir o padrão iMessage e
 * repetia avatar + nome + hora em cinco bolhas seguidas do tutor.
 *
 * O QUE ESTA SUÍTE TRAVA, e por que a regra é essa: o agrupamento NÃO usa
 * limiar de tempo. Um "agrupar a menos de N minutos" exigiria um N sem origem,
 * e este repositório não aceita número sem verificação (CONTRIBUTING.md).
 * A regra usada é derivada do que a UI JÁ MOSTRA: agrupa quando o cabeçalho
 * não diria nada novo — mesmo autor, mesmo tom, e mesmo rótulo HH:MM de
 * `formatChatTime`. Os testes abaixo provam os dois lados: 59 s dentro do mesmo
 * minuto agrupam; 1 s que atravessa a virada do minuto NÃO agrupa.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { chatBubbleTone, groupsWithPrevious, isUserTone } from '../src/lib/chatBubbleStyle';
import { formatChatTime, type TutorChatMessage } from '../src/lib/trackLessonState';

const LOCALE = 'pt-BR';

function msg(p: Partial<TutorChatMessage> & { ts: number }): TutorChatMessage {
  return { role: 'assistant', content: 'x', kind: 'message', ...p };
}

/** Um instante ancorado no minuto (segundo 0) — determinismo, sem relógio. */
function at(minute: number, second: number): number {
  return Date.UTC(2026, 0, 1, 12, minute, second);
}

describe('chatBubbleTone — o tom é do AUTOR e do ESTADO, nunca do turno', () => {
  it('mensagem do aluno → user', () => {
    assert.equal(chatBubbleTone(msg({ ts: 0, role: 'user', kind: undefined })), 'user');
  });

  it('teoria e pergunta semeada → tutor (a MESMA superfície)', () => {
    assert.equal(chatBubbleTone(msg({ ts: 0, kind: 'message' })), 'tutor');
  });

  it('resposta a uma dúvida → reply (identidade própria, mesma superfície)', () => {
    assert.equal(chatBubbleTone(msg({ ts: 0, kind: 'reply' })), 'reply');
  });

  it('review COM errorFor → error; review SEM errorFor → approved', () => {
    assert.equal(chatBubbleTone(msg({ ts: 0, kind: 'review', errorFor: 'c1' })), 'error');
    assert.equal(chatBubbleTone(msg({ ts: 0, kind: 'review' })), 'approved');
  });

  it('só o tom `user` ancora à direita', () => {
    assert.equal(isUserTone('user'), true);
    for (const tone of ['tutor', 'reply', 'error', 'approved'] as const) {
      assert.equal(isUserTone(tone), false, tone);
    }
  });
});

describe('groupsWithPrevious — o cabeçalho só reaparece quando diria algo novo', () => {
  it('primeira bolha da conversa nunca agrupa', () => {
    assert.equal(groupsWithPrevious(msg({ ts: at(0, 0) }), undefined, LOCALE), false);
  });

  it('mesmo autor, mesmo tom, MESMO minuto → agrupa (59 s de diferença)', () => {
    const a = msg({ ts: at(7, 0) });
    const b = msg({ ts: at(7, 59) });
    assert.equal(formatChatTime(a.ts, LOCALE), formatChatTime(b.ts, LOCALE));
    assert.equal(groupsWithPrevious(b, a, LOCALE), true);
  });

  it('1 s de diferença que ATRAVESSA a virada do minuto → NÃO agrupa', () => {
    const a = msg({ ts: at(7, 59) });
    const b = msg({ ts: at(8, 0) });
    assert.notEqual(formatChatTime(a.ts, LOCALE), formatChatTime(b.ts, LOCALE));
    assert.equal(groupsWithPrevious(b, a, LOCALE), false);
  });

  it('autor diferente nunca agrupa, mesmo no mesmo minuto', () => {
    const aluno = msg({ ts: at(3, 10), role: 'user', kind: undefined });
    const tutor = msg({ ts: at(3, 12) });
    assert.equal(groupsWithPrevious(tutor, aluno, LOCALE), false);
  });

  it('tom diferente do mesmo autor não agrupa (a review não continua a teoria)', () => {
    const teoria = msg({ ts: at(3, 10) });
    const review = msg({ ts: at(3, 12), kind: 'review', errorFor: 'c1' });
    assert.equal(groupsWithPrevious(review, teoria, LOCALE), false);
  });

  it('cinco seções de teoria seguidas no mesmo minuto → 1 cabeçalho, 4 agrupadas', () => {
    const history = [0, 5, 10, 15, 20].map((s) => msg({ ts: at(9, s) }));
    const grouped = history.map((m, i) => groupsWithPrevious(m, history[i - 1], LOCALE));
    assert.deepEqual(grouped, [false, true, true, true, true]);
  });

  it('a regra vale igual em `en` (o rótulo muda, a lógica não)', () => {
    const a = msg({ ts: at(7, 0) });
    const b = msg({ ts: at(7, 59) });
    assert.equal(groupsWithPrevious(b, a, 'en'), true);
    assert.equal(groupsWithPrevious(msg({ ts: at(8, 0) }), b, 'en'), false);
  });
});
