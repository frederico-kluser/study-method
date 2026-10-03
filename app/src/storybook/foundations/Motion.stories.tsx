/**
 * src/storybook/foundations/Motion.stories.tsx — Fundamentos/Movimento.
 *
 * Os tokens de movimento de `src/lib/animationTokens.ts` (springs, transições
 * de loop, variants) + `MOTION` de `src/lib/designTokens.ts` e os helpers
 * `spatialTransition`/`effectsTransition` de `src/theme.ts` — cada curva e cada
 * duração com uma demo animada, e a REGRA que separa os dois níveis:
 *
 *   spatial → só transform/geometria (PODE ultrapassar o valor final)
 *   effects → só cor/opacidade (NUNCA ultrapassa)
 *
 * DECISÕES:
 *   - As demos de curva/duração correm em LOOP COM PAUSA e não em oscilação
 *     contínua: um alvo a oscilar a ~7 Hz (140ms ida+volta) seria o próprio
 *     tipo de estímulo que o contrato de celebração limita
 *     (CELEBRATION.maxOpposingTransitionsPerSecond = 3). O ciclo usa a duração
 *     do token para cada movimento e uma pausa fixa de demonstração; o que se
 *     avalia é a CURVA dentro daquele tempo.
 *   - As demos `RegraDePropriedade` usam as TRANSIÇÕES CSS REAIS devolvidas
 *     por `spatialTransition()`/`effectsTransition()` (mostradas em monospace)
 *     e animam ao passar o rato — é o mesmo CSS que o MuiButton do app usa.
 *   - As amplitudes de movimento das demos são geometria de demonstração
 *     derivada de `theme.spacing` (ou dos valores documentados de hover/press
 *     do MuiButton em theme.ts: scale 1.02 / 0.96); o token em avaliação é a
 *     curva/duração, nunca a amplitude.
 *   - A guarda de runtime de `spatialTransition` (propriedade proibida →
 *     throw) é citada pelo MENSAGEM exata de theme.ts em vez de executada com
 *     cast: o TIPO já barra a entrada em tempo de compilação e um cast `as`
 *     numa história seria uma porta falsa que o redesign poderia copiar.
 */
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { motion, type Transition } from 'motion/react';
import {
  MOTION,
  SHAPE,
  SPATIAL_ALLOWED_PROPERTIES,
  SPATIAL_FORBIDDEN_PROPERTIES,
} from '../../lib/designTokens';
import {
  fadeInUp,
  scaleIn,
  springs,
  transitions,
  windowVariants,
} from '../../lib/animationTokens';
import {
  effectsTransition,
  spatialTransition,
  theme,
  type MotionSpeed,
} from '../../theme';
import { DocSection, TokenTable } from './parts';

