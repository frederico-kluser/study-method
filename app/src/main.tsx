/**
 * src/main.tsx — ponto de entrada do renderer React.
 *
 * A raiz monta o <AppGate> (onda 6 — gate de início), que envolve o <App/>:
 * valida as chaves DeepSeek/Brave no main antes de liberar a UI (setup
 * obrigatório quando faltam/invalidam; modo offline com aviso quando ambas
 * falham por rede). AppGate renderiza <App/> internamente nas fases liberadas.
 *
 * I18N (onda 6 — SEAM): o onda6-i18n-core criou src/i18n (initI18n, LanguageSwitcher)
 * em OUTRA worktree, ainda NÃO mergeado nesta árvore. Aqui chamamos o initI18n
 * ANTES de montar o React via IMPORT DINÂMICO OPCIONAL com try/catch: quando o
 * i18n mergear, o caminho resolve e o idioma é inicializado; enquanto não, nada
 * quebra (o gate usa tSafe com fallbacks pt-BR). NÃO importar src/i18n estaticamente.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppGate } from './gate/AppGate';
import './index.css';

const rootElement = document.getElementById('root');

/**
 * Inicializa o i18n (se disponível nesta árvore) antes da primeira renderização.
 * Import dinâmico SEAM — resolvido em runtime após o merge do i18n-core.
 */
async function bootstrap(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  await import('../i18n')
    .then((m) => m.initI18n?.())
    .catch(() => {
      /* src/i18n ainda não existe nesta árvore — o gate segue com tSafe/fallbacks. */
    });

  if (!rootElement) {
    throw new Error('root #root não encontrado');
  }
  createRoot(rootElement).render(
    <StrictMode>
      <AppGate />
    </StrictMode>,
  );
}

void bootstrap();