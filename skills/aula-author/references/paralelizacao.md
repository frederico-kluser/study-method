# Paralelização — o playbook multi-subagente (P-MULTI)

O pedido explícito do dono: **autoria é assíncrona e paralela por natureza**, e a criação de N
aulas DEVE usar o desenho multi-subagente. Este playbook é o que produziu as **112 aulas do curso
`python-iniciante` em 5 ondas de conteúdo + 6 consertos, com gates 100% verdes** (2026-09-10/11).
A base teórica é `docs/16-engine-de-trilha.md` §4.1 (regras de paralelismo) e §8/modos; o resumo
medido está em `docs/18-estado-da-fabricacao-dos-cursos.md` §3.3.

## 1. A unidade de paralelismo

- **PARALELO: entre aulas e entre módulos.** Cada aula é um arquivo atômico (`lesson.json` +
  `challenge.json`) cujo orçamento vem do snapshot congelado — depois do freeze (F5, docs/16 §3.5),
  "a saída do agente anterior" virou "arquivo versionado" e a autoria é map-reduce legítimo.
- **SEQUENCIAL: dentro da MESMA aula** — teoria → quiz → desafio → testes dependem uns dos outros
  (docs/16 §4.1: "não paralelize as seções da mesma aula"; gerar em paralelo tem ganho de
  velocidade e perda de coerência). **Proibido** paralelizar teoria/quiz/desafio de uma única aula.
- **SEQUENCIAL: o desenho do sílabo** (grafo, pré-requisitos, orçamento) é de UM agente; o que
  paraleliza é o julgamento de arestas e a validação.

## 2. Ondas de módulos — o padrão medido

| Elemento | Padrão validado |
|---|---|
| Autores por onda | **2–3 autores**, cada um em worktree própria (`do/study-method/.../ondaN-<fatia>`), cada um **dono do SEU módulo** |
| Tamanho do módulo | ≈10–16 aulas por autor por onda (na execução: `decisao` 12, `repeticao` 13, `caixas-que-devolvem` 14, `listas-e-tuplas` 22, `texto-em-profundidade` 15, `dicionarios-e-conjuntos` 16) |
| Ciclo por onda | ~2 autores × 14 aulas + consertos ≈ **90–120 min por onda** (medido, docs/18 §3.3) |
| Barreira | Uma por onda, com **gate determinístico em snapshot após o squash-merge** (audit/coverage/requirements/validate/provas) |
| Sequência | Autorar módulo → `audit --limite 0` (0 violações) → `coverage` (0 lacunas) → `requirements` (bijeção) → `track:validate` → `track:challenge:verify` (4 provas) → typewriter → gates de repo (newline!) → squash-merge com gate em snapshot (docs/18 §6) |

Cada autor lê, antes de escrever: as tabelas do contrato (`docs/17` — a coluna `Ensina`/`Presume`
do SEU módulo) e **os padrões vivos das ondas anteriores** (uma aula do módulo já validado da mesma
onda, para copiar a forma).

## 3. Singletons e donos — a regra que evita conflito

- **`track.json` e `module.json` têm DONO ÚNICO por onda.** Dois agentes no mesmo arquivo = conflito
  de merge; pior, um `module.json` partido sem dono produz ordem de aulas divergente.
- Autor sem a posse do `module.json` **valida com `track.json`/`module.json` TEMPORÁRIOS** (não
  commitados, ex.: via `--dir` do audit) e **restaura antes do commit** — nada de estado global ao
  vivo.
- Módulo partido entre dois autores: um deles é o dono do `module.json`; a união das aulas segue a
  **ordem do contrato** (docs/18 §3.3, lição medida).
- **Freeze do orçamento e do currículo ANTES do fan-out** (P3, docs/16 §2): os autores recebem um
  snapshot imutável carimbado com hash, nunca o estado vivo. A tabela `Ensina`/`Presume` do docs/17
  É o freeze — mudá-la no meio da onda invalida tudo a jusante.
- **Nunca dois agentes no mesmo arquivo** — se duas tarefas da mesma onda declaram o mesmo caminho
  em `outputs`, a onda é rejeitada antes de rodar (docs/16 §4.1). Posse exclusiva é validada pelo
  escalonador, não confiada ao prompt.

## 4. As três fases de uma onda

```
┌─ FASE A ────────────────┐  ┌─ FASE B ─────────────────────────┐  ┌─ FASE C ──────────────┐
│ autoria (fan-out)       │  │ validação (fan-out + barreira)   │  │ consertos (pool)      │
│ 2–3 autores, 1 módulo   │  │ por aula: audit→coverage→reqs    │  │ revisão adversarial   │
│ cada, em worktrees      │  │ + track:challenge:verify lote    │  │ por diff; fixes       │
│ SEQUENCIAL por aula     │  │ + typewriter + gate-lint         │  │ triados por arquivo   │
└─────────────────────────┘  └──────────────────────────────────┘  └───────────────────────┘
        ▬▬▬ barreira com gate determinístico em snapshot (squash-merge um a um) ▬▬▬
```

