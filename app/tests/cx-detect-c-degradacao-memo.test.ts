/**
 * tests/cx-detect-c-degradacao-memo.test.ts — o CONTRATO DA DEGRADAÇÃO e o
 * ciclo de vida do MEMO de `cDetect()` (`engine/lang/c.ts`).
 *
 * CONTRATO (docs/research/08-multilingua-trava-deterministica.md §6 —
 * "`command -v` + versão, e a mensagem de degradação" — e o tipo
 * `DetectResult` de `engine/lang/registry.ts`):
 *   - SEM toolchain: `ok: false` + `degradacao` que DIZ o que faltou (a
 *     mensagem nomeia a ferramenta E a consequência) — nunca crash, nunca
 *     falha em silêncio, nunca aprova por omissão;
 *   - COM toolchain: `ok: true` + `degradacao: null` — os dois campos são
 *     COMPLEMENTARES em todo estado;
 *   - `binary` é SEMPRE 'sh' (`C_RUNNER_BINARY` — o spawn executa
 *     `sh run.sh`), nos dois estados;
 *   - ferramenta "encontrada" = `binário --version` SAI 0 (o `command -v` +
 *     versão do §6); resposta != 0 ou erro de spawn contam como AUSÊNCIA e o
 *     próximo candidato de `C_BINARIOS_RUNNER` assume (ordem cc → gcc →
 *     clang).
 *
 * MÉTODO — toolchains FALSAS em tmpdir (scripts `cc`/`gcc`/`clang`/`python3`
 * no PATH), teste de COMPORTAMENTO pela superfície `cDetect()` (`sondar` e
 * `ferramentas` são privadas). O ramo "extrator ausente" é o único que não
 * nasce do PATH: alcança-se vedando `fs.existsSync` para `extract_ast.py` no
 * módulo builtin COMPARTILHADO (patch temporário do lado do teste, restaurado
 * em `finally` — produção intocada).
 *
 * MEMO: `cDetect()` sonda UMA vez e memoiza (`cResetDetectCache` reconstrói).
 * Os existentes só cobrem "reset ⇒ mesmo valor" com ambiente INALTERADO
 * (`tests/engineLangC.test.ts:145` e `tests/cx-langqual-lang-c.test.ts:195`);
 * as lacunas cobertas aqui: identidade da instância memoizada, persistência
 * do resultado (e da degradação) até o reset, reconstrução após troca de
 * ambiente e idempotência da limpeza. NÃO duplica a bateria de 357 casos de
 * `tests/cx-langqual-lang-c.test.ts` nem o caso B1 de
 * `tests/engineLangC.test.ts:131`.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  C_BINARIOS_RUNNER,
  C_PY_BINARIOS,
  C_RUNNER_BINARY,
  cDetect,
  cExtractorPath,
  cResetDetectCache,
} from '../electron/main/engine/lang/c';
import type { DetectResult } from '../electron/main/engine/lang/registry';

// ---------------------------------------------------------------------------
// A bancada: toolchains FALSAS em tmpdir próprio (PATH isolado por cenário)
// ---------------------------------------------------------------------------

/** Raiz dos tmpdirs DESTES testes — próprios, removidos no fim do arquivo. */
const RAIZ_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cx-detect-c-degrad-'));

after(() => {
  fs.rmSync(RAIZ_TMP, { recursive: true, force: true });
});

/** Envolve `texto` em aspas simples POSIX (`it's` vira `'it'\''s'`). */
function citar(texto: string): string {
  return `'${texto.split("'").join("'\\''")}'`;
}

/** Script POSIX que emite `linhas` e sai com `exit` — só builtins de sh. */
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

/** Toolchain falsa COMPLETA — todos os papéis respondem 0. */
const FAKES_COMPLETOS: Record<string, string> = {
  cc: scriptBanner(['cc (GCC) 16.2.1 20260810']),
  clang: scriptBanner(['clang version 15.0.7']),
  python3: scriptBanner(['Python 3.13.0']),
};

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
function comMundo<T>(fakes: Record<string, string>, corpo: () => T): T {
  const mundo = criarMundo(fakes);
  const pathOriginal = process.env.PATH;
  try {
    process.env.PATH = mundo;
    cResetDetectCache();
    return corpo();
  } finally {
    if (pathOriginal === undefined) delete process.env.PATH;
    else process.env.PATH = pathOriginal;
    cResetDetectCache();
    fs.rmSync(mundo, { recursive: true, force: true });
  }
}

