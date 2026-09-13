/**
 * tests/lessonSidebarWiringCoverage.test.ts — COMPLEMENTO de
 * tests/lessonSidebarWiring.test.ts (ONDA-AULA-NO-SIDEBAR): as bordas da
 * LIGAÇÃO do cabeçalho da aula ao sidebar do shell que o arquivo-irmão não
 * cobre.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE O IRMÃO JÁ PROVA (lido antes de escrever este arquivo — NÃO duplicado)
 * ══════════════════════════════════════════════════════════════════════════
 * tests/lessonSidebarWiring.test.ts já trava, com guarda de fonte sobre
 * `src/views/LessonView/LessonView.tsx` sem comentários:
 *   BLOCO 1 — `<LessonSidebarHeader>` 1x, ÚNICO filho de `<ShellSidebarPortal>`,
 *     as props 1:1 com `LessonSidebarHeaderProps` (lido do componente, sem
 *     cópia), cada prop na MESMA origem de antes (inclusive `onChallengesClick`
 *     marcando `challengesFrom('cabecalho')` + a âncora), sem `key`, o resumo
 *     só por prop, e o pedido do dono registrado ao pé da letra no fonte;
 *   BLOCO 2 — o portal é IRMÃO depois do `</Stack>` da coluna (nunca o 1º
 *     filho da raiz, nunca dentro da coluna), só a aula ATIVA publica (o
 *     portal vem depois do `return (` da aula ativa), e a coluna começa DIRETO
 *     no rolador do chat;
 *   BLOCO 3 — nenhum `<header`/`component="header"`/`CollapsibleLessonHeader`/
 *     `<Divider` na view; o componente antigo (e o teste dele) não existe mais
 *     no disco; NENHUM arquivo de `src/` cita `CollapsibleLessonHeader`;
 *   BLOCO 4 — o Popover de Desafios ancorado em `challengesAnchorEl`; o ramo
 *     'cabecalho' nasce em `{top,right}` e se prende por `{top,left}` (cresce
 *     para a direita, sobre o main); o ramo 'acao' continua `{top,center}` /
 *     `{bottom,center}`.
 *
 * Confirmado ADICIONALMENTE por este agente contra o HISTÓRICO real (não só o
 * texto do teste irmão): `git diff 9671b22..249e1c0 -- \
 * app/src/views/LessonView/LessonView.tsx` mostra que o ramo 'acao' do
 * ternário (ambos os objetos de origem) NÃO mudou uma vírgula entre as duas
 * ondas — só o ramo 'cabecalho' (antes `{bottom,right}`/`{top,right}`) virou
 * `{top,right}`/`{top,left}`. Os valores que o irmão trava já são os CERTOS;
 * este arquivo não repete essa checagem.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO ACRESCENTA (gaps reais, verificados 1x1 antes de escrever)
 * ══════════════════════════════════════════════════════════════════════════
 *   BLOCO 1 — A ARITMÉTICA de `theoryProgress` (pedido explícito do
 *     orquestrador). O irmão só prova que a prop `theoryProgress` do
 *     componente lê a variável `theoryProgress` (mesmo NOME) — nunca executa
 *     a fórmula. Aqui a expressão real (`Math.min(100, Math.round(...))`) é
 *     EXTRAÍDA do fonte (não recopiada à mão) e EXECUTADA via `new Function`
 *     contra uma tabela de entradas, provando os dois guardas: o teto de 100
 *     (mais seções apresentadas que o total) e a divisão por zero
 *     (`Math.max(1, lesson.theory.length)` — uma aula sem teoria não vira
 *     `NaN`/`Infinity` na barra do sidebar).
 *   BLOCO 2 — NENHUMA TROCA DE AULA PUBLICA CONTEÚDO VELHO (pergunta
 *     falseável do orquestrador). Os 5 disparadores que trocam `trackLesson`
 *     (o report de erro do desafio, a pendência da trilha, a última aula da
 *     sessão, o chip de pré-requisito e "avançar para a próxima aula") são
 *     enumerados por VARREDURA (não por linha fixa) e cada um precisa ser
 *     seguido por `loadLesson(...)` antes do PRÓXIMO disparador — e
 *     `loadLesson` só tem UM `setLesson(null)` no arquivo inteiro, síncrono
 *     (antes do primeiro `.then(`), garantindo que toda troca passa por um
 *     estado `lesson === null` antes de qualquer conteúdo novo chegar.
 *   BLOCO 3 — A ORDEM ESTRUTURAL dos 3 retornos antecipados (vazio → erro →
 *     carregando) contra o cálculo de progresso e o portal — o irmão ancora
 *     só a POSIÇÃO do portal relativa ao início da árvore ativa; aqui a
 *     cadeia inteira de 5 índices é comparada, e cada bloco antecipado é
 *     recortado (parênteses balanceados) para confirmar que NENHUM deles
 *     contém o portal ou o cabeçalho — não só "o portal vem depois de algum
 *     ponto", mas "vazio precede erro precede carregando precede o cálculo
 *     precede o portal", nessa ordem exata.
 *   BLOCO 4 — `pendingChallengeCount`: UMA computação (`challengeBadgeCount`,
 *     já testada alhures — não retestada aqui), DOIS consumidores (o botão do
 *     sidebar E a linha de ação), a MESMA variável nos dois — nunca dois
 *     cálculos que podem divergir. O irmão só olha o prop do sidebar
 *     isoladamente.
 *   BLOCO 5 — UNICIDADE NO REPOSITÓRIO: varredura recursiva (a mesma técnica
 *     do Bloco 3 do irmão, aplicada a um alvo diferente) confirmando que
 *     NENHUM outro arquivo de `src/` renderiza `<LessonSidebarHeader` ou
 *     `<ShellSidebarPortal` como JSX — só `LessonView.tsx`. (As strings
 *     aparecem em PROSA de comentário em `ShellSidebarSlot.tsx`,
 *     `SessionFrame.tsx` e no próprio `LessonSidebarHeader.tsx`; por isso a
 *     varredura roda sobre o fonte SEM comentários.)
 *   BLOCO 6 — DETALHES FINOS do Popover e do título que sobraram: o `onClose`
 *     só reseta a ÂNCORA (não mexe em `challengesFrom` — a próxima abertura
 *     pela linha de ação não deveria herdar a direção da anterior por
 *     acidente); e `lesson.title` aparece exatamente 1x no arquivo (só a prop
 *     do sidebar — nenhuma cópia do h1 desenhada na coluna do main).
 *
 * ── O QUE ESTE ARQUIVO NÃO RESPONDE (documentado, não escondido) ───────────
 *   - o h1 REAL dentro do `<section>`, fora do `main`, e o conteúdo trocando
 *     de fato na tela — GUI real (tests/e2e/e2e-lesson.spec.ts, que já ganhou
 *     as asserções de 1 h1/1 banner/slot vazio/troca de aula nesta onda; não
 *     roda no gate desta suíte);
 *   - a estrutura SSR do COMPONENTE PUBLICADO (raiz `<section>`, aria-labelledby
 *     apontando pro id do h1, nenhum `<header>`/`role="banner"`, exatamente UM
 *     `<h1>` com o título inteiro) — já provada por HTML renderizado em
 *     tests/lessonSidebarHeader.test.ts:226-247 (e pelo texto-fonte em :453-458);
 *     tests/lessonSidebarWiring.test.ts prova o lado da VIEW (1x
 *     `<LessonSidebarHeader>`, nenhum `<header>` nela — Bloco 3 do irmão). Uma
 *     guarda de fonte aqui seria PROVA MAIS FRACA do que o SSR que o irmão já
 *     faz, por isso não repetida neste arquivo;
 *   - o `:empty` do SessionFrame esvaziando o slot quando a view desmonta —
 *     comportamento do PRÓPRIO slot (tests/shellSidebar.test.ts), fora do
 *     arquivo sob teste aqui;
 *   - a fórmula de `challengeBadgeCount` em si (gate de liberação do desafio)
 *     — função pura já testada em outro arquivo; aqui só a FIAÇÃO dela
 *     (chamada 1x, consumida 2x pela MESMA variável) é nova.
 *
 * Sem jsdom (convenção da casa): tudo aqui é guarda de fonte (regex/índice
 * sobre o texto sem comentários) ou aritmética pura executada a partir da
 * expressão extraída — nenhum teste renderiza a LessonView inteira.
 *
 * Reprodução: `bash tools/t.sh tests/lessonSidebarWiringCoverage.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(HERE, '../src');
const VIEW_PATH = resolve(SRC_DIR, 'views/LessonView/LessonView.tsx');

/** Fonte sem comentários — a mesma técnica de tests/lessonSidebarWiring.test.ts
 *  e tests/lessonChatLayout.test.ts: só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Quantas vezes `needle` aparece em `hay` (literal, sem regex). */
