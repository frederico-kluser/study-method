/**
 * tests/panelCacheSwr.test.ts — cache stale-while-revalidate (SWR) POR SESSÃO
 * dos painéis de Settings (onda1-settings-perf).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O CONTRATO (da onda, não do diff)
 * ══════════════════════════════════════════════════════════════════════════
 * O menu Settings era lento de abrir: sem cache, TODA visita remonta os 4
 * painéis e refaz as cadeias de IPC do zero (tela "pisca" vazio→carregado).
 * A correção com MENOR mudança e ZERO mudança de comportamento de dados:
 *
 *   1. Painéis NASCEM com o último valor conhecido (cache SWR por sessão em
 *      panelCache.ts) e revalidam EM BACKGROUND — o IPC de leitura continua
 *      disparando em TODA montagem (revalidação INCONDICIONAL: nunca passa a
 *      pular leitura porque o cache existe);
 *   2. Escritas (setKey, validate, ativar modelo, excluir, purgar, trocar
 *      provedor de feedback) atualizam o cache JUNTO com o estado — o cache
 *      nunca serve valor mais novo que o estado não tenha;
 *   3. Falha de IPC reverte estado E cache (fix do revisor:
 *      LocalAiPanel.handleFeedbackProviderChange reverte o cache no catch);
 *   4. Nenhum dado deixou de ser lido: os 4 IPCs de leitura continuam no
 *      mount de cada painel — e o ProgressPanel segue INTACTO (sem IPC no
 *      mount, sem cache).
 *
 * Perguntas falsificáveis mapeadas para os blocos:
 *   (a) revalidação incondicional em toda montagem?  → BLOCO B (guardas) + BLOCO C
 *   (b) escritas atualizam o cache?                  → BLOCO B (guardas) + BLOCO A
 *   (c) falha reverte estado E cache?                → BLOCO B (guarda do fix)
 *   (d) nenhum dado deixou de ser lido?              → BLOCO B (guardas de mount)
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TÉCNICA (a da casa, sem jsdom)
 * ══════════════════════════════════════════════════════════════════════════
 *   BLOCO A — unidade do panelCache (funções puras sobre o Map de módulo);
 *   BLOCO B — guardas de fonte (regex nos .tsx — precedentes
 *             tests/globalBusyIndicator.test.ts, tests/shellSidebar.test.ts);
 *   BLOCO C — os componentes REAIS renderizados com `react-dom/server`
 *             (renderToStaticMarkup + ThemeProvider + i18n pt-BR REAL —
 *             precedentes tests/globalBusyIndicator.test.ts,
 *             tests/quizOverlayRender.test.ts). O SSR RODA os initializers
 *             de useState (o nascimento do painel lendo o cache) e NÃO roda
 *             efeitos — o que também PROVA que o IPC do mount mora nos
 *             efeitos: os painéis renderizam SEM NENHUMA API injetada.
 *
 * Isolamento: panelCache não tem __reset (o cache vive por sessão do
 * renderer, por desenho). Cada arquivo de teste roda em processo próprio
 * (node --test), e DENTRO deste arquivo: (1) o BLOCO A usa chaves próprias
 * ("swr-unit.*"), sem colidir com as chaves de produção; (2) o BLOCO C é
 * sensível à ordem — cada `it` semeia o que lê, e os testes de "1ª visita"
 * vêm ANTES dos que semeiam a MESMA chave (ordem de registro do node:test).
 *
 * Reprodução: `bash tools/t.sh tests/panelCacheSwr.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';

const HERE = dirname(fileURLToPath(import.meta.url));
const PANELS_DIR = resolve(HERE, '../src/views/SettingsView');
const KEYSPANEL_PATH = resolve(PANELS_DIR, 'KeysPanel.tsx');
const LOCALAIPANEL_PATH = resolve(PANELS_DIR, 'LocalAiPanel.tsx');
const ORPHANPANEL_PATH = resolve(PANELS_DIR, 'OrphanTracksPanel.tsx');
const PROGRESSPANEL_PATH = resolve(PANELS_DIR, 'ProgressPanel.tsx');
const PANELCACHE_PATH = resolve(PANELS_DIR, 'panelCache.ts');
const SETTINGSVIEW_PATH = resolve(PANELS_DIR, 'SettingsView.tsx');

// ATENÇÃO ao padrão da casa: componentes .tsx são importados DINAMICAMENTE
// por URL (o tsconfig de tests/ não liga `jsx` — ver shellSidebar.test.ts).
const KEYSPANEL_MODULE = new URL('../src/views/SettingsView/KeysPanel.tsx', import.meta.url).href;
const LOCALAIPANEL_MODULE = new URL('../src/views/SettingsView/LocalAiPanel.tsx', import.meta.url).href;
const ORPHANPANEL_MODULE = new URL('../src/views/SettingsView/OrphanTracksPanel.tsx', import.meta.url).href;
const PANELCACHE_MODULE = new URL('../src/views/SettingsView/panelCache.ts', import.meta.url).href;

/** Tipos espelhados localmente (o painel está fora do include do tsconfig.node).
 *  Interface de panelCache: 2 funções genéricas sobre o Map de módulo. */
