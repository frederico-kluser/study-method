/**
 * tests/bootstrapFonts.test.ts — o FIO das fontes locais, guardado.
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE ───────────────────────────────────────────
 * A onda 1 do redesign criou `src/fonts.ts` (as @font-face locais do
 * @fontsource) e `FONT_STACK` em `src/lib/designTokens.ts`, e o tema passou a
 * pedir 'Inter Variable' / 'Nunito Variable' / 'JetBrains Mono Variable'.
 * (A onda 1 "game-foundations" trocou o display por Chakra Petch e acrescentou
 * o acento pixel Press Start 2P; a ONDA 11 desfez as duas coisas — "a fonte nao
 * quero retro", pedido do dono — e o display voltou a ser Nunito, agora no
 * pacote VARIÁVEL. São três famílias de novo, e o papel `accent` deixou de
 * existir.)
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
 * 3. `src/fonts.ts` importa os TRÊS pacotes VARIÁVEIS pelo `wght.css` — o eixo
 *    que o tema pilota (e não `opsz`/`standard`, nem os itálicos).
 * 3b. NENHUMA família RETRO/PIXEL entra na tipografia (ONDA 11). Este é o
 *    invariante que trava o pedido do dono, e ele mede TRÊS camadas ao mesmo
 *    tempo — a stack (`FONT_STACK`), o carregamento (`src/fonts.ts`) e a
 *    dependência (`package.json`) —, porque foi exatamente assim que a fonte
 *    retro entrou da primeira vez: um pacote instalado, um import, uma stack.
 *    Remover só uma das três deixa a fonte no bundle (peso morto) ou deixa a
 *    stack pedindo uma família que ninguém carrega (fallback silencioso).
 * 3c. NENHUMA referência a CDN de fonte — nem no fonte, nem no index.html, nem
 *    no build de `out/`. O `font-src 'self'` da CSP do renderer mata a
 *    tipografia em produção SEM erro visível se alguém religar a CDN; o app
 *    também precisa abrir offline. Ver o cabeçalho de `src/fonts.ts`.
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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
    // ONDA 11: display Chakra Petch → Nunito, de volta ao pacote VARIÁVEL
    // (eixo wght 200..1000 num arquivo por subset). É a família que a spec
    // sempre documentou e que a onda 1 tinha trocado sem atualizar a spec.
    role: 'display',
    pkg: '@fontsource-variable/nunito',
    entry: '@fontsource-variable/nunito/wght.css',
    stack: FONT_STACK.display,
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

describe('src/fonts.ts — os três pacotes, nos arquivos que o tema pilota', () => {
  for (const { role, entry } of FONT_PACKAGES) {
    it(`importa ${entry} (papel ${role})`, () => {
      assert.ok(
        sideEffectImportIndex(FONTS_CODE, entry) >= 0,
        `src/fonts.ts precisa importar '${entry}'. Os três pacotes são ` +
          'VARIÁVEIS, e `wght.css` é o eixo de PESO — o único que o tema ' +
          'pilota; `opsz.css`/`standard.css` registram a mesma família por ' +
          'outro eixo, e os `*-italic.css` dobram o payload sem que nenhum ' +
          'token peça itálico desenhado.',
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

/* ═══════════════════════════════════════════════════════════════════════════
 * ONDA 11 — "a fonte nao quero retro" (pedido do dono, verbatim)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Famílias de registro RETRO/PIXEL/TECHNO. As duas primeiras são as que este
 * projeto de fato carregou (onda 1, herdadas do irmão leet-code-rpg); as demais
 * são as vizinhas óbvias do mesmo gênero no catálogo do @fontsource — estão aqui
 * para que a próxima tentativa de "dar um ar de jogo" à tipografia seja pega
 * pelo teste, e não pela foto que o dono tira da tela.
 *
 * A lista é de NOME, não de arquivo: o que precisa não voltar é a VOZ.
 */
const RETRO_FAMILIES = [
  'Chakra Petch',
  'Press Start 2P',
  'VT323',
  'Silkscreen',
  'Pixelify Sans',
  'Orbitron',
  'Audiowide',
  'Share Tech',
  'Monoton',
] as const;

/** Slug npm da família — o segmento depois da barra num pacote @fontsource. */
function packageSlug(family: string): string {
  return family.toLowerCase().replace(/\s+/g, '-');
}

const PACKAGE_JSON_SOURCE = readFileSync(join(APP_ROOT, 'package.json'), 'utf8');

