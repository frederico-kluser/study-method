/**
 * cx-scripts-memory.test.ts — CARACTERIZAÇÃO de `memory-digest.sh` e `memory-compact.sh`.
 *
 * Pina o contrato de leitura da memória (docs/00-contratos.md §8 e I-28/I-29):
 *  - `memory-digest.sh` SEMPRE sai 0 quando produz digest (memória vazia, índice
 *    ausente, bruto corrompido, orçamento estourado) e a saída tem sempre as
 *    MESMAS 18 chaves de topo, na mesma ordem (I-29) — nenhuma chave some;
 *  - determinismo byte a byte com --now/--today;
 *  - `memory-compact.sh`: gatilho de 15 (só age com --if-due acima do limiar),
 *    resumo JSON de saída, e o protocolo REQUEST/APPLY do §6 — exit 10 com
 *    envelope bem formado, RA-1 (nada escrito na fase de PEDIDO), request_id
 *    reprodutível e RA-2 (request_id divergente → exit 5).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import { makeSandbox, FIXED_NOW, FIXED_TODAY, setupJson } from './cx-scripts-fixtures/harness';

/** As 18 chaves de topo do digest, NA ORDEM (I-29 — esperar 19 reprova digest correto). */
const DIGEST_KEYS = [
  'schema_version',
  'generated_at',
  'for_session_id',
  'memory_state',
  'topics_in_focus',
  'topics_source',
  'full_detail_available',
  'student',
  'recent_sessions',
  'recent_affect',
  'student_profile',
  'procedural_playbook',
  'orphan_sessions',
  'pending_followups',
  'truncated',
  'truncated_fields',
  'budget_exceeded',
  'errors',
];

const SESSAO_BRUTA = JSON.stringify(
  {
    schema_version: '1.0',
    session_id: '0001',
    date: '2026-01-10',
    status: 'completed',
    started_at: '2026-01-10T10:00:00-03:00',
    ended_at: '2026-01-10T11:00:00-03:00',
    topics: ['limites'],
    one_line_summary: 'Estudamos limites.',
    skills_observed: [],
    how_it_happened: [{ target_topic: 'limites', move_type: 'analogy', outcome: 'unlocked', what: 'analogia de cerca' }],
    what_worked: 'analogia funcionou',
    what_didnt_work: null,
    open_questions: [],
    next_steps: [],
    affect: null,
    finalized_by: 'student',
  },
  null,
  2,
);

const INDEX_COM_SESSAO = JSON.stringify(
  {
    schema_version: '1.0',
    generated_at: FIXED_NOW,
    sessions: [
      {
        session_id: '0001',
        file: 'memory/0001.json',
        date: '2026-01-10',
        status: 'completed',
        topics: ['limites'],
        skills_touched: [],
        one_line_summary: 'Estudamos limites.',
        affect: null,
        flags: [],
        digest_eligible: true,
        compacted_at: null,
        cross_setup_refs: [],
      },
    ],
  },
  null,
  2,
);

