/**
 * tests/storybookCoverage.test.ts — o GATE DE COBERTURA de histórias
 * (`tools/storybook-coverage.ts`) sobre árvores de FICHEIROS TEMPORÁRIOS.
 *
 * O que este arquivo trava (e porque é que os fixtures são temporários):
 *
 *   - O gate mede "todos os componentes visuais têm história". Se os testes
 *     medissem `src/` real, este arquivo ficaria VERDE/VERMELHO conforme as
 *     ondas de stories avançam — teste de catálogo, não de código. Então cada
 *     `it` monta a SUA árvore em tmp (via `--dir`) e confere o contrato:
 *     deteta sem história, aceita com história, respeita o NON_VISUAL_ALLOWLIST,
 *     devolve os exit codes certos e fala JSON para a CI.
 *
 *   - O allowlist é testado contra o array EXPORTADO pelo script: cada entrada
 *     vira um ficheiro fixture no caminho que o padrão descreve. Se alguém
 *     adicionar uma exceção nova, este teste passa a cobri-la sozinho — e a
 *     regra "justificação por item" também é verificada aqui (motivo não vazio).
 *
 *   - O subprocesso real (`npx tsx tools/storybook-coverage.ts`) aparece uma
 *     vez só, como smoke do binário que a CI invoca; o resto usa `correr()` com
 *     saída injetada — rápido e determinístico.
 *
 * Sem jsdom, sem electron — node:test puro (convenção de tests/*.test.ts).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import {
  NON_VISUAL_ALLOWLIST,
  analisar,
  correr,
  processarArgs,
  type Relatorio,
  type Saida,
} from '../tools/storybook-coverage';
import { mkTempDir, rmrf, writeFile } from './_helpers/fs';

const APP_DIR = path.resolve(__dirname, '..');
const TIMEOUT_SUBPROCESSO_MS = 120_000;

/* ───────────────────────────── Fixtures ────────────────────────────────── */

/**
 * Componente visual mínimo: função exportada que devolve JSX. É este formato —
 * e não o nome — que o gate classifica como "precisa de história".
 */
const COMPONENTE = `
export function ComHistoria({ rotulo }: { rotulo: string }) {
  return <p>{rotulo}</p>;
}

export default ComHistoria;
`;

/** Componente SEM história (o caso que o gate tem de reprovar). */
const COMPONENTE_SEM_HISTORIA = `
export function SemHistoria() {
  return <div>ainda sem história</div>;
}
`;

/** História no formato do contrato (STORY-SPEC §3): import + component + satisfies. */
const HISTORIA_COMPLETA = `
import type { Meta, StoryObj } from '@storybook/react';
import { ComHistoria } from './ComHistoria';

const meta = {
  title: 'Componentes/Teste/ComHistoria',
  component: ComHistoria,
  tags: ['autodocs'],
} satisfies Meta<typeof ComHistoria>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Padrão: Story = {};
`;

/**
 * Provider de contexto que devolve JSX (`<Ctx.Provider>`): é EXATAMENTE o caso
 * em que a heurística erraria e o NON_VISUAL_ALLOWLIST tem de mandar.
 */
const PROVIDER = `
import { createContext, type ReactElement, type ReactNode } from 'react';

const Ctx = createContext<string>('');

export function ProviderExemplo({ children }: { children: ReactNode }): ReactElement {
  return <Ctx.Provider value="x">{children}</Ctx.Provider>;
}

export default ProviderExemplo;
`;

/** Monta uma árvore temporária, corre `fn` e limpa tudo (git fica limpo). */
async function comArvore<T>(
  ficheiros: Record<string, string>,
  fn: (raiz: string) => Promise<T>,
): Promise<T> {
  const raiz = await mkTempDir('storybook-coverage-');
  try {
    for (const [rel, conteudo] of Object.entries(ficheiros)) {
      await writeFile(path.join(raiz, rel), conteudo);
    }
    return await fn(raiz);
  } finally {
    await rmrf(raiz);
  }
}

interface Corrida {
  code: number;
  stdout: string;
  stderr: string;
}

/** `correr()` com saída capturada (sem subprocesso). */
async function correrCapturando(argv: string[]): Promise<Corrida> {
  const buffers = { stdout: '', stderr: '' };
  const io: Saida = {
    stdout: (t: string) => {
      buffers.stdout += t;
    },
    stderr: (t: string) => {
      buffers.stderr += t;
    },
  };
  const code = await correr(argv, io);
  return { code, ...buffers };
}

