# 70 — `render-plot.py`: spec JSON, 4 saídas, exit codes

Fragmento do BUILD_SPEC. **Contrato, não racional** — o porquê está em
`docs/06-visualizacao.md` §3 e §4. Dono: sub-tarefa 3.7.

Artefato: `SK/scripts/render-plot.py` (1 351 linhas, Python 3.9+).
Imports: `argparse`, `html`, `json`, `math`, `os`, `shutil`, `subprocess`, `sys`,
`xml.etree.ElementTree`. **Nenhum import de terceiro.** Se um `import` externo
aparecer no arquivo, o arquivo está errado.

---

## 1. CLI

```
render-plot.py [--spec CAMINHO|-] [--out-dir DIR] [--basename NOME]
               [--width N] [--height N] [--ascii-width N] [--ascii-height N]
               [--formats svg,html,txt,md] [--png] [--quiet] [--version]
```

| Flag | Default | Contrato |
|---|---|---|
| `--spec` | `-` | caminho do JSON; `-` lê de stdin. Arquivo inexistente ⇒ exit 1 `spec_read_failed` |
| `--out-dir` | `.` | criado se não existir. Na skill é **sempre** `researchs/assets/<NNNN>-<slug>/` |
| `--basename` | `plot` | prefixo de `<basename>.{svg,html,txt,md,png}` |
| `--width` / `--height` | `760` / `460` | px do SVG. Fora de `240..4000` / `180..4000` ⇒ recortado + `warning` |
| `--ascii-width` / `--ascii-height` | `72` / `18` | células de texto. Fora de `20..400` / `5..200` ⇒ recortado + `warning` |
| `--formats` | `svg,html,txt,md` | subconjunto a gravar. Token fora do conjunto ⇒ exit 1 `cli_invalid`. Faltar `svg`, `html` ou `md` grava assim mesmo e emite `warning` (mínimo aceitável) |
| `--png` | desligado | rasteriza a partir do `.svg`; falha vira `warning`, nunca erro |
| `--quiet` | desligado | suprime o JSON de stdout. **Documentado como "nunca use"**: sem stdout o modelo fica cego sobre o que desenhou |

Não existe flag de dados (`--x`, `--y`, `--expr`): toda a entrada é o JSON.
Erro de CLI sai **1** (problema de forma) e não 2 — `argparse` sai 2 por padrão,
e 2 aqui significaria "dados inválidos", mandando o tutor investigar o programa
do aluno por causa de uma flag digitada errada.

---

## 2. Entrada — `spec`

Contrato completo em `SK/assets/schemas/plot-spec.schema.json`. Chaves em inglês
snake_case; texto livre em pt-BR.

### Raiz

| Chave | Obrigatória | Tipo | Falha |
|---|---|---|---|
| `type` | **sim** | `function\|line\|scatter\|bar` | ausente ou fora do enum ⇒ 1 `spec_missing_key` |
| `title` | **sim** | string não vazia | ⇒ 1 `spec_missing_key` (string só de espaços conta como ausente) |
| `takeaway` | **sim** | string não vazia | ⇒ 1 `spec_missing_key` |
| `series` | **sim** | array | não-array ⇒ 1; **vazio ⇒ 2 `series_invalid`** |
| `x_label` / `y_label` | não (**esperadas**) | string | ausente ⇒ default `"x"` / `"y"` + `warning` nomeando a falta |
| `caption` | não | string | — |
| `x_limits` / `y_limits` | não | `[min, max]` numéricos | formato errado ⇒ 1 `spec_invalid_value`; invertido ⇒ reordenado + `warning` |
| `categories` | **sim se `type=="bar"`** | array de strings | ausente em `bar` ⇒ 1 `spec_missing_key`; presente fora de `bar` ⇒ ignorada + `warning` |
| `force_legend` | não (`false`) | booleano | força legenda com 1 série; **nunca esconde** legenda |

Chave fora dessa lista é **ignorada** (spec de versão futura não quebra) e
registra um `warning`. Mesmo tratamento para chave desconhecida dentro de uma série.

⚑ **Divergência arbitrada.** `docs/06` §4.2 e `SK/references/visualizacao.md` listam
`x_label`/`y_label` como obrigatórias; `plot-spec.schema.json` (`required`) lista
`type`, `title`, `takeaway`, `series`. O implementado segue o **schema** para o que é
erro duro — assim toda spec válida contra o schema renderiza — e rebaixa
`x_label`/`y_label` a `warning` explícito. Quem quiser a regra estrita muda uma linha
(`REQUIRED_ROOT`); quem quiser alinhar os documentos altera a tabela da §4.2.

