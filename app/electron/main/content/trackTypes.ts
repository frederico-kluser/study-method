/**
 * electron/main/content/trackTypes.ts — modelo de dados das TRILHAS (rodada 8).
 *
 * As trilhas são o conteúdo didático do produto: um curso inteiro definido em
 * arquivos JSON versionados em git, criados APENAS pelo CLI de autoria
 * (tools/track-cli.ts) — o aluno não gera mais aula, ele abre a trilha e
 * escolhe a aula pronta. Este arquivo define o formato dos arquivos e a
 * validação que o loader aplica ao carregá-los.
 *
 * Layout em disco (resources/tracks/<slug>/):
 *   track.json                        — a trilha (ordem de módulos)
 *   modules/<slug>/module.json        — módulo (ordem de aulas)
 *   modules/<slug>/lessons/<slug>/lesson.json       — aula (teoria + fontes + desafios)
 *   modules/<slug>/lessons/<slug>/challenges/<slug>/challenge.json — desafio
 *   proficiency.json                  — desafio de proficiência (cobre TUDO)
 *
 * Regras do formato (normativas, validadas pelo loader):
 *   - schemaVersion === 1 em todo arquivo;
 *   - slug: kebab-case ASCII minúsculo, ^[a-z0-9]+(-[a-z0-9]+)*$;
 *   - desafios de aula usam language 'nodejs' (node:test, ESM) — o runner
 *     escreve starter+testes num dir temporário e roda `node --test`;
 *   - references (prerequisites, challenges[]) só apontam para slugs que
 *     EXISTEM na trilha (validação de integridade do loader);
 *   - minFirstStarMs: tempo mínimo (ms) antes de a 1ª estrela poder sumir por
 *     DEMORA (decaimento de velocidade); ausente usa o default do produto
 *     (DEFAULT_MIN_FIRST_STAR_MS em trackTypes — 60s; proficiência 120s).
 *
 * Campos ADITIVOS (§10 do docs/16-engine-de-trilha.md): o schema é ABERTO —
 * nenhum validador rejeita chave extra, o loader faz cast (não pick) e
 * `schemaVersion` NUNCA é bumpado (comparado por igualdade estrita em 4
 * lugares). Campo novo entra marcado como ADITIVO e OPCIONAL:
 *   - assertions (onda 1 schema-quiz): até 3 AFIRMAÇÕES por aula, cada uma
 *     com quiz de múltipla escolha (4 opções + resposta + feedback) que o
 *     aluno responde DURANTE a aula. AUSÊNCIA é válida — aula sem quiz
 *     continua passando (trilhas antigas carregam sem o campo).
 */

import {
  DEFAULT_ADAPTER_ID,
  DEFAULT_CHALLENGE_LANGUAGE,
  DEFAULT_RUNTIME,
  adapterIdForChallengeLanguage,
  defaultAdapter,
  listChallengeLanguages,
  type ChallengeLanguageToken,
  type TheoryCodeLanguage,
} from '../engine/lang/registry';

/** Slug canônico de trilha/módulo/aula/desafio. */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Nome do arquivo raiz da trilha, do módulo e da aula (constantes do layout). */
export const TRACK_FILE = 'track.json';
export const MODULE_FILE = 'module.json';
export const LESSON_FILE = 'lesson.json';
export const CHALLENGE_FILE = 'challenge.json';
export const PROFICIENCY_FILE = 'proficiency.json';

export const TRACK_SCHEMA_VERSION = 1;

/**
 * Tempo mínimo antes de a 1ª estrela poder sumir por demora (decaimento de
 * velocidade) — requisito do dono do produto ("tem um número mínimo de tempo
 * pra sumir a primeira estrela"). Antes disso o tick de demora NÃO tira
 * estrela; perdas explícitas (blur/erro/timeout) seguem imediatas.
 */
export const DEFAULT_MIN_FIRST_STAR_MS = 60_000;
/** Proficiência é desafio mais longo: 2 min de carência da 1ª estrela. */
export const PROFICIENCY_MIN_FIRST_STAR_MS = 120_000;

/**
 * A linguagem de um DESAFIO. Deixou de ser o literal `'nodejs'` e passou a ser
 * derivada do REGISTRO DE ADAPTADORES (`engine/lang/registry.ts`) — a costura
 * multilíngua do §6 de `docs/research/08-multilingua-trava-deterministica.md`.
 *
 * `'nodejs'` continua VÁLIDO e continua sendo o DEFAULT: é o que as 112
 * trilhas do disco declaram, e o §6 pede separação de campos, não renomeação
 * de dados existentes. O registro sabe que `'nodejs'` é o RUNTIME do par
 * (javascript, node) e o resolve para o adaptador `'javascript'`.
 *
 * CUIDADO COM O HOMÔNIMO: este `language` é a linguagem de PROGRAMAÇÃO. O
 * `TrackSource.language` (`'pt-BR' | 'en'`) é a língua da PROSA. São campos
 * diferentes com o mesmo nome, em níveis diferentes do schema — ver o
 * comentário em `TrackSource`.
 */
