/**
 * src/components/shell/SessionFrame.tsx — o QUADRO DE ESTADO DA SESSÃO.
 *
 * ─── ONDA-SIDEBAR: DE FAIXA SUPERIOR PARA COLUNA LATERAL ───────────────────
 * O pedido do dono, verbatim: *"quero que ajuste nosso header para ser uma
 * coluna ali lado da aula, que nem o vscode tem a área dos arquivos e a área
 * do código, assim tenho mais espaço vertical e essa área que quero
 * movimentar para aumentar ou diminuir o espaço de texto horizontal será esse
 * sidebar"*. O quadro era uma AppBar horizontal que roubava uma fileira
 * inteira de altura do conteúdo; agora é uma COLUNA à esquerda do `main` —
 * o mesmo arranjo do VSCode (área de arquivos ⟷ área de código). A largura da
 * coluna é controlada pela divisória arrastável (SplitDivider + matemática de
 * splitRatio) e é ela que dá/tira espaço horizontal ao texto da aula; a altura
 * que era do AppBar voltou para o conteúdo.
 *
 * ─── O CONTEÚDO EMPILHOU, NÃO MUDOU ────────────────────────────────────────
 * De cima para baixo: título do app → [slot da view ativa — vazio fora da
 * aula] → poço de estado (assunto, fase) → controles (tema, idioma). Mesmos
 * dados, mesmos alvos de onboarding, mesma hierarquia — só a orientação do
 * arranjo virou coluna.
 *
 * ─── O SLOT DA VIEW ATIVA (onda1-sidebar-slot) ─────────────────────────────
 * Queixa do dono sobre esta coluna, verbatim: *"a informação dele nunca
 * muda"*. O quadro de sessão é GLOBAL — igual em toda aba —, e o objetivo era
 * que a coluna mostrasse o contexto do que está aberto ao lado (o cabeçalho de
 * CADA AULA, que morava dentro do `main`). Por isso, entre o título do app e o
 * poço de estado, a coluna tem um CONTÊINER-SLOT (`SHELL_SIDEBAR_SLOT_ID`) cujo
 * nó DOM sobe para o shell pelo callback ref `slotRef`; a view ativa publica
 * nele via `<ShellSidebarPortal>` (o padrão slot/portal está documentado em
 * ShellSidebarSlot.tsx). Três regras do slot:
 *   · VAZIO NÃO OCUPA ESPAÇO: `'&:empty': { display: 'none' }` tira o slot do
 *     fluxo (e do `gap` da coluna) quando nenhuma view publica — em
 *     Home/Settings/Roadmap/Challenge o sidebar fica IDÊNTICO ao de antes;
 *   · FORA do `role="status"`: o poço é região VIVA (aria-live) — conteúdo da
 *     aula ali dentro seria reanunciado a cada mudança —, e o e2e-spacing
 *     semeia o assunto em `status.querySelectorAll('span')[1]`: um span a
 *     mais dentro do poço desalinharia a semeadura;
 *   · o slot está DENTRO deste `<header>` (o banner): quem publica NUNCA traz
 *     outro `<header>` — fora do `main` ele viraria um SEGUNDO banner.
 *
 * ─── POR QUE CONTINUA SENDO `<AppBar>` ─────────────────────────────────────
 * O AppBar renderiza `component="header"`, ou seja `role="banner"` — e 7 specs
 * e2e dependem desse papel para achar o topo do app (getByRole('banner')). A
 * coluna lateral ASSUME o papel: fora do `main`, o `<header>` continua sendo o
 * banner da página — e o ÚNICO. O cabeçalho da aula não compete: desde a
 * ONDA-AULA-NO-SIDEBAR ele não é mais um `<header>` dentro do main (o
 * CollapsibleLessonHeader foi aposentado) e sim o `<section aria-labelledby>`
 * do LessonSidebarHeader, que a LessonView publica no slot DESTA coluna — um
 * `<header>` ali, fora do main, viraria um SEGUNDO banner (ver "O SLOT DA VIEW
 * ATIVA", acima). Trocar o AppBar por `<Box>` não traria nada e quebraria
 * todas elas.
 *
 * ─── DE ONDE VEM O PADRÃO (inalterado) ─────────────────────────────────────
 * Iwata Asks / HOME Menu do 3DS, verbatim: *"in a separate frame from those
 * normal icons, up above, we lined up Notifications, friend list and Game
 * Notes."* O estado transitório e GLOBAL mora num quadro à parte, chamável a
 * qualquer momento sem derrubar o trabalho ao lado (docs/ux-redesign.md §1 e
 * §7.2). Aqui o quadro virou coluna — o §7.2 do VSCode UX Guidelines inclusive
 * manda para o dock lateral o que é suporte contínuo ao trabalho.
 *
 * ─── FRONTEIRA DE NÍVEL (regra 3b de designTokens.ts) ──────────────────────
 * Níveis 3 e 4 são chrome, e ali o texto é TINTA (`text.primary` /
 * `text.secondary`); acento só como preenchimento, ícone ou borda. Por isso o
 * "poço" de estado usa o nível 4 com rótulo secundário e valor primário — sem
 * uma única cor de acento como texto.
 *
 * ─── A11Y (spec §8.1) ──────────────────────────────────────────────────────
 * O quadro é um `role="status"` que já está no DOM ANTES de qualquer
 * atualização — é a condição literal do SC 4.1.3 para que a mudança de fase seja
 * anunciada *"without receiving focus"*. Ele nunca move foco.
 */
