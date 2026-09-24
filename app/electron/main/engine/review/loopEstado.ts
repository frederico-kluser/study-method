/**
 * app/electron/main/engine/review/loopEstado.ts — a SESSÃO do laço de revisão
 * F11 e os ajudantes de estado/rotação (`loop.ts`). Extraído do módulo original
 * na refatoração do lote L05 sem NENHUMA mudança de comportamento — a fachada
 * `loop.ts` re-exporta tudo isto.
 */

import { regrasDaConstituicao } from './constituicao';
import { REPRODUZIVEL_MECANICO_PREFIX } from './filter';
import { normalizarArtefato } from './normalize';
import { PinsDeRegressao, type PinDeRegressao } from './prover';
import { LedgerDeRejeicoes, materialDoApontamento } from './rejections';
import { VersionBuffer } from './versionBuffer';
import type { Apontamento } from './actionCatalog';
import type {
  ArtefatoNoLaco,
  ContextoDoLaco,
  ErroEstruturadoDoLacoOptions,
  InstrumentoDeRevisao,
  SessaoDoLaco,
  ViolacaoMecanica,
} from './loopTipos';
import { ErroEstruturadoDoLaco, QUOTA_DE_SUGESTOES_POR_ARTEFATO } from './loopTipos';
import { hashDoConjunto } from './loopPrimitivas';

// ---------------------------------------------------------------------------
// A sessão
// ---------------------------------------------------------------------------

export function criarMapaDeArtefatos(artefatos: readonly ArtefatoNoLaco[]): Map<string, ArtefatoNoLaco> {
  const mapa = new Map<string, ArtefatoNoLaco>();
  for (const artefato of artefatos) mapa.set(artefato.caminho, { ...artefato });
  return mapa;
}

export function mapaToStrings(mapa: ReadonlyMap<string, ArtefatoNoLaco> | Map<string, ArtefatoNoLaco>): ReadonlyMap<string, string> {
  const saida = new Map<string, string>();
  for (const [caminho, artefato] of mapa) saida.set(caminho, artefato.conteudo);
  return saida;
}

/**
 * Cria a sessão de UMA execução do laço. EXPORTADA para a suíte (e para o
 * repair P-23) semear estado — pins pré-existentes, exceções intencionais no
 * ledger — antes de `rodarRodadaDeRevisao(ctx, sessao)`.
 */
export function criarSessaoDeRevisao(ctx: ContextoDoLaco): SessaoDoLaco {
  const artefatos = criarMapaDeArtefatos(ctx.artefatos);
  const sessao: SessaoDoLaco = {
    artefatos,
    buffer: new VersionBuffer(),
    ledger: new LedgerDeRejeicoes(),
    pins: new PinsDeRegressao({
      proverDesafio: ctx.proverDesafio,
      obterArquivo: async (caminho) => artefatos.get(caminho)?.conteudo ?? null,
    }),
    rodadaAtual: 0,
    hashes: [hashDoConjunto(artefatos)],
    estados: [mapaToStrings(artefatos)],
    distancias: [],
    bloqueantesPorRodada: [],
    apontamentosCorrigirAnterior: 0,
    sugestoesPorArtefato: new Map<string, Apontamento[]>(),
    sugestoesDescartadasPorQuota: 0,
    guardarSugestao: (artefato, apontamento) => {
      // A mesma sugestão (mesmo id) já registrada não consome quota de novo —
      // re-reportes do revisor entre rodadas não estouram a quota da aula.
      const atuais = sessao.sugestoesPorArtefato.get(artefato) ?? [];
      if (atuais.some((a) => a.id === apontamento.id)) return true;
      if (atuais.length >= QUOTA_DE_SUGESTOES_POR_ARTEFATO) {
        sessao.sugestoesDescartadasPorQuota += 1;
        return false;
      }
      atuais.push(apontamento);
      sessao.sugestoesPorArtefato.set(artefato, atuais);
      return true;
    },
  };
  return sessao;
}

