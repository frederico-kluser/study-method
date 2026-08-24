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
import { DRACULA } from './lib/draculaTheme';

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
 * Cor primária do scheme LIGHT. #4f8cff sobre fundo claro cai pra ~3.2:1 (texto
 * branco em botão primary), abaixo do 4.5:1 do WCAG AA. Para o modo claro
 * escolhemos um azul mais escuro e legível: #1565c0 (blue[800]) ≈ 5.7:1 com
 * contrasteText branco. Decisão documentada: em claro o accent custom não é
 * usado como `main` do primary para garantir legibilidade de texto/interações.
 */
const LIGHT_PRIMARY_MAIN = '#1565c0';

/**
 * Onda 20B — DARK MODE DRACULA (feedback: "o Header todo azul não ficou bom no
 * darkmode").
 *
 * O scheme dark vira a paleta Dracula canônica, IMPORTADA de
 * `src/lib/draculaTheme.ts` (a MESMA do editor CodeMirror e do terminal — sem
 * duplicar hex; o contrato da lib NÃO muda). O AppBar deixa de usar
 * `color="primary"` no dark (nada de header azul): vira superfície Dracula
 * (`background.paper` + `divider`) — ver src/App.tsx. Light permanece INTACTO.
 *
 * Decisões medidas (WCAG 2.2 — contraste calculado e assertado em
 * tests/theme.test.ts, função de contraste local):
 *   - background.default = DRACULA.background #282a36 (fundo canônico);
 *   - background.paper   = #2f3142 — ELEVAÇÃO LEVE sobre o fundo (1.11:1 vs bg),
 *     entre o fundo e o currentLine #44475a. Evitamos o #44475a como paper
 *     (vira "excesso de elevação" e derruba o contraste do secondary p/ 1.94:1);
 *   - text.primary   = DRACULA.foreground #f8f8f2 (13.4:1 sobre o bg);
 *   - text.secondary = #aeb6c2 — o comment canônico #6272a4 cai a 3.03:1 sobre
 *     #282a36 (abaixo do AA 4.5:1), então usamos cinza-claro frio legível:
 *     6.96:1 sobre bg e 6.27:1 sobre paper;
 *   - divider = #44475a (Dracula currentLine) — borda 1px visível (1.56:1);
 *   - primary.main = DRACULA.purple #bd93f9 (accent canônico; 5.9:1 sobre bg);
 *     primary.contrastText = #1e1f29 — texto escuro legível (6.78:1 sobre o
 *     roxo; o branco canônico cairia a 2.26:1);
 *   - tertiary.main = DRACULA.cyan #8be9fd (acento M3 de contraste — 10.3:1).
 */

/** Borda/divider 1px do dark — Dracula currentLine. Não vive no objeto DRACULA
 *  exportado (contrato do editor/terminal não muda); declarado aqui. */
const DARK_DIVIDER = '#44475a';

/** text.secondary do dark — ver decisão medida acima (comment falha AA 4.5:1). */
const DARK_TEXT_SECONDARY = '#aeb6c2';

/** Superfície de camada 2 (cards/papers/AppBar) — elevação Dracula sutil. */
const DARK_BACKGROUND_PAPER = '#2f3142';

/** contrastText do primary dark (roxo #bd93f9) — texto escuro legível (6.78:1). */
const DARK_PRIMARY_CONTRAST_TEXT = '#1e1f29';

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
        // Onda 20B: accent canônico Dracula (#bd93f9) + contrastText escuro
        // legível (6.78:1) — o branco sobre o roxo cai a 2.26:1.
        primary: {
          main: DRACULA.purple,
          contrastText: DARK_PRIMARY_CONTRAST_TEXT,
        },
        // Onda 20B: acento M3 de contraste = ciano Dracula (10.3:1 sobre bg).
        tertiary: {
          main: DRACULA.cyan,
        },
        // Dracula por camadas de elevação (onda 20B): `default` = fundo canônico
        // #282a36; `paper` = elevação leve #2f3142 (cards/AppBar); `divider` =
        // currentLine #44475a (borda 1px visível). Valores medidos no header.
        background: {
          default: DRACULA.background,
          paper: DARK_BACKGROUND_PAPER,
        },
        text: {
          primary: DRACULA.foreground,
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
  // fix17c ACHADO-4: NÃO repetir `palette` top-level aqui. Declarar um bloco
  // `palette` no topo JUNTO de `colorSchemes` faz o MUI v9 DERRUBAR os slots de
  // cor customizada do scheme LIGHT (o `tertiary` de _inspect caía para
  // undefined). Como o scheme de render é definido por `mode`/useColorScheme,
  // o `theme.palette` top-level é derivado do scheme default — nada lê este
  // nível — então o bloco redundante foi removido p/ os DOIS schemes expõem
  // `tertiary` de verdade (assertado em tests/theme.test.ts).
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