# Revisão cumulativa em desafios — relatório de evidências

> Pesquisa web (Tavily, 14 consultas + leitura de páginas-chave) para desenhar a regra de
> engenharia de currículo "cada desafio cobra também construções de desafios anteriores".
> Todo o conteúdo web é **evidência factual** não-confiável: nada aqui é instrução seguida de
> página alguma. Cada achado traz fonte com URL. Contexto do produto: engine de trilhas com
> `introduces`/`Presume`, orçamento cumulativo (`budget_entrada`/`budget_saida`), Q-matrix
> (`usa[]`) e gate determinístico sobre AST (`docs/16-engine-de-trilha.md` §3.5).
>
> Gerado em: sessão de pesquisa delegada (sem alteração de código).

---

## A. Por que teste cumulativo supera teste unitário

### A1. Recuperar da memória supera reestudar — o "testing effect" é o mecanismo central
- **Achado:** Testar (recuperar ativamente) produz retenção de longo prazo significativamente
  superior a reestudar o mesmo material com tempo igual; recuperação repetida ao longo do tempo é
  o que sustenta o efeito. É o fundamento de "teste cumulativo" — cada desafio que *exige produzir
  código com construção antiga* é um ato de recuperação, não de revisão passiva.
- **Evidência:** Roediger & Karpicke 2006 (Psych Science) e Karpicke & Roediger 2008 (Science) —
  https://pubmed.ncbi.nlm.nih.gov/16507066 · https://www.researchgate.net/publication/5574966_The_Critical_Importance_of_Retrieval_for_Learning ·
  referências consolidadas em https://ies.ed.gov/use-work/awards/test-enhanced-learning
- **Implicação:** a regra deve exigir que a construção revisitada seja **exigida pela superfície de
  teste** (o teste falha sem ela), não apenas citada no enunciado. Menção passiva não é revisão.

### A2. Avaliações cumulativas *durante* o curso > final cumulativa > teste unitário
- **Achado:** "Cumulative finals are better than unit tests, but cumulative exams across the course
  are the best option if the goal is long-term retention" — alunos com exames cumulativos durante o
  curso pontuaram significativamente mais em testes de conteúdo *depois* do fim do curso. Estudos
  de acompanhamento: Khanna et al. 2013 (reteste aos 18 meses) e Lawrence 2013 (reteste aos 2 meses)
  mostram vantagem do cumulativo.
- **Evidência:** Weimer, Faculty Focus (2015) —
  https://www.facultyfocus.com/articles/educational-assessment/examining-the-benefits-of-cumulative-tests-and-finals ·
  síntese Khanna/Lawrence em https://pmc.ncbi.nlm.nih.gov/articles/PMC8423584/
- **Implicação:** a revisão cumulativa deve estar em **todo desafio** (micro-cumulativo), não só nos
  desafios de módulo/final. Desafio de módulo é reforço, não o mecanismo.

### A3. Proporção validada empiricamente: ~50% do desafio cobre material anterior
- **Achado:** Em estudo controlado (92 alunos, 2 seções, exames semanais de 20 itens múltipla
  escolha), a seção com **50% das questões do conteúdo atual + 50% de conteúdo anterior** (distribuído
  pelas semanas anteriores) obteve **+4,91% na prova final cumulativa** (d = 0,44) e mais notas A/B
  (80% vs 71,4% de aprovação). Ex.: no exame 3 → 10 itens da semana 3, 5 da semana 2, 5 da semana 1.
- **Evidência:** Gayman et al. 2021, J Behav Educ — https://pmc.ncbi.nlm.nih.gov/articles/PMC8423584/
- **Implicação:** proporção-alvo de **revisão ≈ 40–50% dos cenários** de um desafio. É o único número
  com validação experimental direta de "quanto do desafio deve ser revisão".

### A4. Piso empírico: 20% de conteúdo acumulado já dá efeito; abaixo disso não há base
- **Achado:** Lawrence (2013) obteve +2,90% na final e vantagem no reteste de 2 meses com exames
  semanais só **20%** cumulativos; a própria autora hipotetizou que 50% seria melhor — o estudo
  Gayman (A3) dá suporte a isso (efeito maior com 50%). A comparação direta 20% vs 50% vs 80% ainda
  não foi feita: não há evidência de que mais que ~50% ajude.
- **Evidência:** https://pmc.ncbi.nlm.nih.gov/articles/PMC8423584/ (síntese de Lawrence 2013)
- **Implicação:** **piso de 20%, alvo de ~40%, teto de ~50%** de revisão por desafio. Acima de 50% o
  desafio deixa de praticar o conteúdo novo da aula (e a evidência não sustenta ganho extra).

