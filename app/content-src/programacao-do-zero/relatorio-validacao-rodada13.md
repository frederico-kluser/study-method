# Relatório de validação — rodada 13 · materialização final com assertions + caminho de produto

> **Escopo.** Fecha a trilha micro `programacao-do-zero` como PRODUTO: (1) as
> `assertions` (onda 1 schema-quiz — 3/aula, quiz de múltipla escolha) entram
> VERBATIM no lesson.json materializado (materializador + F12); (2) a trilha
> materializada chega ao CAMINHO DE PRODUTO `resources/tracks/programacao-do-zero/`
> (o que a GUI lê — loader `app.getAppPath()/resources/tracks`), byte a byte
> idêntica à árvore de autoria; (3) tudo validado deterministicamente (zero LLM).
> Worktree `onda3-materializar` (branch
> `do/study-method/20260831-093618-40428/onda3-materializar`).
> Fonte: `app/content-src/programacao-do-zero/` (curriculo + 14 pares drafts/).
> Materialização: `verif/materializar.mjs` (`--produto` grava nos DOIS destinos) +
> propagação F7→produto em `app/electron/main/engine/phases/f12Materialize.ts`
> (`montarAulaDeProduto`). Data: 2026-08-31 · node v24.19.0 · cwd `app/`.

---

## Síntese

**A trilha `programacao-do-zero` está materializada como PRODUTO com 0 erros e
as 42 assertions (14 aulas × 3) presentes nos dois destinos.**

- (a) `loadTrack(trilha)` → **0 issues** (1 módulo · 14 aulas · 14 desafios);
- (b) `auditTrack(trilha)` → **0 ERROS** (A1–A16, I12–I17, DEC, lacunas) ·
  **hygiene 0** · **parseErrors 0** · exatamente os **10 avisos A14a** esperados
  (contagem IDÊNTICA à rodada 12 — **sem RE-BASELINE**, o handoff da Onda 2
  confirmou e o novo cenário de avisos permaneceu o mesmo);
- (c) 4 provas de execução em **cada um dos 14 desafios** → `valid=true` e
  `declared == executed == expectedTestCount (1)` em 14/14;
- (d) I12–I17 por script → OK (mesma leitura da rodada 12);
- (e) **assertions no PRODUTO**: `check06-produto.mts` → `loadTrack` no caminho
  de produto com 0 issues; produto **byte a byte idêntico** à árvore de autoria
  (30/30 arquivos); **42/42 assertions** expostas pelo loader via
  `meta.assertions` (cast, não pick — docs §10);
- (f) trilha EXISTENTE intacta: `audit nodejs-do-zero --limite 0` →
  **717/112/249 com 92 avisos** (pin confere; exit 1 do CLI é o desenho —
  `cli.ts:291` sai 1 quando há violações);
- (g) `bash tools/t.sh tests/engineAuditPlacar.test.ts` → **pass** (1 teste);
- (h) regressão nova `engineMaterialize.assertions.test.ts` → **2/2 pass**:
  draft COM assertions → lesson.json verbatim + loadTrack OK; draft SEM o campo
  → `LessonDraftSchema` materializa `[]` (z.preprocess, INV-05) e o produto
  carrega `"assertions": []` com loadTrack OK;
- (i) `npm run lint` (tsc, os dois tsconfigs) → **verde**; `npm test` (suíte
  completa) → **verde** (ver seção Números).

Evidência extra (idêntica à rodada 12): o feed integral da bateria sobre os
drafts (`PZ_DRAFTS_DIR`) dá **0 erros A13–A16** com os mesmos 10 avisos A14a.

---

## Tabela aula × assertions × verifiers × status

