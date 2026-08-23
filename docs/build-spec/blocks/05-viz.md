# Parte 5 — Visualização: como o aluno VÊ o que está aprendendo

## Sumário da Parte 5

Matemática é ensinada **escrevendo código**, e o resultado precisa aparecer — o renderizador é peça
de arquitetura, não enfeite. Este bloco transcreve por que o default é um emissor de SVG em
**biblioteca padrão pura** (as bibliotecas de plotagem não existem nesta máquina e o PEP 668 bloqueia
instalá-las), o protocolo das **4 saídas obrigatórias** — arquivo, HTML autocontido, ASCII/braille e
**descrição textual computada** —, o contrato completo de `render-plot.py` (CLI, spec campo a campo,
JSON de stdout, exit codes), os quatro bugs que o protótipo encontrou e a regra que cada um virou, as
regras de acessibilidade, e o que fica declaradamente fora do prometido.

---

## 5.0 O que envelhece aqui

Toda a §5.1 é uma medição de ambiente feita em **2026-08-23, nesta máquina**. Se o inventário mudar —
matplotlib instalado, `rsvg-convert` removido —, a decisão D2 precisa ser reavaliada, não a
implementação.

| Item | Valor |
|---|---|
| Artefato | `SK/scripts/render-plot.py` — **1 351 linhas**, Python 3.9+ |
| Interpretador verificado | Python 3.14.7 |
| Rasterizador verificado | `rsvg-convert` (librsvg 2.62.3) · `magick`/`convert` (ImageMagick 7.1.2-29) |
| Schema da entrada | `SK/assets/schemas/plot-spec.schema.json` (`urn:study-method:schema:plot-spec:1`) |
| Autoridade | `docs/00-contratos.md` §5.2 (exceção nomeada), §9.6 (VIZ-1..VIZ-6) · racional em `docs/06-visualizacao.md` |

Imports permitidos, e a lista é fechada: `argparse`, `html`, `json`, `math`, `os`, `shutil`,
`subprocess`, `sys`, `xml.etree.ElementTree`. **Nenhum import de terceiro. Nenhum `try: import
numpy`.** Se um `import` externo aparecer no arquivo, **o arquivo está errado**.

---

## 5.1 O pedido, e por que ele força biblioteca padrão pura

### 5.1.1 O pedido literal

> "tudo que for ensinado, tanto programação quanto matemática, pode ser feito com código de
> programação; por mais que a matemática não seja programação, vamos usar programação para
> aprendê-la, e nesse sentido iremos utilizar renderizador de gráficos; o usuário poderá escolher a
> linguagem que ele queira para a aula"

Três exigências independentes:

| # | Exigência | Consequência |
|---|---|---|
| 1 | **Matemática é ensinada escrevendo código** | não é "código ilustrando matemática" — é o aluno implementando a definição e vendo o resultado. Derivada vira `(f(x+h)-f(x-h))/(2h)` num arquivo que roda |
| 2 | **Existe um renderizador de gráficos** | não é opcional nem eventual: é peça de arquitetura, com contrato próprio |
| 3 | **A linguagem é escolha do aluno** | o renderizador **não pode ser refém da linguagem da aula** |

⭐ **A exigência 3 mata o design óbvio.** Se o gráfico nasce da linguagem da aula, uma aula de Lua não
tem gráfico (Lua não tem biblioteca de plotagem madura), e "escolher a linguagem" vira "escolher entre
as linguagens que têm biblioteca de plot instalada" — que é escolha nenhuma.

> **D1 — o renderizador é ortogonal à linguagem da aula.** A linguagem da aula escolhe como o aluno
> *calcula*; o renderizador escolhe como o resultado *aparece*. O contrato entre os dois é **um
> arquivo de dados (JSON)**, não uma API.

### 5.1.2 ⭐ A descoberta que mudou o default

O caminho recomendado pela pesquisa (matplotlib como default, `gnuplot` como fallback universal,
Graphviz para diagramas) **não existe nesta máquina**. Verificado por execução:

| Componente | Status | Consequência |
|---|---|---|
| `matplotlib` | **ausente** | o default da pesquisa não roda |
| `plotext` | **ausente** | o fallback ASCII da pesquisa não roda |
| `numpy`, `PIL`, `pytest`, `PyYAML` | **ausentes** | nenhuma dependência Python de terceiros disponível |
| `gnuplot` | **ausente** | o fallback universal de shell-out não roda |
| `dot` (Graphviz) | **ausente** | árvore de chamadas e diagrama de estrutura via Graphviz não rodam |
| `/usr/lib/python3.14/EXTERNALLY-MANAGED` | **existe** | **PEP 668**: `pip install` no Python do sistema **falha** |

**PEP 668 em uma linha**: o Python do sistema é gerenciado pelo pacote da distro, então `pip install`
fora de um ambiente virtual é recusado com `externally-managed-environment` para não brigar com o
`pacman` — a saída correta é `python3 -m venv`, **nunca** `--break-system-packages`.

Ou seja: o caminho recomendado **e o fallback dele** exigem instalação. **Um tutor cujo primeiro passo
é "instale três pacotes" perde o aluno antes da primeira aula.**

⭐ **O que existe, e é o que salvou a saída em imagem** (verificado por execução):

| Componente | Versão | Para que serve aqui |
|---|---|---|
| `rsvg-convert` | librsvg 2.62.3 (`/usr/bin`) | **SVG → PNG sem instalar nada** |
| `magick` / `convert` | ImageMagick 7.1.2-29, delegate `rsvg` embutido | segunda rota SVG → PNG |
| `xdg-open` | presente | abrir o HTML no navegador do aluno |
| Python 3.14.7 | stdlib completa | `json`, `math`, `xml`, `argparse`, `html` — tudo que um emissor de SVG precisa |

**Os conversores de SVG estão presentes**, e é isso que reabre a saída raster: gerar um `.svg`
manualmente como string (linhas, círculos, texto — SVG é só XML) não depende de nenhuma lib de
plotagem, e com `rsvg-convert` presente esse caminho **não para no SVG: chega ao PNG**.

> **D2 — o renderizador padrão é um emissor de SVG em biblioteca padrão pura, zero import externo.**
> Bibliotecas de plotagem são *upgrade opcional*, **nunca pré-requisito** (VIZ-5).

Isso não é escolha de pobreza. É a única escolha que satisfaz simultaneamente: "funciona na primeira
sessão", "funciona em qualquer máquina com Python", "funciona para todas as linguagens da aula", e
"não pede permissão de instalação para desenhar uma parábola".

