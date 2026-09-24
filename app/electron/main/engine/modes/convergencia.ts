/**
 * app/electron/main/engine/modes/convergencia.ts — o LAÇO DE CONVERGÊNCIA
 * RECURSIVO: medir → classificar → planejar → (aplicar) → medir de novo, SEM
 * TETO DE RODADAS, até o ponto fixo ou até uma parada que ESCALA.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ───────────────────────────────────────────
 *
 * O pedido do dono do produto, textual: *"quero recursão sem fim na validação
 * ao entregar o curso até ele estar ideal e ter nele tudo que o aluno precisa
 * para aprender, mas no caso de nem nele e nem nos cursos conectados a ele
 * antes dele, ter o conteúdo, tem que quebrar o conteúdo da aula problemática
 * em mais conteúdos"*.
 *
 * O que existia no disco antes deste arquivo, medido:
 *
 *   - `docs/16-engine-de-trilha.md` §6.6 tem TETO DURO de 3 rodadas
 *     (`4. PARE("failsafe")  rodada 3`), e o comando `revise` itera "até o hash
 *     estabilizar (max 3 iteracoes)" (`tools/track-engine/cli.ts`, USAGE do
 *     `revise`). Três rodadas não são "sem fim";
 *   - o ramo (c) do pedido — QUEBRAR a aula — aparecia como CONSELHO
 *     (`SPLIT_LESSON` no catálogo fechado do §6.7, a ação prescrita por A17/
 *     A18/A21 em `quality/barra.ts`) e NUNCA como PROCEDIMENTO: nenhum código
 *     dizia em quantas aulas quebrar, o que vai em cada uma, nem onde elas
 *     entram;
 *   - a CADEIA de cursos (iniciante → intermediário → avançado → especialista)
 *     não existia em código: nenhum `track.json` aponta para curso anterior, a
 *     descoberta de trilhas é `readdir` + `sort()` alfabético
 *     (`content/trackLoader.ts`) e `deriveTrackBudget(track)` não tem parâmetro
 *     para um predecessor. Sem ela, "nem nele e nem nos cursos conectados antes
 *     dele" não era uma pergunta que o código soubesse fazer.
 *
 * Este módulo fecha as três pontas: o laço não tem teto, a quebra tem
 * PLANEJADOR, e o ramo CADEIA é consultado por uma interface (ver
 * `criarLeitorDaCadeia`) que devolve Map VAZIO quando a cadeia ainda não existe
 * no disco — e Map vazio é a resposta CORRETA para os três cursos de hoje, que
 * são todos o PRIMEIRO da sua cadeia.
 *
 * ─── O QUE ELE MEDE, E COM QUE COMANDO SE REPRODUZ ─────────────────────────
 *
 * Nada aqui é parser novo nem régua nova: o módulo ORQUESTRA os dois gates que
 * já existem, em memória, sem subprocesso:
 *
 *   `auditTrack`      (engine/audit.ts)          → A1–A6, DEC, I12–I17 e a
 *                                                  distinção ORDEM × LACUNA do
 *                                                  §5.5 (`primeiraAulaQueEnsina`)
 *   `auditarBarra`    (engine/quality/barra.ts)  → A17–A23 e, por aula, os
 *                                                  GRUPOS de co-ocorrência de
 *                                                  linha — o insumo da QUEBRA
 *
 * O NÚMERO PINADO — e por que ele é o de uma FIXTURE, não o do curso. Os três
 * cursos do produto estão sendo autorados em PARALELO (2026-09-22): o
 * `rust-iniciante` saiu de 101 para 103 aulas e de 20 erros de barra para 0
 * enquanto este arquivo era escrito, e um número de cabeçalho que outra pessoa
 * invalida em cinco minutos é pior que nenhum. O número pinado é o da fixture
 * que congela a aula 1 do Rust EXATAMENTE como o dono a viu
 * (`tests/fixtures/tracks/trilha-rust-minima`: 11 chaves novas — 6 produtivas
 * + 5 receptivas — em UMA seção de teoria):
 *
 *     cd app && npm run engine -- convergir trilha-rust-minima \
 *       --dir tests/fixtures/tracks/trilha-rust-minima
 *
 *     → μ 12 · VETOR barra 5 · excesso-de-passo 11 · secoes-insuficientes 1
 *     → RAMOS: QUEBRA 5 (os outros cinco em zero)
 *     → 3 grupos de co-ocorrência: [FunctionItem, Parameter, Parameters,
 *       PrimitiveType, VisibilityModifier] · [BinaryExpression, IntegerLiteral,
 *       UnaryExpression, op:*, op:-] · [todo!]
 *     → 1 aula nova: `passo-node-functionitem-15c0fd88`, antes da original,
 *       teto 1 grupo produtivo (A18); a original PERDE 5 chaves e FICA com 6
 *
 * Os cursos, medidos no mesmo dia e VOLÁTEIS por construção (reproduza antes de
 * citar): `convergir python-iniciante` → PONTO-FIXO, μ 0, exit 0 (112 aulas, 0
 * violações, 0 erros de barra, 30 avisos A22); `convergir rust-iniciante` →
 * μ 1, 1 achado de ORDEM (103 aulas).
 *
 * Consequência DIRETA para os ramos: quando o `audit` está verde — que é o caso
 * do `python-iniciante` — ORDEM, CADEIA e LACUNA nascem VAZIOS e tudo o que o
 * laço tem para fazer vem da BARRA: QUEBRA (A17/A18/A21), DEMONSTRAÇÃO
 * (A19/A22/A23) e PROVA (A20). Não é otimismo: é o que o orçamento A1–A4 não
 * pergunta, e é exatamente o defeito que o dono viu na aula 1 do Rust.
 *
 * ─── O VETOR DE ESTADO E A PROVA DE TERMINAÇÃO ─────────────────────────────
 *
 * "Recursão sem fim" só é honesto com prova de terminação; sem ela é promessa
 * de laço infinito. A medida é
 *
 *     μ(t) = excessoDePasso + chavesSemDemonstracao + aulasSemDesafio
 *            + violacoesDeOrcamento + lacunasDeCurriculo
 *
 * um INTEIRO NÃO-NEGATIVO (cada componente é uma contagem). O laço para por uma
 * das quatro condições da cascata (`Veredito`), e NENHUMA delas é "cansaço":
 *
 *   1. PONTO-FIXO     achados == ∅ **e** a iteração não aplicou mudança → exit 0
 *   2. CICLO          hash(vetor) repete um hash já visto → PARA e ESCALA (exit 1)
 *   3. SEM-PROGRESSO  nenhuma componente do vetor diminuiu **e** nada foi
 *                     aplicado → PARA e ESCALA (exit 1)
 *   4. TETO           só quando `--max-iteracoes` foi passado (exit 1)
 *
 * A terminação do SUBCONJUNTO ZERO-LLM (o que este módulo aplica de verdade) é
 * provável e está provada assim:
 *
 *   (a) MOVIMENTO DE ORDEM. Só é gravado depois de `verificarReordenacao`
 *       provar, sobre a trilha re-derivada em memória, que a violação alvo
 *       sumiu E que NENHUMA violação nova apareceu (`reorder.ts`, verificação
 *       DIFERENCIAL). Logo cada movimento aplicado reduz `violacoesDeOrcamento`
 *       em ≥1 e não aumenta componente nenhuma → μ desce ao menos 1;
 *   (b) QUEBRA (esqueleto). É IDEMPOTENTE por construção: o slug da aula nova é
 *       derivado da construção-alvo mais o sha256 do grupo, e o planejador marca
 *       `jaExiste: true` quando o slug já está no `module.json`. Uma aula nova é
 *       criada NO MÁXIMO UMA VEZ, e o número de quebras possíveis é finito
 *       (≤ número de aulas × número de grupos). Depois da última, nada é
 *       aplicado.
 *
 * Portanto o laço SEMPRE termina: ou μ desce até o ponto fixo, ou chega uma
 * iteração que não aplica nada — e aí PONTO-FIXO (se não há achado) ou
 * SEM-PROGRESSO/CICLO (se há), sempre com exit 1 e escalada.
 *
 * ─── ONDE A PROMESSA OTIMISTA NÃO SE SUSTENTA, DECLARADO ───────────────────
 *
 * A formulação "SPLIT_LESSON reduz ESTRITAMENTE `excessoDePasso`" só vale se
 * alguém MOVER as chaves do `introduces` da aula original para a aula nova. Este
 * módulo NÃO faz isso, e a razão é a mesma que proíbe escrever prosa: mover a
 * declaração sem mover a DEMONSTRAÇÃO cria, no mesmo movimento, N violações
 * A19 (chave declarada sem bloco de código que a demonstre) e 1 violação A20
 * (aula sem desafio) — μ subiria em vez de descer, e o gate passaria a mentir
 * sobre uma aula que não ensina nada. Então:
 *
 *   - a aula nova nasce ESQUELETO, sem `introduces`, declarando na ficha de
 *     `autoria` o que precisa ser escrito;
 *   - `excessoDePasso` da aula original NÃO cai com o `--aplicar` deste módulo;
 *   - a iteração seguinte reprova a aula nova por A20 (`aulasSemDesafio` +1) e
 *     a original continua acima do teto;
 *   - o laço para em SEM-PROGRESSO, sai 1 e ESCALA.
 *
 * Isso é o desfecho CORRETO: a descida completa até PONTO-FIXO exige a etapa de
 * AUTORIA (prosa, exemplo, quiz e desafio), que é de quem tem LLM. O laço
 * determinístico não finge ter convergido — §6.6 do contrato: *"Nunca aceitar
 * por cansaço"*. O trabalho que falta fica VISÍVEL no gate, com aula, chave e
 * ação prescrita.
 *
 * E ISSO FOI MEDIDO, não argumentado. Sobre uma CÓPIA da fixture (nunca sobre a
 * fixture do repositório), `convergir trilha-rust-minima --dir <cópia>
 * --aplicar`:
 *
 *   ITERAÇÃO 1  μ 12  →  aplica SPLIT_LESSON: grava
 *               `modules/modulo-1/lessons/passo-node-functionitem-15c0fd88/lesson.json`
 *               e `modules/modulo-1/module.json` (o array `lessons` com a aula
 *               nova ANTES da original). Veredito da iteração: `(segue)`.
 *   ITERAÇÃO 2  μ 13  →  a trilha RECARREGA do disco (prova de que o esqueleto
 *               passa no `loadTrack`), `aulasSemDesafio` sobe de 0 para 1 e o
 *               ramo PROVA aparece com 2 achados — a aula nova reprovada por
 *               A20, exatamente como este cabeçalho prevê. Nada é aplicável,
 *               nenhuma componente desceu: veredito `SEM-PROGRESSO`, exit 1,
 *               ESCALA.
 *
 * μ SUBIU de 12 para 13 e o laço disse isso em voz alta em vez de parar em
 * verde. É a diferença entre um gate e um adesivo.
 *
 * ─── O QUE ESTE MÓDULO NÃO FAZ, e cada "não" é deliberado ──────────────────
 *
 *   - NÃO chama LLM, NÃO vai à rede, NÃO lê chave de API. Tudo aqui é aritmética
 *     sobre conjuntos de átomos e contagem de seções (P1 do §2: nada decidível
 *     por código é decidido por LLM);
 *   - NÃO escreve prosa de teoria, quiz, fonte nem desafio. Autoria é de quem
 *     tem LLM;
 *   - NÃO reescreve o `introduces` de aula existente (ver o parágrafo acima);
 *   - NÃO parte um GRUPO de co-ocorrência. Se três chaves saem da MESMA linha de
 *     um bloco desta aula, não existe aula que ensine duas e não a terceira — é
 *     a regra do par, medida no disco por `barra.agruparPorLinha`;
 *   - NÃO inventa a cadeia de cursos: consulta `graph/cadeia.ts` quando ele
 *     existe e, quando não, declara a limitação e trata todo não-ensinado como
 *     LACUNA (o que é correto para um curso que é o primeiro da sua cadeia).
 *
 * CONTAGEM DUPLA, DESCONTADA E DECLARADA. Desde 2026-09-22 o `audit.ts` MESCLA
 * os achados da barra em `violations` (`violacaoDaBarra`). Este módulo lê A17–A23
 * de UMA fonte só — `auditarBarra` — e desconta essas regras do audit (ver
 * `REGRAS_MESCLADAS_DA_BARRA`): contá-las duas vezes inflaria μ e faria o mesmo
 * defeito aparecer em dois ramos ao mesmo tempo.
 *
 * ESCRITA DECLARADA. O DRY-RUN (default) não grava conteúdo nenhum — mas GRAVA o
 * ledger (`content-src/<slug>/convergencia/ledger.jsonl`, uma linha JSON por
 * iteração). É a única escrita do dry-run, é de REGISTRO e está no `--help`:
 * escrita não declarada é defeito.
 *
 * Referência: `docs/16-engine-de-trilha.md` §5.5 (ORDEM × LACUNA), §6 inteiro
 * (a ordem do laço, o filtro estrutural, a severidade por tabela, a cascata de
 * parada, o anti-oscilação e o catálogo FECHADO de 14 ações), §9.2 (limitação
 * declarada) e §9.3 (fail-closed).
 */

