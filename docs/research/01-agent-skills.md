# Agent Skills — estado da arte (2026-08-23)

Documento de pesquisa operacional para quem vai **construir** uma Agent Skill educacional. Foco: fatos verificáveis em fonte primária, não prosa de marketing. Cada afirmação não-óbvia está marcada **[FATO]** (com fonte na seção Fontes) ou **[INFERÊNCIA]** (dedução minha, sem fonte direta).

## 0. Linha do tempo e escopo desta pesquisa

- **16 out 2025** — Anthropic lança Agent Skills como feature (Claude Code, Claude API, claude.ai), via o post de engenharia "Equipping agents for the real world with Agent Skills". **[FATO]**
- **18 dez 2025** — Anthropic publica Agent Skills como **open standard** independente de fornecedor, com especificação pública em `agentskills.io` e biblioteca de referência `skills-ref` para validação. A cobertura do lançamento (SiliconANGLE, VentureBeat) cita como parceiros da "skills library" apenas Atlassian, Canva, Notion, Figma, Cloudflare, Stripe e Zapier, e como adotantes do padrão Microsoft (VS Code, GitHub), Cursor, Goose, Amp, OpenCode e OpenAI (ChatGPT/Codex); a métrica de adoção citada nessa cobertura é "20k+ estrelas no GitHub" do repositório de skills — nenhuma das duas fontes usa a expressão "40+ clientes" nem cita Databricks, Snowflake ou Gemini CLI como adotantes nesse momento. **[FATO]**
- **Situação em 2026-08-23** (consultada nesta pesquisa) — o *client showcase* da página inicial de `agentskills.io` lista produtos/harnesses hoje compatíveis com o padrão; contagem própria feita nesta pesquisa: 46 logos, incluindo Claude Code, Claude, Cursor, GitHub Copilot, VS Code, ChatGPT & Codex, Gemini CLI, Goose, Databricks Genie Code e Snowflake Cortex Code. Essa lista é dinâmica e sem data de publicação própria — **não** é parte da cobertura de lançamento de 18/12/2025 acima; é a origem provável do número "40+" que aparecia (sem citação) na versão anterior deste documento. **[FATO]**
- Esta pesquisa usa como fontes primárias: `code.claude.com/docs/en/skills` (Claude Code), `platform.claude.com/docs/en/agents-and-tools/agent-skills/*` (Claude API/best-practices), `code.claude.com/docs/en/agent-sdk/skills` (Claude Agent SDK) e `agentskills.io/specification` (padrão aberto). Não existe neste ambiente uma skill instalada `claude-code-guide` (existe um *agente* subagent-type com esse nome, que não é a mesma coisa e não foi invocado) — a pesquisa foi feita diretamente contra a documentação oficial.

---

## 1. Anatomia de uma Agent Skill

### 1.1 Estrutura de diretório mínima **[FATO]**

```
skill-name/
├── SKILL.md          # obrigatório: frontmatter YAML + instruções Markdown
├── scripts/           # opcional: código executável (bash roda, nunca lê o conteúdo)
├── references/        # opcional: docs de apoio, carregadas sob demanda
├── assets/            # opcional: templates, schemas, imagens
└── ...                # qualquer outro arquivo
```

O nome do diretório é, por padrão, o identificador da skill (vira o comando `/nome-da-pasta` no Claude Code).

### 1.2 Frontmatter — núcleo do padrão aberto (agentskills.io)

Estes 6 campos são o que funciona em **qualquer** implementação que siga o padrão Agent Skills (claude.ai upload, Skills API, `package_skill.py`, e qualquer harness de terceiros compatível):

| Campo | Obrigatório | Regras |
|---|---|---|
| `name` | Sim | 1–64 caracteres. Só `a-z`, `0-9`, `-`. Não pode começar/terminar com `-`, nem ter `--`. **Deve ser igual ao nome do diretório pai** (regra do padrão aberto — ver §5 sobre a exceção do Claude Code). |
| `description` | Sim | 1–1024 caracteres, não-vazia. Deve descrever o quê a skill faz **e** quando usá-la. |
| `license` | Não | Nome da licença ou referência a um arquivo de licença embutido. |
| `compatibility` | Não | Até 500 caracteres. Requisitos de ambiente (produto-alvo, pacotes de sistema, acesso à rede). Maioria das skills não precisa. |
| `metadata` | Não | Mapa livre string→string para dados próprios de tooling (ex.: `author`, `version`). O harness não age sobre esse conteúdo. |
| `allowed-tools` | Não | String separada por espaço com ferramentas pré-aprovadas. Marcado como **experimental** — suporte varia entre implementações. |

**[FATO]** Fora do Claude Code (upload no claude.ai, Skills API, `package_skill.py`), usar qualquer campo além desses 6 é **erro rígido**, não silenciosamente ignorado:
```
Unexpected key(s) in SKILL.md frontmatter: argument-hint. Allowed properties are: allowed-tools, compatibility, description, license, metadata, name
```

### 1.3 Frontmatter — extensões exclusivas do Claude Code **[FATO]**

