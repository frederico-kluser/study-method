/**
 * app/electron/main/engine/phases/notionalMachine.ts — F0, MÁQUINA NOCIONAL
 * (pacote P-09, `docs/16-engine-de-trilha.md` §4 F0 e §12 D3).
 *
 * A máquina nocional é o MODELO MENTAL do runtime que a trilha ensina
 * EXPLICITAMENTE: ela diz quais aspectos do runtime viram conteúdo de aula —
 * e, por omissão, quais ficam de fora (não ensinar é uma decisão de
 * currículo). Para JavaScript/Node o contrato exige NO MÍNIMO os nove
 * aspectos fundamentais, numa ORDEM CANÔNICA estável:
 *
 *   NINE_MINIMUM_ASPECTS (ordem canônica):
 *     1. execução linha a linha
 *     2. uma variável guarda um valor
 *     3. avaliação de expressão antes da atribuição
 *     4. escopo e zona morta temporal
 *     5. pilha de chamadas
 *     6. valor contra referência
 *     7. coerção e igualdade estrita
 *     8. closures
 *     9. event loop
 *
 * A ordem é currículo, não estética: cada aspecto desbloqueia o seguinte
 * (linha a linha → o que uma linha faz → como o valor chega à variável →
 * onde a variável vive → quem chama quem → o que é copiado → como dois
 * valores se comparam → funções que guardam ambiente → o que roda depois do
 * síncrono). Uma máquina que declare os nove fora desta ordem quebra a
 * progressão que F3 (grafo de pré-requisitos) vai materializar.
 *
 * Onde os aspectos moram: a máquina é validada por `NotionalMachineSchema`
 * (P-04), que não tem campo "aspectos" — os nove entram como PRIMEIROS
 * `componentes` (`{nome, funcao}`), com os nomes EXATOS da lista canônica;
 * componentes adicionais (heap, ambientes léxicos, …) vêm DEPOIS. A checagem
 * `validarNotionalMachine` exige presença dos nove E ordem canônica
 * (subsequência ESTRITA): componente extra no meio não viola a ordem dos
 * nove, mas um aspecto fora da posição canônica — ou REPETIDO (segunda
 * aparição de um nome canônico) — é erro NOMEADO.
 *
 * Âncoras (D3): JS/Node NÃO tem máquina nocional descrita pedagogicamente em
 * fonte pública — cerca de 15 aulas exigirão concepções autoradas do zero,
 * ancoradas na ECMA-262 e no MDN. Por isso `fonte` é obrigatória no schema e
 * `limites` (onde a analogia quebra — §7.1 regra 6) também.
 *
 * Contratos herdados de `f0Brief.ts` (mesmo pacote P-09): `FaseF0Error`
 * (fail-closed INV-03), `parsearDraftLlm`, `rejeitarCamposExtras`
 * (schema da LLM FECHADO — INV-05) e `SYSTEM_PROMPT_F0`.
 *
 * Como em `f0Brief.ts`: a fase é determinística (`validarNotionalMachine` é
 * PURO e é o mesmo gate da carga de `notional-machine.json` do disco);
 * nenhum arquivo é escrito aqui (persistir é do FREEZE/P-10).
 */

import { z } from 'zod';

import { NotionalMachineSchema } from '../schemas/artifacts';
import { formatarErroCampos } from '../schemas/fieldOrder';
import type { EngineLlm, LlmCallRequest, LlmCallResult } from '../runtime/callLlm';
import {
  FaseF0Error,
  SYSTEM_PROMPT_F0,
  parsearDraftLlm,
  rejeitarCamposExtras,
  schemaDeObjetoParaLlm,
} from './f0Brief';

// ─── identidade da etapa ────────────────────────────────────────────────────

export const ETAPA_NOTIONAL = 'f0-notional-machine' as const;
export const STAGE_VERSION_NOTIONAL = '1.0.0' as const;
export const TIMEOUT_NOTIONAL_MS = 60_000 as const;
export const MAX_TOKENS_NOTIONAL = 2_000 as const;

