/**
 * app/electron/main/engine/review/normalize.ts — o NORMALIZADOR, a TABELA
 * FIXA de severidade e o ASSERT de roteamento do REVISOR da engine de
 * trilhas (pacote P-12, onda 1 do plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6.2 (normalizador
 * obrigatório entre autor e juiz — determinístico e testável), §6.3
 * (schema do apontamento), §6.5 (severidade por TABELA FIXA, nunca
 * opinada; sem nota 1–5) e §6.2 restrições 1–2 (roteamento:
 * `model(AUTOR) !== model(REVISOR)` e `family(REVISOR) ∉ families(produtores)`).
 *
 * Três blocos, todos FUNÇÕES PURAS (zero LLM, zero disco, zero rede):
 *
 *   1. `normalizarArtefato` — remove comentários, autoria, nome de modelo,
 *      changelog e auto-avaliação; neutraliza tom. É IDEMPOTENTE (A-P12-3):
 *      aplicar 2× = aplicar 1×, o que garante que o laço F11 pode rodar o
 *      normalizador sem medo de corromper um artefato já normalizado.
 *      Sem ele o AUTOR compra o veredito — auto-declaração de corretude
 *      vale de +5,3 a +34,3 pontos (§6.2): o texto que chega ao revisor
 *      não tem voz de autor.
 *   2. `severidadeDeCategoria`/`abreRodada` — a tabela fixa do §6.5 em
 *      código. Categoria DESCONHECIDA é ERRO (A-P12-4, FAIL-CLOSED):
 *      a engine nunca deriva severidade por opinião, e um enum desconhecido
 *      significa catálogo fora de sincronia — parar é mais barato que
 *      opinar. `estilo`/`tom`/`prosa` (sugestão) NUNCA abrem rodada
 *      (A-P12-5). A gradação de `granularidade` ("corrigir na fase de
 *      estrutura; sugestão depois", §6.5) fica com a fase de estrutura
 *      (onda 3), que rebaixa via `SEVERIDADE_GRANULARIDADE_POS_ESTRUTURA`.
 *   3. `validarRoteamento` — o assert de roteamento EM CÓDIGO (A-P12-2):
 *      o laço F11 (onda 3) o chama ANTES de revisar. Modelo do autor igual
 *      ao do revisor, ou família do revisor dentro das famílias produtoras,
 *      é erro FAIL-CLOSED (mapas modelo→família INJETADOS, nunca hardcoded).
 */

import { z } from 'zod';

import { CategoriaSchema, SeveritySchema } from '../schemas/artifacts';

type Categoria = z.infer<typeof CategoriaSchema>;
type Severidade = z.infer<typeof SeveritySchema>;
type SeveridadePorCategoria = Readonly<Record<Categoria, Severidade>>;

// ---------------------------------------------------------------------------
// 1. NORMALIZADOR — funções puras, idempotentes por camada
// ---------------------------------------------------------------------------

/**
 * Remove comentários de markdown (`<!-- … -->`). NÃO toca em `//` nem em
 * blocos `/* …` de comentário de código — comentários de código são
 * CONTEÚDO legítimo do artefato de aula; só comentário de autoria
 * (markdown) some.
 */
export function removerComentarios(texto: string): string {
  return texto.replace(/<!--[\s\S]*?-->\n?/g, '');
}

/**
 * Linhas de autoria/metadados de modelo, ancoradas no INÍCIO da linha
 * (caso-insensitive): `Autor:`, `Autoria:`, `Assinatura:`, `Escrito por`,
 * `Produzido por`, `Gerado por`, `Criado por`, `Modelo:`, `Modelo utilizado:`,
 * `Modelo LLM:`. O separador `:` pode ser ASCII ou `：`. Linhas que apenas
 * COMEÇAM com `por` (ex.: "Por exemplo, …") não são tocadas: o casamento
 * exige o verbo composto.
 */
export function removerLinhasDeAutoria(texto: string): string {
  const padrao =
    /^\s*(?:autor|autor\(a\)|autoria|assinatura|escrito por|produzido por|gerado por|criado por|modelo|modelo utilizado|modelo llm)\s*[:：]?.*$/im;
  return texto
    .split('\n')
    .filter((linha) => !padrao.test(linha))
    .join('\n');
}

