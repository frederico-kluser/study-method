/**
 * electron/main/services/quizRemediation.ts — O CICLO DE REMEDIAÇÃO DO QUIZ.
 *
 * O aluno erra o quiz da aula. A IA explica POR QUE **aquela** alternativa não
 * se sustenta (`explain` → a explicação vira mensagem no histórico da aula) e
 * um quiz NOVO sobre o MESMO conteúdo é gerado na hora (`remedial`). O aluno
 * só chega ao desafio depois de acertar — o gate é do renderer, este módulo é
 * quem produz o conteúdo dos dois passos do meio.
 *
 * O QUE ELE NÃO FAZ: não decide o gate (`src/lib/trackLessonState.ts`, puro,
 * no renderer), não persiste (`db/repo.ts`, tabelas `quiz_attempts`/
 * `quiz_remediations` do schema v5) e não registra canal (`ipc/track-handlers.ts`).
 *
 * DUAS REGRAS QUE NÃO SÃO ESTILO:
 *   1. `chat` é INJETADA, nunca importada — é o que torna o serviço testável
 *      sem rede, como `tutorChat(input, chat)` e `createBraveSearchService({fetchImpl})`.
 *   2. FAIL-CLOSED. Sem cliente de LLM, com resposta vazia, com pedido sem
 *      afirmação utilizável ou com quiz fora do contrato, o retorno é
 *      `{ ok:false, code }` — NUNCA uma explicação inventada nem um quiz
 *      malformado. Mesmo contrato de `TUTOR_ERROR_CODES.UNAVAILABLE`
 *      (`tutorChat.ts`) e mesmo motivo: o renderer nunca pode ficar em spinner
 *      infinito nem receber conteúdo fabricado no lugar de um erro.
 *
 * ─── A AUTORIDADE PEDAGÓGICA (o prompt NÃO é livre) ──────────────────────────
 * `docs/02-pedagogia.md` §8/§9 e as regras EXECUTÁVEIS de
 * `skills/study-method/references/pedagogia.md` governam o texto. O mapa
 * regra → instrução (o que os testes de prompt travam):
 *
 *   ERR-1  classifique ANTES de responder (deslize × equívoco conceitual). A
 *          regra de classificação pertence ao módulo de proficiência
 *          (`docs/04-proficiencia.md` §6: `slip` × `conceptual`) — o prompt a
 *          CONSOME com as definições de lá e proíbe criar outra taxonomia.
 *   ERR-2  deslize → apontamento imediato, curto, SEM reensino e SEM escada.
 *   ERR-3  equívoco conceitual → NÃO corrigir de imediato: perguntar antes o
 *          que o aluno esperava (C-8) e só então apontar a divergência.
 *   ERR-4  recorrente → NOMEAR a recorrência como fato e TROCAR de estratégia.
 *          Esconder o padrão é sycophancy por omissão (§8.3). O número sai do
 *          `#g<N>` da id do quiz errado (ver `recurrenceOf`) — quando ele não
 *          é derivável, o prompt manda nomear a recorrência SEM inventar
 *          número (afirmar "é a terceira vez" sem lastro seria o mesmo defeito
 *          que §9 proíbe em qualquer material gerado).
 *   ERR-5  nomear o erro NA alternativa/afirmação, NUNCA no aluno — com a
 *          lista literal de frases proibidas.
 *   ERR-6  reconhecimento antes da correção só com mérito ESPECÍFICO.
 *   ERR-8  "feche o erro com uma VERIFICAÇÃO" — o quiz remedial É a
 *          verificação; o pedido do dono coincide com a regra já escrita.
 *   §9     lista de afirmações PROIBIDAS em material gerado: "você já domina
 *          X" sem evidência e QUALQUER percentual de domínio.
 *   ux §8.2 elogio ritualizado d = −0,40 (proibido); feedback informacional
 *          específico d = +0,43 em adultos (é o que se pede).
 *   tutor 5 NUNCA mostrar URLs ou fontes — as fontes não aparecem no chat.
 *
 * ANTI-PADRÃO DECLARADO E REMOVIDO DESTE REPO, que estes prompts não
 * reintroduzem: "pense profundamente, passo a passo". Profundidade é PARÂMETRO
 * (`reasoning: { enabled: true, effort: 'max' }`, default do cliente vindo de
 * `shared/llm/constants.ts`), não texto de prompt — `challengeContextValidator.ts`
 * e `docs/16-engine-de-trilha.md` §7.
 *
 * ─── O VOCABULÁRIO DE ERRO (por que um pedido torto vira NOT_FOUND) ─────────
 * `QUIZ_ERROR_CODES` é CONGELADO em `shared/ipc-contract.ts` e não tem um
 * código para "pedido malformado": `INVALID_QUIZ` é, por definição escrita lá,
 * sobre o quiz que a LLM devolveu. Então todo pedido sem afirmação utilizável
 * (sem opções, índice fora de faixa, alternativa escolhida == correta, geração
 * inválida) devolve `NOT_FOUND` — "afirmação inexistente no pedido" — ANTES de
 * qualquer chamada de LLM (nenhum crédito gasto para produzir algo que seria
 * recusado no fim, mesma disciplina de `REGEN_SEMANTIC_NOT_RUN`).
 *
 * ─── A ID DO QUIZ REMEDIAL ──────────────────────────────────────────────────
 * NUNCA reusa `originAssertionId`: as tentativas dos dois vivem na MESMA tabela
 * (`quiz_attempts`) e o histórico deixaria de distinguir "errou a autorada" de
 * "errou a remedial". A convenção é do renderer e é DETERMINÍSTICA e
 * REVERSÍVEL — `<chave>#g<N>`, `remediationAssertionId`/`quizKeyFor` em
 * `src/lib/trackLessonState.ts`. Este módulo a espelha em `remedialQuizIdFor`
 * (main não importa código do renderer); `tests/quizRemediation.test.ts` trava
 * as duas implementações uma contra a outra, nos dois sentidos.
 */
