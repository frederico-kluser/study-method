# 06 — Visualização: como o aluno VÊ o que está aprendendo

Documento de arquitetura. Decide **como** a skill `study-method` transforma
matemática e algoritmos em coisa visível, e **por que** o default não é
matplotlib.

Fonte de pesquisa: `docs/research/05-visualizacao.md` (matriz linguagem→biblioteca,
headless, HTML autocontido, ASCII, acessibilidade) e `docs/research/06-toolchains.md`
(runners de teste). Este documento **decide**; a pesquisa **levanta**.

Implementação derivada:
- `skills/study-method/scripts/render-plot.py` — sub-tarefa 3.7, contrato na §3 daqui.
- `skills/study-method/references/visualizacao.md` — instrução operacional de runtime.
- `skills/study-method/references/languages.md` — matriz de linguagens de runtime.

---

## 1. O pedido, literal

> "tudo que for ensinado, tanto programação quanto matemática, pode ser feito com
> código de programação; por mais que a matemática não seja programação, vamos usar
> programação para aprendê-la, e nesse sentido iremos utilizar renderizador de
> gráficos; o usuário poderá escolher a linguagem que ele queira para a aula"

Três exigências independentes saem daí:

1. **Matemática é ensinada escrevendo código.** Não é "código ilustrando matemática" —
   é o aluno implementando a definição e vendo o resultado. Derivada vira
   `(f(x+h)-f(x))/h` num arquivo que roda.
2. **Existe um renderizador de gráficos.** Não é opcional nem eventual: é peça de
   arquitetura, com contrato próprio.
3. **A linguagem é escolha do aluno.** O renderizador não pode ser refém da linguagem
   da aula, senão "escolher a linguagem" vira "escolher entre as linguagens que têm
   biblioteca de plot instalada" — o que é escolha nenhuma.

A exigência 3 é a que mata o design óbvio. Se o gráfico nasce da linguagem da aula,
uma aula de Lua não tem gráfico (a pesquisa 05 §1.4 é explícita: Lua não tem
biblioteca de plotagem madura). Se o gráfico nasce de um **renderizador único,
independente da linguagem da aula**, todas as linguagens ganham gráfico de graça.

**Decisão D1 — o renderizador é ortogonal à linguagem da aula.** A linguagem da aula
escolhe como o aluno *calcula*; o renderizador escolhe como o resultado *aparece*.
O contrato entre os dois é um arquivo de dados (JSON ou CSV), não uma API.

---

## 2. A descoberta que mudou o default

A pesquisa 05 recomenda matplotlib como default de Python, `gnuplot` como fallback
universal via shell-out, e Graphviz para diagramas. **Nada disso existe nesta máquina.**
Verificado por execução em 2026-08-23:

| Componente | Status | Consequência |
|---|---|---|
| `matplotlib` | **ausente** | default da pesquisa não roda |
| `plotext` | **ausente** | fallback ASCII da pesquisa não roda |
| `numpy`, `PIL`, `pytest`, `PyYAML` | **ausentes** | nenhuma dependência Python de terceiros |
| `gnuplot` | **ausente** | fallback universal de shell-out não roda |
| `dot` (Graphviz) | **ausente** | §6.1/6.2 da pesquisa (árvore de chamadas, estruturas) não roda |
| `/usr/lib/python3.14/EXTERNALLY-MANAGED` | **existe** | PEP 668: `pip install` no Python do sistema **falha** |

PEP 668 em uma linha: o Python do sistema é gerenciado pelo pacote da distro, então
`pip install` fora de um ambiente virtual é recusado com `externally-managed-environment`
para não brigar com o `pacman` — a saída é `python3 -m venv`, não `--break-system-packages`.

Ou seja: o caminho recomendado pela pesquisa **e o fallback dele** exigem instalação.
Um tutor cujo primeiro passo é "instale três pacotes" perde o aluno antes da primeira aula.

**O que existe e a pesquisa não sabia** (verificado por execução):

| Componente | Versão | Para que serve aqui |
|---|---|---|
| `rsvg-convert` | librsvg 2.62.3 (`/usr/bin`) | **SVG → PNG sem instalar nada** |
| `magick` / `convert` | ImageMagick 7.1.2-29, delegate `rsvg` embutido | segunda rota SVG → PNG |
| `xdg-open` | presente | abrir o HTML no navegador do aluno |
| Python 3.14.7 | stdlib completa | `json`, `math`, `xml`, `argparse`, `html` — tudo que um emissor de SVG precisa |

Isso reabre a saída raster. A pesquisa 05 §9 já dizia o essencial sem tirar a
conclusão: *"gerar um `.svg` manualmente como string (linhas, círculos, texto — SVG é
só XML) não depende de nenhuma lib de plotagem. É o caso zero-install mais universal de
toda a pesquisa."* Com `rsvg-convert` presente, esse caminho não para no SVG: chega ao PNG.

**Decisão D2 — o renderizador padrão é um emissor de SVG em biblioteca padrão pura,
zero import externo.** Bibliotecas de plotagem são *upgrade opcional*, nunca pré-requisito.

Isso não é escolha de pobreza. É a única escolha que satisfaz simultaneamente:
"funciona na primeira sessão", "funciona em qualquer máquina com Python", "funciona
para todas as linguagens da aula", e "não pede permissão de instalação para desenhar
uma parábola".

---

## 3. O protocolo de visualização: 4 saídas, todas obrigatórias

Toda visualização gerada pela skill produz **quatro** artefatos. Não são alternativas
entre as quais o tutor escolhe — são quatro canais que cobrem quatro falhas diferentes.

### (a) Arquivo vetorial salvo — `<base>.svg` (+ `<base>.png` quando há rasterizador)

O artefato durável. SVG porque é texto (o próprio modelo pode reler e verificar o que
gerou), escala sem borrar, e não precisa de biblioteca para nascer. PNG derivado
via `rsvg-convert -w <2×largura> -o <base>.png <base>.svg`, com `magick -density 192`
como segunda opção e **omissão silenciosa** (registrada em `warnings`) se nenhum dos
dois existir. PNG nunca é obrigatório; SVG é.

*Cobre a falha*: "a sessão acabou e o aluno quer rever/colar no caderno".