---

## 5.2 ⭐ As 4 saídas obrigatórias

Toda visualização produz **quatro** artefatos. Não são alternativas entre as quais o tutor escolhe —
são quatro canais que cobrem **quatro falhas diferentes**.

| Saída | Arquivo | Cobre a falha |
|---|---|---|
| **(a)** vetorial salvo | `<base>.svg` (+ `<base>.png` quando há rasterizador) | "a sessão acabou e o aluno quer rever / colar no caderno" |
| **(b)** HTML autocontido | `<base>.html` | "PNG não dá para selecionar texto nem ampliar sem borrar, e o aluno não tem visualizador de SVG configurado" — **todo SO abre HTML** |
| **(c)** ASCII/braille | `<base>.txt` | "o aluno está em SSH puro, ou não vai sair do terminal, ou quer a forma da curva **agora**, dentro da conversa" |
| **(d)** descrição textual | `<base>.md` **e o stdout do renderizador** | três leitores distintos — §5.2.4 |

> **A regra que amarra as quatro (VIZ-1)**: nenhuma visualização é considerada entregue com menos de
> **(a) + (b) + (d)**. **(c)** é obrigatório como **arquivo** e opcional como impressão no chat.

### 5.2.1 (a) O arquivo vetorial

SVG porque é **texto** (o próprio modelo pode reler e verificar o que gerou), escala sem borrar, e não
precisa de biblioteca para nascer. PNG derivado via `rsvg-convert -w <2×largura> -o <png> <svg>`, com
`magick -density 192` como segunda opção e **omissão registrada em `warnings`** se nenhum existir.
**PNG nunca é obrigatório; SVG é.**

O SVG standalone carrega `xmlns`, `viewBox`, `role="img"`, `<title>`, `<desc>` (a descrição textual
inteira) e **fundo branco explícito como primeiro elemento** — SVG transparente desaparece em tema
escuro.

### 5.2.2 (b) O HTML autocontido

O SVG **inline** dentro de um HTML de arquivo único: **zero `<script src>`, zero `<link>`, zero CDN,
zero fonte remota**. Funciona por duplo clique, por `xdg-open`, em SSH sem port-forward, em container
sem rede, offline.

Contém, **nesta ordem**: título · a figura · a legenda · **a descrição textual (d) visível como texto
do documento** (não escondida em atributo) · um `<details>` recolhido com o ASCII · um `<details>`
recolhido com o dump JSON dos pontos (máx. **2 000 por série**, com marca `truncated`).

Duas escolhas de implementação que o contrato fixa:

| Escolha | Razão |
|---|---|
| O SVG **inline** é emitido **sem** o atributo `xmlns` | o parser de HTML já atribui o namespace, e assim o documento **não contém sequer a string de um esquema de URL** |
| Tema claro/escuro por `prefers-color-scheme`, com o painel da figura **sempre** em fundo claro | o SVG é desenhado com fundo branco explícito; painel escuro sob figura clara é ilegível |

**[VERIFICADO]**: `http(s)`, `src=`, `href=`, `<script`, `<link`, `@import`, `url()` externa —
**0 ocorrências** em todos os HTML gerados.

### 5.2.3 (c) O fallback ASCII/braille

Desenho em braille Unicode (U+2800–U+28FF), **2×4 subpixels por célula** — 8× a resolução de ASCII
puro no mesmo espaço. Sem dependência: é aritmética de bitmask sobre `chr(0x2800 + máscara)`.

⭐ **O layout de bits, [VERIFICADO por execução].** Sem esta tabela o fallback erra de um jeito difícil
de perceber: a numeração histórica dos pontos do braille **não** é a ordem de leitura da grade. Os
pontos 7 e 8 foram acrescentados depois (braille de 8 pontos) e ocupam os **bits mais altos**, apesar
de ficarem na **última linha**. Quem assumir "linha 3 = bits 6 e 7 na ordem natural" acerta por
acidente na coluna 0 e **erra na coluna 1**.

| | coluna 0 | coluna 1 |
|---|---|---|
| **linha 0** | ponto 1 — `0x01` | ponto 4 — `0x08` |
| **linha 1** | ponto 2 — `0x02` | ponto 5 — `0x10` |
| **linha 2** | ponto 3 — `0x04` | ponto 6 — `0x20` |
| **linha 3** | ponto 7 — **`0x40`** | ponto 8 — **`0x80`** |

```python
BIT = {(0,0): 0x01, (1,0): 0x02, (2,0): 0x04, (3,0): 0x40,
       (0,1): 0x08, (1,1): 0x10, (2,1): 0x20, (3,1): 0x80}
celula = chr(0x2800 + soma_dos_bits_acesos)
```

Confirmado nome a nome contra o Unicode: `chr(0x2800 + 0x40)` é `U+2840 BRAILLE PATTERN DOTS-7` e
`chr(0x2800 + 0x80)` é `U+2880 BRAILLE PATTERN DOTS-8`.

⭐ **O fundo é preenchido com `U+2800` (BRAILLE PATTERN BLANK), não com espaço** — o blank tem largura
de caractere e mantém as colunas alinhadas; espaço **desalinha a figura em fonte proporcional**.
Máscara `0xFF` é `⣿`.

Segmentos por **Bresenham** com coordenadas recortadas **antes** do laço; `scatter` marca ponto a
ponto. O `.txt` traz título, moldura, extremos dos eixos, a legenda com um marcador ASCII por série,
**a nota de que braille mostra forma e não valor**, e o `takeaway`.

**Limite honesto**: braille mostra **forma**, não **valor**. Scatter denso vira mancha; múltiplas
séries se confundem; não há cor. Serve para "crescente/oscilante/tem um pico aqui", **não** para
"vale 3,47 em x=2".

### 5.2.4 ⭐ (d) A descrição textual — e por que ela não é opcional

Ela serve a **três leitores distintos**, e por isso é obrigatória mesmo quando as outras três
funcionaram:

| # | Leitor | Sem (d) |
|---|---|---|
| 1 | **O aluno com deficiência visual** | leitor de tela não lê pixels de PNG nem geometria de SVG. **A aula inteira de gráficos fica inacessível** |
| 2 | **O aluno sem GUI** (SSH, container, terminal remoto) | (a) e (b) existem no disco mas **não podem ser abertos**. (c) ajuda na forma; (d) dá os números |
| 3 | ⭐ **O próprio modelo** | **o tutor não enxerga o arquivo que acabou de gerar.** Ele escreveu comandos que produziram um SVG; ele **não sabe** se a curva saiu cortada, se a escala esmagou tudo numa linha reta, se a série ficou fora do eixo |

