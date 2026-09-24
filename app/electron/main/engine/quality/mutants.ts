/**
 * app/electron/main/engine/quality/mutants.ts — o GERADOR DE MUTANTES (pacote
 * P-20, "Mutantes e taxa de falso-passe do revisor", onda 2B do plano de
 * execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6.6 (a métrica que
 * governa o laço é a **taxa de falso-passe medida contra mutantes
 * injetados**; um revisor que marca falha como passe a uma taxa ≥ (1−τ)/2 —
 * 0,45 com τ=0,10 — nunca remove nada, com qualquer número de rodadas ou
 * amostras: mais rodadas não salvam, mais amostras não salvam, e o veredito
 * agregado não denuncia) e §9.2 (o placar inclui a taxa de falso-passe do
 * revisor contra mutantes).
 *
 * O QUE ESTE MÓDULO FAZ: para um ARTEFATO VÁLIDO de desafio (fixture em
 * memória — zero IO, zero rede, zero LLM), injeta defeitos CONHECIDOS, UM por
 * mutante, nas quatro classes:
 *
 *   (a) `fora_do_orcamento` — a `solutionCode` passa a usar uma construção
 *       cuja chave de átomo NÃO está em `requires` (construção usada sem ter
 *       sido ensinada — o desafio não cabe no orçamento da aula);
 *   (b) `teste_divergente_do_enunciado` — o `testsCode` assere o OPOSTO do
 *       que o enunciado pede (a bijeção enunciado ↔ teste, J4, quebrada);
 *   (c) `imprime_em_vez_de_retornar` — a solução imprime no console em vez
 *       de retornar o valor (o modo de falha nº 1 medido, §10), e o
 *       `outputChannel` vai para `impressao`. UM defeito só: o ORÇAMENTO do
 *       mutante (c) declara os átomos do canal de impressão
 *       (`ATOMS_DO_CANAL_DE_IMPRESSAO` = `global:console`, `api:console.log`
 *       e `node:ExpressionStatement` — somados ao `requires` da base no
 *       próprio artefato mutado); usar console no mutante (c) NÃO é o defeito
 *       (a) de orçamento — o canal faz parte do escopo declarado do mutante;
 *   (d) `nao_exercita_a_aula` — a solução NÃO usa nenhuma construção de
 *       `introducesProductive` (A6/C5: o desafio não exercita a construção
 *       nova da aula), sem vazar para fora do orçamento — o defeito é UNO.
 *
 * Cada mutante carrega o RÓTULO da classe (`classe`, o enum fechado), o
 * DEFEITO EXATO injetado (`defeito`, texto legível para o relatório) e um
 * `marcador` (trecho distintivo presente no artefato mutado) — a régua que a
 * medição (`judgeCalibration.ts`) confronta com a revisão do revisor.
 *
 * O gerador é FAIL-CLOSED por construção: `gerarMutantes` valida a base
 * (schema do desafio) e valida CADA mutante gerado — o artefato mutado tem
 * de (1) continuar passando no `ChallengeDraftSchema`, (2) diferir do válido
 * EXATAMENTE nos campos da sua classe (um defeito por mutante; para a classe
 * (c), `solutionCode` + `outputChannel` + `requires` — o `requires` cresce
 * com os átomos do canal declarados na própria mutação, nunca um segundo
 * defeito) e (3) carregar a propriedade verificável por parser
 * (`extractAtoms` sobre o código mutado) que o torna detectável em
 * princípio — inclusive, para as classes (a)/(c)/(d), que as chaves da
 * solução mutada fiquem DENTRO do orçamento declarado do mutante. Um
 * mutante que não satisfaça isso é um ERRO do gerador — nunca um mutante
 * silencioso (um mutante que não muda nada mediria a complacência do revisor
 * contra um alvo que não existe) nem um mutante de classe errada/dupla
 * (um mutante (c) cuja solução vaze do orçamento carregaria o defeito da
 * classe (a) — a medição por classe deixaria de ser limpa).
 *
 * O QUE ESTE MÓDULO NÃO FAZ: não julga (a medição e a decisão vivem em
 * `judgeCalibration.ts`), não chama LLM, não lê trilha real, não escreve em
 * disco. Tudo aqui é função pura.
 *
 * ─── JAVASCRIPT-ONLY, E ISSO É DECISÃO (onda 5) ───────────────────────────
 *
 * A fixture e as quatro mutações são TEXTO DE JAVASCRIPT LITERAL: `export
 * function ehPar(n) { return n % 2 === 0; }`, `console.log(...)` como canal de
 * impressão, `import { test } from 'node:test'` no arquivo de teste. O defeito
 * injetado por cada mutante é PROVADO por parser (`chavesDe` → `extractAtoms`,
 * que é do AST do TypeScript). Um gerador de mutantes de Python não é este
 * arquivo parametrizado — é outra fixture e outras quatro mutações.
 *
 * Rodá-lo sobre um desafio de outra linguagem falharia no lugar errado (o
 * `extractAtoms` do texto mutado) e com a mensagem errada ("código com sintaxe
 * inválida"), sugerindo defeito no CONTEÚDO quando o defeito é de FERRAMENTA.
 * Por isso as três entradas públicas guardam a linguagem DO DESAFIO
 * (`desafio.language`, o campo que o `ChallengeDraftSchema` passou a carregar)
 * e LANÇAM `EngineLinguagemError` estruturado.
 *
 * ─── FACHADA (refatoração L04: arquivo ≤500 linhas e toda função CC≤8) ─────
 *
 * Este caminho público continua o contrato estável dos consumidores; a
 * implementação é re-exportada de cinco módulos irmãos, sem mudança de
 * comportamento:
 *
 *   - `mutantsTipos.ts`     — classes de defeito, `Desafio`, `Mutante`;
 *   - `mutantsSuporte.ts`   — prova por parser, guarda JS-only e a fixture válida;
 *   - `mutantsMutacoes.ts`  — as quatro mutações puras (M1..M4);
 *   - `mutantsValidacao.ts` — a validação fail-closed do gerador;
 *   - `mutantsGeracao.ts`   — `gerarMutantes` e a porta única `rodaMutante`.
 */

export * from './mutantsTipos';
export * from './mutantsSuporte';
export * from './mutantsMutacoes';
export * from './mutantsValidacao';
export * from './mutantsGeracao';
