/**
 * app/electron/main/engine/revision/progressiva.ts — a REVISÃO PROGRESSIVA
 * (onda 5) — o núcleo do pedido original do dono.
 *
 * O dono pediu: "QUERO UM ALGORITMO que analisa o teste com um código com o
 * mínimo necessário para passar no teste (gerado numa etapa de validação para
 * ver se o teste realmente tem solução); e pelo código que passa no teste, vai
 * extrair tudo que REALMENTE é cobrado no teste e aí ver se aquela aula
 * precisa ser mais quebrada ou não; se for o caso não perdemos o que foi
 * gerado, é retornado o Feedback para a aula e carregamos isso na memória para
 * reavaliar o restante do curso e progressivamente da primeira aula até a
 * última faremos uma revisão reajustando tudo que tiver errado, e ao final
 * repetirmos a revisão quantas mais forem necessárias vezes até que a aula
 * tenha cobrado apenas o que oferece."
 *
 * Este módulo é a materialização determinística desse algoritmo. As peças
 * geradas nas ondas anteriores entram aqui fechadas num CONTRATO:
 *
 *   - `quality/minimal.ts` (sintetizarCodigoMinimo) — o VALIDADOR: produz o
 *     código MÍNIMO que passa no teste (zero LLM). É a "etapa de validação
 *     para ver se o teste realmente tem solução";
 *   - `quality/requirements.ts` (validarRequirements) — o SINAL SECUNDÁRIO:
 *     gaps na bijeção requirements declarados × test('…') são feedback de
 *     AJUSTE, nunca motivo de SPLIT;
 *   - `budget.ts` (deriveTrackBudget, modo declared) — o ORÇAMENTO por aula:
 *     `introduces` declarado no lesson.json (a mesma fonte do audit).
 *
 * REGRAS FECHADAS (REPLAN A4 — este arquivo as implementa LITERALMENTE):
 *
 *   LACUNA      = `atoms(minimal)` ⊄ (productive ∪ receptive) da aula
 *                 (SEMPRE `atoms`, NUNCA `atomsDoTeste`). LACUNA → candidato
 *                 a SPLIT.
 *   NÃO-REVISÁVEL = veredito não-ok (SEM_SOLUCAO_ACESSIVEL / PARSE_FALHOU /
 *                 PROVER_FALHOU): documentada, NUNCA loopa (fail-closed).
 *   EXCESSO     = `introduces.productive` não usado pelo mínimo → candidato a
 *                 REMOVER do introduces OU COBRIR com desafio. Excesso
 *                 RECEPTIVO é by-design (leitura não é cobrada por teste),
 *                 nunca conta como violação.
 *   MEMÓRIA     = o feedback da aula N vira contexto da N+1 (acumulador
 *                 `memoriaDeRevisao`); o relatório final registra o que foi
 *                 aprendido e reavaliado (progressividade).
 *   NADA SE PERDE = todo feedback é gravado: artefato JSON + markdown pt-BR +
 *                 seed do SPLIT (minimalCode + atoms) em disco.
 *   CONVERGÊNCIA = `rodarRevisaoAteConvergir({ maxIteracoes = 3 })`: varredura
 *                 repetida; hash do relatório igual entre iterações ⇒
 *                 convergiu; válvula anti-loop (maxIteracoes + estabilidade).
 *   SPLIT       = minimalCode+atoms persistidos como artefato e na memória; a
 *                 aula NOVA sai de sub-agente LLM com o minimalCode como
 *                 SEMENTE (fora deste módulo — zero LLM aqui). Sem LLM na
 *                 execução, o SPLIT é REGISTRADO como pendência no relatório
 *                 com o minimalCode pronto — o feedback nunca se perde.
 *
 * ZERO LLM NO NÚCLEO: tudo aqui é determinístico (mesma trilha + mesmo prover
 * ⇒ mesmo relatório). O prover é INJETADO (`ProverDeDesafio`) — produção usa
 * `criarProverDeDesafio` (spawn node --test); testes usam um fake que importa
 * o candidato via data URL (mesmo padrão da Onda 1).
 */

