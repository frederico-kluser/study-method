/**
 * tests/lessonSourcesViewerGaps.test.ts — ONDA2-FONTES: as arestas que
 * tests/lessonSourcesViewer.test.ts e tests/navigationGuard.test.ts NÃO
 * assertam (nada aqui duplica aqueles dois — cada caso abaixo foi checado
 * contra eles antes de entrar).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Os gaps (verificados no fonte de cada um)
 * ══════════════════════════════════════════════════════════════════════════
 *   G1 — O IFRAME SEGUE A PROP. O teste irmão renderiza com a fonte MDN FIXA:
 *     um componente que GRAVASSE aquela URL/título no código passaria verde.
 *     Aqui renderiza-se com OUTRA fonte — e com `openExternalHref` DIFERENTE
 *     de `source.url`, provando que o iframe lê `source.*` e o link de
 *     reserva lê SOMENTE a prop `openExternalHref` (que é exatamente como a
 *     view o fia: `openExternalHref={openSource.url}`).
 *   G2 — O OVERLAY pinta com o MESMO fundo da superfície do app
 *     (`bgcolor: theme.vars.palette.surface.level0`) e tem o viewer como
 *     filho — o irmão mede só position/inset/zIndex.
 *   G3 — O TABPANEL DO APP mantém `id={navPanelId(active)}` JUNTO do
 *     `position: 'relative'` — e a string que o App emite como id é a MESMA
 *     que a view procura no `getElementById` (navPanelId('lesson') ===
 *     'sm-panel-lesson'). O irmão mede o 'relative' sem o id no mesmo recorte.
 *   G4 — CHAVE MORTA i18n: a paridade estrutural de i18n-resources não pega
 *     chave presente nos DOIS locales e não usada por ninguém (e a tela do
 *     irmão só pega o caminho do RENDER). Aqui: o conjunto `lesson.sourcesViewer*`
 *     dos locales é EXATAMENTE o conjunto referenciado pela view, e cada chave
 *     resolve não-vazia, não-crua e DISTINTA entre pt-BR e en.
 *   G5 — ARESTAS do viewer: `description` opcional ausente não quebra; título
 *     longo renderiza por inteiro e o truncamento é o `noWrap` do CSS (SC
 *     1.4.10 — SSR emite o texto todo, o corte é visual); o foco nasce no
 *     "Fechar" (pré-requisito do Esc do fechar único — sem foco, o keydown
 *     morre num nó órfão); o diálogo de Fontes anuncia o estado vazio.
 *   G6 — O NORMALIZADOR DE EXIBIÇÃO (ONDA5-FONTES, finding-3): o título
 *     "<Nome> — <qualificador>" vira Nome + tagline sem travessão (o conteúdo
 *     nunca se reescreve); recheio sai de todo, parêntese de rascunho sobe
 *     para o Nome, qualificador que repete a abertura da descrição cede à
 *     descrição. Ancorado em `src/lib/sourceTitle.ts` + o portão de qualidade
 *     que reprova o padrão em conteúdo NOVO (`FONTE_TITULO_PADRAO_IA`).
 *
 * Padrão SSR de tests/lessonSourcesViewer.test.ts (sem jsdom): o componente é
 * montado com o tema e o i18n REAIS; o que é efeito/estado da VIEW é cobrado
 * como texto ancorado no recorte da função. O import do .tsx é NÃO-literal
 * (padrão do repo contra o TS6142 no projeto node).
 *
 * Reprodução: `bash tools/t.sh tests/lessonSourcesViewerGaps.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next, { type i18n as I18nInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import { navPanelId } from '../src/lib/shellNav';
import { createAppI18n } from '../src/i18n/index';
// ONDA5-FONTES (G6): o normalizador de exibição dos títulos de fonte.
import { dedupeQualifier, normalizeSourceTitle, sourceHost } from '../src/lib/sourceTitle';
// ONDA5-FONTES (G6): o portão que impede o padrão de voltar em conteúdo novo.
import {
  portaoDeQualidade,
  REPROVACOES,
  type ColheitaParaGate,
} from '../electron/main/engine/research/qualityGate';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIEW_PATH = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
const VIEW_SRC = readFileSync(VIEW_PATH, 'utf8');
const VIEW_MODULE = new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).href;
const APP_PATH = resolve(HERE, '../src/App.tsx');
const APP_SRC = readFileSync(APP_PATH, 'utf8');
const THEME_PATH = resolve(HERE, '../src/theme.ts');
const THEME_SRC = readFileSync(THEME_PATH, 'utf8');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
/** Colapso de espaços — a âncora casa em UMA linha lógica, não em uma física. */
function flat(text: string): string {
  return codeOf(text).replace(/\s+/g, ' ');
}

