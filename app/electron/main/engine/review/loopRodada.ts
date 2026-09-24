/**
 * app/electron/main/engine/review/loopRodada.ts — A RODADA do laço F11 (uma
 * barreira completa, `docs/16` §6.1 itens 1–6) e a cascata de parada (§6.6).
 *
 * Extraído de `rodarRodadaInterna` (CC 52 no módulo único) na refatoração do
 * lote L05: cada etapa virou função própria (teto, verificadores determinísticos,
 * revisor+filtro, provador+quota+exceções, planejador→corretor, re-verificação
 * final e cascata de parada), com COMPORTAMENTO OBSERVÁVEL preservado byte a
 * byte — inclusive a ordem dos pushes e os termos de LAG do score.
 */

import { validarRoteamento } from './normalize';
import { anexarSeveridadePorTabela } from '../prompts/reviewer';
import { filtrarApontamentos, type DescarteDoFiltro } from './filter';
import { criarPinParaAchado, type PinDeRegressao, type VereditoDePin } from './prover';
import { materialDoApontamento } from './rejections';
import type { Apontamento } from './actionCatalog';
import {
  ErroEstruturadoDoLaco,
  LIMIAR_DEFAULT_DE_ESTAGNACAO,
  TETO_DE_RODADAS,
  TOLERANCIA_DEFAULT_DE_ROLLBACK,
  TIMEOUT_DEFAULT_DE_EXECUCAO_MS,
  type ArtefatoNoLaco,
  type ContextoDoLaco,
  type PlacarDeEscalada,
  type ParadaDeRodada,
  type ResultadoDeRodada,
  type SessaoDoLaco,
  type VerificadorDeOrcamento,
  type VerificadorDeProvas,
  type ViolacaoMecanica,
} from './loopTipos';
import {
  avaliarParadaMecanica,
  calcularRodadasMaximas,
  criarVerificadorDeOrcamento,
  criarVerificadorDeProvas,
  distanciaDeArtefatos,
  hashDoConjunto,
  scoreErro,
} from './loopPrimitivas';
import {
  chamarSeguro,
  chavesPermitidas,
  guardarEstado,
  instrumentosDeRevisao,
  mapaToStrings,
  pinParaApontamento,
  restaurarMenorScore,
  restaurarYAnterior,
  renderizarViolacoes,
  violacaoParaApontamento,
  visaoNormalizada,
} from './loopEstado';
import { planejarECorrigir, type SaidasDoPlanoDeCorrecao } from './loopCorrecao';
import { avaliarCascataDeParada, empurrarHistorico } from './loopParada';

// ---------------------------------------------------------------------------
// A RODADA — uma barreira completa (§6.1, itens 1–6)
// ---------------------------------------------------------------------------

/**
 * O teto de rodadas CLAMPED do §6.6 (default 1, teto duro 3) — UMA única
 * conta para TODA a superfície pública do laço. A garantia normativa é:
 * NENHUM caminho roda além de `rodadasMaximas` — nem o laço, nem a chamada
 * avulsa `rodarRodadaDeRevisao`.
 *
 * A sessão já rodou `rodadasMaximas` rodadas → a PRÓXIMA rodada estaria
 * além do teto: erro ESTRUTURADO (fail-closed, nunca rodada extra em
 * silêncio). Vale para `rodarLacoDeRevisao` (sessão semeada esgotada) e
 * para `rodarRodadaDeRevisao` (a 2ª chamada com rodadasMaximas 1 LANÇA).
 */
function garantirTetoDeRodadas(ctx: ContextoDoLaco, sessao: SessaoDoLaco): number {
  const teto = calcularRodadasMaximas(ctx);
  if (sessao.rodadaAtual >= teto) {
    throw new ErroEstruturadoDoLaco({
      codigo: 'RODADAS_ESGOTADAS',
      etapa: 'laco',
      mensagem:
        `a sessão já rodou ${sessao.rodadaAtual} rodada(s) do teto ${teto} (teto duro ${TETO_DE_RODADAS}) — ` +
        'NENHUMA superfície pública roda além de rodadasMaximas (§6.6): falha estruturada, nunca rodada extra.',
    });
  }
  return teto;
}

