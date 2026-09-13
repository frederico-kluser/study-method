/**
 * src/views/LessonView/LessonQuiz.tsx — card do QUIZ de múltipla escolha por
 * afirmação da aula (ONDA 4 — quiz-durante-aula, REPLAN A1).
 *
 * Um card por assertion (máx. 3 por aula), renderizado APÓS a bolha da seção
 * de teoria que a demonstra (a LessonView ancora pelo sectionId via
 * `quizzesByMessageIndex` de trackLessonState). Comportamento:
 *
 *   - NÃO respondido: 4 opções clicáveis (Button MUI, outline, texto à
 *     esquerda) VISUALMENTE IDÊNTICAS entre si; ao selecionar → feedback
 *     IMEDIATO — correto: verde + mensagem de sucesso (lesson.quizCorrect);
 *     errado: vermelho + o `feedback` da assertion explicando o porquê
 *     (lesson.quizWrong/lesson.quizFeedback);
 *   - respondido: o card FICA (preenchido — o gating é visual e a resposta é
 *     idempotente/travada): a opção correta em verde com CheckCircle, a errada
 *     escolhida em vermelho com Cancel, as demais desabilitadas; o feedback
 *     permanece abaixo (revisão durante a aula).
 *
 * ONDA10 — BUG 1 (o quiz ENTREGAVA a resposta): `variant` estava guardada por
 * `answered`, mas `color` e `startIcon` NÃO — a alternativa CERTA aparecia
 * verde e com ✓ ANTES do primeiro clique. O conserto NÃO é um `&& answered` a
 * mais: toda a decisão visual saiu do JSX para a função PURA
 * `optionVisualState` (src/lib/trackLessonState.ts), que RETORNA CEDO com um
 * estado neutro enquanto não há resposta — e nesse caminho `answerIndex` NEM É
 * LIDO. Este componente não recebe mais `answerIndex` no render das opções:
 * ele só repassa `{ color, variant, icon, disabled }`. Coberto por
 * tests/lessonQuizVisual.test.ts (inclusive uma guarda de FONTE que reprova o
 * arquivo se `answerIndex` reaparecer no JSX).
 *
 * ONDA12 — BUG 3 (a resposta vazava pela POSIÇÃO): `answerIndex` é 0 nas 44
 * afirmações do curso real e nada embaralhava as opções, então a alternativa
 * CERTA era SEMPRE A PRIMEIRA PÍLULA. As quatro nasciam indistinguíveis por
 * classe/cor/borda/ícone (ONDA10) e perfeitamente distinguíveis por LUGAR.
 * Agora as pílulas são desenhadas na ordem de EXIBIÇÃO que
 * `src/lib/quizOptionOrder.ts` deriva de (chave canônica, geração) — pura,
 * determinística e estável entre renders. A FRONTEIRA DE ÍNDICES é o que
 * mantém tudo o mais igual: `optionVisualState` continua recebendo o índice
 * ORIGINAL, o clique submete o índice ORIGINAL (`onSelect`) e o banco continua
 * gravando `selectedIndex` original. Só o `aria-label` acompanha a tela — ele
 * anuncia "Opção N de 4", e um N preso ao índice do JSON reabriria o mesmo
 * atalho para quem navega por leitor de tela. Coberto por
 * tests/quizOptionLeak.test.ts (o aluno que clica sempre na primeira pílula
 * NÃO domina) e tests/quizOptionOrder.test.ts (a distribuição medida).
 *
 * ONDA10 — BUG 2 (o quiz podia ser ignorado): o quiz deixou de ser reforço e
 * virou GATE — a LessonView bloqueia "Próximo"/"Concluir aula" enquanto houver
 * quiz sem resposta (`pendingQuizzes*` em trackLessonState). Responder ERRADO
 * libera igual a acertar; nada aqui muda por causa disso (o card já travava as
 * opções após a resposta).
 *
 * a11y: os botões têm aria-label i18n (chave lesson.quizOptionAria — "Opção 2
 * de 4: …") e o feedback usa role="status" (SC 4.1.3 — o veredito nunca
 * depende só da cor; contraste pelos pares calibrados do tema: success.main /
 * error.main sobre background.paper).
 */
import { Box, Button, Stack, Typography, useTheme } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { useTranslation } from 'react-i18next';
import { useMemo, type ReactElement } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { fadeInUp, springs } from '../../lib/animationTokens';
import type { TrackAssertionDto } from '../../../shared/ipc-contract';
import { optionVisualState, quizCycleOf, quizKeyFor } from '../../lib/trackLessonState';
import type { QuizState } from '../../lib/trackLessonState';
import { quizOptionOrder } from '../../lib/quizOptionOrder';

export interface LessonQuizCardProps {
  /** A afirmação da aula com o quiz (statement/question/options/answerIndex/feedback). */
  assertion: TrackAssertionDto;
  /** Estado da resposta (undefined = ainda não respondido). */
  quiz: QuizState | undefined;
  /** Submit da resposta (a LessonView injeta o sectionId — `submitQuizAnswer`
   *  é idempotente: a primeira resposta vence). */
  onSelect: (answerIndex: number) => void;
}