const VIEW = flat(VIEW_SRC);
const APP = codeOf(APP_SRC);

/** Achata um objeto aninhado em chaves pontilhadas (mesmo contrato do irmão). */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

interface ViewerProps {
  source: { title: string; url: string; description?: string };
  onClose: () => void;
  openExternalHref: string;
}

let LessonSourceViewer: ComponentType<ViewerProps>;
/**
 * Instância PRÓPRIA do bloco SSR (via I18nextProvider explícito). NÃO usamos
 * o default global do react-i18next: outros testes DESTE arquivo criam
 * instâncias isoladas (createAppI18n) e qualquer teste irmão pode mexer no
 * singleton — um render SSR que dependa do default ficaria refém da ordem dos
 * testes (medido: o render perdia as traduções quando rodava depois de um
 * createAppI18n). Instância própria = o render é idempotente.
 */
let ssrI18n: I18nInstance;

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  ssrI18n = i18next.createInstance();
  await ssrI18n.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção de interpolação da produção (src/i18n/index.ts).
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const mod = (await import(VIEW_MODULE)) as { LessonSourceViewer: typeof LessonSourceViewer };
  LessonSourceViewer = mod.LessonSourceViewer;
});

function render(props: Partial<ViewerProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: ssrI18n },
      createElement(
        ThemeProvider,
        { theme },
        createElement(LessonSourceViewer, {
          source: { title: 'Fonte G', url: 'https://example.org/g' },
          onClose: () => {},
          openExternalHref: 'https://example.org/g',
          ...props,
        }),
      ),
    ),
  );
}

/** A tag de abertura do <iframe> renderizado (só pode haver UM). */
function iframeTag(html: string): string {
  const at = html.indexOf('<iframe');
  assert.notEqual(at, -1, 'nenhum <iframe> foi renderizado');
  return html.slice(at, html.indexOf('>', at) + 1);
}

