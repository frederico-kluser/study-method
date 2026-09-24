/**
 * tests/cx-phases-runtime-runstate.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/runtime/runState.ts`, para as ondas de refatoração de phases/runtime.
 *
 * Estes testes PINAM o comportamento OBSERVÁVEL atual: artefatos produzidos,
 * erros estruturados (código + campo), transições de estado e imutabilidade.
 * Se uma refatoração mudar qualquer coisa aqui, o contrato observável mudou.
 *
 * Sem rede, sem LLM, sem chave: só disco temporário (mkdtemp) e funções puras.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  CONTENT_SRC_DIR,
  FASES_ORDEM,
  LEDGER_FILENAME,
  RUN_FILENAME,
  RunStateError,
  TELEMETRY_FILENAME,
  TRACKS_OUTPUT_DIR,
  comMutex,
  criarRun,
  concluirFase,
  dirProdutoFinal,
  escreverAtomico,
  fasesConcluidas,
  iniciarFase,
  isFaseId,
  isHashSha256,
  isSlugValido,
  lerArquivoOuVazio,
  lerRun,
  primeiraFasePendente,
  raizTrabalhoSlug,
  runConcluido,
  salvarRun,
  temRun,
  validarRun,
  type CriarRunInput,
  type FaseId,
  type RunState,
  type StatusFase,
} from '../electron/main/engine/runtime/runState';

// ---------------------------------------------------------------------------
// Fakes e helpers
// ---------------------------------------------------------------------------

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

async function tmpDir(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxph-runstate-'));
}

function entradaValida(over: Partial<CriarRunInput> = {}): CriarRunInput {
  return {
    slug: 'trilha-js',
    budgetHash: HASH_A,
    graphHash: HASH_B,
    modelosPorEtapa: { F0: 'modelo-teste' },
    promptVersao: 'p-1',
    catalogoVersao: 'c-1',
    ...over,
  };
}

/** Erro estruturado esperado: chega como RunStateError com código+campo. */
function esperaRunStateError(fn: () => unknown, code: string, campo?: string): RunStateError {
  let capturado: unknown;
  try {
    fn();
  } catch (erro) {
    capturado = erro;
  }
  assert.ok(capturado instanceof RunStateError, `esperado RunStateError, veio ${String(capturado)}`);
  assert.equal(capturado.code, code);
  if (campo !== undefined) assert.equal(capturado.campo, campo);
  return capturado;
}

async function esperaRunStateErrorAsync(
  fn: () => Promise<unknown>,
  code: string,
  campo?: string,
): Promise<RunStateError> {
  let capturado: unknown;
  try {
    await fn();
  } catch (erro) {
    capturado = erro;
  }
  assert.ok(capturado instanceof RunStateError, `esperado RunStateError, veio ${String(capturado)}`);
  assert.equal(capturado.code, code);
  if (campo !== undefined) assert.equal(capturado.campo, campo);
  return capturado;
}

/** Leva um run recém-criado até `ate` (inclusive) com o ciclo canônico. */
function avancarAte(run: RunState, ate: FaseId): RunState {
  let r = run;
  for (const fase of FASES_ORDEM) {
    r = iniciarFase(r, fase);
    r = concluirFase(r, fase);
    if (fase === ate) break;
  }
  return r;
}

// ---------------------------------------------------------------------------
// 1. Constantes de layout e a ordem fixa das fases
// ---------------------------------------------------------------------------

describe('runState — layout de disco e ordem fixa (contrato declarado)', () => {
  it('fixa os nomes de arquivo do run e os diretórios de trabalho/produto', () => {
    assert.equal(RUN_FILENAME, 'run.json');
    assert.equal(LEDGER_FILENAME, 'ledger.jsonl');
    assert.equal(TELEMETRY_FILENAME, 'telemetry.jsonl');
    assert.equal(CONTENT_SRC_DIR, 'app/content-src');
    assert.equal(TRACKS_OUTPUT_DIR, 'app/resources/tracks');
    assert.equal(raizTrabalhoSlug('js-do-zero'), path.join('app/content-src', 'js-do-zero'));
    assert.equal(dirProdutoFinal('js-do-zero'), path.join('app/resources/tracks', 'js-do-zero'));
  });

  it('fixa a ordem canônica F0..F12 (13 fases)', () => {
    assert.deepEqual([...FASES_ORDEM], ['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']);
  });
});