export type TrackChallengeLanguage = ChallengeLanguageToken;

/** O DEFAULT de `challenge.language` — `'nodejs'`, do registro. */
export const DEFAULT_TRACK_CHALLENGE_LANGUAGE: TrackChallengeLanguage = DEFAULT_CHALLENGE_LANGUAGE;

/**
 * Regex de caminho seguro de arquivo de desafio multi-arquivo (rodada 9):
 * só letras/dígitos/_/-//, termina em .mjs. Proíbe '..', pontos no meio e
 * qualquer outra coisa que escape do diretório de execução.
 *
 * VEM DO ADAPTADOR desde a onda do registro (§6 obs. 1: "o regex vira um campo
 * do adaptador" — com Go o arquivo termina em `_test.go`, com Rust o fonte
 * vive em `src/`). O símbolo continua exportado daqui porque quatro arquivos o
 * importam (`engine/exec/harness.ts:50`, `services/challengeExec.ts:25`,
 * `ipc/track-handlers.ts:42` e este); o VALOR é o `filePathPattern` do
 * adaptador default.
 */
export const SAFE_FILE_PATH_RE = defaultAdapter().filePathPattern;

/**
 * UM arquivo de um desafio MULTI-ARQUIVO (rodada 9): o aluno edita TODOS os
 * arquivos do desafio — cada um com starter e solução próprios.
 */
export interface TrackChallengeFileSource {
  /** caminho relativo dentro do dir de execução (ex.: 'lib/soma.mjs'). */
  path: string;
  /** código inicial que o aluno edita neste arquivo. */
  starterCode: string;
  /** solução de referência deste arquivo. */
  solutionCode: string;
}

export interface TrackChallengeSource {
  schemaVersion: number;
  slug: string;
  title: string;
  /** concept_id snake_case (granularidade do docs/04-proficiencia.md §1). */
  concept: string;
  difficulty: number; // 1..5
  language: TrackChallengeLanguage;
  /** enunciado em markdown (o aluno lê antes de clicar em "Começar"). */
  statement: string;
  /**
   * ADITIVO (rodada 9): arquivos do desafio MULTI-ARQUIVO. Presente → o aluno
   * edita TODOS os arquivos (starterCode/solutionCode de topo não valem; os
   * arquivos carregam os próprios). Ausente → comportamento atual: arquivo
   * único solution.mjs com starterCode/solutionCode.
   */
  files?: TrackChallengeFileSource[];
  /**
   * código inicial que o aluno edita (arquivo unico, ESM). OPCIONAL quando
   * `files` presente (o conteúdo vive nos arquivos); obrigatório sem files.
   */
  starterCode?: string;
  /** testes node:test que importam o código do aluno (especificação executável). */
  testsCode: string;
  /**
   * solução de referência (o main roda contra para conferir o desafio).
   * OPCIONAL quando `files` presente (as soluções vivem nos arquivos).
   */
  solutionCode?: string;
  /** nº de testes executáveis do arquivo de testes (gate de igualdade). */
  expectedTestCount: number;
  /** carência da 1ª estrela em ms (default: DEFAULT_MIN_FIRST_STAR_MS). */
  minFirstStarMs?: number;
}

export interface TrackTheorySection {
  id: string;
  title: string;
  /** conteúdo em markdown (linguagem simples, pt-BR). */
  markdown: string;
  /**
   * trecho de código ilustrativo com explicação (opcional).
   *
   * `language` deixou de ser string livre e passou a ser `TheoryCodeLanguage`,
   * ligada ao REGISTRO (§6, linha 954: "`TrackTheorySection.code.language`
   * hoje é uma string livre; ela precisa passar a ser um enum, porque é ela
   * que diz ao extrator qual parser aplicar a cada bloco cercado da teoria").
   *
   * O registro resolve toda tag em três baldes (`classifyTheoryTag`):
   *   - CÓDIGO      → tem adaptador (`js`, `javascript`, `mjs`, `cjs`, `node`, `jsx`);
   *   - NÃO-CÓDIGO  → dado/protocolo/saída, nunca vai a parser (`json`, `http`, …);
   *   - DESCONHECIDA→ tag que ninguém reivindica.
   *
   * DEFAULT DE BLOCO SEM TAG (a decisão que o §6 cobra, linha 956 — "68 de 262
   * blocos da trilha atual não têm tag de linguagem nenhuma"): o default é
   * `DEFAULT_ADAPTER_ID` (`javascript`) — o mesmo comportamento de hoje
   * (`engine/theoryCode.ts:178`, `isJavaScript: language === '' ? true : …`).
   * O default é do CAMPO `code`, não da CERCA: bloco cercado sem tag continua
   * sendo DEFEITO DE FORMATO e NÃO é analisado. A assimetria é intencional e
   * está documentada em `engine/theoryCode.ts`.
   */
  code?: { language: TheoryCodeLanguage; code: string; explanation?: string };
}

