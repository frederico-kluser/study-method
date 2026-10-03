/**
 * tests/lessonTypewriterReadingSpeed.test.ts — ONDA10, DEFEITO 3: a "escrita
 * da história" estava ~20× mais rápida que a leitura.
 *
 * O QUE O CÓDIGO ANTIGO FAZIA: a LessonView passava `tps={m.kind === 'review'
 * ? 10 : undefined}` — ou seja, a bolha da TEORIA caía no default do
 * TypewriterText (100 tps) e `typewriterCut` faz
 * `chars = floor(elapsedMs * tps * 4 / 1000)` ⇒ **400 caracteres por
 * segundo**. A seção mais longa da AULA 1 (564 chars) era despejada em
 * **1,41 s**. Leitura de adulto em português: ~200–250 palavras/min ≈ 20–25
 * chars/s.
 *
 * A CONTA (números MEDIDOS na aula 1, não estimados):
 *   250 palavras/min × 5,43 chars/palavra = 1357 chars/min = 22,6 chars/s
 *   ÷ 0,934 (o markdown cru é digitado, o texto visível é o que se lê)
 *   ≈ 24,2 chars/s ⇒ arredondado PARA CIMA até caber no teto de ~20 s por
 *   seção: 28 chars/s ⇒ tps = 28/4 = **7**.
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. a TEORIA digita na faixa de LEITURA (20–32 chars/s) — nunca mais 400;
 *   2. a MEDIÇÃO real: nenhuma seção de teoria de NENHUMA trilha do repo pode
 *      passar de 21 s na velocidade de teoria, e a mais longa da AULA 1 é
 *      verificada nominalmente;
 *   3. `chatBubbleTps` roteia por bolha: teoria → 7; review → 10; resposta do
 *      tutor ('reply') e a pergunta semeada do erro → 100 ("livre");
 *   4. o que NÃO mudou: default global de `typewriterCut`/
 *      `typewriterDelayPerChar` continua 100 tps, e `TYPEWRITER_TPS.review`
 *      continua 10;
 *   5. a SAÍDA da animação existe (prop `skip`) e está ligada na LessonView —
 *      quem lê rápido não fica refém;
 *   6. ONDA-SKIP-1S: o `skip` NÃO estoura mais o texto na cara — o restante é
 *      revelado numa varredura de ~1 s, com os caracteres restantes
 *      distribuídos uniformemente (o pedido do dono: "ela termina de mostrar
 *      tudo em 1s ai calculamos a quantidade de caracteres para saber como
 *      mostramos eles com mesmo tempo ate dar um segundo"). A conta é o
 *      helper PURO `skipSweepCut`/`skipSweepDelayPerChar` (1000 ms ÷ chars
 *      restantes), e o relógio de digitação acima continua intocado.
 *
 * ANTES DO CONSERTO: `TYPEWRITER_TPS`/`chatBubbleTps` não existiam e a bolha
 * de teoria rodava a 400 chars/s — a asserção "a seção leva mais de 14 s"
 * falhava por um fator de ~14 (a seção inteira aparecia em 1,41 s).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  SKIP_SWEEP_MS,
  TYPEWRITER_TPS,
  applyTutorReply,
  chatBubbleTps,
  createTrackLessonState,
  isTheoryPresentationBubble,
  pushUserMessage,
  seedChallengeError,
  skipSweepCut,
  skipSweepDelayPerChar,
  typewriterCut,
  typewriterDelayPerChar,
  typewriterIsDone,
} from '../src/lib/trackLessonState';
import type {
  TrackChallengeErrorReport,
  TutorReply,
} from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRACKS = resolve(HERE, '../resources/tracks');
const AULA_1 = resolve(
  TRACKS,
  'python-iniciante/modules/a-tela/lessons/a-primeira-linha/lesson.json',
);

interface TheorySectionJson {
  id: string;
  title: string;
  markdown: string;
  code?: { language: string; code: string; explanation?: string };
}

/** A mensagem que o tutor REALMENTE manda no 'next' (tutorChat.ts, ação
 *  'next'): markdown da seção + o bloco de código quando houver. */