### A5. Cada construção convém ser recuperada ~3 vezes, em momentos separados
- **Achado:** No estudo Larsen et al. 2009, três testes espaçados por duas semanas no mesmo conteúdo
  renderam **+13%** num exame 6 meses depois, comparado com três momentos de reestudo. Num estudo em
  9 cursos STEM ("barreiras"), cada objetivo de aprendizagem teve **3 questões distribuídas por 3
  quizzes em 5 semanas** (vs 3 questões num quiz só) — desenho que maximizou retenção no fim do semestre.
- **Evidência:** https://pmc.ncbi.nlm.nih.gov/articles/PMC8423584/ (Larsen et al. 2009) ·
  https://aaas-iuse.org/resource/helping-students-remember-can-spaced-retrieval-practice-improve-stem-course-performance
- **Implicação:** parâmetro de cobertura: **cada construção `introduces` deve ser revisitada em ≥3
  desafios distintos** ao longo do curso, distribuídos (nunca 2 revisões consecutivas dela).

### A6. Anunciar o que será reavaliado melhora a retenção — a declaração explícita é parte pedagógica
- **Achado:** Alunos que **esperavam ser retestados** no material demonstraram mais domínio depois do
  que alunos não informados; a explicação é que a expectativa de reteste aumenta a formação de ligações
  entre tópicos e reduz o descarte do material. Também: "retrieval-induced facilitation" — testar parte
  do material facilita a retenção do material relacionado não testado.
- **Evidência:** Szpunar et al. 2007 (citado em) https://pmc.ncbi.nlm.nih.gov/articles/PMC8423584/ ·
  Chan, McDermott & Roediger 2006 (citado em) https://ies.ed.gov/use-work/awards/test-enhanced-learning
- **Implicação:** a **declaração explícita** de "este desafio cobre X, Y (novos) + A, B (revisados)"
  no enunciado não é burocracia de gate: é intervenção pedagógica. Deve aparecer para o aluno, não só
  no `meta.json`.

### A7. Revisão cumulativa ajuda principalmente os alunos mais fracos — e não deve ser imposta aos fortes
- **Achado:** Estudo quasi-experimental em biologia introdutória (7 provas cumulativas com ~50% de
  unidades anteriores vs 7 não-cumulativas): sem diferença na final **quando as provas já são frequentes**;
  mas ganho de retenção **5 meses depois** para alunos com raciocínio formal baixo. Invertido para
  alunos de raciocínio alto: retiveram **mais** com provas não-cumulativas.
- **Evidência:** Bailey et al. 2021, PLOS ONE —
  https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0250143
- **Implicação:** o teto de ~50% (A4) protege os alunos fortes; para desafios avançados/integração a
  revisão pode descer ao piso (20%); a regra deve ter **piso baixo e teto**, não proporção fixa única.
  Também: quando a avaliação já é frequente (nosso caso: 1 desafio por aula), o benefício principal é
  **retenção de longo prazo**, não nota imediata — calibrar expectativas com isso.

### A8. Teste cumulativo motiva sobretudo os alunos de baixo desempenho; resistência inicial é esperada
- **Achado:** "Having multiple cumulative exams may motivate low-scoring students to engage in
  behaviors that promote long-term retention". Alunos em geral **não gostam** de exames cumulativos
  justamente porque exigem mais estudo distribuído — a queixa é o mecanismo funcionando. Na prática,
  a percepção não é ruim: no estudo Gayman, "alegre-me que os exames foram cumulativos" = 4,53/7
  (vs 4,95 não-cumulativo, n.s.).
- **Evidência:** https://www.facultyfocus.com/articles/teaching-and-learning/cumulative-exams-motivate-students ·
  https://pmc.ncbi.nlm.nih.gov/articles/PMC8423584/
- **Implicação:** manter revisão **low-stakes** (erro em cenário de revisão não pode derrubar o desafio
  sozinho nem rebaixar estado com dureza) e comunicar a razão da regra na primeira vez.

---

## B. Espaçamento (spacing)

### B9. Prática distribuída > massada — o achado mais robusto da ciência da aprendizagem
- **Achado:** Meta-análise de 254 estudos (>14.000 participantes) confirma que distribuir a prática
  no tempo supera concentrá-la; prática de teste e distribuída são as **duas únicas** técnicas de
  "alta utilidade" do levantamento Dunlosky et al. 2013 (à frente de sublinhar, reler, resumir).
