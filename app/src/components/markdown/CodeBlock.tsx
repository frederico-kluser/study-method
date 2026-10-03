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
 *   | corpo | COLORIDO pelos 9 papéis de SINTAXE | COLORIDO pelos papéis de ESTADO |
 *
 * ONDA-CODIGO-EDITOR (pedido do dono: "com highlight para ate o output, e
 * ficar facil de entender as coisas"): a última linha mudou — a saída deixou
 * de ser monocromática. A distinção deixou de ser "com cor × sem cor" e passou
 * a ser QUAL cor: ENTRADA leva gramática (keyword/string/function…), SAÍDA
 * leva estado (✓ passou em verde, ✗ falhou em vermelho, aviso em âmbar,
 * valores citados e contagens destacados, durações/relogios em tinta quieta).
 * As duas caixas continuam a dizer coisas diferentes; agora a segunda também
 * é legível de relance. Os DOIS vocabulários vêm do `codeTheme`
 * (`CodePaintRole`), todos medidos ≥ 4,5:1 contra o well.
 *
 * E a escolha das DUAS famílias não é gosto: `codeTheme.ts` já elegeu a família
 * `action` como o acento da superfície de código ("Cursor/caret. É o acento
 * `action` — o único ponto vivo da superfície quieta"), e já mapeia
 * `state.info` para o papel informativo do terminal. ENTRADA herda `action`
 * (slot `primary` do tema) e SAÍDA herda `info` — as mesmas duas famílias que o
 * editor e o terminal já usam para dizer essas duas coisas.
 *
 * ─── POR QUE O RÓTULO É `variant="pixel"` ─────────────────────────────────
 * A variante já existia e era usada em UM lugar no app inteiro
 * (`SessionFrame`), com o papel de etiqueta de HUD: "RARO … nunca corpo nem
 * título". Um rótulo de 12px em uppercase é exatamente esse papel, e é
 * informação real (qual linguagem, ou que aquilo é saída), não enfeite
 * (guarda-corpo #1 da §2).
 * ONDA 11: o NOME é legado. A fonte de PIXEL que batizou a variante (Press
 * Start 2P) saiu do projeto com o resto do retrô — "a fonte nao quero retro" —
 * e hoje `pixel` é o DISPLAY em 700/13px. O papel continua idêntico; só a
 * família mudou.
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
import { Box, Button, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TerminalRoundedIcon from '@mui/icons-material/TerminalRounded';

import {
  CODE_DARK,
  CODE_LIGHT,
  CODE_STATE_ROLES,
  CODE_SYNTAX_ROLES,
  CODE_TYPOGRAPHY,
  type CodePalette,
} from '../../lib/codeTheme';
import { copyTextToClipboard } from '../../lib/copyToClipboard';
import {
  COPIED_HOLD_MS,
  copyFeedbackAfterCopy,
  copyFeedbackAfterHold,
  copyFeedbackIsFailure,
  copyFeedbackShowsCheck,
  type CopyFeedback,
} from '../../lib/copyFeedbackState';
import { SHAPE, TYPE } from '../../lib/designTokens';
import { wrappingActionAnywhereSx } from '../../lib/layoutSx';
import { codeFenceRole, type CodeFenceRole } from '../../lib/typewriterSegments';
import { codeLabelFor, highlightCodeLines, highlightOutputLines, type CodeToken } from './codeHighlight';

/**
 * `& .tok-<papel> { color }` para uma polaridade inteira da paleta de código.
 * ONDA-CODIGO-EDITOR: cobre os 9 papéis de SINTAXE (entrada) E os 5 de ESTADO
 * (saída) — os dois vocabulários pintáveis (`CodePaintRole` do codeTheme).
 */
function syntaxRules(palette: CodePalette): Record<string, { color: string }> {
  const rules: Record<string, { color: string }> = {};
  for (const role of CODE_SYNTAX_ROLES) {
    rules[`& .tok-${role}`] = { color: palette.syntax[role] };
  }
  for (const role of CODE_STATE_ROLES) {
    rules[`& .tok-${role}`] = { color: palette.state[role] };
  }
  return rules;
}

const SYNTAX_LIGHT = syntaxRules(CODE_LIGHT);
const SYNTAX_DARK = syntaxRules(CODE_DARK);

/**
 * ONDA-CODIGO-EDITOR (finding-2): a DURAÇÃO do "Copiado ✓" é o
 * `COPIED_HOLD_MS` da pura `copyFeedbackState` (~2 s — tempo de ler a
 * confirmação sem o estado se arrastar); importado aqui, não redeclarado.
 */

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
  // ONDA-CODIGO-EDITOR (pedido do dono: "com highlight para ate o output, e
  // ficar facil de entender as coisas"): ENTRADA continua a sair com os 9
  // papéis de SINTAXE; SAÍDA deixa de ser monocromática e passa a sair com os
  // papéis de ESTADO (✓ passou em verde, ✗ falhou em vermelho, aviso em
  // âmbar, valores citados e contagens destacados) — ver
  // `highlightOutputLines`. As DUAS caixas continuam distintas: quem é
  // código-fonte leva gramática; quem é resposta do computador leva estado.
  const lines = useMemo(
    () => (role === 'output' ? highlightOutputLines(code) : highlightCodeLines(code, lang)),
    [code, lang, role],
  );
  const visible = visibleLines ?? lines.length;
  // ONDA-CODIGO-EDITOR: o chip mostra o NOME da linguagem, não a tag crua da
  // cerca (`c`/`py`/`mjs` são apelidos de markdown — "confuso", disse o dono).
  const label = role === 'output' ? t('translation:challenge.output') : (codeLabelFor(lang) ?? (lang || 'code'));
  const accent = role === 'output' ? 'info' : 'primary';

  /**
   * ONDA-CODIGO-EDITOR (finding-2 da auditoria uxui — "1 clique para copiar"):
   * o botão copia o `code` CRU (sem números de linha nem o prompt decorativo —
   * ver `copyToClipboard.ts`) e confirma com "Copiado ✓" por COPIED_HOLD_MS.
   * A confirmação é estado curto: o timeout é limpo no desmonte (nunca um
   * setState pós-desmonte) e o `useCallback` depende só do texto copiado.
   *
   * CONTRATO STATE/VIEW: as TRANSIÇÕES do feedback (idle→copied/failed→idle,
   * W15 — a FALHA de cópia também é estado visível, nunca um clique morto) são
   * a pura `copyFeedbackState` (tests/copyFeedbackState.test.ts); aqui fica só
   * o fio dos timers e a leitura da view. UM estado de cada vez — os dois
   * booleanos de antes (`copied`/`copyFailed`) admitiam combinações ilegais.
   */
  const [feedback, setFeedback] = useState<CopyFeedback>('idle');
  const copyTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );
  const handleCopy = useCallback((): void => {
    void copyTextToClipboard(code).then((ok) => {
      setFeedback(copyFeedbackAfterCopy(ok));
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setFeedback(copyFeedbackAfterHold());
      }, COPIED_HOLD_MS);
    });
  }, [code]);
  const copied = copyFeedbackShowsCheck(feedback);
  const copyFailed = copyFeedbackIsFailure(feedback);

  return (
    <Box
      sx={[
        (theme) => ({
          my: 1,
          maxWidth: '100%',
          borderRadius: `${SHAPE.sm}px`,
          // ONDA-CODIGO-EDITOR (finding-1 da auditoria uxui — sinal de FORMA):
          // com as DUAS caixas coloridas, a moldura passa a ser a distinção que
          // sobrevive a percorrer a conversa depressa, a daltonismo e a
          // impressão a preto: ENTRADA = sólida (cartão de editor), SAÍDA =
          // tracejada (copia de impressora/terminal). A cor do fio e o chip
          // continuam — são sinais a mais, não os únicos.
          border: `2px ${role === 'output' ? 'dashed' : 'solid'} ${theme.vars.palette.divider}`,
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
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing(1),
          minWidth: 0,
          // O fio colorido é o que separa cabeçalho de código — não uma
          // segunda superfície (ver "acento-como-texto só até o nível 2").
          borderBottom: `2px solid ${theme.vars.palette[accent].fill}`,
        })}
      >
        {/* ONDA-CODIGO-EDITOR (finding-1): ÍCONE por tipo de caixa — o segundo
            sinal de forma (junto da moldura): terminal para a SAÍDA, código
            para a ENTRADA. Decorativo (`aria-hidden`): o nome acessível da
            caixa continua a ser o rótulo textual ("Saída"/"C"). */}
        <Box
          component="span"
          aria-hidden="true"
          sx={(theme) => ({ display: 'inline-flex', color: theme.vars.palette[accent].accentText })}
        >
          {role === 'output' ? <TerminalRoundedIcon fontSize="small" /> : <CodeRoundedIcon fontSize="small" />}
        </Box>
        <Typography
          variant="pixel"
          component="span"
          sx={(theme) => ({
            color: theme.vars.palette[accent].accentText,
            flex: 1,
            minWidth: 0,
            // Quebra, nunca recorta (SC 1.4.12) — a linha do cabeçalho é flex.
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
          })}
        >
          {label}
        </Typography>
        {/* ONDA-CODIGO-EDITOR (finding-2 da auditoria uxui — "Copiar" em 1
            clique, como toda a superfície editor-like): copia o `code` CRU
            (o gutter é aria-hidden/user-select:none e o prompt é decorativo —
            nenhum dos dois entra na cópia) e confirma "Copiado ✓" por ~2s.
            Alvo de toque no piso do design system + "quebra, nunca recorta"
            (SC 1.4.12) — o composto `wrappingActionAnywhereSx` de
            lib/layoutSx.ts (auditoria §1). */}
        <Button
          size="small"
          variant="text"
          onClick={handleCopy}
          startIcon={copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
          aria-label={
            copied
              ? t('translation:common.copiedCode')
              : copyFailed
                ? t('translation:common.copyFailed')
                : t('translation:common.copyCode')
          }
          sx={(theme) => ({
            ...wrappingActionAnywhereSx,
            flexShrink: 0,
            color: copyFailed ? theme.vars.palette.error.accentText : theme.vars.palette.text.secondary,
          })}
        >
          {/* aria-live: a troca de rótulo do botão não é anunciada sozinha —
              a região viva garante que "Copiado ✓"/"Não foi possível copiar"
              chega a quem usa leitor de tela. */}
          <span role="status" aria-live="polite">
            {copied
              ? t('translation:common.copiedCode')
              : copyFailed
                ? t('translation:common.copyFailed')
                : t('translation:common.copyCode')}
          </span>
        </Button>
      </Box>
      {/* ONDA-CODIGO-EDITOR — O GUTTER DE NÚMEROS DE LINHA (pedido do dono:
          "mostrando o numero da linha realmente parecendo um editor").
          Arranjo de DOIS filhos, como um editor: [números][código rolável].
            · o gutter NÃO rola com o código (é um filho flex separado) — os
              números ficam colados à esquerda como no CodeMirror/VS Code;
            · `aria-hidden` + `userSelect: 'none'`: os números são ADORNO de
              leitura. Fora do `<code>`, o copiar/colar leva só o código e o
              leitor de ecrã não anuncia "1 2 3" antes de cada linha;
            · cada número é um bloco com a MESMA fonte/tamanho/entrelinha da
              linha que rotula (alinhamento 1:1 — `whiteSpace: 'pre'` garante
              que o código nunca embrulha, então a correspondência é exata) e
              usa a MESMA regra de `visibility` da linha: com o typewriter a
              revelar, o número aparece JUNTO com a sua linha, e a caixa
              reserva a altura final desde o primeiro quadro;
            · `tabular-nums`: dígitos de largura constante, senão os números
              "dançam" à medida que passam de 9 para 10. */}
      <Box sx={{ display: 'flex', alignItems: 'stretch', overflow: 'hidden' }}>
        <Box
          component="div"
          aria-hidden="true"
          sx={(theme) => ({
            flexShrink: 0,
            py: 1,
            px: 1,
            borderRight: `1px solid ${theme.vars.palette.divider}`,
            color: theme.vars.palette.text.secondary,
            fontFamily: CODE_TYPOGRAPHY.fontFamily,
            fontSize: CODE_TYPOGRAPHY.fontSize,
            lineHeight: TYPE.codeLineHeight,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
            userSelect: 'none',
          })}
        >
          {lines.map((_tokens, i) => (
            <span key={i} style={{ display: 'block', visibility: i < visible ? undefined : 'hidden' }}>
              {i + 1}
            </span>
          ))}
        </Box>
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 1,
            overflowX: 'auto',
            maxWidth: '100%',
            flex: 1,
            minWidth: 0,
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
                  {/* ONDA-CODIGO-EDITOR (finding-1): o PREFIXO de terminal na
                      primeira linha da saída — terceiro sinal de forma (junto
                      da moldura tracejada e do ícone). É ADORNO: `aria-hidden`
                      + `user-select: none`, logo não vai para o leitor de ecrã
                      nem para a cópia (nem a seleção manual o inclui — o
                      Chromium exclui user-select:none do copiado, e o botão
                      "Copiar" copia o `code` cru). Vive DENTRO do span da
                      linha 1: aparece e some COM ela na revelação do
                      typewriter, sem mexer na altura da caixa. */}
                  {role === 'output' && i === 0 ? (
                    <Box
                      component="span"
                      aria-hidden="true"
                      sx={(theme) => ({ userSelect: 'none', color: theme.vars.palette[accent].fill })}
                    >
                      {'❯ '}
                    </Box>
                  ) : null}
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
    </Box>
  );
}