function assembled(s: TheorySectionJson): string {
  if (!s.code) return s.markdown;
  const expl = s.code.explanation ? `\n\n${s.code.explanation}` : '';
  return `${s.markdown}\n\n\`\`\`${s.code.language}\n${s.code.code}\n\`\`\`${expl}`;
}

/** Segundos que uma bolha leva para ser digitada inteira a `tps`. */
function segundos(text: string, tps: number): number {
  return text.length / (tps * 4);
}

/** Todos os lesson.json abaixo de resources/tracks. */
function everyLessonJson(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...everyLessonJson(full));
    else if (entry === 'lesson.json') out.push(full);
  }
  return out;
}

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

describe('ONDA10 defeito 3 — a TEORIA é escrita em velocidade de LEITURA', () => {
  it('a conta: 7 tps = 28 chars/s, dentro da faixa de leitura (não 400)', () => {
    assert.equal(TYPEWRITER_TPS.theory, 7, 'a velocidade da teoria é 7 tps');
    const charsPorSegundo = TYPEWRITER_TPS.theory * 4;
    assert.equal(charsPorSegundo, 28);
    assert.ok(
      charsPorSegundo >= 20 && charsPorSegundo <= 32,
      `a teoria deve ficar na faixa de leitura (20–32 chars/s), veio ${charsPorSegundo}`,
    );
    // 28 chars/s ÷ 5,43 chars/palavra ≈ 5,2 palavras/s ≈ 310 palavras/min de
    // markdown CRU — calibrado no TOPO da faixa de leitura de propósito:
    // escrever mais devagar que o leitor é o único erro que o faz esperar.
    const palavrasPorMinuto = (charsPorSegundo / 5.43) * 60;
    assert.ok(
      palavrasPorMinuto >= 200,
      `nunca abaixo da leitura de um adulto lento (200 wpm), veio ${palavrasPorMinuto.toFixed(0)}`,
    );
  });

  it('a bolha de teoria NÃO é mais despejada: 1,41 s cobria tudo antes, agora não', () => {
    const secoes = (JSON.parse(readFileSync(AULA_1, 'utf8')).theory as TheorySectionJson[]).map(
      assembled,
    );
    const maior = secoes.reduce((a, b) => (a.length >= b.length ? a : b));
    // O bug, executável: a 100 tps (o default que a bolha de teoria usava) a
    // seção inteira aparecia em ~1,4 s.
    assert.equal(
      typewriterIsDone(maior, 1410, 100),
      true,
      'a 100 tps a seção mais longa da aula 1 saía inteira em 1,41 s (o defeito)',
    );
    // Agora, na velocidade de teoria, 1,41 s revela só um pedaço.
    assert.equal(
      typewriterIsDone(maior, 1410, TYPEWRITER_TPS.theory),
      false,
      'na velocidade de leitura 1,41 s NÃO pode cobrir a seção inteira',
    );
    assert.ok(
      typewriterCut(maior, 1410, TYPEWRITER_TPS.theory) < maior.length / 8,
      '1,41 s deve revelar menos de 1/8 da seção',
    );
  });

  it('MEDIÇÃO na aula 1: a seção mais longa leva ~20 s (entre 14 s e 21 s)', () => {
    const secoes = (JSON.parse(readFileSync(AULA_1, 'utf8')).theory as TheorySectionJson[]).map(
      assembled,
    );
    const maior = secoes.reduce((a, b) => (a.length >= b.length ? a : b));
    assert.ok(maior.length > 400, `a medição precisa de uma seção real, veio ${maior.length} chars`);
    const s = segundos(maior, TYPEWRITER_TPS.theory);
    assert.ok(
      s >= 14 && s <= 21,
      `a seção mais longa da aula 1 (${maior.length} chars) deve levar entre 14 s e 21 s — veio ${s.toFixed(1)} s`,
    );
    // E a digitação de fato termina nesse tempo (contrato de typewriterCut).
    assert.equal(typewriterIsDone(maior, Math.ceil(s * 1000), TYPEWRITER_TPS.theory), true);
  });

  it('TETO de paciência: nenhuma seção de NENHUMA trilha passa de 21 s', () => {
    const arquivos = everyLessonJson(TRACKS);
    assert.ok(arquivos.length > 0, 'a medição precisa de trilhas no repo');
    let piorSegundos = 0;
    let pior = '';
    for (const f of arquivos) {
      const lesson = JSON.parse(readFileSync(f, 'utf8')) as { theory?: TheorySectionJson[] };
      for (const sec of lesson.theory ?? []) {
        const s = segundos(assembled(sec), TYPEWRITER_TPS.theory);
        if (s > piorSegundos) {
          piorSegundos = s;
          pior = `${f} :: ${sec.id}`;
        }
      }
    }
    assert.ok(
      piorSegundos <= 21,
      `a seção mais longa do repo passou do teto: ${piorSegundos.toFixed(1)} s em ${pior}`,
    );
  });
});

