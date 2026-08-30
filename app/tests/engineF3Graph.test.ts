/**
 * tests/engineF3Graph.test.ts — FASE F3: GRAFO DE PRÉ-REQUISITOS
 * (pacote P-16, `docs/16-engine-de-trilha.md` §3.4, §3.5 e §4).
 *
 * Contratos que mordem aqui:
 *   1. A PODA por fecho transitivo (dag.ts, P-08) reduz o número de perguntas
 *      de julgamento e é REPORTADA (contagem de pares evitados) — a aresta
 *      com caminho alternativo não vai ao juiz.
 *   2. EMPATE no julgamento NÃO cria aresta: voto(s) `sim`/`nao` (MULTI-JUIZ)
 *      → sem aresta; `nao-sei`×2 → sem aresta (precisão > cobertura, §3.4).
 *   3. `nao-sei` é resposta VÁLIDA e NUNCA conta como `sim`: um par com voto
 *      único `nao-sei` não vira aresta; em MULTI-JUIZ o `nao-sei` é excluído
 *      da maioria (2 sim + 1 nao-sei → aresta; 1 sim + 1 nao-sei → aresta).
 *   4. A poda é VISÃO DE RENDERIZAÇÃO, nunca armazenamento: o grafo ESCRITO
 *      mantém as arestas redundantes com justificativa (caminho alternativo);
 *      `julgamentos` só contém os pares não-podados.
 *   5. O grafo final passa em TODAS as invariantes I1–I11 (P-08) com a
 *      VisaoDeEnsino montada VIA F4 (`deriveBudgetDoGrafo` — a F3 consome,
 *      nunca re-deriva; orcamentoVigente = budget_saida.receptive ∪
 *      budget_saida.productive; a cauda de revisão entra via `aulasExtras`
 *      porque a I7 exige aulas posteriores e o F4 exige introduz ≥ 1).
 *   6. (bônus) edgeJudge: o prompt contém a pergunta canônica do §3.4
 *      VERBATIM; o EdgeVoteSchema passa no lint do P-04 (INV-04: evidência
 *      ANTES do voto; INV-05: todos obrigatórios); o contrato de resposta é
 *      sim/não/não-sei com parse FAIL-CLOSED (eco do par, strict).
 *   7. (FIX pós-revisão BLOCK) A poda é RECOMPUTADA sobre o GRAFO CONFIRMADO
 *      APÓS o julgamento (reconciliação d2): podada cujo caminho alternativo
 *      SOBREVIVEU fica redundante com justificativa (juiz NÃO chamado para
 *      ela); podada cujo caminho QUEBROU (alguma aresta do caminho rejeitada)
 *      RETORNA ao julgamento — voto decide, e sem voto `sim` NÃO há aresta
 *      (nunca aresta dura sem voto, nunca justificativa falsa, §3.4). G-COVER
 *      (raio ≥ 2): a rede de segurança só age quando o caminho implicante
 *      QUEBRA — par longo com caminho vivo fica redundante (sem chamada extra)
 *      e par longo com caminho quebrado ENTRA no juiz.
 *
 * JUZ FAKE E OFFLINE: nenhum teste toca rede/LLM/disco — o `JuizDeAresta` é
 * injetado (o caminho de produção `criarJuizDeArestaLlm` só tipa o callLlm,
 * não é exercitado aqui).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  decidirVoto,
  escreverGrafo,
  julgarArestas,
  montarCandidatos,
  montarGrafoDeNos,
  montarVisaoDeEnsino,
  rodarF3,
  F3Error,
  type ArestaRequest,
  type JuizDeAresta,
  type ParCandidato,
} from '../electron/main/engine/phases/f3Graph';
import {
  EDGE_VOTE_JSON_SCHEMA,
  EdgeVoteSchema,
  PERGUNTA_CANONICA_ARESTA,
  parseRespostaDeJuiz,
  promptDeJuizDeAresta,
  type EntradaPromptJuizDeAresta,
  type VotoAresta,
} from '../electron/main/engine/prompts/edgeJudge';
import { conceptId, type ConceptId } from '../electron/main/engine/graph/model';
import { checkInvariants, type AulaNaVisao } from '../electron/main/engine/graph/invariants';
import { type SchemaRegistrado } from '../electron/main/engine/schemas/artifacts';
import { encontrarCamposOpcionais, lintOrdemCampos } from '../electron/main/engine/schemas/fieldOrder';
import { deriveBudgetDoGrafo, type AulaPlano } from '../electron/main/engine/phases/f4Budget';
import type { NoAtomico } from '../electron/main/engine/phases/f2Decompose';

// ---------------------------------------------------------------------------
// Fixtures (puros, em memória)
// ---------------------------------------------------------------------------

type Familia = NoAtomico['familia'];

/** Um nó atômico F2 mínimo e válido (o atomo_alvo pertence ao introduces do MESMO nó). */
function no(chave: string, familia: Familia, extra: Partial<NoAtomico> = {}): NoAtomico {
  return {
    chave_conceito: chave,
    nome: chave,
    familia,
    introduces: { receptive: [`r:${chave}`], productive: [`p:${chave}`] },
    kc_type: 'fato',
    ei_class: 'isolado',
    justificativa: `justificativa de ${chave}`,
    erklarung: '',
    role: 'isolado',
    eventos_de_avaliacao: [
      {
        id: `ev_${chave}`,
        tipo: 'completion-uma-lacuna',
        descricao: `completa a lacuna de ${chave}`,
        atomo_alvo: `p:${chave}`,
        lacuna: { span: `a lacuna que contém ${chave}`, contem_atomo_alvo: true },
      },
    ],
    ...extra,
  };
}

