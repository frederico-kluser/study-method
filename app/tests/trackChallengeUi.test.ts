/**
 * tests/trackChallengeUi.test.ts — a LÓGICA PURA do desafio de trilha
 * (`src/views/ChallengeView/trackChallengeUi.ts`), medida sem jsdom.
 *
 * O que prova: a triagem de target no pedido da spec (proficiência tem canal
 * próprio; módulo leva o moduleSlug; aula leva o lessonId), o payload do
 * submit MULTI-ARQUIVO (todos os arquivos + `code` do arquivo ativo; sem
 * `files`, o `code` único histórico), o helper W14 do botão desativado (o
 * primeiro ficheiro por preencher — nunca um CTA mudo) e a triagem do
 * relatório de domínio do módulo (demonstradas × refazer).
 *
 * Reprodução: `cd app && bash tools/t.sh tests/trackChallengeUi.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { TrackChallengeSpec, TrackModuleMasteryReport } from '../shared/ipc-contract';
import type { TrackChallengeNavSelection } from '../src/lib/challengeNav';
import {
  missingSolutionFile,
  splitMastery,
  trackChallengeRequestFor,
  trackSubmitPayload,
} from '../src/views/ChallengeView/trackChallengeUi';

const AULA: TrackChallengeNavSelection = {
  trackSlug: 'python-iniciante',
  target: 'lesson',
  lessonId: 'aula-2',
  challengeId: 'desafio-aula-2-temperatura',
};

const PROFICIENCIA: TrackChallengeNavSelection = {
  trackSlug: 'python-iniciante',
  target: 'proficiency',
  challengeId: 'proficiencia',
};

const MODULO: TrackChallengeNavSelection = {
  trackSlug: 'python-iniciante',
  target: 'module',
  moduleSlug: 'fundamentos',
  challengeId: 'desafio-modulo-fundamentos',
};

const SPEC_MULTIFICHEIRO: Pick<TrackChallengeSpec, 'slug' | 'files'> = {
  slug: 'desafio-aula-2-temperatura',
  files: [
    { path: 'solution.py', starterCode: '# solucao\n' },
    { path: 'test_solution.py', starterCode: '# testes\n' },
  ],
};

const SPEC_UNICO: Pick<TrackChallengeSpec, 'slug' | 'files'> = {
  slug: 'desafio-aula-2-temperatura',
};

describe('trackChallengeRequestFor — a triagem de target', () => {
  it("target 'lesson' leva o lessonId (o canal track:challenge)", () => {
    assert.deepEqual(trackChallengeRequestFor(AULA), {
      trackSlug: 'python-iniciante',
      target: 'lesson',
      lessonId: 'aula-2',
      challengeId: 'desafio-aula-2-temperatura',
    });
  });

  it("target 'proficiency' NÃO leva lessonId (canal track:proficiency)", () => {
    assert.deepEqual(trackChallengeRequestFor(PROFICIENCIA), {
      trackSlug: 'python-iniciante',
      target: 'proficiency',
      challengeId: 'proficiencia',
    });
  });

  it("target 'module' leva o moduleSlug (e nunca o lessonId)", () => {
    assert.deepEqual(trackChallengeRequestFor(MODULO), {
      trackSlug: 'python-iniciante',
      target: 'module',
      moduleSlug: 'fundamentos',
      challengeId: 'desafio-modulo-fundamentos',
    });
  });
});

describe('trackSubmitPayload — multi-arquivo (rodada 9)', () => {
  it('envia o código de TODOS os arquivos + o `code` do arquivo ATIVO', () => {
    const payload = trackSubmitPayload({
      selection: AULA,
      spec: SPEC_MULTIFICHEIRO,
      code: 'ignorado',
      filesCode: {
        'solution.py': 'def para_celsius(f):\n    return (f - 32) * 5 / 9\n',
        'test_solution.py': 'import unittest\n',
      },
      activeFile: 'test_solution.py',
      starsLeft: 2,
    });
    assert.equal(payload.code, 'import unittest\n', 'o `code` tem de ser o do arquivo ATIVO');
    assert.deepEqual(payload.files, [
      { path: 'solution.py', code: 'def para_celsius(f):\n    return (f - 32) * 5 / 9\n' },
      { path: 'test_solution.py', code: 'import unittest\n' },
    ]);
    assert.equal(payload.lessonId, 'aula-2');
    assert.equal(payload.moduleSlug, undefined);
    assert.equal(payload.stars, undefined, 'só a proficiência ecoa estrelas');
  });

  it('ficheiro do spec SEM código do aluno sai vazio (não inventa)', () => {
    const payload = trackSubmitPayload({
      selection: AULA,
      spec: SPEC_MULTIFICHEIRO,
      code: '',
      filesCode: { 'solution.py': 'x' },
      activeFile: 'solution.py',
      starsLeft: 3,
    });
    assert.deepEqual(payload.files, [
      { path: 'solution.py', code: 'x' },
      { path: 'test_solution.py', code: '' },
    ]);
  });

  it('sem `files` envia o `code` único (comportamento histórico)', () => {
    const payload = trackSubmitPayload({
      selection: AULA,
      spec: SPEC_UNICO,
      code: 'console.log(1)\n',
      filesCode: {},
      activeFile: null,
      starsLeft: 3,
    });
    assert.equal(payload.code, 'console.log(1)\n');
    assert.equal(payload.files, undefined);
  });

  it('proficiência ecoa as estrelas; módulo leva o moduleSlug', () => {
    const prof = trackSubmitPayload({
      selection: PROFICIENCIA,
      spec: SPEC_UNICO,
      code: 'c',
      filesCode: {},
      activeFile: null,
      starsLeft: 1,
    });
    assert.equal(prof.stars, 1);
    const mod = trackSubmitPayload({
      selection: MODULO,
      spec: SPEC_UNICO,
      code: 'c',
      filesCode: {},
      activeFile: null,
      starsLeft: 2,
    });
    assert.equal(mod.moduleSlug, 'fundamentos');
    assert.equal(mod.lessonId, undefined);
    assert.equal(mod.stars, undefined);
  });
});

describe('missingSolutionFile — o helper do botão desativado (W14)', () => {
  it('multi-arquivo: o primeiro ficheiro por preencher', () => {
    assert.equal(
      missingSolutionFile({
        multiFile: true,
        files: SPEC_MULTIFICHEIRO.files,
        code: '',
        filesCode: { 'solution.py': 'x' },
      }),
      'test_solution.py',
    );
  });

  it('multi-arquivo: todos preenchidos → null (não há helper)', () => {
    assert.equal(
      missingSolutionFile({
        multiFile: true,
        files: SPEC_MULTIFICHEIRO.files,
        code: '',
        filesCode: { 'solution.py': 'x', 'test_solution.py': 'y' },
      }),
      null,
    );
  });

  it('ficheiro único: sem código → "solution.mjs" (o rótulo não leva nome de ficheiro)', () => {
    assert.equal(
      missingSolutionFile({ multiFile: false, files: undefined, code: '   ', filesCode: {} }),
      'solution.mjs',
    );
  });

  it('ficheiro único: com código → null', () => {
    assert.equal(
      missingSolutionFile({ multiFile: false, files: undefined, code: 'x', filesCode: {} }),
      null,
    );
  });
});

describe('splitMastery — o relatório de domínio do módulo', () => {
  const relatorio: TrackModuleMasteryReport = {
    marcadas: ['aula-1'],
    refazer: ['aula-3'],
    lessons: [
      { lessonId: 'aula-1', title: 'Variáveis', dominada: true, alreadyDone: false, motivo: 'ok' },
      { lessonId: 'aula-2', title: 'Condicionais', dominada: true, alreadyDone: true, motivo: 'já feita' },
      { lessonId: 'aula-3', title: 'Laços', dominada: false, alreadyDone: false, motivo: 'sem evidência' },
      { lessonId: 'aula-4', title: 'Funções', dominada: false, alreadyDone: true, motivo: 'já feita' },
    ],
  };

  it('demonstradas = dominada E não-alreadyDone (o mérito desta tentativa)', () => {
    assert.deepEqual(
      splitMastery(relatorio).demonstradas.map((l) => l.lessonId),
      ['aula-1'],
    );
  });

  it('refazer = não-dominada E não-alreadyDone (só as que o aluno refaz)', () => {
    assert.deepEqual(
      splitMastery(relatorio).refazer.map((l) => l.lessonId),
      ['aula-3'],
    );
  });

  it('sem relatório (erro de análise, alvo não-module) → vazio nos dois lados', () => {
    assert.deepEqual(splitMastery(null), { demonstradas: [], refazer: [] });
  });
});
