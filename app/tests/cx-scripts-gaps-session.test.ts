/**
 * cx-scripts-gaps-session.test.ts — CARACTERIZAÇÃO de `session-new.sh` e `session-close.sh`
 * (passos `open_session` e `close_session` — docs/00-contratos.md §2 passos 5 e 9,
 * §5 exit codes, §6 REQUEST/APPLY, §7 escrita atômica + lock, §8 tabela de CLI).
 *
 * Pina o comportamento OBSERVÁVEL pela fronteira pública (exit · stdout/stderr · disco):
 *  - `session-new.sh`: aloca o NNNN monotônico, grava `memory/NNNN.json` com
 *    `status: "in_progress"` e toma `memory/.session.lock` (via (b) do §7.4:
 *    `pid: null` + TTL); sessão concorrente é exit 4 e NÃO queima número;
 *  - `session-close.sh`: fecha com `status: "completed"`/`finalized_by: "student"`,
 *    remove o lock, atualiza `setup.json` e encadeia os derivados (INDEX.json,
 *    progress.json, README.md — §2 passo 9);
 *  - protocolo REQUEST/APPLY (§6): resumo provisório → exit 10 com o envelope
 *    `fill_session_fields` e RA-1 (nada escrito em disco); `--apply` com o
 *    request_id certo aplica os valores; request_id divergente é RA-2 → exit 5;
 *  - `--recover` é a porta manual de fechamento de órfã (`abandoned` +
 *    `auto_orphan_recovery`), sem inventar conteúdo (docs/01 §4.1).
 *
 * Nenhum teste lê o interior dos scripts: só `bash <script>` e observação.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import { makeSandbox, FIXED_NOW, FIXED_TODAY, FIXTURE_HOSTNAME } from './cx-scripts-fixtures/harness';

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

/** Sessão in_progress já com o resumo REAL (o que o modelo escreve durante o fechamento). */
const SESSAO_COM_RESUMO = JSON.stringify(
  {
    schema_version: '1.0',
    session_id: '0001',
    setup_id: '0123456789ab',
    date: FIXED_TODAY,
    started_at: FIXED_NOW,
    status: 'in_progress',
    one_line_summary: 'Praticamos limites com escada de dicas.',
    topics: ['limites'],
    goal: 'entender limites',
    plan: null,
    artifacts: [],
    cross_setup_refs: [],
    validation_errors: [],
  },
  null,
  2,
);

/** Sessão in_progress com o resumo PROVISÓRIO da abertura — dispara o PEDIDO (§6). */
const SESSAO_PROVISORIA = JSON.stringify(
  {
    schema_version: '1.0',
    session_id: '0001',
    setup_id: '0123456789ab',
    date: FIXED_TODAY,
    started_at: FIXED_NOW,
    status: 'in_progress',
    one_line_summary: 'Sessão em andamento: derivadas.',
    goal: 'derivadas',
    plan: null,
    artifacts: [],
    cross_setup_refs: [],
    validation_errors: [],
  },
  null,
  2,
);