const meta = {
  title: 'Fundamentos/Movimento',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ─── Derivação das curvas: as strings cubic-bezier viram alvo do motion ──── */

/**
 * Converte `cubic-bezier(a, b, c, d)` do contrato na tupla que o motion aceita
 * em `ease`. Pura derivação do token — a curva nunca é reescrita à mão.
 */
function bezierDe(easing: string): [number, number, number, number] | undefined {
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(easing.trim());
  if (!m) return undefined;
  const n = m[1]!.split(',').map((x) => Number(x.trim()));
  if (n.length !== 4 || n.some((x) => Number.isNaN(x))) return undefined;
  return [n[0]!, n[1]!, n[2]!, n[3]!];
}

/** Amplitude de demonstração, derivada de `theme.spacing` (não é token). */
const AMPLITUDE = Number.parseFloat(theme.spacing(3)); // 24px

/** Pausa entre ciclos das demos de duração (ver cabeçalho: segurança visual). */
const PAUSA_S = 0.6;

/* ─── Demos (views puras: só props) ───────────────────────────────────────── */

/**
 * Loop animado de UMA curva×duração. O movimento corre em `ms` (o token), a
 * pausa separa os ciclos. `modo` respeita a regra: 'transform' é o nível
 * spatial; 'opacidade' é o nível effects.
 */
function LoopDemo({
  caminho,
  ms,
  ease,
  modo,
  nota,
}: {
  caminho: string;
  ms: number;
  ease: [number, number, number, number] | undefined;
  modo: 'transform' | 'opacidade';
  nota: string;
}): ReactElement {
  const movimento = ms / 1000;
  const ciclo = 2 * movimento + 2 * PAUSA_S;
  const a = movimento / ciclo;
  const b = (movimento + PAUSA_S) / ciclo;
  const c = (2 * movimento + PAUSA_S) / ciclo;
  const curva = ease ?? 'linear';
  const animar =
    modo === 'transform'
      ? { x: [0, AMPLITUDE, AMPLITUDE, 0, 0] }
      : { opacity: [0, 1, 1, 0, 0] };
  const transition: Transition = {
    duration: ciclo,
    times: [0, a, b, c, 1],
    ease: [curva, 'linear', curva, 'linear'],
    repeat: Infinity,
  };
  return (
    <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
        {caminho} · {ms}ms
      </Typography>
      <Box sx={{ height: (t) => t.spacing(8), display: 'flex', alignItems: 'center' }}>
        <motion.div
          style={{
            width: theme.spacing(4),
            height: theme.spacing(4),
            borderRadius: theme.shape.borderRadius,
            backgroundColor: theme.vars.palette.primary.fill,
          }}
          animate={animar}
          transition={transition}
        />
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {nota}
      </Typography>
    </Paper>
  );
}

/** Demo de curva CSS ao passar o rato — usa a transição REAL do helper. */
function HoverTransitionDemo({
  titulo,
  transitionCss,
  alvoCss,
  repousoCss,
  nota,
}: {
  titulo: string;
  transitionCss: string;
  alvoCss: Record<string, string>;
  repousoCss: Record<string, string>;
  nota: string;
}): ReactElement {
  return (
    <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle2">{titulo}</Typography>
      <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily, overflowWrap: 'anywhere' }}>
        {transitionCss}
      </Typography>
      <Box sx={{ '&:hover .alvo-movimento': alvoCss, height: (t) => t.spacing(8), display: 'flex', alignItems: 'center' }}>
        <Box
          className="alvo-movimento"
          sx={{
            width: (t) => t.spacing(8),
            height: (t) => t.spacing(4),
            borderRadius: 1,
            ...repousoCss,
            transition: transitionCss,
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {nota}
      </Typography>
    </Paper>
  );
}

/** Demo de mola (springs de animationTokens) — hover move, soltar devolve. */
function SpringDemo({
  nome,
  transition,
  origem,
  uso,
}: {
  nome: string;
  transition: Transition;
  origem: string;
  uso: string;
}): ReactElement {
  return (
    <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
        springs.{nome}
      </Typography>
      <Box sx={{ height: (t) => t.spacing(8), display: 'flex', alignItems: 'center' }}>
        <motion.div
          style={{
            width: theme.spacing(4),
            height: theme.spacing(4),
            borderRadius: theme.shape.borderRadius,
            backgroundColor: theme.vars.palette.secondary.fill,
          }}
          whileHover={{ x: AMPLITUDE }}
          transition={transition}
        />
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {origem} — {uso}
      </Typography>
    </Paper>
  );
}

/* ─── 1. A regra de propriedade ───────────────────────────────────────────── */

export const RegraDePropriedade: Story = {
  render: () => {
    const cssSpatial = spatialTransition(theme, ['transform'], 'normal');
    const cssEffects = effectsTransition(theme, ['background-color', 'color'], 'normal');
    return (
      <Box>
        <DocSection
          title="A regra: spatial anima geometria, effects anima cor/opacidade"
          lead="Aplicar `spatial` a color/background-color/opacity é BUG: o nível spatial ultrapassa o valor final (overshoot ~2,6%) e texto a cintilar é o resultado. A regra é imposta pelo TIPO (SpatialProperty) e checada em runtime por spatialTransition()."
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: 2 }}>
            <HoverTransitionDemo
              titulo="SPATIAL — transform/geometria (pode ultrapassar)"
              transitionCss={cssSpatial}
              repousoCss={{ transform: 'none' }}
              alvoCss={{ transform: `translateX(${AMPLITUDE}px)` }}
              nota="Passa o rato sobre a barra: a transição é literalmente o output de spatialTransition(theme, ['transform'], 'normal'). No app, o MuiButton usa esta porta para o hover/press (scale 1.02 → 0.96)."
            />
            <HoverTransitionDemo
              titulo="EFFECTS — cor/opacidade (nunca ultrapassa)"
              transitionCss={cssEffects}
              repousoCss={{ backgroundColor: theme.vars.palette.surface.level2 }}
              alvoCss={{ backgroundColor: theme.vars.palette.primary.fill }}
              nota="Passa o rato: output de effectsTransition(theme, ['background-color', 'color'], 'normal'). Criticamente amortecido — é a única transição permitida em superfície de leitura."
            />
          </Box>
          <TokenTable
            lines={[
              {
                path: 'SPATIAL_ALLOWED_PROPERTIES',
                value: SPATIAL_ALLOWED_PROPERTIES.join(', '),
                note: 'o que o nível spatial PODE animar (qualquer outra é bug)',
              },
              {
                path: 'SPATIAL_FORBIDDEN_PROPERTIES',
                value: SPATIAL_FORBIDDEN_PROPERTIES.join(', '),
                note: 'nunca podem receber easing spatial — é assim que texto longo cintila',
              },
              {
                path: 'spatialTransition(..., propriedade proibida)',
                value: 'throw',
                note: 'mensagem exata de theme.ts: «[theme] movimento spatial não pode animar "<propriedade>": o nível spatial ultrapassa o valor final (overshoot) e só é válido em transform/geometria. Use effectsTransition().»',
              },
            ]}
          />
        </DocSection>
      </Box>
    );
  },
};

