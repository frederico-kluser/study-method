# Revisão adversarial dos drafts — aula `let-e-atribuicao` (FASE 2)

> **Artefatos revistos** (mergeados em `main` pela onda anterior):
> - `lesson-draft.json` (teoria — a02, commit `86cfdf6`);
> - `challenge-draft.json` (desafio — a03, commit `df07e2e`).
>
> **Instrumento:** `protocolo-de-revisao.md` (fase 1, commit `1e0cf74`), aplicado na ordem do §6.1:
> verificadores determinísticos primeiro (extrator real da engine + `node --test`), só então
> julgamento de prosa com o protocolo. Nenhum campo de código foi escrito; apontamentos com trecho
> literal e veredito.
>
> **Data/hash de verificação:** 2026-08-30; extração via
> `app/electron/main/engine/extract.ts` (typescript 5.8.3, config fixa §5.3), execução com node v24.

## Resumo executivo

**A aula NÃO quebra nenhuma regra de forma bloqueante.** Veredito por regra: **15 atendidas · 1
parcial (R8) · 2 N/A (R11, R18)**. Invariantes: I5/I6/I9 atendidas; I7/I8 N/A (aula única). Checklist
§4.3 C1–C6 atendido. Teste de atomicidade §3.6: 4/4 réguas e 4/4 testes. As quatro provas de execução
(§5.4) e a discriminação J5 foram re-executadas e passam.

**"A aula quebra X regras: <lista>":**
- **0 regras quebradas** (nenhum veredito `quebrada`);
- **1 regra parcial: R8** — "duas formas sintaticamente distintas": o par usado (literal numérico ×
  literal string) não é distinção sintática do nó `VariableDeclaration`; a limitação de orçamento
  (sem `op:binary:*`) é documentada, mas a forma sintática distinta real disponível no orçamento
  (declaração sem inicializador + atribuição separada) não foi usada. **Ação sugerida (severidade
  corrigir, não bloqueante):** ver R8 abaixo.

---

## R1–R18 — veredito e evidência literal

