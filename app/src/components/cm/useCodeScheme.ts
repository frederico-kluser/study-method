/**
 * src/components/cm/useCodeScheme.ts — a POLARIDADE (claro/escuro) do código,
 * num único hook de tema para o editor e o terminal.
 *
 * ─── COMO A POLARIDADE CHEGA AOS COMPONENTES ───────────────────────────────
 * Por `useColorScheme()` do MUI, NUNCA por `theme.palette.mode`: sob
 * `cssVariables` o MUI copia o palette do `defaultColorScheme` para o topo do
 * tema, então um ternário sobre `palette.mode` resolve UMA vez e nunca reage
 * ao toggle (ver "MECÂNICA OBRIGATÓRIA DO MUI v9", item 2, em `src/theme.ts`).
 *
 * `useColorScheme().colorScheme` é `undefined` até ao efeito de montagem do
 * provider (`useCurrentColorScheme` do `@mui/system` inicia `isClient` em
 * `false` quando há mais de um scheme suportado). Cair em `'light'` nesse
 * frame pintaria um editor claro dentro de um app escuro — por isso o
 * fallback é a CLASSE do `<html>`, que o `primeColorSchemeClass()` do
 * `src/main.tsx` grava ANTES do primeiro paint (e não uma adivinhação).
 *
 * Antes desta onda, `domColorScheme()` vivia DUPLICADA em
 * `components/cm/CodeMirrorField.tsx` e `components/terminal/AnswerTerminal.tsx`
 * (as doc-blocks das duas cópias cruzavam-se a dizer que "não há módulo comum
 * para a hospedar uma vez só"). Há: este hook. Ambos os componentes (e o
 * Storybook, via prop `scheme`) leem a mesma definição.
 */
import { useColorScheme } from '@mui/material/styles';
import type { CodeScheme } from '../../lib/codeTheme';

/**
 * Polaridade lida do `<html>` — o fallback do PRIMEIRO render (ver doc acima).
 */
export function domColorScheme(): CodeScheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * A polaridade do código no render corrente: `useColorScheme()` quando o
 * provider já acordou, classe do `<html>` no primeiro frame.
 */
export function useCodeScheme(): CodeScheme {
  const { colorScheme } = useColorScheme();
  return (colorScheme ?? domColorScheme()) === 'dark' ? 'dark' : 'light';
}
