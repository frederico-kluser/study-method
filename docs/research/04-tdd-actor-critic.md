# 04 — Geração confiável de testes por LLM e validação adversarial Actor-Critic

> Escopo: o tutor (LLM) gera um arquivo de teste para um desafio educacional. O aluno escreve
> código até o teste passar. **O teste é a especificação viva** — se o teste está errado, o
> aluno aprende a coisa errada, ou fica travado numa tarefa impossível, ou passa sem aprender
> nada. Este documento cataloga como isso quebra e como validar o teste antes de entregá-lo.

Convenção de marcação usada abaixo: **FATO VERIFICADO (fonte)** = achado relatado em paper,
benchmark ou documentação com link na seção Fontes. **INFERÊNCIA** = raciocínio meu a partir dos
fatos verificados, sem número publicado por trás. Quando não achei número confiável para uma
afirmação específica do escopo pedido, digo isso explicitamente em vez de estimar.

---

## 1. O problema central: o teste ruim aprisiona o aluno

Num fluxo tradicional de TDD humano, quem escreve o teste e quem escreve a implementação têm o
mesmo objetivo e o mesmo modelo mental — erros de teste são raros porque há um ciclo de feedback
imediato (o próprio autor roda o teste, vê que não faz sentido, corrige). No fluxo do tutor, o
teste é gerado por um LLM **antes** de qualquer implementação existir, sem esse ciclo de
correção humana, e entregue a alguém (o aluno) que não pode alterá-lo com legitimidade. Qualquer
defeito no teste vira uma falha pedagógica direta: o aluno perde tempo, ou aprende uma lição
errada, ou desiste.

Catalogar os modos de falha:

### 1.1 Assertion fraca / tautológica — passa com stub vazio

O sintoma mais perigoso porque é silencioso: o teste "parece" testar algo, mas sua asserção é
satisfeita até por `pass` ou `return None`.

```python
# RUIM — passa com qualquer coisa que não lance exceção
def test_calcula_media():
    resultado = calcular_media([1, 2, 3])
    assert resultado is not None

# RUIM — checa o tipo, não o valor
def test_calcula_media():
    resultado = calcular_media([1, 2, 3])
    assert isinstance(resultado, float)

# BOM — valor exato, entrada não trivial
def test_calcula_media():
    assert calcular_media([1, 2, 3]) == 2.0
    assert calcular_media([10]) == 10.0
    with pytest.raises(ValueError):
        calcular_media([])
```

```javascript
// RUIM — tautológico, aceita implementação vazia que retorna array vazio
test('ordena a lista', () => {
  const r = ordenar([3, 1, 2]);
  expect(Array.isArray(r)).toBe(true);
});

// BOM — valor exato
test('ordena a lista', () => {
  expect(ordenar([3, 1, 2])).toEqual([1, 2, 3]);
  expect(ordenar([])).toEqual([]);
  expect(ordenar([5])).toEqual([5]);
});
```

### 1.2 Teste impossível de satisfazer

Asserção contraditória entre si (duas expectativas mutuamente exclusivas para a mesma chamada)
ou expectativa numérica que o próprio LLM calculou errado ao gerar o teste — o aluno implementa
corretamente e o teste falha do mesmo jeito. Este é o modo de falha mais destrutivo
pedagogicamente: o aluno não tem como saber se o bug é dele ou do teste, e a heurística "o
professor está sempre certo" o empurra a "corrigir" um código já correto até quebrá-lo.

### 1.3 Teste que testa a implementação, não o contrato (over-specification)

Testes que espiam estrutura interna (nomes de variáveis intermediárias, ordem de chamadas,
número exato de iterações de um loop) em vez do comportamento observável. Isso acopla o teste a
*uma* solução possível e rejeita soluções corretas, porém diferentes — grave num contexto
educacional, porque o aluno pode ter achado um caminho válido e alternativo e ser informado de
que está "errado". Mecanismo de detecção executável para este modo de falha: Seção 4, passo 3.

```python
# RUIM — passa com a implementação recursiva que o LLM tinha em mente, mas rejeita uma
# implementação iterativa igualmente correta (over-specification de verdade: a asserção
# espiona a ESTRUTURA da chamada, não o CONTRATO fatorial(5) == 120)
import solucao  # módulo com a implementação do aluno

def test_fatorial_usa_recursao(monkeypatch):
    chamadas = []
    original = solucao.fatorial
    def espiao(n):
        chamadas.append(n)
        return original(n)
    monkeypatch.setattr(solucao, "fatorial", espiao)
    assert solucao.fatorial(5) == 120
    assert len(chamadas) == 5  # força uma estratégia de implementação específica:
    # uma implementação recursiva (fatorial(n) = n * fatorial(n-1)) faz 5 chamadas
    # internas e passa aqui; uma implementação iterativa igualmente correta (loop
    # multiplicando 2..n) faz 1 única chamada externa e FALHA nesta linha, apesar de
    # devolver 120 corretamente — over-specification, não teste impossível.

# BOM — testa o contrato, aceita qualquer implementação correta
def test_fatorial():
    assert fatorial(0) == 1
    assert fatorial(1) == 1
    assert fatorial(5) == 120
    with pytest.raises(ValueError):
        fatorial(-1)
```

Verificado por execução (`unittest.mock.patch.object`, equivalente a `monkeypatch.setattr` para
este propósito): com a implementação recursiva, `chamadas` termina com 5 elementos e o teste
passa; com a implementação iterativa, `chamadas` termina com 1 elemento e
`assert len(chamadas) == 5` falha, embora `fatorial(5) == 120` seja verdadeiro nos dois casos —
confirma que o exemplo agora ilustra over-specification (1.3), não teste impossível (1.2).

### 1.4 Teste "escrito depois" — confirma a solução que o modelo já imaginou

Quando o LLM primeiro pensa numa implementação de referência (mesmo que implicitamente, no
mesmo turno de geração) e só então escreve o teste, ele tende a testar exatamente os casos que a
sua própria solução cobre bem, e a pular os casos em que ela é frágil — o mesmo viés de
confirmação documentado em humanos que escrevem teste depois do código.
**FATO VERIFICADO (fonte)**: estudo controlado sobre viés de confirmação em teste de software
mostra que testadores tendem a selecionar casos que esperam que passem, produzindo menos casos
negativos (voltados a achar defeito) do que positivos — o mesmo padrão que motiva TDD
test-first como mitigação (ver Fontes, Springer 2018 / Agile Institute). Não encontrei um
estudo que meça esse viés especificamente em LLMs gerando teste-depois-de-solução; a extensão
do achado humano para LLMs abaixo é **INFERÊNCIA**, plausível porque o mecanismo (ancoragem
numa solução já formada) é o mesmo, mas não medida diretamente.

### 1.5 Flakiness — tempo, aleatoriedade, ordem, locale, ponto flutuante

**FATO VERIFICADO (fonte)**: o estudo seminal de Luo et al. (FSE 2014 — 22nd ACM SIGSOFT
International Symposium on the Foundations of Software Engineering, DOI 10.1145/2635868.2635920,
"An Empirical Analysis of Flaky Tests") examinou 201 commits de correção de flakiness em
projetos Apache e catalogou 10
categorias: *Async Wait*, *Concurrency*, *Test Order Dependency*, *Resource Leak*, *Network*,
*Time*, *IO*, *Randomness*, *Floating Point Operations* e *Unordered Collections* — com
*Async Wait* (45%), *Concurrency* (20%) e *Test Order Dependency* (12%) sendo as causas mais
comuns. Eck et al. estenderam a taxonomia com *Too Restrictive Range*, *Test Case Timeout*,
*Platform Dependency* e *Test Suite Timeout*.

No contexto de desafios educacionais os riscos relevantes são um subconjunto direto:
- **Tempo**: `datetime.now()` sem congelar o relógio; teste que depende de quanto tempo o código
  do aluno demora para rodar.
- **Aleatoriedade**: gerar números aleatórios sem seed fixa e comparar contra valor exato.
- **Ordem**: comparar dicionário/set como se tivesse ordem garantida quando a linguagem não
  garante (relevante em Python < 3.7 ou em `set`/`dict` de outras linguagens).
