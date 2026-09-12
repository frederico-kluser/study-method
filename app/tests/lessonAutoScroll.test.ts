/**
 * tests/lessonAutoScroll.test.ts — ONDA15: durante a aula o painel do chat
 * acompanha o FIM SEMPRE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O PEDIDO, AO PÉ DA LETRA (o dono, ONDA15)
 * ══════════════════════════════════════════════════════════════════════════
 *   "durante a aula quero auto scroll do conteúdo sempre pro final da tela"
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A DECISÃO QUE ESTE ARQUIVO TRAVA — E A QUE ELE REPROVA
 * ══════════════════════════════════════════════════════════════════════════
 * A ONDA2-CHAT-NINTENDO havia decidido o contrário: o chat só era puxado ao
 * fim quando o aluno JÁ estava no fim (`NEAR_BOTTOM_PX = 120` + `isNearBottom`)
 * e quem tivesse rolado para cima para reler ficava onde estava — "NADA o puxa
 * de volta". O dono REVOGOU essa decisão. Hoje valem DUAS portas, as duas no
 * módulo de `src/views/LessonView/LessonView.tsx` e exportadas:
 *
 *   `pinLogToBottom(el)`   — o tick da digitação (`onStreamTick`), INSTANTÂNEO
 *                            (a ~2.5ms por step a 100 tps o `smooth` não
 *                            completaria e o streaming "pularia");
 *   `nudgeLogToBottom(el)` — o nudge de fim (o histórico cresce, a digitação
 *                            começa ou termina), SMOOTH.
 *
 * Nenhuma das duas consulta a POSIÇÃO do aluno, e o gatilho é CONTEÚDO NOVO —
 * não existe listener de `scroll` nesta view (um listener reagiria à ROLAGEM e
 * brigaria com o aluno a cada evento, que é exatamente o que o dono não pediu;
 * o efeito pedido é o painel sempre no fim).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMO ISSO SE PROVA SEM jsdom — E SEM ASSERÇÃO VACUOSA
 * ══════════════════════════════════════════════════════════════════════════
 * Esta base não tem jsdom (a técnica dela é `react-dom/server` + leitura de
 * fonte; precedentes tests/lessonChatLayout.test.ts e
 * tests/cadeadoIntegracao.test.ts). Aqui nem render é preciso: a decisão do
 * auto-scroll saiu do JSX para funções PURAS, então ela é MEDIDA com um
 * elemento FAKE — um objeto com `scrollTop`/`scrollHeight`, sem DOM nenhum.
 *
 *   BLOCOS 1 e 2 — COMPORTAMENTO. O fake é posto LONGE DO FIM e cada teste
 *     AFIRMA essa premissa antes de medir (a distância até a borda tem de ser
 *     maior que os 120px do guard aposentado — sem essa asserção o teste
 *     poderia estar passando por acidente, "perto do fim" nos DOIS códigos) e
 *     o alvo tem de ser o FIM assim mesmo. O guard antigo reprovaria em todas
 *     as posições: é o mutante que esta bateria mata. Uma das provas usa um
 *     fake cujo `clientHeight` LANÇA quando lido — reintroduzir o guard DENTRO
 *     do helper (o lugar mais fácil de escondê-lo) explode o teste com a
 *     mensagem do porquê.
 *
 *   BLOCO 3 — FONTE, com a guarda que o comportamento sozinho não dá. O
 *     `handleStreamTick` e o efeito do nudge são RECORTADOS do arquivo de
 *     produção (a REGIÃO, não o arquivo inteiro: a view tem outro scroll — o
 *     `scrollIntoView` do card do quiz — que NÃO é este e não pode ser
 *     proibido) e cobrados: a única condição permitida é a do `el` nulo, zero
 *     `isNearBottom`/`clientHeight`, deps do tick vazias e, no NUDGE, a
 *     IDENTIDADE da aula (`lesson?.slug`) junto do conteúdo — é ela que faz o
 *     nudge re-executar quando a Box do log MONTA, o caso "abrir a aula com o
 *     chat restaurado do cache cai no FIM" (ONDA2-AULA-ABRE-NO-FIM).
 *
 *   BLOCO 4 — CERCA GLOBAL. `NEAR_BOTTOM_PX` e `isNearBottom` não existem mais
 *     em lugar nenhum do código; nenhum listener de `scroll` foi acrescentado;
 *     e o tick continua LIGADO (`onStreamTick={handleStreamTick}`) — apagar a
 *     ligação deixaria o comportamento "correto" só no papel.
 *
 *   BLOCO 5 — A DOCUMENTAÇÃO que o dono exigiu: o pedido citado verbatim e a
 *     revogação registrada, sem a afirmação antiga passando por atual.
 *
 * Reprodução: `bash tools/t.sh tests/lessonAutoScroll.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW_PATH = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
const VIEW_SRC = readFileSync(VIEW_PATH, 'utf8');
const VIEW_MODULE = new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).href;

/**
 * Fonte SEM COMENTÁRIOS — só o código que realmente roda (técnica de
 * tests/lessonChatLayout.test.ts e tests/lessonQuizVisual.test.ts).
 *
 * Aqui isso é obrigatório, e não só higiene: a documentação da ONDA15 CITA
 * `NEAR_BOTTOM_PX` e `isNearBottom` para dizer que eles MORRERAM, e uma cerca
 * ingênua sobre o texto cru reprovaria a própria doc. Quem cita o guard
 * aposentado num comentário está documentando; quem o cita no código está
 * ressuscitando-o.
 */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const VIEW = codeOf(VIEW_SRC);

