/**
 * tests/enginePlanner.test.ts — pacote P-13: PROMPTS DO PLANEJADOR e do
 * CORRETOR + o catálogo fechado de ações (`docs/16-engine-de-trilha.md` §6.7,
 * §7.3, §7.4 e §5.5).
 *
 * O que este arquivo PROVA (critérios de aceitação P-13):
 *   1. ação fora do catálogo é REJEITADA e reportada como DEFEITO DO CATÁLOGO
 *      (falha de mapeamento ESTRUTURADA); e em tempo de compilação o TIPO
 *      derivado do `as const` reprova ação inexistente — `@ts-expect-error`
 *      aqui NÃO é enfeite: `npm run lint` roda o tsc sobre `tests/` e um
 *      `@ts-expect-error` numa linha que não dá erro QUEBRA o build;
 *   2. lacuna de currículo (introduzido_em/primeiraAulaQueEnsina === null)
 *      gera CRIAR AULA, NUNCA REWRITE_IN_BUDGET (§5.5);
 *   3. violação de ordem gera reescrita/movimentação, nunca criação de aula;
 *   4. o corretor pode REJEITAR o apontamento com justificativa — resultado
 *      tipado, registrável no ledger de rejeições (§7.4/§6.7);
 *   5. diff fora do span é rejeitado pelo gate (`validarDiffNoSpan`, §7.4);
 *   6. (bônus) o prompt do planejador é FUNÇÃO PURA (byte a byte) e contém o
 *      catálogo integralmente; o prompt do corretor não autoriza edição fora
 *      do span.
 *
 * Sem rede, sem disco, sem LLM: funções puras e fixtures em memória.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACAO_CATALOGO,
  ACAO_SIGNIFICADOS,
  ACOES_DE_LACUNA,
  ACOES_DE_ORDEM,
  defeitoSemMapeamento,
  isAcaoDoCatalogo,
  planoDeAcao,
  validarAcaoNoCatalogo,
  validarAcaoParaApontamento,
  type AcaoCatalogo,
  type AcaoDeLacuna,
  type AcaoDeOrdem,
  type Apontamento,
  type SpanDeArquivo,
} from '../electron/main/engine/review/actionCatalog';
import { promptDoPlanejador, type EntradaDoPromptDoPlanejador } from '../electron/main/engine/prompts/planner';
import {
  criarRejeicaoDoCorretor,
  isRejeicaoDoCorretor,
  justificativaDeRejeicaoValida,
  promptDoCorretor,
  TAMANHO_MINIMO_DE_JUSTIFICATIVA,
  validarDiffNoSpan,
  type CorrecaoDoCorretor,
  type DecisaoDoCorretor,
  type EntradaDoPromptDoCorretor,
  type RejeicaoDoCorretor,
} from '../electron/main/engine/prompts/fixer';

// ---------------------------------------------------------------------------
// Fixtures PURAS (nenhuma trilha real, nenhum IO)
// ---------------------------------------------------------------------------

/** O catálogo do §6.7 como const — o pin contra o qual o catálogo é conferido. */
const DOC_6_7 = [
  'SPLIT_NODE',
  'MERGE_NODES',
  'INSERT_INTERMEDIATE',
  'DECLARE_INTEGRATIVE',
  'ADD_EDGE',
  'REMOVE_EDGE',
  'BREAK_CYCLE_WITH_STUB',
  'BREAK_CYCLE_WITH_MINIMAL_INTRO',
  'DEFER_COMPLEXITY',
  'MARK_WIP',
  'MOVE_CONCEPT_TO_ENTRY_BUDGET',
  'REWRITE_IN_BUDGET',
  'ADD_TEST',
  'SPLIT_LESSON',
] as const;

type OverrideDeApontamento = Partial<Omit<Apontamento, 'alvo' | 'evidencia'>> & {
  alvo?: Partial<Apontamento['alvo']>;
  evidencia?: Partial<Apontamento['evidencia']>;
};