/** (1) os verificadores determinísticos, injetados ou derivados do snapshot. */
function resolverVerificadores(ctx: ContextoDoLaco): {
  verificadorDeOrcamento: VerificadorDeOrcamento;
  verificadorDeProvas: VerificadorDeProvas;
} {
  const verificadorDeOrcamento =
    ctx.verificadorDeOrcamento ??
    (ctx.snapshotDeOrcamento !== undefined ? criarVerificadorDeOrcamento(ctx.snapshotDeOrcamento) : undefined);
  const verificadorDeProvas =
    ctx.verificadorDeProvas ?? (ctx.proverDesafio !== undefined ? criarVerificadorDeProvas(ctx.proverDesafio) : undefined);
  if (verificadorDeOrcamento === undefined) {
    throw new ErroEstruturadoDoLaco({
      codigo: 'LACO_SEM_VERIFICADOR_DE_ORCAMENTO',
      etapa: 'verificacao',
      mensagem: 'laço sem snapshotDeOrcamento e sem verificadorDeOrcamento injetado — o gate determinístico não existe (fail-closed)',
    });
  }
  if (verificadorDeProvas === undefined) {
    throw new ErroEstruturadoDoLaco({
      codigo: 'LACO_SEM_VERIFICADOR_DE_PROVAS',
      etapa: 'verificacao',
      mensagem: 'laço sem verificadorDeProvas injetado nem proverDesafio — as provas de execução não rodam (fail-closed)',
    });
  }
  return { verificadorDeOrcamento, verificadorDeProvas };
}

/** A mecânica da rodada: orçamento AST + provas + pins (o passo 1 do §6.1). */
interface MecanicaDaRodada {
  violacoesDeOrcamento: ViolacaoMecanica[];
  falhasDeProvas: ViolacaoMecanica[];
  vereditosDePins: VereditoDePin[];
  /** pins de SUGESTÃO fora — pin de sugestão não existe por construção (§6.5). */
  pinsDaMecanica: VereditoDePin[];
  pinsVermelhos: VereditoDePin[];
  temViolacaoMecanica: boolean;
}

async function rodarVerificadores(
  sessao: SessaoDoLaco,
  verificadorDeOrcamento: VerificadorDeOrcamento,
  verificadorDeProvas: VerificadorDeProvas,
): Promise<MecanicaDaRodada> {
  const violacoesDeOrcamento = await verificadorDeOrcamento(sessao.artefatos);
  const falhasDeProvas = await verificadorDeProvas(sessao.artefatos);
  const vereditosDePins = await sessao.pins.todosRodam();
  // Pin de SUGESTÃO não existe por construção (§6.5 — o provador ignora
  // sugestões); um pin SEMEADO com severity 'sugestao' é irrelevante para a
  // mecânica: não derruba a parada 0, não regenera apontamento (que reabriria
  // o canal de correção) e não segura o revisor fora.
  const pinsDaMecanica = vereditosDePins.filter((v) => v.pin.apontamento.severity !== 'sugestao');
  const pinsVermelhos = pinsDaMecanica.filter((v) => !v.verde);
  const temViolacaoMecanica = violacoesDeOrcamento.length > 0 || falhasDeProvas.length > 0 || pinsVermelhos.length > 0;
  return { violacoesDeOrcamento, falhasDeProvas, vereditosDePins, pinsDaMecanica, pinsVermelhos, temViolacaoMecanica };
}

/**
 * Apontamentos MECÂNICOS entram direto no pipeline (sem LLM — passo 1):
 * violações de orçamento/provas viraram apontamentos; pins vermelhos
 * REGENERAM o apontamento original do pin (a regressão mecânica reabre o
 * canal de correção com o MESMO id, e o ledger reconcilia por chave).
 */
function montarApontamentosMecanicos(mecanica: MecanicaDaRodada, rodada: number): Apontamento[] {
  const apontamentosMecanicos: Apontamento[] = [];
  for (let i = 0; i < mecanica.violacoesDeOrcamento.length; i += 1) {
    apontamentosMecanicos.push(violacaoParaApontamento(mecanica.violacoesDeOrcamento[i], rodada, i));
  }
  for (let i = 0; i < mecanica.falhasDeProvas.length; i += 1) {
    apontamentosMecanicos.push(violacaoParaApontamento(mecanica.falhasDeProvas[i], rodada, mecanica.violacoesDeOrcamento.length + i));
  }
  for (const pinVermelho of mecanica.pinsVermelhos) {
    apontamentosMecanicos.push(pinParaApontamento(pinVermelho.pin, rodada));
  }
  return apontamentosMecanicos;
}

