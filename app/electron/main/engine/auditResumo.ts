/**
 * app/electron/main/engine/auditResumo.ts — as LIMITAÇÕES DECLARADAS, o placar
 * da barra e os formatadores de resumo do gate (`audit.ts`). Extraído do módulo
 * original na refatoração do lote L05 sem NENHUMA mudança de comportamento (as
 * linhas de saída são contrato — ver `cx-services-audit.test.ts`).
 */

import { REGRAS_DA_BARRA, auditarBarra, type RegraDaBarra } from './quality/barra';
import type { TrackBudget } from './budget';
import type { AuditReport, LimitacaoDeclarada, PlacarDaBarra } from './auditTypes';

type BarraDeAuditoria = ReturnType<typeof auditarBarra> | null;

/** A consequência no placar da limitação A13–A16 (muda conforme a barra rodou). */
function consequenciaA13A16(barraRodou: boolean): string {
  // ESTE TEXTO MUDOU EM 2026-09-22, E A HISTÓRIA FICOU. Até aqui ele dizia que o
  // contador `avisos` não falava por nada e citava a prova por mutação ("apagar todos
  // os blocos de código da teoria da aula 1 não muda o placar"). A prova ERA verdadeira
  // e deixou de ser: a barra A17–A23 roda nesta trilha e A19/A18 reprovam exatamente
  // essa mutação. Uma limitação que continuasse afirmando isso seria o mesmo defeito
  // que ela nasceu para consertar — o placar dizendo o que não é.
  return (
    (barraRodou
      ? 'A BARRA A17–A23 (`quality/barra.ts`) COBRE PARTE DESTE BURACO NESTA TRILHA, porque é ' +
        'agnóstica de linguagem e RODOU aqui: teto do passo (A17, ≤2 produtivas novas ' +
        'colapsadas), primeira aula do curso (A18), declarar-não-é-demonstrar (A19), aula sem ' +
        'prova (A20), carga de novidade e seções que a sustentem (A21), duas formas (A22, ' +
        'aviso) e a regra do par medida no disco (A23). Por isso a PROVA POR MUTAÇÃO que esta ' +
        'entrada citava (docs/19: "apagar TODOS os blocos de código da teoria da aula 1 não ' +
        'muda o placar — 0 violações · 0 avisos · exit 0") JÁ NÃO VALE: A19/A18 reprovam ' +
        'exatamente isso, e `totals.violacoes`/`totals.errosDaBarra` mudam. '
      : 'E A BARRA A17–A23 TAMBÉM NÃO RODOU nesta auditoria (o orçamento é `inferred` — ver a ' +
        'entrada `A17-A23-NAO-RODOU-EM-INFERRED`), então NADA nesta auditoria mede o TAMANHO ' +
        'DO PASSO: a PROVA POR MUTAÇÃO que esta entrada cita (docs/19: "apagar TODOS os blocos ' +
        'de código da teoria da aula 1 não muda o placar") CONTINUA VALENDO aqui. ') +
    'O QUE CONTINUA NÃO MEDIDO nesta trilha, porque a barra NÃO cobre: A14b (≤1 construção ' +
    'nova por LINHA do solutionCode — a lacuna única); A15a/A15b (progressividade ' +
    'intra-aula entre os desafios e inter-aula, o reuso obrigatório do que veio antes); ' +
    'A16b (a primeira atividade resolvível com a PRIMEIRA SEÇÃO da teoria — a barra CONTA ' +
    'seções, não mede a seção 1); e os spans mecânicos S13 do arquivo de teste (import ' +
    'inteiro, assinatura) com as tabelas H13/AX do runner. ' +
    'NO PLACAR: o contador `avisos` soma as duas baterias, e a parte A13–A16 dele continua ' +
    'significando "não rodou", não "sem aviso" — `totals.avisosDaBarra` é a parte que FOI ' +
    'medida (A22); `metrics[].novosVerdadeiros` (a 2ª coluna do histograma, ' +
    '"verdadeiramente novas") continua AUSENTE em todas as aulas, e é `metrics[].barra` ' +
    'que traz as colunas medidas para esta trilha.'
  );
}

/** A entrada `A13-A16-NAO-RODOU` (a bateria é javascript-only). */
function limitacaoA13A16(budget: TrackBudget, barraRodou: boolean): LimitacaoDeclarada {
  return {
    id: 'A13-A16-NAO-RODOU',
    checagem:
      'bateria A13–A16 (A13 ensino-efetivo, A13d, A14a micro-avanço, A14b, A15a/A15b ' +
      'progressividade, A16 primeira-atividade) — as partes que dependem de `ts.SyntaxKind`, ' +
      'das tabelas H13/AX do runner `node:test` e dos spans mecânicos S13',
    motivo:
      `a trilha é \`${budget.adapterId}\` e a bateria é javascript-only: ` +
      '`quality/progressao.ts:432` LANÇA `EngineLinguagemError` para adaptador não-default ' +
      'porque `H13`/`AX` são tabelas de chaves do `ts.SyntaxKind` e do runner `node:test`, e os ' +
      'spans mecânicos S13 saem de `ts.createSourceFile`. Rodá-la aqui não daria erro: daria ' +
      'veredito ERRADO E SILENCIOSO (tudo "não demonstrado", todo desafio reprovado).',
    consequencia: consequenciaA13A16(barraRodou),
  };
}