/**
 * ADITIVO (onda 1 schema-quiz, §10 do docs/16-engine-de-trilha.md): UMA
 * AFIRMAÇÃO da aula — frase que a aula ensina, com um quiz de múltipla
 * escolha (4 opções, índice da correta e feedback) que o aluno responde
 * DURANTE a aula (máx. 3 por aula — requisito do dono do produto).
 */
export interface TrackAssertion {
  /** id kebab-case (SLUG_RE) — ÚNICO entre as afirmações da aula. */
  id: string;
  /** a frase que a aula ensina (exibida como afirmação). */
  statement: string;
  /** pergunta de múltipla escolha sobre a afirmação. */
  question: string;
  /** EXATAMENTE 4 opções, não vazias e ÚNICAS. */
  options: string[];
  /** índice da opção correta (inteiro 0..options.length-1). */
  answerIndex: number;
  /** feedback exibido ao aluno depois de responder. */
  feedback: string;
  /**
   * ADITIVO (onda 1 replan sectionId, REPLAN A1): id da seção de teoria
   * (`theory[].id`) que DEMONSTRA esta afirmação — a âncora que liga o quiz à
   * base teórica da aula (a ordem das assertions NÃO é a ordem das seções).
   * OPCIONAL: ausente = afirmação sem âncora declarada (trilhas antigas
   * carregam sem o campo); presente, DEVE ser kebab-case (SLUG_RE) e, quando o
   * loader conhece a aula, DEVE existir em `lesson.theory[].id`.
   */
  sectionId?: string;
}

export interface TrackSourceLink {
  title: string;
  url: string;
  description: string;
}

export interface TrackLessonSource {
  schemaVersion: number;
  slug: string;
  title: string;
  /** 1 frase — o que esta aula entrega. */
  summary: string;
  difficulty: number; // 1..5
  /** concept_ids que a aula trabalha. */
  concepts: string[];
  /** slugs de aulas ANTERIORES desta trilha — revisão quando o aluno não entender. */
  prerequisites: string[];
  /** base teórica apresentada em modo chat, seção a seção. */
  theory: TrackTheorySection[];
  /**
   * ADITIVO (onda 1 schema-quiz, §10 do docs/16-engine-de-trilha.md): até 3
   * AFIRMAÇÕES da aula — frases que a aula ensina, cada uma com quiz de
   * múltipla escolha (4 opções + resposta + feedback) que o aluno responde
   * durante a aula. A afirmação é da AULA (não por seção). Ausente ou [] =
   * aula SEM quiz (válido — trilhas antigas carregam sem o campo).
   */
  assertions?: TrackAssertion[];
  /** fontes do conteúdo — NUNCA exibidas no fluxo; botão "Fontes" na UI. */
  sources: TrackSourceLink[];
  /** slugs dos desafios da aula (challenges/<slug>/challenge.json). */
  challenges: string[];
}

export interface TrackModuleSource {
  schemaVersion: number;
  slug: string;
  title: string;
  order: number;
  /** slugs das aulas do módulo, na ordem da trilha. */
  lessons: string[];
  /**
   * ADITIVO (rodada 9): slug do DESAFIO DO MÓDULO (fim do módulo) — vive em
   * challenges/<slug>/challenge.json dentro da pasta do módulo. Ausente =
   * módulo sem desafio próprio.
   */
  challenge?: string;
}

