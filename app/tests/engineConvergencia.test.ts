/**
 * tests/engineConvergencia.test.ts — o LAÇO DE CONVERGÊNCIA RECURSIVO
 * (`electron/main/engine/modes/convergencia.ts`).
 *
 * O que está sob teste, e por que cada caso existe:
 *
 *   C1 — TRILHA IDEAL → PONTO-FIXO NA ITERAÇÃO 1. Sem achado e sem mudança
 *        aplicada, o laço para na primeira volta com o único veredito que sai
 *        0. É o oráculo da cascata do §6.6: PONTO-FIXO é a condição 0, e ela
 *        nunca é "o revisor aprovou".
 *   C2 — AULA ACIMA DO TETO → ramo QUEBRA, com o plano de N aulas e os grupos
 *        PRESERVADOS. É o ramo (c) do pedido do dono ("tem que quebrar o
 *        conteúdo da aula problemática em mais conteúdos"), que até aqui só
 *        existia como conselho.
 *   C3 — VETOR QUE REPETE → CICLO, exit != 0. No modo `aplicar` sem nada
 *        aplicável, a segunda iteração mede o MESMO vetor: o hash repete e o
 *        laço PARA e ESCALA. É a prova de que "recursão sem fim" não é laço
 *        infinito.
 *   C4 — UM GRUPO DE CO-OCORRÊNCIA NUNCA É PARTIDO. A invariante mais forte do
 *        planejador: se três chaves saem da MESMA linha, não existe aula que
 *        ensine duas e não a terceira. O teste confere, para toda aula
 *        planejada, que cada grupo está INTEIRO em exatamente um pacote.
 *   C5 — AULA SEM DESAFIO → ramo PROVA, com a ação `ADD_TEST`. É o A20 em
 *        massa medido no `c-iniciante` (113 aulas sem desafio em 2026-09-22).
 *   C6 — O VETOR E A MEDIDA μ: componentes inteiras e não-negativas, hash
 *        estável e sensível, e a detecção de descida.
 *   C7 — DRY-RUN NÃO GRAVA CONTEÚDO, e GRAVA o ledger. A única escrita do
 *        dry-run é a linha do ledger — e ela é DECLARADA no `--help`, porque
 *        escrita não declarada é defeito.
 *
 * FIXTURES PRÓPRIAS, NUNCA PRODUÇÃO (a mesma convenção do
 * `tests/engineReorder.test.ts`): as trilhas são montadas EM MEMÓRIA, em
 * Python, e nenhuma fixture existente em `tests/fixtures/tracks/` é alterada.
 * Python (e não a linguagem default) porque é o caso REAL dos três cursos do
 * produto: a bateria A13–A16 é javascript-only, o `audit` a PULA declarando
 * `A13-A16-NAO-RODOU`, e quem responde pelo tamanho do passo é a barra A17–A23
 * — que é exatamente o que este laço orquestra.
 *
 * OFFLINE E DETERMINÍSTICO: nenhuma LLM, nenhuma rede, nenhuma chave, nenhum
 * subprocesso. `auditTrack` e `auditarBarra` são os REAIS sobre as fixtures; o
 * `git` e as versões de toolchain entram por dep injetada (fixas), porque um
 * teste que depende do commit da máquina não é determinístico.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import { auditTrack } from '../electron/main/engine/audit';
import { auditarBarra, REGRAS_DA_BARRA } from '../electron/main/engine/quality/barra';
import {
  COMPONENTES_DO_VETOR,
  RAMO_DA_BARRA,
  ErroDeConvergencia,
  algumaComponenteDesceu,
  classificarAchados,
  convergirTrilha,
  hashDoVetor,
  medirVetor,
  minimoDeSecoes,
  planejarQuebra,
  slugDaAulaDaQuebra,
  type AchadoClassificado,
  type DepsDaConvergencia,
  type PlanoDeQuebra,
  type VetorDeEstado,
} from '../electron/main/engine/modes/convergencia';
import { deriveTrackBudget } from '../electron/main/engine/budget';

// ---------------------------------------------------------------------------
// Fixtures — trilhas de Python EM MEMÓRIA (nenhum disco, nenhuma fixture tocada)
// ---------------------------------------------------------------------------

interface AulaDeFixture {
  slug: string;
  teoria: readonly TrackTheorySection[];
  desafios: readonly TrackChallengeSource[];
  introduces?: { productive: string[]; receptive: string[]; derived?: Array<{ chave: string; de: string }> };
  role?: string;
  targetAtom?: string;
}

/** Uma seção de teoria com um bloco cercado de Python — o que a barra lê. */
function secao(id: string, prosa: string, codigo: string): TrackTheorySection {
  return { id, title: `Secao ${id}`, markdown: `${prosa}\n\n\`\`\`python\n${codigo}\n\`\`\`\n` };
}

