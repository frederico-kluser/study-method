/**
 * tests/lessonAdvanceComposerStates.test.ts — ONDA-AVANCAR-COMPOSER, TENTATIVA
 * 3 (cobertura de GAPS — os estados BASE do avanço no composer já são
 * contrato em tests/lessonChatLayout.test.ts bloco 3; aqui ficam os que
 * NÃO têm asserção em lugar nenhum).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * OS GAPS QUE ESTE ARQUIVO FECHA (todos renderizados, tema+i18n REAIS)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. A MATRIZ advanceLocked × advanceDisabled — 2×2, cada célula medida na
 *    TAG DO BOTÃO. O contrato mede a célula (locked=true, disabled=false) —
 *    o passo 'quiz-secao' — e a vivo/da célula (false,false). Ficaram SEM
 *    asserção as duas células com o TURNO EM VOO, e é nelas que mora o
 *    risco: `disabled={advanceDisabled || advanceLocked}` é um OU — um
 *    mutante que trocasse por `advanceLocked` (ou por `advanceDisabled`)
 *    só é morto pelo par completo. E a célula (disabled, sem cadeado)
 *    prova o OUTRO lado da interação: o turno em voo TRAVA o clique sem
 *    adotar a PLASMA do travado (segue contained, com seta, sem LockIcon) —
 *    busy não é gate.
 *
 * 2. O TOOLTIP VAZIO do passo 'proximo'. A view passa `advanceTooltip: ''`
 *    no passo 'proximo' (o botão vivo não pede desculpa). O contrato mede o
 *    tooltip COM texto (quiz-secao); o caso vazio não tem asserção — e é
 *    ele que impede um tooltip morto virar nome acessível vazio no botão.
 *
 * 3. showAdvance=false EM CADA PASSO SEM AVANÇO. O composer é step-
 *    agnóstico (a decisão é o `advanceVisible` da view, travado à máquina
 *    pura em tests/lessonAvancarGaps.test.ts); o que se mede aqui é o lado
 *    RENDERIZADO, uma vez por passo que NÃO tem avanço ('nao-comecou' e os
 *    quatro de fim de aula): nenhuma ocorrência de "Avançar" no DOM inteiro
 *    (cuidado: é prefixo de "Avançar para a próxima aula" — por isso a
 *    varredura é pelo rótulo fechando botão), nenhum LockIcon órfão, SÓ os
 *    dois botões da linha (mic + enviar) e as DUAS cascas do framer fora do
 *    tab (a terceira, do avanço, não pode existir nem fantasma).
 *
 * Reprodução: `bash tools/t.sh tests/lessonAdvanceComposerStates.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';

const VIEW_MODULE = new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).href;

interface ComposerProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onMicToggle: () => void;
  micTranscribing: boolean;
  disabled: boolean;
  showAdvance: boolean;
  advanceLocked: boolean;
  advanceDisabled: boolean;
  onAdvance: () => void;
  advanceTooltip: string;
}

let LessonComposer: ComponentType<ComposerProps>;

const BASE: ComposerProps = {
  draft: 'oi',
  onDraftChange: () => {},
  onSend: () => {},
  onMicToggle: () => {},
  micTranscribing: false,
  disabled: false,
  showAdvance: true,
  advanceLocked: false,
  advanceDisabled: false,
  onAdvance: () => {},
  advanceTooltip: '',
};

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    // A MESMA opção da produção (src/i18n/index.ts) — ver o porquê no
    // cabeçalho de tests/lessonChatLayout.test.ts.
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const mod = (await import(VIEW_MODULE)) as { LessonComposer: typeof LessonComposer };
  LessonComposer = mod.LessonComposer;
});

function renderComposer(props: Partial<ComposerProps> = {}): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(LessonComposer, { ...BASE, ...props }),
    ),
  );
}

const AVANCAR = ptBR.lesson.advanceButton;
const AVANCAR_TXT = `${AVANCAR}</button>`;

/**
 * A TAG DE ABERTURA do <button> "Avançar" (o rótulo vem DEPOIS do span do
 * startIcon, então o `<` mais próximo é um `</span>` — mesma técnica e mesmo
 * porquê de tests/lessonChatLayout.test.ts).
 */
