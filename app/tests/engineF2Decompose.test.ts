/**
 * tests/engineF2Decompose.test.ts — FASE F2: DECOMPOSIÇÃO ATÔMICA
 * (pacote P-15, docs/16-engine-de-trilha.md §3.6/§3.7 e §4).
 *
 * Contratos que mordem aqui (A-P15-1/2):
 *   1. O TESTE DE ATOMICIDADE é CÓDIGO PURO (A-P15-2b) — zero LLM; o candidato
 *      grosso "variáveis" FALHA nos QUATRO critérios nomeados (demonstrável,
 *      exercitável, orçamentável, cronometrável); um átomo real ("let e
 *      atribuição") passa nos quatro.
 *   2. A decomposição é em DUAS chamadas de LLM (A-P15-2): a 1ª é a RECEITA em
 *      texto livre (sem schema rígido), a 2ª é a NORMALIZAÇÃO barata no schema
 *      (a única com template rígido). Ambas via callLlm injetado, com
 *      stageVersion e timeoutMs obrigatórios.
 *   3. Nó sem evento de avaliação é REJEITADO (A-P15-2b2); nó com mais de 2
 *      construções produtivas é REJEITADO (teto §3.6); chave de conceito fora
 *      do snake_case é REJEITADA; nó integrativo OBRIGA erklärung (§3.7).
 *   4. MERGE determinístico por chave de conceito: mesma chave de dois workers
 *      → UM nó com justificativa de merge; duplicata intra-worker é erro.
 *   5. ARQUIVOS DE CANDIDATOS DISJUNTOS por worker: colisão (mesmo arquivo
 *      físico por notação diferente) é erro de configuração validado ANTES do
 *      dispatch (PAR-02, §4.1).
 *   6. introduces com construção fora do vocabulário do P-05 é erro; o
 *      decompositor por família tem exemplares e prompts PRÓPRIOS.
 *   7. Candidato reprovado na atomicidade é DIVIDIDO por nova rodada de duas
 *      chamadas, com recuo limitado (sem laço aberto).
 *
 * Sem rede, sem LLM real, sem disco real (só tmpdir via _helpers/fs) — com
 * UMA exceção deliberada: o teste do caminho DEFAULT do vocabulário lê o
 * atoms.json VERSIONADO no repo (engine/vocab/atoms.json), porque o objeto do
 * teste É o arquivo real que o default deve apontar (regressão do ".." duplo
 * corrigida no fix da onda 2 — o default nunca era exercitado pelos testes).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  CRITERIOS_ATOMICIDADE,
  REGUA_ATOMICIDADE_DEFAULT,
  testarAtomicidade,
  type CandidatoAtomicidade,
} from '../electron/main/engine/phases/atomicity';
import {
  EXEMPLARES_POR_FAMILIA,
  F2ConfigurationError,
  F2DivisaoLimitError,
  F2_DECOMPOSICAO_STAGE_VERSION,
  F2_ETAPA_DECOMPOSICAO,
  F2_ETAPA_NORMALIZACAO,
  F2_NORMALIZACAO_STAGE_VERSION,
  F2ValidationError,
  FAMILIAS_ASSUNTO,
  NO_ATOMICO_JSON_SCHEMA,
  assegurarPosseValida,
  candidatoDeNo,
  carregarVocabulario,
  decomporAssunto,
  escreverCandidatos,
  lerCandidatos,
  mergeCandidatos,
  promptDecompositor,
  validarNoAtomico,
  validarPosseDosOutputs,
  type NoAtomico,
  type TarefaDeDecomposicao,
} from '../electron/main/engine/phases/f2Decompose';
import { CAMINHO_ATOMOS_DEFAULT } from '../electron/main/engine/phases/f0Brief';
import type { EngineLlm, LlmCallRequest, LlmCallResult } from '../electron/main/engine/runtime/callLlm';
import { mkTempDir, rmrf } from './_helpers/fs';

// ---------------------------------------------------------------------------
// Fakes (PURAS — nenhum IO, nenhuma rede, nenhuma chave real)
// ---------------------------------------------------------------------------

/** Vocabulário fake do P-05 — só as chaves usadas pelos fixtures. */
const VOCAB = new Set<string>([
  'node:Identifier',
  'node:Block',
  'node:NumericLiteral',
  'node:VariableDeclaration',
  'decl:let',
  'decl:const',
  'decl:var',
  'op:assign:=',
  'op:assign:+=',
  'op:assign:-=',
  'api:Array.prototype.push',
  'api:Array.prototype.pop',
  'global:Array',
]);

