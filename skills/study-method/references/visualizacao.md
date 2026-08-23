# Visualização — instrução operacional

Como o tutor faz o aluno **ver**. O racional está em `docs/06-visualizacao.md`, no
`docs/` **do repositório** (não é o `docs/` do setup do aluno) — você **não** precisa
abri-lo para operar. Aqui é só o que fazer.

Renderizador: `scripts/render-plot.py` — Python 3, **biblioteca padrão pura**. Não
precisa de matplotlib, numpy, gnuplot nem graphviz. Funciona sempre.

---

## 1. Quando gerar um gráfico

**Gráfico decorativo é ruído.** Cada figura custa atenção do aluno. Gere quando a
resposta a "o que essa figura ensina que o texto não ensinaria?" for concreta.

### Gere (o visual é o conteúdo)

- a aula é sobre a **forma** de uma função (onde cresce, pico, mudança de sinal);
- **duas coisas precisam ser comparadas**: medido vs. teórico, antes vs. depois;
- a aula é sobre **complexidade**: tempo medido sobre a curva teórica, mesmo eixo;
- o aluno **errou sinal, escala ou direção** — a figura mostra em um segundo;
- o conceito é **geométrico**: derivada como inclinação, integral como área, vetor;
- a **estrutura tem forma**: árvore, chamadas recursivas repetidas;
- **convergência** é o assunto: erro por iteração, resíduo por época.

### Não gere

- para ilustrar algo que uma frase já resolve ("o array ficou ordenado");
- para 3 números — use uma tabela ou o próprio texto;
- porque a aula "está sem figura há um tempo";
- antes do aluno ter escrito código — a figura vem **do** resultado dele, não antes;
- repetindo a mesma figura com dados quase iguais dentro da mesma sessão;
- quando o aluno pediu explicitamente para seguir só em texto.

### Regra do "de onde vêm os dados"

Prefira sempre plotar **o que o código do aluno produziu**, não o que você calculou por
fora. O ciclo certo é: o aluno implementa → o programa dele grava os pontos → o
renderizador desenha. Um gráfico da resposta certa que o aluno não produziu ensina
menos que um gráfico torto que ele produziu.

---

## 2. Como chamar o renderizador

Entrada: **um JSON**, por stdin ou arquivo. Chaves em inglês snake_case; textos em pt-BR.

```bash
python3 scripts/render-plot.py --spec - --out-dir <dir> --basename <nome> <<'JSON'
{
  "type": "function",
  "title": "sen(x) e sua derivada",
  "x_label": "x (radianos)",
  "y_label": "y",
  "takeaway": "onde sen(x) tem pico, cos(x) cruza zero",
  "series": [
    {"label": "sen(x)", "expr": "sin(x)", "domain": [-6.283, 6.283], "samples": 300},
    {"label": "cos(x)", "expr": "cos(x)", "domain": [-6.283, 6.283], "samples": 300}
  ]
}
JSON
```

**`type`**: `function` (y=f(x) contínua) · `line` (série discreta ordenada: iteração,
época) · `scatter` (pares de medidas sem ligação) · `bar` (categorias — **ancora em zero**).

### Três formas de passar dados numa série

1. `"expr": "sin(x)/x"`, `"domain": [a,b]`, `"samples": N` — só para função de `x`.
   Namespace restrito a `math`. Amostra que dá erro vira `null` (quebra a linha, não
   interpola por cima da assíntota).
2. `"points": [[x,y], ...]` — pares; `y` pode ser `null`.
3. `"x": [...]`, `"y": [...]` — arrays paralelos.

**Quando os dados vêm do programa do aluno**: peça que ele grave um JSON e passe o
caminho com `--spec`. Não retranscreva os números à mão — você erra e o gráfico mente.

### Flags

`--out-dir` sempre, dentro do diretório da sessão (nunca `/tmp`) · `--basename` que diga
o que é (`derivada-numerica`, não `plot1`) · `--png` só se o aluno vai colar a imagem
noutro lugar · `--width/--height` só se 760×460 distorcer o que importa · `--quiet`
**nunca** — você precisa do JSON do stdout para saber o que desenhou.

### Exit codes

| Código | Significado | O que fazer |
|---|---|---|
| `0` | ok (pode ter `warnings` — **leia**) | narre ao aluno |
| `1` | spec inválida (JSON malformado, chave faltando) | corrija o JSON, não tente de novo igual |
| `2` | dados inválidos (série vazia, nenhum ponto finito) | o problema está nos dados, não no gráfico — investigue |
| `3` | falha de escrita | verifique o `--out-dir` |

