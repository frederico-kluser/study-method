# Regras da casa para os fixes de UX/UI (onda 2)

Documento partilhado por todos os subagents de implementação. O projeto study-method
tem cultura forte de decisões documentadas e medidas; os fixes têm de respeitá-la.

## 1. Invariantes NÃO negociáveis (testadas por e2e)

1. **Política "QUEBRA, NUNCA RECORTA" (SC 1.4.12 / F104).** Texto nunca leva
   `text-overflow: ellipsis` nem é recortado por `overflow: hidden` de ancestrais.
   Quando não cabe, QUEBRA linha. Os scanners `app/tests/e2e/spacingScan.ts`
   (`e2e-spacing.spec.ts`, `e2e-sidebar-aula-spacing.spec.ts`) varrem os elementos
   sob os 4 overrides do SC 1.4.12 (`SPACING_OVERRIDES`) e acusam qualquer
   ellipsis, transbordo ou sobreposição de folhas de texto.
2. **Quebra a meio da palavra é bug, não feature.** O `overflow-wrap: anywhere`
   atual (chip de progresso do home, rótulo do rail) reduz a largura min-content
   a ~1 glifo, deixando o flexbox ESMAGAR a caixa ("concluí/das",
   "Configuraç/ões"). Correção padrão: `overflowWrap: 'break-word'` (só quebra
   quando a palavra não cabe de todo; min-content fica no tamanho da maior
   palavra) + dar folga de largura onde faz falta (`flexShrink: 0`, `minWidth`,
   ou estreitar o vizinho). Nunca `hyphens: auto` como única defesa (a
   hifenização do Chromium no Linux não é garantida para pt-BR).
3. **Regra 3b (tinta vs acento):** em superfícies de chrome (níveis 3/4) o texto
   é TINTA (`text.primary`/`text.secondary`); o acento só entra como
   PREENCHIMENTO (indicadores, fills) — nunca como cor de rótulo. Ver
   `designTokens.ts`. Qualquer cor nova tem de ter contraste MEDIDO e o valor
   documentado no comentário (cultura do projeto: "medido: X,XX:1").
4. **Papéis ARIA existentes:** o rail é `<Tabs orientation="vertical">` de
   propósito (`role="tablist"`/`tab`, navegação por setas); 13+ specs e2e usam
   `getByRole('tab')`. Não converter em Lista/botões. O painel da aula publica
   cabeçalho por portal no slot do sidebar (`SessionFrame`, `ShellSidebarSlot`).
5. **Rótulos visíveis estáveis para e2e:** "Desafios", "Fontes", "Configurações",
   "Trilhas", "Quer um tour?", headings — se uma string tiver mesmo de mudar,
   atualizar as specs afetadas e listá-las no relatório final.
6. **`role="button"` fake em `<span>` é anti-padrão:** substituir por
   `<Button>`/`<Link>` real quando encontrado (modal de tour tem um).

## 2. Cultura de código

- Comentários longos em PT-BR documentando o PORQUÊ de cada decisão (padrão do
  repo: blocos "ONDA-...", medidas de contraste, referências a SC/WCAG). Quando
  um fix alterar uma decisão, ATUALIZAR o comentário adjacente para não ficar
  falso, e registar a medida/justificação no mesmo estilo.
- TypeScript estrito; `npm run lint` (tsc) tem de passar.
- Estilos via sx/Emotion + tokens do tema (`theme.vars.palette...`,
  `designTokens.ts`: `SHAPE`, `SCRIM`, `TOUCH_TARGET_PX`, `FOCUS_RING`...). Não
  inventar valores mágicos; usar os tokens.
- i18n: TODA string visível via `t('translation:...')`; mudanças de copy em AMBOS
  `app/src/i18n/locales/pt-BR/translation.json` e `.../en/translation.json`.
  Interpolação usa o cast `tI` já existente nos ficheiros.

## 3. Design-taste (aplicável a product UI)

- Sem travessão (—) em copy nova; usar hífen, dois-pontos ou quebra de linha.
  Travessões em conteúdo (`resources/tracks/**/lesson.json`) são camada
  separada — ver finding do modal de fontes.
- Contraste WCAG AA (4.5:1 texto, 3:1 texto grande/non-text). Medir e documentar.
- Alvos de toque ≥ `TOUCH_TARGET_PX` (44px). O `×` de 28px do modal de tour viola.
- Hierarquia visual clara; uma ação primária dominante por diálogo.
- Estados interativos completos: hover, active (resposta tátil `scale(0.97)`),
  focus-visible (`focusRingStyles`), disabled.
- Copy funcional e direta; sem badges contraditórios (ex.: "SIMPLIFICADO" em
  "Tutorial Completo").

## 4. Verificação obrigatória por agente de implementação

```bash
cd app
npm run lint          # tsc --noEmit (ambos os tsconfigs)
npm test              # 7147 testes unitários — baseline verde, 0 falhas
npm run build         # electron-vite build
```

Se a mudança tocar em strings/layout com specs e2e (ver `tests_at_risk` do
relatório de auditoria), rodar a spec afetada:
`npx playwright test tests/e2e/<spec>.spec.ts` (a partir de `app/`).
Nenhuma regressão aceitável: se uma spec colidir com o fix, atualizar a spec e
justificar no relatório.

## 5. Ownership (evitar corridas entre agentes)

Cada agente de implementação mexe APENAS nos ficheiros atribuídos. Partilhados
(`translation.json`, `designTokens.ts`, `theme.ts`, `index.css`): só editar as
chaves/tokens do seu âmbito, relendo o ficheiro imediatamente antes do edit.
