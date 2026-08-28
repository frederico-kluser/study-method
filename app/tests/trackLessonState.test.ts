/**
 * tests/trackLessonState.test.ts — máquina de estado da aula em CHAT (rodada 8).
 *
 * Contratos que mordem:
 *   1. applyTutorReply com sectionId acrescenta a seção (sem duplicar) e a
 *      mensagem ao histórico; done=true marca theoryDone.
 *   2. Resposta vazia ('next' sem seções restantes) não adiciona mensagem.
 *   3. pushUserMessage ignora texto vazio e limpa lastError.
 *   4. tutorNextAction: 'next' enquanto houver seção; 'answer' após done.
 *
 * ONDA2 (error-flow):
 *   5. buildErrorReport monta o relatório com TODOS os arquivos submetidos.
 *   6. formatErrorBubble devolve markdown determinístico (razão parcial,
 *      checklist ✔/✖, saída em code block).
 *   7. seedChallengeError: no-op SÓ com discussão ATIVA (challengeError do
 *      estado já aponta o MESMO desafio); retry do MESMO desafio pós-'next'
 *      RE-SEMEIA (par antigo sai, par novo entra no FIM, sem duplicação);
 *      desafio DIFERENTE → REPÕE as bolhas antigas; grava challengeError.
 *   8. clearChallengeError zera challengeError mantendo o histórico.
 *   9. chatHistory STRIPA o kind (o histórico ao main é texto puro).
 *
 * ONDA3-FIX: o 'next' (clearChallengeError) zera o challengeError mas MANTÉM
 * as bolhas; o chatHistory STRIPA o `errorFor` junto com o `kind`.
 *
 * FIX-FINAL (retry real): o dedupe POR HISTÓRICO era no-op e quebrava o
 * RETRY do MESMO desafio após o 'next' — 2ª falha sem bolha nova e sem
 * challengeError, o 'answer' seguinte ia ao tutor SEM o erro da 2ª tentativa.
 * O guard agora é SÓ a discussão ativa; o retry RE-SEMEIA: remove o par
 * antigo daquele challengeId (errorFor) e appenda o par novo no FIM — a
 * discussão antiga permanece, sem duplicação.
 *
 * ONDA1-MODELO-CHAT (chat iMessage — o modelo que a Onda 2 consome):
 *  10. Toda mensagem criada carrega `ts` (Date.now() no momento da CRIAÇÃO;
 *      `now` injetável nos testes) — push/apply/seed.
 *  11. Kind UNIFICADO: 'error-bubble' → 'review', 'error-question' →
 *      'message'; mensagens normais → 'message'; a resposta do tutor após
 *      mensagem 'user' → 'reply'; seções 'next' NUNCA viram 'reply'.
 *  12. chatHistory STRIPA ts/kind/errorFor (o main só vê role/content).
 *  13. formatErrorBubble inclui o CÓDIGO SUBMETIDO (code block por arquivo
 *      com o path como título) antes das seções de saída/checks.
 *  14. Helpers de streaming puros: typewriterCut (0ms→0, fim→length,
 *      monotônico, tps configurável), typewriterDelayPerChar (~2.5ms no
 *      default) e typewriterIsDone.
 *
 * ONDA2-IMESSAGE (chat estilo iMessage — a Onda 2 consome):
 *  15. formatChatTime → HH:MM 24h fixo nos dois idiomas (ts do modelo).
 *  16. chatDaySeparator → null mesmo dia/sem anterior; hoje/ontem/data
 *      completa no locale (label com o ano).
 *  17. isLessonFinishBlocked → sem desafios libera; todos passed libera;
 *      pendente (null/failed) bloqueia.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTutorReply,
  buildErrorReport,
  chatDaySeparator,
  chatHistory,
  clearChallengeError,
  createTrackLessonState,
  formatChatTime,
  formatErrorBubble,
  isLessonFinishBlocked,
  presentedCount,
  pushUserMessage,
  seedChallengeError,
  tutorNextAction,
  typewriterCut,
  typewriterDelayPerChar,
  typewriterIsDone,
} from '../src/lib/trackLessonState';
import type { TrackChallengeErrorReport, TrackSubmitResult, TutorReply } from '../shared/ipc-contract';

function reply(over: Partial<TutorReply> = {}): TutorReply {
  return {
    ok: true,
    message: 'Seção apresentada.',
    sectionId: 's1',
    sectionTitle: 'Seção 1',
    done: false,
    ...over,
  };
}

describe('trackLessonState — aula em chat', () => {
  it('next acrescenta a seção e a mensagem ao estado', () => {
    const s0 = createTrackLessonState();
    const s1 = applyTutorReply(s0, reply());
    assert.deepEqual(s1.presentedSections, ['s1']);
    assert.equal(s1.history.length, 1);
    assert.equal(s1.history[0].role, 'assistant');
    assert.equal(s1.theoryDone, false);
  });

  it('seção repetida não duplica presentedSections', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply());
    const s2 = applyTutorReply(s1, reply());
    assert.deepEqual(s2.presentedSections, ['s1']);
  });

  it('done=true marca theoryDone e o estado segue para answer', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply({ sectionId: 's1', done: true }));
    assert.equal(s1.theoryDone, true);
    assert.equal(tutorNextAction(s1), 'answer');
    assert.equal(tutorNextAction(createTrackLessonState()), 'next');
  });

  it('resposta vazia (fim) não adiciona mensagem', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply({ message: '', sectionId: null, done: true }));
    assert.equal(s1.history.length, 0);
    assert.equal(s1.theoryDone, true);
  });

  it('erro do tutor grava lastError sem tocar no histórico', () => {
    const s1 = applyTutorReply(createTrackLessonState(), {
      ok: false,
      message: '',
      sectionId: null,
      done: false,
      error: { code: 'TUTOR_UNAVAILABLE', message: 'indisponível' },
    });
    assert.equal(s1.lastError, 'indisponível');
    assert.equal(s1.history.length, 0);
  });

  it('pushUserMessage adiciona a pergunta e limpa lastError; vazio é no-op', () => {
    const s1 = applyTutorReply(createTrackLessonState(), {
      ok: false,
      message: '',
      sectionId: null,
      done: false,
      error: { code: 'X', message: 'erro' },
    });
    const s2 = pushUserMessage(s1, '  não entendi  ');
    assert.equal(s2.history[0].content, 'não entendi');
    assert.equal(s2.history[0].role, 'user');
    assert.equal(s2.lastError, null);
    assert.equal(pushUserMessage(s2, '   '), s2);
  });

  it('chatHistory devolve as mensagens puras; presentedCount conta seções', () => {
    const s = pushUserMessage(applyTutorReply(createTrackLessonState(), reply()), 'pergunta');
    assert.deepEqual(chatHistory(s).map((m) => m.role), ['assistant', 'user']);
    assert.equal(presentedCount(s), 1);
  });
});

// ─── ONDA2 (error-flow): relatório, bolha e seed da discussão do erro ────────

const SUBMIT_RESULT: TrackSubmitResult = {
  ok: true,
  passed: false,
  testsRun: 2,
  expectedTests: 3,
  output: '✔ dobro de 0 é 0\n✖ dobro de 2 é 4 (esperava 4, recebeu 2)',
  checks: [
    { name: 'dobro de 2 é 4', passed: false },
    { name: 'dobro de 0 é 0', passed: true },
    { name: 'dobro de -3 é -6', passed: false },
  ],
  passedCount: 1,
  totalCount: 3,
};

function report(over: Partial<TrackChallengeErrorReport> = {}): TrackChallengeErrorReport {
  return {
    trackSlug: 'nodejs-do-zero',
    lessonId: 'aula-1',
    challengeId: 'dobro-do-numero',
    challengeTitle: 'O dobro do número',
    files: [{ path: 'solution.mjs', code: 'export function dobroDoNumero(n) { return n; }' }],
    output: SUBMIT_RESULT.output,
    checks: SUBMIT_RESULT.checks,
    passedCount: 1,
    totalCount: 3,
    ...over,
  };
}

describe('trackLessonState — onda2 error-flow', () => {
  it('buildErrorReport monta o relatório com TODOS os arquivos submetidos', () => {
    const r = buildErrorReport({
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
      challengeId: 'dobro-do-numero',
      challengeTitle: 'O dobro do número',
      files: [
        { path: 'lib/soma.mjs', code: 'export const soma = (a, b) => a + b;' },
        { path: 'solution.mjs', code: 'export function dobroDoNumero(n) { return n; }' },
      ],
      result: SUBMIT_RESULT,
    });
    assert.equal(r.trackSlug, 'nodejs-do-zero');
    assert.equal(r.lessonId, 'aula-1');
    assert.equal(r.challengeId, 'dobro-do-numero');
    assert.equal(r.challengeTitle, 'O dobro do número');
    assert.deepEqual(r.files, [
      { path: 'lib/soma.mjs', code: 'export const soma = (a, b) => a + b;' },
      { path: 'solution.mjs', code: 'export function dobroDoNumero(n) { return n; }' },
    ]);
    assert.equal(r.output, SUBMIT_RESULT.output);
    assert.deepEqual(r.checks, SUBMIT_RESULT.checks);
    assert.equal(r.passedCount, 1);
    assert.equal(r.totalCount, 3);
  });

  it('formatErrorBubble devolve markdown determinístico (título, N de M, código, checklist ✔/✖, saída)', () => {
    const md = formatErrorBubble(report());
    assert.ok(md.includes('## Seu código falhou nos testes'), 'título da bolha');
    assert.ok(md.includes('**O dobro do número**'), 'título do desafio');
    assert.ok(md.includes('**1 de 3 testes passaram**'), 'razão parcial N de M');
    assert.ok(md.includes('Código submetido'), 'rótulo da seção do código submetido');
    assert.ok(md.includes('**solution.mjs**'), 'path do arquivo como título do code block');
    assert.ok(md.includes('export function dobroDoNumero(n) { return n; }'), 'código do aluno no markdown');
    assert.ok(md.includes('Resultado por teste'), 'rótulo do checklist');
    assert.ok(md.includes('- ✖ dobro de 2 é 4'), 'check falho com ✖');
    assert.ok(md.includes('- ✔ dobro de 0 é 0'), 'check passado com ✔');
    assert.ok(md.includes('Saída:'), 'rótulo da saída');
    assert.ok(md.includes('```text'), 'saída em code block');
    assert.ok(md.includes(SUBMIT_RESULT.output), 'saída completa no code block');
    // Determinístico: mesma entrada → byte-idêntico.
    assert.equal(formatErrorBubble(report()), md);
  });

  it('formatErrorBubble sem checks mostra a saída falando por si', () => {
    const md = formatErrorBubble(report({ checks: [], passedCount: 0, totalCount: 0 }));
    assert.ok(!md.includes('- ✔'), 'sem checks não há checklist');
    assert.ok(md.includes('nenhum check rodou'), 'aviso determinístico do fluxo sem checks');
  });

  it('formatErrorBubble sem arquivos não inclui a seção do código', () => {
    const md = formatErrorBubble(report({ files: [] }));
    assert.ok(!md.includes('Código submetido'), 'sem arquivos, sem seção de código');
    assert.ok(md.includes('Resultado por teste'), 'resto do markdown intacto');
  });

  it('seedChallengeError insere bolha de erro + pergunta e grava challengeError', () => {
    const s0 = createTrackLessonState();
    const s1 = seedChallengeError(s0, report(), 'O que você acha que errou?');
    assert.equal(s1.history.length, 2);
    assert.equal(s1.history[0].kind, 'review');
    assert.equal(s1.history[0].errorFor, 'dobro-do-numero');
    assert.equal(s1.history[0].role, 'assistant');
    assert.ok(s1.history[0].content.startsWith('## '));
    assert.equal(s1.history[1].kind, 'message');
    assert.equal(s1.history[1].content, 'O que você acha que errou?');
    assert.deepEqual(s1.challengeError, report());
  });

  it('seedChallengeError deduplica POR challengeId — mesmo desafio é no-op (guard anti-StrictMode)', () => {
    const s1 = seedChallengeError(createTrackLessonState(), report(), 'pergunta 1');
    // Mesmo challengeId → NO-OP: nem a pergunta muda nem a bolha duplica.
    const s2 = seedChallengeError(s1, report(), 'pergunta 2 (não pode duplicar)');
    assert.equal(s2, s1, 'o estado NÃO pode ser um objeto novo');
    assert.equal(s2.history.length, 2);
    assert.equal(s2.history[1].content, 'pergunta 1');
  });

  it('seedChallengeError com desafio DIFERENTE REPÕE as bolhas do erro anterior', () => {
    const s1 = seedChallengeError(
      createTrackLessonState(),
      report(),
      'O que você acha que errou?',
    );
    const segundo = report({ challengeId: 'dobro-outro', challengeTitle: 'Outro desafio' });
    const s2 = seedChallengeError(s1, segundo, 'E agora?');
    assert.equal(s2.history.length, 2, 'as bolhas antigas foram REMOVIDAS e as novas entram');
    assert.equal(s2.history[0].kind, 'review');
    assert.ok(s2.history[0].content.includes('**Outro desafio**'));
    assert.equal(s2.history[1].content, 'E agora?');
    assert.equal(s2.challengeError?.challengeId, 'dobro-outro');
  });

  it('clearChallengeError zera o contexto e MANTÉM o histórico', () => {
    const s1 = seedChallengeError(createTrackLessonState(), report(), 'pergunta');
    const s2 = clearChallengeError(s1);
    assert.equal(s2.challengeError, null);
    assert.equal(s2.history.length, 2, 'bolhas continuam na conversa');
    assert.equal(clearChallengeError(s2), s2, 'sem contexto, clear é no-op');
  });

  it('FIX-FINAL (retry): 2ª falha do MESMO desafio APÓS o next RE-SEMEIA — par antigo sai, par novo entra no fim, SEM duplicação', () => {
    const s1 = seedChallengeError(createTrackLessonState(), report(), 'pergunta 1');
    // O aluno responde e o tutor analisa — a discussão ANTIGA fica no histórico.
    const s1b = applyTutorReply(
      pushUserMessage(s1, 'eu acho que errei no retorno'),
      reply({ sectionId: null, message: 'Boa hipótese — o retorno estava errado.' }),
    );
    // Usuário aperta "Próximo": a teoria retoma — contexto zerado, bolhas FICAM.
    const s2 = clearChallengeError(s1b);
    assert.equal(s2.challengeError, null);
    assert.equal(s2.history.length, 4, 'bolhas + discussão seguem na conversa');
    // O desafio falho segue clicável na lista da aula → nova falha do MESMO
    // desafio com o contexto já zerado. ANTES do fix-final isto era no-op
    // (dedupe pelo histórico): sem bolha nova e challengeError null — o
    // 'answer' seguinte ia ao tutor SEM o erro da 2ª tentativa.
    const segunda = report({ output: 'saída da 2ª tentativa', passedCount: 0, totalCount: 3 });
    const s3 = seedChallengeError(s2, segunda, 'pergunta 2');
    assert.equal(
      s3.history.length,
      4,
      'SEM duplicação: só 2 bolhas no total (par antigo saiu, par novo entrou no fim)',
    );
    assert.equal(s3.history[0].content, 'eu acho que errei no retorno', 'resposta do aluno da discussão antiga PERMANECE');
    assert.equal(s3.history[1].content, 'Boa hipótese — o retorno estava errado.', 'análise do tutor antiga PERMANECE');
    assert.equal(s3.history[2].kind, 'review', 'par NOVO entra no FIM (cronologia do retry)');
    assert.equal(s3.history[2].errorFor, 'dobro-do-numero');
    assert.ok(s3.history[2].content.includes('saída da 2ª tentativa'), 'bolha nova carrega o erro da tentativa ATUAL');
    assert.equal(s3.history[3].kind, 'message');
    assert.equal(s3.history[3].content, 'pergunta 2');
    assert.deepEqual(s3.challengeError, segunda, 'challengeError é o report NOVO — o answer seguinte carrega o erro da 2ª tentativa');
  });

  it('ONDA3-FIX: desafio DIFERENTE APÓS o next (clearChallengeError) REPÕE as bolhas antigas', () => {
    const s1 = seedChallengeError(createTrackLessonState(), report(), 'pergunta 1');
    const s2 = clearChallengeError(s1);
    assert.equal(s2.challengeError, null);
    const segundo = report({ challengeId: 'dobro-outro', challengeTitle: 'Outro desafio' });
    const s3 = seedChallengeError(s2, segundo, 'E agora?');
    assert.equal(s3.history.length, 2, 'bolhas antigas REMOVIDAS, só as novas ficam');
    assert.equal(s3.history[0].kind, 'review');
    assert.equal(s3.history[0].errorFor, 'dobro-outro');
    assert.ok(s3.history[0].content.includes('**Outro desafio**'));
    assert.equal(s3.history[1].content, 'E agora?');
    assert.equal(s3.challengeError?.challengeId, 'dobro-outro');
  });

  it('chatHistory STRIPA o kind, o errorFor E o ts — o histórico ao main é texto puro', () => {
    const s1 = seedChallengeError(createTrackLessonState(), report(), 'pergunta');
    assert.equal(s1.history[0].errorFor, 'dobro-do-numero', 'no estado, a bolha carrega o errorFor');
    const hist = chatHistory(s1);
    assert.equal(hist.length, 2);
    for (const m of hist) {
      assert.ok(!('kind' in m), `kind não pode trafegar ao main (${JSON.stringify(m)})`);
      assert.ok(!('errorFor' in m), `errorFor não pode trafegar ao main (${JSON.stringify(m)})`);
      assert.ok(!('ts' in m), `ts não pode trafegar ao main (${JSON.stringify(m)})`);
      assert.deepEqual(Object.keys(m).sort(), ['content', 'role']);
    }
    assert.equal(hist[0].content, s1.history[0].content);
  });

  it('applyTutorReply e pushUserMessage PRESERVAM o challengeError em discussão', () => {
    const s1 = seedChallengeError(createTrackLessonState(), report(), 'pergunta');
    const s2 = applyTutorReply(s1, reply({ sectionId: null, done: false }));
    assert.deepEqual(s2.challengeError, report(), 'a resposta do tutor não zera o contexto');
    const s3 = pushUserMessage(s2, 'eu acho que errei no retorno');
    assert.deepEqual(s3.challengeError, report());
    assert.equal(s3.history[s3.history.length - 1].content, 'eu acho que errei no retorno');
  });

  // ONDA3 (chat-cache): o seed é APPEND-ONLY sobre o estado RESTAURADO do
  // cache — a teoria em curso volta no histórico e as bolhas entram depois.
  // Nenhum helper novo: o seedChallengeError existente já compõe sobre
  // history; estes testes compõem o comportamento da restauração composta.

  /** Estado com UMA seção de teoria apresentada (histórico = 2 mensagens). */
  function theoryState() {
    let s = applyTutorReply(createTrackLessonState(), reply());
    s = pushUserMessage(s, 'e se eu usar um for?');
    s = applyTutorReply(s, reply({ sectionId: null, message: 'Boa pergunta!' }));
    return s;
  }

  it('seed sobre estado RESTAURADO com teoria → histórico = teoria + bolhas, SEM duplicação', () => {
    const teoria = theoryState();
    const s1 = seedChallengeError(teoria, report(), 'O que você acha que errou?');
    assert.deepEqual(s1.presentedSections, ['s1'], 'teoria preservada (seção apresentada)');
    assert.equal(s1.history.length, teoria.history.length + 2, 'bolhas ENTRAM DEPOIS da teoria');
    assert.deepEqual(
      s1.history.slice(0, teoria.history.length),
      teoria.history,
      'mensagens da teoria intactas e na ordem (sem duplicação)',
    );
    assert.equal(s1.history[teoria.history.length].kind, 'review');
    assert.equal(s1.history[teoria.history.length + 1].kind, 'message');
    assert.deepEqual(s1.challengeError, report());
  });

  it('falha repetida do MESMO desafio sobre estado restaurado NÃO re-semeia (no-op)', () => {
    // Estado restaurado do cache: teoria + bolhas do erro A + challengeError A.
    const restaurado = seedChallengeError(theoryState(), report(), 'pergunta 1');
    const s2 = seedChallengeError(restaurado, report(), 'pergunta 2 (não pode duplicar)');
    assert.equal(s2, restaurado, 'estado NÃO pode ser objeto novo');
    assert.equal(s2.history.length, theoryState().history.length + 2, 'nenhuma bolha duplicada');
    assert.equal(s2.history[s2.history.length - 1].content, 'pergunta 1');
  });

  it('desafio NOVO sobre estado restaurado REPÕE as bolhas antigas no mesmo ponto (teoria intacta)', () => {
    const teoria = theoryState();
    const restaurado = seedChallengeError(teoria, report(), 'pergunta 1');
    const segundo = report({ challengeId: 'dobro-outro', challengeTitle: 'Outro desafio' });
    const s2 = seedChallengeError(restaurado, segundo, 'E agora?');
    assert.equal(s2.history.length, teoria.history.length + 2, 'bolhas antigas removidas, novas entram');
    assert.deepEqual(
      s2.history.slice(0, teoria.history.length),
      teoria.history,
      'teoria intacta e na MESMA posição',
    );
    assert.ok(s2.history[teoria.history.length].content.includes('**Outro desafio**'));
    assert.equal(s2.history[teoria.history.length + 1].content, 'E agora?');
    assert.equal(s2.challengeError?.challengeId, 'dobro-outro');
  });

  it('teoria RESTAURADA completa → tutorNextAction segue direto para answer (nada a reapresentar)', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply({ sectionId: 's1', done: true }));
    assert.equal(s1.theoryDone, true);
    assert.equal(tutorNextAction(s1), 'answer', 'teoria concluída restaurada não reapresenta seções');
    assert.equal(presentedCount(s1), 1);
  });
});

