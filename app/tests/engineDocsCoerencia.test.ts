/**
 * tests/engineDocsCoerencia.test.ts — P-26: a documentação normativa da engine
 * cita só o que existe.
 *
 * O `CONTRIBUTING.md` exige que todo número venha com o comando que o
 * reproduz e que toda afirmação pedagógica tenha origem em `docs/research/`;
 * o `docs/16-engine-de-trilha.md` é o contrato normativo da engine. Este
 * arquivo torna mecânico o que se cobra nos DOCUMENTOS produzidos pelo
 * pacote P-26 (docs/16, research/07, README):
 *
 *   1. GATES — cada gate citado em docs/16 (G-SCHEMA..G-FINAL, G-LINT,
 *      G-TEST, G-BUILD, G-AUDIT e os 5 scripts de gate do repo) existe como
 *      comando EXECUTÁVEL no repositório: scripts de `app/package.json` ou
 *      arquivos de `tests/`; os gates de fase da engine (G-*) têm um teste
 *      dedicado que os menciona (mapa declarado abaixo — estender quando a
 *      bateria crescer).
 *   2. CAMINHOS — todo caminho de arquivo citado no documento normativo
 *      (link markdown relativo OU token de caminho com prefixo conhecido)
 *      existe no disco.
 *   3. L-02..L-05 (porta mínima) — links relativos quebrados (L-02), `{{`
 *      órfão (L-03), newline final (L-04) e tabela markdown malformada
 *      (L-05) conferidos nos arquivos DO PACOTE. O gate-lint completo não
 *      roda no bash 3.2 do macOS (`local -n` em tests/lib/assert.sh —
 *      P-32/P-36 pendentes, worktrees `p32-bash32`/`p36-anti-regressao` não
 *      integradas): LIMITAÇÃO DECLARADA. Quando o bash for ≥ 4.3, este teste
 *      tenta rodar `tests/gate-lint.sh` e exige que nenhum arquivo deste
 *      pacote apareça nas falhas.
 *
 * Os arquivos sob verificação são os que o P-26 produz ou altera.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..', '..');
const APP = path.join(ROOT, 'app');

const DOC16 = path.join(ROOT, 'docs', '16-engine-de-trilha.md');
const RESEARCH07 = path.join(ROOT, 'docs', 'research', '07-engine-de-trilha.md');
const README = path.join(ROOT, 'README.md');

/** Os arquivos que este pacote produz/alterou — escopo das checagens L-02..L-05. */
const ARQUIVOS_DO_PACOTE = [DOC16, RESEARCH07, README];

const PKG = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

function conteudo(caminho: string): string {
  return fs.readFileSync(caminho, 'utf8');
}

// ─────────────────────────────────────────────────────────────── 1. GATES
/**
 * Gates do ORQUESTRADOR/contrato + scripts de gate do repo: cada um precisa
 * existir como comando executável (script de package.json ou arquivo em tests/).
 */
const GATES_COMANDO: Record<string, { tipo: 'npm' | 'arquivo'; alvo: string; nota: string }> = {
  'G-LINT': { tipo: 'npm', alvo: 'lint', nota: 'tsc --noEmit nos dois tsconfigs' },
  'G-TEST': { tipo: 'npm', alvo: 'test', nota: 'bash tools/t.sh tests (node --test via tsx)' },
  'G-BUILD': { tipo: 'npm', alvo: 'build', nota: 'electron-vite build' },
  'G-AUDIT': { tipo: 'npm', alvo: 'engine', nota: 'tsx tools/track-engine/cli.ts audit' },
  'gate-build': { tipo: 'arquivo', alvo: 'tests/gate-build.sh', nota: 'sintaxe e forma' },
  'gate-lint': { tipo: 'arquivo', alvo: 'tests/gate-lint.sh', nota: 'qualidade de texto (L-01..L-06)' },
  'validate': { tipo: 'arquivo', alvo: 'tests/validate.sh', nota: 'contrato I-01..I-43' },
  'smoke': { tipo: 'arquivo', alvo: 'tests/smoke.sh', nota: 'integração ponta a ponta' },
  'spec-conformance': { tipo: 'arquivo', alvo: 'tests/spec-conformance.sh', nota: 'BUILD_SPEC ainda descreve o repo' },
};

