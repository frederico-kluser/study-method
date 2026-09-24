/**
 * cx-scripts-gaps-research.test.ts — CARACTERIZAÇÃO de `research-new.sh`
 * (passo `teach` — docs/00-contratos.md §2 passo 7, §3.4 bloco de proveniência,
 * §5 exit codes, §8 tabela de CLI).
 *
 * Pina o comportamento OBSERVÁVEL pela fronteira pública (exit · stdout/stderr · disco):
 *  - aloca `researchs/NNNN.md` com NNNN monotônico e imprime SÓ o caminho relativo;
 *  - a 1ª linha é o bloco de proveniência `<!-- study-method:meta {…} -->`,
 *    `jq`-legível (§3.4), com `provenance` derivado da presença de fontes
 *    (`student_provided` com fontes · `generated_unsourced` sem — nunca
 *    `generated_researched`, pois o script não pesquisa);
 *  - `--sources` aceita só caminho DENTRO da raiz do setup (fora é exit 2); fonte
 *    absoluta dentro da raiz é gravada RELATIVIZADA (§3.4: nenhum caminho absoluto
 *    em arquivo do setup);
 *  - `--session` opcional: sem a flag, a sessão vem de `memory/.session.lock`.
 *
 * Nenhum teste lê o interior dos scripts: só `bash <script>` e observação.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import { makeSandbox, FIXED_NOW, FIXTURE_HOSTNAME } from './cx-scripts-fixtures/harness';

/**
 * Snapshot de caminhos (recursivo) para asserção de NÃO-CRIAÇÃO antes/depois.
 * Inclui ARQUIVOS **e DIRETÓRIOS** — inclusive os vazios (classe do artefato
 * `emulador-ambiente.XXXXXX` que `mktemp -d` deixa em TMPDIR).
 */
async function listarArquivos(raiz: string): Promise<string[]> {
  const achados: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      achados.push(path.relative(raiz, p));
      if (e.isDirectory()) await walk(p);
    }
  }
  await walk(raiz);
  return achados.sort();
}

/** Extrai o objeto JSON do bloco de proveniência da 1ª linha (§3.4). */
async function metaDoDestilado(sb: Awaited<ReturnType<typeof makeSandbox>>, rel: string): Promise<Record<string, any>> {
  const corpo = await sb.read(rel);
  const primeira = corpo.split('\n', 1)[0];
  const m = /^<!-- study-method:meta (.*) -->$/.exec(primeira);
  assert.ok(m, `a 1ª linha não é o bloco <!-- study-method:meta {…} -->: ${primeira.slice(0, 80)}`);
  return JSON.parse(m[1]) as Record<string, any>;
}