/* ─── 2. As curvas ────────────────────────────────────────────────────────── */

export const Curvas: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Curvas do contrato"
        lead="Duas curvas CSS (uma por nível de movimento) e quatro molas nomeadas do SwiftUI (animationTokens.ts). As demos CSS animam ao passar o rato; as molas mostram o ressalto discreto no gesto (hover move, soltar devolve)."
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: 2, mb: 2 }}>
          <HoverTransitionDemo
            titulo="MOTION.spatial.easing — com ressalto (~2,6%)"
            transitionCss={spatialTransition(theme, ['transform'], 'normal')}
            repousoCss={{ transform: 'none' }}
            alvoCss={{ transform: `scale(1.02)` }}
            nota={`"${MOTION.spatial.easing}" — aproximação CSS da mola .snappy do SwiftUI (resposta curta, amortecimento alto).`}
          />
          <HoverTransitionDemo
            titulo="MOTION.effects.easing — criticamente amortecida"
            transitionCss={effectsTransition(theme, ['background-color'], 'normal')}
            repousoCss={{ backgroundColor: theme.vars.palette.surface.level3 }}
            alvoCss={{ backgroundColor: theme.vars.palette.success.fill }}
            nota={`"${MOTION.effects.easing}" — a curva \`ease\` da plataforma, a que a Apple emprega em toda troca de cor de controle.`}
          />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: 2 }}>
          <SpringDemo
            nome="window"
            transition={springs.window}
            origem=".snappy (resposta 0,35 · ζ 0,90)"
            uso="entrada de janela/diálogo (windowVariants)"
          />
          <SpringDemo
            nome="playful"
            transition={springs.playful}
            origem=".bouncy (resposta 0,50 · ζ 0,72)"
            uso="micro-confirmação (celebração, chip de sucesso)"
          />
          <SpringDemo
            nome="gentle"
            transition={springs.gentle}
            origem=".smooth (resposta 0,50 · ζ 1,00)"
            uso="entrada de conteúdo (bolhas do chat) — a única sem rebound, senão a leitura cintila"
          />
          <SpringDemo
            nome="snappy"
            transition={springs.snappy}
            origem=".interactiveSpring (resposta 0,15 · ζ 0,90)"
            uso="press/hover feedback (scale 0.98)"
          />
        </Box>
      </DocSection>
    </Box>
  ),
};

/* ─── 3. As durações ──────────────────────────────────────────────────────── */

const DEGRAUS: ReadonlyArray<{ speed: MotionSpeed; ms: number; nivel: 'spatial' | 'effects' }> = [
  { speed: 'fast', ms: MOTION.spatial.fast, nivel: 'spatial' },
  { speed: 'normal', ms: MOTION.spatial.normal, nivel: 'spatial' },
  { speed: 'slow', ms: MOTION.spatial.slow, nivel: 'spatial' },
  { speed: 'fast', ms: MOTION.effects.fast, nivel: 'effects' },
  { speed: 'normal', ms: MOTION.effects.normal, nivel: 'effects' },
  { speed: 'slow', ms: MOTION.effects.slow, nivel: 'effects' },
];

export const Durações: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Durações — três degraus por nível"
        lead="Cada demo corre o seu MOVIMENTO na duração do token e pausa entre ciclos (ver o cabeçalho do ficheiro). spatial anima `transform` (geometria); effects anima `opacity` (efeito) — cada demo obedece à regra do seu nível. Os mesmos valores vivem em theme.transitions.duration.* (module augmentation)."
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: 2 }}>
          {DEGRAUS.map((degrau) => (
            <LoopDemo
              key={`${degrau.nivel}-${degrau.speed}`}
              caminho={`MOTION.${degrau.nivel}.${degrau.speed} (= theme.transitions.duration.${degrau.nivel}${degrau.speed[0]!.toUpperCase()}${degrau.speed.slice(1)})`}
              ms={degrau.ms}
              ease={bezierDe(MOTION[degrau.nivel].easing)}
              modo={degrau.nivel === 'spatial' ? 'transform' : 'opacidade'}
              nota={
                degrau.nivel === 'spatial'
                  ? 'Nível SPATIAL: só transform/geometria — pode ultrapassar.'
                  : 'Nível EFFECTS: só cor/opacidade — nunca ultrapassa.'
              }
            />
          ))}
        </Box>
      </DocSection>
    </Box>
  ),
};

