/**
 * app/electron/main/engine/quality/minimalPython.ts — o SINTETIZADOR
 * DETERMINÍSTICO de solução mínima de PYTHON (zero LLM).
 *
 * É o arquivo que o cabeçalho de `quality/minimal.ts` mandou escrever:
 *
 *   "Um sintetizador de código mínimo de Python não é este arquivo com um
 *    parâmetro a mais — é outro arquivo, com `def`, indentação significativa e
 *    outra tabela de literais."
 *
 * Aqui está ele. Mesma PERGUNTA do irmão de JavaScript ("qual é o menor código
 * que o teste aceita?"), mesma disciplina FAIL-CLOSED, mesma ordem de
 * minimalidade — e nenhuma linha de JavaScript gerada.
 *
 * ─── POR QUE ELE EXISTIA COMO BURACO (o defeito MEDIDO) ────────────────────
 *
 * `npx tsx tools/track-engine/cli.ts coverage python` em `main@26dbc19`
 * imprimia `parse-falhou` nos 21 desafios da trilha real, com a mensagem
 * "testsCode não parseia como JavaScript" — porque a única trilha do produto é
 * Python e o sintetizador lia o teste com `ts.createSourceFile`. O placar
 * "0 lacunas" NÃO significava "nenhuma lacuna": significava "nada foi olhado".
 *
 * ─── AS DUAS FORMAS DE TESTE QUE ESTE MÓDULO RECONHECE ─────────────────────
 *
 * FORMA `stdout` (a que a trilha `python` usa nos 21 desafios). O teste roda o
 * arquivo do aluno do zero e compara TUDO o que ele imprimiu:
 *
 *     def rodar():
 *         saida = io.StringIO()
 *         with contextlib.redirect_stdout(saida):
 *             runpy.run_path("solucao.py")
 *         return saida.getvalue()
 *     ...
 *         self.assertEqual(rodar(), "oi\n")
 *
 *   O menor programa que passa nisso é UM `print` do literal esperado —
 *   `print("oi")` —, o análogo exato do `return <literal>` do lado JavaScript.
 *   Quando o esperado NÃO termina em quebra de linha, o candidato precisa do
 *   `end=""`, que é uma construção A MAIS: por isso ele vem DEPOIS na ordem de
 *   minimalidade, nunca no lugar do primeiro.
 *
 * FORMA `import` (a que a trilha ainda não tem, mas que `docs/17` promete a
 * partir da aula da virada em M4). O teste importa funções do módulo do aluno:
 *
 *     from solucao import somar
 *     ...
 *         self.assertEqual(somar(2, 3), 5)
 *
 *   Aqui o mínimo é `def somar(a, b): return 5` (literal) ou
 *   `def eco(x): return x` (eco), como no irmão de JavaScript.
 *
 * FORMA NÃO RECONHECIDA => `SEM_SOLUCAO_ACESSIVEL` com o motivo escrito. Nunca
 * um veredito de sucesso, nunca um `PARSE_FALHOU` mentiroso.
 *
 * ─── FAIL-CLOSED (docs/16 §9.3) ────────────────────────────────────────────
 *   - teste que não parseia como Python  -> `PARSE_FALHOU` (com linha/coluna)
 *   - prover com falha de INFRA em TODAS as tentativas -> `PROVER_FALHOU`
 *   - nenhum candidato passa / nenhum gerado -> `SEM_SOLUCAO_ACESSIVEL`
 *
 * ─── O QUE ELE NÃO FAZ ─────────────────────────────────────────────────────
 * Não gera PROGRAMA: gera LITERAL. Um teste cuja solução exige computação de
 * verdade (ler entrada, laço, estado) não tem candidato literal que passe — e
 * o veredito `SEM_SOLUCAO_ACESSIVEL` é o sinal correto, não uma falha.
 *
 * ─── FACHADA (refatoração L04: arquivo ≤500 linhas e toda função CC≤8) ─────
 *
 * Este caminho público continua o contrato estável dos consumidores
 * (`quality/requirements.ts`, `minimalPorLinguagem.ts`, testes); a
 * implementação é re-exportada de cinco módulos irmãos, sem mudança de
 * comportamento:
 *
 *   - `minimalPythonTipos.ts`     — tabelas do `unittest`, tipos e stub vazio;
 *   - `minimalPythonLiterais.ts`  — `repr()` decodificado e literal de string;
 *   - `minimalPythonLeitura.ts`   — leitura do teste e do starter (AST adaptador);
 *   - `minimalPythonCandidatos.ts` — candidatos na ordem de minimalidade (dedupe);
 *   - `minimalPythonSintese.ts`   — o map-reduce contra o prover (fail-closed).
 */

export * from './minimalPythonTipos';
export * from './minimalPythonLiterais';
export * from './minimalPythonLeitura';
export * from './minimalPythonCandidatos';
export * from './minimalPythonSintese';
