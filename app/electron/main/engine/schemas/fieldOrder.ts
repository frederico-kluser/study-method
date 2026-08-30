/**
 * app/electron/main/engine/schemas/fieldOrder.ts — LINT DE BUILD da ordem
 * dos campos nos schemas da engine (pacote P-04, onda 1).
 *
 * O contrato que este arquivo impõe é o INV-04 em código (docs §6.3):
 *
 *   "A ordem dos campos não é estética. ... todo campo de todo schema da
 *    engine é obrigatório, e um lint de build falha quando o índice do
 *    campo de decisão é menor que o do campo de justificativa."
 *
 * O modelo decide antes de pensar quando a ordem está invertida — e, na
 * saída estruturada, propriedades obrigatórias saem na ordem do schema.
 * Este lint torna essa inversão um ERRO DE BUILD, não uma nota de review.
 *
 * INV-05 (nenhum campo opcional — docs §6.3) também mora aqui: a varredura
 * `encontrarCamposOpcionais` nega `.optional()`, `.default()` e união com
 * `undefined`; a ausência válida tem que ser valor vazio EXPLÍCITO (array
 * vazio, string vazia, ou `z.null()` declarado em união).
 *
 * AMBOS os lints percorrem a lista REAL de schemas — `SCHEMA_REGISTRY` de
 * `artifacts.ts` (A-P04-2): não existe aqui lista curada que alguém esquece
 * de atualizar. As listas de nomes de campo por categoria são constantes
 * explícitas e versionadas abaixo: quem adicionar um nome de decisão ou de
 * justificativa muda ESTA constante, e o lint passa a enxergar em todos os
 * schemas de uma vez.
 */

import type { z } from 'zod';
import type { SchemaRegistrado } from './artifacts';

/**
 * Nomes de campo de DECISÃO reconhecidos pelo lint (casamento EXATO — a
 * lista é a fonte da verdade, não um prefixo). Versionada: estender um nome
 * aqui vale para todos os schemas registrados.
 */
export const DECISION_FIELD_NAMES: readonly string[] = [
  'aprovado',
  'decision',
  'acao',
  'veredito',
  'approve',
  'escolha',
  'result',
  // 'atomico' — o teste de atomicidade do §3.6: o modelo decide se o conceito
  // É átomo (booleano) DEPOIS de escrever `raciocinio_de_projeto`. Esquecer
  // este nome aqui reabre o falso-verde da revisão adversarial: inversão futura
  // no par raciocinio_de_projeto/atomico passaria sem o lint acusar.
  'atomico',
  // 'role' — classificação-decisão da aula (`regular`/`integration`, §3.7):
  // marcar um nó de composição é decisão de modelagem, que exige justificativa
  // ANTES. Aparece em `graph.aulas[]` e em `lesson-draft`.
  'role',
  // 'status' — estado de ciclo de vida do draft de aula (`rascunho`/
  // `pronto_para_revisao`/`bloqueado`/`aprovado`): o autor decide o andamento,
  // e o estado só faz sentido DEPOIS da justificativa do draft.
  'status',
];

/**
 * Nomes de campo de JUSTIFICATIVA reconhecidos pelo lint (casamento EXATO).
 */
export const JUSTIFICATION_FIELD_NAMES: readonly string[] = [
  'motivo',
  'justificativa',
  'raciocinio',
  'raciocinio_de_projeto',
  'evidencia',
  'reasoning',
  'justificacao',
  'explicacao',
];

/** Uma violação de ordem: o campo de decisão aparece ANTES da justificativa. */
export interface ProblemaDeOrdem {
  /** nome do schema no registro (ex.: `'brief'`). */
  schema: string;
  /** caminho até o objeto zod — `'(raiz)'` para o shape de topo. */
  caminho: string;
  campo_decisao: string;
  campo_justificativa: string;
  /** índice do campo na ordem do shape (0-based, ordem de declaração). */
  indice_decisao: number;
  indice_justificativa: number;
}

/** Um campo opcional encontrado (INV-05) ou uma união que aceita `undefined`. */
export interface ProblemaDeCampoOpcional {
  schema: string;
  caminho: string;
  tipo: 'ZodOptional' | 'ZodDefault' | 'uniao-com-undefined';
}

function exibirCaminho(caminho: string): string {
  return caminho === '' ? '(raiz)' : caminho;
}

