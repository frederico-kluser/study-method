/**
 * app/electron/main/engine/quality/discriminacaoRelatorio.ts — o RELATÓRIO de
 * discriminação da trilha inteira: o placar (aviso com contagem), as
 * limitações declaradas e as linhas de texto do `coverage`/`audit` do CLI (J5).
 *
 * A prosa normativa vive na fachada `discriminacao.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

import { DEFAULT_ADAPTER_ID } from '../lang/registry';
import {
  type AvaliarDiscriminacaoOptions,
  type DesafioParaDiscriminacao,
  type DiscriminacaoDeDesafio,
  type PlacarDeDiscriminacao,
  type RelatorioDeDiscriminacao,
} from './discriminacaoTipos';
import { avaliarDiscriminacaoDeDesafio } from './discriminacaoAvaliacao';

/**
 * Avalia a trilha inteira e monta o placar.
 *
 * PURO: mesma entrada, mesma saída, sem IO e sem rede. A ordem dos desafios na
 * saída é a ordem da entrada (o chamador é quem conhece a ordem pedagógica).
 */
export function avaliarDiscriminacao(
  trilha: string,
  desafios: readonly DesafioParaDiscriminacao[],
  options: AvaliarDiscriminacaoOptions = {},
): RelatorioDeDiscriminacao {
  const language = options.language ?? DEFAULT_ADAPTER_ID;
  const avaliados = desafios.map((d) => avaliarDiscriminacaoDeDesafio(d, options));

  const medidos = avaliados.filter((a) => a.status === 'discrimina' || a.status === 'nao-discrimina');
  const aulasMedidas = new Set(medidos.map((a) => a.lessonRef).filter((r): r is string => r !== null));
  const aulasComAlvoNaoDiscriminado = new Set(
    avaliados
      .filter((a) => a.status === 'nao-discrimina')
      .map((a) => a.lessonRef)
      .filter((r): r is string => r !== null),
  );

  const placar: PlacarDeDiscriminacao = {
    desafios: avaliados.length,
    medidos: medidos.length,
    naoMedidos: avaliados.filter((a) => a.status === 'nao-medido').length,
    semAlvo: avaliados.filter((a) => a.status === 'sem-alvo').length,
    discriminam: avaliados.filter((a) => a.status === 'discrimina').length,
    naoDiscriminam: avaliados.filter((a) => a.status === 'nao-discrimina').length,
    alvosMedidos: medidos.reduce((acc, a) => acc + a.alvosNaSolucao.length, 0),
    alvosDiscriminados: medidos.reduce((acc, a) => acc + a.discriminados.length, 0),
    alvosNaoDiscriminados: medidos.reduce((acc, a) => acc + a.naoDiscriminados.length, 0),
    aulasComAlvoNaoDiscriminado: aulasComAlvoNaoDiscriminado.size,
    aulasMedidas: aulasMedidas.size,
  };

  return {
    trilha,
    linguagem: language,
    classificacao: 'aviso',
    desafios: avaliados,
    placar,
    limitacoes: limitacoesDeclaradas(placar),
  };
}

/**
 * As limitações DESTA medição, escritas na saída (`docs/16` §9.2). Elas são
 * derivadas do placar — nunca uma lista fixa que envelhece sem ninguém notar.
 */
function limitacoesDeclaradas(placar: PlacarDeDiscriminacao): string[] {
  const out: string[] = [
    'PROVA ESTÁTICA: compara conjuntos de átomos (solução × código mínimo). A parte EXECUTÁVEL da ' +
      'J5 — "cada solução errada catalogada falha em ≥1 teste; nenhum par falha no mesmo conjunto" — ' +
      'é `quality/mutants.ts` e NÃO roda aqui.',
    'CLASSIFICAÇÃO: AVISO com contagem, nunca violação — este módulo não reprova nada nem devolve ' +
      'exit code (decisão de projeto; ver o cabeçalho).',
  ];
  if (placar.naoMedidos > 0) {
    out.push(
      `${placar.naoMedidos} desafio(s) NÃO MEDIDO(S) (mínimo não provado ou solução que não parseia): ` +
        'o placar de discriminação NÃO fala por eles — fail-closed, `docs/16` §9.3.',
    );
  }
  if (placar.semAlvo > 0) {
    out.push(
      `${placar.semAlvo} desafio(s) SEM ALVO (sem aula dona ou sem \`introduces.productive\`): não há ` +
        'construção que o teste devesse forçar, então eles não entram em nenhuma conclusão sobre J5.',
    );
  }
  return out;
}