/** Início de linha de seção de meta (changelog/auto-avaliação/etc.). */
function ehInicioDeSecaoMeta(linha: string): boolean {
  const marcadores =
    /(?:changelog|hist[óo]rico de altera[çc][õo]es|log de altera[çc][õo]es|auto-?avalia[çc][ãa]o|avalia[çc][ãa]o (?:do autor|pr[óo]pria)|nota do autor|auto-?elogio|reflex[ãa]o do autor|coment[áa]rio do autor|vers[õo]es do rascunho|altera[çc][õo]es do rascunho)\b/i;
  const comoHeading = /^#{1,6}\s+/.test(linha);
  const comoLinhaSolta = /^\s*:?\s*$/.test(linha.replace(marcadores, '')) && marcadores.test(linha);
  return (comoHeading || comoLinhaSolta) && marcadores.test(linha);
}

function ehHeading(linha: string): boolean {
  return /^#{1,6}\s+/.test(linha);
}

function ehRegua(linha: string): boolean {
  return /^\s*-{3,}\s*$/.test(linha);
}

/**
 * Remove seções inteiras de changelog e auto-avaliação: da linha-marcadora
 * (heading ou linha solta, ex.: `Changelog:` ou `## Auto-avaliação`) até a
 * próxima heading/regra/`---`/fim do texto. Determinístico e idempotente: a
 * seção já removida não volta a casar.
 */
export function removerSecoesDeMeta(texto: string): string {
  const linhas = texto.split('\n');
  const saida: string[] = [];
  let dentroDeSecaoMeta = false;
  for (const linha of linhas) {
    if (ehInicioDeSecaoMeta(linha)) {
      dentroDeSecaoMeta = true;
      continue;
    }
    if (dentroDeSecaoMeta && (ehHeading(linha) || ehRegua(linha))) {
      dentroDeSecaoMeta = false;
    }
    if (!dentroDeSecaoMeta) saida.push(linha);
  }
  return saida.join('\n');
}

/**
 * Padrões de AUTO-ELOGIO/auto-avaliação em linha própria. São heurísticas
 * DETERMINÍSTICAS e conservadoras: qualquer linha que case é removida
 * inteira — o custo de deixar passar é menor que o de apagar conteúdo.
 * Cobre três famílias: (a) "este/meu rascunho/aula ficou excelente/ótimo…";
 * (b) "estou/fiquei muito satisfeito/orgulhoso…"; (c) "acho/acredito que
 * este rascunho ficou…".
 */
const PADROES_DE_LINHA_DE_AUTO_ELOGIO: readonly RegExp[] = [
  /(?:^|[.!?]\s+)(?:este|meu|minha|essa|esta)\s+(?:rascunho|draft|aula|conte[úu]do|material|texto|vers[ãa]o|entrega)\b[^.!?\n]{0,80}(?:excelente|perfeito|perfeita|impec[áa]vel|maravilhoso|fant[áa]stico|incr[íi]vel|[óo]timo|[óo]tima|espetacular|brilhante|magn[íi]fico|sensacional|muito bom|muito bem)\b/i,
  /^(?:eu\s+)?(?:estou|fiquei|me sinto)\s+(?:muito\s+|bastante\s+|extremamente\s+)?(?:satisfeito|satisfeita|orgulhoso|orgulhosa|feliz|contente|impressionado|impressionada)\b/i,
  /^(?:acho|acredito|considero|penso)\s+que\s+(?:este|meu|minha|essa|esta)\s+(?:rascunho|draft|aula|material|conte[úu]do|texto)\s+(?:ficou|est[áa]|estava|ficou bom|ficou [óo]timo)\b/i,
];

/** Remove linhas inteiras de auto-elogio/auto-avaliação. */
export function removerLinhasDeAutoElogio(texto: string): string {
  return texto
    .split('\n')
    .filter((linha) => !PADROES_DE_LINHA_DE_AUTO_ELOGIO.some((padrao) => padrao.test(linha)))
    .join('\n');
}

/**
 * Palavras de elogio/ênfase removidas do texto (neutralização de tom).
 * Lista CURADA e versionada — estender aqui vale para o normalizador
 * inteiro; o casamento é por palavra inteira (fronteira Unicode), ignorando
 * caixa.
 */
