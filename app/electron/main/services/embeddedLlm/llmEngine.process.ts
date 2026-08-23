/**
 * electron/main/services/embeddedLlm/llmEngine.process.ts — PROCESSO UTILITY DO LLM LOCAL.
 *
 * ⚠️ PLACEHOLDER DE ONDA (scaffold / onda 1). O electron.vite.config.ts (congelado
 * no PREP) lista este path como entrada do build de `main`; sem este arquivo o
 * `electron-vite build` falha ("Could not resolve entry module"). Para o build
 * passar na onda 1, criamos um processo utility MÍNIMO que não faz nada além de
 * existir e aguardar mensagens.
 *
 * A onda de LLM local (local-ai / node-llama-cpp) SUBSTITUI este arquivo pelo
 * processo real (engine utilitário gerenciado pelo LlmProxyService, com os
 * canais localAi:* e o download/progress). NÃO estender este stub: ele é de vida
 * curta e o merge final fica com a implementação da onda local-ai.
 */
if (typeof process.send !== 'function') {
  // Rodado standalone (fora de um pai) — imita o vizinho, apenas aguarda.
  process.on('exit', () => process.exit(0));
}

process.on('message', (_msg: unknown) => {
  // Placeholder: nenhum protocolo de mensagem definido até a onda local-ai.
});

process.on('disconnect', () => {
  process.exit(0);
});