export interface TrackSource {
  schemaVersion: number;
  slug: string;
  title: string;
  description: string;
  /**
   * A LÍNGUA DA PROSA (`pt-BR`/`en`) — o idioma em que a trilha está escrita.
   *
   * ARMADILHA DE NOME, e a razão de este comentário existir: `TrackSource.
   * language` e `TrackChallengeSource.language` são coisas DIFERENTES. Aqui é
   * idioma humano; lá é linguagem de programação. O §6 (linhas 918-927) mantém
   * os dois de propósito e batiza o novo para não haver dúvida:
   *
   *     "language": "pt-BR",              // idioma da PROSA (já existe, não confundir)
   *     "programmingLanguage": "python",  // NOVO: a linguagem que a trilha ensina
   *
   * Nunca escreva um id de adaptador aqui, e nunca leia este campo para
   * escolher parser.
   */
  language: 'pt-BR' | 'en';
  domain: 'programming' | 'math';
  /** slugs dos módulos, na ordem da trilha. */
  modules: string[];
  /**
   * ADITIVO (§6 linhas 918-927): A LINGUAGEM DE PROGRAMAÇÃO QUE A TRILHA
   * ENSINA — o id do adaptador (`engine/lang/registry.ts`) que audita toda a
   * trilha. NÃO confundir com `language` acima (idioma da prosa).
   *
   * OPCIONAL com default `DEFAULT_ADAPTER_ID` (`javascript`): as trilhas que
   * já estão no disco não declaram o campo, e invalidá-las seria mudança de
   * comportamento. Ausente = a trilha ensina a linguagem default.
   *
   * O loader confere que todo `challenge.language` RESOLVE para este mesmo
   * adaptador (§6 linhas 934-940) — ver `trackLoader.ts`.
   */
  programmingLanguage?: TrackChallengeLanguage;
  /**
   * ADITIVO (§6 linhas 918-927): TOOLCHAIN + VERSÃO PINADA (`cpython-3.14`,
   * `nodejs`). O §6 anota que "o inventário depende dela" — o enum de tipos de
   * nó que o orçamento usa é gerado pelo `inventory()` do adaptador, e esse
   * inventário muda com a versão do compilador/interpretador.
   *
   * OPCIONAL com default `DEFAULT_RUNTIME` (`nodejs`) pelo mesmo motivo de
   * `programmingLanguage`. Hoje NÃO é validado contra uma lista fechada: não
   * existe registro de runtimes, e inventar um seria fechar uma porta que o
   * §6 deixou aberta ("JavaScript rodando em Deno").
   */
  runtime?: string;
  /**
   * ADITIVO (§6 linhas 918-931): EM QUE LINGUAGEM OS `testsCode` SÃO
   * ESCRITOS. "É o que resolve o caso SQL/HTML/CSS, em que o desafio é escrito
   * numa linguagem e testado em outra. Quando ele difere de
   * `programmingLanguage`, a faixa RECEPTIVA passa a ser a união de dois
   * orçamentos, um por linguagem — e o gate precisa saber qual adaptador
   * aplicar a qual artefato."
   *
   * OPCIONAL com default = `programmingLanguage` (que por sua vez tem default
   * `javascript`). Divergir dos dois é legítimo e só passa a ter efeito quando
   * a álgebra de orçamento de duas faixas existir (§7 item 6: SQL/HTML/CSS
   * "não devem vir antes de a álgebra de orçamento estar estável").
   */
  harnessLanguage?: TrackChallengeLanguage;
  /**
   * ADITIVO (onda 1 context-validator): CRITÉRIOS DE ENTRADA da trilha — o que
   * o aluno precisa JÁ SABER antes de começar a trilha (ex.: 'somar dois
   * números de cabeça'). O validador pedagógico de desafios (challengeContext
   * validator) os usa como base do contexto: um desafio só pode cobrar os
   * critérios de entrada + o que as aulas anteriores e a atual ensinam.
   * Ausente ou vazio = trilha de senso INICIANTE (sem critérios — parte do
   * absoluto zero). Não há campo de critério por AULA: o critério de entrada
   * de cada aula é o CONCEITO da aula anterior, derivado da sequência pelo
   * próprio validador (nunca declarado no JSON).
   */
  entryCriteria?: string[];
}

// ---------------------------------------------------------------------------
// Resolução dos campos multilíngua (§6) — SEMPRE por estas funções
// ---------------------------------------------------------------------------
//
// Os três campos novos são OPCIONAIS no disco (nenhuma trilha existente os
// declara). Ler `track.programmingLanguage` cru e comparar com string levaria
// a `undefined !== 'nodejs'` e reprovaria a trilha inteira — por isso o default
// vive AQUI, num lugar só, e não espalhado em cada leitor.

/** A linguagem que a trilha ensina (default: o adaptador default). */
export function trackProgrammingLanguage(track: Pick<TrackSource, 'programmingLanguage'>): TrackChallengeLanguage {
  return track.programmingLanguage ?? DEFAULT_ADAPTER_ID;
}

/** A linguagem em que os testsCode são escritos (default: a da trilha). */
export function trackHarnessLanguage(
  track: Pick<TrackSource, 'programmingLanguage' | 'harnessLanguage'>,
): TrackChallengeLanguage {
  return track.harnessLanguage ?? trackProgrammingLanguage(track);
}

