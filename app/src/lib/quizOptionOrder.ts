/**
 * src/lib/quizOptionOrder.ts — a ORDEM DE EXIBIÇÃO das alternativas do quiz.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ESTE MÓDULO MATA (medido, não suposto)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     $ grep -rho '"answerIndex": *[0-9]*' resources/tracks --include='*.json' \
 *         | sort | uniq -c
 *          44 "answerIndex": 0
 *     $ grep -rniE 'shuffle|embaralh|sortear|randomi[sz]' src electron shared tools
 *       (nenhuma saída)
 *
 * Nas 44 afirmações do curso real de Python o `answerIndex` é 0 em 100% dos
 * casos, e nada no pipeline reordenava as opções: o card mapeava
 * `assertion.options` na ordem do JSON. Logo, a alternativa CORRETA era SEMPRE
 * A PRIMEIRA PILULA DA TELA.
 *
 * A ONDA10 fechou o vazamento por PIXEL (`optionVisualState` retorna o neutro
 * sem ler `answerIndex` antes da resposta) e as quatro pílulas nascem
 * indistinguíveis por classe, cor, borda, peso e ícone — mas perfeitamente
 * distinguíveis por POSIÇÃO. Um aluno que clique sempre na primeira domina o
 * curso inteiro sem ler nada, e o gate de maestria (que só abre com ACERTO —
 * "só vamos para o desafio depois que o aluno provar que entendeu") vira
 * decoração. O canal de acessibilidade vazava igual: o `aria-label` anuncia
 * "Opção N de 4", e "Opção 1" era sempre a certa.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE UMA PERMUTAÇÃO DETERMINÍSTICA, e não `Math.random`
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. A ORDEM NÃO PODE MUDAR EMBAIXO DO DEDO DO ALUNO. O card re-renderiza a
 *      cada tick do typewriter, a cada resposta do tutor e a cada troca de
 *      fase do overlay. Com `Math.random` a pílula que estava sob o cursor
 *      trocaria de texto entre o `mousedown` e o `mouseup` — um clique errado
 *      que o aluno não cometeu, num quiz onde errar custa um ciclo inteiro de
 *      remediação.
 *   2. ESTA BASE É DETERMINÍSTICA POR CONTRATO. Todo o `trackLessonState` é
 *      puro e injetável (`now?: number`), o `lessonChatCache` restaura estado
 *      e há SSR real nos testes (`react-dom/server`). Uma fonte de entropia
 *      não reproduzível tornaria a tela impossível de asserir.
 *   3. A ORDEM PRECISA SOBREVIVER AO FECHAMENTO DO APP. `hydrateQuizFromHistory`
 *      reconstrói o ciclo do banco, e o banco guarda `selectedIndex` no índice
 *      ORIGINAL. Uma ordem derivada da (chave, geração) volta idêntica na
 *      retomada, sem precisar de coluna nova nenhuma.
 *
 * DIFERENTE POR PERGUNTA: a semente sai de `<chave canônica>#g<geração>` — a
 * mesma cadeia que `remediationAssertionId` usa para identificar a geração —,
 * nunca de um número fixo. Duas afirmações da mesma seção recebem ordens
 * diferentes, e cada geração do ciclo de remediação recebe a sua.
 *
 * NÃO DEGENERADA: `tests/quizOptionOrder.test.ts` percorre as 44 chaves REAIS
 * do curso e mede a DISTRIBUIÇÃO da posição da resposta certa (não "a ordem
 * mudou" — isso não mede nada), e repete a medição com 20 000 chaves
 * sintéticas para travar a uniformidade dentro de ±1,5 ponto percentual dos
 * 25% do acaso.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O CONTRATO DE ÍNDICES (a fronteira que não pode escorregar)
 * ══════════════════════════════════════════════════════════════════════════
 * DUAS numerações convivem, e confundi-las reintroduz o bug:
 *
 *   - ORIGINAL — o índice no `assertion.options` do JSON. É o que
 *     `answerIndex`, `optionRationales`, `submitQuizAnswer` e a coluna
 *     `selectedIndex` do banco significam. NADA disso muda;
 *   - EXIBIÇÃO — a posição da pílula na tela (e o número que o leitor de tela
 *     anuncia).
 *
 * `quizOptionOrder` devolve o vetor EXIBIÇÃO → ORIGINAL: `order[d]` é o índice
 * original da pílula desenhada na posição `d`. `invertOptionOrder` devolve o
 * caminho de volta. As duas são bijeções sobre `0..n-1` e a composição é a
 * identidade nos dois sentidos (travado em teste).
 *
 * PURO, sem React/DOM/i18n — como todo o `src/lib` do quiz.
 */

/** Offset e primo do FNV-1a de 32 bits (a constante padrão do algoritmo). */
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

