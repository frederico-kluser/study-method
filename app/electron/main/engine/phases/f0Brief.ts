/**
 * app/electron/main/engine/phases/f0Brief.ts — F0, BRIEF DA TRILHA
 * (pacote P-09, `docs/16-engine-de-trilha.md` §4 F0 e §12 D1/D2).
 *
 * O brief é a ABERTURA da geração: assunto, público-alvo, axioma de entrada,
 * construções alvo, política de harness e a justificativa (INV-04 — a
 * justificativa vem ANTES da decisão `aprovado`). F0 é fase ▮ — ESCRITOR
 * ÚNICO serial: nenhum outro agente toca o brief.
 *
 * CONTRATOS QUE ESTE ARQUIVO É A CASA:
 *   - G-SCHEMA: todo artefato sai validado pelo schema zod (`BriefSchema`),
 *     com erro que NOMEIA campo+motivo (`formatarErroCampos`).
 *   - A-P09-2: `politica_de_harness` é campo OBRIGATÓRIO do brief e carrega a
 *     DECISÃO de produto D1 (`docs §3.2`): `receptive-seed`. Política AUSENTE
 *     é ERRO estruturado — nunca default silencioso. Sem ela, toda aula da
 *     primeira metade nasce violada (o harness `node:test` entra no orçamento
 *     RECEPTIVO da aula 1 por esta política; sem a decisão o orçamento não
 *     sabe semear e o gate A3/A4 acusa o harness em TODO desafio). As
 *     alternativas `aula-zero` e `wrapper-gerado` foram consideradas e
 *     REJEITADAS no documento (§3.2), e `none` (valor LEGÍTIMO do ORÇAMENTO —
 *     BudgetSchema/P-08 — mas não política de produto) entra na MESMA negação:
 *     um draft que escolha qualquer uma é REJEITADO com erro nomeado, nunca
 *     normalizado em silêncio.
 *   - AXIOMA DE ENTRADA (`criterios_de_entrada`): lista de CHAVES do
 *     vocabulário de construções que o aluno já domina ao entrar — validada
 *     contra o vocabulário GERADO do P-05 (`vocab/atoms.json`, carregado de
 *     disco ou injetado). DECISÃO DE UNIVERSO (onda 2): os eixos FECHADOS do
 *     extrator (`node:`/`op:`/`decl:`/`global:`) são validados por PERTENÇA
 *     estrita ao vocabulário — chave fora dele = erro NA CARGA nomeando a
 *     chave e sugerindo as mais próximas por prefixo. Os eixos ABERTOS
 *     (`api:` — o extrator emite para QUALQUER raiz global/importada, ver
 *     `vocab/generate.ts`) e os não-vocabulário (`form:`/`term:`) são
 *     validados por FORMATO (`ATOM_KEY_RE` para api/term; `parseFormKey` para
 *     form): o vocabulário é o piso de consciência do LLM, não o teto do
 *     gate. Axioma perto demais da máquina = o orçamento de entrada fabrica
 *     violação falsa; longe demais = miragem de gate.
 *   - NADA DE TETO DE AULAS (§12 D2): a contagem é SAÍDA da geração — não
 *     existe campo de teto no brief; um draft da LLM com campo extra é
 *     REJEITADO, nunca silenciosamente descartado (o schema zod por padrão
 *     STRIPA campos desconhecidos — por isso o cheque de campos extras vem
 *     ANTES do parse). O cheque é RECURSIVO: campo extra ANINHADO (dentro de
 *     `componentes`/`estados`/`transicoes` da máquina nocional) também é
 *     rejeitado, nomeando o CAMINHO completo (ex.: `componentes[0].teto`).
 *   - INV-03 (fail-closed): falha da LLM/disponibilidade propaga o
 *     `LlmStageError` estruturado do transporte; erro de conteúdo vira
 *     `FaseF0Error` estruturado — nunca veredito falso nem artefato parcial.
 *   - `FaseF0Error` e os helpers de draft/schema vivem AQUI e são reusados
 *     por `notionalMachine.ts` (o escopo do pacote P-09 não cria módulo
 *     compartilhado à parte).
 *
 * OS LIMITES DESTE ARQUIVO: o brief é DRAFTADO por LLM mas a fase em si é
 * determinística — `validarBrief` é PURO (sem LLM, sem IO) e é O MESMO gate
 * para o caminho de geração e para quem carregar `brief.json` do disco em
 * fases posteriores (o "erro NA CARGA" do contrato). Nenhum arquivo é escrito
 * aqui: persistir artefatos é do FREEZE/F5 (P-10); a fase devolve o artefato
 * validado, pronto para serializar como `brief.json`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { AXIS_PREFIX, DECLARATION_KINDS, axisOf, isAtomKey } from '../atomKeys';
import {
  DEFAULT_ADAPTER_ID,
  getAdapter,
  type LanguageId,
} from '../lang/registry';
import { FormSelectorError, parseFormKey } from '../form/selector';
import { BriefSchema } from '../schemas/artifacts';
import { formatarErroCampos } from '../schemas/fieldOrder';
import type { EngineLlm, LlmCallRequest, LlmCallResult } from '../runtime/callLlm';

// ─── identidade da etapa (entra na chave do cache — bumpar = nova identidade) ─

export const ETAPA_BRIEF = 'f0-brief' as const;
export const STAGE_VERSION_BRIEF = '1.0.0' as const;
export const TIMEOUT_BRIEF_MS = 60_000 as const;
/** Regra do §7: toda saída de agente cabe em 2.000 tokens — o transporte nunca trunca. */
export const MAX_TOKENS_BRIEF = 2_000 as const;

