# 20 — `SKILL.md`: frontmatter, roteador e regras permanentes

Fragmento do BUILD_SPEC. **Contrato, não racional.** Artefato coberto: `SK/SKILL.md` (um arquivo). Autoridade: `docs/00-contratos.md` §2, §2.1, §5.1, §6, §8, §9, §11. Onde este fragmento divergir de `00-contratos.md`, `00-contratos.md` vence e este arquivo é o errado.

Quem ler este fragmento tem de conseguir reescrever `SK/SKILL.md` do zero sem abrir o original.

---

## 1. O artefato

| Item | Valor |
|---|---|
| Caminho no repositório | `skills/study-method/SKILL.md` |
| Caminho instalado | `~/.claude/skills/study-method/SKILL.md` (pessoal) ou `<projeto>/.claude/skills/study-method/SKILL.md` |
| Formato | frontmatter YAML delimitado por `---` + corpo Markdown |
| Papel | **roteador**: nomeia os passos, aponta a `references/` de cada passo, e carrega as regras que valem em todo turno |
| Não é | manual, tutorial, catálogo de schemas, ou cópia de `references/` |
| Consumidor | o harness (nível 1 = frontmatter, sempre carregado; nível 2 = corpo, carregado ao disparar) |

**Duas premissas que determinam tudo abaixo** (`docs/research/01-agent-skills.md` §1.5 e §1.6): o campo `description` é o **único** insumo de roteamento; e o corpo **não é relido a cada turno** — o que não estiver nele pode não estar valendo no turno em que importa.

---

## 2. Frontmatter — campo a campo

Somente os **6 campos portáveis** do padrão aberto são permitidos. Os ~14 campos extras do Claude Code (`when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`, `hooks`, `paths`, `shell`) **não portam** e são erro rígido fora do Claude Code — nenhum deles pode aparecer.

| Campo | Estado neste artefato | Regra |
|---|---|---|
| `name` | **presente**, valor `study-method` | 1–64 chars, `^[a-z0-9-]+$`, sem hífen líder/final, sem `--`, **igual ao nome do diretório pai** |
| `description` | **presente** | 1–1024 chars, não vazia, terceira pessoa, diz **o quê + quando** |
| `license` | **ausente** | omitido: não há arquivo de licença no repositório e o campo não pode afirmar o que não existe |
| `compatibility` | **ausente** | omitido: a skill não exige ambiente além de bash 4+, coreutils, `jq` e `python3` da stdlib, já declarados no corpo/`references/` |
| `metadata` | **ausente** | omitido **por decisão de risco**: é um mapa aninhado, e frontmatter malformado faz a skill carregar com metadata vazia **em silêncio** — a `description` some da triagem e a skill nunca dispara |
| `allowed-tools` | **ausente** | omitido: marcado experimental, suporte varia, e a concessão vale só no turno da invocação |

Resultado normativo: o frontmatter tem **exatamente duas chaves**, `name` e `description`, nenhuma linha indentada, nenhum aninhamento YAML.

### 2.1 Contrato da `description`

| Requisito | Verificação |
|---|---|
| ≤1024 caracteres | contagem de caracteres da linha após `description:` |
| Terceira pessoa | não contém `I can`, `You can`, `Eu posso`, `Você pode usar` |
| Diz **o quê** | primeira oração descreve a função: tutor de estudo com memória entre sessões, ensina programação e a matemática que aparece nela por código executável, com desafios validados por teste |
| Diz **quando** | segunda parte enumera gatilhos em **pt-BR e en**, nas palavras que o usuário realmente diria |
| Gatilhos obrigatórios | `estudar` · `aprender` · `me ensina` · `tutor` · `aula` · `exercício` · `desafio` · `teach me` · `study session` · `challenge` |
| Diz **quando NÃO** | frase final que exclui trabalho normal de programação (escrever/depurar/revisar código de produção, dúvida pontual de sintaxe, explicar trecho sem estudo continuado) |
| Caso de uso principal primeiro | a listagem trunca em 1536 chars e o orçamento global é 1% da janela — o que importa vem antes |

