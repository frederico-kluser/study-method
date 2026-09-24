/**
 * app/electron/main/engine/runtime/runStateValidate.ts — VALIDAÇÃO FAIL-CLOSED
 * do `run.json` (A-P03-3): parse que falha OU campo inválido produz
 * `RunStateError` estruturado (código + mensagem + campo), NUNCA um estado
 * silenciosamente vazio. §9.3: a engine falha fechada.
 *
 * EXTRAÍDO de `runtime/runState.ts` na refatoração L06 (CC≤8 por função; a
 * ORDEM de validação dos campos — e portanto qual campo é nomeado no erro — é
 * preservada literalmente). `validarRun` é reexportado pelo caminho público
 * `runtime/runState.ts`.
 */

import {
  FASES_ORDEM,
  invalido,
  isDataISO,
  isFaseId,
  isHashSha256,
  isSlugValido,
  isStatusFase,
  type EtapaId,
  type FaseId,
  type RunState,
  type StatusFase,
} from './runStateModel';

export function validarStringObrigatoria(o: Record<string, unknown>, campo: string): string {
  const v = o[campo];
  if (typeof v !== 'string' || v.trim() === '') {
    throw invalido(campo, `esperado string não vazia; recebido ${JSON.stringify(v)}`);
  }
  return v;
}

/** O objeto `fases`, com a raiz conferida (shape, não conteúdo). */
function objetoFases(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalido('fases', 'esperado objeto com uma chave por fase');
  }
  return raw as Record<string, unknown>;
}

/**
 * Preenche o mapa de status na ordem canônica, exigindo IGUALDADE DE
 * CONJUNTO de chaves (ordenação lexicográfica de 'F10' < 'F2' tornaria uma
 * comparação por string.join enganosa): mesmas 13 chaves, sem sobra e sem
 * falta; cada status ∈ pendente/em_andamento/done.
 */
function preencherStatuses(obj: Record<string, unknown>): Record<FaseId, StatusFase> {
  const chaves = Object.keys(obj);
  if (chaves.length !== FASES_ORDEM.length || !FASES_ORDEM.every((f) => chaves.includes(f))) {
    throw invalido(
      'fases',
      `chaves esperadas (${FASES_ORDEM.join(',')}); recebidas ${chaves.join(',') || '(vazio)'}`,
    );
  }
  const out = {} as Record<FaseId, StatusFase>;
  for (const fase of FASES_ORDEM) {
    const status = obj[fase];
    if (!isStatusFase(status)) {
      throw invalido('fases', `status inválido para ${fase}: ${JSON.stringify(status)}`);
    }
    out[fase] = status;
  }
  return out;
}

/**
 * Invariante (1): o conjunto `done` é um PREFIXO da ordem fixa — fase
 * concluída com fase anterior não concluída é estado inconsistente. Devolve o
 * índice da primeira fase NÃO concluída (fim do prefixo).
 */
function validarPrefixoDone(out: Record<FaseId, StatusFase>): number {
  let fimDoPrefixoDone = 0;
  while (fimDoPrefixoDone < FASES_ORDEM.length && out[FASES_ORDEM[fimDoPrefixoDone]] === 'done') {
    fimDoPrefixoDone += 1;
  }
  for (let i = fimDoPrefixoDone; i < FASES_ORDEM.length; i += 1) {
    if (out[FASES_ORDEM[i]] === 'done') {
      throw invalido(
        'fases',
        `fase ${FASES_ORDEM[i]} concluída sem a fase anterior ${FASES_ORDEM[i - 1]} concluída — o conjunto done não é um prefixo`,
      );
    }
  }
  return fimDoPrefixoDone;
}

/**
 * Invariante (2): no máximo uma fase `em_andamento`, e ela é a primeira não
 * concluída.
 */
function validarEmAndamento(out: Record<FaseId, StatusFase>, inicio: number): void {
  const pendente = inicio < FASES_ORDEM.length ? FASES_ORDEM[inicio] : null;
  for (let i = inicio; i < FASES_ORDEM.length; i += 1) {
    const status = out[FASES_ORDEM[i]];
    if (status === 'em_andamento' && FASES_ORDEM[i] !== pendente) {
      throw invalido(
        'fases',
        `fase ${FASES_ORDEM[i]} em_andamento sem ser a primeira não concluída (${pendente})`,
      );
    }
  }
}

export function validarFases(raw: unknown): Record<FaseId, StatusFase> {
  const out = preencherStatuses(objetoFases(raw));
  // Invariantes da máquina: prefixo `done` + `em_andamento` único e na frente.
  const fimDoPrefixoDone = validarPrefixoDone(out);
  validarEmAndamento(out, fimDoPrefixoDone);
  return out;
}