/**
 * A entrada `A17-A23-NAO-RODOU-EM-INFERRED` — o argumento inteiro está em
 * `barraValePara`. O que esta entrada faz é o que o §9.2 exige: dizer que a
 * checagem não rodou, por quê, e QUAL comando a faz rodar.
 */
function limitacaoA17A23(budget: TrackBudget): LimitacaoDeclarada {
  return {
    id: 'A17-A23-NAO-RODOU-EM-INFERRED',
    checagem:
      'barra pedagógica A17–A23 (A17 teto do passo, A18 primeira aula, A19 declarar-não-é-' +
      'demonstrar, A20 aula sem prova, A21 carga de novidade, A22 duas formas, A23 regra do par, ' +
      'A24 vazamento do quiz por comprimento)',
    motivo:
      `o orçamento desta auditoria é \`${budget.source}\`: nenhuma aula declara \`introduces\` e o ` +
      'que a aula "introduz" é DERIVADO da própria teoria (`budget.ts:253-278`). Nesse modo a barra ' +
      'mediria ARTEFATO DA INFERÊNCIA e não o passo — (a) A19 é VAZIA por construção, porque as ' +
      'chaves novas SAEM dos blocos de teoria da aula; (b) A23 é INDECLARÁVEL, porque declarar ' +
      '`introduces.derived` muda o modo para `declared` (`budget.ts:225`: `anyDeclared` testa a ' +
      'PRESENÇA do campo `introduces`); (c) sem o colapso da regra do par, A17/A18/A21 contam chave ' +
      'por chave, e UMA linha de JavaScript introduz 4 construções fora do axioma estrutural ' +
      '(`const tipo = typeof 10;` → `decl:const`, `node:NumericLiteral`, `node:TypeOfExpression`, ' +
      '`op:unary:typeof`), de modo que NENHUMA aula 1 passaria no teto de 1 do A18 — nem a ' +
      'perfeita. Rodar assim não daria erro: daria veredito ERRADO E SILENCIOSO.',
    consequencia:
      'nada em `violations` fala pelo TAMANHO DO PASSO nem pela EXISTÊNCIA DA DEMONSTRAÇÃO nesta ' +
      'auditoria: `totals.errosDaBarra`, `totals.avisosDaBarra`, `AuditReport.barra` e ' +
      '`metrics[].barra` ficam AUSENTES (ausente = NÃO MEDIDO, nunca zero) e ' +
      '`linhasDoPlacarDaBarra` devolve []. PARA MEDIR: declare `introduces` nas aulas (o contrato ' +
      'A5/A7 já exige isso do autor) — ou force o modo: `npm run engine -- audit <slug> --limite 0 ' +
      '--modo declared`, `npm run engine -- barra <slug> --limite 0 --modo declared`. Nas três ' +
      'trilhas do produto o orçamento é DECLARADO e a barra roda: `npm run engine -- audit ' +
      'python-iniciante --limite 0 --json` → `budgetSource: "declared"`, `totals.errosDaBarra: 0`, ' +
      '`totals.avisosDaBarra: 88` (30 de A22 + 58 de A24 — medido em 2026-09-22).',
  };
}

// ONDA 10 — O PLACAR PASSA A DIZER O QUE NÃO RODOU (ver `LimitacaoDeclarada`).
// As baterias continuam no escopo delas; o que muda é que a saída para de deixar
// o leitor concluir "0 avisos ⇒ está tudo certo" quando o certo é "não medido".
export function montarLimitacoesDeAuditoria(
  budget: TrackBudget,
  bateriaRodou: boolean,
  barraRodou: boolean,
): LimitacaoDeclarada[] {
  const limitacoes: LimitacaoDeclarada[] = [];
  if (!bateriaRodou) limitacoes.push(limitacaoA13A16(budget, barraRodou));
  if (!barraRodou) limitacoes.push(limitacaoA17A23(budget));
  return limitacoes;
}

// ---------------------------------------------------------------------------
// O placar da barra A17–A23
// ---------------------------------------------------------------------------

/**
 * O placar da barra, regra por regra — inclusive as que deram ZERO. Aqui o
 * zero é MEDIDO (a barra rodou); quando ela não roda, a seção inteira fica
 * AUSENTE e `limitacoes` diz por quê — nunca um zero que ninguém mediu.
 */
export function montarPlacarDaBarra(barra: BarraDeAuditoria): PlacarDaBarra | undefined {
  return barra === null
    ? undefined
    : {
        porRegra: REGRAS_DA_BARRA.map((regra) => ({
          regra,
          erros: barra.achados.filter((a) => a.regra === regra && a.severidade === 'erro').length,
          avisos: barra.achados.filter((a) => a.regra === regra && a.severidade === 'aviso').length,
        })),
        erros: barra.totais.erros,
        avisos: barra.totais.avisos,
        aulasComErro: barra.totais.aulasComErro,
        blocosQueNaoParseiam: barra.totais.blocosQueNaoParseiam,
      };
}