### (b) HTML autocontido — `<base>.html`

O SVG **inline** dentro de um HTML de arquivo único: zero `<script src>`, zero `<link>`,
zero CDN, zero fonte remota. Funciona por duplo clique, por `xdg-open`, em SSH sem
port-forward, em container sem rede, offline.

Contém, nesta ordem: título, a figura, a legenda, **a descrição textual completa (d)
visível como texto do documento** (não escondida em atributo), e dois `<details>`
recolhidos com a versão ASCII e o dump dos dados. Tema claro/escuro via
`prefers-color-scheme`, com o painel da figura sempre em fundo claro (o SVG é desenhado
com fundo branco explícito — SVG transparente sobre fundo escuro some).

*Cobre a falha*: "PNG não dá para selecionar texto, nem ampliar sem borrar, e o aluno
não tem visualizador de SVG configurado". Todo SO abre HTML.

### (c) Fallback ASCII/braille — `<base>.txt` e, quando pedido, inline no chat

Desenho em caracteres braille Unicode (U+2800–U+28FF), 2×4 subpixels por célula — 8×
a resolução de ASCII puro no mesmo espaço. Sem dependência: é aritmética de bitmask
sobre `chr(0x2800 + máscara)`. Eixos rotulados nos extremos e legenda com um marcador
ASCII por série.

#### O layout de bits da célula — **[VERIFICADO por execução]**

Sem esta tabela o fallback sai errado, e erra de um jeito difícil de perceber: a numeração
histórica dos pontos do braille **não** é a ordem de leitura da grade. Os pontos 7 e 8 foram
acrescentados depois (braille de 8 pontos) e por isso ocupam os **bits mais altos**, apesar de
ficarem na **última linha** da célula. Quem assumir "linha 3 = bits 6 e 7 na ordem natural" acerta
por acidente na coluna 0 e erra na coluna 1.

A célula tem 4 linhas × 2 colunas. `linha 0` é a de cima, `coluna 0` é a da esquerda:

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

Confirmado nome a nome contra o próprio Unicode: `chr(0x2800 + 0x40)` é
`U+2840 BRAILLE PATTERN DOTS-7` e `chr(0x2800 + 0x80)` é `U+2880 BRAILLE PATTERN DOTS-8`.
Máscara `0x00` é `U+2800 BRAILLE PATTERN BLANK` — e ele **não é um espaço**: tem largura de
caractere e mantém as colunas alinhadas. Preencher o fundo com `" "` em vez de `U+2800`
desalinha a figura em fonte proporcional. Máscara `0xFF` é `⣿`.

Amostra gerada com esse mapa, 20×4 células (uma reta):

```
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⠤⠒⠊⠉
⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡠⠤⠒⠊⠁⠀⠀⠀⠀⠀
⠀⠀⠀⠀⣀⡠⠤⠒⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⡠⠔⠒⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
```

*Cobre a falha*: "o aluno está em SSH puro, ou não vai sair do terminal, ou quer a
forma da curva agora, dentro da conversa, sem abrir arquivo".

Limite honesto (pesquisa 05 §4): braille mostra **forma**, não **valor**. Scatter denso
vira mancha; múltiplas séries se confundem; não há cor confiável. Serve para
"crescente/oscilante/tem um pico aqui", não para "vale 3,47 em x=2".

### (d) Descrição textual — `<base>.md` e no stdout do renderizador

⭐ **Esta é a saída que não pode faltar, e é a menos óbvia.** Ela serve a três leitores
distintos, e por isso é obrigatória mesmo quando as outras três funcionaram:

1. **O aluno com deficiência visual.** Leitor de tela não lê pixels de PNG nem geometria
   de SVG. Sem (d), a aula inteira de gráficos é inacessível.
2. **O aluno sem GUI.** SSH, container, terminal remoto: (a) e (b) existem no disco mas
   não podem ser abertos. (c) ajuda na forma; (d) dá os números.
3. **O próprio modelo.** ⭐ O tutor **não enxerga o arquivo que acabou de gerar**. Ele
   escreveu comandos que produziram um SVG; ele não sabe se a curva saiu cortada, se a
   escala esmagou tudo numa linha reta, se a série ficou fora do eixo. A descrição
   textual é **gerada pelo renderizador a partir dos dados reais plotados** e devolvida
   no stdout — é o único canal pelo qual o modelo descobre o que desenhou. É o
   equivalente do `assert` para gráfico.

O ponto 3 é o que torna (d) não-negociável. A pesquisa 05 §7 já apontava: *"o próprio
LLM rodando a skill não 'enxerga' a imagem que acabou de salvar em arquivo"*. A
consequência de design é que a descrição **não é escrita pelo modelo** — se fosse, seria
o modelo alucinando sobre a própria saída. Ela é **computada pelo renderizador**:
limites de eixo reais, mínimo/máximo com o x onde ocorrem, contagem de pontos,
monotonicidade ou número de inversões de direção, contagem de amostras indefinidas.
O modelo lê isso e **então** narra ao aluno.

Conteúdo mínimo de (d), nesta ordem:
1. tipo e título do gráfico;
2. o que é cada eixo, seus limites reais e se a escala é log;
3. por série: rótulo, cor **nomeada em palavra**, marcador, estilo de linha, nº de
   pontos, mínimo e máximo com o x correspondente, e forma (monotônica crescente /
   decrescente / oscila com N inversões);
4. avisos (amostras indefinidas, PNG não gerado, série vazia, escala truncada);
5. o `takeaway` que o chamador passou — a frase de leitura pedagógica.

### A regra que amarra as quatro

**Nenhuma visualização é considerada entregue com menos de (a)+(b)+(d).** (c) é
obrigatório como arquivo e opcional como impressão no chat (ver D-V03).

---

## 4. ⭐ Contrato do `render-plot.py`

Implementação: sub-tarefa 3.7. Linguagem: **Python 3.9+, biblioteca padrão pura** —
`sys`, `os`, `json`, `math`, `argparse`, `html`, `shutil`, `subprocess`. **Nenhum
import de terceiro. Nenhum `try: import numpy`.** Se algum dia precisar de um, o
arquivo está errado.