/** Um desafio de Python na forma stdout — a mesma do `trilha-python-minima`. */
function desafio(slug: string, solucao: string): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: `Desafio ${slug}`,
    concept: 'imprimir',
    difficulty: 1,
    language: 'python',
    statement: '# Desafio\n\nEscreva o programa.',
    starterCode: '# escreva aqui\n',
    solutionCode: solucao,
    testsCode:
      'import contextlib\nimport io\nimport runpy\nimport unittest\n\n\n' +
      'def rodar():\n    """Roda solucao.py e devolve o que ele imprimiu."""\n' +
      '    saida = io.StringIO()\n    with contextlib.redirect_stdout(saida):\n' +
      '        runpy.run_path("solucao.py")\n    return saida.getvalue()\n\n\n' +
      // O teste NAO pode cobrar construcao fora do orcamento de ENTRADA da aula
      // (A3): `len(...) >= 0` traria `global:len`, `node:Compare` e
      // `op:compare:>=` e reprovaria a propria fixture ideal. Comparar a saida
      // com ela mesma exercita so o harness, que e a semente receptiva.
      'class TestSaida(unittest.TestCase):\n    def test_imprime(self):\n' +
      '        """o programa imprime"""\n        self.assertEqual(rodar(), rodar())\n',
    expectedTestCount: 1,
  };
}

function fazerTrilha(slug: string, aulas: readonly AulaDeFixture[]): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug,
      title: 'Trilha de teste',
      description: 'fixture do laco de convergencia',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage: 'python',
      runtime: 'cpython-3.14',
      harnessLanguage: 'python',
      entryCriteria: [],
      modules: ['m01'],
    },
    modules: [
      {
        meta: {
          schemaVersion: 1,
          slug: 'm01',
          title: 'Modulo um',
          order: 1,
          lessons: aulas.map((a) => a.slug),
        },
        challenge: null,
        lessons: aulas.map((a) => ({
          meta: {
            schemaVersion: 1,
            slug: a.slug,
            title: `Aula ${a.slug}`,
            summary: 'Resumo da aula.',
            difficulty: 1,
            // I16 do `audit.ts`: o `concept` do desafio TEM de estar em
            // `concepts` da aula — conceito sem aula dona nao entra em
            // orcamento nenhum. A fixture usa um conceito so.
            concepts: ['imprimir'],
            prerequisites: [],
            theory: [...a.teoria],
            sources: [],
            challenges: a.desafios.map((d) => d.slug),
            ...(a.introduces ? { introduces: a.introduces } : {}),
            ...(a.role ? { role: a.role } : {}),
            ...(a.targetAtom ? { targetAtom: a.targetAtom } : {}),
          } as never,
          challenges: [...a.desafios],
        })),
      },
    ],
    proficiency: null,
    dir: '/memoria/fixture-convergencia',
  } as unknown as LoadedTrack;
}

/**
 * FIXTURE 1 — A TRILHA IDEAL. Uma aula, um passo, duas seções, tudo
 * demonstrado, desafio presente, e a regra do par DECLARADA (`derived`): as
 * três chaves de `print("bom dia")` saem da MESMA linha e colapsam em UMA
 * construção, que é o teto da aula 1 (A18).
 */
function trilhaIdeal(): LoadedTrack {
  return fazerTrilha('trilha-ideal', [
    {
      slug: 'a-primeira-linha',
      introduces: {
        productive: ['global:print', 'node:Call', 'node:StrLiteral'],
        receptive: [],
        derived: [
          { chave: 'node:Call', de: 'global:print' },
          { chave: 'node:StrLiteral', de: 'global:print' },
        ],
      },
      targetAtom: 'global:print',
      teoria: [
        secao('uma-linha', 'A sua primeira ordem mostra um texto na tela.', 'print("bom dia")'),
        secao('outra-forma', 'A mesma ordem com outro texto.', 'print("boa noite")'),
      ],
      desafios: [desafio('escreva-oi', 'print("oi")\n')],
    },
  ]);
}

