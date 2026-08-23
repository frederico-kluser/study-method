# BUILD_SPEC — como construir a skill `study-method`, em detalhe

> **O que é este arquivo.** A especificação completa de construção de uma Agent Skill chamada
> `study-method`: um tutor de estudo que ensina programação e a matemática que aparece nela **através
> de código executável**, com **memória persistente em disco** entre sessões e **desafios cujo teste é
> validado por execução** antes de chegar ao aluno.
>
> **Para quem foi escrito.** Para uma LLM que vai construir a skill do zero, e para a pessoa que
> revisa o que ela construiu. É **contrato**, não tutorial: o que cada artefato recebe, o que produz,
> qual é o algoritmo e quais são as condições de erro.
>
> **É um arquivo só, de propósito.** Referência aninhada faz a própria LLM ler pela metade: ela abre o
> primeiro nível, age com o que leu, e o segundo nível — que continha a metade que faltava — só é
> aberto se houver um segundo turno em que alguém se lembre dele. O contrato quebra sem erro visível.
> A mesma razão pela qual a skill tem **um nível só** de `references/` (§8.5) vale para este documento.

## O pedido que originou tudo

Duas frases do dono do projeto governam este arquivo. Estão preservadas literalmente porque são a
autoridade sobre **o quê** construir:

> "quero que pesquise profundamente e crie toda a base para ela **e um documento completo explicando
> como ela deve ser feita em muitos detalhes**, pensando que esse documento vai instruir uma LLM para
> construí-la, e que ela será um repo do GitHub para incentivar isso"

> "pode colocar no texto ideias que eu possa ter esquecido, mas coloque que elas sejam **questionadas
> durante a criação da skill** de modo que o usuário vá decidindo, e que elas sejam **explicadas**
> durante essa criação"

O segundo pedido é o que a maioria dos documentos técnicos não faz, e é o que dá a este a sua forma
mais visível: **as decisões que continuam em aberto não viraram uma lista no fim do arquivo.** Elas
viraram **48 marcadores** espalhados pelo texto, cada um no ponto exato da construção em que a
decisão importa, com a pergunta em linguagem de gente, o porquê com analogia, as opções com prós e
contras, o default e o custo de mudar de ideia depois:

```
> **PERGUNTE AO USUÁRIO (D-NNN)** — <a pergunta>
> <por que importa, com a analogia>
> **Opções:** <(a) …> · <(b) …>
> **Default:** <(x)> · **Custo de mudar depois: cheap | moderate | expensive**
```

Ao chegar num deles durante a construção: **pare, pergunte e espere.** Se o usuário não quiser
decidir, aplique o default **e diga que aplicou**. As regras completas estão em §0.7.4, e o roteiro
das 48, agrupado por momento da construção, está no **Apêndice A**.

## Por onde começar

| Se você é… | Comece por |
|---|---|
| a LLM que vai construir | **§0.4** — a ordem de construção, etapa por etapa, com o que cada uma bloqueia. Depois **§0.7** (como ler) e **Parte 1** (os contratos que precisam estar congelados antes de qualquer schema) |
| quem revisa o que foi construído | **§0.5** — os quatro gates e como rodá-los; depois **Parte 8**, §8.9 |
| quem quer entender o produto antes do código | **§0.1** (o que é e o que não é), **§0.2** (o pedido como critérios de aceitação) e **§0.3** (as três contradições entre o pedido e a realidade medida) |
| quem só quer ver as perguntas em aberto | **Apêndice A** |

**Convenções de marcação usadas em todo o documento:** ⭐ marca o que uma LLM construtora não
consegue reinventar sem errar · ⏳ marca o que envelhece (número medido, versão de máquina, contagem
que depende do estado do repositório) · ⚑ marca uma decisão arbitrada que **revoga** o que outro
documento dizia · ⚠ marca uma divergência conhecida entre fontes.