| # | Veredito | Evidência literal (trecho do draft) |
|---|---|---|
| **R1** | **atendida** | Ordem no fluxo: `predicao` (ler: "**Preveja** [...] o que `x()` devolve?") → `modelo-mental` (ler semântica) → WE `exemplo-numero`/`exemplo-string` (ler + prever estado) → `refutacoes` → `referencia` ("No desafio desta aula a lacuna é a **declaração**: você escreve a linha `let ... = ...;`") → desafio (escrever sintaxe na lacuna). Ler-semântica antes de escrever-sintaxe; ler-template = a linha congelada anunciada como leitura; escrever-template ausente (opcional por construção) ✓ |
| **R2** | **atendida** | `predicao`: "a primeira interação de hoje é a mesma de sempre: **prever** o que o teste vê, sem rodar nada" + "**Preveja** (não conta para nada [...]): quando o teste roda, o que `x()` devolve? O `assert.equal(x(), 1)` está comparando o quê? O teste passa ou falha?" — pergunta **o quê**, jamais o como; confrontada: "A execução confronta a previsão: `x()` devolve **1** [...] e o teste **passa**" ✓ |
| **R3** | **atendida** | Extrator real: `starterCode` 10 chaves, 0 fora do receptivo; `solutionCode` 14 chaves, 0 fora do produtivo; `testsCode` 16 chaves, 0 fora do teste (A1/A2/A3 ✓); teoria: 15 blocos ```js, **0 ofensas** contra o receptivo (A4 ✓); varredura global de todas as superfícies + blocos: `op:binary:*` = 0, `global:console` = 0. Prosa fora de blocos: `+` aritmético em `"(0 + 10)"` e `"(3 + 10)"` (notação matemática na refutação da misconcepção 1 — ver Observação O3; D4 tornam prosa severidade aviso) e `+=`/`++` citados só como "ficam para outras aulas" (autorizado pelo contrato `proibicoes_absolutas`) |
| **R4** | **atendida** | `kc_type=regra`: a aula entrega WE + prática e evita tese: os 2 WEs têm 1 parágrafo de enquadramento + incrementos que rodam; `modelo-mental` é a única seção expositiva (3 parágrafos + 1 bloco), ancorada em exemplo imediatamente depois; sem drill de "fato decorável" solto — o drill é leitura de estado (mecanismo) ✓ |
| **R5** | **atendida** | A tríade declarar→atribuir→ler é tratada como interativa (declarado no raciocínio: "a tríade declarar → atribuir → ler-valor só faz sentido junta, então worked example ANTES de qualquer desafio") e há 2 WEs completos **antes** de qualquer enunciado de desafio: `exemplo-numero` ("Incremento 1 — declarar e ler [...] Roda. O teste `assert.equal(placar(), 0)` passa") e `exemplo-string` ✓ |
| **R6** | **atendida** | `modelo-mental` percorre a onda completa: nomeia ("O termo técnico desta aula é **variável** [...] Criar a variável é **declarar**; trocar o valor que ela guarda é **atribuir**; usar o nome [...] é **ler**") → desempacota ("pense numa **etiqueta de identificação**") → **reempacota dentro do código** ("Reempacotando — a mesma analogia, aplicada linha a linha no código:" + bloco `marcar()` com os comentários "// declarar: criar a etiqueta `contador` presa no valor 0" ... "// ler-valor: devolver o nome devolve o valor preso agora: 5") → **onde quebra** ("Onde a analogia quebra: a etiqueta **não segura a expressão**, segura o **resultado** [...] a etiqueta não 'lembra' do valor anterior") ✓ |
| **R7** | **atendida** | 2 WEs (contextos distintos, estrutura mantida): `exemplo-numero` (placar/`pontos`, 3 incrementos) e `exemplo-string` (`cumprimentar`/`nome`, 2 incrementos); cada incremento "Roda. O teste ... passa" (saída real = resultado do teste; sem `console` no orçamento, é a única saída exibível); instruções DENTRO do código como comentários ("// declarar: criar a variável `pontos` presa no valor inicial 0"); os 3 rótulos do dossiê (`declarar`, `atribuir`, `ler-valor`) são usados nos comentários, sem rótulo inventado. **Nota (não bloq.):** não há ciclo explícito "erro real → ler mensagem → corrigir" — a falha não é mostrável nesta aula (A11 veda cenário de erro); R7 pede "a saída **ou** o erro real", e a saída é mostrada ✓ |
| **R8** | **parcial** | **Evidência de AST (extrator/parser real):** as 13 declarações `let` da teoria têm TODAS inicializador — 11 com literal numérico (`let contador = 0;`, `let pontos = 0;`, `let pontos = 10;`, `let pontos = 3;`, `let total = 10;`, `let x = 1;`, `let x = 0;`, `let valor = 7;` …) e 2 com literal string (`let nome = 'ana';`, `let nome = 'bia';`) — **nenhuma sem inicializador**. O par "número × string" varia o TIPO DO LITERAL, não a FORMA do nó (ambas são `VariableDeclaration` com `initializer: Literal` — AST idêntico em estrutura). O autor declara a intenção no raciocínio: "As duas formas sintaticamente distintas de decl:let exigidas por R8 são a declaração com literal numérico (`let pontos = 0;`) e com literal de string (`let nome = 'ana';`)". **Decomposição da decisão:** (a) a leitura literal do §7.1 ("literal e expressão composta") é insatisfazível por orçamento — exigiria `op:binary:+`/`-`, ausentes das 3 listas (verificado: 0 chaves `op:binary:*`); (b) a fonte contratual (`contrato.json` → `regras_autor[7]`) atribui o par número/string à **atribuição** (`op:assign:=`) e o par com/sem inicializador à **declaração** — o par usado foi aplicado à construção errada do par contratual; (c) **a forma sintática distinta real ERA satisfazível** (declaração sem inicializador + atribuição separada: `decl:let`, `node:VariableStatement`, `op:assign:=`, `node:BinaryExpression`, `node:ExpressionStatement` — todos no receptivo, verificado) e não foi usada. **Ação sugerida (corrigir):** adicionar em um WE ou na `referencia` uma declaração sem inicializador + atribuição (ex.: `let saldo; saldo = 8;`), tornando a forma 2 real presente; a outra metade da lacuna (forma "expressão composta") fica registrada como limitação do orçamento/contrato (decisão D-R8 do protocolo) — ver "Fantasias conferidas" |
| **R9** | **atendida** | As 3 concepções do dossiê têm par errado/certo ancorado na spec: (1) "A variável é uma caixa que vai acumulando..." → bloco `let total = 10; total = 3;` + "Leitura errada: 'total guarda 13 (10 + 3)'. Leitura certa: total guarda **3**" + "(ECMA-262, 13.15.4; MDN, seção Assignment)"; (2) "Para trocar o valor, eu redeclaro" → par errado `let x = 1; let x = 2;` + par certo `let x = 1; x = 2;` + "(ECMA-262, 14.3.2; MDN, seção Redeclarations)"; (3) "Posso atribuir sem declarar" → par errado `x = 1;` + par certo `let x = 0; x = 1;` + "(ECMA-262, 13.15.4; MDN, seção Strict mode)". Cf. O4 abaixo |
| **R10** | **atendida** | 2 perguntas de estado na teoria + 1 no desafio + teste do valor final: `exemplo-numero` "**Qual é o estado agora?** No incremento 3, depois da linha `let pontos = 3;`, o que está guardado em `pontos`? E depois da linha `pontos = 10;`?"; `exemplo-string` idem; `drill` "qual é o estado agora — o que está guardado em `valor` depois de cada linha"; desafio: "Depois de `contador = 5;`, o que está guardado em `contador` é o valor inicial `0` ou o valor atribuído `5`?"; teste `assert.equal(iniciar(), 5)` valida o valor FINAL ✓ |
| **R11** | **N/A** | Aula 1, sem ancestral (`prerequisites` vazio; dossiê). A substituição contratada foi implementada: a primeira interação É a predição de leitura do harness (`predicao`: "a primeira interação de hoje é a mesma de sempre: **prever** o que o teste vê") ✓ |
| **R12** | **atendida** | 3 slots separados no `theory[]`: `teoria` (predicao, modelo-mental, exemplo-numero, exemplo-string, refutacoes), `referencia` (seção com tag `referencia`, colada ao desafio: "No desafio desta aula a lacuna é a **declaração**: você escreve a linha `let ... = ...;` com o valor inicial. A linha de atribuição já vem pronta e congelada no código") e `drill` (opcional, 1 item) ✓ |
| **R13** | **atendida** | Nenhuma atividade artificial: o drill é um único item de leitura de estado; os WEs variam o contexto sem adicionar rota (o incremento 3 do WE numérico existe para provar substituição × acúmulo — reduz carga, não soma) ✓ |
| **R14** | **atendida** | O harness (export/import/test/function/return/assert/arrow) aparece só como leitura, em 1 frase de contexto ("O harness testa as funções que você exporta: ele as importa, as chama e compara o que cada uma devolve com um valor esperado. Esse formato já é seu — ele aparece em toda tarefa") e nos blocos da predição; nenhuma seção ensina função/import/assert; o desafio pede apenas a declaração ✓ |
| **R15** | **atendida** | O draft contém apenas os slots previstos; itens de `fora_de_escopo` citados SOMENTE como "ficam para outras aulas também: `const`, `var`, escopo de bloco, operadores compostos como `+=`, incremento `++` e várias declarações na mesma linha" (autorizado pelo contrato) ✓ |
| **R16** | **atendida** | Nenhuma ocorrência de `obj[expr]` com chave não-literal nem alias de função em nenhuma superfície (varredura completa: nada de `ElementAccessExpression`, nada de função como valor; o extrator emitiria `node:ComputedNonLiteralAccess`) ✓ |
| **R17** | **atendida** | Prosa em pt-BR com acentuação; API e sintaxe mantidas em inglês (`let`, `function`, `export`, `return`, `assert`); termos novos declarados em `introducesTerms` = ["variável", "declaração", "atribuição", "valor"]. Ver O1 (identificadores em pt-BR) |
| **R18** | **N/A** | Conferência mecânica do checksum na autoria (A-P11-5), não na revisão; o autor replicou um resumo "Checksum de cauda" como conteúdo (final do `drill`) — é texto didático, sem função de gate; inofensivo ✓ |

---

## I5–I9 (§5.2)

| Invariante | Veredito | Evidência |
|---|---|---|
| **I5** (introduzida em ≥1 exemplo da própria teoria) | **atendida** | `decl:let` presente em ≥1 bloco de exemplo da teoria: `modelo-mental` (`let contador = 0;`), `exemplo-numero`, `exemplo-string`, `refutacoes`, `referencia`, `drill` — extração: chave `decl:let` com ocorrências em 6 seções ✓ |
| **I6** (exigida no desafio da própria aula) | **atendida** | Enunciado: "Falta **declarar** a variável `contador` com `let` no lugar marcado, começando com o valor `0`"; starter com 1 lacuna única (`// LACUNA: declare a variável `contador` com `let`...`); A6 verificado: solução usa `decl:let` (extrator: `A6 (sol usa decl:let): true`) ✓ |
| **I7** (≥3 artefatos posteriores) | **N/A (documentado no protocolo Parte B)** | Aula única do experimento — não existem artefatos posteriores neste snapshot; indecidível, não violado. Registro obrigatório feito: reaparecimento será verificado na trilha materializada (F9/F12) |
| **I8** (interleaving) | **N/A** | Exige 3 aulas consecutivas; existe 1 aula. Indecidível, não violado |
| **I9** (primeira aparição = forma mais simples) | **atendida (por construção + verificado)** | A TEORIA foi verificada: a primeira aparição de `decl:let` é `let contador = 0;` no `modelo-mental` — declaração com inicializador literal (forma mais simples); sem `op:binary:*` no orçamento, a forma composta é impossível, então o requisito é satisfeito por construção; a varredura confirma que nenhuma forma mais complexa precede ✓ |

