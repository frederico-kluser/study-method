/**
 * tests/gamesContent.test.ts — o CONTEÚDO do mundo "O robô do depósito"
 * (`app/resources/games/mundo-1/`) contra o contrato do motor
 * (`app/electron/main/engine/games/schema.ts`).
 *
 * O contrato do jogo é I/O puro (stdin -> stdout): o mesmo nível corre em C,
 * Python ou Rust e o veredito sai da comparação de saída. Este arquivo prova:
 *
 *   (a) SCHEMA dos 5 ficheiros (world.json + 5 níveis): casos >= 4 por nível,
 *       hidden coerente (>=1 oculto, >=1 visível, `hidden` só quando true), ids
 *       coerentes com `world.levels`, langs com starter+reference nas 3
 *       linguagens, optimize com par/parMs inteiros positivos. Cada ficheiro
 *       passa também o parse ZOD do próprio motor (GameWorldSchema /
 *       GameLevelSchema) — conteúdo que o motor rejeita reprova aqui primeiro.
 *       Os casos são comparados byte-a-byte com a TABELA EXATA do desenho.
 *   (b) ENUNCIADOS pt-BR, tom do app (você, direto) e sem travessões "—".
 *   (c) EXECUÇÃO REAL das referências: gcc/python3/rustc compilam e correm
 *       cada caso; a saída tem de igualar `expectedOutput` byte-a-byte
 *       (com os \n finais). Sem a toolchain o teste SALTA e diz que saltou.
 *   (d) STARTER: compila e falha em pelo menos 1 caso VISÍVEL (starter que
 *       passa tudo não é ponto de partida, é solução).
 *   (e) PAR: `optimize.lines.par >= linhas não vazias da referência mais
 *       curta + 2`.
 *
 * REGRA DO PAR (documentada aqui porque o contrato tem par ÚNICO por nível,
 * apesar de haver 3 linguagens): o par de otimização em linhas é o nº de
 * linhas NÃO VAZIAS da referência MAIS CURTA das três linguagens, MAIS 2.
 * Ex.: nivel-1 tem referências com 7 (c), 2 (python) e 6 (rust) linhas não
 * vazias -> par = 2 + 2 = 4. Os pares escritos em disco são exatamente esses.
 *
 * DECISÃO DE AUTORIA (confirmada com o orquestrador): no caso visível
 * "o relatório do dia" do chefe (2 5 1 / prioridades 1 3 3) a regra normativa
 * "soma dos pesos + (N-1)" dá 8 + 2 = 10; o desenho inicial marcava 9. Como a
 * regra é a lei e o output é derivado, o `expectedOutput` é "10\n1 3\n".
 *
 * Nada aqui escreve fora de tmp (`os.tmpdir()`): o conteúdo em
 * `app/resources/games/**` é só lido.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { GameLevelSchema, GameWorldSchema } from '../electron/main/engine/games/schema';

// ---------------------------------------------------------------------------
// Fixtures: o mundo em disco (só leitura)
// ---------------------------------------------------------------------------

type LangId = 'c' | 'python' | 'rust';

interface Caso {
  name: string;
  input: string;
  expectedOutput: string;
  hidden?: true;
}

interface Nivel {
  id: string;
  title: string;
  enunciado: string;
  introduces: string[];
  boss: boolean;
  contract: { mode: string; cases: Caso[] };
  langs: Record<LangId, { starter: string; reference: string }>;
  optimize: { lines: { par: number }; timeMs: { parMs: number } };
}

const MUNDO_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'resources',
  'games',
  'mundo-1',
);

const IDS_NIVEIS = ['nivel-1', 'nivel-2', 'nivel-3', 'nivel-4', 'chefe'] as const;
const LINGUAGENS: LangId[] = ['c', 'python', 'rust'];

function lerJson(nome: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(MUNDO_DIR, nome), 'utf8'));
}

const mundo = lerJson('world.json') as {
  id: string;
  title: string;
  description: string;
  track: string;
  levels: string[];
};

const niveis = new Map<string, Nivel>(
  IDS_NIVEIS.map((id) => [id, lerJson(`${id}.json`) as Nivel]),
);

/**
 * A TABELA EXATA do desenho dos níveis (byte-a-byte): é o contrato de I/O que
 * o motor corre. Inputs/outputs sempre com os \n finais; `hidden: true` só nos
 * casos ocultos (omissão = caso visível).
 */
