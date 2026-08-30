/**
 * app/electron/main/engine/phases/f2Decompose.ts — FASE F2: DECOMPOSIÇÃO
 * ATÔMICA (pacote P-15, `docs/16-engine-de-trilha.md` §3.6/§3.7 e §4).
 *
 * OBJETIVO: transformar assunto grosso em unidades atômicas — a fase que faz
 * "variáveis" virar `let` + atribuição, reatribuição, `const`, `const` + erro
 * de reatribuição, escopo de bloco e nomenclatura, e "função" virar a
 * sequência isolada (declaração; chamada; parâmetro; argumento; corpo;
 * `return`) MAIS um nó de integração parâmetro×`return` (§3.6/§3.7).
 *
 * DECISÕES DE PROJETO (todas no escopo deste pacote):
 *
 * 1. DUAS chamadas de LLM por assunto, nunca uma (A-P15-2, convenção §7):
 *    a primeira é o PROMPT DE RECEITA (texto livre — criatividade sem
 *    template); a segunda é a NORMALIZAÇÃO (barata, converte a receita no
 *    schema). Combinar template rígido com sequência de passos na mesma
 *    chamada não funciona, e o sintoma é silencioso — daí a separação ser
 *    estrutural, não estilística. Ambas passam pelo `callLlm` injetado
 *    (runtime/callLlm.ts — SEM_LLM, backoff, timeout, cache), com
 *    `stageVersion` e `timeoutMs` obrigatórios por chamada.
 * 2. UM decompositor POR FAMÍLIA de assunto ('sintaxe' | 'estrutura-de-dados'
 *    | 'algoritmo' | 'api-runtime' | 'ferramenta'), cada um com prompt e
 *    banco de EXEMPLARES PRÓPRIOS (A-P15-2, teste 7): exemplar de um domínio
 *    não ensina a decompor outro. `promptDecompositor(familia)` é puro; o
 *    banco é tipado (`EXEMPLARES_POR_FAMILIA`). Os exemplares são exemplos
 *    META da fase — mostram a GRANULARIDADE da decomposição, nunca conteúdo
 *    didático da trilha (declarados como tais no prompt).
 * 3. NÃO se semeia com a estrutura de módulos atual da trilha (os 7 módulos
 *    grossos são exatamente o que esta fase conserta): o prompt PROÍBE citar
 *    módulos/aulas existentes e manda decompor pelo critério atômico.
 * 4. O TESTE DE ATOMICIDADE é CÓDIGO PURO (`atomicity.ts` — A-P15-2b), nunca
 *    pergunta à LLM. Candidato que falha em QUALQUER critério → DIVIDIR por
 *    nova rodada de 2 chamadas (recuo limitado — `recuoMaximo`, sem laço
 *    aberto).
 * 5. TODO nó nasce com: `introduces` (construções validadas contra o
 *    vocabulário do P-05 — chave inexistente = erro), `kc_type`, `ei_class`,
 *    `role` ('isolado' | 'integration' — nó integrativo OBRIGA `erklarung`,
 *    §3.7) e AO MENOS UM evento de avaliação proposto (sem evento não é
 *    componente de conhecimento — rejeitado, A-P15-2b2).
 * 6. LIMITE de construções: nó com MAIS DE 2 construções produtivas é
 *    REJEITADO (teto §3.6) antes mesmo do teste de atomicidade.
 * 7. MERGE determinístico por CHAVE DE CONCEITO (`snake_case`; fora do padrão
 *    = rejeitado): escritor único; ARQUIVOS DE CANDIDATOS DISJUNTOS por
 *    worker — colisão de arquivo é erro de configuração e a posse é validada
 *    ANTES do dispatch (mesma semântica da chave canônica do escalonador,
 *    PAR-02 §4.1: normalize + trailing slash + case-blind). O merge
 *    deduplica: mesma `chave_conceito` de dois workers → UM nó com
 *    justificativa de merge. Duplicata DENTRO do mesmo worker é erro
 *    (fail-closed — é defeito de LLM, não dado legítimo). E a UNIÃO entre nó
 *    aceito do pai e filhos da divisão é validada ANTES do retorno: filho que
 *    colide com chave já aceita é erro estruturado nomeando a duplicata
 *    (colisão de nomenclatura entre pai e filho é defeito do prompt).
 *
 * FAIL-CLOSED em todo o fluxo: saída de LLM que não normaliza, nó que viola
 * o schema/vocabulário, arquivo de candidatos ilegível — tudo vira ERRO
 * estruturado (F2ValidationError / F2ConfigurationError), nunca descarte
 * silencioso.
 *
 * API PARA AS PRÓXIMAS FASES (P-16/P-17): `decomporAssunto` produz
 * `NoAtomico[]` (o nó do grafo F3); `testarAtomicidade` (importado de
 * atomicity.ts) é o G-ATOM; `mergeCandidatos`/`validarPosseDosOutputs`/
 * `carregarVocabulario` dão a forma do artefato e revalidação a jusante.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { EngineLlm } from '../runtime/callLlm';
import {
  PESOS_CRONOMETRAGEM_DEFAULT,
  REGUA_ATOMICIDADE_DEFAULT,
  testarAtomicidade,
  type CandidatoAtomicidade,
  type FalhaAtomicidade,
  type PesosCronometragem,
  type ReguaAtomicidade,
} from './atomicity';
// FONTE ÚNICA do caminho do vocabulário: a constante exportada pelo f0Brief
// (engine/vocab/atoms.json, UM '..' a partir de phases/). Centralizar aqui
// impede um segundo default divergente (regressão do '..' duplo da revisão
// da onda 2 — o caminho errado resolvia para app/electron/main/vocab, que
// não existe).
import { CAMINHO_ATOMOS_DEFAULT } from './f0Brief';

// ─── domínio da fase ─────────────────────────────────────────────────────────

/** As cinco famílias de assunto — UM decompositor por família (item 2). */
export const FAMILIAS_ASSUNTO = [
  'sintaxe',
  'estrutura-de-dados',
  'algoritmo',
  'api-runtime',
  'ferramenta',
] as const;

export type FamiliaAssunto = (typeof FAMILIAS_ASSUNTO)[number];

/** Tipo de conhecimento do nó (§7.1 regra 4 — o formato segue o tipo). */
export const KC_TYPES = ['fato', 'categoria', 'regra', 'principio', 'integrativo'] as const;
export type KcType = (typeof KC_TYPES)[number];

/**
 * Classe de interatividade dos elementos novos (§3.6 regras 2–3; §7.1 regra
 * 5): 'interativo' = só fazem sentido juntos (`for` com condição, incremento
 * e corpo) → teto menor e worked example obrigatório; 'isolado' = aprendíveis
 * isoladamente (nomes de tipos, métodos, o que é `NaN`) → teto maior.
 */
export const EI_CLASSES = ['isolado', 'interativo'] as const;
export type EiClass = (typeof EI_CLASSES)[number];

/** Papel do nó: 'isolado' ou 'integration' (§3.7 — composição não é de graça). */
export const PAPEIS_DE_NO = ['isolado', 'integration'] as const;
export type PapelNo = (typeof PAPEIS_DE_NO)[number];

/** Chave de conceito: snake_case estrito (item 7 — fora do padrão = rejeitado). */
export const CHAVE_CONCEITO_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

