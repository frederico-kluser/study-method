/**
 * tests/cadeadoIntegracao.test.ts — ONDA-INTEGRAÇÃO: as DUAS peças de produção
 * do "bug grave" do dono.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O PEDIDO, VERBATIM
 * ══════════════════════════════════════════════════════════════════════════
 * *"por fim um bug grave, quando clico em proxima aula NAO LIBERA o cadeado da
 * proxima aula, quero isso e quero com efeito"*.
 *
 * O cadeado tinha TRÊS peças quebradas, e as duas de PRODUÇÃO são as daqui (a
 * terceira era o harness E2E, que só ESCONDIA o defeito — travada em
 * tests/e2eTrackProgress.test.ts):
 *
 *   (A) `handleGoToNextLesson` (src/views/LessonView/LessonView.tsx) gravava a
 *       pendência e chamava `navigate('lesson')`. O botão só existe DENTRO da
 *       aba Aula e o shell monta só a view ativa (src/App.tsx: `const View =
 *       VIEWS[active]`) — `setActive('lesson')` com 'lesson' já ativo é no-op
 *       do React, a LessonView NÃO remonta, e a pendência só é lida no efeito
 *       de MONTAGEM. O clique do dono não fazia absolutamente nada.
 *   (B) `TrackChallengePanel` gravava a tentativa 'abandoned' POR CIMA do
 *       'passed' que tinha acabado de chegar, então `lastVerdict` virava
 *       'abandoned' e "Concluir aula" nunca habilitava numa aula COM desafio —
 *       sem conclusão, o cadeado seguinte não tinha como abrir NUNCA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMO CADA UMA É PROVADA
 * ══════════════════════════════════════════════════════════════════════════
 * BLOCO 1 — (B) é DECISÃO PURA: o guard virou `shouldMarkAbandon`, exportado
 *   pelo próprio painel (a produção chama ESTA função — não há cópia de
 *   teste), e a sequência real de vida do efeito é percorrida por asserção,
 *   inclusive o cleanup com o closure VELHO que era a causa.
 * BLOCO 2 — (A) é FIAÇÃO, e esta base não tem jsdom (a técnica dela é
 *   `react-dom/server`, que não dispara evento nenhum): o que só um clique
 *   provaria é cobrado como CERCA sobre o recorte da função, ancorada na
 *   fonte. A prova de comportamento de verdade é de ponta a ponta, na tela,
 *   em tests/e2e/e2e-cadeado.spec.ts (2º teste) — que era `test.fail()` e
 *   agora passa; e (B) tem a sua em tests/e2e/e2e-lesson.spec.ts ("Concluir
 *   aula" HABILITADO depois de passar o desafio pela UI).
 *
 * Reprodução: `bash tools/t.sh tests/cadeadoIntegracao.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// O import do painel é DINÂMICO, por URL, e não estático — precedente
// tests/lessonActionRow.test.ts. Motivo duro: tests/ é compilado pelo
// tsconfig.node.json, que não liga `--jsx`; um `import ... from '....tsx'`
// estático faz o `npm run lint` estourar TS6142. Em runtime (tsx) o módulo
// carrega inteiro — a função medida é a MESMA que a produção chama.
const PANEL_MODULE = new URL('../src/views/ChallengeView/TrackChallengePanel.tsx', import.meta.url)
  .href;

interface AbandonInput {
  started: boolean;
  concluded: string | null;
  hasSpec: boolean;
  marked: string | null;
}
let shouldMarkAbandon: (input: AbandonInput) => boolean;

before(async () => {
  const mod = (await import(PANEL_MODULE)) as { shouldMarkAbandon: typeof shouldMarkAbandon };
  shouldMarkAbandon = mod.shouldMarkAbandon;
  assert.equal(typeof shouldMarkAbandon, 'function', 'TrackChallengePanel parou de exportar shouldMarkAbandon');
});

const VIEW_SRC = readFileSync(resolve(HERE, '../src/views/LessonView/LessonView.tsx'), 'utf8');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const VIEW = codeOf(VIEW_SRC);

/** O corpo do `handleGoToNextLesson`, do `const` até a linha de dependências. */
function recorteGoToNext(): string {
  const ini = VIEW.indexOf('const handleGoToNextLesson');
  assert.notEqual(ini, -1, 'handleGoToNextLesson sumiu da LessonView');
  const fim = VIEW.indexOf('}, [trackLesson, nextLesson', ini);
  assert.notEqual(fim, -1, 'não achei o fecho do useCallback de handleGoToNextLesson');
  return VIEW.slice(ini, fim);
}

