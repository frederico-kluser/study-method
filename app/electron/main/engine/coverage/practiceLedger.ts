/**
 * engine/coverage/practiceLedger.ts — o CONTROLE DE COBERTURA de prática
 * (pedido do dono, na íntegra): *"os desafios finais da aula englobem
 * conteúdos das aulas anteriores, misturando na prova conhecimentos que ele já
 * possui — claro, não precisamos LITERALMENTE colocar tudo, mas ter um
 * controle de modo que o aluno sempre pratique num desafio de aula ou de
 * módulo todo o conhecimento anterior daquele curso ou cursos anteriores àquele
 * que estão conectados"*.
 *
 * ─── O QUE ESTE MÓDULO É ──────────────────────────────────────────────────
 * A SELEÇÃO determinística de "o que revisar agora", sobre um LEDGER de
 * práticas. Zero LLM, zero IO, zero Electron — módulo-FOLHA do grafo de
 * engine/** (`tests/engineModuleGraphAcyclic.test.ts` tranca ciclos): só
 * importa `atomKeys`. Quem tem dados (autoria com drafts, runtime com a
 * trilha carregada) monta o ledger e chama daqui.
 *
 * ─── AS DUAS FONTES DE PRÁTICA (o ledger não distingue — é o mesmo formato) ─
 *   - PLANEJADA (autoria): cada desafio escrito pratica os átomos da solução
 *     que o autor exigiu (`extractAtoms`); o ledger é derivado do conteúdo da
 *     trilha e vive com ela;
 *   - REAL (runtime): as tentativas do aluno (`challenge_attempts`) contra os
 *     átomos do desafio tentado.
 *
 * ─── A REGRA DE SELEÇÃO (por que ela é "o controle") ──────────────────────
 * Candidatos = `entrada` da aula (= TODO o conhecimento anterior, ver
 * `deriveTrackBudget`) MENOS o que a aula atual introduz MENOS o que o desafio
 * atual já cobre sozinho. A ordem é a de retrieval practice espaçado:
 *   1. NUNCA praticado primeiro (a lacuna pura);
 *   2. depois, o de prática mais ANTIGA (maior distância em posição pedagógica
 *      desde a última prática — espaçamento);
 *   3. INTERCALAÇÃO: na medida do possível, dois itens seguidos não vêm da
 *      mesma aula de origem (misturar, não repetir o mesmo capítulo).
 * Teto por desafio (`limite`) — "não precisamos LITERALMENTE colocar tudo".
 *
 * ─── O FECHAMENTO POR MÓDULO (a garantia pedida) ──────────────────────────
 * `faltantesDoModulo` devolve os átomos do módulo que NENHUM desafio praticou
 * até o desafio do módulo — é a ficha que o desafio do módulo recebe (e a
 * régua de auditoria pode exigir): "todo conhecimento anterior daquele curso
 * acaba praticado num desafio de aula ou de módulo".
 *
 * PURO E IMUTÁVEL: `registrarPratica` devolve um ledger NOVO; nada muta.
 */
import type { AtomKey } from '../atomKeys';

/* ─── O ledger ────────────────────────────────────────────────────────────── */

export type KindDePratica = 'aula' | 'modulo' | 'proficiencia' | 'revisao';

/** Uma prática registrada — quem praticou, onde, quando (posição) e o quê. */
export interface PraticaRegistrada {
  /** ref do que praticou: '<modulo>/<aula>' | '<modulo>' | 'proficiencia'. */
  ref: string;
  kind: KindDePratica;
  /** posição pedagógica do praticante (índice 0-based na ordem do curso). */
  pos: number;
  /** os átomos praticados (a moeda da cobertura — ver o cabeçalho). */
  atoms: readonly AtomKey[];
}

/** O ledger: práticas em ordem cronológica/pedagógica. */
export interface PracticeLedger {
  readonly praticas: readonly PraticaRegistrada[];
}

export const LEDGER_VAZIO: PracticeLedger = Object.freeze({ praticas: Object.freeze([]) });

/** Acrescenta uma prática (devolve ledger NOVO — imutável por contrato). */
export function registrarPratica(
  ledger: PracticeLedger,
  pratica: PraticaRegistrada,
): PracticeLedger {
  return { praticas: [...ledger.praticas, pratica] };
}

/** As práticas que exercitam o átomo (a "idade" da última prática vem daqui). */
export function praticasDoAtom(
  ledger: PracticeLedger,
  atom: AtomKey,
): PraticaRegistrada[] {
  return ledger.praticas.filter((p) => p.atoms.includes(atom));
}

/* ─── A seleção de revisão ────────────────────────────────────────────────── */

export interface SelecaoRevisaoInput {
  /** tudo que já foi ensinado antes da aula (`LessonBudget.entrada`). */
  entrada: readonly AtomKey[];
  /** o que a AULA ATUAL introduz — quem ensina agora não é revisão. */
  introduzidos: readonly AtomKey[];
  /** o que o desafio atual já cobre naturalmente (não precisa de item extra). */
  jaCobertos?: readonly AtomKey[];
  /** o ledger de práticas (planejadas ou reais). */
  ledger: PracticeLedger;
  /** átomo → ref da aula que o ensinou (intercalação por origem). */
  origemDe?: ReadonlyMap<AtomKey, string>;
  /** posição pedagógica atual (a do desafio sendo escrito). */
  posAtual: number;
  /** teto de itens (default 4 — "não precisamos LITERALMENTE colocar tudo"). */
  limite?: number;
}