/** A toolchain pinada da trilha (default: o runtime do adaptador default). */
export function trackRuntime(track: Pick<TrackSource, 'runtime'>): string {
  return track.runtime ?? DEFAULT_RUNTIME;
}

/** Erro de validação: mensagem + caminho do arquivo (para o CLI e o loader). */
export interface TrackValidationIssue {
  file: string;
  message: string;
}

export interface TrackValidationResult {
  ok: boolean;
  issues: TrackValidationIssue[];
}

/**
 * Valida um slug canônico. Retorna a lista de problemas (vazia = ok) — nunca
 * lança; o loader decide como tratar.
 */
export function validateSlug(slug: unknown, file: string): TrackValidationIssue[] {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    return [{ file, message: `slug inválido: ${JSON.stringify(slug)} (esperado kebab-case ASCII, ex.: 'nodejs-do-zero')` }];
  }
  return [];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateNumber(v: unknown, file: string, label: string, min: number, max: number): TrackValidationIssue[] {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    return [{ file, message: `${label} inválido: ${JSON.stringify(v)} (esperado número ${min}..${max})` }];
  }
  return [];
}

/** Valida UM desafio (arquivo challenge.json ou proficiency.json). */
export function validateChallengeSource(raw: unknown, file: string): TrackValidationIssue[] {
  if (typeof raw !== 'object' || raw === null) return [{ file, message: 'não é um objeto JSON' }];
  const c = raw as Partial<TrackChallengeSource>;
  const issues: TrackValidationIssue[] = [];
  if (c.schemaVersion !== TRACK_SCHEMA_VERSION) {
    issues.push({ file, message: `schemaVersion inválido: ${JSON.stringify(c.schemaVersion)} (esperado ${TRACK_SCHEMA_VERSION})` });
  }
  issues.push(...validateSlug(c.slug, file));
  if (!isNonEmptyString(c.title)) issues.push({ file, message: 'title vazio' });
  if (!isNonEmptyString(c.concept) || !/^[a-z][a-z0-9_]{1,62}$/.test(c.concept)) {
    issues.push({ file, message: `concept inválido: ${JSON.stringify(c.concept)} (snake_case, ex.: 'variaveis')` });
  }
  issues.push(...validateNumber(c.difficulty, file, 'difficulty', 1, 5));
  // PERTINÊNCIA AO REGISTRO (era `c.language !== 'nodejs'`): o valor vale se, e
  // só se, ALGUM adaptador registrado o reivindica (`engine/lang/registry.ts`).
  // Fail-closed — token que nenhum adaptador reconhece NÃO cai no default: o
  // desafio seria auditado com o parser errado e o gate aprovaria qualquer
  // coisa. `'nodejs'` segue válido (é o runtime do adaptador `javascript`).
  if (adapterIdForChallengeLanguage(c.language) === null) {
    issues.push({
      file,
      message: `language inválido: ${JSON.stringify(c.language)} (somente ${listChallengeLanguages().map((l) => `'${l}'`).join(', ')})`,
    });
  }
  if (!isNonEmptyString(c.statement)) issues.push({ file, message: 'statement vazio' });
  // ADITIVO (rodada 9): desafio MULTI-ARQUIVO — cada entry precisa de path
  // seguro + starterCode string + solutionCode não-vazio; paths ÚNICOS;
  // mínimo 1 arquivo. Com files presente, os starter/solution DE TOPO deixam
  // de ser exigidos (o conteúdo vive nos arquivos).
  if (c.files !== undefined) {
    if (!Array.isArray(c.files) || c.files.length === 0) {
      issues.push({ file, message: 'files presente mas vazio (mínimo 1 arquivo)' });
    } else {
      const seen = new Set<string>();
      c.files.forEach((rawF, i) => {
        const f = rawF as Partial<TrackChallengeFileSource> | null;
        const p = f && typeof f === 'object' ? f.path : undefined;
        if (typeof p !== 'string' || !SAFE_FILE_PATH_RE.test(p)) {
          issues.push({ file, message: `files[${i}].path inválido: ${JSON.stringify(p)} (esperado caminho seguro ^[a-zA-Z0-9_\\-/]+\\.mjs$, ex.: 'lib/soma.mjs')` });
        } else if (seen.has(p)) {
          issues.push({ file, message: `files[${i}].path duplicado: ${JSON.stringify(p)} (paths devem ser únicos)` });
        } else {
          seen.add(p);
        }
        if (typeof f?.starterCode !== 'string') {
          issues.push({ file, message: `files[${i}].starterCode ausente` });
        }
        if (typeof f?.solutionCode !== 'string' || f.solutionCode.trim().length === 0) {
          issues.push({ file, message: `files[${i}].solutionCode vazio` });
        }
      });
    }
  } else {
    if (typeof c.starterCode !== 'string') issues.push({ file, message: 'starterCode ausente' });
    if (typeof c.solutionCode !== 'string' || c.solutionCode.trim().length === 0) issues.push({ file, message: 'solutionCode vazio' });
  }
  if (typeof c.testsCode !== 'string' || c.testsCode.trim().length === 0) issues.push({ file, message: 'testsCode vazio' });
  issues.push(...validateNumber(c.expectedTestCount, file, 'expectedTestCount', 1, 100));
  if (c.minFirstStarMs !== undefined) {
    issues.push(...validateNumber(c.minFirstStarMs, file, 'minFirstStarMs', 1, 3_600_000));
  }
  return issues;
}

