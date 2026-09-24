/**
 * app/electron/main/engine/revision/progressivaRelatorio.ts — o PLACAR, a
 * CONVERGÊNCIA e o RELATÓRIO (JSON + markdown pt-BR + seeds de SPLIT) da
 * revisão progressiva (`progressiva.ts`). Extraído do módulo original na
 * refatoração do lote L05 sem NENHUMA mudança de comportamento (o markdown é
 * contrato de saída — ver `cx-phases-revision-progressiva.test.ts`) — a fachada
 * `progressiva.ts` re-exporta o que é público.
 */

import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import type {
  FeedbackDeAula,
  FeedbackDeDesafio,
  RelatorioDeRevisao,
  RodarRevisaoOptions,
  SplitPendente,
  PlacarDeRevisao,
  ResultadoGravacao,
} from './progressivaTipos';

export function montarPlacar(aulas: FeedbackDeAula[], splits: SplitPendente[]): PlacarDeRevisao {
  return {
    aulas: aulas.length,
    cobertas: aulas.filter((a) => !a.naoRevisavel && !a.precisaQuebrar).length,
    comLacuna: aulas.filter((a) => a.precisaQuebrar).length,
    naoRevisaveis: aulas.filter((a) => a.naoRevisavel === true).length,
    comExcesso: aulas.filter((a) => a.desafios.some((d) => d.excesso.length > 0)).length,
    splitsPendentes: splits.length,
  };
}

// ---------------------------------------------------------------------------
// Convergência — hash estável + válvula anti-loop
// ---------------------------------------------------------------------------

/** JSON canônico (chaves ordenadas) — base determinística do hash. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const chaves = Object.keys(obj).sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** Hash do CONTEÚDO do relatório (sem convergencia/iteracoes — metadados do loop). */
function hashDoRelatorio(relatorio: RelatorioDeRevisao): string {
  const { convergencia: _c, iteracoes: _i, ...nucleo } = relatorio;
  return createHash('sha256').update(canonicalJson(nucleo)).digest('hex');
}

/**
 * Repete a varredura até o hash do relatório ficar estável entre iterações
 * (convergência) ou estourar a válvula `maxIteracoes` (anti-loop). O relatório
 * devolvido é o da ÚLTIMA iteração, com `convergencia`/`iteracoes` preenchidos.
 */
export async function rodarRevisaoAteConvergir(opts: RodarRevisaoOptions): Promise<RelatorioDeRevisao> {
  const maxIteracoes = opts.maxIteracoes ?? 3;
  let hashAnterior = '';
  let relatorio: RelatorioDeRevisao | null = null;
  let convergencia = false;
  let iteracoes = 0;

  for (let i = 1; i <= maxIteracoes; i += 1) {
    iteracoes = i;
    relatorio = await opts.revisarCurso();
    const hash = hashDoRelatorio(relatorio);
    if (hashAnterior !== '' && hash === hashAnterior) {
      convergencia = true;
      break;
    }
    hashAnterior = hash;
  }

  // Fail-closed na prova de estabilidade: com apenas 1 iteração não há "entre
  // iterações" — convergencia fica false (nunca um verde por ignorância).
  return { ...(relatorio as RelatorioDeRevisao), convergencia, iteracoes };
}

// ---------------------------------------------------------------------------
// gravarRelatorio — NADA SE PERDE: JSON + markdown pt-BR + seeds de SPLIT
// ---------------------------------------------------------------------------

/** Nome de arquivo seguro a partir de uma ref (`m1/l1` → `m1__l1`). */
function nomeArquivoSeguro(ref: string): string {
  return ref.replace(/[^a-zA-Z0-9_-]+/g, '__');
}

/**
 * Grava o relatório em `dir`: `relatorio-revisao.json` (artefato completo),
 * `relatorio-revisao.md` (leitura pt-BR) e, para cada SPLIT pendente,
 * `splits/<aula>--<desafio>.minimal.mjs` (o minimalCode — a semente da aula
 * nova) + `.seed.json` (atoms + lacuna). Nada do que foi gerado se perde.
 */