> **D4 — a descrição é COMPUTADA pelo renderizador a partir dos dados reais plotados, nunca escrita
> pelo modelo.** Se fosse escrita pelo modelo, seria o modelo **alucinando sobre a própria saída**.
> Ela é o **`assert` do gráfico**: o único canal pelo qual o modelo descobre o que desenhou.

**VIZ-2** fecha a regra do lado do tutor: *você não enxerga o que gerou* — leia `description_text`,
`warnings` e `stats` do stdout **antes** de narrar, e **nunca invente cor, tendência, cruzamento ou
valor que não esteja lá**.

**Conteúdo mínimo, em ordem fixa:**

| # | Item |
|---|---|
| 1 | tipo e título do gráfico (+ `caption`) |
| 2 | cada eixo com rótulo e **limites reais** |
| 3 | **uma linha por série** com rótulo, **cor nomeada em palavra**, marcador, traço, nº de pontos, indefinidos, mínimo e máximo **com o x (ou a categoria) onde ocorrem**, e a **forma** |
| 4 | `Avisos:` — a lista inteira, ou `nenhum` |
| 5 | `Leitura:` + o `takeaway` — a frase de leitura pedagógica |

**Vocabulário fechado de forma**, todo calculado dos pontos plotados:

```
monotônica crescente · monotônica decrescente · constante
muda de direção 1 vez (um pico ou um vale)
oscila (N inversões de direção)
patamares: N segmento(s) constante(s) em níveis diferentes
N ponto(s) isolado(s) separados por quebras: sem forma contínua
menos de 2 pontos finitos: sem forma
sem direção única entre os segmentos
```

Com `null` no meio, a contagem é feita **por segmento** e o sufixo `em N segmentos` aparece — **o
salto sobre a descontinuidade não é contado como inversão**. Quando o eixo Y de um `line`/`scatter`
não contém o zero, a descrição diz **"escala truncada"** em linha própria.

---

## 5.3 O contrato de `render-plot.py`

### 5.3.1 A linha de comando

```
render-plot.py [--spec CAMINHO|-] [--out-dir DIR] [--basename NOME]
               [--width N] [--height N] [--ascii-width N] [--ascii-height N]
               [--formats svg,html,txt,md] [--png] [--quiet] [--version]
```

| Flag | Default | Contrato |
|---|---|---|
| `--spec` | `-` | caminho do JSON; `-` lê de stdin. Arquivo inexistente ⇒ exit 1 `spec_read_failed` |
| `--out-dir` | `.` | criado se não existir. **Na skill é sempre `researchs/assets/<NNNN>-<slug>/`** (§5.3.6) |
| `--basename` | `plot` | prefixo de `<basename>.{svg,html,txt,md,png}` |
| `--width` / `--height` | `760` / `460` | px do SVG. Fora de `240..4000` / `180..4000` ⇒ **recortado + `warning`** |
| `--ascii-width` / `--ascii-height` | `72` / `18` | células de texto. Fora de `20..400` / `5..200` ⇒ recortado + `warning` |
| `--formats` | `svg,html,txt,md` | subconjunto a gravar. Token fora do conjunto ⇒ exit 1 `cli_invalid`. **Faltar `svg`, `html` ou `md` grava assim mesmo e emite `warning`** (mínimo aceitável) |
| `--png` | desligado | rasteriza a partir do `.svg`; falha vira `warning`, **nunca erro** |
| `--quiet` | desligado | suprime o JSON de stdout. **Documentado como "nunca use"**: sem stdout o modelo fica **cego** sobre o que desenhou |

**Não existe flag de dados** (`--x`, `--y`, `--expr`): toda a entrada é o JSON (D5). Isso mantém uma
superfície de CLI estável e **um só caminho de validação**.

> **PERGUNTE AO USUÁRIO (D-V07)** — PNG é gerado sempre ou só sob pedido?
> SVG e HTML já cobrem ver e imprimir. PNG é para colar a figura em outro lugar — o documento do trabalho, o slide. Gerar sempre custa um rasterizador e um arquivo a mais em toda figura, para um caso que aparece de vez em quando.
> **Opções:** **(a)** só com `--png` — não paga custo por um caso raro; quem quer colar precisa lembrar da flag · **(b)** sempre que houver rasterizador — PNG pronto quando precisar, e um arquivo a mais em toda figura · **(c)** sempre, falhando se não houver rasterizador — saída uniforme, e reprova o gráfico inteiro por causa de um formato opcional
> **Default:** **(a)** · **Custo de mudar depois: cheap**

⚑ Erro de CLI sai **1** (problema de forma), **não 2** — `argparse` sai 2 por padrão, e 2 aqui
significaria "dados inválidos", mandando o tutor investigar o programa do aluno por causa de uma flag
digitada errada.

### 5.3.2 A entrada — a raiz do `spec`

Chaves em inglês `snake_case`; texto livre em pt-BR (vai para dentro da figura e da descrição que o
aluno lê).

| Chave | Obrigatória | Tipo | Falha |
|---|---|---|---|
| `type` | **sim** | `function\|line\|scatter\|bar` | ausente ou fora do enum ⇒ 1 `spec_missing_key` |
| `title` | **sim** | string não vazia | ⇒ 1 `spec_missing_key` (**string só de espaços conta como ausente**) |
| `takeaway` | **sim** | string não vazia | ⇒ 1 `spec_missing_key` |
| `series` | **sim** | array | não-array ⇒ 1; **vazio ⇒ 2 `series_invalid`** |
| `x_label` / `y_label` | não (**esperadas**) | string | ausente ⇒ default `"x"` / `"y"` + `warning` **nomeando a falta** |
| `caption` | não | string (≤400) | — |
| `x_limits` / `y_limits` | não | `[min, max]` numéricos | formato errado ⇒ 1 `spec_invalid_value`; **invertido ⇒ reordenado + `warning`** |
| `categories` | **sim se `type == "bar"`** | array de strings | ausente em `bar` ⇒ 1 `spec_missing_key`; **presente fora de `bar` ⇒ ignorada + `warning`** |
| `force_legend` | não (`false`) | booleano | força legenda com 1 série; **nunca esconde** legenda |

