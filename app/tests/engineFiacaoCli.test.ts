/**
 * tests/engineFiacaoCli.test.ts — a ONDA `onda3-cli-fiacao` (`fe395f9`) como
 * SUBPROCESSO REAL. Ela ligou quatro comandos e uma fiação nova dentro do
 * `repair`, e entrou em main com ZERO teste.
 *
 * POR QUE ESTE ARQUIVO EXISTE, dito sem maquiagem: a ausência de cobertura foi
 * erro de PROMPT, não do autor — o portão daquela onda estava escrito como
 * "`npm test` → 3769/3767/0/2", e acrescentar teste mudaria o número e leria
 * como portão vermelho. O trabalho foi validado À MÃO por um revisor, que
 * registrou "isso é validação minha, não do repositório". Este arquivo põe a
 * validação NO REPOSITÓRIO, na ordem de urgência que o próprio revisor deu.
 *
 * O QUE ESTÁ TRAVADO AQUI, e por que cada bloco existe:
 *
 *   1. `repair --mover` / `--criar-aulas` — a MAIS urgente. É a única
 *      invocação do produto que combina DOIS executores com efeito colateral
 *      sobre a MESMA trilha: a MOVIMENTAÇÃO grava a ordem nova, o repair
 *      RE-ENTRA sobre a trilha JÁ MOVIDA e só o RESIDUAL vai para a LLM
 *      corretora. Ordenação sutil é o que regride em silêncio num refactor.
 *   2. `reorder --aplicar` — grava EXATAMENTE `module.json` (e `track.json`
 *      quando um MÓDULO se move), escrita atômica sem `.tmp` sobrando, e o
 *      dry-run não toca em byte nenhum.
 *   3. `gap` — planeja sem LLM e sem chave; `--aplicar` sem `--modelo-revisor`
 *      é uso incorreto (exit 2) com ZERO arquivo tocado.
 *   4. `discrimination` — a ÚNICA EXCEÇÃO declarada à convenção de exit code
 *      do repositório: sai 0 mesmo com achado, e mesmo com desafio NÃO MEDIDO.
 *      Exceção sem teste é armadilha esperando refactor.
 *   5. `requirements` — trilha cuja linguagem não tem derivação escrita ABORTA
 *      declarando (exit 2), em vez de ler o teste com o parser de outra
 *      linguagem e inventar gap em todo desafio.
 *
 * COMO ISTO É TESTE DE VERDADE (o espírito da EMPTY-GLOB GUARD de `tools/t.sh`:
 * "um suíte inexistente nunca passa verde"). Nenhuma asserção aqui passaria sem
 * o comando ter rodado:
 *   - todo veredito de exit code vem PAREADO com o inventário do disco (sha256
 *     de cada arquivo da fixture, antes × depois), então "exit 2" só passa se o
 *     disco também provar o que se afirma sobre a escrita;
 *   - os dois caminhos do `repair --aplicar` (com e sem `--mover`) são
 *     medidos SOBRE A MESMA FIXTURE: sem a flag o laço PRECISA da LLM e aborta;
 *     com a flag o movimento resolve as violações de ORDEM e o laço não gasta
 *     rodada nenhuma. Um teste só não distinguiria fiação de coincidência;
 *   - o `module.json` que o `repair --mover` grava é comparado BYTE A BYTE com
 *     o que o comando `reorder --aplicar` grava sozinho — é o MESMO executor,
 *     e se um dia deixar de ser, esta igualdade quebra;
 *   - `discrimination` sai 0 numa fixture onde o `coverage` — o comando irmão,
 *     mesma medição — sai != 0. Sem esse contraste, "exit 0" poderia ser só
 *     ausência de achado em vez de decisão de projeto;
 *   - `requirements` reprova a trilha de TypeScript E deriva a de Python na
 *     mesma execução de suíte: o exit 2 não é um comando quebrado para tudo.
 *
 * FIXTURES, NUNCA PRODUÇÃO. Todo comando que ESCREVE (`reorder --aplicar`,
 * `gap --aplicar`, `repair --aplicar`) roda sobre uma trilha criada em
 * `mkdtemp` e apagada no fim; os comandos que só LEEM usam as fixtures
 * commitadas em `tests/fixtures/tracks/`. `app/resources/tracks` não é lido nem
 * tocado por nenhum caso, e `app/content-src/<slug>` é conferido como INEXISTENTE
 * depois dos caminhos que poderiam criá-lo.
 *
 * ZERO REDE, ZERO CHAVE. Onde o caminho exige LLM, o que se prova é o
 * FAIL-CLOSED (abortar DECLARANDO), nunca uma resposta mockada.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const APP_DIR = path.resolve(__dirname, '..');
const TIMEOUT_CLI_MS = 180_000;

/** As fixtures COMMITADAS, alcançadas por `--dir` (nenhuma delas é escrita). */
const FIXTURE_JS = path.join(__dirname, 'fixtures', 'tracks', 'trilha-minima');
const FIXTURE_PY = path.join(__dirname, 'fixtures', 'tracks', 'trilha-python-minima');
const FIXTURE_PY_NAO_MEDIVEL = path.join(__dirname, 'fixtures', 'tracks', 'trilha-python-nao-medivel');
const FIXTURE_TS = path.join(__dirname, 'fixtures', 'tracks', 'trilha-typescript-minima');

