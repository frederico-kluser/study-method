/**
 * cx-scripts-repo-tools.test.ts — CARACTERIZAÇÃO dos gates/ferramentas do repositório:
 * `tests/validate.sh`, `tests/spec-conformance.sh`, `tests/smoke.sh`,
 * `tests/gate-{build,lint,bash32}.sh`, `tests/lib/assert.sh`,
 * `tools/emulador-ambiente.sh`, `evals/run-evals.sh`, `install.sh`, `run.sh`.
 *
 * O smoke.sh cobre o fluxo ponta a ponta S-01..S-06 — NÃO é duplicado aqui. O que
 * fica pinado são os comportamentos UNITÁRIOS que o smoke não alcança:
 *  - contrato de CLI de cada gate (usage em --help, exit 2 em argumento inválido);
 *  - `gate-bash32.sh` no modo auto-teste (varredura textual de construtos bash 4+);
 *  - a mecânica de resultado de `tests/lib/assert.sh` (gate_summary verde=0 / vermelho=1);
 *  - o precheck do emulador de ambiente (ferramenta ausente → exit 1 ANTES de criar
 *    coisa alguma; o caminho Docker de verdade exige rede e fica de fora);
 *  - `install.sh`/`run.sh` SOMENTE nos ramos de erro que abortam antes de qualquer
 *    cópia ou `npm ci` — instalação real é proibida nestes testes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import { makeSandbox, REPO_ROOT, TESTS_DIR, TOOLS_DIR, EVALS_DIR } from './cx-scripts-fixtures/harness';

const GATES = [
  'validate.sh',
  'spec-conformance.sh',
  'smoke.sh',
  'gate-build.sh',
  'gate-lint.sh',
  'gate-bash32.sh',
];

describe('tests/gate-*.sh e tests/validate.sh — contrato de CLI dos gates', () => {
  it('--help sai 0 em todos os gates; argumento desconhecido sai 2 (exceto gate-bash32, cujos args são alvos)', async () => {
    const sb = await makeSandbox(false);
    for (const gate of GATES) {
      const abs = path.join(TESTS_DIR, gate);
      assert.equal(sb.file(abs, ['--help']).status, 0, `${gate} --help`);
      const esperado = gate === 'gate-bash32.sh' ? 0 : 2;
      assert.equal(sb.file(abs, ['--frobnicate']).status, esperado, `${gate} --frobnicate`);
    }
    await sb.rm();
  });

  it('validate.sh --list enumera os checks por id (I-NN · descrição)', async () => {
    const sb = await makeSandbox(false);
    const r = sb.file(path.join(TESTS_DIR, 'validate.sh'), ['--list']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^I-\d\d · /m, 'a listagem sai no formato estável de id · descrição');
    await sb.rm();
  });

  it('validate.sh com GATE_ONLY roda o recorte e fecha GATE VERDE (isolamento de check)', async () => {
    const sb = await makeSandbox(false);
    const r = sb.file(path.join(TESTS_DIR, 'validate.sh'), [], { env: { GATE_ONLY: 'I-08' } });
    assert.equal(r.status, 0, `stdout: ${r.stdout.slice(-300)}`);
    assert.match(r.stdout, /GATE VERDE/);
    assert.match(r.stdout, /1 passou · 0 falhou/);
    await sb.rm();
  });

  it('gate-bash32.sh (auto-teste): reprova `local -n` e expansão de caixa, aprova código limpo', async () => {
    const sb = await makeSandbox(false);
    const gate = path.join(TESTS_DIR, 'gate-bash32.sh');

    const nameref = await sb.write('bad-nameref.sh', 'foo() { local -n x=y; }\n');
    const r1 = sb.file(gate, [nameref]);
    assert.equal(r1.status, 1, 'nameref (bash 4.3+) reprova');
    assert.match(r1.stdout, /B-ALL/);

    const caixa = await sb.write('bad-case.sh', 'echo "${var,,}"\n');
    const r2 = sb.file(gate, [caixa]);
    assert.equal(r2.status, 1, 'expansão de caixa (bash 4.0+) reprova');

    const limpo = await sb.write('good.sh', 'foo() { local x=y; echo "${var}" ; }\n');
    const r3 = sb.file(gate, [limpo]);
    assert.equal(r3.status, 0, `stdout: ${r3.stdout.slice(-200)}`);
    assert.match(r3.stdout, /GATE VERDE/);

    // comportamento atual pinado: com argumentos o gate varre EXATAMENTE os caminhos
    // dados e um caminho inexistente não reprova (grep vazio ⇒ verde) — é o modo
    // auto-teste documentado no cabeçalho do gate.
    assert.equal(sb.file(gate, [path.join(sb.dir, 'arquivo-que-nao-existe.sh')]).status, 0);
    await sb.rm();
  });
});

describe('tests/lib/assert.sh — mecânica de resultado dos gates (LIB-1: só source)', () => {
  it('gate_summary: GATE VERDE e exit 0 sem falha/pendência; GATE VERMELHO e exit 1 com falha', async () => {
    const sb = await makeSandbox(false);
    const verde = sb.sh(`set -u; . "${TESTS_DIR}/lib/assert.sh"; gate_init 'teste'; gate_pass 'X-1' 'ok'; gate_summary`);
    assert.equal(verde.status, 0);
    assert.match(verde.stdout, /GATE VERDE/);
    assert.match(verde.stdout, /1 passou · 0 falhou · 0 pendente/);

    const vermelho = sb.sh(`set -u; . "${TESTS_DIR}/lib/assert.sh"; gate_init 'teste'; gate_fail 'X-2' 'quebrou' 'esperado' 'obtido' 'onde'; gate_summary`);
    assert.equal(vermelho.status, 1);
    assert.match(vermelho.stdout, /GATE VERMELHO/);
    assert.match(vermelho.stdout, /X-2 \| quebrou \| onde: onde \| esperado: esperado \| obtido: obtido/);

    // pendente (artefato inexistente) também deixa o gate vermelho — e a mensagem
    // DISTINGUE "ainda não escrito" de "escrito errado"
    const pendente = sb.sh(`set -u; . "${TESTS_DIR}/lib/assert.sh"; gate_init 'teste'; gate_pend 'X-3' 'falta artefato' 'nao existe'; gate_summary`);
    assert.equal(pendente.status, 1);
    assert.match(pendente.stdout, /GATE VERMELHO/);
    assert.match(pendente.stdout, /pré-requisito ausente/);
    await sb.rm();
  });

  it('assert_eq/assert_exit registram PASS/FAIL com esperado×obtido no diagnóstico', async () => {
    const sb = await makeSandbox(false);
    const r = sb.sh(`set -u; . "${TESTS_DIR}/lib/assert.sh"; gate_init 'teste';
      assert_eq 'X-1' 'igual' 'a' 'a';
      assert_eq 'X-2' 'diferente' 'a' 'b' 'comando';
      assert_exit 'X-3' 0 'true passa' -- true;
      assert_exit 'X-4' 0 'false falha' -- false;
      gate_summary`);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✔ X-1/);
    assert.match(r.stdout, /✘ X-2/);
    assert.match(r.stdout, /esperado:\s*a/);
    assert.match(r.stdout, /obtido:\s*b/);
    assert.match(r.stdout, /✔ X-3/);
    assert.match(r.stdout, /✘ X-4/);
    await sb.rm();
  });
});

describe('tools/emulador-ambiente.sh — precheck do emulador Docker (rede fora do escopo)', () => {
  it('--help sai 0 e flag desconhecida sai 2', async () => {
    const sb = await makeSandbox(false);
    assert.equal(sb.file(path.join(TOOLS_DIR, 'emulador-ambiente.sh'), ['--help']).status, 0);
    assert.equal(sb.file(path.join(TOOLS_DIR, 'emulador-ambiente.sh'), ['--frobnicate']).status, 2);
    await sb.rm();
  });

  it('precheck: docker ausente → exit 1 com remédio, ANTES de criar qualquer coisa', async () => {
    const sb = await makeSandbox(false);
    // PATH mínimo sem docker: o precheck reprova o ambiente e nada é criado
    const r = sb.sh(`
      set -e
      PATH_MIN="${sb.dir}/bin-min"
      mkdir -p "$PATH_MIN"
      for c in bash sh sed grep awk ls cat mkdir rm cp mv touch stat date env python3 timeout sort head tail tr cut wc dirname basename uname id find xargs mktemp chmod cmp diff; do
        p="$(command -v "$c" 2>/dev/null)" && ln -sfn "$p" "$PATH_MIN/$c"
      done
      export PATH="$PATH_MIN"
      bash "${TOOLS_DIR}/emulador-ambiente.sh" && exit 99 || rc=$?
      echo "rc=$rc"
    `);
    assert.match(r.stdout, /rc=1/, `saida: ${r.stdout} ${r.stderr}`);
    assert.match(r.stderr, /docker não está no PATH/);
    await sb.rm();
  });
});

describe('evals/run-evals.sh — verificador estático da suíte de avaliação', () => {
  it('--help e --list saem 0; --only sem valor e flag desconhecida saem 2', async () => {
    const sb = await makeSandbox(false);
    const runEvals = path.join(EVALS_DIR, 'run-evals.sh');
    assert.equal(sb.file(runEvals, ['--help']).status, 0);

    const lista = sb.file(runEvals, ['--list']);
    assert.equal(lista.status, 0);
    assert.match(lista.stdout, /E-\d\d/, 'a listagem enumera os checks automatizados');

    assert.equal(sb.file(runEvals, ['--only']).status, 2);
    assert.equal(sb.file(runEvals, ['--frobnicate']).status, 2);
    await sb.rm();
  });
});

describe('install.sh / run.sh — ramos de erro que abortam ANTES de copiar ou instalar', () => {
  async function repoFalso(sb: Awaited<ReturnType<typeof makeSandbox>>, nome: string): Promise<string> {
    const repo = path.join(sb.dir, nome);
    await fsp.mkdir(path.join(repo, 'tools'), { recursive: true });
    for (const arquivo of ['install.sh', 'run.sh']) {
      await fsp.copyFile(path.join(REPO_ROOT, arquivo), path.join(repo, arquivo));
    }
    await fsp.copyFile(path.join(REPO_ROOT, 'tools', 'check-env.sh'), path.join(repo, 'tools', 'check-env.sh'));
    return repo;
  }

  it('install.sh sem skills/*/ → exit 1 com o remédio (rode a partir do clone)', async () => {
    const sb = await makeSandbox(false);
    const repo = await repoFalso(sb, 'repo-sem-skills');
    const r = sb.file(path.join(repo, 'install.sh'), []);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /não achei nenhuma skill/);
    await sb.rm();
  });

  it('install.sh com frontmatter divergente do diretório → exit 1 (a skill não carregaria)', async () => {
    const sb = await makeSandbox(false);
    const repo = await repoFalso(sb, 'repo-frontmatter');
    await fsp.mkdir(path.join(repo, 'skills', 'estranha'), { recursive: true });
    await fsp.writeFile(path.join(repo, 'skills', 'estranha', 'SKILL.md'), '---\nname: outro-nome\n---\n# x\n', 'utf8');
    const r = sb.file(path.join(repo, 'install.sh'), [], { env: { CLAUDE_SKILLS_DIR: path.join(sb.dir, 'dest') } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /frontmatter diz «name: outro-nome»/);
    await sb.rm();
  });

  it('install.sh com skill sem SKILL.md → exit 1', async () => {
    const sb = await makeSandbox(false);
    const repo = await repoFalso(sb, 'repo-skill-vazia');
    await fsp.mkdir(path.join(repo, 'skills', 'vazia'), { recursive: true });
    const r = sb.file(path.join(repo, 'install.sh'), [], { env: { CLAUDE_SKILLS_DIR: path.join(sb.dir, 'dest') } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /não achei .*SKILL\.md/);
    await sb.rm();
  });

  it('install.sh recusa destino existente que NÃO é a skill (nunca sobrescreve alheio)', async () => {
    const sb = await makeSandbox(false);
    const repo = await repoFalso(sb, 'repo-destino-alheio');
    await fsp.mkdir(path.join(repo, 'skills', 'minha'), { recursive: true });
    await fsp.writeFile(path.join(repo, 'skills', 'minha', 'SKILL.md'), '---\nname: minha\n---\n# skill\n', 'utf8');
    const dest = path.join(sb.dir, 'dest');
    await fsp.mkdir(path.join(dest, 'minha'), { recursive: true });
    await fsp.writeFile(path.join(dest, 'minha', 'SKILL.md'), '---\nname: outra\n---\n# outra\n', 'utf8');

    const r = sb.file(path.join(repo, 'install.sh'), [], { env: { CLAUDE_SKILLS_DIR: dest } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /existe e não parece a skill minha/);
    await sb.rm();
  });

  it('run.sh sem app/package.json + package-lock.json → exit 1 antes de qualquer npm', async () => {
    const sb = await makeSandbox(false);
    const repo = await repoFalso(sb, 'repo-sem-app');
    await fsp.mkdir(path.join(repo, 'app'), { recursive: true });
    const r = sb.file(path.join(repo, 'run.sh'), []);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /não achei .*package\.json \+ package-lock\.json/);
    await sb.rm();
  });
});
