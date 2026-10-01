# SPEC FINAL — Camada CUMULATIVA de validação de desafios (REGRA-C)

2026-09-27 · decisões FINAIS (fontes: `.recon/pesquisa-cumulativa.md`, `.recon/pipeline-validacao.md`,
`.recon/modelo-dados.md`, `.recon/contratos-docs-skills.md`, `.recon/testes-e-pins.md`, pedido do dono).

## 0. O pedido (do dono) e a tradução em regra

1. "no curso devemos a cada desafio adicionar conhecimentos aprendidos em desafios anteriores" →
   **todo desafio cobra, nos TESTES, também conhecimentos que o curso já ensinou antes da aula dele**
   (revisão cumulativa / recuperação espaçada), além do conteúdo novo da própria aula.
2. "na validação das aulas isso deve ser a última camada a ser validada, depois até de validar se o
   conteúdo cobrado foi ensinado até aquele momento do curso mais aquela aula sendo feita" →
   **a checagem cumulativa é a ÚLTIMA camada de validação da aula**, correndo DEPOIS da checagem
   P-DURA (`cobrado ⊆ ensinado-até-aqui ∪ aula em curso`, que é o `audit`/`coverage` de hoje).

## 1. Ordem canónica das camadas de validação de uma aula (NÃO reordenar)

| # | Camada | Pergunta | Comando |
|---|---|---|---|
| 1 | Forma | passo pequeno, demonstração, quiz não vaza | `barra` |
| 2 | Orçamento | o cobrado foi ensinado até aqui ∪ aula em curso? | `audit` |
| 3 | Cobrança real | o mínimo que passa está no orçamento? | `coverage` |
| 4 | Bijeção | `requirements[]` ↔ testes | `requirements` |
| 5 | Provas | solução passa · starter falha · contagem bate · stub falha | `track:challenge:verify` / `track:validate` |
| 6 | Leitura | nenhuma seção > 21 s | `lessonTypewriterReadingSpeed` |
| 7 | **CUMULATIVA (NOVA)** | **o desafio também cobra o que o curso já ensinou?** | **`cumulativa` (NOVO)** |

- Na skill `aula-author` (validação de UMA aula): a camada 7 é o **último passo** da validação
  (antes só de `publicar`).
- Na skill `trilha-author` (`validar_modulo`/`publicar`): gates `audit` → `barra` → `coverage` →
  `requirements` → `track:validate` → `convergir` → **`cumulativa` (o ÚLTIMO gate — a última
  camada a ser validada; entrega = convergir 0 PONTO-FIXO **e** cumulativa 0)**.
- A camada 7 só tem significado depois da camada 2 verde: ela própria valida que as revisões são
  de conhecimento **já** aprendido (C2), portanto P-DURA continua a valer antes.

## 2. Campo novo — `challenge.json.reviews[]` (aditivo, opcional; schemaVersion fica 1)

```json
"reviews": [
  {
    "id": "rv1",
    "atom": "global:sum",
    "from": "listas-e-tuplas/somar-tudo",
    "teste": "test_confere_total_de_vendas",
    "descricao": "revisa soma de lista (aula listas-e-tuplas/somar-tudo)"
  }
]
```

- `atom` — chave de átomo (`node:`/`decl:`/`op:`/`global:`/`api:`, válida em `atomKeys.ts`).
- `from` — `"<moduleSlug>/<lessonSlug>"` de onde o aluno aprendeu; tem de ser aula ANTERIOR à atual.
- `teste` — nome do teste (python `def test_…`, rust `fn` com `#[test]`, C `SM_TEST(…)`) que
  exercita a revisão; um teste pode carregar >1 entrada (1 átomo = 1 entrada).
- `id`/`descricao` — como em `requirements[]`: estáveis, pt-BR, uma linha.
- Campo **opcional** no produto (schema aberto, `trackTypes.ts`); validado fail-closed por
  `validateChallengeSource` quando presente (shapes + `isAtomKey` + regex `^[a-z0-9-]+/[a-z0-9-]+$`).
  Um **único** leitor tipado novo (`ChallengeReview` + `readChallengeReviews`) — nunca uma 3ª
  cópia defensiva do padrão `requirements`.

## 3. As regras — o que o gate `cumulativa` reprova