import type {
  QuizErrorCode,
  QuizExplainReply,
  QuizExplainRequest,
  QuizRemedialReply,
  QuizRemedialRequest,
  RemedialQuizDto,
  TrackAssertionDto,
  TrackTheorySectionDto,
} from '@shared/ipc-contract';
import { QUIZ_ERROR_CODES } from '@shared/ipc-contract';

import { extractFirstJsonObject } from './llmJudge';
import type { ChatFn, TutorRole } from './tutorChat';

/** Dependências injetadas. `chat` ausente = sem LLM: o serviço falha FECHADO. */
export interface QuizRemediationDeps {
  chat?: ChatFn;
}

/** A superfície que `ipc/track-handlers.ts` consome. Assinatura CONGELADA. */
export interface QuizRemediation {
  /** Explica POR QUE a alternativa escolhida está errada. Fail-closed. */
  explain(req: QuizExplainRequest): Promise<QuizExplainReply>;
  /** Gera o quiz NOVO sobre o mesmo conteúdo, depois da explicação. Fail-closed. */
  remedial(req: QuizRemedialRequest): Promise<QuizRemedialReply>;
}

/** Todo quiz desta base tem EXATAMENTE 4 alternativas (contrato da trilha). */
export const QUIZ_OPTION_COUNT = 4;

/**
 * Separador da chave composta `sectionId::assertionId` e sufixo `#g<N>` da id
 * remedial — ESPELHO de `QUIZ_KEY_SEPARATOR`/`REMEDIATION_ID_RE` em
 * `src/lib/trackLessonState.ts`. Espelho, e não import, porque o processo main
 * não depende do bundle do renderer; a coerência é travada por teste.
 */
const QUIZ_KEY_SEPARATOR = '::';
const REMEDIATION_ID_RE = /^(.+)#g(\d+)$/;

/** Mensagens de falha — chegam CRUAS à UI, então dizem o que houve e o que fazer. */
const MSG = {
  noChat:
    'A IA não está configurada nesta build, então não há explicação nem quiz novo. Confira a chave da API nas Configurações.',
  unavailable: (detail: string): string =>
    `O serviço de IA não respondeu (${detail}), então não há explicação nem quiz novo agora. Tente de novo em instantes.`,
  emptyExplain: 'A IA respondeu vazio — não há explicação para mostrar. Tente de novo.',
  emptyRemedial: 'A IA respondeu vazio — nenhum quiz novo foi gerado. Tente de novo.',
  invalidQuiz:
    'A IA devolveu um quiz fora do formato (4 alternativas diferentes e uma única correta). Nada foi entregue; tente de novo.',
  badAssertion:
    'O pedido não traz a afirmação do quiz errado (enunciado, pergunta e alternativas) — não há o que explicar.',
  badSelected: 'A alternativa escolhida não existe nesse quiz — não há o que explicar.',
  notAnError:
    'A alternativa escolhida é a correta: não houve erro para explicar nem quiz novo a gerar.',
  badGeneration: 'A geração pedida para o quiz novo é inválida (precisa ser 1, 2, 3…).',
  badOrigin: 'O pedido não diz de qual afirmação o quiz novo se origina.',
  degenerateId:
    'A id do quiz novo colidiria com a da afirmação de origem — o histórico deixaria de distinguir as duas.',
} as const;

