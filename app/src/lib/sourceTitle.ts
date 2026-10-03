/**
 * app/src/lib/sourceTitle.ts — o normalizador de EXIBIÇÃO dos títulos de fonte
 * (auditoria UX `.recon/ux-audit/findings-5-fontes.md`, finding-3).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PORQUÊ ESTE ARQUIVO EXISTE
 * ══════════════════════════════════════════════════════════════════════════
 * Os `sources[].title` do conteúdo saem do gerador com a forma
 * `"<Nome real> — <qualificador>"` — 696 de ~820 títulos em
 * `app/resources/tracks/**` (qualquer profundidade) em `{lesson,challenge}.json`
 * têm travessão (—). É o
 * "tell" nº 1 de texto gerado por LLM, e o qualificador é recheio repetido
 * ("a referência oficial da linguagem" aparece literal em duas de três fontes
 * da aula auditada, e é factualmente errado: a cppreference é referência da
 * COMUNIDADE, só o rascunho ISO é "oficial").
 *
 * A correção é de EXIBIÇÃO, nunca de conteúdo: os 696 ficheiros ficam como
 * estão (reescritura de conteúdo é camada separada, ver a "content pass"
 * opcional do finding-3). Este módulo é o único ponto de estrangulamento:
 *   - `normalizeSourceTitle` parte o título no primeiro separador
 *     (` — ` travessão, ` – ` meia-raya, ` -- ` hífen duplo) e devolve
 *     `{ name, qualifier }` — o Nome vira título, o qualificador vira
 *     tagline muda SEM travessão (regra da casa: sem travessão em copy
 *     visível; usa-se dois-pontos/hífen);
 *   - qualificador de recheio conhecido ("a referência oficial da
 *     linguagem", "o rascunho público do padrão") sai DE TODO; o parêntese
 *     de rascunho ("(N3220)") sobe para o Nome ("ISO/IEC 9899 (N3220)") —
 *     é a única parte com informação real daquele qualificador;
 *   - `dedupeQualifier` corta o qualificador que repete a abertura da
 *     descrição (as duas frases começam pela mesma fórmula de recheio,
 *     "A página oficial…"): fica a descrição, que diz o que o aluno ganha;
 *   - `sourceHost` expõe o destino ANTES do clique (en.cppreference.com) —
 *     finding-1: a linha não podia ser um salto às cegas.
 *
 * Garantia contratual: a saída NUNCA contém travessão (—) e nunca trunca
 * texto (SC 1.4.12 "quebra, nunca corta"): só separamos/normalizamos
 * pontuação; o texto do título chega inteiro até ao DOM.
 *
 * Idempotência: `normalizeSourceTitle(normalizeSourceTitle(x).name)` é
 * fixpoint (sem separador na saída, o segundo passe devolve o mesmo Nome).
 */

/** O que um título de fonte significa, já separado para exibição. */
export interface SourceTitleParts {
  /** o NOME REAL da fonte — o que o título quer dizer. Sem travessão. */
  name: string;
  /**
   * o qualificador depois do separador (tagline muda), ou `null` quando não
   * há qualificador ou ele é recheio (a ser descartado). Sem travessão.
   */
  qualifier: string | null;
}

/**
 * Separadores da forma `"<Nome> — <qualificador>"`. Espaços dos DOIS lados
 * são exigidos de propósito: um hífen/meia-raya dentro de uma palavra
 * ("2020–2024", "well-known") não separa nada.
 */
const TITLE_SEPARATORS = [' — ', ' – ', ' -- '] as const;

/**
 * Qualificadores de RECHEIO (filler): zero informação para quem escolhe a
 * fonte e, no caso da "referência oficial", mentira factual. Exato ou com o
 * parêntese de rascunho colado — "(N1570)"/"(N3220)" sobe para o Nome.
 */
const FILLER_QUALIFIERS = ['a referência oficial da linguagem', 'o rascunho público do padrão'];

/** Parêntese final, ex.: "… do padrão (N3220)" → ["… do padrão", "(N3220)"]. */
const TRAILING_PARENTHETICAL = /^(.*?)(\s*\([^()]*\))$/;

