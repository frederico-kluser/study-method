/**
 * electron/main/index.ts — bootstrap do processo main.
 *
 * Abre a janela única (tema escuro, 1280x800, min 900x600), registra os
 * handlers IPC (após whenReady), força instância única e lida com o ciclo de
 * vida padrão do Electron. Em dev carrega a URL do dev server
 * (process.env['ELECTRON_RENDERER_URL']); em prod carrega o bundle do
 * renderer (out/renderer/index.html).
 *
 * CHAVE DO LLM: toda leitura passa por `readLlmApiKey` — slot canônico
 * 'openrouter' com FALLBACK para o slot legado gravado por versões anteriores
 * (ver electron/main/ipc/keys-handlers.ts).
 *
 * Fiação da onda 3 (ui-wiring): no whenReady constrói os serviços REAIS
 * (settingsStore, PiAgentService, runner/lesson/orchestrator com autor+juiz de
 * LLM remoto, brave + research) e entrega registerPi/registerStudy/registerLocalAi
 * ao buildMainSetup, que então registra na ordem (ipc→keys→localAi→pi→study) com
 * safeHandle (placeholders → reais). Motor LLM local e shim local do Pi ficam
 * para ondas futuras (ver handoff).
 */
import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';

import { registerIpcHandlers } from './ipc';
import { registerKeysHandlers, readLlmApiKey } from './ipc/keys-handlers';
import { registerStartupHandlers } from './ipc/startup-handlers';
import { registerPiHandlers } from './ipc/pi-handlers';
import { registerStudyHandlers, type RunnerLike, type LessonServiceLike } from './ipc/study-handlers';
import { registerTrackHandlers } from './ipc/track-handlers';
import { resolveTracksDir } from './services/resourcesDir';
import { createLessonRepo, type LessonRepo } from './db/repo';
import { openMigratedSqlite } from './db/connection';
import { registerLocalAiHandlers } from './ipc/localAi-handlers';
import { registerSttModelHandlers } from './ipc/stt-model-handlers';
import { registerSttHandlers } from './ipc/stt-handlers';
import { registerLocalTtsHandlers } from './ipc/localTts-handlers';
import { buildMainSetup, emitToAll } from './main-setup';
import { registerE2EStubs } from './services/e2eStubs';
import { getSettingsStore } from './services/settingsStore';
import { createPiAgentService } from './services/PiAgentService';
import { createStudyMethodRunner } from './services/studyMethodRunner';
import { createLlmJudge } from './services/llmJudge';
import { createLessonAuthor } from './services/lessonAuthor';
import { createLessonOrchestrator } from './services/lessonOrchestrator';
import { createBraveSearchService } from './services/braveSearchService';
import { createLlmClient } from './services/llmClient';
import { createResearchPlanner, followUpsWithLlm, planWithLlm } from './services/researchPlanner';
import { createAnswerJudge } from './services/answerJudge';
import { embeddedLlm } from './services/embeddedLlm/EmbeddedLlmService';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

// JANELA SEM SOBREPOR (onda 13): por padrão (env ausente) a janela é visível e
// focável — comportamento normal. Com STUDY_METHOD_WINDOW_VISIBLE='0' a janela
// é criada OCULTA e NÃO-focável: o harness E2E roda o Electron sem abrir janela
// sobre o desktop do usuário e sem roubar foco (ver tests/e2e/helpers.ts). O
// valor é lido UMA vez (const) — o 'ready-to-show' só revela quando visível.
const windowVisible = process.env.STUDY_METHOD_WINDOW_VISIBLE !== '0';

// MODO E2E (harness Playwright): ativado por STUDY_METHOD_E2E=1. O main registra
// handlers STUB (services/e2eStubs) no lugar da fiação real de rede/LLM/voz —
// nada de LLM remoto/brave/Pi/GGUF/STT/TTS. As chaves ficam em memória (sem tocar
// o settingsStore real) e o userData é redirecionado a um tmp isolado para não
// vazar/prejudicar o perfil do usuário durante os testes.
const e2eMode = process.env.STUDY_METHOD_E2E === '1';