- **Locale**: formatação de número/data dependente de `locale.setlocale`, separador decimal
  vírgula vs ponto, especialmente sensível para um público pt-BR.
- **Ponto flutuante**: `assert resultado == 0.1 + 0.2` falha por representação binária; a
  correção é comparação com tolerância (`math.isclose`, `pytest.approx`), não igualdade exata.

### 1.6 Erro aritmético/simbólico do próprio modelo em desafios de matemática

**FATO VERIFICADO (fonte)**: Cobbe et al. (2021, autores do GSM8K) relatam que os modelos
"frequently fail to accurately perform calculations" e que isso é uma fonte comum de erro
(mitigada no próprio paper com anotações de calculadora durante o treino) — evidência publicada
de que erro de cálculo aritmético em si, não só erro de estratégia/raciocínio, é um modo de
falha real e documentado em matemática de nível escolar. **INFERÊNCIA**: não encontrei nessa
fonte, nem em outra, uma comparação explícita entre modo CoT e não-CoT quanto à proporção de
erro aritmético puro versus erro de tradução do enunciado para uma expressão simbólica; a versão
anterior desta afirmação especificava "modo não-CoT" sem citação que sustentasse esse recorte
específico e foi corrigida para não extrapolar além do que a fonte diz.

**FATO VERIFICADO (fonte)**: em geração de programas a partir de enunciados de matemática usando
o método **SyReLM sobre GPT-J** (arXiv:2312.05571) — um LLM pequeno traduz o enunciado para uma
expressão formal que um solver simbólico resolve —, a taxa de programas sintaticamente
incorretos chega a **15% em GSM8K** (contra **2,6% em MultiArith** e **5,17% em SVAMP**),
variando fortemente por dataset; os autores atribuem parte da diferença ao comprimento médio de
tokens do enunciado (47 em GSM8K vs. 30–34 nos outros). Esses números são específicos desse
modelo/método (GPT-J via SyReLM), não uma taxa geral de "LLMs" gerando programas a partir de
enunciados de matemática.
**FATO VERIFICADO (fonte)**: o benchmark GSM-Symbolic (Apple, Mirzadeh et al. 2024) mostra que o
desempenho de modelos cai quando só os valores numéricos do enunciado mudam (mantendo a
estrutura), e cai até 65% quando uma cláusula irrelevante — que não deveria afetar o resultado —
é adicionada ao enunciado. Isso é evidência direta de que LLMs são frágeis em construir o valor
numérico "esperado" de um teste de matemática a partir do enunciado: se o tutor pede ao modelo
"gere o teste com o valor correto", o próprio valor gerado tem risco de estar errado exatamente
nos casos com mais cláusulas ou números "incômodos" — motivo pelo qual a Seção 2 (oracle) e a
Seção 4 (validação por execução contra referência) não são opcionais para desafios de matemática:
o valor esperado não pode vir só do modelo calculando de cabeça, tem que vir de execução real
(sympy, ou a implementação de referência) ou de verificação simbólica.

### 1.7 Números publicados sobre qualidade de teste gerado por LLM

**FATO VERIFICADO (fonte)** — taxas de acerto/cobertura/mutação em geração de teste por LLM:
- Estudo em larga escala com 12 LLMs de ponta sobre funções do mundo real (arXiv 2508.00408,
  2025): média de **41,32%** de acurácia, **45,10%** de cobertura de statement, **30,22%** de
  cobertura de branch e **40,21%** de mutation score nos testes gerados — ou seja, mesmo modelos
  de ponta, sem validação adicional, produzem testes que só matam ~40% dos mutantes de defeito
  introduzidos artificialmente.
- TestGen-LLM (Meta, arXiv 2402.09171, publicado em test-a-thons de Instagram/Facebook): de
  todos os testes gerados brutos, **75% compilavam**, **57% passavam de forma confiável** e
  **25% aumentavam cobertura**; a proporção de testes gerados que sobrevivem a todos os filtros
  automáticos até virar candidato aceito por um engenheiro humano foi de **1:4 em condições
  controladas** e **1:20 em cenário real de produção**. Do que passou pelos filtros, **73% foi
  aceito** pelos engenheiros para produção. Este número é a evidência mais forte disponível de
  que *geração bruta de teste por LLM tem uma taxa de aproveitamento muito baixa sem um pipeline
  de filtragem automática* — e é exatamente o argumento para o protocolo da Seção 4.
- HumanEval+/EvalPlus (Liu et al.): o HumanEval original tem suítes de teste pequenas e
  majoritariamente "caminho feliz" (~7–8 casos por problema), que deixam passar bugs não
  triviais (off-by-one, casos de borda, comportamento anômalo de performance); ao ampliar os
  testes automaticamente (HumanEval+, ~80× mais casos), o pass@k de 26 LLMs avaliados **caiu até
  19,3–28,9 pontos percentuais** — ou seja, uma fração grande do código que "passava" no
  HumanEval original só passava porque o teste original era fraco, não porque o código estava
  certo. Isso é evidência direta e quantificada do modo de falha 1.1 (assertion fraca) só que do
  lado do *benchmark*, não do teste gerado pelo tutor — mas o mecanismo é idêntico.
- MuTAP (ver Fontes) é um exemplo concreto de "LLM gera mutante, executa contra ele": usa o
  próprio LLM para gerar mutantes direcionados e testes que os matem, reportando mutation score
  de **93,57%** em código com bug sintético. A validade de mutation score como proxy de "o teste
  é bom" é debatida na própria literatura, no entanto: um estudo de replicação (arXiv 2607.22880)
  questiona se cobertura e mutation score de suítes geradas por LLM realmente correlacionam com
  efetividade real (achar bugs de verdade), porque mutantes artificiais — sobretudo quando também
  vêm do mesmo tipo de modelo que escreveu o código sob teste — nem sempre têm a mesma
  distribuição dos bugs reais.

**O que não encontrei**: nenhum benchmark publicado mede especificamente "taxa de erro de testes
gerados por LLM para desafios de matemática/algoritmos de nível educacional" nem "taxa de testes
com asserção numérica incorreta gerados especificamente para ensino". Os números acima vêm de
geração de teste para código de produção (Meta, benchmarks de unit test genérico) e de
raciocínio matemático em geração de resposta (GSM8K/GSM-Symbolic), não da interseção exata do
escopo deste projeto. Extrapolar esses números para "X% dos testes que o tutor vai gerar para
este produto estarão quebrados" seria inventar; a inferência segura e defensável é: **a taxa de
teste ruim gerado sem validação automática é alta o suficiente (dezenas de por cento, por
múltiplas fontes independentes) para que nenhum teste deva ser entregue ao aluno sem passar por
um pipeline de validação automática antes** — isto é o argumento central da Seção 4.

---

## 2. O oracle problem: como saber que o teste está certo, se o teste é o oráculo?

**FATO VERIFICADO (fonte)**: Barr et al., "The Oracle Problem in Software Testing: A Survey"
(IEEE TSE 2015), formaliza o *test oracle problem*: a dificuldade de determinar o resultado
esperado de um caso de teste, ou de decidir se a saída observada está de acordo com esse
resultado esperado. Em muitas aplicações práticas um oráculo perfeito não existe, ou existe mas é
caro demais para aplicar em escala. No nosso caso o problema é literal e recursivo: **o teste
gerado pelo LLM é ele mesmo o oráculo** que vai julgar o código do aluno — se o oráculo está
errado, o julgamento está errado, e não há um terceiro juiz por padrão.

Estratégias reais usadas na literatura e na indústria, em ordem de força de garantia:

1. **Implementação de referência escondida** (a mais forte e mais aplicável aqui). O tutor gera,
   junto com o teste, uma implementação de referência que o aluno nunca vê. O oráculo não é "o
   valor que o LLM escreveu no teste", é "o valor que a implementação de referência produz
   quando executada de verdade". Isso desloca o problema de "o LLM calculou certo o valor
   esperado" (falha comum, ver 1.6) para "o LLM escreveu uma referência que roda e cujo
   comportamento faz sentido" — mais fácil de auditar porque dá para inspecionar/rodar a
   referência separadamente e comparar com bibliotecas confiáveis.
