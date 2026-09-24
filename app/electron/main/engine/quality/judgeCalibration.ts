/**
 * app/electron/main/engine/quality/judgeCalibration.ts — a MEDIÇÃO da taxa de
 * falso-passe do revisor contra os MUTANTES e a DECISÃO que governa o laço
 * (pacote P-20, "Mutantes e taxa de falso-passe do revisor", onda 2B do plano
 * de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6.6 — o limiar que
 * governa o laço: um revisor que marca falha como passe a uma taxa
 * ≥ (1−τ)/2 — com τ=0,10, **0,45** — nunca remove nada, com qualquer número
 * de rodadas ou de amostras; a métrica que governa o laço é a taxa de
 * falso-passe medida contra MUTANTES INJETADOS; cruzou o limiar → PARE o
 * laço e conserte o juiz. §9.2 — o placar inclui a taxa de falso-passe do
 * revisor contra mutantes.
 *
 * TRÊS RESPONSABILIDADES, TUDO COM O REVISOR INJETÁVEL:
 *
 *   1. `medirTaxaDeFalsoPasse` — o revisor (pipeline P-12 completo, LLM
 *      injetável) julga o artefato VÁLIDO e cada MUTANTE (`rodaMutante` em
 *      `mutants.ts`). Para um mutante, o defeito foi APONTADO quando existe
 *      apontamento cuja categoria pertence ao conjunto DETECTOR da classe E
 *      abre rodada na tabela fixa do §6.5 (`abreRodada` — sugestão nunca
 *      abre rodada: apontar como estilo/tom/prosa é falso-passe) E — quando
 *      o mutante carrega `marcador` — o ALVO do apontamento TOCA o marcador:
 *      interseção por span OU menção do marcador no trecho citado
 *      (`alvo.token`/`evidencia.prova`). Um apontamento com a categoria
 *      certa apontando o TRECHO ERRADO do mutante não conta como acerto —
 *      é falso-passe (direção segura: quem não localiza o defeito não o
 *      detectou; sem esta régua, apontar o teste ÍMPAR que segue o enunciado
 *      "detectaria" o mutante (b)). FALSO-PASSE da classe = mutantes da
 *      classe sem detecção; taxa por classe e geral saem TIPADAS.
 *      FAIL-CLOSED: revisor indisponível durante a calibração (lançou) →
 *      `ErroDeCalibracao` estruturado — a calibração não produz veredito com
 *      o juiz fora do ar (§9.3).
 *
 *   2. `decisaoDeCalibracao` — a decisão do laço. Lê SOMENTE
 *      `medicao.taxaGeral` (a taxa contra os mutantes). `taxaGeral ≥ limiar`
 *      → `{aprovado: false, motivo: 'LIMIAR_FALSO_PASSE'}` com mensagem
 *      explícita de desligamento — mais rodadas e mais amostras não salvam;
 *      o VEREDITO AGREGADO do revisor não é alarme em lugar nenhum deste
 *      pacote (a ausência é fixada por varredura textual em teste).
 *
 *   3. A REMOÇÃO POR CLASSE e o CONTRATO DE LIGAÇÃO:
 *        - `categoriasParaRemover` — função PURA com o estado de gerações
 *          INJETADO (histórico de medições): uma classe cuja razão de acerto
 *          (1 − taxa de falso-passe da classe) fique abaixo do limiar em
 *          DUAS gerações CONSECUTIVAS é marcada para REMOÇÃO do revisor;
 *        - `calibracaoNecessariaAntesDeLigar` — o contrato para o laço F11
 *          (P-22): a calibração roda ANTES de o laço ser ligado numa trilha
 *          real; devolve `true` quando falta calibração aprovada.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: não escreve o report.json (P-24), não liga o
 * laço (P-22), não chama LLM diretamente (o revisor é injetado), não gera
 * mutantes (vêm de `mutants.ts`). Zero IO. As funções de decisão são puras.
 *
 * ─── FACHADA (refatoração L04: arquivo ≤500 linhas e toda função CC≤8) ─────
 *
 * Este caminho público continua o contrato estável dos consumidores
 * (`phases/f6Pilot.ts`, `report/report.ts`, testes); a implementação é
 * re-exportada de três módulos irmãos, sem mudança de comportamento:
 *
 *   - `judgeCalibrationTipos.ts`    — tipos, limiar (1−τ)/2 e erros estruturados;
 *   - `judgeCalibrationDeteccao.ts` — a régua "categoria + abre rodada + marcador";
 *   - `judgeCalibrationMedicao.ts`  — medição, decisão e remoção por categoria.
 */

export * from './judgeCalibrationTipos';
export * from './judgeCalibrationDeteccao';
export * from './judgeCalibrationMedicao';
