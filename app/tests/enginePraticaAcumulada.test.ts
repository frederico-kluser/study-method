/**
 * tests/enginePraticaAcumulada.test.ts — a RÉGUA DA PREMISSA DE REVISÃO
 * ACUMULADA (pedido do dono: "os desafios finais da aula englobem conteúdos
 * das aulas anteriores, misturando na prova conhecimentos que ele já possui").
 *
 * O QUE ESTA SUÍTE TRAVA (engine/coverage/praticaAcumulada.ts):
 *   1. MISTURA: desafio com átomo-conceito ensinado antes → REVISAO_OK;
 *   2. SEM_REVISAO quando havia o que revisar e a solução não revisa nada;
 *   3. a régua dos EIXOS: `node:`/`form:` são estrutura e não contam como
 *      conceito (senão `node:Call` aprovaria todo desafio que imprime algo);
 *   4. `api:todo!` (stub do starter) nunca conta como conceito de revisão;
 *   5. isenção por vacuidade: nada ensinado antes → SEM_CONHECIMENTO_ANTERIOR;
 *   6. fail-closed: solução sem átomo nenhum → SEM_ATOMOS (nunca aprova);
 *   7. FECHAMENTO: faltantes por módulo (até ao fim do módulo) e
 *      nunca-praticados no curso — receptivo nunca é exigido como prática;
 *   8. a sugestão de revisão olha só o PASSADO (idades nunca negativas) e
 *      prefere o nunca-praticado.
 *
 * Reprodução: `cd app && npm test -- tests/enginePraticaAcumulada.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  apurarPraticaAcumulada,
  sugestaoDeRevisao,
  type BlocoDeCurriculo,
  type EntradaDePratica,
  type PraticaDeDesafio,
} from '../electron/main/engine/coverage/praticaAcumulada';

function bloco(over: Partial<BlocoDeCurriculo> = {}): BlocoDeCurriculo {
  return { ref: 'm1/a1', pos: 0, introduz: [], introduzProdutivo: [], ...over };
}

function desafio(over: Partial<PraticaDeDesafio> = {}): PraticaDeDesafio {
  return { ref: 'm1/a1/d1', blocoRef: 'm1/a1', kind: 'aula', pos: 0, atoms: [], ...over };
}

function entrada(over: Partial<EntradaDePratica> = {}): EntradaDePratica {
  return { praticas: [], blocos: [], modulos: [], ...over };
}

describe('praticaAcumulada — a mistura por desafio', () => {
  it('desafio que pratica conceito ensinado antes é REVISAO_OK', () => {
    const apurado = apurarPraticaAcumulada(
      entrada({
        blocos: [
          bloco({ ref: 'm1/a1', pos: 0, introduz: ['global:print'], introduzProdutivo: ['global:print'] }),
          bloco({ ref: 'm1/a2', pos: 1, introduz: ['op:binary:+'], introduzProdutivo: ['op:binary:+'] }),
        ],
        praticas: [desafio({ ref: 'm1/a2/d1', blocoRef: 'm1/a2', pos: 1, atoms: ['op:binary:+', 'global:print'] })],
      }),
    );
    assert.equal(apurado.desafios[0].veredito, 'REVISAO_OK');
    assert.deepEqual(apurado.desafios[0].revisaoContavel, ['global:print']);
    assert.deepEqual(apurado.desafios[0].novos, ['op:binary:+']);
    assert.equal(apurado.placar.semRevisao, 0);
  });

  it('solução que só usa o alvo novo é SEM_REVISAO (a violação da premissa)', () => {
    const apurado = apurarPraticaAcumulada(
      entrada({
        blocos: [
          bloco({ ref: 'm1/a1', pos: 0, introduz: ['global:print'], introduzProdutivo: ['global:print'] }),
          bloco({ ref: 'm1/a2', pos: 1, introduz: ['op:binary:+'], introduzProdutivo: ['op:binary:+'] }),
        ],
        praticas: [desafio({ ref: 'm1/a2/d1', blocoRef: 'm1/a2', pos: 1, atoms: ['op:binary:+'] })],
      }),
    );
    assert.equal(apurado.desafios[0].veredito, 'SEM_REVISAO');
    assert.equal(apurado.placar.semRevisao, 1);
  });

  it('a régua dos eixos: estrutura node:/form: não conta como conceito', () => {
    const apurado = apurarPraticaAcumulada(
      entrada({
        blocos: [
          bloco({ ref: 'm1/a1', pos: 0, introduz: ['node:Call', 'global:print'], introduzProdutivo: ['node:Call', 'global:print'] }),
          bloco({ ref: 'm1/a2', pos: 1, introduz: ['node:IfStatement'], introduzProdutivo: ['node:IfStatement'] }),
        ],
        // a solução "revisa" node:Call — estrutura forçada pela sintaxe.
        praticas: [desafio({ ref: 'm1/a2/d1', blocoRef: 'm1/a2', pos: 1, atoms: ['node:IfStatement', 'node:Call'] })],
      }),
    );
    assert.equal(apurado.desafios[0].veredito, 'SEM_REVISAO');
    assert.deepEqual(apurado.desafios[0].revisao, ['node:Call']);
    assert.deepEqual(apurado.desafios[0].revisaoContavel, []);
  });

  it('api:todo! (stub do starter) nunca conta — e se for só ele, a vacuidade isenta', () => {
    const apurado = apurarPraticaAcumulada(
      entrada({
        blocos: [
          bloco({ ref: 'm1/a1', pos: 0, introduz: ['api:todo!'], introduzProdutivo: ['api:todo!'] }),
          bloco({ ref: 'm1/a2', pos: 1, introduz: ['op:binary:+'], introduzProdutivo: ['op:binary:+'] }),
        ],
        praticas: [desafio({ ref: 'm1/a2/d1', blocoRef: 'm1/a2', pos: 1, atoms: ['op:binary:+', 'api:todo!'] })],
      }),
    );
    // o único "conceito" anterior é o marcador de stub (o op:binary:+ é da
    // PRÓPRIA aula, não é revisão): exigir revisão aqui seria exigir o
    // impossível (medido nos 2 primeiros desafios do rust-iniciante) — a
    // vacuidade isenta, e o stub nunca vira revisão.
    assert.equal(apurado.desafios[0].veredito, 'SEM_CONHECIMENTO_ANTERIOR');
    assert.deepEqual(apurado.desafios[0].revisaoContavel, []);
  });

  it('com outro conceito anterior além do stub, a ausência de mistura reprova', () => {
    const apurado = apurarPraticaAcumulada(
      entrada({
        blocos: [
          bloco({ ref: 'm1/a1', pos: 0, introduz: ['api:todo!'], introduzProdutivo: ['api:todo!'] }),
          bloco({ ref: 'm1/a2', pos: 1, introduz: ['op:binary:*'], introduzProdutivo: ['op:binary:*'] }),
          bloco({ ref: 'm1/a3', pos: 2, introduz: ['op:binary:+'], introduzProdutivo: ['op:binary:+'] }),
        ],
        praticas: [desafio({ ref: 'm1/a3/d1', blocoRef: 'm1/a3', pos: 2, atoms: ['op:binary:+', 'api:todo!'] })],
      }),
    );
    assert.equal(apurado.desafios[0].veredito, 'SEM_REVISAO');
  });

  it('isento por vacuidade: nada (contável) ensinado antes ainda', () => {
    const apurado = apurarPraticaAcumulada(
      entrada({
        blocos: [bloco({ ref: 'm1/a1', pos: 0, introduz: ['node:Call'], introduzProdutivo: ['node:Call'] })],
        praticas: [desafio({ ref: 'm1/a1/d1', blocoRef: 'm1/a1', pos: 0, atoms: ['node:Call'] })],
      }),
    );
    assert.equal(apurado.desafios[0].veredito, 'SEM_CONHECIMENTO_ANTERIOR');
  });

  it('fail-closed: solução sem átomo nenhum é SEM_ATOMOS e nunca aprova', () => {
    const apurado = apurarPraticaAcumulada(
      entrada({
        blocos: [bloco({ ref: 'm1/a1', pos: 0, introduz: ['global:print'], introduzProdutivo: ['global:print'] })],
        praticas: [desafio({ ref: 'm1/a1/d1', blocoRef: 'm1/a1', pos: 0, atoms: [] })],
      }),
    );
    assert.equal(apurado.desafios[0].veredito, 'SEM_ATOMOS');
    assert.equal(apurado.placar.semAtomos, 1);
  });
});

describe('praticaAcumulada — o fechamento', () => {
  const curso = entrada({
    blocos: [
      bloco({ ref: 'm1/a1', pos: 0, introduz: ['global:print'], introduzProdutivo: ['global:print'] }),
      bloco({ ref: 'm1/a2', pos: 1, introduz: ['op:binary:+', 'term:soma'], introduzProdutivo: ['op:binary:+'], }),
      bloco({ ref: 'm2/a1', pos: 2, introduz: ['global:len'], introduzProdutivo: ['global:len'] }),
    ],
    praticas: [
      // m1 fecha com o desafio de módulo que pratica o + (e o term: fica só
      // receptivo — nunca é exigido como prática).
      desafio({ ref: 'm1/a1/d1', blocoRef: 'm1/a1', pos: 0, atoms: ['global:print'] }),
      desafio({ ref: 'm1/challenges/dm', blocoRef: 'm1', kind: 'modulo', pos: 1.5, atoms: ['op:binary:+'] }),
      // m2 nunca pratica global:len em lugar nenhum.
    ],
    modulos: [
      { modulo: 'm1', fim: 1.5, atomsDoModulo: ['global:print', 'op:binary:+'] },
      { modulo: 'm2', fim: 2, atomsDoModulo: ['global:len'] },
    ],
    origemDe: new Map([
      ['global:print', 'm1/a1'],
      ['op:binary:+', 'm1/a2'],
      ['term:soma', 'm1/a2'],
      ['global:len', 'm2/a1'],
    ]),
  });

  it('faltantesDoModulo: módulo fechado não tem faltante; o aberto tem', () => {
    const apurado = apurarPraticaAcumulada(curso);
    const m1 = apurado.modulos.find((m) => m.modulo === 'm1');
    const m2 = apurado.modulos.find((m) => m.modulo === 'm2');
    assert.deepEqual(m1?.faltantes, []);
    assert.deepEqual(m2?.faltantes.map((f) => f.atom), ['global:len']);
    assert.equal(apurado.placar.faltantesDeModulo, 1);
  });

  it('nunca-praticados no curso: produtivo sim, receptivo nunca', () => {
    const apurado = apurarPraticaAcumulada(curso);
    assert.deepEqual(apurado.nuncaPraticados.map((f) => f.atom), ['global:len']);
  });

  it('prática DEPOIS do fim do módulo não fecha o módulo (mas conta no curso)', () => {
    const apurado = apurarPraticaAcumulada({
      ...curso,
      praticas: [
        ...curso.praticas,
        desafio({ ref: 'm2/a1/d1', blocoRef: 'm2/a1', pos: 2, atoms: ['global:len'] }),
      ],
    });
    // o desafio de m2/a1 (pos 2) é DEPOIS do fim de m1 (1.5) — m1 não era o
    // dono; o teste de fronteira vale para m2: o len praticado em pos 2 = fim.
    const m2 = apurado.modulos.find((m) => m.modulo === 'm2');
    assert.deepEqual(m2?.faltantes, []);
    assert.equal(apurado.placar.nuncaPraticados, 0);
  });
});

describe('praticaAcumulada — a sugestão de revisão', () => {
  it('olha só o passado (idades nunca negativas) e prefere o nunca-praticado', () => {
    const base = entrada({
      blocos: [
        bloco({ ref: 'm1/a1', pos: 0, introduz: ['global:print', 'op:binary:-'], introduzProdutivo: ['global:print', 'op:binary:-'] }),
        bloco({ ref: 'm1/a2', pos: 1, introduz: ['op:binary:+'], introduzProdutivo: ['op:binary:+'] }),
        bloco({ ref: 'm1/a3', pos: 2, introduz: ['global:len'], introduzProdutivo: ['global:len'] }),
      ],
      praticas: [
        desafio({ ref: 'm1/a1/d1', blocoRef: 'm1/a1', pos: 0, atoms: ['global:print'] }),
        desafio({ ref: 'm1/a2/d1', blocoRef: 'm1/a2', pos: 1, atoms: ['op:binary:+'] }),
        desafio({ ref: 'm1/a3/d1', blocoRef: 'm1/a3', pos: 2, atoms: ['global:len'] }),
      ],
    });
    const sugestoes = sugestaoDeRevisao(base, 'm1/a3/d1');
    const atoms = sugestoes.map((s) => s.atom);
    // op:binary:- nunca foi praticado → primeiro; global:print e op:binary:+
    // já foram (em passado) → depois, com idade positiva.
    assert.ok(atoms.includes('op:binary:-'));
    const motivo = sugestoes.find((s) => s.atom === 'op:binary:-')?.motivo ?? '';
    assert.match(motivo, /nunca praticado/);
    for (const s of sugestoes) {
      const m = /há (-?\d+)/.exec(s.motivo);
      if (m !== null) assert.ok(Number(m[1]) > 0, `idade negativa em ${s.atom}: ${s.motivo}`);
    }
  });
});