type VisitanteDeNo = (schema: z.ZodTypeAny, caminho: string, tipo: string) => void;

function caminhoFilho(prefixo: string, chave: string): string {
  return prefixo === '' ? chave : `${prefixo}.${chave}`;
}

/**
 * Percorre a árvore de um schema zod visitando TODOS os nós (objetos,
 * arrays, tuplas, uniões, nullables, effects, records e lazy) com o caminho
 * acumulado — ex.: `acoes[].alvo.span`. Nós terminais (string, number,
 * boolean, enum, literal) não têm filhos.
 *
 * Acessa a API interna `_def` do zod 3.x — estável e a única forma portátil
 * de examinar a ESTRUTURA (e não o resultado) de um schema. A versão
 * instalada é fixada em `zod@3.25.76` (app/package.json).
 */
function caminhar(schema: z.ZodTypeAny, prefixo: string, visitarNo: VisitanteDeNo): void {
  const def = schema._def as { typeName?: string };
  const tipo = def.typeName ?? 'desconhecido';
  visitarNo(schema, prefixo, tipo);
  switch (tipo) {
    case 'ZodObject': {
      const forma = (schema as z.ZodObject<z.ZodRawShape>).shape;
      for (const [chave, filho] of Object.entries(forma)) {
        caminhar(filho, caminhoFilho(prefixo, chave), visitarNo);
      }
      return;
    }
    case 'ZodArray':
      caminhar((def as z.ZodArrayDef).type, `${prefixo}[]`, visitarNo);
      return;
    case 'ZodTuple':
      for (const item of (def as z.ZodTupleDef).items) caminhar(item, `${prefixo}[]`, visitarNo);
      return;
    case 'ZodUnion':
      for (const opcao of (def as z.ZodUnionDef).options) caminhar(opcao, prefixo, visitarNo);
      return;
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      caminhar((def as { innerType: z.ZodTypeAny }).innerType, prefixo, visitarNo);
      return;
    case 'ZodEffects':
      caminhar((def as { schema: z.ZodTypeAny }).schema, prefixo, visitarNo);
      return;
    case 'ZodRecord':
      caminhar((def as { valueType: z.ZodTypeAny }).valueType, `${prefixo}[]`, visitarNo);
      return;
    case 'ZodLazy':
      caminhar((def as { getter: () => z.ZodTypeAny }).getter(), prefixo, visitarNo);
      return;
    default:
      // Nós terminais — sem filhos.
      return;
  }
}

/**
 * INV-04 — o lint de ordem (função PURA). Para cada schema recebido, para
 * cada shape de objeto (topo e aninhados), falha quando o índice de um campo
 * de DECISÃO é menor que o de um campo de JUSTIFICATIVA. Retorna TODAS as
 * violações (fail-closed é do chamador: não-vazio = build vermelho).
 */
export function lintOrdemCampos(schemas: readonly SchemaRegistrado[]): ProblemaDeOrdem[] {
  const problemas: ProblemaDeOrdem[] = [];

  for (const registrado of schemas) {
    const formas: Array<{ caminho: string; forma: z.ZodRawShape }> = [];
    caminhar(registrado.schema, '', (schema, caminho, tipo) => {
      if (tipo === 'ZodObject') {
        formas.push({ caminho, forma: (schema as z.ZodObject<z.ZodRawShape>).shape });
      }
    });

    for (const { caminho, forma } of formas) {
      // `Object.keys` preserva a ordem de declaração do shape zod — que é a
      // ordem em que as propriedades obrigatórias saem (INV-04).
      const chaves = Object.keys(forma);
      for (const justificativa of JUSTIFICATION_FIELD_NAMES) {
        const indiceJustificativa = chaves.indexOf(justificativa);
        if (indiceJustificativa === -1) continue;
        for (const decisao of DECISION_FIELD_NAMES) {
          const indiceDecisao = chaves.indexOf(decisao);
          if (indiceDecisao === -1) continue;
          if (indiceDecisao < indiceJustificativa) {
            problemas.push({
              schema: registrado.nome,
              caminho: exibirCaminho(caminho),
              campo_decisao: decisao,
              campo_justificativa: justificativa,
              indice_decisao: indiceDecisao,
              indice_justificativa: indiceJustificativa,
            });
          }
        }
      }
    }
  }

  return problemas;
}

