/**
 * tests/engineReviewLoop.test.ts — pacote P-18: O LAÇO COMPLETO de revisão
 * F11 (`docs/16-engine-de-trilha.md` §6 inteiro + §5.5). O pacote MAIS
 * perigoso do plano — a regra de ouro: NENHUM caminho de código com laço
 * aberto sobre apontamento do revisor; a parada 0 é MECÂNICA.
 *
 * O que este arquivo PROVA (critérios de aceitação A-P18-1..3):
 *   1. com violação MECÂNICA presente, o revisor LLM NÃO é chamado
 *      (contador de chamadas — o LLM caro só entra com os 3 verificadores
 *      verdes, §6.1);
 *   2. R1 a R8: um teste por regra, cada um descartando PELO MOTIVO CERTO
 *      (o PRIMEIRO motivo da ordem R1→R8 vence — filtro estrutural do §6.4);
 *   3. achado cujo trecho não existe no artefato é descartado por SUBSTRING
 *      (mitigação nomeada do §6.4 para revisor que alucina);
 *   4. achado SEM pin (provador) NÃO chega ao planejador — morre em silêncio
 *      (§6.1 fluxo 4);
 *   5. ping-pong entre duas versões é detectado (hash(y_t) == hash(y_t-2) !=
 *      hash(y_t-1)) e devolve a de menor score no version buffer (§6.6);
 *   6. correção que piora o score sofre ROLLBACK (score_erro_t >
 *      score_erro_t-1 + 0,10 → volta y_{t-1}, §6.6);
 *   7. correção que quebra PIN VERDE é REJEITADA — artefato volta (§6.7);
 *   8. na rodada 3 sem convergir, ESCALA com placar (quality_warning) —
 *      nunca aceita por cansaço (§6.6 failsafe);
 *   9. apontamento marcado excecao_intencional NÃO reabre rodada (§6.7);
 *  10. revisor indisponível produz erro ESTRUTURADO (fail-closed), nunca
 *      aprovação por omissão (§9.3);
 *  11. não existe caminho de código com laço aberto sobre apontamento do
 *      revisor — o laço roda EXATAMENTE maxRodadas (constante): com
 *      apontamentos eternos a execução TERMINA em maxRodadas (e uma variante
 *      que estagna termina ANTES, sempre ≤ maxRodadas);
 *  12. (bônus) parada 0 MECÂNICA: revisor "aprova" mas pin vermelho → NÃO
 *      para (o oráculo é mecânico, `avaliarParadaMecanica` é função pura); e
 *      filtro R6 com regra_violada fora de C1–C8 → descartado.
 *
 * Revisor LLM FAKE (contador de chamadas), provas FAKE (A-P07-2), executor de
 * R5 FAKE: OFFLINE — a suíte não gera processo, não toca rede nem disco.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSTITUICAO,
  IDS_DA_CONSTITUICAO,
  artigosPorEixo,
  regraExisteNaConstituicao,
  regrasDaConstituicao,
} from '../electron/main/engine/review/constituicao';
import {
  R8_TETO,
  filtrarApontamentos,
  r1SpanResoluvel,
  r2FraseDeclarativa,
  r3PedeMudanca,
  r4EvidenciaVerificavel,
  r5ExigeReproducao,
  r6RegraNaConstituicao,
  r7SemCorrecaoAberta,
  r8TruncaPorSeveridade,
} from '../electron/main/engine/review/filter';
import {
  PinsDeRegressao,
  criarPinParaAchado,
  extrairProvasDoArtefato,
  pinAst,
  type PinDeRegressao,
  type ProverDeDesafio,
} from '../electron/main/engine/review/prover';
import {
  CONFIRMACOES_PARA_EXCECAO,
  IMPORTANCIA_INICIAL,
  LedgerDeRejeicoes,
  chaveDeRejeicao,
  justificativaDeRejeicaoValida,
  materialDoApontamento,
} from '../electron/main/engine/review/rejections';
import { VersionBuffer, hashDeConteudo } from '../electron/main/engine/review/versionBuffer';
import {
  ErroEstruturadoDoLaco,
  QUOTA_DE_SUGESTOES_POR_ARTEFATO,
  avaliarParadaMecanica,
  criarSessaoDeRevisao,
  distanciaDeArtefatos,
  jaccardNormalizado,
  rodarLacoDeRevisao,
  rodarRodadaDeRevisao,
  scoreErro,
  type ContextoDoLaco,
  type ViolacaoMecanica,
} from '../electron/main/engine/review/loop';
import { PREDICADOS_DA_AULA, type RevisaoDoRevisor } from '../electron/main/engine/prompts/reviewer';
import type { AcaoCatalogo, Apontamento } from '../electron/main/engine/review/actionCatalog';
import type { ChallengeProofsInput, ChallengeProofsVerdict, ExecFn } from '../electron/main/engine/exec/proofs';
import type { TrechoDeDiff } from '../electron/main/engine/prompts/fixer';

// ---------------------------------------------------------------------------
// Fixtures — conteúdos de artefato e apontamento (nada de trilha real)
// ---------------------------------------------------------------------------

const CAMINHO = 'aula.md';
const CONTEUDO = 'O laço dobra com typeof na linha 1.'; // 35 caracteres

/** Nº de contradições até a importância do ledger chegar a 0 (nasce 2, +1/+1). */
const CONTRADICOES_ATE_REMOCAO = IMPORTANCIA_INICIAL + 2;

/** O apontamento canônico (schema P-04) — factory com override por campo. */
type Over = Partial<Omit<Apontamento, 'alvo' | 'evidencia'>> & {
  alvo?: Partial<Apontamento['alvo']>;
  evidencia?: Partial<Apontamento['evidencia']>;
};

const APT_BASE: Apontamento = {
  id: 'APT-0001',
  rodada: 1,
  artefato: 'aula',
  alvo: {
    caminho: CAMINHO,
    linha: 1,
    span: [17, 23] as [number, number], // 'typeof' em CONTEUDO (índices UTF-16)
    no_ast: 'TypeOfExpression',
    token: 'typeof',
  },
  evidencia: {
    tipo: 'orcamento',
    prova: 'o trecho `typeof` não pertence ao orçamento desta aula',
    introduzido_em: 'm01/a03',
    reproduzivel_por: 'mecanico: verificado pelo verificador determinístico nesta rodada',
  },
  defeito: 'O artefato usa a construção fora do orçamento na linha 1.',
  regra_violada: 'C1',
  categoria: 'construcao_nao_ensinada',
  severity: 'bloqueante' as const,
  acao_sugerida: 'reescrever sem a construção',
  confianca: 0.95,
};

function apt(over: Over = {}): Apontamento {
  return {
    ...APT_BASE,
    ...over,
    alvo: { ...APT_BASE.alvo, ...over.alvo },
    evidencia: { ...APT_BASE.evidencia, ...over.evidencia },
  };
}

/** O índice do trecho `token` em `conteudo` (para spans honestos). */
function spanDoToken(conteudo: string, token: string): [number, number] {
  const inicio = conteudo.indexOf(token);
  assert.ok(inicio >= 0, `token "${token}" precisa existir no conteúdo do fixture`);
  return [inicio, inicio + token.length];
}

/** Apontamento cujo alvo/evidência apontam para um `token` REAL do conteúdo. */
function aptSobre(conteudo: string, token: string, over: Over = {}): Apontamento {
  const span = spanDoToken(conteudo, token);
  return apt({
    ...over,
    alvo: { ...APT_BASE.alvo, ...over.alvo, span, token },
    evidencia: {
      ...APT_BASE.evidencia,
      ...over.evidencia,
      prova: over.evidencia?.prova ?? `o trecho \`${token}\` está fora do orçamento`,
    },
  });
}