Um protótipo funcional de 348 linhas foi escrito e executado durante esta decisão
(no scratchpad, fora do repositório) para provar que este contrato é implementável: os
quatro tipos, as quatro saídas, o PNG via `rsvg-convert` (1 243 cores distintas — o
teste que pegou o bug do `plotters` na pesquisa 05) e os quatro exit codes funcionaram.
Os SVGs gerados foram validados com `xml.etree.ElementTree.parse`, e os HTMLs
confirmados com **zero** referências externas.

### 4.1 Invocação

```
render-plot.py [--spec CAMINHO|-] [--out-dir DIR] [--basename NOME]
               [--width N] [--height N] [--ascii-width N] [--ascii-height N]
               [--formats svg,html,txt,md] [--png] [--quiet]
```

| Flag | Default | Significado |
|---|---|---|
| `--spec` | `-` | caminho do JSON de entrada; `-` lê de stdin |
| `--out-dir` | `.` | diretório de saída (criado se não existir). Na skill é **sempre** `researchs/assets/<NNNN>-<slug>/` do setup — ver §4.7 |
| `--basename` | `plot` | prefixo dos arquivos: `<basename>.svg`, `.html`, `.txt`, `.md`, `.png` |
| `--width` / `--height` | `760` / `460` | dimensões do SVG em px |
| `--ascii-width` / `--ascii-height` | `72` / `18` | células de texto do fallback braille |
| `--formats` | `svg,html,txt,md` | subconjunto a gravar; `svg`, `html` e `md` são o mínimo aceitável |
| `--png` | desligado | tenta rasterizar via `rsvg-convert`, depois `magick`, depois `convert` |
| `--quiet` | desligado | suprime o JSON de resultado no stdout (arquivos ainda são gravados) |

Não há flags de dados soltas (`--x`, `--y`, `--expr`). **Toda a entrada é um único
JSON.** Isso mantém uma superfície de CLI estável e um só caminho de validação.

### 4.2 Entrada — o objeto `spec`

Chaves em **inglês snake_case** (regra do projeto). pt-BR só nos *valores* de texto
livre (`title`, `label`, `x_label`, `y_label`, `takeaway`, `caption`, `categories`).
Exemplo de `type: "function"`; a lista completa das chaves vem logo abaixo.

```json
{
  "type": "function|line|scatter|bar",
  "title": "seno e cosseno",
  "x_label": "x (radianos)",
  "y_label": "y",
  "takeaway": "onde sen(x) tem pico, cos(x) cruza zero",
  "caption": "legenda curta sob a figura (opcional)",
  "x_limits": [-6.283, 6.283],
  "y_limits": [-1.2, 1.2],
  "force_legend": false,
  "series": [
    { "label": "sen(x)", "expr": "sin(x)", "domain": [-6.283, 6.283], "samples": 300 },
    { "label": "medido", "points": [[100, 2.1], [200, 8.4]] },
    { "label": "teórico", "x": [100, 200], "y": [2.0, 8.0] }
  ]
}
```

#### ⭐ As chaves do `spec`, uma a uma — obrigatórias, opcionais e condicionais

Existe um exit code chamado `spec_missing_key`; sem esta tabela ninguém sabe **quais** chaves ele
cobra. Esta é a lista fechada: chave fora dela é **ignorada em silêncio** (para não quebrar spec
que veio de uma versão futura), e chave ausente da coluna "obrigatória" é `spec_missing_key`.

| Chave | Obrigatória? | Tipo | Semântica |
|---|---|---|---|
| `type` | **sim** | `"function"\|"line"\|"scatter"\|"bar"` | Valor fora do enum ⇒ `spec_missing_key` |
| `title` | **sim** | string pt-BR | Título da figura. String vazia ⇒ `spec_missing_key`: "Gráfico 1" não é título |
| `x_label` | **sim** | string pt-BR | Rótulo do eixo X, **com unidade** (§5) |
| `y_label` | **sim** | string pt-BR | Rótulo do eixo Y, **com unidade** (§5) |
| `series` | **sim** | array, ≥1 item | Vazio ⇒ `series_invalid` (exit 2), não `spec_missing_key` — a spec estava bem-formada, os dados é que não |
| `takeaway` | não | string pt-BR | A frase de leitura pedagógica. Vai para o fim da descrição (d) |
| `caption` | não | string pt-BR | Legenda curta sob a figura |
| `x_limits` / `y_limits` | não | `[min, max]` | Limites forçados. Ausentes ⇒ calculados dos dados com padding |
| **`categories`** | **sim se `type == "bar"`**; proibida nos outros | array de strings pt-BR, ≥1 | Os rótulos do eixo X do gráfico de barras, **na ordem em que aparecem**. Presente com `type != "bar"` ⇒ ignorada |
| **`force_legend`** | não | booleano, default `false` | Ver abaixo |
| `series[].label` | **sim** | string pt-BR | Nome da série na legenda e na descrição (d) |
| `series[].expr` + `domain` (+ `samples`) | condicional | string + `[a,b]` + int | Forma 1 de dados. Proibida em `bar` |
| `series[].points` | condicional | `[[x,y], ...]` | Forma 2. Proibida em `bar` |
| `series[].x` + `series[].y` | condicional | dois arrays | Forma 3. Em `bar`, **só `y`** (ver abaixo) |

Uma série sem nenhuma das três formas de dados é `series_invalid` (exit 2).

#### `bar`: o que "agrupado por categoria" quer dizer

O eixo X de um `bar` é **categórico, não numérico** — é por isso que ele precisa de `categories` e
não de `x`. A semântica é:

- **Um grupo por categoria**, na ordem de `categories[]`, igualmente espaçados.
- **Uma barra por série dentro de cada grupo**, lado a lado, na ordem de `series[]`, cada série com
  a sua cor do Okabe-Ito (§6). Com uma série só, o "grupo" tem uma barra e o resultado é o gráfico
  de barras simples.
- Cada série carrega **`y`**, um array de números **paralelo a `categories`**:
  `len(series[i].y) == len(categories)` para toda série. Divergência de comprimento é
  `series_invalid` (exit 2) — não se preenche buraco com zero, porque zero é um valor e ausência
  não é.
