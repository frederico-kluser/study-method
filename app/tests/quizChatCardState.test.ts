/**
 * tests/quizChatCardState.test.ts — o MODELO PURO do card do quiz na conversa
 * (linha de estado + ações de resposta), sem jsdom.
 *
 * `src/components/quiz/quizChatCardState.ts` nasceu da extração state/view do
 * `QuizChatCard`: as DUAS decisões que o JSX tomava — o que a linha de estado
 * diz e quais botões de resposta existem — passaram a ser funções puras. Este
 * arquivo mede essas decisões diretamente (o desenho em si é medido por SSR em
 * tests/quizOverlayRender.test.ts e pelas guardas de fonte de
 * tests/quizOverlayWiring.test.ts / tests/quizStalledExit.test.ts).
 *
 * O que está em jogo (defeitos que cada caso impede de voltar):
 *   - o estado 'aguardando-vez' tem texto PRÓPRIO e honesto (não cai no
 *     "explicando"/"gerando" genérico);
 *   - o CTA "Responder" só existe em `aguardando` E fora da tela — com o quiz
 *     sobre a tela não há dois caminhos para o mesmo gesto, e com o ciclo em
 *     andamento não há botão morto;
 *   - as saídas do ciclo travado (`onRetry`/`onReopen`) aparecem SÓ quando o
 *     prop existe — um "reabrir" sempre visível seria um botão de pular o quiz.
 *
 * Reprodução: `bash tools/t.sh tests/quizChatCardState.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  quizChatActions,
  quizChatStatusKey,
} from '../src/components/quiz/quizChatCardState';
import type { QuizOverlayStatus } from '../src/components/quiz/quizOverlayContent';

const STATUS: readonly QuizOverlayStatus[] = [
  'aguardando',
  'aguardando-vez',
  'explicando',
  'gerando',
  'indisponivel',
  'dominado',
];

describe('quizChatStatusKey — o que a linha de estado DIZ', () => {
  it('sobre a tela, o texto é o mesmo para qualquer status (o overlay manda)', () => {
    for (const status of STATUS) {
      assert.equal(
        quizChatStatusKey(status, true),
        'lesson.quizChatOnScreen',
        `com onScreen=true o status ${status} não pode mudar o texto`,
      );
    }
  });

  it('cada status do ciclo tem a sua chave, sem sobreposição', () => {
    const esperado: Record<QuizOverlayStatus, string> = {
      'aguardando': 'lesson.quizChatWaiting',
      'aguardando-vez': 'lesson.quizChatQueued',
      'explicando': 'lesson.quizChatExplaining',
      'gerando': 'lesson.quizChatGenerating',
      'indisponivel': 'lesson.quizChatUnavailable',
      'dominado': 'lesson.quizChatMastered',
    };
    for (const status of STATUS) {
      assert.equal(quizChatStatusKey(status, false), esperado[status], `status ${status}`);
    }
    // Nenhuma chave se repete: dois estados com o mesmo texto seriam
    // indistinguíveis para o aluno (e para o leitor de tela).
    const chaves = STATUS.map((s) => quizChatStatusKey(s, false));
    assert.equal(new Set(chaves).size, chaves.length, 'as chaves são todas distintas');
  });

  it("'aguardando-vez' é honesto: é a fila, não um trabalho em curso", () => {
    assert.equal(quizChatStatusKey('aguardando-vez', false), 'lesson.quizChatQueued');
    assert.notEqual(
      quizChatStatusKey('aguardando-vez', false),
      quizChatStatusKey('explicando', false),
      'esperar não é explicar',
    );
    assert.notEqual(
      quizChatStatusKey('aguardando-vez', false),
      quizChatStatusKey('gerando', false),
      'esperar não é gerar',
    );
  });
});

describe('quizChatActions — as ações de resposta que o card desenha', () => {
  const semAcoes = { onRetry: null, onReopen: null };
  const acao = (): void => {};

  it('o CTA "Responder" existe só em `aguardando` E fora da tela', () => {
    for (const status of STATUS) {
      const esperado = status === 'aguardando';
      assert.equal(
        quizChatActions({ status, onScreen: false, ...semAcoes }).canOpen,
        esperado,
        `status ${status} fora da tela`,
      );
      assert.equal(
        quizChatActions({ status, onScreen: true, ...semAcoes }).canOpen,
        false,
        `status ${status} sobre a tela: quem abre é o gesto, e ele já aconteceu`,
      );
    }
  });

  it('as saídas do ciclo travado seguem a presença dos props', () => {
    const soRetry = quizChatActions({ status: 'indisponivel', onScreen: false, onRetry: acao, onReopen: null });
    assert.equal(soRetry.showRetry, true);
    assert.equal(soRetry.showReopen, false);
    assert.equal(soRetry.showActions, true, 'a linha de ações existe com uma saída só');

    const soReopen = quizChatActions({ status: 'indisponivel', onScreen: false, onRetry: null, onReopen: acao });
    assert.equal(soReopen.showRetry, false);
    assert.equal(soReopen.showReopen, true);
    assert.equal(soReopen.showActions, true);

    const nenhuma = quizChatActions({ status: 'aguardando', onScreen: false, ...semAcoes });
    assert.equal(nenhuma.showActions, false, 'sem props não há linha de ações');

    const asDuas = quizChatActions({ status: 'indisponivel', onScreen: true, onRetry: acao, onReopen: acao });
    assert.equal(asDuas.showRetry, true);
    assert.equal(asDuas.showReopen, true);
    assert.equal(asDuas.showActions, true);
  });

  it('as ações nunca dependem do status: a presença é só dos props (a regra do dono)', () => {
    for (const status of STATUS) {
      const acoes = quizChatActions({ status, onScreen: false, onRetry: acao, onReopen: acao });
      assert.equal(acoes.showRetry, true, `status ${status}`);
      assert.equal(acoes.showReopen, true, `status ${status}`);
    }
  });
});