// ─── os nove aspectos mínimos (ordem canônica) ──────────────────────────────

/**
 * A lista ORDENADA dos aspectos do runtime JS/Node que a trilha ensina
 * explicitamente — o contrato mínimo da máquina nocional. Usada na GERAÇÃO
 * (o prompt exige estes nomes, nesta ordem, como primeiros componentes) E na
 * VALIDAÇÃO (`verificarAspectosMinimos`). Nunca reordenar sem bumpar
 * `STAGE_VERSION_NOTIONAL` e revisar F3.
 */
export const NINE_MINIMUM_ASPECTS = [
  'execução linha a linha',
  'uma variável guarda um valor',
  'avaliação de expressão antes da atribuição',
  'escopo e zona morta temporal',
  'pilha de chamadas',
  'valor contra referência',
  'coerção e igualdade estrita',
  'closures',
  'event loop',
] as const;

export type AspectoMinimo = (typeof NINE_MINIMUM_ASPECTS)[number];

// ─── checagem de aspectos (PURO — mesmo gate da geração e da carga) ─────────

/**
 * Normalização de nome para o casamento dos aspectos: minúsculas + trim +
 * colapso de espaços. Tolerante a capitalização (`Pilha de chamadas` ==
 * `pilha de chamadas`), DETERMINÍSTICO (sem stemming, sem sinônimos: o nome
 * canônico é dado — o LLM é instruído a usá-lo).
 */