- **Evidência:** https://www.finitoai.app/blogs/spaced-repetition-science-medical-school (síntese com
  citações) · https://asmepublications.onlinelibrary.wiley.com/doi/full/10.1111/medu.14025 ·
  https://www.edresearch.edu.au/guides-resources/practice-guides/spacing-and-retrieval-practice-guide-full-publication
- **Implicação:** a janela de revisão deve ser **por distância em aulas/dias**, não "tudo que já foi
  ensinado". Amostrar construções de aulas distantes ≥2 posições, não só da aula anterior.

### B10. Intervalos fixos-equivalentes superam intervalos expansivos para retenção de longo prazo
- **Achado:** "Expanding Retrieval Practice Promotes Short-Term Retention, but Equally Spaced Retrieval
  Enhances Long-Term Retention" — para durar até o fim do curso, espaçamento regular vence o agendamento
  expansivo tipo SM-2. A curva de esquecimento (Ebbinghaus) sugere revisitar em ~dia seguinte, ~7 dias,
  ~21–31 dias; depois 3/6/12 meses.
- **Evidência:** Karpicke & Roediger 2007 (citado em) https://ies.ed.gov/use-work/awards/test-enhanced-learning ·
  https://www.learningeverest.com/addressing-the-forgetting-curve-in-instructional-design ·
  https://en.wikipedia.org/wiki/Spaced_repetition
- **Implicação:** regra determinística **simples**: janela fixa "revisitar cada construção em
  desafios a ~1, ~3 e ~7 lições de distância" (equiespaçado em unidades de aula) — sem agendador
  expansivo por aluno dentro da regra de currículo (o agendamento adaptativo já existe na máquina de
  proficiência; a regra do desafio é estática).

### B11. Três recuperações em ~5 semanas é o desenho com resultado replicado em STEM
- **Achado:** Protocolo AAAS/IUSE em 9 cursos STEM: 3 questões por objetivo distribuídas por 3 quizzes
  em 5 semanas > 3 questões num quiz só, medido no teste do fim do semestre. Combine com A5 (Larsen:
  3× espaçado por 2 semanas → +13% a 6 meses).
- **Evidência:** https://aaas-iuse.org/resource/helping-students-remember-can-spaced-retrieval-practice-improve-stem-course-performance
- **Implicação:** métrica de auditoria: "toda construção produtiva tem ≥3 revisões agendadas em
  desafios cuja separação mediana ≥2 aulas, dentro de uma janela de ~5–8 semanas".

---

## C. Interleaving (mistura de tópicos)

### C12. Prática intercalada > blocada para retenção, discriminação e transferência
- **Achado:** Misturar tipos de problema numa sessão (ordem imprevisível) produz melhor aprendizagem
  que praticar blocos por tipo (Dunlosky et al. 2013; Carpenter 2014). Bloqueado leva o aluno a
  ignorar o enunciado e focar só no que varia — ele acerta "no automático" sem escolher a técnica.
- **Evidência:** https://takinglearningseriously.com/wp-content/uploads/2020/05/Interleaved-practice-TLS.pdf ·
  https://www.uwlax.edu/catl/guides/teaching-improvement-guide/how-can-i-improve/interleaved-practice ·
  https://justinmath.com/cognitive-science-of-learning-interleaving
- **Implicação:** os cenários de revisão de um desafio devem vir de **construções diferentes** e
  embaralhados entre si (não "3 cenários de recursão seguidos"); o desafio deve forçar *escolher* a
  construção certa, não repetir a mesma operação.

### C13. Interleaving é mais valioso justamente para construções confundíveis
- **Achado:** Prática blocada impede discriminar entre tipos de problema parecidos (ex.: MDC vs MMC,
  onde as instruções até se distinguem e o aluno ainda assim erra). Em programação, os pares clássicos
  são `if`/`else if`/ternário, declaração vs expressão de função, `while` vs `for` — a própria engine
  já trata "mesma ideia em forma nova" como evento de currículo (`docs/16` §3.5, estado `new`).
- **Evidência:** https://justinmath.com/cognitive-science-of-learning-interleaving
- **Implicação:** a seleção do *que* revisar deve priorizar **pares confusáveis com a construção nova
  da aula atual** (ex.: aula de `for` revisita `while` no mesmo desafio) — é o interleaving com maior
  retorno e calibra a dificuldade naturalmente.

---

## D. Currículo em espiral (Bruner) — revisitar com profundidade crescente

### D14. Revisitar ≠ repetir: cada volta à construção deve ter profundidade/contexto novos
- **Achado:** O currículo em espiral de Bruner (1960) tem 3 princípios: (1) aprendizagem cíclica,
  (2) **profundidade crescente a cada iteração**, (3) construção sobre conhecimento prévio. Cada
  retorno tem objetivos adicionais — não é "a mesma explicação de novo". O modelo evita a cobertura
  "uma milha de largura e uma polegada de profundidade" (Schmidt, McKnight & Raizen 1997).
