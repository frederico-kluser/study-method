/**
 * electron/main/services/challengeContextValidator.ts — VALIDADOR PEDAGÓGICO
 * de desafios contra o contexto ensinado (onda 1 context-validator).
 *
 * Problema real que este serviço resolve: o desafio "somar" (módulo
 * fundamentos-javascript, aula variaveis-e-tipos) tem um teste que recusa
 * texto em vez de número (`assert.throws(() => somar('2', 3))`) — cobra
 * validação de tipos. Se nenhuma aula anterior ensinou typeof/validação de
 * entrada, o desafio está PEDAGOGICAMENTE QUEBRADO: o aluno é cobrado por
 * conhecimento que nunca viu. Premissa do produto: desafio só pode cobrar
 * conhecimento JÁ ENSINADO (critérios de entrada da trilha + aulas anteriores
 * + a aula atual).
 *
 * O serviço tem duas metades:
 *   1. buildChallengeContext — monta, de forma PURA e testável, o contexto
 *      sequencial de um desafio: critérios de entrada da trilha + TODAS as
 *      aulas anteriores (módulos ordenados por `order`, aulas na ordem do
 *      array `lessons`) + a aula atual (teoria COMPLETA — o aluno acabou de
 *      estudar). NÃO existe campo de critério por aula: o critério de entrada
 *      de cada aula é o conceito da aula anterior, DERIVADO da sequência.
 *   2. verifyChallengeAgainstContext — envia contexto + desafio à LLM e
 *      devolve um veredito POR TESTE (um item por `test('...')` do testsCode),
 *      com retry 1x em JSON inválido e erro estruturado — NUNCA um veredito
 *      falso.
 *
 * RACIOCÍNIO É PARÂMETRO, NÃO TEXTO (fecha a anotação #8 do EXPLAINER).
 * Este arquivo carregava no prompt o imperativo "pense profundamente, passo a
 * passo" e comentários afirmando que "NÃO há parâmetro de API para effort —
 * a exigência de raciocínio profundo vive no texto do prompt". Isso DEIXOU DE
 * SER VERDADE: o provedor é o OpenRouter, e o pedido de raciocínio viaja no
 * PARÂMETRO `reasoning: { enabled: true, effort: 'max' }` do protocolo,
 * aplicado por PADRÃO em toda chamada de chat pelo cliente a partir do
 * contrato congelado `shared/llm/constants.ts` (`OPENROUTER_REASONING` /
 * `OPENROUTER_MAX_EFFORT`, onde 'max' é o TOPO dos efforts que o modelo
 * aceita). O imperativo textual foi REMOVIDO por ser anti-padrão declarado em
 * `docs/16-engine-de-trilha.md` §7: "nada de 'pense profundamente, passo a
 * passo' em modelo com raciocínio nativo — o controle de profundidade é
 * parâmetro, não texto". O que o prompt ainda exige é o FORMATO da saída:
 * raciocínio ANTES da decisão DENTRO do JSON (INV-04, §6.3).
 *
 * PURE/DI: `llm` injetável (testes sem rede), mesmo padrão do
 * challengeRegenerator. O resultado alimenta o CLI de autoria (onda 2) e o
 * regenerador de desafios — a aula só é liberada quando o desafio passa.
 */

import { LoadedTrack, findLesson } from '../content/trackLoader';

/** Uma aula ANTERIOR à atual (teoria truncada — só o essencial para julgar). */
export interface PreviousLessonContext {
  slug: string;
  title: string;
  concepts: string[];
  theoryExcerpt: string;
}

/** A aula ATUAL (teoria COMPLETA — o aluno acabou de estudar). */
export interface CurrentLessonContext {
  slug: string;
  title: string;
  concepts: string[];
  theory: string;
}

/** Contexto sequencial montado por buildChallengeContext. */
export interface ChallengeContext {
  /** título da trilha (para o prompt citar o curso). */
  trackTitle: string;
  /**
   * critérios de entrada da trilha (track.json entryCriteria). Vazio quando a
   * trilha não declara — o prompt renderiza "(nenhum — trilha de senso
   * iniciante)". Ausência e array vazio têm o MESMO significado: trilha
   * iniciante, sem critérios prévios.
   */
  entryCriteria: string[];
  /** aulas anteriores NA ORDEM da trilha, EXCLUINDO a aula atual. */
  previousLessons: PreviousLessonContext[];
  /** a aula atual — base teórica COMPLETA (sem truncamento). */
  currentLesson: CurrentLessonContext;
}

