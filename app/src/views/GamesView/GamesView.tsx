/**
 * app/src/views/GamesView/GamesView.tsx — TELA 1 da secção Games: o MAPA do
 * mundo, mockup canónico `.recon/games-research/jogo-na-pratica.html` §02.
 *
 * ONDA-GAMES (vertical slice). O contrato de tipos é `src/types/games.ts`
 * (TRAVADO) e a API chega por `getApi().games.*` (shim tipado em `gamesApi.ts`).
 *
 * ─── O QUE ESTE ARQUIVO TEM ────────────────────────────────────────────────
 *  - `GamesMap` — o mapa de UM mundo: cabeçalho (title + description), a linha
 *    de nós (cada nível = nó quadrado r12; o chefe = círculo de acento) e o
 *    cartão do nível atual (introduções em tags + "Jogar nível N"). Puro de
 *    IPC: recebe dados por props (é o que tests/gamesView.test.ts renderiza).
 *  - `GamesScreen` — a tela completa com os QUATRO estados: loading
 *    (LinearProgress + título estável), erro (Alert + retentativa), empty
 *    ("Nenhum mundo instalado ainda") e ok (mapa(s) + seletor de linguagem).
 *  - `GamesView` (default) — o CONTENTOR: `games.listWorlds()` na montagem,
 *    pré-carrega o payload do nível atual de cada mundo (só para as
 *    introduções do cartão), guarda a linguagem em ESTADO e alterna com a
 *    `GameLevelView` quando o aluno clica em "Jogar nível N".
 *
 * ─── DECISÕES (HOUSE-RULES.md aplicadas) ───────────────────────────────────
 *  1. "QUEBRA, NUNCA RECORTA" (SC 1.4.12 / F104): todo o texto tem
 *     `overflow-wrap: 'break-word'` + `white-space: 'normal'`; nenhum
 *     ellipsis. `break-word` e não `anywhere` (regra 2 da casa: `anywhere`
 *     esmaga o min-content a ~1 glifo e o flexbox parte palavras ao meio).
 *     Em 360px tudo colapsa em coluna única (flexDirection column no xs).
 *  2. Regra 3b (tinta vs acento): rótulos são TINTA; o acento entra só como
 *     PREENCHIMENTO (nós do mapa, badge do chefe) — medidas de contraste
 *     documentadas nos pontos de cor.
 *  3. Outline do documento: h5/h1 = título estável da tela ("Jogos"), h6/h2 =
 *     cabeçalho do mundo e secções, subtitle1/h3 = título do cartão. A
 *     escolha h6 (e não h4) para o cabeçalho do mundo é a do contrato de UI
 *     desta onda; o `component` é que mantém o outline h1→h2→h3 correto.
 *  4. i18n: toda a copy visível vem de `t('translation:games.*')` (interpolação
 *     pelo cast `tI` da casa), em pt-BR e en.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { SHAPE, LAYOUT } from '../../lib/designTokens';
import { SR_ONLY_SX } from '../../lib/a11yStyles';
import { wrappingActionSx } from '../../lib/layoutSx';
import { RetryAlert } from '../../components/ui/RetryAlert';
import { IPC_TIMEOUT_MS, isTimeoutError, withTimeout } from '../../lib/ipcTimeout';
import type {
  GameLang,
  GameLevelPayload,
  GameLevelSummary,
  GameWorldSummary,
} from '../../types/games';
import {
  firstOpenLevelIndex,
  formatLines,
  formatMs,
  levelNodeState,
  previewKey,
  worldLevelCounts,
  type GameNodeState,
} from './gamesUi';
import {
  advanceLevelPick,
  buildLevelPick,
  focusLevelOf,
  type LevelPick,
} from './gamesSelection';
import { getGamesApi } from './gamesApi';
import GameLevelView, { GameLangSelector } from './GameLevelView';

/** Lado do nó do mapa (>= 44px: o nó comunica estado e não pode ser minúsculo). */
const NODE_PX = 48;

/**
 * Texto só para leitores de tela (o nó mostra só o número; o estado e o nome
 * do nível viajam nesta etiqueta). O estilo é o `SR_ONLY_SX` canónico de
 * `src/lib/a11yStyles.ts` — a cópia CORRETA deste ficheiro (px em string,
 * `pointerEvents: 'none'`) que virou o primitivo único depois de a régua F104
 * ter apanhado as caixas fantasma a ocupar 100% do contentor (o bug está
 * documentado lá).
 */

