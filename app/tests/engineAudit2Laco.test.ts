/**
 * tests/engineAudit2Laco.test.ts — P-35 "Ponte audit→laço (audit2Laco)"
 * (replan onda 3 — habilita o P-23). A ponte entre o `AuditReport` do
 * `auditTrack` (engine/audit.ts) e o laço F11 (engine/review/loop.ts): cada
 * violação do audit vira `ViolacaoMecanica` com span no ARQUIVO JSON INTEIRO,
 * o "primeiroEnsina" vira `SnapshotDeOrcamento`, e a trilha ganha um
 * verificador de orçamento INJETÁVEL que re-verifica ao vivo as construções
 * auditadas por superfície do JSON.
 *
 * Critérios de aceitação (A-P35-1..5):
 *   1. violação do audit → violação mecânica com span no arquivo inteiro
 *      (offset plausível; trechoOfensor contido após decodificar o slice cru);
 *   2. distinção ordem/lacuna preservada (primeiraAulaQueEnsina null e não-null,
 *      §5.5 — o campo que faz o §6.7 escolher entre criar aula e reescrever);
 *   3. snapshotDeOrcamento mapeia construção → aula de origem (índice reverso);
 *   4. verificador da trilha marca a construção fora do orçamento da aula
 *      (fixture de desafio JSON REAL compilado em memória via JSON.stringify)
 *      e fica quieto quando o artefato corrigido tira o átomo do arquivo;
 *   5. JSON inválido no caminho citado → erro ESTRUTURADO nomeando o arquivo
 *      (fail-closed — nunca silêncio), nas duas portas (conversor e verificador).
 *
 * OFFLINE e PURO: fixtures em memória, sem disco, sem rede, sem LLM.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuditReport, AuditRule, Violation } from '../electron/main/engine/audit';
import { extractAtoms, type AtomOccurrence } from '../electron/main/engine/extract';
import { ErroEstruturadoDoLaco } from '../electron/main/engine/review/loop';
import type { ViolacaoMecanica } from '../electron/main/engine/review/loop';
import {
  CODIGO_JSON_QUEBRADO,
  ErroEstruturadoDoAudit2Laco,
  auditEmViolacoesMecanicas,
  criarVerificadorDeOrcamentoDaTrilha,
  localizarValoresDeStringNoJson,
  pinsDasViolacoesDoAudit,
  snapshotDeOrcamentoDoAudit,
} from '../electron/main/engine/review/audit2Laco';

// ---------------------------------------------------------------------------
// Fixtures — desafio/aula JSON REAIS compilados em memória (JSON.stringify
// introduz as escapes `\"`/`\n`/`\\` que o mapeador de spans precisa inverter)
// ---------------------------------------------------------------------------

/** O desafio "soma": conceito funções, solução com `+` (operação binária). */
function desafioJson(): string {
  const desafio = {
    slug: 'soma',
    concept: 'funcoes',
    statement: 'Escreva uma função que soma dois números.',
    starterCode: 'export function soma(a, b) {\n  // complete aqui\n}',
    solutionCode: 'export function soma(a, b) {\n  return a + b;\n}',
    testsCode:
      'import { soma } from "./solution.mjs";\ntest("soma 1 + 2", () => {\n  assert.equal(soma(1, 2), 3);\n});',
    expectedTestCount: 1,
  };
  return JSON.stringify(desafio, null, 2);
}

/** O desafio "saudação": solução com string literal + concatenação (escape `\"`). */
function desafioComAspasJson(): string {
  const desafio = {
    slug: 'saudacao',
    concept: 'strings',
    statement: 'Retorne uma saudação.',
    starterCode: 'export function saudacao(nome) {\n  // complete aqui\n}',
    solutionCode: 'export function saudacao(nome) {\n  return "olá, " + nome;\n}',
    testsCode:
      'import { saudacao } from "./solution.mjs";\ntest("oi", () => {\n  assert.equal(saudacao("ana"), "olá, ana");\n});',
    expectedTestCount: 1,
  };
  return JSON.stringify(desafio, null, 2);
}

