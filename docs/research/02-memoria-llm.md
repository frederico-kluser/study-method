# Arquiteturas de memória persistente para agentes LLM

> Pesquisa para o projeto **study-method**: um tutor educacional cuja memória vive em arquivos JSON numerados (`memory/0001.json`, `0002.json`, ...), lidos a cada nova sessão. Este documento cobre taxonomia de memória, o problema do crescimento, estratégias de escalonamento, working memory/digest, bitemporalidade, schema design, falhas conhecidas e privacidade — com recomendação final para o projeto.
>
> Convenção: **FATO VERIFICADO (fonte)** = confirmado via busca web nesta pesquisa, com URL na seção Fontes. **INFERÊNCIA** = raciocínio do autor deste documento a partir dos fatos verificados, sem paper específico que meça exatamente esse cenário. Nada abaixo foi inventado sem marcação.

---

## 1. Taxonomia de memória em agentes

A referência mais citada para organizar memória de agentes LLM é o framework **CoALA — Cognitive Architectures for Language Agents** (Sumers, Yao, Narasimhan, Griffiths, arXiv 2309.02427). **FATO VERIFICADO (fonte: texto completo do paper, arxiv.org/html/2309.02427)**: ao fundamentar sua noção de *working memory*, CoALA cita explicitamente **Atkinson & Shiffrin (1968)** e **Baddeley & Hitch (1974)** — e propõe quatro tipos de memória para agentes de linguagem. *Correção desta revisão*: uma versão anterior deste documento atribuía a CoALA a importação direta da dicotomia episódica/semântica de Endel Tulving (1972) e da adição de memória procedural de Larry Squire (1987); busca literal no texto do paper **não encontrou nenhuma citação a Tulving ou Squire** — para memória episódica, CoALA cita trabalhos de NLP/RL (Rubin et al. 2021; Weston et al. 2014; Park et al. 2023; Yao et al. 2020; Tuyls et al. 2022), não a psicologia cognitiva clássica. A dicotomia episódica/semântica em si é de fato popularizada por Tulving (1972, *"Episodic and semantic memory"*, confirmado via en.wikipedia.org/wiki/Episodic_memory) — mas essa é uma atribuição à literatura de psicologia em geral, **não** a CoALA. Não foi possível verificar Squire (1987) como origem da distinção procedural/declarativa (fontes consultadas atribuem essa dissociação experimental primeiro a Milner 1962); essa atribuição foi **removida** por falta de fonte confiável.

| Tipo | O que armazena | Exemplo no domínio educacional |
|---|---|---|
| **Working memory** | O conteúdo atualmente na janela de contexto: prompt de sistema, histórico da conversa, resultado de tool calls, documentos recuperados. | O "digest" da aula atual: o que já foi dito nos últimos 10 minutos, exercício em andamento. |
| **Episódica** | Experiências específicas e situadas no tempo — "o que aconteceu". | "Em 2026-08-10, o aluno errou 3 de 5 questões de recursão e ficou frustrado ao ver a resposta." |
| **Semântica** | Conhecimento factual/atemporal sobre o mundo e sobre si mesmo (o agente) ou sobre o aluno. | "O aluno tem facilidade com álgebra linear mas dificuldade crônica com recursão." |
| **Procedural** | Habilidades e regras de comportamento — "como fazer", inclusive as regras do próprio agente. | "Quando o aluno trava em recursão, usar analogia de bonecas russas antes de mostrar código." |

No `memory/NNNN.json` do study-method, cada arquivo de sessão é primariamente um **registro episódico**. A memória **semântica** (perfil consolidado do aluno) e a **procedural** (o que funcionou pedagogicamente) precisam ser **derivadas** dos episódios — não é razoável esperar que a LLM releia 100 episódios brutos para reconstruir isso a cada sessão (ver seção 2).

### Frameworks e papers relevantes (todos verificados)

- **MemGPT / Letta** — trata o context window como memória restrita (analogia a SO/RAM) e implementa três camadas: **core memory** (bloco pequeno dentro do contexto, tipo RAM, que o próprio agente lê/escreve), **recall memory** (histórico de conversa pesquisável fora do contexto, tipo cache em disco) e **archival memory** (armazenamento de longo prazo consultado via tool call, tipo cold storage). **FATO VERIFICADO (fonte: letta.com/blog/agent-memory)**. O agente gerencia essas camadas via chamadas de função autônomas.
- **Generative Agents (Park et al., UIST 2023)** — introduz o **memory stream**: um log episódico em linguagem natural, mais um mecanismo de **reflection** que periodicamente agrupa observações relacionadas e sintetiza abstrações de nível mais alto. O exemplo real do paper (verificado diretamente no texto): a partir de observações repetidas do personagem Klaus Mueller dedicando horas a um projeto de pesquisa, o sistema gera a reflexão **"Klaus Mueller is dedicated to his research on gentrification"**, citando as memórias-fonte que a sustentam; essa abstração muda o comportamento do agente — Klaus passa a preferir a companhia de Maria Lopez, com quem descobre compartilhar interesse de pesquisa, em vez de Wolfgang, que teria sido escolhido só por frequência de interação. *Correção desta revisão*: a versão anterior deste documento usava um exemplo fabricado ("Klaus tem comido sozinho e parece retraído") que não existe no paper — foi substituído pelo exemplo real. A recuperação usa um score que combina três sinais: **recência** (decaimento exponencial), **relevância** (similaridade de embedding) e **importância** (nota autoavaliada pelo próprio modelo). **FATO VERIFICADO (fonte: arxiv.org/html/2304.03442v2, versão arXiv do mesmo paper)**. Esse esquema de recência+relevância+importância é diretamente aplicável: um erro de recursão de há 6 meses deve pesar menos que um de ontem, mesmo com a mesma similaridade textual.
- **Mem0** (arXiv 2504.19413) — camada de memória "production-ready": extrai, consolida e recupera fatos salientes de conversas continuamente, com variante de grafo (Mem0g). Primeira comparação ampla (10 abordagens) no benchmark **LoCoMo**. **FATO VERIFICADO (fonte)**: 26% de melhoria relativa no métrica LLM-as-Judge sobre a memória da OpenAI; Mem0g ~2% acima do Mem0 base; 91% menos latência p95 e >90% de economia de tokens vs. enviar contexto completo. *Correção desta revisão*: a versão anterior citava o venue como "ECAI 2025"; os metadados do arXiv verificados diretamente **não listam journal-ref/venue algum** (só data de submissão e categoria) — a atribuição a ECAI 2025 **não pôde ser confirmada** e foi removida; tratar como preprint arXiv até confirmação.
- **Zep / Graphiti** (arXiv 2501.13956) — memória como **grafo de conhecimento temporal**. Graphiti organiza em três camadas hierárquicas: nós episódicos (mensagens brutas), entidades/fatos semânticos (com **validade bitemporal** por aresta) e resumos de comunidade (abstrações de cluster via label propagation). **FATO VERIFICADO (fonte)**: no benchmark DMR, Zep atinge 94.8% de acurácia contra 93.4% do MemGPT; no LongMemEval, melhora de até 18.5% de acurácia com 90% menos latência de resposta. Quando há conflito, o sistema invalida a aresta antiga (marca intervalo de validade fechado) mas **não descarta** o histórico — propriedade central para a seção 5.
- **A-MEM** (arXiv 2502.12110, NeurIPS 2025) — memória inspirada no método **Zettelkasten**: cada nova memória vira uma "nota atômica" com atributos estruturados (contexto, palavras-chave, tags) e é linkada dinamicamente a notas antigas relevantes; a chegada de uma nota pode disparar atualização das notas antigas ligadas a ela ("evolução de memória"). O abstract (verificado diretamente) afirma só melhoria qualitativa — "superior improvement against existing SOTA baselines" em seis modelos-base — sem quantificar um fator. **FATO NÃO VERIFICADO NA FONTE PRIMÁRIA**: o número "2×–6× de melhoria em eficiência de raciocínio multi-hop com economia de tokens", presente numa versão anterior deste documento com selo de verificado, não aparece no abstract do arXiv; só foi encontrado em fontes secundárias/terciárias sobre o paper, não confirmadas aqui — selo rebaixado, mesmo tratamento dado a outros números de fonte secundária neste documento (ver seção 2.2).
- **LangGraph memory (LangChain)** — memória de longo prazo como **document store persistente**: documentos JSON organizados por `namespace` (pasta) + `key` (nome de arquivo), separada da memória de curto prazo (thread/checkpointer). **FATO VERIFICADO (fonte: docs.langchain.com/oss/python/concepts/memory)**. Esse padrão namespace+key é estruturalmente idêntico à ideia de índice/manifesto da seção 3c.
- **Claude memory tool + context editing (Anthropic)** — ferramenta client-side (Claude 4+) que grava/lê memória em arquivos, operada pelo próprio agente via tool calls; complementada por **context editing**, que limpa automaticamente resultados de tool call obsoletos preservando as operações de memória. **FATO VERIFICADO (fonte: platform.claude.com/docs)**: em benchmark interno da Anthropic com tarefa de busca web de 100 turnos, a combinação memory tool + context editing gerou **84% de economia de tokens e 39% de melhora de desempenho** frente a não gerenciar o contexto.
- **LoCoMo** (Maharana et al., ACL 2024, arXiv 2402.17753) — benchmark de referência para memória conversacional de muito longo prazo: conversas com ~600 turnos e ~16 mil tokens em média, ao longo de até 32 sessões, com perguntas single-hop, multi-hop, temporais e de domínio aberto. **FATO VERIFICADO (fonte)**. É o benchmark usado por Mem0 e citado por Zep — útil como referência de escala (32 sessões, ordem de grandeza compatível com "2-4 sessões/semana" do study-method ao longo de alguns meses).