interface SaidaDoCli {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Roda `npx tsx tools/track-engine/cli.ts <args...>` com cwd = app, SEM
 * nenhuma chave de API alcançável.
 *
 * As duas variáveis são removidas do ambiente do filho (`OPENROUTER_API_KEY` e
 * o fallback legado `DEEPSEEK_API_KEY`, os dois nomes de `@shared/llm/constants`);
 * o outro caminho de chave é o `settingsStore`, que resolve o diretório por
 * `app.getPath('userData')` e portanto NÃO existe fora do Electron. Sem chave
 * alcançável, todo caminho de LLM deste arquivo é fail-closed medido.
 *
 * `NODE_TEST_CONTEXT` é setado pelo `node:test` do processo PAI; herdado pelo
 * filho, faria o `node:test` DO SUBPROCESSO pular testes (a mesma armadilha
 * documentada em `tests/trackCli.test.ts`). Removido sempre.
 */
function runEngine(args: string[]): Promise<SaidaDoCli> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.OPENROUTER_API_KEY;
    delete env.DEEPSEEK_API_KEY;
    const child = spawn('npx', ['--no-install', 'tsx', 'tools/track-engine/cli.ts', ...args], {
      cwd: APP_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_CLI_MS);
    child.stdout.on('data', (d: Buffer) => (stdout += String(d)));
    child.stderr.on('data', (d: Buffer) => (stderr += String(d)));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// O INVENTÁRIO DO DISCO — o outro metade de cada veredito
// ---------------------------------------------------------------------------

/** sha256 de cada arquivo sob `dir`, chaveado pelo caminho relativo. */
async function inventario(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const percorrer = async (atual: string): Promise<void> => {
    for (const entrada of await fs.readdir(atual, { withFileTypes: true })) {
      const cheio = path.join(atual, entrada.name);
      if (entrada.isDirectory()) await percorrer(cheio);
      else out.set(path.relative(dir, cheio), createHash('sha256').update(await fs.readFile(cheio)).digest('hex'));
    }
  };
  await percorrer(dir);
  return out;
}

interface Delta {
  alterados: string[];
  criados: string[];
  apagados: string[];
}

function delta(antes: Map<string, string>, depois: Map<string, string>): Delta {
  const alterados: string[] = [];
  const criados: string[] = [];
  const apagados: string[] = [];
  for (const [arquivo, hash] of depois) {
    const anterior = antes.get(arquivo);
    if (anterior === undefined) criados.push(arquivo);
    else if (anterior !== hash) alterados.push(arquivo);
  }
  for (const arquivo of antes.keys()) if (!depois.has(arquivo)) apagados.push(arquivo);
  return { alterados: alterados.sort(), criados: criados.sort(), apagados: apagados.sort() };
}

/** Nenhum arquivo criado, alterado ou apagado — o disco ficou byte-idêntico. */
function assertIntacto(d: Delta, motivo: string): void {
  assert.deepEqual(d, { alterados: [], criados: [], apagados: [] }, motivo);
}

/**
 * O tmp da escrita atômica (`runtime/runState.escreverAtomico`) é
 * `.<basename>.tmp.<pid>.<hex>` no MESMO diretório do alvo. Um sobrando é
 * escrita interrompida ou rename que não aconteceu — a atomicidade quebrada.
 */
function tmpsSobrando(inv: Map<string, string>): string[] {
  return [...inv.keys()].filter((arquivo) => path.basename(arquivo).includes('.tmp.'));
}

// ---------------------------------------------------------------------------
// As fixtures ESCREVÍVEIS — nascem em mkdtemp e morrem no `finally`
// ---------------------------------------------------------------------------

const SLUG_UM_MODULO = 'trilha-ordem-simples';
const SLUG_DOIS_MODULOS = 'trilha-dois-modulos';

/** Teoria que ensina function/let/const/if/return/===/+/export e numeral. */
const TEORIA_BASE = [
  'export function saudacao(nome) {',
  "  let mensagem = 'ola';",
  '  let limite = 3;',
  "  if (nome === 'ana') {",
  "    mensagem = mensagem + ' ana';",
  '  }',
  '  return mensagem;',
  '}',
].join('\n');

/** Solução que USA `typeof` — a construção cuja aula-dona vem depois. */
const SOLUCAO_COM_TYPEOF = [
  'export function f(valor) {',
  '  let t = typeof valor;',
  "  if (t === 'number') {",
  "    return 'sim';",
  '  }',
  "  return 'nao';",
  '}',
].join('\n');

const SOLUCAO_SIMPLES = ['export function f(valor) {', '  let x = valor;', "  return 'sim';", '}'].join('\n');

interface AulaDeFixture {
  slug: string;
  conceitos: string[];
  codigoDaTeoria: string;
  solucoes: { slug: string; codigo: string }[];
}

interface ModuloDeFixture {
  slug: string;
  order: number;
  aulas: AulaDeFixture[];
}

async function escreverJson(arquivo: string, valor: unknown): Promise<void> {
  await fs.mkdir(path.dirname(arquivo), { recursive: true });
  await fs.writeFile(arquivo, `${JSON.stringify(valor, null, 2)}\n`, 'utf8');
}

/** Materializa a fixture no layout que o `loadTrack` real espera. */
async function escreverTrilha(dir: string, slug: string, modulos: ModuloDeFixture[]): Promise<void> {
  await escreverJson(path.join(dir, 'track.json'), {
    schemaVersion: 1,
    slug,
    title: 'Trilha de teste',
    description: 'fixture temporária da suíte de CLI da engine',
    language: 'pt-BR',
    domain: 'programming',
    modules: modulos.map((m) => m.slug),
  });
  for (const modulo of modulos) {
    const dirModulo = path.join(dir, 'modules', modulo.slug);
    await escreverJson(path.join(dirModulo, 'module.json'), {
      schemaVersion: 1,
      slug: modulo.slug,
      title: `Modulo ${modulo.slug}`,
      order: modulo.order,
      lessons: modulo.aulas.map((a) => a.slug),
    });
    for (const aula of modulo.aulas) {
      const dirAula = path.join(dirModulo, 'lessons', aula.slug);
      await escreverJson(path.join(dirAula, 'lesson.json'), {
        schemaVersion: 1,
        slug: aula.slug,
        title: `Aula ${aula.slug}`,
        summary: 'Resumo da aula.',
        difficulty: 1,
        concepts: aula.conceitos,
        prerequisites: [],
        theory: [
          {
            id: `t-${aula.slug}`,
            title: `Secao de ${aula.slug}`,
            markdown: 'Prosa da secao.',
            code: { language: 'js', code: aula.codigoDaTeoria },
          },
        ],
        sources: [],
        challenges: aula.solucoes.map((s) => s.slug),
      });
      for (const solucao of aula.solucoes) {
        await escreverJson(path.join(dirAula, 'challenges', solucao.slug, 'challenge.json'), {
          schemaVersion: 1,
          slug: solucao.slug,
          title: `Desafio ${solucao.slug}`,
          concept: solucao.slug,
          difficulty: 1,
          language: 'nodejs',
          statement: 'Escreva a funcao conforme o enunciado.',
          starterCode: 'export function f(valor) {\n  // complete\n}\n',
          testsCode:
            "import test from 'node:test';\nimport assert from 'node:assert/strict';\n" +
            "import { f } from './solution.mjs';\ntest('f', () => { assert.equal(f(1), 'sim'); });\n",
          solutionCode: solucao.codigo,
          expectedTestCount: 1,
        });
      }
    }
  }
}

/**
 * FIXTURE A — a violação de ORDEM canônica, num módulo só: `a02` cobra
 * `typeof` no desafio e `a03`, a aula que o ensina, vem DEPOIS. O movimento
 * mínimo (`a03` para antes de `a02`) resolve e não quebra ninguém — é o caso
 * que a própria mensagem do audit manda executar ("mova a aula que a ensina
 * para antes"). Sobram DUAS lacunas de currículo (`node:CallExpression` sem
 * aula dona), de propósito: o `gap` precisa de lacuna para planejar, e o
 * `repair --mover` precisa de um residual que a movimentação NÃO resolva.
 */
function trilhaDeUmModulo(): ModuloDeFixture[] {
  return [
    {
      slug: 'm01',
      order: 1,
      aulas: [
        { slug: 'a01', conceitos: ['base'], codigoDaTeoria: TEORIA_BASE, solucoes: [{ slug: 'c1', codigo: SOLUCAO_SIMPLES }] },
        { slug: 'a02', conceitos: ['cobra'], codigoDaTeoria: 'let z = 1 + 2;', solucoes: [{ slug: 'c2', codigo: SOLUCAO_COM_TYPEOF }] },
        { slug: 'a03', conceitos: ['ensina'], codigoDaTeoria: 'const tipo = typeof 10;', solucoes: [] },
      ],
    },
  ];
}

/**
 * FIXTURE B — quem ensina `typeof` está no MÓDULO SEGUINTE. Mover só a aula
 * exigiria mover o diretório dela; o executor move o MÓDULO inteiro, e é o
 * único caso em que `track.json` também é reescrito (a ordem do array
 * `modules` é a que o `loadTrack` usa). As DUAS aulas de `m01` cobram `typeof`
 * porque, depois do movimento, `m01/a01` deixa de ser a primeira aula da
 * trilha e passa a dever reuso do que a aula anterior demonstrou.
 */
function trilhaDeDoisModulos(): ModuloDeFixture[] {
  return [
    {
      slug: 'm01',
      order: 1,
      aulas: [
        { slug: 'a01', conceitos: ['base'], codigoDaTeoria: TEORIA_BASE, solucoes: [{ slug: 'c1', codigo: SOLUCAO_COM_TYPEOF }] },
        { slug: 'a02', conceitos: ['cobra'], codigoDaTeoria: 'let z = 1 + 2;', solucoes: [{ slug: 'c2', codigo: SOLUCAO_COM_TYPEOF }] },
      ],
    },
    {
      slug: 'm02',
      order: 2,
      aulas: [{ slug: 'b01', conceitos: ['ensina'], codigoDaTeoria: 'const tipo = typeof 10;', solucoes: [] }],
    },
  ];
}

/** Cria a fixture num tmp próprio e a remove no fim (produção nunca é tocada). */
async function comFixture(
  modulos: ModuloDeFixture[],
  slug: string,
  corpo: (dir: string, antes: Map<string, string>) => Promise<void>,
): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'engine-fiacao-cli-'));
  try {
    await escreverTrilha(dir, slug, modulos);
    await corpo(dir, await inventario(dir));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const CAMINHO_MODULE_JSON = path.join('modules', 'm01', 'module.json');

/** O array `lessons` gravado no `module.json` de um módulo. */
async function lessonsDoModulo(dir: string, moduleSlug: string): Promise<string[]> {
  const bruto = await fs.readFile(path.join(dir, 'modules', moduleSlug, 'module.json'), 'utf8');
  return (JSON.parse(bruto) as { lessons: string[] }).lessons;
}

/** `content-src/<slug>` NUNCA deve nascer destes comandos (artefato não-gitignored). */
async function assertSemRunEmContentSrc(slug: string): Promise<void> {
  await assert.rejects(
    () => fs.access(path.join(APP_DIR, 'content-src', slug)),
    `o comando criou content-src/${slug} — nenhum destes caminhos escreve run`,
  );
}

// ---------------------------------------------------------------------------
// 1. `repair --mover` / `--criar-aulas` — a fiação dos DOIS executores
// ---------------------------------------------------------------------------

describe('engine CLI — repair: as flags --mover/--criar-aulas são OPT-IN e só valem com --aplicar', () => {
  it('--mover sem --aplicar é USO INCORRETO (exit 2) e não toca o disco', async () => {
    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir, antes) => {
      const r = await runEngine(['repair', SLUG_UM_MODULO, '--dir', dir, '--mover']);
      assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stderr, /'--mover' so vale com --aplicar/);
      assertIntacto(delta(antes, await inventario(dir)), 'o portão de uso não pode gravar nada');
    });
  });

  it('--criar-aulas sem --aplicar é USO INCORRETO (exit 2) e não toca o disco', async () => {
    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir, antes) => {
      const r = await runEngine(['repair', SLUG_UM_MODULO, '--dir', dir, '--criar-aulas']);
      assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stderr, /'--criar-aulas' so vale com --aplicar/);
      assertIntacto(delta(antes, await inventario(dir)), 'o portão de uso não pode gravar nada');
    });
  });
});

