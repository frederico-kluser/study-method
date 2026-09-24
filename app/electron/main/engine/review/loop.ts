/**
 * app/electron/main/engine/review/loop.ts — O LAÇO DE REVISÃO F11 (pacote
 * P-18, onda 3 do plano de execução v1). "ESTE É O PACOTE MAIS PERIGOSO DO
 * PLANO — a regra de ouro: NENHUM caminho de código com laço aberto sobre
 * apontamento de revisor; a condição de parada 0 é MECÂNICA."
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6 INTEIRO (6.1 a ordem;
 * 6.2 papéis e restrições de roteamento; 6.3 o schema do apontamento; 6.4 o
 * filtro R1–R8; 6.5 severidade por tabela; 6.6 a cascata de parada; 6.7 a
 * anti-oscilação) + §5.5 (violação de ordem × lacuna de currículo).
 *
 * A ORDEM DA RODADA (6.1), item a item:
 *
 *   1. VERIFICADORES DETERMINÍSTICOS — orçamento por AST (`extractAtoms`
 *      contra o snapshot de F4), provas de execução (via o `ProverDeDesafio`
 *      — contrato P-31) e o conjunto INTEIRO de pins. Havendo violação
 *      mecânica, o REVISOR LLM NÃO é chamado (o defeito já está localizado e
 *      provado) — as violações viram apontamentos MECÂNICOS (id `MEC-…`,
 *      `reproduzivel_por` com prefixo `mecanico:`) e, quando um pin está
 *      vermelho, o apontamento ORIGINAL do pin é REGENERADO (a regressão
 *      mecânica reabre o canal de correção com o MESMO id).
 *   2. REVISOR LLM (só com os três verificadores verdes): `validarRoteamento`
 *      (P-12) ANTES; artefato NORMALIZADO (P-12); instrumentos com regras
 *      DISJUNTAS (default: um instrumento único C1–C8 — particionável por
 *      eixo); severidade anexada por TABELA FIXA (`anexarSeveridadePorTabela`).
 *   3. FILTRO ESTRUTURAL R1–R8 (review/filter.ts) — o revisor reporta tudo;
 *      a triagem é aqui; descarta antes do planejador.
 *   4. PROVADOR (review/prover.ts) — cada candidato vira PIN executável que
 *      falha HOJE; candidato sem pin MORRE EM SILÊNCIO. SUGESTÃO (severity
 *      'sugestao', §6.5) NÃO é candidato: o provador a ignora por construção —
 *      sem pin, sem planejador, sem corretor; ela vai para a QUOTA POR
 *      ARTEFATO da sessão (3 por aula — `guardarSugestao`); além da quota é
 *      descartada COM CONTAGEM registrada. A parada 0 e `pinsFalhandoFinal`
 *      contam APENAS bloqueante/corrigir.
 *   5. PLANEJADOR (P-13: plano de ações + catálogo FECHADO; a lista DECLARADA
 *      `excluidosComoExcecao` alimenta o prompt; ação fora do catálogo ou de
 *      polaridade errada vira DEFEITO DO CATÁLOGO) → CORRETOR (verify-first,
 *      DIREITO de rejeitar com justificativa ≥40 caracteres → ledger; diff
 *      fora do span é rejeitado pelo gate `validarDiffNoSpan`).
 *   6. RE-VERIFICAÇÃO — só os itens TOcados (orçamento/provas) + TODOS os
 *      pins; correção que quebra pin verde é REJEITADA (artefato volta).
 *
 * A CASCATA DE PARADA (6.6), nesta ordem:
 *   0. MECÂNICA: 0 violações de orçamento ∧ 0 provas falhando ∧ todos os
 *      pins verdes ∧ 0 apontamentos bloqueante/corrigir sobreviventes ao
 *      provador — A APROVAÇÃO DO REVISOR NÃO É CONDIÇÃO DE PARADA EM NENHUM
 *      CAMINHO (`avaliarParadaMecanica` é função pura e testável);
 *   1. PING-PONG: hash(y_t) == hash(y_t-2) != hash(y_t-1) → devolve a versão
 *      de menor score do version buffer;
 *   2. ROLLBACK: score_erro_t > score_erro_t-1 + 0,10 → volta para y_{t-1}
 *      — é AÇÃO, não parada: o laço continua. AJUSTE DECLARADO: o score
 *      (3×viol_orçamento + 3×testes_falhando + 2×pins_falhando +
 *      1×apontamentos_corrigir) usa TERMOS DE LAG para pins e corrigir
 *      (medidos no estado ANTERIOR): uma rodada que apenas DESCOBRE um
 *      bloqueador novo não se auto-castiga com rollback — o rollback reage à
 *      piora do estado PROVÁVEL (orçamento/provas) e das regressões prévias;
 *   3. ESTAGNOU: PROXY DETERMINÍSTICO DECLARADO para a "distância de
 *      embedding" — 1 − Jaccard normalizado sobre tokens de palavras dos
 *      artefatos NORMALIZADOS (P-12). NUNCA se promete embedding real: o
 *      limiar 0,06 é medido sobre o proxy (falsificável em teste). Dispara
 *      após 2 rodadas consecutivas com distância < limiar E número de
 *      bloqueantes que não caiu;
 *   4. FAILSAFE: rodada `rodadasMaximas` sem parada 0 → ESCALA com placar
 *      (`quality_warning`) — NUNCA aceita por cansaço.
 *
 * O LAÇO RODA EXATAMENTE `rodadasMaximas` RODADAS (constante declarada no
 * contexto; default 1, teto duro 3; a 2ª/3ª só ocorre se sobrou bloqueante —
 * se a parada 0 dispara antes, o laço para). NENHUM `while
 * (revisor.temApontamento())`: a iteração é um `for` com limite numérico, e
 * cada rodada tem barreira própria. Recomendações que sobrevivem à rodada
 * final viram o placar de escalada.
 *
 * O TETO VALE PARA TODA A SUPERFÍCIE PÚBLICA: `rodarRodadaDeRevisao` (chamada
 * avulsa por rodada — o repair P-23 tem, no máx., as rodadas do mesmo teto)
 * NÃO roda além: sessão que já atingiu `rodadasMaximas` responde com
 * `ErroEstruturadoDoLaco` (código `RODADAS_ESGOTADAS`), nunca rodada extra
 * em silêncio. A mesma guarda protege `rodarLacoDeRevisao` com sessão semeada
 * já esgotada.
 *
 * FAIL-CLOSED: revisor/planejador/corretor indisponíveis (erro do transporte
 * — LLM_STAGE_TIMEOUT/KEY_MISSING…) produzem `ErroEstruturadoDoLaco`, NUNCA
 * aprovação por omissão; roteamento inválido (P-12) lança antes da revisão;
 * categoria de severidade desconhecida lança; sem verificador injetado o laço
 * nem começa.
 *
 * API DE SAÍDA (para o P-23 repair, que REUSA este laço): entrada é um
 * `ContextoDoLaco` (artefatos + snapshot/verificadores + `proverDesafio` +
 * funções LLM já cabeadas no transporte + roteamento); saída é
 * `ResultadoDoLaco` com `rodadas[]`, `paradaFinal`, `acessado` e
 * `artefatosFinais` (o repair P-23 grava estes artefatos e as correções do
 * catálogo LEVAM AO GIT — nunca o laço escreve por conta própria).
 *
 * LIMITES DECLARADOS: as provas de execução valem para artefatos que são
 * desafios executáveis; o verificador de orçamento pula superfícies ausentes
 * e código que não parseia (parse quebrado é erro de build do §5.3, não
 * violação de orçamento); R5 (filtro) herda o escopo do harness (socket cru
 * fora do alcance).
 *
 * ─── REFATORAÇÃO L05 (FACHADA FINA) ─────────────────────────────────────────
 * A implementação vive, desde a refatoração do lote L05, em módulos irmãos
 * (todos com complexidade ciclomática ≤8 por função, comportamento preservado
 * byte a byte):
 *
 *   `loopTipos.ts`      — constantes, tipos e `ErroEstruturadoDoLaco`;
 *   `loopPrimitivas.ts` — primitivas puras e verificadores default;
 *   `loopEstado.ts`     — a sessão e os ajudantes de estado;
 *   `loopCorrecao.ts`   — o passo 5 (planejador → corretor + gate do diff);
 *   `loopRodada.ts`     — a rodada (§6.1) e a cascata de parada (§6.6);
 *   `loopApi.ts`        — a API pública (rodada avulsa e laço completo).
 *
 * ESTE CAMINHO PÚBLICO NÃO MUDA: tudo é re-exportado pelos MESMOS nomes de
 * antes, e nenhum consumidor altera import.
 */

