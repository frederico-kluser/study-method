# Relatório de Diagnóstico — Rodada 10, Onda 1 (repro loader infinito ao abrir aula)

**Data:** 2026-08-27 · **Commit base:** 89f07ce (rodada 9) · **Autor:** sub-agente de diagnóstico (onda 1)
**Escopo:** NENHUMA correção — apenas repro, causa raiz e lista de pontos de loading sem fallback para a Onda 2 blindar.

---

## 1. Sintoma (palavras do usuário)

> "quando clono esse projeto em outro computador e clico em uma aula ele fica num loader infinito que nunca resolve."

Interpretação de trabalho: clone limpo (userData novo do Electron, sem settingsStore, sem `.env.local`, primeiro boot) → o usuário tenta abrir uma aula da trilha → spinner que não resolve.

---

## 2. Metodologia e ambiente do repro

Repro REAL e reproduzível, sem tocar em produção (nenhum arquivo de `src/`, `electron/` ou scripts raiz foi alterado — só instrumentação de runtime via Playwright `app.evaluate` e specs novos):

| Item | Valor |
|---|---|
| App | bundle real `out/main/index.js` (electron-vite build, mesmo commit 89f07ce) |
| userData | NOVO a cada run (`--user-data-dir=<mkdtemp>` — **verificado** que o Electron honra o switch: `app.getPath('userData')` = o dir novo) |
| Chaves | SEM chaves no store (simula clone limpo) |
| Rede | NÃO bloqueada (ver §7 para o caso rede) |
| Gate | Nos testes de fluxo, `keys:startup-status` é substituído por um fake `phase:'ready'` **no processo main** via `app.evaluate` + reload determinístico — simula o usuário com as duas chaves válidas SEM tocar rede nem produção |
| Modo de lançamento | DOIS modos comparados (ver §4): `entry` (harness/entry direto) e `dot` (`electron .` — o modo do `npm run dev`) |

Spec entregue (commitado na worktree):
- `app/tests/e2e/e2e-clean-clone.spec.ts` — **spec de regressão FALSIFICÁVEL** (falha hoje no modo `entry`; verde após o fix da Onda 2): teste 1 = primeiro boot sem chaves → SetupView rápido (sem splash infinito); testes 2/3 = gate ready → Home → Trilha → aula abre. Autocontida (sem dependência das sondas).

As medições de IPC (`track:list/get/lesson`, `keys:startup-status`) e os dumps de tela foram coletados com sondas transitórias de diagnóstico (`probe-track.spec.ts`/`probe-ui-dump.spec.ts`), REMOVIDAS da história final a pedido do gate de integração — os números estão registrados nas seções 3, 5 e 7 deste relatório.

Baseline (stub E2E): `e2e-lesson.spec.ts` PASSou (31.4s) — o fluxo de trilha→aula no modo stub com userData novo funciona.

---

## 3. O que foi PROVADO (medições)

### 3.1 Modo `dot` (`electron .`, cwd=app/ — o modo do `./run.sh`/`npm run dev`)
userData novo + gate ready. Medição direta dos canais no renderer (probe):

```
track.list:   OK em 64ms → ok:true (18 módulos, 118 aulas)
track.get:    OK em 46ms → ok:true
track.lesson: OK em 38ms → ok:true (aula "O que é programação")
keys.startupStatus: OK em 1ms (fake)
```

Fluxo UI completo (Home → trilha → aula): **a aula abre em <1s** (`e2e-clean-clone` teste 2 PASS, 953ms). **NÃO há loader infinito neste modo, mesmo com userData 100% novo.**

### 3.2 Modo `entry` (`electron out/main/index.js` — MESMO modo do harness E2E e o jeito mais comum de rodar o buildado apontando o entry)
userData novo + gate ready. Medição direta:

```
track.list:   OK em 13ms → ok:false, error: "ENOENT: scandir '<app>/out/main/resources/tracks'"
track.get:    OK em 1ms  → ok:false, error: "ENOENT: open '<app>/out/main/resources/tracks/nodejs-do-zero/track.json'"
track.lesson: OK em 2ms  → ok:false, error: "ENOENT: open '.../out/main/resources/tracks/nodejs-do-zero/track.json'"
```

