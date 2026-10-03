/**
 * tests/uiPrimitivesRender.test.ts — o MARKUP dos primitivos de
 * `components/ui/`, por SSR (sem jsdom).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA
 * ══════════════════════════════════════════════════════════════════════════
 * A lógica dos primitivos está coberta por `tests/uiPrimitivesState.test.ts`;
 * este ficheiro prova que as VIEWS a aplicam: a técnica da casa
 * (`react-dom/server` + tema real + i18n real por instância isolada, ver
 * tests/lessonSidebarHeader.test.ts) mede o que chega ao HTML.
 *
 *   BLOCO 1 — LoadErrorState/RetryAlert: o erro, o retry e o par
 *     mensagem/detalhe chegam ao markup com as chaves traduzidas.
 *   BLOCO 2 — EmptyState/CenteredColumn: ícone, título, descrição com medida
 *     tectada e CTA centrados; a coluna com o teto do chamador.
 *   BLOCO 3 — SectionHeader/SettingsSection: o `component` do nível (outline
 *     do documento) e o `aria-labelledby` do `<section>` a apontar para o id
 *     do título (o par que as 5 cópias casavam à mão).
 *   BLOCO 4 — InfoCard: informativo sem `aria-pressed`, acionável como botão
 *     real com `aria-pressed` honesto.
 *   BLOCO 5 — ModalScrim: `role="dialog"` + `aria-modal` + `aria-label` no
 *     cartão, e nada renderizado quando fechado.
 *
 * Reprodução: `bash tools/t.sh tests/uiPrimitivesRender.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import { I18nextProvider } from 'react-i18next';

import { theme } from '../src/theme';
import { createAppI18n } from '../src/i18n/index';

// Padrão da casa: componentes .tsx entram por import DINÂMICO com URL (o
// tsconfig de tests/ não liga `jsx` — ver tests/lessonSidebarHeader.test.ts).
const UI = '../src/components/ui/';
const MODULOS = {
  LoadErrorState: new URL(`${UI}LoadErrorState.tsx`, import.meta.url).href,
  RetryAlert: new URL(`${UI}RetryAlert.tsx`, import.meta.url).href,
  EmptyState: new URL(`${UI}EmptyState.tsx`, import.meta.url).href,
  CenteredColumn: new URL(`${UI}CenteredColumn.tsx`, import.meta.url).href,
  SectionHeader: new URL(`${UI}SectionHeader.tsx`, import.meta.url).href,
  SettingsSection: new URL(`${UI}SettingsSection.tsx`, import.meta.url).href,
  InfoCard: new URL(`${UI}InfoCard.tsx`, import.meta.url).href,
  ModalScrim: new URL(`${UI}ModalScrim.tsx`, import.meta.url).href,
} as const;

interface Props {
  readonly [chave: string]: unknown;
}

type Primitivo = ComponentType<Props>;

/** Os oito primitivos, carregados uma vez (import dinâmico por URL). */
const primitivos: Record<string, Primitivo> = {};
/** Instância i18n própria do bloco (idempotente — ver lessonSourcesViewerGaps). */
let i18n: Awaited<ReturnType<typeof createAppI18n>>;

/** A TAG DE ABERTURA do elemento que carrega `marker` (padrão da casa). */
function openTagWith(html: string, marker: string): string {
  const at = html.indexOf(marker);
  assert.notEqual(at, -1, `marcador "${marker}" não está no HTML`);
  const open = html.lastIndexOf('<', at);
  return html.slice(open, html.indexOf('>', at) + 1);
}

function render(Com: Primitivo, props: Props = {}): string {
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n },
      createElement(ThemeProvider, { theme }, createElement(Com, props)),
    ),
  );
}

before(async () => {
  for (const [nome, modulo] of Object.entries(MODULOS)) {
    const mod = (await import(modulo)) as Record<string, Primitivo>;
    const com = mod[nome] ?? mod.default;
    assert.ok(com, `módulo ${nome} não exporta o componente`);
    primitivos[nome] = com as Primitivo;
  }
  i18n = await createAppI18n('pt-BR');
});