export function validarModelos(raw: unknown): Partial<Record<EtapaId, string>> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalido('modelosPorEtapa', 'esperado objeto etapa→modelo');
  }
  const out: Partial<Record<EtapaId, string>> = {};
  for (const [etapa, modelo] of Object.entries(raw as Record<string, unknown>)) {
    if (!isFaseId(etapa)) {
      throw invalido('modelosPorEtapa', `etapa desconhecida: ${JSON.stringify(etapa)} (esperado ∈ FASES_ORDEM)`);
    }
    if (typeof modelo !== 'string' || modelo.trim() === '') {
      throw invalido('modelosPorEtapa', `modelo vazio/inválido para ${etapa}: ${JSON.stringify(modelo)}`);
    }
    out[etapa] = modelo;
  }
  return out;
}

/** slug seguro + datas ISO de criação/atualização (nesta ordem — o erro nomeia o primeiro). */
function validarIdentidadeEData(o: Record<string, unknown>): { runId: string; slug: string; criadoEm: string; atualizadoEm: string } {
  const runId = validarStringObrigatoria(o, 'runId');
  const slug = validarStringObrigatoria(o, 'slug');
  if (!isSlugValido(slug)) {
    throw invalido('slug', `padrão seguro violado: ${JSON.stringify(slug)} (sem '.', '..', '/' ou espaço)`);
  }
  const criadoEm = validarStringObrigatoria(o, 'criadoEm');
  if (!isDataISO(criadoEm)) throw invalido('criadoEm', `não é data ISO-8601: ${JSON.stringify(criadoEm)}`);
  const atualizadoEm = validarStringObrigatoria(o, 'atualizadoEm');
  if (!isDataISO(atualizadoEm)) throw invalido('atualizadoEm', `não é data ISO-8601: ${JSON.stringify(atualizadoEm)}`);
  return { runId, slug, criadoEm, atualizadoEm };
}

/**
 * `faseAtual` deve ser a primeira fase não concluída (ou F12 num run
 * concluído) — o cursor persistido nunca pula nem volta.
 */
function validarFaseAtual(fases: Record<FaseId, StatusFase>, bruto: unknown): FaseId {
  const primeiraPendente = FASES_ORDEM.find((f) => fases[f] !== 'done') ?? null;
  const faseAtual = bruto;
  if (!isFaseId(faseAtual)) throw invalido('faseAtual', `não é uma fase: ${JSON.stringify(faseAtual)}`);
  if (primeiraPendente !== null) {
    if (faseAtual !== primeiraPendente) {
      throw invalido(
        'faseAtual',
        `primeira fase não concluída é ${primeiraPendente}, mas faseAtual é ${faseAtual}`,
      );
    }
  } else if (faseAtual !== 'F12') {
    throw invalido('faseAtual', 'run concluído deve ter faseAtual F12');
  }
  return faseAtual;
}

/** Os dois hashes congelados (orçamento e grafo), sha256 em hex. */
function validarHashes(o: Record<string, unknown>): { budgetHash: string; graphHash: string } {
  const budgetHash = validarStringObrigatoria(o, 'budgetHash');
  if (!isHashSha256(budgetHash)) throw invalido('budgetHash', `não é sha256 em hex (64): ${JSON.stringify(budgetHash)}`);
  const graphHash = validarStringObrigatoria(o, 'graphHash');
  if (!isHashSha256(graphHash)) throw invalido('graphHash', `não é sha256 em hex (64): ${JSON.stringify(graphHash)}`);
  return { budgetHash, graphHash };
}

/**
 * Valida uma `unknown` (resultado de JSON.parse ou um objeto em memória) como
 * `RunState` COMPLETO. Falha = `RunStateError` estruturado. Retorna o estado
 * HIGIENIZADO (fases na ordem canônica de FASES_ORDEM), nunca o objeto cru.
 *
 * Refatoração L06 (CC≤8): os blocos viraram passos nomeados — a ORDEM de
 * validação (schemaVersion → runId → slug → criadoEm → atualizadoEm → fases →
 * faseAtual → budgetHash → graphHash → modelosPorEtapa → promptVersao →
 * catalogoVersao) é exatamente a de antes, e é ela que decide qual campo o
 * erro nomeia.
 */
export function validarRun(raw: unknown): RunState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalido('run', 'raiz não é um objeto');
  }
  const o = raw as Record<string, unknown>;

  if (o['schemaVersion'] !== 1) {
    throw invalido('schemaVersion', `esperado 1; recebido ${JSON.stringify(o['schemaVersion'])}`);
  }
  const { runId, slug, criadoEm, atualizadoEm } = validarIdentidadeEData(o);

  const fases = validarFases(o['fases']);
  const faseAtual = validarFaseAtual(fases, o['faseAtual']);
  const { budgetHash, graphHash } = validarHashes(o);

  const modelosPorEtapa = validarModelos(o['modelosPorEtapa']);
  const promptVersao = validarStringObrigatoria(o, 'promptVersao');
  const catalogoVersao = validarStringObrigatoria(o, 'catalogoVersao');

  return {
    schemaVersion: 1,
    runId,
    slug,
    criadoEm,
    atualizadoEm,
    faseAtual,
    fases,
    budgetHash,
    graphHash,
    modelosPorEtapa,
    promptVersao,
    catalogoVersao,
  };
}