`!= 0` significa falha. **Nunca informe ao aluno que gerou um gráfico sem ter lido
`"ok": true` no stdout.**

---

## 3. Como descrever o resultado ao aluno

⭐ **Você não enxerga o arquivo que gerou.** O único canal pelo qual você sabe o que
desenhou é o campo `description_text` do stdout — ele é **computado a partir dos dados
reais plotados**, não escrito por você.

### O procedimento

1. **Leia** `description_text`, `warnings` e `stats` do stdout.
2. **Confira** contra a expectativa: os limites de eixo fazem sentido? o nº de pontos
   bate? há amostras indefinidas que você não esperava? o máximo está onde deveria?
3. **Se não bate, o gráfico está errado** — não narre. Corrija o spec e rode de novo.
4. **Narre em 2–4 frases**, com os números do `description_text`, ligando ao que a aula
   está ensinando. Não repita o campo inteiro; ele é longo e é para você.
5. **Diga o caminho do HTML** e peça que o aluno abra.
6. **Nunca invente** nada que não esteja no stdout: cor, tendência, cruzamento, valor.

### Exemplo

```
Gerei o gráfico: sen(x) em laranja sólido, cos(x) em azul-céu tracejado, ambos de
-6,28 a 6,28. Repare que sen(x) atinge o máximo 1 em x≈1,576 — exatamente onde cos(x)
cruza o zero. É isso que "a derivada zera no pico" quer dizer, e você acabou de ver
acontecer nos seus próprios números.

Abra: /caminho/sessao-03/derivada-numerica.html
```

**Nunca**: afirmar que a curva "é suave"/"converge"/"cruza aqui" sem isso estar no
`description_text`; dizer "como você pode ver no gráfico" para quem talvez não veja
nada; ignorar um `warning` ("12 de 201 amostras indefinidas" é assunto de aula, não
detalhe a esconder); narrar cor sem narrar marcador/traço junto.

---

## 4. Como pedir que o aluno abra

Sempre **caminho absoluto**, sempre o **HTML** (não o SVG — nem todo SO tem visualizador
de SVG configurado):

> Abra este arquivo no navegador: `/caminho/absoluto/nome.html`
> (duplo clique, ou `xdg-open /caminho/absoluto/nome.html` no terminal)

**Não abra o arquivo você mesmo** sem o aluno pedir — em SSH, tmux ou máquina sem GUI,
`xdg-open` trava ou falha. Se ele pedir ("pode abrir?"), aí sim.

**Se o aluno não conseguir abrir** (SSH, sem GUI, leitor de tela): imprima o
`ascii_text` do stdout num bloco de código, dê a descrição textual **completa** (não a
resumida) e ofereça o `.md` para ele ler no editor.

---

## 5. Checklist de qualidade

Antes de mandar o gráfico, confira. Qualquer "não" é bug a corrigir, não a explicar.

### Honestidade
- [ ] `bar` começa em zero? (o renderizador força; não passe `y_limits` que quebre isso)
- [ ] eixo truncado num `line`/`scatter` está **declarado** na narração?
- [ ] duas figuras comparadas têm `x_limits`/`y_limits` **idênticos**?
- [ ] escala log tem "(log)" no rótulo do eixo?

### Leitura
- [ ] `title` diz o que a figura mostra, não "Gráfico 1"?
- [ ] `x_label` e `y_label` têm **unidade** ("tempo (ms)", não "tempo")?
- [ ] `takeaway` está preenchido com a frase que o aluno deve levar?
- [ ] ≤8 séries? (mais que isso: agrupe, ou destaque uma e apague as outras)

### Acessibilidade
- [ ] a narração cita marcador/traço além da cor?
- [ ] a descrição textual foi entregue, e não só o caminho do arquivo?
- [ ] nada da explicação depende de o aluno ver a figura?

### Dados e pertinência
- [ ] os pontos vieram do **código do aluno**, não do seu cálculo mental?
- [ ] `warnings` vazio, ou você explicou cada um? `stats.points` bate?
- [ ] esta figura ensina algo que o texto não ensinaria, e não é a terceira quase igual?

---

## 6. Visualizar algoritmo (sem Graphviz)

`dot` **não está instalado**. O que fazer:

**Recursão** — peça que o **aluno** instrumente a própria função (é o exercício, não o
enfeite): `print` com indentação por profundidade, mais um contador de chamadas.

```
fib(4)
├─ fib(3)
│  ├─ fib(2) → 1
│  └─ fib(1) → 1
└─ fib(2) → 1
→ 3   |   chamadas: 9   |   profundidade máx: 3
```
A repetição de `fib(2)` fica visível — é o argumento inteiro para memoização.

