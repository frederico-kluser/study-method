# ux-apple.md — o design system do Study Method GUI

Este documento é a ESPECIFICAÇÃO do redesenho visual. Ele substitui
`docs/ux-redesign.md` como origem de valor: os números vivem em
`src/lib/designTokens.ts` (contrato) e `src/lib/codeTheme.ts` (código), este
documento explica as decisões, e `tests/theme.test.ts` /
`tests/codeTheme.test.ts` medem tudo automaticamente.

A ferramenta de calibração é `tools/design/`: `palette.ts` resolve as cores de
UI, `codepalette.ts` resolve as de código, `claims.ts` reescreve toda afirmação
`[medido]` dos comentários com o valor calculado. Nenhum número deste sistema é
lembrança.

---

## 1. A leitura do brief

> "quero refatorar todo o meu design para ficar fiel aos produtos apple"

**Leitura:** redesenho total (overhaul) de um app desktop de estudo, para
alunos de programação, com linguagem premium-consumidor **Apple**, sobre o
sistema design da própria Apple (systemGray, cores de sistema, tipografia SF,
raios contínuos, movimento contido).

Isto é **UI de produto**, não landing page: editor, terminal, trilha, quiz,
onboarding. Por isso as regras de marketing (hero, eyebrow, grid de features)
não se aplicam; aplicam-se as de sistema — paleta, tipografia, forma, movimento,
estados.

**Dials do redesenho:**
`DESIGN_VARIANCE 6 · MOTION_INTENSITY 5 · VISUAL_DENSITY 5`

VARIANCE 6 porque é produto denso (nada de layout experimental no meio de um
editor); MOTION 5 porque o movimento da Apple é contido e curto, não cinemático;
DENSITY 5 porque a tela tem rail + trilha + chat + editor + terminal ao mesmo
tempo, e ar demais quebraria a tarefa.

---

## 2. Onde a referência é literal, e onde não é

A referência é o **design system da Apple**. Onde a Apple publica um valor
nomeado, o contrato usa o valor literal. Onde ela não publica, o valor é
interpolado dentro da mesma família e a razão está escrita no fonte.

**Literais da Apple que este sistema usa:**

| papel | valor | nome publicado |
|---|---|---|
| canvas escuro + 4 degraus | `#1c1c1e` `#2c2c2e` | systemGray6 / systemGray5 escuros |
| cartão claro / canvas | `#ffffff` / `#f5f5f7` | branco de cartão / cinza de página |
| texto primário claro | `#1d1d1f` | near-black do apple.com |
| ação (azul de marca) | `#0071e3` | o azul do botão "Comprar" |
| ação (azul de sistema, escuro) | `#0a84ff` | systemBlue dark |
| verde / teal / laranja / roxo / vermelho | `#30d158` `#64d2ff` `#ff9f0a` `#bf5af2` `#ff453a` | cores de sistema dark |
| separador claro | `#c6c6c8` | separator, composto |
| rótulo de sistema | `#8e8e93` | systemGray |
| cores de sintaxe | Xcode | preferência "Syntax Coloring" |

**Onde a Apple diz uma coisa e este projeto exige outra:**

1. **Texto secundário com piso AAA.** O `secondaryLabel` da Apple não alcança 7:1
   nas superfícies de leitura deste app. A mesma família de cinza foi levada a um
   L mais baixo. A hierarquia passa a vir de tamanho e peso, que é o que a Apple
   faz de qualquer forma.

2. **Rótulo de preenchimento com piso AA.** A Apple assina botão preenchido com
   rótulo branco sobre cor de sistema, e o par fica abaixo de AA. Aqui:
   claro = cor de **marca** (mais profunda) com rótulo branco; escuro = cor de
   **sistema** (viva) com rótulo quase-preta. São dois registros de aparência e
   o mesmo compromisso de número.

3. **O canvas escuro não é preto puro.** A Apple define o system background
   escuro como `#000000`. Aqui é `#0a0a0c`, o primeiro degrau da mesma família:
   o preto puro fica reservado ao scrim, que é a única cor que precisa escurecer
   sem tingir.

