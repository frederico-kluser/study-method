/**
 * Ambiente do módulo nativo `sherpa-onnx-node` (addon N-API, sem tipagens).
 *
 * O addon é carregado LAZY dentro do utility process de ASR (asrEngineCore),
 * que declara a sua própria interface mínima (`OnlineRecognizer`/`SherpaStream`)
 * e faz o cast. Este `declare module` existe apenas para o TypeScript resolver
 * o import sem erro TS7016 — em runtime o addon é carregado na hora do uso.
 */

declare module 'sherpa-onnx-node';