**Estruturas** — ASCII no chat: `[3] -> [7] -> [1] -> None`; pilha como caixas com
marca de topo; array como linha de valores + linha de índices + `^` no ponteiro.

**Complexidade** — o renderizador resolve: aluno mede `(n, tempo)` na linguagem da aula
→ JSON → duas séries no mesmo gráfico, medido (`scatter`) e teórico (`line`), **mesmos
limites de eixo**. Medido sozinho não ensina complexidade.

**Passo a passo** — uma linha de estado por iteração (é o que um instrutor escreve no
quadro). Para ordenação, uma linha do array por passo cabe no chat. Se precisar de
figuras, `passo-01.svg`, `passo-02.svg`, … **sempre com os mesmos `x_limits`/`y_limits`**
— senão a sequência mente.

**Grafo com layout automático** — não temos. ASCII para grafo pequeno; ```mermaid inline
**só** se o aluno lê num visualizador que renderiza mermaid (GitHub, VS Code, Obsidian).
**Não prometa mermaid como imagem** — `npx mmdc` não funciona nesta máquina.

---

## 7. Bibliotecas: oferecer, nunca impor

O embutido cobre função, linha, dispersão e barra. **Não** faz heatmap, 3D, superfície,
campo vetorial, eixo log real, scatter com milhares de pontos, nem animação.
**Só nesses casos**, ofereça uma vez — custo explícito, sem bloquear a aula:

> Este gráfico ficaria melhor com matplotlib. Posso criar um ambiente virtual isolado
> em `~/.local/share/study-method/venv` (≈60 MB, uma vez, não mexe no Python do
> sistema) — ou seguimos com o renderizador embutido. Prefere qual?

Se aceitar:
```bash
python3 -m venv ~/.local/share/study-method/venv
~/.local/share/study-method/venv/bin/pip install --quiet matplotlib
MPLBACKEND=Agg ~/.local/share/study-method/venv/bin/python script.py
```
`MPLBACKEND=Agg` é obrigatório — sem ele, um ambiente sem display trava ou lança erro
de X11.

**Nunca** rode `pip install` no Python do sistema: ele é *externally managed* (PEP 668)
e a instalação é recusada. **Nunca** use `--break-system-packages`.

Registre a resposta no `meta.json` do setup e **não repergunte**. Mesmo com o venv, as
quatro saídas continuam obrigatórias — matplotlib não descreve a própria figura, e você
continua sem enxergá-la.

**Nunca prometa**: animação/Manim (exige LaTeX, >1 GB), grafo com layout automático (sem
Graphviz), mermaid como imagem, imagem dentro do terminal, 3D. Pode dizer "consigo isso
se você instalar X"; não pode dizer "vou fazer" e descobrir o custo depois.

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-V02 | Depois de gerar o HTML, a skill deve abri-lo automaticamente (`xdg-open`) ou só informar o caminho? | (a) só informar; (b) abrir sempre; (c) abrir na primeira vez da sessão e depois só informar | **(a)** — abrir janela sem pedir trava em SSH/tmux e é intrusivo | cheap (flag no `meta.json`) |
| D-V03 | O fallback ASCII/braille deve ir para o chat sempre, ou só sob demanda? | (a) sempre inline; (b) só sob demanda; (c) automático quando não há GUI, ou quando o gráfico tem 1 série e ≤50 pontos | **(c)** — feedback imediato onde é legível, sem poluir o chat | cheap |
| D-V08 | Onde ficam os arquivos gerados: junto do desafio, numa pasta `viz/` da sessão, ou num diretório central? | (a) `<sessão>/viz/`; (b) junto do desafio que os produziu; (c) `researchs/<tema>/viz/` | **(a)** — a figura pertence à aula, não ao desafio, e sobrevive ao desafio ser refeito | cheap (mover arquivos) |
| D-V09 | Quantos gráficos por sessão antes de virar ruído? | (a) sem limite; (b) teto de 3, com aviso interno ao ultrapassar; (c) 1 por conceito novo | **(b)** — teto suave que força a pergunta "esta figura ensina o quê?" | cheap |
| D-V10 | Quando os dados do gráfico vêm do programa do aluno, a skill exige que ele grave um JSON, ou aceita parsear a saída de texto dele? | (a) exigir JSON (o aluno escreve o `json.dump`/`JSON.stringify`); (b) parsear texto livre; (c) aceitar CSV simples além de JSON | **(a)+(c)** — gravar dado estruturado é parte do que se aprende; parsear texto livre é frágil e silencioso | cheap |