// ─── política de harness (D1, §3.2) ─────────────────────────────────────────

/**
 * O espaço de DRAFT que o `BriefSchema` (P-04, imutável) admite: a decisão e
 * as duas alternativas consideradas e rejeitadas no §3.2.
 */
export const POLITICAS_HARNESS_DO_SCHEMA = ['receptive-seed', 'aula-zero', 'wrapper-gerado'] as const;

/**
 * A DECISÃO de produto (D1, §3.2): harness `node:test` no orçamento RECEPTIVO
 * da aula 1 + região congelada no starter. Único valor que o brief carrega —
 * os demais do schema são o registro histórico das alternativas.
 */
export const POLITICA_HARNESS_DECIDIDA = 'receptive-seed' as const;

/**
 * Políticas conhecidas e REJEITADAS no brief — draft que escolha uma delas é
 * ERRO estruturado (`POLITICA_HARNESS_REJEITADA`), nunca normalização:
 * `aula-zero` e `wrapper-gerado` são as alternativas consideradas e rejeitadas
 * no documento (§3.2/D1); `none` é valor LEGÍTIMO do ORÇAMENTO (BudgetSchema
 * P-08: "sem política"), mas NÃO é política de produto — o brief só carrega a
 * decisão de produto D1 (`POLITICA_HARNESS_DECIDIDA`).
 */
export const POLITICAS_HARNESS_REJEITADAS = ['aula-zero', 'wrapper-gerado', 'none'] as const;

// ─── vocabulário (atoms.json do P-05) ───────────────────────────────────────

/**
 * Estrutura serializada de `vocab/atoms.json` (layout `schema: 1` — ver
 * `vocab/generate.ts`; eixos fechados node/op/decl/global + api como
 * dicionário de ensino).
 */
export interface AtomosJson {
  schema: 1;
  node_version: string;
  typescript_version: string;
  axes: { node: string[]; op: string[]; decl: string[]; global: string[]; api: string[] };
  total: number;
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** A pasta dos artefatos de vocabulário gerados (`engine/vocab/`). */
const DIR_VOCAB = path.join(MODULE_DIR, '..', 'vocab');

/**
 * O ARTEFATO DE VOCABULÁRIO DE UMA LINGUAGEM.
 *
 * O `atoms.json` nunca teve dimensão de linguagem: ele é o universo de
 * `node:`/`op:`/`decl:`/`global:` do adaptador que o GEROU (o próprio JSON
 * carrega `node_version` e `typescript_version` — carimbo de origem que só faz
 * sentido para JavaScript). Com mais de um adaptador registrado, um caminho
 * único e fixo faria o brief de uma trilha de Python ser validado contra o
 * vocabulário do Node e aprovar chaves que não existem naquela linguagem.
 *
 * A CONVENÇÃO, e por que ela é uma convenção e não um membro do adaptador: a
 * interface dos 15 membros do §6 (`engine/lang/registry.ts:508`) não tem slot
 * para "onde mora o meu vocabulário gerado" — a lacuna está registrada no
 * handoff da onda 5. Até lá o nome é derivado do ID do adaptador, que é o
 * mesmo id que nomeia o gerador daquela linguagem:
 *
 *   javascript (o adaptador DEFAULT) → `vocab/atoms.json`      (o arquivo que
 *                                       já está commitado; renomeá-lo seria
 *                                       mudança de comportamento sem ganho)
 *   qualquer outro id `<x>`          → `vocab/atoms.<x>.json`
 *
 * FAIL-CLOSED: `getAdapter` LANÇA para id sem adaptador registrado — pedir o
 * vocabulário de uma linguagem que a engine não conhece é erro, nunca o
 * `atoms.json` do JavaScript por descuido.
 */
export function caminhoAtomos(language: LanguageId = DEFAULT_ADAPTER_ID): string {
  const id = getAdapter(language).id;
  const arquivo = id === DEFAULT_ADAPTER_ID ? 'atoms.json' : `atoms.${id}.json`;
  return path.join(DIR_VOCAB, arquivo);
}

/**
 * Caminho default do atoms.json: `engine/vocab/atoms.json` — o artefato do
 * adaptador DEFAULT. Continua exportado com o mesmo valor porque
 * `engine/phases/f2Decompose.ts:83` o importa como FONTE ÚNICA e dois testes o
 * afirmam; quem tem uma linguagem na mão usa `caminhoAtomos(id)`.
 */
export const CAMINHO_ATOMOS_DEFAULT = caminhoAtomos(DEFAULT_ADAPTER_ID);

/**
 * Os eixos FECHADOS do vocabulário — o universo que o atoms.json ESGOTA e,
 * portanto, o que o axioma de entrada valida por PERTENÇA estrita. O eixo
 * `api:` fica de fora DE PROPÓSITO: o extrator (P-05) o trata como universo
 * ABERTO (emite `api:` para qualquer raiz global/importada — `api:Buffer.from`,
 * `api:fs.readFile`…), e `form:`/`term:` nem são gerados pelo P-05 — por isso
 * esses eixos são validados por FORMATO (ver `validarBrief`, passo 5).
 */
export const EIXOS_FECHADOS_ATOMOS = ['node', 'op', 'decl', 'global'] as const;

// ─── erro estruturado da fase F0 (INV-03, fail-closed) ─────────────────────

export type FaseF0ErrorCode =
  | 'BRIEF_DRAFT_NAO_JSON'
  | 'BRIEF_SCHEMA_INVALIDO'
  | 'BRIEF_CAMPO_DESCONHECIDO'
  | 'POLITICA_HARNESS_AUSENTE'
  | 'POLITICA_HARNESS_REJEITADA'
  | 'AXIOMA_CONSTRUCAO_INEXISTENTE'
  | 'NOTIONAL_DRAFT_NAO_JSON'
  | 'NOTIONAL_SCHEMA_INVALIDO'
  | 'NOTIONAL_CAMPO_DESCONHECIDO'
  | 'NOTIONAL_ASPECTOS_INCOMPLETOS'
  | 'NOTIONAL_ASPECTOS_FORA_DE_ORDEM'
  | 'NOTIONAL_ASPECTOS_REPETIDOS'
  | 'VOCAB_ATOMOS_INVALIDO'
  | 'SCHEMA_LLM_NAO_SUPORTADO';

export interface FaseF0ErrorOptions {
  code: FaseF0ErrorCode;
  message: string;
  /** Caminho do campo ofensor (ex.: `politica_de_harness`, `criterios_de_entrada`). */
  campo?: string;
  /** Dados estruturados para o consumidor (sugestões, faltantes, chave inválida…). */
  detalhes?: Record<string, unknown>;
}

/** Erro estruturado da FASE F0 — nunca um veredito falso nem um artefato parcial. */
export class FaseF0Error extends Error {
  readonly code: FaseF0ErrorCode;
  readonly campo?: string;
  readonly detalhes?: Record<string, unknown>;