const APONTAMENTO_BASE: Apontamento = {
  id: 'APT-0001',
  rodada: 1,
  artefato: 'desafio',
  alvo: {
    caminho: 'trilha-x/desafios/cumprimentar/challenge.json',
    linha: 2,
    span: [12, 20],
    no_ast: 'CallExpression',
    token: 'typeof',
  },
  evidencia: {
    tipo: 'orcamento',
    prova: 'token `typeof` não pertence ao orçamento de m01/a03',
    introduzido_em: 'm02/a05',
    reproduzivel_por: 'npm run engine -- audit m01/a03',
  },
  defeito: 'O desafio usa `typeof` na linha 2.',
  regra_violada: 'C1',
  categoria: 'construcao_nao_ensinada',
  severity: 'bloqueante',
  acao_sugerida: 'reescrever sem `typeof`',
  confianca: 0.95,
};

/** Apontamento válido (schema P-04) com override — a evidência é a única variável dos testes. */
function ap(over: OverrideDeApontamento = {}): Apontamento {
  return {
    ...APONTAMENTO_BASE,
    ...over,
    alvo: { ...APONTAMENTO_BASE.alvo, ...over.alvo },
    evidencia: { ...APONTAMENTO_BASE.evidencia, ...over.evidencia },
  };
}

// ---------------------------------------------------------------------------
// 1. Catálogo fechado — defeito DO CATÁLOGO estruturado (A-P13-2)
// ---------------------------------------------------------------------------

describe('P-13 · catálogo fechado (A-P13-2 — `as const` + tipo derivado)', () => {
  it('reusa a constante do P-04: 14 ações idênticas ao §6.7, com significado para cada uma', () => {
    // O catálogo NÃO é duplicado no pacote: `ACAO_CATALOGO` vem do
    // `schemas/artifacts.ts` do P-04 — este teste pina a igualdade com o §6.7.
    assert.deepEqual([...ACAO_CATALOGO], [...DOC_6_7]);

    // Todo item do catálogo tem significado (o glossário do prompt do
    // planejador) — o tipo Record<AcaoCatalogo, string> já obriga em tempo de
    // compilação; aqui conferimos em runtime também.
    assert.equal(Object.keys(ACAO_SIGNIFICADOS).length, ACAO_CATALOGO.length);
    for (const acao of ACAO_CATALOGO) {
      assert.ok(ACAO_SIGNIFICADOS[acao].trim().length > 0, `significado de ${acao} não-vazio`);
    }

    // A distinção §5.5 é uma PARTIÇÃO do catálogo: lacuna + ordem = catálogo,
    // sem interseção (derivado por exclusão, sem segunda cópia literal).
    assert.equal(ACOES_DE_LACUNA.length + ACOES_DE_ORDEM.length, ACAO_CATALOGO.length);
    const fora = ACOES_DE_ORDEM.filter((acao) => (ACOES_DE_LACUNA as readonly string[]).includes(acao));
    assert.deepEqual(fora, []);
  });

  it('rejeita ação fora do catálogo como DEFEITO DO CATÁLOGO estruturado (§7.3)', () => {
    assert.equal(isAcaoDoCatalogo('REWRITE_IN_BUDGET'), true);
    assert.equal(isAcaoDoCatalogo('REESCREVER_IN_BUDGET'), false);
    assert.equal(isAcaoDoCatalogo(42), false);
    assert.equal(isAcaoDoCatalogo(null), false);

    const r = validarAcaoNoCatalogo('REESCREVER_IN_BUDGET', 'APT-0001');
    assert.equal(r.ok, false);
    if (!r.ok) {
      // falha de mapeamento ESTRUTURADA — nunca silêncio, nunca ação improvisada
      assert.equal(r.defeito.tipo, 'FALHA_DE_MAPEAMENTO');
      assert.equal(r.defeito.motivo, 'FORA_DO_CATALOGO');
      assert.equal(r.defeito.apontamento_id, 'APT-0001');
      assert.equal(r.defeito.acao_informada, 'REESCREVER_IN_BUDGET');
      assert.ok(r.defeito.detalhe.length > 0);
    }

    // A boa ação passa e é devolvida com o tipo derivado.
    const ok = validarAcaoNoCatalogo('REWRITE_IN_BUDGET', 'APT-0001');
    assert.equal(ok.ok, true);

    // Apontamento que NÃO mapeou para NENHUMA ação: o modelo não improvisou —
    // o laço materializa o defeito com ação informada vazia.
    const semMapa = defeitoSemMapeamento('APT-0002', 'nenhuma ação do catálogo cobre este apontamento');
    assert.equal(semMapa.tipo, 'FALHA_DE_MAPEAMENTO');
    assert.equal(semMapa.motivo, 'SEM_MAPEAMENTO');
    assert.equal(semMapa.acao_informada, '');
  });

  it('o tipo DERIVADO reprova ação inexistente em tempo de compilação', () => {
    // Este bloco é a prova de compilação: se o tipo da ação fosse string
    // solta, estas linhas compilariam e o lint (tsc sobre tests/) quebraria o
    // `@ts-expect-error`. Elas SÓ passam porque o tipo vem do `as const`.
    // @ts-expect-error — A-P13-2: o tipo derivado do catálogo reprova ação que não existe (§6.7)
    const acaoInexistente: AcaoCatalogo = 'REESCREVER_IN_BUDGET';

    // @ts-expect-error — idem via `satisfies`: a propriedade é conferida contra o tipo derivado.
    const conferenciaInvalida = { acao: 'REESCREVER_IN_BUDGET' } satisfies { acao: AcaoCatalogo };

    // @ts-expect-error — a polaridade é DE TIPO: REWRITE_IN_BUDGET nunca é ação de lacuna (§5.5).
    const lacunaComReescrita: AcaoDeLacuna = 'REWRITE_IN_BUDGET';

    // @ts-expect-error — o inverso: violação de ORDEM nunca cria aula (§5.5).
    const ordemComCriacao: AcaoDeOrdem = 'INSERT_INTERMEDIATE';

    // Para o lint de "declarada e nunca usada" não existir — e para provar que
    // a linha de cima COMPILA: a ação válida é aceita de ponta a ponta.
    const acaoValida: AcaoCatalogo = 'REWRITE_IN_BUDGET';
    assert.equal(acaoValida, 'REWRITE_IN_BUDGET');
    assert.equal(validarAcaoNoCatalogo(acaoValida, 'APT-0001').ok, true);
    void acaoInexistente;
    void conferenciaInvalida;
    void lacunaComReescrita;
    void ordemComCriacao;
  });
});