import type { ReactElement, ReactNode } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { SHAPE } from '../../lib/designTokens';
import { sessionPhaseLabelKey, useSessionState } from '../../lib/sessionState';
import { SHELL_SIDEBAR_PANE_ID, SPLIT_MOTION } from '../../lib/splitRatio';
import { effectsTransition } from '../../theme';
import ThemeToggleButton from '../theme/ThemeToggleButton';
import { SHELL_SIDEBAR_SLOT_ID } from './ShellSidebarSlot';
import LanguageSwitcher from '../../i18n/LanguageSwitcher';

/**
 * Um campo do quadro: rótulo miúdo em cima, valor embaixo. Quando o valor é o
 * texto de "nada ainda", ele fica em tinta secundária — a diferença é de PESO e
 * de tinta, nunca de acento (fronteira de nível).
 *
 * ─── POR QUE O VALOR NÃO TRUNCA (SC 1.4.12, §4.3 do contrato) ──────────────
 * A versão horizontal deste campo usou `noWrap` + `maxWidth: '32ch'` e voltou
 * atrás: `noWrap` é literalmente `overflow: hidden` + `text-overflow: ellipsis`
 * + `white-space: nowrap` — a causa nº 1 que a F104 nomeia. E `ch` cresce com o
 * tamanho da fonte mas NÃO com `letter-spacing` nem `word-spacing`, exatamente
 * os dois que o usuário força no SC 1.4.12. Sob a injeção de resiliência o
 * texto ficava mais largo e a caixa não.
 *
 * A saída é deixar o texto QUEBRAR: sem caixa em `ch`, sem nowrap, com
 * `overflow-wrap: anywhere` para que nem um identificador longo e sem espaços
 * force a coluna a estourar. Na coluna vertical isso ficou MAIS natural: a
 * barra tem largura controlada pelo usuário (divisória), e o campo cresce em
 * altura em vez de recortar — é o mesmo comportamento da versão horizontal,
 * agora girado 90°.
 */
function SessionField({
  label,
  value,
  muted,
}: {
  label: string;
  value: ReactNode;
  muted: boolean;
}): ReactElement {
  return (
    <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Typography
        variant="pixel"
        component="span"
        sx={(theme) => ({
          color: theme.vars.palette.text.secondary,
          // Rótulos do quadro de sessão (HUD). ONDA 11: a variante `pixel`
          // ficou com o NOME LEGADO — a fonte de pixel (Press Start 2P) saiu do
          // projeto junto com o resto do retrô ("a fonte nao quero retro"), e
          // hoje ela é o DISPLAY em 700/13px com entrelinha 1,5. O papel não
          // mudou: etiqueta de HUD, nunca corpo nem título (13px fica abaixo
          // dos 14 de `caption`, então ela não compete com a hierarquia).
          // Renomear a variante para `label` custaria tocar este arquivo, o
          // CodeBlock e os TypographyVariants/variantMapping do tema.
          letterSpacing: '0.08em',
          // O rótulo segue a mesma regra do valor: quebra, nunca recorta.
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
        })}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        component="span"
        sx={(theme) => ({
          // Sem `maxWidth` em `ch` e sem `noWrap`: o valor quebra de linha e o
          // quadro cresce. Ver o cabeçalho deste componente (SC 1.4.12 / F104).
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          fontWeight: muted ? 400 : 600,
          color: muted ? theme.vars.palette.text.secondary : theme.vars.palette.text.primary,
          // Cor é EFEITO: criticamente amortecida, nunca ultrapassa. Aplicar
          // easing spatial aqui é o bug que faz o rótulo cintilar (spec §5).
          transition: effectsTransition(theme, ['color'], 'normal'),
        })}
      >
        {value}
      </Typography>
    </Box>
  );
}

