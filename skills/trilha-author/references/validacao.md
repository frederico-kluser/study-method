# Validação — os gates determinísticos e os comandos exatos

Regras de execução do passo `validar_modulo` e do `publicar`. Todos os comandos rodam de `app/`,
sem rede e sem chave de API (P-PROVA: o veredito é do gate, nunca da leitura). Convenção de exit
code da engine: **0** sem violação · **1** violações encontradas · **2** uso incorreto.

## 1. Os quatro gates, um por pergunta

| Gate | Responde | O que reprova | Exit |
|---|---|---|---|
| `audit` | **o que a aula oferece** — o orçamento cumulativo × cada superfície (teoria, starter, testes, solução) | qualquer construção fora do orçamento, lacuna de currículo, violação das baterias A1–A16 e I1–I17 | 0 · 1 · 2 |
| `coverage` | **o que o teste REALMENTE cobra** — qual é o MENOR código que passa no teste? | **LACUNA**: átomo do mínimo fora do orçamento da aula (o teste cobra algo que a aula não oferece) | 0 · 1 · 2 |
| `requirements` | a **bijeção** entre o enunciado e o teste — `requirements[]` declarados ↔ testes do desafio, nas duas direções | um dos lados sem par | 0 · 1 · 2 |
| `track:validate` | as **provas de execução** de TODOS os desafios (aulas + desafio de módulo + proficiência) | algum desafio reprovou em prova de execução | 0 · 1 · 2 |

## 2. Os comandos

```bash
cd app && npm run engine -- audit <slug> --limite 0
cd app && npm run engine -- coverage <slug>
cd app && npm run engine -- requirements <slug>
cd app && npm run track -- track:validate <slug>
```

Por desafio, o endereço exato (multi-arquivo OK):

```bash
cd app && npm run track -- track:challenge:verify <slug> <moduleSlug> <lessonSlug> <challengeSlug>
```

Flags que importam (docs/16 §8 e o `--help` da engine, `npx tsx tools/track-engine/cli.ts
--help`):

| Flag | Onde vale | O que faz |
|---|---|---|
| `--limite N` | `audit` | limita quantas **violações são impressas** — `0` = nenhuma, só o placar, e a trilha INTEIRA é auditada (modo recomendado) |
| `--limite N` | `coverage`/`requirements`/`revise` | limita quantos **desafios/aulas são processados** — aqui `--limite` fatia o que é MEDIDO, e `0` fatiaria para lista vazia |
| `--dir DIR` | `audit`/`coverage`/`requirements`/`revise`/`repair` | carrega a trilha de fora de `resources/tracks/` — ex.: o draft ainda não publicado; com `--dir`, o slug é só o rótulo do relatório |
| `--modo declared\|inferred` | `audit`/`coverage` | de onde vem o orçamento; sem a flag: `declared` se alguma aula declara `introduces`, senão `inferred` |
| `--harness receptive-seed\|none` | `audit` | se o harness entra no orçamento receptivo da aula 1 (default `receptive-seed`) |
| `--so-lacunas` | `audit` | só as lacunas de currículo (construção que NENHUMA aula ensina) |
| `--json` | todos | relatório completo em JSON |

## 3. A armadilha do `--limite 0` no `coverage`

No `audit`, `--limite 0` audita tudo e só esconde o detalhamento. No `coverage` (e nos irmãos
`requirements`/`revise`) o mesmo `--limite 0` **fatia o que é medido para a lista vazia**: o placar
sai todo zerado sem que nada tenha sido medido — a classe de erro do docs/16 §9.2
(zero-porque-não-rodou lido como zero-porque-está-certo); o contrato mediu o comando saindo 0 com
contadores zerados, e o README da engine trata o `0` como uso incorreto. De qualquer forma, nada é
medido:

```bash
cd app && npm run engine -- coverage python --limite 0     # placar: desafios ... 0  (armadilha)
cd app && npm run engine -- coverage python                # placar: desafios ... 21
```

