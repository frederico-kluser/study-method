/**
 * app/electron/main/engine/research/surfBrief.ts — O BRIEF ADAPTADO e a linha
 * de comando do surf.
 *
 * O QUE ESTE ARQUIVO FAZ (tudo PURO — nenhuma função aqui toca processo, rede
 * ou disco):
 *   1. `ContextoDaTrilha` — o contexto REAL da trilha naquele ponto do
 *      currículo: assunto, linguagem-alvo, público, unidade sendo escrita,
 *      objetivo, e o que JÁ foi ensinado até ali.
 *   2. `montarBrief` — do contexto para os quatro campos que o surf aceita
 *      (`--task`, `--goal`, `--insights`, `--deliverable`) + a pergunta. O
 *      brief MUDA por camada: a camada 1 levanta o terreno, a camada N ataca
 *      UMA lacuna nomeada pela análise da colheita anterior.
 *   3. `montarArgv` — o vetor de argumentos. VETOR, nunca string de shell:
 *      o brief carrega aspas, acentos e barras vindos do currículo, e
 *      concatenar isso numa linha de shell é um bug de quoting esperando
 *      acontecer. Mesma disciplina do `nodeExec` de `services/challengeExec.ts`
 *      e do adaptador Python (`lang/python.ts`, decisão 2: "o fonte vai pelo
 *      stdin, nunca por -c").
 *
 * O QUE ELE NÃO FAZ: não escolhe QUANTAS camadas rodar (isso é `camadas.ts`),
 * não interpreta saída (isso é `surfRunner.ts`).
 *
 * ─── POR QUE O BRIEF É O QUE SEPARA RESPOSTA ÚTIL DE GENÉRICA ───────────────
 * O `--help` do surf diz, sobre os quatro campos: "all optional, all worth
 * writing — they are what make the answer usable instead of generic". Na
 * execução real medida em 2026-09-05, o `plan.restated_objective` do envelope
 * voltou LITERALMENTE igual ao `--goal` que foi passado — ou seja, o brief é
 * lido e vira o objetivo do plano. Um brief fixo produziria o mesmo plano para
 * a aula 1 e para a aula 300 da mesma trilha; por isso ele é montado do
 * contexto, e por isso `jaEnsinado` entra em `--insights`: é o que impede a
 * pesquisa de voltar com o que a trilha já ensinou.
 *
 * ─── O ANTI-PADRÃO QUE NÃO PODE VOLTAR ──────────────────────────────────────
 * `docs/16-engine-de-trilha.md` §7, citado em
 * `services/challengeContextValidator.ts:26-40`: "nada de 'pense
 * profundamente, passo a passo' em modelo com raciocínio nativo — o controle de
 * profundidade é parâmetro, não texto". Aqui isso vale duas vezes:
 *
 *   - para o LLM da engine (GLM 5.3 Flash), profundidade é
 *     `OPENROUTER_REASONING = { enabled: true, effort: 'max' }`
 *     (`shared/llm/constants.ts:54`), aplicada por padrão pelo transporte;
 *   - para o surf, profundidade é `--max-depth` / `--max-rounds` / a escolha
 *     entre `surf-search-normal` e `surf-search-unlimit`. É PARÂMETRO também.
 *
 * `montarBrief` REJEITA (fail-closed) qualquer campo do contexto que carregue
 * o imperativo — se alguém colar "pense profundamente" no objetivo de uma
 * aula, o brief não é montado. Limite declarado: a lista é de FORMAS
 * IMPERATIVAS conhecidas, não um detector semântico; "passo a passo" sozinho
 * NÃO é proibido, porque é prosa didática legítima ("um roteiro passo a
 * passo") e proibi-la faria a checagem reprovar contexto bom.
 */

import { PESQUISA_CODES, PesquisaError } from './errors';

// ─── contexto real da trilha ────────────────────────────────────────────────