- `y` pode conter `null` para "não medido nesta categoria": a barra é **omitida** (não desenhada
  como zero) e um `warning` registra a omissão.
- **Ancorado em zero, sempre** (§5), com padding só no topo.

```json
{
  "type": "bar",
  "title": "comparações por algoritmo, entrada de 1000 elementos",
  "x_label": "algoritmo",
  "y_label": "comparações (contagem)",
  "categories": ["bubble", "merge", "quick"],
  "series": [
    { "label": "melhor caso", "y": [999, 8987, 8987] },
    { "label": "pior caso",   "y": [499500, 8987, 499500] }
  ]
}
```

Isso desenha três grupos (`bubble`, `merge`, `quick`), dois retângulos em cada — a comparação que
a aula quer é *dentro* do grupo, e é por isso que as barras ficam encostadas.

#### `force_legend`

A legenda é desenhada automaticamente quando há **2 ou mais séries**. `force_legend: true` manda
desenhá-la também com **uma** série — útil quando o `label` carrega informação que o título não
carrega ("medido em Python 3.14", "n = 1000").

`force_legend: false` (o default) **não esconde** legenda: com 2+ séries ela sai de qualquer jeito.
Não existe forma de suprimi-la, e isso é deliberado — sem legenda, a distinção entre séries fica
só na cor, que é exatamente a regra que a §6 proíbe.

**Três formas de passar dados numa série, mutuamente exclusivas, nesta precedência:**

1. `"expr"` + `"domain": [a,b]` + `"samples": N` (default 400) — o renderizador amostra
   `N` valores uniformes em `[a,b]` e avalia `expr`. `expr` é avaliado com `eval` num
   namespace **restrito**: só os nomes de `math` (`sin`, `cos`, `log`, `sqrt`, `pi`,
   `e`, …), `abs/min/max/round/pow`, e a variável `x`. `__builtins__` é zerado. Uma
   amostra que levantar exceção (divisão por zero, `log` de negativo, domínio inválido)
   vira `null` — a linha quebra ali em vez de ser interpolada por cima da assíntota, e
   um `warning` registra quantas amostras foram indefinidas.
2. `"points": [[x,y], ...]` — pares explícitos. `y` pode ser `null` (quebra de linha).
3. `"x": [...]` + `"y": [...]` — dois arrays paralelos.

**Nota de segurança**: `eval` restrito não é sandbox. É aceitável porque o único
chamador é o próprio tutor no mesmo processo de confiança que já compila e roda o
código do desafio. O renderizador **nunca** deve receber `expr` vindo direto de texto
colado pelo aluno sem o tutor ter lido. Registrado como limitação conhecida.

### 4.3 Tipos suportados — o mínimo obrigatório

| `type` | O que faz | Uso pedagógico típico |
|---|---|---|
| `function` | amostra `expr` (ou usa `points`) e liga por polilinha; quebra em `null`; recorta na moldura | y=f(x), derivada numérica, série de Taylor vs. função |
| `line` | idem, mas sem amostragem automática — série já discreta ligada em ordem | convergência por iteração, erro por época |
| `scatter` | um marcador por ponto, sem ligação | tempo medido vs. n, pares de dados, dispersão |
| `bar` | barras verticais **agrupadas por categoria** (exige `categories`; uma barra por série dentro de cada grupo — §4.2), **ancoradas em zero** | comparar contagem de operações entre algoritmos |

Em `function` e `line`, cada série ganha **marcadores esparsos** (≈8 ao longo da curva)
além da linha — canal redundante à cor (§5).

### 4.4 Saída — arquivos + JSON no stdout

Grava em `--out-dir`: `<basename>.svg`, `.html`, `.txt`, `.md`, e `.png` se `--png`.

E imprime no **stdout** (a menos que `--quiet`) um objeto JSON — este é o canal pelo
qual o modelo "vê" o gráfico:

```json
{
  "ok": true,
  "type": "function",
  "outputs": {
    "svg": "/caminho/absoluto/fn.svg",
    "png": "/caminho/absoluto/fn.png",
    "html": "/caminho/absoluto/fn.html",
    "ascii": "/caminho/absoluto/fn.txt",
    "description": "/caminho/absoluto/fn.md"
  },
  "description_text": "Gráfico (function): seno e cosseno.\nEixo X = ...",
  "ascii_text": "  1 |⠒⠦⡀...",
  "warnings": ["série '1/x': 1 de 201 amostras indefinidas (descontinuidade/domínio)"],
  "stats": { "series": 2, "points": 600, "x_limits": [...], "y_limits": [...] }
}
```

Em erro, o stdout é `{"ok": false, "error": "<código>: <detalhe>"}` e nenhum arquivo é
gravado.

**Exit codes** (regra `!= 0`, nunca `== 1`). Esta é a **exceção nomeada 2** da tabela de códigos
de saída do produto (`docs/05-challenges-tdd.md` §3.4 do repositório): `render-plot.py` usa
**0/1/2/3**, e não a faixa `0/1/2/3/4/5/10` dos `SK/scripts/*.sh`. O motivo é que os quatro
valores aqui descrevem **o gráfico**, não a skill — e a distinção "spec inválida" × "dados
inválidos" é a que decide se o tutor corrige o JSON ou vai investigar o programa do aluno. Nenhum
outro script tem exceção.

| Código | Significado | `error` |
|---|---|---|
| `0` | sucesso (pode ter `warnings`) | — |
| `1` | spec inválida: JSON malformado, chave obrigatória ausente ou `type` fora do enum (a lista fechada está em §4.2) | `spec_json_invalid`, `spec_missing_key` |
| `2` | dados inválidos: `series` vazia, série sem `points`/`x`,`y`/`expr`, `len(series.y) != len(categories)` num `bar`, nenhum ponto finito | `series_invalid`, `no_valid_data` |
| `3` | falha de escrita: `--out-dir` sem permissão, disco cheio | `write_failed` |

A fronteira entre `1` e `2` é: **`1` é problema de forma** (a spec está errada como documento);
**`2` é problema de conteúdo** (a spec está bem-formada e os dados não sustentam um gráfico). É
essa fronteira que diz ao tutor se ele corrige o JSON que escreveu ou se vai olhar o programa do
aluno que produziu os números.