describe('ONDA 11 — nenhuma família RETRO/PIXEL na tipografia', () => {
  it('FONT_STACK não pede nenhuma família retro em nenhum papel', () => {
    // A stack é a camada que o navegador de fato consulta. Uma família retro
    // aqui pinta a tela mesmo que o pacote tenha sido desinstalado — basta o
    // usuário tê-la no sistema.
    for (const [role, stack] of Object.entries(FONT_STACK)) {
      for (const family of RETRO_FAMILIES) {
        assert.ok(
          !stack.toLowerCase().includes(family.toLowerCase()),
          `FONT_STACK.${role} contém '${family}': "${stack}". O dono pediu, ` +
            'com estas palavras, "a fonte nao quero retro" — o display é ' +
            'Nunito Variable (geométrica-humanista, a voz da referência ' +
            'Nintendo Switch) e não existe mais um papel de acento pixel.',
        );
      }
    }
  });

  it('src/fonts.ts não CARREGA nenhum pacote de família retro', () => {
    for (const family of RETRO_FAMILIES) {
      assert.ok(
        !FONTS_CODE.includes(packageSlug(family)),
        `src/fonts.ts ainda importa '${packageSlug(family)}'. Uma @font-face ` +
          'carregada e não usada é payload morto no bundle do renderer — e é ' +
          'o rastro que faz a fonte retro voltar no primeiro refactor.',
      );
    }
  });

  it('package.json não DEPENDE de nenhuma família retro', () => {
    for (const family of RETRO_FAMILIES) {
      assert.ok(
        !PACKAGE_JSON_SOURCE.includes(`/${packageSlug(family)}"`),
        `package.json ainda declara @fontsource*/${packageSlug(family)}. As ` +
          'três camadas (dependência, import, stack) saem juntas ou a família ' +
          'volta sozinha.',
      );
    }
  });

  it('o papel `accent` (a stack do Press Start 2P) deixou de existir', () => {
    // Um quarto papel apontando para a mesma família do display seria só uma
    // porta aberta: "accent" é onde a fonte pixel morava, e é onde a próxima
    // moraria. A variante `pixel` do tema (nome legado) usa `display`.
    assert.ok(
      !('accent' in FONT_STACK),
      'FONT_STACK.accent voltou a existir — ver src/lib/designTokens.ts',
    );
    assert.deepEqual(Object.keys(FONT_STACK).sort(), ['body', 'display', 'mono']);
  });
});

describe('fontes são LOCAIS — nenhuma referência a CDN sobrevive', () => {
  /** Os dois hosts do Google Fonts, que a CSP `font-src \'self\'` barra. */
  const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

  it('nenhum fonte de src/ referencia a CDN (comentários à parte)', () => {
    // O cabeçalho de src/fonts.ts EXPLICA a proibição citando os dois hosts —
    // por isso o teste lê o código sem comentários. Um grep ingênuo daria
    // falso-vermelho justamente no arquivo que documenta a regra.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx|css|html)$/.test(entry.name)) {
          const code = stripComments(readFileSync(full, 'utf8'));
          if (CDN_HOSTS.some((host) => code.includes(host))) offenders.push(full);
        }
      }
    };
    walk(join(APP_ROOT, 'src'));
    assert.deepEqual(
      offenders,
      [],
      'CDN de fonte no fonte do renderer: a CSP do index.html é ' +
        "`style-src 'self' 'unsafe-inline'` + `font-src 'self'`, então o " +
        '<link> seria barrado e a tipografia inteira cairia no fallback ' +
        'system-ui — SEM erro visível na tela.',
    );
  });

  it('index.html não referencia a CDN', () => {
    const html = readFileSync(join(APP_ROOT, 'index.html'), 'utf8');
    for (const host of CDN_HOSTS) {
      assert.ok(!html.includes(host), `index.html referencia ${host}`);
    }
  });

  it('o build em out/ não referencia a CDN (quando existe)', () => {
    // Esta é a camada que prova de verdade: o fonte pode estar limpo e um
    // plugin/PostCSS ainda emitir o @import da CDN no CSS do bundle. `out/` é
    // artefato — quando ele não existe, o teste diz isso em vez de passar
    // calado (um verde por ausência de arquivo é o falso-verde clássico).
    const outDir = join(APP_ROOT, 'out');
    if (!existsSync(outDir)) {
      assert.ok(true, 'out/ ausente — rode `npm run build` para exercer esta camada');
      return;
    }
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|css|html)$/.test(entry.name)) {
          const text = readFileSync(full, 'utf8');
          if (CDN_HOSTS.some((host) => text.includes(host))) offenders.push(full);
        }
      }
    };
    walk(outDir);
    assert.deepEqual(offenders, [], 'a CDN de fonte voltou no build de out/');
  });
});