O Claude Code aceita todos os 6 campos acima **mais** estes, que não existem no padrão aberto e não portam para outros harnesses:

| Campo | Função |
|---|---|
| `when_to_use` | Contexto adicional de gatilho, concatenado à `description` na listagem de skills. |
| `argument-hint` | Dica de autocomplete para argumentos esperados (`[issue-number]`). |
| `arguments` | Lista de argumentos posicionais nomeados para substituição `$nome`. |
| `disable-model-invocation` | `true` = só humano invoca via `/nome`; Claude nunca decide sozinho. |
| `user-invocable` | `false` = só o modelo invoca; some do menu `/`. |
| `disallowed-tools` | Remove ferramentas do pool disponível enquanto a skill está ativa. |
| `model` | Override de modelo só para o turno em que a skill roda. |
| `effort` | Override de nível de esforço (`low`…`max`) para o turno. |
| `context: fork` | Roda a skill num subagente isolado em vez de inline. |
| `agent` | Qual tipo de subagente usar com `context: fork` (default `general-purpose`). |
| `background` | Com `context: fork`, `false` = espera o resultado no mesmo turno em vez de rodar em background (default `true`). |
| `hooks` | Hooks registrados enquanto a skill está ativa. |
| `paths` | Globs que restringem quando a skill é carregada automaticamente (skill fica escopada a arquivos específicos). |
| `shell` | `bash` (default) ou `powershell`, para blocos de injeção `` !`comando` ``. |

Todos os campos são opcionais; **apenas `description` é recomendado** (sem ela Claude não sabe quando aplicar a skill — cai no primeiro parágrafo do corpo como fallback, o que é frágil).

### 1.4 Limites de tamanho — atenção, são DOIS limites diferentes **[FATO]**

1. **Limite de validação do campo `description`**: 1024 caracteres (regra do frontmatter, spec + Claude Code).
2. **Limite de listagem** (só Claude Code): `description` + `when_to_use` combinados são truncados em **1536 caracteres** na listagem de skills que entra no system prompt — configurável via `skillListingMaxDescChars`. Por isso a doc recomenda "coloque o caso de uso principal primeiro".
3. Orçamento total da listagem de skills = **1% da janela de contexto do modelo** por padrão (`skillListingBudgetFraction`). Se estourar, o Claude Code corta descrições inteiras (não trunca todas igualmente) — as skills menos invocadas perdem a descrição primeiro, viram `name-only`.
4. **Corpo do `SKILL.md`**: recomendado **abaixo de 500 linhas** / abaixo de ~5.000 tokens. Acima disso, mover para `references/`.
5. Nível 1 (metadata) custa **~100 tokens por skill**, sempre carregado.
6. `name`: 64 caracteres. `compatibility`: 500 caracteres.

### 1.5 Como a `description` determina descoberta/roteamento **[FATO]**

- É o **único** campo usado pelo modelo para decidir se dispara a skill — com potencialmente 100+ skills instaladas, a description é o filtro de triagem inteiro.
- **Deve** ser escrita em **terceira pessoa** (é injetada no system prompt; inconsistência de ponto de vista prejudica a descoberta):
  - Bom: `"Processes Excel files and generates reports"`
  - Ruim: `"I can help you process Excel files"` / `"You can use this to..."`
- Deve conter o QUÊ e o QUANDO, com palavras-chave específicas que o usuário realmente diria.
- Exemplo bom real da doc oficial:
  ```yaml
  description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.
  ```
- Exemplos ruins citados explicitamente: `"Helps with documents"`, `"Processes data"`, `"Does stuff with files"`.
- Se o YAML do frontmatter estiver malformado, a skill carrega com metadata vazia — `/nome` ainda funciona manualmente, mas Claude nunca vê a `description` para triagem automática (silencioso; só aparece com `--debug`).

### 1.6 Ciclo de vida do conteúdo dentro da sessão **[FATO]**

- Quando invocada, o `SKILL.md` renderizado entra como **uma mensagem única** e fica na conversa pelo resto da sessão. O Claude Code **não relê o arquivo a cada turno** — logo, instruções que devem valer o tempo todo precisam ser escritas como "regra permanente", não como "passo único".
- `allowed-tools` vale só para o turno em que a skill foi invocada; a concessão some ao próximo prompt do usuário (mesmo que o conteúdo da skill continue em contexto).
- Reinvocar uma skill cujo conteúdo renderizado é idêntico ao já carregado só gera uma nota "já carregada", não duplica; se mudou (argumentos diferentes, output de comando dinâmico diferente), o conteúdo completo é reanexado.
- Em auto-compaction, o Claude Code reanexa a invocação mais recente de cada skill, mantendo os primeiros 5.000 tokens; o orçamento combinado para skills reanexadas é **25.000 tokens** — skills mais antigas podem ser descartadas por completo.

---

## 2. Progressive disclosure

### 2.1 Os três níveis **[FATO]**

| Nível | Quando carrega | Custo de token | Conteúdo |
|---|---|---|---|
| 1 — Metadata | Sempre, no startup | ~100 tokens/skill | `name` + `description` do frontmatter |
| 2 — Instruções | Quando a skill é disparada | < 5.000 tokens (recomendado) | Corpo do `SKILL.md` |
| 3+ — Recursos | Sob demanda | Zero até ser acessado | `references/*.md` (lidos), `scripts/*` (executados — só o output entra em contexto, nunca o código) |

