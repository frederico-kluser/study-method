# STORY-SPEC — contrato das histórias do Storybook (study-method)

Este documento é a LEI das histórias (`*.stories.tsx`) deste repositório. Cada
subagente/autor de histórias lê-o antes de escrever. O objetivo final está em
`docs/storybook/HANDBOOK.md`: o Storybook é o CATÁLOGO VIVO da UI — um redesign
futuro lê apenas o Storybook para conhecer todo o vocabulário visual do produto.

## 1. Localização e nome

- História COLOCADA ao lado do componente: `app/src/<area>/<Nome>.stories.tsx`
  para `app/src/<area>/<Nome>.tsx`. Nunca uma pasta `stories/` separada.
- Uma história por componente visual exportado. Views compostas grandes
  (`LessonView`, `SettingsView`, …) têm história própria + histórias dos seus
  blocos visuais extraídos.
- Só ficheiros `*.stories.tsx` são histórias; lógica de apoio pode (e deve)
  viver em `*.stories.helpers.ts` junto, que NÃO é apanhado pelo glob.

## 2. Título (árvore do Storybook)

```
Fundamentos/Cores · Tipografia · Espaço · Movimento · Ícones
Componentes/<Grupo>/<Componente>        (Grupo: Chat, Shell, Editor, Markdown,
                                         Quiz, Desafio, Curso, Voz, Tema,
                                         Árvore, Terminal, CM, Navegação)
Padrões/<Padrão>                        (composições recorrentes: painel,
                                         empty-state, fluxo de resposta…)
Vistas/<View>                           (LessonView, RoadmapView, …)
Funcionalidades/Onboarding/<Componente>
```

O `title` é literal (sem auto-derivação do path) para a árvore ficar estável.

## 3. Formato (CSF3, types reais)

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { NomeDoComponente } from './NomeDoComponente';

const meta = {
  title: 'Componentes/Grupo/NomeDoComponente',
  component: NomeDoComponente,
  tags: ['autodocs'],
  parameters: { layout: 'centered' }, // ou 'padded'/'fullscreen' quando faz sentido
  args: { /* props DEFAULT realistas — nunca vazio quando o componente exige props */ },
  argTypes: { /* controles para as props visuais relevantes */ },
} satisfies Meta<typeof NomeDoComponente>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};
```

- `satisfies Meta<typeof X>` — tipos reais, zero `any`.
- Nomes das stories em português (o produto é pt-BR), PascalCase.
- Não escrever `render` customizado quando `args` chegam; `render` só para
  composições (ex.: mostrar 3 estados lado a lado).

## 4. Cobertura obrigatória (o que torna a história "completa")

Para CADA componente, cobrir no mínimo:

1. **Estado default** — como aparece no uso normal.
2. **Variantes visuais** documentadas no componente (tamanho, severidade,
   variante, selecionado/não, com/sem ícone, truncado…).
3. **Estados de ciclo de vida**: carregando/skeleton (se existir), vazio
   (empty-state), erro/aviso, desabilitado, focado (via `play` se houver foco
   visível).
4. **Interações** que o componente tem (abrir/fechar, hover com mudança
   estrutural, arrastar, digitar): com `play` de `storybook/test` (Storybook 10
   — NÃO `@storybook/test`, que não existe nesta versão) quando é
   verificável, senão com controles de args.
5. **Conteúdo real**: textos do produto (pt-BR), longos onde o layout pode
   quebrar (teste de overflow), código/fórmula onde aplicável.
6. **Dois temas**: a toolbar global força claro/escuro — nenhuma story fixa cor
   por `sx` que esconda o tema; nunca escrever hex numa story (regra do design
   system: hex só em `src/lib/designTokens.ts`).

## 5. Separar STATE de VIEW (contrato do projeto)

A regra que o Storybook veio impor:

- **View** (`X.tsx` ou `XView.tsx`): só props, sem IPC, sem localStorage, sem
  relógio global. É o que a história renderiza.
- **Estado/lógica**: módulo puro (`X.state.ts`, `src/lib/*.ts`) ou hook
  (`useX.ts`) testável por `node:test` sem jsdom (convenção existente:
  `themeModeState.ts`, `quizOverlayState.ts`, `chatBubbleStyle.ts`…).
- **Container** (quando existe): só liga estado→view e mantém o export público
  que o app já usa — o app não pode quebrar; `npm run lint` + `bash tools/t.sh
  tests` têm de ficar verdes.

Quando um componente mistura estado e view, a onda de stories FAZ a extração
antes de escrever a história (e cobre a lógica extraída com teste node:test
novo quando ela não era testada).

## 6. DRY de layout

Nenhum `sx` de layout copiado entre histórias ou componentes. Os primitivos
partilhados vivem em `app/src/components/layout/` (ver
`docs/storybook/LAYOUT-DRY-AUDIT.md` para o mapa do que foi consolidado):

- `Panel` (cabeçalho + corpo), `PageFrame` (enquadramento de view),
  `ScrollArea`, `EmptyState`, `StackRow`/`StackColumn` (gaps do contrato),
  `SplitLayout` (rail/side/main) — os nomes finais são os que existirem no
  código; consultar os exports de `app/src/components/layout/` antes de
  inventar.

Se uma história precisa de layout, usa estes primitivos. Se o componente não
os usa ainda, é a onda de consolidação que liga — não duplicar na história.

## 7. API falsa e dados

- O preview já instala `installMockApi()` (de `src/storybook/mockApi.ts`) antes
  de cada história — `getApi()` resolve com dados realistas.
- Uma story que precisa de outro comportamento chama
  `installMockApi({ track: { list: async () => … } })` no seu `loaders`/
  `beforeEach`, e nunca importa `electron`.
- Dados de exemplo partilhados: `src/storybook/fixtures.ts`. Preferir fixtures
  aos objetos locais; criar fixtures novas exportadas quando o dado for
  reutilizável.

## 8. Verificação (obrigatória antes de entregar)

```bash
cd app
npx tsc --noEmit -p tsconfig.json          # lint do renderer + stories
npx tsc --noEmit -p tsconfig.node.json
bash tools/t.sh tests                       # suíte completa (não pode regredir)
npx tsx tools/storybook-coverage.ts         # 100% dos componentes com história
npm run build-storybook                     # o catálogo tem de compilar
```

A onda final roda tudo isto; cada autor de stories roda pelo menos os três
primeiros na sua área.

## 9. Proibido

- Hex/valores de design inventados (só `src/lib/designTokens.ts` / `theme.ts`).
- `any`, `@ts-ignore`, `eslint-disable` para calar erros.
- Mocks manuais de `window.api` (usar `installMockApi`).
- História que renderiza o componente envolto em layout decorativo falso (o
  Storybook mostra o componente como o app o usa).
- Alterar comportamento do app sem manter a suíte verde.