/**
 * FIXTURE 2 — A AULA QUE DÁ UM PASSO GRANDE DEMAIS. Duas construções
 * PRODUTIVAS em linhas diferentes (dois grupos de co-ocorrência distintos) na
 * PRIMEIRA aula da trilha, cujo teto é 1 grupo produtivo (A18). A quebra tem de
 * produzir 1 aula nova, e o grupo de `print(...)` (três chaves na mesma linha)
 * tem de sair INTEIRO.
 */
function trilhaComPassoGrande(): LoadedTrack {
  return fazerTrilha('trilha-passo-grande', [
    {
      slug: 'tudo-de-uma-vez',
      introduces: {
        productive: ['global:print', 'node:Call', 'node:StrLiteral', 'node:Assign', 'node:Name'],
        receptive: [],
      },
      targetAtom: 'global:print',
      teoria: [
        secao('a-ordem', 'Primeiro a ordem que mostra.', 'print("bom dia")'),
        secao('o-nome', 'Depois o nome que guarda.', 'preco = 10'),
      ],
      desafios: [desafio('faca-tudo', 'preco = 10\nprint("oi")\n')],
    },
  ]);
}

/**
 * FIXTURE 3 — A AULA SEM DESAFIO (A20). É o defeito medido em massa no
 * `c-iniciante`: 113 aulas-esqueleto sem `challenges`.
 */
function trilhaSemDesafio(): LoadedTrack {
  return fazerTrilha('trilha-sem-desafio', [
    {
      slug: 'a-primeira-linha',
      introduces: {
        productive: ['global:print', 'node:Call', 'node:StrLiteral'],
        receptive: [],
        derived: [
          { chave: 'node:Call', de: 'global:print' },
          { chave: 'node:StrLiteral', de: 'global:print' },
        ],
      },
      teoria: [
        secao('uma-linha', 'A sua primeira ordem mostra um texto.', 'print("bom dia")'),
        secao('outra-forma', 'A mesma ordem com outro texto.', 'print("boa noite")'),
      ],
      desafios: [],
    },
  ]);
}

// ---------------------------------------------------------------------------
// Deps de teste — tudo injetado, nada de disco, nada de git
// ---------------------------------------------------------------------------

interface Registro {
  gravados: Array<{ arquivo: string; conteudo: string }>;
  ledger: string[];
}

function depsDe(track: LoadedTrack, registro: Registro): DepsDaConvergencia {
  return {
    carregarTrilha: async () => track,
    gravarArquivo: async (arquivo, conteudo) => {
      registro.gravados.push({ arquivo, conteudo });
    },
    registrarNoLedger: async (linha) => {
      registro.ledger.push(linha);
    },
    lerCommit: async () => 'commit-de-teste',
    lerAmbiente: async () => ({ node: 'v24.19.0' }),
    lerCadeia: async () => ({ mapa: new Map<string, string>(), declaracao: 'cadeia vazia (fixture)' }),
  };
}

function registroNovo(): Registro {
  return { gravados: [], ledger: [] };
}

/** O plano de quebra da primeira aula da trilha — o caminho curto dos casos C2/C4. */
function planoDaPrimeiraAula(track: LoadedTrack): PlanoDeQuebra {
  const barra = auditarBarra(track, { modo: 'declared' });
  const orcamento = deriveTrackBudget(track, { mode: 'declared' });
  const mod = track.modules[0];
  const aula = mod.lessons[0];
  const metrica = barra.metricas.find((m) => m.ref === `${mod.meta.slug}/${aula.meta.slug}`);
  assert.ok(metrica, 'a barra tem de publicar a metrica da aula 1');
  const lb = orcamento.lessons.find((l) => l.ref === metrica.ref);
  assert.ok(lb, 'o orcamento tem de ter a aula 1');
  return planejarQuebra({
    meta: aula.meta,
    moduloSlug: mod.meta.slug,
    moduloTitulo: mod.meta.title,
    lessonsDoModulo: [...mod.meta.lessons],
    metrica,
    orcamento: lb,
    adapterId: barra.adapterId,
    primeiraDaTrilha: metrica.index === 0,
  });
}