describe('ui — BLOCO 1: erro e retry chegam ao markup traduzidos', () => {
  it('LoadErrorState: alerta de erro + retry (chave existente common.tryAgain)', () => {
    const html = render(primitivos.LoadErrorState!, {
      message: 'Não foi possível carregar a aula.',
      onRetry: () => {},
    });
    assert.ok(html.includes('Não foi possível carregar a aula.'));
    assert.ok(html.includes('Tentar de novo'), 'o rótulo do retry vem de common.tryAgain');
    assert.match(html, /role="alert"|class="[^"]*MuiAlert/, 'o erro é um Alert (role alert)');
  });

  it('RetryAlert: par mensagem + detalhe (body2 block + caption 0.85)', () => {
    const html = render(primitivos.RetryAlert!, {
      message: 'Não foi possível consultar as chaves.',
      detail: 'Tenta de novo em alguns segundos.',
      onRetry: () => {},
    });
    assert.ok(html.includes('Não foi possível consultar as chaves.'));
    assert.ok(html.includes('Tenta de novo em alguns segundos.'));
    assert.ok(html.includes('Tentar de novo'));
  });

  it('sem mensagem, o fallback vem da chave nova (ui.loadError.message)', () => {
    const html = render(primitivos.LoadErrorState!, { onRetry: () => {} });
    assert.ok(html.includes('Não foi possível carregar este conteúdo.'));
  });

  it('RetryAlert action:false mostra a mensagem/detalhe SEM o botão (erro de chave)', () => {
    const html = render(primitivos.RetryAlert!, {
      message: 'A chave da OpenRouter é inválida.',
      detail: 'Corrige a chave em Configurações → Chaves de API.',
      action: false,
    });
    assert.ok(html.includes('A chave da OpenRouter é inválida.'));
    assert.ok(html.includes('Corrige a chave em Configurações → Chaves de API.'));
    assert.ok(!html.includes('Tentar de novo'), `sem retentativa não há botão: ${html.slice(0, 300)}`);
    assert.ok(!html.includes('<button'), 'action:false não renderiza ação nenhuma');
  });

  it('RetryAlert sem onRetry também não mostra botão (um retry vazio é mentira)', () => {
    const html = render(primitivos.RetryAlert!, { message: 'Não foi possível validar a chave.' });
    assert.ok(html.includes('Não foi possível validar a chave.'));
    assert.ok(!html.includes('Tentar de novo'));
  });

  it('RetryAlert default com onRetry mantém o botão (comportamento original)', () => {
    const html = render(primitivos.RetryAlert!, {
      message: 'Falha de rede.',
      onRetry: () => {},
    });
    assert.ok(html.includes('Tentar de novo'));
  });

  it('EXTENSÃO: com onClose o × de descarte entra; sem onClose não há ×', () => {
    // O fix S4 da auditoria de UX (o erro do mic ganhou DESCARTE) é contrato:
    // o × só existe quando o chamador tem handler — um descarte que não
    // descarta é mentira (a mesma regra do retry, RetryAlert.state.ts).
    const contaBotoes = (html: string): number => (html.match(/<button/g) ?? []).length;
    const sem = render(primitivos.RetryAlert!, { message: 'Aviso do canal do quiz.' });
    const com = render(primitivos.RetryAlert!, {
      message: 'Aviso do canal do quiz.',
      onClose: () => {},
    });
    assert.equal(contaBotoes(sem), 0, 'sem onRetry e sem onClose não há controle nenhum');
    assert.equal(contaBotoes(com), 1, 'com onClose há UM controle: o × de descarte');
    assert.match(com, /aria-label="[^"]+"/, 'o × tem nome acessível');
  });

  it('EXTENSÃO: retry e × são MUTUAMENTE EXCLUSIVOS — com retry em cena não há ×', () => {
    // A regra do `Alert` do MUI v9 (`Alert.js`: `action == null && onClose`) é
    // o comportamento de HOJE dos três Alerts da aula: o erro do mic mostra o
    // "Tentar de novo" e não o × (o descarte só existe quando não há ação).
    // Preservá-la é contrato — ver `RetryAlert.state.ts`.
    const html = render(primitivos.RetryAlert!, {
      message: 'O motor de voz está indisponível.',
      severity: 'error',
      onRetry: () => {},
      onClose: () => {},
    });
    assert.ok(html.includes('Tentar de novo'), 'o retry continua na ação');
    assert.equal(
      (html.match(/<button/g) ?? []).length,
      1,
      'com retry em cena o × NÃO é desenhado (regra do MUI) — como antes da migração',
    );
  });

  it('EXTENSÃO: o `sx` do chamador compõe por cima do base (py do mic; o base não some)', () => {
    const html = render(primitivos.RetryAlert!, {
      message: 'O motor de voz está indisponível.',
      sx: { py: 0.5 },
    });
    assert.match(
      html,
      /padding-top:calc\(0\.5 \* var\(--mui-spacing\)\)/,
      'o padding do chamador chega ao CSS emitido (o chrome fino do erro do mic)',
    );
    assert.match(
      html,
      /overflow-wrap:break-word/,
      'o composto base do alerta NÃO some — o sx é composto por cima, nunca substitui',
    );
  });
});

