/**
 * tests/roadmapUnlockDiff.test.ts — "o que acabou de destravar" (onda11-cadeado).
 *
 * O dono pediu o destravamento COM EFEITO. O risco de um efeito é virar ruído:
 * se toda aula destravada brilhasse a cada visita, a trilha inteira piscaria
 * sempre — e §8.2 do ux-redesign mede que feedback ritualizado ATRAPALHA
 * (d=-0,40). Este arquivo trava a regra que separa uma coisa da outra: só a
 * TRANSIÇÃO travada → destravada, e só uma vez.
 *
 * Sem jsdom: o diff é função pura sobre um store de módulo (src/lib/roadmapNav).
 */
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetRoadmapNavForTests,
  createUnlockDiffHolder,
  diffUnlockedSinceLastVisit,
} from '../src/lib/roadmapNav';

beforeEach(() => {
  __resetRoadmapNavForTests();
});

const TRAVADA = { slug: 'aula-2', locked: true };
const ABERTA = { slug: 'aula-2', locked: false };
const PRIMEIRA = { slug: 'aula-1', locked: false };

describe('diffUnlockedSinceLastVisit (onda11-cadeado)', () => {
  it('a PRIMEIRA visita da sessão nunca acende nada (não sabemos o que mudou)', () => {
    // A trilha inteira poderia estar destravada há semanas: dizer "destravou
    // agora" aqui seria mentira.
    assert.deepEqual(diffUnlockedSinceLastVisit('t', [PRIMEIRA, ABERTA]), []);
  });

  it('travada → destravada entre duas visitas: é ISSO que o efeito anuncia', () => {
    diffUnlockedSinceLastVisit('t', [PRIMEIRA, TRAVADA]);
    assert.deepEqual(diffUnlockedSinceLastVisit('t', [PRIMEIRA, ABERTA]), ['aula-2']);
  });

  it('a visita SEGUINTE não repete o anúncio (o efeito não vira ruído)', () => {
    diffUnlockedSinceLastVisit('t', [PRIMEIRA, TRAVADA]);
    diffUnlockedSinceLastVisit('t', [PRIMEIRA, ABERTA]);
    assert.deepEqual(diffUnlockedSinceLastVisit('t', [PRIMEIRA, ABERTA]), []);
  });

  it('aula que continua destravada, ou que fecha, não conta', () => {
    diffUnlockedSinceLastVisit('t', [PRIMEIRA, ABERTA]);
    // continua aberta: nada mudou.
    assert.deepEqual(diffUnlockedSinceLastVisit('t', [PRIMEIRA, ABERTA]), []);
    // e o caminho inverso (destravada → travada) não é destravamento nenhum.
    assert.deepEqual(diffUnlockedSinceLastVisit('t', [PRIMEIRA, TRAVADA]), []);
  });

  it('proficiência aprovada destrava VÁRIAS — todas na ordem da trilha', () => {
    diffUnlockedSinceLastVisit('t', [
      PRIMEIRA,
      { slug: 'aula-2', locked: true },
      { slug: 'aula-3', locked: true },
    ]);
    assert.deepEqual(
      diffUnlockedSinceLastVisit('t', [
        PRIMEIRA,
        { slug: 'aula-2', locked: false },
        { slug: 'aula-3', locked: false },
      ]),
      ['aula-2', 'aula-3'],
    );
  });

  it('o snapshot é POR TRILHA — o avanço numa não inventa mudança na outra', () => {
    diffUnlockedSinceLastVisit('trilha-a', [TRAVADA]);
    diffUnlockedSinceLastVisit('trilha-b', [TRAVADA]);
    assert.deepEqual(diffUnlockedSinceLastVisit('trilha-b', [ABERTA]), ['aula-2']);
    // a trilha A não foi tocada: o snapshot dela ainda diz "travada".
    assert.deepEqual(diffUnlockedSinceLastVisit('trilha-a', [TRAVADA]), []);
  });

  it('aula NOVA no payload (que nasce destravada) não conta como destravamento', () => {
    diffUnlockedSinceLastVisit('t', [PRIMEIRA]);
    assert.deepEqual(diffUnlockedSinceLastVisit('t', [PRIMEIRA, ABERTA]), []);
  });
});

describe('createUnlockDiffHolder (anti-StrictMode)', () => {
  it('a 2ª passada da MESMA montagem repete a resposta (o efeito não some no dev)', () => {
    diffUnlockedSinceLastVisit('t', [PRIMEIRA, TRAVADA]);
    const holder = createUnlockDiffHolder();
    assert.deepEqual(holder.get('t', [PRIMEIRA, ABERTA]), ['aula-2']);
    // O StrictMode monta duas vezes e a 2ª é a que fica na tela: sem o
    // retentor, ela veria "nada mudou" (o snapshot já foi gravado).
    assert.deepEqual(holder.get('t', [PRIMEIRA, ABERTA]), ['aula-2']);
  });

  it('trocar de trilha na MESMA montagem calcula um diff novo (não repete o da anterior)', () => {
    diffUnlockedSinceLastVisit('trilha-a', [TRAVADA]);
    diffUnlockedSinceLastVisit('trilha-b', [TRAVADA]);
    const holder = createUnlockDiffHolder();
    assert.deepEqual(holder.get('trilha-a', [ABERTA]), ['aula-2']);
    assert.deepEqual(holder.get('trilha-b', [TRAVADA]), []);
    assert.deepEqual(holder.get('trilha-a', [ABERTA]), ['aula-2'], 'a retenção é por trilha');
  });

  it('uma montagem NOVA volta a calcular (cada visita à trilha é uma pergunta nova)', () => {
    diffUnlockedSinceLastVisit('t', [TRAVADA]);
    assert.deepEqual(createUnlockDiffHolder().get('t', [ABERTA]), ['aula-2']);
    assert.deepEqual(createUnlockDiffHolder().get('t', [ABERTA]), [], 'já anunciado na montagem anterior');
  });
});
