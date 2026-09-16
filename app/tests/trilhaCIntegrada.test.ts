/**
 * tests/trilhaCIntegrada.test.ts — A TRILHA C-INICIANTE COMO PRODUTO (onda 3).
 *
 * `c-iniciante` é a SEGUNDA trilha real do produto (docs/20-trilha-c.md) e a
 * primeira fora do par JS/Python. Este arquivo prova INTEGRAÇÃO — a trilha
 * inteira, pelo caminho que o produto usa — e NÃO toca código de produção; as
 * provas unitárias do adaptador já vivem em engineLangC.test.ts /
 * engineGatesC.test.ts.
 *
 * O que este arquivo PROVA:
 *   1. A trilha CARREGA pelo loader do produto (`loadTrack`, a ÚNICA porta de
 *      entrada do conteúdo — o mesmo caminho da UI): adapterId 'c' resolvido,
 *      7 módulos, 115 aulas, disco × module.json em BIJEÇÃO (nenhuma aula
 *      faltando, nenhum órfão) e prerequisites resolvendo para aula ANTERIOR;
 *   2. AS 2 AULAS COMPLETAS do M1 (`primeira-tela`, `o-esqueleto`): quiz com
 *      optionRationales 4/4 e respostas corretas; typewriter dentro do teto de
 *      paciência (21 s por seção, a velocidade de leitura — onda 10); sources
 *      com URL em formato válido (assert de FORMATO — a suíte não depende de
 *      rede); teoria com blocos ```c```; `introduces` declaradas em chaves de
 *      átomo bem-formadas;
 *   3. AS 4 PROVAS DE EXECUÇÃO REAL nos 2 desafios (padrão `provadorReal` de
 *      engineLangC.test.ts, IN-PROCESS — sem spawn do CLI): solução passa,
 *      starter falha, contagem bate e a tripla igualdade
 *      expectedTestCount == nº de SM_TEST == countDeclared;
 *   4. REQUIREMENTS: bijeção POR SLUG na derivação de C
 *      (`validarRequirements(…, 'c')`) — requirements[].id == slug do SM_TEST;
 *   5. ESPINHA × docs/20: o campo `autoria` de cada lesson.json de esqueleto
 *      confere com a célula correspondente do docs/20 (slug, aula, ensina,
 *      presume) — TUDO percorrido, não amostra; docs/20 lido como fixture
 *      READ-ONLY.
 *
 * PROIBIDO aqui (dependem da onda 4/7 — a semente SAÍDA está sendo estendida
 * em paralelo): audit = 0, coverage (sem sintetizador C ainda) e HTTP real das
 * fontes. São os gates finais de outras ondas.
 *
 * Contrato normativo: docs/20-trilha-c.md (congelado) + prova-c.md + o
 * comportamento do adaptador (engine/lang/c.ts). Onde o conteúdo diverge do
 * contrato, o teste REPROVA e documenta o bug — nunca normaliza o
 * contraditório (§"Bugs encontrados" no relatório da onda).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { loadTrack, type LoadedTrack } from '../electron/main/content/trackLoader';
import {
  validateAssertions,
  validateLessonSource,
  type TrackChallengeSource,
  type TrackLessonSource,
} from '../electron/main/content/trackTypes';
import {
  adapterIdForChallengeLanguage,
  getAdapter,
} from '../electron/main/engine/lang/registry';
import { cAdapter, cCountDeclared, cDetect } from '../electron/main/engine/lang/c';
import { verifyChallengeProofs } from '../electron/main/engine/exec/proofs';
import { cleanupDir, prepareIsolatedDir } from '../electron/main/engine/exec/harness';
import { fromChallengeExec } from '../electron/main/engine/exec/adapter';
import { criarExecDeLinguagem } from '../electron/main/services/challengeExec';
import {
  derivarRequirements,
  validarRequirements,
} from '../electron/main/engine/quality/requirements';
import { isAtomKey } from '../electron/main/engine/atomKeys';
import { TYPEWRITER_TPS } from '../src/lib/trackLessonState';

const APP_DIR = path.resolve(__dirname, '..');
const TRACKS_DIR = path.join(APP_DIR, 'resources', 'tracks');
const TRACK_DIR = path.join(TRACKS_DIR, 'c-iniciante');
/** Fixture READ-ONLY: o contrato congelado (../../docs/20 relativo a app/). */
const DOCS_20 = path.resolve(APP_DIR, '..', 'docs', '20-trilha-c.md');