import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import type { LoadedTrack } from '../../content/trackLoader';
import type { TrackChallengeSource } from '../../content/trackTypes';
import type { AtomKey } from '../atomKeys';
import {
  BudgetSource,
  TrackBudget,
  deriveTrackBudget,
  pedagogicalOrder,
} from '../budget';
import { sintetizarCodigoMinimo, type MinimalVerdict } from '../quality/minimal';
import {
  validarRequirements,
  type RequirementDeclarado,
  type ValidacaoRequirements,
} from '../quality/requirements';
import type { ProverDeDesafio } from '../phases/f9Verifier';

// ---------------------------------------------------------------------------
// Contrato público
// ---------------------------------------------------------------------------

/** Decisão tomada para uma aula — registrada na memória (progressividade). */
export type DecisaoDeRevisao = 'ok' | 'split' | 'nao-revisavel';

export interface DecisaoRegistrada {
  aula: string;
  decisao: DecisaoDeRevisao;
  motivo: string;
}

/**
 * A MEMÓRIA da revisão: o acumulador que atravessa as aulas na ordem
 * (1ª → última). O feedback da aula N vira contexto da N+1.
 */
export interface MemoriaDeRevisao {
  /** ref `<moduleSlug>/<lessonSlug>` da aula revisada imediatamente antes. */
  aulaAnterior: string | null;
  /** átomos já sinalizados como LACUNA em qualquer aula anterior (sorted, únicos). */
  lacunasVistas: AtomKey[];
  /** histórico de decisões por aula, na ordem da varredura. */
  decisoes: DecisaoRegistrada[];
}

/**
 * Veredito de UM desafio: o veredito do sintetizador mínimo (`MinimalVerdict`)
 * ou `IGNORADO` (desafio multi-arquivo — fora do escopo desta onda; NÃO torna
 * a aula não-revisável).
 */
export type VereditoDeDesafio = MinimalVerdict | { ok: false; reason: 'IGNORADO'; detail: string };

/** Feedback de UM desafio dentro de uma aula. */
export interface FeedbackDeDesafio {
  slug: string;
  /** `<moduleSlug>/<lessonSlug>/<challengeSlug>`. */
  ref: string;
  veredito: VereditoDeDesafio;
  /** o código mínimo que passou no teste (presente quando veredito ok). */
  minimalCode?: string;
  /** `atoms(minimal)` — o que o teste REALMENTE cobra. */
  atomsCobrados: AtomKey[];
  /** LACUNA: atoms(minimal) ∖ (productive ∪ receptive) da aula. */
  foraDoOrcamento: AtomKey[];
  /** EXCESSO: introduces.productive não usado pelo mínimo. */
  excesso: AtomKey[];
  /**
   * SINAL SECUNDÁRIO: validação da bijeção requirements declarados ×
   * test('…'). Gaps aqui = feedback de AJUSTE, nunca motivo de SPLIT. null
   * quando o desafio não declara o campo `requirements`.
   */
  requirements: ValidacaoRequirements | null;
}

/** Feedback de UMA aula — a unidade que decide o SPLIT. */
export interface FeedbackDeAula {
  /** `<moduleSlug>/<lessonSlug>`. */
  aula: string;
  titulo: string;
  /** posição na ordem pedagógica (1-based). */
  indice: number;
  /** a memória VIGENTE na revisão desta aula (o feedback da aula anterior). */
  memoria: MemoriaDeRevisao;
  desafios: FeedbackDeDesafio[];
  /** true ⇔ alguma LACUNA (atoms do mínimo fora do orçamento) — candidato a SPLIT. */
  precisaQuebrar: boolean;
  /** motivo em pt-BR — sempre presente, sempre determinístico. */
  motivo: string;
  /**
   * true ⇔ algum veredito não-ok (SEM_SOLUCAO_ACESSIVEL/PARSE_FALHOU/
   * PROVER_FALHOU): aula NÃO-revisável, documentada, NUNCA loopa (fail-closed).
   */
  naoRevisavel?: boolean;
  naoRevisavelMotivo?: string;
}

