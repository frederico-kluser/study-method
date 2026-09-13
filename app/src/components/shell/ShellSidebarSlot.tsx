/**
 * src/components/shell/ShellSidebarSlot.tsx — o SLOT DA VIEW ATIVA no sidebar
 * do shell (onda1-sidebar-slot).
 *
 * ─── O PROBLEMA (verbatim do dono) ─────────────────────────────────────────
 * *"a informação dele nunca muda"* — sobre o sidebar estilo VSCode que a
 * ONDA-SIDEBAR criou (SessionFrame). A coluna nasceu como o quadro de sessão
 * GLOBAL (título do app → assunto/fase → tema/idioma): útil, mas igual em toda
 * aba. O objetivo real era outro — pegar o conteúdo do cabeçalho de CADA AULA
 * (que vivia DENTRO do `main`, pela LessonView) e levá-lo para essa coluna,
 * como o VSCode faz com a área de arquivos: a coluna mostra o contexto do que
 * está aberto ao lado.
 *
 * ─── O PADRÃO: SLOT (no shell) + PORTAL (na view) ──────────────────────────
 *   1. O SessionFrame renderiza um contêiner VAZIO com id estável
 *      (`SHELL_SIDEBAR_SLOT_ID`) e entrega o nó DOM ao shell por callback ref.
 *   2. O shell (App.tsx) guarda esse nó em ESTADO e o publica por CONTEXTO
 *      (`ShellSidebarSlotContext`), num Provider que envolve o SessionFrame E o
 *      `main` — é de dentro do `main` que a view ativa vai ler.
 *   3. A view ativa embrulha o que quer mostrar na coluna em
 *      `<ShellSidebarPortal>`; o portal "teletransporta" esses nós para dentro
 *      do slot.
 *
 * Por que portal e não "subir o estado para o shell": a view CONTINUA DONA do
 * conteúdo. Estado, handlers, âncora de popover e contextos React (tema,
 * i18n, sessão) seguem os da view — o portal muda só ONDE o DOM é pintado,
 * não QUEM manda nele. O shell não precisa conhecer aula, desafio nem fonte, e
 * nenhuma prop nova atravessa o App.
 *
 * Por que isso resolve o "nunca muda" sem nenhum código de limpeza: o shell
 * monta SÓ a view ativa. Trocar de aba desmonta a view — e, com ela, o portal;
 * o React remove os nós do slot sozinho, o slot volta a ficar vazio e o
 * `:empty` do SessionFrame o tira do layout. Em Home/Settings/Roadmap/Challenge
 * (que não publicam nada) o sidebar fica visualmente IDÊNTICO ao de antes.
 *
 * ─── DOIS EFEITOS COLATERAIS QUE QUEM PUBLICA PRECISA SABER ────────────────
 *   · Eventos SINTÉTICOS do React borbulham pela árvore REACT, não pela DOM:
 *     um clique dentro do slot chega aos handlers dos ancestrais da VIEW (o
 *     `main`), nunca aos do SessionFrame. É o comportamento documentado de
 *     `createPortal` — e é o que mantém a view dona dos handlers.
 *   · O slot mora DENTRO do `<AppBar>` (o `<header>` que é o banner da
 *     página). Conteúdo publicado NUNCA pode trazer outro `<header>` ou
 *     `role="banner"`: fora do `main`, um segundo `<header>` vira um SEGUNDO
 *     landmark banner e quebra o `getByRole('banner')` dos e2e (strict mode do
 *     Playwright). Use `<section aria-labelledby>` — ver LessonSidebarHeader.
 *
 * ─── SSR-SAFE ──────────────────────────────────────────────────────────────
 * No servidor (os testes desta base são `react-dom/server`, sem jsdom) callback
 * ref nunca roda: o contexto fica `null` e o portal renderiza NADA — nunca
 * lança (o renderizador de servidor não suporta portais, então chamar
 * `createPortal` ali derrubaria o `renderToString`). No cliente, o primeiro
 * render também vê `null`; o ref do slot dispara no commit, o estado do shell
 * recebe o nó e o render seguinte já pinta o conteúdo na coluna.
 *
 * Testado em tests/shellSidebarSlot.test.ts (SSR do portal sem slot, fiação do
 * contexto e guardas de fonte de App.tsx/SessionFrame.tsx).
 */
import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Id ESTÁVEL do contêiner-slot no SessionFrame (útil para CSS/e2e/depuração;
 * a publicação em si NÃO usa o id — ela usa o nó vindo do contexto, que é o
 * que garante que o portal só existe quando o slot está montado).
 */
export const SHELL_SIDEBAR_SLOT_ID = 'shell-sidebar-view-slot';

/**
 * O nó DOM do slot, publicado pelo shell. `null` enquanto o SessionFrame não
 * montou (primeiro render do cliente), no SSR e fora do shell (testes que
 * montam uma view isolada) — em todos esses casos o portal não renderiza nada.
 */
export const ShellSidebarSlotContext = createContext<HTMLElement | null>(null);

/** O nó do slot do sidebar, ou `null` quando ele (ainda) não existe. */
export function useShellSidebarSlot(): HTMLElement | null {
  return useContext(ShellSidebarSlotContext);
}

/**
 * Publica `children` no slot do sidebar do shell. A view ativa embrulha nele o
 * conteúdo que deve aparecer na coluna; ao desmontar a view (troca de aba) o
 * conteúdo some da coluna sozinho. Sem slot → `null` (SSR-safe: nada é
 * renderizado e nada lança).
 */
export function ShellSidebarPortal({ children }: { children: ReactNode }): ReactElement | null {
  const slot = useShellSidebarSlot();
  if (slot === null) return null;
  return createPortal(children, slot);
}