// ─── Helpers PUROS (exportados para teste — nenhum toca rede/disco) ──────────

/** `true` para string presente e não-vazia depois do trim. */
function isFilled(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Normaliza texto para comparação (nunca-repetir e unicidade de alternativa). */
export function normalizeForCompare(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.?!;:,]+$/g, '')
    .trim();
}

/**
 * A CHAVE do ciclo de uma afirmação — espelho de `quizKeyFor`
 * (`src/lib/trackLessonState.ts`): `sectionId::assertionId`, ou a id sozinha
 * quando a afirmação não declara seção; uma id que JÁ é remedial (`…#g<N>`)
 * volta para a chave original (o sufixo é reversível). PURA.
 */
export function quizStateKeyFor(assertionId: string, sectionId?: string): string {
  const remediation = REMEDIATION_ID_RE.exec(assertionId);
  if (remediation) return remediation[1];
  return sectionId === undefined ? assertionId : `${sectionId}${QUIZ_KEY_SEPARATOR}${assertionId}`;
}

/**
 * Id DETERMINÍSTICA do quiz remedial — `<chave>#g<N>`, espelho de
 * `remediationAssertionId`. Nunca a que a LLM inventar: a chave da React fica
 * estável e `quizKeyFor` consegue voltar da assertion remedial para a chave do
 * estado, então o ciclo inteiro de uma afirmação vive numa chave só. PURA.
 */
export function remedialQuizIdFor(
  req: Pick<QuizRemedialRequest, 'originAssertionId' | 'generation' | 'assertion'>,
): string {
  const key = quizStateKeyFor(req.originAssertionId, req.assertion?.sectionId);
  return `${key}#g${req.generation}`;
}

/**
 * A RECORRÊNCIA (ERR-4) derivada do que o pedido REALMENTE traz. A id de um
 * quiz remedial é `<chave>#g<N>`, então N+1 é o número desta falha na série
 * (N=1 é o primeiro remedial, logo errá-lo é a 2ª vez). Quando a origem é
 * `remedial` mas a id não segue a convenção, sabe-se que é recorrente e NÃO se
 * sabe o número — `ordinal: null`, e o prompt manda nomear a recorrência sem
 * inventar cifra (§9 proíbe número sem lastro). PURA.
 */
export function recurrenceOf(
  req: Pick<QuizExplainRequest, 'assertion' | 'quizOrigin'>,
): { recurrent: boolean; ordinal: number | null } {
  const id = typeof req.assertion?.id === 'string' ? req.assertion.id : '';
  const m = REMEDIATION_ID_RE.exec(id);
  if (m) {
    const generation = Number(m[2]);
    if (Number.isInteger(generation) && generation >= 1) {
      return { recurrent: true, ordinal: generation + 1 };
    }
  }
  if (req.quizOrigin === 'remedial') return { recurrent: true, ordinal: null };
  return { recurrent: false, ordinal: null };
}

/**
 * Uma afirmação utilizável: enunciado, pergunta, EXATAMENTE `QUIZ_OPTION_COUNT`
 * (4) opções e índice correto válido.
 *
 * O número é travado pelo CONTRATO da trilha, não por gosto deste módulo:
 * `TrackAssertion`/`TrackAssertionDto` documentam "EXATAMENTE 4 opções"
 * (`content/trackTypes.ts`, `shared/ipc-contract.ts`), `validateAssertions`
 * REPROVA qualquer `options.length !== 4` na ingestão
 * (`content/trackTypes.ts`), o schema da engine usa `.length(4)`
 * (`engine/schemas/artifacts.ts`) e este PRÓPRIO arquivo já exige 4 na SAÍDA
 * da LLM (`QUIZ_OPTION_COUNT`, `parseRemedialQuiz`). Uma afirmação com 2 ou 3
 * opções não é "legado tolerado": é dado fora do contrato, e aceitá-la aqui
 * chamaria a LLM sobre algo que nenhuma outra camada deste sistema aceitaria.
 */