- **Evidência:** https://www.cambridgeassessment.org.uk/Images/598388-perspectives-on-curriculum-design-comparing-the-spiral-and-the-network-models.pdf ·
  https://helpfulprofessor.com/spiral-curriculum · https://www.innerdrive.co.uk/blog/the-spiral-curriculum ·
  https://www.ebsco.com/research-starters/education/spiral-curriculum
- **Implicação:** cenário de revisão deve exigir a construção antiga **em papel novo** (novo domínio do
  problema, interação com a construção nova, ou restrição adicional) — repetição literal do teste da
  aula original não conta como revisão válida para o gate.

### D15. Dose pequena e frequente ("strand curriculum"): 5–10 min por habilidade, revisitada dia após dia
- **Achado:** No modelo de "strand/teia", cada lição aborda múltiplas habilidades por pouco tempo,
  revisitadas a cada dia por muitas lições (Snider 2004, p. 34) — contramoda à unidade fechada de
  2 semanas sobre um só tópico.
- **Evidência:** https://helpfulprofessor.com/spiral-curriculum (citando Snider 2004)
- **Implicação:** revisão em **doses pequenas por desafio** (1–3 cenários) e alta frequência (todos os
  desafios), em vez de blocos de revisão grandes e raros. Cabe no orçamento de 120 s já existente.

---

## E. Alinhamento, mapa de currículo e gates

### E16. Constructive alignment: o que é cobrado tem de estar alinhado ao que foi ensinado — nos dois sentidos
- **Achado:** Alinhamento construtivo (Biggs): resultados pretendidos, atividades e avaliação em
  concerto; instrução alinhada produz ganhos até 4× maiores (Cohen 1987). A avaliação deve capturar
  os outcomes; cobrar o que não foi ensinado invalida o alinhamento (e o oposto — ensinar o que nunca
  é cobrado — desperdiça currículo).
- **Evidência:** https://www.cs.auckland.ac.nz/courses/compsci747s2c/lectures/teaching-through-constructive-alignment.pdf ·
  https://mededmentor.org/theory-database/theory-index/constructive-alignment ·
  https://www.intechopen.com/online-first/1241626
- **Implicação:** o gate cumulativo precisa das **duas direções**: (a) somente: `revisados ⊆
  budget_entrada(N)` (já existe o orçamento); (b) cobertura: toda construção introduzida deve aparecer
  como revisão em algum desafio dentro da janela (a Q-matrix `usa[]` é o mapa para isso).

### E17. Backward design + curriculum mapping: partir dos outcomes e auditar a matriz
- **Achado:** Backward design (Wiggins & McTighe) é reconhecido por impacto em coerência curricular e
  validade de avaliação; course mapping explicita a correspondência outcome ↔ atividade ↔ avaliação e
  revela lacunas/excessos. O artigo ACM 2025 sobre backward design em cursos reforça o alinhamento
  ponta-a-ponta.
- **Evidência:** https://dl.acm.org/doi/fullHtml/10.1145/3760213.3704734 ·
  https://www.coursemapguide.com/backward-design ·
  https://kpcrossacademy.ua.edu/beyond-learning-objectives-backward-design-as-a-framework-for-instructional-alignment
- **Implicação:** a declaração `reviews[]` do desafio é a **célula da Q-matrix explícita**; o audit
  existente já deriva o orçamento por aula — a regra cumulativa acrescenta a coluna "quem revisa quem"
  e uma checagem de fecho (nenhuma construção órfã de revisão dentro da janela).

### E18. Mastery learning: gates de baixo risco com remediação, e o cuidado com objetivos amplos
- **Achado:** Mastery learning (Bloom/Keller): forma curta, frequentes, **low-stakes**, com remediação
  até demonstrar domínio antes de seguir; em engenharia de software (UBC, ICSE SEET 2019) quizzes com
  retake até passar fizeram os instrutores de cursos seguintes confiarem nos pré-requisitos. MAS:
  mastery learning tem evidência positiva para performances **estreitas e bem definidas** e evidência
  negativa para outcomes amplos (Slavin 1990); alunos orientados a aprendizagem profunda performam mal
  sob metas estreitas (Lai & Biggs 1994).
