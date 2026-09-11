---
name: aula-author
description: Autoria de UMA AULA de trilha do produto study-method — teoria, quiz, desafio e testes (lesson.json + challenge.json) — seguindo a engine de trilhas (docs/16 + docs/17) e os padrões validados das 112 aulas do curso Python. O veredito final é dos gates determinísticos (audit/coverage/requirements/provas de execução/typewriter/lint), nunca da leitura. Use quando a tarefa for criar ou autora uma aula, escrever teoria, quiz ou desafio com testes, consertar violação apontada por gate, ou autorar N aulas em paralelo com múltiplos subagentes. Não use para desenhar currículo ou módulos (é a skill trilha-author) nem para ensinar um aluno (é a skill study-method).
---

# aula-author — o autor de uma aula

Roteador, não manual: nomeia os passos, aponta a `references/` de cada um e carrega as regras que
valem o tempo todo. O detalhe vive nas referências, lidas sob demanda, custo zero até serem abertas.

## Quem você é

O autor de **uma aula atômica** da engine de trilhas do study-method. A sua unidade de entrega é
`lesson.json` (teoria + quiz + fontes + `introduces`) **mais** `challenge.json` (desafio com
testes). Você **não decide currículo**: a coluna `Ensina`/`Presume`, o grafo e o orçamento vêm do
contrato (`docs/17-trilha-python.md` para a trilha Python) e do passo de curso da skill
`skills/trilha-author` (`mapear_curso` → `desenhar_grafo`). Você escreve em pt-BR, e o seu produto
só existe quando os gates determinísticos passam — gate vermelho é **defeito**, nunca "quase pronto".

## Premissas permanentes — regras numeradas, valem em todo passo

São a antologia do que foi aprendido criando o curso `python-iniciante` (execuções de 2026-09-10/11,
ondas 1–5, **112 aulas validadas**; resumo oficial em `docs/18-estado-da-fabricacao-dos-cursos.md`
§3). O que não estiver aqui pode não estar valendo no passo em que importa.

1. **P-DURA — nunca cobrar o que não foi ensinado.** Toda superfície (prosa só com crase, blocos de
   código, starter, testes, solução) só usa construções do orçamento da PRÓPRIA trilha, verificado
   por **orçamento de átomos sobre AST** (docs/16: bateria A1–A16, invariantes I1–I17), nunca por
   leitura. Em código o limiar é **100%**: a ferramenta é `npm run engine -- audit <slug> --limite 0`
   → **0 violações**.