Falha de PNG **não** é erro: vira `warning` (`png_skipped: nem rsvg-convert nem
ImageMagick no PATH`) com exit 0. O SVG já entregou o resultado.

### 4.5 Regras internas obrigatórias

- **Ticks "nice"**: passo escolhido em {1, 2, 2.5, 5, 10} × 10ⁿ, alvo de ~6 marcas por
  eixo. Nunca rótulo tipo `3.1400000000000001`.
- **Precisão do rótulo de eixo ≠ precisão da descrição.** O eixo arredonda ao passo do
  tick (legibilidade); a descrição usa **≥4 dígitos significativos** (`%.4g`). O
  protótipo falhou nisso primeiro: reportou "pico em x=0" para 1/x e "x=-6" para
  cos(−6,283) — ambos inúteis. São canais com objetivos diferentes.
- **`bar` ancora em zero exato**, sem padding negativo. O protótipo primeiro aplicou o
  padding de 8% e produziu `y_limits: [-29186, 539000]` para contagens todas positivas —
  eixo com região negativa fantasma. Padding em barra só se aplica no **topo**.
- **Recorte na moldura**: séries com valores fora de `y_limits` são cortadas na borda,
  nunca desenhadas por cima dos eixos.
- **`viewBox` sempre presente** — sem ele o SVG não escala no HTML.
- **Fundo branco explícito** (`<rect width height fill="#ffffff"/>`) como primeiro
  elemento. SVG transparente desaparece em tema escuro.
- **`role="img"` + `<title>` + `<desc>`** no `<svg>`, com a descrição (d) dentro de
  `<desc>` — alt-text embutido no próprio arquivo, para leitor de tela.
- **Escape XML/HTML de todo texto vindo do spec** (`html.escape(..., quote=True)`).
  Um `&` num rótulo corrompe o SVG inteiro.
- **Auto-verificação**: o SVG gerado deve ser parseável por
  `xml.etree.ElementTree.parse` — é um teste de 3 linhas e pega qualquer erro de escape.

### 4.6 Limites honestos do stdlib puro

O que este renderizador **não** faz, e não deve fingir que faz:

| Não faz | Por quê | O que fazer em vez disso |
|---|---|---|
| interatividade (zoom, tooltip, pan) | exigiria JS de plotagem embutido | `<title>` nas barras dá tooltip nativo do navegador; o resto é upgrade |
| antialiasing e tipografia de publicação | é o rasterizador que decide; `rsvg-convert` já entrega bom AA | aceitar; não é gargalo pedagógico |
| heatmap / imagem de densidade | milhares de `<rect>` incham o SVG | grade grossa (≤40×40) ou upgrade para matplotlib |
| scatter com >5 000 pontos | tamanho de arquivo e tempo de parse | amostrar antes de plotar, e dizer que amostrou |
| eixo log | não implementado na v1 | `expr` com `log10(...)` e rótulo dizendo isso, ou upgrade |
| 3D, superfície, campo vetorial | projeção 3D à mão é muito código para o retorno | upgrade para matplotlib |
| animação | ver §7 | sequência de PNGs numerados |
| layout automático de grafo | é o problema difícil que o Graphviz resolve | ver §6 |

### 4.7 Onde os arquivos são gravados

**O diretório de saída é `researchs/assets/<NNNN>-<slug>/`**, dentro do setup do aluno, onde
`<NNNN>-<slug>` é o research a que a figura pertence (`researchs/<NNNN>-<slug>.md`).

Isso corrige um engano que estava neste documento e nas duas references: `<sessão>/viz/` **não
existe**. Uma sessão é `memory/NNNN.json`, um **arquivo**, não um diretório — não há onde criar
`viz/` dentro dele. Os quatro artefatos de uma figura (`.svg`, `.html`, `.txt`, `.md`, mais o
`.png` opcional) precisam de um diretório de verdade.

Três consequências de projeto:

- **A figura acompanha o material destilado, não o desafio.** `researchs/` é onde mora o conteúdo
  que sobrevive à sessão (`docs/01-arquitetura.md` §2.3 do repositório); a figura que explica uma
  curva é exatamente isso. Um desafio pode ser refeito ou descartado sem levar a figura junto.
- **Um subdiretório por research**, não um `assets/` plano. Uma aula com seis passos gera
  `passo-01.svg` … `passo-06.svg`; num diretório compartilhado esses nomes colidem na primeira
  repetição.
- **Nunca `/tmp`.** O aluno vai querer reabrir a figura depois, e `/tmp` some no reboot.

Quando a figura não pertence a nenhum research — um gráfico feito ao vivo para responder uma
dúvida —, o tutor cria o research primeiro (é uma linha em `researchs/`) e a figura entra nele. A
alternativa, um diretório solto, produz arquivos órfãos que ninguém volta a abrir.

---

## 5. Escala e eixos sem enganar

Regras que o renderizador aplica e que o tutor **não pode** contornar sem dizer ao aluno:

- **Barra sempre a partir de zero.** Truncar o eixo Y numa barra exagera a diferença —
  é a distorção visual mais comum e mais fácil de evitar. Se o aluno precisa ver
  diferença pequena entre valores grandes, o gráfico certo é de **linha ou pontos** com
  eixo truncado e rótulo dizendo, não uma barra truncada.
- **Truncar o eixo de linha/scatter é permitido, declarar é obrigatório.** Se
  `y_limits` não inclui zero, a descrição (d) diz os limites reais — e ela sempre diz.
- **Escala logarítmica nunca é silenciosa.** O rótulo do eixo precisa conter "(log)" ou
  "log₁₀". Um eixo log sem rótulo transforma exponencial em reta e o aluno aprende a
  coisa errada.
- **Comparar duas figuras exige os mesmos limites.** Se o tutor gera "antes" e "depois",
  passa `x_limits`/`y_limits` idênticos nos dois specs. Sem isso, a comparação visual
  mente — e essa é a mentira mais difícil de detectar depois.
- **Proporção honesta.** Default 760×460 (≈1,65:1). Esticar a proporção muda a
  inclinação percebida; para comparar inclinações (ex.: taxas de crescimento), manter a
  mesma razão nas duas figuras.