// ---------------------------------------------------------------------------
// C1 — trilha ideal → PONTO-FIXO na iteração 1
// ---------------------------------------------------------------------------

describe('convergencia — C1: a trilha ideal para em PONTO-FIXO na primeira iteracao', () => {
  it('nao acha erro nenhum, nao aplica nada e sai com o veredito que vale exit 0', async () => {
    const track = trilhaIdeal();
    const registro = registroNovo();
    const resultado = await convergirTrilha(depsDe(track, registro), {
      slug: 'trilha-ideal',
      modo: 'dry-run',
      opcoesDeAudit: { mode: 'declared' },
    });

    const erros = resultado.achadosRemanescentes.filter((a) => a.severidade === 'erro');
    assert.deepEqual(
      erros.map((a) => `${a.regra} ${a.ref} ${a.chave ?? '-'}`),
      [],
      'a trilha ideal nao pode ter achado de ERRO nenhum',
    );
    assert.equal(resultado.foraDosRamos.length, 0);
    assert.equal(resultado.veredito, 'PONTO-FIXO');
    assert.equal(resultado.iteracoes.length, 1, 'PONTO-FIXO fecha na PRIMEIRA volta');
    assert.equal(resultado.iteracoes[0].mu, 0, 'mu = 0 e a definicao de trilha ideal');
    assert.equal(registro.gravados.length, 0, 'PONTO-FIXO nao grava conteudo');
  });

  it('A22 (aviso) NAO impede o ponto fixo — aviso nunca abre rodada (§6.5)', async () => {
    // A MESMA aula ideal, com a construcao demonstrada em UMA forma sintatica
    // so: a barra emite A22 (aviso com contagem, nunca erro). O ponto fixo tem
    // de acontecer assim mesmo — a tabela de severidade do §6.5 diz que aviso
    // nao abre rodada, e um laco que parasse aqui nunca convergiria.
    const track = fazerTrilha('trilha-ideal-uma-forma', [
      {
        slug: 'a-primeira-linha',
        introduces: {
          productive: ['global:print', 'node:Call', 'node:StrLiteral'],
          receptive: [],
          derived: [
            { chave: 'node:Call', de: 'global:print' },
            { chave: 'node:StrLiteral', de: 'global:print' },
          ],
        },
        teoria: [
          secao('uma-linha', 'A sua primeira ordem mostra um texto.', 'print("bom dia")'),
          secao('de-novo', 'A mesma ordem, de novo.', 'print("bom dia")'),
        ],
        desafios: [desafio('escreva-oi', 'print("oi")\n')],
      },
    ]);
    const barra = auditarBarra(track, { modo: 'declared' });
    const avisos = barra.achados.filter((a) => a.severidade === 'aviso');
    assert.ok(avisos.length > 0, 'a fixture existe para ter ao menos um A22');
    assert.equal(barra.totais.erros, 0, 'e nenhum ERRO — o aviso e o unico achado');
    const resultado = await convergirTrilha(depsDe(track, registroNovo()), {
      slug: 'trilha-ideal-uma-forma',
      modo: 'dry-run',
      opcoesDeAudit: { mode: 'declared' },
    });
    assert.equal(resultado.veredito, 'PONTO-FIXO');
  });
});

// ---------------------------------------------------------------------------
// C2 — aula acima do teto → ramo QUEBRA com o plano de N aulas
// ---------------------------------------------------------------------------

