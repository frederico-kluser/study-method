# Cursos que se interligam — fronteiras, cadeia e porta-de-entrada

Regras de execução do `mapear_curso` quando o pedido é uma **cadeia de cursos** (ex.: iniciante →
intermediário → avançado → especialista) ou quando um curso novo se apoia em outro já autorado. O
mecanismo inteiro da engine é **por trilha** — cada curso é uma trilha AUTOCONTIDA — e a ligação
entre elas é um **contrato declarado**, nunca um pressuposto invisível.

## 1. O estado do produto, medido (para não inventar)

Três trilhas no disco, todas o **primeiro** curso da sua cadeia (medido em 2026-09-22):

```bash
cd app && ls resources/tracks/
# c-iniciante  python-iniciante  rust-iniciante
cd app && for t in python-iniciante rust-iniciante c-iniciante; do \
  jq -c '{cadeia,nivel,cursoAnterior,programmingLanguage}' resources/tracks/$t/track.json; done
# {"cadeia":"python","nivel":1,"cursoAnterior":null,"programmingLanguage":"python"}
# {"cadeia":"rust","nivel":1,"cursoAnterior":null,"programmingLanguage":"rust"}
# {"cadeia":null,"nivel":null,"cursoAnterior":null,"programmingLanguage":"c"}   (em autoria)
```

A cadeia passou a existir **em código** em 2026-09-22 (`engine/graph/cadeia.ts`:
`cadeiaAnteriorDe`, `ensinadoAntesNaCadeia`, consultada pelo passo `converger`). Antes disso
`entryCriteria` era prosa livre que **nenhum gate lia** — o único leitor que usa o SENTIDO dele segue
sendo um prompt de LLM (`services/challengeRegenerator.ts`), e a descoberta de trilhas continua sendo
`readdir` + `sort()` alfabético (`content/trackLoader.ts:310`, `listTrackSlugs`), que põe `c-iniciante`
antes de `python-iniciante` por acidente de alfabeto. `deriveTrackBudget` (`budget.ts:216`) **não tem**
parâmetro de predecessor, e continua sem.

Consequência dura, e ela não mudou: **a trilha B não herda orçamento nenhum da trilha A.** A entrada de
toda trilha é axioma estrutural + semente do harness (docs/16 §3.5) — se uma construção de A precisa
aparecer em B (no enunciado, na teoria, no starter, nos testes ou na solução), B precisa **ensinar** essa
construção no próprio currículo, ou o gate reprova em A4/A19 (teoria), A1/A2 (starter/solução) ou A3
(testes de entrada). O que `cadeia.ts` acrescenta não é herança: é a **distinção** entre "ninguém ensina"
(LACUNA → quebrar/criar aula) e "o curso anterior ensina" (CADEIA → porta-de-entrada), que antes caíam no
mesmo balde. Para as três trilhas de hoje, `ensinadoAntesNaCadeia` devolve mapa **vazio** — ou seja, a
resposta hoje é sempre o ramo (c), quebrar a aula (`recursao.md` §6).

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

**A primeira aula do módulo porta-de-entrada tem o teto da aula 1** (P-ZERO/A18): 1 construção produtiva
nova, e nada em `introduces.receptive` sem seção que a ensine. Reintroduzir é **ensinar de novo**, não
"presumir": o orçamento não se herda, então a aula da porta é uma aula inteira, com o mesmo teto de passo
de qualquer outra (`npm run engine -- barra <slug>` conta, e o excedente é aula própria).

**Como o gate chega a este ramo.** No passo `converger`, a construção sem origem nesta trilha é
classificada em **CADEIA** quando `ensinadoAntesNaCadeia` devolve o endereço da aula do curso anterior que
a ensina primeiro; a ação do catálogo fechado é `MOVE_CONCEPT_TO_ENTRY_BUDGET` — ela vira aula da
porta-de-entrada, nunca "presumida". Sem curso anterior declarado (`cursoAnterior: null`), o mesmo achado
cai em **LACUNA** e a ação é criar a aula que falta ou quebrar a aula problemática. Conferir qual é o seu
caso é um comando: `npm run engine -- convergir <slug>` imprime `RAMOS … CADEIA n · LACUNA n`.

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

1. `entryCriteria[]` do curso = saída do curso anterior (competências, em pt-BR, no `track.json`), **e**
   os três campos que o código lê: `cadeia`, `nivel`, `cursoAnterior` (`jq -c '{cadeia,nivel,cursoAnterior}'
   resources/tracks/<slug>/track.json`). Sem `cursoAnterior` o ramo CADEIA nunca dispara e toda construção
   de fronteira cai em LACUNA.
2. Primeiro módulo é a porta-de-entrada: uma aula por construção de fronteira de que o curso
   depende, cada uma com Ensina/Presume completos e gates verdes — a primeira delas no teto da aula 1
   (P-ZERO/A18).
3. Tabela Ensina/Presume de cada módulo seguinte só presume construção com aula de origem **nesta**
   trilha.
4. Cadeia documentada no doc da trilha: anterior → fronteira → porta-de-entrada.
5. `validar_modulo` roda nos **seis** gates e `converger` fecha em **PONTO-FIXO** **antes** de `publicar`
   — em cadeia, o curso B é auditado como trilha independente, e é isso que prova (não promete) que B não
   cobra nada que B não ensina.
