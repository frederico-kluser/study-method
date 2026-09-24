/**
 * tests/cx-detect-c-banner-versao.test.ts — o PARSER DE BANNER da `version`
 * do `detect()` de C (`engine/lang/c.ts` — `versaoDoTexto`, c.ts:213-217).
 *
 * FOCO (Onda 1, mudança intencional B1): `versaoDoTexto` cobre as famílias de
 * banner dos compiladores — a do clang ("Apple clang version 17.0.0 …",
 * "Ubuntu clang version 15.0.7", que trazem a palavra `version`) e a do gcc
 * ("cc (GCC) 16.2.1 20260810", "gcc (Debian 12.2.0-14) 12.2.0",
 * "gcc (Red Hat 4.8.5-44) 4.8.5 20150623" — que NÃO a trazem: a versão é o
 * `N.N[.N]` depois do parêntese do vendor) — mais a do tcc
 * ("tcc version 0.9.27 (x86_64 Linux)"), que cai na primeira família.
 *
 * CONTRATO (docs/research/08-multilingua-trava-deterministica.md §6:
 * "`command -v` + versão, e a mensagem de degradação"): com toolchain
 * presente, `detect().version` é string que CASA /^\d+\.\d+/ para os banners
 * das famílias conhecidas; quando o banner não permite apurar, `version` é o
 * `null` honesto do tipo (`DetectResult.version`: "versão detectada, ou
 * `null` quando não foi possível apurar") — NUNCA uma versão inventada e
 * nunca um crash.
 *
 * MÉTODO — toolchain FALSA, teste de COMPORTAMENTO: `versaoDoTexto` é privada
 * (não há acesso ao interior sem mock branco) e a superfície observável é
 * `cDetect()`. Cada cenário monta um tmpdir com scripts `cc`/`clang`/`python3`
 * de brinquedo que imprimem o banner sob teste, aponta o PATH só para ele e lê
 * a `version` resultante. O caminho exercitado é o MESMO da produção:
 * `spawnSync(binário, ['--version'])` → `stdout + stderr` → parser de banner.
 *
 * SEM DUPLICAR os testes existentes (que só cobrem o banner REAL desta
 * máquina): `tests/engineLangC.test.ts:131` (caso B1) e
 * `tests/cx-langqual-lang-c.test.ts` §(2) (bateria de 357). As LACUNAS
 * cobertas aqui são as VARIAÇÕES de banner: multi-linha com Copyright, vendor
 * com espaços e com sufixo numérico, versão de 2 componentes, família tcc,
 * banner no stderr, banner dividido entre os dois canais, e lixo/vazio/
 * 1 componente ⇒ `null` honesto (a degradação honesta do campo `version`).
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { C_RUNNER_BINARY, cDetect, cResetDetectCache } from '../electron/main/engine/lang/c';
import type { DetectResult } from '../electron/main/engine/lang/registry';

// ---------------------------------------------------------------------------
// A bancada: toolchains FALSAS em tmpdir próprio (PATH isolado por cenário)
// ---------------------------------------------------------------------------

/** Raiz dos tmpdirs DESTES testes — próprios, removidos no fim do arquivo. */
const RAIZ_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cx-detect-c-banner-'));

after(() => {
  fs.rmSync(RAIZ_TMP, { recursive: true, force: true });
});

/** Envolve `texto` em aspas simples POSIX (`it's` vira `'it'\''s'`). */
function citar(texto: string): string {
  return `'${texto.split("'").join("'\\''")}'`;
}

/**
 * Um script POSIX que emite `linhas` e sai com `exit` — SÓ builtins de
 * `/bin/sh` (`printf`, `exit`), porque o PATH do cenário é só o tmpdir.
 * `canal: 'stderr'` imita ferramentas que narram na saída de erro.
 */
function scriptBanner(
  linhas: readonly string[],
  opts: { canal?: 'stdout' | 'stderr'; exit?: number } = {},
): string {
  const { canal = 'stdout', exit = 0 } = opts;
  const emitir =
    linhas.length === 0
      ? ''
      : `printf '%s\\n' ${linhas.map(citar).join(' ')}${canal === 'stderr' ? ' >&2' : ''}\n`;
  return `#!/bin/sh\n${emitir}exit ${exit}\n`;
}

/** Monta um tmpdir com os `fakes` (nome → corpo do script) executáveis. */
function criarMundo(fakes: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(RAIZ_TMP, 'mundo-'));
  for (const [nome, corpo] of Object.entries(fakes)) {
    const alvo = path.join(dir, nome);
    fs.writeFileSync(alvo, corpo, { mode: 0o755 });
    fs.chmodSync(alvo, 0o755);
  }
  return dir;
}

