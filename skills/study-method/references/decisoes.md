# Decisões — como perguntar sem virar formulário

Ao longo do estudo a skill precisa de escolhas do aluno: quanto tempo tem a sessão, se pode ler
o setup do lado, se mostra o mutation score. O catálogo delas é `assets/decisions.json`, e é a
**única** fonte: você nunca inventa decisão, opção ou default. `scripts/decisions-ask.sh` imprime
o que está em aberto e grava a resposta. Este arquivo é sobre a **conversa**. Catálogo em prosa,
com prós e contras de cada opção: `docs/08-decisoes-abertas.md` do repositório (o aluno nunca
vê esse arquivo, mas você pode contar o que está nele).

## Sumário
A regra do dono do projeto: explicar antes de perguntar · As quatro fases · O roteiro de uma
decisão · O atalho dos padrões · Quando o aluno não responde · O custo de mudar de ideia ·
O que nunca fazer · As 6 do dia zero · O que a skill nunca pergunta ao aluno · Os comandos ·
Quando algo dá errado

## A regra do dono do projeto: explicar antes de perguntar

**Explicação primeiro, pergunta depois. Sempre, sem exceção.** É requisito literal deste
projeto: as decisões existem para o aluno decidir, e ninguém decide o que não entendeu.

O campo `why_it_matters` de cada entrada já traz a explicação com analogia, no tom da skill. Use
esse texto — reescreva na sua voz se ele soar duro na conversa, mas **não pule** e **não resuma
até virar rótulo**. Uma pergunta que chega sem o porquê é um formulário; o aluno responde
qualquer coisa para se livrar dela, e a resposta fica gravada.

Sinal de que você errou: a pergunta caberia num `<select>` de página web. Se coube, faltou o
porquê.

## As quatro fases

| Fase | Quando roda | Quantas | O que caracteriza |
|---|---|---|---|
| `setup-init` | na criação do setup, antes da primeira aula | **6, teto duro** | sem a resposta não há primeira aula, ou ela sai pior de um jeito que o aluno percebe |
| `first-challenge` | na primeira geração de desafio deste setup | 10 | o assunto não existia antes de haver desafio |
| `session-15` | quando o histórico fica longo: limiar de compactação, revisão vencida, retomada após ausência | 4 | decisões sobre o passado do aluno, e só há passado depois de um tempo |
| `on-demand` | o aluno perguntou, **ou** você precisa da autorização dele para agir agora | 33 | consentimento no ponto de coleta, nunca no dia zero |

`on-demand` é a fase que mais se erra. Ela **não** é uma lista para percorrer: é um gatilho. A
pergunta sai no instante exato em que você iria instalar algo, abrir o `README.md` de outro
setup, sair para a web ou gravar texto livre do aluno — e não antes.

## O roteiro de uma decisão

Quatro movimentos, nesta ordem, em linguagem falada:

1. **Explique** o que está em jogo (`why_it_matters`), com a analogia.
2. **Pergunte** (`question_ptbr`), uma pergunta só.
3. **Ofereça as opções** com o que se ganha e o que se paga em cada uma — os `pros` e `cons` do
   catálogo. Toda opção tem custo declarado, inclusive a recomendada: opção sem custo é anúncio,
   não escolha. Diga qual é o default e por quê.
4. **Cale a boca e espere.** Silêncio depois de perguntar é regra permanente da skill.

Com duas opções, ofereça as duas na frase. Com mais de três, dê o default e uma alternativa
plausível, e diga que há outras se ele quiser ver — despejar sete linguagens de programação numa
frase não é oferecer escolha.

## O atalho dos padrões

Ofereça-o **na primeira decisão de cada fase**, com estas palavras ou equivalentes:

> Posso assumir os padrões e a gente ajusta no caminho — ou você prefere escolher agora?

Quem só quer começar, começa. Se o aluno aceitar, rode `decisions-ask.sh <setup_root> --defaults
<fase>` e **leia em voz alta a lista que ele imprime**. O script grava `default_used: true` e
imprime o que assumiu justamente para você poder declarar.

Uma exceção: **`D-B13` (o que você quer estudar) não tem default possível** — é texto livre do
aluno. O atalho aplica as outras cinco e essa continua pendente; pergunte-a mesmo assim.

## Quando o aluno não responde

Ele mudou de assunto, respondeu outra coisa, ou disse "tanto faz". Então:

1. Use o default.
2. **Avise uma vez** — em uma frase, dentro do fluxo, sem interromper a aula: *"vou seguir com
   60 minutos por sessão; é só me dizer se quiser outro tamanho."*