/** Linha do relatório para um componente, por nome. */
function componentePorNome(rel: Relatorio, nome: string) {
  return rel.componentes.find((c) => c.nome === nome);
}

/**
 * Traduz um padrão do allowlist num caminho fixture concreto: `**` vira uma
 * pasta, `*`/`?` viram caracteres. Assim o teste cobre QUALQUER entrada que
 * alguém adicione ao NON_VISUAL_ALLOWLIST, sem depender dos nomes atuais.
 */
function caminhoParaPadrao(padrao: string): string {
  return padrao
    .split('/')
    .map((seg) => (seg === '**' ? 'qualquer/pasta' : seg.replace(/\*/g, 'x').replace(/\?/g, 'y')))
    .join('/');
}

/* ─────────────────── 1. deteta componente sem história ─────────────────── */

describe('storybook-coverage: deteta componente sem história', () => {
  it('reprova o componente sem história e aponta caminho + nome', async () => {
    await comArvore(
      {
        'components/chat/SemHistoria.tsx': COMPONENTE_SEM_HISTORIA,
        'lib/logica.ts': 'export const NADA = 1;\n',
      },
      async (raiz) => {
        const rel = await analisar(raiz);

        assert.equal(rel.resumo.total, 1, 'só os .tsx com JSX contam');
        assert.equal(rel.resumo.cobertos, 0);
        assert.equal(rel.resumo.faltando, 1);

        const comp = componentePorNome(rel, 'SemHistoria');
        assert.ok(comp, 'o export visual tem de aparecer no relatório');
        assert.equal(comp.coberto, false);
        assert.equal(comp.historia, null);
        assert.equal(comp.ficheiro, 'components/chat/SemHistoria.tsx');
        assert.equal(comp.area, 'components/chat', 'a área é o diretório do ficheiro');
        assert.deepEqual(rel.emFalta, ['components/chat/SemHistoria.tsx :: SemHistoria']);
      },
    );
  });

  it('exit 1 quando falta alguma história (e a lista sai no stdout)', async () => {
    await comArvore({ 'components/chat/SemHistoria.tsx': COMPONENTE_SEM_HISTORIA }, async (raiz) => {
      const { code, stdout } = await correrCapturando(['--dir', raiz]);
      assert.equal(code, 1, 'falta história → o gate tem de falhar');
      assert.match(stdout, /EM FALTA \(1\)/);
      assert.match(stdout, /components\/chat\/SemHistoria\.tsx :: SemHistoria/);
    });
  });

  it('não conta exports que não devolvem JSX (constantes, estilos, tipos)', async () => {
    await comArvore(
      {
        'components/chat/superficies.tsx': `
export const MARGEM = 8;
export function sombra(): string {
  return '0 0 0 1px red';
}
export interface Props { rotulo: string }
export function Sombra({ rotulo }: Props) {
  return <span>{rotulo}</span>;
}
`,
      },
      async (raiz) => {
        const rel = await analisar(raiz);
        assert.deepEqual(
          rel.componentes.map((c) => c.nome),
          ['Sombra'],
          'só a função que devolve JSX é componente',
        );
      },
    );
  });
});

/* ──────────────────── 2. aceita componente com história ────────────────── */