/**
 * O contexto do ponto do currículo que está sendo pesquisado. Todos os campos
 * de texto são OBRIGATÓRIOS e não-vazios — menos `jaEnsinado`, que é
 * legitimamente vazio na primeira aula (a trilha de Python começa em
 * `print("oi")` e nada mais).
 */
export interface ContextoDaTrilha {
  /** o assunto da trilha inteira (ex.: "Python do zero ao sênior"). */
  tema: string;
  /** linguagem-alvo do material (ex.: "python"). */
  linguagem: string;
  /** para quem é (ex.: "quem nunca programou na vida"). */
  publico: string;
  /** a unidade sendo escrita agora (título do módulo/aula). */
  unidade: string;
  /** o que ESTA unidade tem que entregar. */
  objetivo: string;
  /** o que o currículo JÁ ensinou até aqui. Vazio = primeira unidade. */
  jaEnsinado: string[];
  /** idioma do material produzido. Default: 'pt-BR'. */
  idioma?: string;
}

/** Um brief pronto para virar argumentos do surf. */
export interface BriefDoSurf {
  question: string;
  task: string;
  goal: string;
  insights: string;
  deliverable: string;
}

/** A camada que está sendo montada. */
export type TipoDeCamada = 'levantamento' | 'aprofundamento';

/** Uma lacuna nomeada pela análise da colheita — o alvo de uma camada N>1. */
export interface Lacuna {
  id: string;
  /** a pergunta que a camada anterior deixou em aberto. */
  pergunta: string;
  /** por que ela importa para ESTA unidade do currículo. */
  porque: string;
}

// ─── o anti-padrão declarado ────────────────────────────────────────────────

/**
 * Formas IMPERATIVAS de "pense profundamente / passo a passo" — pt-BR e en.
 * Cada uma é o pedido de PROFUNDIDADE em texto, que nesta arquitetura é
 * parâmetro. A lista é fechada e declarada: não é detector semântico.
 */
export const IMPERATIVOS_DE_PROFUNDIDADE: readonly RegExp[] = [
  /\bpense\s+profundamente\b/i,
  /\bpensar\s+profundamente\b/i,
  /\bpense\s+(?:com\s+calma\s+)?passo\s+a\s+passo\b/i,
  /\braciocine\s+passo\s+a\s+passo\b/i,
  /\brefl(?:i|e)ta\s+profundamente\b/i,
  /\bthink\s+deeply\b/i,
  /\bthink\s+step[-\s]by[-\s]step\b/i,
  /\breason\s+step[-\s]by[-\s]step\b/i,
  /\blet'?s\s+think\s+step[-\s]by[-\s]step\b/i,
  /\bchain[-\s]of[-\s]thought\b/i,
  /\bcadeia\s+de\s+pensamento\b/i,
];

/** true quando o texto reintroduz o anti-padrão. Função PURA. */
export function contemImperativoDeProfundidade(texto: string): boolean {
  const t = typeof texto === 'string' ? texto : '';
  return IMPERATIVOS_DE_PROFUNDIDADE.some((re) => re.test(t));
}

// ─── validação do contexto (fail-closed, ANTES de qualquer trabalho) ────────

const CAMPOS_TEXTO: readonly (keyof ContextoDaTrilha)[] = [
  'tema',
  'linguagem',
  'publico',
  'unidade',
  'objetivo',
];

/**
 * Valida o contexto. Lança `PesquisaError` CONTEXTO_INVALIDO (campo vazio) ou
 * IMPERATIVO_DE_PROFUNDIDADE (anti-padrão reintroduzido). Nunca "conserta"
 * campo faltando com default — brief genérico é o defeito que este módulo
 * existe para evitar.
 */
