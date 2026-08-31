# Relatório de validação — aula `let-e-atribuicao` (experimento sem LLM)

> **Escopo.** Verificação FINAL independente, 100% determinística (nenhuma chamada a LLM), sobre o
> estado integrado em `main` (`5e6ad28`, inclui o fix `a04fix-r8-o2`). Rodada na worktree
> `a05-verificacao` com `cwd app/` e `tsx` (node_modules real via symlink). Fonte do conteúdo:
> `app/content-src/let-e-atribuicao/` (drafts + materialização `trilha/`).
> **Data:** 2026-08-30 · node v24.19.0 · engine idêntica à de `main` (verificado: `git diff HEAD main -- app/engine app/resources/tracks/nodejs-do-zero` vazio).

---

## Resposta: a aula quebra regras? — SÍNTESE

**A aula passa em 9 de 9 checagens determinísticas e NÃO quebra nenhuma regra de conteúdo.**

O único desvio encontrado pelo audit de trilha derivada é **exatamente o previsto e documentado no
contrato**: `auditTrack(trilha, mode:'declared')` reporta **3 violações A2** (`node:VariableStatement`,
`node:VariableDeclaration`, `node:VariableDeclarationList`) na `solutionCode` do desafio — as chaves
nó-envelope do span que o aluno escreve. Isso é **LIMITE DE ENGINE documentado** no
`contrato.json → limite_conhecido_audit_derivado` (orçamento derivado soma só `introduces.productive`
com teto ≤ 2; o extrator emite os envelopes que `decl:let` não implica no modelo atual). **Não é
defeito do conteúdo**: o gate de autoria F7/F8 com as listas do dossiê passa 0 ofensas e as 4 provas
de execução passam. A remediação é decisão de produto/engine para a onda de integração (F12) — fora
do escopo desta worktree (proibido tocar `engine/*`).

**Nada mais quebra.** As 18 regras do autor (§7.1) estão atendidas no estado final
(**16 atendidas + 2 N/A justificados = 18/18**; R8 foi a única "parcial" da revisão pré-fix e está
**atendida após o fix** com a forma sem inicializador `let saldo;` + `saldo = 8;` na referência;
R11/R18 seguem N/A justificados). Invariantes I5/I6/I9 atendidas; I7/I8 N/A (aula única);
I12–I17 verificadas por script (I13 com ressalva de staging registrada — ver Limites).

**Uma falha REAL de ferramenta foi encontrada e corrigida nesta validação:** 5 arquivos do
experimento estavam sem newline final (gate-lint L-04) — `contrato.json`, `dossie.json`,
`lesson-draft.json`, `protocolo-de-revisao.md`, `revisao-drafts.md` (pré-existente de fases
anteriores). Aplicada correção byte-mínima (append de `\n`); `content-src/let-e-atribuicao` ficou
L-04 limpo (check 6). Os 19 vermelhos L-04 restantes do repositório são pré-existentes e fora do
escopo do experimento (engine/ferramentas/docs — ver Limites).

Resumo das regras no estado final: **18/18 atendidas (R8 atendida após o fix com a forma sem
inicializador; R11/R18 N/A justificados) · 0 quebradas · 3 A2 do audit derivado (limite de engine,
documentado no contrato — não é defeito do conteúdo)**.

---

## Checagens determinísticas

