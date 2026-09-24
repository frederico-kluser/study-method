/**
 * app/electron/main/engine/research/surfEnvelopeFontes.ts — envelope →
 * `TrackSourceLink[]` (o formato que o app JÁ tem), com procedência
 * (`surfEnvelope.ts`). Extraído do módulo original na refatoração do lote L05
 * sem NENHUMA mudança de comportamento — a fachada `surfEnvelope.ts`
 * re-exporta tudo isto pelos MESMOS nomes.
 */

import type { TrackSourceLink } from '../../content/trackTypes';
import type { SurfEnvelope, SurfSource } from './surfEnvelopeTipos';

/**
 * URL citável: esquema http/https E hostname. Mesma régua do
 * `eReferenciaURL` de F1 e do `isCitableUrl` do surf — repetida aqui porque
 * este módulo não pode importar de `phases/**` (dono diferente) e porque a
 * checagem é a última linha antes da aula do aluno.
 */
export function urlCitavel(valor: unknown): boolean {
  if (typeof valor !== 'string' || valor.trim() === '') return false;
  let u: URL;
  try {
    u = new URL(valor.trim());
  } catch {
    return false;
  }
  return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.length > 0;
}


// ─── envelope → TrackSourceLink (o formato que o app JÁ tem) ─────────────────

/** Teto de caracteres da descrição de uma fonte (o trecho da Brave é curto). */
export const TETO_DESCRICAO = 500;

/**
 * Índice URL → melhor trecho disponível no ledger. "Melhor" = o mais longo
 * entre os resultados que apontam para a MESMA url: o mesmo domínio aparece em
 * várias queries e os trechos variam de tamanho; o mais longo é o que carrega
 * mais evidência. Determinístico (empate resolvido pelo primeiro visto).
 */
export function trechosPorUrl(envelope: SurfEnvelope): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const row of envelope.ledger.rows) {
    for (const r of row.results) {
      const trecho = (r.content ?? '').trim();
      if (!r.url || trecho === '') continue;
      const atual = mapa.get(r.url);
      if (atual === undefined || trecho.length > atual.length) mapa.set(r.url, trecho);
    }
  }
  return mapa;
}

/** Uma fonte pronta para a aula, com de onde veio e por que query. */
export interface FonteComProcedencia {
  /** o que vai para `TrackLessonSource.sources` sem tradução nenhuma. */
  link: TrackSourceLink;
  /** número de citação `[n]` do surf — a ponte entre afirmação e fonte. */
  citacao: number;
  /** ids das linhas do ledger que trouxeram esta URL (auditoria). */
  queries: string[];
  /** data de publicação relatada pelo provedor (pode ser null). */
  publicadaEm: string | null;
}

/** As linhas do ledger que trouxeram cada URL (ids únicos, ordem de chegada). */
function queriesPorUrlDe(envelope: SurfEnvelope): Map<string, string[]> {
  const queriesPorUrl = new Map<string, string[]>();
  for (const row of envelope.ledger.rows) {
    for (const r of row.results) {
      if (!r.url) continue;
      const lista = queriesPorUrl.get(r.url) ?? [];
      if (!lista.includes(row.id)) lista.push(row.id);
      queriesPorUrl.set(r.url, lista);
    }
  }
  return queriesPorUrl;
}

/** Uma fonte citável a partir do item de `sources` (título fallback, trecho truncado). */
function montarFonteComProcedencia(
  s: SurfSource,
  trechos: ReadonlyMap<string, string>,
  queriesPorUrl: ReadonlyMap<string, string[]>,
): FonteComProcedencia {
  const trecho = (trechos.get(s.url) ?? '').trim();
  return {
    link: {
      title: s.title.trim() === '' ? s.url : s.title.trim(),
      url: s.url,
      description: trecho.length > TETO_DESCRICAO ? `${trecho.slice(0, TETO_DESCRICAO - 1)}…` : trecho,
    },
    citacao: s.n,
    queries: queriesPorUrl.get(s.url) ?? [],
    publicadaEm: s.date,
  };
}

/**
 * Mapeia o envelope para fontes com procedência. REGRAS, todas fail-closed:
 *   - URL não citável (sem esquema/host) → DESCARTADA e registrada em
 *     `rejeitadas`, nunca emitida;
 *   - título vazio → a URL vira o título (é o que o próprio surf faz em
 *     `ledger.mjs:123`, `title: r.title || url`), porque `TrackSourceLink`
 *     exige título não-vazio (`trackTypes.ts:583` reprova sem ele);
 *   - descrição = trecho do ledger, truncado em `TETO_DESCRICAO`. SEM trecho a
 *     descrição fica VAZIA — nunca preenchida com prosa inventada.
 */
export function fontesDoEnvelope(envelope: SurfEnvelope): {
  fontes: FonteComProcedencia[];
  rejeitadas: { url: string; motivo: string }[];
} {
  const trechos = trechosPorUrl(envelope);
  const queriesPorUrl = queriesPorUrlDe(envelope);

  const fontes: FonteComProcedencia[] = [];
  const rejeitadas: { url: string; motivo: string }[] = [];
  const vistas = new Set<string>();

  for (const s of envelope.sources) {
    if (!urlCitavel(s.url)) {
      rejeitadas.push({ url: s.url, motivo: 'url sem esquema http(s) ou sem host — não é citável' });
      continue;
    }
    if (vistas.has(s.url)) continue;
    vistas.add(s.url);
    fontes.push(montarFonteComProcedencia(s, trechos, queriesPorUrl));
  }
  return { fontes, rejeitadas };
}

/** As queries que o envelope REALMENTE executou (base do anti-repetição). */
export function queriesExecutadas(envelope: SurfEnvelope): string[] {
  return envelope.ledger.rows.map((r) => r.query).filter((q) => q.trim() !== '');
}
