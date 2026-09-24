/**
 * app/electron/main/engine/quality/barraLeitura.ts — a leitura dos campos
 * ADITIVOS da aula (`introduces.derived` e `role`) que a barra consome.
 *
 * A prosa normativa vive na fachada `barra.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { isAtomKey } from '../atomKeys';
import type { TrackLessonSource } from '../../content/trackTypes';
import type { AtomKey } from '../atomKeys';

/** Uma derivada declarada: a chave e o pai que a produz inevitavelmente. */
export interface DerivadaDeclarada {
  chave: AtomKey;
  de: AtomKey;
}

/** O resultado da leitura: as válidas na forma e as entradas malformadas. */
export interface DerivadasLidas {
  validasNaForma: DerivadaDeclarada[];
  malformadas: unknown[];
}

/** UM item de `introduces.derived`; null quando o item está malformado. */
function itemDerivada(item: unknown): DerivadaDeclarada | null {
  if (typeof item !== 'object' || item === null) return null;
  const chave = (item as Record<string, unknown>).chave;
  const de = (item as Record<string, unknown>).de;
  if (typeof chave !== 'string' || typeof de !== 'string' || !isAtomKey(chave) || !isAtomKey(de)) return null;
  return { chave, de };
}

/**
 * Lê `introduces.derived` — campo ADITIVO (§10): ausente = nenhuma derivada
 * declarada, e o colapso é a identidade. Entrada malformada é DESCARTADA aqui
 * e reprovada em A23 (nunca ignorada em silêncio).
 */
export function lerDerivadas(meta: TrackLessonSource): DerivadasLidas {
  const bruto = (meta as unknown as Record<string, unknown>).introduces;
  if (typeof bruto !== 'object' || bruto === null) return { validasNaForma: [], malformadas: [] };
  const lista = (bruto as Record<string, unknown>).derived;
  if (lista === undefined) return { validasNaForma: [], malformadas: [] };
  if (!Array.isArray(lista)) return { validasNaForma: [], malformadas: [lista] };
  const validasNaForma: DerivadaDeclarada[] = [];
  const malformadas: unknown[] = [];
  for (const item of lista) {
    const derivada = itemDerivada(item);
    if (derivada === null) {
      malformadas.push(item);
      continue;
    }
    validasNaForma.push(derivada);
  }
  return { validasNaForma, malformadas };
}

/** O `role` declarado da aula (ausente = `regular`). */
export function papelDa(meta: TrackLessonSource): string {
  const bruto = (meta as unknown as Record<string, unknown>).role;
  return typeof bruto === 'string' && bruto.length > 0 ? bruto : 'regular';
}
