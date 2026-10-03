/**
 * tests/challengeUi.test.ts — a LÓGICA PURA da tela de Desafio
 * (`src/views/ChallengeView/challengeUi.ts`), medida sem jsdom.
 *
 * O que prova: o acumulador de blocos do stream do pi (um bloco por tipo
 * CONSECUTIVO — o pi manda dezenas de deltas pequenos), o filtro do disclosure
 * "Raciocínio", a identidade da tentativa (key de idempotência do mark), a
 * escolha do arquivo principal do workspace (o stub que o avaliador lê) e a
 * severidade do bloco de veredito (S1: sucesso/parcial/nada).
 *
 * Reprodução: `cd app && bash tools/t.sh tests/challengeUi.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  appendDelta,
  challengeAttemptKey,
  hasStreamOutput,
  primaryCodePathOf,
  streamBlocksVisible,
  verdictSeverity,
  type StreamingBlock,
} from '../src/views/ChallengeView/challengeUi';

describe('appendDelta — blocos por tipo consecutivo', () => {
  it('acrescenta o primeiro bloco à lista vazia', () => {
    const out = appendDelta([], 'text', 'Olá');
    assert.deepEqual(out, [{ kind: 'text', text: 'Olá' }]);
  });

  it('acumula deltas do MESMO tipo consecutivo num bloco só', () => {
    let blocos: StreamingBlock[] = [];
    blocos = appendDelta(blocos, 'thinking', 'o teste ');
    blocos = appendDelta(blocos, 'thinking', 'falha porque…');
    assert.equal(blocos.length, 1, 'dois deltas seguidos criaram dois blocos');
    assert.deepEqual(blocos[0], { kind: 'thinking', text: 'o teste falha porque…' });
  });

  it('abre bloco NOVO quando o tipo muda e volta a acumular', () => {
    let blocos: StreamingBlock[] = [];
    blocos = appendDelta(blocos, 'thinking', 'a');
    blocos = appendDelta(blocos, 'text', 'b');
    blocos = appendDelta(blocos, 'text', 'c');
    blocos = appendDelta(blocos, 'thinking', 'd');
    assert.deepEqual(blocos, [
      { kind: 'thinking', text: 'a' },
      { kind: 'text', text: 'bc' },
      { kind: 'thinking', text: 'd' },
    ]);
  });

  it('NUNCA muta o bloco anterior (imutabilidade — o React compara por identidade)', () => {
    const entrada: StreamingBlock[] = [{ kind: 'text', text: 'x' }];
    const out = appendDelta(entrada, 'text', 'y');
    assert.equal(entrada[0].text, 'x', 'appendDelta mutou o bloco de entrada');
    assert.notEqual(out, entrada);
    assert.notEqual(out[0], entrada[0]);
  });
});

describe('disclosure "Raciocínio" — o que o painel mostra', () => {
  const blocos: StreamingBlock[] = [
    { kind: 'thinking', text: 'pensar' },
    { kind: 'text', text: 'falar' },
    { kind: 'tool', text: '⚙ edit' },
    { kind: 'error', text: 'boom' },
  ];

  it('fechado esconde SÓ os blocos de pensamento', () => {
    assert.deepEqual(
      streamBlocksVisible(blocos, false).map((b) => b.kind),
      ['text', 'tool', 'error'],
    );
  });

  it('aberto mostra tudo', () => {
    assert.deepEqual(streamBlocksVisible(blocos, true), blocos);
  });

  it('só pensamento não preenche a caixa (sem texto/ferramenta/erro)', () => {
    assert.equal(hasStreamOutput([{ kind: 'thinking', text: 'x' }]), false);
    assert.equal(hasStreamOutput([]), false);
  });

  it('texto, ferramenta OU erro preenchem a caixa', () => {
    assert.equal(hasStreamOutput([{ kind: 'text', text: 'x' }]), true);
    assert.equal(hasStreamOutput([{ kind: 'tool', text: '⚙' }]), true);
    assert.equal(hasStreamOutput([{ kind: 'error', text: 'x' }]), true);
  });
});

describe('challengeAttemptKey — a identidade da tentativa', () => {
  it('é `${challengeId}:${workspaceDir}` (a key das guardas de idempotência)', () => {
    assert.equal(
      challengeAttemptKey({
        challengeId: '0001-funcoes-reutilizaveis',
        workspaceDir: '/home/aluno/setups/f/challenges/0001-funcoes-reutilizaveis',
      }),
      '0001-funcoes-reutilizaveis:/home/aluno/setups/f/challenges/0001-funcoes-reutilizaveis',
    );
  });

  it('desafios diferentes nunca colidem', () => {
    const a = challengeAttemptKey({ challengeId: 'a', workspaceDir: '/w/a' });
    const b = challengeAttemptKey({ challengeId: 'b', workspaceDir: '/w/b' });
    assert.notEqual(a, b);
  });
});

describe('primaryCodePathOf — o arquivo principal do workspace', () => {
  it('escolhe o primeiro candidato de código (não-diretório, extensão conhecida)', () => {
    assert.equal(
      primaryCodePathOf([
        { path: 'README.md', dir: false },
        { path: 'test_solution.py', dir: false },
        { path: 'solution.py', dir: false },
      ]),
      'test_solution.py',
    );
  });

  it('ignora diretórios e extensões que não são código', () => {
    assert.equal(
      primaryCodePathOf([
        { path: 'src', dir: true },
        { path: 'dados.ts', dir: true },
        { path: 'notas.md', dir: false },
        { path: 'solucao.rs', dir: false },
      ]),
      'solucao.rs',
    );
  });

  it('sem candidatos devolve vazio (o pi não recebe stub)', () => {
    assert.equal(primaryCodePathOf([]), '');
    assert.equal(primaryCodePathOf([{ path: 'README.md', dir: false }]), '');
  });

  it('reconhece as extensões do contrato (py/js/ts/jsx/tsx/go/rs/c/rb/sql)', () => {
    for (const f of ['a.py', 'a.js', 'a.ts', 'a.jsx', 'a.tsx', 'a.go', 'a.rs', 'a.c', 'a.rb', 'a.sql']) {
      assert.equal(primaryCodePathOf([{ path: f, dir: false }]), f, `extensão ${f} não reconhecida`);
    }
  });
});

describe('verdictSeverity — a semântica das contagens (S1)', () => {
  it('passou → sucesso', () => {
    assert.equal(verdictSeverity({ passed: true, testsRun: 3 }), 'success');
  });

  it('PARCIAL (alguns casos passaram) → warning — a gravidade não inflaciona', () => {
    assert.equal(verdictSeverity({ passed: false, testsRun: 2 }), 'warning');
  });

  it('NADA passou → error', () => {
    assert.equal(verdictSeverity({ passed: false, testsRun: 0 }), 'error');
  });

  it('sem resultado (semântica de null) → error', () => {
    assert.equal(verdictSeverity(null), 'error');
  });
});
