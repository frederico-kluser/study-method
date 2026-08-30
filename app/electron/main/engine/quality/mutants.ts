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
 */

import { z } from 'zod';

import { ChallengeDraftSchema } from '../schemas/artifacts';
import { extractAtoms } from '../extract';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/** As quatro classes de defeito injetado — o fechado do gerador. */
export type ClasseDeDefeito =
  | 'fora_do_orcamento'
  | 'teste_divergente_do_enunciado'
  | 'imprime_em_vez_de_retornar'
  | 'nao_exercita_a_aula';

/** O enum em runtime — a medição itera sobre ELE, nunca sobre lista solta. */
export const CLASSES_DE_DEFEITO: readonly ClasseDeDefeito[] = [
  'fora_do_orcamento',
  'teste_divergente_do_enunciado',
  'imprime_em_vez_de_retornar',
  'nao_exercita_a_aula',
];

/** O desafio F8 já validado (o artefato da engine, `ChallengeDraftSchema`). */
export type Desafio = z.infer<typeof ChallengeDraftSchema>;

/**
 * O artefato que o gerador (e a calibração) manipulam: o desafio + o que a
 * AULA introduz (`introduces.productive` do draft da aula) — o alvo da
 * classe (d): o desafio só exercita a aula se a solução usar essas
 * construções (J2: `constructs(solution) ∩ introduces.productive ≠ ∅`).
 */
export interface DesafioParaMutacao {
  desafio: Desafio;
  /** construções NOVAS da aula — a EXIGÊNCIA que o desafio tem de exercitar. */
  introducesProductive: readonly string[];
}

/** Um mutante: rótulo da classe + defeito exato + a mutação (função pura). */
export interface Mutante {
  /** id estável dentro da geração (M1..M4). */
  id: string;
  /** a classe de defeito — o rótulo usado na medição por classe. */
  classe: ClasseDeDefeito;
  /** o defeito EXATO injetado, legível (vai para o relatório da medição). */
  defeito: string;
  /** trecho distintivo da injeção (presente no artefato mutado). */
  marcador: string;
  /** aplica a mutação sobre a base, devolvendo o artefato MUTADO (pura). */
  aplicar: (base: DesafioParaMutacao) => DesafioParaMutacao;
}

// ---------------------------------------------------------------------------
// Suporte
// ---------------------------------------------------------------------------

/** Extrai as chaves de átomo de um trecho — a prova por parser das mutações. */
function chavesDe(code: string): string[] {
  const resultado = extractAtoms(code);
  if (!resultado.ok) {
    throw new Error(
      `mutants: código com sintaxe inválida (${resultado.error.message} linha ${resultado.error.line}) — a mutação não pode ser medida`,
    );
  }
  return resultado.keys;
}

/** Devolve uma cópia da base trocando SÓ o desafio (a aula intata). */
function somenteDesafio(base: DesafioParaMutacao, desafio: Desafio): DesafioParaMutacao {
  return { ...base, desafio };
}

// ---------------------------------------------------------------------------
// A fixture — o ARTEFATO VÁLIDO de desafio, em memória
// ---------------------------------------------------------------------------

/**
 * O desafio VÁLIDO de calibração, construído em memória (nenhuma trilha real,
 * nenhum IO). Por CONSTRUÇÃO:
 *
 *   - `requires` = chaves da solução válida ∪ chaves da variante que não
 *     exercita a aula (divisão, multiplicação e parênteses como PRÉ-REQUISITOS
 *     já ensinados; `Math.round` idem) — a variante (d) fica DENTRO do
 *     orçamento e FORA dos introduces, um defeito só;
 *   - `introducesProductive = ['op:binary:%']` — a construção nova da aula,
 *     derivada por parser (o que a solução válida usa e a variante (d) não);
 *   - a solução válida usa `%` — exercita a aula (J2).
 *
 * A própria fixture é verificada aqui (schema + o átomo da aula): o gerador
 * não mede sobre uma base quebrada.
 */
