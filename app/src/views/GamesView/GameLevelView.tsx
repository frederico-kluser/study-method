/**
 * app/src/views/GamesView/GameLevelView.tsx — TELA 2 da secção Games: o NÍVEL
 * (o coração do jogo), mockup canónico `.recon/games-research/jogo-na-pratica.html`
 * §03.
 *
 * ONDA-GAMES (vertical slice). O contrato de tipos é `src/types/games.ts`
 * (TRAVADO) e a API chega por `getApi().games.*` (shim em `gamesApi.ts`).
 *
 * ─── O QUE ESTE ARQUIVO TEM ────────────────────────────────────────────────
 *  - `GameLangSelector` — o seletor de linguagem (ToggleButtonGroup C/Python/
 *    Rust) das DUAS telas. Vive AQUI e não em GamesView.tsx de propósito: a
 *    GamesView importa a GameLevelView (a troca mapa↔nível é da GamesView) e
 *    um import inverso criaria um ciclo de módulos. A direção única é
 *    GamesView → GameLevelView.
 *  - `GameLevelPanel` — o CONTEÚDO do nível já com dados (enunciado, editor,
 *    "Testar resposta", casos, painel de otimização). Puro de IPC: recebe tudo
 *    por props. É o que os testes SSR (tests/gamesLevelView.test.ts) renderizam
 *    com fixtures reais.
 *  - `GameLevelView` (default) — o CONTENTOR: carrega o payload por
 *    `games.loadLevel(worldId, levelId, lang)`, corre `games.run(...)`, gere
 *    busy/erro e manda o resultado para o painel.
 *
 * ─── DECISÕES DA CASA APLICADAS (HOUSE-RULES.md) ───────────────────────────
 *  1. "QUEBRA, NUNCA RECORTA" (SC 1.4.12 / F104): TODO texto tem
 *     `overflow-wrap: 'break-word'` + `white-space: 'normal'`; NUNCA ellipsis,
 *     NUNCA `overflow: hidden` em folhas de texto. `break-word` e não
 *     `anywhere` (regra 2: `anywhere` esmaga o min-content a ~1 glifo). Os
 *     blocos esperado/obtido são mono e quebram por palavra em qualquer
 *     largura (360px incluído: o layout colapsa em coluna única).
 *  2. Regra 3b (tinta vs acento): o texto é TINTA (`text.primary`/
 *     `text.secondary`); o acento só entra como PREENCHIMENTO (nós, barras do
 *     histograma, badge "chefe") ou borda. As medidas de contraste estão nos
 *     comentários dos pontos de cor.
 *  3. Alvos de toque ≥ 44px (piso `TARGET.minTouchTargetPx`; as ações
 *     multilinha usam `wrappingActionSx` de `lib/layoutSx`).
 *  4. i18n: toda a copy visível vem de `t('translation:games.*')` /
 *     `challenge.testAnswer` (reuso do padrão do app). Interpolação pelo cast
 *     `tI` da casa.
 */