describe('storybook-coverage: aceita componente com história', () => {
  it('história colocada no formato do contrato cobre o componente', async () => {
    await comArvore(
      {
        'components/chat/ComHistoria.tsx': COMPONENTE,
        'components/chat/ComHistoria.stories.tsx': HISTORIA_COMPLETA,
      },
      async (raiz) => {
        const rel = await analisar(raiz);
        const comp = componentePorNome(rel, 'ComHistoria');
        assert.ok(comp);
        assert.equal(comp.coberto, true);
        assert.equal(comp.historia, 'components/chat/ComHistoria.stories.tsx');
        assert.ok(comp.sinais.length > 0, 'os sinais da cobertura ficam registados');

        const { code } = await correrCapturando(['--dir', raiz]);
        assert.equal(code, 0, '100% coberto → exit 0');
      },
    );
  });

  it('cobre por `component:` no meta e por `typeof Nome` (satisfies Meta<typeof …>)', async () => {
    await comArvore(
      {
        'components/chat/ComHistoria.tsx': COMPONENTE,
        'components/chat/ComHistoria.stories.tsx': `
const meta = { title: 'Componentes/Teste/ComHistoria', component: ComHistoria }
  satisfies Meta<typeof ComHistoria>;
export default meta;
`,
      },
      async (raiz) => {
        const rel = await analisar(raiz);
        const comp = componentePorNome(rel, 'ComHistoria');
        assert.ok(comp);
        assert.equal(comp.coberto, true, 'meta.component + typeof Nome chegam');
      },
    );
  });

  it('cobre por import default com apelido (import Cartao from \'./ComHistoria\')', async () => {
    await comArvore(
      {
        'components/chat/ComHistoria.tsx': COMPONENTE,
        'components/chat/ComHistoria.stories.tsx': `
import Cartao from './ComHistoria';
const meta = { component: Cartao };
export default meta;
`,
      },
      async (raiz) => {
        const rel = await analisar(raiz);
        const comp = componentePorNome(rel, 'ComHistoria');
        assert.ok(comp);
        assert.equal(comp.coberto, true, 'o import default do ficheiro cobre o default export');
      },
    );
  });

  it('cobre por história em src/storybook/foundations/ (casos de documentação)', async () => {
    await comArvore(
      {
        'components/chat/ComHistoria.tsx': COMPONENTE,
        'storybook/foundations/ComHistoria.stories.tsx': `
import { ComHistoria } from '../../components/chat/ComHistoria';
export default { component: ComHistoria };
`,
      },
      async (raiz) => {
        const rel = await analisar(raiz);
        const comp = componentePorNome(rel, 'ComHistoria');
        assert.ok(comp);
        assert.equal(comp.coberto, true);
        assert.equal(comp.historia, 'storybook/foundations/ComHistoria.stories.tsx');
      },
    );
  });

  it('NÃO cobre com a história de OUTRO componente do mesmo diretório', async () => {
    await comArvore(
      {
        'components/chat/SemHistoria.tsx': COMPONENTE_SEM_HISTORIA,
        'components/chat/Outro.tsx': `
export function Outro() {
  return <b>outro</b>;
}
`,
        'components/chat/Outro.stories.tsx': `
import { Outro } from './Outro';
const meta = { component: Outro } satisfies Meta<typeof Outro>;
export default meta;
`,
      },
      async (raiz) => {
        const rel = await analisar(raiz);
        const semHistoria = componentePorNome(rel, 'SemHistoria');
        const outro = componentePorNome(rel, 'Outro');
        assert.ok(semHistoria && outro);
        assert.equal(semHistoria.coberto, false, 'a história do Outro não cobre o SemHistoria');
        assert.equal(outro.coberto, true);
      },
    );
  });
});

/* ─────────────────── 3. respeita o NON_VISUAL_ALLOWLIST ────────────────── */