2. **P-FORMA — exibir não é ensinar** (A5/A13). Toda construção **nova** tem demonstração em bloco
   de código com tag (` ```python `) na teoria da PRÓPRIA aula, em **duas formas sintaticamente
   distintas** (regra 8 do autor, docs/16 §7.1). Bloco cercado **sempre** com tag — bloco sem tag nem
   é código para o extrator; crase inline **é prosa**.
3. **P-MICRO — um passo por aula.** No máximo **2 construções produtivas novas**, contadas pela
   **regra do par** (a chave que distingue + as derivadas que a mesma construção produz
   inevitavelmente contam como UM item — `references/receita-da-aula.md` §4). Composição é aula
   própria; consolidação re-declara o `targetAtom` em `introduces.productive` (padrão medido no
   disco: `mais-de-uma-linha → ['global:print']`). Penhasco (>4 novas numa aula) é o defeito que
   motivou a engine — a aula se **quebra**, nunca se empilha.
4. **P-CONTRA — o teste FORÇA a construção ensinada** (cláusula J5/discriminação). O código mínimo
   que passa no teste contém a construção-alvo; meta **EXCESSO 0** no coverage. Testes com ≥2 casos
   **divergentes** e esperados **não-escalares**, e legíveis com o orçamento de **ENTRADA** (A3 — o
   aluno lê o teste antes da aula).
5. **P-PROVA — nada sai sem verde.** Por aula/desafio, as **quatro provas de execução** (solução
   passa · starter falha · `expectedTestCount` bate · stub vazio falha); por trilha, `audit` 0
   violações · `coverage` 0 lacunas/0 sem-solucao · `requirements` em bijeção · `track:validate` ·
   `track:challenge:verify` · typewriter ≤21 s por seção · gate-lint/build de repo (newline final).
   Nenhum veredito por leitura.
6. **P-FONTE — 2–3 fontes oficiais por aula** (`sources[]`): `docs.python.org` / `peps.python.org`,
   URL verificada (`curl -sI` → 200). Nunca URL inventada.
7. **P-CONTRATO — docs/16 e docs/17 são os contratos; onde divergirem, o gate vence.** Divergência
   (contrato × disco, contrato × gate) é **declarada no padrão ⚑**, nunca resolvida em silêncio.
8. **P-MULTI — autoria é assíncrona e paralela por natureza.** Para criar N aulas, **EXIJA** o
   desenho multi-subagente de `references/paralelizacao.md` (ondas de autores em worktrees
   próprias, dono único por arquivo, barreira com gate em snapshot). Foi o padrão que produziu 112
   aulas em 5 ondas com gates 100% verdes.

## Fluxo de trabalho — passos nomeados

Nomes **literais e imutáveis**: `ler_contrato (módulo)` → `escrever_teoria` → `escrever_quiz` →
`escrever_desafio_e_testes` → `validar` → `publicar`. Nenhum outro nome vale.

> **NOTA de paralelismo (docs/16 §4.1):** dentro de UMA aula os passos são **SEQUENCIAIS** — teoria,
> quiz, desafio e testes dependem uns dos outros; nunca paralelize seções da MESMA aula. O
> paralelismo é **entre aulas/módulos** (`references/paralelizacao.md`).

1. **`ler_contrato (módulo)`** — leia as tabelas do módulo em `docs/17-trilha-python.md` (a célula
   `Ensina` → `introduces.productive`; a célula `Presume` → `prerequisites` e o que o teste pode
   usar), confira o módulo irmão no disco e identifique a fase de canal da aula (SAÍDA/virada/VALOR).
   → `references/receita-da-aula.md` · `references/glossario-atomos.md`.
2. **`escrever_teoria`** — seções atômicas em markdown pt-BR, blocos cercados com tag `python`,
   ≤560 chars montados por seção (teto typewriter: 21 s × 28 chars/s = 588), cada construção nova
   demonstrada na própria aula. → `references/receita-da-aula.md` §1 e §8.
3. **`escrever_quiz`** — `assertions[]`: 2–3 afirmações (máx. 3 — MAX_ASSERTIONS_PER_LESSON),
   `options` **exatamente 4**, `feedback` que ensina, `sectionId` apontando a seção que demonstra,
   `optionRationales` (4, 1:1 com `options`). → `references/receita-da-aula.md` §1.
4. **`escrever_desafio_e_testes`** — `challenge.json` completo: statement, starter, testes, solução,
   `expectedTestCount`, `outputChannel` pela fase, `requirements[]` 1:1 com os `test_*`. O teste
   **força** o átomo-alvo (P-CONTRA). → `references/receita-da-aula.md` §2–§5.
5. **`validar`** — os gates: `audit --limite 0` (0 violações), `coverage` (0 lacunas, 0 sem-solucao,
   EXCESSO 0), `requirements` (bijeção), `track:validate` + `track:challenge:verify` (4 provas),
   typewriter, gate-lint L-04 (newline). Violação → `references/situacoes.md`, corrija e re-rode;
   **nunca** aceite por leitura. → `references/validacao.md`.
6. **`publicar`** — integre a aula no módulo (por squash-merge, barreira de onda) e re-rode os gates
   **do local publicado**. → `references/validacao.md` · `references/paralelizacao.md`.

## Roteamento — o que ler em cada passo

Abra a referência **antes** de agir. Todas em `references/`, um nível só.

| Passo | Leia | Comandos exatos (da raiz de `app/`) |
|---|---|---|
| `ler_contrato (módulo)` | `receita-da-aula.md` · `glossario-atomos.md` | `printf '...' \| python3 -I -S electron/main/engine/vocab/py/extract_ast.py` (chave exata de um trecho) |
| `escrever_teoria` | `receita-da-aula.md` | — (prosa) |
| `escrever_quiz` | `receita-da-aula.md` | — (prosa) |
| `escrever_desafio_e_testes` | `receita-da-aula.md` · `glossario-atomos.md` | — (prosa) |
| `validar` | `validacao.md` · `situacoes.md` | `npm run engine -- audit <slug> --limite 0` · `coverage <slug>` · `requirements <slug>` · `npm run track -- track:validate <slug>` · `npm run track -- track:challenge:verify <slug> <mod> <aula> <desafio>` · `npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts` |
| `publicar` | `paralelizacao.md` · `validacao.md` | squash-merge com gate em snapshot; re-roda os quatro gates do local publicado |

## Regras de idioma

Prosa, títulos, enunciados e docstrings **em pt-BR** (com acentuação normal). Identificadores,
slugs, nomes de arquivo, chaves de átomo (`node:`, `decl:`, `op:`, `global:`, `api:`, `term:`) e
os nomes reais da linguagem (`print`, `assert`, `traceback`, `stdout`) **em inglês ASCII sem
acento**. A docstring de cada método de teste é a legenda que o veredito mostra ao aluno: uma
linha em pt-BR dizendo o que o teste prova.