/** Revisão completa (schema P-12) pronta para o fake do revisor. */
function revisaoCom(apontamentos: readonly Apontamento[], rodada = 1): RevisaoDoRevisor {
  return {
    artefato: 'aula',
    hash_artefato: 'h',
    rodada,
    apontamentos: apontamentos.map((a) => {
      const semSeveridade: Omit<Apontamento, 'severity'> = {
        id: a.id,
        rodada: a.rodada,
        artefato: a.artefato,
        alvo: a.alvo,
        evidencia: a.evidencia,
        defeito: a.defeito,
        regra_violada: a.regra_violada,
        categoria: a.categoria,
        acao_sugerida: a.acao_sugerida,
        confianca: a.confianca,
      };
      return semSeveridade as unknown as RevisaoDoRevisor['apontamentos'][number];
    }),
    resumo: 'revisão sintética da suíte',
    predicados: PREDICADOS_DA_AULA.map((p) => ({
      id: p.id as 'E1' | 'E2' | 'E3' | 'E4' | 'E5',
      pergunta: p.pergunta,
      justificativa: 'justificativa sintética',
      veredito: 'sim' as const,
    })),
  };
}

/** Revisor fake que NUNCA acha nada (aprova por ausência — jamais parada 0). */
async function revisorInerte(_entrada: Parameters<ContextoDoLaco['llm']['revisar']>[0]): Promise<RevisaoDoRevisor> {
  return revisaoCom([]);
}

/** Planejador fake: UMA ação prescrita do catálogo, span do próprio alvo. */
function planejadorDeAcaoUnica(acao: AcaoCatalogo): ContextoDoLaco['llm']['planejar'] {
  return async (entrada) => ({
    acoes: entrada.apontamentos.map((a, i) => ({
      posicao: i,
      apontamento_id: a.id,
      alvo: { arquivo: a.alvo.caminho, span: a.alvo.span as [number, number] },
      motivo: `ação prescrita pela suíte para ${a.id}`,
      acao,
      resultado_esperado: 'o verificador determinístico fica verde',
    })),
  });
}

/** Corretor fake: aplica o delta sequencial fornecido (um por chamada). */
function corretorSequencial(deltas: readonly TrechoDeDiff[][]): ContextoDoLaco['llm']['corrigir'] {
  let chamada = 0;
  return async () => {
    const delta = deltas[Math.min(chamada, deltas.length - 1)];
    chamada += 1;
    return { rejeitado: false, delta: delta ?? [] };
  };
}

/** Corretor fake: SEMPRE rejeita com justificativa válida (≥40 caracteres). */
async function corretorRejeitador(): Promise<{ rejeitado: true; justificativa: string }> {
  return {
    rejeitado: true,
    justificativa: 'A evidência do apontamento não se confirma ao reler o artefato no span indicado (verify-first).',
  };
}