// ─── o nó atômico ────────────────────────────────────────────────────────────

/** Um evento de avaliação proposto — sem evento o nó não é componente (item 5). */
export interface EventoDeAvaliacao {
  /** Chave estável snake_case do evento (ex.: `completar_letra_deletada`). */
  id: string;
  /** Forma do evento; o completion de UMA lacuna é o que o teste de §3.6 exige. */
  tipo: 'completion-uma-lacuna' | 'predicao' | 'drill';
  /** O que o aluno faz (enunciado propositivo, não conteúdo da trilha). */
  descricao: string;
  /** A construção exercitada — precisa estar em `introduces` do MESMO nó. */
  atomo_alvo: string;
  /** A proposição da lacuna única — span que contém o átomo-alvo (criterio 2). */
  lacuna: {
    /** Descrição textual do trecho apagado (o que o aluno completa). */
    span: string;
    /** OBRIGATÓRIO true — a lacuna precisa conter o átomo-alvo (A-P15-2b2). */
    contem_atomo_alvo: boolean;
  };
}

/**
 * O nó atômico — a unidade de conhecimento que F3 vira vértice do grafo.
 * ORDEM DOS CAMPOS segue o INV-04 do projeto: justificativa ANTES da decisão
 * (`justificativa` e `erklarung` antes de `role`). INV-05: nenhum campo
 * opcional — `erklarung` vazio é o valor explícito para nó isolado.
 */
export interface NoAtomico {
  /** Chave estável snake_case — a CHAVE DE MERGE (item 7). */
  chave_conceito: string;
  /** Nome curto humano do nó (ex.: "let e atribuição"). */
  nome: string;
  /** Família que produziu o nó (o decompositor é por família). */
  familia: FamiliaAssunto;
  /** Construções que o nó introduz, nas duas faixas (§3.2). */
  introduces: {
    /** O aluno pode LER sem escrever. */
    receptive: string[];
    /** Pode ser EXIGIDO do aluno — no máximo 2 (teto §3.6, item 6). */
    productive: string[];
  };
  /** Tipo de conhecimento (§7.1 regra 4). */
  kc_type: KcType;
  /** Interatividade dos elementos novos (§3.6 regras 2–3). */
  ei_class: EiClass;
  /** Por que este nó existe (INV-04 — justificativa ANTES de qualquer decisão). */
  justificativa: string;
  /**
   * Erklärung — a explicação OBRIGATÓRIA do nó integrativo (§3.7, §7.1 regra
   * 4: "Integrativo → explicação obrigatória"). Vazia (`""`) em nó isolado;
   * não-vazia E somente em `role: "integration"` (invariante biunívoca).
   */
  erklarung: string;
  /** Papel do nó: composição marcada `integration` (§3.7). */
  role: PapelNo;
  /** AO MENOS UM evento de avaliação (item 5, A-P15-2b2). */
  eventos_de_avaliacao: EventoDeAvaliacao[];
}

// ─── vocabulário do P-05 ─────────────────────────────────────────────────────

/**
 * Carrega o vocabulário fechado do P-05 (`vocab/atoms.json`, gerado por
 * máquina — chaves dos eixos node/op/decl/global/api). O caminho DEFAULT é a
 * FONTE ÚNICA compartilhada com o F0: `CAMINHO_ATOMOS_DEFAULT` (f0Brief.ts —
 * engine/vocab/atoms.json, UM '..' a partir de phases/). FAIL-CLOSED: arquivo
 * ilegível ou shape inesperado é ERRO — um vocabulário ausente nunca vira
 * allowlist vazia. `term:` e `form:` não fazem parte deste artefato e são
 * tratados como chave fora do vocabulário (premissa declarada: o piso de
 * consciência do LLM é fechado; termos da prosa não são construções).
 */
export function carregarVocabulario(arquivo?: string): ReadonlySet<string> {
  const caminho = arquivo ?? CAMINHO_ATOMOS_DEFAULT;
  let bruto: string;
  try {
    bruto = fs.readFileSync(caminho, 'utf8');
  } catch (erro) {
    throw new Error(`f2: vocabulário ilegível em ${caminho} — ${erro instanceof Error ? erro.message : String(erro)}`);
  }
  let dados: unknown;
  try {
    dados = JSON.parse(bruto);
  } catch (erro) {
    throw new Error(`f2: vocabulário não é JSON válido em ${caminho} — ${erro instanceof Error ? erro.message : String(erro)}`);
  }
  if (typeof dados !== 'object' || dados === null || !('axes' in dados)) {
    throw new Error(`f2: vocabulário sem eixo "axes" em ${caminho}`);
  }
  const axes = (dados as { axes: unknown }).axes;
  if (typeof axes !== 'object' || axes === null || Array.isArray(axes)) {
    throw new Error(`f2: eixo "axes" inválido em ${caminho}`);
  }
  const chaves = new Set<string>();
  for (const [eixo, lista] of Object.entries(axes as Record<string, unknown>)) {
    if (!Array.isArray(lista)) {
      throw new Error(`f2: eixo "${eixo}" não é uma lista em ${caminho}`);
    }
    for (const item of lista) {
      if (typeof item !== 'string') {
        throw new Error(`f2: chave não-string no eixo "${eixo}" em ${caminho}`);
      }
      chaves.add(item);
    }
  }
  if (chaves.size === 0) {
    throw new Error(`f2: vocabulário vazio em ${caminho} — allowlist vazia é proibida`);
  }
  return chaves;
}

// ─── validação estrutural do nó (PURO, fail-closed) ─────────────────────────

/** Resultado da validação: `no` presente ⇔ `valido`. */
export interface ResultadoValidacaoNo {
  valido: boolean;
  erros: readonly string[];
  no: NoAtomico | null;
}

function campoString(obj: Record<string, unknown>, campo: string, erros: string[]): string | null {
  const valor = obj[campo];
  if (typeof valor !== 'string') {
    erros.push(`campo "${campo}" precisa ser string (recebido: ${typeof valor})`);
    return null;
  }
  return valor;
}

function validarListaDeChaves(
  lista: unknown,
  rotulo: string,
  vocab: ReadonlySet<string>,
  erros: string[],
): void {
  if (!Array.isArray(lista)) {
    erros.push(`${rotulo} precisa ser um array`);
    return;
  }
  for (const item of lista) {
    if (typeof item !== 'string') {
      erros.push(`${rotulo} contém item não-string`);
      continue;
    }
    if (!vocab.has(item)) {
      erros.push(`construção fora do vocabulário (P-05): "${item}"`);
    }
  }
}

/**
 * Valida um nó contra as REGRAS DURAS (PURO — nada de LLM aqui). As violações
 * são REJEIÇÃO (o nó não entra na fase): chave de conceito fora do
 * snake_case, construção fora do vocabulário, mais de 2 construções
 * produtivas, nó integrativo sem `erklarung` (e isolado com), e nenhum evento
 * de avaliação. Aceita `unknown` — o mesmo caminho serve à saída brutal da
 * normalização e à revalidação de artefatos já escritos.
 */
