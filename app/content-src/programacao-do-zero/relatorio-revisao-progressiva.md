# Relatório da Revisão Progressiva — programacao-do-zero (ONDA 6)

**Onda 6 — aplicar a revisão ao conteúdo real (REPLAN A1–A5).** Resolução dos **8 excessos** (7 aulas) sinalizados pela revisão progressiva da ONDA 5, aplicação da **MATRIZ DE DECISÃO POR EXCESSO** nos drafts, re-materialização com `--produto` e re-rodada de revise/coverage/audit/verifiers/gates até convergência.

- Orçamento: **declared** (mesma fonte do audit em modo declared — introduces do lesson.json)
- Convergência do revise: **SIM** em **2** iteração(ões) (hash estável + válvula anti-loop)
- Placar revise: **14/14 cobertas · 0 lacunas · 0 não-revisáveis · 2 com excesso (tolerados) · 0 splits** — exit 0
- Placar coverage: **14/14 desafios passaram · 0 lacunas · 2 excessos (tolerados)** — exit 0
- Audit: **0 violações · 0 lacunas · 10 avisos A14a** (composição nova documentada abaixo) — exit 0

---

## 1. Tabela decisão × átomo (a MATRIZ aplicada)

| Aula | Átomo em excesso | Decisão | Como (implementado) |
|---|---|---|---|
| L3 funcao-e-chamada | `node:CallExpression` | **MANTER + tolerância** | Nada mudou no draft. REMOVER quebra **A2** (a lacuna do desafio É a chamada `resposta()` — o aluno a escreve); COBRIR bloqueado por **A1/A3** (um contador exigiria `decl:let`/`op:assign:=`, indisponíveis até a L7). Enquadra no 3º braço da emenda **A4e** (excesso estrutural: literal-return/call obrigatório). Justificativa documentada. |
| L7 let-e-atribuicao | `decl:let` | **COBRIR** | Desafio reescrito: declaração `let` no **escopo do módulo** + **export** (`export let contador = 0;`) + teste com **2 chamadas** que importa a variável → o **mínimo passa a conter `decl:let`** (7 linhas, provado por execução). O contador de chamadas (mecanismo original da matriz) foi **provado inviável**: `SEM_SOLUCAO_ACESSIVEL` no sintetizador mínimo (`quality/minimal.ts` — limite documentado: "uma atribuição com estado NÃO tem candidato literal que passe"), o que tornaria a aula NÃO-REVISÁVEL (fail-closed) — regressão, não resolução. O desenho escolhido preserva a atribuição congelada `contador = 5;` (receptiva), o contraste let×const (wrongSolution com const → TypeError) e o núcleo validado da aula. A1/A13d/A16/A15b validados (0 erros na bateria; check-l7l8 verde). |
| L8 string-como-valor | `decl:let` | **REMOVER** | `introduces.productive` → `[node:StringLiteral]`. `decl:let` é **cumulativo** (produtivo da L7 — já no saída produtiva da entrada da L8 via carry). Remover da declaração é **A2-safe**: a atividade continua exercitando `let mensagem = "oi";` na lacuna e o átomo permanece no orçamento via herança cumulativa. |
| L9 estado-ler-depois-de-escrever | `decl:let` | **REMOVER** | `introduces.productive` → `[]` (aula de **leitura pura**: nenhum avanço produtivo declarado). `decl:let` é cumulativo da L7; a lacuna continua exercitando `let contador = 0;` (A2-safe). |
| L10 const | `decl:let` | **REMOVER** | `introduces.productive` → `[decl:const]`. `decl:let` cumulativo (L7/L9); a atividade continua exercitando `let mudavel = 1;` na lacuna (A2-safe). |
| L10 const | `decl:const` | **MANTER + tolerância** | `decl:const` permanece produtivo (o desafio o escreve: `const fixa = 2;`). O excesso é **TOLERADO** (A4e, 3º braço — **inobservabilidade**): `const` é INOBSERVÁVEL por comportamento — import ESM é read-only e o erro de reassign (`TypeError: Assignment to constant variable`) **não é testável** no runner do produto. Justificativa documentada. |
| L13 nomear-bem | `decl:const` | **REMOVER** | `introduces.productive` → `[node:StringLiteral]`. `decl:const` cumulativo (produtivo da L10); a atividade continua exercitando `const fruta = "abacaxi";` na lacuna (A2-safe). |
| L14 todas-as-pecas-juntas | `decl:const` | **REMOVER** | `introduces.productive` → `[node:FunctionDeclaration]`. `decl:const` cumulativo (L10); a atividade continua exercitando `const saudacao = "oi";` no programa completo. L14 mantém `FunctionDeclaration`, que o **mínimo usa** (3 linhas). |