A cláusula de exclusão é obrigatória: sem ela a skill dispara em qualquer conversa sobre programação, e uma skill que dispara sempre é indistinguível de uma que nunca dispara.

---

## 3. Estrutura do corpo — ordem normativa das seções

| # | Seção | Conteúdo obrigatório |
|---|---|---|
| 1 | `# study-method — o tutor` + uma linha | declara que o arquivo é roteador e que o detalhe vive nas `references/`, lidas sob demanda |
| 2 | `## Quem você é` | tutor de bate-papo em pt-BR; ensina programação **e a matemática que aparece nela**, aprendida **através de código executável**; analogia do repertório do aluno; objeto rodando; verificação por desafio; turno curto, uma pergunta por vez, silêncio depois de perguntar; regra de idioma (identificador em inglês, prosa em pt-BR; chave/enum/id/slug em inglês ASCII sem acento) |
| 3 | `## A máquina de estados — 9 passos, dois deles CONDICIONAIS` | os 9 nomes literais; a linha do fluxo normal **sem** os condicionais; o aviso de que ler os nove como fila é o erro mais caro; a tabela dos dois ramos |
| 4 | `## Roteamento — o que ler em cada passo` | tabela `passo → reference → scripts` (§5); a frase de que `seguranca.md` também se lê fora de passo |
| 5 | `## Regras permanentes` | as **88** regras do §9 de `00-contratos.md`, uma linha cada, agrupadas (§6) |
| 6 | `## Os scripts` | convenção de invocação + tabela dos 16 executáveis + tabela de exit codes (§7) |
| 7 | `## REQUEST/APPLY — exit 10 é pedido de julgamento, não erro` | o protocolo em 3 passos + as regras duras + os 4 usuários (§8) |

**A seção 5 vem antes das seções 6 e 7, e não depois.** Motivo mecânico: em auto-compaction o harness reanexa a invocação mais recente da skill mantendo os **primeiros ~5.000 tokens**. O que está no fim do corpo é o que se perde. Dentro da seção 5, pela mesma razão, os grupos `SEG` e `MEM · PRIV` — que concentram as 11 regras `†` — vêm **antes** dos demais.

---

## 4. Os dois passos condicionais — forma obrigatória

`setup_interview` e `load_docs` aparecem como **ramo em tabela**, nunca como item numerado de uma lista linear. Cada linha carrega a guarda e o comportamento quando a guarda é falsa.

| Ramo | Guarda (roda **somente** se) | Guarda falsa |
|---|---|---|
| `setup_interview`, ramo de `bootstrap` | não há `setup.json` em `$PWD` nem em ancestral até `$HOME` **inclusive**, **e** não há entrada `active` utilizável no registry, **e** não veio caminho válido na invocação | pula direto para `load_memory`; numa retomada normal **nunca** roda e a pergunta "quer criar um setup?" **não** é feita |
| `load_docs`, ramo entre `load_memory` e `open_session` | existe `<setup_root>/docs/` com ≥1 arquivo ingerível, **e** (`memory/docs-index.json` ausente **ou** algum arquivo mudou de tamanho/mtime) | pula para `open_session`; pasta vazia grava `docs_coverage: "none"` e **não é erro**; cache válido reusa o índice |

A linha de fluxo normal impressa no corpo é, literalmente, sem os condicionais:

`bootstrap` → `load_memory` → `open_session` → `plan_lesson` → `teach` ⇄ `challenge` → `close_session`

---

## 5. Tabela de roteamento — conteúdo normativo

Progressive disclosure: as `references/` custam **zero token** até serem abertas. Grafo de **um nível só** — o `SKILL.md` linka as 8 referências direto, e nenhuma referência linka outra.

