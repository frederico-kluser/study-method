/**
 * app/electron/main/engine/review/audit2Laco.ts — a PONTE audit→laço (P-35,
 * replan onda 3 do plano de execução v1) — "habilita o P-23".
 *
 * PROBLEMA REAL: o laço F11 (P-18, `review/loop.ts`) recebe
 * `verificadorDeOrcamento` injetado; o default (`criarVerificadorDeOrcamento`
 * × `extractAtoms` sobre o conteúdo do artefato) está quebrado para trilha
 * REAL — o artefato do laço é o JSON INTEIRO do desafio/aula
 * (`challenge.json`/`lesson.json`), e `extractAtoms` sobre o JSON inteiro não
 * acha as construções dos campos `solutionCode`/`starterCode`/`testsCode`/
 * teoria (o JSON não parseia como JavaScript). O audit (`engine/audit.ts`,
 * `auditTrack`) já LOCALIZOU cada violação com arquivo, campo, linha, coluna,
 * construção e trecho ofensor. Este módulo é a ponte que converte o
 * `AuditReport` no que o laço come, com spans no ARQUIVO JSON INTEIRO (é
 * nesse conteúdo que o corretor do laço edita, gate `validarDiffNoSpan`).
 *
 * API PÚBLICA:
 *
 *   1. `auditEmViolacoesMecanicas(report, arquivosConteudo)` — cada violação
 *      do audit vira uma `ViolacaoMecanica` do laço (tipo `'orcamento'`). O
 *      span [inicio, fim] é medido no conteúdo CRU do arquivo: offset base do
 *      arquivo + linha/coluna do campo, usando a busca do `trechoOfensor` no
 *      conteúdo DECODIFICADO do campo quando possível (mapeada de volta ao
 *      arquivo cru com consciência das escapes `\n`, `\"`, `\\`, `\uXXXX`),
 *      senão busca verbatim no arquivo, senão offset calculado por
 *      linha/coluna (fallback documentado — estruturais sintéticos).
 *
 *   2. `snapshotDeOrcamentoDoAudit(report)` — o `SnapshotDeOrcamento` do
 *      laço com o "primeiroEnsina" por construção (índice reverso construção
 *      → aula que a ensina) e a geografia das superfícies auditadas. ATENÇÃO
 *      DELIBERADA: `permitidos` das superfícies sai VAZIO — este snapshot NÃO
 *      deve alimentar o verificador default por AST do laço (`permitidos`
 *      vazio = "nada é permitido"); o propósito dele é o índice §5.5 e o
 *      mapa de superfícies. Quem re-verifica conteúdo é o verificador da
 *      trilha (item 3).
 *
 *   3. `criarVerificadorDeOrcamentoDaTrilha(report)` — o verificador
 *      INJETÁVEL em `ContextoDoLaco.verificadorDeOrcamento` (assinatura EXATA
 *      do laço: recebe o mapa vivo de artefatos, devolve `ViolacaoMecanica[]`).
 *      Ele re-verifica AO VIVO as construções que o audit sinalizou para cada
 *      superfície do JSON (`solutionCode`/`starterCode`/`testsCode`/`theory`),
 *      via `extractAtoms` sobre o valor decodificado do campo, com spans no
 *      arquivo inteiro. É um re-checador do veredito CONGELADO do audit
 *      (denylist por superfície), não um orçamento completo: construções que
 *      o audit não flagrou não entram por esta porta — quem tem o orçamento
 *      completo é o `auditTrack`; o laço recebe o veredito + re-verificação
 *      viva (correção que tira o átomo do arquivo verdeia o verificador).
 *
 *   4. `pinsDasViolacoesDoAudit(report, arquivosConteudo)` — os pins SEMEADOS
 *      (contrato com o P-23): `criarSessaoDeRevisao(ctx)` →
 *      `sessao.pins.adicionarPin(pin)` para cada pin devolvido. Pin de AST com
 *      trecho = o slice CRU do span (o conteúdo do artefato é o JSON cru —
 *      `pinAst` depende de `includes`/AST contra ELE). Só violações com
 *      construção (orçamento por AST) viram pin — "a ofensa desaparece";
 *      estruturais (I12/I14/I15/I16/I17/A6, construção null) NÃO têm essa
 *      semântica e ficam de fora (o P-23 as trata pelos apontamentos
 *      mecânicos de `auditEmViolacoesMecanicas`).
 *
 * CONTRATO EXATO COM O LAÇO (`review/loop.ts`):
 *   - `ViolacaoMecanica.tipo === 'orcamento'` (o audit é orçamento por AST);
 *   - `caminho` = `Violation.arquivo` = o caminho do artefato no laço
 *     (`modules/<m>/lessons/<a>/challenges/<c>/challenge.json` etc., relativo
 *     à raiz da trilha);
 *   - span [inicio, fim] meio-aberto sobre o conteúdo CRU, como no verificador
 *     default do laço (`criarVerificadorDeOrcamento`);
 *   - `primeiraAulaQueEnsina` PRESERVADO — null = LACUNA DE CURRÍCULO (§5.5),
 *     não-null = violação de ORDEM; é o campo que o §6.7 usa para escolher
 *     entre "criar a aula que falta" e "reescrever/reordenar";
 *   - `mensagem` e `construcao` preservados da violação do audit.
 *
 * FAIL-CLOSED (item d do P-35): JSON quebrado no caminho citado → erro
 * ESTRUTURADO nomeando o arquivo (`ErroEstruturadoDoAudit2Laco`, subclasse de
 * `ErroEstruturadoDoLaco` — atravessa o `chamarSeguro` do laço sem
 * re-embrulho), nunca silêncio e nunca aprovação por omissão. Arquivo citado
 * pelo audit mas ausente do mapa de conteúdos idem.
 *
 * LIMITES DECLARADOS:
 *   - o span usa o trecho ofensor TRIMMED do audit; trecho com indentação
 *     interna (markdown indentado) cai para o fallback de linha/coluna;
 *   - chaves duplicadas num JSON válido (duas `"solutionCode"` no MESMO nível)
 *     — o JSON.parse vê a última, o mapeador pontua o candidato por distância;
 *   - empate de candidatos (mesmo código em dois arquivos de `files[]`) →
 *     primeiro na ordem de aparição.
 *
 * PURO/DI: recebe `AuditReport` e os conteúdos por caminho; não abre arquivo,
 * não vai à rede, não chama LLM. Roda sem chave de API — os testes usam
 * fixtures em memória.
 */

