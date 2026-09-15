/**
 * tests/shellNavPanel.test.ts — o painel fantasma Desafio no shell
 * (ONDA-SEM-DESAFIO-NO-RAIL).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA (e por que ele EXISTE ao lado de shellNav.test.ts)
 * ══════════════════════════════════════════════════════════════════════════
 * O pedido do dono, verbatim: *"temos que tirar o botão de desafio do left
 * bar"*. O contrato resultante é MAIS SUTIL que uma remoção: o Desafio saiu
 * do RAIL mas continua sendo PAINEL do shell (`PanelKey` = `NavKey` |
 * 'challenge'), alcançado por navegação programática. Este arquivo cobre o
 * que o shellNav.test.ts (mapa puro) NÃO cobre — a INTEGRAÇÃO dos dois lados:
 *
 *   BLOCO 1 — PanelKey no mapa puro: 'challenge' devolve -1 em `navIndexOf`
 *     (nenhuma tab selecionada), o id do PANEL continua existindo
 *     (`sm-panel-challenge`) e NENHUM índice -1 vira índice de array
 *     (navItemAt(-1) é undefined — quem consumir -1 como índice quebra aqui).
 *
 *   BLOCO 2 — O RAIL REAL renderizado com `renderToStaticMarkup` (a MESMA
 *     técnica de tests/shellSidebar.test.ts — react-dom/server, sem jsdom).
 *     Para active='challenge': QUATRO tabs, todas aria-selected="false", o
 *     rail não renderiza NENHUMA tab sm-tab-challenge e nenhum aria-controls
 *     fica pendente. Para cada destino do rail: exatamente UMA tab
 *     selecionada, com o vínculo aria-controls → painel vivo. O alvo de
 *     onboarding nav-tabs segue presente (o tutorial o ilumina em QUALQUER
 *     view — inclusive no Desafio, que é onde os steps `view: 'challenge'`
 *     pousam).
 *
 *   BLOCO 3 — GUARDAS DE FONTE (regex no .tsx — técnica de
 *     lessonSidebarWiring/inkPropReachesScreen): a TRAVESSIA programática
 *     navigateToChallenge → ChallengeNavProvider → setActive('challenge') →
 *     VIEWS['challenge'] = ChallengeView existe inteira no fonte, e o main do
 *     shell solta o aria-labelledby quando o painel ativo é o Desafio (sem
 *     tab no rail, o id apontaria para uma tab inexistente — referência ARIA
 *     pendente). Também tranca que o `onChange` do rail só navegue por
 *     NAV_ITEMS[next] (nenhum caminho do rail leva a 'challenge').
 *
 *   BLOCO 4 — ONBOARDING sem alvo inexistente: nenhum step do tutorial
 *     (completo e quick start) aponta para um id fora do catálogo
 *     (`isKnownTargetId`), o alvo nav-tabs é everywhere (existe em toda view,
 *     inclusive challenge), os steps `view: 'challenge'` continuam válidos
 *     porque 'challenge' é PanelKey (painel real), e o passo open-challenge
 *     não fica COM continue escondido + ação insatisfazível (o tutorial não
 *     pode travar: a aba foi embora, o "Continuar" é o único caminho para
 *     quem não passa por Aula/Trilha).
 *
 * Reprodução: `bash tools/t.sh tests/shellNavPanel.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import {
  NAV_ITEMS,
  navIndexOf,
  navItemAt,
  navIsContiguous,
  navPanelId,
  type NavKey,
  type PanelKey,
} from '../src/lib/shellNav';
import {
  ONBOARDING_STEPS,
} from '../src/features/onboarding/constants/onboardingSteps';
import {
  QUICK_START_STEPS,
} from '../src/features/onboarding/constants/quickStartSteps';
import {
  isKnownTargetId,
  ONBOARDING_TARGET_CATALOG,
} from '../src/features/onboarding/constants/onboardingTargets';
// ATENÇÃO ao padrão da casa: componentes .tsx são importados DINAMICAMENTE por
// URL (o tsconfig de tests/ não liga `jsx` — ver shellSidebar.test.ts); o tipo
// das props é declarado LOCALMENTE (mesmo espelho da interface real), sem
// import estático do .tsx.
type NavigationRailProps = {
  active: PanelKey;
  onChange: (key: NavKey) => void;
};
const NAVIGATION_RAIL_MODULE = new URL(
  '../src/components/shell/NavigationRail.tsx',
  import.meta.url,
).href;

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PATH = resolve(HERE, '../src/App.tsx');
const RAIL_PATH = resolve(HERE, '../src/components/shell/NavigationRail.tsx');
const CHALLENGE_NAV_PROVIDER_PATH = resolve(
  HERE,
  '../src/components/challengeNav/ChallengeNavProvider.tsx',
);
const ONBOARDING_OVERLAY_PATH = resolve(
  HERE,
  '../src/features/onboarding/components/OnboardingOverlay.tsx',
);

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const PANEL_KEYS = ['home', 'settings', 'lesson', 'roadmap', 'challenge'] as const;

/** O componente REAL do rail, carregado no `before`. */
let NavigationRail: ComponentType<NavigationRailProps>;

