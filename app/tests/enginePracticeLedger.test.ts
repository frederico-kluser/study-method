/**
 * tests/enginePracticeLedger.test.ts — o CONTROLE DE COBERTURA de prática
 * (pedido do dono: "ter um controle de modo que o aluno sempre pratique num
 * desafio de aula ou de módulo todo o conhecimento anterior daquele curso").
 *
 * O QUE ESTA SUÍTE TRAVA (engine/coverage/practiceLedger.ts):
 *   1. o ledger é IMUTÁVEL (registrarPratica devolve ledger novo);
 *   2. a seleção de revisão sai de `entrada` (= todo o conhecimento anterior),
 *      MENOS o que a aula atual introduz, MENOS o que o desafio já cobre;
 *   3. a ordem é retrieval practice espaçado: NUNCA praticado primeiro, depois
 *      o de prática mais ANTIGA (distância em posição pedagógica);
 *   4. INTERCALAÇÃO: os escolhidos se espalham por aulas de origem quando há
 *      alternativa (misturar, não repetir capítulo) — mas intercalar nunca
 *      censura um candidato;
 *   5. o TETO (`limite`, default 4) — "não precisamos LITERALMENTE colocar
 *      tudo";
 *   6. `faltantesDoModulo` devolve os átomos do módulo nunca praticados até o
 *      desafio do módulo (a ficha de cobertura dele / a garantia pedida);
 *   7. estabilidade: empate de idade quebra pela ordem de entrada.
 *
 * Reprodução: `cd app && npm test -- tests/enginePracticeLedger.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEDGER_VAZIO,
  faltantesDoModulo,
  praticasDoAtom,
  registrarPratica,
  selecionarRevisao,
  type PracticeLedger,
  type PraticaRegistrada,
} from '../electron/main/engine/coverage/practiceLedger';

function pratica(over: Partial<PraticaRegistrada> = {}): PraticaRegistrada {
  return { ref: 'm1/a1', kind: 'aula', pos: 0, atoms: [], ...over };
}

describe('practiceLedger — o ledger é imutável', () => {
  it('registrarPratica devolve ledger novo; o anterior não muda', () => {
    const vazio = LEDGER_VAZIO;
    const comUma = registrarPratica(vazio, pratica({ atoms: ['global:print'] }));
    assert.equal(vazio.praticas.length, 0, 'o ledger original não pode mutar');
    assert.equal(comUma.praticas.length, 1);
    assert.deepEqual(praticasDoAtom(comUma, 'global:print').map((p) => p.ref), ['m1/a1']);
    assert.deepEqual(praticasDoAtom(comUma, 'op:binary:+'), []);
  });
});

describe('practiceLedger — selecionarRevisao: o que revisar AGORA', () => {
  const origemDe = new Map([
    ['a', 'm1/aula-a'],
    ['b', 'm1/aula-a'],
    ['c', 'm1/aula-b'],
    ['d', 'm1/aula-c'],
    ['e', 'm1/aula-d'],
    ['f', 'm1/aula-e'],
  ]);

  it('candidatos = entrada − introduzidos − já cobertos', () => {
    const itens = selecionarRevisao({
      entrada: ['a', 'b', 'c'],
      introduzidos: ['b'],
      jaCobertos: ['c'],
      ledger: LEDGER_VAZIO,
      posAtual: 5,
    });
    assert.deepEqual(itens.map((i) => i.atom), ['a']);
  });

  it('NUNCA praticado primeiro; depois o de prática mais ANTIGA (espaçamento)', () => {
    let ledger: PracticeLedger = LEDGER_VAZIO;
    ledger = registrarPratica(ledger, pratica({ ref: 'm1/a1', pos: 1, atoms: ['a'] }));
    ledger = registrarPratica(ledger, pratica({ ref: 'm1/a4', pos: 4, atoms: ['b'] }));
    const itens = selecionarRevisao({
      entrada: ['a', 'b', 'c'],
      introduzidos: [],
      ledger,
      origemDe,
      posAtual: 10,
    });
    assert.deepEqual(
      itens.map((i) => i.atom),
      ['c', 'a', 'b'],
      'c nunca foi praticado; a (prática mais velha) vem antes de b',
    );
    assert.equal(itens[0].motivo, 'nunca praticado em nenhum desafio');
    assert.match(itens[1].motivo, /há 9 aula/);
  });

  it('INTERCALAÇÃO: os escolhidos se espalham por origem quando há alternativa', () => {
    const itens = selecionarRevisao({
      entrada: ['a', 'b', 'c', 'd'],
      introduzidos: [],
      ledger: LEDGER_VAZIO,
      origemDe,
      posAtual: 3,
    });
    assert.deepEqual(
      itens.map((i) => i.atom),
      ['a', 'c', 'd', 'b'],
      'a e b (mesma aula de origem) não dividem as primeiras vagas: b entra quando as outras origens se esgotam',
    );
    assert.equal(itens[0].origem, 'm1/aula-a');
    assert.equal(itens[1].origem, 'm1/aula-b');
  });

  it('intercalar é preferência, nunca censura: sem alternativa de origem, tudo entra', () => {
    const itens = selecionarRevisao({
      entrada: ['a', 'b'],
      introduzidos: [],
      ledger: LEDGER_VAZIO,
      origemDe: new Map([
        ['a', 'm1/aula-a'],
        ['b', 'm1/aula-a'],
      ]),
      posAtual: 3,
    });
    assert.deepEqual(itens.map((i) => i.atom), ['a', 'b']);
  });

  it('o TETO limita a lista (default 4; e `limite` 0 devolve [])', () => {
    const entrada = ['a', 'b', 'c', 'd', 'e', 'f'];
    const quatro = selecionarRevisao({ entrada, introduzidos: [], ledger: LEDGER_VAZIO, posAtual: 1 });
    assert.equal(quatro.length, 4, 'default é 4 — "não precisamos LITERALMENTE colocar tudo"');
    const dois = selecionarRevisao({
      entrada,
      introduzidos: [],
      ledger: LEDGER_VAZIO,
      posAtual: 1,
      limite: 2,
    });
    assert.equal(dois.length, 2);
    assert.deepEqual(
      selecionarRevisao({ entrada, introduzidos: [], ledger: LEDGER_VAZIO, posAtual: 1, limite: 0 }),
      [],
    );
  });

  it('empate de idade quebra pela ordem de entrada (estabilidade)', () => {
    let ledger: PracticeLedger = LEDGER_VAZIO;
    ledger = registrarPratica(ledger, pratica({ pos: 0, atoms: ['a'] }));
    ledger = registrarPratica(ledger, pratica({ pos: 0, atoms: ['b'] }));
    const itens = selecionarRevisao({
      entrada: ['a', 'b'],
      introduzidos: [],
      ledger,
      posAtual: 2,
      limite: 2,
    });
    assert.deepEqual(itens.map((i) => i.atom), ['a', 'b']);
  });

  it('entrada vazia ⇒ [] (nada a revisar, nada inventado)', () => {
    assert.deepEqual(
      selecionarRevisao({ entrada: [], introduzidos: ['x'], ledger: LEDGER_VAZIO, posAtual: 0 }),
      [],
    );
  });
});

describe('practiceLedger — faltantesDoModulo: a garantia de fechamento', () => {
  it('devolve os átomos do módulo NUNCA praticados, com a aula de origem', () => {
    let ledger: PracticeLedger = LEDGER_VAZIO;
    ledger = registrarPratica(ledger, pratica({ ref: 'm1/a1', pos: 1, atoms: ['global:print'] }));
    const faltantes = faltantesDoModulo({
      atomsDoModulo: ['global:print', 'global:round', 'op:binary://'],
      ledger,
      origemDe: new Map([
        ['global:round', 'm1/aula-round'],
        ['op:binary://', 'm1/aula-divisao'],
      ]),
    });
    assert.deepEqual(
      faltantes.map((f) => f.atom),
      ['global:round', 'op:binary://'],
      'o praticado sai; os nunca praticados são a ficha do desafio do módulo',
    );
    assert.equal(faltantes[0].origem, 'm1/aula-round');
  });

  it('módulo inteiro praticado ⇒ ficha vazia (a garantia cumpriu)', () => {
    const ledger = registrarPratica(LEDGER_VAZIO, pratica({ atoms: ['a', 'b'] }));
    assert.deepEqual(faltantesDoModulo({ atomsDoModulo: ['a', 'b'], ledger }), []);
  });
});