/** A máquina tem a toolchain de C? (mesmo pulo condicional de engineLangC) */
const TEM_C = cDetect().ok;

/** As 2 aulas COMPLETAS do M1 (o recorte que esta onda prova a fundo). */
const AULAS_COMPLETAS = [
  { modulo: 'a-tela', aula: 'primeira-tela' },
  { modulo: 'a-tela', aula: 'o-esqueleto' },
] as const;

/** Os 2 desafios com prova de execução real (os das aulas completas). */
const DESAFIOS_REAIS = [
  { modulo: 'a-tela', aula: 'primeira-tela', desafio: 'tres-linhas' },
  { modulo: 'a-tela', aula: 'o-esqueleto', desafio: 'sua-primeira-janela' },
] as const;

interface TheorySectionJson {
  id: string;
  title: string;
  markdown: string;
  code?: { language: string; code: string; explanation?: string };
}

/** Todos os lesson.json abaixo da trilha c-iniciante (caminho absoluto). */
function lessonJsonsDaTrilha(): string[] {
  const out: string[] = [];
  function varrer(dir: string): void {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const alvo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) varrer(alvo);
      else if (entrada.name === 'lesson.json') out.push(alvo);
    }
  }
  varrer(TRACK_DIR);
  return out.sort();
}

/**
 * A mensagem que o tutor REALMENTE manda no 'next' (mesma montagem de
 * lessonTypewriterReadingSpeed.test.ts): markdown da seção + bloco de código
 * quando houver.
 */
function bolhaDaSecao(s: TheorySectionJson): string {
  if (!s.code) return s.markdown;
  const expl = s.code.explanation ? `\n\n${s.code.explanation}` : '';
  return `${s.markdown}\n\n\`\`\`${s.code.language}\n${s.code.code}\n\`\`\`${expl}`;
}

// ─── parsing do docs/20 (fixture READ-ONLY) ─────────────────────────────────

/** Divide UMA linha de tabela markdown em células (pipes escapados `\|` não separam). */
function celulasDaLinha(linha: string): string[] {
  const partes = linha.trim().split(/(?<!\\)\|/);
  return partes.slice(1, -1).map((c) => c.trim());
}

/**
 * Normaliza UMA célula markdown (do docs/20 OU do `autoria`) para comparação
 * de CONTEÚDO: desfaz o escape de pipe, tira cercas de código inline e ênfase.
 * NÃO normaliza acento, `\0` nem nada que seja CONTEÚDO — divergência de
 * conteúdo continua divergência (é isso que o teste tem de revelar).
 */