/** Desafio MULTI-ARQUIVO: `+` nos dois `solutionCode` — a desambiguação por linha/coluna. */
function desafioMultiArquivoJson(): string {
  const desafio = {
    slug: 'multi',
    concept: 'funcoes',
    statement: 'Implemente as duas funções.',
    files: [
      {
        path: 'soma.mjs',
        starterCode: 'export function soma(a, b) {\n  // complete\n}',
        solutionCode: 'export function soma(a, b) {\n  return a + b;\n}',
      },
      {
        path: 'saudacao.mjs',
        starterCode: 'export function saudacao(nome) {\n  // complete\n}',
        solutionCode: 'export function saudacao(nome) {\n  return "olá, " + nome;\n}',
      },
    ],
    testsCode: 'import { soma } from "./soma.mjs";\ntest("1+2", () => { assert.equal(soma(1, 2), 3); });',
    expectedTestCount: 1,
  };
  return JSON.stringify(desafio, null, 2);
}

/** Aula com teoria em markdown contendo um bloco de código (regra A4 do audit). */
function lessonJsonComTeoria(): string {
  const aula = {
    slug: 'a01-conceitos',
    title: 'Conceitos',
    concepts: ['funcoes'],
    theory: [
      {
        id: 'sec-1',
        markdown:
          '# Introdução\n\nVeja o exemplo:\n\n```js\nfunction dobra(x) {\n  return x * 2;\n}\n```\n\nFim.',
      },
    ],
    challenges: ['desafio-1'],
    prerequisites: [],
  };
  return JSON.stringify(aula, null, 2);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reportes do audit com métricas zeradas (fixture sintética). */
function reportCom(violations: Violation[], trackSlug = 'trilha-teste'): AuditReport {
  return {
    trackSlug,
    budgetSource: 'declared',
    violations,
    metrics: [],
    totals: {
      aulas: 1,
      desafios: 1,
      desafiosComViolacao: violations.length > 0 ? 1 : 0,
      violacoes: violations.length,
      lacunasDeCurriculo: 0,
      aulasSemConstrucaoNova: 0,
    },
    hygiene: [],
    parseErrors: [],
  };
}

/** Fábrica de violação do audit com defaults sintéticos (override por campo). */
function violacaoDe(over: Partial<Violation>): Violation {
  return {
    regra: 'A2' as AuditRule,
    arquivo: 'arquivo.json',
    ref: 'm01/a01',
    campo: 'solutionCode',
    linha: 1,
    coluna: 1,
    construcao: null,
    eixo: null,
    faixa: null,
    trechoOfensor: 'ofensor',
    primeiraAulaQueEnsina: null,
    mensagem: 'mensagem do audit',
    ...over,
  };
}

/** Decodifica o campo do JSON e roda o MESMO caminho do audit (extractAtoms). */
function ocorrenciaDoCampo(conteudo: string, campo: string, construcao: string): AtomOccurrence {
  const dado = JSON.parse(conteudo) as Record<string, unknown>;
  const codigo = dado[campo];
  assert.equal(typeof codigo, 'string', `o campo "${campo}" do fixture precisa ser string`);
  const resultado = extractAtoms(codigo as string, { fileName: `${campo}.mjs` });
  assert.ok(resultado.ok, `o código do campo "${campo}" precisa parsear`);
  const occ = resultado.occurrences.find((o) => o.key === construcao);
  assert.ok(occ, `a construção "${construcao}" precisa aparecer no campo "${campo}" do fixture`);
  return occ;
}

/** O span do slice CRU do arquivo, quando decodificado, contém o trecho? */
function spanDecodificadoContem(conteudo: string, v: Pick<ViolacaoMecanica, 'inicio' | 'fim'>, trecho: string): boolean {
  const slice = conteudo.slice(v.inicio, v.fim);
  try {
    return (JSON.parse(`"${slice}"`) as string).includes(trecho);
  } catch {
    return slice.includes(trecho);
  }
}

/** O valor de string do campo (ou null) num conteúdo — para conferir o span DENTRO dele. */
function valorDoCampo(conteudo: string, campo: string): { inicio: number; fim: number; decodificado: string } | null {
  return localizarValoresDeStringNoJson(conteudo).find((v) => v.campo === campo) ?? null;
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('engine/review/audit2Laco.ts', () => {
  it('(1) violação do audit → violação mecânica com span no arquivo INTEIRO (trecho contido)', () => {
    const caminho = 'modules/m01/lessons/a01/challenges/soma/challenge.json';
    const conteudo = desafioJson();
    const occ = ocorrenciaDoCampo(conteudo, 'solutionCode', 'op:binary:+');

    const violacao = violacaoDe({
      regra: 'A2',
      arquivo: caminho,
      campo: 'solutionCode',
      linha: occ.line,
      coluna: occ.column,
      construcao: 'op:binary:+',
      eixo: 'op',
      faixa: 'productive',
      trechoOfensor: occ.snippet,
      primeiraAulaQueEnsina: null,
      mensagem: 'operação binária fora do orçamento produtivo',
    });
    const [mecanica] = auditEmViolacoesMecanicas(reportCom([violacao]), { [caminho]: conteudo });

    assert.ok(mecanica, 'a violação do audit precisa virar uma violação mecânica');
    // campos preservados
    assert.equal(mecanica.caminho, caminho);
    assert.equal(mecanica.surface, 'solutionCode');
    assert.equal(mecanica.construcao, 'op:binary:+');
    assert.equal(mecanica.tipo, 'orcamento');
    assert.equal(mecanica.linha, occ.line);
    assert.equal(mecanica.coluna, occ.column);
    assert.equal(mecanica.trechoOfensor, occ.snippet);
    assert.equal(mecanica.primeiraAulaQueEnsina, null);
    assert.equal(mecanica.mensagem, violacao.mensagem);

    // (a) span plausível no ARQUIVO INTEIRO (meio-aberto, dentro dos limites)
    assert.ok(mecanica.inicio >= 0, 'inicio não pode ser negativo');
    assert.ok(mecanica.fim > mecanica.inicio, 'span precisa ser não-vazio');
    assert.ok(mecanica.fim <= conteudo.length, 'fim precisa caber no arquivo');

    // (b) o span cai DENTRO do valor decodificado do campo solutionCode
    const valor = valorDoCampo(conteudo, 'solutionCode');
    assert.ok(valor, 'o fixture precisa ter o campo solutionCode');
    assert.ok(mecanica.inicio >= valor.inicio && mecanica.fim <= valor.fim, 'span fora do valor do campo');

    // (c) trechoOfensor CONTIDO: o slice cru, decodificado, contém o snippet
    assert.ok(spanDecodificadoContem(conteudo, mecanica, occ.snippet), 'o slice do span deve conter o trecho ofensor');
  });

  it('(2) distinção ordem/lacuna preservada — primeiraAulaQueEnsina null e não-null (§5.5)', () => {
    const caminho = 'modules/m01/lessons/a01/challenges/soma/challenge.json';
    const conteudo = desafioJson();
    const occ = ocorrenciaDoCampo(conteudo, 'solutionCode', 'op:binary:+');

    // ORDEM: a construção é ensinada em m02/a01 (vem DEPOIS da aula m01/a01).
    const ordem = violacaoDe({
      regra: 'A2',
      arquivo: caminho,
      campo: 'solutionCode',
      linha: occ.line,
      coluna: occ.column,
      construcao: 'op:binary:+',
      trechoOfensor: occ.snippet,
      primeiraAulaQueEnsina: 'm02/a01',
      mensagem: 'operação binária ensinada DEPOIS desta aula',
    });
    // LACUNA: a construção não é ensinada em NENHUMA aula.
    const lacuna = violacaoDe({
      regra: 'A2',
      arquivo: caminho,
      campo: 'solutionCode',
      linha: occ.line,
      coluna: occ.column,
      construcao: 'op:binary:+',
      trechoOfensor: occ.snippet,
      primeiraAulaQueEnsina: null,
      mensagem: 'operação binária não é ensinada em nenhuma aula',
    });

    const [ordemM, lacunaM] = auditEmViolacoesMecanicas(reportCom([ordem, lacuna]), { [caminho]: conteudo });
    assert.equal(ordemM.primeiraAulaQueEnsina, 'm02/a01', 'ordem precisa preservar a aula de origem');
    assert.equal(lacunaM.primeiraAulaQueEnsina, null, 'lacuna precisa preservar null');

    // Os pins SEMEADOS herdam a polaridade §5.5 — lacuna NUNCA reescreve.
    const pins = pinsDasViolacoesDoAudit(reportCom([ordem, lacuna]), { [caminho]: conteudo });
    assert.equal(pins.length, 2, 'as duas violações com construção viram pin');
    const pinOrdem = pins.find((p) => p.apontamento.evidencia.introduzido_em === 'm02/a01');
    const pinLacuna = pins.find((p) => p.apontamento.evidencia.introduzido_em === null);
    assert.ok(pinOrdem, 'o pin de ordem precisa existir');
    assert.ok(pinLacuna, 'o pin de lacuna precisa existir');
    assert.match(pinOrdem.apontamento.acao_sugerida, /reescrever/, 'ordem NUNCA cria aula');
    assert.match(pinLacuna.apontamento.acao_sugerida, /criar a aula/, 'lacuna NUNCA reescreve para caber no furo');
    assert.equal(pinOrdem.afericao.tipo, 'ast');
    assert.equal(pinLacuna.afericao.tipo, 'ast');
    // o trecho do pin é o slice CRU do span (o conteúdo do artefato É o JSON cru)
    assert.ok(conteudo.includes((pinOrdem.afericao as { tipo: 'ast'; trecho: string }).trecho), 'o trecho do pin precisa existir no JSON cru');
  });

  it('(3) snapshotDeOrcamentoDoAudit mapeia construção → aula de origem (índice reverso)', () => {
    const construcoes = [
      violacaoDe({
        arquivo: 'modules/m01/lessons/a02/challenges/c1/challenge.json',
        campo: 'solutionCode',
        construcao: 'op:binary:+',
        faixa: 'productive',
        primeiraAulaQueEnsina: 'm01/a03',
      }),
      violacaoDe({
        arquivo: 'modules/m01/lessons/a02/challenges/c1/challenge.json',
        campo: 'testsCode',
        construcao: 'api:assert.equal',
        faixa: 'receptive',
        primeiraAulaQueEnsina: 'm01/a01',
      }),
      // LACUNA: não entra no índice reverso (não tem aula dona)
      violacaoDe({
        arquivo: 'modules/m01/lessons/a02/challenges/c1/challenge.json',
        campo: 'testsCode',
        construcao: 'global:console',
        faixa: 'receptive',
        primeiraAulaQueEnsina: null,
      }),
      // faixa NÃO declarada → derivada da superfície (starterCode → receptive)
      violacaoDe({
        arquivo: 'modules/m01/lessons/a02/challenges/c1/challenge.json',
        campo: 'starterCode',
        construcao: 'node:FunctionDeclaration',
        faixa: null,
        primeiraAulaQueEnsina: 'm01/a02',
      }),
    ];
    const snapshot = snapshotDeOrcamentoDoAudit(reportCom(construcoes, 'minha-trilha'));

    assert.equal(snapshot.ref, 'minha-trilha');
    assert.equal(snapshot.primeiroEnsina['op:binary:+'], 'm01/a03', 'construção → aula que a ensina');
    assert.equal(snapshot.primeiroEnsina['api:assert.equal'], 'm01/a01');
    assert.equal(snapshot.primeiroEnsina['node:FunctionDeclaration'], 'm01/a02');
    assert.ok(!('global:console' in snapshot.primeiroEnsina), 'lacuna (null) NÃO entra no índice — só o que tem aula dona');

    const superficeSolution = snapshot.surfaces.find((s) => s.superficie === 'solutionCode');
    const superficeStarter = snapshot.surfaces.find((s) => s.superficie === 'starterCode');
    assert.ok(superficeSolution);
    assert.equal(superficeSolution.caminho, 'modules/m01/lessons/a02/challenges/c1/challenge.json');
    assert.equal(superficeSolution.faixa, 'productive', 'solutionCode é a faixa PRODUTIVA (§3.3)');
    assert.ok(superficeStarter);
    assert.equal(superficeStarter.faixa, 'receptive', 'faixa ausente é derivada da superfície');
  });

  it('(4) verificador da trilha marca a construção fora do orçamento da aula (JSON real) e re-verifica ao vivo', async () => {
    const caminho = 'modules/m01/lessons/a01/challenges/soma/challenge.json';
    const conteudo = desafioJson();
    const occ = ocorrenciaDoCampo(conteudo, 'solutionCode', 'op:binary:+');

    const violacao = violacaoDe({
      regra: 'A2',
      arquivo: caminho,
      campo: 'solutionCode',
      linha: occ.line,
      coluna: occ.column,
      construcao: 'op:binary:+',
      faixa: 'productive',
      trechoOfensor: occ.snippet,
      primeiraAulaQueEnsina: 'm01/a01',
      mensagem: 'operação binária fora do orçamento produtivo da aula',
    });
    const verificador = criarVerificadorDeOrcamentoDaTrilha(reportCom([violacao]));

    const artefato = (conteudoEspecifico: string) => ({
      caminho,
      nome: 'desafio',
      conteudo: conteudoEspecifico,
      ultimaEdicao: -1,
    });
    const artefatos = new Map([[caminho, artefato(conteudo)]]);

    const [mecanica] = await verificador(artefatos);
    assert.ok(mecanica, 'o verificador precisa marcar a construção fora do orçamento');
    assert.equal(mecanica.caminho, caminho);
    assert.equal(mecanica.surface, 'solutionCode');
    assert.equal(mecanica.construcao, 'op:binary:+');
    assert.equal(mecanica.tipo, 'orcamento');
    assert.equal(mecanica.primeiraAulaQueEnsina, 'm01/a01');
    assert.ok(spanDecodificadoContem(conteudo, mecanica, occ.snippet), 'span do verificador contém o trecho ofensor');

    // (a) um desafio limpo de construções NÃO auditadas não mexe no verificador…
    const artefatosDeOutroDesafio = new Map([['modules/m01/lessons/a01/challenges/outro/challenge.json', artefato(desafioJson())]]);
    assert.deepEqual(await verificador(artefatosDeOutroDesafio), [], 'caminho fora do audit não acusa');

    // (b) …e o MESMO desafio CORRIGIDO (o átomo saiu do arquivo) fica quieto ~
    //     re-verificação AO VIVO: é o que o laço chamará após a correção.
    const corrigido = desafioJsonComSolucaoSemAtomo();
    const verificacaoPos = await verificador(new Map([[caminho, artefato(corrigido)]]));
    assert.deepEqual(verificacaoPos, [], 'correção que tira o átomo do arquivo verdeia o verificador');
  });

  it('(5) JSON inválido no caminho citado → erro ESTRUTURADO nomeando o arquivo (fail-closed)', () => {
    const caminho = 'modules/m01/lessons/a01/challenges/quebrado/challenge.json';
    const quebrado = '{ "solutionCode": "export function f() { return 1; }", "starterCode": /* nunca fecha */';
    const report = reportCom([violacaoDe({ arquivo: caminho, campo: 'solutionCode' })]);

    assert.throws(
      () => auditEmViolacoesMecanicas(report, { [caminho]: quebrado }),
      (erro: unknown) => {
        assert.ok(erro instanceof ErroEstruturadoDoAudit2Laco, 'erro estruturado da ponte');
        assert.ok(erro instanceof ErroEstruturadoDoLaco, 'compatível com o fail-closed do laço (chamarSeguro)');
        assert.equal(erro.codigo, CODIGO_JSON_QUEBRADO);
        assert.equal(erro.arquivo, caminho, 'o erro NOMEIA o arquivo quebrado');
        assert.match(erro.message, /challenge\.json/);
        return true;
      },
    );
  });

  it('(5b) o verificador da trilha também é fail-closed com JSON quebrado', async () => {
    const caminho = 'modules/m01/lessons/a01/challenges/quebrado/challenge.json';
    const violacao = violacaoDe({ arquivo: caminho, campo: 'solutionCode', construcao: 'op:binary:+' });
    const verificador = criarVerificadorDeOrcamentoDaTrilha(reportCom([violacao]));
    const artefatos = new Map([[caminho, { caminho, nome: 'desafio', conteudo: '{{{{', ultimaEdicao: -1 }]]);

    await assert.rejects(
      async () => {
        verificador(artefatos);
      },
      (erro: unknown) => {
        assert.ok(erro instanceof ErroEstruturadoDoAudit2Laco);
        assert.equal(erro.codigo, CODIGO_JSON_QUEBRADO);
        assert.equal(erro.arquivo, caminho);
        return true;
      },
    );
  });

  it('(bônus) arquivo citado pelo audit mas ausente do mapa → erro estruturado (fail-closed)', () => {
    const report = reportCom([violacaoDe({ arquivo: 'modules/x/lesson.json', campo: 'theory' })]);
    assert.throws(
      () => auditEmViolacoesMecanicas(report, {}),
      (erro: unknown) => {
        assert.ok(erro instanceof ErroEstruturadoDoAudit2Laco);
        assert.equal(erro.arquivo, 'modules/x/lesson.json');
        assert.match(erro.message, /não o carrega/);
        return true;
      },
    );
  });

  it('(bônus) escapes \\" e \\n do JSON são mapeados de volta ao texto CRU do arquivo', () => {
    const caminho = 'modules/m01/lessons/a01/challenges/saudacao/challenge.json';
    const conteudo = desafioComAspasJson();
    // A construção cujo trecho começa NA aspa (StringLiteral) — o slice do span
    // cru precisa conter a aspa ESCAPADA (\").
    const occ = ocorrenciaDoCampo(conteudo, 'solutionCode', 'node:StringLiteral');

    const violacao = violacaoDe({
      regra: 'A2',
      arquivo: caminho,
      campo: 'solutionCode',
      linha: occ.line,
      coluna: occ.column,
      construcao: 'node:StringLiteral',
      trechoOfensor: occ.snippet,
      mensagem: 'string literal fora do orçamento',
    });
    const [mecanica] = auditEmViolacoesMecanicas(reportCom([violacao]), { [caminho]: conteudo });
    assert.ok(mecanica);

    // o slice DO ARQUIVO CRU ainda é texto escapado (\" e \n), não o decodificado
    const slice = conteudo.slice(mecanica.inicio, mecanica.fim);
    assert.match(slice, /\\"/, 'o slice cru precisa conter a aspa ESCAPADA (\\")');
    // …mas ele DECODIFICA para um texto que contém o trecho ofensor
    assert.ok(spanDecodificadoContem(conteudo, mecanica, occ.snippet), 'decodificado contém o trecho ofensor');
  });

  it('(bônus) teoria (A4) — span do código do bloco dentro do markdown do lesson.json', () => {
    const caminho = 'modules/m01/lessons/a01-conceitos/lesson.json';
    const conteudo = lessonJsonComTeoria();
    const dado = JSON.parse(conteudo) as { theory: Array<{ markdown: string }> };
    const markdown = dado.theory[0].markdown;

    // O audit (engine/audit.ts, regra A4): linha = block.line + occ.line - 1,
    // coluna = occ.column — reconstrói o MESMO cálculo com o bloco do fixture.
    const corpo = 'function dobra(x) {\n  return x * 2;\n}';
    const fenceLine = markdown.split('\n').findIndex((l) => l.startsWith('```')) + 1; // 1-based
    const r = extractAtoms(corpo, { fileName: `${caminho}#theory` });
    assert.ok(r.ok);
    const occ = r.occurrences.find((o) => o.key === 'op:binary:*');
    assert.ok(occ, 'o bloco precisa ter uma multiplicação');
    const linha = fenceLine + occ.line - 1;

    const violacao = violacaoDe({
      regra: 'A4',
      arquivo: caminho,
      campo: 'theory',
      linha,
      coluna: occ.column,
      construcao: 'op:binary:*',
      faixa: 'receptive',
      trechoOfensor: occ.snippet,
      primeiraAulaQueEnsina: 'm01/a01',
      mensagem: 'multiplicação fora do orçamento receptivo da teoria',
    });
    const [mecanica] = auditEmViolacoesMecanicas(reportCom([violacao]), { [caminho]: conteudo });
    assert.ok(mecanica);
    assert.ok(spanDecodificadoContem(conteudo, mecanica, occ.snippet), 'o span decodifica para o trecho ofensor dentro do markdown');
    const valor = valorDoCampo(conteudo, 'markdown');
    assert.ok(valor, 'o lesson.json precisa ter o campo markdown');
    assert.ok(mecanica.inicio >= valor.inicio && mecanica.fim <= valor.fim, 'o span do código teórico cai DENTRO do markdown');
  });

  it('(bônus) files[] — a desambiguação por linha/coluna escolhe o valor CERTO do campo', () => {
    const caminho = 'modules/m01/lessons/a01/challenges/multi/challenge.json';
    const conteudo = desafioMultiArquivoJson();

    // `+` existe nos DOIS solutionCode, mas em colunas DIFERENTES:
    //   files[0].solutionCode: "  return a + b;"          (+) coluna 12
    //   files[1].solutionCode: '  return "olá, " + nome;' (+) coluna 18
    const dados = JSON.parse(conteudo) as { files: Array<{ path: string; solutionCode: string }> };
    const segundo = dados.files[1].solutionCode;
    const r = extractAtoms(segundo, { fileName: `${caminho}#files[saudacao.mjs].solutionCode` });
    assert.ok(r.ok);
    const occ = r.occurrences.find((o) => o.key === 'op:binary:+');
    assert.ok(occ);

    const violacao = violacaoDe({
      regra: 'A2',
      arquivo: caminho,
      campo: 'solutionCode',
      linha: occ.line,
      coluna: occ.column,
      construcao: 'op:binary:+',
      faixa: 'productive',
      trechoOfensor: occ.snippet,
      mensagem: 'concatenação fora do orçamento produtivo',
    });
    const [mecanica] = auditEmViolacoesMecanicas(reportCom([violacao]), { [caminho]: conteudo });
    assert.ok(mecanica);

    // o span precisa cair DENTRO do solutionCode DO SEGUNDO arquivo (saudacao.mjs)
    const valores = localizarValoresDeStringNoJson(conteudo).filter((v) => v.campo === 'solutionCode');
    assert.equal(valores.length, 2, 'o fixture multi-arquivo tem dois solutionCode');
    const valorDaSaudacao = valores.find((v) => v.decodificado.includes('saudacao'));
    assert.ok(valorDaSaudacao, 'o segundo solutionCode contém a função saudacao');
    assert.ok(
      mecanica.inicio >= valorDaSaudacao.inicio && mecanica.fim <= valorDaSaudacao.fim,
      'o span do `+` deve cair no solutionCode de saudacao.mjs, não no de soma.mjs',
    );
    assert.ok(spanDecodificadoContem(conteudo, mecanica, occ.snippet));
  });
});

/** O mesmo desafio "soma" com a solução SEM o átomo auditado (`+` → `Math.max`). */
function desafioJsonComSolucaoSemAtomo(): string {
  const desafio = {
    slug: 'soma',
    concept: 'funcoes',
    statement: 'Escreva uma função que soma dois números.',
    starterCode: 'export function soma(a, b) {\n  // complete aqui\n}',
    solutionCode: 'export function soma(a, b) {\n  return Math.max(a, b);\n}',
    testsCode:
      'import { soma } from "./solution.mjs";\ntest("soma 1 + 2", () => {\n  assert.equal(soma(1, 2), 3);\n});',
    expectedTestCount: 1,
  };
  return JSON.stringify(desafio, null, 2);
}