---

## Checklist §4.3 (C1–C6)

| # | Passo | Veredito | Evidência |
|---|---|---|---|
| C1 | Objetivo | **atendido** | `dossie.json.objetivo` reproduzido em `lesson-draft.json.objective` (verbo "demonstrar", enunciado, contexto, critério); o desafio traduz o critério ("o teste valida que o valor final produzido é o da última atribuição" → `assert.equal(iniciar(), 5)`). J7: verbo do desafio ("declarar", em `taskSkill`) exercita o verbo do objetivo ("demonstrar" é o meta-verbo da aula) — nota de alinhamento aceitável |
| C2 | Esqueleto de teoria | **atendido** | `theory[]` com 7 seções nos 3 slots (5 teoria + 1 referencia + 1 drill), subgoals declarados em `subgoals` ✓ |
| C3 | Desafio e testes antes do fechamento | **atendido (no artefato)** | O desafio (a03, `df07e2e`) existe como artefato separado; a teoria fecha ciente do desafio: `referencia` nomeia a lacuna e a linha congelada; C7 (teoria ensina o que o desafio cobra) verificado: declarar com `let` (WE + refutação + referência) e ler a atribuição congelada (WE incremento 2/3) — nenhum requisito do desafio (REQ-1) sem amparo na teoria ✓ |
| C4 | Fechamento habitado pelo desafio | **atendido** | O fechamento (referencia/drill) habilita explicitamente o que o desafio exige: "você escreve a linha `let ... = ...;` com o valor inicial. A linha de atribuição já vem pronta e congelada" ✓ |
| C5 | Provas de execução (§5.4) | **atendido** | Re-executadas com os drafts mergeados (ver tabela P1–P4 abaixo) ✓ |
| C6 | `desafios_ja_escritos` | **documentado** | Continua `[]` no dossiê (desafio nasceu pós-freeze); esperado pelo fluxo §4.3; o campo será preenchido quando o dossiê for re-gerado com o desafio validado (I5/I6) |