/** A tag de abertura do elemento que CONTÉM `marker` (âncora do irmão). */
function tagOfElementWith(html: string, marker: string, tag: string): string {
  let at = html.indexOf(marker);
  while (at !== -1) {
    const open = html.lastIndexOf(`<${tag}`, at);
    if (open !== -1 && !html.slice(open, at).includes(`</${tag}>`)) {
      return html.slice(open, html.indexOf('>', open) + 1);
    }
    at = html.indexOf(marker, at + 1);
  }
  assert.fail(`nenhum <${tag}> com "${marker}" foi renderizado`);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * G1 — o iframe lê a PROP (uma fonte fixa no teste não prova nada) e a
 *      FIAÇÃO do openExternalHref tem âncora na view (o href que chega aqui
 *      é o openSource.url que a view passa — provado na fonte, linha única)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('G1. O embed segue a prop — outra fonte, outro href', () => {
  it('uma OUTRA fonte renderiza o iframe DELA (src/title não estão gravados no código)', () => {
    const tag = iframeTag(
      render({
        source: { title: 'Python Docs — tutorial', url: 'https://docs.python.org/3/tutorial/' },
      }),
    );
    assert.match(tag, /src="https:\/\/docs\.python\.org\/3\/tutorial\/"/);
    assert.match(tag, /title="Python Docs — tutorial"/);
  });

  it('openExternalHref é independente de source.url — iframe segue source, o link segue o href', () => {
    const html = render({
      source: { title: 'A', url: 'https://fonte.example/artigo' },
      openExternalHref: 'https://reserva.example/artigo',
    });
    assert.match(
      iframeTag(html),
      /src="https:\/\/fonte\.example\/artigo"/,
      'o iframe deve ler source.url',
    );
    const link = tagOfElementWith(html, 'Abrir no navegador', 'a');
    assert.match(link, /href="https:\/\/reserva\.example\/artigo"/, 'o link de reserva deve ler openExternalHref');
    assert.ok(!link.includes('fonte.example'), 'o link NÃO pode herdar source.url por conta própria');
    // A FIAÇÃO na fonte (1 linha): é a view que passa openSource.url — sem
    // esta âncora, um `<LessonSourceViewer … openExternalHref="constante">`
    // passaria pelos renders de cima.
    assert.match(
      VIEW,
      /<LessonSourceViewer source=\{openSource\} onClose=\{closeSourceViewer\} openExternalHref=\{openSource\.url\}/,
      'a view deve fiar openExternalHref={openSource.url} no visualizador',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * G2 — o overlay do portal: fundo da superfície + viewer como filho
 * ═══════════════════════════════════════════════════════════════════════════ */

/** O recorte EXATO do portal na view (do createPortal ao alvo lessonPanel). */
function portalSlice(): string {
  const at = VIEW.indexOf('? createPortal(');
  assert.notEqual(at, -1, 'a view deve criar o portal do visualizador');
  const end = VIEW.indexOf(', lessonPanel,', at);
  assert.notEqual(end, -1, 'o alvo do portal deve ser o nó lessonPanel');
  return VIEW.slice(at, end);
}

describe('G2. O overlay do portal — mesmo fundo da superfície, viewer dentro', () => {
  it('o overlay pinta com surface.level0 — o MESMO fundo da superfície do app', () => {
    const slice = portalSlice();
    assert.match(
      slice,
      /bgcolor: theme\.vars\.palette\.surface\.level0/,
      'sem o fundo da rampa de superfície o iframe flutuaria numa folha branca',
    );
    assert.match(slice, /display: 'flex',/, 'o overlay é flex ROW (cabeçalho em linha + embed): quem empilha em coluna é o Box interno do viewer');
  });

  it('o token surface.level0 existe na rampa do tema (âncora no theme.ts)', () => {
    assert.match(
      THEME_SRC,
      /interface SurfaceRamp \{[^}]*level0:/s,
      'a rampa de superfície deve declarar o degrau level0',
    );
    assert.match(
      THEME_SRC,
      /background: \{ default: surface\.level0/,
      'level0 é o MESMO degrau do fundo default do app',
    );
  });

  it('o LessonSourceViewer é FILHO do overlay (nada mais é portado para o tabpanel)', () => {
    const slice = portalSlice();
    const overlay = slice.indexOf('bgcolor: theme.vars.palette.surface.level0');
    const viewer = slice.indexOf('<LessonSourceViewer');
    assert.ok(overlay !== -1 && viewer !== -1 && viewer > overlay, 'viewer deve vir DEPOIS do Box do overlay');
    assert.ok(!slice.slice(viewer).includes('<Box'), 'nenhum Box irmão pode nascer dentro do portal');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * G3 — App.tsx: id e position:relative no MESMO tabpanel; alvo === id emitido
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('G3. O tabpanel do App carrega o id JUNTO do relative', () => {
  it('id={navPanelId(active)} e position:relative moram no MESMO main role="tabpanel"', () => {
    const at = APP.indexOf('role="tabpanel"');
    assert.notEqual(at, -1, 'o App.tsx deve ter o main role="tabpanel"');
    const view = APP.indexOf('<View onNavigate', at);
    assert.notEqual(view, -1, 'o Box do tabpanel fecha no <View>');
    const box = APP.slice(at, view);
    assert.match(box, /id=\{navPanelId\(active\)\}/, 'o id do painel não pode migrar para outro nó');
    assert.match(box, /position: 'relative'/, 'o relative é a âncora do overlay do visualizador');
  });

  it("navPanelId('lesson') === 'sm-panel-lesson' — o id emitido pelo App É o alvo que a view procura", () => {
    assert.equal(navPanelId('lesson'), 'sm-panel-lesson');
    // A view NÃO grava o id: deriva pela MESMA função — trocar o formato num
    // lugar só nunca desarmoniza os dois lados do portal.
    assert.ok(!codeOf(VIEW_SRC).includes('sm-panel-lesson'), 'a view deve usar navPanelId, não o literal');
    assert.match(
      VIEW,
      /document\.getElementById\(navPanelId\('lesson'\)\)/,
      'o getElementById da view deve passar pela MESMA função do id do App',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * G4 — as 3 chaves sourcesViewer*: vivas, resolvíveis e distintas
 * ═══════════════════════════════════════════════════════════════════════════ */

const VIEWER_KEYS = [
  'lesson.sourcesViewerClose',
  'lesson.sourcesViewerOpenExternal',
  'lesson.sourcesViewerFrameHint',
] as const;

describe('G4. i18n — nenhuma chave morta no par de locales', () => {
  it('cada chave resolve não-vazia e não-crua nos DOIS locales', async () => {
    for (const lng of ['pt-BR', 'en'] as const) {
      const i18n = await createAppI18n(lng);
      for (const key of VIEWER_KEYS) {
        const text = i18n.t(key);
        assert.equal(typeof text, 'string', `${lng}: ${key} deve resolver string`);
        assert.ok(text.length > 0, `${lng}: ${key} não deve traduzir vazio`);
        assert.notEqual(text, key, `${lng}: ${key} não deve voltar como chave crua`);
      }
    }
  });

  it('o conjunto sourcesViewer* dos locales é EXATAMENTE o que a view usa (chave morta pega aqui)', () => {
    const used = new Set(codeOf(VIEW_SRC).match(/lesson\.sourcesViewer[A-Za-z]+/g) ?? []);
    assert.deepEqual(
      [...used].sort(),
      [...VIEWER_KEYS].sort(),
      'a view deve referenciar exatamente as 3 chaves do visualizador',
    );
    for (const [name, locale] of [['pt-BR', ptBR], ['en', en]] as const) {
      const inLocale = flattenKeys(locale as Record<string, unknown>)
        .filter((k) => k.startsWith('lesson.sourcesViewer'))
        .sort();
      assert.deepEqual(
        inLocale,
        [...VIEWER_KEYS].sort(),
        `${name}: nenhuma chave sobrando (morta) nem faltando nos resources`,
      );
    }
  });

  it('pt-BR e en têm traduções DISTINTAS para as 3 chaves (tradução real, não cópia)', async () => {
    const pt = await createAppI18n('pt-BR');
    const enI18n = await createAppI18n('en');
    for (const key of VIEWER_KEYS) {
      assert.notEqual(pt.t(key), enI18n.t(key), `${key}: os locales devem divergir`);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * G5 — arestas do viewer e do diálogo
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('G5. Arestas — fonte sem description, título longo, foco no Fechar, lista vazia', () => {
  it('fonte SEM description (campo opcional) renderiza o embed inteiro', () => {
    const html = render({ source: { title: 'Mínima', url: 'https://example.org/min' } });
    assert.match(iframeTag(html), /src="https:\/\/example\.org\/min"/);
    assert.ok(html.includes('Fechar'), 'o Fechar deve continuar em cena');
    assert.ok(html.includes('Abrir no navegador'), 'o link de reserva deve continuar em cena');
  });

  it('título longo renderiza por INTEIRO e o truncamento é o noWrap do CSS (SC 1.4.10)', () => {
    const longTitle = 'Guia definitivo de closures, protótipos e event loop — '.repeat(4);
    assert.ok(
      render({ source: { title: longTitle, url: 'https://example.org/long' } }).includes(longTitle),
      'o SSR emite o texto todo: o corte é VISUAL (CSS), nunca conteúdo perdido',
    );
    // A âncora do corte: a Typography que renderiza source.title é noWrap —
    // truncar com ellipsis em vez de empurrar o Fechar para fora da linha.
    assert.match(
      VIEW,
      /variant="subtitle1" noWrap sx=\{\{ flex: '1 1 auto', minWidth: 120, fontWeight: 600 \}\} > \{source\.title\}/,
      'o título do viewer deve ser a Typography noWrap da linha do cabeçalho',
    );
  });

  it('o foco nasce no "Fechar" ao montar — pré-requisito do Esc do fechar único', () => {
    assert.match(
      VIEW,
      /const closeButtonRef = useRef<HTMLButtonElement \| null>\(null\);/,
      'o viewer precisa da ref do botão',
    );
    assert.match(
      // O foco TEM de ser o corpo do efeito de mount com deps vazias — num
      // efeito com deps ele rodaria de novo (roubando o foco de volta) e o
      // `[]` é o que garante "uma vez, ao montar".
      VIEW,
      /useEffect\(\(\) => \{ closeButtonRef\.current\?\.focus\(\); \}, \[\]\);/,
      'o foco no Fechar tem de ser o ÚNICO corpo de um efeito de mount (deps vazias)',
    );
    assert.match(
      VIEW,
      /<Button ref=\{closeButtonRef\} onClick=\{onClose\}/,
      'a ref tem de estar no MESMO botão do fechar único',
    );
  });

  it('o diálogo de Fontes anuncia o estado vazio (sourcesEmpty) quando a aula não tem fontes', () => {
    assert.match(VIEW, /lesson\.sources\.length === 0 \? \(/, 'a guarda do estado vazio deve existir');
    assert.ok(
      VIEW.includes("t('translation:lesson.sourcesEmpty')"),
      'o estado vazio deve renderizar a chave lesson.sourcesEmpty',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * G6 — o normalizador de exibição (ONDA5-FONTES, finding-3) e o portão que
 * impede o padrão de voltar em conteúdo NOVO. Contrato de
 * src/lib/sourceTitle.ts: partir no primeiro separador, recheio FORA,
 * parêntese de rascunho sobe para o Nome, travessão nunca aparece na saída,
 * idempotente.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('G6. sourceTitle — Nome/qualificador sem travessão, recheio fora', () => {
  it('recheio sai DE TODO; o parêntese do rascunho sobe para o Nome', () => {
    assert.deepEqual(normalizeSourceTitle('Function definition — a referência oficial da linguagem'), {
      name: 'Function definition',
      qualifier: null,
    });
    assert.deepEqual(normalizeSourceTitle('ISO/IEC 9899 — o rascunho público do padrão (N3220)'), {
      name: 'ISO/IEC 9899 (N3220)',
      qualifier: null,
    });
  });

  it('qualificador NÃO-recheio preservado como tagline; título sem separador sai como está', () => {
    assert.deepEqual(normalizeSourceTitle('X — The Rust Programming Language'), {
      name: 'X',
      qualifier: 'The Rust Programming Language',
    });
    assert.deepEqual(normalizeSourceTitle('Título limpo'), { name: 'Título limpo', qualifier: null });
  });

  it('a saída NUNCA contém travessão (—): só separamos, nunca truncamos (SC 1.4.12)', () => {
    const cases = [
      'Function definition — a referência oficial da linguagem',
      'ISO/IEC 9899 — o rascunho público do padrão (N3220)',
      'A — B — C',
      'Separador —solto no meio',
      'Título limpo',
    ];
    for (const raw of cases) {
      const { name, qualifier } = normalizeSourceTitle(raw);
      assert.ok(!name.includes('—'), `name de "${raw}" não pode conter travessão`);
      assert.ok(!(qualifier ?? '').includes('—'), `qualifier de "${raw}" não pode conter travessão`);
    }
  });

  it('idempotente: normalizar o PRÓPRIO nome é fixpoint', () => {
    for (const raw of ['Function definition — a referência oficial da linguagem', 'A — B — C', 'X — The Rust Programming Language']) {
      const { name } = normalizeSourceTitle(raw);
      assert.deepEqual(normalizeSourceTitle(name), { name, qualifier: null });
    }
  });

  it('sourceHost: domínio sem www. (destino visível antes do clique); URL quebrada devolve ""', () => {
    assert.equal(
      sourceHost('https://en.cppreference.com/w/c/language/function_definition'),
      'en.cppreference.com',
    );
    assert.equal(sourceHost('https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3220.pdf'), 'open-std.org');
    assert.equal(sourceHost('não é URL'), '');
  });

  it('dedupeQualifier: qualificador que repete a abertura da descrição cede à descrição', () => {
    assert.equal(
      dedupeQualifier(
        'A página oficial da linguagem C',
        'A página oficial da definição de função em C: assinatura, corpo e a chamada pelo nome.',
      ),
      null,
    );
    assert.equal(
      dedupeQualifier('The Rust Programming Language', 'O livro de referência da linguagem.'),
      'The Rust Programming Language',
    );
    assert.equal(dedupeQualifier(null, 'qualquer descrição'), null);
  });

  it('o PORTÃO reprova título novo com o padrão, com dica de reparo (anti-regressão)', () => {
    const URL_A = 'https://en.cppreference.com/w/c/language/function_definition';
    const colheita: ColheitaParaGate = {
      fontes: [
        {
          link: { title: 'Function definition — a referência oficial da linguagem', url: URL_A, description: 'd' },
          citacao: 1,
          queries: ['q1'],
          publicadaEm: null,
        },
      ],
      afirmacoes: [{ id: 'a1', texto: 'x', fontes: [URL_A] }],
    };
    const r = portaoDeQualidade(colheita);
    assert.equal(r.aprovado, false);
    const rep = r.reprovacoes.find((x) => x.motivo === REPROVACOES.FONTE_TITULO_PADRAO_IA);
    assert.ok(rep, 'o padrão de IA no título tem de reprovar com o motivo próprio');
    assert.match(rep.mensagem, /nome real da fonte/, 'a mensagem carrega a dica de reparo');
  });

  it('o PORTÃO continua a aprovar título limpo (a regra só pega o padrão)', () => {
    const URL_A = 'https://en.cppreference.com/w/c/language/function_definition';
    const r = portaoDeQualidade({
      fontes: [
        {
          link: { title: 'Function definition', url: URL_A, description: 'd' },
          citacao: 1,
          queries: ['q1'],
          publicadaEm: null,
        },
      ],
      afirmacoes: [{ id: 'a1', texto: 'x', fontes: [URL_A] }],
    });
    assert.equal(r.aprovado, true);
  });

  it('en-raya + nome do site é título REAL do surf — o portão NÃO o reprova (medido)', () => {
    // Forma medida na execução real de 2026-09-05 (engineResearchCamadas:93):
    // a en-raya seguida do nome do site é sufixo legítimo, não tell de LLM.
    // Rejeitá-la reprovaria colheita honesta — o tell é o TRAVESSÃO + recheio.
    const URL_B = 'https://realpython.com/python-print-function/';
    const r = portaoDeQualidade({
      fontes: [
        {
          link: {
            title: 'Your Guide to the Python print() Function – Real Python',
            url: URL_B,
            description: 'd',
          },
          citacao: 1,
          queries: ['q1'],
          publicadaEm: null,
        },
      ],
      afirmacoes: [{ id: 'a1', texto: 'x', fontes: [URL_B] }],
    });
    assert.equal(r.aprovado, true);
  });
});