---

## 2. O problema do crescimento: por que reler tudo quebra

### 2.1 Custo e latência (óbvio, mas real)
Cada arquivo `NNNN.json` lido inteiro entra no prompt. Em 100 sessões, mesmo arquivos pequenos (2-5 KB de JSON) somam dezenas de milhares de tokens **antes** da aula começar — tokens pagos, processados e residentes na janela em toda resposta subsequente da sessão (sem prompt caching completo, é custo repetido a cada turno). Isso é o motivo "superficial"; o motivo mais sério é o item 2.2.

### 2.2 Degradação de atenção: "lost in the middle" e context rot

**Lost in the Middle** (Liu et al., arXiv 2307.03172, TACL 2024) testou modelos em QA multi-documento e recuperação chave-valor, variando a **posição** do documento relevante entre distratores. **FATO VERIFICADO (fonte, abstract do paper)**: o desempenho segue uma curva em **U** — mais alto quando a informação relevante está no **início** ou no **fim** do contexto, e degrada significativamente quando está no **meio**; nenhum modelo testado usa o contexto longo de forma uniformemente robusta. Múltiplas fontes secundárias independentes (inblog.ai, arize.com, bytebell.dev) convergem em reportar quedas da ordem de **20 a 30 pontos percentuais de acurácia** quando o documento-alvo migra do início/fim para o meio de listas de 20-30 documentos — **FATO VERIFICADO (fonte secundária convergente, não o número exato do paper primário, que não foi possível extrair diretamente em texto)**.

Implicação direta para o study-method: se a LLM lê `0001.json .. 0100.json` em sequência e o fato relevante para a aula de hoje ("o aluno tem dificuldade com recursão desde janeiro") está no arquivo `0037.json`, ele está literalmente **no meio do contexto** — exatamente a zona de pior desempenho.

**Context Rot** (pesquisa da Chroma, 2025) formalizou e generalizou esse achado. **FATO VERIFICADO (fonte: trychroma.com/research/context-rot, verificado diretamente)**: testaram 18 modelos de fronteira (Claude Opus 4/Sonnet 4/3.7/3.5/Haiku 3.5, GPT o3/4.1/4.1-mini/4.1-nano/4o/4-turbo/3.5-turbo, Gemini 2.5 Pro/Flash/2.0 Flash, Qwen3 235B/32B/8B) em needle-in-haystack estendido, LongMemEval e uma tarefa de repetição exata de palavras. **O maior contexto efetivamente testado foi de ~113 mil tokens** (experimentos de LongMemEval, com modelos Qwen estendidos via YaRN de 32.768 para 131.072 tokens) — a Chroma **não testou contexto de 1M tokens**. Achados centrais:
- **Todos os 18 modelos pioram conforme o input cresce, de forma não uniforme** — não é um efeito de "alguns modelos fracos".
- Quanto menor a similaridade semântica/lexical entre a pergunta e a "agulha", mais rápido o desempenho cai conforme o input cresce.
- Distratores compostos (múltiplos documentos irrelevantes mas relacionados) degradam desempenho mais que um único distrator, com efeito amplificado em contextos mais longos.
- Curiosamente, embaralhar a ordem lógica do "haystack" às vezes **melhora** o desempenho — contradiz a intuição de que coerência estrutural ajuda o modelo.
- Modelos diferem no *tipo* de falha: Claude tende a se abster (recusar responder) quando incerto; modelos GPT tendem mais à alucinação.

*Correção desta revisão*: a versão anterior deste parágrafo continha a citação literal **"um contexto de 1M tokens já apodrece a partir de 50 mil tokens"**, marcada como fato verificado. Essa frase **foi removida por ser fabricada** — não existe no relatório da Chroma. A menção a "1M tokens" que de fato aparece na página é sobre a capacidade de mercado anunciada por modelos (Gemini 1.5 Pro, GPT-4.1, Llama 4), não uma configuração testada. Não há, nem na fonte primária nem em fonte secundária confiável consultada, uma cifra verificável de "50 mil tokens" como limiar universal de início de degradação; se esse número for necessário para calibrar algo no projeto, precisa vir de teste próprio, não de paráfrase de terceiros.

