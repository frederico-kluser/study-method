/**
 * tests/bootstrapFonts.test.ts — o FIO das fontes locais, guardado.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ───────────────────────────────────────────
 * A onda 1 do redesign criou `src/fonts.ts` (as @font-face locais do
 * @fontsource) e `FONT_STACK` em `src/lib/designTokens.ts`, e o tema passou a
 * pedir 'Inter Variable' / 'Nunito Variable' / 'JetBrains Mono Variable'. Só que
 * (ONDA 1 game-foundations: Nunito saiu; hoje são Inter, Chakra Petch, JetBrains
 * Mono e Press Start 2P.)
 * NINGUÉM importava `src/fonts.ts`: `grep -rn "fonts'" src/` devolvia UMA linha,
 * e era o comentário dentro do próprio módulo. Consequência medida no app
 * rodando — largura de canvas da mesma string a 16px:
 *
 *     "Inter Variable"           223.98
 *     "Nunito Variable"          223.98
 *     "JetBrains Mono Variable"  223.98
 *     "__NoSuchFontZZZ__"        223.98   <- família INEXISTENTE, mesmo valor
 *     system-ui                  245.54
 *
 * As famílias do contrato mediam igual a uma família inventada: fallback
 * silencioso. E 877 testes unitários mais 16 specs e2e passaram VERDES por cima
 * disso — nenhum deles olhava para o fio.
 *
 * O estrago não era só estético. `theme.ts` pinou `h6` em 16px justificando que
 * "quem separa h6 de body1 é a FAMÍLIA (Nunito vs Inter) e o peso". Sem as
 * @font-face carregadas esse separador não existe: os sete usos de
 * `variant="h6"` encolheram 20% em troca de uma voz tipográfica que não chegou.
 *
 * Por isso o conserto vem com guarda em DUAS camadas. Esta é a barata e
 * estática (o fio existe e está na ordem certa); a outra é
 * `tests/e2e/e2e-fonts.spec.ts`, que mede no app RODANDO se as famílias de fato
 * carregaram. Uma sozinha não basta: esta aqui não prova que a fonte pinta, e a
 * e2e sozinha não diz ONDE o fio arrebentou.
 *
 * ─── O QUE CADA INVARIANTE PROTEGE ─────────────────────────────────────────
 * 1. `import './fonts'` existe em `src/main.tsx`  → o fio está ligado. ESTA é a
 *    invariante que pega o bug real: o import sumido. Sem ele não há @font-face
 *    nenhuma no bundle e as famílias caem no fallback de sistema.
 * 2. Ele vem ANTES de `./index.css` e de `katex/dist/katex.min.css`. CUIDADO com
 *    a justificativa: NÃO é que "uma @font-face só serve às regras que vêm
 *    depois dela" — `@font-face` tem escopo de DOCUMENTO e vale independentemente
 *    da posição na folha. O que a ordem garante é DETERMINISMO DE CASCATA: entre
 *    faces de MESMA família vale a ÚLTIMA declarada (last-wins) e o Vite
 *    concatena o CSS na ORDEM dos imports; com `./fonts` fixo em primeiro lugar,
 *    o ponto de declaração das famílias é único e conhecido, e uma
 *    redeclaração vinda de CSS de terceiro (o KaTeX traz as próprias faces) fica
 *    visivelmente depois em vez de a resolução mudar sozinha a cada refactor.
 *    É uma CONVENÇÃO travada, não a causa do defeito.
 * 3. `src/fonts.ts` importa os pacotes nos arquivos que o tema pilota: os
 *    VARIÁVEIS (Inter, JetBrains Mono) pelo `wght.css`, os ESTÁTICOS
 *    (Chakra Petch 400/600/700, Press Start 2P 400) pelo arquivo do peso.
 *    → é o eixo que o tema pilota (e não `opsz`/`standard`, nem os itálicos).
 * 4. A família que cada pacote REGISTRA de verdade (lida do .css instalado em
 *    node_modules) é a mesma que abre a stack correspondente de `FONT_STACK`.
 *    Esta é a que pega a troca silenciosa `@fontsource-variable/inter` →
 *    `@fontsource/inter`: o pacote estático registra 'Inter' (sem sufixo), o
 *    primeiro item da stack deixa de resolver, e nada mais no repositório
 *    reclama.
 *
 * Nada aqui importa `src/main.tsx` ou `src/fonts.ts` como MÓDULO de propósito:
 * os dois puxam CSS e JSX que o runner de Node não resolve. São invariantes
 * ESTÁTICAS sobre o fonte, no mesmo espírito das que `tests/theme.test.ts` já
 * faz sobre `theme.ts` (ausência de hex literal, ocorrência única do easing).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FONT_STACK } from '../src/lib/designTokens';

const APP_ROOT = join(__dirname, '..');

const MAIN_SOURCE = readFileSync(join(APP_ROOT, 'src', 'main.tsx'), 'utf8');
const FONTS_SOURCE = readFileSync(join(APP_ROOT, 'src', 'fonts.ts'), 'utf8');

/**
 * Remove comentários de linha e de bloco. As invariantes falam sobre CÓDIGO —
 * sem isto, o comentário que EXPLICA o import de fontes satisfaria o teste
 * sozinho, que é exatamente o falso-verde que este arquivo existe para impedir
 * (o `grep` original achava só o comentário dentro de fonts.ts).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const MAIN_CODE = stripComments(MAIN_SOURCE);
const FONTS_CODE = stripComments(FONTS_SOURCE);

/**
 * Índice do import de efeito colateral do especificador dado (-1 se ausente).
 * O `;` é OPCIONAL: `import './fonts'` sem ponto-e-vírgula é ASI válido e
 * continua ligando o fio — exigir o `;` faria o teste falhar por formatação,
 * não por defeito (e o Prettier do repositório é quem cuida do `;`).
 */
