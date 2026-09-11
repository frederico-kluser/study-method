# Validação — comandos exatos, exits e ordem de execução

Regras de execução dos passos `validar` e `publicar`. Todos os comandos rodam da raiz de `app/`,
**sem rede e sem chave de API** (P-PROVA: o veredito é do gate, nunca da leitura). Convenção de
exit da engine: **0** sem violação · **1** violações encontradas · **2** uso incorreto. Todos os
exits desta página foram **medidos nesta execução (2026-09-11)** sobre `python-iniciante`.

## 1. Os quatro gates, um por pergunta

| Gate | Responde | O que reprova | Exit medido |
|---|---|---|---|
| `audit` | **o que a aula oferece** — orçamento cumulativo × cada superfície (teoria, starter, teste, solução) | qualquer construção fora do orçamento, lacuna de currículo, baterias A1–A16 e I1–I17 | 0 (trilha verde) · 1 (violações) · 2 (uso) |
| `coverage` | **o que o teste REALMENTE cobra** — o MENOR código que passa no teste | **LACUNA** (mínimo fora do orçamento da aula) · **sem-solucao / parse-falhou / prover-falhou** (não medido = falha fechada) · **EXCESSO** (aula ensina, teste não cobra — informativo, meta 0) | 1 se LACUNA ou não-medido · 2 uso |
| `requirements` | a **bijeção** `requirements[]` ↔ `test_*` do desafio, nas duas direções | gap `semTeste` (declarado sem teste) · gap `testesSemRequirement` (teste sem declaration) | **1 medido** (trilha com 21 gaps legados) |
| `track:validate` | as **provas de execução** de TODOS os desafios da trilha | algum desafio reprovou em prova de execução | 0 · 1 · 2 |

## 2. Os comandos exatos

```bash
cd app
npm run engine -- audit python-iniciante --limite 0        # → 0 violações · exit 0 (medido)
npm run engine -- coverage python-iniciante                # SEM --limite (armadilha, §3)
npm run engine -- requirements python-iniciante            # SEM --limite (idem)
npm run track -- track:validate python-iniciante
npm run track -- track:challenge:verify python-iniciante a-tela a-primeira-linha escreva-oi
```

**Medido — `audit python-iniciante --limite 0`:** placar `aulas 112 · desafios 112 · violações 0 ·
lacunas 0 · 112 passou · 0 falhou · 0 pendente · exit 0`. A linha de avisos sempre vem com a
confissão `<- sobre 1 checagem(ns) NAO EXECUTADA(S)` (a bateria A13–A16 é javascript-only e PULA e
DECLARA — id `A13-A16-NAO-RODOU`; docs/16 §9.2). **Todo `0` de aviso só é informação com
`totals.checagensNaoExecutadas == 0`** — zero-porque-não-rodou ≠ zero-porque-está-certo.

**Medido — `track:challenge:verify` (as 4 provas):**

```
desafio 'escreva-oi' (Escreva oi)
  testes declarados:        1
  testes no arquivo:        1
  solução de referência:    PASSA ✓
  starter (aluno):          FALHA (ok) ✓
✓ desafio aprovado pelas provas de execução.        → exit 0
```

As quatro provas (docs/16 §5.4): (1) solução de referência passa; (2) starter falha; (3)
`expectedTestCount` == testes executados (igualdade dupla: declarada == executada — exit code
sozinho não distingue "passou" de "nada rodou"); (4) stub vazio falha (protege contra teste
tautológico). Não existe a quinta prova (`typesCheck`) para Python — o runner é
`python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v` com exit 0/1/5, e sem
`tests/__init__.py` nada roda (`ImportError: Start directory is not importable`).

## 3. A armadilha do `--limite 0` (medida, docs/16 §8)

`--limite` conta coisas DIFERENTES conforme o comando:

- **`audit --limite 0`** → limita quantas violações são **impressas**; a trilha INTEIRA é auditada
  (modo recomendado — o placar sai completo).
- **`coverage`/`requirements`/`revise`/`discrimination` --limite 0** → fatia o que é **MEDIDO**
  para a lista vazia; **é uso incorreto (exit 2, medido)**. No `coverage`, `--limite N` só aceita
  **N ≥ 1** (amostra rápida que spawna o runner da linguagem por candidato).

```bash
cd app && npm run engine -- coverage python-iniciante --limite 0   # exit 2 (medido) — nada medido
cd app && npm run engine -- coverage python-iniciante --limite 2   # 2 desafios, placar parcial
cd app && npm run engine -- coverage python-iniciante              # trilha toda, SEM --limite
```