/* ─── 4. Variants e loops contínuos ───────────────────────────────────────── */

export const VariantesELoops: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Variants (animationTokens)"
        lead="Alvos PUROS de variant (sem `transition` dentro do alvo — fix de tipagem motion 13 + TS strict); a transição entra SEMPRE pelo prop. As três demos de entrada correm uma vez ao montar a história."
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: 2 }}>
          <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
              fadeInUp + springs.gentle
            </Typography>
            <Box sx={{ height: (t) => t.spacing(8), display: 'flex', alignItems: 'center' }}>
              <motion.div
                style={{
                  width: theme.spacing(12),
                  height: theme.spacing(4),
                  borderRadius: theme.shape.borderRadius,
                  backgroundColor: theme.vars.palette.primary.fill,
                }}
                variants={fadeInUp}
                initial="hidden"
                animate="visible"
                transition={springs.gentle}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Entrada de bolhas/linhas: opacity 0 + y 10 → 1/0.
            </Typography>
          </Paper>
          <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
              scaleIn + springs.playful
            </Typography>
            <Box sx={{ height: (t) => t.spacing(8), display: 'flex', alignItems: 'center' }}>
              <motion.div
                style={{
                  width: theme.spacing(4),
                  height: theme.spacing(4),
                  borderRadius: SHAPE.pill,
                  backgroundColor: theme.vars.palette.success.fill,
                }}
                variants={scaleIn}
                initial="hidden"
                animate="visible"
                transition={springs.playful}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Entrada com escala (badges, chips de sucesso): opacity 0 + scale 0.92 → 1/1.
            </Typography>
          </Paper>
          <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
              windowVariants + springs.window
            </Typography>
            <Box sx={{ height: (t) => t.spacing(8), display: 'flex', alignItems: 'center' }}>
              <motion.div
                style={{
                  width: theme.spacing(12),
                  height: theme.spacing(6),
                  borderRadius: theme.shape.borderRadius,
                  backgroundColor: theme.vars.palette.surface.level4,
                  border: `1px solid ${theme.vars.palette.divider}`,
                }}
                variants={windowVariants}
                initial="initial"
                animate="animate"
                transition={springs.window}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Ciclo de janela/diálogo (initial → animate → exit) para AnimatePresence.
            </Typography>
          </Paper>
        </Box>
      </DocSection>
      <DocSection
        title="Loops contínuos (transitions — aditivo da ONDA 1)"
        lead="Onde duração/easing fixos leem mais verdadeiro que uma mola: pulso de status e giro de loading. Nunca inventar curva — importar daqui."
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: 2 }}>
          <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
              transitions.pulse
            </Typography>
            <Box sx={{ height: (t) => t.spacing(8), display: 'flex', alignItems: 'center' }}>
              <motion.div
                style={{
                  width: theme.spacing(2),
                  height: theme.spacing(2),
                  borderRadius: SHAPE.pill,
                  backgroundColor: theme.vars.palette.success.fill,
                }}
                animate={{ opacity: [0.5, 1] }}
                transition={transitions.pulse}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Respiração de ponto de status (1,6s, easeInOut). A amplitude 0,5↔1 é do
              DEMO; o token é duração/easing/repeat.
            </Typography>
          </Paper>
          <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
              transitions.spin
            </Typography>
            <Box sx={{ height: (t) => t.spacing(8), display: 'flex', alignItems: 'center' }}>
              <motion.div
                style={{
                  width: theme.spacing(4),
                  height: theme.spacing(4),
                  borderRadius: SHAPE.pill,
                  border: `${theme.spacing(0.25)} solid ${theme.vars.palette.divider}`,
                  borderTopColor: theme.vars.palette.primary.fill,
                }}
                animate={{ rotate: 360 }}
                transition={transitions.spin}
              />
            </Box>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Rotação linear infinita para spinners de loading (1s, linear).
            </Typography>
          </Paper>
        </Box>
      </DocSection>
    </Box>
  ),
};