function assertionIsUsable(a: TrackAssertionDto | undefined | null): a is TrackAssertionDto {
  if (!a || typeof a !== 'object') return false;
  if (!isFilled(a.statement) || !isFilled(a.question)) return false;
  if (!Array.isArray(a.options) || a.options.length !== QUIZ_OPTION_COUNT) return false;
  if (!a.options.every(isFilled)) return false;
  return Number.isInteger(a.answerIndex) && a.answerIndex >= 0 && a.answerIndex < a.options.length;
}

/** Bloco da seção de teoria (a âncora da afirmação). '' quando não há âncora. */
function renderTheorySection(section: TrackTheorySectionDto | null | undefined): string {
  if (!section || !isFilled(section.markdown)) return '';
  const code = section.code
    ? `\n\`\`\`${section.code.language}\n${section.code.code}\n\`\`\`${section.code.explanation ? `\n${section.code.explanation}` : ''}`
    : '';
  return `SEÇÃO DE TEORIA QUE DEMONSTRA A AFIRMAÇÃO [id=${section.id}] — "${section.title}":\n${section.markdown}${code}`;
}

/** As alternativas, marcando a ESCOLHIDA e a CORRETA (+ racional declarado). */
function renderOptions(a: TrackAssertionDto, selectedIndex: number): string {
  const rationales = Array.isArray(a.optionRationales) ? a.optionRationales : [];
  return a.options
    .map((opt, i) => {
      const marks: string[] = [];
      if (i === selectedIndex) marks.push('← ESCOLHIDA PELO ALUNO');
      if (i === a.answerIndex) marks.push('← CORRETA');
      const rationale = isFilled(rationales[i]) ? `\n     racional autoral: ${rationales[i]}` : '';
      return `  [${i}] ${opt}${marks.length ? ` ${marks.join(' ')}` : ''}${rationale}`;
    })
    .join('\n');
}

/**
 * BLOCO ADITIVO da recorrência (ERR-4). Retorna '' quando este é o PRIMEIRO
 * erro da série — sem recorrência o prompt fica byte-idêntico ao caminho
 * normal (mesma disciplina de `buildErrorContextSection` em `tutorChat.ts`:
 * bloco aditivo, zero regressão no fluxo comum). PURA.
 */
export function buildRecurrenceSection(
  req: Pick<QuizExplainRequest, 'assertion' | 'quizOrigin'>,
): string {
  const { recurrent, ordinal } = recurrenceOf(req);
  if (!recurrent) return '';
  const contagem =
    ordinal === null
      ? 'Este NÃO é o primeiro erro nesta afirmação (o quiz errado já era um quiz de recuperação). O número exato de vezes não está no pedido: diga que o erro se repete, SEM inventar um número.'
      : `Esta é a ${ordinal}ª vez seguida que o aluno erra ESTA afirmação (1 no quiz da trilha e ${ordinal - 1} em quiz de recuperação). Diga esse número na primeira frase, como fato SOBRE O ERRO.`;

  return `RECORRÊNCIA (obrigatório nesta resposta):
1. ${contagem}
2. Esconder a repetição para não desanimar o aluno é bajulação por omissão — ela sonega justamente a informação que ele precisa para calibrar a própria confiança.
3. TROQUE DE ESTRATÉGIA: não repita a explicação anterior com outras palavras. Ataque a mesma ideia por outro ângulo — outro exemplo concreto do material da aula, outra ordem de raciocínio, outra comparação.
4. A recorrência é fato sobre o ERRO, nunca sobre a pessoa: "a condição continua sendo lida do mesmo jeito", nunca "você continua errando".`;
}

/**
 * O prompt de sistema da EXPLICAÇÃO. Função PURA: o teste lê o texto montado e
 * confere o que ele DEVE conter (as regras ERR-*) e o que ele NÃO pode conter
 * (elogio ritualizado, percentual de domínio, URL, imperativo de raciocínio).
 */
