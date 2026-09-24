/**
 * app/electron/main/engine/review/filter.ts — o FILTRO ESTRUTURAL R1–R8
 * (`docs/16-engine-de-trilha.md` §6.4), pacote P-18 (a onda 3 do plano de
 * execução v1 — o laço F11).
 *
 * Contrato: cada regra é UMA FUNÇÃO (determinística, sem LLM) e
 * `filtrarApontamentos` roda a bateria na ordem R1→R8 — o PRIMEIRO motivo que
 * descarta vence (um apontamento pode violar várias regras; o motivo
 * registrado é o primeiro da ordem). O filtro é a TRIAGEM SEPARADA do §6.5:
 * o revisor reporta tudo, a severidade é por tabela fixa e a triagem é aqui.
 *
 * Para cada regra, o critério DETERMINÍSTICO (a intenção do §6.4 materializada
 * em código — proxies nomeados, nunca opinião):
 *
 *   R1 — span ausente/irresolvível: o apontamento tem de resolver um span
 *        FECHADO dentro do artefato alvo. Span invertido (fim < início),
 *        negativo, ou além do tamanho do arquivo é irresolvível. Artefato
 *        que não existe no contexto (caminho desconhecido) também é
 *        irresolvível (onde se verificaria a evidência?).
 *   R2 — o defeito não é frase declarativa: o campo `defeito` tem de ser uma
 *        afirmação. Proxy determinístico: comprimento mínimo de 10
 *        caracteres, termina em `.` (frase declarativa) e NÃO termina em
 *        `?`/`!` (pergunta/exclamação) nem começa com interrogação
 *        explícita ("será que", "por que não").
 *   R3 — não pede mudança (é pergunta ou elogio): proxy determinístico —
 *        começa com padrão interrogativo ("será que", "por que não",
 *        "deveria", "que tal") OU é elogio puro (palavras de louvor e
 *        nenhum marcador de defeito). Elogio não pede mudança.
 *   R4 — a prova cita algo fora do span e fora do orçamento: os fragmentos
 *        citados em `evidencia.prova` (crases ou aspas) têm de ser
 *        verificáveis. Proxy determinístico: (a) todo fragmento com ≥3
 *        caracteres PRECISA existir como SUBSTRING no artefato — a checagem
 *        de substring barata e determinística que é a mitigação nomeada para
 *        o revisor que alucina (§6.4: "evidencia.trecho ∈ artefato"); (b)
 *        todo fragmento precisa estar DENTRO do span do apontamento OU ser
 *        uma chave do orçamento declarado (se o fragmento é uma construção
 *        do orçamento, a citação é verificável mesmo fora do span). Sem
 *        fragmentos citáveis, o apontamento passa (nada a acusar).
 *   R5 — `reproduzivel_por` roda e NÃO reproduz: o comando do revisor é
 *        EXECUTADO sob endurecimento (o chamador injeta o `ExecFn` já
 *        endurecido por `createHardenedExec`) com teto de timeout DECLARADO.
 *        Proxy de "reproduz": exit code ≠ 0 (exceto 126/127 — ver abaixo) OU
 *        a saída menciona o token acusador do apontamento. Comando que roda
 *        limpo (exit 0 sem o token) → NÃO reproduziu → descarta. Comando que
 *        NÃO RODOU de verdade (exit 126/127 — comando não encontrado/não
 *        executável; timeout; erro de infra; sem executor configurado) →
 *        FAIL-CLOSED: descarta com detalhe distinguível (acusação não
 *        reproduzível não chega ao planejador — nunca aprovação por omissão
 *        e NUNCA "reproduz" por um exit que não é evidência do defeito).
 *        Apontamentos MECÂNICOS do laço (origem no verificador
 *        determinístico, marcados pelo prefixo `REPRODUZIVEL_MECANICO_PREFIX`)
 *        pulam R5: a reprodução É o veredito do verificador que os produziu.
 *   R6 — `regra_violada` não existe no catálogo (a constituição C1–C8 de
 *        review/constituicao.ts): descarta antes de chegar ao planejador.
 *   R7 — categoria `estilo` com correção aberta: estilo é SUGESTÃO (nunca
 *        abre rodada, §6.5) e o revisor NÃO escreve código (§7.2). Proxy
 *        determinístico: categoria `estilo` cuja `acao_sugerida` propõe
 *        correção aberta (trecho de código em crases e/ou verbos de correção
 *        — "reescreva", "corrija", "substitua", "refatore").
 *   R8 — mais de 12 apontamentos no MESMO artefato: trunca por severidade
 *        (bloqueante > corrigir > sugestao), estável na ordem original.
 *
 * O filtro é FUNÇÃO PURA exceto por R5, que toca o mundo apenas através do
 * `ExecFn` INJETADO (mesma regra A-P07-2 das provas — a suíte não gera
 * processo). O orçamento de R4 chega como lista de chaves permitidas.
 *
 * Limites DECLARADOS (registrados aqui, nunca escondidos):
 *   - R5 executa o comando do revisor no MESMO ambiente endurecido do harness
 *     (proxies/NODE_OPTIONS/TLS removidos, NO_PROXY=*): derruba tráfego via
 *     proxy, mas socket cru (TCP/UDP) continua fora do alcance — o corte de
 *     rede de verdade exige wrapper de SO (slot `NETWORK_HARDENING.wrapperCommand`,
 *     exec/harness.ts);
 *   - R2/R3/R4b usam proxies de texto determinísticos (declarados acima);
 *   - R5 "sem executor configurado" descarta por fail-closed — quem quiser
 *     posições é o chamador que injeta o ExecFn.
 */

