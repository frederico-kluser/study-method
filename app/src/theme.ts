/**
 * src/theme.ts — tema Material UI v9 do Study Method.
 *
 * DECISÃO CLARO+ESCURO (onda 11 — theme toggle):
 *   O app agora suporta os DOIS esquemas com um botão de troca na UI
 *   (ThemeToggleButton) e o DEFAULT seguindo a preferência do SO
 *   (`defaultMode="system"` no ThemeProvider — ver main.tsx). Abandonamos a
 *   decisão DARK-ONLY da onda 7.
 *
 *   Mecanismo (padrão ATUAL v6+/v9):
 *     - `colorSchemes: { light, dark }` declara os MESMOS dois esquemas;
 *     - `cssVariables: true` → toggle instantâneo sem re-render e anti-flicker;
 *     - `colorSchemeSelector: 'class'` → OBRIGATÓRIO para o toggle manual. Por
 *       default, quando os dois esquemas existem, o MUI escolhe `'media'`
 *       (prefers-color-scheme), e com `'media'` o `setMode()` do
 *       `useColorScheme()` NÃO tem efeito nenhum (o MUI loga um erro pedindo
 *       class/data). Com `'class'` o scheme é aplicado como classe `.light`/
 *       `.dark` no `<html>` (colorSchemeNode), permitindo o override manual.
 *
 *   Primeiro paint sem flash: com `cssVariables: true` + `modeStorageKey`
 *   apontando pro localStorage e `defaultMode="system"`, o MUI resolve o scheme
 *   de forma SÍNCRONA no inicializador do useState do `useCurrentColorScheme`
 *   (lê `localStorage['theme-mode']`; se ausente segue `prefers-color-scheme`
 *   via matchMedia) e aplica a classe antes do primeiro paint (useLayoutEffect).
 *   Não precisamos de `InitColorSchemeScript` (é anti-flicker só no SSR) e ele
 *   seria bloqueado pelo CSP `script-src 'self'` desta app de qualquer forma —
 *   o bootstrap do main.tsx valida isso.
 *
 *   Persistência: a escolha manual fica em `localStorage['theme-mode']`
 *   (chave `modeStorageKey` do ThemeProvider). Default = 'system' → segue o SO.
 *
 *   FONTES: sem @fontsource (package.json congelado nesta onda) — o tema usa a
 *   system stack default do MUI (Roboto→Helvetica→Arial→sans-serif) com o
 *   fallback do SO; o renderer Electron/Tauri tem fontes de sistema disponíveis.
 *   O `-webkit-font-smoothing` e a cor do body ficam com o CssBaseline.
 *
 *   OVERRIDES mínimos: raio 8 (shape), font-size 14, e components p/ dar
 *   coerência (Button/Card/TextField/Paper) — ver bloco `components`.
 */
import { createTheme, type PaletteColor, type PaletteColorOptions } from '@mui/material/styles';

/**
 * Onda 17A — `tertiary` como cor de paleta do Material 3 (acento de contraste
 * sobre superfícies escuras). O type do MUI v9 não expõe `tertiary` no Palette
 * por padrão; esta augmentação adiciona `main` ao Palette/PaletteOptions. Vive
 * AQUI em theme.ts para ser visível tanto pelo tsconfig.json (renderer) quanto
 * pelo tsconfig.node.json (que inclui `src/theme.ts` nos testes).
 */
declare module '@mui/material/styles' {
  interface Palette {
    tertiary: PaletteColor;
  }
  interface PaletteOptions {
    tertiary?: PaletteColorOptions;
  }
}

/**
 * Cor primária herdada do tema custom antigo (accent #4f8cff). Úsada no scheme
 * DARK: sobre superfícies escuras (#121212) o #4f8cff tem contraste suficiente
 * (texto claro/luminoso em primary é legível sobre o fundo escuro do app).
 */
const PRIMARY_MAIN = '#4f8cff';

/**
 * Cor primária do scheme LIGHT. #4f8cff sobre fundo claro cai pra ~3.2:1 (texto
 * branco em botão primary), abaixo do 4.5:1 do WCAG AA. Para o modo claro
 * escolhemos um azul mais escuro e legível: #1565c0 (blue[800]) ≈ 5.7:1 com
 * contrasteText branco. Decisão documentada: em claro o accent custom não é
 * usado como `main` do primary para garantir legibilidade de texto/interações.
 */