// ─── ONDA1-MODELO-CHAT: ts, kind unificado, reply rule e streaming ───────────

describe('trackLessonState — onda1 modelo de mensagens (ts + kinds)', () => {
  it('ts é definido no momento da CRIAÇÃO — now injetado em push/apply/seed', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply(), 1000);
    assert.equal(s1.history[0].ts, 1000, 'applyTutorReply usa o now injetado');
    const s2 = pushUserMessage(s1, 'dúvida', 2000);
    assert.equal(s2.history[1].ts, 2000, 'pushUserMessage usa o now injetado');
    const s3 = seedChallengeError(s2, report(), 'pergunta', {}, 3000);
    assert.equal(s3.history[2].ts, 3000, 'bolha de review usa o now injetado');
    assert.equal(s3.history[3].ts, 3000, 'bolha da pergunta usa o now injetado (par semeado no MESMO instante)');
    // Sem now → Date.now() real (aproximação no intervalo da chamada).
    const before = Date.now();
    const s4 = pushUserMessage(createTrackLessonState(), 'msg');
    const after = Date.now();
    assert.ok(
      s4.history[0].ts >= before && s4.history[0].ts <= after,
      'default = Date.now() no momento da criação',
    );
  });

  it('resposta vazia NÃO cria mensagem — ts/kind não existem', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply({ message: '', sectionId: null, done: true }), 500);
    assert.equal(s1.history.length, 0);
  });

  it('REPLY RULE: resposta após pergunta do aluno é reply; seções next NUNCA viram reply', () => {
    const s1 = applyTutorReply(createTrackLessonState(), reply(), 1000);
    assert.equal(s1.history[0].kind, 'message', 'primeira seção (sem user antes) → message');
    // Aluno pergunta; tutor responde (action answer, sectionId null) → reply.
    const s2 = pushUserMessage(s1, 'por que isso?', 2000);
    const s3 = applyTutorReply(s2, reply({ sectionId: null, message: 'Porque...' }), 3000);
    assert.equal(s3.history[2].kind, 'reply', 'resposta à pergunta do aluno → reply');
    assert.equal(s3.history[2].ts, 3000);
    // 'next' apresentado APÓS outra mensagem do assistente → message.
    const s4 = applyTutorReply(s3, reply({ sectionId: 's2', message: 'Próxima seção.' }), 4000);
    assert.equal(s4.history[3].kind, 'message', "'next' após assistant → message (nunca reply)");
    // Defensivo (o main não faz isso, mas o contrato é explícito): 'next'
    // mesmo APÓS 'user' → message — seção NUNCA vira reply.
    const s5 = pushUserMessage(s4, 'outra dúvida', 5000);
    const s6 = applyTutorReply(s5, reply({ sectionId: 's3', message: 'Seção 3.' }), 6000);
    assert.equal(s6.history[4].role, 'user');
    assert.equal(s6.history[5].kind, 'message', "'next' após 'user' continua message (nunca reply)");
  });

  it('applyTutorReply após seed: resposta à pergunta do aluno é reply', () => {
    const s1 = seedChallengeError(createTrackLessonState(), report(), 'O que você acha que errou?', {}, 1000);
    assert.equal(s1.history[0].kind, 'review');
    assert.equal(s1.history[1].kind, 'message', 'a pergunta do tutor é uma MENSAGEM normal');
    const s2 = applyTutorReply(
      pushUserMessage(s1, 'acho que errei no retorno', 2000),
      reply({ sectionId: null, message: 'Boa hipótese!' }),
      3000,
    );
    assert.equal(s2.history[3].kind, 'reply', 'análise do tutor na discussão do erro → reply');
  });
});