export function buildExplainPrompt(req: QuizExplainRequest): string {
  const a = req.assertion;
  const selected = a.options[req.selectedIndex];
  const theory = renderTheorySection(req.theorySection);
  const material = isFilled(req.lessonExcerpt)
    ? `MATERIAL DA AULA (todo o conteúdo que o aluno viu):\n${req.lessonExcerpt}`
    : 'MATERIAL DA AULA: (não veio no pedido — use apenas a seção de teoria acima)';

  const contexto = `Você é o tutor da trilha "${req.trackSlug}", aula "${req.lessonId}", seção "${req.sectionKey}". O aluno acabou de ERRAR o quiz desta afirmação e a sua tarefa é UMA: explicar por que a alternativa que ELE escolheu não se sustenta.

AFIRMAÇÃO DA AULA: ${a.statement}
PERGUNTA DO QUIZ: ${a.question}
ALTERNATIVAS:
${renderOptions(a, req.selectedIndex)}
ALTERNATIVA ESCOLHIDA PELO ALUNO (a errada): [${req.selectedIndex}] ${selected}
ALTERNATIVA CORRETA: [${a.answerIndex}] ${a.options[a.answerIndex]}
FEEDBACK AUTORAL DA AFIRMAÇÃO: ${isFilled(a.feedback) ? a.feedback : '(nenhum)'}

${theory || 'SEÇÃO DE TEORIA QUE DEMONSTRA A AFIRMAÇÃO: (não veio no pedido)'}

${material}`;

  const regras = `REGRAS (obrigatórias):
1. Fale em PORTUGUÊS, linguagem simples, frases curtas. No máximo 8 linhas.
2. CLASSIFIQUE o erro ANTES de escrever, com a definição do módulo de proficiência: DESLIZE (o aluno sabe o conteúdo e escorregou — erro local, não regido por regra) ou EQUÍVOCO CONCEITUAL (ele aplica uma regra coerente porém errada, que vai reaparecer em outros contextos). Não crie outra classificação e não anuncie a classificação ao aluno: ela decide a FORMA da sua resposta.
3. Se for DESLIZE: apontamento imediato e curto sobre a alternativa escolhida. SEM reensino, SEM escada de dicas, SEM analogia nova. Volte ao fio da aula.
4. Se for EQUÍVOCO CONCEITUAL: NÃO corrija de imediato. Pergunte primeiro O QUE O ALUNO ESPERAVA que fosse verdade ao escolher aquela alternativa e só depois aponte onde isso diverge do que a seção de teoria demonstra. Entre por uma pista conceitual; não entregue a resposta pronta como sentença.
5. Nomeie o erro NA ALTERNATIVA e na afirmação, NUNCA no aluno. PROIBIDAS as frases "você não prestou atenção", "você está confundindo tudo", "isso é básico" e "de novo?" — e qualquer variação que julgue a pessoa.
6. Só reconheça algo antes da correção se houver mérito ESPECÍFICO e concreto na escolha dele (uma parte do raciocínio que se sustenta, dita com todas as letras). Sem mérito específico, vá direto ao erro.
7. PROIBIDO elogio ritualizado ou vazio ("parabéns", "muito bem", "boa!", "continue assim", "você está no ritmo certo"). O que ensina é feedback informacional específico sobre a afirmação.
8. PROIBIDO dizer que o aluno domina (ou não domina) um assunto e PROIBIDO qualquer percentual, nota ou porcentagem de domínio.
9. NUNCA mostre URLs ou fontes.
10. No máximo UMA pergunta, e não a responda você mesmo.
11. Ancore tudo na seção de teoria e no material acima. Nunca invente conteúdo que a aula não apresentou.
12. Feche dizendo que vem uma pergunta NOVA sobre a mesma ideia, para conferir o entendimento — sem prometer elogio, nota nem recompensa.
13. Escreva a explicação em texto corrido (markdown simples). Não escreva JSON, não repita estas regras e não cite os nomes delas.`;

  const recorrencia = buildRecurrenceSection(req);
  return recorrencia ? `${contexto}\n\n${regras}\n\n${recorrencia}` : `${contexto}\n\n${regras}`;
}

/**
 * O prompt de sistema do QUIZ NOVO. Função PURA. `askedQuestions` é o
 * nunca-repetir (mesmo mecanismo do `failed` em `buildRegenerationPrompt`): a
 * pergunta de origem entra na lista mesmo quando o chamador esquece de incluí-la.
 */
