/**
 * app/electron/main/engine/research/qualityGate.ts — O PORTÃO DE QUALIDADE da
 * colheita: o que separa "pesquisa" de "insumo de aula".
 *
 * O QUE ESTE ARQUIVO FAZ: uma função PURA que olha a colheita consolidada e
 * diz APROVADO ou REPROVADO, com o motivo nomeado, item a item. Nada mais —
 * não busca, não corrige, não completa, não "aproxima".
 *
 * O QUE ELE NÃO FAZ: não julga se a afirmação é VERDADEIRA. Ele julga se ela é
 * RASTREÁVEL. A distinção é honesta e está declarada porque
 * `docs/16-engine-de-trilha.md` §4.2 já diz o que ninguém pode prometer:
 * "pesquisa errada produz trilha errada e nenhuma fase posterior detecta —
 * ponto único onde revisão humana é insubstituível". Este portão fecha o furo
 * mecânico (afirmação órfã, fonte sem URL, colheita vazia); o furo humano
 * continua sendo humano.
 *
 * ─── FAIL-CLOSED ────────────────────────────────────────────────────────────
 * `docs/16-engine-de-trilha.md` §9.3: "a engine falha fechada. Indisponibilidade
 * produz erro estruturado, nunca veredito falso nem aprovação por omissão."
 * Traduzido para este portão:
 *   - colheita vazia NÃO é "aprovado com zero itens": é REPROVAÇÃO;
 *   - afirmação sem fonte NÃO vira afirmação com fonte genérica: é REPROVAÇÃO;
 *   - afirmação que cita uma URL que NÃO está na colheita é o caso mais grave —
 *     é citação inventada — e é REPROVAÇÃO com código próprio.
 *
 * ─── REPROVAÇÃO ≠ AVISO ─────────────────────────────────────────────────────
 * Duas coisas que NÃO reprovam, e por quê:
 *   - fonte sem descrição: a Brave às vezes devolve resultado sem trecho. A
 *     fonte continua citável (título + URL) e o campo `description` de
 *     `TrackSourceLink` fica vazio. Reprovar aqui seria descartar fonte boa;
 *     inventar a descrição seria pior. Vira AVISO.
 *   - surf em modo degradado (`synthesized:false` / `diagnostics.degraded`):
 *     medido de verdade nesta máquina — a chave de LLM do próprio surf não está
 *     configurada, e mesmo assim ele devolveu 21 fontes com exit 0. A síntese
 *     desta engine não é a dele (é o GLM 5.3 Flash pelo `runtime/callLlm.ts`),
 *     então a degradação dele não invalida a colheita. Vira AVISO — declarado,
 *     nunca escondido.
 */

import type { TrackSourceLink } from '../../content/trackTypes';
import { PESQUISA_CODES, PesquisaError } from './errors';
import { urlCitavel, type FonteComProcedencia } from './surfEnvelope';

/** Uma afirmação candidata a virar conteúdo de aula, com de onde ela veio. */
export interface AfirmacaoComFonte {
  id: string;
  /** a frase que a aula vai ensinar. */
  texto: string;
  /** URLs da colheita que sustentam a afirmação. Vazio = órfã = reprovada. */
  fontes: string[];
}

/** Motivos de reprovação — códigos estáveis, um por defeito real. */
export const REPROVACOES = {
  COLHEITA_VAZIA: 'COLHEITA_VAZIA',
  SEM_AFIRMACAO: 'SEM_AFIRMACAO',
  FONTE_SEM_URL: 'FONTE_SEM_URL',
  FONTE_SEM_TITULO: 'FONTE_SEM_TITULO',
  FONTE_TITULO_PADRAO_IA: 'FONTE_TITULO_PADRAO_IA',
  AFIRMACAO_VAZIA: 'AFIRMACAO_VAZIA',
  AFIRMACAO_SEM_FONTE: 'AFIRMACAO_SEM_FONTE',
  AFIRMACAO_COM_FONTE_DESCONHECIDA: 'AFIRMACAO_COM_FONTE_DESCONHECIDA',
} as const;