// ─────────────────────────────────────────────────────────────────────────
describe('(B) shouldMarkAbandon — o veredito do desafio não é sobrescrito', () => {
  it('O DEFEITO, LITERAL: o cleanup com o closure VELHO depois de PASSAR não marca abandono', () => {
    // A vida real do efeito, passo a passo:
    //   render N   → started=true, concluded=null   (o aluno está resolvendo)
    //   submit ok  → markAttempt('passed') grava markedRef='passed'
    //                e setConcluded('passed') agenda o re-render
    //   render N+1 → como `concluded` está nas deps, o React roda o CLEANUP da
    //                passada N ANTES do efeito novo — e esse cleanup enxerga o
    //                closure de N: started=true, concluded=NULL.
    // Só o REF está atualizado. É por ele, e só por ele, que o abandono é
    // barrado. Com o guard antigo (`marked !== 'failed'`) isto devolvia TRUE
    // e o 'abandoned' era gravado por cima do 'passed'.
    assert.equal(
      shouldMarkAbandon({ started: true, concluded: null, hasSpec: true, marked: 'passed' }),
      false,
      'regressão: o cleanup do efeito voltou a gravar abandono por cima de um veredito já marcado — '
        + '"Concluir aula" para de habilitar e o cadeado da aula seguinte nunca abre',
    );
  });

  it('o caso da ONDA2 continua coberto: terminal "failed" também não vira abandono', () => {
    // O desafio de AULA que falhou é marcado 'failed' ANTES de navegar; o
    // setConcluded não commita antes do unmount. Este era o ÚNICO caso que o
    // guard antigo protegia — a regra nova o contém.
    assert.equal(
      shouldMarkAbandon({ started: true, concluded: null, hasSpec: true, marked: 'failed' }),
      false,
    );
  });

  it('os quatro vereditos são terminais: nenhum aceita abandono por cima', () => {
    for (const v of ['passed', 'failed', 'timeout', 'abandoned'] as const) {
      assert.equal(
        shouldMarkAbandon({ started: true, concluded: null, hasSpec: true, marked: v }),
        false,
        `veredito terminal '${v}' foi sobrescrito por 'abandoned'`,
      );
    }
  });

  it('O ABANDONO DE VERDADE CONTINUA SENDO GRAVADO: começou, nada marcado, saiu da tela', () => {
    // O comportamento que o efeito existe para ter — trocar de desafio no meio
    // conta como tentativa abandonada. A correção não pode matá-lo.
    assert.equal(
      shouldMarkAbandon({ started: true, concluded: null, hasSpec: true, marked: null }),
      true,
    );
  });

  it('nunca começou → não há tentativa nenhuma a gravar', () => {
    assert.equal(
      shouldMarkAbandon({ started: false, concluded: null, hasSpec: true, marked: null }),
      false,
    );
  });

  it('já concluiu na tela → o desmonte é só o fim normal, não abandono', () => {
    assert.equal(
      shouldMarkAbandon({ started: true, concluded: 'passed', hasSpec: true, marked: null }),
      false,
    );
  });

  it('sem spec não existe desafio a que atribuir a tentativa', () => {
    assert.equal(
      shouldMarkAbandon({ started: true, concluded: null, hasSpec: false, marked: null }),
      false,
    );
  });

  it('CERCA: o efeito de abandono chama a função pura — nenhum guard solto voltou ao componente', () => {
    const PANEL = codeOf(
      readFileSync(resolve(HERE, '../src/views/ChallengeView/TrackChallengePanel.tsx'), 'utf8'),
    );
    assert.match(
      PANEL,
      /if \(shouldMarkAbandon\(\{[^}]*marked: markedRef\.current[^}]*\}\)\) \{/,
      'o cleanup do abandono deixou de perguntar a shouldMarkAbandon',
    );
    assert.doesNotMatch(
      PANEL,
      /markedRef\.current !== 'failed'/,
      'o guard antigo (só o "failed" protegido) voltou — é ele que apaga o "passed"',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('(A) "Avançar para a próxima aula" troca de aula NO LUGAR', () => {
  it('CERCA DE REGRESSÃO: o handler NÃO depende de navigate() para abrir a aula seguinte', () => {
    const recorte = recorteGoToNext();
    // `setPendingTrackLesson` + `navigate('lesson')` era a fórmula quebrada: na
    // aba Aula o navigate é no-op e ninguém drena a pendência.
    assert.doesNotMatch(
      recorte,
      /setPendingTrackLesson/,
      'a pendência voltou ao handler: na aba Aula ela nunca é drenada (o clique do dono vira no-op)',
    );
  });

  it('faz o MESMO que openPrerequisite — o caminho de troca de aula que sempre funcionou', () => {
    const recorte = recorteGoToNext();
    // Cada peça existe por um motivo: sem `setTrackLesson`+`loadLesson` a aula
    // nova nem é pedida; sem `closeQuizOverlay` o card da aula velha fica sobre
    // a nova; sem `setChat` o histórico anterior vaza; sem `setDoneMarked(false)`
    // a aula nova nasce "concluída"; `saveLastLesson` é o que faz uma remontagem
    // futura (troca de aba) restaurar a aula NOVA.
    for (const peca of [
      'setTrackLesson(',
      'saveLastLesson(',
      'closeQuizOverlay()',
      'setChat(createTrackLessonState)',
      'setDoneMarked(false)',
      'setLoadError(null)',
      'publishSession(',
      'loadLesson(',
    ]) {
      assert.ok(
        recorte.includes(peca),
        `handleGoToNextLesson deixou de fazer "${peca}" — trocar de aula pela metade é o defeito de volta`,
      );
    }
  });

  // ONDA 15 — A ASSERÇÃO QUE MATA O MUTANTE QUE ESTE BLOCO DEIXAVA PASSAR.
  //
  // A revisão adversarial provou que o bloco (A) era cerca de TEXTO-FONTE e não
  // de comportamento: um `handleGoToNextLesson` que faz literalmente NADA —
  // um `return;` logo depois do guard — continua CONTENDO todas as strings que
  // os `includes` acima cobram, e os 12 testes passavam. Ou seja: o defeito
  // exato do dono ("clico em próxima aula e não acontece nada") voltaria com a
  // suíte verde, que é a pior forma de um bug voltar.
  //
  // Esta asserção fecha o buraco: entre o guard de entrada e a primeira troca
  // de estado NÃO pode existir saída. O único `return` legítimo antes dela é o
  // do fallback, e ele vem SEMPRE colado num `navigate('roadmap')` — quem
  // retorna sem navegar está abandonando o clique.
  //
  // O que este arquivo NÃO consegue provar (declarado, não escondido): que a
  // aula seguinte APARECE na tela. Não há jsdom nesta base, e foi fingir que
  // havia que deixou o defeito passar. A prova de comportamento é
  // tests/e2e/e2e-cadeado.spec.ts, teste 2, que percorre o clique do dono no
  // Electron de verdade.
  it('não existe saída entre o guard e a troca de aula (o clique não pode virar no-op)', () => {
    const recorte = recorteGoToNext();
    const guard = recorte.indexOf('if (!trackLesson) return;');
    const troca = recorte.indexOf('setTrackLesson(');
    assert.ok(guard !== -1, 'o guard de entrada sumiu');
    assert.ok(troca !== -1, 'a troca de aula sumiu');
    assert.ok(troca > guard, 'a troca de aula precisa vir DEPOIS do guard');

    const miolo = recorte.slice(guard + 'if (!trackLesson) return;'.length, troca);
    // Toda saída no miolo tem de ser a do fallback — a que navega antes de sair.
    const saidas = miolo.match(/\breturn\b/g) ?? [];
    const navegacoes = miolo.match(/navigate\('roadmap'\);\s*return;/g) ?? [];
    assert.strictEqual(
      saidas.length,
      navegacoes.length,
      `há ${saidas.length} saída(s) entre o guard e a troca de aula e só ${navegacoes.length} ` +
        'delas navega antes — uma saída solta aí faz o clique do dono virar no-op de novo',
    );
  });

  it('sem próxima aula o destino continua sendo a Trilha (fallback intacto)', () => {
    const recorte = recorteGoToNext();
    assert.match(
      recorte,
      /if \(!proxima\) \{\s*navigate\('roadmap'\);/,
      'a última aula da trilha precisa cair na Trilha, não ficar parada',
    );
  });

  it('a aula aberta é a do payload nextLesson, e da trilha CORRENTE', () => {
    const recorte = recorteGoToNext();
    assert.match(recorte, /const proxima = nextLesson\?\.slug;/);
    assert.match(recorte, /loadLesson\(trackLesson\.trackSlug, proxima\)/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * (C) O DESAFIO TEM DUAS PORTAS, E AS DUAS PRECISAM DA MESMA CHAVE (ONDA 15)
 *
 * A regra é do dono e é anterior a esta onda: *"só vamos para o desafio depois
 * que o aluno provar que entendeu"*. A onda 14 pôs o desafio na linha de ação
 * de baixo e o gateou certo — mas a revisão adversarial mediu que a OUTRA
 * rota, o botão "Desafios" do cabeçalho (que já existia), abria o desafio sem
 * guard nenhum. Duas portas para o mesmo lugar, uma trancada e outra
 * escancarada: a regra valia só para quem entrasse pela primeira.
 *
 * Aqui mora a cerca de FONTE (a ligação: o handler consulta a régua antes de
 * navegar, e o popover diz o motivo). O CRITÉRIO em si — a função pura
 * `challengeOpenBlockedByQuiz` e o fato de ela ser a MESMA régua do passo da
 * linha de ação — é medido em tests/lessonActionRow.test.ts, que já carrega o
 * módulo da view por import dinâmico (este arquivo lê fonte, não importa).
 * ═══════════════════════════════════════════════════════════════════════════ */
describe('(C) as duas rotas do desafio usam a MESMA régua', () => {
  it('o handler do cabeçalho consulta a régua ANTES de navegar', () => {
    const src = VIEW_SRC;
    const i = src.indexOf('const openChallenge = useCallback(');
    assert.ok(i !== -1, 'openChallenge sumiu');
    const recorte = src.slice(i, src.indexOf('  );', i));
    const guard = recorte.indexOf('challengeOpenBlockedByQuiz(finishBlock)');
    const navega = recorte.indexOf('nav.selectTrackChallenge(');
    assert.ok(guard !== -1, 'a rota do cabeçalho voltou a não consultar a régua do quiz');
    assert.ok(navega !== -1, 'openChallenge deixou de navegar');
    assert.ok(guard < navega, 'a régua tem de ser consultada ANTES de navegar');
  });

  it('o popover DIZ por que está trancado (nada de card morto e mudo)', () => {
    const src = VIEW_SRC;
    assert.match(src, /lesson\.challengeGateQuiz/, 'a frase do bloqueio sumiu da view');
    assert.ok(
      src.includes('disabled={challengeOpenBlockedByQuiz(finishBlock)}'),
      'o card do popover precisa ficar inerte quando a régua tranca',
    );
  });
});
