/**
 * tests/challengeHooksSsr.test.ts — os HOOKS extraídos da área do Desafio
 * (`src/views/ChallengeView/hooks/*`) sob o padrão da casa: import DINÂMICO
 * (o projeto dos testes não liga `jsx`) + `react-dom/server` (sem jsdom).
 *
 * O que prova (com honestidade sobre os limites): sem DOM os EFEITOS não
 * correm — o que mede o IPC/corrida real é o Storybook/e2e. Aqui fixa-se o
 * contrato do PRIMEIRO render de cada hook: os estados iniciais (o contrato
 * que o container e o `tests/cx-views-gap-track-panel.test.ts` observam) e o
 * facto de os módulos importarem limpos em node (sem CSS do xterm no caminho
 * — o terminal entra por ponte de callbacks, de propósito).
 *
 * Reprodução: `cd app && bash tools/t.sh tests/challengeHooksSsr.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import type { ChallengeInfo } from '../shared/ipc-contract';

const M = (rel: string): string => new URL(`../src/views/ChallengeView/hooks/${rel}`, import.meta.url).href;

const DESAFIO: ChallengeInfo = {
  challengeId: '0001-funcoes-reutilizaveis',
  title: 'Desafio: funções reutilizáveis',
  language: 'python',
  concept: 'funcoes',
  difficulty: 2,
  status: 'validated',
  verdict: 'approved',
  workspaceDir: '/home/aluno/setups/f/challenges/0001-funcoes-reutilizaveis',
  statementPath: '/home/aluno/setups/f/challenges/0001-funcoes-reutilizaveis/README.md',
  slug: 'funcoes-reutilizaveis',
  subjectId: 'subject-1',
};

interface ClockValue {
  starsLeft: number;
  elapsedMs: number;
  timedOut: boolean;
  starsNow(): number;
  elapsedNow(): number;
  isConcluded(): boolean;
  wasTimedOut(): boolean;
  concludeNow(): number;
  onWrongAnswer(): void;
}
interface ListValue {
  challenges: unknown[];
  listing: string;
  listError: string;
  markedForKeyRef: { current: string | null };
  loadChallenges(): Promise<void>;
  markAttempt: (...args: never[]) => void;
}
interface WorkspaceValue {
  files: unknown[];
  statement: string;
  statementError: unknown;
  primaryCodePath: string;
}
interface SubmitValue {
  testStatus: string;
  testResult: unknown;
  testError: string;
  piStatus: string;
  piFinal: string;
  piError: string;
  piErrorKind: string;
  feedbackProvider: unknown;
  blocks: unknown[];
  showThinking: boolean;
  testInFlightRef: { current: boolean };
}

type HookFn<I, O> = (input: I) => O;
let useStarClock: HookFn<Record<string, unknown>, ClockValue>;
let useList: HookFn<{ lastSetupRoot: string | undefined }, ListValue>;
let useWorkspace: HookFn<Record<string, unknown>, WorkspaceValue>;
let useSubmit: HookFn<Record<string, unknown>, SubmitValue>;
let useStream: HookFn<Record<string, unknown>, void>;

let captured: unknown = {};

/** Um harness por hook: chama o hook no render e publica o resultado. */
function Harness({ call }: { call: () => unknown }): ReactElement {
  captured = call();
  return createElement('div', { 'data-harness': '1' });
}

function renderHook(call: () => unknown): unknown {
  renderToStaticMarkup(
    createElement(ThemeProvider, { theme }, createElement(Harness, { call })),
  );
  return captured;
}

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  useStarClock = (await import(M('useChallengeStarClock.ts'))).useChallengeStarClock;
  useList = (await import(M('useChallengeList.ts'))).useChallengeList;
  useWorkspace = (await import(M('useChallengeWorkspace.ts'))).useChallengeWorkspace;
  useSubmit = (await import(M('useChallengeSubmit.ts'))).useChallengeSubmit;
  useStream = (await import(M('useTestAnswerStream.ts'))).useTestAnswerStream;
});

