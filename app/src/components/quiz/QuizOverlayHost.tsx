/**
 * src/components/quiz/QuizOverlayHost.tsx — o quiz SOBRE A TELA.
 *
 * O pedido do dono, literal: *"o layout do quiz deve ser sobre a tela e
 * respondendo ele minimiza para ficar no chat"* — e, junto, a regra que dá
 * sentido ao overlay: *"só vamos para o desafio depois que o aluno provar que
 * entendeu"*. Este componente é a metade "sobre a tela"; a metade "no chat" é
 * o `QuizChatCard`, ancorado na bolha da seção.
 *
 * ─── ONDA11: ELE SÓ ABRE POR GESTO, E PARECEU-SE COM A REFERÊNCIA ─────────
 * Duas mudanças do mesmo pedido do dono, e elas se sustentam:
 *
 *  1. o modal NÃO sobe mais sozinho. Quem decide a fase é
 *     `src/lib/quizOverlayState.ts`, e nenhum passo do ciclo pede
 *     'sobre-a-tela' — só `openQuizOverlay`/`reopenQuizOverlay`, que a
 *     LessonView chama a partir do BOTÃO do card da conversa. Este arquivo não
 *     muda de fase por conta própria (ele nem importa `openQuizOverlay`);
 *
 *  2. o card ficou NEUTRO. A referência que o dono mandou (o modal "Invite
 *     Friends" do Nintendo Switch Online) é: scrim escuro, cartão em cinza
 *     neutro com raio ~16px, SEM borda colorida e SEM brilho colorido, título
 *     centralizado em peso normal, opções como PÍLULAS DE CONTORNO (borda de
 *     1px, fundo transparente, texto centralizado, raio stadium) com respiro
 *     generoso, e a saída como TEXTO simples embaixo. A borda de 2px roxa mais
 *     o `boxShadow` roxo do irmão `ChallengeGenerateModal` eram exatamente o
 *     que destoava — aqui a cor sai do CHROME e sobra para o conteúdo.
 *
 * ─── POR QUE MONTADO NO SHELL, E NÃO NA VIEW ──────────────────────────────
 * Molde: `ChallengeGenerateModal` + `challengeGenerateStore` (App.tsx). O shell
 * monta SÓ a view ativa (`const View = VIEWS[active]`), então trocar de aba
 * DESMONTA a LessonView e zera qualquer `useState` dela. Um `Dialog`/`Popover`
 * do MUI não serve por dois motivos independentes: o estado morre com o
 * componente que o renderiza, e o conteúdo desmonta ao fechar — "minimizar"
 * viraria "perder a resposta". Aqui a FASE vive no módulo
 * (`src/lib/quizOverlayState.ts`, lido por `useSyncExternalStore`) e o
 * CONTEÚDO chega por `quizOverlayContent` (publicado pela LessonView).
 *
 * ─── O `AnimatePresence` COM A CONDICIONAL DENTRO ─────────────────────────
 * A saída anima porque o `AnimatePresence` envolve a condicional e o `if`
 * fica DENTRO — se o componente retornasse `null` quando fechado, o `exit`
 * nunca rodaria (o mesmo conserto documentado no irmão, revisão BAIXO-1). É
 * por isso que minimizar tem animação de saída em vez de sumiço seco. Esse
 * `AnimatePresence` vive AGORA no `ModalScrim` (auditoria §6 — a casca
 * fixed+scrim+blur+centrado-seguro é UMA cópia só, a do primitivo) e este
 * componente passa-lhe a condição por `open`: mesma regra, um só lugar.
 *
 * ─── AS SAÍDAS (e por que NENHUMA delas FECHA) ────────────────────────────
 * Esc, clique no backdrop e o "Minimizar" do rodapé fazem a MESMA coisa:
 * MINIMIZAR. `closeQuizOverlay` é, por contrato do store, "a afirmação foi
 * DOMINADA (o único fim do ciclo)" — deixar o Esc fechar seria deixar o aluno
 * dispensar o gate com uma tecla. Minimizado, o quiz continua na conversa, a
 * um clique de voltar, e o gate do "Próximo"/"Concluir aula" continua de pé.
 *
 * ─── ESTILO (nada inventado) ──────────────────────────────────────────────
 * Blur, zIndex e geometria são os do `ModalScrim` — os MESMOS do
 * `ChallengeGenerateModal` por construção (os dois chamam o primitivo), não
 * por cópia.
 *
 * A SUPERFÍCIE DO CARTÃO SEGUE A REGRA DO `MuiDialog` DO TEMA, e não uma regra
 * própria: NÍVEL 4 no escuro, NÍVEL 1 no claro, por `theme.applyStyles('dark',
 * …)` SEMPRE POR ÚLTIMO. A onda 11 tinha fixado o nível 3 nos DOIS esquemas, e
 * era um erro assimétrico: no escuro o nível 3 (#313131) só perde brilho para o
 * topo da rampa, mas no CLARO o nível 3 (#e9e2d6) é MAIS ESCURO que a página
 * (#faf7f2, Y 0,7657 contra 0,9326) — o modal lia como BURACO, não como
 * elevação, e foi a captura mais fraca da prova visual. Com o nível 1 (#ffffff)
 * o cartão passa a ser mais claro que a página nos termos da polaridade
 * positiva, e no escuro o nível 4 (#3b3b3b) é o objeto mais alto da tela, que é
 * o que "elevação é LUZ" quer dizer sob polaridade negativa (a íntegra do
 * raciocínio está no comentário do `MuiDialog` em src/theme.ts). A regra é a do
 * primitivo (`modalSurfaceStyles`, a mesma que o `MuiDialog` chama) e o chrome
 * daqui (`cardSx`) só acrescenta a sombra.
 *
 * O SCRIM é o TOKEN `palette.scrim` (preto puro a 55%), lido pelo
 * `ModalScrim`. O overlay não é montado com um `Backdrop` do MUI — é um
 * `motion.div`, para que o `exit` do "minimizar" anime —, então ele não herda
 * o `MuiBackdrop`; mas herdar o VALOR e repetir o valor são coisas diferentes,
 * e repetir foi o erro. Esta linha já foi `rgba(8, 10, 20, 0.66)` (cor CRUA,
 * proibida, e AZULADA num app de rampa cinza neutro) e depois um `color-mix`
 * de 62% copiado do `MuiBackdrop` da época; quando o tema publicou o token e
 * passou a consumi-lo, a cópia virou o quarto scrim divergente da base. Ler o
 * token é o que fecha isso: um valor, um lugar.
 *
 * O raio sai de `SHAPE` e a sombra é NEUTRA (`common.black` por `color-mix`),
 * não um halo do acento `study`. `alpha()` do MUI continua PROIBIDO (lança com
 * CSS var — MUI #9); toda composição de cor é `color-mix`, e nenhuma cor crua
 * nasce neste arquivo — nem hex, nem `rgb()`/`rgba()`, nem `hsl()`.
 *
 * ─── O INVARIANTE SAGRADO DAS ALTERNATIVAS ────────────────────────────────
 * Quem decide a aparência de cada alternativa continua sendo a função PURA
 * `optionVisualState` (que NÃO lê `answerIndex` antes da resposta). As pílulas
 * daqui são CSS de descendente aplicado às QUATRO por igual — geometria para
 * todas, e cor só para `.MuiButton-outlined:not(.Mui-disabled)`, que é o
 * estado das quatro ANTES de responder. A alternativa que vira `contained`
 * (veredito) e as que ficam `disabled` mantêm o desenho do tema, com o
 * contraste que ele calibrou.
 *
 * ─── a11y (§8.1, NORMATIVO) ───────────────────────────────────────────────
 *  - `role="dialog"` + `aria-modal="true"` + `aria-label` i18n;
 *  - o card recebe FOCO ao abrir (`tabIndex={-1}` + `focus()`), então o
 *    teclado entra no diálogo em vez de continuar no input do chat; o Tab fica
 *    PRESO no diálogo (com `aria-modal` o leitor de tela já ignora o resto da
 *    tela — sem o laço, o teclado ainda passearia por baixo do scrim);
 *  - ao sair, o foco VOLTA para o CARD DA CONVERSA que abriu o modal. O caminho
 *    é indireto DE PROPÓSITO, e as DUAS versões anteriores erraram por motivos
 *    diferentes — vale registrar os dois, porque a segunda parecia consertada:
 *
 *      (a) a primeira guardava o `document.activeElement` da abertura e o
 *          refocava "se ainda estiver na tela". Só que o único elemento que
 *          abre este modal é o CTA "Responder" do `QuizChatCard`, e ele é
 *          DESMONTADO enquanto o modal está em cena (`canOpen = !onScreen && …`).
 *
 *      (b) a segunda tentou corrigir subindo do abridor até o card com
 *          `closest(QUIZ_CARD_ANCHOR_SELECTOR)` na ABERTURA — e a âncora ainda
 *          não existia naquele instante. Quando este efeito roda, o CTA já foi
 *          desmontado pelo MESMO commit que ligou o modal, então
 *          `document.activeElement` já é o `<body>`; `body.closest(…)` é null, a
 *          âncora nascia null, e — o detalhe que fazia a falha parecer sucesso —
 *          o `<body>` é `instanceof HTMLElement` e está sempre `isConnected`,
 *          então `focusReturnTarget` o devolvia como alvo "válido" e chamava
 *          `body.focus()`, que é um no-op silencioso. Dois revisores mediram o
 *          foco caindo no `<body>` (SC 2.4.3) enquanto este cabeçalho declarava
 *          a feature pronta.
 *
 *    O que está no ar agora inverte o momento da resolução: na ABERTURA grava-se
 *    só a CHAVE do quiz (dado, não nó — e o `<body>` é explicitamente recusado
 *    como abridor); no FECHAMENTO a âncora é procurada no documento VIVO por
 *    `quizCardAnchorSelector(chave)`, quando o card já renasceu. A âncora
 *    carrega a chave canônica como VALOR justamente para isto: com mais de um
 *    quiz pendente na conversa, o seletor genérico devolveria o primeiro card,
 *    não o que o aluno fechou. A escolha final continua sendo a função PURA
 *    `focusReturnTarget`, mas quem prova que ela CHEGA À TELA é a spec e2e —
 *    teste puro com nós de mentira foi exatamente o que deixou (b) passar;
 *  - `prefers-reduced-motion: reduce` desliga o overshoot: a entrada vira
 *    fade puro (sem `y`, sem `scale`) — o movimento sai, a informação NUNCA
 *    (o texto de estado é `role="status"` no card, não uma animação).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactElement,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@mui/material/styles';
import { Box, Button, Stack, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

import { SHAPE, LAYOUT, Z_INDEX } from '../../lib/designTokens';
import { touchTargetSx } from '../../lib/layoutSx';
import { PILL_OUTLINE, quizPillOutline } from '../../lib/quizPill';
import {
  peekQuizOverlay,
  subscribeQuizOverlay,
  type QuizOverlayState,
} from '../../lib/quizOverlayState';
import { LessonQuizCard } from '../../views/LessonView/LessonQuiz';
import {
  peekQuizOverlayContent,
  quizCardAnchorSelector,
  quizOverlayIsShowing,
  subscribeQuizOverlayContent,
  type QuizOverlayContent,
} from './quizOverlayContent';
import { ModalScrim } from '../ui/ModalScrim';

/**
 * A devolução de foco é a função PURA do design system
 * (`lib/focusTrap.focusReturnTarget`, a origem deste código) — re-exportada
 * daqui para manter o contrato público deste módulo
 * (`tests/quizOverlayFocusReturn.test.ts` continua a importá-la do host).
 */
