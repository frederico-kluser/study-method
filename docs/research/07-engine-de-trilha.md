# 07 — Engine de trilhas: a rastreabilidade das afirmações pedagógicas do `docs/16`

Documento de rastreabilidade. O `docs/16-engine-de-trilha.md` §13 obriga: **toda afirmação
pedagógica do documento normativo tem origem na pesquisa auditada**, e o `CONTRIBUTING.md` proíbe
promessa de ganho pedagógico sem fonte (`I-43`). Este arquivo é o elo: cada afirmação rastreável do
docs/16 está mapeada para a fonte pública que a sustenta (URL verificável), seguindo o molde do
`06-toolchains.md`. Ao longo deste arquivo, `docs/16` abrevia
`docs/16-engine-de-trilha.md` — o documento normativo.

Marcação usada (mesma convenção do `06-toolchains.md`): **FATO VERIFICADO (fonte)** = confirmado
nesta rodada via busca web e/ou fetch direto da página (URL real, verificável; quando a página
bloqueia curl por anti-bot e a URL veio dos resultados de busca, a ressalva está na entrada);
**INFERÊNCIA** = conhecimento consolidado da área, não citado a uma página específica desta rodada,
mas seguro para operar; **INFERÊNCIA/DECISÃO** = sem fonte pública localizada até 2026-08-30 —
número de medição interna do projeto, decisão de produto ou resultado derivado, com a justificativa
declarada em cada entrada (mantida sob revisão, como manda o próprio contrato: limitação declarada
> número sem dono).

O texto do docs/16 e o texto deste arquivo divergem apenas em pontuação/grafia (κ, vírgula
decimal); os números são citados como no documento.

---

## 1. As dezesseis dimensões do §13 — mapa

| # | Dimensão (§13) | Onde mora no docs/16 | Natureza das fontes |
|---|---|---|---|
| 1 | padrões de prompt | §2 P1/P5, §6.3, §7.1 R1–R2/R13, §11 | papers de raciocínio/auto-correção + decisões de produto |
| 2 | saída estruturada | §6.3 | Tam et al. (formato rígido) + decisão de produto |
| 3 | decomposição e raciocínio | §2 P5, §3.6 | Huang et al. + medições internas |
| 4 | laços actor-critic | §2 P5, §6 inteiro | research/04 + papers de self-correction |
| 5 | LLM como juiz | §2 P1, §6.2, §6.4, §6.5, §11 | papers de avaliação/juiz + medições internas |
| 6 | orquestração multi-agente | §2 P3, §4, §11 (painel/debate) | Apple (painel), Huang §4 (debate) + decisões |
| 7 | objetivos e alinhamento construtivo | §4.3, §7.1 | Dick & Carey, Biggs, backward design |
| 8 | carga cognitiva | §3.6, §3.7, §7.1 R13 | Sweller/CLT, Cowan |
| 9 | grafos de pré-requisito | §3.4, §3.5 | Exercism (track JS) + decisões |
| 10 | domínio e prática espaçada | §7.1 R11 (retrieval) | Dunlosky et al. + decisão |
| 11 | pedagogia de programação | §7.1 R2/R10, §3.7 | PRiMM + trabalhos de ensino de programação + decisões |
| 12 | concepções erradas em JavaScript | §7.1 R9 | decisão (âncora na spec ECMA-262/MDN) |
| 13 | decomposição atômica de JavaScript | §3.6, §7.1 | decisão de produto + réguas de Exercism |
| 14 | vocabulário controlado e verificação estática | §3.1, §5.3 | decisão de produto (implementação) |
| 15 | design de exercício | §9 J1–J9, §10 | decisões + medição interna (outputChannel) |
| 16 | geração automática de currículo | §2 P2, §12 D2/D5 | medições internas + decisões |

---

## 2. Afirmações com fonte pública verificada

