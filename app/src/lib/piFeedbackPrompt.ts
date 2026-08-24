/**
 * src/lib/piFeedbackPrompt.ts — monta o prompt pt-BR do pi coding agent.
 *
 * O pi roda a resposta do aluno contra um desafio e devolve feedback tutorial.
 * Este módulo é 100% puro (sem React, sem DOM, sem API) — recebe dados e
 * devolve o texto do prompt. O resumo das regras anti-bajulação é FIXO e
 * derivado das regras AS do tutor (SKILL.md do study-method); a UI só injeta
 * enunciado + código + saída dos testes, sem distorcer o veredito (C-12).
 *
 * Regras embutidas (resumo das AS/ERR/ESC relevantes):
 *   AS-1/AS-2/AS-5/AS-6/AS-8/AS-13 · ERR-1..8 · ESC (escada).
 */

export interface PiFeedbackInput {
  /** Matéria/assunto (opcional) do setup. */
  subject?: string;
  /** Enunciado do desafio (README). */
  statement: string;
  /** Código atual do aluno (stub ou solução editada). */
  studentCode: string;
  /** Saída determinística dos testes (TestAnswerResult.output). */
  testOutput: string;
  /** Linguagem do desafio (ex.: "python"). */
  language: string;
  /** Digest das regras do tutor; se omitido, usa digestStudyMethodRules(). */
  rulesDigest?: string;
}

/** Linha de separação padrão usada no prompt. */
const SEP = '──────────────────────────────────────────────';

/**
 * Resumo FIXO (~20 linhas) das regras do tutor para feedback. Usado como
 * system-prompt/pt do pi. Não menciona notas/percentuais — AS-13.
 */
export function digestStudyMethodRules(): string {
  return [
    'Você é o tutor Study Method. Feedback em pt-BR, segunda pessoa, voz ativa.',
    '',
    'ANTI-BAJULAÇÃO:',
    "  - Nunca elogie uma resposta que contém erro (AS-1). A 1ª frase nunca traz adjetivo positivo sobre ela.",
    "  - Elogio exige objeto específico e verificável — o que ele fez e por que importa (AS-2).",
    "  - Não ceda a discordância sem evidência nova; nunca 'você tem razão' sem verificar (AS-5).",
    '  - Insistência (2×+) escala para VERIFICAÇÃO (rode o código), não para recuo (AS-6).',
    "  - A partir da 2ª ocorrência do mesmo equívoco, diga o número de vezes (AS-8).",
    "  - Proibido reportar nota, percentual, score ou confiança numérica (AS-13).",
    '',
    'AO APONTAR ERRO:',
    '  - Classifique deslize (erro de digitação/atenção) × conceitual (não entendeu o conceito) ANTES de responder (ERR-1).',
    '  - Deslize: apontamento imediato, curto, sem reensino (ERR-2).',
    '  - Conceitual: NÃO corrija de imediato; pergunte o que ele esperava antes (ERR-3 + C-8).',
    '  - Nomeie o erro NO CÓDIGO, nunca na pessoa; proibido "você não prestou atenção", "isso é básico" (ERR-5).',
    '  - Erro de ambiente (import/versão/path) é seu: resolva e siga (ERR-7).',
    '  - Feche com verificação: peça que ele rode e PREVEJA a saída antes de ver (ERR-8).',
    '',
    'DESLIZE × CONCEITUAL & ESCADA:',
    '  - Deslize: apontamento imediato, curto, sem reensino e sem escada; volte ao fio (ERR-2).',
    '  - Conceitual: entre pela escada — não dê a resposta pronta; sugira o PRÓXIMO degrau (ESC-S: um de cada vez).',
    '  - Toda explicação é o próximo passo, nunca o topo (ESC-S, ESC-D).',
    '  - Um erro é "o programa ainda não entendeu o que você quis dizer", nunca "você errou" (C-12).',
  ].join('\n');
}

/** Escapa blocos que poderiam confundir o parser do pi (triplo backtick dentro do código). */
function fence(s: string): string {
  return s.replace(/```/g, '‵‵‵');
}

/**
 * Monta o prompt completo (sistema + instrução + dados) enviado ao pi.
 *
 * Retorna o texto final que deve/pode ser passado como `prompt` de
 * `pi.execute`. O sistema (regras) vai como `skillSystemPrompt` OU inline —
 * aqui devolvemos tudo junto para simplicidade; a UI decide como usar.
 */
export function buildPiFeedbackPrompt(input: PiFeedbackInput): string {
  const digest = input.rulesDigest ?? digestStudyMethodRules();
  const system = [
    'SISTEMA — tutor Study Method. Você é o tutor. Segue as regras abaixo.',
    '',
    digest,
  ].join('\n');

  const subjectLine = input.subject?.trim()
    ? `Matéria: ${input.subject.trim()}\n`
    : '';

  const body = [
    'INSTRUÇÃO',
    'Avalie a resposta do aluno AO DESAFIO abaixo. Rode ou verifique mentalmente a',
    'saída dos testes e aponte com evidência o que está errado (ou o que falta para',
    'passar). Sugira o PRÓXIMO passo da escada, sem dar a solução pronta. Termine',
    'com UMA pergunta que guarde o próximo passo. Não dê nota nem percentual.',
    '',
    subjectLine,
    SEP,
    'ENUNCIADO DO DESAFIO',
    fence(input.statement.trim()),
    '',
    SEP,
    `LINGUAGEM: ${fence(input.language.trim() || 'indefinida')}`,
    '',
    SEP,
    'CÓDIGO DA RESPOSTA DO ALUNO',
    '```',
    fence(input.studentCode.trim()),
    '```',
    '',
    SEP,
    'SAÍDA DOS TESTES (determinística)',
    '```',
    fence(input.testOutput.trim() || '(sem saída — os testes não rodaram ou não imprimiram nada)'),
    '```',
  ].join('\n');

  return `${system}\n\n${body}`;
}