# Reconhecimento documental — regras de desafio/validação × nova regra de revisão cumulativa

> **Escopo**: mapear TODOS os sítios documentais (`docs/` + `skills/`) que definem hoje (a) a regra
> "nunca cobrar o que não foi ensinado", (b) a estrutura/obrigações de um desafio, (c) a ORDEM das
> validações/gates de uma aula e (d) qualquer noção de revisão progressiva/cumulativa já existente —
> para preparar a introdução da nova regra *"cada desafio deve também cobrar conhecimentos aprendidos
> em desafios/aulas anteriores (revisão cumulativa), e essa checagem deve ser a ÚLTIMA camada da
> validação de uma aula, correndo depois de validar que todo o conteúdo cobrado foi ensinado até
> aquele ponto do curso (incluindo a aula em curso)"*.
>
> **Método**: leitura seletiva guiada por grep (`não foi ensinado`, `cobrar`, `revis*`, `cumulativ`,
> `P-DURA`, `A15`, `progressiv`, `reusa`, `gate`, `prova`, `requirements`) + leitura integral das
> secções normativas relevantes. Citações são **verbatim** do disco, com `ficheiro:linha`.
> Nenhum ficheiro de código foi alterado; este relatório é a única escrita.

---

## 0. Resumo do terreno em 5 linhas

1. A regra dura ("nunca cobrar o que não foi ensinado") está formalizada **duas vezes**: como
   diferença de conjuntos sobre AST no `docs/16` (bateria A1–A16 + barra A17–A24) e como verificação
   Ensina × Presume nos contratos de linguagem (docs/17, docs/20-rust, docs/20-c).
2. A estrutura do desafio está definida em **camadas sobrepostas**: `docs/16` (§5.4 provas, §9.1
   J1–J9, §10 campos aditivos) → contratos de linguagem (regras `challenge.json`) → skills de autoria
   (`receita-da-aula*.md`) → e, para o desafio do TUTOR em runtime, `docs/05` + `challenge-protocol.md`.
3. A ordem das validações de uma aula vive nas **skills**, não no `docs/16`: `aula-author/references/
   validacao.md` §6 tem a sequência literal ("do mais barato ao mais caro").
4. Já existem **quatro** proto-noções de revisão cumulativa, todas incompletas: **A15b** (aula N
   reutiliza ≥1 átomo demonstrado antes — erro, mas *javascript-only* e sem substituto medido nas
   outras línguas), **I7/A10** (construção reaparece em ≥3 artefatos posteriores — sem gate), o
   **desafio de módulo** ("compõe livremente o que o módulo ensinou") e, no runtime, o tutor já agenda
   **revisão espaçada** (docs/04 §5) e abre a sessão com "pergunta de recuperação".
5. A nova regra **não contradiz** nada frontalmente, mas tem 5 pontos de atrito que a edição tem de
   resolver explicitamente (aula 1 sem nada anterior; sobreposição com A15b; carga/J6; lembrete
   just-in-time da regra 12; colisão de nome com o comando `revise` "revisão progressiva").

---

## 1. Mapa dos sítios normativos

### 1.a A regra "nunca cobrar o que não foi ensinado"

| Sítio | Linha | Citação normativa |
|---|---|---|
| `docs/16-engine-de-trilha.md` §0 | `docs/16-engine-de-trilha.md:22` | *"A regra 'um desafio só pode cobrar o que já foi ensinado' **já existia** neste repositório em duas formas antes desta engine"* |
| `docs/16` §3.3 (assimetria das 4 superfícies) | `docs/16-engine-de-trilha.md:223-238` (fórmula em `:229`) | *"`atomos(testsCode) ⊆ budget_ENTRADA(N).receptive`"* — *"O arquivo de teste usa o orçamento de **entrada** porque **o aluno lê o teste antes de aprender a aula**"* |
| `docs/16` §5.1 (bateria de orçamento) | `docs/16-engine-de-trilha.md:470-490` (A3 em `:476`, A6 em `:479`, A15 em `:488`) | A1–A16; *"**A6 é o gate positivo e não pode ser esquecido.** Sem ele o checker aceita trilhas que só repetem o que o aluno já sabia"* (`:491`) |
| `docs/16` §5.5 (violação de ORDEM × LACUNA) | `docs/16-engine-de-trilha.md:735-759` | *"`primeiraAulaQueEnsina !== null` → **violação de ORDEM**… `=== null` → **LACUNA DE CURRÍCULO**"* — *"Sem essa separação o laço reescreve desafios eternamente para caber num currículo furado e **nunca termina**"* |
| `docs/16` §5.6 (barra A17–A24) | `docs/16-engine-de-trilha.md:761-790` (A19, A20 em `:781`) | *"**A faixa é o catálogo, não o título.** A lista é `REGRAS_DA_BARRA` e ela **cresce**"* (`:812`) |
| `docs/16` §11 (proibições) | `docs/16-engine-de-trilha.md:1787` | *"Tolerar 2 a 5% de construções fora do orçamento \| prosa é redundante, código não é. Em código o limiar é **100%**, e é isso que permite o gate ser binário"* |
| `docs/17-trilha-python.md` §"A verificação Ensina × Presume" | `docs/17-trilha-python.md:655-680` | *"**É reexecutável, e ela é a rede.**… reprova **seis** coisas"* (LACUNA: *"`Presume` apontando para aula que ainda não veio"*) |
| `docs/20-trilha-rust.md` §"A regra de orçamento medida" | `docs/20-trilha-rust.md:342-373` | *"Superfícies de desafio são checadas pela ASSIMETRIA das quatro superfícies — a regra EXATA de [`16`] §3.3, e é ELA que vence, não uma paráfrase mais forte"* |
| `docs/20-trilha-c.md` §"A verificação Ensina × Presume" | `docs/20-trilha-c.md:478-494` | mesmo padrão de docs/17 (script reexecutável) |
| `docs/18-estado-da-fabricacao-dos-cursos.md` §2 | `docs/18-estado-da-fabricacao-dos-cursos.md:23` | *"a skill que codifica as premissas da ferramenta: nunca cobrar o que não foi ensinado (orçamento de átomos sobre AST + 4 provas)"* |
| `docs/00-contratos.md` §9.8 (LAC-1..3 — lado do TUTOR) | `docs/00-contratos.md:818-833` | *"o gate agora impede o curso de **cobrar** o que não ensinou, e estas três regras dizem o que o TUTOR faz quando o aluno chega numa aula cujo pré-requisito não existe em aula nenhuma"* |
| `skills/trilha-author/SKILL.md` (P-DURA, P-QUEBRA) | `skills/trilha-author/SKILL.md:29-33` e `:49-53` | *"**P-DURA — nunca cobrar o que não foi ensinado.** Todo desafio (statement, starter, testes e solução) só pode exigir construções que o currículo da PRÓPRIA trilha… já ensinou"* |
| `skills/aula-author/SKILL.md` (P-DURA) | `skills/aula-author/SKILL.md:37-39` | *"Toda superfície (prosa só com crase, blocos de código, starter, testes, solução) só usa construções do orçamento da PRÓPRIA trilha"* |
| `skills/trilha-author/references/interligacao.md` (P-DURA A4/A2) | `skills/trilha-author/references/interligacao.md:65`, `:91` | *"se a solução de um desafio de B usa uma construção de A sem aula de origem em…"* · *"'cobrar sem ensinar' é exatamente este ('escrito de trás para frente: primeiro o desafio…')"* |
| `skills/trilha-author/references/validacao.md` §5 | `skills/trilha-author/references/validacao.md:203-213` | a triagem ORDEM × CADEIA × LACUNA com `primeiraAulaQueEnsina` |
| `skills/aula-author/references/situacoes.md` §1, §4 | `skills/aula-author/references/situacoes.md:55-72`, `:88-97` | tabela sintoma→ação (A3, A6, ORDEM, LACUNA) |
| (histórico) `docs/15-trilha-nodejs.md` | `docs/15-trilha-nodejs.md:414` | *"aulas micro, **≤1 avanço produtivo (≤2 receptivos) por aula**, e nada é cobrado sem ter sido…"* — **registro, não contrato** (`docs/15-trilha-nodejs.md:5`) |