| # | Checagem | Comando (cwd `app/`) | Veredito | Evidência |
|---|---|---|---|---|
| 1 | Schemas dos drafts | `node --import tsx content-src/let-e-atribuicao/verif/check01-schemas.mts` | **PASSOU** | `LessonDraftSchema.safeParse(lesson-draft.json)` → 0 erros; `ChallengeDraftSchema.safeParse(challenge-draft.json)` → 0 erros. TOTAL DE ERROS: 0 |
| 2 | `loadTrack(trilha)` | `node --import tsx content-src/let-e-atribuicao/verif/check02-03-load-audit.mts` | **PASSOU** | 0 issues (sem `TrackLoadError`). `trackSlug=let-e-atribuicao`, 1 módulo, 1 aula, 1 desafio |
| 3 | `auditTrack(trilha, mode:'declared')` | idem (seção check 3) | **PASSOU (com o desvio esperado)** | `budgetSource=declared`; **violações = 3, todas A2** (`node:VariableStatement`, `node:VariableDeclaration`, `node:VariableDeclarationList` na `solutionCode`, desafio `contador-com-let`) — limite de engine documentado no contrato; A1/A3/A4/A6/A11/DEC = **0**; `hygiene` = 0; `parseErrors` = 0; `aulasSemConstrucaoNova` = 0; `lacunasDeCurriculo` = 3 (as mesmas 3 A2) |
| 4 | 4 provas de execução (§5.4) | `node --import tsx content-src/let-e-atribuicao/verif/check04-provas.mts` | **PASSOU** | `criarProverDeDesafio()` sobre o `challenge.json` materializado → **`valid=true`, `declared=1`, `executed=1`, failures=[]** (P1 solução passa · P2 starter falha · P3 contagem == expectedTestCount=1 · P4 stub vazio falha) |
| 5 | Invariantes I12–I17 + I13 | `node --import tsx content-src/let-e-atribuicao/verif/check05-invariantes.mts` | **PASSOU (ressalva I13-track)** | I12 OK (aula única) · I13 OK nos 3 níveis internos (module/lesson/challenge `slug==basename`), nível track com desvio de STAGING (ver Limites) · I14 OK (`order=1`) · I15 OK (7 `theory[].id` únicos) · I16 OK (`challenge.concept=let_e_atribuicao ∈ lesson.concepts`) · I17 OK (sem `files[]` — vacuamente atendida) |
| 6 | gate-lint L-02/L-03/L-05 | `bash tests/gate-lint.sh` (raiz da worktree) | **PASSOU (escopo do experimento); L-04 global vermelho pré-existente** | L-02/L-03/L-05 verdes. L-04: **content-src limpo** (5 arquivos do experimento corrigidos nesta validação); restam 19 arquivos pré-existentes fora do escopo (engine/ferramentas/docs). |
| 7 | Newline final (L-04 content-src) | `node --import tsx content-src/let-e-atribuicao/verif/check06-newlines.mts` | **PASSOU** | 10 arquivos varridos (`.md`/`.json`/`.sh`/`.py`/`.tsv`/`.tmpl`); 0 sem newline final (após correção dos 5) |
| 8 | PIN da engine (285/96/102) | `bash tools/t.sh tests/engineAuditPlacar.test.ts` | **PASSOU** | `✔ engineAuditPlacar — 1 teste, 1 pass, 0 fail` (exit 0) — o placar real da trilha `nodejs-do-zero` bate com o pin (285 violações / 96 desafios com violação / 102 lacunas) |
| 9 | R1–R18 + I5/I6/I9 (prosa, pós-fix) | `node --import tsx content-src/let-e-atribuicao/verif/check07-r8-o2.mts` + leitura dos drafts | **PASSOU** | R8 confirmada no estado final (forma sem inicializador na `referencia`); O2 alinhado (valor inicial livre no enunciado); 18/18 regras (ver próxima seção) |

**Totais:** 9/9 checagens com veredito PASSOU conforme a expectativa declarada do experimento; a
única não-conformidade de audit é a combinação **exatamente-3-A2** já prevista no contrato (limite de
engine, ver Limites). Não houve nenhuma falha além dela no âmbito do experimento — a única falha de
ferramenta (newline final em 5 arquivos) foi encontrada, registrada e corrigida nesta validação.

---

## Regras de conteúdo (R1–R18 + I5/I6/I9)

Base: `protocolo-de-revisao.md` (fase 1) + `revisao-drafts.md` (fase 2, pré-fix) + o fix
`a04fix-r8-o2` (`5e6ad28`) + re-leitura dos drafts finais (check 7). Estado final = **16 atendidas +
2 N/A justificados = 18/18 — nada quebrado**.

