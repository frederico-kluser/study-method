/**
 * src/storybook/fixtures.chat.ts — fixtures pt-BR do CHAT e do MARKDOWN para
 * as histórias (`Componentes/Chat/*`, `Componentes/Markdown/*`).
 *
 * Regras desta pasta (STORY-SPEC §7): os dados partilhados vivem em
 * `src/storybook/fixtures.ts` (propriedade do catálogo — NÃO editar); os
 * dados de UMA área ficam no seu `fixtures.<area>.ts`. Aqui estão as
 * mensagens do tutor/aluno e os conteúdos markdown reais que as histórias
 * renderizam — nada de `lorem ipsum`, nada de hipótese: é a mesma forma
 * (`TutorChatMessage`) e o mesmo vocabulário que a aula usa.
 *
 * Cobertura de conteúdo (STORY-SPEC §4.5): prosa longa, lista, tabela GFM,
 * código com saída de terminal, fórmula KaTeX e bloco de estouro (overflow).
 *
 * PURO: só dados + funções de construção (sem React, sem DOM) — o mesmo molde
 * dos fixtures do e2e.
 */
import type { TutorChatMessage } from '../lib/trackLessonState';

/**
 * Timestamp FIXO para os carimbos de hora das bolhas serem determinísticos
 * (o `formatChatTime` mostra HH:MM — o mesmo valor em todas as histórias).
 */
export const CHAT_TS = new Date(2026, 2, 17, 14, 30).getTime();

/** O mesmo minuto da mensagem anterior — o caso de AGRUPAMENTO do chat. */
export const CHAT_TS_AGRUPADO = CHAT_TS;

/** Um minuto depois — quebra o grupo (o cabeçalho volta a aparecer). */
export const CHAT_TS_SEGUINTE = CHAT_TS + 60_000;

/* ═════════════════════════ CONTEÚDO MARKDOWN (pt-BR) ════════════════════ */

/**
 * Prosa LONGA de teoria — o caso real do chat: a teoria inteira da aula mora
 * dentro da bolha do tutor (78% da coluna, sem teto de medida).
 */
export const CHAT_MD_PROSA = `Uma função é uma máquina de transformar entradas em saídas. Pense no forno da sua cozinha: você coloca massa pronta (a entrada), o forno aplica uma regra (temperatura por tempo) e sai um bolo (a saída). Em programação a ideia é a mesma — só que a regra é escrita, e por isso podemos lê-la, corrigi-la e reaproveitá-la.

Quando escrevemos uma função em Python, damos um nome à regra, listamos o que ela precisa receber e descrevemos o que ela devolve. O nome é o que usamos para *chamar* a máquina; os parâmetros são os fios de entrada; o \`return\` é o fio de saída.

Vale guardar duas ideias que voltam em toda a trilha. A primeira: uma função boa faz **uma** coisa — se o nome pedir "e", provavelmente são duas funções coladas. A segunda: o corpo da função não executa quando a definimos; ele espera. A máquina só roda no momento da chamada, e roda inteira, de cima para baixo.`;

/** Lista (marcadores, numerada e tarefa GFM) — o tutor passa checklists. */
export const CHAT_MD_LISTA = `Antes de codar a função, responda a si mesmo:

1. Qual é a **entrada**? (tipo e significado)
2. Qual é a **saída** prometida?
3. O que acontece nos casos de borda — entrada vazia, zero, número negativo?

Checklist de revisão do exercício:

- [x] O nome da função diz o que ela faz
- [x] Os parâmetros têm tipo declarado
- [ ] O caso de borda tem teste
- [ ] O \`return\` está em todos os caminhos

> Regra prática: se você não consegue escrever a saída esperada para três entradas diferentes, ainda não entendeu o problema — e codar não vai resolvê-lo.`;

/** Tabela GFM — comparações de complexidade/métricas que o tutor usa. */
export const CHAT_MD_TABELA = `Compare as duas soluções do mesmo problema (procurar um item numa lista):

| Solução | Pior caso | Média | Quando usar |
| --- | ---: | ---: | --- |
| Procurar de um em um | n | n/2 | lista pequena ou desordenada |
| Lista ordenada + busca binária | log₂ n | log₂ n | lista grande, ordenada uma vez |
| Mapa (dicionário) | 1 | 1 | consultas muitas, espaço não é problema |

Note que a coluna "Pior caso" é a que importa quando o sistema está sob pressão: a média esconde o susto.`;

/** Código de ENTRADA (```python) + SAÍDA de terminal (```text) — as duas caixas. */
export const CHAT_MD_CODIGO = `A função abaixo conta quantas vezes um valor aparece — e o teste que a acompanha mostra a saída esperada:

\`\`\`python
def conta_ocorrencias(valores: list[int], alvo: int) -> int:
    total = 0
    for valor in valores:
        if valor == alvo:
            total += 1
    return total


print(conta_ocorrencias([3, 7, 3, 9, 3], 3))
print(conta_ocorrencias([], 3))
\`\`\`

Executando no terminal, a saída é:

\`\`\`text
❯ python ocorrencias.py
3
0
✓ 2 testes passaram em 0.041s
\`\`\`

Repare que o caso vazio devolve \`0\` sem erro — é o caso de borda do checklist.`;

