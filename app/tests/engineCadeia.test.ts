/**
 * tests/engineCadeia.test.ts — a CADEIA DE CURSOS
 * (`electron/main/engine/graph/cadeia.ts` + os três campos aditivos de
 * `content/trackTypes.ts`).
 *
 * O que estes casos travam, e por que cada um existe:
 *
 *   1. ADITIVIDADE — trilha que NÃO declara `cadeia`/`nivel`/`cursoAnterior`
 *      carrega sem issue e devolve `[]`. É o contrato de campo aditivo (§10 do
 *      `docs/16-engine-de-trilha.md`) e é o estado do `c-iniciante` no disco.
 *   2. PRIMEIRO DA CADEIA — `nivel: 1` + `cursoAnterior: null` → `[]`. Ausência
 *      de predecessor é RESPOSTA, não erro.
 *   3. O RAMO (b) DA REMEDIAÇÃO — chave ensinada no curso anterior volta com o
 *      endereço `<slug>/<módulo>/<aula>`. Sem isto, "existe no curso anterior"
 *      (reintroduzir na porta-de-entrada) é indistinguível de "não existe em
 *      lugar nenhum" (quebrar a aula em mais aulas).
 *   4. O MAIS ANTIGO GANHA — chave ensinada no curso 1 e REENSINADA no curso 2
 *      aponta para o curso 1: a porta reintroduz o que o curso anterior
 *      ensinou, e apontar para a reintrodução esconderia a origem.
 *   5. FAIL-CLOSED em cinco frentes — ciclo, nível repetido, predecessor de
 *      OUTRA cadeia, predecessor inexistente e curso anterior ilegível. Uma
 *      lista silenciosamente errada mandaria reintroduzir construção que o
 *      curso anterior nunca ensinou, e isso é invisível na revisão.
 *   6. O DISCO REAL DE HOJE (o número medido) — as três trilhas publicadas são
 *      o PRIMEIRO curso de cada cadeia: 0 cursos anteriores e 0 chaves
 *      herdadas. Hoje a resposta é sempre o ramo (c), quebrar a aula; o valor
 *      da função é a cadeia dos cursos 2-4 que os contratos desenharam.
 *
 * Sem rede, sem LLM. O disco é usado de propósito (é o que a função lê): as
 * fixtures são diretórios em `os.tmpdir()`, e o caso 6 lê
 * `resources/tracks/` — SÓ os `track.json`, nunca as aulas, para não depender
 * de curso em autoria.
 *
 * As fixtures ensinam JavaScript (o adaptador default, o único que roda sem
 * toolchain externa) e usam `cadeia: 'python'` só como ID DE GRUPO — o id de
 * cadeia é um rótulo de currículo, não a linguagem da trilha.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs, mkdtempSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { loadTrack, type LoadedTrack } from '../electron/main/content/trackLoader';
import {
  TRACK_SCHEMA_VERSION,
  validateTrackChain,
  validateTrackSource,
} from '../electron/main/content/trackTypes';
import {
  CadeiaError,
  cadeiaAnteriorDe,
  declaracaoDeCadeia,
  ensinadoAntesNaCadeia,
} from '../electron/main/engine/graph/cadeia';

const TRACKS_REAIS = path.resolve(__dirname, '..', 'resources', 'tracks');

/** A chave de átomo que as fixtures usam como "construção da fronteira". */
const CHAVE_DE_FRONTEIRA = 'api:console.log';

interface AulaDaFixture {
  slug: string;
  /** chaves PRODUTIVAS declaradas (modo `declared` do orçamento). */
  introduces?: string[];
  /** true → escreve uma aula INVÁLIDA (teoria vazia) para provar o fail-closed. */
  quebrada?: boolean;
}

interface CursoDaFixture {
  slug: string;
  cadeia?: string;
  nivel?: number;
  cursoAnterior?: string | null;
  aulas?: AulaDaFixture[];
  /** slug DECLARADO diferente do diretório (caso CADEIA_SLUG_DIVERGENTE). */
  slugDeclarado?: string;
}

function tmpTracksDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'engine-cadeia-'));
}