> **Emenda A4e (3º braço):** excesso ESTRUTURAL (literal-return/call obrigatório **ou** inobservabilidade) → **TOLERAR com justificativa no relatório**; NUNCA remover o que o desafio usa (A2), nunca forçar desafio que viole A1/A3/A15a. Aplicada em L3 (literal-return obrigatório) e L10 (inobservabilidade do const). A COBRIR da L7 foi feita pelo desenho viável (módulo-scope + export + 2 chamadas), com o contador documentado como inviável.

---

## 2. Por aula — minimalCode, atoms cobrados, veredito e decisão

> `atoms` = o que o teste REALMENTE cobra (atoms do mínimo). `excesso` = `introduces.productive` não usado pelo mínimo. `lacuna` = atoms do mínimo fora do orçamento da aula. minimalCode exibido quando o veredito é ok.

### Aula 1 — como-o-site-confere-seu-codigo
- Desafio `digite-o-numero-7` — **ok** — mínimo com 4 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:NumericLiteral, node:ReturnStatement`
- Excesso: — · Lacuna: —
- Decisão: **COBERTA** (sem excesso).

```js
export function resposta() {
  return 7;
}
```

### Aula 2 — valor-e-instrucao
- Desafio `digite-outro-numero` — **ok** — mínimo com 4 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:NumericLiteral, node:ReturnStatement`
- Decisão: **COBERTA**.

```js
export function resposta() {
  return 42;
}
```

### Aula 3 — funcao-e-chamada
- Desafio `chamar-a-caixa` — **ok** — mínimo com 9 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:NumericLiteral, node:ReturnStatement`
- **EXCESSO: `node:CallExpression`**
- Decisão: **MANTER + tolerância** — REMOVER quebra A2 (o aluno escreve a chamada na lacuna única do desafio; o átomo produtivo da aula É a chamada); COBRIR bloqueado por A1/A3 (um contador exigiria `decl:let`/`op:assign:=`, que só entram no orçamento na L7). Excesso estrutural (literal-return/call obrigatório) → emenda A4e, 3º braço: **TOLERADO**, justificativa registrada. O draft NÃO mudou nesta onda.

```js
// A caixa resposta está pronta — leia e não mexa:
function resposta() {
  return 5;
}

export function conferidor() {
  return 5;
}
```

### Aula 4 — export-entrega
- Desafio `entregar-a-caixa` — **ok** — mínimo com 5 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:NumericLiteral, node:ReturnStatement`
- Decisão: **COBERTA**.

```js
export function resposta() {
  return 5;
}
```

### Aula 5 — parametro-e-argumento
- Desafio `eco-com-parametro` — **ok** — mínimo com 4 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:Parameter, node:ReturnStatement`
- Decisão: **COBERTA**.

```js
export function eco(x) {
  return x;
}
```

### Aula 6 — return
- Desafio `eco-escreve-o-return` — **ok** — mínimo com 4 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:Parameter, node:ReturnStatement`
- Decisão: **COBERTA**.

```js
export function eco(x) {
  return x;
}
```

