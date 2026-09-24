/**
 * tests/cx-phases-review-audit2laco.test.ts — CARACTERIZAÇÃO (golden master)
 * de `engine/review/audit2Laco.ts` (a ponte audit→laço, P-35).
 *
 * PINA: os primitivos de posição (`offsetNaLinhaColuna`,
 * `localizarValoresDeStringNoJson`, `localizarSpanNoArquivo` com os 3 estágios
 * e o mapeamento de escapes), a conversão AuditReport→ViolacaoMecanica (com
 * preservação de `primeiraAulaQueEnsina` — null = lacuna de currículo), o
 * snapshot (índice reverso + `permitidos` VAZIO por decisão), o verificador
 * injetável (re-checagem viva por AST) e os pins semeados, além do fail-closed
 * estruturado (JSON quebrado / arquivo ausente nomeando o arquivo).
 *
 * PURO: fixtures JSON em memória, sem disco, sem rede, sem LLM.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AuditReport, Violation } from '../electron/main/engine/audit';
import {
  CODIGO_ARQUIVO_AUSENTE,
  CODIGO_JSON_QUEBRADO,
  ErroEstruturadoDoAudit2Laco,
  auditEmViolacoesMecanicas,
  criarVerificadorDeOrcamentoDaTrilha,
  localizarSpanNoArquivo,
  localizarValoresDeStringNoJson,
  offsetNaLinhaColuna,
  pinsDasViolacoesDoAudit,
  snapshotDeOrcamentoDoAudit,
  type ValorDeStringNoJson,
} from '../electron/main/engine/review/audit2Laco';
import { ErroEstruturadoDoLaco } from '../electron/main/engine/review/loop';
import { REPRODUZIVEL_MECANICO_PREFIX } from '../electron/main/engine/review/filter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function violacao(over: Partial<Violation> = {}): Violation {
  return {
    regra: 'I12',
    arquivo: 'desafio.json',
    ref: 'modulo-1/aula-1',
    campo: 'solutionCode',
    linha: 1,
    coluna: 1,
    construcao: 'op:binary:+',
    eixo: 'op',
    faixa: 'productive',
    trechoOfensor: '+ b;',
    primeiraAulaQueEnsina: 'modulo-2/aula-3',
    mensagem: 'construção op:binary:+ usada antes de ser ensinada.',
    ...over,
  } as Violation;
}

function relatorio(violations: Violation[], over: Partial<AuditReport> = {}): AuditReport {
  return { trackSlug: 'trilha-js', violations, ...over } as unknown as AuditReport;
}

/** Um challenge.json cru com escapes reais de JSON. */
const CONTEUDO_JSON =
  '{"solutionCode": "export function soma(a, b) {\\n  return a + b;\\n}\\n", "statement": "some dois valores.", "expectedTestCount": 2}';

// ---------------------------------------------------------------------------
// 1. Primitivas de posição
// ---------------------------------------------------------------------------

describe('audit2Laco — offsetNaLinhaColuna (linha/coluna 1-based → offset 0-based)', () => {
  it('traduz posições e CLAMPA no tamanho do texto', () => {
    const texto = 'abc\ndef';
    assert.equal(offsetNaLinhaColuna(texto, 1, 1), 0);
    assert.equal(offsetNaLinhaColuna(texto, 1, 3), 2);
    assert.equal(offsetNaLinhaColuna(texto, 2, 1), 4);
    assert.equal(offsetNaLinhaColuna(texto, 2, 3), 6);
    assert.equal(offsetNaLinhaColuna(texto, 1, 99), texto.length, 'coluna além do fim clampa');
    assert.equal(offsetNaLinhaColuna(texto, 99, 1), texto.length, 'linha além do fim clampa');
    assert.equal(offsetNaLinhaColuna(texto, 0, 0), 0, 'linha/coluna < 1 são coagidos para 1');
  });
});