| # | aula (slug) | assertions | desafio (slug) | provas (4) | check01 audit | check06 produto | status |
|---|-------------|-----------:|----------------|------------|---------------|-----------------|--------|
| 1 | como-o-site-confere-seu-codigo | 3 | digite-o-numero-7 | OK (valid=true, 1==1==1) | sem aviso (4 novos) | assertions=3 | materializada |
| 2 | valor-e-instrucao | 3 | digite-outro-numero | OK (valid=true, 1==1==1) | A14a (aula prática) | assertions=3 | materializada |
| 3 | funcao-e-chamada | 3 | chamar-a-caixa | OK (valid=true, 1==1==1) | A14a | assertions=3 | materializada |
| 4 | export-entrega | 3 | entregar-a-caixa | OK (valid=true, 1==1==1) | A14a | assertions=3 | materializada |
| 5 | parametro-e-argumento | 3 | eco-com-parametro | OK (valid=true, 1==1==1) | A14a | assertions=3 | materializada |
| 6 | return | 3 | eco-escreve-o-return | OK (valid=true, 1==1==1) | A14a | assertions=3 | materializada |
| 7 | let-e-atribuicao | 3 | contador-com-let | OK (valid=true, 1==1==1) | sem aviso (3 novos) | assertions=3 | materializada |
| 8 | string-como-valor | 3 | saudacao-com-string | OK (valid=true, 1==1==1) | A14a | assertions=3 | materializada |
| 9 | estado-ler-depois-de-escrever | 3 | qual-e-o-ultimo-valor | OK (valid=true, 1==1==1) | A14a | assertions=3 | materializada |
| 10 | const | 3 | const-fixa-e-let-mutavel | OK (valid=true, 1==1==1) | sem aviso (1 novo) | assertions=3 | materializada |
| 11 | erro-sintaxe-vs-erro-valor | 3 | leia-a-mensagem-do-conferidor | OK (valid=true, 1==1==1) | A14a | assertions=3 | materializada |
| 12 | involucro-completo | 3 | montar-conferir | OK (valid=true, 1==1==1) | A14a | assertions=3 | materializada |
| 13 | nomear-bem | 3 | const-fruta | OK (valid=true, 1==1==1) | A14a | assertions=3 | materializada |
| 14 | todas-as-pecas-juntas | 3 | frase-completa | OK (valid=true, 1==1==1) | A14a | assertions=3 | materializada |

**Totais: 42 assertions (14×3) · 14/14 provas OK · 0 erros no audit · 10 avisos
A14a (idêntico à rodada 12) · produto ≡ trilha byte a byte.**

---

## Números (a)–(i)

| # | Checagem | Comando (cwd `app/`) | Veredito | Número |
|---|----------|----------------------|----------|--------|
| a | `loadTrack(trilha)` | `node --import tsx content-src/programacao-do-zero/verif/check01-load-audit.mts` | **PASSOU** | 0 issues; slug=`programacao-do-zero`, 1 módulo, 14 aulas, 14 desafios |
| b | `auditTrack(trilha)` (bateria completa, `declared`) | idem (seção b) | **PASSOU** | **0 erros** (A1–A16=0, I12–I17=0, DEC=0, lacunas=0) · hygiene=0 · parseErrors=0 · **10 avisos A14a** (único tipo) · desafiosComViolacao=0 |
| c | 4 provas de execução por desafio | `node --import tsx content-src/programacao-do-zero/verif/check02-provas.mts` | **PASSOU** | 14/14 com `valid=true`, `declared=1`, `executed=1`, `expectedTestCount=1`, failures=[] |
| d | I12–I17 (+I13) por script | `node --import tsx content-src/programacao-do-zero/verif/check03-invariantes.mts` | **PASSOU** | I12 única · I13 4 níveis (staging no nível track, satisfeito no destino de produto) · I14 única · I15 únicos · I16 ∈ · I17 vazio |
| d2 | atoms ⊆ curriculo | `node --import tsx content-src/programacao-do-zero/verif/check02-atoms.mts` | **PASSOU** | 0 fora do universo |
| d3 | progressão A13–A16 (2 feeds) | `node --import tsx content-src/programacao-do-zero/verif/check03-progressao.mts` | **PASSOU** | Feed A e Feed B: 0 ERROS, aviso A14a apenas na L2 (prática, esperado) |
| d4 | aulas L5–L6 | `node --import tsx content-src/programacao-do-zero/verif/check-l5l6.mts` | **PASSOU** | schemas 0 erros · atoms 0 fora · progressão 0 erros · provas OK · alternates passam · wrongSolutions falham · 0 `console.` |
| d5 | aulas L7–L8 | `node --import tsx content-src/programacao-do-zero/verif/check-l7l8.mts` | **PASSOU** | todas as baterias (V1–V4) |
| d6 | aulas L9–L11 | `node --import tsx content-src/programacao-do-zero/verif/check-l9l11.mts` | **PASSOU** | todas as baterias (V1–V4) |
| d7 | evidências (teoria parseia, wrongSolutions/alternates) | `node --import tsx content-src/programacao-do-zero/verif/check05-evidencias.mts` | **PASSOU** | 0 falhas de evidência |
| d8 | feed integral da bateria sobre os drafts | `PZ_DRAFTS_DIR="$PWD/content-src/programacao-do-zero/drafts" node --import tsx content-src/programacao-do-zero/verif/check05-feed-integral.mts` | **PASSOU** | **0 erros A13–A16** nas 14 aulas · só os 10 avisos A14a |
| d9 | sanidade wrongSolutions | `node --import tsx content-src/programacao-do-zero/verif/j5-wrongsolutions.mts` | **PASSOU** | todas as wrongSolutions falham (valid=false) |
| e | **CAMINHO DE PRODUTO** | `node --import tsx content-src/programacao-do-zero/verif/check06-produto.mts` | **PASSOU** | `loadTrack(resources/tracks/programacao-do-zero)` → 0 issues · produto ≡ trilha byte a byte (30/30) · **42/42 assertions** via `meta.assertions` · nodejs-do-zero presente e intocado |
| f | trilha EXISTENTE intacta | `npm run engine -- audit nodejs-do-zero --limite 0` | **PASSOU** | **717 violações · 112 desafios com violação · 249 lacunas · 92 avisos** — exatamente o pin (exit 1 do CLI é o desenho: `cli.ts:291` sai 1 quando há violações; o PIN é a contagem) |
| g | PIN da engine | `bash tools/t.sh tests/engineAuditPlacar.test.ts` | **PASSOU** | 1 teste · 1 pass · 0 fail |
| h | regressão das ASSERTIONS (F12) | `bash tools/t.sh tests/engineMaterialize.assertions.test.ts` | **PASSOU** | 2/2: verbatim com 3 itens + loadTrack OK; ausência → `[]` (z.preprocess) + loadTrack OK |
| i | lint + suíte | `npm run lint` · `npm test` | **PASSOU** | tsc (2 tsconfigs) 0 erros; suíte completa verde (inclui o teste novo e o placar pinado) |