/** Roda `corpo` com o PATH apontando SÓ para o mundo falso — e limpa tudo. */
function detectComFakes(fakes: Record<string, string>): DetectResult {
  const mundo = criarMundo(fakes);
  const pathOriginal = process.env.PATH;
  try {
    process.env.PATH = mundo;
    cResetDetectCache();
    return cDetect();
  } finally {
    if (pathOriginal === undefined) delete process.env.PATH;
    else process.env.PATH = pathOriginal;
    cResetDetectCache();
    fs.rmSync(mundo, { recursive: true, force: true });
  }
}

/**
 * Toolchain falsa COMPLETA: `cc` emite o banner sob teste (o primeiro
 * candidato de `C_BINARIOS_RUNNER` que responde é o que abastece `version`);
 * `clang` e `python3` só respondem 0 para o `ok` fechar em `true`.
 */
function detectComBanner(
  linhas: readonly string[],
  opts: { canal?: 'stdout' | 'stderr'; exit?: number } = {},
): DetectResult {
  return detectComFakes({
    cc: scriptBanner(linhas, opts),
    clang: scriptBanner(['clang version 15.0.7']),
    python3: scriptBanner(['Python 3.13.0']),
  });
}

// ---------------------------------------------------------------------------
// As famílias de banner (a correção B1)
// ---------------------------------------------------------------------------

describe('c — detect().version: as famílias de banner (mudança B1)', () => {
  it('família clang (Apple), MULTI-LINHA: "version 17.0.0" → "17.0.0"', () => {
    const d = detectComBanner([
      'Apple clang version 17.0.0 (clang-1700.0.13.3)',
      'Target: arm64-apple-darwin24.3.0',
      'Thread model: posix',
      'InstalledDir: /Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin',
    ]);
    assert.equal(d.ok, true);
    assert.equal(d.version, '17.0.0');
  });

  it('família clang (Ubuntu): "Ubuntu clang version 15.0.7" → "15.0.7"', () => {
    const d = detectComBanner(['Ubuntu clang version 15.0.7']);
    assert.equal(d.version, '15.0.7');
  });

  it('família gcc: "cc (GCC) 16.2.1 20260810" → "16.2.1" — a DATA não é versão', () => {
    const d = detectComBanner(['cc (GCC) 16.2.1 20260810']);
    assert.equal(d.version, '16.2.1', 'a data 20260810 não pode vazar para a versão');
  });

  it('família gcc, vendor com SUFIXO numérico: "gcc (Debian 12.2.0-14) 12.2.0" → "12.2.0"', () => {
    const d = detectComBanner(['gcc (Debian 12.2.0-14) 12.2.0']);
    assert.equal(d.version, '12.2.0', 'o "-14" do vendor não pode vazar para a versão');
  });

  it('família gcc, vendor com ESPAÇOS: "gcc (Red Hat 4.8.5-44) 4.8.5 20150623" → "4.8.5"', () => {
    const d = detectComBanner(['gcc (Red Hat 4.8.5-44) 4.8.5 20150623']);
    assert.equal(d.version, '4.8.5', '"Red Hat 4.8.5-44" é o vendor; a data 20150623 não é versão');
  });

  it('família gcc MULTI-LINHA com Copyright: "(C) 2022" não atrapalha a captura', () => {
    const d = detectComBanner([
      'gcc (Debian 12.2.0-14) 12.2.0',
      'Copyright (C) 2022 Free Software Foundation, Inc.',
      'This is free software; see the source for copying conditions.',
      'There is NO warranty; not even for MERCHANTABILITY or FITNESS FOR A',
      'PARTICULAR PURPOSE.',
    ]);
    assert.equal(d.version, '12.2.0', 'o "(C) 2022" do Copyright não é parêntese-de-vendor');
  });

  it('família tcc: "tcc version 0.9.27 (x86_64 Linux)" → "0.9.27"', () => {
    const d = detectComBanner(['tcc version 0.9.27 (x86_64 Linux)']);
    assert.equal(d.version, '0.9.27', 'o "(x86_64 Linux)" do target não confunde o parser');
  });

  it('CONTRATO §6: cada banner de família conhecida produz version que CASA /^\\d+\\.\\d+/', () => {
    const banners: readonly (readonly string[])[] = [
      ['Apple clang version 17.0.0 (clang-1700.0.13.3)'],
      ['Ubuntu clang version 15.0.7'],
      ['Ubuntu clang version 15.0'],
      ['cc (GCC) 16.2.1 20260810'],
      ['gcc (Debian 12.2.0-14) 12.2.0'],
      ['gcc (Red Hat 4.8.5-44) 4.8.5 20150623'],
      ['gcc (GCC) 4.8'],
      ['tcc version 0.9.27 (x86_64 Linux)'],
    ];
    for (const linhas of banners) {
      const d = detectComBanner(linhas);
      assert.ok(d.version, `banner ${JSON.stringify(linhas[0])} deve dar versão`);
      assert.match(d.version, /^\d+\.\d+/, `banner ${JSON.stringify(linhas[0])}`);
      assert.equal(d.binary, C_RUNNER_BINARY);
      assert.equal(d.binary, 'sh');
    }
  });
});