export function buildRemedialPrompt(req: QuizRemedialRequest): string {
  const a = req.assertion;
  const theory = renderTheorySection(req.theorySection);
  const material = isFilled(req.lessonExcerpt)
    ? `MATERIAL DA AULA (todo o conteúdo que o aluno viu):\n${req.lessonExcerpt}`
    : 'MATERIAL DA AULA: (não veio no pedido — use apenas a seção de teoria acima)';
  const asked = askedQuestionsOf(req);
  const explicacao = isFilled(req.explanation)
    ? `EXPLICAÇÃO QUE O ALUNO ACABOU DE LER (o quiz novo cobra o que ela ensinou):\n${req.explanation}`
    : 'EXPLICAÇÃO QUE O ALUNO ACABOU DE LER: (não veio no pedido)';

  return `Você é o autor do quiz da trilha "${req.trackSlug}", aula "${req.lessonId}", seção "${req.sectionKey}". O aluno errou o quiz da afirmação abaixo e já leu a explicação do erro. Gere UM quiz NOVO sobre o MESMO conteúdo, para ele PROVAR que entendeu.

AFIRMAÇÃO DE ORIGEM (o conteúdo que o quiz novo cobra):
${a.statement}
PERGUNTA JÁ USADA: ${a.question}
ALTERNATIVAS JÁ USADAS:
${renderOptions(a, -1)}

${explicacao}

${theory || 'SEÇÃO DE TEORIA QUE DEMONSTRA A AFIRMAÇÃO: (não veio no pedido)'}

${material}

PERGUNTAS QUE O ALUNO JÁ VIU NESTA SEÇÃO — NÃO REPITA NENHUMA (nem a mesma pergunta escrita com outras palavras):
${asked.map((q) => `- ${q}`).join('\n')}

FORMATO (responda SOMENTE um objeto JSON válido, sem markdown):
{
  "statement": "a afirmação que este quiz verifica, em pt-BR",
  "question": "a pergunta NOVA, em pt-BR",
  "options": ["alternativa 1", "alternativa 2", "alternativa 3", "alternativa 4"],
  "answerIndex": 0,
  "feedback": "por que a alternativa correta é a correta, em 1 ou 2 frases",
  "optionRationales": ["racional da alternativa 1", "racional da 2", "racional da 3", "racional da 4"]
}

REGRAS (obrigatórias):
1. O quiz cobra a MESMA ideia da afirmação de origem e da seção de teoria — conteúdo igual, pergunta diferente. Nunca cobre algo que a aula não ensinou.
2. EXATAMENTE ${QUIZ_OPTION_COUNT} alternativas, todas diferentes entre si e todas plausíveis. Proibidas alternativas de enchimento, "todas as anteriores", "nenhuma das anteriores" e alternativas absurdas.
3. "answerIndex" é o índice inteiro (0 a ${QUIZ_OPTION_COUNT - 1}) da ÚNICA alternativa correta.
4. "optionRationales" tem EXATAMENTE ${QUIZ_OPTION_COUNT} itens, um por alternativa, NA MESMA ORDEM: em cada alternativa errada, por que ela NÃO se sustenta; na correta, por que ela se sustenta. Nenhum item vazio.
5. Português, linguagem simples, frases curtas.
6. O texto fala da afirmação e do código, NUNCA do aluno: nada de elogio, nada de julgamento da pessoa, nada de "você já domina", nada de percentual ou nota de domínio.
7. NUNCA inclua URLs ou fontes.
8. Responda SOMENTE o objeto JSON acima, sem markdown e sem texto ao redor.`;
}

/** A lista do nunca-repetir: o que veio no pedido MAIS a pergunta de origem. */
export function askedQuestionsOf(req: QuizRemedialRequest): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (q: unknown): void => {
    if (!isFilled(q)) return;
    const key = normalizeForCompare(q);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(q.trim());
  };
  push(req.assertion?.question);
  for (const q of req.askedQuestions ?? []) push(q);
  return out;
}

