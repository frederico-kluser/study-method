/**
 * tests/engineF0.test.ts — F0: brief e máquina nocional (pacote P-09,
 * `docs/16-engine-de-trilha.md` §4 F0 · §2 D1 · §3.2 · §12 D2/D3 · G-SCHEMA).
 *
 * Contratos que mordem aqui (critérios de aceitação A-P09-1/A-P09-2 e as
 * perguntas falsificáveis do plano):
 *   1. AXIOMA: critério de entrada que cita construção inexistente no
 *      vocabulário GERADO (P-05) é erro NA CARGA, nomeando a chave inválida e
 *      sugerindo as mais próximas por prefixo (quando houver).
 *   2. POLÍTICA DE HARNESS: campo OBRIGATÓRIO no brief — ausente é ERRO
 *      estruturado, NUNCA default silencioso (A-P09-2, D1 §3.2); alternativa
 *      rejeitada do documento idem.
 *   3. MÁQUINA NOCIONAL: os nove aspectos mínimos (NINE_MINIMUM_ASPECTS)
 *      cobertos, na ordem canônica — a constante é usada NA GERAÇÃO (o prompt
 *      a embute) E NA VALIDAÇÃO.
 *   4. G-SCHEMA + schema da LLM FECHADO: draft inválido perante BriefSchema
 *      produz erro que NOMEIA campo+motivo; draft da LLM com campo de teto de
 *      aulas é REJEITADO (D2 — a contagem é SAÍDA, não existe campo de teto).
 *   5. Fail-closed (INV-03): falha da LLM/disponibilidade propaga erro
 *      estruturado — nunca veredito falso, nunca artefato parcial.
 *
 * Sem rede, sem chave, sem conteúdo didático: LLM fake INJETADA via
 * `createCallLlm` + `DeepSeekClient` fake; vocabulário fake em memória (um
 * teste usa o atoms.json REAL commitado, leitura de disco apenas).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';

import {
  createCallLlm,
  LlmStageError,
  type EngineLlm,
  type LlmCallRequest,
} from '../electron/main/engine/runtime/callLlm';
import {
  DEEPSEEK_ERROR_CODES,
  type DeepSeekChatRequest,
  type DeepSeekChatResponse,
  type DeepSeekClient,
} from '../electron/main/services/deepseekClient';
import {
  CAMINHO_ATOMOS_DEFAULT,
  ETAPA_BRIEF,
  FaseF0Error,
  carregarAtomos,
  chavesDoVocabulario,
  gerarBrief,
  promptF0Brief,
  schemaBriefParaLlm,
  sugestoesPorPrefixo,
  validarBrief,
  type AtomosJson,
} from '../electron/main/engine/phases/f0Brief';
import {
  NINE_MINIMUM_ASPECTS,
  gerarNotionalMachine,
  promptF0NotionalMachine,
  validarNotionalMachine,
  verificarAspectosMinimos,
} from '../electron/main/engine/phases/notionalMachine';

// ---------------------------------------------------------------------------
// Fakes (PURAS — nenhuma rede, nenhuma chave real, nenhum IO além do teste do
// vocabulário real)
// ---------------------------------------------------------------------------

/** Vocabulário fake em memória — as chaves que o axioma pode citar. */
function atomosFake(): AtomosJson {
  return {
    schema: 1,
    node_version: 'v0-teste',
    typescript_version: '5-teste',
    axes: {
      node: ['node:Block', 'node:CallExpression'],
      op: ['op:binary:===', 'op:binary:+'],
      decl: ['decl:let', 'decl:const', 'decl:var'],
      global: ['global:console'],
      api: ['api:Array.prototype.push', 'api:node:test'],
    },
    total: 10,
  };
}

