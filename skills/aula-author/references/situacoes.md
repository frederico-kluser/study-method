# Situações → Ação — o que fazer em cada sintoma

Tabela de decisão do passo `validar`: para cada sintoma, o diagnóstico e a ação EXATA. A regra de
ouro: **o relatório do gate traz `arquivo:linha + eixo + construção` — nunca chute; leia o campo
que o gate apontou.** As medições de 2026-09-11 foram feitas sobre `python-iniciante`; as de
2026-09-22 (§0) sobre as três trilhas.

**Antes de usar qualquer linha desta página:** o comando de chave/extrator e a lista de proibições
são POR LÍNGUA. A forma agnóstica de descobrir a chave exata de um trecho está em
`receita-da-aula.md` §5.1, e as armadilhas de cada adaptador em `receita-da-aula-python.md`,
`receita-da-aula-rust.md` e `receita-da-aula-c.md`.

## 0. Barra pedagógica A17–A23 — a primeira tabela a consultar

O gate é `npm run engine -- barra <slug> [--aula MOD/AULA] [--json]` (exit **1** quando há erro;
A22 sozinho não reprova; **2** em uso incorreto), e o `audit` já roda a mesma bateria e soma os
erros dela em `totals.violacoes` / `totals.errosDaBarra`. Cada achado traz `evidencia`, `mensagem` e
a `acao` do catálogo FECHADO — leia a `acao` antes de decidir.

| Sintoma | Diagnóstico | Ação exata |
|---|---|---|
| **barra reprova A17** (`produtivas novas colapsadas > 2`) ou **A21** (`novas > 4`, ou seções `< max(2, ceil(novas/2))`) | o PASSO é grande demais: a aula pede mais do que o aluno recebe de uma vez. A `acao` prescrita é `SPLIT_LESSON` | **Quebrar a aula** pelo procedimento de `quebra-da-aula.md` (inventariar → agrupar → empacotar → posicionar → reescrever → provar → registrar). **Nunca** ampliar `introduces` para calar o gate, e nunca "explicar rapidinho" o excedente |
| **A18** na primeira aula da trilha (`> 1 produtiva nova`, ou chave lida sem demonstração própria) | na aula 1 o aluno não tem orçamento nenhum para amortecer o passo, e "o aluno só copia" não existe | Quebrar (idem) **ou** tirar a chave da aula: se ela só aparece no `starterCode`, troque o starter por uma forma que o aluno já leia (ou demonstre a chave numa seção própria) |
| **A19 chave sem demonstração** (`X está em introduces e não aparece em nenhum bloco <lang> da teoria desta aula`) | declarar não é demonstrar — é o defeito que legaliza o penhasco (`engine/budget.ts`, linhas 282-285: `saida = entrada ∪ introduces`). NÃO é caso de quebra | **Escrever a demonstração** em bloco cercado com a tag da língua NESTA aula, **ou** tirar a chave do `introduces` (se ela não é matéria desta aula). Bloco com tag errada não conta |
| **A19 `bloco de código na linha N não parseia`** | fail-closed: o gate não pode medir o que o parser recusa. Em C e Rust é quase sempre fragmento sem envelope | Conserte o bloco; a teoria de C/Rust demonstra em FRAGMENTO e o extrator só embrulha com `surface: 'theory'` (`receita-da-aula.md` §5.2). Em C o fragmento vira CORPO DE FUNÇÃO: declare no mesmo bloco o que ele usa |
| **A20 aula sem desafio** (`challenges[] vazio`, em qualquer `role`) | aula sem desafio é aula sem prova: o aluno não exercita nem é conferido por execução | **Autorar o desafio** (`escrever_desafio_e_testes`) com as 4 provas de execução. Consolidação também tem desafio — `role` muda o que a aula INTRODUZ, não a exigência de prova |
| **A20 aula regular sem produtiva nova** | reforço não declarado | Declare `role: "consolidation"` com o degrau nomeado (re-declarando o `targetAtom`), **ou** dê à aula o seu passo |
| **A23 derivada sem co-ocorrência** (`nenhuma linha de bloco desta aula tem X e Y juntas`) | **a chave não é derivada**: "derivada inevitável" é medida por co-ocorrência de LINHA | Tire-a de `derived` — **ela conta cheia** em A17/A21, e então o teto provavelmente estourou: volte para a quebra. Se ela É da mesma construção, a teoria é que está faltando a linha que mostra as duas juntas |
| **A23 pai não declarado / cadeia de derivadas** | pai e filha têm de estar os DOIS em `introduces.productive`, e derivada nunca aponta para outra derivada | Aponte toda derivada DIRETO para a chave que distingue a construção (o `targetAtom`) |
| **A22 chave em 1 forma só** (aviso com contagem) | uma forma só faz o aluno induzir regra restrita demais | Acrescente uma 2ª ocorrência sintaticamente distinta (argumento literal E expressão composta; condição comparada E booleano pronto). É aviso: não reprova, mas a meta é 0 |
| **placar com checagem NÃO EXECUTADA** (`checagensNaoExecutadas > 0`, `blocos de teoria que nao parseiam > 0`, `PARSE FALHOU` no inventário, `NO TESTS RAN`) | zero-porque-não-rodou ≠ zero-porque-está-certo | **Não é verde.** Leia a limitação declarada, conserte a causa e re-rode. Aprovação por omissão é proibida |

