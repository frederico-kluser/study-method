# Harness E2E (Playwright `_electron`)

Validates the critical GUI flows **sem tocar GPU de inferência nem rodar LLM de
verdade** — the app boots in **stub mode** (`STUDY_METHOD_E2E=1`):

- **Sem rede real** — `keys:*`, o gate, `study:*`, `pi:*`, `localAi:*` e a voz
  respondem com fixtures determinísticas (ver
  `electron/main/services/e2eStubs.ts`). Nunca se chama DeepSeek/Brave/Pi/GGUF/STT/TTS.
- **O mesmo renderer de produção** — só o processo main muda (registra stubs);
  o bundle `out/renderer` é exatamente o que o usuário vê.

## Como rodar

```bash
# 1. Build de release (o harness roda sobre o build, igual produção):
npm run build        # electron-vite build → out/main, out/renderer

# 2. Suite E2E:
npm run test:e2e
```

Equivalent: `npm run build && npm run test:e2e`.

> **Janela oculta por padrão nos testes (nada sobre o seu desktop).** A fixture
> `tests/e2e/helpers.ts` injeta `STUDY_METHOD_WINDOW_VISIBLE='0'`, então o app
> Electron abre **oculto e não-focável** durante a suíte — não sobrepõe a janela
> que você estiver usando nem rouba o foco. (O main respeita essa env na criação
> da janela — ver `electron/main/index.ts`; env ausente ⇒ comportamento normal.)

Sem display (CI sem X/GPU), rode via `xvfb-run`:

```bash
xvfb-run -a npm run test:e2e
```

**Duas formas, mesmas 10 specs:**
- **Desktop com display (dev):** `npm run test:e2e` — a env injetada pela fixture
  já mantém a janela oculta; nada aparece sobre o seu desktop.
- **CI/sem display:** `xvfb-run -a npm run test:e2e` — o X virtual serve de
  display; dispensa a env (a fixture continua ocultando a janela). Não usamos
  `--headless` (não é um modo confirmado para Electron/Playwright `_electron`).

> `playwright.config.ts` usa 1 worker (Electron não paraleliza), `timeout: 90s`,
> `retries: 0`, `reporter: list`. Cada spec lança o app **isolado** com envars
> próprias e o fecha no `afterEach`.

## Envars de controle do stub (lidas pelo main em modo E2E)

| Env | Off signature | Efeito |
| --- | --- | --- |
| `STUDY_METHOD_E2E=1` | obrigatório | Ativa o modo stub (sem ela o app roda normal). |
| `E2E_GATE` | `blocked` | `blocked` \| `invalid` \| `offline` \| `ready` — controla o `keys:startup-status`. |
| `E2E_KEYS=invalid` | — | Garante claves seeds inválidas (alerta `gate.invalidKeys`). |
| `E2E_NETWORK=offline` | — | Com chaves configuradas, força `phase: 'offline'` (banner). |
| `E2E_WORKSPACE_ROOT` | `os.tmpdir()/study-method-e2e` | Raiz dos workspaces que o stub materializa em disco (o editor persiste de verdade). |
| `E2E_ONBOARDING=1` | — | Deixa a oferta de 1ª execução do tutorial disparar (modal + overlay). Por padrão a fixture pré-marca a oferta como mostrada (não bloqueia a UI das outras specs); só a spec `e2e-onboarding` ativa isto. |

Essas envars de stub são **somadas** às de infra do harness (ver `helpers.ts`),
que a fixture injeta por padrão e que não devem ser desligadas em massa:
`STUDY_METHOD_E2E=1` (modo stub) e `STUDY_METHOD_WINDOW_VISIBLE=0` (janela oculta).

## Specs

- `e2e-gate.spec.ts` — SetupView bloqueada (sem chaves) e alerta de inválido.
- `e2e-settings.spec.ts` — preencher DeepSeek+Brave → destrava o app.
- `e2e-theme.spec.ts` — toggle na AppBar → classe `.light`/`.dark` no `<html>` + `localStorage['theme-mode']`; ciclo volta a `system`.
- `e2e-lesson.spec.ts` — assunto → aula (Stepper + fases + markdown + desafios).
- `e2e-onboarding.spec.ts` — modal de tutorial na 1ª execução pós-gate, overlay com spotlight no alvo, concluir/skip → não reaparece.
- `e2e-editor.spec.ts` — abrir/editar/salvar no editor (persistência em disco real).
- `e2e-test-answer.spec.ts` — "Testar resposta" com runner mockado (executando→score).
- `e2e-offline.spec.ts` — banner offline com chaves ok + rede fora.
- `e2e-dracula.spec.ts` — tema Dracula no editor CodeMirror (`.cm-editor` fundo `#282a36`) e no terminal.
- `e2e-i18n.spec.ts` — default pt-BR e troca de idioma (localStorage gravado).

> **10 specs, 11 testes** rodam em modo stub determinístico com a janela oculta.
> Estes arquivos são `*.spec.ts` (Playwright), **fora** do glob
> `tests/**/*.test.ts` usado por `bash tools/t.sh tests` — a suíte unitária
> (550+) não é afetada nem a EMPTY-GLOB GUARD se engana.