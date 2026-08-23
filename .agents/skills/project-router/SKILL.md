---
name: project-router
description: Roteia toda tarefa neste repositório study-method (gui Electron do tutor) para as skills certas ANTES de agir. Consulta o catálogo de skills do repo, carrega a skill companheira relevante na sessão e valida o próprio escopo antes de qualquer edição. Use sempre que a tarefa envolver o repo study-method.
metadata:
  version: 0.1.0
  type: router
---
# Project Router — study-method

Roteador do repositório `study-method` (GUI Electron do tutor de estudo), criado
por convenção para agentes que trabalham em worktrees deste repo. Toda tarefa
passa por aqui primeiro para carregar o conhecimento relevante do projeto antes
de qualquer edição.

## Contexto do repo

- **Fronteira**: o agente trabalha na SUA worktree, nunca na `MAIN_ROOT`
  (`/home/ondokai/Projects/study-method`). NUNCA `git checkout/switch/merge/
  rebase/push/worktree/clean -ff`.
- **Módulos**: `app/electron` (main/preload), `app/shared/ipc-contract.ts`
  (contrato CONGELADO), `app/src` (renderer React), `app/tests` (node:test, sem
  jsdom).
- **Gates**: em `app/`: `bash tools/t.sh tests` · `npm run lint` · `npm run build`.

## Protocolo (execute ANTES de agir)

1. **Classifique** a tarefa por domínio:
   - shell/navegação/views → `src/App.tsx`, `src/views/*`
   - editor de código / terminal → `src/components/cm`, `src/components/editor`, `src/components/terminal`
   - IPC/ponte → `shared/ipc-contract.ts`, `electron/preload/api-schema.ts`, `src/lib/apiBridge.ts`
   - lógica pura/testes → `src/lib/*`, `app/tests/*`
2. **Selecione** a skill companheira do repo (`skills/study-method/SKILL.md`) e
   as `references/` pertinentes ao passo.
3. **Carregue** o estado real do repo (`git status`, arquivos atuais) antes de
   afirmar/editar.
4. **Execute** a tarefa dentro da worktree.
5. **Evolução**: registre no `LEARNINGS.md` da própria skill o que valer a pena.

## Regras

- Nunca escrever/commitar/instalar fora da própria worktree.
- Nunca editar `shared/ipc-contract.ts`, `package.json`/lock, `.npmrc`,
  `electron.vite.config.ts`, `electron/**`, `views/SettingsView`,
  `views/placeholders.tsx`, `lib/apiBridge.ts`, `hooks/useLessonProgress` —
  salvo autorização explícita no escopo da tarefa.
- Sempre obedecer os gates (tests/lint/build) verdes antes de dar o trabalho
  por concluído.