### Série — três formas mutuamente exclusivas, nesta precedência

1. `expr` + `domain: [a,b]` + `samples` (default `400`, faixa `2..20000`, fora dela
   recortado + `warning`);
2. `points: [[x, y|null], ...]`;
3. `x: [...]` + `y: [...]` paralelos (`len` diferente ⇒ 2 `series_invalid`).

`label` (string não vazia) é obrigatório em toda série ⇒ 1 `spec_missing_key`.
Mais de uma forma presente: vale a de maior precedência + `warning`.
Nenhuma das três ⇒ **2 `series_invalid`**.

`expr` é avaliado com `eval` num namespace restrito: todos os nomes de `math`,
mais `abs/min/max/round/pow` e a variável `x`, com `__builtins__` zerado.
`expr` contendo `__` é recusada (1 `spec_expr_invalid`); expressão que não compila
também. Amostra que levanta exceção vira `null` — quebra a linha ali, não interpola
por cima da assíntota — e um `warning` conta quantas. ⚠️ **Não é sandbox**: `expr` só
pode vir do tutor, nunca de texto colado pelo aluno sem leitura.

### `bar`

- `categories[]` define os grupos, na ordem; o eixo X é **categórico**.
- Cada série leva **`y` paralelo a `categories`**; `len(y) != len(categories)` ⇒
  2 `series_invalid` (não se preenche buraco com zero).
- `y[i] == null` ⇒ barra **omitida** (não desenhada como zero) + `warning`.
- `expr`/`points` numa série de `bar` são ignorados + `warning`.
- `y_limits` é **ignorado** em `bar` + `warning`: a barra ancora em zero.

---

## 3. Saídas

### Arquivos (`--out-dir`/`<basename>.*`)

| Arquivo | Conteúdo |
|---|---|
| `.svg` | SVG standalone com `xmlns`, `viewBox`, `role="img"`, `<title>`, `<desc>` (a descrição textual inteira), fundo branco explícito como primeiro elemento |
| `.html` | documento único: título, SVG **inline**, legenda, a descrição **visível como texto**, `<details>` com o ASCII e `<details>` com o dump JSON dos pontos (máx. 2 000 por série, com marca `truncated`) |
| `.txt` | o `ascii_text` integral (idêntico byte a byte ao campo do stdout) |
| `.md` | o `description_text` integral (idêntico byte a byte ao campo do stdout) |
| `.png` | só com `--png` e só se algum rasterizador funcionar |

O HTML tem **zero referência externa**: nenhum `<script>`, `<link>`, `src=`, `href=`,
`@import`, `url()` para fora, nenhuma fonte remota (famílias genéricas apenas). O SVG
inline no HTML é emitido **sem** o atributo `xmlns` — o parser de HTML já atribui o
namespace, e assim o documento não contém sequer a string de um esquema de URL. Tema
claro/escuro por `prefers-color-scheme`, com o painel da figura **sempre** em fundo
claro.

### stdout (a menos que `--quiet`)

```json
{"ok": true, "type": "function",
 "outputs": {"svg": "...", "png": "...", "html": "...", "ascii": "...", "description": "..."},
 "description_text": "...", "ascii_text": "...", "warnings": ["..."],
 "stats": {"series": 2, "points": 600, "points_finite": 599, "undefined_samples": 1,
           "x_limits": [a, b], "y_limits": [c, d], "width": 760, "height": 460,
           "png_tool": "rsvg-convert"}}
```

Chaves de `outputs` só existem para arquivos realmente gravados; caminhos são
**absolutos**. Em erro: `{"ok": false, "error": "<código>: <detalhe>"}` no stdout,
a mesma linha em stderr, e **nenhum arquivo gravado**.

### A descrição textual — computada, nunca escrita pelo modelo

Ordem fixa: (1) tipo e título (+ `caption`); (2) cada eixo com rótulo e **limites
reais**; (3) uma linha por série com rótulo, **cor nomeada em palavra**, marcador,
traço, nº de pontos, indefinidos, mínimo e máximo **com o x (ou a categoria) onde
ocorrem**, e a forma; (4) `Avisos:` — a lista inteira, ou `nenhum`; (5) `Leitura:` +
o `takeaway`.