Um dado numérico adicional (pesquisa da Adobe, fev. 2025, citada por understandingai.org): em uma tarefa específica com contexto de 32 mil tokens, **GPT-4o caiu de 99% para 70%** de acurácia e **Claude 3.5 Sonnet caiu de 88% para 30%** — **FATO VERIFICADO (fonte secundária), mas número específico de uma tarefa específica, não generalizável a qualquer tarefa**.

**Needle in a Haystack** é a metodologia-mãe desses benchmarks: insere-se um fato curto ("agulha") em profundidades variadas dentro de um documento longo de distração ("palheiro") e mede-se a taxa de recuperação correta. **FATO VERIFICADO (fonte)**. Variantes mais duras (BABILong, NeedleBench) adicionam raciocínio sobre múltiplas agulhas, não só recuperação literal — mais próximo do que o tutor precisa fazer (cruzar "dificuldade com recursão" + "última vez que isso foi tratado" + "estratégia que funcionou").

### 2.3 JSON estruturado agrava, não alivia, o problema

Um raciocínio intuitivo seria: "dados estruturados (JSON) são mais fáceis de escanear que prosa livre, então o modelo deveria lidar melhor com 100 arquivos JSON do que com 100 páginas de texto". A tarefa de **Repeated Words** do estudo de context rot da Chroma contraria essa intuição: **FATO VERIFICADO (fonte)** — mesmo uma tarefa de replicação exata de texto (a forma mais "mecânica" possível de processamento, sem exigir compreensão semântica) degrada consistentemente conforme o contexto cresce, com modelos "cada vez mais lutando para posicionar corretamente palavras únicas" a partir de 500-1000 palavras. Chave-valor é exatamente o formato de um JSON: o próprio paper de Lost in the Middle usa uma tarefa sintética de **recuperação chave-valor em JSON longo** como um dos dois experimentos centrais, e encontra o mesmo padrão em U — ou seja, o formato JSON **não protege** contra o efeito, ele foi literalmente um dos formatos usados para demonstrá-lo. **FATO VERIFICADO (fonte)**. Isso reforça que a solução não pode ser "só usar um formato mais amigável para a LLM" — tem que ser reduzir *quanto* material bruto entra no contexto por sessão.

**Conclusão da seção**: o risco não é só estourar a janela de contexto (isso é resolvível com janelas maiores). O risco é que, **mesmo cabendo**, o modelo processa o meio do material de forma pouco confiável — silenciosamente. Um tutor que "esqueceu" que já tentou a analogia das bonecas russas em fevereiro não vai lançar um erro, vai simplesmente repetir a tentativa e parecer com memória fraca.

---

## 3. Estratégias de escalonamento (comparativo)

| Estratégia | Como funciona | Quando vale a pena | Quando é overengineering | Custo/complexidade | Ponto de virada (nº sessões) |
|---|---|---|---|---|---|
| **(a) Compactação cíclica / hierarchical summarization** | A cada N sessões, um passo de resumo (LLM) condensa os últimos N episódios brutos em um resumo mais curto, que substitui (ou complementa) a leitura direta. Análogo ao `ConversationSummaryBufferMemory` do LangChain e à sumarização recursiva do MemGPT quando o core memory transborda. **FATO VERIFICADO (fonte: docs LangChain)**. | Sempre que o histórico já não cabe (ou não deveria caber) inteiro no início do prompt. Simples de implementar, sem infraestrutura nova. | Nunca, isoladamente — é quase sempre necessária em algum grau; o "erro" é achar que ela sozinha resolve recuperação seletiva de fatos específicos (resumo perde granularidade). | Baixo-médio: 1 chamada de LLM extra periódica; risco de "resumo do resumo" perder nuance se aplicado ingenuamente em cascata sem preservar a fonte bruta. | A partir de ~15-20 sessões acumuladas sem nenhuma consolidação já compensa começar; **INFERÊNCIA** calibrada pelos achados da seção 2 (degradação começa bem antes do limite de contexto) — mesmo limiar usado na seção "Recomendação para o study-method", para não haver dois números diferentes para a mesma coisa. |
| **(b) RAG local com embeddings** | Cada sessão (ou fato extraído dela) é embedado e indexado; na aula seguinte, recupera-se por similaridade semântica ao invés de ler tudo. Modelos locais viáveis e baratos: `all-MiniLM-L6-v2` (~0.1 GB, CPU-only, mais leve), `nomic-embed-text` (768 dim, contexto 8192, ~0.3 GB via Ollama, boa relação custo/qualidade), `BGE-M3` (1024 dim, multi-modo denso+esparso+multi-vetor, melhor qualidade, mais pesado), `Qwen3-Embedding-0.6B` (melhor qualidade por VRAM, ~1.5 GB). **FATO VERIFICADO (fonte: comparativos 2026 de d-central.tech, morphllm.com)**. Para armazenamento local sem servidor, `sqlite-vec` embute KNN vetorial dentro de um único arquivo `.db`, sem infraestrutura adicional — **FATO VERIFICADO (fonte)**, mas explicitamente indicado para datasets pequenos/médios, não substituto de um vector DB dedicado em escala grande. | Volume grande (centenas a milhares de registros), busca por conteúdo livre ("quando falamos de X mesmo?"), múltiplos alunos/domínios. | Para dezenas a poucas centenas de arquivos JSON pequenos e estruturados — indexar, reindexar a cada escrita e ajustar limiar de similaridade é complexidade desproporcional ao ganho; um `INDEX.json` com campos estruturados já resolve a mesma pergunta sem embedding. | Médio: precisa de modelo de embedding (mesmo local), pipeline de indexação incremental, escolha de métrica/limiar, e manutenção do índice sincronizado com os arquivos-fonte. | Overengineering abaixo de ~150-200 sessões para um único aluno com poucos domínios; **INFERÊNCIA** — nenhuma fonte mede esse limiar especificamente para JSON de sessão de tutoria, é extrapolado da escala do LoCoMo (32 sessões) e do fato de que busca estruturada por chave já cobre a maioria dos casos de uso de um tutor pessoal. |
| **(c) Índice/manifesto incremental (`INDEX.json`)** | Um arquivo derivado, pequeno, mantido incrementalmente a cada nova sessão: por sessão, guarda metadados leves (data, tópicos tocados como enum/tags, um resumo de uma linha, flags de pendência) e um ponteiro para o arquivo bruto. A cada nova sessão a LLM lê **só o índice**, não os brutos, e busca seletivamente (por data, tópico ou flag) o arquivo bruto específico só se precisar de detalhe. Estruturalmente idêntico ao padrão namespace+key do LangGraph Store e à camada "recall memory" do MemGPT (busca por metadado antes de tocar o dado bruto). | **A via mais barata e mais subestimada** — resolve a maior parte da dor (achar o fato certo sem reler tudo) com a menor complexidade possível: nenhuma infraestrutura nova, nenhum modelo extra, é só disciplina de escrita (grava índice junto com o episódio). Vale a pena desde o primeiro dia. | É "overengineering ao contrário": raramente é demais, mas sozinho não escala para busca semântica livre nem para reconciliar fatos contraditórios entre sessões distantes (não tem noção de "isso substitui aquilo", ver seção 5). | Muito baixo: uma escrita extra (append) a cada sessão; leitura é trivial (1 arquivo pequeno). | Vale desde a sessão 1 — não existe "cedo demais" para manter um índice; o ponto de virada é quando ele deixa de bastar sozinho, que coincide com o ponto de virada de (a) ou (b)/(d). |
| **(d) Grafo de conhecimento (entidades + relações)** | Extrai entidades (aluno, tópico, habilidade, erro recorrente) e relações entre elas, com arestas datadas/versionadas (ver Zep/Graphiti). Permite perguntas relacionais ("quais tópicos o aluno associa com frustração?") que índice plano não responde bem. | Múltiplos domínios de estudo fortemente interligados (ex.: cálculo depende de álgebra depende de aritmética, e o tutor quer raciocinar sobre pré-requisitos), ou quando se quer auditar como um fato específico mudou ao longo do tempo com granularidade de aresta. | Para um único aluno, poucos domínios, uso de tutor pessoal — construir e manter um extrator de entidades/relações é o item de maior complexidade de engenharia da lista, para um ganho que um `INDEX.json` com tags bem escolhidas já cobre em boa parte. | Alto: extração de entidades (mais uma chamada de LLM confiável), schema de grafo, resolução de duplicatas de entidade, consultas de travessia. | Overengineering abaixo de várias centenas de sessões e múltiplos domínios cruzados; vale considerar só se o projeto crescer para múltiplas matérias com dependências explícitas entre si. **INFERÊNCIA**, calibrada pelo fato de que mesmo Zep (que serve *múltiplos* usuários corporativos, escala muito maior) usa grafo por causa do volume e da necessidade de fatos estruturados de negócio, não puramente por causa de "muitas sessões". |
| **(e) Híbrido (índice + recuperação seletiva + resumo de longo prazo)** | Combina (c) para navegação/seleção, (a) para consolidar o que fica "esquecido" em segundo plano, e opcionalmente (b) só para busca de texto livre quando o índice não é suficiente. É essencialmente o que Zep e Mem0 fazem em produção (camadas episódica + semântica consolidada + grafo/resumo). | É o estado de maturidade natural de qualquer sistema de memória que sobrevive tempo suficiente — MemGPT, Zep e Mem0 convergem para variações disso. | Só é overengineering se implementado todo de uma vez no dia 1, antes de saber se (b) ou (d) realmente vão ser necessários. | Escalonável: pode começar só com (c)+(a) e adicionar (b)/(d) depois, sem redesenhar o formato de arquivo — desde que o schema (seção 6) já preveja os campos necessários. | Ponto de virada: adicionar (b) quando o índice (c) deixar de resolver buscas de conteúdo livre; adicionar (d) só se o domínio virar multi-matéria com dependências explícitas. |