2. **Propriedades matemáticas invariantes** (oráculo parcial, forte para matemática/algoritmos):
   em vez de fixar um valor de saída, fixar uma relação que deve valer sempre — por exemplo
   `ordenar(lista)` deve ser uma permutação de `lista` e estar em ordem não-decrescente;
   `inverter(inverter(x)) == x`; `area(triangulo) >= 0`. Isso não depende de calcular o valor
   certo, só de verificar uma propriedade — elimina a classe de erro 1.6 quase por completo para
   esse tipo de propriedade.
3. **Testes metamórficos**. **FATO VERIFICADO (fonte)**: quando não há oráculo direto disponível,
   testes metamórficos verificam *relações* entre múltiplas execuções do programa em vez do
   valor absoluto de uma execução — ex.: se `f(x) = y`, então `f(2x)` deve satisfazer alguma
   relação conhecida com `y` (linearidade, monotonicidade, simetria), mesmo sem saber o valor
   exato de nenhum dos dois. É a técnica citada na literatura como a principal resposta ao oracle
   problem quando ele é insolúvel de outra forma (Chen et al., ACM CSUR 2018; Segura et al.).
4. **Comparação com biblioteca confiável**: gerar o valor esperado chamando uma implementação já
   validada (`numpy`, `scipy`, `statistics`, `sympy`) em vez de o LLM "calcular de cabeça" — troca
   o oráculo "LLM fez a conta" pelo oráculo "biblioteca madura fez a conta", que tem ordens de
   magnitude mais uso e revisão por trás.
5. **Verificação simbólica** (sympy, Z3): para desafios algébricos, montar a expressão simbólica
   do resultado esperado e do resultado do aluno e verificar `sympy.simplify(esperado - obtido) == 0`
   ou usar um SMT solver para confirmar equivalência sob todas as atribuições de variável, em vez
   de comparar um valor numérico único — cobre casos em que a resposta correta tem múltiplas
   formas algébricas equivalentes (ex.: `2*(x+1)` vs `2*x+2`).
6. **Verificação numérica com tolerância**: quando o resultado é ponto flutuante, comparar com
   `math.isclose(a, b, rel_tol=1e-9)` ou `pytest.approx`, nunca igualdade exata — evita falso
   negativo por erro de arredondamento tanto do lado do aluno quanto do lado da referência.

**INFERÊNCIA operacional**: para este produto, a combinação recomendada é (1) implementação de
referência escondida como oráculo primário + (2) propriedades invariantes como checagem
complementar sempre que o domínio permitir + (6) tolerância numérica como padrão para qualquer
saída de ponto flutuante. Testes metamórficos (3) e verificação simbólica (5) são reforços de
alto valor para desafios de matemática/álgebra especificamente, mas exigem mais engenharia
(sympy/Z3 no pipeline) — tratar como upgrade, não como piso mínimo.

---

## 3. Actor-Critic / self-refine para código: quando a autocrítica funciona e quando é teatro

O termo "Actor-Critic" aqui é usado por analogia solta com RL (um "ator" gera, um "crítico"
avalia e devolve sinal) — vale separar com cuidado o que a literatura realmente mostra.

**Self-Refine** (Madaan et al., arXiv 2303.17651): o mesmo LLM atua como gerador, crítico e
refinador, iterando feedback textual sobre a própria saída, sem treino adicional. **FATO
VERIFICADO (fonte)**: nas 7 tarefas avaliadas (diálogo, raciocínio matemático, geração de
código, entre outras), o método reporta melhora média de **~20 pontos percentuais absolutos**
com GPT-3.5/ChatGPT/GPT-4. Ponto importante para não superestimar: nas tarefas onde Self-Refine
funciona bem, a crítica geralmente tem *algum* sinal externo objetivo disponível para ancorar o
julgamento (ex. o próprio ato de rodar o código gerado), não é só "o modelo relendo o próprio
texto e decidindo que está bom".

**Reflexion** (Shinn et al.): estende a ideia com memória episódica verbal entre tentativas —
guarda o feedback de tentativas anteriores para não repetir o mesmo erro. Também depende de um
sinal de ambiente (resultado de execução, teste que falhou) para gerar a reflexão; não é
autocrítica no vácuo.

**O contraponto central — quando é teatro**: **FATO VERIFICADO (fonte)** — Huang et al., "Large
Language Models Cannot Self-Correct Reasoning Yet" (arXiv 2310.01798, ICLR 2024): em
autocorreção *intrínseca* (o modelo tenta corrigir sua própria resposta usando só sua própria
capacidade, sem feedback externo de ground truth, ferramenta ou ambiente), os autores mostram que
os modelos **falham em se autocorrigir** e, em alguns casos, o desempenho **piora** depois da
autocorreção — o modelo troca uma resposta certa por uma errada porque "convenceu a si mesmo" de
um problema que não existia. Achado convergente: **FATO VERIFICADO (fonte)** — "SELF-[IN]CORRECT:
LLMs Struggle with Discriminating Self-Generated Responses" (arXiv 2404.04298) mostra que
modelos têm dificuldade sistemática em distinguir, entre duas respostas que eles mesmos geraram,
qual é a correta — ou seja, o mesmo modelo que gera o teste não é confiavelmente capaz de
depois julgar se o próprio teste está certo, só relendo e "pensando de novo".

**CriticGPT** (OpenAI, treinado com RLHF especificamente para criticar código escrito por
outro LLM): **FATO VERIFICADO (fonte)** — mesmo como modelo especializado e treinado para essa
função, tem limitações documentadas: (a) produz **bugs alucinados** que podem enganar o revisor
humano a "corrigir" algo que não estava errado; (b) equipes humano+crítico pegam número
semelhante de bugs reais que críticos-LLM sozinhos, mas com **menos alucinação**. Correção
importante sobre o desempenho fora do domínio de código: o abstract do paper
(arXiv:2407.00215) relata que críticos treinados dessa forma **conseguem** identificar centenas
de erros em dados de treinamento do ChatGPT rotulados como "flawless", **mesmo a maioria dessas
tarefas sendo não-código e portanto out-of-distribution para o modelo crítico** — o paper
apresenta isso como um resultado de generalização bem-sucedida, não como evidência de
confiabilidade menor. Isso enfraquece um pouco o argumento deste documento contra crítica
textual pura: mesmo fora do domínio de treino, um crítico especializado consegue achar bugs
reais.

O que continua de pé, e é a base mais forte para a conclusão da Seção 3, é o achado de Huang et
al. sobre autocorreção intrínseca sem sinal externo (acima) — que descreve um cenário diferente
do de CriticGPT: CriticGPT é um **modelo separado, treinado especificamente com RLHF para a
tarefa de crítica**, avaliando a saída de *outro* modelo; o cenário relevante para este produto
(Seção 3) é o mesmo modelo, sem esse treino especializado adicional, relendo e julgando a própria
geração no mesmo turno — regime mais próximo do de Huang et al. e do SELF-[IN]CORRECT do que do
de CriticGPT. Mesmo assim, mesmo o crítico mais bem treinado publicamente conhecido produz bugs
alucinados que exigem revisão humana para filtrar — crítica puramente textual, mesmo
especializada e treinada para a tarefa, não é uma fonte de verdade suficiente sozinha; sem esse
treino especializado (o caso deste produto), a evidência de Huang et al. e SELF-[IN]CORRECT
sugere que o sinal é ainda mais fraco.

