/**
 * electron/main/services/lessonTypes.ts — tipos da cadeia LESSON-ORCHESTRATOR
 * (onda3): ASSUNTO → PESQUISA → AUTORIA → MATERIALIZAÇÃO → VALIDAÇÃO.
 *
 * O LLM é INJETADO via interfaces (`AuthorFn`, `LlmJudge`): este módulo NÃO
 * importa nenhum client de LLM. O orquestrador (`lessonOrchestrator.ts`) recebe
 * autor e juiz prontos da fiação (onda3-ui-wiring) e só os usa.
 *
 * Contrato base (congelado) em `shared/ipc-contract.ts`: `StudyLesson`,
 * `StudyFinding`, `ChallengeInfo`, `TestAnswerResult`. Os tipos da autoria
 * (`LessonDraft`, `ChallengeDraft`, `ScenarioDraft`) são de ONDA — o autor
 * (LLM) os produz e o orquestrador os materializa no layout EXATO dos scripts.
 */

import type { StudyFinding, StudyLesson } from '@shared/ipc-contract';

/**
 * Domínio da aula (onda3-respostas): 'programming' (default — fluxo TDD
 * existente) | 'math' (exercício gerado pela mathLib, verificado por execução,
 * sem desafio de código). Resolvido em lessonOrchestrator: `opts.domain` da UI
 * quando passado, senão heurística por palavra-chave no assunto.
 */
export type LessonDomain = 'programming' | 'math';

/**
 * Exercício de matemática como o AUTOR o recebe (sem o esperado): o LLM usa o
 * prompt fornecido — nunca inventa números nem revela a resposta. O esperado
 * (expectedNormalized) é computado pela mathLib e anexado à aula pelo
 * ORQUESTRADOR (LessonExercise do contrato), não pelo autor.
 */
export interface AuthorMathExercise {
  kind: 'math';
  family: string;
  seed: number;
  prompt: string;
}

/** Tipo fechado de cenário de desafio (docs/05-challenges-tdd.md §1.1/§4.1). */
export type ScenarioType = 'example' | 'boundary' | 'error' | 'property';

/** Metadata opcional de memória do aluno (profile/proficiência) passada ao autor. */
export interface AuthorMemory {
  /** O que funcionou no passado (analogias, formas de explicação — MEM-2). */
  whatWorked?: string[];
  /** O que não funcionou — proibição de abordagens (MEM-3). */
  whatDidntWork?: string[];
  /** Estado de proficiência por conceito (MEM-4). */
  proficiency?: Record<string, string>;
}

/** Um cenário cobrado por um desafio da autoria (espelho de meta.json scenarios[]). */
export interface ScenarioDraft {
  /** scenario_id: snake_case ASCII sem acento. */
  id: string;
  /** Nome humano do cenário (fallback da description se vazio). */
  name: string;
  /** example | boundary | error | property (docs/05 §1.1). */
  type: ScenarioType;
  /** Entrada canônica (para o enunciado/README; não decide nada por si). */
  input: string;
  /** Valor esperado (documental — o oráculo REAL vem da referência executada). */
  expected?: string;
  /** O que este cenário cobra, em pt-BR (vira `description` no meta.json). */
  description?: string;
}

/** Um desafio como o AUTOR (LLM) o produz, antes da materialização. */
export interface ChallengeDraft {
  /** slug kebab-case do desafio (diretório challenges/<NNNN>-<slug>). */
  slug: string;
  /** linguagem do desafio: python | javascript | go | rust | c. */
  language: string;
  /** concept_id do conceito-alvo primário (snake_case). */
  concept: string;
  /** dificuldade declarada 1..5 (default 2). */
  difficulty?: number;
  /** beginner | intermediate | advanced (default beginner). */
  skillLevel?: string;
  /** Título do desafio em pt-BR (lido pelo aluno). */
  title: string;
  /** Enunciado em pt-BR → vira challenge/README.md. */
  statement: string;
  /** Código do stub (único arquivo que o aluno edita) — layout da linguagem. */
  stubCode: string;
  /** Código do teste (a especificação executável) — layout da linguagem. */
  testCode: string;
  /** Implementação de referência correta (oculta) → .solution/reference.<ext>. */
  referenceCode: string;
  /**
   * 2 implementações alternativas CORRETAS, estruturalmente DIFERENTES da
   * referenceCode, com a MESMA assinatura — alimentam .solution/reference_alt_*.
   * O harness (challenge-verify.sh passo 3) roda o teste contra cada uma para
   * detectar over-specification; a autoria (validateChallenge) EXIGE >= 2 strings
   * não vazias. Opcional no tipo apenas para não quebrar fixtures antigas fora da
   * autoria — o orquestrador cai para a referenceCode quando ausente.
   */
  referenceAlternates?: string[];
  /** Cenários cobrados — alimentam meta.json.scenarios[] e expected_test_count. */
  scenarios: ScenarioDraft[];
  /** expected_test_count (deve == scenarios.length; default = scenarios.length). */
  expectedTestCount?: number;
}

