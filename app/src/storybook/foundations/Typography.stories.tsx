/**
 * src/storybook/foundations/Typography.stories.tsx — Fundamentos/Tipografia.
 *
 * As famílias (FONT_STACK), a escala tipográfica do tema (as 15 variantes
 * pinadas de src/theme.ts), os pesos e o comportamento real em prosa longa e
 * em bloco de código. Tudo DERIVADO: os nomes das variantes leem-se do
 * `theme` criado por src/theme.ts e as famílias/constantes de
 * src/lib/designTokens.ts — nenhum tamanho é reescrito aqui.
 *
 * DECISÕES:
 *   - A escala mostrada é a do TEMA (corpo 18px da ONDA 1), não a do contrato
 *     `TYPE` (corpo 16, congelado): theme.ts DECISÃO 2b explica que `TYPE.bodySize`
 *     é a base de calibração e a constante local `TYPE_BODY_SIZE = 18` é a base
 *     da escala visível. As duas aparecem aqui para a diferença não ser
 *     surpresa para quem reescrever o sistema.
 *   - As métricas por linha saem de `theme.typography.<variante>` ao vivo — se
 *     o tema mudar, esta história muda sozinha.
 *   - `pixel` é NOME LEGADO (a fonte de pixel saiu na onda 11): o papel é
 *     rótulo de HUD em display 700/13px. Está na escala para o nome não
 *     enganar quem ler o código.
 */
import type { CSSProperties, ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { TypographyStyle } from '@mui/material/styles';
import { FONT_BUNDLED, FONT_STACK, TYPE } from '../../lib/designTokens';
import { theme } from '../../theme';
import { DocSection, TokenTable, TypeSpec } from './parts';

const meta = {
  title: 'Fundamentos/Tipografia',
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ─── A escala do tema, derivada (nomes das variantes pinadas em theme.ts) ── */

const VARIANTES = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'subtitle1',
  'subtitle2',
  'body1',
  'body2',
  'button',
  'caption',
  'overline',
  'code',
  'pixel',
] as const;

type NomeVariante = (typeof VARIANTES)[number];

/** Amostra de conteúdo REAL do produto (pt-BR) por variante. */
const AMOSTRAS: Readonly<Record<NomeVariante, string>> = {
  h1: 'Aula 12 — Derivadas e a regra da cadeia',
  h2: 'Desafio: implementar o gradiente à mão',
  h3: 'O que a aula cobre hoje',
  h4: 'Exercício validado por teste',
  h5: 'Resumo da sessão de estudo',
  h6: 'Pré-requisitos',
  subtitle1: 'Trilha de Cálculo',
  subtitle2: 'Progresso do tópico',
  body1:
    'O Tutor explica cada passo com código executável e guarda o teu progresso entre sessões.',
  body2: 'Última sessão há 2 dias · 3 exercícios validados.',
  button: 'Testar resposta',
  caption: 'Atualizado há 2 dias',
  overline: 'TÓPICO CONCLUÍDO',
  code: 'const derivada = (f: (x: number) => number) => (x: number) => f(x + 1e-6) - f(x);',
  pixel: 'SESSÃO 03 · FOCO',
};

/** Métricas resolvidas da variante — leitura documental, nada reescrito. */
function metricasDe(style: TypographyStyle): string {
  const partes = [
    style.fontSize != null ? `size ${String(style.fontSize)}` : null,
    style.fontWeight != null ? `peso ${String(style.fontWeight)}` : null,
    style.lineHeight != null ? `entrelinha ${String(style.lineHeight)}` : null,
    style.letterSpacing != null ? `tracking ${String(style.letterSpacing)}` : null,
    style.textTransform != null ? `transform ${String(style.textTransform)}` : null,
  ].filter((p): p is string => p != null);
  return partes.join(' · ');
}

/**
 * A fatia CSS que o espécime precisa. Extraída DA variante resolvida (nunca
 * reescrita) para o espécime renderizar exatamente o que o tema publica.
 */
function estiloDe(style: TypographyStyle): CSSProperties {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    textTransform: style.textTransform,
  };
}

/** Primeiro nome de família de uma stack ("SF Pro Display", …). */
function familiaPrincipal(style: TypographyStyle): string {
  return String(style.fontFamily ?? '').split(',')[0] ?? '';
}

/* ─── Famílias (FONT_STACK / FONT_BUNDLED) ────────────────────────────────── */

