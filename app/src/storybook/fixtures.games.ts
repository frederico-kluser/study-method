/**
 * src/storybook/fixtures.games.ts — fixtures pt-BR da secção GAMES para as
 * histórias (`Vistas/GamesView`, `Vistas/GameLevelView`).
 *
 * Regras desta pasta (STORY-SPEC §7): os dados partilhados vivem em
 * `src/storybook/fixtures.ts` (propriedade do catálogo — NÃO editar), onde já
 * estão `fixtureGameWorlds`, `fixtureGameLevelPayload` e `fixtureGameRunResult`.
 * Aqui só os VARIANTES que as histórias precisam e que não pertencem ao mock
 * global: progresso do aluno, os starters das TRÊS linguagens do contrato
 * (C/Python/Rust), e os vereditos de submissão (passado com recordes, falhado,
 * sem spoilers de casos ocultos). Mesmo molde de `fixtures.chat.ts`.
 *
 * Tudo respeita o CONTRATO `src/types/games.ts` (TRAVADO): `GameLevelPayload`
 * nunca traz casos hidden (só `caseCount`/`hiddenCount`) e `GameCaseResult`
 * hidden marca-se por ausência de `expected`/`actual` (regra de
 * `gamesUi.isHiddenCase`).
 *
 * PURO: só dados + construtores (sem React, sem DOM).
 */
import type {
  GameLang,
  GameLevelPayload,
  GameRunResult,
  GameWorldSummary,
} from '../types/games';

/* ─── Mapa: progresso do aluno ────────────────────────────────────────────── */

/**
 * Mundos com PROGRESSO do aluno: um mundo meio concluído (com recordes nos
 * nós feitos), um mundo inteiramente concluído (o cartão cai no último nível —
 * repetição permitida) e um mundo ainda por começar.
 */
export const fixtureGameWorldsWithProgress: GameWorldSummary[] = [
  {
    id: 'mundo-eco',
    title: 'O Eco das Variáveis',
    description: 'Entrada e saída, uma variável de cada vez.',
    levels: [
      {
        id: 'nivel-1',
        title: 'Primeiro eco',
        boss: false,
        completed: true,
        bestLines: 6,
        bestTimeMs: 420,
      },
      {
        id: 'nivel-2',
        title: 'Eco em laço',
        boss: false,
        completed: true,
        bestLines: 8,
        bestTimeMs: 512,
      },
      { id: 'nivel-3', title: 'Chefe: o eco multiplicado', boss: true, completed: false },
    ],
  },
  {
    id: 'mundo-labirinto',
    title: 'O Labirinto dos Arrays',
    description: 'Percorrer listas sem se perder.',
    levels: [
      {
        id: 'nivel-1',
        title: 'A primeira porta',
        boss: false,
        completed: true,
        bestLines: 11,
        bestTimeMs: 940,
      },
      {
        id: 'nivel-2',
        title: 'Chefe: o corredor invertido',
        boss: true,
        completed: true,
        bestLines: 14,
        bestTimeMs: 1580,
      },
    ],
  },
  {
    id: 'mundo-torres',
    title: 'As Torres de Recursão',
    description: 'Chamar a si mesmo sem medo.',
    levels: [
      { id: 'nivel-1', title: 'A primeira chamada', boss: false, completed: false },
      { id: 'nivel-2', title: 'A pilha invisível', boss: false, completed: false },
      { id: 'nivel-3', title: 'Chefe: a torre de Hanói', boss: true, completed: false },
    ],
  },
];

/* ─── Nível carregado: os starters das três linguagens ────────────────────── */

/**
 * Starters por linguagem (o contrato de jogo é I/O multi-linguagem: o mesmo
 * nível corre em C, Python ou Rust). O `GameLevelPayload` é UM por linguagem —
 * o contentor recarrega quando a linguagem muda.
 */
export const fixtureGameStarters: Record<GameLang, string> = {
  c: '#include <stdio.h>\n\nint main(void) {\n    /* TODO: leia linhas e devolva "eco: " + linha */\n    return 0;\n}\n',
  python: 'while True:\n    linha = input()\n    # TODO: devolva "eco: " + linha\n',
  rust: 'use std::io::{self, BufRead};\n\nfn main() {\n    // TODO: leia linhas e devolva "eco: " + linha\n}\n',
};