/**
 * (2) REVISOR LLM — SÓ com os verificadores verdes — e (3) FILTRO ESTRUTURAL
 * R1–R8 (triagem separada do §6.5).
 */
async function revisarEFiltrar(
  ctx: ContextoDoLaco,
  sessao: SessaoDoLaco,
  rodada: number,
  mecanica: MecanicaDaRodada,
): Promise<{
  apontamentosDoRevisor: Apontamento[];
  descartados: DescarteDoFiltro[];
  revisorChamado: boolean;
}> {
  let apontamentosDoRevisor: Apontamento[] = [];
  let descartados: DescarteDoFiltro[] = [];
  let revisorChamado = false;
  if (!mecanica.temViolacaoMecanica) {
    // Roteamento ANTES da revisão (P-12) — fail-closed.
    await chamarSeguro('roteamento', async () => {
      validarRoteamento(ctx.modeloAutor, ctx.modeloRevisor, ctx.familias);
    }, ctx);

    const instrumentos = instrumentosDeRevisao(ctx);
    const visao = visaoNormalizada(sessao.artefatos);
    const verificadores = renderizarViolacoes([...mecanica.violacoesDeOrcamento, ...mecanica.falhasDeProvas]);
    const hashCode = hashDoConjunto(sessao.artefatos);
    const porId = new Map<string, Apontamento>();

    for (const instrumento of instrumentos) {
      const revisao = await chamarSeguro(`revisor:${instrumento.nome}`, async () => {
        const bruta = await instrumento.chamar({
          instrumento: instrumento.nome,
          artefatoNormalizado: visao,
          regras: instrumento.regras,
          verificadores,
          rodada,
          hashCode,
        });
        // Severidade por TABELA FIXA (§6.5) — categoria desconhecida LANÇA
        // (ErroDeCategoriaDesconhecida, fail-closed) e o wrapper estrutura.
        return anexarSeveridadePorTabela(bruta);
      }, ctx);
      for (const apontamento of revisao.apontamentos) porId.set(apontamento.id, apontamento);
      revisorChamado = true;
    }
    apontamentosDoRevisor = [...porId.values()];

    // ── (3) FILTRO ESTRUTURAL R1–R8 (triagem separada do §6.5) ───────────────
    const resultadoDoFiltro = await filtrarApontamentos(apontamentosDoRevisor, {
      obterConteudo: (caminho) => sessao.artefatos.get(caminho)?.conteudo ?? null,
      orcamento: chavesPermitidas(ctx),
      exec: ctx.execDeReproducaoR5,
      timeoutMs: ctx.timeoutDeExecucaoMs ?? TIMEOUT_DEFAULT_DE_EXECUCAO_MS,
    });
    descartados = resultadoDoFiltro.descartados;
  }
  return { apontamentosDoRevisor, descartados, revisorChamado };
}

/**
 * (4) PROVADOR — candidatos (mecânicos + sobreviventes do filtro) viram pins;
 * candidato SEM PIN MORRE EM SILÊNCIO (§6.1). Mais a QUOTA DE SUGESTÕES (§6.5)
 * e a EXCEÇÃO INTENCIONAL (6.7).
 */
