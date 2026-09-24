/**
 * tests/cx-services-ipc-contract.test.ts — CARACTERIZAÇÃO (golden master) de
 * `shared/ipc-contract.ts` ANTES da refatoração de core/services.
 *
 * O contrato é CONGELADO no commit prep: os VALORES LITERAIS de canal e de
 * código de erro são a fronteira entre main, preload e renderer. Este arquivo
 * fixa esses literais byte a byte — renomear um canal durante a refatoração é
 * exatamente o tipo de quebra silenciosa que a rede de segurança precisa pegar.
 *
 * (Os TIPOS do contrato não têm representação em runtime; o que é observável
 * aqui são as constantes exportadas — `KEYS_CHANNELS`, `PI_CHANNELS`,
 * `LOCAL_AI_CHANNELS`, `STUDY_CHANNELS`, `TRACK_CHANNELS`, `QUIZ_ERROR_CODES`,
 * `SETTINGS_CHANNELS`, `STT_CHANNELS`, `TTS_CHANNELS`.)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KEYS_CHANNELS,
  LOCAL_AI_CHANNELS,
  PI_CHANNELS,
  QUIZ_ERROR_CODES,
  SETTINGS_CHANNELS,
  STT_CHANNELS,
  STUDY_CHANNELS,
  TRACK_CHANNELS,
  TTS_CHANNELS,
} from '../shared/ipc-contract';

describe('cx/ipc-contract: valores de canal congelados (golden master)', () => {
  it('KEYS_CHANNELS — 5 canais, literais exatos', () => {
    assert.deepEqual(KEYS_CHANNELS, {
      GET_STATUS: 'keys:get-status',
      SET_KEY: 'keys:set-key',
      VALIDATE_LLM: 'keys:validate-llm',
      VALIDATE_BRAVE: 'keys:validate-brave',
      STARTUP_STATUS: 'keys:startup-status',
    });
  });

  it('PI_CHANNELS — 4 canais, literais exatos', () => {
    assert.deepEqual(PI_CHANNELS, {
      EXECUTE: 'pi:execute',
      ABORT: 'pi:abort',
      STREAM_EVENT: 'pi:stream-event',
      GET_STATUS: 'pi:get-status',
    });
  });

  it('LOCAL_AI_CHANNELS — 9 canais, literais exatos', () => {
    assert.deepEqual(LOCAL_AI_CHANNELS, {
      DETECT_HARDWARE: 'localAi:detect-hardware',
      RECOMMEND: 'localAi:recommend',
      LIST: 'localAi:list',
      DOWNLOAD: 'localAi:download',
      DOWNLOAD_PROGRESS: 'localAi:download-progress',
      DELETE: 'localAi:delete',
      GET_ACTIVE: 'localAi:get-active',
      SET_ACTIVE: 'localAi:set-active',
      CHAT: 'localAi:chat',
    });
  });

  it('STUDY_CHANNELS — literais exatos (inclui os aditivos de pesquisa/quiz/reset)', () => {
    assert.deepEqual(STUDY_CHANNELS, {
      RESOLVE_SKILL_DIR: 'study:resolve-skill-dir',
      GET_SETUPS: 'study:get-setups',
      CREATE_SETUP: 'study:create-setup',
      NEW_SESSION: 'study:new-session',
      PLAN_LESSON: 'study:plan-lesson',
      GENERATE_LESSON: 'study:generate-lesson',
      LESSON_PROGRESS: 'study:lesson-progress',
      RESEARCH_PROGRESS: 'study:research-progress',
      GET_LESSON: 'study:get-lesson',
      GET_FINDINGS: 'study:get-findings',
      LIST_CHALLENGES: 'study:list-challenges',
      CREATE_CHALLENGE: 'study:create-challenge',
      VERIFY_CHALLENGE: 'study:verify-challenge',
      TEST_ANSWER: 'study:test-answer',
      TEST_ANSWER_EVENT: 'study:test-answer-event',
      LIST_WORKSPACE_FILES: 'study:list-workspace-files',
      READ_WORKSPACE_FILE: 'study:read-workspace-file',
      WRITE_WORKSPACE_FILE: 'study:write-workspace-file',
      DELETE_WORKSPACE_FILE: 'study:delete-workspace-file',
      LIST_TOPICS: 'study:list-topics',
      LIST_LESSONS_BY_SUBJECT: 'study:list-lessons-by-subject',
      GET_LESSON_BY_ID: 'study:get-lesson-by-id',
      RECORD_ANSWER: 'study:record-answer',
      MARK_LESSON_COMPLETED: 'study:mark-lesson-completed',
      CHECK_MATH_ANSWER: 'study:check-math-answer',
      JUDGE_ANSWER: 'study:judge-answer',
      MARK_CHALLENGE_ATTEMPT: 'study:mark-challenge-attempt',
      CLEAR_PROGRESS: 'study:clear-progress',
    });
  });

  it('TRACK_CHANNELS — literais exatos (inclui órfãos e os 4 do quiz adaptativo)', () => {
    assert.deepEqual(TRACK_CHANNELS, {
      LIST: 'track:list',
      GET: 'track:get',
      LESSON: 'track:lesson',
      LESSON_DONE: 'track:lesson-done',
      TUTOR_CHAT: 'track:tutor-chat',
      CHALLENGE_GET: 'track:challenge',
      CHALLENGE_SUBMIT: 'track:challenge-submit',
      CHALLENGE_REGENERATE: 'track:challenge-regenerate',
      CHALLENGE_REGENERATE_PROGRESS: 'track:challenge-regenerate-progress',
      PROFICIENCY_GET: 'track:proficiency',
      PROFICIENCY_SUBMIT: 'track:proficiency-submit',
      ORPHANS: 'track:orphans',
      PURGE_ORPHANS: 'track:purge-orphans',
      QUIZ_ATTEMPT: 'track:quiz-attempt',
      QUIZ_EXPLAIN: 'track:quiz-explain',
      QUIZ_REMEDIAL: 'track:quiz-remedial',
      QUIZ_HISTORY: 'track:quiz-history',
    });
  });

  it('SETTINGS/STT/TTS_CHANNELS — literais exatos', () => {
    assert.deepEqual(SETTINGS_CHANNELS, {
      GET: 'settings:get',
      SET: 'settings:set',
      GET_SETUPS_DIR: 'settings:get-setups-dir',
      SET_SETUPS_DIR: 'settings:set-setups-dir',
    });
    assert.deepEqual(STT_CHANNELS, {
      MODEL_STATUS: 'stt:model-status',
      MODEL_DOWNLOAD: 'stt:model-download',
      MODEL_DOWNLOAD_PROGRESS: 'stt:model-download-progress',
      MODEL_CANCEL: 'stt:model-cancel',
      MODEL_DELETE: 'stt:model-delete',
      STREAM_START: 'stt:stream-start',
      STREAM_CHUNK: 'stt:stream-chunk',
      STREAM_STOP: 'stt:stream-stop',
      STREAM_CANCEL: 'stt:stream-cancel',
      STREAM_PARTIAL: 'stt:stream-partial',
      ENGINE_STATUS: 'stt:engine-status',
    });
    assert.deepEqual(TTS_CHANNELS, {
      LIST: 'localTts:list',
      DOWNLOAD: 'localTts:download',
      DOWNLOAD_PROGRESS: 'localTts:download-progress',
      CANCEL_DOWNLOAD: 'localTts:cancel-download',
      DELETE: 'localTts:delete',
      GENERATE: 'localTts:generate',
      CANCEL_GENERATE: 'localTts:cancel-generate',
      GET_PREFERENCE: 'localTts:get-preference',
      SET_PREFERENCE: 'localTts:set-preference',
    });
  });

  it('NENHUM valor de canal se repete entre grupos (colisão de handler seria silenciosa)', () => {
    const todos = [
      ...Object.values(KEYS_CHANNELS),
      ...Object.values(PI_CHANNELS),
      ...Object.values(LOCAL_AI_CHANNELS),
      ...Object.values(STUDY_CHANNELS),
      ...Object.values(TRACK_CHANNELS),
      ...Object.values(SETTINGS_CHANNELS),
      ...Object.values(STT_CHANNELS),
      ...Object.values(TTS_CHANNELS),
    ];
    assert.equal(new Set(todos).size, todos.length, 'há canal registrado DUAS vezes');
  });
});

describe('cx/ipc-contract: QUIZ_ERROR_CODES congelado (golden master)', () => {
  it('os 5 códigos e seus literais não mudam', () => {
    assert.deepEqual(QUIZ_ERROR_CODES, {
      UNAVAILABLE: 'QUIZ_UNAVAILABLE',
      EMPTY_REPLY: 'QUIZ_EMPTY_REPLY',
      INVALID_QUIZ: 'QUIZ_INVALID_QUIZ',
      NOT_FOUND: 'QUIZ_NOT_FOUND',
      PERSIST_FAILED: 'QUIZ_PERSIST_FAILED',
    });
  });

  it('os valores são prefixados QUIZ_ e distintos entre si (comparação por string crua fora do enum)', () => {
    const valores = Object.values(QUIZ_ERROR_CODES);
    for (const v of valores) assert.ok(v.startsWith('QUIZ_'), `${v} perdeu o prefixo`);
    assert.equal(new Set(valores).size, valores.length);
  });
});