describe('memory-digest.sh — digest determinístico de forma fixa (I-28/I-29)', () => {
  it('uso incorreto: flag desconhecida, flag sem valor, budget não-inteiro e posicional extra saem 2', async () => {
    const sb = await makeSandbox(true);
    for (const args of [
      ['--frobnicate'],
      ['--topics'],
      ['--budget-chars', 'abc'],
      ['um', 'dois'],
    ]) {
      const r = sb.script('memory-digest.sh', [sb.setup, ...args]);
      assert.equal(r.status, 2, `args: ${args.join(' ')}`);
    }
    const help = sb.script('memory-digest.sh', ['--help']);
    assert.equal(help.status, 0);
    await sb.rm();
  });

  it('setup não encontrado → exit 3, nada em stdout', async () => {
    const sb = await makeSandbox(false);
    const r = sb.script('memory-digest.sh', [path.join(sb.dir, 'nao-existe')]);
    assert.equal(r.status, 3);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /study-method: erro 3:/);
    await sb.rm();
  });

  it('setup sem memory/: exit 0, memory_state first_session e as 18 chaves na ordem', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('memory-digest.sh', [sb.setup, '--now', FIXED_NOW, '--today', FIXED_TODAY]);
    assert.equal(r.status, 0, 'falha de memória NUNCA impede a aula de começar');
    const digest = JSON.parse(r.stdout) as Record<string, unknown>;
    assert.deepEqual(Object.keys(digest), DIGEST_KEYS);
    assert.equal(digest.memory_state, 'first_session');
    assert.equal(digest.generated_at, FIXED_NOW, 'generated_at honra --now');
    await sb.rm();
  });

  it('determinismo: mesma entrada + mesmos --now/--today ⇒ saída byte a byte igual', async () => {
    const sb = await makeSandbox(true);
    const args = [sb.setup, '--now', FIXED_NOW, '--today', FIXED_TODAY];
    const a = sb.script('memory-digest.sh', args);
    const b = sb.script('memory-digest.sh', args);
    assert.equal(a.status, 0);
    assert.equal(a.stdout, b.stdout, 'o digest é determinístico byte a byte');
    await sb.rm();
  });

  it('bruto corrompido: exit 0, forma fixa preservada, errors[] nomeia o que não parseia, state degraded', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'memory'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'memory', '0001.json'), '{broken', 'utf8');
    const r = sb.script('memory-digest.sh', [sb.setup, '--now', FIXED_NOW, '--today', FIXED_TODAY]);
    assert.equal(r.status, 0, 'bruto corrompido não é erro de execução');
    const digest = JSON.parse(r.stdout) as { memory_state: string; errors: Array<{ kind: string; session_id?: string }> };
    assert.deepEqual(Object.keys(digest as unknown as Record<string, unknown>), DIGEST_KEYS);
    assert.equal(digest.memory_state, 'degraded');
    assert.ok(
      digest.errors.some((e) => e.kind === 'session_unparseable' && e.session_id === '0001'),
      `errors[] nomeia a sessão corrompida: ${JSON.stringify(digest.errors)}`,
    );
    await sb.rm();
  });

  it('índice/perfil ausentes com bruto presente: errors[] registra index_missing/profile_missing e o digest sai', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'memory'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'memory', '0001.json'), SESSAO_BRUTA, 'utf8');
    const r = sb.script('memory-digest.sh', [sb.setup, '--now', FIXED_NOW, '--today', FIXED_TODAY]);
    assert.equal(r.status, 0);
    const digest = JSON.parse(r.stdout) as { errors: Array<{ kind: string }> };
    const kinds = digest.errors.map((e) => e.kind);
    assert.ok(kinds.includes('index_missing'), `errors: ${kinds.join(',')}`);
    assert.ok(kinds.includes('profile_missing'), `errors: ${kinds.join(',')}`);
    await sb.rm();
  });

  it('orçamento estourado (--budget-chars minúsculo): exit 0 e forma fixa — nunca falha por truncar', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('memory-digest.sh', [sb.setup, '--now', FIXED_NOW, '--today', FIXED_TODAY, '--budget-chars', '10']);
    assert.equal(r.status, 0);
    const digest = JSON.parse(r.stdout) as Record<string, unknown>;
    assert.deepEqual(Object.keys(digest), DIGEST_KEYS);
    await sb.rm();
  });
});