import { execFile } from 'node:child_process';

import type { LoadedTrack } from '../../content/trackLoader';
import { LESSON_FILE, MODULE_FILE, TRACK_SCHEMA_VERSION } from '../../content/trackTypes';
import type { TrackLessonSource, TrackModuleSource, TrackTheorySection } from '../../content/trackTypes';
import { auditTrack, type AuditReport, type Violation } from '../audit';
import { humanLabel, type AtomKey } from '../atomKeys';
import { deriveTrackBudget, type DeriveOptions, type LessonBudget } from '../budget';
import { extractAllOccurrences } from '../extract';
import type { LanguageId } from '../lang/registry';
import {
  MINIMO_SECOES_DE_TEORIA,
  REGRAS_DA_BARRA,
  TETO_NOVAS_TOTAL,
  TETO_PRODUTIVAS_NOVAS,
  TETO_PRODUTIVAS_NOVAS_AULA_1,
  auditarBarra,
  type AchadoDaBarra,
  type MetricaDaBarra,
  type RelatorioDaBarra,
} from '../quality/barra';
import {
  aplicarMovimentos,
  planejarReordenacao,
  verificarReordenacao,
} from './reorder';
import { sha256Hex } from '../runtime/ledger';
import { collectLessonCode } from '../theoryCode';
import type { AcaoCatalogo } from '../review/actionCatalog';

// ---------------------------------------------------------------------------
// 0. Erro ESTRUTURADO — fail-closed (§9.3)
// ---------------------------------------------------------------------------

export type ConvergenciaErrorCode =
  | 'CONVERGENCIA_MAX_ITERACOES_INVALIDO'
  | 'CONVERGENCIA_AULA_NAO_ENCONTRADA'
  | 'CONVERGENCIA_MODULO_NAO_ENCONTRADO'
  | 'CONVERGENCIA_RECARGA_FALHOU';

/** Erro com código e etapa — nunca `throw new Error('...')` solto. */
export class ErroDeConvergencia extends Error {
  readonly codigo: ConvergenciaErrorCode;
  readonly etapa: string;

  constructor(codigo: ConvergenciaErrorCode, etapa: string, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeConvergencia';
    this.codigo = codigo;
    this.etapa = etapa;
  }
}

// ---------------------------------------------------------------------------
// 1. O VETOR DE ESTADO — sete componentes inteiras e não-negativas
// ---------------------------------------------------------------------------

/**
 * O VETOR DE ESTADO da trilha: sete contagens, todas inteiras e ≥ 0. É ele que
 * o laço compara entre iterações — não o texto do relatório, que muda de
 * posição sem mudar de conteúdo.
 *
 * As cinco primeiras componentes somam a MEDIDA μ da prova de terminação (ver o
 * cabeçalho). `secoesInsuficientes` e `errosDaBarra` entram no vetor (e no
 * hash, e no teste de descida) mas NÃO em μ: `errosDaBarra` é a soma dos outros
 * sinais da barra e contá-lo duas vezes inflaria μ sem acrescentar informação.
 */
export interface VetorDeEstado {
  /** erros do `auditTrack` (avisos fora) — A1–A6, DEC, I12–I17. */
  violacoesDeOrcamento: number;
  /** `audit.totals.lacunasDeCurriculo` — violação com `primeiraAulaQueEnsina === null`. */
  lacunasDeCurriculo: number;
  /** erros da barra A17–A23 (A22 é aviso e fica fora). */
  errosDaBarra: number;
  /** Σ por aula de max(0, produtivasColapsadas − 2) + max(0, novasTotais − 4). */
  excessoDePasso: number;
  /** Σ por aula de `chavesSemDemonstracao` (A19). */
  chavesSemDemonstracao: number;
  /** aulas com `challenges: []` (A20). */
  aulasSemDesafio: number;
  /** aulas com menos seções de teoria do que A21 exige. */
  secoesInsuficientes: number;
}

/** As componentes, na ordem em que entram no hash — a ordem é CONTRATO. */
export const COMPONENTES_DO_VETOR = [
  'violacoesDeOrcamento',
  'lacunasDeCurriculo',
  'errosDaBarra',
  'excessoDePasso',
  'chavesSemDemonstracao',
  'aulasSemDesafio',
  'secoesInsuficientes',
] as const;

export type ComponenteDoVetor = (typeof COMPONENTES_DO_VETOR)[number];

/** As componentes que somam μ (a medida da prova de terminação). */
export const COMPONENTES_DE_MU: readonly ComponenteDoVetor[] = [
  'excessoDePasso',
  'chavesSemDemonstracao',
  'aulasSemDesafio',
  'violacoesDeOrcamento',
  'lacunasDeCurriculo',
];

/**
 * As regras que o `audit.ts` MESCLA da barra em `violations` — e que este
 * módulo DESCONTA do audit para não contar o mesmo defeito duas vezes.
 *
 * MEDIDO em 2026-09-22, depois de `audit.ts` passar a mesclar a barra
 * (`violacaoDaBarra`, que copia cada `AchadoDaBarra` para uma `Violation` com
 * a ação prescrita na mensagem): `npm run engine -- audit rust-iniciante
 * --limite 0` passou de `0 violacoes` para `13 violacoes`, e `npm run engine --
 * barra rust-iniciante` reporta exatamente os MESMOS 13 erros. Sem este
 * desconto, `violacoesDeOrcamento` e `errosDaBarra` contariam o mesmo achado,
 * μ ficaria inflado e — pior — os achados A17/A21 (que têm `construcao: null`)
 * cairiam em `foraDosRamos` pelo caminho do audit e em QUEBRA pelo caminho da
 * barra, ao mesmo tempo.
 *
 * A fonte ÚNICA de A17–A23 neste módulo é `auditarBarra`; do `auditTrack` vem
 * só o que é dele: A1–A6, DEC e I12–I17.
 */
const REGRAS_MESCLADAS_DA_BARRA: ReadonlySet<string> = new Set<string>(REGRAS_DA_BARRA);

/**
 * Os erros de ORÇAMENTO/ESTRUTURA do audit: `severidade === 'aviso'` não conta
 * (a MESMA regra do placar) e as regras da barra saem (ver
 * `REGRAS_MESCLADAS_DA_BARRA`).
 */
function errosDoAudit(report: AuditReport): Violation[] {
  return report.violations.filter(
    (v) => (v.severidade ?? 'erro') !== 'aviso' && !REGRAS_MESCLADAS_DA_BARRA.has(v.regra),
  );
}

/**
 * O MÍNIMO de seções que A21 exige de uma aula com `novas` construções novas —
 * a MESMA aritmética de `quality/barra.ts`, com as MESMAS constantes exportadas
 * de lá (nenhum número é redigitado aqui).
 */
export function minimoDeSecoes(novasColapsadas: number): number {
  return Math.max(MINIMO_SECOES_DE_TEORIA, Math.ceil(novasColapsadas / 2));
}

/**
 * Mede o vetor a partir dos DOIS relatórios. PURA.
 *
 * DIVERGÊNCIA CONHECIDA E DECLARADA em `secoesInsuficientes`: a barra usa
 * `todas.length > 0` (as chaves novas ANTES do colapso) como guarda e o número
 * COLAPSADO no mínimo; `MetricaDaBarra` só publica o colapsado
 * (`novasTotais`), então a guarda aqui é `novasTotais > 0`. Uma aula em que
 * TODA chave nova é derivada declarada válida ainda deve 2 seções pela barra e
 * este contador não a vê. A divergência é CONSERVADORA (subconta, nunca
 * superconta) e não muda veredito nenhum: quem reprova é `errosDaBarra`; este
 * componente só serve de medida de descida.
 */
export function medirVetor(audit: AuditReport, barra: RelatorioDaBarra): VetorDeEstado {
  let excessoDePasso = 0;
  let chavesSemDemonstracao = 0;
  let aulasSemDesafio = 0;
  let secoesInsuficientes = 0;
  for (const m of barra.metricas) {
    excessoDePasso += Math.max(0, m.produtivasColapsadas - TETO_PRODUTIVAS_NOVAS);
    excessoDePasso += Math.max(0, m.novasTotais - TETO_NOVAS_TOTAL);
    chavesSemDemonstracao += m.chavesSemDemonstracao;
    if (m.desafios === 0) aulasSemDesafio += 1;
    if (m.novasTotais > 0 && m.secoesDeTeoria < minimoDeSecoes(m.novasTotais)) secoesInsuficientes += 1;
  }
  return {
    violacoesDeOrcamento: errosDoAudit(audit).length,
    lacunasDeCurriculo: audit.totals.lacunasDeCurriculo,
    errosDaBarra: barra.totais.erros,
    excessoDePasso,
    chavesSemDemonstracao,
    aulasSemDesafio,
    secoesInsuficientes,
  };
}

