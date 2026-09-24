/**
 * tests/cx-gap-l05-report.test.ts — TESTES DE GAP do lote L05 sobre
 * `engine/report/report.ts`, escritos ANTES da refatoração. Caracterização dos
 * trechos que os cx-* não cobrem: a seção de TOKENS da justificativa (e o
 * `tokens_por_fase` agregado/ordenado), as DUAS limitações fixas com texto
 * verbatim e os pinos de VEREDITO (J3 falsa reprova; falso-passe ≥ 0,45
 * reprova). PURO: fixtures de AuditReport em memória.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuditReport } from '../electron/main/engine/audit';
import type { MedicaoDeFalsoPasse } from '../electron/main/engine/quality/judgeCalibration';
import type { MedicaoSolubilidade } from '../electron/main/engine/quality/solvable';
import type { Telemetria } from '../electron/main/engine/runtime/ledger';
import {
  LIMITACAO_FALSO_PASSE,
  LIMITACAO_PROVA_EXECUCAO,
  LIMITACAO_SIMILARIDADE,
  gerarRelatorio,
  type DepsDoRelatorio,
} from '../electron/main/engine/report/report';

function auditDeMao(over: Partial<AuditReport> = {}): AuditReport {
  return {
    trackSlug: 'trilha-x',
    budgetSource: 'declared',
    violations: [],
    metrics: [],
    totals: {
      aulas: 1,
      desafios: 2,
      desafiosComViolacao: 0,
      violacoes: 0,
      lacunasDeCurriculo: 0,
      aulasSemConstrucaoNova: 0,
    },
    hygiene: [],
    parseErrors: [],
    limitacoes: [],
    ...over,
  } as unknown as AuditReport;
}

function deps(over: Partial<DepsDoRelatorio> = {}): DepsDoRelatorio {
  return { auditReport: auditDeMao(), ...over };
}

describe('cx-gap/l05/report: tokens por fase — seção da justificativa e agregação', () => {
  it('com telemetria a justificativa tem a seção de TOKENS (verbatim) e tokens_por_fase soma por etapa, ordenado', () => {
    const telemetria: Telemetria[] = [
      { quando: '2026-01-01T00:00:00Z', tarefa: 'autoria', etapa: 'F7', tokensEntrada: 10, tokensSaida: 5 },
      { quando: '2026-01-01T00:01:00Z', tarefa: 'autoria', etapa: 'F7', tokensEntrada: 2, tokensSaida: 3 },
      { quando: '2026-01-01T00:02:00Z', tarefa: 'revisao', etapa: 'F11', tokensEntrada: 7, tokensSaida: 1 },
    ] as unknown as Telemetria[];
    const relatorio = gerarRelatorio(
      deps({ telemetria, comandos: { tokens: 'npm run engine -- telemetry' } }),
    );
    assert.deepEqual(relatorio.tokens_por_fase, [
      { fase: 'F11', tokens: 8 },
      { fase: 'F7', tokens: 20 },
    ]);
    assert.ok(
      relatorio.justificativa.includes(
        'Tokens por fase somados de telemetry.jsonl (fonte ÚNICA de tokens do REPLAN; 3 linha(s)). ' +
          'Fonte da medição: npm run engine -- telemetry.',
      ),
      'a seção de tokens da justificativa mudou de formato',
    );
  });

  it('sem telemetria a seção de tokens NÃO aparece e a limitação de tokens é declarada', () => {
    const relatorio = gerarRelatorio(deps({}));
    assert.deepEqual(relatorio.tokens_por_fase, []);
    assert.ok(!relatorio.justificativa.includes('Tokens por fase somados'));
    assert.ok(
      relatorio.limitacoes.some((l) => l.startsWith('telemetria: fonte de tokens AUSENTE')),
      'a ausência de telemetry.jsonl tem de ser declarada',
    );
  });
});

describe('cx-gap/l05/report: as limitações FIXAS — prova de execução e similaridade', () => {
  it('as duas primeiras limitações saem SEMPRE, com texto verbatim e na ordem fixa', () => {
    const relatorio = gerarRelatorio(deps({}));
    assert.ok(relatorio.limitacoes[0].startsWith(`${LIMITACAO_PROVA_EXECUCAO}: checagem NÃO executada`));
    assert.ok(relatorio.limitacoes[1].startsWith(`${LIMITACAO_SIMILARIDADE}: checagem NÃO executada`));
    assert.ok(relatorio.limitacoes[0].includes('pertence ao G-FINAL/laço; desafios_que_falham sai vazio até a execução real.'));
    assert.ok(relatorio.limitacoes[1].includes('o detector determinístico (similaridadeDice/acusarCopia) roda onde o código existe (G-FINAL/CLI).'));
  });

  it('seção entregue SEM comando declarado vira limitação comando-nao-declarado nomeando a seção', () => {
    const falsoPasse = {
      amostras: 10,
      frenteAMutantes: 8,
      taxaGeral: 0.1,
      porClasse: [],
      achadosNoValido: 0,
    } as unknown as MedicaoDeFalsoPasse;
    const relatorio = gerarRelatorio(deps({ falsoPasse }));
    assert.ok(
      relatorio.limitacoes.some(
        (l) =>
          l.startsWith(`${LIMITACAO_FALSO_PASSE}: checagem NÃO executada`) ||
          l.startsWith('comando-nao-declarado: falso-passe'),
      ),
    );
    assert.ok(
      relatorio.limitacoes.includes(
        "comando-nao-declarado: falso-passe — os números desta seção estão no relatório, mas o caller não declarou o comando reprodutor (campo comandos['falso-passe']).",
      ),
      'a falta do comando tem de ser declaração, nunca silêncio',
    );
  });
});

describe('cx-gap/l05/report: veredito — os pinos de reprovação além das violações', () => {
  it('J3 solubilidade com pass^k falso REPROVA; falso-passe ≥ 0,45 REPROVA; abaixo aprova', () => {
    const solubilidade = {
      passou: false,
      tentativas: 3,
      taxaDeAcerto: 2 / 3,
      primeiraConstrucaoFaltante: 'op:unary:typeof',
      avisoTarefaQuebrada: false,
    } as unknown as MedicaoSolubilidade;
    const comJ3 = gerarRelatorio(deps({ solubilidade }));
    assert.equal(comJ3.veredito, 'reprovado');

    const noLimiar = gerarRelatorio(
      deps({
        falsoPasse: {
          amostras: 10,
          frenteAMutantes: 20,
          taxaGeral: 0.45,
          porClasse: [],
          achadosNoValido: 0,
        } as unknown as MedicaoDeFalsoPasse,
      }),
    );
    assert.equal(noLimiar.veredito, 'reprovado', 'falso-passe ≥ (1−τ)/2 = 0,45 desliga o laço (§6.6)');

    const abaixo = gerarRelatorio(
      deps({
        falsoPasse: {
          amostras: 10,
          frenteAMutantes: 20,
          taxaGeral: 0.44,
          porClasse: [],
          achadosNoValido: 0,
        } as unknown as MedicaoDeFalsoPasse,
        solubilidade: { passou: true, tentativas: 3, taxaDeAcerto: 1 } as unknown as MedicaoSolubilidade,
      }),
    );
    assert.equal(abaixo.veredito, 'aprovado');
  });
});