Mecanismo real: o modelo roda `bash: cat skill/SKILL.md` para ler o Nível 2; se o corpo referencia outro arquivo, o modelo decide ler com outro `cat`/`Read`; se referencia um script, o modelo o executa e só recebe stdout/stderr. **Não há limite prático para conteúdo empacotado** — arquivos não lidos custam zero tokens, então uma skill pode empacotar documentação de API extensa sem penalidade, desde que não seja lida.

### 2.2 Hierarquia recomendada **[FATO]**

```
SKILL.md enxuto (visão geral + navegação, como um índice)
  → references/*.md (documentação detalhada, 1 nível de profundidade)
    → scripts/*.py|sh (executados via bash; não são "lidos")
      → assets/* (templates, schemas — usados como dado, não como instrução)
```

Três padrões de organização documentados oficialmente:

1. **Guia de alto nível + referências**: SKILL.md com "quick start" e links tipo `Para detalhes completos, veja [REFERENCE.md](REFERENCE.md)`.
2. **Organização por domínio**: cada arquivo de referência cobre um domínio (`reference/finance.md`, `reference/sales.md`) para não carregar contexto irrelevante quando a pergunta é só sobre um domínio.
3. **Detalhes condicionais**: mostra o caminho comum inline, empurra o caso avançado para um arquivo separado ("Para tracked changes, veja REDLINING.md").

### 2.3 Antipadrão documentado: referências aninhadas **[FATO]**

> "Claude may partially read files when they're referenced from other referenced files. When encountering nested references, Claude might use commands like `head -100` to preview content rather than reading entire files, resulting in incomplete information."

Regra: **mantenha as referências a um nível de profundidade do SKILL.md**. Todo arquivo de referência deve ser linkado diretamente do `SKILL.md`, nunca em cadeia (`SKILL.md → advanced.md → details.md`). Arquivos de referência com mais de 100 linhas devem ter um sumário (table of contents) no topo, porque o modelo pode fazer leitura parcial mesmo em arquivos de primeiro nível.

---

## 3. Localizações de instalação e precedência

### 3.1 Onde skills vivem (Claude Code) **[FATO]**

| Local | Caminho | Escopo |
|---|---|---|
| Enterprise | via managed settings (`/etc/claude-code/.claude/skills/` no Linux) | Todos os usuários da organização |
| Personal | `~/.claude/skills/<nome>/SKILL.md` | Todos os projetos do usuário |
| Project | `.claude/skills/<nome>/SKILL.md` | Só este projeto |
| Plugin | `<plugin>/skills/<nome>/SKILL.md` | Onde o plugin está habilitado, namespace `plugin:skill` |
| Nested | `<subdir>/.claude/skills/<nome>/SKILL.md` abaixo do diretório de trabalho | Carrega quando Claude lê/edita arquivo dentro daquele subdiretório |
| Synced | `~/.claude/skills/synced/` (nome de pasta reservado) | Baixado de skills habilitadas na conta claude.ai |

### 3.2 Regras de precedência quando nomes colidem **[FATO]**

- Entre níveis: **enterprise > personal > project** (ex.: `deploy` existe em `~/.claude/skills/` e em `.claude/skills/` do projeto → `/deploy` roda a pessoal).
- Uma skill em qualquer nível local sobrepõe uma **bundled skill** de mesmo nome, mas não seus aliases (ex.: um `code-review` de projeto substitui o bundled `/code-review`, mas `/review` — alias do bundled — continua rodando o bundled).
- Skills de **plugin** usam namespace `plugin-name:skill-name`, então nunca colidem com outros níveis.
- Se existir `.claude/commands/deploy.md` **e** `.claude/skills/deploy/SKILL.md`, **a skill vence**.
- Qualquer skill/comando local sobrepõe uma skill **sincronizada** da conta claude.ai de mesmo nome.
- Skills aninhadas (nested) com nome colidente **não** se sobrepõem — ambas ficam disponíveis; a nested ganha um nome qualificado por diretório (`apps/web:deploy`), e o nome não qualificado (`/deploy`) roda a da raiz do projeto, mas o Claude Code anexa ao conteúdo carregado uma instrução para também invocar a variante cujo diretório bate com os arquivos em uso.

### 3.3 Descoberta e live-reload **[FATO]**