/** Um SPLIT registrado como PENDÊNCIA — o que foi gerado NUNCA se perde. */
export interface SplitPendente {
  aula: string;
  desafio: string;
  /** a SEMENTE da aula nova: o código mínimo que passou no teste. */
  minimalCode: string;
  atoms: AtomKey[];
  foraDoOrcamento: AtomKey[];
}

export interface PlacarDeRevisao {
  aulas: number;
  /** revisáveis sem lacuna (precisaQuebrar=false). */
  cobertas: number;
  /** com lacuna → candidatas a SPLIT. */
  comLacuna: number;
  /** veredito não-ok → fail-closed, não-revisáveis. */
  naoRevisaveis: number;
  /** com ao menos um excesso (informacional — decisão de ajuste). */
  comExcesso: number;
  splitsPendentes: number;
}

export interface RelatorioDeRevisao {
  trackSlug: string;
  /** 'declared' (introduces do lesson.json) | 'inferred' | 'injetado' (tests). */
  orcamentoFonte: BudgetSource | 'injetado';
  aulas: FeedbackDeAula[];
  /** true ⇔ hash do relatório estável entre iterações. */
  convergencia: boolean;
  /** nº de iterações da varredura (2 = uma repetição estável). */
  iteracoes: number;
  placar: PlacarDeRevisao;
  /** a memória acumulada DEPOIS da última aula (o que foi aprendido). */
  memoriaFinal: MemoriaDeRevisao;
  /** todos os SPLITs registrados (minimalCode pronto — seed da aula nova). */
  splitsPendentes: SplitPendente[];
}

/** O orçamento de comparação de uma aula (mesma forma do `coverage` do CLI). */
export interface OrcamentoDeAula {
  productive: ReadonlySet<AtomKey>;
  receptive: ReadonlySet<AtomKey>;
  introducesProductive: AtomKey[];
  ref: string | null;
}

export interface RevisarCursoOptions {
  track: LoadedTrack;
  prover: ProverDeDesafio;
  /**
   * Injeta o orçamento por aula. Ausente ⇒ default: `deriveTrackBudget(track,
   * { mode: 'declared' })` — a MESMA fonte do audit em modo declared
   * (introduces do lesson.json).
   */
  orcamentoPorAula?: (lessonRef: string) => OrcamentoDeAula;
  /**
   * Rótulo da fonte do orçamento no relatório (o chamador que injeta o
   * orçamento sabe de onde ele veio). Default: 'injetado'.
   */
  orcamentoFonte?: BudgetSource | 'injetado';
  /** nº máximo de AULAS a revisar (amostra rápida). Default: todas. */
  limite?: number;
}

export interface RodarRevisaoOptions {
  /** a varredura do curso inteiro (uma iteração). */
  revisarCurso: () => Promise<RelatorioDeRevisao>;
  /** válvula anti-loop. Default 3. */
  maxIteracoes?: number;
}

export interface ResultadoGravacao {
  dir: string;
  arquivos: string[];
}

// ---------------------------------------------------------------------------
// Helpers (puros, determinísticos)
// ---------------------------------------------------------------------------

/** Orçamento de uma aula a partir do TrackBudget (mesma lógica do CLI coverage). */
function orcamentoDaAula(budget: TrackBudget, lessonRef: string): OrcamentoDeAula {
  const lb = budget.byRef.get(lessonRef);
  if (lb) {
    return {
      productive: lb.saida.productive,
      receptive: lb.saida.receptive,
      introducesProductive: lb.introduces.productive,
      ref: lb.ref,
    };
  }
  return { productive: new Set(), receptive: new Set(), introducesProductive: [], ref: null };
}

/** Leitura defensiva do campo aditivo `requirements` do challenge.json. */
function lerRequirementsDeclarados(challenge: TrackChallengeSource): RequirementDeclarado[] {
  const raw = (challenge as unknown as { requirements?: unknown }).requirements;
  if (!Array.isArray(raw)) return [];
  const out: RequirementDeclarado[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id === 'string' && typeof r.teste === 'string') {
      out.push({
        id: r.id,
        descricao: typeof r.descricao === 'string' ? r.descricao : undefined,
        teste: r.teste,
      });
    }
  }
  return out;
}