/**
 * Comparação NORMALIZADA (o contrato do finding-3 diz "exact/normalized
 * compare"): minúsculas + espaços colapsados. Acentos ficam (o catálogo de
 * recheio é pt-BR fixo, não há variantes a apanhar).
 */
function normalized(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A garantia "nenhum travessão visível" (regra da casa + pedido do dono):
 * travessão solto vira hífen, ` — ` residual vira `: ` (dois-pontos são a
 * substituição sancionada pela regra de copy). En-raya/hífen NÃO se tocam —
 * a proibição é do travessão (—) e nada mais.
 */
function semTravessao(text: string): string {
  return text.replace(/ — /g, ': ').replace(/—/g, '-');
}

/**
 * Normaliza um `sources[].title` para exibição. Só isto:
 *   1. parte no primeiro separador (` — ` / ` – ` / ` -- `);
 *   2. qualificador de recheio → `null`, com o parêntese de rascunho a subir
 *      para o Nome ("ISO/IEC 9899 — o rascunho público do padrão (N3220)"
 *      vira Nome "ISO/IEC 9899 (N3220)");
 *   3. travessão residual fora (sem truncação — SC 1.4.12).
 * Título SEM separador sai como está (ponto 3 é no-op nele).
 */
export function normalizeSourceTitle(raw: string): SourceTitleParts {
  const text = typeof raw === 'string' ? raw.trim() : '';
  let cut = -1;
  let separatorLength = 0;
  for (const separator of TITLE_SEPARATORS) {
    const at = text.indexOf(separator);
    if (at !== -1 && (cut === -1 || at < cut)) {
      cut = at;
      separatorLength = separator.length;
    }
  }
  if (cut === -1) return { name: semTravessao(text), qualifier: null };

  const name = semTravessao(text.slice(0, cut).trim());
  const right = text.slice(cut + separatorLength).trim();

  const parenthetical = right.match(TRAILING_PARENTHETICAL);
  const base = (parenthetical ? parenthetical[1] : right).trim();
  const draftNumber = parenthetical ? parenthetical[2].trim() : null;

  if (FILLER_QUALIFIERS.some((filler) => normalized(base) === normalized(filler))) {
    // Recheio FORA; o parêntese do rascunho é a única informação real dele e
    // sobe para o Nome ("ISO/IEC 9899 (N3220)").
    return {
      name: draftNumber !== null ? `${name} ${draftNumber}`.trim() : name,
      qualifier: null,
    };
  }
  return { name, qualifier: right === '' ? null : semTravessao(right) };
}

/**
 * O HOST da fonte (en.cppreference.com) — o destino visível ANTES do clique
 * (finding-1: "a linha não diz para onde vai"). `www.` sai (é enfeite de
 * domínio, não identidade). URL irresolvível devolve '' (defensivo: a porta
 * de conteúdo já exige http(s) absoluto) — quem chama decide omitir a linha.
 */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * As 3 primeiras palavras normalizadas da frase, ou `null` quando a frase é
 * curta demais (1 palavra) para ser "frase de recheio" distintiva.
 */
function phraseStart(text: string): string | null {
  const words = normalized(text).split(' ').filter(Boolean).slice(0, 3);
  return words.length >= 2 ? words.join(' ') : null;
}

/**
 * De-dup do finding-3: se o qualificador e a descrição ABREM com a mesma
 * frase de recheio ("A página oficial…" nas duas linhas), a tagline é
 * redundante — fica a descrição (é ela que diz o que o aluno ganha) e o
 * qualificador volta `null`. Qualificador específico ("The Rust Programming
 * Language") passa intacto.
 */
export function dedupeQualifier(
  qualifier: string | null,
  description?: string | null,
): string | null {
  if (!qualifier) return null;
  const fromQualifier = phraseStart(qualifier);
  const fromDescription = phraseStart(typeof description === 'string' ? description : '');
  return fromQualifier !== null && fromQualifier === fromDescription ? null : qualifier;
}
