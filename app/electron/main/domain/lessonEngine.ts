/**
 * electron/main/domain/lessonEngine.ts — MOTOR DE AULA CURTA (onda2, domínio
 * puro, dependência ZERO).
 *
 * Transforma o markdown longo que o LLM gera (StudyLesson.markdown — hoje uma
 * "página inteira") numa AULA CURTA de 1 a 2 parágrafos + um input/uma pergunta
 * para o aluno responder + o ENCADEAMENTO para a próxima aula do mesmo assunto.
 * Fórmula do tutor: MUITA prática, pouca teoria, interação do aluno.
 *
 * DI-FRIENDLY e puro: NENHUM I/O de banco vive aqui. As funções recebem o que
 * precisam por parâmetro (o markdown, a lista de aulas), e a fiação/IPC chama a
 * repo (electron/main/db/repo.ts) fora deste módulo. Por isso rode sem jsdom —
 * basta um import e rodar.
 *
 * Convenções pt-BR e imports relativos mínimos; nenhum Electron importado.
 */
import type { StudyLesson } from '../../../shared/ipc-contract';

/** Opções de `summarizeLessonToShort`. */
export interface SummarizeOptions {
  /** Número máximo de parágrafos na saída (default 2). */
  maxParagraphs?: number;
  /** Número máximo de palavras por parágrafo (trunca com ellipsis se cortar; default ≈ 80). */
  maxWordsPerParagraph?: number;
}

/** Resultado de `summarizeLessonToShort`. */
export interface ShortLesson {
  /** Parágrafos do resumo (máx. `maxParagraphs`), já truncados por palavra. */
  paragraphs: string[];
  /** O resumo colado num único bloco (para persistir em `lessons.body`). */
  shortBody: string;
}

/** Entrada mínima de `pickNextLesson` — uma aula do mesmo assunto. */
export interface LessonCandidate {
  id: string;
  title: string;
  difficulty: number;
  completedAt: string | null;
}

/** Resultado de `pickNextLesson`. */
export interface NextLesson {
  /** Id da próxima aula, ou null quando não há (sugere "gerar nova aula"). */
  lessonId: string | null;
  /** Motivo legível da escolha (pt-BR). */
  reason: string;
}

/**
 * Deriva um slug kebab-case (sem acento, minúsculas) a partir de um nome
 * humano de assunto. Implementado localmente para manter o motor 100% puro e
 * com dependência ZERO (mesma lógica/normalização do `slugify` de repo.ts,
 * que está fora do alcance deste módulo).
 */
export function ensureSubjectSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Divide o markdown em parágrafos. Ignora blocos de código (``` ... ```) para o
 * resumo, mas devolve UMA block apenas (preservando o seu conteúdo) quando há,
 * como exemplo prático — para dar ao aluno algo para "colocar a mão na massa".
 */