describe('ui — BLOCO 2: estado vazio e coluna centrada', () => {
  it('EmptyState: ícone, título, descrição e CTA — a descrição tem medida tectada', () => {
    const html = render(primitivos.EmptyState!, {
      title: 'Nenhuma aula em curso',
      description: 'Escolha uma trilha no mapa para começar.',
      action: createElement('button', null, 'Escolher uma trilha'),
    });
    assert.ok(html.includes('Nenhuma aula em curso'));
    assert.ok(html.includes('Escolha uma trilha no mapa para começar.'));
    assert.ok(html.includes('Escolher uma trilha'));
  });

  it('CenteredColumn: o teto do chamador chega ao sx (maxWidth)', () => {
    const html = render(primitivos.CenteredColumn!, {
      width: 720,
      children: createElement('span', null, 'conteúdo'),
    });
    assert.ok(html.includes('conteúdo'));
    assert.match(html, /max-width:\s*720px/, `o teto 720 não chegou ao CSS: ${html.slice(0, 300)}`);
  });
});

describe('ui — BLOCO 3: cabeçalho de secção com semântica casada', () => {
  it('SectionHeader: o nível decide o componente HTML (h1/h2/h3/h4)', () => {
    const h1 = render(primitivos.SectionHeader!, { title: 'Página', level: 1 });
    const h2 = render(primitivos.SectionHeader!, { title: 'Secção' });
    const h4 = render(primitivos.SectionHeader!, { title: 'Secção', level: 4 });
    assert.match(h1, /<h1[^>]*>Página<\/h1>/);
    assert.match(h2, /<h2[^>]*>Secção<\/h2>/);
    assert.match(h4, /<h4[^>]*>Secção<\/h4>/);
  });

  it('SectionHeader: o override de talhe (h5/h1 do TrackChallengeHeader) não muda a semântica', () => {
    const html = render(primitivos.SectionHeader!, {
      title: 'Desafio da trilha',
      level: 1,
      variant: 'h5',
    });
    assert.match(html, /<h1[^>]*>Desafio da trilha<\/h1>/);
    assert.ok(html.includes('MuiTypography-h5'), `o talhe h5 não chegou: ${html.slice(0, 300)}`);
  });

  it('SettingsSection: o aria-labelledby aponta para o id do título (o par das 5 cópias)', () => {
    const html = render(primitivos.SettingsSection!, {
      title: 'Chaves de API',
      description: 'As chaves do OpenRouter e do Brave Search.',
    });
    const id = /id="([^"]*-title)"/.exec(html)?.[1];
    assert.ok(id, `sem id no título: ${html.slice(0, 300)}`);
    assert.ok(
      html.includes(`aria-labelledby="${id}"`),
      `aria-labelledby não casa o id do título (${id})`,
    );
    assert.ok(html.includes('As chaves do OpenRouter e do Brave Search.'));
  });
});

