/**
 * src/components/shell/SessionFrame.tsx — o QUADRO DE ESTADO DA SESSÃO.
 *
 * ─── DE ONDE VEM O PADRÃO ──────────────────────────────────────────────────
 * Iwata Asks / HOME Menu do 3DS, verbatim: *"in a separate frame from those
 * normal icons, up above, we lined up Notifications, friend list and Game
 * Notes."* O estado transitório e GLOBAL mora num quadro à parte ACIMA do
 * conteúdo, chamável a qualquer momento sem derrubar o trabalho de baixo
 * (docs/ux-redesign.md §1 e §7.2). Aqui isso vira: assunto atual + fase da aula
 * + os controles de tema e idioma, numa faixa fina e quieta.
 *
 * ─── O CABEÇALHO DEIXOU DE SER UMA BARRA DE ACENTO ─────────────────────────
 * Até a onda 1 o header do modo claro era pintado com `primary.main` — o que,
 * com a paleta "Cartucho", virou uma BARRA VERMELHA SATURADA de largura inteira.
 * Isso contraria frontalmente o §1 da spec: *"a base do app fica neutra e
 * sóbria; toda a personalidade vive em acento, estado e movimento"*. Uma
 * superfície de largura inteira em acento é o oposto disso. Agora o cabeçalho é
 * SUPERFÍCIE QUIETA nos DOIS esquemas: nível 3 da rampa tonal (o chrome), o
 * mesmo do rail, e o acento só aparece onde é estado ou ação.
 *
 * ─── POR QUE CONTINUA SENDO `<AppBar>` ─────────────────────────────────────
 * O AppBar renderiza `component="header"`, ou seja `role="banner"` — e 7 specs
 * e2e dependem desse papel para achar o topo do app. Trocar por um `<Box>` não
 * traria nada e quebraria todas elas.
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
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { SHAPE } from '../../lib/designTokens';
import { sessionPhaseLabelKey, useSessionState } from '../../lib/sessionState';
import { effectsTransition } from '../../theme';
import ThemeToggleButton from '../theme/ThemeToggleButton';
import LanguageSwitcher from '../../i18n/LanguageSwitcher';

/**
 * Um campo do quadro: rótulo miúdo em cima, valor embaixo. Quando o valor é o
 * texto de "nada ainda", ele fica em tinta secundária — a diferença é de PESO e
 * de tinta, nunca de acento (fronteira de nível).
 *
 * ─── POR QUE O VALOR NÃO TRUNCA (SC 1.4.12, §4.3 do contrato) ──────────────
 * A versão anterior deste campo usava `noWrap` + `maxWidth: '32ch'`. `noWrap` é
 * literalmente `overflow: hidden` + `text-overflow: ellipsis` +
 * `white-space: nowrap` — a causa nº 1 que a F104 nomeia. E `ch` é a pior
 * unidade possível para a caixa: cresce com o tamanho da fonte, mas NÃO com
 * `letter-spacing` nem com `word-spacing`, exatamente os dois que o usuário
 * força no SC 1.4.12. Sob a injeção de resiliência o texto ficava mais largo e
 * a caixa não — o assunto da aula sumia atrás das reticências.
 *
 * O `title` também saiu junto: ele dava o texto ao leitor de tela e à dica de
 * ferramenta, mas o critério fala do texto VISÍVEL, então não era mitigação de
 * nada. Agora não há o que mitigar.
 *
 * A saída é deixar o texto QUEBRAR: sem caixa em `ch`, sem nowrap, com
 * `overflow-wrap: anywhere` para que nem um identificador longo e sem espaços
 * force o quadro a estourar. O `Toolbar` acima usa `minHeight` (mínimo, não
 * altura fixa), então a faixa cresce em vez de recortar quando o valor vai para
 * a segunda linha.
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
          // ONDA 1 (game-foundations): rótulos do quadro de sessão (HUD) em
          // Press Start 2P — o acento "pixel" RARO do leet-code-rpg. NÃO usar
          // em corpo: a entrelinha alta (1.8 da variante) é o que evita o
          // corte de glifos; não voltar a 1.2 aqui.
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

/** Quadro de estado da sessão — a faixa superior do shell. */
export default function SessionFrame(): ReactElement {
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
      // Superfície QUIETA nos dois esquemas, no NÍVEL 3 da rampa (o chrome —
      // o mesmo nível do rail). `theme.vars.*` é uma referência
      // var(--mui-palette-*) que troca sozinha com a classe .light/.dark do
      // <html> — nunca um ternário sobre o MODO do palette, que sob
      // `cssVariables` resolveria uma única vez e travaria no galho errado.
      //
      // POR QUE A SEGUNDA CAMADA COM `applyStyles('dark')` (medido, não
      // suposto): o PRÓPRIO `MuiAppBar` embute uma regra de esquema escuro para
      // `color="default"` (AppBar.js:145, `theme.applyStyles('dark', {
      // backgroundColor: AppBar.darkBg })`). Sob `colorSchemeSelector: 'class'`
      // isso vira um seletor `.dark &` — especificidade MAIOR que a de uma regra
      // `sx` simples. Com só a camada de vars, o escuro pintava
      // rgb(27,30,38) = nível 1, não o nível 3 pedido. A saída documentada em
      // src/theme.ts é exatamente esta: `theme.applyStyles('dark', {...})` por
      // ÚLTIMO no array, casando a especificidade e ganhando por ordem.
      sx={[
        (theme) => ({
          backgroundColor: theme.vars.palette.surface.level3,
          color: theme.vars.palette.text.primary,
          borderBottom: `1px solid ${theme.vars.palette.divider}`,
          backgroundImage: 'none',
          boxShadow: 'none',
        }),
        (theme) =>
          theme.applyStyles('dark', {
            backgroundColor: theme.vars.palette.surface.level3,
            color: theme.vars.palette.text.primary,
          }),
      ]}
    >
      <Toolbar sx={{ gap: 1.5, minHeight: { xs: 60, sm: 64 } }}>
        {/* O título TAMBÉM perdeu o `noWrap` (ele já era assim antes desta onda,
            e carregava o mesmo defeito do SC 1.4.12: `overflow: hidden` +
            reticências). Aqui ele quebra em vez de sumir — o `Toolbar` cresce
            junto, porque `minHeight` é mínimo, não altura fixa. */}
        <Typography
          variant="h6"
          component="div"
          data-onboarding-target="app-title"
          sx={{ minWidth: 0, fontWeight: 700, whiteSpace: 'normal', overflowWrap: 'anywhere' }}
        >
          {t('translation:app.title')}
        </Typography>

        <Divider orientation="vertical" flexItem sx={{ my: 1.5 }} />

        {/* O quadro dentro do quadro: o "poço" de estado, no nível 4 da rampa.
            `role="status"` + `aria-live="polite"` já montados ANTES de qualquer
            atualização — condição do SC 4.1.3. */}
        <Box
          role="status"
          aria-live="polite"
          aria-label={t('translation:shell.session.aria')}
          data-session-last-activity={session.lastActivityAt ?? ''}
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 2.5,
            flexGrow: 1,
            minWidth: 0,
            paddingInline: theme.spacing(1.5),
            paddingBlock: theme.spacing(0.5),
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
          <SessionField
            label={t('translation:shell.session.phase')}
            value={phaseValue}
            muted={phaseKey === null}
          />
        </Box>

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
      </Toolbar>
    </AppBar>
  );
}
