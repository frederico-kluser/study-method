/**
 * tests/cx-phases-review-filter.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/review/filter.ts` (a bateria estrutural R1–R8, §6.4).
 *
 * PINA: o critério determinístico de cada regra (funções puras R1..R8), o
 * proxy de reprodução do R5 (ExecFn injetado, timeout declarado, fail-closed
 * 126/127/sem-executor, prefixo mecânico pula), e a bateria completa
 * `filtrarApontamentos` (PRIMEIRO motivo vence; R8 trunca por artefato e
 * severidade, estável).
 *
 * Sem rede, sem LLM: só funções puras e um ExecFn fake.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  R5_SHELL,
  R5_TIMEOUT_MS_DEFAULT,
  R8_TETO,
  REPRODUZIVEL_MECANICO_PREFIX,
  TAMANHO_MINIMO_DE_DEFEITO,
  filtrarApontamentos,
  r1SpanResoluvel,
  r2FraseDeclarativa,
  r3PedeMudanca,
  r4EvidenciaVerificavel,
  r4FragmentosNaoVerificaveis,
  r5ExigeReproducao,
  r6RegraNaConstituicao,
  r7SemCorrecaoAberta,
  r8TruncaPorSeveridade,
  type ContextoDoFiltro,
} from '../electron/main/engine/review/filter';
import type { ExecFn } from '../electron/main/engine/exec/proofs';
import type { Apontamento } from '../electron/main/engine/review/actionCatalog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ARTEFATO = 'function soma(a, b) {\n  return a + b;\n}\n';

function apontamento(over: Partial<Apontamento> = {}): Apontamento {
  return {
    id: 'ap-1',
    rodada: 1,
    artefato: 'lesson-draft',
    alvo: {
      caminho: 'aula/lesson.json',
      linha: 1,
      span: [0, ARTEFATO.length],
      no_ast: 'FunctionDeclaration',
      token: 'soma',
    },
    evidencia: {
      tipo: 'estrutura',
      prova: 'o trecho `return a + b;` resolve o exercício por completo.',
      introduzido_em: 'aula-1',
      reproduzivel_por: 'mecanico:verificador-de-orcamento',
    },
    defeito: 'a função soma não declara o tipo de retorno.',
    regra_violada: 'C1',
    categoria: 'construcao_nao_ensinada',
    severity: 'corrigir',
    acao_sugerida: 'declare o tipo de retorno na aula que introduz a função.',
    confianca: 0.8,
    ...over,
  } as Apontamento;
}

function contexto(over: Partial<ContextoDoFiltro> = {}): ContextoDoFiltro {
  return {
    obterConteudo: (caminho) => (caminho === 'aula/lesson.json' ? ARTEFATO : null),
    orcamento: ['node:FunctionDeclaration', 'op:binary:+'],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. R1 — span resolvível
// ---------------------------------------------------------------------------

describe('filter — R1 span resolvível', () => {
  it('span fechado dentro do artefato resolve; fim EXATO do arquivo resolve', () => {
    assert.equal(r1SpanResoluvel(apontamento({ alvo: { ...apontamento().alvo, span: [0, 10] } }), ARTEFATO), true);
    assert.equal(
      r1SpanResoluvel(apontamento({ alvo: { ...apontamento().alvo, span: [2, ARTEFATO.length] } }), ARTEFATO),
      true,
    );
    assert.equal(r1SpanResoluvel(apontamento({ alvo: { ...apontamento().alvo, span: [5, 5] } }), ARTEFATO), true, 'span vazio [5,5] é fechado');
  });

  it('artefato inexistente (null), span invertido/negativo/fora são irresolvíveis', () => {
    assert.equal(r1SpanResoluvel(apontamento(), null), false);
    for (const span of [[10, 5], [-1, 5], [0, ARTEFATO.length + 1], [5, 999]] as [number, number][]) {
      const a = apontamento({ alvo: { ...apontamento().alvo, span } });
      assert.equal(r1SpanResoluvel(a, ARTEFATO), false, `span [${span}] deveria ser irresolvível`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. R2 — frase declarativa
// ---------------------------------------------------------------------------

describe('filter — R2 defeito é frase declarativa', () => {
  it('frase longa terminando em "." passa; o resto reprova', () => {
    assert.equal(r2FraseDeclarativa(apontamento({ defeito: 'a função quebra com entrada vazia.' })), true);
    assert.equal(r2FraseDeclarativa(apontamento({ defeito: 'curto.' })), false, `menos de ${TAMANHO_MINIMO_DE_DEFEITO} caracteres`);
    assert.equal(r2FraseDeclarativa(apontamento({ defeito: 'frase sem ponto final' })), false);
    assert.equal(r2FraseDeclarativa(apontamento({ defeito: 'por que a função falha?' })), false, 'termina em ?');
    assert.equal(r2FraseDeclarativa(apontamento({ defeito: 'isso está errado!' })), false, 'termina em !');
    assert.equal(r2FraseDeclarativa(apontamento({ defeito: 'deveria usar outro nome aqui.' })), false, 'começa com interrogação implícita');
    assert.equal(r2FraseDeclarativa(apontamento({ defeito: '  a função quebra com vazios.  ' })), true, 'aparada antes do teste');
  });
});

// ---------------------------------------------------------------------------
// 3. R3 — pede mudança
// ---------------------------------------------------------------------------

describe('filter — R3 pede mudança (não é pergunta nem elogio)', () => {
  it('pergunta explícita não pede mudança; elogio puro também não', () => {
    assert.equal(r3PedeMudanca(apontamento({ defeito: 'que tal revisar esta função aqui.' })), false);
    assert.equal(r3PedeMudanca(apontamento({ defeito: 'ótimo trabalho nesta aula.' })), false, 'elogio puro');
    assert.equal(r3PedeMudanca(apontamento({ defeito: 'excelente explicação da máquina nocional.' })), false);
  });

  it('elogio COM marcador de defeito pede mudança; defeito comum também', () => {
    assert.equal(r3PedeMudanca(apontamento({ defeito: 'ótimo texto, mas falta declarar o tipo de retorno.' })), true);
    assert.equal(r3PedeMudanca(apontamento({ defeito: 'a função quebra com entrada vazia.' })), true);
  });
});

// ---------------------------------------------------------------------------
// 4. R4 — fragmentos citados verificáveis
// ---------------------------------------------------------------------------

describe('filter — R4 evidência verificável (substring no artefato, dentro do span ou do orçamento)', () => {
  it('fragmento inexistente no artefato é fora_do_artefato (alucinação)', () => {
    const a = apontamento({
      evidencia: { ...apontamento().evidencia, prova: 'o trecho `codigo que nao existe` contradiz o enunciado.' },
    });
    assert.deepEqual(r4FragmentosNaoVerificaveis(a, ARTEFATO, []), [
      { fragmento: 'codigo que nao existe', motivo: 'fora_do_artefato' },
    ]);
    assert.equal(r4EvidenciaVerificavel(a, ARTEFATO, []), false);
  });

  it('fragmento no artefato mas FORA do span e do orçamento é fora_do_alcance', () => {
    const a = apontamento({
      alvo: { ...apontamento().alvo, span: [0, 9] },
      evidencia: { ...apontamento().evidencia, prova: 'veja `return a + b;` fora do trecho apontado.' },
    });
    assert.deepEqual(r4FragmentosNaoVerificaveis(a, ARTEFATO, []), [
      { fragmento: 'return a + b;', motivo: 'fora_do_alcance' },
    ]);
  });

  it('fora do span mas CHAVE do orçamento é verificável; dentro do span também', () => {
    // O fragmento PRECISA existir no artefato (senão seria alucinação); aqui ele
    // existe mas está fora do span — a chave do orçamento o cobre.
    const artefatoComChave = 'aqui se usa op:binary:+ no fim.\n';
    const foraDoSpan = apontamento({
      alvo: { ...apontamento().alvo, span: [0, 4] },
      evidencia: { ...apontamento().evidencia, prova: 'a construção `op:binary:+` foi citada.' },
    });
    assert.equal(r4EvidenciaVerificavel(foraDoSpan, artefatoComChave, ['op:binary:+']), true, 'chave do orçamento cobre a citação');
    assert.equal(r4EvidenciaVerificavel(foraDoSpan, artefatoComChave, []), false, 'sem orçamento, fora do span reprova');

    const dentroDoSpan = apontamento({
      evidencia: { ...apontamento().evidencia, prova: 'o trecho `return a + b;` resolve tudo.' },
    });
    assert.equal(r4EvidenciaVerificavel(dentroDoSpan, ARTEFATO, []), true);
  });

  it('sem fragmentos citáveis (ou artefato null) não há o que acusar — passa', () => {
    const semCitacao = apontamento({
      evidencia: { ...apontamento().evidencia, prova: 'a função não cobre o caso vazio.' },
    });
    assert.equal(r4EvidenciaVerificavel(semCitacao, ARTEFATO, []), true);
    assert.equal(r4EvidenciaVerificavel(apontamento(), null, []), true);
  });

  it('fragmentos com menos de 3 caracteres são ignorados; crases, aspas e aspas curvas contam', () => {
    const a = apontamento({
      evidencia: { ...apontamento().evidencia, prova: 'comparando `ab` com "xyz inexistente" e “outro fantasma”.' },
    });
    assert.deepEqual(
      r4FragmentosNaoVerificaveis(a, ARTEFATO, []).map((f) => f.fragmento),
      ['xyz inexistente', 'outro fantasma'],
    );
  });
});

// ---------------------------------------------------------------------------
// 5. R5 — reprodução EXECUTADA (proxy determinístico, fail-closed)
// ---------------------------------------------------------------------------

describe('filter — R5 exige reprodução', () => {
  function comReproducao(reproduzivel_por: string, token = 'soma'): Apontamento {
    return apontamento({ alvo: { ...apontamento().alvo, token }, evidencia: { ...apontamento().evidencia, reproduzivel_por } });
  }

  it('prefixo mecânico pula R5 por construção (a reprodução É o veredito do verificador)', async () => {
    assert.deepEqual(await r5ExigeReproducao(comReproducao(`${REPRODUZIVEL_MECANICO_PREFIX}orcamento`), undefined, 1), { reproduz: true });
  });

  it('sem executor configurado é fail-closed: falhou_ao_rodar', async () => {
    const r = await r5ExigeReproducao(comReproducao('npm test'), undefined, 100);
    assert.equal(r.reproduz, false);
    if (!r.reproduz && r.razao === 'falhou_ao_rodar') {
      assert.match(r.erro, /sem executor de reprodução/);
    }
  });

  it('exit ≠ 0 é reprodução; exit 0 com o token na saída também; exit 0 limpo NÃO reproduz', async () => {
    const falhou: ExecFn = async () => ({ exitCode: 1, stdout: '', stderr: 'x' });
    const citou: ExecFn = async () => ({ exitCode: 0, stdout: 'esperado soma(...)', stderr: '' });
    const limpo: ExecFn = async () => ({ exitCode: 0, stdout: 'tudo certo', stderr: '' });
    assert.deepEqual(await r5ExigeReproducao(comReproducao('cmd'), falhou, 100), { reproduz: true });
    assert.deepEqual(await r5ExigeReproducao(comReproducao('cmd'), citou, 100), { reproduz: true });
    assert.deepEqual(await r5ExigeReproducao(comReproducao('cmd'), limpo, 100), {
      reproduz: false,
      razao: 'nao_reproduziu',
    });
  });

  it('exit 126/127 é AMBIENTE (comando não rodou) — falhou_ao_rodar, nunca "reproduz"', async () => {
    for (const exitCode of [126, 127]) {
      const exec: ExecFn = async () => ({ exitCode, stdout: '', stderr: 'not found' });
      const r = await r5ExigeReproducao(comReproducao('comando-inventado'), exec, 100);
      assert.equal(r.reproduz, false);
      if (!r.reproduz && r.razao === 'falhou_ao_rodar') {
        assert.match(r.erro, /não encontrado ou não executável/);
      }
    }
  });

  it('executor que lança vira falhou_ao_rodar com a mensagem do erro', async () => {
    const exec: ExecFn = async () => {
      throw new Error('spawn morreu');
    };
    const r = await r5ExigeReproducao(comReproducao('cmd'), exec, 100);
    assert.equal(r.reproduz, false);
    if (!r.reproduz && r.razao === 'falhou_ao_rodar') assert.match(r.erro, /spawn morreu/);
  });

  it('o comando roda como `sh -c <comando>` com o timeout declarado (contrato observável)', async () => {
    const vistas: { args: string[]; opts?: { timeoutMs?: number } }[] = [];
    const exec: ExecFn = async (_dir: string, args: string[], opts?: { timeoutMs?: number }) => {
      vistas.push({ args, opts });
      return { exitCode: 1, stdout: '', stderr: '' };
    };
    await r5ExigeReproducao(comReproducao('  grep -r soma .  '), exec, 4_321);
    assert.deepEqual(vistas, [{ args: [R5_SHELL, '-c', 'grep -r soma .'], opts: { timeoutMs: 4_321 } }]);
  });
});

// ---------------------------------------------------------------------------
// 6. R6 e R7
// ---------------------------------------------------------------------------

describe('filter — R6 constituição e R7 estilo sem correção aberta', () => {
  it('R6: só C1–C8 existem no catálogo fechado', () => {
    for (const regra of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']) {
      assert.equal(r6RegraNaConstituicao(apontamento({ regra_violada: regra })), true, `${regra} deveria existir`);
    }
    for (const regra of ['C9', 'C0', 'regra inventada', '']) {
      assert.equal(r6RegraNaConstituicao(apontamento({ regra_violada: regra })), false);
    }
  });

  it('R7: categoria estilo com código em crases ou verbo de correção é descartada; o resto passa', () => {
    assert.equal(
      r7SemCorrecaoAberta(apontamento({ categoria: 'estilo', acao_sugerida: 'use `const resultado = soma(1, 2);`.' })),
      false,
      'trecho de código é correção aberta',
    );
    assert.equal(
      r7SemCorrecaoAberta(apontamento({ categoria: 'estilo', acao_sugerida: 'reescreva a chamada da função.' })),
      false,
    );
    assert.equal(
      r7SemCorrecaoAberta(apontamento({ categoria: 'estilo', acao_sugerida: 'prefira nomes mais descritivos.' })),
      true,
      'sugestão de estilo sem correção aberta passa',
    );
    assert.equal(
      r7SemCorrecaoAberta(apontamento({ categoria: 'ambiguidade_de_enunciado', acao_sugerida: 'reescreva tudo do zero.' })),
      true,
      'só a categoria estilo é alvo desta regra',
    );
  });
});

// ---------------------------------------------------------------------------
// 7. R8 — truncamento por severidade
// ---------------------------------------------------------------------------

describe('filter — R8 trunca por severidade (estável)', () => {
  function ap(severity: Apontamento['severity'], id: string): Apontamento {
    return apontamento({ id, severity });
  }

  it('até o teto: nada é truncado; acima: mantém os mais graves, estável na ordem original', () => {
    const poucos = [ap('sugestao', 's1'), ap('bloqueante', 'b1')];
    assert.deepEqual(r8TruncaPorSeveridade(poucos, 2), { mantidos: poucos, truncados: [] });

    const muitos = [
      ap('sugestao', 's1'),
      ap('corrigir', 'c1'),
      ap('bloqueante', 'b1'),
      ap('sugestao', 's2'),
      ap('corrigir', 'c2'),
      ap('bloqueante', 'b2'),
    ];
    const { mantidos, truncados } = r8TruncaPorSeveridade(muitos, 3);
    assert.deepEqual(mantidos.map((a) => a.id), ['b1', 'b2', 'c1'], 'bloqueantes primeiro, ordem original dentro do nível');
    assert.deepEqual(truncados.map((a) => a.id), ['c2', 's1', 's2']);
  });

  it('o teto default é o R8_TETO = 12 do §6.4', () => {
    assert.equal(R8_TETO, 12);
    const exatos = Array.from({ length: 12 }, (_, i) => ap('sugestao', `a${i}`));
    assert.deepEqual(r8TruncaPorSeveridade(exatos).truncados, []);
  });
});

// ---------------------------------------------------------------------------
// 8. A bateria completa — filtrarApontamentos
// ---------------------------------------------------------------------------

describe('filter — filtrarApontamentos (bateria R1→R8, primeiro motivo vence)', () => {
  it('apontamento íntegro sobrevive; detalhe do descarte carrega o prefixo [Rn]', async () => {
    const ok = apontamento();
    const ruim = apontamento({ id: 'ap-2', alvo: { ...apontamento().alvo, span: [99, 200] } });
    const r = await filtrarApontamentos([ok, ruim], contexto());
    assert.deepEqual(r.sobreviventes, [ok]);
    assert.equal(r.descartados.length, 1);
    assert.equal(r.descartados[0].motivo, 'R1');
    assert.match(r.descartados[0].detalhe, /^\[R1\] /);
  });

  it('o PRIMEIRO motivo da ordem vence mesmo quando há outras violações', async () => {
    // Viola R1 (span fora) E R2 (defeito curto) — o registrado é R1.
    const a = apontamento({
      alvo: { ...apontamento().alvo, span: [500, 600] },
      defeito: 'curto.',
    });
    const r = await filtrarApontamentos([a], contexto());
    assert.deepEqual(r.descartados.map((d) => d.motivo), ['R1']);

    // Viola R2 (sem ponto) E R3 (elogio) — o registrado é R2.
    const b = apontamento({ defeito: 'ótimo trabalho sem defeito nenhum' });
    const r2 = await filtrarApontamentos([b], contexto());
    assert.deepEqual(r2.descartados.map((d) => d.motivo), ['R2']);
  });

  it('artefato inexistente no contexto cai já no R1 nomeando o caminho', async () => {
    const a = apontamento({ alvo: { ...apontamento().alvo, caminho: 'fantasma/x.json' } });
    const r = await filtrarApontamentos([a], contexto());
    assert.equal(r.descartados[0].motivo, 'R1');
    assert.match(r.descartados[0].detalhe, /não existe no contexto/);
  });

  it('R5 é exercitado na bateria: reprodução mecânica passa direto, exec real decide', async () => {
    const chamadas: string[][] = [];
    const exec: ExecFn = async (_dir: string, args: string[]) => {
      chamadas.push(args);
      return { exitCode: 0, stdout: 'sem token nenhum', stderr: '' };
    };
    const mecanico = apontamento();
    const naoReproduz = apontamento({
      id: 'ap-2',
      evidencia: { ...apontamento().evidencia, reproduzivel_por: 'npm run conferir' },
    });
    const r = await filtrarApontamentos([mecanico, naoReproduz], contexto({ exec }));
    assert.deepEqual(r.sobreviventes.map((a) => a.id), ['ap-1']);
    assert.deepEqual(r.descartados.map((d) => d.motivo), ['R5']);
    assert.equal(chamadas.length, 1, 'só o apontamento não-mecânico executa');
  });

  it('R8 na bateria: por artefato, com teto configurável, sobreviventes reordenados por severidade', async () => {
    const aulaA = Array.from({ length: 4 }, (_, i) =>
      apontamento({ id: `a${i}`, severity: i < 2 ? 'sugestao' : 'bloqueante' }),
    );
    const aulaB = [apontamento({ id: 'b0', alvo: { ...apontamento().alvo, caminho: 'outra/aula.json' } })];
    const r = await filtrarApontamentos([...aulaA, ...aulaB], contexto({
      obterConteudo: () => ARTEFATO, // os DOIS artefatos existem no contexto
      tetoDeApontamentos: 2,
    }));
    assert.deepEqual(r.sobreviventes.map((a) => a.id), ['a2', 'a3', 'b0'], 'truncamento é POR ARTEFATO');
    assert.deepEqual(r.descartados.map((d) => [d.apontamento.id, d.motivo]), [
      ['a0', 'R8'],
      ['a1', 'R8'],
    ]);
  });

  it('constantes declaradas do filtro (timeout default e prefixo mecânico)', () => {
    assert.equal(R5_TIMEOUT_MS_DEFAULT, 30_000);
    assert.equal(REPRODUZIVEL_MECANICO_PREFIX, 'mecanico:');
  });
});
