#!/usr/bin/env -S npx tsx
/**
 * app/tools/track-engine/cli.ts — a entrada da ENGINE DE TRILHAS.
 *
 * A engine tem três modos (`docs/16-engine-de-trilha.md` §8):
 *
 *   audit     monta o orçamento cumulativo de uma trilha existente e reporta
 *             TODA violação de "só cobra o que já ensinou", com arquivo, linha
 *             e coluna. NÃO usa LLM e NÃO precisa de chave de API.
 *   generate  produz uma trilha nova (F0..F12).
 *   repair    aplica o laço revisor → plano → correção sobre conteúdo existente.
 *
 * Este arquivo implementa `audit` (o gate determinístico, sem LLM) e o
 * `generate` (o MODO GERADOR — P-22): este CLI é FINO, só resolve os deps de
 * PRODUÇÃO (cliente, transporte, semáforos, busca Brave, provador) e delega o
 * pipeline à fiação injetável `engine/fiacao/geraTrilha.ts` — testável offline
 * com FAKES. O `lint-schemas` roda o preflight do build (INV-04/INV-05) sobre o
 * registro real (P-33 incluso).
 *
 * Exit codes, na convenção do repositório (`app/tools/track-cli.ts`):
 *   0  sem violação / conclusão limpa
 *   1  violações encontradas (falha de CONTEÚDO)
 *   2  uso incorreto / barreira estrutural (inclui lint-schemas reprovado)
 *
 * Referência: `docs/16-engine-de-trilha.md`.
 */

import * as path from 'node:path';
import { listTrackSlugs, loadTrack, TrackLoadError, type LoadedTrack } from '../../electron/main/content/trackLoader';
import { auditTrack, type AuditReport, type Violation } from '../../electron/main/engine/audit';
import {
  deriveTrackBudget,
  type BudgetSource,
  type HarnessPolicy,
  type TrackBudget,
} from '../../electron/main/engine/budget';
import type { TrackChallengeSource } from '../../electron/main/content/trackTypes';
import type { AtomKey } from '../../electron/main/engine/atomKeys';
import {
  sintetizarCodigoMinimo,
  type MinimalVerdict,
} from '../../electron/main/engine/quality/minimal';
import {
  derivarRequirements,
  validarRequirements,
  type RequirementDeclarado,
  type RequirementsDerivados,
  type ValidacaoRequirements,
} from '../../electron/main/engine/quality/requirements';
import {
  gravarRelatorio,
  revisarCurso,
  rodarRevisaoAteConvergir,
  type RelatorioDeRevisao,
} from '../../electron/main/engine/revision/progressiva';
import { createDeepSeekClient } from '../../electron/main/services/deepseekClient';
import { OPENROUTER_ENV_KEY, OPENROUTER_PROVIDER_KEY } from '../../shared/llm/constants';
import { createCallLlm, type EngineLlm } from '../../electron/main/engine/runtime/callLlm';
import { createExecSemaphore, createLlmSemaphore, createSemaphore } from '../../electron/main/engine/runtime/semaphore';
import { createBraveSearchService } from '../../electron/main/services/braveSearchService';
import type { ExecutorDeMultiBusca } from '../../electron/main/engine/phases/f1Research';
import { criarBuscaPlanejada } from '../../electron/main/engine/phases/f1Research';
import { criarProverDeDesafio, type ProverDeDesafio } from '../../electron/main/engine/phases/f9Verifier';
import { criarJuizDeArestaLlm } from '../../electron/main/engine/phases/f3Graph';
import type { FamiliaAssunto } from '../../electron/main/engine/phases/f2Decompose';
import { FASES_ORDEM } from '../../electron/main/engine/runtime/runState';
import {
  gerarTrilha,
  ErroGeracao,
  f1ConfigDefault,
  type DepsGeracao,
  type FaseId,
} from '../../electron/main/engine/fiacao/geraTrilha';
import {
  SCHEMA_REGISTRY,
} from '../../electron/main/engine/schemas/artifacts';
import { lintSchemasDaEngine } from '../../electron/main/engine/schemas/fieldOrder';

const CLI_ROOT = path.resolve(__dirname, '..', '..');
const TRACKS_DIR = path.join(CLI_ROOT, 'resources', 'tracks');
/** Raiz de trabalho do run (content-src — layout declarado pelo runState). */
const CONTENT_SRC_DIR = path.join(CLI_ROOT, 'content-src');

