---
name: aula-author
description: Autoria de UMA AULA de trilha do produto study-method — teoria, quiz, desafio e testes (lesson.json + challenge.json) — em QUALQUER uma das três linguagens em produção (python, rust, c), seguindo a engine de trilhas (docs/16 + o contrato da linguagem da trilha) e os padrões validados das 112 aulas do curso Python. O veredito final é dos gates determinísticos (barra A17-A24/audit/coverage/requirements/provas de execução/typewriter/lint), nunca da leitura. Use quando a tarefa for criar ou autorar uma aula, escrever teoria, quiz ou desafio com testes, consertar violação apontada por gate, QUEBRAR uma aula que pede demais do aluno, ou autorar N aulas em paralelo com múltiplos subagentes. Não use para desenhar currículo ou módulos (é a skill trilha-author) nem para ensinar um aluno (é a skill study-method).
---

# aula-author — o autor de uma aula

Roteador, não manual: nomeia os passos, aponta a `references/` de cada um e carrega as regras que
valem o tempo todo. O detalhe vive nas referências, lidas sob demanda, custo zero até serem abertas.

## Quem você é

O autor de **uma aula atômica** da engine de trilhas do study-method, em **qualquer uma das três
linguagens em produção** (`python`, `rust`, `c`). A sua unidade de entrega é `lesson.json` (teoria +
quiz + fontes + `introduces`) **mais** `challenge.json` (desafio com testes). Você **não decide
currículo**: a coluna `Ensina`/`Presume`, o grafo e o orçamento vêm do contrato **da linguagem da
trilha** (P-LINGUA) e do passo de curso da skill `skills/trilha-author` (`mapear_curso` →
`desenhar_grafo`). Você escreve em pt-BR, e o seu produto só existe quando os gates determinísticos
passam — gate vermelho é **defeito**, nunca "quase pronto".

## Premissas permanentes — regras numeradas, valem em todo passo

São a antologia do que foi aprendido criando o curso `python-iniciante` (execuções de 2026-09-10/11,
ondas 1–5, **112 aulas validadas**; resumo oficial em `docs/18-estado-da-fabricacao-dos-cursos.md`
§3) **mais a revisão de 2026-09-22**, que estendeu a skill às três linguagens em produção e trocou
conselho por gate (a barra pedagógica A17–A24, `engine/quality/barra.ts`). O que não estiver aqui
pode não estar valendo no passo em que importa.

1. **P-LINGUA — o contrato é o da LINGUAGEM DA TRILHA, e a receita também.** A língua sai de
   `track.json.programmingLanguage` (`python` · `rust` · `c`), nunca da conversa e nunca por
   semelhança com a trilha que você autorou ontem. Dela dependem: o contrato de conteúdo
   (`docs/17-trilha-python.md` · `docs/20-trilha-rust.md` · `docs/20-trilha-c.md`), o inventário de
   chaves, o axioma de entrada, a semente receptiva do harness, a tag de cerca que conta como
   demonstração, a forma do arquivo de teste e as proibições globais. Leia
   `references/receita-da-aula.md` (comum) **mais** `references/receita-da-aula-<língua>.md`. Usar a
   tabela da língua errada produz aula cujo orçamento nunca casa — em silêncio.
2. **P-DURA — nunca cobrar o que não foi ensinado.** Toda superfície (prosa só com crase, blocos de
   código, starter, testes, solução) só usa construções do orçamento da PRÓPRIA trilha, verificado
   por **orçamento de átomos sobre AST** (docs/16: baterias A1–A6/DEC/I12–I17 e a barra A17–A24),
   nunca por leitura. Em código o limiar é **100%**: a ferramenta é
   `npm run engine -- audit <slug> --limite 0` → **0 violações**.