import type { AuditReport } from '../audit';
import { extractAtoms } from '../extract';
import type { Apontamento } from './actionCatalog';
import { REPRODUZIVEL_MECANICO_PREFIX } from './filter';
import { ErroEstruturadoDoLaco } from './loop';
import type {
  ArtefatoNoLaco,
  SnapshotDeOrcamento,
  SurfaceDeOrcamento,
  VerificadorDeOrcamento,
  ViolacaoMecanica,
} from './loop';
import type { PinDeRegressao } from './prover';

// ---------------------------------------------------------------------------
// Erro estruturado da ponte (fail-closed — nunca silêncio)
// ---------------------------------------------------------------------------

/** Código do erro estruturado: JSON quebrado no arquivo citado. */
export const CODIGO_JSON_QUEBRADO = 'AUDIT2LACO_JSON_QUEBRADO';

/** Código do erro estruturado: arquivo citado pelo audit ausente do mapa. */
export const CODIGO_ARQUIVO_AUSENTE = 'AUDIT2LACO_ARQUIVO_AUSENTE';

export interface ErroEstruturadoDoAudit2LacoOptions {
  codigo: string;
  /** o caminho do arquivo que falhou — NUNCA omitido (fail-closed nomeia). */
  arquivo: string;
  mensagem: string;
  causa?: unknown;
}

/**
 * O erro estruturado da ponte. Herda de `ErroEstruturadoDoLaco` de propósito:
 * o laço F11 (`chamarSeguro`) re-embrulha erro não-estruturado em
 * `LACO_ETAPA_FALHOU`; erros desta classe atravessam com código/etapa
 * próprios (`etapa: 'audit2laco'`) e o `arquivo` nomeado.
 */