/** Um pará candidato A→B tipado (ConceptId). */
function par(de: string, para: string): ParCandidato {
  return { de: conceptId(de), para: conceptId(para) };
}

/** Juiz fake: SEMPRE `sim` (com contador de chamadas). */
function juizSim(): { juiz: JuizDeAresta; chamadas: ArestaRequest[] } {
  const chamadas: ArestaRequest[] = [];
  return {
    juiz: {
      async julgar(req: ArestaRequest) {
        chamadas.push(req);
        return 'sim';
      },
    },
    chamadas,
  };
}

/** Juiz fake: votos FIXOS por par (consumidos em ordem, por chamada do par). */
function juizPorPar(votosPorPar: Map<string, VotoAresta[]>): { juiz: JuizDeAresta; chamadas: ArestaRequest[] } {
  const chamadas: ArestaRequest[] = [];
  const contadores = new Map<string, number>();
  return {
    juiz: {
      async julgar(req: ArestaRequest) {
        chamadas.push(req);
        const chave = `${req.de.id}→${req.para.id}`;
        const votos = votosPorPar.get(chave) ?? ['nao-sei'];
        const i = contadores.get(chave) ?? 0;
        contadores.set(chave, i + 1);
        return votos[Math.min(i, votos.length - 1)];
      },
    },
    chamadas,
  };
}

const cadeiaDeReverencia = (): AulaNaVisao => {
  const todos = ['variaveis', 'funcoes', 'condicionais', 'lacos', 'objetos', 'iteracao'].map(conceptId);
  return {
    ref: 'm1/r1',
    introduces: [],
    usa: todos,
    teoriaExemplos: [],
    desafios: [todos],
    artefatos: [todos, todos, todos],
    orcamentoVigente: todos,
  };
};

// ---------------------------------------------------------------------------
// 1 · a poda transitiva reduz perguntas e é reportada
// ---------------------------------------------------------------------------

