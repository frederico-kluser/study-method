/**
 * cx-scripts-progress-decisions.test.ts — CARACTERIZAÇÃO de `progress-update.sh` e `decisions-ask.sh`.
 *
 * Pina (docs/00-contratos.md §8 e §2, passos 6 e 2):
 *  - `progress-update.sh` exige EXATAMENTE um de --event/--due/--recompute
 *    (sem modo e modos combinados são exit 2), tem lock próprio
 *    `memory/.progress.lock` (exit 4 quando ocupado), e `--recompute` CRIA
 *    `memory/progress.json` quando ausente — é o caminho do close_session;
 *  - evento sem artefato/JSON inválido/sem campos obrigatórios é exit 5
 *    (evento sem artefato correspondente TAMBÉM é 5);
 *  - `decisions-ask.sh` conduz as fases do catálogo `SK/assets/decisions.json`
 *    (que é a fonte de verdade), rejeita modo/valor inválido com exit 2, e
 *    `--defaults` NUNCA aplica em silêncio (BOOT-2: grava `default_used: true`
 *    e declara o que assumiu).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import { makeSandbox, FIXED_TODAY, setupJson } from './cx-scripts-fixtures/harness';

describe('progress-update.sh — eventos observáveis → progress.json (§8)', () => {
  it('sem modo ou com modos combinados → exit 2 (exatamente um de --event/--due/--recompute)', async () => {
    const sb = await makeSandbox(true);
    const semModo = sb.script('progress-update.sh', [sb.setup]);
    assert.equal(semModo.status, 2);
    assert.match(semModo.stderr, /informe exatamente um modo/);

    for (const args of [
      ['--due', '--recompute'],
      ['--event', 'x.json', '--due'],
    ]) {
      const r = sb.script('progress-update.sh', [sb.setup, ...args]);
      assert.equal(r.status, 2, `args: ${args.join(' ')}`);
      assert.match(r.stderr, /mutuamente exclusivos/);
    }
    assert.equal(sb.script('progress-update.sh', ['--help']).status, 0);
    await sb.rm();
  });

  it('flag desconhecida e posicional extra → 2 · setup inexistente → 3', async () => {
    const sb = await makeSandbox(true);
    assert.equal(sb.script('progress-update.sh', ['--frob']).status, 2);
    assert.equal(sb.script('progress-update.sh', ['um', 'dois', '--due']).status, 2);
    assert.equal(sb.script('progress-update.sh', [path.join(sb.dir, 'nao-existe'), '--due']).status, 3);
    await sb.rm();
  });

  it('--event: arquivo inexistente → 5 · não-JSON → 5 · JSON sem campos obrigatórios → 5', async () => {
    const sb = await makeSandbox(true);
    assert.equal(sb.script('progress-update.sh', [sb.setup, '--event', path.join(sb.dir, 'nao-existe.json')]).status, 5);

    const quebrado = await sb.write('evento-quebrado.json', '{broken');
    assert.equal(sb.script('progress-update.sh', [sb.setup, '--event', quebrado]).status, 5);

    const semCampos = await sb.write('evento-sem-campos.json', '{"foo":1}');
    const r = sb.script('progress-update.sh', [sb.setup, '--event', semCampos]);
    assert.equal(r.status, 5, 'evento sem artefato/campos obrigatórios também é 5 (§8)');
    await sb.rm();
  });

  it('--due sem progress.json: exit 0 com a forma {today, decayed, due, suggested, warnings}', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('progress-update.sh', [sb.setup, '--due']);
    assert.equal(r.status, 0);
    const saida = JSON.parse(r.stdout) as Record<string, unknown>;
    assert.deepEqual(Object.keys(saida), ['today', 'decayed', 'due', 'suggested', 'warnings']);
    assert.equal(saida.today, FIXED_TODAY, 'a data honra STUDY_METHOD_TODAY');
    assert.deepEqual(saida.due, []);
    await sb.rm();
  });

  it('--recompute: CRIA memory/progress.json quando ausente e imprime o diff (close_session depende disso)', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('progress-update.sh', [sb.setup, '--recompute']);
    assert.equal(r.status, 0);
    const saida = JSON.parse(r.stdout) as { mode: string; changed: number; diff: unknown[]; warnings: unknown[] };
    assert.equal(saida.mode, 'recompute');
    assert.deepEqual(Object.keys(saida), ['mode', 'changed', 'diff', 'warnings']);
    assert.equal(await sb.exists(path.join('setup', 'memory', 'progress.json')), true, 'o arquivo é criado se ausente');
    await sb.rm();
  });

  it('lock de ARQUIVO: memory/.progress.lock ocupado → exit 4 (escritas concorrentes corrompem proficiência)', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'memory', '.progress.lock'), { recursive: true });
    const r = sb.script('progress-update.sh', [sb.setup, '--due']);
    assert.equal(r.status, 4);
    assert.match(r.stderr, /travado/);
    await sb.rm();
  });
});

describe('decisions-ask.sh — decisões abertas do catálogo (§8, BOOT-2)', () => {
  it('fase ausente ou fora do conjunto de fases → exit 2', async () => {
    const sb = await makeSandbox(true);
    assert.equal(sb.script('decisions-ask.sh', [sb.setup]).status, 2);
    const faseRuim = sb.script('decisions-ask.sh', [sb.setup, 'fase-que-nao-existe']);
    assert.equal(faseRuim.status, 2);
    assert.match(faseRuim.stderr, /fase-que-nao-existe/);
    assert.equal(sb.script('decisions-ask.sh', ['--help']).status, 0);
    await sb.rm();
  });

  it('modos --record/--answer/--defaults são mutuamente exclusivos e têm forma própria', async () => {
    const sb = await makeSandbox(true);
    const dois = sb.script('decisions-ask.sh', [sb.setup, 'setup-init', '--record', 'D-B02', 'x', '--answer', 'D-B02=y']);
    assert.equal(dois.status, 2);
    assert.match(dois.stderr, /mutuamente exclusivos/);

    const answerSemForma = sb.script('decisions-ask.sh', [sb.setup, 'setup-init', '--answer', 'SEMIGUAL']);
    assert.equal(answerSemForma.status, 2);
    assert.match(answerSemForma.stderr, /<id>=<opcao>/);

    const sessionRuim = sb.script('decisions-ask.sh', [sb.setup, 'setup-init', '--record', 'D-B02', 'x', '--session', 'ABC']);
    assert.equal(sessionRuim.status, 2, '--session exige NNNN (4 dígitos)');
    await sb.rm();
  });

  it('--record: decisão inexistente no catálogo → 2; opção fora do enum da entrada → 2', async () => {
    const sb = await makeSandbox(true);
    const inexistente = sb.script('decisions-ask.sh', [sb.setup, 'setup-init', '--record', 'D-ZZ9', 'x']);
    assert.equal(inexistente.status, 2);
    assert.match(inexistente.stderr, /decisao inexistente no catalogo/);

    const opcaoRuim = sb.script('decisions-ask.sh', [sb.setup, 'setup-init', '--record', 'D-B02', 'opcao-que-nao-existe']);
    assert.equal(opcaoRuim.status, 2);
    assert.match(opcaoRuim.stderr, /opcao invalida/);
    await sb.rm();
  });

  it('setup inexistente → 3 · setup.json malformado → 5', async () => {
    const sb = await makeSandbox(false);
    const semSetup = sb.script('decisions-ask.sh', [path.join(sb.dir, 'nao-existe'), 'setup-init']);
    assert.equal(semSetup.status, 3);

    await fsp.mkdir(sb.setup, { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'setup.json'), '{broken', 'utf8');
    const malformado = sb.script('decisions-ask.sh', [sb.setup, 'setup-init']);
    assert.equal(malformado.status, 5);
    assert.match(malformado.stderr, /setup\.json nao e JSON valido/);
    await sb.rm();
  });

  it('fase setup-init: exit 0 com o bloco estruturado das decisões pendentes', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('decisions-ask.sh', [sb.setup, 'setup-init']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /DECISOES ABERTAS · fase setup-init/);
    assert.match(r.stdout, /pendentes: \d+/);
    await sb.rm();
  });

  it('--catalog-only não exige setup (resolve direto do catálogo) e sai 0', async () => {
    const sb = await makeSandbox(false);
    const r = sb.script('decisions-ask.sh', ['--catalog-only', 'setup-init']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /DECISOES ABERTAS · fase setup-init/);
    await sb.rm();
  });

  it('--defaults grava default_used: true e DECLARA o que assumiu (nunca aplica em silêncio — BOOT-2)', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('decisions-ask.sh', [sb.setup, 'setup-init', '--defaults']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /DEFAULTS ASSUMIDOS/);
    assert.match(r.stdout, /assumi:/, 'a saída diz, linha a linha, o que foi assumido e como mudar');

    const manifest = JSON.parse(await sb.read(path.join('setup', 'setup.json'))) as {
      decisions: Record<string, { value: unknown; default_used: boolean }>;
    };
    const valores = Object.values(manifest.decisions);
    assert.ok(valores.length > 0, 'as decisões respondidas entram no manifesto');
    for (const d of valores) {
      assert.equal(d.default_used, true, 'default nunca aplicado em silêncio');
    }
    await sb.rm();
  });

  it('--record registra a resposta do aluno no setup.json (value + answered_at)', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('decisions-ask.sh', [sb.setup, 'setup-init', '--record', 'D-B02', 'knowledge_only']);
    assert.equal(r.status, 0);
    const manifest = JSON.parse(await sb.read(path.join('setup', 'setup.json'))) as {
      decisions: Record<string, { value: unknown; default_used: boolean; answered_at: string }>;
    };
    assert.equal(manifest.decisions['D-B02'].value, 'knowledge_only');
    assert.match(manifest.decisions['D-B02'].answered_at, /^\d{4}-\d{2}-\d{2}T/);
    await sb.rm();
  });
});