/**
 * SINAL SECUNDÁRIO (validarRequirements): gaps da bijeção = feedback de ajuste.
 * Fail-closed: teste que não parseia ⇒ validação com gap (nunca silêncio);
 * desafio sem campo `requirements` ⇒ null (não há bijeção para validar).
 */
function sinalSecundario(challenge: TrackChallengeSource): ValidacaoRequirements | null {
  const declarados = lerRequirementsDeclarados(challenge);
  if (declarados.length === 0) return null;
  try {
    return validarRequirements(challenge.testsCode, declarados);
  } catch {
    return { ok: false, semTeste: declarados.map((r) => r.id), testesSemRequirement: [], correspondencias: [] };
  }
}

/** Sorted + únicos. */
function uniqSorted(items: AtomKey[]): AtomKey[] {
  return [...new Set(items)].sort();
}

// ---------------------------------------------------------------------------
// Revisão de um desafio (zero LLM — usa o sintetizador mínimo + orçamento)
// ---------------------------------------------------------------------------

async function revisarDesafio(
  prover: ProverDeDesafio,
  aulaRef: string,
  ch: TrackChallengeSource,
  orc: OrcamentoDeAula,
): Promise<FeedbackDeDesafio> {
  const ref = `${aulaRef}/${ch.slug}`;

  // Desafio multi-arquivo: o sintetizador mínimo opera no arquivo único —
  // fora do escopo desta onda (mesmo tratamento do coverage). Não torna a aula
  // não-revisável.
  if (ch.files && ch.files.length > 0 && (ch.starterCode === undefined || ch.solutionCode === undefined)) {
    return {
      slug: ch.slug,
      ref,
      veredito: { ok: false, reason: 'IGNORADO', detail: 'desafio multi-arquivo (files) — fora do escopo desta onda' },
      atomsCobrados: [],
      foraDoOrcamento: [],
      excesso: [],
      requirements: null,
    };
  }

  const veredito = await sintetizarCodigoMinimo(prover, {
    starterCode: ch.starterCode ?? '',
    solutionCode: ch.solutionCode ?? '',
    testsCode: ch.testsCode,
    expectedTestCount: ch.expectedTestCount,
  });

  // Fail-closed: veredito não-ok é DOCUMENTADO no feedback; quem decide é a
  // aula (naoRevisavel) — nunca um vazio silencioso.
  if (!veredito.ok) {
    return {
      slug: ch.slug,
      ref,
      veredito,
      atomsCobrados: [],
      foraDoOrcamento: [],
      excesso: [],
      requirements: sinalSecundario(ch),
    };
  }

  // LACUNA = atoms(minimal) ⊄ (productive ∪ receptive) — SEMPRE `atoms`,
  // NUNCA `atomsDoTeste` (contrato A4).
  const foraDoOrcamento = uniqSorted(veredito.atoms.filter((a) => !orc.productive.has(a) && !orc.receptive.has(a)));
  // EXCESSO = introduces.productive não usado pelo mínimo (produtivo só;
  // excesso receptivo é by-design — leitura não é cobrada por teste).
  const excesso = uniqSorted(orc.introducesProductive.filter((a) => !veredito.atoms.includes(a)));

  return {
    slug: ch.slug,
    ref,
    veredito,
    minimalCode: veredito.minimalCode,
    atomsCobrados: veredito.atoms,
    foraDoOrcamento,
    excesso,
    requirements: sinalSecundario(ch),
  };
}

// ---------------------------------------------------------------------------
// revisarCurso — a varredura progressiva (1ª aula → última, memória acumulada)
// ---------------------------------------------------------------------------

/**
 * Percorre as aulas NA ORDEM pedagógica (1ª → última) com o acumulador
 * `memoriaDeRevisao`: o feedback da aula N vira contexto da N+1. Zero LLM —
 * determinístico: mesma trilha + mesmo prover ⇒ mesmo relatório.
 */