**Totais:** 15/15 checagens com veredito PASSOU; 0 erros na trilha nova; 0
mudanças na trilha legada; 42/42 assertions no produto; **sem RE-BASELINE**.

---

## Os 10 avisos A14a (esperados — contagem idêntica à rodada 12, SEM RE-BASELINE)

Todos com `regra=A14a`, `campo=lesson`, `construcao=null` — aula de prática sem
incremento (calibração da spec §4.1; nunca erro):

1. `fundamentos-js/valor-e-instrucao` · 2. `fundamentos-js/funcao-e-chamada` ·
3. `fundamentos-js/export-entrega` · 4. `fundamentos-js/return` ·
5. `fundamentos-js/string-como-valor` · 6. `fundamentos-js/estado-ler-depois-de-escrever` ·
7. `fundamentos-js/erro-sintaxe-vs-erro-valor` · 8. `fundamentos-js/involucro-completo` ·
9. `fundamentos-js/nomear-bem` · 10. `fundamentos-js/todas-as-pecas-juntas`

As 4 aulas SEM aviso (com incremento verdadeiramente novo) seguem as da rodada
12: `como-o-site-confere-seu-codigo` (4), `parametro-e-argumento` (1),
`let-e-atribuicao` (3) e `const` (1) — confirmado pelo feed integral (check05:
`Novos (A14a) por aula`). O handoff da Onda 2 já previa este cenário IDÊNTICO;
a contagem não mudou com a L1 nova (a seção "as palavras da caixa" não altera o
orçamento declarado) — **nenhum ajuste de verifier foi necessário**.

---

## Mudanças aplicadas nesta worktree

1. **`verif/materializar.mjs`** — (a) `assertions` VERBATIM no lesson.json
   materializado, no bloco dos campos §10 (com `?? []` para o mesmo
   preprocess undefined→[] do `LessonDraftSchema` — INV-05); (b) flag
   **`--produto`**: grava a MESMA árvore (o mesmo conteúdo serializado, byte a
   byte) também em `resources/tracks/programacao-do-zero/`. O log final imprime
   a contagem de assertions por aula.
2. **`app/electron/main/engine/phases/f12Materialize.ts`** — `montarAulaDeProduto`
   agora copia `assertions: aula.draft.assertions` no bloco §10 (propagação
   F7→produto na GERAÇÃO da engine). A fiação da F12 entrega o draft JÁ
   PARSEADO (`geraTrilha.lerDraftsDaAula` → `aulaOk.data`), então a ausência do
   campo no draft chega como `[]` explícito (z.preprocess) — draft sem quiz →
   lesson.json com `"assertions": []` (aula sem quiz é válida no produto, docs
   §10). Nenhum outro campo, nenhuma lógica, nenhum schemaVersion tocado.
3. **`app/tests/engineMaterialize.assertions.test.ts`** (NOVO) — regressão da
   propagação: (1) draft COM 3 assertions → lesson.json contém o campo VERBATIM
   (deep-equal) e `loadTrack` OK expondo via `meta.assertions`; (2) draft SEM o
   campo → `LessonDraftSchema.parse` materializa `[]` (comportamento do
   z.preprocess), o lesson.json de produto carrega `"assertions": []` com a
   chave PRESENTE, e `loadTrack` OK. Fixture mínima 1 módulo × 1 aula × 1
   desafio em diretório temporário; zero processos, zero rede.
