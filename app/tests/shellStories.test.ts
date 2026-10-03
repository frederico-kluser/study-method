/**
 * tests/shellStories.test.ts — as HISTÓRIAS do Storybook do shell (catálogo
 * vivo que o redesign futuro lê).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA
 * ══════════════════════════════════════════════════════════════════════════
 * A tarefa de catálogo do shell exige COBERTURA (nenhum componente da área sem
 * história) e FIDELIDADE (STORY-SPEC). A verificação manual era um grep; aqui
 * ela vira contrato, no molde das guardas de fonte da casa (shellSidebar/
 * shellSplitUi) — `readFileSync` sobre os `.stories.tsx` e asserts sobre o
 * código (comentários removidos: o que se tranca é o que roda):
 *
 *   1. COBERTURA — cada componente de `components/shell/` tem um
 *      `<Nome>.stories.tsx` irmão, com o `title` LITERAL da STORY-SPEC
 *      (`Componentes/Shell/<Nome>`) e o formato CSF3 da casa
 *      (`satisfies Meta` + `StoryObj` + `autodocs`).
 *   2. VOCABULÁRIO REAL — as histórias consomem o que o produto consome
 *      (`NAV_ITEMS`, `SHELL_SPLIT_CONSTRAINTS`, `withSidebarSlot`), não
 *      cópias; e o `GlobalBusyIndicator` tem uma história por MOTIVO de
 *      ocupação — cruzado com as chaves `lesson.busy.*` dos locales, para um
 *      motivo novo sem história reprovado aqui.
 *   3. REGRAS DO DESIGN SYSTEM — nenhum hex numa história (hex vive só em
 *      `src/lib/designTokens.ts`), nenhum `any`/`@ts-ignore`, nenhum import
 *      de `electron` (bloqueador nº 2 do RENDER-PLAYBOOK).
 *
 * Sem jsdom: isto é `node:test` puro (só ficheiros + JSON de locale).
 * Reprodução: `bash tools/t.sh tests/shellStories.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import ptBR from '../src/i18n/locales/pt-BR/translation.json';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHELL_DIR = resolve(HERE, '../src/components/shell');

/** Os componentes da área do shell e o título literal que a STORY-SPEC fixa. */
const SHELL_COMPONENTS: ReadonlyArray<{ component: string; title: string }> = [
  { component: 'GlobalBusyIndicator', title: 'Componentes/Shell/GlobalBusyIndicator' },
  { component: 'NavigationRail', title: 'Componentes/Shell/NavigationRail' },
  { component: 'SessionFrame', title: 'Componentes/Shell/SessionFrame' },
  { component: 'ShellSidebarSlot', title: 'Componentes/Shell/ShellSidebarSlot' },
  { component: 'SplitDivider', title: 'Componentes/Shell/SplitDivider' },
];

/** Fonte sem comentários — só o código que realmente roda (regra da casa). */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function storySource(component: string): string {
  return readFileSync(resolve(SHELL_DIR, `${component}.stories.tsx`), 'utf8');
}

function storyCode(component: string): string {
  return codeOf(storySource(component));
}

describe('catálogo do shell — cobertura e contrato das histórias', () => {
  it('cada componente de components/shell/ tem a sua história irmã *.stories.tsx', () => {
    for (const { component } of SHELL_COMPONENTS) {
      const code = storyCode(component);
      assert.ok(code.length > 0, `sem história: ${component}.stories.tsx`);
    }
  });

  it('o título é o literal da STORY-SPEC (árvore estável, sem auto-derivação)', () => {
    for (const { component, title } of SHELL_COMPONENTS) {
      assert.ok(
        storyCode(component).includes(`title: '${title}'`),
        `title errado em ${component}.stories.tsx (esperado: ${title})`,
      );
    }
  });

  it('formato CSF3 da casa: satisfies Meta + StoryObj + autodocs + export default', () => {
    for (const { component } of SHELL_COMPONENTS) {
      const code = storyCode(component);
      assert.match(code, /satisfies Meta/, `sem \`satisfies Meta\` em ${component}.stories.tsx`);
      assert.match(code, /type Story = StoryObj<typeof meta>/, `sem \`StoryObj\` em ${component}.stories.tsx`);
      assert.match(code, /tags: \['autodocs'\]/, `sem autodocs em ${component}.stories.tsx`);
      assert.match(code, /export default meta;/, `sem export default em ${component}.stories.tsx`);
    }
  });

  it('as histórias consomem o vocabulário REAL do produto (sem cópias locais)', () => {
    // O rail documenta as abas que o produto tem (NAV_ITEMS), não uma lista sua.
    assert.match(storyCode('NavigationRail'), /NAV_ITEMS/);
    // A divisória corre com as restrições REAIS do shell (as mesmas do App).
    assert.match(storyCode('SplitDivider'), /SHELL_SPLIT_CONSTRAINTS/);
    // O slot usa o decorator partilhado que fornece o contêiner alvo.
    assert.match(storyCode('ShellSidebarSlot'), /withSidebarSlot/);
  });

  it('o GlobalBusyIndicator tem uma história por motivo de ocupação (lesson.busy.*)', () => {
    const code = storyCode('GlobalBusyIndicator');
    const reasons = Object.keys(ptBR.lesson.busy);
    assert.ok(reasons.length > 0, 'o locale pt-BR perdeu os motivos de ocupação');
    for (const reason of reasons) {
      assert.ok(
        code.includes(`reason="${reason}"`),
        `sem história para o motivo de ocupação "${reason}"`,
      );
    }
    // E o estado ocioso (o contrato `null`) está documentado.
    assert.match(code, /Oculta/);
  });

  it('nenhum hex, nenhum any/@ts-ignore, nenhum import de electron nas histórias', () => {
    for (const { component } of SHELL_COMPONENTS) {
      const code = storyCode(component);
      assert.ok(
        !/#(?:[0-9a-fA-F]{3}){1,2}\b/.test(code),
        `hex numa história (${component}.stories.tsx) — hex vive só em designTokens.ts`,
      );
      assert.ok(!/\bany\b/.test(code), `any em ${component}.stories.tsx`);
      assert.ok(!/@ts-ignore/.test(code), `@ts-ignore em ${component}.stories.tsx`);
      assert.ok(!/from 'electron/.test(code), `import de electron em ${component}.stories.tsx`);
      assert.ok(!/window\.api/.test(code), `window.api à mão em ${component}.stories.tsx`);
    }
  });
});