function renderRail(active: NavigationRailProps['active']): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(NavigationRail, { active, onChange: () => {} }),
    ),
  );
}

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção de interpolação da produção (src/i18n/index.ts).
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const rail = (await import(NAVIGATION_RAIL_MODULE)) as {
    default: ComponentType<NavigationRailProps>;
  };
  NavigationRail = rail.default;
});

/* ═══════ BLOCO 1 — PanelKey no mapa puro (o -1 é um SENTINELA, não índice) ═══════ */

describe('1. shellNav como PanelKey — o Desafio é painel, não tab', () => {
  it('navIndexOf cobre TODOS os PanelKey: destinos do rail 0..3, challenge -1', () => {
    // Cada destino do rail tem índice estável igual à posição em NAV_ITEMS.
    NAV_ITEMS.forEach((item, i) => {
      assert.equal(navIndexOf(item.key), i, `índice de ${item.key} divergiu da posição`);
    });
    // O painel fantasma: existe como painel, não como tab.
    assert.equal(navIndexOf('challenge'), -1, 'challenge NÃO pode ter índice no rail');
  });

  it('navIsContiguous vale para o rail real (4 destinos, exatamente)', () => {
    assert.equal(navIsContiguous(), true);
    assert.equal(NAV_ITEMS.length, 4);
  });

  it('-1 NUNCA é índice de array: navItemAt(-1) e navItemAt(n) são undefined', () => {
    // Propriedade do contrato "nenhum consumidor usa o -1 como índice": para
    // TODO PanelKey, se o índice existe o item existe — e para o sentinel -1
    // (e qualquer fora do range) navItemAt devolve undefined, então um
    // consumidor descuidado recebe `undefined` (e o `if (item)` do rail
    // filtra), nunca um item ERRADO.
    for (const key of PANEL_KEYS) {
      const idx = navIndexOf(key);
      if (idx === -1) continue;
      const item = navItemAt(idx);
      assert.ok(item, `navItemAt(${idx}) para ${key} veio vazio`);
      assert.equal(item.key, key, 'índice e chave desalinhados — permuta quebrada');
    }
    assert.equal(navItemAt(-1), undefined, '-1 virou item de array (bug: o sentinel vazou)');
    assert.equal(navItemAt(NAV_ITEMS.length), undefined, 'índice além do fim virou item');
  });

  it('o id do PANEL Desafio existe (o main do shell o usa como tabpanel)', () => {
    assert.equal(navPanelId('challenge'), 'sm-panel-challenge');
    // E nenhum destino do rail compartilha o namespace do painel fantasma.
    for (const item of NAV_ITEMS) {
      assert.notEqual(navPanelId(item.key), navPanelId('challenge'));
    }
  });

  it('os DOIS locales preservam as chaves nav.* usadas pelo rail (e nav.challenge sobrevive para o overlay)', () => {
    // O rail resolve os rótulos em runtime; um locale sem a chave renderiza a
    // chave crua (`translation:nav.home`) — silenciosamente quebrado, por isso
    // os DOIS locales são trancados aqui.
    for (const [locale, resources] of [
      ['pt-BR', ptBR],
      ['en', en],
    ] as const) {
      for (const item of NAV_ITEMS) {
        const key = item.i18nKey.replace('translation:', '');
        const value = (resources as unknown as Record<string, Record<string, string>>).nav?.[key.replace('nav.', '')];
        assert.ok(value, `locale ${locale} perdeu a chave ${item.i18nKey}`);
        assert.equal(typeof value, 'string');
      }
      // A chave do Desafio continua existindo: o OnboardingOverlay (NAV_TAB_KEY)
      // a consome para a dica "vá para a aba X" — removê-la quebraria a dica.
      assert.ok(
        (resources as unknown as Record<string, Record<string, string>>).nav?.challenge,
        `locale ${locale} perdeu nav.challenge (o overlay de onboarding ainda o usa)`,
      );
    }
  });
});