describe('engine CLI — repair --aplicar: SEM as flags novas, grava exatamente o que sempre gravou', () => {
  /**
   * A LINHA DE BASE, e ela é o que dá sentido ao caso seguinte: nesta fixture o
   * plano TEM ação de ORDEM executável, então o laço de reescrita PRECISA
   * rodar — e sem chave ele aborta DECLARANDO, com o disco byte-idêntico.
   * É por comparação com isto que "o `--mover` fez o laço não precisar de
   * rodada nenhuma" deixa de ser coincidência.
   */
  it('sem chave: exit 2 com erro estruturado do laço e ZERO arquivo alterado', async () => {
    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir, antes) => {
      const r = await runEngine([
        'repair',
        SLUG_UM_MODULO,
        '--dir',
        dir,
        '--aplicar',
        '--modelo-revisor',
        'fake/revisor',
      ]);
      assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stderr, /erro estruturado \[REPAIR_/, 'o erro do repair é estruturado, com código');
      assert.match(r.stderr, /chave de API/i, 'a limitação (sem chave) é DECLARADA');
      assertIntacto(
        delta(antes, await inventario(dir)),
        'sem as flags novas e sem chave, o `aplicar` não pode deixar rastro no disco',
      );
      await assertSemRunEmContentSrc(SLUG_UM_MODULO);
    });
  });
});

