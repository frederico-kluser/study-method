/**
 * src/storybook/foundations/FocusAndContrast.stories.tsx —
 * Fundamentos/Foco e Contraste.
 *
 * Duas promessas do design system, lado a lado:
 *   1. O ANEL DE FOCO de duas cores (`FOCUS_RING` + `focusRingStyles` de
 *      src/theme.ts) — anatomia e os estados foco/não-foco num botão, numa
 *      checkbox e num link.
 *   2. Os PISOS DE CONTRASTE verificados, citados dos comentários `[medido]`
 *      de src/lib/designTokens.ts (regra 5 do contrato: toda razão escrita lá
 *      é re-calculada por tests/theme.test.ts; números fora da forma `[medido]`
 *      reprovam o teste). ESTA HISTÓRIA CITA-OS, não os recalcula nem inventa.
 *
 * DECISÕES:
 *   - Na história `AnelDeFoco` o anel da coluna «focado» é FORÇADO com o
 *     próprio `focusRingStyles(theme)` para os dois estados lerem lado a lado
 *     sem interação; no app o mesmo estilo entra por `*:focus-visible`
 *     (MuiCssBaseline) e `&:focus-visible` (MuiButtonBase). A história
 *     `FocoComTeclado` mostra o caminho REAL, com Tab.
 *   - Campos de texto e seleção NÃO recebem o anel (decisão da ONDA 1 em
 *     MuiCssBaseline): o outline+halo ficavam por cima do campo. A indicação de
 *     foco deles é a borda `nonText.neutral` → acento + halo, em
 *     MuiOutlinedInput. Por isso esta história usa botão/checkbox/link.
 */
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { expect, userEvent, within } from 'storybook/test';
import { CONTRAST_FLOOR } from '../../lib/designTokens';
import { FOCUS_RING, focusRingStyles, theme } from '../../theme';
import { DocSection, TokenTable } from './parts';