**Chave fora dessa lista é ignorada** (spec de versão futura não quebra) e registra um `warning`.
Mesmo tratamento para chave desconhecida dentro de uma série.

Por que `title` e `takeaway` são obrigatórios: a descrição textual é a saída que não pode faltar, e
**o conteúdo mínimo dela começa pelo título e termina no takeaway**. Gráfico decorativo é ruído — se
não há `takeaway` a escrever, a figura não devia estar sendo gerada.

⚑ **Divergência arbitrada.** `docs/06-visualizacao.md` §4.2 e `SK/references/visualizacao.md` listam
`x_label`/`y_label` como obrigatórias; `plot-spec.schema.json` (`required`) lista `type`, `title`,
`takeaway`, `series`. **O implementado segue o schema** para o que é erro duro — assim toda spec
válida contra o schema renderiza — e rebaixa `x_label`/`y_label` a `warning` explícito. Quem quiser a
regra estrita muda uma linha (`REQUIRED_ROOT`).

> **PERGUNTE AO USUÁRIO (D-V13)** — Quais são as chaves obrigatórias do `spec` do gráfico, e o que `categories` e `force_legend` significam?
> Um código de erro chamado `spec_missing_key` que não cobrava chave nenhuma é um alarme sem sensor. A lista fechada é o sensor.
> **Opções:** **(a)** lista fechada — `spec_missing_key` passa a significar alguma coisa, e um `force_legend` que só força nunca surpreende escondendo; adicionar tipo de gráfico novo mexe na lista · **(b)** indefinidas — nenhuma restrição, e o código de erro existe sem nunca disparar
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 5.3.3 A entrada — a série

`label` (string não vazia) é obrigatório em **toda** série ⇒ 1 `spec_missing_key`. Uma série sem nome
produz uma figura que a descrição não consegue narrar.

**Três formas mutuamente exclusivas, nesta precedência:**

| # | Forma | Campos |
|---|---|---|
| 1 | expressão | `expr` + `domain: [a,b]` + `samples` (default `400`, faixa `2..20000`, fora dela recortado + `warning`) |
| 2 | pares | `points: [[x, y\|null], ...]` — o `y` pode ser `null` para quebrar a linha; **o `x` nunca é `null`** |
| 3 | paralelos | `x: [...]` + `y: [...]` — `len` diferente ⇒ **2 `series_invalid`** |

Mais de uma forma presente: vale a de **maior precedência** + `warning`. **Nenhuma das três ⇒
2 `series_invalid`.** A exclusividade não é expressável no schema porque `oneOf` não existe no
verificador mínimo do projeto — é verificada pelo próprio `render-plot.py`.

**`expr`** é avaliado com `eval` num namespace restrito: todos os nomes de `math`, mais
`abs/min/max/round/pow` e a variável `x`, com `__builtins__` **zerado**. `expr` contendo `__` é
recusada (1 `spec_expr_invalid`); expressão que não compila também. Amostra que levanta exceção vira
**`null`** — **quebra a linha ali, não interpola por cima da assíntota** — e um `warning` conta
quantas.

> ⚠️ **`eval` restrito NÃO é sandbox.** `expr` só pode vir do tutor, **nunca de texto colado pelo
> aluno** sem leitura (D-V06).

> **PERGUNTE AO USUÁRIO (D-V06)** — O renderizador aceita `expr` (string avaliada com `eval` restrito) ou exige todos os pontos calculados?
> `expr` é deixar o desenhista calcular a curva sozinho: economiza muito token para `y = f(x)`. O risco é óbvio — texto colado pelo aluno virando código executado.
> **Opções:** **(a)** aceitar `expr` com namespace restrito, só quando vem do tutor — a restrição é de **origem**, que é onde o risco mora; depende de o chamador respeitar a origem, e o renderizador não tem como verificar · **(b)** aceitar `expr` de qualquer origem — mais flexível, e texto colado pelo aluno vira código executado · **(c)** só `points` / `x`,`y` — zero avaliação de expressão, e uma curva de 200 pontos vira 200 pares no payload
> **Default:** **(a)** · **Custo de mudar depois: cheap**

### 5.3.4 A entrada — `bar`

| Regra | Conteúdo |
|---|---|
| `categories[]` define os grupos, **na ordem**; o eixo X é **categórico** | — |
| Cada série leva **`y` paralelo a `categories`** | `len(y) != len(categories)` ⇒ 2 `series_invalid` — **não se preenche buraco com zero** |
| `y[i] == null` | barra **omitida** (não desenhada como zero) + `warning` |
| `expr`/`points` numa série de `bar` | **ignorados** + `warning` |
| `y_limits` | **ignorado** em `bar` + `warning`: a barra ancora em zero |

### 5.3.5 A saída — arquivos e o JSON de stdout

| Arquivo | Conteúdo |
|---|---|
| `.svg` | SVG standalone (§5.2.1) |
| `.html` | documento único autocontido (§5.2.2) |
| `.txt` | o `ascii_text` integral — **idêntico byte a byte** ao campo do stdout |
| `.md` | o `description_text` integral — **idêntico byte a byte** ao campo do stdout |
| `.png` | só com `--png` e só se algum rasterizador funcionar |

```json
{"ok": true, "type": "function",
 "outputs": {"svg": "...", "png": "...", "html": "...", "ascii": "...", "description": "..."},
 "description_text": "...", "ascii_text": "...", "warnings": ["..."],
 "stats": {"series": 2, "points": 600, "points_finite": 599, "undefined_samples": 1,
           "x_limits": [a, b], "y_limits": [c, d], "width": 760, "height": 460,
           "png_tool": "rsvg-convert"}
}
```

Chaves de `outputs` **só existem para arquivos realmente gravados**; caminhos são **absolutos**. Em
erro: `{"ok": false, "error": "<código>: <detalhe>"}` no stdout, a mesma linha em stderr, e **nenhum
arquivo gravado**.

### 5.3.6 Os exit codes — exceção nomeada

`render-plot.py` é a **exceção nomeada 2** de `docs/00-contratos.md` §5.2.

| Código | Significado | `error` observados |
|---|---|---|
| `0` | sucesso, com ou sem `warnings` | — |
| `1` | **forma**: a spec está errada como documento | `spec_json_invalid`, `spec_read_failed`, `spec_missing_key`, `spec_invalid_value`, `spec_expr_invalid`, `cli_invalid` |
| `2` | **conteúdo**: a spec está bem-formada e os dados não sustentam um gráfico | `series_invalid`, `no_valid_data` |
| `3` | falha de escrita; **nada foi gravado** | `write_failed` (inclui `svg_selfcheck_failed`) |