  constructor(opts: FaseF0ErrorOptions) {
    super(opts.message);
    this.name = 'FaseF0Error';
    this.code = opts.code;
    if (opts.campo !== undefined) this.campo = opts.campo;
    if (opts.detalhes !== undefined) this.detalhes = opts.detalhes;
  }
}

// ─── helpers compartilhados de draft/schema (usados também por notionalMachine) ─

/**
 * Conteúdo da LLM → objeto. Tolerância DETERMINÍSTICA: cerca de fences
 * ```json … ``` (modelos reais embrulham), nada além disso. Falha = erro
 * estruturado `code` (etapa nomeada), nunca conteúdo cru de volta.
 */
export function parsearDraftLlm(content: string, etapa: string, code: FaseF0ErrorCode): unknown {
  const limpo = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(limpo) as unknown;
  } catch (causa) {
    throw new FaseF0Error({
      code,
      message: `draft da LLM (etapa ${etapa}) não é JSON válido: ${causa instanceof Error ? causa.message : String(causa)}`,
      detalhes: { causa: causa instanceof Error ? causa.message : String(causa) },
    });
  }
}

/**
 * Cheque de campos EXTRAS contra o shape zod — ANTES do parse. Justificativa:
 * `z.object` STRIPA chaves desconhecidas no parse; sem este cheque, um campo
 * de teto de aulas entraria no draft e sumiria em silêncio. O schema da LLM é
 * FECHADO (INV-05): campo fora do contrato = erro nomeando a chave, com a
 * nota D2 quando o nome cheira a teto/contagem de aulas.
 *
 * O cheque é RECURSIVO (param `caminho`): desce no DRAFT espelhando o shape
 * esperado — arrays de objetos (`componentes`/`estados`/`transicoes` da
 * máquina nocional) e objetos aninhados também são schema fechado, e o zod
 * STRIPA campos extras neles em silêncio do mesmo jeito. O `campo` do erro
 * é o CAMINHO completo (ex.: `componentes[0].teto_de_aulas`), não só a
 * chave folha. Nada além deste subconjunto zod é suportado (mesmas famílias
 * do serializador `noZodParaLlm` abaixo); tipos desconhecidos são ignorados
 * aqui — quem valida semântica é o `safeParse` que vem em seguida.
 */