export interface SessionFrameProps {
  /**
   * Largura da coluna (flex-basis) em px, JÁ clampada pela matemática de
   * splitRatio (`ratioToPx` com SHELL_SPLIT_CONSTRAINTS). Antes de o contêiner
   * ser medido, o shell manda o px de desejo inicial.
   */
  readonly basisPx: number;
  /**
   * Anima o flex-basis (passo de TECLADO da divisória). Durante o ARRASTE o
   * shell manda `false` — a largura segue o ponteiro sem transição, senão a
   * divisória "nada" atrás do mouse (mesma regra do SPLIT_MOTION).
   */
  readonly animateBasis: boolean;
  /**
   * Callback ref do CONTÊINER-SLOT da view ativa (onda1-sidebar-slot). O shell
   * passa o setter do próprio estado (`setSidebarSlotEl`): o nó sobe no commit,
   * vira o valor do `ShellSidebarSlotContext` e a view ativa publica nele via
   * `<ShellSidebarPortal>`. Ao desmontar a coluna o React chama com `null`.
   */
  readonly slotRef: (el: HTMLElement | null) => void;
}

/**
 * Quadro de estado da sessão — a COLUNA lateral do shell (era a faixa superior).
 * A largura é ditada pela divisória arrastável; a geometria (piso/teto, teclado,
 * persistência) vive em App.tsx + splitRatio.ts.
 */
