# Ingestão do `docs/` do setup

Como ler o material teórico do aluno dentro de um orçamento, e como dizer o que ficou de fora.
Referência de primeiro nível: carregada direto do `SKILL.md`.

## Sumário
Por que há orçamento · Constantes · Passo 1 medir · Passo 2 decidir o modo · Modo integral ·
Modo manifesto · PDF · Pasta vazia ou ilegível · Cache · A regra de declarar ·
Decisões abertas geradas aqui

## Por que há orçamento

Ler tudo é certo com 3 arquivos de anotação e é sabotagem com um livro de 400 páginas. Modelos
recuperam bem o começo e o fim do contexto e degradam no meio (curva em U), e **todos** os de
fronteira testados pioram conforme o input cresce. O risco não é estourar a janela: é caber, e
mesmo assim o meio ser processado de forma pouco confiável, **em silêncio**. Um tutor que leu o que
importa e declarou o que ficou de fora é melhor que um que leu tudo e não entendeu nada.

## Constantes

```
SETUP_DOCS         = $SETUP_ROOT/docs                          # o `docs/` do setup
CACHE              = $SETUP_ROOT/.study-method/cache
DOCS_MANIFEST      = $CACHE/docs-manifest.json
DOCS_BUDGET_TOKENS = 20000
DOCS_BUDGET_BYTES  = 80000        # ~80 KB, com 1 token ≈ 4 bytes
MATERIAL_SHARE     = 0.60         # 60% do orçamento para o material; 40% ficam para a aula
```

Bytes, não tokens: não há tokenizador garantido na máquina. A conversão de 4 bytes por token é
proxy com ±30% de erro (acento custa mais bytes; código e tabela, mais tokens). Trate 80 KB como
**ponto de virada de modo**, não como medida exata — errar conservador custa uma frase, errar para
o outro lado custa a aula.

## Passo 1 — medir

Varra `$SETUP_DOCS` recursivamente (teto de 200 arquivos; não siga symlink que aponta para fora do
setup). Para cada arquivo, decida o tratamento:

| Extensão | Tratamento | Bytes contados |
|---|---|---|
| `.md` `.markdown` `.txt` `.rst` `.org` `.tex` | texto direto | tamanho do arquivo |
| `.pdf` | extração (abaixo) | texto extraído, **não** o binário |
| `.ipynb` | células markdown e código; descarte outputs | texto extraído |
| `.csv` `.tsv` | cabeçalho + 5 linhas de amostra | tamanho da amostra |
| `.docx` `.odt` `.epub` | `pandoc` **se existir** | texto extraído |
| imagem, binário, desconhecido | não ingerível | 0, e entra em `not_ingested` |

Nunca assuma que um extrator existe. `command -v` antes de usar, sempre.

## Passo 2 — decidir o modo

```
total_ingestible_bytes <= DOCS_BUDGET_BYTES   -> modo integral
                                       senão  -> modo manifesto
```
Forçam modo manifesto, independentemente do total: um único arquivo com mais de 5 MB de texto
extraído, ou mais de 200 arquivos na pasta.

## Modo integral

Leia os arquivos inteiros. Ordem: material do aluno na raiz primeiro, `generated/` depois — o começo
do contexto é a posição forte, e ela pertence ao material real. Anuncie em uma linha:

> "Li seu material: 4 arquivos, ~31 KB."

Gere `DOCS_MANIFEST` mesmo assim: na próxima sessão ele detecta mudança sem reler nada.

## Modo manifesto

**1. Monte o manifesto** (`docs-index.sh`): por arquivo, `path` (relativo a `docs_root`),
`provenance`, `bytes`, `sha256`, `mtime`, `kind` e a lista de `sections`. Seções em texto: linhas que casam `^#{1,6} `; em `.txt` sem markdown, também linha numerada
(`^[0-9]+(\.[0-9]+)*\s+\S`), linha sublinhada por `===`/`---`, e linha curta toda em maiúsculas.
Grave `offset` e `bytes` **em bytes**, com `LC_ALL=C awk` — sem `LC_ALL=C` o `length()` conta
caracteres e o offset erra em todo texto acentuado.

Seções em PDF: a unidade é o **intervalo de páginas**, não o heading. Use o sumário do próprio livro
(quase sempre texto, nas primeiras páginas) e `pdfinfo` para o total.

**2. Pontue as seções** contra o tópico da aula:

```
score = 3 * termos do tópico no heading
      + 1 * min(ocorrências dos termos no corpo, 10)
      + 2 se a seção apareceu nas últimas 3 sessões
      - 1 se provenance começa com "generated"    # empate: material do aluno ganha
      - 5 se disputed == true
```
Os termos do tópico saem, nesta ordem: do que o aluno pediu agora · do `next_topic` da última sessão
· do `subject` do manifesto do setup.

**3. Carregue**, nesta ordem:
1. o **sumário completo** de `$SETUP_DOCS` (todos os headings, sem corpo) — custa 1-3 KB e é o que
   impede você de negar a existência de algo que está na pasta;
2. seções por score decrescente até `DOCS_BUDGET_BYTES * MATERIAL_SHARE`;
3. sempre **seções inteiras**. Nunca uma janela de bytes cortando no meio da frase — melhor uma
   seção a menos e íntegra que duas pela metade.