/** O valor aposentado do guard, e os dois lados do painel fake. */
const NEAR_BOTTOM_APOSENTADO_PX = 120;
const ALTURA_DO_CONTEUDO = 4000;
const ALTURA_DA_JANELA = 600;

/* ═══════════════════════════════════════════════════════════════════════════
 * O elemento FAKE — o que as duas portas do auto-scroll podem tocar
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * O contrato MÍNIMO do alvo: `scrollTop`/`scrollHeight` para o puxão
 * instantâneo, `scrollTo` para o suave. Nada de DOM: sem jsdom esta é a única
 * forma honesta de medir a decisão.
 */
interface AlvoFake {
  scrollTop: number;
  scrollHeight: number;
  scrollTo: (opcoes: { top: number; behavior: string }) => void;
}

interface FakeComSonda extends AlvoFake {
  clientHeight: number;
  /** Toda chamada de `scrollTo` — o alvo e o comportamento pedidos. */
  chamadas: { top: number; behavior: string }[];
}

/**
 * Um painel de chat fake com o aluno em `scrollTop`.
 *
 * `clientHeight` é um GETTER de propósito: com `'explode'` ele LANÇA quando
 * lido. É a sonda que separa "puxa ao fim sempre" de "puxa ao fim se a posição
 * permitir" — o guard revogado começa exatamente lendo `clientHeight` para
 * calcular a distância até a borda, e é dentro do helper que ele seria
 * escondido com mais discrição.
 */
function fakeComScroll(
  scrollTop: number,
  clientHeight: number | 'explode' = ALTURA_DA_JANELA,
): FakeComSonda {
  const chamadas: { top: number; behavior: string }[] = [];
  const el = {
    scrollTop,
    scrollHeight: ALTURA_DO_CONTEUDO,
    chamadas,
    scrollTo: (opcoes: { top: number; behavior: string }): void => {
      chamadas.push(opcoes);
    },
  } as FakeComSonda;
  Object.defineProperty(el, 'clientHeight', {
    get(): number {
      if (clientHeight === 'explode') {
        throw new Error(
          'a decisão de auto-scroll LEU clientHeight — é o guard de "near bottom" ' +
            '(revogado pela ONDA15) voltando: o puxão passou a depender da POSIÇÃO do ' +
            'aluno, e quem rolou para cima para reler deixa de acompanhar a aula',
        );
      }
      return clientHeight;
    },
    enumerable: true,
  });
  return el;
}