import { useCallback, useEffect, useReducer, useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { CodeMirrorField } from '../../components/cm/CodeMirrorField';
import { RetryAlert } from '../../components/ui/RetryAlert';
import { LAYOUT, SHAPE, TARGET } from '../../lib/designTokens';
import { wrappingActionSx } from '../../lib/layoutSx';
import {
  IPC_TIMEOUT_MS,
  isTimeoutError,
  withTimeout,
} from '../../lib/ipcTimeout';
import type {
  GameLang,
  GameLevelPayload,
  GameRunResult,
} from '../../types/games';
import {
  formatLines,
  formatMs,
  GAME_LANGS,
  histogramBarCenterPercent,
  histogramBarHeights,
  histogramBetterThanPercent,
  histogramParIndex,
  isHiddenCase,
} from './gamesUi';
import {
  hasLevelLoadError,
  initialGameLevelState,
  reduceGameLevelState,
} from './gameLevelState';
import { getGamesApi } from './gamesApi';

/**
 * ALTURA TOTAL da barra de ação pegajosa (W13) — medida da PRÓPRIA barra, sem
 * magic number solto: botão de `TARGET.minTouchTargetPx` (44px) + o `p: 1` do
 * Paper que a envolve (8px em cima + 8px em baixo) + as duas bordas de 1px =
 * 62px. Medido no app rodando (apanhado do e2e-games.spec.ts): a caixa da
 * barra assenta em 62px exatos (rect 706..768).
 *
 * PARA QUE SERVE (achado do e2e-games sobre o print 04): a barra é
 * `position: sticky; bottom: 0` — enquanto pinned cobre a última faixa do
 * viewport, e o conteúdo que passa por baixo dela fica escondido nessa faixa.
 * A RESERVA (padding-bottom do contentor de conteúdo = altura da barra, logo
 * abaixo do slot de fluxo da barra) garante que todo o conteúdo do nível pode
 * ser levado a LIMPO por scroll: no fim do scroll a barra assenta na zona
 * reservada e as ações do painel de otimização ("Otimizar"/"Avançar ›") ficam
 * inteiramente visíveis — era exatamente elas que apareciam a meio cortadas.
 */
const ACTION_BAR_PX = TARGET.minTouchTargetPx + 2 * 8 + 2 * 1;

/**
 * Arquivo-fantasia por linguagem: o `CodeMirrorField` escolhe o realce de
 * sintaxe pela EXTENSÃO do nome de arquivo (`extensionsForFilename`), então o
 * starter de cada linguagem é editado com a gramática certa.
 */
const EDITOR_FILENAME: Record<GameLang, string> = {
  c: 'solution.c',
  python: 'solution.py',
  rust: 'solution.rs',
};

/**
 * Chave i18n do rótulo de cada linguagem. UNION literal de propósito: o
 * `strictKeyChecks` do i18next só valida chaves LITERAIS, e um template
 * dinâmico (`games.lang.${lang}`) passaria despercebido até ao runtime.
 */
const LANG_I18N_KEY: Record<
  GameLang,
  'translation:games.lang.c' | 'translation:games.lang.python' | 'translation:games.lang.rust'
> = {
  c: 'translation:games.lang.c',
  python: 'translation:games.lang.python',
  rust: 'translation:games.lang.rust',
};

/* ═══════════════════════════════════════════════════════════════════════════
 * GameLangSelector — seletor de linguagem das duas telas
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface GameLangSelectorProps {
  /** Linguagem selecionada (estado vive na GamesView — "persistir em estado"). */
  value: GameLang;
  onChange: (lang: GameLang) => void;
}

/**
 * ToggleButtonGroup exclusivo C/Python/Rust. Os botões têm o piso de toque de
 * 44px e rótulo com quebra por palavra (um "Python" não trunca nunca, em
 * nenhum idioma). O grupo publica `aria-label` (é um `role="group"` implícito
 * do MUI) para o leitor de tela anunciar "Linguagem do jogo".
 */
