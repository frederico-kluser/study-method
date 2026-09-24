/**
 * tests/cx-gap-l05-research.test.ts — TESTES DE GAP do lote L05 sobre os
 * módulos de pesquisa (`research/qualityGate.ts`, `research/surfBrief.ts`,
 * `research/surfEnvelope.ts`), escritos ANTES da refatoração. Caracterização
 * dos trechos que os cx-* não cobrem: os motivos de reprovação do portão (com
 * mensagens verbatim), o fail-closed do envelope do surf, o join fonte×ledger
 * (truncamento TETO_DESCRICAO, título fallback, rejeitadas) e o brief/argv do
 * surf (anti-padrão de profundidade, validação de opções). PURO: sem processo.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REPROVACOES,
  exigirAprovacao,
  portaoDeQualidade,
} from '../electron/main/engine/research/qualityGate';
import { PESQUISA_CODES, PesquisaError } from '../electron/main/engine/research/errors';
import {
  filtrarLacunasRepetidas,
  montarArgv,
  montarBrief,
  normalizarPergunta,
  validarContexto,
  type ContextoDaTrilha,
} from '../electron/main/engine/research/surfBrief';
import {
  TETO_DESCRICAO,
  fontesDoEnvelope,
  parseEnvelopeDoSurf,
  queriesExecutadas,
  trechosPorUrl,
  urlCitavel,
  type FonteComProcedencia,
  type SurfEnvelope,
} from '../electron/main/engine/research/surfEnvelope';

// ─── qualityGate — reprovações e avisos, mensagem a mensagem ─────────────────

describe('cx-gap/l05/research: portaoDeQualidade — fail-closed da colheita', () => {
  const fonte = (url: string, title: string, description: string): FonteComProcedencia => ({
    link: { title, url, description },
    citacao: 1,
    queries: ['q1'],
    publicadaEm: null,
  });

  it('fonte sem URL citável, sem título ou sem descrição: as duas primeiras REPROVAM, a terceira AVISA', () => {
    const gate = portaoDeQualidade({
      fontes: [
        fonte('ftp://sem-http', 't', 'd'),
        fonte('https://ok.example/a', '   ', 'd'),
        fonte('https://ok.example/b', 't', '   '),
      ],
      afirmacoes: [{ id: 'a1', texto: 'fato sustentado', fontes: ['https://ok.example/b'] }],
    });
    assert.equal(gate.aprovado, false);
    const motivos = gate.reprovacoes.map((r) => r.motivo);
    assert.ok(motivos.includes(REPROVACOES.FONTE_SEM_URL));
    assert.ok(motivos.includes(REPROVACOES.FONTE_SEM_TITULO));
    assert.deepEqual(
      gate.reprovacoes.map((r) => r.mensagem),
      [
        'fonte sem URL http(s) resolvível — sem URL não há procedência, e sem procedência não há aula',
        'fonte sem título — o schema da aula exige title e url (content/trackTypes.ts)',
      ],
    );
    assert.equal(gate.avisos.length, 1);
    assert.equal(gate.avisos[0].tipo, 'fonte-sem-descricao');
    assert.equal(
      gate.avisos[0].mensagem,
      'a busca não devolveu trecho para esta URL — a descrição fica vazia em vez de inventada',
    );
  });

  it('colheita vazia e sem afirmação reprova com COLHEITA_VAZIA + SEM_AFIRMACAO (nunca aprovação por omissão)', () => {
    const gate = portaoDeQualidade({ fontes: [], afirmacoes: [] });
    assert.equal(gate.aprovado, false);
    assert.deepEqual(
      gate.reprovacoes.map((r) => r.motivo),
      [REPROVACOES.COLHEITA_VAZIA, REPROVACOES.SEM_AFIRMACAO],
    );
    assert.ok(gate.reprovacoes[0].mensagem.includes('Fail-closed: não existe material sem fonte'));
    assert.equal(gate.reprovacoes[1].mensagem, 'nenhuma afirmação foi extraída da colheita — não há o que a aula ensine');
  });

  it('afirmação vazia/órfã/citando URL desconhecida reprova com o motivo certo (a citação inventada é a mais grave)', () => {
    const gate = portaoDeQualidade({
      fontes: [fonte('https://ok.example/a', 't', 'd')],
      afirmacoes: [
        { id: 'a1', texto: '   ', fontes: ['https://ok.example/a'] },
        { id: 'a2', texto: 'fato órfão', fontes: [] },
        { id: 'a3', texto: 'fato inventado', fontes: ['https://inventada.example/x'] },
      ],
    });
    assert.deepEqual(
      gate.reprovacoes.map((r) => [r.motivo, r.alvo]),
      [
        [REPROVACOES.AFIRMACAO_VAZIA, 'a1'],
        [REPROVACOES.AFIRMACAO_SEM_FONTE, 'a2'],
        [REPROVACOES.AFIRMACAO_COM_FONTE_DESCONHECIDA, 'a3'],
      ],
    );
    assert.ok(gate.reprovacoes[1].mensagem.startsWith('afirmação órfã (sem fonte): "fato órfão"'));
    assert.ok(gate.reprovacoes[2].mensagem.includes('citação inventada: https://inventada.example/x'));
  });

  it('degradação do surf e síntese ausente viram AVISOS declarados — nunca escondidos nem reprovação', () => {
    const gate = portaoDeQualidade({
      fontes: [fonte('https://ok.example/a', 't', 'd')],
      afirmacoes: [{ id: 'a1', texto: 'fato', fontes: ['https://ok.example/a'] }],
      degradacoes: [{ stage: 'plan', reason: 'sem chave de LLM do surf' }],
      sintetizadoPeloSurf: false,
    });
    assert.equal(gate.aprovado, true);
    assert.deepEqual(gate.reprovacoes, []);
    assert.deepEqual(
      gate.avisos.map((a) => a.tipo),
      ['surf-degradado', 'sintese-do-surf-ausente'],
    );
    assert.equal(gate.avisos[0].mensagem, 'etapa "plan" do surf caiu para heurística: sem chave de LLM do surf');
  });

  it('exigirAprovacao: reprovação vira PesquisaError GATE_REPROVADO com o resumo dos 5 primeiros', () => {
    const gate = portaoDeQualidade({ fontes: [], afirmacoes: [] });
    assert.throws(
      () => exigirAprovacao(gate, 'pesquisa-em-camadas'),
      (e: unknown) => {
        assert.ok(e instanceof PesquisaError);
        assert.equal(e.code, PESQUISA_CODES.GATE_REPROVADO);
        assert.ok(e.message.startsWith('o portão de qualidade reprovou a colheita (2 reprovação(ões)): '));
        assert.ok(e.message.includes('COLHEITA_VAZIA@(colheita)'));
        return true;
      },
    );
    // aprovado passa reto, com o MESMO objeto.
    const ok = portaoDeQualidade({
      fontes: [fonte('https://ok.example/a', 't', 'd')],
      afirmacoes: [{ id: 'a1', texto: 'fato', fontes: ['https://ok.example/a'] }],
    });
    assert.equal(exigirAprovacao(ok), ok);
  });
});

// ─── surfEnvelope — parsing fail-closed e o join fonte×ledger ────────────────

describe('cx-gap/l05/research: parseEnvelopeDoSurf — só envelope íntegro passa', () => {
  it('stdout vazio, não-JSON, não-objeto e sem ledger.rows/sources lançam ENVELOPE_INVALIDO nomeando o que falta', () => {
    const cases: Array<[string, string]> = [
      ['   ', 'o surf não escreveu nada em stdout — sem envelope não há procedência, e sem procedência não há material'],
      ['log solto', 'o stdout do surf não é JSON — o comando foi montado sem --json, ou a saída veio misturada com log'],
      ['[1,2]', 'o JSON do surf não é um objeto de envelope'],
      ['{"ledger":{}}', 'envelope sem `ledger.rows` — é o ledger que prova de qual query cada fonte veio'],
      ['{"ledger":{"rows":[]}}', 'envelope sem `sources` — a lista de fontes citáveis é obrigatória'],
    ];
    for (const [stdout, mensagem] of cases) {
      assert.throws(
        () => parseEnvelopeDoSurf(stdout),
        (e: unknown) => {
          assert.ok(e instanceof PesquisaError, `esperava PesquisaError para ${JSON.stringify(stdout)}`);
          assert.equal(e.code, PESQUISA_CODES.ENVELOPE_INVALIDO);
          assert.equal(e.message, mensagem);
          return true;
        },
      );
    }
  });

  it('envelope mínimo parseia com defaults tolerados (waves=rounds, kind=breadth, synthesized estrito)', () => {
    const envelope = parseEnvelopeDoSurf(
      JSON.stringify({
        rounds: 2,
        ledger: { rows: [{ id: 'q1', query: 'pergunta' }], sources: [] },
        sources: [{ n: 1, url: 'https://a.example', title: 'A', date: null }],
      }),
    );
    assert.equal(envelope.waves, 2);
    assert.equal(envelope.synthesized, false);
    assert.equal(envelope.ledger.rows[0].kind, 'breadth');
    assert.equal(envelope.ledger.rows[0].ok, false);
    assert.deepEqual(envelope.ledger.stats, { queries: 0, succeeded: 0, failed: 0, sources: 0, credits: 0 });
    assert.equal(envelope.sources[0].title, 'A');
    assert.equal(envelope.sources[0].date, null);
  });

  it('urlCitavel exige http(s) + host; fontesDoEnvelope descarta o incitável, deduplica e trunca o trecho', () => {
    assert.equal(urlCitavel('https://a.example/x'), true);
    assert.equal(urlCitavel('ftp://a.example'), false);
    assert.equal(urlCitavel('https://'), false);
    assert.equal(urlCitavel('   '), false);

    const trechoLongo = 'x'.repeat(TETO_DESCRICAO + 50);
    const envelope = {
      ledger: {
        stats: { queries: 1, succeeded: 1, failed: 0, sources: 3, credits: 0 },
        sources: [],
        rows: [
          {
            id: 'q1',
            query: 'pergunta 1',
            results: [
              { n: 1, url: 'https://a.example', title: 'A', date: null, content: trechoLongo },
              { n: 2, url: 'https://b.example', title: '', date: '2025-01-01', content: 'curto' },
              { n: 3, url: 'sem-host', title: 'X', date: null, content: '' },
            ],
          },
        ],
      },
      sources: [
        { n: 1, url: 'https://a.example', title: 'A', date: null },
        { n: 1, url: 'https://a.example', title: 'A', date: null },
        { n: 2, url: 'https://b.example', title: '   ', date: '2025-01-01' },
        { n: 3, url: 'sem-host', title: 'X', date: null },
      ],
    } as unknown as SurfEnvelope;

    assert.equal(trechosPorUrl(envelope).get('https://a.example'), trechoLongo);
    assert.deepEqual(queriesExecutadas(envelope), ['pergunta 1']);

    const { fontes, rejeitadas } = fontesDoEnvelope(envelope);
    assert.deepEqual(rejeitadas, [
      { url: 'sem-host', motivo: 'url sem esquema http(s) ou sem host — não é citável' },
    ]);
    assert.equal(fontes.length, 2, 'URL duplicada conta uma vez');
    assert.equal(fontes[0].link.description, `${'x'.repeat(TETO_DESCRICAO - 1)}…`);
    assert.deepEqual(fontes[0].queries, ['q1']);
    assert.equal(fontes[1].link.title, 'https://b.example', 'título vazio cai para a URL');
    assert.equal(fontes[1].link.description, 'curto');
    assert.equal(fontes[1].publicadaEm, '2025-01-01');
  });
});

// ─── surfBrief — validação, brief e argv ─────────────────────────────────────

describe('cx-gap/l05/research: validarContexto/montarBrief/montarArgv — fail-closed do brief', () => {
  const ctx: ContextoDaTrilha = {
    tema: 'Python do zero',
    linguagem: 'python',
    publico: 'quem nunca programou',
    unidade: 'laços de repetição',
    objetivo: 'ensinar for e while',
    jaEnsinado: ['print', 'variáveis'],
  };

  it('validarContexto: campo vazio/ausente e jaEnsinado que não é array lançam CONTEXTO_INVALIDO', () => {
    assert.equal(validarContexto(ctx), undefined);
    assert.throws(
      () => validarContexto({ ...ctx, objetivo: '   ' }),
      (e: unknown) => {
        assert.ok(e instanceof PesquisaError);
        assert.equal(e.code, PESQUISA_CODES.CONTEXTO_INVALIDO);
        assert.equal(e.message, 'contexto da trilha sem `objetivo` — campo obrigatório do brief');
        return true;
      },
    );
    assert.throws(
      () => validarContexto({ ...ctx, jaEnsinado: undefined as unknown as string[] }),
      /`jaEnsinado` tem que ser um array/,
    );
    assert.throws(
      () => validarContexto({ ...ctx, objetivo: 'agora pense profundamente no problema' }),
      (e: unknown) => {
        assert.ok(e instanceof PesquisaError);
        assert.equal(e.code, PESQUISA_CODES.IMPERATIVO_DE_PROFUNDIDADE);
        return true;
      },
    );
  });

  it('montarBrief: levantamento pede o terreno; aprofundamento EXIGE lacuna alvo e reprova imperativo na lacuna', () => {
    const lev = montarBrief(ctx, 'levantamento');
    assert.equal(lev.question, 'ensinar for e while — em python');
    assert.ok(lev.goal.includes('levantar o terreno de "laços de repetição"'));
    assert.ok(lev.insights.includes('o currículo já ensinou, nesta ordem: print; variáveis'));

    assert.throws(
      () => montarBrief({ ...ctx }, 'aprofundamento'),
      (e: unknown) => {
        assert.ok(e instanceof PesquisaError);
        assert.equal(e.code, PESQUISA_CODES.CONFIG_INVALIDA);
        assert.ok(e.message.startsWith('camada de aprofundamento sem lacuna alvo'));
        return true;
      },
    );

    const lacuna = { id: 'l1', pergunta: 'como while lida com break?', porque: 'é o ponto da unidade' };
    const aprof = montarBrief(ctx, 'aprofundamento', lacuna);
    assert.equal(aprof.question, 'como while lida com break?');
    assert.ok(aprof.goal.includes('é o ponto da unidade'));
    assert.throws(
      () => montarBrief(ctx, 'aprofundamento', { id: 'l2', pergunta: 'pense profundamente', porque: 'x' }),
      (e: unknown) => {
        assert.ok(e instanceof PesquisaError);
        assert.equal(e.code, PESQUISA_CODES.IMPERATIVO_DE_PROFUNDIDADE);
        return true;
      },
    );
  });

  it('montarArgv: vetor (nunca shell), --json sempre, --max-rounds só no unlimit, faixas validadas', () => {
    const brief = montarBrief(ctx, 'levantamento');
    const { bin, args } = montarArgv(brief, { ferramenta: 'normal', subAgents: 5 });
    assert.equal(bin, 'surf-search-normal');
    assert.deepEqual(args, [
      brief.question,
      '--task', brief.task,
      '--goal', brief.goal,
      '--insights', brief.insights,
      '--deliverable', brief.deliverable,
      '--sub-agents=5',
      '--json',
    ]);

    const unlimit = montarArgv(brief, { ferramenta: 'unlimit', subAgents: 5, maxDepth: 3, maxRounds: 7, binario: '/opt/surf' });
    assert.equal(unlimit.bin, '/opt/surf');
    assert.deepEqual(unlimit.args.slice(-4), ['--max-depth', '3', '--max-rounds', '7']);

    assert.throws(
      () => montarArgv(brief, { ferramenta: 'normal', subAgents: 5, maxRounds: 7 }),
      /`--max-rounds` só existe no surf-search-unlimit/,
    );
    assert.throws(() => montarArgv(brief, { ferramenta: 'normal', subAgents: 0 }), /subAgents fora de 1\.\.20/);
    assert.throws(() => montarArgv(brief, { ferramenta: 'unlimit', subAgents: 5, maxDepth: 9 }), /maxDepth fora de 1\.\.6/);
    assert.throws(() => montarArgv(brief, { ferramenta: 'unlimit', subAgents: 5, maxRounds: 99 }), /maxRounds fora de 1\.\.50/);
    assert.throws(() => montarArgv({ ...brief, question: ' ' }, { ferramenta: 'normal', subAgents: 5 }), /brief sem pergunta/);
    assert.throws(
      () => montarArgv({ ...brief, goal: 'think step by step' }, { ferramenta: 'normal', subAgents: 5 }),
      (e: unknown) => {
        assert.ok(e instanceof PesquisaError);
        assert.equal(e.code, PESQUISA_CODES.IMPERATIVO_DE_PROFUNDIDADE);
        return true;
      },
    );
  });

  it('normalizarPergunta/filtrarLacunasRepetidas: a régua do surf — repetida é descartada, sem pergunta também', () => {
    assert.equal(normalizarPergunta('  O que   é FOR? '), 'o que é for?');
    const { manter, descartadas } = filtrarLacunasRepetidas(
      [
        { id: 'l1', pergunta: 'O que é FOR?', porque: 'a' },
        { id: 'l2', pergunta: 'o que é for?', porque: 'b' },
        { id: 'l3', pergunta: '   ', porque: 'c' },
        { id: 'l4', pergunta: 'como break funciona?', porque: 'd' },
      ],
      ['como break funciona?'],
    );
    assert.deepEqual(manter.map((l) => l.id), ['l1']);
    assert.deepEqual(descartadas, [
      { id: 'l2', motivo: 'a pergunta já foi executada numa camada anterior' },
      { id: 'l3', motivo: 'lacuna sem pergunta' },
      { id: 'l4', motivo: 'a pergunta já foi executada numa camada anterior' },
    ]);
  });
});