describe('ONDA10 defeito 3 — chatBubbleTps roteia a velocidade por bolha', () => {
  it('apresentação de seção (teoria) → velocidade de leitura', () => {
    const s = applyTutorReply(createTrackLessonState(), reply(), 1000);
    assert.equal(isTheoryPresentationBubble(s.history, 0), true);
    assert.equal(chatBubbleTps(s.history, 0), TYPEWRITER_TPS.theory);
    assert.equal(chatBubbleTps(s.history, 0), 7);
  });

  it("resposta do tutor a uma dúvida ('reply') continua LIVRE a 100 tps", () => {
    let s = applyTutorReply(createTrackLessonState(), reply(), 1000);
    s = pushUserMessage(s, 'não entendi', 2000);
    s = applyTutorReply(s, reply({ sectionId: null, message: 'Explico assim…' }), 3000);
    assert.equal(s.history[2].kind, 'reply');
    assert.equal(isTheoryPresentationBubble(s.history, 2), false, 'reply não é teoria');
    assert.equal(chatBubbleTps(s.history, 2), TYPEWRITER_TPS.free);
    assert.equal(chatBubbleTps(s.history, 2), 100);
  });

  it('review do desafio continua a 10 tps (decisão da ONDA1-NAV-UI, intocada)', () => {
    const report: TrackChallengeErrorReport = {
      trackSlug: 'python-iniciante',
      lessonId: 'a-primeira-linha',
      challengeId: 'c1',
      challengeTitle: 'Desafio',
      files: [{ path: 'main.py', code: 'print(1)' }],
      output: 'boom',
      checks: [{ name: 'imprime', passed: false }],
      passedCount: 0,
      totalCount: 1,
    };
    const s = seedChallengeError(createTrackLessonState(), report, 'O que você acha que errou?', {}, 1000);
    assert.equal(s.history[0].kind, 'review');
    assert.equal(chatBubbleTps(s.history, 0), TYPEWRITER_TPS.review);
    assert.equal(chatBubbleTps(s.history, 0), 10);
  });

  it('a pergunta SEMEADA do erro NÃO é teoria (ela cola numa review) → 100 tps', () => {
    const report: TrackChallengeErrorReport = {
      trackSlug: 'python-iniciante',
      lessonId: 'a-primeira-linha',
      challengeId: 'c1',
      challengeTitle: 'Desafio',
      files: [{ path: 'main.py', code: 'print(1)' }],
      output: 'boom',
      checks: [{ name: 'imprime', passed: false }],
      passedCount: 0,
      totalCount: 1,
    };
    const s = seedChallengeError(createTrackLessonState(), report, 'O que você acha que errou?', {}, 1000);
    assert.equal(s.history[1].kind, 'message', 'a pergunta é uma message…');
    assert.equal(isTheoryPresentationBubble(s.history, 1), false, '…mas não é teoria');
    assert.equal(chatBubbleTps(s.history, 1), TYPEWRITER_TPS.free);
  });

  it('mensagem do USUÁRIO e índice fora do histórico não quebram nem viram teoria', () => {
    let s = applyTutorReply(createTrackLessonState(), reply(), 1000);
    s = pushUserMessage(s, 'oi', 2000);
    assert.equal(isTheoryPresentationBubble(s.history, 1), false, 'bolha do aluno não é teoria');
    assert.equal(chatBubbleTps(s.history, 1), TYPEWRITER_TPS.free);
    assert.equal(isTheoryPresentationBubble(s.history, 99), false, 'índice inexistente');
    assert.equal(chatBubbleTps(s.history, 99), TYPEWRITER_TPS.free);
    assert.equal(isTheoryPresentationBubble(s.history, -1), false, 'índice negativo');
  });
});