/** O hash do vetor — a identidade que detecta CICLO. Ordem = `COMPONENTES_DO_VETOR`. */
export function hashDoVetor(vetor: VetorDeEstado): string {
  return sha256Hex(COMPONENTES_DO_VETOR.map((c) => `${c}=${vetor[c]}`).join('|')).slice(0, 16);
}

/** μ — a medida inteira não-negativa da prova de terminação. */
export function muDoVetor(vetor: VetorDeEstado): number {
  return COMPONENTES_DE_MU.reduce((soma, c) => soma + vetor[c], 0);
}

/** true quando ALGUMA componente diminuiu de `antes` para `depois`. */
export function algumaComponenteDesceu(antes: VetorDeEstado, depois: VetorDeEstado): boolean {
  return COMPONENTES_DO_VETOR.some((c) => depois[c] < antes[c]);
}

// ---------------------------------------------------------------------------
// 2. OS SEIS RAMOS — a classificação que decide a ação do catálogo FECHADO
// ---------------------------------------------------------------------------

/**
 * Os SEIS ramos. Cada achado cai em EXATAMENTE UM, e o ramo — não a opinião de
 * ninguém — decide a ação do catálogo fechado do §6.7.
 *
 *   ORDEM        violação com `primeiraAulaQueEnsina !== null`: a construção é
 *                ensinada, mas depois de ser cobrada
 *                → REWRITE_IN_BUDGET, ou o movimento que o `reorder.ts` prova
 *   CADEIA       a chave não é ensinada NESTA trilha, mas é ensinada num curso
 *                ANTERIOR da cadeia → MOVE_CONCEPT_TO_ENTRY_BUDGET
 *   LACUNA       a chave não é ensinada em lugar nenhum da cadeia
 *                → INSERT_INTERMEDIATE
 *   QUEBRA       A17/A18/A21 — o passo é grande demais → SPLIT_LESSON
 *   DEMONSTRACAO A19/A22/A23 — declarar não é demonstrar → REWRITE_IN_BUDGET
 *   PROVA        A20/A24 — a aula não PROVA o que diz que ensina: ou não tem
 *                desafio nenhum (A20), ou tem quiz que se acerta sem ler
 *                (A24, o vazamento pelo comprimento das opções)
 *                → ADD_TEST / DECLARE_INTEGRATIVE / REWRITE_IN_BUDGET
 *
 * A24 entrou na barra DEPOIS que esta tabela foi escrita, e por um turno
 * inteiro os seus achados caíram em `foraDosRamos` — o que travou o ponto fixo
 * do rust-iniciante com "93 pendente" que eram 93 AVISOS. O defeito era o
 * previsto aqui mesmo (regra nova sem linha na tabela), não os avisos: eles já
 * eram ignorados pelo `semAchado`. Medido em 2026-09-22 e travado em
 * `tests/engineConvergencia.test.ts`: TODA regra de `REGRAS_DA_BARRA` tem
 * linha em `RAMO_DA_BARRA`.
 */
export const RAMOS = ['ORDEM', 'CADEIA', 'LACUNA', 'QUEBRA', 'DEMONSTRACAO', 'PROVA'] as const;
export type RamoDeConvergencia = (typeof RAMOS)[number];

/** UM achado classificado — a evidência vem ANTES do veredito (§6.3). */
export interface AchadoClassificado {
  /** id da regra que o produziu (`A1`…`A23`, `I12`…, `DEC`). */
  regra: string;
  /** `<moduloSlug>/<aulaSlug>`. */
  ref: string;
  /** a chave de átomo envolvida, quando a regra é sobre uma chave. */
  chave: AtomKey | null;
  /** caminho relativo à raiz da trilha (quando o achado tem arquivo). */
  arquivo: string | null;
  /** o que o disco mostra. */
  evidencia: string;
  /** a frase em pt-BR que o autor lê. */
  mensagem: string;
  ramo: RamoDeConvergencia;
  /** a ação do catálogo FECHADO que o ramo determina. */
  acao: AcaoCatalogo;
  severidade: 'erro' | 'aviso';
}

/**
 * Achado que NÃO cai em nenhum dos seis ramos — declarado, nunca convertido em
 * ação improvisada (§7.3: apontamento que não mapeia volta como DEFEITO DO
 * CATÁLOGO). É o caso das invariantes de ESTRUTURA (I12/I14–I17: slug
 * duplicado, `order` repetido, aula órfã) e de `DEC` (construção que quebra a
 * decidibilidade — criar aula para ela seria ensinar o que faz o gate mentir,
 * `modes/curriculumGap.ts`).
 */
export interface AchadoForaDosRamos {
  regra: string;
  ref: string;
  arquivo: string | null;
  mensagem: string;
  motivo: string;
}

export interface EntradaDaClassificacao {
  audit: AuditReport;
  barra: RelatorioDaBarra;
  /** chave de átomo → `<curso>/<modulo>/<aula>` do curso ANTERIOR que a ensina. */
  ensinadoAntesNaCadeia: ReadonlyMap<AtomKey, string>;
}

export interface Classificacao {
  achados: readonly AchadoClassificado[];
  foraDosRamos: readonly AchadoForaDosRamos[];
  /** contagem por ramo — só ERROS (aviso não abre rodada, §6.5). */
  porRamo: Record<RamoDeConvergencia, number>;
}

/** A tabela A-regra → ramo da BARRA. FECHADA: regra nova sem linha aqui é defeito. */
export const RAMO_DA_BARRA: Readonly<Record<string, RamoDeConvergencia>> = {
  A17: 'QUEBRA',
  A18: 'QUEBRA',
  A21: 'QUEBRA',
  A19: 'DEMONSTRACAO',
  A22: 'DEMONSTRACAO',
  A23: 'DEMONSTRACAO',
  A20: 'PROVA',
  A24: 'PROVA',
};

/** A ação de um achado da barra: a que a PRÓPRIA barra prescreve (§6.5). */
function acaoDaBarra(achado: AchadoDaBarra): AcaoCatalogo {
  return achado.acao;
}

/**
 * Classifica TODO achado dos dois gates em um dos seis ramos. PURA e
 * determinística.
 *
 * A polaridade ORDEM × (CADEIA | LACUNA) é a do §5.5 e vem do campo
 * `primeiraAulaQueEnsina` da violação — NUNCA de leitura de texto. A terceira
 * pergunta ("e nos cursos conectados antes dele?") é o ramo CADEIA, e ela só
 * existe porque o dono a fez: sem a cadeia no disco o mapa chega VAZIO e todo
 * não-ensinado cai em LACUNA, que é a resposta CORRETA para um curso que é o
 * primeiro da sua cadeia.
 */
export function classificarAchados(entrada: EntradaDaClassificacao): Classificacao {
  const achados: AchadoClassificado[] = [];
  const foraDosRamos: AchadoForaDosRamos[] = [];
  const porRamo: Record<RamoDeConvergencia, number> = {
    ORDEM: 0,
    CADEIA: 0,
    LACUNA: 0,
    QUEBRA: 0,
    DEMONSTRACAO: 0,
    PROVA: 0,
  };

  // DEDUPLICAÇÃO por (regra, arquivo, campo, construção) — a MESMA chave que
  // `reorder.ts::chaveDaViolacao` usa, e pelo mesmo motivo: o audit emite UMA
  // violação por OCORRÊNCIA, e a mesma construção faltando em três linhas do
  // mesmo arquivo é UM defeito com UMA ação. MEDIDO em 2026-09-22:
  // `npm run engine -- convergir rust-iniciante` listava `global:HashMap` em
  // `colecoes/consultar-o-mapa` três vezes, com o mesmo INSERT_INTERMEDIATE —
  // três linhas de plano para uma aula a criar. A linha/coluna sai da chave de
  // propósito: o texto não muda entre as ocorrências, a posição sim.
  const vistas = new Set<string>();
  for (const v of errosDoAudit(entrada.audit)) {
    const chaveDaViolacao = [v.regra, v.arquivo, String(v.campo), v.construcao ?? ''].join('\u0000');
    if (vistas.has(chaveDaViolacao)) continue;
    vistas.add(chaveDaViolacao);
    if (v.construcao === null) {
      foraDosRamos.push({
        regra: v.regra,
        ref: v.ref,
        arquivo: v.arquivo,
        mensagem: v.mensagem,
        motivo:
          'violação sem construção de átomo (invariante de ESTRUTURA, §5.2): não é ORDEM, não é LACUNA e ' +
          'nenhuma das 14 ações do catálogo fechado a resolve sem improviso — declarada aqui, §7.3.',
      });
      continue;
    }
    if (v.regra === 'DEC') {
      foraDosRamos.push({
        regra: v.regra,
        ref: v.ref,
        arquivo: v.arquivo,
        mensagem: v.mensagem,
        motivo:
          'DEC quebra a DECIDIBILIDADE da análise (§5.3): criar a aula que a ensina seria ensinar a ' +
          'construção que faz o gate mentir — a mesma exclusão de `modes/curriculumGap.lacunasDoAudit`.',
      });
      continue;
    }
    if (v.primeiraAulaQueEnsina !== null) {
      achados.push({
        regra: v.regra,
        ref: v.ref,
        chave: v.construcao,
        arquivo: v.arquivo,
        evidencia: `${v.campo}:${v.linha}:${v.coluna} usa ${v.construcao}, ensinada em ${v.primeiraAulaQueEnsina} (DEPOIS desta aula)`,
        mensagem: v.mensagem,
        ramo: 'ORDEM',
        acao: 'REWRITE_IN_BUDGET',
        severidade: 'erro',
      });
      porRamo.ORDEM += 1;
      continue;
    }
    const antes = entrada.ensinadoAntesNaCadeia.get(v.construcao);
    if (antes !== undefined) {
      achados.push({
        regra: v.regra,
        ref: v.ref,
        chave: v.construcao,
        arquivo: v.arquivo,
        evidencia: `${v.construcao} não é ensinada nesta trilha, e É ensinada em ${antes} (curso ANTERIOR da cadeia)`,
        mensagem:
          `${humanLabel(v.construcao)} vem do curso anterior da cadeia (${antes}): ela é CRITÉRIO DE ENTRADA ` +
          'desta trilha, não aula nova — declare-a no orçamento de entrada.',
        ramo: 'CADEIA',
        acao: 'MOVE_CONCEPT_TO_ENTRY_BUDGET',
        severidade: 'erro',
      });
      porRamo.CADEIA += 1;
      continue;
    }
    achados.push({
      regra: v.regra,
      ref: v.ref,
      chave: v.construcao,
      arquivo: v.arquivo,
      evidencia: `${v.construcao} não é ensinada em NENHUMA aula desta trilha nem em curso anterior da cadeia`,
      mensagem: v.mensagem,
      ramo: 'LACUNA',
      acao: 'INSERT_INTERMEDIATE',
      severidade: 'erro',
    });
    porRamo.LACUNA += 1;
  }

  for (const a of entrada.barra.achados) {
    const ramo = RAMO_DA_BARRA[a.regra];
    if (ramo === undefined) {
      foraDosRamos.push({
        regra: a.regra,
        ref: a.ref,
        arquivo: null,
        mensagem: a.mensagem,
        motivo:
          `a regra ${a.regra} da barra não tem linha na tabela RAMO_DA_BARRA deste módulo — regra nova sem ` +
          'ramo é DEFEITO do catálogo, não achado a improvisar (§7.3).',
      });
      continue;
    }
    achados.push({
      regra: a.regra,
      ref: a.ref,
      chave: a.chave,
      arquivo: `modules/${a.ref.split('/')[0]}/lessons/${a.ref.split('/')[1]}/${LESSON_FILE}`,
      evidencia: a.evidencia,
      mensagem: a.mensagem,
      ramo,
      acao: acaoDaBarra(a),
      severidade: a.severidade,
    });
    if (a.severidade === 'erro') porRamo[ramo] += 1;
  }

  return { achados, foraDosRamos, porRamo };
}