export function validarNoAtomico(entrada: unknown, vocab: ReadonlySet<string>): ResultadoValidacaoNo {
  const erros: string[] = [];
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) {
    return { valido: false, erros: ['nó não é um objeto'], no: null };
  }
  const r = entrada as Record<string, unknown>;

  const chave_conceito = campoString(r, 'chave_conceito', erros);
  if (chave_conceito !== null && !CHAVE_CONCEITO_RE.test(chave_conceito)) {
    erros.push(`chave de conceito fora do padrão snake_case: "${chave_conceito}"`);
  }
  const nome = campoString(r, 'nome', erros);
  if (nome !== null && nome.trim().length === 0) erros.push('nome vazio');

  const familia = campoString(r, 'familia', erros);
  if (familia !== null && !(FAMILIAS_ASSUNTO as readonly string[]).includes(familia)) {
    erros.push(`família desconhecida: "${familia}"`);
  }

  const introduces = r['introduces'];
  const receptive: string[] = [];
  const productive: string[] = [];
  if (typeof introduces !== 'object' || introduces === null || Array.isArray(introduces)) {
    erros.push('introduces precisa ser um objeto com receptive e productive');
  } else {
    const ir = introduces as Record<string, unknown>;
    validarListaDeChaves(ir['receptive'], 'introduces.receptive', vocab, erros);
    validarListaDeChaves(ir['productive'], 'introduces.productive', vocab, erros);
    if (Array.isArray(ir['receptive'])) receptive.push(...(ir['receptive'] as string[]));
    if (Array.isArray(ir['productive'])) productive.push(...(ir['productive'] as string[]));
  }
  if (productive.length > 2) {
    erros.push(
      `mais de 2 construções produtivas novas (${productive.length}) — teto do §3.6 é ≤ 2, nunca 3`,
    );
  }

  const kc_type = campoString(r, 'kc_type', erros);
  if (kc_type !== null && !(KC_TYPES as readonly string[]).includes(kc_type)) {
    erros.push(`kc_type desconhecido: "${kc_type}"`);
  }
  const ei_class = campoString(r, 'ei_class', erros);
  if (ei_class !== null && !(EI_CLASSES as readonly string[]).includes(ei_class)) {
    erros.push(`ei_class desconhecido: "${ei_class}"`);
  }
  const justificativa = campoString(r, 'justificativa', erros);
  if (justificativa !== null && justificativa.trim().length === 0) {
    erros.push('justificativa vazia — todo nó precisa do motivo');
  }
  const erklarung = campoString(r, 'erklarung', erros) ?? '';
  const role = campoString(r, 'role', erros);
  if (role !== null && !(PAPEIS_DE_NO as readonly string[]).includes(role)) {
    erros.push(`role desconhecido: "${role}"`);
  }
  if (role === 'integration' && erklarung.trim().length === 0) {
    erros.push('nó integrativo (role "integration") exige erklärung (§3.7 — composição não é de graça)');
  }
  if (role === 'isolado' && erklarung.trim().length > 0) {
    erros.push('nó isolado não pode carregar erklärung — a explicação de composição exige role "integration"');
  }
  if (kc_type === 'integrativo' && role !== 'integration') {
    erros.push('kc_type "integrativo" exige role "integration" (§3.7 — conhecimento de composição é nó próprio)');
  }

  const eventos = r['eventos_de_avaliacao'];
  const eventos_validos: EventoDeAvaliacao[] = [];
  if (!Array.isArray(eventos)) {
    erros.push('sem evento de avaliação proposto — sem evento de avaliação não é componente de conhecimento (A-P15-2b2)');
  } else if (eventos.length === 0) {
    erros.push('sem evento de avaliação proposto — sem evento de avaliação não é componente de conhecimento (A-P15-2b2)');
  } else {
    const construcoes = new Set([...receptive, ...productive]);
    eventos.forEach((ev, i) => {
      const prefixo = `evento[${i}]`;
      if (typeof ev !== 'object' || ev === null || Array.isArray(ev)) {
        erros.push(`${prefixo}: evento não é um objeto`);
        return;
      }
      const er = ev as Record<string, unknown>;
      const id = campoString(er, 'id', erros);
      if (id !== null && !CHAVE_CONCEITO_RE.test(id)) {
        erros.push(`${prefixo}: id fora do padrão snake_case: "${id}"`);
      }
      const tipo = campoString(er, 'tipo', erros);
      const tipos = ['completion-uma-lacuna', 'predicao', 'drill'];
      if (tipo !== null && !tipos.includes(tipo)) {
        erros.push(`${prefixo}: tipo desconhecido: "${tipo}"`);
      }
      const descricao = campoString(er, 'descricao', erros);
      if (descricao !== null && descricao.trim().length === 0) {
        erros.push(`${prefixo}: descricao vazia`);
      }
      const alvo = campoString(er, 'atomo_alvo', erros);
      if (alvo !== null && !construcoes.has(alvo)) {
        erros.push(`${prefixo}: atomo_alvo "${alvo}" não está em introduces do MESMO nó`);
      }
      const lacuna = er['lacuna'];
      if (typeof lacuna !== 'object' || lacuna === null || Array.isArray(lacuna)) {
        erros.push(`${prefixo}: lacuna ausente ou inválida`);
      } else {
        const lr = lacuna as Record<string, unknown>;
        const span = campoString(lr, 'span', erros);
        if (span !== null && span.trim().length === 0) erros.push(`${prefixo}: lacuna.span vazio`);
        const contem = lr['contem_atomo_alvo'];
        if (typeof contem !== 'boolean') {
          erros.push(`${prefixo}: lacuna.contem_atomo_alvo precisa ser boolean`);
        } else if (contem !== true) {
          erros.push(`${prefixo}: a lacuna precisa conter o átomo-alvo (contem_atomo_alvo=true) — critério 2 do §3.6`);
        }
      }
      if (id !== null && tipo !== null && descricao !== null && alvo !== null && contemValido(lacuna)) {
        eventos_validos.push({
          id,
          tipo: tipo as EventoDeAvaliacao['tipo'],
          descricao,
          atomo_alvo: alvo,
          lacuna: { span: (lacuna as Record<string, unknown>)['span'] as string, contem_atomo_alvo: true },
        });
      }
    });
  }

  if (erros.length > 0) {
    return { valido: false, erros, no: null };
  }
  const no: NoAtomico = {
    chave_conceito: chave_conceito as string,
    nome: nome as string,
    familia: familia as FamiliaAssunto,
    introduces: { receptive, productive },
    kc_type: kc_type as KcType,
    ei_class: ei_class as EiClass,
    justificativa: justificativa as string,
    erklarung,
    role: role as PapelNo,
    eventos_de_avaliacao: eventos_validos,
  };
  return { valido: true, erros: [], no };
}

function contemValido(lacuna: unknown): boolean {
  if (typeof lacuna !== 'object' || lacuna === null) return false;
  const lr = lacuna as Record<string, unknown>;
  return (
    typeof lr['span'] === 'string' &&
    (lr['span'] as string).trim().length > 0 &&
    lr['contem_atomo_alvo'] === true
  );
}

/** Adaptador nó F2 → candidato da atomicidade (ei_class vira o palco). */
export function candidatoDeNo(no: NoAtomico): CandidatoAtomicidade {
  return {
    construcoes_produtivas: no.introduces.productive,
    construcoes_receptivas: no.introduces.receptive,
    elementos_nao_interativos: 0,
    elementos_interagem: no.ei_class === 'interativo',
  };
}