describe('ONDA10 defeito 3 — o que NÃO mudou de velocidade', () => {
  it('o default GLOBAL do typewriter continua 100 tps (~400 chars/s)', () => {
    assert.equal(TYPEWRITER_TPS.free, 100);
    assert.equal(typewriterCut('x'.repeat(1000), 100), 40, 'default segue ~400 chars/s');
    assert.equal(typewriterDelayPerChar(), 2.5, 'default segue ~2,5 ms/char');
  });

  it('a review segue a 10 tps — nada foi trocado em bloco', () => {
    assert.equal(TYPEWRITER_TPS.review, 10);
    assert.equal(typewriterCut('x'.repeat(1000), 1000, TYPEWRITER_TPS.review), 40, '10 tps = 40 chars/s');
  });

  it('a teoria é a ÚNICA velocidade nova (7 < 10 < 100)', () => {
    assert.ok(TYPEWRITER_TPS.theory < TYPEWRITER_TPS.review);
    assert.ok(TYPEWRITER_TPS.review < TYPEWRITER_TPS.free);
  });
});

describe('ONDA10 defeito 3 — o aluno PULA a animação (não fica refém)', () => {
  const read = (p: string): string => readFileSync(resolve(HERE, p), 'utf8');
  const semComentarios = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('TypewriterText aceita `skip` e VARRE o restante em ~1 s (nunca instantâneo)', () => {
    const code = semComentarios(read('../src/components/chat/TypewriterText.tsx'));
    assert.ok(code.includes('skip = false'), 'o componente precisa do prop skip');
    // ONDA-SKIP-1S — o contrato NOVO (pedido do dono, literal: "ela termina de
    // mostrar tudo em 1s ai calculamos a quantidade de caracteres para saber
    // como mostramos eles com mesmo tempo ate dar um segundo"). O pulo NÃO
    // estoura mais o texto num frame: o corte da varredura vem da função PURA
    // `skipSweepCut` a cada tick de ~16 ms, derivado do tempo decorrido.
    assert.ok(
      code.includes('skipSweepCut('),
      'o corte da varredura vem da função pura skipSweepCut (a conta do dono)',
    );
    assert.ok(
      code.includes('SKIP_SWEEP_TICK_MS'),
      'a varredura roda num laço de tick (~16 ms) — nunca setTimeout por caractere',
    );
    // O caminho INSTANTÂNEO antigo (skip → setCut(text.length) direto) é o
    // defeito que esta onda matou: ele não pode voltar como regra.
    assert.ok(
      !/if \(skip\) \{\s*doneRef\.current = true;\s*setCut\(text\.length\)/.test(code),
      'skip não pode mais completar o texto instantaneamente (a varredura de ~1 s é a regra)',
    );
    // O branch do `skip` inteiro (até o fechamento dele na indentação raiz do
    // efeito): é ele que prova as semânticas de callback do pulo.
    const skipBranch = code.match(/if \(skip\) \{([\s\S]*?)\n    \}/)?.[1] ?? '';
    assert.ok(skipBranch.length > 0, 'o branch do skip precisa existir');
    assert.ok(
      !skipBranch.includes('onStartRef'),
      'pular no meio NÃO re-dispara onStart (a varredura não "recomeça" a digitação)',
    );
    assert.ok(
      skipBranch.includes('sweepRef.current = {'),
      'o skip inicia a varredura do corte ATUAL (cutAtSkip), não do início',
    );
    assert.ok(
      skipBranch.includes('onDoneRef.current?.()'),
      'as exceções instantâneas (texto já inteiro / reduced motion) também avisam onDone',
    );
    // A varredura em si: onTick a cada passo (auto-scroll acompanha) e onDone
    // UMA vez no fim (o guard doneRef sela antes do disparo).
    const sweepBody = code.match(/const startSweep[\s\S]*?SKIP_SWEEP_TICK_MS\)/)?.[0] ?? '';
    assert.ok(sweepBody.length > 0, 'o corpo da varredura (startSweep) precisa existir');
    assert.ok(sweepBody.includes('onTickRef.current?.()'), 'a varredura dispara onTick (auto-scroll)');
    assert.ok(sweepBody.includes('doneRef.current = true'), 'o fim da varredura sela doneRef');
    assert.ok(sweepBody.includes('onDoneRef.current?.()'), 'a varredura termina com onDone');
    // SC 2.3.3 (política do projeto): sob reduced motion o pulo é instantâneo.
    assert.ok(code.includes('prefersReducedMotion()'), 'o pulo honra prefers-reduced-motion: reduce');
    assert.match(code, /\[active, instant, skip, text, tps\]/, 'skip precisa estar nas deps do efeito');
  });

  it('a CONTA da varredura: ~1 s de orçamento, caracteres restantes por igual', () => {
    // O helper PURO é a fórmula da fala do dono (ms por caractere =
    // 1000 / restantes): a varredura termina EXATAMENTE em ~1 s qualquer que
    // seja o tamanho do resto — 1 char ou 500. Fórmula do corte:
    // cut = cutAtSkip + floor(restantes × t / 1000).
    assert.equal(SKIP_SWEEP_MS, 1000, 'o orçamento do pulo é ~1 s');
    assert.ok(Math.abs(skipSweepDelayPerChar(40) - 25) < 1e-9, '40 chars restantes → 25 ms cada');
    assert.ok(Math.abs(skipSweepDelayPerChar(1) - 1000) < 1e-9, '1 char restante → os ~1 s inteiros');
    assert.equal(skipSweepDelayPerChar(0), 0, 'sem resto não há o que agendar');
    const total = 300;
    const cutAtSkip = 120; // 180 caracteres restantes
    assert.equal(skipSweepCut(total, cutAtSkip, 0), cutAtSkip, '0 ms → o corte do pulo (nada pisca)');
    assert.equal(skipSweepCut(total, cutAtSkip, 1000), total, '1000 ms → o texto inteiro');
    assert.equal(skipSweepCut(total, cutAtSkip, 500), 210, 'metade do tempo → metade dos restantes');
  });

  it('a LessonView liga o skip por CLIQUE, por TECLA e por BOTÃO acessível', () => {
    const code = semComentarios(read('../src/views/LessonView/LessonView.tsx'));
    // O log virou bloco (blocks/LessonChatLog): a view LIGA o sinal e o bloco
    // o entrega à bolha — os dois lados da fiação são guardados.
    const logCode = semComentarios(read('../src/views/LessonView/blocks/LessonChatLog.tsx'));
    assert.ok(code.includes('skipTyping={skipTyping}'), 'a view precisa ligar o skip ao bloco do log');
    assert.ok(logCode.includes('skip={props.skipTyping}'), 'a bolha precisa receber o skip');
    assert.ok(code.includes("window.addEventListener('keydown'"), 'qualquer tecla deve pular');
    assert.ok(code.includes('onClick={typingNow ? requestSkipTyping : undefined}'), 'clique no painel deve pular');
    assert.ok(
      code.includes("t('translation:lesson.skipTypingButton')"),
      'precisa existir um botão explícito (teclado/leitor de tela)',
    );
  });

  it('a LessonView usa chatBubbleTps (nada de tps decidido no JSX)', () => {
    const code = semComentarios(read('../src/views/LessonView/blocks/LessonChatLog.tsx'));
    assert.ok(code.includes('tps={chatBubbleTps(chat.history, i)}'), 'o tps vem da função pura');
    assert.ok(
      !code.includes("tps={m.kind === 'review' ? 10 : undefined}"),
      'a escolha antiga (teoria caindo no default 100) não pode voltar',
    );
  });
});
