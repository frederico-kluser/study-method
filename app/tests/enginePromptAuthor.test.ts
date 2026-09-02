/**
 * tests/enginePromptAuthor.test.ts — o prompt central do AUTOR DE AULA
 * (pacote P-11, onda 1 do plano de execução v1).
 *
 * Contratos que mordem aqui (`docs/16-engine-de-trilha.md` §7.1 e §7):
 *
 *   - A-P11-2: o dossiê é a entrada congelada; o spawn é RECUSADO se faltar
 *     QUALQUER campo, e a recusa é estruturada — nomeia o campo faltante.
 *     (O §7.1 diz "12 campos" e enumera 13 — os 12 + os desafios já escritos;
 *     este teste fixa os 13 por nome.)
 *   - A-P11-2b: os orçamentos entram LITERAIS e COMPLETOS no prompt, sem
 *     reticências de truncamento.
 *   - A-P11-2 (regras): as 18 regras duras do §7.1 TRANSCRITAS, cada uma numa
 *     linha nomeada e rastreável por id (`R1`..`R18`).
 *   - A-P11-4: o prompt NÃO contém a frase de pensamento profundo nem
 *     instrução de recomeço (nenhuma variação literal).
 *   - A-P11-5: checksum de cauda — o prompt termina pedindo a repetição da
 *     lista de construções permitidas e `compararChecksum` detecta divergência.
 *   - A-P11-5/teto: `MAX_TOKENS_SAIDA_AUTOR = 2000` (§7) e a rejeição acima
 *     do teto é função pura.
 *   - A-P11-7: o schema de saída do autor põe `raciocinio_de_projeto` ANTES
 *     de qualquer campo de decisão — o lint do P-04 (`lintOrdemCampos` /
 *     `encontrarCamposOpcionais`) roda sobre ele.
 *   - A-P11-3: o prompt é FUNÇÃO PURA do dossiê — mesmos dossiês → textos
 *     byte a byte idênticos; dossiês diferentes → textos diferentes.
 *
 * Sem rede, sem disco, sem LLM: dossiês e prompts são fixtures puras em
 * memória.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { ChallengeDraftSchema } from '../electron/main/engine/schemas/artifacts';
import {
  DECISION_FIELD_NAMES,
  encontrarCamposOpcionais,
  lintOrdemCampos,
} from '../electron/main/engine/schemas/fieldOrder';
import {
  AuthorOutputSchema,
  MAX_TOKENS_SAIDA_AUTOR,
  REGRAS_DURAS_DO_AUTOR,
  compararChecksum,
  construcoesPermitidas,
  gerarPromptAutor,
  isBlocked,
  rejeitarAcimaDoTeto,
} from '../electron/main/engine/prompts/author';
import {
  CAMPOS_DO_DOSSIE,
  ErroDossieIncompleto,
  montarDossie,
  type Dossier,
} from '../electron/main/engine/prompts/dossier';

// ---------------------------------------------------------------------------
// Fixtures (PURAS — nenhuma trilha real, nenhum IO)
// ---------------------------------------------------------------------------

type DesafioFixture = z.infer<typeof ChallengeDraftSchema>;

/** Um desafio (F8) já escrito — tokens de construção, nenhum conteúdo didático. */
function desafioJaEscrito(): DesafioFixture {
  return {
    slug: 'm01/a01/desafio-let',
    conceito: 'decl:let',
    language: 'nodejs',
    statement: 'Declare a variável contador e reatribua 2.',
    starterCode: 'let contador = 1;',
    solutionCode: 'let contador = 1; contador = 2;',
    testsCode: 'assert.equal(contador, 2);',
    expectedTestCount: 1,
    outputChannel: 'retorno',
    requires: ['decl:let'],
    notRequired: ['node:IfStatement'],
    subgoals: ['declarar com let'],
    scenarios: [{ tipo: 'limite', derivado_de: 'decl:let', descricao: 'reatribuir muda o valor da célula' }],
    taskSkill: 'escrever sintaxe',
    supportLevel: 'sem_andaime',
    surfaceDomain: 'variáveis',
    solutionAlternates: [],
    wrongSolutions: ['let contador = 1;'],
    requirements: [{ id: 'REQ-1', descricao: 'declara com let', teste: 'decl:let presente' }],
    justificativa: 'exercita a construção nova da aula',
    aprovado: true,
  };
}

