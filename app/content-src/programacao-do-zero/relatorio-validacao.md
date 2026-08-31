# Relatório de validação — materialização da trilha `programacao-do-zero`

> **Escopo.** Materialização + validação COMPLETA da trilha micro `programacao-do-zero`
> (14 aulas em 1 módulo) no formato do produto, 100% determinística (nenhuma chamada a LLM).
> Worktree `m3-materializa` (branch `do/study-method/20260831-001523-66870/m3-materializa`,
> base `main` @ `0f19900` — bateria A13–A16 ativa com o fix A13c mesma-aula + A15a k=1).
> Fonte do conteúdo: `app/content-src/programacao-do-zero/` (curriculo + 14 pares drafts/
> lesson-draft.json + challenge-draft.json). Materialização: `verif/materializar.mjs` → `trilha/`
> (precedente da rodada 11, a04 → `content-src/let-e-atribuicao/trilha/` + tabela de derivação
> da F12, `app/electron/main/engine/phases/f12Materialize.ts`).
> Data: 2026-08-31 · node v24.19.0 · cwd `app/` (node_modules real via symlink).

---

## Síntese

**A trilha micro `programacao-do-zero` NÃO quebra nenhuma regra da bateria (0 erros).**

- (a) `loadTrack(trilha)` → **0 issues** (1 módulo · 14 aulas · 14 desafios);
- (b) `auditTrack(trilha)` → **0 ERROS** (A1–A16, I12–I17, DEC, lacunas de currículo) ·
  **hygiene 0** · **parseErrors 0** · exatamente os **10 avisos A14a** de aula-de-prática
  esperados (listados abaixo), nenhum outro aviso;
- (c) 4 provas de execução (`criarProverDeDesafio`, f9Verifier) em **cada um dos 14 desafios**
  → `valid=true` e `declared == executed == expectedTestCount (1)` em 14/14;
- (d) I12–I17 por script → OK (I12 única · I13 nos 4 níveis com nota de staging · I14 única ·
  I15 únicos · I16 `concept ∈ concepts` · I17 vazio);
- (e) gate-lint dos arquivos novos → newline final em todos os arquivos da materialização e
  dos verif/ novos; fences de teoria com tag (hygiene 0); L-05 das tabelas deste relatório OK;
- (f) trilha EXISTENTE intacta: `audit nodejs-do-zero --limite 0` → **717/112/249 com 92 avisos**
  (pin confere);
- (g) `bash tools/t.sh tests/engineAuditPlacar.test.ts` → **pass** (1 teste, 1 pass, 0 fail).

Evidência extra: o feed integral da própria bateria rodado sobre os drafts pós-fix
(`PZ_DRAFTS_DIR` apontando para os drafts desta worktree) dá **0 erros A13–A16** com os mesmos
10 avisos A14a — os drafts e a trilha materializada produzem exatamente o mesmo resultado.

---

## Tabela aula × avanço × desafio × provas × status