export async function gravarRelatorio(relatorio: RelatorioDeRevisao, dir: string): Promise<ResultadoGravacao> {
  await fsp.mkdir(dir, { recursive: true });
  const arquivos: string[] = [];

  const jsonPath = path.join(dir, 'relatorio-revisao.json');
  await fsp.writeFile(jsonPath, `${JSON.stringify(relatorio, null, 2)}\n`, 'utf8');
  arquivos.push(jsonPath);

  const mdPath = path.join(dir, 'relatorio-revisao.md');
  await fsp.writeFile(mdPath, gerarMarkdown(relatorio), 'utf8');
  arquivos.push(mdPath);

  for (const s of relatorio.splitsPendentes) {
    const base = `${nomeArquivoSeguro(s.aula)}--${s.desafio}`;
    const splitsDir = path.join(dir, 'splits');
    await fsp.mkdir(splitsDir, { recursive: true });

    const mjsPath = path.join(splitsDir, `${base}.minimal.mjs`);
    await fsp.writeFile(mjsPath, s.minimalCode, 'utf8');
    arquivos.push(mjsPath);

    const seedPath = path.join(splitsDir, `${base}.seed.json`);
    await fsp.writeFile(
      seedPath,
      `${JSON.stringify({ aula: s.aula, desafio: s.desafio, atoms: s.atoms, foraDoOrcamento: s.foraDoOrcamento, minimalCode: s.minimalCode }, null, 2)}\n`,
      'utf8',
    );
    arquivos.push(seedPath);
  }

  return { dir, arquivos };
}

// ---------------------------------------------------------------------------
// Markdown pt-BR (leitura humana — nada se perde em prosa legível)
// ---------------------------------------------------------------------------

/** Etiqueta humana do veredito de um desafio. */
function rotuloVeredito(d: FeedbackDeDesafio): string {
  const v = d.veredito;
  if (!v.ok) {
    if (v.reason === 'IGNORADO') return 'IGNORADO (multi-arquivo)';
    return `NÃO-OK (${v.reason})${v.detail ? ` — ${v.detail}` : ''}`;
  }
  return `ok — mínimo com ${v.lines} linha(s), provas válidas`;
}

/** O cabeçalho e o placar do markdown. */
function cabecalhoDoMarkdown(relatorio: RelatorioDeRevisao, p: PlacarDeRevisao): string[] {
  return [
    `# Revisão Progressiva — ${relatorio.trackSlug}`,
    '',
    `- Orçamento: **${relatorio.orcamentoFonte}** (mesma fonte do audit em modo declared — introduces do lesson.json)`,
    `- Convergência: **${relatorio.convergencia ? 'SIM' : 'NÃO'}** em **${relatorio.iteracoes}** iteração(ões) (hash estável do relatório + válvula anti-loop)`,
    '',
    '## Placar',
    '',
    `| Métrica | Valor |`,
    `|---|---|`,
    `| Aulas | ${p.aulas} |`,
    `| Cobertas | ${p.cobertas} |`,
    `| Com lacuna (candidata a SPLIT) | ${p.comLacuna} |`,
    `| Não-revisáveis (fail-closed) | ${p.naoRevisaveis} |`,
    `| Com excesso (ajuste) | ${p.comExcesso} |`,
    `| Splits pendentes (minimalCode preservado) | ${p.splitsPendentes} |`,
    '',
  ];
}

/** As linhas de DECISÃO da aula (NÃO-REVISÁVEL × SPLIT × COBERTA). */
function decisaoDaAula(a: FeedbackDeAula): string[] {
  if (a.naoRevisavel) {
    return [
      `**Decisão: NÃO-REVISÁVEL** (fail-closed — nunca loopa)`,
      '',
      `> ${a.naoRevisavelMotivo ?? a.motivo}`,
    ];
  }
  if (a.precisaQuebrar) {
    return [`**Decisão: PRECISA QUEBRAR (SPLIT)**`, '', `> ${a.motivo}`];
  }
  return [`**Decisão: COBERTA**`, '', `> ${a.motivo}`];
}

