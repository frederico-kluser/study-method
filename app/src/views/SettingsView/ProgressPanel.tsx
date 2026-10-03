/**
 * src/views/SettingsView/ProgressPanel.tsx — LIMPAR DADOS DE AVANÇO (onda1-nav-ui).
 *
 * Pedido do dono: "quero um botão pra limpar todos os dados de avanço". Este
 * painel (seção na Settings) apaga o PROGRESSO do aluno no banco SQL via
 * `api.study.clearProgress()` (canal `study:clear-progress` → repo
 * `clearAllProgress`): tentativas de desafio, lições concluídas de trilha,
 * proficiência, desafios regenerados e contadores legados. O CONTEÚDO
 * (currículo das trilhas, configurações, chaves) NUNCA é apagado.
 *
 * STATE/VIEW (STORY-SPEC §5): este ficheiro é o CONTAINER — só liga o hook de
 * estado à view pura e mantém o export público que o App/SettingsView usa.
 *   - estado + IPC + decisões → `useProgressPanel.ts` (testável sem jsdom);
 *   - JSX/props           → `ProgressPanelView.tsx` (histórias + SSR tests).
 *
 * Segurança: ação destrutiva SEMPRE passa por diálogo de CONFIRMAÇÃO (W18: o
 * foco inicial é do "Cancelar") — um clique acidental não limpa nada. Feedback
 * honesto depois: Alert de sucesso ("dados de avanço apagados") ou de erro
 * (falha/timeout/canal mudo — com withTimeout, o estado `busy` nunca fica
 * preso).
 *
 * Nenhuma view acessa `window` diretamente — só `getApi()` (testável sem jsdom).
 */
import type { ReactElement } from 'react';
import { ProgressPanelView } from './ProgressPanelView';
import { useProgressPanel } from './useProgressPanel';

export function ProgressPanel(): ReactElement {
  return <ProgressPanelView {...useProgressPanel()} />;
}