/**
 * VALIDA o que a LLM devolveu ANTES de acreditar (mesma disciplina de
 * `parseDraft` no challengeRegenerator: "LLM devolve JSON, valide antes de
 * acreditar"). REPROVA — devolvendo `null`, que o chamador traduz em
 * `INVALID_QUIZ` — quando:
 *
 *   - não é objeto, ou `statement`/`question`/`feedback` não são texto;
 *   - `options` não tem EXATAMENTE 4 itens, ou algum é vazio, ou dois são
 *     iguais (comparação normalizada: acento/caixa/espaço não fazem alternativa
 *     nova — duas iguais tornariam o quiz insolúvel);
 *   - `answerIndex` não é inteiro em 0..3;
 *   - `optionRationales` existe, não é `[]` e não tem EXATAMENTE 4 itens
 *     não-vazios (1..3 é meia-declaração — a mesma régua do
 *     `AssertionDraftSchema`, travada em `tests/quizContract.test.ts`);
 *   - a pergunta REPETE uma das que o aluno já viu nesta seção (o
 *     nunca-repetir não é sugestão: um quiz repetido não verifica nada).
 *
 * A `id`, o `sectionId`, o `originAssertionId` e a `generation` NÃO vêm da
 * LLM: são derivados do pedido (a âncora e a identidade do ciclo são do
 * produto, não do modelo). PURA.
 */
export function parseRemedialQuiz(raw: unknown, req: QuizRemedialRequest): RemedialQuizDto | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  if (!isFilled(r.statement) || !isFilled(r.question) || !isFilled(r.feedback)) return null;

  if (!Array.isArray(r.options) || r.options.length !== QUIZ_OPTION_COUNT) return null;
  if (!r.options.every(isFilled)) return null;
  const options = (r.options as string[]).map((o) => o.trim());
  const uniques = new Set(options.map(normalizeForCompare));
  if (uniques.size !== QUIZ_OPTION_COUNT) return null;

  const answerIndex = r.answerIndex;
  if (!Number.isInteger(answerIndex)) return null;
  const idx = answerIndex as number;
  if (idx < 0 || idx >= QUIZ_OPTION_COUNT) return null;

  let optionRationales: string[] | undefined;
  if (r.optionRationales !== undefined && r.optionRationales !== null) {
    if (!Array.isArray(r.optionRationales)) return null;
    if (r.optionRationales.length > 0) {
      if (r.optionRationales.length !== QUIZ_OPTION_COUNT) return null;
      if (!r.optionRationales.every(isFilled)) return null;
      optionRationales = (r.optionRationales as string[]).map((s) => s.trim());
    }
  }

  const question = r.question.trim();
  const asked = new Set(askedQuestionsOf(req).map(normalizeForCompare));
  if (asked.has(normalizeForCompare(question))) return null;

  const sectionId = req.assertion?.sectionId;
  return {
    id: remedialQuizIdFor(req),
    statement: r.statement.trim(),
    question,
    options,
    answerIndex: idx,
    feedback: r.feedback.trim(),
    ...(sectionId === undefined ? {} : { sectionId }),
    ...(optionRationales ? { optionRationales } : {}),
    originAssertionId: req.originAssertionId,
    generation: req.generation,
  };
}

// ─── O serviço ───────────────────────────────────────────────────────────────

/** Falha estruturada — a única forma de resposta negativa dos dois métodos. */
function fail(code: QuizErrorCode, message: string): { ok: false; code: QuizErrorCode; message: string } {
  return { ok: false, code, message };
}

/**
 * Fabrica o serviço. `explain` e `remedial` são TOTAIS (nunca lançam): devolvem
 * a união `{ ok:true, … } | { ok:false, code, message }` do contrato congelado.
 *
 * Temperatura e timeout: a EXPLICAÇÃO usa `temperature: 0.3` / 45s (o mesmo do
 * tutor — explicar é ancorar no material, não inventar); o QUIZ NOVO usa
 * `temperature: 0.7` / 60s (o mesmo da regeneração de desafio — precisa de
 * variedade real para não repetir a pergunta que o aluno já viu). Os dois têm
 * teto: o renderer nunca fica em spinner infinito.
 */
