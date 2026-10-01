# Pipeline de validação de aulas/desafios — reconhecimento completo

> Reconhecimento read-only (2026-09-27) sobre `/home/ondokai/Projects/study-method`.
> Objetivo: mapear o pipeline de validação de `lessons`/`challenges` da engine de trilhas
> para encaixar uma NOVA camada — **checagem cumulativa** (cada desafio deve também cobrar
> conhecimentos ensinados em aulas/desafios anteriores) — como a **ÚLTIMA** camada da
> validação de cada aula. Todas as referências são `arquivo:linha` do estado atual do repo.

---

## 0. Mapa dos ficheiros que importam

| Papel | Ficheiro |
|---|---|
| CLI da engine (audit/barra/coverage/requirements/revise/discrimination/generate/repair/reorder/gap/convergir/lint-schemas) | `app/tools/track-engine/cli.ts` (2505 linhas) |
| CLI de autoria (track:validate, track:challenge:verify, track:challenge:context…) | `app/tools/track-cli.ts` (837 linhas) |
| Orçamento cumulativo de conhecimento | `app/electron/main/engine/budget.ts` |
| Gate de auditoria (fachada → módulos) | `app/electron/main/engine/audit.ts`, `auditCore.ts`, `auditAula.ts`, `auditSuperficies.ts`, `auditEstruturais.ts`, `auditModulo.ts`, `auditResumo.ts`, `auditMensagens.ts`, `auditTypes.ts` |
| Barra pedagógica A17–A24 | `app/electron/main/engine/quality/barra*.ts` (barra.ts é fachada) |
| Bateria A13–A16 (javascript-only) | `app/electron/main/engine/quality/progressao*.ts` |
| Código mínimo que passa no teste | `app/electron/main/engine/quality/minimal*.ts`, `minimalPorLinguagem.ts` |
| Requirements × testes | `app/electron/main/engine/quality/requirements*.ts` |
| Discriminação J5 | `app/electron/main/engine/quality/discriminacao*.ts` |
| Revisão progressiva (comando `revise`) | `app/electron/main/engine/revision/progressiva*.ts` |
| Provas de execução (4+1) | `app/electron/main/engine/exec/proofs.ts`, `proofsCore.ts`, `harness.ts`, `typesCheck.ts` |
| Runner único de desafios (CLI + main) | `app/electron/main/services/challengeExec.ts` |
| Laço de convergência | `app/electron/main/engine/modes/convergencia.ts` |
| Invariantes I1–I11 (grafo de currículo, geração) | `app/electron/main/engine/graph/invariants.ts` |
| Adaptadores por linguagem (testes, contagens, layout) | `app/electron/main/engine/lang/{registry,javascript,python,rust,c,typescript}.ts` |
| Loader/schema de conteúdo | `app/electron/main/content/trackLoader.ts`, `trackTypes.ts` |
| Ordem dos gates na autoria (SEIS gates) | `skills/trilha-author/references/validacao.md` |
| Gate de contrato do REPO (I-01..I-43 — outra família de invariantes!) | `tests/validate.sh` + `docs/00-contratos.md` §11 |

Normativa: `docs/16-engine-de-trilha.md` (§5 gates, §9 limitações/J5/fail-closed),
`docs/19-auditoria-da-aula.md` (inventário do que existe × o que falta no código).

---

## 1. Comandos de validação (CLI), o que verificam e exit codes

Convenção do repo (declarada em `app/tools/track-engine/cli.ts:47-51` e `USAGE` em
`cli.ts:170-478`): **0** sem violação · **1** violações (conteúdo) · **2** uso incorreto /
barreira estrutural. `fail()` (`cli.ts:479-482`) imprime USAGE e sai 2.

### 1.1 `npm run engine -- <cmd>` (`app/tools/track-engine/cli.ts`, dispatch `main()` em `cli.ts:2453-2500`)