const meta = {
  title: 'Fundamentos/Foco e Contraste',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ─── Par foco/não-foco (view pura: só props) ─────────────────────────────── */

function ParFoco({
  rotulo,
  repouso,
  focado,
  nota,
}: {
  rotulo: string;
  repouso: ReactElement;
  focado: ReactElement;
  nota: string;
}): ReactElement {
  return (
    <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle2">{rotulo}</Typography>
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-start' }}>
          <Typography variant="overline">Em repouso</Typography>
          {repouso}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-start' }}>
          <Typography variant="overline">Focado (estilo do anel)</Typography>
          {focado}
        </Box>
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {nota}
      </Typography>
    </Paper>
  );
}

/* ─── Tabela de pisos [medido] (view pura: só props) ──────────────────────── */

interface LinhaContraste {
  /** Os dois caminhos de token, exatamente como na afirmação [medido]. */
  par: string;
  /** A razão com 2 casas, tal como escrita em designTokens.ts. */
  medido: string;
  /** Piso normativo aplicável (label derivada de CONTRAST_FLOOR). */
  piso: string;
}

function TabelaContraste({ linhas }: { linhas: readonly LinhaContraste[] }): ReactElement {
  return (
    <Box
      component="table"
      sx={{
        borderCollapse: 'collapse',
        width: '100%',
        '& th, & td': {
          textAlign: 'left',
          verticalAlign: 'top',
          py: 0.75,
          pr: 2,
          borderBottom: 1,
          borderColor: 'divider',
        },
      }}
    >
      <Box component="thead">
        <Box component="tr">
          <Box component="th">
            <Typography variant="overline">Par (caminhos de token)</Typography>
          </Box>
          <Box component="th">
            <Typography variant="overline">[medido]</Typography>
          </Box>
          <Box component="th">
            <Typography variant="overline">Piso</Typography>
          </Box>
        </Box>
      </Box>
      <Box component="tbody">
        {linhas.map((linha) => (
          <Box component="tr" key={linha.par}>
            <Box component="td">
              <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
                {linha.par}
              </Typography>
            </Box>
            <Box component="td">
              <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
                {linha.medido}
              </Typography>
            </Box>
            <Box component="td">
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {linha.piso}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const PISO_AAA = `AAA (${CONTRAST_FLOOR.bodyAAA}:1)`;
const PISO_AA = `AA (${CONTRAST_FLOOR.bodyAA}:1)`;
const PISO_NONTEXT = `não-texto (${CONTRAST_FLOOR.nonText}:1)`;
const PISO_ISENTO = 'isento (divisor decorativo, «Incidental»)';

/* ─── 1. Anel de foco ─────────────────────────────────────────────────────── */

export const AnelDeFoco: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Anel de foco de DUAS cores (FOCUS_RING + focusRingStyles)"
        lead="3px de traço em nonText.focus + 2px de folga preenchida por um halo de text.primary (box-shadow com spread = o offset). Técnica do Understanding do SC 1.4.11: o traço sozinho cai abaixo de 3:1 nos níveis 3–4 (chrome), e o halo é a tinta que carrega o piso em qualquer superfície."
      >
        <TokenTable
          lines={[
            { path: 'FOCUS_RING.width', value: `${FOCUS_RING.width}`, note: 'espessura do outline, em px' },
            { path: 'FOCUS_RING.offset', value: `${FOCUS_RING.offset}`, note: 'folga entre o componente e o anel, em px' },
            { path: 'FOCUS_RING.haloWidth', value: `${FOCUS_RING.haloWidth}`, note: 'espessura do halo de tinta que preenche a folga (= offset)' },
            {
              path: '[medido] NONTEXT_LIGHT.focus',
              value: '4,70:1 (level0) · 5,12:1 (level1)',
              note: 'o traço alcança 3:1 nas superfícies de leitura do claro (designTokens.ts)',
            },
            {
              path: '[medido] NONTEXT_DARK.focus',
              value: '5,42:1 (level0) · 4,66:1 (level1)',
              note: 'idem no escuro',
            },
            {
              path: '[medido] NONTEXT_*.focus x nível 4',
              value: '3,65:1 (claro) · 2,84:1 (escuro)',
              note: 'CAI abaixo de 3:1 no chrome (theme.ts) — é por isso que o halo de text.primary existe',
            },
            {
              path: '[medido] INK_DARK.primary x SURFACE_DARK.level4',
              value: '9,50:1',
              note: 'pior caso do halo — a tinta primária alcança o piso não-texto nos cinco níveis',
            },
          ]}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          <ParFoco
            rotulo="Botão (MuiButton)"
            repouso={<Button variant="contained">Testar resposta</Button>}
            focado={
              <Button variant="contained" sx={{ ...focusRingStyles(theme) }}>
                Testar resposta
              </Button>
            }
            nota="No app: `*:focus-visible` do MuiCssBaseline + `&:focus-visible` do MuiButtonBase. O ripple de foco está desligado (disableFocusRipple): o indicador É o anel."
          />
          <ParFoco
            rotulo="Checkbox"
            repouso={<FormControlLabel control={<Checkbox />} label="Rever este tópico amanhã" />}
            focado={
              <FormControlLabel
                control={<Checkbox sx={{ ...focusRingStyles(theme) }} />}
                label="Rever este tópico amanhã"
              />
            }
            nota="Todo alvo clicável usa o MESMO anel (rail, dock e paleta de comandos incluídos) — exportado de propósito para ninguém reinventar o seu."
          />
          <ParFoco
            rotulo="Link (MuiLink)"
            repouso={<Link href="#">material de apoio da aula</Link>}
            focado={
              <Link href="#" sx={{ ...focusRingStyles(theme) }}>
                material de apoio da aula
              </Link>
            }
            nota="O link é `info.accentText` (o MuiLink foi reapontado para o acento COMO TEXTO — tema, DECISÃO 1); o anel é o mesmo."
          />
        </Box>
      </DocSection>
    </Box>
  ),
};

/* ─── 2. Foco real com teclado (play) ─────────────────────────────────────── */

export const FocoComTeclado: Story = {
  render: () => (
    <Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: '80ch' }}>
        O caminho REAL: `Tab` move o foco e o navegador decide mostrar
        `:focus-visible` — é aí que o CssBaseline pinta o anel
        (`focusRingStyles`). A story carrega com Tab percorrido por
        `@storybook/test` para o anel aparecer no alvo atual.
      </Typography>
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="contained">Testar resposta</Button>
        <FormControlLabel control={<Checkbox />} label="Rever este tópico amanhã" />
        <Link href="#">material de apoio da aula</Link>
      </Box>
    </Box>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    await expect(canvas.getByRole('button', { name: 'Testar resposta' })).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole('checkbox')).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole('link', { name: 'material de apoio da aula' })).toHaveFocus();
  },
};

/* ─── 3. Pisos de contraste verificados ───────────────────────────────────── */

/**
 * As afirmações `[medido]` dos comentários de designTokens.ts, TRANSCRITAS.
 * A forma fixa (regra 5 do contrato) é `A x B = R,R:1`; tests/theme.test.ts
 * recalcula cada uma e reprova qualquer razão escrita fora dessa forma. Por
 * isso esta tabela copia os valores em vez de os calcular de novo: o número
 * documentado é o contrato, e o teste é quem o vigia.
 */