function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

const VIEW_SRC = readFileSync(VIEW_PATH, 'utf8');
const VIEW = codeOf(VIEW_SRC);

/**
 * O índice que FECHA a chave que abre em `openBraceIdx` (contando
 * profundidade) — usado para recortar o CORPO de uma função (`{ ... }`).
 */
function braceBody(src: string, openBraceIdx: number): { start: number; end: number } {
  let depth = 0;
  for (let i = openBraceIdx; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return { start: openBraceIdx, end: i + 1 };
    }
  }
  assert.fail(`a chave que abre em ${openBraceIdx} não fecha`);
}

/**
 * O índice que FECHA o parêntese que abre em `openParenIdx` — usado para
 * recortar um `return ( ... )` inteiro (JSX com parênteses aninhados).
 */
function parenBody(src: string, openParenIdx: number): { start: number; end: number } {
  let depth = 0;
  for (let i = openParenIdx; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) return { start: openParenIdx, end: i + 1 };
    }
  }
  assert.fail(`o parêntese que abre em ${openParenIdx} não fecha`);
}

/** O `return ( ... )` (recortado inteiro) do primeiro `return (` encontrado
 *  a partir de `condIdx` — o corpo de um estado de saída antecipada. */
function returnBlockAfter(view: string, condIdx: number): string {
  const marker = 'return (';
  const retAt = view.indexOf(marker, condIdx);
  assert.notEqual(retAt, -1, `nenhum "${marker}" depois do índice ${condIdx}`);
  const { start, end } = parenBody(view, retAt + marker.length - 1);
  return view.slice(start, end);
}

