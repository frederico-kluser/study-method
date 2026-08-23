# `evals/` — a suíte de avaliação da skill `study-method`

Esta pasta responde a **uma** pergunta: *a skill se comporta como o contrato promete?*

Não responde — e não tenta responder — se ela **ensina melhor**. Nenhum arquivo aqui mede
aprendizado, retenção ou ganho pedagógico, e nenhum número produzido aqui pode ser lido assim.
Medir aprendizado exigiria alunos reais, grupo de controle e pós-teste; nada disso está aqui.

## Sumário

- [O modelo mental: sinal, não teste binário](#o-modelo-mental-sinal-não-teste-binário)
- [O que a suíte cobre](#o-que-a-suíte-cobre)
- [O que a suíte NÃO cobre](#o-que-a-suíte-não-cobre)
- [Estrutura de arquivos](#estrutura-de-arquivos)
- [Como rodar](#como-rodar)
- [Como ler o resultado](#como-ler-o-resultado)
- [Como adicionar um caso](#como-adicionar-um-caso)

---

## O modelo mental: sinal, não teste binário

**Avaliação de comportamento de modelo não é determinística.** O mesmo prompt, com a mesma skill,
no mesmo modelo, pode produzir turnos diferentes — de temperatura, de contexto anterior, de versão
do harness, de qual `reference/` foi carregada naquele momento. Um caso que passa hoje pode falhar
amanhã sem que uma linha do repositório tenha mudado.

Consequências práticas, e elas mandam em tudo o que vem depois:

1. **Uma execução não é evidência.** Rode cada caso **3 vezes** e reporte a distribuição
   (`3 atende` · `2 atende / 1 viola`), nunca a média. Média de três julgamentos ordinais é um
   número sem referente.
2. **`viola` é mais informativo que `atende`.** Uma violação em 3 execuções prova que o
   comportamento é alcançável — a regra não está sendo respeitada de forma confiável. Três
   `atende` não provam que a regra vale sempre; provam que não a quebramos nestas três.
3. **Não existe "% de conformidade".** O resultado é uma **contagem de casos por nível** e uma
   lista nominal do que violou. Converter isso em percentual é a mesma pseudo-precisão que a
   própria skill proíbe ao falar com o aluno (`docs/04-proficiencia.md` §4). A suíte segue a regra
   que exige do tutor.
4. **A parte automatizada é pequena, e isso está declarado.** `run-evals.sh` verifica conformidade
   **estática** (o texto do repositório) e aplica padrões de texto a transcrições **já gravadas**.
   Ele não conversa com modelo nenhum, não tem rede, e não julga pedagogia. Tudo o que exige
   julgamento ele **enumera para revisão manual** e diz isso na saída.

## O que a suíte cobre

| Frente | Onde | Como se verifica |
|---|---|---|
| **Roteamento** — a `description` dispara nas horas certas e fica quieta nas outras | `routing/` | manual ou assistida: exige um harness que registre se a skill foi invocada |
| **Comportamento em aula** — anti-bajulação, analogia, escada, honestidade, desafio, bootstrap, material do aluno, injeção | `cases/` | julgamento humano contra a rubrica, com apoio de padrões de texto |
| **Conformidade estática** — as 88 regras permanentes estão no `SKILL.md`; todo ID citado nos casos existe nas referências | `run-evals.sh` | automático, determinístico |
| **Higiene da própria suíte** — nenhuma afirmação proibida por `docs/00-contratos.md` §11 (I-43) escapou para dentro de `evals/` | `run-evals.sh` | automático |
| **Baseline** — o mesmo prompt com e sem a skill | `baseline.md` | formato pronto; execução é da onda seguinte |

## O que a suíte NÃO cobre

Declarado, não escondido — limitação conhecida vale mais que cobertura fingida.

- **Ganho de aprendizado.** Nada aqui mede se o aluno aprendeu. Ver o parágrafo de abertura.
- **Os scripts de `SK/scripts/`.** Quem cobre exit codes, schemas, idempotência e sandbox é
  `tests/validate.sh`, `tests/smoke.sh` e `tests/gate-*.sh` — as 43 invariantes de
  `docs/00-contratos.md` §11. Esta suíte não duplica aquilo e não deve.
- **Sessões longas.** Todo caso aqui é de 1 a 3 turnos. Deriva de comportamento ao longo de 40
  turnos (o ponto em que o `SKILL.md` sai da janela e as regras permanentes deixam de ser relidas)
  **não é testada**. É a lacuna mais séria da suíte, e é intencionalmente reconhecida: testá-la
  exige transcrições longas que ainda não existem.
- **Memória entre sessões de verdade.** Os casos usam estado de perfil **descrito na situação**,
  não um `memory/` real de várias sessões. Um caso pode passar com um perfil fictício e falhar com
  o digest real.
- **Multilíngue além de pt-BR e inglês.** O roteamento só foi escrito nesses dois idiomas.
- **Concordância entre avaliadores.** Um único revisor pontuando é o cenário assumido. Se dois
  revisores discordarem num caso, isso é dado sobre a **rubrica**, não sobre a skill — registre em
  `rubric.md` §Discordâncias.

## Estrutura de arquivos

```
evals/
├── README.md                      este arquivo
├── rubric.md                      como pontuar: atende · atende parcialmente · viola · não avaliável
├── baseline.md                    formato do comparativo sem-skill × com-skill
├── run-evals.sh                   o que dá para automatizar, e a lista honesta do que não dá
├── routing/
│   ├── README.md                  critério de aprovação e protocolo de execução
│   ├── should-trigger.tsv         20 prompts que DEVEM invocar a skill
│   ├── should-not-trigger.tsv     20 prompts que NÃO devem invocar a skill
│   └── results-template.tsv       onde o revisor registra o resultado de cada execução
├── cases/
│   ├── README.md                  índice dos casos e cobertura por família de regra
│   ├── patterns.tsv               padrões de texto verificáveis por caso (deny/require)
│   └── EV-NN-<slug>.md            um arquivo por caso
└── transcripts/
    └── README.md                  onde as respostas gravadas entram, e o formato do nome
```

## Como rodar

```sh
evals/run-evals.sh              # tudo o que é automatizável + a lista do que exige julgamento
evals/run-evals.sh --list       # só enumera os checks, sem executar
evals/run-evals.sh --strict     # pendência (transcrição ausente) também reprova
evals/run-evals.sh --only E-02  # roda só os checks com esse prefixo
```

Sem rede, sem dependência além de `bash`, `grep`, `sed`, `awk` e `find`. Não invoca modelo.

As duas frentes que **não** são automatizáveis se rodam assim:

- **Roteamento** (`routing/`): um humano, ou um harness que exponha "qual skill foi invocada",
  passa cada prompt em uma sessão limpa e anota `disparou`/`não disparou` em
  `routing/results-template.tsv`. Protocolo completo em `routing/README.md`.
- **Casos** (`cases/`): um humano encena a situação descrita, grava a resposta em
  `transcripts/EV-NN.rNN.txt` e pontua pela `rubric.md`. Com a transcrição no lugar,
  `run-evals.sh` passa a aplicar automaticamente os padrões de `cases/patterns.tsv` sobre ela —
  o que **não** substitui a pontuação, só pega as violações grosseiras de graça.

## Como ler o resultado

`run-evals.sh` usa cinco estados, com o mesmo vocabulário do gate do repositório:

| Estado | Significa | Reprova? |
|---|---|---|
| `PASS` | a verificação automática passou | não |
| `FAIL` | violação de contrato — o repositório regrediu | **sim** (exit 1) |
| `PEND` | o pré-requisito não existe ainda (ex.: transcrição não gravada) | só com `--strict` |
| `SKIP` | não aplicável neste ambiente | não |
| `MANUAL` | **exige julgamento humano** — o script só enumerou | não, e é o ponto |

O rodapé sempre imprime quantos itens ficaram em `MANUAL`. **Se esse número for zero, algo está
errado com o script, não com a skill**: comportamento de tutor não se verifica com `grep`.

Um `PASS` deste script significa exatamente isto: *o texto do repositório está coerente consigo
mesmo, e nenhuma transcrição gravada quebrou um padrão proibido conhecido*. Não significa que a
skill se comporta bem.

## Como adicionar um caso

1. Crie `cases/EV-NN-<slug>.md` copiando o cabeçalho de qualquer caso existente. Os campos
   `id`, `titulo`, `regras`, `verificacao` e `familia` são obrigatórios — `run-evals.sh` reprova
   se faltar um.
2. **Todo caso cita o ID da regra que testa.** É o que liga a avaliação ao contrato. Se o
   comportamento desejável não tem ID em `docs/00-contratos.md` §9, isso é um **achado**: registre
   na seção "Sem ID" do próprio caso e reporte — não invente um ID novo aqui.
3. Se alguma parte do caso for verificável por presença/ausência de padrão no texto, acrescente a
   linha correspondente em `cases/patterns.tsv`. Se não for, deixe fora: padrão frouxo produz
   falso positivo, que é pior que ausência de automação.
4. Rode `evals/run-evals.sh` e confirme que o novo ID existe nas referências.