/** Escreve um curso mínimo (1 módulo, N aulas sem desafio) em `<tracksDir>/<slug>`. */
async function escreveCurso(tracksDir: string, curso: CursoDaFixture): Promise<string> {
  const dir = path.join(tracksDir, curso.slug);
  const aulas = curso.aulas ?? [{ slug: 'aula-1' }];
  const raiz: Record<string, unknown> = {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: curso.slugDeclarado ?? curso.slug,
    title: `Curso ${curso.slug}`,
    description: 'Fixture de cadeia.',
    language: 'pt-BR',
    domain: 'programming',
    modules: ['modulo-1'],
  };
  if (curso.cadeia !== undefined) raiz.cadeia = curso.cadeia;
  if (curso.nivel !== undefined) raiz.nivel = curso.nivel;
  if (curso.cursoAnterior !== undefined) raiz.cursoAnterior = curso.cursoAnterior;

  await fs.mkdir(path.join(dir, 'modules', 'modulo-1', 'lessons'), { recursive: true });
  await fs.writeFile(path.join(dir, 'track.json'), JSON.stringify(raiz, null, 2), 'utf8');
  await fs.writeFile(
    path.join(dir, 'modules', 'modulo-1', 'module.json'),
    JSON.stringify(
      {
        schemaVersion: TRACK_SCHEMA_VERSION,
        slug: 'modulo-1',
        title: 'Módulo 1',
        order: 1,
        lessons: aulas.map((a) => a.slug),
      },
      null,
      2,
    ),
    'utf8',
  );
  for (const aula of aulas) {
    const dirAula = path.join(dir, 'modules', 'modulo-1', 'lessons', aula.slug);
    await fs.mkdir(dirAula, { recursive: true });
    const meta: Record<string, unknown> = {
      schemaVersion: TRACK_SCHEMA_VERSION,
      slug: aula.slug,
      title: `Aula ${aula.slug}`,
      summary: 'Resumo da aula.',
      difficulty: 1,
      concepts: ['conceito'],
      prerequisites: [],
      // `theory: []` é INVÁLIDO para o loader — é assim que a fixture fabrica
      // um curso anterior ILEGÍVEL sem corromper o JSON.
      theory: aula.quebrada ? [] : [{ id: 'introducao', title: 'Introdução', markdown: 'Texto.' }],
      sources: [],
      challenges: [],
    };
    if (aula.introduces) meta.introduces = { productive: aula.introduces };
    await fs.writeFile(path.join(dirAula, 'lesson.json'), JSON.stringify(meta, null, 2), 'utf8');
  }
  return dir;
}

/** Escreve os cursos e carrega o ÚLTIMO (o "curso atual" do teste). */
async function montaCadeia(cursos: CursoDaFixture[]): Promise<{ tracksDir: string; atual: LoadedTrack }> {
  const tracksDir = tmpTracksDir();
  let ultimo = '';
  for (const curso of cursos) ultimo = await escreveCurso(tracksDir, curso);
  return { tracksDir, atual: await loadTrack(ultimo) };
}

describe('trackTypes — os três campos aditivos da cadeia', () => {
  it('as três ausentes NÃO produzem issue (aditividade) e as três presentes validam', () => {
    assert.deepEqual(validateTrackChain({ slug: 'sem-cadeia' }, 'track.json'), []);
    assert.deepEqual(
      validateTrackChain({ slug: 'py-1', cadeia: 'python', nivel: 1, cursoAnterior: null }, 'track.json'),
      [],
    );
  });

  it('meia declaração é ERRO: quem lesse teria de adivinhar qual metade valia', () => {
    const issues = validateTrackChain({ slug: 'py-2', nivel: 2 }, 'track.json');
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /cadeia incompleta/);
    assert.match(issues[0].message, /'cadeia'/);
    assert.match(issues[0].message, /'cursoAnterior'/);
  });

  it('rejeita cadeia desconhecida, nivel fora de 1..4 e cursoAnterior apontando para si', () => {
    assert.match(
      validateTrackChain({ slug: 'x', cadeia: 'cobol' as never, nivel: 1, cursoAnterior: null }, 'f')[0].message,
      /cadeia inválida/,
    );
    assert.match(
      validateTrackChain({ slug: 'x', cadeia: 'python', nivel: 5, cursoAnterior: 'y' }, 'f')[0].message,
      /nivel inválido/,
    );
    assert.match(
      validateTrackChain({ slug: 'x', cadeia: 'python', nivel: 2, cursoAnterior: 'x' }, 'f')[0].message,
      /própria trilha/,
    );
  });

  it('detecta BURACO sem sair do arquivo: nivel 1 com predecessor e nivel > 1 sem predecessor', () => {
    assert.match(
      validateTrackChain({ slug: 'x', cadeia: 'python', nivel: 1, cursoAnterior: 'y' }, 'f')[0].message,
      /nivel 1 com cursoAnterior/,
    );
    assert.match(
      validateTrackChain({ slug: 'x', cadeia: 'python', nivel: 3, cursoAnterior: null }, 'f')[0].message,
      /não começa no degrau 3/,
    );
  });

  it('validateTrackSource carrega a validação da cadeia (o loader usa a MESMA)', () => {
    const base = {
      schemaVersion: TRACK_SCHEMA_VERSION,
      slug: 'trilha-x',
      title: 'T',
      description: 'D',
      language: 'pt-BR',
      domain: 'programming',
      modules: ['m'],
    };
    assert.deepEqual(validateTrackSource(base, 'track.json'), []);
    assert.deepEqual(validateTrackSource({ ...base, cadeia: 'python', nivel: 1, cursoAnterior: null }, 'track.json'), []);
    assert.match(validateTrackSource({ ...base, nivel: 2 }, 'track.json')[0].message, /cadeia incompleta/);
  });
});