export function rejeitarCamposExtras(
  objeto: Record<string, unknown>,
  shape: z.ZodRawShape,
  code: FaseF0ErrorCode,
  rotulo: string,
  caminho = '',
): void {
  for (const chave of Object.keys(objeto)) {
    const caminhoCompleto = caminho ? `${caminho}.${chave}` : chave;
    if (!(chave in shape)) {
      const notaD2 = /aula|lesson|teto|cap|max|count|quantidade/i.test(chave)
        ? ' — a contagem/teto de aulas é SAÍDA da geração, nunca campo do artefato (docs §12 D2)'
        : '';
      throw new FaseF0Error({
        code,
        campo: caminhoCompleto,
        message: `campo desconhecido em ${rotulo}: "${caminhoCompleto}".${notaD2}`,
      });
    }
    rejeitarCamposExtrasNoValor(objeto[chave], shape[chave], code, rotulo, caminhoCompleto);
  }
}

/** Desce no VALOR de um campo conhecido, espelhando o nó zod do shape. */
function rejeitarCamposExtrasNoValor(
  valor: unknown,
  schema: z.ZodTypeAny,
  code: FaseF0ErrorCode,
  rotulo: string,
  caminho: string,
): void {
  const def = schema._def as { typeName?: string };
  switch (def.typeName) {
    case 'ZodArray': {
      const itemSchema = (def as z.ZodArrayDef).type;
      if (Array.isArray(valor)) {
        valor.forEach((item, indice) => {
          rejeitarCamposExtrasNoValor(item, itemSchema, code, rotulo, `${caminho}[${indice}]`);
        });
      }
      break;
    }
    case 'ZodObject': {
      if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) break;
      // Objeto aninhado: mesmo contrato fechado — o `campo` carrega o caminho
      // completo (ex.: "componentes[0].teto_de_aulas").
      rejeitarCamposExtras(valor as Record<string, unknown>, (schema as z.ZodObject<z.ZodRawShape>).shape, code, rotulo, caminho);
      break;
    }
    default:
      // Folhas (string/number/boolean/enum/literal): nenhum objeto aninhado.
      break;
  }
}

// ─── serializador de schema zod → schema JSON para a LLM ────────────────────
// O `req.schema` do transporte é uma STRING JSON-schema. Esta serialização é
// derivada do shape zod REAL (fonte única de verdade: `BriefSchema`/`NotionalMachineSchema`)
// e marca `additionalProperties:false` — o teto de aulas é barrado na borda da
// chamada, além do cheque de campo extra aqui dentro.

/** Um nó zod → nó de JSON-schema (subconjunto que os schemas de F0 usam). */
function noZodParaLlm(schema: z.ZodTypeAny): unknown {
  const def = schema._def as { typeName?: string };
  switch (def.typeName) {
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: [...(def as z.ZodEnumDef).values] };
    case 'ZodArray':
      return { type: 'array', items: noZodParaLlm((def as z.ZodArrayDef).type) };
    case 'ZodObject':
      return objetoParaLlm((schema as z.ZodObject<z.ZodRawShape>).shape);
    case 'ZodLiteral':
      return { const: (def as z.ZodLiteralDef).value };
    default:
      // Fail-closed do serializador: um nó não suportado NUNCA some em
      // silêncio do contrato passado à LLM.
      throw new FaseF0Error({
        code: 'SCHEMA_LLM_NAO_SUPORTADO',
        message: `tipo zod "${String(def.typeName)}" não suportado pelo serializador de schema para LLM.`,
      });
  }
}

function objetoParaLlm(shape: z.ZodRawShape): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [chave, schema] of Object.entries(shape)) {
    required.push(chave);
    properties[chave] = noZodParaLlm(schema);
  }
  return { type: 'object', properties, required, additionalProperties: false };
}

/**
 * Shape zod → schema JSON STRING para `req.schema` do transporte, com
 * `additionalProperties: false` (o teto de aulas é barrado na borda da
 * chamada, além do cheque de campo extra aqui dentro).
 */
export function schemaDeObjetoParaLlm(shape: z.ZodRawShape, titulo: string): string {
  return JSON.stringify({ title: titulo, ...objetoParaLlm(shape) });
}

/** O schema JSON STRING do brief (para `req.schema` do transporte). */
export function schemaBriefParaLlm(): string {
  return schemaDeObjetoParaLlm(BriefSchema.shape, 'brief');
}

// ─── vocabulário: carga (disco ou injetado) ─────────────────────────────────

/**
 * Cheque estrutural do atoms.json (sem zod: o SCHEMA_REGISTRY é a ÚNICA lista
 * de schemas da engine e é fixada por teste — nada novo pode ser registrado).
 * Fail-closed na carga: arquivo ilegível ou com forma errada é erro, nunca
 * vocabulário vazio.
 */