describe('F3 · candidatura e poda por fecho transitivo (P-08)', () => {
  it('1 · a aresta com caminho alternativo NÃO vai ao juiz e a redução é reportada', () => {
    const montagem = montarGrafoDeNos([no('a', 'sintaxe'), no('b', 'sintaxe'), no('c', 'sintaxe')]);
    const candidatos = montarCandidatos(
      montagem,
      [par('a', 'b'), par('b', 'c'), par('a', 'c')], // a→c é redundante (a→b→c)
    );

    assert.deepEqual(candidatos.julgar, [par('a', 'b'), par('b', 'c')]);
    assert.equal(candidatos.evitadas, 1, 'a poda evita exatamente 1 pergunta');
    assert.equal(candidatos.todos.length, 3);
    assert.equal(candidatos.redundantes.length, 1);
    assert.equal(candidatos.redundantes[0].origem, conceptId('a'));
    assert.equal(candidatos.redundantes[0].destino, conceptId('c'));
    assert.deepEqual(candidatos.redundantes[0].caminho, [conceptId('a'), conceptId('b'), conceptId('c')]);
  });

  it('1b · distância curta: raio > 1 EXPANDE a candidatura (avô→neto vira candidato)', () => {
    const montagem = montarGrafoDeNos([no('a', 'sintaxe'), no('b', 'sintaxe'), no('c', 'sintaxe')]);
    const candidatos = montarCandidatos(montagem, [par('a', 'b'), par('b', 'c')], 1);
    assert.deepEqual(candidatos.todos, [par('a', 'b'), par('b', 'c')], 'raio 1 = o draft');

    const expandida = montarCandidatos(montagem, [par('a', 'b'), par('b', 'c')], 2);
    // a→b, b→c diretos + a→c por caminho de 2 saltos.
    assert.deepEqual(expandida.todos, [par('a', 'b'), par('a', 'c'), par('b', 'c')]);
  });

  it('1c · G-TYPE: conceito desconhecido ou auto-aresta é F3Error estruturado (fail-closed)', () => {
    const montagem = montarGrafoDeNos([no('a', 'sintaxe'), no('b', 'sintaxe')]);
    assert.throws(() => montarCandidatos(montagem, [par('a', 'fantasma')]), F3Error);
    assert.throws(() => montarCandidatos(montagem, [par('a', 'a')]), F3Error);
    // duplicata de chave na montagem também é fail-closed.
    assert.throws(() => montarGrafoDeNos([no('a', 'sintaxe'), no('a', 'sintaxe')]), F3Error);
  });
});

// ---------------------------------------------------------------------------
// 2 · empate NÃO cria aresta; 3 · 'não sei' é válido e nunca conta como sim
// ---------------------------------------------------------------------------

describe('F3 · regra de voto — precisão vale mais que cobertura (§3.4)', () => {
  it('2a · voto único: sim confirma; nao e nao-sei não criam aresta', () => {
    assert.equal(decidirVoto(['sim']), 'sim');
    assert.equal(decidirVoto(['nao']), 'nao');
    assert.equal(decidirVoto(['nao-sei']), 'nao', "'não sei' é válido e não conta como sim");
    assert.equal(decidirVoto([]), 'nao', 'sem votos = sem aresta (fail-closed)');
  });

  it('2b · MULTI-JUIZ: empate sim/não → NENHUMA aresta (grafo escrito sem a aresta)', async () => {
    const montagem = montarGrafoDeNos([no('a', 'sintaxe'), no('b', 'sintaxe')]);
    const votos = new Map<string, VotoAresta[]>([['a→b', ['sim', 'nao']]]);
    const { juiz, chamadas } = juizPorPar(votos);

    const julgamentos = await julgarArestas([par('a', 'b')], montagem, null, { juiz, julgamentosPorPar: 2 });
    assert.equal(julgamentos.length, 1);
    assert.equal(julgamentos[0].decisao, 'nao', 'empate sim/não → sem aresta');
    assert.equal(chamadas.length, 2, 'MULTI-JUIZ faz 2 chamadas por par');

    const escrito = escreverGrafo(montagem, julgamentos, []);
    const b = escrito.grafo.conceitos.find((c) => c.id === conceptId('b')) as NonNullable<typeof escrito.grafo.conceitos[number]>;
    assert.deepEqual(b.desbloqueadoPor, [], 'B não tem A como pré-requisito');
    assert.deepEqual(escrito.justificativas, [], 'sem aresta, sem justificativa');
  });

  it('2c · não-sei×2 também é empate → NENHUMA aresta', () => {
    assert.equal(decidirVoto(['nao-sei', 'nao-sei']), 'nao', "'não sei' excluído da maioria → zero sim → nada");
  });

  it('3 · `não sei` é excluído da maioria: 2 sim + 1 não-sei → aresta; 1 sim + 1 não-sei → aresta', () => {
    assert.equal(decidirVoto(['sim', 'sim', 'nao-sei']), 'sim', "'não sei' não vota nem a favor nem contra");
    assert.equal(decidirVoto(['sim', 'nao-sei']), 'sim');
    assert.equal(decidirVoto(['sim', 'nao', 'nao-sei']), 'nao', 'empate residual sim/nao → nada');
  });

  it('3b · voto único `não sei` por par não cria aresta no fluxo completo de julgamento', async () => {
    const montagem = montarGrafoDeNos([no('a', 'sintaxe'), no('b', 'sintaxe')]);
    const votos = new Map<string, VotoAresta[]>([['a→b', ['nao-sei']]]);
    const { juiz } = juizPorPar(votos);
    const julgamentos = await julgarArestas([par('a', 'b')], montagem, null, { juiz });
    assert.equal(julgamentos[0].decisao, 'nao');
  });
});