const USAGE = `uso: npm run engine -- <comando> [args...]

comandos:
  audit <slug> [--modo declared|inferred] [--harness receptive-seed|none]
                [--limite N] [--json] [--so-lacunas]
      audita uma trilha contra o orcamento cumulativo de conhecimento.
      Nao usa LLM e nao precisa de chave de API.

  coverage <slug> [--modo declared|inferred] [--limite N] [--json] [--dir DIR]
      o ALGORITMO DO DONO (peça central): sintetiza, para cada desafio, o
      codigo MINIMO que passa no teste (zero LLM, literal/echo determinístico)
      e compara os atoms desse minimo com o orcamento da aula:
        LACUNA  = o teste cobra construcao que a aula nao oferece
        EXCESSO = a aula ensina construcao que o teste nao cobra
      Cada desafio roda o prover REAL (spawn node --test) sob o semaforo
      SEM_EXEC. Exit 1 quando ha LACUNA ou desafio sem solucao acessivel.
      --limite N processa e imprime no maximo N desafios (amostra rapida).
      --dir DIR carrega a trilha de outro diretorio (ex.: content-src).

  requirements <slug> [--limite N] [--json] [--dir DIR]
      deriva requirements dos test('...') de cada desafio e valida a BIJECAO
      com os requirements declarados no challenge.json (campo "requirements"):
      requirement declarado sem teste e teste sem requirement sao gaps.
      Exit 1 quando algum desafio tem gap.

  revise <slug> [--limite N] [--json] [--dir DIR]
      a REVISAO PROGRESSIVA (onda 5 — o nucleo do pedido do dono): percorre
      as aulas da 1a a ultima, sintetiza para cada desafio o codigo MINIMO
      que passa no teste (zero LLM) e compara com o orcamento DECLARADO da
      aula (introduces do lesson.json):
        LACUNA  = o teste cobra construcao que a aula nao oferece ->
                  candidato a SPLIT (minimalCode+atoms preservados como
                  artefato e registrados como pendencias — nada se perde)
        NAO-REVISAVEL = veredito nao-ok (sem-solucao/parse-falhou/
                  prover-falhou) — fail-closed, documentada, nunca loopa
        EXCESSO = a aula ensina mais que o teste cobra (ajuste, nao violacao)
      A memoria do feedback de cada aula vira contexto da seguinte
      (progressividade); o loop de convergencia repete a varredura ate o hash
      do relatorio estabilizar (max 3 iteracoes). Grava o relatorio em
      content-src/<slug>/revisao-progressiva/. Exit 1 quando ha lacuna ou
      aula nao-revisavel; 0 quando converge sem lacunas.

  generate <slug> --assunto "..." [--from FASE] [--only slug]
                  [--teto-tokens N] [--familia sintaxe|algoritmo|api-runtime|...]
      executa F0 a F12 e produz uma trilha nova em resources/tracks/<slug>.
      O run (run.json + ledger + artefatos + drafts) vive em content-src/<slug>
      e e RETOMAVEL: repita o comando com --from <fase pendente>.
      A F6 (piloto de 3 aulas) PARA para revisao humana: escreva
      content-src/<slug>/aprovacaoF6.json com {"aprovado": true} e retome.
      Sem chave de API: o run e criado e o erro declara a limitacao (exit 2).

  lint-schemas
      preflight do build sobre o SCHEMA_REGISTRY real (INV-04 ordem /
      INV-05 opcionais, P-33 incluso). Exit 2 em qualquer violacao.

  repair <slug>                        (nao implementado nesta onda)

exit codes: 0 sem violacao · 1 violacoes encontradas · 2 uso incorreto`;

function fail(msg: string): never {
  console.error(`erro: ${msg}`);
  console.error(USAGE);
  process.exit(2);
}

/** parseia flags `--nome valor` e `--flag` (bool) depois dos posicionais. */
function parseArgs(argv: string[]): { pos: string[]; flags: Record<string, string>; bools: Set<string> } {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  const bools = new Set<string>();
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[name] = next;
        i += 2;
      } else {
        bools.add(name);
        i += 1;
      }
    } else {
      pos.push(a);
      i += 1;
    }
  }
  return { pos, flags, bools };
}

/** Barra de proporção em texto — o histograma que denuncia penhasco e platô. */
function bar(value: number, max: number, width = 24): string {
  if (max <= 0) return '';
  const filled = Math.max(value > 0 ? 1 : 0, Math.round((value / max) * width));
  return '#'.repeat(filled);
}

