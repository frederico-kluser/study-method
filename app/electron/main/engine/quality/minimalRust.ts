/**
 * app/electron/main/engine/quality/minimalRust.ts — o SINTETIZADOR
 * DETERMINÍSTICO de solução mínima de RUST (zero LLM).
 *
 * É o arquivo que o cabeçalho de `quality/minimal.ts` mandou escrever para
 * cada linguagem — o terceiro da fila, depois de `minimal.ts` (JavaScript) e
 * `minimalPython.ts`. Mesma PERGUNTA ("qual é o menor código que o teste
 * aceita?"), mesma disciplina FAIL-CLOSED, mesma ordem de minimalidade — e
 * nenhuma linha que não compile em Rust gerada.
 *
 * ─── POR QUE RUST É OUTRO ARQUIVO (e onde ele é MAIS simples) ──────────────
 *
 * Python precisou de duas formas de teste (`stdout` × `import`) porque a
 * trilha roda o arquivo do aluno de cima a baixo. Rust NÃO TEM a forma
 * `stdout`: o aluno escreve uma CRATE (`src/lib.rs`), e o teste de integração
 * (`tests/desafio.rs`) importa dela — `use desafio::dobro;`. A forma é
 * sempre `import`, e isso simplifica: não existe captura de stdout para
 * sintetizar (um `println!` no lib.rs do aluno não é a saída do teste).
 *
 * E há uma diferença que trabalha a NOSSO favor: em Rust a ASSINATURA é
 * obrigatória e o starter a traz completa (`pub fn soma(a: i32, b: i32) ->
 * i32`). O candidato mínimo não precisa INFERIR tipos — é a assinatura do
 * starter com o CORPO trocado pelo literal esperado:
 *
 *     pub fn soma(a: i32, b: i32) -> i32 { 5 }
 *
 * (em Python o análogo era `def soma(a, b): return 5` — sem tipos para
 * preservar). Quando a função-alvo NÃO está no starter, aí sim um tipo é
 * inferido do literal do assert — e SÓ para literais escalares; o que não é
 * escalar não gera candidato (a referência de referência fecha).
 *
 * ─── A ORDEM DE MINIMALIDADE, E A SOLUÇÃO DE REFERÊNCIA POR ÚLTIMO ─────────
 *
 *   1. ECO      — a assinatura com o corpo `parametro` (o teste devolve o
 *                 próprio argumento)
 *   2. LITERAL  — a assinatura com o corpo `<esperado>` (até 3 literais
 *                 distintos, na ordem do código do teste)
 *   3. SOLUÇÃO  — a solução de referência inteira, SEMPRE por último quando
 *                 a forma é reconhecida. É o conserto do defeito §3.1 item 2
 *                 de `docs/18-estado-da-fabricacao-dos-cursos.md` (medido no
 *                 Python e portado aqui SEM adaptação): um teste com ≥2
 *                 casos divergentes nunca é satisfeito por literal — `pub fn
 *                 dobro(x: i32) -> i32 { 4 }` falha no caso que espera −6 —
 *                 e, sem a referência, TODO desafio que exige computação de
 *                 verdade saía `SEM_SOLUCAO_ACESSIVEL`, reprovando o
 *                 `coverage` (fail-closed) da fase inteira. O literal
 *                 continua ANTES na ordem de minimalidade: teste fraco (um
 *                 caso só) ainda acha o literal como mínimo e expõe o
 *                 EXCESSO; teste que exige computação acha a referência —
 *                 nada menor passa. Numa forma DESCONHECIDA a referência
 *                 NÃO entra: ela viraria um "mínimo" que na verdade é o
 *                 máximo (ver `minimalPython.ts:498-510`).
 *
 * ─── FAIL-CLOSED (docs/16 §9.3, o mesmo do irmão de Python) ───────────────
 *   - teste que não parseia como Rust      → `PARSE_FALHOU` (linha/coluna)
 *   - prover com falha de INFRA em TODAS   → `PROVER_FALHOU`
 *   - nenhum candidato passa / nenhum gerado → `SEM_SOLUCAO_ACESSIVEL`
 *
 * ─── FACHADA (refatoração L04: arquivo ≤500 linhas e toda função CC≤8) ─────
 *
 * Este caminho público continua o contrato estável dos consumidores; a
 * implementação é re-exportada de quatro módulos irmãos, sem mudança de
 * comportamento:
 *
 *   - `minimalRustTipos.ts`     — constantes e tipos do contrato;
 *   - `minimalRustLeitura.ts`   — leitura do teste e do starter (AST do adaptador);
 *   - `minimalRustCandidatos.ts` — candidatos na ordem de minimalidade (com dedupe);
 *   - `minimalRustSintese.ts`   — o map-reduce contra o prover (fail-closed).
 */

export * from './minimalRustTipos';
export * from './minimalRustLeitura';
export * from './minimalRustCandidatos';
export * from './minimalRustSintese';