const DESENHO: Record<string, Caso[]> = {
  'nivel-1': [
    { name: 'Ana', input: 'Ana\n', expectedOutput: 'Bem-vindo, Ana!\n' },
    { name: 'robot', input: 'robot\n', expectedOutput: 'Bem-vindo, robot!\n' },
    { name: 'nome de uma letra', input: 'Z\n', expectedOutput: 'Bem-vindo, Z!\n', hidden: true },
    { name: 'Lia', input: 'Lia\n', expectedOutput: 'Bem-vindo, Lia!\n', hidden: true },
  ],
  'nivel-2': [
    { name: 'três caixas', input: '3\n1 2 3\n', expectedOutput: '6\n' },
    { name: 'uma caixa', input: '1\n42\n', expectedOutput: '42\n' },
    { name: 'nenhuma caixa', input: '0\n\n', expectedOutput: '0\n', hidden: true },
    { name: 'pesos negativos', input: '5\n-1 2 -3 4 5\n', expectedOutput: '7\n', hidden: true },
  ],
  'nivel-3': [
    { name: 'três prateleiras', input: '3\n2 1 3\n', expectedOutput: '8\n' },
    { name: 'uma prateleira', input: '1\n5\n', expectedOutput: '5\n' },
    { name: 'nenhuma prateleira', input: '0\n\n', expectedOutput: '0\n', hidden: true },
    { name: 'quatro leves', input: '4\n1 1 1 1\n', expectedOutput: '7\n', hidden: true },
  ],
  'nivel-4': [
    { name: 'fila com empate', input: '3\n2 1\n5 3\n1 3\n', expectedOutput: '1 3\n5 3\n2 1\n' },
    { name: 'uma encomenda', input: '1\n9 9\n', expectedOutput: '9 9\n' },
    { name: 'empate total', input: '2\n2 1\n1 1\n', expectedOutput: '1 1\n2 1\n', hidden: true },
    { name: 'fila vazia', input: '0\n\n', expectedOutput: '', hidden: true },
  ],
  chefe: [
    // Regra do nivel-3: 2+5+1 + (3-1) = 10 (ver nota de autoria no cabeçalho).
    { name: 'o relatório do dia', input: '3\na 2 1\nb 5 3\nc 1 3\n', expectedOutput: '10\n1 3\n' },
    // Caso extra (>=4 casos por nível): empate de prioridade desempatado pelo peso.
    { name: 'empate na prioridade', input: '2\na 1 2\nb 3 2\n', expectedOutput: '5\n1 2\n' },
    { name: 'uma encomenda só', input: '1\nx 4 2\n', expectedOutput: '4\n4 2\n', hidden: true },
    { name: 'depósito vazio', input: '0\n\n', expectedOutput: '0\nvazio\n', hidden: true },
  ],
};

// ---------------------------------------------------------------------------
// Toolchains (skip condicional quando ausentes) e helpers de compilação
// ---------------------------------------------------------------------------

function ferramentaDisponivel(cmd: string): boolean {
  return spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
}

const TEM_GCC = ferramentaDisponivel('gcc');
const TEM_PYTHON = ferramentaDisponivel('python3');
const TEM_RUST = ferramentaDisponivel('rustc');

const SKIP: Record<LangId, string | false> = {
  c: TEM_GCC ? false : 'gcc ausente neste ambiente',
  python: TEM_PYTHON ? false : 'python3 ausente neste ambiente',
  rust: TEM_RUST ? false : 'rustc ausente neste ambiente',
};

/** Compila `codigo` em `dir` (gcc / py_compile / rustc). Só escreve em tmp. */
function compilar(lang: LangId, codigo: string, dir: string): { ok: boolean; erro: string } {
  fs.mkdirSync(dir, { recursive: true });
  const fonte =
    lang === 'c' ? path.join(dir, 'prog.c') : lang === 'rust' ? path.join(dir, 'prog.rs') : path.join(dir, 'prog.py');
  fs.writeFileSync(fonte, codigo, 'utf8');
  const r =
    lang === 'c'
      ? spawnSync('gcc', ['-O2', '-std=c11', '-o', path.join(dir, 'prog'), fonte], { encoding: 'utf8' })
      : lang === 'rust'
        ? spawnSync('rustc', ['-O', '-o', path.join(dir, 'prog'), fonte], { encoding: 'utf8' })
        : spawnSync('python3', ['-m', 'py_compile', fonte], { encoding: 'utf8' });
  return { ok: r.status === 0, erro: r.stderr ?? '' };
}

/** Corre o programa compilado com `entrada` no stdin e devolve o stdout cru. */
function executar(lang: LangId, dir: string, entrada: string): { saida: Buffer; status: number | null } {
  const r =
    lang === 'python'
      ? spawnSync('python3', [path.join(dir, 'prog.py')], { input: entrada })
      : spawnSync(path.join(dir, 'prog'), [], { input: entrada });
  return { saida: r.stdout ?? Buffer.alloc(0), status: r.status };
}