### 1.b Estrutura/obrigações de um desafio (statement/starter/testes/solução/requirements)

| Sítio | Linha | Citação normativa |
|---|---|---|
| `docs/16` §5.4 (as 4 provas de execução) | `docs/16-engine-de-trilha.md:695-733` | *"Um desafio só é válido se as quatro passarem"* (`:697`): solução passa · starter falha · contagem bate · stub vazio falha (+ `typesCheck` opcional) |
| `docs/16` §9.1 (J1–J9 — a prova de que um desafio é justo) | `docs/16-engine-de-trilha.md:1569-1585` | J1 Contenção · J2 Exercício · J3 Solubilidade · J4 Especificação (bijeção enunciado↔teste) · J5 Discriminação · J6 Carga · J7 Alinhamento · J8 Feedback · J9 Escopo declarado (`notRequired[]` não vazio) |
| `docs/16` §10 (campos aditivos em `challenge.json`) | `docs/16-engine-de-trilha.md:1746-1750` | *"`requires` (com a aula que ensina cada construção); `requirements` (bijeção com os testes); `notRequired`; `subgoals`…"* |
| `docs/16` §5.1 A6 / §5.6 A20 | `docs/16-engine-de-trilha.md:479`, `:781` | A6 *"a **direção puxada**"* · A20 *"**aula sem prova** — aula de qualquer papel sem desafio"* |
| `docs/17` §"Regras para os desafios de aula (`challenge.json`)" | `docs/17-trilha-python.md:1014-1037` | layout, fases de canal, *"o teste **falha** com o starter e **passa** com a solução; `expectedTestCount` = nº de testes; 2–4 testes por desafio de aula"*, cenário `error` só se A11 permitir, proibições |
| `docs/17` §"Desafios de módulo" | `docs/17-trilha-python.md:891-904` | *"pode compor livremente o que o módulo ensinou, mas **não pode introduzir construção nova**"* (`:901`) |
| `docs/20-trilha-c.md` §"Regras para os desafios de aula" + §"Desafios de módulo" | `docs/20-trilha-c.md:805-850`, `:775-792` | idem, com protótipos congelados, `counter_protocol`, cenários 1–4 (*"pode compor livremente o que o módulo ensinou"*, `:782`) |
| `docs/20-trilha-rust.md` §"As cláusulas de autoria do harness Rust (obrigatórias a todo desafio)" | `docs/20-trilha-rust.md:374-423` | 13 cláusulas (manifesto, starter `todo!()`, teste `#[test]`, dupla-igualdade, `use` um por linha, primitivos no starter…) |
| `docs/05-challenges-tdd.md` §2.1 (anatomia de um desafio — setup do ALUNO) | `docs/05-challenges-tdd.md:105-133` | enunciado · stub · teste · referência · alternativas · empty stub · mutantes · runner · manifesto (`meta.json`) |
| `docs/05` §3 + §4 (protocolo `validar_teste`) | `docs/05-challenges-tdd.md:195`, `:449` | *"A regra dura: **testes executados > 0** nunca é opcional"* · os 7 passos do `challenge-verify.sh` |
| `docs/00-contratos.md` §9.5 (DES-1..9) | `docs/00-contratos.md:779-791` | *"**Você autora, o harness julga**"* · DES-4 igualdade de contagem · DES-9 máx. 3 regenerações |
| `skills/aula-author/references/receita-da-aula.md` §2 + §2.1 | `skills/aula-author/references/receita-da-aula.md:93-135` | o schema real do `challenge.json` e a *"bijeção 1:1 com os testes"* (`requirements[]` objetos) |
| `skills/aula-author/references/receita-da-aula-{python,rust,c}.md` §3/§6 | v.g. `skills/aula-author/references/receita-da-aula-c.md:104-118` (§"Tetos da barra e o gate da trilha") | forma do arquivo de teste por língua + tetos da barra |
| `skills/aula-author/SKILL.md` passo 4 | `skills/aula-author/SKILL.md:104-107` | *"`challenge.json` completo: statement, starter, testes, solução, `expectedTestCount`, `outputChannel` pela fase, `requirements[]` 1:1 com os testes"* |
| `skills/trilha-author/references/autoria-aula.md` §0–§3 | `skills/trilha-author/references/autoria-aula.md:20`, `:41-56` | idem pela skill de trilha (inclui desafio de módulo: *"não pode introduzir construção nova"*) |
| `skills/study-method/references/challenge-protocol.md` (desafio do TUTOR em runtime) | `skills/study-method/references/challenge-protocol.md:30-45` (§1), `:57-75` (§2), `:119-135` (§3) | *"Você AUTORA. O harness JULGA"*; cenários `boundary/error/example/property`; os 7 passos do `challenge-verify.sh` |
| `skills/study-method/SKILL.md` (DES-1..9) | `skills/study-method/SKILL.md:139-148` | regras permanentes do desafio de tutoria |
| (fora de escopo, mas em coerência obrigatória) | `app/content-src/BARRA-DE-AUTORIA.md`, `app/content-src/analise-verificadores.md` §3–§6, `app/electron/main/services/challengeContextValidator.ts` | a página da barra para quem autora, a especificação formal de A13–A16 e o validador de contexto de desafio do produto |

