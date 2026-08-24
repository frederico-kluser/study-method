# Rodada 5 — tutorial modal centralizado (Bug A) + dark mode Dracula de verdade (Bug B)

Documento da **quinta rodada** da GUI Electron do study-method (`app/`). Ela corrigiu dois bugs
de UX reportados pelo usuário e fechou um terceiro que a própria revisão adversarial encontrou:

- **Bug A (tutorial/modal)** — o painel do onboarding **sem spotlight** (steps informativos e
  a conclusão) caía no **canto inferior-direito** da tela; agora é **centralizado**.
- **Bug B (dark Dracula)** — o `AppBar` com `color="primary"` deixava o header **azul** (`#4f8cff`)
  no dark; o tema dark agora é **Dracula de verdade**, importando a paleta canônica de
  `src/lib/draculaTheme.ts`.
- **fix20c (clamp)** — achado da revisão adversarial: o `top` do painel centralizado podia ficar
  **negativo** quando o painel é mais alto que o viewport; proteção `Math.max(margin, …)` no max
  do clamp.

O relatório da execução orquestrada (ondas `20a`/`20b` + `fix20c`, commits, gates, revisões)
vive em [`docs/relatorio-rodada5.md`](relatorio-rodada5.md). Este documento descreve **o que** a
rodada entregou e **como** cada parte funciona.

---

## Bug A — tutorial/modal sem spotlight centralizado (`onda20a`, `eb4422f`)

### Sintomas e formato

O onboarding do ondokai (rodada 4) posiciona o painel de dicas em torno de um **spotlight**
(retângulo recortado sobre o alvo). Porém vários steps **não têm spotlight**: os informativos
(ex.: `shell-app-title`, `tour-complete`) e qualquer step cujo alvo esteja ausente do DOM. Para
essas situações o `calculatePanelPosition` de
`app/src/features/onboarding/utils/onboardingPositioning.utils.ts` (ramo `!spotlight`) colava o
painel no **canto inferior-direito** — o que o usuário reportou como "o tutorial não ficou bom,
às vezes o modal fica muito final".

### Correção — card centralizado no viewport

O ramo `!spotlight` agora calcula um **card central** com clamp no viewport:

- **Vertical:** `top = (viewport.height − panelHeight) / 2 − viewport.height * 0.08` — centro
  vertical com leve **viés de 8% da altura para cima** (queixa: não quer o card baixo demais);
- **Horizontal:** `left = (viewport.width − effectiveWidth) / 2` — **centro horizontal** exato;
- **Clamp no viewport:** `top` e `left` caem dentro dos limites `[margin, viewport − tamanho −
  margin]`, então o card **nunca estoura** a tela (nem vertical, nem horizontal);
- **Largura** retornada (`width`) permanece a nominal (não muda) — só o posicionamento muda;
  `compact: false` mantém o comportamento do ramo sem alvo.

A decisão foi mantida *pura* e testável — nada de DOM/jsdom, corrigindo direto na função.

### Testes novos (`tests/onboardingPositioning.test.ts`)

Três casos novos cobrem a centralização, a responsividade e o caso extremo:

1. **centralização** — no Full HD o card fica com centro-x ≈ metade do viewport e centro-y ≈
   metade **menos 8% da altura** (viés para cima); dentro do viewport; **oposto do comportamento
   antigo** (`top`/`left` não ficam mais na metade inferior-direita).
2. **viewport pequeno (320×480)** — mesmo numa tela minúscula o painel continua **dentro do
   viewport** (clamp atua; `top`/`left` ≥ 0, não estoura vertical/horizontal).
3. **painel alto > viewport** — (na verdade adicionado no `fix20c-clamp`, ver abaixo).

A regressão do ramo **com** spotlight foi preservada: `rectsOverlap`/sobreposição/ordem de
lados/compact e o clamp no spotlight continuam cobertos.

---

## Bug B — dark mode Dracula de verdade (`onda20b`, `bfe8a38`)

### Sintoma

O dark (refinado por camadas na rodada 4) usava `primary = #4f8cff` (azul) e o `AppBar` com
`color="primary"`. No dark, o **header inteiro ficava azul** — "o Header todo azul não ficou bom
no darkmode".

### Correção

O scheme dark virou a **paleta Dracula canônica**, importada de `src/lib/draculaTheme.ts`
(`DRACULA` — a **mesma** do editor CodeMirror e do terminal xterm; a lib é o contrato do
editor/terminal e **NÃO foi tocada** — os hex canônicos são apenas lidos, nunca duplicados).

| token | antes | depois | origem |
|---|---|---|---|
| `background.default` | `#0f1115` | `#282a36` | `DRACULA.background` |
| `background.paper` | `#171c23` | `#2f3142` | elevação leve Dracula |
| `text.primary` | `#e8eaed` | `#f8f8f2` | `DRACULA.foreground` |
| `text.secondary` | `#aeb6c2` | `#aeb6c2` (mantido) | comment `#6272a4` falha AA 3.03:1 |
| `divider` | `#2b313c` | `#44475a` | `DRACULA` currentLine |
| `primary.main` | `#4f8cff` | `#bd93f9` | `DRACULA.purple` |
| `primary.contrastText` | branco | `#1e1f29` | escuro legível (6.78:1) |
| `tertiary.main` | `#b8a6ff` | `#8be9fd` | `DRACULA.cyan` |