| # | Veredito no estado final | Evidência curta |
|---|---|---|
| **R1** | atendida | Ordem no fluxo: `predicao` (ler) → `modelo-mental` (ler semântica) → 2 WEs (ler + prever estado) → `refutacoes` → `referencia` → desafio (escrever sintaxe na lacuna); ler-template = linha congelada anunciada como leitura; escrever-template ausente (opcional por construção) |
| **R2** | atendida | Primeira interação é predição de leitura do harness: "**Preveja** [...] quando o teste roda, o que `x()` devolve?" — pergunta *o quê*, confrontada pela execução: "A execução confronta a previsão: `x()` devolve **1**" |
| **R3** | atendida | Verificado COM A ENGINE REAL (extrator): starter 0 fora do receptivo (A1), solução 0 fora do produtivo (A2 — as 3 A2 são a limitação de engine, ver Limites), testes 0 fora do teste (A3), teoria 0 ofensas (A4), `op:binary:*`=0, `global:console`=0; prosa fora de blocos com `+` só em notação matemática ("0 + 10") — observação O3, severidade aviso |
| **R4** | atendida | `kc_type=regra`: WE + prática, sem tese; o único segmento expositivo é `modelo-mental` (3 parágrafos ancorados em código); drill é leitura de estado (mecanismo, não fato decorável) |
| **R5** | atendida | Tríade declarar→atribuir→ler tratada como interativa; 2 WEs completos antes de qualquer desafio (`exemplo-numero`, `exemplo-string`), cada incremento "Roda. O teste ... passa" |
| **R6** | atendida | `modelo-mental` percorre onda completa: nomeia ("**variável** ... **declarar** ... **atribuir** ... **ler**") → desempacota ("**etiqueta de identificação**") → reempacota no código ("Reempacotando — a mesma analogia, aplicada linha a linha") → "Onde a analogia quebra: a etiqueta **não segura a expressão**, segura o **resultado**" |
| **R7** | atendida | 2 WEs em incrementos que rodam (3+2 incrementos), instruções DENTRO do código como comentários (`// declarar: criar a variável...`), os 3 subgoal labels do dossiê (`declarar`, `atribuir`, `ler-valor`) sem rótulo inventado; saída real exibida como resultado do teste (R7 pede "saída **ou** erro"; falha não é mostrável — A11) |
| **R8** | **atendida (após fix `a04fix-r8-o2`)** | Estado final: duas formas sintaticamente distintas presentes na própria teoria — com inicializador (`let pontos = 0;`, `let nome = 'ana';`) e **sem inicializador + atribuição** na `referencia`: `let saldo;` + `saldo = 8;` (verify: check07 — presente em `lesson-draft.json` e no `lesson.json` materializado). A forma "expressão composta" (`let total = 10 - 2;`) continua bloqueada por orçamento (sem `op:binary:*` nas 3 listas) — limitação registrada no fix |
| **R9** | atendida | 3 misconceptions do dossiê com par errado/certo ancorado na spec: acumular vs substituir (ECMA-262 13.15.4), redeclarar = SyntaxError (14.3.2), atribuir sem declarar = ReferenceError em strict mode (13.15.4) |
| **R10** | atendida | 2 perguntas de estado na teoria (`exemplo-numero`, `exemplo-string`), 1 no drill, 1 no enunciado do desafio ("Depois de `contador = 5;`, o que está guardado em `contador`?"); teste valida o valor FINAL (`assert.equal(iniciar(), 5)`) |
| **R11** | **N/A justificado** | Aula 1 da trilha: `prerequisites` vazio, sem ancestral. A substituição contratada está implementada: a primeira interação É a predição de leitura do harness (`predicao`) |
| **R12** | atendida | 3 slots separados no `theory[]`: `teoria` (5 seções), `referencia` (colada ao desafio — "No desafio desta aula a lacuna é a **declaração**... A linha de atribuição já vem pronta e congelada"), `drill` (1 item opcional) |
| **R13** | atendida | Nenhuma atividade artificial: drill único, WEs variam contexto sem rota extra; o incremento 3 do WE numérico existe para provar substituição × acúmulo (reduz carga, não soma) |
| **R14** | atendida | Harness (export/import/test/function/assert) só como leitura, em 1 frase de contexto + blocos da predição; nenhuma seção ensina função/import/assert |
| **R15** | atendida | Apenas os slots previstos; itens de `fora_de_escopo` citados só como "ficam para outras aulas também" (autorizado pelo contrato) |
| **R16** | atendida | Varredura completa: 0 `obj[expr]` com chave não-literal, 0 alias de função (o extrator emitiria `node:ComputedNonLiteralAccess`) |
| **R17** | atendida | pt-BR acentuado, API/sintaxe em inglês; termos novos declarados em `introducesTerms` = ["variável", "declaração", "atribuição", "valor"]; única decisão aberta é O1 (identificadores em pt-BR — ver Limites, sem impacto em R17) |
| **R18** | **N/A justificado** | Conferência mecânica do checksum é gate de AUTORIA (A-P11-5), não da revisão; o autor replicou um "Checksum de cauda" como conteúdo didático no fim do `drill` — inofensivo, sem função de gate |

| Invariante | Veredito | Evidência |
|---|---|---|
| **I5** | atendida | `decl:let` presente em ≥1 exemplo da própria teoria (6 seções: modelo-mental, 2 WEs, refutacoes, referencia, drill) |
| **I6** | atendida | Desafio exige `decl:let` (lacuna única `// LACUNA`); A6 verificado: solução usa `decl:let` e nada fora do produtivo |
| **I9** | atendida | Primeira aparição de `decl:let` é `let contador = 0;` no `modelo-mental` (forma mais simples); o fix registrou e preservou I9 explicitamente ("a primeira aparição de decl:let continua sendo `let contador = 0;` no modelo-mental"); sem forma composta possível (orçamento sem `op:binary:*`) |
| **I7** | N/A justificado | Aula única do experimento — não existem artefatos posteriores neste snapshot; indecidível, não violado (registro para F9/F12) |
| **I8** | N/A justificado | Interleaving exige 3 aulas consecutivas; existe 1 aula; indecidível, não violado |