// Instância única — um segundo launch foca a janela já aberta.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(async () => {
    if (e2eMode) {
      // userData isolado e handlers stub — evita qualquer rede/inferência real.
      const { tmpdir } = await import('node:os');
      const { mkdtemp } = await import('node:fs/promises');
      const { join } = await import('node:path');
      app.setPath('userData', await mkdtemp(join(tmpdir(), 'study-method-e2e-user-')));
      registerE2EStubs();
      createWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
      return;
    }

    // Registro dos handlers IPC — fiação real da onda 3-ui-wiring.
    try {
      const settingsStore = await getSettingsStore();

      const judge = createLlmJudge({
        getApiKey: () => readLlmApiKey(settingsStore),
      });

      const runner = createStudyMethodRunner({
        skillDir: undefined, // resolve pelo default (env/app path)
        llmJudge: judge,
      }) as unknown as RunnerLike;

      const author = createLessonAuthor({
        getApiKey: () => readLlmApiKey(settingsStore),
      });

      const brave = createBraveSearchService({
        resolveApiKey: () => settingsStore.getApiKey('brave'),
      });

      // PERSISTÊNCIA (onda 3 — seleção de aulas): abre o SQLite do usuário de
      // forma TOLERANTE — se a abertura/migração falhar (ex.: disco corrompido),
      // o app ainda sobe: a repo fica `undefined` e os canais de persistência
      // respondem gracioso ([]/{lesson:null}/{ok:false,error}). Aberta ANTES do
      // orchestrator para o resolveSubjectId (onda2-research-live) poder usá-la.
      let repo: LessonRepo | undefined;
      try {
        const conn = await openMigratedSqlite(join(app.getPath('userData'), 'study.db'));
        repo = createLessonRepo(() => conn.db);
      } catch (err) {
        console.error('[main] falha ao abrir o banco de estudo (persistência desabilitada):', err);
        repo = undefined;
      }

      // PLANEJADOR/ANALISTA LLM da pesquisa (onda2-research-live): o mesmo
      // llmClient do juiz/autor, usado pelos helpers do researchPlanner
      // (JSON estrito, temperature baixa). Falhas degradam para a heurística.
      const plannerLlm = createLlmClient({
        apiKey: () => readLlmApiKey(settingsStore),
      });
      const research = createResearchPlanner({
        search: brave,
        resolveApiKey: () => settingsStore.getApiKey('brave'),
        generatePlan: async (subject) => planWithLlm(plannerLlm, subject),
        generateFollowUps: async (ctx) => followUpsWithLlm(plannerLlm, ctx),
      });

      // ONDA4 (gap da onda 3): o avaliador da RESPOSTA DIGITADA (judge-answer)
      // fiado de verdade — LLM remoto primeiro (reusa o createLlmClient já
      // criado para o planner), fallback embeddedLlm (singleton existente). Sem
      // isto, study:judge-answer respondia ANSWER_JUDGE_UNAVAILABLE em produção.
      const answerJudge = createAnswerJudge({
        llm: plannerLlm,
        getApiKey: () => readLlmApiKey(settingsStore),
        embedded: embeddedLlm,
      });

      const lesson = createLessonOrchestrator({
        research,
        runner: runner as Parameters<typeof createLessonOrchestrator>[0]['runner'],
        author,
        judge,
        // subjectId de challengeInfos: via challenge_attempts (challenges→
        // lessons→subject_id) QUANDO persistido — recém-gerado ⇒ null ⇒ omitido.
        resolveSubjectId: async (challengeId) => {
          if (!repo) return null;
          try {
            const attempts = await repo.getAttemptsForChallenge(challengeId);
            const last = attempts[attempts.length - 1];
            return last?.subjectId ?? null;
          } catch {
            return null;
          }
        },
        // ONDA4 (desafio-persistencia): o repo da geração — persiste o subject
        // (upsert ANTES do exercício, para o seed por tentativa da math) e a
        // lição (createLesson com exercise/challenge), devolvendo ids reais.
        ...(repo ? { repo } : {}),
      }) as unknown as LessonServiceLike;

      const piService = createPiAgentService();
      const getPiService = async () => piService;

      /** Emite para a janela principal (a única hoje). */
      const emitWindow = (channel: string, ev: unknown): void => {
        const win = BrowserWindow.getAllWindows()[0];
        emitToAll(win?.webContents, channel, ev);
      };

      await buildMainSetup({
        registerIpc: registerIpcHandlers,
        registerKeys: registerKeysHandlers,
        registerLocalAi: () => registerLocalAiHandlers(),
        registerPi: () => registerPiHandlers({ getService: getPiService, emit: emitWindow }),
        registerStudy: () =>
          registerStudyHandlers({ runner, lesson, emit: emitWindow, repo, answerJudge }),
      });

      // GATE DE INÍCIO (onda 6): registra keys:startup-status (aditivo, fora do
      // buildMainSetup p/ não alterar a ordem dos 5 registradores testados).
      registerStartupHandlers();

      // VOZ LOCAL (onda 8): registra os handlers de STT e TTS (aditivos, fora
      // do buildMainSetup p/ não alterar a ordem dos 5 registradores testados).
      registerSttModelHandlers();
      registerSttHandlers();
      registerLocalTtsHandlers();

      // TRILHAS (rodada 8): o conteúdo das trilhas vive em resources/tracks
      // (criado pelo CLI de autoria tools/track-cli.ts) — o aluno consome, não
      // gera. Registro ADITIVO, fora do buildMainSetup (mesma convenção da voz).
      // ONDA 2A (fix rodada 10): o diretório resources/ agora resolve por
      // CADEIA DE CANDIDATOS (resourcesDir.ts) — antes, com entry por arquivo
      // (electron out/main/index.js), app.getAppPath()=out/main e o tracksDir
      // virava out/main/resources/tracks (INEXISTENTE) → ENOENT em tudo.
      registerTrackHandlers({
        getTracksDir: () =>
          resolveTracksDir({
            isPackaged: app.isPackaged,
            resourcesPath: process.resourcesPath,
            appPath: app.getAppPath(),
            cwd: process.cwd(),
          }),
        repo,
        llm: plannerLlm,
        // ONDA3 (generate-flow): o progresso do track:challenge-regenerate
        // chega ao renderer pelo canal push (o modal global escuta).
        emit: emitWindow,
      });
    } catch (err) {
      console.error('[main] falha ao registrar handlers IPC:', err);
    }

    createWindow();

    // macOS: reabre uma janela quando o ícone do dock é clicado e nenhuma existe.
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