export {
  focusReturnTarget,
  type FocusReturnAnchor,
  type FocusReturnNode,
} from '../../lib/focusTrap';

/**
 * Entrada sem overshoot para `prefers-reduced-motion: reduce` (§8.1): é o
 * `reducedFadeVariants` do design system (`lib/animationTokens` — §13 da
 * auditoria; a cópia que vivia aqui foi uma das duas fontes daquele token) e
 * vive AGORA no `ModalScrim`, que é quem anima o cartão (§6).
 */

/**
 * PARA ONDE o foco volta quando o modal sai (§8.1 / SC 2.4.3) — a regra mora
 * AGORA no design system: `lib/focusTrap.focusReturnTarget` (a origem deste
 * código foi este arquivo; a onda de consolidação levou-a para o módulo único,
 * e este módulo re-exporta-a para manter o contrato público). As três pernas
 * continuam as mesmas — o abridor vivo, o primeiro focável da ÂNCORA que
 * sobrevive ao fecho, ou NINGUÉM —, testadas em
 * `tests/quizOverlayFocusReturn.test.ts` e `tests/focusTrap.test.ts`.
 *
 * O laço de Tab + Esc + entrada de foco é `useFocusTrap` (o adapter React do
 * mesmo módulo) e vive DENTRO do `ModalScrim` (auditoria §6/§7): o container
 * só resolve a âncora (`getReturnAnchor`, no fechamento) e diz o que é
 * dispensar (`minimize`).
 */