### 2.1 Auto-correção sem sinal externo degrada — GPT-4/GSM8K 95,5 → 91,5 → 89,0 (§2 P5)
**FATO VERIFICADO (fonte)**: Huang, J. et al., *"Large Language Models Cannot Self-Correct
Reasoning Yet"* (ICLR 2024, arXiv:2310.01798). Confirmado por leitura direta do HTML do artigo
(ar5iv): GPT-4 em GSM8K com *standard prompting* = **95,5**; após rodadas de auto-correção
intrínseca = **91,5** e **89,0** (Tabela 3 do artigo). O mesmo paper já constava em
`04-tdd-actor-critic.md` (Fontes).
- https://arxiv.org/abs/2310.01798 · https://ar5iv.labs.arxiv.org/html/2310.01798

### 2.2 Laço aberto é anti-padrão: Self-Refine 4 · CRITIC 3–4 · Constitutional AI 4 · Reflexion 1–3 (§2 P5)
**FATO VERIFICADO (fonte)**: as contagens de iteração foram confirmadas nos **papers primários**
nesta rodada: Self-Refine (§3.1, "up to a maximum of **4** iterations" — Madaan et al.,
arXiv:2303.17651); CRITIC ("correct up to **n = 3** rounds" — Gou et al., arXiv:2305.11738; o
"3–4" do doc é leitura razoável pela Fig. 4/apêndice, que mostra efeito por iteração até 4);
Constitutional AI ("We sample **four** sequential critiques and revisions" — Bai et al.,
arXiv:2212.08073); Reflexion (memória de experiência limitada a Ω = **1–3**, "usually set to 1-3"
— Shinn et al., arXiv:2303.11366). A trajetória 95,5→91,5→89,0 é a 2.1.
- https://arxiv.org/abs/2303.17651 · https://arxiv.org/abs/2305.11738 · https://arxiv.org/abs/2212.08073 · https://arxiv.org/abs/2303.11366

### 2.3 Juiz LLM de corretude: κ = 0,21 no melhor modelo, maioria < 0,10, 50% dos errados aceitos (§2 P1, §11)
**FATO VERIFICADO (fonte)**: *"On the Effectiveness of LLM-as-a-judge for Code Generation and
Summarization"* (arXiv:2507.16587) — Tabela II: Cohen's κ entre o julgamento (certo/errado) e a
execução real (pass/fail) para 8 LLMs: **GPT-4 é o melhor, κ = 0,21** em Java (0,10 em Python); a
maioria dos modelos fica abaixo de 0,10 ("complete lack of agreement"); e o texto reporta
*"wrong implementations, which are misjudged as correct in 50% of the cases"*. É o dado que motiva
o P1 do docs/16 ("o oráculo é o teste, não o juiz").
- https://arxiv.org/abs/2507.16587 · https://ar5iv.labs.arxiv.org/html/2507.16587

### 2.4 Pré-requisito de currículo: melhor modelo faz 57% de *exact match* (§2 P1)
**FATO VERIFICADO (fonte, com meio-tom)**: K12-KGraph (arXiv:2605.09635): *"On K12-Bench,
Gemini-3-Flash achieves only 57 percent exact match"* — com `Prereq` e `Neighbor` as tarefas mais
difíceis do benchmark de cognição de currículo. **Ressalva**: o 57% é o *overall* do K12-Bench,
não só da tarefa de pré-requisito — o docs/16 concentra no raciocínio de pré-requisito, que é
justamente a tarefa mais difícil do benchmark.
- https://arxiv.org/abs/2605.09635

### 2.5 Exercism: stub e exemplar usam o exercício **ou** os pré-requisitos; os testes só os pré-requisitos (§3.3)
**FATO VERIFICADO (fonte)**: docs oficiais do Exercism (`building/tracks/concept-exercises.md`,
arquivo do repo `exercism/docs`, lido nesta rodada — regras literais nas seções *Stub
implementation* / *Tests* / *Exemplar implementation*):
- Stub: *"Only use language features introduced by the exercise **or** its prerequisites"*;
- Tests: *"Only use language features introduced by the exercise's **prerequisites**"* (sem o
  "or the exercise" — escopo deliberadamente mais estreito);