/** A distância do aluno até o fim — a mesma conta que o guard aposentado fazia. */
function distanciaAteOFim(el: FakeComSonda): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

type PinFn = (el: AlvoFake) => void;
type NudgeFn = (el: AlvoFake) => void;

let pinLogToBottom: PinFn;
let nudgeLogToBottom: NudgeFn;

before(async () => {
  const mod = (await import(VIEW_MODULE)) as {
    pinLogToBottom: PinFn;
    nudgeLogToBottom: NudgeFn;
  };
  pinLogToBottom = mod.pinLogToBottom;
  nudgeLogToBottom = mod.nudgeLogToBottom;
  assert.equal(
    typeof pinLogToBottom,
    'function',
    'o puxão instantâneo do tick é EXPORTADO pela produção (LessonView.tsx) — o teste ' +
      'não pode ancorar numa cópia da decisão',
  );
  assert.equal(
    typeof nudgeLogToBottom,
    'function',
    'o nudge suave é EXPORTADO pela produção (LessonView.tsx)',
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 1 — o tick da digitação: ao fim SEMPRE, instantâneo
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('1. o tick da digitação puxa ao fim MESMO com o aluno longe do fim', () => {
  /**
   * As três posições que o guard antigo reprovava: topo (0), meio (1200) e
   * meio-fundo (2000) de um painel de 4000px numa janela de 600px. Em todas, a
   * distância até o fim é MAIOR que os 120px do `NEAR_BOTTOM_PX` aposentado —
   * ou seja, o `isNearBottom()` da ONDA2-CHAT-NINTENDO diria "não" e o tick
   * não puxaria nada.
   */
  const LONGE_DO_FIM = [0, 1200, 2000] as const;

  for (const top of LONGE_DO_FIM) {
    it(`aluno em scrollTop=${top} → o alvo é o fim`, () => {
      const el = fakeComScroll(top);
      assert.ok(
        distanciaAteOFim(el) > NEAR_BOTTOM_APOSENTADO_PX,
        `a PREMISSA do teste (aluno longe do fim): distância ${distanciaAteOFim(el)}px ` +
          `precisa ser maior que os ${NEAR_BOTTOM_APOSENTADO_PX}px do guard — é isso que ` +
          'faz esta asserção valer contra o código ANTIGO, e não só contra o novo',
      );

      pinLogToBottom(el);

      assert.equal(
        el.scrollTop,
        el.scrollHeight,
        'o alvo do tick é o FIM do conteúdo (scrollTop = scrollHeight), sem consultar ' +
          'onde o aluno está — foi essa a decisão do dono na ONDA15',
      );
    });
  }

  it('a posição não decide: com clientHeight LANÇANDO, o alvo continua sendo o fim', () => {
    const el = fakeComScroll(2000, 'explode');
    pinLogToBottom(el);
    assert.equal(
      el.scrollTop,
      el.scrollHeight,
      'ler a posição (clientHeight) tem de ser impossível aqui: se o guard voltar para ' +
        'dentro do helper, esta linha não chega nem a rodar — o getter estoura',
    );
  });

  it('o tick continua INSTANTÂNEO — nunca agenda um `smooth`', () => {
    const el = fakeComScroll(2000);
    pinLogToBottom(el);
    assert.deepEqual(
      el.chamadas.filter((c) => c.behavior === 'smooth'),
      [],
      'o `smooth` do tick é o defeito que a ONDA2-CHAT-NINTENDO já tinha medido: a ' +
        '~2.5ms por step a animação não completa entre dois steps e o streaming "pula" ' +
        'na tela. O nudge (bloco 2) é quem usa suave',
    );
    assert.equal(el.scrollTop, el.scrollHeight, 'e o fim é alcançado na hora, sem animação');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 2 — o nudge de fim: ao fim SEMPRE, suave
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('2. o nudge de fim puxa ao fim MESMO com o aluno longe do fim, com SMOOTH', () => {
  /**
   * Aqui o `scrollTop` NÃO pode ser 0: no código antigo o zero era o caso
   * "acabou de abrir a aula" (`fresh`), que passava pelo guard de propósito.
   * Com 40, 1200 ou 2000 o código antigo não fazia NADA (nem perto do fim, nem
   * recém-aberto) — é o mutante que esta bateria mata.
   */
  const LONGE_DO_FIM = [40, 1200, 2000] as const;

  for (const top of LONGE_DO_FIM) {
    it(`aluno em scrollTop=${top} → scrollTo(fim, smooth)`, () => {
      const el = fakeComScroll(top);
      assert.ok(
        distanciaAteOFim(el) > NEAR_BOTTOM_APOSENTADO_PX && top > 0,
        `a PREMISSA do teste: distância ${distanciaAteOFim(el)}px > ` +
          `${NEAR_BOTTOM_APOSENTADO_PX}px E scrollTop > 0 (o zero era o caso "acabou de ` +
          'abrir", que o código antigo atendia por outra porta)',
      );

      nudgeLogToBottom(el);

      assert.deepEqual(
        el.chamadas,
        [{ top: el.scrollHeight, behavior: 'smooth' }],
        'o nudge leva o fim à vista SEMPRE e com `behavior: smooth` — exatamente uma ' +
          'chamada, no fim do conteúdo',
      );
    });
  }

  it('a posição não decide: com clientHeight LANÇANDO, o nudge acontece igual', () => {
    const el = fakeComScroll(2000, 'explode');
    nudgeLogToBottom(el);
    assert.deepEqual(
      el.chamadas,
      [{ top: el.scrollHeight, behavior: 'smooth' }],
      'mensagem nova entra / a digitação começa ou termina: o nudge não tem permissão de ' +
        'consultar a posição do aluno para decidir se puxa',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 3 — a FONTE: as duas ligações, recortadas e cobradas
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * O trecho de `VIEW` que casa `padrao` — com falha EXPLÍCITA quando o âncora
 * some. Sem isso, uma cerca que "não acha nada" passaria verde para sempre.
 */
function trechoCom(nome: string, padrao: RegExp): string {
  const casado = padrao.exec(VIEW);
  assert.ok(
    casado,
    `o código de produção precisa conter ${nome}. Se a forma mudou, esta cerca precisa ` +
      'ser refeita ANTES de se confiar no resto do bloco',
  );
  return casado[0];
}

/** Toda condição `if (...)` de um trecho — a lista fechada do que pode barrar o puxão. */
function condicoesDe(trecho: string): string[] {
  return [...trecho.matchAll(/if \([^)]*\)[^;]*;/g)].map((m) => m[0]);
}

/**
 * As deps do efeito, como LISTA — o recorte termina exatamente na lista de
 * dependências. Falha EXPLÍCITA quando o âncora some (mesmo motivo do
 * `trechoCom`): uma cerca de deps que "não acha nada" passaria verde.
 */
function depsDoEfeito(trecho: string): string[] {
  const casado = /\[([^\]]*)\]/.exec(trecho);
  assert.ok(
    casado,
    'o recorte do efeito do nudge tem de terminar na lista de deps — se a forma mudou, ' +
      'esta cerca precisa ser refeita ANTES de se confiar nela',
  );
  return casado[1]
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
}

/**
 * Os dois recortes são FUNÇÕES (e não constantes de módulo) de propósito: um
 * âncora que sumiu tem de reprovar O TESTE QUE DEPENDE DELE, com o nome dele na
 * mensagem — e não explodir o arquivo inteiro antes de qualquer teste rodar.
 * (Medido: o mutante que troca as duas físicas de porta derrubava o arquivo no
 * carregamento, sem dizer QUAL cerca — a versão de constante de módulo pegava,
 * mas cegamente.)
 */
function tickDeProducao(): string {
  return trechoCom(
    'o `handleStreamTick` (a porta do tick da digitação)',
    /const handleStreamTick = useCallback\(\(\): void => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/,
  );
}

function efeitoDoNudge(): string {
  return trechoCom(
    'o efeito do nudge de fim',
    /useEffect\(\(\) => \{\n\s*const el = logScrollRef\.current;\n\s*if \(!el\) return;\n\s*nudgeLogToBottom\(el\);\n\s*\}, \[[^\]]*\]\);/,
  );
}

describe('3. as duas ligações de produção: sem guard de posição, com a física certa', () => {
  it('a cerca lê o arquivo de PRODUÇÃO inteiro, não uma cópia nem um recorte vazio', () => {
    assert.equal(
      VIEW_PATH,
      resolve(HERE, '../src/views/LessonView/LessonView.tsx'),
      'a fonte medida é a da view de produção',
    );
    assert.ok(
      VIEW.length > 20000,
      'o fonte SEM comentários continua sendo o arquivo inteiro — se o `codeOf` comesse ' +
        'código, todas as cercas deste bloco passariam vazias',
    );
    assert.ok(VIEW.includes('export function LessonView'), 'e o componente continua lá');
  });

  it('o tick chama o puxão instantâneo — a ÚNICA condição é o `el` existir', () => {
    const tick = tickDeProducao();
    assert.ok(tick.length < 400, 'o recorte do tick é a declaração dele, não o arquivo');
    assert.deepEqual(
      condicoesDe(tick),
      ['if (el) pinLogToBottom(el);'],
      'sobrou UMA condição no tick: a de o elemento existir. Qualquer outra (a volta do ' +
        '`isNearBottom`, um `if (el.scrollHeight - el.scrollTop ...)`) reprova aqui — e ' +
        'reprova pelo que ela É, não por uma string solta no arquivo',
    );
    assert.match(tick, /pinLogToBottom\(el\)/, 'e o puxão vem do helper puro exportado');
    assert.doesNotMatch(
      tick,
      /NEAR_BOTTOM_PX|isNearBottom|clientHeight|smooth/,
      'o tick não tem guard de posição nem `smooth` (a física instantânea é decisão ' +
        'documentada: ~2.5ms por step)',
    );
    assert.match(
      tick,
      /\}, \[\]\);/,
      'o callback do tick não depende mais de nenhum guard — deps vazias. Se o ' +
        '`isNearBottom` voltasse para as deps, o comportamento voltaria com ele',
    );
  });

  it('o efeito do nudge chama o puxão suave — a ÚNICA condição é o `el` existir', () => {
    const nudge = efeitoDoNudge();
    assert.ok(nudge.length < 400, 'o recorte do nudge é o efeito dele, não o arquivo');
    assert.deepEqual(
      condicoesDe(nudge),
      ['if (!el) return;'],
      'sobrou UMA condição no nudge: a de saída por elemento nulo. Nada de `if ' +
        '(isNearBottom() || fresh)` — era ali que o auto-scroll condicional morava',
    );
    assert.match(nudge, /nudgeLogToBottom\(el\)/, 'o puxão vem do helper exportado');
    assert.doesNotMatch(
      nudge,
      /NEAR_BOTTOM_PX|isNearBottom|clientHeight|fresh/,
      'nem o guard, nem o `fresh` (o escape de "acabou de abrir") — os dois morreram com ' +
        'o puxão incondicional, que cobre aquele caso e todos os outros',
    );
    assert.match(
      nudge,
      /\[chat\.history\.length, streamingIds, lesson\?\.slug\]/,
      'o gatilho é CONTEÚDO NOVO (o histórico crescer, o conjunto de quem digita mudar) ' +
        'E a MONTAGEM da aula (a identidade `lesson?.slug`, ONDA2-AULA-ABRE-NO-FIM) — ' +
        'nunca um evento de rolagem do aluno',
    );
  });

  /**
   * ONDA2-AULA-ABRE-NO-FIM — o defeito MEDIDO que esta asserção tranca: abrir
   * uma aula cujo chat foi RESTAURADO do cache de sessão caía no TOPO.
   *
   * O mecanismo, medido no fonte: a Box do log vive DEPOIS do early-return
   * `if (!lesson)` (loading). Com o histórico restaurado (`chat.history.length
   * > 0`) e `lesson` ainda `null`, a primeira passada do efeito do nudge
   * encontra `logScrollRef.current === null` e sai pelo `if (!el) return`;
   * quando o payload chega, a Box MONTA com `scrollTop = 0` — e o efeito não
   * voltava a rodar, porque as deps antigas (`chat.history.length`,
   * `streamingIds`) não mudam nesse commit: quem muda é `lesson`.
   *
   * O mutante que esta cerca MATA é a REMOÇÃO da identidade da aula das deps
   * (o estado do main, commit 11a7d83): sem ela o teste reprova. É a única
   * prova possível nesta base — a montagem da Box e a ordem dos efeitos vivem
   * no React, e não há jsdom aqui (o bloco 1/2 prova as decisões puras com o
   * elemento FAKE; esta prova é de LIGAÇÃO).
   */
  it('o nudge re-executa quando a AULA carrega — a identidade da aula está nas deps', () => {
    const nudge = efeitoDoNudge();
    const deps = depsDoEfeito(nudge);
    assert.deepEqual(
      deps,
      ['chat.history.length', 'streamingIds', 'lesson?.slug'],
      'a lista NOVA de deps do nudge: conteúdo novo (histórico + digitação) E a ' +
        'identidade da aula. Remover `lesson?.slug` reprova aqui',
    );
    assert.ok(
      deps.some((d) => /^lesson\?\.slug$/.test(d)),
      'a identidade da AULA tem de estar nas deps: é ela que muda quando o payload chega ' +
        'e a Box do log MONTA (o early-return de loading segura a Box enquanto `lesson` é ' +
        'nulo). Sem essa dep, abrir a aula com o chat restaurado do cache de sessão cai no ' +
        'TOPO — o efeito já rodou (com o ref nulo) e não re-executa na montagem',
    );
    assert.doesNotMatch(
      nudge,
      /\[[^\]]*\blesson\b(?!\?)/,
      'e a dep é a IDENTIDADE OPCIONAL (`lesson?.slug`), não o objeto `lesson` nem ' +
        '`lesson.slug`: o OBJETO troca de identidade a cada `setLesson` — inclusive no ' +
        'refetch silencioso da MESMA aula — e o gatilho viraria "qualquer aplicação de ' +
        'payload"; o acesso SEM `?.` estoura com a aula nula, que é justamente o estado ' +
        'da primeira passada',
    );
  });

  it('os dois helpers do módulo são INCONDICIONAIS (sem guard escondido dentro deles)', () => {
    for (const [nome, padrao] of [
      ['pinLogToBottom', /export function pinLogToBottom\([\s\S]*?\n\}/],
      ['nudgeLogToBottom', /export function nudgeLogToBottom\([\s\S]*?\n\}/],
    ] as const) {
      const corpo = trechoCom(`o helper \`${nome}\``, padrao);
      assert.doesNotMatch(
        corpo,
        /clientHeight|NEAR_BOTTOM_PX|isNearBottom|\bif \(|\?/,
        `${nome}: nenhuma leitura de posição e nenhum ramo — um guard aqui dentro ` +
          'devolveria o auto-scroll condicional pela porta dos fundos',
      );
    }
    assert.match(
      VIEW,
      /export function pinLogToBottom\(el: Pick<HTMLElement, 'scrollTop' \| 'scrollHeight'>\): void \{\n {2}el\.scrollTop = el\.scrollHeight;\n\}/,
      'o puxão instantâneo é exatamente `el.scrollTop = el.scrollHeight`',
    );
    assert.match(
      VIEW,
      /export function nudgeLogToBottom\([\s\S]*?el\.scrollTo\(\{ top: el\.scrollHeight, behavior: 'smooth' \}\);/,
      "o nudge é exatamente `scrollTo({ top: scrollHeight, behavior: 'smooth' })`",
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 4 — a cerca global: o guard não existe mais em lugar nenhum
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('4. o guard revogado não existe em lugar nenhum do código', () => {
  it('`NEAR_BOTTOM_PX` e `isNearBottom` sumiram do código (não só do caminho feliz)', () => {
    assert.doesNotMatch(
      VIEW,
      /NEAR_BOTTOM_PX/,
      'a constante do guard aposentado não pode voltar: ela só existe para decidir se o ' +
        'puxão acontece, que é justamente a decisão REVOGADA pelo dono',
    );
    assert.doesNotMatch(
      VIEW,
      /isNearBottom/,
      'nem a função do guard: com ela de volta, basta alguém religá-la no tick ou no ' +
        'nudge (o bloco 3 mostra que hoje não estão)',
    );
    assert.doesNotMatch(
      VIEW,
      /scrollHeight\s*-\s*el\.scrollTop/,
      'nem a CONTA do guard sob outro nome — distância até o fim deixou de ser critério',
    );
  });

  it('nenhum listener de `scroll` foi acrescentado (o gatilho é conteúdo novo)', () => {
    assert.doesNotMatch(
      VIEW,
      /addEventListener\(\s*['"]scroll['"]/,
      'um listener de `scroll` reagiria à ROLAGEM do aluno e brigaria com ele a cada ' +
        'evento — o dono pediu o painel acompanhando o fim, não uma disputa com quem lê',
    );
    assert.doesNotMatch(
      VIEW,
      /onScroll=/,
      'nem o equivalente em JSX',
    );
  });

  it('o tick continua LIGADO ao typewriter e o ref continua na região que rola', () => {
    assert.match(
      VIEW,
      /onStreamTick=\{handleStreamTick\}/,
      'sem esta ligação o comportamento novo não roda em aula nenhuma — o helper ' +
        'exportado ficaria certo e o chat, parado',
    );
    assert.match(
      VIEW,
      /ref=\{logScrollRef\}/,
      'o ref aponta para a Box com `overflowY` (a região que rola de verdade)',
    );
    assert.match(VIEW, /const logScrollRef = useRef<HTMLDivElement \| null>\(null\);/, 'o ref');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 5 — a documentação: a revogação registrada, o pedido citado
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('5. a decisão está documentada no arquivo (o pedido verbatim, a revogação)', () => {
  it('o pedido do dono aparece AO PÉ DA LETRA', () => {
    assert.ok(
      VIEW_SRC.includes('durante a aula quero auto scroll do conteúdo sempre pro final da tela'),
      'o comentário da ONDA15 cita o pedido do dono verbatim — é o registro de POR QUE o ' +
        'auto-scroll condicional foi revogado, e a fonte crua é onde ele vive',
    );
  });

  it('a revogação está registrada, e a afirmação antiga não passa por atual', () => {
    assert.match(
      VIEW_SRC,
      /REVOGAD[AO]/,
      'a decisão que caiu tem de estar dita como revogada — sem isso o próximo leitor ' +
        'encontra "respeita a leitura" no cabeçalho e desfaz a ONDA15 achando que conserta',
    );
    assert.ok(
      !/auto-scroll\s+SÓ\s+quando/.test(VIEW_SRC),
      'a frase que afirmava o comportamento antigo como VIGENTE não pode sobrar (a ' +
        'revogação pode citá-la entre aspas, o que ela não pode é passar por atual)',
    );
  });
});
