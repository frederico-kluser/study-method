/**
 * tests/engineAuditPlacar.test.ts — P-30: o placar do G-AUDIT PINADO no repo.
 *
 * HISTÓRIA: a regra INT-02 ("o placar do audit nunca piora sem declaração —
 * bateria cresceu vs extrator quebrou") vivia só como texto no TASK_PLAN; o
 * run-gate.sh imprimia o placar mas não comparava. A onda 1 mediu um
 * crescimento legítimo (285→296 por 11 formas novas) e o P-06 o devolveu a
 * 285 — sem um teste, uma regressão silenciosa do extrator passaria. Este
 * arquivo torna a regra MECÂNICA: qualquer delta nas três métricas contra o
 * PIN_PLACAR = teste vermelho = gate vermelho (`npm test` roda em todo
 * snapshot de integração).
 *
 * PROTOCOLO DE BUMP: mudança legítima (a bateria de regras cresceu, o repair
 * melhorou o placar, o conteúdo foi reescrito) exige atualizar o PIN_PLACAR
 * NO MESMO commit que declara o motivo. Mudança não declarada = falha do
 * teste = falha do gate.
 *
 * COMO RODA O AUDIT: `auditTrack(track)` SEM opções — o modo automático do
 * budget resolve para `inferred` (nenhuma aula da trilha declara `introduces`).
 * É o MESMO caminho do G-AUDIT do orquestrador (CLI `audit` sem `--modo`),
 * com o harness default `receptive-seed`. O teste carrega a trilha REAL com o
 * MESMO `loadTrack` que o runtime usa — a prova vale contra o conteúdo que o
 * produto consome, nunca contra uma fixture.
 *
 * DURAÇÃO: o audit em memória roda em segundos — aceitável na suíte; é o
 * preço de provar contra o conteúdo real.
 *
 * O total de desafios (hoje 118) NÃO entra no pin: um desafio novo que só
 * repete construções já ensinadas é legítimo e não pode derrubar o gate —
 * o número fica aqui apenas como contexto.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';

import { loadTrack, type LoadedTrack } from '../electron/main/content/trackLoader';
import { auditTrack } from '../electron/main/engine/audit';

/**
 * O pin do placar do G-AUDIT (ver PROTOCOLO DE BUMP no cabeçalho).
 *
 * Exportado como constante para reuso: P-23 (repair) e P-24 (relatório)
 * citam o protocolo no relatório — importam o MESMO pin em vez de redigitar
 * os números.
 */
export const PIN_PLACAR = {
  violacoes: 285,
  desafiosComViolacao: 96,
  lacunas: 102,
} as const;

/** Mesmo padrão de caminho do CLI (`app/tools/track-engine/cli.ts`): a trilha REAL. */
const TRACK_SLUG = 'nodejs-do-zero';
const TRACK_DIR = path.resolve(__dirname, '..', 'resources', 'tracks', TRACK_SLUG);

/** Carregada UMA vez (memoizada) — o loadTrack completo valida schema e integridade. */
let trilhaMemo: Promise<LoadedTrack> | null = null;
function carregarTrilhaReal(): Promise<LoadedTrack> {
  trilhaMemo ??= loadTrack(TRACK_DIR);
  return trilhaMemo;
}

function pinError(metrica: string, obtido: number): string {
  return (
    `placar mudou (${metrica}): esperado ${PIN_PLACAR[metrica as keyof typeof PIN_PLACAR]}, o audit retornou ${obtido}. ` +
    'Mudança legítima? Atualize o PIN_PLACAR NO MESMO commit que declara o motivo ' +
    '(PROTOCOLO DE BUMP no cabeçalho deste arquivo). Mudança não declarada = regressão.'
  );
}

describe('engineAuditPlacar', () => {
  it('o placar do audit da trilha real bate com o pin (INT-02 mecânica)', async () => {
    const track = await carregarTrilhaReal();
    // Mesmo caminho do G-AUDIT do orquestrador: auditTrack sem opções.
    const report = auditTrack(track);

    assert.equal(report.trackSlug, TRACK_SLUG);

    // O pin só foi medido no modo inferido. Se o conteúdo passar a declarar
    // `introduces`, o modo automático muda de natureza e o placar deixa de ser
    // comparável — falhe com mensagem clara em vez de um número confuso.
    assert.equal(
      report.budgetSource,
      'inferred',
      `o orcamento deixou de ser inferido (agora '${report.budgetSource}'): o pin P-30 foi medido em modo inferred ` +
        '— reavalie o placar antes de qualquer bump.',
    );

    assert.equal(
      report.totals.violacoes,
      PIN_PLACAR.violacoes,
      pinError('violacoes', report.totals.violacoes),
    );
    assert.equal(
      report.totals.desafiosComViolacao,
      PIN_PLACAR.desafiosComViolacao,
      pinError('desafiosComViolacao', report.totals.desafiosComViolacao),
    );
    assert.equal(
      report.totals.lacunasDeCurriculo,
      PIN_PLACAR.lacunas,
      pinError('lacunas', report.totals.lacunasDeCurriculo),
    );

    // Contexto (não entra no pin — ver cabeçalho): o total de desafios da trilha.
    assert.ok(report.totals.desafios > 0, 'a trilha real carregou sem desafios?');
  });
});