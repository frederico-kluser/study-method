/**
 * cx-scripts-gaps-setup.test.ts — CARACTERIZAÇÃO de `setup-init.sh` e `setup-list.sh`
 * (os dois scripts do bootstrap/setup_interview — docs/00-contratos.md §2 passos 1–2,
 * §5 exit codes, §7 escrita atômica, §8 tabela de CLI — que a bateria cx-scripts
 * ainda não cobria).
 *
 * Pina o comportamento OBSERVÁVEL pela fronteira pública (exit · stdout/stderr · disco):
 *  - `setup-init.sh`: uso incorreto sai 2 nomeando o motivo; o happy path escreve
 *    os 4 diretórios, o `.gitignore` com `memory/`, o `setup.json` normalizado
 *    (§4.2) e SÓ ENTÃO a entrada do registry (§8: nunca aponta para setup pela
 *    metade); é idempotente (mesmo setup_id, nada sobrescrito);
 *  - limites: `setup.json` pré-existente malformado/sem setup_id válido é exit 5
 *    SEM sobrescrever (B-07); registry ocupado é exit 4 com o setup criado mas não
 *    registrado; registry corrompido é preservado em `.corrupt-<epoch>`;
 *  - `setup-list.sh`: registry vazio responde "Nenhum setup registrado."; resolve
 *    sobe ancestrais e registra a descoberta; find normaliza o termo (§4.2);
 *    archive/forget nunca apagam disco; liveness marca `missing` sem nunca apagar
 *    a entrada (docs/07 §2.1).
 *
 * Nenhum teste lê o interior dos scripts: só `bash <script>` e observação.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import { makeSandbox, FIXED_NOW, setupJson, type Sandbox } from './cx-scripts-fixtures/harness';

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

async function lerRegistry(sb: Sandbox): Promise<{ setups: Array<Record<string, unknown>> }> {
  return JSON.parse(await fsp.readFile(path.join(sb.home, 'registry.json'), 'utf8')) as {
    setups: Array<Record<string, unknown>>;
  };
}

describe('setup-init.sh — criação do setup + entrada no registry (§2 passo 2, §8)', () => {
  it('uso incorreto: argumentos obrigatórios ausentes, flag desconhecida e vocabulário inválido saem 2 nomeando o motivo', async () => {
    const sb = await makeSandbox(false);
    try {
      const completo = ['--subject', 's', '--subject-slug', 'sl', '--title', 't'];
      const casos: Array<[string[], RegExp]> = [
        [[], /faltou <path>/],
        [['p', '--subject-slug', 'sl', '--title', 't'], /faltou --subject/],
        [['p', '--subject', 's', '--title', 't'], /faltou --subject-slug/],
        [['p', '--subject', 's', '--subject-slug', 'sl'], /faltou --title/],
        [['p', ...completo, '--frob'], /flag desconhecida: --frob/],
        [['a', 'b', ...completo], /apenas um <path>/],
        [['p', '--subject', '!!!', '--subject-slug', 'sl', '--title', 't'], /--subject nao produz um identificador valido/],
        [['p', '--subject', 's', '--subject-slug', '!!!', '--title', 't'], /--subject-slug nao produz um slug valido/],
        [['p', ...completo, '--language', 'cobol'], /--language invalida: cobol/],
        [['p', ...completo, '--skill-level', 'expert'], /--skill-level invalido: expert/],
        [['p', ...completo, '--session-minutes', '0'], /--session-minutes deve ser um inteiro >= 1/],
        [['p', ...completo, '--theory-source', 'x'], /--theory-source invalido: x/],
        [['p', ...completo, '--defaults-used', 'RUIM'], /id de decisao invalido: RUIM/],
      ];
      for (const [args, msg] of casos) {
        const r = sb.script('setup-init.sh', args);
        assert.equal(r.status, 2, `args: ${args.join(' ')}`);
        assert.match(r.stderr, msg);
        assert.equal(r.stdout, '', 'erro de uso não escreve em stdout');
      }
      assert.equal(sb.script('setup-init.sh', ['--help']).status, 0);
    } finally {
      await sb.rm();
    }
  });

  it('happy path (com espaços no <path>): 4 diretórios + .gitignore com memory/ + setup.json normalizado + registry; stdout = setup_id de 12 hex', async () => {
    const sb = await makeSandbox(false);
    try {
      const alvo = path.join(sb.dir, 'novo setup');
      const r = sb.script('setup-init.sh', [
        alvo,
        '--subject', 'Matemática',
        '--subject-slug', 'Cálculo I',
        '--title', 'Cálculo I',
        '--language', 'python',
        '--skill-level', 'beginner',
        '--session-minutes', '50',
        '--theory-source', 'student_provided',
        '--defaults-used', 'D-B02=generated,D-B07',
      ]);
      assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-300)}`);
      const setupId = r.stdout.trim();
      assert.match(setupId, /^[0-9a-f]{12}$/, 'stdout = SOMENTE o setup_id alocado (§8)');

      // efeitos em disco, na ordem do §8/docs/10 §6.5
      for (const d of ['docs', 'memory', 'researchs', 'challenges']) {
        assert.equal(await sb.exists(path.join('novo setup', d)), true, `falta diretório: ${d}`);
      }
      const gitignore = await sb.read(path.join('novo setup', '.gitignore'));
      assert.match(gitignore, /^memory\/$/m, 'privacidade: .gitignore contém memory/');

      const manifest = JSON.parse(await sb.read(path.join('novo setup', 'setup.json'))) as Record<string, any>;
      assert.equal(manifest.setup_id, setupId);
      assert.equal(manifest.setup_name, 'calculo-i', 'subject-slug vira kebab-case (§4.2)');
      assert.equal(manifest.subject, 'matematica', 'subject vira snake_case sem acento (§4.2)');
      assert.deepEqual(manifest.taxonomy, ['matematica']);
      assert.equal(manifest.language.name, 'python');
      assert.equal(manifest.session_count, 0);
      assert.equal(manifest.created_at, FIXED_NOW, 'created_at honra STUDY_METHOD_NOW');
      assert.equal(manifest.updated_at, FIXED_NOW);
      assert.equal(manifest.decisions['D-B02'].value, 'generated');
      assert.equal(manifest.decisions['D-B02'].default_used, true, 'BOOT-2: default nunca em silêncio');
      assert.equal(manifest.decisions['D-B07'].value, null);
      assert.equal(manifest.decisions['D-B07'].default_used, true);

      // registry: por último — nunca aponta para setup pela metade
      const registry = await lerRegistry(sb);
      assert.equal(registry.setups.length, 1);
      const entrada = registry.setups[0];
      assert.equal(entrada.setup_id, setupId);
      assert.equal(entrada.setup_status, 'active');
      assert.equal(entrada.path, alvo);
      assert.equal(entrada.language, 'python');
      assert.equal(entrada.cross_read, 'ask');
    } finally {
      await sb.rm();
    }
  });

  it('idempotente (I-32): segunda execução no mesmo <path> reimprime o MESMO setup_id e não sobrescreve setup.json/.gitignore', async () => {
    const sb = await makeSandbox(false);
    try {
      const alvo = path.join(sb.dir, 'repetido');
      const args = [alvo, '--subject', 's', '--subject-slug', 'slug-bom', '--title', 't'];
      const primeiro = sb.script('setup-init.sh', args);
      assert.equal(primeiro.status, 0);
      const antes = await sb.read(path.join('repetido', 'setup.json'));

      const segundo = sb.script('setup-init.sh', [alvo, '--subject', 'outro', '--subject-slug', 'outro-slug', '--title', 'Outro']);
      assert.equal(segundo.status, 0);
      assert.equal(segundo.stdout.trim(), primeiro.stdout.trim(), 'a segunda execução reimprime o setup_id existente');
      assert.equal(await sb.read(path.join('repetido', 'setup.json')), antes, 'nada foi sobrescrito');
    } finally {
      await sb.rm();
    }
  });

  it('limites: setup.json pré-existente malformado → exit 5 preservando o conteúdo; setup_id inválido → exit 5 (B-07)', async () => {
    const sb = await makeSandbox(false);
    try {
      await sb.write(path.join('quebrado', 'setup.json'), '{broken');
      const malformado = sb.script('setup-init.sh', [
        path.join(sb.dir, 'quebrado'), '--subject', 's', '--subject-slug', 'sl', '--title', 't',
      ]);
      assert.equal(malformado.status, 5);
      assert.match(malformado.stderr, /ja existe um setup\.json ilegivel/);
      assert.equal(await sb.read(path.join('quebrado', 'setup.json')), '{broken', 'o reparo é decisão do aluno (B-07): nada é sobrescrito');

      await sb.write(path.join('id-ruim', 'setup.json'), '{"setup_id":"INVALIDO"}');
      const idRuim = sb.script('setup-init.sh', [
        path.join(sb.dir, 'id-ruim'), '--subject', 's', '--subject-slug', 'sl', '--title', 't',
      ]);
      assert.equal(idRuim.status, 5);
      assert.match(idRuim.stderr, /setup_id valido/);
    } finally {
      await sb.rm();
    }
  });

  it('registry ocupado → exit 4: o setup fica criado em disco mas NÃO registrado (§8)', async () => {
    const sb = await makeSandbox(false);
    try {
      await fsp.mkdir(path.join(sb.home, '.registry.lock'), { recursive: true });
      const alvo = path.join(sb.dir, 'sem-registro');
      const r = sb.script('setup-init.sh', [alvo, '--subject', 's', '--subject-slug', 'sl', '--title', 't']);
      assert.equal(r.status, 4);
      assert.match(r.stderr, /registry ocupado por outro processo/);
      assert.equal(await sb.exists(path.join('sem-registro', 'setup.json')), true, 'o setup foi criado…');
      assert.equal(await sb.exists(path.join(sb.home, 'registry.json')), false, '…mas não registrado');
    } finally {
      await sb.rm();
    }
  });

  it('registry corrompido é PRESERVADO como registry.json.corrupt-<epoch> e recriado (setup-list/setup-init nunca perdem entrada em silêncio)', async () => {
    const sb = await makeSandbox(false);
    try {
      await fsp.writeFile(path.join(sb.home, 'registry.json'), '{broken', 'utf8');
      const r = sb.script('setup-init.sh', [path.join(sb.dir, 'novo'), '--subject', 's', '--subject-slug', 'sl', '--title', 't']);
      assert.equal(r.status, 0);
      assert.match(r.stderr, /registry ilegivel: preservado como/);
      const arquivos = await fsp.readdir(sb.home);
      const corrupto = arquivos.filter((a) => /^registry\.json\.corrupt-\d+$/.test(a));
      assert.equal(corrupto.length, 1, `esperado exatamente 1 .corrupt-*, obtido: ${arquivos.join(',')}`);
      assert.equal(await fsp.readFile(path.join(sb.home, corrupto[0]), 'utf8'), '{broken', 'o arquivo quebrado fica para reparo humano');
      const registry = await lerRegistry(sb);
      assert.equal(registry.setups.length, 1, 'o registry recriado ganha a entrada nova');
    } finally {
      await sb.rm();
    }
  });
});

describe('setup-list.sh — registry: listar, resolver, buscar, arquivar, esquecer (§8, docs/07 §1–§2)', () => {
  it('uso incorreto: flags sem valor, subcomandos combinados, posicional e id fora de 12 hex saem 2', async () => {
    const sb = await makeSandbox(false);
    try {
      const casos: Array<[string[], RegExp]> = [
        [['--resolve'], /--resolve exige <cwd>/],
        [['--find'], /--find exige <termo>/],
        [['--resolve', 'x', '--find', 'y'], /subcomandos sao mutuamente exclusivos/],
        [['--archive', '123'], /--archive: setup_id invalido: 123 \(esperado 12 hex\)/],
        [['--forget', 'zzz'], /--forget: setup_id invalido: zzz \(esperado 12 hex\)/],
        [['posicional'], /argumento posicional inesperado: posicional/],
        [['--frob'], /flag desconhecida: --frob/],
      ];
      for (const [args, msg] of casos) {
        const r = sb.script('setup-list.sh', args);
        assert.equal(r.status, 2, `args: ${args.join(' ')}`);
        assert.match(r.stderr, msg);
      }
      assert.equal(sb.script('setup-list.sh', ['--help']).status, 0);
    } finally {
      await sb.rm();
    }
  });

  it('setup/registry vazios: "Nenhum setup registrado." na lista legível e {"setups":[]} com --json', async () => {
    const sb = await makeSandbox(false);
    try {
      const humano = sb.script('setup-list.sh', []);
      assert.equal(humano.status, 0);
      assert.match(humano.stdout, /Nenhum setup registrado\./);

      const json = sb.script('setup-list.sh', ['--json']);
      assert.equal(json.status, 0);
      assert.deepEqual(JSON.parse(json.stdout), { setups: [] });
    } finally {
      await sb.rm();
    }
  });

  it('happy path: lista legível/--json, --resolve sobe ancestrais e REGISTRA a descoberta, --find normaliza o termo (§4.2)', async () => {
    const sb = await makeSandbox(false);
    try {
      // setup criado FORA do registry (fixture direta): --resolve é que o registra
      await sb.write(path.join('setup', 'setup.json'), setupJson({ subject: 'matematica', taxonomy: ['matematica'] }));
      await sb.write(path.join('setup', 'memory', 'placeholder.txt'), 'x');

      const resolve = sb.script('setup-list.sh', ['--resolve', path.join(sb.setup, 'memory')]);
      assert.equal(resolve.status, 0, `stderr: ${resolve.stderr.slice(-300)}`);
      assert.equal(resolve.stdout.trim(), sb.setup, 'imprime o caminho ABSOLUTO da raiz (passo bootstrap)');

      const registry = await lerRegistry(sb);
      assert.equal(registry.setups.length, 1, 'efeito em disco: a descoberta entra no registry');
      assert.equal(registry.setups[0].setup_id, '0123456789ab');
      assert.equal(registry.setups[0].setup_status, 'active');

      const json = sb.script('setup-list.sh', ['--json']);
      const lista = JSON.parse(json.stdout) as { setups: Array<Record<string, unknown>> };
      assert.equal(lista.setups.length, 1);
      assert.equal(lista.setups[0].setup_status, 'active');
      assert.equal(lista.setups[0].last_seen_at, FIXED_NOW);

      const humano = sb.script('setup-list.sh', []);
      assert.match(humano.stdout, /NOME/);
      assert.match(humano.stdout, /CAMINHO/);
      assert.match(humano.stdout, /teste-unitario/);

      const busca = sb.script('setup-list.sh', ['--find', 'Matemática', '--json']);
      assert.equal(busca.status, 0);
      const achados = JSON.parse(busca.stdout) as { term: string; query: string; matches: Array<Record<string, unknown>> };
      assert.equal(achados.term, 'Matemática');
      assert.equal(achados.query, 'matematica', 'o termo é normalizado para snake_case antes de casar');
      assert.equal(achados.matches.length, 1);
      assert.equal(achados.matches[0].setup_id, '0123456789ab');
    } finally {
      await sb.rm();
    }
  });

  it('archive some da lista padrão e aparece com archived_at em --all; forget remove a entrada e NUNCA apaga disco', async () => {
    const sb = await makeSandbox(false);
    try {
      await sb.write(path.join('setup', 'setup.json'), setupJson());
      sb.script('setup-list.sh', ['--resolve', sb.setup]);

      const arquivado = sb.script('setup-list.sh', ['--archive', '0123456789ab']);
      assert.equal(arquivado.status, 0);
      assert.equal(arquivado.stdout.trim(), '0123456789ab');

      const padrao = JSON.parse(sb.script('setup-list.sh', ['--json']).stdout) as { setups: unknown[] };
      assert.deepEqual(padrao.setups, [], 'archived some da listagem padrão');
      const todos = JSON.parse(sb.script('setup-list.sh', ['--all', '--json']).stdout) as { setups: Array<Record<string, unknown>> };
      assert.equal(todos.setups.length, 1);
      assert.equal(todos.setups[0].setup_status, 'archived');
      assert.equal(todos.setups[0].archived_at, FIXED_NOW);

      const esquecido = sb.script('setup-list.sh', ['--forget', '0123456789ab']);
      assert.equal(esquecido.status, 0);
      assert.match(esquecido.stderr, /nada foi apagado em disco/);
      const depois = JSON.parse(sb.script('setup-list.sh', ['--all', '--json']).stdout) as { setups: unknown[] };
      assert.deepEqual(depois.setups, [], 'a entrada saiu do registry…');
      assert.equal(await sb.exists(path.join('setup', 'setup.json')), true, '…mas o setup continua em disco e volta ao ser reaberto');
    } finally {
      await sb.rm();
    }
  });

  it('limites: --resolve/--archive/--forget sem achado saem 3; --resolve com setup.json malformado sai 5 sem tocar nada (B-07)', async () => {
    const sb = await makeSandbox(false);
    try {
      const semSetup = sb.script('setup-list.sh', ['--resolve', path.join(sb.dir, 'vazio-nunca-criado')]);
      assert.equal(semSetup.status, 3);
      assert.match(semSetup.stderr, /nenhum setup\.json legivel/);

      assert.equal(sb.script('setup-list.sh', ['--archive', 'aaaaaaaaaaaa']).status, 3);
      assert.equal(sb.script('setup-list.sh', ['--forget', 'aaaaaaaaaaaa']).status, 3);

      await sb.write(path.join('mal', 'setup.json'), '{broken');
      // B-07 cobre os DOIS universos: a árvore de trabalho e o STUDY_METHOD_HOME
      // (o --resolve gravaria no registry antes de morrer, se tocasse em algo).
      const antes = { dir: await listarArquivos(sb.dir), home: await listarArquivos(sb.home) };
      const malformado = sb.script('setup-list.sh', ['--resolve', path.join(sb.dir, 'mal')]);
      assert.equal(malformado.status, 5);
      assert.match(malformado.stderr, /nao parseia — nada foi tocado/);
      assert.deepEqual(
        { dir: await listarArquivos(sb.dir), home: await listarArquivos(sb.home) },
        antes,
        'B-07: nada foi tocado em disco (árvore de trabalho e STUDY_METHOD_HOME)',
      );
    } finally {
      await sb.rm();
    }
  });

  it('registry malformado: segue com registry vazio mas PRESERVA o arquivo corrompido em .corrupt-<epoch>', async () => {
    const sb = await makeSandbox(false);
    try {
      await fsp.writeFile(path.join(sb.home, 'registry.json'), '{broken', 'utf8');
      const r = sb.script('setup-list.sh', ['--json']);
      assert.equal(r.status, 0, 'registry quebrado não é erro de execução (B-23/B-24)');
      assert.deepEqual(JSON.parse(r.stdout), { setups: [] });
      assert.match(r.stderr, /registry ilegivel/);
      const arquivos = await fsp.readdir(sb.home);
      const corrupto = arquivos.filter((a) => /^registry\.json\.corrupt-\d+$/.test(a));
      assert.equal(corrupto.length, 1, `esperado exatamente 1 .corrupt-*, obtido: ${arquivos.join(',')}`);
      assert.equal(await fsp.readFile(path.join(sb.home, corrupto[0]), 'utf8'), '{broken');
    } finally {
      await sb.rm();
    }
  });

  it('liveness: entrada cujo path sumiu vira "missing" com missing_since e a entrada NUNCA é apagada (docs/07 §2.1)', async () => {
    const sb = await makeSandbox(false);
    try {
      await sb.write(path.join('sumido', 'setup.json'), setupJson());
      sb.script('setup-list.sh', ['--resolve', path.join(sb.dir, 'sumido')]);
      await fsp.rename(path.join(sb.dir, 'sumido'), path.join(sb.dir, 'sumido-mudou'));

      const r = sb.script('setup-list.sh', ['--all', '--json']);
      assert.equal(r.status, 0);
      const lista = JSON.parse(r.stdout) as { setups: Array<Record<string, unknown>> };
      assert.equal(lista.setups.length, 1, 'a entrada nunca é apagada: ela ainda dá nome a cross_setup_refs antigas');
      assert.equal(lista.setups[0].setup_status, 'missing');
      assert.equal(lista.setups[0].missing_since, FIXED_NOW);
      assert.match(r.stderr, /sumiu de .*marcado como missing/);

      // e volta a "active" sozinha quando o setup reaparece em outro caminho
      const resolve = sb.script('setup-list.sh', ['--resolve', path.join(sb.dir, 'sumido-mudou')]);
      assert.equal(resolve.status, 0);
      const volta = JSON.parse(sb.script('setup-list.sh', ['--all', '--json']).stdout) as { setups: Array<Record<string, unknown>> };
      assert.equal(volta.setups[0].setup_status, 'active');
      assert.equal(volta.setups[0].missing_since, undefined);
    } finally {
      await sb.rm();
    }
  });
});