describe('audit2Laco — localizarValoresDeStringNoJson', () => {
  it('encontra pares "chave": "valor" em QUALQUER nível com cru e decodificado', () => {
    const texto = '{"a": "um\\ndois", "lista": [{"markdown": "texto"}], "n": 3, "b": true}';
    const valores = localizarValoresDeStringNoJson(texto);
    assert.deepEqual(valores.map((v) => v.campo).sort(), ['a', 'markdown']);
    const a = valores.find((v) => v.campo === 'a') as ValorDeStringNoJson;
    assert.equal(a.cru, 'um\\ndois', 'o cru mantém a escape de 2 caracteres');
    assert.equal(a.decodificado, 'um\ndois', 'o decodificado é o que o JSON.parse vê');
    assert.equal(texto.slice(a.inicio - 1, a.inicio), '"', 'inicio cai logo após a aspa de abertura');
    assert.equal(texto.slice(a.fim, a.fim + 1), '"', 'fim cai antes da aspa de fecho');
  });

  it('aspas escapadas DENTRO de valores não confundem o scanner (não viram pares)', () => {
    const texto = '{"nota": "chave falsa \\"falsa\\": \\"valor\\" no meio", "depois": "ok"}';
    const campos = localizarValoresDeStringNoJson(texto).map((v) => v.campo);
    assert.deepEqual(campos, ['nota', 'depois']);
    assert.ok(!campos.includes('falsa'), 'o par forjado dentro do valor não é emitido');
  });
});

describe('audit2Laco — localizarSpanNoArquivo (3 estágios)', () => {
  it('estágio 1: acha o trecho no valor DECODIFICADO do campo e mapeia o span ao CRU (escapes!)', () => {
    const conteudo = '{"solutionCode": "um\\ndois tres"}';
    const valores = localizarValoresDeStringNoJson(conteudo);
    const span = localizarSpanNoArquivo(conteudo, valores, {
      campo: 'solutionCode',
      linha: 2,
      coluna: 1,
      trecho: 'dois',
    });
    assert.equal(conteudo.slice(span.inicio, span.fim), 'dois', 'o span cru cobre EXATAMENTE o trecho');
  });

  it('estágio 1: quando o campo tem várias entradas, a posição mais próxima da linha/coluna vence', () => {
    const conteudo = '{"files": ["codigo repetido aqui", "outro bloco codigo repetido aqui"]}';
    const valores = localizarValoresDeStringNoJson(conteudo);
    // O trecho existe nos DOIS valores; a linha/coluna aponta para o início do
    // primeiro valor — o candidato mais próximo do esperado é escolhido.
    const span = localizarSpanNoArquivo(conteudo, valores, {
      campo: 'files',
      linha: 1,
      coluna: 2,
      trecho: 'codigo repetido',
    });
    assert.equal(conteudo.slice(span.inicio, span.fim), 'codigo repetido');
  });

  it('estágio 2: trecho fora de valores string cai na busca VERBATIM no arquivo', () => {
    const conteudo = '{"n": 42, "esperado": "x"}';
    const span = localizarSpanNoArquivo(conteudo, [], {
      campo: 'n',
      linha: 1,
      coluna: 8,
      trecho: '42',
    });
    assert.deepEqual(span, { inicio: conteudo.indexOf('42'), fim: contechoEnd(conteudo, '42') });
  });

  it('estágio 3: trecho INEXISTENTE cai no fallback de linha/coluna (documentado)', () => {
    const conteudo = 'linha um\nlinha dois\n';
    const span = localizarSpanNoArquivo(conteudo, [], {
      campo: 'campo-qualquer',
      linha: 2,
      coluna: 7,
      trecho: 'trecho que sumiu',
    });
    assert.equal(span.inicio, offsetNaLinhaColuna(conteudo, 2, 7));
    assert.ok(span.fim > span.inicio, 'span nunca vazio');
    assert.ok(span.fim <= conteudo.length);
  });

  it('trecho VAZIO usa o fallback de linha/coluna com comprimento 1', () => {
    const conteudo = 'abcde';
    assert.deepEqual(localizarSpanNoArquivo(conteudo, [], { campo: 'x', linha: 1, coluna: 3, trecho: '' }), {
      inicio: 2,
      fim: 3,
    });
  });
});