/** Comparação BYTE-A-BYTE (os \n finais contam). */
function igualByteAByte(rotulo: string, esperado: string, obtido: Buffer): void {
  const alvo = Buffer.from(esperado, 'utf8');
  assert.ok(
    obtido.equals(alvo),
    `${rotulo}: saída difere byte-a-byte\n  esperado: ${JSON.stringify(esperado)}\n  obtido:   ${JSON.stringify(obtido.toString('utf8'))}`,
  );
}

/** Linhas não vazias (o mesmo critério do par de otimização). */
function linhasNaoVazias(codigo: string): number {
  return codigo.split('\n').filter((linha) => linha.trim() !== '').length;
}

// ---------------------------------------------------------------------------
// (a) Schema dos 5 ficheiros
// ---------------------------------------------------------------------------

describe('a) schema dos 5 ficheiros de conteúdo', () => {
  it('world.json bate certo com o contrato e com o desenho do mundo', () => {
    assert.equal(mundo.id, 'mundo-1');
    assert.equal(mundo.title, 'O robô do depósito');
    assert.equal(mundo.track, 'c-iniciante');
    assert.ok(mundo.description.length > 0, 'world.description vazio');
    assert.deepStrictEqual(mundo.levels, [...IDS_NIVEIS]);
    // O motor (Zod) tem de aceitar o world tal como está em disco.
    GameWorldSchema.parse(mundo);
  });

  it('ids coerentes: cada world.levels tem ficheiro e cada ficheiro está em world.levels', () => {
    for (const id of IDS_NIVEIS) {
      const n = niveis.get(id);
      assert.ok(n, `ficheiro ${id}.json em falta`);
      assert.equal(n.id, id, `id interno de ${id}.json difere do nome do ficheiro`);
      assert.ok(mundo.levels.includes(id), `world.levels não traz ${id}`);
    }
    assert.equal(mundo.levels.length, IDS_NIVEIS.length, 'world.levels com tamanho diferente da lista canónica');
  });

  for (const id of IDS_NIVEIS) {
    it(`${id}: contrato completo (cases >= 4, hidden coerente, langs, optimize)`, () => {
      const n = niveis.get(id)!;
      assert.ok(n.title.length > 0, `${id}: title vazio`);
      assert.ok(n.enunciado.length > 0, `${id}: enunciado vazio`);
      assert.ok(Array.isArray(n.introduces) && n.introduces.length > 0, `${id}: introduces vazio`);
      for (const conceito of n.introduces) assert.ok(conceito.length > 0, `${id}: introduces com item vazio`);
      assert.equal(typeof n.boss, 'boolean');
      assert.equal(n.boss, id === 'chefe', `${id}: boss deve ser ${id === 'chefe'}`);

      assert.equal(n.contract.mode, 'io', `${id}: contract.mode tem de ser "io"`);
      const casos = n.contract.cases;
      assert.ok(casos.length >= 4, `${id}: ${casos.length} casos (mínimo 4)`);
      const nomes = new Set<string>();
      let ocultos = 0;
      for (const caso of casos) {
        assert.ok(caso.name.length > 0, `${id}: caso sem name`);
        assert.equal(typeof caso.input, 'string', `${id}/${caso.name}: input tem de ser string`);
        assert.equal(typeof caso.expectedOutput, 'string', `${id}/${caso.name}: expectedOutput tem de ser string`);
        // hidden coerente: ou omitido (visível) ou true (oculto) — nunca false solto.
        assert.ok(caso.hidden === undefined || caso.hidden === true, `${id}/${caso.name}: hidden tem de ser true ou ausente`);
        if (caso.hidden) ocultos += 1;
        assert.ok(!nomes.has(caso.name), `${id}: name duplicado "${caso.name}"`);
        nomes.add(caso.name);
      }
      assert.ok(ocultos >= 1, `${id}: nenhum caso hidden`);
      assert.ok(casos.length - ocultos >= 1, `${id}: nenhum caso visível`);

      for (const lang of LINGUAGENS) {
        const cod = n.langs[lang];
        assert.ok(cod, `${id}: langs.${lang} em falta`);
        assert.ok(cod.reference.length > 0, `${id}: langs.${lang}.reference vazio`);
        assert.ok(cod.starter.length > 0, `${id}: langs.${lang}.starter vazio`);
      }

      assert.ok(Number.isInteger(n.optimize.lines.par) && n.optimize.lines.par > 0, `${id}: optimize.lines.par inválido`);
      assert.ok(Number.isInteger(n.optimize.timeMs.parMs) && n.optimize.timeMs.parMs > 0, `${id}: optimize.timeMs.parMs inválido`);

      // E o motor (Zod) tem de aceitar o nível tal como está em disco.
      GameLevelSchema.parse(n);
    });

    it(`${id}: casos byte-a-byte exatamente como no desenho`, () => {
      assert.deepStrictEqual(niveis.get(id)!.contract.cases, DESENHO[id]);
    });
  }
});

