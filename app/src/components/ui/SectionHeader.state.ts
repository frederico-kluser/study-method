/**
 * components/ui/SectionHeader.state.ts — o mapeamento nível de cabeçalho →
 * tipografia, PURO (sem React, sem DOM — testado de
 * `tests/uiPrimitivesState.test.ts`).
 *
 * A linha "título + chips/ações" (auditoria de layout §8) estava copiada ~12
 * vezes em 8 ficheiros com GRAFIAS diferentes do mesmo cabeçalho: `h4`
 * (ChallengeView), `h6 component="h2"` (Settings, painéis), `subtitle1` e
 * `subtitle2` (ChallengeView, TrackChallengePanel). Sem regra, cada cópia
 * escolhia a variante ao acaso — e o documento ficava com heading levels que
 * saltavam.
 *
 * A DECISÃO: quatro níveis, sempre com `component` coerente com a hierarquia do
 * documento (o `variant` vê o tamanho; o `component` é a semântica que o
 * leitor de tela lê). Quem tem hierarquia diferente da sua vista é bug de
 * outline, não de estilo — e é esta função que o impede.
 *
 * ─── NÍVEL 1 = PÁGINA (extensão pedida pelas ondas de migração) ───────────
 * Os cabeçalhos de PÁGINA renderizam `<h1>` com talhe de título grande:
 * `ChallengeViewHeader` (h4/h1) e `TrackChallengeHeader` (h5/h1) são os dois
 * casos reais. Eles partilham a SEMÂNTICA (h1) mas não o TALHE (h4 vs h5) —
 * por isso o nível decide o `component` e o `variant` aceita override
 * explícito (`sectionHeadingStyle(level, variant)`). O default do nível 1 é o
 * talhe do ChallengeViewHeader (`h4`); o TrackChallengeHeader pede `h5`.
 * O override é escape hatch de TALHE, nunca de semântica: `component` continua
 * a nascer do nível.
 */

/** Nível semântico do cabeçalho (1 = página; 2 = o default das cópias). */
export type SectionHeadingLevel = 1 | 2 | 3 | 4;

/** Os talhes que um cabeçalho pode usar (a escala do tema, sem variantes novas). */
export type SectionHeadingVariant = 'h4' | 'h5' | 'h6' | 'subtitle1' | 'subtitle2';

export interface SectionHeadingStyle {
  /** Variante tipográfica (o TALHE, para a vista). */
  readonly variant: SectionHeadingVariant;
  /** Elemento HTML (a SEMÂNTICA, para o leitor de tela). */
  readonly component: 'h1' | 'h2' | 'h3' | 'h4';
}

export function sectionHeadingStyle(
  level: SectionHeadingLevel = 2,
  variant?: SectionHeadingVariant,
): SectionHeadingStyle {
  const base: SectionHeadingStyle = ((): SectionHeadingStyle => {
    switch (level) {
      case 1:
        return { variant: 'h4', component: 'h1' };
      case 3:
        return { variant: 'subtitle1', component: 'h3' };
      case 4:
        return { variant: 'subtitle2', component: 'h4' };
      case 2:
      default:
        return { variant: 'h6', component: 'h2' };
    }
  })();
  return variant === undefined ? base : { variant, component: base.component };
}
