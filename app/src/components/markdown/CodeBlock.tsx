/**
 * src/components/markdown/CodeBlock.tsx — o BLOCO DE CÓDIGO de verdade.
 *
 * ─── OS QUATRO DEFEITOS QUE ESTE COMPONENTE FECHA ─────────────────────────
 *  1. FONTE ERRADA. O `pre` do chat pedia a pilha literal
 *     `'SFMono-Regular','JetBrains Mono',…`. O pacote instalado registra a
 *     família **"JetBrains Mono Variable"** (@fontsource-variable/jetbrains-mono),
 *     que não estava na pilha — o primeiro item que resolvia era o fallback do
 *     sistema, ou seja, **o código do chat não usava a fonte de código do
 *     projeto**. Aqui a pilha vem de `CODE_TYPOGRAPHY.fontFamily`, que é
 *     `FONT_STACK.mono` do contrato.
 *  2. TAMANHO DIVERGENTE. Havia três números: 13px no chat (`0.8125rem`), 15px
 *     na variante `code` do tema, 14 em `TYPE.codeSize`. **A autoridade é
 *     `codeTheme.CODE_TYPOGRAPHY`** — o próprio cabeçalho daquele arquivo
 *     resolve a divergência: `TYPE.codeSize` (14) é o número do CONTRATO
 *     (calibração de contraste e construtor do xterm) e o valor EFETIVO de
 *     renderização é 15px, subido na onda game-foundations junto do resto da
 *     tipografia. A §7.4 do redesign manda editor e terminal pintarem da MESMA
 *     fonte de verdade; o bloco de código do chat é o TERCEIRO leitor daquela
 *     superfície e passa a ler de lá também.
 *  3. ZERO HIGHLIGHT. `src/lib/codeTheme.ts` tem 9 papéis de sintaxe em duas
 *     polaridades, com contraste medido contra a SELEÇÃO, e o chat não usava
 *     nada. Agora usa, via `codeHighlight.ts` (gramáticas já instaladas).
 *  4. ENTRADA E SAÍDA IGUAIS. ```python``` (o que o ALUNO escreve) e ```text```
 *     (o que o COMPUTADOR responde) renderizavam como a MESMA caixa cinza —
 *     defeito PEDAGÓGICO, não estético. Ver "as duas caixas" abaixo.
 *
 * ─── AS DUAS CAIXAS, e por que a diferença é essa ─────────────────────────
 * A superfície é a MESMA nos dois casos: o well de nível 2 da rampa
 * (`surface.level2`), porque é o que `codeTheme.ts` define como fundo de
 * código (`chrome.surface`) e é contra ele que todo token foi calibrado.
 * Inventar um segundo nível para a saída quebraria essa calibração. A
 * distinção mora em três sinais, todos com token existente:
 *
 *   | | ENTRADA (```python, ```js, …) | SAÍDA (```text, ```output, sem tag) |
 *   |---|---|---|
 *   | rótulo | o nome da linguagem | `challenge.output` ("Saída"/"Output") |
 *   | fio sob o rótulo | 2px `primary.fill` (família action) | 2px `info.fill` |
 *   | tinta do rótulo | `primary.accentText` | `info.accentText` |
 *   | corpo | COLORIDO pelos 9 papéis | monocromático, tinta primária |
 *
 * O sinal mais forte é o último e é gratuito: código tem cor, resposta de
 * computador não tem. É a mesma leitura do terminal do app.
 *
 * E a escolha das DUAS famílias não é gosto: `codeTheme.ts` já elegeu a família
 * `action` como o acento da superfície de código ("Cursor/caret. É o acento
 * `action` — o único ponto vivo da superfície quieta"), e já mapeia
 * `state.info` para o papel informativo do terminal. ENTRADA herda `action`
 * (slot `primary` do tema) e SAÍDA herda `info` — as mesmas duas famílias que o
 * editor e o terminal já usam para dizer essas duas coisas.
 *
 * ─── POR QUE O RÓTULO É `variant="pixel"` ─────────────────────────────────
 * Press Start 2P já está carregado e era usado em UM lugar no app inteiro
 * (`SessionFrame`). O contrato diz que ele é acento "RARO … nunca corpo nem
 * título" — um rótulo de HUD de 12px em uppercase é exatamente o papel
 * descrito, e é informação real (qual linguagem, ou que aquilo é saída), não
 * enfeite (guarda-corpo #1 da §2).
 *
 * ─── ACENTO-COMO-TEXTO SÓ ATÉ O NÍVEL 2 ───────────────────────────────────
 * `designTokens.ts`, regra 3b: `accentText` vale nos níveis 0, 1 e 2 — e só.
 * Por isso o cabeçalho do bloco fica no MESMO nível 2 do well (não sobe para o
 * nível 3 de chrome): ali o rótulo pode ser acento. O que separa cabeçalho de
 * código é o FIO colorido, não uma segunda superfície.
 *
 * ─── COR POR CLASSE + applyStyles, NUNCA POR TERNÁRIO ─────────────────────
 * §6.2 do redesign: sob `cssVariables`, `palette.mode === 'dark' ? A : B`
 * resolve UMA vez e trava no galho errado. As cores de sintaxe não têm CSS var
 * de tema (elas vivem em `codeTheme.ts`), então entram como regras de classe
 * com `theme.applyStyles('dark', …)` POR ÚLTIMO no array `sx` — o padrão que
 * `SessionFrame.tsx` já usa.
 *
 * ─── ESTOURO ──────────────────────────────────────────────────────────────
 * `overflowX: 'auto'` + `maxWidth: '100%'` no PRÓPRIO contêiner: já houve
 * estouro medido de 1226px num painel de 1000px (a linha longa do runner
 * empurrava a bolha inteira). O bloco rola por dentro; a bolha não cresce.
 */
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Fragment, useMemo, type ReactElement } from 'react';