| Comando | O que verifica | Exit code | Implementação |
|---|---|---|---|
| `audit <slug> [--modo declared\|inferred] [--harness …] [--limite N] [--json] [--so-lacunas] [--dir DIR]` | Orçamento cumulativo × as 4 superfícies de cada desafio + teoria + estruturais I12–I17 + baterias A13–A16 (JS) e A17–A24 (barra), mescladas. Sem LLM/rede. | **1** se `totals.violacoes > 0` (`cli.ts:735`); **1** também se a trilha não carrega por schema (`cli.ts:716`); **2** carregamento ilegível/uso (`cli.ts:724`) | `cmdAudit` `cli.ts:687-736` → `auditTrack` (`engine/auditCore.ts:125`) |
| `barra <slug> [--aula MOD/AULA] [--limite N] [--json]` | Barra pedagógica A17–A24 agnóstica de linguagem: teto do passo, 1ª aula, declarar≠demonstrar, aula sem prova, carga de novidade, duas formas (aviso), regra do par, vazamento do quiz. | **1** se `totais.erros > 0` (`cli.ts:821`); avisos A22/A24-por-afirmação não derrubam | `cmdBarra` `cli.ts:751-822` → `auditarBarra` (`quality/barraAuditoria.ts:142`) |
| `coverage <slug> [--limite N≥1] [--json]` | Para cada desafio sintetiza o **código mínimo que passa no teste** (zero LLM, literal/echo) e compara `atoms(mínimo)` com o orçamento da aula: **LACUNA** (teste cobra o que a aula não oferece) / **EXCESSO** (aula ensina, teste não cobra). Prover REAL sob semáforo SEM_EXEC. | **1** se `lacunas > 0` OU `naoMedidos > 0` (sem-solucao/parse-falhou/prover-falhou/ignorado — fail-closed §9.3) (`cli.ts:1086`); **2** linguagem sem sintetizador mínimo (`cli.ts:985-989`) ou `--limite 0` (`resolverLimiteDeMedicao` `cli.ts:510-521`) | `cmdCoverage` `cli.ts:968-1087` → `auditarDesafioCoverage` `cli.ts:923-966` → `sintetizarCodigoMinimoDaLinguagem` (`quality/minimalPorLinguagem.ts:96`) |
| `requirements <slug> [--limite N≥1] [--json]` | Bijecão entre `requirements[]` declarados no `challenge.json` e os testes derivados do `testsCode` (por linguagem). Gap nos dois sentidos é reprovação. | **1** se `placar.comGaps > 0` (`cli.ts:1303`); **2** linguagem sem derivação (`cli.ts:1230-1240`) | `cmdRequirements` `cli.ts:1214-1304` → `derivarRequirements`/`validarRequirements` (`quality/requirements.ts`, despacho `quality/requirementsDespacho.ts:125`) |
| `discrimination <slug> [--tudo] [--limite N≥1]` | Cláusula J5: o TESTE força a construção da aula? `alvosNaSolucao ∖ atoms(mínimo)` ≠ ∅ ⇒ não discrimina. Prova ESTÁTICA sobre conjuntos de átomos (não gera mutantes). | **SEMPRE 0** com achado — classificação congelada como `classificacao: 'aviso'` (`quality/discriminacaoTipos.ts:104`); **2** uso/barreira estrutural (`cli.ts:1148`) | `cmdDiscrimination` `cli.ts:1129-1186` → `avaliarDiscriminacao` (`quality/discriminacaoRelatorio.ts:26`) |
| `revise <slug> [--limite N≥1] [--json]` | Revisão progressiva: 1ª→última aula, código mínimo × orçamento DECLARADO da aula; LACUNA → candidato a SPLIT (seeds gravadas); NÃO-REVISÁVEL (fail-closed); EXCESSO (ajuste). Memória acumulada; convergência por hash (máx. 3 iterações). **Escreve em disco** `content-src/<slug>/revisao-progressiva/`. | **1** se `comLacuna > 0` ou `naoRevisaveis > 0` (`cli.ts:1379`) | `cmdRevise` `cli.ts:1318-1380` → `rodarRevisaoAteConvergir`/`revisarCurso` (`revision/progressiva.ts:268`, `progressivaRelatorio.ts:52`) |
| `generate …` (F0–F12) | Gera trilha nova; gate interno G-FINAL materializa e valida. | 0/1 (`cli.ts:1635`, `concluido`), 2 uso | `cmdGenerate` `cli.ts:1552`; `gFinal` `phases/f12Materialize.ts:1073` |
| `repair <slug> [--aplicar] [--mover] [--criar-aulas]` | Laço revisor→plano→correção sobre trilha existente; dry-run classifica cada violação (ORDEM × LACUNA × ESTRUTURAL) e imprime plano do catálogo fechado; `--aplicar` re-roda o audit comparando placar. | **1** se `violacoesFinais > 0` (`cli.ts:1941`); 2 sem `--modelo-revisor`/chave em `--aplicar` (`cli.ts:1903/1924/1927`) | `cmdRepair` `cli.ts:1837` → `modes/repair.ts` |
| `reorder <slug> [--aplicar]` | Metade "MOVER a aula que ensina para antes" da ORDEM. Zero LLM. `--aplicar` só grava após re-derivar orçamento em memória e provar que o alvo sumiu e nada novo apareceu (I4/I8/I11/I14 válidas). | **1** se sobrou achado (`cli.ts:2227`); 2 erro estruturado | `cmdReorder` `cli.ts:2036` → `modes/reorder.ts` |
| `gap <slug> [--aplicar]` | Sub-fluxo v2: LACUNA DE CURRÍCULO vira aula (plano em dry-run; `--aplicar` autora com LLM, re-deriva orçamento e só grava aulas aceitas). | **1** se sobra lacuna/aula recusada (`cli.ts:2086` `limpo ? 0 : 1`); 2 erro estruturado | `cmdGap` `cli.ts:2164` → `modes/curriculumGap.ts` |
| `convergir <slug> [--aplicar] [--max-iteracoes N]` | Laço recursivo medir→classificar→planejar→(aplicar)→medir, com `auditTrack` + `auditarBarra` em memória, zero LLM. 6 ramos (ORDEM/CADEIA/LACUNA/QUEBRA/DEMONSTRACAO/PROVA). Grava ledger em `content-src/<slug>/convergencia/ledger.jsonl` (nos dois modos). | **0 SÓ em PONTO-FIXO**; 1 em CICLO/SEM-PROGRESSO/TETO/achados remanescentes (`cli.ts:2432`); 2 uso | `cmdConvergir` `cli.ts:2354` → `modes/convergencia.ts` (`medirVetor:347`, `classificarAchados:496`, gates `:1359-1360`) |
| `lint-schemas` | Preflight do build sobre o `SCHEMA_REGISTRY`: INV-04 (decisão antes da justificativa), INV-05 (sem campos opcionais). | **2** em qualquer violação (`cli.ts:2450`) | `cmdLintSchemas` `cli.ts:2435-2451` |

### 1.2 `npm run track -- <cmd>` (`app/tools/track-cli.ts`, dispatch `main()` em `:781-836`)

| Comando | O que verifica | Exit code | Implementação |
|---|---|---|---|
| `track:validate <slug>` | (1) `loadTrack` completo (schema/integridade de track/module/lesson/challenge + linguagem coerente); (2) **provas de execução** de TODOS os desafios: proficiência → desafios de módulo → desafios de aula. Placar `verificados × reprovados` sempre impresso. | **1** TrackLoadError (`track-cli.ts:672`) ou `reprovados > 0` (`:685`); 2 uso | `cmdValidate` `:624-688`; prova por `provarDesafio` `:593-607` / `verifyAndLogChallenge` `:449-466` |
| `track:challenge:verify <slug> <mod> <aula> <desafio>` | As provas de execução de UM desafio (multi-arquivo OK): solução passa (com igualdade de contagem), starter falha, contagem declarada == `expectedTestCount`. | **1** se não aprova (`:477`); 2 argumentos em falta | `cmdChallengeVerify` `:468-479` → `verifyChallengePair` (`services/challengeExec.ts:460`) |
| `track:challenge:context <slug> <mod> <aula> <desafio>` | Validação SEMÂNTICA via LLM: cada `test('…')` contra critérios de entrada + aulas anteriores + aula atual ("só cobra o que foi ensinado"), veredito POR TESTE. Exige `OPENROUTER_API_KEY`. | **1** sem chave (`:505`), trilha inválida (`:517`), falha de montagem (`:548/558/577`), veredito reprovado (`:577`) | `cmdChallengeContext` `:497-583` → `verifyChallengeAgainstContext` (`services/challengeContextValidator.ts`) |
| `track:new/module:new/lesson:new/challenge:new/module:challenge:new/proficiency:new` | Scaffold já válido (o loader do app é o que valida). | 2 em uso | `:208-447` |
| `track:list`, `track:reset-orphans` | Listagem / reconciliação de progresso órfão (remove só com `--yes`). | 0/2 | `:690-780` |