### Exemplo de `INDEX.json` (estratégia c)

Um manifesto incremental, append-only, lido por inteiro no início de toda sessão **no lugar** dos arquivos brutos:

```json
{
  "schema_version": "1.0",
  "sessions": [
    {
      "session_id": "0037",
      "file": "memory/0037.json",
      "date": "2026-01-14",
      "topics": ["recursao", "estruturas-de-dados"],
      "summary": "Aluno errou 3/5 questões de recursão; frustração ao ver a resposta pronta.",
      "flags": ["dificuldade-recorrente:recursao"]
    },
    {
      "session_id": "0038",
      "file": "memory/0038.json",
      "date": "2026-01-17",
      "topics": ["recursao"],
      "summary": "Analogia das bonecas russas ajudou; aluno resolveu 4/5 sozinho.",
      "flags": ["progresso:recursao"]
    }
  ]
}
```
Com isso, a LLM decide **por tag ou por flag** se vale abrir `0037.json` ou `0038.json` inteiros — nunca precisa ler os dois só para saber que existem.

---

## 4. Working memory / digest: consolidar antes da aula

Seguindo CoALA, **working memory é o que está na janela de contexto agora** — não é o repositório de longo prazo, é o "estado de trabalho" já filtrado. O digest de início de sessão é essa working memory sendo montada deliberadamente, não um acidente de "colar tudo".

**O que o Claude memory tool + context editing já demonstra na prática** (seção 1): limpar agressivamente o que é ruído operacional (resultados de tool call antigos) preservando o que é "insight" (decisões, fatos aprendidos) gera **84% de economia de token e 39% de ganho de desempenho** numa tarefa longa — o mesmo princípio se aplica a limpar sessões brutas antigas preservando o digest.

### Campos a preservar no digest (working memory de início de aula)
- **Perfil consolidado do aluno** (memória semântica derivada): pontos fortes, dificuldades recorrentes, com timestamp de última observação (ver seção 5).
- **Pendências/próximos passos explícitos** deixados na última sessão ("prometido revisar recursão na próxima aula").
- **Estado afetivo/motivacional recente** (últimas 1-3 sessões, não histórico completo — isso é volátil por natureza).
- **O que já foi tentado e funcionou/não funcionou pedagogicamente** (memória procedural: "analogia X funcionou", "abordagem Y confundiu mais").
- **Resumo de 1 linha das últimas N sessões** (via índice, seção 3c), não o conteúdo bruto.

### Campos a descartar do digest (ficam só no arquivo bruto, recuperáveis sob demanda)
- Transcrição literal de exercícios e respostas linha a linha.
- Detalhes operacionais da sessão (quanto tempo levou cada exercício, timestamps internos).
- Qualquer coisa cuja utilidade expirou (ver decaimento, seção 5) e que não foi promovida a fato semântico consolidado.

### Formato recomendado
Um **bloco único, curto, em JSON estruturado** (não prosa livre) que é montado programaticamente a partir do índice + dos últimos 1-2 arquivos brutos + do perfil semântico consolidado — nunca montado por "a LLM decide o que copiar de 100 arquivos". A montagem do digest deve ser **determinística/mecânica** (código, não geração), com a LLM entrando só para gerar o resumo textual de cada campo quando necessário. Isso evita que a própria tarefa de compactar já sofra do mesmo "lost in the middle" que se está tentando resolver.