// ---------------------------------------------------------------------------
// 3. O PLANEJADOR DA QUEBRA — o coração do pedido do dono
// ---------------------------------------------------------------------------

/**
 * A POSIÇÃO da primeira ocorrência de cada chave nos blocos de teoria da aula.
 *
 * POR QUE ELA É LIDA AQUI e não vem da barra: a barra publica os GRUPOS (a
 * relação de co-ocorrência de linha, que é a REGRA e nunca é recalculada aqui),
 * mas não publica POSIÇÃO — e "grupo que aparece antes na teoria vem antes" é
 * ordem, não agrupamento. Esta função usa os MESMOS dois primitivos da barra
 * (`collectLessonCode` + `extractAllOccurrences` com `surface: 'theory'`, que é
 * o que liga o ENVELOPE DE FRAGMENTO do `extract.ts`) e lê SÓ posição.
 *
 * Bloco que não parseia é ignorado aqui (a barra já o reprova em A19 com
 * fail-closed). Chave sem ocorrência nenhuma recebe `Number.MAX_SAFE_INTEGER`:
 * sem demonstração ela não tem lugar na teoria, e o planejador a põe no fim.
 */
export function posicoesDasChaves(
  meta: TrackLessonSource,
  adapterId: LanguageId,
): Map<AtomKey, number> {
  const posicoes = new Map<AtomKey, number>();
  const colhidos = collectLessonCode((meta.theory ?? []) as readonly TrackTheorySection[]);
  let indiceDoBloco = 0;
  for (const bloco of colhidos.blocks) {
    indiceDoBloco += 1;
    if (bloco.adapterId !== adapterId) continue;
    const resultado = extractAllOccurrences(bloco.code, {
      language: adapterId,
      surface: 'theory',
      fileName: `${meta.slug}#teoria`,
    });
    if (!resultado.ok) continue;
    for (const ocorrencia of resultado.occurrences) {
      const posicao = indiceDoBloco * 1_000_000 + ocorrencia.line * 1_000 + ocorrencia.column;
      const atual = posicoes.get(ocorrencia.key);
      if (atual === undefined || posicao < atual) posicoes.set(ocorrencia.key, posicao);
    }
  }
  return posicoes;
}

/** Um GRUPO de co-ocorrência, com o que o planejador precisa saber dele. */
export interface GrupoDaQuebra {
  chaves: readonly AtomKey[];
  /** true quando ALGUMA chave do grupo é produtiva nova nesta aula. */
  produtivo: boolean;
  /** posição da primeira ocorrência do grupo na teoria (ordem de dependência). */
  posicao: number;
  /** a chave que DISTINGUE o grupo — a que dá nome à aula nova. */
  chaveQueDistingue: AtomKey;
  /** true quando o grupo SOZINHO já estoura o teto de chaves novas por aula. */
  acimaDoTetoDeChaves: boolean;
}

/** A ficha de autoria da aula nova — o MESMO formato do campo `autoria`. */
export interface FichaDeAutoria {
  modulo: string;
  moduloTitulo: string;
  /** posição da aula DENTRO do módulo, 1-based, na ordem NOVA. */
  aula: number;
  ensina: string;
  presume: string;
  quiz: string;
  desafio: string;
}

/** UMA aula nova da quebra — tudo decidido por código. */
export interface AulaDaQuebra {
  /** slug kebab-case, derivado da construção-alvo + sha256 do grupo. */
  slug: string;
  /** título em pt-BR. */
  titulo: string;
  moduloSlug: string;
  /** `<moduloSlug>/<slug>`. */
  ref: string;
  /** os grupos que esta aula recebe (NENHUM deles foi partido). */
  grupos: readonly GrupoDaQuebra[];
  /** todas as chaves desta aula (a união dos grupos). */
  chaves: readonly AtomKey[];
  /** quantos grupos PRODUTIVOS ela recebe (≤ `tetoDeGruposProdutivos`). */
  gruposProdutivos: number;
  /** a aula ANTES da qual ela entra (sempre a aula original ou a próxima nova). */
  inserirAntesDe: string;
  /** índice de inserção no array `lessons` do `module.json` (0-based). */
  indiceNoModulo: number;
  /** a aula anterior na ordem NOVA — o `prerequisites` da aula nova. */
  prerequisites: readonly string[];
  autoria: FichaDeAutoria;
  /** true quando o slug JÁ está no `module.json` (quebra já aplicada — idempotência). */
  jaExiste: boolean;
}

/**
 * A PRESCRIÇÃO de `introduces.derived` para um grupo que sozinho estoura o teto
 * de chaves novas (A21). É o array literal que o autor cola no `lesson.json`:
 * `chave` é cada membro do grupo e `de` é a chave que distingue.
 */
export interface DerivadaProposta {
  /** `<modulo>/<aula>` que recebe a declaração. */
  aula: string;
  grupo: readonly AtomKey[];
  derived: readonly { chave: AtomKey; de: AtomKey }[];
}

export interface PlanoDeQuebra {
  /** a aula que se quebra. */
  ref: string;
  /** o teto de grupos produtivos da PRIMEIRA aula do pacote (1 na aula 1, §A18). */
  tetoDeGruposProdutivos: number;
  grupos: readonly GrupoDaQuebra[];
  aulasNovas: readonly AulaDaQuebra[];
  /** as chaves que FICAM na aula original (o último pacote). */
  chavesQueFicam: readonly AtomKey[];
  /** as chaves que a aula original tem de PERDER (as que foram para as novas). */
  chavesQuePerde: readonly AtomKey[];
  /** grupos que sozinhos estouram o teto de chaves — com a prescrição. */
  derivadasAPropor: readonly DerivadaProposta[];
  declaracoes: readonly string[];
}

export interface EntradaDaQuebra {
  /** a aula a quebrar, do disco. */
  meta: TrackLessonSource;
  moduloSlug: string;
  moduloTitulo: string;
  /** o array `lessons` do `module.json` — de onde sai a posição. */
  lessonsDoModulo: readonly string[];
  /** a métrica da barra DESTA aula (os `grupos` e as contagens). */
  metrica: MetricaDaBarra;
  /** o orçamento da aula (para saber quais chaves novas são PRODUTIVAS). */
  orcamento: LessonBudget;
  /** o adaptador da trilha (para ler a posição das chaves na teoria). */
  adapterId: LanguageId;
  /** true quando esta é a aula 1 da TRILHA (teto 1 grupo produtivo — A18). */
  primeiraDaTrilha: boolean;
}