describe('storybook-coverage: NON_VISUAL_ALLOWLIST', () => {
  it('cada item do allowlist tem padrão E justificação (nunca silenciosa)', () => {
    assert.ok(NON_VISUAL_ALLOWLIST.length > 0, 'o allowlist é declarado no ficheiro do script');
    for (const item of NON_VISUAL_ALLOWLIST) {
      assert.ok(item.padrao.length > 0, 'padrão não pode ser vazio');
      assert.ok(item.motivo.trim().length > 10, `motivo demasiado curto em '${item.padrao}'`);
    }
  });

  it('ficheiro listado é ignorado com o motivo declarado e NÃO conta para o total', async () => {
    // Uma fixture POR CADA entrada do allowlist (caminho derivado do padrão),
    // mais um componente real para o total não ser zero.
    const ficheiros: Record<string, string> = {
      'components/chat/ComHistoria.tsx': COMPONENTE,
      'components/chat/ComHistoria.stories.tsx': HISTORIA_COMPLETA,
    };
    for (const item of NON_VISUAL_ALLOWLIST) {
      ficheiros[caminhoParaPadrao(item.padrao)] = PROVIDER;
    }

    await comArvore(ficheiros, async (raiz) => {
      const rel = await analisar(raiz);

      for (const item of NON_VISUAL_ALLOWLIST) {
        const alvo = caminhoParaPadrao(item.padrao);
        const ignorado = rel.ignorados.find((i) => i.ficheiro === alvo);
        assert.ok(ignorado, `o allowlist tem de ignorar ${alvo}`);
        assert.equal(ignorado.via, 'allowlist');
        assert.equal(ignorado.motivo, item.motivo, 'o relatório mostra a justificação declarada');
        assert.equal(
          rel.componentes.some((c) => c.ficheiro === alvo),
          false,
          `${alvo} não pode contar como componente`,
        );
      }

      assert.equal(rel.resumo.total, 1, 'só o componente real conta');
      assert.equal(rel.resumo.cobertos, 1);
      const { code } = await correrCapturando(['--dir', raiz]);
      assert.equal(code, 0, 'allowlist + coberto → exit 0');
    });
  });

  it('o allowlist não é vacuoso: o MESMO provider fora do padrão conta como visual', async () => {
    await comArvore({ 'components/chat/ProviderLivre.tsx': PROVIDER }, async (raiz) => {
      const rel = await analisar(raiz);
      const comp = componentePorNome(rel, 'ProviderExemplo');
      assert.ok(comp, 'fora do allowlist, a heurística conta-o como visual');
      assert.equal(comp.coberto, false);
      assert.equal(rel.resumo.faltando, 1);
    });
  });

  it('classifica hooks e módulos .ts como não-visuais, com motivo (secção Ignorados)', async () => {
    await comArvore(
      {
        'components/chat/ComHistoria.tsx': COMPONENTE,
        'components/chat/ComHistoria.stories.tsx': HISTORIA_COMPLETA,
        'hooks/useCoisa.ts': 'export function useCoisa(): number {\n  return 1;\n}\n',
        'lib/estado.ts': 'export const ESTADO = { pronto: true };\n',
        'components/chat/soTipos.tsx': 'export interface ApenasTipos { a: string }\n',
      },
      async (raiz) => {
        const rel = await analisar(raiz);
        const porFicheiro = new Map(rel.ignorados.map((i) => [i.ficheiro, i]));

        const hook = porFicheiro.get('hooks/useCoisa.ts');
        assert.ok(hook && /hook/i.test(hook.motivo), 'hook ignorado com motivo de hook');
        assert.equal(hook.via, 'deteccao');

        const modulo = porFicheiro.get('lib/estado.ts');
        assert.ok(modulo && /\.ts/.test(modulo.motivo), 'módulo .ts ignorado com motivo');

        const soTipos = porFicheiro.get('components/chat/soTipos.tsx');
        assert.ok(soTipos && /sem JSX/.test(soTipos.motivo), '.tsx sem JSX ignorado com motivo');

        assert.equal(rel.resumo.total, 1, 'nenhum deles conta para o total');
      },
    );
  });
});

/* ────────────────── 4. exclusões do contrato (fora do gate) ────────────── */

describe('storybook-coverage: exclusões do contrato', () => {
  it('não conta histórias, helpers de história, testes nem o entry main.tsx', async () => {
    await comArvore(
      {
        'main.tsx': 'export default function App() {\n  return <div>entry</div>;\n}\n',
        'components/chat/ComHistoria.tsx': COMPONENTE,
        'components/chat/ComHistoria.stories.tsx': HISTORIA_COMPLETA,
        'components/chat/ajudas.stories.helpers.ts': 'export const X = 1;\n',
        'components/chat/ComHistoria.test.tsx': 'export function Teste() {\n  return <div />;\n}\n',
        'components/chat/ComHistoria.stories.helpers.ts': 'export const Y = 2;\n',
      },
      async (raiz) => {
        const rel = await analisar(raiz);
        assert.deepEqual(
          rel.componentes.map((c) => c.nome),
          ['ComHistoria'],
          'só o componente real é medido',
        );
        const excluidos = new Set(rel.excluidos.map((e) => e.ficheiro));
        assert.ok(excluidos.has('main.tsx'));
        assert.ok(excluidos.has('components/chat/ComHistoria.stories.tsx'));
        assert.ok(excluidos.has('components/chat/ComHistoria.test.tsx'));
        assert.ok(excluidos.has('components/chat/ajudas.stories.helpers.ts'));
        assert.ok(excluidos.has('components/chat/ComHistoria.stories.helpers.ts'));
        for (const e of rel.excluidos) {
          assert.ok(e.motivo.length > 0, 'a exclusão também leva motivo');
        }
      },
    );
  });
});

/* ─────────────────────── 5. re-exports (1 nível) ───────────────────────── */