## 1. Violação no `audit` — a distinção que faz o laço convergir

Toda violação do `--json` carrega `primeiraAulaQueEnsina` (docs/16 §5.5). São DOIS casos, com ação
diferente — confundi-los reescreve desafios eternamente para caber num currículo furado:

| Sintoma | Diagnóstico | Ação exata |
|---|---|---|
| `primeiraAulaQueEnsina != null` | **Violação de ORDEM**: a construção EXISTE no currículo, mas esta aula (ou este artefato) a usa antes de ela ser ensinada — ou a usa numa forma que o orçamento daquela posição não libera | **Reescrever o artefato** (trocar a construção por outra do orçamento vigente) **ou reordenar o grafo** (mover `desbloqueado_por`). Decidir pelo contrato DA LÍNGUA: a coluna `Presume` (`docs/17-trilha-python.md` · `docs/20-trilha-rust.md` · `docs/20-trilha-c.md`) manda; o gate confere. |
| `primeiraAulaQueEnsina == null` | **LACUNA DE CURRÍCULO**: construção que **nenhuma** aula da trilha ensina | **Criar a aula atômica que ensina** a construção (é o trabalho desta skill) **ou** trocar a construção por algo já no orçamento. Nunca reescrever o desafio para caber num currículo furado — isso não termina nunca. |
| `arquivo:linha+eixo+construcao` | O campo sempre vem no relatório (ex.: `"arquivo": ".../challenge.json", "campo": "solutionCode", "linha": 2, "coluna": 6, "eixo": "operators.unary", "construcao": "op:unary:typeof"` — docs/16 §5.5) | Localize o trecho ofensor LITERAL no artefato (substring, nunca aproximação), corrija só ele e re-rode. |

## 2. Chave desconhecida ou rejeitada — nunca inventar

| Sintoma | Diagnóstico | Ação exata |
|---|---|---|
| Chave que "deveria existir" não casa / VOCAB reprova (eixos `node:`/`op:`/`decl:`/`global:` são FECHADOS, pertença estrita ao inventário) | A chave não existe no inventário DA LÍNGUA (medido: Python 632 chaves em `atoms.python.json` · Rust 191 em `atoms.rust.json` · C o enum `cInventory()`, 34 kinds — `glossario-atomos.md` §0), ou você inventou uma sintética | **Rode o extrator real** sobre o trecho exato — forma agnóstica de língua em `receita-da-aula.md` §5.1 (`extractAtoms` com `language` e `surface: 'theory'`); em Python serve também o extrator puro: `printf 'SEU CODIGO\n' \| python3 -I -S app/electron/main/engine/vocab/py/extract_ast.py`. Use a chave EXATA emitida (`GlobalRef` → `global:X`, `ApiRef` → `api:X`, `Binding` → `decl:X`, nós no `type`). |
| `node:ChainedCompare` (ou qualquer uma das 9 inventadas — **Python**) | Não existe: `0 < x < 10` emite `node:Compare` + `op:compare:<` | A aula vira **consolidação** (forma nova de `Compare`), com o degrau nomeado. |
| `op:compare:is not` / `op:compare:not in` descartadas do `introduces` em silêncio | `ATOM_KEY_RE` (`atomKeys.ts:120`) é `/^(node\|decl\|op\|global\|api\|term\|form):[^\s]+$/` — chave com espaço não casa | **Ensinar o operador base (`is`, `in`) como produtivo** e a negação **só em prosa com crase** (`is not`, `not in`). É a regra normativa do `docs/17-trilha-python.md` — linha **de Python**. |

## 3. `coverage` — os três vereditos por desafio