// ─── erros estruturados (fail-closed) ────────────────────────────────────────

export const F2_ERRO_CODES = {
  /** Colisão de posse de arquivo de candidatos (antes do dispatch). */
  CONFIGURACAO: 'F2_CONFIG_ERROR',
  /** Nó rejeitado (schema/vocabulário) ou saída de LLM que não normaliza. */
  VALIDACAO: 'F2_VALIDATION_ERROR',
  /** Divisão recursiva estourou o recuo máximo — não convergiu. */
  DIVISAO: 'F2_DIVISION_LIMIT',
} as const;

export interface RejeicaoNo {
  indice: number;
  chave: string | null;
  erros: readonly string[];
}

export class F2ConfigurationError extends Error {
  readonly code = F2_ERRO_CODES.CONFIGURACAO;
  readonly colisoes: readonly string[];
  constructor(colisoes: readonly string[]) {
    super(`f2: colisão de posse de arquivo de candidatos — ${colisoes.join('; ')}`);
    this.name = 'F2ConfigurationError';
    this.colisoes = colisoes;
  }
}

export class F2ValidationError extends Error {
  readonly code = F2_ERRO_CODES.VALIDACAO;
  readonly rejeicoes: readonly RejeicaoNo[];
  constructor(mensagem: string, rejeicoes: readonly RejeicaoNo[] = []) {
    super(`f2: ${mensagem}`);
    this.name = 'F2ValidationError';
    this.rejeicoes = rejeicoes;
  }
}

export class F2DivisaoLimitError extends Error {
  readonly code = F2_ERRO_CODES.DIVISAO;
  readonly assunto: string;
  readonly profundidade: number;
  readonly falhas: readonly FalhaAtomicidade[];
  constructor(assunto: string, profundidade: number, falhas: readonly FalhaAtomicidade[]) {
    super(
      `f2: o assunto "${assunto}" não converge em átomos após ${profundidade} divisões (falhas: ${falhas
        .map((f) => f.criterio)
        .join(', ')}) — recuo máximo atingido, sem laço aberto`,
    );
    this.name = 'F2DivisaoLimitError';
    this.assunto = assunto;
    this.profundidade = profundidade;
    this.falhas = falhas;
  }
}

// ─── etapas e versões das chamadas (identidade do cache do transporte) ───────

export const F2_ETAPA_DECOMPOSICAO = 'f2-decomposicao';
export const F2_ETAPA_NORMALIZACAO = 'f2-normalizacao';
export const F2_DECOMPOSICAO_STAGE_VERSION = 'f2-decomposicao-v1';
export const F2_NORMALIZACAO_STAGE_VERSION = 'f2-normalizacao-v1';
/** A chamada criativa (receita) é a mais cara — deadline mais folgado. */
export const F2_DECOMPOSICAO_TIMEOUT_MS = 60_000;
/** A normalização é barata — leitura de receita + preenchimento de schema. */
export const F2_NORMALIZACAO_TIMEOUT_MS = 30_000;
/** Recuo máximo de divisões recursivas — NENHUM laço aberto (regra dura). */
export const LIMITE_RECUO_DIVISAO = 3;

const F2_SYSTEM_DECOMPOSICAO =
  'Você é o decompositor atômico da fase F2 da engine de trilhas. ' +
  'Decompõe assuntos grossos em unidades atômicas segundo o teste de atomicidade ' +
  '(demonstrável, exercitável com UMA lacuna, orçamentável, cronometrável em 120s). ' +
  'Você responde em TEXTO LIVRE — nunca JSON.';

const F2_SYSTEM_NORMALIZACAO =
  'Você é o normalizador da fase F2 da engine de trilhas. ' +
  'Converte a receita de decomposição em nós estruturados. ' +
  'Sua resposta é EXCLUSIVAMENTE o array JSON — nenhuma prosa, nenhum comentário, nenhum fence.';

// ─── banco de exemplares META por família ────────────────────────────────────

/**
 * Um exemplar da fase: um assunto da família já decomposto, como EXEMPLO META
 * da GRANULARIDADE — NÃO é conteúdo didático da trilha, e o prompt declara
 * isso literalmente. O exemplar ensina a FORMA da decomposição (quantos nós,
 * o que é integração, o que é isolado), nunca o conteúdo.
 */
export interface ExemplarDecomposicao {
  assunto: string;
  familia: FamiliaAssunto;
  /** Receita META em texto livre — as unidades e por que são atômicas. */
  receita: string;
  /** Os nós esperados daquela decomposição (nomes META, só para orientar). */
  nos_esperados: readonly string[];
  /** Por que este exemplar pertence a ESTA família e não a outra. */
  por_que: string;
}

/**
 * O banco TIPADO de exemplares — um por família, todos do próprio domínio
 * (item 2, A-P15-2): exemplar de sintaxe não ensina a decompor ferramenta.
 * Declarados META no próprio texto da receita.
 */