- Skills de projeto carregam de `.claude/skills/` no diretório onde a sessão começou **e em todo diretório-pai até a raiz do repositório**.
- Skills aninhadas abaixo do diretório inicial **não** carregam no startup — só na primeira vez que Claude lê/edita um arquivo dentro daquele subdiretório, e ficam disponíveis pelo resto da sessão.
- `--add-dir` / `/add-dir` é uma exceção ao comportamento normal de "grant de acesso a arquivo": ele também carrega `.claude/skills/`, `.claude/commands/` **e** `.claude/agents/` (subagentes) do diretório adicionado — os três são carregados automaticamente no momento em que o diretório é adicionado, mesma exceção para todos. O que falta é *live-reload* dessas duas últimas pastas: `.claude/agents/` e o `.claude/commands/` de um `--add-dir` não são vigiados por mudança de arquivo, então só uma edição ou criação **posterior** de um subagente/command ali exige reiniciar a sessão para entrar em vigor (skills sob `--add-dir` continuam com live-reload normal, ver bullet abaixo). O setting `permissions.additionalDirectories` **não** tem esse efeito — só dá acesso a arquivo, não carrega skills, commands nem subagentes.
- Mudanças em `SKILL.md` sob `~/.claude/skills/`, `.claude/skills/` do projeto, ou dentro de um `--add-dir` são detectadas **na sessão corrente, sem restart**. Um diretório de skills totalmente novo (que não existia no início da sessão) exige restart.
- Cowork e sessões cloud **não** leem `~/.claude/skills/` da máquina local — carregam skills habilitadas na conta claude.ai, sincronizadas no início da sessão, mais skills de projeto commitadas no repo clonado.

### 3.4 Claude Agent SDK — especificidades **[FATO]**

- Skills são descobertas via `settingSources` (TS) / `setting_sources` (Python) — se você zera essa lista, **skills não carregam**, mesmo que os arquivos existam.
- Controle de quais skills o modelo pode invocar é via opção `skills`: `"all"`, lista de nomes exatos, ou `[]` (nenhuma). Não aceita wildcard (`docs:*` é rejeitado antes mesmo da sessão iniciar).
- Diferente de subagentes (que têm API programática via opção `agents`), **skills só existem como arquivo em disco** no SDK — não há registro programático.
- `allowed-tools` do frontmatter só é honrado quando se usa o Claude Code CLI diretamente; em sessões via SDK, a aprovação de ferramentas para skills se gerencia pela opção `allowedTools`/`allowed_tools` da própria `query()`, não pelo frontmatter.

---

## 4. Skills vs subagentes vs slash commands vs MCP

### 4.1 Slash commands foram fundidos em skills **[FATO]**

> "Custom commands have been merged into skills. A file at `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md` both create `/deploy` and work the same way."

Arquivos legados em `.claude/commands/` continuam funcionando (mesmo frontmatter, exceto `name` e `paths`, que são ignorados nesse formato), mas **skill é a forma recomendada** porque suporta arquivos de apoio e controle de quem invoca. Na prática, "slash command" hoje é só uma skill sem diretório de suporte.

### 4.2 Matriz de decisão **[FATO]**

| Mecanismo | Para quê serve | Quem decide invocar | Isolamento de contexto | Acessa mundo externo? |
|---|---|---|---|---|
| **Skill (inline)** | Conhecimento processual reutilizável — workflows, convenções, checklists | Claude (auto, via `description`) ou humano (`/nome`) | Nenhum — injeta na conversa atual | Só via ferramentas já disponíveis na sessão (Bash, MCP tools referenciadas) |
| **Skill com `context: fork`** | Tarefa auto-contida que não deve poluir a conversa principal, mas não precisa de prompt de sistema customizado | Mesmo mecanismo de trigger de uma skill normal | Roda num subagente; conteúdo da skill vira o prompt da tarefa | Idem — herda ferramentas do agente escolhido em `agent:` |
| **Subagente dedicado (`.claude/agents/`)** | Trabalho complexo e auto-contido com prompt de sistema próprio, modelo/custo diferente, tools restritas | Claude delega, ou usuário aciona | Contexto isolado desde o início; só retorna resumo | Ferramentas configuráveis por subagente |
| **MCP** | Conectar Claude a serviços externos reais (GitHub, banco de dados, Slack) | Ferramenta chamada quando o modelo decide | N/A — é uma ferramenta, não um agente | Sim — é literalmente para isso que existe |

Resumo qualitativo **[INFERÊNCIA a partir de fontes secundárias]**: "MCP é o encanamento (conecta a serviços externos); Skill é a instrução (ensina como fazer); Subagente é isolamento de execução; Slash command hoje é só uma skill com invocação manual privilegiada."

### 4.3 Skill pode invocar scripts? Sim — e é o padrão preferido **[FATO]**

- Scripts em `scripts/` são executados via Bash; só o **output** entra em contexto, nunca o código-fonte do script. Isso é mais eficiente do que pedir para Claude gerar código equivalente on-the-fly.
- Diretriz oficial: prefira scripts prontos para operações determinísticas ("resolva, não terceirize" — trate erros explicitamente no script em vez de deixar Claude decidir o que fazer quando falha).
- Deixe explícito na instrução se o script deve ser **executado** ("Run `analyze_form.py`") ou **lido como referência** ("See `analyze_form.py` for the algorithm") — são intenções diferentes.

### 4.4 Skill pode disparar subagente? Sim, de duas formas inversas **[FATO]**