### Aula 7 — let-e-atribuicao
- Desafio `contador-com-let` — **ok** — mínimo com **7 linhas** (contém `decl:let`), provas válidas, requirements OK
- Atoms cobrados: `decl:let, node:BinaryExpression, node:Block, node:EndOfFileToken, node:ExportKeyword, node:ExpressionStatement, node:FunctionDeclaration, node:Identifier, node:NumericLiteral, node:ReturnStatement, node:VariableDeclaration, node:VariableDeclarationList, node:VariableStatement, op:assign:=`
- Excesso: **— (RESOLVIDO)** · Lacuna: —
- Decisão: **COBRIR (ONDA 6)** — o excesso `decl:let` (não usado pelo mínimo `return 5;`) foi resolvido: o desafio agora exige a declaração `let` **no escopo do módulo**, **exportada**, e o teste importa a variável e a exercita em **2 chamadas**; o mínimo passou a conter `decl:let`. O **contador de chamadas** (mecanismo original da matriz) foi provado inviável por execução real (`SEM_SOLUCAO_ACESSIVEL` — limite do sintetizador mínimo para atribuição de estado, `quality/minimal.ts`); o desenho escolhido preserva a atribuição congelada `contador = 5;` (receptiva — op:assign:= + BinaryExpression), o contraste let×const (wrongSolution com const → TypeError na linha congelada) e o núcleo validado da aula. A1/A13d/A16/A15b validados na bateria (0 erros) e no check-l7l8.

```js
export let contador = 0;

export function iniciar() {
  contador = 5;
  return contador;
}
```

### Aula 8 — string-como-valor
- Desafio `saudacao-com-string` — **ok** — mínimo com 4 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:ReturnStatement, node:StringLiteral`
- Decisão: **REMOVER** `decl:let` de `introduces.productive` (→ `[node:StringLiteral]`) — cumulativo da L7 (A2-safe; a lacuna continua exercitando `let mensagem = "oi";` e o átomo permanece no saída produtiva via carry).

```js
export function saudacao() {
  return 'oi';
}
```

### Aula 9 — estado-ler-depois-de-escrever
- Desafio `qual-e-o-ultimo-valor` — **ok** — mínimo com 4 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:NumericLiteral, node:ReturnStatement`
- Decisão: **REMOVER** `decl:let` de `introduces.productive` (→ `[]`) — aula de leitura pura; `decl:let` cumulativo da L7 (A2-safe).

```js
export function lerDepois() {
  return 3;
}
```

### Aula 10 — const
- Desafio `const-fixa-e-let-mutavel` — **ok** — mínimo com 4 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:NumericLiteral, node:ReturnStatement`
- **EXCESSO: `decl:const`**
- Decisão: **REMOVER** `decl:let` de `introduces.productive` (→ `[decl:const]`) — cumulativo da L7/L9 (A2-safe; a lacuna continua exercitando `let mudavel = 1;`). **MANTER + tolerância** para `decl:const` — inobservável por comportamento (A4e, 3º braço): import ESM é read-only e o erro de reassign não é testável no runner do produto; o mínimo `return 2;` nunca contém `const`. Justificativa registrada.

```js
export function exemplo() {
  return 2;
}
```

### Aula 11 — erro-sintaxe-vs-erro-valor
- Desafio `leia-a-mensagem-do-conferidor` — **ok** — mínimo com 4 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:NumericLiteral, node:ReturnStatement`
- Decisão: **COBERTA**.

```js
export function resposta() {
  return 6;
}
```

### Aula 12 — involucro-completo
- Desafio `montar-conferir` — **ok** — mínimo com 3 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:NumericLiteral, node:ReturnStatement`
- Decisão: **COBERTA**.

```js
export function conferir() {
  return 5;
}
```

### Aula 13 — nomear-bem
- Desafio `const-fruta` — **ok** — mínimo com 4 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:ReturnStatement, node:StringLiteral`
- Decisão: **REMOVER** `decl:const` de `introduces.productive` (→ `[node:StringLiteral]`) — cumulativo da L10 (A2-safe; a lacuna continua exercitando `const fruta = "abacaxi";`).

```js
export function descobrir() {
  return "abacaxi";
}
```

### Aula 14 — todas-as-pecas-juntas
- Desafio `frase-completa` — **ok** — mínimo com 3 linhas, provas válidas, requirements OK
- Atoms cobrados: `node:Block, node:EndOfFileToken, node:ExportKeyword, node:FunctionDeclaration, node:Identifier, node:ReturnStatement, node:StringLiteral`
- Decisão: **REMOVER** `decl:const` de `introduces.productive` (→ `[node:FunctionDeclaration]`) — cumulativo da L10; L14 mantém `FunctionDeclaration`, que o mínimo usa.