| # | aula (slug) | avanço (fixar — o aluno escreve) | desafio (slug) | difficulty | provas (4) | status |
|---|-------------|----------------------------------|----------------|------------|------------|--------|
| 1 | como-o-site-confere-seu-codigo | `7` | digite-o-numero-7 | 1 | OK (valid=true, 1==1==1) | materializada |
| 2 | valor-e-instrucao | `42` | digite-outro-numero | 1 | OK (valid=true, 1==1==1) | materializada |
| 3 | funcao-e-chamada | `resposta()` | chamar-a-caixa | 2 | OK (valid=true, 1==1==1) | materializada |
| 4 | export-entrega | `export` | entregar-a-caixa | 2 | OK (valid=true, 1==1==1) | materializada |
| 5 | parametro-e-argumento | `x` | eco-com-parametro | 2 | OK (valid=true, 1==1==1) | materializada |
| 6 | return | `return x;` | eco-escreve-o-return | 3 | OK (valid=true, 1==1==1) | materializada |
| 7 | let-e-atribuicao | `let contador = 0;` | contador-com-let | 3 | OK (valid=true, 1==1==1) | materializada |
| 8 | string-como-valor | `let mensagem = "oi";` | saudacao-com-string | 3 | OK (valid=true, 1==1==1) | materializada |
| 9 | estado-ler-depois-de-escrever | `let contador = 0;` | qual-e-o-ultimo-valor | 4 | OK (valid=true, 1==1==1) | materializada |
| 10 | const | `let mudavel = 1; const fixa = 2;` | const-fixa-e-let-mutavel | 4 | OK (valid=true, 1==1==1) | materializada |
| 11 | erro-sintaxe-vs-erro-valor | `6` | leia-a-mensagem-do-conferidor | 4 | OK (valid=true, 1==1==1) | materializada |
| 12 | involucro-completo | `export function conferir() {…}` | montar-conferir | 5 | OK (valid=true, 1==1==1) | materializada |
| 13 | nomear-bem | `const fruta = "abacaxi";` | const-fruta | 5 | OK (valid=true, 1==1==1) | materializada |
| 14 | todas-as-pecas-juntas | `export function frase() {…}` | frase-completa | 5 | OK (valid=true, 1==1==1) | materializada |

---

## Números (a)–(g)