### 1.c A ORDEM das validações/gates de uma aula

| Sítio | Linha | Citação normativa |
|---|---|---|
| `docs/16` §4.3 (ordem interna de AUTORIA de uma aula) | `docs/16-engine-de-trilha.md:429-437` | *"Objetivo → esqueleto de teoria (F7) → **desafio e testes** (F8) → fechamento da teoria sabendo o que precisa habilitar. Itens de avaliação vêm **antes** dos materiais"* |
| `docs/16` §6.1 (ordem do laço de revisão — 6 passos) | `docs/16-engine-de-trilha.md:898-918` | *"1. VERIFICADORES DETERMINÍSTICOS (orçamento AST · node:test · pins) ↓ 2. REVISOR LLM (só com os três verdes) ↓ 3. FILTRO ESTRUTURAL ↓ 4. PROVADOR ↓ 5. PLANEJADOR → CORRETOR ↓ 6. RE-VERIFICAÇÃO"* — *"**O revisor LLM só é chamado quando os três verificadores estão verdes**"* |
| `docs/16` §5 (ordem expositiva dos gates: 5.1 orçamento → 5.2 invariantes → 5.3 extrator → 5.4 provas → 5.6 barra) | `docs/16-engine-de-trilha.md:440-900` | *"ambiente provado **não** é conteúdo aprovado — a bateria de orçamento (§5.1–§5.2) e as provas de execução (§5.4) continuam valendo"* (`:468`) |
| `skills/aula-author/references/validacao.md` §6 (**A ORDEM canónica por aula**) | `skills/aula-author/references/validacao.md:117-131` | *"## 6. A ordem de execução para publicar uma aula — Do mais barato ao mais caro"*: 1 `barra` → 2 `audit` → 3 `coverage` → 4 `requirements` → 5 `track:challenge:verify` (4 provas) → 6 typewriter → 7 gates de repo → 8 `publicar` |
| `skills/aula-author/SKILL.md` passo 5 (`validar`) | `skills/aula-author/SKILL.md:108-111` | *"os gates, do mais barato ao mais caro: `barra <slug> --aula MOD/AULA` (0 erros A17–A21/A23–A24), `audit --limite 0` (0 violações — já inclui a barra), `coverage` (0 lacunas…), `requirements` (bijeção), `track:challenge:verify` (4 provas), typewriter, gate-lint"* |
| `skills/trilha-author/SKILL.md` passo 5 (`validar_modulo`) + P-PROVA | `skills/trilha-author/SKILL.md:143-147`, `:71-73` | *"roda os **seis** gates: `audit` (0 violações), `barra` (0 erros A17–A23), `coverage` (0 lacunas), `requirements` (bijeção), `track:validate`/`track:challenge:verify` (quatro provas por desafio) e o laço `convergir`"* |
| `skills/trilha-author/references/validacao.md` §1 (os SEIS gates, um por pergunta) | `skills/trilha-author/references/validacao.md:88-104` | tabela `audit`/`barra`/`coverage`/`requirements`/`track:validate`/`convergir` + §2 os comandos + §7 `publicar` re-roda os seis |
| `skills/trilha-author/references/qualidade-aula.md` §10 (O veredito) | `skills/trilha-author/references/qualidade-aula.md:138-144` | *"a sequência é `audit` 0 violações → `barra` 0 erros (A17–A24) → `coverage` 0 lacunas → `requirements` em bijeção → `track:validate` ok → `convergir` em **PONTO-FIXO**"* |
| `skills/aula-author/references/situacoes.md` (ordem de consulta por sintoma) | `skills/aula-author/references/situacoes.md:16-18` | *"## 0. Barra pedagógica A17–A23 — a primeira tabela a consultar"* |
| `docs/18` §8.3 + `skills/trilha-author/references/validacao.md` §0 (ambiente ANTES do gate) | `docs/18-estado-da-fabricacao-dos-cursos.md:136-143` | *"**A prova de ambiente é passo da AUTORIA, não do gate**"* (`docs/16:460`) — ambiente → conteúdo → (laço) |

### 1.d Noções de revisão progressiva/cumulativa já existentes

