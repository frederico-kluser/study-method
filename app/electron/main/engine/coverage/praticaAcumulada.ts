/**
 * engine/coverage/praticaAcumulada.ts — o CONTROLE DA PREMISSA DE REVISÃO
 * ACUMULADA (o outro lado do `practiceLedger.ts`, que decide O QUE revisar;
 * este mede SE o conteúdo já escrito cumpre a premissa).
 *
 * A premissa do dono, na íntegra (a mesma que o `practiceLedger.ts` traz):
 * *"os desafios finais da aula englobem conteúdos das aulas anteriores,
 * misturando na prova conhecimentos que ele já possui — claro, não precisamos
 * LITERALMENTE colocar tudo, mas ter um controle de modo que o aluno sempre
 * pratique num desafio de aula ou de módulo todo o conhecimento anterior
 * daquele curso ou cursos anteriores àquele que estão conectados"*.
 *
 * ─── O QUE ESTE MÓDULO É ──────────────────────────────────────────────────
 * A RÉGUA DETERMINÍSTICA sobre um curso JÁ ESCRITO: cada desafio pratica
 * alguma coisa que uma aula ANTERIOR ensinou? E todo o conhecimento do módulo
 * acaba praticado até o desafio do módulo? Zero LLM, zero IO, zero Electron —
 * módulo-FOLHA do grafo de `engine/**`: só importa `atomKeys` e
 * `coverage/practiceLedger` (que por sua vez só importa `atomKeys`).
 *
 * ─── AS DUAS MEDIDAS ──────────────────────────────────────────────────────
 *   1. MISTURA (por desafio): `atoms(desafio) ∩ ensinadoAntes(pos)` ≠ ∅.
 *      "Sempre colocar conceitos já aprendidos nos desafios" — sem encher o
 *      desafio ("a ideia não é ficar gigante"): basta UM átomo anterior
 *      contável no código que resolve, e a seleção (`selecionarRevisao`) é que
 *      sugere QUAL, por espaçamento.
 *      Isento por vacuidade: o desafio de quem ainda não tem nada ensinado
 *      antes (as primeiras aulas) — exigir revisão ali é exigir o impossível.
 *   2. FECHAMENTO (por módulo e por curso): `faltantesDoModulo` sobre os
 *      átomos produtivos do módulo, com o ledger das práticas até o fim do
 *      módulo. É a garantia pedida: "todo o conhecimento anterior acaba
 *      praticado num desafio de aula ou de módulo".
 *
 * ─── A RÉGUA DOS EIXOS (o que conta como "conceito já aprendido") ─────────
 * Nem todo átomo é conceito: `node:Call` (chamar função) é tão forçado pela
 * sintaxe que contar ele como revisão aprovaria TODO desafio que imprime algo
 * — a régua viraria teatro. Por isso a mistura é medida por EIXO
 * (`eixosQueContam`, default = todos exceto `node` e `form`): estrutura e forma
 * de uso são o esqueleto do código; `global:`, `api:`, `op:`, `decl:` e `term:`
 * são o CONCEITO que o aluno reconhece como lição anterior. Quem quiser a
 * leitura larga (inclusive estrutura) passa `eixosQueContam` explícito — o
 * dado bruto (`ensinadosAntes`, `revisao`) sai inteiro no relatório; só o
 * VEREDITO é que é sensível ao filtro.
 *
 * PURO E IMUTÁVEL: nada muta; o ledger é montado aqui por `registrarPratica`.
 */
import { axisOf, type AtomKey } from '../atomKeys';
import {
  faltantesDoModulo,
  LEDGER_VAZIO,
  registrarPratica,
  selecionarRevisao,
  type FaltaDeCobertura,
  type KindDePratica,
  type PracticeLedger,
} from './practiceLedger';

/* ─── Entrada ─────────────────────────────────────────────────────────────── */

/** Um desafio escrito e o que a solução de referência dele exige. */
export interface PraticaDeDesafio {
  /** ref do desafio: '<modulo>/<aula>/<desafio>' | '<modulo>/challenges/<desafio>' | 'proficiencia'. */
  ref: string;
  /** ref do bloco dono: '<modulo>/<aula>' | '<modulo>' | 'proficiencia'. */
  blocoRef: string;
  kind: KindDePratica;
  /** posição pedagógica do bloco (índice da aula no `LessonBudget.index`; o desafio do módulo entra em +0.5, entre a última aula dele e a próxima; a proficiência, no fim). */
  pos: number;
  /** os átomos da solução de referência (a régua de prática planejada). */
  atoms: readonly AtomKey[];
}