**Regra: no `coverage`/`requirements`, rode SEM `--limite`.** E todo placar só é informação com
`totals.checagensNaoExecutadas == 0` — a bateria A13–A16 é javascript-only e, na trilha Python,
pula e **declara** a limitação (id `A13-A16-NAO-RODOU`) em vez de dar veredito errado silencioso.
Um `0` num contador de aviso com checagem não executada é aprovação por omissão, proibida.

## 4. As quatro provas de execução (docs/16 §5.4)

Um desafio só é válido com as quatro passando:

1. a solução de referência **passa** em todos os testes;
2. o `starterCode` **falha**;
3. o número de testes executados **bate** com `expectedTestCount` (igualdade dupla: declarada ==
   executada; exit code sozinho não distingue "passou" de "nada rodou");
4. um **stub vazio falha** (protege contra teste tautológico — o teste que passa até sem código).

Armadilhas medidas que o executor trata e o autor deve conhecer: `node --test` com glob vazio sai
0; `NODE_TEST_CONTEXT` herdado faz o processo filho pular tudo e sair 0; códigos ANSI no relatório
quebram o regex de contagem; timeout devolve 137, que também é OOM. Em Python o runner é
`python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v` com exit 0/1/5, e sem
`tests/__init__.py` nada roda (`ImportError: Start directory is not importable`). A **quinta**
prova (`typesCheck`) é opcional por linguagem e não existe para Python.

## 5. Leitura do relatório — violação de ORDEM × LACUNA

No `--json` do `audit`, toda violação carrega `primeiraAulaQueEnsina` (docs/16 §5.5) — e a ação
prescrita é diferente para cada caso:

- `primeiraAulaQueEnsina !== null` → **violação de ORDEM**: reescrever o artefato ou reordenar o
  grafo;
- `primeiraAulaQueEnsina === null` → **LACUNA DE CURRÍCULO**: criar a aula atômica que falta —
  nunca reescrever o desafio para caber num currículo furado (isso não termina nunca).

## 6. A outra metade que o placar não conta — discriminação (J5)

`audit` 0 violações + `coverage` 0 lacunas provam que nenhum desafio cobra o que a aula não
ensinou. J5 responde a pergunta **inversa**: o teste DERRUBA quem não usou a construção da aula?
Medido na trilha `python` (docs/16 §9.1): 21 desafios avaliados, 20 medidos — **17 não
discriminam**. A explicação em uma linha do contrato: o código mínimo que passa em cada desafio é
um único `print("<saída esperada>")` — dos 34 alvos presentes nas soluções, **29 não são forçados
pelo teste**. Leitura operacional para o autor:

- o `EXCESSO` do `coverage` é o sinal vivo: a aula ensina mais do que o teste cobra (*insumo para
  decidir se a aula precisa ser mais quebrada*);
- a classificação de J5 é **aviso com contagem, nunca violação** (decisão do dono registrada em
  docs/16 §9.1 — um CLI dedicado `discrimination` estava marcado como provisório no contrato);
- mesmo como aviso, **P-CONTRA manda autorar já discriminando**: teste que falha sem a construção
  ensinada (ver `qualidade-aula.md` §6).

## 7. `publicar` — o passo final

1. Mova a trilha autorada para `app/resources/tracks/<slug>/` (arquivos: `track.json` com
   `entryCriteria`, `modules/` com `module.json` + `lessons/` + `challenges/`).
2. Re-rode os quatro gates **do local publicado** (sem `--dir`):
   `audit <slug> --limite 0` · `coverage <slug>` · `requirements <slug>` · `track:validate <slug>`.
3. Só então o curso existe. Nenhum veredito por leitura humana: o gate decide.

> Aviso de efeito colateral (medido): `revise <slug>` **escreve em disco** —
> `app/content-src/<slug>/revisao-progressiva/` — e isso não está no `--help`; apague o diretório
> antes de commitar. O `repair` só grava com `--aplicar`.
