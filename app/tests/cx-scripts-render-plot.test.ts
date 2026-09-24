/**
 * cx-scripts-render-plot.test.ts — CARACTERIZAÇÃO de `skills/study-method/scripts/render-plot.py`.
 *
 * Pina a exceção nomeada do §5.2 (exit codes 0/1/2/3, NUNCA a tabela 0–5/10) e o
 * contrato publicado em SK/references/visualizacao.md:
 *  - 1 = spec inválida (`spec_json_invalid`, `spec_missing_key`);
 *  - 2 = dados inválidos (`series_invalid`, `no_valid_data`);
 *  - 3 = falha de escrita (`write_failed`);
 *  - 0 = ok, inclusive com warnings (falha de PNG vira warning, não erro);
 *  - stdout é um JSON com as 7 chaves fixas — o ÚNICO canal pelo qual o modelo
 *    descobre o que desenhou (VIZ-2: ele não enxerga o gráfico);
 *  - as 4 saídas obrigatórias (svg/html/txt/md) e HTML autocontido (VIZ-1);
 *  - `--quiet` suprime o JSON de stdout (documentado como «nunca use»).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { makeSandbox, runPythonFile, SCRIPTS_DIR } from './cx-scripts-fixtures/harness';

const RENDER = path.join(SCRIPTS_DIR, 'render-plot.py');

const SPEC_VALIDA = JSON.stringify({
  type: 'line',
  title: 'Erro em função de h',
  takeaway: 'O erro cai com h menor.',
  x_label: 'h (passo)',
  y_label: 'erro absoluto',
  series: [{ label: 'diferenca progressiva', points: [[1.0, 0.5], [0.1, 0.05], [0.01, 0.005]] }],
});

describe('render-plot.py — exceção nomeada do §5.2 (0 ok · 1 spec · 2 dados · 3 escrita)', () => {
  it('spec com JSON malformado → exit 1 com erro nomeado spec_json_invalid', async () => {
    const sb = await makeSandbox(false);
    const spec = await sb.write('spec-quebrada.json', '{broken');
    const r = runPythonFile(RENDER, ['--spec', spec, '--out-dir', path.join(sb.dir, 'out')], sb.home);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /spec_json_invalid/);
    await sb.rm();
  });

  it('spec sem chave obrigatória (title) → exit 1 com erro nomeado spec_missing_key', async () => {
    const sb = await makeSandbox(false);
    const spec = await sb.write('spec-sem-titulo.json', JSON.stringify({ type: 'line', takeaway: 'K', series: [{ label: 'x', points: [[1, 1]] }] }));
    const r = runPythonFile(RENDER, ['--spec', spec, '--out-dir', path.join(sb.dir, 'out')], sb.home);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /spec_missing_key/);
    assert.match(r.stderr, /title/);
    await sb.rm();
  });

  it('series vazia → exit 2 (series_invalid: a spec está boa, os dados é que não sustentam gráfico)', async () => {
    const sb = await makeSandbox(false);
    const spec = await sb.write('spec-vazia.json', JSON.stringify({ type: 'line', title: 'T', takeaway: 'K', series: [] }));
    const r = runPythonFile(RENDER, ['--spec', spec, '--out-dir', path.join(sb.dir, 'out')], sb.home);
    assert.equal(r.status, 2);
    const saida = JSON.parse(r.stdout) as { ok: boolean; error: string };
    assert.equal(saida.ok, false);
    assert.match(saida.error, /series_invalid/);
    await sb.rm();
  });

  it('nenhum ponto finito (série vazia ou não numérica) → exit 2 com no_valid_data', async () => {
    const sb = await makeSandbox(false);
    for (const [nome, points] of [
      ['pontos-vazios', []],
      ['pontos-texto', [['a', 'b']]],
    ] as Array<[string, unknown]>) {
      const spec = await sb.write(`${nome}.json`, JSON.stringify({ type: 'line', title: 'T', takeaway: 'K', series: [{ label: 'x', points }] }));
      const r = runPythonFile(RENDER, ['--spec', spec, '--out-dir', path.join(sb.dir, nome)], sb.home);
      assert.equal(r.status, 2, `caso: ${nome}`);
      const saida = JSON.parse(r.stdout) as { ok: boolean; error: string };
      assert.match(saida.error, /no_valid_data/);
    }
    await sb.rm();
  });

  it('happy path: exit 0, JSON de 7 chaves, as 4 saídas obrigatórias e HTML autocontido (VIZ-1)', async () => {
    const sb = await makeSandbox(false);
    const spec = await sb.write('spec.json', SPEC_VALIDA);
    const outDir = path.join(sb.dir, 'out');
    const r = runPythonFile(RENDER, ['--spec', spec, '--out-dir', outDir, '--basename', 'graf'], sb.home);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);

    const saida = JSON.parse(r.stdout) as {
      ok: boolean;
      type: string;
      outputs: Record<string, string>;
      description_text: string;
      ascii_text: string;
      warnings: string[];
      stats: Record<string, unknown>;
    };
    assert.deepEqual(Object.keys(saida), ['ok', 'type', 'outputs', 'description_text', 'ascii_text', 'warnings', 'stats']);
    assert.equal(saida.ok, true);
    assert.equal(saida.type, 'line');
    assert.deepEqual(Object.keys(saida.outputs).sort(), ['ascii', 'description', 'html', 'svg']);

    for (const arquivo of ['graf.svg', 'graf.html', 'graf.txt', 'graf.md']) {
      assert.equal(await sb.exists(path.join('out', arquivo)), true, `saída obrigatória ausente: ${arquivo}`);
    }
    assert.ok(saida.description_text.length > 0, 'description_text é o que o modelo narra (VIZ-2)');
    assert.ok(saida.ascii_text.length > 0, 'ASCII/braille é obrigatório como arquivo (VIZ-1)');
    assert.equal(typeof saida.stats.points, 'number');

    const html = await sb.read(path.join('out', 'graf.html'));
    assert.doesNotMatch(html, /<script[^>]+src=/, 'HTML autocontido: sem <script src>');
    assert.doesNotMatch(html, /<link[^>]+href=/, 'HTML autocontido: sem <link>');
    assert.doesNotMatch(html, /https?:\/\//, 'HTML autocontido: sem CDN');
    await sb.rm();
  });

  it('falha de escrita (out-dir sob arquivo regular) → exit 3 com erro nomeado write_failed', async () => {
    const sb = await makeSandbox(false);
    const spec = await sb.write('spec.json', SPEC_VALIDA);
    await sb.write('bloqueio', 'x');
    const r = runPythonFile(RENDER, ['--spec', spec, '--out-dir', path.join(sb.dir, 'bloqueio', 'sub')], sb.home);
    assert.equal(r.status, 3);
    const saida = JSON.parse(r.stdout) as { ok: boolean; error: string };
    assert.match(saida.error, /write_failed/);
    await sb.rm();
  });

  it('--formats restringe as saídas; --quiet suprime o JSON de stdout (o modelo fica cego por opção)', async () => {
    const sb = await makeSandbox(false);
    const spec = await sb.write('spec.json', SPEC_VALIDA);

    const soTxt = runPythonFile(RENDER, ['--spec', spec, '--out-dir', path.join(sb.dir, 'out1'), '--formats', 'txt'], sb.home);
    assert.equal(soTxt.status, 0);
    const saida = JSON.parse(soTxt.stdout) as { outputs: Record<string, string> };
    assert.deepEqual(Object.keys(saida.outputs), ['ascii']);
    assert.equal(await sb.exists(path.join('out1', 'plot.txt')), true);
    assert.equal(await sb.exists(path.join('out1', 'plot.svg')), false);

    const quiet = runPythonFile(RENDER, ['--spec', spec, '--out-dir', path.join(sb.dir, 'out2'), '--formats', 'txt', '--quiet'], sb.home);
    assert.equal(quiet.status, 0);
    assert.equal(quiet.stdout, '', '--quiet deixa o stdout vazio — documentado como «nunca use»');
    assert.equal(await sb.exists(path.join('out2', 'plot.txt')), true);
    await sb.rm();
  });
});