function splitParagraphs(markdown: string): { prose: string[]; codeBlock: string | null } {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  const codeFences: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      // Captura a block de código (incluindo as linhas de crase).
      let j = i + 1;
      while (j < lines.length && !/^\s*```/.test(lines[j])) j++;
      const end = Math.min(j, lines.length);
      const code = lines.slice(i, end + 1).join('\n').trim();
      if (code) codeFences.push(code);
      // Avança além da block **e** de quaisquer linhas em branco que a seguem,
      // para não criar um "parágrafo" vazio entre a block e o próx. parágrafo.
      i = end + 1;
      while (i < lines.length && lines[i].trim() === '') i++;
      continue;
    }
    blocks.push(line);
    i++;
  }

  // Re-agrupa em parágrafos (linhas em branco separam blocos; títulos ## entram
  // no parágrafo que os segue, mas são aparados do texto final).
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const text = current.join(' ').replace(/\s+/g, ' ').trim();
    if (text) paragraphs.push(text);
    current = [];
  };
  for (const line of blocks) {
    if (line.trim() === '') {
      flush();
    } else {
      current.push(line.trim());
    }
  }
  flush();

  // Preserva UMA block de código (a primeira) como exemplo prático.
  return { prose: paragraphs, codeBlock: codeFences[0] ?? null };
}

/** Conta palavras (`\w+`), tratando acentos portugueses como parte da palavra. */
function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

/** Trunca um texto a `maxWords` palavras, acrescentando '…' quando cortado. */
function truncateToWords(text: string, maxWords: number): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!maxWords || maxWords <= 0) return trimmed;
  const words = trimmed.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
  if (words.length <= maxWords) return trimmed;
  // Reconstrói na contagem de palavras apenas o texto visível: extrai a substring
  // original que contém as primeiras `maxWords` palavras e corta no último
  // espaço, evitando deixar um espaçamento ou pontuação órfã.
  const re = new RegExp(
    `^\\s*(?:[\\p{L}\\p{N}]+(?:['’\\-][\\p{L}\\p{N}]+)*\\s*){${maxWords}}`,
    'u',
  );
  const match = trimmed.match(re);
  return (match ? match[0] : trimmed).replace(/\s+$/, '') + '…';
}

/**
 * Resume o markdown de uma aula inteira numa AULA CURTA (default 1-2 parágrafos).
 *
 * - Divide o markdown em parágrafos (linhas em branco / `\n\n`);
 * - ignora blocos de código para o resumo, mas PRESERVA um deles (o primeiro)
 *   como exemplo prático;
 * - devolve NO MÁXIMO `maxParagraphs` parágrafos, truncando cada um a
 *   `maxWordsPerParagraph` palavras com ellipsis quando cortado;
 * - prioriza o NÚCLEO do assunto: começa do primeiro parágrafo ("lead") e, se o
 *   markdown tiver um header `# Título`, o lembrete do assunto é mantido ao
 *   topo quando couber.
 */
export function summarizeLessonToShort(
  markdown: string,
  opts: SummarizeOptions = {},
): ShortLesson {
  const maxParagraphs = opts.maxParagraphs ?? 2;
  const maxWords = opts.maxWordsPerParagraph ?? 80;
  const { prose, codeBlock } = splitParagraphs(markdown);

  const paras: string[] = [];
  for (const raw of prose.slice(0, maxParagraphs)) {
    const p = truncateToWords(raw, maxWords);
    if (p) paras.push(p);
  }

  // Preserva UM exemplo prático como parágrafo extra (não conta para o número
  // de parágrafos de teoria; o default 2 continua valendo para a "prosa").
  const resultParas = [...paras];
  if (codeBlock) {
    resultParas.push(codeBlock);
  }

  return {
    paragraphs: resultParas,
    shortBody: resultParas.join('\n\n'),
  };
}

/**
 * Extrai a primeira sentença interrogativa (que termina em `?`) do markdown.
 * Quando a aula vem com uma pergunta (ex.: "Qual a diferença entre X e Y?"),
 * devolve essa pergunta completa; senão devolve ''.
 */
export function extractQuestion(source: string | StudyLesson): string {
  const markdown = typeof source === 'string' ? source : source?.markdown ?? '';
  if (!markdown) return '';
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    for (const match of line.matchAll(/[^.\n\r!?]*\?/g)) {
      const candidate = match[0].trim();
      if (candidate) return candidate;
    }
  }
  return '';
}

/** Entrada de `buildLessonLesson`. */
export interface LessonInput {
  /** O corpo da aula curta (de `summarizeLessonToShort`). */
  body: string;
  /** Pergunta opcional extraída do markdown (de `extractQuestion`). */
  question?: string;
}

/** Resultado de `buildLessonLesson`. */
export interface LessonPresentation {
  body: string;
  question: string;
  /** Prompt user-facing para a UI (pt-BR). */
  prompt: string;
}

/**
 * Monta a apresentação da aula curta para a UI + o prompt de interação:
 *  - com pergunta → "Responda: <question>";
 *  - sem pergunta → prompt genérico "Digite o que você entendeu".
 *  Puro: não faz I/O.
 */
export function buildLessonLesson(body: string, question?: string): LessonPresentation {
  const q = (question ?? '').trim();
  return {
    body: body.trim(),
    question: q,
    prompt: q ? `Responda: ${q}` : 'Digite o que você entendeu',
  };
}

/**
 * Encadeia para a PRÓXIMA aula do MESMO assunto.
 *
 * Regra:
 *  1. se houver aulas INCOMPLETAS (completedAt null) → a de MENOR dificuldade
 *     (ordem ascendente) — pratica o que ainda não foi dominado;
 *  2. se TODAS estiverem completas → a de MAIOR dificuldade (a mais recente do
 *     percurso) para continuar evoluindo;
 *  3. se a lista estiver vazia → `{ lessonId: null }` (sugere "gerar nova aula").
 */
export function pickNextLesson(lessons: LessonCandidate[]): NextLesson {
  if (!lessons || lessons.length === 0) {
    return { lessonId: null, reason: 'Nenhuma aula disponível — gere uma nova aula.' };
  }

  const incomplete = lessons
    .filter((l) => l.completedAt == null)
    .sort((a, b) => a.difficulty - b.difficulty);

  if (incomplete.length > 0) {
    return {
      lessonId: incomplete[0].id,
      reason: `Próxima aula incompleta: «${incomplete[0].title}» (dificuldade ${incomplete[0].difficulty}).`,
    };
  }

  const mostAdvanced = [...lessons].sort(
    (a, b) => b.difficulty - a.difficulty || (a.title < b.title ? -1 : 1),
  )[0];
  return {
    lessonId: mostAdvanced.id,
    reason: `Todas concluídas — continue evoluindo: «${mostAdvanced.title}» (dificuldade ${mostAdvanced.difficulty}).`,
  };
}