| Sítio | Linha | Citação normativa | O que cobre / o que falta |
|---|---|---|---|
| `docs/16` A15 (PROGRESSIVIDADE) | `docs/16-engine-de-trilha.md:488` (detalhe em `:570-572`) | *"A15a (2+ desafios): o degrau reusa algo do anterior e adiciona ≤1 não demonstrado; A15b: a aula N reutiliza ≥1 átomo demonstrado antes"* — *"(recuperação espaçada, I7 em versão de conteúdo)"* | **é a regra-irmã da nova**: reuso inter-aula, mas ao nível da AULA, e **não roda** em python/rust/C (`docs/16:510`: *"A15a/A15b (progressividade intra e inter-aula)"* continuam sem medida) |
| `docs/16` I7 / A10 | `docs/16-engine-de-trilha.md:541`, `:483` | *"construção introduzida reaparece em ≥3 artefatos posteriores"* | reaparecimento ≠ cobrança; **sem gate** (`skills/trilha-author/references/qualidade-aula.md:165`: *"I7 \| reaparece em ≥3 artefatos posteriores \| ninguém"*) |
| `docs/16` §3.5 "O orçamento cumulativo" | `docs/16-engine-de-trilha.md:272-290` | `budget_entrada(N) = entryConstructs ∪ fecho-para-baixo(desbloqueado_por(N))` | é **disponibilidade** cumulativa (o que PODE ser cobrado), não revisão (o que É cobrado de novo) |
| `docs/16` §3.4 (aresta `usa[]`) | `docs/16-engine-de-trilha.md:257` | *"`usa[]` \| linha da Q-matrix: B exercita A \| orçamento cumulativo"* | a Q-matrix "B exercita A" é exatamente o dado de que a nova regra precisa — hoje só alimenta o orçamento |
| `docs/16` §7.1 regras 11–12 do autor | `docs/16-engine-de-trilha.md:1426-1430` | *"11. **Comece com retrieval** — uma pergunta sobre uma aula ancestral declarada."* · *"12. … Se uma construção foi ensinada há mais de *k* aulas e não está visível, ela **entra** na referência just-in-time — exigir na aula 14 algo da aula 6 sem lembrete é atenção dividida no tempo"* | retrieval na TEORIA; a regra 12 impõe lembrete quando se cobra conhecimento antigo |
| `docs/17` §"A tensão A6 × I3" (aulas de consolidação) | `docs/17-trilha-python.md:623-652` | *"Uma aula de consolidação declara `role: "consolidation"` e lista em `introduces.productive` o átomo que **reexercita**"* — *"São 109 aulas de consolidação em 337 (32%)"* | reexercitação declarada ao nível da AULA (re-declara `targetAtom`) |
| `docs/17` / `docs/20-c` §"Desafios de módulo" | `docs/17-trilha-python.md:901`, `docs/20-trilha-c.md:782` | *"pode compor livremente o que o módulo ensinou, mas não pode introduzir construção nova"* | o desafio de módulo JÁ é composição cumulativa — informal (sem régua de quanto deve revisitar) |
| `docs/20-trilha-rust.md` princípios pedagógicos nº 5 | `docs/20-trilha-rust.md:437` | *"**Interleaving** (A15b/I7): a coluna `Presume` é a prova mecânica; nenhuma família sintática ocupa três aulas seguidas sem intercalação"* | interleaving de ordem, não cobrança |
| `docs/02-pedagogia.md` §4.2 + decisão D-E09 | `docs/02-pedagogia.md:145-146`, `:302` | *"**Retrieval practice / testing effect** — recuperar da memória fixa mais que reler"* · *"**Spacing** — distribuir a prática no tempo"* · D-E09: *"(b) toda sessão tem ≥ 2 tópicos, sendo ≥ 1 revisão espaçada de conceito anterior"* **[adotada]** | a fundamentação pedagógica da nova regra já está citada e auditada |
| `docs/04-proficiencia.md` §5 (repetição espaçada mínima viável) | `docs/04-proficiencia.md:321-352` | *"Menos revisão para o que está sólido, mais para o que é frágil… `interval_days` começa em **1**"* | agendamento de revisão no RUNTIME (tutor), não no conteúdo autorado |
| `skills/trilha-author/references/qualidade-aula.md` §5–§6 | `skills/trilha-author/references/qualidade-aula.md:41-44`, `:62-63` | *"**Comece com retrieval** (regra 11): uma pergunta sobre uma aula ancestral declarada"* · *"a aula N reutiliza ≥1 átomo demonstrado antes (A15b — recuperação espaçada)"* | a receita do desafio já menciona A15b, sem gate por trás |
| `skills/trilha-author/references/validacao.md` §3 + `skills/aula-author/references/validacao.md` §1 | `skills/trilha-author/references/validacao.md:172`, `skills/aula-author/references/validacao.md:33-35` | *"A15a/A15b \| degrau entre desafios da mesma aula; reuso de átomo de aula anterior \| **nenhum** — escrever já discriminando"* | **a lacuna declarada** que a nova regra vem preencher |
| `skills/study-method/references/pedagogia.md` (C-1, LAC-1, checklists) | `skills/study-method/references/pedagogia.md:23`, `:191`, `:278-279` | *"(2) **uma pergunta de recuperação** sobre a sessão anterior"* · *"'está no material de alguma aula **anterior** já disponível? → é revisão'"* · *"[ ] A sessão tem ≥ 2 tópicos, sendo ≥ 1 revisão espaçada"* | revisão como sessão/fluxo do tutor |
| `skills/study-method/references/challenge-protocol.md` §1 | `skills/study-method/references/challenge-protocol.md:32-33` | *"conceitos com estado `fragile` têm prioridade; `unknown` vem depois; `mastered` só entra como conceito de apoio"* | conceito antigo entra como APOIO — nunca como cobrança declarada |

> ⚑ **Colisão de nome a resolver já agora.** O termo **"revisão progressiva" está TIDO**: é o
> comando `revise <slug>` — *"a revisão progressiva: varre da 1ª à última aula até o hash do
> relatório estabilizar"* (`docs/16-engine-de-trilha.md:1516`) — e o diretório
> `app/content-src/<slug>/revisao-progressiva/` que ele escreve (`skills/trilha-author/references/
> validacao.md:262`). Ele revisa **ARTEFATOS**, não é revisão pedagógica. A nova regra deve usar
> "revisão **cumulativa**" (como já faz) e, em todo o texto novo, distinguir explicitamente das duas.

---

## 2. Sítio a sítio: o que diria hoje sobre "cada desafio revisita conhecimentos anteriores"

Legenda: **SILÊNCIO** = não diz nada (adição pura) · **ATRITO** = diz algo que a edição tem de
reconciliar · **CONTRADIÇÃO** = leitura literal impede a nova regra.

### Contratos normativos (`docs/`)