export function desafioValidoExemplo(): DesafioParaMutacao {
  const solutionCode = 'export function ehPar(n) {\n  return n % 2 === 0;\n}\n';
  const solucaoQueNaoExercita = 'export function ehPar(n) {\n  return n / 2 === Math.round(n / 2);\n}\n';
  const keysValida = chavesDe(solutionCode);
  const keysSemOModulo = chavesDe(solucaoQueNaoExercita);
  const requires = [...new Set([...keysValida, ...keysSemOModulo])];
  const introducesProductive = keysValida.filter((chave) => !keysSemOModulo.includes(chave));

  const desafio: Desafio = {
    slug: 'm01/a03/desafio-paridade',
    conceito: 'op:binary:%',
    statement:
      'Escreva a função `ehPar(n)` que retorna true quando n é par e false caso contrário.',
    starterCode: 'export function ehPar(n) {\n  // seu código aqui\n}\n',
    solutionCode,
    testsCode: [
      "import { ehPar } from './solution.mjs';",
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      '',
      "test('numero par', () => {",
      '  assert.equal(ehPar(4), true);',
      '});',
      '',
      "test('numero impar', () => {",
      '  assert.equal(ehPar(5), false);',
      '});',
    ].join('\n'),
    expectedTestCount: 2,
    outputChannel: 'retorno',
    requires,
    notRequired: ['laços', 'console'],
    subgoals: ['calcular o resto da divisão', 'comparar o resto com zero'],
    scenarios: [
      { tipo: 'exemplo', derivado_de: 'op:binary:%', descricao: '4 é par' },
      { tipo: 'limite', derivado_de: 'op:binary:%', descricao: '0 é par' },
      { tipo: 'erro', derivado_de: 'op:binary:%', descricao: 'negativo preserva o sinal do resto' },
    ],
    taskSkill: 'aplicar o operador de resto',
    supportLevel: 'com_andaime',
    surfaceDomain: 'aritmética de inteiros',
    solutionAlternates: ['export function ehPar(n) {\n  return n % 2 === 0;\n}\n'],
    wrongSolutions: ['export function ehPar(n) {\n  return n % 2 === 1;\n}\n'],
    requirements: [
      { id: 'REQ-1', descricao: 'retorna true para número par', teste: 'ehPar(4) === true' },
      { id: 'REQ-2', descricao: 'retorna false para número ímpar', teste: 'ehPar(5) === false' },
    ],
    justificativa: 'o desafio exercita o operador de resto (`op:binary:%`), a construção nova da aula',
    aprovado: true,
  };

  ChallengeDraftSchema.parse(desafio);
  if (introducesProductive.length !== 1 || introducesProductive[0] !== 'op:binary:%') {
    throw new Error(
      `mutants: a fixture não derivou o átomo da aula esperado ('op:binary:%') — recebido [${introducesProductive.join(', ')}]; o gerador não pode medir exercício da aula`,
    );
  }
  return { desafio, introducesProductive };
}

// ---------------------------------------------------------------------------
// As quatro mutações — UMA função pura por classe
// ---------------------------------------------------------------------------

/**
 * Candidatos de construção FORA do orçamento (classe a). O gerador escolhe o
 * primeiro cuja chave NÃO esteja em `requires` — se todos já estiverem
 * permitidos, a classe (a) não existe para esta base (erro, nunca mutante
 * vazio). A chave proibida é o `marcador` da mutação.
 */
const FORA_DO_ORCAMENTO_CANDIDATOS: readonly { chave: string; snippet: string }[] = [
  { chave: 'api:Number.isFinite', snippet: 'return Number.isFinite(v);' },
  { chave: 'api:Array.isArray', snippet: 'return Array.isArray(v);' },
  { chave: 'node:WhileStatement', snippet: 'while (v > 0) { v -= 1; }' },
];

/**
 * (a) — a `solutionCode` passa a usar uma construção FORA de `requires`:
 * construção usada sem ter sido ensinada (orçamento da aula violado).
 */
export function mutarConstrucaoForaDoOrcamento(base: DesafioParaMutacao): DesafioParaMutacao {
  const candidato = FORA_DO_ORCAMENTO_CANDIDATOS.find((c) => !base.desafio.requires.includes(c.chave));
  if (candidato === undefined) {
    throw new Error(
      'mutants: toda construção candidata de "fora do orçamento" já está em `requires` desta base — a classe (a) não pode ser gerada',
    );
  }
  const solutionCode = `${base.desafio.solutionCode.trimEnd()}\nexport function auxiliar(v) {\n  ${candidato.snippet}\n}\n`;
  return somenteDesafio(base, { ...base.desafio, solutionCode });
}