export class ErroEstruturadoDoAudit2Laco extends ErroEstruturadoDoLaco {
  readonly arquivo: string;

  constructor(opts: ErroEstruturadoDoAudit2LacoOptions) {
    super({ codigo: opts.codigo, etapa: 'audit2laco', mensagem: opts.mensagem, causa: opts.causa });
    this.name = 'ErroEstruturadoDoAudit2Laco';
    this.arquivo = opts.arquivo;
  }
}

/** Valida o JSON do arquivo citado — quebrado vira erro estruturado (item d). */
function validarJsonIntegro(conteudo: string, arquivo: string): void {
  try {
    JSON.parse(conteudo);
  } catch (erro) {
    throw new ErroEstruturadoDoAudit2Laco({
      codigo: CODIGO_JSON_QUEBRADO,
      arquivo,
      mensagem:
        `JSON quebrado em "${arquivo}": ${erro instanceof Error ? erro.message : String(erro)}` +
        ' — fail-closed: o laço nunca revisa um arquivo que não parseia',
      causa: erro,
    });
  }
}

// ---------------------------------------------------------------------------
// Primitivos de posição (puros, exportados — testáveis isoladamente)
// ---------------------------------------------------------------------------

/**
 * Offset 0-based de (linha, coluna) 1-based num texto — a posição que o
 * `extractAtoms` reporta (linha 1, coluna 1 = início do texto).
 */
export function offsetNaLinhaColuna(texto: string, linha: number, coluna: number): number {
  const linhaSegura = Math.max(1, Math.floor(linha));
  const colunaSegura = Math.max(1, Math.floor(coluna));
  if (linhaSegura === 1) return Math.min(colunaSegura - 1, texto.length);
  let atual = 0;
  let atualLinha = 1;
  while (atualLinha < linhaSegura && atual < texto.length) {
    const quebra = texto.indexOf('\n', atual);
    if (quebra < 0) {
      atual = texto.length;
      break;
    }
    atual = quebra + 1;
    atualLinha += 1;
  }
  return Math.min(atual + colunaSegura - 1, texto.length);
}

/** Um valor de string `"campo": "valor"` dentro de um JSON (todos os níveis). */
export interface ValorDeStringNoJson {
  /** a chave do par (`solutionCode`, `starterCode`, `markdown`, `slug`…). */
  campo: string;
  /** offset do 1º caractere do VALOR no arquivo cru (logo após a aspa de abertura). */
  inicio: number;
  /** offset logo após o último caractere do valor (antes da aspa de fecho). */
  fim: number;
  /** o texto CRU entre as aspas (com as escapes — para mapear offsets). */
  cru: string;
  /** o valor DECODIFICADO (o que o `JSON.parse` vê — o que o audit analisou). */
  decodificado: string;
}