**Regra de leitura**: `!= 0` é falha, **nunca `== 1`**. **Falha de PNG não é erro**: `warning`
`png_skipped: …` com **exit 0**.

**Onde os arquivos são gravados**: `researchs/assets/<NNNN>-<slug>/`, dentro do setup, onde
`<NNNN>-<slug>` é o research a que a figura pertence.

| Consequência | Razão |
|---|---|
| **A figura acompanha o material destilado, não o desafio** | `researchs/` é onde mora o conteúdo que sobrevive à sessão; um desafio pode ser refeito ou descartado sem levar a figura junto |
| **Um subdiretório por research**, não um `assets/` plano | uma aula com seis passos gera `passo-01.svg` … `passo-06.svg`; num diretório compartilhado esses nomes colidem na primeira repetição |
| **Nunca `/tmp`** | o aluno vai querer reabrir a figura depois, e `/tmp` some no reboot |
| **`<sessão>/viz/` não existe** | uma sessão é `memory/NNNN.json`, um **arquivo**, não um diretório — não há onde criar `viz/` dentro dele |

Quando a figura não pertence a nenhum research, o tutor **cria o research primeiro** (é uma linha em
`researchs/`) e a figura entra nele. A alternativa, um diretório solto, produz arquivos órfãos.

### 5.3.7 A ordem de execução

```
1. argparse (erro => 1)          →  2. leitura da spec (=> 1)
3. validação de forma (=> 1)     →  4. construção das séries, avaliação de expr (=> 1 ou 2)
5. escala                        →  6. descrição (1ª passada)
7. ASCII                         →  8. SVG standalone + inline
9. autoverificação XML (=> 3)    → 10. mkdir + teste de permissão (=> 3)
11. grava .svg e .txt (=> 3)     → 12. PNG (só warning)
13. DESCRIÇÃO REFEITA já com os avisos de PNG
14. grava .md e .html            → 15. stdout JSON, exit 0
```

⭐ **A descrição é computada duas vezes de propósito**: a primeira entra no `<desc>` do SVG (que
precisa existir **antes** do PNG); a segunda — a que vai para `.md`, HTML e stdout — é a **completa**,
já com os avisos que o PNG produziu.

---

## 5.4 ⭐ Os 4 bugs que o protótipo encontrou, e a regra que cada um virou

Um protótipo funcional foi escrito e executado durante a decisão de arquitetura, antes da
implementação final. Os quatro defeitos abaixo **não estavam previstos em nenhum documento**; cada um
virou uma regra normativa de `render-plot.py`. Todos **[VERIFICADOS por execução]**.

### 5.4.1 Bug 1 — a barra inventou região negativa em dados positivos

O protótipo aplicou o padding de 8% nos dois lados do eixo Y e produziu, para contagens **todas
positivas**:

```
y_limits: [-29186, 539000]        ← eixo com região negativa FANTASMA
```

Um eixo que desce abaixo de zero em dados que nunca são negativos **mente sobre a proporção entre as
barras** — é a distorção visual mais comum e mais fácil de evitar.

> **Regra**: `bar` ancora em **zero exato**. `lo = min(0, mínimo)`, `hi = max(0, máximo)`, e o padding
> de 8% **só se aplica ao lado oposto ao zero**. Para `line`/`scatter`/`function`, o padding de 8% em
> Y (e 5% em X só no `scatter`) **nunca cruza o zero**: dados todos ≥ 0 não ganham região negativa de
> folga.

**[VERIFICADO]** depois da correção: barra com contagens positivas → `y_limits = [0.0, 539460.0]` —
limite inferior **zero exato**.

Regra de comunicação associada (VIZ-3): se o aluno precisa ver diferença pequena entre valores
grandes, **o gráfico certo é de linha ou pontos com eixo truncado e rótulo dizendo**, nunca uma barra
truncada.

### 5.4.2 Bug 2 — a descrição mentiu por usar a precisão do rótulo do eixo

O protótipo reusou o arredondamento do eixo para escrever a descrição, e produziu:

```
"pico em x=0"      para 1/x          ← o pico está em x ≈ -0.015, não em 0
"x=-6"             para cos(-6.283)  ← -6.283 arredondado ao passo do tick
```

Ambos **inúteis**, e o segundo é pior que inútil: afirma um valor que não é o que foi plotado.

> **Regra — precisão do eixo ≠ precisão da descrição.** São dois canais com objetivos diferentes: o
> **eixo arredonda ao passo do tick** (legibilidade); a **descrição usa `%.4g`** (≥4 dígitos
> significativos). Reportar "pico em x=0" para `1/x` é consequência de confundir os dois.

Regra irmã, do mesmo bloco de escala: ticks "nice" com passo em {1, 2, 2.5, 5, 10} × 10ⁿ, alvo de ~6
marcas, e **as marcas são as que cabem dentro dos limites** — os limites **nunca** são esticados até
um número redondo. Nunca um rótulo do tipo `3.1400000000000001`.

### 5.4.3 Bug 3 — "tendência estável" para uma função que oscila

O protótipo classificava a forma pela **direção global** (primeiro ponto contra último). Para `cos(x)`
num período inteiro, o começo e o fim têm o mesmo valor — e a saída foi "tendência estável".

⭐ **A afirmação é verdadeira e enganosa ao mesmo tempo**: globalmente estável, sim; e o aluno lê que a
função não varia. Como (d) é o único canal pelo qual o modelo enxerga o que desenhou, essa frase faria
o **tutor** narrar ao aluno que o cosseno é estável.

> **Regra**: a forma é **computada dos pontos plotados**, contando **inversões de direção** segmento a
> segmento, com um epsilon relativo ao span (`1e-12 + 1e-9 × span`) para ignorar ruído de ponto
> flutuante. Com **≥ 2 inversões**, reportar **oscilação**, nunca "tendência global estável". O
> vocabulário fechado de §5.2.4 é a lista inteira de saídas possíveis — não há forma fora dela.

**[VERIFICADO]** depois da correção: `cos(x)` → **"oscila (3 inversões de direção)"**.

Duas guardas do mesmo mecanismo: um conjunto de pontos separados por quebras, sem nenhum segmento de
2+ pontos, **não é "constante"** — é `N ponto(s) isolado(s) separados por quebras: sem forma contínua`
(chamar de constante seria mentir sobre dados que variam); e segmentos constantes em níveis diferentes
são `patamares`, não `constante`.