describe('storybook-coverage: re-exports seguem 1 nível', () => {
  it('export { X } from \'./origem\' conta X e regista a origem', async () => {
    await comArvore(
      {
        'components/x/Origem.tsx': `
export function CompOrigem() {
  return <i>origem</i>;
}
`,
        'components/x/Reexporta.tsx': `
export { CompOrigem } from './Origem';

export function Casca({ children }: { children: React.ReactNode }) {
  return <section>{children}</section>;
}
`,
        'components/x/Origem.stories.tsx': `
import { CompOrigem } from './Origem';
export default { component: CompOrigem };
`,
      },
      async (raiz) => {
        const rel = await analisar(raiz);
        const reexportado = rel.componentes.find(
          (c) => c.ficheiro === 'components/x/Reexporta.tsx' && c.nome === 'CompOrigem',
        );
        assert.ok(reexportado, 'o re-export conta como export visual do ficheiro');
        assert.equal(reexportado.origem, 'components/x/Origem.tsx', 'a origem fica registada');
        assert.equal(reexportado.coberto, true, 'a história do sítio onde ele nasce cobre-o');
        const casca = componentePorNome(rel, 'Casca');
        assert.ok(casca && casca.coberto === false, 'a Casca continua a precisar de história');
      },
    );
  });

  it('para no 2.º nível de re-export (teto do contrato)', async () => {
    await comArvore(
      {
        'components/x/Origem.tsx': `
export function CompOrigem() {
  return <i>origem</i>;
}
`,
        'components/x/Meio.tsx': `
export { CompOrigem } from './Origem';
export function Meio() {
  return <i>meio</i>;
}
`,
        'components/x/Cadeia.tsx': `
export { CompOrigem } from './Meio';
export function Cadeia() {
  return <i>cadeia</i>;
}
`,
      },
      async (raiz) => {
        const rel = await analisar(raiz);
        assert.equal(
          rel.componentes.some((c) => c.ficheiro === 'components/x/Cadeia.tsx' && c.nome === 'CompOrigem'),
          false,
          'Cadeia re-exporta via Meio — 2 saltos, não conta',
        );
        assert.ok(
          rel.componentes.some((c) => c.ficheiro === 'components/x/Meio.tsx' && c.nome === 'CompOrigem'),
          'o 1.º salto (Meio → Origem) conta',
        );
      },
    );
  });
});

/* ─────────────────────────── 6. exit codes ─────────────────────────────── */

describe('storybook-coverage: exit codes', () => {
  it('0 com 100% coberto · 1 com faltas · 0 com --allow-missing', async () => {
    await comArvore(
      {
        'components/chat/ComHistoria.tsx': COMPONENTE,
        'components/chat/ComHistoria.stories.tsx': HISTORIA_COMPLETA,
      },
      async (raizCoberto) => {
        assert.equal((await correrCapturando(['--dir', raizCoberto])).code, 0);
      },
    );

    await comArvore({ 'components/chat/SemHistoria.tsx': COMPONENTE_SEM_HISTORIA }, async (raiz) => {
      assert.equal((await correrCapturando(['--dir', raiz])).code, 1);

      const comFlag = await correrCapturando(['--dir', raiz, '--allow-missing']);
      assert.equal(comFlag.code, 0, '--allow-missing reporta sem falhar');
      assert.match(comFlag.stdout, /EM FALTA/, 'mas as faltas continuam listadas');
    });
  });

  it('2 em erro de uso: opção desconhecida, --dir em falta, --dir inexistente', async () => {
    const desconhecida = await correrCapturando(['--nope']);
    assert.equal(desconhecida.code, 2);
    assert.match(desconhecida.stderr, /Erro:.*--nope|opção desconhecida/);

    const dirEmFalta = await correrCapturando(['--dir']);
    assert.equal(dirEmFalta.code, 2);
    assert.match(dirEmFalta.stderr, /--dir exige um caminho/);

    const dirInexistente = await correrCapturando(['--dir', path.join(APP_DIR, 'nao-existe-xyz')]);
    assert.equal(dirInexistente.code, 2);
    assert.match(dirInexistente.stderr, /não existe/);

    const ajuda = await correrCapturando(['--help']);
    assert.equal(ajuda.code, 0, '--help não é erro de uso');
    assert.match(ajuda.stdout, /uso: npx tsx tools\/storybook-coverage\.ts/);
  });

  it('processarArgs: sem flags o default é src/ da app; flags são apanhadas', () => {
    const vazio = processarArgs([]);
    assert.ok(vazio.opcoes);
    assert.equal(vazio.opcoes.dir, null, 'sem --dir o default é src/ resolvido pela raiz da app');
    assert.equal(vazio.opcoes.json, false);
    assert.equal(vazio.opcoes.allowMissing, false);

    const tudo = processarArgs(['--dir', 'qualquer/lugar', '--json', '--allow-missing']);
    assert.ok(tudo.opcoes);
    assert.equal(tudo.opcoes.dir, 'qualquer/lugar');
    assert.equal(tudo.opcoes.json, true);
    assert.equal(tudo.opcoes.allowMissing, true);
  });
});

