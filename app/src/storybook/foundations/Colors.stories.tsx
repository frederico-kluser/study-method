/**
 * src/storybook/foundations/Colors.stories.tsx — Fundamentos/Cores.
 *
 * A RAMPA COMPLETA de cor do design system, para um futuro redesign ler o
 * vocabulário inteiro num sítio só. Tudo aqui é DERIVADO de
 * `src/lib/designTokens.ts`: nenhum hex é escrito à mão nesta história (regra 1
 * do contrato — um hex numa story é um hex que o redesign copia sem saber a
 * decisão por trás dele).
 *
 * DECISÕES:
 *   - O modo claro/escuro NÃO é forçado nestas histórias: o toolbar global
 *     "Tema" (preview.tsx) continua a mandar, tal como em qualquer outra story.
 *     O que as histórias `Claro`/`Escuro` documentam é a RAMPA de cada esquema
 *     (o valor dos tokens), que é o mesmo em qualquer modo do preview. A
 *     comparação lado-a-lado existe justamente para ver os dois esquemas sem
 *     depender do toolbar.
 *   - O hex mostrado por baixo de cada swatch é o VALOR do token, lido do
 *     import — existe por extensão documental (é o que um redesign vai
 *     comparar com o picker da Apple), mas nunca é digitado aqui.
 *   - Os caminhos são os do ficheiro de tokens (`SURFACE_DARK.level3`,
 *     `ACCENT_LIGHT.action.text`, …) porque são o nome estável do contrato;
 *     `theme.vars.palette.*` é a cara MUI dos mesmos valores (theme.ts) e
 *     aparece entre parênteses no papel de cada grupo.
 *   - `SCRIM` não é um par cor/fundo (é cor + opacidade, publicado como
 *     `palette.scrim` já em `color-mix`), por isso entra como linha de token e
 *     não como swatch chapado: um swatch mentiria sobre a opacidade.
 */
import type { Meta, StoryObj } from '@storybook/react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  ACCENT_DARK,
  ACCENT_LIGHT,
  DIVIDER_DARK,
  DIVIDER_LIGHT,
  INK_DARK,
  INK_LIGHT,
  NONTEXT_DARK,
  NONTEXT_LIGHT,
  SCRIM,
  SURFACE_DARK,
  SURFACE_LIGHT,
  type AccentFamily,
  type AccentPair,
} from '../../lib/designTokens';
import type { SurfaceRamp } from '../../theme';
import { DocSection, Swatch, SwatchGrid, TokenTable, type SwatchItem } from './parts';