**Checklist §4.3 (C1–C6):** C1 objetivo → atendido (objetivo reproduzido no draft; teste traduz o
critério); C2 esqueleto → atendido (7 seções nos 3 slots); C3 desafio antes do fechamento → atendido
(C7 verificado: REQ-1 com amparo na teoria); C4 fechamento habilitando o desafio → atendido; C5
provas → atendido (re-executadas aqui, check 4); C6 `desafios_ja_escritos` → documentado (`[]`,
esperado pelo fluxo).

**Atomicidade §3.6:** 4/4 réguas (produtivas novas 1 ≤ 2 · elementos interativos 2 ≤ 2 · não
interativos 0 · tempo ~100 ms) e 4/4 testes de atomicidade (demonstrável, exercitável, orçamentável,
cronometrável) — conforme revisão fase 2, confirmado pelas provas re-executadas (check 4).

---

## Limites declarados

1. **3 A2 = limitação de engine (decisão de produto pendente).** Em modo `declared`, o orçamento
   derivado soma `entryAxiom + introduces.productive` (teto ≤ 2) e o extrator emite os nós-envelope
   (`node:VariableStatement`, `node:VariableDeclaration`, `node:VariableDeclarationList`) que
   `decl:let` não implica no modelo atual → a `solutionCode` (que contém a lacuna de `let`) cai em 3
   A2. Documentado em `contrato.json → limite_conhecido_audit_derivado`: proposta de remediação
   (tratar envelopes como IMPLICADOS pelas chaves declaradas, ou estender
   `STRUCTURAL_ALWAYS_ALLOWED`) é decisão de engine para a onda de integração F12 — **proibido tocar
   `engine/*` nesta worktree**. NÃO é defeito do conteúdo (gates de autoria F7/F8: 0 ofensas; provas:
   valid). Mitigação parcial documentada no contrato: os envelopes já estão no
   `introduces.receptive` do `lesson.json` materializado (zera A4/A1); as 3 A2 da solução permanecem
   por construção.
2. **I13 — nível track: desvio de STAGING, não do conteúdo.** O `track.json` vive em
   `content-src/let-e-atribuicao/trilha/` (pasta de staging do experimento, basename `trilha` ≠ slug
   `let-e-atribuicao`). Nos 3 níveis internos (module/lesson/challenge) `slug == basename(dir)`
   verificado OK. Na localização de PRODUTO (`resources/tracks/<slug>/track.json`), `basename ==
   slug` vale por construção — o próprio `listTrackSlugs` usa o nome do diretório como slug. Registrado
   como propriedade da localização de staging; o loader não valida I13 (é um dos "buracos do loader"
   do §5.2) e `loadTrack` carrega com 0 issues.
3. **I7/I8 N/A (aula única).** Sem artefatos posteriores e sem 3 aulas consecutivas: indecidível, não
   violado; registrado no protocolo (Parte B) e aqui.
4. **`difficulty` provisória.** `lesson.json` e `challenge.json` materializados com `difficulty: 1`
   (default da rampa 1..5 do materializador) — a ser calibrada na integração.
5. **gate-lint L-04 global: 19 arquivos pré-existentes sem newline final** (engine/ferramentas/docs:
   `app/run-dev.sh`, `app/tools/*.sh`, `app/tsconfig*.json`, `app/tests/_fixtures/**`,
   `app/tests/_helpers/README.md`, `app/tests/e2e/README.md`, `docs/*.md`, `tests/gate-bash32.sh`) —
   fora do escopo do experimento; **os 5 arquivos do experimento que estavam sem newline foram
   corrigidos nesta validação** (correção byte-mínima).
6. **Observações da revisão fase 2 não-bloqueantes, mantidas:** O1 (identificadores em pt-BR
   `contador/pontos/nome/x/valor` — decisão única do integrador: manter, registrar exceção); O2
   (**CORRIGIDO** no fix: enunciado alinhado à liberdade do valor inicial — "com um valor inicial",
   sem fixar "0"; cf. check 7); O3 (`+` em prosa como notação matemática, 2 ocorrências, aviso); O4
   (correção do protocolo: a redeclaração `let x = 1; let x = 2;` PARSEIA — é erro semântico do
   checker, não de parse; bloco não executado); O5 (contradição interna no `raciocinio_de_projeto` do
   `challenge-draft.json` — metadado do autor, fora das superfícies, sem efeito nos gates; apontado
   para próxima iteração).