/** Um nó VÁLIDO de base — os testes sobrescrevem o que precisam. */
function baseNo(over: Partial<NoAtomico> = {}): NoAtomico {
  return {
    chave_conceito: 'let_e_atribuicao',
    nome: 'let e atribuição',
    familia: 'sintaxe',
    introduces: { receptive: ['op:assign:='], productive: ['decl:let'] },
    kc_type: 'regra',
    ei_class: 'interativo',
    justificativa: 'let só ganha sentido com a atribuição inicial — declaração e valor inicial nascem juntos',
    erklarung: '',
    role: 'isolado',
    eventos_de_avaliacao: [
      {
        id: 'completar_declaracao',
        tipo: 'completion-uma-lacuna',
        descricao: 'o aluno completa a declaração de uma variável mutável com valor inicial',
        atomo_alvo: 'decl:let',
        lacuna: { span: 'let x = 5;', contem_atomo_alvo: true },
      },
    ],
    ...over,
  };
}

/** Um nó sem o campo `eventos_de_avaliacao` (entrada crua de LLM ruim). */
function noSemCampoEventos(): unknown {
  const copia: Record<string, unknown> = { ...baseNo() };
  delete copia['eventos_de_avaliacao'];
  return copia;
}

/**
 * Cliente fake do transporte: responde por conteúdo do prompt e REGISTRA as
 * chamadas com a ETAPA (é com elas que o teste 8 prova as DUAS chamadas do
 * A-P15-2 e a etapa certa em cada uma).
 */
interface ChamadaRegistrada {
  etapa: string;
  req: LlmCallRequest;
}

function fakeLlm(
  responder: (req: LlmCallRequest, indice: number) => string | Promise<string>,
): { llm: EngineLlm; calls: ChamadaRegistrada[] } {
  const calls: ChamadaRegistrada[] = [];
  const llm: EngineLlm = {
    async callLlm(etapa: string, req: LlmCallRequest): Promise<LlmCallResult> {
      calls.push({ etapa, req });
      const content = await responder(req, calls.length - 1);
      return {
        content,
        model: 'fake-deepseek',
        cached: false,
        stageUsage: { promptTokens: 0, completionTokens: 0, llmCalls: 1, cachedHits: 0, retries: 0 },
        attempts: 1,
        elapsedMs: 0,
      };
    },
    getStageUsage: () => undefined,
    getAllStageUsage: () => ({}),
  };
  return { llm, calls };
}