export function normalizarNomeAspecto(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface VerificacaoAspectos {
  /** Aspectos canônicos que a máquina NÃO declara (nome canônico ausente). */
  faltantes: string[];
  /** Aspectos cuja posição viola a ordem canônica (primeiro par ofensor por aspecto). */
  foraDeOrdem: Array<{ aspecto: string; posicao: number; antecessor: string }>;
  /** Aparições EXTRA de um aspecto canônico — uma entrada por aparição além da primeira, com o índice. */
  repetidos: Array<{ aspecto: string; posicao: number }>;
  /** Índices (em `componentes`) da PRIMEIRA aparição de cada aspecto canônico. */
  posicoes: Record<string, number>;
}

/**
 * Verifica presença E ordem canônica dos nove aspectos mínimos sobre a lista
 * de componentes (após o schema já ter garantido `{nome, funcao}`). A ordem
 * é exigida como SUBSEQUÊNCIA ESTRITA: um aspecto na posição i deve ter
 * índice MAIOR que o do aspecto anterior da lista canônica — componente
 * extra intercalado é permitido, aspecto REPETIDO ou invertido é violação
 * (o repetido sai em `repetidos`, o invertido em `foraDeOrdem`).
 */
export function verificarAspectosMinimos(componentes: unknown): VerificacaoAspectos {
  const posicoes: Record<string, number> = {};
  const repetidos: VerificacaoAspectos['repetidos'] = [];
  if (Array.isArray(componentes)) {
    componentes.forEach((componente, index) => {
      if (typeof componente !== 'object' || componente === null) return;
      const nome = (componente as { nome?: unknown }).nome;
      if (typeof nome !== 'string') return;
      const normalizado = normalizarNomeAspecto(nome);
      const canal = NINE_MINIMUM_ASPECTS.findIndex((aspecto) => normalizarNomeAspecto(aspecto) === normalizado);
      if (canal !== -1) {
        const canonico = NINE_MINIMUM_ASPECTS[canal];
        if (canonico in posicoes) {
          // Segunda aparição (ou posterior) de um aspecto canônico: viola a
          // subsequência ESTRITA ("aspecto repetido ou invertido é violação")
          // — a aparição extra é REPORTADA, nunca varrida para debaixo do
          // tapete ("primeira aparição vence" era o silêncio do HIGH-1).
          repetidos.push({ aspecto: canonico, posicao: index });
        } else {
          // A posição base da ordem canônica é a PRIMEIRA aparição — a mesma
          // semântica do cheque de subsequência que sempre valeu.
          posicoes[canonico] = index;
        }
      }
    });
  }

  const faltantes: string[] = [];
  for (const aspecto of NINE_MINIMUM_ASPECTS) {
    if (!(aspecto in posicoes)) faltantes.push(aspecto);
  }

  const foraDeOrdem: VerificacaoAspectos['foraDeOrdem'] = [];
  let antecessor: string | null = null;
  for (const aspecto of NINE_MINIMUM_ASPECTS) {
    if (!(aspecto in posicoes)) continue;
    const posicao = posicoes[aspecto];
    if (antecessor !== null && posicao <= posicoes[antecessor]) {
      foraDeOrdem.push({ aspecto, posicao, antecessor });
    }
    antecessor = aspecto;
  }

  return { faltantes, foraDeOrdem, repetidos, posicoes };
}

// ─── o GATE da máquina nocional (PURO — mesmo para o caminho de carga) ──────

export type NotionalMachine = z.infer<typeof NotionalMachineSchema>;

/**
 * O gate ÚNICO da máquina nocional: G-SCHEMA (campos obrigatórios, erro
 * NOMEIA campo+motivo) + schema da LLM fechado + os nove aspectos mínimos
 * (presença e ordem canônica). PURO — sem LLM, sem IO. Mesmo veredito na
 * geração e na carga de `notional-machine.json`.
 */
export function validarNotionalMachine(draft: unknown): NotionalMachine {
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) {
    throw new FaseF0Error({
      code: 'NOTIONAL_SCHEMA_INVALIDO',
      message: 'draft da máquina nocional não é um objeto JSON.',
    });
  }
  const objeto = draft as Record<string, unknown>;

  rejeitarCamposExtras(objeto, NotionalMachineSchema.shape, 'NOTIONAL_CAMPO_DESCONHECIDO', 'draft da máquina nocional');

  const resultado = NotionalMachineSchema.safeParse(objeto);
  if (!resultado.success) {
    throw new FaseF0Error({
      code: 'NOTIONAL_SCHEMA_INVALIDO',
      message: `máquina nocional inválida perante NotionalMachineSchema:\n${formatarErroCampos(resultado.error)}`,
    });
  }
  const maquina = resultado.data;

  const { faltantes, foraDeOrdem, repetidos } = verificarAspectosMinimos(maquina.componentes);
  if (faltantes.length > 0) {
    throw new FaseF0Error({
      code: 'NOTIONAL_ASPECTOS_INCOMPLETOS',
      campo: 'componentes',
      message:
        `máquina nocional não cobre os ${NINE_MINIMUM_ASPECTS.length} aspectos mínimos do runtime ` +
        `(NINE_MINIMUM_ASPECTS) — faltam: ${faltantes.join(', ')}.`,
      detalhes: { faltantes },
    });
  }
  if (repetidos.length > 0) {
    throw new FaseF0Error({
      code: 'NOTIONAL_ASPECTOS_REPETIDOS',
      campo: 'componentes',
      message:
        `aspectos mínimos REPETIDOS (NINE_MINIMUM_ASPECTS exige subsequência ESTRITA — ` +
        `"aspecto repetido ou invertido é violação"): ` +
        repetidos.map((r) => `"${r.aspecto}" reaparece na posição ${r.posicao}`).join('; ') +
        '.',
      detalhes: { repetidos },
    });
  }
  if (foraDeOrdem.length > 0) {
    throw new FaseF0Error({
      code: 'NOTIONAL_ASPECTOS_FORA_DE_ORDEM',
      campo: 'componentes',
      message:
        `aspectos mínimos fora da ordem canônica (NINE_MINIMUM_ASPECTS): ` +
        foraDeOrdem
          .map((f) => `"${f.aspecto}" na posição ${f.posicao} antes de "${f.antecessor}"`)
          .join('; ') +
        '.',
      detalhes: { foraDeOrdem },
    });
  }

  return maquina;
}

// ─── prompt e fase ──────────────────────────────────────────────────────────

export interface F0NotionalPromptContext {
  linguagem?: string;
  plataforma?: string;
}