const TINTA_X_SUPERFICIES: readonly LinhaContraste[] = [
  { par: 'INK_LIGHT.primary x SURFACE_LIGHT.level0', medido: '15,46:1', piso: PISO_AAA },
  { par: 'INK_LIGHT.primary x SURFACE_LIGHT.level1', medido: '16,83:1', piso: PISO_AAA },
  { par: 'INK_LIGHT.primary x SURFACE_LIGHT.level2', medido: '14,30:1', piso: PISO_AA },
  { par: 'INK_LIGHT.primary x SURFACE_LIGHT.level3', medido: '12,82:1', piso: PISO_AA },
  { par: 'INK_LIGHT.primary x SURFACE_LIGHT.level4', medido: '12,01:1', piso: PISO_AA },
  { par: 'INK_LIGHT.secondary x SURFACE_LIGHT.level0', medido: '7,15:1', piso: PISO_AAA },
  { par: 'INK_LIGHT.secondary x SURFACE_LIGHT.level1', medido: '7,79:1', piso: PISO_AAA },
  { par: 'INK_LIGHT.secondary x SURFACE_LIGHT.level2', medido: '6,62:1', piso: PISO_AA },
  { par: 'INK_LIGHT.secondary x SURFACE_LIGHT.level3', medido: '5,93:1', piso: PISO_AA },
  { par: 'INK_LIGHT.secondary x SURFACE_LIGHT.level4', medido: '5,56:1', piso: PISO_AA },
  { par: 'INK_DARK.primary x SURFACE_DARK.level0', medido: '18,17:1', piso: PISO_AAA },
  { par: 'INK_DARK.primary x SURFACE_DARK.level1', medido: '15,63:1', piso: PISO_AAA },
  { par: 'INK_DARK.primary x SURFACE_DARK.level2', medido: '12,80:1', piso: PISO_AA },
  { par: 'INK_DARK.primary x SURFACE_DARK.level3', medido: '11,07:1', piso: PISO_AA },
  { par: 'INK_DARK.primary x SURFACE_DARK.level4', medido: '9,50:1', piso: PISO_AA },
  { par: 'INK_DARK.secondary x SURFACE_DARK.level0', medido: '10,01:1', piso: PISO_AAA },
  { par: 'INK_DARK.secondary x SURFACE_DARK.level1', medido: '8,61:1', piso: PISO_AAA },
  { par: 'INK_DARK.secondary x SURFACE_DARK.level2', medido: '7,05:1', piso: PISO_AA },
  { par: 'INK_DARK.secondary x SURFACE_DARK.level3', medido: '6,10:1', piso: PISO_AA },
  { par: 'INK_DARK.secondary x SURFACE_DARK.level4', medido: '5,24:1', piso: PISO_AA },
];

const NONTEXT_X_SUPERFICIES: readonly LinhaContraste[] = [
  { par: 'NONTEXT_LIGHT.neutral x SURFACE_LIGHT.level0', medido: '3,20:1', piso: PISO_NONTEXT },
  { par: 'NONTEXT_LIGHT.neutral x SURFACE_LIGHT.level1', medido: '3,48:1', piso: PISO_NONTEXT },
  { par: 'NONTEXT_LIGHT.action x SURFACE_LIGHT.level0', medido: '4,31:1', piso: PISO_NONTEXT },
  { par: 'NONTEXT_LIGHT.action x SURFACE_LIGHT.level1', medido: '4,70:1', piso: PISO_NONTEXT },
  { par: 'NONTEXT_LIGHT.focus x SURFACE_LIGHT.level0', medido: '4,70:1', piso: PISO_NONTEXT },
  { par: 'NONTEXT_LIGHT.focus x SURFACE_LIGHT.level1', medido: '5,12:1', piso: PISO_NONTEXT },
  { par: 'NONTEXT_DARK.neutral x SURFACE_DARK.level0', medido: '6,07:1', piso: PISO_NONTEXT },
  { par: 'NONTEXT_DARK.neutral x SURFACE_DARK.level1', medido: '5,22:1', piso: PISO_NONTEXT },
  { par: 'NONTEXT_DARK.action x SURFACE_DARK.level0', medido: '7,18:1', piso: PISO_NONTEXT },
  { par: 'NONTEXT_DARK.action x SURFACE_DARK.level1', medido: '6,18:1', piso: PISO_NONTEXT },
  { par: 'NONTEXT_DARK.focus x SURFACE_DARK.level0', medido: '5,42:1', piso: PISO_NONTEXT },
  { par: 'NONTEXT_DARK.focus x SURFACE_DARK.level1', medido: '4,66:1', piso: PISO_NONTEXT },
];