/** Normaliza um pedaço de chave para kebab-case de slug. */
function sanitizarParaSlug(valor: string): string {
  return valor
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** O prefixo pt-BR do slug das aulas da quebra — "o passo que faltava". */
export const PREFIXO_SLUG_QUEBRA = 'passo';

/**
 * O SLUG da aula nova: `passo-<construção-alvo>-<sha256(grupo)[0..8]>`.
 *
 * O prefixo é pt-BR e o corpo é o TOKEN da construção, não uma tradução: a
 * chave de átomo é a IDENTIDADE da construção em todo este repositório
 * (`firstTaughtIn`, `introduces`, `targetAtom`), e traduzi-la quebraria a
 * rastreabilidade entre o slug e o gate que o produziu. O sufixo de hash existe
 * pela MESMA razão de `curriculumGap.slugDaAulaDeLacuna`: chaves diferentes
 * sanitizam para o mesmo corpo com facilidade, e slug de aula é CHAVE GLOBAL de
 * progresso do aluno (I12).
 */
export function slugDaAulaDaQuebra(chaveQueDistingue: AtomKey, grupo: readonly AtomKey[]): string {
  const corpo = sanitizarParaSlug(chaveQueDistingue).slice(0, 40).replace(/-+$/, '');
  const hash = sha256Hex([...grupo].sort().join('|')).slice(0, 8);
  return corpo.length > 0 ? `${PREFIXO_SLUG_QUEBRA}-${corpo}-${hash}` : `${PREFIXO_SLUG_QUEBRA}-${hash}`;
}

/**
 * A CHAVE QUE DISTINGUE um grupo — a que dá nome à aula e vira o pai das
 * derivadas. Ordem de preferência, declarada e determinística:
 *
 *   1. o `targetAtom` da aula, quando está no grupo (é a construção que a aula
 *      declara como alvo — a resposta do próprio autor);
 *   2. a primeira chave PRODUTIVA do grupo na ordem em que `introduces.
 *      productive` a declara (a ordem de ensino que o autor escreveu);
 *   3. a primeira chave do grupo em ordem alfabética (desempate total).
 */
export function chaveQueDistingue(
  grupo: readonly AtomKey[],
  produtivasDeclaradas: readonly AtomKey[],
  targetAtom: string | undefined,
): AtomKey {
  const noGrupo = new Set(grupo);
  if (targetAtom !== undefined && noGrupo.has(targetAtom)) return targetAtom;
  for (const chave of produtivasDeclaradas) {
    if (noGrupo.has(chave)) return chave;
  }
  return [...grupo].sort()[0];
}

/** `node:FunctionItem` → `FunctionItem`; `op:binary:*` → `*`. */
function tokenDa(chave: AtomKey): string {
  return humanLabel(chave).replace(/^[`"]|[`"]$/g, '');
}

/**
 * O PLANEJADOR DA QUEBRA — o procedimento que o ramo (c) do pedido do dono
 * exigia e que só existia como conselho.
 *
 * AS QUATRO REGRAS, e nenhuma delas é negociável:
 *
 *   1. UM GRUPO NUNCA SE PARTE. Os grupos vêm de `barra.agruparPorLinha`
 *      (componentes conexas de "ocorre na MESMA LINHA de um bloco desta aula").
 *      Se três chaves saem da mesma linha, não existe aula que ensine duas e não
 *      a terceira — partir o grupo produziria uma aula impossível de escrever.
 *   2. NO MÁXIMO 2 GRUPOS PRODUTIVOS por aula (A17/`TETO_PRODUTIVAS_NOVAS`) e,
 *      na PRIMEIRA aula da trilha, 1 (A18/`TETO_PRODUTIVAS_NOVAS_AULA_1`) — na
 *      aula 1 o aluno não tem orçamento nenhum para amortecer o passo.
 *   3. NO MÁXIMO 4 CHAVES NOVAS por aula (A21/`TETO_NOVAS_TOTAL`), somando o que
 *      o aluno escreve e o que ele só lê.
 *   4. A ORDEM DE DEPENDÊNCIA é preservada: grupo que aparece antes na teoria
 *      vem antes (`posicoesDasChaves`).
 *
 * O GRUPO QUE SOZINHO ESTOURA A REGRA 3 (medido: os dois grupos produtivos da
 * aula 1 do `rust-iniciante` têm 5 chaves cada) não é partido — seria violar a
 * regra 1, que é mais forte. Ele vai para uma aula SÓ DELE e o plano emite a
 * prescrição que realmente o resolve: DECLARAR `introduces.derived` para o
 * grupo. As chaves co-ocorrem na mesma linha, logo a regra do par (A23) as
 * colapsa em UM item — é o que deixou o `python-iniciante` em ZERO erro na
 * barra (5 aulas ganharam `derived` em 2026-09-22). Sem a declaração, elas
 * contam cheias e a aula continua vermelha: o trabalho fica VISÍVEL no gate.
 *
 * O ÚLTIMO PACOTE FICA NA AULA ORIGINAL (é o "o que sobra"); os anteriores
 * viram aulas novas, inseridas IMEDIATAMENTE ANTES dela, na ordem. Se o último
 * pacote não tiver grupo produtivo nenhum, ele é fundido no anterior: aula sem
 * produtiva nova é A20 por construção, e planejar uma aula que já nasce
 * reprovada é planejar retrabalho.
 *
 * PURA: não abre arquivo, não grava nada, não chama LLM.
 */
export function planejarQuebra(entrada: EntradaDaQuebra): PlanoDeQuebra {
  const declaracoes: string[] = [
    'os GRUPOS são os de `quality/barra.ts::agruparPorLinha` (co-ocorrência de linha); este planejador NUNCA os recalcula e NUNCA os parte.',
    'a ORDEM dos grupos é a da primeira ocorrência na teoria (`posicoesDasChaves`): grupo que aparece antes vem antes.',
    'o ÚLTIMO pacote fica na aula original; os anteriores viram aulas novas inseridas imediatamente antes dela.',
  ];

  const ref = entrada.metrica.ref;
  const posicoes = posicoesDasChaves(entrada.meta, entrada.adapterId);
  const produtivasNovas = new Set<AtomKey>(
    entrada.orcamento.introduces.productive.filter((k) => !entrada.orcamento.entrada.productive.has(k)),
  );
  const produtivasDeclaradas = entrada.orcamento.introduces.productive;
  const targetAtom = (entrada.meta as unknown as Record<string, unknown>).targetAtom;

  const grupos: GrupoDaQuebra[] = entrada.metrica.grupos.map((chaves) => {
    const posicao = chaves.reduce(
      (min, k) => Math.min(min, posicoes.get(k) ?? Number.MAX_SAFE_INTEGER),
      Number.MAX_SAFE_INTEGER,
    );
    return {
      chaves: [...chaves],
      produtivo: chaves.some((k) => produtivasNovas.has(k)),
      posicao,
      chaveQueDistingue: chaveQueDistingue(
        chaves,
        produtivasDeclaradas,
        typeof targetAtom === 'string' ? targetAtom : undefined,
      ),
      acimaDoTetoDeChaves: chaves.length > TETO_NOVAS_TOTAL,
    };
  });

  // Ordem de dependência, com desempate TOTAL pela chave que distingue — sem
  // ele duas chaves sem ocorrência empatariam e o plano deixaria de ser
  // byte-a-byte determinístico.
  const ordenados = [...grupos].sort((a, b) =>
    a.posicao !== b.posicao
      ? a.posicao - b.posicao
      : a.chaveQueDistingue < b.chaveQueDistingue
        ? -1
        : a.chaveQueDistingue > b.chaveQueDistingue
          ? 1
          : 0,
  );

  const tetoDeGruposProdutivos = entrada.primeiraDaTrilha
    ? TETO_PRODUTIVAS_NOVAS_AULA_1
    : TETO_PRODUTIVAS_NOVAS;

  // ── O EMPACOTAMENTO ──────────────────────────────────────────────────────
  const pacotes: GrupoDaQuebra[][] = [];
  let corrente: GrupoDaQuebra[] = [];
  let produtivosNaCorrente = 0;
  let chavesNaCorrente = 0;
  for (const grupo of ordenados) {
    // O teto de grupos produtivos do pacote CORRENTE: 1 só no primeiro pacote
    // de uma quebra da aula 1 da trilha (esse pacote é quem passa a ser a aula
    // 1), 2 nos demais.
    const teto = pacotes.length === 0 && entrada.primeiraDaTrilha
      ? TETO_PRODUTIVAS_NOVAS_AULA_1
      : TETO_PRODUTIVAS_NOVAS;
    const estouraProdutivos = grupo.produtivo && produtivosNaCorrente + 1 > teto;
    const estouraChaves = chavesNaCorrente + grupo.chaves.length > TETO_NOVAS_TOTAL;
    if (corrente.length > 0 && (estouraProdutivos || estouraChaves)) {
      pacotes.push(corrente);
      corrente = [];
      produtivosNaCorrente = 0;
      chavesNaCorrente = 0;
    }
    corrente.push(grupo);
    if (grupo.produtivo) produtivosNaCorrente += 1;
    chavesNaCorrente += grupo.chaves.length;
  }
  if (corrente.length > 0) pacotes.push(corrente);

  // O ÚLTIMO pacote fica na aula original, e aula sem produtiva nova é A20 por
  // construção — funde no anterior em vez de planejar uma aula já reprovada.
  if (pacotes.length > 1) {
    const ultimo = pacotes[pacotes.length - 1];
    if (!ultimo.some((g) => g.produtivo)) {
      pacotes[pacotes.length - 2].push(...ultimo);
      pacotes.pop();
      declaracoes.push(
        'ÚLTIMO PACOTE SEM GRUPO PRODUTIVO: fundido no anterior — aula que não introduz construção produtiva ' +
          'nova é A20 por construção, e planejar uma aula que já nasce reprovada é planejar retrabalho.',
      );
    }
  }

  // ── As aulas novas (todos os pacotes MENOS o último) ─────────────────────
  const ancora = entrada.meta.slug;
  const indiceDaAncora = entrada.lessonsDoModulo.indexOf(ancora);
  const baseDeInsercao = indiceDaAncora < 0 ? entrada.lessonsDoModulo.length : indiceDaAncora;
  const anteriorNoModulo = baseDeInsercao > 0 ? entrada.lessonsDoModulo[baseDeInsercao - 1] : null;
  const existentes = new Set(entrada.lessonsDoModulo);

  const aulasNovas: AulaDaQuebra[] = [];
  const novos = pacotes.slice(0, Math.max(0, pacotes.length - 1));
  novos.forEach((pacote, i) => {
    const chaves = [...new Set(pacote.flatMap((g) => g.chaves))].sort();
    const distingue = pacote.find((g) => g.produtivo)?.chaveQueDistingue ?? pacote[0].chaveQueDistingue;
    const slug = slugDaAulaDaQuebra(distingue, chaves);
    const anterior = i === 0 ? anteriorNoModulo : aulasNovas[i - 1].slug;
    const rotulos = chaves.map((k) => tokenDa(k)).join(', ');
    aulasNovas.push({
      slug,
      titulo: `O passo que faltava: ${tokenDa(distingue)}`,
      moduloSlug: entrada.moduloSlug,
      ref: `${entrada.moduloSlug}/${slug}`,
      grupos: pacote,
      chaves,
      gruposProdutivos: pacote.filter((g) => g.produtivo).length,
      // A âncora de inserção é SEMPRE a aula ORIGINAL: as novas entram todas
      // antes dela e, como `moduleJsonComAulasDaQuebra` as insere NA ORDEM do
      // array (cada `splice` no índice da âncora empurra a âncora para a
      // frente), a ordem relativa entre as novas é preservada sem que nenhuma
      // delas precise apontar para outra aula nova que ainda não existe.
      inserirAntesDe: `${entrada.moduloSlug}/${ancora}`,
      indiceNoModulo: baseDeInsercao + i,
      prerequisites: anterior === null ? [] : [anterior],
      autoria: {
        modulo: entrada.moduloSlug,
        moduloTitulo: entrada.moduloTitulo,
        aula: baseDeInsercao + i + 1,
        ensina: `${rotulos} — grupo(s) de co-ocorrência medido(s) pela barra em ${ref}; a construção que distingue é ${distingue}`,
        presume: anterior === null ? '(nada — é a primeira aula da trilha)' : anterior,
        quiz:
          `A AUTORAR: 1 afirmação sobre ${tokenDa(distingue)}, com 4 opções e a seção de teoria que a demonstra ` +
          '(`assertions[].sectionId`).',
        desafio:
          `A AUTORAR: o desafio desta aula tem de FORÇAR ${tokenDa(distingue)} — A20 exige desafio em toda aula, e ` +
          'a cláusula J5 (`npm run engine -- discrimination`) mede se o TESTE discrimina a construção.',
      },
      jaExiste: existentes.has(slug),
    });
  });

  const ultimo = pacotes[pacotes.length - 1] ?? [];
  const chavesQueFicam = [...new Set(ultimo.flatMap((g) => g.chaves))].sort();
  const chavesQuePerde = [...new Set(aulasNovas.flatMap((a) => a.chaves))].sort();

  // ── As derivadas a propor (o grupo que sozinho estoura o teto de chaves) ──
  const derivadasAPropor: DerivadaProposta[] = [];
  for (const pacote of pacotes) {
    for (const grupo of pacote) {
      if (!grupo.acimaDoTetoDeChaves) continue;
      const pai = grupo.chaveQueDistingue;
      const aulaDestino =
        aulasNovas.find((a) => a.grupos.includes(grupo))?.ref ?? ref;
      derivadasAPropor.push({
        aula: aulaDestino,
        grupo: grupo.chaves,
        derived: grupo.chaves.filter((k) => k !== pai).map((k) => ({ chave: k, de: pai })),
      });
    }
  }
  if (derivadasAPropor.length > 0) {
    declaracoes.push(
      `${derivadasAPropor.length} grupo(s) com mais de ${TETO_NOVAS_TOTAL} chaves NÃO foram partidos (regra 1 é mais forte ` +
        'que a regra 3): cada um vai para uma aula só dele e o plano prescreve DECLARAR `introduces.derived` ' +
        '(A23 colapsa o grupo em 1 item porque as chaves co-ocorrem na mesma linha). Sem a declaração a aula ' +
        'continua vermelha — e é correto que continue.',
    );
  }
  if (aulasNovas.length === 0) {
    declaracoes.push(
      'NENHUMA aula nova: os grupos desta aula couberam em UM pacote só. O achado que abriu a quebra vem do ' +
        'teto de CHAVES (A21) sobre um grupo que não se parte — a ação que resta é a derivada declarada, não o split.',
    );
  }

  return {
    ref,
    tetoDeGruposProdutivos,
    grupos: ordenados,
    aulasNovas,
    chavesQueFicam,
    chavesQuePerde,
    derivadasAPropor,
    declaracoes,
  };
}

// ---------------------------------------------------------------------------
// 4. AS AÇÕES — catálogo FECHADO, com arquivo, alvo e resultado esperado (§7.3)
// ---------------------------------------------------------------------------

/** UMA ação planejada, na forma que o §7.3 exige. */
export interface AcaoPlanejada {
  acao: AcaoCatalogo;
  ramo: RamoDeConvergencia;
  /** a aula alvo (`<modulo>/<aula>`). */
  ref: string;
  /** o arquivo que a ação toca (relativo à raiz da trilha), quando há um. */
  arquivo: string | null;
  /** o alvo dentro do arquivo (chave, campo, ou o array `lessons`). */
  alvo: string;
  resultadoEsperado: string;
  /**
   * true quando esta ação é DETERMINÍSTICA e este módulo a aplica com
   * `--aplicar`. false = a ação é de AUTORIA (prosa, exemplo, quiz, desafio) ou
   * de declaração de orçamento, e o motivo sai em `motivoNaoAplicavel`.
   */
  aplicavel: boolean;
  motivoNaoAplicavel: string | null;
}

/** Ação aplicada de verdade — o que foi gravado. */
export interface AcaoAplicada {
  acao: AcaoCatalogo;
  ramo: RamoDeConvergencia;
  ref: string;
  arquivos: readonly string[];
}

const MOTIVO_AUTORIA =
  'AUTORIA: exige prosa/exemplo/quiz/desafio escritos, e este módulo é ZERO LLM por contrato (P1 do §2). ' +
  'O plano nomeia o arquivo e o alvo; quem escreve é o autor.';

const MOTIVO_ORCAMENTO =
  'DECLARAÇÃO DE ORÇAMENTO: mexer em `introduces`/`entryCriteria` sem mover a DEMONSTRAÇÃO criaria A19 ' +
  '(chave declarada sem bloco que a demonstre) — μ subiria em vez de descer. Sai no plano, não é aplicada.';

// ---------------------------------------------------------------------------
// 5. UMA ITERAÇÃO e o RESULTADO
// ---------------------------------------------------------------------------

/** Uma medição de gate: o comando que a reproduz, o exit que ele daria e o placar. */
export interface MedicaoDeGate {
  comando: string;
  exit: number;
  placar: string;
}

export type Veredito = 'PONTO-FIXO' | 'CICLO' | 'SEM-PROGRESSO' | 'TETO' | 'DRY-RUN';

/** UMA iteração do laço — é também a linha do ledger (append-only). */
export interface IteracaoDaConvergencia {
  iteracao: number;
  commit: string | null;
  ambiente: Record<string, string>;
  medicoes: readonly MedicaoDeGate[];
  /** os ids das limitações declaradas pelo audit (ex.: `A13-A16-NAO-RODOU`). */
  limitacoesDeclaradas: readonly string[];
  vetor: VetorDeEstado;
  mu: number;
  achadosPorRamo: Record<RamoDeConvergencia, number>;
  achadosForaDosRamos: number;
  acoesPlanejadas: readonly AcaoPlanejada[];
  acoesAplicadas: readonly AcaoAplicada[];
  planosDeQuebra: readonly PlanoDeQuebra[];
  hashDoVetor: string;
  /** `null` enquanto a iteração não fecha o laço. */
  veredito: Veredito | null;
}

export type ModoDeConvergencia = 'dry-run' | 'aplicar';

export interface ResultadoDeConvergencia {
  slug: string;
  modo: ModoDeConvergencia;
  iteracoes: readonly IteracaoDaConvergencia[];
  veredito: Veredito;
  /** os achados que sobraram na ÚLTIMA iteração (o que o autor tem de fazer). */
  achadosRemanescentes: readonly AchadoClassificado[];
  foraDosRamos: readonly AchadoForaDosRamos[];
  /** os arquivos gravados, em ordem de gravação. */
  escritos: readonly string[];
  declaracoes: readonly string[];
}

export interface LeituraDaCadeia {
  mapa: Map<AtomKey, string>;
  declaracao: string;
}

export interface DepsDaConvergencia {
  carregarTrilha: (slug: string) => Promise<LoadedTrack>;
  /** grava um arquivo relativo à raiz da trilha (o CLI injeta a escrita atômica). */
  gravarArquivo: (arquivoRelativo: string, conteudo: string) => Promise<void>;
  /** append de UMA linha no ledger (o CLI injeta o caminho). */
  registrarNoLedger: (linha: string) => Promise<void>;
  /** o HEAD do git; `null` quando o comando falha (declarado, nunca inventado). */
  lerCommit?: () => Promise<string | null>;
  /** as versões de toolchain do host. */
  lerAmbiente?: () => Promise<Record<string, string>>;
  /** a cadeia de cursos ANTERIORES. Default: mapa vazio + a limitação declarada. */
  lerCadeia?: (track: LoadedTrack) => Promise<LeituraDaCadeia>;
}

export interface EntradaDaConvergencia {
  slug: string;
  modo: ModoDeConvergencia;
  opcoesDeAudit?: DeriveOptions;
  /** AUSENTE = SEM TETO (o pedido do dono). Presente, PARA em TETO. */
  maxIteracoes?: number;
}

// ---------------------------------------------------------------------------
// 6. A CADEIA — programado CONTRA a assinatura acordada de `graph/cadeia.ts`
// ---------------------------------------------------------------------------

/**
 * O leitor da CADEIA de cursos.
 *
 * A assinatura ACORDADA de `engine/graph/cadeia.ts` (construído em paralelo
 * nesta mesma execução) é:
 *
 *     export interface CursoDaCadeia { slug: string; nivel: number; dir: string }
 *     export async function cadeiaAnteriorDe(track, tracksDir): Promise<CursoDaCadeia[]>
 *     export async function ensinadoAntesNaCadeia(track, tracksDir): Promise<Map<string, string>>
 *
 * MEDIDO: em 2026-09-22 o arquivo passou a existir e este leitor o carrega —
 * `npm run engine -- convergir rust-iniciante` imprime `RAMO CADEIA ATIVO
 * (engine/graph/cadeia.ts): 0 construção(ões) ensinada(s) em curso ANTERIOR`.
 * Zero é a resposta CORRETA para os três cursos de hoje (`python-iniciante`,
 * `rust-iniciante`, `c-iniciante`): cada um é o PRIMEIRO da sua cadeia, não
 * existe curso antes dele, e "a chave não é ensinada em lugar nenhum da cadeia"
 * é literalmente verdade.
 *
 * O import segue DINÂMICO (especificador em VARIÁVEL) porque o ramo CADEIA é
 * ADITIVO e não pode derrubar os outros cinco: se o módulo sair, trocar de nome
 * ou lançar, o mapa volta VAZIO com a limitação DECLARADA (§9.2) e o laço
 * continua medindo ORDEM, LACUNA, QUEBRA, DEMONSTRAÇÃO e PROVA. Um import
 * estático faria este arquivo inteiro parar de compilar por causa do único ramo
 * que hoje devolve zero.
 */
export function criarLeitorDaCadeia(tracksDir: string): (track: LoadedTrack) => Promise<LeituraDaCadeia> {
  return async (track: LoadedTrack): Promise<LeituraDaCadeia> => {
    const especificador = '../graph/cadeia';
    try {
      const modulo = (await import(especificador)) as {
        ensinadoAntesNaCadeia?: (t: LoadedTrack, d: string) => Promise<Map<string, string>>;
      };
      if (typeof modulo.ensinadoAntesNaCadeia !== 'function') {
        return {
          mapa: new Map(),
          declaracao:
            'RAMO CADEIA VAZIO: `engine/graph/cadeia.ts` existe mas não exporta `ensinadoAntesNaCadeia` — ' +
            'todo não-ensinado é tratado como LACUNA (§5.5). Fail-closed: nada é inventado.',
        };
      }
      const mapa = await modulo.ensinadoAntesNaCadeia(track, tracksDir);
      return {
        mapa,
        declaracao:
          `RAMO CADEIA ATIVO (\`engine/graph/cadeia.ts\`): ${mapa.size} construção(ões) ensinada(s) em curso ` +
          'ANTERIOR desta cadeia — cada uma vira MOVE_CONCEPT_TO_ENTRY_BUDGET, não aula nova.',
      };
    } catch {
      return {
        mapa: new Map(),
        declaracao:
          'RAMO CADEIA VAZIO: `engine/graph/cadeia.ts` não está no disco (a cadeia de cursos ainda não existe ' +
          'em código — nenhum `track.json` aponta para curso anterior). Todo não-ensinado cai em LACUNA, que é ' +
          'a resposta CORRETA para um curso que é o PRIMEIRO da sua cadeia.',
      };
    }
  };
}

// ---------------------------------------------------------------------------
// 7. AMBIENTE E COMMIT — o que o ledger registra sobre a máquina
// ---------------------------------------------------------------------------

/** Roda um comando e devolve stdout; `null` em qualquer falha (nunca inventa). */
function rodar(comando: string, args: readonly string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(comando, [...args], { timeout: 10_000 }, (erro, stdout) => {
      if (erro) resolve(null);
      else resolve(stdout.trim());
    });
  });
}

/** O HEAD do git. `null` quando o comando falha — declarado, nunca inventado. */
export async function lerCommitDoGit(): Promise<string | null> {
  return rodar('git', ['rev-parse', 'HEAD']);
}

/**
 * As versões de toolchain do host: só o que EXISTE entra no mapa. A ausência é
 * informação (o gate de Rust não roda sem `cargo`), e por isso a chave ausente
 * nunca vira string vazia.
 */
export async function lerAmbienteDoHost(): Promise<Record<string, string>> {
  const alvos: Array<[string, string, readonly string[]]> = [
    ['node', 'node', ['--version']],
    ['python3', 'python3', ['--version']],
    ['clang', 'clang', ['--version']],
    ['cargo', 'cargo', ['--version']],
  ];
  const saida: Record<string, string> = {};
  for (const [nome, comando, args] of alvos) {
    const texto = await rodar(comando, args);
    if (texto !== null && texto.length > 0) saida[nome] = texto.split('\n')[0];
  }
  return saida;
}

// ---------------------------------------------------------------------------
// 8. O ESQUELETO da aula nova — declara o que precisa ser escrito
// ---------------------------------------------------------------------------

/**
 * O `lesson.json` de ESQUELETO de uma aula da quebra.
 *
 * O que ele NÃO tem, e cada ausência é deliberada:
 *
 *   - SEM `introduces`. Declarar a chave sem a demonstração é A19 na hora, e
 *     `budget.ts:281` (`saida = entrada ∪ introduces`) tornaria a chave LEGAL na
 *     própria aula — o MECANISMO que legalizou o penhasco da aula 1 do Rust.
 *     A aula nova não repete o defeito que ela existe para consertar;
 *   - SEM prosa de teoria, SEM quiz, SEM fonte, SEM desafio. A seção única diz
 *     que a aula está em autoria e aponta para a ficha;
 *   - COM `autoria` — a FICHA (ensina, presume, quiz, desafio), no MESMO formato
 *     que as 113 aulas-esqueleto do `c-iniciante` usam
 *     (`resources/tracks/c-iniciante/modules/a-tela/lessons/devolver-zero/lesson.json`).
 *
 * Consequência MEDIDA e desejada: a próxima iteração reprova esta aula por A20
 * (aula sem desafio, e aula regular sem produtiva nova). É honesto — o trabalho
 * que falta fica visível no gate, com aula e ação prescrita.
 */
export function lessonJsonDaQuebra(
  aula: AulaDaQuebra,
  plano: PlanoDeQuebra,
  dificuldadeDaAncora: number,
): TrackLessonSource & Record<string, unknown> {
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: aula.slug,
    title: aula.titulo,
    summary:
      `Aula em ESQUELETO: nasceu da quebra de ${plano.ref} (SPLIT_LESSON, npm run engine -- convergir). ` +
      'Teoria, quiz e desafio a autorar — a ficha normativa está no campo `autoria`.',
    difficulty: Math.min(5, Math.max(1, dificuldadeDaAncora)),
    role: 'regular',
    concepts: [],
    prerequisites: [...aula.prerequisites],
    theory: [
      {
        id: 'esqueleto-da-quebra',
        title: 'Aula em autoria (quebra de passo)',
        markdown:
          `Esta aula está em ESQUELETO. Ela nasceu porque a aula \`${plano.ref}\` dava um passo grande demais ` +
          `(A17/A18/A21 em \`npm run engine -- barra\`) e o planejador da quebra a dividiu sem partir nenhum ` +
          `grupo de co-ocorrência.\n\nO que ESTA aula tem de ensinar: ${aula.chaves.join(', ')}.\n\n` +
          'A ficha normativa (ensina, presume, quiz, desafio) está no campo `autoria` deste `lesson.json`. ' +
          'Enquanto ela não for autorada, `npm run engine -- barra` reprova esta aula por A20 (aula sem prova) — ' +
          'e isso é correto: aula sem desafio é aula sem prova.',
      },
    ],
    sources: [],
    challenges: [],
    autoria: aula.autoria,
    /** de onde esta aula veio — o laço deixa rastro no produto. */
    origem: {
      subfluxo: 'convergencia-quebra-v1',
      acao: 'SPLIT_LESSON',
      deAula: plano.ref,
      chaves: [...aula.chaves],
      grupos: aula.grupos.map((g) => [...g.chaves]),
      gruposProdutivos: aula.gruposProdutivos,
    },
  };
}