export function validarEstruturaAtomos(candidato: unknown, origem: string): AtomosJson {
  if (typeof candidato !== 'object' || candidato === null || Array.isArray(candidato)) {
    throw new FaseF0Error({
      code: 'VOCAB_ATOMOS_INVALIDO',
      message: `vocabulário inválido em ${origem}: esperado objeto JSON.`,
    });
  }
  const c = candidato as Record<string, unknown>;
  if (c.schema !== 1) {
    throw new FaseF0Error({
      code: 'VOCAB_ATOMOS_INVALIDO',
      message: `vocabulário inválido em ${origem}: schema "${String(c.schema)}" esperado 1.`,
    });
  }
  if (typeof c.node_version !== 'string' || typeof c.typescript_version !== 'string') {
    throw new FaseF0Error({
      code: 'VOCAB_ATOMOS_INVALIDO',
      message: `vocabulário inválido em ${origem}: falta node_version/typescript_version.`,
    });
  }
  const axes = c.axes;
  if (typeof axes !== 'object' || axes === null || Array.isArray(axes)) {
    throw new FaseF0Error({
      code: 'VOCAB_ATOMOS_INVALIDO',
      message: `vocabulário inválido em ${origem}: falta o objeto "axes".`,
    });
  }
  for (const eixo of ['node', 'op', 'decl', 'global', 'api'] as const) {
    const lista = (axes as Record<string, unknown>)[eixo];
    if (!Array.isArray(lista) || !lista.every((k) => typeof k === 'string')) {
      throw new FaseF0Error({
        code: 'VOCAB_ATOMOS_INVALIDO',
        message: `vocabulário inválido em ${origem}: o eixo "${eixo}" precisa ser lista de chaves string.`,
      });
    }
  }
  if (typeof c.total !== 'number' || c.total < 0) {
    throw new FaseF0Error({
      code: 'VOCAB_ATOMOS_INVALIDO',
      message: `vocabulário inválido em ${origem}: "total" ausente ou inválido.`,
    });
  }
  return candidato as AtomosJson;
}

/**
 * Carrega o atoms.json do disco.
 *
 * Sem argumento: o artefato do adaptador DEFAULT (`engine/vocab/atoms.json`).
 * Com `language`: o artefato DAQUELE adaptador (`caminhoAtomos`). O `caminho`
 * explícito continua vencendo os dois — é o gancho de teste que já existia.
 */
export function carregarAtomos(caminho?: string, language: LanguageId = DEFAULT_ADAPTER_ID): AtomosJson {
  const alvo = caminho ?? caminhoAtomos(language);
  let conteudo: string;
  try {
    conteudo = fs.readFileSync(alvo, 'utf8');
  } catch (causa) {
    throw new FaseF0Error({
      code: 'VOCAB_ATOMOS_INVALIDO',
      message: `não foi possível ler o vocabulário em ${alvo}: ${causa instanceof Error ? causa.message : String(causa)}`,
      detalhes: { caminho: alvo },
    });
  }
  let bruto: unknown;
  try {
    bruto = JSON.parse(conteudo) as unknown;
  } catch (causa) {
    throw new FaseF0Error({
      code: 'VOCAB_ATOMOS_INVALIDO',
      message: `vocabulário em ${alvo} não é JSON válido: ${causa instanceof Error ? causa.message : String(causa)}`,
      detalhes: { caminho: alvo },
    });
  }
  return validarEstruturaAtomos(bruto, alvo);
}

/** O conjunto de chaves do vocabulário (união dos eixos) — o universo do axioma. */
export function chavesDoVocabulario(atomos: AtomosJson): ReadonlySet<string> {
  const chaves = new Set<string>();
  for (const eixo of ['node', 'op', 'decl', 'global', 'api'] as const) {
    for (const chave of atomos.axes[eixo]) chaves.add(chave);
  }
  return chaves;
}

/**
 * Sugestões de correção por PREFIXO COMUM mais longo: para a chave inválida,
 * as até `maximo` chaves do vocabulário com o maior prefixo comum, ordenadas
 * por tamanho de prefixo (desc) e depois lexicograficamente (determinístico).
 * Sem nenhum prefixo comum, tenta a FAMÍLIA (segmento de eixo, ex. `decl:`);
 * sem nada, devolve vazio (= "nenhuma sugestão por prefixo", o `se houver`
 * do contrato).
 */
export function sugestoesPorPrefixo(
  chaveInvalida: string,
  chaves: ReadonlySet<string>,
  maximo = 3,
): string[] {
  function prefixoComum(a: string, b: string): number {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
    return n;
  }

  let candidatas: Array<[string, number]> = [];
  for (const chave of chaves) {
    if (chave === chaveInvalida) continue;
    const tamanho = prefixoComum(chaveInvalida, chave);
    if (tamanho > 0) candidatas.push([chave, tamanho]);
  }
  if (candidatas.length === 0) {
    // Nenhum prefixo comum em lugar nenhum: afunila para o eixo da chave.
    const eixo = `${chaveInvalida.split(':')[0]}:`;
    for (const chave of chaves) {
      if (chave.startsWith(eixo)) candidatas.push([chave, 0]);
    }
  }
  candidatas.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return candidatas.slice(0, maximo).map(([chave]) => chave);
}

// ─── o GATE do brief (PURO — mesmo para o caminho de carga) ─────────────────

export type Brief = z.infer<typeof BriefSchema>;