import type { ExecFn } from '../exec/proofs';
import type { Apontamento } from './actionCatalog';
import { regraExisteNaConstituicao } from './constituicao';
import {
  REPRODUZIVEL_MECANICO_PREFIX,
  R5_TIMEOUT_MS_DEFAULT,
  r5ExigeReproducao,
  type ResultadoDeReproducao,
} from './filterReproducao';

// Re-exportados pelos MESMOS nomes de antes (a implementação do R5 vive em
// `filterReproducao.ts` desde a refatoração do lote L05).
export {
  REPRODUZIVEL_MECANICO_PREFIX,
  R5_SHELL,
  R5_TIMEOUT_MS_DEFAULT,
  r5ExigeReproducao,
} from './filterReproducao';
export type { ResultadoDeReproducao } from './filterReproducao';

// ---------------------------------------------------------------------------
// O resultado do filtro
// ---------------------------------------------------------------------------

/** Os motivos FECHADOS de descarte — exatamente as oito regras do §6.4. */
export type MotivoDeDescarte = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8';

/** Um apontamento descartado, com o motivo (o PRIMEIRO que venceu). */
export interface DescarteDoFiltro {
  apontamento: Apontamento;
  motivo: MotivoDeDescarte;
  /** por quê — detalhe legível e específico da regra que descartou. */
  detalhe: string;
}

export interface ResultadoDoFiltro {
  sobreviventes: Apontamento[];
  descartados: DescarteDoFiltro[];
}

/** R8 (§6.4): o teto de apontamentos por artefato. */
export const R8_TETO = 12;

/** R2 (§6.4): o defeito tem de ser frase declarativa — tamanho mínimo. */
export const TAMANHO_MINIMO_DE_DEFEITO = 10;

// ---------------------------------------------------------------------------
// R1 — span ausente ou irresolvível
// ---------------------------------------------------------------------------

/**
 * R1: o span do apontamento precisa ser um intervalo FECHADO [início, fim]
 * DENTRO do conteúdo do artefato alvo (`fim` pode tocar o fim exato do
 * arquivo — o trecho final é resolvível). `conteudo === null` (artefato que
 * não existe no contexto) também é irresolvível — não há onde verificar a
 * evidência. FUNÇÃO PURA.
 */
export function r1SpanResoluvel(apontamento: Apontamento, conteudo: string | null): boolean {
  if (conteudo === null) return false;
  const [inicio, fim] = apontamento.alvo.span;
  if (inicio < 0 || inicio > conteudo.length) return false;
  if (fim < inicio || fim > conteudo.length) return false;
  return true;
}