function normalizaCelula(s: string): string {
  return s
    .replace(/\\\|/g, '|')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface CelulaAula {
  /** nº da aula no módulo (coluna #). */
  n: number;
  ensina: string;
  presume: string;
  /** linha 1-based no docs/20 — para apontar o bug com arquivo:linha. */
  linha: number;
}

interface EspinhaDoDocs {
  /** tabela "Estrutura da espinha — 7 módulos, 115 aulas": slug → {aulas, cons}. */
  modulos: Map<string, { aulas: number; cons: number }>;
  /** tabelas "Contúdo por aula" (#### Módulo N — `slug`): slug do módulo → aula → célula. */
  aulas: Map<string, Map<string, CelulaAula>>;
}

/** Lê o docs/20 e monta as duas tabelas normativas (READ-ONLY). */
function lerEspinhaDoDocs(): EspinhaDoDocs {
  const texto = readFileSync(DOCS_20, 'utf8');
  const linhas = texto.split('\n');

  const modulos = new Map<string, { aulas: number; cons: number }>();
  const aulas = new Map<string, Map<string, CelulaAula>>();
  let moduloCorrente: string | null = null;

  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];

    // Tabela-resumo: | 1 | `a-tela` | 21 | 6 | base | nada — é o zero absoluto |
    const resumo = linha.match(/^\|\s*(\d+)\s*\|\s*`([a-z0-9-]+)`\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|/);
    if (resumo) {
      modulos.set(resumo[2], { aulas: Number(resumo[3]), cons: Number(resumo[4]) });
      continue;
    }

    // Cabeçalho de módulo: #### Módulo 1 — `a-tela` (21 aulas)
    const header = linha.match(/^####\s+Módulo\s+(\d+)\s+—\s+`([a-z0-9-]+)`\s+\((\d+)\s+aulas\)/);
    if (header) {
      moduloCorrente = header[2];
      aulas.set(moduloCorrente, new Map());
      continue;
    }

    // Linha de aula: | # | `slug` — título | Ensina | Presume | Quiz | Desafio |
    // (o docs/20 tem UMA célula com pipe NÃO escapado — "Nome: Ana | Idade: 20"
    // em montar-um-texto — que quebra o desafio em duas; as 4 primeiras células
    // (#, slug, ensina, presume) não são afetadas por isso).
    if (moduloCorrente) {
      const row = linha.match(/^\|\s*(\d+)\s*\|\s*`([a-z0-9-]+)`\s*—/);
      if (row) {
        const celulas = celulasDaLinha(linha);
        if (celulas.length < 4) continue;
        const mapa = aulas.get(moduloCorrente)!;
        mapa.set(row[2], {
          n: Number(celulas[0]),
          ensina: normalizaCelula(celulas[2]),
          presume: normalizaCelula(celulas[3]),
          linha: i + 1,
        });
      }
    }
  }
  return { modulos, aulas };
}

const ESPINHA = lerEspinhaDoDocs();

interface CargaDaTrilha {
  track?: LoadedTrack;
  erro?: unknown;
}

/** Carga ÚNICA da trilha (o loader é async; este arquivo é CJS — sem top-level await). */
let CARGA: CargaDaTrilha | null = null;
async function carregarUmaVez(): Promise<CargaDaTrilha> {
  if (CARGA === null) {
    try {
      CARGA = { track: await loadTrack(TRACK_DIR) };
    } catch (err) {
      CARGA = { erro: err };
    }
  }
  return CARGA;
}

/** A trilha carregada — falha com a mensagem do loader se a carga rejeitou. */
async function trilha(): Promise<LoadedTrack> {
  const { track, erro } = await carregarUmaVez();
  assert.ok(
    track !== undefined,
    `loadTrack rejeitou a trilha: ${erro instanceof Error ? erro.message : String(erro)}`,
  );
  return track;
}

async function aulasDaTrilha(): Promise<{ modulo: string; lesson: TrackLessonSource }[]> {
  const t = await trilha();
  const out: { modulo: string; lesson: TrackLessonSource }[] = [];
  for (const mod of t.modules) for (const l of mod.lessons) out.push({ modulo: mod.meta.slug, lesson: l.meta });
  return out;
}

function aulaCompleta(modulo: string, aula: string): { lesson: TrackLessonSource; arquivo: string } {
  const arquivo = path.join(TRACK_DIR, 'modules', modulo, 'lessons', aula, 'lesson.json');
  return {
    lesson: JSON.parse(readFileSync(arquivo, 'utf8')) as TrackLessonSource,
    arquivo,
  };
}