/**
 * O gate ÚNICO do brief (G-SCHEMA + A-P09-2 + axioma vs vocabulário). PURO —
 * sem LLM, sem IO. Usar no caminho de geração E em quem carregar `brief.json`
 * do disco ("erro NA CARGA" do contrato P-09): o mesmo veredito nos dois.
 *
 * Ordem dos cheques (cada um produz o erro MAIS específico):
 *   1. não-objeto → schema inválido;
 *   2. política de harness: AUSENTE = erro dedicado (nunca default silencioso);
 *      política CONHECIDA e REJEITADA (`POLITICAS_HARNESS_REJEITADAS`, inclui
 *      `none` — valor do orçamento, não de produto) = erro dedicado;
 *   3. campos extras RECURSIVO (fecha o schema da LLM — o zod striparia em
 *      silêncio, inclusive em objetos aninhados);
 *   4. `BriefSchema` — todos os campos obrigatórios, erro NOMEIA campo+motivo;
 *   5. axioma de entrada vs vocabulário: eixos FECHADOS (node/op/decl/global)
 *      por pertença estrita (construções inexistentes nomeadas com sugestões
 *      por prefixo); eixos ABERTOS (api:) e não-vocabulário (form:/term:) por
 *      FORMATO (`ATOM_KEY_RE`/`parseFormKey`).
 */
export function validarBrief(draft: unknown, atomos: AtomosJson): Brief {
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) {
    throw new FaseF0Error({
      code: 'BRIEF_SCHEMA_INVALIDO',
      message: 'draft do brief não é um objeto JSON.',
    });
  }
  const objeto = draft as Record<string, unknown>;

  // 2. política de harness — EXPLÍCITA, decisão de produto (A-P09-2 / D1).
  const politica = objeto.politica_de_harness;
  if (politica === undefined) {
    throw new FaseF0Error({
      code: 'POLITICA_HARNESS_AUSENTE',
      campo: 'politica_de_harness',
      message:
        'política de harness ausente no brief — campo obrigatório "politica_de_harness" ' +
        `(decisão de produto D1, docs §3.2; sem ela toda aula da primeira metade nasce violada — A-P09-2). ` +
        'Nunca default silencioso.',
    });
  }
  if (POLITICAS_HARNESS_REJEITADAS.includes(politica as (typeof POLITICAS_HARNESS_REJEITADAS)[number])) {
    const notaOrigem =
      politica === 'none'
        ? '"none" é valor LEGÍTIMO do orçamento (BudgetSchema, P-08: sem política), mas NÃO é política de produto do brief'
        : 'alternativa considerada e REJEITADA no documento (docs §3.2/D1)';
    throw new FaseF0Error({
      code: 'POLITICA_HARNESS_REJEITADA',
      campo: 'politica_de_harness',
      message:
        `política de harness "${String(politica)}" é REJEITADA — ${notaOrigem}: ` +
        `o brief só carrega a decisão de produto atual: "${POLITICA_HARNESS_DECIDIDA}".`,
      detalhes: { politica: String(politica), decidida: POLITICA_HARNESS_DECIDIDA },
    });
  }
  // Qualquer valor fora do enum do schema (`POLITICAS_HARNESS_DO_SCHEMA`) que
  // não seja política conhecida-rejeitada cai no `BriefSchema` abaixo, que
  // rejeita com o motivo exato (campo + enum esperado).

  // 3. campos extras ANTES do parse (o zod striparia em silêncio).
  rejeitarCamposExtras(objeto, BriefSchema.shape, 'BRIEF_CAMPO_DESCONHECIDO', 'draft do brief');

  // 4. schema zod — todos os campos obrigatórios (INV-05); erro nomeia campo+motivo.
  const resultado = BriefSchema.safeParse(objeto);
  if (!resultado.success) {
    throw new FaseF0Error({
      code: 'BRIEF_SCHEMA_INVALIDO',
      message: `brief inválido perante BriefSchema:\n${formatarErroCampos(resultado.error)}`,
    });
  }
  const brief = resultado.data;

  // 5. axioma de entrada vs vocabulário GERADO do P-05 — DECISÃO DE UNIVERSO
  //    (onda 2; v. cabeçalho e `EIXOS_FECHADOS_ATOMOS`): os eixos FECHADOS do
  //    extrator são validados por PERTENÇA estrita ao vocabulário; os eixos
  //    ABERTOS (`api:`) e os não-vocabulário (`form:`/`term:`) por FORMATO —
  //    o vocabulário é o piso de consciência do LLM, não o teto do universo.
  const chavesFechadas = new Set<string>();
  for (const eixo of EIXOS_FECHADOS_ATOMOS) {
    for (const chave of atomos.axes[eixo]) chavesFechadas.add(chave);
  }
  for (const criterio of brief.criterios_de_entrada) {
    if (chavesFechadas.has(criterio)) continue;
    const eixo = axisOf(criterio);

    // Eixo aberto/não-vocabulário: unicamente por formato — `api:`/`term:`
    // precisam ser chave bem-formada; `form:` precisa ser seletor parseável.
    if (eixo === 'api' || eixo === 'term') {
      if (isAtomKey(criterio)) continue;
      throw new FaseF0Error({
        code: 'AXIOMA_CONSTRUCAO_INEXISTENTE',
        campo: 'criterios_de_entrada',
        message:
          `chave do eixo ABERTO ${eixo} malformada em criterios_de_entrada: "${criterio}" ` +
          '(universo aberto validado por FORMATO — ATOM_KEY_RE).',
        detalhes: { construcao: criterio, eixo, motivo: 'formato' },
      });
    }
    if (eixo === 'form') {
      try {
        parseFormKey(criterio);
        continue;
      } catch (causa) {
        const detalheForm = causa instanceof FormSelectorError ? causa.message : String(causa);
        throw new FaseF0Error({
          code: 'AXIOMA_CONSTRUCAO_INEXISTENTE',
          campo: 'criterios_de_entrada',
          message:
            `seletor do eixo form: malformado em criterios_de_entrada: "${criterio}" ` +
            '(universo aberto validado por FORMATO — parseFormKey).',
          detalhes: { construcao: criterio, eixo: 'form', motivo: 'formato', detalhe: detalheForm },
        });
      }
    }

    // Eixo fechado (node/op/decl/global) desconhecido — ou chave sem eixo
    // reconhecível: erro NA CARGA nomeando a chave, com sugestões por prefixo.
    const sugestoes = sugestoesPorPrefixo(criterio, chavesFechadas);
    throw new FaseF0Error({
      code: 'AXIOMA_CONSTRUCAO_INEXISTENTE',
      campo: 'criterios_de_entrada',
      message:
        `construção inexistente no vocabulário citada em criterios_de_entrada: "${criterio}".` +
        (sugestoes.length > 0 ? ` Sugestões por prefixo: ${sugestoes.join(', ')}.` : ' Nenhuma sugestão encontrada por prefixo.'),
      detalhes: { construcao: criterio, ...(eixo !== null ? { eixo } : {}), sugestoes },
    });
  }

  return brief;
}