/** Provas fake: sempre VÁLIDAS (quatro provas verdes do §5.4). */
const provasValidas: ProverDeDesafio = async (_input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => ({
  valid: true,
  failures: [],
  declared: 1,
  executed: 1,
});

/** Uma violação mecânica tipada (orçamento) sobre um token do conteúdo. */
function violacaoSobre(caminho: string, conteudo: string, token: string): ViolacaoMecanica {
  const [inicio, fim] = spanDoToken(conteudo, token);
  return {
    caminho,
    surface: 'solutionCode',
    construcao: `op:${token}`,
    tipo: 'orcamento' as const,
    inicio,
    fim,
    linha: 1,
    coluna: inicio + 1,
    trechoOfensor: token,
    primeiraAulaQueEnsina: null,
    mensagem: `construção op:${token} fora do orçamento da superfície solutionCode`,
  };
}

/** O contexto base da suíte: VERIFICADORES verdes, LLMs inertes, offline. */
function contextoBase(over: Partial<ContextoDoLaco> = {}): ContextoDoLaco {
  return {
    trilha: 'trilha-teste',
    artefatos: [{ caminho: CAMINHO, nome: 'aula', conteudo: CONTEUDO, ultimaEdicao: -1 }],
    proverDesafio: provasValidas,
    verificadorDeOrcamento: async () => [],
    verificadorDeProvas: async () => [],
    llm: {
      revisar: revisorInerte,
      planejar: async () => ({ acoes: [] }),
      corrigir: corretorRejeitador,
    },
    modeloAutor: 'autor-1',
    modeloRevisor: 'revisor-2',
    rodadasMaximas: 1,
    ...over,
  };
}

/** Constrói um PIN sessão-seedável (aferição AST) com os campos obrigatórios. */
function pinAstManual(apontamento: Apontamento, trecho: string, criadoNaRodada: number): PinDeRegressao {
  return {
    id: `pin-${apontamento.id}`,
    apontamento,
    descricao: `a ofensa "${trecho}" some do artefato`,
    alvo: { caminho: apontamento.alvo.caminho },
    afericao: { tipo: 'ast', trecho },
    criado_na_rodada: criadoNaRodada,
  };
}

/** Executor FAKE do R5: exit 0 e saída sem o token → NÃO reproduz. */
const execLimpo: ExecFn = async () => ({ exitCode: 0, stdout: '', stderr: '' });

/**
 * Uma SUGESTÃO §6.5 honesta (categoria `estilo` → severity `sugestao` pela
 * tabela fixa). Passa o filtro R1–R8 (span real, evidência no span, sem
 * correção aberta no `acao_sugerida`) e NÃO abre rodada (§6.5).
 */
function sugestaoSobre(conteudo: string, token: string, over: Over = {}, id = 'APT-SUG'): Apontamento {
  return aptSobre(conteudo, token, {
    id,
    categoria: 'estilo',
    severity: 'sugestao' as const,
    acao_sugerida: 'rever a redação desta seção em outra rodada.',
    ...over,
  });
}

// ---------------------------------------------------------------------------
// 0. Fundamentos — constituição, pins, ledger, buffer (unidades puras)
// ---------------------------------------------------------------------------

describe('P-18 · fundamentos — constituição e primitivos puros', () => {
  it('C1–C8 são constantes NOMEADAS com as DUAS polaridades (§6.7)', () => {
    assert.equal(CONSTITUICAO.length, 8);
    assert.deepEqual([...IDS_DA_CONSTITUICAO], ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']);
    const restritivo = artigosPorEixo('restritivo').map((r) => r.id);
    const construtivo = artigosPorEixo('construtivo').map((r) => r.id);
    // As DUAS polaridades na mesma rodada; nenhum artigo fica de fora.
    assert.deepEqual([...restritivo, ...construtivo].sort(), [...IDS_DA_CONSTITUICAO].sort());
    assert.deepEqual(restritivo, ['C1', 'C2', 'C3', 'C4']);
    assert.deepEqual(construtivo, ['C5', 'C6', 'C7', 'C8']);
    assert.equal(regraExisteNaConstituicao('C1'), true);
    assert.equal(regraExisteNaConstituicao('C99'), false);
    // O catálogo de regras do REVISOR (P-12) deriva daqui — fonte única.
    assert.equal(regrasDaConstituicao().length, 8);
  });

  it('pinAst: pin barato por AST (token proibido na AST) e fallback por substring', () => {
    const artefato = 'export const x = typeof y;';
    // `typeof` é op:unary:typeof — átomo substantivo; remover a ofensa verdeia.
    assert.equal(pinAst(artefato, 'typeof y'), true, 'pin vermelho enquanto a ofensa está no artefato');
    assert.equal(pinAst(artefato.replace('typeof ', ''), 'typeof y'), false, 'removida a ofensa, o pin verdeia');
    // Fallback por substring (trecho que não parseia — prosa/markdown).
    assert.equal(pinAst('A teoria explica o laço.', 'laço'), true);
    assert.equal(pinAst('A teoria explica a recursão.', 'laço'), false);
    assert.equal(pinAst('', ''), true, 'trecho vazio: o defeito segue (o provador nunca cria pin vazio)');
  });

  it('PinsDeRegressao: adicionarPin deduplica, todosRodam roda o conjunto, quebrados reporta', async () => {
    const artefatos = new Map([[CAMINHO, { caminho: CAMINHO, nome: 'aula', conteudo: 'texto com proibido', ultimaEdicao: -1 }]]);
    const colecao = new PinsDeRegressao({
      proverDesafio: provasValidas,
      obterArquivo: async (c) => artefatos.get(c)?.conteudo ?? null,
    });
    colecao.adicionarPin(pinAstManual(apt({ id: 'APT-X1' }), 'proibido', 0));
    colecao.adicionarPin(pinAstManual(apt({ id: 'APT-X1' }), 'proibido', 0)); // mesmo id → no-op
    assert.equal(colecao.pins.length, 1);
    const vereditos = await colecao.todosRodam();
    assert.equal(vereditos[0].verde, false, 'ofensa presente → pin vermelho');
    assert.deepEqual(colecao.quebrados().map((p) => p.id), ['pin-APT-X1']);
    // Corrige o artefato → o conjunto re-afere e o pin verdeia.
    artefatos.set(CAMINHO, { caminho: CAMINHO, nome: 'aula', conteudo: 'texto limpo', ultimaEdicao: 1 });
    const depois = await colecao.todosRodam();
    assert.equal(depois[0].verde, true);
    assert.equal(colecao.quebrados().length, 0);
  });

  it('LedgerDeRejeicoes: chave regra|alvo_normalizado|conceito, importância 2, +1 confirma, −1 pin, remove em 0', () => {
    const a = aptSobre(CONTEUDO, 'typeof');
    const material = materialDoApontamento(a, CONTEUDO);
    assert.ok(chaveDeRejeicao(material).startsWith('C1 |'));
    assert.equal(justificativaDeRejeicaoValida('curta'), false);

    const ledger = new LedgerDeRejeicoes();
    const j1 = 'justificativa com mais de quarenta caracteres de texto';
    const j2 = 'justificativa repetida com mais de quarenta caracteres de texto';
    assert.equal(justificativaDeRejeicaoValida(j1), true);

    const criada = ledger.registrarRejeicao({ material, justificativa: j1, rodada: 1, apontamento_id: 'APT-0001' });
    assert.equal(criada.criada, true);
    assert.equal(criada.entrada.importancia, IMPORTANCIA_INICIAL);
    assert.equal(criada.entrada.estado, 'rejeitado');

    // Confirmação 1 (mesma chave de novo).
    ledger.registrarRejeicao({ material, justificativa: j2, rodada: 2, apontamento_id: 'APT-0002' });
    // Confirmação 2 → PROMOVIDA a excecao_intencional (decisão espelhada).
    const promovida = ledger.registrarRejeicao({ material, justificativa: j2, rodada: 3, apontamento_id: 'APT-0003' });
    assert.equal(promovida.entrada.confirmacoes, CONFIRMACOES_PARA_EXCECAO);
    assert.equal(promovida.promovida, true);
    assert.equal(promovida.entrada.estado, 'excecao_intencional');
    assert.deepEqual(ledger.idsExcluidosComoExcecao(), ['APT-0001', 'APT-0002', 'APT-0003']);

    // Pin contradiz → −1 por contradição; importância chega a 0 → REMOVIDA.
    let presente = true;
    for (let i = 0; i < CONTRADICOES_ATE_REMOCAO; i += 1) {
      presente = ledger.contradizerComPin(material);
    }
    assert.equal(presente, false, 'removida em 0 (§6.7)');
    assert.equal(ledger.entradaPorChave(chaveDeRejeicao(material)), undefined);
  });

  it('VersionBuffer: toda versão guardada; anterior() = y_{t-1}; menorScore() escolhe', () => {
    const buffer = new VersionBuffer();
    buffer.guardar({ caminho: CAMINHO, conteudo: 'v0', score_erro: 5, rodada: 0 });
    buffer.guardar({ caminho: CAMINHO, conteudo: 'v1', score_erro: 3, rodada: 1 });
    buffer.guardar({ caminho: CAMINHO, conteudo: 'v2', score_erro: 7, rodada: 2 });
    assert.equal(buffer.historico(CAMINHO).length, 3);
    assert.equal(buffer.ultima(CAMINHO)?.conteudo, 'v2');
    assert.equal(buffer.anterior(CAMINHO)?.conteudo, 'v1', 'rollback volta y_{t-1} (§6.6)');
    assert.equal(buffer.menorScore(CAMINHO)?.conteudo, 'v1', 'ping-pong devolve o de menor score (§6.6)');
    assert.equal(hashDeConteudo('v0'), hashDeConteudo('v0'));
  });

  it('proxy de estagnação: Jaccard normalizado sobre artefatos NORMALIZADOS (nunca embedding real)', () => {
    assert.equal(jaccardNormalizado('mesmo texto igual', 'mesmo texto igual'), 1);
    assert.equal(jaccardNormalizado('a b c', 'x y z'), 0);
    const mutado = (s: string) => new Map([[CAMINHO, s]]);
    assert.ok(distanciaDeArtefatos(mutado('aaa'), mutado('aaa')) < 0.06, 'mesmo estado → distância ~0 (estagnou)');
    assert.ok(distanciaDeArtefatos(mutado('aaa'), mutado('bbb')) > 0.06, 'estado mudou → distância alta (não estagnou)');
  });
});

// ---------------------------------------------------------------------------
// 1. Verificadores determinísticos SEGURAM o revisor LLM (§6.1)
// ---------------------------------------------------------------------------

describe('P-18 · a ordem do laço (§6.1)', () => {
  it('com violação mecânica presente, o revisor LLM NÃO é chamado (contador)', async () => {
    let chamadasDoRevisor = 0;
    const ctx = contextoBase({
      verificadorDeOrcamento: async () => [violacaoSobre(CAMINHO, CONTEUDO, 'typeof')],
      llm: {
        ...contextoBase({}).llm,
        revisar: async (entrada) => {
          chamadasDoRevisor += 1;
          void entrada;
          return revisaoCom([]);
        },
      },
      rodadasMaximas: 3,
    });
    const resultado = await rodarLacoDeRevisao(ctx);
    assert.equal(chamadasDoRevisor, 0, 'verificador vermelho → LLM caro NÃO é chamado');
    assert.equal(resultado.rodadas[0].revisorChamado, false);
    assert.equal(resultado.rodadas[0].apontamentosMecanicos.length, 1);
    assert.ok(resultado.rodadas[0].apontamentosMecanicos[0].id.startsWith('MEC-'));
    // Violação eterna e CONSTANTE (canned) → o conteúdo nunca muda → o PROXY
    // de estagnação para o laço antes do fim; em NENHUM caso ultrapassa
    // maxRodadas e o revisor nunca é consultado.
    assert.ok(resultado.rodadas.length <= 3, 'laço limitado por cima; revisor zerado em todas as rodadas');
    assert.ok(['estagnou', 'failsafe'].includes(resultado.paradaFinal));
  });

  it('a parada 0 é MECÂNICA por construção: revisor "aprova" mas pin vermelho → NÃO para (bônus 12a)', async () => {
    // O oráculo é FUNÇÃO PURA — a aprovação do revisor não é um dos argumentos.
    assert.equal(
      avaliarParadaMecanica({ violacoesOrcamento: 0, testesFalhando: 0, pinsFalhando: 1, apontamentosBloqueantesOuCorrigir: 0 }),
      false,
      'pins vermelhos derrubam a parada 0 mesmo com ZERO apontamentos',
    );
    assert.equal(
      avaliarParadaMecanica({ violacoesOrcamento: 1, testesFalhando: 0, pinsFalhando: 0, apontamentosBloqueantesOuCorrigir: 0 }),
      false,
      'violação de orçamento derruba a parada 0 mesmo com ZERO apontamentos',
    );
    assert.equal(
      avaliarParadaMecanica({ violacoesOrcamento: 0, testesFalhando: 0, pinsFalhando: 0, apontamentosBloqueantesOuCorrigir: 0 }),
      true,
    );

    // No laço: revisor que "aprova" (0 apontamentos) + pin vermelho semeado →
    // a rodada NÃO para; com maxRodadas=1 → FAILSAFE com placar, nunca aceita.
    const ctx = contextoBase({ rodadasMaximas: 1 });
    const sessao = criarSessaoDeRevisao(ctx);
    sessao.pins.adicionarPin(pinAstManual(aptSobre(CONTEUDO, 'typeof'), 'typeof', 0));
    const rodada = await rodarRodadaDeRevisao(ctx, sessao);
    assert.notEqual(rodada.parada, 'mecanico');
    assert.equal(rodada.temViolacaoMecanica, true);
    assert.equal(rodada.escalada?.quality_warning, true);
  });
});

// ---------------------------------------------------------------------------
// 2. O filtro estrutural R1–R8 — um teste por regra (§6.4)
// ---------------------------------------------------------------------------

describe('P-18 · filtro R1–R8 — um teste por regra, cada um pelo MOTIVO CERTO', () => {
  const conteudo = CONTEUDO;

  it('R1 — span irresolvível descarta pelo motivo R1', async () => {
    const { sobreviventes, descartados } = await filtrarApontamentos(
      [apt({ alvo: { span: [0, 999] as [number, number] } })],
      { obterConteudo: (c) => (c === CAMINHO ? conteudo : null), orcamento: [] },
    );
    assert.equal(sobreviventes.length, 0);
    assert.equal(descartados[0].motivo, 'R1');
  });

  it('R2 — defeito que não é frase declarativa descarta pelo motivo R2', async () => {
    const { sobreviventes, descartados } = await filtrarApontamentos([apt({ defeito: 'Pergunta?' })], {
      obterConteudo: (c) => (c === CAMINHO ? conteudo : null),
      orcamento: [],
    });
    assert.equal(sobreviventes.length, 0);
    assert.equal(descartados[0].motivo, 'R2');
  });

  it('R3 — não pede mudança (elogio) descarta pelo motivo R3', async () => {
    const { sobreviventes, descartados } = await filtrarApontamentos([apt({ defeito: 'A aula ficou ótima.' })], {
      obterConteudo: (c) => (c === CAMINHO ? conteudo : null),
      orcamento: [],
    });
    assert.equal(sobreviventes.length, 0);
    assert.equal(descartados[0].motivo, 'R3');
  });

  it('R4 — evidência fora do span e fora do orçamento descarta pelo motivo R4', async () => {
    const { sobreviventes, descartados } = await filtrarApontamentos(
      [apt({ evidencia: { prova: 'o trecho `zzzz` não deveria existir' } })],
      { obterConteudo: (c) => (c === CAMINHO ? conteudo : null), orcamento: [] },
    );
    assert.equal(sobreviventes.length, 0);
    assert.equal(descartados[0].motivo, 'R4');
  });

  it('R5 — reproduzivel_por roda e NÃO reproduz descarta pelo motivo R5 (exec fake)', async () => {
    const finding = aptSobre(conteudo, 'typeof', {
      evidencia: { reproduzivel_por: 'npm run engine -- audit m01/a03' },
    });
    const { sobreviventes, descartados } = await filtrarApontamentos([finding], {
      obterConteudo: (c) => (c === CAMINHO ? conteudo : null),
      orcamento: [],
      exec: execLimpo,
      timeoutMs: 100,
    });
    assert.equal(sobreviventes.length, 0);
    assert.equal(descartados[0].motivo, 'R5');
    assert.match(descartados[0].detalhe, /NÃO reproduziu/);
  });

  it('R5 — comando que NÃO roda (timeout) também descarta (fail-closed)', async () => {
    const finding = aptSobre(conteudo, 'typeof', {
      evidencia: { reproduzivel_por: 'npm run engine -- audit m01/a03' },
    });
    const execQueLanca: ExecFn = async () => {
      throw new Error('ETIMEDOUT');
    };
    const { sobreviventes, descartados } = await filtrarApontamentos([finding], {
      obterConteudo: (c) => (c === CAMINHO ? conteudo : null),
      orcamento: [],
      exec: execQueLanca,
      timeoutMs: 1,
    });
    assert.equal(sobreviventes.length, 0);
    assert.equal(descartados[0].motivo, 'R5');
    assert.match(descartados[0].detalhe, /não pôde ser executado/);
  });

  it('R5 — exit 127 (comando INEXISTENTE) NÃO reproduz: descarta por fail-closed', async () => {
    const finding = aptSobre(conteudo, 'typeof', {
      evidencia: { reproduzivel_por: 'npm run engine -- audit m01/a03' },
    });
    const execExit127: ExecFn = async () => ({
      exitCode: 127,
      stdout: '',
      stderr: 'sh: npm: command not found',
    });
    const { sobreviventes, descartados } = await filtrarApontamentos([finding], {
      obterConteudo: (c) => (c === CAMINHO ? conteudo : null),
      orcamento: [],
      exec: execExit127,
      timeoutMs: 100,
    });
    assert.equal(sobreviventes.length, 0, '127 = o comando NÃO RODOU — sem evidência de reprodução');
    assert.equal(descartados[0].motivo, 'R5');
    assert.match(descartados[0].detalhe, /exit 127/);
    assert.match(descartados[0].detalhe, /não pôde ser executado/);
  });

  it('R5 — exit 126 (comando NÃO EXECUTÁVEL) também descarta por fail-closed', async () => {
    const finding = aptSobre(conteudo, 'typeof', {
      evidencia: { reproduzivel_por: 'npm run engine -- audit m01/a03' },
    });
    const execExit126: ExecFn = async () => ({
      exitCode: 126,
      stdout: '',
      stderr: 'sh: permission denied',
    });
    const { sobreviventes, descartados } = await filtrarApontamentos([finding], {
      obterConteudo: (c) => (c === CAMINHO ? conteudo : null),
      orcamento: [],
      exec: execExit126,
      timeoutMs: 100,
    });
    assert.equal(sobreviventes.length, 0);
    assert.equal(descartados[0].motivo, 'R5');
    assert.match(descartados[0].detalhe, /exit 126/);
  });

  it('R5 — OUTRO exit ≠ 0 (ex.: 1) REPRODUZ: sobrevive ao filtro', async () => {
    const finding = aptSobre(conteudo, 'typeof', {
      evidencia: { reproduzivel_por: 'npm run engine -- audit m01/a03' },
    });
    const execExit1: ExecFn = async () => ({ exitCode: 1, stdout: 'falha na prova 3', stderr: '' });
    const { sobreviventes, descartados } = await filtrarApontamentos([finding], {
      obterConteudo: (c) => (c === CAMINHO ? conteudo : null),
      orcamento: [],
      exec: execExit1,
      timeoutMs: 100,
    });
    assert.equal(descartados.length, 0, 'exit 1 = o comando reportou o defeito (reprodução)');
    assert.equal(sobreviventes.length, 1);
    assert.equal(sobreviventes[0].id, finding.id);
  });

  it('R6 — regra_violada fora de C1–C8 descarta pelo motivo R6 (bônus 12b)', async () => {
    const { sobreviventes, descartados } = await filtrarApontamentos([apt({ regra_violada: 'C99' })], {
      obterConteudo: (c) => (c === CAMINHO ? conteudo : null),
      orcamento: [],
    });
    assert.equal(sobreviventes.length, 0);
    assert.equal(descartados[0].motivo, 'R6');
  });

  it('R7 — categoria estilo com correção aberta descarta pelo motivo R7', async () => {
    const { sobreviventes, descartados } = await filtrarApontamentos(
      [apt({ categoria: 'estilo', severity: 'sugestao', acao_sugerida: 'reescreva o trecho `x + 1` inteiro' })],
      { obterConteudo: (c) => (c === CAMINHO ? conteudo : null), orcamento: [] },
    );
    assert.equal(sobreviventes.length, 0);
    assert.equal(descartados[0].motivo, 'R7');
  });

  it('R8 — mais de 12 apontamentos no mesmo artefato trunca por severidade', async () => {
    const apontamentos = Array.from({ length: R8_TETO + 1 }, (_, i) => apt({ id: `APT-R8-${String(i).padStart(4, '0')}` }));
    const { sobreviventes, descartados } = await filtrarApontamentos(apontamentos, {
      obterConteudo: (c) => (c === CAMINHO ? conteudo : null),
      orcamento: [],
    });
    assert.equal(sobreviventes.length, R8_TETO);
    assert.equal(descartados.length, 1);
    assert.equal(descartados[0].motivo, 'R8');
  });

  it('as oito regras são FUNÇÕES PURAS exportadas individualmente', async () => {
    const a = aptSobre(conteudo, 'typeof');
    assert.equal(r1SpanResoluvel(a, conteudo), true);
    assert.equal(r1SpanResoluvel(a, null), false);
    assert.equal(r2FraseDeclarativa(a), true);
    assert.equal(r3PedeMudanca(a), true);
    assert.equal(r4EvidenciaVerificavel(a, conteudo, []), true);
    const reproduz = await r5ExigeReproducao(a, undefined, 1);
    assert.equal(reproduz.reproduz, true, 'prefixo mecanico/verificado → R5 pula');
    assert.equal(r6RegraNaConstituicao(a), true);
    assert.equal(r7SemCorrecaoAberta(a), true);
    const trunc = r8TruncaPorSeveridade([apt(), apt(), apt()], 2);
    assert.equal(trunc.mantidos.length, 2);
    assert.equal(trunc.truncados.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 3. Provador — achado sem pin morre; trecho fora do artefato cai por substring
// ---------------------------------------------------------------------------

describe('P-18 · provador e evidência por substring (§6.1/§6.4)', () => {
  it('achado cujo trecho não existe no artefato é descartado por SUBSTRING', async () => {
    const alucinado = aptSobre(CONTEUDO, 'typeof', {
      evidencia: { prova: 'a seção `trechoQueNaoExiste` viola a regra' },
    });
    const ctx = contextoBase({
      llm: { ...contextoBase({}).llm, revisar: async () => revisaoCom([alucinado]) },
    });
    const resultado = await rodarLacoDeRevisao(ctx);
    const descarte = resultado.rodadas[0].descartados.find((d) => d.apontamento.id === 'APT-0001');
    assert.ok(descarte !== undefined, 'o achado alucinado é descartado');
    assert.equal(descarte.motivo, 'R4');
    assert.match(descarte.detalhe, /não existe no artefato/);
  });

  it('achado SEM pin não chega ao planejador (morre em silêncio no provador)', async () => {
    let chamadasDoPlanejador = 0;
    const semTrecho = apt({
      alvo: { span: [0, 0] as [number, number], token: 'x' },
      evidencia: { prova: 'sem fragmento citável' },
    });
    const ctx = contextoBase({
      llm: {
        ...contextoBase({}).llm,
        revisar: async () => revisaoCom([semTrecho]),
        planejar: async (entrada) => {
          chamadasDoPlanejador += 1;
          void entrada;
          return { acoes: [] };
        },
      },
    });
    const resultado = await rodarLacoDeRevisao(ctx);
    assert.equal(chamadasDoPlanejador, 0, 'achado sem pin nunca chega ao planejador (§6.1 fluxo 4)');
    assert.equal(resultado.rodadas[0].sobreviventesAoProvador.length, 0);
    // Nada para corrigir → a parada 0 mecânica é atendida na rodada 1.
    assert.equal(resultado.acessado, true);
    assert.equal(resultado.paradaFinal, 'mecanico');
  });

  it('criarPinParaAchado: categoria de EXECUÇÃO vira pin caro (provas); artefato inexistente → null', async () => {
    const desafio = JSON.stringify({
      solutionCode: 'export const dobro = (x) => x * 2;',
      starterCode: '// incompleto',
      testsCode: "import test from 'node:test'; test('dobro', () => {});",
      expectedTestCount: 1,
    });
    const executavel = extrairProvasDoArtefato(desafio);
    assert.ok(executavel !== null);
    const a = apt({ categoria: 'gabarito_nao_passa', alvo: { caminho: 'challenge.json', span: [0, 8] as [number, number] } });
    const pin = await criarPinParaAchado(a, { obterArquivo: async () => desafio, proverDesafio: provasValidas });
    assert.ok(pin !== null);
    assert.equal(pin.afericao.tipo, 'execucao');
    const semArtefato = await criarPinParaAchado(apt({ alvo: { caminho: 'nao-existe.md' } }), {
      obterArquivo: async () => null,
      proverDesafio: provasValidas,
    });
    assert.equal(semArtefato, null, 'artefato inexistente → sem pin → o achado morre');
  });
});

// ---------------------------------------------------------------------------
// 4. A cascata de parada (§6.6) — ping-pong, rollback, failsafe
// ---------------------------------------------------------------------------

describe('P-18 · a cascata de parada (§6.6)', () => {
  it('ping-pong entre duas versões é detectado e devolve a de menor score (version buffer)', async () => {
    const caminho = 'texto.md';
    const ctx = contextoBase({
      artefatos: [{ caminho, nome: 'aula', conteudo: 'aaa', ultimaEdicao: -1 }],
      rodadasMaximas: 3,
    });
    const sessao = criarSessaoDeRevisao(ctx);
    // Pin velho (criado na rodada 0): vermelho o tempo todo — mantém o laço
    // ativo com score constante (termo de LAG) e derruba a parada 0.
    const a = apt({
      id: 'APT-PP',
      artefato: 'aula',
      alvo: { caminho, span: [0, 3] as [number, number], token: 'aaa' },
      evidencia: { prova: 'o trecho `aaa` está fora do orçamento' },
      categoria: 'construcao_nao_ensinada',
      severity: 'bloqueante' as const,
    });
    sessao.pins.adicionarPin(pinAstManual(a, 'aaa', 0));

    // Oscilação: insere X (y1 = 'Xaaa'), remove X (y2 = 'aaa' == y0), … →
    // hash(y_t) == hash(y_t-2) != hash(y_t-1).
    const ctxOscilante: ContextoDoLaco = {
      ...ctx,
      llm: {
        ...ctx.llm,
        planejar: planejadorDeAcaoUnica('REWRITE_IN_BUDGET'),
        corrigir: corretorSequencial([
          [{ inicio: 0, fim: 0, substituicao: 'X' }],
          [{ inicio: 0, fim: 1, substituicao: '' }],
        ]),
      },
    };
    const r1 = await rodarRodadaDeRevisao(ctxOscilante, sessao);
    assert.equal(r1.parada, 'nenhuma');
    const r2 = await rodarRodadaDeRevisao(ctxOscilante, sessao);
    assert.equal(r2.parada, 'pingpong', 'hash(y_t) == hash(y_t-2) != hash(y_t-1) → PARE(pingpong)');
    assert.notEqual(sessao.hashes[1], sessao.hashes[2]);
    assert.equal(sessao.artefatos.get(caminho)?.conteudo, 'aaa', 'devolve a versão de menor score no buffer');
  });

  it('correção que piora o score sofre ROLLBACK (score_erro_t > t-1 + 0,10 → volta y_{t-1})', async () => {
    const caminho = 'texto.md';
    const conteudo = 'aaa';
    const ctx = contextoBase({
      artefatos: [{ caminho, nome: 'aula', conteudo, ultimaEdicao: -1 }],
      // O orçamento fica VERMELHO quando 'bbb' entra no artefato: a "correção"
      // (aaa → bbb) deixa o estado PROVÁVEL pior.
      verificadorDeOrcamento: async (mapa) => {
        const atual = mapa.get(caminho)?.conteudo ?? '';
        return atual.includes('bbb') ? [violacaoSobre(caminho, atual, 'bbb')] : [];
      },
      rodadasMaximas: 1,
    });
    const finding = apt({
      id: 'APT-RB',
      alvo: { caminho, span: [0, 3] as [number, number], token: 'aaa' },
      evidencia: { prova: 'o trecho `aaa` não pode ficar' },
      categoria: 'ambiguidade_de_enunciado',
      severity: 'corrigir' as const,
      defeito: 'O artefato usa a construção indevida na linha 1.',
    });
    const ctxComCorretor: ContextoDoLaco = {
      ...ctx,
      llm: {
        ...ctx.llm,
        revisar: async () => revisaoCom([finding]),
        planejar: planejadorDeAcaoUnica('REWRITE_IN_BUDGET'),
        corrigir: corretorSequencial([[{ inicio: 0, fim: 3, substituicao: 'bbb' }]]),
      },
    };
    const resultado = await rodarLacoDeRevisao(ctxComCorretor);
    assert.equal(resultado.rodadas[0].parada, 'rollback');
    assert.equal(resultado.rodadas[0].scoreDepois, 3, '3× violação de orçamento introduzida pela correção');
    assert.equal(resultado.artefatosFinais.find((x) => x.caminho === caminho)?.conteudo, conteudo, 'y_{t-1} foi restaurado');
    assert.equal(resultado.acessado, false);
  });

  it('correção que quebra pin verde é REJEITADA — o artefato volta (§6.7)', async () => {
    const caminho = 'texto.md';
    const conteudo = 'texto limpo';
    const ctx = contextoBase({
      artefatos: [{ caminho, nome: 'aula', conteudo, ultimaEdicao: -1 }],
      rodadasMaximas: 3,
    });
    const sessao = criarSessaoDeRevisao(ctx);
    // Pin VERDE semeado: "proibido" NÃO pode aparecer no artefato.
    const aPin = apt({ id: 'APT-VERDE', alvo: { caminho, span: [0, 3] as [number, number] } });
    sessao.pins.adicionarPin(pinAstManual(aPin, 'proibido', 0));
    assert.equal((await sessao.pins.todosRodam())[0].verde, true);

    const finding = aptSobre(conteudo, 'limpo', {
      id: 'APT-QBR',
      categoria: 'ambiguidade_de_enunciado',
      severity: 'corrigir' as const,
      alvo: { caminho },
    });
    const ctxComCorretor: ContextoDoLaco = {
      ...ctx,
      llm: {
        ...ctx.llm,
        revisar: async () => revisaoCom([finding]),
        planejar: planejadorDeAcaoUnica('REWRITE_IN_BUDGET'),
        // A correção do "limpo" INTRODUZ "proibido" — quebra o pin verde.
        corrigir: corretorSequencial([[{ inicio: 6, fim: 11, substituicao: 'proibido' }]]),
      },
    };
    const rodada = await rodarRodadaDeRevisao(ctxComCorretor, sessao);
    assert.equal(rodada.rejeicoesPorPinQuebrado.length, 1);
    assert.equal(rodada.correcoes.length, 0, 'correção que quebra pin verde é REJEITADA');
    assert.equal(sessao.artefatos.get(caminho)?.conteudo, conteudo, 'o artefato volta ao estado anterior');
    assert.equal((await sessao.pins.todosRodam())[0].verde, true, 'o pin verde continua verde depois da rodada');
  });

  it('na rodada 3 sem convergir, ESCALA com placar — nunca aceita por cansaço', async () => {
    const caminho = 'texto.md';
    const ctx = contextoBase({
      artefatos: [{ caminho, nome: 'aula', conteudo: 'aaa', ultimaEdicao: -1 }],
      rodadasMaximas: 3,
    });
    // Pin eterno (nunca se resolve) + corretor que INSERE 'x' a cada rodada
    // sem remover a ofensa: distância > limiar (não estagna), score constante
    // (não faz rollback) → a rodada 3 dispara o FAILSAFE.
    const a = apt({ id: 'APT-8', alvo: { caminho, span: [0, 3] as [number, number], token: 'aaa' } });
    const sessao = criarSessaoDeRevisao(ctx);
    sessao.pins.adicionarPin(pinAstManual(a, 'aaa', 0));
    const ctxEterno: ContextoDoLaco = {
      ...ctx,
      llm: {
        ...ctx.llm,
        planejar: planejadorDeAcaoUnica('REWRITE_IN_BUDGET'),
        corrigir: corretorSequencial([[{ inicio: 0, fim: 0, substituicao: 'x' }]]),
      },
    };
    const resultado = await rodarLacoDeRevisao(ctxEterno, sessao);
    assert.equal(resultado.rodadas.length, 3, 'o laço roda EXATAMENTE as rodadas declaradas');
    assert.equal(resultado.paradaFinal, 'failsafe');
    assert.equal(resultado.acessado, false, 'NUNCA aceita por cansaço');
    assert.ok(resultado.escalada !== null);
    assert.equal(resultado.escalada.quality_warning, true);
    assert.equal(resultado.escalada.rodada, 3);
    assert.ok(resultado.escalada.apontamentos.length >= 1, 'o placar carrega as recomendações sobreviventes');
  });
});

// ---------------------------------------------------------------------------
// 5. Anti-oscilação — exceção intencional (não reabre rodada) e fail-closed
// ---------------------------------------------------------------------------

describe('P-18 · excecao_intencional e fail-closed (§6.7/§9.3)', () => {
  it('apontamento marcado excecao_intencional NÃO reabre rodada', async () => {
    const conteudo = CONTEUDO;
    const finding = aptSobre(conteudo, 'typeof', { id: 'APT-9' });
    const lead = contextoBase({ rodadasMaximas: 3 });
    const sessao = criarSessaoDeRevisao(lead);
    // Semeia a EXCEÇÃO INTENCIONAL com a MESMA chave do apontamento.
    const material = materialDoApontamento(finding, conteudo);
    const mutacao = sessao.ledger.registrarRejeicao({
      material,
      justificativa: 'Decisão de projeto: a construção é ensinada como exceção declarada nesta trilha.',
      rodada: 0,
      apontamento_id: finding.id,
    });
    assert.equal(mutacao.invalida, false);
    assert.equal(sessao.ledger.marcarComoExcecaoIntencional(material), true, 'canal explícito de exceção');
    assert.equal(sessao.ledger.eExcecaoIntencional(material), true);

    let chamadasDoPlanejador = 0;
    const ctx: ContextoDoLaco = {
      ...lead,
      llm: {
        ...lead.llm,
        revisar: async () => revisaoCom([finding]),
        planejar: async (entrada) => {
          chamadasDoPlanejador += 1;
          assert.ok(!entrada.apontamentos.some((x) => x.id === finding.id), 'o excluído não chega ao planejador');
          void entrada;
          return { acoes: [] };
        },
      },
    };
    const rodada = await rodarRodadaDeRevisao(ctx, sessao);
    assert.equal(chamadasDoPlanejador, 0, 'exceção intencional não abre rodada nem gera plano');
    assert.ok(rodada.excluidosComoExcecao.includes(finding.id), 'a lista DECLARADA alimenta o planejador (P-13)');
    assert.equal(rodada.parada, 'mecanico', 'sem bloqueadores em aberto, a parada 0 mecânica é atendida');
  });

  it('revisor indisponível produz erro ESTRUTURADO — nunca aprovação por omissão', async () => {
    const errComCodigo = new Error('etapa excedeu o teto de 5000ms e foi cancelada.');
    (errComCodigo as { code?: string }).code = 'LLM_STAGE_TIMEOUT';
    const ctx = contextoBase({
      llm: {
        ...contextoBase({}).llm,
        revisar: async () => {
          throw errComCodigo;
        },
      },
    });
    await assert.rejects(
      () => rodarLacoDeRevisao(ctx),
      (erro: unknown) => {
        assert.ok(erro instanceof ErroEstruturadoDoLaco, 'o erro é ESTRUTURADO do laço');
        assert.equal(erro.codigo, 'LLM_STAGE_TIMEOUT', 'o código do transporte sobrevive ao laço');
        assert.equal(erro.etapa, 'revisor:unico');
        return true;
      },
    );
  });

  it('sem verificador de orçamento injetado nem snapshot, o laço NEM COMEÇA (fail-closed)', async () => {
    const ctx = contextoBase({
      verificadorDeOrcamento: undefined,
      snapshotDeOrcamento: undefined,
    });
    await assert.rejects(
      () => rodarLacoDeRevisao(ctx),
      (erro: unknown) => erro instanceof ErroEstruturadoDoLaco && erro.codigo === 'LACO_SEM_VERIFICADOR_DE_ORCAMENTO',
    );
  });
});

// ---------------------------------------------------------------------------
// 6. A regra de ouro — SEM laço aberto sobre apontamento (prova por construção)
// ---------------------------------------------------------------------------

describe('P-18 · não existe caminho de código com laço aberto (A-P18-2/3)', () => {
  it('com APONTAMENTOS ETERNOS a execução termina EXATAMENTE em maxRodadas', async () => {
    const caminho = 'texto.md';
    const ctx = contextoBase({
      artefatos: [{ caminho, nome: 'aula', conteudo: 'aaa', ultimaEdicao: -1 }],
      rodadasMaximas: 3,
    });
    // O revisor devolve SEMPRE o MESMO apontamento; o corretor "corrige" mas
    // NUNCA remove a ofensa (o trecho cresce com X): pin vermelho contínuo,
    // conteúdo muda (não estagna), score constante (não rola) → failsafe na
    // rodada 3. O laço é um `for` NUMÉRICO limitado: nunca um `while` sobre
    // a lista de apontamentos do revisor.
    const eternal = apt({
      id: 'APT-ET',
      alvo: { caminho, span: [0, 3] as [number, number], token: 'aaa' },
      evidencia: { prova: 'o trecho `aaa` não pode ficar no artefato' },
    });
    let chamadasDoRevisor = 0;
    const ctxEterno: ContextoDoLaco = {
      ...ctx,
      llm: {
        ...ctx.llm,
        revisar: async (entrada) => {
          chamadasDoRevisor += 1;
          void entrada;
          return revisaoCom([eternal]);
        },
        planejar: planejadorDeAcaoUnica('REWRITE_IN_BUDGET'),
        corrigir: corretorSequencial([[{ inicio: 0, fim: 3, substituicao: 'aaaX' }]]),
      },
    };
    const resultado = await rodarLacoDeRevisao(ctxEterno);
    assert.equal(resultado.rodadas.length, ctx.rodadasMaximas as number, 'termina EXATAMENTE em maxRodadas');
    assert.equal(chamadasDoRevisor, 1, 'rodadas 2 e 3 são MECÂNICAS (pin vermelho) — o revisor não é re-consultado');
    assert.equal(resultado.paradaFinal, 'failsafe');
    assert.equal(resultado.acessado, false);
  });

  it('variante que estagna termina ANTES de maxRodadas (laço limitado por cima)', async () => {
    const ctx = contextoBase({
      rodadasMaximas: 3,
      llm: {
        ...contextoBase({}).llm,
        revisar: async () => revisaoCom([aptSobre(CONTEUDO, 'typeof', { id: 'APT-EST' })]),
        planejar: async () => ({ acoes: [] }), // nada é corrigido
        corrigir: corretorRejeitador,
      },
    });
    const resultado = await rodarLacoDeRevisao(ctx);
    assert.ok(resultado.rodadas.length <= (ctx.rodadasMaximas as number), 'nunca ultrapassa maxRodadas');
    assert.equal(resultado.paradaFinal, 'estagnou', '2 rodadas idênticas + bloqueantes que não caíram → PARE(estagnou)');
    assert.equal(resultado.acessado, false);
  });
});

// ---------------------------------------------------------------------------
// 7. Rota de sucesso e roteamento
// ---------------------------------------------------------------------------

describe('P-18 · rotas de sucesso e roteamento (P-12)', () => {
  it('rodada de refino que CONSERTA tudo termina na parada 0 MECÂNICA (e aceita)', async () => {
    const ctx = contextoBase({
      llm: {
        ...contextoBase({}).llm,
        revisar: async () => revisaoCom([aptSobre(CONTEUDO, 'typeof', { id: 'APT-OK' })]),
        planejar: planejadorDeAcaoUnica('REWRITE_IN_BUDGET'),
        corrigir: corretorSequencial([[{ inicio: 17, fim: 23, substituicao: '' }]]),
      },
    });
    const resultado = await rodarLacoDeRevisao(ctx);
    assert.equal(resultado.acessado, true, 'a única porta de aceite é a parada 0 mecânica');
    assert.equal(resultado.paradaFinal, 'mecanico');
    assert.equal(resultado.rodadas[0].pinsFalhando, 0, 'o pin criado a partir do achado fica VERDE');
    assert.equal(resultado.rodadas[0].correcoes.length, 1);
  });

  it('model(AUTOR) === model(REVISOR) → erro estruturado ANTES da revisão (P-12)', async () => {
    const ctx = contextoBase({
      modeloAutor: 'mesmo-modelo',
      modeloRevisor: 'mesmo-modelo',
    });
    await assert.rejects(
      () => rodarLacoDeRevisao(ctx),
      (erro: unknown) => erro instanceof ErroEstruturadoDoLaco && erro.codigo === 'LACO_ROTEAMENTO_INVALIDO',
    );
  });

  it('score_erro segue a fórmula do §6.6 (3×orç + 3×testes + 2×pins + 1×corrigir)', () => {
    assert.equal(scoreErro(1, 0, 0, 0), 3);
    assert.equal(scoreErro(0, 1, 0, 0), 3);
    assert.equal(scoreErro(0, 0, 1, 0), 2);
    assert.equal(scoreErro(0, 0, 0, 1), 1);
    assert.equal(scoreErro(1, 1, 2, 3), 3 + 3 + 4 + 3);
  });
});

// ---------------------------------------------------------------------------
// 8. O TETO vale para TODA a superfície pública (§6.6) — rodarRodadaDeRevisao
//    incluída (o repair P-23 também tem teto)
// ---------------------------------------------------------------------------

describe('P-18 · o teto vale para toda a superfície pública (§6.6)', () => {
  it('rodarRodadaDeRevisao 2× com maxRodadas 1 → a 2ª LANÇA RODADAS_ESGOTADAS (erro estruturado)', async () => {
    const ctx = contextoBase({ rodadasMaximas: 1 });
    const sessao = criarSessaoDeRevisao(ctx);
    const primeira = await rodarRodadaDeRevisao(ctx, sessao);
    assert.equal(primeira.rodada, 1, 'a 1ª rodada roda DENTRO do teto');
    await assert.rejects(
      () => rodarRodadaDeRevisao(ctx, sessao),
      (erro: unknown) => {
        assert.ok(erro instanceof ErroEstruturadoDoLaco, 'erro ESTRUTURADO do laço — nunca rodada extra em silêncio');
        assert.equal(erro.codigo, 'RODADAS_ESGOTADAS');
        assert.equal(erro.etapa, 'laco');
        return true;
      },
    );
  });

  it('rodarLacoDeRevisao com sessão semeada JÁ esgotada também LANÇA RODADAS_ESGOTADAS', async () => {
    const ctx = contextoBase({ rodadasMaximas: 3 });
    const sessao = criarSessaoDeRevisao(ctx);
    await rodarRodadaDeRevisao(ctx, sessao);
    await rodarRodadaDeRevisao(ctx, sessao);
    await rodarRodadaDeRevisao(ctx, sessao); // 3 de 3 rodadas já rodadas
    await assert.rejects(
      () => rodarLacoDeRevisao(ctx, sessao),
      (erro: unknown) => {
        assert.ok(erro instanceof ErroEstruturadoDoLaco);
        assert.equal(erro.codigo, 'RODADAS_ESGOTADAS');
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// 9. Sugestão (§6.5) — NUNCA abre rodada: fora do provador/planejador/
//    corretor, com QUOTA DE 3 POR ARTEFATO e descarte CONTADO
// ---------------------------------------------------------------------------

describe('P-18 · sugestão NUNCA abre rodada — quota de 3 por aula (§6.5)', () => {
  it('(a) sugestão NÃO chama o planejador nem o corretor (o provador a ignora)', async () => {
    let chamadasDoPlanejador = 0;
    let chamadasDoCorretor = 0;
    const ctx = contextoBase({
      rodadasMaximas: 1,
      llm: {
        ...contextoBase({}).llm,
        revisar: async () => revisaoCom([sugestaoSobre(CONTEUDO, 'typeof')]),
        planejar: async (entrada) => {
          chamadasDoPlanejador += 1;
          void entrada;
          return { acoes: [] };
        },
        corrigir: async (entrada) => {
          chamadasDoCorretor += 1;
          void entrada;
          return corretorRejeitador();
        },
      },
    });
    const sessao = criarSessaoDeRevisao(ctx);
    const rodada = await rodarRodadaDeRevisao(ctx, sessao);
    assert.equal(chamadasDoPlanejador, 0, 'sugestão nunca abre rodada — o planejador nem é chamado');
    assert.equal(chamadasDoCorretor, 0, 'sugestão nunca chega ao corretor');
    assert.equal(rodada.pinsCriados.length, 0, 'o provador ignora sugestões — nenhum pin nasce');
    assert.equal(rodada.sugestoes.length, 1, 'a sugestão sobrevivente ao filtro é registrada na rodada');
    assert.equal(sessao.sugestoesPorArtefato.get(CAMINHO)?.length, 1, 'a sugestão foi guardada na sessão');
    assert.equal(rodada.parada, 'mecanico', 'sem bloqueador em aberto, a parada 0 fecha');
  });

  it('(b) sugestões PENDENTES não impedem a parada 0', async () => {
    const ctx = contextoBase({
      rodadasMaximas: 1,
      llm: {
        ...contextoBase({}).llm,
        revisar: async () =>
          revisaoCom([
            sugestaoSobre(CONTEUDO, 'typeof', { id: 'APT-SUG1' }),
            sugestaoSobre(CONTEUDO, 'dobra', { id: 'APT-SUG2' }),
          ]),
      },
    });
    const resultado = await rodarLacoDeRevisao(ctx);
    assert.equal(resultado.paradaFinal, 'mecanico', 'sugestões pendentes NÃO derrubam a parada 0');
    assert.equal(resultado.acessado, true, 'a única porta de aceite fecha com sugestões pendentes');
    assert.equal(resultado.rodadas[0].pinsFalhando, 0, 'nenhum pin de sugestão entra em pinsFalhando');
    assert.equal(
      resultado.rodadas[0].sobreviventesAoProvador.length,
      0,
      'sugestão não é "sobrevivente AO PROVADOR" (não passa por ele)',
    );
    assert.equal(resultado.rodadas[0].sugestoes.length, 2, 'as sugestões seguem registradas na rodada');
  });

  it('(c) quota de 3 por artefato: a 4ª do MESMO artefato é DESCARTADA COM CONTAGEM; re-reporte do guardado não consome', async () => {
    const g1 = sugestaoSobre(CONTEUDO, 'typeof', { id: 'APT-SG1' });
    const g2 = sugestaoSobre(CONTEUDO, 'dobra', { id: 'APT-SG2' });
    const g3 = sugestaoSobre(CONTEUDO, 'laço', { id: 'APT-SG3' });
    const g4 = sugestaoSobre(CONTEUDO, 'linha', { id: 'APT-SG4' });
    let giro = 1;
    const ctx = contextoBase({
      rodadasMaximas: 2,
      llm: {
        ...contextoBase({}).llm,
        revisar: async () => {
          // Rodada 1: 4 sugestões novas no MESMO artefato (a 4ª estoura a
          // quota). Rodada 2: re-reporta SÓ as 3 guardadas (dedupe por id).
          const sugestoes = giro === 1 ? [g1, g2, g3, g4] : [g1, g2, g3];
          giro += 1;
          return revisaoCom(sugestoes);
        },
      },
    });
    const sessao = criarSessaoDeRevisao(ctx);
    const rodada = await rodarRodadaDeRevisao(ctx, sessao);
    assert.equal(rodada.sugestoes.length, 4, 'as 4 sobrevivem ao FILTRO — a triagem não é a quota');
    assert.equal(
      sessao.sugestoesPorArtefato.get(CAMINHO)?.length,
      QUOTA_DE_SUGESTOES_POR_ARTEFATO,
      'exatamente 3 são guardadas por artefato',
    );
    assert.equal(rodada.sugestoesDescartadasPorQuota, 1, 'a 4ª do MESMO artefato é descartada na rodada');
    assert.equal(sessao.sugestoesDescartadasPorQuota, 1, 'a contagem fica registrada na sessão');

    const rodada2 = await rodarRodadaDeRevisao(ctx, sessao);
    assert.equal(rodada2.sugestoesDescartadasPorQuota, 0, 'mesmo id já guardado não é descartado de novo');
    assert.equal(sessao.sugestoesDescartadasPorQuota, 1, 'a contagem NÃO cresce com re-reportes');
    assert.equal(sessao.sugestoesPorArtefato.get(CAMINHO)?.length, QUOTA_DE_SUGESTOES_POR_ARTEFATO);
  });
});