describe('useChallengeStarClock — estados iniciais', () => {
  it('nasce com 3 estrelas, relógio a zero e sem timeout/conclusão', () => {
    const out = renderHook(() =>
      useStarClock({
        challenge: DESAFIO,
        challengeKey: '0001-funcoes-reutilizaveis:/home/aluno/setups/f/challenges/0001-funcoes-reutilizaveis',
        markAttempt: () => {},
        markedForKeyRef: { current: null },
      }),
    ) as unknown as ClockValue;
    assert.equal(out.starsLeft, 3, 'as 3 estrelas iniciais mudaram');
    assert.equal(out.elapsedMs, 0);
    assert.equal(out.timedOut, false);
    assert.equal(out.isConcluded(), false);
    assert.equal(out.wasTimedOut(), false);
  });

  it('sem tracker as estrelas mostram INITIAL_STARS (3) e a duração é real', () => {
    const out = renderHook(() =>
      useStarClock({
        challenge: null,
        challengeKey: null,
        markAttempt: () => {},
        markedForKeyRef: { current: null },
      }),
    ) as unknown as ClockValue;
    assert.equal(out.starsNow(), 3);
    assert.ok(out.elapsedNow() >= 0);
    // concludeNow congela e devolve a duração (o mark 'passed' usa-a).
    const duracao = out.concludeNow();
    assert.ok(duracao >= 0);
    assert.equal(out.isConcluded(), true);
  });
});

describe('useChallengeList / useChallengeWorkspace — estados iniciais', () => {
  it('a lista nasce vazia, em ' + "'" + 'idle' + "'" + ' e sem erro', () => {
    const out = renderHook(() => useList({ lastSetupRoot: undefined })) as unknown as ListValue;
    assert.deepEqual(out.challenges, []);
    assert.equal(out.listing, 'idle');
    assert.equal(out.listError, '');
    assert.equal(out.markedForKeyRef.current, null);
  });

  it('o workspace nasce vazio (sem enunciado, sem erro, sem ficheiro principal)', () => {
    const out = renderHook(() =>
      useWorkspace({ challenge: DESAFIO, onResetDownstream: () => {} }),
    ) as unknown as WorkspaceValue;
    assert.deepEqual(out.files, []);
    assert.equal(out.statement, '');
    assert.equal(out.statementError, null);
    assert.equal(out.primaryCodePath, '');
  });
});

describe('useChallengeSubmit / useTestAnswerStream — estados iniciais', () => {
  it('as duas fases nascem ' + "'" + 'idle' + "'" + ' (sem veredito, sem erro, sem provedor)', () => {
    const out = renderHook(() =>
      useSubmit({
        challenge: DESAFIO,
        challengeKey: 'k',
        statement: '',
        primaryCodePath: '',
        markAttempt: () => {},
        markedForKeyRef: { current: null },
        clock: {
          starsLeft: 3,
          elapsedMs: 0,
          timedOut: false,
          starsNow: () => 3,
          elapsedNow: () => 0,
          isConcluded: () => false,
          wasTimedOut: () => false,
          concludeNow: () => 0,
          onWrongAnswer: () => {},
        },
        saveEditor: () => Promise.resolve(true),
        output: {
          printBanner: () => {},
          writeAborted: () => {},
          writeFailure: () => {},
        },
      }),
    ) as unknown as SubmitValue;
    assert.equal(out.testStatus, 'idle');
    assert.equal(out.piStatus, 'idle');
    assert.equal(out.testError, '');
    assert.equal(out.piError, '');
    assert.equal(out.piFinal, '');
    assert.equal(out.feedbackProvider, null);
    assert.deepEqual(out.blocks, []);
    assert.equal(out.testInFlightRef.current, false);
  });

  it('a subscrição do stream monta sem efeitos (SSR) e sem rebentar', () => {
    const out = renderHook(() => {
      useStream({ isInFlight: () => true, onPhase: () => {} });
      return {};
    });
    assert.deepEqual(out, {}, 'useTestAnswerStream não devolve estado (só subscreve)');
  });
});