export function GameLangSelector({ value, onChange }: GameLangSelectorProps): ReactElement {
  const { t } = useTranslation();
  return (
    <ToggleButtonGroup
      exclusive
      value={value}
      onChange={(_e, next: GameLang | null) => {
        if (next && next !== value) onChange(next);
      }}
      aria-label={t('translation:games.lang.aria')}
      sx={(theme) => ({
        flexWrap: 'wrap',
        // O default do ToggleButtonGroup tem raio no grupo e retângulos
        // colados; aqui cada botão é uma pastilha da família SHAPE.sm com
        // folga entre eles (o mesmo critério visual dos chips do app).
        gap: 0.5,
        '& .MuiToggleButton-root': {
          minHeight: TARGET.minTouchTargetPx,
          minWidth: TARGET.minTouchTargetPx,
          px: 1.5,
          border: `1px solid ${theme.vars.palette.divider}`,
          borderRadius: `${SHAPE.sm}px`,
          color: theme.vars.palette.text.primary,
          fontSize: theme.typography.body2.fontSize,
          fontWeight: 600,
          textTransform: 'none',
          // QUEBRA, NUNCA RECORTA: rótulo multilinha em vez de ellipsis.
          whiteSpace: 'normal',
          overflowWrap: 'break-word',
          textOverflow: 'clip',
          '&.Mui-selected': {
            // Fronteira de nível (regra 3b): o item selecionado é PREENCHIMENTO
            // de acento com tinta em cima — nunca rótulo colorido.
            // [medido] ACCENT_LIGHT.action.onFill x action.fill = 4,70:1
            // [medido] ACCENT_DARK.action.onFill x action.fill = 5,42:1
            backgroundColor: theme.vars.palette.primary.fill,
            color: theme.vars.palette.primary.onFill,
            '&:hover': { backgroundColor: theme.vars.palette.primary.fill },
          },
        },
      })}
    >
      {GAME_LANGS.map((lang) => (
        <ToggleButton key={lang} value={lang} aria-label={t(LANG_I18N_KEY[lang])}>
          {t(LANG_I18N_KEY[lang])}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GameLevelPanel — o conteúdo do nível já com dados (sem IPC)
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface GameLevelPanelProps {
  worldTitle: string;
  levelTitle: string;
  /** Número do nível, 1-based ("Jogar nível 3", "Nível 3 de 6"). */
  levelIndex: number;
  boss: boolean;
  lang: GameLang;
  onLangChange: (lang: GameLang) => void;
  enunciado: string;
  code: string;
  onCodeChange: (code: string) => void;
  optimize: GameLevelPayload['optimize'];
  busy: boolean;
  /** Resultado da última submissão (null = ainda não testou). */
  runResult: GameRunResult | null;
  /** Erro de infraestrutura da submissão (null = sem erro). */
  runError: string | null;
  /** id do nível seguinte, ou null no fim do mundo (esconde "Avançar ›"). */
  nextLevelId: string | null;
  onBack: () => void;
  onTest: () => void;
  onAdvance: (levelId: string) => void;
  /** Locale ativo (formatação das métricas: "1,2 s" pt-BR / "1.2 s" en). */
  locale: string;
}

/** Rótulo ✓/✗ de um caso: `role="img"` + `aria-label` (o glifo é decorativo). */
function CaseMark({ ok }: { ok: boolean }): ReactElement {
  const { t } = useTranslation();
  return (
    <Box
      component="span"
      role="img"
      aria-label={ok ? t('translation:games.level.passed') : t('translation:games.level.failed')}
      sx={(theme) => ({
        // Glifo é PREENCHIMENTO semântico (não texto): 3:1 chega.
        // [medido] ACCENT_LIGHT.success.fill x SURFACE_LIGHT.level1 = 5,03:1
        // [medido] ACCENT_DARK.success.fill x SURFACE_DARK.level1 = 8,42:1
        // [medido] ACCENT_LIGHT.error.fill x SURFACE_LIGHT.level1 = 5,81:1
        // [medido] ACCENT_DARK.error.fill x SURFACE_DARK.level1 = 4,99:1
        color: ok
          ? theme.vars.palette.success.fill
          : theme.vars.palette.error.fill,
        fontWeight: 700,
        flexShrink: 0,
      })}
    >
      {ok ? '✓' : '✗'}
    </Box>
  );
}

/** Bloco mono esperado/obtido — quebra por palavra, nunca recorta. */
function CaseValue({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <Box sx={{ mt: 0.5, minWidth: 0 }}>
      <Typography
        component="span"
        variant="caption"
        sx={(theme) => ({
          display: 'block',
          color: theme.vars.palette.text.secondary,
          whiteSpace: 'normal',
          overflowWrap: 'break-word',
        })}
      >
        {label}
      </Typography>
      <Box
        component="span"
        sx={(theme) => ({
          display: 'block',
          fontFamily: theme.typography.code.fontFamily,
          fontSize: theme.typography.code.fontSize,
          lineHeight: theme.typography.code.lineHeight,
          color: theme.vars.palette.text.primary,
          backgroundColor: theme.vars.palette.surface.level2,
          borderRadius: `${SHAPE.sm}px`,
          p: 0.75,
          mt: 0.25,
          // Mono também quebra POR PALAVRA (pedido explícito do contrato de
          // UI): identificadores longos só partem quando não cabe de todo.
          whiteSpace: 'normal',
          overflowWrap: 'break-word',
          textOverflow: 'clip',
        })}
      >
        {/* trimEnd() só no DISPLAY (achado e2e-games): os valores do contrato
            trazem a quebra de linha final ("Bem-vindo, Ana!\n") e o bloco mono
            desenhava uma linha vazia por baixo. O contrato/runner não muda. */}
        {value.trimEnd()}
      </Box>
    </Box>
  );
}

/**
 * O painel de OTIMIZAÇÃO (só aparece após um `ok`): 2 métricas (linhas/tempo)
 * com valor + par + recorde, o histograma CSS local (barras em %, barra "tu"
 * em acento, marcador do par) e a legenda "a tua solução: melhor que N%".
 * A aritmética é toda de `gamesUi.ts` (pura e testada).
 */
function OptimizationPanel({
  runResult,
  optimize,
  nextLevelId,
  onTest,
  onAdvance,
  locale,
}: {
  runResult: GameRunResult;
  optimize: GameLevelPayload['optimize'];
  nextLevelId: string | null;
  onTest: () => void;
  onAdvance: (levelId: string) => void;
  locale: string;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const tI = i18n.t.bind(i18n) as unknown as (
    key: string,
    options?: Record<string, string | number>,
  ) => string;

  const { metrics, best, histogram } = runResult;
  const heights = histogramBarHeights(histogram.bins);
  const parIndex = histogramParIndex({
    // Convenção TRAVADA em gamesUi.ts: bins unitários ancorados em
    // (metrics.lines, myIndex) → marcador do par em myIndex + (par − myLines).
    par: histogram.par,
    myLines: metrics.lines,
    myIndex: histogram.myIndex,
    binCount: histogram.bins.length,
  });
  const parLeftPercent = histogramBarCenterPercent(parIndex, histogram.bins.length);
  const betterPercent = histogramBetterThanPercent(histogram.bins, histogram.myIndex);

  const metricCard = (
    title: string,
    value: string,
    par: string,
    record: string,
  ): ReactElement => (
    <Box
      sx={(theme) => ({
        backgroundColor: theme.vars.palette.surface.level1,
        border: `1px solid ${theme.vars.palette.divider}`,
        borderRadius: `${SHAPE.md}px`,
        p: 1.25,
        minWidth: 0,
      })}
    >
      <Typography
        variant="caption"
        sx={(theme) => ({
          display: 'block',
          color: theme.vars.palette.text.secondary,
          whiteSpace: 'normal',
          overflowWrap: 'break-word',
        })}
      >
        {title}
      </Typography>
      <Typography
        sx={(theme) => ({
          fontFamily: theme.typography.code.fontFamily,
          fontWeight: 700,
          fontSize: '1.05rem',
          color: theme.vars.palette.text.primary,
          whiteSpace: 'normal',
          overflowWrap: 'break-word',
        })}
      >
        {value}
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
        {par}
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
        {record}
      </Typography>
    </Box>
  );

  return (
    <Paper
      variant="outlined"
      sx={(theme) => ({
        mt: 2,
        p: 2,
        // Cartão com BORDA primária (pedido do contrato de UI): acento como
        // BORDA é papel de 3:1 (não-texto, SC 1.4.11).
        // [medido] ACCENT_LIGHT.action.fill x SURFACE_LIGHT.level1 = 4,70:1
        // [medido] ACCENT_DARK.action.fill x SURFACE_DARK.level1 = 4,66:1
        border: `2px solid ${theme.vars.palette.primary.fill}`,
        borderRadius: `${SHAPE.md}px`,
      })}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          flexWrap: 'wrap',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 1,
        }}
      >
        <Typography variant="h6" component="h2" sx={{ overflowWrap: 'break-word' }}>
          {t('translation:games.opt.title')}
        </Typography>
        <Chip
          size="small"
          label={t('translation:games.opt.hint')}
          sx={(theme) => ({
            backgroundColor: theme.vars.palette.surface.level2,
            color: theme.vars.palette.text.secondary,
            maxWidth: '100%',
            // O default do MuiChip é nowrap + ellipsis (F104 puro): rótulo
            // multilinha, quebra por palavra, sem reticências.
            '& .MuiChip-label': {
              whiteSpace: 'normal',
              overflowWrap: 'break-word',
              textOverflow: 'clip',
              overflow: 'visible',
            },
          })}
        />
      </Box>

      {/* 2 métricas: valor + par + recorde (linhas e tempo). Coluna única em
          360px (mobile), duas colunas a partir do sm. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1,
          mt: 1.5,
        }}
      >
        {metricCard(
          t('translation:games.opt.lines'),
          formatLines(metrics.lines, locale),
          tI('translation:games.opt.par', {
            value: `${formatLines(optimize.lines.par, locale)} ${t('translation:games.opt.lines')}`,
          }),
          best.lines !== undefined
            ? tI('translation:games.opt.record', {
                value: `${formatLines(best.lines, locale)} ${t('translation:games.opt.lines')}`,
              })
            : t('translation:games.opt.noRecord'),
        )}
        {metricCard(
          t('translation:games.opt.time'),
          formatMs(metrics.timeMs, locale),
          tI('translation:games.opt.par', { value: formatMs(optimize.timeMs.parMs, locale) }),
          best.timeMs !== undefined
            ? tI('translation:games.opt.record', { value: formatMs(best.timeMs, locale) })
            : t('translation:games.opt.noRecord'),
        )}
      </Box>

      {/* Histograma CSS: divs com altura %, barra "tu" em acento (laranja do
          mockup canónico = família `warn` do designTokens) e marcador do par.
          O gráfico é decorativo (`aria-hidden`): o que ele diz está na legenda
          em TEXTO logo abaixo (SC 1.1.1). */}
      <Box sx={{ mt: 2 }}>
        <Typography
          variant="caption"
          sx={(theme) => ({
            display: 'block',
            color: theme.vars.palette.text.secondary,
            whiteSpace: 'normal',
            overflowWrap: 'break-word',
          })}
        >
          {t('translation:games.opt.histTitle')}
        </Typography>
        <Box
          aria-hidden="true"
          sx={(theme) => ({
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '3px',
            height: 48,
            mt: 1,
            // Piso de 3:1 para o marcador do par desenhar sobre a área do
            // gráfico (o fundo é o nível 1 de leitura):
            // [medido] INK_LIGHT.secondary x SURFACE_LIGHT.level1 = 7,79:1
            // [medido] INK_DARK.secondary x SURFACE_DARK.level1 = 8,61:1
            backgroundColor: theme.vars.palette.surface.level1,
          })}
        >
          {heights.map((h, i) => (
            <Box
              key={i}
              // Atributos de testabilidade (e2e/SSR): a barra "tu" e o índice
              // são IMPOSSÍVEIS de localizar por texto (o gráfico é aria-hidden).
              data-game-bar={i}
              data-game-bar-me={i === histogram.myIndex ? 'true' : 'false'}
              sx={(theme) => ({
                flex: 1,
                minWidth: 0,
                height: `${h}%`,
                borderRadius: `${SHAPE.sm}px ${SHAPE.sm}px 0 0`,
                // Barra "TU": acento como PREENCHIMENTO (regra 3b) — o laranja
                // do mockup, família `warn` do contrato de tokens.
                // [medido] ACCENT_LIGHT.warn.fill x SURFACE_LIGHT.level1 = 4,86:1
                // [medido] ACCENT_DARK.warn.fill x SURFACE_DARK.level1 = 8,28:1
                backgroundColor:
                  i === histogram.myIndex
                    ? theme.vars.palette.warning.fill
                    : theme.vars.palette.primary.fill,
                opacity: i === histogram.myIndex ? 1 : 0.28,
              })}
            />
          ))}
          {/* Marcador do PAR: linha tracejada vertical na posição calculada
              (gamesUi.histogramParIndex), com etiqueta de texto. */}
          <Box
            data-game-par-marker="true"
            sx={(theme) => ({
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${parLeftPercent}%`,
              width: 0,
              borderLeft: `2px dashed ${theme.vars.palette.text.secondary}`,
            })}
          >
            <Typography
              component="span"
              variant="caption"
              sx={(theme) => ({
                position: 'absolute',
                top: -2,
                left: 2,
                color: theme.vars.palette.text.secondary,
                // Tamanho CAPTION normal (achado e2e-games): os 0.62rem
                // (~10px) eram a menor tipografia da tela, abaixo da legenda
                // secundária do app — contraste ok, legibilidade mínima.
                fontSize: theme.typography.caption.fontSize,
                whiteSpace: 'normal',
                overflowWrap: 'break-word',
              })}
            >
              {t('translation:games.opt.parMarker')}
            </Typography>
          </Box>
        </Box>
        {/* Legenda em TEXTO: é ela que o leitor de tela anuncia (o gráfico é
            aria-hidden) e é ela que diz o resultado da otimização. */}
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
          {tI('translation:games.opt.betterThan', { percent: betterPercent })}
        </Typography>
      </Box>

      {/* Ações: "Otimizar" só RE-TESTA o código atual; "Avançar ›" vai ao
          próximo nível (escondido no fim do mundo). */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          flexWrap: 'wrap',
          gap: 1,
          mt: 2,
        }}
      >
        <Button
          variant="outlined"
          startIcon={<ReplayIcon />}
          onClick={onTest}
          sx={wrappingActionSx}
        >
          {t('translation:games.opt.optimize')}
        </Button>
        {nextLevelId !== null ? (
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            onClick={() => onAdvance(nextLevelId)}
            sx={wrappingActionSx}
          >
            {t('translation:games.opt.advance')}
          </Button>
        ) : null}
      </Box>
    </Paper>
  );
}

/** A lista de casos: visíveis com esperado/obtido, escondidos só ✓/✗. */
function CaseList({ runResult }: { runResult: GameRunResult }): ReactElement {
  const { t, i18n } = useTranslation();
  const tI = i18n.t.bind(i18n) as unknown as (
    key: string,
    options?: Record<string, string | number>,
  ) => string;
  const passCount = runResult.cases.filter((c) => c.ok).length;
  return (
    <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
      <Typography variant="h6" component="h2" sx={{ overflowWrap: 'break-word' }}>
        {t('translation:games.level.casesTitle')}
      </Typography>
      <Typography
        variant="body2"
        sx={(theme) => ({
          color: theme.vars.palette.text.secondary,
          whiteSpace: 'normal',
          overflowWrap: 'break-word',
        })}
      >
        {tI('translation:games.level.summary', { ok: passCount, total: runResult.cases.length })}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {runResult.cases.map((c, i) => {
          const hidden = isHiddenCase(c);
          return (
            <Box
              component="li"
              key={`${c.name}-${i}`}
              sx={(theme) => ({
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                py: 0.75,
                minWidth: 0,
                borderTop: i === 0 ? 'none' : `1px solid ${theme.vars.palette.divider}`,
              })}
            >
              <CaseMark ok={c.ok} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="body2"
                  sx={(theme) => ({
                    fontWeight: 600,
                    color: theme.vars.palette.text.primary,
                    whiteSpace: 'normal',
                    overflowWrap: 'break-word',
                  })}
                >
                  {/* Caso escondido: SÓ "caso escondido" + ✓/✗ — nunca valores
                      (o contrato não os traz por definição: sem spoilers). */}
                  {hidden ? t('translation:games.level.caseHidden') : c.name}
                </Typography>
                {!hidden ? (
                  <>
                    {c.expected !== undefined ? (
                      <CaseValue label={t('translation:games.level.expected')} value={c.expected} />
                    ) : null}
                    {c.actual !== undefined ? (
                      <CaseValue label={t('translation:games.level.actual')} value={c.actual} />
                    ) : null}
                  </>
                ) : null}
              </Box>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

/**
 * Cabeçalho ESTÁVEL da tela do nível — usado pelo contentor em loading/erro e
 * pelo painel em ok. "‹ Voltar ao mapa" + trilha + título (h1 da tela) + badge
 * "chefe". O título vem das PROPS (conhecido desde o mapa), nunca do payload:
 * a tela não muda de identidade enquanto carrega (mesmo critério do título
 * estável do estado de loading da GamesView).
 */
interface GameLevelHeaderProps {
  worldTitle: string;
  levelTitle: string;
  levelIndex: number;
  boss: boolean;
  onBack: () => void;
}

function GameLevelHeader({
  worldTitle,
  levelTitle,
  levelIndex,
  boss,
  onBack,
}: GameLevelHeaderProps): ReactElement {
  const { t, i18n } = useTranslation();
  const tI = i18n.t.bind(i18n) as unknown as (
    key: string,
    options?: Record<string, string | number>,
  ) => string;
  return (
    <Box>
      <Button
        variant="text"
        onClick={onBack}
        sx={wrappingActionSx}
      >
        {t('translation:games.level.back')}
      </Button>
      {/* Trilha de navegação do nível (o título abaixo é o h1 da tela). */}
      <Typography
        variant="caption"
        sx={(theme) => ({
          display: 'block',
          color: theme.vars.palette.text.secondary,
          whiteSpace: 'normal',
          overflowWrap: 'break-word',
        })}
      >
        {tI('translation:games.level.eyebrow', { world: worldTitle, n: levelIndex })}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          flexWrap: 'wrap',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 1,
        }}
      >
        {/* Outline: h5/h1 = título da TELA (padrão de SettingsView/RoadmapView);
            as secções abaixo são h6/h2. */}
        <Typography variant="h5" component="h1" sx={{ overflowWrap: 'break-word' }}>
          {levelTitle}
        </Typography>
        {boss ? (
          <Chip
            size="small"
            data-game-boss-badge="true"
            label={t('translation:games.boss.badge')}
            sx={(theme) => ({
              // Badge "chefe" com FILL de acento (laranja do mockup canónico =
              // família `warn` dos tokens): rótulo em cima do fill é papel de
              // 4,5:1.
              // [medido] ACCENT_LIGHT.warn.onFill x warn.fill = 4,86:1
              // [medido] ACCENT_DARK.warn.onFill x warn.fill = 9,62:1
              backgroundColor: theme.vars.palette.warning.fill,
              color: theme.vars.palette.warning.onFill,
              fontWeight: 700,
              maxWidth: '100%',
              '& .MuiChip-label': {
                whiteSpace: 'normal',
                overflowWrap: 'break-word',
                textOverflow: 'clip',
                overflow: 'visible',
              },
            })}
          />
        ) : null}
      </Box>
    </Box>
  );
}

/**
 * O conteúdo do nível. O cabeçalho publica o título ESTÁVEL (a prop
 * `levelTitle`, que o contentor conhece desde o mapa) — ele não muda enquanto
 * o payload carrega, então a tela não "pula" (o mesmo critério do título
 * estável do estado de loading da GamesView).
 */
export function GameLevelPanel({
  worldTitle,
  levelTitle,
  levelIndex,
  boss,
  lang,
  onLangChange,
  enunciado,
  code,
  onCodeChange,
  optimize,
  busy,
  runResult,
  runError,
  nextLevelId,
  onBack,
  onTest,
  onAdvance,
  locale,
}: GameLevelPanelProps): ReactElement {
  const { t, i18n } = useTranslation();
  const tI = i18n.t.bind(i18n) as unknown as (
    key: string,
    options?: Record<string, string | number>,
  ) => string;

  return (
    // RESERVA DE SCROLL da barra pegajosa (W13): `pb` = `ACTION_BAR_PX` — o
    // contentor de scroll é o `main` do shell e a reserva vive no contentor de
    // CONTEÚDO do nível (o efeito na altura rolável é o mesmo: cresce exatamente
    // pela altura da barra). Garante que as ações do painel de otimização e o
    // fim do conteúdo podem sempre ser levados a limpo por cima do slot da
    // barra (ver o comentário de ACTION_BAR_PX).
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, pb: `${ACTION_BAR_PX}px` }}>
      <GameLevelHeader
        worldTitle={worldTitle}
        levelTitle={levelTitle}
        levelIndex={levelIndex}
        boss={boss}
        onBack={onBack}
      />

      {/* Enunciado em cartão: body2, medida de leitura 640px, quebra por
          palavra (o enunciado traz identificadores de função longos). */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" component="h2" sx={{ overflowWrap: 'break-word' }}>
          {t('translation:games.level.enunciado')}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            maxWidth: LAYOUT.readingColumnPx,
            whiteSpace: 'normal',
            overflowWrap: 'break-word',
          }}
        >
          {enunciado}
        </Typography>
      </Paper>

      {/* Linguagem + editor: a linguagem troca o starter (o contentor recarrega
          o payload); o editor é o CodeMirrorField do app (tema pela polaridade). */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <GameLangSelector value={lang} onChange={onLangChange} />
        <CodeMirrorField
          value={code}
          onChange={onCodeChange}
          filename={EDITOR_FILENAME[lang]}
          ariaLabel={tI('translation:games.level.editorAria', { n: levelIndex })}
          minHeight="260px"
        />
      </Box>

      {runError !== null ? (
        <Alert severity="error" sx={{ overflowWrap: 'break-word' }}>
          {runError}
        </Alert>
      ) : null}

      {runResult?.ok && runResult.completed ? (
        <Alert severity="success" sx={{ overflowWrap: 'break-word' }}>
          {t('translation:games.level.completedBanner')}
        </Alert>
      ) : null}

      {/* Sem submissão ainda: a lista de casos nasce com o PRIMEIRO teste
          (antes disso o estado é a dica, não uma lista vazia). */}
      {runResult !== null ? (
        <CaseList runResult={runResult} />
      ) : (
        <Typography
          variant="body2"
          sx={(theme) => ({
            color: theme.vars.palette.text.secondary,
            whiteSpace: 'normal',
            overflowWrap: 'break-word',
          })}
        >
          {t('translation:games.level.casesEmpty')}
        </Typography>
      )}


      {runResult?.ok ? (
        <OptimizationPanel
          runResult={runResult}
          optimize={optimize}
          nextLevelId={nextLevelId}
          onTest={onTest}
          onAdvance={onAdvance}
          locale={locale}
        />
      ) : null}

      {/* BARRA DE AÇÃO PEGAJOSA (padrão W13 do ChallengeView): o "Testar
          resposta" fica alcançável sem scroll em qualquer altura da tela. */}
      <Paper
        variant="outlined"
        sx={(theme) => ({
          position: 'sticky',
          bottom: 0,
          zIndex: 10,
          p: 1,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 1,
          alignItems: 'center',
          // Chrome elevado (nível 3) — tinta por cima é `text.*` (regra 3b).
          backgroundColor: theme.vars.palette.surface.level3,
        })}
      >
        <Button
          variant="contained"
          disabled={busy}
          loading={busy}
          loadingPosition="start"
          startIcon={<PlayArrowIcon />}
          onClick={onTest}
          sx={wrappingActionSx}
        >
          {/* Reuso do padrão do app: MESMA copy do "Testar resposta" do
              Desafio (challenge.testAnswer) — dois rótulos iguais nunca
              divergem entre telas. */}
          {t('translation:challenge.testAnswer')}
        </Button>
      </Paper>
    </Box>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GameLevelView — o contentor (IPC + estados)
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface GameLevelViewProps {
  worldId: string;
  worldTitle: string;
  levelId: string;
  /** Título estável do nível (vem do mapa — não depende do payload). */
  levelTitle: string;
  /** Número do nível, 1-based. */
  levelIndex: number;
  boss: boolean;
  lang: GameLang;
  onLangChange: (lang: GameLang) => void;
  nextLevelId: string | null;
  onBack: () => void;
  onAdvance: (levelId: string) => void;
}

/**
 * Contentor do nível: `games.loadLevel` para o payload (enunciado + starter),
 * `games.run` para as submissões. Estados: loading (título estável +
 * LinearProgress), erro (Alert + retentativa), ok (GameLevelPanel).
 *
 * STATE/VIEW (STORY-SPEC §5): o estado do editor/runner é a máquina PURA de
 * `gameLevelState.ts` (reducer + eventos); este contentor só despacha e mapeia
 * o estado para copy i18n.
 */
export default function GameLevelView({
  worldId,
  worldTitle,
  levelId,
  levelTitle,
  levelIndex,
  boss,
  lang,
  onLangChange,
  nextLevelId,
  onBack,
  onAdvance,
}: GameLevelViewProps): ReactElement {
  const { t, i18n } = useTranslation();
  const tI = i18n.t.bind(i18n) as unknown as (
    key: string,
    options?: Record<string, string | number>,
  ) => string;

  const [levelState, dispatch] = useReducer(
    reduceGameLevelState,
    undefined,
    initialGameLevelState,
  );
  const { loadToken, loading, payload, loadError, code, busy, runResult, runError } = levelState;

  // Ref para o código na submissão: `run` recebe o código ATUAL sem prender o
  // handler a um re-render por keystroke (mesmo padrão do editor do Desafio).
  const codeRef = useRef(code);
  codeRef.current = code;

  // Carga do payload: muda com a linguagem de propósito — o starter é da
  // linguagem escolhida e o código digitado em outra linguagem não sobrevive
  // à troca (a solução teria de ser reescrita de qualquer forma).
  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'load/start' });
    withTimeout(
      Promise.resolve(getGamesApi().loadLevel(worldId, levelId, lang)),
      IPC_TIMEOUT_MS,
      'games.loadLevel',
    )
      .then((level) => {
        if (cancelled) return;
        dispatch({ type: 'load/success', payload: level });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        dispatch({
          type: 'load/error',
          kind: isTimeoutError(err) ? 'timeout' : 'load',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [worldId, levelId, lang, loadToken]);

  const test = useCallback((): void => {
    dispatch({ type: 'run/start' });
    withTimeout(
      Promise.resolve(getGamesApi().run(worldId, levelId, lang, codeRef.current)),
      IPC_TIMEOUT_MS,
      'games.run',
    )
      .then((result) => dispatch({ type: 'run/success', result }))
      .catch(() => dispatch({ type: 'run/error' }));
  }, [worldId, levelId, lang]);

  // Copy do erro de carga decidida AQUI (a máquina guarda o tipo, não texto):
  // timeout do IPC → `games.loadTimeout`; rejeição comum → `games.loadError`;
  // payload ausente sem erro → `games.level.loadError`.
  const loadErrorMessage =
    loadError === 'timeout'
      ? t('translation:games.loadTimeout')
      : loadError === 'load'
        ? t('translation:games.loadError')
        : t('translation:games.level.loadError');

  // Cabeçalho ESTÁVEL nos três estados (loading/erro/ok): o mesmo componente
  // do painel — o título vem das props, nunca do payload.
  const header = (
    <GameLevelHeader
      worldTitle={worldTitle}
      levelTitle={levelTitle}
      levelIndex={levelIndex}
      boss={boss}
      onBack={onBack}
    />
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {header}
        <LinearProgress />
        <Typography
          variant="body2"
          sx={(theme) => ({
            color: theme.vars.palette.text.secondary,
            whiteSpace: 'normal',
            overflowWrap: 'break-word',
          })}
        >
          {t('translation:games.level.loading')}
        </Typography>
      </Box>
    );
  }

  if (payload === null || hasLevelLoadError(levelState)) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {header}
        {/* Erro + retentativa (auditoria de layout §3): o `RetryAlert`
         * canónico. A copy do erro continua decidida AQUI (timeout vs carga). */}
        <RetryAlert
          message={loadErrorMessage}
          onRetry={() => dispatch({ type: 'retry' })}
        />
      </Box>
    );
  }

  return (
    <GameLevelPanel
      worldTitle={worldTitle}
      levelTitle={levelTitle}
      levelIndex={levelIndex}
      boss={boss}
      lang={lang}
      onLangChange={onLangChange}
      enunciado={payload.enunciado}
      code={code}
      onCodeChange={(next) => dispatch({ type: 'code/change', code: next })}
      optimize={payload.optimize}
      busy={busy}
      runResult={runResult}
      runError={runError ? t('translation:games.level.runError') : null}
      nextLevelId={nextLevelId}
      onBack={onBack}
      onTest={test}
      onAdvance={onAdvance}
      locale={i18n.language}
    />
  );
}
