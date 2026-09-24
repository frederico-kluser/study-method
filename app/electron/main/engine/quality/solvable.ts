/**
 * app/electron/main/engine/quality/solvable.ts — P-19 "Solubilidade: o aluno
 * simulado" (cláusula J3 de `docs/16-engine-de-trilha.md` §9.1).
 *
 * J3 é a prova de que um desafio é JUSTO: "aluno simulado cujo contexto é
 * exatamente o orçamento, k=3, veredito por execução real. Métrica pass^k,
 * não pass-at-k. Ele reporta a primeira construção que faltou."
 *
 * O problema que esta peça resolve é o mais barato de medir e o mais caro de
 * ignorar: **uma taxa de acerto de 0% em muitas tentativas é sinal de tarefa
 * QUEBRADA, não de aluno incapaz.** Um desafio cujo orçamento não contém alguma
 * construção que a solução exige condena TODO aluno — medir isso com um aluno
 * simulado (LLM) que recebe SOMENTE o orçamento é o jeito de pegar o defeito
 * antes de entregar a trilha.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O CONTEXTO DO ALUNO SIMULADO (a regra absurda do plano, verbatim):
 *
 *   "o contexto do aluno simulado é o orçamento e NADA além. Se ele receber
 *    conhecimento a mais, a prova não vale nada."
 *
 * O aluno recebe EXATAMENTE três coisas — nada mais, nada menos:
 *   1. o ENUNCIADO do desafio;
 *   2. o STARTER (o código inicial que ele deve completar);
 *   3. o ORÇAMENTO: a lista literal de construções de linguagem permitidas.
 *
 * O aluno NÃO recebe: a solução de referência, os testes, nem a teoria da
 * aula. Os testes são executados pelo PROVER, fora do alcance do aluno — ele
 * nunca os lê. A prova de que nada vaza é o TESTE DE STRING A-P19-4
 * (`app/tests/engineSolvable.test.ts`): o prompt montado por
 * `montarPromptDoAluno` não contém a solução de referência, nem os testes,
 * nem a teoria — e o TIPO do builder nem aceita esses campos (probe de tipo
 * no teste), tornando o vazamento impossível por construção, não só ausente
 * por acaso.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MÉTRICA — pass^k, NUNCA pass-at-k (A-P19-3):
 *
 * `medirSolubilidade` simula k tentativas INDEPENDENTES (default k=3,
 * configurável). O veredito é pass^k: TODAS as tentativas têm de passar.
 * UMA tentativa que falha entre três DERRUBA a medição — não existe "uma das
 * três acertou, então está bom". Este arquivo NÃO implementa pass-at-k em
 * lugar nenhum: a semântica de aprovação é `taxaDeAcerto === 1` (estrita),
 * e a taxa só alimenta o AVISO de tarefa quebrada. Grep gate A-P19-2: a
 * notação da métrica concorrente (pass + arrobá + k) NÃO aparece em lugar
 * nenhum do pacote — a única forma de aprovação aqui é pass^k estrito.
 *
 * RELATÓRIO DA MEDIÇÃO E O AVISO:
 * `MedicaoSolubilidade.avisoTarefaQuebrada` é true QUANDO a taxa de acerto é
 * 0% — o relatório carrega esse aviso porque 0% em k tentativas é o sinal
 * documentado de TAREFA QUEBRADA (orçamento sem uma construção que a solução
 * exige), e não de aluno incapaz. Acerto entre 0 e 1 (ex.: 2 de 3) falha o
 * pass^k sem o aviso: é sinal de flakiness, não de bloqueio estrutural.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REPORTAR A PRIMEIRA CONSTRUÇÃO QUE FALTOU (A-P19-1, campo
 * `primeiraConstrucaoFaltante: string | null`):
 *
 *   (i)   se o aluno devolveu bloqueado/precisoDe → a primeira construção da
 *         lista dele que NÃO está no orçamento (a mais requisitada; a lista
 *         dele está em ordem de necessidade). Se TODOS os itens que ele pediu
 *         já estão no orçamento, não dá para nomear uma construção faltante
 *         (aluno confuso) → null.
 *   (ii)  se as tentativas falharam SEM bloqueio → diff determinístico:
 *         `extractAtoms(tentativa)` (engine/extract.ts, parser, zero LLM) vs
 *         orçamento; chaves fora do orçamento ordenadas por FREQUÊNCIA entre
 *         as tentativas que falharam com código (descendente) e, no desempate,
 *         por ordem alfabética → primeira. Frequência 1 × 1 com uma única
 *         tentativa falha = ordem alfabética, ainda determinística.
 *   (iii) tentativa que falhou sem código analisável (resposta inválida /
 *         sintaxe quebrada) → null: não dá para culpar uma construção que não
 *         existe no código. A medição falha do mesmo jeito (pass^k é estrito).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FAIL-CLOSED (regra 1 do plano, §9.3):
 *
 * Falha de INFRAESTRUTURA — o transporte de LLM LANGANDO, o prover LANGANDO,
 * ou um veredito do prover com `execError` — é ERRO ESTRUTURADO da medição
 * (`SolubilidadeError` com código estável), NUNCA um veredito falso nem
 * silêncio. Tentativa que FALHOU por mérito (veredito inválido, bloqueado,
 * resposta malformada) NÃO é erro de infra: entra no relatório como tentativa
 * que não passou.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEPENDÊNCIAS E O CONTRATO COM O P-31 (engine/phases/f9Verifier.ts):
 *
 * O P-31 contratou `criarProverDeDesafio → (input) =>
 * Promise<ChallengeProofsVerdict>`. Este módulo NÃO cria o prover — recebe-o
 * pronto em `deps.prover` (o veredito é por EXECUÇÃO REAL via esse prover; nos
 * testes, prover fake). O ponto de fiação quando o P-31 aterrissar:
 *
 *   const prover = criarProverDeDesafio(/* env do harness *!/);
 *   medirSolubilidade({ llm, prover }, ctx, 3);
 *
 * `ChallengeProofsInput`/`ChallengeProofsVerdict` vêm de `engine/exec/proofs.ts`
 * (já existem; são o contrato das quatro provas). A tentativa do aluno entra
 * como `solutionCode`; `solutionFiles` da REFERÊNCIA são descartados (nunca
 * podem chegar ao prover na rodada do aluno — vazariam a solução). Desafios
 * multi-arquivo exigem extensão futura (premissa declarada no handoff).
 *
 * ORÇAMENTO: `ctx.orcamento` é a lista LITERAL de chaves permitidas que vai ao
 * prompt do aluno. A medição não interpreta faixas (receptivo/produtivo) — o
 * chamador passa a lista que define o vocabulário de escrita do aluno
 * (convenção: o orçamento PRODUTIVO da aula).
 *
 * ─── JAVASCRIPT-ONLY, E ISSO É DECISÃO (onda 5) ───────────────────────────
 *
 * O prompt do aluno pede um MÓDULO ESM (`solution.mjs` completo, com `export`),
 * a resposta é lida como JavaScript e as construções da tentativa são medidas
 * com `extractAtoms` (AST do TypeScript) para acusar o que saiu do orçamento.
 * Nada disso vale para outra linguagem: o aluno de Python devolveria um arquivo
 * `.py` que o extrator ou rejeita ("não parseia") ou — pior — parseia como
 * JavaScript por acaso e mede as construções erradas, e a medição pass^k viraria
 * 0% com o rótulo TAREFA QUEBRADA sobre um desafio perfeitamente bom.
 *
 * `medirSolubilidade`/`simularAluno` guardam `ctx.language` e LANÇAM
 * `EngineLinguagemError` estruturado em vez de medir errado.
 *
 * ─── FACHADA (refatoração L04: arquivo ≤500 linhas e toda função CC≤8) ─────
 *
 * Este caminho público continua o contrato estável dos consumidores; a
 * implementação é re-exportada de três módulos irmãos, sem mudança de
 * comportamento:
 *
 *   - `solvableTipos.ts`  — constantes, `SolubilidadeError` e os contratos;
 *   - `solvableAluno.ts`  — o prompt do aluno e o parse fail-closed da resposta;
 *   - `solvableMedicao.ts` — a tentativa, o diff determinístico e o pass^k.
 */

export * from './solvableTipos';
export * from './solvableAluno';
export * from './solvableMedicao';
