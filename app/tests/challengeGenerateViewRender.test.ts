/**
 * tests/challengeGenerateViewRender.test.ts — a VIEW extraída do modal de
 * geração de desafios (`ChallengeGenerateView`) RENDERIZADA por SSR, a partir
 * dos PROPS do processo.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO EXISTE
 * ══════════════════════════════════════════════════════════════════════════
 * A extração state/view da onda de stories separou o modal em VIEW pura
 * (props → markup) e CONTAINER (loja `challengeGenerateStore` +
 * `track.onChallengeRegenerateProgress` + `challengeNav`). Este arquivo mede a
 * VIEW isolada: cada etapa do fluxo de geração é um estado de PROPS — é assim
 * que o Storybook documenta as 5 etapas, e é o que prova que a view não precisa
 * de Electron nem da loja para desenhar. O ciclo da loja em si continua medido
 * em tests/challengeGenerateStore.test.ts.
 *
 * Sem jsdom: `react-dom/server` + tema real + textos reais de pt-BR. O import
 * do `.tsx` é DINÂMICO com specifier computado (o projeto composite dos testes
 * compila sem `jsx`/DOM de propósito).
 *
 * Reprodução: `bash tools/t.sh tests/challengeGenerateViewRender.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import type { ChallengeGenerateState } from '../src/lib/challengeGenerateStore';

const VIEW_MODULE = new URL(
  '../src/components/challenge/ChallengeGenerateModal.tsx',
  import.meta.url,
).href;

/** Os props da view (declarados aqui: o import do .tsx é dinâmico). */
interface ChallengeGenerateViewProps {
  state: ChallengeGenerateState;
  cardRef: { current: null };
  onClose: () => void;
  onViewChallenge: () => void;
}

function estado(parcial: Partial<ChallengeGenerateState>): ChallengeGenerateState {
  return {
    status: 'idle',
    stage: -1,
    generationId: null,
    trackSlug: null,
    lessonId: null,
    target: null,
    challengeId: null,
    challengeTitle: null,
    errorMessage: null,
    listVersion: 0,
    ...parcial,
  };
}

/** As 5 etapas na ordem do contrato (os rótulos i18n reais do modal). */
const ETAPAS = [
  ptBR.challengeGen.stageThinking,
  ptBR.challengeGen.stageTests,
  ptBR.challengeGen.stageValidating,
  ptBR.challengeGen.stageExecuting,
  ptBR.challengeGen.stageInserting,
];

let ChallengeGenerateView: ComponentType<ChallengeGenerateViewProps>;

/** O TEXTO que chega à TELA: HTML sem folhas de estilo e sem tags. */
function onScreen(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderView(state: ChallengeGenerateState): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(ChallengeGenerateView, {
        state,
        cardRef: { current: null },
        onClose: () => {},
        onViewChallenge: () => {},
      }),
    ),
  );
}

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const mod = (await import(VIEW_MODULE)) as {
    ChallengeGenerateView: typeof ChallengeGenerateView;
  };
  ChallengeGenerateView = mod.ChallengeGenerateView;
});

describe('ChallengeGenerateView — o fluxo de geração, por props', () => {
  it('IDLE (fechado): nada é desenhado', () => {
    const html = renderView(estado({}));
    assert.ok(!html.includes('role="dialog"'), 'sem processo em voo não existe diálogo');
    assert.equal(onScreen(html), '');
  });

  it('RUNNING: o diálogo abre com título e as 5 etapas na ordem do pedido', () => {
    const html = renderView(estado({ status: 'running', stage: 0, generationId: 1 }));
    const tela = onScreen(html);

    assert.ok(html.includes('role="dialog"'), 'é um diálogo');
    assert.ok(html.includes('aria-modal="true"'), 'modal');
    assert.ok(tela.includes(ptBR.challengeGen.title), 'o título do processo está na tela');
    let anterior = -1;
    for (const etapa of ETAPAS) {
      const at = tela.indexOf(etapa);
      assert.ok(at > anterior, `a etapa "${etapa}" está na tela e na ordem do contrato`);
      anterior = at;
    }
  });

  it('RUNNING: o botão "Fechar" está presente (não aborta o main — o rótulo é honesto)', () => {
    const tela = onScreen(renderView(estado({ status: 'running', stage: 2, generationId: 1 })));
    assert.ok(tela.includes(ptBR.challengeGen.close), 'a saída do modal em curso é "Fechar"');
    assert.ok(!tela.includes(ptBR.challengeGen.cancel), 'nada de "Cancelar" — ele prometia parar o processo');
  });

  it('todas as etapas 0..4 renderizam (o marcador acompanha o stage do store)', () => {
    for (let stage = 0; stage <= 4; stage += 1) {
      const tela = onScreen(renderView(estado({ status: 'running', stage, generationId: 1 })));
      for (const etapa of ETAPAS) {
        assert.ok(tela.includes(etapa), `stage ${stage}: a etapa "${etapa}" continua no elenco`);
      }
    }
  });

  it('DONE: título de conclusão, dica e o botão "Ver desafio"', () => {
    const tela = onScreen(
      renderView(
        estado({
          status: 'done',
          stage: 4,
          generationId: 1,
          trackSlug: 'python-iniciante',
          lessonId: 'a-primeira-linha',
          target: 'lesson',
          challengeId: 'inventariar-os-modulos',
          challengeTitle: 'Inventariar os módulos',
        }),
      ),
    );
    assert.ok(tela.includes(ptBR.challengeGen.doneTitle), 'o veredito de conclusão está na tela');
    assert.ok(tela.includes(ptBR.challengeGen.doneHint), 'a dica ("já está no topo da lista") também');
    assert.ok(tela.includes(ptBR.challengeGen.viewChallenge), 'e o caminho para o desafio novo');
  });

  it('ERROR: a mensagem do processo (ou o fallback genérico) + saída', () => {
    const comMensagem = onScreen(
      renderView(estado({ status: 'error', stage: 1, generationId: 1, errorMessage: 'O motor local parou.' })),
    );
    assert.ok(comMensagem.includes('O motor local parou.'), 'a mensagem REAL do erro está na tela');
    assert.ok(comMensagem.includes(ptBR.challengeGen.close), 'e a saída do modal');

    const semMensagem = onScreen(renderView(estado({ status: 'error', stage: 1, generationId: 1 })));
    assert.ok(
      semMensagem.includes(ptBR.challengeGen.errorGeneric),
      'sem mensagem, o fallback genérico cobre (nunca uma caixa vazia)',
    );
  });
});
