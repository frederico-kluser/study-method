/**
 * tests/e2eHarnessIsolation.test.ts — O HARNESS NÃO PODE ATRAPALHAR O DONO.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A QUEIXA, E POR QUE ELA NÃO ERA "O PLAYWRIGHT MOSTRA JANELA"
 * ═══════════════════════════════════════════════════════════════════════════
 * O dono, com estas palavras: os testes *"rodam por cima das minhas janelas
 * atuais, isso me atrapalha de trabalhar"*.
 *
 * A leitura fácil — "o harness abre janela" — está errada, e é por isso que o
 * problema durou: `tests/e2e/helpers.ts` já injeta
 * `STUDY_METHOD_WINDOW_VISIBLE='0'`, e com ele a janela nasce `show:false` e
 * `focusable:false` e nunca é revelada (electron/main/index.ts, ready-to-show).
 * Nenhuma janela de teste aparecia.
 *
 * A que aparecia era a DO DONO. O `helpers.ts` lançava o Electron sem
 * `--user-data-dir`, então TODA spec caía no perfil padrão
 * `~/.config/Electron` — o mesmo do app que ele deixa aberto. O lançamento
 * perdia `app.requestSingleInstanceLock()`, o Electron entregava o sinal
 * `second-instance` à instância VIVA (a dele), e o handler daquela instância
 * chamava `win.focus()`: a janela do dono saltava para a frente. Uma vez por
 * teste, 39 testes por execução.
 *
 * Isto é a mesma família do achado da revisão adversarial ("`launchApp` sem
 * `--user-data-dir` faz as specs disputarem o single-instance lock"), visto
 * pelo outro lado: lá o sintoma era a suíte morrer, aqui é o desktop do dono
 * ser sequestrado. Uma causa, dois estragos.
 *
 * Este arquivo é cerca de FONTE de propósito: as duas propriedades são de
 * CONFIGURAÇÃO DE PROCESSO (argumentos de lançamento e um guard no main), e
 * exercitá-las de verdade exigiria subir Electron — o que este teste existe
 * justamente para tornar desnecessário no caminho rápido. O comportamento em
 * si é coberto pela suíte e2e inteira, que passa a rodar em perfil próprio.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const HELPERS = readFileSync(resolve(HERE, 'e2e/helpers.ts'), 'utf8');
const HELPERS_REAL = readFileSync(resolve(HERE, 'e2e/helpers-real.ts'), 'utf8');
const CLEAN_CLONE = readFileSync(resolve(HERE, 'e2e/e2e-clean-clone.spec.ts'), 'utf8');
const MAIN = readFileSync(resolve(HERE, '../electron/main/index.ts'), 'utf8');

describe('o harness E2E não invade o desktop do dono', () => {
  it('TODO lançador de Electron dos testes usa perfil PRÓPRIO', () => {
    // Um lançador sem `--user-data-dir` compartilha `~/.config/Electron` com o
    // app do dono. Basta um para o sequestro de foco voltar.
    for (const [nome, fonte] of [
      ['tests/e2e/helpers.ts', HELPERS],
      ['tests/e2e/helpers-real.ts', HELPERS_REAL],
      ['tests/e2e/e2e-clean-clone.spec.ts', CLEAN_CLONE],
    ] as const) {
      assert.match(
        fonte,
        /--user-data-dir=\$\{/,
        `${nome} lança o Electron sem perfil próprio: as specs voltam a disputar o ` +
          'single-instance lock com o app do dono, e o second-instance puxa a janela dele',
      );
    }
  });

  it('o perfil do helper padrão é NOVO a cada lançamento (nunca um caminho fixo)', () => {
    // Um diretório fixo faria duas execuções concorrentes colidirem de novo —
    // e o e2e já é singleton de máquina por outros motivos; não vale piorar.
    assert.match(
      HELPERS,
      /mkdtempSync\([\s\S]{0,80}'study-method-e2e-profile-'\)/,
      'o perfil precisa ser um diretório temporário novo por lançamento',
    );
  });

  it('a janela do harness continua nascendo oculta e não-focável', () => {
    // A segunda metade da garantia: mesmo isolado, o processo de teste não pode
    // revelar janela. (Se alguém remover isto, o perfil próprio não salva.)
    assert.match(HELPERS, /STUDY_METHOD_WINDOW_VISIBLE: '0'/);
    assert.match(MAIN, /focusable: windowVisible/);
    assert.match(MAIN, /if \(windowVisible\) win\.show\(\)/);
  });

  it('second-instance NÃO rouba foco quando a janela nasceu invisível', () => {
    // COMENTÁRIO NÃO É CÓDIGO — e esta linha existe porque a primeira versão
    // deste teste reprovou contra o produto CERTO: o cabeçalho do handler cita
    // `win.focus()` ao explicar o defeito, e o `indexOf` casava a MENÇÃO, que
    // vem antes do guard. Medir prosa como se fosse execução é o mesmo vício
    // dos testes vácuos que esta base já reprovou dez vezes, ao contrário.
    const semComentario = MAIN.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const i = semComentario.indexOf("app.on('second-instance'");
    assert.ok(i !== -1, 'o handler de second-instance sumiu');
    const corpo = semComentario.slice(i, semComentario.indexOf('  });', i));
    const guard = corpo.indexOf('if (!windowVisible) return;');
    const foca = corpo.indexOf('win.focus()');
    assert.ok(guard !== -1, 'o guard de janela invisível sumiu do second-instance');
    assert.ok(foca !== -1, 'o handler deixou de focar — o comportamento normal do app se perdeu');
    assert.ok(
      guard < foca,
      'o guard tem de vir ANTES do focus: depois dele o foco já foi roubado',
    );
  });
});