// ---------------------------------------------------------------------------
// Os limites do parser — null honesto, nunca crash
// ---------------------------------------------------------------------------

describe('c — detect().version: limites do parser (null honesto, nunca crash)', () => {
  it('versão de 2 COMPONENTES casa o contrato /^\d+\.\d+/ (clang "15.0" e gcc "4.8")', () => {
    assert.equal(detectComBanner(['Ubuntu clang version 15.0']).version, '15.0');
    assert.equal(detectComBanner(['gcc (GCC) 4.8']).version, '4.8');
  });

  it('banner LIXO ⇒ version null (NUNCA inventa) — ok/binary/degradacao intactos', () => {
    const d = detectComBanner(['bem-vindo ao cc de brinquedo, sem banner nenhum 12345']);
    assert.equal(d.version, null, 'a degradação honesta do campo é o null do tipo');
    assert.equal(d.ok, true, 'a ferramenta EXISTE e respondeu 0 — a ausência é de banner, não de toolchain');
    assert.equal(d.degradacao, null);
    assert.equal(d.binary, 'sh');
  });

  it('banner VAZIO com exit 0 ⇒ version null', () => {
    assert.equal(detectComBanner([]).version, null);
  });

  it('versão de 1 COMPONENTE ("tcc version 17") ⇒ null — o parser exige N.N', () => {
    assert.equal(detectComBanner(['tcc version 17']).version, null);
    assert.equal(detectComBanner(['tcc version 17 (x86_64 Linux)']).version, null);
  });

  it('"cc (GCC) 20260810" (só data, sem pontos) ⇒ null — não há N.N o que capturar', () => {
    assert.equal(detectComBanner(['cc (GCC) 20260810']).version, null);
  });

  it('banner SÓ no STDERR é visto (sondar concatena stdout + stderr)', () => {
    const d = detectComFakes({
      cc: scriptBanner(['gcc (Debian 12.2.0-14) 12.2.0'], { canal: 'stderr' }),
      clang: scriptBanner(['clang version 15.0.7']),
      python3: scriptBanner(['Python 3.13.0']),
    });
    assert.equal(d.version, '12.2.0');
  });

  it('banner DIVIDIDO entre stdout e stderr: o "\\n" da junção é LOAD-BEARING (sem ele seria null)', () => {
    // O `sondar` da produção faz `${stdout}\n${stderr}`. Aqui os DOIS canais
    // emitem SEM newline próprio (`printf '%s'`, sem `\n`): o parêntese do
    // vendor fecha no stdout e a versão vem crua no stderr — a ÚNICA
    // whitespace entre `)` e `12.2.0` é o `\n` da junção. Com concatenação
    // simples (`stdout + stderr`) o `\s+` do regex não teria o que casar e a
    // versão seria `null`; este pin só passa POR CAUSA do newline.
    const d = detectComFakes({
      cc: `#!/bin/sh\nprintf '%s' 'gcc (Debian 12.2.0-14)'\nprintf '%s' '12.2.0' >&2\nexit 0\n`,
      clang: scriptBanner(['clang version 15.0.7']),
      python3: scriptBanner(['Python 3.13.0']),
    });
    assert.equal(d.version, '12.2.0');
  });

  it('caracterização (QUIRK): a palavra "version" vence mesmo vindo DEPOIS do banner gcc', () => {
    // QUIRK conhecido (não é bug para os banners reais das três famílias —
    // nenhuma delas mistura as duas formas): a família `version …` é tentada
    // PRIMEIRA no texto todo, então num banner misto ela vence a forma gcc
    // mesmo aparecendo depois. Caso o parser mude de precedência, este caso
    // cai de propósito — é a rede de segurança da decisão.
    const d = detectComBanner([
      'gcc (Debian 12.2.0-14) 12.2.0',
      'custom build version 2.5',
    ]);
    assert.equal(d.version, '2.5');
  });
});