Formas possíveis, todas calculadas dos pontos plotados:
`monotônica crescente` · `monotônica decrescente` · `constante` ·
`muda de direção 1 vez (um pico ou um vale)` · `oscila (N inversões de direção)` ·
`patamares: N segmento(s) constante(s) em níveis diferentes` ·
`N ponto(s) isolado(s) separados por quebras: sem forma contínua` ·
`menos de 2 pontos finitos: sem forma`. Com `null` no meio, a contagem é feita
**por segmento** e o sufixo `em N segmentos` aparece — o salto sobre a
descontinuidade não é contado como inversão.

Quando o eixo Y de um `line`/`scatter` não contém o zero, a descrição diz
"escala truncada" em linha própria.

---

## 4. Exit codes — exceção nomeada (`docs/00-contratos.md` §5.2)

| Código | Significado | `error` observados |
|---|---|---|
| `0` | sucesso, com ou sem `warnings` | — |
| `1` | **forma**: a spec está errada como documento | `spec_json_invalid`, `spec_read_failed`, `spec_missing_key`, `spec_invalid_value`, `spec_expr_invalid`, `cli_invalid` |
| `2` | **conteúdo**: a spec está bem-formada e os dados não sustentam um gráfico | `series_invalid`, `no_valid_data` |
| `3` | falha de escrita; nada foi gravado | `write_failed` (inclui `svg_selfcheck_failed`) |

Regra de leitura: `!= 0` é falha, **nunca** `== 1`.
Falha de PNG **não** é erro: `warning` `png_skipped: …` com exit `0`.

---

## 5. Regras internas obrigatórias

**Escala**
- Ticks "nice": passo em {1, 2, 2.5, 5, 10} × 10ⁿ, alvo de ~6 marcas. As marcas são
  as que **cabem dentro** dos limites; os limites nunca são esticados até um número
  redondo.
- `bar` ancora em **zero exato**: `lo = min(0, mínimo)`, `hi = max(0, máximo)`, e o
  padding de 8% só se aplica ao lado **oposto ao zero**. Contagens todas positivas
  produzem `y_limits[0] == 0.0`.
- `line`/`scatter`/`function`: padding de 8% em Y; 5% em X só no `scatter`. O padding
  **nunca cruza o zero**: dados todos ≥ 0 não ganham região negativa de folga.
- Limites forçados fora dos dados: os pontos são **recortados na moldura**
  (`clipPath`), nunca desenhados por cima dos eixos, e um `warning` conta quantos.
- Escala dominada por extremos (máx |y| > 50 × mediana |y|): `warning` declarando o
  fato e sugerindo `y_limits`.
- **Precisão do eixo ≠ precisão da descrição**: o eixo arredonda ao passo do tick;
  a descrição usa `%.4g`. Reportar "pico em x=0" para `1/x` é consequência de
  confundir os dois.

**Cor nunca sozinha**
- Okabe-Ito na ordem fixa, cada índice amarrado a um trio
  (cor, marcador, traço): laranja/círculo/sólida · azul-céu/quadrado/tracejada ·
  verde-azulado/triângulo/pontilhada · amarelo/losango/traço-ponto ·
  azul/xis/pontilhada fina · vermelhão/cruz/traço longo ·
  roxo-avermelhado/estrela/traço-ponto-ponto · preto/hexágono/traço curto.
- Mais de 8 séries: `warning` e a paleta se repete (não é erro de execução).
- `function`/`line` ganham ~8 marcadores esparsos ao longo da curva, deslocados por
  série. `scatter` marca todo ponto e **não** usa traço (a descrição e a legenda
  dizem "sem linha"). `bar` põe o marcador no topo da barra e desenha o contorno com
  o dasharray da série.
- Legenda automática com 2+ séries (ou `force_legend`), nomeando os três canais em
  texto: `sen(x) (círculo, sólida)`. Não há como suprimi-la.

**Acessibilidade e robustez**
- `role="img"` + `<title>` + `<desc>` no SVG, com a descrição inteira no `<desc>`.
- Todo texto vindo do spec passa por `html.escape(..., quote=True)` no SVG e no HTML.
- Linha do zero mais escura que a grade quando o zero está dentro dos limites.
- Barras carregam `<title>` (tooltip nativo do navegador, sem JS).
- **Autoverificação**: o SVG é parseado com `ElementTree.fromstring` **antes** de
  qualquer escrita, e o arquivo gravado é reaberto com `ElementTree.parse`. Falha em
  qualquer um ⇒ exit 3 `write_failed: svg_selfcheck_failed`.