describe('engine CLI — repair --aplicar --mover: move ANTES, RE-ENTRA sobre a trilha movida, e só o residual iria à LLM', () => {
  it('grava EXATAMENTE o module.json da ordem nova, sem chave e sem gastar rodada do laço', async () => {
    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir, antes) => {
      const r = await runEngine([
        'repair',
        SLUG_UM_MODULO,
        '--dir',
        dir,
        '--aplicar',
        '--mover',
        '--modelo-revisor',
        'fake/revisor',
        '--json',
      ]);
      assert.equal(r.code, 1, `sobram violações ⇒ exit 1 — stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);

      const dados = JSON.parse(r.stdout) as {
        modo: string;
        escritos: string[];
        rodadas: unknown[];
        placarInicial: { violacoes: number };
        placarFinal: { violacoes: number };
        plano: { ordens: unknown[] };
        movimentacao: { aplicada: boolean; escritos: string[]; plano: { movimentos: unknown[]; alvos: unknown[] } };
        subFluxoDeLacuna: { modo: string; escritos: string[] };
        declaracoes: string[];
      };

      // (a) A MOVIMENTAÇÃO rodou e foi ela quem gravou — um arquivo, nomeado.
      assert.equal(dados.modo, 'aplicar');
      assert.equal(dados.movimentacao.aplicada, true, 'a flag --mover LIGA a escrita do executor de reordenação');
      assert.deepEqual(dados.movimentacao.escritos, ['modules/m01/module.json']);
      assert.deepEqual(dados.escritos, ['modules/m01/module.json'], 'nada além da ordem foi gravado');
      assert.equal(dados.movimentacao.plano.movimentos.length, 1);
      assert.ok(dados.movimentacao.plano.alvos.length > 0, 'a movimentação precisa ter alvo de ORDEM para valer');

      // (b) O DISCO concorda com o relatório — e SÓ esse arquivo mudou.
      const depois = await inventario(dir);
      assert.deepEqual(
        delta(antes, depois),
        { alterados: [CAMINHO_MODULE_JSON], criados: [], apagados: [] },
        'o repair com --mover grava a ordem nova e MAIS NADA',
      );
      assert.deepEqual(await lessonsDoModulo(dir, 'm01'), ['a01', 'a03', 'a02'], 'a aula que ensina foi para antes');
      assert.deepEqual(tmpsSobrando(depois), [], 'a escrita é atômica: nenhum .tmp pode sobrar');

      // (c) A RE-ENTRADA: o laço rodou sobre a trilha JÁ MOVIDA, e o plano
      // dessa segunda passada não tem mais ORDEM alguma para executar.
      assert.ok(
        dados.declaracoes.some((d) => d.includes('o laço de reescrita rodou sobre a trilha JÁ MOVIDA')),
        `a re-entrada tem de estar DECLARADA — declaracoes:\n${dados.declaracoes.join('\n')}`,
      );
      assert.ok(
        dados.declaracoes.some((d) => /MOVIMENTAÇÃO: 0 movimento\(s\) planejado\(s\) sobre 0 alvo\(s\)/.test(d)),
        'a SEGUNDA passada re-auditou a trilha movida: nenhum alvo de ORDEM sobrou para mover',
      );
      assert.deepEqual(dados.plano.ordens, [], 'o residual que chegaria à LLM não tem ação de ORDEM');

      // (d) ZERO LLM: sem chave, com `--aplicar`, e o laço não gastou rodada.
      // A linha de base acima prova que SEM `--mover` este mesmo comando
      // abortava por falta de chave — o movimento é o que tirou a LLM do
      // caminho, e não a ausência de trabalho.
      assert.deepEqual(dados.rodadas, [], 'nenhuma rodada do laço ⇒ nenhuma chamada de LLM');
      assert.ok(
        dados.declaracoes.some((d) => d.includes('nenhum LLM chamado')),
        'a saída declara que nenhum modelo foi consultado',
      );

      // (e) O sub-fluxo de lacuna FICOU NO PLANO (a flag dele não foi passada).
      assert.equal(dados.subFluxoDeLacuna.modo, 'dry-run', 'sem --criar-aulas o v2 de lacuna não sai do plano');
      assert.deepEqual(dados.subFluxoDeLacuna.escritos, []);

      // (f) O placar MELHOROU — mover não é cosmético.
      assert.ok(
        dados.placarFinal.violacoes < dados.placarInicial.violacoes,
        `o audit final tem de melhorar: ${dados.placarInicial.violacoes} → ${dados.placarFinal.violacoes}`,
      );
      await assertSemRunEmContentSrc(SLUG_UM_MODULO);
    });
  });

  it('o module.json que o repair grava é BYTE-IDÊNTICO ao que `reorder --aplicar` grava sozinho', async () => {
    // Os dois caminhos têm de ser o MESMO executor (`engine/modes/reorder.ts`).
    // Se um dia divergirem — outra ordem de composição, outro serializador,
    // outra decisão de desempate —, esta igualdade quebra e diz onde olhar.
    let peloRepair = '';
    let peloReorder = '';

    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir) => {
      const r = await runEngine([
        'repair',
        SLUG_UM_MODULO,
        '--dir',
        dir,
        '--aplicar',
        '--mover',
        '--modelo-revisor',
        'fake/revisor',
      ]);
      assert.equal(r.code, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      peloRepair = await fs.readFile(path.join(dir, CAMINHO_MODULE_JSON), 'utf8');
    });

    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir) => {
      const r = await runEngine(['reorder', SLUG_UM_MODULO, '--dir', dir, '--aplicar']);
      assert.equal(r.code, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      peloReorder = await fs.readFile(path.join(dir, CAMINHO_MODULE_JSON), 'utf8');
    });

    assert.ok(peloRepair.length > 0 && peloReorder.length > 0, 'os dois caminhos precisam ter gravado');
    assert.equal(peloRepair, peloReorder, 'a movimentação dentro do repair é o MESMO executor do comando reorder');
  });
});

describe('engine CLI — repair --aplicar --criar-aulas: sem chave a aula NÃO chega ao disco', () => {
  it('exit 2 declarando a chave ausente, com ZERO arquivo criado ou alterado', async () => {
    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir, antes) => {
      const r = await runEngine([
        'repair',
        SLUG_UM_MODULO,
        '--dir',
        dir,
        '--aplicar',
        '--criar-aulas',
        '--modelo-revisor',
        'fake/revisor',
      ]);
      assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stderr, /chave de API/i, 'a indisponibilidade é DECLARADA');
      // QUEM abortou importa, e é o que distingue fiação de coincidência: sem
      // a flag ligar `deps.llmAutorDeAula`, este mesmo comando abortaria no
      // LAÇO DE REESCRITA (`REPAIR_LACO_FALHOU`, etapa `laco-de-revisao`) —
      // exit 2 e disco intacto do mesmo jeito, e o teste passaria sem o
      // sub-fluxo v2 ter sido chamado uma única vez. Aqui exige-se que a
      // parada venha do executor de LACUNA.
      assert.match(
        r.stderr,
        /lacuna|autoria da aula/i,
        'quem abortou tem de ser o sub-fluxo v2 de LACUNA, não o laço de reescrita',
      );
      assert.doesNotMatch(
        r.stderr,
        /REPAIR_LACO_FALHOU/,
        'se a parada foi no laço, a flag --criar-aulas não chegou a ligar a autoria de aula',
      );
      // MEDIDO (`main@fe395f9`): o `ErroDeLacuna` do sub-fluxo v2 NÃO é
      // enrolado em `ErroDeReparo`, então ele sai pelo ramo "erro inesperado"
      // do CLI, com stack — o fail-closed vale (exit 2, zero escrita), mas o
      // formato `erro estruturado [CODIGO] na etapa ETAPA` que o repair promete
      // não aparece neste caminho. A asserção fica sobre o que É contrato
      // (exit 2 + nada gravado + limitação declarada); o formato está
      // reportado no handoff em vez de travado numa asserção que endossaria o
      // defeito.
      assertIntacto(
        delta(antes, await inventario(dir)),
        'aula recusada não chega ao disco nem parcialmente (§9.3)',
      );
      await assertSemRunEmContentSrc(SLUG_UM_MODULO);
    });
  });

  it('LIMITAÇÃO MEDIDA: com --mover junto, o movimento JÁ FOI gravado quando a autoria aborta', async () => {
    // Esta é a razão declarada de as duas flags serem OPT-IN, e ela é um
    // COMPORTAMENTO, não um bug escondido: a disponibilidade da chave só é
    // conhecida NA CHAMADA do modelo, e a ordem do §5.5 manda mover ANTES.
    // Com `--mover --criar-aulas` e sem chave, a trilha fica MOVIDA (o que o
    // comando `reorder --aplicar` faria sozinho, sem LLM) e o comando aborta.
    // Travar isto é o que impede um refactor de "consertar" a ordem — mover
    // DEPOIS de reescrever apagaria construções que o movimento poria dentro
    // do orçamento.
    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir, antes) => {
      const r = await runEngine([
        'repair',
        SLUG_UM_MODULO,
        '--dir',
        dir,
        '--aplicar',
        '--mover',
        '--criar-aulas',
        '--modelo-revisor',
        'fake/revisor',
      ]);
      assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stderr, /chave de API/i);
      const d = delta(antes, await inventario(dir));
      assert.deepEqual(
        d,
        { alterados: [CAMINHO_MODULE_JSON], criados: [], apagados: [] },
        'a MOVIMENTAÇÃO (zero LLM) já tinha gravado; a AULA (que é prosa) não gravou nada',
      );
      assert.deepEqual(await lessonsDoModulo(dir, 'm01'), ['a01', 'a03', 'a02']);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. `reorder` — o que ele grava, e o que o dry-run promete não gravar
// ---------------------------------------------------------------------------

describe('engine CLI — reorder: o dry-run é o default e não grava', () => {
  it('sem --aplicar: planeja o movimento, aprova a verificação e deixa o disco byte-idêntico', async () => {
    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir, antes) => {
      const r = await runEngine(['reorder', SLUG_UM_MODULO, '--dir', dir, '--json']);
      assert.equal(r.code, 1, `a trilha ainda tem violação ⇒ exit 1 — stderr:\n${r.stderr}`);
      const dados = JSON.parse(r.stdout) as {
        modo: string;
        aplicado: boolean;
        escritos: string[];
        veredicto: { ok: boolean; alvosResolvidos: unknown[]; violacoesNovas: unknown[] };
        plano: { movimentos: { tipo: string; lessonSlug?: string; antesDe?: string }[] };
      };
      assert.equal(dados.modo, 'dry-run', 'o modo default é dry-run');
      assert.equal(dados.aplicado, false);
      assert.deepEqual(dados.escritos, []);
      assert.equal(dados.plano.movimentos.length, 1);
      assert.equal(dados.plano.movimentos[0].tipo, 'MOVER_AULA_NO_MODULO');
      assert.equal(dados.plano.movimentos[0].lessonSlug, 'a03', 'a aula que ENSINA é a que se move');
      assert.equal(dados.plano.movimentos[0].antesDe, 'a02', 'ela vai para antes da aula que COBRA');
      assert.equal(dados.veredicto.ok, true, 'a verificação diferencial aprova o movimento desta fixture');
      assert.ok(dados.veredicto.alvosResolvidos.length > 0);
      assert.deepEqual(dados.veredicto.violacoesNovas, [], 'mover não pode abrir violação nova');
      assertIntacto(delta(antes, await inventario(dir)), 'o dry-run promete ZERO escrita');
    });
  });
});

describe('engine CLI — reorder --aplicar: grava EXATAMENTE os arquivos de ordem, atomicamente', () => {
  it('movimento DENTRO do módulo: só o module.json daquele módulo muda', async () => {
    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir, antes) => {
      const r = await runEngine(['reorder', SLUG_UM_MODULO, '--dir', dir, '--aplicar', '--json']);
      assert.equal(r.code, 1, `sobram lacunas ⇒ exit 1 — stderr:\n${r.stderr}`);
      const dados = JSON.parse(r.stdout) as {
        modo: string;
        aplicado: boolean;
        escritos: string[];
        placarInicial: { violacoes: number };
        placarFinal: { violacoes: number };
      };
      assert.equal(dados.modo, 'aplicar');
      assert.equal(dados.aplicado, true);
      assert.deepEqual(dados.escritos, ['modules/m01/module.json']);

      const depois = await inventario(dir);
      assert.deepEqual(
        delta(antes, depois),
        { alterados: [CAMINHO_MODULE_JSON], criados: [], apagados: [] },
        'nenhum lesson.json, nenhum challenge.json e nenhum track.json podem mudar',
      );
      assert.deepEqual(await lessonsDoModulo(dir, 'm01'), ['a01', 'a03', 'a02']);
      assert.deepEqual(tmpsSobrando(depois), [], 'escrita atômica: nenhum .tmp sobrando');
      assert.ok(
        dados.placarFinal.violacoes < dados.placarInicial.violacoes,
        `o audit final tem de melhorar: ${dados.placarInicial.violacoes} → ${dados.placarFinal.violacoes}`,
      );
    });
  });

  it('movimento ENTRE módulos: o track.json também é reescrito (é ele quem guarda a ordem dos módulos)', async () => {
    await comFixture(trilhaDeDoisModulos(), SLUG_DOIS_MODULOS, async (dir, antes) => {
      const r = await runEngine(['reorder', SLUG_DOIS_MODULOS, '--dir', dir, '--aplicar', '--json']);
      assert.notEqual(r.code, 2, `nenhuma barreira estrutural esperada — stderr:\n${r.stderr}`);
      const dados = JSON.parse(r.stdout) as { aplicado: boolean; escritos: string[] };
      assert.equal(dados.aplicado, true);
      assert.deepEqual(
        [...dados.escritos].sort(),
        ['modules/m01/module.json', 'modules/m02/module.json', 'track.json'],
        'mover um MÓDULO reescreve o array `modules` do track.json e o `order` dos dois módulos',
      );

      const depois = await inventario(dir);
      assert.deepEqual(
        delta(antes, depois),
        {
          alterados: ['modules/m01/module.json', 'modules/m02/module.json', 'track.json'],
          criados: [],
          apagados: [],
        },
        'o disco tem de bater com a lista de escritos do relatório',
      );
      const root = JSON.parse(await fs.readFile(path.join(dir, 'track.json'), 'utf8')) as { modules: string[] };
      assert.deepEqual(root.modules, ['m02', 'm01'], 'o módulo que ENSINA passou para antes');
      assert.deepEqual(tmpsSobrando(depois), [], 'escrita atômica: nenhum .tmp sobrando');
    });
  });
});

// ---------------------------------------------------------------------------
// 3. `gap` — o plano é aritmética (sem LLM, sem chave); o aplicar exige o §6.2
// ---------------------------------------------------------------------------

describe('engine CLI — gap: o dry-run planeja a aula que falta SEM LLM e SEM chave', () => {
  it('planeja posição, faixa legal e delta — e não grava byte nenhum', async () => {
    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir, antes) => {
      const r = await runEngine(['gap', SLUG_UM_MODULO, '--dir', dir, '--json']);
      assert.equal(r.code, 1, `sobra lacuna ⇒ exit 1 — stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      const dados = JSON.parse(r.stdout) as {
        modo: string;
        escritos: string[];
        aceitas: unknown[];
        declaracoes: string[];
        plano: {
          lacunas: unknown[];
          aulasNovas: { construcoes: string[]; inserirAntesDe: string; indiceDeInsercao: number; acao: string }[];
          deltasEsperados: { arquivos: string[] }[];
        };
      };
      assert.equal(dados.modo, 'dry-run', 'o modo default é dry-run');
      assert.deepEqual(dados.escritos, []);
      assert.deepEqual(dados.aceitas, [], 'o dry-run não autora nada');
      assert.ok(dados.plano.lacunas.length > 0, 'a fixture precisa ter lacuna, senão não há o que planejar');
      assert.equal(dados.plano.aulasNovas.length, 1);
      const aula = dados.plano.aulasNovas[0];
      assert.deepEqual(aula.construcoes, ['node:CallExpression'], 'a matéria da aula nova é a construção sem dona');
      assert.equal(aula.inserirAntesDe, 'm01/a01', 'ela entra antes do desafio que a cobra');
      assert.equal(aula.indiceDeInsercao, 0);
      assert.equal(aula.acao, 'INSERT_INTERMEDIATE', 'a ação de LACUNA é criar aula, NUNCA reescrever desafio');
      assert.ok(
        dados.plano.deltasEsperados.some((d) => d.arquivos.includes('modules/m01/module.json')),
        'o delta nomeia os arquivos que o --aplicar gravaria',
      );
      assert.ok(
        dados.declaracoes.some((d) => d.includes('zero chamada de LLM') && d.includes('sem chave')),
        `a limitação do dry-run é DECLARADA — declaracoes:\n${dados.declaracoes.join('\n')}`,
      );
      assertIntacto(delta(antes, await inventario(dir)), 'o dry-run do gap promete ZERO escrita');
      await assertSemRunEmContentSrc(SLUG_UM_MODULO);
    });
  });
});