4. **`verif/check06-produto.mts`** (NOVO) — valida o CAMINHO DE PRODUTO:
   `loadTrack(resources/tracks/programacao-do-zero)` → 0 issues (slug e 14
   aulas); produto **byte a byte idêntico** à árvore de autoria (30 arquivos);
   **42/42 assertions** via `meta.assertions`; `nodejs-do-zero` presente e
   intocado.
5. **`resources/tracks/programacao-do-zero/`** (NOVO, 30 arquivos) — a árvore de
   produto: `track.json`, `modules/fundamentos-js/module.json`,
   `lessons/*/lesson.json` (com `assertions`) e `challenges/*/challenge.json` —
   idêntica byte a byte a `content-src/programacao-do-zero/trilha/`.
6. **Este relatório** (`relatorio-validacao-rodada13.md`).

Nada mais foi tocado: drafts intactos (byte a byte), `resources/tracks/
nodejs-do-zero` intacto, verifiers pré-existentes sem nenhuma alteração de
lógica, GUI intacta.

---

## Premissas e limites

1. **Contagem de avisos A14a = 10, SEM RE-BASELINE.** O handoff da Onda 2
   previu cenário idêntico ao da rodada 12 e ele se confirmou: a L1 nova ("as
   palavras da caixa") não muda o orçamento declarado nem o carry — nenhum
   verifier precisou de ajuste.
2. **I13 nível track = desvio de STAGING na trilha de autoria** (basename
   `trilha` ≠ slug), como nas rodadas anteriores; no destino de PRODUTO
   `resources/tracks/programacao-do-zero/` o I13 é satisfeito nos 4 níveis
   (basename == slug).
3. **`assertions` chegam ao produto VERBATIM** (mesmo shape do draft —
   `AssertionDraftSchema` espelha `TrackAssertion` do produto). As invariantes
   cruzadas (opções únicas, `answerIndex` na faixa) são validadas no LOAD por
   `validateAssertions` — o check06 provou 0 issues com as 42 assertions.
4. **`difficulty` e `prerequisites` seguem as derivações provisórias das
   rodadas anteriores** (rampa linear 1..5; índice reverso introduces×aula) —
   nenhum gate lê esses campos (proibido, docs §11).
5. **Exit code 1 do `audit nodejs-do-zero` é o desenho do CLI** (`cli.ts:291`:
   sai 1 quando `violacoes > 0`); o PIN é a CONTAGEM (717/112/249/92), que bate
   exatamente — o teste `engineAuditPlacar.test.ts` (que também passou) é o
   gate canônico do placar.
6. **Nada além do escopo foi tocado:** engine (exceto o campo §10), verifiers,
   drafts, trilha legada e GUI intactos.

---

## Comandos reprodutores (cwd `app/`)

```bash
# materialização (determinística, zero dependências) — sem --produto só a trilha de autoria
node content-src/programacao-do-zero/verif/materializar.mjs --produto

# (a)+(b) loadTrack + auditTrack — bateria completa
node --import tsx content-src/programacao-do-zero/verif/check01-load-audit.mts

# (c) 4 provas de execução nos 14 desafios
node --import tsx content-src/programacao-do-zero/verif/check02-provas.mts

# (d) I12–I17 + I13 · (d2) atoms · (d3) progressão · (d4–d6) L5–L11 · (d7) evidências
node --import tsx content-src/programacao-do-zero/verif/check03-invariantes.mts
node --import tsx content-src/programacao-do-zero/verif/check02-atoms.mts
node --import tsx content-src/programacao-do-zero/verif/check03-progressao.mts
node --import tsx content-src/programacao-do-zero/verif/check-l5l6.mts
node --import tsx content-src/programacao-do-zero/verif/check-l7l8.mts
node --import tsx content-src/programacao-do-zero/verif/check-l9l11.mts
node --import tsx content-src/programacao-do-zero/verif/check05-evidencias.mts

# (d8) feed integral 14 aulas sobre os drafts pós-fix
PZ_DRAFTS_DIR="$PWD/content-src/programacao-do-zero/drafts" \
  node --import tsx content-src/programacao-do-zero/verif/check05-feed-integral.mts

# (d9) sanidade wrongSolutions
node --import tsx content-src/programacao-do-zero/verif/j5-wrongsolutions.mts

# (e) CAMINHO DE PRODUTO — loadTrack + identidade byte a byte + assertions
node --import tsx content-src/programacao-do-zero/verif/check06-produto.mts

# (h) regressão das assertions na F12
bash tools/t.sh tests/engineMaterialize.assertions.test.ts

# (f) trilha existente intacta — placar pinado
npm run engine -- audit nodejs-do-zero --limite 0

# (g) PIN da engine
bash tools/t.sh tests/engineAuditPlacar.test.ts

# (i) lint + suíte completa
npm run lint
npm test
```