/**
 * FNV-1a de 32 bits sobre a semente textual.
 *
 * ESCOLHA DECLARADA: hash NÃO-CRIPTOGRÁFICO de propósito. O que se pede aqui é
 * AVALANCHE (chaves vizinhas — `s1::a1` e `s1::a2`, ou `#g0` e `#g1` — precisam
 * cair em pontos descorrelacionados do espaço) e reprodutibilidade byte a byte
 * em qualquer runtime, não resistência a adversário: a permutação é PÚBLICA por
 * construção (o aluno a vê na tela) e esconder o `answerIndex` de quem lê o
 * JSON da trilha nunca foi o objetivo — o objetivo é que a POSIÇÃO deixe de ser
 * um atalho. `Math.imul` mantém a multiplicação em 32 bits sem passar por
 * doubles, que é o que torna o resultado idêntico em toda plataforma.
 */
function fnv1a32(text: string): number {
  let hash = FNV_OFFSET_BASIS >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/**
 * PRNG mulberry32 — gerador de 32 bits com estado de 32 bits, período 2^32 e
 * boa distribuição nos primeiros valores (é o que importa: consumimos TRÊS
 * saídas por quiz, no Fisher-Yates de 4 elementos).
 *
 * POR QUE NÃO USAR O HASH DIRETO (ex.: `hash % 24` escolhendo uma das 24
 * permutações): a distribuição de `%` sobre um hash concentra-se conforme o
 * módulo não divide 2^32, e a única faixa que interessa — a posição da
 * alternativa CERTA — herdaria esse viés. O passo de PRNG separa "semear" de
 * "sortear" e deixa a uniformidade medível de verdade (é o que o teste mede).
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A SEMENTE da permutação: `<chave canônica>#g<geração>`.
 *
 * A cadeia é a MESMA convenção de `remediationAssertionId`
 * (`src/lib/trackLessonState.ts`) e não por acaso: para a geração N > 0 ela
 * coincide com a id da assertion remediadora, então "a ordem daquele card" e "a
 * identidade daquele card" nascem da mesma string. Geração inválida (NaN, não
 * inteira, negativa) é normalizada para 0 — a função é TOTAL: nenhuma entrada
 * a faz lançar, porque uma exceção aqui apagaria as alternativas da tela. PURA.
 */
export function quizOptionSeed(key: string, generation: number): number {
  const g = Number.isSafeInteger(generation) && generation > 0 ? generation : 0;
  return fnv1a32(`${key}#g${g}`);
}

/**
 * A PERMUTAÇÃO DE EXIBIÇÃO: `order[posiçãoNaTela] = índiceOriginal`.
 *
 * Fisher-Yates descendente com o PRNG semeado — o embaralhamento sem viés
 * clássico: na iteração `i` o elemento final é sorteado uniformemente entre os
 * `i + 1` ainda não fixados, e por isso as `n!` permutações são equiprováveis
 * (a variante ingênua "troque cada posição com uma qualquer" produz `n^n`
 * caminhos sobre `n!` resultados e é MENSURAVELMENTE enviesada — foi por isso
 * que o teste desta onda mede distribuição em vez de "a ordem mudou").
 *
 * TOTAL por contrato: `optionCount` <= 1 (ou lixo) devolve a identidade, que é
 * exatamente o comportamento de hoje — uma trilha com uma alternativa só não
 * quebra a tela. PURA e sem alocação escondida: devolve um array novo a cada
 * chamada (o chamador memoiza por (chave, geração)).
 */
export function quizOptionOrder(
  key: string,
  generation: number,
  optionCount: number,
): number[] {
  const n = Number.isSafeInteger(optionCount) && optionCount > 0 ? optionCount : 0;
  const order = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return order;
  const random = mulberry32(quizOptionSeed(key, generation));
  for (let i = n - 1; i > 0; i--) {
    // `random()` vive em [0, 1) — (2^32 - 1)/2^32 é o máximo —, então `j` cai
    // em 0..i sem o `Math.min` defensivo que mascararia um erro de faixa.
    const j = Math.floor(random() * (i + 1));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;
  }
  return order;
}

/**
 * O CAMINHO DE VOLTA: `inverse[índiceOriginal] = posiçãoNaTela`.
 *
 * Existe porque duas perguntas legítimas são feitas na direção contrária —
 * "em que pílula está a alternativa que o aluno marcou?" (o feedback do card
 * respondido) e "em que pílula está a correta?" (o que o teste de distribuição
 * mede). Sem ela, cada chamador faria um `indexOf` e a bijeção viraria uma
 * busca linear reimplementada em três lugares.
 *
 * DEFENSIVA: uma entrada que não seja permutação de `0..n-1` (nunca produzida
 * por `quizOptionOrder`, mas possível vinda de um chamador futuro) devolve as
 * posições que conseguir mapear e `-1` nas demais, em vez de lançar. PURA.
 */
export function invertOptionOrder(order: readonly number[]): number[] {
  const inverse = new Array<number>(order.length).fill(-1);
  for (let display = 0; display < order.length; display++) {
    const original = order[display];
    if (Number.isSafeInteger(original) && original >= 0 && original < order.length) {
      inverse[original] = display;
    }
  }
  return inverse;
}

/**
 * A posição na TELA da alternativa de índice ORIGINAL `original` — o açúcar de
 * `invertOptionOrder` para quem precisa de UM índice só (o `aria-label` de um
 * card já respondido, por exemplo). `-1` quando o índice não está na
 * permutação. PURA.
 */
export function displayPositionOf(order: readonly number[], original: number): number {
  return order.indexOf(original);
}
