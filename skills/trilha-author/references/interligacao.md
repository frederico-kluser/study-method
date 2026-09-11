# Cursos que se interligam — fronteiras, cadeia e porta-de-entrada

Regras de execução do `mapear_curso` quando o pedido é uma **cadeia de cursos** (ex.: iniciante →
intermediário → avançado → especialista) ou quando um curso novo se apoia em outro já autorado. O
mecanismo inteiro da engine é **por trilha** — cada curso é uma trilha AUTOCONTIDA — e a ligação
entre elas é um **contrato declarado**, nunca um pressuposto invisível.

## 1. O estado do produto, para não inventar

Hoje o produto tem **uma** trilha publicada — `app/resources/tracks/python/` — e docs/17 declara
"uma trilha só": não existe trilha introdutória separada nem trilha "avançada"; o aluno entra sem
nunca ter programado e sai capaz de trabalhar como sênior em Python. Esta skill existe para o
momento em que o desenho do produto ganhar **N cursos encadeados**: o mecanismo que a engine já
tem para isso é (a) o campo `entryCriteria?: string[]` do `track.json` (presente no schema e hoje
vazio na trilha publicada — `trackTypes.ts` o valida como array opcional), e (b) o fato de o
orçamento ser **derivado por trilha** (docs/16 §3.5): a entrada de toda trilha é axioma estrutural
+ semente do harness (docs/17), e todo o resto vem do currículo da própria trilha. Consequência
dura: **a trilha B não herda nada da trilha A** — se uma construção de A precisa aparecer em B
(no enunciado, na teoria, no starter, nos testes ou na solução), B precisa **ensinar** essa
construção no próprio currículo, ou o gate reprova em A4/A13 (teoria), A1/A2 (starter/solução) ou
A3 (testes de entrada).

## 2. Fronteiras por competência, nunca por rótulo

A referência de como definir fronteira está na trilha `python` (docs/17, "As duas fronteiras"):
júnior → pleno no fim do módulo 12 (escrever um programa inteiro sozinha: arquivo, erro, módulos,
classes); pleno → sênior no fim do módulo 21 (usar a linguagem como ela é: protocolos, geradores,
tipos, testes, concorrência); sênior = **medir antes de decidir**. Cada fronteira é definida pelo
que a pessoa **consegue fazer sozinha** — não por "nível intermediário" nem por lista de tópicos.

Para o `mapear_curso` de um curso da cadeia:

1. Escreva a **saída** do curso: ações verificáveis ("escreve um programa de N arquivos com
   tratamento de erro", "ler e escrever arquivos", "usar dicionário e lista sem consultar"…).
2. Escreva a **entrada** = a saída do curso anterior, nas mesmas unidades (competências).
3. Publique a entrada no `track.json` do curso em `entryCriteria[]` — são as competências
   pressupostas do aluno que entra.
4. Grave a cadeia nos **contratos** (o doc da trilha, ao lado das tabelas Ensina/Presume): quem é o
   curso anterior, qual é a fronteira, e qual módulo porta-de-entrada a reintroduz.

## 3. O módulo porta-de-entrada — regra dura

Todo curso da cadeia (exceto o primeiro) **começa com um módulo porta-de-entrada** que
re-introduz, **em aulas próprias**, as construções de fronteira que o curso anterior ensinou.
Motivo estrutural: o orçamento da trilha B não contém o currículo de A, e as regras não abrem
exceção:

- **P-FORMA (A13)**: se a teoria de B usa uma construção de A sem aula que a demonstre, é erro;
- **P-DURA (A4/A2)**: se a solução de um desafio de B usa uma construção de A sem aula de origem em
  B, é erro — e pior, com `primeiraAulaQueEnsina === null` é **lacuna de currículo** (docs/16 §5.5:
  ação prescrita: criar a aula atômica que falta);
- **P-CONTRA (A3)**: o teste de um desafio de B é lido com o orçamento de **entrada** de B — que
  não inclui A.

A porta-de-entrada não é "revisão rápida" nem aula de nivelamento opcional: são aulas normais,
atômicas, com teoria + quiz + desafio, como qualquer outra — e o `entryCriteria` declara as
competências, a porta-de-entrada declara as construções.

## 4. O que NÃO fazer

- **Curso que presume o orçamento de outro sem re-introduzir.** É o defeito que a engine existe
  para pegar — a trilha legada apagada tinha 112 de 118 desafios com violação, e o padrão de
  "cobrar sem ensinar" é exatamente este ("escrevido de trás para frente: primeiro o desafio,
  depois uma seção 'Exemplo completo' com a solução literal", docs/16 §1).
- **Copiar o conteúdo do curso anterior na porta-de-entrada.** Re-introduzir é ensinar de novo em
  aulas novas com os próprios recursos de B — não duplicar `lesson.json` de A (I3: unicidade de
  origem vale **dentro** de cada trilha; mas o objetivo da porta é o aluno ter a construção com
  origem **nesta** trilha, então a aula é nova, escrita para o público de B).
- **Declarar a cadeia só na conversa.** A cadeia vive nos contratos (o doc da trilha) e no
  `entryCriteria` do `track.json`. Decisão de produto não registrada em contrato não existe
  (P-CONTRATO).
- **Fronteira por rótulo** ("intermediário", "avançado") sem competência verificável: o rótulo não
  diz o que o aluno sabe fazer, e o `entryCriteria` fica inverificável.

## 5. Checklist do `mapear_curso` em cadeia

1. `entryCriteria[]` do curso = saída do curso anterior (competências, em pt-BR, no `track.json`).
2. Primeiro módulo é a porta-de-entrada: uma aula por construção de fronteira de que o curso
   depende, cada uma com Ensina/Presume completos e gates verdes.
3. Tabela Ensina/Presume de cada módulo seguinte só presume construção com aula de origem **nesta**
   trilha.
4. Cadeia documentada no doc da trilha: anterior → fronteira → porta-de-entrada.
5. `validar_modulo` roda nos quatro gates **antes** de `publicar` — em cadeia, o curso B é auditado
   como trilha independente, e é isso que prova (não promete) que B não cobra nada que B não
   ensina.
