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
import { createTheme } from '@mui/material/styles';

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
        // Demais cores seguem o default do esquema claro do MUI.
      },
    },
    dark: {
      palette: {
        primary: {
          main: PRIMARY_MAIN,
        },
        // Demais cores seguem o default do esquema escuro do MUI.
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