| Sítio | Veredito hoje | O parágrafo que teria de mudar |
|---|---|---|
| `docs/16` §§2–3 (princípios, modelo de dados) | **SILÊNCIO** + base pronta: a aresta `usa[]` (`:257`) e o orçamento cumulativo (§3.5) já trazem o dado "B exercita A"; nada exige que o desafio o *use* como cobrança | §3.4/§3.5: acrescentar que a aresta `usa[]` alimenta não só o orçamento mas a **obrigação de revisão cumulativa por desafio**; §3.6 (teto de 120 s / carga) ganha uma ressalva: revisão cumulativa conta no `element_count` |
| `docs/16` §4.3 (ordem interna de uma aula) | **SILÊNCIO** — define ordem de autoria, não de conteúdo do desafio | novo parágrafo: o desafio é autorado "depois da teoria" **e** carrega uma camada de revisão que só pode ser fechada com o mapa do que as aulas anteriores ensinaram |
| `docs/16` §5.1 (A1–A16) | **ATRITO produtivo**: **A15a/A15b** já é "progressividade" (reuso de átomo de aula anterior) — erro em JS, **sem medida** nas outras línguas (`:510`) | decidir se a nova regra **substitui/subsume A15b** (recomendado: A15b vira o caso particular "ao nível da aula", a nova é "por desafio") e registar a decisão no padrão ⚑ |
| `docs/16` §5.4 (4 provas) | **SILÊNCIO** — provas de execução não julgam *o quê* se cobra, só se o par teste/solução é íntegro | nada obrigatório; se a revisão cumulativa vir exigir um "prova 6" (ex.: cenário de revisão executado), muda-se aqui |
| `docs/16` §5.6 (barra A17–A24) | **ATRITO de forma**: *"A faixa é o catálogo, não o título"* (`:812`) — se a checagem nova for uma regra `A25` na `REGRAS_DA_BARRA`, todos os textos que dizem "A17–A24" passam a mentir | §5.6 (ou nova §5.7): introduzir a regra **derivando sempre o catálogo**; atualizar títulos que cravam a faixa |
| `docs/16` §6.1/§6.5 (laço de revisão + severidade) | **SILÊNCIO** — a tabela de categorias (`construcao_nao_ensinada`, `cobertura_faltante`…) não tem categoria para "falta revisão cumulativa" | §6.5: nova categoria (ex. `revisao_cumulativa_faltante`) com severidade e ramo do `convergir` |
| `docs/16` §9.1 (J1–J9) | **ATRITO**: J6 (Carga) e J4/J5 são as vizinhas; nada prova "o desafio revisita o passado" | nova cláusula **J10 — Revisão cumulativa** (o que ela prova e como), ou extensão de J2/J5 |
| `docs/16` §10 (campos aditivos) | **BASE PRONTA**: `requires` (*"com a aula que ensina cada construção"*) e `requirements` já existem como âncora declarativa | §10: declarar o campo (ex. `review[]`/`requires` estendido) que declara **o quê do passado cada desafio cobra** — campos aditivos passam hoje (§10: *"O schema do produto é **aberto**"*) |
| `docs/16` §11 (proibições) | **SILÊNCIO** | opcional: proibir "desafio que só cobra o novo" (o oposto de A6) — a regra nova é *adicional*, então basta um parágrafo positivo |
| `docs/17-trilha-python.md` | **SILÊNCIO** na parte das regras de desafio (`:1014-1037`); **ATRITO** com a estrutura de consolidação (`:623-652` — 32% consolidação re-declara `targetAtom`) e com o desafio de módulo (`:901`) | secção "Regras para os desafios de aula": nova obrigação (campo de revisão + régua de quanto cobrar); secção A6×I3: dizer que a revisão cumulativa **resolve** a tensão (consolidação passa a cobrar o passado legitimamente) |
| `docs/20-trilha-rust.md` | **SILÊNCIO** nas 13 cláusulas (`:374-423`); **ATRITO** leve com o princípio 5 (Interleaving A15b/I7, `:437`) | cláusulas de autoria: adicionar a cláusula da revisão cumulativa (o nº 14); princípio 5: ligar à nova regra |
| `docs/20-trilha-c.md` | **SILÊNCIO** (`:805-850`, `:775-792`) | idem docs/17/20-rust (regras de desafio + desafio de módulo) |
| `docs/18-estado-da-fabricacao` | **SILÊNCIO** (é estado, não contrato) | §3.2/"Regras de autoria" e §4 "Dívidas": registar a regra nova como dívida até os gates existirem |
| `docs/00-contratos.md` §9.5 (DES-1..9, lado do tutor) | **SILÊNCIO** — DES fala de validade de teste, não de escopo de cobrança | se a regra valer para o desafio de tutoria: nova regra `DES-10` **e** atualizar a invariante `I-33` (`docs/00-contratos.md:916` — *"contém os 90 IDs de regra do §9"*) e a contagem de §9.9 |
| `docs/05-challenges-tdd.md` | **SILÊNCIO** (anatomia + protocolo de validação de teste do setup do aluno) | se valer para o runtime: §2.1 (artefatos) ganharia obrigação de "cenário de revisão"; §4 (protocolo) ganharia passo; caso contrário, **declarar a exclusão** numa nota |
| `docs/02-pedagogia.md` | **BASE PRONTA** (retrieval/spacing já citados, D-E09 adotada) | nada obrigatório; pode ganhar uma frase ligando D-E09 à nova regra |
| `docs/04-proficiencia.md` | **SILÊNCIO para o conteúdo autorado** (é agendamento de sessão do tutor) | nada obrigatório; se a revisão cumulativa quiser usar `interval_days`/`proficiency_state` para escolher o que revisitar, a ligação é aqui |
| `docs/19-auditoria-da-aula.md` | **REGISTO HISTÓRICO** (auditoria de um artefato) | nada obrigatório; a tabela J1–J9 de §3.1 pode ganhar nota ⚑ quando a J10 existir |

### Skills de autoria (`skills/trilha-author`, `skills/aula-author`)