export type MotivoDeReprovacao = (typeof REPROVACOES)[keyof typeof REPROVACOES];

export interface Reprovacao {
  motivo: MotivoDeReprovacao;
  /** o item reprovado (id da afirmação, ou a URL da fonte). */
  alvo: string;
  mensagem: string;
}

export interface Aviso {
  tipo: 'fonte-sem-descricao' | 'surf-degradado' | 'sintese-do-surf-ausente';
  alvo: string;
  mensagem: string;
}

/** O que o portão recebe. */
export interface ColheitaParaGate {
  fontes: FonteComProcedencia[];
  afirmacoes: AfirmacaoComFonte[];
  /** etapas do surf que caíram para heurística, se houve. */
  degradacoes?: { stage: string; reason: string }[];
  /** `synthesized` do envelope — false = a prosa do surf é brief heurístico. */
  sintetizadoPeloSurf?: boolean;
}

export interface ResultadoDoGate {
  aprovado: boolean;
  reprovacoes: Reprovacao[];
  avisos: Aviso[];
  /** as fontes que sobreviveram, prontas para `TrackLessonSource.sources`. */
  fontesAprovadas: TrackSourceLink[];
}

/** A URL da fonte, já aparada ('' quando não é string). */
function urlDaFonte(f: FonteComProcedencia): string {
  const link = f?.link;
  return typeof link?.url === 'string' ? link.url.trim() : '';
}

/** O título da fonte, já aparado ('' quando não é string). */
function tituloDaFonte(f: FonteComProcedencia): string {
  return typeof f?.link.title === 'string' ? f.link.title.trim() : '';
}

/** A descrição da fonte, já aparada ('' quando não é string). */
function descricaoDaFonte(f: FonteComProcedencia): string {
  return typeof f?.link.description === 'string' ? f.link.description.trim() : '';
}

/**
 * ONDA5-FONTES (anti-regressão, `.recon/ux-audit/findings-5-fontes.md`
 * finding-3): o "tell" de texto gerado é o travessão em `sources[].title`
 * ("Nome — qualificador") somado ao recheio repetido ("a referência oficial
 * da linguagem", "o rascunho público do padrão") — 696 de ~820 títulos do
 * conteúdo atual têm a forma. O VISUALIZADOR já normaliza na exibição
 * (`src/lib/sourceTitle.ts`); este portão impede que conteúdo NOVO nasça
 * assim. Reprova com a dica de reparo ("use só o nome real da fonte;
 * qualificador específico vai em description") — o autor/generator tem aqui
 * o ponto único onde o padrão é apanhado antes de virar aula.
 * Deteta: travessão (—) com espaços aos lados, " -- ", ou uma das frases de
 * recheio conhecidas. A EN-RAYA (–) NÃO reprova — medida, não opinião: o
 * título real do surf usa " – <site>" como sufixo legítimo ("Your Guide to
 * the Python print() Function – Real Python", fixture da execução real de
 * 2026-09-05 em tests/engineResearchCamadas.test.ts:93); régua sobre a
 * en-raya reprovaria colheita HONESTA e matava a geração inteira (medido:
 * 9 testes da orquestração caíam com GATE_REPROVADO). O tell da LLM é o
 * TRAVESSÃO mais o recheio — é aí que a régua entra.
 */
const PADRAO_IA_NO_TITULO = / — | -- |a referência oficial da linguagem|o rascunho público do padrão/i;

/** O trecho do título que delata o padrão, ou null se o título está limpo. */
function padraoIaNoTitulo(titulo: string): string | null {
  const at = titulo.search(PADRAO_IA_NO_TITULO);
  return at === -1 ? null : titulo.slice(at).trim().slice(0, 60);
}