/** Um bloco do currículo (aula, módulo ou proficiência) e o que ele ensina. */
export interface BlocoDeCurriculo {
  ref: string;
  pos: number;
  /** o que ESTE bloco introduz (introduces: productive ∪ receptive) — a moeda da mistura. */
  introduz: readonly AtomKey[];
  /**
   * Só o que o aluno aprende a ESCREVER (introduces.productive) — a moeda do
   * fechamento. Receptivo é "sabe ler", nunca exigido como prática.
   */
  introduzProdutivo: readonly AtomKey[];
}

/** O fechamento de um módulo: o que falta praticar até o desafio dele. */
export interface FechamentoDeModuloInput {
  /** slug do módulo (só para o relatório). */
  modulo: string;
  /** posição do fim do módulo (a do desafio do módulo; se não houver, a da última aula). */
  fim: number;
  /** os átomos PRODUTIVOS que o módulo ensina (o que o aluno deve saber escrever). */
  atomsDoModulo: readonly AtomKey[];
}

export interface EntradaDePratica {
  praticas: readonly PraticaDeDesafio[];
  blocos: readonly BlocoDeCurriculo[];
  modulos: readonly FechamentoDeModuloInput[];
  /** átomo → ref do bloco que o ensina primeiro (para citar a origem). */
  origemDe?: ReadonlyMap<AtomKey, string>;
  /**
   * Eixos que CONTAM como conceito na mistura. Default: todos menos `node` e
   * `form` (ver o cabeçalho — a régua dos eixos).
   */
  eixosQueContam?: readonly string[];
}

/* ─── Saída ───────────────────────────────────────────────────────────────── */

/**
 * REVISAO_OK                  mistura ≥ 1 átomo contável ensinado antes;
 * SEM_REVISAO                 tinha o que revisar e não revisou — A VIOLAÇÃO;
 * SEM_CONHECIMENTO_ANTERIOR   isento por vacuidade (nada ensinado antes ainda);
 * SEM_ATOMOS                  a solução não produziu átomo nenhum (parse falhou
 *                             ou solução vazia) — fail-closed: NUNCA aprova.
 */
export type VereditoDePratica =
  | 'REVISAO_OK'
  | 'SEM_REVISAO'
  | 'SEM_CONHECIMENTO_ANTERIOR'
  | 'SEM_ATOMOS';

export interface ApuramentoDeDesafio {
  ref: string;
  kind: KindDePratica;
  pos: number;
  /** tudo que a solução de referência exige. */
  atoms: AtomKey[];
  /** o subconjunto ensinado ANTES do bloco (o que poderia ser revisado). */
  ensinadosAntes: AtomKey[];
  /** o que foi praticado de fato, dos ensinados antes (sem filtro de eixo). */
  revisao: AtomKey[];
  /** o que o bloco atual introduz e o desafio pratica (o alvo novo). */
  novos: AtomKey[];
  /** `revisao` só com os eixos que contam — o que decide o veredito. */
  revisaoContavel: AtomKey[];
  veredito: VereditoDePratica;
}

export interface FechamentoDeModuloApurado {
  modulo: string;
  fim: number;
  atomsDoModulo: AtomKey[];
  /** átomos do módulo que NENHUM desafio praticou até o fim dele. */
  faltantes: FaltaDeCobertura[];
}

export interface ApuramentoDePratica {
  desafios: ApuramentoDeDesafio[];
  modulos: FechamentoDeModuloApurado[];
  /** átomos produtivos ensinados no curso e praticados em desafio NENHUM. */
  nuncaPraticados: FaltaDeCobertura[];
  eixosQueContam: string[];
  placar: {
    desafios: number;
    comRevisao: number;
    semRevisao: number;
    semConhecimentoAnterior: number;
    semAtomos: number;
    faltantesDeModulo: number;
    nuncaPraticados: number;
  };
}

/** Eixos do CONCEITO (default da régua) — estrutura e forma não contam. */
export const EIXOS_DE_CONCEITO: readonly string[] = ['decl', 'op', 'global', 'api', 'term'];

/**
 * O que NUNCA é conceito de revisão: o marcador de stub do starter (`todo!()`
 * do Rust — o "ainda não implementado" que o aluno tem que SUBSTITUIR). Ele é
 * ensinado como envelope e jamais pode ser praticado (o teste reprova quem o
 * deixa), então contar ele como revisão é régua de teatro. Medido: era o ÚNICO
 * "conceito" anterior dos dois primeiros desafios do rust-iniciante — sem esta
 * exclusão a régua exigia revisão impossível.
 */