3. **P-FORMA — exibir não é ensinar, e DECLARAR não é DEMONSTRAR** (A5/A13/**A19**). Toda chave nova
   — produtiva **e** receptiva — tem demonstração em bloco cercado **com a tag da linguagem da
   trilha** (` ```python ` · ` ```rust ` · ` ```c `) na teoria da PRÓPRIA aula, e a produtiva em
   **duas formas sintaticamente distintas** (A22, aviso com contagem). Bloco sem tag nem é código
   para o extrator; crase inline **é prosa**. Em C e Rust a teoria demonstra em FRAGMENTO e o
   extrator só o parseia com `surface: 'theory'` (`references/receita-da-aula.md` §5.2).
4. **P-MICRO — um passo por aula, e o colapso é DECLARADO.** No máximo **2 construções produtivas
   novas** (A17; **1** na primeira aula da trilha, A18) e **4 novas no total** (A21), contadas
   **depois** do colapso pela regra do par — que agora é o campo `introduces.derived` e é conferida
   pelo gate **A23** por co-ocorrência de LINHA (`references/receita-da-aula.md` §4). Composição é
   aula própria; consolidação re-declara o `targetAtom` em `introduces.productive` (padrão medido:
   `mais-de-uma-linha → ['global:print']`) **e também tem desafio** (A20). Estourou o teto e nem esta
   trilha nem um curso anterior da cadeia ensina o que sobrou? **Quebre a aula** —
   `references/quebra-da-aula.md`, procedimento numerado. Ampliar `introduces` para calar o gate é o
   mesmo defeito com outro nome.
5. **P-CONTRA — o teste FORÇA a construção ensinada** (cláusula J5/discriminação). O código mínimo
   que passa no teste contém a construção-alvo; meta **EXCESSO 0** no coverage. Testes com ≥2 casos
   **divergentes** e esperados **não-escalares**, e legíveis com o orçamento de **ENTRADA** (A3 — o
   aluno lê o teste antes da aula).
6. **P-PROVA — nada sai sem verde, e o laço não tem teto.** Por aula/desafio, as **quatro provas de
   execução** (solução passa · starter falha · `expectedTestCount` bate · stub vazio falha); por
   trilha, `barra` 0 erros · `audit` 0 violações · `coverage` 0 lacunas/0 sem-solucao ·
   `requirements` em bijeção · `track:validate` · typewriter ≤21 s por seção · gate-lint/build de
   repo (newline final). A entrega do curso roda o laço `convergir` **sem teto de rodadas**, até
   PONTO-FIXO (`references/validacao.md` §7) — aceitar por cansaço é proibido. **Checagem que não
   rodou não é verde**: `checagensNaoExecutadas > 0` e `blocos de teoria que nao parseiam > 0` são
   medição ausente, nunca aprovação.
7. **P-FONTE — 2–3 fontes oficiais por aula** (`sources[]`), do domínio oficial **da linguagem da
   trilha** (`docs.python.org`/`peps.python.org` · `doc.rust-lang.org` · a referência de C que o
   `docs/20-trilha-c.md` autoriza), URL verificada (`curl -sI` → 200). Nunca URL inventada.
8. **P-CONTRATO — docs/16 e o contrato da LINGUAGEM são os contratos; onde divergirem, o gate
   vence.** Divergência (contrato × disco, contrato × gate) é **declarada no padrão ⚑**, nunca
   resolvida em silêncio.
9. **P-MULTI — autoria é assíncrona e paralela por natureza.** Para criar N aulas, **EXIJA** o
   desenho multi-subagente de `references/paralelizacao.md` (ondas de autores em worktrees
   próprias, dono único por arquivo, barreira com gate em snapshot). Foi o padrão que produziu 112
   aulas em 5 ondas com gates 100% verdes.

## Fluxo de trabalho — passos nomeados

Nomes **literais e imutáveis**: `ler_contrato (módulo)` → `escrever_teoria` → `escrever_quiz` →
`escrever_desafio_e_testes` → `validar` → `publicar`. Nenhum outro nome vale.

> **NOTA de paralelismo (docs/16 §4.1):** dentro de UMA aula os passos são **SEQUENCIAIS** — teoria,
> quiz, desafio e testes dependem uns dos outros; nunca paralelize seções da MESMA aula. O
> paralelismo é **entre aulas/módulos** (`references/paralelizacao.md`).

1. **`ler_contrato (módulo)`** — **primeiro descubra a LÍNGUA** (P-LINGUA):
   `python3 -c "import json;print(json.load(open('app/resources/tracks/<slug>/track.json'))['programmingLanguage'])"`.
   Então leia as tabelas do módulo no contrato DELA (`docs/17-trilha-python.md` ·
   `docs/20-trilha-rust.md` · `docs/20-trilha-c.md`): a célula `Ensina` → `introduces.productive`
   (com o colapso declarado em `introduces.derived`); a célula `Presume` → `prerequisites` e o que o
   teste pode usar. Confira o módulo irmão no disco e identifique a fase de canal da aula
   (SAÍDA/virada/VALOR). → `references/receita-da-aula.md` (comum) ·
   `references/receita-da-aula-<língua>.md` · `references/glossario-atomos.md`.
2. **`escrever_teoria`** — seções atômicas em markdown pt-BR, blocos cercados **com a tag da língua
   da trilha** (`python`/`rust`/`c`), ≤560 chars montados por seção (teto typewriter: 21 s ×
   28 chars/s = 588), **toda chave nova demonstrada nesta aula** (A19) e a produtiva em 2 formas
   distintas (A22). → `references/receita-da-aula.md` §1 e §5.
3. **`escrever_quiz`** — `assertions[]`: 2–3 afirmações (máx. 3 — MAX_ASSERTIONS_PER_LESSON),
   `options` **exatamente 4**, `feedback` que ensina, `sectionId` apontando a seção que demonstra,
   `optionRationales` (4, 1:1 com `options`). → `references/receita-da-aula.md` §1.
4. **`escrever_desafio_e_testes`** — `challenge.json` completo: statement, starter, testes, solução,
   `expectedTestCount`, `outputChannel` pela fase, `requirements[]` 1:1 com os testes. O teste
   **força** o átomo-alvo (P-CONTRA), e a forma do arquivo de teste é a da língua. →
   `references/receita-da-aula.md` §2–§3 · `references/receita-da-aula-<língua>.md` §3.
5. **`validar`** — os gates, do mais barato ao mais caro: `barra <slug> --aula MOD/AULA` (0 erros
   A17–A21/A23–A24), `audit --limite 0` (0 violações — já inclui a barra), `coverage` (0 lacunas, 0
   sem-solucao, EXCESSO 0), `requirements` (bijeção), `track:challenge:verify` (4 provas),
   typewriter, gate-lint L-04 (newline). Vermelho → `references/situacoes.md` §0 (barra) e §1
   (orçamento), corrija e re-rode; **nunca** aceite por leitura. Achado com ação `SPLIT_LESSON` →
   `references/quebra-da-aula.md`. Na entrega do curso, o laço é `convergir <slug>`, **sem teto de
   rodadas**, até PONTO-FIXO. → `references/validacao.md`.
6. **`publicar`** — integre a aula no módulo (por squash-merge, barreira de onda), confira que o slug
   entrou em `module.json.lessons[]` na posição certa e re-rode os gates **do local publicado**. →
   `references/validacao.md` · `references/paralelizacao.md`.

## Roteamento — o que ler em cada passo

Abra a referência **antes** de agir. Todas em `references/`, um nível só.

Em trilha de Rust, todo comando pede `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"` (cargo
keg-only).

| Passo | Leia | Comandos exatos (da raiz de `app/`) |
|---|---|---|
| `ler_contrato (módulo)` | `receita-da-aula.md` · `receita-da-aula-<língua>.md` · `glossario-atomos.md` | `python3 -c "import json;print(json.load(open('resources/tracks/<slug>/track.json'))['programmingLanguage'])"` (a língua) · `npx tsx -e '…extractAtoms…'` (chave exata de um trecho — `receita-da-aula.md` §5.1) |
| `escrever_teoria` | `receita-da-aula.md` §5 · `receita-da-aula-<língua>.md` | `npx tsx -e '…extractAllOccurrences…'` (a LINHA de cada ocorrência, para a regra do par) |
| `escrever_quiz` | `receita-da-aula.md` §1 | — (prosa) |
| `escrever_desafio_e_testes` | `receita-da-aula.md` §2–§3 · `receita-da-aula-<língua>.md` §3 · `glossario-atomos.md` | — (prosa) |
| `validar` | `validacao.md` · `situacoes.md` | `npm run engine -- barra <slug> [--aula MOD/AULA] [--json]` · `audit <slug> --limite 0` · `coverage <slug>` · `requirements <slug>` · `npm run track -- track:validate <slug>` · `npm run track -- track:challenge:verify <slug> <mod> <aula> <desafio>` · `npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts` |
| quebrar a aula (achado `SPLIT_LESSON`) | `quebra-da-aula.md` | `npm run engine -- barra <slug> --aula MOD/AULA --json` (o campo `grupos`) · `npm run engine -- convergir <slug> --json` (o plano) |
| `publicar` | `paralelizacao.md` · `validacao.md` | squash-merge com gate em snapshot; re-roda os gates do local publicado; `npm run engine -- convergir <slug>` até PONTO-FIXO |

## Regras de idioma

Prosa, títulos, enunciados e docstrings **em pt-BR** (com acentuação normal). Identificadores,
slugs, nomes de arquivo, chaves de átomo (`node:`, `decl:`, `op:`, `global:`, `api:`, `term:`) e
os nomes reais da linguagem (`print`, `printf`, `assert_eq!`, `traceback`, `stdout`) **em inglês
ASCII sem acento**. O rótulo de cada teste é a legenda que o veredito mostra ao aluno — uma linha em
pt-BR dizendo o que o teste prova (docstring em Python, nome do `#[test]` em Rust, 1º argumento do
`checa_*` em C). **Em C, texto IMPRESSO pelo código é ASCII sem acento** (o acento fica no
`statement`, na teoria e nos comentários).