```js
export function frase() {
  return "oi";
}
```

---

## 3. Síntese final

- **0 lacunas** em toda a trilha (coverage 14/14 passaram; revise 0 lacunas; audit 0 lacunas) — nenhuma aula precisa de SPLIT.
- **8 excessos resolvidos**: 5 REMOVIDOS de `introduces.productive` (L8/L9/L10/L13/L14 — todos cumulativos, A2-safe), 1 COBRIDO (L7 — o mínimo passa a conter `decl:let`), 2 **tolerados** (L3 `node:CallExpression` — literal-return/call obrigatório, A4e; L10 `decl:const` — inobservabilidade, A4e).
- **Excessos residuais (só os tolerados, documentados):**
  - L3 funcao-e-chamada → `node:CallExpression` (MANTER — REMOVER quebraria A2; COBRIR inviável até L7; tolerado por A4e estrutural)
  - L10 const → `decl:const` (MANTER — a atividade escreve const; inobservável por comportamento no runner; tolerado por A4e)
- **Convergência**: revise convergiu em 2 iterações (hash estável) com exit 0 — a trilha agora cobre apenas o que oferece, com os dois excessos estruturais declarados.
- **Bateria A13–A16 (check05-feed-integral)**: 0 ERROS nas 14 aulas; só os 10 avisos A14a de aula-de-prática (esperados).

---

## 4. Composição nova dos 10 avisos A14a (SEM re-baseline)

A contagem de avisos A14a permanece **10** (sem re-baseline de contagem); a **composição** é a registrada no REPLAN A3/A5 — rede líquida das ondas 2–6:

| Aula | A14a | Observação |
|---|---|---|
| L1 como-o-site-confere-seu-codigo | — | Novo(1)=4 (teto exato) — sem aviso |
| L2 valor-e-instrucao | **aviso** | Novo(2)=0 — aula de prática |
| L3 funcao-e-chamada | — | Novo(3)=1 — **sai da lista** (vs baseline pré-ONDA-2) |
| L4 export-entrega | **aviso** | Novo(4)=0 |
| L5 parametro-e-argumento | **aviso** | Novo(5)=0 — **entra na lista** (L1 demonstra parâmetro/return receptivamente — padrão L1-lê/L5-escreve) |
| L6 return | **aviso** | Novo(6)=0 — **já era aviso** (anterior à ONDA 2) |
| L7 let-e-atribuicao | — | Novo(7)=3 — sem aviso (COBRIR da ONDA 6 mantém 3 novos verdadeiros) |
| L8 string-como-valor | **aviso** | Novo(8)=0 (StringLiteral ∈ H13; decl:let ∈ Cum) |
| L9 estado-ler-depois-de-escrever | **aviso** | Novo(9)=0 (leitura pura — introduces.productive vazio) |
| L10 const | — | Novo(10)=1 (decl:const) — sem aviso |
| L11 erro-sintaxe-vs-erro-valor | **aviso** | Novo(11)=0 |
| L12 involucro-completo | **aviso** | Novo(12)=0 |
| L13 nomear-bem | **aviso** | Novo(13)=0 |
| L14 todas-as-pecas-juntas | **aviso** | Novo(14)=0 |

**Narrativa (REPLAN A3/A5):** a rede líquida é **L5 entra, L3 sai, L6 já era aviso** — a mudança veio da ONDA 2 (a L1 passou a demonstrar parâmetro/return como leitura receptiva, zerando o Novo de L5/L6 e mantendo L3 com Novo=1). A ONDA 6 **preserva a composição**: as decisões por excesso atuam sobre `introduces.productive` de aulas cujo Novo já era 0 (L8/L9/L13/L14) ou 1 (L10) — nenhuma decisão altera o Novo de nenhuma aula, e o contador permanece 10, **SEM re-baseline** (o pin do engineAuditPlacar — 717/112/249/92 — é da trilha nodejs-do-zero e ficou INTACTO).

---

## 5. nodejs-do-zero FORA do laço (pin intacto)