- Exemplar: *"should only use language features introduced by the exercise **or** its
  prerequisites"*.
O docs/16 resume como "escreve três vezes com escopos deliberadamente diferentes".
- https://raw.githubusercontent.com/exercism/docs/main/building/tracks/concept-exercises.md ·
  https://exercism.org/docs/building/tracks/concept-exercises

### 2.6 Hedy: 82% dos erros de "código no nível errado" são comando antigo rodando em nível novo (§3.5)
**FATO VERIFICADO (fonte)**: Hermans, F., *"Hedy: A Gradual Language for Programming Education"*
(ICER 2020), §7.2 *"Code Ran at Wrong Level"*: de **251 programas** com esse erro, **207
(≈ 82,5%)** eram código aprendido em nível anterior rodado em nível maior — o restante usava
comandos ainda não introduzidos. O "cuja forma mudou" do docs/16 é a leitura justa do mecanismo
descrito (comando antigo executado em nível novo).
- https://hedycode.com/research/Hedy_A_Gradual_Language_for_Programming_Education_2020.pdf ·
  https://dl.acm.org/doi/abs/10.1145/3372782.3406262 (vista nos resultados; ACM bloqueia curl)

### 2.7 Saída estruturada: 100% das respostas em JSON-mode puseram a resposta antes do raciocínio; 86,99 → 23,44 com restrição de schema (§6.3)
**FATO VERIFICADO (fonte, com meio-tom)**: Tam et al., *"Let Me Speak Freely? A Study on the Impact
of Format Restrictions on Performance of Large Language Models"* (arXiv:2408.02442): §5.3 reporta
que **100% das respostas do GPT-3.5-Turbo em JSON-mode** colocaram a chave `answer` antes de
`reason` (zero-shot direto em vez de cadeia de raciocínio); a Tabela GSM8K mostra
**claude-3-haiku 86,99 → 23,44** sob restrição de schema. **Ressalva**: o "100%" é do GPT-3.5-Turbo
em JSON-mode — o docs/16 generaliza para "as respostas", mantenha o modelo específico em mente.
**Decisão de produto derivada**: todo campo de schema da engine é obrigatório e o lint reprova
decisão antes do raciocínio.
- https://arxiv.org/abs/2408.02442 · https://ar5iv.labs.arxiv.org/html/2408.02442

### 2.8 Painel de juízes: nove juízes de fronteira ≈ dois votos independentes; melhor juiz único ≥ painel (§11)
**FATO VERIFICADO (fonte)**: Apple ML Research, *"Nine Judges, Two Effective Votes: Correlated
Errors Undermine LLM Evaluation Panels"* — um painel de 9 LLMs *"provide only about 2 independent
votes' worth of information"* e *"the best single judge matches or outperforms the full panel
across all conditions"*. Mapa literal do claim do docs/16.
- https://machinelearning.apple.com/research/correlated-llm-evaluation-panels

### 2.9 Debate entre revisores perde para *self-consistency* com orçamento igual (§11)
**FATO VERIFICADO (fonte)**: a comparação é documentada por Huang et al. (2310.01798) ao
**replicar** Du et al., *"Improving Factuality and Reasoning in Language Models through Multiagent
Debate"* (arXiv:2305.14325): *"for self-consistency with an equivalent number of responses,
multi-agent debate significantly underperforms simple self-consistency using majority voting"*
(§4 do 2310.01798). O docs/16 condensa exatamente esse resultado (a réplica, não o paper original
do debate).
- https://arxiv.org/abs/2310.01798 · https://arxiv.org/abs/2305.14325