export function createQuizRemediation(deps: QuizRemediationDeps = {}): QuizRemediation {
  const { chat } = deps;

  /** Uma chamada de LLM, com os erros de transporte já traduzidos. */
  async function ask(
    prompt: string,
    user: string,
    temperature: number,
    timeoutMs: number,
  ): Promise<{ ok: true; text: string } | { ok: false; code: QuizErrorCode; message: string }> {
    if (!chat) {
      return { ok: false, code: QUIZ_ERROR_CODES.UNAVAILABLE, message: MSG.noChat };
    }
    const messages: Array<{ role: TutorRole; content: string }> = [
      { role: 'system', content: prompt },
      { role: 'user', content: user },
    ];
    try {
      const res = await chat({ messages, temperature, timeoutMs });
      const text = typeof res?.content === 'string' ? res.content.trim() : '';
      if (!text) return { ok: false, code: QUIZ_ERROR_CODES.EMPTY_REPLY, message: '' };
      return { ok: true, text };
    } catch (err) {
      // Falha RÁPIDA: cliente ausente, rede, timeout — erro tipado imediato.
      return {
        ok: false,
        code: QUIZ_ERROR_CODES.UNAVAILABLE,
        message: MSG.unavailable(String(err).slice(0, 160)),
      };
    }
  }

  async function explain(req: QuizExplainRequest): Promise<QuizExplainReply> {
    // Pedido malformado → NOT_FOUND ANTES de qualquer chamada de LLM.
    if (!assertionIsUsable(req?.assertion)) {
      return fail(QUIZ_ERROR_CODES.NOT_FOUND, MSG.badAssertion);
    }
    const a = req.assertion;
    if (
      !Number.isInteger(req.selectedIndex) ||
      req.selectedIndex < 0 ||
      req.selectedIndex >= a.options.length
    ) {
      return fail(QUIZ_ERROR_CODES.NOT_FOUND, MSG.badSelected);
    }
    // Explicar por que a alternativa CORRETA está errada seria fabricar um
    // erro que não houve — fail-closed também aqui.
    if (req.selectedIndex === a.answerIndex) {
      return fail(QUIZ_ERROR_CODES.NOT_FOUND, MSG.notAnError);
    }

    const out = await ask(
      buildExplainPrompt(req),
      'Escreva agora a explicação do erro para o aluno, seguindo as REGRAS.',
      0.3,
      45_000,
    );
    if (!out.ok) {
      return fail(out.code, out.code === QUIZ_ERROR_CODES.EMPTY_REPLY ? MSG.emptyExplain : out.message);
    }
    return { ok: true, explanation: out.text };
  }

  async function remedial(req: QuizRemedialRequest): Promise<QuizRemedialReply> {
    if (!assertionIsUsable(req?.assertion)) {
      return fail(QUIZ_ERROR_CODES.NOT_FOUND, MSG.badAssertion);
    }
    if (!isFilled(req.originAssertionId)) {
      return fail(QUIZ_ERROR_CODES.NOT_FOUND, MSG.badOrigin);
    }
    if (!Number.isInteger(req.generation) || req.generation < 1) {
      return fail(QUIZ_ERROR_CODES.NOT_FOUND, MSG.badGeneration);
    }
    // A id do remedial NUNCA pode ser a da origem (as tentativas dos dois vivem
    // na MESMA tabela). A derivação já garante isso em todo pedido bem-formado;
    // o pedido degenerado que a quebraria (origem que já é `…#g<N>` e pede a
    // MESMA geração) para aqui, sem gastar LLM.
    if (remedialQuizIdFor(req) === req.originAssertionId) {
      return fail(QUIZ_ERROR_CODES.NOT_FOUND, MSG.degenerateId);
    }

    const out = await ask(
      buildRemedialPrompt(req),
      'Gere agora o quiz novo. Responda SOMENTE o objeto JSON do FORMATO.',
      0.7,
      60_000,
    );
    if (!out.ok) {
      return fail(out.code, out.code === QUIZ_ERROR_CODES.EMPTY_REPLY ? MSG.emptyRemedial : out.message);
    }

    // "LLM devolve JSON, valide antes de acreditar": shape ruim → INVALID_QUIZ,
    // nunca um quiz malformado na tela do aluno. Sem retry: o contrato é falha
    // RÁPIDA, e o renderer oferece "tentar de novo".
    const quiz = parseRemedialQuiz(extractFirstJsonObject(out.text), req);
    if (!quiz) return fail(QUIZ_ERROR_CODES.INVALID_QUIZ, MSG.invalidQuiz);
    return { ok: true, quiz };
  }

  return { explain, remedial };
}
