/**
 * src/storybook/foundations/Spacing.stories.tsx — Fundamentos/Espaço.
 *
 * A escala de RAIO do contrato (designTokens.SHAPE) e o que o app usa de
 * ESPAÇO/gap — com réguas visuais derivadas de `theme.spacing()` e exemplos
 * reais colhidos no código.
 *
 * REGISTO DE CONTRATO (ver também a resposta da onda): designTokens.ts NÃO
 * define uma escala de espaçamento nomeada — só `SHAPE` (raios) e as famílias
 * de movimento (`MOTION.spatial`, que é geometria animada, não metro). O que
 * existe de facto é `theme.spacing()` do MUI (base 8px: theme.ts não declara
 * `spacing`, logo herda o default) usado por múltiplos de 0,25 em diante.
 * Em vez de inventar uma escala para o Storybook, esta história DOCUMENTA os
 * degraus que o app realmente usa e cita-os; se o contrato um dia publicar
 * tokens de espaço, esta é a história que os passa a mostrar.
 *
 * DECISÕES:
 *   - As réguas são barras cujo COMPRIMENTO é `theme.spacing(n)` resolvido ao
 *     vivo — o número impresso vem da mesma função que o app chama, não de uma
 *     conta feita aqui.
 *   - Os exemplos de gap citam o ficheiro real onde o valor vive; nenhum
 *     exemplo é hipotético.
 */
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { SHAPE } from '../../lib/designTokens';
import { theme } from '../../theme';
import { DocSection, TokenTable } from './parts';

const meta = {
  title: 'Fundamentos/Espaço',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Degraus de espaçamento usados no app (colhidos por grep em src/**). */
const DEGRAUS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 2.75] as const;

/* ─── Réguas visuais (view pura: só props) ────────────────────────────────── */

/** Uma régua: barra de comprimento `theme.spacing(passo)` + leitura do token. */
function Regua({ passo, uso }: { passo: number; uso: string }): ReactElement {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        <Box
          aria-hidden
          sx={{
            height: (t) => t.spacing(2),
            width: (t) => t.spacing(passo),
            minWidth: 1,
            borderRadius: 1,
            backgroundColor: 'primary.fill',
          }}
        />
        <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
          theme.spacing({passo}) = {theme.spacing(passo)}
        </Typography>
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {uso}
      </Typography>
    </Box>
  );
}

/** Demonstração de um gap entre dois blocos + padding de um botão. */
function GapDemo({
  valor,
  gapOuPadding,
  onde,
  nota,
}: {
  valor: string;
  gapOuPadding: number;
  onde: string;
  nota: string;
}): ReactElement {
  return (
    <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
        {valor} = {theme.spacing(gapOuPadding)}
      </Typography>
      <Box sx={{ display: 'flex', gap: gapOuPadding, alignItems: 'center' }}>
        <Box aria-hidden sx={{ width: (t) => t.spacing(4), height: (t) => t.spacing(4), borderRadius: 1, backgroundColor: 'surface.level3', border: 1, borderColor: 'divider' }} />
        <Box aria-hidden sx={{ width: (t) => t.spacing(4), height: (t) => t.spacing(4), borderRadius: 1, backgroundColor: 'surface.level4', border: 1, borderColor: 'divider' }} />
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        <strong>{onde}</strong> — {nota}
      </Typography>
    </Paper>
  );
}

/* ─── Raios (SHAPE) ───────────────────────────────────────────────────────── */