| Sítio | Veredito hoje | O parágrafo que teria de mudar |
|---|---|---|
| `skills/trilha-author/SKILL.md` (P-DURA, P-CONTRA, P-PROVA, passo 5) | **SILÊNCIO** quanto a revisão; **ATRITO**: P-PROVA enumera *"os **seis** gates"* (`:71-73`) e o passo 5 lista os mesmos (`:143-147`) | P-PROVA + passo 5 + tabela de roteamento: adicionar a camada de revisão cumulativa **como última**, depois do "tudo cobrado foi ensinado" |
| `skills/trilha-author/references/validacao.md` (§1 seis gates, §2 comandos, §3 lacunas, §5 ordem×lacuna, §7 publicar) | **ATRITO direto**: §3 tabela (`:172`) declara **"A15a/A15b → substituto nenhum"** | §1 (nova linha de gate/regra), §2 (comando), §3 (substituto da lacuna A15a/A15b), §5 (novo ramo na triagem), §7 (re-rodar inclui a camada) |
| `skills/trilha-author/references/qualidade-aula.md` (§5 retrieval, §6 receita do desafio, §10 veredito, §11 invariantes) | **ATRITO**: §6.3 já manda *"a aula N reutiliza ≥1 átomo demonstrado antes (A15b — recuperação espaçada)"* (`:62-63`) e §5 traz as regras 11–12 | §6 (receita do desafio ganha o passo de revisão cumulativa), §10 (sequência do veredito), §11 (I7/A15b ganham "quem roda" novo) |
| `skills/trilha-author/references/autoria-aula.md` (schema da aula/desafio) | **SILÊNCIO** | §2 (`challenge.json`): o campo de revisão e a obrigação |
| `skills/trilha-author/references/interligacao.md` (cadeia de cursos) | **SILÊNCIO** (a revisão cumulativa é INTRA-curso; a cadeia é inter-curso) | opcional: uma frase dizendo que a revisão cumulativa nunca cobra construção de curso anterior sem porta-de-entrada (regra P-DURA A4/A2 continua vencendo) |
| `skills/trilha-author/references/recursao.md` (§2 seis ramos do `convergir`) | **ATRITO**: o catálogo de ramos (`ORDEM/CADEIA/LACUNA/QUEBRA/DEMONSTRAÇÃO/PROVA`, `:36-48`) não tem ramo para "falta revisão" | §2: novo ramo (ou sub-ramo de `PROVA`) + ação do catálogo fechado (ex. `ADD_REVIEW`); §5 (`limitacoesDeclaradas`) |
| `skills/aula-author/SKILL.md` (P-DURA, P-CONTRA, passo 4/5) | **SILÊNCIO**; passo 5 (`validar`, `:108-111`) traz a ordem canónica | passo 4 (`escrever_desafio_e_testes`) ganha a obrigação; passo 5 ganha a camada **última** |
| `skills/aula-author/references/receita-da-aula.md` §2/§2.1 | **SILÊNCIO** (schema do desafio) | §2: campo de revisão + régua; §2.1: se a revisão virar `requirements[]` estendidos, dizer como |
| `skills/aula-author/references/receita-da-aula-{python,rust,c}.md` | **SILÊNCIO** (são adaptadores de língua) | só se a revisão cumulativa tiver forma de teste específica por língua (ex. cenário `review` no `testsCode`) — senão, nada |
| `skills/aula-author/references/validacao.md` §1 + §6 | **ATRITO direto** (é a ordem canónica) | §1 (nova regra na tabela de gates) e **§6 (inserir o passo novo na posição certa — última camada)** |
| `skills/aula-author/references/situacoes.md` | **SILÊNCIO** | nova linha de sintoma→ação ("desafio não cobra nada do passado → ação X") |
| `skills/aula-author/references/quebra-da-aula.md` | **ATRITO leve**: §3 (`:155-157`) exige *"cada aula… com desafio próprio"* e §2 (`ANTES (...)`) classifica chaves já ensinadas | só se a quebra tiver de preservar a revisão cumulativa distribuída entre as aulas novas — uma frase em §3/§4 |

### Skill de runtime/tutor (`skills/study-method`)

| Sítio | Veredito hoje | O parágrafo que teria de mudar |
|---|---|---|
| `skills/study-method/SKILL.md` (DES-1..9, LAC-1..3) | **SILÊNCIO / CONTRADIÇÃO PARCIAL**: as DES cobram validade de teste; o enquadramento é **um conceito por desafio** (`challenge-new.sh --concept <concept_id>`, `skills/study-method/SKILL.md:185`) e *"proponha **outro** desafio do mesmo conceito"* (DES-9, `:148`) | se a regra valer no runtime: DES nova + `challenge-protocol.md` §1/§2 + manifest (`concept_id`/`scenarios[]`) + `docs/05`; se NÃO valer, **declarar expressamente que a regra é de AUTORIA de trilhas**, para não haver dois padrões silenciosos |
| `skills/study-method/references/challenge-protocol.md` (§1 propor, §2 artefatos, §3 validar 0–6, §6 "nunca faça") | **SILÊNCIO como obrigação**; **coerência parcial** já existente: *"mastered` só entra como conceito de apoio"* (`:33`) e a prioridade de `fragile` (`:32`) — conceito antigo entra, mas como apoio/mixagem, nunca como cobrança verificada; a validação (passos 0–6) não checa nada disso | §1 (propor: exigir ≥1 conceito já resolvido como cobrança), §3 (novo passo de verificação ou extensão do passo 0/6) |
| `skills/study-method/references/pedagogia.md` (C-1, LAC-1, checklist de sessão) | **BASE PRONTA** (pergunta de recuperação, "≥ 1 revisão espaçada") | nada obrigatório; se o desafio passar a cobrar o passado, a checklist de sessão pode citar o par desafio↔revisão |

---

## 3. Riscos de coerência que a edição tem de decidir (antes de escrever)

1. **A aula 1 (e a primeira aula de cada curso/porta) não tem "anteriores".** "Cada desafio deve
   também cobrar conhecimentos aprendidos em desafios/aulas anteriores" é insatisfazível na aula 1
   (`docs/17-trilha-python.md:162`: *"A aula 1 é só `print`, e é uma ordem do dono"*; `docs/15`:
   *"presume: nada"*). A A15b já herda este problema e resolve-o em silêncio (não contém "para N=1").
   **A edição tem de escrever a exceção literal**: "a partir da 2ª aula; na 1ª (e na 1ª do módulo
   porta-de-entrada) o desafio cobra apenas o que a própria aula ensina + axioma/semente".
