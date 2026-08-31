/**
 * tests/engineReport.test.ts — o RELATÓRIO/PLACAR (pacote P-24, F12 de
 * `docs/16-engine-de-trilha.md` §9.2/§9.4). OFFLINE: fixtures em memória (o
 * audit real só entra indiretamente, ver abaixo), nenhum LLM, nenhum IO.
 *
 * Contratos que mordem aqui (critérios de aceitação da etapa):
 *   - A-P24-1: o relatório declara EXPLICITAMENTE cada checagem NÃO executada —
 *     `limitacoes[]` contém entradas NOMEADAS (prefixo estável + dois-pontos);
 *     entregar a medição faz a limitação correspondente SUMIR; orçamento
 *     inferido gera a limitação `orcamento-inferido`.
 *   - A-P24-2: o histograma reproduz o PENHASCO quando alimentado com a
 *     distribuição atual — fixture em memória com os MESMOS números do audit
 *     real da trilha em forma reduzida (aula 1 = 18 construções novas, a 2ª =
 *     11, depois 3/5/5/9/…): a primeira aula concentra e domina a mediana.
 *   - A-P24-3: o detector de similaridade ACUSA solução copiada do exemplo da
 *     teoria (Dice ≥ 0,70 sobre tokens normalizados) e NÃO acusa mutação
 *     pequena (reescrita com outro laço e outros nomes fica abaixo do limiar).
 *   - placar no formato exato do repositório: `N passou · N falhou · N pendente`.
 *   - ReportSchema valida a saída e campos obrigatórios preenchidos.
 *   - PROTOCOLO INT-02 (P-30): o placar do G-AUDIT nunca piora sem declaração —
 *     este arquivo importa o MESMO `PIN_PLACAR` de engineAuditPlacar.test.ts
 *     (sem redigitar números). CONSEQUÊNCIA DECLARADA: importar um `.test.ts`
 *     executa o describe dele no MESMO processo (medido experimentalmente), então
 *     a suíte P-30 co-locada roda junto deste arquivo — é o preço aceito pelo
 *     próprio protocolo ("P-24 importa o MESMO pin").
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ReportSchema } from '../electron/main/engine/schemas/artifacts';
import type { AuditReport, Violation } from '../electron/main/engine/audit';
import type { MedicaoDeFalsoPasse } from '../electron/main/engine/quality/judgeCalibration';
import type { MedicaoSolubilidade } from '../electron/main/engine/quality/solvable';
import type { Telemetria } from '../electron/main/engine/runtime/ledger';
import {
  LIMIAR_SIMILARIDADE_COPIA,
  LIMITACAO_COMANDO_NAO_DECLARADO,
  LIMITACAO_FALSO_PASSE,
  LIMITACAO_ORCAMENTO_INFERIDO,
  LIMITACAO_PROVA_EXECUCAO,
  LIMITACAO_SIMILARIDADE,
  LIMITACAO_SOLUBILIDADE,
  LIMITACAO_TELEMETRIA,
  acusarCopia,
  comandoAuditPadrao,
  formatarPlacar,
  gerarRelatorio,
  normalizarCodigo,
  similaridadeDice,
  tokenizarPorFronteira,
  type DepsDoRelatorio,
} from '../electron/main/engine/report/report';
import { PIN_PLACAR } from './engineAuditPlacar.test';

// ---------------------------------------------------------------------------
// Fixtures — o AUDIT em memória (A-P24-2: mesmos números reais, forma reduzida)
// ---------------------------------------------------------------------------

function violation(overrides: Partial<Violation> = {}): Violation {
  return {
    regra: 'A2',
    arquivo: 'modules/modulo-a/lessons/aula-1/challenges/desafio-1/challenge.json',
    ref: 'modulo-a/aula-1',
    campo: 'solutionCode',
    linha: 3,
    coluna: 5,
    construcao: 'node:ArrayLiteral',
    eixo: 'node',
    faixa: 'productive',
    trechoOfensor: '[1, 2, 3]',
    primeiraAulaQueEnsina: 'fundamentos-javascript/arrays-e-objetos',
    mensagem: 'mensagem de teste',
    ...overrides,
  };
}

/**
 * Distribuição de construções novas IDÊNTICA à do audit real da trilha
 * (18, 11, 3, 5, 5, 9, 4, … — medida em app/resources/tracks/nodejs-do-zero)
 * em forma REDUZIDA: 8 aulas, mesmos primeiros oito números reais.
 */