describe('memory-compact.sh — gatilho, resumo e protocolo REQUEST/APPLY (§6)', () => {
  it('memory/ ausente: exit 0 com resumo zerado (nada a compactar é sucesso)', async () => {
    const sb = await makeSandbox(true);
    const r = sb.script('memory-compact.sh', [sb.setup, '--if-due']);
    assert.equal(r.status, 0);
    const resumo = JSON.parse(r.stdout) as Record<string, number>;
    assert.deepEqual(resumo, { sessions_compacted: 0, facts_created: 0, facts_superseded: 0, facts_reconfirmed: 0 });
    await sb.rm();
  });

  it('uso incorreto: --apply sem arquivo, flag desconhecida e posicional extra saem 2', async () => {
    const sb = await makeSandbox(true);
    for (const args of [['--apply'], ['--frob'], ['um', 'dois']]) {
      const r = sb.script('memory-compact.sh', [sb.setup, ...args]);
      assert.equal(r.status, 2, `args: ${args.join(' ')}`);
    }
    const help = sb.script('memory-compact.sh', ['--help']);
    assert.equal(help.status, 0);
    await sb.rm();
  });

  it('memory/ sem INDEX.json: exit 1 nomeando o remédio (rodar memory-index.sh --verify)', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'memory'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'memory', '0001.json'), SESSAO_BRUTA, 'utf8');
    const r = sb.script('memory-compact.sh', [sb.setup, '--force']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /INDEX\.json ausente/);
    await sb.rm();
  });

  it('profile.json malformado: exit 5 e recusa explícita de sobrescrever memória de longo prazo', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'memory'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'memory', '0001.json'), SESSAO_BRUTA, 'utf8');
    await fsp.writeFile(path.join(sb.setup, 'memory', 'INDEX.json'), INDEX_COM_SESSAO, 'utf8');
    await fsp.writeFile(path.join(sb.setup, 'memory', 'profile.json'), '{broken', 'utf8');
    const r = sb.script('memory-compact.sh', [sb.setup, '--force']);
    assert.equal(r.status, 5);
    assert.match(r.stderr, /profile\.json não parseia/);
    await sb.rm();
  });

  it('setup_id inválido: exit 5 (o pedido não pode nascer sem o id de 12 hex)', async () => {
    const sb = await makeSandbox(false);
    await fsp.mkdir(path.join(sb.setup, 'memory'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'setup.json'), setupJson({ setup_id: 'INVALIDO' }), 'utf8');
    await fsp.writeFile(path.join(sb.setup, 'memory', '0001.json'), SESSAO_BRUTA, 'utf8');
    await fsp.writeFile(path.join(sb.setup, 'memory', 'INDEX.json'), INDEX_COM_SESSAO, 'utf8');
    const r = sb.script('memory-compact.sh', [sb.setup, '--force']);
    assert.equal(r.status, 5);
    assert.match(r.stderr, /setup_id/);
    await sb.rm();
  });

  it('--if-due abaixo do limiar de 15: exit 0 com resumo zerado (não faz nada e é sucesso)', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'memory'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'memory', '0001.json'), SESSAO_BRUTA, 'utf8');
    await fsp.writeFile(path.join(sb.setup, 'memory', 'INDEX.json'), INDEX_COM_SESSAO, 'utf8');
    const r = sb.script('memory-compact.sh', [sb.setup, '--if-due']);
    assert.equal(r.status, 0);
    const resumo = JSON.parse(r.stdout) as Record<string, number>;
    assert.equal(resumo.sessions_compacted, 0);
    assert.equal(resumo.facts_created, 0);
    await sb.rm();
  });

  it('fase PEDIDO (--force): exit 10 + envelope §6.1 bem formado, e RA-1 não escreve NADA em disco', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'memory'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'memory', '0001.json'), SESSAO_BRUTA, 'utf8');
    await fsp.writeFile(path.join(sb.setup, 'memory', 'INDEX.json'), INDEX_COM_SESSAO, 'utf8');

    const antes = await listarArquivos(sb.setup);
    const r = sb.script('memory-compact.sh', [sb.setup, '--force']);
    assert.equal(r.status, 10, 'needs_model_input é o único caminho do pedido');
    const envelope = JSON.parse(r.stdout) as Record<string, unknown>;
    assert.deepEqual(Object.keys(envelope).sort(), [
      'generated_at',
      'instructions_pt_br',
      'kind',
      'payload',
      'protocol',
      'protocol_version',
      'request_id',
      'response_schema',
      'script',
      'setup_id',
    ]);
    assert.equal(envelope.protocol, 'study-method/request-apply');
    assert.equal(envelope.protocol_version, '1.0');
    assert.equal(envelope.kind, 'compact_facts');
    assert.equal(envelope.script, 'memory-compact.sh');
    assert.equal(envelope.setup_id, '0123456789ab');
    assert.match(String(envelope.request_id), /^[a-f0-9]{12}$/, 'request_id = 12 hex do sha256 do payload canônico');
    assert.match(String(envelope.response_schema), /^urn:study-method:schema:/);
    const payload = envelope.payload as { request_kind: string };
    assert.equal(payload.request_kind, 'memory_compact');

    // RA-1: a fase de PEDIDO não escreve nada — nem lock, nem tmp, nem log
    assert.deepEqual(await listarArquivos(sb.setup), antes, 'RA-1: nada escrito na fase de PEDIDO');
    await sb.rm();
  });

  it('reprodutibilidade: dois PEDIDOS sobre o mesmo estado têm o mesmo request_id (§6.1)', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'memory'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'memory', '0001.json'), SESSAO_BRUTA, 'utf8');
    await fsp.writeFile(path.join(sb.setup, 'memory', 'INDEX.json'), INDEX_COM_SESSAO, 'utf8');
    const a = sb.script('memory-compact.sh', [sb.setup, '--force']);
    const b = sb.script('memory-compact.sh', [sb.setup, '--force']);
    const ridA = (JSON.parse(a.stdout) as { request_id: string }).request_id;
    const ridB = (JSON.parse(b.stdout) as { request_id: string }).request_id;
    assert.equal(ridA, ridB, 'sem relógio no payload, o id é estável sobre o mesmo estado');
    await sb.rm();
  });

  it('RA-2/RESP-4: --apply com request_id divergente ou kind divergente → exit 5, nada aplicado', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'memory'), { recursive: true });
    await fsp.writeFile(path.join(sb.setup, 'memory', '0001.json'), SESSAO_BRUTA, 'utf8');
    await fsp.writeFile(path.join(sb.setup, 'memory', 'INDEX.json'), INDEX_COM_SESSAO, 'utf8');

    const pedido = JSON.parse(sb.script('memory-compact.sh', [sb.setup, '--force']).stdout) as { request_id: string };
    const respostaRuim = await sb.write(
      'resposta-rid-errado.json',
      JSON.stringify({
        protocol: 'study-method/request-apply',
        protocol_version: '1.0',
        request_id: '000000000000',
        kind: 'compact_facts',
        items: [],
      }),
    );
    const ridErrado = sb.script('memory-compact.sh', [sb.setup, '--apply', respostaRuim]);
    assert.equal(ridErrado.status, 5, 'RA-2: estado mudou (ou resposta alheia) nunca é aplicado');
    assert.match(ridErrado.stderr, /request_id divergente/);
    assert.notEqual(pedido.request_id, '000000000000');

    const respostaKindErrado = await sb.write(
      'resposta-kind-errado.json',
      JSON.stringify({
        protocol: 'study-method/request-apply',
        protocol_version: '1.0',
        request_id: pedido.request_id,
        kind: 'select_sections',
        items: [],
      }),
    );
    const kindErrado = sb.script('memory-compact.sh', [sb.setup, '--apply', respostaKindErrado]);
    assert.equal(kindErrado.status, 5, 'RESP-4: confundir kind de envelope com request_kind é exit 5');

    const respostaAusente = sb.script('memory-compact.sh', [sb.setup, '--apply', path.join(sb.dir, 'nao-existe.json')]);
    assert.equal(respostaAusente.status, 2, 'arquivo de resposta ausente é uso incorreto');
    await sb.rm();
  });
});

async function listarArquivos(raiz: string): Promise<string[]> {
  const achados: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else achados.push(path.relative(raiz, p));
    }
  }
  await walk(raiz);
  return achados.sort();
}