2. **Sobreposição com A15b/I7/A10.** Sem decisão, teremos três regras de "reuso" (A15b por aula, I7
   reaparecimento, a nova por desafio) — e A15b está declarada como **sem substituto medido**
   (`skills/trilha-author/references/validacao.md:172`). Recomendação: a nova regra passa a ser o
   substituto agnóstico de linguagem da A15b, e o texto diz isso.
3. **Ordem "última camada".** Hoje a ordem canónica por aula
   (`skills/aula-author/references/validacao.md:117-131`) termina em provas de execução/typewriter;
   a camada "todo o conteúdo cobrado foi ensinado até aqui (incluindo a aula em curso)" é materializada
   pelo `audit` (A1–A4/`primeiraAulaQueEnsina`) + `coverage` (LACUNA) + `requirements`. A checagem nova
   tem de correr **depois destes três** (nunca antes: senão aprova desafio que cobra não-ensinado "do
   passado"), e as skills/docs têm de dizer a posição exata.
4. **Carga e J6/§3.6.** Revisão cumulativa aumenta `element_count` e o tempo de resolução (teto de
   120 s, `docs/16:291-300`). A edição tem de pôr um teto (ex.: "≤N requisitos de revisão por desafio")
   ou declarar que revisão não conta como elemento novo (e porquê).
5. **Regra 12 (just-in-time).** *"exigir na aula 14 algo da aula 6 sem lembrete é atenção dividida no
   tempo"* (`docs/16:1429-1430`). Cobrar o passado em todo desafio **ativa** a obrigação de lembrete —
   ou a regra tem de dizer que revisão cumulativa cobra o que está a ≤k aulas de distância, ou o
   desafio tem de trazer a referência just-in-time.
6. **Colisão de nome com `revise`/"revisão progressiva"** (ver §1.d ⚑).
7. **Alcance: autoria × runtime.** As duas famílias de "desafio" (trilha autorada × desafio gerado
   pelo tutor no setup do aluno) têm contratos separados. A regra tem de declarar se vale para uma ou
   para as duas; hoje o runtime tem até uma noção oposta sutil (DES-9 "outro desafio do **mesmo**
   conceito").
8. **Efeitos em invariantes de repo.** Novos IDs de regra em `docs/00` §9 quebram a contagem
   literal de `I-33` (*"os 90 IDs de regra do §9"*, `docs/00-contratos.md:916`) e o `tests/validate.sh`;
   faixas cravadas ("A17–A24") violam a disciplina *"A faixa é o catálogo, não o título"*
   (`docs/16:812`).

---

## 4. Plano de edição documental (checklist)

Prioridade: **P1** = contrato normativo (faz a regra existir) · **P2** = skills de autoria (faz a
regra ser aplicada) · **P3** = coerência lateral (evita mentira por omissão).

### P1 — Contratos normativos

- [ ] **`docs/16-engine-de-trilha.md` §5 (gates)** → nova subsecção (§5.7 "revisão cumulativa" ou
  regra `A25` dentro da barra §5.6): **acrescentar a definição formal da checagem** ("cada desafio cobra
  ≥1 conhecimento já ensinado em aula/desafio anterior"), a exceção da aula 1, e a declaração de que ela
  é a **ÚLTIMA camada**, correndo depois do `audit`/`coverage`/`requirements`. Intenção: a regra passa
  a ter um enunciado verificável, com posição de execução explícita.
- [ ] **`docs/16-engine-de-trilha.md` §5.1 (A15)** → reconciliar A15a/A15b com a regra nova: dizer
  que A15b é o caso "ao nível da aula" e que a revisão cumulativa é o substituto agnóstico de linguagem
  (ou promovê-la a caso particular). Intenção: uma regra de reuso só, nunca três.
- [ ] **`docs/16-engine-de-trilha.md` §9.1 (J1–J9)** → nova cláusula **J10 — Revisão cumulativa**
  (o que prova e como: ex. "os `requirements[]` de revisão apontam para aula anterior, e a aula anterior
  existe na ordem"). Intenção: a justiça do desafio passa a incluir o revisitar, com prova definida.
- [ ] **`docs/16-engine-de-trilha.md` §10 (campos aditivos)** → declarar o campo de revisão em
  `challenge.json` (ex. `review[]`/extensão de `requires`), aproveitando que campos aditivos passam
  hoje. Intenção: o desafio declara o que revisita — o gate tem o que conferir.
- [ ] **`docs/16-engine-de-trilha.md` §3.6 + §6.5** → §3.6: régua de carga da revisão (teto de
  requisitos de revisão por desafio vs. teto de 120 s); §6.5: nova categoria de severidade
  (`revisao_cumulativa_faltante`) na tabela fixa. Intenção: a revisão não pode estourar a carga nem
  cair em categoria inventada pelo revisor.
- [ ] **`docs/17-trilha-python.md` §"Regras para os desafios de aula" + §"Desafios de módulo"** →
  acrescentar a obrigação de revisão cumulativa ao `challenge.json` (campo + régua) e explicitar que o
  desafio de módulo já cumpre a regra por definição (composição do que o módulo ensinou). Intenção:
  contrato de Python coerente com a engine; módulo deixa de ser exceção informal.
- [ ] **`docs/20-trilha-rust.md` §"As cláusulas de autoria do harness Rust"** → cláusula nova (nº 14:
  revisão cumulativa obrigatória a todo desafio, com o campo e a régua). Intenção: as 13 cláusulas
  passam a 14, sem redescoberta por onda.
- [ ] **`docs/20-trilha-c.md` §"Regras para os desafios de aula" + §"Desafios de módulo"** → idem
  docs/17. Intenção: contrato de C coerente.
- [ ] **`docs/00-contratos.md` §9.5 (DES-1..9)** → decidir alcance do runtime; se a regra valer
  também para o tutor: `DES-10` + atualizar `I-33` (contagem de IDs) e a contagem de §9.9. Intenção:
  regra permanente com ID estável e gate de repo coerente.

### P2 — Skills de autoria

- [ ] **`skills/trilha-author/SKILL.md` (P-DURA/P-PROVA + passo 5 `validar_modulo` + tabela de
  roteamento)** → nova premissa (ex. **P-CUM** — "todo desafio também cobra o passado") e a camada
  nova na lista dos gates, **em último lugar**, com a ordem explícita. Intenção: quem orquestra a
  autoria aplica a regra na posição certa.
- [ ] **`skills/trilha-author/references/validacao.md` §1 (seis gates), §2 (comandos), §3 (lacuna
  A15a/A15b), §5 (triagem ordem×lacuna), §7 (`publicar`)** → registar a checagem nova como camada
  final; preencher o "substituto hoje" de A15a/A15b; novo desfecho na triagem; `publicar` re-roda com a
  camada. Intenção: o manual de gates deixa de declarar "nenhum" onde passa a haver medida.
- [ ] **`skills/trilha-author/references/qualidade-aula.md` §6 (receita do desafio) + §10 (O
  veredito) + §11 (invariantes)** → §6: passo de autoria "escolher o que o desafio revisita"; §10:
  sequência do veredito com a camada última; §11: I7/A15b ganham dono de gate. Intenção: a receita
  do teste passa a sair já com revisão.
- [ ] **`skills/trilha-author/references/recursao.md` §2 (seis ramos) + §5** → novo ramo/ação do
  catálogo fechado para "falta revisão cumulativa" (ex. `ADD_REVIEW`) e ledger coerente. Intenção: o
  `convergir` classifica e trata o achado novo sem ação improvisada.
- [ ] **`skills/aula-author/SKILL.md` (P-DURA/ P-CONTRA + passo 4 `escrever_desafio_e_testes` +
  passo 5 `validar`)** → passo 4 ganha a obrigação de revisão (campo + régua + escolha do que revisar);
  passo 5 ganha a checagem **como última camada**. Intenção: quem escreve UMA aula cumpre a regra sem
  ler o contrato da engine.
- [ ] **`skills/aula-author/references/receita-da-aula.md` §2/§2.1** → schema do `challenge.json`
  ganha o campo de revisão + a régua ("≤N requisitos de revisão; aula 1 isenta"); se a revisão usar
  `requirements[]`, dizer como se declara. Intenção: o schema real fica completo.
- [ ] **`skills/aula-author/references/validacao.md` §1 (tabela de gates) + §6 (A ordem de
  execução)** → inserir o passo novo **no fim da ordem canónica**, depois de `requirements`/provas,
  com a frase "corre depois de o `audit`/`coverage`/`requirements` provarem que nada cobrado está por
  ensinar". Intenção: a ordem que toda aula segue ganha a última camada exatamente como o dono pediu.
- [ ] **`skills/aula-author/references/situacoes.md`** → nova(s) linha(s) sintoma→ação ("desafio
  não cobra nada do passado", "cobra passado que ainda não foi ensinado"). Intenção: o vermelho novo
  tem ação exata.
- [ ] **`skills/aula-author/references/quebra-da-aula.md` §3/§4** → uma frase: ao quebrar a aula,
  distribuir/preservar a revisão cumulativa nas aulas novas. Intenção: a quebra não dilui a regra.

### P3 — Coerência lateral (runtime, docs de estado, registro)

- [ ] **`skills/study-method/SKILL.md` (DES) + `skills/study-method/references/challenge-protocol.md`
  §1/§2/§3** → decidir e escrever: ou o desafio de tutoria também cobra o passado (DES nova + §1
  "propor" + novo passo de verificação), ou **declarar que a regra é exclusiva da autoria de trilhas**.
  Intenção: sem esta linha, haverá dois conceitos de "desafio" com regras diferentes em silêncio.
- [ ] **`docs/05-challenges-tdd.md` §2.1/§4** → só se o runtime for incluído: artefatos e protocolo
  ganham o cenário/requisito de revisão; caso contrário, nada. Intenção: o contrato do setup do aluno
  fica coerente com a decisão anterior.
- [ ] **`docs/18-estado-da-fabricacao-dos-cursos.md` §3.2/§4 (e §8.5)** → registar a regra como
  entrada de estado (e como dívida enquanto os gates não existirem/médirem). Intenção: a fabricação que
  vem a seguir sabe que a regra existe e o que falta medir.
- [ ] **`docs/02-pedagogia.md` §4.2/D-E09** → opcional: uma frase ligando a decisão D-E09 (≥1 revisão
  espaçada por sessão) à regra de conteúdo. Intenção: fundamentação pedagógica já auditada fica citada
  pela regra (CONTRIBUTING exige fonte para promessa pedagógica).
- [ ] **`docs/19-auditoria-da-aula.md` §3.1** → opcional, nota ⚑ quando a J10 existir (o quadro
  J1–J9 deixa de estar completo). Intenção: registro histórico não passa a mentir por omissão.
- [ ] **Fora do escopo deste reconhecimento, mas em coerência obrigatória** (são `app/`, não
  `docs|skills`): `app/content-src/BARRA-DE-AUTORIA.md`, `app/content-src/analise-verificadores.md`,
  `engine/quality/barra.ts` (`REGRAS_DA_BARRA`), `app/electron/main/services/challengeContextValidator.ts`
  e os testes de pin (`app/tests/engineBarra*.test.ts`) — todos os textos que cravam "A17–A23/A24" e o
  catálogo de regras têm de acompanhar. Intenção: o gate que a regra promete passa a existir e a faixa
  continua derivada do catálogo.

---

## 5. Convenções de escrita sugeridas (para as edições)

1. Usar sempre **"revisão cumulativa"** e nunca "revisão progressiva" (esta é o comando `revise`).
2. Onde se citar a faixa da barra, derivar do catálogo (`REGRAS_DA_BARRA`) — nunca cravar "A17–A24".
3. Divergência entre o que a edição promete e o que o gate mede: declarar no padrão ⚑, nunca
   resolver em silêncio (`docs/16` §P-CONTRA; `skills/*/SKILL.md` P-CONTRATO).
4. Toda promessa pedagógica nova leva fonte em `docs/research/` ou cita `docs/02`/`docs/04`
   (`docs/16` §13 Rastreabilidade; `CONTRIBUTING.md`).