export const NAO_SAO_CONCEITO_DE_REVISAO: readonly AtomKey[] = ['api:todo!'];

function eixoDe(atom: AtomKey): string {
  return axisOf(atom) ?? '';
}

/** o que os blocos com posição < `pos` ensinam (o prefixo do currículo). */
function ensinadosAntes(entrada: EntradaDePratica, pos: number): AtomKey[] {
  const out = new Set<AtomKey>();
  for (const b of entrada.blocos) if (b.pos < pos) for (const a of b.introduz) out.add(a);
  return [...out];
}

/**
 * O que os blocos com posição < `pos` ensinaram a ESCREVER (productive). É a
 * moeda da mistura e da sugestão: átomo só-receptivo ("sabe ler") não pode ser
 * exigido no solutionCode — o audit A2 reprova (`api:.y` do rust-iniciante foi
 * exatamente a armadilha: a régua sugeria, o audit barrava). Medido em
 * 2026-09-27, na campanha de correção.
 */
function ensinadosAntesProdutivos(entrada: EntradaDePratica, pos: number): AtomKey[] {
  const out = new Set<AtomKey>();
  for (const b of entrada.blocos) if (b.pos < pos) for (const a of b.introduzProdutivo) out.add(a);
  return [...out];
}

/** o que o bloco `ref` introduz. */
function introduzidos(entrada: EntradaDePratica, ref: string): Set<AtomKey> {
  const out = new Set<AtomKey>();
  for (const b of entrada.blocos) if (b.ref === ref) for (const a of b.introduz) out.add(a);
  return out;
}

const FORA_DA_REVISAO: ReadonlySet<AtomKey> = new Set(NAO_SAO_CONCEITO_DE_REVISAO);

function contaveis(
  atoms: readonly AtomKey[],
  eixos: ReadonlySet<string>,
): AtomKey[] {
  return atoms.filter((a) => !FORA_DA_REVISAO.has(a) && eixos.has(eixoDe(a)));
}

/**
 * A APURAÇÃO. Pura: entra o curso já medido (átomos por desafio + o que cada
 * bloco ensina), sai o relatório da premissa. A ordem das `praticas` não
 * importa (a posição é o dado); a dos `blocos` também não.
 */