/**
 * O prompt da máquina nocional (F0; D3). Sem conteúdo didático — a INSTRUÇÃO
 * de geração. Os nove aspectos são dados com os NOMES e a ORDEM exatos.
 */
export function promptF0NotionalMachine(ctx: F0NotionalPromptContext): string {
  const linguagem = ctx.linguagem ?? 'javascript';
  const plataforma = ctx.plataforma ?? 'node';
  const aspectos = NINE_MINIMUM_ASPECTS.map((aspecto, i) => `  ${i + 1}. ${aspecto}`).join('\n');
  return [
    `Você é o autor da MÁQUINA NOCIONAL de ${linguagem}/${plataforma} (fase F0 da engine de trilhas, docs §4 F0 e §12 D3).`,
    '',
    'A máquina nocional é o modelo mental do runtime que a trilha ensina EXPLICITAMENTE. Produza JSON EXATO com os campos do schema:',
    '- nome, descricao: o modelo e por que ele é a melhor analogia para ensinar (pt-BR).',
    '- componentes: a lista de {nome, funcao}. Os NOVE aspectos mínimos DEVEM ser os PRIMEIROS componentes, nesta ORDEM EXATA e com estes NOMES EXATOS:',
    aspectos,
    '  (funcao = o papel do aspecto dentro da máquina). Componentes adicionais (ex.: heap, ambiente léxico) podem vir DEPOIS.',
    '- estados: os estados da máquina {nome, descricao}.',
    '- transicoes: {de, para, condicao} — nomes consistentes com os estados e componentes.',
    '- limites: onde a analogia QUEBRA (obrigatório — a onda semântica termina declarando a ruptura; docs §7.1 regra 6).',
    '- analogia: a analogia concreta da máquina (pt-BR).',
    '- fonte: âncora das concepções na ECMA-262 e no MDN (URLs) — JS/Node não tem máquina nocional pedagógica pública (D3), então ancorar na especificação.',
    '',
    'REGRAS DURAS:',
    '1. Os nove nomes acima são DADOS: use exatamente eles (pt-BR), na ordem da lista.',
    '2. JSON puro: sem markdown, sem comentários, sem campos fora do contrato.',
    '3. Nenhum campo de teto/contagem de aulas — a máquina não é o sílabo.',
  ].join('\n');
}

export interface F0NotionalInput {
  /** Transporte INJETADO (fake nos testes; a engine fornece o de P-01). */
  callLlm: EngineLlm['callLlm'];
  linguagem?: string;
  plataforma?: string;
  stageVersion?: string;
  timeoutMs?: number;
  maxTokens?: number;
}

/**
 * A fase F0-MÁQUINA NOCIONAL: drafta a máquina via `callLlm` (etapa
 * `f0-notional-machine`) e valida pelo MESMO gate de carga
 * (`validarNotionalMachine`). Fail-closed: falha da LLM propaga
 * `LlmStageError`; máquina inválida/incompleta vira `FaseF0Error` nomeado.
 */
export async function gerarNotionalMachine(
  input: F0NotionalInput,
): Promise<{ maquina: NotionalMachine; llm: LlmCallResult }> {
  const req: LlmCallRequest = {
    prompt: promptF0NotionalMachine({ linguagem: input.linguagem, plataforma: input.plataforma }),
    system: SYSTEM_PROMPT_F0,
    schema: schemaDeObjetoParaLlm(NotionalMachineSchema.shape, 'notional-machine'),
    stageVersion: input.stageVersion ?? STAGE_VERSION_NOTIONAL,
    timeoutMs: input.timeoutMs ?? TIMEOUT_NOTIONAL_MS,
    maxTokens: input.maxTokens ?? MAX_TOKENS_NOTIONAL,
  };
  const llm = await input.callLlm(ETAPA_NOTIONAL, req);
  const draft = parsearDraftLlm(llm.content, ETAPA_NOTIONAL, 'NOTIONAL_DRAFT_NAO_JSON');
  const maquina = validarNotionalMachine(draft);
  return { maquina, llm };
}