/** O desafio a validar (subconjunto do TrackChallengeSource — o que a LLM julga). */
export interface ChallengeToValidate {
  title: string;
  statement: string;
  testsCode: string;
  solutionCode: string;
}

/**
 * Veredito de UM teste do testsCode.
 *
 * ORDEM DOS CAMPOS É CONTRATO (docs/16-engine-de-trilha.md §6.3): neste
 * componente — cuja função é REPROVAR desafio que cobra o não-ensinado —
 * decisão antes do raciocínio era o bug. A ordem correta é
 * `nome → construcoes_encontradas → motivo → aprovado` (evidência/raciocínio
 * ANTES do veredito; INV-04). Todos os campos são obrigatórios.
 */
export interface TestVerdict {
  nome: string;
  /** construções que o teste exige (ex.: `typeof`, `assert.throws`, loop). */
  construcoes_encontradas: string[];
  motivo: string;
  aprovado: boolean;
}

/**
 * Veredito do validador. `ok: false` com `error` estruturado — NUNCA um
 * veredito falso (reprovar com motivo errado seria pior que não julgar).
 */
export type ContextVerdict =
  | { ok: true; aprovado: boolean; testes: TestVerdict[] }
  | { ok: false; error: { code: string; message: string } };

/** Códigos de erro estruturado (superfície estável para o CLI/regenerador). */
export const CONTEXT_ERROR_CODES = {
  /** LLM indisponível / sem conteúdo — nem chegou a julgar. */
  UNAVAILABLE: 'CONTEXT_UNAVAILABLE',
  /** JSON inválido ou estrutura errada APÓS o retry com feedback. */
  INVALID_JSON: 'CONTEXT_INVALID_JSON',
} as const;

/** Limite de tentativas do parse/estrutura (1 retry com feedback). */
export const MAX_CONTEXT_ATTEMPTS = 2;

/** Truncamento da teoria das aulas ANTERIORES (chars por aula). */
export const PREVIOUS_LESSON_THEORY_TRUNCATE = 1500;

/** O chamador injeta a LLM — mesma assinatura do challengeRegenerator. */
export type ContextValidatorLlm = (req: {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  temperature?: number;
  timeoutMs?: number;
}) => Promise<{ content: string }>;

/** Marca exibida quando a trilha não declara critérios de entrada. */
export const NO_ENTRY_CRITERIA_LABEL = '(nenhum — trilha de senso iniciante)';

/** Concatena o markdown das seções de teoria de uma aula. */
function theoryMarkdown(sections: Array<{ markdown: string }>): string {
  return sections.map((s) => s.markdown).join('\n\n');
}

/**
 * Monta o contexto sequencial de um desafio (PURO — mesmo track e slugs
 * entram, mesmo contexto sai; sem rede, sem IO).
 *
 * Ordem: módulos ordenados por `order` (ascendente — a ordem do array
 * `modules` da trilha é a ordem do DISCO; a ordem PEDAGÓGICA é o `order` de
 * cada module.json); dentro do módulo, as aulas na ordem do array `lessons`.
 * A aula em questão fica FORA de `previousLessons` (o aluno não a conhecia
 * antes) e entra como `currentLesson` com a teoria COMPLETA — o desafio pode
 * cobrar o que ela ensina.
 *
 * Lança Error (slug de módulo/aula inexistente) — o chamador decide o
 * tratamento; em uso normal os slugs vêm de um LoadedTrack válido.
 */