function FamiliaCard({
  papel,
  stack,
  bundled,
  nota,
}: {
  papel: string;
  stack: string;
  bundled: string;
  nota: string;
}): ReactElement {
  return (
    <Paper variant="sunken" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="overline">{papel}</Typography>
      <TokenTable
        lines={[
          { path: `FONT_STACK.${papel}`, value: stack, note: nota },
          { path: `FONT_BUNDLED.${papel}`, value: bundled, note: 'família que o @fontsource REALMENTE carrega (as restantes são nomes de sistema)' },
        ]}
      />
      <Typography variant="body1" sx={{ fontFamily: stack }}>
        Aa Bb Cc Dd Ee — O Tutor estuda contigo · 0123456789 · café, ç, ã, õ
      </Typography>
    </Paper>
  );
}

export const Famílias: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Famílias do contrato"
        lead="A Apple usa UMA família de sans em toda a escala: display e body são a mesma família com nomes ópticos diferentes na frente (SF Pro Display x SF Pro Text); a hierarquia vem de tamanho, peso e entreletra. mono é o SF Mono na frente e o JetBrains Mono empacotado atrás. Fontes LOCAIS (@fontsource) — CSP e offline; nunca CDN."
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <FamiliaCard
            papel="display"
            stack={FONT_STACK.display}
            bundled={FONT_BUNDLED.display}
            nota="títulos (h1–h6) e rótulo HUD (pixel)"
          />
          <FamiliaCard
            papel="body"
            stack={FONT_STACK.body}
            bundled={FONT_BUNDLED.body}
            nota="corpo, subtítulo, botão, legenda, overline"
          />
          <FamiliaCard
            papel="mono"
            stack={FONT_STACK.mono}
            bundled={FONT_BUNDLED.mono}
            nota="código, terminal e caminhos de token"
          />
        </Box>
      </DocSection>
    </Box>
  ),
};

/* ─── A escala (as variantes pinadas do tema) ─────────────────────────────── */

export const Escala: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Escala tipográfica (theme.typography)"
        lead="Escala modular razão 1,28 sobre a base de corpo 18px (ONDA 1): h1 62 · h2 48 · h3 38 · h4 29 · h5 23 · h6 18 · caption/overline 14; body2/subtitle2 16; code 15. Todas as variantes são PINADAS em pixel — `typography.fontSize: 18` re-baseia o rem do MUI e qualquer variante sem tamanho explícito inflaria (foi assim que h5 passou à frente de h4)."
      >
        {VARIANTES.map((name) => (
          <TypeSpec
            key={name}
            name={`theme.typography.${name}`}
            metrics={`${metricasDe(theme.typography[name])} · família ${familiaPrincipal(theme.typography[name])}`}
            sample={AMOSTRAS[name]}
            style={estiloDe(theme.typography[name])}
          />
        ))}
      </DocSection>
      <DocSection
        title="Constantes do contrato (designTokens.TYPE)"
        lead="O contrato congela a base de CALIBRAÇÃO (corpo 16, código 14); o tema escala a base VISÍVEL (18/15) sem tocar no contrato — ver o cabeçalho de theme.ts (DECISÃO 2b)."
      >
        <TokenTable
          lines={[
            { path: 'TYPE.bodySize', value: String(TYPE.bodySize), note: 'corpo do contrato (calibração); o tema usa 18px em body1' },
            { path: 'TYPE.proseLineHeight', value: String(TYPE.proseLineHeight), note: 'entrelinha da prosa — dentro do intervalo de teste do C21 (1,5 a 2)' },
            { path: 'TYPE.proseParagraphGap', value: TYPE.proseParagraphGap, note: 'espaço entre parágrafos' },
            { path: 'TYPE.measureCh', value: String(TYPE.measureCh), note: 'medida-alvo da coluna de leitura' },
            { path: 'TYPE.measureMaxCh', value: String(TYPE.measureMaxCh), note: 'teto rígido da medida (SC 1.4.8)' },
            { path: 'TYPE.codeSize', value: String(TYPE.codeSize), note: 'código do contrato (calibração/xterm); a variante `code` do tema usa 15px' },
            { path: 'TYPE.codeLineHeight', value: String(TYPE.codeLineHeight), note: 'entrelinha de código' },
            { path: 'TYPE.displayTracking', value: String(TYPE.displayTracking), note: 'entreletra de display, em em (tracking da Apple nos títulos grandes)' },
            { path: 'TYPE.labelTracking', value: String(TYPE.labelTracking), note: 'entreletra de rótulo pequeno, em em' },
            { path: 'TYPE.largeTextBoldPx', value: String(TYPE.largeTextBoldPx), note: 'limiar do alívio de 3:1 (bold) — usar 18,67, não 18,5' },
            { path: 'TYPE.largeTextRegularPx', value: String(TYPE.largeTextRegularPx), note: 'limiar de large text regular' },
          ]}
        />
      </DocSection>
    </Box>
  ),
};

