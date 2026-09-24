/**
 * cx-scripts-gaps-detect-toolchains.test.ts — CARACTERIZAÇÃO de `detect-toolchains.sh`
 * (passo `bootstrap`/`challenge` — docs/00-contratos.md §2 passos 1 e 8, §4.1 enum de
 * linguagens, §5 exit codes, §8 tabela de CLI).
 *
 * Pina o comportamento OBSERVÁVEL pela fronteira pública (exit · stdout/stderr · disco):
 *  - a saída é SEMPRE JSON com as chaves de topo fechadas; o enum tem as 19
 *    linguagens do §4.1 e só o subconjunto zero-install é sondado — as demais saem
 *    `"available": null, "implemented": false` ("eu não sei", nunca "não tem");
 *  - `--language` recorta a linguagem pedida; `--setup` acrescenta o bloco `setup`;
 *  - o cache `STUDY_METHOD_HOME/toolchains.json` guarda o documento canônico da
 *    MÁQUINA (inteiro, sem bloco `setup`) e só é gravado na sonda completa;
 *    `--cached` lê sem re-sondar e sai 1 (com remédio) quando não há cache;
 *  - NUNCA instala nada: ausência de toolchain é informação devolvida.
 *
 * Nenhum teste lê o interior dos scripts: só `bash <script>` e observação.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { promises as fsp } from 'node:fs';
import { makeSandbox } from './cx-scripts-fixtures/harness';

/** As 19 linguagens do enum fechado (docs/00-contratos.md §4.1), ordenadas. */
const LINGUAGENS_19 = [
  'bash', 'c', 'cpp', 'csharp', 'elixir', 'go', 'haskell', 'java', 'javascript', 'julia',
  'kotlin', 'lua', 'php', 'python', 'r', 'ruby', 'rust', 'swift', 'typescript',
];

const TOP_KEYS = ['generated_at', 'host', 'implemented_languages', 'languages', 'platform', 'schema_version'];