describe('research-new.sh — alocação do destilado researchs/NNNN.md (§3.4, §8)', () => {
  it('uso incorreto: --topic obrigatório/sem valor, --session fora de NNNN, flag desconhecida e posicional extra saem 2', async () => {
    const sb = await makeSandbox(true);
    try {
      const casos: Array<[string[], RegExp]> = [
        [[sb.setup], /--topic é obrigatório/],
        [[sb.setup, '--topic'], /--topic exige um valor/],
        [[sb.setup, '--topic', 'x', '--session', 'ABC'], /--session precisa ser NNNN \(4 dígitos\)/],
        [[sb.setup, '--topic', 'x', '--frob'], /flag desconhecida: --frob/],
        [[sb.setup, 'a', 'b', '--topic', 'x'], /argumento posicional extra: a/],
      ];
      for (const [args, msg] of casos) {
        const r = sb.script('research-new.sh', args);
        assert.equal(r.status, 2, `args: ${args.join(' ')}`);
        assert.match(r.stderr, msg);
      }
      assert.equal(sb.script('research-new.sh', ['--help']).status, 0);
    } finally {
      await sb.rm();
    }
  });

  it('setup não encontrado → exit 3; topic sem caractere aproveitável → exit 2', async () => {
    const sb = await makeSandbox(false);
    try {
      const semSetup = sb.script('research-new.sh', [path.join(sb.dir, 'nao-existe'), '--topic', 'x']);
      assert.equal(semSetup.status, 3);
      assert.match(semSetup.stderr, /nenhum setup\.json legível/);

      await sb.write(path.join('setup', 'setup.json'), '{"setup_id":"0123456789ab"}');
      const topicRuim = sb.script('research-new.sh', [sb.setup, '--topic', '!!!']);
      assert.equal(topicRuim.status, 2);
      assert.match(topicRuim.stderr, /não produz um slug utilizável/);
    } finally {
      await sb.rm();
    }
  });

  it('happy path sem fontes: researchs/0001.md com bloco de proveniência jq-legível, provenance generated_unsourced e NNNN no stdout', async () => {
    const sb = await makeSandbox(true);
    try {
      const r = sb.script('research-new.sh', [sb.setup, '--topic', 'Derivadas Parciais']);
      assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-300)}`);
      assert.equal(r.stdout.trim(), 'researchs/0001.md', 'stdout = SOMENTE o caminho relativo (§8)');
      assert.match(r.stderr, /recriei o diretório estrutural researchs\//, 'efeito em disco: researchs/ é recriado em setup vazio');

      const meta = await metaDoDestilado(sb, path.join('setup', 'researchs', '0001.md'));
      assert.equal(meta.kind, 'research');
      assert.equal(meta.research_id, '0001');
      assert.equal(meta.topic, 'derivadas-parciais', 'topic é normalizado para kebab-case (§4.2)');
      assert.deepEqual(meta.sources, []);
      assert.equal(meta.provenance, 'generated_unsourced', 'sem fontes: nunca generated_researched (o script não pesquisa)');
      assert.equal(meta.created_in_session, null, 'sem --session e sem lock: null');
      assert.equal(meta.created_at, FIXED_NOW, 'created_at honra STUDY_METHOD_NOW');
      assert.equal(meta.status, 'active');
      assert.equal(meta.verified_by_student, false);
      assert.equal(meta.disputed, false);

      const corpo = await sb.read(path.join('setup', 'researchs', '0001.md'));
      assert.match(corpo, /^# derivadas-parciais$/m, 'o título materializa o topic normalizado');
    } finally {
      await sb.rm();
    }
  });

  it('com --sources/--session: provenance student_provided, fontes RELATIVAS (absoluta dentro da raiz é relativizada) e created_in_session', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'docs', 'nota.txt'), 'material do aluno');
      const absolutaDentro = path.join(sb.setup, 'apostila.pdf');
      const r = sb.script('research-new.sh', [
        sb.setup,
        '--topic', 'Integrais',
        '--sources', `docs/nota.txt, ${absolutaDentro}`,
        '--session', '0007',
      ]);
      assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-300)}`);

      const meta = await metaDoDestilado(sb, path.join('setup', 'researchs', '0001.md'));
      assert.deepEqual(meta.sources, ['docs/nota.txt', 'apostila.pdf'], '§3.4: nenhum caminho absoluto é gravado em arquivo do setup');
      assert.equal(meta.provenance, 'student_provided', 'com fontes: o material é do aluno');
      assert.equal(meta.created_in_session, '0007');
    } finally {
      await sb.rm();
    }
  });

  it('sem --session a sessão vem do memory/.session.lock; e a sequência NNNN é monotônica', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(
        path.join('setup', 'memory', '.session.lock'),
        JSON.stringify({ pid: null, hostname: FIXTURE_HOSTNAME, session_id: '0042', started_at: FIXED_NOW }),
      );
      const primeiro = sb.script('research-new.sh', [sb.setup, '--topic', 'lock test']);
      assert.equal(primeiro.status, 0);
      assert.equal(primeiro.stdout.trim(), 'researchs/0001.md', 'topic em pt-BR vira slug kebab-case no caminho');
      const meta = await metaDoDestilado(sb, path.join('setup', 'researchs', '0001.md'));
      assert.equal(meta.created_in_session, '0042', 'a sessão é lida do lock, sem flag');

      const segundo = sb.script('research-new.sh', [sb.setup, '--topic', 'outro']);
      assert.equal(segundo.stdout.trim(), 'researchs/0002.md', 'NNNN é max+1: monotônico, nunca reaproveitado');
    } finally {
      await sb.rm();
    }
  });

  it('limite: --source absoluta FORA da raiz → exit 2 e NADA criado em disco', async () => {
    const sb = await makeSandbox(true);
    try {
      // NÃO-CRIAÇÃO nos DOIS universos: a árvore do setup E o STUDY_METHOD_HOME —
      // uma entrada de registry saindo por fora também seria rastro.
      const antes = { setup: await listarArquivos(sb.setup), home: await listarArquivos(sb.home) };
      const r = sb.script('research-new.sh', [sb.setup, '--topic', 'Fora', '--sources', '/etc/passwd']);
      assert.equal(r.status, 2);
      // [BUG research-new-fora-da-raiz-msg] a mensagem de recusa perde o caminho ofensor
      // (mostra ''): a variável é sobrescrita pela falha de sm_relpath antes do sm_die.
      // A asserção fica na parte estável da mensagem; o vazio do argumento está pinado
      // aqui como comportamento observado.
      assert.match(r.stderr, /fonte fora da raiz do setup/);
      assert.match(r.stderr, /fonte fora da raiz do setup: ''/, 'comportamento observado: o caminho recusado some da mensagem');
      assert.deepEqual(
        { setup: await listarArquivos(sb.setup), home: await listarArquivos(sb.home) },
        antes,
        'a recusa acontece ANTES de alocar: nem researchs/, nem NNNN.md, nem entrada/lock em STUDY_METHOD_HOME',
      );
    } finally {
      await sb.rm();
    }
  });
});
