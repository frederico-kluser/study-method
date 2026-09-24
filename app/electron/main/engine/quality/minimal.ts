/**
 * app/electron/main/engine/quality/minimal.ts — o SINTETIZADOR DETERMINÍSTICO
 * de solução mínima (zero LLM).
 *
 * Problema real: o dono do produto quer saber O QUE o teste de um desafio
 * REALMENTE cobra — não o que a solução de referência faz, não o que a aula
 * diz que ensina, mas o MÍNIMO de código que passa no teste. Com isso em mãos
 * dá para decidir, por diferença de conjuntos, se a aula precisa ser mais
 * quebrada (o teste exige construção que a aula não oferece) ou se a aula
 * oferece mais do que o teste cobra.
 *
 * Este arquivo NÃO é um sintetizador de programas: é um sintetizador de
 * LITERAIS. Ele lê o teste (AST TypeScript), extrai os valores literais que o
 * teste compara com o retorno das funções, e gera candidatos de solução
 * mínima na ordem de minimalidade — o primeiro que passa nas QUATRO PROVAS
 * reais (`verifyChallengeProofs`, via o `ProverDeDesafio` injetado) vence.
 * Um teste cuja solução exige COMPUTAÇÃO (somar dois parâmetros, um loop, uma
 * atribuição com estado) NÃO tem candidato literal que passe — o veredito é
 * `SEM_SOLUCAO_ACESSIVEL`: o sinal exato que o dono quer ver ("o teste exige
 * mais que literais"), nunca um veredito falso.
 *
 * POR QUE NÃO O ALUNO SIMULADO (`solvable.ts`): aquele é o aluno LLM com
 * pass^k, NÃO determinístico por construção (o LLM é o ponto de variação).
 * Este módulo é o espelho DETERMINÍSTICO: mesmos testes, mesma solução
 * mínima, sempre. Onde o aluno simulado responde "o aluno consegue?", este
 * responde "qual é o menor código que o teste aceita?".
 *
 * FAIL-CLOSED (regra 1 do plano): nenhum caminho devolve veredito falso.
 *   - teste que não parseia        → `PARSE_FALHOU`
 *   - prover com falha de INFRA em TODAS as tentativas → `PROVER_FALHOU`
 *   - nenhum candidato passa       → `SEM_SOLUCAO_ACESSIVEL` (sinal de teste
 *     quebrado OU de solução que exige mais que literais — os dois são
 *     defeito/limite que o chamador precisa ver, não esconder)
 *   - nenhum candidato gerado      → `SEM_SOLUCAO_ACESSIVEL` (com detalhe)
 *
 * LIMITES DECLARADOS (determinismo acima de tudo):
 *   - a geração de candidatos é sobre a PRIMEIRA função-alvo no starter
 *     (ordem de aparição); desafios multi-função ficam para a poda da solução
 *     de referência (último recurso);
 *   - `atoms` é o que o aluno PRECISA escrever (o código mínimo); `atomsDoTeste`
 *     é o enriquecimento com os átomos do trecho do teste que chama a função —
 *     separados de propósito: a comparação com o orçamento da aula usa `atoms`.
 *
 * ─── JAVASCRIPT-ONLY, E ISSO É DECISÃO, NÃO OMISSÃO (onda 5) ──────────────
 *
 * Este módulo NÃO foi parametrizado por linguagem, e não deve ser: ele GERA
 * TEXTO DE JAVASCRIPT LITERAL (`export function ${nome}(${params}) {\n  return
 * ${literal};\n}`), lê o teste com `ts.createSourceFile` e serializa literais
 * com a sintaxe de objeto/array do JavaScript. Um sintetizador de código
 * mínimo de Python não é este arquivo com um parâmetro a mais — é outro
 * arquivo, com `def`, indentação significativa e outra tabela de literais.
 * Trocar só o parser produziria candidatos que não compilam na linguagem alvo
 * e um veredito `SEM_SOLUCAO_ACESSIVEL` FALSO — o pior resultado possível,
 * porque ele se parece com um sinal legítimo ("o teste exige mais que
 * literais") quando na verdade é a ferramenta errada.
 *
 * Por isso as quatro entradas públicas têm GUARDA EXPLÍCITA
 * (`exigirAdaptadorJavascript`): pedir a síntese mínima de outra linguagem
 * LANÇA `EngineLinguagemError` — erro estruturado que diz o que falta — em vez
 * de devolver um veredito silenciosamente errado.
 *
 * ─── FACHADA (refatoração L04: arquivo ≤500 linhas e toda função CC≤8) ─────
 *
 * Este caminho público continua o contrato estável dos consumidores
 * (`quality/{minimalPython,minimalRust,minimalC,discriminacao}.ts`,
 * `minimalPorLinguagem.ts`, CLI e testes); a implementação é re-exportada de
 * cinco módulos irmãos, sem mudança de comportamento:
 *
 *   - `minimalBase.ts`       — guarda JS-only, parse fail-closed, utilitários;
 *   - `minimalTipos.ts`      — `MinimalCtx`, `MinimalVerdict`, literais, lote;
 *   - `minimalLiterais.ts`   — extração de literais dos asserts (AST TS);
 *   - `minimalCandidatos.ts` — candidatos na ordem de minimalidade (dedupe);
 *   - `minimalSintese.ts`    — o map-reduce contra o prover e o lote (semáforo).
 */

export * from './minimalBase';
export * from './minimalTipos';
export * from './minimalLiterais';
export * from './minimalCandidatos';
export * from './minimalSintese';

/** Re-export útil para os consumidores (CLI/requisitos) — assinatura conferida. */
export type { AtomKey } from '../atomKeys';
