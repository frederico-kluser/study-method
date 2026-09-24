/**
 * tests/cx-services-review-loop.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/review/loop.ts` (o laço F11) ANTES da refatoração de core/services.
 *
 * Fixa as constantes do §6.6, as primitivas puras (score_erro, parada 0
 * mecânica, proxy Jaccard/distância, hash do conjunto, aplicarDelta), o teto
 * CLAMPED de rodadas, a sessão (quota de sugestões) e a API pública em modo
 * fail-closed (RODADAS_ESGOTADAS, verificador ausente, roteamento inválido,
 * LLM fora ⇒ ErroEstruturadoDoLaco — nunca aprovação por omissão).
 * SEM LLM/rede: revisor/planejador/corretor são fakes; verificadores injetados.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractAtoms } from '../electron/main/engine/extract';
import type { Apontamento } from '../electron/main/engine/review/actionCatalog';
import type { ProverDeDesafio } from '../electron/main/engine/review/prover';
import {
  ErroEstruturadoDoLaco,
  LIMIAR_DEFAULT_DE_ESTAGNACAO,
  QUOTA_DE_SUGESTOES_POR_ARTEFATO,
  RODADAS_DEFAULT,
  TETO_DE_RODADAS,
  TOLERANCIA_DEFAULT_DE_ROLLBACK,
  TIMEOUT_DEFAULT_DE_EXECUCAO_MS,
  aplicarDelta,
  avaliarParadaMecanica,
  calcularRodadasMaximas,
  criarSessaoDeRevisao,
  criarVerificadorDeOrcamento,
  criarVerificadorDeProvas,
  distanciaDeArtefatos,
  hashDoConjunto,
  jaccardNormalizado,
  rodarLacoDeRevisao,
  rodarRodadaDeRevisao,
  scoreErro,
  type ArtefatoNoLaco,
  type ContextoDoLaco,
  type ViolacaoMecanica,
} from '../electron/main/engine/review/loop';

// ─── constantes (§6.6) ───────────────────────────────────────────────────────

describe('cx/reviewLoop: constantes do laço (golden master × docs/16 §6)', () => {
  it('rodadas: default 1, teto duro 3; rollback 0,10; estagnação 0,06; exec 30s; quota 3', () => {
    assert.equal(RODADAS_DEFAULT, 1);
    assert.equal(TETO_DE_RODADAS, 3);
    assert.equal(TOLERANCIA_DEFAULT_DE_ROLLBACK, 0.1);
    assert.equal(LIMIAR_DEFAULT_DE_ESTAGNACAO, 0.06);
    assert.equal(TIMEOUT_DEFAULT_DE_EXECUCAO_MS, 30_000);
    assert.equal(QUOTA_DE_SUGESTOES_POR_ARTEFATO, 3);
  });
});

// ─── primitivas puras ────────────────────────────────────────────────────────

describe('cx/reviewLoop: scoreErro e avaliarParadaMecanica', () => {
  it('score = 3×orç + 3×testes + 2×pins + 1×corrigir (os pesos do §6.6)', () => {
    assert.equal(scoreErro(0, 0, 0, 0), 0);
    assert.equal(scoreErro(1, 2, 3, 4), 3 + 6 + 6 + 4);
    assert.equal(scoreErro(0, 0, 0, 5), 5);
  });

  it('parada 0 é MECÂNICA: só com os quatro contadores em zero (aprovação do revisor não é argumento)', () => {
    const zero = {
      violacoesOrcamento: 0,
      testesFalhando: 0,
      pinsFalhando: 0,
      apontamentosBloqueantesOuCorrigir: 0,
    };
    assert.equal(avaliarParadaMecanica(zero), true);
    for (const chave of Object.keys(zero) as Array<keyof typeof zero>) {
      assert.equal(
        avaliarParadaMecanica({ ...zero, [chave]: 1 }),
        false,
        `${chave}=1 deve impedir a parada 0`,
      );
    }
    assert.equal(avaliarParadaMecanica({ ...zero, apontamentosBloqueantesOuCorrigir: -0 }), true);
  });
});

describe('cx/reviewLoop: proxy de distância (Jaccard — nunca embedding)', () => {
  it('jaccardNormalizado: 1 idêntico/dois vazios; 0 disjunto; fração no parcial (tokens minúsculas)', () => {
    assert.equal(jaccardNormalizado('', ''), 1);
    assert.equal(jaccardNormalizado('a b c', 'a b c'), 1);
    assert.equal(jaccardNormalizado('a', 'b'), 0);
    assert.equal(jaccardNormalizado('a b', 'a b c'), 2 / 3);
    assert.equal(jaccardNormalizado('A, B!', 'a b'), 1, 'tokenização minúscula sem pontuação');
  });

  it('distanciaDeArtefatos: 0 sem mudanças; 1 para artefato que some/aparece; média sobre os pares', () => {
    const a = new Map([['x', 'um dois tres'], ['y', 'mesmo']]);
    assert.equal(distanciaDeArtefatos(new Map(), new Map()), 1, 'conjunto vazio ⇒ 1');
    assert.equal(distanciaDeArtefatos(a, a), 0);
    assert.equal(distanciaDeArtefatos(a, new Map([['x', 'um dois tres']])), 0.5, 'y sumiu (1) + x igual (0)');
    assert.equal(distanciaDeArtefatos(new Map([['x', 'a b']]), new Map([['z', 'a b']])), 1, 'trocou de caminho');
  });

  it('hashDoConjunto: identidade de CONTEÚDO (ordem do mapa não importa; byte diferente muda)', () => {
    const um: ArtefatoNoLaco = { caminho: 'a', nome: 'a', conteudo: 'CONTEUDO 1', ultimaEdicao: -1 };
    const dois: ArtefatoNoLaco = { caminho: 'b', nome: 'b', conteudo: 'CONTEUDO 2', ultimaEdicao: -1 };
    const h1 = hashDoConjunto(new Map([['a', um], ['b', dois]]));
    const h2 = hashDoConjunto(new Map([['b', dois], ['a', um]]));
    const h3 = hashDoConjunto(new Map([['a', um], ['b', { ...dois, conteudo: 'OUTRO' }]]));
    assert.equal(h1, h2, 'ordem de inserção irrelevante');
    assert.notEqual(h1, h3, 'conteúdo diferente ⇒ hash diferente');
    assert.ok(h1.length > 0);
  });

  it('aplicarDelta: trechos aplicados do fim para o começo (índices preservados)', () => {
    assert.equal(aplicarDelta('abcdef', [{ inicio: 1, fim: 3, substituicao: 'XY' }]), 'aXYdef');
    assert.equal(
      aplicarDelta('abcdef', [
        { inicio: 1, fim: 3, substituicao: 'XY' },
        { inicio: 4, fim: 6, substituicao: 'Z' },
      ]),
      'aXYdZ',
      'dois trechos sem sobreposição',
    );
    assert.equal(aplicarDelta('abc', []), 'abc');
  });
});

describe('cx/reviewLoop: calcularRodadasMaximas (clamp do §6.6)', () => {
  it('default 1; abaixo de 1 vira 1; acima do teto vira 3; fracionário faz floor', () => {
    assert.equal(calcularRodadasMaximas({} as ContextoDoLaco), 1);
    assert.equal(calcularRodadasMaximas({ rodadasMaximas: 2 } as ContextoDoLaco), 2);
    assert.equal(calcularRodadasMaximas({ rodadasMaximas: 0 } as ContextoDoLaco), 1);
    assert.equal(calcularRodadasMaximas({ rodadasMaximas: -5 } as ContextoDoLaco), 1);
    assert.equal(calcularRodadasMaximas({ rodadasMaximas: 2.9 } as ContextoDoLaco), 2);
    assert.equal(calcularRodadasMaximas({ rodadasMaximas: 99 } as ContextoDoLaco), 3, 'teto duro');
  });
});

// ─── verificadores determinísticos default ───────────────────────────────────

describe('cx/reviewLoop: criadores de verificador (orçamento por AST × provas)', () => {
  it('orçamento: superfície ausente ou código que não parseia NÃO acusa (declarado)', () => {
    const snapshot = {
      ref: 'ref-1',
      surfaces: [
        { superficie: 'solutionCode', caminho: 'a.json', faixa: 'productive' as const, permitidos: [] as readonly string[] },
      ],
      primeiroEnsina: {},
    };
    const verificar = criarVerificadorDeOrcamento(snapshot);
    assert.deepEqual(verificar(new Map()), [], 'artefato ausente ⇒ sem acusação');
    assert.deepEqual(
      verificar(new Map([['a.json', { caminho: 'a.json', nome: 'a', conteudo: '{quebrado', ultimaEdicao: -1 }]])),
      [],
      'parse quebrado é erro de build (§5.3), não violação de orçamento',
    );
  });

  it('orçamento: construção fora do permitido vira ViolacaoMecanica com o "primeiroEnsina" do snapshot', async () => {
    const codigo = 'export const f = (a, b) => a + b;';
    const extraido = extractAtoms(codigo, { fileName: 'solution.mjs' });
    assert.ok(extraido.ok);
    const chaves = [...extraido.keys];
    assert.ok(chaves.length > 0, 'a fixture precisa ter ao menos 1 átomo');

    const snapshot = {
      ref: 'ref-1',
      surfaces: [
        {
          superficie: 'solutionCode',
          caminho: 'a.json',
          faixa: 'productive' as const,
          // NENHUMA chave permitida ⇒ todo átomo é violação.
          permitidos: [] as readonly string[],
        },
      ],
      primeiroEnsina: { [chaves[0]]: 'aula-01-introducao' },
    };
    const verificar = criarVerificadorDeOrcamento(snapshot);
    const violacoes = await verificar(
      new Map([['a.json', { caminho: 'a.json', nome: 'a', conteudo: codigo, ultimaEdicao: -1 }]]),
    );
    assert.equal(violacoes.length, chaves.length);
    const v = violacoes.find((x) => x.construcao === chaves[0]) as ViolacaoMecanica;
    assert.ok(v);
    assert.equal(v.tipo, 'orcamento');
    assert.equal(v.surface, 'solutionCode');
    assert.equal(v.caminho, 'a.json');
    assert.equal(v.primeiraAulaQueEnsina, 'aula-01-introducao', 'distinção ordem × lacuna preservada');
    assert.ok(v.mensagem.includes('fora do orçamento productive da superfície solutionCode (ref ref-1)'));

    // com TUDO permitido, silêncio total.
    const generoso = criarVerificadorDeOrcamento({
      ...snapshot,
      surfaces: [{ ...snapshot.surfaces[0], permitidos: chaves }],
    });
    assert.deepEqual(
      await generoso(new Map([['a.json', { caminho: 'a.json', nome: 'a', conteudo: codigo, ultimaEdicao: -1 }]])),
      [],
    );
  });

  it('provas: artefato que NÃO é desafio executável pula sem chamar o provador (declarado)', async () => {
    let chamado = 0;
    const prover: ProverDeDesafio = (async () => {
      chamado += 1;
      return { valid: true, failures: [] };
    }) as unknown as ProverDeDesafio;
    const verificar = criarVerificadorDeProvas(prover);
    const violacoes = await verificar(
      new Map([['a.json', { caminho: 'a.json', nome: 'a', conteudo: '{"qualquer":"coisa"}', ultimaEdicao: -1 }]]),
    );
    assert.deepEqual(violacoes, []);
    assert.equal(chamado, 0);
  });
});

// ─── sessão ──────────────────────────────────────────────────────────────────

describe('cx/reviewLoop: criarSessaoDeRevisao (estado vivo + quota de sugestões)', () => {
  function ctxMinimo(): ContextoDoLaco {
    return {
      trilha: 'trilha-x',
      artefatos: [{ caminho: 'a.json', nome: 'desafio', conteudo: 'CONTEUDO', ultimaEdicao: -1 }],
      verificadorDeOrcamento: () => [],
      verificadorDeProvas: () => [],
      proverDesafio: (async () => ({ valid: true, failures: [] })) as unknown as ProverDeDesafio,
      llm: {
        revisar: async () => ({ apontamentos: [] }),
        planejar: async () => ({ acoes: [] }),
        corrigir: async () => ({ rejeitado: false as const, delta: [] }),
      },
      modeloAutor: 'autor-model',
      modeloRevisor: 'revisor-model',
    } as unknown as ContextoDoLaco;
  }

  it('estado inicial: rodada 0, 1 hash/estado, históricos vazios e artefatos em CÓPIA', () => {
    const ctx = ctxMinimo();
    const sessao = criarSessaoDeRevisao(ctx);
    assert.equal(sessao.rodadaAtual, 0);
    assert.equal(sessao.hashes.length, 1);
    assert.equal(sessao.estados.length, 1);
    assert.deepEqual(sessao.distancias, []);
    assert.deepEqual(sessao.bloqueantesPorRodada, []);
    assert.equal(sessao.apontamentosCorrigirAnterior, 0);
    assert.equal(sessao.sugestoesDescartadasPorQuota, 0);
    // cópia: mexer na sessão não toca a entrada.
    sessao.artefatos.get('a.json')!.conteudo = 'MUDOU';
    assert.equal(ctx.artefatos[0].conteudo, 'CONTEUDO');
  });

  it('guardarSugestao: quota 3 por artefato, id repetido NÃO consome quota, o 4º distinto é descartado COM contagem', () => {
    const sessao = criarSessaoDeRevisao(ctxMinimo());
    const sug = (id: string): Apontamento => ({ id }) as unknown as Apontamento;

    assert.equal(sessao.guardarSugestao('a.json', sug('s1')), true);
    assert.equal(sessao.guardarSugestao('a.json', sug('s2')), true);
    assert.equal(sessao.guardarSugestao('a.json', sug('s3')), true);
    // mesmo id de novo ⇒ true e NÃO consome quota.
    assert.equal(sessao.guardarSugestao('a.json', sug('s1')), true);
    assert.equal(sessao.sugestoesDescartadasPorQuota, 0);
    // 4ª DISTINTA ⇒ descartada com contagem registrada (fail-closed declarado).
    assert.equal(sessao.guardarSugestao('a.json', sug('s4')), false);
    assert.equal(sessao.sugestoesDescartadasPorQuota, 1);
    assert.equal(sessao.sugestoesPorArtefato.get('a.json')!.length, 3);
    // quota é POR ARTEFATO.
    assert.equal(sessao.guardarSugestao('outro.json', sug('s5')), true);
    assert.equal(sessao.sugestoesDescartadasPorQuota, 1);
  });
});

// ─── API pública: fail-closed e o teto de rodadas ────────────────────────────

describe('cx/reviewLoop: guardas fail-closed da API pública', () => {
  function ctxMinimo(over: Record<string, unknown> = {}): ContextoDoLaco {
    return {
      trilha: 'trilha-x',
      artefatos: [{ caminho: 'a.json', nome: 'desafio', conteudo: '{}', ultimaEdicao: -1 }],
      verificadorDeOrcamento: async () => [],
      verificadorDeProvas: async () => [],
      proverDesafio: (async () => ({ valid: true, failures: [] })) as unknown as ProverDeDesafio,
      llm: {
        revisar: async () => ({ apontamentos: [] }),
        planejar: async () => ({ acoes: [] }),
        corrigir: async () => ({ rejeitado: false as const, delta: [] }),
      },
      modeloAutor: 'autor-model',
      modeloRevisor: 'revisor-model',
      ...over,
    } as unknown as ContextoDoLaco;
  }

  function erroDe(p: Promise<unknown>): Promise<ErroEstruturadoDoLaco> {
    return p.then(
      () => {
        throw new Error('esperava ErroEstruturadoDoLaco e veio sucesso');
      },
      (e: unknown) => {
        assert.ok(e instanceof ErroEstruturadoDoLaco, `esperava erro estruturado, veio ${String(e)}`);
        return e;
      },
    );
  }

  it('RODADAS_ESGOTADAS: nenhuma superfície pública roda além de rodadasMaximas', async () => {
    const ctx = ctxMinimo({ rodadasMaximas: 1 });
    const sessao = criarSessaoDeRevisao(ctx);
    const rodada = await rodarRodadaDeRevisao(ctx, sessao);
    assert.equal(rodada.rodada, 1);
    // a PRÓXIMA rodada estaria além do teto.
    const erro1 = await erroDe(rodarRodadaDeRevisao(ctx, sessao));
    assert.equal(erro1.codigo, 'RODADAS_ESGOTADAS');
    assert.equal(erro1.etapa, 'laco');
    assert.ok(erro1.message.includes('teto duro 3'));
    // o laço com a MESMA sessão já esgotada também recusa (imediato, sem rodar).
    const erro2 = await erroDe(rodarLacoDeRevisao(ctx, sessao));
    assert.equal(erro2.codigo, 'RODADAS_ESGOTADAS');
  });

  it('sem verificador de orçamento/provas ⇒ erro estruturado nomeando o gate que falta', async () => {
    const semOrcamento = ctxMinimo({ verificadorDeOrcamento: undefined, snapshotDeOrcamento: undefined });
    const e1 = await erroDe(rodarRodadaDeRevisao(semOrcamento));
    assert.equal(e1.codigo, 'LACO_SEM_VERIFICADOR_DE_ORCAMENTO');
    assert.equal(e1.etapa, 'verificacao');

    const semProvas = ctxMinimo({
      verificadorDeProvas: undefined,
      proverDesafio: undefined as unknown as ProverDeDesafio,
    });
    const e2 = await erroDe(rodarRodadaDeRevisao(semProvas));
    assert.equal(e2.codigo, 'LACO_SEM_VERIFICADOR_DE_PROVAS');
  });

  it('roteamento inválido (autor === revisor) LANÇA antes da revisão (P-12, fail-closed)', async () => {
    const ctx = ctxMinimo({ modeloRevisor: 'autor-model' });
    const e = await erroDe(rodarRodadaDeRevisao(ctx));
    assert.equal(e.codigo, 'LACO_ROTEAMENTO_INVALIDO');
    assert.equal(e.etapa, 'roteamento');
    assert.ok(e.message.includes('não pode ser o mesmo modelo do autor'));
  });

  it('LLM fora (revisor lança) ⇒ ErroEstruturadoDoLaco — NUNCA aprovação por omissão', async () => {
    const ctx = ctxMinimo({
      llm: {
        revisar: async () => {
          throw Object.assign(new Error('LLM fora do ar'), { code: 'LLM_KEY_MISSING' });
        },
        planejar: async () => ({ acoes: [] }),
        corrigir: async () => ({ rejeitado: false as const, delta: [] }),
      },
    });
    const e = await erroDe(rodarRodadaDeRevisao(ctx));
    assert.equal(e.codigo, 'LLM_KEY_MISSING', 'o code do transporte é preservado');
    assert.equal(e.etapa, 'revisor:unico');
    assert.equal(e.message, 'LLM fora do ar');
    assert.ok(e.causa instanceof Error, 'a causa original acompanha o erro estruturado');
  });
});

describe('cx/reviewLoop: rodarRodadaDeRevisao / rodarLacoDeRevisao (fluxo observável)', () => {
  function ctxCom(over: Record<string, unknown>): ContextoDoLaco {
    return {
      trilha: 'trilha-x',
      artefatos: [{ caminho: 'a.json', nome: 'desafio', conteudo: '{}', ultimaEdicao: -1 }],
      verificadorDeOrcamento: async () => [],
      verificadorDeProvas: async () => [],
      proverDesafio: (async () => ({ valid: true, failures: [] })) as unknown as ProverDeDesafio,
      llm: {
        revisor: undefined,
        revisar: async () => ({ apontamentos: [] }),
        planejar: async () => {
          throw new Error('planejador não deveria ser chamado sem apontamentos');
        },
        corrigir: async () => {
          throw new Error('corretor não deveria ser chamado sem apontamentos');
        },
      },
      modeloAutor: 'autor-model',
      modeloRevisor: 'revisor-model',
      ...over,
    } as unknown as ContextoDoLaco;
  }

  it('tudo verde ⇒ parada 0 MECÂNICA: acessado=true e NENHUMA aprovação de revisor entra na conta', async () => {
    const resultado = await rodarLacoDeRevisao(ctxCom({}));
    assert.equal(resultado.acessado, true);
    assert.equal(resultado.paradaFinal, 'mecanico');
    assert.equal(resultado.escalada, null);
    assert.equal(resultado.scoreFinal, 0);
    assert.equal(resultado.rodadas.length, 1);

    const r = resultado.rodadas[0];
    assert.equal(r.rodada, 1);
    assert.equal(r.revisorChamado, true);
    assert.equal(r.temViolacaoMecanica, false);
    assert.equal(r.parada, 'mecanico');
    assert.deepEqual(r.plano, []);
    assert.deepEqual(r.correcoes, []);
    assert.deepEqual(r.defeitosDoCatalogo, []);
    assert.deepEqual(r.apontamentosMecanicos, []);
    assert.equal(resultado.artefatosFinais.length, 1);
  });

  it('violação mecânica SEGURA o revisor (não é chamado) e vira apontamento MEC-0001 bloqueante', async () => {
    const violacao: ViolacaoMecanica = {
      caminho: 'a.json',
      surface: 'solutionCode',
      construcao: 'op:binary:+',
      tipo: 'orcamento',
      inicio: 0,
      fim: 2,
      linha: 1,
      coluna: 1,
      trechoOfensor: 'a + b',
      primeiraAulaQueEnsina: null,
      mensagem: 'construção op:binary:+ fora do orçamento',
    };
    let revisorChamado = 0;
    const resultado = await rodarLacoDeRevisao(
      ctxCom({
        verificadorDeOrcamento: async () => [violacao],
        llm: {
          revisar: async () => {
            revisorChamado += 1;
            return { apontamentos: [] };
          },
          planejar: async () => ({ acoes: [] }),
          corrigir: async () => ({ rejeitado: false as const, delta: [] }),
        },
      }),
      undefined,
    );
    assert.equal(revisorChamado, 0, 'com violação mecânica o REVISOR LLM não é chamado (defeito já localizado)');
    const r = resultado.rodadas[0];
    assert.equal(r.temViolacaoMecanica, true);
    assert.equal(r.revisorChamado, false);
    assert.equal(r.apontamentosMecanicos.length, 1);
    assert.equal(r.apontamentosMecanicos[0].id, 'MEC-0001');
    assert.equal(r.apontamentosMecanicos[0].severity, 'bloqueante');
    assert.equal(r.apontamentosMecanicos[0].categoria, 'construcao_nao_ensinada');
    assert.ok(r.apontamentosMecanicos[0].evidencia.reproduzivel_por.startsWith('mecanico:'));
    // sem convergir na rodada final ⇒ FAILSAFE com placar (nunca aceita por cansaço).
    assert.equal(resultado.acessado, false);
    assert.equal(resultado.paradaFinal, 'failsafe');
    assert.ok(resultado.escalada);
    assert.equal(resultado.escalada?.quality_warning, true);
  });

  it('estado persistente idêntico por 2 rodadas ⇒ ESTAGNA (anti-oscilação) — for limitado, nunca while', async () => {
    const violacao: ViolacaoMecanica = {
      caminho: 'a.json',
      surface: 'solutionCode',
      construcao: 'x',
      tipo: 'orcamento',
      inicio: 0,
      fim: 1,
      linha: 1,
      coluna: 1,
      trechoOfensor: 'x',
      primeiraAulaQueEnsina: null,
      mensagem: 'violação persistente',
    };
    const resultado = await rodarLacoDeRevisao(
      ctxCom({ rodadasMaximas: 2, verificadorDeOrcamento: async () => [violacao] }),
    );
    // as duas rodadas rodam (for EXATAMENTE o teto clamped) e a cascata de
    // parada enquadra a 2ª como ESTAGNAÇÃO (distância 0 duas vezes, bloqueantes
    // sem queda — o proxy determinístico do §6.6).
    assert.equal(resultado.rodadas.length, 2, 'exatamente o teto clamped (2), nem mais nem menos');
    assert.deepEqual(
      resultado.rodadas.map((r) => r.rodada),
      [1, 2],
    );
    assert.equal(resultado.paradaFinal, 'estagnou');
    assert.equal(resultado.acessado, false);
  });
});