/* ─── Pesos (derivados das variantes resolvidas) ──────────────────────────── */

interface GrupoPeso {
  peso: number;
  variantes: NomeVariante[];
}

/** Agrupa as variantes por peso resolvido — sem números lembrados. */
function gruposDePeso(): GrupoPeso[] {
  const porPeso = new Map<number, NomeVariante[]>();
  for (const name of VARIANTES) {
    const peso = Number(theme.typography[name].fontWeight ?? 400);
    const lista = porPeso.get(peso) ?? [];
    lista.push(name);
    porPeso.set(peso, lista);
  }
  return [...porPeso.entries()].sort((a, b) => a[0] - b[0]).map(([peso, variantes]) => ({ peso, variantes }));
}

export const Pesos: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Pesos (o eixo wght da família variável)"
        lead="Os quatro degraus usados pelo tema: 400 corpo · 600 rótulo (subtitle, overline, button) · 700 título de cartão (h4–h6, pixel) · 800 título de tela (h1–h3). O piso de título é 700: abaixo disso o título deixa de ler como título ao lado dos subtítulos 600."
      >
        {gruposDePeso().map((grupo) => (
          <Box key={grupo.peso} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Typography component="code" variant="caption" sx={{ fontFamily: FONT_STACK.mono }}>
              wght {grupo.peso} — {grupo.variantes.join(' · ')}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: grupo.peso, fontSize: (t) => t.typography.h4.fontSize }}>
              Aa Bb Cc — Leitura que não cansa 0123
            </Typography>
          </Box>
        ))}
      </DocSection>
    </Box>
  ),
};

/* ─── Comportamento real: prosa longa + bloco de código ───────────────────── */

const PROSA = [
  'O Study Method ensina programação e a matemática que vive dentro dela através de código executável. Cada aula começa por uma pergunta — não por uma definição — e o caminho até à resposta é feito de passos pequenos, cada um validado por um teste que podes correr.',
  'Quando erras, o Tutor não entrega a solução: mostra o primeiro passo que faltou, sugere uma analogia e devolve o controlo. O progresso, o perfil e a proficiência ficam guardados em disco, então a sessão seguinte recomeça onde a anterior parou — mesmo que o computador desligue pelo caminho.',
  'A medida da coluna de leitura tem um teto rígido de 80 caracteres (SC 1.4.8) e a entrelinha é 1,6: os dois valores existem porque texto longo num ecrã largo cansa mais depressa do que num papel.',
];

const CODIGO = `// src/lib/designTokens.ts — a regra que estas histórias respeitam
export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);   // nunca arredonda para cima
};`;

export const ProsaECódigo: Story = {
  render: () => (
    <Box>
      <DocSection
        title="Prosa longa (superfície de leitura)"
        lead="body1 em coluna medida (TYPE.measureMaxCh), parágrafos separados por TYPE.proseParagraphGap. Prosa longa e código só nos níveis 0 e 1 da rampa de superfície — ali a tinta alcança o piso AAA (regra 3 do contrato)."
      >
        <Box sx={{ maxWidth: `${TYPE.measureMaxCh}ch` }}>
          {PROSA.map((paragrafo) => (
            <Typography key={paragrafo.slice(0, 24)} variant="body1" sx={{ mb: TYPE.proseParagraphGap }}>
              {paragrafo}
            </Typography>
          ))}
        </Box>
      </DocSection>
      <DocSection
        title="Bloco de código (variante `code` do tema)"
        lead="Mono (FONT_STACK.mono), 15px/1,5 — o `fontSize` desta variante é string COM unidade porque o MUI a publica como shorthand `font` em --mui-font-code (ver o comentário de theme.ts). O bloco é superfície nível 2 (Paper variant='sunken')."
      >
        <Paper variant="sunken" sx={{ p: 2, maxWidth: `${TYPE.measureMaxCh}ch` }}>
          <Box component="pre" sx={{ m: 0, overflowX: 'auto' }}>
            <Typography component="code" variant="code" sx={{ whiteSpace: 'pre' }}>
              {CODIGO}
            </Typography>
          </Box>
        </Paper>
      </DocSection>
    </Box>
  ),
};