export function buildChallengeContext(
  track: LoadedTrack,
  moduleSlug: string,
  lessonSlug: string,
): ChallengeContext {
  const current = findLesson(track, moduleSlug, lessonSlug);
  if (!current) {
    throw new Error(
      `buildChallengeContext: aula '${lessonSlug}' não encontrada no módulo '${moduleSlug}' da trilha '${track.root.slug}'.`,
    );
  }

  // Módulos em ORDEM PEDAGÓGICA (order ascendente; sort é estável no V8, e o
  // desempate não muda nada aqui — orders são únicos por trilha).
  const orderedModules = [...track.modules].sort((a, b) => a.meta.order - b.meta.order);

  const previousLessons: PreviousLessonContext[] = [];
  let found = false;
  for (const mod of orderedModules) {
    for (const lesson of mod.lessons) {
      if (mod.meta.slug === moduleSlug && lesson.meta.slug === lessonSlug) {
        found = true;
        break;
      }
      // Aula anterior à atual: entra com a teoria TRUNCADA (contexto enxuto —
      // o que importa é o que ENSINOU, não o texto inteiro).
      previousLessons.push({
        slug: lesson.meta.slug,
        title: lesson.meta.title,
        concepts: [...lesson.meta.concepts],
        theoryExcerpt: theoryMarkdown(lesson.meta.theory).slice(0, PREVIOUS_LESSON_THEORY_TRUNCATE),
      });
    }
    if (found) break;
  }
  if (!found) {
    // findLesson já garantiu a existência — defesa dupla para não silenciar.
    throw new Error(
      `buildChallengeContext: aula '${lessonSlug}' não encontrada na sequência do módulo '${moduleSlug}'.`,
    );
  }

  return {
    trackTitle: track.root.title,
    entryCriteria: track.root.entryCriteria ? [...track.root.entryCriteria] : [],
    previousLessons,
    currentLesson: {
      slug: current.meta.slug,
      title: current.meta.title,
      concepts: [...current.meta.concepts],
      theory: theoryMarkdown(current.meta.theory),
    },
  };
}

/** Entrada completa da validação (contexto + desafio). */
export interface VerifyContextInput {
  context: ChallengeContext;
  challenge: ChallengeToValidate;
  /** injetável — testes usam fake; runtime usa o deepseekClient. */
  llm: ContextValidatorLlm;
}

/**
 * Constrói o prompt de validação: contexto completo do aluno + veredito POR
 * TESTE em JSON parseável (um item por test('...')).
 *
 * O prompt NÃO pede raciocínio. A profundidade de raciocínio é PARÂMETRO do
 * protocolo — `reasoning: { enabled: true, effort: 'max' }`, o default que o
 * cliente aplica em toda chamada a partir de `shared/llm/constants.ts`
 * (`OPENROUTER_REASONING`) — e nunca imperativo textual (docs/16 §7). O texto
 * governa só o FORMATO: raciocínio ANTES da decisão DENTRO do JSON
 * (nome → construcoes_encontradas → motivo → aprovado; INV-04, docs §6.3).
 */
