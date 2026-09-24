/**
 * cx-scripts-gaps-memory-index.test.ts — CARACTERIZAÇÃO de `memory-index.sh`
 * (camada 2 da memória — docs/00-contratos.md §2 passo 3/9, §5 exit codes,
 * §7 escrita atômica + predicado único de lock, §8 tabela de CLI; docs/03 §2.1 e §7.3).
 *
 * Pina o comportamento OBSERVÁVEL pela fronteira pública (exit · stdout/stderr · disco):
 *  - o índice é DERIVADO: cada entrada sai mecanicamente do `memory/NNNN.json`
 *    (file, topics, skills_touched, flags, one_line_summary truncado em 160);
 *  - resumo JSON `{sessions, orphans_closed, quarantined, rebuilt}` em stdout;
 *  - bruto ilegível OU com `session_id` != nome do arquivo vai para
 *    `memory/broken/` (MOVE, nunca apaga) e aparece em `quarantined[]`;
 *  - `--verify` é o DONO da recuperação automática de órfã (in_progress sem lock
 *    vivo → `abandoned` + `finalized_by: "auto_orphan_recovery"`); sem `--verify`
 *    nada é tocado;
 *  - a decisão de lock é a de `sm_session_lock_alive` (§7.4): lock da via (b)
 *    (`pid: null` + `started_at` dentro do TTL) é VIVO e a sessão em andamento
 *    NÃO pode ser fechada como órfã — a regressão que §7.4 corrigiu.
 *
 * Nenhum teste lê o interior dos scripts: só `bash <script>` e observação.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { makeSandbox, FIXED_NOW, FIXTURE_HOSTNAME } from './cx-scripts-fixtures/harness';

const SESSAO_0001 = JSON.stringify(
  {
    schema_version: '1.0',
    session_id: '0001',
    date: '2026-01-10',
    status: 'completed',
    started_at: '2026-01-10T10:00:00-03:00',
    topics: ['limites'],
    one_line_summary: 'Estudamos limites.',
    skills_observed: [{ skill: 'analogy' }],
    how_it_happened: [{ target_topic: 'limites', move_type: 'analogy', outcome: 'unlocked', what: 'analogia de cerca' }],
    open_questions: ['o que acontece em 0/0?'],
    next_steps: [],
    affect: null,
    finalized_by: 'student',
    cross_setup_refs: [],
  },
  null,
  2,
);

const SESSAO_0002 = JSON.stringify(
  {
    schema_version: '1.0',
    session_id: '0002',
    date: '2026-01-11',
    status: 'in_progress',
    started_at: '2026-01-11T10:00:00-03:00',
    topics: [],
    one_line_summary: 'Sessão em andamento: derivadas.',
    skills_observed: [],
    how_it_happened: [{ target_topic: 'derivadas', move_type: 'drill', outcome: 'backfired', what: 'exercício cedo demais' }],
    open_questions: [],
    next_steps: ['refazer o exercício 3'],
    affect: null,
  },
  null,
  2,
);

describe('memory-index.sh — índice derivado, quarentena e recuperação de órfã (§8, docs/03 §2.1/§7.3)', () => {
  it('uso incorreto: flag desconhecida e posicional extra saem 2 com a usage em stderr; --help sai 0', async () => {
    const sb = await makeSandbox(true);
    try {
      const frob = sb.script('memory-index.sh', [sb.setup, '--frob']);
      assert.equal(frob.status, 2);
      assert.match(frob.stderr, /flag desconhecida: --frob/);
      assert.match(frob.stderr, /uso: memory-index\.sh/);

      const extra = sb.script('memory-index.sh', [sb.setup, 'a', 'b']);
      assert.equal(extra.status, 2);
      assert.match(extra.stderr, /argumento posicional extra: a/);

      assert.equal(sb.script('memory-index.sh', ['--help']).status, 0);
    } finally {
      await sb.rm();
    }
  });

  it('setup não encontrado → exit 3', async () => {
    const sb = await makeSandbox(false);
    try {
      const r = sb.script('memory-index.sh', [path.join(sb.dir, 'nao-existe')]);
      assert.equal(r.status, 3);
      assert.match(r.stderr, /nenhum setup\.json legível a partir de/);
    } finally {
      await sb.rm();
    }
  });

  it('setup sem memory/: exit 0 com o resumo zerado — nada a indexar é sucesso', async () => {
    const sb = await makeSandbox(true);
    try {
      const r = sb.script('memory-index.sh', [sb.setup]);
      assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-300)}`);
      assert.deepEqual(JSON.parse(r.stdout), { sessions: 0, orphans_closed: 0, quarantined: [], rebuilt: false });
    } finally {
      await sb.rm();
    }
  });

  it('happy path: INDEX.json derivado campo a campo dos brutos (§2.1) com flags, skills_touched e estado de compactação', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'memory', '0001.json'), SESSAO_0001);
      await sb.write(path.join('setup', 'memory', '0002.json'), SESSAO_0002);

      const r = sb.script('memory-index.sh', [sb.setup]);
      assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-300)}`);
      assert.deepEqual(JSON.parse(r.stdout), { sessions: 2, orphans_closed: 0, quarantined: [], rebuilt: true });

      const indice = JSON.parse(await sb.read(path.join('setup', 'memory', 'INDEX.json'))) as Record<string, any>;
      assert.equal(indice.schema_version, '1.0');
      assert.equal(indice.updated_at, FIXED_NOW, 'updated_at honra STUDY_METHOD_NOW');
      const entradas = indice.sessions as Array<Record<string, any>>;
      assert.equal(entradas.length, 2);

      const e1 = entradas.find((e) => e.session_id === '0001');
      assert.ok(e1);
      assert.equal(e1.file, 'memory/0001.json');
      assert.equal(e1.date, '2026-01-10');
      assert.equal(e1.status, 'completed');
      assert.deepEqual(e1.topics, ['limites']);
      assert.deepEqual(e1.skills_touched, ['analogy'], 'skills_touched = skills_observed[].skill únicos');
      assert.equal(e1.one_line_summary, 'Estudamos limites.');
      assert.deepEqual(e1.flags.sort(), ['has_open_questions', 'has_unlock'], 'flags derivadas da evidência');
      assert.equal(e1.digest_eligible, true);
      assert.equal(e1.compacted_at, null);

      const e2 = entradas.find((e) => e.session_id === '0002');
      assert.ok(e2);
      assert.deepEqual(e2.flags.sort(), ['has_backfire', 'has_next_steps']);
      assert.equal(e2.status, 'in_progress', 'sem --verify o índice SÓ espelha: não fecha nada');
    } finally {
      await sb.rm();
    }
  });

  it('quarentena: bruto ilegível e session_id != nome do arquivo vão para memory/broken/ (MOVE, nunca apaga) e saem em quarantined[]', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'memory', '0001.json'), SESSAO_0001);
      await sb.write(path.join('setup', 'memory', '0003.json'), '{broken');
      await sb.write(path.join('setup', 'memory', '0004.json'), '{"session_id":"9999"}');

      const r = sb.script('memory-index.sh', [sb.setup, '--rebuild']);
      assert.equal(r.status, 0, 'bruto quebrado não é erro de execução');
      assert.deepEqual(JSON.parse(r.stdout), { sessions: 1, orphans_closed: 0, quarantined: ['0003', '0004'], rebuilt: true });
      assert.match(r.stderr, /bruto em quarentena \(não parseia\): 0003/);
      assert.match(r.stderr, /session_id '9999' != nome do arquivo/);

      assert.equal(await sb.exists(path.join('setup', 'memory', '0003.json')), false);
      assert.equal(await sb.exists(path.join('setup', 'memory', '0004.json')), false);
      assert.equal(await sb.exists(path.join('setup', 'memory', 'broken', '0003.json')), true);
      assert.equal(await sb.exists(path.join('setup', 'memory', 'broken', '0004.json')), true);
    } finally {
      await sb.rm();
    }
  });

  it('--verify recupera a órfã (in_progress sem lock) como abandoned/auto_orphan_recovery; SEM --verify nada é tocado', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'memory', '0002.json'), SESSAO_0002);

      const semVerify = sb.script('memory-index.sh', [sb.setup]);
      assert.equal(semVerify.status, 0);
      assert.equal((JSON.parse(semVerify.stdout) as { orphans_closed: number }).orphans_closed, 0);
      assert.match(await sb.read(path.join('setup', 'memory', '0002.json')), /"status": "in_progress"/, 'sem --verify o índice não fecha sessão nenhuma');

      const verify = sb.script('memory-index.sh', [sb.setup, '--verify']);
      assert.equal(verify.status, 0);
      assert.equal((JSON.parse(verify.stdout) as { orphans_closed: number }).orphans_closed, 1);
      const sessao = JSON.parse(await sb.read(path.join('setup', 'memory', '0002.json'))) as Record<string, any>;
      assert.equal(sessao.status, 'abandoned');
      assert.equal(sessao.finalized_by, 'auto_orphan_recovery');
      assert.equal(sessao.one_line_summary, 'Sessão interrompida sem fechamento (recuperada automaticamente).', 'o provisório é substituído; o resto do conteúdo é preservado');
      assert.deepEqual(sessao.next_steps, ['refazer o exercício 3'], 'docs/01 §4.1: nada é perdido nem inventado');
    } finally {
      await sb.rm();
    }
  });

  it('§7.4 regressão: lock VIVO da via (b) (pid null + started_at dentro do TTL) mantém a sessão em andamento INTOCADA', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'memory', '0005.json'), SESSAO_0002.replace('"0002"', '"0005"'));
      await sb.write(
        path.join('setup', 'memory', '.session.lock'),
        JSON.stringify({ pid: null, hostname: FIXTURE_HOSTNAME, session_id: '0005', started_at: FIXED_NOW }),
      );

      const r = sb.script('memory-index.sh', [sb.setup, '--verify']);
      assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-300)}`);
      assert.equal((JSON.parse(r.stdout) as { orphans_closed: number }).orphans_closed, 0, 'a sessão EM ANDAMENTO nunca vira órfã');
      assert.match(r.stderr, /sessão 0005 está viva .* — não toco/);
      assert.match(await sb.read(path.join('setup', 'memory', '0005.json')), /"status": "in_progress"/);
      assert.equal(await sb.exists(path.join('setup', 'memory', '.session.lock')), true, 'lock vivo não é removido');
    } finally {
      await sb.rm();
    }
  });

  it('lock MORTO (TTL expirado): a órfã é recuperada e o lock morto é removido, anunciado em stderr', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'memory', '0005.json'), SESSAO_0002.replace('"0002"', '"0005"'));
      await sb.write(
        path.join('setup', 'memory', '.session.lock'),
        JSON.stringify({ pid: null, hostname: FIXTURE_HOSTNAME, session_id: '0005', started_at: '2020-01-01T10:00:00-03:00' }),
      );

      const r = sb.script('memory-index.sh', [sb.setup, '--verify']);
      assert.equal(r.status, 0);
      assert.equal((JSON.parse(r.stdout) as { orphans_closed: number }).orphans_closed, 1);
      const sessao = JSON.parse(await sb.read(path.join('setup', 'memory', '0005.json'))) as Record<string, any>;
      assert.equal(sessao.status, 'abandoned');
      assert.equal(sessao.finalized_by, 'auto_orphan_recovery');
      assert.match(r.stderr, /lock morto removido: memory\/\.session\.lock/);
      assert.equal(await sb.exists(path.join('setup', 'memory', '.session.lock')), false);
    } finally {
      await sb.rm();
    }
  });
});