### 5.4.4 Bug 4 — a assíntota esmagou a escala em silêncio

Plotando `1/x` num domínio que cruza a origem, o valor perto da assíntota domina o eixo Y e **toda a
curva no meio vira uma linha reta**. O protótipo desenhou isso sem dizer nada — e, pior, interpolava
por cima da descontinuidade, ligando `−∞` a `+∞` com um traço.

> **Regra dupla**:
>
> 1. **Detecção declarada** — quando `máx |y| > 50 × mediana |y|` (mediana sobre os `y` não nulos),
>    emitir `warning` **declarando o fato** e sugerindo `y_limits`: *"escala dominada por valores
>    extremos (|y| até X contra Y típico): a curva no meio vira uma linha reta. Passe 'y_limits' para
>    recortar a assíntota se o assunto da aula estiver lá."*
> 2. **A linha quebra, não interpola** — amostra que levanta exceção vira `null`, o que **quebra a
>    linha ali** em vez de interpolar por cima da assíntota, e um `warning` conta quantas amostras
>    ficaram indefinidas.

**[VERIFICADO]** depois da correção, descrição de `1/x`: mínimo **−66.67 em x = −0.015**, **1 amostra
indefinida**, forma **"monotônica decrescente em 2 segmentos"**, mais o aviso de escala dominada. Note
que o "em 2 segmentos" é a terceira regra em ação: **o salto sobre a descontinuidade não conta como
inversão de direção**.

### 5.4.5 As demais regras de escala e robustez

| Regra | Conteúdo |
|---|---|
| Limites forçados fora dos dados | os pontos são **recortados na moldura** (`clipPath`), **nunca desenhados por cima dos eixos**, e um `warning` conta quantos |
| `viewBox` sempre presente | sem ele o SVG não escala dentro do HTML |
| Linha do zero | mais escura que a grade quando o zero está dentro dos limites |
| Grade | cinza claro (`#e2e2e2`), fina, atrás de tudo. Se compete com os dados, está errada |
| Escape | todo texto vindo do spec passa por `html.escape(..., quote=True)` no SVG e no HTML — um `&` num rótulo corrompe o SVG inteiro |
| **Autoverificação** | o SVG é parseado com `ElementTree.fromstring` **antes** de qualquer escrita, e o arquivo gravado é reaberto com `ElementTree.parse`. Falha em qualquer um ⇒ **exit 3 `write_failed: svg_selfcheck_failed`** |
| Proporção honesta | default 760×460 (≈1,65:1). Esticar a proporção **muda a inclinação percebida** — para comparar inclinações, manter a mesma razão nas duas figuras |
| Comparação entre figuras | "antes" e "depois" usam `x_limits`/`y_limits` **idênticos**. Sem isso a comparação visual mente, e **essa é a mentira mais difícil de detectar depois** |
| Todo eixo tem rótulo **com unidade** | `x_label: "n (tamanho da entrada)"`, não `"n"`; `y_label: "tempo (ms)"`, não `"tempo"`. Um número sem unidade não ensina nada |
| Escala logarítmica | **nunca silenciosa**: o rótulo do eixo precisa conter "(log)" ou "log₁₀". Um eixo log sem rótulo transforma exponencial em reta e o aluno aprende a coisa errada |
| PNG | ordem de tentativa `rsvg-convert -w <2×largura>` → `magick -density 192` → `convert -density 192`; timeout de **90 s** por tentativa; nenhum disponível ⇒ `warning`, exit 0, sem `png` em `outputs` |

---

## 5.5 Acessibilidade — cor nunca sozinha

### 5.5.1 A paleta segura

**Okabe-Ito, na ordem fixa.** Máximo **8 categorias**: passou de 8, o gráfico está errado **antes** da
cor — agrupe, destaque uma série e apague as outras em cinza, ou faça vários gráficos pequenos.
(Mais de 8 séries: `warning` e a paleta se repete; não é erro de execução.)

| # | Hex | Nome usado na descrição | Marcador | Traço |
|---|---|---|---|---|
| 1 | `#E69F00` | laranja | círculo | sólida |
| 2 | `#56B4E9` | azul-céu | quadrado | tracejada |
| 3 | `#009E73` | verde-azulado | triângulo | pontilhada |
| 4 | `#F0E442` | amarelo | losango | traço-ponto |
| 5 | `#0072B2` | azul | xis | pontilhada fina |
| 6 | `#D55E00` | vermelhão | cruz | traço longo |
| 7 | `#CC79A7` | roxo-avermelhado | estrela | traço-ponto-ponto |
| 8 | `#000000` | preto | hexágono | traço curto |

Escala **contínua** (variável ordenada: magnitude, densidade, tempo): **viridis ou cividis**. Nunca
Okabe-Ito em gradiente, **nunca arco-íris/jet**.

### 5.5.2 A regra dura

> **VIZ-4 — nenhuma informação codificada só por cor.** Cada índice da paleta é amarrado a um **trio**
> (cor, marcador, traço), e o renderizador emite **os três canais juntos, sempre**.

Isso cobre daltonismo, impressão em preto e branco, e leitura de ASCII (onde a cor não existe).

| Tipo | Como os canais aparecem |
|---|---|
| `function` / `line` | ~8 marcadores esparsos ao longo da curva, **deslocados por série** para não coincidirem |
| `scatter` | marca **todo** ponto e **não** usa traço — a descrição e a legenda dizem "sem linha" |
| `bar` | marcador no **topo** da barra, e o contorno desenhado com o dasharray da série |

**A legenda nomeia os três canais em texto**: `sen(x) (círculo, sólida)`. Alguém lendo a descrição sem
ver a figura consegue mapear. Legenda automática com 2+ séries (ou `force_legend`); **não há como
suprimi-la**.

### 5.5.3 Alt-text obrigatório em dois lugares

Não é escolha entre os dois:

| Lugar | Para quem |
|---|---|
| `<desc>` dentro do SVG, com a descrição **inteira** — mais `role="img"` e `<title>` | leitor de tela ao abrir o arquivo |
| A descrição (d) **visível como texto** no HTML | leitor de tela **e olho humano** |

Barras carregam `<title>` — tooltip nativo do navegador, **sem JS**.

---

## 5.6 O que fica FORA do prometido

Declarado aqui para que nem a skill nem o tutor prometam ao aluno (**VIZ-6**).