| # | Checagem | Comando (cwd `app/`) | Veredito | Número |
|---|----------|----------------------|----------|--------|
| a | `loadTrack(trilha)` | `node --import tsx content-src/programacao-do-zero/verif/check01-load-audit.mts` | **PASSOU** | 0 issues; slug=`programacao-do-zero`, 1 módulo, 14 aulas, 14 desafios |
| b | `auditTrack(trilha)` (bateria completa, modo automático `declared`) | idem (seção b) | **PASSOU** | **0 erros** (A1–A16=0, I12–I17=0, DEC=0, lacunasDeCurriculo=0) · hygiene=0 · parseErrors=0 · **10 avisos A14a** (único tipo de aviso) · aulas=14, desafios=14, desafiosComViolacao=0 |
| c | 4 provas de execução (§5.4) em cada desafio | `node --import tsx content-src/programacao-do-zero/verif/check02-provas.mts` | **PASSOU** | 14/14 desafios com `valid=true`, `declared=1`, `executed=1`, `expectedTestCount=1`, failures=[] (P1 solução passa · P2 starter falha · P3 contagem == expected · P4 stub vazio falha) |
| d | I12–I17 (+I13) por script | `node --import tsx content-src/programacao-do-zero/verif/check03-invariantes.mts` | **PASSOU** | I12 única · I13 OK nos 3 níveis internos (módulo/aula/desafio `slug==basename`) + nota de STAGING no nível track · I14 order=1 única · I15 todos `theory[].id` únicos · I16 todo `challenge.concept ∈ lesson.concepts` · I17 zero `files[]` (vacuamente atendida) |
| e | gate-lint dos arquivos NOVOS | `bash tests/gate-lint.sh` (raiz da worktree) | **PASSOU (escopo dos arquivos novos)** | L-04: 30 arquivos de `trilha/` + 4 verif/ novos + 1 relatório com newline final; fences de teoria com tag → hygiene=0 (check b); tabelas deste relatório L-05 OK; sem L-02/L-03/L-06 novos. Os 5 L-04 de `programacao-do-zero` (curriculo.json, curriculo.md, drafts/const/*, drafts/erro-sintaxe-vs-erro-valor/challenge-draft.json) são **pré-existentes no HEAD** (`0f19900`) e fora do escopo desta tarefa |
| f | trilha EXISTENTE intacta | `npm run engine -- audit nodejs-do-zero --limite 0` | **PASSOU** | **717 violações · 112 desafios com violação · 249 lacunas de currículo · 92 avisos** — exatamente o pin declarado (aula sem incremento = 12; hygiene 68 blocos sem tag; 4 parseErrors na teoria — todos pré-existentes da trilha legada, intocada) |
| g | PIN da engine | `bash tools/t.sh tests/engineAuditPlacar.test.ts` | **PASSOU** | 1 teste · 1 pass · 0 fail (exit 0) — o placar real de `nodejs-do-zero` bate com o pin |

**Totais:** 7/7 checagens com veredito PASSOU; 0 erros na trilha nova; 0 mudanças na trilha
legada; 0 defeitos de bateria encontrados; 0 defeitos de draft encontrados; 0 defeitos de
materialização encontrados.

---

## Os 10 avisos A14a (esperados — aula de prática sem incremento; nunca erro, calibração da spec §4.1)

Todos com `regra=A14a`, `campo=lesson`, `construcao=null`, mensagem do tipo
"`<ref>` não introduz NENHUMA construção nova — aula sem incremento; se é aula de revisão,
marque `role` adequado, senão falta conteúdo novo (A12)":

1. `fundamentos-js/valor-e-instrucao`
2. `fundamentos-js/funcao-e-chamada`
3. `fundamentos-js/export-entrega`
4. `fundamentos-js/return`
5. `fundamentos-js/string-como-valor`
6. `fundamentos-js/estado-ler-depois-de-escrever`
7. `fundamentos-js/erro-sintaxe-vs-erro-valor`
8. `fundamentos-js/involucro-completo`
9. `fundamentos-js/nomear-bem`
10. `fundamentos-js/todas-as-pecas-juntas`

As 4 aulas SEM aviso (com incremento verdadeiramente novo) são `como-o-site-confere-seu-codigo`
(4 novos), `parametro-e-argumento` (1), `let-e-atribuicao` (3) e `const` (1), confirmado também
pelo feed integral (check05: `Novos (A14a) por aula`). O aviso A14a é aviso por construção da
spec (`0 → aviso`, docs §5.2) — as aulas de reuso/consolidação do carry são parte do desenho micro
da trilha (cada aula avança ≤1 átomo produtivo novo; o restante reusa o acumulado).

---

## Mudanças aplicadas nesta worktree

1. **FIX de conteúdo (único).** Em
   `drafts/como-o-site-confere-seu-codigo/lesson-draft.json`, campo `raciocinio_de_projeto`,
   removido o item **(5) NOTA DE ENGENHARIA** ("EXATAMENTE 1 erro A13 no feed INTEGRAL ...")
   — 748 caracteres; a nota estava obsoleta: com a bateria corrigida (A13c mesma-aula, `0f19900`)
   o feed integral dá 0 erros. O campo agora termina no item (4) (`...globais/api).`). Nada mais
   nos drafts foi tocado.
2. **Materialização da trilha** (`verif/materializar.mjs` → `trilha/`, 30 arquivos):
   - `trilha/track.json` — schemaVersion 1, slug `programacao-do-zero`, language pt-BR,
     domain programming, 1 módulo;
   - `trilha/modules/fundamentos-js/module.json` — order 1, as 14 aulas NA ORDEM DO CURRICULO;
   - `trilha/modules/fundamentos-js/lessons/<slug>/lesson.json` — 14 aulas, com os campos
     aditivos copiados verbatim dos drafts (`objective`, `introduces`, `introducesTerms`,
     `foraDeEscopo`, `eiClass`, `role`, `targetAtom`, `notionalMachineDelta`, `budgetHash`
     = `programacao-do-zero-v1`, `budgetVersion`, `status`, `research`);
   - `trilha/modules/fundamentos-js/lessons/<slug>/challenges/<slug-do-desafio>/challenge.json`
     — 14 desafios, com os campos aditivos verbatim (`outputChannel`, `requires`, `requirements`,
     `notRequired`, `subgoals`, `scenarios`, `surfaceDomain`, `solutionAlternates`,
     `wrongSolutions`, `taskSkill`, `supportLevel`, `expectedTestCount`);
   - Derivações (tabela da F12 / precedente a04): `summary ← objective.enunciado`;
     `concepts ← draft.conceito em snake_case`; `challenge.concept ← idem`; `sources ← research`
     (split `URL — anotação`, precedente a04); `difficulty` 1–5 = rampa linear provisória pela
     posição global (1,1,2,2,2,3,3,3,4,4,4,5,5,5); `prerequisites` = cadeia da F12 (aulas
     anteriores que introduziram alguma construção do carry, ordenadas);
   - Formato canônico: JSON com 2 espaços, LF, newline final.
3. **Verificadores** (`verif/check01-load-audit.mts`, `check02-provas.mts`,
   `check03-invariantes.mts`) — os checks (a)–(d), deterministicamente.
4. **Este relatório.**

---

## Premissas e limites

1. **I13 nível track = desvio de STAGING.** A trilha materializada vive em
   `content-src/programacao-do-zero/trilha/` (basename `trilha` ≠ slug `programacao-do-zero`),
   como no precedente a04. No destino final `resources/tracks/programacao-do-zero/`
   (integração do orquestrador) I13 é satisfeito nos 4 níveis.
2. **`difficulty` é provisório** (rampa linear 1..5 pela posição global, mesma política da F12
   `dificuldadeProvisoria`); nenhum gate lê o campo (proibido — docs §11); o débito de produto
   (derivar do tempo resolvido) permanece aberto.
3. **`prerequisites` seguem a derivação da F12** (índice reverso introduces×aula sobre o carry):
   só aulas anteriores que introduziram ≥1 construção inédita aparecem; o loader valida que todo
   slug existe (OK); nenhum gate lê o conteúdo do campo.
4. **`sources`/`challenge.title` seguem o precedente a04** (não a implementação atual de
   `fonteDePesquisa`/`tituloDeDesafio` da F12, que difere do que a rodada 11 materializou):
   title = último segmento do path humanizado; description = a anotação após `—`; título do
   desafio = slug do desafio humanizado.
5. **L-04 pré-existentes fora do escopo.** `curriculo.json`, `curriculo.md` e 3 drafts
   (`const/*`, `erro-sintaxe-vs-erro-valor/challenge-draft.json`) já estavam sem newline final
   no HEAD `0f19900`; o escopo desta tarefa proíbe tocar drafts além do fix único da L1.
6. **Nada além do escopo foi tocado:** `engine/*` intacto; `resources/tracks/nodejs-do-zero`
   intacto (pin 717/112/249/92 reprovado); demais 13 drafts intactos (byte a byte).
7. **A bateria não acusou nenhum erro** — não houve defeito de bateria, de draft nem de
   materialização a classificar: a iteração do item 4 do mandato não foi necessária.

---

## Comandos reprodutores (cwd `app/`)

```bash
# materialização (determinística, zero dependências)
node content-src/programacao-do-zero/verif/materializar.mjs

# (a) loadTrack + (b) auditTrack — bateria completa
node --import tsx content-src/programacao-do-zero/verif/check01-load-audit.mts

# (c) 4 provas de execução nos 14 desafios
node --import tsx content-src/programacao-do-zero/verif/check02-provas.mts

# (d) I12–I17 + I13
node --import tsx content-src/programacao-do-zero/verif/check03-invariantes.mts

# evidência extra: feed integral 14 aulas sobre os drafts pós-fix
PZ_DRAFTS_DIR="$PWD/content-src/programacao-do-zero/drafts" \
  node --import tsx content-src/programacao-do-zero/verif/check05-feed-integral.mts

# (e) gate-lint (raiz da worktree)
bash tests/gate-lint.sh

# (f) trilha existente intacta — placar pinado
npm run engine -- audit nodejs-do-zero --limite 0

# (g) PIN da engine
bash tools/t.sh tests/engineAuditPlacar.test.ts
```