describe('detect-toolchains.sh — detecção de toolchain, cache e enum fechado (§4.1, §8)', () => {
  it('uso incorreto: argumento desconhecido, --setup/--language sem valor e linguagem fora do enum saem 2 com usage', async () => {
    const sb = await makeSandbox(false);
    try {
      const frob = sb.script('detect-toolchains.sh', ['--frob']);
      assert.equal(frob.status, 2);
      assert.match(frob.stderr, /argumento desconhecido: --frob/);
      assert.match(frob.stderr, /uso: detect-toolchains\.sh \[--cached\]/);

      const semCaminho = sb.script('detect-toolchains.sh', ['--setup']);
      assert.equal(semCaminho.status, 2);
      assert.match(semCaminho.stderr, /--setup exige um caminho/);

      const semValor = sb.script('detect-toolchains.sh', ['--language']);
      assert.equal(semValor.status, 2);
      assert.match(semValor.stderr, /--language exige um valor/);

      const foraDoEnum = sb.script('detect-toolchains.sh', ['--language', 'cobol']);
      assert.equal(foraDoEnum.status, 2);
      assert.match(foraDoEnum.stderr, /linguagem fora do enum de docs\/00-contratos\.md §4\.1: cobol/);

      const help = sb.script('detect-toolchains.sh', ['--help']);
      assert.equal(help.status, 0);
      assert.match(help.stderr, /uso: detect-toolchains\.sh/, 'a usage do --help sai em stderr (LIB-3)');
    } finally {
      await sb.rm();
    }
  });

  it('happy path: JSON de 6 chaves, enum de 19, não-implementadas saem null/false e o cache canônico é gravado', async () => {
    const sb = await makeSandbox(false);
    try {
      const r = sb.script('detect-toolchains.sh', []);
      assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-300)}`);
      const doc = JSON.parse(r.stdout) as Record<string, any>;
      assert.deepEqual(Object.keys(doc).sort(), TOP_KEYS);
      assert.equal(doc.schema_version, '1.0');
      assert.deepEqual(doc.implemented_languages, ['python', 'javascript', 'go', 'rust', 'c'], 'só as zero-install são sondadas');
      assert.deepEqual(Object.keys(doc.languages).sort(), LINGUAGENS_19, 'enum fechado de 19 (§4.1)');

      const ruby = doc.languages.ruby;
      assert.equal(ruby.available, null, '"eu não sei" — sondar em silêncio e dizer "não tem" é mentira');
      assert.equal(ruby.implemented, false);
      assert.equal(ruby.reason, 'not_implemented_in_this_version');

      const python = doc.languages.python;
      assert.equal(python.implemented, true);
      assert.equal(python.test_command, 'python3 -m unittest discover -s tests -p "test_*.py" -v', 'o comando de teste vem de languages.md §3.1');
      assert.equal(typeof python.available, 'boolean');
      if (python.available === true) {
        assert.ok(String(python.version).length > 0);
        assert.ok(String(python.command).length > 0);
        assert.ok(String(python.path).length > 0);
      } else {
        assert.equal(python.version, null);
        assert.equal(python.command, null);
        assert.equal(python.path, null);
      }

      // efeito em disco: cache canônico da MÁQUINA, inteiro e SEM o bloco "setup"
      const cache = JSON.parse(await fsp.readFile(path.join(sb.home, 'toolchains.json'), 'utf8')) as Record<string, any>;
      assert.deepEqual(Object.keys(cache).sort(), TOP_KEYS, 'o cache guarda o documento canônico completo');
      assert.equal('setup' in cache, false, 'carimbar o cache com um setup envenenaria toda leitura posterior com --cached');
      assert.deepEqual(Object.keys(cache.languages).sort(), LINGUAGENS_19);
    } finally {
      await sb.rm();
    }
  });

  it('--cached devolve o cache sem re-sondar e recorta com --language; sem cache é exit 1 com o remédio', async () => {
    const sb = await makeSandbox(false);
    try {
      const semCache = sb.script('detect-toolchains.sh', ['--cached']);
      assert.equal(semCache.status, 1);
      assert.match(semCache.stderr, /não há cache em .*toolchains\.json; rode detect-toolchains\.sh sem --cached/);

      const cheio = JSON.parse(sb.script('detect-toolchains.sh', []).stdout) as Record<string, any>;
      const cacheado = sb.script('detect-toolchains.sh', ['--cached']);
      assert.equal(cacheado.status, 0);
      assert.deepEqual(JSON.parse(cacheado.stdout), cheio, 'o cache é devolvido byte a byte como foi gravado');

      const recortado = sb.script('detect-toolchains.sh', ['--cached', '--language', 'python']);
      assert.equal(recortado.status, 0);
      const doc = JSON.parse(recortado.stdout) as Record<string, any>;
      assert.deepEqual(Object.keys(doc).sort(), ['generated_at', 'host', 'languages', 'schema_version']);
      assert.deepEqual(Object.keys(doc.languages), ['python'], 'recorta SÓ a linguagem pedida, sem re-sondar');
    } finally {
      await sb.rm();
    }
  });

  it('--language recorta a linguagem pedida e NÃO escreve cache; não-implementada sai 0 com available null', async () => {
    const sb = await makeSandbox(false);
    try {
      const soPython = sb.script('detect-toolchains.sh', ['--language', 'python']);
      assert.equal(soPython.status, 0);
      const doc = JSON.parse(soPython.stdout) as Record<string, any>;
      assert.deepEqual(Object.keys(doc.languages), ['python']);
      assert.equal(await sb.exists(path.join(sb.home, 'toolchains.json')), false, 'com --language o cache não é tocado');

      const soRuby = sb.script('detect-toolchains.sh', ['--language', 'ruby']);
      assert.equal(soRuby.status, 0, 'linguagem conhecida mas não implementada NÃO é erro');
      const ruby = (JSON.parse(soRuby.stdout) as Record<string, any>).languages.ruby;
      assert.equal(ruby.available, null);
      assert.equal(ruby.implemented, false);
    } finally {
      await sb.rm();
    }
  });

  it('--setup acrescenta o bloco "setup" e também não escreve cache', async () => {
    const sb = await makeSandbox(true);
    try {
      const manifest = JSON.parse(await sb.read(path.join('setup', 'setup.json'))) as { language: { name: string } };
      assert.equal(manifest.language.name, 'python', 'premissa: o manifest declara a linguagem em language.NAME (objeto)');

      const r = sb.script('detect-toolchains.sh', ['--setup', sb.setup]);
      assert.equal(r.status, 0, `stderr: ${r.stderr.slice(-300)}`);
      const doc = JSON.parse(r.stdout) as Record<string, any>;
      const bloco = doc.setup as { root: string; language: string | null; available: boolean | null };
      assert.ok(bloco, 'o bloco "setup" existe com --setup');
      assert.equal(bloco.root, sb.setup);
      // [BUG detect-toolchains-setup-language] o manifest guarda `language` como OBJETO
      // ({name, chosen_at}), mas o script extrai com um sed que espera uma STRING
      // ("language": "<l>") — então a linguagem declarada no setup NUNCA aparece e o
      // bloco sai com language: null (e available: null), mesmo com language.name
      // "python" no setup.json. Pinado como comportamento observado.
      assert.equal(bloco.language, null, 'comportamento observado: a linguagem declarada no setup.json não é lida');
      assert.equal(bloco.available, null);
      assert.equal(await sb.exists(path.join(sb.home, 'toolchains.json')), false, 'com --setup o cache não é tocado');
    } finally {
      await sb.rm();
    }
  });

  it('--setup com diretório inexistente: avisa em stderr, segue e sai 0 sem bloco "setup"', async () => {
    const sb = await makeSandbox(false);
    try {
      const r = sb.script('detect-toolchains.sh', ['--setup', path.join(sb.dir, 'nao-existe')]);
      assert.equal(r.status, 0, 'caminho ruim de --setup degrada, não aborta');
      assert.match(r.stderr, /--setup aponta para um diretório inexistente/);
      const doc = JSON.parse(r.stdout) as Record<string, any>;
      assert.equal('setup' in doc, false);
    } finally {
      await sb.rm();
    }
  });
});