export function validarContexto(ctx: ContextoDaTrilha): void {
  if (typeof ctx !== 'object' || ctx === null) {
    throw new PesquisaError({
      code: PESQUISA_CODES.CONTEXTO_INVALIDO,
      message: 'contexto da trilha ausente — sem contexto o brief sai genérico e a pesquisa não serve',
    });
  }
  for (const campo of CAMPOS_TEXTO) {
    const valor = ctx[campo];
    if (typeof valor !== 'string' || valor.trim() === '') {
      throw new PesquisaError({
        code: PESQUISA_CODES.CONTEXTO_INVALIDO,
        message: `contexto da trilha sem \`${String(campo)}\` — campo obrigatório do brief`,
        details: { campo: String(campo) },
      });
    }
  }
  if (!Array.isArray(ctx.jaEnsinado)) {
    throw new PesquisaError({
      code: PESQUISA_CODES.CONTEXTO_INVALIDO,
      message: '`jaEnsinado` tem que ser um array (vazio é válido: primeira unidade da trilha)',
    });
  }
  const textos = [
    ...CAMPOS_TEXTO.map((c) => String(ctx[c])),
    ...ctx.jaEnsinado.filter((x) => typeof x === 'string'),
  ];
  for (const t of textos) {
    if (contemImperativoDeProfundidade(t)) {
      throw new PesquisaError({
        code: PESQUISA_CODES.IMPERATIVO_DE_PROFUNDIDADE,
        message:
          'o contexto reintroduz o imperativo de profundidade no texto ("pense profundamente / passo a passo"). ' +
          'Profundidade nesta engine é PARÂMETRO: reasoning.effort para o LLM, --max-depth/--max-rounds para o surf',
        details: { trecho: t.slice(0, 120) },
      });
    }
  }
}

// ─── montagem do brief ──────────────────────────────────────────────────────

function listaCurta(itens: string[], teto: number): string {
  const limpos = itens.map((i) => i.trim()).filter((i) => i !== '');
  if (limpos.length === 0) return '';
  if (limpos.length <= teto) return limpos.join('; ');
  return `${limpos.slice(0, teto).join('; ')} (e mais ${limpos.length - teto})`;
}

/** Quantos itens de `jaEnsinado` cabem no `--insights` sem virar parede de texto. */
export const TETO_ITENS_JA_ENSINADO = 12;

/**
 * Monta o brief a partir do contexto. `alvo` só é usado — e é OBRIGATÓRIO —
 * quando a camada é de aprofundamento: uma camada N>1 existe para atacar UMA
 * lacuna, não para repetir a pergunta da camada 1 mais larga.
 */
export function montarBrief(
  ctx: ContextoDaTrilha,
  camada: TipoDeCamada,
  alvo?: Lacuna,
): BriefDoSurf {
  validarContexto(ctx);
  const idioma = (ctx.idioma ?? 'pt-BR').trim() || 'pt-BR';
  const jaEnsinado = listaCurta(ctx.jaEnsinado, TETO_ITENS_JA_ENSINADO);

  const task =
    `escrevendo a unidade "${ctx.unidade}" de uma trilha de ${ctx.linguagem} sobre ${ctx.tema}, ` +
    `para ${ctx.publico}; o material sai em ${idioma} e cada afirmação dele precisa citar a fonte de onde veio`;

  const insightsBase =
    jaEnsinado === ''
      ? 'esta é a PRIMEIRA unidade da trilha: o leitor ainda não viu nada da linguagem, ' +
        'então qualquer conteúdo que pressuponha conhecimento anterior está fora'
      : `o currículo já ensinou, nesta ordem: ${jaEnsinado}. ` +
        'Conteúdo já coberto não é achado novo; o que interessa é o que ainda não foi ensinado';

  if (camada === 'levantamento') {
    return {
      question: `${ctx.objetivo} — em ${ctx.linguagem}`,
      task,
      goal:
        `levantar o terreno de "${ctx.unidade}": quais construções e APIs de ${ctx.linguagem} ` +
        `esta unidade precisa, o que a documentação oficial define, e quais erros e concepções ` +
        `alternativas ${ctx.publico} comete nesse ponto`,
      insights: `${insightsBase}. Trate isto como hipótese a verificar, não como fato dado`,
      deliverable:
        'uma lista de fatos verificáveis, cada um com o número de citação da fonte que o sustenta; ' +
        'documentação oficial da linguagem separada de material de terceiros; ' +
        'e uma lista explícita do que ficou sem resposta',
    };
  }

  if (!alvo || typeof alvo.pergunta !== 'string' || alvo.pergunta.trim() === '') {
    throw new PesquisaError({
      code: PESQUISA_CODES.CONFIG_INVALIDA,
      message:
        'camada de aprofundamento sem lacuna alvo — uma camada N>1 ataca UMA lacuna nomeada, ' +
        'nunca repete a busca da camada anterior mais larga',
    });
  }
  if (contemImperativoDeProfundidade(alvo.pergunta) || contemImperativoDeProfundidade(alvo.porque ?? '')) {
    throw new PesquisaError({
      code: PESQUISA_CODES.IMPERATIVO_DE_PROFUNDIDADE,
      message: 'a lacuna carrega o imperativo de profundidade no texto — profundidade é parâmetro, não prompt',
      details: { lacuna: alvo.id },
    });
  }

  return {
    question: alvo.pergunta.trim(),
    task,
    goal:
      `fechar UMA lacuna que a camada anterior deixou aberta na unidade "${ctx.unidade}": ` +
      `${alvo.porque?.trim() || 'a camada anterior não achou evidência suficiente sobre isto'}`,
    insights:
      `${insightsBase}. A camada anterior já cobriu o panorama de "${ctx.unidade}" — ` +
      'repetir a busca larga não acrescenta nada; o que falta é evidência específica sobre esta lacuna',
    deliverable:
      'evidência direta sobre a lacuna, com citação por afirmação, preferindo a documentação oficial ' +
      'e a especificação; se a lacuna não tiver resposta pública, diga isso em vez de aproximar',
  };
}