async function provarCandidatos(
  ctx: ContextoDoLaco,
  sessao: SessaoDoLaco,
  apontamentosMecanicos: readonly Apontamento[],
  apontamentosDoRevisor: readonly Apontamento[],
  descartados: readonly DescarteDoFiltro[],
): Promise<{
  sugestoes: Apontamento[];
  sugestoesDescartadasPorQuota: number;
  comPin: { apontamento: Apontamento; pin: PinDeRegressao }[];
  excluidos: string[];
  agir: Apontamento[];
}> {
  const apontamentosSobreviventesDoFiltro = apontamentosDoRevisor.filter(
    (a) => !descartados.some((d) => d.apontamento.id === a.id),
  );
  // §6.5 — SUGESTÃO NUNCA ABRE RODADA: `sugestao` sobrevivente ao filtro NÃO
  // passa pelo provador (SEM pin, por construção — "o provador ignora
  // sugestões"); vai para a QUOTA POR ARTEFATO da sessão. Tudo o resto
  // (bloqueante/corrigir, mecânicos inclusos) segue o pipeline.
  const sugestoesDoRevisor = apontamentosSobreviventesDoFiltro.filter((a) => a.severity === 'sugestao');
  const candidatos = [...apontamentosMecanicos, ...apontamentosSobreviventesDoFiltro.filter((a) => a.severity !== 'sugestao')];
  const provados: { apontamento: Apontamento; pin: PinDeRegressao | null }[] = [];
  for (const candidato of candidatos) {
    const pin = await chamarSeguro(
      `provador:${candidato.id}`,
      () =>
        criarPinParaAchado(candidato, {
          obterArquivo: async (caminho) => sessao.artefatos.get(caminho)?.conteudo ?? null,
          proverDesafio: ctx.proverDesafio,
        }),
      ctx,
    );
    provados.push({ apontamento: candidato, pin });
  }
  const comPin = provados
    .filter((p): p is { apontamento: Apontamento; pin: PinDeRegressao } => p.pin !== null)
    .map((p) => ({ apontamento: p.apontamento, pin: p.pin }));
  for (const c of comPin) sessao.pins.adicionarPin(c.pin);

  // ── QUOTA DE SUGESTÕES (§6.5 — 3 por artefato/aula) ───────────────────────
  // Guardadas FORA do pipeline; além da quota → descartada COM CONTAGEM
  // registrada na sessão (fail-closed declarado: porta de saída observável,
  // nunca abertura de rodada).
  let sugestoesDescartadasPorQuota = 0;
  for (const sugestao of sugestoesDoRevisor) {
    if (!sessao.guardarSugestao(sugestao.alvo.caminho, sugestao)) {
      sugestoesDescartadasPorQuota += 1;
    }
  }

  // ── EXCEÇÃO INTENCIONAL (6.7): apontamento nesse estado NÃO reabre rodada ──
  // O pin dele é DESARMADO (a decisão de projeto contradiz a regressão; o
  // ledger desconta importância); o id entra na lista DECLARADA do planejador.
  const excluidos: string[] = [];
  const agir: Apontamento[] = [];
  for (const c of comPin) {
    const conteudo = sessao.artefatos.get(c.apontamento.alvo.caminho)?.conteudo ?? null;
    const material = materialDoApontamento(c.apontamento, conteudo);
    if (sessao.ledger.eExcecaoIntencional(material)) {
      // Exceção intencional NÃO reabre rodada (§6.7): fora do plano, e a
      // regressão mecânica dele sai do conjunto (o pin contradiz a decisão
      // de projeto — o DESARME é o canal; a importância do ledger já foi
      // descontada quando a exceção foi confirmada).
      excluidos.push(c.apontamento.id);
      sessao.pins.removerPin(c.pin.id);
      continue;
    }
    agir.push(c.apontamento);
  }

  return { sugestoes: sugestoesDoRevisor, sugestoesDescartadasPorQuota, comPin, excluidos, agir };
}

/** O que a re-verificação FINAL mede (itens TOCADOS + TODOS os pins). */
interface ReverificacaoFinal {
  violacoesFinais: ViolacaoMecanica[];
  provasFinais: ViolacaoMecanica[];
  pinsFalhandoFinal: number;
  semExcecao: Apontamento[];
  bloqueantesOuCorrigir: Apontamento[];
  somenteCorrigir: number;
  scoreDepois: number;
}