/* ═══════ BLOCO 2 — O RAIL REAL renderizado (SSR do componente de produção) ═══════ */

describe('2. NavigationRail renderizado — o Desafio NÃO é tab, os 4 destinos são', () => {
  it('challenge ativo: 4 tabs, TODAS deselecionadas (navIndexOf devolveu -1 ao Tabs value)', () => {
    const html = renderRail('challenge');
    assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 0,
      'nenhuma tab pode ficar selecionada com o painel Desafio ativo');
    assert.equal((html.match(/aria-selected="false"/g) ?? []).length, NAV_ITEMS.length,
      'as 4 tabs do rail seguem presentes (e apenas elas)');
  });

  it('challenge ativo: NENHUMA tab sm-tab-challenge e NENHUM aria-controls pendente', () => {
    const html = renderRail('challenge');
    assert.ok(!html.includes('sm-tab-challenge'),
      'o rail renderizou uma tab do Desafio — o item voltou ao rail sem querer');
    assert.ok(!html.includes('aria-controls='),
      'com o painel fantasma ativo, nenhuma tab pode apontar aria-controls (o vínculo é por tab ativa)');
  });

  it('cada destino do rail: exatamente UMA tab selecionada, vínculo → painel vivo', () => {
    for (const item of NAV_ITEMS) {
      const html = renderRail(item.key);
      assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1,
        `${item.key}: esperava exatamente UMA tab selecionada`);
      const otherKeys = NAV_ITEMS.filter((n) => n.key !== item.key).map((n) => n.key);
      for (const other of otherKeys) {
        assert.ok(
          !new RegExp(`id="sm-tab-${other}"[^>]*aria-selected="true"`).test(html) &&
            !new RegExp(`aria-selected="true"[^>]*id="sm-tab-${other}"`).test(html),
          `${item.key}: a tab ${other} não pode estar selecionada`,
        );
      }
      assert.ok(html.includes(`aria-controls="sm-panel-${item.key}"`),
        `${item.key}: a tab selecionada deve anunciar o painel vivo por aria-controls`);
    }
  });

  it('as ids dos tabs são EXATAMENTE as do rail — e nenhuma outra', () => {
    const html = renderRail('home');
    const ids = (html.match(/id="(sm-tab-[^"]+)"/g) ?? []).map((s) => s.replace(/id="|"/g, ''));
    assert.deepEqual(
      ids.sort(),
      NAV_ITEMS.map((n) => navPanelId(n.key).replace('sm-panel-', 'sm-tab-')).sort(),
      'o rail tem que renderizar uma tab por NAV_ITEM — nem mais (Desafio!) nem menos',
    );
  });

  it('os rótulos vêm do i18n REAL (o mapa nav.* resolve nos DOIS locales)', () => {
    const html = renderRail('home');
    assert.ok(html.includes(ptBR.nav.home), 'rótulo Início (pt-BR)');
    assert.ok(html.includes(ptBR.nav.settings), 'rótulo Settings');
    assert.ok(html.includes(ptBR.nav.lesson), 'rótulo Aula');
    assert.ok(html.includes(ptBR.nav.roadmap), 'rótulo Trilha');
    assert.ok(!html.includes('translation:nav.'), 'nenhuma chave i18n crua pode vazar para o DOM');
    // O aria-label do rail também resolve (chave shell.rail.aria).
    assert.ok(html.includes(ptBR.shell.rail.aria), 'aria-label do rail resolvido do locale');
  });

  it('o alvo de onboarding nav-tabs está montado em QUALQUER view (inclusive Desafio)', () => {
    for (const key of PANEL_KEYS) {
      const html = renderRail(key);
      assert.ok(html.includes('data-onboarding-target="nav-tabs"'),
        `o rail perdeu o alvo nav-tabs com active=${key} (o tutorial ilumina este alvo em todas as views)`);
    }
  });
});

