/**
 * tests/sessionState.test.ts — estado de SESSÃO do shell (onda 2 do redesign).
 *
 * Sem jsdom: `src/lib/sessionState.ts` é lógica pura (reducer + normalizadores +
 * derivação do rótulo de fase); só o provider tem JSX, e ele mora em
 * `src/components/sessionState/`. Mesmo desenho de `tests/challengeNav.test.ts`.
 *
 * O que estes testes GUARDAM (e por quê):
 *   1. o quadro superior do shell não pode nascer vazio quando se troca de aba —
 *      é o motivo de o estado ter subido para cima das views;
 *   2. o carimbo de "última atividade" só se move em mudança REAL: rajada de
 *      progresso repetindo a mesma fase não é atividade nova;
 *   3. o reducer é puro — o relógio entra pela ação, nunca por Date.now().
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  clampFraction,
  DEFAULT_SESSION_STATE,
  INITIAL_SESSION,
  isSessionIdle,
  normalizeSubject,
  sessionPhaseLabelKey,
  sessionReducer,
  type SessionPatch,
  type SessionSnapshot,
} from '../src/lib/sessionState';

/** Publica um patch num estado, com o relógio explícito. */
function publish(state: SessionSnapshot, patch: SessionPatch, at: number): SessionSnapshot {
  return sessionReducer(state, { type: 'publish', patch, at });
}

describe('normalizeSubject', () => {
  it('faz trim e transforma vazio/branco em null (nunca guarda string vazia)', () => {
    assert.equal(normalizeSubject('  Ownership em Rust  '), 'Ownership em Rust');
    assert.equal(normalizeSubject(''), null);
    assert.equal(normalizeSubject('   '), null);
    assert.equal(normalizeSubject(null), null);
    assert.equal(normalizeSubject(undefined), null);
  });
});

describe('clampFraction', () => {
  it('prende em 0..1 e trata não-números como 0', () => {
    assert.equal(clampFraction(0.42), 0.42);
    assert.equal(clampFraction(-3), 0);
    assert.equal(clampFraction(9), 1);
    assert.equal(clampFraction(Number.NaN), 0);
    assert.equal(clampFraction(undefined), 0);
    assert.equal(clampFraction(null), 0);
  });
});

describe('sessionReducer — publicação', () => {
  it('estado inicial é sessão vazia, sem carimbo de atividade', () => {
    assert.deepEqual(INITIAL_SESSION, {
      subject: null,
      phase: null,
      status: 'idle',
      fraction: 0,
      lastActivityAt: null,
    });
  });

  it('publicar assunto normaliza e carimba a atividade', () => {
    const s = publish(INITIAL_SESSION, { subject: '  Árvores AVL ' }, 1_000);
    assert.equal(s.subject, 'Árvores AVL');
    assert.equal(s.lastActivityAt, 1_000);
    // O resto do snapshot não é tocado por um patch parcial.
    assert.equal(s.phase, null);
    assert.equal(s.status, 'idle');
  });

  it('patch parcial não apaga o que não veio nele', () => {
    const a = publish(INITIAL_SESSION, { subject: 'Rust', status: 'running' }, 10);
    const b = publish(a, { phase: 'autorando', fraction: 0.4 }, 20);
    assert.equal(b.subject, 'Rust');
    assert.equal(b.status, 'running');
    assert.equal(b.phase, 'autorando');
    assert.equal(b.fraction, 0.4);
    assert.equal(b.lastActivityAt, 20);
  });

  it('`subject: null` LIMPA o assunto (ausência do campo é que significa "não mexa")', () => {
    const a = publish(INITIAL_SESSION, { subject: 'Rust' }, 10);
    const b = publish(a, { status: 'done' }, 20);
    assert.equal(b.subject, 'Rust', 'campo ausente do patch preserva o valor');
    const c = publish(b, { subject: null }, 30);
    assert.equal(c.subject, null);
    assert.equal(c.lastActivityAt, 30);
  });

  it('fração é presa em 0..1 na publicação', () => {
    const s = publish(INITIAL_SESSION, { fraction: 5 }, 1);
    assert.equal(s.fraction, 1);
  });
});

