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
  isSessionBusy,
  isSessionIdle,
  lessonBusyReasonFor,
  normalizeSubject,
  sessionBusyLabelKey,
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
      // ONDA2-LOADER-GLOBAL: sem ocupação publicada (o canal nasce vazio).
      busy: null,
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

describe('canal de ocupação `busy` (ONDA2-LOADER-GLOBAL)', () => {
  it('estado inicial não tem ocupação', () => {
    assert.equal(INITIAL_SESSION.busy, null);
  });

  it('publicar ocupação troca a razão e NÃO carimba lastActivityAt (ocupação não é atividade)', () => {
    const base = publish(INITIAL_SESSION, { subject: 'Rust' }, 100);
    const s = publish(base, { busy: { reason: 'responder' } }, 999);
    assert.deepEqual(s.busy, { reason: 'responder' });
    // O carimbo continua sendo o do progresso de aula — o pulso do loader
    // NÃO pode virar "última atividade".
    assert.equal(s.lastActivityAt, 100);
  });

  it('`busy: null` LIMPA (nada em voo) — e também não carimba', () => {
    const base = publish(INITIAL_SESSION, { subject: 'Rust' }, 100);
    const a = publish(base, { busy: { reason: 'digitando' } }, 200);
    assert.equal(a.busy?.reason, 'digitando');
    const s = publish(a, { busy: null }, 999);
    assert.equal(s.busy, null);
    assert.equal(s.lastActivityAt, 100);
  });

  it('`busy: undefined` é INERTE (o compilador do renderer não é strict)', () => {
    // A publicação da ocupação NÃO carimba (decisão do reducer), então o base
    // de referência é o próprio carimbo null de antes dela.
    const base = publish(INITIAL_SESSION, { busy: { reason: 'gerando' } }, 10);
    assert.equal(base.busy?.reason, 'gerando');
    assert.equal(base.lastActivityAt, null, 'ocupar não carimba (decisão do canal)');
    const s = publish(base, { busy: undefined } as SessionPatch, 999);
    assert.equal(s, base, 'identidade preservada e valor intacto');
    assert.equal(s.busy?.reason, 'gerando');
    assert.equal(s.lastActivityAt, null);
  });

  it('republicar a MESMA razão é no-op por identidade (a pílula não pisca)', () => {
    const base = publish(INITIAL_SESSION, { busy: { reason: 'explicando' } }, 10);
    const again = publish(base, { busy: { reason: 'explicando' } }, 999);
    assert.equal(again, base);
  });

  it('valor mal-formado é IGNORADO (fora da união de razões, como `status`)', () => {
    const base = publish(INITIAL_SESSION, { subject: 'Rust' }, 100);
    for (const lixo of [{ reason: 'qualquer' }, { }, 'responder', 42, { reason: null }]) {
      const s = publish(base, { busy: lixo as unknown as SessionPatch['busy'] }, 999);
      assert.equal(s.busy, null, `lixo ${JSON.stringify(lixo)} deve ser ignorado`);
      assert.equal(s.lastActivityAt, 100, 'lixo não carimba atividade');
    }
  });

  it('mudança de ocupação não derruba os outros campos (e vice-versa)', () => {
    const a = publish(INITIAL_SESSION, { subject: 'Rust', phase: 'autorando', status: 'running' }, 10);
    const b = publish(a, { busy: { reason: 'concluindo' } }, 20);
    assert.equal(b.subject, 'Rust');
    assert.equal(b.phase, 'autorando');
    assert.deepEqual(b.busy, { reason: 'concluindo' });
    const c = publish(b, { busy: null }, 30);
    assert.equal(c.busy, null);
    assert.equal(c.subject, 'Rust', 'limpar a ocupação não limpa a aula');
  });

  it('isSessionBusy é o ÚNICO critério do indicador global aparecer/some', () => {
    assert.equal(isSessionBusy(INITIAL_SESSION), false);
    const ocupada = publish(INITIAL_SESSION, { busy: { reason: 'aguardandoVez' } }, 1);
    assert.equal(isSessionBusy(ocupada), true);
    const limpa = publish(ocupada, { busy: null }, 2);
    assert.equal(isSessionBusy(limpa), false);
    // Fase/status/fração NÃO são ocupação (risco 2: badge não é busy).
    const faseAtiva = publish(INITIAL_SESSION, { phase: 'pesquisando', status: 'running' }, 1);
    assert.equal(isSessionBusy(faseAtiva), false);
  });

  it('reset zera o canal de ocupação junto com o resto', () => {
    const ocupada = sessionReducer(publish(INITIAL_SESSION, { subject: 'Rust' }, 1), {
      type: 'publish',
      patch: { busy: { reason: 'responder' } },
      at: 2,
    });
    const reset = sessionReducer(ocupada, { type: 'reset', at: 3 });
    assert.equal(reset.busy, null);
  });
});