/** O `module.json` com as aulas novas nas posições certas. PURA. */
export function moduleJsonComAulasDaQuebra(
  meta: TrackModuleSource,
  novas: readonly AulaDaQuebra[],
): TrackModuleSource {
  const lessons = [...meta.lessons];
  for (const aula of novas) {
    if (lessons.includes(aula.slug)) continue;
    const ancora = aula.inserirAntesDe.split('/')[1] ?? '';
    const i = lessons.indexOf(ancora);
    if (i < 0) lessons.push(aula.slug);
    else lessons.splice(i, 0, aula.slug);
  }
  return { ...meta, lessons };
}

function serializar(objeto: unknown): string {
  return `${JSON.stringify(objeto, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// 9. O LAÇO
// ---------------------------------------------------------------------------

/** O exit code que o comando de um gate daria — a MESMA regra do CLI. */
function exitDoGate(temErro: boolean): number {
  return temErro ? 1 : 0;
}

interface MedicaoEmMemoria {
  audit: AuditReport;
  barra: RelatorioDaBarra;
  vetor: VetorDeEstado;
  medicoes: MedicaoDeGate[];
}

/** MEDE a trilha: os dois gates em memória, sem subprocesso. */
function medir(track: LoadedTrack, slug: string, opcoes: DeriveOptions): MedicaoEmMemoria {
  const audit = auditTrack(track, opcoes);
  const barra = auditarBarra(track, opcoes.mode !== undefined ? { modo: opcoes.mode } : {});
  const vetor = medirVetor(audit, barra);
  const sufixo = opcoes.mode !== undefined ? ` --modo ${opcoes.mode}` : '';
  return {
    audit,
    barra,
    vetor,
    medicoes: [
      {
        comando: `npm run engine -- audit ${slug} --limite 0${sufixo}`,
        exit: exitDoGate(audit.totals.violacoes > 0),
        placar: `${audit.totals.aulas} aulas · ${audit.totals.violacoes} violacoes · ${audit.totals.lacunasDeCurriculo} lacunas`,
      },
      {
        comando: `npm run engine -- barra ${slug}${sufixo}`,
        exit: exitDoGate(barra.totais.erros > 0),
        placar: `${barra.totais.aulas} aulas · ${barra.totais.erros} erros · ${barra.totais.avisos} avisos · ${barra.totais.aulasComErro} aulas com erro`,
      },
    ],
  };
}

/** As aulas com achado de QUEBRA, na ordem pedagógica. */
function refsComQuebra(achados: readonly AchadoClassificado[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const a of achados) {
    if (a.ramo !== 'QUEBRA' || a.severidade !== 'erro') continue;
    if (vistos.has(a.ref)) continue;
    vistos.add(a.ref);
    saida.push(a.ref);
  }
  return saida;
}

/** Monta a entrada do planejador da quebra para UMA aula. */
function entradaDaQuebraDe(
  track: LoadedTrack,
  ref: string,
  barra: RelatorioDaBarra,
  orcamentos: ReadonlyMap<string, LessonBudget>,
): EntradaDaQuebra {
  const [moduloSlug, aulaSlug] = ref.split('/');
  const mod = track.modules.find((m) => m.meta.slug === moduloSlug);
  if (mod === undefined) {
    throw new ErroDeConvergencia(
      'CONVERGENCIA_MODULO_NAO_ENCONTRADO',
      'planejar-quebra',
      `o módulo "${moduloSlug}" de ${ref} não existe na trilha carregada (fail-closed).`,
    );
  }
  const aula = mod.lessons.find((l) => l.meta.slug === aulaSlug);
  const metrica = barra.metricas.find((m) => m.ref === ref);
  const orcamento = orcamentos.get(ref);
  if (aula === undefined || metrica === undefined || orcamento === undefined) {
    throw new ErroDeConvergencia(
      'CONVERGENCIA_AULA_NAO_ENCONTRADA',
      'planejar-quebra',
      `a aula ${ref} tem achado de QUEBRA mas falta ${aula === undefined ? 'o lesson.json' : metrica === undefined ? 'a métrica da barra' : 'o orçamento'} (fail-closed).`,
    );
  }
  return {
    meta: aula.meta,
    moduloSlug,
    moduloTitulo: mod.meta.title,
    lessonsDoModulo: [...mod.meta.lessons],
    metrica,
    orcamento,
    adapterId: barra.adapterId,
    primeiraDaTrilha: metrica.index === 0,
  };
}

/** Planeja as ações da iteração — catálogo FECHADO, ordenado por ramo. */
export function planejarAcoes(
  achados: readonly AchadoClassificado[],
  planosDeQuebra: readonly PlanoDeQuebra[],
): AcaoPlanejada[] {
  const acoes: AcaoPlanejada[] = [];
  const porRef = new Map<string, PlanoDeQuebra>();
  for (const p of planosDeQuebra) porRef.set(p.ref, p);

  // A ordem é a do §6.1: o que é MECÂNICO primeiro (ORDEM), o que exige autoria
  // depois — quem lê o plano vê primeiro o que o comando resolve sozinho.
  const ordemDosRamos: readonly RamoDeConvergencia[] = [
    'ORDEM',
    'QUEBRA',
    'CADEIA',
    'LACUNA',
    'DEMONSTRACAO',
    'PROVA',
  ];
  const quebrasJaPlanejadas = new Set<string>();

  for (const ramo of ordemDosRamos) {
    for (const achado of achados) {
      if (achado.ramo !== ramo || achado.severidade !== 'erro') continue;
      if (ramo === 'QUEBRA') {
        if (quebrasJaPlanejadas.has(achado.ref)) continue;
        quebrasJaPlanejadas.add(achado.ref);
        const plano = porRef.get(achado.ref);
        const novas = plano?.aulasNovas.filter((a) => !a.jaExiste) ?? [];
        acoes.push({
          acao: 'SPLIT_LESSON',
          ramo,
          ref: achado.ref,
          arquivo: `modules/${achado.ref.split('/')[0]}/${MODULE_FILE}`,
          alvo: `array \`lessons\` + ${novas.length} diretório(s) de aula nova`,
          resultadoEsperado:
            novas.length === 0
              ? 'NADA a criar: os grupos couberam em um pacote só (ou as aulas novas já existem no module.json). ' +
                'O que resta é declarar `introduces.derived` para o grupo que estoura o teto de chaves.'
              : `${novas.length} aula(s) nova(s) de ESQUELETO antes de ${achado.ref}: ${novas.map((a) => a.slug).join(', ')}. ` +
                `A aula original perde ${plano?.chavesQuePerde.length ?? 0} chave(s) e fica com ${plano?.chavesQueFicam.length ?? 0}.`,
          aplicavel: novas.length > 0,
          motivoNaoAplicavel:
            novas.length > 0
              ? null
              : 'sem aula nova a criar — a ação que resta é `introduces.derived` (declaração de orçamento).',
        });
        for (const derivada of plano?.derivadasAPropor ?? []) {
          acoes.push({
            acao: 'REWRITE_IN_BUDGET',
            ramo,
            ref: derivada.aula,
            arquivo: `modules/${derivada.aula.split('/')[0]}/lessons/${derivada.aula.split('/')[1]}/${LESSON_FILE}`,
            alvo: 'introduces.derived',
            resultadoEsperado:
              `declarar ${derivada.derived.length} derivada(s) do grupo [${derivada.grupo.join(', ')}] com pai ` +
              `${derivada.derived[0]?.de ?? '-'}: A23 colapsa o grupo em 1 item e A21 passa a contar ` +
              `1 no lugar de ${derivada.grupo.length}.`,
            aplicavel: false,
            motivoNaoAplicavel: MOTIVO_ORCAMENTO,
          });
        }
        continue;
      }
      acoes.push({
        acao: achado.acao,
        ramo,
        ref: achado.ref,
        arquivo: achado.arquivo,
        alvo: achado.chave ?? achado.regra,
        resultadoEsperado: achado.mensagem,
        aplicavel: ramo === 'ORDEM',
        motivoNaoAplicavel:
          ramo === 'ORDEM'
            ? null
            : ramo === 'CADEIA' || ramo === 'LACUNA'
              ? MOTIVO_ORCAMENTO
              : MOTIVO_AUTORIA,
      });
    }
  }
  return acoes;
}

