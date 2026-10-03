# Brief da onda 2 — UI da secção Games (pronto a despachar)

## Papel
Implementar o painel Games no UI do study-method (MUI + Emotion), consumindo o contrato IPC
do motor (app/src/types/games.ts — ver relatório do agente do motor para a forma exata).

## Ownership exclusivo
- app/src/lib/shellNav.ts (NavKey/PanelKey/NavI18nKey + NAV_ITEMS: adicionar 'games')
- app/src/components/shell/NavigationRail.tsx (NAV_ICON: adicionar games — ícone da família
  *Rounded; ex.: SportsEsportsRounded; lembrar: rail só-ícone com Tooltip+aria-label)
- app/src/App.tsx (VIEWS record: games → GamesView)
- app/src/views/GamesView/ (NOVO: GamesView.tsx = mapa do mundo; GameLevelView.tsx = nível)
- app/src/i18n/locales/{pt-BR,en}/translation.json (SÓ chaves games.* + nav.games)
- app/tests/gamesView.test.ts + app/tests/gamesLevelView.test.ts (SSR/padrão dos testes de view)

## O que desenhar (mockups canónicos em .recon/games-research/jogo-na-pratica.html secções 02-03)
1. **GamesView (mapa)**: título do mundo + descrição; linha de nós de nível (concluído = success,
   atual = primary, bloqueado = muted, chefe = círculo accent) com setas; cartão do nível atual com
   botão "Jogar nível"; seletor de linguagem (c/python/rust — afeta starter/reference do contrato).
2. **GameLevelView (nível)**: enunciado em cartão; editor CodeMirror (REUTILIZAR
   app/src/components/cm/CodeMirrorField.tsx — ver como ChallengeView o usa); botão "Testar
   resposta" (reutilizar padrão); resultados dos casos (visíveis com expected/actual; hidden só
   pass/fail); painel de OTIMIZAÇÃO após passar: 2 métricas com valor/par/recorde + histograma
   (barras CSS simples, marcador "tu" em accent) + botões "Otimizar" e "Avançar"; no chefe: mesma
   estrutura com invólucro leve (título distinto).
3. Estados: loading, erro, sem mundos (empty state legítimo como homeTracksState).

## Invariantes da casa (HARD)
- Política "quebra, nunca recorta" (SC 1.4.12): SEM ellipsis/nowrap que corte; overflow-wrap
  'break-word'; testes e2e-spacing/spacingScan passam. Alvos ≥44px (TOUCH_TARGET_PX).
- Regra 3b: chrome = tinta; acento só como fill/indicador. Contraste medido e documentado
  (padrão do repo: comentário PT-BR "[medido]: X,Xx:1"). Família *Rounded de ícones.
- Comentários PT-BR longos (porquê + medidas). i18n nos DOIS locales. ARIA: view em
  role="tabpanel" (padrão do shell), botões reais, foco visível (focusRingStyles).

## Verificação
cd app && npm run lint · bash tools/t.sh tests/gamesView.test.ts tests/gamesLevelView.test.ts
· NÃO correr npm test completo (gate central no fim). Reportar: ficheiros, decisões, testes.

# Brief da onda 3 — e2e + prints (pronto a despachar)

## Ownership
- app/tests/e2e/e2e-games.spec.ts (NOVO)
- app/tests/e2e/gamesShots.ts helper (captures) + .recon/games-shots/ (saída PNG)

## Cenários e2e (Playwright+Electron — seguir padrão de e2e-lesson.spec.ts/helpers.ts)
1. Home → painel Games → mapa mostra mundo com 5 nós → abrir nível 1 → escrever solução de
   referência (python) → "Testar resposta" → casos passam → painel de otimização visível →
   "Avançar" desbloqueia nível 2 → voltar ao mapa mostra nível 1 concluído.
2. Chefe: bloqueado até níveis 1-4 concluídos; concluir níveis 1-4 (pode submeter referência) →
   chefe acessível.
3. Trocar linguagem para C no nível 1 → starter em C aparece → correr starter → casos FALHAM
   (starter não resolve) — prova o contrato multi-linguagem.
4. PRINTS: em cada passo-chave, page.screenshot para .recon/games-shots/:
   01-mapa.png, 02-nivel-editor.png, 03-apos-testar.png, 04-otimizacao-histograma.png,
   05-chefe.png, 06-mapa-progresso.png, 07-mobile-360.png (viewport 360 — colapso).
   Usar viewport fixo 1280x800 para os desktop (consistência de avaliação).

## Verificação
npx playwright test tests/e2e/e2e-games.spec.ts --reporter=line · correr também
e2e-spacing.spec.ts (as invariantes valem para as views novas). Reportar: cenários, prints
(paths), e qualquer violação de spacing encontrada.
