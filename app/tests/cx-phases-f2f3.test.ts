/**
 * tests/cx-phases-f2f3.test.ts — CARACTERIZAÇÃO (golden master) das fases
 * F2 (`phases/f2Decompose.ts`) e F3 (`phases/f3Graph.ts`).
 *
 * PINA F2: o alfabeto de famílias/KC/EI/papéis, as REGRAS DURAS do nó atômico
 * (snake_case, vocabulário P-05, ≤2 produtivas, erklarung biunívoca,
 * ≥1 evento de avaliação com lacuna que CONTÉM o átomo-alvo), a posse
 * canônica de arquivos (PAR-02) e o merge determinístico por chave (dedupe
 * entre workers, duplicata intra-worker = defeito).
 *
 * PINA F3: a montagem serial (vértices com arestas VAZIAS, fatias CONGELADAS,
 * chave duplicada = erro), a candidatura por distância curta + poda por fecho
 * transitivo, o voto por MAIORIA com 'nao' como desfecho padrão, e a validação
 * que ENTREGA violações (não lança).
 *
 * Sem LLM, sem rede: só funções puras + tmpdirs próprios.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  CHAVE_CONCEITO_RE,
  EI_CLASSES,
  F2ConfigurationError,
  F2ValidationError,
  FAMILIAS_ASSUNTO,
  F2_ERRO_CODES,
  KC_TYPES,
  LIMITE_RECUO_DIVISAO,
  PAPEIS_DE_NO,
  assegurarPosseValida,
  candidatoDeNo,
  chaveDePosse,
  escreverCandidatos,
  justificarMerge,
  lerCandidatos,
  mergeCandidatos,
  validarNoAtomico,
  validarPosseDosOutputs,
  type NoAtomico,
  type TarefaDeDecomposicao,
} from '../electron/main/engine/phases/f2Decompose';
import {
  F3Error,
  F3_ETAPA_JULGAMENTO,
  F3_JULGAMENTO_STAGE_VERSION,
  F3_JULGAMENTO_TIMEOUT_MS,
  decidirVoto,
  expandirDistanciaCurta,
  montarCandidatos,
  montarGrafoDeNos,
  validarGrafoSemVisao,
  type ParCandidato,
} from '../electron/main/engine/phases/f3Graph';
import type { BudgetF4 } from '../electron/main/engine/phases/f4Budget';
import type { ConceptId } from '../electron/main/engine/graph/model';

/** par candidato a partir de chaves cruas (o tipo real é brandido). */
function par(de: string, para: string): ParCandidato {
  return { de: de as ConceptId, para: para as ConceptId };
}