function advanceButtonTag(html: string): string {
  const at = html.indexOf(AVANCAR_TXT);
  assert.notEqual(at, -1, 'o botão "Avançar" deveria estar renderizado');
  const open = html.lastIndexOf('<button', at);
  assert.notEqual(open, -1, 'nenhum <button> contém o rótulo do avanço');
  return html.slice(open, html.indexOf('>', open) + 1);
}

/**
 * O atributo booleano `disabled` REALMENTE presente na tag — `\sdisabled=""`
 * e não `includes('disabled')` (a lista de classes carrega `Mui-disabled` e a
 * folha carrega `.Mui-disabled{…}`; a substring solta dá verde de graça).
 */
function isDisabled(tag: string): boolean {
  return /\sdisabled=""/.test(tag);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GAP 1 — a matriz advanceLocked × advanceDisabled, célula a célula
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('a matriz advanceLocked × advanceDisabled do composer', () => {
  /**
   * O par completo, célula a célula: variante + ícone + `disabled` NA TAG do
   * botão. As duas células com `disabled: true` são as novas — é o OU do
   * código (`advanceDisabled || advanceLocked`) que elas travam.
   */
  const CELULAS = [
    {
      nome: 'aula livre (o CTA vivo da linha)',
      locked: false,
      disabled: false,
      variante: 'MuiButton-contained',
      cadeado: false,
      desabilitado: false,
    },
    {
      nome: 'passo quiz-secao (o gate do quiz)',
      locked: true,
      disabled: false,
      variante: 'MuiButton-outlined',
      cadeado: true,
      desabilitado: true,
    },
    {
      nome: 'turno em voo, aula livre (busy trava SEM a pluma do travado)',
      locked: false,
      disabled: true,
      variante: 'MuiButton-contained',
      cadeado: false,
      desabilitado: true,
    },
    {
      nome: 'turno em voo + gate do quiz (os DOIS travam juntos)',
      locked: true,
      disabled: true,
      variante: 'MuiButton-outlined',
      cadeado: true,
      desabilitado: true,
    },
  ] as const;

  for (const celula of CELULAS) {
    it(`(${celula.locked ? 'locked' : 'livre'} × ${celula.disabled ? 'busy' : 'livre'}) — ${celula.nome}`, () => {
      const html = renderComposer({ advanceLocked: celula.locked, advanceDisabled: celula.disabled });
      const tag = advanceButtonTag(html);
      assert.ok(
        html.includes(celula.variante),
        `variante esperada: ${celula.variante}`,
      );
      assert.ok(
        !isDisabled(tag) === !celula.desabilitado,
        `disabled=${celula.desabilitado} esperado na tag do botão (${tag.slice(0, 120)})`,
      );
      assert.equal(
        html.includes('data-testid="LockIcon"'),
        celula.cadeado,
        celula.cadeado
          ? 'o cadeado diz o que trava'
          : 'SEM cadeado: o busy não adota a pluma do gate (busy não é gate)',
      );
      // O startIcon é o COMPLEMENTO do cadeado: onde há cadeado não há seta —
      // o "→" que morava no rótulo velho continua existindo como seta.
      assert.equal(
        html.includes('data-testid="ArrowForwardIcon"'),
        !celula.cadeado,
        'seta e cadeado são exclusivos (o startIcon é um só)',
      );
    });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
 * GAP 2 — o tooltip vazio do passo 'proximo'
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('o tooltip do avanço — o caso vazio que o contrato não mede', () => {
  it("passo 'proximo' (tooltip ''): o botão vivo não ganha aria-label de tooltip vazio", () => {
    // A view passa `advanceTooltip: ''` fora de 'quiz-secao'/'revelar'. Um
    // Tooltip com título vazio que vivesse clonando aria-label="" deixaria
    // o botão com um NOME ACESSÍVEL VAZIO (pior que nenhum: some com o
    // nome do rótulo em leitor de tela). O nome correto continua sendo o
    // rótulo visível "Avançar".
    // OBSERVAÇÃO (comportamento do MUI, medido, NÃO é bug cobrado aqui): o
    // EMBRULHO do Tooltip (span genérico, sem role) nasce com
    // `aria-label=""` — um span sem role com label vazio é ignorado na
    // árvore de acessibilidade, e o NOME do botão vem do texto dele. O que
    // se cobra é o CONTROLE: nenhum aria-label na TAG do <button>.
    const html = renderComposer({ advanceTooltip: '' });
    const tag = advanceButtonTag(html);
    assert.doesNotMatch(tag, /aria-label=""/, 'aria-label vazio no botão vivo');
    assert.doesNotMatch(
      tag,
      /aria-label=/,
      'nenhum aria-label vindo do tooltip: o nome do botão é o rótulo "Avançar" (SC 2.5.3)',
    );
  });

  it("a dica COM texto entra na ÁRVORE do botão como aria-label (o par positivo do caso vazio)", () => {
    // Só a metade vazia deixaria passar um Tooltip que nunca clona nada.
    // O MUI Tooltip NÃO põe o aria-label no <button> — clona o filho direto
    // (`data-mui-internal-clone-element`) e o nome vai no EMBRULHO, que é
    // ancestral do botão (o nome do botão continua sendo o rótulo visível).
    const html = renderComposer({ advanceTooltip: ptBR.lesson.revealTypingTooltip });
    const dica = `aria-label="${ptBR.lesson.revealTypingTooltip}"`;
    const at = html.indexOf(dica);
    assert.notEqual(at, -1, 'a dica da revelação existe como aria-label em cena');
    const wrapper = html.slice(html.lastIndexOf('<span', at), html.indexOf('>', at) + 1);
    assert.ok(
      wrapper.includes('data-mui-internal-clone-element'),
      'o nome vai no embrulho do Tooltip (o clone), como o MUI o emite',
    );
    const botao = html.indexOf('<button', at);
    assert.ok(
      botao > at &&
        !html.slice(at, botao).includes('</span>'),
      'e o botão "Avançar" está DENTRO desse embrulho (o nome cobre o controle)',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * GAP 3 — showAdvance=false em cada passo sem avanço (lado renderizado)
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('showAdvance=false em cada passo sem avanço — o botão nem fantasma existe', () => {
  // Os CINCO passos sem avanço, cada um com a entrada que o produz na
  // máquina (ver tests/lessonAvancarGaps.test.ts para a ponte fonte↔máquina;
  // aqui o composer é step-agnóstico e o que se mede é o HTML).
  const PASSOS_SEM_AVANCO = [
    'nao-comecou',
    'quiz-aula',
    'desafio',
    'concluir',
    'proxima-aula',
  ] as const;

  for (const passo of PASSOS_SEM_AVANCO) {
    it(`passo "${passo}": sem "Avançar", sem LockIcon órfão, só mic + enviar e DUAS cascas`, () => {
      // advanceTooltip: '' é o que a view passa para todos estes passos.
      const html = renderComposer({ showAdvance: false, advanceTooltip: '' });
      // "Avançar" é PREFIXO de "Avançar para a próxima aula" — a varredura é
      // pelo rótulo fechando botão (o mesmo marcador do contrato), que não
      // casa com o botão de próxima aula.
      assert.ok(
        !html.includes(AVANCAR_TXT),
        'o botão de avanço não existe no DOM (nem desabilitado — convite morto)',
      );
      assert.ok(
        !html.includes(AVANCAR),
        `nenhuma ocorrência sequer do rótulo "${AVANCAR}" no HTML do composer`,
      );
      assert.ok(
        !html.includes('data-testid="LockIcon"'),
        'nenhum cadeado órfão de um avanço que não existe',
      );
      // A linha sobra com os DOIS controles de sempre: mic e enviar.
      assert.equal(
        (html.match(/<button/g) ?? []).length,
        2,
        'só mic e enviar ficam na linha',
      );
      // E as cascas do framer: mic e enviar (tabIndex={-1} cada). A TERCEIRA
      // casca, a do avanço, não pode existir nem fantasma.
      assert.equal(
        (html.match(/<span tabindex="-1"/g) ?? []).length,
        2,
        'duas cascas fora do tab (a do avanço não existe)',
      );
    });
  }
});