export function apurarPraticaAcumulada(entrada: EntradaDePratica): ApuramentoDePratica {
  const eixos = new Set(entrada.eixosQueContam ?? EIXOS_DE_CONCEITO);

  const desafios: ApuramentoDeDesafio[] = entrada.praticas.map((p) => {
    const ensinadosAntesDePos = ensinadosAntes(entrada, p.pos);
    const antes = new Set(ensinadosAntesDePos);
    // A MOEDA DA MISTURA é o que o aluno aprendeu a ESCREVER (productive): o
    // que só foi ensinado a ler não pode aparecer no solutionCode (audit A2).
    const antesProdutivos = new Set(ensinadosAntesProdutivos(entrada, p.pos));
    const novosSet = introduzidos(entrada, p.blocoRef);
    const revisao = p.atoms.filter((a) => antes.has(a));
    const novos = p.atoms.filter((a) => novosSet.has(a));
    const revisaoContavel = contaveis(
      revisao.filter((a) => antesProdutivos.has(a)),
      eixos,
    );

    let veredito: VereditoDePratica;
    if (p.atoms.length === 0) veredito = 'SEM_ATOMOS';
    else if (
      contaveis(
        ensinadosAntesProdutivos(entrada, p.pos),
        eixos,
      ).length === 0
    )
      veredito = 'SEM_CONHECIMENTO_ANTERIOR';
    else if (revisaoContavel.length > 0) veredito = 'REVISAO_OK';
    else veredito = 'SEM_REVISAO';

    return {
      ref: p.ref,
      kind: p.kind,
      pos: p.pos,
      atoms: [...p.atoms],
      ensinadosAntes: ensinadosAntesDePos,
      revisao,
      novos,
      revisaoContavel,
      veredito,
    };
  });

  // o ledger PLANEJADO (a mesma régua do reviewSelection: a solução é a prática).
  const ledgerCompleto: PracticeLedger = entrada.praticas.reduce(
    (led, p) =>
      registrarPratica(led, { ref: p.blocoRef, kind: p.kind, pos: p.pos, atoms: p.atoms }),
    LEDGER_VAZIO,
  );

  const modulos: FechamentoDeModuloApurado[] = entrada.modulos.map((m) => {
    // "até o desafio do módulo": práticas do que veio ANTES (inclusive) do fim.
    const ledgerDoModulo: PracticeLedger = entrada.praticas
      .filter((p) => p.pos <= m.fim)
      .reduce(
        (led, p) =>
          registrarPratica(led, { ref: p.blocoRef, kind: p.kind, pos: p.pos, atoms: p.atoms }),
        LEDGER_VAZIO,
      );
    return {
      modulo: m.modulo,
      fim: m.fim,
      atomsDoModulo: [...m.atomsDoModulo],
      faltantes: faltantesDoModulo({
        atomsDoModulo: m.atomsDoModulo,
        ledger: ledgerDoModulo,
        origemDe: entrada.origemDe,
      }),
    };
  });

  // "todo o conhecimento … acaba praticado" — no CURSO inteiro, inclusive o
  // que sobreviveu aos fechamentos de módulo (praticado tarde, mas praticado).
  // Só o PRODUTIVO: o receptivo é "sabe ler" e nunca é exigido como prática.
  const ensinadoProdutivo = new Set<AtomKey>();
  for (const b of entrada.blocos) for (const a of b.introduzProdutivo) ensinadoProdutivo.add(a);
  const nuncaPraticados = faltantesDoModulo({
    atomsDoModulo: [...ensinadoProdutivo],
    ledger: ledgerCompleto,
    origemDe: entrada.origemDe,
  });

  const placar = {
    desafios: desafios.length,
    comRevisao: desafios.filter((d) => d.veredito === 'REVISAO_OK').length,
    semRevisao: desafios.filter((d) => d.veredito === 'SEM_REVISAO').length,
    semConhecimentoAnterior: desafios.filter((d) => d.veredito === 'SEM_CONHECIMENTO_ANTERIOR')
      .length,
    semAtomos: desafios.filter((d) => d.veredito === 'SEM_ATOMOS').length,
    faltantesDeModulo: modulos.reduce((acc, m) => acc + m.faltantes.length, 0),
    nuncaPraticados: nuncaPraticados.length,
  };

  return {
    desafios,
    modulos,
    nuncaPraticados,
    eixosQueContam: [...eixos],
    placar,
  };
}

/**
 * A sugestão de O QUE misturar num desafio que está `SEM_REVISAO`: os átomos
 * contáveis ensinados antes que NENHUM desafio praticou ainda (lacuna pura),
 * depois os de prática mais antiga — a MESMA regra do `selecionarRevisao`
 * (`practiceLedger.ts`), que é quem manda na seleção em runtime. Sai aqui como
 * lista de sugestão para o autor (a régua não escreve conteúdo).
 */
export function sugestaoDeRevisao(
  entrada: EntradaDePratica,
  ref: string,
  limite = 4,
): { atom: AtomKey; origem: string | null; motivo: string }[] {
  const alvo = entrada.praticas.find((p) => p.ref === ref);
  if (alvo === undefined) return [];
  const eixos = new Set(entrada.eixosQueContam ?? EIXOS_DE_CONCEITO);
  // Só o que o aluno aprendeu a ESCREVER é candidato: sugerir átomo
  // só-receptivo leva o autor a uma violação A2 (a armadilha `api:.y`).
  const antes = contaveis(ensinadosAntesProdutivos(entrada, alvo.pos), eixos);
  const jaCobertos = alvo.atoms;
  // SÓ o passado (pos ≤ a do alvo) conta como "última prática": o ledger do
  // futuro daria idade negativa ("última prática há -77 aula(s)").
  const ledger: PracticeLedger = entrada.praticas
    .filter((p) => p.ref !== ref && p.pos <= alvo.pos)
    .reduce(
      (led, p) =>
        registrarPratica(led, { ref: p.blocoRef, kind: p.kind, pos: p.pos, atoms: p.atoms }),
      LEDGER_VAZIO,
    );
  // importado aqui para não reescrever a regra (módulo-FOLHA: mesma camada).
  return selecionarRevisao({
    entrada: antes,
    introduzidos: [...introduzidos(entrada, alvo.blocoRef)],
    jaCobertos,
    ledger,
    origemDe: entrada.origemDe,
    posAtual: alvo.pos,
    limite,
  });
}