const meta = {
  title: 'Fundamentos/Cores',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ─── Construtores puros de swatches (derivam caminho+valor dos tokens) ───── */

/** Papel de cada nível da rampa — texto do contrato em designTokens.ts. */
const PAPEIS_NIVEL: Readonly<Record<string, string>> = {
  level0: 'fundo do app',
  level1: 'cartão / superfície de leitura',
  level2: 'painel afundado / well de código',
  level3: 'chrome elevado (rail, dock, linha atual)',
  level4: 'estado selecionado / hover forte',
};

/** As famílias de acento e a cor de sistema da Apple que cada uma herda. */
const FAMILIAS: ReadonlyArray<{ familia: AccentFamily; origem: string }> = [
  { familia: 'action', origem: 'systemBlue — a cor de marca do apple.com' },
  { familia: 'success', origem: 'systemGreen' },
  { familia: 'info', origem: 'systemTeal' },
  { familia: 'warn', origem: 'systemOrange' },
  { familia: 'study', origem: 'systemPurple — segundo acento de fato do app' },
  { familia: 'error', origem: 'systemRed — família PRÓPRIA, não é o acento da ação' },
];

const PAPEIS_ACENTO: Readonly<Record<keyof AccentPair, string>> = {
  text: 'acento como TEXTO/LINK nos níveis 0, 1 e 2 (>= 4,5:1)',
  fill: 'preenchimento chapado de botão/chip',
  onFill: 'tinta que vai EM CIMA do fill',
};

interface EsquemaTokens {
  prefixo: string;
  superficies: SurfaceRamp;
  tinta: { primary: string; secondary: string };
  acentos: Readonly<Record<AccentFamily, AccentPair>>;
  nonText: { neutral: string; action: string; focus: string };
  divisor: string;
}

const ESQUEMA_CLARO: EsquemaTokens = {
  prefixo: 'SURFACE_LIGHT / INK_LIGHT / ACCENT_LIGHT / NONTEXT_LIGHT',
  superficies: SURFACE_LIGHT,
  tinta: INK_LIGHT,
  acentos: ACCENT_LIGHT,
  nonText: NONTEXT_LIGHT,
  divisor: DIVIDER_LIGHT,
};

const ESQUEMA_ESCURO: EsquemaTokens = {
  prefixo: 'SURFACE_DARK / INK_DARK / ACCENT_DARK / NONTEXT_DARK',
  superficies: SURFACE_DARK,
  tinta: INK_DARK,
  acentos: ACCENT_DARK,
  nonText: NONTEXT_DARK,
  divisor: DIVIDER_DARK,
};

/** Swatches da rampa de superfície (`palette.surface` no tema). */
function itemsSuperficies(
  nome: 'SURFACE_LIGHT' | 'SURFACE_DARK',
  rampa: SurfaceRamp,
): SwatchItem[] {
  return (['level0', 'level1', 'level2', 'level3', 'level4'] as const).map((level) => ({
    path: `${nome}.${level}`,
    value: rampa[level],
    note: PAPEIS_NIVEL[level],
  }));
}

/** Swatches da tinta (`palette.text.primary/secondary` no tema). */
function itemsTinta(
  nome: 'INK_LIGHT' | 'INK_DARK',
  tinta: { primary: string; secondary: string },
): SwatchItem[] {
  return [
    {
      path: `${nome}.primary`,
      value: tinta.primary,
      note: 'tinta primária — texto de corpo e título',
    },
    {
      path: `${nome}.secondary`,
      value: tinta.secondary,
      note: 'tinta secundária (DECISÃO 1.1, piso AAA nas superfícies de leitura) — é também o rótulo de botão desabilitado',
    },
  ];
}

/** Swatches de uma família de acento (`palette.<família>.accentText/fill/onFill`). */
function itemsAcento(
  nome: 'ACCENT_LIGHT' | 'ACCENT_DARK',
  familia: AccentFamily,
  par: AccentPair,
): SwatchItem[] {
  return (['text', 'fill', 'onFill'] as const).map((papel) => ({
    path: `${nome}.${familia}.${papel}`,
    value: par[papel],
    note: PAPEIS_ACENTO[papel],
  }));
}

/** Swatches da camada não-texto (`palette.nonText` no tema). */
function itemsNonText(
  nome: 'NONTEXT_LIGHT' | 'NONTEXT_DARK',
  camada: { neutral: string; action: string; focus: string },
): SwatchItem[] {
  return [
    { path: `${nome}.neutral`, value: camada.neutral, note: 'borda de campo de formulário (>= 3:1, só níveis 0 e 1)' },
    { path: `${nome}.action`, value: camada.action, note: 'indicador não-texto (ícone informativo, acento gráfico)' },
    { path: `${nome}.focus`, value: camada.focus, note: 'traço do anel de foco (focusRingStyles em theme.ts)' },
  ];
}

/** Um esquema inteiro, em ordem de leitura — usado pela story comparativa. */
function rampaCompleta(esquema: EsquemaTokens): SwatchItem[] {
  const nomeSuperficies = esquema === ESQUEMA_CLARO ? 'SURFACE_LIGHT' : 'SURFACE_DARK';
  const nomeTinta = esquema === ESQUEMA_CLARO ? 'INK_LIGHT' : 'INK_DARK';
  const nomeAcento = esquema === ESQUEMA_CLARO ? 'ACCENT_LIGHT' : 'ACCENT_DARK';
  const nomeNonText = esquema === ESQUEMA_CLARO ? 'NONTEXT_LIGHT' : 'NONTEXT_DARK';
  return [
    ...itemsSuperficies(nomeSuperficies, esquema.superficies),
    ...itemsTinta(nomeTinta, esquema.tinta),
    ...FAMILIAS.flatMap(({ familia }) => itemsAcento(nomeAcento, familia, esquema.acentos[familia])),
    ...itemsNonText(nomeNonText, esquema.nonText),
  ];
}

/* ─── Vista pura do quadro de um esquema ──────────────────────────────────── */

/** Quadro completo de UM esquema. View pura: só props. */
function QuadroDoEsquema({ esquema }: { esquema: EsquemaTokens }) {
  const nomeSuperficies = esquema === ESQUEMA_CLARO ? 'SURFACE_LIGHT' : 'SURFACE_DARK';
  const nomeTinta = esquema === ESQUEMA_CLARO ? 'INK_LIGHT' : 'INK_DARK';
  const nomeAcento = esquema === ESQUEMA_CLARO ? 'ACCENT_LIGHT' : 'ACCENT_DARK';
  const nomeNonText = esquema === ESQUEMA_CLARO ? 'NONTEXT_LIGHT' : 'NONTEXT_DARK';
  const nomeDivisor = esquema === ESQUEMA_CLARO ? 'DIVIDER_LIGHT' : 'DIVIDER_DARK';
  return (
    <Box>
      <DocSection
        title="Superfícies (níveis 0–4)"
        lead="Elevação por COR, não por sombra (theme.ts, DECISÃO 2). Publicado como theme.vars.palette.surface; níveis 0 e 1 são também background.default/paper."
      >
        <SwatchGrid items={itemsSuperficies(nomeSuperficies, esquema.superficies)} />
      </DocSection>
      <DocSection
        title="Tinta (palette.text)"
        lead="primary = texto de corpo e título; secondary = apoio E rótulo de botão desabilitado — a medida mais apertada dele ainda passa AA sobre o nível 4."
      >
        <SwatchGrid items={itemsTinta(nomeTinta, esquema.tinta)} />
      </DocSection>
      <DocSection
        title="Acentos (palette.primary/… — cada família com DOIS papéis)"
        lead="text é para TEXTO/LINK (níveis 0–2), fill é para PREENCHIMENTO. Usar o fill como cor de link é o erro clássico que reprova AA (theme.ts, DECISÃO 1)."
      >
        {FAMILIAS.map(({ familia, origem }) => (
          <Box key={familia} sx={{ mb: 2 }}>
            <Typography variant="overline">
              {familia} — {origem}
            </Typography>
            <SwatchGrid items={itemsAcento(nomeAcento, familia, esquema.acentos[familia])} />
          </Box>
        ))}
      </DocSection>
      <DocSection
        title="Não-texto (palette.nonText)"
        lead="Borda de campo, ícone informativo e traço de foco: piso 3:1 (SC 1.4.11), alcançado só nos níveis 0 e 1 — daí o anel de foco de DUAS cores."
      >
        <SwatchGrid items={itemsNonText(nomeNonText, esquema.nonText)} />
      </DocSection>
      <DocSection
        title="Divisor e scrim"
        lead="O divisor é decorativo (abaixo de 3:1 de propósito, isento por «Incidental»). O scrim é cor + opacidade e sai do tema já em color-mix (palette.scrim)."
      >
        <SwatchGrid
          items={[
            {
              path: nomeDivisor,
              value: esquema.divisor,
              note: 'separador decorativo — NUNCA o único meio de identificar algo',
            },
          ]}
        />
        <TokenTable
          lines={[
            { path: 'SCRIM.color', value: SCRIM.color, note: 'acromático (R=G=B): escurecer não tinge' },
            {
              path: 'SCRIM.opacityPercent',
              value: String(SCRIM.opacityPercent),
              note: 'degrau do sheet do iOS; o que está atrás continua legível como contexto',
            },
          ]}
        />
      </DocSection>
    </Box>
  );
}

/* ─── Histórias ───────────────────────────────────────────────────────────── */

export const Claro: Story = {
  render: () => (
    <Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: '80ch' }}>
        Rampa do esquema CLARO (valores de SURFACE_LIGHT, INK_LIGHT, ACCENT_LIGHT,
        NONTEXT_LIGHT, DIVIDER_LIGHT). Os swatches pintam o hex do próprio token:
        esta história documenta o esquema, não fixa o modo do preview — usa o
        toolbar «Tema» para ver a UI envolvente nos dois modos.
      </Typography>
      <QuadroDoEsquema esquema={ESQUEMA_CLARO} />
    </Box>
  ),
};