export const EXEMPLARES_POR_FAMILIA: Readonly<Record<FamiliaAssunto, readonly ExemplarDecomposicao[]>> = {
  'sintaxe': [
    {
      assunto: 'função',
      familia: 'sintaxe',
      receita:
        '[EXEMPLO META DA FASE — não é conteúdo didático, só mostra a granularidade.] ' +
        'O assunto "função" NÃO é um átomo: o teste de atomicidade o reprova (não cabe numa lacuna única, ' +
        'não cabe em 120s). Ele se decompõe na sequência isolada: declaração de função; chamada de função; ' +
        'parâmetro; argumento; corpo; return — cada um um nó com UMA construção. E, porque parâmetro ' +
        'interage com return (§3.7), a decomposição emite MAIS UM nó: "parâmetro interagindo com return", ' +
        'role integration, com erklärung explicando a composição. Isolados não têm erklärung.',
      nos_esperados: [
        'declaracao_de_funcao',
        'chamada_de_funcao',
        'parametro',
        'argumento',
        'corpo_da_funcao',
        'return',
        'parametro_interagindo_com_return',
      ],
      por_que:
        'a doutrina de sintaxe é "uma construção sintática por nó, na forma mais simples, com nó de integração para interação"; ' +
        'este exemplar mostra exatamente essa divisão dentro do próprio domínio sintático.',
    },
  ],
  'estrutura-de-dados': [
    {
      assunto: 'array',
      familia: 'estrutura-de-dados',
      receita:
        '[EXEMPLO META DA FASE — não é conteúdo didático, só mostra a granularidade.] ' +
        '"array" é a ESTRUTURA, não um átomo: a decomposição separa a criação da estrutura dos ACESSOS e das ' +
        'OPERAÇÕES — criação de coleção (um nó), acesso por posição (um nó), tamanho da coleção (um nó), ' +
        'inserção (um nó), remoção (um nó). Cada operação é aprendível isoladamente (ei_class isolado): ' +
        'elementos não interativos têm réguas mais folgadas. Nenhum nó agrupa duas operações.'
      ,
      nos_esperados: [
        'criacao_de_colecao',
        'acesso_por_posicao',
        'tamanho_da_colecao',
        'insercao_de_elemento',
        'remocao_de_elemento',
      ],
      por_que:
        'a doutrina de estrutura-de-dados é "estrutura ≠ operação": o exemplar separa as superfícies de acesso ' +
        'da criação — granularidade própria deste domínio (uma operação de API por nó).',
    },
  ],
  'algoritmo': [
    {
      assunto: 'ordenação por seleção',
      familia: 'algoritmo',
      receita:
        '[EXEMPLO META DA FASE — não é conteúdo didático, só mostra a granularidade.] ' +
        'Um ALGORITMO é uma sequência, e a sequência não é átomo: cada PASSO vira nó — comparação de dois valores, ' +
        'troca de posições, percorrimento da coleção, condição de parada. Os passos interagem entre si, então a ' +
        'decomposição emite UM nó de integração por interação custosa (ex.: "percorrimento mantendo o menor valor"), ' +
        'role integration com erklärung. O algoritmo inteiro nunca é um nó.'
      ,
      nos_esperados: [
        'comparacao_de_valores',
        'troca_de_posicoes',
        'percorrimento_da_colecao',
        'condicao_de_parada',
        'percorrimento_mantendo_o_menor',
      ],
      por_que:
        'a doutrina de algoritmo é "a sequência se decompõe em passos + nós de integração das interações" — ' +
        'o exemplar mostra passos atômicos e o nó integrativo no MESMO domínio algoritmico.',
    },
  ],
  'api-runtime': [
    {
      assunto: 'leitura de arquivo',
      familia: 'api-runtime',
      receita:
        '[EXEMPLO META DA FASE — não é conteúdo didático, só mostra a granularidade.] ' +
        'UMA CHAMADA de API por nó: abrir o recurso (um nó), ler o conteúdo (um nó), fechar o recurso (um nó). ' +
        'Agrupar "métodos de arquivo" num nó só reprova o teste de atomicidade (elementos demais interagindo). ' +
        'Cada nó carrega a assinatura, o efeito e o retorno como justificativa.'
      ,
      nos_esperados: ['abrir_recurso', 'ler_conteudo', 'fechar_recurso'],
      por_que:
        'a doutrina de api-runtime é "uma chamada por nó" — agrupamento por receptor (ex.: "os métodos de X") é ' +
        'a granularidade grossa que este domínio precisa desfazer; o exemplar mostra o padrão com a própria API.',
    },
  ],
  'ferramenta': [
    {
      assunto: 'npm',
      familia: 'ferramenta',
      receita:
        '[EXEMPLO META DA FASE — não é conteúdo didático, só mostra a granularidade.] ' +
        'UM VERBO de ferramenta por nó: inicializar o projeto (um nó), adicionar dependência (um nó), ' +
        'declarar script (um nó), executar script (um nó). Quando uma etapa depende do estado deixado por outra ' +
        '(o script usa a dependência instalada), a decomposição emite UM nó de integração com erklärung — ' +
        'composição não é de graça (§3.7).'
      ,
      nos_esperados: [
        'inicializar_projeto',
        'adicionar_dependencia',
        'declarar_script',
        'executar_script',
        'script_usando_dependencia',
      ],
      por_que:
        'a doutrina de ferramenta é "um comando com efeito por nó" — o exemplar decompõe o ciclo de vida da ' +
        'ferramenta e marca a dependência de estado entre etapas como integração.',
    },
  ],
};

// ─── prompts (PURAS — a chamada 1 é receita em texto livre, a 2 é schema) ────

/** A doutrina de decomposição de UMA família — texto do prompt da chamada 1. */
const DOUTRINA_POR_FAMILIA: Readonly<Record<FamiliaAssunto, string>> = {
  'sintaxe':
    'a unidade mínima é UMA construção sintática na sua forma mais simples (uma chave de átomo). ' +
    'Agrupamentos em que construções ocorrem na MESMA declaração (ex.: `let x = 5` cobre declaração e atribuição) ' +
    'podem formar um nó de até 2 construções produtivas. Duas construções que INTERAGEM semanticamente ' +
    '(ex.: parâmetro com return) exigem UM nó de integração próprio, role "integration" (§3.7).',
  'estrutura-de-dados':
    'separe a ESTRUTURA dos ELEMENTOS e das OPERAÇÕES. "Array" ou "objeto" não são átomos: são a criação da ' +
    'estrutura, o acesso, o tamanho, e cada operação — uma operação por nó. Operações aprendíveis isoladamente ' +
    'são ei_class "isolado" (réguas mais folgadas do §3.6); operações que só fazem sentido juntas interagem.',
  'algoritmo':
    'um ALGORITMO é uma sequência, e a sequência não é um átomo: cada passo vira nó (comparação, troca, ' +
    'percorrimento, condição de parada). Interações entre passos que impõem carga simultânea viram nós de ' +
    'integração próprios (role "integration") — nunca embuta a interação num passo.',
  'api-runtime':
    'UMA CHAMADA de API por nó: assinatura, efeito e retorno. Agrupar "os métodos de X" ou "as funções de Y" ' +
    'é a granularidade grossa que esta fase conserta. O receptor (ex.: api:Array.prototype.push) é uma ' +
    'construção por nó, nunca um cardápio.',
  'ferramenta':
    'UM VERBO de ferramenta por nó: um comando com seu efeito (inicializar, instalar, executar, publicar). ' +
    'Onde uma etapa depende do estado deixado por outra, emita UM nó de integração com erklärung explicando ' +
    'a dependência — composição não é de graça (§3.7).',
};

/** Instrução EXPLÍCITA anti-semente (item 3): proibido citar a trilha atual. */
const INSTRUCAO_ANTI_SEMENTE =
  'PROIBIDO citar módulos, aulas ou nomes da trilha atual: você não conhece a estrutura de módulos existente, ' +
  'e a granularidade grossa de hoje (módulos inteiros ensinados de uma vez) é EXATAMENTE o que esta fase está ' +
  'consertando. Nomear um módulo existente como se fosse unidade atômica é o erro nº 1 desta fase. ' +
  'Decomponha pelo critério do teste de atomicidade, nunca pela estrutura herdada.';

/**
 * PROMPT DA CHAMADA 1 (A-P15-2): a RECEITA em texto livre. `ctx` injeta o
 * contexto de divisão quando uma rodada anterior reprovou o candidato. PURO.
 */
