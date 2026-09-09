/**
 * src/components/chat/chatSurfaces.tsx — a CASCA do balão e o avatar do autor,
 * num lugar só, para que a bolha e o indicador "digitando" sejam o MESMO
 * objeto visual.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ONDA11 — "as cores do modo dark não ficaram boas" + a REFERÊNCIA de chat
 * ════════════════════════════════════════════════════════════════════════════
 * O dono mandou a referência (`~/Imagens/…Switch Online Mock 2.png`) e ela é
 * CHAPADA: balão recebido em cinza neutro, balão enviado em acento LAVADO,
 * raio generoso e UNIFORME, zero borda visível, zero brilho colorido. O que
 * estava na tela era o oposto — todo balão tinha borda de 2px e uma sombra
 * colorida por `color-mix`, e o da `reply` (a mesma casca do card do quiz)
 * ainda ganhava o ROXO da família `study` na borda: era exatamente o "brilho
 * roxo" que o dono apontou como o que mais destoa.
 *
 * ─── OS NÚMEROS SAÍRAM DA REFERÊNCIA, NÃO DA CABEÇA ───────────────────────
 * Amostrado com ImageMagick na própria imagem (839x1644, `magick … -format
 * '%[pixel:p{x,y}]'`, pontos internos sem texto nem antialias):
 *
 *   fundo da conversa .......... #eeeeee  (238,238,238)
 *   balão RECEBIDO (cinza) ..... #c3c3c3  (195,195,195)
 *   balão ENVIADO (lavado) ..... #e2a3a0  (226,163,160)
 *   CTA / acento CHEIO ......... #d23d38  (210, 61, 56)
 *
 * O balão enviado é o acento cheio dissolvido no fundo. A fração, canal a
 * canal, é (enviado − fundo) / (acento − fundo):
 *   R (226−238)/(210−238) = 0,4286 · G (163−238)/(61−238) = 0,4237
 *   B (160−238)/( 56−238) = 0,4286                    → média 0,4270
 * Daí `USER_BUBBLE_TINT_PCT = 43` — o único número novo deste arquivo, e ele
 * foi MEDIDO. O "recebido" continua sendo a superfície de LEITURA do app
 * (`background.paper` = nível 1 da rampa): `READING_SURFACE_LEVELS` do
 * designTokens só admite os níveis 0 e 1 para prosa longa, e a teoria da aula
 * inteira mora dentro deste balão.
 *
 * ─── DE ONDE VEM CADA VALOR (nada inventado) ──────────────────────────────
 *  - raio ....................... `SHAPE.lg` (20) nos QUATRO cantos. A cauda
 *                                 de 8px morreu: na referência os balões — e
 *                                 os dois enviados em sequência — têm raio
 *                                 uniforme, e a cauda só existia para apontar
 *                                 para um avatar que saiu do fluxo (ver
 *                                 ChatBubble.tsx).
 *  - superfícies ................ `background.paper` (nível 1, superfície de
 *                                 leitura) e a rampa `surface.level0..4` via
 *                                 tema — nunca cor solta, nunca `action.hover`
 *  - tint do aluno .............. 43% do `fill` do acento sobre o paper
 *                                 (MEDIDO acima). Tinta = `text.primary`:
 *                                 o composto mede 9,23:1 no claro (#f1a89d) e
 *                                 8,62:1 no escuro (#6d3229) — AAA folgado.
 *                                 (Os 9,22/8,57 que este cabeçalho trazia eram
 *                                 de ANTES da rampa neutra da onda 11; a conta
 *                                 acima é a de hoje.) Travado por teste em
 *                                 tests/chatBubbleSurface.test.ts, que
 *                                 RECALCULA a mistura a partir dos tokens, de
 *                                 modo que qualquer rebalanceamento futuro do
 *                                 escuro reprove aqui se derrubar a leitura.
 *  - tint de review ............. color-mix 10%/28% — os MESMOS de sempre,
 *                                 preservados: ali a cor é ESTADO (erro /
 *                                 aprovação), não decoração.
 *
 * ─── POR QUE A BORDA CONTINUA EXISTINDO, EM "transparent" ─────────────────
 * Os tons de review (erro/aprovação) PRECISAM da borda tingida — é feedback de
 * estado. Se os demais tons ficassem sem `border`, a caixa deles encolheria 4px
 * em cada eixo e o balão MUDARIA DE TAMANHO conforme o turno. Por isso todo tom
 * carrega `2px solid`; nos tons quietos ela é `transparent`, e como o
 * `background-clip` padrão é `border-box` o fundo do balão é pintado POR BAIXO
 * dela: na tela não existe borda nenhuma, só a geometria estável.
 *
 * ─── SOMBRA: ZERO ─────────────────────────────────────────────────────────
 * `BUBBLE_FLAT_SHADOW` é `0 0 0 0 transparent` — e não a string `none` de
 * propósito: `ChatBubble` anima o brilho de APROVAÇÃO com keyframes de
 * `boxShadow`, e um keyframe precisa de uma sombra com a MESMA forma para
 * interpolar. A elevação do balão vem do degrau de superfície, como na
 * referência.
 *
 * ─── ONDA12: A CAIXA DA CONVERSA MORREU — O DEGRAU MUDOU DE DENOMINADOR ────
 * O painel de mensagens era um retângulo no nível 2 e o balão se destacava
 * contra ELE. Agora o painel é transparente e o balão está direto sobre o
 * NÍVEL 0 (o fundo do app). Recalculado, e não copiado:
 *
 *   balão do tutor (nível 1) sobre o nível 0 ... 1,07:1 claro · 1,12:1 escuro
 *   balão do aluno (tint 43%) sobre o nível 0 .. 1,81:1 claro · 1,97:1 escuro
 *   (a própria referência, para calibrar o olho:
 *    balão recebido #c3c3c3 sobre o fundo #eeeeee = 1,52:1)
 *
 * O balão do ALUNO passa folgado — ele é o mais visível dos dois, como no mock.
 * O do TUTOR é o degrau nativo da rampa (nível 0 → nível 1: no claro #faf7f2 →
 * #ffffff, no escuro #0e0e0e → #1b1b1b) e ficou MAIS FRACO que a referência.
 * Ele NÃO subiu de nível aqui de propósito: `READING_SURFACE_LEVELS` só admite
 * os níveis 0 e 1 para prosa longa, e a teoria inteira da aula mora dentro
 * deste balão — trocá-lo pelo nível 2 ou 3 tiraria o texto mais longo do app da
 * superfície de leitura para ganhar 0,01 (claro) de separação. Se o degrau
 * precisar ser mais forte, quem tem que se mexer é a RAMPA (designTokens.ts),
 * não este arquivo. Nenhum piso normativo é violado: a separação balão/fundo é
 * decorativa (o texto dentro do balão mede 17,90:1 no claro e 15,11:1 no
 * escuro), e SC 1.4.11 não pede 3:1 de uma superfície contra a outra.
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

/** Diâmetro do avatar do autor (agora dentro da linha de cabeçalho do grupo). */
export const CHAT_AVATAR_SIZE = 26;

