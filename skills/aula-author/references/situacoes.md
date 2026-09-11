# Situações → Ação — o que fazer em cada sintoma

Tabela de decisão do passo `validar`: para cada sintoma, o diagnóstico e a ação EXATA. A regra de
ouro: **o relatório do gate traz `arquivo:linha + eixo + construção` — nunca chute; leia o campo
que o gate apontou.** As medições citadas foram feitas nesta execução (2026-09-11) sobre
`python-iniciante`.

## 1. Violação no `audit` — a distinção que faz o laço convergir

Toda violação do `--json` carrega `primeiraAulaQueEnsina` (docs/16 §5.5). São DOIS casos, com ação
diferente — confundi-los reescreve desafios eternamente para caber num currículo furado:

| Sintoma | Diagnóstico | Ação exata |
|---|---|---|
| `primeiraAulaQueEnsina != null` | **Violação de ORDEM**: a construção EXISTE no currículo, mas esta aula (ou este artefato) a usa antes de ela ser ensinada — ou a usa numa forma que o orçamento daquela posição não libera | **Reescrever o artefato** (trocar a construção por outra do orçamento vigente) **ou reordenar o grafo** (mover `desbloqueado_por`). Decidir pelo contrato: a coluna `Presume` do docs/17 manda; o gate confere. |
| `primeiraAulaQueEnsina == null` | **LACUNA DE CURRÍCULO**: construção que **nenhuma** aula da trilha ensina | **Criar a aula atômica que ensina** a construção (é o trabalho desta skill) **ou** trocar a construção por algo já no orçamento. Nunca reescrever o desafio para caber num currículo furado — isso não termina nunca. |
| `arquivo:linha+eixo+construcao` | O campo sempre vem no relatório (ex.: `"arquivo": ".../challenge.json", "campo": "solutionCode", "linha": 2, "coluna": 6, "eixo": "operators.unary", "construcao": "op:unary:typeof"` — docs/16 §5.5) | Localize o trecho ofensor LITERAL no artefato (substring, nunca aproximação), corrija só ele e re-rode. |

## 2. Chave desconhecida ou rejeitada — nunca inventar

| Sintoma | Diagnóstico | Ação exata |
|---|---|---|
| Chave que "deveria existir" não casa / VOCAB reprova (eixos `node:`/`op:`/`decl:`/`global:` são FECHADOS, pertença estrita ao inventário) | A chave não existe no universo de 632 chaves de `atoms.python.json` (medido: node 118 · op 42 · decl 11 · global 164 · api 297), ou você inventou uma sintética | **Rode o extrator real** sobre o trecho exato: `printf 'SEU CODIGO\n' \| python3 -I -S app/electron/main/engine/vocab/py/extract_ast.py` e use a chave EXATA emitida (`GlobalRef` → `global:X`, `ApiRef` → `api:X`, `Binding` → `decl:X`, nós no `type`). O extrator roda sem node_modules (Python puro + stdlib). |
| `node:ChainedCompare` (ou qualquer uma das 9 inventadas) | Não existe: `0 < x < 10` emite `node:Compare` + `op:compare:<` | A aula vira **consolidação** (forma nova de `Compare`), com o degrau nomeado. |
| `op:compare:is not` / `op:compare:not in` descartadas do `introduces` em silêncio | `ATOM_KEY_RE` (`atomKeys.ts:120`) é `/^(node\|decl\|op\|global\|api\|term\|form):[^\s]+$/` — chave com espaço não casa | **Ensinar o operador base (`is`, `in`) como produtivo** e a negação **só em prosa com crase** (`is not`, `not in`). É a regra normativa do docs/17. |

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
| **A3** — `testsCode` fora do orçamento de ENTRADA | O aluno lê o teste **antes** da aula; o arquivo de teste só pode usar o que a semente + aulas anteriores ensinam (docs/16 §3.3; 167 das 717 violações da trilha legada eram A3) | Use no teste só o que a semente receptiva (§6 da receita) e os pré-requisitos permitem. **O harness é semente; o ARGUMENTO do teste é conteúdo** — a fronteira é medida: `dobro(-3)` no teste é argumento (fora da semente), `assertFalse`/`assertNotEqual` são seed. Antes de M11, `assertRaises` na forma de chamada; sem `node:With` no teste. |
| **A6 vazio** — "aula não introduz construção" (`atomos(solutionCode) ∩ introduces.productive = ∅`) | A direção puxada sumiu: a solução de referência não contém o átomo-alvo | A **solução de referência precisa conter o átomo-alvo** — escreva o desafio de modo que o aluno seja obrigado a escrevê-lo (a lacuna única contém a construção; A14b: ≤1 construção nova por linha). |
| **A7/I2** — `introduces.productive` com 3+ itens | Contagem crua sem a regra do par | Aplique a regra do par (receita §4) — suba a chave que distingue e deixe as derivadas de fora; o conjunto conta como UM. Se ainda assim passou de 2, **quebre a aula**. |
| Penhasco (>4 construções novas numa aula, ou histograma com pico) | A aula não é atômica | **Quebre a aula** em duas — a contagem é saída, não entrada. O teto: ≤2 produtivas novas (A7), ≤4 elementos novos interativos (A12), 1 construção nova por linha da lacuna (A14b). |
| `assertions` com 4+ | O loader limita a **3** (`MAX_ASSERTIONS_PER_LESSON = 3`, `trackTypes.ts:508`) — a 4ª derruba a validação | Use 2–3 afirmações por aula (o padrão do curso). |
| `requirements` gap: testes sem requirement / requirement sem teste | O campo é **objeto** `{id, teste, descricao}` 1:1 com os métodos `test_*`; string solta é ignorada; a derivação lê o ARQUIVO DE TESTE | Reescreva `requirements[]` como objetos, um por `def test_...`, `teste` = nome exato do método. Medido na trilha: 92 desafios com bijeção completa; os 21 legados de `a-tela` sem o campo saem com gap — backfill é onda de polimento declarada (docs/18 §4). |