/**
 * INV-05 — varredura de campos opcionais (função PURA). Falha quando algum
 * nó do schema é `ZodOptional` ou `ZodDefault` (o campo pode faltar na
 * entrada) ou quando uma união aceita `undefined` — o equivalente funcional
 * de `.optional()`. `z.null()` em união NÃO é opcional: é valor vazio
 * EXPLÍCITO e permitido.
 */
export function encontrarCamposOpcionais(schemas: readonly SchemaRegistrado[]): ProblemaDeCampoOpcional[] {
  const problemas: ProblemaDeCampoOpcional[] = [];

  for (const registrado of schemas) {
    caminhar(registrado.schema, '', (schema, caminho, tipo) => {
      if (tipo === 'ZodOptional') {
        problemas.push({ schema: registrado.nome, caminho: exibirCaminho(caminho), tipo: 'ZodOptional' });
        return;
      }
      if (tipo === 'ZodDefault') {
        problemas.push({ schema: registrado.nome, caminho: exibirCaminho(caminho), tipo: 'ZodDefault' });
        return;
      }
      if (tipo === 'ZodUnion') {
        const opcoes = (schema._def as z.ZodUnionDef).options;
        if (opcoes.some((opcao) => (opcao._def as { typeName?: string }).typeName === 'ZodUndefined')) {
          problemas.push({ schema: registrado.nome, caminho: exibirCaminho(caminho), tipo: 'uniao-com-undefined' });
        }
      }
    });
  }

  return problemas;
}

/**
 * Helper de mensagens consistente: transforma um `ZodError` em linhas que
 * NOMEIAM o campo (caminho completo, ex.: `testes[3].aprovado`) e o MOTIVO
 * (a mensagem do zod). Usar em todo ponto que valida artefato da engine —
 * a mesma forma de erro em CLI, IPC e relatórios.
 */
export function formatarErroCampos(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const nomeCampo = issue.path.length > 0 ? issue.path.map(String).join('.') : '(raiz)';
      return `campo "${nomeCampo}": ${issue.message}`;
    })
    .join('\n');
}

/** Resultado combinado do lint de build (ordem + opcionais). */
export interface ResultadoLintSchemas {
  ordem: ProblemaDeOrdem[];
  camposOpcionais: ProblemaDeCampoOpcional[];
}

/**
 * O lint de build completo sobre QUALQUER lista de schemas registrados.
 * FAIL-CLOSED (INV-03): com problema, o build tem de parar — retorne o
 * resultado e decida o tratamento no ponto de integração, ou use
 * `garantirSchemasValidos()` que lança.
 */
export function lintSchemasDaEngine(schemas: readonly SchemaRegistrado[]): ResultadoLintSchemas {
  return {
    ordem: lintOrdemCampos(schemas),
    camposOpcionais: encontrarCamposOpcionais(schemas),
  };
}

/**
 * A forma FAIL-CLOSED do lint de build: lança `Error` listando TODAS as
 * violações quando qualquer schema registrado inverte justificativa/decisão
 * ou tem campo opcional. É o ponto de entrada para um script de build
 * (ex.: um `npm run engine -- check schemas` na onda 2).
 */
export function garantirSchemasValidos(schemas: readonly SchemaRegistrado[]): void {
  const resultado = lintSchemasDaEngine(schemas);
  const linhas: string[] = [];
  for (const p of resultado.ordem) {
    linhas.push(
      `INV-04 ${p.schema}@${p.caminho}: campo de DECISÃO "${p.campo_decisao}" (índice ${p.indice_decisao}) ` +
        `vem ANTES da JUSTIFICATIVA "${p.campo_justificativa}" (índice ${p.indice_justificativa}) — ` +
        `justificativa antes de decisão (docs §6.3).`,
    );
  }
  for (const p of resultado.camposOpcionais) {
    linhas.push(
      `INV-05 ${p.schema}@${p.caminho}: campo ${p.tipo} — todo campo de todo schema da engine é obrigatório; ` +
        `use valor vazio EXPLÍCITO (array vazio, string vazia, ou null em união), nunca opcional (docs §6.3).`,
    );
  }
  if (linhas.length > 0) {
    throw new Error(`lint de schemas da engine FALHOU:\n${linhas.join('\n')}`);
  }
}