export function promptDecompositor(
  familia: FamiliaAssunto,
  assunto: string,
  ctx?: { divisao: { falhas: readonly FalhaAtomicidade[] } },
): string {
  const exemplares = EXEMPLARES_POR_FAMILIA[familia];
  const exemplar = exemplares[0];
  const contextoDivisao = ctx
    ? `\n\nCONTEXTO DE DIVISÃO (rodada anterior): este assunto JÁ foi decomposto e o candidato reprovou no teste de atomicidade nas réguas:\n${ctx.divisao.falhas
        .map((f) => `  - ${f.criterio}: ${f.motivo}`)
        .join('\n')}\nRe-decomponha em nós MENORES, cada um cabendo nas quatro réguas.`
    : '';

  return [
    `Decomponha o assunto "${assunto}" (família "${familia}") em unidades atômicas.`,
    '',
    'O TESTE DE ATOMICIDADE (fase F2, §3.6) — as QUATRO réguas, TODAS obrigatórias:',
    '  1. demonstrável — cabe num worked example completo sem estourar o teto de elementos;',
    '  2. exercitável — cabe num completion problem com UMA lacuna cujo span contém o átomo-alvo;',
    '  3. orçamentável — no máximo 2 construções produtivas novas (nunca 3);',
    '  4. cronometrável — o desafio correspondente cabe em 120 segundos para quem tem o orçamento.',
    '',
    `DOUTRINA DE DECOMPOSIÇÃO DA FAMÍLIA "${familia}": ${DOUTRINA_POR_FAMILIA[familia]}`,
    '',
    INSTRUCAO_ANTI_SEMENTE,
    '',
    `EXEMPLAR META DA FASE (família "${familia}") — É EXEMPLO DA GRANULARIDADE, NÃO CONTEÚDO DIDÁTICO; ` +
      `não copie os nomes, copie o padrão de decomposição:`,
    `  assunto: "${exemplar.assunto}"`,
    `  por que é desta família: ${exemplar.por_que}`,
    `  receita: ${exemplar.receita}`,
    '',
    'FORMATO DA RESPOSTA — TEXTO LIVRE (parágrafos e lista numerada), NUNCA JSON, NUNCA template rígido:',
    'liste os nós atômicos do assunto com: (a) nome curto; (b) construções novas (chaves de átomo do ' +
      'vocabulário da engine: node:…, decl:…, op:…, global:…, api:…); (c) se os elementos interagem ' +
      '(ei_class); (d) se o nó É integração (composição) e, nesse caso, qual explicação ele exige.',
    contextoDivisao,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** O schema JSON da normalização (chamada 2) — embutido no prompt e no cache. */
export const NO_ATOMICO_JSON_SCHEMA = JSON.stringify(
  {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: [
        'chave_conceito',
        'nome',
        'familia',
        'introduces',
        'kc_type',
        'ei_class',
        'justificativa',
        'erklarung',
        'role',
        'eventos_de_avaliacao',
      ],
      properties: {
        chave_conceito: { type: 'string', pattern: '^[a-z0-9]+(_[a-z0-9]+)*$' },
        nome: { type: 'string' },
        familia: { type: 'string', enum: [...FAMILIAS_ASSUNTO] },
        introduces: {
          type: 'object',
          additionalProperties: false,
          required: ['receptive', 'productive'],
          properties: {
            receptive: { type: 'array', items: { type: 'string' } },
            productive: { type: 'array', items: { type: 'string' }, maxItems: 2 },
          },
        },
        kc_type: { type: 'string', enum: [...KC_TYPES] },
        ei_class: { type: 'string', enum: [...EI_CLASSES] },
        // INV-04: justificativa ANTES de qualquer decisão (role).
        justificativa: { type: 'string' },
        erklarung: { type: 'string' },
        role: { type: 'string', enum: [...PAPEIS_DE_NO] },
        eventos_de_avaliacao: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'tipo', 'descricao', 'atomo_alvo', 'lacuna'],
            properties: {
              id: { type: 'string', pattern: '^[a-z0-9]+(_[a-z0-9]+)*$' },
              tipo: { type: 'string', enum: ['completion-uma-lacuna', 'predicao', 'drill'] },
              descricao: { type: 'string' },
              atomo_alvo: { type: 'string' },
              lacuna: {
                type: 'object',
                additionalProperties: false,
                required: ['span', 'contem_atomo_alvo'],
                properties: {
                  span: { type: 'string' },
                  contem_atomo_alvo: { type: 'boolean', const: true },
                },
              },
            },
          },
        },
      },
    },
  },
  null,
  2,
);

/**
 * PROMPT DA CHAMADA 2 (A-P15-2): a NORMALIZAÇÃO barata da receita no schema.
 * PURO. Recebe a receita produzida pela chamada 1 e devolve as instruções
 * para o array JSON EXATO — a chamada 2 é a única que usa template rígido.
 */
export function promptNormalizador(
  familia: FamiliaAssunto,
  assunto: string,
  receita: string,
): string {
  return [
    `A receita abaixo decompõe o assunto "${assunto}" (família "${familia}").`,
    'Converta a receita em nós atômicos estruturados — TODOS os passos da receita viram nós, ' +
      'a receita não é reduzida nem ampliada.',
    '',
    'O SCHEMA EXATO da saída (todo campo obrigatório, sem campos extras):',
    NO_ATOMICO_JSON_SCHEMA,
    '',
    'REGRAS DE NORMALIZAÇÃO:',
    '  - chave_conceito: snake_case estrito (minúsculas, dígitos e "_"; ex.: "let_e_atribuicao");',
    '  - introduces.productive: no máximo 2 chaves, do vocabulário fechado da engine ' +
      '(eixos node: decl: op: global: api: — ex.: node:Identifier, decl:let, op:assign:=, api:Array.prototype.push);',
    '  - TODO nó precisa de AO MENOS UM evento_de_avaliacao com lacuna.contem_atomo_alvo=true;',
    '  - evento_de_avaliacao.atomo_alvo precisa estar em introduces do MESMO nó;',
    '  - nó que COMPÕE átomos (interação entre construções) recebe role "integration" E erklärung ' +
      'não-vazia explicando a composição (§3.7); nó que não compõe recebe role "isolado" e erklärung vazia "";',
    '  - familia de TODO nó é exatamente "' + familia + '".',
    '',
    'RESPOSTA: SOMENTE o array JSON. Nenhuma prosa, nenhum comentário, nenhum fence.',
    '',
    '--- INÍCIO DA RECEITA ---',
    receita,
    '--- FIM DA RECEITA ---',
  ].join('\n');
}

// ─── extração da saída da normalização (fail-closed) ─────────────────────────

/** Remove fences ```json``` defensivos e isola o array JSON da resposta. */
function extrairArrayJson(content: string): string {
  const trimado = content.trim();
  const fence = trimado.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidato = fence ? fence[1] : trimado;
  const inicio = candidato.indexOf('[');
  const fim = candidato.lastIndexOf(']');
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new F2ValidationError(
      'saída da normalização não contém um array JSON — impossível normalizar a receita',
    );
  }
  return candidato.slice(inicio, fim + 1);
}