O que o usuário VÊ neste modo (dump da UI, gate ready):
- **Home**: a seção "Trilhas" **SOME em silêncio** (o componente retorna `null` — sem erro, sem loader, sem mensagem; só o cartão de chaves + chips "Ideias para começar");
- **Aba Trilha**: alerta *"Nenhuma trilha instalada ainda. As trilhas são criadas pelos autores da ferramenta (CLI)."*;
- **Aba Aula**: estado vazio *"Nenhuma aula selecionada — Escolha uma trilha na aba Trilha…"* — **não existe aula nenhuma para clicar**.

### 3.3 Gate (clone limpo, sem chaves)
Boot real sem chaves → `keys:startup-status` responde `phase:'blocked'` SEM rede em ~550ms → SetupView aparece (teste 1 PASS, 549ms). **O splash do gate não é infinito no clone limpo.**

---

## 4. CAUSA RAIZ PROVADA (canal + handler + linha + mecanismo)

### Bug 1 (PROVADO empiricamente — quebra TODO o fluxo de trilhas fora do modo dev)

- **Canal/handler:** `track:list`, `track:get`, `track:lesson`, `track:tutor-chat`, `track:challenge*` — todos os handlers de `electron/main/ipc/track-handlers.ts`.
- **Linha:** `electron/main/index.ts:202-209`:
  ```ts
  registerTrackHandlers({
    getTracksDir: () =>
      app.isPackaged
        ? resolveTracksDir('', process.resourcesPath)
        : resolveTracksDir(app.getAppPath()),   // ← AQUI
    ...
  });
  ```
  e `electron/main/ipc/track-handlers.ts:95-97`:
  ```ts
  export function resolveTracksDir(appPath: string, resourcesPath?: string): string {
    return resourcesPath ? path.join(resourcesPath, 'tracks') : path.join(appPath, 'resources', 'tracks');
  }
  ```
- **Mecanismo:** quando o main é lançado por ENTRY DE ARQUIVO (`electron out/main/index.js` — exatamente o que o harness `tests/e2e/helpers.ts` faz e o jeito mais comum de rodar o buildado), o Electron define `app.getAppPath()` como o **diretório do entry** (`<app>/out/main`), NÃO a raiz do app. Então `getTracksDir()` resolve para `<app>/out/main/resources/tracks`, que **não existe** — as trilhas reais vivem em `<app>/resources/tracks` (commitadas, 278 arquivos). No modo dev (`npm run dev`/`electron .`), `app.getAppPath()` = raiz do app → caminho correto → por isso "funciona na minha máquina".
- **Consequência:** todo IPC de trilha responde `{ ok:false, error: 'ENOENT…' }` em 1-13ms. Na Home a seção de trilhas some **sem nenhum feedback** (`src/views/placeholders.tsx` TracksSection: falha → `setTracks([])` → `return null`); a aba Trilha mostra alerta; uma aula é **inalcançável**.
- **Por que o harness E2E nunca pegou:** em `STUDY_METHOD_E2E=1` os handlers de trilha são os STUBS de `electron/main/services/e2eStubs.ts` (`buildTrackStubHandlers`), que resolvem a fixture em `E2E_WORKSPACE_ROOT` e **nunca chamam `getTracksDir`** — a fiação real (com o path quebrado) fica completamente fora do harness. **O modo E2E MASKCARA o bug.**

### O "loader infinito" em si (estado `lesson===null && loadError===null`)

- **Canal/handler/linha:** `src/views/LessonView/LessonView.tsx:350-356`:
  ```tsx
  if (!lesson) {
    return (<Box sx={{ p: 2, maxWidth: 640, mx: 'auto', pt: 4 }}><LinearProgress /></Box>);
  }
  ```
  Combinado com o efeito de montagem (`LessonView.tsx:175-206`): `trackLesson` é setado, a promise `getApi().track.lesson(...)` é disparada, e **se essa promise nunca resolver (ou resolver de um jeito não previsto), o LinearProgress fica para SEMPRE** — não há timeout nem fallback. Mecanicamente é o único caminho para o loader infinito nesta view, e ele é idêntico nos pontos irmãos (§6).