function printHuman(report: AuditReport, limit: number, onlyGaps: boolean): void {
  const { totals } = report;

  console.log('');
  console.log(`TRILHA ${report.trackSlug}`);
  console.log(
    `orcamento: ${report.budgetSource}` +
      (report.budgetSource === 'inferred'
        ? '  (derivado do codigo que a teoria mostra — leitura PERMISSIVA: o numero real de violacoes e MAIOR, nunca menor)'
        : '  (declarado pelas aulas em introduces)'),
  );
  console.log('');

  const shown = onlyGaps
    ? report.violations.filter((v) => v.construcao !== null && v.primeiraAulaQueEnsina === null)
    : report.violations;

  const byFile = new Map<string, Violation[]>();
  for (const v of shown) {
    const list = byFile.get(v.arquivo);
    if (list) list.push(v);
    else byFile.set(v.arquivo, [v]);
  }

  let printed = 0;
  for (const [file, list] of byFile) {
    if (printed >= limit) break;
    console.log(`  ${file}`);
    for (const v of list) {
      if (printed >= limit) break;
      const origem =
        v.primeiraAulaQueEnsina === null
          ? 'LACUNA DE CURRICULO'
          : `ordem (ensinado em ${v.primeiraAulaQueEnsina})`;
      const gravidade = v.severidade === 'aviso' ? ' [AVISO]' : '';
      console.log(`    [${v.regra}]${gravidade} ${v.campo}:${v.linha}:${v.coluna}  ${v.construcao ?? '-'}  — ${origem}`);
      console.log(`         ${v.mensagem}`);
      if (v.trechoOfensor) console.log(`         > ${v.trechoOfensor}`);
      printed += 1;
    }
    console.log('');
  }
  if (shown.length > printed) {
    console.log(`  ... e mais ${shown.length - printed} violacao(oes) nao exibida(s) (use --limite N ou --json)`);
    console.log('');
  }

  console.log('DISTRIBUICAO DE CONSTRUCOES NOVAS POR AULA (o histograma que denuncia penhasco e plato)');
  console.log('  coluna 1 = introduces do orcamento · coluna 2 = verdadeiramente novas (A14a, demo ∖ cumulativo ∖ boiler)');
  const maxNovas = report.metrics.reduce((m, x) => Math.max(m, x.novas), 0);
  const maxVerdadeiras = report.metrics.reduce((m, x) => Math.max(m, x.novosVerdadeiros ?? 0), 0);
  for (const m of report.metrics) {
    const flag = m.novas === 0 ? '  <- nao introduz nada' : '';
    console.log(
      `  ${String(m.index).padStart(3)} ${m.ref.padEnd(52).slice(0, 52)} ${String(m.novas).padStart(3)} ${bar(m.novas, maxNovas)}  ` +
        `${String(m.novosVerdadeiros ?? 0).padStart(3)} ${bar(m.novosVerdadeiros ?? 0, maxVerdadeiras)}${flag}`,
    );
  }
  console.log('');

  if (report.hygiene.length > 0) {
    console.log(`HIGIENE DE FORMATO: ${report.hygiene.length} bloco(s) de codigo sem tag de linguagem`);
    for (const h of report.hygiene.slice(0, 5)) {
      console.log(`  ${h.ref}:${h.line} ${h.message}`);
    }
    if (report.hygiene.length > 5) console.log(`  ... e mais ${report.hygiene.length - 5}`);
    console.log('');
  }

  if (report.parseErrors.length > 0) {
    console.log(`ERRO DE PARSE NA TEORIA: ${report.parseErrors.length} bloco(s) marcados como js que nao parseiam`);
    for (const p of report.parseErrors.slice(0, 5)) {
      console.log(`  ${p.ref}:${p.line} ${p.message}`);
    }
    console.log('');
  }

  const pct = totals.desafios > 0 ? Math.round((totals.desafiosComViolacao / totals.desafios) * 100) : 0;
  console.log('PLACAR');
  console.log(`  aulas ................................ ${totals.aulas}`);
  console.log(`  aulas que nao introduzem construcao .. ${totals.aulasSemConstrucaoNova}`);
  console.log(`  desafios ............................. ${totals.desafios}`);
  console.log(`  desafios com violacao ................ ${totals.desafiosComViolacao} (${pct}%)`);
  console.log(`  violacoes ............................ ${totals.violacoes}`);
  console.log(`  avisos (bateria A13-A16, D4/A14a-0) .. ${totals.avisos ?? 0}`);
  console.log(`  delas, lacunas de curriculo .......... ${totals.lacunasDeCurriculo}`);
  console.log('');
  const passou = totals.desafios - totals.desafiosComViolacao;
  console.log(`  ${passou} passou · ${totals.desafiosComViolacao} falhou · 0 pendente`);
  console.log('');
}