// ---------------------------------------------------------------------------
// 2. Guardas de formato (defesa de caminho/hash)
// ---------------------------------------------------------------------------

describe('runState — guardas de formato', () => {
  it('isSlugValido: aceita minúsculas/dígitos/_/- começando alfanumérico; rejeita o resto', () => {
    for (const bom of ['a', 'trilha-js', 'trilha_2', 'x-9-y', '0abc']) {
      assert.equal(isSlugValido(bom), true, `slug ${bom} deveria ser válido`);
    }
    for (const ruim of ['', 'Trilha', 'a b', 'a.b', 'a/b', '../x', '-x', '_x', 'a..b', 'ção', 42, null, undefined]) {
      assert.equal(isSlugValido(ruim), false, `slug ${String(ruim)} deveria ser inválido`);
    }
  });

  it('isHashSha256: 64 hex minúsculo; qualquer outra coisa é inválida', () => {
    assert.equal(isHashSha256(HASH_A), true);
    assert.equal(isHashSha256('A'.repeat(64)), false, 'hex MAIÚSCULO não passa (classe [0-9a-f])');
    assert.equal(isHashSha256('a'.repeat(63)), false);
    assert.equal(isHashSha256('a'.repeat(65)), false);
    assert.equal(isHashSha256('g'.repeat(64)), false);
    assert.equal(isHashSha256(123), false);
  });

  it('isFaseId: somente F0..F12', () => {
    for (const fase of FASES_ORDEM) assert.equal(isFaseId(fase), true);
    for (const ruim of ['f0', 'F13', 'FX', '', 7, null]) assert.equal(isFaseId(ruim), false);
  });
});

// ---------------------------------------------------------------------------
// 3. criarRun — fail-closed na entrada, estado inicial determinístico
// ---------------------------------------------------------------------------