// ─── prompts de F0 (draft por LLM — cliente INJETADO) ───────────────────────

export interface F0BriefPromptContext {
  /** O assunto pedido pelo usuário (ex.: "javascript do zero"). */
  assunto: string;
  linguagem?: string;
  plataforma?: string;
  publicoAlvo?: string;
  /**
   * ADITIVO (onda 5): o ADAPTADOR que dita os defaults do prompt — o nome da
   * linguagem, a plataforma (o `runtime` do par (toolchain, runner) do §6) e o
   * arquivo de vocabulário anexado ao contexto. Default: o adaptador default.
   */
  language?: LanguageId;
}

/**
 * Os eixos que o prompt do brief ensina à LLM, e a FORMA de cada um.
 *
 * Eram cinco literais cravados na string do prompt. Agora vêm das mesmas
 * constantes que o resto da engine usa (`EIXOS_FECHADOS_ATOMOS` +
 * `AXIS_PREFIX` do alfabeto, e `DECLARATION_KINDS` para os kinds de
 * declaração) — um eixo novo no alfabeto aparece no prompt sem que ninguém
 * precise lembrar de editar uma frase. `api:` entra à parte dos fechados
 * porque ele é universo ABERTO no validador (ver o cabeçalho de
 * `vocab/generate.ts`), mas o brief cita as duas coisas.
 */
const EIXOS_DO_PROMPT = [...EIXOS_FECHADOS_ATOMOS, 'api'] as const;

const FORMA_DO_EIXO: Readonly<Record<(typeof EIXOS_DO_PROMPT)[number], string>> = {
  node: '<Nó>',
  op: '<família>:<op>',
  decl: `<${DECLARATION_KINDS.join('|')}>`,
  global: '<nome>',
  api: '<caminho>',
};

function eixosDoPrompt(): string {
  return EIXOS_DO_PROMPT.map((eixo) => `${AXIS_PREFIX[eixo]}:${FORMA_DO_EIXO[eixo]}`).join(', ');
}

export const SYSTEM_PROMPT_F0 =
  'Escritor único da fase F0 de uma engine de trilhas (docs/16-engine-de-trilha.md §4). ' +
  'Toda saída é JSON ESTRITO conforme o schema informado, em pt-BR, sem markdown e sem campos extras. ' +
  'Fail-closed: nunca omita campo obrigatório nem invente valores fora do contrato.';

/**
 * O prompt do draft do brief. Sem conteúdo didático (prosa de aula) — é a
 * INSTRUÇÃO de geração, não a aula. A contagem de aulas é proibida em
 * qualquer forma (D2); a política de harness é decidida (D1).
 */
