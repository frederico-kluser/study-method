# Prompt da Logo do Study Method — Nano Banana 2

> Este documento contém **UM prompt pronto para colar** no **Nano Banana 2**
> (modelo de geração de imagem que roda na plataforma **fal.ai**) para criar a
> **logo** do Study Method. O prompt é o entregável — **não geramos a imagem
> aqui** (sem GPU); você cola o prompt e ajusta o que o modelo errar conforme a
> seção [Como usar](#como-usar).
>
> Tudo abaixo é escrito em **português brasileiro** (o produto é pt-BR), com os
> termos técnicos de geração em **inglês** entre parênteses onde ajudam o modelo.

---

## 1. O que é o Study Method (para o modelo entender o produto)

O **Study Method** é um **tutor de programação** que roda **no computador do
usuário**. Tudo acontece localmente: um **LLM local** (modelo de linguagem que
roda on-device, sem nuvem) escreve **aulas**, pede para você **resolver
desafios** com **testes automáticos**, e dá **feedback** na sua solução. A GUI é
desktop (Electron): tem **editor de código**, **terminal**, **abas** de
Início/Configurações/Aula/Desafio e um **onboarding amigável** que ensina o app
no primeiro uso. O idioma é o **português brasileiro**. A identidade é a de um
produto **moderno, dark-first, focado em código** — educacional, mas com cara de
ferramenta de desenvolvedor (developer tool), não de brinquedo colorido.

## 2. Identidade visual (design tokens)

Use estas mesmas cores nos textos e no markdown; o prompt já as referencia.

- **Primary / acento (dark):** `#4f8cff` (azul vibrante do tema escuro).
- **Primary (light):** `#1565c0` (azul escuro legível no tema claro — WCAG AA).
- **Ciano Dracula / accent secundário:** `#8be9fd` (ciano oficial do tema
  **Dracula** usado no editor e terminal; combina com o azul do app).
- **Fundo escuro (dark):** próximo de `#121212` (MUI dark) / `#0f1115`.
- **Fundo do editor (Dracula):** `#282a36` (quando o fundo for o do editor).
- **Texto (dark):** `#f8f8f2` (foreground do Dracula).
- **Comentário/muted do Dracula:** `#6272a4`.

Paleta resultante para a logo: **azul ciano** (`#4f8cff → #8be9fd`) sobre fundo
**dark** (`#121212` / `#0f1115`), com um toque de **roxo Dracula** (`#bd93f9`) se
ajudar no balanceamento — mas sempre subordinado ao azul.

## 3. Referências de estilo (fazer)

Pense em logos modernas de **app icon / logo mark** de ferramentas de
desenvolvedor e **educação técnica** que usam **dark theme** e **um acento
brilhante**:

- **um único símbolo** (single mark) geométrico e memorável;
- **vetorial** (vector), **flat com gradiente sutil** (flat with subtle
  gradient) — sem 3D, sem sombras exageradas;
- **áreas sólidas e contorno** (solid shapes + outline) que leiam bem em
  tamanho pequeno;
- sem raio/brilho, sem textura, sem ruído.

## 4. Ideia conceitual (o que o mark deve evocar)

O símbolo deve fundir **linguagem de programação** com **aprendizado guiado por
teste**. Sugestão que traduz bem a marca:

> Um **marca em forma de cursor/quebra-chave/half-bracket** de código
> (`{`/`}`) com um **símbolo de "check" (✓) ou "play"** integrado no vão,
> composto por **formas geométricas simples** — sugerindo "você escreve código
> e um teste confirma que acertou". Um gradiente ciano→azul no preenchimento
> comunica "mark do desenvolvedor moderno em dark theme".

Se quiser variante de ícone mais abstrata: um **hexágono/circuito** com uma
**lâmpada** (aprender) ou um **terminal** estilizado. O prompt abaixo usa a ideia
de "código + validação por teste", mas você pode trocar a linha de conceito.

---

## 5. O prompt (cola exatamente isto)

> **Atenção:** o placeholder a resolver antes de colar. Substitua `{COR_CAPA}` pelo valor de fundo
> conforme a variação que escolher (ver §6). O prompt está em pt-BR com termos
> técnicos em inglês — o Nano Banana 2 entende bem ambos; os termos em inglês
> são os que controlam a sintaxe visual (flat, vector, gradient, etc.).

```
Design a logo for "Study Method", a desktop programming tutor app that runs a
local LLM and teaches through test-driven challenges (imagine a modern dark-theme
developer tool: code editor, terminal, friendly onboarding, Brazilian Portuguese UI).

Style: minimalist modern app icon / logo mark, flat vector with subtle gradient,
no 3D, no heavy shadows, no photorealism, no texture, no noise. Clean geometric
shapes with solid fills and clean outlines — readable even at 16px.

Concept: fuse a curly-brace bracket `{}` (programming code) with a
"checkmark" or "play" symbol, forming a simple memorable mark that suggests
"you write code and a test confirms it passed". Use simple geometry — hint of a
terminal cursor or half-bracket combined with a check.

Colors: primary azure accent #4f8cff to cyan #8be9fd (subtle gradient on the
filled shape), with the Dracula purple #bd93f9 as a tiny supporting accent if
balanced. No other colors. {COR_CAPA}

Composition: ONE centered logo mark AND optional simple wordmark "Study Method"
below it in clean modern sans-serif (no small text, no subtext, no tagline, no
third-party branding, no letters or glyphs that break the shape).

Output specs: square 1024x1024, logo centered with generous margin, either a
transparent background (preferred, for app icon) or the flat dark background
{COR_CAPA}; single cohesive image, no watermark, no border, no frame.
```

### Prompt sem placeholders (cópia pronta, fundo dark `#121212`)

Se preferir já com tudo resolvido, cole esta versão (fundo **dark** `#121212`):

```
Design a logo for "Study Method", a desktop programming tutor app that runs a
local LLM and teaches through test-driven challenges (modern dark-theme
developer tool: code editor, terminal, friendly onboarding, Brazilian
Portuguese UI).

Style: minimalist modern app icon / logo mark, flat vector with subtle gradient,
no 3D, no heavy shadows, no photorealism, no texture, no noise. Clean geometric
shapes, solid fills and clean outlines — readable even at 16px.

Concept: fuse a curly bracket `{}` (programming code) with a "checkmark" or
"play" symbol in one simple memorable mark suggesting "you write code and a test
confirms it passed". Simple geometry, hint of terminal cursor / half-bracket.

Colors: azure #4f8cff to cyan #8be9fd subtle gradient on the filled shape, with
Dracula purple #bd93f9 as tiny supporting accent if balanced. On a flat dark
background #121212, with the mark filled in the azure-to-cyan gradient. No other
colors.

Composition: ONE centered logo mark plus optional clean modern sans-serif
wordmark "Study Method" below it (no small text, no subtext, no tagline, no
third-party branding).

Output: square 1024x1024, logo centered with generous margin, flat dark
background #121212, single cohesive image, no watermark, no border, no frame.
```

---

## 6. Variações sugeridas (rode o prompt em cada uma)

O mesmo prompt fecha três variantes — troque apenas a **linha de composição** e o
`{COR_CAPA}`. As três cobrem ícone somente, ícone + wordmark e versão mono:

### Variação A — Ícone somente (logomark, uso como app icon / favicon)

- **Composição:** só o mark central, sem texto.
- **Fundo:** transparente (preferred) **ou** dark `#121212` sólido.
- **Uso:** ícone do app, favicon, aba, tile.

### Variação B — Com wordmark (logotipo completo)

- **Composição:** mark central + wordmark **"Study Method"** logo abaixo, em
  sans-serif moderna e limpa.
- **Fundo:** dark `#121212` sólido (o fundo transparente com texto costuma ficar
  sujo).
- **Uso:** tela de login/splash, header do site, docs.

### Variação C — Mono (monochrome)

- **Composição:** o mark em **uma única cor sólida** (sem gradiente) — idealmente
  `#8be9fd` (ciano) sobre dark, ou branco sobre dark, para documentos/estampas.
- **Fundo:** dark `#0f1115` ou transparente.
- **Uso:** watermark, tom de contraste em doc, mark em preto-e-branco.

> **Dica:** rode A primeiro; se o modelo devolver só a variação A, não reescreva
> o prompt — troque a linha de **Composição** pelo texto da variação desejada e
> rode de novo. O modelo respeita mais "composição" do que "e também".

---

## 7. Como usar

### 7.1 Onde colar

1. Acesse o **Nano Banana 2** na plataforma **fal.ai** (procure "Nano Banana /
   Nano Banana 2" na lista de modelos de imagem da fal).
2. No campo de **prompt / text prompt**, cole o prompt da seção [§5 com
   placeholders](#5-o-prompt-cola-exatamente-isto) (e defina `{COR_CAPA}`), ou a
   **versão pronta** (fundo dark).
3. Configure os parâmetros de geração que a fal/Nano Banana 2 expor:
   - **Tamanho (size / aspect ratio):** quadrado **1024×1024** (1:1) para a
     logo/app icon. Evite proporções 16:9 para logo.
   - **Formato de saída (output_format):** **PNG** (com transparência quando o
     modelo oferecer/aceitar) ou **WebP**; se pedir **transparente** e o modelo
     não retornar alfa, faça pós-processamento (ver §7.3).
   - **Seed / número de imagens:** gere 3–4 seeds para escolher; o mesmo prompt
     com um novo seed dá variações só de composição/micro-detalhe.
4. Clique em **generate** e espere. Baixe a imagem quando sair.

> Plataforma: **fal.ai** nesse contexto é a via de execução (API/backend); se a
> UI atual do Nano Banana 2 estiver em outro lugar (ex.: fal.ai web app /
> playground de imagem), o fluxo é o mesmo: modelo → text prompt → output specs →
> download.

### 7.2 O que ajustar se sair errado

- **Tem texto pequeno/ilegível ou glifos quebrados** → reforçar "no small text,
  no subtext", trocar para **Variação A (só ícone)**, ou pedir wordmark no prompt
  separado. Modelos de imagem ainda erram palavras — se "Study Method" sair
  borrado, use a variante só-ícone ou a mono e compose o texto vetorial depois.
- **Tem 3D/sombras pesadas/brilho** → reforçar "flat vector, no 3D, no heavy
  shadows, no glow".
- **Ficou colorido demais (roxo dominando, outras cores)** → reforçar "only
  #4f8cff / #8be9fd with a tiny #bd93f9 accent, no other colors".
- **Pediu fundo transparente e saiu com fundo sólido branco/preto** → modelos
  de imagem **em geral não dão alfa de verdade** (geram uma imagem raster
  opaca). Pós-processe: remova o fundo no seu editor (Inkscape/GIMP/rembg) ou
  peça explicitamente um **fundo dark sólido** (`#121212`) e use como está —
  para app icon é mais confiável pedir fundo dark uniforme.
- **O mark sumiu/quebrou / composição bagunçada** → muita composição numa área
  pequena; simplifique o conceito (só o bracket + check) e rode a Variação A.
- **Quer leve mudança só de cor/degradê** → mantenha o prompt, ajuste só os
  hex do "Colors:" e rode de novo (não reescreva o resto).
- **Quer o mesmo mark em outra fundo** → troque `{COR_CAPA}`/a linha de fundo e
  rode de novo; ou gere o mark transparente e re-colha.

### 7.3 Pós-processamento (se precisar de fundo transparente de verdade)

O Nano Banana 2 retorna raster (opaco). Para um **PNG com alfa real**:

1. Gere com fundo **dark sólido e uniforme** (`#121212`) fácil de recortar.
2. No editor, selecione o fundo por **cor (magic selection / select by color)**
   e apague; ou use **rembg / remove.bg** conservadoramente.
3. Confira a borda do gradiente ciano→azul (não deixe halo/halo branco).
4. Exporte PNG 1024×1024 (ou a resolução que precisar).

---

## 8. Checklist antes de considerar "entregue"

- [ ] Coletei o prompt (versão com placeholders **e** versão pronta) no Nano
      Banana 2.
- [ ] Gerei ao menos uma variante em **1024×1024**.
- [ ] **Single mark** legível em **16px** (teste: encolha para 16px e veja se as
      formas continuam claras — azul/ciano com contraste sobre dark).
- [ ] Sem texto pequeno/ilegível, sem branding de terceiros.
- [ ] Paleta: azul `#4f8cff` → ciano `#8be9fd`, acento roxo `#bd93f9` no máximo
      discreto, fundo dark.
- [ ] Gerei as variantes A (ícone), B (com wordmark "Study Method") e C (mono
      cyan) se quiser o pacote completo.
- [ ] No arquivo final, se quiser alfa: pós-processei o fundo (rembg/editor).