/**
 * cx-scripts-lib-common.test.ts — CARACTERIZAÇÃO de `skills/study-method/scripts/lib/common.sh`.
 *
 * Rede de segurança da refatoração: pina a interface CONGELADA do §7.1 de
 * docs/00-contratos.md como é observável por `source` + chamada — exit codes,
 * stdout, stderr, efeitos em disco — nunca o interior do script.
 *
 * Cada função pública da tabela §7.1 é exercitada nos ramos que o smoke NÃO
 * alcança: uso incorreto (exit 2), limites (rótulo vazio), determinismo
 * (STUDY_METHOD_TODAY/NOW) e o predicado único de lock de sessão (§7.4).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import { makeSandbox } from './cx-scripts-fixtures/harness';

describe('lib/common.sh — contrato §7.1 (caracterização)', () => {
  it('sm_die: termina com o código pedido e prefixa «study-method: erro N:» em stderr', async () => {
    const sb = await makeSandbox(false);
    const r = sb.lib('common.sh', `sm_die 2 'algo faltou'`);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /^study-method: erro 2: algo faltou\n/);
    await sb.rm();
  });

  it('sm_log: escreve SEMPRE em stderr (nunca stdout) e suprime debug sem STUDY_METHOD_LOG=debug', async () => {
    const sb = await makeSandbox(false);
    const info = sb.lib('common.sh', `sm_log info 'recado'`);
    assert.equal(info.status, 0);
    assert.equal(info.stdout, '');
    assert.match(info.stderr, /\] info: recado/);

    const debugSuprimido = sb.lib('common.sh', `sm_log debug 'segredo'`);
    assert.equal(debugSuprimido.status, 0);
    assert.equal(debugSuprimido.stderr, '');

    const debugLigado = sb.lib('common.sh', `sm_log debug 'segredo'`, {
      env: { STUDY_METHOD_LOG: 'debug' },
    });
    assert.match(debugLigado.stderr, /\] debug: segredo/);
    await sb.rm();
  });

  it('sm_now_iso: honra STUDY_METHOD_NOW válido; formato inválido é ignorado COM AVISO em stderr', async () => {
    const sb = await makeSandbox(false);
    const ok = sb.lib('common.sh', `sm_now_iso`, { env: { STUDY_METHOD_NOW: '2026-02-03T04:05:06+00:00' } });
    assert.equal(ok.stdout.trim(), '2026-02-03T04:05:06+00:00');

    const bad = sb.lib('common.sh', `sm_now_iso`, { env: { STUDY_METHOD_NOW: 'INVALIDO' } });
    assert.equal(bad.status, 0);
    assert.match(bad.stderr, /STUDY_METHOD_NOW ignorado \(formato invalido\): INVALIDO/);
    // o relógio real vale: timestamp ISO com offset, não mais o valor inválido
    assert.match(bad.stdout.trim(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([.]\d+)?([Z]|[+-]\d{2}:\d{2})$/);
    await sb.rm();
  });

  it('sm_today: honra STUDY_METHOD_TODAY; formato inválido é ignorado com aviso', async () => {
    const sb = await makeSandbox(false);
    const ok = sb.lib('common.sh', `sm_today`, { env: { STUDY_METHOD_TODAY: '2026-03-04' } });
    assert.equal(ok.stdout.trim(), '2026-03-04');

    const bad = sb.lib('common.sh', `sm_today`, { env: { STUDY_METHOD_TODAY: 'nao-e-data' } });
    assert.equal(bad.status, 0);
    assert.match(bad.stderr, /STUDY_METHOD_TODAY ignorado \(formato invalido\)/);
    assert.match(bad.stdout.trim(), /^\d{4}-\d{2}-\d{2}$/);
    await sb.rm();
  });

  it('sm_require_cmd: 0 com tudo presente; 1 nomeando em stderr o que falta (nunca instala)', async () => {
    const sb = await makeSandbox(false);
    const ok = sb.lib('common.sh', `sm_require_cmd jq python3`);
    assert.equal(ok.status, 0);

    const falta = sb.lib('common.sh', `sm_require_cmd jq comando-que-nao-existe-xyz`);
    assert.equal(falta.status, 1);
    assert.match(falta.stderr, /comando ausente: comando-que-nao-existe-xyz/);
    assert.match(falta.stderr, /para instalar/);
    await sb.rm();
  });

  it('sm_setup_root: acha o setup.json em ancestral e imprime caminho absoluto sem barra final', async () => {
    const sb = await makeSandbox(true);
    await fsp.mkdir(path.join(sb.setup, 'a', 'b'), { recursive: true });
    const r = sb.lib('common.sh', `sm_setup_root '${path.join(sb.setup, 'a', 'b')}'`);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), sb.setup);
    await sb.rm();
  });

  it('sm_setup_root: 3 quando não há setup.json legível em nenhum ancestral', async () => {
    const sb = await makeSandbox(false);
    const r = sb.lib('common.sh', `sm_setup_root '${sb.dir}'`);
    assert.equal(r.status, 3);
    assert.equal(r.stdout.trim(), '');
    await sb.rm();
  });

  it('sm_normalize_concept_id: pt-BR → snake_case ASCII sem acento, sem stopwords (§4.2)', async () => {
    const sb = await makeSandbox(false);
    const casos: Array<[string, string]> = [
      ['Indução matemática', 'inducao_matematica'],
      ['Regra da Cadeia', 'regra_cadeia'],
      ['funções', 'funcoes'],
    ];
    for (const [entrada, esperado] of casos) {
      const r = sb.lib('common.sh', `sm_normalize_concept_id ${JSON.stringify(entrada)}`);
      assert.equal(r.status, 0, `entrada: ${entrada}`);
      assert.equal(r.stdout.trim(), esperado, `entrada: ${entrada}`);
    }
    await sb.rm();
  });

  it('sm_normalize_concept_id: 2 para rótulo vazio, sem caractere aproveitável ou só-stopword', async () => {
    const sb = await makeSandbox(false);
    for (const entrada of ['', '!!!', 'de da do', 'a']) {
      const r = sb.lib('common.sh', `sm_normalize_concept_id ${JSON.stringify(entrada)}`);
      assert.equal(r.status, 2, `entrada: «${entrada}»`);
      assert.equal(r.stdout.trim(), '');
    }
    await sb.rm();
  });

  it('sm_normalize_slug: pt-BR → kebab-case (namespace DISTINTO do conceito: sem remover stopwords)', async () => {
    const sb = await makeSandbox(false);
    const ok = sb.lib('common.sh', `sm_normalize_slug 'Soma de Frações'`);
    assert.equal(ok.status, 0);
    assert.equal(ok.stdout.trim(), 'soma-de-fracoes');

    const hifens = sb.lib('common.sh', `sm_normalize_slug 'hello--world--'`);
    assert.equal(hifens.stdout.trim(), 'hello-world');

    for (const entrada of ['', '!!!']) {
      const r = sb.lib('common.sh', `sm_normalize_slug ${JSON.stringify(entrada)}`);
      assert.equal(r.status, 2, `entrada: «${entrada}»`);
    }
    await sb.rm();
  });

  it('sm_atomic_write: publica o conteúdo de stdin no destino (tmp + mv), criando o diretório pai', async () => {
    const sb = await makeSandbox(false);
    const destino = path.join(sb.dir, 'profundo', 'arquivo.json');
    const r = sb.lib('common.sh', `sm_atomic_write '${destino}'`, { input: '{"ok":true}\n' });
    assert.equal(r.status, 0);
    assert.equal(await sb.read(path.join('profundo', 'arquivo.json')), '{"ok":true}\n');
    await sb.rm();
  });

  it('sm_next_seq: aloca NNNN zero-padded por max+1 e não reaproveita o que já existe', async () => {
    const sb = await makeSandbox(false);
    const seqDir = path.join(sb.dir, 'mem');
    const primeiro = sb.lib('common.sh', `sm_next_seq '${seqDir}' .json`);
    assert.equal(primeiro.status, 0);
    assert.equal(primeiro.stdout.trim(), '0001');

    // o mecanismo cria o arquivo do número alocado (noclobber); o 2º vira 0002
    const segundo = sb.lib('common.sh', `sm_next_seq '${seqDir}' .json`);
    assert.equal(segundo.stdout.trim(), '0002');

    // número já ocupado em subdiretório também sobe o max (não reaproveita purgado)
    await fsp.mkdir(path.join(seqDir, 'discarded'), { recursive: true });
    await writeFileSafe(path.join(seqDir, 'discarded', '0009.json'), '{}');
    const terceiro = sb.lib('common.sh', `sm_next_seq '${seqDir}' .json`);
    assert.equal(terceiro.stdout.trim(), '0010');
    await sb.rm();
  });

  it('sm_registry_path: <STUDY_METHOD_HOME>/registry.json', async () => {
    const sb = await makeSandbox(false);
    const r = sb.lib('common.sh', `sm_registry_path`);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), path.join(sb.home, 'registry.json'));
    await sb.rm();
  });

  it('sm_registry_lock/unlock: toma o lock por mkdir atômico; segunda tomada sai 4; unlock é idempotente', async () => {
    const sb = await makeSandbox(false);
    const toma = sb.lib('common.sh', `sm_registry_lock`);
    assert.equal(toma.status, 0);

    // o lock do 1º processo já foi liberado no EXIT dele; agora seguramos de fora
    await fsp.mkdir(path.join(sb.home, '.registry.lock'));
    const ocupado = sb.lib('common.sh', `sm_registry_lock`);
    assert.equal(ocupado.status, 4);
    assert.match(ocupado.stderr, /registry ocupado/);

    const libera = sb.lib('common.sh', `sm_registry_lock || true; sm_registry_unlock; sm_registry_unlock`);
    assert.equal(libera.status, 0);
    await sb.rm();
  });

  it('sm_setup_lock: via (b) grava pid:null + started_at; lock vivo → 4; sm_setup_unlock idempotente (§7.4)', async () => {
    const sb = await makeSandbox(false);
    await fsp.mkdir(path.join(sb.setup, 'memory'), { recursive: true });

    const toma = sb.lib('common.sh', `sm_setup_lock '${sb.setup}' '0001'`);
    assert.equal(toma.status, 0);
    const lock = JSON.parse(await sb.read(path.join('setup', 'memory', '.session.lock')));
    assert.equal(lock.pid, null);
    assert.equal(lock.session_id, '0001');
    assert.equal(lock.hostname, 'cx-test-host');

    const concorrente = sb.lib('common.sh', `sm_setup_lock '${sb.setup}' '0002'`);
    assert.equal(concorrente.status, 4);
    assert.match(concorrente.stderr, /sessao viva neste setup/);

    const libera = sb.lib('common.sh', `sm_setup_unlock '${sb.setup}'; sm_setup_unlock '${sb.setup}'`);
    assert.equal(libera.status, 0);
    assert.equal(await sb.exists(path.join('setup', 'memory', '.session.lock')), false);
    await sb.rm();
  });

  it('sm_session_lock_alive: predicado único — morto sem arquivo, órfão por hostname, vivo por TTL/pid (§7.4)', async () => {
    const sb = await makeSandbox(false);
    const lockDir = path.join(sb.setup, 'memory');
    await fsp.mkdir(lockDir, { recursive: true });
    const lockPath = path.join(lockDir, '.session.lock');

    // sem arquivo → morto
    const ausente = sb.lib('common.sh', `sm_session_lock_alive '${lockPath}'; echo "rc=$?"`);
    assert.match(ausente.stdout, /rc=1/);

    // hostname diferente → órfão ANTES de pid/TTL
    await writeFileSafe(lockPath, JSON.stringify({ pid: null, hostname: 'outra-maquina', session_id: '0001', started_at: '2026-01-15T09:59:00-03:00' }));
    const outroHost = sb.lib('common.sh', `sm_session_lock_alive '${lockPath}'; echo "rc=$?"`);
    assert.match(outroHost.stdout, /rc=1/);

    // pid:null + started_at recente (1 min antes do STUDY_METHOD_NOW) → vivo por TTL
    await writeFileSafe(lockPath, JSON.stringify({ pid: null, hostname: 'cx-test-host', session_id: '0001', started_at: '2026-01-15T09:59:00-03:00' }));
    const vivo = sb.lib('common.sh', `sm_session_lock_alive '${lockPath}'; echo "rc=$?"`);
    assert.match(vivo.stdout, /rc=0/);

    // started_at além do TTL (default 28800 s) → órfão, com o motivo anunciado em SM_SESSION_LOCK_REASON
    await writeFileSafe(lockPath, JSON.stringify({ pid: null, hostname: 'cx-test-host', session_id: '0001', started_at: '2026-01-14T00:00:00-03:00' }));
    const expirado = sb.lib('common.sh', `sm_session_lock_alive '${lockPath}'; echo "rc=$? motivo=$SM_SESSION_LOCK_REASON"`);
    assert.match(expirado.stdout, /rc=1/);
    assert.match(expirado.stdout, /TTL/);

    // <session_id> informado diferente → não é o lock desta sessão
    await writeFileSafe(lockPath, JSON.stringify({ pid: null, hostname: 'cx-test-host', session_id: '0002', started_at: '2026-01-15T09:59:00-03:00' }));
    const outraSessao = sb.lib('common.sh', `sm_session_lock_alive '${lockPath}' '0001'; echo "rc=$?"`);
    assert.match(outraSessao.stdout, /rc=1/);

    // pid numérico deste processo (vivo) → vivo por kill -0 (via a)
    await writeFileSafe(lockPath, JSON.stringify({ pid: process.pid, hostname: 'cx-test-host', session_id: '0001', started_at: '2026-01-15T09:59:00-03:00' }));
    const pidVivo = sb.lib('common.sh', `sm_session_lock_alive '${lockPath}'; echo "rc=$?"`);
    assert.match(pidVivo.stdout, /rc=0/);

    // pid morto (fora do intervalo de pids usuais) → órfão
    await writeFileSafe(lockPath, JSON.stringify({ pid: 4194000, hostname: 'cx-test-host', session_id: '0001', started_at: '2026-01-15T09:59:00-03:00' }));
    const pidMorto = sb.lib('common.sh', `sm_session_lock_alive '${lockPath}'; echo "rc=$?"`);
    assert.match(pidMorto.stdout, /rc=1/);
    await sb.rm();
  });

  it('sm_relpath: caminho relativo à raiz; 2 quando está fora dela', async () => {
    const sb = await makeSandbox(false);
    const dentro = sb.lib('common.sh', `sm_relpath '${sb.dir}/mem/0001.json' '${sb.dir}'`);
    assert.equal(dentro.status, 0);
    assert.equal(dentro.stdout.trim(), 'mem/0001.json');

    const fora = sb.lib('common.sh', `sm_relpath '/outro/lugar/x' '${sb.dir}'`);
    assert.equal(fora.status, 2);
    await sb.rm();
  });

  it('sm_chmod_private: chmod 700 em caminho existente; 1 em caminho inexistente', async () => {
    const sb = await makeSandbox(false);
    const alvo = path.join(sb.dir, 'privado');
    await fsp.mkdir(alvo);
    const ok = sb.lib('common.sh', `sm_chmod_private '${alvo}'`);
    assert.equal(ok.status, 0);
    const st = await fsp.stat(alvo);
    assert.equal(st.mode & 0o777, 0o700);

    const inexistente = sb.lib('common.sh', `sm_chmod_private '${sb.dir}/nao-existe'`);
    assert.equal(inexistente.status, 1);
    await sb.rm();
  });
});

async function writeFileSafe(p: string, content: string): Promise<void> {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, content, 'utf8');
}