/** Draft de brief VÁLIDO perante BriefSchema + o vocab fake (virada por `over`). */
function briefValido(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tema: 'JavaScript do zero',
    objetivo_geral: 'escrever programas simples que rodam',
    publico_alvo: 'pessoas sem contato com programação',
    criterios_de_entrada: ['decl:let'],
    construcoes_alvo: ['op:binary:===', 'api:Array.prototype.push'],
    politica_de_harness: 'receptive-seed',
    restricoes: [],
    justificativa: 'todo começo precisa de um mapa do que está sendo modelado',
    aprovado: false,
    ...over,
  };
}

/** Draft de máquina nocional VÁLIDO (nove aspectos em ordem canônica + extras). */
function maquinaValida(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nome: 'Máquina nocional de JavaScript/Node',
    descricao: 'modelo mental do runtime que a trilha ensina explicitamente',
    componentes: [
      ...NINE_MINIMUM_ASPECTS.map((aspecto) => ({ nome: aspecto, funcao: `papel de "${aspecto}" na máquina` })),
      { nome: 'heap', funcao: 'memória onde objetos vivem' },
    ],
    estados: [{ nome: 'em execução', descricao: 'processando a linha atual' }],
    transicoes: [{ de: 'parado', para: 'em execução', condicao: 'o programa inicia' }],
    limites: ['a analogia do roteiro não cobre o event loop'],
    analogia: 'um roteiro seguido linha a linha por um ator',
    fonte: 'ECMA-262 · https://developer.mozilla.org/pt-BR/docs/Web/JavaScript',
    ...over,
  };
}

/**
 * Transporte real (P-01) com CLIENTE FAKE: `content` fixo, API key fake.
 * Exercita o contrato do transporte no caminho feliz (usage, cache off).
 */
function transporteFake(conteudo: string): EngineLlm {
  const client: DeepSeekClient = {
    async chatCompletion(_req: DeepSeekChatRequest): Promise<DeepSeekChatResponse> {
      return { content: conteudo, model: 'fake', usage: { promptTokens: 12, completionTokens: 6 } };
    },
  };
  return createCallLlm({ client, apiKey: async () => 'sk-fake' });
}

/** Shape de um componente da máquina nocional (o que os testes manipulam). */
interface ComponenteDaMaquina {
  nome: string;
  funcao: string;
}

/** `final` garante que o teste não depende do shape real do objeto (JSON cru). */
function jsonDe(objeto: unknown): string {
  return JSON.stringify(objeto, null, 0);
}

// ---------------------------------------------------------------------------
// 1. Axioma de entrada vs vocabulário GERADO (P-09 / A-P09-1)
// ---------------------------------------------------------------------------

describe('F0-brief — axioma de entrada validado contra o vocabulário gerado', () => {
  it('critério com construção INEXISTENTE no vocabulário é rejeitado NA CARGA, nomeando a chave', async () => {
    const draft = briefValido({ criterios_de_entrada: ['decl:let', 'decl:lete'] });
    await assert.rejects(
      gerarBrief({ callLlm: transporteFake(jsonDe(draft)).callLlm, assunto: 'javascript do zero', atomos: atomosFake() }),
      (erro: unknown) => {
        assert.ok(erro instanceof FaseF0Error, 'esperado FaseF0Error estruturado');
        assert.equal((erro as FaseF0Error).code, 'AXIOMA_CONSTRUCAO_INEXISTENTE');
        assert.equal((erro as FaseF0Error).campo, 'criterios_de_entrada');
        assert.match((erro as FaseF0Error).message, /"decl:lete"/, 'a mensagem NOMEIA a chave inválida');
        return true;
      },
    );
  });

  it('sugere as construções mais próximas por PREFIXO (determinístico)', () => {
    const chaves = chavesDoVocabulario(atomosFake());
    const sugestoes = sugestoesPorPrefixo('decl:lete', chaves);
    assert.equal(sugestoes[0], 'decl:let', 'a mais próxima por prefixo comum vem primeiro');
    assert.deepEqual(sugestoes, ['decl:let', 'decl:const', 'decl:var'], 'top-3 por prefixo comum, ordem determinística');
  });

  it('a mensagem de erro carrega as sugestões no detalhe estruturado', async () => {
    const draft = briefValido({ criterios_de_entrada: ['criterio-inventado'] });
    await assert.rejects(
      gerarBrief({ callLlm: transporteFake(jsonDe(draft)).callLlm, assunto: 'x', atomos: atomosFake() }),
      (erro: unknown) => {
        const e = erro as FaseF0Error;
        assert.equal(e.code, 'AXIOMA_CONSTRUCAO_INEXISTENTE');
        assert.equal(e.detalhes?.construcao, 'criterio-inventado');
        assert.deepEqual(e.detalhes?.sugestoes, [], 'sem prefixo comum: nenhuma sugestão (o "se houver" do contrato)');
        assert.match(e.message, /Nenhuma sugestão/);
        return true;
      },
    );
  });

  it('critérios presentes no vocabulário passam (caminho feliz do draft)', async () => {
    const draft = briefValido({ criterios_de_entrada: ['decl:let', 'api:node:test'] });
    const { brief, llm } = await gerarBrief({
      callLlm: transporteFake(jsonDe(draft)).callLlm,
      assunto: 'javascript do zero',
      atomos: atomosFake(),
    });
    assert.equal(brief.tema, 'JavaScript do zero');
    assert.deepEqual(brief.criterios_de_entrada, ['decl:let', 'api:node:test']);
    assert.equal(llm.cached, false);
    assert.equal(llm.stageUsage.llmCalls, 1, 'uma ida ao provedor fake');
  });
});