async function cmdAudit(pos: string[], flags: Record<string, string>, bools: Set<string>): Promise<void> {
  const slug = pos[0];
  if (!slug) fail('informe o slug da trilha (ex.: npm run engine -- audit nodejs-do-zero)');

  const modo = flags.modo as BudgetSource | undefined;
  if (modo !== undefined && modo !== 'declared' && modo !== 'inferred') {
    fail(`--modo invalido: ${modo} (esperado declared ou inferred)`);
  }
  const harness = flags.harness as HarnessPolicy | undefined;
  if (harness !== undefined && harness !== 'receptive-seed' && harness !== 'none') {
    fail(`--harness invalido: ${harness} (esperado receptive-seed ou none)`);
  }
  const limite = flags.limite ? Number.parseInt(flags.limite, 10) : 40;
  if (!Number.isFinite(limite) || limite < 0) fail(`--limite invalido: ${flags.limite}`);

  let track;
  try {
    track = await loadTrack(path.join(TRACKS_DIR, slug));
  } catch (err) {
    if (err instanceof TrackLoadError) {
      console.error(`erro: trilha '${slug}' invalida (${err.issues.length} problema(s) de schema/integridade):`);
      for (const issue of err.issues.slice(0, 20)) console.error(`  ${issue.file}: ${issue.message}`);
      process.exit(1);
    }
    // Erro que NAO e de validacao (diretorio ausente, JSON ilegivel, permissao):
    // a causa real e impressa. Engolir a excecao e trocar por "nao consegui
    // carregar" transforma um defeito diagnosticavel num mistério.
    const slugs = await listTrackSlugs(TRACKS_DIR).catch(() => [] as string[]);
    console.error(`erro: falha ao carregar a trilha '${slug}': ${err instanceof Error ? err.message : String(err)}`);
    console.error(`trilhas disponiveis: ${slugs.join(', ') || '(nenhuma)'}`);
    process.exit(2);
  }

  const report = auditTrack(track, { mode: modo, harnessPolicy: harness });

  if (bools.has('json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report, limite, bools.has('so-lacunas'));
  }

  process.exit(report.totals.violacoes > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// coverage — o ALGORITMO DO DONO: código mínimo que passa no teste × orçamento
// ---------------------------------------------------------------------------

/** Um desafio da trilha com a referência da aula (null p/ desafios de módulo/proficiência). */
interface DesafioDaTrilha {
  ref: string;
  lessonRef: string | null;
  challenge: TrackChallengeSource;
}

/** Todos os desafios da trilha: aulas + desafio do módulo + proficiência. */
function coletarDesafios(track: LoadedTrack): DesafioDaTrilha[] {
  const out: DesafioDaTrilha[] = [];
  for (const mod of track.modules) {
    for (const lesson of mod.lessons) {
      for (const ch of lesson.challenges) {
        out.push({ ref: `${mod.meta.slug}/${lesson.meta.slug}/${ch.slug}`, lessonRef: `${mod.meta.slug}/${lesson.meta.slug}`, challenge: ch });
      }
    }
    if (mod.challenge) {
      out.push({ ref: `${mod.meta.slug}/challenges/${mod.challenge.slug}`, lessonRef: null, challenge: mod.challenge });
    }
  }
  if (track.proficiency) {
    out.push({ ref: `proficiency/${track.proficiency.slug}`, lessonRef: null, challenge: track.proficiency });
  }
  return out;
}

/** Carrega a trilha (--dir sobrescreve resources/tracks) com o padrão do cmdAudit. */
async function carregarTrilhaOuFalhar(slug: string, dirOverride: string | undefined): Promise<LoadedTrack> {
  const dir = dirOverride !== undefined ? path.resolve(dirOverride) : path.join(TRACKS_DIR, slug);
  try {
    return await loadTrack(dir);
  } catch (err) {
    if (err instanceof TrackLoadError) {
      console.error(`erro: trilha '${slug}' invalida (${err.issues.length} problema(s) de schema/integridade):`);
      for (const issue of err.issues.slice(0, 20)) console.error(`  ${issue.file}: ${issue.message}`);
      process.exit(1);
    }
    const slugs = await listTrackSlugs(TRACKS_DIR).catch(() => [] as string[]);
    console.error(`erro: falha ao carregar a trilha '${slug}': ${err instanceof Error ? err.message : String(err)}`);
    console.error(`trilhas disponiveis: ${slugs.join(', ') || '(nenhuma)'}`);
    process.exit(2);
  }
}

/** Orçamento de comparação: aula específica ou (sem aula) o fim da trilha. */
function orcamentoParaComparacao(budget: TrackBudget, lessonRef: string | null): {
  productive: ReadonlySet<AtomKey>;
  receptive: ReadonlySet<AtomKey>;
  introducesProductive: AtomKey[];
  orcamentoRef: string | null;
} {
  if (lessonRef !== null) {
    const lb = budget.byRef.get(lessonRef);
    if (lb) {
      return {
        productive: lb.saida.productive,
        receptive: lb.saida.receptive,
        introducesProductive: lb.introduces.productive,
        orcamentoRef: lb.ref,
      };
    }
  }
  const ultima = budget.lessons[budget.lessons.length - 1];
  if (ultima) {
    return {
      productive: ultima.saida.productive,
      receptive: ultima.saida.receptive,
      introducesProductive: [],
      orcamentoRef: null,
    };
  }
  return { productive: new Set(), receptive: new Set(), introducesProductive: [], orcamentoRef: null };
}

type StatusCoverage =
  | 'ok'
  | 'sem-solucao'
  | 'parse-falhou'
  | 'prover-falhou'
  | 'ignorado';

interface ResultadoCoverage {
  ref: string;
  status: StatusCoverage;
  minimalCode?: string;
  atoms?: AtomKey[];
  atomsDoTeste?: AtomKey[];
  linhas?: number;
  lacuna: AtomKey[];
  excesso: AtomKey[];
  orcamentoRef: string | null;
  detail?: string;
}

/** Audita UM desafio: sintetiza o mínimo (prover real, semáforo SEM_EXEC) e compara. */
async function auditarDesafioCoverage(
  desafio: DesafioDaTrilha,
  budget: TrackBudget,
  prover: ProverDeDesafio,
  release: () => void,
): Promise<ResultadoCoverage> {
  const ch = desafio.challenge;
  const orc = orcamentoParaComparacao(budget, desafio.lessonRef);
  try {
    if (ch.files && ch.files.length > 0 && (ch.starterCode === undefined || ch.solutionCode === undefined)) {
      return { ref: desafio.ref, status: 'ignorado', lacuna: [], excesso: [], orcamentoRef: orc.orcamentoRef, detail: 'desafio multi-arquivo (files) — fora do escopo desta onda' };
    }
    const veredito = await sintetizarCodigoMinimo(prover, {
      starterCode: ch.starterCode ?? '',
      solutionCode: ch.solutionCode ?? '',
      testsCode: ch.testsCode,
      expectedTestCount: ch.expectedTestCount,
    });
    if (!veredito.ok) {
      return { ref: desafio.ref, status: veredito.reason === 'PARSE_FALHOU' ? 'parse-falhou' : veredito.reason === 'PROVER_FALHOU' ? 'prover-falhou' : 'sem-solucao', lacuna: [], excesso: [], orcamentoRef: orc.orcamentoRef, detail: veredito.detail };
    }
    const fora = veredito.atoms.filter((a) => !orc.productive.has(a) && !orc.receptive.has(a));
    const excesso = orc.introducesProductive.filter((a) => !veredito.atoms.includes(a));
    return {
      ref: desafio.ref,
      status: 'ok',
      minimalCode: veredito.minimalCode,
      atoms: veredito.atoms,
      atomsDoTeste: veredito.atomsDoTeste,
      linhas: veredito.lines,
      lacuna: fora,
      excesso,
      orcamentoRef: orc.orcamentoRef,
    };
  } finally {
    release();
  }
}

async function cmdCoverage(pos: string[], flags: Record<string, string>, bools: Set<string>): Promise<void> {
  const slug = pos[0];
  if (!slug) fail('informe o slug da trilha (ex.: npm run engine -- coverage programacao-do-zero)');

  const modo = flags.modo as BudgetSource | undefined;
  if (modo !== undefined && modo !== 'declared' && modo !== 'inferred') {
    fail(`--modo invalido: ${modo} (esperado declared ou inferred)`);
  }
  const limite = flags.limite !== undefined ? Number.parseInt(flags.limite, 10) : Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(limite) || limite < 0) fail(`--limite invalido: ${flags.limite}`);

  const track = await carregarTrilhaOuFalhar(slug, flags.dir);
  const budget = deriveTrackBudget(track, { mode: modo });
  const desafios = coletarDesafios(track).slice(0, limite);

  const prover = criarProverDeDesafio();
  const sem = createExecSemaphore();
  const resultados: ResultadoCoverage[] = await Promise.all(
    desafios.map(async (d) => {
      const release = await sem.acquire();
      return auditarDesafioCoverage(d, budget, prover, release);
    }),
  );

  const placar = {
    desafios: resultados.length,
    passou: resultados.filter((r) => r.status === 'ok').length,
    semSolucao: resultados.filter((r) => r.status === 'sem-solucao').length,
    parseFalhou: resultados.filter((r) => r.status === 'parse-falhou').length,
    proverFalhou: resultados.filter((r) => r.status === 'prover-falhou').length,
    ignorados: resultados.filter((r) => r.status === 'ignorado').length,
    lacunas: resultados.reduce((acc, r) => acc + r.lacuna.length, 0),
    excessos: resultados.reduce((acc, r) => acc + r.excesso.length, 0),
  };

  if (bools.has('json')) {
    console.log(
      JSON.stringify(
        {
          trilha: slug,
          orcamento: budget.source,
          desafios: resultados,
          placar,
        },
        null,
        2,
      ),
    );
  } else {
    console.log('');
    console.log(`TRILHA ${slug} — COBERTURA DO TESTE (código mínimo que passa, zero LLM)`);
    console.log(`orcamento: ${budget.source}`);
    for (const r of resultados) {
      console.log('');
      console.log(`  ${r.ref}`);
      if (r.status === 'ok') {
        console.log(`    MINIMO (${r.linhas} linhas, provas validas):`);
        const indentado = (r.minimalCode ?? '').split('\n').map((l) => `      ${l}`).join('\n');
        console.log(indentado);
        console.log(`    ATOMS COBRADOS (${r.atoms?.length ?? 0}): ${(r.atoms ?? []).join(', ')}`);
        console.log(`    LACUNA — o teste cobra algo que a aula nao oferece (${r.lacuna.length}): ${r.lacuna.length > 0 ? r.lacuna.join(', ') : '(nenhuma)'}`);
        console.log(`    EXCESSO — a aula ensina mas o teste nao cobra (${r.excesso.length}): ${r.excesso.length > 0 ? r.excesso.join(', ') : '(nenhum)'}`);
        if (r.orcamentoRef) console.log(`    orcamento de referencia: ${r.orcamentoRef}`);
      } else if (r.status === 'ignorado') {
        console.log(`    IGNORADO: ${r.detail ?? ''}`);
      } else {
        console.log(`    ${r.status.toUpperCase()}: ${r.detail ?? ''}`);
      }
    }
    console.log('');
    console.log('PLACAR (coverage)');
    console.log(`  desafios ..................... ${placar.desafios}`);
    console.log(`  passou (solucao minima) ...... ${placar.passou}`);
    console.log(`  sem-solucao .................. ${placar.semSolucao}`);
    console.log(`  parse-falhou ................. ${placar.parseFalhou}`);
    console.log(`  prover-falhou ................ ${placar.proverFalhou}`);
    console.log(`  ignorados (multi-arquivo) .... ${placar.ignorados}`);
    console.log(`  lacunas (fora do orcamento) .. ${placar.lacunas}`);
    console.log(`  excessos (aula ensina, teste nao cobra) .. ${placar.excessos}`);
    console.log('');
  }

  const violou = placar.lacunas > 0 || placar.semSolucao > 0 || placar.proverFalhou > 0;
  process.exit(violou ? 1 : 0);
}

// ---------------------------------------------------------------------------
// requirements — DERIVAÇÃO + BIJEÇÃO requirements declarados × test('…')
// ---------------------------------------------------------------------------

/** Campo aditivo `requirements` do challenge.json (não tipado em trackTypes — leitura defensiva). */
function lerRequirementsDeclarados(challenge: TrackChallengeSource): RequirementDeclarado[] {
  const raw = (challenge as unknown as { requirements?: unknown }).requirements;
  if (!Array.isArray(raw)) return [];
  const out: RequirementDeclarado[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id === 'string' && typeof r.teste === 'string') {
      out.push({ id: r.id, descricao: typeof r.descricao === 'string' ? r.descricao : undefined, teste: r.teste });
    }
  }
  return out;
}

interface ResultadoRequirements {
  ref: string;
  derivados: RequirementsDerivados;
  declarados: RequirementDeclarado[];
  validacao: ValidacaoRequirements;
}

async function cmdRequirements(pos: string[], flags: Record<string, string>, bools: Set<string>): Promise<void> {
  const slug = pos[0];
  if (!slug) fail('informe o slug da trilha (ex.: npm run engine -- requirements programacao-do-zero)');

  const limite = flags.limite !== undefined ? Number.parseInt(flags.limite, 10) : Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(limite) || limite < 0) fail(`--limite invalido: ${flags.limite}`);

  const track = await carregarTrilhaOuFalhar(slug, flags.dir);
  const desafios = coletarDesafios(track).slice(0, limite);

  const resultados: ResultadoRequirements[] = [];
  for (const d of desafios) {
    const declarados = lerRequirementsDeclarados(d.challenge);
    let derivados: RequirementsDerivados;
    let validacao: ValidacaoRequirements;
    try {
      derivados = derivarRequirements(d.challenge.testsCode, d.challenge.solutionCode ?? '', d.challenge.starterCode ?? '');
      validacao = validarRequirements(d.challenge.testsCode, declarados);
    } catch (err) {
      // fail-closed: teste que não parseia vira gap (nunca silêncio).
      derivados = { requirements: [], cobertura: [] };
      validacao = { ok: false, semTeste: declarados.map((r) => r.id), testesSemRequirement: [], correspondencias: [] };
      console.error(`  [parse-falhou] ${d.ref}: ${err instanceof Error ? err.message : String(err)}`);
    }
    resultados.push({ ref: d.ref, derivados, declarados, validacao });
  }

  const placar = {
    desafios: resultados.length,
    comBijecaoCompleta: resultados.filter((r) => r.validacao.ok).length,
    comGaps: resultados.filter((r) => !r.validacao.ok).length,
    semTeste: resultados.reduce((acc, r) => acc + r.validacao.semTeste.length, 0),
    testesSemRequirement: resultados.reduce((acc, r) => acc + r.validacao.testesSemRequirement.length, 0),
  };

  if (bools.has('json')) {
    console.log(JSON.stringify({ trilha: slug, desafios: resultados, placar }, null, 2));
  } else {
    console.log('');
    console.log(`TRILHA ${slug} — REQUIREMENTS (derivados do teste × declarados no desafio)`);
    for (const r of resultados) {
      console.log('');
      console.log(`  ${r.ref}`);
      console.log(`    derivados: ${r.derivados.requirements.length} · declarados: ${r.declarados.length} · bijecao: ${r.validacao.ok ? 'OK' : 'GAP'}`);
      for (const req of r.derivados.requirements) {
        console.log(`      [derivado] ${req.id} ${req.teste}: ${req.descricao}`);
      }
      if (r.validacao.semTeste.length > 0) {
        console.log(`      GAP — requirements declarados SEM teste: ${r.validacao.semTeste.join(', ')}`);
      }
      if (r.validacao.testesSemRequirement.length > 0) {
        console.log(`      GAP — test() SEM requirement declarado: ${r.validacao.testesSemRequirement.join(', ')}`);
      }
    }
    console.log('');
    console.log('PLACAR (requirements)');
    console.log(`  desafios ..................... ${placar.desafios}`);
    console.log(`  bijecao completa ............ ${placar.comBijecaoCompleta}`);
    console.log(`  com gaps .................... ${placar.comGaps}`);
    console.log(`  requirements sem teste ...... ${placar.semTeste}`);
    console.log(`  testes sem requirement ...... ${placar.testesSemRequirement}`);
    console.log('');
  }

  process.exit(placar.comGaps > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// revise — a REVISÃO PROGRESSIVA (onda 5): varredura 1ª → última aula com
// memória acumulada + convergência por hash. Zero LLM no núcleo.
// ---------------------------------------------------------------------------

/** Etiqueta humana da decisão de uma aula. */
function rotuloDecisao(aula: RelatorioDeRevisao['aulas'][number]): string {
  if (aula.naoRevisavel) return 'NAO-REVISAVEL (fail-closed)';
  if (aula.precisaQuebrar) return 'PRECISA QUEBRAR (SPLIT)';
  return 'COBERTA';
}

async function cmdRevise(pos: string[], flags: Record<string, string>, bools: Set<string>): Promise<void> {
  const slug = pos[0];
  if (!slug) fail('informe o slug da trilha (ex.: npm run engine -- revise programacao-do-zero)');

  const limite = flags.limite !== undefined ? Number.parseInt(flags.limite, 10) : Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(limite) || limite < 0) fail(`--limite invalido: ${flags.limite}`);

  const track = await carregarTrilhaOuFalhar(slug, flags.dir);
  const prover = criarProverDeDesafio();
  // A MESMA fonte do audit em modo declared: introduces do lesson.json.
  const budget = deriveTrackBudget(track, { mode: 'declared' });

  const relatorio = await rodarRevisaoAteConvergir({
    revisarCurso: () =>
      revisarCurso({
        track,
        prover,
        limite,
        orcamentoPorAula: (lessonRef) => {
          const o = orcamentoParaComparacao(budget, lessonRef);
          return {
            productive: o.productive,
            receptive: o.receptive,
            introducesProductive: o.introducesProductive,
            ref: o.orcamentoRef,
          };
        },
        orcamentoFonte: budget.source,
      }),
    maxIteracoes: 3,
  });

  const dirSaida = path.join(CONTENT_SRC_DIR, slug, 'revisao-progressiva');
  const gravado = await gravarRelatorio(relatorio, dirSaida);

  if (bools.has('json')) {
    console.log(JSON.stringify(relatorio, null, 2));
  } else {
    const p = relatorio.placar;
    console.log('');
    console.log(`TRILHA ${slug} — REVISAO PROGRESSIVA (1a aula -> ultima, memoria acumulada)`);
    console.log(`orcamento: ${relatorio.orcamentoFonte} (introduces do lesson.json)`);
    console.log(`convergencia: ${relatorio.convergencia ? 'SIM' : 'NAO'} em ${relatorio.iteracoes} iteracao(oes)`);
    for (const a of relatorio.aulas) {
      const lacunas = a.desafios.flatMap((d) => d.foraDoOrcamento);
      const excessos = a.desafios.flatMap((d) => d.excesso);
      console.log(`  [${String(a.indice).padStart(2)}] ${a.aula.padEnd(44).slice(0, 44)} ${rotuloDecisao(a)}` +
        (lacunas.length > 0 ? `  lacunas: ${lacunas.join(', ')}` : '') +
        (excessos.length > 0 ? `  excesso: ${excessos.join(', ')}` : ''));
    }
    console.log('');
    console.log('PLACAR (revisao progressiva)');
    console.log(`  aulas ..................... ${p.aulas}`);
    console.log(`  cobertas .................. ${p.cobertas}`);
    console.log(`  com-lacuna (split) ........ ${p.comLacuna}`);
    console.log(`  nao-revisaveis ............ ${p.naoRevisaveis}`);
    console.log(`  com-excesso (ajuste) ...... ${p.comExcesso}`);
    console.log(`  splits pendentes .......... ${p.splitsPendentes}`);
    console.log(`  relatorio gravado em ...... ${gravado.dir}`);
    console.log('');
  }

  process.exit(relatorio.placar.comLacuna > 0 || relatorio.placar.naoRevisaveis > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// generate — P-22: CLI FINO, fiação INJETÁVEL fora do entry (geraTrilha.ts)
// ---------------------------------------------------------------------------

/**
 * Resolve a chave do provedor de LLM (OpenRouter), NESTA ordem:
 *
 *   1. `process.env.OPENROUTER_API_KEY`      (o env do contrato congelado);
 *   2. `settingsStore.getApiKey('openrouter')` (o que o app GUI gravou);
 *   3. LEGADO: `process.env.DEEPSEEK_API_KEY` / `getApiKey('deepseek')`.
 *
 * O passo 3 é TRANSITÓRIO: existe só para não quebrar quem já tinha o ambiente
 * montado com a chave antiga na migração DeepSeek → OpenRouter. Remova-o assim
 * que os ambientes (dev, CI e o settingsStore dos usuários) estiverem migrados
 * — a partir daí a chave do provedor tem UM nome só.
 */
async function resolverChaveOpenRouter(): Promise<string> {
  const env = process.env[OPENROUTER_ENV_KEY];
  if (env && env.trim() !== '') return env.trim();

  const doStore = await lerChaveDoStore(OPENROUTER_PROVIDER_KEY);
  if (doStore) return doStore;

  // ── fallback LEGADO (transitório — ver o comentário acima) ────────────────
  const legadoEnv = process.env.DEEPSEEK_API_KEY;
  if (legadoEnv && legadoEnv.trim() !== '') return legadoEnv.trim();
  const legadoStore = await lerChaveDoStore('deepseek');
  if (legadoStore) return legadoStore;

  return '';
}

/** Lê um slot do settingsStore; '' quando o store está indisponível/vazio. */
async function lerChaveDoStore(provider: string): Promise<string> {
  try {
    // settingsStore é só node:fs/node:path — roda fora do Electron.
    const { getSettingsStore } = await import('../../electron/main/services/settingsStore');
    return (await (await getSettingsStore()).getApiKey(provider)) || '';
  } catch {
    // settingsStore indisponível — quem chamou segue para o próximo passo.
    return '';
  }
}

/** Executor de multi-busca em PRODUÇÃO: o Brave real (A-P14-2/A-P14-3). */
function criarMultiBuscaBrave(): ExecutorDeMultiBusca {
  const brave = createBraveSearchService();
  return {
    multiSearch: (queries, opts) =>
      brave.multiSearch(queries, {
        concurrency: opts.concurrency,
        delayMs: opts.delayMs,
        delayMsOnRateLimit: opts.delayMsOnRateLimit,
        count: opts.count,
      }),
  };
}

/** A FIAÇÃO DE PRODUÇÃO do modo generate (deps injetáveis resolvidos aqui). */
function fiarDepsDeProducao(dir: string, dirProduto: string): DepsGeracao {
  const llm: EngineLlm = createCallLlm({
    client: createDeepSeekClient({ apiKey: () => resolverChaveOpenRouter() }),
    apiKey: () => resolverChaveOpenRouter(),
    semaphore: createLlmSemaphore(),
  });

  // P-27: pools SEPARADOS — o SEM_LLM do transporte NUNCA é o pool do
  // escalonador (o executor chama o transporte dentro do slot → deadlock).
  const multi = criarMultiBuscaBrave();

  return {
    dir,
    dirProduto,
    llm,
    multi,
    busca: criarBuscaPlanejada({
      llm,
      multi,
      stageVersion: f1ConfigDefault().stageVersion,
      timeoutMs: f1ConfigDefault().timeoutMs,
    }),
    prover: criarProverDeDesafio(),
    juizArestas: criarJuizDeArestaLlm(llm),
    semaforoOnda: createSemaphore(8),
    semaforoJulgamento: createSemaphore(8),
    // F10/F11: seam pós-merge do P-35 (review/audit2Laco) — até lá a rodada
    // de revisão é declarada como limitação na saída (nunca omitida, §9.2).
    tetoTokensPorExecucao: undefined,
  };
}

function validarFaseOuFalhar(from: string | undefined): FaseId | undefined {
  if (from === undefined) return undefined;
  if (!(FASES_ORDEM as readonly string[]).includes(from)) {
    fail(`--from invalido: ${from} (esperado uma de ${FASES_ORDEM.join(', ')})`);
  }
  return from as FaseId;
}

async function cmdGenerate(pos: string[], flags: Record<string, string>): Promise<void> {
  const slug = pos[0];
  const assunto = flags.assunto;
  if (!slug) fail('informe o slug da trilha (ex.: npm run engine -- generate javascript-do-zero --assunto "...")');
  if (!assunto) fail('informe --assunto "..." (o tema da trilha a produzir)');

  const from = validarFaseOuFalhar(flags.from);
  const only = flags.only;
  const tetoTokens = flags['teto-tokens'] !== undefined ? Number.parseInt(flags['teto-tokens'], 10) : undefined;
  if (tetoTokens !== undefined && (!Number.isInteger(tetoTokens) || tetoTokens < 1)) {
    fail(`--teto-tokens invalido: ${flags['teto-tokens']} (esperado inteiro ≥ 1)`);
  }
  const familiasValidas = ['sintaxe', 'estrutura-de-dados', 'algoritmo', 'api-runtime', 'ferramenta'];
  const familia = flags.familia;
  if (familia !== undefined && !familiasValidas.includes(familia)) {
    fail(`--familia invalido: ${familia} (esperado uma de ${familiasValidas.join(', ')})`);
  }

  const dir = path.join(CONTENT_SRC_DIR, slug);
  const dirProduto = path.join(TRACKS_DIR, slug);

  const deps = fiarDepsDeProducao(dir, dirProduto);
  deps.onEvento = (linha) => console.log(linha);

  try {
    const resultado = await gerarTrilha(deps, {
      slug,
      assunto,
      from,
      only,
      tetoTokens,
      familia: familia as FamiliaAssunto | undefined,
    });
    console.log('');
    if (resultado.concluido) {
      console.log(`GERACAO CONCLUIDA — trilha ${resultado.slug} em ${dirProduto}`);
    } else {
      console.log(`GERACAO PAROU na fase ${resultado.faseAtual} (retome com --from ${resultado.faseAtual})`);
    }
    for (const limitacao of resultado.limitacoes) {
      console.log(`  LIMITACAO DECLARADA: ${limitacao}`);
    }
    if (resultado.gFinal) {
      console.log(
        `  G-FINAL: ${resultado.gFinal.ok ? 'aprovado' : 'REPROVADO'} (aulas ${resultado.gFinal.contagens.aulas}, desafios ${resultado.gFinal.contagens.desafios})`,
      );
    }
    process.exit(resultado.concluido ? 0 : 1);
  } catch (erro) {
    console.error('');
    if (erro instanceof ErroGeracao) {
      console.error(`erro estruturado [${erro.code}]${erro.fase ? ` na fase ${erro.fase}` : ''}: ${erro.message}`);
      console.error(
        `o run ficou INTACTO e RETOMAVEL em ${dir}/run.json — continue com 'npm run engine -- generate ${slug} --assunto "${assunto}" --from ${erro.fase ?? 'F0'}'`,
      );
      process.exit(2);
    }
    console.error(`erro inesperado: ${erro instanceof Error ? erro.stack ?? erro.message : String(erro)}`);
    process.exit(2);
  }
}

async function cmdLintSchemas(): Promise<void> {
  const resultado = lintSchemasDaEngine(SCHEMA_REGISTRY);
  if (resultado.ordem.length === 0 && resultado.camposOpcionais.length === 0) {
    console.log(`lint de schemas OK: ${SCHEMA_REGISTRY.length} registers, ordem e obrigatoriedade válidas (INV-04/INV-05)`);
    return;
  }
  console.error(`lint de schemas FALHOU (${SCHEMA_REGISTRY.length} registrados):`);
  for (const p of resultado.ordem) {
    console.error(
      `  INV-04 ${p.schema}@${p.caminho}: decisao "${p.campo_decisao}" (indice ${p.indice_decisao}) antes da justificativa "${p.campo_justificativa}" (indice ${p.indice_justificativa})`,
    );
  }
  for (const p of resultado.camposOpcionais) {
    console.error(`  INV-05 ${p.schema}@${p.caminho}: campo ${p.tipo} — todo campo é obrigatório`);
  }
  process.exit(2);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    process.exit(command ? 0 : 2);
  }
  const { pos, flags, bools } = parseArgs(rest);

  switch (command) {
    case 'audit':
      await cmdAudit(pos, flags, bools);
      break;
    case 'coverage':
      await cmdCoverage(pos, flags, bools);
      break;
    case 'requirements':
      await cmdRequirements(pos, flags, bools);
      break;
    case 'revise':
      await cmdRevise(pos, flags, bools);
      break;
    case 'generate':
      await cmdGenerate(pos, flags);
      break;
    case 'lint-schemas':
      await cmdLintSchemas();
      break;
    case 'repair':
      console.error(
        `erro: '${command}' ainda nao esta implementado. A ordem de construcao (docs/16-engine-de-trilha.md §14)\n` +
          "poe o gate deterministico primeiro: rode 'audit' para ver o estado real do conteudo.",
      );
      process.exit(2);
      break;
    default:
      fail(`comando desconhecido: ${command}`);
  }
}

main().catch((err) => {
  console.error(`erro inesperado: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(2);
});