type PanelCache = {
  readCached<T>(key: string): T | undefined;
  writeCached<T>(key: string, value: T): void;
};
let readCached: PanelCache['readCached'];
let writeCached: PanelCache['writeCached'];

/** Fonte sem comentários — só o código que realmente roda (padrão da casa). */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Fatiar o código entre dois marcadores (o fim NÃO incluído). */
function sliceBetween(code: string, startMarker: string, endMarker: string): string {
  const start = code.indexOf(startMarker);
  assert.ok(start >= 0, `marcador inicial não encontrado: ${startMarker}`);
  const end = code.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `marcador final não encontrado após o início: ${endMarker}`);
  return code.slice(start, end);
}

let KeysPanel: ComponentType<Record<string, never>>;
let LocalAiPanel: ComponentType<Record<string, never>>;
let OrphanTracksPanel: ComponentType<Record<string, never>>;

function renderPanel(panel: ComponentType<Record<string, never>>): string {
  return renderToStaticMarkup(
    createElement(ThemeProvider, { theme }, createElement(panel, {}) as ReactNode),
  );
}

/* ═════════════════════ BLOCO A — panelCache (unidade) ═══════════════════ */

describe('A. panelCache — Map por sessão, funções puras read/write', () => {
  it('readCached de chave desconhecida → undefined (nunca carregado)', () => {
    assert.equal(readCached('swr-unit.nunca-carregada'), undefined);
  });

  it('writeCached → readCached round-trip devolve o MESMO valor (mesma referência)', () => {
    const value = { llmConfigured: true, braveConfigured: false };
    writeCached('swr-unit.status', value);
    assert.equal(readCached('swr-unit.status'), value, 'referência idêntica — sem clone');
  });

  it('sobrescrita: o ÚLTIMO valor gravado vence (a revalidação sobrescreve o stale)', () => {
    writeCached('swr-unit.sobrescrita', { v: 1 });
    writeCached('swr-unit.sobrescrita', { v: 2 });
    assert.deepEqual(readCached('swr-unit.sobrescrita'), { v: 2 });
  });

  it('chaves distintas NÃO colidem — inclusive as 4 chaves de produção', () => {
    writeCached('swr-unit.keys', 'A');
    writeCached('swr-unit.models', 'B');
    writeCached('swr-unit.provider', 'C');
    writeCached('swr-unit.orphans', 'D');
    assert.equal(readCached('swr-unit.keys'), 'A');
    assert.equal(readCached('swr-unit.models'), 'B');
    assert.equal(readCached('swr-unit.provider'), 'C');
    assert.equal(readCached('swr-unit.orphans'), 'D');
  });

  it('array VAZIO é um valor CONHECIDO — não é confundido com "nunca carregado"', () => {
    // OrphanTracksPanel guarda TrackOrphanEntry[]: "carregado e vazio" é o
    // estado BOM e comum; `[]` tem que sobreviver ao round-trip (o `?? null`
    // do painel nunca transforma [] em null).
    writeCached('swr-unit.lista-vazia', []);
    const got = readCached<unknown[]>('swr-unit.lista-vazia');
    assert.ok(Array.isArray(got), 'devolve array, não undefined');
    assert.equal(got.length, 0);
  });
});

