/**
 * tests/cx-phases-report.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/report/report.ts` (o placar/report.json da F12, §9.2/§9.4).
 *
 * PINA: o formato do placar do repositório ("N passou · N falhou · N
 * pendente"), o comando canônico do audit, o detector de cópia determinístico
 * (normalizarCodigo/tokenizar/similaridadeDice/acusarCopia, limiar 0,70), a
 * DERIVAÇÃO do placar a partir do AuditReport (nunca redigitado), a regra de
 * veredito determinística, as limitações NOMEADAS em ordem fixa (A-P24-1) e a
 * justificativa com as seções de barra/J3/falso-passe/telemetria.
 *
 * PURO e síncrono: fixtures em memória, zero IO, zero LLM.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuditReport } from '../electron/main/engine/audit';
import {
  LIMITACAO_COMANDO_NAO_DECLARADO,
  LIMITACAO_FALSO_PASSE,
  LIMITACAO_ORCAMENTO_INFERIDO,
  LIMITACAO_PROVA_EXECUCAO,
  LIMITACAO_SIMILARIDADE,
  LIMITACAO_SOLUBILIDADE,
  LIMITACAO_TELEMETRIA,
  LIMIAR_SIMILARIDADE_COPIA,
  acusarCopia,
  comandoAuditPadrao,
  formatarPlacar,
  gerarRelatorio,
  normalizarCodigo,
  similaridadeDice,
  tokenizarPorFronteira,
  type DepsDoRelatorio,
} from '../electron/main/engine/report/report';
import type { MedicaoDeFalsoPasse } from '../electron/main/engine/quality/judgeCalibration';
import type { MedicaoSolubilidade } from '../electron/main/engine/quality/solvable';
import type { Telemetria } from '../electron/main/engine/runtime/ledger';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function violation(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    regra: 'I12',
    arquivo: 'challenge.json',
    ref: 'm1/a1',
    campo: 'solutionCode',
    linha: 1,
    coluna: 1,
    construcao: 'op:binary:+',
    eixo: 'op',
    faixa: 'productive',
    trechoOfensor: '+ b;',
    primeiraAulaQueEnsina: null,
    mensagem: 'construção fora do orçamento.',
    ...over,
  };
}

function audit(over: Record<string, unknown> = {}): AuditReport {
  return {
    trackSlug: 'js-do-zero',
    budgetSource: 'declared',
    violations: [],
    metrics: [],
    totals: {
      aulas: 1,
      desafios: 2,
      desafiosComViolacao: 1,
      violacoes: 1,
      lacunasDeCurriculo: 1,
    },
    ...over,
  } as unknown as AuditReport;
}

function falsoPasse(over: Partial<MedicaoDeFalsoPasse> = {}): MedicaoDeFalsoPasse {
  return { amostras: 10, frenteAMutantes: 8, taxaGeral: 0.1, porClasse: [], achadosNoValido: 0, ...over };
}

function solubilidade(over: Partial<MedicaoSolubilidade> = {}): MedicaoSolubilidade {
  return {
    passou: true,
    tentativas: 3,
    taxaDeAcerto: 1,
    primeiraConstrucaoFaltante: null,
    avisoTarefaQuebrada: false,
    tentativasRealizadas: [],
    ...over,
  };
}

function telemetria(over: Partial<Telemetria> = {}): Telemetria {
  return {
    quando: '2026-01-01T00:00:00.000Z',
    tarefa: 'autoria',
    etapa: 'F7',
    tokensEntrada: 10,
    tokensSaida: 5,
    latenciaMs: 1,
    contagem: 1,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Placar, comando e detector de cópia
// ---------------------------------------------------------------------------

describe('report — placar, comando e detector de cópia', () => {
  it('formatarPlacar reproduz o formato do repositório; comandoAuditPadrao reproduz os números', () => {
    assert.equal(formatarPlacar({ passou: 3, falhou: 1, pendente: 0 }), '3 passou · 1 falhou · 0 pendente');
    assert.equal(comandoAuditPadrao('js-do-zero'), 'cd app && npm run engine -- audit js-do-zero --limite 0');
    assert.equal(LIMIAR_SIMILARIDADE_COPIA, 0.7);
  });

  it('normalizarCodigo remove comentários e colapsa whitespace (heurística documentada para ://)', () => {
    assert.equal(normalizarCodigo('const a = 1;   // comentário\nconst b = 2;'), 'const a = 1; const b = 2;');
    assert.equal(normalizarCodigo('/* bloco\n inteiro */ x'), 'x');
    assert.equal(normalizarCodigo("const u = 'http://exemplo.com'; // fora"), "const u = 'http://exemplo.com';", 'o :// dentro de string não é comentário; o apara o fim');
    assert.equal(normalizarCodigo('   \n\t  '), '');
  });

  it('tokenizarPorFronteira: identificadores/números/pontuação, minúsculas; comentário não vira token', () => {
    assert.deepEqual(tokenizarPorFronteira('const x1 = Abc();'), ['const', 'x1', '=', 'abc', '(', ')', ';']);
    assert.deepEqual(tokenizarPorFronteira('return 1.5 + 2; // some'), ['return', '1.5', '+', '2', ';']);
    assert.deepEqual(tokenizarPorFronteira(''), []);
  });

  it('similaridadeDice é coeficiente sobre CONJUNTOS de tokens; acusarCopia usa o limiar 0,70', () => {
    assert.equal(similaridadeDice('a b c', 'a b c'), 1);
    assert.equal(similaridadeDice('a b', 'b c'), 0.5, '2·1 / (2+2)');
    assert.equal(similaridadeDice('a', 'z'), 0);
    assert.equal(similaridadeDice('', ''), 0, 'sem token não é acusação');
    assert.equal(similaridadeDice('return a + b;', 'return a + b; // copia'), 1, 'comentário não muda o conjunto');

    assert.equal(acusarCopia('x y z w', 'x y z w'), true, 'idêntico acusa');
    assert.equal(acusarCopia('um dois tres quatro', 'cinco seis sete oito'), false);
  });
});