const ROTULO_DE_BOTAO: readonly LinhaContraste[] = [
  { par: 'ACCENT_LIGHT.action.onFill x ACCENT_LIGHT.action.fill', medido: '4,70:1', piso: PISO_AA },
  { par: 'ACCENT_LIGHT.success.onFill x ACCENT_LIGHT.success.fill', medido: '5,03:1', piso: PISO_AA },
  { par: 'ACCENT_LIGHT.info.onFill x ACCENT_LIGHT.info.fill', medido: '5,30:1', piso: PISO_AA },
  { par: 'ACCENT_LIGHT.warn.onFill x ACCENT_LIGHT.warn.fill', medido: '4,86:1', piso: PISO_AA },
  { par: 'ACCENT_LIGHT.study.onFill x ACCENT_LIGHT.study.fill', medido: '6,36:1', piso: PISO_AA },
  { par: 'ACCENT_LIGHT.error.onFill x ACCENT_LIGHT.error.fill', medido: '5,81:1', piso: PISO_AA },
  { par: 'ACCENT_DARK.action.onFill x ACCENT_DARK.action.fill', medido: '5,42:1', piso: PISO_AA },
  { par: 'ACCENT_DARK.success.onFill x ACCENT_DARK.success.fill', medido: '9,78:1', piso: PISO_AA },
  { par: 'ACCENT_DARK.info.onFill x ACCENT_DARK.info.fill', medido: '11,50:1', piso: PISO_AA },
  { par: 'ACCENT_DARK.warn.onFill x ACCENT_DARK.warn.fill', medido: '9,62:1', piso: PISO_AA },
  { par: 'ACCENT_DARK.study.onFill x ACCENT_DARK.study.fill', medido: '5,61:1', piso: PISO_AA },
  { par: 'ACCENT_DARK.error.onFill x ACCENT_DARK.error.fill', medido: '5,81:1', piso: PISO_AA },
];

const DIVISORES: readonly LinhaContraste[] = [
  { par: 'DIVIDER_LIGHT x SURFACE_LIGHT.level0', medido: '1,57:1', piso: PISO_ISENTO },
  { par: 'DIVIDER_LIGHT x SURFACE_LIGHT.level1', medido: '1,71:1', piso: PISO_ISENTO },
  { par: 'DIVIDER_DARK x SURFACE_DARK.level0', medido: '2,70:1', piso: PISO_ISENTO },
  { par: 'DIVIDER_DARK x SURFACE_DARK.level1', medido: '2,33:1', piso: PISO_ISENTO },
];

export const PisosDeContraste: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Pisos verificados (afirmações [medido] de designTokens.ts)"
        lead="Toda razão abaixo está escrita nos comentários do contrato na forma fixa `[medido] A x B = R,R:1` e é RECALCULADA por tests/theme.test.ts (regra 5). Os valores são citados, não inventados nem refeitos. Onde o par cai abaixo do piso de leitura há sempre uma decisão escrita: o divisor é decorativo por definição, e o botão desabilitado carrega a tinta secundária justamente porque ela ainda passa AA nos cinco níveis."
      >
        <Typography variant="subtitle2" sx={{ mt: 1 }}>
          Tinta × superfícies (níveis 0–1 piso AAA; níveis 2–4, chrome, piso AA)
        </Typography>
        <TabelaContraste linhas={TINTA_X_SUPERFICIES} />
        <Typography variant="subtitle2" sx={{ mt: 3 }}>
          Camada não-texto (borda de campo, ícone, traço de foco) — só alcança 3:1 nos níveis 0 e 1
        </Typography>
        <TabelaContraste linhas={NONTEXT_X_SUPERFICIES} />
        <Typography variant="subtitle2" sx={{ mt: 3 }}>
          Rótulo de botão preenchido (onFill × fill, as doze famílias)
        </Typography>
        <TabelaContraste linhas={ROTULO_DE_BOTAO} />
        <Typography variant="subtitle2" sx={{ mt: 3 }}>
          Divisores decorativos
        </Typography>
        <TabelaContraste linhas={DIVISORES} />
        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 2, display: 'block', maxWidth: '80ch' }}>
          O contrato documenta ainda as razões `red-flash(...)` (SC 2.3.1) das
          vinte e quatro cores animáveis — pisos de MOVIMENTO, não de contraste:
          ver a história Fundamentos/Movimento e o comentário de
          designTokens.ts (regra 4).
        </Typography>
      </DocSection>
    </Box>
  ),
};