import { CODE_DARK, CODE_LIGHT, CODE_SYNTAX_ROLES, CODE_TYPOGRAPHY, type CodePalette } from '../../lib/codeTheme';
import { SHAPE, TYPE } from '../../lib/designTokens';
import { codeFenceRole, type CodeFenceRole } from '../../lib/typewriterSegments';
import { highlightCodeLines, type CodeToken } from './codeHighlight';

/** `& .tok-<papel> { color }` para uma polaridade inteira da paleta de código. */
function syntaxRules(palette: CodePalette): Record<string, { color: string }> {
  const rules: Record<string, { color: string }> = {};
  for (const role of CODE_SYNTAX_ROLES) {
    rules[`& .tok-${role}`] = { color: palette.syntax[role] };
  }
  return rules;
}

const SYNTAX_LIGHT = syntaxRules(CODE_LIGHT);
const SYNTAX_DARK = syntaxRules(CODE_DARK);

export interface CodeBlockProps {
  /** Conteúdo do bloco, SEM cercas. */
  code: string;
  /** Tag da cerca já normalizada (`python`, `text`, `''`…). */
  lang: string;
  /**
   * Quantas linhas já foram reveladas pela digitação. `undefined` = todas
   * (uso normal, fora do typewriter). A caixa SEMPRE tem a altura final: as
   * linhas ainda não reveladas ficam com `visibility: hidden`, então encher o
   * bloco não move um pixel do que já está na tela.
   */
  visibleLines?: number;
}

export function CodeBlock({ code, lang, visibleLines }: CodeBlockProps): ReactElement {
  const { t } = useTranslation();
  const role: CodeFenceRole = codeFenceRole(lang);
  // Só ENTRADA é colorida (ver "as duas caixas"): a saída do computador não é
  // código-fonte e pintá-la com papéis de sintaxe seria informação falsa.
  const lines = useMemo(
    () => highlightCodeLines(code, role === 'input' ? lang : ''),
    [code, lang, role],
  );
  const visible = visibleLines ?? lines.length;
  const label = role === 'output' ? t('translation:challenge.output') : (lang || 'code');
  const accent = role === 'output' ? 'info' : 'primary';

  return (
    <Box
      sx={[
        (theme) => ({
          my: 1,
          maxWidth: '100%',
          borderRadius: `${SHAPE.sm}px`,
          border: `2px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.surface.level2,
          color: theme.vars.palette.text.primary,
          overflow: 'hidden',
          ...SYNTAX_LIGHT,
        }),
        (theme) => theme.applyStyles('dark', SYNTAX_DARK),
      ]}
    >
      <Box
        sx={(theme) => ({
          px: 1,
          // O fio colorido é o que separa cabeçalho de código — não uma
          // segunda superfície (ver "acento-como-texto só até o nível 2").
          borderBottom: `2px solid ${theme.vars.palette[accent].fill}`,
        })}
      >
        <Typography
          variant="pixel"
          component="span"
          sx={(theme) => ({ color: theme.vars.palette[accent].accentText })}
        >
          {label}
        </Typography>
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1,
          overflowX: 'auto',
          maxWidth: '100%',
          whiteSpace: 'pre',
          fontFamily: CODE_TYPOGRAPHY.fontFamily,
          fontSize: CODE_TYPOGRAPHY.fontSize,
          lineHeight: TYPE.codeLineHeight,
        }}
      >
        <code>
          {lines.map((tokens, i) => (
            <Fragment key={i}>
              {/* `visibility` (e não `display`) é o que RESERVA a caixa: a
                  linha ocupa o mesmo espaço antes e depois de ser revelada. */}
              <span style={i < visible ? undefined : { visibility: 'hidden' }}>
                {tokens.map((token: CodeToken, j: number) => (
                  <span key={j} className={token.role === null ? undefined : `tok-${token.role}`}>
                    {token.text}
                  </span>
                ))}
              </span>
              {/* A quebra fica FORA do span da linha: ela existe desde o
                  primeiro quadro, então a altura do bloco nunca muda. */}
              {i < lines.length - 1 ? '\n' : null}
            </Fragment>
          ))}
        </code>
      </Box>
    </Box>
  );
}
