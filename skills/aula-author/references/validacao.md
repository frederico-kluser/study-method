# Validação — comandos exatos, exits e ordem de execução

Regras de execução dos passos `validar` e `publicar`. Todos os comandos rodam da raiz de `app/`,
**sem rede e sem chave de API** (P-PROVA: o veredito é do gate, nunca da leitura). Convenção de
exit da engine: **0** sem violação · **1** violações encontradas · **2** uso incorreto. Os exits
marcados (2026-09-11) foram medidos sobre `python-iniciante`; os marcados (2026-09-22), sobre as
três trilhas nesta execução.

**Em trilha de Rust, `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"` antes de TODO comando** (o
`cargo` é keg-only nesta máquina: sem isso o gate reprova por ambiente, não por conteúdo).

## 1. Os gates, um por pergunta — e por que quatro NÃO bastam

| Gate | Responde | O que reprova | Exit |
|---|---|---|---|
| `barra` | **o TAMANHO DO PASSO, a DEMONSTRAÇÃO e o QUIZ** — A17–A24, agnóstico de língua | A17 >2 produtivas novas colapsadas · A18 aula 1 com >1, ou chave lida sem demo · A19 chave nova sem bloco cercado com a tag da língua · A20 aula sem desafio / regular sem produtiva nova · A21 >4 novas, ou seções < max(2, ceil(novas/2)) · A23 derivada sem pai declarado ou sem co-ocorrência de linha · **A24** o quiz acertável pelo comprimento (a correta é a mais longa, sozinha, em TODA afirmação, com folga > 8 chars) · (A22 e o A24 de uma afirmação isolada são AVISO) | 0 · 1 se há erro · 2 uso |
| `audit` | **o que a aula oferece** — orçamento cumulativo × cada superfície | qualquer construção fora do orçamento, lacuna de currículo, A1–A6/DEC/I12–I17 **e a barra inteira** | 0 · 1 · 2 |
| `coverage` | **o que o teste REALMENTE cobra** — o MENOR código que passa | **LACUNA** (mínimo fora do orçamento) · **sem-solucao / parse-falhou / prover-falhou** (não medido = falha fechada) · **EXCESSO** (informativo, meta 0) | 1 se LACUNA ou não-medido · 2 uso |
| `requirements` | a **bijeção** `requirements[]` ↔ testes do desafio | gap `semTeste` · gap `testesSemRequirement` | **1** (2026-09-11: trilha Python com 21 gaps legados) |
| `track:validate` | as **provas de execução** de TODOS os desafios da trilha | algum desafio reprovou em prova de execução | 0 · 1 · 2 |
| `convergir` | **o laço**: os achados ainda existem? o curso está no ponto fixo? | qualquer achado remanescente, CICLO, SEM-PROGRESSO, TETO | **0 SÓ em PONTO-FIXO** · 1 nos outros · 2 uso |

**Por que quatro gates não bastam** (medido em 2026-09-22): a bateria pedagógica **A13–A16**
(`quality/progressao.ts`) é **javascript-only** e o `audit` a **PULA e DECLARA** em toda trilha de
Python, Rust ou C — a limitação sai com id `A13-A16-NAO-RODOU` no relatório. Foi esse buraco que
deixou a aula 1 do `rust-iniciante` declarar 11 construções novas em 1 seção de teoria e sair com 0
violações. A barra A17–A24 cobre **parte** dele (teto do passo, demonstração, prova, carga, quiz,
derivadas) e o `audit` já a roda: medido em `rust-iniciante`, `totals.violacoes` **17** ==
`totals.errosDaBarra` **17** (`npm run engine -- audit rust-iniciante --json`), com os achados
distribuídos em A17 9 · A18 2 · A19 3 · A21 3 e 61 avisos A22.

**O que continua NÃO medido** nas trilhas que não são JavaScript (leia a limitação declarada, não
o zero): A14b (≤1 construção nova por LINHA do `solutionCode`), A15a/A15b (progressividade
intra/inter-aula), A16b (a 1ª atividade resolvível com a PRIMEIRA seção da teoria — a barra CONTA
seções, não mede a seção 1) e os spans mecânicos S13 do arquivo de teste. Nessas quatro perguntas o
veredito é **humano e declarado**, nunca "verde".

## 2. Os comandos exatos