- **FASE A — autoria:** cada autor escreve as aulas do SEU módulo, na ordem do contrato, uma por
  vez (sequencial dentro da aula). Commits WIP por aula ou por pequeno lote.
- **FASE B — validação paralela:** os comandos por slug + em lote rodam **em paralelo sobre os
  snapshots** (audit/coverage/requirements por aula não dependem uns dos outros; `SEM_EXEC` —
  semáforo de spawn — limita o paralelismo real de execução):
  `audit <slug> --limite 0` · `coverage <slug>` (SEM `--limite` — ver a armadilha em `validacao.md`)
  · `requirements <slug>` · `npm run track -- track:challenge:verify <slug> <mod> <aula> <desafio>`
  em lote · `npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts` · `bash tests/gate-lint.sh`.
- **FASE C — consertos:** gate vermelho → fixes **triados por arquivo** e delegados em **pool**
  (cada agente conserta as violações dos arquivos que são dele; nenhum agente toca arquivo de outro
  na MESMA onda). Revisão adversarial por diff (um agente que não escreveu o módulo aponta
  incoerências de estilo/didática; o revisor não escreve, não pontua e não decide sozinho — docs/16
  §6.2: `family(REVISOR) ∉ families(produtores)`).
- **Barreira:** o `squash-merge` é um a um, cada um com gate (build/test/lint) em **snapshot**
  (`git merge --squash` + um commit limpo por sub-tarefa; `main` só tem squash commits — história
  limpa e reversível commit a commit). Wave redonda → limpeza de worktree + branch + commits.

## 5. Subwaves e worktrees

- **Subwaves de TESTE e VALIDAÇÃO rodam JUNTO da onda seguinte** (não bloqueiam a autoria): são
  background jobs — a validação de uma onda termina enquanto a próxima autora.
- Worktrees **isoladas e NOMEADAS**: cada autor tem a sua raiz-de-mundo; nada de dois agentes no
  mesmo checkout. Ambiente conhecido (docs/18 §3.3): no macOS, gates de repo exigem PATH com
  coreutils GNU (`/opt/homebrew/opt/coreutils/libexec/gnubin`); Electron em worktree exige
  `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`; `do-wt.sh remove` morto no meio deixa a worktree
  destrancada — re-trancar com `git worktree lock --reason "..."` antes de re-remover.
- **Handoff por referência, nunca por conteúdo** (docs/16 §4.1): cada autor devolve
  `{id, path, status, hash, constructs_used, violations, tokens}` — teto 2.000 tokens; retorno
  acima do teto é rejeitado, não truncado.

## 6. Regras que valem SEMPRE (antologia do processo)

1. **Nunca dois agentes no mesmo arquivo** — dono único por arquivo, validado pelo escalonador.
2. **Freeze do orçamento/currículo antes do fan-out** — o docs/17 (tabelas) + o dossiê carimbado
   com hash são a lei da onda; divergência → ⚑ declarado, nunca resolvida em silêncio.
3. **Dentro da aula: sequencial; entre aulas: paralelo; barreira por onda com gate determinístico
   em snapshot** — "se dois agentes podem tocar a mesma chave, um deles não roda em paralelo".
4. **Validação é leitura pura sobre os drafts**: os comandos da FASE B são read-only (o laço de
   revisão escreve nos próprios artefatos em memória). Corridas de escrita não existem porque
   ninguém escreve em paralelo — quem escreve é o dono do arquivo, na sua worktree.
5. **Fixes após gate vermelho são triados por arquivo e delegados em pool** — o dono do arquivo
   violado conserta; a re-verificação roda SÓ os itens tocados + todos os pins.
6. **Revisão adversarial por diff**: revisor ≠ autor, família do modelo diferente, sem campo de
   código no schema de saída; apontamento sem span citável é descartado (docs/16 §6.3–§6.4).
7. **Laço tem teto duro** (P5, docs/16 §2): `while (revisor.temApontamento())` é anti-padrão
   proibido. Máximo 1 rodada de refino por artefato (a 2ª/3ª só com bloqueante em aberto), e a
   aprovação do revisor nunca é critério de parada — os gates mecânicos são.
8. **Contagem é saída, não entrada**: 112 aulas não foi meta — foi o que a decomposição atômica
   exigiu. Onda que descobrir penhasco QUEBRA a aula (SPLIT), nunca empilha.

## 7. Estimativas medidas (para o planejamento da onda)

| Medida | Valor |
|---|---|
| Aulas por autor por onda | ~14 (10–16 conforme o módulo) |
| Ciclo completo de uma onda (autoria + consertos) | ~90–120 min com 2 autores |
| Ondas para o iniciante inteiro (7 módulos) | 5 ondas de conteúdo + 6 consertos |
| Gates no fim do curso | audit 0 violações · coverage 0 lacunas · requirements bijetivos em 92/92 novos · typewriter 15/15 · suíte do app 4.124 testes verdes |
| Dívidas declaradas (não são falha da onda) | 21 desafios legados de `a-tela` sem `requirements[]` (21 gaps) · 29 excessos J5 na fase SAÍDA legada · bateria A13–A16 não roda em python (`checagensNaoExecutadas = 1`) |
