/**
 * app/electron/main/engine/quality/minimalC.ts — o SINTETIZADOR DETERMINÍSTICO
 * de solução mínima de C (zero LLM).
 *
 * É o terceiro arquivo que o cabeçalho de `quality/minimal.ts` prometeu: "um
 * sintetizador de código mínimo de Python não é este arquivo com um parâmetro
 * a mais — é outro arquivo, com `def`, indentação significativa e outra tabela
 * de literais". C tem uma TERCEIRA estrutura de teste (o counter_protocol,
 * `docs/build-spec/blocks/03-tdd.md` §3.9.3) e uma terceira gramática de
 * literal — e por isso tem o seu próprio arquivo, no mesmo padrão dos irmãos
 * `minimal.ts` (JavaScript) e `minimalPython.ts` (Python):
 *
 *   - MESMA PERGUNTA: qual é o MENOR código que SATISFAZ os requirements do
 *     desafio e passa nos testes? O `coverage` compara os átomos desse mínimo
 *     com o orçamento da aula — 0 lacunas significa "todo átomo exigido
 *     aparece no mínimo de algum desafio".
 *   - MESMA DISCIPLINA FAIL-CLOSED (docs/16 §9.3): teste que não parseia →
 *     `PARSE_FALHOU`; prover com falha de INFRA em todas as tentativas →
 *     `PROVER_FALHOU`; nenhum candidato passa → `SEM_SOLUCAO_ACESSIVEL`.
 *     "Não sintetizei" é RESULTADO, nunca erro de infra nem veredito falso.
 *   - MESMO PROVER: cada candidato roda pelo `ProverDeDesafio` injetado — as
 *     provas de execução OFICIAIS (`verifyChallengeProofs`, com o `run.sh`
 *     gerado pelo adaptador: `cc -std=c11 -g … -o runner -lm`). Nada aqui
 *     inventa runner: COMPILAR é o typecheck de C, e é o que o runner já faz.
 *
 * ─── O ESPAÇO DE GERAÇÃO É PEQUENO, E ISSO É PROJETO ───────────────────────
 *
 * O envelope do teste C é FIXO (counter_protocol): TU sem `main` (o main é do
 * harness gerado), cenários `SM_TEST(<slug>)`, verificações
 * `checa_int/checa_long/checa_double/checa_char/checa_str` — helpers STATIC do
 * PRÓPRIO `sm_harness.h`. O testsCode DECLARA o que exercita: o PROTÓTIPO de
 * cada função do aluno vem no topo. Isso reduz o espaço do mínimo a:
 *
 *   1. IMPRIMIR  — função que a prova compara por stdout capturado
 *                  (`freopen` + `fgets` + `checa_str`): o mínimo é o corpo que
 *                  imprime, EM ORDEM, exatamente os literais esperados — um
 *                  `printf` único (literais adjacentes, a concatenação de C) e
 *                  depois um `printf` por literal. SEM dedup: a janela de três
 *                  linhas tem borda de cima e de baixo IGUAIS — dedupiar
 *                  apagaria a borda final e o mínimo falharia no teste que o
 *                  define.
 *   2. ECO       — `return <param>;` quando o teste devolve o próprio
 *                  argumento (`checa_int("x", f(n), n, …)`).
 *   3. LITERAL   — `return <literal>;` (até 3 literais distintos, na ordem do
 *                  código do teste — o análogo exato do lado JavaScript).
 *   4. SOLUÇÃO   — a solução de referência, SEMPRE como ÚLTIMO candidato
 *                  quando a forma é reconhecida (mesma decisão medida da onda
 *                  4 do Python: na fase VALOR com ≥2 casos distintos nenhum
 *                  literal passa — `return 4;` falha no caso que espera 10 — e
 *                  sem a referência TODO desafio que exige computação de
 *                  verdade sairia `SEM_SOLUCAO_ACESSIVEL`, reprovando o
 *                  coverage fail-closed da fase inteira. Teste fraco ainda
 *                  acha o literal como mínimo; teste que exige computação acha
 *                  a referência — nada menor passa).
 *
 * Numa forma NÃO reconhecida (teste sem protótipo de função do aluno e sem
 * `checa_*`) a solução de referência NÃO entra: ela seria aceita pelas provas
 * e viraria um "mínimo" que na verdade é o máximo, inflando os átomos e
 * podendo inventar LACUNA onde não há — o mesmo partido dos irmãos.
 *
 * ─── O QUE ELE NÃO SINTETIZA (limite DECLARADO, não omissão) ───────────────
 *
 * Não sintetiza COMPUTAÇÃO: laço, vetor, struct, saída por parâmetro
 * (`&min`/`&max` do M5), string construída. Para essa classe o único
 * candidato que passa é a solução de referência (o que ainda é uma medição
 * honesta — o mínimo EMPATADO com o máximo diz "o teste cobra tudo o que a
 * solução faz"); se nem a referência passar (desafio multi-arquivo, teste
 * quebrado), o veredito é `SEM_SOLUCAO_ACESSIVEL` e o desafio entra no placar
 * como NÃO MEDIDO — nunca como aprovado por omissão.
 *
 * ─── COMPILAÇÃO EM DIR TEMPORÁRIO, SEM ESCRITA FORA DA WORKTREE ────────────
 * O candidato não é escrito por este módulo: ele viaja como `solutionCode` ao
 * prover, que o entrega ao layout do adaptador (que escreve os arquivos num
 * `mkdtemp` do executor endurecido e remove no fim). Este módulo não toca
 * disco.
 *
 * ─── FACHADA (refatoração L04: arquivo ≤500 linhas e toda função CC≤8) ─────
 *
 * Este caminho público continua o contrato estável dos consumidores; a
 * implementação é re-exportada de quatro módulos irmãos, sem mudança de
 * comportamento:
 *
 *   - `minimalCTipos.ts`     — tabelas do counter_protocol, tipos e stub vazio;
 *   - `minimalCLeitura.ts`   — leitura do testsCode (protótipos + `checa_*`);
 *   - `minimalCCandidatos.ts` — candidatos na ordem de minimalidade (com dedupe);
 *   - `minimalCSintese.ts`   — o map-reduce contra o prover (fail-closed).
 */

export * from './minimalCTipos';
export * from './minimalCLeitura';
export * from './minimalCCandidatos';
export * from './minimalCSintese';