/** Todo arquivo de código-fonte abaixo de `dir` (recursivo, em runtime — a
 *  mesma técnica do Bloco 3 de tests/lessonSidebarWiring.test.ts). */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(ent.name)) out.push(full);
  }
  return out;
}

/** O span `[start, end)` de uma tag JSX AUTOFECHADA (`<Nome ... />`) — só
 *  serve para tags simples cujos valores de prop não contêm o literal `/>`
 *  (verdadeiro para `LessonSidebarHeader`/`LessonActionRow` nesta view). */
function selfClosingTagSpan(view: string, tagName: string): { start: number; end: number } {
  const start = view.indexOf(`<${tagName}`);
  assert.notEqual(start, -1, `<${tagName} não encontrada na view`);
  const end = view.indexOf('/>', start);
  assert.notEqual(end, -1, `<${tagName} não se autofecha com />`);
  return { start, end: end + 2 };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 1 — a ARITMÉTICA de theoryProgress: extraída do fonte e EXECUTADA
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('1. theoryProgress: a fórmula real, extraída do fonte e executada', () => {
  const marker = 'const theoryProgress = ';
  const at = VIEW.indexOf(marker);
  assert.notEqual(at, -1, 'a declaração de theoryProgress sumiu da LessonView');
  const from = at + marker.length;
  const to = VIEW.indexOf(';', from);
  assert.notEqual(to, -1, 'a declaração de theoryProgress não termina em ";"');
  const expr = VIEW.slice(from, to);

  type Fake = { presentedSections: { length: number }; theory: { length: number } };
  type TheoryProgressFn = (chat: Pick<Fake, 'presentedSections'>, lesson: Pick<Fake, 'theory'>) => number;
  // A expressão é EXTRAÍDA (não recopiada) e vira uma função real — o teste
  // executa o MESMO código-fonte que a view roda, não uma reimplementação que
  // poderia silenciosamente divergir da fórmula real.
  const theoryProgressOf = new Function('chat', 'lesson', `return (${expr});`) as unknown as TheoryProgressFn;

  it('é um `const` simples — não um useMemo com deps que poderiam ficar velhas', () => {
    assert.ok(
      VIEW.includes('const theoryProgress = Math.min(100,'),
      'theoryProgress precisa ser recalculado TODO render a partir de chat/lesson atuais; ' +
        'um useMemo com array de deps errado reintroduziria progresso desatualizado no sidebar',
    );
  });

  it('declara os dois guardas esperados no próprio texto da expressão', () => {
    assert.match(expr, /Math\.min\(100,/, 'sem o teto de 100 a barra do sidebar poderia passar de 100%');
    assert.match(expr, /Math\.max\(1,\s*lesson\.theory\.length\)/, 'sem a guarda, uma aula sem teoria (0) dividiria por zero');
  });

  it('tabela de valores: proporção comum, aula concluída e aula recém-aberta', () => {
    assert.equal(theoryProgressOf({ presentedSections: { length: 0 } }, { theory: { length: 5 } }), 0, '0 de 5 seções');
    assert.equal(theoryProgressOf({ presentedSections: { length: 5 } }, { theory: { length: 5 } }), 100, '5 de 5 seções');
    assert.equal(theoryProgressOf({ presentedSections: { length: 3 } }, { theory: { length: 4 } }), 75, '3 de 4 seções');
    assert.equal(theoryProgressOf({ presentedSections: { length: 1 } }, { theory: { length: 1 } }), 100, '1 de 1 seção');
  });

  it('arredondamento: Math.round nas dízimas (33%, 67%, 13%)', () => {
    assert.equal(theoryProgressOf({ presentedSections: { length: 1 } }, { theory: { length: 3 } }), 33, '1/3 = 33,33…% → 33');
    assert.equal(theoryProgressOf({ presentedSections: { length: 2 } }, { theory: { length: 3 } }), 67, '2/3 = 66,67…% → 67');
    assert.equal(theoryProgressOf({ presentedSections: { length: 1 } }, { theory: { length: 8 } }), 13, '1/8 = 12,5% → 13 (round meio pra cima)');
  });

  it('teto de 100: mais seções apresentadas que o total nunca estoura a barra', () => {
    // Cenário real: a teoria mudou de tamanho (regeneração) com presentedSections
    // já maior que o novo total — sem Math.min(100, …) a barra do LinearProgress
    // receberia um value > 100 (MUI clipa visualmente, mas o aria-valuenow do
    // aria-label interpolado no LessonSidebarHeader NÃO deveria dizer "200%").
    assert.equal(theoryProgressOf({ presentedSections: { length: 10 } }, { theory: { length: 5 } }), 100);
    assert.equal(theoryProgressOf({ presentedSections: { length: 2 } }, { theory: { length: 1 } }), 100);
  });

  it('guarda de divisão por zero: teoria vazia não produz NaN/Infinity', () => {
    // Math.max(1, lesson.theory.length) garante denominador >= 1 mesmo com
    // theory.length === 0 (aula sem teoria, caso de borda de conteúdo) — sem a
    // guarda, 0/0*100 é NaN e o aria-label interpolaria "NaN%" no sidebar.
    const semTeoria = theoryProgressOf({ presentedSections: { length: 0 } }, { theory: { length: 0 } });
    assert.equal(semTeoria, 0);
    assert.ok(Number.isFinite(semTeoria), 'NaN/Infinity vazariam para o aria-label da barra');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 2 — nenhuma TROCA DE AULA deixa o sidebar com conteúdo velho
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('2. toda troca de aula passa por loadLesson → setLesson(null) → carregando', () => {
  const setTrackLessonAt = [...VIEW.matchAll(/\bsetTrackLesson\(/g)].map((m) => m.index);

  it('há exatamente 5 disparadores de troca de aula (varredura, não linha fixa)', () => {
    // Os 5: o report de erro do desafio (Desafio → Aula), a pendência da
    // trilha (Trilha → Aula), a última aula da sessão (restauração), o chip
    // de pré-requisito (openPrerequisite) e "avançar para a próxima aula". Se
    // este número mudar, um disparador novo (ou removido) precisa ser
    // conferido 1x1 pelo teste seguinte — não é um número decorado à toa.
    assert.equal(setTrackLessonAt.length, 5);
  });

  it('cada setTrackLesson() é seguido por loadLesson() antes do PRÓXIMO disparador', () => {
    // Sem loadLesson() logo depois, o `lesson` em tela continuaria sendo o da
    // aula ANTERIOR (trackLesson já mudou, lesson não) — o sidebar mostraria
    // o cabeçalho errado até algum outro efeito disparar o load por acaso.
    for (let i = 0; i < setTrackLessonAt.length; i += 1) {
      const from = setTrackLessonAt[i];
      const to = i + 1 < setTrackLessonAt.length ? setTrackLessonAt[i + 1] : VIEW.length;
      const janela = VIEW.slice(from, to);
      assert.ok(
        /\bloadLesson\(/.test(janela),
        `o disparador #${i + 1} (índice ${from}) não é seguido por loadLesson() antes do próximo`,
      );
    }
  });

  it('loadLesson() tem exatamente UM setLesson(null) no arquivo — o único caminho de reset', () => {
    assert.equal(
      count(VIEW, 'setLesson(null)'),
      1,
      'dois resets independentes (ou nenhum) quebrariam a garantia de "toda troca passa por null"',
    );
  });

  it('dentro de loadLesson, setLesson(null) roda ANTES do primeiro .then( — reset SÍNCRONO', () => {
    const marker = 'const loadLesson = useCallback(';
    const loadLessonAt = VIEW.indexOf(marker);
    assert.notEqual(loadLessonAt, -1, 'loadLesson não encontrado');
    const arrowAt = VIEW.indexOf('=>', loadLessonAt);
    assert.notEqual(arrowAt, -1);
    const braceAt = VIEW.indexOf('{', arrowAt);
    assert.notEqual(braceAt, -1);
    const { start, end } = braceBody(VIEW, braceAt);
    const body = VIEW.slice(start, end);
    const idxNull = body.indexOf('setLesson(null)');
    const idxThen = body.indexOf('.then(');
    assert.notEqual(idxNull, -1, 'setLesson(null) não está dentro do corpo de loadLesson');
    assert.notEqual(idxThen, -1, 'loadLesson deveria ter uma cadeia .then( (IPC assíncrono)');
    assert.ok(
      idxNull < idxThen,
      'se o reset viesse DEPOIS do primeiro .then(, ele deixaria de ser síncrono: React poderia ' +
        'pintar um frame com trackLesson NOVO e lesson ANTIGO antes do reset acontecer',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 3 — a ORDEM ESTRUTURAL: vazio < erro < carregando < progresso < portal
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('3. os 3 retornos antecipados precedem o cálculo de progresso e o portal, NESSA ORDEM', () => {
  const idxEmpty = VIEW.indexOf('if (!trackLesson) {');
  const idxError = VIEW.indexOf('if (loadError !== null) {');
  const idxLoading = VIEW.indexOf('if (!lesson) {');
  const idxProgress = VIEW.indexOf('const theoryProgress = ');
  const idxPortal = VIEW.indexOf('<ShellSidebarPortal>');

  it('todos os 5 marcadores existem no arquivo', () => {
    for (const [nome, idx] of Object.entries({ idxEmpty, idxError, idxLoading, idxProgress, idxPortal })) {
      assert.notEqual(idx, -1, `marcador ausente: ${nome}`);
    }
  });

  it('a ordem no texto-fonte é: vazio, depois erro, depois carregando, depois progresso, depois o portal', () => {
    assert.ok(idxEmpty < idxError, 'o estado vazio (sem trackLesson) precisa vir antes do de erro');
    assert.ok(idxError < idxLoading, 'o estado de erro precisa vir antes do de carregando (!lesson)');
    assert.ok(idxLoading < idxProgress, 'theoryProgress lê lesson.theory — só é seguro DEPOIS do guard !lesson');
    assert.ok(
      idxProgress < idxPortal,
      'o portal publica theoryProgress — precisa vir depois de calculado, nunca antes dos 3 retornos',
    );
  });

  it('nenhum dos 3 retornos antecipados publica o portal ou o cabeçalho', () => {
    const blocoVazio = returnBlockAfter(VIEW, idxEmpty);
    const blocoErro = returnBlockAfter(VIEW, idxError);
    const blocoCarregando = returnBlockAfter(VIEW, idxLoading);
    for (const [nome, bloco] of Object.entries({ vazio: blocoVazio, erro: blocoErro, carregando: blocoCarregando })) {
      assert.ok(!bloco.includes('<ShellSidebarPortal'), `o estado "${nome}" publicaria um portal fora da aula ativa`);
      assert.ok(!bloco.includes('<LessonSidebarHeader'), `o estado "${nome}" publicaria um cabeçalho sem aula carregada`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 4 — pendingChallengeCount: UMA computação, DOIS consumidores
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('4. pendingChallengeCount nunca diverge entre o sidebar e a linha de ação', () => {
  it('challengeBadgeCount() é chamado 1x e pendingChallengeCount é declarado 1x', () => {
    assert.equal(count(VIEW, '= challengeBadgeCount('), 1, 'duas chamadas independentes poderiam divergir (gates diferentes)');
    assert.equal(count(VIEW, 'const pendingChallengeCount'), 1, 'uma segunda declaração sombrearia ou divergiria da primeira');
  });

  it('a MESMA variável alimenta o botão do sidebar E a linha de ação (não dois cálculos)', () => {
    const sidebar = selfClosingTagSpan(VIEW, 'LessonSidebarHeader');
    const actionRow = selfClosingTagSpan(VIEW, 'LessonActionRow');
    const usos = [...VIEW.matchAll(/pendingChallengeCount=\{pendingChallengeCount\}/g)].map((m) => m.index);
    assert.equal(usos.length, 2, 'esperava exatamente 2 consumidores da variável pendingChallengeCount');
    assert.ok(
      usos.some((i) => i > sidebar.start && i < sidebar.end),
      'o botão "Desafios" do LessonSidebarHeader precisa consumir pendingChallengeCount',
    );
    assert.ok(
      usos.some((i) => i > actionRow.start && i < actionRow.end),
      'a LessonActionRow (CTA do rodapé) precisa consumir a MESMA pendingChallengeCount — ' +
        'dois cálculos aqui poderiam mostrar um badge no sidebar e outro na linha de ação',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 5 — UNICIDADE NO REPOSITÓRIO: só a LessonView publica no slot
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('5. nenhum outro arquivo de src/ publica no slot do sidebar (varredura recursiva)', () => {
  const files = sourceFiles(SRC_DIR);

  it('a varredura enxerga src/ direito (não é um verde vacuoso)', () => {
    assert.ok(files.includes(VIEW_PATH) && files.length > 50, `varredura implausível (${files.length} arquivos)`);
  });

  it('só LessonView.tsx renderiza <LessonSidebarHeader como JSX', () => {
    // A string aparece em PROSA de comentário em 3 outros arquivos (o próprio
    // componente, SessionFrame.tsx, ShellSidebarSlot.tsx) — por isso a
    // varredura roda sobre o fonte SEM comentários (codeOf), não sobre o texto
    // bruto: um grep ingênuo acharia "4 arquivos" e mascararia uma duplicata
    // real por trás do ruído de comentário.
    const usam = files
      .filter((f) => /<LessonSidebarHeader\b/.test(codeOf(readFileSync(f, 'utf8'))))
      .map((f) => relative(SRC_DIR, f));
    assert.deepEqual(usam, [relative(SRC_DIR, VIEW_PATH)], 'um segundo publicador competiria pelo MESMO slot');
  });

  it('só LessonView.tsx renderiza <ShellSidebarPortal como JSX', () => {
    const usam = files
      .filter((f) => /<ShellSidebarPortal\b/.test(codeOf(readFileSync(f, 'utf8'))))
      .map((f) => relative(SRC_DIR, f));
    assert.deepEqual(usam, [relative(SRC_DIR, VIEW_PATH)]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * BLOCO 6 — detalhes finos: o Popover fecha limpo, e o título é 1x só
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('6. Popover: o onClose reseta só a âncora; o título aparece 1x no arquivo', () => {
  it('onClose só reseta challengesAnchorEl — challengesFrom sobrevive ao fechar', () => {
    // Se onClose também mexesse em challengesFrom, a PRÓXIMA abertura (por
    // QUALQUER botão) herdaria a direção da vez anterior até o próximo clique
    // redefinir a origem — uma corrida sutil entre fechar e a próxima
    // aria-expanded/direção de crescimento.
    assert.ok(VIEW.includes('onClose={() => setChallengesAnchorEl(null)}'));
  });

  it('lesson.title aparece exatamente 1x — só a prop do sidebar, nada duplica o h1 no main', () => {
    assert.equal(count(VIEW, 'lesson.title'), 1);
  });
});