---

## Comandos reprodutores

Todos os comandos rodam com `cwd = app/` (worktree `a05-verificacao`). `node --import tsx` usa o
`tsx` instalado (node_modules real via symlink). Os scripts vivem em
`app/content-src/let-e-atribuicao/verif/` e são os que produziram os números deste relatório.

| # | Comando | Saída esperada |
|---|---|---|
| 1 | `node --import tsx content-src/let-e-atribuicao/verif/check01-schemas.mts` | `TOTAL DE ERROS: 0` · exit 0 |
| 2 | `node --import tsx content-src/let-e-atribuicao/verif/check02-03-load-audit.mts` | `ISSUES: 0` · exit 0 |
| 3 | idem (seção check 3) | `por regra: A2=3` · `hygiene: 0` · `parseErrors: 0` · `VEREDITO FINAL check 3: PASSOU` · exit 0 |
| 4 | `node --import tsx content-src/let-e-atribuicao/verif/check04-provas.mts` | `valid = true` · `declared = 1` · `executed = 1` · exit 0 |
| 5 | `node --import tsx content-src/let-e-atribuicao/verif/check05-invariantes.mts` | I12/I14/I15/I16/I17 OK; I13 OK nos 3 níveis internos; nível track = ressalva de staging (ver Limites) |
| 6 | `bash tests/gate-lint.sh` (raiz da worktree) | L-01..L-03, L-05 verdes; L-04 vermelho APENAS nos 19 pré-existentes (nenhum em `content-src`); L-06 aviso |
| 7 | `node --import tsx content-src/let-e-atribuicao/verif/check06-newlines.mts` | `sem newline final: 0 — todos OK` · exit 0 |
| 8 | `bash tools/t.sh tests/engineAuditPlacar.test.ts` | `✔ engineAuditPlacar — 1 pass, 0 fail` · exit 0 |
| 9 | `node --import tsx content-src/let-e-atribuicao/verif/check07-r8-o2.mts` | 7/7 checks OK (R8 forma sem inicializador + O2 valor livre) · exit 0 |

Equivalência com a engine CLI (para conferência cruzada):
`npm run engine -- audit let-e-atribuicao --limite 0 --modo declared` (a CLI resolve a trilha em
`resources/tracks/<slug>`; a mini-trilha do experimento é carregada por caminho nos scripts acima —
mesma `loadTrack`/`auditTrack`).

---

## Artefatos

- `app/content-src/let-e-atribuicao/relatorio-validacao.md` — **este relatório (novo nesta worktree)**.
- `app/content-src/let-e-atribuicao/verif/check01-schemas.mts` · `check02-03-load-audit.mts` ·
  `check04-provas.mts` · `check05-invariantes.mts` · `check06-newlines.mts` · `check07-r8-o2.mts` —
  reprodutores determinísticos da verificação (novos).
- `app/content-src/let-e-atribuicao/dossie.json` — dossiê do freeze (a01; newline final corrigido).
- `app/content-src/let-e-atribuicao/contrato.json` — contrato (a01; newline final corrigido).
- `app/content-src/let-e-atribuicao/protocolo-de-revisao.md` — protocolo das 18 regras (a06 fase 1;
  newline final corrigido).
- `app/content-src/let-e-atribuicao/revisao-drafts.md` — revisão adversarial fase 2, pré-fix
  (a06 fase 2; newline final corrigido).
- `app/content-src/let-e-atribuicao/lesson-draft.json` — draft de teoria pós-fix R8/O2 (newline
  final corrigido).
- `app/content-src/let-e-atribuicao/challenge-draft.json` — draft de desafio (já com newline final).
- `app/content-src/let-e-atribuicao/trilha/` — materialização no formato do produto (a04):
  `track.json`, `modules/fundamentos-js/module.json`,
  `modules/fundamentos-js/lessons/let-e-atribuicao/lesson.json`,
  `.../challenges/contador-com-let/challenge.json` (todos com newline final).

**Nota de integridade:** os 10 arquivos do experimento foram copiados byte-a-byte de `main`
(verificado com `cmp`); a única divergência introduzida é o append de `\n` nos 5 arquivos acima
(correção L-04) + os 7 arquivos novos desta validação (relatório + 6 scripts).