// ---------------------------------------------------------------------------
// 2 e 3. planoDeAcao — a REGRA DE DISTINÇÃO (§5.5)
// ---------------------------------------------------------------------------

describe('P-13 · planoDeAcao — a distinção que faz o laço terminar (§5.5)', () => {
  it('lacuna de currículo (primeiraAulaQueEnsina === null) gera CRIAR AULA, nunca REWRITE_IN_BUDGET', () => {
    const lacuna = ap({ id: 'APT-0001', evidencia: { introduzido_em: null } });
    const plano = planoDeAcao(lacuna);

    assert.equal(plano.lacuna, true);
    if (plano.lacuna) {
      // ação é CRIAR AULA — o par de criação do §5.5 (no tipo, `acao` já é
      // literal do par; aqui confirmamos em runtime contra a lista derivada)
      assert.ok((ACOES_DE_LACUNA as readonly string[]).includes(plano.acao));
      assert.equal(plano.acao, 'INSERT_INTERMEDIATE'); // default determinístico
      assert.deepEqual(plano.acoes_permitidas, [...ACOES_DE_LACUNA]);
      assert.ok(!(plano.acoes_permitidas as readonly string[]).includes('REWRITE_IN_BUDGET')); // NUNCA reescrita para lacuna
      assert.ok(plano.motivo.length > 0);
    }

    // O GATE: um plano do LLM que escolhesse REWRITE_IN_BUDGET para lacuna é
    // rejeitado como POLARIDADE_VIOLADA — a lacuna nunca entra em loop de
    // reescrita (§5.5).
    const gate = validarAcaoParaApontamento(lacuna, 'REWRITE_IN_BUDGET');
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.defeito.tipo, 'FALHA_DE_MAPEAMENTO');
      assert.equal(gate.defeito.motivo, 'POLARIDADE_VIOLADA');
      assert.equal(gate.defeito.apontamento_id, 'APT-0001');
    }

    // A boa ação de lacuna passa no gate.
    assert.equal(validarAcaoParaApontamento(lacuna, 'INSERT_INTERMEDIATE').ok, true);
    assert.equal(validarAcaoParaApontamento(lacuna, 'MOVE_CONCEPT_TO_ENTRY_BUDGET').ok, true);
  });

  it('violação de ordem (primeiraAulaQueEnsina !== null) gera reescrita/movimentação, nunca criação de aula', () => {
    const ordem = ap({ id: 'APT-0002', evidencia: { introduzido_em: 'm02/a05' } });
    const plano = planoDeAcao(ordem);

    assert.equal(plano.lacuna, false);
    if (!plano.lacuna) {
      assert.equal(plano.acao, 'REWRITE_IN_BUDGET'); // reescrever o artefato dentro do orçamento
      assert.ok(plano.acoes_permitidas.includes('REWRITE_IN_BUDGET'));
      assert.ok(plano.acoes_permitidas.includes('REMOVE_EDGE')); // movimentação/reordenação do grafo
      assert.ok(plano.acoes_permitidas.includes('ADD_EDGE'));
      // nunca criação de aula — o complemento por exclusão exclui o par de lacuna
      assert.ok(!(plano.acoes_permitidas as readonly string[]).includes('INSERT_INTERMEDIATE'));
      assert.ok(!(plano.acoes_permitidas as readonly string[]).includes('MOVE_CONCEPT_TO_ENTRY_BUDGET'));
      assert.deepEqual(plano.acoes_permitidas, [...ACOES_DE_ORDEM]);
      assert.ok(plano.motivo.length > 0);
    }

    // O GATE: criar aula em violação de ordem é POLARIDADE_VIOLADA.
    const gate = validarAcaoParaApontamento(ordem, 'INSERT_INTERMEDIATE');
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.defeito.motivo, 'POLARIDADE_VIOLADA');
      assert.equal(gate.defeito.apontamento_id, 'APT-0002');
    }

    // Reescrita dentro do orçamento passa.
    assert.equal(validarAcaoParaApontamento(ordem, 'REWRITE_IN_BUDGET').ok, true);
  });
});

