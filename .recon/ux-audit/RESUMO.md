# Resumo — auditoria e correção UX/UI das 5 capturas (2026-10-02)

## Método
10 subagents: 5 de auditoria (um por imagem, framework uxui-evaluator + regras design-taste,
relatórios completos em `findings-{1..5}-*.md`) e 5 de implementação (ownership exclusivo de
ficheiros, protocolo de concorrência para `translation.json`/`LessonView.tsx`), com o agente-pai
a consolidar, arbitrar tensões e correr o gate central (`gate.sh`).

## Resultado por ecrã (antes → depois)

| Ecrã | Score auditado | Correções principais |
|---|---|---|
| Trilhas (home) | 38/100 poor | Chip de progresso esmagado a ~55px ("conclu/ídas") → `TrackProgressBadge` em grid `minmax(0,1fr) auto` com 2 linhas ("1 de 115" / "aulas concluídas"), `break-word`, zero ellipsis; descrição `body2` com medida 640px; hierarquia h6 vs subtitle1; copy vazia sem jargão de CLI; "cadeia de C"→"trilha de C" |
| Rail "Configurações" | 48/100 fair | "Configuraç/ões" a meio da palavra → rail só-ícone 80px (M3 narrow) + Tooltip + `aria-label` (a conta do orçamento do composer proíbe alargar: 128px parte o piso 323px; 80px ganha 20px de folga); Settings ganha engrenagem; família `*Rounded` unificada |
| Painel da aula | 54/100 fair | "Seção 0 de 3" (secção fantasma) → "0 de 3 seções"; "ASSUNTO o-esqueleto" (slug cru) → título da aula; ícones-emoji (🏆/📖) → glifos funcionais; badge de pendentes sem vermelho-de-falha; barra de progresso com fill/trilho medidos; quebra `break-word` nos rótulos |
| Modal de tour | 25/100 poor | Diálogo sem foco/Escape/nome → contrato completo (focus trap, Escape, foco restaurado, aria-labelledby); "Agora não" ganha nota de reabertura; badge "SIMPLIFICADO" (oxímoro) removido; "Quick Start"→"Tour rápido" (localizado); X 44px; CTA real em `<Button>` |
| Modal de fontes | 55/100 fair | Linhas de texto morto → affordance real (título 600, `host · qualificador`, chevron, "Fechar" visível 44px); travessões "Nome — qualificador" normalizados em exibição por `app/src/lib/sourceTitle.ts` (sem reescrever 696 títulos de conteúdo); lint de autoria `FONTE_TITULO_PADRAO_IA` |

## Invariantes preservadas (verificadas por e2e)
- Política "quebra, nunca recorta" (SC 1.4.12): `e2e-spacing` + `e2e-sidebar-aula-spacing` —
  0 recortes / 0 elementos fora / 0 sobreposições nas 8 configs (180px × idioma × altura).
- Literais de código fixados por regex nos testes: byte-idênticos.
- Papéis ARIA (rail `tablist`, poço `role="status"` com `spans[1]`), contraste medido e
  documentado (regra 3b tinta/acento), alvos ≥44px.

## Gate central (evidência final)
1. `npm run lint` (tsc ×2) ✔
2. Suite unitária: **7159 testes · 7157 pass · 0 fail · 2 skipped** (baseline 7147; +12 novos)
3. `npm run build` ✔
4. E2E invariantes de spacing: **3/3** ✔
5. E2E superfícies: **11/11** ✔ (fontes, i18n, lesson, nav-history ×2, onboarding ×2, more-flows ×3, perf-settings)

## Escopo
31 ficheiros alterados + 1 novo (`app/src/lib/sourceTitle.ts`). Travessão (—) eliminado de
TODO o i18n visível (pt-BR + en) e dos `track.json`. Memória CoALA: #4853–#4857.

## Follow-ups conhecidos (fora das 5 capturas / sugestões)
1. `OnboardingHost.tsx:66` — `hasKeys` começa `true` e o cartão "Tour completo" pode dar um
   flip quando o IPC resolve (finding-12 do tour, severidade sugestão; exige tri-state no modal).
2. `LessonView.tsx:3508` — `AutoStoriesIcon` no estado vazio (único resíduo da política
   "AutoStories só do Tutor", descoberto em rota).
3. Passe de conteúdo opcional (descrições dos `lesson.json` com recheio repetido) — camada
   separada, ver finding-3 do relatório de fontes.