export async function revisarCurso(opts: RevisarCursoOptions): Promise<RelatorioDeRevisao> {
  const { track, prover } = opts;

  let orcamentoFonte: BudgetSource | 'injetado';
  let orcamentoPorAula: (lessonRef: string) => OrcamentoDeAula;
  if (opts.orcamentoPorAula) {
    orcamentoPorAula = opts.orcamentoPorAula;
    orcamentoFonte = opts.orcamentoFonte ?? 'injetado';
  } else {
    // A MESMA fonte do audit em modo declared: introduces do lesson.json.
    const budget = deriveTrackBudget(track, { mode: 'declared' });
    orcamentoFonte = budget.source;
    orcamentoPorAula = (lessonRef) => orcamentoDaAula(budget, lessonRef);
  }

  const aulas = pedagogicalOrder(track).slice(0, opts.limite ?? Number.MAX_SAFE_INTEGER);

  const memoria: MemoriaDeRevisao = { aulaAnterior: null, lacunasVistas: [], decisoes: [] };
  const feedbackAulas: FeedbackDeAula[] = [];
  const splitsPendentes: SplitPendente[] = [];

  for (const { moduleSlug, lessonSlug, lesson } of aulas) {
    const ref = `${moduleSlug}/${lessonSlug}`;
    const orc = orcamentoPorAula(ref);

    // SNAPSHOT da memória ANTES desta aula — é o "contexto da N+1" que o
    // relatório expõe por aula (o feedback da aula anterior, literalmente).
    const memoriaSnapshot: MemoriaDeRevisao = {
      aulaAnterior: memoria.aulaAnterior,
      lacunasVistas: [...memoria.lacunasVistas],
      decisoes: memoria.decisoes.map((d) => ({ ...d })),
    };

    const desafios: FeedbackDeDesafio[] = [];
    for (const ch of lesson.challenges) {
      desafios.push(await revisarDesafio(prover, ref, ch, orc));
    }

    // Predicado de tipo: veredito não-ok (fail-closed) EXCETO IGNORADO
    // (multi-arquivo — fora do escopo, não torna a aula não-revisável).
    const desafioNaoOk = (d: FeedbackDeDesafio): d is FeedbackDeDesafio & { veredito: Extract<VereditoDeDesafio, { ok: false }> } =>
      d.veredito.ok === false && d.veredito.reason !== 'IGNORADO';

    const naoRevisaveis = desafios.filter(desafioNaoOk);
    const comLacuna = desafios.filter((d) => d.foraDoOrcamento.length > 0);
    const comExcesso = desafios.filter((d) => d.excesso.length > 0);

    let precisaQuebrar = false;
    let motivo: string;
    let naoRevisavel: boolean | undefined;
    let naoRevisavelMotivo: string | undefined;

    if (naoRevisaveis.length > 0) {
      // Fail-closed: aula NÃO-revisável, documentada, NUNCA loopa. Nem SPLIT
      // (sem mínimo não há lacuna determinável).
      naoRevisavel = true;
      const razoes = naoRevisaveis.map((d) => `${d.slug} (${d.veredito.reason})`).join(', ');
      naoRevisavelMotivo =
        `veredito não-ok em ${naoRevisaveis.length} desafio(s): ${razoes}. ` +
        'A aula é NÃO-REVISÁVEL (fail-closed): o sintetizador mínimo não conseguiu provar solução, ' +
        'então nenhuma decisão de quebra é tomada e nada é reexecutado em loop.';
      motivo = naoRevisavelMotivo;
    } else if (comLacuna.length > 0) {
      precisaQuebrar = true;
      const lacunas = uniqSorted(comLacuna.flatMap((d) => d.foraDoOrcamento));
      const jaVistas = lacunas.filter((a) => memoria.lacunasVistas.includes(a));
      const progressividade =
        jaVistas.length > 0
          ? ` — ${jaVistas.join(', ')} já sinalizado(s) como lacuna na aula anterior (${memoria.aulaAnterior ?? '—'})`
          : '';
      motivo =
        `o teste cobra construção fora do orçamento da aula (${lacunas.join(', ')})${progressividade}. ` +
        'Candidato a SPLIT: o minimalCode e os atoms são preservados como artefato e registrados como pendência ' +
        '(a aula nova sai de sub-agente LLM com o minimalCode como semente — sem LLM, a pendência nunca se perde).';
      for (const d of comLacuna) {
        splitsPendentes.push({
          aula: ref,
          desafio: d.slug,
          minimalCode: d.minimalCode ?? '',
          atoms: d.atomsCobrados,
          foraDoOrcamento: d.foraDoOrcamento,
        });
      }
    } else if (comExcesso.length > 0) {
      motivo =
        `aula coberta pelo teste. EXCESSO (${comExcesso.flatMap((d) => d.excesso).length} átomo(s) de introduces.productive não usados pelo mínimo): ` +
        'candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).';
    } else {
      motivo = 'aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.';
    }

    // MEMÓRIA: registra a decisão e acumula as lacunas vistas (progressividade).
    const decisao: DecisaoDeRevisao = naoRevisavel === true ? 'nao-revisavel' : precisaQuebrar ? 'split' : 'ok';
    memoria.decisoes.push({ aula: ref, decisao, motivo });
    if (naoRevisavel === undefined) {
      for (const a of uniqSorted(comLacuna.flatMap((d) => d.foraDoOrcamento))) {
        if (!memoria.lacunasVistas.includes(a)) memoria.lacunasVistas.push(a);
      }
      memoria.lacunasVistas.sort();
    }
    memoria.aulaAnterior = ref;

    feedbackAulas.push({
      aula: ref,
      titulo: lesson.meta.title,
      indice: feedbackAulas.length + 1,
      memoria: memoriaSnapshot,
      desafios,
      precisaQuebrar,
      motivo,
      ...(naoRevisavel === true ? { naoRevisavel, naoRevisavelMotivo } : {}),
    });
  }

  return {
    trackSlug: track.root.slug,
    orcamentoFonte,
    aulas: feedbackAulas,
    convergencia: false,
    iteracoes: 0,
    placar: montarPlacar(feedbackAulas, splitsPendentes),
    memoriaFinal: memoria,
    splitsPendentes,
  };
}

