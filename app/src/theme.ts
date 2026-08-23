/**
 * src/theme.ts — tema Material UI v9 do Study Method.
 *
 * DECISÃO DARK-ONLY (documentada):
 *   O app é escuro por design (o shell antigo usava --bg #0f1115). Em vez do
 *   padrão legado (`palette.mode` — removido/desencorajado na v9, e que quebra
 *   o mecanismo de CSS variables), usamos o padrão ATUAL v6+/v9:
 *   `colorSchemes: { dark: true }` + `cssVariables: true`. Isso liga o esquema
 *   dark (paleta default dark do MUI: background #121212, superficies, contraste)
 *   e mantém o `light` default disponível — mas o app é RENDERIZADO em dark
 *   fixo via `defaultMode="dark"` no ThemeProvider (ver main.tsx). Um único
 *   tema basta; não exportamos um `darkTheme` separado (o usuário não alterna
 *   modo nesta aplicação — dark-only).
 *
 *   `mode` é `undefined` no primeiro render do useColorScheme(); como nosso
 *   app não faz toggle manual, não consumimos o hook — o defaultMode fixo no
 *   provider garante o dark desde o primeiro paint.
 *
 * FONTES: sem @fontsource (package.json congelado nesta onda) — o tema usa a
 *   system stack default do MUI (Roboto→Helvetica→Arial→sans-serif) com o
 *   fallback do SO; o renderer Electron/Tauri tem fontes de sistema disponíveis.
 *   O `-webkit-font-smoothing` e a cor do body ficam com o CssBaseline.
 *
 * OVERRIDES mínimos: raio 8 (shape), font-size 14, e components p/ dar
 *   coerência (Button/Card/TextField/Paper) — ver bloco `components`.
 */
import { createTheme } from '@mui/material/styles';

/**
 * Cor primária herdada do tema custom antigo (accent #4f8cff).
 * No esquema dark do MUI o `main` é usado nas superfícies/interações.
 */
const PRIMARY_MAIN = '#4f8cff';

export const theme = createTheme({
  // Dark-only: liga o esquema dark (paleta dark default). `dark: true` usa a
  // paleta dark padrão do MUI; poderíamos passar `{ palette: {...} }` por scheme.
  colorSchemes: {
    // dark-only: paleta dark default do MUI com o accent custom do projeto
    // aplicado no scheme DARK (é o scheme de render — ver main.tsx defaultMode).
    dark: {
      palette: {
        primary: {
          main: PRIMARY_MAIN,
        },
      },
    },
    // light fica no default (habilitado) mas o provider renderiza dark fixo.
  },
  // CSS theme variables → toggle instantâneo sem re-render e `theme.vars`.
  cssVariables: true,
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontSize: 14,
  },
  palette: {
    primary: {
      main: PRIMARY_MAIN,
    },
    // As demais cores (secondary/error/warning/etc.) seguem o default do
    // esquema dark do MUI para contraste adequado sobre fundo escuro.
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', // rótulos de botão não ficam em CAIXA ALTA
        },
      },
    },
    MuiCard: {
      defaultProps: {
        variant: 'outlined', // consistente com o shell escuro (borda em vez de sombra forte)
      },
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          // Consistência com o shape; elevação sutil no dark.
        },
      },
    },
  },
});

/** Conveniência descritiva: o tema é dark-only — não existe um `lightTheme`. */
export default theme;