export default function SessionFrame({
  basisPx,
  animateBasis,
  slotRef,
}: SessionFrameProps): ReactElement {
  const { t } = useTranslation();
  const session = useSessionState();
  const phaseKey = sessionPhaseLabelKey(session);

  const subjectValue = session.subject ?? t('translation:shell.session.noSubject');
  const phaseValue = phaseKey
    ? t(`translation:${phaseKey}`)
    : t('translation:shell.session.idle');

  return (
    <AppBar
      position="static"
      color="default"
      elevation={0}
      // ONDA-SIDEBAR: id estável do painel líder da divisória do shell (a
      // MESMA constante que a SplitDivider usa no `aria-controls` — padrão APG
      // Window Splitter: a divisória controla sidebar e main).
      id={SHELL_SIDEBAR_PANE_ID}
      // ONDA-SIDEBAR: de faixa horizontal para COLUNA. A largura vem da
      // divisória (flex-basis em px); a animação do flex-basis é do nível
      // spatial (flex-basis está em SPATIAL_ALLOWED_PROPERTIES — ver
      // SPLIT_MOTION em splitRatio.ts) e HONRA prefers-reduced-motion.
      sx={[
        (theme) => ({
          flex: `0 0 ${basisPx}px`,
          width: basisPx,
          minWidth: 0,
          // A coluna é rolável no eixo de bloco: em janela baixa, o conteúdo
          // empilhado (título + poço + controles) pode passar da altura — e o
          // rolar é como a coluna cresce em vez de recortar (SC 1.4.12).
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing(1.5),
          paddingInline: theme.spacing(1.5),
          paddingBlock: theme.spacing(1.5),
          // Superfície QUIETA nos dois esquemas, no NÍVEL 3 da rampa (o chrome —
          // o mesmo nível do rail). `theme.vars.*` é uma referência
          // var(--mui-palette-*) que troca sozinha com a classe .light/.dark do
          // <html> — nunca um ternário sobre o MODO do palette, que sob
          // `cssVariables` resolveria uma única vez e travaria no galho errado.
          backgroundColor: theme.vars.palette.surface.level3,
          color: theme.vars.palette.text.primary,
          // A fronteira foi para o lado que agora é de verdade: a divisória.
          borderRight: `1px solid ${theme.vars.palette.divider}`,
          backgroundImage: 'none',
          boxShadow: 'none',
          transition: animateBasis
            ? `${SPLIT_MOTION.durationMs}ms ${SPLIT_MOTION.easing}`
            : 'none',
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
          },
        }),
        (theme) =>
          theme.applyStyles('dark', {
            backgroundColor: theme.vars.palette.surface.level3,
            color: theme.vars.palette.text.primary,
          }),
      ]}
    >
      {/* O título TAMBÉM perdeu o `noWrap` (versão horizontal já carregava o
          mesmo defeito do SC 1.4.12: `overflow: hidden` + reticências). Aqui
          ele quebra em vez de sumir — e na coluna estreita isso é o normal,
          não o plano B. PRESERVADO: alvo do tutorial do onboarding. */}
      <Typography
        variant="h6"
        component="div"
        data-onboarding-target="app-title"
        sx={{ minWidth: 0, fontWeight: 700, whiteSpace: 'normal', overflowWrap: 'anywhere' }}
      >
        {t('translation:app.title')}
      </Typography>

      <Divider />

      {/* ONDA1-SIDEBAR-SLOT: o CONTÊINER-SLOT da view ativa (ver o cabeçalho
          deste arquivo e ShellSidebarSlot.tsx). Nasce VAZIO; a view ativa
          publica nele por portal e, ao desmontar (troca de aba), o conteúdo
          some sozinho. `:empty` → `display: none`: vazio, ele sai do fluxo e
          do `gap` da coluna — o sidebar das outras abas fica idêntico. FORA
          do poço `role="status"` logo abaixo, de propósito (região viva e
          semeadura do e2e-spacing). Coluna flex como o resto do quadro, com
          `minWidth: 0` para o conteúdo publicado quebrar em vez de estourar. */}
      <Box
        id={SHELL_SIDEBAR_SLOT_ID}
        ref={slotRef}
        sx={(theme) => ({
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing(1.5),
          minWidth: 0,
          '&:empty': { display: 'none' },
        })}
      />

      {/* O quadro dentro do quadro: o "poço" de estado, no nível 4 da rampa.
          `role="status"` + `aria-live="polite"` já montados ANTES de qualquer
          atualização — condição do SC 4.1.3. PRESERVADO: `role="status"`,
          `data-session-last-activity` e a ordem assunto→fase (o e2e-spacing
          semeia o assunto no spans[1] do primeiro campo). */}
      <Box
        role="status"
        aria-live="polite"
        aria-label={t('translation:shell.session.aria')}
        data-session-last-activity={session.lastActivityAt ?? ''}
        sx={(theme) => ({
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: theme.spacing(1.5),
          minWidth: 0,
          paddingInline: theme.spacing(1.5),
          paddingBlock: theme.spacing(1),
          borderRadius: `${SHAPE.md}px`,
          backgroundColor: theme.vars.palette.surface.level4,
          transition: effectsTransition(theme, ['background-color'], 'normal'),
        })}
      >
        <SessionField
          label={t('translation:shell.session.subject')}
          value={subjectValue}
          muted={session.subject === null}
        />
        <Divider />
        <SessionField
          label={t('translation:shell.session.phase')}
          value={phaseValue}
          muted={phaseKey === null}
        />
      </Box>

      {/* Os controles descem para o pé da coluna (VSCode: ações de view no
          fundo da sidebar). PRESERVADOS: os dois alvos de onboarding. */}
      <Box
        sx={(theme) => ({
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: theme.spacing(0.5),
        })}
      >
        <Box data-onboarding-target="theme-toggle" component="span" sx={{ display: 'contents' }}>
          <ThemeToggleButton />
        </Box>
        <Box
          data-onboarding-target="language-switcher"
          component="span"
          sx={{ display: 'contents' }}
        >
          <LanguageSwitcher variant="menu" />
        </Box>
      </Box>
    </AppBar>
  );
}