/**
 * VIEW PURA do quiz sobre a tela (extração state/view): recebe o snapshot da
 * fase e o conteúdo publicado POR PROPS — não lê store nenhum, não faz IPC e
 * não muda de fase. Tudo o que é estado/motor (loja de módulo, foco, teclado)
 * fica no container `QuizOverlayHost`, que a renderiza. É esta fronteira que
 * permite documentar cada fase da UI com argumentos diretos no Storybook e
 * exercitar o desenho em `node:test` sem tocar na loja.
 */
export interface QuizOverlayViewProps {
  /** Snapshot da fase (`quizOverlayState`) — chega por props, nunca da loja. */
  overlay: QuizOverlayState;
  /** Conteúdo publicado pela view da aula (null = nada a desenhar). */
  content: QuizOverlayContent | null;
  /** Minimizar para a conversa — a ÚNICA saída (Esc, backdrop, botão). */
  minimize: () => void;
  /**
   * Âncora de devolução de foco — o card da conversa, endereçado pela chave
   * do quiz e procurado no documento VIVO quando o modal sai. O container é
   * quem a resolve (é dele o `anchorKeyRef`); o `ModalScrim` é quem a usa no
   * laço de foco — o cartão do diálogo é do primitivo, que recebe o foco.
   */
  getReturnAnchor?: () => HTMLElement | null;
}