/** Valida UMA seção de teoria. */
export function validateTheorySection(raw: unknown, file: string): TrackValidationIssue[] {
  if (typeof raw !== 'object' || raw === null) return [{ file, message: 'seção de teoria não é objeto' }];
  const s = raw as Partial<TrackTheorySection>;
  const issues: TrackValidationIssue[] = [];
  if (!isNonEmptyString(s.id)) issues.push({ file, message: 'seção sem id' });
  else if (!SLUG_RE.test(s.id)) issues.push({ file, message: `id de seção inválido: ${JSON.stringify(s.id)}` });
  if (!isNonEmptyString(s.title)) issues.push({ file, message: 'seção sem title' });
  if (!isNonEmptyString(s.markdown)) issues.push({ file, message: `seção ${JSON.stringify(s.id)} sem markdown` });
  if (s.code !== undefined) {
    const code = s.code as { language?: unknown; code?: unknown; explanation?: unknown };
    if (!isNonEmptyString(code.language) || !isNonEmptyString(code.code)) {
      issues.push({ file, message: `seção ${JSON.stringify(s.id)} com code malformado (language e code obrigatórios)` });
    }
  }
  return issues;
}

/** Nº MÁXIMO de afirmações por aula (requisito do dono do produto). */
export const MAX_ASSERTIONS_PER_LESSON = 3;

/**
 * ADITIVO (onda 1 schema-quiz): valida as AFIRMAÇÕES de uma aula (máx. 3 —
 * quiz de múltipla escolha). Retorna a lista de problemas (vazia = ok) —
 * nunca lança. Só é chamada quando `assertions` está PRESENTE; ausência é
 * válida (aula sem quiz).
 *
 * REPLAN A1: `theoryIds` OPCIONAL — a lista de `lesson.theory[].id` da aula.
 * Quando fornecida (o loader/validador de aula conhece a teoria), o
 * `sectionId` de cada afirmação DEVE existir nela (âncora da afirmação à
 * seção que a demonstra). Sem `theoryIds`, valida-se só o formato kebab-case.
 */