/**
 * O rótulo humano de cada regra da barra, para a linha do placar. Curto de
 * propósito: quem precisa da regra inteira tem `docs/16` §5.1 e o cabeçalho de
 * `quality/barra.ts`; quem lê o placar precisa saber QUAL defeito são 12 erros.
 */
const ROTULO_DA_REGRA_DA_BARRA: Readonly<Record<RegraDaBarra, string>> = {
  A17: 'teto do passo (<=2 produtivas novas)',
  A18: 'primeira aula do curso',
  A19: 'declarar nao e demonstrar',
  A20: 'aula sem prova',
  A21: 'carga de novidade e secoes',
  A22: 'duas formas sintaticas (AVISO)',
  A23: 'derivada mal declarada (regra do par)',
  A24: 'vazamento do quiz por comprimento',
};

/**
 * O PLACAR DA BARRA A17–A23 como LINHAS de texto, prontas para o resumo.
 *
 * Está aqui pelos mesmos dois motivos que `linhasDeLimitacoes`: quem MEDIU é
 * `auditTrack`, não quem imprime; e uma função que devolve linhas é testável
 * sem capturar stdout.
 *
 * Devolve `[]` quando o relatório não tem a seção (`report.barra` ausente = a
 * barra não rodou, ou relatório montado à mão) — imprimir zeros que ninguém
 * mediu é justamente o defeito que o §9.2 proíbe. Quando ela não rodou, quem
 * fala é `linhasDeLimitacoes`.
 *
 * Os erros listados aqui JÁ ESTÃO em `totals.violacoes`: esta seção não soma
 * nada ao placar, ela diz de QUE REGRA o número veio (`totals.errosDaBarra` é o
 * subtotal).
 */
export function linhasDoPlacarDaBarra(report: AuditReport): string[] {
  const barra = report.barra;
  if (barra === undefined) return [];
  const l: string[] = [];
  // A faixa sai do CATÁLOGO, nunca de uma string cravada: a barra ganhou A24
  // (vazamento do quiz por comprimento) em 2026-09-22, e um título fixo em
  // "A17-A23" passaria a mentir sobre o que as linhas abaixo contam.
  const faixa = `${REGRAS_DA_BARRA[0]}-${REGRAS_DA_BARRA[REGRAS_DA_BARRA.length - 1]}`;
  l.push(`BARRA PEDAGOGICA ${faixa} (agnostica de linguagem — quality/barra.ts)`);
  l.push(`  erros (ja contados em violacoes) ..... ${barra.erros}`);
  l.push(`  aulas com erro de barra .............. ${barra.aulasComErro}`);
  l.push(`  avisos (A22 formas · A24 quiz) ....... ${barra.avisos}`);
  l.push(
    `  blocos de teoria que nao parseiam .... ${barra.blocosQueNaoParseiam}` +
      (barra.blocosQueNaoParseiam > 0
        ? '  <- bloco que o parser recusa nao demonstra nada: entra como erro A19 (fail-closed)'
        : ''),
  );
  for (const linha of barra.porRegra) {
    const rotulo = `    ${linha.regra} ${ROTULO_DA_REGRA_DA_BARRA[linha.regra]} `;
    l.push(`${rotulo.padEnd(56, '.')} ${linha.erros} erro(s) · ${linha.avisos} aviso(s)`);
  }
  l.push(`  reproduz: npm run engine -- barra ${report.trackSlug} --limite 0`);
  l.push('');
  return l;
}

/**
 * As limitações do relatório como LINHAS de texto, prontas para o resumo.
 *
 * Está aqui, e não no CLI, por dois motivos. Primeiro, a frase que explica uma
 * checagem não executada é parte da MEDIÇÃO — quem sabe que a bateria não rodou
 * é `auditTrack`, não quem imprime. Segundo, uma função que devolve linhas é
 * testável sem capturar stdout.
 *
 * Devolve `[]` quando nada deixou de rodar, para que o chamador possa imprimir
 * incondicionalmente.
 */
export function linhasDeLimitacoes(report: AuditReport): string[] {
  if (report.limitacoes.length === 0) return [];
  const l: string[] = [];
  l.push(
    `LIMITACOES DECLARADAS: ${report.limitacoes.length} checagem(ns) NAO EXECUTADA(S) ` +
      '(CONTRIBUTING.md · docs/16 §9.2 — o placar abaixo NAO fala por elas)',
  );
  for (const lim of report.limitacoes) {
    l.push(`  [${lim.id}] ${lim.checagem}`);
    l.push(`     NAO RODOU porque: ${lim.motivo}`);
    l.push(`     no placar isso significa: ${lim.consequencia}`);
  }
  l.push('');
  return l;
}