**Regra: no `coverage`/`requirements`, rode SEM `--limite`.**

## 4. O typewriter — a leitura como gate

A bolha de teoria digita em **velocidade de leitura**: `TYPEWRITER_TPS.theory = 7` tps = **28
chars/s** (travado pela suíte `tests/lessonTypewriterReadingSpeed.test.ts`; a faixa de leitura é
20–32 chars/s). O **teto de paciência é 21 s por seção montada** (markdown + ```lang\ncode\n``` +
explanation): 21 s × 28 chars/s = **588 chars** — alvo de produção **≤560 chars montados**.
Medido nesta execução: `npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts` →
**15 pass · 0 fail** (os mesmos 15/15 de docs/18) em ~0,7 s:

```bash
cd app && npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts
```

## 5. Gates de repo (raiz do repositório) — com coreutils GNU no macOS

```bash
export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"   # macOS: gates usam sort/head GNU
bash tests/gate-lint.sh && bash tests/gate-build.sh              # → 0 = verde
```

- **`tests/gate-lint.sh`** — qualidade do texto e dos arquivos: L-01 frontmatter (forma `chave:
  valor`, sem TAB, sem chave repetida) · L-02 link relativo quebrado em `.md` · L-03 placeholder
  órfão (abertura de chave dupla sem fechamento, ou placeholder fora de `*.tmpl`) · **L-04 arquivo
  sem newline final** · L-05 tabela malformada · L-06 espaço no fim da linha (aviso). Atenção: em
  `SKILL.md` e `references/` a regra L-03 é dura — não escreva chaves duplas literais num texto
  seu (fale do defeito, não o escreva). **L-04 trunca a lista em 8 ocorrências** (`head -8` dos
  hits em `tests/lib/assert.sh`) — com dúvida, varredura própria do último byte (`tail -c 1 <f>`).
- **`tests/gate-build.sh`** — sintaxe e forma: B-01 `bash -n` em todo `.sh` · B-02 `py_compile` em
  todo `.py` · B-03 JSON estrito parseia · B-04/B-05 modos dos scripts · B-06 shebang · B-07
  `set -euo pipefail` · B-08 regras de `tests/` · B-09 sem CRLF · B-10/11 + shellcheck (bônus).
- **`tests/smoke.sh`** é o teste de integração ponta a ponta e **exige bash ≥ 4 (CI ubuntu)**;
  localmente no macOS (bash 3.2) ele degrada e **declara** — não é gate de aula.

## 6. A ordem de execução para publicar uma aula

Para UMA aula nova (draft):

1. `npm run engine -- audit <slug> --limite 0` → 0 violações (ver `situacoes.md` §1 para vermelho).
2. `npm run engine -- coverage <slug>` → 0 lacunas, 0 sem-solucao, **EXCESSO 0** no desafio novo.
3. `npm run engine -- requirements <slug>` → bijeção completa no desafio novo.
4. `npm run track -- track:challenge:verify <slug> <mod> <aula> <desafio>` → as 4 provas ✓.
5. `npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts` → nenhuma seção > 21 s.
6. Gates de repo: `gate-lint` (newline final!) + `gate-build`.
7. `publicar`: integra por squash-merge com gate em snapshot (barreira de onda —
   `paralelizacao.md` §4) e **re-roda os quatro gates do local publicado** (sem `--dir`).

Flags que os comandos aceitam (sempre úteis): `--dir DIR` carrega a trilha de fora de
`resources/tracks/` (ex.: `--dir content-src/<slug>/trilha` para o draft não publicado — com
`--dir`, o slug é só o rótulo do relatório); `--json` relatório completo; `--modo declared|inferred`
(de onde vem o orçamento; default: `declared` se alguma aula declara `introduces`, senão
`inferred`); `--harness receptive-seed|none` (default `receptive-seed`); `--so-lacunas` (só lacunas
de currículo). O `discrimination <slug>` mede J5 explicitamente (alvos na solução ∖ átomos do
mínimo = não-forçados pelo teste) — aviso com contagem, nunca violação (decisão do dono, docs/16
§9.1).

> Aviso de efeito colateral (docs/16, medido): `revise <slug>` **escreve em disco**
> (`app/content-src/<slug>/revisao-progressiva/`) — apague o diretório antes de commitar; o
> `repair` só grava com `--aplicar` (e exige chave + `--modelo-revisor`). O `generate` produz a
> trilha inteira e a F6 (piloto de 3 aulas) **para para revisão humana** — nenhum desses é o fluxo
> desta skill, que autora aula a aula sobre o contrato já congelado.