// ---------------------------------------------------------------------------
// 4 · a poda é visão de renderização (grafo armazenado mantém as redundantes)
// ---------------------------------------------------------------------------

describe('F3 · poda por fecho é VISÃO DE RENDERIZAÇÃO, nunca armazenamento', () => {
  it('4 · arestas redundantes ficam NO grafo com justificativa (caminho alternativo); o juiz só julga as não-podadas', async () => {
    const nos = [no('a', 'sintaxe'), no('b', 'sintaxe'), no('c', 'sintaxe')];
    const { juiz, chamadas } = juizSim();
    const resultado = await rodarF3({
      nos,
      candidatos: [par('a', 'b'), par('b', 'c'), par('a', 'c')], // a→c é redundante
      juiz,
    });

    // a poda evitou 1 pergunta: o juiz foi chamado APENAS para a→b e b→c.
    assert.equal(resultado.candidatos.evitadas, 1);
    assert.equal(chamadas.length, 2, 'a aresta redundante não gera pergunta de julgamento');
    assert.deepEqual(
      resultado.julgamentos.map((j) => `${j.de}→${j.para}`).sort(),
      ['a→b', 'b→c'],
    );

    // O grafo ARMAZENADO mantém a aresta redundante (visão de renderização).
    const b = resultado.grafo.conceitos.find((c) => c.id === conceptId('b')) as NonNullable<typeof resultado.grafo.conceitos[number]>;
    const c = resultado.grafo.conceitos.find((c) => c.id === conceptId('c')) as NonNullable<typeof resultado.grafo.conceitos[number]>;
    assert.deepEqual(b.desbloqueadoPor, [conceptId('a')]);
    assert.deepEqual(c.desbloqueadoPor, [conceptId('a'), conceptId('b')], 'a→c redundante permanece');

    // E cada aresta armazenada tem justificativa; a redundante expõe o caminho.
    const just = resultado.justificativas;
    assert.equal(just.length, 3);
    const redundante = just.find((j) => j.de === conceptId('a') && j.para === conceptId('c')) as NonNullable<typeof just[number]>;
    assert.equal(redundante.redundantePorFechoTransitivo, true);
    assert.deepEqual(redundante.caminhoAlternativo, [conceptId('a'), conceptId('b'), conceptId('c')]);
    assert.match(redundante.justificativa, /visão|renderiza|fecho transitivo/);
  });
});

// ---------------------------------------------------------------------------
// 5 · o grafo final passa em I1–I11 com a VisaoDeEnsino montada via F4
// ---------------------------------------------------------------------------