/**
 * Quanto do acento CHEIO sobra no balão do aluno. 43% é a fração MEDIDA no
 * balão enviado da referência (a conta canal a canal está no cabeçalho): é o
 * que faz o acento ficar "lavado" em vez de gritar por cima do texto.
 */
export const USER_BUBBLE_TINT_PCT = 43;

/**
 * Sombra de repouso do balão: NENHUMA. Escrita com forma completa (e não
 * `none`) porque o brilho de aprovação interpola keyframes a partir dela.
 */
export const BUBBLE_FLAT_SHADOW = '0 0 0 0 transparent';

/**
 * Respiro interno do balão. A referência dá ~12,5px de folga horizontal (o
 * texto começa 27px dentro de um mock 2,15x); arredondado para a grade de 8 do
 * MUI: 16px na horizontal, 12px na vertical. Era `8px 12px` — apertado demais
 * para um balão que carrega a teoria inteira da aula.
 */
const BUBBLE_PADDING = '12px 16px';

/**
 * Família de acento de cada tom. Depois desta onda ela só pinta o que a cor
 * SIGNIFICA: o tint do aluno e o estado das reviews. O balão do tutor (`tutor`
 * e `reply`) é a superfície de leitura pura — a identidade de quem fala vive no
 * LADO da coluna e no avatar do cabeçalho, não numa borda colorida.
 */