/** `detect()` num mundo falso — a superfície observável destes testes. */
function detectEm(fakes: Record<string, string>): DetectResult {
  return comMundo(fakes, () => cDetect());
}

/**
 * O `fs` BUILTIN compartilhado — o mesmo objeto que `c.ts` obtém por
 * `require('node:fs')` no `carregar`. É por ele que se alcança o ramo de
 * "extrator ausente" (o extrator real está no disco e não depende de PATH).
 */
const fsBuiltin = createRequire(import.meta.url)('node:fs') as {
  existsSync: (p: fs.PathLike) => boolean;
};

/** Veda `existsSync` para o extrator durante `corpo` — e restaura SEMPRE. */
function semExtratorNoDisco<T>(corpo: () => T): T {
  const original = fsBuiltin.existsSync;
  fsBuiltin.existsSync = (p: fs.PathLike): boolean =>
    String(p).endsWith('extract_ast.py') ? false : original(p);
  try {
    return corpo();
  } finally {
    fsBuiltin.existsSync = original;
  }
}

// ---------------------------------------------------------------------------
// Ordem de sondagem do compilador
// ---------------------------------------------------------------------------

describe('c — detect(): ordem de sondagem do compilador (cc → gcc → clang)', () => {
  it('cc presente: a versão vem do cc mesmo com gcc e clang instalados', () => {
    const d = detectEm({
      cc: scriptBanner(['cc (GCC) 16.2.1 20260810']),
      gcc: scriptBanner(['gcc (Debian 12.2.0-14) 12.2.0']),
      clang: scriptBanner(['clang version 15.0.7']),
      python3: scriptBanner(['Python 3.13.0']),
    });
    assert.equal(d.ok, true);
    assert.equal(d.degradacao, null);
    assert.equal(d.version, '16.2.1', 'cc é o primeiro candidato — a versão dele vence');
  });

  it('sem cc: o gcc assume a prova (e a versão)', () => {
    const d = detectEm({
      gcc: scriptBanner(['gcc (Debian 12.2.0-14) 12.2.0']),
      clang: scriptBanner(['clang version 15.0.7']),
      python3: scriptBanner(['Python 3.13.0']),
    });
    assert.equal(d.ok, true);
    assert.equal(d.version, '12.2.0');
  });

  it('sem cc nem gcc: o clang é o compilador de PROVA — e o ok fecha true', () => {
    // O clang é o binário da Porta 1 E o último candidato a compilador do
    // runner: sozinho, ele satisfaz os DOIS papéis.
    const d = detectEm({
      clang: scriptBanner(['clang version 15.0.7']),
      python3: scriptBanner(['Python 3.13.0']),
    });
    assert.equal(d.ok, true);
    assert.equal(d.degradacao, null);
    assert.equal(d.version, '15.0.7');
  });

  it('binário que responde com exit != 0 é IGNORADO e o próximo candidato assume', () => {
    const d = detectEm({
      cc: scriptBanner(['cc quebrado (GCC) 99.9.9'], { exit: 3 }),
      clang: scriptBanner(['clang version 15.0.7']),
      python3: scriptBanner(['Python 3.13.0']),
    });
    assert.equal(d.ok, true, 'o cc quebrado não derruba o ok — o clang assumiu');
    assert.equal(d.version, '15.0.7', 'a versão vem de quem ASSUMIU, não do cc quebrado');
    assert.equal(d.degradacao, null);
  });
});

// ---------------------------------------------------------------------------
// O que conta como "encontrado"
// ---------------------------------------------------------------------------