**Conclusão operacional para este produto**: crítica textual pura — "modelo, releia esse teste e
me diga se está certo" — é um sinal fraco, com evidência publicada de que pode piorar o
resultado em vez de melhorar. **Crítica ancorada em execução é forte**: rodar o teste contra
stub vazio, contra a referência, contra referências alternativas estruturalmente diferentes, e
contra mutantes (Seção 4) não depende do LLM "julgar a si mesmo" — depende de um resultado
observável e determinístico (passou/falhou). É essencialmente o que TestGen-LLM faz na prática
(Seção 1.7): não confia no LLM para dizer "esse teste está bom", filtra automaticamente por
critérios executáveis (compila, passa, aumenta cobertura) e só então expõe humano/aluno ao
resultado. O papel do "critic" nesta arquitetura deve ser um harness de execução determinístico,
não uma segunda chamada de LLM pedindo "critique isso" — isso vale inclusive para o modo de
falha 1.3 (over-specification): a Seção 4 (passo 3) resolve isso por execução, rodando o teste
contra implementação(ões) de referência alternativas e corretas, e não delegando a detecção a
uma crítica textual. Uma segunda chamada de LLM ainda pode servir de filtro complementar de
última milha para sinais que execução não cobre bem (ex.: heurística de estilo, clareza
didática da mensagem de erro — Seção 7), mas nunca como o único gate de qualidade, e nunca como
o mecanismo usado contra os modos de falha 1.1–1.4, todos cobertos por passos executáveis da
Seção 4.

---

## 4. Validação por execução: o protocolo mínimo (algoritmo)

Antes de qualquer teste chegar ao aluno, ele precisa sobreviver a esta bateria. É a tradução
direta da Seção 3 ("crítica ancorada em execução") em passos concretos e determinísticos.

### Pré-condição

O tutor gera, para cada desafio, três artefatos obrigatórios — mais um artefato opcional
recomendado:
- `spec_test.*` — o arquivo de teste que o aluno vai ver e contra o qual vai codar.
- `reference_impl.*` — implementação de referência correta, **oculta** do aluno.
- `stub_impl.*` — um stub "vazio" plausível (função declarada, corpo com `pass`/`throw
  NotImplementedError`/retorno de valor-zero do tipo, conforme a linguagem).
- `reference_impl_alt_*.*` (opcional, recomendado sempre que existir mais de uma estratégia
  idiomática razoável para o desafio) — implementação(ões) de referência **alternativas**,
  corretas, mas estruturalmente diferentes de `reference_impl` (ex.: iterativa vs. recursiva vs.
  via `reduce`/built-in; busca linear vs. binária sobre entrada ordenada). Usadas no passo 3 do
  algoritmo abaixo para detectar over-specification (modo de falha 1.3).

### Algoritmo: `validar_teste(T, R, E)`

```
entrada:  T = arquivo de teste gerado
          R = implementação de referência
          E = stub vazio
          R_ALT = lista de implementações de referência alternativas, corretas mas
                  estruturalmente diferentes de R (pode ser vazia se não houver
                  alternativa idiomática plausível para o desafio)
          MUTANTES = catálogo fixo de operadores de mutação a aplicar em R
          N_REPETICOES = 2  (mínimo para checar determinismo — ver limitação honesta no
                             passo 5)
saída:    APROVADO | REJEITADO(motivo) | FRACO(mutantes sobreviventes)

1. RODAR T contra E, em sandbox (Seção 5), com timeout T_max.
   SE T passou (todos os casos verdes) contra E:
       RETORNAR REJEITADO("assertion vazia/tautológica — passa com stub vazio")
   SE T nem sequer rodou (erro de import/sintaxe) contra E:
       isso é esperado só se o stub não compila — validar que E compila antes deste passo;
       se E compila e T não roda, RETORNAR REJEITADO("teste mal formado")

2. RODAR T contra R, em sandbox, com timeout T_max.
   SE T falhou (qualquer caso vermelho) contra R:
       RETORNAR REJEITADO("teste impossível — falha até contra a referência correta")
   SE T não terminou dentro de T_max:
       RETORNAR REJEITADO("timeout contra a referência — flakiness ou custo computacional
                            mal calibrado")

3. SE R_ALT não for vazia:
       PARA CADA R_alt EM R_ALT:
           RODAR T contra R_alt, em sandbox, com timeout T_max.
           SE T falhou (qualquer caso vermelho) contra R_alt:
               REGISTRAR T como "over-specified contra R_alt" (modo de falha 1.3 — o teste
               está acoplado a um detalhe de R que R_alt, igualmente correta, não
               compartilha).
       SE algum R_alt produziu falha:
           SE a(s) asserção(ões) responsável(is) pela falha for(em) isolável(is) (ex.:
           contagem de chamadas internas, nome de variável espiada, ordem de operação
           não observável externamente):
               AÇÃO: remover/afrouxar essa asserção específica, manter o restante do
               teste, e RE-RODAR o protocolo inteiro desde o passo 1 com o teste editado.
           SENÃO (a falha é estrutural, não isolável sem reescrever o teste):
               RETORNAR REJEITADO("over-specified — rejeita implementação alternativa
                                    comprovadamente correta, acoplado à estrutura de R")
           NUNCA aprovar um teste que rejeitou uma R_alt comprovadamente correta sem
           passar por uma dessas duas ações.
   SE R_ALT for vazia:
       REGISTRAR "passo 3 não aplicável — nenhuma alternativa estrutural plausível
       disponível para este desafio" e seguir para o passo 4 sem reprovar por omissão.

4. GERAR mutantes M1..Mk de R aplicando o catálogo fixo MUTANTES, por transformação
   sintática mecânica (ver limitação sobre origem dos mutantes, abaixo):
       - off-by-one (+1/-1 em índices, limites de range, condições < vs <=)
       - sinal trocado (+ vira -, > vira <, and vira or)
       - retorno constante (substituir corpo por retorno de um valor fixo do tipo certo)
       - remoção de um passo (deletar uma linha de um loop/cálculo)
       - troca de operador aritmético (* vira /, etc.)
   PARA CADA mutante Mi:
       RODAR T contra Mi, em sandbox, com timeout T_max
       SE T passou (não detectou o defeito):
           REGISTRAR Mi como "sobrevivente"
   SE proporção de sobreviventes > limiar_aceitável (ex.: qualquer mutante trivial sobrevivente
      já é motivo de alerta para desafio didático, onde a suíte tende a ser pequena):
       RETORNAR FRACO(lista de mutantes sobreviventes)
       — ação: pedir ao LLM para reforçar o teste especificamente contra esses mutantes,
         ou reprovar e gerar um teste novo, NUNCA aprovar direto.

5. RODAR T contra R, N_REPETICOES vezes, variando ambiente/execução quando aplicável:
       - PYTHONHASHSEED diferente entre execuções (ordem de dict/set não determinística)
       - ordem de coleção/execução de casos randomizada
       - horários diferentes, se o teste tocar tempo
       - `LC_ALL` e `TZ` diferentes entre execuções (ex.: `LC_ALL=pt_BR.UTF-8` vs
         `LC_ALL=C`; `TZ=America/Sao_Paulo` vs `TZ=UTC`) — pega dependência de
         locale/timezone que rodar 2× na MESMA máquina, no MESMO ambiente, nunca
         exporia por si só (bug locale-dependente é determinístico dado um ambiente
         fixo — só aparece variando o ambiente entre execuções).
   SE os resultados não forem idênticos entre repetições/ambientes:
       RETORNAR REJEITADO("não determinístico — flaky, ver categorias da Seção 1.5")

   LIMITAÇÃO HONESTA: N_REPETICOES=2 é o mínimo que sequer permite comparar (1 repetição
   não detecta nada) — não é garantia de ausência de flakiness. As categorias mais comuns
   em Luo et al. (Async Wait 45%, Concurrency 20% — Seção 1.5) dependem de timing/
   interleaving probabilístico que pode não se manifestar nem em 2 nem em 10 repetições na
   mesma máquina sob a mesma carga. Tratar N=2 como piso mínimo barato (sempre vale a
   pena rodar), não como detecção confiável de flakiness de concorrência — para desafios
   que envolvem concorrência/async explicitamente, subir N para dezenas de repetições ou
   evitar esse padrão no desafio.

6. SE chegou até aqui sem REJEITADO:
       RETORNAR APROVADO
       registrar o mutation score (mutantes mortos / total) como métrica de confiança
       anexada ao teste, para priorizar revisão humana amostral nos casos de score baixo
       mesmo quando "aprovado".
```