- **Mas a promise NÃO trava nos modos reais** (medido: 2-38ms em ambos os modos — os handlers de trilha são disco + SQLite síncrono). Ou seja: no código atual, o `track.lesson` nunca pendura por si.
- **Onde o "nunca resolve" AINDA é possível no código atual (não-trivial, sem timeout):** `keys:validate-deepseek` / `keys:validate-brave` — usados pelo botão **"Validar"** do `SetupView` (`src/gate/SetupView.tsx:handleValidate`) e pelo `KeysPanel` de Configurações. Esses handlers (`electron/main/ipc/keys-handlers.ts`) chamam `validateDeepseekKey`/`validateBraveKey` (`electron/main/services/apiKeyValidator.ts`) com **fetch puro, SEM AbortSignal e SEM timeout** — o único timeout de validação do app é o do gate (`startup-handlers.ts:validateWithTimeout`, Promise.race 8s). Em rede que engole pacotes (VPN/firewall sem RST), o spinner do "Validar" gira indefinidamente (o timeout de conexão do SO pode ser de minutos; em rede silenciosa, indefinido). **Este é o único spinner genuinamente "infinito" que sobra no código atual** — no fluxo de configuração (SetupView é obrigatório no clone limpo antes de chegar a qualquer aula).
- **Observação de versão:** o relato do usuário ("clico numa aula → loader infinito") casa EXATAMENTE com o fluxo PRÉ-rodada-8 (geração de aula por LLM ao vivo — `study.generateLesson` com pesquisa Brave + autoria DeepSeek + progresso, cf. `LessonView` no commit `cf03cee`). Rounds 8-9 removeram esse caminho da UI (a aba Aula é 100% trilha hoje; `study.generateLesson` não é mais chamado por nenhuma view). Se o outro computador rodou um clone antigo, o loader relatado é o fluxo antigo; no código atual (89f07ce) o loader infinito na ABERTURA de aula não se reproduz em nenhum modo neste ambiente — o que se reproduz é o Bug 1 (trilhas inalcançáveis) e o spinner sem timeout do Validar.

---

## 5. Repro — passos exatos

### Repro do Bug 1 (falha hoje; deve ficar verde com o fix da Onda 2)
```
cd <repo>/app
npm run build
npx playwright test tests/e2e/e2e-clean-clone.spec.ts        # modo entry (default)
```
- Teste 1 (gate sem chaves → SetupView): PASS hoje.
- Testes 2/3 (gate ready → abrir aula): **FALHAM hoje** em `getByText('Node.js do Zero')` na Home (a seção de trilhas não existe — ENOENT). É o registro do bug.
- Modo usuário (deve passar SEMPRE — não é o bug):
```
CLEAN_CLONE_LAUNCH_MODE=dot npx playwright test tests/e2e/e2e-clean-clone.spec.ts   # testes 2/3 PASS em <1s
```

### Evidência dos canais (medições das sondas transitórias — arquivos removidos da história; reproduzível com o dump abaixo)
```
# modo entry (app real, userData novo, gate override): track:* → ok:false ENOENT em 1-13ms
# modo dot  (app real, userData novo, gate override): track:list 64ms / track:get 46ms / track:lesson 38ms → ok:true
```

### Dump do que o usuário vê (medição das sondas transitórias, modo entry × dot)
```
entry: Home SEM a seção "Trilhas"; aba Trilha → "Nenhuma trilha instalada ainda…"; aba Aula → "Nenhuma aula selecionada".
dot:   Home com cartão "Node.js do Zero (0 de 118 aulas)"; aula abre em <1s.
```