describe('c — detect(): o que conta como "encontrado" (o command -v do §6)', () => {
  it('o ÚNICO candidato com exit != 0 conta como AUSENTE — degradação honesta', () => {
    const d = detectEm({
      cc: scriptBanner(['cc (GCC) 16.2.1 20260810'], { exit: 3 }),
      python3: scriptBanner(['Python 3.13.0']),
    });
    assert.equal(d.ok, false);
    assert.equal(d.version, null);
    assert.ok((d.degradacao ?? '').includes('nenhum compilador C encontrado no PATH'));
  });

  it('binário SEM permissão de execução (EACCES) conta como ausente — nunca crash', () => {
    const mundo = criarMundo({ python3: scriptBanner(['Python 3.13.0']) });
    fs.writeFileSync(path.join(mundo, 'cc'), scriptBanner(['cc (GCC) 16.2.1']), {
      mode: 0o644,
    });
    const pathOriginal = process.env.PATH;
    try {
      process.env.PATH = mundo;
      cResetDetectCache();
      const d = cDetect();
      assert.equal(d.ok, false, 'spawn com EACCES é ausência, não crash');
      assert.equal(d.version, null);
      assert.ok((d.degradacao ?? '').includes('nenhum compilador C encontrado no PATH'));
    } finally {
      if (pathOriginal === undefined) delete process.env.PATH;
      else process.env.PATH = pathOriginal;
      cResetDetectCache();
      fs.rmSync(mundo, { recursive: true, force: true });
    }
  });

  it('binário CORROMPIDO (sem shebang válido) conta como ausente — nunca crash', () => {
    const mundo = criarMundo({ python3: scriptBanner(['Python 3.13.0']) });
    const corrompido = path.join(mundo, 'cc');
    fs.writeFileSync(corrompido, 'isto não é um script válido\n', { mode: 0o755 });
    fs.chmodSync(corrompido, 0o755);
    const pathOriginal = process.env.PATH;
    try {
      process.env.PATH = mundo;
      cResetDetectCache();
      const d = cDetect();
      assert.equal(d.ok, false);
      assert.equal(d.version, null);
      assert.ok((d.degradacao ?? '').includes('nenhum compilador C encontrado no PATH'));
    } finally {
      if (pathOriginal === undefined) delete process.env.PATH;
      else process.env.PATH = pathOriginal;
      cResetDetectCache();
      fs.rmSync(mundo, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// O contrato da degradação
// ---------------------------------------------------------------------------

describe('c — detect(): o contrato da degradação (ok:false ⇒ DIZ o que faltou)', () => {
  it('sem o CLANG: nomeia o clang, a extensão -ast-dump=json e a Porta 1 — e a versão AINDA sai', () => {
    const d = detectEm({
      cc: scriptBanner(['gcc (Debian 12.2.0-14) 12.2.0']),
      python3: scriptBanner(['Python 3.13.0']),
    });
    assert.equal(d.ok, false);
    assert.equal(d.binary, 'sh');
    assert.match(d.version ?? '', /^\d+\.\d+/, 'a versão do compilador é independente do ok');
    assert.ok((d.degradacao ?? '').includes('clang não encontrado'));
    assert.ok((d.degradacao ?? '').includes('-ast-dump=json'), 'a degradação diz o PORQUÊ');
    assert.ok((d.degradacao ?? '').includes('Porta 1'), 'e a CONSEQUÊNCIA');
    assert.ok(!(d.degradacao ?? '').includes('nenhum compilador C encontrado'));
    assert.ok(!(d.degradacao ?? '').includes('nenhum python3'));
  });

  it('sem o PYTHON3: nomeia o python3 (a lista de candidatos) e o extrator', () => {
    const d = detectEm({
      cc: scriptBanner(['cc (GCC) 16.2.1 20260810']),
      clang: scriptBanner(['clang version 15.0.7']),
    });
    assert.equal(d.ok, false);
    assert.match(d.version ?? '', /^\d+\.\d+/);
    assert.ok((d.degradacao ?? '').includes('nenhum python3 no PATH'));
    assert.ok((d.degradacao ?? '').includes(C_PY_BINARIOS.join(', ')));
    assert.ok((d.degradacao ?? '').includes('extract_ast.py'));
    assert.ok(!(d.degradacao ?? '').includes('clang não encontrado'));
    assert.ok(!(d.degradacao ?? '').includes('nenhum compilador C encontrado'));
  });

  it('fallback python3 → python: só `python` no PATH assume o papel (ok:true, sem degradação)', () => {
    // `C_PY_BINARIOS` = ['python3', 'python'] — o helper do extrator aceita o
    // nome genérico quando o canônico não existe. Caracterização do fallback:
    // nenhum mundo dos demais casos tinha `python` sem `python3`, e o
    // observável é o `ok` fechando true com `degradacao: null`.
    const d = detectEm({
      cc: scriptBanner(['cc (GCC) 16.2.1 20260810']),
      clang: scriptBanner(['clang version 15.0.7']),
      python: scriptBanner(['Python 3.13.0']),
    });
    assert.equal(d.ok, true, 'o candidato genérico `python` satisfaz o papel de helper');
    assert.equal(d.degradacao, null);
    assert.match(d.version ?? '', /^\d+\.\d+/);
  });

  it('sem NADA (PATH para diretório inexistente): as TRÊS mensagens, na ordem, por " | "', () => {
    const pathOriginal = process.env.PATH;
    process.env.PATH = path.join(RAIZ_TMP, 'diretorio-que-nao-existe');
    try {
      cResetDetectCache();
      const d = cDetect();
      assert.equal(d.ok, false);
      assert.equal(d.binary, 'sh');
      assert.equal(d.version, null);
      const partes = (d.degradacao ?? '').split(' | ');
      assert.equal(partes.length, 3, 'compilador, clang e python3 — uma mensagem por ausência');
      assert.ok(partes[0].includes('nenhum compilador C encontrado no PATH'));
      assert.ok(partes[0].includes(C_BINARIOS_RUNNER.join(', ')));
      assert.ok(partes[0].includes('nunca aprova por omissão'), 'a consequência diz o gate');
      assert.ok(partes[1].includes('clang não encontrado'));
      assert.ok(partes[2].includes('nenhum python3 no PATH'));
    } finally {
      if (pathOriginal === undefined) delete process.env.PATH;
      else process.env.PATH = pathOriginal;
      cResetDetectCache();
    }
  });

  it('a mensagem de compilador e a de clang andam JUNTAS (o clang é candidato a compilador)', () => {
    // Caracterização derivada de `C_BINARIOS_RUNNER` conter 'clang': sem
    // nenhum compilador da lista, o clang também está ausente — as duas
    // mensagens disparam juntas e é sempre assim que se vê a de compilador.
    const d = detectEm({});
    assert.ok((d.degradacao ?? '').includes('nenhum compilador C encontrado no PATH'));
    assert.ok((d.degradacao ?? '').includes('clang não encontrado'));
  });

  it('PATH lixo (espaços / caminho de arquivo) ⇒ mesmo contrato — nunca crash', () => {
    for (const pathSujo of ['   ', path.join(RAIZ_TMP, 'arquivo-que-nao-existe')]) {
      const pathOriginal = process.env.PATH;
      try {
        process.env.PATH = pathSujo;
        cResetDetectCache();
        const d = cDetect();
        assert.equal(d.ok, false, `PATH ${JSON.stringify(pathSujo)}`);
        assert.equal(d.binary, 'sh');
        assert.equal(d.version, null);
        assert.ok((d.degradacao ?? '').includes('nenhum compilador C encontrado no PATH'));
        assert.ok((d.degradacao ?? '').includes('clang não encontrado'));
        assert.ok((d.degradacao ?? '').includes('nenhum python3 no PATH'));
      } finally {
        if (pathOriginal === undefined) delete process.env.PATH;
        else process.env.PATH = pathOriginal;
        cResetDetectCache();
      }
    }
  });

  it('extrator AUSENTE: nomeia vocab/c/extract_ast.py e aponta o STUDY_METHOD_C_EXTRACTOR', () => {
    const d = comMundo(FAKES_COMPLETOS, () => semExtratorNoDisco(() => cDetect()));
    assert.equal(d.ok, false, 'extrator ausente derruba o ok mesmo com toolchain completa');
    assert.equal(d.binary, 'sh');
    assert.match(d.version ?? '', /^\d+\.\d+/, 'a versão do compilador continua saindo');
    const avisos = (d.degradacao ?? '').split(' | ');
    assert.equal(avisos.length, 1, 'só o extrator faltou — uma única mensagem');
    assert.ok(avisos[0].includes('vocab/c/extract_ast.py não encontrado'));
    assert.ok(avisos[0].includes('STUDY_METHOD_C_EXTRACTOR'), 'a mensagem diz o REMÉDIO');
    assert.ok(avisos[0].includes('Porta 1'), 'e a consequência');
  });

  it('STUDY_METHOD_C_EXTRACTOR apontando para arquivo EXISTENTE é o extrator (e conta para ok)', () => {
    const falsoExtrator = path.join(RAIZ_TMP, 'meu-extract_ast.py');
    fs.writeFileSync(falsoExtrator, '# extrator apontado pela env\n');
    const envOriginal = process.env.STUDY_METHOD_C_EXTRACTOR;
    try {
      process.env.STUDY_METHOD_C_EXTRACTOR = falsoExtrator;
      assert.equal(cExtractorPath(), falsoExtrator);
      const d = comMundo(FAKES_COMPLETOS, () => cDetect());
      assert.equal(d.ok, true);
      assert.equal(d.degradacao, null);
    } finally {
      if (envOriginal === undefined) delete process.env.STUDY_METHOD_C_EXTRACTOR;
      else process.env.STUDY_METHOD_C_EXTRACTOR = envOriginal;
    }
  });

  it('STUDY_METHOD_C_EXTRACTOR para INEXISTENTE cai no candidato do DISCO (a dica funciona)', () => {
    const envOriginal = process.env.STUDY_METHOD_C_EXTRACTOR;
    try {
      process.env.STUDY_METHOD_C_EXTRACTOR = path.join(RAIZ_TMP, 'nao-existe.py');
      const achado = cExtractorPath();
      assert.ok(achado, 'o extrator do disco ainda resolve');
      assert.ok(fs.existsSync(achado), 'e é um arquivo real');
      assert.ok(achado.endsWith(path.join('vocab', 'c', 'extract_ast.py')));
    } finally {
      if (envOriginal === undefined) delete process.env.STUDY_METHOD_C_EXTRACTOR;
      else process.env.STUDY_METHOD_C_EXTRACTOR = envOriginal;
    }
  });

  it('INVARIANTE: ok e degradacao são COMPLEMENTARES em todos os estados', () => {
    const estados: DetectResult[] = [
      detectEm(FAKES_COMPLETOS),
      detectEm({ cc: scriptBanner(['gcc (Debian 12.2.0-14) 12.2.0']), python3: scriptBanner([]) }),
      detectEm({ cc: scriptBanner(['cc (GCC) 16.2.1']), clang: scriptBanner(['clang version 15.0.7']) }),
      detectEm({}),
      comMundo(FAKES_COMPLETOS, () => semExtratorNoDisco(() => cDetect())),
    ];
    for (const d of estados) {
      if (d.ok) {
        assert.equal(d.degradacao, null, 'ok:true nunca carrega degradação');
      } else {
        assert.ok((d.degradacao ?? '').length > 0, 'ok:false nunca falha em silêncio');
      }
    }
  });

  it('binary é SEMPRE o sh do runner em todos os estados', () => {
    assert.equal(C_RUNNER_BINARY, 'sh');
    for (const fakes of [FAKES_COMPLETOS, {}, { python3: scriptBanner([]) }]) {
      const d = detectEm(fakes);
      assert.equal(d.binary, C_RUNNER_BINARY);
      assert.equal(d.binary, 'sh');
    }
  });
});

// ---------------------------------------------------------------------------
// Memoização e limpeza de cache
// ---------------------------------------------------------------------------

describe('c — detect(): memoização e limpeza de cache', () => {
  it('duas chamadas seguidas devolvem a MESMA instância (a sonda roda UMA vez)', () => {
    comMundo(FAKES_COMPLETOS, () => {
      const a = cDetect();
      const b = cDetect();
      assert.equal(a, b, 'memo: mesma referência — nenhuma sonda nova');
    });
  });

  it('SEM reset, o ambiente novo NÃO é re-sondado — o memo é a decisão "sonda UMA vez"', () => {
    const mundoA = criarMundo({ ...FAKES_COMPLETOS, cc: scriptBanner(['cc (GCC) 16.2.1 20260810']) });
    const mundoB = criarMundo({ ...FAKES_COMPLETOS, cc: scriptBanner(['gcc (Debian 12.2.0-14) 12.2.0']) });
    const pathOriginal = process.env.PATH;
    try {
      process.env.PATH = mundoA;
      cResetDetectCache();
      const d1 = cDetect();
      assert.equal(d1.version, '16.2.1');
      process.env.PATH = mundoB; // troca o ambiente SEM limpar o memo
      const d2 = cDetect();
      assert.equal(d2, d1, 'a instância memoizada persiste');
      assert.equal(d2.version, '16.2.1', 'o resultado antigo vale até o reset');
    } finally {
      if (pathOriginal === undefined) delete process.env.PATH;
      else process.env.PATH = pathOriginal;
      cResetDetectCache();
      fs.rmSync(mundoA, { recursive: true, force: true });
      fs.rmSync(mundoB, { recursive: true, force: true });
    }
  });

  it('cResetDetectCache() reconstrói: o resultado NOVO reflete o ambiente novo', () => {
    const mundoA = criarMundo({ ...FAKES_COMPLETOS, cc: scriptBanner(['cc (GCC) 16.2.1 20260810']) });
    const mundoB = criarMundo({ ...FAKES_COMPLETOS, cc: scriptBanner(['gcc (Debian 12.2.0-14) 12.2.0']) });
    const pathOriginal = process.env.PATH;
    try {
      process.env.PATH = mundoA;
      cResetDetectCache();
      const antes = cDetect();
      process.env.PATH = mundoB;
      cResetDetectCache();
      const depois = cDetect();
      assert.notEqual(depois, antes, 'o reset constrói instância NOVA (sonda nova)');
      assert.equal(depois.version, '12.2.0', 'e o ambiente novo é o sonda-do');
    } finally {
      if (pathOriginal === undefined) delete process.env.PATH;
      else process.env.PATH = pathOriginal;
      cResetDetectCache();
      fs.rmSync(mundoA, { recursive: true, force: true });
      fs.rmSync(mundoB, { recursive: true, force: true });
    }
  });

  it('a DEGRADAÇÃO também fica memoizada até o reset (reprobe manual é contrato)', () => {
    const mundoQuebrado = criarMundo({ python3: scriptBanner(['Python 3.13.0']) });
    const pathOriginal = process.env.PATH;
    try {
      process.env.PATH = mundoQuebrado;
      cResetDetectCache();
      const d1 = cDetect();
      assert.equal(d1.ok, false);
      const comeco = (d1.degradacao ?? '').slice(0, 30);
      // O mundo conserta (toolchain completa), mas SEM reset o memo manda:
      process.env.PATH = criarMundo(FAKES_COMPLETOS);
      const d2 = cDetect();
      assert.equal(d2, d1, 'degradação memoizada — mesma instância');
      assert.equal(d2.ok, false);
      assert.ok((d2.degradacao ?? '').startsWith(comeco));
    } finally {
      // limpa TODOS os mundos criados abaixo de RAIZ_TMP
      for (const entrada of fs.readdirSync(RAIZ_TMP)) {
        fs.rmSync(path.join(RAIZ_TMP, entrada), { recursive: true, force: true });
      }
      if (pathOriginal === undefined) delete process.env.PATH;
      else process.env.PATH = pathOriginal;
      cResetDetectCache();
    }
  });

  it('cResetDetectCache() é idempotente e seguro sem memo prévio (nunca lança)', () => {
    cResetDetectCache();
    cResetDetectCache();
    comMundo(FAKES_COMPLETOS, () => {
      assert.ok(cDetect().ok);
      cResetDetectCache();
      cResetDetectCache();
    });
  });
});