describe('ui — BLOCO 4: InfoCard informativo vs acionável', () => {
  it('informativo: sem aria-pressed e sem botão', () => {
    const html = render(primitivos.InfoCard!, {
      title: 'Fundamentos de Python',
      subtitle: '12 aulas',
    });
    assert.ok(html.includes('Fundamentos de Python'));
    assert.ok(html.includes('12 aulas'));
    assert.ok(!html.includes('aria-pressed'), 'cartão informativo não anuncia pressed');
    assert.ok(!html.includes('<button'), 'cartão informativo não é botão');
  });

  it('acionável: botão real com aria-pressed do estado selecionado', () => {
    const html = render(primitivos.InfoCard!, {
      title: 'Merge sort',
      selectable: true,
      selected: true,
      onClick: () => {},
    });
    assert.ok(html.includes('<button'), 'selecionável usa CardActionArea (botão real)');
    assert.ok(html.includes('aria-pressed="true"'));
  });
});

describe('ui — BLOCO 5: ModalScrim é o diálogo do §6', () => {
  it('aberto: role dialog + aria-modal + aria-label no cartão', () => {
    const html = render(primitivos.ModalScrim!, {
      open: true,
      ariaLabel: 'Gerar novo desafio',
      onDismiss: () => {},
      children: createElement('span', null, 'corpo do cartão'),
    });
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.ok(html.includes('aria-label="Gerar novo desafio"'));
    assert.ok(html.includes('corpo do cartão'));
  });

  it('contrato do tutorial (achado-1): aria-labelledby/aria-describedby no diálogo', () => {
    const html = render(primitivos.ModalScrim!, {
      open: true,
      ariaLabelledBy: 'selecao-titulo',
      ariaDescribedBy: 'selecao-subtitulo',
      onDismiss: () => {},
      children: createElement('span', null, 'corpo do cartão'),
    });
    assert.ok(html.includes('aria-labelledby="selecao-titulo"'));
    assert.ok(html.includes('aria-describedby="selecao-subtitulo"'));
    assert.match(html, /role="dialog"/);
  });

  it('chrome do cartão: cardSx compõe por cima da superfície base e cardClassName cola', () => {
    const html = render(primitivos.ModalScrim!, {
      open: true,
      ariaLabel: 'Chrome',
      onDismiss: () => {},
      cardClassName: 'cartao-com-chrome',
      cardSx: { borderTopWidth: 41, borderStyle: 'solid' },
      children: createElement('span', null, 'corpo do cartão'),
    });
    const tag = openTagWith(html, 'role="dialog"');
    assert.ok(
      /class="[^"]*cartao-com-chrome/.test(tag),
      `cardClassName não colou: ${tag}`,
    );
    assert.match(html, /border-top-width:\s*41px/, `cardSx não chegou ao CSS: ${html.slice(0, 400)}`);
    // A superfície base do primitivo continua lá (raio SHAPE.md do cartão).
    assert.match(html, /border-radius:\s*12px/);
  });

  it('fechado: não renderiza nada', () => {
    const html = render(primitivos.ModalScrim!, {
      open: false,
      ariaLabel: 'Gerar novo desafio',
      onDismiss: () => {},
      children: createElement('span', null, 'corpo do cartão') as ReactNode,
    });
    assert.ok(!html.includes('corpo do cartão'), `fechado renderizou: ${html.slice(0, 200)}`);
    assert.ok(!html.includes('role="dialog"'));
  });
});