// ---------------------------------------------------------------------------
// Ajudantes internos da rodada
// ---------------------------------------------------------------------------

/** Guarda o estado ATUAL de todos os artefatos no version buffer. */
export function guardarEstado(sessao: SessaoDoLaco, rodada: number, score: number): void {
  for (const artefato of sessao.artefatos.values()) {
    sessao.buffer.guardar({
      caminho: artefato.caminho,
      conteudo: artefato.conteudo,
      score_erro: score,
      rodada,
    });
  }
}

/** Restaura y_{t-1} (a versão anterior no buffer) em todos os artefatos. */
export function restaurarYAnterior(sessao: SessaoDoLaco): void {
  for (const artefato of sessao.artefatos.values()) {
    const anterior = sessao.buffer.anterior(artefato.caminho);
    if (anterior !== undefined) artefato.conteudo = anterior.conteudo;
  }
}

/** Restaura a versão de MENOR score do buffer (alvo do ping-pong, §6.6). */
export function restaurarMenorScore(sessao: SessaoDoLaco): void {
  for (const artefato of sessao.artefatos.values()) {
    const melhor = sessao.buffer.menorScore(artefato.caminho);
    if (melhor !== undefined && melhor.conteudo !== artefato.conteudo) artefato.conteudo = melhor.conteudo;
  }
}

/** A visão NORMALIZADA (P-12) que o revisor recebe — nunca o rascunho. */
export function visaoNormalizada(artefatos: ReadonlyMap<string, ArtefatoNoLaco> | Map<string, ArtefatoNoLaco>): string {
  const partes: string[] = [];
  for (const artefato of artefatos.values()) {
    partes.push(`Artefato: ${artefato.caminho}\n\n${normalizarArtefato(artefato.conteudo)}`);
  }
  return partes.join('\n\n---\n\n');
}

/** Renderiza as violações mecânicas para o bloco de verificadores do revisor. */
export function renderizarViolacoes(violacoes: readonly ViolacaoMecanica[]): string {
  if (violacoes.length === 0) return '';
  return violacoes
    .map((v, i) => `${i + 1}. ${v.mensagem} (${v.caminho}:${v.linha}:${v.coluna}; ${v.trechoOfensor})`)
    .join('\n');
}

/** Todas as chaves permitidas do snapshot (o lado "no orçamento" do R4). */
export function chavesPermitidas(ctx: ContextoDoLaco): string[] {
  const chaves = new Set<string>();
  for (const surface of ctx.snapshotDeOrcamento?.surfaces ?? []) {
    for (const permitida of surface.permitidos) chaves.add(permitida);
  }
  return [...chaves];
}

/** A categoria do apontamento mecânico, por tipo/construção (§5.5, §6.5). */
function categoriaDaViolacao(v: ViolacaoMecanica): Apontamento['categoria'] {
  if (v.tipo === 'execucao') {
    if (v.construcao === 'prova:solutionPasses') return 'gabarito_nao_passa';
    return 'teste_invalido';
  }
  if (v.construcao.startsWith('api:')) return 'api_nao_ensinada';
  return 'construcao_nao_ensinada';
}

/** violação mecânica → apontamento MEC-… (mesmo pipeline de correção). */
export function violacaoParaApontamento(v: ViolacaoMecanica, rodada: number, sequencia: number): Apontamento {
  const id = `MEC-${String(sequencia + 1).padStart(4, '0')}`;
  return {
    id,
    rodada,
    artefato: v.surface,
    alvo: { caminho: v.caminho, linha: Math.max(v.linha, 1), span: [v.inicio, v.fim], no_ast: v.construcao, token: v.construcao },
    evidencia: {
      tipo: v.tipo === 'execucao' ? 'execucao' : 'orcamento',
      prova: v.mensagem,
      introduzido_em: v.primeiraAulaQueEnsina,
      reproduzivel_por: `${REPRODUZIVEL_MECANICO_PREFIX} verificado pelo verificador determinístico nesta rodada`,
    },
    defeito: v.mensagem,
    regra_violada: 'C1',
    categoria: categoriaDaViolacao(v),
    severity: 'bloqueante',
    acao_sugerida:
      v.primeiraAulaQueEnsina === null
        ? 'criar a aula que ensina a construção (lacuna de currículo — §5.5), nunca reescrever para caber no furo'
        : 'reescrever o artefato sem a construção ou mover a aula que a ensina para antes (violação de ordem — §5.5)',
    confianca: 1,
  };
}