describe('convergencia — C2: a aula acima do teto cai no ramo QUEBRA e ganha plano', () => {
  it('classifica A17/A18/A21 em QUEBRA e prescreve SPLIT_LESSON', () => {
    const track = trilhaComPassoGrande();
    const audit = auditTrack(track, { mode: 'declared' });
    const barra = auditarBarra(track, { modo: 'declared' });
    const classificacao = classificarAchados({
      audit,
      barra,
      ensinadoAntesNaCadeia: new Map<string, string>(),
    });
    assert.ok(classificacao.porRamo.QUEBRA > 0, 'a aula acima do teto abre o ramo QUEBRA');
    const quebras = classificacao.achados.filter((a: AchadoClassificado) => a.ramo === 'QUEBRA');
    for (const q of quebras) {
      assert.equal(q.acao, 'SPLIT_LESSON', `${q.regra} tem de prescrever SPLIT_LESSON`);
      assert.ok(['A17', 'A18', 'A21'].includes(q.regra), `regra inesperada no ramo QUEBRA: ${q.regra}`);
    }
  });

  it('o plano quebra em N aulas, com teto 1 grupo produtivo na aula 1 da trilha (A18)', () => {
    const plano = planoDaPrimeiraAula(trilhaComPassoGrande());
    assert.equal(plano.tetoDeGruposProdutivos, 1, 'a aula 1 da trilha tem teto 1 (A18)');
    assert.ok(plano.grupos.length >= 2, 'a fixture tem dois grupos produtivos distintos');
    assert.equal(plano.aulasNovas.length, 1, 'dois grupos produtivos com teto 1 => 1 aula nova + a original');
    const nova = plano.aulasNovas[0];
    assert.equal(nova.gruposProdutivos, 1, 'a primeira aula do pacote recebe 1 grupo produtivo');
    assert.equal(nova.moduloSlug, 'm01');
    assert.equal(nova.inserirAntesDe, 'm01/tudo-de-uma-vez', 'a aula nova entra ANTES da original');
    assert.equal(nova.indiceNoModulo, 0);
    assert.deepEqual(nova.prerequisites, [], 'a primeira aula da trilha nao tem pre-requisito');
    assert.ok(nova.slug.startsWith('passo-'), `slug em kebab-case com prefixo pt-BR: ${nova.slug}`);
    assert.match(nova.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'o slug tem de casar com SLUG_RE');
    assert.equal(nova.jaExiste, false);
  });

  it('a ficha de AUTORIA sai preenchida, no formato do campo `autoria` das aulas-esqueleto', () => {
    const plano = planoDaPrimeiraAula(trilhaComPassoGrande());
    const ficha = plano.aulasNovas[0].autoria;
    assert.equal(ficha.modulo, 'm01');
    assert.equal(ficha.moduloTitulo, 'Modulo um');
    assert.equal(ficha.aula, 1, 'a posicao 1-based dentro do modulo');
    assert.ok(ficha.ensina.length > 0);
    assert.ok(ficha.presume.length > 0);
    assert.ok(ficha.quiz.includes('A AUTORAR'), 'o quiz e uma DIRETIVA de autoria, nunca conteudo inventado');
    assert.ok(ficha.desafio.includes('A AUTORAR'), 'o desafio e uma DIRETIVA de autoria');
  });

  it('o plano diz o que FICA e o que a aula original tem de PERDER', () => {
    const plano = planoDaPrimeiraAula(trilhaComPassoGrande());
    assert.ok(plano.chavesQuePerde.length > 0, 'a aula original perde o que foi para a aula nova');
    assert.ok(plano.chavesQueFicam.length > 0, 'e fica com o ultimo pacote');
    const intersecao = plano.chavesQueFicam.filter((k) => plano.chavesQuePerde.includes(k));
    assert.deepEqual(intersecao, [], 'nenhuma chave pode ficar E sair ao mesmo tempo');
  });

  it('o slug da aula nova e DETERMINISTICO e distingue grupos diferentes', () => {
    const a = slugDaAulaDaQuebra('global:print', ['global:print', 'node:Call']);
    const b = slugDaAulaDaQuebra('global:print', ['global:print', 'node:Call']);
    const c = slugDaAulaDaQuebra('global:print', ['global:print', 'node:StrLiteral']);
    assert.equal(a, b, 'mesma entrada => mesmo slug, byte a byte');
    assert.notEqual(a, c, 'grupos diferentes => slugs diferentes (slug de aula e chave global, I12)');
  });
});

// ---------------------------------------------------------------------------
// C3 — vetor que repete → CICLO
// ---------------------------------------------------------------------------