function fixtureAudit(overridesTotals?: Partial<AuditReport['totals']>): AuditReport {
  const metrics: AuditReport['metrics'] = [
    { ref: 'fundamentos-javascript/o-que-e-programacao', index: 0, novas: 18, conceitosDeclarados: 5, desafios: 1, violacoes: 8 },
    { ref: 'fundamentos-javascript/variaveis-e-tipos', index: 1, novas: 11, conceitosDeclarados: 4, desafios: 1, violacoes: 4 },
    { ref: 'fundamentos-javascript/funcoes', index: 2, novas: 3, conceitosDeclarados: 3, desafios: 1, violacoes: 2 },
    { ref: 'fundamentos-javascript/condicionais', index: 3, novas: 5, conceitosDeclarados: 3, desafios: 1, violacoes: 1 },
    { ref: 'fundamentos-javascript/loops', index: 4, novas: 5, conceitosDeclarados: 2, desafios: 1, violacoes: 2 },
    { ref: 'fundamentos-javascript/arrays-e-objetos', index: 5, novas: 9, conceitosDeclarados: 2, desafios: 1, violacoes: 1 },
    { ref: 'nodejs-primeiros-passos/o-que-e-nodejs', index: 6, novas: 4, conceitosDeclarados: 2, desafios: 1, violacoes: 0 },
    { ref: 'nodejs-primeiros-passos/servidor-http', index: 7, novas: 1, conceitosDeclarados: 2, desafios: 1, violacoes: 0 },
  ];
  const violations: Violation[] = [
    violation({ campo: 'solutionCode', faixa: 'productive' }),
    violation({
      campo: 'testsCode',
      faixa: 'receptive',
      construcao: 'api:assert.equal',
      primeiraAulaQueEnsina: 'modulo-b/aula-2',
    }),
    // LACUNA DE CURRÍCULO: construção que NENHUMA aula ensina.
    violation({
      regra: 'A3',
      campo: 'testsCode',
      faixa: 'receptive',
      construcao: 'node:ArrowFunction',
      primeiraAulaQueEnsina: null,
    }),
    // Violação ESTRUTURAL (sem faixa) — I16: conceito que a aula não declara.
    violation({ regra: 'I16', campo: 'lesson', faixa: null, construcao: null, eixo: null }),
  ];
  return {
    trackSlug: 'nodejs-do-zero',
    budgetSource: 'inferred',
    violations,
    metrics,
    totals: {
      aulas: metrics.length,
      desafios: 8,
      desafiosComViolacao: 5,
      violacoes: violations.length,
      lacunasDeCurriculo: 1,
      aulasSemConstrucaoNova: 0,
      ...overridesTotals,
    },
    hygiene: [{ code: 'FENCE_SEM_TAG', message: 'bloco sem tag', line: 10, ref: 'modulo-a/aula-1' }],
    parseErrors: [],
  };
}

const telemetria: Telemetria[] = [
  { quando: '2026-01-01T00:00:00.000Z', tarefa: 'autoria', etapa: 'F7', tokensEntrada: 100, tokensSaida: 50, latenciaMs: 10, contagem: 1 },
  { quando: '2026-01-01T00:00:01.000Z', tarefa: 'autoria', etapa: 'F7', tokensEntrada: 30, tokensSaida: 20, latenciaMs: 8, contagem: 1 },
  { quando: '2026-01-01T00:00:02.000Z', tarefa: 'revisao', etapa: 'F11', tokensEntrada: 200, tokensSaida: 100, latenciaMs: 20, contagem: 2 },
];

const falsoPasse: MedicaoDeFalsoPasse = {
  amostras: 5,
  frenteAMutantes: 4,
  taxaGeral: 0.25,
  porClasse: [
    { classe: 'fora_do_orcamento', totalMutantes: 2, detectados: 1, falsosPasses: 1, taxaDeFalsoPasse: 0.5, razaoDeAcerto: 0.5 },
  ],
  achadosNoValido: 0,
};

const solubilidade: MedicaoSolubilidade = {
  passou: true,
  tentativas: 3,
  taxaDeAcerto: 1,
  primeiraConstrucaoFaltante: null,
  avisoTarefaQuebrada: false,
  tentativasRealizadas: [],
};

// ---------------------------------------------------------------------------
// Fixtures do DETECTOR de similaridade (A-P24-3)
// ---------------------------------------------------------------------------

/** O exemplo da teoria: laço clássico. */
const EXEMPLO_DA_TEORIA = `
function calcularMedia(numeros) {
  let soma = 0;
  for (let i = 0; i < numeros.length; i = i + 1) {
    soma = soma + numeros[i];
  }
  return soma / numeros.length;
}
`;