/** Aula como o AUTOR a produz (markdown + desafios). */
export interface LessonDraft {
  /** Título da aula em pt-BR. */
  lessonTitle: string;
  /** Markdown da aula (pedagogia study-method: worked example, analogia, C-*). */
  lessonMarkdown: string;
  /** Desafios validados (DES-2: só 'approved' chega ao aluno). */
  challenges: ChallengeDraft[];
}

/** Função de autoria injetável (LLM). Sinais de entrada: subject + findings + memória. */
export type AuthorFn = (ctx: {
  subject: string;
  findings: StudyFinding[];
  memory?: AuthorMemory;
  /**
   * ADITIVO (onda3-respostas): domínio resolvido da aula — 'programming'
   * (default) | 'math'. Para 'math' o autor NÃO produz desafios de código
   * (challenges: []) — o exercício vem da mathLib no campo `mathExercise`.
   */
  domain?: LessonDomain;
  /**
   * ADITIVO (onda3-respostas): exercício de matemática GERADO pela mathLib
   * quando domain === 'math'. O LLM usa o `prompt` fornecido no material e
   * NUNCA inventa números nem revela a resposta (o esperado fica com o
   * orquestrador — conferido ANTES de gerar, DES-6).
   */
  mathExercise?: AuthorMathExercise;
}) => Promise<LessonDraft>;

/** Progresso emitido via onProgress → evento `study:lesson-progress` do contrato. */
export interface LessonProgress {
  phase: 'research' | 'authoring' | 'materializing' | 'validating' | 'done' | 'error';
  /** Mensagem de status legível (pt-BR). */
  message?: string;
  /** Progresso 0..1, quando computável. */
  fraction?: number;
  /**
   * ADITIVO (fix15-list-challenges): diretório do setup materializado, presente
   * na fase `materializing` logo após createSetup. Permite ao handler gravar
   * `memory.lastSetupRoot` (fallback robusto p/ list-challenges) E à UI capturar
   * o setupRoot do fluxo de aula sem depender só da memória do main.
   */
  setupRoot?: string;
  /** Id do setup materializado (mesmo evento da materialização). */
  setupId?: string;
  /**
   * ADITIVO (onda2-research-live): código de erro estruturado presente na fase
   * `error` quando o fallout tem causa tipada (ex.: BRAVE_KEY_MISSING na
   * pesquisa) — a UI usa para mensagem clara e o gerenciador pode ramificar.
   */
  code?: string;
}

/** Resultado do generateLesson: a StudyLesson montada + os desafios rejeitados. */
export interface RejectedChallenge {
  slug: string;
  verdict: string;
  /** Motivo curto (ex.: melhor que não entraram no judge, sem juiz). */
  reason?: string;
}

export interface GenerateLessonResult {
  /** StudyLesson conforme o contrato congelado; challenges = SOMENTE aprovados. */
  lesson: StudyLesson;
  /** Desafios que NÃO passaram na validação (weak/rejected/not_run sem juiz). */
  rejected: RejectedChallenge[];
  /**
   * ONDA4 (desafio-persistencia): id da lição PERSISTIDA (createLesson) —
   * presente quando o repo foi injetado no orquestrador. A onda 5 usa para
   * recordAnswer/markLessonCompleted/judge-answer com ids reais.
   */
  lessonId?: string;
  /** ONDA4: id do subject persistido (upsertSubject) — mesmo gate do lessonId. */
  subjectId?: string;
}