### 2.10 Cowan — 3 a 5 *chunks* em memória de trabalho (§3.6)
**FATO VERIFICADO (fonte)**: Cowan, N. (2001), *"The magical number 4 in short-term memory: A
reconsideration of mental storage capacity"*, Behavioral and Brain Sciences 24(1), 87–114. A régua
3–5 do docs/16 é a leitura usual do "4 ± 1" — conversão para "por aula" declarada como derivação
no próprio docs/16 (§3.6).
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2866134/ ·
  https://pmc.ncbi.nlm.nih.gov/articles/PMC3132122/ · https://pubmed.ncbi.nlm.nih.gov/11515286/ ·
  https://www.cambridge.org/core/journals/behavioral-and-brain-sciences/article/magical-number-4-in-shortterm-memory-a-reconsideration-of-mental-storage-capacity/44023F1147D4A1D44BDC0AD226838496 (vista nos resultados; Cambridge bloqueia curl com 429)

### 2.11 Clássicos de design instrucional: Dick & Carey, Biggs (alinhamento construtivo), backward design (§4.3)
**FATO VERIFICADO (fonte)** (páginas oficiais verificadas por fetch nesta rodada): Dick, W., Carey,
L. & Carey, J. O., *The Systematic Design of Instruction* (Pearson, 9ª ed.); Biggs, J., *aligning
teaching / constructive alignment* (página oficial Advance HE de *"Aligning Teaching for
Constructing Learning"*); Wiggins, G. & McTighe, J., *Understanding by Design* (ASCD). O ponto do
docs/16 — itens de avaliação **antes** dos materiais — é a convergência declarada entre os três.
- https://www.pearson.com/en-ca/subject-catalog/p/systematic-design-of-instruction-the/P200000000952 ·
  https://www.advance-he.ac.uk/knowledge-hub/aligning-teaching-constructing-learning ·
  https://www.ascd.org/books/understanding-by-design-expanded-2nd-edition

### 2.12 Constitutional AI: inocuidade sobe progressivamente; utilidade é o preço (§6.7)
**FATO VERIFICADO (fonte)**: Bai, Y. et al., *"Constitutional AI: Harmlessness from AI Feedback"*
(Anthropic, 2022, arXiv:2212.08073): *"model-generated critiques and revisions can be applied
repeatedly to progressively reduce harmfulness"* (Fig. 5) e a tensão utilidade × inocuidade é
central (Fig. 2; o treino que maximiza utilidade tende a aumentar nocividade e vice-versa). A frase
do docs/16 ("a inocuidade sobe monotonicamente enquanto a utilidade cai") condensa o tradeoff
medido.
- https://arxiv.org/abs/2212.08073 · https://ar5iv.labs.arxiv.org/html/2212.08073

### 2.13 Autopreferência do juiz LLM (§6.2, §11)
**FATO VERIFICADO (fonte) para o fenômeno; INFERÊNCIA/DECISÃO para o número**: Wataoka, R. et al.,
*"Self-Preference Bias in LLM-as-a-Judge"* (NeurIPS W 2024, arXiv:2410.21819) — *"LLMs overestimate
the quality of their own outputs"*, com viés significativo medido no GPT-4. O "> 50% mais provável
de marcar como satisfeito um critério que a própria saída falhou" **não está no paper**: é a
adaptação interna do projeto da métrica do paper para checklist binário — manter sob revisão.
- https://arxiv.org/abs/2410.21819 · https://ar5iv.labs.arxiv.org/html/2410.21819

### 2.14 Verificação fatorada reduz viés (§6.2)
**FATO VERIFICADO (fonte) para o mecanismo; INFERÊNCIA/DECISÃO para o fator 2**: Ren et al.,
*"Factored Internal Verification Enhances Large Language Model Factuality"* (FactPrompt) —
verificação **deliberadamente desacoplada** do caminho de raciocínio original, minimizando a
propagação de viés. O "dobra a precisão" (fator 2) não foi localizado em fonte pública — medição
interna, sob revisão.
- https://scholar.hznu.edu.cn/zh/publications/factored-internal-verification-enhances-large-language-model-fact/

### 2.15 *Retrieval practice* como técnica de alta utilidade (§7.1 R11)
**FATO VERIFICADO (fonte)**: Dunlosky, J. et al. (2013), *"Improving Students' Learning With
Effective Learning Techniques"*, Psychological Science in the Public Interest 14(1) — *retrieval
practice* (practice testing) ranqueada entre as técnicas de alta utilidade; página oficial da APS
(publica o PDF do artigo). A regra R11 do docs/16 ("comece com retrieval — uma pergunta sobre uma
aula ancestral") é a aplicação direta, decisão de produto.
- https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html

### 2.16 Element interactivity e carga germane (§3.6, §3.7, §7.1 R13)
**FATO VERIFICADO (fonte)**: Sweller, J., *"Element Interactivity and Intrinsic, Extraneous, and
Germane Cognitive Load"* (Educational Psychology Review, 2010 — ERIC EJ883815; reuso do
`03-pedagogia.md`): element interactivity determina a carga intrínseca, e a **carga germane não é
fonte independente de carga** — é redirecionamento de recursos da memória de trabalho para a
construção de esquema (base do "carga germane redistribui, não adiciona" do R13). O "≤ 120 s" do
§3.6 e o "só existem dois botões" são parâmetros/leitura de produto, não achados publicados.
- https://eric.ed.gov/?id=EJ883815 · https://link.springer.com/article/10.1007/s10648-011-9158-5

### 2.17 Predição antes da execução — PRiMM (§7.1 R2)
**FATO VERIFICADO (fonte) para a pedagogia; INFERÊNCIA/DECISÃO para a "posse monotônica"**:
Sentance, S. & Waite, J., *"PRiMM: Exploring pedagogical approaches for teaching text-based
programming in school"* (2017, ACM) — a sequência **Predict → Run → Investigate → Modify → Make** é
a base educacional do R2 (prever a saída antes de rodar, confrontar com a execução). A formulação
"posse monotônica: não é meu → parcialmente meu → meu" é desenho de interação do projeto. URL da
ACM vista nos resultados (o site bloqueia curl com 403).
- https://dl.acm.org/doi/10.1145/3137065.3137084 · https://dl.acm.org/doi/pdf/10.1145/3137065.3137084

### 2.18 Mutação como base da métrica de governança do laço (§6.6, §9.2)
**FATO VERIFICADO (fonte) para a técnica; INFERÊNCIA/DECISÃO para o uso como métrica**: teste de
mutação é técnica estabelecida — Jia, Y. & Harman, M., *"An Analysis and Survey of the Development
of Mutation Testing"* (IEEE TSE 37(5), 2011; já citado no `04-tdd-actor-critic.md`), e a decisão de
usar a **taxa de falso-passe do revisor contra mutantes** como métrica de governança do laço é
decisão de produto do P-20 (não um achado publicado).
- https://en.wikipedia.org/wiki/Mutation_testing · https://www.mendeley.com/catalogue/cffa553b-e534-3a93-a79a-549804cca5d5/ · https://doi.org/10.1109/TSE.2009.62

---

## 3. Afirmações sem fonte pública — [INFERÊNCIA/DECISÃO] justificadas

| Afirmação | § do docs/16 | Por que é [INFERÊNCIA/DECISÃO] |
|---|---|---|
| +9,4% (melhorar prompt/papel) e +15,6% (topologia multinível) | §2 P2 | Não localizada fonte pública com esses deltas. Medição interna comparando variantes de pipeline da própria rodada de pesquisa; a direção "estrutura verificável > prompt" tem eco em 2.14, sem os valores exatos. Sob revisão. |
| +129% de tokens consultando o juiz toda rodada; 38% economizados com sinal barato | §6.1 | Não localizada fonte pública com esses percentuais. Medição interna de custo dos dois pipelines (revisor em toda rodada × verificadores mecânicos primeiro). Sob revisão. |
| Auto-declaração de corretude vale +5,3 a +34,3 pontos | §6.2 | Não localizada fonte pública com a faixa exata. Medição interna (normalizador × sem normalizador); o fenômeno tem apoio qualitativo em 2.13 (self-preference). Sob revisão. |
| F1 = 0,000 na classe "incorreto" ao filtrar acusação falsa com LLM; 33% dos falsos negativos de juiz comentam statements ausentes do artefato | §6.4 | Não localizada fonte pública com F1 = 0,000/33%. Medições internas da fase de pesquisa; direção compatível com literatura de revisores LLM (FNR alto — fundo: arXiv 2603.00539, vista nos resultados). R4 (substring) e R5 (executar o repro) são as mitigações declaradas e testadas (`review/filter.ts`). |
| Avaliadores LLM de material didático agrupam tudo entre 2,9 e 3,1; checklist binário sobe concordância em 0,45 | §6.5 | Os valores 2,9–3,1 e +0,45 são medição interna; a **direção** tem fonte — *"Designing Reliable LLM-Assisted Rubric Scoring for Constructed Responses"* (arXiv:2604.12227v1): grade de checklist mais fina melhora consistência vs. holística. Sob revisão nos números. |
| "Seja conservador"/"reporte só o grave" → o modelo reporta menos, literalmente | §6.5 | Não localizada fonte pública sistemática. Comportamento medido em avaliação interna (indício industrial: experimento de prompt de revisão do GitLab #596680, vista nos resultados). Decisão: o revisor reporta tudo, a triagem é etapa separada. |
| Ganho concentrado na 1ª rodada; a 4ª compra ~0,9 de 6,8 pontos | §6.6 | Os valores 0,9/6,8 são medição interna do orçamento de refino; a direção (ganho não-monotônico, concentrado no início) tem apoio na literatura (fundo: arXiv 2509.06822, vista nos resultados). Default implementado: 1 rodada por artefato, teto 3. |
| Revisor com taxa de falso-passe ≥ (1−τ)/2 (τ=0,10 → 0,45) nunca remove nada | §6.6 | **Inferência matemática derivada no projeto** (análise de ponto fixo do laço revisão→correção sob taxa de falso-passe); sem fonte pública. Implementada como limiar de desligamento em `quality/judgeCalibration.ts` (P-20). |
| 55% dos apontamentos não resolvidos em produção são decisão de projeto intencional | §6.7 | Medição interna (P-18) do ledger de rejeições (método: contagem no estado de produção dos apontamentos `excecao_intencional`). Sem fonte pública. Decisão implementada: `excecao_intencional` obrigatória. |
| Proibição declarada em prosa vaza em taxa de dois dígitos | §11 | "Taxa de dois dígitos" é medição interna; a direção (restrições em prosa cumpridas de forma incompleta; hierarquia de instruções importa) tem apoio na literatura de instruction hierarchy (fundo: arXiv 2603.16152, vista nos resultados). Decisão: toda proibição relevante vira checagem estática. |
| 43% das alucinações se repetem em 10 de 10 amostras; voto majoritário ratifica | §11 | 43%/10-de-10 é medição interna (amostragem repetida do revisor). A direção (votação ratifica alucinação sistemática) é coerente com a literatura de viés persistente de amostragem, sem o número em fonte verificada. Decisão: R4 + R5 + pin do achado, nunca votação. |
| OutputChannel: 165 exercícios com solução e testes, 51 (30,9%) passavam nos próprios testes | §10 | Medição interna sobre corpus de exercícios gerados (benchmark próprio da rodada de pesquisa). Sem fonte pública. Decisão implementada: campo aditivo `outputChannel` + especificação J. |
| Exercism JS — 44 de 90 arestas declaradas transitivamente redundantes | §3.4 | **Contagem derivada do dataset público e REPRODUZIDA nesta rodada** sobre `exercism/javascript/config.json`: 44 arestas de pré-requisito transitivamente redundantes confirmadas. **Ressalva**: o denominador do docs/16 (90) difere do medido hoje (87 arestas concept-only; 443 incluindo practice) — o 44 bate; o 90 é a contagem da data da medição original, manter sob revisão. |
| Exercism JS — contagens por exercício: 21 ensinam 1, 8 ensinam 2, zero 3+ | §3.6 | **Reproduzida nesta rodada** por contagem no dataset público (`config.json`): dos 30 concept exercises atuais, 21 com 1 conceito, 8 com 2, 0 com 3+, 1 com 0 — a distribuição 21/8/0 do docs/16 confere (o track cresceu de 22 para 30 exercícios). Medição derivada, sem fonte secundária. |
| "Alunos vão significativamente pior em problemas de dois passos do que em dois problemas de um passo" | §3.7 | [INFERÊNCIA] sobre a literatura de CLT (element interactivity, 2.16: mais elementos interativos por unidade = mais carga). Sem fonte com a comparação direta; decisão implementada: toda composição é nó próprio marcado `role:"integration"`. |
| "Perguntas sobre estado têm taxa de erro dramaticamente mais alta" | §7.1 R10 | [INFERÊNCIA] da literatura de ensino de programação (visualização/raciocínio de estado é difícil — fundo: "A study of the development of students' visualizations of program state", vista nos resultados). Sem fonte com a estatística exata; decisão: R10 exige item "qual é o estado agora?". |
| D1–D5 (§12) — políticas de produto | §12 | **Decisões de produto** por definição; o docs/16 §13 as declara como decisões; valores de política (receptive-seed, tetos, severidade aviso) são decisões do repositório, registradas no docs/16 e nos prompts. |
| 26% dos blocos cercados sem tag de linguagem; 29 acessos computados não-literais em 354 arquivos | §5.3 | Mediações do extrator ANTERIOR (fase de análise); a medição vigente é outra (68 blocos sem tag · 4 parse errors — §1, com comando). Mantidas como contexto histórico. |
| 105 de 134 referências de `prerequisites` apontando para aula em vez de conceito | §3.4, §14 | Medição do extrator ANTERIOR (fase de análise); o audit atual não expõe essa coluna (as invariantes I16/DEC do audit são a métrica vigente). Contexto histórico documentado. |

---

## Fontes

- Huang, J. et al. "Large Language Models Cannot Self-Correct Reasoning Yet." ICLR 2024, arXiv:2310.01798. https://arxiv.org/abs/2310.01798 · https://ar5iv.labs.arxiv.org/html/2310.01798
- Madaan, A. et al. "Self-Refine: Iterative Refinement with Self-Feedback." arXiv:2303.17651. https://arxiv.org/abs/2303.17651
- Gou, Z. et al. "CRITIC: Large Language Models Can Self-Correct with Tool-Interactive Critiquing." arXiv:2305.11738. https://arxiv.org/abs/2305.11738
- Shinn, N. et al. "Reflexion: Language Agents with Verbal Reinforcement Learning." arXiv:2303.11366. https://arxiv.org/abs/2303.11366
- Bai, Y. et al. "Constitutional AI: Harmlessness from AI Feedback." arXiv:2212.08073. https://arxiv.org/abs/2212.08073
- "On the Effectiveness of LLM-as-a-judge for Code Generation and Summarization" (κ=0,21). arXiv:2507.16587. https://arxiv.org/abs/2507.16587
- K12-KGraph / K12-Bench (57% exact match em currículo). arXiv:2605.09635. https://arxiv.org/abs/2605.09635
- Tam, D. et al. "Let Me Speak Freely? Format Restrictions and LLM Performance." arXiv:2408.02442. https://arxiv.org/abs/2408.02442
- Kohli, G. "Nine Judges, Two Effective Votes: Correlated Errors Undermine LLM Evaluation Panels." Apple ML Research. https://machinelearning.apple.com/research/correlated-llm-evaluation-panels
- Du, Y. et al. "Improving Factuality and Reasoning in Language Models through Multiagent Debate." arXiv:2305.14325. https://arxiv.org/abs/2305.14325
- Wataoka, R. et al. "Self-Preference Bias in LLM-as-a-Judge." arXiv:2410.21819. https://arxiv.org/abs/2410.21819
- Ren et al. "Factored Internal Verification Enhances Large Language Model Factuality" (FactPrompt). https://scholar.hznu.edu.cn/zh/publications/factored-internal-verification-enhances-large-language-model-fact/
- Exercism docs — "Concept exercises" (regras de escopo stub/tests/exemplar): https://raw.githubusercontent.com/exercism/docs/main/building/tracks/concept-exercises.md · https://exercism.org/docs/building/tracks/concept-exercises
- Exercism JS track — dataset (config.json) das contagens §3.4/§3.6: https://raw.githubusercontent.com/exercism/javascript/main/config.json · https://exercism.org/tracks/javascript · https://github.com/exercism/javascript
- Hermans, F. "Hedy: A Gradual Language for Programming Education." ICER 2020. https://hedycode.com/research/Hedy_A_Gradual_Language_for_Programming_Education_2020.pdf · https://dl.acm.org/doi/abs/10.1145/3372782.3406262
- Cowan, N. "The magical number 4 in short-term memory." Behavioral and Brain Sciences 24(1), 2001. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2866134/ · https://pmc.ncbi.nlm.nih.gov/articles/PMC3132122/ · https://pubmed.ncbi.nlm.nih.gov/11515286/
- Sweller, J. "Element Interactivity and Intrinsic, Extraneous, and Germane Cognitive Load." EPR 2010. https://eric.ed.gov/?id=EJ883815 · https://link.springer.com/article/10.1007/s10648-011-9158-5
- Biggs, J. "Aligning Teaching for Constructing Learning" (constructive alignment), Advance HE. https://www.advance-he.ac.uk/knowledge-hub/aligning-teaching-constructing-learning
- Wiggins, G. & McTighe, J. "Understanding by Design" (backward design), ASCD. https://www.ascd.org/books/understanding-by-design-expanded-2nd-edition
- Dick, W., Carey, L. & Carey, J. O. "The Systematic Design of Instruction", Pearson (9ª ed.). https://www.pearson.com/en-ca/subject-catalog/p/systematic-design-of-instruction-the/P200000000952
- Dunlosky, J. et al. "Improving Students' Learning With Effective Learning Techniques." PSPI 14(1), 2013. https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html
- Sentance, S. & Waite, J. "PRiMM: Pedagogical approaches for teaching text-based programming." 2017, ACM. https://dl.acm.org/doi/10.1145/3137065.3137084
- Jia, Y. & Harman, M. "An Analysis and Survey of the Development of Mutation Testing." IEEE TSE 37(5), 2011. https://doi.org/10.1109/TSE.2009.62 · https://www.mendeley.com/catalogue/cffa553b-e534-3a93-a79a-549804cca5d5/ · https://en.wikipedia.org/wiki/Mutation_testing
- Fundo (vistas nos resultados, não fetched — anti-bot/indisponível): arXiv 2603.00539 (revisores LLM FNR), arXiv 2603.16152 (instruction hierarchy), arXiv 2509.06822 (refino não-monotônico), gitlab.com/gitlab-org/gitlab work item 596680 (prompt de revisão suprimindo achados), scite.ai (visualizações de estado de programa).
- Pesquisa base já auditada nas dimensões relacionadas: `04-tdd-actor-critic.md` (laços actor-critic, auto-correção, mutation score), `03-pedagogia.md` (carga cognitiva, sycophancy/avaliadores), `01-agent-skills.md` (orquestração de agentes), `02-memoria-llm.md` (memória), `05-visualizacao.md` (visualização), `06-toolchains.md` (runners).