Pontos de design que valem destacar:

- **Passos 1 e 2 são obrigatórios e baratos** — rodam uma vez cada, custo desprezível, e
  sozinhos já eliminam os modos de falha 1.1 e 1.2 inteiros. Não há justificativa para pular
  esses dois passos em produção.
- **O passo 3 (over-specification contra referências alternativas) fecha o furo que a Seção 3
  deixava para crítica textual**: em vez de pedir a um segundo LLM para "perceber" acoplamento
  estrutural indevido (1.3), roda-se o teste contra implementação(ões) alternativas
  comprovadamente corretas — resposta binária e determinística, sem depender do modelo julgar a
  si mesmo. Só não roda quando não existe alternativa estrutural plausível para o desafio, e
  isso fica registrado (não escondido) em vez de contar como aprovação silenciosa.
- **O passo 4 (mutação) é o que dá o "actor-critic ancorado em execução"** da Seção 3: em vez de
  perguntar a um segundo LLM "esse teste é bom?", pergunta-se ao próprio código "esse teste
  detecta bugs de verdade?" — resposta binária, sem alucinação possível.
- **O catálogo de mutantes do passo 4 é fixo (os 5 operadores listados) e aplicado
  mecanicamente sobre R** (transformação sintática simples), não gerado pedindo ao LLM para
  "inventar" mutantes. Risco explícito: mutantes vindos do mesmo modelo que escreveu a
  referência limitam o espaço de bugs cobertos ao que esse modelo imagina como defeito
  plausível — o mesmo viés de ancoragem do modo de falha 1.4, agora incidindo sobre o próprio
  mecanismo de validação. É exatamente o ponto que o estudo de replicação citado na Seção 1.7
  (arXiv:2607.22880) levanta: mutation score alto não garante correlação com efetividade real
  contra bugs de verdade, sobretudo quando mutante e teste compartilham a mesma origem. MuTAP
  (ver 1.7) usa o LLM para gerar mutantes direcionados e reporta 93,57% de mutation score —
  número real, mas que mede "o teste pega os bugs que esse modelo imaginou", não bugs em geral.
  Por isso o catálogo mecânico e fixo é o padrão recomendado aqui; mutantes gerados por LLM, se
  usados, devem ser um complemento opcional, nunca a única fonte de mutação.
- O passo 5 (determinismo, agora cobrindo também locale/timezone) é barato o suficiente para
  nunca pular, mas só pega flakiness que se manifesta dentro da janela de repetições/ambientes
  testados — não é garantia absoluta, é redução de risco, e é particularmente fraco contra
  flakiness de concorrência (ver limitação detalhada no próprio passo 5).
- Se qualquer passo FRACO/REJEITADO ocorrer, a ação correta é **gerar de novo** (com o motivo da
  rejeição incluído no prompt de regeneração) até aprovar ou até um limite de tentativas — e só
  então, se o limite for atingido, escalar para revisão humana. Nunca entregar ao aluno um teste
  que não passou pelo protocolo completo.

**Limitação honesta do protocolo — R não é verdade absoluta**: todo o algoritmo acima assume que
R está correto. Se R tiver um bug, e T tiver herdado a mesma premissa errada — cenário plausível
quando ambos são gerados no mesmo turno pelo mesmo modelo, com T ancorado (1.4) na mesma leitura
equivocada do enunciado que produziu R —, então T passa em todos os passos 1–5 e é APROVADO,
reproduzindo exatamente o modo de falha 1.2 (teste impossível/errado) que este documento existe
para evitar, só que escondido atrás de uma referência que também está errada. Nenhum passo do
algoritmo detecta esse caso, porque nenhum deles usa uma fonte de verdade independente de R —
R_ALT no passo 3 não ajuda aqui, porque uma implementação alternativa gerada pelo mesmo raciocínio
equivocado herdaria o mesmo bug.

Mitigações concretas, nenhuma delas suficiente sozinha:
- **Propriedades invariantes verificadas sobre R independentemente de T** (Seção 2, estratégia
  2): checar propriedades matemáticas de R diretamente (ex.: `ordenar` produz uma permutação
  ordenada da entrada; `fatorial(n) > 0` para todo `n >= 0`) sem depender do valor específico
  que T espera — um bug em R que viole uma invariante do próprio domínio aparece aqui mesmo que
  T concorde inteiramente com R.
- **Conferência de R contra biblioteca confiável ou verificação simbólica quando o domínio
  permitir** (Seção 2, estratégias 4 e 5): rodar R e comparar a saída com `numpy`/`scipy`/
  `sympy`/um SMT solver para o mesmo caso — troca "o LLM escreveu R certo" por "uma biblioteca
  madura ou um solver confirmam R", uma fonte de verdade genuinamente independente do modelo que
  gerou T e R.
- **Casos-âncora derivados do enunciado, não da referência**: gerar (ou ter um humano gerar,
  amostralmente) um pequeno conjunto de pares entrada→saída-esperada calculados diretamente a
  partir do enunciado do desafio, sem consultar R nem T, e rodar esse conjunto contra R como um
  passo adicional — isso quebra o acoplamento porque a origem do valor esperado não passou pelo
  mesmo raciocínio que gerou R.

Nenhuma mitigação é gratuita — a segunda exige que o domínio tenha biblioteca/solver aplicável, e
a terceira exige geração ou revisão adicional (idealmente com prompt/contexto diferente do que
gerou R e T). Para desafios de baixo risco pedagógico (resposta errada rapidamente perceptível
pelo aluno, ou já pega por um mutante trivial) aceitar o risco residual é razoável; para desafios
de alto risco (poucos casos de teste, domínio numérico em que o aluno não consegue verificar a
resposta manualmente) pelo menos uma mitigação deveria ser obrigatória antes de aprovar.

---

## 5. Execução segura de código não confiável na máquina do usuário

O aluno escreve código que vai ser executado localmente (na máquina dele) pelo harness contra o
teste — e código de referência/mutantes também roda ali. Isso é execução de código não confiável
por definição (o aluno pode, por acidente ou blague, escrever um loop infinito, um `os.system("rm
-rf ~")`, ou uma bomba de memória).

### O que dá para fazer sem container (linha de comando, com ressalvas por SO)

**Correção de classificação**: nada nesta subseção é "utilitário POSIX" no sentido estrito —
`timeout` em particular **não está no POSIX/SUSv4** (não faz parte da lista de utilitários
padrão); é um comando do **GNU coreutils**, presente por padrão em praticamente toda distro
Linux mainstream, mas **ausente por padrão no macOS** (cujo userland é derivado do BSD, não do
GNU). `ulimit` em si é um builtin de shell definido pelo POSIX, mas o comportamento de algumas de
suas flags diverge entre Linux e macOS na prática (ver abaixo). O público-alvo deste produto
inclui quem está no Mac, então tratar isto como "POSIX, funciona em qualquer Unix" seria
enganoso.

- **Timeout de tempo de CPU/relógio**: `timeout <segundos> <comando>` (GNU coreutils) mata o
  processo se ultrapassar o limite — cobre loop infinito e a maior parte de custo computacional
  descontrolado, **no Linux**. No macOS sem Homebrew, `timeout` **não existe**; com
  `brew install coreutils`, o binário é instalado como `gtimeout` (Homebrew prefixa com `g` os
  comandos que colidem com equivalentes nativos do macOS, a menos que o usuário priorize o
  diretório `gnubin` no `PATH`) — não é plug-and-play. **Fallback real e mais portável**: como o
  harness deste produto provavelmente já roda em Python ou Node, usar o timeout nativo da
  linguagem em vez de depender de um binário externo — `subprocess.run(..., timeout=N)` em
  Python, ou `child_process.spawn` combinado com um `setTimeout` que chama `.kill()` em Node —
  isso funciona igual em Linux, macOS e Windows sem depender de coreutils estar instalado.
  Combinar, quando disponível, com `ulimit -t <segundos>` (limite de tempo de CPU do processo,
  via `setrlimit(RLIMIT_CPU)` — este sim definido pelo POSIX e suportado tanto em Linux quanto em
  macOS/BSD) para o caso de o processo ignorar o sinal de término.