| Fora | Motivo | Status |
|---|---|---|
| **Animação / vídeo (Manim)** | exige `cairo` + `pkg-config`, e **LaTeX para qualquer fórmula** (`Tex`/`MathTex` chamam `latex` e `dvisvgm`) — TeX Live passa de **1 GB**. Para um tutor de matemática, LaTeX deixa de ser opcional na prática | **upgrade opcional**, nunca oferecido proativamente |
| **Diagrama de grafo com layout automático** | `dot` ausente; layout de grafo **arbitrário** (ciclos, minimização de cruzamentos) é problema difícil de verdade e não vale reimplementar | **upgrade opcional** (`pacman -S graphviz`); ASCII e SVG-à-mão são a capacidade real |
| **mermaid como arquivo de imagem** | `npx -p @mermaid-js/mermaid-cli mmdc` **[VERIFICADO]** falha nesta máquina com `ERR_MODULE_NOT_FOUND` no Node 24.19.0, **antes** de chegar ao Chromium que ele sobe por Puppeteer. Não é só "pesado": está quebrado aqui | **fora**. mermaid **inline em Markdown** é capacidade real quando o visualizador do aluno renderiza (GitHub, VS Code, Obsidian) |
| **Gráfico interativo** (zoom/pan/tooltip rico) | exigiria biblioteca JS embutida no HTML | fora da v1; `<title>` nas barras dá tooltip nativo |
| **Eixo logarítmico real** | não implementado na v1 | `expr` com `log10(...)` e rótulo dizendo isso, ou upgrade |
| **Heatmap / imagem de densidade** | milhares de `<rect>` incham o SVG | grade grossa (≤40×40) ou upgrade |
| **Scatter com > ~5 000 pontos** | tamanho de arquivo e tempo de parse | **amostrar antes de plotar, e dizer que amostrou** |
| **3D, superfície, campo vetorial** | projeção 3D à mão é muito código para o retorno | upgrade via matplotlib |
| **Renderizar imagem dentro do terminal** | sixel/kitty/imgcat dependem do emulador do aluno e **não são detectáveis de forma confiável** | fora; braille (c) é o substituto honesto |
| **Distinguir séries no braille** · **cor no fallback ASCII** | uma única malha para todas as séries | limitação declarada no `.txt` |

**Regra de comunicação**: o tutor **pode** dizer *"posso gerar isso se você instalar X"*. O tutor
**não pode** dizer "vou gerar uma animação" e depois descobrir que precisa de LaTeX. Nada disso é
contornado em silêncio: quando o caso aparece, a saída é `warning` ou a limitação declarada.

### 5.6.1 O caminho de upgrade — quando oferecer o venv

O default **nunca** pede instalação. Há casos em que o stdlib puro não entrega, e aí a skill
**oferece** — sem impor, sem instalar por conta própria, sem bloquear a aula.

| Oferecer quando (qualquer um) | **Não** oferecer quando |
|---|---|
| o aluno pediu explicitamente qualidade de imagem melhor | primeira sessão |
| a aula precisa de heatmap, 3D, superfície, campo vetorial ou eixo log real | gráfico único e simples |
| a aula precisa de scatter com milhares de pontos | o aluno só quer ver a forma da curva |
| o aluno vai passar várias sessões em visualização (o custo se amortiza) | máquina que não é dele |

A oferta é **uma frase, com o custo explícito**, e a aula continua qualquer que seja a resposta:

> Este gráfico ficaria melhor com matplotlib. Posso criar um ambiente virtual isolado em
> `~/.local/share/study-method/venv` (≈60 MB, uma vez, não mexe no Python do sistema) — ou seguimos
> com o renderizador embutido, que já resolve este caso. Prefere qual?

```bash
python3 -m venv ~/.local/share/study-method/venv
~/.local/share/study-method/venv/bin/pip install --quiet matplotlib
MPLBACKEND=Agg ~/.local/share/study-method/venv/bin/python script.py
```

`MPLBACKEND=Agg` é **obrigatório**: sem backend não-interativo, um `plt.show()` num ambiente sem
display **trava ou lança erro de X11**.

**O que muda quando o aluno aceita**: o renderizador stdlib **continua sendo o default**. O venv vira
uma rota extra para os casos da lista. **As quatro saídas de §5.2 continuam obrigatórias** —
matplotlib gera (a) melhor, mas (b), (c) e (d) continuam sendo responsabilidade da skill, e (d)
especialmente: **matplotlib não descreve a própria figura, e o modelo continua sem enxergá-la**.

O estado do venv fica registrado no **`setup.json`** — o manifesto do setup, na raiz dele. **Não
existe `meta.json` de setup**: `meta.json` é o manifesto de **um desafio**. Gravar estado de setup num
arquivo que só existe por desafio significa reperguntar a cada desafio novo.

---

## 5.7 Visualizar algoritmo, não só função

Plotar `f(x)` é o caso fácil. Ensinar algoritmo pede mostrar **estrutura e estado** — e `dot` não está
instalado. O que dá para fazer **hoje**, sem instalar nada:

| Caso | Rota | Como |
|---|---|---|
| **Recursão — árvore de chamadas** | **A: ASCII estruturado** (custo zero, sempre disponível) | o aluno instrumenta a própria função para imprimir com **indentação por profundidade**. É pedagogicamente **melhor** que um diagrama pronto: o aluno escreve o instrumento, e a repetição de `fib(2)` fica visível — que é o ponto da aula sobre memoização |
| **Recursão — árvore pequena (≤15 nós)** | **B: SVG à mão** | `<circle>`+`<line>`+`<text>`; para árvore o layout é trivial (nível = `y`, posição no nível = `x`). **[VERIFICADO]**: um SVG de árvore de chamadas feito à mão rasterizou com `rsvg-convert` para PNG de **1 393 cores**, com o texto dos nós correto |
| lista ligada · pilha · fila · array com índices | ASCII | `[3] -> [7] -> [1] -> None`; caixas empilhadas com marca de topo/base; linha de valores + linha de índices + `^` no ponteiro |
| grafo pequeno (≤10 nós) | SVG à mão | posicionar em círculo, arestas como `<line>`/`<path>` |
| grafo arbitrário | mermaid inline, ou upgrade | §5.6 |
| **Complexidade — tempo medido × curva teórica** | o renderizador, sem faltar nada | o aluno implementa **na linguagem da aula**, mede com o relógio dela (`time.perf_counter`, `performance.now()`, `time.Now()`, `std::chrono`, `Instant::now()`, `os.clock()`), escreve os pares `(n, tempo)` num JSON, e `render-plot.py` desenha **duas séries**: medido (`scatter`) e teórico (`line`). ⭐ O valor está em **sobrepor medido e teórico na mesma figura com os mesmos limites de eixo** — uma curva medida sozinha não ensina complexidade |
| **Execução passo a passo** | tabela de texto por passo · sequência de figuras numeradas · snapshot da estrutura | a cada iteração relevante, uma linha com as variáveis de interesse (é o que um instrutor escreve no quadro); ou `passo-01.svg` … `passo-NN.svg` **com `x_limits`/`y_limits` idênticos em todas** — senão a "animação" mental mente — mais um HTML que as empilha |