const ACCENT_BY_TONE: Readonly<Record<ChatBubbleTone, 'primary' | 'secondary' | 'error' | 'success'>> = {
  user: 'primary',
  tutor: 'secondary',
  reply: 'secondary',
  error: 'error',
  approved: 'success',
};

/**
 * Sombra em repouso do tom — hoje a mesma para todos (o balão é chapado). A
 * assinatura foi PRESERVADA de propósito: `ChatBubble` a usa como alvo inicial
 * e final dos keyframes do brilho de aprovação, e outras ondas estão mexendo no
 * quiz agora; um `bubbleRestShadow(theme, tone)` que já existisse continua
 * compilando.
 */
export function bubbleRestShadow(_theme?: Theme, _tone?: ChatBubbleTone): string {
  return BUBBLE_FLAT_SHADOW;
}

/**
 * Raio do balão: UNIFORME nos quatro cantos.
 *
 * A cauda de `SHAPE.sm` apontava para o avatar que ficava colado na borda
 * esquerda do painel — o dono reclamou desse avatar flutuando, ele saiu do
 * fluxo e a cauda perdeu o referente. Na referência, inclusive nos dois balões
 * enviados em sequência, o raio é o mesmo nos quatro cantos.
 */
export function bubbleRadius(): string {
  return `${SHAPE.lg}px`;
}

/**
 * O `style` PLAIN do balão (o `motion.div` não processa `sx`, então todo token
 * é resolvido por `theme.vars` antes e as chaves usam o vocabulário CSS real —
 * uma chave desconhecida num style object do React é descartada EM SILÊNCIO,
 * o que já deixou o fundo do balão transparente uma vez).
 *
 * `grouped` continua na assinatura (o card do quiz chama com três argumentos) e
 * já não muda a GEOMETRIA: com raio uniforme, uma continuação de grupo é o
 * mesmo retângulo. Quem marca o grupo agora é o cabeçalho que some.
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
    borderRadius: bubbleRadius(),
    padding: BUBBLE_PADDING,
    boxShadow: BUBBLE_FLAT_SHADOW,
    // FIX medido: a bolha é item de flex column com align-self flex-start, e a
    // largura resolve por fit-content = min(max-content, 78%). Uma linha longa
    // da saída do runner estourava a bolha para 1226px num painel de 1000px.
    maxWidth: '100%',
  };
  switch (tone) {
    case 'user':
      // O balão ENVIADO da referência: acento a 43% sobre a superfície, tinta
      // normal por cima (9,23:1 claro / 8,62:1 escuro). O acento CHEIO que
      // havia aqui antes obrigava o texto a `onFill` e a hora a truques de
      // opacidade para não cair abaixo de 4,5:1 — sintoma de que a cor estava
      // forte demais para carregar texto. (A hora nem mora mais aqui, e a
      // opacidade dela morreu junto — ver ChatBubble.tsx.)
      return {
        ...common,
        backgroundColor: `color-mix(in srgb, ${accent.fill} ${USER_BUBBLE_TINT_PCT}%, ${paper})`,
        color: ink,
        border: '2px solid transparent',
      };
    case 'error':
    case 'approved':
      // ESTADO, não decoração: aqui a cor diz "deu erro" / "passou", e por isso
      // é o único tom que mantém a borda VISÍVEL (guarda-corpo #1 — efeito
      // causado por estado real).
      return {
        ...common,
        backgroundColor: `color-mix(in srgb, ${accent.fill} 10%, ${paper})`,
        color: ink,
        border: `2px solid color-mix(in srgb, ${accent.fill} 28%, ${paper})`,
      };
    case 'reply':
    case 'tutor':
    default:
      // Todo balão do tutor — teoria, pergunta semeada e resposta a dúvida — é
      // a MESMA superfície de leitura, sem borda e sem brilho. O roxo da
      // `reply` saiu daqui: ele era o "brilho roxo" que o dono apontou.
      return {
        ...common,
        backgroundColor: paper,
        color: ink,
        border: '2px solid transparent',
      };
  }
}

/**
 * Superfície do avatar do TUTOR: o topo da rampa neutra. Constante exportada
 * para o teste medir o MESMO degrau que a tela pinta, em vez de repetir a
 * string (ver tests/chatBubbleSurface.test.ts).
 */