/* ───────────────────────────── 7. modo --json ──────────────────────────── */

describe('storybook-coverage: modo --json', () => {
  it('devolve objeto estruturado (resumo/componentes/ignorados/emFalta) para a CI', async () => {
    await comArvore(
      {
        'components/chat/ComHistoria.tsx': COMPONENTE,
        'components/chat/ComHistoria.stories.tsx': HISTORIA_COMPLETA,
        'components/chat/SemHistoria.tsx': COMPONENTE_SEM_HISTORIA,
        'lib/estado.ts': 'export const ESTADO = 1;\n',
      },
      async (raiz) => {
        const { code, stdout, stderr } = await correrCapturando(['--dir', raiz, '--json']);
        assert.equal(code, 1, 'com faltas o exit continua 1 mesmo em JSON');
        assert.equal(stderr, '', 'em --json o stdout é SÓ JSON');

        const dados = JSON.parse(stdout) as Relatorio & { ok: boolean; exitCode: number };
        assert.equal(dados.ok, false);
        assert.equal(dados.exitCode, 1);
        assert.equal(dados.resumo.total, 2);
        assert.equal(dados.resumo.cobertos, 1);
        assert.equal(dados.resumo.faltando, 1);
        assert.equal(dados.resumo.ignorados, 1, 'lib/estado.ts aparece como ignorado');
        assert.deepEqual(dados.emFalta, ['components/chat/SemHistoria.tsx :: SemHistoria']);

        const comHistoria = dados.componentes.find((c) => c.nome === 'ComHistoria');
        assert.ok(comHistoria);
        assert.equal(comHistoria.coberto, true);
        assert.equal(comHistoria.area, 'components/chat');
        assert.equal(comHistoria.historia, 'components/chat/ComHistoria.stories.tsx');
        const ignorado = dados.ignorados.find((i) => i.ficheiro === 'lib/estado.ts');
        assert.ok(ignorado && ignorado.motivo.length > 0);
      },
    );
  });

  it('com tudo coberto: ok=true e exitCode=0 no JSON', async () => {
    await comArvore(
      {
        'components/chat/ComHistoria.tsx': COMPONENTE,
        'components/chat/ComHistoria.stories.tsx': HISTORIA_COMPLETA,
      },
      async (raiz) => {
        const { code, stdout } = await correrCapturando(['--dir', raiz, '--json']);
        const dados = JSON.parse(stdout) as { ok: boolean; exitCode: number };
        assert.equal(code, 0);
        assert.equal(dados.ok, true);
        assert.equal(dados.exitCode, 0);
      },
    );
  });
});

/* ────────────────── 8. smoke do binário (subprocesso real) ─────────────── */

describe('storybook-coverage: subprocesso real', () => {
  it('npx tsx tools/storybook-coverage.ts --json mede a fixture e sai com o exit code certo', async () => {
    await comArvore(
      { 'components/chat/SemHistoria.tsx': COMPONENTE_SEM_HISTORIA },
      async (raiz) => {
        const resultado = await new Promise<{ code: number; stdout: string; stderr: string }>(
          (resolve, reject) => {
            // NODE_TEST_CONTEXT herdado do node:test do PAI faria o processo
            // filho recusar-se a correr — remover, como em tools/t.sh.
            const env = { ...process.env };
            delete env.NODE_TEST_CONTEXT;
            const child = spawn(
              'npx',
              ['--no-install', 'tsx', 'tools/storybook-coverage.ts', '--dir', raiz, '--json'],
              { cwd: APP_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] },
            );
            let stdout = '';
            let stderr = '';
            const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_SUBPROCESSO_MS);
            child.stdout.on('data', (d: Buffer) => {
              stdout += String(d);
            });
            child.stderr.on('data', (d: Buffer) => {
              stderr += String(d);
            });
            child.on('close', (code) => {
              clearTimeout(timer);
              resolve({ code: code ?? 1, stdout, stderr });
            });
            child.on('error', (err) => {
              clearTimeout(timer);
              reject(err);
            });
          },
        );

        assert.equal(resultado.stderr, '');
        assert.equal(resultado.code, 1, 'fixture sem história → exit 1 também no binário');
        const dados = JSON.parse(resultado.stdout) as { resumo: { faltando: number } };
        assert.equal(dados.resumo.faltando, 1);
      },
    );
  });
});