async function reverificarEFinalizar(
  sessao: SessaoDoLaco,
  verificadorDeOrcamento: VerificadorDeOrcamento,
  verificadorDeProvas: VerificadorDeProvas,
  correcoes: SaidasDoPlanoDeCorrecao['correcoes'],
  comPin: readonly { apontamento: Apontamento; pin: PinDeRegressao }[],
  excluidos: readonly string[],
  rodada: number,
  pinsAnterioresVermelhos: number,
): Promise<ReverificacaoFinal> {
  // ── RE-VERIFICAÇÃO FINAL: só os itens TOCADOS + TODOS os pins ─────────────
  const tocados = new Set(correcoes.map((c) => c.arquivo));
  const mapaDaReVerificacao =
    tocados.size === 0
      ? sessao.artefatos
      : (() => {
          const mapa = new Map<string, ArtefatoNoLaco>();
          for (const caminho of tocados) {
            const artefato = sessao.artefatos.get(caminho);
            if (artefato !== undefined) mapa.set(caminho, artefato);
          }
          return mapa;
        })();
  const [violacoesFinais, provasFinais] = await Promise.all([
    verificadorDeOrcamento(mapaDaReVerificacao),
    verificadorDeProvas(mapaDaReVerificacao),
  ]);
  const vereditosFinais = await sessao.pins.todosRodam();
  // A parada 0 e o score contam APENAS pins de bloqueante/corrigir (§6.5):
  // pin de sugestão — semeado ou não — nunca derruba a parada 0.
  const pinsDaMecanicaFinais = vereditosFinais.filter((v) => v.pin.apontamento.severity !== 'sugestao');
  const pinsFalhandoFinal = pinsDaMecanicaFinais.filter((v) => !v.verde).length;

  // Os sobreviventes AO PROVADOR que importam para a parada 0 e para o score:
  // excluídos não reabrem rodada e não contam; sugestão nunca abre (§6.5); e
  // um sobrevivente cujo PIN JÁ ESTÁ VERDE foi CORRIGIDO — não é mais um
  // bloqueador em aberto (uma rodada que conserta tudo precisa PARAR, §6.6).
  const sobreviventesAoProvador = comPin.map((c) => c.apontamento);
  const semExcecao = sobreviventesAoProvador.filter((a) => !excluidos.includes(a.id));
  const redIds = new Set(pinsDaMecanicaFinais.filter((v) => !v.verde).map((v) => v.pin.id));
  const bloqueantesOuCorrigir = semExcecao.filter((a) => a.severity !== 'sugestao' && redIds.has(`pin-${a.id}`));
  const somenteCorrigir = semExcecao.filter((a) => a.severity === 'corrigir' && redIds.has(`pin-${a.id}`)).length;

  // score_erro (§6.6) — termos de LAG mantidos do estado ANTERIOR (ver
  // scoreAntes): a comparação com a tolerância de rollback mede a piora
  // do estado PROVÁVEL e das regressões prévias, não a descoberta de
  // bloqueadores novos pela própria rodada.
  const scoreDepois = scoreErro(
    violacoesFinais.length,
    provasFinais.length,
    pinsAnterioresVermelhos,
    sessao.apontamentosCorrigirAnterior,
  );
  sessao.apontamentosCorrigirAnterior = somenteCorrigir;

  // O estado pós-rodada entra no buffer (toda versão é guardada — §6.7).
  guardarEstado(sessao, rodada, scoreDepois);

  // Históricos do laço (ping-pong, estagnação) — snapshot do estado
  // pós-rodada ANTES de qualquer restauração da cascata.
  empurrarHistorico(sessao, bloqueantesOuCorrigir.length);

  return { violacoesFinais, provasFinais, pinsFalhandoFinal, semExcecao, bloqueantesOuCorrigir, somenteCorrigir, scoreDepois };
}