function parseNosDaSaida(content: string): unknown[] {
  const bruto = extrairArrayJson(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bruto);
  } catch (erro) {
    throw new F2ValidationError(
      `saída da normalização não é JSON válido — ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new F2ValidationError('saída da normalização não é um array de nós');
  }
  return parsed;
}

// ─── o fluxo de decomposição (DUAS chamadas + atomicidade + divisão) ─────────

export interface DecomporDeps {
  /** O transporte único injetado (fake nos testes) — DUAS chamadas via callLlm. */
  llm: EngineLlm;
  /** Vocabulário do P-05; default: `carregarVocabulario()` do disco commitado. */
  vocab?: ReadonlySet<string>;
  /** Réguas do §3.6 — default: tabela do documento. */
  regua?: ReguaAtomicidade;
  /** Pesos do cronômetro — default: modelo declarado de atomicity.ts. */
  pesos?: PesosCronometragem;
}

export interface DivisaoDecomposicao {
  /** O candidato reprovado que foi re-decomposto. */
  assunto: string;
  familia: FamiliaAssunto;
  /** As falhas que motivaram a divisão (rastro citável). */
  falhas: readonly FalhaAtomicidade[];
  /** Nomes dos nós resultantes da divisão (rastro). */
  pedacos: readonly string[];
  /** Quantas divisões já haviam ocorrido acima desta (0 = primeira). */
  profundidade: number;
}

export interface ResultadoDecomposicao {
  familia: FamiliaAssunto;
  assunto: string;
  /** Os nós atômicos aceitos (ordenados por chave_conceito — determinístico). */
  nos: readonly NoAtomico[];
  /** Rastro das divisões ocorridas dentro deste chamado. */
  divisoes: readonly DivisaoDecomposicao[];
  /** Chamadas callLlm consumidas (2 por rodada: receita + normalização). */
  chamadas: number;
}

/**
 * Decompõe UM assunto: chamada 1 (receita em texto livre) → chamada 2
 * (normalização no schema) → validação estrutural (rejeição fail-closed) →
 * teste de atomicidade (puro, A-P15-2b) → DIVISÃO quando qualquer critério
 * falha, com recuo máximo `LIMITE_RECUO_DIVISAO` (NENHUM laço aberto).
 * Exatamente DUAS chamadas de LLM no caminho nominal (A-P15-2).
 */
export async function decomporAssunto(
  deps: DecomporDeps,
  familia: FamiliaAssunto,
  assunto: string,
  opcoes: { profundidade?: number; divisao?: { falhas: readonly FalhaAtomicidade[] } } = {},
): Promise<ResultadoDecomposicao> {
  const vocab = deps.vocab ?? carregarVocabulario();
  const regua = deps.regua ?? REGUA_ATOMICIDADE_DEFAULT;
  const pesos = deps.pesos ?? PESOS_CRONOMETRAGEM_DEFAULT;
  const profundidade = opcoes.profundidade ?? 0;
  let chamadas = 0;

  // CHAMADA 1 — a receita (texto livre; sem template rígido, convenção §7).
  // Em rodada de divisão, o contexto (falhas da rodada anterior) é injetado.
  const ctxDivisao = opcoes.divisao ? { divisao: { falhas: opcoes.divisao.falhas } } : undefined;
  const receitaResposta = await deps.llm.callLlm(F2_ETAPA_DECOMPOSICAO, {
    prompt: promptDecompositor(familia, assunto, ctxDivisao),
    system: F2_SYSTEM_DECOMPOSICAO,
    stageVersion: F2_DECOMPOSICAO_STAGE_VERSION,
    timeoutMs: F2_DECOMPOSICAO_TIMEOUT_MS,
  });
  chamadas += 1;
  const receita = receitaResposta.content;

  // CHAMADA 2 — a normalização (barata, schema rígido — a ÚNICA com template).
  const normalizacao = await deps.llm.callLlm(F2_ETAPA_NORMALIZACAO, {
    prompt: promptNormalizador(familia, assunto, receita),
    system: F2_SYSTEM_NORMALIZACAO,
    schema: NO_ATOMICO_JSON_SCHEMA,
    stageVersion: F2_NORMALIZACAO_STAGE_VERSION,
    timeoutMs: F2_NORMALIZACAO_TIMEOUT_MS,
  });
  chamadas += 1;

  const crus = parseNosDaSaida(normalizacao.content);
  const nos: NoAtomico[] = [];
  const rejeicoes: RejeicaoNo[] = [];
  crus.forEach((cru, indice) => {
    const resultado = validarNoAtomico(cru, vocab);
    if (!resultado.valido || resultado.no === null) {
      rejeicoes.push({
        indice,
        chave: (typeof cru === 'object' && cru !== null && 'chave_conceito' in cru
          ? String((cru as Record<string, unknown>)['chave_conceito'])
          : null),
        erros: resultado.erros,
      });
      return;
    }
    if (resultado.no.familia !== familia) {
      rejeicoes.push({
        indice,
        chave: resultado.no.chave_conceito,
        erros: [`família do nó ("${resultado.no.familia}") difere da família da rodada ("${familia}")`],
      });
      return;
    }
    nos.push(resultado.no);
  });
  if (rejeicoes.length > 0) {
    const detalhe = rejeicoes
      .map((r) => `nó #${r.indice} (${r.chave ?? 'sem chave'}): ${r.erros.join('; ')}`)
      .join(' | ');
    throw new F2ValidationError('nós rejeitados pela validação estrutural — ' + detalhe, rejeicoes);
  }
  const duplicatas = nos
    .map((no) => no.chave_conceito)
    .filter((chave, i, todas) => todas.indexOf(chave) !== i);
  if (duplicatas.length > 0) {
    throw new F2ValidationError(
      `a rodada devolveu chaves de conceito duplicadas (${[...new Set(duplicatas)].join(', ')}) — defeito da normalização`,
    );
  }

  // Teste de atomicidade (PURO) + DIVISÃO nos reprovados.
  const aceitos: NoAtomico[] = [];
  const divisoes: DivisaoDecomposicao[] = [];
  for (const no of nos) {
    const veredito = testarAtomicidade(candidatoDeNo(no), regua, pesos);
    if (veredito.passou) {
      aceitos.push(no);
      continue;
    }
    if (profundidade >= LIMITE_RECUO_DIVISAO) {
      throw new F2DivisaoLimitError(no.nome, profundidade, veredito.falhas);
    }
    const filhos = await decomporAssunto(deps, familia, no.nome, {
      profundidade: profundidade + 1,
      divisao: { falhas: veredito.falhas },
    });
    chamadas += filhos.chamadas;
    divisoes.push({
      assunto: no.nome,
      familia,
      falhas: veredito.falhas,
      pedacos: filhos.nos.map((n) => n.nome),
      profundidade: profundidade + 1,
    });
    divisoes.push(...filhos.divisoes);
    aceitos.push(...filhos.nos);
  }

  // Unicidade das chaves de conceito APÓS a união (item 7 — WARNING da
  // revisão): a duplicata intra-rodada já é checada acima, mas um FILHO da
  // divisão pode colidir com um nó já aceito do pai. Colisão de nomenclatura
  // entre pai e filho é defeito de prompt — fail-closed com erro estruturado
  // nomeando a duplicata (nenhum dedupe silencioso).
  const chavesAceitas = new Set<string>();
  const chavesColididas = new Set<string>();
  for (const no of aceitos) {
    if (chavesAceitas.has(no.chave_conceito)) {
      chavesColididas.add(no.chave_conceito);
    }
    chavesAceitas.add(no.chave_conceito);
  }
  if (chavesColididas.size > 0) {
    const duplicatas = [...chavesColididas].sort();
    throw new F2ValidationError(
      `a união entre nós aceitos do pai e filhos da divisão devolveu chaves de conceito duplicadas (${duplicatas.join(', ')}) — nomenclatura de pai e filho colidindo é defeito do prompt`,
      duplicatas.map((chave) => ({
        // indice não se aplica à união pós-divisão (não é um índice da saída
        // da normalização da rodada atual): -1 marca "pós-união".
        indice: -1,
        chave,
        erros: ['chave de conceito duplicada após união com filhos da divisão'],
      })),
    );
  }

  // Determinismo: ordenação estável por chave de conceito (item 7, A-P15-2).
  aceitos.sort((a, b) => a.chave_conceito.localeCompare(b.chave_conceito));
  divisoes.sort((a, b) => a.profundidade - b.profundidade || a.assunto.localeCompare(b.assunto));

  return { familia, assunto, nos: aceitos, divisoes, chamadas };
}