/** Chave i18n do estado de cada nó (union literal: `strictKeyChecks`). */
const STATE_I18N_KEY: Record<
  GameNodeState,
  'translation:games.state.done' | 'translation:games.state.current' | 'translation:games.state.locked'
> = {
  done: 'translation:games.state.done',
  current: 'translation:games.state.current',
  locked: 'translation:games.state.locked',
};

/** Chave i18n do plural de níveis/chefes (padrão `_one`/`_other` da casa). */
function pluralKey(base: 'levels' | 'bosses', count: number): string {
  return `games.world.${base}_${count === 1 ? 'one' : 'other'}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Linha de nós do mapa
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface GameLevelNodeRowProps {
  levels: ReadonlyArray<GameLevelSummary>;
  /** Índice do nível "atual" (primeiro não concluído), de `firstOpenLevelIndex`. */
  openIndex: number;
  /** Título do mundo (para a etiqueta acessível da linha). */
  worldTitle: string;
}

/**
 * A linha de nós: cada nível é um quadrado de raio 12 (`SHAPE.md`) e o chefe é
 * um CÍRCULO de acento; as setas entre nós são CSS (glifo `›` decorativo,
 * `aria-hidden` — a sequência está no `<ol>` e nas etiquetas de cada nó).
 *
 * Estados por preenchimento (regra 3b: fill, nunca rótulo colorido):
 *   concluído → success.fill  [medido] onFill x fill = 5,03:1 (claro) / 9,78:1 (escuro)
 *   atual     → primary.fill  [medido] onFill x fill = 4,70:1 (claro) / 5,42:1 (escuro)
 *   bloqueado → surface.level2 + text.secondary
 *               [medido] text.secondary x level2 = 6,62:1 (claro) / 7,05:1 (escuro)
 *   chefe     → CÍRCULO com identidade de ACENTO em TODOS os estados (o
 *               "accent" laranja do mockup canónico, família `warn`), mas o
 *               ESTADO continua legível pelos três tratos distintos:
 *                 atual     → warning.fill (onFill x fill = 4,86:1 / 9,62:1)
 *                 bloqueado → surface.level2 + borda TRACEJADA warning
 *                 concluído → success.fill + borda SÓLIDA warning
 *               [medido] warning.fill x surface.level2 = 4,13:1 (borda x fill)
 *               [medido] warning.fill x surface.level0 = 4,46:1 (borda x página)
 *               (a borda é não-texto, SC 1.4.11: piso 3:1 — os dois pares
 *               passam; a borda do "concluído" lê-se contra a PÁGINA, já
 *               contra o próprio fill de sucesso a distância é de matiz).
 *               DECISÃO: o par "fill + borda" substitui o fill uniforme que
 *               deixava os três estados do chefe IGUAIS (achado
 *               e2e-games.spec.ts: 01-mapa vs 06-mapa-progresso).
 */
export function GameLevelNodeRow({
  levels,
  openIndex,
  worldTitle,
}: GameLevelNodeRowProps): ReactElement {
  const { t, i18n } = useTranslation();
  const tI = i18n.t.bind(i18n) as unknown as (
    key: string,
    options?: Record<string, string | number>,
  ) => string;

  return (
    <Box
      component="ol"
      aria-label={tI('translation:games.map.levelsAria', { world: worldTitle })}
      sx={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, m: 0, p: 0 }}
    >
      {levels.map((level, i) => {
        const state = levelNodeState(level, i, openIndex);
        const aria = level.boss
          ? tI('translation:games.map.bossAria', {
              title: level.title,
              state: t(STATE_I18N_KEY[state]),
            })
          : tI('translation:games.map.nodeAria', {
              n: i + 1,
              title: level.title,
              state: t(STATE_I18N_KEY[state]),
            });
        return (
          <Box
            component="li"
            key={level.id}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, position: 'relative' }}
          >
            {/* Seta CSS entre nós (decorativa: a ordem vive no <ol>). */}
            {i > 0 ? (
              <Box
                component="span"
                aria-hidden="true"
                sx={(theme) => ({
                  color: theme.vars.palette.divider,
                  fontSize: 20,
                  lineHeight: 1,
                  flexShrink: 0,
                })}
              >
                ›
              </Box>
            ) : null}
            <Box
              aria-hidden="true"
              // Atributos de testabilidade (e2e/SSR): o nó mostra só o número,
              // o estado vive na etiqueta sr-only — sem estes atributos não há
              // como o teste distinguir concluído/atual/bloqueado/chefe.
              data-game-node={i}
              data-game-node-state={state}
              data-game-node-boss={level.boss ? 'true' : 'false'}
              sx={(theme) => ({
                width: NODE_PX,
                height: NODE_PX,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: theme.typography.body2.fontSize,
                // O chefe é CÍRCULO; os níveis são quadrados de raio 12.
                borderRadius: level.boss ? '50%' : `${SHAPE.md}px`,
                backgroundColor:
                  state === 'done'
                    ? theme.vars.palette.success.fill
                    : state === 'current'
                      ? level.boss
                        ? theme.vars.palette.warning.fill
                        : theme.vars.palette.primary.fill
                      : theme.vars.palette.surface.level2,
                color:
                  state === 'done'
                    ? theme.vars.palette.success.onFill
                    : state === 'current'
                      ? level.boss
                        ? theme.vars.palette.warning.onFill
                        : theme.vars.palette.primary.onFill
                      : theme.vars.palette.text.secondary,
                // CHEFE: identidade de acento pela BORDA (regra 3b — acento é
                // preenchimento/borda, nunca rótulo) e o ESTADO pelo mesmo
                // eixo dos restantes nós (fill). Três tratos distintos:
                // tracejada = bloqueado, laranja cheio = atual, verde +
                // anel = concluído. As bordas mantêm a caixa em 48px
                // (box-sizing border-box do MuiCssBaseline).
                ...(level.boss
                  ? {
                      boxSizing: 'border-box' as const,
                      border:
                        state === 'locked'
                          ? `2px dashed ${theme.vars.palette.warning.fill}`
                          : `2px solid ${theme.vars.palette.warning.fill}`,
                    }
                  : {}),
              })}
            >
              {level.boss ? 'B' : i + 1}
            </Box>
            {/* Nome + estado do nó para leitores de tela (o nó mostra só o número). */}
            <Box component="span" sx={SR_ONLY_SX}>
              {aria}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GamesMap — o mapa de um mundo
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface GamesMapProps {
  world: GameWorldSummary;
  lang: GameLang;
  onLangChange: (lang: GameLang) => void;
  /**
   * Payloads pré-carregados por `previewKey(worldId, levelId)` — só as
   * INTRODUÇÕES (tags) do cartão do nível atual. Enquanto não chega, o cartão
   * mostra título + recordes + botão (o carregamento é best-effort).
   */
  previews: Record<string, GameLevelPayload | undefined>;
  onPlay: (level: GameLevelSummary, index: number) => void;
  /** Locale ativo (formatação dos recordes). */
  locale: string;
}

/**
 * O mapa de um mundo: cabeçalho (h6/h2 título + description), linha de nós e
 * o cartão do nível atual com introduções (tags) e o botão "Jogar nível N".
 */
export function GamesMap({
  world,
  previews,
  onPlay,
  locale,
}: Omit<GamesMapProps, 'lang' | 'onLangChange'>): ReactElement {
  const { t, i18n } = useTranslation();
  const tI = i18n.t.bind(i18n) as unknown as (
    key: string,
    options?: Record<string, string | number>,
  ) => string;

  const counts = worldLevelCounts(world.levels);
  const openIndex = firstOpenLevelIndex(world.levels);
  // Mundo inteiramente concluído: o cartão mostra o ÚLTIMO nível (repetição é
  // permitida — "Jogar nível N" continua vivo para quem quer otimizar). A
  // regra vive em `gamesSelection.focusLevelOf` (o mesmo alvo do pré-carga).
  const focus = focusLevelOf(world);
  const cardIndex = focus?.index ?? 0;
  const current = focus?.level;
  const preview = current ? previews[previewKey(world.id, current.id)] : undefined;

  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
      {/* Cabeçalho do mundo: variant h6 (escala do mockup) com componente h2
          (outline h1→h2→h3 correto — ver o cabeçalho deste arquivo). */}
      <Box>
        <Typography variant="h6" component="h2" sx={{ whiteSpace: 'normal', overflowWrap: 'break-word' }}>
          {world.title}
        </Typography>
        <Typography
          variant="body2"
          sx={(theme) => ({
            maxWidth: LAYOUT.readingColumnPx,
            color: theme.vars.palette.text.secondary,
            whiteSpace: 'normal',
            overflowWrap: 'break-word',
          })}
        >
          {world.description}
        </Typography>
        <Typography
          variant="caption"
          sx={(theme) => ({
            display: 'block',
            color: theme.vars.palette.text.secondary,
            whiteSpace: 'normal',
            overflowWrap: 'break-word',
          })}
        >
          {`${tI(`translation:${pluralKey('levels', counts.levelCount)}`, {
            count: counts.levelCount,
          })} + ${tI(`translation:${pluralKey('bosses', counts.bossCount)}`, {
            count: counts.bossCount,
          })}`}
        </Typography>
      </Box>

      <GameLevelNodeRow levels={world.levels} openIndex={openIndex} worldTitle={world.title} />

      {current ? (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: 2,
            alignItems: { xs: 'stretch', sm: 'center' },
            minWidth: 0,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              component="h3"
              sx={{ whiteSpace: 'normal', overflowWrap: 'break-word' }}
            >
              {tI('translation:games.map.cardTitle', { n: cardIndex + 1, title: current.title })}
            </Typography>

            {/* Introduções (tags) vindas do payload do nível atual. */}
            {preview && preview.introduces.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                <Typography
                  component="span"
                  variant="caption"
                  sx={(theme) => ({
                    color: theme.vars.palette.text.secondary,
                    whiteSpace: 'normal',
                    overflowWrap: 'break-word',
                  })}
                >
                  {t('translation:games.map.introduces')}
                </Typography>
                {preview.introduces.map((concept) => (
                  <Chip
                    key={concept}
                    size="small"
                    label={concept}
                    sx={(theme) => ({
                      backgroundColor: theme.vars.palette.surface.level2,
                      color: theme.vars.palette.text.secondary,
                      maxWidth: '100%',
                      // O default do MuiChip é nowrap + ellipsis (F104): rótulo
                      // multilinha, quebra por palavra, sem reticências.
                      '& .MuiChip-label': {
                        whiteSpace: 'normal',
                        overflowWrap: 'break-word',
                        textOverflow: 'clip',
                        overflow: 'visible',
                      },
                    })}
                  />
                ))}
              </Box>
            ) : null}

            {/* Recordes do nível (contrato GameLevelSummary.bestLines/bestTimeMs). */}
            <Typography
              variant="caption"
              sx={(theme) => ({
                display: 'block',
                mt: 0.5,
                color: theme.vars.palette.text.secondary,
                whiteSpace: 'normal',
                overflowWrap: 'break-word',
              })}
            >
              {[
                current.bestLines !== undefined
                  ? tI('translation:games.map.recordLines', {
                      value: formatLines(current.bestLines, locale),
                    })
                  : null,
                current.bestTimeMs !== undefined
                  ? tI('translation:games.map.recordTime', {
                      value: formatMs(current.bestTimeMs, locale),
                    })
                  : null,
              ]
                .filter((x): x is string => x !== null)
                .join(' · ')}
            </Typography>
          </Box>

          <Button
            variant="contained"
            onClick={() => onPlay(current, cardIndex)}
            sx={{
              ...wrappingActionSx,
              alignSelf: { xs: 'stretch', sm: 'center' },
            }}
          >
            {tI('translation:games.map.play', { n: cardIndex + 1 })}
          </Button>
        </Paper>
      ) : null}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GamesScreen — a tela do mapa com os quatro estados
 * ═══════════════════════════════════════════════════════════════════════════ */

export type GamesScreenStatus = 'loading' | 'error' | 'empty' | 'ok';

export interface GamesScreenProps {
  status: GamesScreenStatus;
  /** Texto do erro (estado 'error'). */
  errorText: string | null;
  onRetry: () => void;
  worlds: GameWorldSummary[];
  lang: GameLang;
  onLangChange: (lang: GameLang) => void;
  previews: Record<string, GameLevelPayload | undefined>;
  onPlay: (world: GameWorldSummary, level: GameLevelSummary, index: number) => void;
  locale: string;
}

/**
 * A tela do mapa. O h1 ("Jogos") é ESTÁVEL nos quatro estados: a tela não
 * muda de identidade enquanto carrega (o título é da copy, nunca dos dados).
 */
export function GamesScreen({
  status,
  errorText,
  onRetry,
  worlds,
  lang,
  onLangChange,
  previews,
  onPlay,
  locale,
}: GamesScreenProps): ReactElement {
  const { t, i18n } = useTranslation();
  const tI = i18n.t.bind(i18n) as unknown as (
    key: string,
    options?: Record<string, string | number>,
  ) => string;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Typography variant="h5" component="h1" sx={{ whiteSpace: 'normal', overflowWrap: 'break-word' }}>
        {t('translation:games.title')}
      </Typography>

      {status === 'loading' ? (
        <>
          <LinearProgress />
          <Typography
            variant="body2"
            sx={(theme) => ({
              color: theme.vars.palette.text.secondary,
              whiteSpace: 'normal',
              overflowWrap: 'break-word',
            })}
          >
            {t('translation:games.loading')}
          </Typography>
        </>
      ) : null}

      {status === 'error' ? (
        /* Erro + retentativa (auditoria de layout §3): o `RetryAlert`
         * canónico — Alert `error` + "Tentar de novo" com o piso de toque e a
         * quebra de rótulo da casa. A copy do erro continua do chamador. */
        <RetryAlert
          message={errorText ?? t('translation:games.loadError')}
          onRetry={onRetry}
        />
      ) : null}

      {status === 'empty' ? (
        <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
          <Typography variant="h6" component="h2" sx={{ whiteSpace: 'normal', overflowWrap: 'break-word' }}>
            {t('translation:games.empty.title')}
          </Typography>
          <Typography
            variant="body2"
            sx={(theme) => ({
              maxWidth: LAYOUT.readingColumnPx,
              color: theme.vars.palette.text.secondary,
              whiteSpace: 'normal',
              overflowWrap: 'break-word',
            })}
          >
            {t('translation:games.empty.body')}
          </Typography>
        </Paper>
      ) : null}

      {status === 'ok' ? (
        <>
          {/* Seletor de linguagem: a escolha vive em ESTADO (GamesView) e vale
              para as duas telas (mapa e nível). A linguagem muda o starter do
              nível; a mecânica é a mesma (texto da dica). */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              flexWrap: 'wrap',
              alignItems: { xs: 'flex-start', sm: 'center' },
              gap: 1.5,
            }}
          >
            <GameLangSelector value={lang} onChange={onLangChange} />
            <Typography
              variant="caption"
              sx={(theme) => ({
                color: theme.vars.palette.text.secondary,
                whiteSpace: 'normal',
                overflowWrap: 'break-word',
              })}
            >
              {t('translation:games.world.langHint')}
            </Typography>
          </Box>

          {worlds.map((world) => (
            <GamesMap
              key={world.id}
              world={world}
              previews={previews}
              onPlay={(level, index) => onPlay(world, level, index)}
              locale={locale}
            />
          ))}
        </>
      ) : null}
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GamesView — o contentor (IPC + estado)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A view do painel Games do shell (VIEWS.games em App.tsx). Carrega os mundos
 * por `games.listWorlds()`, pré-carrega as introduções do nível atual de cada
 * mundo e alterna mapa ↔ nível SEM sair do painel (o shell só conhece painéis;
 * a troca de tela é interna, com "‹ Voltar ao mapa" a repor o mapa).
 *
 * STATE/VIEW (STORY-SPEC §5): a aritmética da seleção de mundo/nível vive em
 * `gamesSelection.ts` (pura e testada); este contentor só liga estado → view e
 * despacha eventos.
 */
export default function GamesView(): ReactElement {
  const { t, i18n } = useTranslation();

  const [status, setStatus] = useState<GamesScreenStatus>('loading');
  const [worlds, setWorlds] = useState<GameWorldSummary[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  // Linguagem persistida EM ESTADO (pedido do contrato de UI): trocar de
  // linguagem recarrega os starters; a escolha sobrevive à troca de tela.
  const [lang, setLang] = useState<GameLang>('python');
  const [previews, setPreviews] = useState<Record<string, GameLevelPayload | undefined>>({});
  const [levelPick, setLevelPick] = useState<LevelPick | null>(null);
  // Retentativa do carregamento da lista de mundos (estado, não hack).
  const [retryToken, setRetryToken] = useState(0);

  // Lista de mundos: loading → ok | empty | erro (Alert + retentativa).
  // O `empty` é vazio LEGÍTIMO (nenhum mundo instalado) e não erro — o mesmo
  // critério da RoadmapView (`noTracks`).
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setErrorText(null);
    withTimeout(
      Promise.resolve(getGamesApi().listWorlds()),
      IPC_TIMEOUT_MS,
      'games.listWorlds',
    )
      .then((list) => {
        if (cancelled) return;
        setWorlds(list);
        setStatus(list.length === 0 ? 'empty' : 'ok');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorText(
          isTimeoutError(err)
            ? t('translation:games.loadTimeout')
            : t('translation:games.loadError'),
        );
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryToken]);

  // Pré-carrega o payload do nível ATUAL de cada mundo (só as introduções/tags
  // do cartão). Best-effort: se falhar, o cartão simplesmente não mostra tags —
  // o mapa continua completo (título, nós, recordes, botão). O nível alvo é o
  // de `gamesSelection.focusLevelOf` (a MESMA regra do cartão do mapa).
  useEffect(() => {
    if (worlds.length === 0) return;
    let cancelled = false;
    for (const world of worlds) {
      const focus = focusLevelOf(world);
      if (!focus) continue;
      withTimeout(
        Promise.resolve(getGamesApi().loadLevel(world.id, focus.level.id, lang)),
        IPC_TIMEOUT_MS,
        'games.loadLevel',
      )
        .then((payload) => {
          if (cancelled) return;
          setPreviews((prev) => ({ ...prev, [previewKey(world.id, focus.level.id)]: payload }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worlds, lang]);

  const play = useCallback(
    (world: GameWorldSummary, level: GameLevelSummary, index: number): void => {
      setLevelPick(buildLevelPick(world, level, index));
    },
    [],
  );

  // "Avançar ›": salta para o próximo nível do MESMO mundo (mantendo a tela de
  // nível). Sem nível seguinte (fim do mundo) o botão não é renderizado; id
  // desconhecido mantém a seleção atual (`advanceLevelPick`, puro).
  const advance = useCallback(
    (nextId: string): void => {
      setLevelPick((prev) => (prev ? advanceLevelPick(worlds, prev, nextId) : prev));
    },
    [worlds],
  );

  // "‹ Voltar ao mapa": repõe o mapa E RE-BUSCA os mundos. O progresso muda
  // DENTRO do nível (o `games.run` conclui níveis) e o mapa nunca pode mentir
  // sobre ele: sem a re-busca, o `worlds` do mount mantinha o nível acabado de
  // concluir como "atual" (achado do e2e-games.spec.ts — o cenário feliz
  // media exatamente esta transição). O `retryToken` é a machinery existente
  // da retentativa (o efeito de carga da lista depende dele).
  const backToMap = useCallback(() => {
    setLevelPick(null);
    setRetryToken((n) => n + 1);
  }, []);

  if (levelPick) {
    return (
      <GameLevelView
        worldId={levelPick.worldId}
        worldTitle={levelPick.worldTitle}
        levelId={levelPick.levelId}
        levelTitle={levelPick.levelTitle}
        levelIndex={levelPick.levelIndex}
        boss={levelPick.boss}
        lang={lang}
        onLangChange={setLang}
        nextLevelId={levelPick.nextLevelId}
        onBack={backToMap}
        onAdvance={advance}
      />
    );
  }

  return (
    <GamesScreen
      status={status}
      errorText={errorText}
      onRetry={() => setRetryToken((n) => n + 1)}
      worlds={worlds}
      lang={lang}
      onLangChange={setLang}
      previews={previews}
      onPlay={play}
      locale={i18n.language}
    />
  );
}
