# A barra de autoria — o que toda aula tem de cumprir (medida, não opinada)

> Origem: medição das três trilhas do disco em 2026-09-22 (execução da revisão pedida pelo dono).
> O `python-iniciante` é o curso de referência: os limiares abaixo são os que ele cumpre com
> **zero** exceção e que o `rust-iniciante` viola. Cada linha vira regra de gate na bateria
> agnóstica de linguagem A17–A22 (`docs/16-engine-de-trilha.md` §5.1).

## Os números medidos que justificam cada limiar

| Métrica | python-iniciante (referência) | rust-iniciante (o curso ruim) |
|---|---|---|
| produtivas por aula (min/mediana/max) | 1 / 1 / 3 | 1 / 1 / **6** |
| aulas com `productive` > 2 | 7 (todas colapsam a ≤2 pela regra do par) | **22** |
| `productive ∪ receptive` máximo | 3 | **11** (aula 1) |
| seções de teoria (min/mediana/max) | **2** / 3 / 5 | **1** / 3 / 3 |
| chave produtiva SEM nenhuma demonstração em bloco cercado | **0** | **3** |
| maior seção montada | 585 chars | 554 chars |

## A barra — obrigatória em toda aula nova

1. **A17 — teto do passo.** No máximo **2** construções produtivas novas por aula, contadas depois
   do colapso pela regra do par (chave que distingue + derivadas inevitáveis = 1 item). Aula de
   consolidação (`role: "consolidation"`) re-declara o `targetAtom` e não introduz chave nova.
2. **A18 — a primeira aula do curso.** No máximo **1** construção produtiva nova; e TODA chave que
   o aluno LÊ na aula (teoria, `starterCode`, `testsCode`) que não seja semente do harness precisa
   de seção de teoria própria que a demonstre. Na aula 1 não existe "o aluno só copia".
3. **A19 — declarar não é demonstrar.** Toda chave de `introduces` (produtiva **e** receptiva) tem
   de aparecer em bloco cercado **com tag da linguagem** (` ```c `, ` ```rust `, ` ```python `) na
   teoria desta aula ou de uma anterior. Declarar em `introduces` NÃO ensina — e declarar sem
   demonstrar é o defeito que legaliza o penhasco (`budget.ts:281`: `saida = entrada ∪ introduces`).
4. **A20 — aula sem desafio não é aula.** Aula `role: "regular"` precisa de `challenges[]` com o
   desafio no disco e de `introduces.productive` não-vazio.
5. **A21 — carga de novidade.** `|productive ∪ receptive|` ≤ **4** por aula, e
   **seções de teoria ≥ max(2, ceil(novas/2))**.
6. **A22 — duas formas** (aviso com contagem, meta 0): cada chave produtiva aparece em **≥2
   ocorrências sintaticamente distintas** nos blocos da aula (argumento literal *e* expressão;
   condição comparada *e* booleana pronta). A comparação é NORMALIZADA — espaço colapsa e
   identificador vira `ID` —, porque medindo o `snippet` cru as "duas formas" de `+` viraram
   `"+ b"` e `"+b"`, que é a mesma forma com e sem espaço.
7. **A24 — o quiz não pode ser acertado pelo COMPRIMENTO.** ERRO quando, numa aula com ≥2
   afirmações, a opção correta é a mais longa das quatro, sozinha, em TODAS elas e por mais de 8
   caracteres de folga; AVISO por afirmação. Medido: com quatro opções de comprimentos quaisquer a
   correta é a mais longa em 25% das vezes (o acaso); o `python-iniciante` está em 18% e o
   `rust-iniciante` estava em **73%** — "clique na maior" acertava três de cada quatro afirmações do
   quiz de Rust sem ler nada. O produto de-vaza a POSIÇÃO (permuta a ordem de exibição); ninguém
   de-vaza o comprimento. Cuidado com o defeito espelho: a correta também não pode virar
   sistematicamente a mais curta.
8. **O bloco de teoria PARSEIA sozinho — e A19 reprova o que não parseia.** O extrator dá duas
   chances a um bloco de teoria: o fonte cru e, se ele falhar, o MESMO fonte embrulhado num corpo de
   função (`sm_fragmento_de_teoria`, `engine/extract.ts:867`), o que legaliza `printf("oi\n");` e
   `let x = 5;` soltos. O que o envelope **não** faz é inventar declaração: um `if (v[j] > v[j+1])`
   solto reprova com *use of undeclared identifier* nas duas tentativas, e bloco que não parseia cai
   em A19 como ERRO (fail-closed — o gate não pode medir o que o parser recusa). Declare no próprio
   bloco o que ele usa: `int v[5] = {3, 1, 4, 1, 5}; int j = 0;` antes do `if`. Medido em
   2026-09-22: 1 bloco em 115 aulas do `c-iniciante` caía nisso, e o conserto melhorou a aula — o
   aluno passou a ver de onde `v` e `j` vinham.
9. **Teto de leitura.** Cada seção montada (markdown + bloco + explicação) ≤ **560 chars**
   (typewriter: 21 s × 28 chars/s = 588).
10. **Quiz.** 2–3 `assertions`, `options` com exatamente 4 itens, `sectionId` apontando a seção que
   demonstra, `feedback` que ensina.
11. **Fontes.** 2–3 `sources[]` oficiais, URL real e verificável.
12. **O desafio prova.** As quatro provas de execução por desafio (solução passa · starter falha ·
    `expectedTestCount` == executado · stub vazio falha), `requirements[]` em bijeção 1:1 com os
    testes, e o teste FORÇA a construção-alvo (J5: o código mínimo que passa contém o alvo).

## O que NÃO vale como cumprimento

- Ampliar `introduces` para calar o gate (é o defeito com outro nome — se falta orçamento, o defeito
  é do grafo: **quebre a aula**, nunca declare mais).
- Bloco cercado **sem** tag (não é código para o extrator) ou crase inline (é prosa).
- Contagem `> 0` em vez de igualdade na contagem de testes.
- Aula que "explica rapidinho" um pré-requisito fora do orçamento.
