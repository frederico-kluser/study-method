/**
 * app/electron/main/engine/quality/requirements.ts — DERIVAÇÃO DETERMINÍSTICA
 * de requirements a partir do teste (zero LLM).
 *
 * O dono quer comparar "o que o teste realmente cobra" com "o que a aula
 * oferece" para decidir se a aula precisa ser mais quebrada. Este arquivo é o
 * lado "requirement" dessa conta: para CADA `test('nome', …)` do node:test,
 * extrai os asserts dentro e gera um requirement estruturado
 * `{ id, descricao, teste }` — a descrição em pt-BR DERIVADA do texto real do
 * assert ("a função X deve devolver Y quando chamada com Z"), nunca inventada.
 *
 * Além de derivar, este arquivo VALIDA a bijeção requirements × testes:
 * todo requirement declarado (campo `requirements` do challenge.json) precisa
 * ter um `test('…')` correspondente, e todo `test('…')` precisa ter um
 * requirement declarado. O gap é determinístico — exatamente o que o CLI
 * `requirements` reporta como violação de conteúdo.
 *
 * FAIL-CLOSED: teste que não parseia é erro (lança) — nunca um conjunto vazio
 * silencioso que faria o gate passar por ignorância.
 *
 * LIMITE DECLARADO: `cobertura[].atoms` são os átomos das FUNÇÕES da solução
 * de referência chamadas pelos asserts daquele requirement (o que o aluno
 * precisa ESCREVER para satisfazê-lo). Se a solução não parseia ou a função
 * não é encontrada, cai para os átomos do trecho do assert (o que o teste
 * EXERCE) — determinístico nos dois casos.
 *
 * ─── TRÊS LINGUAGENS, TRÊS DERIVAÇÕES, UM DESPACHANTE (onda 10; C na onda C) ─
 *
 * Até `main@26dbc19` este arquivo era JAVASCRIPT-ONLY, e o cabeçalho defendia
 * a decisão assim: "a derivação lê o teste com `ts.createSourceFile` e
 * reconhece `test('nome', …)` + `assert.*(…)` do `node:test`; em `unittest` o
 * mesmo papel é um método `def test_…(self)` dentro de uma classe, com
 * `self.assertEqual` — outra estrutura, não outro parâmetro". A frase continua
 * VERDADEIRA; o que estava errado era a conclusão de que a segunda estrutura
 * podia não existir.
 *
 * O DEFEITO MEDIDO que isto fecha (`main@26dbc19`, comando abaixo):
 *
 *     cd app && npx tsx tools/track-engine/cli.ts requirements python
 *     → 21/21 `[parse-falhou] … testsCode não parseia — '=' expected.`
 *       PLACAR: 21 desafios · 0 bijeção completa · 21 com gaps · exit 1
 *
 * A única trilha do produto é Python. O `requirements` REPROVAVA os 21
 * desafios dela — corretamente fechado (`docs/16` §9.3: reprovar é melhor que
 * aprovar por omissão), e ainda assim inútil: "21 com gaps · 0 requirements
 * sem teste · 0 testes sem requirement" não é uma medição de conteúdo, é o
 * parser de JavaScript batendo em `def`.
 *
 * A forma do conserto é a MESMA do `coverage` na onda anterior
 * (`quality/minimalPorLinguagem.ts`): uma TABELA EXPLÍCITA por linguagem,
 * fail-closed, sem segunda implementação de extração — `docs/16` §5.3, "se
 * dois estágios parseiam com opções diferentes, o gate vira loteria". As
 * tabelas de asserts do `unittest` NÃO são redigitadas aqui: vêm de
 * `quality/minimalPython.ts` (`ASSERTS_PY`, `ASSERTS_DE_COMPARACAO_PY`), que é
 * quem já as tinha.
 *
 *   javascript → `test('nome', …)` + `assert.*`   (AST do TypeScript)
 *   python     → `def test_…(self)` + `self.assert*` (AST do adaptador Python)
 *   c          → bloco `SM_TEST(<slug>)` + `checa_*(…)` (AST do adaptador C —
 *                ver "A DERIVAÇÃO DE C" em `requirementsC.ts`)
 *
 * Linguagem REGISTRADA mas sem derivação escrita (hoje `typescript`) continua
 * LANÇANDO `EngineLinguagemError`, e linguagem desconhecida continua lançando
 * `LanguageRegistryError` no `getAdapter`. O modo de falha que as duas guardas
 * evitam é o SILENCIOSO: um arquivo de teste que por acaso parseie no parser
 * errado produziria ZERO testes reconhecidos, e `validarRequirements`
 * reportaria "todo requirement declarado está sem teste" — uma violação de
 * CONTEÚDO inventada por defeito de FERRAMENTA.
 *
 * ─── O QUE A DERIVAÇÃO DE PYTHON NÃO FAZ, E POR QUÊ ───────────────────────
 *
 * Na forma `stdout` (a que os 21 desafios da trilha usam — o teste roda
 * `runpy.run_path("solucao.py")` e compara TUDO o que o programa imprimiu), a
 * `cobertura[].atoms` sai VAZIA, e isso é DECLARADO, não esquecido. O motivo é
 * o mesmo que `quality/minimalPython.ts:583-590` já escreveu para o seu
 * `atomsDoTeste`: o assert chama `rodar()`, um helper do PRÓPRIO arquivo de
 * teste, e os átomos dele (`io`, `contextlib`, `runpy`, `unittest`) são o
 * HARNESS — nunca o que o desafio cobra do aluno. Emitir o harness como se
 * fosse cobrança seria pior que emitir nada.
 *
 * Na forma `import` (`from solucao import somar`) a cobertura é a real: os
 * átomos do trecho da solução que declara as funções chamadas pelos asserts,
 * com o mesmo fallback do lado JavaScript.
 *
 * ─── FACHADA (refatoração L04: arquivo ≤500 linhas e toda função CC≤8) ─────
 *
 * Este caminho público continua o contrato estável dos consumidores
 * (`revision/progressiva.ts`, `tools/track-engine/cli.ts`, testes); a
 * implementação é re-exportada de seis módulos irmãos, sem mudança de
 * comportamento:
 *
 *   - `requirementsTipos.ts`    — contrato, `RequirementsParseError` e a bijeção;
 *   - `requirementsJs.ts`       — `test('nome', …)` + `assert.*` (AST TS);
 *   - `requirementsPy.ts`       — `def test_…` + `self.assert*` (AST adaptador);
 *   - `requirementsC.ts`        — `SM_TEST(<slug>)` + `checa_*` (counter_protocol);
 *   - `requirementsRust.ts`     — `#[test] fn` + `assert_eq!` (AST adaptador);
 *   - `requirementsDespacho.ts` — a tabela por linguagem e as entradas públicas.
 */

export * from './requirementsTipos';
export * from './requirementsJs';
export * from './requirementsPy';
export * from './requirementsC';
export * from './requirementsRust';
export * from './requirementsDespacho';