- **Limite de memória**: `ulimit -v <KB>` (memória virtual) mata processos que tentam alocar além
  do limite **no Linux**. **No macOS, `ulimit -v` é conhecido por ser pouco confiável** — há
  relatos recorrentes de o limite não ser de fato aplicado pelo kernel da mesma forma que
  `RLIMIT_AS` no Linux, então não deveria ser tratado como piso garantido nesse SO. Fallback no
  Mac: monitorar RSS do processo filho por polling (`resource.getrusage`/leitura periódica de
  `/proc`-equivalente via `psutil`) e matar externamente ao ultrapassar um limite, ou aceitar o
  risco residual de bomba de memória como um caso em que vale a pena escalar para o "modo
  estrito" com Docker (`--memory`), que aplica o limite de forma consistente em qualquer SO.
- **Limite de processos/arquivos**: `ulimit -u <n>` (número de processos) evita fork bomb;
  `ulimit -f <blocos>` limita tamanho de arquivo escrito, útil contra escrita descontrolada em
  disco — estas duas são builtins POSIX e se comportam de forma razoavelmente consistente entre
  Linux e macOS.
- **Sem rede**: em Linux, `unshare --net` cria um network namespace isolado sem interface
  configurada — o processo simplesmente não tem como abrir socket para fora. **Ressalva**:
  `unshare --net` sozinho (sem `--user`) tipicamente exige `CAP_SYS_ADMIN`, ou seja, root, na
  maioria das distros — não é utilizável por um usuário comum sem ajuste. Para funcionar sem
  privilégio elevado, é preciso combinar com um user namespace próprio:
  `unshare --user --net --map-root-user <comando>` (o processo ganha "root" só dentro do seu
  próprio user namespace, o que autoriza criar o network namespace sem precisar de root no host)
  — e isso só funciona se a distro permitir *unprivileged user namespaces*
  (`kernel.unprivileged_userns_clone=1`; habilitado por padrão na maioria dos kernels modernos,
  mas desabilitado em alguns perfis de segurança mais restritos). `unshare` é uma ferramenta do
  **util-linux, específica de Linux** — **não existe no macOS**. No Mac, não há um equivalente
  simples de "isolar rede por processo sem privilégio administrativo"; as opções realistas são
  (a) aceitar que o caminho leve no Mac não isola rede por padrão e documentar esse risco
  residual para o aluno, ou (b) exigir o "modo estrito" com Docker (`--network none`) quando
  isolamento de rede for um requisito não negociável para aquele desafio.
- **Sem escrita fora do diretório do desafio**: rodar com `cwd` fixo no diretório do desafio e,
  quando possível, um usuário Unix sem permissão de escrita em nada fora dali — mais frágil que
  isolamento de filesystem de verdade, mas funcional para o caso comum (não protege contra um
  aluno mal-intencionado com conhecimento de exploits de kernel, protege contra acidente).

**Limitação honesta desse conjunto**: tudo isso roda **no mesmo kernel** do processo do host —
`ulimit`/namespaces reduzem superfície, não eliminam risco de escape via bug de kernel, e não
isolam o *filesystem* de leitura (o processo ainda enxerga o resto do disco, só não deveria
conseguir escrever fora do ulimit/permissões configuradas). Além disso, boa parte desses
mecanismos (`unshare --net` sem privilégio, `ulimit -v` confiável) só funciona plenamente no
Linux — no macOS o piso real, sem Docker, é mais fraco (timeout via linguagem em vez de
utilitário, sem isolamento de memória nem de rede garantidos). Para uso educacional, com código
gerado por um aluno tentando resolver um exercício (não um atacante ativo tentando escapar da
sandbox), essa é uma ameaça de probabilidade baixa, mas não nula — e menor ainda no Mac sem essas
proteções, o que é um argumento a favor de oferecer Docker/gVisor como opção mais acessível para
quem estiver nesse SO, não só como "modo estrito" opcional.

### O que exige container (ou algo mais forte)

- **Isolamento de filesystem completo** (aluno não enxerga nada fora do próprio diretório, nem
  para leitura) — exige namespace de mount ou container.
- **Filtragem de syscall** (seccomp) — Docker aplica um perfil seccomp padrão que bloqueia
  **FATO VERIFICADO (fonte)** cerca de 40–50 syscalls, reduzindo superfície de ataque de kernel;
  isso não existe com `ulimit` puro.
- **Isolamento robusto contra escape de kernel** — como containers Docker padrão compartilham o
  kernel do host, a comunidade de segurança considera que um container permissivo é
  razoavelmente fácil de escapar quando o objetivo é rodar código não confiável gerado por LLM
  (fonte: levantamentos de sandboxing de agentes de IA, 2026); as alternativas mais fortes citadas
  na literatura recente são **gVisor** (intercepta syscalls em user-space, processo nunca toca o
  kernel real) e **microVMs** (Firecracker/Kata Containers, cada execução ganha seu próprio
  kernel via KVM) — isolamento de fronteira de hardware, não de kernel compartilhado.

### Prós/contras de exigir Docker para este produto

**Prós**: isolamento de filesystem real; mesmo ambiente de execução em qualquer SO do aluno
(elimina "funciona na minha máquina" causado por versão de linguagem/lib diferente); mais fácil
de aplicar seccomp e limites de recurso de forma consistente via `--memory`, `--cpus`,
`--network none`, `--read-only`.

**Contras**: exige que o aluno tenha Docker Desktop instalado e rodando — atrito de instalação
não trivial para o público-alvo (alguém estudando, não necessariamente já com ambiente dev
completo); em Windows/Mac, Docker Desktop roda dentro de uma VM Linux por baixo, adicionando
camada de latência de I/O e consumo de RAM de fundo, perceptível numa máquina modesta; overhead
de partida de container (segundos) em vez de milisegundos de um processo `timeout`-limitado,
relevante se o aluno espera feedback quase instantâneo a cada tentativa; mais uma dependência
externa (versão de Docker, daemon rodando) que pode quebrar e virar suporte.

**INFERÊNCIA para este produto**: dado o público (alguém estudando por conta própria, não
necessariamente com Docker já configurado, e incluindo quem está no macOS) e o padrão de ameaça
(aluno tentando resolver exercício, não atacante ativo), o piso razoável para o caminho feliz é
**timeout via linguagem do harness** (não um binário externo) + `ulimit -t`/`-u`/`-f` onde
disponível + `unshare --user --net` no Linux quando o kernel permitir namespaces sem privilégio +
fallback gracioso e documentado onde qualquer um desses faltar (notadamente `ulimit -v`
confiável e isolamento de rede sem privilégio, ambos mais fracos ou ausentes no macOS) — com
Docker/gVisor como opção opt-in de "modo estrito" para quem já tem o ambiente, para quem está no
Mac e quer as mesmas garantias de memória/rede que o Linux oferece de graça, ou para deployment
self-hosted em servidor compartilhado (onde múltiplos alunos rodam no mesmo host e o cálculo de
risco muda). Exigir Docker como pré-requisito único elevaria a barreira de entrada de um jeito
que provavelmente conflita com o objetivo do produto — mas fingir que o piso sem Docker é
igualmente forte em qualquer SO seria impreciso.

---

## 6. Property-based testing (Hypothesis, fast-check, proptest, QuickCheck)

**O que é**: em vez de fixar exemplos concretos (`assert soma(2,3) == 5`), declara-se uma
propriedade que deve valer para qualquer entrada dentro de um domínio, e a ferramenta gera
(e, ao achar falha, *encolhe* — "shrinking" — até o menor contra-exemplo) centenas de casos
automaticamente. **FATO VERIFICADO (fonte)**: QuickCheck (Haskell) é o framework original e
introduziu shrinking de contra-exemplos; Hypothesis é o equivalente consolidado em Python,
integrado a pytest, com estratégias (`strategies`) para a maioria dos tipos nativos, compostas
para gerar tipos mais complexos; fast-check é o equivalente em JavaScript/TypeScript; proptest é
o equivalente em Rust.

