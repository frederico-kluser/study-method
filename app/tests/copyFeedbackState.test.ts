/**
 * tests/copyFeedbackState.test.ts — a máquina de ESTADO do feedback de cópia
 * do bloco de código, sem jsdom.
 *
 * Extração state/view da onda Storybook: `CodeBlock.tsx` desenha e fia os
 * timers; as TRANSIÇÕES do botão "Copiar" (idle → copied | failed → idle) e a
 * duração do hold vivem na pura `src/lib/copyFeedbackState.ts` e são
 * exercitadas aqui:
 *
 *   BLOCO 1 — as transições por evento (copy ok / copy com falha / hold).
 *   BLOCO 2 — o HOLD: duração nomeada (~2 s do audit) e o regresso a idle.
 *   BLOCO 3 — o que a VIEW lê do estado (ícone de confirmação × erro) — os
 *     dois booleanos que o componente tinha antes admitiam combinações ilegais.
 *   BLOCO 4 — sequências completas (uma sessão de cópia a correr de verdade).
 *
 * Reprodução: `bash tools/t.sh tests/copyFeedbackState.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  COPIED_HOLD_MS,
  copyFeedbackAfterCopy,
  copyFeedbackAfterHold,
  copyFeedbackIsFailure,
  copyFeedbackShowsCheck,
  type CopyFeedback,
} from '../src/lib/copyFeedbackState';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ═══════════════════════ BLOCO 1 — transições por evento ═════════════════ */

describe('copyFeedbackState — as transições do botão "Copiar"', () => {
  it('cópia com SUCESSO → "Copiado ✓" (copied)', () => {
    assert.equal(copyFeedbackAfterCopy(true), 'copied');
  });

  it('cópia com FALHA → estado visível de erro (failed) — nunca silêncio (W15)', () => {
    assert.equal(copyFeedbackAfterCopy(false), 'failed');
  });

  it('o hold expirado volta ao repouso (idle)', () => {
    assert.equal(copyFeedbackAfterHold(), 'idle');
  });

  it('os estados são exatamente idle/copied/failed — UM de cada vez', () => {
    const estados: CopyFeedback[] = ['idle', 'copied', 'failed'];
    assert.deepEqual(estados, ['idle', 'copied', 'failed']);
    // Transição total: todo evento produz um dos três, nunca uma combinação.
    for (const ok of [true, false]) {
      const next = copyFeedbackAfterCopy(ok);
      assert.ok(estados.includes(next));
    }
    assert.ok(estados.includes(copyFeedbackAfterHold()));
  });
});

/* ═══════════════════════════ BLOCO 2 — o HOLD ════════════════════════════ */

describe('o hold da confirmação', () => {
  it('a duração é NOMEADA e curta (~2 s do audit — ler sem arrastar)', () => {
    assert.equal(COPIED_HOLD_MS, 2000);
  });

  it('os DOIS caminhos (sucesso e falha) partilham a mesma duração', () => {
    // O contrato: "Mesma duração curta do 'Copiado ✓'" para a falha (W15).
    // Guarda de FONTE: o componente agenda o reset com o CONSTANTE nomeada e
    // não escreve o número — nem um segundo valor para o estado de erro.
    const fonte = readFileSync(resolve(HERE, '../src/components/markdown/CodeBlock.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    assert.ok(
      /window\.setTimeout\([\s\S]*?COPIED_HOLD_MS\)/.test(fonte),
      'o reset do feedback é agendado pela constante nomeada (não um número solto)',
    );
    assert.equal(fonte.includes('2000'), false, 'sem duração duplicada no componente');
  });
});

/* ═══════════════════════ BLOCO 3 — o que a VIEW lê ═══════════════════════ */

describe('a leitura da view (ícone/aria sobre o estado)', () => {
  it('só "copied" mostra o ✓ (o ícone de confirmação)', () => {
    assert.equal(copyFeedbackShowsCheck('copied'), true);
    assert.equal(copyFeedbackShowsCheck('idle'), false);
    assert.equal(copyFeedbackShowsCheck('failed'), false);
  });

  it('só "failed" é erro (a cor do botão vira error.accentText)', () => {
    assert.equal(copyFeedbackIsFailure('failed'), true);
    assert.equal(copyFeedbackIsFailure('idle'), false);
    assert.equal(copyFeedbackIsFailure('copied'), false);
  });

  it('copied e failed nunca são verdadeiros ao mesmo tempo', () => {
    for (const estado of ['idle', 'copied', 'failed'] as const) {
      const ambos = copyFeedbackShowsCheck(estado) && copyFeedbackIsFailure(estado);
      assert.equal(ambos, false, `estado ${estado} não pode ser ✓ e erro`);
    }
  });
});

/* ═══════════════════════ BLOCO 4 — sequências completas ══════════════════ */

describe('uma sessão de cópia a correr de verdade', () => {
  it('idle → copy ok → copied → hold → idle', () => {
    let estado: CopyFeedback = 'idle';
    estado = copyFeedbackAfterCopy(true);
    assert.equal(estado, 'copied');
    estado = copyFeedbackAfterHold();
    assert.equal(estado, 'idle');
  });

  it('falha no meio de um "Copiado ✓" pendente substitui o estado (nunca empilha)', () => {
    let estado: CopyFeedback = 'idle';
    estado = copyFeedbackAfterCopy(true);
    assert.equal(estado, 'copied');
    // O aluno clica de novo e a 2ª cópia FALHA: o timeout anterior é substituído
    // (o componente limpa o timer antigo) e o estado passa a failed.
    estado = copyFeedbackAfterCopy(false);
    assert.equal(estado, 'failed');
    estado = copyFeedbackAfterHold();
    assert.equal(estado, 'idle');
  });

  it('seguidas tentativas falhadas não "acampan" — cada uma termina em idle', () => {
    for (let i = 0; i < 3; i += 1) {
      let estado: CopyFeedback = copyFeedbackAfterCopy(false);
      assert.equal(estado, 'failed');
      estado = copyFeedbackAfterHold();
      assert.equal(estado, 'idle');
    }
  });
});