/* ═══════ BLOCO B — guardas de fonte (o contrato está no .tsx) ═══════════ */

describe('B. guardas de fonte — KeysPanel (SWR de keys.status)', () => {
  const code = codeOf(readFileSync(KEYSPANEL_PATH, 'utf8'));

  it('nasce com o último status conhecido (useState initializer lê o cache)', () => {
    assert.match(
      code,
      /useState<KeysStatus \| null>\(\s*\(\) => readCached<KeysStatus>\('keys\.status'\) \?\? null,?\s*\)/,
      'o primeiro paint vem do cache; sem cache (1ª abertura) começa null',
    );
  });

  it('(a) revalida INCONDICIONALMENTE no mount: keys.getStatus() em TODA montagem', () => {
    const effect = sliceBetween(code, 'useEffect(() => {', 'const patch');
    assert.match(effect, /keys\.getStatus\(\)/, 'o IPC de leitura continua no mount');
    assert.ok(
      !effect.includes('readCached'),
      'o IPC NÃO pode estar condicionado à presença de cache (SWR: revalida sempre)',
    );
    assert.match(effect, /cancelled/, 'guia de desmontagem preservada (race do IPC)');
  });

  it('(a)(d) o sucesso da revalidação atualiza estado E cache juntos', () => {
    const effect = sliceBetween(code, 'useEffect(() => {', 'const patch');
    assert.match(effect, /setInitialStatus\(status\)/, 'estado primeiro');
    assert.match(
      effect,
      /writeCached\('keys\.status',\s*status\)/,
      'o cache recebe o MESMO valor que o estado (nunca mais novo)',
    );
  });

  it('(b) SALVAR atualiza o cache junto com o estado (llm/brave configured)', () => {
    const save = sliceBetween(code, 'const handleSave', 'const handleValidate');
    assert.match(save, /keys\.setKey\(/, 'a escrita persiste pelo MESMO canal de antes');
    assert.match(save, /withTimeout\(/, 'guard de timeout preservado');
    assert.match(
      save,
      /writeCached\('keys\.status',\s*\{\s*\.\.\.prev,/,
      'o cache parte do valor anterior (spread) — atualização incremental',
    );
    assert.match(
      save,
      /provider === 'openrouter' \? 'llmConfigured' : 'braveConfigured'\]: true/,
      'a flag do provedor salvo vira true no cache',
    );
  });

  it('(b) VALIDAR atualiza o cache com o veredito (llm/brave validated)', () => {
    const validate = sliceBetween(code, 'const handleValidate', 'const renderProvider');
    assert.match(validate, /validateLlm|validateBrave/);
    assert.match(
      validate,
      /provider === 'openrouter' \? 'llmValidated' : 'braveValidated'\]:\s*result\.isValid === true/,
      'o cache recebe o VEREDITO real, não o otimismo',
    );
  });

  it('(c) FALHA de salvar NÃO toca o cache (estado e cache seguem coerentes no valor anterior)', () => {
    const save = sliceBetween(code, 'const handleSave', 'const handleValidate');
    const catchPart = save.slice(save.indexOf('catch (err)'));
    assert.ok(catchPart.length > 0, 'handleSave tem catch');
    assert.ok(
      !catchPart.includes('writeCached'),
      'o catch não escreve no cache — a falha não pode "prometer" valor que não chegou ao disco',
    );
    assert.match(catchPart, /saveError|saveTimeout/, 'o catch cuida do ESTADO (mensagem de erro)');
  });
});

describe('B. guardas de fonte — LocalAiPanel (SWR de models + feedbackProvider)', () => {
  const code = codeOf(readFileSync(LOCALAIPANEL_PATH, 'utf8'));

  it('nasce com a última lista e o último provedor conhecidos (initializers)', () => {
    assert.match(
      code,
      /useState<LocalModelInfo\[\]>\(\s*\(\) => readCached<LocalModelInfo\[\]>\('localAi\.models'\) \?\? \[\],?\s*\)/,
    );
    assert.match(
      code,
      /useState\(\s*\(\) => readCached\('localAi\.models'\) === undefined,?\s*\)/,
      'o spinner de 1ª abertura só roda quando NÃO há cache',
    );
    assert.match(
      code,
      /readCached<FeedbackProvider>\('settings\.feedbackProvider'\) \?\? 'openrouter'/,
      'o Select do provedor de feedback também nasce do cache',
    );
  });

  it('(a)(d) settings.get() revalida em TODA montagem e grava o cache', () => {
    const effect = sliceBetween(code, 'useEffect(() => {', 'const handleFeedbackProviderChange');
    assert.match(effect, /settings\.get\(\)/);
    assert.match(
      effect,
      /writeCached\('settings\.feedbackProvider', settings\.defaultModelProvider\)/,
    );
  });

  it('(a)(d) localAi.list() revalida em TODA montagem e grava o cache', () => {
    const effect = sliceBetween(code, 'setLoadingModels(true)', 'const handleDetect');
    assert.match(effect, /localAi\.list\(\)/);
    assert.match(effect, /setModels\(list\)/, 'estado primeiro');
    assert.match(effect, /writeCached\('localAi\.models', list\)/, 'cache junto');
  });

  it('(b) TODO setState de models sincroniza o cache (um único efeito estado→cache)', () => {
    // setActive/download/delete/editam models por setModels — o efeito
    // `[models]` é o sincronizador único: o cache nunca fica MAIS NOVO que o
    // estado, porque a única fonte de escrita é o próprio estado.
    assert.match(
      code,
      /useEffect\(\(\) => \{\s*writeCached\('localAi\.models', models\);\s*\}, \[models\]\)/,
      'o efeito de sincronização estado→cache tem que existir',
    );
    // Sem escrita de 'localAi.models' FORA dos dois lugares sancionados
    // (o mount revalidando list + o sincronizador [models]).
    const writes = code.match(/writeCached\('localAi\.models'/g) ?? [];
    assert.equal(writes.length, 2, 'exatamente 2 pontos de escrita: mount + sincronizador');
  });

  it('(c) FIX DO REVISOR: falha de settings.set reverte estado E cache no catch', () => {
    const fn = sliceBetween(code, 'const handleFeedbackProviderChange', 'useEffect(() => {');
    // Otimista: estado e cache mudam JUNTOS para o próximo valor…
    assert.match(fn, /setFeedbackProvider\(next\)/);
    assert.match(fn, /writeCached\('settings\.feedbackProvider', next\)/);
    // …e a falha REVERTE OS DOIS ao valor anterior (o valor novo nunca chegou
    // ao disco — a próxima visita não pode pintá-lo).
    const catchPart = fn.slice(fn.indexOf('catch (err)'));
    assert.ok(catchPart.length > 0, 'handleFeedbackProviderChange tem catch');
    assert.match(catchPart, /setFeedbackProvider\(prev\)/, 'reverte o ESTADO');
    assert.match(
      catchPart,
      /writeCached\('settings\.feedbackProvider', prev\)/,
      'reverte o CACHE (senão a próxima visita pinta o valor que falhou)',
    );
  });
});

describe('B. guardas de fonte — OrphanTracksPanel (SWR de track.orphans)', () => {
  const code = codeOf(readFileSync(ORPHANPANEL_PATH, 'utf8'));

  it('nasce com a última reconciliação conhecida (null = ainda verificando)', () => {
    assert.match(
      code,
      /readCached<TrackOrphanEntry\[\]>\('track\.orphans'\) \?\? null/,
      'sem cache → null (verificando); com cache → a lista conhecida',
    );
  });

  it('(a) revalida em TODA montagem: o mount chama load() e load() chama track.orphans()', () => {
    assert.match(code, /useEffect\(\(\) => load\(\), \[load\]\)/, 'mount → load, incondicional');
    const load = sliceBetween(code, 'const load = useCallback', 'useEffect(() => load()');
    assert.match(load, /getApi\(\)\s*\.track\.orphans\(\)/, 'a leitura REAL continua');
    assert.match(load, /withTimeout\(/, 'guard de timeout preservado');
  });

  it('(a)(d) o sucesso da revalidação atualiza estado E cache juntos', () => {
    const load = sliceBetween(code, 'const load = useCallback', 'useEffect(() => load()');
    assert.match(load, /setOrphans\(res\.orphans\)/, 'estado primeiro');
    assert.match(load, /writeCached\('track\.orphans', res\.orphans\)/, 'cache junto');
    const catchPart = load.slice(load.indexOf('.catch((err: unknown)'));
    assert.ok(catchPart.length > 0, 'load tem catch');
    assert.ok(!catchPart.includes('writeCached'), 'falha de load não grava cache velho/falso');
    assert.match(catchPart, /setLoadError/, 'falha vira erro visível (retry)');
  });

  it('(b)(c) PURGAR zera o estado e REVALIDA (o cache acompanha pela revalidação)', () => {
    const remove = sliceBetween(code, 'const handleRemove', 'const list = orphans');
    assert.match(remove, /track\.purgeOrphans|purgeOrphans\(/, 'a purga persiste pelo mesmo canal');
    assert.match(remove, /setOrphans\(\[\]\)/, 'estado zerado no sucesso');
    assert.match(remove, /load\(\)/, 'e a lista é revalidada do banco+disco de verdade');
  });
});

describe('B. guardas de fonte — ProgressPanel INTACTO (sem cache, sem IPC no mount)', () => {
  const code = codeOf(readFileSync(PROGRESSPANEL_PATH, 'utf8'));

  it('não importa nem usa panelCache (read/write cached nunca aparecem)', () => {
    assert.ok(!code.includes('panelCache'), 'ProgressPanel não tem cache');
    assert.ok(!code.includes('readCached'), 'sem leitura de cache');
    assert.ok(!code.includes('writeCached'), 'sem escrita de cache');
  });

  it('(d) sem useEffect — nada de IPC no mount (o critério "intocado")', () => {
    assert.ok(!code.includes('useEffect'), 'nenhum efeito de montagem');
  });

  it('o ÚNICO getApi() do arquivo é o clearProgress dentro do handleClear', () => {
    const occurrences = code.match(/getApi\(\)/g) ?? [];
    assert.equal(occurrences.length, 1, 'exatamente uma chamada de API no arquivo');
    const clearIdx = code.indexOf('const handleClear');
    const apiIdx = code.indexOf('getApi()');
    assert.ok(apiIdx > clearIdx, 'a chamada vive dentro do handler de limpar, não no mount');
    assert.match(code, /study\.clearProgress\(\)/);
    assert.match(code, /withTimeout\(/);
  });

  it('as 4 chaves do cache pertencem ao painel certo (nada vaza entre painéis)', () => {
    const keysPanel = codeOf(readFileSync(KEYSPANEL_PATH, 'utf8'));
    const localAiPanel = codeOf(readFileSync(LOCALAIPANEL_PATH, 'utf8'));
    const orphanPanel = codeOf(readFileSync(ORPHANPANEL_PATH, 'utf8'));
    const progressPanel = codeOf(readFileSync(PROGRESSPANEL_PATH, 'utf8'));
    // keys.status → só KeysPanel
    assert.ok(keysPanel.includes("'keys.status'"));
    assert.ok(!localAiPanel.includes("'keys.status'") && !orphanPanel.includes("'keys.status'"));
    // localAi.models + settings.feedbackProvider → só LocalAiPanel
    assert.ok(localAiPanel.includes("'localAi.models'") && localAiPanel.includes("'settings.feedbackProvider'"));
    assert.ok(!keysPanel.includes("'localAi.models'") && !keysPanel.includes("'settings.feedbackProvider'"));
    assert.ok(!orphanPanel.includes("'localAi.models'") && !orphanPanel.includes("'settings.feedbackProvider'"));
    // track.orphans → só OrphanTracksPanel
    assert.ok(orphanPanel.includes("'track.orphans'"));
    assert.ok(!keysPanel.includes("'track.orphans'") && !localAiPanel.includes("'track.orphans'"));
    // ProgressPanel: nenhuma chave
    assert.ok(!progressPanel.includes('keys.status') && !progressPanel.includes('localAi.models'));
    assert.ok(!progressPanel.includes('settings.feedbackProvider') && !progressPanel.includes('track.orphans'));
  });

  it('(d) a SettingsView ainda monta os 4 painéis (nenhum dado deixou de ser lido)', () => {
    const view = codeOf(readFileSync(SETTINGSVIEW_PATH, 'utf8'));
    for (const panel of ['KeysPanel', 'LocalAiPanel', 'OrphanTracksPanel', 'ProgressPanel']) {
      assert.ok(view.includes(panel), `${panel} continua montado`);
    }
  });

  it('panelCache é um módulo PURO (sem IPC, sem storage — o cache morre com o renderer)', () => {
    const cache = codeOf(readFileSync(PANELCACHE_PATH, 'utf8'));
    assert.match(cache, /new Map<.*>\(\)/);
    assert.ok(!cache.includes('localStorage'), 'nada vai a disco (por sessão)');
    assert.ok(!cache.includes('getApi'), 'o cache não fala com o main');
    assert.ok(!cache.includes('ipcRenderer'), 'não é canal IPC');
  });
});

/* ═══ BLOCO C — o painel REAL, SSR: nasce com o último valor conhecido ═══ */

describe('C. SSR do painel real — nasce com o último valor conhecido (SWR)', () => {
  // ORDEM: os testes de "1ª visita" precisam do cache VAZIO na chave — eles
  // rodam ANTES de qualquer semeia daquela chave (ordem de registro). Cada
  // teste semeia somente o que lê. renderToStaticMarkup NÃO roda efeitos:
  // renderizar sem injetar NENHUMA API (nada de __setApiForTests) é prova
  // adicional de que o IPC do mount mora nos useEffects, não no corpo.

  it('KeysPanel, 1ª visita (sem cache): chips "Não configurada" como antes', () => {
    const html = renderPanel(KeysPanel);
    assert.equal((html.match(/Não configurada/g) ?? []).length, 2, 'os dois provedores');
    assert.ok(!/Configurada/.test(html.replace(/Não configurada/g, '')), 'nenhum chip de configurada');
    assert.ok(!html.includes('Válida'), 'nenhuma validação conhecida');
  });

  it('KeysPanel com cache SEMANA: os chips nascem "Configurada"/"Válida" no PRIMEIRO paint', () => {
    writeCached('keys.status', {
      llmConfigured: true,
      braveConfigured: true,
      llmValidated: true,
      braveValidated: false,
    });
    const html = renderPanel(KeysPanel);
    assert.equal((html.match(/Configurada/g) ?? []).length, 2, 'os dois provedores nascem configurados');
assert.ok(html.includes('Válida'), 'a validação conhecida nasce junto');
// O cache parcial também é honrado: só o OpenRouter configurado…
    writeCached('keys.status', {
      llmConfigured: true,
      braveConfigured: false,
      llmValidated: false,
      braveValidated: false,
    });
    const partial = renderPanel(KeysPanel);
    assert.equal((partial.match(/Configurada/g) ?? []).length, 1, 'UM chip configurado (openrouter)');
  });

  it('LocalAiPanel, 1ª visita (sem cache): spinner "Carregando…" e provedor padrão openrouter', () => {
    const html = renderPanel(LocalAiPanel);
    assert.ok(html.includes('Carregando…'), 'a 1ª abertura mostra o carregamento (como antes)');
    assert.ok(html.includes('OpenRouter (nuvem)'), 'o default do Select quando nada é conhecido');
    assert.ok(!html.includes('Baixado'), 'nenhum modelo conhecido');
  });

  it('LocalAiPanel com cache: a lista E o provedor nascem no primeiro paint, SEM spinner', () => {
    writeCached('localAi.models', [
      {
        id: 'qwen2.5-3b-instruct',
        label: 'Qwen 2.5 (3B)',
        hfRepo: 'repo/exemplo',
        filename: 'qwen.gguf',
        quant: 'Q4_K_M',
        sizeBytes: 2_000_000_000,
        recommended: true,
        downloaded: true,
        active: false,
        agentReady: true,
      },
    ]);
    writeCached('settings.feedbackProvider', 'local');
    const html = renderPanel(LocalAiPanel);
    assert.ok(!html.includes('Carregando…'), 'nada de spinner: o valor conhecido pinta direto');
    assert.ok(html.includes('Qwen 2.5 (3B)'), 'o card do modelo conhecido');
    assert.ok(html.includes('Baixado'), 'o chip de baixado conhecido');
    assert.ok(html.includes('Modelo local'), 'o provedor de feedback conhecido no Select');
  });

  it('LocalAiPanel com cache VAZIO ([]): [] é valor CONHECIDO — sem spinner e sem cards', () => {
    writeCached('localAi.models', []);
    const html = renderPanel(LocalAiPanel);
    assert.ok(!html.includes('Carregando…'), 'a lista vazia é a última realidade conhecida');
    assert.ok(!html.includes('Qwen 2.5 (3B)'), 'nenhum card: a lista REAL é vazia');
  });

  it('OrphanTracksPanel, 1ª visita (sem cache): nem lista, nem alert vazio, nem erro (verificando)', () => {
    const html = renderPanel(OrphanTracksPanel);
    assert.ok(!html.includes('settings-orphans-empty'), 'sem alert de vazio: ainda verificando');
    assert.ok(!html.includes('trilha-fantasma'), 'sem lista: ainda verificando');
    assert.ok(!html.includes('settings.orphansLoadFailed'), 'sem erro: a verificação roda no efeito');
    assert.ok(!html.includes('Remover resquícios'), 'sem botão destrutivo sem lista conhecida');
  });

  it('OrphanTracksPanel com cache []: o alert de "nada órfão" nasce no primeiro paint', () => {
    writeCached('track.orphans', []);
    const html = renderPanel(OrphanTracksPanel);
    assert.ok(html.includes('settings-orphans-empty'), 'estado BOM conhecido, dito com todas as letras');
    assert.ok(html.includes('Nada órfão'), 'o texto real do alert em pt-BR');
  });

  it('OrphanTracksPanel com cache de lista: os resquícios conhecidos nascem visíveis', () => {
    writeCached('track.orphans', [
      {
        slug: 'trilha-fantasma',
        subjectName: '',
        rowCount: 3,
        attemptCount: 2,
        lessonsDoneCount: 1,
        generatedChallengeCount: 0,
        hasProficiency: false,
      },
    ]);
    const html = renderPanel(OrphanTracksPanel);
    assert.ok(html.includes('trilha-fantasma'), 'o resquício conhecido, nomeado');
    assert.ok(html.includes('Remover resquícios'), 'o botão de ação nasce com a lista');
    assert.ok(!html.includes('settings-orphans-empty'), 'lista ≠ vazio');
  });
});

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const keys = (await import(KEYSPANEL_MODULE)) as { KeysPanel: typeof KeysPanel };
  KeysPanel = keys.KeysPanel;
  const localAi = (await import(LOCALAIPANEL_MODULE)) as { LocalAiPanel: typeof LocalAiPanel };
  LocalAiPanel = localAi.LocalAiPanel;
  const orphans = (await import(ORPHANPANEL_MODULE)) as { OrphanTracksPanel: typeof OrphanTracksPanel };
  OrphanTracksPanel = orphans.OrphanTracksPanel;
  const panelCache = (await import(PANELCACHE_MODULE)) as PanelCache;
  readCached = panelCache.readCached;
  writeCached = panelCache.writeCached;
});