/**
 * As FONTES: URL citável (senão reprova), título (senão reprova), título sem
 * padrão de IA (senão reprova — ONDA5-FONTES), descrição (sem ela é AVISO —
 * a Brave às vezes devolve resultado sem trecho).
 */
function avaliarFontes(
  fontes: readonly FonteComProcedencia[],
  reprovacoes: Reprovacao[],
  avisos: Aviso[],
): { fontesAprovadas: TrackSourceLink[]; urlsConhecidas: Set<string> } {
  const fontesAprovadas: TrackSourceLink[] = [];
  const urlsConhecidas = new Set<string>();
  for (const f of fontes) {
    const url = urlDaFonte(f);
    if (!urlCitavel(url)) {
      reprovacoes.push({
        motivo: REPROVACOES.FONTE_SEM_URL,
        alvo: url || '(vazia)',
        mensagem: 'fonte sem URL http(s) resolvível — sem URL não há procedência, e sem procedência não há aula',
      });
      continue;
    }
    const titulo = tituloDaFonte(f);
    if (titulo === '') {
      reprovacoes.push({
        motivo: REPROVACOES.FONTE_SEM_TITULO,
        alvo: url,
        mensagem: 'fonte sem título — o schema da aula exige title e url (content/trackTypes.ts)',
      });
      continue;
    }
    const padrao = padraoIaNoTitulo(titulo);
    if (padrao !== null) {
      reprovacoes.push({
        motivo: REPROVACOES.FONTE_TITULO_PADRAO_IA,
        alvo: url,
        mensagem:
          `título de fonte com padrão de texto gerado ("${padrao}") — use só o nome real da fonte; ` +
          'qualificador específico vai em description',
      });
      continue;
    }
    const descricao = descricaoDaFonte(f);
    if (descricao === '') {
      avisos.push({
        tipo: 'fonte-sem-descricao',
        alvo: url,
        mensagem: 'a busca não devolveu trecho para esta URL — a descrição fica vazia em vez de inventada',
      });
    }
    urlsConhecidas.add(url);
    fontesAprovadas.push({ title: titulo, url, description: descricao });
  }
  return { fontesAprovadas, urlsConhecidas };
}

/** O id e o texto da afirmação, já aparados. */
function idDeAfirmacao(a: AfirmacaoComFonte): string {
  return typeof a?.id === 'string' && a.id.trim() !== '' ? a.id.trim() : '(sem id)';
}

/** As URLs citadas pela afirmação, só strings não-vazias. */
function fontesDeAfirmacao(a: AfirmacaoComFonte): string[] {
  return Array.isArray(a.fontes) ? a.fontes.map((u) => String(u ?? '').trim()).filter((u) => u !== '') : [];
}

/** Uma AFIRMACAO: texto, fonte e citação conhecida (a citação inventada é a mais grave). */
function avaliarAfirmacao(
  a: AfirmacaoComFonte,
  urlsConhecidas: ReadonlySet<string>,
  reprovacoes: Reprovacao[],
): void {
  const id = idDeAfirmacao(a);
  const texto = typeof a?.texto === 'string' ? a.texto.trim() : '';
  if (texto === '') {
    reprovacoes.push({
      motivo: REPROVACOES.AFIRMACAO_VAZIA,
      alvo: id,
      mensagem: 'afirmação sem texto',
    });
    return;
  }
  const urls = fontesDeAfirmacao(a);
  if (urls.length === 0) {
    reprovacoes.push({
      motivo: REPROVACOES.AFIRMACAO_SEM_FONTE,
      alvo: id,
      mensagem: `afirmação órfã (sem fonte): "${texto.slice(0, 100)}"`,
    });
    return;
  }
  const desconhecidas = urls.filter((u) => !urlsConhecidas.has(u));
  if (desconhecidas.length > 0) {
    reprovacoes.push({
      motivo: REPROVACOES.AFIRMACAO_COM_FONTE_DESCONHECIDA,
      alvo: id,
      mensagem:
        `a afirmação cita URL que NÃO está na colheita — citação inventada: ${desconhecidas
          .slice(0, 3)
          .join(', ')}`,
    });
  }
}