### Procedimento manual (se preferir sem Playwright)
1. `cd <repo>/app && npm run build`
2. `node_modules/.bin/electron out/main/index.js --user-data-dir=/tmp/sm-fresh-$(date +%s)` (janela visível)
3. Observar: Home sem seção "Trilhas"; aba Trilha → "Nenhuma trilha instalada ainda…"; aba Aula → "Nenhuma aula selecionada".
4. Comparar com o modo correto: `node_modules/.bin/electron . --user-data-dir=/tmp/sm-fresh-2` → Home com o cartão "Node.js do Zero (0 de 118 aulas)" → aula abre.

---

## 6. Pontos de "loading sem fallback" — LISTA EXAUSTIVA para a Onda 2 blindar

Varredura completa de `LinearProgress`/`CircularProgress` no renderer (grep) + análise do caminho de cada um:

| # | Local | Estado que prende | Fallback hoje? | Notas |
|---|---|---|---|---|
| 1 | `src/views/LessonView/LessonView.tsx:350-356` | `trackLesson!=null && lesson===null && loadError===null` → `<LinearProgress/>` | **NÃO** | O alvo principal do relato. Precisa de timeout/fallback (ex.: erro após N s, ou estado de erro para `ok:false` + retry). |
| 2 | `src/gate/AppGate.tsx:71-90` (Splash) | `status===null` ou `phase==='checking'` → `<CircularProgress/>` | parcial (gate real é limitado a ~8s pela race do startup) | Se `keys:startup-status` não resolver (main travado/canal ausente), o splash gira para sempre. Canal ausente hoje rejeita → GateError (ok); main travado → infinito. |
| 3 | `src/gate/SetupView.tsx:handleValidate` (botão "Validar") | `validating:true` durante `keys.validateDeepseek/Brave` | **NÃO** | fetch SEM timeout (apiKeyValidator sem AbortSignal). Rede que engole pacotes → spinner infinito. O clone limpo OBRIGA a passar por aqui. |
| 4 | `src/views/SettingsView/KeysPanel.tsx:258,266` | `saving`/`validating` | **NÃO** | Mesmo fetch sem timeout (mesmo handler `keys:validate-*`). |
| 5 | `src/views/RoadmapView/RoadmapView.tsx:319` | `loading && !track` → `<LinearProgress/>` | parcial (`.finally` encerra) | O `.finally` cobre erro; mas se o IPC nunca resolver, prende. Mesma classe de bug do #1. |
| 6 | `src/views/ChallengeView/TrackChallengePanel.tsx:350` | `loading` → `<CircularProgress/>` | parcial (`.finally` encerra) | `track:challenge`/`track:proficiency` — mesmo ENOENT do Bug 1 no modo entry. |
| 7 | `src/views/LessonView/ResearchChecklist.tsx:119` | item de query `running` → `<CircularProgress size=16/>` | n/a (componente do fluxo antigo de geração; **não é mais usado** por nenhuma view — sem chamador em `LessonView.tsx`) | Pode ser removido ou ignorado pela Onda 2. |
| 8 | `src/views/SettingsView/LocalAiPanel.tsx:314` | progresso de download de modelo local | semântica própria (download) | Não é loader de fluxo; fora do escopo do relato. |

**Padrão a blindar (sugestão para a Onda 2, não implementado aqui):** helper de "IPC com timeout + estado de erro explícito" para TODOS os invokes de carregamento (1, 2, 5, 6), timeout no `keys:validate-*` (3, 4), e decisão de UI de erro distinta de loading (nunca `return null` silencioso — caso da TracksSection da Home, `src/views/placeholders.tsx:370`: `tracks.length===0 → return null` esconde a falha).

---

## 7. Perguntas falsificáveis da Onda 1 — respostas