| Abordagem | Quem controla o system prompt | O que é injetado |
|---|---|---|
| Skill com `context: fork` + `agent:` | O tipo de agente escolhido (`Explore`, `Plan`, `general-purpose`, ou custom) | O corpo do `SKILL.md` vira a tarefa/prompt do subagente |
| Subagente com campo `skills:` no seu frontmatter | O próprio subagente (system prompt custom) | Conteúdo **completo** das skills listadas é pré-carregado no startup do subagente (não é preload de descrição — é o corpo inteiro) |

`context: fork` só faz sentido para skills com **instruções acionáveis explícitas**; uma skill que só contém diretrizes gerais ("use estas convenções de API") roda no subagente sem tarefa de fato e retorna sem output útil.

Uma skill com `disable-model-invocation: true` **não pode** ser pré-carregada no campo `skills:` de um subagente (restrição de segurança).

### 4.5 Referenciando ferramentas MCP dentro de uma skill **[FATO]**

Use sempre o nome totalmente qualificado `ServerName:tool_name` (ex.: `BigQuery:bigquery_schema`, `GitHub:create_issue`). Sem o prefixo do servidor, Claude pode falhar em localizar a ferramenta quando múltiplos servidores MCP estão ativos.

---

## 5. Portabilidade entre harnesses

### 5.1 O que é núcleo do padrão vs específico do Claude Code

O padrão aberto (`agentskills.io/specification`) define **exatamente 6 campos válidos**: `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`. Qualquer outro campo de frontmatter (todos os listados em §1.3) é **extensão do Claude Code** e:

- Funciona normalmente dentro do Claude Code (qualquer nível — projeto, pessoal, plugin).
- **Falha com erro rígido** ao empacotar/subir a skill para claude.ai, Skills API, ou via `package_skill.py`.

### 5.2 Divergência sutil na regra de `name`

- **Padrão aberto**: `name` **deve ser idêntico** ao nome do diretório pai da skill.
- **Claude Code (skill pessoal ou de projeto)**: `name` é só um *display label* mostrado na listagem — o comando (`/nome`) vem do **nome do diretório**, independente do que está no frontmatter. Só em skills de **plugin** o campo `name` de fato determina o segmento final do comando.

Consequência prática: uma skill escrita para portabilidade deve manter `name` no frontmatter igual ao nome do diretório, mesmo que o Claude Code não obrigue isso — senão o comportamento diverge entre harnesses.

### 5.3 Features de corpo que NÃO portam **[FATO]**

Recursos de corpo específicos do Claude Code que não funcionam em claude.ai chat, na Claude API, nem presumivelmente em outros harnesses do padrão aberto:

- Injeção de contexto dinâmico `` !`comando` `` (roda shell antes de enviar o conteúdo ao modelo).
- Substituições `$ARGUMENTS`, `$0`/`$1`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`.
- `context: fork` (subagentes) e `hooks` embutidos na skill.

O corpo em si (Markdown após o frontmatter) **não tem restrição de formato** no padrão aberto — "there are no format restrictions. Write whatever helps agents perform the task effectively" — mas qualquer coisa que dependa de um desses mecanismos de execução do Claude Code vira texto literal (não expandido) em outro harness.

### 5.4 Recomendação prática para escrever uma skill portátil **[INFERÊNCIA a partir dos fatos acima]**

1. Restrinja o frontmatter aos 6 campos do padrão; use `metadata` para qualquer dado extra específico de tooling em vez de inventar chaves novas.
2. Não dependa de `` !`comando` `` para buscar dados dinâmicos — em vez disso, instrua o próprio agente a rodar o comando via sua ferramenta de shell padrão (funciona em qualquer harness com acesso a bash).
3. Coloque lógica executável em `scripts/` (Python/Bash/JS puro), não em blocos de injeção de shell do Claude Code.
4. Mantenha `name` do frontmatter == nome do diretório.
5. Evite depender de subagentes custom (`context: fork`, `agent:`) para a skill funcionar; se precisar de isolamento, documente isso como requisito de ambiente via `compatibility`, não como mecanismo obrigatório.

---

## 6. Boas práticas comprovadas de escrita de skills

Fontes: `platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices` (oficial, com checklist explícito ao final) para §6.1–§6.5 e §6.7–§6.9; `code.claude.com/docs/en/skills`, seção "Run evals with skill-creator", para o plugin de eval automatizado citado em §6.6 — `best-practices` descreve o processo eval-driven mas registra explicitamente que "there is not currently a built-in way to run these evaluations", ou seja, não menciona o plugin `skill-creator`. Todos os itens abaixo são **[FATO]** (citados ou parafraseados das docs).

### 6.1 Concisão é a regra de ouro
- "The context window is a public good." Cada token da skill compete com histórico de conversa e outras skills.
- Assunção padrão: **Claude já é muito inteligente** — só adicione o que ele realmente não sabe. Teste cada parágrafo: "essa explicação se justifica pelo custo em tokens?"
- Exemplo bom (~50 tokens) vs exemplo ruim (~150 tokens, explicando o que é um PDF) está documentado lado a lado oficialmente — o critério é: não explique conceitos que o modelo já conhece.

### 6.2 Calibre o "grau de liberdade" à fragilidade da tarefa
- **Alta liberdade** (instrução em texto, várias abordagens válidas): usar heurísticas, ex. processo de code review.
- **Liberdade média** (pseudocódigo/script parametrizável): existe um padrão preferido mas cabe variação.
- **Baixa liberdade** (script exato, poucos ou nenhum parâmetro): operação frágil, sequência exata obrigatória, ex. migração de banco de dados — "Run exactly this script... Do not modify the command or add additional flags."
- Analogia oficial: "ponte estreita com precipício dos dois lados" (baixa liberdade, guardrails exatos) vs "campo aberto sem perigo" (alta liberdade, direção geral).

### 6.3 Teste com todos os modelos-alvo
- O que funciona perfeito para Opus pode precisar de mais detalhe para Haiku. Testar explicitamente com Haiku/Sonnet/Opus é item do checklist oficial.

### 6.4 Nomenclatura
- Forma preferida: **gerúndio** (`processing-pdfs`, `analyzing-spreadsheets`, `managing-databases`).
- Alternativas aceitáveis: substantivo composto (`pdf-processing`) ou orientado a ação (`process-pdfs`).
- Evitar: nomes vagos (`helper`, `utils`, `tools`), genéricos demais (`documents`, `data`, `files`), palavras reservadas (`anthropic-helper`, `claude-tools`).
- **Atenção à origem de cada regra de `name`**: a proibição de palavras reservadas acima é da validação de `platform.claude.com` (Claude Skills / Skills API), que soma "cannot contain XML tags" e "cannot contain reserved words: anthropic, claude" às regras de tamanho/charset. O padrão aberto `agentskills.io/specification` **não tem** essa restrição — suas únicas regras de `name` são: ≤ 64 caracteres, só `a-z`/`0-9`/hífen, sem hífen líder/final, sem hífen duplo, e igual ao nome do diretório pai (ver §5.2). Uma skill pensada para portabilidade pode usar `anthropic-helper` como nome fora do Claude API/claude.ai, mas ele falhará a validação lá.

### 6.5 Workflows e feedback loops
- Para tarefas complexas, forneça um **checklist copiável** que Claude marca conforme avança (`- [ ] Step 1...`) — funciona tanto para skills com código quanto sem código.
- Padrão de **feedback loop**: rodar validador → corrigir erros → repetir. Melhora muito a qualidade do output; funciona tanto com um script validador quanto com um documento de estilo que o próprio Claude usa como checklist de revisão.
- Padrão **plan-validate-execute** para operações de alto risco/em lote: analisar → criar arquivo de plano estruturado (ex. `changes.json`) → validar o plano com script → executar → verificar. Evita que o modelo aplique mudanças conflitantes ou destrutivas sem checagem intermediária.

### 6.6 Desenvolvimento orientado a avaliação (eval-driven)
- **Construa avaliações ANTES de escrever documentação extensa.** Sequência recomendada: (1) rodar Claude na tarefa sem a skill e documentar falhas específicas → (2) criar 3+ cenários de teste que capturem essas falhas → (3) medir baseline sem skill → (4) escrever só o conteúdo mínimo que resolve as falhas → (5) iterar comparando com o baseline.
- Existe uma ferramenta oficial para automatizar esse loop, documentada em `code.claude.com/docs/en/skills` (não em `best-practices` — ver nota de fontes no início da §6): plugin **`skill-creator`** (`/plugin install skill-creator@claude-plugins-official`), que roda casos de teste em subagentes isolados, grava `evals/evals.json`, gera `grading.json` e `benchmark.json` (pass rate / tempo / tokens, com-skill vs sem-skill), faz comparação A/B cega entre versões, e sugere ajustes de `description` medindo taxa de acerto em prompts que deveriam/não deveriam disparar a skill.

### 6.7 Conteúdo e terminologia
- Evite informação sensível ao tempo (ex. "antes de agosto de 2025 use a API antiga") — em vez disso, use uma seção "old patterns"/`<details>` colapsável para contexto histórico sem poluir o fluxo principal.
- Use terminologia **consistente** o tempo todo (sempre "API endpoint", nunca alternar com "URL"/"rota"/"caminho") — inconsistência atrapalha o parsing do modelo.

### 6.8 Scripts: resolva, não terceirize
- Scripts devem tratar condições de erro explicitamente em vez de deixar Claude decidir o que fazer quando falham.
- Evite "voodoo constants" (lei de Ousterhout) — todo valor de configuração deve ser justificado em comentário (`REQUEST_TIMEOUT = 30  # requisições HTTP tipicamente completam em 30s`), não mágico (`TIMEOUT = 47  # Why 47?`).
- Scripts prontos são preferíveis a pedir para Claude gerar código equivalente: mais confiáveis, economizam tokens, garantem consistência entre execuções.
- Nunca assuma que um pacote está instalado — declare a dependência explicitamente na instrução (`pip install pypdf` antes de usar).

### 6.9 Checklist oficial completo (pré-publicação de uma skill)

**Qualidade central:** description específica e com palavras-chave · description cobre o quê e quando · corpo do SKILL.md < 500 linhas · detalhes extras em arquivos separados · nenhuma informação sensível ao tempo (ou isolada em seção "old patterns") · terminologia consistente · exemplos concretos, não abstratos · referências a arquivos com 1 nível de profundidade · progressive disclosure usado apropriadamente · workflows com passos claros.