/* ═══════ BLOCO 3 — Guardas de fonte: a travessia programática Desafio ═══════ */

describe('3. guardas de fonte — navigateToChallenge chega à ChallengeView sem rail', () => {
  const app = codeOf(readFileSync(APP_PATH, 'utf8'));
  const rail = codeOf(readFileSync(RAIL_PATH, 'utf8'));
  const provider = codeOf(readFileSync(CHALLENGE_NAV_PROVIDER_PATH, 'utf8'));

  it('App.tsx: VIEWS registra challenge → ChallengeView (o painel fantasma é montável)', () => {
    // O elo FINAL da travessia: setActive('challenge') lê VIEWS['challenge'].
    assert.match(
      app,
      /VIEWS:\s*Record<PanelKey,\s*ComponentType<ViewProps>>/,
      'VIEWS tem que ser indexado por PanelKey (challenge incluído), não por NavKey',
    );
    assert.match(app, /challenge:\s*ChallengeView/);
  });

  it('App.tsx: o provider liga navigateToChallenge → setActive("challenge")', () => {
    // O elo do MEIO: o contexto do Desafio delega ao estado do shell.
    assert.match(
      app,
      /onNavigateChallenge=\{\(\) => setActive\('challenge'\)\}/,
      'o ChallengeNavProvider precisa chamar setActive("challenge") — sem isso o painel fantasma é inalcançável',
    );
  });

  it('ChallengeNavProvider expõe navigateToChallenge ligado a onNavigateChallenge', () => {
    assert.match(provider, /navigateToChallenge:\s*navigate/);
    assert.match(provider, /onNavigateChallenge \?\? \(\(\) => \{\}\)/,
      'sem provider explícito o navigate é no-op — o default precisa existir');
  });

  it('App.tsx: main solta o aria-labelledby quando o painel ativo é o Desafio', () => {
    // Sem tab no rail, aria-labelledby="sm-tab-challenge" seria referência
    // ARIA pendente (o id apontaria para o vazio). O painel fica sem rótulo
    // referenciado em vez de apontar para o nada.
    assert.match(
      app,
      /aria-labelledby=\{active === 'challenge' \? undefined : navTabId\(active\)\}/,
      'o main tem que soltar aria-labelledby para o painel Desafio',
    );
    // E o id do painel continua navPanelId(active) — o tabpanel do Desafio
    // existe com o id sm-panel-challenge.
    assert.match(app, /id=\{navPanelId\(active\)\}/);
    assert.doesNotMatch(app, /navTabId\('challenge'\)/,
      'navTabId é só para NavKey — ninguém pode gerar sm-tab-challenge');
  });

  it('NavigationRail: as tabs nascem de NAV_ITEMS.map e o onChange só navega por NAV_ITEMS[next]', () => {
    // A fonte ÚNICA das tabs: se alguém adicionar um <Tab> solto com key
    // 'challenge', o mapa deixa de ser a única verdade — a guarda abaixo
    // tranca o formato atual (um único .map gerando os <Tab>).
    assert.match(rail, /\{NAV_ITEMS\.map\(\(item, i\) => \(/);
    const tabJsx = rail.match(/<Tab[\s\S]*?\/>/g) ?? [];
    assert.equal(tabJsx.length, 1, `esperava UM bloco <Tab> (dentro do map), veio ${tabJsx.length}`);
    // O roteamento do onChange: índice → NAV_ITEMS[next] → item.key. Nenhum
    // caminho do rail leva a 'challenge' (a única forma de chegar lá é o
    // challengeNav — pedido do dono).
    assert.match(rail, /NAV_ITEMS\[next\]/);
    assert.match(rail, /onChange\(item\.key\)/);
    assert.doesNotMatch(rail, /onChange\('challenge'\)|onChange\("challenge"\)/);
  });

  it('NavigationRail: o mapa de ícones é Record<NavKey, …> — um NavKey novo não compila sem ícone, e challenge não tem ícone', () => {
    assert.match(rail, /Record<NavKey, ReactElement>/);
    for (const item of NAV_ITEMS) {
      assert.match(rail, new RegExp(`${item.key}:\\s*<[A-Z]`), `ícone do destino ${item.key} sumiu`);
    }
    assert.doesNotMatch(rail, /challenge:\s*</, 'o Desafio NÃO pode ter ícone no rail (não é tab)');
  });
});

/* ═══════ BLOCO 4 — ONBOARDING sem alvo inexistente (o tutorial não trava) ═══════ */

describe('4. onboarding — nenhum step aponta para alvo que não existe', () => {
  const ALL_STEPS = [...ONBOARDING_STEPS, ...QUICK_START_STEPS];
  const overlay = codeOf(readFileSync(ONBOARDING_OVERLAY_PATH, 'utf8'));

  it('todo targetSelector de step referencia um id KNOWN do catálogo', () => {
    for (const step of ALL_STEPS) {
      const m = /data-onboarding-target="([^"]+)"/.exec(step.targetSelector);
      assert.ok(m, `step ${step.id}: selector fora do formato data-onboarding-target`);
      assert.ok(
        isKnownTargetId(m[1]),
        `step ${step.id} aponta para o alvo INEXISTENTE "${m[1]}" (o overlay pularia ou travaria)`,
      );
    }
  });

  it('o alvo nav-tabs é everywhere — existe em toda view, inclusive no Desafio', () => {
    assert.equal(ONBOARDING_TARGET_CATALOG['nav-tabs']?.everywhere, true,
      'os steps open-challenge/tour-complete iluminam o rail com view challenge — sem everywhere o alvo não pousaria');
  });

  it('os steps do Desafio continuam válidos: view "challenge" é PanelKey (painel real, não aba do rail)', () => {
    const challengeSteps = ALL_STEPS.filter((s) => s.view === 'challenge');
    assert.ok(challengeSteps.length >= 2, 'os steps do capítulo Desafio sumiram do onboarding');
    // 'challenge' NÃO é NavKey — nenhum step pode tratar a view Desafio como
    // destino de rail (o caminho é Aula/Trilha via challengeNav).
    for (const step of challengeSteps) {
      assert.ok(
        !NAV_ITEMS.some((n) => n.key === step.view),
        `step ${step.id} aponta para um destino do rail que não é mais tab`,
      );
    }
  });

  it('o passo open-challenge tem o botão Continuar (sem aba, é o único caminho de quem não vem da Aula/Trilha)', () => {
    for (const step of ALL_STEPS) {
      if (step.expectedAction !== 'open-challenge') continue;
      assert.ok(
        !step.hideContinueButton,
        `step ${step.id}: alvo = rail (presente ⇒ não pula) + ação insatisfazível pelo rail + Continuar escondido = tutorial TRAVADO`,
      );
    }
  });

  it('o overlay do onboarding ainda resolve o rótulo da dica para o painel Desafio (nav.challenge)', () => {
    // O overlay mostra "Vá para a aba: <nav.*>" — o painel Desafio existe e a
    // chave i18n nav.challenge segue no locale para a dica fazer sentido.
    assert.match(overlay, /Record<PanelKey,/);
    assert.match(overlay, /challenge:\s*'translation:nav\.challenge'/);
  });
});