export function validateAssertions(raw: unknown, file: string, theoryIds?: string[]): TrackValidationIssue[] {
  const issues: TrackValidationIssue[] = [];
  if (!Array.isArray(raw)) {
    return [{ file, message: `assertions inválido: ${JSON.stringify(raw)} (esperado array, máx. ${MAX_ASSERTIONS_PER_LESSON})` }];
  }
  if (raw.length > MAX_ASSERTIONS_PER_LESSON) {
    issues.push({ file, message: `assertions com ${raw.length} itens (máximo ${MAX_ASSERTIONS_PER_LESSON} por aula)` });
  }
  const seenIds = new Set<string>();
  raw.forEach((rawA, i) => {
    const prefix = `assertions[${i}]`;
    if (typeof rawA !== 'object' || rawA === null) {
      issues.push({ file, message: `${prefix} não é objeto` });
      return;
    }
    const a = rawA as Partial<TrackAssertion>;
    if (!isNonEmptyString(a.id)) {
      issues.push({ file, message: `${prefix}.id ausente/vazio` });
    } else if (!SLUG_RE.test(a.id)) {
      issues.push({ file, message: `${prefix}.id inválido: ${JSON.stringify(a.id)} (esperado kebab-case ASCII, ex.: 'variavel-guarda-valor')` });
    } else if (seenIds.has(a.id)) {
      issues.push({ file, message: `${prefix}.id duplicado: ${JSON.stringify(a.id)} (ids devem ser únicos)` });
    } else {
      seenIds.add(a.id);
    }
    if (!isNonEmptyString(a.statement)) issues.push({ file, message: `${prefix}.statement vazio` });
    if (!isNonEmptyString(a.question)) issues.push({ file, message: `${prefix}.question vazio` });
    if (!Array.isArray(a.options) || a.options.length !== 4) {
      issues.push({ file, message: `${prefix}.options inválido (esperado array com EXATAMENTE 4 opções)` });
    } else {
      const seenOpts = new Set<string>();
      a.options.forEach((o, j) => {
        if (!isNonEmptyString(o)) {
          issues.push({ file, message: `${prefix}.options[${j}] vazio` });
        } else if (seenOpts.has(o)) {
          issues.push({ file, message: `${prefix}.options[${j}] duplicada: ${JSON.stringify(o)} (opções devem ser únicas)` });
        } else {
          seenOpts.add(o);
        }
      });
    }
    // answerIndex: inteiro DENTRO da faixa das opções reais (0..len-1).
    const optLen = Array.isArray(a.options) ? a.options.length : 0;
    if (a.answerIndex === undefined) {
      issues.push({ file, message: `${prefix}.answerIndex ausente` });
    } else if (!Number.isInteger(a.answerIndex) || a.answerIndex < 0 || a.answerIndex >= optLen) {
      issues.push({ file, message: `${prefix}.answerIndex inválido: ${JSON.stringify(a.answerIndex)} (esperado inteiro 0..${Math.max(0, optLen - 1)})` });
    }
    if (!isNonEmptyString(a.feedback)) issues.push({ file, message: `${prefix}.feedback vazio` });
    // ADITIVO (REPLAN A1): sectionId OPCIONAL — presente, DEVE ser kebab-case
    // (SLUG_RE) e, com theoryIds conhecidos, DEVE existir em lesson.theory[].id
    // (a seção que DEMONSTRA a afirmação). Ausente = sem âncora declarada.
    if (a.sectionId !== undefined) {
      if (!isNonEmptyString(a.sectionId) || !SLUG_RE.test(a.sectionId)) {
        issues.push({ file, message: `${prefix}.sectionId inválido: ${JSON.stringify(a.sectionId)} (esperado kebab-case ASCII, ex.: 'a-maquina-que-confere')` });
      } else if (theoryIds !== undefined && !theoryIds.includes(a.sectionId)) {
        issues.push({ file, message: `${prefix}.sectionId desconhecido: ${JSON.stringify(a.sectionId)} (não existe em lesson.theory[].id — a afirmação precisa ancorar numa seção de teoria da aula)` });
      }
    }
  });
  return issues;
}

/** Valida UMA aula. `lessonDir` = dir da aula (resolução de challenges/). */
export function validateLessonSource(raw: unknown, file: string): TrackValidationIssue[] {
  if (typeof raw !== 'object' || raw === null) return [{ file, message: 'não é um objeto JSON' }];
  const l = raw as Partial<TrackLessonSource>;
  const issues: TrackValidationIssue[] = [];
  if (l.schemaVersion !== TRACK_SCHEMA_VERSION) {
    issues.push({ file, message: `schemaVersion inválido: ${JSON.stringify(l.schemaVersion)} (esperado ${TRACK_SCHEMA_VERSION})` });
  }
  issues.push(...validateSlug(l.slug, file));
  if (!isNonEmptyString(l.title)) issues.push({ file, message: 'title vazio' });
  if (!isNonEmptyString(l.summary)) issues.push({ file, message: 'summary vazio' });
  issues.push(...validateNumber(l.difficulty, file, 'difficulty', 1, 5));
  if (!Array.isArray(l.concepts)) issues.push({ file, message: 'concepts ausente (array)' });
  if (!Array.isArray(l.prerequisites)) issues.push({ file, message: 'prerequisites ausente (array)' });
  if (!Array.isArray(l.sources)) issues.push({ file, message: 'sources ausente (array)' });
  if (!Array.isArray(l.challenges)) issues.push({ file, message: 'challenges ausente (array)' });
  if (!Array.isArray(l.theory) || l.theory.length === 0) {
    issues.push({ file, message: 'theory ausente/vazia (a aula precisa de base teórica)' });
  } else {
    l.theory.forEach((s, i) => issues.push(...validateTheorySection(s, `${file}#theory[${i}]`)));
  }
  if (Array.isArray(l.sources)) {
    l.sources.forEach((s, i) => {
      if (typeof s !== 'object' || s === null || !isNonEmptyString((s as TrackSourceLink).url) || !isNonEmptyString((s as TrackSourceLink).title)) {
        issues.push({ file, message: `sources[${i}] malformada (title e url obrigatórios)` });
      }
    });
  }
  // ADITIVO (onda 1 schema-quiz): assertions OPCIONAL — presente, valida o
  // shape (array, máx. 3, ids únicos, quiz bem formado); AUSENTE = aula sem
  // quiz (válido, trilhas antigas continuam passando com 0 issues).
  // REPLAN A1: passa os ids das seções de teoria da aula — o sectionId de cada
  // afirmação DEVE existir em theory[].id (a seção que DEMONSTRA a afirmação).
  if (l.assertions !== undefined) {
    const theoryIds = Array.isArray(l.theory) ? l.theory.map((s) => s.id) : undefined;
    issues.push(...validateAssertions(l.assertions, file, theoryIds));
  }
  return issues;
}

