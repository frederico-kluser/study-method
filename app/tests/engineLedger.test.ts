/**
 * tests/engineLedger.test.ts — P-03 "Ledger, estado do run e retomada" da
 * engine de trilhas (`docs/16-engine-de-trilha.md` §4, §9.3).
 *
 * O que morde aqui (perguntas falsificáveis da subwave / critérios A-P03):
 *   A-P03-1  todos os testes verdes (bash tools/t.sh tests/engineLedger.test.ts);
 *   A-P03-2  raiz de disco INJETÁVEL: TODO teste cria sua própria árvore em
 *            mkdtemp(os.tmpdir(), ...) e a LIMPA no afterEach — nenhum teste
 *            escreve fora de diretório temporário;
 *   A-P03-3  nenhum JSON.parse sem tratamento: run.json corrompido (parse OU
 *            campo inválido) produz RunStateError estruturado (código +
 *            mensagem + campo), NUNCA estado silenciosamente vazio;
 *   INV-03   fail-closed: anexar sobre ledger adulterado RECUSA; gravar estado
 *            inválido RECUSA; escrita que falha no meio NUNCA deixa o arquivo
 *            pela metade (a gravação parcial morre no tmp, o alvo fica intacto).
 *
 * Sem rede, sem LLM, sem chave: toda raiz de disco é temporária e injetada.
 */
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  FASES_ORDEM,
  LEDGER_FILENAME,
  RUN_FILENAME,
  TELEMETRY_FILENAME,
  CONTENT_SRC_DIR,
  TRACKS_OUTPUT_DIR,
  RunStateError,
  concluirFase,
  criarRun,
  dirProdutoFinal,
  fasesConcluidas,
  iniciarFase,
  lerRun,
  primeiraFasePendente,
  raizTrabalhoSlug,
  runConcluido,
  salvarRun,
  temRun,
  type CriarRunInput,
  type EscreverArquivoFn,
  type RunState,
} from '../electron/main/engine/runtime/runState';
import {
  Ledger,
  LedgerError,
  TelemetriaFile,
  montarCadeia,
  verificarCadeia,
  type EventoNovo,
  type Telemetria,
} from '../electron/main/engine/runtime/ledger';

// ---------------------------------------------------------------------------
// Auxiliares de fixture (cada teste limpa o que criou — A-P03-2)
// ---------------------------------------------------------------------------

const HASH_UM = 'a'.repeat(64);
const HASH_DOIS = 'b'.repeat(64);

/** Entrada válida de criarRun — qualquer teste pode sobrescrever campos. */
function runBase(over: Partial<CriarRunInput> = {}): CriarRunInput {
  return {
    slug: 'demo-trilha',
    budgetHash: HASH_UM,
    graphHash: HASH_DOIS,
    modelosPorEtapa: { F0: 'modelo-x' },
    promptVersao: 'p1',
    catalogoVersao: 'c1',
    ...over,
  };
}

/** Fase F0 iniciada mas não concluída. */
function runComF0Iniciada(): RunState {
  return iniciarFase(criarRun(runBase()), 'F0');
}

/** árvore temporária INJETÁVEL; o afterEach limpa TODAS as criadas. */
const diretoriosCriados: string[] = [];

async function novoDir(prefixo: string): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), `engine-ledger-${prefixo}-`));
  diretoriosCriados.push(dir);
  return dir;
}

afterEach(async () => {
  const pendentes = diretoriosCriados.splice(0);
  for (const d of pendentes) {
    await fsp.rm(d, { recursive: true, force: true });
  }
});

function ehRunStateError(codigo: string): (e: unknown) => boolean {
  return (e) => e instanceof RunStateError && e.code === codigo;
}

const ehLedgerErrorCom = (codigo: string): ((e: unknown) => boolean) => {
  return (e) => e instanceof LedgerError && e.code === codigo;
};

// ---------------------------------------------------------------------------
// 1) Cadeia de hash — teste exigido 1
// ---------------------------------------------------------------------------