export function buildValidationPrompt(context: ChallengeContext, challenge: ChallengeToValidate): string {
  const entryCriteria =
    context.entryCriteria.length > 0
      ? context.entryCriteria.map((c) => `- ${c}`).join('\n')
      : `- ${NO_ENTRY_CRITERIA_LABEL}`;

  const previous =
    context.previousLessons.length > 0
      ? context.previousLessons
          .map(
            (l, i) =>
              `${i + 1}. [${l.slug}] ${l.title} — conceitos: ${l.concepts.join(', ') || '(nenhum)'}\n` +
              `   Teoria (trecho):\n${l.theoryExcerpt}`,
          )
          .join('\n\n')
      : '(nenhuma — esta é a primeira aula da trilha)';

  const current = context.currentLesson;

  return `Você é o VALIDADOR PEDAGÓGICO de um desafio de código do curso "${context.trackTitle}" do study-method.

O aluno só conhece o conteúdo das aulas anteriores e desta aula (contexto abaixo). NADA além disso pode ser cobrado — um desafio que exige conhecimento não ensinado está pedagogicamente quebrado.

CONTEXTO DO ALUNO

Critérios de entrada da trilha (o aluno já sabia antes de começar):
${entryCriteria}

Aulas anteriores (na ordem da trilha — o aluno estudou TODAS):
${previous}

Aula atual (o aluno acabou de estudar — pode cobrar TUDO dela):
[${current.slug}] ${current.title} — conceitos: ${current.concepts.join(', ') || '(nenhum)'}
Teoria completa:
${current.theory}

DESAFIO A VALIDAR

Título: ${challenge.title}
Enunciado:
${challenge.statement}

Código dos testes (testsCode):
\`\`\`js
${challenge.testsCode}
\`\`\`

Solução de referência (solutionCode):
\`\`\`js
${challenge.solutionCode}
\`\`\`

ANÁLISE OBRIGATÓRIA (para CADA test('...') do testsCode, um a um):
- o que o teste exige (asserts, conceitos, APIs, validações — ex.: assert.throws, typeof, tratamento de erro, loops, objetos);
- as CONSTRUÇÕES que o teste exige (liste em "construcoes_encontradas" do item: ex.: ["typeof", "assert.throws", "throw"]);
- se isso está ENSINADO nos critérios de entrada, nas aulas anteriores ou na aula atual (cite a aula/seção/trecho que ensina);
- se a solução de referência é implementável com o conhecimento ensinado.

REGRAS:
1. NUNCA aprovar um teste que cobra algo AUSENTE do contexto — ex.: validar tipos/recusar texto (typeof/assert.throws/tratamento de erro) se nenhuma aula ensinou validação de entrada.
2. A solução de referência deve ser implementável com o conhecimento ensinado.
3. Responda SOMENTE um JSON válido, sem markdown, SEM texto fora do JSON:
{ "aprovado": boolean, "testes": [ { "nome": string, "construcoes_encontradas": [string], "motivo": string, "aprovado": boolean } ] }
- UM item por test('...') do testsCode, na MESMA ordem, com o nome EXATO do teste;
- em cada item, "construcoes_encontradas" lista as construções que o teste exige, "motivo" traz o raciocínio e "aprovado" a decisão — SEMPRE nessa ordem;
- "aprovado" do topo é true só se TODOS os testes forem aprovados.`;
}

/**
 * Extrai o primeiro objeto JSON de uma resposta (tolera fences ```json) —
 * mesma semântica do challengeRegenerator (padrão do repo).
 */