| Passo | Reference a abrir antes de agir | Scripts do passo |
|---|---|---|
| `bootstrap` | `references/bootstrap.md` | `setup-list.sh --resolve "$PWD"`; `detect-toolchains.sh --cached` se `language.detected_at` > 30 d |
| `setup_interview` ⚠ CONDICIONAL | `references/bootstrap.md` | `setup-init.sh` → `readme-sync.sh --init`; `decisions-ask.sh setup-init` |
| `load_memory` | `references/bootstrap.md` | `memory-index.sh --verify` → `memory-digest.sh` |
| `load_docs` ⚠ CONDICIONAL | `references/docs-ingest.md` | `docs-index.sh` |
| `open_session` | `references/bootstrap.md` | `session-new.sh` |
| `plan_lesson` | `references/pedagogia.md` | `progress-update.sh --due` |
| `teach` | `references/pedagogia.md` · `references/analogy-bank.md` · `references/visualizacao.md` · `references/languages.md` | `research-new.sh`, `render-plot.py`, `setup-list.sh --find` |
| `challenge` | `references/challenge-protocol.md` · `references/languages.md` | `challenge-new.sh` → `challenge-verify.sh` |
| `close_session` | `references/seguranca.md` | `session-close.sh` → `memory-index.sh` → `progress-update.sh` → `readme-sync.sh` → `memory-compact.sh --if-due` |

Fora de passo: `references/seguranca.md` se lê antes de carregar qualquer material do aluno e antes de executar qualquer coisa.

Invariante: as 8 referências citadas são exatamente as 8 existentes em `SK/references/` — nenhuma citada que não exista, nenhuma existente que não seja citada.

---

## 6. As regras permanentes que TÊM de estar no corpo

Fonte literal: `docs/00-contratos.md` §9.1–§9.7. **88 regras, uma linha cada**, com o ID original preservado em negrito no início da linha (`- **C-1** …`) porque as evals referenciam os IDs.

| Grupo no corpo | IDs | Qtd |
|---|---|---|
| `### SEG — Segurança e execução` | `SEG-1`…`SEG-8` | 8 |
| `### MEM · PRIV — Memória e privacidade` | `MEM-1`…`MEM-7`, `PRIV-1`…`PRIV-7` | 14 |
| `### C — Como conversar` | `C-1`…`C-13` | 13 |
| `### AS — Anti-bajulação` | `AS-1`…`AS-12` | 12 |
| `### AN · ESC · ERR — Analogia, escada e resposta a erro` | `AN-1`…`AN-7`, `ESC-INICIAL`, `ESC-S`, `ESC-D`, `ESC-R`, `ERR-1`…`ERR-8` | 19 |
| `### DES — Desafios` | `DES-1`…`DES-9` | 9 |
| `### VIZ — Visualização` | `VIZ-1`…`VIZ-6` | 6 |
| `### BOOT — Bootstrap e arquivos` | `BOOT-1`…`BOOT-7` | 7 |
| **Total** | | **88** |

### 6.1 As 11 regras `†` — não rebaixáveis

`PRIV-1` · `PRIV-2` · `PRIV-3` · `PRIV-4` · `SEG-1` · `SEG-2` · `SEG-3` · `SEG-4` · `SEG-5` · `SEG-6` · `SEG-8`.

São críticas de segurança. Ficam no corpo com o marcador `†` colado ao ID (`- **SEG-1 †** …`) e **não podem, em nenhuma hipótese**, ser movidas para uma `reference/`, resumidas, fundidas com outra regra, ou colocadas depois do grupo `BOOT`. `SEG-7` **não** é `†`.

### 6.2 Redação das linhas de regra

Uma regra = uma linha física, imperativa, dirigida ao tutor, sem justificativa e sem exemplo. Terminologia de `00-contratos.md` §10 (`docs/` **do setup** × `docs/` **do repositório** nunca na forma nua; `setup.json` = manifesto do setup, `meta.json` = do desafio; `<setup_root>` em prosa). Regra permanente nunca é escrita como "passo N".