Decisões medidas:

- **`background.paper = #2f3142`** é uma **elevação leve** sobre o fundo `#282a36` (1.11:1 vs
  bg), entre o fundo e o currentLine `#44475a`. Evitou-se usar `#44475a` como `paper` (viraria
  "excesso de elevação" e derrubaria o contraste do secondary para 1.94:1).
- **`text.secondary = #aeb6c2`** é mantido (cinza-claro frio): o comment canônico `#6272a4`
  cai para **3.03:1** sobre `#282a36` — **abaixo do AA 4.5:1** — então não serve como texto.
  Ficou: 6.96:1 sobre o bg e 6.27:1 sobre o paper.
- **`primary.main = #bd93f9` (roxo Dracula)** com **`primary.contrastText = #1e1f29`** (escuro):
  o branco canônico sobre o roxo cairia para **2.26:1**; o `#1e1f29` alcança **6.78:1**.
- **`tertiary.main = #8be9fd` (ciano)** serve de acento M3 de contraste: **10.3:1** sobre o bg.

### Contraste WCAG 2.2 ≥ 4.5:1 (medido no teste)

| par | razão |
|---|---|
| `text.primary` sobre `background.default` | **13.4:1** |
| `text.primary` sobre `background.paper` | 11.8:1 |
| `text.secondary` sobre `background.default` | **6.96:1** |
| `text.secondary` sobre `background.paper` | 6.27:1 |
| `primary.contrastText` sobre `primary.main` | **6.78:1** |
| `tertiary.main` sobre `background.default` | **10.3:1** |
| `primary.main` sobre `background.default` | **5.9:1** |

### AppBar escuro (header não-azul)

`app/src/App.tsx` trocou o `AppBar color="primary" enableColorOnDark` por
`color="default"` + **`applyStyles`** (Regra 4 do MUI — esquema via `applyStyles`, nunca
`palette.mode`), assim:

- **light** → `bgcolor: 'primary.main'` (`#1565c0`) + `color: 'primary.contrastText'` — **azul,
  intacto**;
- **dark** → `bgcolor: 'background.paper'` (`#2f3142`) + `color: 'text.primary'` (`#f8f8f2`) +
  `borderBottom: 1` com `borderColor: 'divider'` (`#44475a`) — **header escuro Dracula**, sem azul.

### Bootstrap da janela

O `backgroundColor` da `BrowserWindow` (`electron/main/index.ts`) mudou de `#0f1115` para
**`#282a36`** (o bg Dracula) — a janela nasce oculta e só revela no `ready-to-show`; agora o
primeiro paint segue o fundo dark Dracula (evita flash azul/outra cor).

### Testes — `tests/theme.test.ts` e `e2e-theme.spec.ts`

`tests/theme.test.ts` ganhou uma **função de contraste local** (WCAG 2.x: `luminance` +
`contrastRatio`) e asserts da paleta dark **exata** (valores vindos da lib Dracula) + a medição
do **contraste AA ≥ 4.5:1** dos pares acima + a prova de que o comment `#6272a4` **falha** AA
(por isso o secondary é outro) + a checagem de elevação leve (paper vs bg < 1.5:1). O **light** é
assertado INTACTO (`primary #1565c0`, `background.default #fff`, `text.primary` default do MUI).

`tests/e2e/e2e-theme.spec.ts` agora faz asserts de cor reais no browser: light → header
`rgb(21,101,192)` e body branco; dark → header `rgb(47,49,66)` (paper) + borda inferior
`rgb(68,71,90)` (divider) e body `rgb(40,42,54)` (bg Dracula).

---

## fix20c — clamp do `top` protegido no ramo `!spotlight` (`fix20c-clamp`, `b448200`)

### Achado (revisão adversarial da rodada 5)

O `Math.min` do clamp vertical do ramo **sem spotlight** tinha o max fixo em
`viewport.height − panelHeight − margin`. Quando `panelHeight > viewport.height − 2*margin`
(painel **mais alto que a viewport**), esse max ficava **negativo**, e o `Math.min` capava o
`top` num valor negativo — o painel **sumia para cima da tela**.

### Correção

```
top: clamp( (viewport.height − panelHeight)/2 − viewport.height*0.08, margin,
            Math.max(margin, viewport.height − panelHeight − margin) )
```

O max do clamp é protegido com `Math.max(margin, …)` — a **mesma proteção do ramo com
spotlight** (linha 170 do módulo). Painel muito alto **nunca gera `top` negativo**: no limite ele
assenta em `top = margin` (pode transbordar a altura, mas nunca some para cima).

### Teste novo

`tests/onboardingPositioning.test.ts` ganhou o caso 3: viewport 600×400, painel de **500px de
altura** (maior que a viewport) → `top ≥ 0` e, no limite, `top = margin` (8), com `width` não
negativo.

> Todos os casos novos do Bug A/fix20c aceitam a combinação: panel centralizado no Full HD,
> clamp num viewport de 320×480 e painel-que-escapa com `top` nunca negativo.

---

## Como rodar (recap)

```bash
cd app
npm ci
npm run build && npm run lint
npm test                          # bash tools/t.sh tests → 729 testes, verde
npm run build && npm run test:e2e # 15 testes mock, verde
npm run test:e2e:real             # 3 specs reais — exporte DEEPSEEK_API_KEY/BRAVE_API_KEY no shell
```