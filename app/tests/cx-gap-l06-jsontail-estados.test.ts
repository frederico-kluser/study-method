/**
 * tests/cx-gap-l06-jsontail-estados.test.ts — GAP de cobertura do lote L06 sobre
 * `engine/runtime/jsonTail.ts`: a máquina de estados da leitura de STRING
 * (as flags `emString`/`escapado` de `separarJsonECauda`) não tinha cobertura
 * própria para as transições de BARRA INVERTIDA. `engineJsonTail.test.ts` cobre
 * profundidade/chaves dentro de string e prosa antes do JSON.
 *
 * O que estes testes PINAM (é exatamente o que uma extração/refatoração do
 * scanner pode quebrar em silêncio):
 *   - `\"` dentro de string NÃO fecha a string (aspas escapadas);
 *   - `\\` consome a fuga: a aspa seguinte É o fechamento (barra dobrada);
 *   - string pendurada por barra no fim devolve `null` (sem "consertar" JSON).
 *
 * Sem rede, sem LLM, sem chave: função pura sobre string.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { separarJsonECauda } from '../electron/main/engine/runtime/jsonTail';

describe('jsonTail — a máquina de estados das strings (barra invertida)', () => {
  it('aspas ESCAPADAS (\\" ) dentro de string não fecham a string nem o objeto', () => {
    // O texto {"a":"diga \"oi\" {x}"} tem chaves E aspas dentro da string.
    const json = String.raw`{"a":"diga \"oi\" {x}"}`;
    const resultado = separarJsonECauda(`${json}\nCHECKSUM`);
    assert.ok(resultado !== null);
    assert.equal(resultado.json, json);
    assert.equal(resultado.cauda, '\nCHECKSUM');
  });

  it('barra dobrada (\\\\) consome a fuga: a aspa seguinte É o fechamento da string', () => {
    // O valor é c:\\ — dois caracteres barra. Sem a flag `escapado`, a segunda
    // barra "escaparia" a aspa de fechamento e o objeto nunca fecharia.
    const json = String.raw`{"p":"c:\\"}`;
    const resultado = separarJsonECauda(`${json}CAUDA`);
    assert.ok(resultado !== null);
    assert.equal(resultado.json, json);
    assert.equal(resultado.cauda, 'CAUDA');
  });

  it('barra dobrada ANTES de chave/colchete também não vaza para a contagem de profundidade', () => {
    const json = String.raw`{"o":{"b":"\\{"}}`;
    const resultado = separarJsonECauda(`${json}FIM`);
    assert.ok(resultado !== null);
    assert.equal(resultado.json, json);
    assert.equal(resultado.cauda, 'FIM');
  });

  it('sequência de fugas alternadas mantém a string aberta até a aspa REAL', () => {
    const json = String.raw`{"a":"\\\"}ainda string"}`;
    const resultado = separarJsonECauda(`${json}TAIL`);
    assert.ok(resultado !== null);
    assert.equal(resultado.json, json);
    assert.equal(resultado.cauda, 'TAIL');
  });

  it('string pendurada com barra no fim (fuga aberta) NÃO é "consertada" — devolve null', () => {
    // texto literal {"a":"x\  (termina em barra invertida solta)
    assert.equal(separarJsonECauda('{"a":"x\\'), null);
  });

  it('objeto de topo com aninhamento e escapes misturados fecha na chave certa', () => {
    const json = String.raw`{"n1":{"s":"} \" }"},"n2":[{ "x": 1 }]}`;
    const resultado = separarJsonECauda(`${json}\nresto`);
    assert.ok(resultado !== null);
    assert.equal(resultado.json, json);
    assert.equal(resultado.cauda, '\nresto');
  });
});