**4. Declare** (obrigatório, sempre — ver a regra no fim).

**5. Abra sob demanda.** Se a aula virar para algo que ficou de fora, abra aquela seção na hora — o
manifesto já tem o offset ou a faixa de páginas — e avise em quatro palavras: "abri a seção 7.2".

## PDF

Detecção, em ordem: `pdftotext` (poppler) → `python3 -c "import pypdf"` → `python3 -c "import fitz"`
→ nenhum.

Com `pdftotext`:
- `pdfinfo arquivo.pdf` dá o número de páginas **sem extrair nada** — use para estimar custo antes;
- `pdftotext -layout -f N -l M arquivo.pdf -` extrai só a faixa de páginas;
- a saída traz **um form feed (`\x0c`) por página**, o que dá o mapa offset → página de graça. Cite
  "página 143", não "em algum lugar do PDF".

Sem nenhum extrator, **não engula o problema**. Nomeie o arquivo e ofereça três saídas — e
**sugira** o comando de instalação sem nunca executá-lo:

> "Tem um `calculo-stewart.pdf` de 40 MB aí, mas não tenho como extrair texto de PDF nesta máquina.
> Opções: instalar o poppler (`sudo pacman -S poppler` no Arch, `sudo apt install poppler-utils` no
> Debian) e eu releio na hora; exportar pra `.txt`/`.md` e jogar na pasta; ou eu escrevo a base
> teórica do assunto, marcada como gerada. Qual prefere?"

PDF escaneado (menos de ~100 bytes de texto por página): diga o que é, não reporte "vazio".

> "Esse PDF é escaneado — são imagens de página, não texto. Sem OCR eu não leio. Tem versão em texto?"

## Pasta vazia ou ilegível

- `$SETUP_DOCS` não existe → recrie **vazia** (é estrutura, não conteúdo), avise em uma linha, siga.
- Vazia → não é erro. Menu de 3: (a) você põe o material agora e eu leio; (b) eu escrevo uma base
  teórica inicial, marcada como gerada por IA porque pode ter erro; (c) seguimos sem base escrita.
  Grave a escolha em `theory_source` e não repergunte na mesma sessão.
- Só arquivo ilegível → mesmo menu, mais o diagnóstico por nome de arquivo. Grave a lista de não
  ingeridos com o motivo, para não repetir o mesmo diagnóstico toda sessão.

## Cache

Barato antes de caro: compare **tamanho + mtime**; só calcule `sha256` quando um dos dois mudar, e
regenere só as entradas afetadas. Rebuild completo apenas quando o `schema_version` do manifesto
mudar. Texto extraído de PDF vai para `$CACHE/docs-text/<sha256>.txt` — um livro de 1300 páginas é
extraído uma vez. Tudo em `$CACHE` é derivado e descartável: apagar custa uma reingestão, nunca dado
do aluno. Arquivo novo entra e é anunciado ("apareceram 2 arquivos novos no seu material"); arquivo
que sumiu sai e também é anunciado.

## A regra de declarar

Vale em **toda** sessão, não só na primeira. O aluno não precisa lembrar do que você disse duas
semanas atrás.

- Leu tudo → uma linha dizendo quantos arquivos e quanto.
- Leu parte → diga **o que carregou e o que ficou de fora, por nome**, e que basta pedir:

  > "Carreguei o capítulo 3 (limites) e a seção 4.1 do seu material. Ficaram de fora: capítulos 1-2,
  > 5 a 12 e os apêndices — se a gente esbarrar em algum, é só pedir que eu abro."

- Nunca diga "li seu material" quando leu 4% dele.
- Nunca deixe o aluno descobrir sozinho que você não leu algo. A frase honesta é sempre mais curta
  que a consequência.
- Material gerado por você nunca se passa por material do aluno: ao se apoiar nele, diga de onde
  veio. Em conflito, o material do aluno vence — e o conflito é apontado, não resolvido em silêncio.

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-B01 | Quanto material teórico eu leio por sessão antes de passar a carregar só as partes relevantes? | 10k tokens (~40 KB) · 20k (~80 KB) · 40k (~160 KB) · sempre tudo, sem limite | 20k tokens (~80 KB) | cheap |
| D-B02 | Quando você não tem material, eu escrevo uma base teórica inicial? | sim, pesquisando na web quando der · sim, só do meu conhecimento · me pergunte toda vez · nunca | me pergunte toda vez | cheap |
| D-B08 | Onde fica o material que eu gero? | em `generated/` dentro do `docs/` do setup · em `researchs/` · fora do setup | `generated/` dentro do `docs/` do setup | moderate |
| D-B09 | Se não houver extrator de PDF na máquina, o que eu faço? | sugiro o comando de instalação (sem rodar) · nunca menciono instalação · trato o PDF como inexistente | sugiro o comando, nunca executo | cheap |
| D-B11 | Até que profundidade eu varro o `docs/` do setup? | só a raiz · 2 níveis · recursivo com teto de 200 arquivos | recursivo, teto de 200 arquivos | cheap |
| D-B12 | Que fatia do orçamento o material pode ocupar, deixando o resto para a aula? | 40% · 60% · 80% | 60% para o material, 40% para a aula | cheap |
