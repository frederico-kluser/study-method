/**
 * src/types/css-modules.d.ts — tipagem dos CSS Modules (*.module.css) do renderer.
 *
 * O renderer usa CSS Modules LOCAIS (regra da onda 12: nenhuma classe global no
 * index.css) para os efeitos/geometria que precisam de animação/transição (ex.:
 * spotlight e modais do tutorial). Esta declaração global dá o tipo das classes
 * como `{ [className: string]: string }` para que `import styles from './X.module.css'`
 * e `styles.className` compilam sem erro no `tsc -p tsconfig.json`.
 */
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}