---

## 3. Paleta

### Rampa tonal (elevação por cor, não por sombra)

| nível | papel | claro | escuro |
|---|---|---|---|
| 0 | fundo do app | `#f5f5f7` | `#0a0a0c` |
| 1 | cartão / leitura | `#ffffff` | `#1c1c1e` |
| 2 | well de código | `#ececf2` | `#2c2c2e` |
| 3 | chrome (rail, dock, linha atual) | `#e0e0e8` | `#363638` |
| 4 | seleção / hover forte | `#d9d9e3` | `#404042` |

Os cinco níveis escuros têm B dois pontos acima do R, que é o passo dos
systemGray da Apple. Os passos de L\* entre vizinhos são todos maiores que 4.

Os níveis 3 e 4 escuros **não** são os systemGray4/systemGray3 publicados, e a
razão é medida: a tabela ANSI do terminal precisa de dois níveis de ênfase
(`normal` e `bright`) dentro da mesma faixa de contraste, e essa janela só
existe se a distância em luminância entre o nível 2 e o nível 4 não for grande
demais. Com o topo no systemGray3 publicado a janela encolhia para menos de um
passo de canal de 8 bits.

### Seis famílias de acento (as cores de sistema da Apple)

| família | sistema | papel no app |
|---|---|---|
| `action` | systemBlue | CTA, link, cursor do editor, progresso |
| `success` | systemGreen | acerto, teste passou |
| `info` | systemTeal | informativo, saída neutra do terminal |
| `warn` | systemOrange | aviso |
| `study` | systemPurple | o segundo acento do app (herdado) |
| `error` | systemRed | erro, exclusão |

Cada família tem `text` (legível como texto nos níveis 0–2), `fill`
(preenchimento de botão) e `onFill` (tinta sobre o preenchimento). **Usar `fill`
como cor de link é o erro clássico que reprova AA.**

---

## 4. Tipografia

A Apple usa **uma** família de sans (SF Pro) em toda a escala. Este sistema faz
o mesmo: `display` e `body` são a mesma família, separados por três sinais:

- **tamanho** — escala modular, razão 1,28 sobre a base de 18px
  (`h1 62 · h2 48 · h3 38 · h4 29 · h5 23 · h6 18 · caption/overline 14`);
- **peso** — 800 nos títulos de tela (h1–h3), 700 nos de cartão (h4–h6), 600 em
  rótulo, 400 no corpo;
- **entreletra** — tracking **negativo** nos títulos (`TYPE.displayTracking`),
  tracking **positivo** em rótulo pequeno (`TYPE.labelTracking`). É o gesto
  tipográfico mais reconhecível do SF Pro.

A pilha começa pela fonte de sistema da Apple:

```
display  -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
           'Inter Variable', 'Inter', system-ui, 'Segoe UI', Roboto, sans-serif
mono     'SF Mono', ui-monospace, 'JetBrains Mono Variable', 'JetBrains Mono',
           Menlo, Consolas, monospace
```

Onde o SF existe (macOS, iOS) ele desenha — inclusive com o tamanho óptico
certo. Onde não existe, o Inter faz o papel: é o substituto canônico do SF Pro
na web. As famílias empacotadas são as de `FONT_BUNDLED`; elas continuam
locais por CSP e offline, e nenhum CDN de fonte é permitido.

---

## 5. Forma

Uma regra fixa, aplicada em toda a superfície:

| papel | raio | token |
|---|---|---|
| cartão pequeno / chip | 8 | `SHAPE.sm` |
| superfície de conteúdo / campo | 12 | `SHAPE.md` = `SHAPE.base` |
| contêiner grande / modal | 18 | `SHAPE.lg` = `SURFACE_RADIUS` |
| **ação** (botão, CTA) | **cápsula** | `SHAPE.pill` |