Exemplo de digest montado no início de uma aula:

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-08-23T09:00:00-03:00",
  "student_profile": {
    "strengths": ["algebra-linear"],
    "recurrent_difficulties": [
      { "topic": "recursao", "confidence": "media", "last_observed_at": "2026-01-17", "status": "active", "needs_reconfirmation": true }
    ]
  },
  "pending_followups": ["revisar recursao com novo exemplo"],
  "recent_affect": "engajado",
  "what_worked": ["analogia das bonecas russas para recursao"],
  "what_didnt_work": ["mostrar a resposta pronta sem o aluno tentar primeiro"],
  "last_sessions_summary": [
    "0038 (2026-01-17): analogia ajudou, 4/5 sozinho",
    "0039 (2026-01-21): revisão de estruturas de dados, sem novidade"
  ]
}
```
Note que nenhum campo aqui é a transcrição bruta — tudo já é destilado, e o `needs_reconfirmation: true` do único fato "negativo" (derivado do `last_observed_at` estar velho o suficiente, não um valor fixo de `status`) já sinaliza que ele deve ser tratado como hipótese, não certeza (seção 5).

---

## 5. Bitemporalidade e decaimento

**Bitemporalidade**: toda informação tem duas linhas de tempo — **valid time** (quando o fato é/foi verdadeiro no mundo real) e **transaction time** (quando foi registrado no sistema). **FATO VERIFICADO (fonte: dataversity.net/articles/bitemporal-data-modeling-learn-history, com o exemplo de Martin Fowler)**: no exemplo de folha de pagamento de Fowler, um funcionário tem reajuste salarial com **valid time** desde 15/fev; a folha de pagamento **rodou em 25/fev** ainda com a taxa antiga (transaction time desse processamento); só em **15/mar** o sistema aprende que, com efeito retroativo a 15/fev, a taxa havia mudado — sem separar as duas linhas de tempo, o sistema não consegue responder corretamente "qual salário estava em vigor em 25/fev, quando a folha daquele mês foi processada?". *Correção desta revisão*: a versão anterior deste documento girava em torno de uma data (1/mar) que não aparece na fonte; as datas corretas (15/fev, 25/fev, 15/mar) foram confirmadas diretamente na fonte citada.

Aplicado ao tutor: "o aluno tinha dificuldade com recursão em janeiro" tem **valid_time = observação de janeiro** e **transaction_time = quando foi escrito no arquivo**. A pergunta real do professor não é "isso foi dito uma vez", é **"isso ainda é verdade?"** — que exige tratar o fato como tendo validade que pode expirar, não como registro permanente.

O **Zep/Graphiti** trata exatamente isso: cada aresta do grafo tem intervalo de validade explícito; quando chega um fato conflitante mais novo, a aresta antiga é **invalidada (fechado o intervalo), não apagada** — preserva-se o histórico ("o aluno tinha dificuldade X até a data Y") ao mesmo tempo em que o estado atual reflete só o que ainda é válido. **FATO VERIFICADO (fonte)**. Esse é o padrão a copiar mesmo sem grafo: em vez de sobrescrever um campo, adiciona-se um novo registro com `valid_from`/`superseded_by`, mantendo o antigo com `status: superseded` (nunca deletar — auditoria e o próprio "quando isso mudou" viram informação valiosa).

Exemplo de dois registros de fato semântico para o mesmo tópico, sem nunca apagar o antigo:

```json
[
  {
    "fact_id": "f-0012",
    "topic": "recursao",
    "claim": "aluno tem dificuldade recorrente",
    "observed_at": "2026-01-14",
    "recorded_at": "2026-01-14T20:03:00-03:00",
    "status": "superseded",
    "superseded_by": "f-0019"
  },
  {
    "fact_id": "f-0019",
    "topic": "recursao",
    "claim": "aluno superou a dificuldade, mas sem reforço desde então",
    "observed_at": "2026-01-21",
    "recorded_at": "2026-01-21T19:40:00-03:00",
    "status": "active",
    "supersedes": "f-0012"
  }
]
```

**Decaimento**: a curva de esquecimento de Ebbinghaus mostra que memória humana decai exponencialmente sem reforço — **FATO VERIFICADO (fonte: structural-learning.com, verificado diretamente)**: cerca de **67-70% do aprendido é esquecido já em 24 horas** sem revisão, chegando a **80-90% esquecido em 1 semana**; cada recall bem-sucedido "achata" a curva seguinte. *Correção desta revisão*: a versão anterior ("metade em poucos dias, até 80% em semanas") subestimava a velocidade real do esquecimento e superestimava o prazo — números corrigidos para bater com a própria fonte citada. Sistemas de tutoria inteligente (ITS) já modelam essa curva por aluno e por unidade de conhecimento para decidir quando revisar — **FATO VERIFICADO (fonte)**. Para a memória do *tutor sobre o aluno* (não a memória do aluno sobre o conteúdo, que é outro problema, de spaced repetition), o princípio análogo é: um fato semântico sem reforço/reconfirmação recente deve ter **confiança decrescente** com o tempo, não confiança fixa. Na prática:
- Cada fato semântico carrega `last_observed_at` (não só `created_at`).
- Fatos com `last_observed_at` muito antigo (ex.: > alguns meses, calibrar por domínio) devem ser tratados como **hipótese a reconfirmar**, não como verdade corrente — o digest deveria formular isso como pergunta implícita ("ainda tem dificuldade com recursão?") em vez de afirmação categórica.
- Isso evita a "ancoragem excessiva" descrita na seção 7: o aluno que superou uma dificuldade não deve ficar rotulado para sempre por causa de uma observação antiga nunca revisitada.

---

## 6. Schema design para memória episódica

Boas práticas gerais de JSON para consumo por LLM, verificadas em múltiplas fontes convergentes (apxml.com, latitude.so, decodethefuture.org, promptquorum.com):

- **Nomes de campo intuitivos e realistas**: chaves que seguem convenção comum (`first_name`, `status`, `created_at`) geram preenchimento mais correto do que abreviações opacas (`fn`, `st`, `ca`) — o modelo já viu esse padrão de nome milhões de vezes em treino. **FATO VERIFICADO (fonte)**. `needs_review` é mais claro que `flag`; `skill_level` é mais claro que `value`.
- **Enums em vez de texto livre sempre que o conjunto de valores é finito**: força o decodificador (ou o prompt) a um conjunto restrito, evitando deriva de vocabulário ("frustrado" um dia, "chateado" no outro, "desanimado" depois — todos a mesma coisa, mas irrecuperáveis por igualdade de string ou até por embedding barato). **FATO VERIFICADO (fonte)**. Usar `enum` agressivamente para estado afetivo, nível de habilidade, tipo de evento; deixar texto livre só para o que é genuinamente aberto (comentário pedagógico, pergunta do aluno).
- **Versionamento de schema**: gravar `schema_version` em todo registro; tratar o schema como **interface versionada**, não um blob incidental. Adicionar campo obrigatório ou mudar tipo é *breaking change*; adicionar campo opcional não é. **FATO VERIFICADO (fonte)**. Isso importa especialmente aqui porque o schema vai evoluir (onda 2 do projeto desenha `session.schema.json`) e sessões antigas (`0001.json`) precisam continuar legíveis por um schema mais novo — **tolerância a evolução** significa: campos novos devem ter default sensato quando ausentes; nunca renomear campo existente sem migração; nunca reaproveitar um nome de campo para significado diferente.
- **Schema simples e razoavelmente plano**: quanto mais complexo/aninhado o schema, mais a LLM "trabalha" para preenchê-lo e maior a chance de sair **estruturalmente válido mas semanticamente errado** (um enum tecnicamente presente mas mal escolhido, um campo aninhado vazio por preguiça do modelo). **FATO VERIFICADO (fonte)**. Preferir 1-2 níveis de aninhamento no máximo para os campos que a LLM preenche a cada sessão.

### Vocabulários fechados (enums) desta pesquisa

O bullet acima manda "usar enum agressivamente" para estado afetivo, nível de habilidade e tipo de evento — mas, numa revisão anterior, este documento nunca chegou a declarar nenhum enum, e por isso os próprios exemplos deste texto derivaram para quatro convenções diferentes do mesmo campo `status` (kebab-case em português, snake_case em português, inglês solto — corrigido nas seções 4/5 acima para `active`/`superseded` em todo lugar). Para não repetir o problema, ficam fechados aqui os quatro vocabulários que os exemplos deste documento já usam. **Isto é decisão de design deste documento, não fato verificado externamente** — não existe uma fonte primária que defina "o" vocabulário correto de afeto ou nível de habilidade para um tutor pessoal; é convenção interna, e o que importa é que fique **estável e fechada**, não qual rótulo específico foi escolhido.

| Campo | Valores fechados (enum) | Observação |
|---|---|---|
| `status` (fatos semânticos, seção 5; item "recurrent_difficulties" do digest, seção 4) | `active`, `superseded` | Não existe um terceiro valor de status para "envelhecido/a reconfirmar": esse sinal é **derivado** de `last_observed_at` (seção 5) e exposto como campo separado (`needs_reconfirmation: true/false`) no digest — não é um valor persistido de `status`. |
| `affect` / `recent_affect` (digest e registro de sessão, seções 4 e 6) | `engajado`, `frustrado`, `confiante`, `ansioso`, `desmotivado`, `neutro` | Conjunto mínimo cobrindo os estados usados nos exemplos deste documento; a onda 2 pode ampliar a lista, mas deve permanecer fechada, nunca texto livre. |
| `confidence` (confiança sobre um fato/observação, seções 4 e 6) | `baixa`, `media`, `alta` | Escala ordinal de 3 pontos — suficiente para o uso de decaimento de confiança da seção 5, sem granularidade que a LLM não sustenta de forma confiável. |
| `skill_level` (nível de habilidade por tópico — no exemplo da seção 6 o campo se chama `level`, mesmo conceito) | `iniciante`, `intermediario`, `avancado` | Mesma lógica de 3 pontos do item acima. |

Esses quatro vocabulários são o contrato mínimo que a onda 2 deve herdar ao desenhar `session.schema.json` — ampliar ou renomear um valor depois exige migração explícita dos arquivos já escritos com o valor antigo (mesma regra de versionamento de schema citada acima).

### Trade-off: campos ricos vs. campos bem preenchidos
Um schema rico (muitos campos estruturados: nível de habilidade por subtópico, múltiplas dimensões afetivas, metadados de timing) é sedutor para quem desenha o schema, mas cada campo extra é uma chance da LLM: (a) pular silenciosamente, (b) preencher com um valor placeholder plausível, ou (c) inferir além do que a sessão realmente sustenta (alucinação de detalhe). **INFERÊNCIA**, apoiada no padrão geral verificado acima ("quanto mais complexo, mais estruturalmente-válido-mas-errado"). Recomendação prática: manter **obrigatórios mínimos** (ex.: `schema_version`, `session_id`, `date`, `topics`, `one_line_summary`), e todo o resto **opcional com omissão permitida** — e validar programaticamente contra o schema após a geração, re-perguntando à LLM em caso de violação, em vez de confiar cegamente na primeira saída.

### Exemplo de registro episódico (`memory/0037.json`)

```json
{
  "schema_version": "1.0",
  "session_id": "0037",
  "date": "2026-01-14",
  "topics": ["recursao", "estruturas-de-dados"],
  "skills_observed": [
    { "skill": "recursao", "level": "iniciante", "confidence": "alta", "last_observed_at": "2026-01-14" }
  ],
  "affect": "frustrado",
  "affect_note": "desanimou ao ver a resposta pronta antes de tentar de novo",
  "what_worked": null,
  "what_didnt_work": "mostrar a solução completa sem deixar o aluno tentar mais uma vez",
  "open_questions": "vale tentar uma analogia visual antes do código na próxima vez?",
  "one_line_summary": "Errou 3/5 em recursão; frustração ao ver resposta pronta.",
  "raw_notes": null
}
```
Campos obrigatórios aqui: `schema_version`, `session_id`, `date`, `topics`, `one_line_summary`. Todo o resto é opcional (`null` é uma resposta válida, não uma falha) — isso é o que mantém o schema "razoavelmente plano" e resistente a preenchimento forçado.

Este esqueleto é ponto de partida para a onda 2 (schema formal), não o schema final.

---

## 7. Falhas conhecidas

- **Memória que polui (fatos errados persistidos)**: taxonomia recente de "memory poisoning" (MemPoison, arXiv 2607.14651, jul. 2026) distingue três níveis — **L1** corrupção de um único registro, **L2** corrupção composicional entre múltiplos registros, **L3** corrupção dormente disparada só em contexto futuro específico. **FATO VERIFICADO (fonte)**. Para um tutor pessoal (sem adversário externo), o risco relevante é sobretudo **auto-poluição**: a LLM infere algo além do que a sessão sustenta e grava como fato — que na próxima sessão é lido como verdade estabelecida.
- **Memória que contradiz**: survey sobre governança de memória evolutiva (SSGM framework, arXiv 2603.11768) identifica três pontos críticos de falha: **(1)** poisoning na ingestão, **(2)** *semantic drift* durante consolidação/atualização, **(3)** conflito/alucinação durante recuperação. **FATO VERIFICADO (fonte)**. Uma falha documentada específica: o sistema **recusa sobrescrever fato desatualizado**, ou o oposto, **recusa aceitar coexistência de fatos válidos** marcados incorretamente como contraditórios.
- **Alucinação por recuperação parcial**: ao contrário de RAG estático (onde um erro fica isolado em uma única consulta), erros em memória evolutiva são **cumulativos e persistentes** — pesquisa sobre riscos longitudinais (arXiv 2605.17830) mostra que a taxa de violação induzida por memória **excede a taxa-base sem memória e cresce com o tempo de exposição**. **FATO VERIFICADO (fonte)**. Ou seja: um digest montado a partir de um resumo de um resumo de um resumo tende a degradar silenciosamente, não a estabilizar.
- **Ancoragem excessiva no perfil antigo**: consequência direta da ausência de decaimento (seção 5) — um rótulo antigo ("tem dificuldade com recursão") nunca reavaliado vira uma profecia autorrealizável: o tutor sempre trata o aluno como se ainda tivesse aquela dificuldade, mesmo que ela tenha sido superada há meses e nunca mais reconfirmada.

**Exemplo concreto de ancoragem** (ilustrativo, não de um caso real medido): o registro `f-0012` da seção 5 ("dificuldade recorrente em recursão", observado em 14/jan) é lido isoladamente em julho, sete meses depois, sem que o digest carregue o `f-0019` que o supersede ("superou, mas sem reforço desde então", 21/jan). O tutor abre a aula de julho tratando o aluno como se ainda tivesse a mesma dificuldade de janeiro — um erro pedagógico que **não aparece como bug**, porque tecnicamente o fato de janeiro era verdadeiro quando escrito. É exatamente o cenário que bitemporalidade + decaimento (seção 5) existe para prevenir: sem `status`/`superseded_by`/`last_observed_at`, não há como o digest saber que aquele registro está obsoleto.

Mitigação prática comum às quatro (sem depender de infraestrutura de detecção adversarial, desnecessária num app pessoal e local): (i) nunca sobrescrever silenciosamente — sempre novo registro + `superseded_by`; (ii) `last_observed_at` obrigatório em todo fato semântico, com decaimento de confiança explícito no digest; (iii) distinguir na escrita o que é **observado diretamente** nesta sessão do que é **inferido/generalizado** — dois campos diferentes, não misturados.

---

## 8. Privacidade

Memória de aluno é **dado pessoal**, mesmo em um app local de uso individual. **FATO VERIFICADO (fonte: literatura de compliance FERPA/GDPR para edtech, secureprivacy.ai, 8allocate.com)**:
- Sistemas de tutoria com IA tipicamente coletam notas, frequência, comentários, e **cada prompt que o aluno digitou** — material que pode revelar dificuldades de aprendizagem, contexto familiar ou informações de saúde mesmo sem essa ser a intenção.
- **Minimização de dados**: só reter o estritamente necessário ao objetivo pedagógico — para cada campo do schema, perguntar "isso é necessário para a próxima aula ser melhor?".
- **Remover o nome não anonimiza**: a combinação de escola + turma + idade + dispositivo + histórico de atividade + estilo de escrita ainda pode reidentificar a pessoa; sob GDPR, dado pseudonimizado que pode ser religado à pessoa **continua sendo dado pessoal**. **FATO VERIFICADO (fonte)**.

### O que NÃO persistir
- Qualquer citação literal que revele informação de saúde, familiar ou emocional sensível **além** do necessário para adaptar o ensino (ex.: registrar "aluno mencionou ansiedade antes de provas" pode ser pedagogicamente útil; registrar detalhes de contexto familiar trazidos incidentalmente, não).
- Identificadores de dispositivo, geolocalização, ou qualquer metadado técnico que não sirva à pedagogia.
- Texto literal de terceiros mencionados pelo aluno (colegas, professores nomeados) além do estritamente necessário.

### Tensão não trivial: "nunca deletar" (seção 5) vs. direito ao esquecimento (GDPR Art. 17)
A seção 5 recomenda nunca sobrescrever/apagar um fato semântico, só marcá-lo `superseded` — isso é o padrão certo para não perder histórico pedagógico. Mas o **Art. 17 do GDPR** ("right to erasure") dá ao titular dos dados o direito de pedir a **remoção efetiva** de dados pessoais em várias condições (dado deixou de ser necessário à finalidade original, consentimento retirado, tratamento ilícito, entre outras) — **FATO VERIFICADO (fonte: gdpr-info.eu/art-17-gdpr)**. As duas recomendações não se contradizem, mas precisam de reconciliação explícita, que a versão anterior deste documento não fazia:
- **Supersede é o comportamento padrão** para o ciclo de vida normal de um fato (o aluno mudou, uma observação ficou desatualizada) — isso não é o que o Art. 17 regula, e não deve disparar apagamento.
- **Um pedido real de apagamento** (do próprio usuário, ou de um responsável, sobre dados do aluno) precisa ser uma **operação distinta, explícita e auditável** — uma "purga" que remove fisicamente o(s) registro(s) apontado(s) (arquivo `NNNN.json`, entradas no índice, fatos semânticos e suas cadeias de `superseded_by`), gera um log da própria purga (o quê, quando, a pedido de quem — sem reter o conteúdo apagado nesse log), e **não** passa pelo mecanismo normal de supersede.
- Isso não é opcional em um app que trata dado de aluno como dado pessoal (ver acima): o schema (onda 2) deve prever desde já que um `session_id`/fato pode ser fisicamente removido, mesmo que o comportamento default do dia a dia seja "nunca deletar".

### Versionar no git ou não
Como o study-method é local, single-user e sem servidor, o risco de vazamento em trânsito é baixo — mas **versionar `memory/*.json` num repositório git ainda expõe histórico completo** caso o repositório seja um dia compartilhado, publicado ou o notebook comprometido; e git preserva versões antigas mesmo após "corrigir" um dado sensível depois. **INFERÊNCIA prática, apoiada no princípio de minimização acima**:
- Recomendado manter `memory/` **fora do controle de versão** (`.gitignore`) por padrão, tratando-o como dado de runtime/pessoal, não como código-fonte.
- Se o usuário quiser versionar por conveniência (backup, diff entre sessões), isso deve ser **decisão explícita do usuário**, documentada, nunca comportamento padrão — e nunca em repositório que possa se tornar público.

---

## Recomendação para o study-method

Contexto assumido: app **local, sem servidor**, um único aluno, uso de **2 a 4 sessões por semana** — ou seja, algo entre ~100 e ~200 sessões por ano de uso contínuo. Isso é uma escala **pequena** frente a qualquer benchmark citado acima (LoCoMo usa 32 sessões; Zep/Mem0 operam em escala multi-usuário corporativa).

### Adotar como DEFAULT
1. **(c) Índice/manifesto incremental (`INDEX.json`)** — desde a sessão 1. Custo ~zero, resolve a maior parte da dor real ("achar o fato certo sem reler tudo"), e nenhuma das fontes pesquisadas sugere que exista um cenário pequeno demais para justificá-lo.
2. **(a) Compactação cíclica leve** a cada ~15-20 sessões (mesmo limiar da tabela da seção 3 e do "ponto de virada numérico" abaixo — um único número, não três) — consolidar o que está nos arquivos brutos mais antigos em um **perfil semântico** curto (memória semântica: pontos fortes/fracos com `last_observed_at`) e um **registro procedural** curto (o que funcionou/não funcionou pedagogicamente). Os arquivos brutos **continuam existindo** no disco (nunca deletar), só deixam de ser lidos por padrão.
3. **Digest determinístico** (seção 4) montado por código a partir do índice + perfil semântico + último 1-2 arquivos brutos — nunca "a LLM decide o que copiar de N arquivos".
4. **Bitemporalidade leve** (seção 5): todo fato semântico com `observed_at`/`last_observed_at` + `status: active|superseded` + `superseded_by`; o sinal de "precisa reconfirmar" é derivado de `last_observed_at` (exposto como `needs_reconfirmation` no digest, não como um terceiro valor de `status` — ver vocabulários fechados na seção 6). Não é bitemporalidade de banco de dados completa (não precisa), é o suficiente para nunca perder histórico e para permitir decaimento de confiança.

**Ponto de virada numérico para agir** (INFERÊNCIA calibrada pela seção 2, já que nenhuma fonte mede JSON de sessão de tutoria especificamente): considerar arquivos brutos acumulados sem consolidação **acima de ~15-20 sessões** (ou ~8-10 mil tokens somados) como sinal para rodar a compactação — abaixo disso, ler direto é simples e seguro; acima, já se entra na zona onde "lost in the middle"/context rot começam a operar de forma não desprezível segundo os achados da Chroma (degradação começa bem antes do limite nominal da janela, não só perto dele). Vale notar que este é o **mesmo** limiar de ~15-20 sessões usado na tabela da seção 3 e no item 2 acima — não três números diferentes, um só threshold mínimo. Em 2-4 sessões/semana, 15 sessões ÷ 4/semana ≈ 3,75 semanas e 20 sessões ÷ 2/semana = 10 semanas; ou seja, isso equivale a rodar a compactação **a cada ~4-10 semanas** de uso (*correção desta revisão*: a versão anterior dizia "4-8 semanas", que não batia com a própria conta a partir de 15-20 sessões e 2-4 sessões/semana).

### Deixar como decisão do usuário (não default)
- **(b) RAG local com embeddings** (`sqlite-vec` + `nomic-embed-text` ou `all-MiniLM-L6-v2`, ambos locais e gratuitos) — oferecer como **upgrade opcional** se/quando o histórico crescer muito (uso plurianual, > ~150-200 sessões) e o usuário quiser busca por conteúdo livre em vez de por tag/data. É tecnicamente barato de adicionar depois (arquivo único, sem servidor) **se o schema desde o início já guardar os campos de texto que seriam embedados** — não é preciso decidir agora, só não fechar a porta.
- **(d) Grafo de conhecimento** — só faz sentido se o projeto expandir para múltiplas matérias com pré-requisitos cruzados explícitos; para um único aluno estudando um domínio de cada vez, é complexidade sem contrapartida clara. Deixar inteiramente para o usuário decidir se/quando o escopo crescer.
- **Versionar `memory/` no git** — decisão de privacidade do usuário (seção 8), não técnica; recomendação é não versionar por padrão.

---

## Fontes

- CoALA — Cognitive Architectures for Language Agents (Sumers et al.): https://arxiv.org/pdf/2309.02427
- CoALA — versão HTML completa, usada para verificar citações de memória (Atkinson & Shiffrin 1968; Baddeley & Hitch 1974; ausência de Tulving/Squire): https://arxiv.org/html/2309.02427
- Episodic memory (Tulving 1972) — Wikipedia, usada só para confirmar a origem da dicotomia episódica/semântica na literatura de psicologia (não é citação de CoALA): https://en.wikipedia.org/wiki/Episodic_memory
- Letta / MemGPT — Agent Memory: https://www.letta.com/blog/agent-memory/
- Generative Agents: Interactive Simulacra of Human Behavior (Park et al., UIST 2023): https://dl.acm.org/doi/fullHtml/10.1145/3586183.3606763
- Generative Agents — versão arXiv, usada para verificar o exemplo real de reflection (Klaus Mueller / Maria Lopez): https://arxiv.org/html/2304.03442v2
- Generative Agents Memory Stream (explicação): https://agentpatterns.ai/agent-design/generative-agents-memory-stream/
- Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory (arXiv 2504.19413): https://arxiv.org/abs/2504.19413
- Zep: A Temporal Knowledge Graph Architecture for Agent Memory (arXiv 2501.13956): https://arxiv.org/abs/2501.13956
- Zep — temporal knowledge graph (definição): https://www.getzep.com/ai-agents/temporal-knowledge-graph/
- Graphiti (Neo4j blog): https://neo4j.com/blog/developer/graphiti-knowledge-graph-memory/
- A-MEM: Agentic Memory for LLM Agents (arXiv 2502.12110): https://arxiv.org/abs/2502.12110
- LangGraph — Launching Long-Term Memory Support: https://www.langchain.com/blog/launching-long-term-memory-support-in-langgraph
- LangGraph — Memory overview (docs): https://docs.langchain.com/oss/python/concepts/memory
- Claude — Managing context on the Claude Developer Platform: https://claude.com/blog/context-management
- Claude — Memory tool (docs): https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- Claude — Context editing (docs): https://platform.claude.com/docs/en/build-with-claude/context-editing
- Lost in the Middle: How Language Models Use Long Contexts (Liu et al., arXiv 2307.03172): https://arxiv.org/abs/2307.03172
- Lost in the Middle — explicação com números (secundária): https://inblog.ai/glossary/lost-in-the-middle
- Context Rot: How Increasing Input Tokens Impacts LLM Performance (Chroma): https://www.trychroma.com/research/context-rot
- Context rot — panorama e pesquisa Adobe fev. 2025: https://www.understandingai.org/p/context-rot-the-emerging-challenge
- Needle in a Haystack — explicação: https://medium.com/@imrohitkushwaha2001/needle-in-a-haystack-evaluating-llm-performance-in-long-context-retrieval-99bf2887d974
- Evaluating Very Long-Term Conversational Memory of LLM Agents — LoCoMo (Maharana et al., ACL 2024, arXiv 2402.17753): https://arxiv.org/abs/2402.17753
- ConversationSummaryBufferMemory (LangChain reference): https://reference.langchain.com/python/langchain-classic/memory/summary_buffer/ConversationSummaryBufferMemory
- Best Local Embedding Models for RAG 2026 (d-central.tech): https://d-central.tech/local-embedding-models/
- Best Ollama Embedding Models 2026 (morphllm.com): https://www.morphllm.com/ollama-embedding-models
- sqlite-vec — vector search em SQLite: https://medium.com/@stephenc211/how-sqlite-vec-works-for-storing-and-querying-vector-embeddings-165adeeeceea
- Best Practices for Tool Input and Output Schemas: https://apxml.com/courses/building-advanced-llm-agent-tools/chapter-1-llm-agent-tooling-foundations/tool-input-output-schemas
- How JSON Schema Works for LLM Data (Latitude): https://latitude.so/blog/how-json-schema-works-for-llm-data
- Bi-Temporal Data Modeling: An Overview: https://contact-rajeshvinayagam.medium.com/bi-temporal-data-modeling-an-overview-cbba335d1947
- Bitemporal Data Modeling — Dataversity (com exemplo de Fowler): https://www.dataversity.net/articles/bitemporal-data-modeling-learn-history/
- The Forgetting Curve: Why Learners Forget (Ebbinghaus) — Structural Learning: https://www.structural-learning.com/post/ebbinghaus-forgetting-curve
- Forgetting Curve — The Decision Lab: https://thedecisionlab.com/reference-guide/psychology/forgetting-curve
- MemPoison: Uncovering Persistent Memory Threats and Structural Blind Spots in LLM Agents (arXiv 2607.14651): https://arxiv.org/html/2607.14651v1
- Governing Evolving Memory in LLM Agents — SSGM Framework (arXiv 2603.11768): https://arxiv.org/html/2603.11768v1
- Remembering More, Risking More: Longitudinal Safety Risks in Memory-Equipped LLM Agents (arXiv 2605.17830): https://arxiv.org/pdf/2605.17830
- Student Data Privacy Governance: FERPA & GDPR (secureprivacy.ai): https://secureprivacy.ai/blog/student-data-privacy-governance
- FERPA/GDPR for AI in education — checklist prático (8allocate.com): https://8allocate.com/blog/ferpa-gdpr-for-ai-in-education-a-practical-deployment-checklist/
- Art. 17 GDPR — Right to erasure ('right to be forgotten'): https://gdpr-info.eu/art-17-gdpr/