function contechoEnd(texto: string, trecho: string): number {
  return texto.indexOf(trecho) + trecho.length;
}

// ---------------------------------------------------------------------------
// 2. AuditReport → ViolacaoMecanica[]
// ---------------------------------------------------------------------------

describe('audit2Laco — auditEmViolacoesMecanicas', () => {
  it('cada violação vira ViolacaoMecanica tipo "orcamento" com span no arquivo CRU e lacuna preservada', () => {
    const vOrdem = violacao();
    const vLacuna = violacao({
      id: undefined,
      construcao: 'node:IfStatement',
      trechoOfensor: 'soma(a, b)',
      primeiraAulaQueEnsina: null,
      mensagem: 'if usado sem aula dona.',
    } as Partial<Violation>);
    const saida = auditEmViolacoesMecanicas(relatorio([vOrdem, vLacuna]), { 'desafio.json': CONTEUDO_JSON });

    assert.equal(saida.length, 2);
    const [m1, m2] = saida;
    assert.equal(m1.tipo, 'orcamento');
    assert.equal(m1.caminho, 'desafio.json');
    assert.equal(m1.surface, 'solutionCode');
    assert.equal(m1.construcao, 'op:binary:+');
    assert.equal(m1.primeiraAulaQueEnsina, 'modulo-2/aula-3', 'violação de ORDEM preserva a aula dona');
    assert.equal(m2.primeiraAulaQueEnsina, null, 'null = LACUNA DE CURRÍCULO (§5.5) preservado');
    assert.equal(m2.construcao, 'node:IfStatement');
    assert.equal(CONTEUDO_JSON.slice(m1.inicio, m1.fim), '+ b;', 'span cobre o trecho ofensor no arquivo cru');
    assert.equal(m1.mensagem, vOrdem.mensagem);
  });

  it('construção estrutural (null) vira string vazia; linha/coluna nunca < 1', () => {
    const v = violacao({ construcao: null, linha: 0, coluna: -3, campo: 'lesson' });
    const [m] = auditEmViolacoesMecanicas(relatorio([v]), { 'desafio.json': CONTEUDO_JSON });
    assert.equal(m.construcao, '');
    assert.equal(m.linha, 1);
    assert.equal(m.coluna, 1);
  });

  it('fail-closed: arquivo citado ausente do mapa é erro estruturado nomeando o arquivo', () => {
    const v = violacao({ arquivo: 'sumiu.json' });
    assert.throws(
      () => auditEmViolacoesMecanicas(relatorio([v]), { 'desafio.json': CONTEUDO_JSON }),
      (erro: unknown) => {
        assert.ok(erro instanceof ErroEstruturadoDoAudit2Laco);
        assert.ok(erro instanceof ErroEstruturadoDoLaco, 'atravessa o chamarSeguro do laço sem re-embrulho');
        assert.equal(erro.codigo, CODIGO_ARQUIVO_AUSENTE);
        assert.equal(erro.etapa, 'audit2laco');
        assert.equal(erro.arquivo, 'sumiu.json');
        return true;
      },
    );
  });

  it('fail-closed: JSON quebrado no arquivo citado é erro estruturado (o laço nunca o revisa)', () => {
    assert.throws(
      () => auditEmViolacoesMecanicas(relatorio([violationComArquivoQuebrado()]), { 'quebrado.json': '{não é json' }),
      (erro: unknown) =>
        erro instanceof ErroEstruturadoDoAudit2Laco &&
        erro.codigo === CODIGO_JSON_QUEBRADO &&
        erro.arquivo === 'quebrado.json',
    );
  });
});

function violationComArquivoQuebrado(): Violation {
  return violacao({ arquivo: 'quebrado.json' });
}

// ---------------------------------------------------------------------------
// 3. Snapshot de orçamento
// ---------------------------------------------------------------------------