// ─── montagem do comando ────────────────────────────────────────────────────

/** Os dois binários do surf, como eles se chamam no PATH. */
export const BIN_SURF = {
  /** UMA onda, auto-orçada para caber no timeout do harness. */
  normal: 'surf-search-normal',
  /** ondas até saturar — profundidade REAL, sem orçamento de tempo. */
  unlimit: 'surf-search-unlimit',
} as const;

export type FerramentaDoSurf = keyof typeof BIN_SURF;

/** Teto de `--sub-agents` aceito pelo surf (medido no `--help`: max 20). */
export const MAX_SUB_AGENTS = 20;
/** Teto de `--max-depth` aceito pelo surf (medido no `--help`: max 6). */
export const MAX_DEPTH = 6;
/** Teto de `--max-rounds` do `surf-search-unlimit` (medido no `--help`: hard cap 50). */
export const MAX_ROUNDS = 50;

export interface OpcoesDoComando {
  ferramenta: FerramentaDoSurf;
  /** largura da onda (1..20). */
  subAgents: number;
  /** até onde um ramo desce (1..6). Opcional: ausente = default do surf. */
  maxDepth?: number;
  /** teto de ondas — só faz sentido no `unlimit` (1..50). */
  maxRounds?: number;
  /** binário alternativo (teste/instalação fora do PATH). */
  binario?: string;
}

/**
 * Brief + opções → argv. `--json` é SEMPRE passado: sem ele a saída é markdown
 * e a procedência viraria texto para regex. `--quiet` NÃO é passado de
 * propósito: o stderr do surf é onde ele explica, em tempo real, uma etapa
 * degradada, e essa explicação vai para os `details` do erro estruturado.
 */
