/**
 * cx-scripts-lib-sandbox.test.ts — CARACTERIZAÇÃO de `skills/study-method/scripts/lib/sandbox.sh`
 * e do motor de mutação `skills/study-method/scripts/lib/_mutate.py`.
 *
 * O que está pinado:
 *  - `sm_sandbox_probe`: JSON de capacidades (§7.3) com as 7 chaves fechadas;
 *  - `sm_sandbox_report`: uma linha pt-BR para o aluno;
 *  - `sm_sandbox_classify_exit`: a desambiguação do 137 e o vocabulário
 *    `passed|failed|timeout|oom|cpu|infra` (§5.3) — inclusive os códigos
 *    OBSERVADOS do ambiente (124/142/152/153/66/101);
 *  - `sm_sandbox_run`: preserva o exit code BRUTO do comando e usa o
 *    `challenge_dir` como cwd (`cd` falha → 66);
 *  - `_mutate.py`: catálogo FIXO v1.0 determinístico, mascaramento de
 *    strings/comentários, ids `<OP>@L<n>C<n>`, exit codes do CLI auxiliar.
 *
 * Nada aqui exige rede, sudo, Docker ou escrita fora de tmp.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { makeSandbox, LIB_DIR, runPythonFile } from './cx-scripts-fixtures/harness';

const MUTATE = path.join(LIB_DIR, '_mutate.py');

const FONTE = `def soma(a, b):
    if a < b:
        return a + b
    return a * b
`;

describe('lib/sandbox.sh — contrato §7.3 (caracterização)', () => {
  it('sm_sandbox_probe: JSON com as 7 capacidades fechadas, sondadas sem sair do lugar', async () => {
    const sb = await makeSandbox(false);
    const r = sb.lib('sandbox.sh', `sm_sandbox_probe`);
    assert.equal(r.status, 0);
    const caps = JSON.parse(r.stdout) as Record<string, unknown>;
    assert.deepEqual(
      Object.keys(caps).sort(),
      ['cpu', 'docker', 'fs_confine', 'memcg', 'netns', 'pidns', 'timeout'],
    );
    await sb.rm();
  });

  it('sm_sandbox_report: exatamente uma linha pt-BR começando por «Sandbox:»', async () => {
    const sb = await makeSandbox(false);
    const r = sb.lib('sandbox.sh', `sm_sandbox_report`);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim().split('\n').length, 1);
    assert.match(r.stdout, /^Sandbox: /);
    await sb.rm();
  });

  it('sm_sandbox_classify_exit: vocabulário fechado e desambiguação do 137 (§5.3)', async () => {
    const sb = await makeSandbox(false);
    const casos: Array<[string, string, string, string]> = [
      // code, elapsed, wall, classificação esperada
      ['0', '1', '10', 'passed'],
      ['1', '1', '10', 'failed'],
      ['101', '1', '10', 'failed'], // cargo test: falha de teste
      ['137', '11', '10', 'timeout'], // tempo decorrido >= WALL → timeout (§5.3.1)
      ['137', '3', '10', 'cpu'], // sem evidência de OOM → limite de CPU (§5.3.3)
      ['124', '5', '10', 'timeout'], // timeout de sinal default: defensivo
      ['142', '5', '10', 'timeout'], // SIGALRM (fallback perl)
      ['152', '5', '10', 'cpu'], // SIGXCPU
      ['153', '5', '10', 'failed'], // SIGXFSZ
      ['66', '1', '10', 'infra'], // cd falhou: infraestrutura, não do aluno
    ];
    for (const [code, elapsed, wall, esperado] of casos) {
      const r = sb.lib('sandbox.sh', `sm_sandbox_classify_exit ${code} ${elapsed} ${wall}`);
      assert.equal(r.status, 0, `classify(${code}, ${elapsed}, ${wall})`);
      assert.equal(r.stdout.trim(), esperado, `classify(${code}, ${elapsed}, ${wall})`);
    }
    await sb.rm();
  });

  it('sm_sandbox_run: preserva o exit code BRUTO do comando e roda com o cwd no challenge_dir', async () => {
    const sb = await makeSandbox(false);
    const chDir = path.join(sb.dir, 'desafio');
    await sb.write('desafio/marca.txt', 'presente');

    const eco = sb.lib('sandbox.sh', `sm_sandbox_run '${chDir}' -- bash -c 'cat marca.txt; exit 101'`);
    assert.equal(eco.status, 101, 'exit 101 do cargo/unittest precisa chegar BRUTO ao chamador');
    assert.match(eco.stdout, /presente/, 'o comando lê o conteúdo do challenge_dir (cwd = challenge_dir)');
    await sb.rm();
  });

  it('sm_sandbox_run: 66 quando o cd no challenge_dir falha (infra, nunca exit 70/1)', async () => {
    const sb = await makeSandbox(false);
    const r = sb.lib('sandbox.sh', `sm_sandbox_run '${path.join(sb.dir, 'nao-existe')}' -- bash -c 'echo nunca'`);
    assert.equal(r.status, 66);
    await sb.rm();
  });
});

describe('lib/_mutate.py — catálogo fixo v1.0 (caracterização)', () => {
  it('list --json: envelope {operators_version, language, generated, mutants[]} determinístico', async () => {
    const sb = await makeSandbox(false);
    const fonte = await sb.write('alvo.py', FONTE);
    const r = runPythonFile(MUTATE, ['list', fonte, '--json'], sb.home);
    assert.equal(r.status, 0);
    const saida = JSON.parse(r.stdout) as {
      operators_version: string;
      language: string;
      generated: number;
      mutants: Array<{ mutant_id: string; operator: string; line: number; column: number; before: string; after: string }>;
    };
    assert.equal(saida.operators_version, '1.0');
    assert.equal(saida.language, 'python');
    assert.equal(saida.generated, saida.mutants.length);

    // mutant_id = <OP>@L<linha>C<coluna>, 1-based nos dois
    for (const m of saida.mutants) {
      assert.match(m.mutant_id, /^(ROR|AOR|LCR|UOI|CRP|SDL|RVR|SVR)@L\d+C\d+([+-])?$/);
      assert.ok(m.line >= 1 && m.column >= 1, `posição 1-based: ${m.mutant_id}`);
    }

    // determinismo: duas listagens idênticas byte a byte
    const deNovo = runPythonFile(MUTATE, ['list', fonte, '--json'], sb.home);
    assert.equal(deNovo.stdout, r.stdout, 'o catálogo é mecânico e determinístico');
    await sb.rm();
  });

  it('list: strings e comentários são MASCARADOS — literal de string/comentário não vira mutante', async () => {
    const sb = await makeSandbox(false);
    const fonte = await sb.write('mascarado.py', 'def f():\n    return "erro 404"  # 10 + 20\n');
    const r = runPythonFile(MUTATE, ['list', fonte, '--json'], sb.home);
    assert.equal(r.status, 0);
    const saida = JSON.parse(r.stdout) as { mutants: Array<{ before: string; after: string }> };
    for (const m of saida.mutants) {
      const texto = `${m.before}\n${m.after}`;
      assert.ok(!texto.includes('404'), `literal de string não muta: ${texto}`);
      assert.ok(!/\b(10|20|9|11|19|21)\b/.test(texto), `literal de comentário não muta: ${texto}`);
    }
    await sb.rm();
  });

  it('count --json: distribuição pelos 8 operadores canônicos, na ordem fixa', async () => {
    const sb = await makeSandbox(false);
    const fonte = await sb.write('alvo.py', FONTE);
    const r = runPythonFile(MUTATE, ['count', fonte, '--json'], sb.home);
    assert.equal(r.status, 0);
    const saida = JSON.parse(r.stdout) as { operators_version: string; generated: number; by_operator: Record<string, number> };
    assert.equal(saida.operators_version, '1.0');
    assert.deepEqual(Object.keys(saida.by_operator), ['ROR', 'AOR', 'LCR', 'UOI', 'CRP', 'SDL', 'RVR', 'SVR']);
    assert.equal(saida.generated, Object.values(saida.by_operator).reduce((a, b) => a + b, 0));
    // ROR: `a < b` ↔ `a <= b` — exatamente 1 mutante por ocorrência
    assert.equal(saida.by_operator.ROR, 1);
    await sb.rm();
  });

  it('CRP: literal inteiro produz DOIS mutantes no mesmo sítio (n+1 e n−1, sufixos +/−)', async () => {
    const sb = await makeSandbox(false);
    const fonte = await sb.write('literal.py', 'def f(x):\n    return x + 42\n');
    const r = runPythonFile(MUTATE, ['list', fonte, '--json'], sb.home);
    const saida = JSON.parse(r.stdout) as { mutants: Array<{ mutant_id: string; operator: string }> };
    const crp = saida.mutants.filter((m) => m.operator === 'CRP').map((m) => m.mutant_id);
    assert.equal(crp.length, 2, 'CRP emite 2 por literal');
    assert.ok(crp.some((id) => id.endsWith('+')) && crp.some((id) => id.endsWith('-')), 'sufixos + e − distinguem os dois');
    await sb.rm();
  });

  it('apply: escreve o mutante em stdout; id inexistente → 2; sem id → 2', async () => {
    const sb = await makeSandbox(false);
    const fonte = await sb.write('alvo.py', FONTE);
    const listagem = runPythonFile(MUTATE, ['list', fonte, '--json'], sb.home);
    const mutantes = (JSON.parse(listagem.stdout) as { mutants: Array<{ mutant_id: string; before: string; after: string }> }).mutants;
    const alvo = mutantes[0];
    const aplicado = runPythonFile(MUTATE, ['apply', fonte, alvo.mutant_id], sb.home);
    assert.equal(aplicado.status, 0);
    assert.ok(aplicado.stdout.includes(alvo.after.trim()), 'o texto mutado (after) aparece na saída');
    assert.ok(!aplicado.stdout.includes(alvo.before.trim()), 'o texto original (before) foi substituído');

    const inexistente = runPythonFile(MUTATE, ['apply', fonte, 'XXX@L1C1'], sb.home);
    assert.equal(inexistente.status, 2);

    const semId = runPythonFile(MUTATE, ['apply', fonte], sb.home);
    assert.equal(semId.status, 2);
    await sb.rm();
  });

  it('CLI auxiliar: ação fora do enum → 2 · fonte inexistente → 1 · --language é rotulador do envelope', async () => {
    const sb = await makeSandbox(false);
    const fonte = await sb.write('alvo.py', FONTE);

    const acaoRuim = runPythonFile(MUTATE, ['explode', fonte], sb.home);
    assert.equal(acaoRuim.status, 2, 'argparse rejeita ação fora de {list,apply,count}');

    const fonteRuim = runPythonFile(MUTATE, ['list', path.join(sb.dir, 'nao-existe.py'), '--json'], sb.home);
    assert.equal(fonteRuim.status, 1);

    // `--language` fora do enum de 19 NÃO é rejeitado: o valor entra como rótulo do
    // envelope e o motor de mutação (python) roda do mesmo jeito. Comportamento atual.
    const lingua = runPythonFile(MUTATE, ['list', fonte, '--language', 'cobol', '--json'], sb.home);
    assert.equal(lingua.status, 0);
    const saida = JSON.parse(lingua.stdout) as { language: string; generated: number };
    assert.equal(saida.language, 'cobol');
    assert.equal(saida.generated, 10, 'mesma contagem do default: a linguagem é rótulo, não chave do motor');
    await sb.rm();
  });
});
