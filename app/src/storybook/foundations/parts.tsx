/**
 * src/storybook/foundations/parts.tsx — vistas PURAS de apoio às histórias de
 * Fundamentos (Cores, Tipografia, Espaço, Movimento, Foco e Contraste, Ícones).
 *
 * CONTRATO STATE/VIEW do projeto (STORY-SPEC §5): tudo aqui é view de só
 * props — sem estado, sem efeito, sem IPC, sem relógio. O estado que estas
 * histórias precisam (nenhum, são documentação) vive nas próprias stories.
 *
 * DECISÕES:
 *   - Nenhum valor de design mora neste ficheiro. Cor, tamanho e família
 *     CHEGAM por props, e o que é estrutura (grelha, folga, rótulo) resolve-se
 *     com `theme.spacing()` / variantes do tema — nunca com números mágicos de
 *     cor. A regra 1 do contrato (designTokens.ts) vale também para o
 *     Storybook: um hex escrito numa story é um hex que o redesign vai copiar.
 *   - Os rótulos de caminho de token (ex.: `SURFACE_DARK.level3`) são MONO
 *     porque são sintaxe, não prosa; a família vem de `FONT_STACK.mono`.
 *   - Partilhado por TODAS as histórias de Fundamentos em vez de copiado
 *     ficheiro a ficheiro (STORY-SPEC §6, DRY de layout). Os primitivos
 *     `app/src/components/layout/` ainda não existem quando estas histórias
 *     foram escritas; quando entrarem, a onda de consolidação pode apontar
 *     este ficheiro para eles.
 */
import type { CSSProperties, ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { FONT_STACK } from '../../lib/designTokens';

/* ─── Estrutura de página de documentação ─────────────────────────────────── */

export interface DocSectionProps {
  /** Título da secção (nível h2 da página de docs). */
  title: string;
  /** Frase de contexto por baixo do título (regra/decisão que a secção prova). */
  lead?: string;
  children?: ReactNode;
}

/** Bloco de secção das páginas de Fundamentos: título + lead + corpo. */
export function DocSection({ title, lead, children }: DocSectionProps) {
  return (
    <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 4 }}>
      <Box>
        <Typography variant="h5" component="h2">
          {title}
        </Typography>
        {lead ? (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: '80ch' }}>
            {lead}
          </Typography>
        ) : null}
      </Box>
      {children}
    </Box>
  );
}

/* ─── Swatches de cor (Cores) ─────────────────────────────────────────────── */

export interface SwatchItem {
  /** CAMINHO do token, exatamente como existe em designTokens.ts. */
  path: string;
  /** Valor hex do token — DERIVADO do import, nunca literal na story. */
  value: string;
  /** Papel do token (o que ele representa no produto). */
  note?: string;
}

/** Um swatch: amostra pintada com o valor do token + caminho + hex. */
export function Swatch({ item }: { item: SwatchItem }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      <Box
        aria-hidden
        sx={{
          height: (theme) => theme.spacing(10),
          borderRadius: (theme) => theme.shape.borderRadius,
          border: 1,
          borderColor: 'divider',
          backgroundColor: item.value,
        }}
      />
      <Typography
        component="code"
        variant="caption"
        sx={{ fontFamily: FONT_STACK.mono, wordBreak: 'break-all' }}
      >
        {item.path}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: FONT_STACK.mono }}>
        {item.value}
      </Typography>
      {item.note ? (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {item.note}
        </Typography>
      ) : null}
    </Box>
  );
}

/** Grelha de swatches — a "rampa completa" das histórias de Cores. */
export function SwatchGrid({ items }: { items: readonly SwatchItem[] }) {
  return (
    <Box
      sx={(theme) => ({
        display: 'grid',
        // colunas de largura derivada de `theme.spacing` (nada de px soltos)
        gridTemplateColumns: `repeat(auto-fill, minmax(${theme.spacing(24)}, 1fr))`,
        gap: 2,
      })}
    >
      {items.map((item) => (
        <Swatch key={item.path} item={item} />
      ))}
    </Box>
  );
}

/* ─── Tabela de tokens não-cor (Tipografia, Espaço, Movimento) ────────────── */

export interface TokenLine {
  /** Caminho do token. */
  path: string;
  /** Valor resolvido (número, string CSS, hex… — vem sempre do contrato). */
  value: string;
  /** Papel/decisão do token. */
  note?: string;
}

/** Tabela caminho → valor → papel. Mono nos dois primeiros, prosa no terceiro. */
export function TokenTable({ lines }: { lines: readonly TokenLine[] }) {
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
            <Typography variant="overline">Token</Typography>
          </Box>
          <Box component="th">
            <Typography variant="overline">Valor</Typography>
          </Box>
          <Box component="th">
            <Typography variant="overline">Papel</Typography>
          </Box>
        </Box>
      </Box>
      <Box component="tbody">
        {lines.map((line) => (
          <Box component="tr" key={line.path}>
            <Box component="td">
              <Typography component="code" variant="caption" sx={{ fontFamily: FONT_STACK.mono }}>
                {line.path}
              </Typography>
            </Box>
            <Box component="td">
              <Typography component="code" variant="caption" sx={{ fontFamily: FONT_STACK.mono }}>
                {line.value}
              </Typography>
            </Box>
            <Box component="td">
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {line.note}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/* ─── Linha de espécime tipográfico (Tipografia) ──────────────────────────── */

export interface TypeSpecProps {
  /** Nome da variante do tema (o caminho do token de tema). */
  name: string;
  /** Métricas resolvidas da variante, para leitura documental. */
  metrics: string;
  /** Texto de espécime — conteúdo real do produto. */
  sample: string;
  /** Estilo tipográfico resolvido do tema (derivado, nunca reescrito). */
  style: CSSProperties;
}

/** Uma linha da escala: nome + métricas + amostra renderizada no estilo real. */
export function TypeSpec({ name, metrics, sample, style }: TypeSpecProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'baseline' }}>
        <Typography component="code" variant="caption" sx={{ fontFamily: FONT_STACK.mono }}>
          {name}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: FONT_STACK.mono }}>
          {metrics}
        </Typography>
      </Box>
      <Typography component="div" sx={{ ...style, overflowWrap: 'anywhere' }}>
        {sample}
      </Typography>
    </Box>
  );
}
