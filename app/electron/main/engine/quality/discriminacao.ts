/**
 * app/electron/main/engine/quality/discriminacao.ts — A CLÁUSULA J5
 * (Discriminação) de `docs/16-engine-de-trilha.md` §9.1, especificada desde o
 * começo e nunca implementada. Zero LLM, PURO, determinístico.
 *
 * ─── A PERGUNTA QUE ESTE MÓDULO RESPONDE ──────────────────────────────────
 *
 * O `audit` já responde "o desafio EXERCITA o que a aula ensinou?" — é a regra
 * A6 (`engine/audit.ts:560-578`), e ela olha a SOLUÇÃO DE REFERÊNCIA. Este
 * módulo responde a outra, que ninguém verificava:
 *
 *     "o TESTE DISCRIMINA? Ele DERRUBA quem não usou a construção da aula?"
 *
 * São perguntas diferentes e a diferença é MEDIDA. Na trilha `python` de
 * `main@26dbc19`, `coverage` (depois de enxergar Python) deu 21 de 21 desafios
 * medidos, ZERO lacunas — nenhum desafio cobra o que a aula não ensinou, que é
 * a garantia que o dono pediu e ela está satisfeita — e 29 EXCESSOS. Os 29
 * excessos são um número, não uma explicação. A explicação é esta:
 *
 *     o código mínimo que passa em CADA um dos 21 desafios é um único
 *     `print("<saída esperada>")`.
 *
 * Todo teste da trilha compara stdout por igualdade e nenhum força a construção
 * que a aula ensinou. A aula de potência não exige `**`; a de f-string não
 * exige f-string; a de variável não exige atribuição. **Um aluno passa nos 21
 * desafios imprimindo literais.** O `audit` fica verde porque a SOLUÇÃO usa a
 * construção — e usa mesmo. O que falha é o teste, não a solução.
 *
 * ─── A PROVA ESTÁTICA (o que este módulo calcula) ─────────────────────────
 *
 * Para cada desafio, com `alvos = introduces.productive` da aula:
 *
 *     alvosNaSolucao     = alvos ∩ atoms(solutionCode)
 *     discriminados      = alvosNaSolucao ∩ atoms(minimalCode)
 *     naoDiscriminados   = alvosNaSolucao ∖ atoms(minimalCode)
 *
 * `naoDiscriminados ≠ ∅` ⇒ **o teste não discrimina**: a construção-alvo está
 * na solução E o menor código que o teste aceita NÃO a contém.
 *
 * A interseção com a solução é o que separa esta medida do `excesso` do
 * `coverage` (`introduces.productive ∖ atoms(minimal)`, sem olhar a solução).
 * `naoDiscriminados ⊆ excesso` sempre; o excesso que NÃO é falta de
 * discriminação é outra coisa — átomo declarado no `introduces` que nem a
 * solução usa, que é assunto de A6/J2, não de J5.
 *
 * ─── CLASSIFICAÇÃO: AVISO COM CONTAGEM, NUNCA VIOLAÇÃO ────────────────────
 *
 * DECISÃO DE PROJETO, congelada no tipo (`classificacao: 'aviso'` é literal, não
 * parâmetro). O repositório já separa `avisos` de `violações` no placar
 * (`app/tools/track-engine/cli.ts:270-275` conta os dois em separado,
 * justamente porque "chamar tudo de violação mentiria"). Transformar falta de
 * discriminação em reprovação pintaria o gate de vermelho em 17 das 20 aulas da
 * única trilha do produto sem decisão do dono. MEDIDO com o mesmo pipeline do
 * `coverage` — `loadTrack` → `deriveTrackBudget` →
 * `sintetizarCodigoMinimoDaLinguagem` → `avaliarDiscriminacao` sobre
 * `resources/tracks/python` — lendo `placar.aulasComAlvoNaoDiscriminado` (17)
 * sobre `placar.aulasMedidas` (20); `avaliarDiscriminacao` ainda NÃO está
 * ligada ao CLI, então essas duas contagens não saem de
 * `npm run engine -- coverage python`, que reproduz só o 21/21/29 do
 * parágrafo acima. Este módulo **MEDE e DECLARA**; quem decide reprovar é o
 * dono do produto, e no dia em que decidir a mudança é no chamador, não aqui.
 *
 * Por isso também NÃO existe função `reprovar()` nem exit code neste arquivo:
 * ele devolve relatório.
 *
 * ─── FAIL-CLOSED (docs/16 §9.3) ───────────────────────────────────────────
 *
 * Desafio cujo mínimo NÃO foi provado (`MinimalVerdict` não-ok) sai como
 * `nao-medido`, entra no contador `naoMedidos` e NUNCA como `discrimina`.
 * "Não olhei" jamais é contado como "está certo" — foi exatamente esse degrau
 * que deixou `coverage` sair 0 sobre 21 `parse-falhou` até `main@26dbc19`.
 * Solução que não parseia na linguagem da trilha idem: `nao-medido`, com o
 * motivo escrito.
 *
 * ─── O QUE ELE NÃO FAZ ────────────────────────────────────────────────────
 *
 * Não gera mutantes nem roda teste nenhum: a prova é ESTÁTICA, sobre conjuntos
 * de átomos que outros módulos já produziram. A parte executável da J5 ("cada
 * solução errada catalogada falha em ≥1 teste; nenhum par falha no mesmo
 * conjunto") é `quality/mutants.ts` e continua sendo dele. Não sintetiza o
 * mínimo: recebe o `MinimalVerdict` pronto de
 * `quality/minimalPorLinguagem.ts` — uma extração só, `docs/16` §5.3 ("se dois
 * estágios parseiam com opções diferentes, o gate vira loteria").
 * Não reescreve desafio, teste nem aula.
 *
 * ─── FACHADA (refatoração L04: arquivo ≤500 linhas e toda função CC≤8) ─────
 *
 * Este caminho público continua o contrato estável dos consumidores (o CLI do
 * track-engine e os testes); a implementação é re-exportada de três módulos
 * irmãos, sem mudança de comportamento:
 *
 *   - `discriminacaoTipos.ts`     — entradas, vereditos, placar e relatório;
 *   - `discriminacaoAvaliacao.ts` — a avaliação de UM desafio (prova estática);
 *   - `discriminacaoRelatorio.ts` — placar, limitações declaradas e linhas.
 */

export * from './discriminacaoTipos';
export * from './discriminacaoAvaliacao';
export * from './discriminacaoRelatorio';