/**
 * (b) — o `testsCode` passa a asserir o OPOSTO do enunciado: o teste do
 * número PAR espera `false`. Só o teste toca o assert divergente; o restante
 * (inclusive o teste do ímpar) segue o enunciado — um defeito só.
 */
export function mutarTesteDivergenteDoEnunciado(base: DesafioParaMutacao): DesafioParaMutacao {
  const assertPar = 'assert.equal(ehPar(4), true);';
  const assertMutado = 'assert.equal(ehPar(4), false);';
  const testsCode = base.desafio.testsCode.replace(assertPar, assertMutado);
  if (testsCode === base.desafio.testsCode || !testsCode.includes(assertMutado)) {
    throw new Error(
      'mutants: a mutação (b) não encontrou a asserção de paridade esperada — a fixture mudou sem o gerador acompanhar',
    );
  }
  return somenteDesafio(base, { ...base.desafio, testsCode });
}

/**
 * Os ÁTOMOS que o canal de impressão (classe c) introduz na solução mutada:
 * `global:console` (a raiz global), `api:console.log` (o membro acessado) e
 * `node:ExpressionStatement` (o `console.log(...)` vira uma expression
 * statement em vez de um `return`). São o ORÇAMENTO do mutante (c) —
 * declarados aqui no gerador, SOMADOS ao `requires` da base no artefato
 * mutado por `mutarImpressaoEmVezDeRetorno` (fail-closed: o validador da
 * classe (c) exige `chavesDaSolução ⊆ requires do mutante`, então um mutante
 * (c) cujo canal não esteja no orçamento é REJEITADO — nunca um (c) com o
 * defeito duplo (a)+(c)). A fixture NÃO usa console em nenhuma solução
 * (verificado por parser em teste), então estes átomos nunca entram no
 * `requires` da BASE: o único mutante que os declara é o (c).
 */
export const ATOMS_DO_CANAL_DE_IMPRESSAO: readonly string[] = [
  'global:console',
  'api:console.log',
  'node:ExpressionStatement',
];

/**
 * (c) — a solução PASSA a imprimir no console em vez de retornar (o modo de
 * falha nº 1 medido, §10), o `outputChannel` declarado vai para `impressao`
 * — os testes esperam o valor de retorno e recebem `undefined` — e o
 * ORÇAMENTO do mutante cresce com os átomos do canal
 * (`ATOMS_DO_CANAL_DE_IMPRESSAO`): o console usado aqui é construção ENSINADA
 * no escopo do mutante, o defeito UNO da classe é imprimir em vez de retornar
 * (nunca "usar console sem ter sido ensinado" — isso seria o defeito da
 * classe (a). O `notRequired` da base fica intocado: `notRequired` é o escopo
 * declarado, não o orçamento; o orçamento é `requires`, que o mutante (c)
 * declara com o canal).
 */
export function mutarImpressaoEmVezDeRetorno(base: DesafioParaMutacao): DesafioParaMutacao {
  const solutionCode = 'export function ehPar(n) {\n  console.log(n % 2 === 0);\n}\n';
  const requires = [...new Set([...base.desafio.requires, ...ATOMS_DO_CANAL_DE_IMPRESSAO])];
  return somenteDesafio(base, { ...base.desafio, solutionCode, outputChannel: 'impressao', requires });
}

/**
 * (d) — a solução NÃO usa a construção nova da aula (`introducesProductive`):
 * uma solução correta de paridade com divisão/multiplicação (`Math.round`),
 * construções de PRÉ-REQUISITO já em `requires`. O defeito é UNO: a solução
 * resolve o desafio sem exercitar a aula (A6/C5) e sem vazar do orçamento.
 */
export function mutarNaoExercitaAAula(base: DesafioParaMutacao): DesafioParaMutacao {
  const solutionCode = 'export function ehPar(n) {\n  return n / 2 === Math.round(n / 2);\n}\n';
  return somenteDesafio(base, { ...base.desafio, solutionCode });
}