describe('lessonBusyReasonFor — a prioridade do QUE está em voo (ONDA2-LOADER-GLOBAL)', () => {
  it('nada em voo devolve null (o indicador global some)', () => {
    assert.equal(
      lessonBusyReasonFor({
        quizStatus: null, busy: false, pendingAction: null, streaming: false, regenerating: false,
      }),
      null,
    );
  });

  it('cobre os estados da FQ11', () => {
    const cases: ReadonlyArray<[
      Parameters<typeof lessonBusyReasonFor>[0],
      ReturnType<typeof lessonBusyReasonFor>,
    ]> = [
      // turno do tutor respondendo
      [{ quizStatus: null, busy: true, pendingAction: 'answer', streaming: false, regenerating: false }, 'responder'],
      // turno determinístico do "Próximo"
      [{ quizStatus: null, busy: true, pendingAction: 'next', streaming: false, regenerating: false }, 'proximaSecao'],
      // digitação de seção/explicação (streamingIds)
      [{ quizStatus: 'aguardando', busy: false, pendingAction: null, streaming: true, regenerating: false }, 'digitando'],
      // ciclo do quiz: explicando o erro (a explicação também digita — vence 'explicando')
      [{ quizStatus: 'explicando', busy: false, pendingAction: null, streaming: true, regenerating: false }, 'explicando'],
      // ciclo do quiz gerando o remediador
      [{ quizStatus: 'gerando', busy: false, pendingAction: null, streaming: false, regenerating: false }, 'gerando'],
      // fila: o ciclo quer rodar mas espera o turno do tutor (a causa do "travou")
      [{ quizStatus: 'aguardando-vez', busy: true, pendingAction: 'answer', streaming: false, regenerating: false }, 'aguardandoVez'],
      // "Concluir aula" gravando (busy sem pendingAction, sem regeneração)
      [{ quizStatus: null, busy: true, pendingAction: null, streaming: false, regenerating: false }, 'concluindo'],
      // FIX DO REVISOR: regeneração de desafio na bolha é busy sem pendingAction
      // — deve ser 'gerando' (o que REALMENTE está em voo), nunca "Concluindo a
      // aula" durante minutos de geração.
      [{ quizStatus: null, busy: true, pendingAction: null, streaming: false, regenerating: true }, 'gerando'],
      // precedência: um turno do tutor em voo vence a regeneração ao lado
      [{ quizStatus: null, busy: true, pendingAction: 'answer', streaming: false, regenerating: true }, 'responder'],
      [{ quizStatus: null, busy: true, pendingAction: 'next', streaming: false, regenerating: true }, 'proximaSecao'],
      // e o ciclo do quiz em cena vence a regeneração (prioridade do ciclo)
      [{ quizStatus: 'explicando', busy: false, pendingAction: null, streaming: false, regenerating: true }, 'explicando'],
    ];
    for (const [input, expected] of cases) {
      assert.equal(lessonBusyReasonFor(input), expected, `caso: ${JSON.stringify(input)}`);
    }
  });

  it('estados INTERATIVOS do quiz não são ocupação (o card espera o aluno)', () => {
    for (const status of ['aguardando', 'dominado', 'indisponivel']) {
      assert.equal(
        lessonBusyReasonFor({
          quizStatus: status, busy: false, pendingAction: null, streaming: false, regenerating: false,
        }),
        null,
        `status ${status} não deve acender o loader global`,
      );
    }
  });

  it('a janela do veredito (1.6s, risco 1) mostra o ESTADO REAL — ou trabalho em voo, ou oculto', () => {
    // Na resposta CERTA o overlay congela em 'aguardando' com busy=false: não
    // há trabalho em voo, e o indicador fica OCULTO (sem spinner redundante
    // que some 1.6s depois). ATENÇÃO (verificação do revisor adversarial):
    // esta "janela oculta" só vale para o caso SEM trabalho — na resposta
    // ERRADA o quizExplain dispara DE VERDADE durante a janela (é um pedido
    // LLM real em voo), então o estado publicado é 'explicando' e o loader
    // global mostra exatamente isso. O estado nunca é inventado: ou é o que
    // está acontecendo, ou não há pílula.
    assert.equal(
      lessonBusyReasonFor({
        quizStatus: 'aguardando', busy: false, pendingAction: null, streaming: false, regenerating: false,
      }),
      null,
    );
  });

  it('a derivação NUNCA lê challengeBadgeCount (risco 2: gating de badge não é busy)', () => {
    // Guarda de contrato: a função pura nem tem o campo na entrada.
    const input: Parameters<typeof lessonBusyReasonFor>[0] = {
      quizStatus: null, busy: false, pendingAction: null, streaming: false, regenerating: false,
    };
    assert.equal('challengeBadgeCount' in input, false);
  });
});

describe('sessionBusyLabelKey — a chave canônica dos DOIS locales', () => {
  it('cada razão vira exatamente a chave lesson.busy.<razão>', () => {
    const cases: ReadonlyArray<[ReturnType<typeof lessonBusyReasonFor> & string, string]> = [
      ['responder', 'lesson.busy.responder'],
      ['proximaSecao', 'lesson.busy.proximaSecao'],
      ['digitando', 'lesson.busy.digitando'],
      ['explicando', 'lesson.busy.explicando'],
      ['gerando', 'lesson.busy.gerando'],
      ['aguardandoVez', 'lesson.busy.aguardandoVez'],
      ['concluindo', 'lesson.busy.concluindo'],
    ];
    for (const [reason, key] of cases) {
      assert.equal(sessionBusyLabelKey(reason), key, `razão ${reason}`);
    }
  });
});

describe('DEFAULT_SESSION_STATE — sem provider o app não quebra', () => {
  it('traz o snapshot vazio e escritas no-op', () => {
    assert.equal(DEFAULT_SESSION_STATE.subject, null);
    assert.equal(DEFAULT_SESSION_STATE.phase, null);
    assert.equal(DEFAULT_SESSION_STATE.status, 'idle');
    assert.equal(DEFAULT_SESSION_STATE.busy, null);
    assert.equal(DEFAULT_SESSION_STATE.lastActivityAt, null);
    assert.doesNotThrow(() => DEFAULT_SESSION_STATE.publishSession({ subject: 'x' }));
    assert.doesNotThrow(() => DEFAULT_SESSION_STATE.resetSession());
  });
});