**Braille (U+2800)**
- Célula de 4 linhas × 2 colunas; os pontos 7 e 8 ocupam os bits **altos** apesar de
  ficarem na última linha:
  `{(0,0):0x01,(1,0):0x02,(2,0):0x04,(3,0):0x40,(0,1):0x08,(1,1):0x10,(2,1):0x20,(3,1):0x80}`.
- Fundo preenchido com `U+2800` (BRAILLE PATTERN BLANK), **não** com espaço — espaço
  desalinha a figura em fonte proporcional.
- Segmentos por Bresenham com coordenadas recortadas antes do laço; `scatter` marca
  ponto a ponto. O `.txt` traz título, moldura, extremos dos eixos, a legenda com um
  marcador ASCII por série, a nota de que braille mostra **forma e não valor**, e o
  `takeaway`.

**PNG**
- Ordem de tentativa: `rsvg-convert -w <2×largura> -o <png> <svg>` →
  `magick -density 192 <svg> <png>` → `convert -density 192 <svg> <png>`.
- Timeout de 90 s por tentativa. Nenhum disponível ⇒ `warning`, exit 0, sem `png`
  em `outputs`.

---

## 6. Ordem de execução

1. `argparse` (erro ⇒ 1) → 2. leitura da spec (⇒ 1) → 3. validação de forma (⇒ 1) →
4. construção das séries, avaliação de `expr` (⇒ 1 ou 2) → 5. escala →
6. descrição (1ª passada) → 7. ASCII → 8. SVG standalone + inline → 9. autoverificação
XML (⇒ 3) → 10. `mkdir` + teste de permissão (⇒ 3) → 11. grava `.svg` e `.txt` (⇒ 3) →
12. PNG (só `warning`) → 13. **descrição refeita** já com os avisos de PNG → 14. grava
`.md` e `.html` → 15. stdout JSON, exit 0.

A descrição é computada duas vezes de propósito: a primeira entra no `<desc>` do SVG
(que precisa existir antes do PNG), a segunda — a que vai para `.md`, HTML e stdout —
é a completa.

---

## 7. O que este renderizador não faz

Interatividade (zoom/pan/tooltip rico) · eixo logarítmico · heatmap · 3D, superfície,
campo vetorial · animação · layout automático de grafo · scatter com mais de ~5 000
pontos sem amostrar antes · distinguir séries no braille (uma única malha para todas)
· cor no fallback ASCII. Nada disso é contornado em silêncio: quando o caso aparece,
a saída é `warning` ou a limitação declarada, e a alternativa é a §7/§8 de
`docs/06-visualizacao.md`.

---

## 8. Verificação executada nesta máquina

| # | Verificação | Resultado |
|---|---|---|
| 1 | `python3 -m py_compile` | OK, 1 351 linhas, Python 3.14.7 |
| 2 | 4 tipos renderizados com `--png` | `function` svg 13 472 B / png 117 624 B / **1 117 cores**; `line` 4 465 / 65 915 / **558**; `scatter` 3 904 / 51 622 / **446**; `bar` 4 774 / 77 964 / **487** — nenhum PNG de cor única |
| 3 | barra com contagens positivas | `y_limits = [0.0, 539460.0]` — limite inferior zero exato |
| 4 | descrição de `1/x` e `cos(x)` | `1/x`: mínimo −66.67 em x = −0.015, 1 amostra indefinida, "monotônica decrescente em 2 segmentos" + aviso de escala dominada. `cos(x)`: "oscila (3 inversões de direção)" |
| 5 | HTML autocontido | `http(s)`, `src=`, `href=`, `<script`, `<link`, `@import`, `url()` externa: **0 ocorrências** em todos os HTML gerados |
| 6 | braille de um seno | período completo legível em 72×18 |
| 7 | SVG por `ElementTree` | 8 arquivos, todos parseiam, todos com `viewBox`, `role="img"`, `<title>`, `<desc>` |
| 8 | exit codes | 1 (JSON malformado, chave ausente, enum, flag inválida) · 2 (série vazia, série sem forma, nenhum ponto finito) · 3 (diretório sem permissão, `mkdir` negado) · 0 (sucesso) |
| 9 | PNG | `rsvg-convert` 2.62.3 → 1 520×920; com `PATH` vazio: exit **0** + `warning png_skipped` |
| 10 | schema | spec mínima válida contra `plot-spec.schema.json` renderiza (exit 0); spec inválida recusada (exit 1) |