## 5. Forma do conteúdo e da teoria

| Sintoma | Diagnóstico | Ação exata |
|---|---|---|
| **typewriter > 21 s na seção** (o teste `lessonTypewriterReadingSpeed.test.ts` trava 28 chars/s = 7 tps e o teto de 21 s; a seção MONTADA — markdown + cerca + explanation — passa de 588 chars; medido: 15 testes, 15 verdes no curso) | Seção longa demais | **Encurte a prosa (alvo ≤560 chars montados) — NUNCA remova a demonstração da construção nova** (A13). Splite a seção em duas quando o conteúdo não couber. **Ids de seção são âncoras do quiz** (`sectionId`): não renomeie sem revalidar as afirmações. |
| **gate-lint L-04** — arquivo sem newline final | Falta o `\n` no último byte | Adicione o newline final em TODO arquivo criado. O L-04 **trunca a lista em 8 ocorrências** (`tests/lib/assert.sh` faz `head -8` dos hits) — quando o relatório vier truncado ou você quiser certeza, faça a varredura própria do último byte (ex.: `tail -c 1 arquivo` e confira que o byte é quebra de linha). |
| Bloco cercado sem tag de linguagem | Não é código para o extrator (docs/16 §5.3) — "bloco cercado com tag é código; crase inline é prosa" | Todo bloco cercado leva tag (` ```python `, ` ```text `, ` ```json `). A teoria também é parseada: bloco com tag que não parseia é erro de build. |
| Teoria que "mostra" construção sem `introduces` | A5 — exibir não é ensinar | Declare a construção em `introduces` (posição certa do grafo) **e** demonstre em bloco (A13d: declarar não é demonstrar). |
| Proibições globais no conteúdo (`eval`, `exec`, `compile`, `__import__`, `globals()`, `locals()`, `vars()`, `importlib.import_module`, `getattr`/`setattr` com nome não-literal, `__getattr__`/`__getattribute__`) | São `PY_FORBIDDEN_INVARIANTS` (`lang/python.ts:617`) — análise estática indecidível | Aparecem **só em prosa com crase**, nunca em bloco cercado (o bloco seria parseado e reprovado). |

## 6. Ambiente e processo — erros que NÃO são do conteúdo

| Sintoma | Diagnóstico | Ação exata |
|---|---|---|
| `npm ci` falha no worktree / Electron baixa binário à toa | Electron em worktree | Use os caminhos congelados: `NPM_CONFIG_LEGACY_PEER_DEPS=true ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` (medido: completa com sucesso). O binário do Electron pode ser copiado do checkout principal — nunca culpar o conteúdo. |
| Gates de repo falham no macOS | `sort`/`head`/etc. BSD quebram os scripts | `export PATH="/opt/homebrew/opt/coreutils/libexec/gnubin:$PATH"` antes de `bash tests/gate-lint.sh && bash tests/gate-build.sh` (medido nesta máquina — docs/18 §3.3). |
| `smoke.sh` degradado localmente | `smoke.sh` é CI: exige **bash ≥ 4** (corre no ubuntu); o bash 3.2 do macOS degrada e declara | Não usar `smoke.sh` como gate local de aula — ele é o teste de integração ponta a ponta da CI. |
| `coverage <slug> --limite 0` sai 2 / placar zerado | A armadilha do `--limite` (docs/16 §8): no `audit` ele limita a IMPRESSÃO (0 = audit tudo); no `coverage`/`requirements`/`revise` ele fatia o que é MEDIDO e **0 é uso incorreto (exit 2 medido)** | No `coverage`/`requirements`, rode **sem** `--limite` (ou com N ≥ 1). |
| Placar com `checagensNaoExecutadas > 0` (o `audit` de python imprime `avisos ... 0 <- sobre 1 checagem(ns) NAO EXECUTADA(S)`) | A bateria A13–A16 é javascript-only — na trilha Python ela **pula e declara** o id `A13-A16-NAO-RODOU` (docs/16 §9.2) | Leia o campo antes de confiar em qualquer `0` de aviso: zero-porque-não-rodou ≠ zero-porque-está-certo (aprovação por omissão, proibida). |
| Divergência contrato × disco | Ex.: `role: "consolidation"` não pertence ao enum da engine (docs/16 §3.7 ⚑); a aula 1 declara o axioma em `introduces`; o `requirements` dos 21 legados | **Declare no padrão ⚑** (no contrato ou no handoff), nunca resolva em silêncio. O gate vence; o documento é que se atualiza. |
| `track:challenge:verify` sem provas / exit inesperado | Exit code sozinho não distingue "passou" de "nada rodou" em Python (`unittest discover` com glob vazio sai 5) | Leia as linhas do veredito (solução PASSA ✓ / starter FALHA (ok) ✓ / testes declarados == testes no arquivo) — e lembre: sem `tests/__init__.py` nada roda. |