describe('engine CLI — gap --aplicar: as duas portas fecham antes de qualquer arquivo', () => {
  it('sem --modelo-revisor é USO INCORRETO (exit 2, roteamento §6.2) e ZERO arquivo', async () => {
    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir, antes) => {
      const r = await runEngine(['gap', SLUG_UM_MODULO, '--dir', dir, '--aplicar']);
      assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stderr, /'gap --aplicar' exige --modelo-revisor/);
      assert.match(r.stderr, /6\.2/, 'o motivo (model(AUTOR) != model(REVISOR)) é nomeado');
      assertIntacto(delta(antes, await inventario(dir)), 'o portão de uso roda ANTES de qualquer escrita');
    });
  });

  it('com --modelo-revisor mas SEM chave: erro estruturado do sub-fluxo v2 e ZERO arquivo', async () => {
    await comFixture(trilhaDeUmModulo(), SLUG_UM_MODULO, async (dir, antes) => {
      const r = await runEngine(['gap', SLUG_UM_MODULO, '--dir', dir, '--aplicar', '--modelo-revisor', 'fake/revisor']);
      assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stderr, /erro estruturado \[LACUNA_/, 'o erro do gap é estruturado, com código');
      assert.match(r.stderr, /chave de API/i, 'a indisponibilidade é DECLARADA');
      assertIntacto(
        delta(antes, await inventario(dir)),
        'aula que não pôde ser autorada não chega ao disco nem parcialmente (§9.3)',
      );
      await assertSemRunEmContentSrc(SLUG_UM_MODULO);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. `discrimination` — a ÚNICA exceção declarada à convenção de exit code
// ---------------------------------------------------------------------------

describe('engine CLI — discrimination: exit 0 SEMPRE que a medição saiu (a exceção do §9.1)', () => {
  it('trilha COM achado (teste que não força a construção da aula): reporta o AVISO e sai 0', async () => {
    const r = await runEngine(['discrimination', 'trilha-minima', '--dir', FIXTURE_JS, '--tudo']);
    assert.equal(r.code, 0, `a exceção declarada é exit 0 mesmo com achado — stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /\[NAO-DISCRIMINA\]/, 'a fixture desta prova PRECISA ter achado, senão o 0 não prova nada');
    assert.match(r.stdout, /AVISO: nao discriminam \.+ 1/, 'o achado entra no placar como AVISO com contagem');
    assert.match(
      r.stdout,
      /classificacao: AVISO \(mede e declara, nao reprova\)/,
      'a classificação é declarada na saída, não deduzida pelo leitor',
    );
  });

  it('trilha com desafio NÃO MEDIDO: sai 0 e DECLARA que o placar não fala por ele (fail-closed)', async () => {
    const r = await runEngine([
      'discrimination',
      'trilha-python-nao-medivel',
      '--dir',
      FIXTURE_PY_NAO_MEDIVEL,
      '--tudo',
    ]);
    assert.equal(r.code, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stdout, /\[NAO-MEDIDO\]/, 'o desafio não medido é ROTULADO, nunca contado como discriminando');
    assert.match(r.stdout, /NAO MEDIDOS \(fail-closed\) \.+ 1/);
    assert.match(r.stdout, /discriminam \(o teste forca a construcao\) \.+ 0/, 'não medido nunca vira "discrimina"');
    assert.match(r.stdout, /NÃO MEDIDO\(S\).*o placar de discriminação NÃO fala por eles/s);
  });

  it('CONTRASTE: sobre a MESMA fixture não medida, o comando irmão `coverage` NÃO sai 0', async () => {
    // Sem este caso, o exit 0 acima poderia ser "não havia nada a achar". Os
    // dois comandos medem a MESMA coisa (o código mínimo que passa no teste) e
    // sobre a MESMA trilha: o que os separa é a DECISÃO de classificação —
    // `coverage` reprova o não medido (§9.3), `discrimination` declara e não
    // reprova. É a exceção existindo, não um comando que esqueceu o exit code.
    const r = await runEngine(['coverage', 'trilha-python-nao-medivel', '--dir', FIXTURE_PY_NAO_MEDIVEL]);
    assert.notEqual(r.code, 0, `o coverage falha FECHADA no não-medido — stdout:\n${r.stdout}`);
  });

  it('a exceção é SÓ para achado: uso incorreto continua saindo 2', async () => {
    const semSlug = await runEngine(['discrimination']);
    assert.equal(semSlug.code, 2, 'slug ausente é uso incorreto');
    assert.match(semSlug.stderr, /informe o slug/);

    const modoInvalido = await runEngine(['discrimination', 'trilha-minima', '--dir', FIXTURE_JS, '--modo', 'xpto']);
    assert.equal(modoInvalido.code, 2, '--modo inválido é uso incorreto');
    assert.match(modoInvalido.stderr, /--modo invalido/);
  });
});

// ---------------------------------------------------------------------------
// 5. `requirements` — a barreira de linguagem (fail-closed, nunca default mudo)
// ---------------------------------------------------------------------------

describe('engine CLI — requirements: linguagem sem derivação escrita ABORTA declarando', () => {
  it('trilha de TypeScript: exit 2, nomeando a linguagem pedida e as que existem', async () => {
    // TypeScript TEM adaptador registrado (`engine/lang/typescript.ts`) e NÃO
    // tem derivação de requirements — é exatamente o buraco que um default
    // silencioso para JavaScript esconderia: o parser leria `def test_…` /
    // `test(…)` do jeito errado e inventaria gap em todo desafio.
    const r = await runEngine(['requirements', 'trilha-typescript-minima', '--dir', FIXTURE_TS]);
    assert.equal(r.code, 2, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.match(r.stderr, /linguagem 'typescript'/, 'a linguagem PEDIDA é nomeada');
    assert.match(r.stderr, /escritas: javascript, python/, 'as linguagens que TÊM derivação são listadas');
    assert.doesNotMatch(r.stdout, /PLACAR \(requirements\)/, 'nenhum placar pode sair de uma medição que não aconteceu');
  });

  it('CONTROLE POSITIVO: a mesma flag na trilha de Python DERIVA pelo parser de Python', async () => {
    // Sem este caso, o exit 2 acima seria satisfeito por um comando quebrado
    // para toda trilha. Aqui a derivação roda e o requirement sai do
    // `def test_…(self)` do unittest — a estrutura que o parser de JavaScript
    // não enxergaria.
    const r = await runEngine(['requirements', 'trilha-python-minima', '--dir', FIXTURE_PY]);
    assert.notEqual(r.code, 2, `nenhuma barreira estrutural aqui — stderr:\n${r.stderr}`);
    assert.match(r.stdout, /linguagem: python \(da trilha/, 'a linguagem vem da TRILHA, não de um default');
    assert.match(r.stdout, /\[derivado\] REQ-1 test_imprime_oi/, 'o teste do unittest virou requirement derivado');
    assert.match(r.stdout, /PLACAR \(requirements\)/);
  });

  it('slug ausente continua sendo uso incorreto (exit 2 + USAGE)', async () => {
    const r = await runEngine(['requirements']);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /informe o slug/);
  });
});