function montarPlacar(aulas: FeedbackDeAula[], splits: SplitPendente[]): PlacarDeRevisao {
  return {
    aulas: aulas.length,
    cobertas: aulas.filter((a) => !a.naoRevisavel && !a.precisaQuebrar).length,
    comLacuna: aulas.filter((a) => a.precisaQuebrar).length,
    naoRevisaveis: aulas.filter((a) => a.naoRevisavel === true).length,
    comExcesso: aulas.filter((a) => a.desafios.some((d) => d.excesso.length > 0)).length,
    splitsPendentes: splits.length,
  };
}

// ---------------------------------------------------------------------------
// Convergência — hash estável + válvula anti-loop
// ---------------------------------------------------------------------------

/** JSON canônico (chaves ordenadas) — base determinística do hash. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const chaves = Object.keys(obj).sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** Hash do CONTEÚDO do relatório (sem convergencia/iteracoes — metadados do loop). */
function hashDoRelatorio(relatorio: RelatorioDeRevisao): string {
  const { convergencia: _c, iteracoes: _i, ...nucleo } = relatorio;
  return createHash('sha256').update(canonicalJson(nucleo)).digest('hex');
}

/**
 * Repete a varredura até o hash do relatório ficar estável entre iterações
 * (convergência) ou estourar a válvula `maxIteracoes` (anti-loop). O relatório
 * devolvido é o da ÚLTIMA iteração, com `convergencia`/`iteracoes` preenchidos.
 */
export async function rodarRevisaoAteConvergir(opts: RodarRevisaoOptions): Promise<RelatorioDeRevisao> {
  const maxIteracoes = opts.maxIteracoes ?? 3;
  let hashAnterior = '';
  let relatorio: RelatorioDeRevisao | null = null;
  let convergencia = false;
  let iteracoes = 0;

  for (let i = 1; i <= maxIteracoes; i += 1) {
    iteracoes = i;
    relatorio = await opts.revisarCurso();
    const hash = hashDoRelatorio(relatorio);
    if (hashAnterior !== '' && hash === hashAnterior) {
      convergencia = true;
      break;
    }
    hashAnterior = hash;
  }

  // Fail-closed na prova de estabilidade: com apenas 1 iteração não há "entre
  // iterações" — convergencia fica false (nunca um verde por ignorância).
  return { ...(relatorio as RelatorioDeRevisao), convergencia, iteracoes };
}