describe('convergencia — C3: o vetor que repete PARA em CICLO e escala', () => {
  it('no modo aplicar, sem nada aplicavel, a segunda iteracao repete o hash e o laco para', async () => {
    // A fixture tem achado (A20: aula sem desafio) cuja acao e de AUTORIA — o
    // laco nao aplica nada, o vetor nao muda, e a segunda volta reencontra o
    // MESMO hash. É a prova de que "recursao sem fim" nao e laco infinito.
    const track = trilhaSemDesafio();
    const registro = registroNovo();
    const resultado = await convergirTrilha(depsDe(track, registro), {
      slug: 'trilha-sem-desafio',
      modo: 'aplicar',
      opcoesDeAudit: { mode: 'declared' },
    });
    assert.equal(resultado.veredito, 'CICLO');
    assert.equal(resultado.iteracoes.length, 2, 'a primeira volta mede, a segunda reencontra o hash');
    assert.equal(
      resultado.iteracoes[0].hashDoVetor,
      resultado.iteracoes[1].hashDoVetor,
      'o CICLO e, por definicao, o hash repetido',
    );
    assert.equal(registro.gravados.length, 0, 'nada aplicavel => nada gravado');
    assert.notEqual(resultado.veredito, 'PONTO-FIXO', 'CICLO nunca sai 0 — ele ESCALA (§6.6)');
  });

  it('--max-iteracoes invalido e uso incorreto, com erro ESTRUTURADO', async () => {
    const track = trilhaIdeal();
    await assert.rejects(
      () =>
        convergirTrilha(depsDe(track, registroNovo()), {
          slug: 'trilha-ideal',
          modo: 'dry-run',
          maxIteracoes: 0,
        }),
      (erro: unknown) =>
        erro instanceof ErroDeConvergencia && erro.codigo === 'CONVERGENCIA_MAX_ITERACOES_INVALIDO',
    );
  });
});

// ---------------------------------------------------------------------------
// C4 — um grupo de co-ocorrência NUNCA é partido
// ---------------------------------------------------------------------------

describe('convergencia — C4: um grupo de co-ocorrencia nunca e partido', () => {
  it('todo grupo do plano esta INTEIRO em exatamente um pacote', () => {
    for (const track of [trilhaComPassoGrande(), trilhaIdeal(), trilhaSemDesafio()]) {
      const plano = planoDaPrimeiraAula(track);
      const pacotes: string[][] = [...plano.aulasNovas.map((a) => [...a.chaves]), [...plano.chavesQueFicam]];
      for (const grupo of plano.grupos) {
        const donos = pacotes.filter((p) => grupo.chaves.some((k) => p.includes(k)));
        assert.equal(
          donos.length,
          1,
          `o grupo [${grupo.chaves.join(', ')}] aparece em ${donos.length} pacotes — um grupo NUNCA se parte`,
        );
        for (const chave of grupo.chaves) {
          assert.ok(
            donos[0].includes(chave),
            `${chave} saiu do grupo [${grupo.chaves.join(', ')}] — a regra do par foi violada`,
          );
        }
      }
    }
  });

  it('o grupo que SOZINHO estoura o teto de chaves nao e partido: vira prescricao de `introduces.derived`', () => {
    // O caso MEDIDO no `rust-iniciante`: os dois grupos produtivos da aula 1
    // (`a-tela/a-primeira-funcao`) têm 5 chaves cada, acima do teto de 4 de A21.
    // Partir o grupo violaria a regra mais forte; a saida e DECLARAR a regra do
    // par, que colapsa o grupo em 1 item.
    const track = fazerTrilha('trilha-grupo-grande', [
      {
        slug: 'uma-linha-densa',
        introduces: {
          productive: ['global:print', 'node:Call', 'node:StrLiteral', 'node:BinOp', 'op:binary:+'],
          receptive: [],
        },
        targetAtom: 'global:print',
        teoria: [
          secao('densa', 'Tudo numa linha so.', 'print("bom" + "dia")'),
          secao('denovo', 'A mesma coisa outra vez.', 'print("boa" + "noite")'),
        ],
        desafios: [desafio('junte', 'print("a" + "b")\n')],
      },
    ]);
    const plano = planoDaPrimeiraAula(track);
    const grupoGrande = plano.grupos.find((g) => g.acimaDoTetoDeChaves);
    assert.ok(grupoGrande, 'a fixture existe para ter um grupo acima do teto de chaves');
    assert.ok(plano.derivadasAPropor.length > 0, 'o plano prescreve as derivadas em vez de partir o grupo');
    const proposta = plano.derivadasAPropor[0];
    assert.equal(
      proposta.derived.length,
      grupoGrande.chaves.length - 1,
      'todo membro do grupo menos a chave que distingue vira derivada',
    );
    for (const d of proposta.derived) {
      assert.equal(d.de, grupoGrande.chaveQueDistingue, 'cadeia de derivadas e proibida: todas apontam para o pai');
      assert.ok(grupoGrande.chaves.includes(d.chave));
    }
  });
});