export const Escuro: Story = {
  render: () => (
    <Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: '80ch' }}>
        Rampa do esquema ESCURO (valores de SURFACE_DARK, INK_DARK, ACCENT_DARK,
        NONTEXT_DARK, DIVIDER_DARK). Os níveis 1 e 2 são os systemGray publicados
        pela Apple; os níveis 3–4 são interpolados na mesma família para abrir a
        janela de contraste do terminal (DECISÃO 2 de designTokens.ts).
      </Typography>
      <QuadroDoEsquema esquema={ESQUEMA_ESCURO} />
    </Box>
  ),
};

/**
 * Comparação lado-a-lado: cada papel de token com o valor claro à esquerda e o
 * escuro à direita. É a vista que um redesign usa para decidir «o nível 3 claro
 * equivale a quê no escuro» — a resposta é: aos pares do mesmo papel, nunca a
 * um valor interpolado no olho.
 */
export const Comparação: Story = {
  render: () => {
    const claros = rampaCompleta(ESQUEMA_CLARO);
    const escuros = rampaCompleta(ESQUEMA_ESCURO);
    return (
      <Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, maxWidth: '80ch' }}>
          Cada linha é o MESMO papel de token nos dois esquemas. Os caminhos à
          esquerda são os do esquema claro; o do escuro difere só no sufixo
          LIGHT/DARK.
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(20rem, 1fr))',
            gap: 2,
          }}
        >
          {claros.map((claro, i) => {
            const escuro = escuros[i];
            if (!escuro) return null;
            return (
              <Box
                key={claro.path}
                sx={{ display: 'flex', flexDirection: 'column', gap: 1, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}
              >
                <Typography variant="overline">
                  {claro.path.replace(/^(SURFACE|INK|ACCENT|NONTEXT)_LIGHT\.?/, '') || 'raiz'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Swatch item={claro} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Swatch item={escuro} />
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  },
};