/** Cria a janela principal da GUI Study Method. */
function createWindow(): void {
  const win = new BrowserWindow({
    title: 'Study Method — Tutor',
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    // show:false inicial (anti-flicker) + revela no ready-to-show, MAS só quando
    // windowVisible (env '0' ⇒ janela nasce oculta e não aparece no desktop).
    show: false,
    // Não-focável/oculta com STUDY_METHOD_WINDOW_VISIBLE='0' (harness E2E) —
    // evita roubar foco do usuário durante os testes. Default (env ausente) = focável.
    focusable: windowVisible,
    // Cor de bootstrap da janela antes do primeiro paint (janela nasce oculta e
    // só revela no ready-to-show). Onda 20B: segue o fundo DARK Dracula
    // (#282a36 — background.default do tema; ver src/theme.ts).
    backgroundColor: '#282a36',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: true — o preload é um bundle CJS enxuto que só `require('electron')`
      // (contextBridge/ipcRenderer; a lógica de api-schema.ts é embutida no bundle).
      // Isso é compatível com o sandbox de preload do Electron (a API polyfill de
      // preload expõe exatamente contextBridge+ipcRenderer+afins). webSecurity
      // permanece true (default) e o HTML carrega o CSP meta (app/index.html).
      sandbox: true,
    },
  });

  win.on('ready-to-show', () => {
    // Só revela quando a janela deve ser visível (env '0' ⇒ mantém oculta).
    if (windowVisible) win.show();
  });

  // Links externos (http/https) abrem no navegador do sistema, nunca na janela.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] as string);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}