/** O dossiê bruto — entrada de `montarDossie` (todos os 13 campos do §7.1). */
function dossieBase(): Record<string, unknown> {
  return {
    objetivo: {
      verbo: 'declarar',
      objeto: 'uma variável mutável',
      contexto: 'num programa de console',
      criterio: 'declara com let e reatribui sem erro',
    },
    introduces_productive: ['decl:let'],
    budget_produtivo: ['decl:let', 'op:assignment:='],
    budget_receptivo: ['decl:let', 'node:VariableDeclaration', 'node:ExpressionStatement'],
    budget_teste: ['api:assert.equal', 'node:CallExpression'],
    kc_type: 'decl',
    ei_class: 'regra',
    subgoals: ['declarar com let', 'reatribuir com ='],
    terms: ['variável', 'mutável'],
    notional_machine_delta: 'a célula da variável muda de valor na reatribuição',
    fora_de_escopo: [{ item: 'const', motivo: 'é construção de aula posterior no grafo' }],
    misconceptions_a_refutar: [{ concepcao: 'let declara constante', ancora_na_spec: 'ECMA-262 §13.3.2' }],
    desafios_ja_escritos: [desafioJaEscrito()],
  };
}

/** O dossiê JÁ MONTADO (validado pelo portão) — o que o autor e o prompt veem. */
function dossieCompleto(): Dossier {
  return montarDossie(dossieBase());
}

/** Remove um campo de um dossiê montado, mantendo o resto intacto. */
function omitirCampo(dossie: Dossier, campo: string): Record<string, unknown> {
  const copia: Record<string, unknown> = { ...dossie };
  delete copia[campo];
  return copia;
}

/** Os 13 campos do dossiê, na ordem da enumeração do §7.1 — FIXADOS por nome. */
const CAMPOS_ESPERADOS: readonly string[] = [
  'objetivo',
  'introduces_productive',
  'budget_produtivo',
  'budget_receptivo',
  'budget_teste',
  'kc_type',
  'ei_class',
  'subgoals',
  'terms',
  'notional_machine_delta',
  'fora_de_escopo',
  'misconceptions_a_refutar',
  'desafios_ja_escritos',
];

// ---------------------------------------------------------------------------
// 1. Dossiê incompleto RECUSA o spawn e nomeia o campo (A-P11-2)
// ---------------------------------------------------------------------------