| Sintoma | Diagnóstico | Ação exata |
|---|---|---|
| **LACUNA** — átomo do mínimo fora do orçamento da aula | O teste cobra algo que a aula não oferece | Ver §1 (ordem × lacuna). Depois de consertar, o mínimo muda — re-rode. |
| **SEM-SOLUCAO** — nenhum candidato mínimo passa | O teste exige mais que literal — computação real (loops, estado, método de lista…) — e o sintetizador determinístico só gera literais/echo/… É o sinal de teste quebrado **ou** de teste cuja solução exige computação que o literal não cobre. Medida desta execução (fix no `minimalPython.ts`): a **solução de referência virou o candidato final** — teste VALOR com ≥2 casos divergentes nunca é satisfeito por literal, e a referência passa (literais continuam primeiro, então teste fraco ainda expõe EXCESSO) | Reescreva o teste para os padrões que o curso validou: ≥2 casos **divergentes** e esperados **não-escalares** (listas, visões `str(d.keys())`, conjuntos de 1 elemento, `hash(-1) == -2`, valores computados) — nunca string crua de dict/set multi-elemento, nunca esperado que um literal satisfaça. |
| **EXCESSO** — a aula ensina, o teste não cobra | O teste não **força** a construção (J5 fraco — a classe de defeito que pintava 17 das 20 aulas legadas de vermelho se fosse erro; hoje é aviso com contagem, decisão do dono docs/16 §9.1) | **Reescreva o teste para exigir o átomo-alvo** (P-CONTRA): a construção tem de estar no caminho do resultado. Meta: EXCESSO 0 no desafio novo — o mínimo sintetizado == a solução de referência. `npm run engine -- discrimination <slug>` mede J5 explicitamente (alvos na solução ∖ átomos do mínimo = não-forçados). |
| Aula inteira com EXCESSO persistente | Talvez a aula ensine demais (duas construções que o teste só poderia cobrir uma a uma) | Decidir a **quebra da aula** (a contagem é saída, não entrada). |

## 4. Violações de entrada e de forma

| Sintoma | Diagnóstico | Ação exata |
|---|---|---|
| **A3** — `testsCode` fora do orçamento de ENTRADA | O aluno lê o teste **antes** da aula; o arquivo de teste só pode usar o que a semente + aulas anteriores ensinam (docs/16 §3.3; 167 das 717 violações da trilha legada eram A3) | Use no teste só o que a semente receptiva (§6 da receita) e os pré-requisitos permitem. **O harness é semente; o ARGUMENTO do teste é conteúdo** — a fronteira é medida: `dobro(-3)` no teste é argumento (fora da semente), `assertFalse`/`assertNotEqual` são seed. Em Python, antes de M11, `assertRaises` na forma de chamada e sem `node:With` no teste; em Rust/C a fronteira do envelope está no capítulo da língua. |
| **A6 vazio** — "aula não introduz construção" (`atomos(solutionCode) ∩ introduces.productive = ∅`) | A direção puxada sumiu: a solução de referência não contém o átomo-alvo | A **solução de referência precisa conter o átomo-alvo** — escreva o desafio de modo que o aluno seja obrigado a escrevê-lo (a lacuna única contém a construção; A14b: ≤1 construção nova por linha). |
| **A7/I2/A17** — `introduces.productive` com 3+ itens | Contagem crua sem a regra do par | **Declare o colapso** em `introduces.derived` (`receita-da-aula.md` §4): a chave que distingue fica produtiva, as derivadas apontam para ela, e A23 confere a co-ocorrência de LINHA. Derivada sem co-ocorrência conta cheia. Se depois do colapso ainda passou de 2, **quebre a aula** (`quebra-da-aula.md`). |
| Penhasco (>4 construções novas numa aula, ou histograma com pico) | A aula não é atômica | **Quebre a aula** pelo procedimento de `quebra-da-aula.md` — a contagem é saída, não entrada. Os tetos medidos pela barra: ≤2 produtivas novas colapsadas (A17), ≤4 novas no total (A21), ≥ max(2, ceil(novas/2)) seções (A21), ≤1 produtiva na aula 1 (A18). |
| `assertions` com 4+ | O loader limita a **3** (`MAX_ASSERTIONS_PER_LESSON = 3` em `content/trackTypes.ts` — `grep -n MAX_ASSERTIONS_PER_LESSON`) — a 4ª derruba a validação | Use 2–3 afirmações por aula (o padrão do curso). |
| `requirements` gap: testes sem requirement / requirement sem teste | O campo é **objeto** `{id, teste, descricao}` 1:1 com os métodos `test_*`; string solta é ignorada; a derivação lê o ARQUIVO DE TESTE | Reescreva `requirements[]` como objetos, um por `def test_...`, `teste` = nome exato do método. Medido na trilha: 92 desafios com bijeção completa; os 21 legados de `a-tela` sem o campo saem com gap — backfill é onda de polimento declarada (docs/18 §4). |

## 5. Forma do conteúdo e da teoria