/** O payload do nível "Eco em laço" na linguagem escolhida (sem spoilers). */
export function fixtureGameLevelPayloadFor(lang: GameLang): GameLevelPayload {
  return {
    id: 'nivel-2',
    title: 'Eco em laço',
    enunciado:
      'Leia linhas da entrada e devolva cada uma com o prefixo "eco: ".\n' +
      'A entrada termina quando não há mais linhas.',
    introduces: ['lacos', 'entrada-saida'],
    starter: fixtureGameStarters[lang],
    caseCount: 3,
    hiddenCount: 2,
    optimize: { lines: { par: 8 }, timeMs: { parMs: 500 } },
    boss: false,
  };
}

/** Enunciado LONGO (teste de estouro): identificadores e linha sem espaço. */
export const fixtureGameLevelLongText: GameLevelPayload = {
  ...fixtureGameLevelPayloadFor('python'),
  id: 'nivel-boss',
  title: 'Chefe: o eco multiplicado pela funcao processarRelatorioDoDiaComPrioridade',
  enunciado:
    'Implemente a função `processarRelatorioDoDiaComPrioridade(registroDoDia, prioridadesDosPedidos)` ' +
    'que devolve os pedidos do dia ordenados por prioridade decrescente e, em empate, pela ordem de ' +
    'chegada. A entrada traz N pedidos e as respectivas prioridades; a saída imprime a soma dos pesos ' +
    'somada a (N-1) e, por baixo, os índices dos pedidos escolhidos. Identificadores_longos_sem_espacos ' +
    'também têm de quebrar sem cortar.',
  introduces: ['ordenacao', 'funcoes', 'desempate'],
  boss: true,
};

/* ─── Submissões: os vereditos ────────────────────────────────────────────── */

/** Passado COM recordes (a otimização já venceu o par de linhas). */
export const fixtureGameRunPassedWithRecords: GameRunResult = {
  ok: true,
  completed: true,
  cases: [
    { name: 'eco de uma linha', ok: true, expected: 'eco: olá\n', actual: 'eco: olá\n' },
    { name: 'eco de várias linhas', ok: true, expected: 'eco: a\neco: b\n', actual: 'eco: a\neco: b\n' },
    { name: 'entrada vazia', ok: true, expected: '', actual: '' },
  ],
  metrics: { lines: 6, timeMs: 380 },
  best: { lines: 6, timeMs: 380 },
  histogram: { bins: [2, 4, 7, 5, 2], myIndex: 0, par: 8 },
};

/** Falhado: casos VISÍVEIS com esperado/obtido (nunca recorta o obtido). */
export const fixtureGameRunFailed: GameRunResult = {
  ok: false,
  completed: false,
  cases: [
    { name: 'eco de uma linha', ok: true, expected: 'eco: olá\n', actual: 'eco: olá\n' },
    {
      name: 'eco de várias linhas',
      ok: false,
      expected: 'eco: a\neco: b\n',
      actual: 'eco: a\neco: b\nfalta uma linha\n',
    },
    { name: 'entrada vazia', ok: false, expected: '', actual: '\n' },
  ],
  metrics: { lines: 9, timeMs: 640 },
  best: {},
  histogram: { bins: [3, 6, 4, 1, 0], myIndex: 1, par: 8 },
};

/**
 * SEM SPOILERS (contrato "sem casos hidden"): os casos ocultos aparecem na
 * lista SÓ com ✓/✗ — sem `expected`/`actual` (a regra de `gamesUi.isHiddenCase`
 * é a ausência dos dois campos). A lista deixa ver a mistura de casos
 * visíveis/ocultos sem vazar os valores ocultos.
 */
export const fixtureGameRunWithHidden: GameRunResult = {
  ok: false,
  completed: false,
  cases: [
    { name: 'eco de uma linha', ok: true, expected: 'eco: olá\n', actual: 'eco: olá\n' },
    { name: 'caso oculto 1', ok: true },
    { name: 'caso oculto 2', ok: false },
  ],
  metrics: { lines: 7, timeMs: 520 },
  best: { lines: 7 },
  histogram: { bins: [4, 8, 5, 2, 1], myIndex: 1, par: 8 },
};

/** Primeira submissão passada, SEM recordes ainda (o painel diz "sem recorde"). */
export const fixtureGameRunFirstPass: GameRunResult = {
  ok: true,
  completed: true,
  cases: [
    { name: 'eco de uma linha', ok: true, expected: 'eco: olá\n', actual: 'eco: olá\n' },
    { name: 'eco de várias linhas', ok: true, expected: 'eco: a\neco: b\n', actual: 'eco: a\neco: b\n' },
    { name: 'entrada vazia', ok: true, expected: '', actual: '' },
  ],
  metrics: { lines: 12, timeMs: 980 },
  best: {},
  histogram: { bins: [1, 2, 3, 2, 1], myIndex: 2, par: 8 },
};