describe('trackLessonState — onda1 typewriter (streaming puro)', () => {
  it('typewriterCut: 0ms → 0; fim → text.length; monotônico; tps configurável; clamp', () => {
    const text = 'x'.repeat(1000);
    assert.equal(typewriterCut(text, 0), 0, '0ms → 0');
    assert.equal(typewriterCut(text, 2500), 1000, '100 tps * 4 chars * 2.5s = 1000 chars');
    assert.equal(typewriterCut(text, 100), 40, '~400 chars/s no default');
    assert.equal(typewriterCut(text, 1000, 50), 200, 'tps=50 → ~200 chars/s');
    assert.equal(typewriterCut(text, 1000, 200), 800, 'tps=200 → ~800 chars/s');
    // Clamp: tempo grande → text.length; tempo negativo → 0; texto vazio → 0.
    assert.equal(typewriterCut('abc', 10_000), 3);
    assert.equal(typewriterCut('abc', -5), 0);
    assert.equal(typewriterCut('', 5000), 0);
    // Monotônico em elapsedMs.
    const cuts = [0, 50, 100, 250, 500, 1000, 2500, 10_000].map((ms) => typewriterCut(text, ms));
    for (let i = 1; i < cuts.length; i++) {
      assert.ok(cuts[i] >= cuts[i - 1], `monotônico: cut(${i - 1}) <= cut(${i})`);
    }
  });

  it('typewriterDelayPerChar: ~2.5ms por char no default; escala com tps', () => {
    assert.equal(typewriterDelayPerChar(), 2.5);
    assert.equal(typewriterDelayPerChar(100), 2.5);
    assert.equal(typewriterDelayPerChar(50), 5);
    assert.equal(typewriterDelayPerChar(200), 1.25);
  });

  it('typewriterIsDone: true quando o typewriter alcança o fim do texto', () => {
    const text = 'x'.repeat(1000);
    assert.equal(typewriterIsDone(text, 100), false, 'começo: ainda digitando');
    assert.equal(typewriterIsDone(text, 2500), true, '2.5s no default cobre 1000 chars');
    assert.equal(typewriterIsDone(text, 5000, 50), true, 'tps=50 → 200 chars/s → 5s cobre');
    assert.equal(typewriterIsDone(text, 4000, 50), false, 'tps=50 → 4s cobre só 800 chars');
    assert.equal(typewriterIsDone('', 0), true, 'texto vazio já está "digitado"');
  });
});

