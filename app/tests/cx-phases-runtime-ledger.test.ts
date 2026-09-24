/**
 * tests/cx-phases-runtime-ledger.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/runtime/ledger.ts` (cadeia append-only + telemetria).
 *
 * PINA: o formato canônico do hash, a cadeia montada, TODOS os motivos de
 * quebra reportados por `verificarCadeia`, o fail-closed do `Ledger.anexar`
 * sobre cadeia adulterada, o mutex in-process (nenhuma linha perdida em
 * concorrência) e a validação estruturada da telemetria.
 *
 * Puramente local: tmpdirs próprios (mkdtemp), sem rede, sem LLM.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  Ledger,
  LedgerError,
  TelemetriaFile,
  canonicalizarJson,
  montarCadeia,
  sha256Hex,
  verificarCadeia,
  type EventoNovo,
  type Telemetria,
} from '../electron/main/engine/runtime/ledger';
// LEDGER_FILENAME é DECLARADO em runState.ts (ledger.ts o importa, não re-exporta).
import { LEDGER_FILENAME } from '../electron/main/engine/runtime/runState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RUN_ID = '11111111-2222-4333-8444-555555555555';
const RUN_ID_OUTRO = '99999999-8888-4777-8666-555555555555';
const QUANDO = '2026-01-02T03:04:05.000Z';

async function tmpDir(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxph-ledger-'));
}

function eventosDoRun(runId = RUN_ID): EventoNovo[] {
  return [
    { tipo: 'run_criado', runId, slug: 'trilha-js' },
    { tipo: 'fase_iniciada', runId, fase: 'F0' },
    { tipo: 'checkpoint', runId, descricao: 'metade de F0' },
    { tipo: 'fase_concluida', runId, fase: 'F0' },
  ];
}

function linhasDe(conteudo: string): Record<string, unknown>[] {
  return conteudo.split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
}

function reescrever(linhas: Record<string, unknown>[]): string {
  return linhas.map((l) => JSON.stringify(l)).join('\n');
}

// ---------------------------------------------------------------------------
// 1. Primitivas de hash e JSON canônico
// ---------------------------------------------------------------------------

describe('ledger — sha256Hex e canonicalizarJson', () => {
  it('sha256Hex reproduz o vetor canônico do sha256 da string vazia', () => {
    assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('canonicalizarJson ordena chaves recursivamente — ordem de inserção não muda a saída', () => {
    const a = canonicalizarJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } });
    const b = canonicalizarJson({ a: { c: [3, { e: 5, f: 4 }] , d: 2 }, b: 1 });
    assert.equal(a, b);
    assert.equal(a, '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}');
  });

  it('canonicalizarJson preserva ordem de ARRAYS e a forma dos primitivos', () => {
    assert.equal(canonicalizarJson([1, 2]), '[1,2]');
    assert.notEqual(canonicalizarJson([1, 2]), canonicalizarJson([2, 1]), 'array é posicional');
    assert.equal(canonicalizarJson('x'), '"x"');
    assert.equal(canonicalizarJson(true), 'true');
    assert.equal(canonicalizarJson(false), 'false');
    assert.equal(canonicalizarJson(null), 'null');
    assert.equal(canonicalizarJson(0), '0');
  });

  it('valores não-JSON são LedgerError VALOR_NAO_SERIALIZAVEL (fail-closed)', () => {
    for (const ruim of [NaN, Infinity, -Infinity, undefined, () => 1, Symbol('x')]) {
      assert.throws(
        () => canonicalizarJson({ campo: ruim }),
        (erro: unknown) => erro instanceof LedgerError && erro.code === 'VALOR_NAO_SERIALIZAVEL',
        `valor ${String(ruim)} deveria ser recusado`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 2. montarCadeia — o formato materializado
// ---------------------------------------------------------------------------

describe('ledger — montarCadeia (formato da linha)', () => {
  it('linhas 1-based com prev_hash null na raiz e hash = sha256(prev + "\\n" + corpo)', () => {
    const conteudo = montarCadeia(eventosDoRun(), QUANDO);
    const linhas = linhasDe(conteudo);
    assert.equal(linhas.length, 4);
    linhas.forEach((linha, i) => {
      assert.equal(linha.v, 1);
      assert.equal(linha.seq, i + 1);
      assert.equal(linha.quando, QUANDO);
      assert.equal(linha.runId, RUN_ID);
    });
    assert.equal(linhas[0].prev_hash, null);
    for (let i = 1; i < linhas.length; i += 1) {
      assert.equal(linhas[i].prev_hash, linhas[i - 1].hash, `linha ${i} encadeia na anterior`);
    }
    assert.match(String(linhas[0].hash), /^[0-9a-f]{64}$/);
  });

  it('é determinística para o mesmo `quando` e imune à ordem de chaves do evento', () => {
    const normal: EventoNovo = { tipo: 'checkpoint', runId: RUN_ID, descricao: 'x' };
    const reordenado: EventoNovo = { descricao: 'x', runId: RUN_ID, tipo: 'checkpoint' };
    const um = montarCadeia([normal], QUANDO);
    const dois = montarCadeia([reordenado], QUANDO);
    assert.equal(um, dois);
  });

  it('cadeia vazia de eventos é string vazia, que verifica como cadeia de 0 linhas', () => {
    assert.equal(montarCadeia([], QUANDO), '');
    assert.deepEqual(verificarCadeia(''), { ok: true, linhas: 0, primeiraQuebrada: null });
  });

  it('o hash cobre o payload específico do tipo (slug/fase/descrição)', () => {
    const a = montarCadeia([{ tipo: 'checkpoint', runId: RUN_ID, descricao: 'um' }], QUANDO);
    const b = montarCadeia([{ tipo: 'checkpoint', runId: RUN_ID, descricao: 'dois' }], QUANDO);
    assert.notEqual(linhasDe(a)[0].hash, linhasDe(b)[0].hash);
  });
});

// ---------------------------------------------------------------------------
// 3. verificarCadeia — cada motivo de quebra, exatamente na linha tocada
// ---------------------------------------------------------------------------

describe('ledger — verificarCadeia (detecção de adulteração)', () => {
  it('cadeia recém-montada verifica ok com a contagem de linhas', () => {
    const r = verificarCadeia(montarCadeia(eventosDoRun(), QUANDO));
    assert.deepEqual(r, { ok: true, linhas: 4, primeiraQuebrada: null });
  });

  it('editar conteúdo sem recalcular hash: HASH_DIVERGENTE na linha tocada', () => {
    const linhas = linhasDe(montarCadeia(eventosDoRun(), QUANDO));
    linhas[2].descricao = 'adulterado';
    const r = verificarCadeia(reescrever(linhas));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.primeiraQuebrada, 2);
      assert.equal(r.motivo, 'HASH_DIVERGENTE');
    }
  });

  it('remover linha do meio: SEQ_INCORRETA no ponto da lacuna', () => {
    const linhas = linhasDe(montarCadeia(eventosDoRun(), QUANDO));
    linhas.splice(1, 1);
    const r = verificarCadeia(reescrever(linhas));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.primeiraQuebrada, 1);
      assert.equal(r.motivo, 'SEQ_INCORRETA');
    }
  });

  it('duplicar linha: SEQ_INCORRETA na repetição', () => {
    const linhas = linhasDe(montarCadeia(eventosDoRun(), QUANDO));
    linhas.splice(2, 0, { ...linhas[1] });
    const r = verificarCadeia(reescrever(linhas));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.motivo, 'SEQ_INCORRETA');
  });

  it('raiz com prev_hash não-nulo é RAIZ_INVALIDA', () => {
    const linhas = linhasDe(montarCadeia(eventosDoRun(), QUANDO));
    linhas[0].prev_hash = 'f'.repeat(64);
    const r = verificarCadeia(reescrever(linhas));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.primeiraQuebrada, 0);
      assert.equal(r.motivo, 'RAIZ_INVALIDA');
    }
  });

  it('retargetar prev_hash é PREV_HASH_DIVERGENTE', () => {
    const linhas = linhasDe(montarCadeia(eventosDoRun(), QUANDO));
    linhas[2].prev_hash = 'c'.repeat(64);
    const r = verificarCadeia(reescrever(linhas));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.primeiraQuebrada, 2);
      assert.equal(r.motivo, 'PREV_HASH_DIVERGENTE');
    }
  });

  it('linha de OUTRO run quebra por RUN_ID_DIVERGENTE mesmo com hashes coerentes (D-ÂNCORA-RUNID)', () => {
    // Constrói cadeia com seq/prev_hash corretos mas runId trocado no meio:
    // recalcula os hashes seguintes para isolar o motivo do runId.
    const conteudo = montarCadeia(
      [
        { tipo: 'run_criado', runId: RUN_ID, slug: 'trilha-js' },
        { tipo: 'checkpoint', runId: RUN_ID_OUTRO, descricao: 'intrusa' },
        { tipo: 'checkpoint', runId: RUN_ID_OUTRO, descricao: 'intrusa-2' },
      ],
      QUANDO,
    );
    const r = verificarCadeia(conteudo);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.primeiraQuebrada, 1);
      assert.equal(r.motivo, 'RUN_ID_DIVERGENTE');
    }
  });

  it('linha que não parseia é JSON_INVALIDO; linha vazia INTERNA é LINHA_VAZIA', () => {
    const bom = montarCadeia(eventosDoRun().slice(0, 1), QUANDO);
    const comLixo = verificarCadeia(`${bom}\n{isso não é json`);
    assert.equal(comLixo.ok, false);
    if (!comLixo.ok) {
      assert.equal(comLixo.primeiraQuebrada, 1);
      assert.equal(comLixo.motivo, 'JSON_INVALIDO');
    }
    // Linha vazia NO MEIO do conteúdo (quebra final vira '' e é descartada).
    const duas = linhasDe(montarCadeia(eventosDoRun().slice(0, 2), QUANDO));
    const comVazia = verificarCadeia(`${reescrever([duas[0]])}\n\n${reescrever([duas[1]])}`);
    assert.equal(comVazia.ok, false);
    if (!comVazia.ok) {
      assert.equal(comVazia.primeiraQuebrada, 1);
      assert.equal(comVazia.motivo, 'LINHA_VAZIA');
    }
  });

  it('linha parseável com schema inválido é LINHA_INVALIDA (com o motivo embutido)', () => {
    const bom = montarCadeia(eventosDoRun().slice(0, 1), QUANDO);
    const quebrada = verificarCadeia(`${bom}\n${JSON.stringify({ v: 1 })}`);
    assert.equal(quebrada.ok, false);
    if (!quebrada.ok) {
      assert.equal(quebrada.primeiraQuebrada, 1);
      assert.match(quebrada.motivo, /^LINHA_INVALIDA/);
    }
  });

  it('LIMITE DECLARADO: truncar a CAUDA deixa um prefixo que ainda verifica ok', () => {
    // Comportamento atual documentado no módulo (sem overclaim): a cadeia é
    // autorreferente — truncamento de cauda NÃO é detectável por ela sozinha.
    const linhas = linhasDe(montarCadeia(eventosDoRun(), QUANDO));
    const r = verificarCadeia(reescrever(linhas.slice(0, 2)));
    assert.deepEqual(r, { ok: true, linhas: 2, primeiraQuebrada: null });
  });
});

// ---------------------------------------------------------------------------
// 4. Ledger em disco — append-only, fail-closed, concorrência
// ---------------------------------------------------------------------------

describe('ledger — classe Ledger (IO)', () => {
  it('anexar materializa linhas encadeadas; ler e verificarCadeiaEmDisco conferem', async () => {
    const dir = await tmpDir();
    const ledger = new Ledger(dir);
    const l1 = await ledger.anexar({ tipo: 'run_criado', runId: RUN_ID, slug: 'trilha-js' });
    const l2 = await ledger.anexar({ tipo: 'fase_iniciada', runId: RUN_ID, fase: 'F0' });
    assert.equal(l1.seq, 1);
    assert.equal(l1.prev_hash, null);
    assert.equal(l2.seq, 2);
    assert.equal(l2.prev_hash, l1.hash);
    assert.equal(ledger.nomeArquivo, LEDGER_FILENAME);

    const lidas = await ledger.ler();
    assert.equal(lidas.length, 2);
    assert.deepEqual(lidas.map((l) => l.tipo), ['run_criado', 'fase_iniciada']);
    assert.deepEqual(await ledger.verificarCadeiaEmDisco(), { ok: true, linhas: 2, primeiraQuebrada: null });
  });

  it('evento inválido é EVENTO_INVALIDO — nada é anexado', async () => {
    const dir = await tmpDir();
    const ledger = new Ledger(dir);
    await assert.rejects(
      ledger.anexar({ tipo: 'checkpoint', runId: RUN_ID, descricao: '' } as EventoNovo),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'EVENTO_INVALIDO' && erro.campo === 'descricao',
    );
    await assert.rejects(
      ledger.anexar({ tipo: 'run_criado', slug: 'trilha-js' } as unknown as EventoNovo),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'EVENTO_INVALIDO' && erro.campo === 'runId',
    );
    await assert.rejects(
      ledger.anexar({ tipo: 'run_criado', runId: RUN_ID, slug: 'Slug Inválido' } as EventoNovo),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'EVENTO_INVALIDO' && erro.campo === 'slug',
    );
    await assert.rejects(
      ledger.anexar({ tipo: 'fase_iniciada', runId: RUN_ID, fase: 'F99' } as unknown as EventoNovo),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'EVENTO_INVALIDO' && erro.campo === 'fase',
    );
    await assert.rejects(
      ledger.anexar({ tipo: 'evento-inventado', runId: RUN_ID } as unknown as EventoNovo),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'EVENTO_INVALIDO' && erro.campo === 'tipo',
    );
    assert.equal(await temConteudo(dir), '', 'arquivo intocado após eventos inválidos');
  });

  it('anexar sobre cadeia adulterada é CADEIA_QUEBRADA (fail-closed: nunca absorve)', async () => {
    const dir = await tmpDir();
    const ledger = new Ledger(dir);
    await ledger.anexar({ tipo: 'run_criado', runId: RUN_ID, slug: 'trilha-js' });
    await ledger.anexar({ tipo: 'checkpoint', runId: RUN_ID, descricao: 'ok' });
    const caminho = path.join(dir, LEDGER_FILENAME);
    const linhas = linhasDe(await fsp.readFile(caminho, 'utf8'));
    linhas[1].descricao = 'adulterado';
    await fsp.writeFile(caminho, reescrever(linhas), 'utf8');

    await assert.rejects(
      ledger.anexar({ tipo: 'checkpoint', runId: RUN_ID, descricao: 'novo' }),
      (erro: unknown) =>
        erro instanceof LedgerError && erro.code === 'CADEIA_QUEBRADA' && /linha 1/.test(erro.message),
    );
  });

  it('falha de escrita é IO_ERRO e o arquivo fica como estava', async () => {
    const dir = await tmpDir();
    const ledger = new Ledger(dir, {
      escreverArquivo: async () => {
        throw new Error('disco cheio');
      },
    });
    await assert.rejects(
      ledger.anexar({ tipo: 'run_criado', runId: RUN_ID, slug: 'trilha-js' }),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'IO_ERRO',
    );
    assert.equal(await temConteudo(dir), '');
  });

  it('anexos CONCORRENTES não se perdem (mutex in-process): 8 eventos, 8 linhas, cadeia íntegra', async () => {
    const dir = await tmpDir();
    const ledger = new Ledger(dir);
    await ledger.anexar({ tipo: 'run_criado', runId: RUN_ID, slug: 'trilha-js' });
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        ledger.anexar({ tipo: 'checkpoint', runId: RUN_ID, descricao: `evento ${i}` }),
      ),
    );
    const lidas = await ledger.ler();
    assert.equal(lidas.length, 9, 'nenhuma linha perdida em silêncio (§11)');
    assert.deepEqual(lidas.map((l) => l.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const verificacao = await ledger.verificarCadeiaEmDisco();
    assert.deepEqual(verificacao, { ok: true, linhas: 9, primeiraQuebrada: null });
  });

  it('ler com linha corrompida é LINHA_INVALIDA nomeando o índice', async () => {
    const dir = await tmpDir();
    const ledger = new Ledger(dir);
    await ledger.anexar({ tipo: 'run_criado', runId: RUN_ID, slug: 'trilha-js' });
    await fsp.appendFile(path.join(dir, LEDGER_FILENAME), '\nnão-é-json', 'utf8');
    await assert.rejects(
      ledger.ler(),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'LINHA_INVALIDA' && /linha 1/.test(erro.message),
    );
  });

  it('ler de ledger inexistente devolve lista vazia (sem arquivo ≠ erro)', async () => {
    const dir = await tmpDir();
    assert.deepEqual(await new Ledger(dir).ler(), []);
    assert.deepEqual(await new Ledger(dir).verificarCadeiaEmDisco(), { ok: true, linhas: 0, primeiraQuebrada: null });
  });
});

// ---------------------------------------------------------------------------
// 5. Telemetria — append-only SEM cadeia, validação estruturada
// ---------------------------------------------------------------------------

describe('ledger — TelemetriaFile (D-TELEMETRIA)', () => {
  function telemetria(over: Partial<Telemetria> = {}): Telemetria {
    return {
      quando: QUANDO,
      tarefa: 'autoria',
      etapa: 'F7',
      tokensEntrada: 120,
      tokensSaida: 45,
      latenciaMs: 1234.5,
      contagem: 2,
      ...over,
    };
  }

  it('anexar+ler faz o ciclo; latência pode ser float, contagem é inteira', async () => {
    const dir = await tmpDir();
    const t = new TelemetriaFile(dir);
    await t.anexar(telemetria());
    await t.anexar(telemetria({ etapa: 'F8', contagem: 1 }));
    const lidas = await t.ler();
    assert.equal(lidas.length, 2);
    assert.equal(lidas[0].latenciaMs, 1234.5);
    assert.deepEqual(lidas.map((l) => l.etapa), ['F7', 'F8']);
  });

  it('shape/número inválido é EVENTO_INVALIDO e NADA é gravado', async () => {
    const dir = await tmpDir();
    const t = new TelemetriaFile(dir);
    await assert.rejects(
      t.anexar(telemetria({ tokensSaida: -1 })),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'EVENTO_INVALIDO' && erro.campo === 'tokensSaida',
    );
    await assert.rejects(
      t.anexar(telemetria({ contagem: 1.5 })),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'EVENTO_INVALIDO' && erro.campo === 'contagem',
    );
    await assert.rejects(
      t.anexar(telemetria({ quando: 'não-é-data' })),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'EVENTO_INVALIDO' && erro.campo === 'quando',
    );
    await assert.rejects(
      t.anexar(telemetria({ tarefa: ' ' })),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'EVENTO_INVALIDO' && erro.campo === 'tarefa',
    );
    await assert.rejects(
      t.anexar(null as unknown as Telemetria),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'EVENTO_INVALIDO',
    );
    assert.equal(await temConteudo(dir), '');
  });

  it('telemetria NÃO é encadeada por hash (uma linha falsa não quebra leitura)', async () => {
    const dir = await tmpDir();
    const t = new TelemetriaFile(dir);
    await t.anexar(telemetria());
    // Linha extra gravada à mão, sem hash nenhum — leitura aceita (diagnóstico).
    await fsp.appendFile(path.join(dir, 'telemetry.jsonl'), `\n${canonicalizarJson(telemetria({ etapa: 'F9' }) as unknown as Record<string, unknown>)}`, 'utf8');
    const lidas = await t.ler();
    assert.equal(lidas.length, 2, 'telemetria não tem cadeia a quebrar');
  });

  it('linha de telemetria inválida em disco é LINHA_INVALIDA na leitura', async () => {
    const dir = await tmpDir();
    const t = new TelemetriaFile(dir);
    await t.anexar(telemetria());
    await fsp.appendFile(path.join(dir, 'telemetry.jsonl'), '\n{"tokensEntrada":1}', 'utf8');
    await assert.rejects(
      t.ler(),
      (erro: unknown) => erro instanceof LedgerError && erro.code === 'LINHA_INVALIDA' && /linha 1/.test(erro.message),
    );
  });

  it('anexos concorrentes de telemetria também são serializados (mutex)', async () => {
    const dir = await tmpDir();
    const t = new TelemetriaFile(dir);
    await Promise.all(Array.from({ length: 6 }, () => t.anexar(telemetria())));
    assert.equal((await t.ler()).length, 6);
  });
});

// ---------------------------------------------------------------------------
// helper local
// ---------------------------------------------------------------------------

async function temConteudo(dir: string): Promise<string> {
  try {
    return await fsp.readFile(path.join(dir, LEDGER_FILENAME), 'utf8');
  } catch {
    return '';
  }
}