// ---------------------------------------------------------------------------
// 4. O corretor pode REJEITAR o apontamento (§7.4)
// ---------------------------------------------------------------------------

describe('P-13 · o corretor pode rejeitar o apontamento (§7.4)', () => {
  it('a rejeição é resultado TIPADO com justificativa — registrável no ledger (§6.7)', () => {
    const justificativa =
      'A evidência não se confirma: o trecho citado na prova não existe literalmente no artefato ' +
      'no span indicado — o defeito já foi corrigido em rodada anterior e o apontamento está obsoleto.';
    assert.ok(justificativa.length >= TAMANHO_MINIMO_DE_JUSTIFICATIVA);

    const rejeicao = criarRejeicaoDoCorretor(justificativa);
    assert.equal(rejeicao.rejeitado, true);
    assert.equal(rejeicao.justificativa, justificativa);
    assert.ok(isRejeicaoDoCorretor(rejeicao));
    assert.ok(justificativaDeRejeicaoValida(justificativa));

    // justificativa curta demais NÃO é registrável (§6.7: ao menos 40 caracteres)
    assert.equal(justificativaDeRejeicaoValida('curta'), false);
    assert.equal(justificativaDeRejeicaoValida('   '), false);

    // A rejeição é um membro do resultado DISCRIMINADO: uma correção aceita
    // não é rejeição, e o tipo fecha os dois lados.
    const correcao: CorrecaoDoCorretor = { rejeitado: false, delta: [{ inicio: 10, fim: 12, substituicao: 'x' }] };
    assert.equal(isRejeicaoDoCorretor(correcao), false);

    const literal: RejeicaoDoCorretor = { rejeitado: true, justificativa };
    assert.ok(isRejeicaoDoCorretor(literal));
  });

  it('o prompt do corretor instrui o verify-first e o resultado tipado de rejeição', () => {
    const lacuna = ap({ id: 'APT-0001', evidencia: { introduzido_em: null } });
    const decisao: DecisaoDoCorretor = {
      apontamento: lacuna,
      acao: 'INSERT_INTERMEDIATE',
      alvo: { arquivo: 'trilha-x/grafo/order.generated.json', span: [5, 40] },
      resultado_esperado: 'a aula intermediária ensina o conceito e a ordem topológica fica consistente',
    };
    const entrada: EntradaDoPromptDoCorretor = {
      trilha: 'nodejs-do-zero',
      rodada: 2,
      decisao,
      pins: ['pin 1: nenhum token fora do orçamento na AST', 'pin 2: a solução passa em todos os testes'],
    };
    const prompt = promptDoCorretor(entrada);

    assert.ok(prompt.includes('VERIFY-FIRST'));
    assert.ok(prompt.includes('DIREITO DE REJEITAR'));
    assert.ok(prompt.includes('"rejeitado": true'));
    assert.ok(prompt.includes('justificativa'));
    assert.ok(prompt.includes(`${TAMANHO_MINIMO_DE_JUSTIFICATIVA} caracteres`));
    assert.ok(prompt.includes('INSERT_INTERMEDIATE')); // a ação prescrita embutida
  });
});

