/**
 * cx-scripts-challenge.test.ts — CARACTERIZAÇÃO de `challenge-new.sh` e `challenge-verify.sh`.
 *
 * Pina (docs/00-contratos.md §3.2, §5, §8; docs/05):
 *  - `challenge-new.sh` materializa a árvore `challenges/<NNNN>-<slug>/` com o
 *    `<NNNN>` monotônico e `meta.json` em `challenge_status: "draft"` com
 *    `integrity.test_sha256` NULL (nunca calculado na criação); saída em stdout
 *    é SOMENTE o caminho relativo; slug/concept são normalizados (§4.2) e o que
 *    não produz identificador válido é exit 2;
 *  - `challenge-verify.sh` é o JUIZ (DES-1): `weak`/`rejected` também saem 0 e
 *    o veredito vai em stdout; aqui ficam pinados os ramos de erro que o smoke
 *    não alcança (uso, meta.json malformado → 5, resposta de --apply ilegível/
 *    não-JSON → 2/5). O protocolo completo ponta a ponta é de tests/smoke.sh.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import { makeSandbox } from './cx-scripts-fixtures/harness';

describe('challenge-new.sh — materialização do desafio (§3.2, §8)', () => {
  it('sem argumentos: exit 2 com a mensagem de uso em stderr (nunca stdout)', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('challenge-new.sh', []);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /Uso: challenge-new\.sh/);
    assert.equal(sb.script('challenge-new.sh', ['--help']).status, 0);
    await sb.rm();
  });

  it('linguagem fora do enum de 19 → 2, listando as válidas', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('challenge-new.sh', [sb.setup, '--language', 'cobol', '--slug', 'soma', '--concept', 'soma']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /enum de 19/);
    assert.match(r.stderr, /haskell bash/);
    await sb.rm();
  });

  it('slug/concept sem caractere aproveitável → 2 (a normalização não produz identificador)', async () => {
    const sb = await makeSandbox(true);
    const slugRuim = sb.script('challenge-new.sh', [sb.setup, '--language', 'python', '--slug', '!!!', '--concept', 'soma']);
    assert.equal(slugRuim.status, 2, 'slug é coisa que vira caminho: precisa dar kebab-case (§4.2)');
    assert.match(slugRuim.stderr, /--slug/);

    const conceptRuim = sb.script('challenge-new.sh', [sb.setup, '--language', 'python', '--slug', 'soma', '--concept', '!!!']);
    assert.equal(conceptRuim.status, 2, 'concept é coisa que se estuda: precisa dar snake_case (§4.2)');
    assert.match(conceptRuim.stderr, /--concept/);
    await sb.rm();
  });

  it('difficulty fora de 1..5 e skill_level fora do enum → 2', async () => {
    const sb = await makeSandbox(true);
    assert.equal(
      sb.script('challenge-new.sh', [sb.setup, '--language', 'python', '--slug', 'soma', '--concept', 'soma', '--difficulty', '9']).status,
      2,
    );
    assert.equal(
      sb.script('challenge-new.sh', [sb.setup, '--language', 'python', '--slug', 'soma', '--concept', 'soma', '--skill-level', 'expert']).status,
      2,
    );
    await sb.rm();
  });

  it('setup não encontrado → exit 3', async () => {
    const sb = await makeSandbox(false);
    const r = sb.script('challenge-new.sh', [path.join(sb.dir, 'nao-existe'), '--language', 'python', '--slug', 'soma', '--concept', 'soma']);
    assert.equal(r.status, 3);
    await sb.rm();
  });

  it('happy path (python): árvore canônica em challenges/0001-<slug>/ e meta.json em draft', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('challenge-new.sh', [sb.setup, '--language', 'python', '--slug', 'soma-de-fracoes', '--concept', 'soma_de_fracoes']);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), 'challenges/0001-soma-de-fracoes', 'stdout = SOMENTE o caminho relativo (§8)');

    const chRel = path.join('setup', 'challenges', '0001-soma-de-fracoes');
    for (const arquivo of ['meta.json', 'README.md', 'runner.sh', 'stub.py']) {
      assert.equal(await sb.exists(path.join(chRel, arquivo)), true, `falta: ${arquivo}`);
    }
    assert.equal(await sb.exists(path.join(chRel, 'tests')), true, 'falta: tests/');
    assert.equal(await sb.exists(path.join(chRel, '.solution', 'reference.py')), true, 'falta: .solution/ (COM ponto, §3.2)');
    assert.equal(await sb.exists(path.join(chRel, '.solution', 'empty_stub.py')), true);

    const meta = JSON.parse(await fsp.readFile(path.join(sb.dir, chRel, 'meta.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(meta.challenge_id, '0001', 'challenge_id é o NNNN, string de 4 dígitos (§4.2)');
    assert.equal(meta.challenge_status, 'draft');
    assert.equal(meta.language, 'python');
    const integrity = meta.integrity as { test_sha256: unknown };
    assert.equal(integrity.test_sha256, null, 'integridade nasce NULL em draft (docs/05 §9.1)');

    // segundo desafio: NNNN monotônico (não contíguo, nunca reaproveitado)
    const segundo = sb.script('challenge-new.sh', [sb.setup, '--language', 'python', '--slug', 'outra', '--concept', 'outro']);
    assert.equal(segundo.stdout.trim(), 'challenges/0002-outra');
    await sb.rm();
  });
});

describe('challenge-verify.sh — o juiz do desafio (§5, §8; DES-1/DES-2)', () => {
  it('--help sai 0; flag desconhecida, valores não numéricos e dois posicionais saem 2', async () => {
    const sb = await makeSandbox(true);
    assert.equal(sb.script('challenge-verify.sh', ['--help']).status, 0);
    assert.equal(sb.script('challenge-verify.sh', ['--frob']).status, 2);
    assert.equal(sb.script('challenge-verify.sh', ['dir', '--n-rep', '0']).status, 2, '--n-rep mínimo 1');
    assert.equal(sb.script('challenge-verify.sh', ['dir', '--n-rep', 'abc']).status, 2);
    assert.equal(sb.script('challenge-verify.sh', ['dir', '--sample-size', '0']).status, 2);
    assert.equal(sb.script('challenge-verify.sh', ['um', 'dois']).status, 2, 'só um <challenge_dir> posicional');
    await sb.rm();
  });

  it('desafio inexistente → exit 3', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('challenge-verify.sh', [path.join(sb.dir, 'nao-existe')]);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /diretório do desafio não encontrado/);
    await sb.rm();
  });

  it('sem <challenge_dir> o default é $PWD e o resultado é o mesmo: exit 3 sem meta.json', async () => {
    // Comportamento atual pinado: a chamada SEM argumento não é "uso incorreto" (2);
    // o parser usa $PWD como <challenge_dir> e o passo 0 reprova com 3 (desafio não
    // encontrado). O cabeçalho do script documenta o 3; a tabela §8 do contrato
    // lista 0·1·2·5·10 e omite o 3 — divergência documental a reconciliar no refactor.
    const sb = await makeSandbox(false);
    const r = sb.script('challenge-verify.sh', []);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /meta\.json não encontrado/);
    await sb.rm();
  });

  it('meta.json malformado → exit 5 (nunca 1, nunca silêncio)', async () => {
    const sb = await makeSandbox(false);
    const chDir = path.join(sb.dir, 'desafio-quebrado');
    await fsp.mkdir(chDir, { recursive: true });
    await fsp.writeFile(path.join(chDir, 'meta.json'), '{broken', 'utf8');
    const r = sb.script('challenge-verify.sh', [chDir]);
    assert.equal(r.status, 5);
    await sb.rm();
  });

  it('--apply: resposta ilegível → 2 · resposta que não é JSON → 5', async () => {
    const sb = await makeSandbox(true);
    // desafio REAL (meta.json válido): o passo 0 roda antes do --apply
    const criado = sb.script('challenge-new.sh', [sb.setup, '--language', 'python', '--slug', 'soma', '--concept', 'soma']);
    assert.equal(criado.status, 0);
    const chDir = path.join(sb.setup, criado.stdout.trim());

    const ilegivel = sb.script('challenge-verify.sh', [chDir, '--apply', path.join(sb.dir, 'nao-existe.json')]);
    assert.equal(ilegivel.status, 2);
    assert.match(ilegivel.stderr, /resposta ilegível/);

    const naoJson = await sb.write('resposta-quebrada.json', 'nope');
    const r = sb.script('challenge-verify.sh', [chDir, '--apply', naoJson]);
    assert.equal(r.status, 5);
    assert.match(r.stderr, /não é JSON válido/);
    await sb.rm();
  });
});