describe('sessionReducer — atividade só em mudança REAL', () => {
  it('republicar o MESMO valor devolve o mesmo objeto e não move o carimbo', () => {
    const a = publish(INITIAL_SESSION, { phase: 'pesquisando', status: 'running' }, 100);
    const b = publish(a, { phase: 'pesquisando', status: 'running' }, 999);
    assert.equal(b, a, 'identidade preservada — o quadro não re-renderiza à toa');
    assert.equal(b.lastActivityAt, 100, 'carimbo não pode virar "último evento recebido"');
  });

  it('assunto republicado com espaços em volta também é no-op (normaliza antes de comparar)', () => {
    const a = publish(INITIAL_SESSION, { subject: 'Rust' }, 100);
    const b = publish(a, { subject: '  Rust  ' }, 999);
    assert.equal(b, a);
    assert.equal(b.lastActivityAt, 100);
  });

  it('patch vazio é no-op', () => {
    const a = publish(INITIAL_SESSION, { subject: 'Rust' }, 100);
    const b = publish(a, {}, 999);
    assert.equal(b, a);
  });

  it('mudar UM campo entre vários repetidos ainda carimba', () => {
    const a = publish(INITIAL_SESSION, { subject: 'Rust', phase: 'autorando', fraction: 0.3 }, 100);
    const b = publish(a, { subject: 'Rust', phase: 'autorando', fraction: 0.6 }, 200);
    assert.notEqual(b, a);
    assert.equal(b.fraction, 0.6);
    assert.equal(b.lastActivityAt, 200);
  });
});

/**
 * O CONTRATO DE `undefined`/`null`, CAMPO A CAMPO.
 *
 * Por que isto é um bloco inteiro e não uma asserção solta: o `tsconfig.json` do
 * RENDERER (quem chama `publishSession`) não liga `strict` nem
 * `exactOptionalPropertyTypes`. Ou seja, `publishSession({ subject: talvezUndefined })`
 * COMPILA. Se `undefined` limpasse, o quadro de estado do shell seria apagado em
 * silêncio no meio de uma aula — e ainda carimbaria "última atividade" por uma
 * mudança que ninguém pediu. A regra tem de ser a MESMA nos quatro campos.
 */
describe('sessionReducer — `undefined` é INERTE nos quatro campos', () => {
  /** Estado com TODOS os campos preenchidos e um carimbo conhecido. */
  const cheio = publish(
    INITIAL_SESSION,
    { subject: 'Rust', phase: 'autorando', status: 'running', fraction: 0.4 },
    100,
  );

  const campos: ReadonlyArray<[string, SessionPatch]> = [
    ['subject', { subject: undefined }],
    ['phase', { phase: undefined }],
    ['status', { status: undefined }],
    ['fraction', { fraction: undefined }],
  ];

  for (const [nome, patch] of campos) {
    it(`\`${nome}: undefined\` preserva o valor anterior e NÃO move lastActivityAt`, () => {
      const depois = publish(cheio, patch, 999);
      assert.deepEqual(
        depois,
        cheio,
        `${nome}: undefined não pode mexer em nenhum campo do snapshot`,
      );
      assert.equal(
        depois.lastActivityAt,
        100,
        `${nome}: undefined não é atividade — o carimbo não pode andar`,
      );
      assert.equal(depois, cheio, `${nome}: sem mudança real o reducer devolve o MESMO objeto`);
    });
  }

  it('patch inteiro de `undefined` (o caso do estado opcional da view) é no-op total', () => {
    const depois = publish(
      cheio,
      { subject: undefined, phase: undefined, status: undefined, fraction: undefined },
      999,
    );
    assert.equal(depois, cheio);
    assert.equal(depois.lastActivityAt, 100);
  });

  it('`undefined` num campo não impede a mudança REAL de outro no mesmo patch', () => {
    const depois = publish(cheio, { subject: undefined, fraction: 0.9 }, 200);
    assert.equal(depois.subject, 'Rust', 'undefined preservou');
    assert.equal(depois.fraction, 0.9, 'o campo real mudou');
    assert.equal(depois.lastActivityAt, 200);
  });

  it('`null` LIMPA — é a forma explícita, e ela carimba a atividade', () => {
    const semAssunto = publish(cheio, { subject: null }, 200);
    assert.equal(semAssunto.subject, null);
    assert.equal(semAssunto.lastActivityAt, 200);

    const semFase = publish(cheio, { phase: null }, 300);
    assert.equal(semFase.phase, null);
    assert.equal(semFase.lastActivityAt, 300);

    // `fraction: null` = "zere" (0 é o VAZIO da fração; não há "desconhecida").
    const semFracao = publish(cheio, { fraction: null }, 400);
    assert.equal(semFracao.fraction, 0);
    assert.equal(semFracao.lastActivityAt, 400);
  });

  it('`status` não tem forma de limpeza: valor fora da união é ignorado como um campo ausente', () => {
    // O cast simula o chamador do RENDERER, que compila sem strict e portanto
    // consegue passar `null` (ou qualquer string) por este campo.
    const comNull = publish(cheio, { status: null } as unknown as SessionPatch, 999);
    assert.equal(comNull, cheio, 'status inválido não entra no snapshot nem carimba');

    const comLixo = publish(cheio, { status: 'cancelado' } as unknown as SessionPatch, 999);
    assert.equal(comLixo, cheio);
    assert.equal(comLixo.status, 'running');

    // Zerar o status é publicar o literal do vazio, explicitamente.
    const ocioso = publish(cheio, { status: 'idle' }, 500);
    assert.equal(ocioso.status, 'idle');
    assert.equal(ocioso.lastActivityAt, 500);
  });
});