// ---------------------------------------------------------------------------
// 2. gerarRelatorio — derivação do AuditReport
// ---------------------------------------------------------------------------

describe('report — gerarRelatorio (derivação determinística, limitações declaradas)', () => {
  it('placar é DERIVADO do audit (desafio × desafioComViolacao); pendente é 0 por construção', () => {
    const r = gerarRelatorio({ auditReport: audit() });
    assert.deepEqual(r.placar, { passou: 1, falhou: 1, pendente: 0 });
    assert.equal(r.trilha, 'js-do-zero');
    assert.equal(r.comando, 'cd app && npm run engine -- audit js-do-zero --limite 0');
    assert.match(r.justificativa, /placar 1 passou · 1 falhou · 0 pendente/);
  });

  it('violacoes_orcamento preserva o formato §5.5 (null = lacuna de currículo) e cobertura deriva das lacunas', () => {
    const r = gerarRelatorio({
      auditReport: audit({
        violations: [
          violation({ construcao: 'op:binary:+', primeiraAulaQueEnsina: null }),
          violation({ construcao: 'node:IfStatement', primeiraAulaQueEnsina: 'm1/a2', campo: 'testsCode', faixa: 'receptive' }),
          violation({ construcao: 'op:binary:+', primeiraAulaQueEnsina: null }),
          violation({ construcao: null, primeiraAulaQueEnsina: null }),
        ],
        metrics: [{ ref: 'm1/a3', desafios: 0, novas: 4 }],
      }),
    });
    assert.equal(r.violacoes_orcamento.length, 4);
    assert.equal(r.violacoes_orcamento[0].primeiraAulaQueEnsina, null);
    assert.equal(r.violacoes_orcamento[1].primeiraAulaQueEnsina, 'm1/a2');
    assert.deepEqual(r.cobertura.conceitos_sem_aula_dona, ['op:binary:+'], 'única, sorted; construcao null e aula dona ficam de fora');
    assert.deepEqual(r.cobertura.aulas_sem_desafio, ['m1/a3']);
    assert.deepEqual(r.distribuicao_construcoes_novas, [{ aula: 'm1/a3', quantidade: 4 }]);
  });

  it('desafios_que_falham e similaridade saem VAZIOS — as checagens são do G-FINAL, e isso é LIMITAÇÃO, não omissão', () => {
    const r = gerarRelatorio({ auditReport: audit({ totals: { aulas: 1, desafios: 0, desafiosComViolacao: 0, violacoes: 0, lacunasDeCurriculo: 0 } }) });
    assert.deepEqual(r.desafios_que_falham, []);
    assert.deepEqual(r.similaridade_exemplo_solucao, []);
    assert.match(r.limitacoes[0], new RegExp(`^${LIMITACAO_PROVA_EXECUCAO}:`));
    assert.match(r.limitacoes[1], new RegExp(`^${LIMITACAO_SIMILARIDADE}:`));
  });

  it('limitações seguem a ordem FIXA e nomeiam cada checagem não executada', () => {
    const r = gerarRelatorio({ auditReport: audit() });
    assert.deepEqual(
      r.limitacoes.map((l) => l.split(':')[0]),
      [
        LIMITACAO_PROVA_EXECUCAO,
        LIMITACAO_SIMILARIDADE,
        LIMITACAO_TELEMETRIA,
        LIMITACAO_FALSO_PASSE,
        LIMITACAO_SOLUBILIDADE,
      ],
    );
  });

  it('tokens_por_fase soma entrada+saída por etapa (telemetry.jsonl é a ÚNICA fonte), ordenado por fase', () => {
    const r = gerarRelatorio({
      auditReport: audit(),
      telemetria: [telemetria({ etapa: 'F8', tokensEntrada: 1, tokensSaida: 1 }), telemetria({ etapa: 'F7', tokensEntrada: 10, tokensSaida: 5 }), telemetria({ etapa: 'F7', tokensEntrada: 5, tokensSaida: 5 })],
      comandos: { telemetria: 'cat telemetry.jsonl' },
    });
    assert.deepEqual(r.tokens_por_fase, [
      { fase: 'F7', tokens: 25 },
      { fase: 'F8', tokens: 2 },
    ]);
    assert.ok(!r.limitacoes.some((l) => l.startsWith(LIMITACAO_TELEMETRIA)), 'com telemetria a limitação some');
  });

  it('orçamento inferido declara que todo número de violação é PISO (limitação nomeada)', () => {
    const r = gerarRelatorio({ auditReport: audit({ budgetSource: 'inferred' }) });
    assert.ok(r.limitacoes.some((l) => l.startsWith(LIMITACAO_ORCAMENTO_INFERIDO) && /PISO/.test(l)));
  });

  it('seção presente sem comando declarado NUNCA fica órfã: limitação comando-nao-declarado', () => {
    const r = gerarRelatorio({
      auditReport: audit(),
      telemetria: [telemetria()],
      falsoPasse: falsoPasse(),
      solubilidade: solubilidade(),
    });
    const orfas = r.limitacoes.filter((l) => l.startsWith(LIMITACAO_COMANDO_NAO_DECLARADO));
    assert.deepEqual(
      orfas.map((l) => (l.match(/comandos\['([\w-]+)'\]/) ?? [])[1]).sort(),
      ['falso-passe', 'solubilidade', 'telemetria'],
    );
    assert.match(orfas.join('\n'), /o caller não declarou o comando reprodutor/);

    const comTodos = gerarRelatorio({
      auditReport: audit(),
      telemetria: [telemetria()],
      falsoPasse: falsoPasse(),
      solubilidade: solubilidade(),
      comandos: { solubilidade: 'npm run solubilidade', 'falso-passe': 'npm run falso', tokens: 'npm run tokens' },
    });
    assert.deepEqual(comTodos.limitacoes.filter((l) => l.startsWith(LIMITACAO_COMANDO_NAO_DECLARADO)), []);
  });
});

