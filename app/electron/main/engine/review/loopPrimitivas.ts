/**
 * app/electron/main/engine/review/loopPrimitivas.ts — as PRIMITIVAS PURAS do
 * laço de revisão F11 e os verificadores determinísticos default (`loop.ts`).
 * Extraído do módulo original na refatoração do lote L05 sem NENHUMA mudança
 * de comportamento — a fachada `loop.ts` re-exporta tudo isto.
 */

import { extractAtoms } from '../extract';
import { normalizarArtefato } from './normalize';
import { extrairProvasDoArtefato, type ProverDeDesafio } from './prover';
import type { TrechoDeDiff } from '../prompts/fixer';
import { hashDeConteudo as hashConteudo } from './versionBuffer';
import type {
  ArtefatoNoLaco,
  ContextoDoLaco,
  SnapshotDeOrcamento,
  VerificadorDeOrcamento,
  VerificadorDeProvas,
  ViolacaoMecanica,
} from './loopTipos';
import { RODADAS_DEFAULT, TETO_DE_RODADAS } from './loopTipos';

// ---------------------------------------------------------------------------
// Primitivos puros do laço (exportados — testáveis isoladamente)
// ---------------------------------------------------------------------------

/** O score_erro do §6.6: 3×orç + 3×testes + 2×pins + 1×corrigir. */
export function scoreErro(
  violacoesOrcamento: number,
  testesFalhando: number,
  pinsFalhando: number,
  apontamentosCorrigir: number,
): number {
  return 3 * violacoesOrcamento + 3 * testesFalhando + 2 * pinsFalhando + 1 * apontamentosCorrigir;
}

/**
 * A PARADA 0 — MECÂNICA (§6.6). FUNÇÃO PURA e exportada: a aprovação do
 * revisor NÃO é um dos argumentos — é impossível parar por opinião.
 */
export function avaliarParadaMecanica(estado: {
  violacoesOrcamento: number;
  testesFalhando: number;
  pinsFalhando: number;
  apontamentosBloqueantesOuCorrigir: number;
}): boolean {
  return (
    estado.violacoesOrcamento === 0 &&
    estado.testesFalhando === 0 &&
    estado.pinsFalhando === 0 &&
    estado.apontamentosBloqueantesOuCorrigir === 0
  );
}

/** Tokens de palavras (minúsculas, sem pontuação) — a base do PROXY Jaccard. */
function tokensDe(texto: string): Set<string> {
  const normalizado = normalizarArtefato(texto).toLowerCase();
  const tokens = normalizado.split(/[^\p{L}\p{N}_]+/u).filter((t) => t.length > 0);
  return new Set(tokens);
}

/**
 * Jaccard normalizado sobre dois textos (0 = nenhum token em comum;
 * 1 = mesmos tokens). Ambos vazios → 1 (idênticos). FUNÇÃO PURA.
 */
