/**
 * cx-scripts-docs-readme.test.ts — CARACTERIZAÇÃO de `docs-index.sh` e `readme-sync.sh`.
 *
 * Pina (docs/00-contratos.md §3.5, §8, I-30, I-41):
 *  - `readme-sync.sh --init` cria o README do setup com as 8 seções na ordem
 *    canônica; `--init` NUNCA sobrescreve prosa existente;
 *  - a regeneração toca APENAS o interior dos marcadores (prosa do aluno fora
 *    deles é preservada) e é idempotente byte a byte (I-30);
 *  - `docs-index.sh` indexa o `docs/` do setup determinísticamente (exit 0),
 *    grava `memory/docs-index.json` e expõe o contrato de 5 chaves do stdout;
 *  - `--select` é o ÚNICO gatilho do exit 10 (envelope `select_sections`),
 *    `--select`+`--apply` são mutuamente exclusivos (exit 2), e resposta
 *    malformada nunca é aplicada (exit 5).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import { makeSandbox, setupJson } from './cx-scripts-fixtures/harness';

const SECOES = [
  'identidade',
  'taxonomia',
  'base-teorica',
  'destilados',
  'desafios',
  'linha-do-tempo',
  'pontes',
  'estado-atual',
];

describe('readme-sync.sh — 8 seções entre marcadores, prosa intacta, idempotente (I-30/I-41)', () => {
  it('--init: cria o README.md do setup com as 8 seções NA ORDEM canônica e informa as linhas geradas', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('readme-sync.sh', [sb.setup, '--init']);
    assert.equal(r.status, 0);
    assert.match(r.stdout.trim(), /^\d+$/, 'stdout = número de linhas geradas');

    const readme = await sb.read(path.join('setup', 'README.md'));
    let cursor = -1;
    for (const secao of SECOES) {
      const marcador = `study-method:begin ${secao}`;
      const pos = readme.indexOf(marcador);
      assert.ok(pos >= 0, `marcador ausente: ${marcador}`);
      assert.ok(pos > cursor, `seção fora da ordem canônica: ${secao}`);
      cursor = pos;
      assert.ok(readme.includes(`study-method:end ${secao}`), `fim de seção ausente: ${secao}`);
    }
    await sb.rm();
  });

  it('--init sobre README existente NÃO sobrescreve (a prosa do aluno sobrevive)', async () => {
    const sb = await makeSandbox(true);
    assert.equal(sb.script('readme-sync.sh', [sb.setup, '--init']).status, 0);
    await fsp.appendFile(path.join(sb.setup, 'README.md'), '\nPROSA DO ALUNO QUE NAO PODE SUMIR\n', 'utf8');

    const deNovo = sb.script('readme-sync.sh', [sb.setup, '--init']);
    assert.equal(deNovo.status, 0);
    assert.match(await sb.read(path.join('setup', 'README.md')), /PROSA DO ALUNO QUE NAO PODE SUMIR/);
    await sb.rm();
  });

  it('regeneração preserva a prosa FORA dos marcadores e é idempotente byte a byte (I-30)', async () => {
    const sb = await makeSandbox(true);
    assert.equal(sb.script('readme-sync.sh', [sb.setup, '--init']).status, 0);
    await fsp.appendFile(path.join(sb.setup, 'README.md'), '\nPROSA DO ALUNO QUE NAO PODE SUMIR\n', 'utf8');

    const a = sb.script('readme-sync.sh', [sb.setup]);
    assert.equal(a.status, 0);
    assert.match(a.stdout.trim(), /^\d+$/, 'stdout = número de linhas geradas');
    const primeira = await sb.read(path.join('setup', 'README.md'));
    assert.match(primeira, /PROSA DO ALUNO QUE NAO PODE SUMIR/);

    const b = sb.script('readme-sync.sh', [sb.setup]);
    assert.equal(b.status, 0);
    assert.equal(await sb.read(path.join('setup', 'README.md')), primeira, 'duas execuções seguidas ⇒ byte a byte igual');
    await sb.rm();
  });

  it('uso incorreto: flag desconhecida e posicional extra saem 2; setup inexistente sai 3', async () => {
    const sb = await makeSandbox(true);
    assert.equal(sb.script('readme-sync.sh', ['--frob']).status, 2);
    assert.equal(sb.script('readme-sync.sh', ['um', 'dois']).status, 2);
    assert.equal(sb.script('readme-sync.sh', [path.join(sb.dir, 'nao-existe')]).status, 3);
    assert.equal(sb.script('readme-sync.sh', ['--help']).status, 0);
    await sb.rm();
  });
});

describe('docs-index.sh — indexação determinística do docs/ do setup (§8)', () => {
  it('docs/ vazio: exit 0 com o contrato de 5 chaves (docs_coverage none NÃO é erro)', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'docs'), { recursive: true });
    const r = sb.script('docs-index.sh', [sb.setup]);
    assert.equal(r.status, 0);
    const saida = JSON.parse(r.stdout) as Record<string, unknown>;
    assert.deepEqual(Object.keys(saida), ['mode', 'files', 'selected_sections', 'excluded', 'total_ingestible_bytes']);
    assert.equal(saida.mode, 'full');
    assert.equal(saida.files, 0);
    assert.equal(saida.total_ingestible_bytes, 0);
    await sb.rm();
  });

  it('1 arquivo ingerível: indexa, grava memory/docs-index.json e reporta bytes ingeríveis', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'docs'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'docs', 'limites.md'), '# Limites\n\nTexto teorico do aluno sobre limites.\n', 'utf8');

    const r = sb.script('docs-index.sh', [sb.setup]);
    assert.equal(r.status, 0);
    const saida = JSON.parse(r.stdout) as { mode: string; files: number; total_ingestible_bytes: number };
    assert.equal(saida.files, 1);
    assert.ok(saida.total_ingestible_bytes > 0, 'o manifesto carrega o tamanho do material ingerido');

    const manifesto = JSON.parse(await sb.read(path.join('setup', 'memory', 'docs-index.json'))) as Record<string, unknown>;
    assert.equal(manifesto.setup_id, '0123456789ab');
    assert.match(String(manifesto.generated_at), /^\d{4}-\d{2}-\d{2}T/);
    await sb.rm();
  });

  it('determinismo: duas indexações do mesmo material produzem o mesmo docs-index.json', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'docs'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'docs', 'limites.md'), '# Limites\n\nTexto teorico do aluno sobre limites.\n', 'utf8');
    assert.equal(sb.script('docs-index.sh', [sb.setup]).status, 0);
    const primeira = await sb.read(path.join('setup', 'memory', 'docs-index.json'));
    assert.equal(sb.script('docs-index.sh', [sb.setup, '--force']).status, 0);
    assert.equal(await sb.read(path.join('setup', 'memory', 'docs-index.json')), primeira);
    await sb.rm();
  });

  it('uso incorreto: --select+--apply (mutuamente exclusivos), budget não-inteiro, flag desconhecida e extra saem 2', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'docs'), { recursive: true });
    assert.equal(sb.script('docs-index.sh', [sb.setup, '--select', '--apply', 'x.json']).status, 2);
    assert.equal(sb.script('docs-index.sh', [sb.setup, '--budget-bytes', 'abc']).status, 2);
    assert.equal(sb.script('docs-index.sh', [sb.setup, '--frob']).status, 2);
    assert.equal(sb.script('docs-index.sh', [sb.setup, 'um', 'dois']).status, 2);
    assert.equal(sb.script('docs-index.sh', ['--help']).status, 0);
    await sb.rm();
  });

  it('setup_id inválido → exit 5 · --apply inexistente → 2 · --apply não-JSON → 5', async () => {
    const sb = await makeSandbox(false);
    await fsp.mkdir(path.join(sb.setup, 'docs'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'setup.json'), setupJson({ setup_id: 'NAO-HEX' }), 'utf8');
    assert.equal(sb.script('docs-index.sh', [sb.setup]).status, 5);

    await fsp.writeFile(path.join(sb.setup, 'setup.json'), setupJson(), 'utf8');
    assert.equal(sb.script('docs-index.sh', [sb.setup, '--apply', path.join(sb.dir, 'nao-existe.json')]).status, 2);
    const ruim = await sb.write('resposta-ruim.json', '{broken');
    const r = sb.script('docs-index.sh', [sb.setup, '--apply', ruim]);
    assert.equal(r.status, 5);
    assert.match(r.stderr, /não parseia como JSON/);
    await sb.rm();
  });

  it('--select: exit 10 com o envelope `select_sections` (§6.1) e NADA escrito em disco (RA-1)', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'docs'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'docs', 'limites.md'), '# Limites\n\nTexto teorico do aluno sobre limites.\n', 'utf8');

    const r = sb.script('docs-index.sh', [sb.setup, '--select']);
    assert.equal(r.status, 10);
    const envelope = JSON.parse(r.stdout) as Record<string, unknown>;
    assert.equal(envelope.protocol, 'study-method/request-apply');
    assert.equal(envelope.protocol_version, '1.0');
    assert.equal(envelope.kind, 'select_sections');
    assert.equal(envelope.script, 'docs-index.sh');
    assert.match(String(envelope.request_id), /^[a-f0-9]{12}$/);
    assert.match(String(envelope.response_schema), /^urn:study-method:schema:/);
    assert.equal(await sb.exists(path.join('setup', 'memory', 'docs-index.json')), false, 'RA-1: a fase de PEDIDO não escreve');

    // BUG: <sintoma> — <arquivo:linha>: o envelope do PEDIDO sai com `setup_id: null`
    // em vez do `setup_id` do setup, que docs/00-contratos.md §6.1 mostra preenchido
    // ("setup_id": "9f2c41ab77e0") e que memory-compact.sh preenche de fato.
    // Causa: `sm_request` (skills/study-method/scripts/lib/json.sh:157) lê
    // `${SM_SETUP_ID:-}` e docs-index.sh:622 chama `sm_request` sem exportar a
    // variável. O comportamento ATUAL está pinado aqui; a correção é do refactor
    // (exportar SM_SETUP_ID ou passar o id como parâmetro de sm_request).
    assert.equal(envelope.setup_id, null);
    await sb.rm();
  });
});