/**
 * Gates de FASE da engine citados no `docs/16` (§4/§5): cada um precisa de um
 * arquivo de teste dedicado que o MENCIONE (termo de busca). O mapa é a
 * declaração — um gate novo no documento sem entrada aqui derruba o teste.
 */
const GATES_DE_FASE: Record<string, { arquivos: string[]; termos: string[] }> = {
  'G-SCHEMA': { arquivos: ['tests/engineF0.test.ts'], termos: ['G-SCHEMA'] },
  'G-COVER-PESQ': { arquivos: ['tests/engineF1Research.test.ts'], termos: ['G-COVER-PESQ'] },
  'G-ATOM': { arquivos: ['tests/engineF2Decompose.test.ts'], termos: ['atomicidade', 'atomo-alvo', 'testarAtomicidade'] },
  'G-DAG': { arquivos: ['tests/engineGraph.test.ts', 'tests/engineF3Graph.test.ts'], termos: ['DAG', 'toposort'] },
  'G-TYPE': { arquivos: ['tests/engineF3Graph.test.ts'], termos: ['G-TYPE'] },
  'G-COVER': { arquivos: ['tests/engineF3Graph.test.ts'], termos: ['cobertura', 'G-COVER'] },
  'G-MONO': { arquivos: ['tests/engineFreeze.test.ts'], termos: ['G-MONO', 'monotonicidade'] },
  'G-BUDGET': { arquivos: ['tests/engineBudgetGate.test.ts'], termos: ['budget', 'orçamento', 'A1'] },
  'G-TEST': { arquivos: ['tests/engineExecProofs.test.ts', 'tests/engineF9Verifier.test.ts'], termos: ['prova', 'judge'] },
  'G-FINAL': { arquivos: ['tests/engineMaterialize.test.ts'], termos: ['G-FINAL'] },
};

describe('engineDocsCoerencia · 1 — gates citados em docs/16 existem como comando', () => {
  const doc = conteudo(DOC16);

  it('G-LINT/G-TEST/G-BUILD/G-AUDIT + os 5 scripts de gate existem como comandos executáveis', () => {
    for (const [nome, gate] of Object.entries(GATES_COMANDO)) {
      if (gate.tipo === 'npm') {
        assert.ok(
          typeof PKG.scripts[gate.alvo] === 'string' && PKG.scripts[gate.alvo].length > 0,
          `${nome} → script npm "${gate.alvo}" ausente em app/package.json (${gate.nota})`,
        );
      } else {
        const alvo = path.join(ROOT, gate.alvo);
        assert.ok(fs.existsSync(alvo), `${nome} → arquivo ${gate.alvo} não existe (${gate.nota})`);
        assert.ok(fs.statSync(alvo).isFile(), `${nome} → ${gate.alvo} não é arquivo`);
      }
    }
  });

  it('todo `npm run <script>` citado em docs/16 existe em app/package.json', () => {
    const citados = new Set<string>();
    for (const m of doc.matchAll(/npm run ([A-Za-z0-9@/._-]+)/g)) citados.add(m[1]);
    assert.ok(citados.size > 0, 'esperava encontrar ao menos um `npm run` citado no docs/16');
    for (const script of [...citados].sort()) {
      assert.ok(
        typeof PKG.scripts[script] === 'string',
        `docs/16 cita \`npm run ${script}\` mas app/package.json não tem esse script`,
      );
    }
  });

  it('todo gate de fase G-* citado em docs/16 tem teste dedicado que o menciona', () => {
    const citados = new Set<string>();
    for (const m of doc.matchAll(/\b(G-[A-Z][A-Z0-9-]*)\b/g)) citados.add(m[1]);
    for (const codigo of [...citados].sort()) {
      const entrada = GATES_DE_FASE[codigo];
      assert.ok(entrada, `docs/16 cita ${codigo} sem entrada no mapa GATES_DE_FASE — declarar o teste que o implementa`);
      for (const rel of entrada.arquivos) {
        const caminho = path.join(APP, rel);
        assert.ok(fs.existsSync(caminho), `${codigo} → ${rel} não existe`);
        const corpo = conteudo(caminho);
        assert.ok(
          entrada.termos.some((t) => corpo.toLowerCase().includes(t.toLowerCase())),
          `${codigo} → ${rel} não menciona nenhum dos termos ${entrada.termos.join('|')}`,
        );
      }
    }
  });
});