- **Todo eixo tem rótulo e unidade.** `x_label: "n (tamanho da entrada)"`, não `"n"`.
  `y_label: "tempo (ms)"`, não `"tempo"`. Um número sem unidade não ensina nada.
- **Origem visível quando ela é o ponto.** Se a aula é sobre raiz, intercepto ou sinal,
  o intervalo precisa conter zero — o renderizador desenha a linha do zero mais escura
  que a grade quando `0` está dentro dos limites.
- **Grade a serviço da leitura, não da decoração.** Cinza claro (`#e2e2e2`), fina, atrás
  de tudo. Se a grade compete com os dados, ela está errada.

---

## 6. Acessibilidade — cor nunca sozinha

**Paleta categórica: Okabe-Ito**, na ordem fixa (pesquisa 05 §7):

| # | Hex | Nome usado na descrição |
|---|---|---|
| 1 | `#E69F00` | laranja |
| 2 | `#56B4E9` | azul-céu |
| 3 | `#009E73` | verde-azulado |
| 4 | `#F0E442` | amarelo |
| 5 | `#0072B2` | azul |
| 6 | `#D55E00` | vermelhão |
| 7 | `#CC79A7` | roxo-avermelhado |
| 8 | `#000000` | preto |

**Máximo 8 categorias.** Passou de 8, o gráfico está errado antes da cor: agrupe,
destaque uma série e apague as outras em cinza, ou faça vários gráficos pequenos.

**Escala contínua: viridis ou cividis** — para variável ordenada (magnitude, densidade,
tempo). Nunca Okabe-Ito em gradiente, nunca arco-íris/jet.

**A regra dura: nenhuma informação codificada só por cor.** Toda distinção que a cor
carrega tem pelo menos um segundo canal:

| Série | Cor | Marcador | Traço |
|---|---|---|---|
| 1 | laranja | círculo | sólida |
| 2 | azul-céu | quadrado | tracejada |
| 3 | verde-azulado | triângulo | pontilhada |
| 4 | amarelo | losango | traço-ponto |
| 5 | azul | xis | pontilhada fina |
| 6 | vermelhão | cruz | traço longo |
| 7 | roxo-avermelhado | estrela | traço-ponto-ponto |
| 8 | preto | hexágono | traço curto |

O renderizador emite os três canais juntos, sempre. Isso cobre daltonismo, impressão
em preto e branco, e leitura de ASCII (onde a cor não existe).

**A legenda nomeia os três canais em texto**: `sen(x) (círculo, sólida)`. Alguém lendo
a descrição sem ver a figura consegue mapear.

**Alt-text obrigatório em dois lugares**: `<desc>` dentro do SVG (leitor de tela ao
abrir o arquivo) e a descrição (d) visível como texto no HTML (leitor de tela e olho
humano). Não é escolha entre os dois.

---

## 7. Visualizar algoritmo, não só função

Plotar `f(x)` é o caso fácil. Ensinar algoritmo pede mostrar **estrutura e estado**.
Aqui o cenário é mais duro: **`dot` (Graphviz) não está instalado**, então o caminho que
a pesquisa 05 §6.1/6.2 recomenda não roda. O que dá para fazer sem ele:

### 7.1 Recursão — árvore de chamadas

**Sem Graphviz, duas rotas que funcionam hoje:**

**Rota A — ASCII estruturado (custo zero, sempre disponível).** O aluno instrumenta a
própria função recursiva para imprimir com indentação por profundidade. Isso é
pedagogicamente **melhor** que um diagrama pronto: o aluno escreve o instrumento.

```
fib(4)
├─ fib(3)
│  ├─ fib(2)
│  │  ├─ fib(1) → 1
│  │  └─ fib(0) → 0
│  └─ fib(1) → 1
└─ fib(2)
   ├─ fib(1) → 1
   └─ fib(0) → 0
→ 3   |   chamadas: 9   |   profundidade máx: 3
```

Funciona em qualquer linguagem (só precisa de `print` com indentação), aparece direto
no chat, e a repetição de `fib(2)` fica visível — que é o ponto da aula sobre
memoização.

**Rota B — SVG de árvore escrito à mão.** Para árvore pequena (≤15 nós) com posições
calculáveis, gerar `<circle>`+`<line>`+`<text>` diretamente. **Verificado por execução**:
um SVG de árvore de chamadas feito à mão rasterizou com `rsvg-convert` para PNG de
1 393 cores, com o texto dos nós renderizado corretamente. Não precisa de Graphviz —
precisa de um algoritmo de layout, e para árvore o layout é trivial (nível = `y`,
posição no nível = `x`).

O que se perde sem Graphviz: layout automático de grafo **arbitrário** (com ciclos,
arestas cruzadas, minimização de cruzamentos). Isso é problema difícil de verdade e
não vale reimplementar.

### 7.2 Estruturas de dados

| Estrutura | Sem Graphviz | Como |
|---|---|---|
| lista ligada | ASCII | `[3] -> [7] -> [1] -> None` |
| pilha / fila | ASCII | caixas empilhadas com marca de topo/base |
| array com índices | ASCII | linha de valores + linha de índices + `^` no ponteiro |
| árvore binária | ASCII ou SVG (7.1 rota B) | layout por nível — trivial |
| grafo pequeno (≤10 nós) | SVG à mão | posicionar em círculo, arestas como `<line>`/`<path>` |
| grafo arbitrário | **mermaid**, ou upgrade | ver abaixo |