/** Cópia literal: mesmos tokens, só comentários e whitespace diferentes. */
const SOLUCAO_COPIADA = `/* solução do aluno — copiada do exemplo */
function calcularMedia(numeros) {
  let soma = 0;
  // laço clássico (igualmente comentado aqui)
  for (let i = 0; i < numeros.length; i = i + 1) {
    soma = soma + numeros[i];
  }
  return soma / numeros.length;
}`;

/** Mutação pequena: reescrita com outro laço (forEach + guarda) e outros nomes. */
const SOLUCAO_MUTADA = `
function mediaDos(lista) {
  if (!lista.length) {
    return 0;
  }
  let total = 0;
  lista.forEach((item) => {
    total = total + item;
  });
  return total / lista.length;
}
`;

// ---------------------------------------------------------------------------
// A-P24-1 — cada checagem NÃO executada é declarada, com entrada NOMEADA
// ---------------------------------------------------------------------------

describe('engineReport', () => {
  it('A-P24-1: declara explicitamente cada checagem não executada (limitacoes com entradas nomeadas)', () => {
    const relatorio = gerarRelatorio({ auditReport: fixtureAudit() });

    const chaves = relatorio.limitacoes.map((l) => l.split(':')[0]);
    // Séries sempre declaradas: provas de execução e similaridade nunca rodam aqui.
    assert.ok(chaves.includes(LIMITACAO_PROVA_EXECUCAO), 'prova de execução sempre declarada');
    assert.ok(chaves.includes(LIMITACAO_SIMILARIDADE), 'similaridade sempre declarada');
    // Deps ausentes → limitações nomeadas correspondentes.
    assert.ok(chaves.includes(LIMITACAO_TELEMETRIA), 'telemetria ausente declarada');
    assert.ok(chaves.includes(LIMITACAO_FALSO_PASSE), 'falso-passe ausente declarado');
    assert.ok(chaves.includes(LIMITACAO_SOLUBILIDADE), 'solubilidade ausente declarada');
    // Orçamento inferido (o caso da trilha real) é limitação explícita.
    assert.ok(chaves.includes(LIMITACAO_ORCAMENTO_INFERIDO), 'orçamento inferido declarado');

    // Toda entrada é NOMEADA: prefixo estável + dois-pontos.
    for (const entrada of relatorio.limitacoes) {
      assert.match(entrada, /^[a-z0-9-]+:/, `entrada nomeada: ${entrada}`);
    }
  });

  it('A-P24-1: entregar a medição faz a limitação da checagem SUMIR (e números aparecerem)', () => {
    const relatorio = gerarRelatorio({
      auditReport: fixtureAudit(),
      telemetria,
      solubilidade,
      falsoPasse,
      comandos: {
        audit: 'cd app && npm run engine -- audit nodejs-do-zero --limite 0',
        telemetria: 'cd app && npm run engine -- generate nodejs-do-zero',
        'falso-passe': 'cd app && npm run engine -- calibrar nodejs-do-zero',
        solubilidade: 'cd app && npm run engine -- medir-solubilidade nodejs-do-zero',
      },
    });
    const chaves = relatorio.limitacoes.map((l) => l.split(':')[0]);
    assert.ok(!chaves.includes(LIMITACAO_TELEMETRIA), 'telemetria fornecida → limitação some');
    assert.ok(!chaves.includes(LIMITACAO_FALSO_PASSE), 'falso-passe fornecido → limitação some');
    assert.ok(!chaves.includes(LIMITACAO_SOLUBILIDADE), 'solubilidade fornecida → limitação some');
    assert.ok(!chaves.includes(LIMITACAO_COMANDO_NAO_DECLARADO), 'todas as seções têm comando');

    assert.deepEqual(relatorio.taxa_falso_passe_revisor, { amostras: 5, frente_a_mutantes: 4, taxa: 0.25 });
  });

  it('A-P24-1: seção presente SEM comando declarado vira a limitação comando-nao-declarado', () => {
    const relatorio = gerarRelatorio({ auditReport: fixtureAudit(), telemetria });
    const chaves = relatorio.limitacoes.map((l) => l.split(':')[0]);
    assert.ok(chaves.includes(LIMITACAO_COMANDO_NAO_DECLARADO), 'número sem comando é declaração, não silêncio');
    assert.ok(
      relatorio.limitacoes.some((l) => l.includes('telemetria')),
      'a limitação nomeia a seção órfã',
    );
  });

  // -------------------------------------------------------------------------
  // A-P24-2 — o histograma reproduz o penhasco
  // -------------------------------------------------------------------------

  it('A-P24-2: histograma reproduz o penhasco com a distribuição atual (forma reduzida)', () => {
    const relatorio = gerarRelatorio({ auditReport: fixtureAudit() });
    const distribuicao = relatorio.distribuicao_construcoes_novas;

    assert.equal(distribuicao.length, 8, 'uma entrada por aula, na ordem pedagógica');
    assert.equal(distribuicao[0].aula, 'fundamentos-javascript/o-que-e-programacao');
    assert.equal(distribuicao[0].quantidade, 18, 'aula 1 com 18 construções novas (número real)');
    assert.deepEqual(
      distribuicao.map((d) => d.quantidade),
      [18, 11, 3, 5, 5, 9, 4, 1],
      'mesmos primeiros números do audit real, em forma reduzida',
    );

    // PENHASCO visível: a primeira aula concentra — maior que a segunda E
    // maior que o dobro da MEDIANA das demais (a distribuição real: 18; 11; 3; …).
    const resto = distribuicao.slice(1).map((d) => d.quantidade).sort((a, b) => a - b);
    const mediana = resto[Math.floor(resto.length / 2)];
    assert.ok(distribuicao[0].quantidade > distribuicao[1].quantidade, 'aula 1 > aula 2 (queda no penhasco)');
    assert.ok(
      distribuicao[0].quantidade > 2 * mediana,
      `penhasco visível: 18 > 2×${mediana} (domina a mediana das demais aulas)`,
    );
  });

  // -------------------------------------------------------------------------
  // A-P24-3 — o detector de similaridade (Dice ≥ 0,70, tokens normalizados)
  // -------------------------------------------------------------------------

  it('A-P24-3: acusa solução copiada do exemplo da teoria e NÃO acusa mutação pequena', () => {
    // Normalização: comentários e whitespace somem da régua.
    assert.ok(!normalizarCodigo('// segredo\nlet a = 1;').includes('segredo'), 'comentário de linha removido');
    assert.ok(!normalizarCodigo('/* bloco */ let a = 1;').includes('bloco'), 'comentário de bloco removido');
    assert.ok(tokenizarPorFronteira('function foo(a) { return a; }\n').length > 0, 'tokeniza por fronteira');

    // Cópia literal → acima do limiar → ACUSA.
    const dCopia = similaridadeDice(EXEMPLO_DA_TEORIA, SOLUCAO_COPIADA);
    assert.ok(dCopia >= LIMIAR_SIMILARIDADE_COPIA, `cópia com Dice ${dCopia} ≥ 0.70`);
    assert.equal(acusarCopia(EXEMPLO_DA_TEORIA, SOLUCAO_COPIADA), true, 'acusarCopia acusa a cópia');

    // Mutação pequena (outro laço, outros nomes) → abaixo do limiar → NÃO acusa.
    const dMutada = similaridadeDice(EXEMPLO_DA_TEORIA, SOLUCAO_MUTADA);
    assert.ok(
      dMutada < LIMIAR_SIMILARIDADE_COPIA,
      `mutação pequena com Dice ${dMutada} < 0.70 (não é cópia literal)`,
    );
    assert.equal(acusarCopia(EXEMPLO_DA_TEORIA, SOLUCAO_MUTADA), false, 'acusarCopia NÃO acusa a mutação');

    // Mesma entrada → Dice 1.0; entradas vazias → 0 (sem evidência não é acusação).
    assert.equal(similaridadeDice(EXEMPLO_DA_TEORIA, EXEMPLO_DA_TEORIA), 1);
    assert.equal(similaridadeDice('', ''), 0);
  });

  // -------------------------------------------------------------------------
  // Placar no formato exato do repositório (§9.2)
  // -------------------------------------------------------------------------

  it('placar no formato exato `N passou · N falhou · N pendente` (do audit)', () => {
    assert.equal(formatarPlacar({ passou: 22, falhou: 96, pendente: 0 }), '22 passou · 96 falhou · 0 pendente');

    const relatorio = gerarRelatorio({ auditReport: fixtureAudit() });
    // 8 desafios, 5 com violação → 3 passou · 5 falhou · 0 pendente.
    assert.deepEqual(relatorio.placar, { passou: 3, falhou: 5, pendente: 0 });
    assert.equal(formatarPlacar(relatorio.placar), '3 passou · 5 falhou · 0 pendente');
  });

  // -------------------------------------------------------------------------
  // ReportSchema valida a saída; campos obrigatórios preenchidos
  // -------------------------------------------------------------------------

  it('ReportSchema valida a saída e os campos obrigatórios estão preenchidos', () => {
    const deps: DepsDoRelatorio = {
      auditReport: fixtureAudit(),
      telemetria,
      solubilidade,
      falsoPasse,
      comandos: {
        audit: 'cd app && npm run engine -- audit nodejs-do-zero --limite 0',
        'falso-passe': 'cd app && npm run engine -- calibrar nodejs-do-zero',
      },
    };
    const relatorio = ReportSchema.parse(gerarRelatorio(deps)); // parse explícito: prova o schema

    assert.equal(relatorio.trilha, 'nodejs-do-zero');
    assert.equal(relatorio.comando, deps.comandos?.audit, 'comando do audit sobreposto pelo caller');
    assert.ok(!Number.isNaN(Date.parse(relatorio.gerado_em)), 'gerado_em é data ISO válida');
    assert.ok(relatorio.veredito === 'aprovado' || relatorio.veredito === 'reprovado');

    // Campos opcionais preenchidos a partir das deps.
    assert.deepEqual(relatorio.tokens_por_fase, [
      { fase: 'F11', tokens: 300 },
      { fase: 'F7', tokens: 200 },
    ], 'tokens por fase = soma por etapa, ordem alfabética');
    assert.equal(relatorio.taxa_falso_passe_revisor.frente_a_mutantes, 4);
    assert.ok(relatorio.justificativa.includes('J3 solubilidade'), 'justificativa cita a medição J3');

    // Sem nenhuma dep opcional: seções vazias/zero, mas o relatório continua válido.
    const minimo = ReportSchema.parse(gerarRelatorio({ auditReport: fixtureAudit() }));
    assert.deepEqual(minimo.desafios_que_falham, []);
    assert.deepEqual(minimo.similaridade_exemplo_solucao, []);
    assert.deepEqual(minimo.tokens_por_fase, []);
    assert.deepEqual(minimo.taxa_falso_passe_revisor, { amostras: 0, frente_a_mutantes: 0, taxa: 0 });
    assert.equal(minimo.limitacoes.length > 0, true, 'limitações nunca ficam vazias');
  });

  it('veredito é determinístico: reprovado com violação; aprovado só sem falha nas checagens executadas', () => {
    assert.equal(gerarRelatorio({ auditReport: fixtureAudit() }).veredito, 'reprovado');

    const limpo = fixtureAudit({ violacoes: 0, desafiosComViolacao: 0 });
    const relatorioLimpo = gerarRelatorio({ auditReport: limpo, solubilidade, falsoPasse });
    assert.equal(relatorioLimpo.veredito, 'aprovado');
    // A justificativa enuncia o veredito na frase inicial da regra (a regra
    // explica quando reprovado dispararia — o veredito é o da primeira palavra).
    assert.match(relatorioLimpo.justificativa, /Veredito: aprovado —/, 'justificativa coerente com o veredito');

    // J3 entregue com pass^k falso derruba o veredito (fail-closed, §9.3).
    const j3Falha = gerarRelatorio({
      auditReport: limpo,
      solubilidade: { ...solubilidade, passou: false, taxaDeAcerto: 0, avisoTarefaQuebrada: true },
    });
    assert.equal(j3Falha.veredito, 'reprovado');
  });

  // -------------------------------------------------------------------------
  // Protocolo INT-02 (P-30) — o MESMO pin, sem redigitar números
  // -------------------------------------------------------------------------

  it('INT-02: relatório espelha o PIN_PLACAR importado (mesmo pin, sem redigitar) e cita o protocolo', () => {
    const relatorio = gerarRelatorio({
      auditReport: fixtureAudit({
        violacoes: PIN_PLACAR.violacoes,
        desafiosComViolacao: PIN_PLACAR.desafiosComViolacao,
        lacunasDeCurriculo: PIN_PLACAR.lacunas,
        desafios: 118,
      }),
    });
    assert.equal(relatorio.placar.falhou, PIN_PLACAR.desafiosComViolacao);
    // O resumo é DERIVADO do pin (118 desafios reais) — nunca redigitar o
    // número à mão, senão o bump da rodada 12 quebraria este espelho.
    assert.equal(
      formatarPlacar(relatorio.placar),
      `${118 - PIN_PLACAR.desafiosComViolacao} passou · ${PIN_PLACAR.desafiosComViolacao} falhou · 0 pendente`,
    );
    assert.match(relatorio.justificativa, /INT-02/, 'justificativa cita o protocolo');
    assert.ok(
      relatorio.justificativa.includes('engineAuditPlacar.test.ts'),
      'a justificativa aponta onde vive o pin, sem duplicá-lo',
    );
  });

  it('comandoAuditPadrao reproduz o comando canônico do repo (§9.4)', () => {
    assert.equal(comandoAuditPadrao('nodejs-do-zero'), 'cd app && npm run engine -- audit nodejs-do-zero --limite 0');
  });
});