// ───────────────────────────────────────────────────────────── 2. CAMINHOS
const PREFIXOS_DE_CAMINHO = [
  'app/',
  'docs/',
  'skills/',
  'tests/',
  'tools/',
  'evals/',
  'examples/',
  'BUILD_SPEC.md',
  'CONTRIBUTING.md',
  'README.md',
  'LICENSE',
  'package.json',
  'package-lock.json',
  'install.sh',
  'run.sh',
];

/**
 * Caminhos que o documento cita como INEXISTENTES de propósito — a sentença é
 * "X não existe em `app/node_modules`" (§5.3). Não resolvem no clone limpo.
 */
const CAMINHOS_CITADOS_COMO_AUSENTES = new Set(['app/node_modules', 'node_modules']);

function linksMarkdownRelativos(texto: string): string[] {
  const alvos: string[] = [];
  for (const m of texto.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const alvo = m[1].trim();
    if (/^(https?|mailto):|^#/.test(alvo)) continue;
    alvos.push(alvo.split('#')[0].split('?')[0]);
  }
  return alvos;
}

function tokensDeCaminho(texto: string): string[] {
  const tokens: string[] = [];
  let emBloco = false;
  for (const linha of texto.split('\n')) {
    const abre = /^\s*(```|~~~)/.test(linha);
    if (abre) {
      emBloco = !emBloco;
      continue;
    }
    if (emBloco) continue; // blocos de comando resolvem caminhos a partir do próprio `cd` — não são caminhos do repo
    for (const m of linha.matchAll(/`([^`]+)`/g)) {
      const t = m[1].trim();
      if (CAMINHOS_CITADOS_COMO_AUSENTES.has(t)) continue;
      if (t.includes('*') || t.includes('?')) continue; // glob/pattern (ex.: `app/tests/engine*.test.ts`), não caminho
      if (PREFIXOS_DE_CAMINHO.some((p) => t === p || t.startsWith(p))) tokens.push(t);
    }
  }
  return tokens;
}

/**
 * Abreviações canônicas declaradas pelos documentos do pacote: `docs/16` é o
 * nome curto (declarado no preâmbulo do 07) de `docs/16-engine-de-trilha.md`.
 * Um token de caminho que casa uma abreviação resolve pelo alvo completo.
 */
const ALIASES_DE_CAMINHO: Record<string, string> = {
  'docs/16': 'docs/16-engine-de-trilha.md',
};

/** Basename citado sem pasta resolve na raiz OU em app/ (ex.: `package.json`). */
function caminhoCitadoExiste(alvo: string): boolean {
  if (Object.prototype.hasOwnProperty.call(ALIASES_DE_CAMINHO, alvo)) alvo = ALIASES_DE_CAMINHO[alvo];
  if (alvo.includes('/')) return fs.existsSync(path.resolve(ROOT, alvo));
  return fs.existsSync(path.resolve(ROOT, alvo)) || fs.existsSync(path.resolve(APP, alvo));
}

describe('engineDocsCoerencia · 2 — caminhos citados existem no disco', () => {
  it('todo link markdown relativo dos arquivos do pacote resolve', () => {
    for (const arquivo of [...ARQUIVOS_DO_PACOTE, path.join(ROOT, 'docs', 'research', '06-toolchains.md')]) {
      if (!fs.existsSync(arquivo)) continue; // research/07 nasce neste pacote — verificado em teste próprio
      const base = path.dirname(arquivo);
      for (const alvo of linksMarkdownRelativos(conteudo(arquivo))) {
        const resolvido = path.resolve(base, alvo);
        assert.ok(
          fs.existsSync(resolvido),
          `L-02 (link morto): ${path.relative(ROOT, arquivo)} → ${alvo}`,
        );
      }
    }
  });

  it('todo token de caminho (prefixo conhecido) citado no docs/16 existe', () => {
    for (const alvo of tokensDeCaminho(conteudo(DOC16))) {
      assert.ok(
        caminhoCitadoExiste(alvo),
        `docs/16 cita o caminho \`${alvo}\` que não existe no disco`,
      );
    }
  });

  it('todo token de caminho citado no research/07 existe', () => {
    for (const arquivo of [RESEARCH07]) {
      if (!fs.existsSync(arquivo)) continue;
      for (const alvo of tokensDeCaminho(conteudo(arquivo))) {
        assert.ok(
          caminhoCitadoExiste(alvo),
          `${path.relative(ROOT, arquivo)} cita o caminho \`${alvo}\` que não existe`,
        );
      }
    }
  });
});

// ───────────────────────────────────────────────────────────── 3. L-02..L-05
/** Porta mínima dos checks L-02..L-05 do gate-lint sobre os arquivos do pacote. */
describe('engineDocsCoerencia · 3 — L-02..L-05 nos arquivos do pacote (porta mínima)', () => {
  it('L-03 — nenhum `{{` órfão nos arquivos do pacote', () => {
    for (const arquivo of ARQUIVOS_DO_PACOTE) {
      assert.ok(!conteudo(arquivo).includes('{{'), `L-03: ${path.relative(ROOT, arquivo)} tem '{{'`);
      assert.ok(!conteudo(arquivo).includes('}}'), `L-03: ${path.relative(ROOT, arquivo)} tem '}}'`);
    }
  });

  it('L-04 — newline final em todo arquivo do pacote', () => {
    for (const arquivo of ARQUIVOS_DO_PACOTE) {
      assert.ok(
        conteudo(arquivo).endsWith('\n'),
        `L-04: ${path.relative(ROOT, arquivo)} não termina em newline`,
      );
    }
  });

  it('L-05 — tabelas markdown com linha separadora e colunas consistentes', () => {
    // Porta dos passos 1-3 do checker real (gate-lint.sh L-05): runs de linhas
    // '|' fora de fence, separador |---|---| na 2ª linha, nº de colunas igual;
    // `\|` escapado não conta como separador de coluna.
    const celulas = (l: string): number => {
      let s = l.trim();
      if (s.startsWith('|')) s = s.slice(1);
      if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
      const partes: string[] = [];
      let buf = '';
      let esc = false;
      for (const ch of s) {
        if (esc) {
          buf += ch;
          esc = false;
        } else if (ch === '\\') {
          esc = true;
          buf += ch;
        } else if (ch === '|') {
          partes.push(buf);
          buf = '';
        } else {
          buf += ch;
        }
      }
      partes.push(buf);
      return partes.length;
    };
    const SEP = /^\|(\s*:?-{2,}:?\s*\|)+\s*$/;

    for (const arquivo of ARQUIVOS_DO_PACOTE) {
      const linhas = conteudo(arquivo).split('\n');
      const rel = path.relative(ROOT, arquivo);
      let emFence = false;
      let i = 0;
      while (i < linhas.length) {
        const atual = linhas[i];
        if (/^\s*```/.test(atual)) {
          emFence = !emFence;
          i += 1;
          continue;
        }
        if (emFence || !atual.trimStart().startsWith('|')) {
          i += 1;
          continue;
        }
        const inicio = i;
        const bloco: string[] = [];
        while (i < linhas.length && linhas[i].trimStart().startsWith('|')) {
          bloco.push(linhas[i]);
          i += 1;
        }
        assert.ok(
          bloco.length >= 2,
          `L-05: ${rel}:${inicio + 1} linha de tabela solta (sem cabeçalho + separador)`,
        );
        assert.ok(
          SEP.test(bloco[1].trim()),
          `L-05: ${rel}:${inicio + 2} tabela sem linha separadora |---|---| logo abaixo do cabeçalho`,
        );
        const esperado = celulas(bloco[0]);
        for (let j = 0; j < bloco.length; j += 1) {
          assert.ok(
            celulas(bloco[j]) === esperado,
            `L-05: ${rel}:${inicio + 1 + j} linha de tabela com ${celulas(bloco[j])} coluna(s); o cabeçalho tem ${esperado}`,
          );
        }
      }
    }
  });

  it('L-02 — links relativos dos arquivos do pacote resolvem (repetição explícita do L-02)', () => {
    for (const arquivo of ARQUIVOS_DO_PACOTE) {
      if (!fs.existsSync(arquivo)) continue;
      const base = path.dirname(arquivo);
      for (const alvo of linksMarkdownRelativos(conteudo(arquivo))) {
        const resolvido = path.resolve(base, alvo);
        assert.ok(fs.existsSync(resolvido), `L-02: ${path.relative(ROOT, arquivo)} → ${alvo}`);
      }
    }
  });

  it('gate-lint completo: LIMITAÇÃO DECLARADA no bash 3.2; nos demais, nenhuma falha nos arquivos do pacote', () => {
    const bash = execFileSync('bash', ['--version'], { encoding: 'utf8' });
    assert.ok(/version \d+\.\d+/.test(bash), `bash --version inesperado: ${bash}`);

    const versao = /version (\d+)\.(\d+)/.exec(bash);
    const maior = Number(versao?.[1] ?? 0);
    const menor = Number(versao?.[2] ?? 0);
    const suportaNameref = maior > 4 || (maior === 4 && menor >= 3);

    if (!suportaNameref) {
      // `local -n` (nameref) só existe a partir do bash 4.3; tests/lib/assert.sh e
      // tests/validate.sh usam — o gate inteiro não roda no bash 3.2 do macOS.
      // P-32 (remover local -n) e P-36 (anti-regressão) estão em worktrees não
      // integradas; a cobertura L-02..L-05 do pacote fica na porta mínima acima.
      console.log(
        '[engineDocsCoerencia] LIMITAÇÃO DECLARADA: gate-lint completo não roda no bash 3.2 ' +
          '(local -n em tests/lib/assert.sh/tests/validate.sh — P-32/P-36 pendentes). ' +
          'L-02..L-05 do pacote cobertos pela porta mínima acima.',
      );
      return;
    }

    // bash moderno: roda o gate-lint de verdade e exige que NENHUM arquivo do
    // pacote apareça nas falhas (os vermelhos pré-existentes de outras áreas ficam).
    let saida = '';
    try {
      saida = execFileSync('bash', [path.join('tests', 'gate-lint.sh')], {
        encoding: 'utf8',
        cwd: ROOT,
        timeout: 120_000,
      });
    } catch (erro) {
      saida = String((erro as { stdout?: unknown; stderr?: unknown }).stdout ?? erro);
    }
    const relativos = ARQUIVOS_DO_PACOTE.map((a) => path.relative(ROOT, a));
    for (const linha of saida.split('\n')) {
      for (const rel of relativos) {
        assert.ok(
          !linha.includes(rel) || /passou|OK/.test(linha),
          `gate-lint apontou falha no arquivo do pacote: ${linha.trim()}`,
        );
      }
    }
  });
});