function tarefa(over: Partial<TarefaDeDecomposicao> = {}): TarefaDeDecomposicao {
  return {
    workerId: 'w1',
    familia: 'sintaxe',
    assuntos: ['variáveis'],
    arquivoSaida: 'candidatos/w1.json',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. O TESTE DE ATOMICIDADE é PURO e reprova "variáveis" nos QUATRO critérios
// ---------------------------------------------------------------------------

describe('engine/f2/atomicity (A-P15-2b — código puro, zero LLM)', () => {
  it('"variáveis" como candidato único falha nos QUATRO critérios nomeados (§3.6)', () => {
    const variaveis: CandidatoAtomicidade = {
      construcoes_produtivas: ['decl:let', 'decl:const', 'op:assign:='],
      construcoes_receptivas: ['node:Block', 'op:assign:+='],
      elementos_nao_interativos: 1,
      elementos_interagem: true,
    };
    const resultado = testarAtomicidade(variaveis);
    assert.equal(resultado.passou, false);
    const criterios = [...new Set(resultado.falhas.map((f) => f.criterio))].sort();
    assert.deepEqual(criterios, [...CRITERIOS_ATOMICIDADE].sort(), 'as quatro falhas são nomeadas');
    for (const falha of resultado.falhas) {
      assert.ok(falha.motivo.length > 0, 'toda falha carrega o motivo citável');
      assert.ok(falha.observado > falha.teto, 'toda falha reporta observado acima do teto');
      assert.ok(['construções', 'elementos', 'segundos'].includes(falha.unidade));
    }
    const falhaOrcamentavel = resultado.falhas.find((f) => f.criterio === 'orcamentavel');
    assert.ok(falhaOrcamentavel, 'orçamentável está entre as quatro falhas');
    assert.ok(
      falhaOrcamentavel!.motivo.includes('acumula'),
      'a falha de orçamento usa o acúmulo nó + régua mínima (predicado próprio, não duplicata de exercitável)',
    );
    assert.ok(resultado.justificativa.includes('NÃO atômico'), 'a justificativa nomeia a reprovação');
    assert.ok(resultado.justificativa.includes('demonstrável'), 'a justificativa cita as réguas');
  });

  it('um átomo real ("let e atribuição") passa nos quatro critérios', () => {
    const atomo: CandidatoAtomicidade = {
      construcoes_produtivas: ['decl:let'],
      construcoes_receptivas: ['op:assign:='],
      elementos_nao_interativos: 0,
      elementos_interagem: true,
    };
    const resultado = testarAtomicidade(atomo);
    assert.equal(resultado.passou, true, `justificativa: ${resultado.justificativa}`);
    assert.deepEqual(resultado.falhas, []);
  });

  it('réguas parametrizáveis: estreitar o teto de tempo reprova o mesmo átomo', () => {
    const atomo: CandidatoAtomicidade = {
      construcoes_produtivas: ['decl:let'],
      construcoes_receptivas: ['op:assign:='],
      elementos_nao_interativos: 0,
      elementos_interagem: true,
    };
    // parte do DEFAULT e estreita só o teto de tempo — sem reinventar a régua.
    const resultado = testarAtomicidade(atomo, {
      ...REGUA_ATOMICIDADE_DEFAULT,
      teto_tempo_resolucao_s: 30,
    });
    assert.equal(resultado.passou, false);
    assert.ok(
      resultado.falhas.some((f) => f.criterio === 'cronometravel'),
      'o teto de 30s reprova a estimativa de 60s do átomo',
    );
    assert.ok(
      resultado.falhas.every((f) => f.criterio === 'cronometravel'),
      'só o cronômetro estreitado falha — os outros três critérios continuam passando no default',
    );
  });

  it('orçamentável é DISCRIMINATIVO: candidatos que falham SÓ nele (os outros três passam)', () => {
    // (a) 3 receptivas em palco interativo: sozinhas cabem (3 ≤ teto 4 —
    // demonstrável passa, span 3 ≤ 4 — exercitável passa, 45s — cronômetro
    // passa); SOMADAS à régua mínima (1 produtiva + 1 receptiva = 2) acumulam
    // 5 > teto 4 → só orçamentável falha (o exemplo da revisão, §3.6).
    const soCarga: CandidatoAtomicidade = {
      construcoes_produtivas: [],
      construcoes_receptivas: ['node:Block', 'op:assign:-=', 'global:Array'],
      elementos_nao_interativos: 0,
      elementos_interagem: true,
    };
    const resCarga = testarAtomicidade(soCarga);
    assert.equal(resCarga.passou, false);
    assert.deepEqual(
      resCarga.falhas.map((f) => f.criterio),
      ['orcamentavel'],
      'a ÚNICA falha é orçamentável (acúmulo de elementos) — os outros três critérios passam',
    );
    assert.ok(resCarga.falhas[0].motivo.includes('acumula'), 'o motivo nomeia o acúmulo com a régua mínima');

    // (b) 2 produtivas sozinhas: passam no palco (2 ≤ 4), no span (2 ≤ 4),
    // no teto do próprio nó (2 ≤ 2) e no cronômetro (90s); acumuladas com a
    // 1 produtiva já prevista somam 3 > teto 2 → só orçamentável falha
    // (acúmulo de produtivas).
    const soCargaProdutiva: CandidatoAtomicidade = {
      construcoes_produtivas: ['decl:let', 'decl:const'],
      construcoes_receptivas: [],
      elementos_nao_interativos: 0,
      elementos_interagem: true,
    };
    const resProdutiva = testarAtomicidade(soCargaProdutiva);
    assert.equal(resProdutiva.passou, false);
    assert.deepEqual(
      resProdutiva.falhas.map((f) => f.criterio),
      ['orcamentavel'],
      'a ÚNICA falha é orçamentável (acúmulo de produtivas) — os outros três critérios passam',
    );
    assert.ok(resProdutiva.falhas[0].unidade === 'construções');
  });
});

// ---------------------------------------------------------------------------
// 1.5. O caminho DEFAULT do vocabulário (regressão do ".." duplo)
// ---------------------------------------------------------------------------

describe('engine/f2/vocabulário: caminho default (regressão do ".." duplo)', () => {
  it('CAMINHO_ATOMOS_DEFAULT (f0Brief) é a fonte única e aponta para engine/vocab/atoms.json REAL', () => {
    // UM '..' a partir de engine/phases → engine/vocab; o bug antigo usava
    // '..','..' → app/electron/main/vocab (inexistente no repo).
    const segmentos = CAMINHO_ATOMOS_DEFAULT.split(path.sep);
    assert.ok(
      segmentos.slice(-3).join(path.sep) === path.join('engine', 'vocab', 'atoms.json'),
      `default deveria ser engine/vocab/atoms.json, recebido: ${CAMINHO_ATOMOS_DEFAULT}`,
    );
    assert.ok(
      !CAMINHO_ATOMOS_DEFAULT.includes(path.join('electron', 'main', 'vocab')),
      'o caminho errado (app/electron/main/vocab) não pode ser o default',
    );
    assert.ok(
      fs.existsSync(CAMINHO_ATOMOS_DEFAULT),
      'o default resolve para um arquivo REAL versionado no repo',
    );
  });

  it('carregarVocabulario() SEM argumento carrega o vocab real do repo — o default é exercitado', () => {
    // Regressão: o default de carregarVocabulario NUNCA era exercitado (todos
    // os testes injetavam vocab). Esta é a exceção declarada a "sem disco
    // real": o atoms.json versionado é o próprio objeto do teste.
    const vocab = carregarVocabulario();
    assert.ok(vocab.size > 0, 'vocab real não pode ser vazio');
    assert.ok(vocab.has('decl:let'), '"decl:let" está no atoms.json real do P-05');
    assert.ok(vocab.has('op:assign:='), '"op:assign:=" está no atoms.json real do P-05');
  });
});

// ---------------------------------------------------------------------------
// 2–7. Validação estrutural (PURO, fail-closed)
// ---------------------------------------------------------------------------

describe('engine/f2/validação do nó (rejeições fail-closed)', () => {
  it('nó SEM evento de avaliação é REJEITADO (A-P15-2b2)', () => {
    const resListaVazia = validarNoAtomico(baseNo({ eventos_de_avaliacao: [] }), VOCAB);
    assert.equal(resListaVazia.valido, false);
    assert.ok(
      resListaVazia.erros.some((e) => e.includes('sem evento de avaliação')),
      `erros: ${resListaVazia.erros.join(' | ')}`,
    );
    const resCampoAusente = validarNoAtomico(noSemCampoEventos(), VOCAB);
    assert.equal(resCampoAusente.valido, false);
    assert.ok(resCampoAusente.erros.some((e) => e.includes('sem evento de avaliação')));
  });

  it('lacuna do evento que não contém o átomo-alvo é REJEITADA (critério 2 do §3.6)', () => {
    const no = baseNo({
      eventos_de_avaliacao: [
        {
          id: 'lacuna_errada',
          tipo: 'completion-uma-lacuna',
          descricao: 'o aluno completa um trecho que não é o alvo',
          atomo_alvo: 'decl:let',
          lacuna: { span: 'const c = 1;', contem_atomo_alvo: false },
        },
      ],
    });
    const res = validarNoAtomico(no, VOCAB);
    assert.equal(res.valido, false);
    assert.ok(res.erros.some((e) => e.includes('contem_atomo_alvo=true')));
  });

  it('nó com MAIS DE 2 construções produtivas é REJEITADO (teto §3.6, nunca 3)', () => {
    const no = baseNo({
      introduces: { receptive: [], productive: ['decl:let', 'decl:const', 'op:assign:='] },
    });
    const res = validarNoAtomico(no, VOCAB);
    assert.equal(res.valido, false);
    assert.ok(
      res.erros.some((e) => e.includes('mais de 2 construções produtivas')),
      `erros: ${res.erros.join(' | ')}`,
    );
    // com DUAS produtivas é válido (a régua é ≤ 2)
    const dois = baseNo({ introduces: { receptive: [], productive: ['decl:let', 'op:assign:='] } });
    assert.equal(validarNoAtomico(dois, VOCAB).valido, true);
  });

  it('chave de conceito fora do padrão snake_case é REJEITADA (item 7)', () => {
    for (const ruim of [
      'LetReatribuicao',
      'let reatribuicao',
      'let-reatribuicao',
      'Let_Reatribuicao',
      'letReatribuicao',
      '',
      'let.atribuicao',
    ]) {
      const res = validarNoAtomico(baseNo({ chave_conceito: ruim }), VOCAB);
      assert.equal(res.valido, false, `chave "${ruim}" deveria ser rejeitada`);
      assert.ok(
        res.erros.some((e) => e.includes('fora do padrão snake_case')),
        `erros para "${ruim}": ${res.erros.join(' | ')}`,
      );
    }
    const boa = validarNoAtomico(baseNo({ chave_conceito: 'let_e_atribuicao_2' }), VOCAB);
    assert.equal(boa.valido, true);
  });

  it('nó integrativo OBRIGA erklärung e nó isolado NÃO a carrega (§3.7)', () => {
    const integrativoSemExplicacao = baseNo({ role: 'integration', erklarung: '' });
    const res = validarNoAtomico(integrativoSemExplicacao, VOCAB);
    assert.equal(res.valido, false);
    assert.ok(res.erros.some((e) => e.includes('exige erklärung')));

    const integrativoOk = baseNo({
      role: 'integration',
      erklarung: 'parâmetro e return se combinam: o valor produzido no corpo é devolvido pela chamada',
    });
    assert.equal(validarNoAtomico(integrativoOk, VOCAB).valido, true);

    const isoladoComExplicacao = baseNo({ erklarung: 'explicação indevida' });
    const res2 = validarNoAtomico(isoladoComExplicacao, VOCAB);
    assert.equal(res2.valido, false);
    assert.ok(res2.erros.some((e) => e.includes('não pode carregar erklärung')));

    const integrativoSemRole = baseNo({ kc_type: 'integrativo' });
    const res3 = validarNoAtomico(integrativoSemRole, VOCAB);
    assert.equal(res3.valido, false);
    assert.ok(res3.erros.some((e) => e.includes('exige role "integration"')));
  });

  it('introduces com construção FORA do vocabulário do P-05 é erro (A-P15-2)', () => {
    const no = baseNo({
      introduces: { receptive: ['node:ConstrucaoInventada'], productive: ['decl:let'] },
    });
    const res = validarNoAtomico(no, VOCAB);
    assert.equal(res.valido, false);
    assert.ok(
      res.erros.some((e) => e.includes('fora do vocabulário')),
      `erros: ${res.erros.join(' | ')}`,
    );
  });

  it('evento com atomo_alvo fora do introduces do MESMO nó é rejeitado', () => {
    const no = baseNo({
      eventos_de_avaliacao: [
        {
          id: 'alvo_alheio',
          tipo: 'completion-uma-lacuna',
          descricao: 'exercita construção que o nó não introduz',
          atomo_alvo: 'api:Array.prototype.push',
          lacuna: { span: 'lista.push(1)', contem_atomo_alvo: true },
        },
      ],
    });
    const res = validarNoAtomico(no, VOCAB);
    assert.equal(res.valido, false);
    assert.ok(res.erros.some((e) => e.includes('não está em introduces')));
  });
});

// ---------------------------------------------------------------------------
// 4. MERGE determinístico por chave de conceito
// ---------------------------------------------------------------------------

describe('engine/f2/merge por chave de conceito (item 7)', () => {
  it('a mesma chave de DOIS workers vira UM nó, com justificativa de merge', () => {
    const w1 = { workerId: 'w1', nos: [baseNo({ chave_conceito: 'declaracao_let', nome: 'let e atribuição' })] };
    const w2 = {
      workerId: 'w2',
      nos: [baseNo({ chave_conceito: 'declaracao_let', nome: 'let e atribuição (redigido)' })],
    };
    const mergeados = mergeCandidatos([w1, w2], VOCAB);
    assert.equal(mergeados.length, 1);
    assert.equal(mergeados[0].chave_conceito, 'declaracao_let');
    assert.deepEqual([...mergeados[0].origem].sort(), ['w1', 'w2']);
    assert.ok(
      mergeados[0].justificativa_de_merge.includes('deduplicado'),
      `justificativa: ${mergeados[0].justificativa_de_merge}`,
    );
  });

  it('é DETERMINÍSTICO: inverte a ordem dos workers e o resultado não muda', () => {
    const w1 = { workerId: 'w1', nos: [baseNo({ chave_conceito: 'declaracao_let', nome: 'A' })] };
    const w2 = {
      workerId: 'w2',
      nos: [baseNo({ chave_conceito: 'declaracao_let', nome: 'B' })],
    };
    assert.deepEqual(
      mergeCandidatos([w1, w2], VOCAB),
      mergeCandidatos([w2, w1], VOCAB),
    );
  });

  it('a saída é ordenada por chave de conceito', () => {
    const fontes = [
      { workerId: 'w1', nos: [baseNo({ chave_conceito: 'b_no', nome: 'B' })] },
      { workerId: 'w2', nos: [baseNo({ chave_conceito: 'a_no', nome: 'A' })] },
    ];
    const mergeados = mergeCandidatos(fontes, VOCAB);
    assert.deepEqual(mergeados.map((n) => n.chave_conceito), ['a_no', 'b_no']);
  });

  it('duplicata DENTRO do mesmo worker é erro (defeito da normalização)', () => {
    assert.throws(
      () =>
        mergeCandidatos(
          [
            {
              workerId: 'w1',
              nos: [baseNo({ chave_conceito: 'x' }), baseNo({ chave_conceito: 'x' })],
            },
          ],
          VOCAB,
        ),
      F2ValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Posse de arquivos de candidatos: colisão = erro de configuração
// ---------------------------------------------------------------------------

describe('engine/f2/posse dos arquivos de candidatos (A-P15-2, teste 6)', () => {
  it('arquivos disjuntos passam; os MESMOS passam validados antes do dispatch', () => {
    const tarefas = [tarefa(), tarefa({ workerId: 'w2', arquivoSaida: 'candidatos/w2.json' })];
    assert.deepEqual(validarPosseDosOutputs(tarefas), []);
    assert.doesNotThrow(() => assegurarPosseValida(tarefas));
  });

  it('duas tarefas declarando o MESMO arquivo físico por notação diferente é erro de configuração', () => {
    // `a/./b` vs `a/b` — mesma chave canônica (normalize).
    assert.throws(
      () => assegurarPosseValida([tarefa(), tarefa({ workerId: 'w2', arquivoSaida: 'candidatos/./w1.json' })]),
      F2ConfigurationError,
    );
    // case-blind + trailing slash (APFS): `Candidatos/A.json` == `candidatos/a.json/`.
    assert.throws(
      () =>
        assegurarPosseValida([
          tarefa({ arquivoSaida: 'Candidatos/A.json' }),
          tarefa({ workerId: 'w2', arquivoSaida: 'candidatos/a.json/' }),
        ]),
      F2ConfigurationError,
    );
  });

  it('o erro de configuração cita os paths colidentes', () => {
    try {
      assegurarPosseValida([tarefa(), tarefa({ workerId: 'w2', arquivoSaida: 'candidatos/w1.json' })]);
      assert.fail('deveria ter lançado F2ConfigurationError');
    } catch (erro) {
      assert.ok(erro instanceof F2ConfigurationError);
      assert.ok(erro.message.includes('colisão de posse'));
      assert.ok(erro.message.includes('candidatos/w1.json'));
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Decompositor por família: prompts e exemplares PRÓPRIOS
// ---------------------------------------------------------------------------

describe('engine/f2/decompositor por família (A-P15-2, teste 7)', () => {
  it('famílias diferentes têm prompts e exemplares distintos', () => {
    const pSintaxe = promptDecompositor('sintaxe', 'variáveis');
    const pAlgoritmo = promptDecompositor('algoritmo', 'variáveis');
    assert.notEqual(pSintaxe, pAlgoritmo);
    assert.ok(pSintaxe.includes(`família "sintaxe"`));
    assert.ok(pAlgoritmo.includes(`família "algoritmo"`));
    // cada prompt embute o exemplar da PRÓPRIA família
    assert.ok(pSintaxe.includes(EXEMPLARES_POR_FAMILIA['sintaxe'][0].assunto));
    assert.ok(pAlgoritmo.includes(EXEMPLARES_POR_FAMILIA['algoritmo'][0].assunto));
    assert.notEqual(EXEMPLARES_POR_FAMILIA['sintaxe'][0].receita, EXEMPLARES_POR_FAMILIA['algoritmo'][0].receita);
    // as cinco famílias têm receitas META todas distintas entre si
    const receitas = FAMILIAS_ASSUNTO.map((f) => EXEMPLARES_POR_FAMILIA[f][0].receita);
    assert.equal(new Set(receitas).size, FAMILIAS_ASSUNTO.length);
  });

  it('o prompt declara o exemplar como META e PROÍBE citar os módulos da trilha (item 3)', () => {
    const p = promptDecompositor('sintaxe', 'variáveis');
    assert.ok(p.includes('EXEMPLO META DA FASE'), 'exemplar declarado como meta');
    assert.ok(p.includes('PROIBIDO citar módulos'), 'anti-semente explícita');
    assert.ok(p.includes('TEXTO LIVRE'), 'chamada 1 pede receita em texto livre');
    assert.ok(!p.includes('"$schema"'), 'chamada 1 NÃO embute schema rígido');
  });
});

// ---------------------------------------------------------------------------
// 8. A-P15-2: decomposição em DUAS chamadas via callLlm
// ---------------------------------------------------------------------------

describe('engine/f2/decomposição (A-P15-2 — DUAS chamadas)', () => {
  it('caminho nominal: exatamente 2 chamadas (receita sem schema + normalização com schema)', async () => {
    const no = baseNo();
    const { llm, calls } = fakeLlm(async (req) => {
      if (req.prompt.includes('FORMATO DA RESPOSTA — TEXTO LIVRE')) {
        return 'receita em texto livre: um nó — let e atribuição, construções decl:let e op:assign:=, interagem.';
      }
      return JSON.stringify([no]);
    });
    const resultado = await decomporAssunto({ llm, vocab: VOCAB }, 'sintaxe', 'variáveis');

    assert.equal(resultado.chamadas, 2);
    assert.equal(calls.length, 2);
    // ETAPAS, stageVersion e timeoutMs obrigatórios por chamada (contrato callLlm).
    assert.equal(calls[0].etapa, F2_ETAPA_DECOMPOSICAO);
    assert.equal(calls[1].etapa, F2_ETAPA_NORMALIZACAO);
    assert.equal(calls[0].req.stageVersion, F2_DECOMPOSICAO_STAGE_VERSION);
    assert.equal(calls[1].req.stageVersion, F2_NORMALIZACAO_STAGE_VERSION);
    assert.ok(Number.isInteger(calls[0].req.timeoutMs) && calls[0].req.timeoutMs >= 1);
    assert.ok(Number.isInteger(calls[1].req.timeoutMs) && calls[1].req.timeoutMs >= 1);
    // A chamada 1 NÃO carrega schema (receita em texto livre); a 2 SIM (normalização).
    assert.equal(calls[0].req.schema, undefined);
    assert.equal(calls[1].req.schema, NO_ATOMICO_JSON_SCHEMA);

    assert.equal(resultado.nos.length, 1);
    assert.equal(resultado.nos[0].chave_conceito, 'let_e_atribuicao');
    assert.deepEqual(resultado.divisoes, []);
  });

  it('no caminho nominal o teste de atomicidade é aplicado a cada nó e não chama a LLM', async () => {
    const no = baseNo();
    const { llm, calls } = fakeLlm(async (req) =>
      req.prompt.includes('FORMATO DA RESPOSTA — TEXTO LIVRE') ? 'receita' : JSON.stringify([no]),
    );
    const resultado = await decomporAssunto({ llm, vocab: VOCAB }, 'sintaxe', 'variáveis');
    assert.equal(resultado.nos.length, 1);
    assert.equal(calls.length, 2, 'atomicidade não gera chamada alguma (A-P15-2b)');
    // o adaptador nó → candidato produz um candidato que este nó realmente passa
    assert.equal(testarAtomicidade(candidatoDeNo(no)).passou, true);
  });

  it('nó inválido vindo da normalização REJEITA a fase com erro estruturado (fail-closed)', async () => {
    const semEvento = baseNo({ eventos_de_avaliacao: [] });
    const { llm } = fakeLlm(async (req) =>
      req.prompt.includes('FORMATO DA RESPOSTA — TEXTO LIVRE') ? 'receita' : JSON.stringify([semEvento]),
    );
    await assert.rejects(
      () => decomporAssunto({ llm, vocab: VOCAB }, 'sintaxe', 'variáveis'),
      (erro: unknown) => {
        assert.ok(erro instanceof F2ValidationError);
        assert.ok(erro.rejeicoes.length === 1);
        assert.ok(erro.rejeicoes[0].erros.some((e) => e.includes('sem evento de avaliação')));
        return true;
      },
    );
  });

  it('saída da normalização que não é JSON fecha a fase (fail-closed)', async () => {
    const { llm } = fakeLlm(async (req) =>
      req.prompt.includes('FORMATO DA RESPOSTA — TEXTO LIVRE') ? 'receita' : 'isto não é json',
    );
    await assert.rejects(
      () => decomporAssunto({ llm, vocab: VOCAB }, 'sintaxe', 'variáveis'),
      F2ValidationError,
    );
  });

  it('candidato reprovado na atomicidade é DIVIDIDO por nova rodada de DUAS chamadas (recuo limitado, sem laço aberto)', async () => {
    // Rodada 1: um nó VÁLIDO porém gORDO (2 produtivas + 4 receptivas, interativo)
    // → reprova em demonstrável, exercitável e cronometrável.
    const gordo = baseNo({
      chave_conceito: 'variaveis_grosso',
      nome: 'variaveis_grosso',
      introduces: {
        receptive: ['node:Identifier', 'node:Block', 'op:assign:-=', 'api:Array.prototype.push'],
        productive: ['decl:let', 'op:assign:='],
      },
    });
    const fino1 = baseNo();
    const fino2 = baseNo({
      chave_conceito: 'reatribuicao',
      nome: 'reatribuição',
      introduces: { receptive: [], productive: ['op:assign:+='] },
      justificativa: 'reatribuição é escrever um novo valor no mesmo nome',
      eventos_de_avaliacao: [
        {
          id: 'completar_reatribuicao',
          tipo: 'completion-uma-lacuna',
          descricao: 'o aluno completa a reatribuição de uma variável existente',
          atomo_alvo: 'op:assign:+=',
          lacuna: { span: 'contador += 1;', contem_atomo_alvo: true },
        },
      ],
    });

    let rondasDeDivisao = 0;
    const { llm, calls } = fakeLlm(async (req) => {
      if (req.prompt.includes('CONTEXTO DE DIVISÃO')) {
        rondasDeDivisao += 1;
        return 'receita da divisão: dois nós menores.';
      }
      if (req.prompt.includes('FORMATO DA RESPOSTA — TEXTO LIVRE')) {
        return rondasDeDivisao > 0 ? 'receita da divisão' : 'receita gorda';
      }
      return rondasDeDivisao > 0 ? JSON.stringify([fino1, fino2]) : JSON.stringify([gordo]);
    });

    const resultado = await decomporAssunto({ llm, vocab: VOCAB }, 'sintaxe', 'variaveis');

    assert.equal(calls.length, 4, 'duas rodadas × duas chamadas');
    assert.equal(resultado.chamadas, 4);
    assert.equal(resultado.divisoes.length, 1);
    assert.equal(resultado.divisoes[0].assunto, 'variaveis_grosso');
    assert.ok(
      resultado.divisoes[0].falhas.some((f) => f.criterio === 'demonstravel'),
      'o rastro de divisão carrega as falhas que motivaram a divisão',
    );
    assert.deepEqual([...resultado.divisoes[0].pedacos].sort(), ['let e atribuição', 'reatribuição']);
    // o prompt da rodada de divisão injeta o contexto com as réguas falhadas
    assert.ok(calls[2].req.prompt.includes('CONTEXTO DE DIVISÃO'));
    assert.ok(calls[2].req.prompt.includes('demonstravel'));
    // os nós finais são os pedaços atômicos, ordenados por chave
    assert.deepEqual(resultado.nos.map((n) => n.chave_conceito), ['let_e_atribuicao', 'reatribuicao']);
  });

  it('filho da divisão que colide com chave já aceita do pai encerra a fase com erro nomeado (fail-closed)', async () => {
    // Rodada 1: um nó ACEITO ('let_e_atribuicao' — passa na atomicidade) e um
    // gordo (reprovado → DIVISÃO). Rodada 2: o filho da divisão REUTILIZA a
    // chave do nó já aceito — colisão de nomenclatura pai×filho é defeito de
    // prompt e fecha a fase nomeando a duplicata (nenhum dedupe silencioso).
    const aceito = baseNo();
    const gordo = baseNo({
      chave_conceito: 'variaveis_grosso',
      nome: 'variaveis_grosso',
      introduces: {
        receptive: ['node:Identifier', 'node:Block', 'op:assign:-=', 'api:Array.prototype.push'],
        productive: ['decl:let', 'op:assign:='],
      },
    });
    const filhoColidindo = baseNo({ chave_conceito: 'let_e_atribuicao', nome: 'let e atribuição (redividido)' });

    let rondasDeDivisao = 0;
    const { llm } = fakeLlm(async (req) => {
      if (req.prompt.includes('CONTEXTO DE DIVISÃO')) {
        rondasDeDivisao += 1;
        return 'receita da divisão: um nó menor.';
      }
      if (req.prompt.includes('FORMATO DA RESPOSTA — TEXTO LIVRE')) {
        return 'receita: um nó aceito e um gordo.';
      }
      return rondasDeDivisao > 0 ? JSON.stringify([filhoColidindo]) : JSON.stringify([aceito, gordo]);
    });

    await assert.rejects(
      () => decomporAssunto({ llm, vocab: VOCAB }, 'sintaxe', 'variáveis'),
      (erro: unknown) => {
        assert.ok(erro instanceof F2ValidationError);
        assert.ok(
          erro.message.includes('let_e_atribuicao'),
          `a mensagem nomeia a duplicata — recebido: ${erro.message}`,
        );
        assert.ok(
          erro.message.includes('duplicadas'),
          `a mensagem sinaliza a colisão pós-união — recebido: ${erro.message}`,
        );
        assert.ok(
          erro.rejeicoes.some((r) => r.chave === 'let_e_atribuicao'),
          'a rejeição estruturada carrega a chave colidida',
        );
        return true;
      },
    );
  });

  it('recuo de divisão limitado: assunto que não converge lança F2DivisaoLimitError (sem laço aberto)', async () => {
    const gordo = baseNo({
      chave_conceito: 'sempre_grosso',
      nome: 'sempre_grosso',
      introduces: {
        receptive: ['node:Identifier', 'node:Block', 'op:assign:-=', 'api:Array.prototype.push'],
        productive: ['decl:let'],
      },
    });
    // toda rodada devolve o MESMO nó grosso — nunca converge.
    const { llm } = fakeLlm(async (req) =>
      req.prompt.includes('FORMATO DA RESPOSTA — TEXTO LIVRE') ? 'receita gorda' : JSON.stringify([gordo]),
    );
    await assert.rejects(
      () => decomporAssunto({ llm, vocab: VOCAB }, 'sintaxe', 'variaveis'),
      F2DivisaoLimitError,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Arquivos de candidatos: escrita/leitura disjunta e merge de disco
// ---------------------------------------------------------------------------

describe('engine/f2/arquivos de candidatos (escritor único por worker)', () => {
  it('round-trip de escrita/leitura em tmpdir, com merge deduplicado', async () => {
    const dir = await mkTempDir('f2-candidatos-');
    try {
      const arqW1 = path.join(dir, 'w1.json');
      const arqW2 = path.join(dir, 'w2.json');
      const noW1 = baseNo({ chave_conceito: 'declaracao_let', nome: 'let e atribuição' });
      const noW2 = baseNo({
        chave_conceito: 'declaracao_let',
        nome: 'let e atribuição (redigido pelo w2)',
      });
      escreverCandidatos(arqW1, [noW1]);
      escreverCandidatos(arqW2, [noW2]);
      // arquivos disjuntos: worker w2 não toca o arquivo do w1 (posse validada antes).
      assegurarPosseDisjunta([arqW1, arqW2], 'w1', 'w2');
      const lidos1 = lerCandidatos(arqW1, VOCAB);
      const lidos2 = lerCandidatos(arqW2, VOCAB);
      assert.deepEqual(lidos1, [noW1], 'round-trip preserva o nó');
      const mergeados = mergeCandidatos(
        [
          { workerId: 'w1', nos: lidos1 },
          { workerId: 'w2', nos: lidos2 },
        ],
        VOCAB,
      );
      assert.equal(mergeados.length, 1);
      assert.deepEqual([...mergeados[0].origem].sort(), ['w1', 'w2']);
    } finally {
      await rmrf(dir);
    }
  });

  it('arquivo de candidatos corrompido fecha a leitura (fail-closed)', async () => {
    const dir = await mkTempDir('f2-candidatos-');
    try {
      const arq = path.join(dir, 'ruim.json');
      escreverCandidatos(arq, [baseNo()]);
      const corrompido = path.join(dir, 'corrompido.json');
      await fs.promises.writeFile(corrompido, '{nao-json', 'utf8');
      // mesmo com um arquivo bom, o corrompido dispara erro estruturado
      assert.ok(lerCandidatos(arq, VOCAB).length === 1);
      assert.throws(() => lerCandidatos(corrompido, VOCAB), F2ValidationError);
    } finally {
      await rmrf(dir);
    }
  });
});

function assegurarPosseDisjunta(arquivos: string[], w1: string, w2: string): void {
  const tarefasDisjuntas: TarefaDeDecomposicao[] = arquivos.map((arquivoSaida, i) => ({
    workerId: i === 0 ? w1 : w2,
    familia: 'sintaxe',
    assuntos: ['x'],
    arquivoSaida,
  }));
  assert.deepEqual(validarPosseDosOutputs(tarefasDisjuntas), []);
}