- A trilha legada **nodejs-do-zero** está FORA do laço da revisão progressiva (não declara `introduces`; o modo inferido + o sintetizador mínimo a tornam fail-closed por construção).
- Placar real confirmado nas ondas 3/5 (run real): **137 desafios → 96 sem-solucao / 18 ignorado / 23 ok / 6 com lacuna** (números 96/18/23/6).
- Gate de regressão **reproduzido NESTA onda**: `audit nodejs-do-zero` → **717 violações · 112 desafios com violação · 249 lacunas · 92 avisos** — exatamente o **PIN_PLACAR 717/112/249/92** (engineAuditPlacar.test.ts), **sem bump**.
- Nenhum arquivo de `resources/tracks/nodejs-do-zero/` foi tocado (check06-produto: "nodejs-do-zero presente e intocado: OK").

---

## 6. Verifiers e gates (todos verdes)

| Verifier / Gate | Resultado |
|---|---|
| `revise programacao-do-zero --json` | convergência SIM em 2 iterações · 14/14 cobertas · 0 lacunas · 0 não-revisáveis · 2 excessos (tolerados) · exit 0 |
| `coverage programacao-do-zero --json` | 14/14 passaram · 0 lacunas · 2 excessos · exit 0 |
| `audit programacao-do-zero --json` | 0 violações · 0 lacunas · 10 avisos A14a · exit 0 |
| check01-load-audit | PASSOU (0 erros · hygiene 0 · parseErrors 0 · 10 avisos A14a) |
| check02-atoms / check02-curriculo-extract / check02-extract-curriculo | PASSOU (0 fora do universo) |
| check02-provas | PASSOU (14/14 valid=true, declared==executed==expected) |
| check03-invariantes | PASSOU (I12–I17 + I13) |
| check03-progressao | PASSOU (0 ERROS; aviso A14a só na L2) |
| check-l5l6 / check-l7l8 / check-l9l11 | PASSOU (inclui L7 nova + esticar novo; wrongSolutions falham; alternates passam) |
| check05-evidencias | PASSOU (0 blocos não-parseáveis; wrongSolutions falham; alternates passam) |
| check05-feed-integral | PASSOU (0 ERROS A13–A16 nas 14 aulas; 10 avisos A14a esperados) |
| check06-produto | PASSOU (loadTrack 0 issues · produto ≡ trilha byte a byte · assertions 42/42 · nodejs intocado) |
| j5-wrongsolutions | PASSOU (todas as wrongSolutions falham) |
| `audit nodejs-do-zero` | 717/112/249/92 — pin INTACTO |
| engineAuditPlacar (npm test) | pin 717/112/249/92 reproduzido |
| `npm run lint` | PASS (tsc --noEmit app + node) |
| `npm test` | PASS (suíte completa) |

---

## 7. Arquivos alterados

- `drafts/let-e-atribuicao/challenge-draft.json` — COBRIR (novo desafio: módulo-scope + export + 2 chamadas)
- `drafts/let-e-atribuicao/lesson-draft.json` — objective.criterio, raciocinio, seções `leitura-de-atribuicao` e `referencia`, justificativa
- `drafts/string-como-valor/lesson-draft.json` — REMOVER `decl:let` (introduces + raciocinio + justificativa)
- `drafts/estado-ler-depois-de-escrever/lesson-draft.json` — REMOVER `decl:let` (introduces + raciocinio + justificativa)
- `drafts/const/lesson-draft.json` — REMOVER `decl:let`, MANTER `decl:const` (introduces + raciocinio + justificativa)
- `drafts/nomear-bem/lesson-draft.json` — REMOVER `decl:const` (introduces + raciocinio + justificativa)
- `drafts/todas-as-pecas-juntas/lesson-draft.json` — REMOVER `decl:const` (introduces + raciocinio + justificativa)
- `curriculo.json` — L7 atividade.fixar/esticar (o_aluno_escreve, estrutura) alinhados ao desafio novo
- `verif/check-l7l8.mts` — esticar da L7 (V4) alinhado ao desafio novo (mesma rigidez: 4 provas + alternates/wrongs)
- `trilha/` + `resources/tracks/programacao-do-zero/` — re-materializados (`materializar.mjs --produto`)
- `revisao-progressiva/relatorio-revisao.{json,md}` — regenerados pelo `revise` da ONDA 6
- `relatorio-revisao-progressiva.md` — este relatório