Ordem interna da camada (C2 antes de C3 — "depois de validar que o conteúdo cobrado foi ensinado"):

- **C1 — Quantidade (rampa).** `count(reviews[]) ≥ N_min`, por posição da aula na ordem pedagógica:
  | Posição | N_min |
  |---|---|
  | aulas 1–2 do curso | 0 (isentas; nada foi ensinado antes) |
  | aulas 3–4 | 1 |
  | aulas ≥5 | 2 |
  | desafio de módulo / proficiência | 4 |
  Ausência de `reviews[]` conta como 0. **ERRO** se abaixo.
- **C2 — Proveniência (o "ensinado até aqui" da própria camada).** Cada `reviews[].atom` ∈
  `aprendidoAntes(aula)` onde `aprendidoAntes(i) = ⋃_{j<i} (introduces_j ∪ atoms(minimal_j))`
  (tudo o que aulas anteriores ensinaram e desafios anteriores cobraram; inclui desafios de módulo
  já fechados e o seed receptivo do harness NÃO conta — só conhecimento do curso). `reviews[].from`
  tem de referir uma aula anterior real cujo `introduces ∪ atoms(minimal)` contém o átomo. Rever o
  que ainda não foi aprendido (ou citar uma `from` que não o ensina) é **ERRO**.
- **C3 — Exercício real (forcing).** Cada `reviews[].atom` ∈ `atoms(minimalCode)` do desafio
  (código mínimo que passa nos testes, sintetizador zero-LLM `quality/minimalPorLinguagem.ts`).
  Revisão que o teste não força é **ERRO** (testing effect: revisão só conta se o teste falhar sem
  a construção). Multi-arquivo / não-sintetizável → **limitação declarada** (fail-closed, nunca verde).
- **C4 — Proporção.** `testesDeRevisão distintos / expectedTestCount ∈ [0.20, 0.50]`
  (módulo/proficiência: `≤ 0.80`). Piso 20% (Lawrence 2013), teto 50% (Gayman 2021), alvo 40%.
  Fora da faixa é **ERRO**. Padrão alvo para aula ≥5: 4–5 testes = 2 revisão + 2–3 novos.
- **C5 — Espalhamento pelo curso (nível TRILHA, agregado dos `reviews[]`).**
  (a) **ERRO**: construção produtiva ensinada com ≥5 aulas de folga que NUNCA é revisitada;
  (b) **AVISO**: construção revisitada <3× · sem separação (~1/3/7 aulas; espaçamento equiespaçado) ·
  a mesma construção revisitada em desafios consecutivos · revisões só de construção confusável
  ausente quando o conteúdo novo tem par confusável (`for`↔`while`, `if`↔ternário, …).
- **C6 — Bijeção aux.** Cada `reviews[].teste` existe nos testes do desafio (normalização igual à
  de `validarRequirements`); gap = **ERRO**.

## 4. O que NÃO muda

- P-DURA (camada 2) continua primeiro e continua valendo para as revisões (C2).
- 4 provas de execução, `expectedTestCount` == testes executados == declarados.
- A3: testes legíveis com o orçamento de ENTRADA da aula (revisões são, por definição, de entrada).
- A6: o desafio continua a exercitar o que a aula introduz (o conteúdo novo tem de ser cobrado).
- A15b ("a aula N reutiliza ≥1 átomo demonstrado antes — recuperação espaçada", javascript-only,
  sem substituto agnóstico) passa a ter **substituto agnóstico**: esta camada (C1–C5). Documentar.
- Nome "cumulativa" (NÃO "revisão progressiva" — colide com o comando `revise`).

## 5. Receita de autoria (o que cada desafio ganha) — para aula ≥5 (ajustar pela rampa)

1. Escolher ≥2 átomos de `aprendidoAntes` (prioridade: módulos anteriores; **par confusável** com o
   conteúdo novo; distâncias ~1/3/7 aulas; nunca a mesma construção do desafio imediatamente anterior).
2. Escrever **≥1 teste de revisão por átomo**, em instância NOVA (dados novos, casos variados —
   nada de repetir o teste original), de tal forma que **o teste falha sem a construção** (evitar
   saída hardcodada: variar entradas/tamanhos).