// ---------------------------------------------------------------------------
// gravarRelatorio — NADA SE PERDE: JSON + markdown pt-BR + seeds de SPLIT
// ---------------------------------------------------------------------------

/** Nome de arquivo seguro a partir de uma ref (`m1/l1` → `m1__l1`). */
function nomeArquivoSeguro(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_-]+/g, '__');
}

/**
 * Grava o relatório em `dir`: `relatorio-revisao.json` (artefato completo),
 * `relatorio-revisao.md` (leitura pt-BR) e, para cada SPLIT pendente,
 * `splits/<aula>--<desafio>.minimal.mjs` (o minimalCode — a semente da aula
 * nova) + `.seed.json` (atoms + lacuna). Nada do que foi gerado se perde.
 */
export async function gravarRelatorio(relatorio: RelatorioDeRevisao, dir: string): Promise<ResultadoGravacao> {
  await fsp.mkdir(dir, { recursive: true });
  const arquivos: string[] = [];

  const jsonPath = path.join(dir, 'relatorio-revisao.json');
  await fsp.writeFile(jsonPath, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8');
  arquivos.push(jsonPath);

  const mdPath = path.join(dir, 'relatorio-revisao.md');
  await fsp.writeFile(mdPath, gerarMarkdown(relatorio), 'utf8');
  arquivos.push(mdPath);

  for (const s of relatorio.splitsPendentes) {
    const base = `${nomeArquivoSeguro(s.aula)}--${s.desafio}`;
    const splitsDir = path.join(dir, 'splits');
    await fsp.mkdir(splitsDir, { recursive: true });

    const mjsPath = path.join(splitsDir, `${base}.minimal.mjs`);
    await fsp.writeFile(mjsPath, s.minimalCode, 'utf8');
    arquivos.push(mjsPath);

    const seedPath = path.join(splitsDir, `${base}.seed.json`);
    await fsp.writeFile(
      seedPath,
      `${JSON.stringify({ aula: s.aula, desafio: s.desafio, atoms: s.atoms, foraDoOrcamento: s.foraDoOrcamento, minimalCode: s.minimalCode }, null, 2)}\n`,
      'utf8',
    );
    arquivos.push(seedPath);
  }

  return { dir, arquivos };
}

// ---------------------------------------------------------------------------
// Markdown pt-BR (leitura humana — nada se perde em prosa legível)
// ---------------------------------------------------------------------------

/** Etiqueta humana do veredito de um desafio. */
function rotuloVeredito(d: FeedbackDeDesafio): string {
  const v = d.veredito;
  if (!v.ok) {
    if (v.reason === 'IGNORADO') return 'IGNORADO (multi-arquivo)';
    return `NÃO-OK (${v.reason})${v.detail ? ` — ${v.detail}` : ''}`;
  }
  return `ok — mínimo com ${v.lines} linha(s), provas válidas`;
}

export function gerarMarkdown(relatorio: RelatorioDeRevisao): string {
  const p = relatorio.placar;
  const linhas: string[] = [];
  linhas.push(`# Revisão Progressiva — ${relatorio.trackSlug}`);
  linhas.push('');
  linhas.push(`- Orçamento: **${relatorio.orcamentoFonte}** (mesma fonte do audit em modo declared — introduces do lesson.json)`);
  linhas.push(`- Convergência: **${relatorio.convergencia ? 'SIM' : 'NÃO'}** em **${relatorio.iteracoes}** iteração(ões) (hash estável do relatório + válvula anti-loop)`);
  linhas.push('');
  linhas.push('## Placar');
  linhas.push('');
  linhas.push(`| Métrica | Valor |`);
  linhas.push(`|---|---|`);
  linhas.push(`| Aulas | ${p.aulas} |`);
  linhas.push(`| Cobertas | ${p.cobertas} |`);
  linhas.push(`| Com lacuna (candidata a SPLIT) | ${p.comLacuna} |`);
  linhas.push(`| Não-revisáveis (fail-closed) | ${p.naoRevisaveis} |`);
  linhas.push(`| Com excesso (ajuste) | ${p.comExcesso} |`);
  linhas.push(`| Splits pendentes (minimalCode preservado) | ${p.splitsPendentes} |`);
  linhas.push('');

  for (const a of relatorio.aulas) {
    linhas.push(`## Aula ${a.indice} — ${a.aula} (${a.titulo})`);
    linhas.push('');
    if (a.naoRevisavel) {
      linhas.push(`**Decisão: NÃO-REVISÁVEL** (fail-closed — nunca loopa)`);
      linhas.push('');
      linhas.push(`> ${a.naoRevisavelMotivo ?? a.motivo}`);
    } else if (a.precisaQuebrar) {
      linhas.push(`**Decisão: PRECISA QUEBRAR (SPLIT)**`);
      linhas.push('');
      linhas.push(`> ${a.motivo}`);
    } else {
      linhas.push(`**Decisão: COBERTA**`);
      linhas.push('');
      linhas.push(`> ${a.motivo}`);
    }
    linhas.push('');
    linhas.push(`**Memória vigente nesta revisão** — aula anterior: \`${a.memoria.aulaAnterior ?? '(nenhuma)'}\`; lacunas já vistas: ${a.memoria.lacunasVistas.length > 0 ? a.memoria.lacunasVistas.join(', ') : '(nenhuma)'}.`);
    linhas.push('');
    linhas.push('### Desafios');
    linhas.push('');
    for (const d of a.desafios) {
      linhas.push(`- **${d.slug}** — ${rotuloVeredito(d)}`);
      if (d.atomsCobrados.length > 0) {
        linhas.push(`  - Átomos cobrados pelo teste (\`atoms\` do mínimo): \`${d.atomsCobrados.join('`, `')}\``);
      }
      if (d.foraDoOrcamento.length > 0) {
        linhas.push(`  - **LACUNA** (fora do orçamento): \`${d.foraDoOrcamento.join('`, `')}\``);
      }
      if (d.excesso.length > 0) {
        linhas.push(`  - **EXCESSO** (aula ensina, teste não cobra): \`${d.excesso.join('`, `')}\``);
      }
      if (d.requirements !== null) {
        const gaps = [...d.requirements.semTeste.map((id) => `declarado sem teste: ${id}`), ...d.requirements.testesSemRequirement.map((t) => `teste sem declarado: '${t}'`)];
        linhas.push(`  - Sinal secundário (bijeção requirements × test): ${d.requirements.ok ? 'OK' : `GAP — ${gaps.join('; ')} (ajuste, não split)`}`);
      }
    }
    linhas.push('');
  }

  if (relatorio.splitsPendentes.length > 0) {
    linhas.push('## Splits pendentes (nada se perde — minimalCode preservado)');
    linhas.push('');
    linhas.push('Cada pendência é a SEMENTE de uma aula nova (teoria/assertions/statement/requirements saem de sub-agente LLM com o minimalCode como base; sem LLM na execução, a pendência fica registrada aqui e nos arquivos `splits/`).');
    linhas.push('');
    for (const s of relatorio.splitsPendentes) {
      linhas.push(`- **${s.aula}/${s.desafio}** — lacuna: \`${s.foraDoOrcamento.join('`, `')}\`; semente: \`splits/${nomeArquivoSeguro(s.aula)}--${s.desafio}.minimal.mjs\``);
    }
    linhas.push('');
  }

  linhas.push('## Memória final (progressividade — o que foi aprendido e reavaliado)');
  linhas.push('');
  linhas.push(`- Última aula revisada: \`${relatorio.memoriaFinal.aulaAnterior ?? '(nenhuma)'}\``);
  linhas.push(`- Lacunas vistas no curso: ${relatorio.memoriaFinal.lacunasVistas.length > 0 ? relatorio.memoriaFinal.lacunasVistas.join(', ') : '(nenhuma)'}`);
  linhas.push(`- Decisões: ${relatorio.memoriaFinal.decisoes.length}`);
  for (const d of relatorio.memoriaFinal.decisoes) {
    linhas.push(`  - [${d.decisao}] ${d.aula}: ${d.motivo}`);
  }
  linhas.push('');

  return linhas.join('\n');
}