/** pin vermelho → apontamento regenerado (MESMO id — a regressão reabre). */
export function pinParaApontamento(pin: PinDeRegressao, rodada: number): Apontamento {
  return { ...pin.apontamento, rodada };
}

/** Valida e normaliza os instrumentos de revisão (regras DISJUNTAS). */
export function instrumentosDeRevisao(ctx: ContextoDoLaco): readonly InstrumentoDeRevisao[] {
  const instrumentos = ctx.revisores ?? [{ nome: 'unico', regras: regrasDaConstituicao(), chamar: ctx.llm.revisar }];
  const ids = new Map<string, string>();
  const constituicaoCompleta = new Set(regrasDaConstituicao().map((r) => r.id));
  const presentes = new Set<string>();
  for (const instrumento of instrumentos) {
    if (instrumento.regras.length === 0) {
      throw new ErroEstruturadoDoLaco({
        codigo: 'LACO_INSTRUMENTO_SEM_REGRAS',
        etapa: `revisor:${instrumento.nome}`,
        mensagem: `instrumento "${instrumento.nome}" sem regras — um revisor sem constituição não existe (fail-closed)`,
      });
    }
    for (const regra of instrumento.regras) {
      const dono = ids.get(regra.id);
      if (dono !== undefined) {
        throw new ErroEstruturadoDoLaco({
          codigo: 'LACO_REGRAS_NAO_DISJUNTAS',
          etapa: 'revisor',
          mensagem: `regra ${regra.id} em dois instrumentos (${dono} e ${instrumento.nome}) — categorias disjuntas por instrumento (§6.1)`,
        });
      }
      ids.set(regra.id, instrumento.nome);
      presentes.add(regra.id);
    }
  }
  if (instrumentos.length > 1) {
    const faltando = [...constituicaoCompleta].filter((id) => !presentes.has(id));
    if (faltando.length > 0) {
      throw new ErroEstruturadoDoLaco({
        codigo: 'LACO_CONSTITUICAO_INCOMPLETA',
        etapa: 'revisor',
        mensagem: `artigos de fora dos instrumentos: ${faltando.join(', ')} — a constituição C1–C8 inteira tem de ser revisada (§6.7, as DUAS polaridades)`,
      });
    }
  }
  return instrumentos;
}

/** O código do erro bruto do transporte (preservado; senão `LACO_ETAPA_FALHOU`). */
function codigoDeErro(erro: unknown): string {
  return typeof erro === 'object' && erro !== null && typeof (erro as { code?: unknown }).code === 'string'
    ? ((erro as { code: string }).code as string)
    : 'LACO_ETAPA_FALHOU';
}

/** A mensagem do erro bruto (Error → message; qualquer outro → String()). */
function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/** Wrapper fail-closed das chamadas LLM e do pipeline de validação. */
export async function chamarSeguro<T>(etapa: string, fn: () => Promise<T>, ctx: ContextoDoLaco): Promise<T> {
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof ErroEstruturadoDoLaco) throw erro;
    if (erro instanceof Error && erro.name === 'ErroDeRoteamento') {
      throw new ErroEstruturadoDoLaco({
        codigo: 'LACO_ROTEAMENTO_INVALIDO',
        etapa,
        mensagem: erro.message,
        causa: erro,
      });
    }
    throw new ErroEstruturadoDoLaco({
      codigo: codigoDeErro(erro),
      etapa,
      mensagem: mensagemDeErro(erro),
      causa: erro,
    });
  }
}