- **Evidência:** https://pmc.ncbi.nlm.nih.gov/articles/PMC10159400 ·
  https://www.cs.ubc.ca/~ebani/papers/MasteryLearningSCAtScale_ICSE_SEET_2019.pdf ·
  https://digitalcommons.unomaha.edu/cgi/viewcontent.cgi?article=1155&context=tedfacpub ·
  https://www.cs.auckland.ac.nz/courses/compsci747s2c/lectures/teaching-through-constructive-alignment.pdf
- **Implicação:** o **gate** da regra cumulativa deve validar *estrutura* (a revisão foi declarada e é
  exercida pelo teste), não impor "100% de acerto na revisão" ao aluno. Erro em revisão dispara
  remediação/reagendamento (máquina de proficiência), nunca trava a progressão de forma absoluta.

---

## F. Desenho de itens de revisão

### F19. Low-stakes, curtas e frequentes: 3–7 itens por semana; revisão vale pouco ou nada na nota
- **Achado:** Boas práticas convergem: quizzes curtos e frequentes (3–7 itens/semana), baixa
  pontuação, feedback, propósito comunicado ("é para aprender, não para punir"), randomização. O
  retrieval practice deve ser low/no-stakes, frequente, espaçado, com variedade de formatos.
- **Evidência:** https://online.tcsg.edu/training/use-frequent-low-stakes-quizzes ·
  https://pdf.retrievalpractice.org/RetrievalPracticeGuide.pdf ·
  https://www.structural-learning.com/post/testing-effect-retrieval-practice
- **Implicação:** 1–3 cenários de revisão por desafio de aula (proporção dentro do total, ver A3/A4);
  peso avaliativo da revisão menor que o do conteúdo novo; dizer ao aluno quais cenários são revisão.

### F20. Nunca repetir o mesmo item: variar superfície E conceito; feedback correto é obrigatório
- **Achado:** No estudo de sala (52 itens de final codificados), nenhuma questão foi repetida
  literalmente: itens de revisão compartilhavam o conteúdo mas mudavam a **superfície** (n=5) ou o
  **nível conceitual** (n=...) — e ainda assim houve ganho (efeito de teste com variação). Feedback
  correto após recuperação é o que transforma erro em aprendizado (Roediger & Butler 2011).
- **Evidência:** https://files.eric.ed.gov/fulltext/EJ1303358.pdf ·
  https://pdf.retrievalpractice.org/RetrievalPracticeGuide.pdf ·
  https://www.researchgate.net/publication/5574966_The_Critical_Importance_of_Retrieval_for_Learning
- **Implicação:** cenário de revisão = **instância nova** da construção (enunciado/dados/contexto
  novos), nunca clone do teste da aula; quando o aluno falha em cenário de revisão, o feedback deve
  **nomear a construção antiga perdida** (o harness já reporta esperado/obtido — acrescentar o rótulo
  "isto era revisão de `while`, da aula 12").

### F21. Interleaving + recuperação exige discriminação: o enunciado não pode dizer qual construção usar
- **Achado:** Em prática blocada o aluno ignora a instrução e resolve por reconhecimento do formato;
  o ganho do interleaving vem justamente de **escolher a técnica** antes de executar.
- **Evidência:** https://justinmath.com/cognitive-science-of-learning-interleaving ·
  https://takinglearningseriously.com/wp-content/uploads/2020/05/Interleaved-practice-TLS.pdf
- **Implicação:** nos cenários de revisão, o enunciado descreve o **comportamento esperado**, não a
  construção a usar (o gate continua conferindo que a construção foi exercida na solução/teste).

---

## G. Riscos e calibração

### G22. Dificuldades desejáveis: desempenho imediato PIORA antes de melhorar — não é regressão
- **Achado:** Spacing e interleaving prejudicam o teste imediato e ajudam o retardado (Bjork & Bjork;
  estudo de sala: efeito prejudicial do spacing no teste imediato, interleaving neutro ali). São
  "dificuldades desejáveis": práticas que parecem piores e rendem mais depois.
- **Evidência:** https://my.chartered.college/impact_article/the-application-of-spacing-and-interleaving-approaches-in-the-classroom ·
  https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf
- **Implicação:** a taxa de acerto na primeira tentativa dos desafios cumulativos deve cair um pouco
  — **não calibrar a regra para baixo por causa disso**; calibrar pelo desempenho retardado
  (desafios de módulo, retenção a 4+ semanas).

### G23. Dificuldades indesejáveis: revisão que o aluno não consegue superar vira ruído — sobrecarga cognitiva
- **Achado:** Se o aluno não tem o conhecimento de base para responder, a dificuldade deixa de ser
  desejável e passa a ser obstáculo intransponível (Bjork & Bjork). Alunos sobrecarregados se beneficiam
  menos de interleaving; andaime (scaffolding) reduz a carga.