describe('session-new.sh — alocação da sessão e lock (§2 passo 5, §8)', () => {
  it('uso incorreto: flag desconhecida, --goal sem valor e posicional extra saem 2; --help sai 0', async () => {
    const sb = await makeSandbox(true);
    try {
      const frob = sb.script('session-new.sh', [sb.setup, '--frob']);
      assert.equal(frob.status, 2);
      assert.match(frob.stderr, /flag desconhecida: --frob/);

      const goalVazio = sb.script('session-new.sh', [sb.setup, '--goal']);
      assert.equal(goalVazio.status, 2);
      assert.match(goalVazio.stderr, /--goal exige um valor/);

      const extra = sb.script('session-new.sh', [sb.setup, 'a', 'b']);
      assert.equal(extra.status, 2);
      assert.match(extra.stderr, /argumento posicional extra: a/);

      assert.equal(sb.script('session-new.sh', ['--help']).status, 0);
    } finally {
      await sb.rm();
    }
  });

  it('setup não encontrado → exit 3 com stdout vazio (§5.1)', async () => {
    const sb = await makeSandbox(false);
    try {
      const r = sb.script('session-new.sh', [path.join(sb.dir, 'nao-existe')]);
      assert.equal(r.status, 3);
      assert.equal(r.stdout, '');
      assert.match(r.stderr, /nenhum setup\.json legível/);
    } finally {
      await sb.rm();
    }
  });

  it('happy path: NNNN em stdout, memory/NNNN.json in_progress com datas fixas e memory/.session.lock da via (b)', async () => {
    const sb = await makeSandbox(true);
    try {
      const r = sb.script('session-new.sh', [sb.setup, '--goal', 'entender limites']);
      assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-300)}`);
      assert.equal(r.stdout.trim(), '0001', 'stdout = SOMENTE o NNNN alocado (§8)');
      assert.match(r.stderr, /recriei o diretório estrutural memory\//, 'setup vazio: memory/ é recriado (estrutura, não conteúdo)');

      const sessao = JSON.parse(await sb.read(path.join('setup', 'memory', '0001.json'))) as Record<string, unknown>;
      assert.equal(sessao.session_id, '0001', 'session_id == nome do arquivo (docs/03 §2)');
      assert.equal(sessao.setup_id, '0123456789ab');
      assert.equal(sessao.date, FIXED_TODAY, 'date honra STUDY_METHOD_TODAY');
      assert.equal(sessao.started_at, FIXED_NOW, 'started_at honra STUDY_METHOD_NOW');
      assert.equal(sessao.status, 'in_progress');
      assert.equal(sessao.one_line_summary, 'Sessão em andamento: entender limites', '--goal vira o resumo provisório');
      assert.equal(sessao.goal, 'entender limites');

      const lock = JSON.parse(await sb.read(path.join('setup', 'memory', '.session.lock'))) as Record<string, unknown>;
      assert.equal(lock.pid, null, 'via (b) do §7.4: sem dono declarado, pid null + TTL');
      assert.equal(lock.hostname, FIXTURE_HOSTNAME);
      assert.equal(lock.session_id, '0001', 'o lock grava o NNNN que acabou de nascer');
      assert.equal(lock.started_at, FIXED_NOW);
    } finally {
      await sb.rm();
    }
  });

  it('lock vivo → exit 4 e NENHUM NNNN é alocado (a sonda é antes da alocação); sem lock, a sequência é monotônica', async () => {
    const sb = await makeSandbox(true);
    try {
      assert.equal(sb.script('session-new.sh', [sb.setup]).status, 0);
      const antes = await listarArquivos(path.join(sb.setup, 'memory'));

      const concorrente = sb.script('session-new.sh', [sb.setup]);
      assert.equal(concorrente.status, 4);
      assert.match(concorrente.stderr, /já há uma sessão viva neste setup \(session_id 0001/);
      assert.deepEqual(await listarArquivos(path.join(sb.setup, 'memory')), antes, 'nada criado: nem NNNN.json vazio, nem número queimado');

      await fsp.rm(path.join(sb.setup, 'memory', '.session.lock'));
      const proxima = sb.script('session-new.sh', [sb.setup]);
      assert.equal(proxima.status, 0);
      assert.equal(proxima.stdout.trim(), '0002', 'NNNN é max+1: monotônico, nunca reaproveitado');
    } finally {
      await sb.rm();
    }
  });

  it('limite: setup.json malformado não bloqueia a abertura — a sessão nasce SEM setup_id (comportamento observado)', async () => {
    // [BUG? session-new-setup-json-malformado] sm_setup_root exige só que setup.json seja
    // LEGÍVEL; com JSON inválido o script segue e grava a sessão sem a chave setup_id
    // (o schema exige ^[0-9a-f]{12}$ apenas quando a chave existe). Pinado como está.
    const sb = await makeSandbox(false);
    try {
      await sb.write(path.join('setup', 'setup.json'), '{broken');
      const r = sb.script('session-new.sh', [sb.setup]);
      assert.equal(r.status, 0, 'comportamento observado: abre sessão mesmo com manifesto ilegível');
      const sessao = JSON.parse(await sb.read(path.join('setup', 'memory', '0001.json'))) as Record<string, unknown>;
      assert.equal(sessao.session_id, '0001');
      assert.equal('setup_id' in sessao, false, 'sem setup_id legível, a chave é removida (schema a trata como opcional)');
    } finally {
      await sb.rm();
    }
  });
});

describe('session-close.sh — fechamento, derivados e protocolo REQUEST/APPLY (§2 passo 9, §6)', () => {
  it('uso incorreto: --session/--recover fora de NNNN, --recover+--apply, flag desconhecida e posicional extra saem 2', async () => {
    const sb = await makeSandbox(true);
    try {
      const casos: Array<[string[], RegExp]> = [
        [[sb.setup, '--session', 'ABC'], /--session precisa ser NNNN/],
        [[sb.setup, '--recover', 'ABC'], /--recover precisa ser NNNN/],
        [[sb.setup, '--recover', '0001', '--apply', 'x.json'], /--recover e --apply são mutuamente exclusivos/],
        [[sb.setup, '--frob'], /flag desconhecida: --frob/],
        [[sb.setup, 'a', 'b'], /argumento posicional extra: a/],
      ];
      for (const [args, msg] of casos) {
        const r = sb.script('session-close.sh', args);
        assert.equal(r.status, 2, `args: ${args.join(' ')}`);
        assert.match(r.stderr, msg);
      }
      assert.equal(sb.script('session-close.sh', ['--help']).status, 0);
    } finally {
      await sb.rm();
    }
  });

  it('setup não encontrado → 3; sem sessão in_progress em memory/ → 2 nomeando o remédio (--session)', async () => {
    const sb = await makeSandbox(false);
    try {
      const semSetup = sb.script('session-close.sh', [path.join(sb.dir, 'nao-existe')]);
      assert.equal(semSetup.status, 3);

      await sb.write(path.join('setup', 'setup.json'), '{"setup_id":"0123456789ab"}');
      await sb.write(path.join('setup', 'memory', '0001.json'), SESSAO_PROVISORIA.replace('in_progress', 'completed'));
      const nada = sb.script('session-close.sh', [sb.setup]);
      assert.equal(nada.status, 2);
      assert.match(nada.stderr, /nenhuma sessão in_progress em memory\//);
    } finally {
      await sb.rm();
    }
  });

  it('happy path: completed + finalized_by student, lock removido, setup.json atualizado e os derivados encadeados nascem', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'memory', '0001.json'), SESSAO_COM_RESUMO);
      await sb.write(
        path.join('setup', 'memory', '.session.lock'),
        JSON.stringify({ pid: null, hostname: FIXTURE_HOSTNAME, session_id: '0001', started_at: FIXED_NOW }),
      );

      const r = sb.script('session-close.sh', [sb.setup]);
      assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-300)}`);
      assert.equal(r.stdout.trim(), '0001', 'stdout = SOMENTE o NNNN fechado (§8)');

      const sessao = JSON.parse(await sb.read(path.join('setup', 'memory', '0001.json'))) as Record<string, unknown>;
      assert.equal(sessao.status, 'completed', 'único ponto onde status deixa de ser in_progress');
      assert.equal(sessao.finalized_at, FIXED_NOW);
      assert.equal(sessao.finalized_by, 'student');
      assert.equal(sessao.one_line_summary, 'Praticamos limites com escada de dicas.', 'resumo real é preservado');

      assert.equal(await sb.exists(path.join('setup', 'memory', '.session.lock')), false, 'o lock é removido no fechamento');

      const manifest = JSON.parse(await sb.read(path.join('setup', 'setup.json'))) as Record<string, unknown>;
      assert.equal(manifest.session_count, 1);
      assert.equal(manifest.last_session_at, FIXED_NOW);

      // derivados do passo 9 (§2): session-close encadeia memory-index, progress-update
      // --recompute, readme-sync e memory-compact --if-due
      assert.equal(await sb.exists(path.join('setup', 'memory', 'INDEX.json')), true, 'memory-index.sh encadeado');
      assert.equal(await sb.exists(path.join('setup', 'memory', 'progress.json')), true, 'progress-update.sh --recompute encadeado');
      assert.equal(await sb.exists(path.join('setup', 'README.md')), true, 'readme-sync.sh encadeado');
    } finally {
      await sb.rm();
    }
  });

  it('fase PEDIDO: resumo provisório → exit 10 com envelope fill_session_fields, e RA-1 não escreve NADA em disco', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'memory', '0001.json'), SESSAO_PROVISORIA);
      // RA-1 cobre os DOIS universos: a árvore de trabalho (cwd/sandbox) e o
      // STUDY_METHOD_HOME — escrita em registry/lock do home também é rastro.
      const antes = { dir: await listarArquivos(sb.dir), home: await listarArquivos(sb.home) };

      const r = sb.script('session-close.sh', [sb.setup]);
      assert.equal(r.status, 10, 'needs_model_input é o único caminho do pedido (§5.1)');
      const envelope = JSON.parse(r.stdout) as Record<string, any>;
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
      assert.equal(envelope.kind, 'fill_session_fields', 'kind do ENVELOPE (§6.5)');
      assert.equal(envelope.script, 'session-close.sh');
      assert.match(String(envelope.request_id), /^[a-f0-9]{12}$/);
      assert.equal(envelope.response_schema, 'urn:study-method:schema:session-close-response:1');
      // fixado pelo bug A — session-close exporta SM_SETUP_ID (§6.1 preenchido pelo chamador)
      assert.equal(envelope.setup_id, '0123456789ab', '§6.1: o chamador preenche o setup_id do envelope');

      const payload = envelope.payload as Record<string, any>;
      assert.equal(payload.request_kind, 'session_close', 'request_kind do PAYLOAD (§6.5)');
      assert.equal(payload.session_id, '0001');
      assert.equal(payload.session_path, 'memory/0001.json');
      assert.equal(payload.setup_id, '0123456789ab', 'o payload carrega o setup_id do estado em disco');
      assert.equal(payload.attempt, 1);
      assert.equal(payload.max_attempts, 2, 'RA-6');
      const campos = (payload.missing_fields as Array<Record<string, string>>).map((m) => m.field);
      assert.ok(campos.includes('one_line_summary'), `missing_fields: ${campos.join(',')}`);
      assert.ok(campos.includes('topics'), `missing_fields: ${campos.join(',')}`);

      assert.deepEqual(
        { dir: await listarArquivos(sb.dir), home: await listarArquivos(sb.home) },
        antes,
        'RA-1: nada escrito na fase de PEDIDO em NENHUM dos dois universos (árvore de trabalho/cwd e STUDY_METHOD_HOME)',
      );
    } finally {
      await sb.rm();
    }
  });

  it('ciclo PEDIDO→RESPOSTA: --apply com o request_id do pedido aplica os valores e fecha com validation_errors[] dos unfilled', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'memory', '0001.json'), SESSAO_PROVISORIA);
      const pedido = JSON.parse(sb.script('session-close.sh', [sb.setup]).stdout) as { request_id: string };

      const resposta = await sb.write(
        'resposta.json',
        JSON.stringify({
          protocol: 'study-method/request-apply',
          protocol_version: '1.0',
          request_id: pedido.request_id,
          kind: 'fill_session_fields',
          items: [
            {
              schema_version: '1.0',
              request_kind: 'session_close',
              session_id: '0001',
              values: {
                one_line_summary: 'Estudamos derivadas parciais.',
                topics: ['derivadas'],
                what_was_done: 'Resolvemos 5 exercícios.',
                what_worked: 'Analogia de cerca.',
              },
              unfilled: [{ field: 'what_didnt_work', reason: 'sessão curta demais para avaliar' }],
            },
          ],
        }),
      );
      const r = sb.script('session-close.sh', [sb.setup, '--session', '0001', '--apply', resposta]);
      assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-300)}`);
      assert.equal(r.stdout.trim(), '0001');

      const sessao = JSON.parse(await sb.read(path.join('setup', 'memory', '0001.json'))) as Record<string, any>;
      assert.equal(sessao.status, 'completed');
      assert.equal(sessao.one_line_summary, 'Estudamos derivadas parciais.', 'o valor do modelo substitui o provisório');
      assert.deepEqual(sessao.topics, ['derivadas']);
      assert.equal(sessao.what_was_done, 'Resolvemos 5 exercícios.');
      assert.deepEqual(sessao.validation_errors, ['what_didnt_work: sessão curta demais para avaliar'], 'unfilled[] vira validation_errors[]');
    } finally {
      await sb.rm();
    }
  });

  it('RA-2: --apply com request_id divergente → exit 5 e NADA é aplicado (a sessão segue in_progress)', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'memory', '0001.json'), SESSAO_PROVISORIA);
      const antes = await sb.read(path.join('setup', 'memory', '0001.json'));
      const resposta = await sb.write(
        'resposta-rid-errado.json',
        JSON.stringify({
          protocol: 'study-method/request-apply',
          protocol_version: '1.0',
          request_id: '000000000000',
          kind: 'fill_session_fields',
          items: [{ schema_version: '1.0', request_kind: 'session_close', session_id: '0001', values: { one_line_summary: 'x' } }],
        }),
      );
      const r = sb.script('session-close.sh', [sb.setup, '--apply', resposta]);
      assert.equal(r.status, 5);
      assert.match(r.stderr, /request_id divergente/);
      assert.equal(await sb.read(path.join('setup', 'memory', '0001.json')), antes, 'o estado em disco não foi tocado');
    } finally {
      await sb.rm();
    }
  });

  it('--recover: órfã in_progress vira abandoned/auto_orphan_recovery sem inventar conteúdo; finalizada ou inexistente é exit 2', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'memory', '0001.json'), SESSAO_PROVISORIA);
      const r = sb.script('session-close.sh', [sb.setup, '--recover', '0001']);
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), '0001');

      const sessao = JSON.parse(await sb.read(path.join('setup', 'memory', '0001.json'))) as Record<string, any>;
      assert.equal(sessao.status, 'abandoned');
      assert.equal(sessao.finalized_by, 'auto_orphan_recovery');
      assert.match(String(sessao.finalized_at), /^\d{4}-\d{2}-\d{2}T/, 'finalized_at = mtime do arquivo (docs/01 §4.1: nada é inventado)');
      assert.equal(sessao.one_line_summary, 'Sessão interrompida sem fechamento (recuperada automaticamente).');

      const repetido = sb.script('session-close.sh', [sb.setup, '--recover', '0001']);
      assert.equal(repetido.status, 2, 'sessão finalizada nunca é reescrita');
      assert.match(repetido.stderr, /não está in_progress/);

      const inexistente = sb.script('session-close.sh', [sb.setup, '--recover', '0099']);
      assert.equal(inexistente.status, 2);
      assert.match(inexistente.stderr, /sessão 0099 não existe/);
    } finally {
      await sb.rm();
    }
  });

  it('limites de --apply e de estado: resposta ilegível → 2 · não-JSON → 5 · bruto malformado → 5 · fechar completed → 2', async () => {
    const sb = await makeSandbox(true);
    try {
      await sb.write(path.join('setup', 'memory', '0001.json'), SESSAO_COM_RESUMO);

      const ilegivel = sb.script('session-close.sh', [sb.setup, '--apply', path.join(sb.dir, 'nao-existe.json')]);
      assert.equal(ilegivel.status, 2);
      assert.match(ilegivel.stderr, /não consigo ler o arquivo de resposta/);

      const naoJson = await sb.write('resposta-quebrada.json', 'nope');
      const quebrada = sb.script('session-close.sh', [sb.setup, '--apply', naoJson]);
      assert.equal(quebrada.status, 5);
      assert.match(quebrada.stderr, /não parseia como JSON/);

      await sb.write(path.join('setup', 'memory', '0002.json'), '{broken');
      const bruto = sb.script('session-close.sh', [sb.setup, '--session', '0002']);
      assert.equal(bruto.status, 5, 'bruto malformado é validação, não execução (quarentena é de memory-index.sh)');
      assert.match(bruto.stderr, /não parseia como JSON/);

      const finalizada = SESSAO_COM_RESUMO.replace('"session_id": "0001"', '"session_id": "0003"').replace('"status": "in_progress"', '"status": "completed"');
      await sb.write(path.join('setup', 'memory', '0003.json'), finalizada);
      const fecharCompleta = sb.script('session-close.sh', [sb.setup, '--session', '0003']);
      assert.equal(fecharCompleta.status, 2, 'um NNNN.json finalizado nunca é reescrito (docs/03 §2)');
      assert.match(fecharCompleta.stderr, /já está 'completed'/);
    } finally {
      await sb.rm();
    }
  });
});