/** As linhas de UM desafio (só o essencial quando `discrimina` e sem detalhe). */
function linhasDoDesafio(d: DiscriminacaoDeDesafio): string[] {
  const l: string[] = [];
  l.push('');
  l.push(`  ${d.ref}  [${d.status.toUpperCase()}]`);
  l.push(`    alvos da aula (${d.alvos.length}): ${d.alvos.length > 0 ? d.alvos.join(', ') : '(nenhum)'}`);
  if (d.alvosNaSolucao.length > 0) {
    l.push(`    na solucao (${d.alvosNaSolucao.length}): ${d.alvosNaSolucao.join(', ')}`);
  }
  if (d.naoDiscriminados.length > 0) {
    l.push(`    NAO FORCADOS pelo teste (${d.naoDiscriminados.length}): ${d.naoDiscriminados.join(', ')}`);
  }
  if (d.minimalCode !== null) {
    l.push(`    minimo que passa: ${JSON.stringify(d.minimalCode)}`);
  }
  l.push(`    ${d.motivo}`);
  return l;
}

/**
 * O relatório como LINHAS de texto, no formato do `coverage`/`audit` do CLI.
 *
 * Está aqui, e não no CLI, porque a frase que explica um veredito é parte da
 * medição — e porque um módulo que devolve linhas é testável sem capturar
 * stdout. Quem chama decide se imprime, e o placar segue a convenção do
 * repositório (`N passou · N falhou · N pendente`, `docs/16` §9.2).
 */
export function linhasDeDiscriminacao(
  relatorio: RelatorioDeDiscriminacao,
  opcoes: { detalharTudo?: boolean } = {},
): string[] {
  const l: string[] = [];
  const p = relatorio.placar;
  l.push('');
  l.push(`TRILHA ${relatorio.trilha} — DISCRIMINACAO (J5: o teste FORCA a construcao da aula?)`);
  l.push(`linguagem: ${relatorio.linguagem} · classificacao: AVISO (mede e declara, nao reprova)`);

  for (const d of relatorio.desafios) {
    if (!opcoes.detalharTudo && d.status === 'discrimina') continue;
    l.push(...linhasDoDesafio(d));
  }

  l.push('');
  l.push('PLACAR (discriminacao — AVISO, nao reprova)');
  l.push(`  desafios ..................................... ${p.desafios}`);
  l.push(`  medidos ...................................... ${p.medidos}`);
  l.push(`  NAO MEDIDOS (fail-closed) .................... ${p.naoMedidos}`);
  l.push(`  sem alvo (sem aula dona / sem introduces) .... ${p.semAlvo}`);
  l.push(`  discriminam (o teste forca a construcao) ..... ${p.discriminam}`);
  l.push(`  AVISO: nao discriminam ....................... ${p.naoDiscriminam}`);
  l.push(`  alvos medidos (presentes na solucao) ......... ${p.alvosMedidos}`);
  l.push(`  alvos forcados pelo teste .................... ${p.alvosDiscriminados}`);
  l.push(`  AVISO: alvos NAO forcados pelo teste ......... ${p.alvosNaoDiscriminados}`);
  l.push(`  aulas com alvo nao forcado ................... ${p.aulasComAlvoNaoDiscriminado} de ${p.aulasMedidas} medida(s)`);
  l.push('');
  l.push(`  ${p.discriminam} passou · 0 falhou · ${p.naoDiscriminam + p.naoMedidos} pendente`);
  l.push('');
  l.push('LIMITACOES DECLARADAS (docs/16 §9.2 — nunca omitidas)');
  for (const lim of relatorio.limitacoes) l.push(`  - ${lim}`);
  l.push('');
  return l;
}