// ---------------------------------------------------------------------------
// C5 — aula sem desafio → ramo PROVA
// ---------------------------------------------------------------------------

describe('convergencia — C5: aula sem desafio cai no ramo PROVA', () => {
  it('A20 sem desafio vira PROVA com a acao ADD_TEST', () => {
    const track = trilhaSemDesafio();
    const classificacao = classificarAchados({
      audit: auditTrack(track, { mode: 'declared' }),
      barra: auditarBarra(track, { modo: 'declared' }),
      ensinadoAntesNaCadeia: new Map<string, string>(),
    });
    assert.ok(classificacao.porRamo.PROVA > 0, 'a aula sem desafio abre o ramo PROVA');
    const prova = classificacao.achados.filter((a) => a.ramo === 'PROVA');
    assert.ok(
      prova.some((a) => a.regra === 'A20' && a.acao === 'ADD_TEST'),
      'aula sem desafio prescreve ADD_TEST',
    );
  });

  it('o vetor conta a aula sem desafio, e mu > 0', () => {
    const track = trilhaSemDesafio();
    const vetor = medirVetor(auditTrack(track, { mode: 'declared' }), auditarBarra(track, { modo: 'declared' }));
    assert.equal(vetor.aulasSemDesafio, 1);
    assert.ok(vetor.errosDaBarra > 0);
  });
});

// ---------------------------------------------------------------------------
// C6 — o vetor, a medida μ e o hash
// ---------------------------------------------------------------------------

describe('convergencia — C6: o vetor de estado e a medida de terminacao', () => {
  it('toda componente e inteira e nao-negativa', () => {
    for (const track of [trilhaIdeal(), trilhaComPassoGrande(), trilhaSemDesafio()]) {
      const vetor = medirVetor(auditTrack(track, { mode: 'declared' }), auditarBarra(track, { modo: 'declared' }));
      for (const componente of COMPONENTES_DO_VETOR) {
        assert.ok(Number.isInteger(vetor[componente]), `${componente} tem de ser inteira`);
        assert.ok(vetor[componente] >= 0, `${componente} tem de ser >= 0`);
      }
    }
  });

  it('o hash e estavel e sensivel a QUALQUER componente', () => {
    const base: VetorDeEstado = {
      violacoesDeOrcamento: 1,
      lacunasDeCurriculo: 2,
      errosDaBarra: 3,
      excessoDePasso: 4,
      chavesSemDemonstracao: 5,
      aulasSemDesafio: 6,
      secoesInsuficientes: 7,
    };
    assert.equal(hashDoVetor(base), hashDoVetor({ ...base }), 'mesmo vetor => mesmo hash');
    for (const componente of COMPONENTES_DO_VETOR) {
      const mexido = { ...base, [componente]: base[componente] + 1 };
      assert.notEqual(hashDoVetor(base), hashDoVetor(mexido), `o hash tem de reagir a ${componente}`);
    }
  });

  it('a descida e detectada por QUALQUER componente que diminui', () => {
    const antes: VetorDeEstado = {
      violacoesDeOrcamento: 1,
      lacunasDeCurriculo: 1,
      errosDaBarra: 1,
      excessoDePasso: 1,
      chavesSemDemonstracao: 1,
      aulasSemDesafio: 1,
      secoesInsuficientes: 1,
    };
    assert.equal(algumaComponenteDesceu(antes, antes), false, 'vetor igual nao desceu');
    assert.equal(
      algumaComponenteDesceu(antes, { ...antes, aulasSemDesafio: 0 }),
      true,
      'uma componente a menos ja e descida',
    );
    assert.equal(
      algumaComponenteDesceu(antes, { ...antes, aulasSemDesafio: 5 }),
      false,
      'subir nao e descer',
    );
  });

  it('o minimo de secoes de A21 e max(2, ceil(novas/2)) — a MESMA aritmetica da barra', () => {
    assert.equal(minimoDeSecoes(0), 2);
    assert.equal(minimoDeSecoes(1), 2);
    assert.equal(minimoDeSecoes(4), 2);
    assert.equal(minimoDeSecoes(5), 3);
    assert.equal(minimoDeSecoes(9), 5);
  });
});

// ---------------------------------------------------------------------------
// C7 — o dry-run nao grava conteúdo, e grava o ledger
// ---------------------------------------------------------------------------