// ---------------------------------------------------------------------------
// 5. O gate do span — validarDiffNoSpan (§7.4)
// ---------------------------------------------------------------------------

describe('P-13 · o gate do span — validarDiffNoSpan (§7.4)', () => {
  const span: SpanDeArquivo = [10, 20];
  const diff = (trechos: { inicio: number; fim: number; substituicao: string }[]) => ({
    arquivo: 'trilha-x/challenges/cumprimentar/challenge.json',
    trechos,
  });

  it('aceita diff inteiramente dentro do span (inclusive na borda exata)', () => {
    assert.equal(validarDiffNoSpan(diff([{ inicio: 12, fim: 18, substituicao: 'y' }]), span).ok, true);
    assert.equal(validarDiffNoSpan(diff([{ inicio: 10, fim: 20, substituicao: 'borda' }]), span).ok, true);
    assert.deepEqual(validarDiffNoSpan(diff([]), span), { ok: true, trechos_fora_do_span: [], trechos_invalidos: [] });
  });

  it('rejeita diff que toca FORA do span — parcial ou totalmente (§7.4)', () => {
    const totalmenteFora = validarDiffNoSpan(diff([{ inicio: 30, fim: 40, substituicao: '' }]), span);
    assert.equal(totalmenteFora.ok, false);
    assert.deepEqual(totalmenteFora.trechos_fora_do_span, [{ inicio: 30, fim: 40, substituicao: '' }]);

    const cruzandoFim = validarDiffNoSpan(diff([{ inicio: 18, fim: 22, substituicao: 'z' }]), span);
    assert.equal(cruzandoFim.ok, false);
    assert.deepEqual(cruzandoFim.trechos_fora_do_span, [{ inicio: 18, fim: 22, substituicao: 'z' }]);

    const cruzandoInicio = validarDiffNoSpan(diff([{ inicio: 5, fim: 12, substituicao: 'w' }]), span);
    assert.equal(cruzandoInicio.ok, false);
    assert.deepEqual(cruzandoInicio.trechos_fora_do_span, [{ inicio: 5, fim: 12, substituicao: 'w' }]);

    // misto: um trecho dentro, um fora → o fora é listado, o dentro não
    const misto = validarDiffNoSpan(
      diff([
        { inicio: 12, fim: 14, substituicao: 'a' },
        { inicio: 15, fim: 25, substituicao: 'b' },
      ]),
      span,
    );
    assert.equal(misto.ok, false);
    assert.deepEqual(misto.trechos_fora_do_span, [{ inicio: 15, fim: 25, substituicao: 'b' }]);
    assert.deepEqual(misto.trechos_invalidos, []);
  });

  it('rejeita trecho malformado (inicio > fim) — fail-closed', () => {
    const mal = validarDiffNoSpan(diff([{ inicio: 30, fim: 20, substituicao: 'm' }]), span);
    assert.equal(mal.ok, false);
    assert.deepEqual(mal.trechos_invalidos, [{ inicio: 30, fim: 20, substituicao: 'm' }]);
    assert.deepEqual(mal.trechos_fora_do_span, []);
  });
});