/** Valida UM módulo. */
export function validateModuleSource(raw: unknown, file: string): TrackValidationIssue[] {
  if (typeof raw !== 'object' || raw === null) return [{ file, message: 'não é um objeto JSON' }];
  const m = raw as Partial<TrackModuleSource>;
  const issues: TrackValidationIssue[] = [];
  if (m.schemaVersion !== TRACK_SCHEMA_VERSION) {
    issues.push({ file, message: `schemaVersion inválido: ${JSON.stringify(m.schemaVersion)} (esperado ${TRACK_SCHEMA_VERSION})` });
  }
  issues.push(...validateSlug(m.slug, file));
  if (!isNonEmptyString(m.title)) issues.push({ file, message: 'title vazio' });
  issues.push(...validateNumber(m.order, file, 'order', 1, 999));
  if (!Array.isArray(m.lessons) || m.lessons.length === 0) {
    issues.push({ file, message: 'lessons ausente/vazio (o módulo precisa de aulas)' });
  }
  // ADITIVO (rodada 9): desafio do módulo — slug declarado precisa ser válido
  // (a INTEGRIDADE do arquivo é conferida pelo loader).
  if (m.challenge !== undefined) {
    issues.push(...validateSlug(m.challenge, file));
  }
  return issues;
}

/** Valida a raiz da trilha. */
export function validateTrackSource(raw: unknown, file: string): TrackValidationIssue[] {
  if (typeof raw !== 'object' || raw === null) return [{ file, message: 'não é um objeto JSON' }];
  const t = raw as Partial<TrackSource>;
  const issues: TrackValidationIssue[] = [];
  if (t.schemaVersion !== TRACK_SCHEMA_VERSION) {
    issues.push({ file, message: `schemaVersion inválido: ${JSON.stringify(t.schemaVersion)} (esperado ${TRACK_SCHEMA_VERSION})` });
  }
  issues.push(...validateSlug(t.slug, file));
  if (!isNonEmptyString(t.title)) issues.push({ file, message: 'title vazio' });
  if (!isNonEmptyString(t.description)) issues.push({ file, message: 'description vazio' });
  if (t.language !== 'pt-BR' && t.language !== 'en') issues.push({ file, message: `language inválido: ${JSON.stringify(t.language)}` });
  if (t.domain !== 'programming' && t.domain !== 'math') issues.push({ file, message: `domain inválido: ${JSON.stringify(t.domain)}` });
  if (!Array.isArray(t.modules) || t.modules.length === 0) {
    issues.push({ file, message: 'modules ausente/vazio (a trilha precisa de módulos)' });
  }
  // ADITIVO (§6 linhas 918-927): programmingLanguage / runtime / harnessLanguage.
  // OPCIONAIS (as trilhas do disco não os declaram); PRESENTES, fail-closed —
  // uma trilha que declara uma linguagem sem adaptador seria auditada com o
  // parser errado, que é exatamente o furo que o §6 existe para fechar.
  for (const campo of ['programmingLanguage', 'harnessLanguage'] as const) {
    const valor = t[campo];
    if (valor === undefined) continue;
    if (adapterIdForChallengeLanguage(valor) === null) {
      issues.push({
        file,
        message: `${campo} inválido: ${JSON.stringify(valor)} (somente ${listChallengeLanguages().map((l) => `'${l}'`).join(', ')})`,
      });
    }
  }
  if (t.runtime !== undefined && !isNonEmptyString(t.runtime)) {
    issues.push({ file, message: `runtime inválido: ${JSON.stringify(t.runtime)} (esperado texto não vazio, ex.: 'nodejs')` });
  }
  // ADITIVO (onda 1 context-validator): entryCriteria OPCIONAL — quando
  // presente, precisa ser um array de strings NÃO vazias (critério em branco
  // não ensina nada). Ausente OU vazio é válido: trilha de senso iniciante.
  if (t.entryCriteria !== undefined) {
    if (!Array.isArray(t.entryCriteria)) {
      issues.push({ file, message: 'entryCriteria inválido (esperado array de strings)' });
    } else {
      t.entryCriteria.forEach((c, i) => {
        if (!isNonEmptyString(c)) {
          issues.push({ file, message: `entryCriteria[${i}] vazio (cada critério deve ser texto não vazio)` });
        }
      });
    }
  }
  return issues;
}