describe('convergencia — C7: o dry-run grava SO o ledger, e ele e auditavel', () => {
  it('nenhum arquivo de conteudo e gravado, e o ledger ganha uma linha por iteracao', async () => {
    const track = trilhaComPassoGrande();
    const registro = registroNovo();
    const resultado = await convergirTrilha(depsDe(track, registro), {
      slug: 'trilha-passo-grande',
      modo: 'dry-run',
      opcoesDeAudit: { mode: 'declared' },
    });
    assert.equal(registro.gravados.length, 0, 'o dry-run NAO grava conteudo');
    assert.equal(registro.ledger.length, resultado.iteracoes.length, 'uma linha de ledger por iteracao');

    const linha = JSON.parse(registro.ledger[0]) as Record<string, unknown>;
    for (const campo of [
      'iteracao',
      'commit',
      'ambiente',
      'medicoes',
      'limitacoesDeclaradas',
      'vetor',
      'achadosPorRamo',
      'acoesPlanejadas',
      'acoesAplicadas',
      'hashDoVetor',
      'veredito',
    ]) {
      assert.ok(campo in linha, `o ledger tem de registrar "${campo}"`);
    }
    assert.equal(linha.commit, 'commit-de-teste');
    const medicoes = linha.medicoes as Array<{ comando: string; exit: number; placar: string }>;
    assert.ok(medicoes.length >= 2, 'o ledger registra os DOIS gates rodados');
    for (const m of medicoes) {
      assert.ok(m.comando.startsWith('npm run engine -- '), 'toda medicao nomeia o comando que a reproduz');
      assert.ok(Number.isInteger(m.exit));
    }
  });

  it('o ledger declara as limitacoes do audit (A13-A16-NAO-RODOU em trilha nao-JavaScript)', async () => {
    const registro = registroNovo();
    await convergirTrilha(depsDe(trilhaIdeal(), registro), {
      slug: 'trilha-ideal',
      modo: 'dry-run',
      opcoesDeAudit: { mode: 'declared' },
    });
    const linha = JSON.parse(registro.ledger[0]) as { limitacoesDeclaradas: string[] };
    assert.deepEqual(
      linha.limitacoesDeclaradas,
      ['A13-A16-NAO-RODOU'],
      'a trilha e de Python: a bateria A13-A16 NAO roda e isso tem de estar DECLARADO',
    );
  });
});

describe('C8 - o catalogo e FECHADO: toda regra da barra tem ramo', () => {
  /**
   * O DEFEITO QUE ESTE CASO TRAVA, medido em 2026-09-22: a A24 entrou em
   * `barra.ts` depois que `RAMO_DA_BARRA` foi escrita, e sem linha na tabela
   * TODO achado dela caiu em `foraDosRamos` - que bloqueia o ponto fixo por
   * desenho. O `estado-dos-cursos.sh` do rust-iniciante mostrava cinco gates
   * verdes e "DRY-RUN, 93 pendente", e os 93 eram AVISOS que o `semAchado` ja
   * ignorava. O sintoma era "o curso nao converge"; a causa era uma linha de
   * tabela. Regra nova sem ramo volta a ser VERMELHO aqui, nao no relatorio.
   */
  it('REGRAS_DA_BARRA subset RAMO_DA_BARRA - nenhuma regra fica fora dos seis ramos', () => {
    const semRamo = REGRAS_DA_BARRA.filter((r) => RAMO_DA_BARRA[r] === undefined);
    assert.deepEqual(
      semRamo,
      [],
      `regras da barra sem linha em RAMO_DA_BARRA: ${semRamo.join(', ')} - toda regra nova precisa de ramo, ` +
        'senao os achados dela caem em foraDosRamos e travam o ponto fixo sem dizer por que',
    );
  });

  it('a tabela nao inventa regra: RAMO_DA_BARRA subset REGRAS_DA_BARRA', () => {
    const inventadas = Object.keys(RAMO_DA_BARRA).filter(
      (r) => !(REGRAS_DA_BARRA as readonly string[]).includes(r),
    );
    assert.deepEqual(inventadas, [], 'a tabela cita regra que a barra nao emite');
  });

  it('A24 cai em PROVA: quiz que se acerta sem ler nao PROVA maestria', () => {
    assert.equal(RAMO_DA_BARRA.A24, 'PROVA');
  });
});