describe('dossiê — a recusa do spawn nomeia o campo faltante (A-P11-2)', () => {
  it('fixa por nome os campos obrigatórios do §7.1 (12 + os desafios já escritos)', () => {
    assert.deepEqual([...CAMPOS_DO_DOSSIE], CAMPOS_ESPERADOS);
  });

  it('aceita o dossiê completo', () => {
    const dossie = dossieCompleto();
    assert.equal(dossie.introduces_productive.length, 1);
    assert.equal(dossie.desafios_ja_escritos.length, 1);
    assert.equal(dossie.objetivo.verbo, 'declarar');
  });

  it('recusa quando QUALQUER campo falta — e nomeia EXATAMENTE o campo', () => {
    const dossie = dossieCompleto();
    for (const campo of CAMPOS_DO_DOSSIE) {
      assert.throws(
        () => montarDossie(omitirCampo(dossie, campo)),
        (erro: unknown) => {
          assert.ok(erro instanceof ErroDossieIncompleto, `campo "${campo}": deve lançar ErroDossieIncompleto`);
          assert.equal(erro.campoFaltante, campo, `campo "${campo}": o erro deve nomear o campo faltante`);
          assert.ok(erro.message.includes(campo), `campo "${campo}": a mensagem deve citar o campo`);
          return true;
        },
        `campo "${campo}" ausente deveria recusar o spawn`,
      );
    }
  });

  it('recusa entradas que nem são objeto', () => {
    assert.throws(
      () => montarDossie(undefined),
      (erro: unknown) => erro instanceof ErroDossieIncompleto && erro.campoFaltante === null,
    );
    assert.throws(() => montarDossie('não é objeto'), ErroDossieIncompleto);
  });

  it('recusa valor presente mas com o tipo errado, nomeando o campo', () => {
    const dossie = dossieCompleto();
    const comTipoErrado = { ...dossie, budget_produtivo: 'lista-em-texto' };
    assert.throws(
      () => montarDossie(comTipoErrado),
      (erro: unknown) => erro instanceof ErroDossieIncompleto && erro.campoFaltante === 'budget_produtivo',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. O orçamento aparece LITERAL e COMPLETO, sem reticências (A-P11-2b)
// ---------------------------------------------------------------------------

describe('orçamento literal e completo no prompt (A-P11-2b)', () => {
  it('reproduz cada item das três listas integralmente, na própria linha', () => {
    const prompt = gerarPromptAutor(dossieCompleto());
    const dossie = dossieCompleto();
    const todosOsItens = [
      ...dossie.budget_produtivo,
      ...dossie.budget_receptivo,
      ...dossie.budget_teste,
    ];
    for (const item of todosOsItens) {
      assert.ok(prompt.includes(`  - ${item}`), `o item "${item}" deve aparecer literal no prompt`);
    }
  });

  it('declara as três seções como listas literais e completas', () => {
    const prompt = gerarPromptAutor(dossieCompleto());
    assert.ok(prompt.includes('budget_produtivo (lista literal e completa, sem resumo, sem truncamento):'));
    assert.ok(prompt.includes('budget_receptivo (lista literal e completa, sem resumo, sem truncamento):'));
    assert.ok(prompt.includes('budget_teste (lista literal e completa, sem resumo, sem truncamento):'));
  });

  it('não contém reticências de truncamento em lugar nenhum', () => {
    const prompt = gerarPromptAutor(dossieCompleto());
    assert.ok(!prompt.includes('...'), 'o prompt não pode ter reticências de três pontos');
    assert.ok(!prompt.includes('…'), 'o prompt não pode ter reticências de um caractere');
  });
});

// ---------------------------------------------------------------------------
// 3. As 18 regras duras, transcritas, numeradas e por id (A-P11-2)
// ---------------------------------------------------------------------------

describe('as dezoito regras duras do §7.1 (A-P11-2)', () => {
  it('são 18, com ids sequenciais R1..R18 e nome próprio', () => {
    assert.equal(REGRAS_DURAS_DO_AUTOR.length, 18);
    REGRAS_DURAS_DO_AUTOR.forEach((regra, indice) => {
      assert.equal(regra.id, `R${indice + 1}`, `a regra ${indice + 1} precisa ter id R${indice + 1}`);
      assert.ok(regra.nome.length > 0, `a regra ${regra.id} precisa de nome`);
      assert.ok(regra.texto.length > 0, `a regra ${regra.id} precisa de texto`);
    });
  });

  it('o prompt contém as 18 regras como linhas nomeadas, rastreáveis por id', () => {
    const prompt = gerarPromptAutor(dossieCompleto());
    for (let indice = 1; indice <= 18; indice += 1) {
      assert.ok(
        prompt.includes(`R${indice} — `),
        `o prompt perdeu a regra R${indice} — barra regra faltante (A-P11-2)`,
      );
    }
  });

  it('transcreve o conteúdo das regras (não só o rótulo)', () => {
    const prompt = gerarPromptAutor(dossieCompleto());
    assert.ok(
      prompt.includes('R3 — orçamento é lei: Orçamento é lei. Qualquer construção, palavra-chave, operador ou API fora das listas é proibida'),
      'a regra R3 precisa estar transcrita, não só nomeada',
    );
    assert.ok(prompt.includes('R18 — checksum de cauda: Ao final, repita a lista de construções permitidas (checksum).'));
  });
});

// ---------------------------------------------------------------------------
// 4. Frases proibidas AUSENTES (A-P11-4)
// ---------------------------------------------------------------------------

describe('frases proibidas ausentes do prompt (A-P11-4)', () => {
  const frasesProibidas = [
    'pense profundamente',
    'pense passo a passo',
    'pense profundamente, passo a passo',
    'passo a passo',
    'recomece do zero',
    'comece do zero',
  ];

  it('nenhuma variação da frase de pensamento profundo nem de recomeço', () => {
    const prompt = gerarPromptAutor(dossieCompleto()).toLowerCase();
    for (const frase of frasesProibidas) {
      assert.ok(
        !prompt.includes(frase),
        `o prompt contém a frase proibida "${frase}" (A-P11-4) — a proibição é descrita sem citar a literal`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Checksum de cauda (A-P11-5)
// ---------------------------------------------------------------------------

describe('checksum de cauda (A-P11-5)', () => {
  it('o prompt TERMINA pedindo a repetição da lista de construções permitidas', () => {
    const dossie = dossieCompleto();
    const prompt = gerarPromptAutor(dossie);
    const permitidas = construcoesPermitidas(dossie);
    assert.ok(prompt.includes('=== CHECKSUM DE CAUDA ==='));
    assert.ok(prompt.includes('Ao final da sua resposta, repita a lista de construções permitidas, item a item, sem resumo e sem truncamento.'));
    // o último conteúdo do prompt é a própria lista — o que o modelo deve repetir.
    assert.ok(
      prompt.trimEnd().endsWith(`  - ${permitidas[permitidas.length - 1]}`),
      'a cauda do prompt termina na lista de construções permitidas',
    );
  });

  it('a comparação aceita a repetição fiel e detecta a lista divergente', () => {
    const dossie = dossieCompleto();
    const permitidas = construcoesPermitidas(dossie);
    assert.ok(permitidas.length >= 3, 'fixture: a lista de permitidas precisa ser expressiva');

    const repeticaoFiel = permitidas.join('\n');
    assert.deepEqual(compararChecksum(permitidas, repeticaoFiel), { ok: true, faltando: [], extras: [] });

    const comFalta = permitidas.filter((item) => item !== permitidas[0]).join('\n');
    const resultadoComFalta = compararChecksum(permitidas, comFalta);
    assert.equal(resultadoComFalta.ok, false, 'omissão de item deve ser divergência');
    assert.ok(resultadoComFalta.faltando.includes(permitidas[0]), 'a divergência nomeia o item faltante');

    const comExtra = `${repeticaoFiel}\n- op:fabricado`;
    const resultadoComExtra = compararChecksum(permitidas, comExtra);
    assert.equal(resultadoComExtra.ok, false, 'item estranho deve ser divergência');
    assert.ok(resultadoComExtra.extras.includes('op:fabricado'), 'a divergência nomeia o item extra');

    const comSubstituicao = permitidas.map((item) => (item === permitidas[1] ? 'op:trocado' : item)).join('\n');
    const resultadoComTroca = compararChecksum(permitidas, comSubstituicao);
    assert.equal(resultadoComTroca.ok, false, 'substituição deve ser divergência');
    assert.ok(resultadoComTroca.faltando.includes(permitidas[1]));
    assert.ok(resultadoComTroca.extras.includes('op:trocado'));
  });

  it('a lista que a máquina confere é exatamente a união dos três orçamentos', () => {
    const dossie = dossieCompleto();
    const permitidas = construcoesPermitidas(dossie);
    for (const item of [...dossie.budget_receptivo, ...dossie.budget_produtivo, ...dossie.budget_teste]) {
      assert.ok(permitidas.includes(item), `"${item}" precisa estar nas construções permitidas`);
    }
    assert.equal(new Set(permitidas).size, permitidas.length, 'a lista de permitidas não tem duplicatas');
  });
});

// ---------------------------------------------------------------------------
// 6. `blocked` é RESULTADO VÁLIDO, não falha (§7.1 R3)
// ---------------------------------------------------------------------------

describe('saída de emergência blocked (§7.1 R3, A-P11-2)', () => {
  it('o prompt declara a saída de emergência e o formato das chaves', () => {
    const prompt = gerarPromptAutor(dossieCompleto());
    assert.ok(prompt.includes('blocked'));
    assert.ok(prompt.includes('missing'));
    assert.ok(prompt.includes('motivo'));
    assert.ok(
      prompt.includes('blocked é resultado VÁLIDO da chamada, não falha; improvisar é que é defeito.'),
      'o prompt precisa declarar que blocked é esperado e que improvisar é o defeito',
    );
  });

  it('o discriminador aceita blocked bem formado e rejeita o resto', () => {
    assert.equal(
      isBlocked({ blocked: true, missing: ['op:unary:typeof'], motivo: 'fora do orçamento vigente' }),
      true,
      'blocked bem formado é resultado válido',
    );
    assert.equal(isBlocked({ blocked: true, missing: 'nao-e-array', motivo: 'x' }), false, 'missing precisa ser array');
    assert.equal(isBlocked({ blocked: false, missing: [], motivo: 'x' }), false, 'blocked precisa ser true');
    assert.equal(isBlocked(null), false);
    assert.equal(isBlocked('blocked'), false);
  });

  it('um DRAFT completo não é confundido com blocked', () => {
    const draft = {
      raciocinio_de_projeto: 'a aula ensina let como menor incremento demonstrável',
      slug: 'm01/a01',
      title: 'Variáveis mutáveis com let',
      objective: {
        verbo: 'declarar',
        enunciado: 'declara uma variável mutável',
        contexto: 'num programa de console',
        criterio: 'declara com let e reatribui sem erro',
      },
      introduces: { receptive: ['decl:let'], productive: ['decl:let'] },
      introducesTerms: ['mutável'],
      foraDeEscopo: ['const'],
      eiClass: 'regra',
      targetAtom: 'decl:let',
      notionalMachineDelta: 'a célula da variável muda na reatribuição',
      budgetHash: 'abc123',
      budgetVersion: '2026-08-30',
      research: ['ecma-262'],
      theory: [{ id: 't1', secao: 'teoria', markdown: 'uma variável guarda um valor; let permite trocar', tag: 'js' }],
      justificativa: 'menor incremento demonstrável sobre o estado de conhecimento',
      role: 'regular',
      status: 'rascunho',
      aprovado: false,
    };
    assert.equal(isBlocked(draft), false, 'draft não é blocked');
  });
});

// ---------------------------------------------------------------------------
// 7. Schema de saída: raciocínio ANTES de decisão (A-P11-7 / INV-04)
// ---------------------------------------------------------------------------

describe('schema de saída do autor (A-P11-7)', () => {
  it('põe raciocinio_de_projeto ANTES de qualquer campo de decisão', () => {
    const chaves = Object.keys(AuthorOutputSchema.shape);
    assert.equal(chaves[0], 'raciocinio_de_projeto', 'o raciocínio domina o schema (INV-04)');
    for (const decisao of DECISION_FIELD_NAMES) {
      const indice = chaves.indexOf(decisao);
      if (indice === -1) continue;
      assert.ok(
        indice > chaves.indexOf('raciocinio_de_projeto'),
        `campo de decisão "${decisao}" não pode vir antes do raciocínio (INV-04)`,
      );
    }
  });

  it('passa no lint de ordem do P-04 (lintOrdemCampos sobre o schema do autor)', () => {
    const problemas = lintOrdemCampos([{ nome: 'autor-output', schema: AuthorOutputSchema }]);
    assert.deepEqual(problemas, [], 'nenhum par decisão×justificativa invertido (INV-04)');
  });

  it('não tem campos opcionais (INV-05)', () => {
    const opcionais = encontrarCamposOpcionais([{ nome: 'autor-output', schema: AuthorOutputSchema }]);
    assert.deepEqual(opcionais, [], 'nenhum .optional()/.default()/união com undefined (INV-05)');
  });

  it('aceita um draft completo escrito com raciocínio primeiro', () => {
    const draft = AuthorOutputSchema.parse({
      raciocinio_de_projeto: 'a aula ensina let como menor incremento demonstrável',
      slug: 'm01/a01',
      title: 'Variáveis mutáveis com let',
      objective: {
        verbo: 'declarar',
        enunciado: 'declara uma variável mutável',
        contexto: 'num programa de console',
        criterio: 'declara com let e reatribui sem erro',
      },
      introduces: { receptive: ['decl:let'], productive: ['decl:let'] },
      introducesTerms: ['mutável'],
      foraDeEscopo: ['const'],
      eiClass: 'regra',
      targetAtom: 'decl:let',
      notionalMachineDelta: 'a célula da variável muda na reatribuição',
      budgetHash: 'abc123',
      budgetVersion: '2026-08-30',
      research: ['ecma-262'],
      theory: [{ id: 't1', secao: 'teoria', markdown: 'uma variável guarda um valor; let permite trocar', tag: 'js' }],
      justificativa: 'menor incremento demonstrável sobre o estado de conhecimento',
      role: 'regular',
      status: 'rascunho',
      aprovado: false,
    });
    assert.equal(draft.raciocinio_de_projeto, 'a aula ensina let como menor incremento demonstrável');
    assert.equal(draft.status, 'rascunho');
  });
});

// ---------------------------------------------------------------------------
// 8. Bônus — prompt função pura do dossiê (A-P11-3) + teto de saída (§7)
// ---------------------------------------------------------------------------

describe('função pura do dossiê (A-P11-3)', () => {
  it('dois dossiês iguais (montados independentemente) produzem o MESMO texto byte a byte', () => {
    const promptA = gerarPromptAutor(montarDossie(dossieBase()));
    const promptB = gerarPromptAutor(montarDossie(dossieBase()));
    assert.equal(promptA, promptB, 'mesmo dossiê → mesmo texto BYTE A BYTE (A-P11-3)');
  });

  it('dossiês diferentes produzem textos diferentes', () => {
    const original = dossieCompleto();
    const comItemNovoNoOrcamento = montarDossie({
      ...dossieBase(),
      budget_produtivo: [...original.budget_produtivo, 'op:unary:typeof'],
    });
    assert.notEqual(
      gerarPromptAutor(original),
      gerarPromptAutor(comItemNovoNoOrcamento),
      'dossiê diferente precisa alterar o prompt — o orçamento entra literal',
    );
  });
});

describe('teto de saída (§7: toda saída cabe em 2000 tokens)', () => {
  it('declara a constante do teto', () => {
    assert.equal(MAX_TOKENS_SAIDA_AUTOR, 2000);
  });

  it('o prompt informa o teto ao modelo', () => {
    const prompt = gerarPromptAutor(dossieCompleto());
    assert.ok(prompt.includes('2000 tokens'), 'o prompt precisa declarar o teto de 2000 tokens');
    assert.ok(prompt.includes('REJEITADA'), 'o prompt precisa declarar que acima do teto a saída é rejeitada');
  });

  it('rejeitarAcimaDoTeto é função pura: aceita até o teto, lança acima', () => {
    assert.doesNotThrow(() => rejeitarAcimaDoTeto('conteúdo curto'));
    assert.doesNotThrow(() => rejeitarAcimaDoTeto('a'.repeat(MAX_TOKENS_SAIDA_AUTOR * 4)), 'no teto ainda cabe');
    assert.throws(() => rejeitarAcimaDoTeto('a'.repeat(MAX_TOKENS_SAIDA_AUTOR * 4 + 1)), /acima do teto/);
  });
});