/** As degradações do surf viram AVISOS declarados (nunca escondidas). */
function avaliarDegradacoes(colheita: ColheitaParaGate, avisos: Aviso[]): void {
  for (const d of colheita?.degradacoes ?? []) {
    avisos.push({
      tipo: 'surf-degradado',
      alvo: d.stage,
      mensagem: `etapa "${d.stage}" do surf caiu para heurística: ${d.reason}`,
    });
  }
}

/** `synthesized: false` também é AVISO declarado (a prosa é brief heurístico). */
function avaliarSinteseDoSurf(colheita: ColheitaParaGate, avisos: Aviso[]): void {
  if (colheita?.sintetizadoPeloSurf === false) {
    avisos.push({
      tipo: 'sintese-do-surf-ausente',
      alvo: '(surf)',
      mensagem:
        'a prosa do surf é o brief heurístico dele, não síntese de LLM. Isto não invalida a colheita: ' +
        'quem sintetiza nesta engine é o modelo do transporte único, não o surf',
    });
  }
}

/**
 * O portão. PURO. Roda UMA vez, sobre a colheita CONSOLIDADA de todas as
 * camadas — não por camada: uma camada vazia é normal (a camada 2 pode não
 * achar nada sobre uma lacuna estreita), o que não pode é o conjunto vazio.
 */
export function portaoDeQualidade(colheita: ColheitaParaGate): ResultadoDoGate {
  const reprovacoes: Reprovacao[] = [];
  const avisos: Aviso[] = [];

  const fontes = Array.isArray(colheita?.fontes) ? colheita.fontes : [];
  const afirmacoes = Array.isArray(colheita?.afirmacoes) ? colheita.afirmacoes : [];

  const { fontesAprovadas, urlsConhecidas } = avaliarFontes(fontes, reprovacoes, avisos);

  if (fontesAprovadas.length === 0) {
    reprovacoes.push({
      motivo: REPROVACOES.COLHEITA_VAZIA,
      alvo: '(colheita)',
      mensagem:
        'nenhuma fonte sobreviveu à colheita — a pesquisa rodou e não trouxe nada citável. ' +
        'Fail-closed: não existe material sem fonte',
    });
  }

  if (afirmacoes.length === 0) {
    reprovacoes.push({
      motivo: REPROVACOES.SEM_AFIRMACAO,
      alvo: '(afirmações)',
      mensagem: 'nenhuma afirmação foi extraída da colheita — não há o que a aula ensine',
    });
  }

  for (const a of afirmacoes) avaliarAfirmacao(a, urlsConhecidas, reprovacoes);

  avaliarDegradacoes(colheita, avisos);
  avaliarSinteseDoSurf(colheita, avisos);

  return { aprovado: reprovacoes.length === 0, reprovacoes, avisos, fontesAprovadas };
}

/**
 * O portão com dentes: reprovação vira `PesquisaError` GATE_REPROVADO. É esta
 * função que o orquestrador chama — a versão que devolve objeto existe para o
 * relatório e para o teste.
 */
export function exigirAprovacao(resultado: ResultadoDoGate, etapa = 'gate'): ResultadoDoGate {
  if (resultado.aprovado) return resultado;
  const resumo = resultado.reprovacoes
    .slice(0, 5)
    .map((r) => `${r.motivo}@${r.alvo}`)
    .join(', ');
  throw new PesquisaError({
    code: PESQUISA_CODES.GATE_REPROVADO,
    etapa,
    message: `o portão de qualidade reprovou a colheita (${resultado.reprovacoes.length} reprovação(ões)): ${resumo}`,
    details: { reprovacoes: resultado.reprovacoes, avisos: resultado.avisos },
  });
}