const LIGHT_PRIMARY_MAIN = '#1565c0';

/**
 * Onda 17A — REFINO DO DARK (UX notes: "dark theme ficou ruim").
 *
 * Dark NÃO é inverter o light: escuridão por camadas de ELEVAÇÃO. Aqui o scheme
 * dark recebe uma paleta explícita de superfícies (background.default < paper)
 * e um `text.secondary` com contraste AA (4.5:1) sobre AMBAS as camadas.
 * `divider` visível para bordas `outlined` e separadores; `tertiary` serve de
 * acento de contraste sobre fundo escuro (M3 spare palette), usado no card de
 * status e destaques da Home. O primary #4f8cff sobre as superfícies novas
 * mantém contraste suficiente para interações.
 *
 * Light permanece como estava (NÃO invertido) — só ganha `tertiary` para que a
 * mesma chave de cor exista nos dois schemes e o `t` de acento seja portável.
 */

/** Texto secundário do DARK com contraste WCAG AA (≥4.5:1) sobre as superfícies. */
const DARK_TEXT_SECONDARY = '#aeb6c2';

/** Divider/borda 1px visível no dark (sem virar linha apagada). */
const DARK_DIVIDER = '#2b313c';

/** Superfície de camada 1 (app/background) — casa com o body do index.css. */
const DARK_BACKGROUND_DEFAULT = '#0f1115';

/** Superfície de camada 2 (cards/papers/sheets) — levemente mais clara. */
const DARK_BACKGROUND_PAPER = '#171c23';

/** Acento terciário (M3) legível sobre fundo escuro — destaques da Home. */
const DARK_TERTIARY_MAIN = '#b8a6ff';

/** Acento terciário do LIGHT — acompanha o primary escuro legível. */
const LIGHT_TERTIARY_MAIN = '#6a4fbf';

export const theme = createTheme({
  // Dois esquemas completos: light e dark (ambos com a paleta default do MUI +
  // primary custom). `light` vem primeiro → defaultColorScheme = 'light' (só
  // como último recurso; o `defaultMode="system"` do provider manda de fato).
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: LIGHT_PRIMARY_MAIN,
        },
        tertiary: {
          main: LIGHT_TERTIARY_MAIN,
        },
        // Demais cores seguem o default do esquema claro do MUI.
      },
    },
    dark: {
      palette: {
        primary: {
          main: PRIMARY_MAIN,
        },
        tertiary: {
          main: DARK_TERTIARY_MAIN,
        },
        // Elevação por camadas (onda 17A): `paper` é a superfície de cards,
        // `default` a base do app; `divider` vira borda 1px legível.
        background: {
          default: DARK_BACKGROUND_DEFAULT,
          paper: DARK_BACKGROUND_PAPER,
        },
        text: {
          primary: '#e8eaed',
          secondary: DARK_TEXT_SECONDARY,
        },
        divider: DARK_DIVIDER,
      },
    },
  },
  // toggle manual exige class/data (media não deixa setMode ter efeito — ver
  // cabeçalho). Aplica `.light`/`.dark` no <html> via colorSchemeNode.
  // Em v9.3.1 esta opção vive dentro de `cssVariables` (type ThemeOptions omite
  // `colorSchemeSelector` do topo; o runtime a promove de volta ao theme).
  cssVariables: {
    colorSchemeSelector: 'class',
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontSize: 14,
  },
  // `palette.primary.main` (top-level) = scheme default ('light'). Manter apenas
  // por clareza/compatibilidade; o scheme de render é definido pelo `mode`
  // (useColorScheme), não por este nível.
  palette: {
    primary: {
      main: LIGHT_PRIMARY_MAIN,
    },
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
        variant: 'outlined', // consistente com o shell (borda em vez de sombra forte)
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
          // Consistência com o shape; elevação sutil em ambos os modos.
        },
      },
    },
  },
});

/** Conveniência descritiva: o tema agora suporta light e dark (modo do provider). */
export default theme;