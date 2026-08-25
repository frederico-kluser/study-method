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

**Duas formas, mesmas 11 specs mock (`real-*` ficam skipped sem chaves reais):**
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
- `e2e-code-theme.spec.ts` — editor CodeMirror e terminal xterm SEGUEM o tema: claro no
  esquema claro, escuro no escuro, os dois lendo `src/lib/codeTheme.ts` (era
  `e2e-dracula.spec.ts`, que exigia o `#282a36` fixo nos dois esquemas — ver §7.4 do
  redesign). Cobre também a repintura do scrollback do terminal ao trocar de tema.
- `e2e-i18n.spec.ts` — default pt-BR e troca de idioma (localStorage gravado).
- `more-flows.spec.ts` — UB3: idioma pt→en→pt reflete no Home/aula; tema claro→escuro→system persiste junto; onboarding first-run com o Quick Start COMPLETO (6 passos → `completed`); persistência do progresso do tutorial entre reloads.

> **11 specs mock, 15 testes** rodam em modo stub determinístico com a janela oculta
> (11 arquivos `*.spec.ts`; `e2e-gate` tem 2 testes, `e2e-onboarding` 2 e `more-flows`
> 3, os demais 1). Somam-se as **3 specs reais** (`real-lesson`, `real-didactics`,
> `real-search`), que rodam via `npm run test:e2e:real` com as chaves no shell.
> Estes arquivos são `*.spec.ts` (Playwright), **fora** do glob
> `tests/**/*.test.ts` usado por `bash tools/t.sh tests` — a suíte unitária
> não é afetada nem a EMPTY-GLOB GUARD se engana.

## E2E REAL (`real-*.spec.ts`) — didática com as CHAVES REAIS do usuário

A onda 18 acrescenta um subconjunto **REAL**: o app é lançado **SEM**
`STUDY_METHOD_E2E` (a fiação real da onda 3 flui: pesquisa Brave + autoria
DeepSeek + runner/juiz de verdade) e as chaves reais entram por envars. São os
specs que validam a **didática de fato**:

- `real-search.spec.ts` — round-trip real com o Brave (`keys:validate-brave` com
  a chave real ⇒ `isValid:true`) + `get-status` refletindo `braveValidated`. As
  **fontes** da pesquisa real (findings com URLs externas) são cobertas dentro do
  `real-lesson` (o app não expõe um canal IPC de busca direta de referências).
- `real-lesson.spec.ts` — gera UMA aula REAL ("Inverter uma árvore binária"):
  publica markdown real (título + seções + código) e os **desafios LISTAM**
  (regressão B1: list-challenges não falha com "requer setupRoot") e abrem.
- `real-didactics.spec.ts` — didática CERTA/ERRADA: no MESMO desafio real, uma
  resposta CORRETA (solução de referência escrita no stub) → veredito `PASSOU` +
  feedback didático do DeepSeek na UI; e uma resposta ERRADA/parcial (stub vazio)
  → veredito `NÃO PASSOU` + feedback didático com dicas.

### Como rodar a suíte real

```bash
# 1. Build de release (obrigatório — o harness roda sobre out/, como o mock):
npm run build

# 2. Exporte as chaves reais NO SHELL (NUNCA em arquivo versionado):
export DEEPSEEK_API_KEY=sk-...
export BRAVE_API_KEY=BSAq...

# 3. Rode só os specs reais (falha com mensagem se faltar alguma env):
npm run test:e2e:real
```

- O script `tools/run-e2e-real.sh` **falha com mensagem clara** quando
  `DEEPSEEK_API_KEY`/`BRAVE_API_KEY` não estão exportadas — nunca grava as chaves.
- As specs reais fazem `test.skip` (reason claro) quando as chaves faltam, então a
  suíte mock `npm run test:e2e` **segue verde** sem chaves (`real-*` aparecem como skipped).
- **Segurança:** o `userData` do app é redirecionado a um TMP (`--user-data-dir`) e
  as chaves entram pelo canal IPC real (`keys:set-key`) SEM tocar as settings reais
  do dev; ao fim o TMP (que pode conter as chaves em claro sem keyring) é apagado.
- **Tempos realistas:** a geração de uma aula real (pesquisa + autoria + validação
  com juiz LLM) costuma levar **3-6min** e pode variar/estourar com a latência da
  rede/LLM — a geração usa até 2 tentativas de `perAttemptMs` 420s, mais até
  2 avaliações didáticas (`real-didactics`), então os specs usam
  `test.setTimeout` gen­eroso: **1 800 000 ms = 30min** em `real-lesson` e
  `real-didactics` (teto que cobre o pior caso ≈25min e absorve a cauda lenta),
  e 120s em `real-search` (só round-trip, sem geração).
- ``.env.local`` (gitignored em ``app/``) existe como alternativa a exportar no
  shell — mas o `tools/run-e2e-real.sh` não o lê; prefira exportar as chaves no
  shell do teste conforme as instruções de segurança do orquestrador.