describe('trackLessonState — onda2-imessage (hora, separador de dia e gating)', () => {
  it('formatChatTime: HH:MM 24h fixo nos dois idiomas (ts do modelo)', () => {
    const ts = new Date(2026, 7, 28, 9, 5).getTime();
    assert.equal(formatChatTime(ts, 'pt-BR'), '09:05', 'pt-BR → HH:MM 24h');
    assert.equal(formatChatTime(ts, 'en'), '09:05', 'en → HH:MM 24h (sem AM/PM)');
    const meiaNoite = new Date(2026, 7, 28, 0, 0).getTime();
    assert.equal(formatChatTime(meiaNoite, 'pt-BR'), '00:00', 'meia-noite → 00:00');
  });

  it('chatDaySeparator: null no mesmo dia; hoje/ontem/data completa; sem anterior → null', () => {
    // `now` fixo em 2026-08-28 12:00 (local) — os construtores com y/m/d são
    // LOCAIS, então as comparações de dia independem do fuso do runner.
    const now = new Date(2026, 7, 28, 12, 0).getTime();
    const hojeManha = new Date(2026, 7, 28, 8, 0).getTime();
    const hojeMadrugada = new Date(2026, 7, 28, 0, 10).getTime();
    const ontem = new Date(2026, 7, 27, 10, 0).getTime();
    const anteontem = new Date(2026, 7, 26, 10, 0).getTime();
    const mesPassado = new Date(2026, 6, 15, 10, 0).getTime();
    // mesmo dia → null (nada a separar).
    assert.equal(chatDaySeparator(hojeManha, hojeMadrugada, 'pt-BR', now), null);
    // primeira mensagem do histórico (sem anterior) → null.
    assert.equal(chatDaySeparator(hojeManha, undefined, 'pt-BR', now), null);
    // dia muda para HOJE (a mensagem é de hoje, a anterior é de ontem).
    assert.deepEqual(chatDaySeparator(hojeManha, ontem, 'pt-BR', now), { kind: 'today' });
    // dia muda para ONTEM.
    assert.deepEqual(chatDaySeparator(ontem, anteontem, 'pt-BR', now), { kind: 'yesterday' });
    // dia mais antigo → data completa no locale (label com o ano).
    const sep = chatDaySeparator(mesPassado, ontem, 'pt-BR', now);
    assert.ok(sep !== null && sep.kind === 'date', 'dia antigo → data completa');
    if (sep && sep.kind === 'date') {
      assert.ok(sep.label.includes('2026'), `label pt-BR traz o ano: ${sep.label}`);
    }
    const sepEn = chatDaySeparator(mesPassado, ontem, 'en', now);
    if (sepEn && sepEn.kind === 'date') {
      assert.ok(sepEn.label.includes('2026'), `label en traz o ano: ${sepEn.label}`);
    }
  });

  it('isLessonFinishBlocked: sem desafios libera; todos passed libera; pendente/falha bloqueia', () => {
    assert.equal(isLessonFinishBlocked([]), false, 'sem desafios → liberado');
    assert.equal(
      isLessonFinishBlocked([{ lastVerdict: 'passed' }, { lastVerdict: 'passed' }]),
      false,
      'todos passed → liberado',
    );
    assert.equal(isLessonFinishBlocked([{ lastVerdict: null }]), true, 'nunca tentado → bloqueia');
    assert.equal(isLessonFinishBlocked([{ lastVerdict: 'failed' }]), true, 'failed → bloqueia');
    assert.equal(
      isLessonFinishBlocked([{ lastVerdict: 'passed' }, { lastVerdict: null }]),
      true,
      'um pendente entre passed → bloqueia',
    );
  });
});