/** As linhas de UM desafio (veredito, átomos, lacuna, excesso, requirements). */
function linhasDoDesafio(d: FeedbackDeDesafio): string[] {
  const linhas: string[] = [];
  linhas.push(`- **${d.slug}** — ${rotuloVeredito(d)}`);
  if (d.atomsCobrados.length > 0) {
    linhas.push(`  - Átomos cobrados pelo teste (\`atoms\` do mínimo): \`${d.atomsCobrados.join('`, `')}\``);
  }
  if (d.foraDoOrcamento.length > 0) {
    linhas.push(`  - **LACUNA** (fora do orçamento): \`${d.foraDoOrcamento.join('`, `')}\``);
  }
  if (d.excesso.length > 0) {
    linhas.push(`  - **EXCESSO** (aula ensina, teste não cobra): \`${d.excesso.join('`, `')}\``);
  }
  if (d.requirements !== null) {
    const gaps = [...d.requirements.semTeste.map((id) => `declarado sem teste: ${id}`), ...d.requirements.testesSemRequirement.map((t) => `teste sem declarado: '${t}'`)];
    linhas.push(`  - Sinal secundário (bijeção requirements × test): ${d.requirements.ok ? 'OK' : `GAP — ${gaps.join('; ')} (ajuste, não split)`}`);
  }
  return linhas;
}

/** A seção de UMA aula (decisão, memória vigente e desafios). */
function secaoDaAula(a: FeedbackDeAula): string[] {
  const linhas: string[] = [];
  linhas.push(`## Aula ${a.indice} — ${a.aula} (${a.titulo})`);
  linhas.push('');
  linhas.push(...decisaoDaAula(a));
  linhas.push('');
  linhas.push(`**Memória vigente nesta revisão** — aula anterior: \`${a.memoria.aulaAnterior ?? '(nenhuma)'}\`; lacunas já vistas: ${a.memoria.lacunasVistas.length > 0 ? a.memoria.lacunasVistas.join(', ') : '(nenhuma)'}.`);
  linhas.push('');
  linhas.push('### Desafios');
  linhas.push('');
  for (const d of a.desafios) linhas.push(...linhasDoDesafio(d));
  linhas.push('');
  return linhas;
}

/** A seção de SPLITs pendentes (só quando há). */
function secaoDeSplits(relatorio: RelatorioDeRevisao): string[] {
  const linhas: string[] = [];
  if (relatorio.splitsPendentes.length > 0) {
    linhas.push('## Splits pendentes (nada se perde — minimalCode preservado)');
    linhas.push('');
    linhas.push('Cada pendência é a SEMENTE de uma aula nova (teoria/assertions/statement/requirements saem de sub-agente LLM com o minimalCode como base; sem LLM na execução, a pendência fica registrada aqui e nos arquivos `splits/`).');
    linhas.push('');
    for (const s of relatorio.splitsPendentes) {
      linhas.push(`- **${s.aula}/${s.desafio}** — lacuna: \`${s.foraDoOrcamento.join('`, `')}\`; semente: \`splits/${nomeArquivoSeguro(s.aula)}--${s.desafio}.minimal.mjs\``);
    }
    linhas.push('');
  }
  return linhas;
}

/** A seção de MEMÓRIA FINAL (progressividade). */
function secaoDeMemoriaFinal(relatorio: RelatorioDeRevisao): string[] {
  const linhas: string[] = [];
  linhas.push('## Memória final (progressividade — o que foi aprendido e reavaliado)');
  linhas.push('');
  linhas.push(`- Última aula revisada: \`${relatorio.memoriaFinal.aulaAnterior ?? '(nenhuma)'}\``);
  linhas.push(`- Lacunas vistas no curso: ${relatorio.memoriaFinal.lacunasVistas.length > 0 ? relatorio.memoriaFinal.lacunasVistas.join(', ') : '(nenhuma)'}`);
  linhas.push(`- Decisões: ${relatorio.memoriaFinal.decisoes.length}`);
  for (const d of relatorio.memoriaFinal.decisoes) {
    linhas.push(`  - [${d.decisao}] ${d.aula}: ${d.motivo}`);
  }
  linhas.push('');
  return linhas;
}

export function gerarMarkdown(relatorio: RelatorioDeRevisao): string {
  const linhas: string[] = cabecalhoDoMarkdown(relatorio, relatorio.placar);
  for (const a of relatorio.aulas) linhas.push(...secaoDaAula(a));
  linhas.push(...secaoDeSplits(relatorio));
  linhas.push(...secaoDeMemoriaFinal(relatorio));
  return linhas.join('\n');
}
