# Redesign de UX/UI — "Superfície quieta, resposta viva"

> Especificação de redesenho completo do app Electron (`app/`) na filosofia de design
> da Nintendo, mantendo seriedade e legibilidade para leitura técnica longa,
> em tema claro e escuro.
>
> **Toda afirmação aqui está marcada com o nível de evidência.** O que é norma está
> citado com o texto normativo; o que é primária-mas-declarativa está marcado como
> filosofia declarada; o que é minha inferência de projeto está marcado
> `[INFERÊNCIA]`. Números de cor e de tempo foram **calculados**, não escolhidos por
> gosto — os scripts estão em `docs/ux-redesign/`.

---

## 1. O princípio orientador

**Superfície quieta, resposta viva.** A base do app — fundo, coluna de texto, painel
de código — fica neutra e sóbria. Toda a personalidade Nintendo vive em três lugares:
**acento, estado e movimento**.

Esse recorte não é estético por capricho; ele reconcilia duas fontes primárias que
puxam para lados opostos:

| Fonte | O que diz | Nível |
|---|---|---|
| [Iwata Asks — Wii Hardware, "A Design For Everyone"](https://www.nintendo.com/en-gb/Iwata-Asks/Iwata-Asks-Wii/Iwata-Asks-Wii-Hardware/2-A-Design-For-Everyone/2-A-Design-For-Everyone-205730.html) | Ashida: *"Making Wii into a device that everyone likes is more important to us than a having fiercely individualistic design."* Restrição no objeto-base é ranqueada **acima** de design individualista. | Primária declarada. **Escopo: design industrial de hardware, zero conteúdo de UI.** A tradução para superfície/acento é minha. |
| [Ask the Developer Vol. 16 — Switch 2](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-16-nintendo-switch-2-part-2/) | Dohta: *"everyone on the Technology Development team fine-tuned it—right down to the satisfying 'snap' feeling when you attach the controllers... I think this has become a key element that symbolizes Nintendo Switch 2."* O original japonês usa 気持ち良さ (*kimochi-yosa*) literalmente. | Primária declarada. Evidência do que a Nintendo **valoriza**, não de eficácia. |
| [Ask the Developer Vol. 16 — nota de rodapé 14](https://www.nintendo.com/us/whatsnew/ask-the-developer-vol-16-nintendo-switch-2-part-2/) | Yokoi, *lateral thinking of withered technology*: *"taking widely-used technology that isn't cutting edge anymore, and using it for new and different purposes."* | Primária. Nintendo aplica **seletivamente ao input**, não como política de evitar tecnologia nova. |
| [Iwata Asks — 3DS, HOME Menu](https://www.nintendo.com/en-gb/Iwata-Asks/Iwata-Asks-Nintendo-3DS/Vol-6-Nintendo-3DS-Pre-installed-Software/1-A-Real-Tomodachi-Collection/1-A-Real-Tomodachi-Collection-223722.html) | Takahashi: *"in a separate frame from those normal icons, up above, we lined up Notifications, friend list and Game Notes."* Chamável a qualquer momento **suspendendo**, não saindo. | Primária, descreve UI enviada de verdade. |

Lidas juntas: **o objeto é sóbrio; a sensação de tocá-lo é obra de engenharia
dedicada; o estado global mora num quadro à parte acima do conteúdo; e a diversão é
construída com peças baratas e maduras usadas de um jeito inesperado.**

Aplicado aqui `[INFERÊNCIA]`: a aula e o editor são a superfície quieta; o botão
"Testar resposta", a barra de progresso da aula e o resultado do teste são o *snap*
magnético — merecem trabalho de projeto dedicado, não polimento sobrando; a barra
superior vira o quadro de estado da sessão; e o "novo" sai de MUI v9, transições CSS,
CodeMirror e xterm que já estão instalados — nenhuma dependência exótica.

---

## 2. O que a evidência **não** sustenta (guarda-corpos)

Estes limites vieram de verificação adversarial e são tão importantes quanto o resto.
Não os contorne.

1. **"Mais suco (juice) é melhor" é contestado dentro do próprio design de jogos.**
   [GDC Europe 2014, Folmer Kelly, *Don't Juice It or Lose It*](https://gdcvault.com/play/1020861/Don-t-Juice-It-or):
   *"through the idea that adding polish makes a game feel more alive, we're actually
   losing a level of immersion... the context doesn't get considered."* Na verificação,
   **todas** as afirmações de que "juice" é portável para UI fora de jogo foram
   **refutadas 0-3**; só a contra-palestra sobreviveu 3-0.
   → **Regra:** todo efeito precisa ser causado por um estado real (um resultado de
   teste de verdade), nunca decorativo. Nada de partícula sem causa.

2. **O alvo APCA Lc 75/90 para corpo de texto foi refutado** (1-2 e 0-3). Não existe
   hoje número APCA verificado para prosa. O piso normativo continua sendo **razão de
   luminância WCAG 2.x**.

3. **A regra "45–75 caracteres por linha" não ganhou base experimental.** As tentativas
   de ancorá-la em Legge/PNAS foram rejeitadas 0-3. Trate como convenção tipográfica.
   A medida defensável vem do SC 1.4.8 (80 caracteres) — e mesmo esse é *mechanism-scoped*
   (ver §4.2).

4. **"WCAG exige 80ch" e "WCAG exige line-height 1.5" são falsos.** O SC 1.4.8 Nota 1:
   *"Content is not required to use these values. The requirement is that a mechanism is
   available... The mechanism can be provided by the browser."* Defenda a medida por
   argumento tipográfico, nunca por "a norma manda".

5. **`color-mix()` derivado das variáveis do tema no MUI v9 foi refutado 0-3.** A rampa
   tonal precisa ser **hex explícito por esquema**, escrito à mão. Nada de matemática de
   cor em runtime.

6. **O Path do Duolingo não tem métrica pública.** O post oficial não reporta
   *nenhum* número de A/B, retenção ou conclusão. Trilha linear é uma escolha de produto
   legítima, **não** uma decisão respaldada por evidência publicada.

7. **Não existe evidência verificada para vários números que "todo mundo sabe".** Três
   rodadas de pesquisa **não** confirmaram: o `#121212` do Material Design como
   superfície escura; a regra de dessaturar acentos para a faixa tonal 200–50 no dark;
   a proibição de `#000`/`#fff` puros; *halation*; aberração cromática de vermelho
   saturado sobre preto; astigmatismo em polaridade negativa; monoespaçada vs.
   proporcional para leitura de código; tamanho/entrelinha mínimos de bloco de código;
   ligaduras de programação; acessibilidade de KaTeX/MathML. **Isso não quer dizer que
   sejam folclore** — quer dizer que não foram verificados, e portanto nenhum número
   aqui se apoia neles. A rampa escura desta especificação foi **derivada e medida
   localmente** (§3), não copiada de guia. Onde escolho 14px/1,5 para código, é
   **escolha de projeto declarada**, não achado.

8. **Polaridade positiva (texto escuro sobre claro) tem vantagem de leitura**, e a
   versão forte "polaridade não importa" foi refutada 0-3. Buchner, Mayr & Brandt (2009,
   *Ergonomics* 52(7):882-886) atribuem a vantagem à luminância mais alta — mas num
   display emissivo **é a polaridade positiva que produz essa luminância**. Piepenbrock
   et al. (2014, *Human Factors*): *"the positive polarity advantage linearly increased
   with decreasing character size"* — ou seja, **o efeito é maior justamente em texto
   pequeno: código, legendas, fórmulas**.
   → **Decisão:** o tema **claro é o default de leitura**; o escuro é escolha explícita
   e igualmente cuidada. Não afirmamos paridade de desempenho entre os dois.

---

## 3. Tokens de cor — calculados, não escolhidos

Identidade: **"Cartucho"** — papel morno de dia, carvão-índigo de noite, com acentos
chapados e saturados de console. Sem gradiente em superfície.

Todos os valores abaixo foram verificados com a fórmula normativa
`(L1 + 0.05) / (L2 + 0.05)` ([WCAG 2.2 glossário](https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio)),
**sem arredondar para cima** (o Understanding de 1.4.3 é explícito: 4.499:1 não passa
em 4.5:1).

### 3.1 Rampa tonal de superfície (elevação por cor, não por sombra)

Escrita como hex explícito por esquema — ver guarda-corpo #5.

| Nível | Uso | Light | Dark |
|---|---|---|---|
| 0 | fundo do app | `#faf7f2` | `#12141a` |
| 1 | cartão / superfície de leitura | `#ffffff` | `#1b1e26` |
| 2 | painel afundado, well de código | `#f3eee5` | `#232733` |
| 3 | chrome elevado (rail, dock, menu) | `#e9e2d6` | `#2c313f` |
| 4 | estado selecionado / hover forte | `#ddd5c6` | `#363c4c` |

Nem `#000` nem `#fff` puros aparecem como fundo de app (nível 0). O branco puro é
usado **apenas** como cartão de leitura sobre papel morno — o inverso da elevação do
escuro, que clareia.

### 3.2 Tinta

| Papel | Light | vs nível 0 | vs nível 1 | Dark | vs nível 0 | vs nível 1 |
|---|---|---|---|---|---|---|
| `text.primary` | `#191713` | **16,75:1** | **17,90:1** | `#eceef4` | **15,87:1** | **14,36:1** |
| `text.secondary` | `#544e45` | **7,70:1** | **8,23:1** | `#a7adbd` | **8,20:1** | **7,42:1** |

Ambos os papéis passam o piso **AAA de 7:1** ([SC 1.4.6](https://www.w3.org/TR/WCAG22/))
nos níveis 0 e 1 nos **dois** esquemas.

> **Regra de superfície de leitura:** prosa longa e código só nos níveis **0 e 1**. No
> nível 4, `text.secondary` cai para 5,64:1 (light) e 4,90:1 (dark) — ainda AA, mas
> abaixo de AAA. Níveis 3–4 são **chrome**, não leitura.

### 3.3 Acentos

Cada família tem dois valores por esquema, porque **acento como texto e acento como
preenchimento são requisitos diferentes** — o erro clássico é usar `primary.main` como
cor de link e falhar AA.

| Família | Papel | Light `main` (texto, ≥4,5:1 no nível 0) | Light `fill` (com `#fff`) | Dark `main` (texto, ≥4,5:1) | Dark `fill` (com `#12141a`) |
|---|---|---|---|---|---|
| **action** | botão primário, "testar", CTA | `#d5331a` — 4,55:1 | `#de351b` — 4,53:1 | `#e73f25` — 4,50:1 | `#e73f25` — 4,50:1 |
| **success** | teste passou, verdict ok | `#1e804f` — 4,62:1 | `#1f8653` — 4,57:1 | `#218f58` — 4,50:1 | `#218f58` — 4,50:1 |
| **info** | link, aula, fonte | `#0d79a0` — 4,61:1 | `#0e7ea7` — 4,60:1 | `#1489b3` — 4,61:1 | `#1489b3` — 4,61:1 |
| **warn** | atenção, chave faltando | `#9d6607` — 4,53:1 | `#a46a07` — 4,52:1 | `#ae7209` — 4,57:1 | `#ae7209` — 4,57:1 |
| **study** | matemática, fórmula, KaTeX | `#964dd5` — 4,55:1 | `#9a54d7` — 4,54:1 | `#a45be4` — 4,55:1 | `#a45be4` — 4,55:1 |

**Botão primário preenchido:**
- Light: fundo `#de351b` + texto `#ffffff` = **4,53:1**
- Dark: fundo `#e73f25` + texto `#12141a` = **4,50:1** — preenchimento vivo com tinta
  quase-preta. É a leitura mais Nintendo das duas *e* é a que passa (branco sobre
  `#e73f25` daria só 4,09:1).

**Camada não-texto ≥3:1** ([SC 1.4.11](https://www.w3.org/TR/WCAG22/)) — borda de campo,
ícone informativo, anel de foco:

| | Light (vs nível 0) | Dark (vs níveis 0 e 1) |
|---|---|---|
| neutro | `#978e7f` — 3,03:1 | `#726856` — 3,36 / 3,04:1 |
| action | `#ea6551` — 3,03:1 | `#c52f18` — 3,33 / 3,01:1 |
| info (anel de foco) | `#109acb` — 3,02:1 | `#0c7196` — 3,35 / 3,03:1 |

Divisores puramente decorativos (`#ddd5c6` claro / `#2c313f` escuro) ficam abaixo de
3:1 de propósito — são isentos por "Incidental" quando não são o único meio de
identificar o componente. **Borda de campo de formulário não é decorativa** e usa a
camada de 3:1 acima.

### 3.4 O vermelho: por que **não** usamos `#E60012`

Este é o achado mais concreto da pesquisa.

O [SC 2.3.1](https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold) define
*red flash* (Nota 3, definição nova do WCAG 2.2) como transição de/para um estado com
`R/(R+G+B) ≥ 0.8`, e limita a **três** por segundo.

| Cor | R/(R+G+B) | Veredicto |
|---|---|---|
| Vermelho Nintendo `#E60012` | **0,927** | **é red flash** |
| nosso action light `#de351b` | 0,735 | não é |
| nosso action dark `#e73f25` | 0,698 | não é |

Copiar o vermelho da Nintendo colocaria a camada de celebração dentro do gatilho
regulatório de fotossensibilidade. O vermelho derivado mantém a mesma energia e sai
do gatilho. **Além disso**, o SC 2.3.1 cai sob a
[Conformance Requirement 5 — Non-Interference](https://www.w3.org/TR/WCAG22/#cc5),
ou seja, vale para **todo** o conteúdo da página, mesmo o decorativo.

---

## 4. Tipografia e a superfície de leitura

### 4.1 Famílias

Empacotadas via `@fontsource` (arquivos locais). **Não** usar CDN: o renderer roda sob
CSP e o app precisa funcionar offline.

| Papel | Fonte | Por quê |
|---|---|---|
| Display / títulos | **Nunito** (700/800) | terminais arredondados dão o registro lúdico sem virar fonte de brinquedo |
| Corpo / UI | **Inter** | desenhada para tela, algarismos tabulares para contadores e verdicts |
| Código / terminal | **JetBrains Mono** | já está na *stack* do `index.css` atual, só não estava instalada |

### 4.2 Escala e métricas da coluna de leitura

Alinhado ao **SC 1.4.8 (AAA)** — declarado honestamente como *alvo derivado de AAA*,
nunca como "exigido pela norma" (guarda-corpo #4).

| Token | Valor | Base |
|---|---|---|
| `body` | **16px** | abaixo de 24px regular / 18,67px bold não há alívio de contraste ([large-scale text](https://www.w3.org/TR/WCAG22/#dfn-large-scale)); 16px fica preso ao piso cheio de 4,5:1 — e o nosso passa 7:1 |
| `line-height` prosa | **1,6** | dentro do intervalo de teste do [C21](https://www.w3.org/WAI/WCAG22/Techniques/css/C21): *"between 1.5 and 2"* |
| espaço entre parágrafos | **≥2,25em** | SC 1.4.8: *"paragraph spacing is at least 1.5 times larger than the line spacing"* → 1,5 × 1,5 |
| medida (measure) | **≤72ch**, teto rígido 80ch | SC 1.4.8: *"Width is no more than 80 characters or glyphs"* |
| alinhamento | **`left` sempre** | [F88](https://www.w3.org/WAI/WCAG22/Techniques/failures/F88) é falha documentada por justificar texto — e **não** tem escape por mecanismo |
| código | **14px / 1,5** | mono; `text.primary` sobre nível 2 |
| KaTeX display | herda 16px, `overflow-x: auto` | fórmula larga rola no próprio contêiner, nunca no `body` |

> **Atenção ao arredondamento:** o W3C escreve 18,5px para 14pt bold; o WebAIM e a
> maioria dos verificadores usam **18,67px**. Use 18,67px (ou 19px) se quiser que o
> alívio de 3:1 sobreviva à ferramenta.

### 4.3 Resiliência de espaçamento — SC 1.4.12 (AA, normativo)

O SC 1.4.12 **não** manda adotar os valores; manda **sobreviver** a eles:
*"no loss of content or functionality occurs by setting all of the following and by
changing no other style property."*

→ **Isso vira um teste de regressão**, não um token. Injetar em toda a página:

```css
* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important }
p { margin-bottom: 2em !important }
```

e afirmar que nada trunca nem sobrepõe — **na página inteira**: chips, badges, abas do
rail, gutter do CodeMirror, contadores, verdict do desafio. [F104](https://www.w3.org/WAI/WCAG22/Techniques/failures/F104)
nomeia as causas: `overflow: hidden`, posicionamento absoluto, contêiner apertado demais.

---

## 5. Movimento — dois níveis, separados por propriedade

Portado à mão do [M3 Expressive motion theming](https://m3.material.io/blog/m3-expressive-motion-theming).
O MUI v9 **não** tem `MotionScheme`; `theme.transitions` é cubic-bezier + duração. O
porte é explícito.

A regra é absoluta e é o que separa "tátil" de "piscante":

> **Espacial** (posição, tamanho, forma → `transform`/geometria) **pode** ultrapassar e
> quicar. **Efeito** (cor, opacidade) **nunca** ultrapassa.
>
> M3, verbatim: *"Spatial specs... The spring overshoots the final value and bounces
> into place."* / *"Effect specs are used to animate an object's properties such as
> color and opacity, where there shouldn't be any overshoot."*

Durações derivadas das constantes de mola publicadas (massa unitária, ω₀ = √k;
primeira chegada = π/(ω₀√(1−ζ²)); acomodação a 2% para o criticamente amortecido):

| Token | Mola de origem | Derivado | Valor CSS |
|---|---|---|---|
| `spatial.fast` | playful ζ=0,6 k=1400 | 105 ms, overshoot 9,5% | `105ms cubic-bezier(0.34, 1.56, 0.64, 1)` |
| `spatial.default` | playful ζ=0,6 k=700 | 148 ms | `150ms cubic-bezier(0.34, 1.56, 0.64, 1)` |
| `spatial.slow` | playful ζ=0,6 k=300 | 227 ms | `230ms cubic-bezier(0.34, 1.56, 0.64, 1)` |
| `effects.fast` | ζ=1,0 k=3800 | acomoda em 95 ms | `100ms cubic-bezier(0.2, 0, 0, 1)` |
| `effects.default` | ζ=1,0 k=1600 | acomoda em 146 ms | `160ms cubic-bezier(0.2, 0, 0, 1)` |
| `effects.slow` | ζ=1,0 k=800 | acomoda em 207 ms | `240ms cubic-bezier(0.2, 0, 0, 1)` |

Os tempos caem exatamente na banda de 100–270 ms de "pop". As constantes de mola são
publicadas pelo Google; **as conversões em milissegundos e o `cubic-bezier` de
aproximação são derivação/inferência minha**, não valores publicados.

**Nunca** aplique `spatial` a `background-color` ou `color` numa superfície de leitura —
é assim que o texto longo "cintila".

---

## 6. Mecânica obrigatória do MUI v9.3.1

Verificado contra a documentação **e contra o código instalado** em
`app/node_modules/@mui/material@9.3.1`. Estes não são estilo — são condições de
funcionamento.

1. **`cssVariables: { colorSchemeSelector: 'class' }` é obrigatório** para o toggle no
   app. O default é `'media'`, e com `'media'` o `setMode()` **não tem efeito nenhum** —
   o próprio MUI loga: *"The `setMode` function has no effect if `colorSchemeSelector`
   is `media`."* (`createCssVarsProvider.js:242`). ✅ Já está correto hoje — preservar.

2. **`theme.applyStyles('dark', {...})` por último no array; nunca `theme.palette.mode === 'dark' ? A : B`.**
   Sob `cssVariables`, `createThemeWithVars.js` fixa `palette` no `defaultColorScheme`
   — o ternário resolve **uma vez** e nunca reage ao toggle. Não é risco de flicker: é
   **bug permanente de galho errado**. O JSDoc de `applyStyles.js` diz literalmente:
   *"Use an array over object spread and place `theme.applyStyles()` last"*, e vale
   também dentro de `components.MuiX.styleOverrides.root`.
   Generalizando: **o esquema não-default vai na camada `applyStyles`, por último.**

3. **Trocar de esquema é barato**: o tema **não** é recalculado e a árvore **não**
   re-renderiza (é troca de classe + resolução de variável CSS), a menos que se passe
   `forceThemeRerender`. Use `disableTransitionOnChange` no `ThemeProvider` para matar a
   tempestade de transições no instante da troca.
   Precisão: o provider em si re-renderiza e todo consumidor de `useColorScheme()`
   re-renderiza — o que não acontece é recálculo de tema/árvore.

4. **Variantes novas são token de tema, não `sx` espalhado.** `components.MuiButton.styleOverrides.root.variants: [{ props: { variant: 'pop' }, style: {...} }]`,
   com ordenação **última-vence** (*"ensure that any styles that should take precedence
   are listed last"*). Exige *module augmentation*:
   ```ts
   declare module '@mui/material/Button' {
     interface ButtonPropsVariantOverrides { pop: true }
   }
   ```
   Ressalva: a ordem do resolver é `styleOverrides → themeVariants → styleFunctionSx`,
   então `sx` ainda ganha de variante de tema. A variante decide **onde o estilo mora**,
   não quem vence.

5. **Fixar `@mui/material` em 9.3.1.** Os itens 2 e 3 são comportamento de
   implementação (palette congelado, *memo pinning*, ordem do resolver), não API
   pública garantida.

---

## 7. Arquitetura de informação e layout novos

### 7.1 O que sai

O shell atual é `AppBar` + `Tabs` com 4 abas e navegação por `useState`. A
`ChallengeView` é uma pilha vertical de três `Paper` em `Grid size={12}` — enunciado,
editor, terminal+feedback — que se lê como **rolagem longa de cartões empilhados**, e
o editor CodeMirror fica **Dracula escuro fixo mesmo no tema claro**.

### 7.2 O que entra

**Navigation rail à esquerda**, substituindo as `Tabs`.
Precedente: o `NavigationSuiteScaffold` do Material 3 documenta o mapeamento —
*"Navigation bar if the width or height is compact... Navigation rail for everything
else"*. Com os *breakpoints* oficiais (compact < 600dp; medium 600–840; expanded
840–1200; large 1200–1600; extra-large ≥ 1600), uma janela Electron de desktop é
**expanded ou maior** → **rail**. A doc do componente prescreve
*"three to no more than seven app destinations when collapsed"* — temos quatro. Cabe.

**Barra superior vira quadro de estado da sessão** (padrão HOME Menu do 3DS): assunto
atual, fase da aula, tema, idioma. Fina, quieta, sempre presente, nunca dona do
conteúdo.

**Dock inferior recolhível** para terminal, resultado de teste e feedback da IA.
Precedente: [VS Code UX Guidelines — Panel](https://code.visualstudio.com/api/ux-guidelines/panel).
A doc é literal sobre o encaixe:
- *"The Panel is another area for exposing View Containers. By default, Views like the
  Terminal, Problems, and Output can be viewed in a single tab at a time in the Panel."*
- ✔️ *"Render Views in the Panel that benefit from more horizontal space"*
- ✔️ *"Use for Views that provide supporting functionality"*
- ❌ *"Use for Views that are meant to be always visible since users often minimize the Panel"*

→ terminal e saída de teste **são** funcionalidade de apoio que se beneficia de largura,
e **não** precisam estar sempre visíveis. Vão para o dock. O enunciado, que precisa
estar sempre visível, **não** vai.

E o limite de densidade da lateral vem da mesma fonte:
❌ *"Use an excessive number of Views (3-5 is a comfortable max for most screen sizes)"*.

**Paleta de comandos (Ctrl/Cmd+K)** — pular para qualquer destino, desafio ou ação pelo
teclado. É *withered technology* aplicada: padrão maduro e barato, inesperado num app de
estudo. `[INFERÊNCIA — sem evidência de eficácia verificada]`

**Modo foco** — esconde rail e quadro superior, mantém enunciado + editor.
`[INFERÊNCIA]`

### 7.3 Tela a tela

| Tela | Layout novo |
|---|---|
| **Início** | Coluna única ≤72ch. Continua sendo a tela guiada que já é (o CTA único e contextual funciona) — ganha o quadro de progresso da trilha atual e cartões de assunto com resposta espacial ao hover/press. Com matérias persistidas, a Home mostra **seções por domínio (Programação/Matemática)** com um cartão por matéria (nome + "x de y aulas"); clicar num cartão vai para a aba Aula com a matéria pré-selecionada. Se houver aula em andamento de **outra** matéria, o clique abre um **diálogo de aviso** ("não dá para trocar de matéria no meio da aula — a avaliação da aula atual é feita pela LLM") com as opções "Ir para a aula" / "Continuar na matéria atual". Estado vazio (nada persistido) mantém os chips de sugestão como onboarding. |
| **Aula** | Duas colunas: prosa ≤72ch à esquerda (níveis 0/1, `text-align: left`), trilha de fases + desafios à direita. Stepper de fase com *pop* espacial a cada fase concluída. A fase de pesquisa ganha o **checklist de pesquisa ao vivo** (sub-perguntas/queries por rodada). A aula curta termina num **input de resposta** com veredito visível (correto/parcial/incorreto + feedback) e o avanço no botão primário — ver §8. |
| **Trilha** | Aba dedicada, **uma matéria por vez** (chips no topo; inicial = matéria da sessão). Roadmap de seções por nível — **Iniciante (dificuldade 1–2) → Intermediário (3) → Avançado (4–5)** — colapsáveis, cada aula um nó `done` (✓) / `current` (a primeira pendente, destaque de acento) / `pending`. Seções vazias não aparecem. Clicar num nó abre a **lição persistida por id** na aba Aula. Somente-leitura: não publica no quadro de sessão. |
| **Desafio** | **Split-pane real**: enunciado ⟷ editor, com divisória arrastável e razão persistida. Dock inferior com abas Saída / Testes / Feedback. Fim da pilha de três `Paper`. O cabeçalho do desafio ganha **estrelas (0–3) + cronômetro** (§8.3). |
| **Configurações** | Lista de seções em coluna ≤72ch; a chave de API deixa de ser um formulário nu e vira cartão de estado com verdict. |

### 7.4 Editor e terminal seguem o tema

Hoje `draculaTheme.ts` prende CodeMirror e xterm a Dracula escuro **nos dois esquemas** —
um editor preto dentro de um app claro. O redesign troca isso por uma paleta de código
**derivada dos acentos do app, em ambas as polaridades**, compartilhada por editor e
terminal como o `draculaTheme.ts` já faz hoje.

> Isto **quebra** `tests/draculaTheme.test.ts` e `tests/e2e/e2e-dracula.spec.ts` por
> desenho. Ambos são reescritos para a paleta nova, mantendo a propriedade que
> importa: **editor e terminal pintam com a mesma fonte de verdade.**

---

## 8. A camada de resposta ("o *snap* magnético")

Quatro momentos ganham trabalho de projeto dedicado — a leitura de *kimochi-yosa*.
Todos obedecem ao guarda-corpo #1: **causados por estado real**.

1. **Pressionar ação primária** → `scale(0.97)` na entrada, volta com `spatial.fast`.
2. **Teste passou** → o painel de resultado dá um *snap* espacial; rajada curta de
   partículas; anúncio em `role="status"`; som curto **desligado por padrão**.
3. **Teste falhou** → **sem punição**. Nada de vermelho piscando, nada de som triste.
   O painel troca para estado de diagnóstico com o caso que falhou em destaque,
   `effects.default` monotônico, redação informativa.
4. **Fase da aula concluída** → *pop* espacial no ponto do stepper.

### 8.1 Contrato de acessibilidade — normativo, não opcional

| Regra | Fonte | O que implica |
|---|---|---|
| Rajada de confete **< 5 s** | [SC 2.2.2](https://www.w3.org/TR/WCAG22/#pause-stop-hide): dispara só para movimento que *"starts automatically... lasts more than five seconds... presented in parallel with other content"* | rajada curta **não** exige controle de pausa; qualquer animação **em laço** exige |
| Log de teste em streaming | 2.2.2, segundo bullet ("Auto-updating") **não tem** limiar de 5 s | saída ao vivo em paralelo com outro conteúdo precisa de pause/stop/hide ou controle de frequência |
| ≤3 transições opostas por segundo; área agregada de vermelho saturado piscante **< 21.824 px²** | [SC 2.3.1](https://www.w3.org/TR/WCAG22/#three-flashes-or-below-threshold) + limiar; 341×256 px estima o campo de 10°, e o orçamento é **25%** dele | partículas com *fade* contínuo, **nunca** alternância liga/desliga; nenhum strobe de fundo. Nota 4: *"no tool is necessary... if flashing is less than or equal to 3 flashes in any one second. Content automatically passes."* |
| `@media (prefers-reduced-motion: reduce)` desliga o confete e todo overshoot espacial | [SC 2.3.3](https://www.w3.org/TR/WCAG22/#animation-from-interactions), cujas técnicas suficientes são literalmente C39/SCR40 | **a informação passou/falhou nunca pode depender do movimento** — se depender, vira "essential" e perde-se a saída |
| Resultado anunciado por `<div role="status">` presente no DOM **antes** da atualização, **sem** mover foco | [SC 4.1.3](https://www.w3.org/TR/WCAG22/#status-messages): *"can be presented to the user by assistive technologies without receiving focus"* | resultado de rodada de teste cai na definição de *status message* do glossário |
| Som **opt-in** | — `[INFERÊNCIA]` | nunca toca sem consentimento explícito |

Níveis declarados honestamente: **2.3.3 e 1.4.8 são AAA**; 2.3.1, 2.2.2 são A;
1.4.3, 1.4.11, 1.4.12, 4.1.3 são AA.

### 8.2 Gamificação — o que a evidência manda fazer (e não fazer)

Esta era a parte de maior risco do redesign. Ela agora tem números.

**O usuário-alvo está do lado perigoso da fronteira.** O efeito de *undermining* não é
lei geral: em [Deci, Koestner & Ryan (1999), *Psychological Bulletin* 125(6):627-668](http://home.ubalt.edu/tmitch/642/Articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf)
(k=128 experimentos), ele só existe em tarefa que a pessoa **já acha interessante**
(*free-choice* d=**−0,68**, IC [−0,89, −0,47]) e **some** em tarefa chata (d=+0,18, n.s.;
Qb(1)=31,67, p<,0001). Um adulto que abre um app de estudo por vontade própria para
aprender um tema que acha interessante é exatamente o caso de d=−0,68 — **não** o
d=−0,34 médio. É o campo rival, hostil a essa literatura, que replica a mesma
moderação de forma independente (Cameron, Banko & Pierce 2001).

**O que aumenta motivação intrínseca:**

| Mecanismo | Efeito | Escopo |
|---|---|---|
| Feedback verbal **informacional** vs. nenhum feedback | **d = +0,66** (IC 0,28–1,03) | o par mais específico sobre mecanismo |
| Feedback verbal positivo (agregado), *free-choice* | d = +0,33 (IC 0,18–0,43; k=21) | — |
| ...**em universitários/adultos** | **d = +0,43** (IC 0,27–0,58) | nulo em crianças (d=0,11); o moderador de idade **reforça** a aplicação aqui |

**O que reduz — inclusive coisas que parecem inofensivas:**

| Mecanismo | Efeito | Nota |
|---|---|---|
| Elogio **controlador** vs. informacional | **d = −0,78** (IC −1,02, −0,54) | metade robusta |
| Elogio **esperado / ritualizado** (avaliação antecipada + feedback positivo) | **d = −0,40** (IC −0,71, −0,09) | *"expected verbal rewards may undermine intrinsic motivation just as expected tangible rewards do"* |
| Recompensa tangível contingente a **engajar** | d = −0,40 (IC −0,48, −0,32) | — |
| Recompensa tangível contingente a **completar** | d = −0,36 (IC −0,50, −0,22) | — |
| Elogio controlador vs. **nenhum** feedback | d = −0,44 (IC −0,82, −0,07) | **frágil: k=3, e 2 dos 3 estudos são nulos/positivos** — não use como manchete |

→ **Um "Parabéns!" determinístico a cada suíte verde é o caso de d = −0,40**, não o caso
de onde vem o d = +0,43. E qualquer redação prescritiva/avaliativa — *"você está no
ritmo certo"*, *"continue assim"* — é o caso controlador.

**Neutro (comprovadamente sem efeito):** recompensa tangível **inesperada**
(d=0,01, IC −0,20–0,22) e **não-contingente** à tarefa (d=−0,14, IC −0,39–0,11). Mas os
próprios autores alertam: *"people may begin to expect the 'unexpected' rewards if they
are given very often"* — surpresa recorrente deixa de ser surpresa.

**Gamificação agregada é modesta, e a parte motivacional não é robusta.**
[Sailer & Homner (2020), *Educational Psychology Review* 32:77-112](https://link.springer.com/article/10.1007/s10648-019-09498-w)
(open access, conferido linha a linha): cognitivo g=,49 [0,30–0,69]; motivacional
g=,36 [0,18–0,54]; comportamental g=,25 [0,04–0,46]. **No recorte de alto rigor
metodológico** (só experimental/quasi com pré e pós-teste), **só o cognitivo
sobrevive**: g=,42 [0,14–0,68] — enquanto motivacional cai para g=,22 **[−0,11, 0,56]**
e comportamental para g=,27 **[−0,16, 0,70]**. Palavra dos autores: *"summary effects of
gamification on motivational and behavioral learning outcomes are not robust."* E
**competição pura fica em g = −,09** [−0,32, 0,14].
Bai, Hew & Huang (2020) chegam a g=0,504 [0,284–0,723] em corpus independente — mas
esse número é **desempenho acadêmico**, não motivação, e mede **combinações** de
elementos, não badge/ponto/streak isolado. Citá-lo como evidência de motivação é
miscitação.

**Streaks: zero evidência.** Nenhuma das três rodadas produziu um único paper sobre
streaks; `grep` no texto completo de Sailer & Homner não retorna análise de streak, e
"streak" não aparece em nenhum dos 115 contextos de citação de Bai/Hew/Huang. O
raciocínio legítimo mais próximo é indireto e desfavorável: **um streak é uma
recompensa esperada e contingente ao engajamento diário — a categoria com o maior
undermining medido (d=−0,40), aplicada a um usuário numa tarefa que ele já acha
interessante (d=−0,68).**

**Leaderboard:** a única evidência que chegou (Bai, Hew, Sailer & Jia 2021) tem N=24 e
N=26, ~8 pessoas por célula, sem randomização e sem controle — e seus dois resultados
substantivos foram **refutados 0-3** na verificação. Base fraca demais para decidir
qualquer coisa.

#### Decisão de projeto

| Não fazer | Fazer |
|---|---|
| XP, pontos, moedas | Progresso **informacional**: o que da trilha já foi feito |
| Streak diário / "não perca sua sequência" | Retomada sem culpa: *"você parou em X"* |
| Placar, ranking, comparação | Comparação só **consigo mesmo**, e só quando pedida |
| Badge por assiduidade | Verdict por desafio, ligado à competência específica |
| "Parabéns!" fixo a cada teste verde | Feedback **variado e específico**: qual conceito o teste que passou demonstra |
| "Continue assim, você está no ritmo" | Descrição neutra do estado, sem prescrição |

O ganho de d=+0,43 vem de **informação sobre a competência adquirida**, entregue de
forma **não-ritualizada**. Esse é o único mecanismo motivacional que este redesign
usa — e é, não por acaso, o mesmo que o *kimochi-yosa* pede: o valor está na qualidade
da resposta ao ato, não num prêmio pendurado nele.

> **Ressalvas honestas.** Toda essa base é de laboratório, paradigma *free-choice*,
> núcleo de 1999–2001, e **nenhuma medida foi feita em software real** — a transferência
> para uma UI é raciocínio por analogia. O debate Deci/Ryan × Cameron/Pierce **não
> está resolvido** (Cerasoli et al. 2014, k=183, N=212.468, ainda descreve o campo como
> "the debate"). A célula *performance-contingent* (d=−0,28) é o ponto exato de
> discordância frontal entre os campos — não a cite como pacificada.

### 8.3 Estrelas e cronômetro no desafio — requisito do dono (implementado na onda R7)

Requisito **explícito do dono do produto**, implementado em `src/lib/challengeStars.ts`
(máquina pura) + `src/lib/confetti.ts` (rajada) + `ChallengeView`. Não é
gamificação nova: a tabela de decisão acima proíbe XP/pontos/streak/leaderboard —
as estrelas são o **verdict por desafio quantificado** ("ligado à competência
específica", linha *Fazer*), não uma moeda acumulável.

| Regra do dono | Detalhe |
|---|---|
| Estado inicial | **3 estrelas** por desafio (reset ao trocar de desafio) |
| Causas de perda (cada uma no máximo 1×, saldo nunca < 0) | janela perdeu o foco (`blur`/`visibilitychange`); tempo esgotou antes de concluir; teste determinístico falhou; **decaimento por velocidade** — `elapsed ≥ 60%` do limite custa 1, `≥ 85%` custa outra |
| Limite de tempo | `T = 90s + difficulty × 60s` (dificuldade 1..5 → 2min30s a 6min30s); sem `difficulty` exposta, **T = 300s** (fallback documentado em `timeLimitForDifficulty`) |
| Confete em PASS | rajada curta causada por estado real (teste verde); **sem "Parabéns!" ritualizado** — o feedback específico do provedor é o anúncio (ver decisão d = −0,40 acima) |
| Perda anunciada | cada causa de perda anuncia em pt-BR via `role="status"` (a perda por teste falho é coberta pelo anúncio do resultado do teste) |

**Conformidade com o contrato de a11y do §8.1 (mantido intacto):** a rajada
dura < 5 s (SC 2.2.2), partículas com fade contínuo sem strobe (SC 2.3.1),
`prefers-reduced-motion: reduce` desliga a animação e o resultado nunca depende
do movimento (SC 2.3.3), o anúncio usa `role="status"` presente no DOM antes da
atualização (SC 4.1.3) e som fica opt-in (omitido). O timing do veredito/estrelas
é o do §8: o painel dá o *snap* espacial e o anúncio acontece sem mover foco.

---

## 9. Contratos existentes que este redesign quebra

Todos precisam ser **atualizados junto**, na mesma onda que muda o visual — nunca
deixados vermelhos.

| Arquivo | O que trava | Ação |
|---|---|---|
| `tests/theme.test.ts` | hex literais Dracula + `#1565c0`, `borderRadius: 8`, `fontSize: 14` | reescrever para os tokens novos, mantendo os testes de **contraste calculado** (que já existem e são bons) |
| `tests/e2e/e2e-theme.spec.ts` | `rgb(21,101,192)`, `rgb(47,49,66)`, `rgb(255,255,255)`, `rgb(40,42,54)` | reescrever para os RGB novos |
| `tests/draculaTheme.test.ts`, `tests/e2e/e2e-dracula.spec.ts` | paleta Dracula fixa | reescrever para a paleta de código nova, bi-polar |
| `src/lib/shellNav.ts` + `tests/shellNav.test.ts` | `NAV_ITEMS` como permutação contígua para `Tabs value` | rail usa a mesma lista; a invariante de contiguidade continua valendo |
| `onboardingTargets.ts` + `stepTargetPresence.test.ts` | `app-title`, `theme-toggle`, `language-switcher`, `nav-tabs`, `settings-keys-section`, `lesson-subject`, `challenge-editor`, `challenge-terminal`, `challenge-test-answer` | **preservar todos os `data-onboarding-target`** nos elementos equivalentes do layout novo (`nav-tabs` passa a marcar o rail) |
| `src/i18n/locales/{pt-BR,en}/translation.json` | `strictKeyChecks` | toda string nova precisa do par pt-BR/en |
| `src/index.css` | tokens CSS paralelos (`--bg`, `--panel`, `--accent`…) que não conversam com o MUI | **eliminar a duplicação**: as variáveis passam a derivar das CSS vars do tema |

Suíte a manter verde: **75 testes unitários + 17 specs e2e**.

---

## 10. Novos testes que o redesign deve trazer

1. **Contraste**: para cada par (tinta × nível de superfície) nos **dois** esquemas,
   assertar o piso — 7:1 para corpo nos níveis 0/1, 4,5:1 no restante, 3:1 para a
   camada não-texto. O `tests/theme.test.ts` de hoje já calcula contraste; estender.
2. **Red flash**: assertar `R/(R+G+B) < 0.8` para toda cor que participe de animação.
3. **Resiliência 1.4.12**: injetar o CSS de override e assertar ausência de
   truncamento/sobreposição na página inteira.
4. **`applyStyles` em vez de `palette.mode`**: teste estático que falha se
   `palette.mode ===` aparecer em `src/`.
5. **Motion**: assertar que nenhum token `spatial` é aplicado a `color`,
   `background-color` ou `opacity`.
6. **`prefers-reduced-motion`**: e2e que liga a preferência e assere que o resultado do
   teste continua legível **sem** movimento.
7. **Medida**: e2e que assere que a coluna de prosa não passa de 80ch e que
   `text-align` nunca é `justify`.

---

## 11. Fontes

**Nintendo (primária declarada)** — Iwata Asks Wii Hardware "A Design For Everyone";
Ask the Developer Vol. 16 (Switch 2, partes com *kimochi-yosa* e nota 14 de Yokoi);
Iwata Asks 3DS HOME Menu.
**Contra-evidência de design** — GDC Europe 2014, Folmer Kelly, *Don't Juice It or Lose It*.
**MUI** — docs de CSS theme variables (configuration/usage), dark mode, theme components;
e o código instalado (`prepareCssVars.js`, `createCssVarsProvider.js`, `applyStyles.js`,
`createThemeWithVars.js`, `createStyled.js`, `variants.d.ts`).
**Material 3** — *M3 Expressive motion theming*; `MotionScheme.kt`,
`ExpressiveMotionTokens.kt`, `StandardMotionTokens.kt` do androidx; docs de window size
classes e adaptive navigation; `NavigationRail.md` do material-components-android.
**W3C/WAI** — WCAG 2.2 (Rec. 12-dez-2024) SC 1.4.3, 1.4.6, 1.4.8, 1.4.11, 1.4.12,
2.2.2, 2.3.1, 2.3.3, 4.1.3, CR5; Understanding e Techniques C20, C21, C36, C39,
F24, F88, F104; glossário de *large scale text* e *contrast ratio*.
**VS Code** — UX Guidelines: overview, panel, sidebars, activity-bar, views.
**Motivação e gamificação** — Deci, Koestner & Ryan (1999) *Psychological Bulletin*
125(6):627-668 (PDF primário, conferido caractere a caractere); Cameron, Banko & Pierce
(2001) *The Behavior Analyst* 24:1-44 (fonte hostil, corrobora o sinal do feedback
verbal); Cerasoli, Nicklin & Ford (2014) *Psychological Bulletin* 140(4):980-1008;
Sailer & Homner (2020) *Educational Psychology Review* 32:77-112 (open access);
Bai, Hew & Huang (2020) *Educational Research Review* 30:100322;
Patall, Cooper & Robinson (2008) *Psychological Bulletin* 134(2):270-300 (só direção do
moderador — full text fechado); Bai, Hew, Sailer & Jia (2021) *Computers & Education*
173:104297 (base fraca; resultados substantivos refutados na verificação).
**Legibilidade** — Buchner, Mayr & Brandt (2009) *Ergonomics* 52(7):882-886;
Piepenbrock, Mayr & Buchner (2014) *Human Factors* e *Ergonomics*;
Dobres, Chahine & Reimer (2017) *Applied Ergonomics*; Wagner et al. (2023)
*Scientific Reports*; Mathôt & Ivanov (2019) *PeerJ*.
