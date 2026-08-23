# `routing/` — a `description` dispara nas horas certas?

## Por que este é o teste mais importante da suíte

O campo `description` do frontmatter do `SKILL.md` é o **único** insumo de roteamento da skill. O
harness não lê o corpo, não lê as `references/`, não executa nada: ele compara o pedido do usuário
com aquele parágrafo e decide sozinho se carrega a skill. Tudo o que está escrito nas 88 regras
permanentes é irrelevante nos turnos em que a skill não foi invocada.

Duas falhas simétricas, com custos **assimétricos**:

| Falha | O que acontece | Custo |
|---|---|---|
| **Falso positivo** — dispara em trabalho normal de programação | o usuário pediu para corrigir um bug e recebe um tutor querendo criar setup, abrir sessão e fazer pergunta de recuperação | **alto e irreversível na hora**: quebra a tarefa, gasta contexto, e ensina o usuário a desconfiar da skill |
| **Falso negativo** — não dispara quando devia | o usuário pediu para estudar e recebe uma resposta normal de assistente | **baixo**: ele reformula, ou invoca a skill pelo nome |

Por isso o critério de aprovação **não é simétrico**. Ver abaixo.

## Os conjuntos

| Arquivo | Linhas | pt-BR | inglês | Fronteira |
|---|---|---|---|---|
| `should-trigger.tsv` | 20 | 12 | 8 | 5 |
| `should-not-trigger.tsv` | 20 | 12 | 8 | 6 |

Colunas (TSV, separador é tabulação literal, sem aspas):

| Coluna | Valores | O que é |
|---|---|---|
| `id` | `RT-NN` / `RN-NN` | identificador estável do prompt |
| `idioma` | `pt-BR` \| `en` | idioma do prompt |
| `esperado` | `disparar` \| `nao_disparar` | o comportamento correto |
| `fronteira` | `sim` \| `nao` | `sim` = prompt deliberadamente próximo da fronteira. São os que informam; os outros são o piso |
| `prompt` | texto | o que o usuário digita, literal |
| `por_que` | texto | qual trecho da `description` justifica a expectativa |

Os prompts de `fronteira: sim` existem para **encontrar o limite**, não para inflar a contagem de
acertos. Se todos os erros da suíte estiverem neles, o roteamento está calibrado e a `description`
está no ponto certo de largura. Se houver erro em prompt de `fronteira: nao`, a `description` está
quebrada.

## Critério de aprovação

**Arbitrado aqui, por engenharia — não derivado de dado empírico.** Está escrito para poder ser
contestado e mudado, não para parecer objetivo.

| Conjunto | Critério | Racional |
|---|---|---|
| `should-not-trigger.tsv`, linhas com `fronteira: nao` (14) | **zero** disparos. Um único disparo reprova. | invadir trabalho normal de programação é o pior modo de falha da skill |
| `should-not-trigger.tsv`, linhas com `fronteira: sim` (6) | no máximo **1** disparo | a fronteira é ambígua por construção; um erro aqui é sinal de calibração, não de defeito |
| `should-trigger.tsv`, linhas com `fronteira: nao` (15) | **todas** disparam | são os pedidos explícitos de estudo que a `description` cita quase literalmente |
| `should-trigger.tsv`, linhas com `fronteira: sim` (5) | pelo menos **3** disparam | idem |

**Reprovou em qualquer linha?** O conserto é na `description`, **nunca** no conjunto de prompts.
Editar o prompt para o resultado ficar verde é falsificar a avaliação — se um prompt estiver
errado (mal escrito, ambíguo por acidente, não representativo), corrija-o e **anote a mudança**
no commit, para que o resultado anterior não seja comparado com o novo em silêncio.

## Protocolo de execução — manual ou assistida

Não há como automatizar isto sem um harness que exponha a decisão de roteamento. `run-evals.sh`
verifica o **formato** dos conjuntos e o **texto da `description`**; a decisão de disparo, não.

Para cada prompt:

1. Abra uma **sessão limpa** — sem histórico, sem a skill mencionada, no diretório que a linha
   pede (por padrão um diretório qualquer **sem** `setup.json`, para não confundir roteamento com
   bootstrap).
2. Cole o prompt **literalmente**. Não adicione contexto, não explique, não diga "usando a skill".
3. Registre se a skill `study-method` foi carregada — pelo indicador do harness, ou pela evidência
   comportamental (a resposta abre pelo protocolo de sessão em vez de responder direto).
4. Anote em `results-template.tsv`: `id`, `execucao` (1..3), `disparou` (`sim`/`nao`),
   `evidencia` (o que você observou), `data`.

**Três execuções por prompt.** Roteamento também é não determinístico. Um prompt que dispara em
2 de 3 execuções conta como **instável** — registre `instavel` na coluna de veredito e trate como
falha de calibração, não como aprovação parcial.

## Limitações declaradas deste teste

- **Sem histórico.** Prompts reais chegam depois de outros turnos, e o histórico muda o
  roteamento. Tudo aqui é medido em sessão limpa; é o caso mais fácil.
- **Depende do harness.** Versões diferentes de Claude Code roteiam com heurísticas diferentes.
  Um resultado só é comparável com outro da mesma versão — anote-a em `results-template.tsv`.
- **Não cobre a coexistência com outras skills.** Se o usuário tiver outra skill de ensino
  instalada, a disputa entre `description`s não é medida aqui.
- **20 + 20 é uma amostra pequena.** É grande o bastante para pegar `description` grosseiramente
  larga ou grosseiramente estreita, e pequena demais para estimar taxa de erro. Não converta o
  resultado em percentual.