export function LessonQuizCard({ assertion, quiz, onSelect }: LessonQuizCardProps): ReactElement {
  const { t } = useTranslation();
  const tI = useMemo(
    () => t as unknown as (key: string, options?: Record<string, string | number>) => string,
    [t],
  );
  const theme = useTheme();
  const answered = quiz?.answered === true;
  const correct = quiz?.correct === true;
  // ONDA16-VEREDITO: o veredito ENTRA com um pop curto (nível spatial — só
  // transform + opacidade, nunca cor) quando o estado `answered` chega. Sob
  // prefers-reduced-motion o movimento sai (`initial={false}` — sem animação),
  // mas a INFORMAÇÃO nunca: o box do veredito aparece do mesmo jeito.
  const reduceMotion = useReducedMotion();

  // ONDA12 (bug 3): a ORDEM DE EXIBIÇÃO das pílulas. A semente é a chave
  // CANÔNICA do quiz (`quizKeyFor` — a mesma do estado e do gate; para uma
  // assertion remediadora ela devolve a chave ORIGINAL) mais a GERAÇÃO do
  // ciclo. Duas propriedades importam aqui e as duas vêm de graça:
  //   - ESTÁVEL entre renders — o card re-renderiza a cada tick do typewriter
  //     e a cada turno do tutor; a pílula não pode trocar de texto embaixo do
  //     dedo do aluno entre o mousedown e o mouseup;
  //   - DIFERENTE por geração — o quiz remediador e a reabertura de
  //     `reopenStalledQuiz` (mesma pergunta, geração N+1) recebem ordens
  //     próprias, então "clicar no mesmo lugar de novo" também não é atalho.
  const seedKey = quizKeyFor(assertion);
  const generation = quizCycleOf(quiz).generation;
  const optionCount = assertion.options.length;
  const displayOrder = useMemo(
    () => quizOptionOrder(seedKey, generation, optionCount),
    [seedKey, generation, optionCount],
  );

  // CONTORNO DAS PÍLULAS (prova visual desta onda: 1px a 55% de tinta some
  // contra o cartão; a referência usa contorno cheio e nítido). Sobe para
  // 1,5px a 72% — sem cor crua, tinta do tema diluída por color-mix, como
  // manda o contrato de tokens.
  //
  // AS CONTAS, recalculadas contra TODAS as superfícies em que este card
  // aparece (o modal do quiz e o card `dominado` da conversa, que herda
  // `background.paper`). A tinta composta é `primary × 0,72 + fundo × 0,28`:
  //   escuro  nível 1 #1b1b1b → #b4b4b4  8,31:1
  //   escuro  nível 3 #313131 → #bbbbbb  6,78:1
  //   escuro  nível 4 #3b3b3b → #bdbdbd  5,96:1
  //   claro   nível 1 #ffffff → #595855  7,11:1
  //   claro   nível 3 #e9e2d6 → #53504a  6,24:1
  // O piso é 3:1 (SC 1.4.11, elemento não-textual) e o pior caso fica em
  // 5,96:1 — quase o DOBRO. Os níveis 3 e 4 estão nas contas de propósito: o
  // cartão do modal migra para nível 4 no escuro e nível 1 no claro nesta
  // mesma onda, e um número medido só contra o nível de hoje envelheceria na
  // integração.
  //
  // A regra é `&&` (especificidade 0,4,0) porque o QuizOverlayHost pinta o
  // mesmo alvo por descendência (0,3,0) — sem o dobro de classe, quem vence
  // passaria a ser a ORDEM DE INSERÇÃO do emotion, que nenhum teste trava.
  // E ela vale só para `outlined:not(.Mui-disabled)`: esse é EXATAMENTE o
  // estado em que as quatro são idênticas. O veredito (`contained`) e as
  // travadas (`disabled`) continuam com o desenho do tema, que já calibrou o
  // contraste deles — nenhuma regra daqui olha para o índice da resposta.
  const pillOutline = `color-mix(in srgb, ${theme.vars.palette.text.primary} 72%, transparent)`;

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      transition={springs.gentle}
      style={{ maxWidth: 640, width: '100%' }}
    >
      <Box
        sx={{
          border: '1px solid',
          borderColor: answered ? (correct ? 'success.main' : 'error.main') : 'divider',
          borderRadius: 2,
          bgcolor: 'background.paper',
          p: 1.5,
          mt: 1,
        }}
      >
        <Stack spacing={1}>
          <Typography variant="overline" sx={{ color: 'text.secondary', letterSpacing: 1 }}>
            {t('translation:lesson.quizTitle')}
          </Typography>
          {/* ONDA12 (hierarquia — a prova visual achou DOIS cabeçalhos
              competindo): a AFIRMAÇÃO vinha em body2 NEGRITO, mais forte que a
              pergunta logo abaixo, e disputava o papel do título do modal
              ("Prove que entendeu", peso normal, o único título da
              referência). Ela cai para body2 em tinta SECUNDÁRIA e peso
              normal — vira a linha de contexto que é —, e a PERGUNTA sobe
              para body1 (18px) com peso 500: a voz principal do CORPO, sem
              virar um segundo cabeçalho (continua na família de TEXTO, no
              corpo de leitura; título nesta base é display 700).
              Contraste da secundária, recalculado: escuro #adadad sobre
              nível 4 #3b3b3b = 4,99:1 e sobre nível 1 #1b1b1b = 7,68:1; claro
              #544e45 sobre #ffffff = 8,23:1 e sobre #e9e2d6 = 6,39:1. O piso
              de texto (4,5:1) passa no pior caso, que é o nível 4 do escuro.

              A tinta vai por `sx`, e NÃO pela prop `color`: nesta versão do MUI
              (@mui/material 9.3) `color="text.secondary"` no Typography é
              NO-OP — medido no SSR desta base, a classe emitida sai sem
              `color` nenhum, enquanto `sx={{ color: 'text.secondary' }}`
              emite `color:var(--mui-palette-text-secondary)`. Com a prop, o
              rebaixamento não aconteceria e o defeito continuaria na tela
              com o código "certo" no arquivo. */}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {assertion.statement}
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {assertion.question}
          </Typography>
          <Stack spacing={1}>
            {/* ONDA12 (bug 3): a iteração é sobre a ORDEM DE EXIBIÇÃO —
                `original` é o índice no `assertion.options` do JSON e
                `display` a posição na tela. Tudo que significa "qual
                alternativa" (estado visual, submit, chave da React) usa
                `original`; só o número anunciado usa `display`. */}
            {displayOrder.map((original, display) => {
              const option = assertion.options[original];
              // ONDA10 (bug 1): TODA a decisão visual vem da função PURA — o
              // JSX não vê `answerIndex`. Antes de responder, `visual` é o
              // MESMO objeto neutro para as 4 opções: nada distingue a certa.
              const visual = optionVisualState(original, assertion, quiz);
              return (
                <Button
                  /* ONDA11-INTEGRAÇÃO — a chave carrega a IDENTIDADE do quiz,
                     não só o índice. Com `key={i}` o React reaproveita o MESMO
                     nó <button> quando a geração remediadora substitui a
                     respondida: o nó que era a alternativa CERTA da rodada
                     anterior (pintada `contained` + `disabled`, ou seja
                     `action.disabledBackground`) vira a alternativa 3 da rodada
                     nova, e a `transition: background-color` do tema anima A
                     PARTIR daquela tinta. Por 250ms a resposta da rodada
                     anterior fica marcada na certa da rodada nova — o defeito
                     que `optionVisualState` existe para matar, escapando por
                     baixo dela, no DOM. Medido no e2e com `getComputedStyle` +
                     `el.getAnimations()`: só a alternativa certa vinha com
                     `background-color: rgba(0,0,0,0.12)` e uma transição de
                     background ainda RODANDO. Com a identidade na chave o React
                     MONTA nós novos e não há tinta anterior de onde
                     transicionar. */
                  key={`${assertion.id}:${original}`}
                  fullWidth
                  variant={visual.variant}
                  color={visual.color}
                  disabled={visual.disabled}
                  /* O clique submete o índice ORIGINAL: `submitQuizAnswer`, o
                     veredito e a coluna `selectedIndex` do banco continuam
                     significando exatamente o que significavam antes desta
                     onda — a permutação é de TELA, não de dados. */
                  onClick={() => onSelect(original)}
                  aria-label={tI('lesson.quizOptionAria', {
                    n: display + 1,
                    total: optionCount,
                    option,
                  })}
                  startIcon={
                    visual.icon === 'correct' ? (
                      <CheckCircleIcon />
                    ) : visual.icon === 'wrong' ? (
                      <CancelIcon />
                    ) : undefined
                  }
                  sx={{
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    textTransform: 'none',
                    '&&.MuiButton-outlined:not(.Mui-disabled)': {
                      borderWidth: '1.5px',
                      borderColor: pillOutline,
                    },
                  }}
                >
                  {option}
                </Button>
              );
            })}
          </Stack>
          {answered ? (
            /* ONDA16-VEREDITO: o box do veredito (role="status") entra animado
                com spring snappy — é o que o aluno lê durante a janela do
                veredito antes de o overlay minimizar. Com movimento reduzido,
                o box nasce pronto (initial={false}), SEM animação e SEM
                deixar de aparecer. */
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springs.snappy}
              style={{ transformOrigin: 'center top' }}
            >
            <Box
              role="status"
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                color: correct ? 'success.main' : 'error.main',
                mt: 0.5,
              }}
            >
              {correct ? <CheckCircleIcon fontSize="small" sx={{ mt: 0.25 }} /> : <CancelIcon fontSize="small" sx={{ mt: 0.25 }} />}
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {correct ? t('translation:lesson.quizCorrect') : t('translation:lesson.quizWrong')}
                </Typography>
                {!correct && assertion.feedback ? (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {t('translation:lesson.quizFeedback')} {assertion.feedback}
                  </Typography>
                ) : null}
              </Box>
            </Box>
            </motion.div>
          ) : null}
        </Stack>
      </Box>
    </motion.div>
  );
}
