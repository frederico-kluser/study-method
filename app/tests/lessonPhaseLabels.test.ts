/**
 * tests/lessonPhaseLabels.test.ts — lessonPhaseKey / lessonPhaseIndex
 * (mapeamento puro fase→rótulo i18n da aula).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { lessonPhaseKey, lessonPhaseIndex, LESSON_PHASE_ORDER } from '../src/lib/lessonPhaseLabels';

describe('lessonPhaseKey', () => {
  it('mapeia cada fase do parser para a i18n-key correspondente', () => {
    assert.equal(lessonPhaseKey('pesquisando'), 'lesson.phase.research');
    assert.equal(lessonPhaseKey('autorando'), 'lesson.phase.authoring');
    assert.equal(lessonPhaseKey('materializando'), 'lesson.phase.materializing');
    assert.equal(lessonPhaseKey('validando'), 'lesson.phase.validating');
    assert.equal(lessonPhaseKey('concluindo'), 'lesson.phase.done');
  });

  it("fase 'gerando' (inicial/genérica) cai no rótulo neutro done", () => {
    assert.equal(lessonPhaseKey('gerando'), 'lesson.phase.done');
  });
});

describe('lessonPhaseIndex', () => {
  it('devolve o índice na ordem de exibição', () => {
    assert.equal(lessonPhaseIndex('pesquisando'), 0);
    assert.equal(lessonPhaseIndex('autorando'), 1);
    assert.equal(lessonPhaseIndex('materializando'), 2);
    assert.equal(lessonPhaseIndex('validando'), 3);
    assert.equal(lessonPhaseIndex('concluindo'), 4);
  });

  it('a ordem de exibição contém 5 rótulos válidos', () => {
    assert.equal(LESSON_PHASE_ORDER.length, 5);
    assert.deepEqual(
      [...new Set(LESSON_PHASE_ORDER)],
      LESSON_PHASE_ORDER, // sem duplicatas
    );
  });
});