| Sintoma | Diagnóstico | Ação exata |
|---|---|---|
| **typewriter > 21 s na seção** (o teste `lessonTypewriterReadingSpeed.test.ts` trava 28 chars/s = 7 tps e o teto de 21 s; a seção MONTADA — markdown + cerca + explanation — passa de 588 chars; medido: 15 testes, 15 verdes no curso) | Seção longa demais | **Encurte a prosa (alvo ≤560 chars montados) — NUNCA remova a demonstração da construção nova** (A13). Splite a seção em duas quando o conteúdo não couber. **Ids de seção são âncoras do quiz** (`sectionId`): não renomeie sem revalidar as afirmações. |
| **gate-lint L-04** — arquivo sem newline final | Falta o `\n` no último byte | Adicione o newline final em TODO arquivo criado. O L-04 **trunca a lista em 8 ocorrências** (`tests/lib/assert.sh` faz `head -8` dos hits) — quando o relatório vier truncado ou você quiser certeza, faça a varredura própria do último byte (ex.: `tail -c 1 arquivo` e confira que o byte é quebra de linha). |
| Bloco cercado sem tag de linguagem | Não é código para o extrator (docs/16 §5.3) — "bloco cercado com tag é código; crase inline é prosa" | Todo bloco cercado leva tag, e a tag da LÍNGUA DA TRILHA é a que conta para A19: `py`/`python`/`python3` · `rust`/`rs` · `c` (as outras, como ` ```text ` e ` ```json `, são ilustração e não demonstram nada). Bloco com tag da língua que não parseia é erro — em C e Rust, veja o envelope de fragmento (§0). |
| Teoria que "mostra" construção sem `introduces` | A5 — exibir não é ensinar | Declare a construção em `introduces` (posição certa do grafo) **e** demonstre em bloco (A13d: declarar não é demonstrar). |
| Proibições globais no conteúdo (Python: `eval`, `exec`, `compile`, `__import__`, `globals()`, `locals()`, `vars()`, `importlib.import_module`, atributo não-literal; Rust: `std::process::exit`/`abort`/`ExitCode`, `asm!`, bloco `extern`; C: chamada indireta, `dlsym`, `system`) | São os `FORBIDDEN_INVARIANTS` do adaptador — análise estática indecidível, ou forja de prova | Aparecem **só em prosa com crase**, nunca em bloco cercado (o bloco seria parseado e reprovado). |

## 6. Ambiente e processo — erros que NÃO são do conteúdo

| Sintoma | Diagnóstico | Ação exata |
|---|---|---|
| `npm ci` falha no worktree / Electron baixa binário à toa | Electron em worktree | Use os caminhos congelados: `NPM_CONFIG_LEGACY_PEER_DEPS=true ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` (medido: completa com sucesso). O binário do Electron pode ser copiado do checkout principal — nunca culpar o conteúdo. |
| Gates de repo falham no macOS | `sort`/`head`/etc. BSD quebram os scripts | `export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"` antes de `bash tests/gate-lint.sh && bash tests/gate-build.sh` (medido nesta máquina — docs/18 §3.3). |
| `smoke.sh` degradado localmente | `smoke.sh` é CI: exige **bash ≥ 4** (corre no ubuntu); o bash 3.2 do macOS degrada e declara | Não usar `smoke.sh` como gate local de aula — ele é o teste de integração ponta a ponta da CI. |
| `coverage <slug> --limite 0` sai 2 / placar zerado | A armadilha do `--limite` (docs/16 §8): no `audit` ele limita a IMPRESSÃO (0 = audit tudo); no `coverage`/`requirements`/`revise` ele fatia o que é MEDIDO e **0 é uso incorreto (exit 2 medido)** | No `coverage`/`requirements`, rode **sem** `--limite` (ou com N ≥ 1). |
| Placar com `checagensNaoExecutadas > 0` (o `audit` de python imprime `avisos ... 0 <- sobre 1 checagem(ns) NAO EXECUTADA(S)`) | A bateria A13–A16 é javascript-only — em TODA trilha que não é JavaScript (python, rust, c) ela **pula e declara** o id `A13-A16-NAO-RODOU` (docs/16 §9.2); a barra A17–A23 cobre parte do buraco, e o que sobra está em `validacao.md` §1 | Leia o campo antes de confiar em qualquer `0` de aviso: zero-porque-não-rodou ≠ zero-porque-está-certo (aprovação por omissão, proibida). |
| Divergência contrato × disco | Ex.: `role: "consolidation"` não pertence ao enum da engine (docs/16 §3.7 ⚑); a aula 1 declara o axioma em `introduces`; o `requirements` dos 21 legados | **Declare no padrão ⚑** (no contrato ou no handoff), nunca resolva em silêncio. O gate vence; o documento é que se atualiza. |
| `track:challenge:verify` sem provas / exit inesperado | Exit code sozinho não distingue "passou" de "nada rodou" em Python (`unittest discover` com glob vazio sai 5) | Leia as linhas do veredito (solução PASSA ✓ / starter FALHA (ok) ✓ / testes declarados == testes no arquivo) — e lembre: sem `tests/__init__.py` nada roda. |