/** Índice APÓS a aspa de fecho de uma string que abre em `abertura` (-1 = malformada). */
function fimDaString(texto: string, abertura: number): number {
  let i = abertura + 1;
  while (i < texto.length) {
    const ch = texto[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') return i + 1;
    i += 1;
  }
  return -1;
}

const BRANCOS: ReadonlySet<string> = new Set([' ', '\t', '\n', '\r']);

/**
 * Varre o JSON cru e devolve TODOS os pares `"chave": "valor-de-string"`
 * (em qualquer nível: topo, `files[]`, `theory[]`…). O scanner pula strings
 * inteiras (via `fimDaString`), então aspas dentro de valores nunca confundem
 * a leitura. Pressupõe JSON íntegro — os chamadores validam antes (fail-closed).
 */
export function localizarValoresDeStringNoJson(texto: string): ValorDeStringNoJson[] {
  const saida: ValorDeStringNoJson[] = [];
  let i = 0;
  while (i < texto.length) {
    const abertura = texto.indexOf('"', i);
    if (abertura < 0) break;
    const fimChave = fimDaString(texto, abertura);
    if (fimChave < 0) break; // malformado — quem chamou validou o JSON antes
    const campo = texto.slice(abertura + 1, fimChave - 1);
    let j = fimChave;
    while (j < texto.length && BRANCOS.has(texto[j])) j += 1;
    if (texto[j] === ':') {
      let k = j + 1;
      while (k < texto.length && BRANCOS.has(texto[k])) k += 1;
      if (texto[k] === '"') {
        const fimValor = fimDaString(texto, k);
        if (fimValor > 0) {
          const inicio = k + 1;
          const fim = fimValor - 1;
          const cru = texto.slice(inicio, fim);
          try {
            saida.push({ campo, inicio, fim, cru, decodificado: JSON.parse(`"${cru}"`) });
          } catch {
            // string malformada dentro de JSON válido não existe — defensivo.
          }
        }
      }
    }
    i = fimChave;
  }
  return saida;
}

/**
 * Mapeia um offset DECODIFICADO de volta ao offset CRU do valor: caminha o
 * texto cru somando o tamanho REAL de cada escape (`\n` = 2 cru→1 dec,
 * `\uXXXX` = 6 cru→1 dec, `\"` = 2 cru→1 dec…). Devolve null quando o offset
 * cai depois do fim do valor.
 */
function offsetBrutoDoDecodificado(cru: string, offsetDecodificado: number): number | null {
  if (offsetDecodificado <= 0) return 0;
  let dec = 0;
  let i = 0;
  while (i < cru.length) {
    if (dec >= offsetDecodificado) return i;
    if (cru[i] === '\\') {
      if (cru[i + 1] === 'u') i += 6;
      else i += 2;
      dec += 1;
    } else {
      i += 1;
      dec += 1;
    }
  }
  return dec >= offsetDecodificado ? i : null;
}

/** Span [inicio, fim] meio-aberto no arquivo CRU. */
export interface SpanNoArquivo {
  inicio: number;
  fim: number;
}

/**
 * Span no arquivo inteiro de um trecho DENTRO do valor de um campo: mapeia o
 * offset decodificado de volta ao cru e garante um intervalo válido
 * (inicio < fim ≤ comprimento; nunca vazio).
 */
function spanNoValor(conteudo: string, valor: ValorDeStringNoJson, achadoDecodificado: number, comprimento: number): SpanNoArquivo {
  const inicioDec = Math.max(0, Math.min(achadoDecodificado, valor.decodificado.length));
  const fimDec = Math.max(inicioDec, Math.min(achadoDecodificado + Math.max(comprimento, 1), valor.decodificado.length));
  const brutoInicio = offsetBrutoDoDecodificado(valor.cru, inicioDec) ?? valor.cru.length;
  const brutoFim = offsetBrutoDoDecodificado(valor.cru, fimDec) ?? valor.cru.length;
  const inicio = Math.min(valor.inicio + brutoInicio, Math.max(0, conteudo.length - 1));
  const brutoFimLimitado = Math.min(valor.inicio + brutoFim, conteudo.length);
  const fim = brutoFimLimitado <= inicio ? Math.min(inicio + 1, conteudo.length) : brutoFimLimitado;
  return { inicio, fim };
}

/** Candidato cujo valor decodificado CONTÉM o trecho, pontuado por distância. */
interface CandidatoEncontrado {
  valor: ValorDeStringNoJson;
  esperado: number;
  achado: number;
}

/**
 * Melhor candidato: o `ValorDeStringNoJson` cujo decodificado contém o trecho
 * NA posição mais próxima da esperada (linha/coluna). Resolve com a MESMA
 * regra: campo único, `files[]` com N entradas e teoria (`markdown`/`code`).
 */
function melhorCandidato(
  candidatos: readonly ValorDeStringNoJson[],
  trecho: string,
  linha: number,
  coluna: number,
): CandidatoEncontrado | null {
  let melhor: CandidatoEncontrado | null = null;
  let melhorScore = Number.POSITIVE_INFINITY;
  for (const valor of candidatos) {
    const esperado = offsetNaLinhaColuna(valor.decodificado, linha, coluna);
    const achado = valor.decodificado.indexOf(trecho);
    if (achado < 0) continue;
    const score = Math.abs(achado - esperado);
    if (score < melhorScore) {
      melhorScore = score;
      melhor = { valor, esperado, achado };
    }
  }
  return melhor;
}

/** Fallback 3: offset calculado por linha/coluna NO ARQUIVO (espaço contíguo). */
function spanPorLinhaColuna(conteudo: string, linha: number, coluna: number, comprimento: number): SpanNoArquivo {
  const inicio = offsetNaLinhaColuna(conteudo, linha, coluna);
  const fim = Math.min(Math.max(inicio + Math.max(comprimento, 1), inicio + 1), conteudo.length);
  return { inicio, fim };
}

/**
 * O span de UMA violação no arquivo INTEIRO, em três estágios:
 *   1. busca no valor decodificado do CAMPO (ou de todos os campos quando o
 *      campo não é string — estruturais) — o preciso, mapeado de volta ao cru;
 *   2. busca verbatim do trecho no arquivo (campos não-string simples);
 *   3. offset calculado por linha/coluna no arquivo (fallback documentado).
 */
export function localizarSpanNoArquivo(
  conteudo: string,
  valores: readonly ValorDeStringNoJson[],
  argumentos: { campo: string; linha: number; coluna: number; trecho: string },
): SpanNoArquivo {
  const { campo, linha, coluna, trecho } = argumentos;
  if (trecho.length === 0) return spanPorLinhaColuna(conteudo, linha, coluna, 1);

  const doCampo = valores.filter((v) => v.campo === campo);
  const escopo = doCampo.length > 0 ? doCampo : valores;
  const melhor = melhorCandidato(escopo, trecho, linha, coluna);
  if (melhor !== null) {
    return spanNoValor(conteudo, melhor.valor, melhor.achado, trecho.length);
  }

  const idx = conteudo.indexOf(trecho);
  if (idx >= 0) return { inicio: idx, fim: idx + trecho.length };

  return spanPorLinhaColuna(conteudo, linha, coluna, trecho.length);
}

// ---------------------------------------------------------------------------
// 1. AuditReport → ViolacaoMecanica[]
// ---------------------------------------------------------------------------

/**
 * Converte cada violação do audit numa violação MECÂNICA do laço, com span no
 * ARQUIVO JSON INTEIRO. PURO — os conteúdos dos arquivos chegam por parâmetro
 * (fixtures em memória nos testes). Fail-closed: arquivo citado ausente ou
 * JSON quebrado → `ErroEstruturadoDoAudit2Laco` nomeando o arquivo.
 */
export function auditEmViolacoesMecanicas(
  report: AuditReport,
  arquivosConteudo: Readonly<Record<string, string>>,
): ViolacaoMecanica[] {
  const cachePorArquivo = new Map<string, ValorDeStringNoJson[]>();
  const violacoes: ViolacaoMecanica[] = [];
  for (const violacao of report.violations) {
    const conteudo = arquivosConteudo[violacao.arquivo];
    if (conteudo === undefined) {
      throw new ErroEstruturadoDoAudit2Laco({
        codigo: CODIGO_ARQUIVO_AUSENTE,
        arquivo: violacao.arquivo,
        mensagem:
          `o audit cita "${violacao.arquivo}" mas o mapa de conteúdos não o carrega` +
          ' — o laço não pode revisar um arquivo que não existe (fail-closed)',
      });
    }
    validarJsonIntegro(conteudo, violacao.arquivo);
    let valores = cachePorArquivo.get(violacao.arquivo);
    if (valores === undefined) {
      valores = localizarValoresDeStringNoJson(conteudo);
      cachePorArquivo.set(violacao.arquivo, valores);
    }
    const span = localizarSpanNoArquivo(conteudo, valores, {
      campo: violacao.campo,
      linha: violacao.linha,
      coluna: violacao.coluna,
      trecho: violacao.trechoOfensor,
    });
    violacoes.push({
      caminho: violacao.arquivo,
      surface: violacao.campo,
      construcao: violacao.construcao ?? '',
      tipo: 'orcamento',
      inicio: span.inicio,
      fim: span.fim,
      linha: Math.max(violacao.linha, 1),
      coluna: Math.max(violacao.coluna, 1),
      trechoOfensor: violacao.trechoOfensor,
      primeiraAulaQueEnsina: violacao.primeiraAulaQueEnsina,
      mensagem: violacao.mensagem,
    });
  }
  return violacoes;
}

// ---------------------------------------------------------------------------
// 2. AuditReport → SnapshotDeOrcamento (o primeiroEnsina por construção)
// ---------------------------------------------------------------------------

/** Superfícies de CÓDIGO que o audit analisa por AST (a assimetria do §3.3). */
const CAMPOS_DE_CODIGO: ReadonlySet<string> = new Set(['solutionCode', 'starterCode', 'testsCode', 'theory']);

/** A faixa implícita de uma superfície quando a violação não declara `faixa`. */
function faixaDaSuperficie(superficie: string): 'receptive' | 'productive' {
  return superficie === 'solutionCode' ? 'productive' : 'receptive';
}

/**
 * O snapshot de orçamento derivado do audit: o índice REVERSO construção →
 * aula que a ensina (a distinção §5.5 — construções só entram no índice se
 * tiverem aula dona; lacuna (`primeiraAulaQueEnsina === null`) fica de fora)
 * + a geografia das superfícies auditadas.
 *
 * ATENÇÃO DELIBERADA (ver cabeçalho): `permitidos` sai VAZIO — NÃO alimente
 * o verificador default do laço com este snapshot; o re-checador vivo é
 * `criarVerificadorDeOrcamentoDaTrilha`.
 */
export function snapshotDeOrcamentoDoAudit(report: AuditReport): SnapshotDeOrcamento {
  const primeiroEnsina: Record<string, string> = {};
  const porSuperficie = new Map<string, SurfaceDeOrcamento>();
  for (const violacao of report.violations) {
    if (violacao.construcao !== null && violacao.primeiraAulaQueEnsina !== null) {
      if (!(violacao.construcao in primeiroEnsina)) {
        primeiroEnsina[violacao.construcao] = violacao.primeiraAulaQueEnsina;
      }
    }
    if (CAMPOS_DE_CODIGO.has(violacao.campo)) {
      const chave = `${violacao.arquivo}\u0000${violacao.campo}`;
      if (!porSuperficie.has(chave)) {
        porSuperficie.set(chave, {
          superficie: violacao.campo,
          caminho: violacao.arquivo,
          faixa: violacao.faixa ?? faixaDaSuperficie(violacao.campo),
          permitidos: [],
        });
      }
    }
  }
  return {
    ref: report.trackSlug,
    surfaces: [...porSuperficie.values()],
    primeiroEnsina,
  };
}

// ---------------------------------------------------------------------------
// 3. O verificador INJETÁVEL no ContextoDoLaco (re-checagem viva por AST)
// ---------------------------------------------------------------------------

/** Uma superfície restrita: as construções que o audit sinalizou como fora do orçamento. */
interface RestricaoDaSuperficie {
  superficie: string;
  faixa: 'receptive' | 'productive';
  construcoes: Map<string, { primeiraAulaQueEnsina: string | null }>;
}

/** O "orçamento congelado" que a trilha re-verifica: denylist por (arquivo, superfície). */
interface OrcamentoDaTrilha {
  ref: string;
  porCaminho: Map<string, Map<string, RestricaoDaSuperficie>>;
}

/** Deriva do report a denylist por (arquivo, campo) — o que o audit FLAGROU. */
function derivarOrcamentoDoAudit(report: AuditReport): OrcamentoDaTrilha {
  const porCaminho = new Map<string, Map<string, RestricaoDaSuperficie>>();
  for (const violacao of report.violations) {
    if (violacao.construcao === null) continue;
    if (!CAMPOS_DE_CODIGO.has(violacao.campo)) continue;
    let porSuperficie = porCaminho.get(violacao.arquivo);
    if (porSuperficie === undefined) {
      porSuperficie = new Map();
      porCaminho.set(violacao.arquivo, porSuperficie);
    }
    let restricao = porSuperficie.get(violacao.campo);
    if (restricao === undefined) {
      restricao = {
        superficie: violacao.campo,
        faixa: violacao.faixa ?? faixaDaSuperficie(violacao.campo),
        construcoes: new Map(),
      };
      porSuperficie.set(violacao.campo, restricao);
    }
    if (!restricao.construcoes.has(violacao.construcao)) {
      restricao.construcoes.set(violacao.construcao, {
        primeiraAulaQueEnsina: violacao.primeiraAulaQueEnsina,
      });
    }
  }
  return { ref: report.trackSlug, porCaminho };
}

/**
 * O verificador de orçamento da TRILHA: injetável em
 * `ContextoDoLaco.verificadorDeOrcamento` (assinatura EXATA do laço).
 *
 * Para cada (arquivo, superfície) que o audit sinalizou: lê o artefato AO
 * VIVO do mapa do laço, decodifica cada valor do campo (todos — `files[]`
 * tem N entradas), roda `extractAtoms` sobre ele e marca as ocorrências cuja
 * construção está na denylist do audit, com span no arquivo inteiro. É o
 * complemento MECÂNICO dos pins semeados: se o corretor tirar o átomo do
 * arquivo, o verificador fica quieto (e o pin verdeia) — se a regressão
 * voltar, ele acusa de novo, e o laço regenera o canal de correção.
 *
 * Fail-closed: JSON quebrado num caminho auditado → `ErroEstruturadoDoAudit2Laco`
 * nomeando o arquivo (nunca silêncio). Parse de JS quebrado num campo, pelo
 * contrário, NÃO é violação (é erro de build do §5.3) — declarado, como no
 * verificador default do laço. Superfície ausente do mapa não acusa (gate de
 * presença é de F8).
 */
export function criarVerificadorDeOrcamentoDaTrilha(report: AuditReport): VerificadorDeOrcamento {
  const orcamento = derivarOrcamentoDoAudit(report);
  return (artefatos: ReadonlyMap<string, ArtefatoNoLaco>): ViolacaoMecanica[] => {
    const violacoes: ViolacaoMecanica[] = [];
    for (const [caminho, porSuperficie] of orcamento.porCaminho) {
      const artefato = artefatos.get(caminho);
      if (artefato === undefined) continue; // superfície ausente — não acusa (declarado)
      validarJsonIntegro(artefato.conteudo, caminho);
      const valores = localizarValoresDeStringNoJson(artefato.conteudo);
      for (const [superficie, restricao] of porSuperficie) {
        // TODOS os valores do campo (files[] tem N entradas) — o audit flagrou
        // cada entrada separadamente; extractAtoms já devolve a 1ª ocorrência
        // por construção DENTRO de cada valor, então não há dedupe a fazer.
        const valoresDoCampo = valores.filter((v) => v.campo === superficie);
        for (const valor of valoresDoCampo) {
          const resultado = extractAtoms(valor.decodificado, { fileName: `${caminho}#${superficie}` });
          if (!resultado.ok) continue; // JS quebrado é erro de build (§5.3), não violação
          for (const ocorrencia of resultado.occurrences) {
            if (!restricao.construcoes.has(ocorrencia.key)) continue; // não auditada — fora do escopo
            const esperado = offsetNaLinhaColuna(valor.decodificado, ocorrencia.line, ocorrencia.column);
            const achado = valor.decodificado.indexOf(ocorrencia.snippet);
            const inicioDec = achado >= 0 ? achado : esperado;
            const span = spanNoValor(artefato.conteudo, valor, inicioDec, ocorrencia.snippet.length);
            violacoes.push({
              caminho,
              surface: superficie,
              construcao: ocorrencia.key,
              tipo: 'orcamento',
              inicio: span.inicio,
              fim: span.fim,
              linha: ocorrencia.line,
              coluna: ocorrencia.column,
              trechoOfensor: ocorrencia.snippet,
              primeiraAulaQueEnsina: restricao.construcoes.get(ocorrencia.key)?.primeiraAulaQueEnsina ?? null,
              mensagem:
                `construção ${ocorrencia.key} fora do orçamento ${restricao.faixa} da superfície ${superficie}` +
                ` (ref ${orcamento.ref} — auditado em auditTrack; re-verificado pelo laço)`,
            });
          }
        }
      }
    }
    return violacoes;
  };
}

// ---------------------------------------------------------------------------
// 4. AuditReport → PinDeRegressao[] (SEMEADOS pelo P-23 via criarSessaoDeRevisao)
// ---------------------------------------------------------------------------

/**
 * Os pins SEMEADOS do audit para o P-23:
 *
 *   const sessao = criarSessaoDeRevisao(ctx);
 *   for (const pin of pinsDasViolacoesDoAudit(report, arquivosConteudo)) {
 *     sessao.pins.adicionarPin(pin);
 *   }
 *
 * Pin de AST com trecho = o slice CRU do span (`conteudo.slice(inicio, fim)`),
 * porque o artefato do laço É o JSON cru — `pinAst` decide contra ELE
 * (`includes`/AST); um trecho decodificado com escapes (\" ou \n) nunca
 * casaria e o pin ficaria vermelho para sempre. `criado_na_rodada: 0`
 * (semeado antes da rodada 1 — entra no score desde a 1ª rodada).
 *
 * Só violações com CONSTRUÇÃO viram pin (a semântica "a ofensa desaparece");
 * estruturais (construção null) ficam de fora — documentado no cabeçalho.
 */
export function pinsDasViolacoesDoAudit(
  report: AuditReport,
  arquivosConteudo: Readonly<Record<string, string>>,
): PinDeRegressao[] {
  const mecanicas = auditEmViolacoesMecanicas(report, arquivosConteudo);
  const pins: PinDeRegressao[] = [];
  let sequencia = 0;
  for (const violacao of mecanicas) {
    if (violacao.construcao === '') continue;
    sequencia += 1;
    const id = `AUD-${String(sequencia).padStart(4, '0')}`;
    const conteudo = arquivosConteudo[violacao.caminho];
    const trechoCru = conteudo.slice(violacao.inicio, violacao.fim).trim();
    const apontamento: Apontamento = {
      id,
      rodada: 0,
      artefato: violacao.surface,
      alvo: {
        caminho: violacao.caminho,
        linha: Math.max(violacao.linha, 1),
        span: [violacao.inicio, violacao.fim],
        no_ast: violacao.construcao,
        token: violacao.trechoOfensor,
      },
      evidencia: {
        tipo: 'orcamento',
        prova: violacao.mensagem,
        introduzido_em: violacao.primeiraAulaQueEnsina,
        reproduzivel_por: `${REPRODUZIVEL_MECANICO_PREFIX} gerado pelo auditTrack (audit2Laco): verificação determinística de orçamento por AST`,
      },
      defeito: violacao.mensagem,
      regra_violada: 'C1',
      // Mesma classificação do laço (categoriaDaViolacao): api: → api_nao_ensinada.
      categoria: violacao.construcao.startsWith('api:') ? 'api_nao_ensinada' : 'construcao_nao_ensinada',
      severity: 'bloqueante',
      acao_sugerida:
        violacao.primeiraAulaQueEnsina === null
          ? 'criar a aula que ensina a construção (lacuna de currículo — §5.5), nunca reescrever para caber no furo'
          : 'reescrever o artefato sem a construção ou mover a aula que a ensina para antes (violação de ordem — §5.5)',
      confianca: 1,
    };
    pins.push({
      id: `pin-${id}`,
      apontamento,
      descricao: `a construção ofensora de "${violacao.caminho}" desaparece (${violacao.mensagem})`,
      alvo: { caminho: violacao.caminho },
      criado_na_rodada: 0,
      afericao: { tipo: 'ast', trecho: trechoCru.length >= 3 ? trechoCru : violacao.trechoOfensor },
    });
  }
  return pins;
}