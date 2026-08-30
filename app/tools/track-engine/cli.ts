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
 * Este arquivo implementa `audit`, que é o modo que precisa existir primeiro:
 * é o gate que hoje não existe, é determinístico, é barato, e é o TESTE DE
 * ACEITAÇÃO da engine inteira — se ele não reprovar o conteúdo que sabidamente
 * está quebrado, nada do resto adianta.
 *
 * `generate` e `repair` são os modos que chamam a LLM. A engine NUNCA escreve
 * aula por conta própria fora deles: quem escreve conteúdo é o autor-LLM,
 * recebendo o orçamento congelado como restrição dura. O código aqui produz o
 * orçamento, verifica o resultado e aponta o defeito — nada mais.
 *
 * Exit codes, na convenção do repositório (`app/tools/track-cli.ts`):
 *   0  nenhuma violação
 *   1  violações encontradas (falha de CONTEÚDO)
 *   2  uso incorreto
 *
 * Referência: `docs/16-engine-de-trilha.md`.
 */

import * as path from 'node:path';
import { listTrackSlugs, loadTrack, TrackLoadError } from '../../electron/main/content/trackLoader';
import { auditTrack, type AuditReport, type Violation } from '../../electron/main/engine/audit';
import type { BudgetSource, HarnessPolicy } from '../../electron/main/engine/budget';

const CLI_ROOT = path.resolve(__dirname, '..', '..');
const TRACKS_DIR = path.join(CLI_ROOT, 'resources', 'tracks');

const USAGE = `uso: npm run engine -- <comando> [args...]

comandos:
  audit <slug> [--modo declared|inferred] [--harness receptive-seed|none]
                [--limite N] [--json] [--so-lacunas]
      audita uma trilha contra o orcamento cumulativo de conhecimento.
      Nao usa LLM e nao precisa de chave de API.

  generate <slug> --assunto "..."      (nao implementado nesta onda)
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
      console.log(`    [${v.regra}] ${v.campo}:${v.linha}:${v.coluna}  ${v.construcao ?? '-'}  — ${origem}`);
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
  const maxNovas = report.metrics.reduce((m, x) => Math.max(m, x.novas), 0);
  for (const m of report.metrics) {
    const flag = m.novas === 0 ? '  <- nao introduz nada' : '';
    console.log(
      `  ${String(m.index).padStart(3)} ${m.ref.padEnd(52).slice(0, 52)} ${String(m.novas).padStart(3)} ${bar(m.novas, maxNovas)}${flag}`,
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
    case 'generate':
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
