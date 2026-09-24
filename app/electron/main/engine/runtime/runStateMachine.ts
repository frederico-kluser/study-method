/**
 * app/electron/main/engine/runtime/runStateMachine.ts — MÁQUINA DE FASES F0..F12
 * (ordem fixa, `docs/16-engine-de-trilha.md` §4): transições PURAS (sem IO),
 * imutáveis (toda transição devolve um NOVO objeto) e fail-closed (transição
 * fora da ordem/status é `RunStateError` estruturado, nunca no-op).
 *
 * EXTRAÍDO de `runtime/runState.ts` na refatoração L06. CONTRATO DE RETOMADA
 * (para as ondas 2-4): o executor pergunta `primeiraFasePendente(run)`; se o
 * status dessa fase é `pendente`, chama `iniciarFase`; se já é `em_andamento`
 * (interrompido NO MEIO da fase), executa direto. Nunca re-chamar
 * `iniciarFase` numa fase que já começou — é erro estruturado
 * (TRANSICAO_INVALIDA), não um no-op silencioso.
 */

import { randomUUID } from 'node:crypto';

import {
  FASES_ORDEM,
  RunStateError,
  isHashSha256,
  isFaseId,
  isSlugValido,
  type CriarRunInput,
  type FaseId,
  type RunState,
  type StatusFase,
} from './runStateModel';
import { validarModelos, validarRun } from './runStateValidate';

/**
 * Cria um run novo: todas as fases `pendente`, faseAtual F0. Valida cada campo
 * de entrada (fail-closed: entrada inválida = RunStateError, nunca run vazio).
 */
export function criarRun(input: CriarRunInput): RunState {
  if (!isSlugValido(input.slug)) {
    throw new RunStateError('SLUG_INVALIDO', `slug inválido: ${JSON.stringify(input.slug)}`, 'slug');
  }
  if (!isHashSha256(input.budgetHash)) {
    throw new RunStateError('RUN_JSON_INVALIDO', `budgetHash inválido: ${JSON.stringify(input.budgetHash)}`, 'budgetHash');
  }
  if (!isHashSha256(input.graphHash)) {
    throw new RunStateError('RUN_JSON_INVALIDO', `graphHash inválido: ${JSON.stringify(input.graphHash)}`, 'graphHash');
  }
  if (typeof input.promptVersao !== 'string' || input.promptVersao.trim() === '') {
    throw new RunStateError('RUN_JSON_INVALIDO', 'promptVersao obrigatória e não vazia', 'promptVersao');
  }
  if (typeof input.catalogoVersao !== 'string' || input.catalogoVersao.trim() === '') {
    throw new RunStateError('RUN_JSON_INVALIDO', 'catalogoVersao obrigatória e não vazia', 'catalogoVersao');
  }
  const modelosPorEtapa = validarModelos(input.modelosPorEtapa); // lança se inválido

  const agora = new Date().toISOString();
  const fases = Object.fromEntries(FASES_ORDEM.map((f) => [f, 'pendente'])) as Record<FaseId, StatusFase>;
  const run: RunState = {
    schemaVersion: 1,
    runId: randomUUID(),
    slug: input.slug,
    criadoEm: agora,
    atualizadoEm: agora,
    faseAtual: 'F0',
    fases,
    budgetHash: input.budgetHash,
    graphHash: input.graphHash,
    modelosPorEtapa,
    promptVersao: input.promptVersao,
    catalogoVersao: input.catalogoVersao,
  };
  return validarRun(run); // invariante: criarRun só devolve estado válido
}

/** Fases já concluídas, na ordem fixa (interface de retomada — contrato P-03). */
export function fasesConcluidas(run: RunState): FaseId[] {
  return FASES_ORDEM.filter((f) => run.fases[f] === 'done');
}

/**
 * A PRIMEIRA fase não concluída — o ponto de retomada. `null` quando o run está
 * concluído (chame `runConcluido(run)` para distinguir do estado corrupto:
 * corrupção LANÇA RunStateError na carga, nunca devolve null).
 */
export function primeiraFasePendente(run: RunState): FaseId | null {
  return FASES_ORDEM.find((f) => run.fases[f] !== 'done') ?? null;
}

/** O run chegou ao fim (todas as fases done)? */
export function runConcluido(run: RunState): boolean {
  return primeiraFasePendente(run) === null;
}

function validarFaseIdOuLancar(fase: string): FaseId {
  if (!isFaseId(fase)) {
    throw new RunStateError(
      'FASE_INVALIDA',
      `fase desconhecida: ${JSON.stringify(fase)} (esperado uma de ${FASES_ORDEM.join(', ')})`,
      'fase',
    );
  }
  return fase;
}

/**
 * MARCA uma fase como `em_andamento`. Só a próxima fase da ordem fixa pode ser
 * iniciada, e só se ainda estiver `pendente` — re-iniciar uma fase que já
 * começou é erro estruturado (o executor de retomada chama isto apenas quando
 * o status é `pendente`; ver CONTRATO DE RETOMADA no cabeçalho).
 */
export function iniciarFase(run: RunState, fase: string): RunState {
  const id = validarFaseIdOuLancar(fase);
  const pendente = primeiraFasePendente(run);
  if (pendente === null) {
    throw new RunStateError('TRANSICAO_INVALIDA', `run já concluído — nenhuma fase pendente para iniciar`, 'fase');
  }
  if (id !== pendente) {
    throw new RunStateError(
      'TRANSICAO_INVALIDA',
      `ordem fixa: para iniciar ${id} é preciso concluir as anteriores (próxima pendente: ${pendente})`,
      'fase',
    );
  }
  const statusAtual = run.fases[id];
  if (statusAtual !== 'pendente') {
    throw new RunStateError(
      'TRANSICAO_INVALIDA',
      `fase ${id} não está pendente (está ${statusAtual}) — re-iniciar fase já iniciada é proibido`,
      'fase',
    );
  }
  return { ...run, fases: { ...run.fases, [id]: 'em_andamento' }, faseAtual: id };
}

/**
 * MARCA a fase atual como `done` e avança `faseAtual` para a próxima fase da
 * ordem fixa (que fica `pendente`, pronta para `iniciarFase`). Na F12 o run é
 * concluído e faseAtual permanece F12. Só a fase ATUAL e `em_andamento` pode
 * ser concluída; concluir duas vezes é erro estruturado.
 */
export function concluirFase(run: RunState, fase: string): RunState {
  const id = validarFaseIdOuLancar(fase);
  if (run.fases[id] !== 'em_andamento') {
    throw new RunStateError(
      'TRANSICAO_INVALIDA',
      `fase ${id} não está em_andamento (está ${run.fases[id]}) — conclua apenas a fase atual iniciada`,
      'fase',
    );
  }
  if (id !== run.faseAtual) {
    throw new RunStateError('TRANSICAO_INVALIDA', `fase atual é ${run.faseAtual}, não ${id}`, 'fase');
  }
  const fases: Record<FaseId, StatusFase> = { ...run.fases, [id]: 'done' };
  const indice = FASES_ORDEM.indexOf(id);
  const proxima = indice + 1 < FASES_ORDEM.length ? FASES_ORDEM[indice + 1] : id;
  return { ...run, fases, faseAtual: proxima };
}