```python
from hypothesis import given, strategies as st

# Testando uma propriedade, não um exemplo:
@given(st.lists(st.integers()))
def test_ordenar_e_permutacao_ordenada(lista):
    resultado = ordenar(lista)
    assert sorted(resultado) == resultado          # está em ordem
    assert sorted(resultado) == sorted(lista)       # é permutação do original
    assert len(resultado) == len(lista)
```

```javascript
import fc from 'fast-check';

test('inverter duas vezes retorna o original', () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (arr) => {
      expect(inverter(inverter(arr))).toEqual(arr);
    })
  );
});
```

### Por que é especialmente adequado a desafios matemáticos

Propriedades como comutatividade, associatividade, idempotência, "ida-e-volta" (`decode(encode(x))
== x`), monotonicidade e invariantes de forma (permutação, ordenação, soma preservada) são o
formato *nativo* de boa parte dos enunciados de matemática/algoritmos — e, como visto na Seção
1.6, evitam depender do LLM calcular um valor numérico específico certo, atacando diretamente o
modo de falha mais grave para este domínio.

### O custo de aprendizado que impõe ao aluno

**FATO VERIFICADO (fonte)**: a própria literatura introdutória de PBT (Criteo Tech Blog, Typeable)
descreve a habilidade central de PBT como "criar um gerador de dados eficaz que produz valores
potencialmente problemáticos" — que exige tanto conhecimento do domínio quanto familiaridade com
a API da ferramenta (composição de `strategies`/`arbitraries`, controle de tamanho/distribuição).
Isso não é trivial para quem está aprendendo a programar: escrever uma boa propriedade é, em si,
uma habilidade de abstração mais avançada que escrever um caso de exemplo — o aluno tem que
primeiro entender *qual invariante* seu código deveria preservar, o que pressupõe já ter
entendido o problema num nível mais profundo que "faça este exemplo passar". Um contra-exemplo
encontrado por shrinking também pode parecer arbitrário/confuso para um iniciante ("por que a
ferramenta escolheu justamente essa lista estranha?") sem uma explicação didática anexa.

**INFERÊNCIA operacional**: PBT deve ser tratado como uma **camada adicional**, gerada e mantida
pelo pipeline de validação (útil internamente para caçar mutantes que sobrevivem no passo 4 do
algoritmo da Seção 4, e para achar bugs no próprio teste antes de entregar), mas a interface que o
aluno vê por padrão deveria continuar sendo testes por exemplo, concretos e legíveis — com PBT
oferecido como modo avançado/opcional para desafios explicitamente sobre propriedades
matemáticas, não como padrão universal.

---

## 7. Mensagem de erro como material didático

A mensagem de falha do teste é, no fluxo deste produto, o principal canal de feedback do aluno —
ela precisa ensinar, não só reprovar. Uma boa mensagem de falha mostra: **entrada usada**,
**valor esperado**, **valor obtido**, e **a propriedade/regra que foi violada** em linguagem
que remete ao enunciado do desafio (não a jargão de implementação).

```python
# RUIM — pytest já mostra algo, mas sem contexto do domínio
def test_desconto():
    assert calcular_preco_final(100, 0.1) == 90

# Falha padrão do pytest (com assert rewriting) já ajuda:
#   assert calcular_preco_final(100, 0.1) == 90
#   AssertionError: assert 100 == 90
# mas não diz o que 100/0.1/90 significam nem por que 90 é o valor certo.

# BOM — contexto explícito, self-explicativo mesmo fora do código-fonte
def test_desconto_de_dez_por_cento_sobre_cem():
    preco_base, desconto, esperado = 100, 0.1, 90
    obtido = calcular_preco_final(preco_base, desconto)
    assert obtido == esperado, (
        f"calcular_preco_final({preco_base}, {desconto}) deveria aplicar "
        f"{desconto:.0%} de desconto sobre {preco_base} e retornar {esperado}, "
        f"mas retornou {obtido}. "
        f"Confira a fórmula: preco_base - (preco_base * desconto)."
    )
```

```javascript
// Vitest — expect(valor, mensagem) aceita mensagem customizada como 2º argumento.
// RUIM — mensagem genérica do matcher, sem ligação com o enunciado
test('preco final com desconto', () => {
  expect(calcularPrecoFinal(100, 0.1)).toBe(90);
});

// BOM — mensagem custom liga o resultado à regra do desafio
test('preco final com desconto', () => {
  const precoBase = 100, desconto = 0.1, esperado = 90;
  const obtido = calcularPrecoFinal(precoBase, desconto);
  expect(
    obtido,
    `Esperado ${esperado} (desconto de ${desconto * 100}% sobre ${precoBase}), ` +
    `mas obtido ${obtido}. A fórmula é precoBase - precoBase * desconto.`
  ).toBe(esperado);
});
```

**Atenção ao framework**: o segundo argumento de `expect(valor, mensagem)` acima é uma API do
**Vitest** — a própria documentação do Vitest registra a diferença: "Unlike Jest, Vitest
supports a message as the second argument [...]". **No Jest, esse segundo argumento é
silenciosamente ignorado** (Jest apenas não define esse parâmetro; a chamada não lança erro, mas
a mensagem nunca aparece no relatório de falha) — ou seja, o exemplo "BOM" acima, copiado
ao pé da letra num projeto Jest, voltaria a produzir a mensagem genérica do primeiro exemplo sem
nenhum aviso de que a customização foi perdida. Para obter o mesmo efeito em Jest, as opções são:
lançar um `Error` customizado diretamente em vez de usar `expect().toBe()`
(`if (obtido !== esperado) throw new Error(mensagem)` — perde a formatação de diff do Jest, mas
garante que a mensagem didática chegue ao aluno), ou registrar um matcher customizado via
`expect.extend` que componha a mensagem de erro. Como esta seção é justamente sobre garantir que
a mensagem de erro chegue ao aluno, o tutor precisa saber qual test runner o projeto do aluno usa
antes de gerar este padrão — o mesmo código gerado às cegas para os dois frameworks falha
silenciosamente em um deles.

Notas práticas:
- **Pytest já reescreve `assert` para mostrar introspecção automática** (valores das duas
  pontas da comparação) sem precisar de mensagem customizada — mas isso mostra *o quê* falhou,
  não *por quê* isso importa no domínio do desafio; para ensino, vale a pena somar os dois.
- Para asserções numéricas com tolerância, sempre nomear a tolerância na mensagem
  (`pytest.approx(esperado, rel=1e-6)`) para que o aluno entenda que pequena diferença de
  arredondamento é aceitável e não é isso que está sendo cobrado.
- Fatorar helpers de asserção repetidos (`assert_desconto_aplicado(base, pct, obtido)`) evita
  repetir a lógica da mensagem em cada teste e garante consistência didática entre desafios.
- Para propriedades (Seção 6), a mensagem de falha do shrinking deve ser complementada
  manualmente explicando a propriedade em português simples, porque o contra-exemplo encolhido
  sozinho raramente é autoexplicativo para iniciante.

---

## 8. Integridade: o aluno pode editar o teste para passar

### Estratégias técnicas

- **Separação `solution/` vs `spec/`**: o teste vive num diretório separado do código do aluno,
  nunca no mesmo diretório onde ele edita livremente — reduz edição acidental, não impede edição
  deliberada.
- **Checksum do arquivo de teste**: gravar hash (SHA-256) do conteúdo do teste no momento da
  geração/aprovação (Seção 4) e revalidar antes de rodar; se o hash não bater, sinalizar
  divergência (não necessariamente bloquear — pode ser um aluno legitimamente customizando um
  desafio próprio). **FATO VERIFICADO (fonte)**: checksum é o mecanismo padrão de detecção de
  adulteração de arquivo — detecta *que* mudou, não *quem* mudou nem *por quê*; não é proteção
  contra um usuário com acesso total ao próprio disco, que sempre pode recalcular/ignorar o
  checksum se quiser.
- **Teste read-only**: permissão de arquivo (`chmod 444` / atributo somente-leitura) — atrito
  de baixo custo, desencoraja edição casual, mas qualquer usuário com acesso ao próprio arquivo
  pode trivialmente `chmod` de volta. Serve como sinalização de intenção ("isto não deveria ser
  editado"), não como controle de acesso real.
- **Hook local (pre-run) que recalcula o hash do teste antes de aceitar um "passou"**: mais forte
  que read-only sozinho porque não depende de o aluno respeitar a permissão — o harness confere
  antes de contabilizar sucesso. Ainda contornável por alguém dispensado a decompilar o próprio
  harness, mas eleva o esforço de burlar bem acima de "editar um assert".

### A pergunta honesta

Vale a pena policiar quem estuda por vontade própria? O produto é uma ferramenta para
autoestudo — não há nota, prova ou credencial em jogo, e o usuário só prejudica a si mesmo
editando o teste para passar sem aprender. **INFERÊNCIA**: nesse cenário, o cálculo de custo-
benefício de "integridade forte" (ex.: sandbox adversarial, ofuscação do teste, telemetria de
edição) é desfavorável — o esforço de engenharia e o atrito de UX (mensagens de erro genéricas
por segurança, arquivos travados que atrapalham quem *legitimamente* quer entender o teste lendo
o código-fonte) tende a superar o benefício, porque o "adversário" nesse produto é a própria
pessoa que pediu para aprender. A recomendação é **proteção leve e transparente**: separação de
diretório + checksum + aviso claro ("este arquivo é a especificação do desafio; editá-lo só
muda o que está sendo cobrado, não te ensina a resolver") em vez de mecanismos adversariais
pesados. Onde a integridade passa a importar de verdade é num cenário diferente do descrito aqui
— se o produto vier a ser usado em contexto avaliativo (nota, certificado, ranking entre
usuários) — e nesse caso a estratégia muda de "desencorajar" para "detectar e invalidar
resultado", o que foge do escopo deste documento.

---

## Fontes

- Barr, E. T. et al. "The Oracle Problem in Software Testing: A Survey." IEEE TSE, 2015.
  https://ieeexplore.ieee.org/document/6963470/
- Chen, T. Y. et al. "Metamorphic Testing: A Review of Challenges and Opportunities." ACM
  Computing Surveys 51(1), 2018. https://dl.acm.org/doi/10.1145/3143561
- Wikipedia. "Metamorphic testing." https://en.wikipedia.org/wiki/Metamorphic_testing
- "Benchmarking LLMs for Unit Test Generation from Real-World Functions." arXiv:2508.00408.
  https://arxiv.org/html/2508.00408v1
- "Do Coverage and Mutation Scores of LLM-Generated Test Suites Correlate with Their
  Effectiveness? (Replicability Study)." arXiv:2607.22880. https://arxiv.org/html/2607.22880v1
- "Effective test generation using pre-trained Large Language Models and mutation testing."
  ScienceDirect (Information & Software Technology), 2024.
  https://www.sciencedirect.com/science/article/abs/pii/S0950584924000739 (MuTAP, mutation
  score 93,57%)
- "Automated Unit Test Improvement using Large Language Models at Meta" (TestGen-LLM).
  arXiv:2402.09171. https://arxiv.org/pdf/2402.09171
- Liu, J. et al. "Is Your Code Generated by ChatGPT Really Correct? Rigorous Evaluation of Large
  Language Models for Code Generation" (EvalPlus / HumanEval+). OpenReview.
  https://openreview.net/forum?id=1qvx610Cu7
- Huang, J. et al. "Large Language Models Cannot Self-Correct Reasoning Yet." arXiv:2310.01798,
  ICLR 2024. https://arxiv.org/abs/2310.01798
- "SELF-[IN]CORRECT: LLMs Struggle with Discriminating Self-Generated Responses."
  arXiv:2404.04298. https://arxiv.org/pdf/2404.04298
- Madaan, A. et al. "Self-Refine: Iterative Refinement with Self-Feedback." arXiv:2303.17651.
  https://arxiv.org/abs/2303.17651
- Shinn, N. et al. "Reflexion: Language Agents with Verbal Reinforcement Learning."
  https://openreview.net/pdf?id=vAElhFcKW6
- OpenAI. "CriticGPT" — cobertura e análise: IEEE Spectrum,
  https://spectrum.ieee.org/openai-rlhf ; "LLM Critics Help Catch LLM Bugs," arXiv:2407.00215,
  https://arxiv.org/abs/2407.00215
- Luo, Q. et al. "An Empirical Analysis of Flaky Tests." FSE 2014 (22nd ACM SIGSOFT
  International Symposium on the Foundations of Software Engineering), DOI
  10.1145/2635868.2635920. https://www.researchgate.net/publication/301428664_An_empirical_analysis_of_flaky_tests
  — taxonomia estendida: "Test Flakiness' Causes, Detection, Impact and Responses: A Multivocal
  Review." arXiv:2212.00908. https://arxiv.org/pdf/2212.00908
- Mirzadeh, I. et al. (Apple). "GSM-Symbolic: Understanding the Limitations of Mathematical
  Reasoning in Large Language Models." arXiv:2410.05229.
  https://machinelearning.apple.com/research/gsm-symbolic
- Cobbe, K. et al. "Training Verifiers to Solve Math Word Problems" (GSM8K). arXiv:2110.14168.
  https://arxiv.org/abs/2110.14168 — relata que os modelos "frequently fail to accurately
  perform calculations" (erro de cálculo aritmético como fonte comum de erro, mitigada no paper
  com anotações de calculadora); não discute especificamente modo CoT vs. não-CoT quanto a
  essa distinção.
- Taxas de erro de sintaxe em programas gerados a partir de enunciados via SyReLM/GPT-J
  (GSM8K/MultiArith/SVAMP): https://arxiv.org/pdf/2312.05571 (abordagens neurossimbólicas via
  Prolog/CLP(R) e Z3) — números específicos desse método, não de LLMs em geral.