describe('cadeiaAnteriorDe — aditividade e primeiro curso', () => {
  it('(e) trilha SEM os campos carrega e devolve lista vazia', async () => {
    const { tracksDir, atual } = await montaCadeia([{ slug: 'sem-cadeia' }]);
    assert.equal(atual.root.cadeia, undefined);
    assert.deepEqual(await cadeiaAnteriorDe(atual, tracksDir), []);
    assert.equal((await ensinadoAntesNaCadeia(atual, tracksDir)).size, 0);
    assert.equal(declaracaoDeCadeia(atual.root, 'track.json'), null);
  });

  it('(b) nivel 1 sem predecessor devolve lista vazia — ausência é resposta, não erro', async () => {
    const { tracksDir, atual } = await montaCadeia([
      { slug: 'py-1', cadeia: 'python', nivel: 1, cursoAnterior: null },
    ]);
    assert.deepEqual(await cadeiaAnteriorDe(atual, tracksDir), []);
    assert.equal((await ensinadoAntesNaCadeia(atual, tracksDir)).size, 0);
    assert.deepEqual(declaracaoDeCadeia(atual.root, 'track.json'), {
      cadeia: 'python',
      nivel: 1,
      cursoAnterior: null,
    });
  });

  it('devolve os anteriores DO MAIS PRÓXIMO AO MAIS DISTANTE, com nivel e dir', async () => {
    const { tracksDir, atual } = await montaCadeia([
      { slug: 'py-1', cadeia: 'python', nivel: 1, cursoAnterior: null },
      { slug: 'py-2', cadeia: 'python', nivel: 2, cursoAnterior: 'py-1' },
      { slug: 'py-3', cadeia: 'python', nivel: 3, cursoAnterior: 'py-2' },
    ]);
    const anteriores = await cadeiaAnteriorDe(atual, tracksDir);
    assert.deepEqual(
      anteriores.map((c) => `${c.slug}@${c.nivel}`),
      ['py-2@2', 'py-1@1'],
    );
    assert.equal(anteriores[0].dir, path.join(tracksDir, 'py-2'));
  });
});

describe('ensinadoAntesNaCadeia — o ramo (b) da remediação', () => {
  it('(a) chave ensinada no curso 1 volta com o endereço <slug>/<módulo>/<aula>', async () => {
    const { tracksDir, atual } = await montaCadeia([
      {
        slug: 'py-1',
        cadeia: 'python',
        nivel: 1,
        cursoAnterior: null,
        aulas: [{ slug: 'aula-1', introduces: [CHAVE_DE_FRONTEIRA] }],
      },
      { slug: 'py-2', cadeia: 'python', nivel: 2, cursoAnterior: 'py-1' },
    ]);
    const mapa = await ensinadoAntesNaCadeia(atual, tracksDir);
    assert.equal(mapa.get(CHAVE_DE_FRONTEIRA), 'py-1/modulo-1/aula-1');
    // Chave que NINGUÉM ensinou antes → ausente: é o ramo (c), quebrar a aula.
    assert.equal(mapa.has('api:fetch'), false);
  });

  it('a chave reensinada no curso 2 aponta para o curso 1 — o MAIS ANTIGO ganha', async () => {
    const { tracksDir, atual } = await montaCadeia([
      {
        slug: 'py-1',
        cadeia: 'python',
        nivel: 1,
        cursoAnterior: null,
        aulas: [{ slug: 'onde-nasce', introduces: [CHAVE_DE_FRONTEIRA] }],
      },
      {
        slug: 'py-2',
        cadeia: 'python',
        nivel: 2,
        cursoAnterior: 'py-1',
        aulas: [{ slug: 'a-porta', introduces: [CHAVE_DE_FRONTEIRA] }],
      },
      { slug: 'py-3', cadeia: 'python', nivel: 3, cursoAnterior: 'py-2' },
    ]);
    const mapa = await ensinadoAntesNaCadeia(atual, tracksDir);
    assert.equal(mapa.get(CHAVE_DE_FRONTEIRA), 'py-1/modulo-1/onde-nasce');
  });

  it('curso anterior ILEGÍVEL lança CADEIA_CURSO_ILEGIVEL (o caminho, porém, continua legível)', async () => {
    const { tracksDir, atual } = await montaCadeia([
      {
        slug: 'py-1',
        cadeia: 'python',
        nivel: 1,
        cursoAnterior: null,
        aulas: [{ slug: 'aula-1', quebrada: true }],
      },
      { slug: 'py-2', cadeia: 'python', nivel: 2, cursoAnterior: 'py-1' },
    ]);
    // O caminho da cadeia só lê `track.json` — e por isso continua respondendo.
    assert.deepEqual((await cadeiaAnteriorDe(atual, tracksDir)).map((c) => c.slug), ['py-1']);
    await assert.rejects(
      () => ensinadoAntesNaCadeia(atual, tracksDir),
      (err: unknown) => {
        assert.ok(err instanceof CadeiaError);
        assert.equal(err.code, 'CADEIA_CURSO_ILEGIVEL');
        assert.equal(err.detalhes.slug, 'py-1');
        return true;
      },
    );
  });
});