/** UMA rodada de revisão — a barreira completa do §6.1 (itens 1–6). */
export async function rodarRodadaInterna(ctx: ContextoDoLaco, sessao: SessaoDoLaco): Promise<ResultadoDeRodada> {
  const teto = garantirTetoDeRodadas(ctx, sessao);
  const rodada = sessao.rodadaAtual + 1;
  sessao.rodadaAtual = rodada;

  // ── (1) VERIFICADORES DETERMINÍSTICOS — orçamento AST + provas + pins ─────
  const { verificadorDeOrcamento, verificadorDeProvas } = resolverVerificadores(ctx);
  const mecanica = await rodarVerificadores(sessao, verificadorDeOrcamento, verificadorDeProvas);

  // Guarda o estado pré-rodada (y_{t-1} para rollback, §6.6) com o score dela.
  // Score com termos de LAG (pins vermelhos e corrigir pendentes medidos no
  // estado ANTERIOR — ver apontamento no cabeçalho): a rodada que apenas
  // DESCOBRE um bloqueador novo não se auto-castiga com rollback. Pins criados
  // NESTA rodada ficam fora do score.
  const pinsAnterioresVermelhos = mecanica.pinsDaMecanica.filter((v) => !v.verde && v.pin.criado_na_rodada < rodada).length;
  const scoreAntes = scoreErro(
    mecanica.violacoesDeOrcamento.length,
    mecanica.falhasDeProvas.length,
    pinsAnterioresVermelhos,
    sessao.apontamentosCorrigirAnterior,
  );
  guardarEstado(sessao, rodada - 1, scoreAntes);

  const apontamentosMecanicos = montarApontamentosMecanicos(mecanica, rodada);

  // ── (2) REVISOR LLM — SÓ com os verificadores verdes ──────────────────────
  // ── (3) FILTRO ESTRUTURAL R1–R8 ───────────────────────────────────────────
  const revisao = await revisarEFiltrar(ctx, sessao, rodada, mecanica);

  // ── (4) PROVADOR + quota de sugestões + exceção intencional ───────────────
  const provador = await provarCandidatos(
    ctx,
    sessao,
    apontamentosMecanicos,
    revisao.apontamentosDoRevisor,
    revisao.descartados,
  );

  // ── (5) PLANEJADOR → CORRETOR (catálogo FECHADO; gate do diff) ─────────────
  const verdesAntes = new Set(mecanica.pinsDaMecanica.filter((v) => v.verde).map((v) => v.pin.id));
  const correcao = await planejarECorrigir({
    ctx,
    sessao,
    rodada,
    agir: provador.agir,
    excluidos: provador.excluidos,
    comPin: provador.comPin,
    vereditosDePins: mecanica.vereditosDePins,
    verdesAntes,
  });

  // ── RE-VERIFICAÇÃO FINAL: só os itens TOCADOS + TODOS os pins ──────────────
  const final = await reverificarEFinalizar(
    sessao,
    verificadorDeOrcamento,
    verificadorDeProvas,
    correcao.correcoes,
    provador.comPin,
    provador.excluidos,
    rodada,
    pinsAnterioresVermelhos,
  );

  // ── A CASCATA DE PARADA (6.6), na ordem em que dispara ─────────────────────
  const { parada, escalada } = avaliarCascataDeParada({
    ctx,
    sessao,
    rodada,
    teto,
    scoreAntes,
    scoreDepois: final.scoreDepois,
    violacoesFinais: final.violacoesFinais.length,
    provasFinais: final.provasFinais.length,
    pinsFalhandoFinal: final.pinsFalhandoFinal,
    bloqueantesOuCorrigir: final.bloqueantesOuCorrigir,
    semExcecao: final.semExcecao,
  });

  return {
    rodada,
    temViolacaoMecanica: mecanica.temViolacaoMecanica,
    revisorChamado: revisao.revisorChamado,
    apontamentosDoRevisor: revisao.apontamentosDoRevisor,
    descartados: revisao.descartados,
    apontamentosMecanicos,
    sobreviventesAoProvador: provador.comPin.map((c) => c.apontamento),
    sugestoes: provador.sugestoes,
    sugestoesDescartadasPorQuota: provador.sugestoesDescartadasPorQuota,
    excluidosComoExcecao: provador.excluidos,
    pinsCriados: provador.comPin.map((c) => c.pin),
    defeitosDoCatalogo: correcao.defeitosDoCatalogo,
    plano: correcao.plano,
    correcoes: correcao.correcoes,
    rejeicoesDoCorretor: correcao.rejeicoesDoCorretor,
    correcoesInvalidas: correcao.correcoesInvalidas,
    rejeicoesPorPinQuebrado: correcao.rejeicoesPorPinQuebrado,
    violacoesDeOrcamento: final.violacoesFinais.length,
    falhasDeProvas: final.provasFinais.length,
    pinsFalhando: final.pinsFalhandoFinal,
    scoreAntes,
    scoreDepois: final.scoreDepois,
    parada,
    escalada,
  };
}