// ---------------------------------------------------------------------------
// 6. Bônus — prompts são funções puras e autocontidos
// ---------------------------------------------------------------------------

describe('P-13 · bônus — prompts puros e autocontidos (§7)', () => {
  it('o prompt do planejador é FUNÇÃO PURA (byte a byte) e contém o catálogo integralmente', () => {
    const lacuna = ap({ id: 'APT-0001', evidencia: { introduzido_em: null } });
    const ordem = ap({ id: 'APT-0002', evidencia: { introduzido_em: 'm02/a05' } });
    const entrada: EntradaDoPromptDoPlanejador = {
      trilha: 'nodejs-do-zero',
      rodada: 2,
      apontamentos: [lacuna, ordem],
      ledgerDeRejeicoes:
        'regra C1 | desafios/cumprimentar/challenge.json | op:unary:typeof — excecao_intencional (decisão de projeto, justificativa registrada)',
    };

    const p1 = promptDoPlanejador(entrada);
    const p2 = promptDoPlanejador(entrada);
    assert.equal(p1, p2); // função pura: mesma entrada → mesmo texto byte a byte

    // catálogo INTEGRAL no corpo do prompt (as 14 ações do §6.7)
    for (const acao of ACAO_CATALOGO) {
      assert.ok(p1.includes(acao), `o prompt do planejador contém a ação ${acao}`);
    }

    // a regra de distinção e o defeito do catálogo aparecem literalmente
    assert.ok(p1.includes('CRIAR AULA'));
    assert.ok(p1.includes('NUNCA REWRITE_IN_BUDGET'));
    assert.ok(p1.includes('DEFEITO DO CATÁLOGO'));
    assert.ok(p1.includes('introduzido_em'));
    assert.ok(p1.includes('excecao_intencional')); // o ledger entra verbatim
    assert.ok(p1.includes('APT-0001') && p1.includes('APT-0002')); // os apontamentos entram

    // NENHUM conteúdo didático: o prompt é instrução de processo
    assert.ok(!p1.includes('function main()'));
  });

  it('o prompt do corretor não autoriza edição fora do span', () => {
    const lacuna = ap({ id: 'APT-0001', evidencia: { introduzido_em: null } });
    const decisao: DecisaoDoCorretor = {
      apontamento: lacuna,
      acao: 'INSERT_INTERMEDIATE',
      alvo: { arquivo: 'trilha-x/grafo/order.generated.json', span: [5, 40] },
      resultado_esperado: 'a aula intermediária ensina o conceito e a ordem topológica fica consistente',
    };
    const entrada: EntradaDoPromptDoCorretor = {
      trilha: 'nodejs-do-zero',
      rodada: 2,
      decisao,
      pins: ['pin 1: nenhum token fora do orçamento na AST'],
    };
    const p1 = promptDoCorretor(entrada);
    const p2 = promptDoCorretor(entrada);
    assert.equal(p1, p2); // função pura

    // o span é LEI — a proibição de tocar fora dele está literal no prompt
    assert.ok(p1.includes('FORA desse span'));
    assert.ok(p1.includes('PELO GATE'));
    assert.ok(p1.includes('rejeitado'));
    assert.ok(p1.includes('não toque fora do span') || p1.includes('NÃO toca fora do span'));
    assert.ok(p1.includes('[5, 40]')); // o span prescrito embutido
  });
});