describe('cadeiaAnteriorDe — fail-closed', () => {
  it('(c) ciclo A → B → A LANÇA, com o caminho fechado na mensagem', async () => {
    const tracksDir = tmpTracksDir();
    await escreveCurso(tracksDir, { slug: 'ciclo-a', cadeia: 'python', nivel: 3, cursoAnterior: 'ciclo-b' });
    await escreveCurso(tracksDir, { slug: 'ciclo-b', cadeia: 'python', nivel: 2, cursoAnterior: 'ciclo-a' });
    const atual = await loadTrack(path.join(tracksDir, 'ciclo-a'));
    await assert.rejects(
      () => cadeiaAnteriorDe(atual, tracksDir),
      (err: unknown) => {
        assert.ok(err instanceof CadeiaError);
        assert.equal(err.code, 'CADEIA_CICLO');
        assert.deepEqual(err.detalhes.caminhoDaCadeia, ['ciclo-a', 'ciclo-b', 'ciclo-a']);
        return true;
      },
    );
  });

  it('(d) cursoAnterior de OUTRA cadeia LANÇA', async () => {
    const tracksDir = tmpTracksDir();
    await escreveCurso(tracksDir, { slug: 'py-1', cadeia: 'python', nivel: 1, cursoAnterior: null });
    await escreveCurso(tracksDir, { slug: 'rs-2', cadeia: 'rust', nivel: 2, cursoAnterior: 'py-1' });
    const atual = await loadTrack(path.join(tracksDir, 'rs-2'));
    await assert.rejects(
      () => cadeiaAnteriorDe(atual, tracksDir),
      (err: unknown) => {
        assert.ok(err instanceof CadeiaError);
        assert.equal(err.code, 'CADEIA_TROCADA');
        assert.equal(err.detalhes.cadeia, 'rust');
        return true;
      },
    );
  });

  it('nivel REPETIDO entre curso e predecessor LANÇA (dois cursos no mesmo degrau)', async () => {
    const tracksDir = tmpTracksDir();
    await escreveCurso(tracksDir, { slug: 'py-1', cadeia: 'python', nivel: 1, cursoAnterior: null });
    await escreveCurso(tracksDir, { slug: 'py-2a', cadeia: 'python', nivel: 2, cursoAnterior: 'py-1' });
    await escreveCurso(tracksDir, { slug: 'py-2b', cadeia: 'python', nivel: 2, cursoAnterior: 'py-2a' });
    const atual = await loadTrack(path.join(tracksDir, 'py-2b'));
    await assert.rejects(
      () => cadeiaAnteriorDe(atual, tracksDir),
      (err: unknown) => {
        assert.ok(err instanceof CadeiaError);
        assert.equal(err.code, 'CADEIA_NIVEL_REPETIDO');
        return true;
      },
    );
  });

  it('predecessor INEXISTENTE LANÇA CADEIA_CURSO_AUSENTE', async () => {
    const { tracksDir, atual } = await montaCadeia([
      { slug: 'py-2', cadeia: 'python', nivel: 2, cursoAnterior: 'py-1-que-nao-existe' },
    ]);
    await assert.rejects(
      () => cadeiaAnteriorDe(atual, tracksDir),
      (err: unknown) => {
        assert.ok(err instanceof CadeiaError);
        assert.equal(err.code, 'CADEIA_CURSO_AUSENTE');
        assert.equal(err.detalhes.slug, 'py-1-que-nao-existe');
        return true;
      },
    );
  });

  it('slug declarado ≠ diretório LANÇA (o endereço apontaria para curso que ninguém acha)', async () => {
    const tracksDir = tmpTracksDir();
    await escreveCurso(tracksDir, {
      slug: 'py-1',
      slugDeclarado: 'outro-nome',
      cadeia: 'python',
      nivel: 1,
      cursoAnterior: null,
    });
    await escreveCurso(tracksDir, { slug: 'py-2', cadeia: 'python', nivel: 2, cursoAnterior: 'py-1' });
    const atual = await loadTrack(path.join(tracksDir, 'py-2'));
    await assert.rejects(
      () => cadeiaAnteriorDe(atual, tracksDir),
      (err: unknown) => {
        assert.ok(err instanceof CadeiaError);
        assert.equal(err.code, 'CADEIA_SLUG_DIVERGENTE');
        return true;
      },
    );
  });

  it('predecessor que NÃO declara cadeia LANÇA (quem entra numa cadeia declara a cadeia)', async () => {
    const tracksDir = tmpTracksDir();
    await escreveCurso(tracksDir, { slug: 'py-1', /* sem os campos */ });
    await escreveCurso(tracksDir, { slug: 'py-2', cadeia: 'python', nivel: 2, cursoAnterior: 'py-1' });
    const atual = await loadTrack(path.join(tracksDir, 'py-2'));
    await assert.rejects(
      () => cadeiaAnteriorDe(atual, tracksDir),
      (err: unknown) => {
        assert.ok(err instanceof CadeiaError);
        assert.equal(err.code, 'CADEIA_DECLARACAO_INVALIDA');
        return true;
      },
    );
  });
});

