/**
 * src/lib/animationTokens.ts — tokens de animação compartilhados (motion).
 *
 * CONTRATO COMUM (ONDA1 + ONDA2-chat-nintendo): o mesmo nome/contrato criado
 * pela Onda 1 para os diálogos — se a Onda 1 já tiver criado o arquivo, o
 * merge dela vem ANTES e esta definição é a fonte única; se ambos criarem,
 * o merge resolve (mesmos nomes, valores calibrados pela casa).
 *
 * Springs (motion `Transition` com type: 'spring'):
 *   - `window`   — janelas/diálogos: entrada controlada, sem rebound agressivo;
 *   - `playful`  — micro-confirmações (glow de sucesso, "Nintendo"): bounce
 *                  curto e alegre;
 *   - `gentle`   — entradas de conteúdo (bolhas do chat): suave e leve
 *                  (y 8-12px → 0, sem exagero);
 *   - `snappy`   — press/hover feedback (scale 0.98): rápido e contido.
 *
 * Variants (contrato da casa):
 *   - `fadeInUp`       — entrada de bolhas/linhas: opacity 0 + y 10 → 1/0;
 *   - `scaleIn`        — entrada com escala (badges, chips de sucesso);
 *   - `windowVariants` — ciclo completo initial/animate/exit p/ AnimatePresence
 *                        em diálogos/overlays.
 *
 * FIX de TIPAGEM (motion 13.1.1 + TS strict): as variants são ALVOS PUROS
 * (sem a chave `transition` DENTRO do alvo) — o objeto `transition` embutido
 * num alvo/variante quebra a atribuição ao tipo `TargetAndTransition` do
 * motion-dom sob TS strict (`Property 'transition' is incompatible with index
 * signature` — o `Target` virou um mapped type sobre as props CSS). A
 * transição vai SEMPRE pelo PROP `transition` do componente motion:
 * `<motion.div variants={fadeInUp} initial="hidden" animate="visible"
 * exit="hidden" transition={springs.gentle} />`.
 *
 * EXTRA DA ONDA 1 (aditivo do merge com o chat, NÃO usado pelo chat): o bloco
 * `transitions` abaixo — transições NÃO-mola para loops contínuos (pulse/spin),
 * onde duração/easing fixos leem mais verdadeiro que uma mola. Quem quiser o
 * pulso de status ou o giro de loading importa daqui, nunca inventa curva.
 */
import type { Transition, Variants } from 'motion/react';

/** Springs por uso (contrato: window/playful/gentle/snappy). */
export const springs: Record<'window' | 'playful' | 'gentle' | 'snappy', Transition> = {
  window: { type: 'spring', stiffness: 220, damping: 28 },
  playful: { type: 'spring', stiffness: 420, damping: 20 },
  gentle: { type: 'spring', stiffness: 180, damping: 26 },
  snappy: { type: 'spring', stiffness: 540, damping: 36 },
};

/**
 * Transições NÃO-mola para loops contínuos, onde duração/easing fixos leem
 * mais verdadeiro que uma mola (aditivo da ONDA 1 — ver cabeçalho).
 */
export const transitions: {
  /** Loop suave de respiração (pulse) para pontos de status. */
  readonly pulse: Transition;
  /** Rotação linear infinita para spinners de loading. */
  readonly spin: Transition;
} = {
  pulse: { repeat: Infinity, ease: 'easeInOut', duration: 1.6 },
  spin: { repeat: Infinity, ease: 'linear', duration: 1 },
};

/** Entrada suave de cima (opacity 0, y 10 → visível) — bolhas do chat.
 *  Transição pelo prop (springs.gentle — ver cabeçalho). */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

/** Entrada com escala (confirmações pequenas, chips). Transição pelo prop. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1 },
};

/** Ciclo completo de janela/diálogo (initial → animate → exit) para
 *  AnimatePresence. Transição pelo prop (springs.window — ver cabeçalho). */
export const windowVariants: Variants = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 10, scale: 0.98 },
};