export interface ItemRevisao {
  atom: AtomKey;
  /** aula que ensinou o átomo (null quando a origem não é conhecida). */
  origem: string | null;
  /** por que ele foi escolhido (o que a UI/dossiê mostra). */
  motivo: string;
}

const LIMITE_PADRAO_REVISAO = 4;

/**
 * A SELEÇÃO: o que revisar AGORA. PURA. A ordenação documenta a pedagogia
 * (lacuna primeiro, depois espaçamento, sempre intercalando origem) — ver o
 * cabeçalho do arquivo. A saída é estável: empate quebra por ordem de entrada.
 */
export function selecionarRevisao(input: SelecaoRevisaoInput): ItemRevisao[] {
  const limite = input.limite ?? LIMITE_PADRAO_REVISAO;
  if (limite <= 0) return [];
  const introduzidos = new Set(input.introduzidos);
  const cobertos = new Set(input.jaCobertos ?? []);
  const candidatos = [...new Set(input.entrada)].filter(
    (a) => !introduzidos.has(a) && !cobertos.has(a),
  );
  const ranqueados = candidatos.map((atom, ordem) => {
    const praticas = praticasDoAtom(input.ledger, atom);
    const ultimaPos = praticas.reduce((max, p) => Math.max(max, p.pos), -1);
    const nuncaPraticado = praticas.length === 0;
    // idade = posições desde a última prática (quanto mais velho, mais urgente).
    // Sentinela FINITA para "nunca" — subtrair Infinity daria NaN no sort.
    const idade = nuncaPraticado ? Number.MAX_SAFE_INTEGER : input.posAtual - ultimaPos;
    return {
      atom,
      ordem,
      nuncaPraticado,
      idade,
      origem: input.origemDe?.get(atom) ?? null,
    };
  });
  ranqueados.sort((a, b) => {
    if (a.nuncaPraticado !== b.nuncaPraticado) return a.nuncaPraticado ? -1 : 1;
    if (a.idade !== b.idade) return b.idade - a.idade;
    return a.ordem - b.ordem;
  });
  return intercalarPorOrigem(ranqueados, limite).map((c) => ({
    atom: c.atom,
    origem: c.origem,
    motivo: c.nuncaPraticado
      ? 'nunca praticado em nenhum desafio'
      : `última prática há ${c.idade} aula(s)`,
  }));
}

interface CandidatoRanqueado {
  atom: AtomKey;
  ordem: number;
  nuncaPraticado: boolean;
  idade: number;
  origem: string | null;
}

/**
 * Intercalação gulosa: na medida do possível, os escolhidos se ESPALHAM por
 * aulas de origem diferentes (misturar conhecimentos, não repetir o capítulo —
 * nunca 5 itens da mesma aula quando há alternativa). Quando SÓ restam
 * candidatos de origem já usada, eles entram — intercalar é preferência,
 * nunca censura.
 */
function intercalarPorOrigem(
  ranqueados: readonly CandidatoRanqueado[],
  limite: number,
): CandidatoRanqueado[] {
  const escolhidos: CandidatoRanqueado[] = [];
  const restantes = [...ranqueados];
  const origensUsadas = new Set<string>();
  while (escolhidos.length < limite && restantes.length > 0) {
    const idx = restantes.findIndex((c) => c.origem === null || !origensUsadas.has(c.origem));
    const [candidato] = restantes.splice(idx === -1 ? 0 : idx, 1);
    escolhidos.push(candidato);
    if (candidato.origem !== null) origensUsadas.add(candidato.origem);
  }
  return escolhidos;
}

/* ─── O fechamento por módulo ─────────────────────────────────────────────── */

export interface FaltaDeCobertura {
  atom: AtomKey;
  origem: string | null;
}

/**
 * Os átomos do MÓDULO que nenhum desafio praticou até o desafio do módulo —
 * a ficha de cobertura que o desafio do módulo recebe (e a garantia pedida:
 * "todo conhecimento anterior … acaba praticado num desafio de aula ou de
 * módulo"). Átomo praticado por QUALQUER prática registrada conta (aula,
 * módulo anterior, revisão). PURA.
 */
export function faltantesDoModulo(input: {
  atomsDoModulo: readonly AtomKey[];
  ledger: PracticeLedger;
  origemDe?: ReadonlyMap<AtomKey, string>;
}): FaltaDeCobertura[] {
  const praticados = new Set(input.ledger.praticas.flatMap((p) => [...p.atoms]));
  return [...new Set(input.atomsDoModulo)]
    .filter((a) => !praticados.has(a))
    .map((a) => ({ atom: a, origem: input.origemDe?.get(a) ?? null }));
}