**Regra transversal**: prefira sempre plotar **o que o código do aluno produziu**, não o que o tutor
calculou por fora. **Um gráfico torto que ele produziu ensina mais que um gráfico certo que ele apenas
assistiu.**

> **PERGUNTE AO USUÁRIO (D-V10)** — Quando os dados do gráfico vêm do programa do aluno, exigir JSON ou parsear a saída de texto?
> Pedir para o programa gravar JSON é pedir a nota fiscal em vez de um bilhete escrito à mão. Gravar dado estruturado é parte do que se aprende; parsear texto livre falha em silêncio no dia em que o aluno muda o `print`.
> **Opções:** **(a)** JSON (ou CSV simples) — falha ruidosamente, nunca em silêncio, e gravar dado estruturado é parte do aprendizado; custa uma linha a mais no programa do aluno · **(b)** parsear texto livre — nenhuma mudança no programa dele, e frágil: muda o `print` e o gráfico sai errado sem aviso
> **Default:** **(a)** · **Custo de mudar depois: cheap**

---

## 5.8 Verificação executada

Nesta máquina, **2026-08-23**:

| # | Verificação | Resultado |
|---|---|---|
| 1 | `python3 -m py_compile` | OK, 1 351 linhas, Python 3.14.7 |
| 2 | 4 tipos renderizados com `--png` | `function` svg 13 472 B / png 117 624 B / **1 117 cores**; `line` 4 465 / 65 915 / **558**; `scatter` 3 904 / 51 622 / **446**; `bar` 4 774 / 77 964 / **487** — **nenhum PNG de cor única** |
| 3 | barra com contagens positivas | `y_limits = [0.0, 539460.0]` — limite inferior **zero exato** (bug 1 corrigido) |
| 4 | descrição de `1/x` e `cos(x)` | `1/x`: mínimo −66.67 em x = −0.015, 1 amostra indefinida, "monotônica decrescente em 2 segmentos" + aviso de escala dominada (bugs 2 e 4). `cos(x)`: "oscila (3 inversões de direção)" (bug 3) |
| 5 | HTML autocontido | `http(s)`, `src=`, `href=`, `<script`, `<link`, `@import`, `url()` externa: **0 ocorrências** |
| 6 | braille de um seno | período completo legível em 72×18 |
| 7 | SVG por `ElementTree` | 8 arquivos, todos parseiam, todos com `viewBox`, `role="img"`, `<title>`, `<desc>` |
| 8 | exit codes | 1 (JSON malformado, chave ausente, enum, flag inválida) · 2 (série vazia, série sem forma, nenhum ponto finito) · 3 (diretório sem permissão, `mkdir` negado) · 0 (sucesso) |
| 9 | PNG | `rsvg-convert` 2.62.3 → 1 520×920; com `PATH` vazio: **exit 0 + `warning png_skipped`** |
| 10 | schema | spec mínima válida contra `plot-spec.schema.json` renderiza (exit 0); spec inválida recusada (exit 1) |

---

## 5.9 As decisões consolidadas e as 6 regras permanentes

| # | Decisão | Consequência |
|---|---|---|
| D1 | renderizador ortogonal à linguagem da aula | toda linguagem ganha gráfico; o contrato é JSON, não API |
| D2 | default = emissor de SVG em stdlib pura | zero instalação na primeira sessão |
| D3 | quatro saídas obrigatórias | cobre durabilidade, portabilidade, terminal e **o cegamento do modelo** |
| D4 | descrição **computada**, não escrita pelo modelo | impede o modelo de alucinar sobre a própria saída |
| D5 | entrada é um único JSON via `--spec`/stdin | CLI estável, um só caminho de validação |
| D6 | Okabe-Ito + marcador + traço, sempre os três | nunca informação só por cor |
| D7 | barra ancora em zero; truncamento sempre declarado | honestidade visual não é negociável |
| D8 | bibliotecas são upgrade oferecido, nunca pré-requisito | PEP 668 não bloqueia a aula |
| D9 | animação e layout de grafo ficam fora do prometido | nada de promessa que vira instalação de 1 GB |
| D10 | saída em `researchs/assets/<NNNN>-<slug>/` | a figura acompanha o material destilado e sobrevive ao desafio |
| D11 | o `spec` tem lista fechada de chaves; `bar` exige `categories` | `spec_missing_key` cobra algo nomeável |

| ID | Regra permanente (`docs/00-contratos.md` §9.6) |
|---|---|
| VIZ-1 | Toda visualização entrega no mínimo SVG + HTML autocontido + descrição textual; o ASCII/braille é obrigatório **como arquivo**. HTML sem `<script src>`, sem `<link>`, sem CDN |
| VIZ-2 | **Você não enxerga o que gerou**: leia `description_text`, `warnings` e `stats` do stdout antes de narrar, e **nunca invente cor, tendência, cruzamento ou valor que não esteja lá** |
| VIZ-3 | Barra ancora em zero; eixo truncado é **declarado**; escala log é rotulada; figuras comparadas usam `x_limits`/`y_limits` idênticos; todo eixo tem rótulo com unidade |
| VIZ-4 | Nenhuma informação codificada só por cor: cor + marcador + traço sempre juntos, paleta Okabe-Ito na ordem fixa, máximo 8 séries |
| VIZ-5 | Biblioteca de plotagem é upgrade **oferecido** com custo explícito, nunca pré-requisito; **nunca `pip install` no Python do sistema, nunca `--break-system-packages`** |
| VIZ-6 | Nunca prometa animação/Manim, grafo com layout automático, mermaid como arquivo de imagem, 3D, nem imagem dentro do terminal — só "consigo isso se você instalar X" |