export function promptF0Brief(ctx: F0BriefPromptContext): string {
  // Os defaults vêm do ADAPTADOR, não de dois literais: `id` é a LINGUAGEM e
  // `defaultRuntime` é a PLATAFORMA — o §6 abre o par (`'nodejs'` não é uma
  // linguagem, é um runtime), e o prompt passa a dizer o par certo.
  const adapter = getAdapter(ctx.language ?? DEFAULT_ADAPTER_ID);
  const linguagem = ctx.linguagem ?? adapter.id;
  const plataforma = ctx.plataforma ?? adapter.defaultRuntime;
  const vocabulario = path.basename(caminhoAtomos(adapter.id));
  return [
    'Você é o escritor único da fase F0 de uma trilha de aprendizado (engine de trilhas, docs §4 F0).',
    '',
    `Assunto da trilha: ${ctx.assunto}`,
    `Linguagem: ${linguagem} · Plataforma: ${plataforma}`,
    ...(ctx.publicoAlvo ? [`Público-alvo informado: ${ctx.publicoAlvo}`] : []),
    '',
    'Produza o BRIEF da trilha como JSON EXATO, com estes campos e NENHUM outro:',
    '- tema: título curto da trilha (pt-BR).',
    '- objetivo_geral: o que o aluno será capaz de fazer ao final (pt-BR).',
    '- publico_alvo: quem é o aluno desta trilha (pt-BR).',
    `- criterios_de_entrada: lista de CHAVES EXATAS do vocabulário de construções que o aluno JÁ domina ao entrar; vazio = trilha de senso iniciante. Só chaves que existem no vocabulário (${vocabulario} — anexo ao contexto; eixos: ${eixosDoPrompt()}). Exemplos: "decl:${DECLARATION_KINDS[0]}", "op:binary:===", "api:Array.prototype.push".`,
    '- construcoes_alvo: inventário de construções e APIs candidatas que a trilha deve ensinar (chaves no mesmo formato; pode ser amplo).',
    `- politica_de_harness: a DECISÃO de produto D1 (docs §3.2): SEMPRE "${POLITICA_HARNESS_DECIDIDA}" — o harness de teste entra no orçamento receptivo da aula 1 como região congelada do starter. Estes valores são REJEITADOS: ${POLITICAS_HARNESS_REJEITADAS.map((p) => `"${p}"`).join(', ')} (alternativas do docs §3.2 ou valores de outros artefatos) — não os escolha.`,
    '- restricoes: restrições de conteúdo/escopo da trilha (pt-BR; vazio = sem restrições adicionais).',
    '- justificativa: por que esta trilha, para este público, agora (pt-BR).',
    '- aprovado: false — o brief sai como rascunho; a aprovação é portão humano posterior.',
    '',
    'REGRAS DURAS:',
    '1. NÃO existe teto nem contagem de aulas: nenhum campo de quantidade de aulas (teto, máximo, count, quantidade de aulas, duração). A contagem de aulas é SAÍDA de fases posteriores da engine (docs §12 D2). Qualquer campo assim invalida o brief.',
    '2. politica_de_harness é OBRIGATÓRIA e deve ser a decisão de produto.',
    '3. JSON puro: sem markdown, sem comentários, sem campos fora do contrato.',
  ].join('\n');
}

// ─── a fase F0 em si ────────────────────────────────────────────────────────

export interface F0BriefInput {
  /** Transporte INJETADO (fake nos testes; a engine fornece o de P-01). */
  callLlm: EngineLlm['callLlm'];
  /** Assunto pedido pelo usuário — o tema a produzir. */
  assunto: string;
  linguagem?: string;
  plataforma?: string;
  publicoAlvo?: string;
  /** Vocabulário INJETADO (testes) — default: carregado de disco. */
  atomos?: AtomosJson;
  /** Caminho alternativo do atoms.json (default: engine/vocab/atoms.json). */
  atomsPath?: string;
  stageVersion?: string;
  timeoutMs?: number;
  maxTokens?: number;
}

/**
 * A fase F0-BRIEF: drafta o brief via `callLlm` (etapa `f0-brief`) e o valida
 * pelo MESMO gate de carga (`validarBrief`). Fail-closed: falha da LLM
 * propaga `LlmStageError` estruturado; draft inválido vira `FaseF0Error`.
 * Devolve o artefato validado (pronto para persistir como `brief.json`) + o
 * resultado da chamada (usage/telemetria).
 */
export async function gerarBrief(input: F0BriefInput): Promise<{ brief: Brief; llm: LlmCallResult }> {
  const atomos = input.atomos ?? carregarAtomos(input.atomsPath);
  const req: LlmCallRequest = {
    prompt: promptF0Brief({
      assunto: input.assunto,
      linguagem: input.linguagem,
      plataforma: input.plataforma,
      publicoAlvo: input.publicoAlvo,
    }),
    system: SYSTEM_PROMPT_F0,
    schema: schemaBriefParaLlm(),
    stageVersion: input.stageVersion ?? STAGE_VERSION_BRIEF,
    timeoutMs: input.timeoutMs ?? TIMEOUT_BRIEF_MS,
    maxTokens: input.maxTokens ?? MAX_TOKENS_BRIEF,
  };
  const llm = await input.callLlm(ETAPA_BRIEF, req);
  const draft = parsearDraftLlm(llm.content, ETAPA_BRIEF, 'BRIEF_DRAFT_NAO_JSON');
  const brief = validarBrief(draft, atomos);
  return { brief, llm };
}