export const Raios: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Raios do contrato (designTokens.SHAPE)"
        lead="Os raios são os do sistema da Apple: cartão pequeno em 8, superfície de conteúdo em 12 e contêiner grande em 18; a AÇÃO é cápsula (pill). REGRA DE FORMA, fixa para a página inteira: contêiner arredondado, ação em cápsula, campo de formulário no mesmo raio do cartão que o abriga."
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 2 }}>
          {(
            [
              ['SHAPE.sm', SHAPE.sm, 'cartão pequeno / chip'],
              ['SHAPE.md', SHAPE.md, 'superfície de conteúdo, campo de formulário'],
              ['SHAPE.lg', SHAPE.lg, 'contêiner grande (Card, Dialog — SURFACE_RADIUS do tema)'],
              ['SHAPE.base', SHAPE.base, 'theme.shape.borderRadius (raio default do tema)'],
              ['SHAPE.pill', SHAPE.pill, 'cápsula — o botão de ação (MuiButton e variante pop)'],
            ] as const
          ).map(([path, valor, papel]) => (
            <Box key={path} sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
              <Box
                aria-hidden
                sx={{
                  width: (t) => t.spacing(18),
                  height: (t) => t.spacing(12),
                  borderRadius: `${valor}px`,
                  backgroundColor: 'surface.level2',
                  border: 1,
                  borderColor: 'divider',
                }}
              />
              <Typography component="code" variant="caption" sx={{ fontFamily: (t) => t.typography.code.fontFamily }}>
                {path} = {valor}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', maxWidth: (t) => t.spacing(28) }}>
                {papel}
              </Typography>
            </Box>
          ))}
        </Box>
        <TokenTable
          lines={[
            { path: 'theme.shape.borderRadius', value: String(theme.shape.borderRadius), note: 'derivado de SHAPE.base — o raio default que MuiInput/MuiPaper herdam' },
            { path: 'SURFACE_RADIUS (theme.ts, local)', value: String(SHAPE.lg), note: 'raio de Card/Dialog: um degrau acima do campo de formulário, como no sistema da Apple' },
            { path: 'SURFACE_BORDER_WIDTH (theme.ts, local)', value: '1', note: 'aresta, não moldura — borda no divisor decorativo, sem glow' },
          ]}
        />
      </DocSection>
    </Box>
  ),
};

/* ─── Escala de espaço (theme.spacing) ────────────────────────────────────── */

export const Escala: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Escala de espaçamento"
        lead="O contrato NÃO publica tokens de espaço (ver o cabeçalho do ficheiro): o app usa `theme.spacing()`, base 8px (theme.ts não declara `spacing` — herda o default do MUI). Os degraus abaixo são os que o código realmente usa (múltiplos de 0,25); cada régua imprime o valor resolvido pela mesma função que o app chama."
      >
        {DEGRAUS.map((passo) => (
          <Regua
            key={passo}
            passo={passo}
            uso={
              passo <= 0.75
                ? 'ajuste fino dentro de um controlo (ícone+rótulo, linhas compactas)'
                : passo <= 1.5
                  ? 'gap entre pares e fileiras (o degrau mais usado do app)'
                  : 'padding de bloco (botão, painel)'
            }
          />
        ))}
      </DocSection>
    </Box>
  ),
};

/* ─── Gaps usados no app (exemplos reais) ─────────────────────────────────── */

export const GapsNoApp: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Exemplos de gap do app"
        lead="Cada valor tem dono no código — nada aqui é hipotético. Os números em `sx` são MÚLTIPLOS de `theme.spacing` (ex.: `gap: 1` = 8px), a convenção da base."
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: 2 }}>
          <GapDemo
            valor="gap: 0.25 (sx)"
            gapOuPadding={0.25}
            onde="src/components/editor/EditorTabs.tsx"
            nota="ícone + nome da linguagem dentro do separador do editor"
          />
          <GapDemo
            valor="theme.spacing(0.5)"
            gapOuPadding={0.5}
            onde="src/components/course/LessonSidebarHeader.tsx"
            nota="linhas do cabeçalho da barra lateral da aula"
          />
          <GapDemo
            valor="gap: 1 (sx)"
            gapOuPadding={1}
            onde="src/components/editor/FileExplorer.tsx · src/components/chat/ChatBubble.tsx"
            nota="fileiras do explorador de ficheiros e chips de uma bolha do chat"
          />
          <GapDemo
            valor="theme.spacing(1.25)"
            gapOuPadding={1.25}
            onde="src/theme.ts (MuiButton startIcon)"
            nota="ícone NUNCA grudado no rótulo do botão — pedido do dono"
          />
          <GapDemo
            valor="theme.spacing(1.5)"
            gapOuPadding={1.5}
            onde="src/components/shell/SessionFrame.tsx"
            nota="gap do quadro de sessão (rail/dock de chrome, superfície nível 3)"
          />
          <GapDemo
            valor="theme.spacing(2.5) / theme.spacing(1)"
            gapOuPadding={2.5}
            onde="src/theme.ts (variante pop)"
            nota="paddingInline / paddingBlock do botão de ação primária (cápsula)"
          />
        </Box>
      </DocSection>
    </Box>
  ),
};