function pares(lista: ReadonlyArray<readonly [string, string]>): ParCandidato[] {
  return lista.map(([de, para]) => par(de, para));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VOCAB: ReadonlySet<string> = new Set([
  'decl:let',
  'op:binary:+',
  'node:Block',
  'node:IfStatement',
  'api:node:test',
  'global:console',
]);

function no(over: Partial<NoAtomico> = {}): NoAtomico {
  return {
    chave_conceito: 'let_e_atribuicao',
    nome: 'let e atribuição',
    familia: 'sintaxe',
    introduces: { receptive: ['decl:let'], productive: ['decl:let'] },
    kc_type: 'fato',
    ei_class: 'isolado',
    justificativa: 'base do estado',
    erklarung: '',
    role: 'isolado',
    eventos_de_avaliacao: [
      {
        id: 'completar_declaracao',
        tipo: 'completion-uma-lacuna',
        descricao: 'complete a declaração',
        atomo_alvo: 'decl:let',
        lacuna: { span: 'let _ = 1;', contem_atomo_alvo: true },
      },
    ],
    ...over,
  } as NoAtomico;
}

function tarefa(workerId: string, arquivoSaida: string): TarefaDeDecomposicao {
  return { workerId, familia: 'sintaxe', assuntos: ['x'], arquivoSaida };
}

// ---------------------------------------------------------------------------
// 1. F2 — alfabeto e regras duras do nó atômico
// ---------------------------------------------------------------------------

describe('F2-decomposição — alfabeto e regras duras do nó', () => {
  it('fixa famílias, kc_types, EI classes, papéis, regex de chave e o recuo máximo', () => {
    assert.deepEqual([...FAMILIAS_ASSUNTO], ['sintaxe', 'estrutura-de-dados', 'algoritmo', 'api-runtime', 'ferramenta']);
    assert.deepEqual([...KC_TYPES], ['fato', 'categoria', 'regra', 'principio', 'integrativo']);
    assert.deepEqual([...EI_CLASSES], ['isolado', 'interativo']);
    assert.deepEqual([...PAPEIS_DE_NO], ['isolado', 'integration']);
    assert.equal(LIMITE_RECUO_DIVISAO, 3, 'nenhum laço aberto de divisão');
    assert.equal(CHAVE_CONCEITO_RE.test('let_e_atribuicao'), true);
    assert.equal(CHAVE_CONCEITO_RE.test('let-e-atribuicao'), false, 'kebab não é snake_case');
  });

  it('nó válido passa e sai tipado (valido ⇔ no presente)', () => {
    const r = validarNoAtomico(no(), VOCAB);
    assert.equal(r.valido, true);
    assert.deepEqual(r.erros, []);
    assert.equal(r.no?.chave_conceito, 'let_e_atribuicao');
    assert.equal(validarNoAtomico(null, VOCAB).valido, false);
    assert.match(validarNoAtomico('texto', VOCAB).erros[0], /nó não é um objeto/);
  });

  it('regras duras: chave snake_case, família/KC/EI/papel do enum, vocabulário P-05, ≤2 produtivas', () => {
    const casos: Array<[Partial<NoAtomico>, RegExp]> = [
      [{ chave_conceito: 'Ruim' }, /snake_case/],
      [{ nome: '  ' }, /nome vazio/],
      [{ familia: 'outra' as never }, /família desconhecida/],
      [{ introduces: { receptive: [], productive: ['decl:let', 'op:binary:+', 'node:Block'] } }, /produtivas/],
      [{ introduces: { receptive: ['decl:fake'], productive: [] } }, /fora do vocabulário \(P-05\): "decl:fake"/],
      [{ kc_type: 'conceito' as never }, /kc_type desconhecido/],
      [{ ei_class: 'medio' as never }, /ei_class desconhecido/],
      [{ justificativa: ' ' }, /justificativa vazia/],
      [{ role: 'duplo' as never }, /role desconhecido/],
    ];
    for (const [over, esperado] of casos) {
      const r = validarNoAtomico(no(over), VOCAB);
      assert.equal(r.valido, false, `deveria reprovar ${JSON.stringify(over)}`);
      assert.ok(r.erros.some((e) => esperado.test(e)), `erro esperado ${esperado}, veio: ${r.erros.join(' | ')}`);
      assert.equal(r.no, null);
    }
  });

  it('invariante biunívoca do erklarung e do integrativo (§3.7 — composição não é de graça)', () => {
    const integrationSemExplicacao = validarNoAtomico(no({ role: 'integration', erklarung: '' }), VOCAB);
    assert.ok(integrationSemExplicacao.erros.some((e) => /exige erklärung/.test(e)));

    const isoladoComExplicacao = validarNoAtomico(no({ role: 'isolado', erklarung: 'composição' }), VOCAB);
    assert.ok(isoladoComExplicacao.erros.some((e) => /não pode carregar erklärung/.test(e)));

    const integrativoForaDePapel = validarNoAtomico(no({ kc_type: 'integrativo', role: 'isolado', erklarung: '' }), VOCAB);
    assert.ok(integrativoForaDePapel.erros.some((e) => /exige role "integration"/.test(e)));

    const integrativoCerto = validarNoAtomico(
      no({ kc_type: 'integrativo', role: 'integration', erklarung: 'só faz sentido junto' }),
      VOCAB,
    );
    assert.equal(integrativoCerto.valido, true);
  });

  it('sem evento de avaliação não é componente; a lacuna tem de CONTER o átomo-alvo', () => {
    for (const eventos of [[], undefined, 'x']) {
      const r = validarNoAtomico(no({ eventos_de_avaliacao: eventos as never }), VOCAB);
      assert.ok(r.erros.some((e) => /sem evento de avaliação/.test(e)));
    }
    const r = validarNoAtomico(
      no({
        eventos_de_avaliacao: [
          {
            id: 'ev',
            tipo: 'completion-uma-lacuna',
            descricao: 'complete',
            atomo_alvo: 'op:binary:+',
            lacuna: { span: ' ', contem_atomo_alvo: false },
          },
        ],
      }),
      VOCAB,
    );
    assert.equal(r.valido, false, 'átomo-alvo fora do introduces + lacuna sem o átomo reprovam');

    const eventoNaoObjeto = validarNoAtomico(no({ eventos_de_avaliacao: [7 as never] }), VOCAB);
    assert.ok(eventoNaoObjeto.erros.some((e) => /evento não é um objeto/.test(e)));
  });

  it('candidatoDeNo adapta o nó ao teste de atomicidade (ei_class vira o palco)', () => {
    assert.deepEqual(candidatoDeNo(no({ ei_class: 'interativo' })), {
      construcoes_produtivas: ['decl:let'],
      construcoes_receptivas: ['decl:let'],
      elementos_nao_interativos: 0,
      elementos_interagem: true,
    });
    assert.equal(candidatoDeNo(no()).elementos_interagem, false);
  });
});

describe('F2-decomposição — posse de arquivos e merge determinístico', () => {
  it('chaveDePosse: normalize + sem barra final + case-blind (colisão é erro, nunca silêncio)', () => {
    assert.equal(chaveDePosse('out/./x.json'), chaveDePosse('out/x.json'));
    assert.equal(chaveDePosse('out/x.json/'), chaveDePosse('out/x.json'));
    assert.equal(chaveDePosse('Out/X.JSON'), 'out/x.json');
    const colisoes = validarPosseDosOutputs([tarefa('w1', 'out/x.json'), tarefa('w2', 'Out/./x.json/')]);
    assert.deepEqual(colisoes, ['"out/x.json" declarada por w1, w2']);
    assert.deepEqual(validarPosseDosOutputs([tarefa('w1', 'a.json'), tarefa('w2', 'b.json')]), []);
    assert.throws(
      () => assegurarPosseValida([tarefa('w1', 'x.json'), tarefa('w2', 'x.json/')]),
      (erro: unknown) => erro instanceof F2ConfigurationError && erro.code === F2_ERRO_CODES.CONFIGURACAO && erro.colisoes.length === 1,
    );
  });

  it('escreverCandidatos/lerCandidatos fazem o ciclo VALIDADO; arquivo corrompido nunca entra em silêncio', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxph-f2-'));
    const arquivo = path.join(dir, 'sub', 'candidatos.json');
    escreverCandidatos(arquivo, [no(), no({ chave_conceito: 'segundo_no', eventos_de_avaliacao: no().eventos_de_avaliacao })]);
    const lidos = lerCandidatos(arquivo, VOCAB);
    assert.equal(lidos.length, 2);

    await fsp.writeFile(arquivo, '[{"chave_conceito": "x"}]', 'utf8');
    assert.throws(
      () => lerCandidatos(arquivo, VOCAB),
      (erro: unknown) => erro instanceof F2ValidationError && erro.code === F2_ERRO_CODES.VALIDACAO && /nó inválido \(#0\)/.test(erro.message),
    );
    await fsp.writeFile(arquivo, '{quebrado', 'utf8');
    assert.throws(() => lerCandidatos(arquivo, VOCAB), (erro: unknown) => erro instanceof F2ValidationError && /não é JSON válido/.test(erro.message));
    assert.throws(() => lerCandidatos(path.join(dir, 'nao-existe.json'), VOCAB), (erro: unknown) => erro instanceof F2ValidationError && /ilegível/.test(erro.message));
  });

  it('mergeCandidatos: mesma chave entre workers DEDUPLICA (primeiro por workerId); intra-worker é defeito', () => {
    const a = no({ chave_conceito: 'comum' });
    const b = no({ chave_conceito: 'comum', nome: 'outro nome' });
    const mergeados = mergeCandidatos(
      [
        { workerId: 'w2', nos: [b, no({ chave_conceito: 'so_dois' })] },
        { workerId: 'w1', nos: [a] },
      ],
      VOCAB,
    );
    assert.deepEqual(mergeados.map((n) => n.chave_conceito), ['comum', 'so_dois'], 'ordenação por chave de conceito');
    const comum = mergeados[0];
    assert.equal(comum.nome, 'let e atribuição', 'mantido o primeiro na ordem determinística (w1 < w2)');
    assert.deepEqual(comum.origem, ['w1', 'w2']);
    assert.match(comum.justificativa_de_merge, /deduplicado por chave de conceito — produzido por w1 e w2/);
    assert.match(mergeados[1].justificativa_de_merge, /origem única: w2/, 'a origem citada é o WORKER produtor');
    assert.match(justificarMerge([]), /origem única: \(desconhecida\)/);

    assert.throws(
      () => mergeCandidatos([{ workerId: 'w1', nos: [a, b] }], VOCAB),
      (erro: unknown) => erro instanceof F2ValidationError && /duplicata intra-worker/.test(erro.message),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. F3 — montagem, candidatura, voto e validação
// ---------------------------------------------------------------------------

describe('F3-grafo — montagem serial (escritor único)', () => {
  it('vértices com arestas VAZIAS + roles + fatias CONGELADAS (o juiz recebe só a fatia)', () => {
    const m = montarGrafoDeNos([no(), no({ chave_conceito: 'segundo_no', role: 'integration', erklarung: 'composição' })]);
    assert.equal(m.grafo.conceitos.length, 2);
    assert.deepEqual(m.grafo.conceitos[0], {
      id: 'let_e_atribuicao',
      familiaSintatica: 'sintaxe',
      desbloqueadoPor: [],
      usa: [],
    });
    assert.deepEqual(m.roles, { let_e_atribuicao: 'isolado', segundo_no: 'integration' });
    const fatia = m.porId.get('let_e_atribuicao' as ConceptId);
    assert.ok(fatia && Object.isFrozen(fatia), 'a fatia entregue ao juiz é CONGELADA (nunca o estado vivo)');
  });

  it('chave de conceito duplicada na entrada é MONTAGEM_INVALIDA (o merge do F2 deveria ter deduplicado)', () => {
    assert.throws(
      () => montarGrafoDeNos([no(), no()]),
      (erro: unknown) => erro instanceof F3Error && erro.code === 'MONTAGEM_INVALIDA' && /merge do F2/.test(erro.message),
    );
  });

  it('candidatura: auto-aresta e conceito desconhecido são erros G-TYPE/CANDIDATO nomeados', () => {
    const m = montarGrafoDeNos([no(), no({ chave_conceito: 'outro_no' })]);
    assert.throws(
      () => expandirDistanciaCurta(m, [par('let_e_atribuicao', 'let_e_atribuicao')]),
      (erro: unknown) => erro instanceof F3Error && erro.code === 'CANDIDATO_INVALIDO',
    );
    assert.throws(
      () => expandirDistanciaCurta(m, [par('fantasma', 'outro_no')]),
      (erro: unknown) => erro instanceof F3Error && erro.code === 'CONCEITO_DESCONHECIDO',
    );
  });
});

describe('F3-grafo — distância curta, poda por fecho e voto', () => {
  const m = montarGrafoDeNos([
    no({ chave_conceito: 'a' }),
    no({ chave_conceito: 'b' }),
    no({ chave_conceito: 'c' }),
  ]);
  const cadeia = pares([['a', 'b'], ['b', 'c'], ['a', 'c']]);

  it('raio 1 = o draft como veio; raio ≥2 expande por caminho curto (avô→neto)', () => {
    const r1 = expandirDistanciaCurta(m, pares([['a', 'b'], ['b', 'c']]));
    assert.deepEqual(r1, [
      { de: 'a', para: 'b' },
      { de: 'b', para: 'c' },
    ]);
    const r2 = expandirDistanciaCurta(m, pares([['a', 'b'], ['b', 'c']]), 2);
    assert.deepEqual(r2, [...cadeia].sort((x, y) => (x.de === y.de ? (x.para < y.para ? -1 : 1) : x.de < y.de ? -1 : 1)), 'inclui a→c e sai ordenada');
  });

  it('a poda por fecho transitivo evita perguntas (evitadas) e mantém só o essencial para o juiz', () => {
    const c = montarCandidatos(m, cadeia);
    assert.deepEqual([...c.julgar], [
      { de: 'a', para: 'b' },
      { de: 'b', para: 'c' },
    ], 'a→c é redundante por fecho (a→b→c)');
    assert.equal(c.evitadas, 1);
    assert.deepEqual(c.redundantes.map((r) => [r.origem, r.destino]), [['a', 'c']]);
    assert.equal(c.todos.length, 3);
  });

  it('decidirVoto: maioria ESTRITA; empate/zero votos/"não sei" caem no "nao" (aresta padrão = não existir)', () => {
    assert.equal(decidirVoto([]), 'nao');
    assert.equal(decidirVoto(['sim']), 'sim');
    assert.equal(decidirVoto(['sim', 'nao']), 'nao', 'empate NUNCA cria aresta');
    assert.equal(decidirVoto(['sim', 'sim', 'nao']), 'sim');
    assert.equal(decidirVoto(['nao-sei', 'nao-sei']), 'nao', '"não sei" não conta voto');
    assert.equal(decidirVoto(['nao-sei', 'sim', 'nao']), 'nao', '2 relevantes empatadas');
    assert.equal(decidirVoto(['nao-sei', 'sim', 'sim']), 'sim');
  });

  it('validarGrafoSemVisao ENTREGA violações (não lança): ciclo é violação; DAG não é', () => {
    const semCiclo = montarGrafoDeNos([no({ chave_conceito: 'a' }), no({ chave_conceito: 'b' })]);
    assert.deepEqual(validarGrafoSemVisao(semCiclo.grafo), []);

    const comCiclo = montarGrafoDeNos([no({ chave_conceito: 'a' }), no({ chave_conceito: 'b' })]);
    comCiclo.grafo.conceitos[0].desbloqueadoPor.push('b' as ConceptId);
    comCiclo.grafo.conceitos[1].desbloqueadoPor.push('a' as ConceptId);
    const violacoes = validarGrafoSemVisao(comCiclo.grafo);
    assert.ok(violacoes.length > 0, 'o ciclo é reportado como violação estrutural');
  });

  it('fixa a identidade da chamada de julgamento (cache/timeout)', () => {
    assert.equal(F3_ETAPA_JULGAMENTO, 'f3-julgamento-aresta');
    assert.equal(F3_JULGAMENTO_STAGE_VERSION, 'f3-edge-judge-v1');
    assert.equal(F3_JULGAMENTO_TIMEOUT_MS, 30_000);
  });
});