3. `expectedTestCount` += nº de testes novos; 1 entrada `requirements[]` por teste novo
   (`id`, `teste`, `descricao` pt-BR); 1 entrada `reviews[]` por átomo revisado.
4. Ajustar `solutionCode` para usar as construções revisadas quando o teste as exigir.
5. No `statement`, nota explícita (pedagogia, Szpunar 2007): "(Revisando aqui: `<átomo>` da aula
   `<mod>/<aula>`)" — numa linha curta; manter o enunciado legível com o orçamento de entrada.
6. Proporção C4: testesDeRevisão/total ∈ [20%,50%] — para N_min=2 o padrão é 4–5 testes.
7. Provar: `track:challenge:verify` (4 provas) + `requirements` + `coverage`/`revise`
   (`atomsCobrados` contém os átomos revisados) + `audit` sem violações novas.
8. Aulas 1–2: isentas (sem `reviews[]`). Nunca aumentar contagens de aviso (A22/A24).

## 6. Mapeamento para a engenharia (decisões fechadas)

- Bateria própria: `app/electron/main/engine/quality/cumulativaTipos.ts` + `cumulativa.ts` +
  `cumulativaRegras.ts` (C1–C6 puras, testáveis offline; forcing via
  `sintetizarCodigoMinimoDaLinguagem`; base `aprendidoAntes` por ordem pedagógica via
  `deriveTrackBudget`/`pedagogicalOrder` + `atoms(minimal)` acumulados — padrão `MemoriaDeRevisao`).
- Comando novo no CLI da engine (espelhar o `coverage`): `cumulativa <slug> [--aula MOD/AULA]
  [--limite N] [--dir DIR] [--json]` — exit **0** sem violação · **1** com ERRO · **2** uso.
  Avisos (C5b) nunca derrubam o exit; não-medido/limitação declarada conta como pendência de medição.
- Regra/achado: IDs `C1`..`C6` (família própria, tipo `RelatorioCumulativa` como `RelatorioDaBarra`);
  `Violation`-shaped onde for para relatório conjunto.
- NÃO mexer em `convergencia.ts` (convergir continua a medir audit+barra; `cumulativa` é gate
  irmão de `coverage`/`requirements`/`track:validate`, que também não entram no convergir).
- `challenge.json` ganha só o campo aditivo `reviews[]`; NÃO entrar nos zod da engine (INV-04/INV-05)
  nem nos schemas F12 (evita quebrar golden masters) — exceto se for trivial passar no
  `f12Materialize`/`challengeTemplate` (opcional, sem quebrar pins).
- `validateChallengeSource` (`trackTypes.ts`): validação fail-closed do `reviews[]` presente.
- Testes novos: `app/tests/engineCumulativa*.test.ts` (node:test, offline, fake prover).
- Pins que os conteúdos podem partir (ajustar no mesmo commit — P-30):
  `moduleMastery.test.ts:318` (`rachando-a-conta`), `typewriterSegments.test.ts` (se teoria mudar),
  `trilhaCIntegrada.test.ts` (se nº de aulas de c mudar), `quizOptionOrder`/`optionRationales`
  (se quiz mudar — evitar tocar quiz), `engineBarra*` (0 erros mantido).

## 7. Estado de base medido (2026-09-27, `.recon/baseline/`)

- python-iniciante: audit 0 violações · barra 0 erros · coverage 0 lacunas · requirements 113/113 ✓
- rust-iniciante: audit 0 violações · barra 0 erros · coverage 0 lacunas · requirements 111/111 ✓
- c-iniciante: **22 erros** (A2/A3/A4 de ORDEM: `-`, `!=`, `<=` cobrados antes de ensinados ·
  lacuna de currículo `>` · A20: 4 aulas sem desafio em `texto-em-profundidade`) · coverage 1 lacuna.
- Avisos A22/A24 (dívida medida, NÃO aumentar): python 102 · rust 145 · c 17.
- Desafios: 341 no total (python 113 · c 117 · rust 111); testes hoje: 271+292+268 = 831.
- `cx-lst-*`: trilhas vazias (só track.json) — nada a fazer.
- Diretório órfão `c-iniciante/modules/repeticao/lessons/blk` (binários de build) — **removido**.