3. Não repita o aviso em toda sessão. Uma vez é honestidade; toda vez é cobrança.
4. Não repergunte. A resposta ficou gravada com `default_used: true`, e `decisions-ask.sh` não
   a traz de volta na próxima vez.

**Default aplicado em silêncio é bug.** Se você gravou um default e não disse ao aluno, o
contrato foi quebrado — não importa quão óbvio o padrão parecia.

## O custo de mudar de ideia

Cada decisão declara `reversibility`, e ele muda o tom da conversa:

| Valor | O que significa | Como conduzir |
|---|---|---|
| `cheap` | muda numa linha; nada precisa migrar | não faça cerimônia: sugira o default e siga |
| `moderate` | mudar depois exige migrar dado já escrito | mencione de passagem que dá para mudar, com algum trabalho |
| `expensive` | **há efeito que não se desfaz** — histórico de git, dado já gravado, comparação de score invalidada | **diga isso antes de perguntar**, e diga o que exatamente não volta atrás |

Para `expensive`, o `why_it_matters` da entrada nomeia o que não se desfaz. Repita esse pedaço
na frase; não basta dizer "essa é difícil de mudar".

## O que nunca fazer

- **Nunca** despeje várias perguntas de uma vez, nem numeradas, nem em lista. Uma por vez.
- **Nunca** pergunte sem explicar antes.
- **Nunca** repergunte o que já está respondido no `setup.json` — o script já filtrou.
- **Nunca** abra a fase `on-demand` como um menu de configurações. Ela é gatilho, não catálogo.
- **Nunca** invente opção que não está no catálogo, nem mude o default por conta própria.
- **Nunca** leve ao aluno uma decisão de `audience: builder` (forma de schema, exit code,
  namespace de identificador, operador de mutação). O script filtra e recusa; se você escrever
  a pergunta na conversa, o filtro não te salva.
- **Nunca** trate a resposta como definitiva quando ela for `cheap`: se o aluno hesitar, diga que
  muda numa frase e siga.

## As 6 do dia zero

Nesta ordem, uma de cada vez: `D-B13` (o que estudar) → `D-B04` (onde criar a pasta) → `D-B14`
(já tem material?) → `D-B17` (exercício de código, em qual linguagem) → `D-B15` (minutos por
sessão) → `D-B16` (como está no assunto hoje). Depois, uma confirmação curta do que foi
entendido, antes de criar qualquer arquivo.

A primeira dá contexto às outras cinco — não reordene. `D-B04` é a única `moderate` do grupo:
criar quatro diretórios no meio de um projeto que não tinha nada a ver dá trabalho de desfazer,
e o default já vem escrito na própria pergunta para ser aceito com uma tecla.

## O que a skill nunca pergunta ao aluno

Das 114 decisões do catálogo, **61 são congeladas** (`ask_when: never`, `audience: builder`).
Elas ficam documentadas com o porquê e o custo de reverter — auditoria, não menu. Se o aluno
perguntar "por que o arquivo se chama `setup.json`?", responda pelo conteúdo da decisão; isso é
conversa, não é a entrevista.

## Os comandos

```
decisions-ask.sh <setup_root> <fase>                  # o que está em aberto, com o porquê e as opções
decisions-ask.sh <setup_root> <fase> --json           # o mesmo, em JSON
decisions-ask.sh <setup_root> --record <id> <opcao>   # grava a resposta do aluno
decisions-ask.sh <setup_root> --defaults <fase>       # assume os padrões DECLARANDO cada um
```

`--record` aceita `--session <NNNN>` (a sessão em que a pergunta foi feita) e `--note <texto>`
(algo que o aluno disse e vale guardar junto). Para `D-B13`, que é texto livre, use
`--record D-B13 free_text --value "<o que ele disse>"`.

A resposta é gravada por escrita atômica no caminho de `writes_to` e o `setup.json` é validado
contra o schema logo depois; se não validar, o script reverte e sai `5` — nada fica pela metade.

## Quando algo dá errado

| Exit | O que aconteceu | O que fazer |
|---|---|---|
| `2` | id de decisão inexistente, opção inválida, ou decisão de `builder`/congelada | releia o id no catálogo; se a opção não existe, você inventou uma |
| `3` | não há `setup.json` a partir do caminho dado | está fora de um setup — resolva o setup antes |
| `5` | o manifesto resultante não valida | nada foi gravado; relate ao aluno e siga a aula sem a resposta |
| `1` | falha de I/O ou catálogo ilegível | a aula continua; decisão sem resposta nunca impede uma aula de começar |

Falha ao gravar uma decisão **não** cancela a aula. Diga o que aconteceu em uma linha, use o
default em memória para o turno corrente, e não grave nada.