export const TUTOR_AVATAR_SURFACE = 'surface.level4' as const;

/**
 * Avatar circular do autor. Ícones MUI (decisão da onda iMessage, preservada):
 * AutoStories para o Tutor, Person para o aluno, com `aria-label` i18n.
 *
 * ONDA11: ele deixou de ser uma coluna ao lado do balão (flutuando colado à
 * borda do painel, reclamação do dono) e passou a viver na linha de cabeçalho
 * do grupo, junto do nome e da hora — ver ChatBubble.tsx.
 *
 * ─── ONDA12: O ÚLTIMO ROXO DA TELA ────────────────────────────────────────
 * A varredura do DOM ainda achava `rgb(164,91,228)` — #a45be4, o `fill` escuro
 * da família `study` — no fundo deste avatar. A onda 11 tirou o roxo da BORDA
 * do balão da `reply` e do brilho, mas o avatar do tutor ficou para trás, e ele
 * aparece em TODA bolha do tutor: era o roxo mais frequente do app.
 *
 * O tutor passa a ser NEUTRO, e por um motivo, não por eliminação: nesta tela a
 * cor já significa uma coisa só — o balão do ALUNO é o acento `action` lavado a
 * 43%, e o avatar dele é esse mesmo acento cheio. Dar ao tutor um segundo
 * acento faria a tela ter duas cores identitárias competindo com as cores de
 * ESTADO (erro/aprovação), que são as únicas que precisam ser notadas. Na
 * referência o único elemento colorido da conversa é justamente o balão
 * enviado; tudo que é do outro lado é cinza. O tutor herda esse cinza.
 *
 * O degrau escolhido é o NÍVEL 4 — o topo da rampa, o mais distante do fundo:
 *   disco vs. fundo (nível 0) .. 1,36:1 claro · 1,72:1 escuro
 *      (nível 3 daria 1,20 / 1,48; o nível 4 é o único que chega perto do
 *       1,52:1 do balão recebido da referência)
 *   ícone `text.primary` no disco .. 12,28:1 claro · 9,83:1 escuro
 * O nível 4 é CHROME (rail, dock, estado selecionado) e é onde ele deve estar:
 * o avatar não é superfície de leitura, é etiqueta. O avatar do ALUNO fica como
 * está — `primary` cheio com `contrastText` por cima: 4,53:1 no claro e 4,77:1
 * no escuro, medido de `ACCENT_*.action.fill` × `onFill`.
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
        // Aluno → acento action (primário), a MESMA família do tint do balão
        // dele. Tutor → neutro do topo da rampa, com a tinta normal por cima.
        bgcolor: isUser ? 'primary.main' : TUTOR_AVATAR_SURFACE,
        color: isUser ? 'primary.contrastText' : 'text.primary',
      }}
    >
      {isUser ? <PersonIcon fontSize="small" /> : <AutoStoriesIcon fontSize="small" />}
    </Avatar>
  );
}