describe('audit2Laco — snapshotDeOrcamentoDoAudit', () => {
  it('índice REVERSO construção→aula: só construções com dona; lacunas ficam de fora; a PRIMEIRA vence', () => {
    const snap = snapshotDeOrcamentoDoAudit(
      relatorio([
        violacao({ construcao: 'op:binary:+', primeiraAulaQueEnsina: 'aula-3' }),
        violacao({ construcao: 'op:binary:+', primeiraAulaQueEnsina: 'aula-9' }),
        violacao({ construcao: 'node:IfStatement', primeiraAulaQueEnsina: null }),
        violacao({ construcao: null, primeiraAulaQueEnsina: 'aula-1' }),
      ]),
    );
    assert.equal(snap.ref, 'trilha-js');
    assert.deepEqual(snap.primeiroEnsina, { 'op:binary:+': 'aula-3' });
  });

  it('surfaces: só campos de CÓDIGO, dedup por (arquivo, campo), permitidos VAZIO por decisão', () => {
    const snap = snapshotDeOrcamentoDoAudit(
      relatorio([
        violacao({ campo: 'solutionCode', faixa: null }),
        violacao({ campo: 'solutionCode', faixa: null }),
        violacao({ campo: 'testsCode', faixa: 'receptive' }),
        violacao({ campo: 'theory', faixa: null }),
        violacao({ campo: 'statement', faixa: null }),
        violacao({ campo: 'lesson', faixa: null }),
      ]),
    );
    assert.deepEqual(
      snap.surfaces.map((s) => [s.superficie, s.faixa, s.permitidos]),
      [
        ['solutionCode', 'productive', []],
        ['testsCode', 'receptive', []],
        ['theory', 'receptive', []],
      ],
      'solutionCode é productive por padrão; statement/lesson não são superfícies de código',
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Verificador injetável (re-checagem viva)
// ---------------------------------------------------------------------------

describe('audit2Laco — criarVerificadorDeOrcamentoDaTrilha (re-checagem ao vivo)', () => {
  function artefato(conteudo: string) {
    return { caminho: 'desafio.json', nome: 'desafio', conteudo, ultimaEdicao: -1 };
  }

  it('correção que REMOVE o átomo verdeia o verificador; regressão volta a acusar', async () => {
    const report = relatorio([violacao()]);
    const verificar = criarVerificadorDeOrcamentoDaTrilha(report);

    const comOfensa = new Map([['desafio.json', artefato(CONTEUDO_JSON)]]);
    const v1 = await Promise.resolve(verificar(comOfensa));
    assert.equal(v1.length, 1, 'a construção auditada ainda está viva — acusa de novo');
    assert.equal(v1[0].construcao, 'op:binary:+');
    assert.equal(v1[0].tipo, 'orcamento');
    assert.equal(v1[0].surface, 'solutionCode');
    assert.match(v1[0].mensagem, /fora do orçamento productive da superfície solutionCode/);
    assert.match(v1[0].mensagem, /auditado em auditTrack/);
    assert.equal(v1[0].primeiraAulaQueEnsina, 'modulo-2/aula-3');

    const semOfensa = new Map([
      ['desafio.json', artefato('{"solutionCode": "export function id(x) {\\n  return x;\\n}\\n"}')],
    ]);
    assert.deepEqual(verificar(semOfensa), [], 'correção que tira o átomo silencia o verificador');
  });

  it('artefato ausente do mapa não acusa (declarado) e JS quebrado no campo não é violação', () => {
    const verificar = criarVerificadorDeOrcamentoDaTrilha(relatorio([violacao()]));
    assert.deepEqual(verificar(new Map()), [], 'superfície ausente é gate de F8, não deste verificador');

    const jsQuebrado = new Map([['desafio.json', artefato('{"solutionCode": "function ("}')]]);
    assert.deepEqual(verificar(jsQuebrado), [], 'parse de JS quebrado é erro de build (§5.3), não violação');
  });

  it('JSON quebrado no artefato vivo é erro estruturado nomeando o arquivo', () => {
    const verificar = criarVerificadorDeOrcamentoDaTrilha(relatorio([violacao()]));
    const mapa = new Map([['desafio.json', artefato('{"solutionCode": ')]]);
    assert.throws(
      () => verificar(mapa),
      (erro: unknown) =>
        erro instanceof ErroEstruturadoDoAudit2Laco &&
        erro.codigo === CODIGO_JSON_QUEBRADO &&
        erro.arquivo === 'desafio.json',
    );
  });

  it('só o que o audit FLAGROU entra na denylist; violação estrutural (construção null) fica de fora', async () => {
    const report = relatorio([
      violacao({ construcao: 'node:FunctionDeclaration', campo: 'solutionCode' }),
      violacao({ construcao: null, campo: 'lesson' }),
    ]);
    const verificar = criarVerificadorDeOrcamentoDaTrilha(report);
    // O código tem MUITAS construções (op:binary:+ etc.), mas só a auditada acusa.
    const v = await Promise.resolve(verificar(new Map([['desafio.json', artefato(CONTEUDO_JSON)]])));
    assert.deepEqual([...new Set(v.map((x) => x.construcao))], ['node:FunctionDeclaration']);
  });
});

// ---------------------------------------------------------------------------
// 5. Pins semeados (contrato com o P-23)
// ---------------------------------------------------------------------------

describe('audit2Laco — pinsDasViolacoesDoAudit', () => {
  it('só violações COM construção viram pin; ids sequenciais AUD-/pin-; aferição ast com o slice CRU', () => {
    const pins = pinsDasViolacoesDoAudit(
      relatorio([
        violacao(),
        violacao({ construcao: 'api:node:test', trechoOfensor: 'node:test', campo: 'testsCode' }),
        violacao({ construcao: null, trechoOfensor: 'qualquer', campo: 'lesson' }),
      ]),
      { 'desafio.json': CONTEUDO_JSON },
    );
    assert.equal(pins.length, 2, 'estrutural (construção null) não vira pin');
    assert.equal(pins[0].id, 'pin-AUD-0001');
    assert.equal(pins[0].apontamento.id, 'AUD-0001');
    assert.equal(pins[1].id, 'pin-AUD-0002');
    assert.equal(pins[0].criado_na_rodada, 0, 'semeado antes da rodada 1');
    assert.equal(pins[0].alvo.caminho, 'desafio.json');
    assert.equal(pins[0].afericao.tipo, 'ast');
    const trecho = (pins[0].afericao as { trecho: string }).trecho;
    assert.ok(CONTEUDO_JSON.includes(trecho), 'o trecho do pin é o slice CRU (decide contra o JSON cru)');
  });

  it('o apontamento do pin segue o contrato do laço: C1, bloqueante, confiança 1, prefixo mecânico', () => {
    const [comDona] = pinsDasViolacoesDoAudit(relatorio([violacao()]), { 'desafio.json': CONTEUDO_JSON });
    const a = comDona.apontamento;
    assert.equal(a.rodada, 0);
    assert.equal(a.regra_violada, 'C1');
    assert.equal(a.severity, 'bloqueante');
    assert.equal(a.confianca, 1);
    assert.equal(a.categoria, 'construcao_nao_ensinada');
    assert.ok(a.evidencia.reproduzivel_por.startsWith(REPRODUZIVEL_MECANICO_PREFIX));
    assert.match(a.acao_sugerida, /mover a aula que a ensina para antes/);
    assert.equal(a.evidencia.introduzido_em, 'modulo-2/aula-3');

    const [lacuna] = pinsDasViolacoesDoAudit(
      relatorio([violacao({ construcao: 'node:IfStatement', primeiraAulaQueEnsina: null })]),
      { 'desafio.json': CONTEUDO_JSON },
    );
    assert.match(lacuna.apontamento.acao_sugerida, /criar a aula que ensina a construção \(lacuna de currículo/);

    const [api] = pinsDasViolacoesDoAudit(
      relatorio([violacao({ construcao: 'api:node:test', trechoOfensor: 'node:test', campo: 'testsCode' })]),
      { 'desafio.json': CONTEUDO_JSON },
    );
    assert.equal(api.apontamento.categoria, 'api_nao_ensinada', 'chaves api: viram api_nao_ensinada');
  });
});