---

## 2. A checagem "o conteúdo cobrado foi ensinado até este ponto" — o orçamento acumulado

**Onde está.** Núcleo: `app/electron/main/engine/budget.ts` (`deriveTrackBudget` em
`budget.ts:216-312`), consumido pelo gate `auditCore.ts:126` e pelas baterias. A frase
"um desafio só pode cobrar o que já foi ensinado" vira diferença de conjuntos por aula
(`budget.ts:2-14`).

**Derivação do orçamento acumulado (dobra determinística sobre a ordem pedagógica):**

```
entrada(0) = axioma de entrada (estruturas inevitáveis + harness de teste)
entrada(N) = saida(N-1)
saida(N)   = entrada(N) ∪ introduces(N)
```

- Ordem pedagógica: módulos por `module.json.order`, aulas na ordem do array `lessons`
  (`pedagogicalOrder` `budget.ts:153-164`).
- **Duas faixas** (`BudgetBands` `budget.ts:70-73`): `receptive` (o que o aluno PODE LER:
  prosa, exemplo, starter, teste) e `productive` (o que se pode EXIGIR que ELE ESCREVA:
  solutionCode). Invariante `productive ⊆ receptive` (`budget.ts:21`).
- **Axioma de entrada** (`entryAxiom` `budget.ts:197-208`): `structuralAlwaysAllowed(language)`
  em ambas as faixas + `harnessReceptiveSeed(language)` só na receptiva (política
  `receptive-seed`, default; `atomKeys.ts` — `HARNESS_RECEPTIVE_SEED` em `atomKeys.ts:245`).
  Fail-closed por linguagem (`budget.ts:189-195`).
- **Dois modos de origem** (`BudgetSource`, `budget.ts:64`, automático em `budget.ts:221-222`):
  - `declared` (à prova de fraude): `introduces.{productive,receptive}` do `lesson.json`
    (`budget.ts:245-250`); receptivo declarado é ADITIVO ao produtivo.
  - `inferred` (legado, permissivo por construção): os átomos que os blocos de teoria da
    própria aula demonstram e que ainda não estavam no orçamento (`budget.ts:251-280`) —
    cada violação encontrada é um PISO.
- `saida(N) = entrada(N) ∪ introduces(N)` em `budget.ts:282-285`; carry para a aula seguinte
  em `budget.ts:307-308`.
- `firstTaughtIn: Map<AtomKey, ref>` (`budget.ts:96-105`, preenchido `:290-292`) — a PRIMEIRA
  aula que introduz cada construção: violação com origem = problema de ORDEM; sem origem =
  LACUNA DE CURRÍCULO (`primeiraAulaQueEnsina === null`).
- Adaptador da trilha (`trackAdapterId` `budget.ts:175-187`, fail-closed) decide parser,
  harness e decidibilidade.

**Como os átomos são extraídos.** `extract.ts` (`extractAtoms`) sobre cada superfície, com o
adaptador da trilha (`auditAula.ts:178-182`; o `surface` viaja para ante-salas por linguagem,
ex.: macro `SM_TEST` de C). Átomos = chaves de 6 eixos (`node:`, `decl:`, `op:`, `global:`,
`api:`, `term:` — `atomKeys.ts:56-120`). No caso da **solução/testes do desafio**:

- superfícies achatadas por `challengeSurfaces` (`auditSuperficies.ts:30-43`): arquivos
  multi-arquivo (`files[].starterCode/solutionCode`) ou `starterCode`/`solutionCode` de topo,
  mais `testsCode`;
- **assimetria das 4 superfícies** (`allowedFor` `auditSuperficies.ts:46-60`) — é a regra
  central do gate:
  - `testsCode ⊆ entrada.receptive` (o aluno LÊ o teste ANTES de aprender) → **A3**;
  - `starterCode ⊆ saida.receptive` → **A1**; `statement`/`teoria ⊆ saida.receptive` → **A4**;
  - `solutionCode ⊆ saida.productive` (o aluno ESCREVE com o que esta aula deu) → **A2**;
- **subtração do diff starter→solução**: o que o starter já traz não se cobra do aluno
  (`chavesDeStarter` `auditSuperficies.ts:74-86`; subtração em `auditAula.ts:256-257`);
- decisão por OCORRÊNCIA em `avaliarOcorrenciaDaAula` (`auditAula.ts:230-260`): `DEC`
  (construção que quebra decidibilidade, `auditAula.ts:239-254`), fora do orçamento →
  violação da regra da superfície (`montarViolacaoDeOcorrencia` `auditAula.ts:263-288`,
  A11 para cenário de erro derivado);
- **direção puxada (A6)**: `auditarA6` (`auditAula.ts:294-318`) — o desafio tem de exercitar
  ≥1 construção de `introduces.productive` da própria aula (senão só repete o que o aluno
  já sabia).

**Desafio de módulo**: `auditarDesafiosDeModulo` (`auditModulo.ts:34-64`) mede contra
`saida` da ÚLTIMA aula do módulo (é o que o aluno tem na mão ali), mesma assimetria A1/A2/A3
com subtração do starter, sem DEC/A11.

**Versão dinâmica (executa o teste)**: `coverage`/`revise`/`discrimination` substituem
"o que a solução usa" pelo **código mínimo que passa no teste** (§6) e comparam
`atoms(mínimo)` com o mesmo orçamento. No `revise` a comparação é contra
`saida` da aula (`orcamentoDaAula` `revision/progressivaDesafio.ts:23-34` devolve
`lb.saida.*`) — ou seja, **inclui o que a aula em curso introduz**, exatamente o critério
"até este ponto, incluindo a aula em curso".

---

## 3. Existe já algo parecido com "revisão cumulativa"?

Sim, em três peças — nenhuma cobre exatamente a checagem pedida:

### 3.1 `revise` / `engine/revision/progressiva*.ts` — revisão PROGRESSIVA (1ª→última, memória acumulada)

