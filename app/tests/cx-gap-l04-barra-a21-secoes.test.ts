/**
 * tests/cx-gap-l04-barra-a21-secoes.test.ts — GAP de cobertura do lote L04: a
 * FÓRMULA das seções de teoria do A21 com número ÍMPAR de construções novas.
 *
 * O A21 exige `seções ≥ max(2, ⌈novas/2⌉)`. Os testes existentes pinavam o
 * caso PAR (4 novas ⇒ mínimo 2: "1 seção reprova, 2 passam") — o teto `⌈n/2⌉`
 * com n ímpar, onde o teto CRESCE além do mínimo 2, não estava coberto: uma
 * refatoração que trocasse `ceil(novas/2)` por `novas/2` inteiro ou pelo
 * mínimo fixo 2 passaria despercebida. Aqui, 5 construções novas colapsadas
 * exigem 3 seções: com 2 reprova, com 3 silencia (a carga A21 reprova nos dois
 * casos — o teto de 4 —, e é filtrada de propósito).
 *
 * Pin literal do plano do lote (lei): "A21 teto 4 novas totais + seções ≥
 * max(2, ceil(novas/2))".
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type {
  TrackChallengeLanguage,
  TrackChallengeSource,
  TrackTheorySection,
} from '../electron/main/content/trackTypes';
import type { AtomKey } from '../electron/main/engine/atomKeys';
import { pythonAdapter } from '../electron/main/engine/lang/python';
import { auditarBarra, type AchadoDaBarra } from '../electron/main/engine/quality/barra';

const TEM_PYTHON = pythonAdapter.detect().version !== null;

// ---------------------------------------------------------------------------
// Fixtures em memória (a forma de tests/cx-langqual-quality-barra.test.ts)
// ---------------------------------------------------------------------------

function secao(id: string, tag: string, code: string): TrackTheorySection {
  return { id, title: id, markdown: 'a teoria mostra o código', code: { language: tag, code } };
}

function desafio(slug: string): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: slug,
    concept: 'conceito',
    difficulty: 1,
    language: 'python' as TrackChallengeLanguage,
    statement: `# ${slug}`,
    starterCode: '',
    testsCode: 'from solucao import dobro\n',
    solutionCode: 'def dobro(x):\n    return x * 2\n',
    expectedTestCount: 1,
  };
}

interface AulaSpec {
  slug: string;
  secoes: TrackTheorySection[];
  productive: AtomKey[];
  receptive?: AtomKey[];
}

function aula(spec: AulaSpec): LoadedLesson {
  return {
    meta: {
      schemaVersion: 1,
      slug: spec.slug,
      title: spec.slug,
      summary: spec.slug,
      difficulty: 1,
      concepts: ['conceito'],
      prerequisites: [],
      theory: spec.secoes,
      sources: [],
      challenges: ['d1'],
      introduces: { productive: spec.productive, receptive: spec.receptive ?? [] },
    } as LoadedLesson['meta'],
    challenges: [desafio('d1')],
  };
}

function trilha(aulas: LoadedLesson[]): LoadedTrack {
  const mod: LoadedModule = {
    meta: { schemaVersion: 1, slug: 'modulo', title: 'modulo', order: 1, lessons: aulas.map((a) => a.meta.slug) },
    lessons: aulas,
    challenge: null,
  };
  return {
    root: {
      schemaVersion: 1,
      slug: 'fixture',
      title: 'fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage: 'python' as TrackChallengeLanguage,
      modules: [mod.meta.slug],
    },
    modules: [mod],
    proficiency: null,
    dir: '/tmp/fixture',
  };
}

/** `print("oi")` emite global:print + node:Call + node:StrLiteral na MESMA linha. */
const TEORIA_PRINT = 'print("oi")\n';

/** A aula LIMPA (piso): 1 produtiva, 2 seções, 1 desafio. */
function aulaLimpa(): LoadedLesson {
  return aula({
    slug: 'a-limpa',
    secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', 'print("bom dia")\n')],
    productive: ['global:print'],
  });
}

/** 5 construções novas colapsadas: 2 produtivas + 3 receptivas. */
const CINCO_NOVAS: { productive: AtomKey[]; receptive: AtomKey[] } = {
  productive: ['node:While', 'node:For'],
  receptive: ['node:If', 'node:Break', 'node:Continue'],
};

function secoesDeSequencia(track: LoadedTrack): AchadoDaBarra[] {
  return auditarBarra(track, { modo: 'declared' }).achados.filter(
    (a) => a.regra === 'A21' && a.evidencia.includes('seção(ões) de teoria'),
  );
}

describe(
  'barra A21 — seções ≥ max(2, ceil(novas/2)) com novas ÍMPARES (5 ⇒ mínimo 3)',
  { skip: TEM_PYTHON ? false : 'python3 ausente' },
  () => {
    it('5 novas colapsadas com 2 seções reprova (o mínimo sobe para ceil(5/2) = 3)', () => {
      const duasSecoes = aula({
        slug: 'cinco-duas-secoes',
        secoes: [secao('s1', 'python', TEORIA_PRINT), secao('s2', 'python', TEORIA_PRINT)],
        ...CINCO_NOVAS,
      });
      const achados = secoesDeSequencia(trilha([aulaLimpa(), duasSecoes]));
      assert.equal(achados.length, 1, JSON.stringify(achados, null, 2));
      assert.match(achados[0].evidencia, /^2 seção\(ões\) de teoria para 5 construção\(ões\) nova\(s\)/);
      assert.match(achados[0].mensagem, /ao menos 3 seções/, '⌈5/2⌉ = 3, não o mínimo fixo 2');
      assert.equal(achados[0].acao, 'SPLIT_LESSON');
      assert.equal(achados[0].severidade, 'erro');
    });

    it('5 novas colapsadas com 3 seções satisfaz a fórmula (sobra só a carga — teto 4)', () => {
      const tresSecoes = aula({
        slug: 'cinco-tres-secoes',
        secoes: [
          secao('s1', 'python', TEORIA_PRINT),
          secao('s2', 'python', TEORIA_PRINT),
          secao('s3', 'python', TEORIA_PRINT),
        ],
        ...CINCO_NOVAS,
      });
      const track = trilha([aulaLimpa(), tresSecoes]);
      assert.deepEqual(secoesDeSequencia(track), [], '3 ≥ ⌈5/2⌉ — as seções sustentam a novidade');
      // a CARGA continua reprovando (5 > 4) — o outro prazo do A21, intocado.
      const carga = auditarBarra(track, { modo: 'declared' }).achados.filter(
        (a) => a.regra === 'A21' && a.evidencia.includes('chaves novas'),
      );
      assert.equal(carga.length, 1);
    });
  },
);