- Springer, Empirical Software Engineering (2018). "A controlled experiment on time pressure and
  confirmation bias in functional software testing."
  https://link.springer.com/article/10.1007/s10664-018-9668-8
- Agile Institute. "A Dozen Reasons Why Test-First Is Better Than Test-Later."
  https://www.agileinstitute.com/articles/a-dozen-reasons-why-test-first-is-better-than-test-later
- pytest docs. "How to write and report assertions in tests."
  https://docs.pytest.org/en/stable/how-to/assert.html
- Vitest docs. "expect" — "Unlike Jest, Vitest supports a message as the second argument."
  https://vitest.dev/api/expect.html
- Documentação/uso de Hypothesis (Python), fast-check (JS), proptest (Rust), QuickCheck
  (Haskell): https://www.freecodecamp.org/news/intro-to-property-based-testing-in-python/ ;
  https://medium.com/criteo-engineering/introduction-to-property-based-testing-f5236229d237 ;
  https://typeable.io/blog/2021-08-09-pbt.html
- Figma Engineering Blog. "Server-side sandboxing: Containers and seccomp."
  https://www.figma.com/blog/server-side-sandboxing-containers-and-seccomp/
- Northflank. "How to sandbox AI agents in 2026: MicroVMs, gVisor & isolation strategies."
  https://northflank.com/blog/how-to-sandbox-ai-agents
- "Sandlock: Confining AI Agent Code with Unprivileged Linux Primitives." arXiv:2605.26298.
  https://arxiv.org/pdf/2605.26298
- Wikipedia. "Mutation testing." https://en.wikipedia.org/wiki/Mutation_testing
- Homebrew. "coreutils" formula (caveats sobre prefixo `g` em comandos que colidem com o
  userland nativo do macOS, incluindo `timeout`→`gtimeout`). https://formulae.brew.sh/formula/coreutils
- zyBooks. "ChatGPT and Cheat Detection in CS1 Using a Program Autograding System."
  https://www.zybooks.com/chatgpt-and-cheat-detection-in-cs1-using-a-program-autograding-system/