**Código e scripts:** scripts resolvem problemas em vez de terceirizar para Claude · tratamento de erro explícito · sem "voodoo constants" · pacotes necessários listados e verificados como disponíveis · scripts documentados · sem paths estilo Windows · passos de validação para operações críticas · feedback loops incluídos onde a qualidade importa.

**Testes:** pelo menos 3 avaliações criadas · testado com Haiku, Sonnet e Opus · testado com cenários de uso real · feedback de equipe incorporado (se aplicável).

---

## 7. Antipadrões documentados explicitamente

Todos abaixo vêm da seção "Anti-patterns to avoid" e conteúdo correlato da doc oficial de best practices — **[FATO]**:

| Antipadrão | Por que é ruim | Correção |
|---|---|---|
| `description` vaga ("Helps with documents", "Processes data", "Does stuff with files") | Não dá sinal suficiente para o modelo escolher a skill certa entre 100+ | Descrever o quê + quando, com palavras-chave que o usuário realmente diria |
| `description` em 1ª/2ª pessoa ("I can help...", "You can use this to...") | Injetada no system prompt; ponto de vista inconsistente prejudica a descoberta | Sempre 3ª pessoa |
| Paths estilo Windows (`scripts\helper.py`) | Quebra em sistemas Unix | Sempre forward slash, mesmo escrevendo no Windows |
| Oferecer opções demais ("use pypdf, ou pdfplumber, ou PyMuPDF, ou...") | Confunde o modelo, sem ganho | Forneça um default claro + uma "escape hatch" só para o caso alternativo relevante |
| Referências aninhadas (SKILL.md → advanced.md → details.md) | Modelo faz leitura parcial (`head -100`) e perde informação | Manter 1 nível de profundidade a partir do SKILL.md |
| Arquivo de referência longo sem sumário | Modelo não enxerga o escopo completo ao pré-visualizar | Tabela de conteúdo no topo de qualquer referência > 100 linhas |
| Informação sensível ao tempo hardcoded ("antes de agosto de 2025 use X") | Fica errado sozinha com o tempo | Seção "old patterns" isolada, ou omitir |
| Terminologia inconsistente (alternar "endpoint"/"URL"/"rota") | Atrapalha o parsing e a aplicação consistente da regra | Escolher um termo e manter |
| Scripts que terceirizam erro para Claude (`open(path).read()` sem try/except) | Menos confiável, gera comportamento imprevisível | Tratar erro explicitamente dentro do script |
| Constantes mágicas não documentadas (`TIMEOUT = 47`) | Ninguém sabe justificar o valor, nem o modelo | Comentar a justificativa de cada constante |
| Nomes vagos/reservados (`helper`, `utils`, `tools`, `anthropic-helper`) | Falha de validação (reservados) ou impossível de discutir/organizar (vagos) | Gerúndio ou nome-substantivo específico do domínio |
| SKILL.md > 500 linhas sem split | Cada token no corpo é custo recorrente assim que a skill carrega | Mover detalhe para `references/`, manter só overview + navegação no SKILL.md |
| Assumir que uma ferramenta/pacote está instalado | Falha silenciosa em ambiente diferente do de desenvolvimento | Declarar dependência e comando de instalação explicitamente |
| Referenciar ferramenta MCP sem prefixo de servidor | "Tool not found" quando há múltiplos servidores MCP ativos | Nome totalmente qualificado `ServerName:tool_name` |

**[INFERÊNCIA]** Um antipadrão adicional, não listado nominalmente mas decorrente direto do "ciclo de vida" (§1.6): escrever instruções como "passo único" quando a skill precisa influenciar comportamento por *toda* a tarefa — como o Claude Code não relê o arquivo a cada turno, uma regra frasal única ("lembre-se de X") tende a perder efeito após poucos turnos; a doc recomenda reforçar a `description` e as instruções para que o modelo continue preferindo a skill, ou usar hooks para impor determinismo quando a confiança na adesão do modelo não for suficiente.

---

## 8. Premissas assumidas nesta pesquisa

- Assumi que "estado da arte" significa o comportamento documentado oficialmente em 2026-08, incluindo mudanças recentes já refletidas na doc (ex.: fusão de slash commands em skills, `skillOverrides`, mudanças de versão específicas como v2.1.196/v2.1.218 citadas na doc do Claude Code) — não tentei reconstruir o histórico de versões anteriores em detalhe.
- Não encontrei neste ambiente uma skill instalada chamada `claude-code-guide` (existe apenas um *agente* de mesmo nome, tipo diferente de artefato) — segui a instrução de não invocá-la e usei a documentação oficial via WebFetch diretamente, o que na prática é a mesma fonte primária que aquele agente consultaria.
- Project-router não encontrado em `.claude/skills/project-router/SKILL.md` nem `.agents/skills/project-router/SKILL.md` nesta worktree — prossegui sem ele, conforme instrução de fallback.
- A seção 4.2 (matriz "MCP é o encanamento...") é minha síntese qualitativa apoiada em múltiplas fontes secundárias convergentes, não uma citação única da Anthropic — marquei como inferência.