function desafioReal(modulo: string, aula: string, desafio: string): { ch: TrackChallengeSource; arquivo: string } {
  const arquivo = path.join(TRACK_DIR, 'modules', modulo, 'lessons', aula, 'challenges', desafio, 'challenge.json');
  return { ch: JSON.parse(readFileSync(arquivo, 'utf8')) as TrackChallengeSource, arquivo };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. A TRILHA CARREGA (loader do produto — o mesmo caminho que a UI usa)
// ════════════════════════════════════════════════════════════════════════════

describe('trilha c-iniciante — carrega pelo loader do produto', () => {
  it('loadTrack não rejeita a trilha (TrackLoadError com o issue exato, se rejeitar)', async () => {
    const { erro } = await carregarUmaVez();
    assert.equal(
      erro,
      undefined,
      `loadTrack rejeitou a trilha: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  });

  it('adapterId "c" RESOLVIDO: programmingLanguage → adaptador registrado, e 7 módulos com 115 aulas', async () => {
    const t = await trilha();
    const root = t.root;
    assert.equal(root.slug, 'c-iniciante');
    assert.equal(root.programmingLanguage, 'c', 'a trilha declara C como linguagem');
    assert.equal(
      adapterIdForChallengeLanguage(root.programmingLanguage),
      'c',
      'o token da trilha resolve para o adaptador c — nada de cair no default javascript',
    );
    assert.equal(getAdapter('c').id, 'c', 'o adaptador c está registrado no registro da engine');
    assert.equal(root.runtime, 'cc-c11', 'o runtime é o par (cc, c11) do adaptador — docs/20 §4');
    assert.equal(root.harnessLanguage, 'c');

    assert.equal(t.modules.length, 7, 'a espinha tem 7 módulos');
    t.modules.forEach((mod, i) => {
      assert.equal(mod.meta.order, i + 1, `o módulo ${mod.meta.slug} é o ${i + 1}º`);
    });
    const total = t.modules.reduce((a, m) => a + m.lessons.length, 0);
    assert.equal(total, 115, '7 módulos × tabela do docs/20 = 115 aulas');
    // e o disco concorda com a contagem crua de lesson.json
    assert.equal(lessonJsonsDaTrilha().length, 115, '115 lesson.json no disco');
  });

  it('nenhuma aula faltando no disco vs module.json — e nenhum órfão nos dois sentidos', async () => {
    const t = await trilha();
    let aulasNoDisco = 0;
    for (const mod of t.modules) {
      const lessonsDir = path.join(TRACK_DIR, 'modules', mod.meta.slug, 'lessons');
      const noDisco = readdirSync(lessonsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(lessonsDir, e.name, 'lesson.json')))
        .map((e) => e.name)
        .sort();
      aulasNoDisco += noDisco.length;
      const declaradas = mod.lessons.map((l) => l.meta.slug).sort();

      const faltando = declaradas.filter((s) => !noDisco.includes(s));
      const orfaos = noDisco.filter((s) => !declaradas.includes(s));
      assert.deepEqual(
        [faltando, orfaos],
        [[], []],
        `módulo ${mod.meta.slug}: faltando=${JSON.stringify(faltando)} órfãos=${JSON.stringify(orfaos)}`,
      );

      // desafios: mesmo padrão — declarado existe, existente é declarado
      for (const l of mod.lessons) {
        const chDir = path.join(lessonsDir, l.meta.slug, 'challenges');
        const noDiscoCh = fs.existsSync(chDir)
          ? readdirSync(chDir, { withFileTypes: true })
              .filter((e) => e.isDirectory() && fs.existsSync(path.join(chDir, e.name, 'challenge.json')))
              .map((e) => e.name)
              .sort()
          : [];
        const declaradosCh = [...l.meta.challenges].sort();
        const faltandoCh = declaradosCh.filter((s) => !noDiscoCh.includes(s));
        const orfaosCh = noDiscoCh.filter((s) => !declaradosCh.includes(s));
        assert.deepEqual(
          [faltandoCh, orfaosCh],
          [[], []],
          `módulo ${mod.meta.slug}/aula ${l.meta.slug}: desafios faltando=${JSON.stringify(faltandoCh)} órfãos=${JSON.stringify(orfaosCh)}`,
        );
      }
    }
    assert.equal(aulasNoDisco, 115, 'a bijeção cobre as 115 aulas');
  });

  it('prerequisites TODOS resolvem para aula ANTERIOR da cadeia (ordem da espinha)', async () => {
    const posicao = new Map<string, number>();
    (await aulasDaTrilha()).forEach(({ lesson }, i) => posicao.set(lesson.slug, i));

    const problemas: string[] = [];
    for (const { modulo, lesson } of await aulasDaTrilha()) {
      for (const pre of lesson.prerequisites) {
        if (!posicao.has(pre)) {
          problemas.push(`${modulo}/${lesson.slug}: prerequisite '${pre}' não existe na trilha`);
        } else if (posicao.get(pre)! >= posicao.get(lesson.slug)!) {
          problemas.push(
            `${modulo}/${lesson.slug}: prerequisite '${pre}' NÃO é anterior na cadeia (o produto desbloqueia para trás)`,
          );
        }
      }
    }
    assert.deepEqual(problemas, [], `prerequisites quebrados:\n${problemas.join('\n')}`);
    // e a primeira aula da trilha não deve dever nada a ninguém
    const primeira = (await trilha()).modules[0].lessons[0];
    assert.equal(primeira.meta.slug, 'primeira-tela');
    assert.deepEqual(primeira.meta.prerequisites, [], 'a aula 1 do zero absoluto não tem prerequisite');
  });

  it('todo desafio da trilha resolve para o ADAPTADOR c (a igualdade que o loader impõe)', async () => {
    for (const mod of (await trilha()).modules) {
      for (const l of mod.lessons) {
        for (const ch of l.challenges) {
          assert.equal(
            adapterIdForChallengeLanguage(ch.language),
            'c',
            `${mod.meta.slug}/${l.meta.slug}/${ch.slug}: language '${ch.language}' não resolve para c`,
          );
        }
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. AS 2 AULAS COMPLETAS DO M1 (primeira-tela, o-esqueleto)
// ════════════════════════════════════════════════════════════════════════════

describe('as 2 aulas completas do M1 — quiz, typewriter, fontes, teoria, introduces', () => {
  for (const { modulo, aula } of AULAS_COMPLETAS) {
    describe(`${modulo}/${aula}`, () => {
      const { lesson, arquivo } = aulaCompleta(modulo, aula);

      it('quiz: optionRationales 4/4 e respostas corretas (o validador do produto aprova)', () => {
        const assertions = lesson.assertions ?? [];
        assert.ok(assertions.length > 0, 'a aula completa tem quiz (maestria obrigatória)');
        for (const a of assertions) {
          assert.equal(a.options.length, 4, `${a.id}: o quiz tem 4 opções`);
          assert.ok(
            a.optionRationales !== undefined,
            `${a.id}: optionRationales AUSENTE — o quiz adaptativo não tem o que explicar quando o aluno erra`,
          );
          assert.equal(a.optionRationales!.length, 4, `${a.id}: UM racional POR opção (4/4)`);
          a.optionRationales!.forEach((r, i) => {
            assert.ok(typeof r === 'string' && r.trim().length > 0, `${a.id}: racional da opção ${i} em branco`);
          });
          assert.ok(
            Number.isInteger(a.answerIndex) && a.answerIndex >= 0 && a.answerIndex < a.options.length,
            `${a.id}: answerIndex ${a.answerIndex} aponta para uma opção que existe`,
          );
          assert.ok(a.sectionId, `${a.id}: a afirmação está ancorada numa seção da teoria`);
          assert.ok(
            lesson.theory.some((s) => s.id === a.sectionId),
            `${a.id}: sectionId '${a.sectionId}' não existe na teoria`,
          );
        }
        assert.deepEqual(
          validateAssertions(assertions, arquivo),
          [],
          'validateAssertions reprova a aula completa',
        );
        assert.deepEqual(
          validateLessonSource(lesson, arquivo),
          [],
          'validateLessonSource reprova a aula completa',
        );
      });

      it('typewriter dentro do teto: nenhuma seção passa de 21 s na velocidade de teoria', () => {
        assert.equal(TYPEWRITER_TPS.theory, 7, 'a velocidade de teoria é 7 tps (28 chars/s)');
        const TETO_S = 21;
        for (const sec of lesson.theory as TheorySectionJson[]) {
          const s = bolhaDaSecao(sec).length / (TYPEWRITER_TPS.theory * 4);
          assert.ok(
            s <= TETO_S,
            `seção '${sec.id}' leva ${s.toFixed(1)} s — acima do teto de ${TETO_S} s de paciência (onda 10)`,
          );
        }
      });

      it('sources com URLs em formato válido (assert de FORMATO — sem rede)', () => {
        assert.ok(lesson.sources.length >= 2, 'a política P-FONTE pede 2–3 fontes oficiais por aula');
        for (const s of lesson.sources) {
          assert.ok(s.title.trim().length > 0, 'fonte sem título');
          assert.match(s.url, /^https?:\/\/\S+$/, `fonte '${s.title}' tem URL malformada: '${s.url}'`);
          assert.ok(s.description.trim().length > 0, `fonte '${s.title}' sem descrição`);
        }
      });

      it('teoria com blocos ```c``` (o aluno lê C de verdade, com fence tagada)', () => {
        const secoesComC = (lesson.theory as TheorySectionJson[]).filter((s) => /```c\b/.test(s.markdown));
        assert.ok(
          secoesComC.length >= 1,
          'a aula completa tem ao menos uma seção com bloco ```c```',
        );
      });

      it('introduces declaradas: productive não vazio e todas as chaves são átomos bem-formados', () => {
        const intro = lesson.introduces;
        assert.ok(intro, 'a aula completa declara introduces (o contrato do currículo)');
        assert.ok(intro!.productive.length > 0, 'a aula produtiva introduz ALGO (A6)');
        for (const k of [...intro!.productive, ...intro!.receptive]) {
          assert.ok(isAtomKey(k), `chave '${k}' não é um átomo bem-formado (AXIS:… no atomKeys)`);
        }
        assert.ok(lesson.targetAtom, 'targetAtom declarado');
        assert.ok(isAtomKey(lesson.targetAtom!), 'targetAtom é átomo bem-formado');
      });
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. AS 4 PROVAS DE EXECUÇÃO REAL nos 2 desafios (in-process, provadorReal)
// ════════════════════════════════════════════════════════════════════════════

/** O mesmo provador de engineLangC.test.ts: diretórios isolados + exec REAL. */
function provadorReal(): {
  env: Parameters<typeof verifyChallengeProofs>[1];
  limpar: () => Promise<void>;
} {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-c-trilha-proof-'));
  return {
    env: {
      exec: fromChallengeExec(criarExecDeLinguagem(cAdapter)),
      prepare: (side) => prepareIsolatedDir(base, side, cAdapter),
      cleanup: cleanupDir,
    },
    limpar: async () => {
      await fs.promises.rm(base, { recursive: true, force: true }).catch(() => {});
    },
  };
}

describe('os 2 desafios da trilha passam pelas 4 provas de execução REAL', () => {
  for (const { modulo, aula, desafio } of DESAFIOS_REAIS) {
    it(
      `${desafio}: solução passa, starter falha, contagem bate, stub vazio falha`,
      { skip: !TEM_C },
      async () => {
        const { ch, arquivo } = desafioReal(modulo, aula, desafio);
        assert.equal(ch.language, 'c', `o desafio da trilha é C (${arquivo})`);
        const { env, limpar } = provadorReal();
        try {
          const v = await verifyChallengeProofs(
            {
              solutionCode: ch.solutionCode!,
              starterCode: ch.starterCode ?? '',
              testsCode: ch.testsCode,
              expectedTestCount: ch.expectedTestCount,
              language: ch.language,
              timeoutMs: 60_000,
            },
            env,
          );
          assert.deepEqual(
            v.failures,
            [],
            `provas reprovaram ${desafio}: ${JSON.stringify(v.failures, null, 2)}`,
          );
          assert.equal(v.valid, true, 'o veredito das 4 provas é válido');
          assert.equal(v.declared, ch.expectedTestCount, 'contagem DECLARADA bate');
          assert.equal(v.executed, ch.expectedTestCount, 'contagem EXECUTADA bate');
          assert.equal(v.types?.applicable, false, 'a quinta prova não se aplica a C');
        } finally {
          await limpar();
        }
      },
    );
  }

  it('a TRÍPLA IGUALDADE declarada: expectedTestCount == nº de SM_TEST == countDeclared', () => {
    for (const { modulo, aula, desafio } of DESAFIOS_REAIS) {
      const { ch, arquivo } = desafioReal(modulo, aula, desafio);
      const nSM = (ch.testsCode.match(/SM_TEST\(/g) ?? []).length;
      assert.equal(
        nSM,
        ch.expectedTestCount,
        `${desafio} (${arquivo}): ${nSM} blocos SM_TEST no testsCode vs expectedTestCount ${ch.expectedTestCount}`,
      );
      assert.equal(
        cCountDeclared(ch.testsCode),
        ch.expectedTestCount,
        `${desafio}: cCountDeclared (por AST) diverge do expectedTestCount`,
      );
      assert.equal(
        cAdapter.countDeclared(ch.testsCode),
        ch.expectedTestCount,
        `${desafio}: adapter.countDeclared diverge do expectedTestCount`,
      );
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. REQUIREMENTS — bijeção por slug (derivação C)
// ════════════════════════════════════════════════════════════════════════════

describe('requirements — bijeção por slug (a derivação de C do requirements.ts)', () => {
  for (const { modulo, aula, desafio } of DESAFIOS_REAIS) {
    it(`${desafio}: requirements[].id == slug do SM_TEST, e a bijeção fecha`, () => {
      const { ch, arquivo } = desafioReal(modulo, aula, desafio);
      const declarados = (ch as unknown as {
        requirements?: { id: string; teste: string; descricao?: string }[];
      }).requirements;
      assert.ok(declarados && declarados.length > 0, `${arquivo}: o desafio declara requirements`);

      // A DERIVAÇÃO DE C: um requirement por bloco SM_TEST(<slug>) — o id
      // declarado é o PRÓPRIO slug do cenário (derivação determinística).
      const slugsSM = [...ch.testsCode.matchAll(/SM_TEST\(\s*([A-Za-z0-9_]+)\s*\)/g)].map((m) => m[1]);
      assert.equal(declarados!.length, slugsSM.length, 'um requirement por cenário SM_TEST');
      declarados!.forEach((r, i) => {
        assert.equal(r.teste, slugsSM[i], `requirement ${r.id}: campo 'teste' == slug do SM_TEST`);
        assert.equal(r.id, slugsSM[i], `requirements[].id (${r.id}) == slug do SM_TEST (${slugsSM[i]})`);
      });

      const val = validarRequirements(ch.testsCode, declarados!, 'c');
      assert.deepEqual(
        { ok: val.ok, semTeste: val.semTeste, testesSemRequirement: val.testesSemRequirement },
        { ok: true, semTeste: [], testesSemRequirement: [] },
        `a bijeção requirements × SM_TEST não fecha em ${desafio}`,
      );
      assert.equal(val.correspondencias.length, declarados!.length, 'todos os pares casados por slug');

      // a derivação INDEPENDENTE chega na mesma lista de testes, na ordem
      const deriv = derivarRequirements(ch.testsCode, ch.solutionCode!, ch.starterCode ?? '', 'c');
      assert.deepEqual(
        deriv.requirements.map((r) => r.teste),
        declarados!.map((r) => r.teste),
        'a derivação determinística deriva os MESMOS slugs, na MESMA ordem',
      );
      assert.equal(declarados!.length, ch.expectedTestCount, 'requirements == expectedTestCount');
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 5. ESPINHA × docs/20 (o contrato congelado, percorrido TUDO)
// ════════════════════════════════════════════════════════════════════════════

describe('espinha × docs/20 — o conteúdo confere com o contrato congelado', () => {
  it('docs/20 declara os 7 módulos com a divisão 21/12/13/15/21/16/17 — e o disco bate', async () => {
    assert.equal(ESPINHA.modulos.size, 7, `o docs/20 tem 7 módulos, veio ${ESPINHA.modulos.size}`);
    for (const mod of (await trilha()).modules) {
      const cel = ESPINHA.modulos.get(mod.meta.slug);
      assert.ok(cel, `o módulo '${mod.meta.slug}' do disco não existe na tabela do docs/20`);
      assert.equal(
        mod.lessons.length,
        cel!.aulas,
        `módulo ${mod.meta.slug}: ${mod.lessons.length} aulas no disco vs ${cel!.aulas} no docs/20`,
      );
    }
    const totalDocs = [...ESPINHA.modulos.values()].reduce((a, m) => a + m.aulas, 0);
    assert.equal(totalDocs, 115, 'o docs/20 soma 115 aulas');
  });

  it('bijection de SLUGS: toda aula do disco tem célula no docs/20 e toda célula tem aula no disco', async () => {
    const noDisco = new Set((await aulasDaTrilha()).map((a) => a.lesson.slug));
    const noDocs = new Set<string>();
    for (const mapa of ESPINHA.aulas.values()) for (const slug of mapa.keys()) noDocs.add(slug);

    const soNoDisco = [...noDisco].filter((s) => !noDocs.has(s));
    const soNoDocs = [...noDocs].filter((s) => !noDisco.has(s));
    assert.deepEqual(
      [soNoDisco.sort(), soNoDocs.sort()],
      [[], []],
      `aulas só no disco: ${JSON.stringify(soNoDisco)} · células só no docs/20: ${JSON.stringify(soNoDocs)}`,
    );
    assert.equal(noDisco.size, 115);
  });

  it('autoria de CADA aula de esqueleto confere com a célula do docs/20 (slug, aula, ensina, presume)', async () => {
    const semAutoria: string[] = [];
    const diffs: string[] = [];

    for (const { modulo, lesson } of await aulasDaTrilha()) {
      const aut = (lesson as TrackLessonSource & {
        autoria?: { modulo: string; aula: number; ensina: string; presume: string };
      }).autoria;
      if (aut === undefined) {
        semAutoria.push(lesson.slug);
        continue;
      }
      const cel = ESPINHA.aulas.get(modulo)?.get(lesson.slug);
      if (!cel) {
        diffs.push(
          `${modulo}/${lesson.slug}: aula NÃO está na tabela do módulo no docs/20`,
        );
        continue;
      }
      if (aut.modulo !== modulo) {
        diffs.push(`${modulo}/${lesson.slug}: autoria.modulo='${aut.modulo}' vs módulo do disco '${modulo}'`);
      }
      if (aut.aula !== cel.n) {
        diffs.push(
          `${modulo}/${lesson.slug}: autoria.aula=${aut.aula} vs coluna # do docs/20 (linha ${cel.linha}) = ${cel.n}`,
        );
      }
      const ensina = normalizaCelula(aut.ensina ?? '');
      if (ensina !== cel.ensina) {
        diffs.push(
          `${modulo}/${lesson.slug} (lesson.json 'autoria.ensina') vs docs/20 linha ${cel.linha}:\n` +
            `    lesson: ${JSON.stringify(ensina)}\n` +
            `    docs20: ${JSON.stringify(cel.ensina)}`,
        );
      }
      const presume = normalizaCelula(aut.presume ?? '');
      if (presume !== cel.presume) {
        diffs.push(
          `${modulo}/${lesson.slug} (lesson.json 'autoria.presume') vs docs/20 linha ${cel.linha}:\n` +
            `    lesson: ${JSON.stringify(presume)}\n` +
            `    docs20: ${JSON.stringify(cel.presume)}`,
        );
      }
    }

    // As DUAS aulas completas do M1 são as únicas sem `autoria` (o recorte que
    // a onda anterior escreveu por inteiro; o resto é esqueleto da semente).
    assert.deepEqual(
      semAutoria.sort(),
      ['o-esqueleto', 'primeira-tela'],
      'as aulas sem `autoria` devem ser exatamente as 2 completas do M1',
    );
    // 113 células de esqueleto foram percorridas de fato.
    assert.ok(diffs.length === 0, `autoria × docs/20 divergem em ${diffs.length} aula(s):\n${diffs.join('\n')}`);
  });

  it('a semente é o que o nome diz: 113 esqueletos com autoria percorridos (não é passe vazio)', async () => {
    let percorridos = 0;
    for (const { modulo, lesson } of await aulasDaTrilha()) {
      const aut = (lesson as TrackLessonSource & { autoria?: unknown }).autoria;
      if (aut !== undefined) {
        percorridos += 1;
        assert.ok(
          ESPINHA.aulas.get(modulo)?.has(lesson.slug),
          `${modulo}/${lesson.slug}: tem autoria mas não está na tabela do docs/20`,
        );
      }
    }
    assert.equal(percorridos, 113, '113 esqueletos com autoria (115 − 2 completas)');
  });
});