---

## 7. Seção dos scripts — conteúdo normativo

Preâmbulo obrigatório: todos em `scripts/` relativo ao diretório da skill; **o primeiro argumento posicional é sempre `<setup_root>`**, exceto `setup-init.sh` (`<path>`), `challenge-verify.sh` (`<challenge_dir>`), `detect-toolchains.sh` e `render-plot.py`; `scripts/lib/{common,json,sandbox}.sh` são apenas `source`, nunca executados; são **19** arquivos ao todo.

Tabela: uma linha por executável, com as flags que mudam comportamento — `setup-init.sh`, `setup-list.sh`, `session-new.sh`, `session-close.sh`, `research-new.sh`, `docs-index.sh`, `memory-index.sh`, `memory-digest.sh`, `memory-compact.sh`, `progress-update.sh`, `readme-sync.sh`, `challenge-new.sh`, `challenge-verify.sh`, `detect-toolchains.sh`, `render-plot.py`, `decisions-ask.sh` (16 linhas). A CLI literal é a de `00-contratos.md` §8.

Três comportamentos que o corpo precisa afirmar porque mudam a decisão do modelo:

| Script | Afirmação obrigatória |
|---|---|
| `memory-digest.sh` | **sempre exit 0** — falha de memória nunca impede a aula de começar |
| `challenge-verify.sh` | veredito `weak`/`rejected` sai **0**, com o veredito no stdout: reprovar o desafio não é erro do script |
| `readme-sync.sh` | idempotente |

Bloco de exit codes, literal: `0` ok · `1` erro de execução · `2` uso incorreto · `3` setup não encontrado · `4` recurso travado · `5` validação de schema falhou · `10` `needs_model_input`; 6–9 e 11+ reservados; `runner.sh` do desafio (`0/1/2/3`, mais `66` para `cd` falho) e `render-plot.py` são as duas exceções nomeadas.

**Proibição de nomes:** os dois scripts removidos do projeto não podem aparecer no arquivo — nem como citação, nem numa frase de negação. O invariante I-05 é um grep que precisa sair **vazio**. A frase correta é positiva: "são 19 arquivos ao todo; não invente script fora desta tabela".

---

## 8. Seção REQUEST/APPLY — conteúdo normativo

Afirmação de abertura: **nenhum script chama o modelo**; exit 10 é pedido de julgamento, não erro.

Ciclo, em três passos numerados:

1. ler o PEDIDO do stdout — `protocol`, `kind`, `request_id`, `response_schema`, `instructions_pt_br`, `payload`;
2. produzir a RESPOSTA repetindo `protocol`, `protocol_version`, `request_id` e `kind` **idênticos**, com `items[]` conforme o `response_schema`;
3. gravar em arquivo temporário e re-invocar **o mesmo script** com `--apply <arquivo.json>`.

Regras duras que o corpo precisa afirmar: a fase de PEDIDO **não escreve nada em disco**; o script valida a RESPOSTA contra schema **antes** de aplicar, logo o modelo nunca escreve no estado direto; campo fora do `response_schema` é rejeitado; `request_id` divergente sai **exit 5** sem aplicar nada; máximo **2** ciclos por invocação lógica, depois vale o caminho degradado que o script registra; nunca contornar o protocolo editando o arquivo-alvo à mão.

Os quatro usuários, com o `kind`: `memory-compact.sh` (`compact_facts`) · `session-close.sh` (`fill_session_fields`) · `challenge-verify.sh` (`classify_survivor`) · `docs-index.sh` (`select_sections`).

---

## 9. Orçamento de linhas

Teto de trabalho do corpo (fora do frontmatter): **~200 linhas**. Limite recomendado do padrão: < 500 linhas / < 5.000 tokens. Contagem: linhas do arquivo **menos** as 4 do frontmatter, ignorando brancos finais.