describe('ledger — cadeia de hash', () => {
  it('detecta linha adulterada no MEIO e reporta o índice (0-based) da primeira quebrada', async () => {
    const dir = await novoDir('cadeia');
    const ledger = new Ledger(dir);
    await ledger.anexar({ tipo: 'run_criado', runId: 'r-1', slug: 'demo' });
    await ledger.anexar({ tipo: 'fase_iniciada', fase: 'F0' });
    await ledger.anexar({ tipo: 'fase_concluida', fase: 'F0' });
    await ledger.anexar({ tipo: 'fase_iniciada', fase: 'F1' });

    const antes = await ledger.verificarCadeiaEmDisco();
    assert.equal(antes.ok, true);
    if (antes.ok) assert.equal(antes.linhas, 4);

    const linhas = (await fsp.readFile(path.join(dir, LEDGER_FILENAME), 'utf8')).split('\n');
    // Adultera a 2ª linha (índice 1, no MEIO da cadeia): mexe na fase do evento,
    // SEM tocar hash/prev_hash — a quebra só é detectável pelo hash.
    const adulterada = linhas[1].replace('"fase":"F0"', '"fase":"F9"');
    assert.notEqual(adulterada, linhas[1]);

    const quebrada = verificarCadeia([linhas[0], adulterada, ...linhas.slice(2)].join('\n'));
    assert.equal(quebrada.ok, false);
    if (!quebrada.ok) {
      assert.equal(quebrada.primeiraQuebrada, 1);
      assert.equal(quebrada.linhas, 4);
    }
  });

  it('anexar RECUSA sobre cadeia quebrada (fail-closed) e não altera o arquivo', async () => {
    const dir = await novoDir('cadeia-recusa');
    const ledger = new Ledger(dir);
    await ledger.anexar({ tipo: 'run_criado', runId: 'r-1', slug: 'demo' });
    await ledger.anexar({ tipo: 'fase_iniciada', fase: 'F0' });
    const caminho = path.join(dir, LEDGER_FILENAME);
    const linhas = (await fsp.readFile(caminho, 'utf8')).split('\n');
    // Adultera a fase da 2ª linha.
    const adulterada = linhas[1].replace('"fase":"F0"', '"fase":"F9"');
    await fsp.writeFile(caminho, [linhas[0], adulterada].join('\n'), 'utf8');

    await assert.rejects(
      () => ledger.anexar({ tipo: 'fase_concluida', fase: 'F0' }),
      ehLedgerErrorCom('CADEIA_QUEBRADA'),
    );

    const depois = await fsp.readFile(caminho, 'utf8');
    assert.equal(depois.includes('"F9"'), true); // adulteração NÃO foi absorvida nem "consertada"
    assert.equal(depois.split('\n').length, 2);
  });

  it('montarCadeia puro: íntegra ok; remover a primeira linha quebra na nova raiz', () => {
    const eventos: EventoNovo[] = [
      { tipo: 'run_criado', runId: 'r', slug: 'demo' },
      { tipo: 'fase_iniciada', fase: 'F0' },
      { tipo: 'fase_concluida', fase: 'F0' },
    ];
    const integra = montarCadeia(eventos, '2026-08-30T00:00:00.000Z');
    const v = verificarCadeia(integra);
    assert.equal(v.ok, true);
    if (v.ok) assert.equal(v.linhas, 3);

    // Remover a primeira linha: a nova primeira tem prev_hash ≠ null → raiz quebrada.
    const semPrimeira = integra.split('\n').slice(1).join('\n');
    const q = verificarCadeia(semPrimeira);
    assert.equal(q.ok, false);
    if (!q.ok) assert.equal(q.primeiraQuebrada, 0);
  });
});

// ---------------------------------------------------------------------------
// 2) Retomada — teste exigido 2
// ---------------------------------------------------------------------------