// ---------------------------------------------------------------------------
// R2 — o defeito não é frase declarativa
// ---------------------------------------------------------------------------

/** Interrogações explícitas no INÍCIO da frase (pergunta, não afirmação). */
const INTERROGATIVAS_DE_INICIO = /^(?:ser[áa] que|por que n[ãa]o|por qu[eê]|deveria|n[ãa]o seria|que tal|como fazer|onde|quando)\b/i;

/**
 * R2: `defeito` é frase declarativa? Proxy determinístico: comprimento ≥ 10,
 * termina em `.`, não termina em `?`/`!` e não começa com interrogação
 * explícita. FUNÇÃO PURA.
 */
export function r2FraseDeclarativa(apontamento: Apontamento): boolean {
  const defeito = apontamento.defeito.trim();
  if (defeito.length < TAMANHO_MINIMO_DE_DEFEITO) return false;
  if (/[?!]$/.test(defeito)) return false;
  if (!defeito.endsWith('.')) return false;
  if (INTERROGATIVAS_DE_INICIO.test(defeito)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// R3 — não pede mudança (é pergunta ou elogio)
// ---------------------------------------------------------------------------

/** Pergunta que R2 não pega: começa com interrogação explícita. */
const PERGUNTA_EXPLICITA = /^(?:ser[áa] que|por que n[ãa]o|por qu[eê]|que tal|deveria[n]?|n[ãa]o seria melhor)\b/i;

/** Louvor puro — elogio não pede mudança (fronteiras Unicode: `\b` é ASCII). */
const ELOGIO = /(?<![\p{L}\p{N}_])(?:[óo]timo|[óo]tima|excelente|perfeito|perfeita|impec[áa]vel|muito bom|muito boa|parab[ée]ns|maravilhoso|maravilhosa)(?![\p{L}\p{N}_])/iu;

/** Marcador de defeito — elogio com defeito declarado PEDE mudança (passa). */
const MARCADOR_DE_DEFEITO = /\b(?:viola|falt[ae]|errad[oa]|incorret[oa]|n[ãa]o (?:funciona|passa|resolve)|problema|quebra|confus[oa]|amb[ií]gu[oa])\b/i;

/**
 * R3: o apontamento pede mudança? FALSO (e descarta) quando é pergunta
 * explícita ou elogio puro (sem marcador de defeito). FUNÇÃO PURA.
 */
export function r3PedeMudanca(apontamento: Apontamento): boolean {
  const defeito = apontamento.defeito.trim();
  if (PERGUNTA_EXPLICITA.test(defeito)) return false;
  if (ELOGIO.test(defeito) && !MARCADOR_DE_DEFEITO.test(defeito)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// R4 — a prova cita algo fora do span e fora do orçamento
// ---------------------------------------------------------------------------

/** Fragmentos citados numa prova: crases (`` ` ``) e aspas duplas/curvas. */
function fragmentosCitados(prova: string): string[] {
  const saida: string[] = [];
  const re = /`([^`]+)`|"([^"]+)"|“([^”]+)”/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prova)) !== null) {
    const frag = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (frag.length >= 3) saida.push(frag);
  }
  return saida;
}

/**
 * R4 — o núcleo de EVIDÊNCIA do apontamento (a parte "trecho citado").
 *
 * Retorna a lista de fragmentos citados que NÃO são verificáveis, com o
 * motivo individual:
 *   - `fora_do_artefato`: o fragmento não existe como SUBSTRING no artefato
 *     (alucinação — a mitigação barata e determinística do §6.4);
 *   - `fora_do_alcance`: o fragmento existe no artefato, mas NÃO dentro do
 *     span E não é chave do orçamento — citação fora do span e fora do
 *     orçamento (§6.4 R4).
 * O filtro descarta quando a lista não é vazia. FUNÇÃO PURA.
 */
export function r4FragmentosNaoVerificaveis(
  apontamento: Apontamento,
  artefato: string | null,
  orcamento: readonly string[],
): { fragmento: string; motivo: 'fora_do_artefato' | 'fora_do_alcance' }[] {
  if (artefato === null) return [];
  const [inicio, fim] = apontamento.alvo.span;
  const spanSlice = artefato.slice(inicio, fim);
  const naoVerificaveis: { fragmento: string; motivo: 'fora_do_artefato' | 'fora_do_alcance' }[] = [];
  for (const fragmento of fragmentosCitados(apontamento.evidencia.prova)) {
    if (!artefato.includes(fragmento)) {
      naoVerificaveis.push({ fragmento, motivo: 'fora_do_artefato' });
      continue;
    }
    if (!spanSlice.includes(fragmento) && !orcamento.some((chave) => chave.includes(fragmento) || fragmento.includes(chave))) {
      naoVerificaveis.push({ fragmento, motivo: 'fora_do_alcance' });
    }
  }
  return naoVerificaveis;
}

/**
 * R4 — FUNÇÃO PURA de decisão: `true` = evidência verificável (passa).
 * Descarta quando há fragmento citado fora do artefato (substring) OU fora do
 * span E do orçamento. Sem fragmentos citáveis → passa (nada a acusar).
 */
export function r4EvidenciaVerificavel(
  apontamento: Apontamento,
  artefato: string | null,
  orcamento: readonly string[],
): boolean {
  return r4FragmentosNaoVerificaveis(apontamento, artefato, orcamento).length === 0;
}

// ---------------------------------------------------------------------------
// R6 — regra_violada fora da constituição C1–C8
// ---------------------------------------------------------------------------

/**
 * R6 — FUNÇÃO PURA: `regra_violada` existe no catálogo FECHADO da
 * constituição C1–C8? Descarta quando não (inventar regra é descartado,
 * nunca regra nova — §6.4/§6.7; constates em review/constituicao.ts).
 */
export function r6RegraNaConstituicao(apontamento: Apontamento): boolean {
  return regraExisteNaConstituicao(apontamento.regra_violada);
}

// ---------------------------------------------------------------------------
// R7 — categoria estilo com correção aberta
// ---------------------------------------------------------------------------

/** Verbos que denunciam correção ABERTA na sugestão de estilo. */
const VERBOS_DE_CORRECAO_ABERTA = /(?:reescrev|corrij|corrig|substitu|refator|remov|troque|mude|altere)\w*/i;

/**
 * R7 — FUNÇÃO PURA: categoria `estilo` (sugestão, §6.5) com correção ABERTA
 * é descartada — o revisor não escreve código (§7.2). Proxy determinístico:
 * `acao_sugerida` traz trecho de código em crases E/OU verbo de correção
 * aberta. `tom`/`prosa` também não abrem rodada, mas não são alvo desta
 * regra (a letra do §6.4 nomeia `estilo`).
 */
export function r7SemCorrecaoAberta(apontamento: Apontamento): boolean {
  if (apontamento.categoria !== 'estilo') return true;
  const sugestao = apontamento.acao_sugerida;
  const temCodigo = /`[^`]{3,}`/.test(sugestao);
  const temVerboDeCorrecao = VERBOS_DE_CORRECAO_ABERTA.test(sugestao);
  return !(temCodigo || temVerboDeCorrecao);
}

// ---------------------------------------------------------------------------
// R8 — trunca por severidade (mais de 12 apontamentos no mesmo artefato)
// ---------------------------------------------------------------------------

/** A ordem de severidade para o truncamento estável do R8. */
const ORDEM_DE_SEVERIDADE: Readonly<Record<Apontamento['severity'], number>> = {
  bloqueante: 0,
  corrigir: 1,
  sugestao: 2,
};

/**
 * R8 — FUNÇÃO PURA: mais de `teto` apontamentos no MESMO artefato → trunca
 * por severidade (bloqueante > corrigir > sugestao), estável na ordem
 * original dentro do mesmo nível. Devolve { mantidos, truncados }.
 */
export function r8TruncaPorSeveridade(
  apontamentos: readonly Apontamento[],
  teto: number = R8_TETO,
): { mantidos: Apontamento[]; truncados: Apontamento[] } {
  if (apontamentos.length <= teto) return { mantidos: [...apontamentos], truncados: [] };
  const ordenados = [...apontamentos].sort((a, b) => {
    const porSeveridade = ORDEM_DE_SEVERIDADE[a.severity] - ORDEM_DE_SEVERIDADE[b.severity];
    return porSeveridade !== 0 ? porSeveridade : 0;
  });
  return { mantidos: ordenados.slice(0, teto), truncados: ordenados.slice(teto) };
}

// ---------------------------------------------------------------------------
// A bateria completa — filtrarApontamentos
// ---------------------------------------------------------------------------

/** O contexto do filtro: tudo o que ele precisa saber do mundo (injetado). */
export interface ContextoDoFiltro {
  /** conteúdo do artefato alvo por caminho; `null` = artefato inexistente. */
  obterConteudo: (caminho: string) => string | null;
  /** chaves de átomo PERMITIDAS pelo orçamento (o lado "no orçamento" do R4). */
  orcamento: readonly string[];
  /** executor endurecido para o R5 (createHardenedExec do chamador). */
  exec?: ExecFn;
  /** teto de tempo do R5 (default R5_TIMEOUT_MS_DEFAULT). */
  timeoutMs?: number;
  /** teto do R8 (default R8_TETO). */
  tetoDeApontamentos?: number;
}

function detalheDoDescarte(motivo: MotivoDeDescarte, extra: string): string {
  return `[${motivo}] ${extra}`;
}

/** O detalhe do R1: artefato inexistente nomeia o caminho; senão, o tamanho. */
function detalheDeR1(apontamento: Apontamento, conteudo: string | null): string {
  return conteudo === null
    ? `artefato "${apontamento.alvo.caminho}" não existe no contexto — o span [${apontamento.alvo.span[0]}, ${apontamento.alvo.span[1]}] é irresolvível`
    : `span [${apontamento.alvo.span[0]}, ${apontamento.alvo.span[1]}] irresolvível no artefato (${conteudo.length} caracteres)`;
}

/** O detalhe do R5: "rodou e não reproduziu" × "não pôde ser executado" (fail-closed). */
function detalheDeR5(apontamento: Apontamento, reproducao: Extract<ResultadoDeReproducao, { reproduz: false }>): string {
  return reproducao.razao === 'nao_reproduziu'
    ? `"${apontamento.evidencia.reproduzivel_por}" rodou e NÃO reproduziu (exit 0 sem o token "${apontamento.alvo.token}")`
    : `"${apontamento.evidencia.reproduzivel_por}" não pôde ser executado: ${reproducao.erro} (fail-closed)`;
}

/**
 * As regras R1→R7 para UM apontamento, na ORDEM do §6.4. O PRIMEIRO motivo
 * que descarta vence (um apontamento pode violar várias regras; o motivo
 * registrado é o primeiro da ordem). Devolve `null` quando o apontamento
 * sobrevive.
 */
async function classificarApontamento(
  apontamento: Apontamento,
  ctx: ContextoDoFiltro,
  timeoutMs: number,
): Promise<{ motivo: MotivoDeDescarte; detalhe: string } | null> {
  const conteudo = ctx.obterConteudo(apontamento.alvo.caminho);

  // R1 — span ausente/irresolvível. Artefato inexistente também (onde
  // verificar a evidência? o span nem sequer resolve a um arquivo).
  if (!r1SpanResoluvel(apontamento, conteudo)) {
    return { motivo: 'R1', detalhe: detalheDeR1(apontamento, conteudo) };
  }
  const artefato = conteudo as string;

  // R2 — o defeito não é frase declarativa.
  if (!r2FraseDeclarativa(apontamento)) {
    return {
      motivo: 'R2',
      detalhe: `defeito "${apontamento.defeito.trim()}" não é frase declarativa (≥${TAMANHO_MINIMO_DE_DEFEITO} caracteres, terminando em ".") — proxy determinístico do §6.4`,
    };
  }

  // R3 — não pede mudança (pergunta ou elogio).
  if (!r3PedeMudanca(apontamento)) {
    return { motivo: 'R3', detalhe: `defeito "${apontamento.defeito.trim()}" não pede mudança (pergunta ou elogio)` };
  }

  // R4 — evidência fora do span e fora do orçamento (substring no artefato).
  const naoVerificaveis = r4FragmentosNaoVerificaveis(apontamento, artefato, ctx.orcamento);
  if (naoVerificaveis.length > 0) {
    const descricoes = naoVerificaveis
      .map(
        (n) =>
          `"${n.fragmento}" ${n.motivo === 'fora_do_artefato' ? 'não existe no artefato (substring)' : 'fora do span e fora do orçamento'}`,
      )
      .join('; ');
    return { motivo: 'R4', detalhe: `evidência cita fragmento não verificável: ${descricoes}` };
  }

  // R5 — reproduzivel_por roda e não reproduz (execução com timeout).
  const reproducao = await r5ExigeReproducao(apontamento, ctx.exec, timeoutMs);
  if (!reproducao.reproduz) {
    return { motivo: 'R5', detalhe: detalheDeR5(apontamento, reproducao) };
  }

  // R6 — regra_violada fora da constituição C1–C8.
  if (!r6RegraNaConstituicao(apontamento)) {
    return {
      motivo: 'R6',
      detalhe: `regra_violada "${apontamento.regra_violada}" não existe na constituição C1–C8 (catálogo fechado — review/constituicao.ts)`,
    };
  }

  // R7 — categoria estilo com correção aberta.
  if (!r7SemCorrecaoAberta(apontamento)) {
    return {
      motivo: 'R7',
      detalhe: `categoria estilo com correção aberta em acao_sugerida ("${apontamento.acao_sugerida}") — o revisor não escreve código (§7.2)`,
    };
  }

  return null;
}

/** Agrupa os sobreviventes por caminho do alvo (a ordem de chegada vira ordem de grupo). */
function agruparPorCaminho(sobreviventes: readonly Apontamento[]): Map<string, Apontamento[]> {
  const porArtefato = new Map<string, Apontamento[]>();
  for (const s of sobreviventes) {
    const lista = porArtefato.get(s.alvo.caminho) ?? [];
    lista.push(s);
    porArtefato.set(s.alvo.caminho, lista);
  }
  return porArtefato;
}

/**
 * A bateria R1→R8, na ORDEM do §6.4. O PRIMEIRO motivo que descarta vence;
 * R8 trunca no fim (por artefato). `filtrarApontamentos` é síncrona exceto
 * pelo R5 (execução injetada com timeout) — por isso é `async` por contrato,
 * para o laço F11 e para a suíte não dependerem de detalhe interno.
 */
export async function filtrarApontamentos(
  apontamentos: readonly Apontamento[],
  ctx: ContextoDoFiltro,
): Promise<ResultadoDoFiltro> {
  const sobreviventes: Apontamento[] = [];
  const descartados: DescarteDoFiltro[] = [];
  const timeoutMs = ctx.timeoutMs ?? R5_TIMEOUT_MS_DEFAULT;
  const teto = ctx.tetoDeApontamentos ?? R8_TETO;

  const descartar = (apontamento: Apontamento, motivo: MotivoDeDescarte, detalhe: string): void => {
    descartados.push({ apontamento, motivo, detalhe: detalheDoDescarte(motivo, detalhe) });
  };

  for (const apontamento of apontamentos) {
    const classificacao = await classificarApontamento(apontamento, ctx, timeoutMs);
    if (classificacao !== null) descartar(apontamento, classificacao.motivo, classificacao.detalhe);
    else sobreviventes.push(apontamento);
  }

  // R8 — mais de 12 apontamentos no mesmo artefato → trunca por severidade.
  // A exclusão dos truncados é por artefato: mantém os 12 mais graves de cada
  // caminho (o teto do §6.4 é "no mesmo artefato").
  const porArtefato = agruparPorCaminho(sobreviventes);
  const finais: Apontamento[] = [];
  for (const [caminho, lista] of porArtefato) {
    const { mantidos, truncados } = r8TruncaPorSeveridade(lista, teto);
    finais.push(...mantidos);
    for (const t of truncados) {
      descartar(t, 'R8', `artefato "${caminho}" excedeu ${teto} apontamentos — truncado por severidade (bloqueante > corrigir > sugestao)`);
    }
  }

  return { sobreviventes: finais, descartados };
}