// ---------------------------------------------------------------------------
// A validação FAIL-CLOSED do gerador
// ---------------------------------------------------------------------------

/** Os campos do desafio — a régua do "UM defeito por mutante". */
const CAMPOS_DO_DESAFIO: readonly (keyof Desafio)[] = [
  'slug',
  'conceito',
  'statement',
  'starterCode',
  'solutionCode',
  'testsCode',
  'expectedTestCount',
  'outputChannel',
  'requires',
  'notRequired',
  'subgoals',
  'scenarios',
  'taskSkill',
  'supportLevel',
  'surfaceDomain',
  'solutionAlternates',
  'wrongSolutions',
  'requirements',
  'justificativa',
  'aprovado',
];

/** Quais campos do desafio DIFEREM entre base e mutação (comparação por JSON). */
function camposDiferentes(base: Desafio, mutado: Desafio): string[] {
  return CAMPOS_DO_DESAFIO.filter((campo) => JSON.stringify(base[campo]) !== JSON.stringify(mutado[campo]));
}

/**
 * A validação de um mutante gerado: schema válido, diferença EXATAMENTE nos
 * campos da classe e a propriedade da classe verificada por parser
 * (`extractAtoms`). Qualquer desvio é erro do gerador — inclusive um mutante
 * (c) cuja solução vaze do orçamento declarado (mutante de classe dupla,
 * rejeitado fail-closed). Exportada para os testes de rejeição provarem que
 * um mutante (c) artificial e vazado NUNCA passa pela porta do gerador.
 */
export function validarMutante(base: DesafioParaMutacao, mutante: Mutante, mutado: DesafioParaMutacao): void {
  ChallengeDraftSchema.parse(mutado.desafio);

  const camposMutados = camposDiferentes(base.desafio, mutado.desafio);
  const erros: string[] = [];

  switch (mutante.classe) {
    case 'fora_do_orcamento': {
      if (JSON.stringify(camposMutados) !== JSON.stringify(['solutionCode'])) {
        erros.push(`mexeu em campos além de solutionCode: [${camposMutados.join(', ')}]`);
      }
      const proibida = 'api:Number.isFinite';
      const chavesMutado = chavesDe(mutado.desafio.solutionCode);
      if (!chavesMutado.includes(proibida)) erros.push('a solução mutada não contém a construção proibida');
      if (base.desafio.requires.includes(proibida)) erros.push('a construção "proibida" já está no orçamento');
      break;
    }
    case 'teste_divergente_do_enunciado': {
      if (JSON.stringify(camposMutados) !== JSON.stringify(['testsCode'])) {
        erros.push(`mexeu em campos além de testsCode: [${camposMutados.join(', ')}]`);
      }
      if (!mutado.desafio.testsCode.includes('ehPar(4), false')) erros.push('a divergência (par → false) não está nos testes');
      if (!mutado.desafio.testsCode.includes('ehPar(5), false')) erros.push('o resto do teste não seguiu o enunciado');
      break;
    }
    case 'imprime_em_vez_de_retornar': {
      if (JSON.stringify(camposMutados) !== JSON.stringify(['solutionCode', 'outputChannel', 'requires'])) {
        erros.push(`mexeu em campos além de solutionCode/outputChannel/requires: [${camposMutados.join(', ')}]`);
      }
      if (mutado.desafio.outputChannel !== 'impressao') erros.push('outputChannel não foi para impressao');
      if (!mutado.desafio.solutionCode.includes('console.log')) erros.push('a solução mutada não imprime');
      if (mutado.desafio.solutionCode.includes('return')) erros.push('a solução mutada ainda retorna');
      const chavesMutado = chavesDe(mutado.desafio.solutionCode);
      const foraDoOrcamento = chavesMutado.filter((chave) => !mutado.desafio.requires.includes(chave));
      if (foraDoOrcamento.length > 0) {
        erros.push(`a solução mutada vazou do orçamento do mutante: [${foraDoOrcamento.join(', ')}]`);
      }
      const canalNaoDeclarado = ATOMS_DO_CANAL_DE_IMPRESSAO.filter((chave) => !mutado.desafio.requires.includes(chave));
      if (canalNaoDeclarado.length > 0) {
        erros.push(`os átomos do canal não foram declarados no orçamento do mutante: [${canalNaoDeclarado.join(', ')}]`);
      }
      break;
    }
    case 'nao_exercita_a_aula': {
      if (JSON.stringify(camposMutados) !== JSON.stringify(['solutionCode'])) {
        erros.push(`mexeu em campos além de solutionCode: [${camposMutados.join(', ')}]`);
      }
      const chavesMutado = chavesDe(mutado.desafio.solutionCode);
      const exercita = chavesMutado.filter((chave) => mutado.introducesProductive.includes(chave));
      const foraDoOrcamento = chavesMutado.filter((chave) => !mutado.desafio.requires.includes(chave));
      if (exercita.length > 0) erros.push(`a solução mutada ainda usa construção da aula: [${exercita.join(', ')}]`);
      if (foraDoOrcamento.length > 0) erros.push(`a solução mutada vazou do orçamento: [${foraDoOrcamento.join(', ')}]`);
      break;
    }
  }

  if (erros.length > 0) {
    throw new Error(`mutants: o mutante ${mutante.id} (${mutante.classe}) falhou a validação do gerador: ${erros.join('; ')}`);
  }
}