- **Evidência:** https://cirl.etoncollege.com/desirable-difficulties ·
  https://www.structural-learning.com/post/robert-bjork-teachers-guide-desirable
- **Implicação:** (i) **rampa**: N=0 nas aulas 1–2, N=1 nas aulas 3–4, N≥2 depois; (ii) revisar só
  construções com evidência de ensino (`budget_entrada`), nunca "presumidas" sem aula; (iii) revisão
  não pode exigir simultaneamente construção nova frágil + construção antiga frágil no mesmo cenário.

### G24. Comparação CS1/CS2: avaliação cumulativa favorece retenção para cursos seguintes; caminhos de pré-requisito variam
- **Achado:** Em CS1→CS2, a análise de 7 anos (13.000+ alunos) mostra que a variância de preparação
  entre caminhos de entrada (AP vs curso interno vs transferência) exige **avaliação diversificada**
  (projetos, exames, notas) para monitorar sucesso; e o artigo-guia de avaliação em cursos de
  programação nota que o *design* de avaliação é subestudado mesmo sendo decisivo. Test-driven learning
  (Janzen & Saiedian 2008) associa prática orientada por testes a mais testes escritos e melhor
  desempenho em CS2.
- **Evidência:** https://peer.asee.org/investigating-the-effects-of-prerequisite-cs1-options-for-a-cs2-course-through-an-analysis-of-student-project-scores-in-cs2.pdf ·
  https://www.scitepress.org/Papers/2022/110958/110958.pdf ·
  https://dl.acm.org/doi/pdf/10.1145/1352135.1352315
- **Implicação:** a regra cumulativa funciona como **diagnóstico contínuo de pré-requisito**: quando o
  aluno falha em revisão de construção antiga, o sinal é "pré-requisito frágil", e o fluxo natural é
  reagendar essa construção (máquina de estados T3/T5) em vez de só reprovar o desafio.

### G25. Estudo em curso introdutório de programação com espaçamento/interleaving: aplicável e pede andaimagem
- **Achado:** Há caso publicado aplicando spaced retrieval practice, interleaving e metacognição em
  curso introdutório de programação (SIGCSE 2024), coerente com a direção da regra; as experiências de
  sala (Learning Scientists) mostram que a implementação sem andaimagem (prazos, notas permitidas no
  início, remoção gradual) falha nas primeiras semanas antes de funcionar.
- **Evidência:** https://dl.acm.org/doi/10.1145/3629296.3629362 ·
  https://www.learningscientists.org/blog/2019/5/9-1
- **Implicação:** nos primeiros desafios cumulativos, permitir andaimagem transitória (dica que nomeia
  a construção revisada) sem contar como "revisão cumprida" — coerente com as classes A/B/C de dica já
  existentes no produto.

---

## Fontes (todas as URLs usadas)

**Testing effect / avaliação cumulativa**
1. https://pubmed.ncbi.nlm.nih.gov/16507066 (Roediger & Karpicke 2006)
2. https://www.researchgate.net/publication/5574966_The_Critical_Importance_of_Retrieval_for_Learning (Karpicke & Roediger 2008)
3. https://ies.ed.gov/use-work/awards/test-enhanced-learning (compêndio de referências, Larsen 2009, Chan 2006)
4. https://www.facultyfocus.com/articles/educational-assessment/examining-the-benefits-of-cumulative-tests-and-finals
5. https://www.facultyfocus.com/articles/teaching-and-learning/cumulative-exams-motivate-students
6. https://pmc.ncbi.nlm.nih.gov/articles/PMC8423584/ (Gayman et al. 2021 — 50%/50%, +4,91%)
7. https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0250143 (Bailey et al. 2021)
8. https://files.eric.ed.gov/fulltext/EJ1303358.pdf (low-stakes quizzes, variação de itens)
9. https://www.researchgate.net/profile/Akira-Iwata-2/publication/383151688_How_Can_Cumulative_Tests_Be_Applicable_to_Effective_L2_Vocabulary_Instruction_Annual_Review_of_English_Language_Education_in_Japan_33_1-16 (testes cumulativos em vocabulário)