// ---------------------------------------------------------------------------
// 2. Política de harness (A-P09-2 / D1 §3.2) — EXPLÍCITA, nunca default
// ---------------------------------------------------------------------------

describe('F0-brief — política de harness (A-P09-2, D1 §3.2)', () => {
  it('política AUSENTE é ERRO estruturado, nunca default silencioso', async () => {
    const semPolitica = briefValido();
    delete semPolitica.politica_de_harness;
    await assert.rejects(
      gerarBrief({ callLlm: transporteFake(jsonDe(semPolitica)).callLlm, assunto: 'x', atomos: atomosFake() }),
      (erro: unknown) => {
        assert.ok(erro instanceof FaseF0Error);
        const e = erro as FaseF0Error;
        assert.equal(e.code, 'POLITICA_HARNESS_AUSENTE');
        assert.equal(e.campo, 'politica_de_harness');
        assert.match(e.message, /politica_de_harness/);
        assert.match(e.message, /nunca default silencioso/i);
        return true;
      },
    );
  });

  it('o MESMO veredito vale para quem carrega o brief.json do disco (gate puro)', () => {
    const semPolitica = briefValido();
    delete semPolitica.politica_de_harness;
    assert.throws(
      () => validarBrief(semPolitica, atomosFake()),
      (erro: unknown) => {
        assert.ok(erro instanceof FaseF0Error);
        assert.equal((erro as FaseF0Error).code, 'POLITICA_HARNESS_AUSENTE');
        return true;
      },
    );
  });

  it('alternativa considerada e REJEITADA no documento ("aula-zero", "wrapper-gerado") é erro nomeado', async () => {
    for (const alternativa of ['aula-zero', 'wrapper-gerado']) {
      await assert.rejects(
        gerarBrief({
          callLlm: transporteFake(jsonDe(briefValido({ politica_de_harness: alternativa }))).callLlm,
          assunto: 'x',
          atomos: atomosFake(),
        }),
        (erro: unknown) => {
          const e = erro as FaseF0Error;
          assert.equal(e.code, 'POLITICA_HARNESS_REJEITADA');
          assert.equal(e.campo, 'politica_de_harness');
          assert.match(e.message, new RegExp(alternativa));
          assert.match(e.message, /rejeitada/i);
          return true;
        },
      );
    }
  });

  it('valor fora do enum do schema (ex.: "none") cai no BriefSchema — erro NOMEIA campo+motivo', async () => {
    // "none" é valor da política no ORÇAMENTO (budget.ts), não do brief: o
    // BriefSchema (P-04) limita o draft aos valores do §3.2; o erro tem de
    // nomear o campo e o motivo do enum.
    await assert.rejects(
      gerarBrief({
        callLlm: transporteFake(jsonDe(briefValido({ politica_de_harness: 'none' }))).callLlm,
        assunto: 'x',
        atomos: atomosFake(),
      }),
      (erro: unknown) => {
        const e = erro as FaseF0Error;
        assert.equal(e.code, 'BRIEF_SCHEMA_INVALIDO');
        assert.match(e.message, /"politica_de_harness"/, 'campo nomeado');
        assert.match(e.message, /Invalid enum value/i, 'motivo nomeado');
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Máquina nocional — nove aspectos mínimos (NINE_MINIMUM_ASPECTS)
// ---------------------------------------------------------------------------

describe('F0-máquina nocional — os nove aspectos mínimos na ordem canônica', () => {
  it('a constante NINE_MINIMUM_ASPECTS é USADA na geração: o prompt a embute, na ordem', () => {
    const prompt = promptF0NotionalMachine({});
    let anterior = -1;
    for (const aspecto of NINE_MINIMUM_ASPECTS) {
      const posicao = prompt.indexOf(aspecto);
      assert.ok(posicao !== -1, `o prompt deve citar "${aspecto}"`);
      assert.ok(posicao > anterior, `a ordem no prompt segue a canônica ("${aspecto}")`);
      anterior = posicao;
    }
  });

  it('máquina declarada cobrindo os nove (ordem canônica) é aceita', async () => {
    const { maquina, llm } = await gerarNotionalMachine({
      callLlm: transporteFake(jsonDe(maquinaValida())).callLlm,
    });
    assert.equal(NINE_MINIMUM_ASPECTS.length, 9, 'a lista canônica tem exatamente os nove');
    assert.equal(maquina.componentes.length, 10, '9 aspectos + 1 componente adicional');
    assert.equal(maquina.componentes[0].nome, 'execução linha a linha');
    assert.equal(maquina.componentes[8].nome, 'event loop');
    assert.equal(llm.stageUsage.llmCalls, 1);
  });

  it('máquina sem um aspecto mínimo é REJEITADA nomeando o faltante', async () => {
    const semClosures = maquinaValida();
    const componentes = semClosures.componentes as ComponenteDaMaquina[];
    semClosures.componentes = componentes.filter((c) => c.nome !== 'closures');
    assert.throws(
      () => validarNotionalMachine(semClosures),
      (erro: unknown) => {
        const e = erro as FaseF0Error;
        assert.equal(e.code, 'NOTIONAL_ASPECTOS_INCOMPLETOS');
        assert.equal(e.campo, 'componentes');
        assert.match(e.message, /closures/);
        assert.deepEqual(e.detalhes?.faltantes, ['closures']);
        return true;
      },
    );
  });

  it('máquina com aspectos FORA da ordem canônica é REJEITADA nomeando a inversão', async () => {
    const foraDeOrdem = maquinaValida();
    const ordem = [...NINE_MINIMUM_ASPECTS];
    const invertida = [ordem[ordem.length - 1], ...ordem.slice(0, ordem.length - 1)];
    foraDeOrdem.componentes = invertida.map((aspecto) => ({ nome: aspecto, funcao: 'x' }));
    assert.throws(
      () => validarNotionalMachine(foraDeOrdem),
      (erro: unknown) => {
        const e = erro as FaseF0Error;
        assert.equal(e.code, 'NOTIONAL_ASPECTOS_FORA_DE_ORDEM');
        // "event loop" (canônico 9º) declarado na POSIÇÃO 0 — antes do seu
        // antecessor canônico "closures" (posição 8): a mensagem nomeia os dois.
        assert.match(e.message, /event loop/);
        assert.match(e.message, /closures/);
        assert.deepEqual(e.detalhes?.foraDeOrdem as unknown[], [
          { aspecto: 'event loop', posicao: 0, antecessor: 'closures' },
        ]);
        return true;
      },
    );
  });

  it('componente extra INTERCALADO não viola a ordem canônica (subsequência estrita)', () => {
    const componentes: ComponenteDaMaquina[] = [
      { nome: 'execução linha a linha', funcao: '1' },
      { nome: 'heap', funcao: 'extras entre aspectos são permitidos' },
      { nome: 'uma variável guarda um valor', funcao: '2' },
    ];
    // Os 7 restantes, em ordem, DEPOIS do heap — a subsequência canônica se mantém.
    for (let i = 2; i < NINE_MINIMUM_ASPECTS.length; i += 1) {
      componentes.push({ nome: NINE_MINIMUM_ASPECTS[i], funcao: String(i) });
    }
    const { faltantes, foraDeOrdem } = verificarAspectosMinimos(componentes);
    assert.deepEqual(faltantes, [], 'os nove continuam presentes');
    assert.deepEqual(foraDeOrdem, [], 'a ordem relativa canônica é respeitada');
  });
});

// ---------------------------------------------------------------------------
// 4. G-SCHEMA e schema da LLM FECHADO (INV-05 / §12 D2)
// ---------------------------------------------------------------------------

describe('F0 — G-SCHEMA e schema da LLM fechado', () => {
  it('brief inválido perante BriefSchema produz erro que NOMEIA campo+motivo', async () => {
    const semAprovado = briefValido();
    delete semAprovado.aprovado;
    await assert.rejects(
      gerarBrief({ callLlm: transporteFake(jsonDe(semAprovado)).callLlm, assunto: 'x', atomos: atomosFake() }),
      (erro: unknown) => {
        const e = erro as FaseF0Error;
        assert.equal(e.code, 'BRIEF_SCHEMA_INVALIDO');
        assert.match(e.message, /"aprovado"/, 'campo nomeado');
        assert.match(e.message, /Required/i, 'motivo nomeado');
        return true;
      },
    );
  });

  it('draft da LLM com campo de TETO DE AULAS é REJEITADO nomeando o campo (D2 — contagem é SAÍDA)', async () => {
    for (const chaveTeto of ['teto_de_aulas', 'quantidade_maxima_de_aulas']) {
      await assert.rejects(
        gerarBrief({
          callLlm: transporteFake(jsonDe(briefValido({ [chaveTeto]: 12 }))).callLlm,
          assunto: 'x',
          atomos: atomosFake(),
        }),
        (erro: unknown) => {
          const e = erro as FaseF0Error;
          assert.equal(e.code, 'BRIEF_CAMPO_DESCONHECIDO');
          assert.equal(e.campo, chaveTeto);
          assert.match(e.message, new RegExp(chaveTeto));
          assert.match(e.message, /SAÍDA da geração/, 'a mensagem ancora a regra D2');
          return true;
        },
      );
    }
  });

  it('campo extra na máquina nocional também é REJEITADO (schema da LLM fechado)', () => {
    assert.throws(
      () => validarNotionalMachine(maquinaValida({ teto_de_aulas: 12 })),
      (erro: unknown) => {
        const e = erro as FaseF0Error;
        assert.equal(e.code, 'NOTIONAL_CAMPO_DESCONHECIDO');
        assert.equal(e.campo, 'teto_de_aulas');
        return true;
      },
    );
  });

  it('conteúdo da LLM que não é JSON vira erro estruturado nomeando a etapa', async () => {
    await assert.rejects(
      gerarBrief({ callLlm: transporteFake('isto não é um JSON').callLlm, assunto: 'x', atomos: atomosFake() }),
      (erro: unknown) => {
        const e = erro as FaseF0Error;
        assert.equal(e.code, 'BRIEF_DRAFT_NAO_JSON');
        assert.match(e.message, new RegExp(ETAPA_BRIEF));
        return true;
      },
    );
  });

  it('fences ```json em volta do draft são toleradas (determinístico)', async () => {
    const embrulhado = `\`\`\`json\n${jsonDe(briefValido())}\n\`\`\``;
    const { brief } = await gerarBrief({
      callLlm: transporteFake(embrulhado).callLlm,
      assunto: 'x',
      atomos: atomosFake(),
    });
    assert.equal(brief.tema, 'JavaScript do zero');
  });

  it('falha do transporte (LLM indisponível) PROPAGA LlmStageError estruturado — fail-closed (INV-03)', async () => {
    const callLlmQueFalha: EngineLlm['callLlm'] = async () => {
      throw new LlmStageError({
        code: DEEPSEEK_ERROR_CODES.KEY_MISSING,
        etapa: ETAPA_BRIEF,
        message: 'chave de API não configurada.',
        attempts: 1,
        retried: 0,
      });
    };
    await assert.rejects(
      gerarBrief({ callLlm: callLlmQueFalha, assunto: 'x', atomos: atomosFake() }),
      (erro: unknown) => erro instanceof LlmStageError && erro.code === DEEPSEEK_ERROR_CODES.KEY_MISSING,
    );
    await assert.rejects(
      gerarNotionalMachine({ callLlm: callLlmQueFalha }),
      (erro: unknown) => erro instanceof LlmStageError && erro.code === DEEPSEEK_ERROR_CODES.KEY_MISSING,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Integração com o vocabulário REAL (atoms.json do P-05)
// ---------------------------------------------------------------------------

describe('F0 — integração com o vocabulário real do P-05 (leitura de disco)', () => {
  it('carregarAtomos lê o atoms.json commitado e o axioma real passa no gate', () => {
    assert.ok(fs.existsSync(CAMINHO_ATOMOS_DEFAULT), 'o atoms.json commitado existe');
    const atomos = carregarAtomos();
    assert.ok(atomos.total > 1000, 'vocabulário real tem milhares de chaves');
    const chaves = chavesDoVocabulario(atomos);
    assert.ok(chaves.has('decl:let'));
    assert.ok(chaves.has('api:node:test'));
    // Axioma com chaves reais do vocabulário: o gate NÃO acusa falso.
    const brief = validarBrief(
      briefValido({ criterios_de_entrada: ['decl:let', 'api:node:test', 'op:binary:==='] }),
      atomos,
    );
    assert.equal(brief.politica_de_harness, 'receptive-seed', 'política EXPLÍCITA no artefato validado');
  });

  it('prompt do brief embute o contrato de política e o vocabulário anexo', () => {
    const prompt = promptF0Brief({ assunto: 'javascript do zero' });
    assert.match(prompt, /receptive-seed/);
    assert.match(prompt, /teto/, 'a proibição de teto de aulas está explícita');
    assert.match(prompt, /atoms\.json/);
    const schema = schemaBriefParaLlm();
    assert.match(schema, /additionalProperties":false/);
    assert.match(schema, /politica_de_harness/);
  });

  it('o LlmCallRequest entregue à fase carrega stageVersion e timeoutMs obrigatórios', async () => {
    // Captura NA FRONTEIRA da fase (o que a fase passa ao transporte), não no
    // cliente — o transporte transforma a requisição antes de chegar à rede.
    const requisicoes: LlmCallRequest[] = [];
    const client: DeepSeekClient = {
      async chatCompletion(_req: DeepSeekChatRequest): Promise<DeepSeekChatResponse> {
        return { content: jsonDe(briefValido()), model: 'fake' };
      },
    };
    const transporte = createCallLlm({ client, apiKey: async () => 'sk-fake' });
    const callLlm = async (etapa: string, req: LlmCallRequest) => {
      requisicoes.push(req);
      return transporte.callLlm(etapa, req);
    };
    await gerarBrief({ callLlm, assunto: 'x', atomos: atomosFake() });
    assert.equal(requisicoes.length, 1);
    assert.ok(requisicoes[0].stageVersion.length > 0, 'stageVersion OBRIGATÓRIO preenchido');
    assert.ok(requisicoes[0].timeoutMs > 0, 'timeoutMs OBRIGATÓRIO preenchido');
    assert.ok(requisicoes[0].schema !== undefined, 'schema da LLM presente na requisição');
  });
});