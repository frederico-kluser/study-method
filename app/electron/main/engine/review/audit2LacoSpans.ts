/**
 * app/electron/main/engine/review/audit2LacoSpans.ts — as PRIMITIVAS DE
 * POSIÇÃO do 2º laço (`audit2Laco.ts`): offset linha/coluna, scanner dos
 * valores de string do JSON cru e mapeamento de span (decodificado → cru).
 * Extraídas do módulo original na refatoração do lote L05 sem NENHUMA mudança
 * de comportamento — a fachada `audit2Laco.ts` re-exporta os nomes públicos.
 */

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
    const par = texto[j] === ':' ? valorAposDoisPontos(texto, j, campo) : null;
    if (par !== null) saida.push(par);
    i = fimChave;
  }
  return saida;
}

/** O valor de string logo após o `:` da chave — null quando não é par `"…"`. */
function valorAposDoisPontos(texto: string, j: number, campo: string): ValorDeStringNoJson | null {
  let k = j + 1;
  while (k < texto.length && BRANCOS.has(texto[k])) k += 1;
  if (texto[k] !== '"') return null;
  const fimValor = fimDaString(texto, k);
  if (!(fimValor > 0)) return null;
  const inicio = k + 1;
  const fim = fimValor - 1;
  const cru = texto.slice(inicio, fim);
  try {
    return { campo, inicio, fim, cru, decodificado: JSON.parse(`"${cru}"`) };
  } catch {
    // string malformada dentro de JSON válido não existe — defensivo.
    return null;
  }
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
export function spanNoValor(conteudo: string, valor: ValorDeStringNoJson, achadoDecodificado: number, comprimento: number): SpanNoArquivo {
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

