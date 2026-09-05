/**
 * src/components/chat/chatSurfaces.tsx — a CASCA do balão e o avatar do autor,
 * num lugar só, para que a bolha e o indicador "digitando" sejam o MESMO
 * objeto visual.
 *
 * ─── O DEFEITO ────────────────────────────────────────────────────────────
 * O chat era o único lugar do app ainda no visual "web genérico": balão sem
 * borda de 2px e sem sombra colorida, enquanto Paper, Card, Chip e Button já
 * tinham ganhado esse traço "game" (src/theme.ts). E o `TypingIndicator`
 * flutuava solto no fluxo, sem avatar e sem balão — não parecia uma mensagem
 * chegando, parecia um aviso do sistema.
 *
 * ─── DE ONDE VEM CADA VALOR (nada inventado) ──────────────────────────────
 *  - borda 2px .................. `MuiPaper` variantes sunken/raised/selected e
 *                                 `MuiCard.borderWidth` (src/theme.ts)
 *  - sombra colorida por color-mix `MuiButton` contained: 40% do `fill`;
 *                                 `MuiPaper` selected: 25% do `fill`
 *  - raio ....................... `SHAPE.lg` (20) nos cantos redondos e
 *                                 `SHAPE.sm` (8) na CAUDA — designTokens.ts
 *  - superfícies ................ `background.paper` = nível 1 da rampa (a
 *                                 superfície de LEITURA: prosa longa só vive
 *                                 nos níveis 0 e 1, §3.2)
 *  - tint de review ............. color-mix 10%/28% — os MESMOS da onda
 *                                 anterior, preservados
 *
 * `alpha()` do MUI está PROIBIDO aqui: ele LANÇA quando recebe uma CSS var
 * (MUI error #9), e `theme.vars.palette.*` é exatamente isso. A composição é
 * feita em CSS puro com `color-mix`, que resolve por esquema sem nenhum
 * ternário sobre `palette.mode` (§6.2 — o ternário travaria no galho errado).
 */
import { Avatar } from '@mui/material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import PersonIcon from '@mui/icons-material/Person';
import type { Theme } from '@mui/material/styles';
import type { CSSProperties, ReactElement } from 'react';

import { SHAPE } from '../../lib/designTokens';
import type { ChatBubbleTone } from '../../lib/chatBubbleStyle';

/** Diâmetro do avatar do autor (o mesmo da onda iMessage — layout preservado). */
export const CHAT_AVATAR_SIZE = 26;

/**
 * Família de acento que carrega a IDENTIDADE de cada tom. É por aqui que a
 * "resposta do tutor" continua roxa (família `study` = slot `secondary`) depois
 * de deixar de ser um retângulo roxo chapado: a cor migrou de preenchimento
 * para acento (borda + sombra + avatar).
 */
const ACCENT_BY_TONE: Readonly<Record<ChatBubbleTone, 'primary' | 'secondary' | 'error' | 'success'>> = {
  user: 'primary',
  tutor: 'secondary',
  reply: 'secondary',
  error: 'error',
  approved: 'success',
};

/** Sombra colorida de um balão PREENCHIDO — a fórmula do `MuiButton` contained. */
function filledShadow(fill: string): string {
  return `0 4px 14px -4px color-mix(in srgb, ${fill} 40%, transparent)`;
}

/** Sombra colorida de um balão de SUPERFÍCIE — a fórmula do `MuiPaper` selected. */
function surfaceShadow(fill: string): string {
  return `0 4px 16px -4px color-mix(in srgb, ${fill} 25%, transparent)`;
}

/** Sombra em repouso do tom (o alvo para onde o glow de aprovação volta). */
export function bubbleRestShadow(theme: Theme, tone: ChatBubbleTone): string {
  const fill = theme.vars.palette[ACCENT_BY_TONE[tone]].fill;
  return tone === 'user' ? filledShadow(fill) : surfaceShadow(fill);
}