```bash
cd app
npm run engine -- barra python-iniciante                    # → 0 erros · 30 avisos A22 · 112 aulas · exit 0 (2026-09-22)
npm run engine -- barra <slug> --aula MOD/AULA --json       # a lupa: achados + metricas[].grupos da aula
npm run engine -- audit python-iniciante --limite 0         # → 0 violações · exit 0 (2026-09-11)
npm run engine -- coverage python-iniciante                 # SEM --limite (armadilha, §3)
npm run engine -- requirements python-iniciante             # SEM --limite (idem)
npm run track -- track:validate python-iniciante
npm run track -- track:challenge:verify python-iniciante a-tela a-primeira-linha escreva-oi
npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts   # → 15 pass · 0 fail · exit 0 (2026-09-22)
```

**Medido — `audit python-iniciante --limite 0`:** placar `aulas 112 · desafios 112 · violações 0 ·
lacunas 0 · 112 passou · 0 falhou · 0 pendente · exit 0`. A linha de avisos vem com a confissão
`<- sobre 1 checagem(ns) NAO EXECUTADA(S)`: **todo `0` de aviso só é informação com
`totals.checagensNaoExecutadas == 0`**.

**Medido — `track:challenge:verify` (as 4 provas, Python):**

```
desafio 'escreva-oi' (Escreva oi)
  testes declarados:        1
  testes no arquivo:        1
  solução de referência:    PASSA ✓
  starter (aluno):          FALHA (ok) ✓
✓ desafio aprovado pelas provas de execução.        → exit 0
```

As quatro provas (docs/16 §5.4): (1) solução de referência passa; (2) starter falha; (3)
`expectedTestCount` == testes executados (igualdade dupla — exit code sozinho não distingue "passou"
de "nada rodou"); (4) stub vazio falha. Os exits do runner e o que cada um significa são POR LÍNGUA
— `receita-da-aula-python.md` §3, `receita-da-aula-rust.md` §3, `receita-da-aula-c.md` §3.

## 3. A armadilha do `--limite 0` (medida, docs/16 §8)

`--limite` conta coisas DIFERENTES conforme o comando:

- **`audit --limite 0`** e **`barra --limite 0`** → limitam quantos achados são **impressos**; a
  trilha INTEIRA é medida (o placar sai completo).
- **`coverage`/`requirements`/`revise`/`discrimination` --limite 0** → fatia o que é **MEDIDO** para
  a lista vazia; **é uso incorreto (exit 2, medido)**.

```bash
cd app && npm run engine -- coverage python-iniciante --limite 0   # exit 2 (medido) — nada medido
cd app && npm run engine -- coverage python-iniciante              # trilha toda, SEM --limite
```

## 4. O typewriter — a leitura como gate, nas TRÊS trilhas

`TYPEWRITER_TPS.theory = 7` tps = **28 chars/s**; teto de paciência **21 s por seção montada**
(markdown + cerca + explanation) ⇒ 588 chars, alvo de produção **≤560**. O teste
`tests/lessonTypewriterReadingSpeed.test.ts` tem um caso que varre **`resources/tracks` inteiro**
("nenhuma seção de NENHUMA trilha passa de 21 s") — não é gate só de Python. Medido em 2026-09-22:
**15 pass · 0 fail · exit 0** em ~1,0 s.

```bash
cd app && npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts
```

## 5. Gates de repo (raiz do repositório) — com coreutils GNU no macOS

```bash
export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"   # macOS: gates usam sort/head GNU
bash tests/gate-lint.sh && bash tests/gate-build.sh              # → 0 = verde
```

- **`tests/gate-lint.sh`** — L-01 frontmatter · L-02 link relativo quebrado em `.md` · L-03
  placeholder órfão (abertura de chave dupla sem fechamento) · **L-04 arquivo sem newline final** ·
  L-05 tabela malformada · L-06 espaço no fim da linha (aviso). Em `SKILL.md` e `references/` a L-03
  é dura: **não escreva chave dupla literal** (fale do defeito, não o escreva). L-04 **trunca a
  lista em 8 ocorrências** — com dúvida, varredura própria do último byte (`tail -c 1 <f>`).
- **`tests/gate-build.sh`** — B-01 `bash -n` · B-02 `py_compile` · B-03 JSON estrito · B-04/B-05
  modos · B-06 shebang · B-07 `set -euo pipefail` · B-08 regras de `tests/` · B-09 sem CRLF ·
  B-10/11 + shellcheck (bônus).
- **`tests/smoke.sh`** exige bash ≥ 4 (CI ubuntu); no macOS (bash 3.2) degrada e **declara** — não é
  gate de aula.

## 6. A ordem de execução para publicar uma aula

Do mais barato ao mais caro — o gate puro primeiro, porque ele localiza o defeito sem spawnar runner:

1. `npm run engine -- barra <slug> --aula MOD/AULA` → 0 erros (vermelho → `situacoes.md` §0).
2. `npm run engine -- audit <slug> --limite 0` → 0 violações (`situacoes.md` §1 para ordem × lacuna).
3. `npm run engine -- coverage <slug>` → 0 lacunas, 0 sem-solucao, **EXCESSO 0** no desafio novo.
4. `npm run engine -- requirements <slug>` → bijeção completa no desafio novo.
5. `npm run track -- track:challenge:verify <slug> <mod> <aula> <desafio>` → as 4 provas ✓.
6. `npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts` → nenhuma seção > 21 s.
7. Gates de repo: `gate-lint` (newline final!) + `gate-build`.
8. `publicar`: integra por squash-merge com gate em snapshot (barreira de onda —
   `paralelizacao.md` §4) e **re-roda os gates do local publicado** (sem `--dir`).

Flags úteis em todos: `--dir DIR` (carrega a trilha de fora de `resources/tracks/` — com `--dir` o
slug é só o rótulo do relatório), `--json`, `--modo declared|inferred`, `--harness
receptive-seed|none`, `--so-lacunas` (só no `audit`). O `discrimination <slug>` mede J5
explicitamente — aviso com contagem, nunca violação (e é o único comando que nunca sai 1).

## 7. O laço `convergir` — recursão SEM TETO até o curso estar ideal

O pedido do dono é explícito: *"quero recursão sem fim na validação ao entregar o curso até ele
estar ideal"*. O laço de revisão do contrato (docs/16 §6.6) tem teto DURO de 3 rodadas e o comando
`revise` itera "até o hash estabilizar (max 3 iteracoes)" — **esse não é este laço**. O laço da
entrega é:

```bash
cd app && npm run engine -- convergir <slug> --json        # DRY-RUN: mede, classifica, PLANEJA
cd app && npm run engine -- convergir <slug> --aplicar     # aplica só o determinístico
```

- Uma iteração = **MEDIR → CLASSIFICAR → PLANEJAR → (APLICAR) → MEDIR DE NOVO**, com `audit` e
  `barra` rodando **em memória**, zero LLM, zero rede, zero chave.
- Cada achado cai em UM de seis ramos, e o ramo decide a ação do catálogo fechado: **ORDEM**
  (`REWRITE_IN_BUDGET` ou movimento provado pelo `reorder`) · **CADEIA**
  (`MOVE_CONCEPT_TO_ENTRY_BUDGET`) · **LACUNA** (`INSERT_INTERMEDIATE`) · **QUEBRA**
  (`SPLIT_LESSON` — `quebra-da-aula.md`) · **DEMONSTRAÇÃO** (`REWRITE_IN_BUDGET`) · **PROVA**
  (`ADD_TEST` / `DECLARE_INTEGRATIVE`).
- **A parada, na ordem em que dispara — e nenhuma é cansaço:** PONTO-FIXO (achados vazios e nada
  aplicado → **exit 0**) · CICLO (o hash do vetor de estado repete → PARA e ESCALA) ·
  SEM-PROGRESSO (nenhuma componente do vetor desceu e nada foi aplicado → ESCALA) · TETO (só se
  `--max-iteracoes N` for passado). **Exit 0 SÓ em PONTO-FIXO**; 1 em tudo o mais; 2 em uso
  incorreto.
- **O que `--aplicar` escreve** (e só isto): movimentos de ORDEM que o `reorder` prova, e a QUEBRA
  como **esqueletos** (diretório da aula nova + `lesson.json` de esqueleto com o campo `autoria`, e
  o slug inserido em `module.json.lessons[]` na posição certa). **Nunca** escreve teoria, quiz,
  fonte nem desafio — isso é autoria, é o trabalho desta skill, e a iteração seguinte reprova a aula
  nova por A20 até ela ter o desafio. O trabalho fica visível no gate.
- **Escrita declarada do dry-run:** o ledger auditável append-only em
  `app/content-src/<slug>/convergencia/ledger.jsonl` (uma linha JSON por iteração: iteração, commit,
  ambiente, medições com comando + exit + placar, `limitacoesDeclaradas`, vetor, achados por ramo,
  ações planejadas, ações aplicadas, hash do vetor, veredito). É registro, não conteúdo.

> Aviso de efeito colateral (medido): `revise <slug>` **escreve** em
> `app/content-src/<slug>/revisao-progressiva/` — apague o diretório antes de commitar; o `repair` só
> grava com `--aplicar` (e exige chave + `--modelo-revisor`); o `generate` produz a trilha inteira e
> para na F6 para revisão humana. Nenhum desses é o fluxo desta skill, que autora aula a aula sobre o
> contrato já congelado.