**Spacing / espiral**
10. https://www.finitoai.app/blogs/spaced-repetition-science-medical-school (meta-análise 254 estudos)
11. https://asmepublications.onlinelibrary.wiley.com/doi/full/10.1111/medu.14025 (Versteeg 2020)
12. https://aaas-iuse.org/resource/helping-students-remember-can-spaced-retrieval-practice-improve-stem-course-performance (3 itens × 3 quizzes × 5 semanas)
13. https://www.edresearch.edu.au/guides-resources/practice-guides/spacing-and-retrieval-practice-guide-full-publication
14. https://www.learningeverest.com/addressing-the-forgetting-curve-in-instructional-design (checkpoints 1d/7d/21d)
15. https://en.wikipedia.org/wiki/Spaced_repetition (Ebbinghaus, Landauer & Bjork 1978)
16. https://www.cambridgeassessment.org.uk/Images/598388-perspectives-on-curriculum-design-comparing-the-spiral-and-the-network-models.pdf
17. https://helpfulprofessor.com/spiral-curriculum (Snider 2004, 3 princípios)
18. https://www.innerdrive.co.uk/blog/the-spiral-curriculum
19. https://www.ebsco.com/research-starters/education/spiral-curriculum
20. https://www.structural-learning.com/post/the-spiral-curriculum-a-teachers-guide

**Interleaving / dificuldades desejáveis**
21. https://takinglearningseriously.com/wp-content/uploads/2020/05/Interleaved-practice-TLS.pdf
22. https://www.uwlax.edu/catl/guides/teaching-improvement-guide/how-can-i-improve/interleaved-practice
23. https://justinmath.com/cognitive-science-of-learning-interleaving
24. https://my.chartered.college/impact_article/the-application-of-spacing-and-interleaving-approaches-in-the-classroom
25. https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf
26. https://cirl.etoncollege.com/desirable-difficulties
27. https://www.structural-learning.com/post/robert-bjork-teachers-guide-desirable

**Alinhamento / mastery / design de avaliação**
28. https://www.cs.auckland.ac.nz/courses/compsci747s2c/lectures/teaching-through-constructive-alignment.pdf (Biggs; Slavin 1990; Lai & Biggs 1994)
29. https://mededmentor.org/theory-database/theory-index/constructive-alignment
30. https://dl.acm.org/doi/fullHtml/10.1145/3760213.3704734 (backward design, ACM 2025)
31. https://www.coursemapguide.com/backward-design
32. https://kpcrossacademy.ua.edu/beyond-learning-objectives-backward-design-as-a-framework-for-instructional-alignment
33. https://www.intechopen.com/online-first/1241626 (Bloom revisado + backward design)
34. https://pmc.ncbi.nlm.nih.gov/articles/PMC10159400 (mastery learning — revisão prática)
35. https://www.cs.ubc.ca/~ebani/papers/MasteryLearningSCAtScale_ICSE_SEET_2019.pdf (mastery em curso de software, ICSE 2019)
36. https://digitalcommons.unomaha.edu/cgi/viewcontent.cgi?article=1155&context=tedfacpub (mastery learning em computação, CS1/CS2)
37. https://www.uky.edu/~gmswan3/575/kulik_kulik_Bangert-Drowns_1990.pdf (revisão de mastery learning)

**Design de quiz / retrieval practice**
38. https://online.tcsg.edu/training/use-frequent-low-stakes-quizzes (3–7 itens/semana)
39. https://pdf.retrievalpractice.org/RetrievalPracticeGuide.pdf (checklist de implementação)
40. https://www.structural-learning.com/post/testing-effect-retrieval-practice
41. https://www.structural-learning.com/post/retrieval-practice-a-teachers-guide
42. https://kognity.com/resources/retrieval-practice (feedback corretivo)

**Educação em computação**
43. https://peer.asee.org/investigating-the-effects-of-prerequisite-cs1-options-for-a-cs2-course-through-an-analysis-of-student-project-scores-in-cs2.pdf
44. https://www.scitepress.org/Papers/2022/110958/110958.pdf (assessment em cursos de programação)
45. https://dl.acm.org/doi/pdf/10.1145/1352135.1352315 (Janzen & Saiedian 2008, test-driven learning)
46. https://dl.acm.org/doi/10.1145/3629296.3629362 (SIGCSE 2024 — spaced retrieval/interleaving em curso introdutório)
47. https://www.learningscientists.org/blog/2019/5/9-1 (implementação em sala, andaimagem)

---

## Recomendação sintética (1 página)

### A regra determinística, parametrizada

> **REGRA-C (revisão cumulativa de desafio).** Todo desafio de aula deve declarar, em
> `challenge.json` (`reviews[]`), **≥ N construções já ensinadas** que ele também cobra; cada uma
> deve ser exercida por **≥1 cenário de teste** que falhe sem ela, em **instância nova** (nunca
> repetição do teste da aula original); e o gate determinístico verifica (a) `reviews[] ⊆
> budget_entrada(N)` — nada de cobrar o que não foi ensinado — e (b) que cada entrada de `reviews[]`
> aparece de fato na superfície de teste/solução (Q-matrix `usa[]`), reprovando a autoria quando a
> declaração é decorativa.