describe('retomada a partir de uma fase', () => {
  it('pula o que já está done e recomeça da primeira fase não concluída', async () => {
    const dir = await novoDir('retomada');
    const ledger = new Ledger(dir);

    let r = criarRun(runBase());
    await salvarRun(dir, r);
    await ledger.anexar({ tipo: 'run_criado', runId: r.runId, slug: r.slug });

    // F0 concluída.
    r = iniciarFase(r, 'F0');
    await salvarRun(dir, r);
    await ledger.anexar({ tipo: 'fase_iniciada', fase: 'F0' });
    r = concluirFase(r, 'F0');
    await salvarRun(dir, r);
    await ledger.anexar({ tipo: 'fase_concluida', fase: 'F0' });

    // F1 concluída.
    r = iniciarFase(r, 'F1');
    await salvarRun(dir, r);
    await ledger.anexar({ tipo: 'fase_iniciada', fase: 'F1' });
    r = concluirFase(r, 'F1');
    await salvarRun(dir, r);
    await ledger.anexar({ tipo: 'fase_concluida', fase: 'F1' });

    // F2 iniciada e INTERROMPIDA no meio (em_andamento no disco).
    r = iniciarFase(r, 'F2');
    await salvarRun(dir, r);
    await ledger.anexar({ tipo: 'fase_iniciada', fase: 'F2' });

    // ---- "novo processo": tudo volta do disco ----
    const retomado = await lerRun(dir);
    assert.deepEqual(fasesConcluidas(retomado), ['F0', 'F1']);
    assert.equal(primeiraFasePendente(retomado), 'F2');
    assert.equal(retomado.faseAtual, 'F2');
    assert.equal(retomado.fases.F2, 'em_andamento');
    assert.equal(runConcluido(retomado), false);

    // Retomada: fase atual já em_andamento → executa SEM re-chamar iniciarFase.
    let r2 = concluirFase(retomado, 'F2');
    await salvarRun(dir, r2);
    await ledger.anexar({ tipo: 'fase_concluida', fase: 'F2' });

    // E segue para a próxima da ordem fixa, que estava pendente.
    r2 = iniciarFase(r2, 'F3');
    await salvarRun(dir, r2);
    await ledger.anexar({ tipo: 'fase_iniciada', fase: 'F3' });

    const linhas = await ledger.ler();
    assert.equal(linhas.length, 8); // run_criado + F0..F2 (in/out) + F2 out + F3 in
    assert.deepEqual(
      linhas.map((l) => l.seq),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal((await ledger.verificarCadeiaEmDisco()).ok, true);
  });

  it('interrupção ENTRE fases (fase atual pendente) chama iniciarFase no retorno', async () => {
    const dir = await novoDir('retomada-b');
    let r = criarRun(runBase());
    r = iniciarFase(r, 'F0');
    r = concluirFase(r, 'F0'); // faseAtual → F1 (pendente); interrompido ANTES de iniciar F1
    await salvarRun(dir, r);

    const retomado = await lerRun(dir);
    assert.equal(primeiraFasePendente(retomado), 'F1');
    assert.equal(retomado.fases.F1, 'pendente');

    // Protocolo de retomada (cabeçalho do runState): inicia só se pendente.
    let r2 = retomado;
    if (r2.fases.F1 === 'pendente') r2 = iniciarFase(r2, 'F1');
    assert.equal(r2.fases.F1, 'em_andamento');
    assert.equal(r2.faseAtual, 'F1');
  });
});

// ---------------------------------------------------------------------------
// 3) run.json corrompido → erro estruturado (teste exigido 3 — A-P03-3)
// ---------------------------------------------------------------------------

describe('run.json — fail-closed (A-P03-3, INV-03)', () => {
  it('JSON inválido → RunStateError estruturado, NUNCA estado silenciosamente vazio', async () => {
    const dir = await novoDir('corrompido-parse');
    await fsp.writeFile(path.join(dir, RUN_FILENAME), '{ "runId": ', 'utf8');
    await assert.rejects(
      () => lerRun(dir),
      (e) =>
        e instanceof RunStateError &&
        e.code === 'RUN_JSON_CORROMPIDO' &&
        typeof e.message === 'string' &&
        e.message.length > 0,
    );
  });

  it('campo obrigatório ausente → erro nomeando o campo', async () => {
    const dir = await novoDir('corrompido-campo');
    const cru: Record<string, unknown> = { ...criarRun(runBase()) };
    delete cru.budgetHash;
    await fsp.writeFile(path.join(dir, RUN_FILENAME), JSON.stringify(cru), 'utf8');
    await assert.rejects(
      () => lerRun(dir),
      (e) => e instanceof RunStateError && e.code === 'RUN_JSON_INVALIDO' && e.campo === 'budgetHash',
    );
  });

  it('hash em formato inválido → erro nomeando o campo', async () => {
    const dir = await novoDir('corrompido-hash');
    const cru: Record<string, unknown> = { ...criarRun(runBase()), budgetHash: 'nao-e-um-hash' };
    await fsp.writeFile(path.join(dir, RUN_FILENAME), JSON.stringify(cru), 'utf8');
    await assert.rejects(
      () => lerRun(dir),
      (e) => e instanceof RunStateError && e.code === 'RUN_JSON_INVALIDO' && e.campo === 'budgetHash',
    );
  });

  it('fases com buraco (done fora do prefixo) → erro', async () => {
    const dir = await novoDir('corrompido-fases');
    const run = criarRun(runBase());
    const cru: Record<string, unknown> = {
      ...run,
      fases: { ...run.fases, F2: 'done' }, // F0/F1 pendentes e F2 done → invariante violada
    };
    await fsp.writeFile(path.join(dir, RUN_FILENAME), JSON.stringify(cru), 'utf8');
    await assert.rejects(
      () => lerRun(dir),
      (e) => e instanceof RunStateError && e.code === 'RUN_JSON_INVALIDO' && e.campo === 'fases',
    );
  });

  it('chave de fase desconhecida → erro', async () => {
    const dir = await novoDir('corrompido-chave');
    const run = criarRun(runBase());
    const cru: Record<string, unknown> = { ...run, fases: { ...run.fases, X9: 'done' } };
    await fsp.writeFile(path.join(dir, RUN_FILENAME), JSON.stringify(cru), 'utf8');
    await assert.rejects(
      () => lerRun(dir),
      (e) => e instanceof RunStateError && e.code === 'RUN_JSON_INVALIDO' && e.campo === 'fases',
    );
  });

  it('modelo vazio / etapa desconhecida → erro', async () => {
    const dir = await novoDir('corrompido-modelos');
    const run = criarRun(runBase());
    const cru: Record<string, unknown> = { ...run, modelosPorEtapa: { F0: '   ' } };
    await fsp.writeFile(path.join(dir, RUN_FILENAME), JSON.stringify(cru), 'utf8');
    await assert.rejects(
      () => lerRun(dir),
      (e) => e instanceof RunStateError && e.code === 'RUN_JSON_INVALIDO' && e.campo === 'modelosPorEtapa',
    );
  });

  it('faseAtual fora do cursor persistido → erro', async () => {
    const dir = await novoDir('corrompido-cursor');
    const r = runComF0Iniciada();
    const cru: Record<string, unknown> = { ...r, faseAtual: 'F3' };
    await fsp.writeFile(path.join(dir, RUN_FILENAME), JSON.stringify(cru), 'utf8');
    await assert.rejects(
      () => lerRun(dir),
      (e) => e instanceof RunStateError && e.code === 'RUN_JSON_INVALIDO' && e.campo === 'faseAtual',
    );
  });

  it('arquivo ausente → RUN_JSON_AUSENTE explícito (e temRun é false)', async () => {
    const dir = await novoDir('ausente');
    assert.equal(await temRun(dir), false);
    await assert.rejects(() => lerRun(dir), ehRunStateError('RUN_JSON_AUSENTE'));
  });

  it('estado válido carrega COMPLETO — nunca "vazio por omissão"', async () => {
    const dir = await novoDir('valido');
    const r = runComF0Iniciada();
    await salvarRun(dir, r);
    const carregado = await lerRun(dir);
    assert.equal(await temRun(dir), true);
    assert.equal(carregado.runId, r.runId);
    assert.equal(carregado.slug, r.slug);
    assert.equal(carregado.faseAtual, 'F0');
    assert.equal(carregado.fases.F0, 'em_andamento');
    assert.equal(carregado.budgetHash, HASH_UM);
    assert.equal(carregado.graphHash, HASH_DOIS);
    assert.deepEqual(carregado.modelosPorEtapa, { F0: 'modelo-x' });
    assert.equal(carregado.promptVersao, 'p1');
    assert.equal(carregado.catalogoVersao, 'c1');
    assert.equal(carregado.schemaVersion, 1);
  });
});

// ---------------------------------------------------------------------------
// 4) Escrita atômica (teste exigido 4)
// ---------------------------------------------------------------------------

describe('escrita atômica (D-WRITE)', () => {
  it('falha no MEIO da gravação nunca deixa o arquivo pela metade', async () => {
    // (a) ledger.jsonl
    const dir = await novoDir('atomico');
    const ledger = new Ledger(dir);
    await ledger.anexar({ tipo: 'run_criado', runId: 'r-1', slug: 'demo' });
    await ledger.anexar({ tipo: 'fase_iniciada', fase: 'F0' });
    const caminho = path.join(dir, LEDGER_FILENAME);
    const antes = await fsp.readFile(caminho, 'utf8');
    assert.equal(verificarCadeia(antes).ok, true);

    // Store fake: grava METADE do conteúdo e lança no meio do caminho.
    const escreverQueFalha: EscreverArquivoFn = async (caminhoTmp, conteudo) => {
      const metade = conteudo.slice(0, Math.max(1, Math.floor(conteudo.length / 2)));
      await fsp.writeFile(caminhoTmp, metade, 'utf8');
      throw new Error('falha simulada no meio da escrita');
    };
    const ledgerInstavel = new Ledger(dir, { escreverArquivo: escreverQueFalha });
    await assert.rejects(
      () => ledgerInstavel.anexar({ tipo: 'fase_concluida', fase: 'F0' }),
      ehLedgerErrorCom('IO_ERRO'),
    );

    const depois = await fsp.readFile(caminho, 'utf8');
    assert.equal(depois, antes); // arquivo real INTACTO — o parcial morreu no tmp
    assert.equal(verificarCadeia(depois).ok, true);
    const entradas = await fsp.readdir(dir);
    assert.deepEqual(entradas.filter((e) => e.includes('.tmp.')), []); // tmp limpo

    // Estado segue utilizável: o próximo anexo (escrita boa) funciona.
    const ledgerBom = new Ledger(dir);
    await ledgerBom.anexar({ tipo: 'fase_concluida', fase: 'F0' });
    const v = await ledgerBom.verificarCadeiaEmDisco();
    assert.equal(v.ok, true);
    if (v.ok) assert.equal(v.linhas, 3);

    // (b) run.json usa a MESMA primitiva.
    const dirRun = await novoDir('atomico-run');
    let run = criarRun(runBase());
    run = concluirFase(iniciarFase(run, 'F0'), 'F0');
    await salvarRun(dirRun, run);
    const caminhoRun = path.join(dirRun, RUN_FILENAME);
    const antesRun = await fsp.readFile(caminhoRun, 'utf8');
    const run2 = iniciarFase(run, 'F1'); // estado válido que NUNCA chegará ao disco
    await assert.rejects(
      () => salvarRun(dirRun, run2, { escreverArquivo: escreverQueFalha }),
      ehRunStateError('IO_ERRO'),
    );
    const depoisRun = await fsp.readFile(caminhoRun, 'utf8');
    assert.equal(depoisRun, antesRun);
  });
});

// ---------------------------------------------------------------------------
// 5) (bônus) Transições de fase com ordem fixa (teste exigido 5)
// ---------------------------------------------------------------------------

describe('máquina de fases — ordem fixa F0..F12', () => {
  it('percorre a ordem fixa até concluir o run', () => {
    let r = criarRun(runBase());
    for (const fase of FASES_ORDEM) {
      assert.equal(primeiraFasePendente(r), fase);
      assert.equal(runConcluido(r), false);
      r = iniciarFase(r, fase);
      assert.equal(r.fases[fase], 'em_andamento');
      r = concluirFase(r, fase);
      assert.equal(r.fases[fase], 'done');
      if (fase !== 'F12') {
        assert.equal(r.faseAtual, FASES_ORDEM[FASES_ORDEM.indexOf(fase) + 1]);
      }
    }
    assert.equal(runConcluido(r), true);
    assert.equal(primeiraFasePendente(r), null);
    assert.deepEqual(fasesConcluidas(r), [...FASES_ORDEM]);
    assert.equal(r.faseAtual, 'F12');
  });

  it('fase inválida e transição fora da ordem são erro estruturado', () => {
    let r = criarRun(runBase());

    // Fase inexistente.
    assert.throws(() => iniciarFase(r, 'X13'), ehRunStateError('FASE_INVALIDA'));

    // Pular a ordem: só a próxima pendente pode iniciar.
    assert.throws(() => iniciarFase(r, 'F1'), ehRunStateError('TRANSICAO_INVALIDA'));
    assert.throws(() => iniciarFase(r, 'F9'), ehRunStateError('TRANSICAO_INVALIDA'));

    // Concluir fase que nunca foi iniciada.
    assert.throws(() => concluirFase(r, 'F0'), ehRunStateError('TRANSICAO_INVALIDA'));

    // Concluir fase que não é a atual.
    r = iniciarFase(r, 'F0');
    assert.throws(() => concluirFase(r, 'F5'), ehRunStateError('TRANSICAO_INVALIDA'));

    // Concluir duas vezes e re-iniciar fase já feita.
    r = concluirFase(r, 'F0');
    assert.throws(() => concluirFase(r, 'F0'), ehRunStateError('TRANSICAO_INVALIDA'));
    assert.throws(() => iniciarFase(r, 'F0'), ehRunStateError('TRANSICAO_INVALIDA'));

    // Re-iniciar fase que já está em_andamento (interrompida) — proibido.
    r = iniciarFase(r, 'F1');
    assert.throws(() => iniciarFase(r, 'F1'), ehRunStateError('TRANSICAO_INVALIDA'));
  });

  it('criarRun valida entradas (fail-closed): slug inseguro, hash e modelos inválidos', () => {
    assert.throws(() => criarRun(runBase({ slug: '../../etc' })), ehRunStateError('SLUG_INVALIDO'));
    assert.throws(() => criarRun(runBase({ slug: '' })), ehRunStateError('SLUG_INVALIDO'));
    assert.throws(() => criarRun(runBase({ budgetHash: 'xyz' })), ehRunStateError('RUN_JSON_INVALIDO'));
    assert.throws(() => criarRun(runBase({ modelosPorEtapa: { F0: '' } })), ehRunStateError('RUN_JSON_INVALIDO'));
    const modelosComEtapaDesconhecida = { X1: 'm' } as unknown as CriarRunInput['modelosPorEtapa'];
    assert.throws(
      () => criarRun(runBase({ modelosPorEtapa: modelosComEtapaDesconhecida })),
      ehRunStateError('RUN_JSON_INVALIDO'),
    );
  });
});

// ---------------------------------------------------------------------------
// Cobertura complementar: layout declarado e telemetria
// ---------------------------------------------------------------------------

describe('layout e telemetria', () => {
  it('constantes de layout declaram raiz de trabalho injetável e produto final', () => {
    assert.equal(CONTENT_SRC_DIR, 'app/content-src');
    assert.equal(TRACKS_OUTPUT_DIR, 'app/resources/tracks');
    assert.equal(raizTrabalhoSlug('nodejs-do-zero'), path.join('app/content-src', 'nodejs-do-zero'));
    assert.equal(dirProdutoFinal('nodejs-do-zero'), path.join('app/resources/tracks', 'nodejs-do-zero'));
  });

  it('telemetry.jsonl registra tokens/latência/contagem por tarefa e etapa', async () => {
    const dir = await novoDir('telemetria');
    const t = new TelemetriaFile(dir);
    const linha: Telemetria = {
      quando: '2026-08-30T00:00:00.000Z',
      tarefa: 'autoria',
      etapa: 'F7',
      tokensEntrada: 100,
      tokensSaida: 50,
      latenciaMs: 1234.5,
      contagem: 3,
    };
    await t.anexar(linha);
    await t.anexar({ ...linha, etapa: 'F8', contagem: 1 });

    const lidas = await t.ler();
    assert.deepEqual(lidas, [linha, { ...linha, etapa: 'F8', contagem: 1 }]);

    // Shape errado / número negativo é RECUSADO na escrita (fail-closed).
    await assert.rejects(() => t.anexar({ ...linha, tokensEntrada: -1 }), ehLedgerErrorCom('EVENTO_INVALIDO'));
    await assert.rejects(() => t.anexar({ ...linha, tarefa: '' }), ehLedgerErrorCom('EVENTO_INVALIDO'));
    const ainda = await t.ler();
    assert.equal(ainda.length, 2); // a recusa não corrompeu nada
    assert.equal((await fsp.readdir(dir)).filter((e) => e.includes('.tmp.')).length, 0);
  });

  it('telemetria usa o nome de arquivo declarado', async () => {
    const dir = await novoDir('telemetria-nome');
    await new TelemetriaFile(dir).anexar({
      quando: '2026-08-30T00:00:00.000Z',
      tarefa: 'x',
      etapa: 'F0',
      tokensEntrada: 1,
      tokensSaida: 1,
      latenciaMs: 1,
      contagem: 1,
    });
    const conteudo = await fsp.readFile(path.join(dir, TELEMETRY_FILENAME), 'utf8');
    assert.equal(conteudo.includes('"tarefa":"x"'), true);
  });
});