**mermaid** é opção real, com uma condição estrita: só vale quando o **visualizador do
aluno renderiza mermaid nativamente** (GitHub, VS Code, Obsidian). Aí o custo é zero —
é só texto num bloco ```mermaid.

Como **arquivo de imagem**, mermaid está fora. `npx -p @mermaid-js/mermaid-cli mmdc`
foi tentado nesta máquina e **falhou** com `ERR_MODULE_NOT_FOUND` no Node 24.19.0,
antes mesmo de chegar ao Chromium que ele sobe por Puppeteer — **verificado por
execução**. Ou seja: não é só "pesado", é quebrado aqui. Nunca prometer diagrama
mermaid como imagem.

### 7.3 Complexidade — tempo medido vs. curva teórica

Este é o caso onde o renderizador brilha e não falta nada. Não existe biblioteca
especializada; é medir e plotar.

1. o aluno implementa o algoritmo **na linguagem da aula**;
2. mede o tempo para tamanhos crescentes de `n` com o relógio da própria linguagem
   (`time.perf_counter`, `performance.now()`, `time.Now()`, `std::chrono`,
   `Instant::now()`, `os.clock()`);
3. escreve os pares `(n, tempo)` num JSON;
4. `render-plot.py --spec` com **duas séries**: medido (`scatter`) e teórico
   (`line`) — a comparação visual é o conteúdo da aula.

Pedagogicamente o valor está em **sobrepor medido e teórico na mesma figura com os
mesmos limites de eixo**. Uma curva medida sozinha não ensina complexidade.

### 7.4 Execução passo a passo

Python Tutor é a referência (pesquisa 05 §6.4), mas é serviço web, não biblioteca. O
princípio replicável localmente, sem instalar nada:

- **estado como tabela de texto por passo** — a cada iteração relevante, imprimir uma
  linha com as variáveis de interesse. É o que um instrutor escreve no quadro. Barato,
  funciona em todas as linguagens, e o aluno escreve o instrumento;
- **sequência de figuras numeradas** — `passo-01.svg`, `passo-02.svg`, … com o mesmo
  `x_limits`/`y_limits` em todas (senão a "animação" mental mente), mais um HTML que
  as empilha em ordem;
- **snapshot da estrutura por passo** — o ASCII da §7.2 impresso a cada iteração; para
  ordenação, uma linha do array por passo é a visualização canônica e cabe no chat.

---

## 8. O caminho de upgrade — quando oferecer o venv

O default nunca pede instalação. Mas há casos onde o stdlib puro não entrega, e aí a
skill **oferece** — sem impor, sem instalar por conta própria, sem bloquear a aula.

**Quando vale oferecer** (qualquer um destes):
- o aluno pediu explicitamente qualidade de imagem melhor;
- a aula precisa de heatmap, 3D, superfície, campo vetorial ou eixo log real;
- a aula precisa de scatter com milhares de pontos;
- o aluno vai passar várias sessões em visualização (o custo se amortiza).

**Quando NÃO oferecer**: primeira sessão; gráfico único e simples; aluno que só quer
ver a forma da curva; sessão em máquina que não é dele.

**Como a skill oferece** — uma frase, com o custo explícito, e a aula continua qualquer
que seja a resposta:

> Este gráfico ficaria melhor com matplotlib. Posso criar um ambiente virtual isolado
> em `~/.local/share/study-method/venv` (≈60 MB, uma vez, não mexe no Python do
> sistema) — ou seguimos com o renderizador embutido, que já resolve este caso.
> Prefere qual?

**PEP 668 em uma linha**: o Python do sistema é gerenciado pela distro, então
`pip install` direto é recusado com `externally-managed-environment` — a saída correta
é um venv, não `--break-system-packages` (que pode quebrar pacotes do `pacman`).

**Comandos, se o aluno aceitar:**
```bash
python3 -m venv ~/.local/share/study-method/venv
~/.local/share/study-method/venv/bin/pip install --quiet matplotlib
MPLBACKEND=Agg ~/.local/share/study-method/venv/bin/python script.py
```

`MPLBACKEND=Agg` é obrigatório (pesquisa 05 §2): sem backend não-interativo, um
`plt.show()` num ambiente sem display trava ou lança erro de X11.

**O que muda quando o aluno aceita:** o renderizador stdlib **continua sendo o default**.
O venv vira uma rota extra para os casos da lista acima. As quatro saídas da §3
continuam obrigatórias — matplotlib gera (a) melhor, mas (b), (c) e (d) continuam sendo
responsabilidade da skill, e (d) especialmente: matplotlib não descreve a própria
figura, e o modelo continua sem enxergá-la.

O estado do venv fica registrado no **`setup.json`** — o manifesto do setup, na raiz dele. Não
existe `meta.json` de setup: `meta.json` é o manifesto de **um desafio**, dentro de
`challenges/<NNNN>-<slug>/`. Gravar estado de setup num arquivo que só existe por desafio
significa reperguntar a cada desafio novo, que é o oposto do que se quer aqui.

---

## 9. O que fica FORA do prometido

Declarado aqui para que nem a skill nem o tutor prometam ao aluno:

| Fora | Motivo | Status |
|---|---|---|
| **Animação/vídeo (Manim)** | exige `cairo` + `pkg-config`, e **LaTeX para qualquer fórmula** (`Tex`/`MathTex` chamam `latex` e `dvisvgm`) — TeX Live passa de 1 GB. Para um tutor de matemática, LaTeX deixa de ser opcional na prática. | **upgrade opcional**, nunca oferecido de forma proativa |
| **Diagrama de grafo com layout automático** | `dot` ausente; layout de grafo arbitrário é problema difícil e não vale reimplementar | **upgrade opcional** (`pacman -S graphviz`), com ASCII/SVG-à-mão da §7 como capacidade real |
| **mermaid como arquivo de imagem** | `npx mmdc` **falha nesta máquina** (`ERR_MODULE_NOT_FOUND`, Node 24.19.0, verificado por execução), e mesmo funcionando sobe Chromium via Puppeteer | **fora**; mermaid *inline em Markdown* é capacidade real quando o visualizador do aluno renderiza |
| **Gráfico interativo (zoom/pan/tooltip rico)** | exigiria biblioteca JS embutida no HTML | fora do escopo v1; `<title>` nas barras dá tooltip nativo |
| **Renderizar imagem dentro do terminal** | sixel/kitty/imgcat dependem do emulador do aluno e não são detectáveis de forma confiável | fora; braille (c) é o substituto honesto |
| **3D, superfície, campo vetorial** | projeção à mão custa muito para o retorno | upgrade via matplotlib |

Regra de comunicação: o tutor pode dizer "posso gerar isso se você instalar X". O tutor
**não** pode dizer "vou gerar uma animação" e depois descobrir que precisa de LaTeX.

---

## 10. Decisões consolidadas

| # | Decisão | Consequência |
|---|---|---|
| D1 | Renderizador ortogonal à linguagem da aula | toda linguagem ganha gráfico; contrato é JSON, não API |
| D2 | Default = emissor de SVG em stdlib pura | zero instalação na primeira sessão |
| D3 | Quatro saídas obrigatórias: SVG/PNG, HTML, ASCII, descrição | cobre durabilidade, portabilidade, terminal e o cegamento do modelo |
| D4 | Descrição textual **computada** pelo renderizador, não escrita pelo modelo | impede o modelo de alucinar sobre a própria saída |
| D5 | Entrada é um único JSON via `--spec`/stdin | CLI estável, um só caminho de validação |
| D6 | Okabe-Ito + marcador + traço, sempre os três | nunca informação só por cor |
| D7 | Barra ancora em zero; truncamento sempre declarado | honestidade visual não é negociável |
| D8 | Bibliotecas são upgrade oferecido, nunca pré-requisito | PEP 668 não bloqueia a aula |
| D9 | Animação e layout de grafo ficam fora do prometido | nada de promessa que vira instalação de 1 GB |
| D10 | Saída em `researchs/assets/<NNNN>-<slug>/`, nunca `<sessão>/viz/` nem `/tmp` | a figura acompanha o material destilado e sobrevive ao desafio (§4.7) |
| D11 | O `spec` tem lista fechada de chaves; `bar` exige `categories` | `spec_missing_key` passa a cobrar algo nomeável, e agrupamento de barra deixa de ser suposição (§4.2) |

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-V01 | Quando um gráfico exigir mais do que o renderizador stdlib entrega, a skill deve oferecer criar um venv com matplotlib, ou ficar em stdlib puro e avisar a limitação? | (a) oferecer o venv na hora, uma vez, e lembrar a resposta no `setup.json`; (b) nunca oferecer — só declarar a limitação; (c) criar o venv sozinha no primeiro setup, sem perguntar | **(a)** — oferece com custo explícito, aula continua se recusar; (c) viola "não instalar sem consentimento". A resposta fica no **`setup.json`** (manifesto do setup), não num `meta.json` — este é o manifesto de um desafio | cheap (apagar o diretório do venv) |
| D-V02 | Depois de gerar o HTML, a skill deve abri-lo automaticamente (`xdg-open`) ou só informar o caminho? | (a) só informar o caminho; (b) abrir automático sempre; (c) abrir na primeira vez da sessão e depois só informar | **(a)** — abrir janela sem pedir é intrusivo em SSH/tmux e pode travar em ambiente sem GUI | cheap (uma flag no `setup.json`) |
| D-V03 | O fallback ASCII/braille deve ser impresso no chat sempre que um gráfico é gerado, ou só quando o aluno pedir / não houver GUI? | (a) sempre inline; (b) só sob demanda ("mostra no terminal"); (c) automático só quando `$DISPLAY`/GUI ausente ou o gráfico tem 1 série e ≤50 pontos | **(c)** — dá feedback imediato onde é legível e não polui o chat com mancha braille | cheap |
| D-V04 | A escolha da linguagem da aula é do **setup** (uma para todo o estudo) ou da **sessão** (pode mudar a cada aula)? | (a) por setup, com override explícito por sessão; (b) por sessão, sempre perguntada; (c) por assunto (matemática numa, programação noutra) | **(a)** — consistência ajuda o aluno a acumular fluência; override cobre o caso de querer variar | moderate (desafios já gerados ficam na linguagem antiga) |
| D-V05 | Quando a linguagem escolhida pelo aluno **não está instalada**, o que a skill faz? | (a) oferecer instalar e mostrar o comando exato da distro, sem executar; (b) sugerir a linguagem instalada mais próxima e seguir; (c) tentar mesmo assim e falhar; (d) bloquear até instalar | **(a)+(b) combinados** — mostra o comando de instalação E oferece continuar hoje numa linguagem instalada; nunca (c), que produz erro sem diagnóstico | cheap (só decide o que roda hoje) |
| D-V06 | O renderizador deve aceitar `expr` (string avaliada com `eval` restrito) ou exigir que o chamador calcule todos os pontos? | (a) aceitar `expr` com namespace restrito a `math`; (b) só `points`/`x`,`y`; (c) aceitar `expr` mas só quando vier do tutor, nunca de texto colado pelo aluno | **(c)** — `expr` economiza muito token para y=f(x); a restrição de origem é a mitigação honesta | cheap (remover o ramo do código) |
| D-V07 | PNG deve ser gerado sempre (quando há rasterizador) ou só sob pedido (`--png`)? | (a) só com `--png`; (b) sempre que `rsvg-convert`/`magick` existir; (c) sempre, e falhar se não houver rasterizador | **(a)** — SVG+HTML já cobrem; PNG é para quando o aluno vai colar a imagem em outro lugar | cheap |
| D-V11 | **RESOLVIDA (AR-23)** — onde fica o estado de setup (venv aceito, linguagem confirmada)? | `meta.json` do setup (**não existe**) · **`setup.json`** · registry global | **`setup.json`**, o manifesto na raiz do setup. `meta.json` é o manifesto de **um desafio**, em `challenges/<NNNN>-<slug>/`; gravar estado de setup ali significa reperguntar a cada desafio | — decidida |
| D-V12 | **RESOLVIDA (§4.7)** — diretório de saída dos gráficos | `<sessão>/viz/` (**impossível**: sessão é um arquivo JSON) · **`researchs/assets/<NNNN>-<slug>/`** · `/tmp` | **`researchs/assets/<NNNN>-<slug>/`** (§4.7). A figura pertence ao material destilado, sobrevive ao desafio, e precisa de um diretório de verdade para caber nos quatro artefatos | cheap (mover arquivos) |
| D-V13 | **RESOLVIDA** — chaves obrigatórias do `spec` e semântica de `categories`/`force_legend` | indefinidas (o exit `spec_missing_key` não cobrava nada) · **lista fechada na §4.2** | **lista fechada** (§4.2): obrigatórias `type`, `title`, `x_label`, `y_label`, `series`; `categories` obrigatória e exclusiva de `bar`; `force_legend` só **força** a legenda com uma série, nunca a esconde | cheap |