describe('o disco real de hoje — o número medido', () => {
  it('as 3 trilhas publicadas são o PRIMEIRO curso da cadeia: 0 anteriores, 0 chaves herdadas', async () => {
    // Lê SÓ o `track.json` de cada trilha (nunca as aulas): o `c-iniciante`
    // está em autoria e 113 das 115 aulas dele são esqueleto.
    for (const slug of ['python-iniciante', 'rust-iniciante', 'c-iniciante']) {
      const raiz = JSON.parse(await fs.readFile(path.join(TRACKS_REAIS, slug, 'track.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      assert.deepEqual(validateTrackSource(raiz, `${slug}/track.json`), [], `${slug}: track.json inválido`);
      const atual = {
        root: raiz as unknown as LoadedTrack['root'],
        modules: [],
        proficiency: null,
        dir: path.join(TRACKS_REAIS, slug),
      } as LoadedTrack;
      assert.deepEqual(await cadeiaAnteriorDe(atual, TRACKS_REAIS), [], `${slug}: esperado 0 cursos anteriores`);
      assert.equal((await ensinadoAntesNaCadeia(atual, TRACKS_REAIS)).size, 0, `${slug}: esperado 0 chaves herdadas`);
    }
  });

  it('os TRÊS cursos do disco declaram a cadeia, e todos são nível 1', async () => {
    // O pin nasceu com `c-iniciante` FORA da cadeia (o curso estava em autoria
    // quando `graph/cadeia.ts` foi escrito, no mesmo dia). A declaração entrou
    // em 2026-09-22, depois de o módulo `a-tela` fechar, e o pin passou a medir
    // a verdade nova. A ADITIVIDADE continua provada — pelo caso `trilha sem os
    // três campos carrega e devolve lista vazia`, que é o teste dela, com
    // fixture própria; ela nunca dependeu de um curso de produção estar
    // incompleto.
    const lerRaiz = async (slug: string): Promise<Record<string, unknown>> =>
      JSON.parse(await fs.readFile(path.join(TRACKS_REAIS, slug, 'track.json'), 'utf8')) as Record<string, unknown>;
    const py = await lerRaiz('python-iniciante');
    assert.deepEqual([py.cadeia, py.nivel, py.cursoAnterior], ['python', 1, null]);
    const rs = await lerRaiz('rust-iniciante');
    assert.deepEqual([rs.cadeia, rs.nivel, rs.cursoAnterior], ['rust', 1, null]);
    const c = await lerRaiz('c-iniciante');
    assert.deepEqual([c.cadeia, c.nivel, c.cursoAnterior], ['c', 1, null]);
  });
});