export function jaccardNormalizado(a: string, b: string): number {
  const ta = tokensDe(a);
  const tb = tokensDe(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let intersecao = 0;
  for (const token of ta) if (tb.has(token)) intersecao += 1;
  const uniao = ta.size + tb.size - intersecao;
  return uniao === 0 ? 1 : intersecao / uniao;
}

/**
 * O PROXY DETERMINÍSTICO DECLARADO para a "distância de embedding" do
 * critério 'estagnou' (§6.6): 1 − Jaccard normalizado sobre os artefatos
 * NORMALIZADOS (P-12). NUNCA promete embedding real — o limiar 0,06 é
 * ajustado sobre ESTE proxy (falsificável em teste). Artefato que some troca
 * de caminho conta distância 1; a média sobre todos os pares.
 */
export function distanciaDeArtefatos(
  antes: ReadonlyMap<string, string> | Map<string, string>,
  depois: ReadonlyMap<string, string> | Map<string, string>,
): number {
  const caminhos = new Set<string>([...antes.keys(), ...depois.keys()]);
  if (caminhos.size === 0) return 1;
  let soma = 0;
  for (const caminho of caminhos) {
    const a = antes.get(caminho);
    const b = depois.get(caminho);
    if (a === undefined || b === undefined) {
      soma += 1;
      continue;
    }
    soma += 1 - jaccardNormalizado(a, b);
  }
  return soma / caminhos.size;
}

/** Hash do CONJUNTO de artefatos (identidade de conteúdo do estado do laço). */
export function hashDoConjunto(artefatos: ReadonlyMap<string, ArtefatoNoLaco> | Map<string, ArtefatoNoLaco>): string {
  return hashDeConteudoDeMapa(artefatos);
}

/**
 * O hash de conteúdo do conjunto (sha256 sobre caminho+sha256(conteúdo)
 * ordenado) — estados iguais byte a byte têm o MESMO hash em qualquer rodada,
 * que é exatamente o que o ping-pong compara.
 */
function hashDeConteudoDeMapa(artefatos: ReadonlyMap<string, ArtefatoNoLaco> | Map<string, ArtefatoNoLaco>): string {
  const partes = [...artefatos.entries()]
    .map(([caminho, artefato]) => `${caminho}:${hashConteudo(artefato.conteudo)}`)
    .sort();
  return hashConteudo(partes.join('|'));
}

/** Aplica um delta (lista de trechos) a um conteúdo — PUB (gate já passou). */
export function aplicarDelta(conteudo: string, trechos: readonly TrechoDeDiff[]): string {
  const ordenados = [...trechos].sort((a, b) => b.inicio - a.inicio);
  let resultado = conteudo;
  for (const trecho of ordenados) {
    resultado = resultado.slice(0, trecho.inicio) + trecho.substituicao + resultado.slice(trecho.fim);
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Verificadores determinísticos default (factories)
// ---------------------------------------------------------------------------

/** O verificador de ORÇAMENTO por AST (extractAtoms × snapshot de F4). */
export function criarVerificadorDeOrcamento(snapshot: SnapshotDeOrcamento): VerificadorDeOrcamento {
  return (artefatos) => {
    const violacoes: ViolacaoMecanica[] = [];
    for (const surface of snapshot.surfaces) {
      const artefato = artefatos.get(surface.caminho);
      if (artefato === undefined) continue; // superfície ausente — não acusa (gate de presença é de F8; declarado)
      const resultado = extractAtoms(artefato.conteudo);
      if (!resultado.ok) continue; // código que não parseia é erro de build (§5.3), não violação de orçamento
      const permitidos = new Set<string>(surface.permitidos);
      for (const ocorrencia of resultado.occurrences) {
        if (permitidos.has(ocorrencia.key)) continue;
        const inicio = artefato.conteudo.indexOf(ocorrencia.snippet);
        const fim = inicio >= 0 ? Math.max(inicio + Math.max(ocorrencia.snippet.length, 1), 1) : Math.min(artefato.conteudo.length, 1);
        violacoes.push({
          caminho: surface.caminho,
          surface: surface.superficie,
          construcao: ocorrencia.key,
          tipo: 'orcamento',
          inicio: Math.max(inicio, 0),
          fim,
          linha: ocorrencia.line,
          coluna: ocorrencia.column,
          trechoOfensor: ocorrencia.snippet,
          primeiraAulaQueEnsina: snapshot.primeiroEnsina[ocorrencia.key] ?? null,
          mensagem: `construção ${ocorrencia.key} fora do orçamento ${surface.faixa} da superfície ${surface.superficie} (ref ${snapshot.ref})`,
        });
      }
    }
    return violacoes;
  };
}

/** O verificador de PROVAS de execução (quatro provas do §5.4 via P-31). */
export function criarVerificadorDeProvas(prover: ProverDeDesafio): VerificadorDeProvas {
  return async (artefatos) => {
    const violacoes: ViolacaoMecanica[] = [];
    for (const artefato of artefatos.values()) {
      const provas = extrairProvasDoArtefato(artefato.conteudo);
      if (provas === null) continue; // não é desafio executável — declarado
      const veredito = await prover(provas);
      if (!veredito.valid) {
        for (const falha of veredito.failures) {
          const fim = Math.min(artefato.conteudo.length, Math.max(falha.proof.length + 2, 2));
          violacoes.push({
            caminho: artefato.caminho,
            surface: 'execucao',
            construcao: `prova:${falha.proof}`,
            tipo: 'execucao',
            inicio: 0,
            fim,
            linha: 1,
            coluna: 1,
            trechoOfensor: `prova:${falha.proof}`,
            primeiraAulaQueEnsina: null,
            mensagem: `desafio "${artefato.caminho}": ${falha.reason}`,
          });
        }
      }
    }
    return violacoes;
  };
}

/**
 * O teto de rodadas CLAMPED do §6.6 (default 1, teto duro 3) — UMA única
 * conta para TODA a superfície pública do laço. A garantia normativa é:
 * NENHUM caminho roda além de `rodadasMaximas` — nem o laço, nem a chamada
 * avulsa `rodarRodadaDeRevisao`.
 */
export function calcularRodadasMaximas(ctx: ContextoDoLaco): number {
  return Math.min(Math.max(1, Math.floor(ctx.rodadasMaximas ?? RODADAS_DEFAULT)), TETO_DE_RODADAS);
}