// ---------------------------------------------------------------------------
// (b) Enunciados pt-BR, tom do app, sem travessões
// ---------------------------------------------------------------------------

describe('b) enunciados pt-BR, tom do app (você, direto) e sem travessões', () => {
  it('sem travessão "—" em title/description/enunciado do mundo e dos níveis', () => {
    const campos: Array<[string, string]> = [
      ['world.title', mundo.title],
      ['world.description', mundo.description],
    ];
    for (const id of IDS_NIVEIS) {
      campos.push([`${id}.title`, niveis.get(id)!.title], [`${id}.enunciado`, niveis.get(id)!.enunciado]);
    }
    for (const [rotulo, texto] of campos) {
      assert.ok(!texto.includes('—'), `${rotulo} contém travessão "—": ${texto}`);
    }
  });

  it('cada enunciado fala com "você" e tem acentuação pt-BR', () => {
    for (const id of IDS_NIVEIS) {
      const enunciado = niveis.get(id)!.enunciado;
      // Sem \b: o limite de palavra do JS é ASCII-only e "ê" não conta como
      // palavra, então /\bvocê\b/ nunca casaria.
      assert.ok(/você/i.test(enunciado), `${id}: enunciado não fala com "você"`);
      assert.ok(/[áàâãéêíóôõúç]/i.test(enunciado), `${id}: enunciado sem acentuação pt-BR`);
    }
  });
});

// ---------------------------------------------------------------------------
// (c) Execução REAL das referências
// ---------------------------------------------------------------------------

describe('c) execução real das referências contra os casos (byte-a-byte)', () => {
  for (const id of IDS_NIVEIS) {
    for (const lang of LINGUAGENS) {
      it(`referência ${lang} de ${id} passa todos os casos byte-a-byte`, { skip: SKIP[lang] }, () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'games-content-ref-'));
        try {
          const n = niveis.get(id)!;
          const comp = compilar(lang, n.langs[lang].reference, dir);
          assert.ok(comp.ok, `referência ${lang} de ${id} não compilou:\n${comp.erro}`);
          for (const caso of n.contract.cases) {
            const { saida, status } = executar(lang, dir, caso.input);
            assert.equal(status, 0, `${id}/${lang}/${caso.name}: exit ${status}`);
            igualByteAByte(`${id}/${lang}/${caso.name}`, caso.expectedOutput, saida);
          }
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// (d) Starters: compilam e falham >= 1 caso visível
// ---------------------------------------------------------------------------

describe('d) starters: compilam e falham em pelo menos 1 caso visível', () => {
  for (const id of IDS_NIVEIS) {
    for (const lang of LINGUAGENS) {
      it(`starter ${lang} de ${id} compila e falha >=1 caso visível`, { skip: SKIP[lang] }, () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'games-content-starter-'));
        try {
          const n = niveis.get(id)!;
          const comp = compilar(lang, n.langs[lang].starter, dir);
          assert.ok(comp.ok, `starter ${lang} de ${id} não compilou:\n${comp.erro}`);
          const visiveis = n.contract.cases.filter((caso) => !caso.hidden);
          const falhas = visiveis.filter((caso) => {
            const { saida } = executar(lang, dir, caso.input);
            return !saida.equals(Buffer.from(caso.expectedOutput, 'utf8'));
          });
          assert.ok(
            falhas.length >= 1,
            `starter ${lang} de ${id} passa todos os ${visiveis.length} casos visíveis (starter tem de ser incompleto)`,
          );
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// (e) Par de otimização (ver REGRA DO PAR no cabeçalho)
// ---------------------------------------------------------------------------

describe('e) par de otimização: par >= linhas não vazias da referência mais curta + 2', () => {
  for (const id of IDS_NIVEIS) {
    it(`${id}: par cumpre a regra (par único apesar das 3 linguagens)`, () => {
      const n = niveis.get(id)!;
      const porLingua = LINGUAGENS.map((lang) => [lang, linhasNaoVazias(n.langs[lang].reference)] as const);
      const maisCurta = Math.min(...porLingua.map(([, linhas]) => linhas));
      const minimo = maisCurta + 2;
      assert.ok(
        n.optimize.lines.par >= minimo,
        `${id}: par ${n.optimize.lines.par} < ${minimo} (referência mais curta = ${maisCurta} linhas não vazias; ${porLingua
          .map(([lang, linhas]) => `${lang}:${linhas}`)
          .join(' ')})`,
      );
    });
  }
});