// ---------------------------------------------------------------------------
// 3. Veredito e justificativa
// ---------------------------------------------------------------------------

describe('report — veredito determinístico e justificativa', () => {
  const totalsLimpos = { aulas: 1, desafios: 1, desafiosComViolacao: 0, violacoes: 0, lacunasDeCurriculo: 0 };

  it('regra do veredito: violação reprova; J3 não-passou reprova; falso-passe ≥ limiar reprova; não medido NEM aprova NEM reprova', () => {
    assert.equal(
      gerarRelatorio({ auditReport: audit() }).veredito,
      'reprovado',
      'totals.violacoes > 0 reprova',
    );
    assert.equal(
      gerarRelatorio({ auditReport: audit({ totals: totalsLimpos }) }).veredito,
      'aprovado',
      'sem violação e sem medição: aprovado pelo que FOI medido',
    );
    assert.equal(
      gerarRelatorio({ auditReport: audit({ totals: totalsLimpos }), solubilidade: solubilidade({ passou: false, taxaDeAcerto: 2 / 3 }) }).veredito,
      'reprovado',
      'J3 entregue com pass^k falso reprova',
    );
    assert.equal(
      gerarRelatorio({ auditReport: audit({ totals: totalsLimpos }), falsoPasse: falsoPasse({ taxaGeral: 0.45 }) }).veredito,
      'reprovado',
      'taxa ≥ (1−τ)/2 = 0,45 reprova',
    );
    assert.equal(
      gerarRelatorio({ auditReport: audit({ totals: totalsLimpos }), falsoPasse: falsoPasse({ taxaGeral: 0.44 }) }).veredito,
      'aprovado',
    );
  });

  it('justificativa traz a regra do veredito e o recado de que a prova de execução é do G-FINAL', () => {
    const r = gerarRelatorio({ auditReport: audit({ totals: totalsLimpos }) });
    assert.match(r.justificativa, /Veredito: aprovado — regra determinística/);
    assert.match(r.justificativa, /A prova de execução dos desafios NÃO entra neste veredito/);
    assert.match(r.justificativa, /protocolo INT-02\/P-30/);
  });

  it('medições entregues aparecem na justificativa COM a fonte; sem comando, a falta é dita', () => {
    const r = gerarRelatorio({
      auditReport: audit({ totals: totalsLimpos }),
      solubilidade: solubilidade({ passou: false, tentativas: 3, taxaDeAcerto: 0, primeiraConstrucaoFaltante: 'op:binary:+', avisoTarefaQuebrada: true }),
      falsoPasse: falsoPasse({ taxaGeral: 0.2, frenteAMutantes: 8, amostras: 10 }),
      telemetria: [telemetria()],
      comandos: { solubilidade: 'npm run solubilidade' },
    });
    assert.match(r.justificativa, /J3 solubilidade \(aluno simulado, pass\^k, §9\.1\): passou=false \(3 tentativa\(s\)/);
    assert.match(r.justificativa, /primeira construção faltante: op:binary:\+/);
    assert.match(r.justificativa, /AVISO: 0% de acerto é sinal de tarefa quebrada/);
    assert.match(r.justificativa, /Fonte da medição: npm run solubilidade/);
    assert.match(r.justificativa, /Taxa de falso-passe do revisor contra mutantes \(§6\.6\/§9\.2\): 0\.2 em 8 mutante\(s\) \(10 amostra\(s\)\)/);
    assert.match(r.justificativa, /comando reprodutor não declarado pelo caller/);
  });

  it('a barra A17–A24 só entra na justificativa quando o audit a mediu (aditiva — nunca "0 erros" inventado)', () => {
    const semBarra = gerarRelatorio({ auditReport: audit({ totals: totalsLimpos }) });
    assert.ok(!semBarra.justificativa.includes('Barra pedagógica'), 'fixture sem barra não ganha a seção');

    const comBarra = gerarRelatorio({
      auditReport: audit({
        totals: totalsLimpos,
        barra: {
          erros: 2,
          avisos: 1,
          aulasComErro: 1,
          blocosQueNaoParseiam: 0,
          porRegra: [
            { regra: 'A17', erros: 2, avisos: 0 },
            { regra: 'A22', erros: 0, avisos: 1 },
          ],
        },
      }),
    });
    assert.match(comBarra.justificativa, /Barra pedagógica A17–A24/);
    assert.match(comBarra.justificativa, /2 erro\(s\) \(A17 2\) em 1 aula\(s\), 1 aviso\(s\) \(A22 1\)/);
    assert.match(comBarra.justificativa, /Fonte da medição: `cd app && npm run engine -- barra js-do-zero --limite 0`/);
  });

  it('a saída SEMPRE valida no ReportSchema (fail-fast de implementação, nunca relatório inválido)', () => {
    assert.doesNotThrow(() => gerarRelatorio({ auditReport: audit() }));
    assert.doesNotThrow(() =>
      gerarRelatorio({
        auditReport: audit({ budgetSource: 'inferred' }),
        telemetria: [telemetria()],
        falsoPasse: falsoPasse(),
        solubilidade: solubilidade(),
        comandos: { audit: 'comando-sobrescrito', principal: 'ignorado' },
      }),
    );
    const r = gerarRelatorio({ auditReport: audit(), comandos: { audit: 'comando-sobrescrito' } });
    assert.equal(r.comando, 'comando-sobrescrito', 'deps.comandos["audit"] sobrepõe o padrão');
  });
});