// ---------------------------------------------------------------------------
// O gerador + o aplicador
// ---------------------------------------------------------------------------

/**
 * Gera UM mutante por classe de defeito sobre um artefato VÁLIDO. Cada
 * mutante carrega a classe e o defeito exato; `rodaMutante` aplica a mutação
 * devolvendo o artefato mutado. FAIL-CLOSED: base inválida (schema) ou
 * mutante que não passe na validação lançam — o gerador nunca entrega um
 * mutante que não mude nada nem um que quebre o desafio.
 */
export function gerarMutantes(artefatoValido: DesafioParaMutacao): Mutante[] {
  ChallengeDraftSchema.parse(artefatoValido.desafio);

  const mutantes: Mutante[] = [
    {
      id: 'M1',
      classe: 'fora_do_orcamento',
      defeito:
        'a solutionCode usa `api:Number.isFinite`, construção fora de `requires` — construção usada sem ter sido ensinada (orçamento da aula violado)',
      marcador: 'Number.isFinite(v)',
      aplicar: mutarConstrucaoForaDoOrcamento,
    },
    {
      id: 'M2',
      classe: 'teste_divergente_do_enunciado',
      defeito:
        'o teste "numero par" assere `ehPar(4) === false`, contradizendo o enunciado, que exige `true` para par (bijeção enunciado ↔ teste, J4)',
      marcador: 'ehPar(4), false',
      aplicar: mutarTesteDivergenteDoEnunciado,
    },
    {
      id: 'M3',
      classe: 'imprime_em_vez_de_retornar',
      defeito:
        'a solução imprime no console em vez de retornar o valor (modo de falha nº 1, §10); `outputChannel` foi para `impressao`, o teste espera o retorno, e o orçamento do mutante declara os átomos do canal (`global:console`, `api:console.log`, `node:ExpressionStatement`) — o defeito é UNO',
      marcador: 'console.log',
      aplicar: mutarImpressaoEmVezDeRetorno,
    },
    {
      id: 'M4',
      classe: 'nao_exercita_a_aula',
      defeito:
        'a solução não usa a construção nova da aula (`op:binary:%` dos introduces) — o desafio pode ser resolvido sem exercitar a aula (A6/C5)',
      marcador: 'Math.round(n / 2)',
      aplicar: mutarNaoExercitaAAula,
    },
  ];

  for (const mutante of mutantes) {
    const mutado = rodaMutante(mutante, artefatoValido);
    validarMutante(artefatoValido, mutante, mutado);
  }
  return mutantes;
}

/**
 * Aplica a mutação de um mutante sobre uma base, devolvendo o artefato
 * MUTADO — a porta única de aplicação usada pela calibração
 * (`medirTaxaDeFalsoPasse` em `judgeCalibration.ts`).
 */
export function rodaMutante(mutante: Mutante, artefato: DesafioParaMutacao): DesafioParaMutacao {
  return mutante.aplicar(artefato);
}