describe('sessionReducer — reset', () => {
  it('reset zera tudo mas CARIMBA a atividade (resetar é atividade)', () => {
    const a = publish(INITIAL_SESSION, { subject: 'Rust', phase: 'validando', status: 'done' }, 10);
    const b = sessionReducer(a, { type: 'reset', at: 77 });
    assert.equal(b.subject, null);
    assert.equal(b.phase, null);
    assert.equal(b.status, 'idle');
    assert.equal(b.fraction, 0);
    assert.equal(b.lastActivityAt, 77);
  });
});

describe('sessionPhaseLabelKey — o que o quadro superior mostra', () => {
  it('sem fase publicada não há rótulo (o quadro mostra o texto de ociosidade)', () => {
    assert.equal(sessionPhaseLabelKey(INITIAL_SESSION), null);
  });

  it('fase publicada mas sessão idle ainda não vira rótulo', () => {
    const s = publish(INITIAL_SESSION, { phase: 'autorando' }, 1);
    assert.equal(s.status, 'idle');
    assert.equal(sessionPhaseLabelKey(s), null);
  });

  it('fase + status ativo viram a chave i18n lesson.phase.*', () => {
    const running = publish(INITIAL_SESSION, { phase: 'autorando', status: 'running' }, 1);
    assert.equal(sessionPhaseLabelKey(running), 'lesson.phase.authoring');

    const done = publish(running, { phase: 'concluindo', status: 'done' }, 2);
    assert.equal(sessionPhaseLabelKey(done), 'lesson.phase.done');

    const failed = publish(done, { phase: 'validando', status: 'error' }, 3);
    assert.equal(sessionPhaseLabelKey(failed), 'lesson.phase.validating');
  });

  it('cobre todas as fases do parser de progresso', () => {
    const cases: ReadonlyArray<[NonNullable<SessionPatch['phase']>, string]> = [
      ['pesquisando', 'lesson.phase.research'],
      ['autorando', 'lesson.phase.authoring'],
      ['materializando', 'lesson.phase.materializing'],
      ['validando', 'lesson.phase.validating'],
      ['concluindo', 'lesson.phase.done'],
      // 'gerando' é o fallback genérico do parser: aponta para a PRIMEIRA etapa.
      ['gerando', 'lesson.phase.research'],
    ];
    for (const [phase, expected] of cases) {
      const s = publish(INITIAL_SESSION, { phase, status: 'running' }, 1);
      assert.equal(sessionPhaseLabelKey(s), expected, `fase ${String(phase)}`);
    }
  });
});

describe('isSessionIdle — o quadro em repouso', () => {
  it('sessão nova está em repouso', () => {
    assert.equal(isSessionIdle(INITIAL_SESSION), true);
  });

  it('assunto sozinho JÁ tira do repouso (é o que sobrevive à troca de aba)', () => {
    const s = publish(INITIAL_SESSION, { subject: 'Rust' }, 1);
    assert.equal(isSessionIdle(s), false);
  });

  it('fase ativa sem assunto também tira do repouso', () => {
    const s = publish(INITIAL_SESSION, { phase: 'autorando', status: 'running' }, 1);
    assert.equal(isSessionIdle(s), false);
  });
});

describe('DEFAULT_SESSION_STATE — sem provider o app não quebra', () => {
  it('traz o snapshot vazio e escritas no-op', () => {
    assert.equal(DEFAULT_SESSION_STATE.subject, null);
    assert.equal(DEFAULT_SESSION_STATE.phase, null);
    assert.equal(DEFAULT_SESSION_STATE.status, 'idle');
    assert.equal(DEFAULT_SESSION_STATE.lastActivityAt, null);
    assert.doesNotThrow(() => DEFAULT_SESSION_STATE.publishSession({ subject: 'x' }));
    assert.doesNotThrow(() => DEFAULT_SESSION_STATE.resetSession());
  });
});