describe('F3 · integração com a F4 (deriveBudgetDoGrafo) e as invariantes do P-08', () => {
  it('5 · grafo final passa em TODAS as invariantes I1–I11', async () => {
    const ids = ['variaveis', 'funcoes', 'condicionais', 'lacos', 'objetos', 'iteracao'];
    const familias: NoAtomico['familia'][] = [
      'sintaxe',
      'estrutura-de-dados',
      'algoritmo',
      'api-runtime',
      'ferramenta',
      'sintaxe',
    ];
    const nos = ids.map((id, i) => no(id, familias[i]));

    const cadeia = ids.map((id) => conceptId(id));
    const plano: AulaPlano[] = cadeia.map((c, i) => ({ ref: `m1/a${i + 1}`, introduz: [c] }));
    const candidatos: ParCandidato[] = ids.slice(0, -1).map((de, i) => par(de, ids[i + 1]));

    const { juiz } = juizSim();
    const resultado = await rodarF3({
      nos,
      candidatos,
      juiz,
      planoDeAulas: plano,
      aulasExtrasNaVisao: [cadeiaDeReverencia(), { ...cadeiaDeReverencia(), ref: 'm1/r2' }],
    });

    // A F4 derivou o orçamento (a F3 CONSUME, nunca re-deriva) e a visão existe.
    assert.ok(resultado.budget !== null, 'orçamento F4 derivado');
    assert.ok(resultado.visao !== null, 'VisaoDeEnsino montada');

    // A visão montada usa EXATAMENTE o orcamentoVigente do ajuste do REPLAN:
    // budget_saida.receptive ∪ budget_saida.productive.
    const aula2 = resultado.visao.aulas[1];
    assert.equal(aula2.ref, 'm1/a2');
    const budgetAula2 = resultado.budget.aulas.find((a) => a.ref === 'm1/a2') as NonNullable<typeof resultado.budget.aulas[number]>;
    assert.deepEqual(
      aula2.orcamentoVigente,
      [...new Set([...budgetAula2.budget_saida.receptive, ...budgetAula2.budget_saida.productive])].sort(),
    );

    // O grafo + a visão passam em I1–I11 (dupla via resultado e via checkInvariants direto).
    assert.deepEqual(resultado.violacoes, []);
    assert.deepEqual(checkInvariants(resultado.grafo, resultado.visao), []);

    // E o DAG final tem a topo-sort esperada (G-DAG aprovado).
    assert.equal(resultado.ordem.ok, true);
  });

  it('5b · a mesma F4 (deriveBudgetDoGrafo) valida o grafo sem visão quando não dá para derivar', async () => {
    // Sem plano/aulas-extras: só a estrutura (I1) é verificável — o relatório
    // não lança por grafo válido; violações de I7 na cauda são reportadas.
    const resultado = await rodarF3({
      nos: [no('a', 'sintaxe'), no('b', 'sintaxe'), no('c', 'sintaxe')],
      candidatos: [par('a', 'b'), par('b', 'c')],
      juiz: juizSim().juiz,
    });
    assert.ok(resultado.budget !== null);
    assert.ok(resultado.visao !== null);
    const invariantes = new Set(resultado.violacoes.map((v) => v.invariante));
    assert.ok(!invariantes.has('I1'), 'I1 passa: DAG + referências existem');
    assert.ok(invariantes.has('I7'), 'I7 reporta a cauda (sem aulas posteriores) — a F3 entrega, não lança');
  });

  it('5c · a montagem da visão é determinística e consome o orçamento (não re-deriva)', () => {
    const montagem = montarGrafoDeNos([no('a', 'sintaxe'), no('b', 'sintaxe')]);
    const grafo = {
      conceitos: montagem.grafo.conceitos.map((c, i) => ({
        ...c,
        desbloqueadoPor: i === 1 ? [conceptId('a')] : [],
        usa: i === 1 ? [conceptId('a'), conceptId('b')] : [conceptId('a')],
      })),
    };
    const { budget } = deriveBudgetDoGrafo({
      grafo,
      aulas: [
        { ref: 'm1/a1', introduz: [conceptId('a')] },
        { ref: 'm1/a2', introduz: [conceptId('b')] },
      ],
      entryConstructs: [],
    });
    const visao1 = montarVisaoDeEnsino(grafo, budget);
    const visao2 = montarVisaoDeEnsino(grafo, budget);
    assert.deepEqual(visao1, visao2, 'montagem determinística');
    assert.deepEqual(visao1.aulas[1].usa, [conceptId('a'), conceptId('b')]);
    assert.equal(visao1.construcoesDeEntrada?.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 6 · (bônus) edgeJudge — pergunta verbatim + schema INV-04/05 + contrato
// ---------------------------------------------------------------------------

describe('F3 · prompts/edgeJudge — a pergunta canônica e o contrato de saída', () => {
  it('6a · PERGUNTA_CANONICA_ARESTA é a literal VERBATIM do §3.4', () => {
    assert.equal(
      PERGUNTA_CANONICA_ARESTA,
      'se o aluno acabou de errar B, é praticamente certo que também erraria A, excluindo erro de digitação e acerto por sorte?',
    );
  });

  it('6b · o prompt contém a pergunta VERBATIM e declara não-sei permitido + precisão > cobertura', () => {
    const entrada: EntradaPromptJuizDeAresta = {
      de: { id: 'a', nome: 'A', familiaSintatica: 'sintaxe', introduces: { receptive: ['x'], productive: ['x'] }, role: 'isolado' },
      para: { id: 'b', nome: 'B', familiaSintatica: 'sintaxe', introduces: { receptive: ['y'], productive: ['y'] }, role: 'isolado' },
      orcamentoFatia: { receptive: ['x'], productive: ['x'] },
    };
    const prompt = promptDeJuizDeAresta(entrada);
    assert.ok(prompt.includes(PERGUNTA_CANONICA_ARESTA), 'a pergunta entra VERBATIM no prompt');
    assert.ok(prompt.includes('nao-sei'), 'não-sei declarado como resposta');
    assert.ok(prompt.includes('PRECISÃO VALE MAIS QUE COBERTURA') || prompt.includes('PRECISÃO'));
    assert.ok(prompt.includes('evidencia') && prompt.includes('veredito'));
  });

  it('6c · EdgeVoteSchema passa no lint do P-04 (INV-04: justificativa antes do voto; INV-05: sem opcionais)', () => {
    const registro: SchemaRegistrado = { nome: 'edge-vote', schema: EdgeVoteSchema };
    assert.deepEqual(lintOrdemCampos([registro]), []);
    assert.deepEqual(encontrarCamposOpcionais([registro]), []);
    // O JSON schema acompanha o zod com o MESMO shape (strict em todos os níveis).
    const bruto = JSON.parse(EDGE_VOTE_JSON_SCHEMA) as { additionalProperties: boolean; required: string[] };
    assert.equal(bruto.additionalProperties, false);
    assert.deepEqual(bruto.required, ['de', 'para', 'evidencia', 'veredito']);
  });

  it('6d · contrato de resposta sim/não/não-sei com parse FAIL-CLOSED (eco + strict)', () => {
    assert.equal(parseRespostaDeJuiz('{"de":"a","para":"b","evidencia":"x","veredito":"sim"}', { de: 'a', para: 'b' }), 'sim');
    assert.equal(parseRespostaDeJuiz('{"de":"a","para":"b","evidencia":"x","veredito":"nao"}'), 'nao');
    assert.equal(parseRespostaDeJuiz('```json\n{"de":"a","para":"b","evidencia":"x","veredito":"nao-sei"}\n```'), 'nao-sei');

    // eco de par errado → resposta inválida (o juiz responde SOBRE o par pedido).
    assert.throws(() => parseRespostaDeJuiz('{"de":"a","para":"b","evidencia":"x","veredito":"sim"}', { de: 'a', para: 'c' }), /eco/);
    // campo extra → strict rejeita (campo `decisao`/`voto` nunca é aceito).
    assert.throws(() => parseRespostaDeJuiz('{"de":"a","para":"b","evidencia":"x","veredito":"sim","voto":"sim"}'), /EdgeVoteSchema/);
    // veredito fora do contrato → rejeitado.
    assert.throws(() => parseRespostaDeJuiz('{"de":"a","para":"b","evidencia":"x","veredito":"talvez"}'), /EdgeVoteSchema/);
    // sem evidencia (justificativa) → rejeitado (INV-04/05).
    assert.throws(() => parseRespostaDeJuiz('{"de":"a","para":"b","veredito":"sim"}'), /evidencia/);
    // não-JSON → rejeitado.
    assert.throws(() => parseRespostaDeJuiz('prosa solta'), /JSON/);
  });
});

// ---------------------------------------------------------------------------
// 7 · RECONCILIAÇÃO pós-julgamento — a poda é RECOMPUTADA sobre o grafo
//     CONFIRMADO (arestas votadas sim), nunca sobre o draft (FIX do §3.4)
//     + G-COVER (raio ≥ 2): a rede de segurança só age quando o caminho
//     implicante QUEBRA
// ---------------------------------------------------------------------------

describe('F3 · reconciliação — podada só fica redundante se o caminho implicante SOBREVIVEU', () => {
  const tresNos = (): NoAtomico[] => [no('a', 'sintaxe'), no('b', 'sintaxe'), no('c', 'sintaxe')];

  it('7a · contra-exemplo: a→b sim, b→c nao, a→c podada no draft → RE-JULGADA; voto nao → SEM aresta', async () => {
    const votos = new Map<string, VotoAresta[]>([
      ['a→b', ['sim']],
      ['b→c', ['nao']],
      ['a→c', ['nao']],
    ]);
    const { juiz, chamadas } = juizPorPar(votos);
    const resultado = await rodarF3({
      nos: tresNos(),
      candidatos: [par('a', 'b'), par('b', 'c'), par('a', 'c')], // a→c podada no draft (a→b→c)
      juiz,
    });

    // A poda do draft evitou 1 pergunta, MAS o caminho a→b→c QUEBROU em b→c.
    assert.equal(resultado.candidatos.evitadas, 1);
    assert.equal(resultado.rejulgadas, 1, 'a→c voltou ao julgamento (caminho implicante quebrou)');
    assert.equal(chamadas.length, 3, 'juiz chamado para a→b, b→c e a→c (a→c entrou na 2ª rodada)');
    assert.deepEqual(
      resultado.julgamentos.map((j) => `${j.de}→${j.para}`).sort(),
      ['a→b', 'a→c', 'b→c'],
    );

    const b = resultado.grafo.conceitos.find((c) => c.id === conceptId('b')) as NonNullable<typeof resultado.grafo.conceitos[number]>;
    const c = resultado.grafo.conceitos.find((cc) => cc.id === conceptId('c')) as NonNullable<typeof resultado.grafo.conceitos[number]>;
    assert.deepEqual(b.desbloqueadoPor, [conceptId('a')], 'a→b confirmada');
    assert.deepEqual(c.desbloqueadoPor, [], 'voto nao em b→c e em a→c → c sem pré-requisito (SEM aresta dura sem voto)');

    // NENHUMA aresta a→c no grafo armazenado; NENHUMA justificativa falsa
    // citando o caminho a → b → c (que não existe mais no grafo final).
    assert.ok(
      !resultado.justificativas.some((j) => j.de === conceptId('a') && j.para === conceptId('c')),
      'a→c NÃO está no grafo armazenado',
    );
    assert.equal(resultado.justificativas.length, 1, 'só a→b, confirmada pelo juiz');
  });

  it('7a2 · contra-exemplo com voto sim na re-julgada → aresta DURA VOTADA (justificativa de voto, não de poda)', async () => {
    const votos = new Map<string, VotoAresta[]>([
      ['a→b', ['sim']],
      ['b→c', ['nao']],
      ['a→c', ['sim']],
    ]);
    const { juiz } = juizPorPar(votos);
    const resultado = await rodarF3({
      nos: tresNos(),
      candidatos: [par('a', 'b'), par('b', 'c'), par('a', 'c')],
      juiz,
    });

    const c = resultado.grafo.conceitos.find((cc) => cc.id === conceptId('c')) as NonNullable<typeof resultado.grafo.conceitos[number]>;
    assert.deepEqual(c.desbloqueadoPor, [conceptId('a')], 'a→c confirmada NA RE-JULGADA');
    const just = resultado.justificativas.find((j) => j.de === conceptId('a') && j.para === conceptId('c'));
    assert.ok(just, 'a→c tem justificativa');
    assert.equal(just?.redundantePorFechoTransitivo, false, 're-julgada é VOTADA — nunca classificada como poda');
    assert.match(just?.justificativa ?? '', /confirmada pelo juiz/);
  });

  it('7b · caminho SOBREVIVENTE: a→c permanece redundante COM justificativa e o juiz NÃO foi chamado para ela', async () => {
    const votos = new Map<string, VotoAresta[]>([
      ['a→b', ['sim']],
      ['b→c', ['sim']],
    ]);
    const { juiz, chamadas } = juizPorPar(votos);
    const resultado = await rodarF3({
      nos: tresNos(),
      candidatos: [par('a', 'b'), par('b', 'c'), par('a', 'c')],
      juiz,
    });

    assert.equal(resultado.rejulgadas, 0, 'nada re-julgado: o caminho a→b→c sobreviveu no grafo confirmado');
    assert.equal(chamadas.length, 2, 'juiz chamado APENAS para a→b e b→c');
    assert.ok(
      !chamadas.some((r) => r.de.id === 'a' && r.para.id === 'c'),
      'o juiz NÃO foi chamado para a→c — o grafo confirmado já a implica',
    );

    const just = resultado.justificativas.find((j) => j.de === conceptId('a') && j.para === conceptId('c')) as NonNullable<typeof resultado.justificativas[number]>;
    assert.equal(just.redundantePorFechoTransitivo, true);
    assert.deepEqual(just.caminhoAlternativo, [conceptId('a'), conceptId('b'), conceptId('c')], 'prova recomputada no grafo confirmado');
    assert.match(just.justificativa, /visão|renderiza|fecho transitivo/);
  });

  it('7c · G-COVER raio=2 com elos TODOS sim: par longo fica REDUNDANTE, sem chamadas extras', async () => {
    const votos = new Map<string, VotoAresta[]>([
      ['a→b', ['sim']],
      ['b→c', ['sim']],
    ]);
    const { juiz, chamadas } = juizPorPar(votos);
    const resultado = await rodarF3({
      nos: tresNos(),
      candidatos: [par('a', 'b'), par('b', 'c')], // raio 2 EXPANDE a candidatura para a→c
      raio: 2,
      juiz,
    });

    assert.deepEqual(resultado.candidatos.todos, [par('a', 'b'), par('a', 'c'), par('b', 'c')]);
    assert.equal(resultado.candidatos.evitadas, 1);
    assert.equal(resultado.rejulgadas, 0, 'nada re-julgado: a rede de segurança NÃO infla o trabalho no caso feliz');
    assert.equal(chamadas.length, 2, 'a→c (raio ≥ 2) NÃO entra no juiz: o grafo já o implica');
    assert.deepEqual(
      resultado.julgamentos.map((j) => `${j.de}→${j.para}`).sort(),
      ['a→b', 'b→c'],
    );

    const just = resultado.justificativas.find((j) => j.de === conceptId('a') && j.para === conceptId('c')) as NonNullable<typeof resultado.justificativas[number]>;
    assert.equal(just.redundantePorFechoTransitivo, true, 'par longo vira redundante (visão de renderização)');
    assert.deepEqual(just.caminhoAlternativo, [conceptId('a'), conceptId('b'), conceptId('c')]);
  });

  it('7d · G-COVER raio=2 com elo QUEBRADO: o par longo ENTRA no juiz (a rede de segurança age)', async () => {
    const votos = new Map<string, VotoAresta[]>([
      ['a→b', ['sim']],
      ['b→c', ['nao']],
      ['a→c', ['sim']],
    ]);
    const { juiz, chamadas } = juizPorPar(votos);
    const resultado = await rodarF3({
      nos: tresNos(),
      candidatos: [par('a', 'b'), par('b', 'c')],
      raio: 2,
      juiz,
    });

    assert.equal(resultado.rejulgadas, 1, 'a→c (raio ≥ 2) re-julgada: o caminho a→b→c quebrou em b→c');
    assert.equal(chamadas.length, 3, 'juiz chamado para a→b, b→c e o par longo a→c');
    assert.ok(
      chamadas.some((r) => r.de.id === 'a' && r.para.id === 'c'),
      'a rede de segurança SÓ age quando o caminho implicante QUEBRA — exatamente quando o juiz poderia votar diferente',
    );

    const c = resultado.grafo.conceitos.find((cc) => cc.id === conceptId('c')) as NonNullable<typeof resultado.grafo.conceitos[number]>;
    assert.deepEqual(c.desbloqueadoPor, [conceptId('a')], 'a→c confirmada pelo voto do juiz');
    const just = resultado.justificativas.find((j) => j.de === conceptId('a') && j.para === conceptId('c'));
    assert.equal(just?.redundantePorFechoTransitivo, false, 'par longo com caminho quebrado é VOTADO, nunca podado');
  });
});