export {
  LIMIAR_DEFAULT_DE_ESTAGNACAO,
  QUOTA_DE_SUGESTOES_POR_ARTEFATO,
  RODADAS_DEFAULT,
  TETO_DE_RODADAS,
  TIMEOUT_DEFAULT_DE_EXECUCAO_MS,
  TOLERANCIA_DEFAULT_DE_ROLLBACK,
  ErroEstruturadoDoLaco,
} from './loopTipos';
export type {
  AcaoDoPlano,
  ArtefatoNoLaco,
  ContextoDoLaco,
  CorrecaoAplicada,
  CorretorLlm,
  EntradaDoCorretor,
  EntradaDoPlanejador,
  EntradaDeRevisao,
  ErroEstruturadoDoLacoOptions,
  InstrumentoDeRevisao,
  ParadaDeRodada,
  PlacarDeEscalada,
  PlanejadorLlm,
  ResultadoDeRodada,
  ResultadoDoLaco,
  RevisorLlm,
  SaidaDoPlanejador,
  SessaoDoLaco,
  SnapshotDeOrcamento,
  SurfaceDeOrcamento,
  TipoDeParada,
  VerificadorDeOrcamento,
  VerificadorDeProvas,
  ViolacaoMecanica,
} from './loopTipos';
export {
  aplicarDelta,
  avaliarParadaMecanica,
  calcularRodadasMaximas,
  criarVerificadorDeOrcamento,
  criarVerificadorDeProvas,
  distanciaDeArtefatos,
  hashDoConjunto,
  jaccardNormalizado,
  scoreErro,
} from './loopPrimitivas';
export { criarSessaoDeRevisao } from './loopEstado';
export { rodarRodadaDeRevisao, rodarLacoDeRevisao } from './loopApi';