export const PALAVRAS_DE_ELOGIO: readonly string[] = [
  'excelente',
  'perfeito',
  'perfeita',
  'impecável',
  'maravilhoso',
  'fantástico',
  'incrível',
  'ótimo',
  'ótima',
  'espetacular',
  'brilhante',
  'magnífico',
  'sensacional',
];

/**
 * Neutraliza o tom: remove adjetivos de elogio (sem exceção por posição —
 * elogio a material próprio é auto-avaliação §6.2), colapsa exclamações
 * repetidas e limpa os artefatos de pontuação deixados pela remoção.
 * Idempotente: nenhuma palavra da lista sobrevive à primeira passada.
 */
export function neutralizarTom(texto: string): string {
  let t = texto;
  for (const palavra of PALAVRAS_DE_ELOGIO) {
    // `\b` do JS é ASCII — não enxerga limite de palavra ao lado de letras
    // acentuadas (`\bótimo\b` nunca casa). Usamos fronteiras Unicode
    // (\p{L}\p{N}_), com o flag `u`, para casar a palavra inteira em pt-BR.
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${palavra}(?![\\p{L}\\p{N}_])`, 'giu'), '');
  }
  t = t.replace(/!{2,}/g, '!');
  t = t.replace(/[ \t]+/g, ' ');
  t = t.replace(/ ,/g, ',').replace(/ \./g, '.').replace(/ :/g, ':').replace(/ ;/g, ';');
  t = t.replace(/ !/g, '!');
  return t.trim();
}

/**
 * O normalizador COMPLETO, na ordem: comentários → autoria → seções de meta
 * → linhas de auto-elogio → tom → colapso de linhas em branco. Função pura e
 * IDEMPOTENTE (A-P12-3): `normalizarArtefato(normalizarArtefato(x)) ===
 * normalizarArtefato(x)` — cada camada remove conteúdo que, uma vez
 * removido, não volta a casar.
 */
export function normalizarArtefato(texto: string): string {
  let t = texto;
  t = removerComentarios(t);
  t = removerLinhasDeAutoria(t);
  t = removerSecoesDeMeta(t);
  t = removerLinhasDeAutoElogio(t);
  t = neutralizarTom(t);
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// ---------------------------------------------------------------------------
// 2. SEVERIDADE POR TABELA FIXA (§6.5) — nunca opinada
// ---------------------------------------------------------------------------

/**
 * A linha exata da tabela do §6.5. `granularidade` entra como `corrigir`
 * (abre rodada na fase de estrutura); o rebaixamento para sugestão depois
 * da fase de estrutura é decisão daquela fase (onda 3), via
 * `SEVERIDADE_GRANULARIDADE_POS_ESTRUTURA`.
 */
export const SEVERIDADE_POR_CATEGORIA: SeveridadePorCategoria = {
  construcao_nao_ensinada: 'bloqueante',
  api_nao_ensinada: 'bloqueante',
  pre_requisito_violado: 'bloqueante',
  teste_invalido: 'bloqueante',
  gabarito_nao_passa: 'bloqueante',
  cobertura_faltante: 'corrigir',
  teoria_desalinhada_do_desafio: 'corrigir',
  ambiguidade_de_enunciado: 'corrigir',
  granularidade: 'corrigir',
  estilo: 'sugestao',
  tom: 'sugestao',
  prosa: 'sugestao',
};

/** A severidade de `granularidade` DEPOIS da fase de estrutura (§6.5). */
export const SEVERIDADE_GRANULARIDADE_POS_ESTRUTURA: Severidade = 'sugestao';

/** Erro FAIL-CLOSED: categoria fora da tabela fixa do §6.5 (A-P12-4). */
export class ErroDeCategoriaDesconhecida extends Error {
  constructor(categoria: string) {
    super(`categoria de apontamento desconhecida: "${categoria}" — a tabela fixa de severidade (§6.5) não tem linha para ela`);
    this.name = 'ErroDeCategoriaDesconhecida';
  }
}

/**
 * A severidade vem da TABELA FIXA, nunca da opinião (§6.5). Categoria
 * desconhecida é ERRO (A-P12-4, FAIL-CLOSED): não existe default.
 */
export function severidadeDeCategoria(categoria: string): Severidade {
  const severidade = SEVERIDADE_POR_CATEGORIA[categoria as Categoria];
  if (severidade === undefined) {
    throw new ErroDeCategoriaDesconhecida(categoria);
  }
  return severidade;
}

/**
 * `estilo`/`tom`/`prosa` (sugestão) NUNCA abrem rodada (A-P12-5); toda
 * categoria bloqueante/corrigir abre. `granularidade` abre (fase de
 * estrutura); cabe àquela fase rebaixar com
 * `SEVERIDADE_GRANULARIDADE_POS_ESTRUTURA`.
 */
export function abreRodada(categoria: string): boolean {
  return severidadeDeCategoria(categoria) !== 'sugestao';
}

// ---------------------------------------------------------------------------
// 3. ASSERT DE ROTEAMENTO (§6.2 restrições 1–2) — A-P12-2
// ---------------------------------------------------------------------------

/** Erro FAIL-CLOSED de roteamento do revisor. */
export class ErroDeRoteamento extends Error {
  constructor(motivo: string) {
    super(`roteamento do revisor inválido: ${motivo}`);
    this.name = 'ErroDeRoteamento';
  }
}

/**
 * Mapas modelo→família e o conjunto de famílias PRODUTORAS — sempre
 * INJETADOS pelo laço F11 (onda 3), nunca hardcoded aqui.
 */
export interface MapaDeFamilias {
  /** ex.: `{ 'deepseek-v4-flash-0731': 'deepseek', 'claude-sonnet-4': 'anthropic' }`. */
  familiaPorModelo: Readonly<Record<string, string>>;
  /** famílias dos modelos que PRODUZEM (AUTOR e demais); o revisor fica fora. */
  familiasProdutoras: readonly string[];
}

/**
 * O assert de roteamento EM CÓDIGO (§6.2; A-P12-2). FUNÇÃO PURA que LANÇA
 * `ErroDeRoteamento` quando:
 *
 *   - `modeloAutor === modeloRevisor` (restrição 1);
 *   - com `familias` injetado, a família do revisor pertence às famílias
 *     PRODUTORAS (restrição 2 — a autopreferência sobrevive a rubrica
 *     binária objetiva e se estende à família);
 *   - com `familias` injetado, a família do autor OU do revisor é
 *     desconhecida do mapa (FAIL-CLOSED: sem família verificável não dá
 *     para provar a restrição 2).
 *
 * Sem `familias`, apenas a restrição 1 é verificável e é aplicada. O laço
 * F11 chama isto ANTES de revisar: revisão com roteamento inválido não
 * existe.
 */
export function validarRoteamento(modeloAutor: string, modeloRevisor: string, familias?: MapaDeFamilias): void {
  if (modeloAutor === modeloRevisor) {
    throw new ErroDeRoteamento(
      `model(AUTOR) === model(REVISOR) === "${modeloAutor}" — o revisor não pode ser o mesmo modelo do autor (docs §6.2)`,
    );
  }
  if (familias === undefined) {
    return;
  }
  const familiaAutor = familias.familiaPorModelo[modeloAutor];
  if (familiaAutor === undefined) {
    throw new ErroDeRoteamento(
      `família do AUTOR desconhecida para o modelo "${modeloAutor}" — impossível provar que o revisor está fora das famílias produtoras (FAIL-CLOSED)`,
    );
  }
  const familiaRevisor = familias.familiaPorModelo[modeloRevisor];
  if (familiaRevisor === undefined) {
    throw new ErroDeRoteamento(
      `família do REVISOR desconhecida para o modelo "${modeloRevisor}" — impossível provar que o revisor está fora das famílias produtoras (FAIL-CLOSED)`,
    );
  }
  if (familias.familiasProdutoras.includes(familiaRevisor)) {
    throw new ErroDeRoteamento(
      `family(REVISOR) = "${familiaRevisor}" pertence às famílias produtoras ${JSON.stringify(familias.familiasProdutoras)} — a autopreferência se estende à família do modelo (docs §6.2)`,
    );
  }
}