---

## Teste de atomicidade (§3.6) e provas de execução

**Réguas:** produtivas novas = 1 (`decl:let`) ≤ 2 ✓ · elementos interativos = 2 (`decl:let` + `op:assign:=`) ≤ 2 (orçamento pequeno) ✓ · não interativos = 0 ≤ ~7 ✓ · tempo ≤ 120 s ✓ (todas as execuções abaixo na ordem de 100 ms).

**Os quatro testes de atomicidade:**
1. **Demonstrável** ✓ — os WEs da teoria têm 3–4 linhas e demonstram declarar→atribuir→ler sem estourar o teto de elementos;
2. **Exercitável** ✓ — starter com **exatamente 1** lacuna (`// LACUNA`) cujo span contém a declaração (o átomo-alvo produtivo); a atribuição fica congelada FORA da lacuna; nada de segunda construção nova no span;
3. **Orçamentável** ✓ — `introduces_productive = ["decl:let"]` (1 ≤ 2; medido por a01: com 2 produtivas a régua falharia);
4. **Cronometrável** ✓ — função de 3 linhas; P1–P4 resolvem em ~100 ms.

**Provas de execução (§5.4) — re-executadas 2026-08-30 sobre o draft mergeado (`/tmp/sm-rev2/desafio`):**

| Prova | Resultado real |
|---|---|
| P1 solução passa | `tests 1 · pass 1 · fail 0` ✓ |
| P2 starter falha (lacuna vazia) | `fail 1` — `ReferenceError: contador is not defined` ✓ |
| P3 contagem = `expectedTestCount` | `tests 1` = 1 ✓ |
| P4 stub vazio falha | `fail 1` ✓ |