Contêiner arredondado, **ação em cápsula**. A cápsula é o formato do botão de
ação da Apple em toda plataforma e é o gesto de forma mais reconhecível do
sistema. Um botão redondo dentro de um cartão quadrado é design quebrado; aqui a
fronteira é documentada e seguida.

---

## 6. Movimento

Dois níveis, separados por **propriedade**:

- **spatial** (transform/geometria) — pode ultrapassar. É a aproximação em CSS
  da mola `.snappy` do SwiftUI, com ressalto discreto.
- **effects** (cor/opacidade) — nunca ultrapassa. É a curva `ease` da
  plataforma, que a Apple usa em toda troca de cor de controle.

`spatialTransition()` só aceita propriedade de geometria e reprova em runtime a
resto; `tests/theme.test.ts` varre todo estilo do tema e garante que nenhuma
propriedade de cor receba o easing com overshoot.

Os springs do `motion` são as molas nomeadas do SwiftUI convertidas
(`window` ← `.snappy`, `playful` ← `.bouncy`, `gentle` ← `.smooth`,
`snappy` ← `.interactiveSpring`). Tudo respeita `prefers-reduced-motion`.

---

## 7. Código e terminal

As matizes vêm do **Xcode**, papel por papel (Comments, Keywords, Strings,
Numbers, Project Function Names, Project Class Names, Attributes). A
luminância é re-resolvida porque o fundo é outro: cada token precisa ser lido
sobre a **seleção**, que é a superfície mais hostil da paleta.

O `cursor` do editor é o acento `action` do app (no Xcode é a cor de acento do
sistema). `function` e `type` são os dois teals adjacentes do Xcode — próximos
por referência.

A tabela ANSI tem dois níveis de ênfase: `bright` é levado a 7:1 contra o well,
com teto; `normal` fica abaixo disso, para o par não empatar. `red`, `green`,
`yellow` e `cyan` reciclam as cores de estado do terminal; `blue` e `magenta`
são vocabulário próprio do terminal.

---

## 8. O material da Apple (vidro fosco) — onde ele entra

O chrome do app (rail, dock, menu — a variante `raised` do `MuiPaper`) usa o
material translúcido da Apple: fundo semi-sólido + `backdrop-filter: blur(24px)
saturate(180%)`. É o painel de sistema da Apple, e ele mora justamente onde o
material mora no sistema: na moldura, nunca no conteúdo de leitura.

Duas travas, e as duas existem porque vidro sem fallback é defeito:

- **`@supports`** — só navegador que suporta `backdrop-filter` recebe o vidro.
  Fora disso a superfície opaca declarada é o que vale, e ela continua sendo a
  cor do nível na rampa.
- **`prefers-reduced-transparency: reduce`** volta para a superfície opaca.
  Quem pediu menos transparência não pode receber vidro.

A cor DECLARADA da superfície continua sendo o nível da rampa, mesmo onde o
material está ligado: é ela que o contrato de "elevação por cor" mede e que os
testes de contraste conferem. O material muda a composição em tela, não o papel
do nível.

**O que NÃO é material, e por quê.** Nenhum painel de LEITURA (cartão, modal,
balão de chat) é translúcido. O conteúdo de estudo vive sobre superfície opaca,
com contraste medido contra ela. Vidro atrás de prosa longa é o tipo de gesto
que ganha uma foto e perde uma leitura.

## 9. Como mexer neste sistema

1. Ninguém inventa hex. Valor novo só em `src/lib/designTokens.ts`.
2. Depois de mexer em cor: `npx tsx tools/design/claims.ts --write`. Ele
   reescreve toda afirmação `[medido]` dos comentários com o valor calculado e
   reprova afirmação quebrada em duas linhas.
3. Para calibrar: `npx tsx tools/design/palette.ts` (UI) e
   `npx tsx tools/design/codepalette.ts` (código). Eles chamam as mesmas funções
   normativas que os testes.
4. `bash tools/t.sh tests/theme.test.ts` e `tests/codeTheme.test.ts` medem tudo.
   Todo número escrito num comentário é recalculado lá.