// ─── posse de arquivos de candidatos (erro de configuração antes do dispatch)

export interface TarefaDeDecomposicao {
  workerId: string;
  familia: FamiliaAssunto;
  assuntos: readonly string[];
  /** O arquivo de candidatos que ESTE worker vai escrever (posse exclusiva). */
  arquivoSaida: string;
}

/**
 * Chave canônica de posse de um arquivo — MESMA semântica do escalonador
 * (PAR-02, §4.1): normalize + sem trailing slash + case-blind (APFS). Três
 * notações do mesmo arquivo físico colidem de propósito (item 7 — colisão de
 * arquivo é erro de configuração). O caminho ORIGINAL nunca é reescrito.
 */
export function chaveDePosse(arquivo: string): string {
  const normalizado = path.posix.normalize(arquivo);
  const semBarraFinal =
    normalizado.length > 1 && normalizado.endsWith('/') ? normalizado.slice(0, -1) : normalizado;
  return semBarraFinal.toLowerCase();
}

/**
 * Valida a posse dos arquivos de candidatos ANTES do dispatch: duas tarefas
 * declarando o MESMO arquivo físico (mesma chave canônica) → erro de
 * configuração (F2ConfigurationError). Devolve vazio quando tudo disjunto.
 */
export function validarPosseDosOutputs(tarefas: readonly TarefaDeDecomposicao[]): string[] {
  const porChave = new Map<string, string[]>();
  for (const tarefa of tarefas) {
    const chave = chaveDePosse(tarefa.arquivoSaida);
    const donos = porChave.get(chave) ?? [];
    donos.push(tarefa.workerId);
    porChave.set(chave, donos);
  }
  const colisoes: string[] = [];
  for (const [chave, donos] of porChave) {
    if (donos.length > 1) {
      colisoes.push(`"${chave}" declarada por ${donos.join(', ')}`);
    }
  }
  return colisoes;
}

/** Forma que LANÇA: colisão de posse é erro de configuração (A-P15-2, teste 6). */
export function assegurarPosseValida(tarefas: readonly TarefaDeDecomposicao[]): void {
  const colisoes = validarPosseDosOutputs(tarefas);
  if (colisoes.length > 0) {
    throw new F2ConfigurationError(colisoes);
  }
}

// ─── persistência dos candidatos (escritor único por worker) ─────────────────

/** Serializa os nós de UM worker no seu arquivo de candidatos (JSON, 2 espaços). */
export function escreverCandidatos(arquivo: string, nos: readonly NoAtomico[]): void {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(nos, null, 2), 'utf8');
}

/**
 * Lê e VALIDA um arquivo de candidatos (fail-closed): arquivo ilegível, JSON
 * inválido ou nó rejeitado pela validação estrutural = erro — um arquivo
 * corrompido nunca entra no merge em silêncio.
 */
export function lerCandidatos(arquivo: string, vocab: ReadonlySet<string>): NoAtomico[] {
  let bruto: string;
  try {
    bruto = fs.readFileSync(arquivo, 'utf8');
  } catch (erro) {
    throw new F2ValidationError(
      `arquivo de candidatos ilegível em ${arquivo} — ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bruto);
  } catch (erro) {
    throw new F2ValidationError(
      `arquivo de candidatos não é JSON válido em ${arquivo} — ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
  const crus = Array.isArray(parsed) ? parsed : [parsed];
  const nos: NoAtomico[] = [];
  crus.forEach((cru, indice) => {
    const resultado = validarNoAtomico(cru, vocab);
    if (!resultado.valido || resultado.no === null) {
      throw new F2ValidationError(
        `arquivo de candidatos ${arquivo} contém nó inválido (#${indice}): ${resultado.erros.join('; ')}`,
        [{ indice, chave: null, erros: resultado.erros }],
      );
    }
    nos.push(resultado.no);
  });
  return nos;
}

// ─── merge determinístico por chave de conceito (escritor único) ─────────────

export interface CandidatosDeWorker {
  /** Id do worker produtor (rótulo de origem no merge). */
  workerId: string;
  /** Os nós candidatos do worker, já validados. */
  nos: readonly NoAtomico[];
}

/** O nó MERGEADO: o nó atômico + o rastro de origem e a justificativa. */
export interface NoMergeado extends NoAtomico {
  /** Workers que produziram este nó (ordenado; >1 ⇔ deduplicado). */
  origem: readonly string[];
  /** Por que este nó entrou assim: deduplicação ou origem única. */
  justificativa_de_merge: string;
}

/** A mensagem de deduplicação (usada por mergeCandidatos e por quem quiser). */
export function justificarMerge(origens: readonly string[]): string {
  if (origens.length <= 1) {
    return `origem única: ${origens[0] ?? '(desconhecida)'}`;
  }
  return `nó deduplicado por chave de conceito — produzido por ${origens.join(' e ')}; mantido o primeiro na ordem determinística (ordem por chave de conceito)`;
}

/**
 * MERGE determinístico por CHAVE DE CONCEITO (item 7): a mesma chave de dois
 * workers vira UM nó com justificativa de merge; a mesma chave DENTRO do
 * mesmo worker é defeito (fail-closed). Ordenação de saída e de desempate por
 * `chave_conceito` — mesma entrada em qualquer ordem de workers produz o
 * MESMO resultado (determinismo testado).
 */
export function mergeCandidatos(
  fontes: readonly CandidatosDeWorker[],
  vocab: ReadonlySet<string>,
): NoMergeado[] {
  const porChave = new Map<string, { no: NoAtomico; origens: string[] }>();
  const ordenadas = [...fontes].sort((a, b) => a.workerId.localeCompare(b.workerId));
  for (const fonte of ordenadas) {
    const vistosNesteWorker = new Set<string>();
    for (const no of fonte.nos) {
      const validacao = validarNoAtomico(no, vocab);
      if (!validacao.valido || validacao.no === null) {
        throw new F2ValidationError(
          `merge: nó de "${fonte.workerId}" inválido: ${validacao.erros.join('; ')}`,
          [{ indice: 0, chave: no.chave_conceito, erros: validacao.erros }],
        );
      }
      const chave = no.chave_conceito;
      if (vistosNesteWorker.has(chave)) {
        throw new F2ValidationError(
          `merge: "${fonte.workerId}" produziu a chave "${chave}" mais de uma vez — duplicata intra-worker é defeito da normalização`,
        );
      }
      vistosNesteWorker.add(chave);
      const existente = porChave.get(chave);
      if (existente) {
        existente.origens.push(fonte.workerId);
      } else {
        porChave.set(chave, { no, origens: [fonte.workerId] });
      }
    }
  }
  const mergeados: NoMergeado[] = [];
  for (const chave of [...porChave.keys()].sort()) {
    const { no, origens } = porChave.get(chave) as { no: NoAtomico; origens: string[] };
    mergeados.push({
      ...no,
      origem: origens,
      justificativa_de_merge: justificarMerge(origens),
    });
  }
  return mergeados;
}