- `revisarCurso` (`progressiva.ts:268-293`): percorre `pedagogicalOrder` com o acumulador
  `MemoriaDeRevisao` (`aulaAnterior`, `lacunasVistas`, `decisoes`); por aula, `revisarAula`
  (`progressiva.ts:220-266`) chama `revisarDesafio` por desafio
  (`progressivaDesafio.ts:82-153`): sintetiza o mínimo (`sintetizarCodigoMinimoDaLinguagem`,
  `:114-120`) e calcula:
  - **LACUNA** = `atoms(minimal) ∖ (saida.productive ∪ saida.receptive)` (`:138`) → decisão
    `split` (SPLIT pendente com minimalCode+atoms preservados como artefato/seed);
  - **EXCESSO** = `introduces.productive ∖ atoms(minimal)` (`:141`) → ajuste, **nunca violação**;
  - **NÃO-REVISÁVEL** = veredito não-ok (sem-solucao/parse-falhou/prover-falhou) — fail-closed,
    documentada, nunca loopa (`decidirAula` `progressiva.ts:138-198`).
- **Memória**: o snapshot da memória antes da aula N é o contexto da N+1
  (`progressiva.ts:233-242`); `lacunasVistas` marca progressividade ("já sinalizado como lacuna
  na aula anterior").
- **Convergência**: `rodarRevisaoAteConvergir` (`progressivaRelatorio.ts:52-77`) repete a
  varredura até o sha256 do relatório estabilizar; `maxIteracoes = 3` (default);
  com 1 iteração `convergencia` fica `false` (fail-closed, `:72-77`).
- **Erro ou aviso?** Não é `Violation`: é `RelatorioDeRevisao` próprio
  (`revision/progressivaTipos.ts`). O **exit code do comando é 1** quando há LACUNA
  (`precisaQuebrar`) ou aula NÃO-REVISÁVEL (`cli.ts:1379`); EXCESSO não reprova.
- **Gate obrigatório?** NÃO. Não roda em `track:validate` nem nos seis gates de
  `skills/trilha-author/references/validacao.md` §1–§2. É comando autônomo; as suas seeds
  de SPLIT são lidas pelo `gap` como CONTEXTO (não gate).

### 3.2 `quality/progressao*.ts` — bateria A13–A16 (javascript-only)

- Regras: A13 (ensino-efetivo — usado ⊆ demonstrado), A13d (declarar≠demonstrar),
  A14a (≤4 construções verdadeiramente novas por aula; 0 → **aviso**; declared:
  `introduces.productive > 2` → erro, que é a A7/I2 no conteúdo real —
  `progressaoRegras.ts:121-129`), A14b (≤1 construção nova por linha da solução),
  **A15a** (degrau intra-aula: reusa algo do desafio anterior e acrescenta ≤1 não demonstrado),
  **A15b** (inter-aula: a aula N reutiliza ≥1 átomo demonstrado antes — recuperação espaçada),
  A16 (1º desafio resolvível com a 1ª seção da teoria).
- **Erro ou aviso**: erro por default (`ProgressaoViolation.severidade`
  `progressaoTipos.ts:17,66-83`); A14a-zero e casos D4 são `aviso`
  (`progressaoRegras.ts:100,239`).
- **Gate obrigatório?** Roda DENTRO do `auditTrack` (`auditCore.ts:141`, merge por aula em
  `auditAula.ts:62-64`) — logo sim, para trilhas **JavaScript**. Para python/rust/c é
  PULADA com a limitação declarada `A13-A16-NAO-RODOU` (`auditResumo.ts:53`) porque é
  javascript-only (`progressaoAuditoria.ts:184` lança para outros adaptadores).
- O substituto agnóstico é a barra A17–A24 (`quality/barra*.ts`), que NÃO cobre A13a/b/c,
  A14b, A15a/A15b, A16b (tabela em `skills/trilha-author/references/validacao.md` §3):
  **a progressividade inter-aula (A15b) está hoje SEM medida em python/rust/c** — abertura
  direta para a nova camada cumulativa.

### 3.3 `quality/progressao.ts` vs. a checagem cumulativa pedida

O que falta em todas as peças acima: **um desafio deve COBRAR (exigir) conhecimentos de
aulas ANTERIORES**. Hoje só existe a direção oposta (A1–A3: não cobrar o que NÃO foi
ensinado), o A6 (exercitar o que ESTA aula introduziu) e o A15b (reuso ≥1 átomo anterior —
JS-only, e apenas "reutiliza", não "cobra conhecimento de aulas anteriores como matéria de
avaliação"). A nova camada entra como o **A6 espelhado no tempo**: cobrança cumulativa.

---

## 4. ORDEM das validações hoje

### 4.1 `track:validate <slug>` (validação de uma trilha/módulo pelo autor)

`cmdValidate` `track-cli.ts:624-688`:

1. `carregarTrilha(slug)` → `loadTrack` (`content/trackLoader.ts:142`): valida
   `track.json` (`validateTrackSource`), cada `module.json` (`:179`), cada `lesson.json`
   (`:197`), cada `challenge.json` (`:214`), coerência `challenge.language` × linguagem da
   trilha (`issuesDeLinguagemDoDesafio` `:118`, chamado `:219/249`); qualquer issue →
   `TrackLoadError` → exit 1 (`:672-675`).
2. Impressão dos contagens (módulos/aulas/desafios/proficiência) — `:632-643`.
3. **Proficiência** (se existir): `provarDesafio` (`:593-607`) — `verifyChallengePair` +
   `countDeclared === expectedTestCount` (`:653-658`).
4. **Por módulo**: desafio de MÓDULO via `verifyAndLogChallenge` (`:661-666`);
   depois, por aula, cada desafio via `provarDesafio` (`:667-674`).
5. Placar `verificados × reprovados` e exit 1 se algum reprovou (`:679-687`).

NÃO chama audit, barra, coverage nem requirements — só loader + provas de execução.

### 4.2 `audit <slug>` (o gate de conteúdo) — ordem interna de `auditTrack` (`auditCore.ts:125-205`)

1. `deriveTrackBudget` (`:126`) — orçamento acumulado (só leitura JSON, sem parser de código).
2. `rodarBateriaDeProgressao` (`:141` → `auditSuperficies.ts:180-206`) — A13–A16 sobre a
   trilha inteira (só JS; senão `bateriaRodou=false`).
3. `rodarBarra` (`:142` → `auditSuperficies.ts:216-231`) — A17–A24 (só `declared`).
4. `montarLimitacoesDeAuditoria` (`:145`) — limitações declaradas (§9.2).
5. `auditarEstruturaisDaTrilha` (`:166` → `auditEstruturais.ts:19-86`) — I14, I12, I15.
6. **Loop por aula** (`:169-174`) → `auditarAula` (`auditAula.ts:46-87`), NESTA ordem:
   1. merge das violações A13–A16 da aula (`auditAula.ts:62-64`);
   2. merge dos achados da barra A17–A24 da aula (`:75-77`);
   3. teoria: A4 (`auditarTeoriaDaAula` `:93-130`, só `declared`);
   4. **por desafio** (`:82-84` → `auditarDesafioDeAula` `:133-160`):
      estruturais do desafio (I16/I17, `auditEstruturais.ts:92-136`) → superfícies
      (parse A2 + A1/A2/A3/DEC/A11 por ocorrência, `auditarSuperficieDaAula` `:163-218`)
      → A6 (`auditarA6` `:294-318`) → marca `desafiosComViolacao`;
   5. métricas da aula (`montarMetricasDaAula` `:321-363`).
7. `auditarDesafiosDeModulo` (`:177` → `auditModulo.ts:34`) — desafio de módulo × orçamento
   da última aula do módulo.
8. `montarPlacarDaBarra` (`:179`) e montagem do `AuditReport` (`:181-204`) com
   `totals.violacoes` = erros (`severidadeDe(v) !== 'aviso'`, `:191`).
9. CLI: `printHuman` + limitações + placar (`cli.ts:555-685`) → exit `violacoes > 0 ? 1 : 0`
   (`cli.ts:735`).

### 4.3 Os SEIS gates da autoria (ordem de execução humana/agent)

`skills/trilha-author/references/validacao.md` §1–§2: pré-requisito de ambiente
(`_ensure-toolchain.sh`) e depois, na ordem dada pelo §2:
`audit` → `barra` → `coverage` → `requirements` → `track:validate` → `convergir`
(no `publicar` (§7) re-rolam-se os seis do local publicado e a entrega só existe quando o
`convergir` sai **0 PONTO-FIXO**). `coverage`/`requirements`/`track:validate` exigem RUNNER;
`audit`/`barra`/`reorder`/`convergir` exigem só PARSER.

### 4.4 Pipeline de GERAÇÃO (F0–F12)

`gFinal` (`phases/f12Materialize.ts:1073-1175`): (a) `loadTrack` sem issues → (b) QUATRO
provas de TODO desafio (map paralelo, SEM_EXEC) → (c) `auditTrack` LIMPO (erros derrubam;
parseErrors da teoria também; avisos não).

---

## 5. Ponto de encaixe para a NOVA camada ("checagem cumulativa", por último)

### 5.1 Onde correr

**Ponto natural: o fim da caminhada por aula em `auditAula.ts`** — função `auditarAula`
(`app/electron/main/engine/auditAula.ts:46-87`). Hoje a ordem interna é:
baterias mescladas (linhas 62 e 75) → teoria (79-80) → desafios (82-84) → métricas (86).
A checagem cumulativa deve correr **depois da linha 84** (todos os desafios já auditados
contra o orçamento — "o cobrado foi ensinado até aqui, incluindo a aula em curso") e
**antes/ao lado da linha 86**. Ela precisa de:

- `lessonBudget` (entrada/saida/introduces) — já recebido (`:48`);
- `estado.budget` (`TrackBudget`): `byRef`, `lessons` (aulas anteriores na ordem
  pedagógica), `firstTaughtIn` (`budget.ts:91-118`) — já em `EstadoDaAuditoria`
  (`auditAula.ts:29-41`);
- os átomos cobrados por desafio: o padrão é `challengeSurfaces` +
  `extractAtoms` (como `auditarDesafioDeAula` faz, `auditAula.ts:147-152`) ou, para a versão
  dinâmica, `sintetizarCodigoMinimoDaLinguagem` (como `coverage`/`revise`).

Duas opções de arquitetura, ambas com precedente no repo:

1. **Bateria à moda da barra** (recomendada se a checagem for sobre a trilha inteira ou
   precisar de estado acumulado entre aulas): módulo puro novo
   `engine/quality/cumulativa*.ts` com relatório próprio (espelhar `RelatorioDaBarra`,
   `quality/barraTipos.ts:118-132`), executado UMA vez em `auditCore.ts` junto de
   `rodarBateriaDeProgressao`/`rodarBarra` (`auditCore.ts:141-142`) e mesclado por aula em
   `auditarAula` (padrão `barraPorRef`, `auditAula.ts:75-77`). Se precisar de "memória
   acumulada" entre aulas (como o `revise`), seguir o padrão `MemoriaDeRevisao`
   (`revision/progressiva.ts:202-218`) dentro da própria bateria.
2. **Verificação local por aula**: função `auditarCumulativa(estado, lessonBudget, lesson, …)`
   chamada em `auditarAula` após a linha 84 (irmã de `auditarA6`, `auditAula.ts:294`).

Nota: a ordem dos `push` em `violations` é contrato ("byte a byte", cabeçalho de
`auditAula.ts:5-7`) — o novo bloco acrescenta no FIM da caminhada da aula, sem reordenar o
que existe.

### 5.2 Tipos relevantes

- **Achado/violação**: `Violation` (`auditTypes.ts:40-69`) — campos `regra`, `arquivo`,
  `ref`, `campo: Surface|'lesson'|'module'|'track'`, `linha`, `coluna`, `construcao`,
  `eixo`, `faixa`, `trechoOfensor`, `primeiraAulaQueEnsina`, `mensagem`,
  **`severidade?: Severidade`** (`:68`).
- **Catálogo de regras**: `AuditRule = BudgetRule | StructureRule | ProgressaoRule |
  RegraDaBarra` (`auditTypes.ts:35`) — uma regra nova entra por um tipo novo
  (ex. `CumulativaRule = 'CUM1' | …`) acrescentado à união. Ids são literais estáveis.
- **Como declarar erro vs aviso**: campo `severidade` — **AUSENTE = erro** (contrato
  histórico do placar); `'aviso'` para avisos. Função oficial:
  `severidadeDe(v) = v.severidade ?? 'erro'` (`auditSuperficies.ts:166-168`). A barra segue
  o padrão alternativo com `AchadoDaBarra.severidade` obrigatório (`barraTipos.ts:77`) e uma
  tradução achado→violação (`violacaoDaBarra` `auditMensagens.ts:159`,
  `converterViolacaoDeProgressao` `:187`) — usar este padrão se a camada tiver relatório
  próprio.
- **Relatório**: `AuditReport` (`auditTypes.ts:211-286`); contadores aditivos no placar
  seguem a disciplina "aditivo + opcional" (ex. `errosDaBarra`/`avisosDaBarra`
  `auditTypes.ts:252-267`, preenchidos em `auditCore.ts:198`); checagem que não rodou vai em
  `limitacoes: LimitacaoDeclarada[]` (`auditTypes.ts:161-170`, montagem em
  `auditResumo.ts::montarLimitacoesDeAuditoria`, ids como `A13-A16-NAO-RODOU` em
  `auditResumo.ts:53`).
- **Severidade no relatório de bateria própria**: `AchadoDaBarra` (`barraTipos.ts:64-78`)
  inclui `acao` do catálogo fechado (`SPLIT_LESSON | REWRITE_IN_BUDGET | ADD_TEST |
  INSERT_INTERMEDIATE | DECLARE_INTEGRATIVE`) — o `convergir` classifica por regra→ramo
  (`modes/convergencia.ts:470-477`); uma regra nova precisa de entrada ali (ou de ramo
  explícito) para o laço convergir não a deixar "fora dos seis ramos".

### 5.3 Como o relatório/exit code é montado

- `auditCore.ts:181-204`: `totals.violacoes` = contagem de `severidadeDe(v) !== 'aviso'`
  (`:191`); `totals.avisos` (`:192`). **Erro novo reprova sozinho; aviso nunca.**
- CLI `cmdAudit`: `process.exit(report.totals.violacoes > 0 ? 1 : 0)` (`cli.ts:735`).
- `convergir` mede `auditTrack` + `auditarBarra` em memória (`convergencia.ts:1359-1360`) e
  deriva μ (vetor de estado, `medirVetor` `:347`) — regras novas entram no vetor para o
  laço não declarar PONTO-FIXO com elas em aberto.
- Consumidores automáticos de `AuditReport`: `modes/repair.ts` (re-roda o audit),
  `modes/reorder.ts`, `modes/curriculumGap.ts`, `review/audit2Laco.ts`, `report/report.ts`,
  `phases/f12Materialize.ts:1166` (G-FINAL) — uma camada fiada no `auditTrack` chega a
  todos sem mudança de chamada.

**Resumo do encaixe**: nova bateria `engine/quality/cumulativa.ts` (pura, DI,
fail-closed), executada em `auditCore.ts:141-142` (junto das duas existentes), mesclada
por aula em `auditarAula` **depois de `auditAula.ts:84`** (último passo por aula),
achados como `Violation` com `severidade` ausente=erro/'aviso', id novo em `AuditRule`
(`auditTypes.ts:35`), limitações em `auditResumo.ts`, placar aditivo em `auditCore.ts:198`
e mapeamento ramo em `convergencia.ts:470`. O exit code passa a refletir a camada
automaticamente por `cli.ts:735`.

---

## 6. Testes dos desafios: armazenamento e verificação

### 6.1 Armazenamento

`challenge.json` (`CHALLENGE_FILE`, `content/trackTypes.ts`) — `TrackChallengeSource`
(`trackTypes.ts:128-163`):

- `testsCode: string` (`:156`) — os testes, **na linguagem do desafio**;
- `expectedTestCount: number` (`:163`) — a contagem que as provas exigem bater;
- `starterCode`/`solutionCode` de topo OU `files[]` multi-arquivo
  (`files[].path` seguro `^[a-zA-Z0-9_\-/]+\.mjs$`, paths únicos — validação em
  `validateChallengeSource` `trackTypes.ts:545-566`);
- `language: TrackChallengeLanguage` (`:140`) — linguagem de PROGRAMAÇÃO (não confundir com
  `track.json.language` = idioma da prosa; `trackTypes.ts:91-92`); coerência com
  `track.programmingLanguage` checada pelo loader (`trackLoader.ts:118,219`);
- `requirements[]` (campo aditivo) — bijeção com os testes (comando `requirements`).

### 6.2 Formato dos testes por linguagem (adaptadores em `engine/lang/`)

| Linguagem | Runner (`testCommand`) | Formato do teste | Contagem declarada (AST) | Layout no disco |
|---|---|---|---|---|
| JavaScript/Node | `node --test --test-reporter=spec test.mjs` (`lang/javascript.ts:152`) | `test('nome', …)` + `assert.*` (node:test ESM) | `countTestDeclarations` por AST (`extract.ts`) | `solution.mjs` + `test.mjs` + `package.json {type:'module'}` (`services/challengeExec.ts:5-8`) |
| Python | `python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v` (`lang/python.ts:758`) — **unittest, não pytest** | `def test_…(self)` em classe `TestCase` + `self.assert*`; forma `stdout` com `runpy.run_path("solucao.py")` também existe | só métodos `test_*` de subclasses de `unittest.TestCase` (`python.ts:770-813`) | `solucao.py` + `tests/test_solucao.py` + `tests/__init__.py` obrigatório (`python.ts:635-639`) |
| Rust | `cargo test --offline` (`lang/rust.ts:795`) | `#[test] fn …` com `assert_eq!`/`assert!` | conta `#[test] fn` (`rust.ts:800-835`) | crate com `src/lib.rs` (`rust.ts:683`); testes coletados pelo cargo |
| C | script gerado que compila + roda (`lang/c.ts:1319`); parse do gate é clang-only (`-Xclang -ast-dump=json`) | blocos `SM_TEST(<slug>) { … checa_*(…); }` sobre harness gerado (`c.ts:808-980`) | expansão da macro `SM_TEST` → funções `test_*`, por AST (`c.ts:1325-1366`) | arquivos do aluno + harness + runner gerado |

Contagens: **dupla-igualdade** `countDeclared` (fonte, por AST) == `countRun` (relatório
executado, ÚLTIMO bloco de resumo — defesa contra relatório forjado) == `expectedTestCount`
(`exec/proofsCore.ts:57-70`). `passed = exitCode === 0` NÃO é universal:
`failureExitCodes.isFailure` por adaptador (`lang/registry.ts:432,740`).

### 6.3 O que `track:challenge:verify` prova

`verifyChallengePair` (`services/challengeExec.ts:460-505`) — implementação ÚNICA (CLI e
main), par solução/starter montado por `challengePairFromSource` (`:438-458`, carrega
`challenge.language`; multi-arquivo via `solutionFiles`/`starterFiles`):

1. **Solução passa**: `prepareChallengeDir` com a solução + testes → `rodar(work, adaptador.testCommand)`
   → `solutionPasses = code === 0 && countRun === expectedTestCount && countDeclared === expectedTestCount`
   (`:487-489`).
2. **Starter falha**: mesmo diretório com o starter → `starterFails = failureExitCodes.isFailure(code)`
   (`:493`).
3. **Contagem bate**: `countMatches = countDeclared === expectedTestCount` (campo do veredito em `:496`).

`pairIsValid` (`:426-428`) exige os três. O `track:validate` usa `provarDesafio`
(`track-cli.ts:593-607`, mesma prova, exceção → reprovação, nunca aprovação por omissão).
O `track:challenge:verify` do CLI ainda re-imprime `tests declarados × tests no arquivo`
via `adapterDoDesafio(challenge.language).countDeclared` (`track-cli.ts:450-466`).

**As QUATRO provas completas** (usadas pelo `coverage`/`revise` via `ProverDeDesafio` e pelo
G-FINAL) vivem em `exec/proofs.ts`/`proofsCore.ts` (`docs/16` §5.4):
1. solução passa em todos os testes; 2. starter FALHA; 3. contagem bate
(declarada == executada == esperada); 4. **stub vazio FALHA** (anti-tautológico) —
mais a QUINTA opcional por linguagem (`typesCheck`, tipos da solução; não existe para
Python). Fail-closed: exit 0 com zero testes é FALHA; skip reprova; 137 = timeout-ou-OOM;
relatório forjado tratado (último bloco de resumo + exit-guard no harness).

---

## 7. Invariantes I1–I17 e regras A1–A23(–A24): o que é, onde vive, erro/aviso

### 7.1 Invariantes de estrutura

**I1–I11** — especificação `docs/16-engine-de-trilha.md` §5.2; implementação PURA em
`app/electron/main/engine/graph/invariants.ts` (`checkInvariants` `:448`; ids `:42`;
visão de ensino `:49-96`). Rodam no **pipeline de GERAÇÃO** (F3: `phases/f3Graph.ts:836-847`,
"P-08") — NÃO no audit de trilhas existentes. Saída: `ViolacaoEstrutural[]` (todas contam
como violação; fail-closed — ex. I10 com `orcamentoVigente` ausente é violação,
`invariants.ts:86-91`).

| # | O quê | Onde |
|---|---|---|
| I1 | grafo é DAG e todo `desbloqueado_por` referenciado existe | `graph/invariants.ts` (~`:150-177`) |
| I2 | `introduces.productive` ≤ 2 itens por aula | idem (~`:191`) |
| I3 | unicidade de origem (nenhuma construção por duas aulas) | idem (~`:210`) |
| I4 | construção usada tem aula de origem, anterior na ordem | idem |
| I5 | construção introduzida aparece em ≥1 exemplo da teoria da própria aula | idem |
| I6 | construção introduzida é exigida no desafio da própria aula | idem |
| I7 | construção introduzida reaparece em ≥3 artefatos posteriores | idem |
| I8 | sem 3 aulas consecutivas da mesma família sintática | idem |
| I9 | primeira aparição é a forma mais simples | idem |
| I10 | toda aula tem ≥1 desafio resolvível com o orçamento vigente | idem |
| I11 | mudar a FORMA de construção já ensinada exige aula dedicada | idem |

**I12–I17** — especificação §5.2; implementação no gate de AUDITORIA
(`auditEstruturais.ts`, todas **erro** (sem campo `severidade` ⇒ erro)):

| # | O quê | Onde |
|---|---|---|
| I12 | slug de aula globalmente único (chave de progresso) | `auditEstruturais.ts:44-59` (`auditarEstruturaisDaTrilha`) |
| I13 | `slug === basename(dir)` nos 4 níveis | **NÃO implementado** (validado em parte pelo loader) |
| I14 | `order` de módulo inteiro e único | `auditEstruturais.ts:23-41` |
| I15 | `theory[].id` único dentro da aula | `auditEstruturais.ts:64-83` |
| I16 | `challenge.concept` ∈ `lesson.concepts` | `auditEstruturais.ts:99-115` (`auditarEstruturaisDoDesafio`) |
| I17 | `files[].path` nunca `test.mjs`/`package.json` | `auditEstruturais.ts:117-135` |

⚠️ Desambiguação: `tests/validate.sh` implementa **outra família** — as invariantes
I-01..I-43 de `docs/00-contratos.md` §11 (contrato do repo/skill), não as do engine.

### 7.2 Regras de conteúdo A1–A24

Especificação `docs/16` §5.1; inventário do que REALMENTE existe no código:
`docs/19-auditoria-da-aula.md` §2.2–2.3 (**A5, A7–A10, A12 e I13 não estão implementadas no
audit de conteúdo**; A7/I2 tem cobertura parcial pela A14a-declared e pela A17).

| Regra | O quê | Onde vive | Erro/aviso |
|---|---|---|---|
| A1 | `atomos(starterCode) ⊆ saida.receptive` | `auditSuperficies.ts:57-58` (`allowedFor`) + `auditAula.ts:205-217` | erro |
| A2 | `atomos(solutionCode) ⊆ saida.productive` | `auditSuperficies.ts:51-52`; parse-falha da superfície também é A2 (`auditAula.ts:183-199`) | erro |
| A3 | `atomos(testsCode) ⊆ entrada.receptive` | `auditSuperficies.ts:53-54` | erro |
| A4 | teoria ⊆ `saida.receptive` (só `declared`) | `auditAula.ts:93-130` | erro |
| A5 | átomo novo presente tem de estar declarado em `introduces` | **não implementada** | — |
| A6 | `atoms(solutionCode) ∩ introduces.productive ≠ ∅` (direção puxada) | `auditAula.ts:294-318` | erro |
| A7 | `introduces.productive` ≤ 2 e `productive ⊆ receptive` | não implementada como tal; 1ª cláusula coberta por **A14a-declared** (`progressaoRegras.ts:121-129`) e **A17** (`barraRegras.ts`) | erro (onde coberta) |
| A8 | `atoms(solutionCode)` ≤ 25 | **não implementada** | — |
| A9 | profundidade de composição > 1 exige nó `integrative` | **não implementada** | — |
| A10 | construção introduzida reaparece em ≥3 artefatos posteriores | **não implementada** (é a I7 do grafo) | — |
| A11 | cenário de erro (`api:assert.throws`, `node:ThrowStatement`) só exigível com `throw`/`assert.throws` no orçamento | `auditAula.ts:220-223` (`eCenarioDeErro`) e `:271-286` | erro |
| A12 | `1 ≤ elementos_novos ≤ 4` | **não implementada como A12**; o teto equivalente é **A21** da barra | erro (A21) |
| A13 (a/b/c/d) | ensino-efetivo: usado/lido ⊆ demonstrado ∪ Cum ∪ AX ∪ H13; A13d declarar≠demonstrar | `quality/progressaoRegras.ts` (bateria JS-only; guarda `progressaoAuditoria.ts:184`) | erro (+ **aviso** D4 — `progressaoRegras.ts:239`) |
| A14a | ≤4 construções verdadeiramente novas por aula; 0 → aviso; declared `productive` > 2 → erro | `progressaoRegras.ts:93-129` | erro (0 novas = **aviso** `:100`) |
| A14b | ≤1 construção nova por linha do solutionCode | `progressaoRegras.ts` | erro |
| A15a | degrau intra-aula reusa algo e adiciona ≤1 não demonstrado | `progressaoRegras.ts` | erro |
| A15b | aula N reutiliza ≥1 átomo demonstrado antes | `progressaoRegras.ts` | erro |
| A16 | 1º desafio resolvível com a 1ª seção da teoria + material anterior | `progressaoRegras.ts` | erro (+ aviso D4) |
| A17 | teto do passo: ≤2 produtivas novas colapsadas | `quality/barraRegras.ts` (checagens A17; limiar `barraTipos.ts:31`) | erro |
| A18 | aula 1 da trilha: ≤1 produtiva nova + toda chave lida fora do axioma com demo própria | `barraRegras.ts` (A18) | erro |
| A19 | declarar≠demonstrar: toda chave nova em bloco cercado com tag da linguagem NESTA aula (blocos que não parseiam também A19, fail-closed) | `barraRegras.ts:396-408` (`checarBlocosNaoParseados`) + regras A19 | erro |
| A20 | aula `regular` sem desafio ou sem produtiva nova não é aula | `barraRegras.ts` (A20) | erro |
| A21 | carga de novidade: ≤4 novas colapsadas; seções ≥ max(2, ⌈novas/2⌉) | `barraRegras.ts` (A21; limiares `barraTipos.ts:33-34`) | erro |
| A22 | cada produtiva nova em ≥2 formas sintáticas | `barraRegras.ts:323-348` (`checarA22`) | **AVISO** (`:342`) — nunca reprova |
| A23 | `introduces.derived` exige pai declarado + co-ocorrência de LINHA no bloco da aula | `barraRegras.ts:51-68` (`achadoDeDerivada`) + `validarDerivada` | erro |
| A24 | quiz não acertável pelo COMPRIMENTO: correta mais longa em TODA afirmação (folga 8 chars) | `barraRegras.ts:353-391` (`checarA24`); limiar `barraTipos.ts:58` | erro se a aula inteira vaza (`:365`); **aviso** por afirmação isolada (`:377`) |

Mais: **DEC** — construção que quebra decidibilidade (`FORBIDDEN_ALWAYS`,
`atomKeys.ts:192-213`; emissão `auditAula.ts:239-254`) — erro. A bateria A13–A16 só roda em
JavaScript; A17–A24 roda só em `declared` (limitações `A13-A16-NAO-RODOU`
`auditResumo.ts:53` e `A17-A23-NAO-RODOU-EM-INFERRED` `auditResumo.ts:75`).

---

## 8. Achados que afetam diretamente a nova camada cumulativa

1. **O "cobrado foi ensinado até aqui (incluindo a aula em curso)" já existe** — é A1–A4
   sobre o orçamento acumulado (`saida(N)` inclui `introduces(N)`), e o `revise`/`coverage`
   confirmam-no dinamicamente contra `saida` da aula. A nova camada NÃO deve repetir isso;
   o que falta é a direção oposta no TEMPO: **cada desafio deve também cobrar conhecimento
   de aulas/desafios anteriores** (hoje só A15b roça o tema, e só em JS).
2. **A progressividade inter-aula (A15a/A15b) está sem medida** em python/rust/c
   (`validacao.md` §3) — a checagem cumulativa é o substituto natural e deve ser agnóstica
   de linguagem (padrão da barra, não da A13–A16).
3. **Última camada**: encaixe em `auditarAula` após `auditAula.ts:84` (ou bateria própria
   mesclada ali), para correr DEPOIS de todo o resto da validação da aula.
4. **Erro vs aviso**: `Violation.severidade` ausente = erro (`auditSuperficies.ts:166`);
   erros caem no `totals.violacoes` e no exit 1 (`cli.ts:735`); avisos exigem disciplina de
   declaração (A22 mostra o padrão: contagem visível, exit imune).
5. **Fail-closed é lei** (`docs/16` §9.3): desafio não medido nunca conta como aprovado
   (padrão do `coverage`, `cli.ts:1069-1086`); se a camada não puder medir (ex.: sem
   sintetizador mínimo para a linguagem), declara limitação (`LimitacaoDeclarada`) em vez de
   silenciar.
6. **Se a camada entra no `auditTrack`**, chega de graça ao `repair`, `reorder`, `gap`,
   `convergir`, `report` e ao G-FINAL do `generate` — e o `convergir` precisa do mapa
   regra→ramo (`convergencia.ts:470-477`) atualizado para classificar os achados novos.