1. **"Algum IPC pendurado por estado ausente (track:*, keys:startup-status)?"** → **NÃO (refutado).** Todos os canais medidos resolvem em 1-64ms no app real com userData novo, nos dois modos. O "pendurado" não existe no código atual; existe o ESTADO de UI sem fallback (§6).
2. **"Caminho LLM residual no fluxo de abrir aula?"** → **NÃO (refutado).** `deepseekClient.chatCompletion` tem AbortController+timeout (60s default); `tutorChat` `'next'` é determinístico (`nextSection` puro, sem LLM); abrir aula não toca LLM. O fluxo antigo com LLM (`study.generateLesson`) não é mais chamado por nenhuma view.
3. **"Workspace/setupRoot trava no primeiro boot?"** → **NÃO (refutado).** O fluxo de trilhas não usa o workspace do aluno (o runner é lazy); nada no boot espera setupRoot.
4. **"lesson.json/challenge.json com caminho relativo que resolve errado?"** → **PARCIALMENTE (superado por achado maior).** Os paths de arquivo DENTRO da trilha resolvem certo; o que resolve errado é o **diretório das trilhas** em si: `app.getAppPath()` = diretório do entry quando lançado por arquivo → `out/main/resources/tracks` (Bug 1, §4).
5. **"Race na navegação Trilha→Aula (pendingSubject)?"** → **NÃO (refutado).** `setPendingTrackLesson`+`navigate` são síncronos no mesmo handler; o drain é one-shot na montagem; `publishSession` é estável (`useCallback []` — o efeito não re-roda).
6. **"AppGate/startupStatus com rede indisponível?"** → **CONFIRMADO COMO HAZARD REAL, mas não no gate.** A race de 8s (`startup-handlers.ts:validateWithTimeout`) limita o `keys:startup-status` — o splash do gate não prende. PORÉM: (a) o fetch dos validadores NÃO tem AbortSignal — o fetch "vaza" além da race (rejeição não tratada no main); (b) o MESMO validador é chamado SEM timeout nenhum por `keys:validate-*` (SetupView "Validar" e KeysPanel) — rede que engole pacotes → spinner infinito no fluxo obrigatório do clone limpo.

---

## 8. Entregáveis (commitados na worktree `onda1-repro-loader`)

- `docs/relatorio-rodada10-diag.md` — este relatório.
- `app/tests/e2e/e2e-clean-clone.spec.ts` — **spec de regressão falsificável**: falha hoje no modo `entry` (Bug 1); verde após o fix da Onda 2 (e já verde no modo `dot`). Autocontida; segue o padrão `RendererDom` das specs verdes (sem lib DOM no tsconfig.node).

Nenhum arquivo de produção foi alterado. Instrumentação foi feita exclusivamente por runtime (`app.evaluate` no main, sem tocar código).

## 9. Recomendação mínima para a Onda 2 (não implementado — escopo desta onda)

1. Corrigir `getTracksDir()` para resolver as trilhas a partir da raiz do app de forma robusta ao modo de lançamento (ex.: derivar de `app.getAppPath()` apenas quando for a raiz; senão usar o diretório-pai do entry / `process.cwd()` / caminho absoluto do `resources` do app) — **é o que destrava o fluxo de aulas no "outro computador"**.
2. Blindar os pontos §6 com timeout+fallback de erro (esp. #1 LessonView e #3/#4 validação de chaves sem timeout).
3. Decidir sobre a TracksSection da Home: falha de `track:list` hoje SOME em silêncio — mostrar erro/retry.

## 10. Bloqueios / desvios

- **Sem chaves reais** para exercitar o gate 'ready' de ponta a ponta com rede real: o gate foi contornado por override de handler no main (documentado; sem tocar produção). O fluxo real de validação (rede) está coberto pelos `real-*` specs existentes quando o dev exporta as chaves.
- **Não foi possível simular rede "engole pacotes"** sem sudo (a base URL dos validadores é fixa; sem env override): a afirmação do §7.6(b) é PROVA ESTÁTICA (ausência de AbortSignal/timeout no caminho `keys:validate-*`), não repro dinâmico.
- O loader infinito LITERAL ("aula abre e o spinner não resolve") **não se reproduz** no código atual em nenhum modo neste ambiente — a evidência aponta para o Bug 1 (trilhas inalcançáveis no modo entry) como a quebra real do "clone em outro computador", o spinner sem timeout do Validar como o único infinito restante, e o relato original como possivelmente pré-rodada-8 (fluxo de geração por LLM, já removido da UI).
