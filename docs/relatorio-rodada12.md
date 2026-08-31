# Relatório da Rodada 12 — decomposição MICRO + verificadores de ensino efetivo (resposta ao feedback do usuário)

Relatório da **décima segunda rodada** de desenvolvimento do study-method. Esta rodada respondeu
diretamente ao feedback do usuário ("1ª atividade presumia chamar função e parâmetro sem ensinar;
não importa a quantidade de aulas; quebra MICRO; veja o que é de fato ensinado; melhore os
verificadores; o desafio cresce progressivamente") com dois entregáveis que se reforçam: uma
**trilha micro nova** de 14 aulas (`programacao-do-zero`) em que nenhuma atividade presume o que
não foi ensinado, e uma **bateria de verificadores novos (A13–A16)** que torna esse tipo de defeito
pego por máquina, sem LLM e sem chave. A validação final fechou com **0 erros** na trilha nova,
**14/14 provas de execução** válidas e o pin da trilha existente **intacto** (717/112/249 + 92 avisos).

---

## Resposta direta ao feedback do usuário

A primeira atividade agora **não presume função nem parâmetro**: a L1 ensina a **leitura do
invólucro** (`export`/`import`/`test`/`assert` tratados como "máquina que confere"), a L3 ensina
**função+chamada** e a L5 ensina **parâmetro/argumento**. A quebra é **micro** — 14 aulas, 1 avanço
produtivo por aula, com liberdade para crescer até 300 aulas se a régua exigir (o teto por aula é o
que importa, não o total). Os **verificadores novos A13–A16** pegam exatamente o que a trilha antiga
deixava passar: usado-mas-não-ensinado (A13), micro-avanço (A14), progressividade (A15) e
primeira-atividade demonstrando o fixar (A16). O desafio **cresce progressivamente**: fixar →
esticar, com reuso inter-aula de pelo menos um átomo do avanço anterior.

---

## O que foi feito (run 20260831-001523-66870 · main `4803f5e` → `0f19900` → …)

| Frente | Pacotes/entregas | Onde vive |
|---|---|---|
| ANÁLISE (3 agentes) | a aula `let-e-atribuicao` usa **16 construções não ensinadas** (função, chamada, parâmetro estrutural, export, import, test/assert, arrow, return, instrução, módulo…) e **A=0 axiomas**; a trilha real `nodejs-do-zero` (118 aulas) tem `introduces=∅` — a aula 1 "passa" colando a solução na teoria e as 3 primeiras aulas presumem função/parâmetro/retorno; spec dos verificadores novos com impacto medido | `docs/` + content-src |
| DESIGN (2 tentativas) | trilha micro `programacao-do-zero` com **14 aulas** (1 avanço produtivo ≤2 receptivos por aula; 1–2 atividades fixar/esticar); ordem pedagógica que elimina cada pré-suposto do feedback | `app/content-src/programacao-do-zero/curriculo.md` + `curriculo.json` |
| ENGINE (2 pacotes) | bateria **A13–A16 ativa** no audit (ensino-efetivo, micro-avanço, progressividade, primeira-atividade); `extractAllOccurrences` (posições); placar com avisos; `atomKeys`: 3 nós `node:Variable*` → `STRUCTURAL_ALWAYS_ALLOWED` | `app/electron/main/engine/audit.ts`, `extract.ts`, `atomKeys.ts` |
| CONTEÚDO (6 autores + 1 materializador) | 14 drafts (28 JSONs: teoria + desafios) com validação por autor (schema, extractor ⊆ currículo, bateria, 4 provas); fixes A15a off-by-one (com repro) e A13c mesma-aula; materialização determinística → `trilha/` (30 arquivos) | `app/content-src/programacao-do-zero/` |
| VALIDAÇÃO FINAL (m3) | `loadTrack` 0 issues; `auditTrack` completo 0 ERROS (10 avisos A14a esperados); 14/14 provas `valid=true`; I12–I17 OK; gate-lint dos novos OK; pin da trilha real intacto; `relatorio-validacao.md` + reprodutores `verif/check0*.mts` | `app/content-src/programacao-do-zero/verif/` |

---

## O problema (por que a rodada existe)

O feedback apontou um defeito que a bateria A1–A12/I1–I17 **não enxergava**: a primeira atividade
da aula cobrava `function`, parâmetro e `return` sem que nenhuma aula os tivesse ensinado. A análise
medida mostrou o tamanho do problema na trilha real: a aula `let-e-atribuicao` usa **16 construções
com U=16 construções novas e A=0 axiomas**; na trilha `nodejs-do-zero` inteira (118 aulas), a lista
de introduções (`introduces`) é **vazia** e a aula 1 "passa" colando a solução na teoria. Ou seja:
os gates existentes provavam *forma* (schema, provas, orçamento por aula), mas nunca *que o que era
cobrado tinha sido ensinado*. Faltava o verificador de **ensino efetivo**.

---

## A trilha nova — 14 aulas, 1 avanço por aula (`aula × avanço × atividade`)

Fonte: `app/content-src/programacao-do-zero/relatorio-validacao.md` e `curriculo.md`. Cada aula
avança **≤1 átomo produtivo novo**; o restante do starter é congelado (e as chaves do invólucro
entram no **receptivo** da L1, nunca no produtivo). "Atividade" = o desafio de **fixar** (o que o
aluno digita); o **esticar** (2º desafio) reusa o fixar + ≤1 átomo novo já demonstrado na teoria.

| # | aula (slug) | avanço produtivo NOVO | atividade — fixar (o aluno escreve) | desafio (slug) | difficulty | provas (4) |
|---|---|---|---|---|---|---|
| 1 | como-o-site-confere-seu-codigo | `node:NumericLiteral` (+ rec: invólucro como leitura) | `7` | digite-o-numero-7 | 1 | OK (1==1==1) |
| 2 | valor-e-instrucao | — (reuso) | `42` | digite-outro-numero | 1 | OK (1==1==1) |
| 3 | funcao-e-chamada | `node:CallExpression` | `resposta()` | chamar-a-caixa | 2 | OK (1==1==1) |
| 4 | export-entrega | `node:ExportKeyword` | `export` | entregar-a-caixa | 2 | OK (1==1==1) |
| 5 | parametro-e-argumento | `node:Parameter` | `x` | eco-com-parametro | 2 | OK (1==1==1) |
| 6 | return | `node:ReturnStatement` | `return x;` | eco-escreve-o-return | 3 | OK (1==1==1) |
| 7 | let-e-atribuicao | `decl:let` (+ rec: `op:assign:=`, `node:BinaryExpression`) | `let contador = 0;` | contador-com-let | 3 | OK (1==1==1) |
| 8 | string-como-valor | `node:StringLiteral` | `let mensagem = "oi";` | saudacao-com-string | 3 | OK (1==1==1) |
| 9 | estado-ler-depois-de-escrever | — (reuso) | `let contador = 0;` | qual-e-o-ultimo-valor | 4 | OK (1==1==1) |
| 10 | const | `decl:const` | `let mudavel = 1; const fixa = 2;` | const-fixa-e-let-mutavel | 4 | OK (1==1==1) |
| 11 | erro-sintaxe-vs-erro-valor | — (reuso, leitura) | `6` | leia-a-mensagem-do-conferidor | 4 | OK (1==1==1) |
| 12 | involucro-completo | `node:FunctionDeclaration` | invólucro inteiro | montar-conferir | 5 | OK (1==1==1) |
| 13 | nomear-bem | — (reuso) | `const fruta = "abacaxi";` | const-fruta | 5 | OK (1==1==1) |
| 14 | todas-as-pecas-juntas | — (revisão capstone) | invólucro com const+string | frase-completa | 5 | OK (1==1==1) |

Progressão produtiva da trilha (9 átomos): `NumericLiteral → CallExpression → ExportKeyword →
Parameter → ReturnStatement → decl:let → StringLiteral → decl:const → FunctionDeclaration`.

**Como cada pré-suposto do feedback é eliminado:** função deixa de ser só leitura na L3, mas o
primeiro ato produtivo é a **chamada** (`resposta()`) — escrever a declaração obrigaria a escrever
`return` (que é a L6); a declaração inteira só é escrita na L12 (`node:FunctionDeclaration`
produtivo). Parâmetro/argumento: **nunca antes da L5** (o aluno digita o nome do parâmetro; o
argumento é lido no teste congelado e exercitado no esticar). `let`/atribuição = L7 — a aula da
rodada 11 reescrita como **retrieval legítimo** (`let contador = 0;` digitado; `contador = 5;`
congelado → entra no receptivo). O invólucro inteiro só é *escrito* na L12; antes disso, a L1 o
ensina **como leitura** (seção "como ler o desafio"), o que torna o congelado S13 lícito.

---

## A bateria nova de verificadores (regra × o que pega × impacto)

Bateria **A13–A16** ativa no `audit` como **erro** (um desafio reprova por ela), com avisos
separados (D4/A14a-zero) fora do placar de erros (`audit.ts`: `severidadeDe`).

| Regra | O que pega | Impacto medido |
|---|---|---|
| **A13 — ensino-efetivo** | atividade ⊆ demonstrado ∪ introduces ∪ axioma ∪ S13; **A13d: declarar ≠ demonstrar**; **A13c mesma-aula** (inclui `'desta'`) | o "pecado nº 1" (usado-mas-não-ensinado; nenhuma demonstração) continua pego; com A13c, **124 falsos positivos a menos** (841 → 717 na trilha real) |
| **A14 — micro-avanço** | 1 ≤ construções novas ≤ 4; ≤1 construção por linha; **A14a: 0 novas = aviso** (aula de prática/consolidação) | uma aula que introduz **16 construções de uma vez** (o caso U=16 da análise) não passa mais; as aulas legítimas de reuso do carry emitem só aviso (nunca erro) |
| **A15 — progressividade** | reuso intra-aula (**A15a** esticar) e inter-aula (**A15b**) de ≥1 átomo do avanço anterior | garante que o desafio **cresce progressivamente**; fix do off-by-one do A15a (repro `probe-a15a-off-by-one.mts`) |
| **A16 — primeira-atividade** | a 1ª seção da teoria **demonstra o fixar** da atividade | pega a aula que "passa" colando a solução na teoria sem nunca demonstrar o que cobra |

Apoio: `extractAllOccurrences` passa a reportar **posições** (aula/linha) e o placar ganha o campo
`avisos` — aviso não derruba o placar de erros, mas é reportado e pinado.

---

## O pin da trilha real — bumps declarados e protocolo

A bateria nova mudou a régua, então o pin **mudou de número de forma declarada** (nunca em silêncio).
O pin mecânico vive em `app/tests/engineAuditPlacar.test.ts` e documenta cada bump:

| Métrica | Pin rodada 11 | Após ligar A13–A16 | Após fix A13c (mesma-aula) | Bump |
|---|---|---|---|---|
| Violações | 285 | **841** | **717** | A13–A16 ligadas (~556 novas violações reais da trilha legada); depois −124 falsos positivos A13c |
| Desafios com violação | 96 | **112** | **112** | quase tudo já violava; saturação declarada |
| Lacunas de currículo | 102 | **249** | **249** | a trilha real não ensina a maior parte do que usa |
| Avisos | — | 96 | **92** | 4 avisos D4 a menos após o fix A13c; avisos entraram no pin nesta rodada |

**Protocolo do bump:** toda mudança de número acompanha o commit que a causou, comentário no próprio
teste de pin explicando o porquê (`FROM bump … 841 → 717 (… A13c agora inclui a teoria DA MESMA
aula)`), e o gate `bash tools/t.sh tests/engineAuditPlacar.test.ts` passa com os novos valores. O
pin atual é **717/112/249 + 92 avisos**.

---

## Validação (m3 — trilha nova e trilha real)

Fonte: `app/content-src/programacao-do-zero/relatorio-validacao.md` — 7/7 checagens PASSOU:

- **(a)** `loadTrack(trilha)` → **0 issues** (1 módulo · 14 aulas · 14 desafios);
- **(b)** `auditTrack(trilha)` → **0 ERROS** (A1–A16 = 0, I12–I17 = 0, DEC = 0, lacunas de currículo =
  0) · hygiene 0 · parseErrors 0 · exatamente os **10 avisos A14a** esperados (aulas de
  prática/consolidação do carry; as 4 aulas com incremento verdadeiramente novo são L1, L5, L7, L10);
- **(c)** **4 provas de execução** em cada um dos 14 desafios → `valid=true` e
  `declared == executed == expectedTestCount (1)` em **14/14** (P1 solução passa · P2 starter falha ·
  P3 contagem == expected · P4 stub vazio falha);
- **(d)** **I12–I17** OK (I13 nos 3 níveis internos com nota de STAGING no nível track);
- **(e)** gate-lint dos arquivos **novos** OK (newline final; fences com tag → hygiene 0);
- **(f)** trilha EXISTENTE intacta: `audit nodejs-do-zero --limite 0` → **717/112/249 com 92 avisos** —
  pin confere;
- **(g)** `engineAuditPlacar.test.ts` → **pass**.

**Suíte (gate final):** **2673 testes · 2672 pass · 1 skip · 0 fail**; lint (tsc nos dois tsconfigs)
e build **verdes**. **Zero chamada a LLM em toda a validação** — autores = subagentes
determinísticos; evidência extra: o feed integral da bateria sobre os drafts pós-fix dá 0 erros
A13–A16 com os mesmos 10 avisos A14a (drafts e trilha materializada produzem exatamente o mesmo
resultado).

---

## Decisões autônomas (registradas durante a execução)

1. **Trilha micro nova em vez de consertar a legada.** A trilha real tem 118 aulas com
   `introduces=∅` — um rewrite massivo. A rodada criou a trilha `programacao-do-zero` de 14 aulas
   como régua do que *é* ensinado, deixando a legada intocada (pin reprovado).
2. **L1 não presume nada: invólucro como LEITURA.** As chaves do invólucro
   (`node:FunctionDeclaration`, `node:ReturnStatement`) entram em `avancos.receptivo` da L1, nunca
   no produtivo — a condição que torna o boilerplate S13 lícito.
3. **Ordem pedagógica dos átomos.** Função vira produtivo pela **chamada** na L3 (a declaração só
   na L12, porque declarar obrigaria `return` = L6); parâmetro **nunca antes da L5**; `let` da
   rodada 11 reescrito como retrieval legítimo na L7.
4. **Bateria A13–A16 como regras de verdade** (erro), com **avisos fora do placar de erros** e o
   fix A13c incluindo a teoria da **mesma aula** (`'desta'`) — sem isso, 124 falsos positivos
   poluiriam o pin.
5. **`atomKeys`: 3 nós `node:Variable*` → `STRUCTURAL_ALWAYS_ALLOWED`** (recomendação do currículo
   para o ruído estrutural de `let x = 0;`) — aplicado com pin intacto.
6. **10 avisos A14a aceitos como esperados** — aulas de reuso/consolidação do carry são parte do
   desenho micro (cada aula avança ≤1 átomo novo; o restante reusa o acumulado); aviso por
   construção da spec, nunca erro.
7. **Zero LLM na validação** — o materializador e os verificadores são scripts determinísticos
   (`verif/materializar.mjs`, `check01–05`), sem chave e sem rede.

---

## Incidentes de processo (lições)

1. **Nomes de verificador colidiram entre autores.** No 2º run, os merges do pacote `c1` colidiram
   em `verif/checkNN` (nomes iguais entre autores); a resolução por `git rm` nas worktrees **virou
   remoção no merge** (main perdeu `check01/03/04`) e gerou um conflito modify/delete posterior,
   recuperado mantendo a versão do branch (resolução com merge autorizado dentro da worktree).
   **Lição: nomes de `verif/` devem ser únicos por pacote (prefixo por worktree) e resolução de
   add/add deve RENOMEAR, nunca deletar.**
2. **Watcher de barreira comparava com a base errada.** Worktrees criadas em bases diferentes →
   comparar HEAD com **a BASE da própria worktree**, nunca com `main` vivo.
3. **A semântica do "parâmetro estrutura".** "Chamar função" fica demonstrado NA teoria da MESMA
   aula (A13c inclui `'desta'`); o "pecado nº 1" (nenhuma demonstração) continua pego — a lição de
   desenho da própria regra: demonstração na mesma aula é suficiente, ausência total não.

---

## Dívidas e comandos reprodutores

**Dívidas declaradas:**
- `difficulty` é provisório (rampa linear 1–5 pela posição global; nenhum gate lê o campo —
  proibido; derivação por tempo resolvido é débito de produto).
- A trilha nova vive em `content-src/` → o nível track do I13 tem desvio de **STAGING** até a
  integração em `resources/tracks/programacao-do-zero/` (I13 satisfeito nos 4 níveis no destino).
- L-04 **pré-existentes** fora do escopo: `curriculo.json`, `curriculo.md` e 3 drafts sem newline
  final no HEAD `0f19900`.
- Trilha legada (pré-existente, escopo do `repair`): 68 blocos de teoria sem tag, 4 parse errors,
  ～12 aulas sem incremento — a bateria nova **mede** (249 lacunas) mas não conserta.
- Esticar da trilha além da L14 e piloto F6 (aluno humano) pendentes.

**Comandos reprodutores (cwd `app/`):**

```bash
npm run engine -- audit nodejs-do-zero --limite 0                                   # trilha real: 717/112/249 + 92 avisos
bash tools/t.sh tests/engineAuditPlacar.test.ts                                     # pin mecânico
node --import tsx content-src/programacao-do-zero/verif/check01-load-audit.mts      # (a) loadTrack + (b) auditTrack
node --import tsx content-src/programacao-do-zero/verif/check02-provas.mts          # (c) 4 provas × 14 desafios
node --import tsx content-src/programacao-do-zero/verif/check03-invariantes.mts     # (d) I12–I17
PZ_DRAFTS_DIR="$PWD/content-src/programacao-do-zero/drafts" \
  node --import tsx content-src/programacao-do-zero/verif/check05-feed-integral.mts # evidência extra: feed pós-fix
node content-src/programacao-do-zero/verif/materializar.mjs                         # materialização determinística
bash tools/t.sh tests                                                               # suíte: 2673 (2672 pass · 1 skip)
npm run lint                                                                        # tsc nos dois tsconfigs
```

---

## Arquivos tocados (principais)

- **Engine:** `app/electron/main/engine/audit.ts` (bateria A13–A16 + `avisos` + `severidadeDe`),
  `extract.ts` (`extractAllOccurrences` com posições), `atomKeys.ts` (3 `node:Variable*` →
  `STRUCTURAL_ALWAYS_ALLOWED`).
- **Pin:** `app/tests/engineAuditPlacar.test.ts` (bumps documentados e protocolo; pin
  717/112/249/92).
- **Trilha nova:** `app/content-src/programacao-do-zero/` — `curriculo.md`/`curriculo.json`, 14
  pares `drafts/<aula>/{lesson-draft,challenge-draft}.json`, materialização `trilha/` (30 arquivos),
  `verif/` (materializar + check01–05 + probes), `relatorio-validacao.md` (este ciclo).
- **Docs:** este relatório.

---

## Evolução pós-execução

- **Integrar** a trilha nova em `resources/tracks/programacao-do-zero/` (I13 nos 4 níveis; a
  materialização já é o formato do produto).
- **Crescer a trilha micro além da L14** — candidatos naturais: laços, arrays, objetos e módulos
  próprios — mantendo a régua de 1 avanço produtivo por aula e o invólucro como leitura.
- **Usar a bateria A13–A16 como régua do repair da trilha legada** (118 aulas, 249 lacunas): a
  medição honesta já existe; o conserto é trabalho de conteúdo, agora com gate que prova ensino.
- **Piloto F6 com aluno humano** e `difficulty` por tempo medido (débito de produto).

> **Pergunta para a próxima rodada:** a trilha micro deve continuar crescendo sozinha (L15+) ou
> servir de régua para o `repair` da trilha legada — e quem deve ser o dono da régua (engine ou
> conteúdo)? A resposta muda o próximo mandato.