export function QuizOverlayView({
  overlay,
  content,
  minimize,
  getReturnAnchor,
}: QuizOverlayViewProps): ReactElement {
  const { t } = useTranslation();
  // Cast de interpolação da casa (ver LessonView) — `t` tipado por chave
  // literal não aceita `options` sem ele.
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const theme = useTheme();

  // ─── As cores do cartão: NEUTRAS, e todas da rampa/variáveis do tema ─────
  const ink = theme.vars.palette.text.primary;
  const black = theme.vars.palette.common.black;
  // Sombra NEUTRA: profundidade sem halo colorido (a referência não tem brilho).
  const cardShadow = `0 18px 56px -20px color-mix(in srgb, ${black} 45%, transparent)`;
  // SCRIM: o TOKEN do tema (`palette.scrim`, preto puro a 55%) — AGORA lido
  // pelo `ModalScrim`, que é a única cópia do shell (auditoria §6: fixed +
  // scrim + blur + centrado seguro + scroll). A história do valor continua a
  // valer: foi `rgba(8, 10, 20, 0.66)` (cor crua, proibida pelo contrato de
  // designTokens.ts, e ainda AZULADA — B 20 contra R 8 — num app cuja rampa é
  // cinza neutro desde a onda 11) e depois um `color-mix` de 62% copiado do
  // `MuiBackdrop` da época; quando o tema publicou o token, a cópia virou o
  // QUARTO scrim divergente da base. Ler o token é o que impede a divergência
  // de voltar — quando a opacidade mudar, muda em UM lugar. Custo medido da
  // queda de 62% para 55%: a separação cartão↔fundo-escurecido cai de 6,48:1
  // para 5,00:1 no claro e de 1,82:1 para 1,81:1 no escuro; nenhum piso
  // normativo mora aí (superfície contra superfície não é alvo do SC 1.4.11)
  // e o que separa o cartão é a rampa.
  // Contorno em tinta diluída, não acento. A FÓRMULA vive uma vez só no módulo
  // puro `lib/quizPill.ts` (auditoria §13: `pillOutline` era recalculado à mão
  // em dois pontos) e a percentagem é o valor NOMEADO `PILL_OUTLINE.overlay`
  // (55%). `color-mix` com `transparent` deixa a tinta a 55% de alfa, então o
  // que se enxerga é 0,55·tinta + 0,45·superfície DO CARTÃO: claro #817f7d
  // sobre #ffffff = 3,99:1 · escuro #9f9f9f sobre #3b3b3b = 4,23:1, os dois
  // acima do piso de 3:1 do SC 1.4.11 para não-texto.
  //
  // ATENÇÃO ao nome, que envelheceu: isto NÃO desenha mais as pílulas. O
  // LessonQuiz passou a pintá-las com `&&.MuiButton-outlined:not(.Mui-disabled)`
  // (especificidade 0,4,0) a 72% — o `PILL_OUTLINE.card` do mesmo módulo — e a
  // regra por descendência daqui (0,3,0) perde de forma determinística — o
  // único consumidor que sobrou é o botão "Responder de novo" do aviso, logo
  // abaixo. As duas declarações mortas (`borderWidth`/`borderColor` na regra de
  // descendência) saíram: comentário e código que descrevem cor que não chega à
  // tela são exatamente o defeito que esta onda foi consertar.
  const pillOutline = quizPillOutline(theme, PILL_OUTLINE.overlay);

  // O overlay só desenha quando a FASE pede a tela E o conteúdo publicado é o
  // MESMO quiz — regra PURA (`quizOverlayIsShowing`, no módulo de conteúdo),
  // compartilhada pela view e pelo container para que os dois não divirjam.
  const showing = quizOverlayIsShowing(overlay, content);

  // CHROME do cartão (o slot `cardSx` do `ModalScrim` — auditoria §6): a
  // SOMBRA NEUTRA medida deste modal compõe por cima da superfície base do
  // primitivo, que é a REGRA DO MODAL do tema (nível 1 no claro, nível 4 no
  // escuro, `applyStyles('dark', …)` POR ÚLTIMO — a MESMA função que o
  // `MuiDialog` chama, `modalSurfaceStyles` de src/theme.ts) + o raio
  // `SHAPE.md` + o padding do exemplar. Reescrever aquela regra à mão aqui foi
  // o que deixou este modal no nível 3 por onze ondas, divergindo do resto da
  // base sem que nada acusasse; com a função compartilhada, quiz e Dialog não
  // podem divergir — se o tema mudar de degrau, os dois mudam juntos. O
  // `outline: 'none'` é o do cartão que RECEBE foco ao abrir (`tabIndex={-1}`).
  const cardChrome = { boxShadow: cardShadow, outline: 'none' };

  return (
    <ModalScrim
      open={showing && content !== null}
      ariaLabel={t('translation:lesson.quizOverlayAria')}
      // Esc e clique no backdrop MINIMIZAM — a dispensa do diálogo nunca fecha
      // o ciclo (ver o cabeçalho). O `onDismiss` do primitivo cobre os dois.
      onDismiss={minimize}
      maxWidth={LAYOUT.modalCardPx}
      zIndex={Z_INDEX.modal}
      // A devolução de foco é endereçada pela chave do quiz (o container
      // resolve a âncora no FECHAMENTO, no documento vivo).
      getReturnAnchor={getReturnAnchor}
      cardSx={cardChrome}
    >
      {content !== null ? (
        <>
          {/* O TÍTULO, agora como RÓTULO (ONDA 13).
              A prova visual mediu DOIS 18px empilhados: este título
              (`subtitle1`, 18px/400) e a PERGUNTA logo abaixo (18px/500).
              Mesmo corpo, 100 de peso de diferença — dois cabeçalhos
              disputando onde a referência tem um só, que foi exatamente o
              defeito que a onda anterior já tinha consertado uma camada
              acima (a afirmação em negrito) e que voltou uma camada
              adiante.
              Ele cai para RÓTULO — 14px, peso 600, tinta secundária,
              espaçamento de caixa-alta —, o mesmo desenho que o card da
              conversa já usa no "QUIZ RÁPIDO". Com isso a PERGUNTA fica
              sozinha como voz principal do corpo, que é o que a referência
              mostra: um título, e o conteúdo.
              Três coisas NÃO mudam, e são o motivo de o rótulo continuar
              sendo um `component="h2"`: o papel de cabeçalho na árvore de
              acessibilidade, o `aria-labelledby` do diálogo (o nome
              acessível continua "Prove que entendeu" — quem chega pelo
              leitor de tela ouve o PROPÓSITO, não a pergunta solta) e a
              âncora por onde o e2e encontra o diálogo.
              Contraste da tinta secundária sobre a superfície do cartão,
              que é nível 4 no escuro e nível 1 no claro:
              [medido] INK_DARK.secondary x SURFACE_DARK.level4 = 4,99:1 ·
              [medido] INK_LIGHT.secondary x SURFACE_LIGHT.level1 = 8,23:1.
              Piso de texto 4,5:1 — passa no pior caso. */}
          <Typography
            variant="body2"
            component="h2"
            sx={{
              textAlign: 'center',
              fontWeight: 600,
              letterSpacing: 1,
              color: 'text.secondary',
            }}
          >
            {t('translation:lesson.quizOverlayTitle')}
          </Typography>
          {content.generation > 0 ? (
            <Typography
              variant="caption"
                 
              sx={{ color: 'text.secondary', display: 'block', textAlign: 'center', mt: 0.5 }}
            >
              {tI('lesson.quizAttemptLabel', { n: content.generation + 1 })}
            </Typography>
          ) : null}

          {/* O CARD é o mesmo da conversa (LessonQuizCard): a decisão
              visual de cada alternativa continua vindo da função PURA
              `optionVisualState` — o overlay não reimplementa nada e a
              resposta segue sem vazar antes do clique.

              O que este wrapper faz é APARÊNCIA, e por descendência: dentro
              do modal o card interno para de ser um cartão (dois retângulos
              aninhados, um deles com o rótulo "Quiz rápido" repetindo o
              título que está logo acima) e as alternativas viram as pílulas
              de contorno da referência. Tudo aplicado às QUATRO por igual —
              o invariante de "nada distingue a certa" é preservado porque
              nenhuma regra aqui olha para o índice. */}
          <Box
            sx={{
              mt: 2,
              // a moldura do card interno desaparece: o modal já é a caixa
              '& > div > .MuiBox-root': {
                border: 'none',
                bgcolor: 'transparent',
                p: 0,
                mt: 0,
              },
              // o rótulo "Quiz rápido" some: o título do diálogo já diz isso
              '& .MuiTypography-overline': { display: 'none' },
              '& .MuiTypography-root': { textAlign: 'center' },
              // GEOMETRIA das alternativas — igual para as quatro
              '& .MuiButton-root': {
                borderRadius: `${SHAPE.pill}px`,
                minHeight: 52,
                justifyContent: 'center',
                textAlign: 'center',
                px: 2.5,
              },
              // respiro generoso entre as pílulas (a referência empilha com ar)
              '& .MuiButton-root + .MuiButton-root': { marginTop: '12px' },
              // COR só no estado em que as quatro são idênticas: rótulo em
              // tinta cheia, fundo transparente. O veredito (`contained`) e
              // as travadas (`disabled`) ficam com o desenho do tema, que
              // já calibrou o contraste deles.
              //
              // O CONTORNO saiu daqui na onda 12 e é do LessonQuiz. Esta
              // regra é por descendência (0,3,0) e a de lá é `&&` (0,4,0):
              // `borderWidth: 1px` e `borderColor` NUNCA chegavam à tela, e
              // um par de declarações mortas com número de contraste no
              // comentário ao lado é pior que nenhuma — descreve uma cor
              // que ninguém vê. Quem manda na borda da pílula é
              // src/views/LessonView/LessonQuiz.tsx (1,5px a 72%).
              '& .MuiButton-outlined:not(.Mui-disabled)': {
                color: ink,
                backgroundColor: 'transparent',
              },
            }}
          >
            <LessonQuizCard
              assertion={content.assertion}
              quiz={content.quiz}
              onSelect={content.onSelect}
            />
          </Box>

          {content.notice ? (
            <Stack spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                {/* `info.accentText`, não `info.main`. `main` é o
                    PREENCHIMENTO da família (#1489b3 no escuro) e ele mede
                    2,81:1 sobre o cartão novo (#3b3b3b) — abaixo do piso de
                    3:1 do SC 1.4.11 para não-texto. Foi o degrau do cartão
                    que mudou, não o ícone: sobre o nível 3 antigo ele ainda
                    passava. O valor de TEXTO da família resolve nos dois
                    esquemas: escuro #1698c7 sobre #3b3b3b = 3,39:1 · claro
                    #0d759b sobre #ffffff = 5,20:1. */}
                <InfoOutlinedIcon
                  fontSize="small"
                  sx={(tema) => ({
                    color: tema.vars.palette.info.accentText,
                    flexShrink: 0,
                    mt: 0.25,
                  })}
                />
                <Typography role="status" variant="body2" sx={{ color: 'text.secondary' }}>
                  {content.notice}
                </Typography>
              </Stack>
              {content.onRetry || content.onReopen ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, justifyContent: 'center' }}>
                  {/* RÓTULO EM TINTA, e não no acento. Sem `color` estes
                      dois botões caíam no default `primary`, que o tema
                      reaponta para `accentText` nas variantes `text` e
                      `outlined` (src/theme.ts, MuiButton). Só que
                      `accentText` é calibrado contra os níveis 0, 1 e 2 —
                      o contrato de designTokens.ts diz isso com todas as
                      letras — e este cartão é o nível 4 no ESCURO.

                      Medido nas superfícies de HOJE (o cartão migrou para
                      nível 1 no claro e nível 4 no escuro, e o vermelho
                      claro foi dessaturado na mesma onda): escuro #eb614c
                      sobre #3b3b3b = 3,39:1 — REPROVA o piso de 4,5:1 de
                      texto; claro #be3b27 sobre #ffffff = 5,46:1, que
                      passa. Ou seja: o acento só falha em UM dos dois
                      esquemas, e é por isso que a tinta é a escolha — um
                      rótulo não pode ter contraste dependente de tema.
                      (Um comentário anterior citava 3,93:1 e "claro
                      #cc3119 sobre #e9e2d6 = 4,06:1": os dois eram medidos
                      contra o nível 3, o degrau que este modal deixou de
                      usar, e aquele hex não existe mais na paleta.)

                      Em tinta o par vai a 9,83:1 no escuro (#f0f0f0 sobre
                      #3b3b3b) e 17,90:1 no claro (#191713 sobre #ffffff).
                      O ícone acompanha o rótulo, por herança. */}
                  {content.onRetry ? (
                    <Button
                      size="small"
                      variant="text"
                      onClick={content.onRetry}
                      startIcon={<ReplayIcon />}
                      sx={{ color: ink }}
                    >
                      {t('translation:lesson.quizChatRetry')}
                    </Button>
                  ) : null}
                  {/* ONDA4-SAÍDA-DO-CICLO: a saída que NÃO depende da IA —
                      responder de novo a MESMA pergunta. O card compacto da
                      conversa oferece a mesma coisa (QuizChatCard); as duas
                      metades do quiz não podem divergir no que oferecem. */}
                  {content.onReopen ? (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={content.onReopen}
                      startIcon={<RestartAltIcon />}
                      // Mesma razão do irmão acima — e a BORDA vai para o
                      // mesmo contorno de tinta diluída das pílulas
                      // (3,99:1 no claro, 4,23:1 no escuro), em vez do
                      // `accentText` que o tema dá ao `outlined`.
                      sx={{ color: ink, borderColor: pillOutline }}
                    >
                      {t('translation:lesson.quizChatReopen')}
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
            </Stack>
          ) : null}

          <Typography
            variant="caption"
               
            sx={{ color: 'text.secondary', display: 'block', textAlign: 'center', mt: 2 }}
          >
            {t('translation:lesson.quizOverlayHint')}
          </Typography>

          {/* A saída, como na referência: TEXTO simples embaixo, apagado,
              sem borda. Ela MINIMIZA — nunca fecha o ciclo. */}
          <Stack sx={{ mt: 1, alignItems: 'center' }}>
            <Button
              variant="text"
              onClick={minimize}
              sx={{ color: 'text.secondary', ...touchTargetSx, px: 3 }}
            >
              {t('translation:lesson.quizOverlayMinimize')}
            </Button>
          </Stack>
        </>
      ) : null}
    </ModalScrim>
  );
}

/**
 * CONTAINER do quiz sobre a tela (state/view): liga as DUAS lojas de módulo
 * (fase em `quizOverlayState` + conteúdo em `quizOverlayContent`) à
 * `QuizOverlayView` e mantém o motor DOM da devolução de foco (a âncora,
 * resolvida no fechamento — o laço de foco e o Esc vivem no `ModalScrim`,
 * auditoria §6/§7). Ele próprio não desenha nada — a view recebe o snapshot
 * por props. O seed/reset continua a ser `openQuizOverlay` /
 * `__resetQuizOverlayForTests` (é o que as histórias do Storybook usam para
 * montar as três fases).
 */
export function QuizOverlayHost(): ReactElement {
  // O TERCEIRO argumento é o snapshot de servidor. Ele é o MESMO `peek` porque
  // os dois estados são variáveis de MÓDULO: não existe "estado do servidor"
  // diferente do do cliente. E ele não é zelo teórico — sem ele o React recusa
  // renderizar este componente fora do navegador ("Missing getServerSnapshot"),
  // e é justamente `react-dom/server` que permite, num repositório SEM jsdom,
  // PROVAR o que chega à tela (tests/quizOverlayRender.test.ts: o diálogo
  // aparece, as quatro alternativas nascem iguais e a resposta não vaza).
  const overlay = useSyncExternalStore(subscribeQuizOverlay, peekQuizOverlay, peekQuizOverlay);
  const content = useSyncExternalStore(
    subscribeQuizOverlayContent,
    peekQuizOverlayContent,
    peekQuizOverlayContent,
  );
  /** A CHAVE do quiz em cena — o endereço do card para onde o foco volta. */
  const anchorKeyRef = useRef<string | null>(null);

  const showing = quizOverlayIsShowing(overlay, content);

  /** Minimizar — a ÚNICA saída (ver o cabeçalho). Lê o conteúdo por PEEK para
   *  não carregar closure velha no handler de Esc. */
  const minimize = useCallback((): void => {
    peekQuizOverlayContent()?.onMinimize();
  }, []);

  // A chave do quiz em cena é gravada ENQUANTO ele está na tela (dado, não nó):
  // o CTA que abriria é desmontado, mas o CARD da conversa fica — e é ele,
  // endereçado por esta chave, que recebe o foco quando o overlay sai.
  useEffect(() => {
    if (showing && content !== null) anchorKeyRef.current = content.quizKey;
  }, [showing, content]);

  // Esc MINIMIZA, o Tab fica preso no diálogo e o foco entra nele ao abrir —
  // o laço é o do design system (`useFocusTrap` sobre `lib/focusTrap`; a
  // cópia que vivia aqui foi o exemplar de onde aquele módulo nasceu) e vive
  // DENTRO do `ModalScrim`: este container entrega-lhe a âncora e o `minimize`
  // como dispensa.
  //
  // A devolução de foco resolve a ÂNCORA no FECHAMENTO (o `getReturnAnchor`
  // só é chamado aí, pelo cleanup do hook), no documento vivo — na abertura a
  // âncora ainda não existe (o CTA renasce no mesmo commit que desliga o
  // modal). Ela é ENDEREÇADA pela chave do quiz: com mais de um quiz pendente
  // na conversa, o seletor genérico devolveria o primeiro card, não o que o
  // aluno fechou. O `<body>` nunca conta como abridor (regra do
  // `focusReturnTarget`, testada em tests/quizOverlayFocusReturn.test.ts).
  const getReturnAnchor = useCallback((): HTMLElement | null => {
    const key = anchorKeyRef.current;
    // A âncora é procurada no documento VIVO — ver o comentário acima.
    return key === null ? null : document.querySelector<HTMLElement>(quizCardAnchorSelector(key));
  }, []);

  return (
    <QuizOverlayView
      overlay={overlay}
      content={content}
      minimize={minimize}
      getReturnAnchor={getReturnAnchor}
    />
  );
}