/**
 * Raio "iMessage": o canto que APONTA PARA O AUTOR é a cauda (pequeno). O
 * usuário ancora à direita, todo balão do tutor à esquerda.
 *
 * Balão AGRUPADO (continuação do anterior) não tem cauda: ela apontaria para um
 * avatar que não está lá. A cauda marca o começo do grupo.
 */
export function bubbleRadius(tone: ChatBubbleTone, grouped: boolean): string {
  const round = `${SHAPE.lg}px`;
  if (grouped) return round;
  const tail = `${SHAPE.sm}px`;
  return tone === 'user'
    ? `${round} ${round} ${tail} ${round}`
    : `${round} ${round} ${round} ${tail}`;
}

/**
 * O `style` PLAIN do balão (o `motion.div` não processa `sx`, então todo token
 * é resolvido por `theme.vars` antes e as chaves usam o vocabulário CSS real —
 * uma chave desconhecida num style object do React é descartada EM SILÊNCIO,
 * o que já deixou o fundo do balão transparente uma vez).
 */
export function bubbleShellStyle(
  theme: Theme,
  tone: ChatBubbleTone,
  grouped: boolean,
): CSSProperties {
  const paper = theme.vars.palette.background.paper;
  const ink = theme.vars.palette.text.primary;
  const accent = theme.vars.palette[ACCENT_BY_TONE[tone]];
  const common: CSSProperties = {
    borderRadius: bubbleRadius(tone, grouped),
    padding: '8px 12px',
    boxShadow: bubbleRestShadow(theme, tone),
    // FIX medido: a bolha é item de flex column com align-self flex-start, e a
    // largura resolve por fit-content = min(max-content, 78%). Uma linha longa
    // da saída do runner estourava a bolha para 1226px num painel de 1000px.
    maxWidth: '100%',
  };
  switch (tone) {
    case 'user':
      return {
        ...common,
        backgroundColor: accent.fill,
        color: accent.onFill,
        border: `2px solid ${accent.fill}`,
      };
    case 'reply':
      // Resposta a uma pergunta: MESMA superfície de leitura das demais bolhas
      // do tutor; a identidade roxa vive na BORDA (o `accentText` da família
      // study, calibrado >= 4,5:1 — folga enorme para o piso de 3:1 de borda).
      return {
        ...common,
        backgroundColor: paper,
        color: ink,
        border: `2px solid ${accent.accentText}`,
      };
    case 'error':
    case 'approved':
      return {
        ...common,
        backgroundColor: `color-mix(in srgb, ${accent.fill} 10%, ${paper})`,
        color: ink,
        border: `2px solid color-mix(in srgb, ${accent.fill} 28%, ${paper})`,
      };
    case 'tutor':
    default:
      return {
        ...common,
        backgroundColor: paper,
        color: ink,
        border: `2px solid ${theme.vars.palette.divider}`,
      };
  }
}

/**
 * Avatar circular do autor. Ícones MUI (decisão da onda iMessage, preservada):
 * AutoStories para o Tutor, Person para o aluno, com `aria-label` i18n.
 */
export function ChatAvatar({ isUser, label }: { isUser: boolean; label: string }): ReactElement {
  return (
    <Avatar
      role="img"
      aria-label={label}
      sx={{
        width: CHAT_AVATAR_SIZE,
        height: CHAT_AVATAR_SIZE,
        fontSize: '1rem',
        // Tutor → acento study (secundário); aluno → acento action (primário).
        // Os ícones ficam em contrastText (>= 4,5:1 sobre o fill — calibrado).
        bgcolor: isUser ? 'primary.main' : 'secondary.main',
        color: isUser ? 'primary.contrastText' : 'secondary.contrastText',
      }}
    >
      {isUser ? <PersonIcon fontSize="small" /> : <AutoStoriesIcon fontSize="small" />}
    </Avatar>
  );
}
