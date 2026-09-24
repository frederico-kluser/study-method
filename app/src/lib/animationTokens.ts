/**
 * src/lib/animationTokens.ts — tokens de animação compartilhados (motion).
 *
 * CONTRATO COMUM (ONDA1 + ONDA2-chat-nintendo): o mesmo nome/contrato criado
 * pela Onda 1 para os diálogos — se a Onda 1 já tiver criado o arquivo, o
 * merge dela vem ANTES e esta definição é a fonte única; se ambos criarem,
 * o merge resolve (mesmos nomes, valores calibrados pela casa).
 *
 * Springs (motion `Transition` com type: 'spring'), cada um a tradução de uma
 * mola nomeada do SwiftUI (ver a tabela junto da definição):
 *   - `window`   — janelas/diálogos: entrada controlada, ressalto discreto;
 *   - `playful`  — micro-confirmações (celebração, chip de sucesso);
 *   - `gentle`   — entradas de conteúdo (bolhas do chat): suave, sem rebound;
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

/* ─── Springs: as molas do SwiftUI ───────────────────────────────────────
 * A referência do movimento deste app é o SwiftUI. Cada spring abaixo é a
 * tradução de uma mola nomeada da Apple (resposta + fração de amortecimento,
 * massa 1), convertida por ω0 = 2π/resposta e k = ω0², c = 2·ζ·ω0:
 *
 *   window  ← .snappy      (resposta 0,35 · ζ 0,90)  entrada de janela
 *   playful ← .bouncy      (resposta 0,50 · ζ 0,72)  micro-confirmação
 *   gentle  ← .smooth      (resposta 0,50 · ζ 1,00)  entrada de conteúdo
 *   snappy  ← .interactiveSpring (resposta 0,15 · ζ 0,90)  press/hover
 *
 * `gentle` é a única criticamente amortecida: conteúdo que entra não pode
 * ficar quicando, ou a leitura cintila. As outras três têm o ressalto discreto
 * que dá a física do gesto.
 */
export const springs: Record<'window' | 'playful' | 'gentle' | 'snappy', Transition> = {
  window: { type: 'spring', stiffness: 320, damping: 32 },
  playful: { type: 'spring', stiffness: 160, damping: 18 },
  gentle: { type: 'spring', stiffness: 160, damping: 25 },
  snappy: { type: 'spring', stiffness: 700, damping: 40 },
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