export function montarArgv(brief: BriefDoSurf, opcoes: OpcoesDoComando): { bin: string; args: string[] } {
  if (!brief || typeof brief.question !== 'string' || brief.question.trim() === '') {
    throw new PesquisaError({
      code: PESQUISA_CODES.CONFIG_INVALIDA,
      message: 'brief sem pergunta — o surf recusaria com exit 2 (usage)',
    });
  }
  if (!Number.isInteger(opcoes.subAgents) || opcoes.subAgents < 1 || opcoes.subAgents > MAX_SUB_AGENTS) {
    throw new PesquisaError({
      code: PESQUISA_CODES.CONFIG_INVALIDA,
      message: `subAgents fora de 1..${MAX_SUB_AGENTS} (o surf recusa com exit 2)`,
      details: { subAgents: opcoes.subAgents },
    });
  }
  if (opcoes.maxDepth !== undefined) {
    if (!Number.isInteger(opcoes.maxDepth) || opcoes.maxDepth < 1 || opcoes.maxDepth > MAX_DEPTH) {
      throw new PesquisaError({
        code: PESQUISA_CODES.CONFIG_INVALIDA,
        message: `maxDepth fora de 1..${MAX_DEPTH}`,
        details: { maxDepth: opcoes.maxDepth },
      });
    }
  }
  if (opcoes.maxRounds !== undefined) {
    if (opcoes.ferramenta !== 'unlimit') {
      throw new PesquisaError({
        code: PESQUISA_CODES.CONFIG_INVALIDA,
        message: '`--max-rounds` só existe no surf-search-unlimit (o normal roda UMA onda por design)',
      });
    }
    if (!Number.isInteger(opcoes.maxRounds) || opcoes.maxRounds < 1 || opcoes.maxRounds > MAX_ROUNDS) {
      throw new PesquisaError({
        code: PESQUISA_CODES.CONFIG_INVALIDA,
        message: `maxRounds fora de 1..${MAX_ROUNDS}`,
        details: { maxRounds: opcoes.maxRounds },
      });
    }
  }
  const texto = [brief.question, brief.task, brief.goal, brief.insights, brief.deliverable];
  for (const t of texto) {
    if (contemImperativoDeProfundidade(t)) {
      throw new PesquisaError({
        code: PESQUISA_CODES.IMPERATIVO_DE_PROFUNDIDADE,
        message: 'o brief carrega o imperativo de profundidade — profundidade é parâmetro (--max-depth/--max-rounds)',
        details: { trecho: t.slice(0, 120) },
      });
    }
  }

  const args = [
    brief.question,
    '--task',
    brief.task,
    '--goal',
    brief.goal,
    '--insights',
    brief.insights,
    '--deliverable',
    brief.deliverable,
    `--sub-agents=${opcoes.subAgents}`,
    '--json',
  ];
  if (opcoes.maxDepth !== undefined) args.push('--max-depth', String(opcoes.maxDepth));
  if (opcoes.maxRounds !== undefined) args.push('--max-rounds', String(opcoes.maxRounds));

  return { bin: opcoes.binario ?? BIN_SURF[opcoes.ferramenta], args };
}

/**
 * Normalização de query para o anti-repetição — a MESMA régua do surf
 * (`src/lib/ai/ledger.mjs`, `normQuery`: minúsculas, espaços colapsados,
 * aparado). Repetir a régua dele é o que faz "esta pergunta já foi feita"
 * significar a mesma coisa dos dois lados.
 */
export function normalizarPergunta(q: string): string {
  return String(q ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Descarta as lacunas que só repetem uma query já executada. É isto que faz a
 * camada seguinte ser PROFUNDIDADE e não a mesma busca de novo.
 */
export function filtrarLacunasRepetidas(
  lacunas: Lacuna[],
  perguntasJaFeitas: string[],
): { manter: Lacuna[]; descartadas: { id: string; motivo: string }[] } {
  const feitas = new Set(perguntasJaFeitas.map(normalizarPergunta));
  const manter: Lacuna[] = [];
  const descartadas: { id: string; motivo: string }[] = [];
  for (const l of lacunas) {
    const chave = normalizarPergunta(l.pergunta);
    if (chave === '') {
      descartadas.push({ id: l.id, motivo: 'lacuna sem pergunta' });
      continue;
    }
    if (feitas.has(chave)) {
      descartadas.push({ id: l.id, motivo: 'a pergunta já foi executada numa camada anterior' });
      continue;
    }
    feitas.add(chave);
    manter.push(l);
  }
  return { manter, descartadas };
}