| Item | Linhas |
|---|---|
| 88 regras permanentes, uma por linha | 88 |
| 8 cabeçalhos de grupo + 1 branco antes de cada | 16 |
| Máquina de estados + tabela de roteamento | ~35 |
| Identidade, scripts, REQUEST/APPLY, títulos e brancos | ~55 |
| **Total medido** | **194** — folga **6** |

**Ordem de corte, se apertar:** (1) `### VIZ` (6 regras) → `references/visualizacao.md`; (2) `### AN · ESC · ERR` (19 regras) → `references/pedagogia.md`; (3) **nunca** `SEG`, nunca `MEM · PRIV`, nunca nenhuma das 11 `†`. Cortar prosa vem antes de cortar regra: juntar parágrafos quebrados em linhas físicas únicas reduz a contagem sem perder conteúdo, e foi o mecanismo usado para caber.

**Nota honesta sobre tokens.** O corpo mede ~21.500 caracteres, entre **6.000 e 6.500 tokens** — acima do limite *recomendado* de 5.000. O teto normativo deste projeto é o de **linhas** (`00-contratos.md` §9.8, invariante I-33): as 88 regras sozinhas custam ~4.200 tokens e foram orçadas assim de propósito. A mitigação implementada é de **ordem**, não de corte — ver §3.

## 10. Antipadrões proibidos neste artefato

| Antipadrão | Regra |
|---|---|
| Referência aninhada (`SKILL.md` → `a.md` → `b.md`) | grafo de **um nível**; nenhuma `reference/` cita outra |
| `description` vaga ou em 1ª/2ª pessoa | terceira pessoa, o quê + quando, com as palavras do usuário |
| `description` sem cláusula de exclusão | dispara em qualquer conversa sobre programação |
| Regra permanente escrita como "passo N" | ela vale em todo turno; passo é outra coisa |
| Os 9 passos como lista numerada contínua | os dois condicionais são **ramo**, com a guarda na mesma linha |
| Campo de frontmatter fora dos 6 portáveis | erro rígido fora do Claude Code |
| Detalhe operacional no corpo | vai para `references/`, que custa zero até ser aberta |
| Citar script que não existe na tabela §8 | inclusive numa frase de negação (I-05) |
| Path estilo Windows | sempre `/` |

---

## 11. Verificações do gate sobre este artefato

| ID | Invariante | Estado medido |
|---|---|---|
| I-01 | Os 9 nomes de passo literais presentes; nenhum dos 6 nomes revogados pela tabela §2.2 de `00-contratos.md` | ✅ |
| I-02 | `setup_interview` e `load_docs` com "CONDICIONAL" ou a guarda na mesma linha | ✅ |
| I-03 | O nome de campo revogado para o estado da sessão (§4.1 de `00-contratos.md`) não aparece | ✅ |
| I-04 | Nenhum dos 5 nomes revogados do §11 de `00-contratos.md` (diretório oculto, manifesto renomeado, cache renomeado, constante de bootstrap, perfil em maiúsculas) aparece | ✅ |
| I-05 | Os dois scripts removidos ausentes do arquivo | ✅ |
| I-33 | Corpo ≤ 200 linhas **e** contém os 88 IDs de regra | ✅ 194 linhas, 88/88 IDs, 0 duplicado |
| I-34 | Toda `reference/` linkada direto do `SKILL.md`, uma só profundidade | ✅ do lado do `SKILL.md` (8 citadas = 8 existentes) |
| — | `name` `^[a-z0-9-]+$`, ≤64, igual ao diretório | ✅ `study-method` |
| — | `description` ≤ 1024 caracteres | ✅ 907 |
| — | Frontmatter só com campos portáveis | ✅ apenas `name` e `description` |
| — | As 11 regras `†` presentes e marcadas | ✅ |