### Parâmetros (com origem de cada número)

| Parâmetro | Valor | Base |
|---|---|---|
| **N mínimo** (construções revisadas por desafio de aula) | **2** (após a 5ª aula); **1** nas aulas 3–4; **0** nas aulas 1–2 | rampa anti-sobrecarga (G23); dose pequena e frequente (D15); 3–7 itens/semana (F19) |
| **Proporção de revisão** | **30–50% dos cenários** (alvo 40%; teto 50%) | Gayman 2021: 50% → +4,91% na final (A3); Lawrence 2013: 20% já dá efeito, piso (A4); Bailey 2021: acima disso prejudica alunos fortes (A7) |
| **Janela de revisão** | construções das **últimas 6–8 aulas** + marcos de **~1, ~3 e ~7 lições** de distância (equiespaçado) | equiespaçado > expansivo para longo prazo (B10); checkpoints 1d/7d/21d (B9, fonte 14) |
| **Cobertura por construção** | toda construção produtiva revisitada em **≥3 desafios distintos**, separados por ≥2 aulas, dentro de ~5–8 semanas | Larsen 2009 (3× → +13% a 6 meses) e protocolo AAAS (3× em 5 semanas) (A5, B11) |
| **Interleaving** | cenários de revisão de construções **diferentes** no mesmo desafio, embaralhados; **nunca duas revisões seguidas** da mesma construção; priorizar **pares confusáveis** com o conteúdo novo (`for`↔`while`, declaração↔arrow) | C12, C13 |
| **Profundidade crescente** | cenário de revisão exige a construção **em papel novo** (contexto, restrição ou interação com a construção nova); repetição literal não conta | Bruner/D14; variação de superfície/conceito (F20) |
| **Declaração explícita** | o enunciado do desafio lista "revisando X (aula N), Y (aula M)" — além do `reviews[]` no manifesto | Szpunar 2007: expectativa de reteste melhora retenção (A6) |
| **Stakes** | erro em cenário de revisão → feedback que **nomeia a construção perdida** + reagendamento na fila de proficiência (T3/T5); **não** trava progressão nem derruba o desafio isoladamente | mastery learning low-stakes (E18); feedback obrigatório (F20); classe de dica preservada |

### Exceções (todas declaradas, nunca silenciosas)

1. **Aulas iniciais (1–2):** N=0 — orçamento vazio; forçar revisão criaria dificuldade indesejável (G23).
   Aula 3–4: N=1.
2. **Aulas de integração / desafio de módulo:** proporção inverte — até **80% de revisão** (N≥5,
   amostrado por espacamento em toda a janela do módulo), com o conteúdo novo da aula final do módulo
   como fio condutor. É o "exame cumulativo" do A2, num único ponto.
3. **Remediação:** desafio de retreino gerado após falha em revisão pode ser 100% da construção frágil
   (bloco temporário justificado — mastery learning permite correção focada antes de seguir, E18).
4. **Construções "forma nova":** revisar a construção-base quando a aula introduz a variante
   (`else if` após `if`) conta como revisão **só** se o cenário exigir discriminar as duas formas
   (C13 + o estado `new` da engine).
5. **Aluno avançado (evidência de domínio recente):** a fila de proficiência pode reduzir a revisão ao
   piso (20%) — o teto/benefício decresce para raciocínio alto (A7). A regra de currículo define o
   máximo; a adaptação escolhe dentro da faixa.

### O que o gate verifica (e o que NÃO verifica)

- **Verifica:** somente (`reviews[] ⊆ budget_entrada`) · cumprimento (cada `review` exercido por ≥1
  cenário, detectável por AST/Q-matrix) · proporção (cenários de revisão dentro de 30–50%) ·
  separação (nenhuma construção revisada em desafios adjacentes) · novidade (cenário de revisão difere
  do teste original — por `scenario_id`/hash, não por semântica).
- **Não verifica:** se o aluno acertou a revisão (isso é proficiência, não autoria) · dificuldade
  psicológica percebida · "cobertura total de erro" (fora do alcance, como já declara DES-3).

### Métricas de calibração pós-implementação

- taxa de acerto na 1ª tentativa de desafios cumulativos (espera-se queda leve — G22, não é defeito);
- retenção: desempenho em cenários de revisão **4+ semanas** após a aula original (a métrica-alvo);
- falhas em revisão por construção (detecta pré-requisito frágil — G24);
- percepção do aluno (a resistência inicial é esperada e benigna — A8).