/**
 * O LAÇO DE CONVERGÊNCIA.
 *
 * `dry-run` (default) roda UMA iteração: mede, classifica, planeja, escreve o
 * ledger e para. A razão é aritmética, não preguiça — sem aplicar nada o vetor
 * não muda, e a segunda iteração seria idêntica POR CONSTRUÇÃO; chamar isso de
 * CICLO seria reportar defeito onde há só o modo. O veredito do dry-run é
 * `DRY-RUN` (ou `PONTO-FIXO`, quando não sobrou achado nenhum).
 *
 * `aplicar` roda SEM TETO por default (`--max-iteracoes` é opcional, para
 * script) e para pela cascata do cabeçalho. Exit 0 SÓ em PONTO-FIXO.
 */
export async function convergirTrilha(
  deps: DepsDaConvergencia,
  entrada: EntradaDaConvergencia,
): Promise<ResultadoDeConvergencia> {
  if (entrada.maxIteracoes !== undefined && (!Number.isInteger(entrada.maxIteracoes) || entrada.maxIteracoes < 1)) {
    throw new ErroDeConvergencia(
      'CONVERGENCIA_MAX_ITERACOES_INVALIDO',
      'entrada',
      `--max-iteracoes inválido: ${entrada.maxIteracoes} (esperado inteiro ≥ 1; AUSENTE = sem teto, que é o pedido do dono).`,
    );
  }

  const opcoes: DeriveOptions = entrada.opcoesDeAudit ?? {};
  const lerCadeia = deps.lerCadeia ?? (async () => ({ mapa: new Map<AtomKey, string>(), declaracao:
    'RAMO CADEIA VAZIO: nenhum leitor de cadeia injetado — todo não-ensinado cai em LACUNA (§5.5).' }));
  const commit = deps.lerCommit ? await deps.lerCommit() : null;
  const ambiente = deps.lerAmbiente ? await deps.lerAmbiente() : {};

  let track = await deps.carregarTrilha(entrada.slug);
  const cadeia = await lerCadeia(track);

  const declaracoes: string[] = [
    'ZERO LLM, ZERO REDE, ZERO CHAVE DE API: tudo aqui é aritmética sobre conjuntos de átomos e contagem de seções (P1 do §2).',
    cadeia.declaracao,
    `MEDIDA DE TERMINAÇÃO μ = ${COMPONENTES_DE_MU.join(' + ')} — inteiro não-negativo. O laço para por PONTO-FIXO, CICLO, SEM-PROGRESSO ou TETO; NUNCA por cansaço (§6.6).`,
    'CONTAGEM DUPLA DESCONTADA: o `audit.ts` mescla os achados da barra em `violations`; A17-A23 são lidos de UMA fonte só (`auditarBarra`) e descontados do audit — o placar do comando `audit` continua mostrando o total mesclado, que é o número reproduzível dele.',
    'O `introduces` de aula EXISTENTE nunca é reescrito: mover a declaração sem mover a demonstração criaria A19 e μ subiria. O que a aula original tem de PERDER sai no plano e não é aplicado.',
    `o LEDGER é escrito nos DOIS modos (uma linha JSON por iteração) — é a única escrita do dry-run, e ela é de REGISTRO, não de conteúdo.`,
  ];

  const iteracoes: IteracaoDaConvergencia[] = [];
  const escritos: string[] = [];
  const hashesVistos = new Set<string>();
  let vetorAnterior: VetorDeEstado | null = null;
  let veredito: Veredito = 'DRY-RUN';
  let achadosRemanescentes: readonly AchadoClassificado[] = [];
  let foraDosRamos: readonly AchadoForaDosRamos[] = [];

  for (let n = 1; ; n += 1) {
    const medida = medir(track, entrada.slug, opcoes);
    const classificacao = classificarAchados({
      audit: medida.audit,
      barra: medida.barra,
      ensinadoAntesNaCadeia: cadeia.mapa,
    });
    achadosRemanescentes = classificacao.achados;
    foraDosRamos = classificacao.foraDosRamos;

    const orcamento = deriveTrackBudget(track, opcoes);
    const porRef = new Map<string, LessonBudget>(orcamento.lessons.map((l) => [l.ref, l]));
    const planosDeQuebra = refsComQuebra(classificacao.achados).map((ref) =>
      planejarQuebra(entradaDaQuebraDe(track, ref, medida.barra, porRef)),
    );
    const acoesPlanejadas = planejarAcoes(classificacao.achados, planosDeQuebra);

    // ── APLICAR — só o que é DETERMINÍSTICO ────────────────────────────────
    const acoesAplicadas: AcaoAplicada[] = [];
    if (entrada.modo === 'aplicar') {
      // (i) ORDEM: pelo caminho que o `reorder.ts` já PROVA.
      //
      // O relatório vai FILTRADO (`errosDoAudit`): desde que o `audit.ts`
      // mescla a barra em `violations`, um achado A19 da barra chega com
      // `primeiraAulaQueEnsina` = a PRÓPRIA aula (o piso que `violacaoDaBarra`
      // aplica) e o `planejarReordenacao` o leria como violação de ORDEM —
      // tentando MOVER a aula para antes de si mesma. Passar o relatório cru
      // aqui seria pedir movimento para um defeito de DEMONSTRAÇÃO.
      // `verificarReordenacao` continua auditando a trilha INTEIRA (barra
      // incluída), que é o que faz o critério diferencial "não piora nada"
      // valer também para A17–A23.
      const auditParaOrdem: AuditReport = { ...medida.audit, violations: errosDoAudit(medida.audit) };
      const planoDeOrdem = planejarReordenacao(track, auditParaOrdem);
      if (planoDeOrdem.movimentos.length > 0) {
        const veredicto = verificarReordenacao(track, planoDeOrdem, opcoes);
        if (veredicto.ok) {
          const aplicacao = aplicarMovimentos(track, planoDeOrdem.movimentos);
          for (const [arquivo, conteudo] of aplicacao.arquivos) {
            await deps.gravarArquivo(arquivo, conteudo);
            escritos.push(arquivo);
          }
          acoesAplicadas.push({
            acao: 'REWRITE_IN_BUDGET',
            ramo: 'ORDEM',
            ref: planoDeOrdem.alvos.map((a) => a.ref).join(', '),
            arquivos: [...aplicacao.arquivos.keys()],
          });
        }
      }

      // (ii) QUEBRA: os ESQUELETOS + o array `lessons` do module.json.
      for (const plano of planosDeQuebra) {
        const novas = plano.aulasNovas.filter((a) => !a.jaExiste);
        if (novas.length === 0) continue;
        const [moduloSlug, aulaSlug] = plano.ref.split('/');
        const mod = track.modules.find((m) => m.meta.slug === moduloSlug);
        if (mod === undefined) continue;
        const ancora = mod.lessons.find((l) => l.meta.slug === aulaSlug);
        const dificuldade = ancora?.meta.difficulty ?? 1;
        const arquivos: string[] = [];
        for (const aula of novas) {
          const caminho = `modules/${aula.moduloSlug}/lessons/${aula.slug}/${LESSON_FILE}`;
          await deps.gravarArquivo(caminho, serializar(lessonJsonDaQuebra(aula, plano, dificuldade)));
          arquivos.push(caminho);
          escritos.push(caminho);
        }
        const metaNovo = moduleJsonComAulasDaQuebra(mod.meta, novas);
        const caminhoDoModulo = `modules/${moduloSlug}/${MODULE_FILE}`;
        await deps.gravarArquivo(caminhoDoModulo, serializar(metaNovo));
        arquivos.push(caminhoDoModulo);
        escritos.push(caminhoDoModulo);
        acoesAplicadas.push({ acao: 'SPLIT_LESSON', ramo: 'QUEBRA', ref: plano.ref, arquivos });
      }
    }

    const hash = hashDoVetor(medida.vetor);
    const iteracao: IteracaoDaConvergencia = {
      iteracao: n,
      commit,
      ambiente,
      medicoes: medida.medicoes,
      limitacoesDeclaradas: medida.audit.limitacoes.map((l) => l.id),
      vetor: medida.vetor,
      mu: muDoVetor(medida.vetor),
      achadosPorRamo: classificacao.porRamo,
      achadosForaDosRamos: classificacao.foraDosRamos.length,
      acoesPlanejadas,
      acoesAplicadas,
      planosDeQuebra,
      hashDoVetor: hash,
      veredito: null,
    };

    // ── A CASCATA DE PARADA, na ordem em que dispara ───────────────────────
    const aplicouAlgo = acoesAplicadas.length > 0;
    const semAchado =
      classificacao.achados.every((a) => a.severidade === 'aviso') && classificacao.foraDosRamos.length === 0;

    let parou: Veredito | null = null;
    if (semAchado && !aplicouAlgo) parou = 'PONTO-FIXO';
    else if (hashesVistos.has(hash)) parou = 'CICLO';
    else if (vetorAnterior !== null && !algumaComponenteDesceu(vetorAnterior, medida.vetor) && !aplicouAlgo) {
      parou = 'SEM-PROGRESSO';
    } else if (entrada.modo === 'dry-run') parou = 'DRY-RUN';
    else if (entrada.maxIteracoes !== undefined && n >= entrada.maxIteracoes) parou = 'TETO';

    hashesVistos.add(hash);
    vetorAnterior = medida.vetor;
    const fechada: IteracaoDaConvergencia = { ...iteracao, veredito: parou };
    iteracoes.push(fechada);
    await deps.registrarNoLedger(JSON.stringify(fechada));

    if (parou !== null) {
      veredito = parou;
      break;
    }

    // Aplicou algo ⇒ o disco mudou ⇒ RECARREGA. Medir a próxima iteração sobre
    // a trilha EM MEMÓRIA deixaria o gate julgando um estado que não está no
    // disco — o modo de falha silencioso que esta engine existe para eliminar.
    if (aplicouAlgo) {
      try {
        track = await deps.carregarTrilha(entrada.slug);
      } catch (erro) {
        throw new ErroDeConvergencia(
          'CONVERGENCIA_RECARGA_FALHOU',
          'recarregar',
          `a trilha não recarrega depois da iteração ${n} (o que foi gravado não passa no loader): ` +
            `${erro instanceof Error ? erro.message : String(erro)}`,
        );
      }
    }
  }

  return {
    slug: entrada.slug,
    modo: entrada.modo,
    iteracoes,
    veredito,
    achadosRemanescentes,
    foraDosRamos,
    escritos,
    declaracoes,
  };
}