export function extractJsonObject(text: string): unknown {
  const noFences = text.replace(/```(?:json)?/g, '');
  const start = noFences.indexOf('{');
  const end = noFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(noFences.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Nº de testes declarados no testsCode (um item de veredito por test()). */
export function countTests(testsCode: string): number {
  return (testsCode.match(/\btest\(/g) ?? []).length;
}

/**
 * Valida a ESTRUTURA do JSON da LLM e devolve o veredito normalizado — ou um
 * `reason` PRECISO quando a estrutura não fecha (o motivo alimenta o feedback
 * do retry): exige `aprovado` boolean, `testes` array com UM item por
 * test('...') do testsCode, cada item com `nome` string, `motivo` string,
 * `aprovado` boolean e — quando presente — `construcoes_encontradas` array de
 * strings (docs §6.3: nome → construcoes_encontradas → motivo → aprovado).
 *
 * Entrada da LLM é NÃO-CONFIÁVEL: `construcoes_encontradas` AUSENTE é
 * normalizado para `[]` explícito (a interface TestVerdict continua exigindo
 * o campo em TODO veredito que o serviço devolve). O que nunca se tolera é
 * veredito falso — por isso tipo errado reprova com motivo específico.
 */
function parseVerdict(raw: unknown, testsCode: string): { verdict: TestVerdict[] } | { reason: string } {
  const expected = countTests(testsCode);
  if (typeof raw !== 'object' || raw === null) {
    return { reason: 'a resposta não era um JSON.' };
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.aprovado !== 'boolean') {
    return { reason: 'o campo "aprovado" deve ser boolean.' };
  }
  if (!Array.isArray(r.testes)) {
    return { reason: 'o campo "testes" deve ser um array.' };
  }
  if (r.testes.length !== expected) {
    return { reason: `"testes" deve ter ${expected} item(ns) — um por test() do testsCode; recebido: ${r.testes.length}.` };
  }
  if (r.testes.length === 0) {
    return { reason: '"testes" vazio (o testsCode não declara nenhum test()).' };
  }
  for (let i = 0; i < r.testes.length; i += 1) {
    const item = r.testes[i];
    if (typeof item !== 'object' || item === null) {
      return { reason: `"testes[${i}]" não é um objeto.` };
    }
    const t = item as Record<string, unknown>;
    if (typeof t.nome !== 'string' || typeof t.motivo !== 'string' || typeof t.aprovado !== 'boolean') {
      return { reason: `"testes[${i}]" malformado (esperado { nome: string, construcoes_encontradas: string[], motivo: string, aprovado: boolean }).` };
    }
    if (t.construcoes_encontradas !== undefined) {
      if (
        !Array.isArray(t.construcoes_encontradas) ||
        !(t.construcoes_encontradas as unknown[]).every((c) => typeof c === 'string')
      ) {
        return { reason: `"testes[${i}].construcoes_encontradas" deve ser um array de strings.` };
      }
    }
  }
  return {
    verdict: r.testes.map((t) => {
      const item = t as Record<string, unknown>;
      const construcoes = Array.isArray(item.construcoes_encontradas)
        ? (item.construcoes_encontradas as unknown[]).filter((c): c is string => typeof c === 'string')
        : [];
      // INV-04 (docs §6.3): raciocínio ANTES da decisão, na ordem do contrato.
      return {
        nome: item.nome as string,
        construcoes_encontradas: construcoes,
        motivo: item.motivo as string,
        aprovado: item.aprovado as boolean,
      };
    }),
  };
}

/**
 * Valida um desafio contra o contexto ensinado. Fluxo:
 *   1. monta o prompt e chama a LLM (o raciocínio no máximo NÃO é pedido aqui:
 *      é o default do parâmetro `reasoning` do cliente — ver o cabeçalho);
 *   2. LLM indisponível/retorno vazio → erro estruturado CONTEXT_UNAVAILABLE
 *      (sem retry — o serviço está fora do ar, retentar não ajuda);
 *   3. JSON inválido/estrutura errada → 1 retry com feedback do motivo;
 *      ainda inválido → CONTEXT_INVALID_JSON. NUNCA veredito falso.
 */
export async function verifyChallengeAgainstContext(input: VerifyContextInput): Promise<ContextVerdict> {
  const { context, challenge, llm } = input;
  let lastReason = '';

  for (let attempt = 0; attempt < MAX_CONTEXT_ATTEMPTS; attempt += 1) {
    let content: string;
    try {
      const res = await llm({
        messages: [
          { role: 'system', content: 'Você responde apenas JSON válido, sem markdown.' },
          {
            role: 'user',
            content:
              buildValidationPrompt(context, challenge) +
              (lastReason ? `\n\nA SUA RESPOSTA ANTERIOR foi rejeitada. Motivo: ${lastReason}. Corrija o JSON e responda SOMENTE o JSON no formato pedido.` : ''),
          },
        ],
        temperature: 0,
        timeoutMs: 60_000,
      });
      content = res.content;
    } catch (err) {
      return {
        ok: false,
        error: { code: CONTEXT_ERROR_CODES.UNAVAILABLE, message: `falha do serviço de IA: ${String(err)}` },
      };
    }
    if (!content || !content.trim()) {
      return {
        ok: false,
        error: { code: CONTEXT_ERROR_CODES.UNAVAILABLE, message: 'a IA não devolveu conteúdo.' },
      };
    }

    const parsed = parseVerdict(extractJsonObject(content), challenge.testsCode);
    if ('reason' in parsed) {
      lastReason = parsed.reason;
      continue;
    }
    // O veredito de topo é DERIVADO dos itens (fonte da verdade = análise por
    // teste): se a LLM se contradiz, os itens vencem — nunca um veredito
    // aprovado com teste reprovado escondido.
    const aprovado = parsed.verdict.every((t) => t.aprovado);
    return { ok: true, aprovado, testes: parsed.verdict };
  }

  return {
    ok: false,
    error: {
      code: CONTEXT_ERROR_CODES.INVALID_JSON,
      message: `a IA não devolveu um veredito válido após ${MAX_CONTEXT_ATTEMPTS} tentativas. Tente de novo.`,
    },
  };
}