---

## 9. Exemplo copiável e comandos de verificação

### 9.1 `SKILL.md` mínimo completo **[FATO]**

Frontmatter com os dois campos obrigatórios do padrão aberto (exemplo de `description` citado literalmente em `agentskills.io/specification`) e um corpo no padrão "conciso" recomendado por `platform.claude.com/.../best-practices` (o mesmo exemplo "~50 tokens" referido em §6.1). Combinados, formam uma skill completa, válida e portátil — sem nenhum recurso exclusivo do Claude Code:

````markdown
---
name: pdf-processing
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction.
---

## Extract PDF text

Use pdfplumber for text extraction:

```python
import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
````

Salvo como `pdf-processing/SKILL.md` (nome do diretório igual ao `name`, por §5.2), isso já funciona em qualquer harness do padrão aberto e no Claude Code sem alteração.

### 9.2 Comandos para confirmar carregamento e orçamento **[FATO]**

| Comando/ferramenta | Onde roda | O que confirma |
|---|---|---|
| `skills-ref validate ./minha-skill` | CLI do padrão aberto (biblioteca `skills-ref`, documentada em `agentskills.io/specification`, seção "Validation") | Valida frontmatter e convenções de `name` contra a especificação, fora do Claude Code — útil antes de empacotar/subir a skill para qualquer harness. |
| `/skills` | Claude Code | Lista as skills carregadas na sessão atual, incluindo as sincronizadas da conta claude.ai (agrupadas sob `claude.ai sync`); também é onde `skillOverrides` é editado (`Space` para ciclar estado, `Enter` para salvar). |
| `/context` | Claude Code | Mostra a linha "Skills" já com o orçamento da listagem aplicado — o número que efetivamente chega ao modelo (antes da v2.1.196 essa linha contava o texto completo de cada `description`, sem refletir o corte real). |
| `/doctor` | Claude Code | Dá uma estimativa do custo de contexto da listagem de skills e aponta os maiores contribuintes — útil para achar qual `description`/`when_to_use` está estourando o orçamento de §1.4. |

Fontes: `code.claude.com/docs/en/skills` (seções sobre live change detection e sobre o orçamento da listagem de skills, que cita `/doctor` e a linha "Skills" de `/context`) e `agentskills.io/specification` (seção "Validation", que documenta `skills-ref validate ./my-skill`).

---

## Fontes

- https://code.claude.com/docs/en/skills — referência completa do Claude Code: frontmatter, precedência de diretórios, ciclo de vida, injeção de contexto dinâmico, troubleshooting, `--add-dir` (skills/commands/subagentes e live-reload), seção "Run evals with skill-creator", `/skills`, `/context`, `/doctor`.
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview — arquitetura conceitual, progressive disclosure, limites de uso por superfície (API/claude.ai/Claude Code), segurança.
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices — boas práticas de autoria, antipadrões, checklist oficial, eval-driven development (nota: não menciona o plugin `skill-creator` — registra que "there is not currently a built-in way to run these evaluations"); também a validação de `name` específica desta superfície (proíbe XML tags e palavras reservadas "anthropic"/"claude", regra que não existe no padrão aberto).
- https://code.claude.com/docs/en/agent-sdk/skills — especificidades do Claude Agent SDK (TypeScript/Python): `settingSources`, opção `skills`, diferenças de `allowed-tools`.
- https://code.claude.com/docs/en/sub-agents — relação entre skills e subagentes, campo `skills:` em subagentes, `context: fork`.
- https://agentskills.io/specification — especificação formal do padrão aberto: os 6 campos de frontmatter portáveis, estrutura de diretório, regras de validação de `name` (sem restrição de palavras reservadas), seção "Validation" com `skills-ref validate ./my-skill`.
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills — post de lançamento original (motivação, analogia de "onboarding guide").
- https://siliconangle.com/2025/12/18/anthropic-makes-agent-skills-open-standard/ e https://venturebeat.com/ai/anthropic-launches-enterprise-agent-skills-and-opens-the-standard — cobertura do lançamento do padrão aberto em 18/12/2025: parceiros nomeados na skills library (Atlassian, Canva, Notion, Figma, Cloudflare, Stripe, Zapier), adoção por Microsoft/VS Code/GitHub, Cursor, Goose, Amp, OpenCode, OpenAI, e a métrica de adoção citada ("20k+ estrelas no GitHub"). Nenhuma das duas cita "40+ clientes" nem Databricks/Snowflake/Gemini CLI/GitHub Copilot nesse momento.
- https://agentskills.io — página inicial do padrão aberto, "Client Showcase" com a lista atual (não datada) de produtos/harnesses compatíveis; consultada em 2026-08-23, contagem própria de 46 logos (Claude Code, Claude, Cursor, GitHub Copilot, VS Code, ChatGPT & Codex, Gemini CLI, Goose, Databricks Genie Code, Snowflake Cortex Code entre eles).
- https://github.com/anthropics/skills — repositório oficial de skills públicas da Anthropic (estrutura de exemplo, categorias).