**Discriminação J5 (verificação extra, honestidade do catálogo):**
- `wrongSolutions` catalogadas — `const contador = 0;` → `fail 1` (TypeError na linha congelada) ✓; `contador = 0;` (sem declaração) → `fail 1` (ReferenceError) ✓ — **cada uma falha em ≥1 teste, como exige J5**;
- `solutionAlternates` — `let contador = 100;` e `let contador = 5;` → ambas `pass 1` ✓ (alternativas reais);
- **Limite medido (confirma O2 do protocolo):** `var contador = 0;` e `let contador;` (sem inicializador) também **passam** no teste — o teste só discrimina "sem declaração" e "declaração const"; o catálogo NÃO as lista como erradas (correto, J5).

---

## Fantasias conferidas (as armadilhas do protocolo)

1. **`+` / `console.log` / `===` fora das listas = R3 bloqueante?** → **NÃO ocorre.** Extrator real em todas as superfícies + 15 blocos js da teoria: `op:binary:* = 0`, `global:console = 0`, `node:ComputedNonLiteralAccess = 0`. Em prosa fora de blocos: `+` aparece apenas em notação matemática entre parênteses que DESCREVE a concepção errada ("0 + 10", "3 + 10") — não ensina sintaxe JS; `+=`/`++` citados só como "fica para outra aula". R3 ATENDIDA (com a observação O3).
2. **R8 — decidir 'atendida' (critério contratado) ou 'parcial' (limitação de orçamento documentada)?** → **PARCIAL.** Três razões, em ordem: (a) o par número/string **não é distinção sintática** do nó (evidência de AST acima: 13/13 declarações com inicializador; muda só o literal), logo não satisfaz o critério do protocolo ("duas formas sintaticamente distintas no AST"); (b) a limitação de orçamento é real e documentada (forma "expressão composta" exige `op:binary:*`, ausente), mas não é a única causa — (c) a forma sintática distinta **disponível no orçamento** (declaração sem inicializador + atribuição separada; chaves verificadas no receptivo) **não foi usada**. Ação sugerida (corrigir, não bloqueante): incluir a forma sem inicializador em um WE ou na referência.
3. **O4 — a redeclaração (`let x = 1; let x = 2;`) parseia como bloco ```js?** → **SIM, PARSEIA — correção ao protocolo.** Verificado com o extrator real: o bloco da refutação (2) retorna `ok` (7 chaves, 0 ofensas A4). O TypeScript NÃO aplica o early error de escopo (BoundNames duplicados) em `parseDiagnostics` do `createSourceFile` — é erro semântico do checker, não de parse. A nota R9 do protocolo ("o gate reprovaria") estava **errada**; o draft não viola nenhum gate por isso (o bloco também não é executado). R9 permanece atendida; fica o lembrete didático: o bloco é SyntaxError em execução e não deve ser rodado como exemplo.

---

## Observações (não bloqueantes)

- **O1 — identificadores em pt-BR** (contrato `formas_benditas`): `contador`, `pontos`, `nome`, `x`, `valor`; consistente entre teoria e desafio (`contador` exigido no enunciado). Convenção da skill pede inglês; R17 não cobre identificadores. Decisão única para o integrador (manter ou renomear) — recomendação: manter (aula 1, orçamento fechado), registrar a exceção.
- **O2 — enunciado × cenário "limite" divergem sobre a liberdade do valor inicial:** o enunciado manda "começando com o valor `0`" (e o comentário da lacuna também), enquanto `notRequired` e o cenário `limite` declaram "o valor inicial é livre (qualquer literal numérico)". Sugestão: ou o enunciado vira "com um valor inicial" (alinhando à liberdade real — o teste não distingue), ou a liberdade fica documentada como nota (barato manter como está desde que a ficha técnica registre a divergência).
- **O3 — `+` aritmético em prosa** (2 ocorrências, `exemplo-numero`): notação matemática "0 + 10" / "3 + 10" dentro da refutação; não ensina sintaxe; D4: prosa é severidade aviso; se quiser zero ambiguidade, reescrever como "a soma seria 10" — opcional.
- **O4 — correção registrada acima** (redeclaração parseia; clause do protocolo R9 ajustada na prática).
- **O5 — `raciocinio_de_projeto` do desafio contém uma contradição interna:** "só há UMA construção que o aluno pode escrever nela que faz a função rodar e passar no teste: a declaração `let contador = 0;`" e, 4 linhas depois, "o valor inicial da declaração é livre e qualquer solução alternativa com outro literal continua passando" (e `solutionAlternates` confirmam: `let contador = 100;` passa). Campo é metadado do autor (fora das superfícies), não afeta gates — apontar para corrigir o texto na próxima iteração.

---

## Registro de verificação (FASE 2)

- [x] Veredito por regra R1–R18 com evidência literal (tabela acima).
- [x] I5/I6 verificados por extração real; I7/I8 N/A justificados; I9 verificado na teoria (forma mais simples primeiro).
- [x] Checklist §4.3 (C1–C6) aplicado ao conjunto dossiê+drafts.
- [x] Atomicidade §3.6: réguas + 4 testes aplicados.
- [x] P1–P4 e J5 re-executados com node v24 sobre os drafts mergeados.
- [x] Fantasias conferidas: R3 (sem ofensa), R8 (decidido: parcial), O4 (corrigido: parseia).
- [x] Saída escrita em `app/content-src/let-e-atribuicao/revisao-drafts.md` (worktree a06).