function sideEffectImportIndex(code: string, specifier: string): number {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`import\\s+['"]${escaped}['"]\\s*;?`).exec(code);
  return match ? match.index : -1;
}

/**
 * Famílias que um CSS do @fontsource registra de verdade (`font-family:`).
 * Lê o ARQUIVO DE ENTRADA do papel (o `entry` da tabela abaixo): os pacotes
 * VARIÁVEIS têm `wght.css`; os ESTÁTICOS têm um arquivo por peso
 * (`400.css`, `600.css`, ...). O `entry` é o especificador COMPLETO
 * (`@scope/pkg/arquivo.css`); o caminho DENTRO do pacote é a parte após o
 * nome do pacote.
 */
function registeredFamilies(packageDir: string, entry: string): string[] {
  const file = entry.replace(/^@[^/]+\/[^/]+\//, '');
  const css = readFileSync(join(APP_ROOT, 'node_modules', packageDir, file), 'utf8');
  const families = new Set<string>();
  for (const m of css.matchAll(/font-family:\s*'([^']+)'/g)) {
    families.add(m[1]);
  }
  return [...families];
}

/** Primeira família de uma stack CSS (`'Inter Variable', 'Inter', ...`). */
function firstFamily(stack: string): string {
  const first = stack.split(',')[0].trim();
  return first.replace(/^['"]|['"]$/g, '');
}

const FONT_PACKAGES = [
  {
    // ONDA 1 (game-foundations): display Nunito → Chakra Petch. Pacote
    // ESTÁTICO (não existe variável no registry): um CSS por peso — o tema
    // pilota 400/600/700 e a stack abre em 'Chakra Petch'.
    role: 'display',
    pkg: '@fontsource/chakra-petch',
    entry: '@fontsource/chakra-petch/400.css',
    stack: FONT_STACK.display,
  },
  {
    // Acento "pixel" RARO — Press Start 2P, peso único (400).
    role: 'accent',
    pkg: '@fontsource/press-start-2p',
    entry: '@fontsource/press-start-2p/400.css',
    stack: FONT_STACK.accent,
  },
  {
    role: 'body',
    pkg: '@fontsource-variable/inter',
    entry: '@fontsource-variable/inter/wght.css',
    stack: FONT_STACK.body,
  },
  {
    role: 'mono',
    pkg: '@fontsource-variable/jetbrains-mono',
    entry: '@fontsource-variable/jetbrains-mono/wght.css',
    stack: FONT_STACK.mono,
  },
] as const;

describe('bootstrap de fontes — src/main.tsx importa src/fonts.ts', () => {
  it('main.tsx tem o import de efeito colateral `./fonts` (o fio existe)', () => {
    assert.ok(
      sideEffectImportIndex(MAIN_CODE, './fonts') >= 0,
      "src/main.tsx precisa de `import './fonts';` — sem ele nenhuma @font-face " +
        'entra no bundle e as famílias do contrato caem, em silêncio, no ' +
        'fallback system-ui de FONT_STACK.',
    );
  });

  it('o import de `./fonts` vem ANTES do de `./index.css`', () => {
    const fonts = sideEffectImportIndex(MAIN_CODE, './fonts');
    const indexCss = sideEffectImportIndex(MAIN_CODE, './index.css');
    assert.ok(fonts >= 0, "`import './fonts';` ausente");
    assert.ok(indexCss >= 0, "`import './index.css';` ausente");
    assert.ok(
      fonts < indexCss,
      'CONVENÇÃO de cascata: `./fonts` é o primeiro import de CSS do bootstrap. ' +
        'Não é que a @font-face precise vir antes para valer (ela tem escopo de ' +
        'DOCUMENTO e vale em qualquer posição) — é que o Vite concatena o CSS na ' +
        'ORDEM dos imports e faces de mesma família resolvem por LAST-WINS, então ' +
        'um ponto de declaração único e primeiro deixa a resolução determinística.',
    );
  });

  it('o import de `./fonts` vem ANTES do CSS do KaTeX', () => {
    const fonts = sideEffectImportIndex(MAIN_CODE, './fonts');
    const katex = sideEffectImportIndex(MAIN_CODE, 'katex/dist/katex.min.css');
    assert.ok(fonts >= 0, "`import './fonts';` ausente");
    assert.ok(katex >= 0, 'o CSS do KaTeX deixou de ser importado no bootstrap');
    assert.ok(
      fonts < katex,
      '`./fonts` tem que preceder TODO outro CSS do bundle. O KaTeX é o caso que ' +
        'dá sentido à convenção: ele traz as PRÓPRIAS @font-face, e é entre faces ' +
        'de mesma família que a posição decide (last-wins).',
    );
  });
});

describe('src/fonts.ts — os quatro pacotes, nos arquivos que o tema pilota', () => {
  for (const { role, entry } of FONT_PACKAGES) {
    it(`importa ${entry} (papel ${role})`, () => {
      assert.ok(
        sideEffectImportIndex(FONTS_CODE, entry) >= 0,
        `src/fonts.ts precisa importar '${entry}'. Para os pacotes VARIÁVEIS ` +
          '(Inter/JetBrains Mono) o arquivo `wght.css` é o eixo de PESO, o ' +
          'único que o tema pilota — `opsz.css`/`standard.css` registram a ' +
          'mesma família por outro eixo. Para os ESTÁTICOS (Chakra Petch, ' +
          'Press Start 2P) o import é por PESO (`400.css` etc.). Os ' +
          '`*-italic.css` dobram o payload sem que nenhum token peça itálico ' +
          'desenhado.',
      );
    });
  }

  it('nenhum itálico entra no bundle (o payload dobraria sem token que o peça)', () => {
    assert.ok(
      !/@fontsource[^'"]*italic/.test(FONTS_CODE),
      'src/fonts.ts não deve importar os `*-italic.css`: nenhum token do tema ' +
        'pede itálico DESENHADO, e o par itálico dobra o payload de fonte.',
    );
  });
});

describe('FONT_STACK abre com a família que o pacote REALMENTE registra', () => {
  for (const { role, pkg, entry, stack } of FONT_PACKAGES) {
    it(`${role}: ${pkg} registra a primeira família de FONT_STACK.${role}`, () => {
      const registered = registeredFamilies(pkg, entry);
      const expected = firstFamily(stack);
      assert.deepEqual(
        registered,
        [expected],
        `${pkg} registra ${JSON.stringify(registered)}, mas FONT_STACK.${role} ` +
          `abre com '${expected}'. É assim que a troca silenciosa de ` +
          '`@fontsource-variable/x` por `@fontsource/x` quebra a tipografia: o ' +
          "pacote estático registra 'X' (sem o sufixo Variable), o primeiro item " +
          'da stack deixa de resolver e o app cai no segundo sem avisar.',
      );
    });
  }
});
