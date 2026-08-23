# `transcripts/` — as respostas gravadas

Aqui entram as respostas reais do tutor, gravadas durante a execução dos casos. Enquanto não
houver nenhum `EV-NN.rNN.txt` aqui, `run-evals.sh` reporta `PEND` para os padrões de
`cases/patterns.tsv` — e isso está
correto: não há nada para verificar ainda, e fingir `PASS` seria pior.

## Formato do nome

```
EV-<NN>.r<NN>.txt
```

- `EV-NN` — o caso, exatamente como em `cases/`.
- `r<NN>` — a execução: `r01`, `r02`, `r03`. Três por caso (ver `README.md` da suíte: uma execução
  não é evidência).

Exemplos: `EV-01.r01.txt` · `EV-01.r02.txt` · `EV-13.r03.txt`.

Sub-casos usam sufixo de letra no id: `EV-05a.r01.txt`, `EV-06c.r02.txt`, `EV-14b.r01.txt`.

## O que vai dentro

**Só os turnos do tutor**, um por bloco, na ordem em que saíram. Sem comentário do avaliador, sem
marcação de julgamento, sem o texto do prompt do aluno — esses ficam no arquivo de pontuação, não
aqui, porque `run-evals.sh` aplica os padrões de `deny` ao arquivo inteiro e um "violação: 'ótimo
trabalho'" escrito pelo avaliador viraria falso positivo.

Separe turnos consecutivos com uma linha contendo apenas `---`:

```
Sem rodar: o que você espera que fatorial(0) devolva?
---
Vamos deixar o interpretador decidir. Roda isto:
print(fatorial(0))
```

O alvo `primeira_frase` dos padrões é a **primeira frase do arquivo**: a primeira linha não vazia,
truncada no primeiro `.`, `?` ou `!`. Se o caso avalia a primeira frase de um turno específico que
não é o primeiro, grave **esse turno** em um arquivo próprio e anote no arquivo de pontuação qual
turno é.

## Cabeçalho de proveniência (opcional, recomendado)

Linhas iniciadas por `#` na primeira dezena de linhas são ignoradas pelos padrões — use-as para
registrar o que a execução não conta sozinha:

```
# caso: EV-01
# execucao: r01
# data: 2026-08-24
# harness: claude-code-2.1.0
# modelo: <id do modelo>
# setup: fixture em /tmp/eval-setup-01
```

Sem isso, o resultado não é comparável com o da semana seguinte, porque não se sabe o que mudou.

## O que **não** vai aqui

- **Dado real de aluno.** Todo caso é encenado com perfil fictício. Se você rodar a suíte contra um
  setup de estudo de verdade, anonimize antes de gravar — e prefira não rodar.
- **Conteúdo do `memory/`.** As verificações que dependem do disco (`EV-10`, `EV-13`, `EV-15`) se
  registram como observação no arquivo de pontuação, não copiando o arquivo para cá.
- **A pontuação.** Ela vive no formulário de `rubric.md`.