/** Fórmula KaTeX (inline e display) — a matemática que aparece na programação. */
export const CHAT_MD_FORMULA = `A busca binária corta o espaço de procura pela metade a cada passo. Se a lista tem $n$ itens, depois de $k$ passos sobram cerca de $n / 2^{k}$ candidatos — e paramos quando isso chega a 1:

$$
k = \\log_{2}(n)
$$

Na prática isso significa que uma lista ordenada de um milhão de itens precisa de no máximo ~20 comparações ($\\log_{2}(10^{6}) \\approx 19{,}9$), enquanto a busca de um em um levaria, em média, 500 mil. A ordem de crescimento — $O(\\log n)$ contra $O(n)$ — é o que separa uma busca que responde na hora de uma que segura a interface.`;

/** Bloco de ESTOURO (overflow) — linha longa sem espaços para quebrar. */
export const CHAT_MD_ESTOURO = `Linha de comando longa (o bloco rola por dentro — a bolha não cresce):

\`\`\`text
❯ python -m pytest tests/test_ocorrencias.py -v --tb=long --maxfail=1 --durations=10 --junitxml=/home/aluno/estudo/trilhas/python-funcoes/reports/2026-03-17-143000/ocorrencias-junit.xml --color=yes
\`\`\`

E um token sem espaços que quebra onde precisa, sem estourar a bolha: \`sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08\`.`;

/**
 * Conteúdo COMPLETO — a mensagem de teoria do tutor que junta tudo (é o
 * default das histórias de MarkdownView/SegmentedMarkdown/ChatBubble).
 */
export const CHAT_MD_RICO = `${CHAT_MD_PROSA}

${CHAT_MD_LISTA}

${CHAT_MD_TABELA}

${CHAT_MD_CODIGO}

${CHAT_MD_FORMULA}`;

/**
 * Texto curto para o efeito de digitação (typewriter) — tempo de revelação
 * curto e previsível nas histórias (o relógio é o do app: 100 tps default).
 */
export const CHAT_TEXTO_TYPEWRITER =
  'Perfeito! Você separou a entrada da saída. Agora falta o caso de borda: o que a sua função devolve quando a lista chega vazia?';

/* ══════════════════════ CONSTRUTORES DE MENSAGEM ═══════════════════════ */

/** Mensagem do TUTOR (seção/teoria) — o balão de leitura à esquerda. */
export function mensagemTutor(
  content: string = CHAT_MD_RICO,
  ts: number = CHAT_TS,
): TutorChatMessage {
  return { role: 'assistant', content, ts, kind: 'message' };
}

/** Mensagem do ALUNO — o balão de acento lavado à direita (NUNCA markdown). */
export function mensagemAluno(content: string, ts: number = CHAT_TS): TutorChatMessage {
  return { role: 'user', content, ts };
}

/** Resposta do tutor a uma dúvida — mesmo tom `reply` (balão de leitura). */
export function mensagemResposta(
  content: string = CHAT_TEXTO_TYPEWRITER,
  ts: number = CHAT_TS,
): TutorChatMessage {
  return { role: 'assistant', content, ts, kind: 'reply' };
}

/**
 * Review de APROVAÇÃO do desafio — tom `approved` (borda + glow de sucesso) e
 * o único balão que o app DIGITA a 10 tps (a bolha de erro é `instant`).
 */
export function mensagemReviewAprovada(
  content: string = CHAT_MD_CODIGO,
  ts: number = CHAT_TS,
): TutorChatMessage {
  return { role: 'assistant', content, ts, kind: 'review' };
}

/**
 * Review de ERRO do desafio — tom `error` (borda tingida, sem typewriter),
 * com `errorFor` do desafio que falhou (o seed `formatErrorBubble` real usa o
 * challengeId para o RETRY do mesmo desafio).
 */
export function mensagemReviewComErro(
  content: string,
  ts: number = CHAT_TS,
  errorFor: string = 'desafio-03-ocorrencias',
): TutorChatMessage {
  return { role: 'assistant', content, ts, kind: 'review', errorFor };
}

/** Conteúdo realista de uma review de ERRO (a saída do runner + o checklist). */
export const CHAT_MD_REVIEW_ERRO = `**2 de 3 testes passaram.** O caso de borda travou:

\`\`\`text
❯ pytest test_ocorrencias.py -q
.F.
FAILED test_ocorrencias.py::test_lista_vazia
TypeError: object of type 'NoneType' has no len()
\`\`\`

- [x] A função conta os casos comuns
- [x] O nome e os tipos estão declarados
- [ ] A lista vazia devolve \`0\` em vez de \`None\``;