describe('runState — criarRun', () => {
  it('cria run com 13 fases pendentes, faseAtual F0 e runId UUID', () => {
    const run = criarRun(entradaValida());
    assert.equal(run.schemaVersion, 1);
    assert.equal(run.faseAtual, 'F0');
    assert.match(run.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(Object.keys(run.fases).length, 13);
    for (const fase of FASES_ORDEM) assert.equal(run.fases[fase], 'pendente');
    assert.equal(primeiraFasePendente(run), 'F0');
    assert.deepEqual(fasesConcluidas(run), []);
    assert.equal(runConcluido(run), false);
    assert.equal(run.slug, 'trilha-js');
    assert.equal(run.budgetHash, HASH_A);
    assert.equal(run.graphHash, HASH_B);
    assert.deepEqual(run.modelosPorEtapa, { F0: 'modelo-teste' });
  });

  it('aceita modelosPorEtapa vazio (preenchimento lazy) e rejeita etapa desconhecida ou modelo vazio', () => {
    assert.deepEqual(criarRun(entradaValida({ modelosPorEtapa: {} })).modelosPorEtapa, {});
    esperaRunStateError(
      () => criarRun(entradaValida({ modelosPorEtapa: { F99: 'm' } as unknown as Partial<Record<FaseId, string>> })),
      'RUN_JSON_INVALIDO',
      'modelosPorEtapa',
    );
    esperaRunStateError(() => criarRun(entradaValida({ modelosPorEtapa: { F0: '  ' } })), 'RUN_JSON_INVALIDO', 'modelosPorEtapa');
  });

  it('entrada inválida é erro estruturado por campo — nunca run vazio', () => {
    esperaRunStateError(() => criarRun(entradaValida({ slug: 'a.b' })), 'SLUG_INVALIDO', 'slug');
    esperaRunStateError(() => criarRun(entradaValida({ budgetHash: 'curto' })), 'RUN_JSON_INVALIDO', 'budgetHash');
    esperaRunStateError(() => criarRun(entradaValida({ graphHash: 'zz' })), 'RUN_JSON_INVALIDO', 'graphHash');
    esperaRunStateError(() => criarRun(entradaValida({ promptVersao: '' })), 'RUN_JSON_INVALIDO', 'promptVersao');
    esperaRunStateError(() => criarRun(entradaValida({ catalogoVersao: '   ' })), 'RUN_JSON_INVALIDO', 'catalogoVersao');
  });
});

// ---------------------------------------------------------------------------
// 4. validarRun — schema completo + invariantes da máquina
// ---------------------------------------------------------------------------

describe('runState — validarRun (fail-closed, campo nomeado)', () => {
  it('aceita o objeto de criarRun e devolve um NOVO objeto higienizado', () => {
    const run = criarRun(entradaValida());
    const copia = JSON.parse(JSON.stringify(run)) as RunState;
    const saida = validarRun(copia);
    assert.notEqual(saida, copia, 'a validação devolve objeto novo, não o cru');
    assert.deepEqual(saida.fases, run.fases);
  });

  it('raiz que não é objeto e schemaVersion ≠ 1 são RUN_JSON_INVALIDO nomeando o campo', () => {
    esperaRunStateError(() => validarRun(null), 'RUN_JSON_INVALIDO', 'run');
    esperaRunStateError(() => validarRun([]), 'RUN_JSON_INVALIDO', 'run');
    esperaRunStateError(() => validarRun({ ...criarRun(entradaValida()), schemaVersion: 2 }), 'RUN_JSON_INVALIDO', 'schemaVersion');
  });

  it('fases: exige as 13 chaves — falta ou sobra reprova', () => {
    const run = criarRun(entradaValida()) as unknown as Record<string, unknown>;
    const fases = { ...(run.fases as Record<string, StatusFase>) };
    delete fases['F7'];
    esperaRunStateError(() => validarRun({ ...run, fases }), 'RUN_JSON_INVALIDO', 'fases');
    esperaRunStateError(
      () => validarRun({ ...run, fases: { ...fases, F7: 'pendente', EXTRA: 'done' } }),
      'RUN_JSON_INVALIDO',
      'fases',
    );
  });

  it('fases: status fora de pendente/em_andamento/done reprova', () => {
    const run = criarRun(entradaValida()) as unknown as Record<string, unknown>;
    esperaRunStateError(
      () => validarRun({ ...run, fases: { ...(run.fases as object), F0: 'quase' } }),
      'RUN_JSON_INVALIDO',
      'fases',
    );
  });

  it('invariante: o conjunto done é PREFIXO da ordem fixa', () => {
    const base = avancarAte(criarRun(entradaValida()), 'F2') as unknown as Record<string, unknown>;
    const fases = { ...(base.fases as Record<string, StatusFase>), F4: 'done' };
    const erro = esperaRunStateError(() => validarRun({ ...base, fases }), 'RUN_JSON_INVALIDO', 'fases');
    assert.match(erro.message, /prefixo/);
  });

  it('invariante: no máximo UMA fase em_andamento, e é a primeira não concluída', () => {
    const base = avancarAte(criarRun(entradaValida()), 'F1') as unknown as Record<string, unknown>;
    const fases = { ...(base.fases as Record<string, StatusFase>), F5: 'em_andamento' };
    const erro = esperaRunStateError(() => validarRun({ ...base, fases, faseAtual: 'F2' }), 'RUN_JSON_INVALIDO', 'fases');
    assert.match(erro.message, /primeira não concluída/);
  });

  it('faseAtual deve ser a primeira não concluída; run concluído exige faseAtual F12', () => {
    const base = avancarAte(criarRun(entradaValida()), 'F1') as unknown as Record<string, unknown>;
    const erro = esperaRunStateError(() => validarRun({ ...base, faseAtual: 'F1' }), 'RUN_JSON_INVALIDO', 'faseAtual');
    assert.match(erro.message, /primeira fase não concluída é F2/);
    esperaRunStateError(() => validarRun({ ...base, faseAtual: 'FX' }), 'RUN_JSON_INVALIDO', 'faseAtual');

    const concluido = avancarAte(criarRun(entradaValida()), 'F12') as unknown as Record<string, unknown>;
    assert.equal((concluido.fases as Record<string, StatusFase>).F12, 'done');
    esperaRunStateError(() => validarRun({ ...concluido, faseAtual: 'F11' }), 'RUN_JSON_INVALIDO', 'faseAtual');
  });

  it('datas ISO e hashes são validados por campo', () => {
    const base = criarRun(entradaValida()) as unknown as Record<string, unknown>;
    esperaRunStateError(() => validarRun({ ...base, criadoEm: 'ontem' }), 'RUN_JSON_INVALIDO', 'criadoEm');
    esperaRunStateError(() => validarRun({ ...base, atualizadoEm: '' }), 'RUN_JSON_INVALIDO', 'atualizadoEm');
    esperaRunStateError(() => validarRun({ ...base, budgetHash: 'nope' }), 'RUN_JSON_INVALIDO', 'budgetHash');
    esperaRunStateError(() => validarRun({ ...base, graphHash: 'nope' }), 'RUN_JSON_INVALIDO', 'graphHash');
    esperaRunStateError(() => validarRun({ ...base, runId: ' ' }), 'RUN_JSON_INVALIDO', 'runId');
    esperaRunStateError(() => validarRun({ ...base, promptVersao: '' }), 'RUN_JSON_INVALIDO', 'promptVersao');
  });
});

// ---------------------------------------------------------------------------
// 5. Máquina de transições (pura, imutável)
// ---------------------------------------------------------------------------

describe('runState — transições de fase (ordem fixa, imutáveis)', () => {
  it('iniciarFase marca em_andamento e preserva o objeto original (imutabilidade)', () => {
    const run = criarRun(entradaValida());
    const r1 = iniciarFase(run, 'F0');
    assert.equal(r1.fases.F0, 'em_andamento');
    assert.equal(r1.faseAtual, 'F0');
    assert.equal(run.fases.F0, 'pendente', 'o run original NÃO muda');
  });

  it('concluirFase marca done e avança faseAtual para a próxima pendente', () => {
    let r = iniciarFase(criarRun(entradaValida()), 'F0');
    r = concluirFase(r, 'F0');
    assert.equal(r.fases.F0, 'done');
    assert.equal(r.faseAtual, 'F1');
    assert.equal(primeiraFasePendente(r), 'F1');
    assert.deepEqual(fasesConcluidas(r), ['F0']);
  });

  it('ordem fixa: iniciar fase fora da vez é TRANSICAO_INVALIDA', () => {
    const run = criarRun(entradaValida());
    const erro = esperaRunStateError(() => iniciarFase(run, 'F3'), 'TRANSICAO_INVALIDA', 'fase');
    assert.match(erro.message, /ordem fixa/);
  });

  it('re-iniciar fase já iniciada é TRANSICAO_INVALIDA (retomada executa direto)', () => {
    const r1 = iniciarFase(criarRun(entradaValida()), 'F0');
    const erro = esperaRunStateError(() => iniciarFase(r1, 'F0'), 'TRANSICAO_INVALIDA', 'fase');
    assert.match(erro.message, /re-iniciar fase já iniciada é proibido/);
  });

  it('concluir fase que não está em_andamento é TRANSICAO_INVALIDA', () => {
    const run = criarRun(entradaValida());
    const erro = esperaRunStateError(() => concluirFase(run, 'F0'), 'TRANSICAO_INVALIDA', 'fase');
    assert.match(erro.message, /não está em_andamento \(está pendente\)/);
    const iniciada = iniciarFase(run, 'F0');
    const concluida = concluirFase(iniciada, 'F0');
    esperaRunStateError(() => concluirFase(concluida, 'F0'), 'TRANSICAO_INVALIDA', 'fase');
  });

  it('concluir fase que não é a faseAtual é TRANSICAO_INVALIDA', () => {
    const base = avancarAte(criarRun(entradaValida()), 'F0');
    const fora = { ...iniciarFase(base, 'F1'), faseAtual: 'F5' } as RunState;
    const erro = esperaRunStateError(() => concluirFase(fora, 'F1'), 'TRANSICAO_INVALIDA', 'fase');
    assert.match(erro.message, /fase atual é F5, não F1/);
  });

  it('fase desconhecida em iniciar/concluir é FASE_INVALIDA', () => {
    const run = criarRun(entradaValida());
    esperaRunStateError(() => iniciarFase(run, 'F13'), 'FASE_INVALIDA', 'fase');
    esperaRunStateError(() => concluirFase(run, 'qualquer'), 'FASE_INVALIDA', 'fase');
  });

  it('percurso completo F0..F12: runConcluido vira true e faseAtual permanece F12', () => {
    const concluido = avancarAte(criarRun(entradaValida()), 'F12');
    assert.equal(runConcluido(concluido), true);
    assert.equal(primeiraFasePendente(concluido), null);
    assert.deepEqual(fasesConcluidas(concluido), [...FASES_ORDEM]);
    assert.equal(concluido.faseAtual, 'F12', 'run concluído mantém faseAtual F12');
    const erro = esperaRunStateError(() => iniciarFase(concluido, 'F0'), 'TRANSICAO_INVALIDA', 'fase');
    assert.match(erro.message, /run já concluído/);
  });
});

// ---------------------------------------------------------------------------
// 6. Escrita atômica (D-WRITE) e mutex (D-ESCRITOR-UNICO)
// ---------------------------------------------------------------------------

describe('runState — escrita atômica e mutex', () => {
  it('escreverAtomico materializa o conteúdo e não deixa tmp para trás', async () => {
    const dir = await tmpDir();
    const alvo = path.join(dir, 'arquivo.txt');
    await escreverAtomico(alvo, 'conteudo-completo');
    assert.equal(await fsp.readFile(alvo, 'utf8'), 'conteudo-completo');
    const sobras = (await fsp.readdir(dir)).filter((n) => n.includes('.tmp.'));
    assert.deepEqual(sobras, [], 'nenhum tmp órfão após sucesso');
  });

  it('falha NO MEIO da escrita: o alvo anterior fica íntegro e o tmp é removido', async () => {
    const dir = await tmpDir();
    const alvo = path.join(dir, 'arquivo.txt');
    await escreverAtomico(alvo, 'versao-original');
    await assert.rejects(
      escreverAtomico(alvo, 'versao-nova', async (caminho, conteudo) => {
        await fsp.writeFile(caminho, conteudo.slice(0, 4), 'utf8'); // grava pela metade
        throw new Error('queda de energia simulada');
      }),
      /queda de energia simulada/,
    );
    assert.equal(await fsp.readFile(alvo, 'utf8'), 'versao-original', 'o alvo nunca fica pela metade');
    const sobras = (await fsp.readdir(dir)).filter((n) => n.includes('.tmp.'));
    assert.deepEqual(sobras, [], 'o tmp corrompido é limpo no erro');
  });

  it('comMutex serializa execuções concorrentes da MESMA chave em FIFO', async () => {
    const ordem: number[] = [];
    const corridas = [3, 1, 2].map((n, indice) =>
      comMutex('chave-fila', async () => {
        ordem.push(n);
        await new Promise((resolve) => setTimeout(resolve, 5 * (3 - indice)));
        return n;
      }),
    );
    const resultados = await Promise.all(corridas);
    assert.deepEqual(ordem, [3, 1, 2], 'a ordem de ENTRADA na fila é preservada');
    assert.deepEqual(resultados, [3, 1, 2], 'cada chamada recebe o retorno do próprio fn');
  });

  it('comMutex: erro de um crítico vai só ao dono e NÃO trava a fila', async () => {
    const ordem: string[] = [];
    const falho = comMutex('chave-erro', async () => {
      ordem.push('falho');
      throw new Error('explodiu');
    });
    const depois = comMutex('chave-erro', async () => {
      ordem.push('depois');
      return 'ok';
    });
    await assert.rejects(falho, /explodiu/);
    assert.equal(await depois, 'ok');
    assert.deepEqual(ordem, ['falho', 'depois']);
  });

  it('lerArquivoOuVazio: ausência é string vazia; conteúdo existente volta cru; outro erro propaga', async () => {
    const dir = await tmpDir();
    assert.equal(await lerArquivoOuVazio(path.join(dir, 'nao-existe.txt')), '');
    await fsp.writeFile(path.join(dir, 'existe.txt'), 'abc', 'utf8');
    assert.equal(await lerArquivoOuVazio(path.join(dir, 'existe.txt')), 'abc');
    await assert.rejects(lerArquivoOuVazio(dir), (erro: NodeJS.ErrnoException) => erro.code === 'EISDIR');
  });
});

// ---------------------------------------------------------------------------
// 7. IO do run.json — fail-closed (A-P03-3)
// ---------------------------------------------------------------------------

describe('runState — IO do run.json', () => {
  it('temRun: false sem run.json, true com; salvarRun+lerRun faz o ciclo completo', async () => {
    const dir = await tmpDir();
    assert.equal(await temRun(dir), false);
    const run = criarRun(entradaValida());
    await salvarRun(dir, run);
    assert.equal(await temRun(dir), true);
    const lido = await lerRun(dir);
    assert.equal(lido.slug, run.slug);
    assert.equal(lido.runId, run.runId);
    assert.deepEqual(lido.fases, run.fases);
  });

  it('salvarRun estampa atualizadoEm novo em disco (o objeto em memória não muda)', async () => {
    const dir = await tmpDir();
    const run = criarRun(entradaValida());
    const atualizadoAntes = run.atualizadoEm;
    await salvarRun(dir, run);
    assert.equal(run.atualizadoEm, atualizadoAntes, 'o objeto em memória não é tocado');
    const emDisco = JSON.parse(await fsp.readFile(path.join(dir, RUN_FILENAME), 'utf8')) as RunState;
    assert.ok(Date.parse(emDisco.atualizadoEm) >= Date.parse(atualizadoAntes));
  });

  it('salvarRun RECUSA estado inválido — nada chega ao disco', async () => {
    const dir = await tmpDir();
    const corrompido = { ...criarRun(entradaValida()), faseAtual: 'F9' } as RunState;
    await esperaRunStateErrorAsync(() => salvarRun(dir, corrompido), 'RUN_JSON_INVALIDO', 'faseAtual');
    assert.equal(await temRun(dir), false, 'run.json inválido nunca é gravado');
  });

  it('lerRun: ausência/corrompido/inválido são códigos estruturados distintos', async () => {
    const dir = await tmpDir();
    await esperaRunStateErrorAsync(() => lerRun(dir), 'RUN_JSON_AUSENTE', 'run');
    await fsp.writeFile(path.join(dir, RUN_FILENAME), '{isso não é json', 'utf8');
    await esperaRunStateErrorAsync(() => lerRun(dir), 'RUN_JSON_CORROMPIDO', 'run');
    await fsp.writeFile(path.join(dir, RUN_FILENAME), '{"schemaVersion":1}', 'utf8');
    await esperaRunStateErrorAsync(() => lerRun(dir), 'RUN_JSON_INVALIDO', 'runId');
  });

  it('falha de escrita do salvarRun vira IO_ERRO (fail-closed)', async () => {
    const dir = await tmpDir();
    const run = criarRun(entradaValida());
    await esperaRunStateErrorAsync(
      () =>
        salvarRun(dir, run, {
          escreverArquivo: async () => {
            throw new Error('disco cheio');
          },
        }),
      'IO_ERRO',
    );
    assert.equal(await temRun(dir), false);
  });
});
