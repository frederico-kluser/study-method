/**
 * tests/engineVocab.test.ts — o vocabulário gerado por máquina (pacote P-05,
 * `docs/16-engine-de-trilha.md` §3.1 e §5.3).
 *
 * Contratos que mordem aqui:
 *   1. O universo de nós vem do enum `ts.SyntaxKind` passado pela TABELA
 *      CANÔNICA do extrator (`extract.kindName`) — sem marcadores de faixa
 *      (`FirstLiteralToken`, `LastToken`, …), sem JSX/Experimental, sem
 *      trivia, sem pontuação. `node:NumericLiteral` precisa existir (a busca
 *      reversa do enum devolveria `FirstLiteralToken`).
 *   2. Toda chave gerada casa com `ATOM_KEY_RE` (importado de `atomKeys.ts`) —
 *      um vocabulário com chave inválida seria consumido em silêncio.
 *   3. O catálogo separa API de linguagem de nome de domínio: estrutura com
 *      receptores (class/object/module) e membros enumerados por
 *      `Object.getOwnPropertyNames` — campos de dados da trilha real (lidos de
 *      `resources/tracks/nodejs-do-zero`) NÃO viram `api:`.
 *   4. A geração é determinística: duas execuções produzem os MESMOS bytes, e
 *      o artefato commitado É a saída byte a byte do gerador no runtime atual
 *      (a prova exigida pelo aceite A-P05-2).
 *   5. COBERTURA DAS EMISSÕES (onda 1): `extractAtoms` rodado sobre o CORPUS
 *      REAL (`resources/tracks/nodejs-do-zero` — solutionCode/starterCode/
 *      testsCode de todo desafio + o código da teoria via `collectLessonCode`)
 *      emite, nos eixos FECHADOS (node/op/decl/global), apenas chaves do
 *      vocabulário ou da lista EXPLÍCITA de exceções sintéticas (que vivem em
 *      `FORBIDDEN_ALWAYS`); no eixo ABERTO `api:` nada do universo fechado
 *      (módulos built-in ∪ catálogo) fica de fora — o resto é universo aberto
 *      declarado (npm/domínio/runtime), porque o vocabulário é o piso de
 *      consciência do LLM, não o teto do gate.
 *
 * Sem rede, sem LLM: só o runtime do Node + os artefatos commitados + o
 * conteúdo commitado da trilha (lido pelo MESMO `loadTrack` do runtime).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  ATOM_KEY_RE,
  AtomKey,
  DECLARATION_KINDS,
  FORBIDDEN_ALWAYS,
  HARNESS_RECEPTIVE_SEED,
  axisOf,
  isAtomKey,
  isForbiddenAlways,
} from '../electron/main/engine/atomKeys';
import { RUNTIME_GLOBALS, extractAtoms } from '../electron/main/engine/extract';
import { collectLessonCode } from '../electron/main/engine/theoryCode';
import { loadTrack } from '../electron/main/content/trackLoader';
import type { LoadedTrack } from '../electron/main/content/trackLoader';
import {
  gerarAtomos,
  gerarCatalogoApi,
  gerarUniversoDecl,
  gerarUniversoGlobais,
  gerarUniversoModulos,
  gerarUniversoNos,
  gerarUniversoOps,
  nomesCanonicosSyntaxKind,
  runtimeDoProcesso,
} from '../electron/main/engine/vocab/generate';
import {
  RECEPTORES_LINGUAGEM,
  RECEPTORES_MODULO,
  type CatalogoApi,
} from '../electron/main/engine/vocab/catalog';

// `t.sh` roda com cwd em app/; ainda assim, ancorar pelo __dirname (padrão do
// repositório, ver tests/runsh-bootstrap.test.ts) deixa os testes robustos.
const VOCAB_DIR = path.resolve(__dirname, '..', 'electron', 'main', 'engine', 'vocab');

interface AtomosJson {
  schema: number;
  node_version: string;
  typescript_version: string;
  axes: { node: string[]; op: string[]; decl: string[]; global: string[]; api: string[] };
  total: number;
}

function lerAtomos(): AtomosJson {
  return JSON.parse(fs.readFileSync(path.join(VOCAB_DIR, 'atoms.json'), 'utf8')) as AtomosJson;
}

function lerCatalogo(): CatalogoApi {
  return JSON.parse(fs.readFileSync(path.join(VOCAB_DIR, 'api-catalog.json'), 'utf8')) as CatalogoApi;
}

/**
 * A trilha REAL usada como corpus de cobertura. Carregada UMA vez (memoizada)
 * com o MESMO `loadTrack` que o runtime usa — a prova vale contra o conteúdo
 * que o produto realmente consome, nunca contra uma fixture que a gente
 * controla.
 */
const TRILHA_CORPUS = path.resolve(__dirname, '..', 'resources', 'tracks', 'nodejs-do-zero');

let trilhaMemo: Promise<LoadedTrack> | null = null;
function carregarTrilhaReal(): Promise<LoadedTrack> {
  trilhaMemo ??= loadTrack(TRILHA_CORPUS);
  return trilhaMemo;
}

/**
 * Campos de dados do corpus REAL — a união das chaves TOP-LEVEL dos JSONs da
 * trilha (track.json, module.json, lesson.json e challenge.json — de aula, de
 * módulo e de proficiência), lidos da trilha JÁ CARREGADA pelo loader. Nenhum
 * deles é API de linguagem; o catálogo precisa provar que o filtro os mantém
 * fora do eixo `api:`.
 *
 * A lista é DERIVADA, nunca digitada: um campo novo que o autor adicionar à
 * trilha entra no teste no MESMO commit — não existe lista hardcoded para
 * dessincronizar do corpus (foi exatamente o que aconteceu com a lista
 * antiga: 2 campos que não existiam e 10 reais omitidos, e o teste passou).
 */
function derivarCamposDeDominio(track: LoadedTrack): string[] {
  const campos = new Set<string>();
  const add = (obj: Record<string, unknown>): void => {
    for (const k of Object.keys(obj)) campos.add(k);
  };
  add(track.root as unknown as Record<string, unknown>);
  for (const mod of track.modules) {
    add(mod.meta as unknown as Record<string, unknown>);
    for (const lesson of mod.lessons) {
      add(lesson.meta as unknown as Record<string, unknown>);
      for (const ch of lesson.challenges) add(ch as unknown as Record<string, unknown>);
    }
    if (mod.challenge) add(mod.challenge as unknown as Record<string, unknown>);
  }
  if (track.proficiency) add(track.proficiency as unknown as Record<string, unknown>);
  return [...campos].sort();
}

/**
 * Colisões LEGÍTIMAS entre nome de campo de domínio e membro de API real.
 * `description` (campo de track.json) coincide com `Symbol.prototype.description`
 * — getter REAL de linguagem, que o catálogo tem de manter; `domain` e `title`
 * (campos de meta de trilha) coincidem com membros próprios REAIS de `process`
 * (`process.domain` — propriedade legada não-enumerável com valor null — e
 * `process.title`), enumerados por `getOwnPropertyNames` como qualquer outro
 * membro. A exceção é do lado da LISTA DE CAMPOS na hora de aplicar o filtro
 * (o membro de API nunca sai do catálogo). Sem esta lista explícita, uma
 * colisão nova faz o teste falhar de propósito — que é o comportamento certo.
 */
const COLISOES_CAMPO_API: ReadonlySet<string> = new Set([
  'description', // = Symbol.prototype.description
  'domain', // = process.domain (membro próprio real do módulo process)
  'title', // = process.title (membro próprio real do módulo process)
]);

/**
 * Exceções DECLARADAS do eixo node: — chaves SINTÉTICAS: o extrator as monta
 * à mão (não saem do enum `ts.SyntaxKind`), então o gerador de vocabulário
 * NUNCA pode produzi-las; por design vivem em `FORBIDDEN_ALWAYS`
 * (`atomKeys.ts`) e nunca no JSON. O teste de cobertura as admite como a
 * única saída legítima do vocabulário nos eixos fechados.
 */
const EXCESSOES_SINTETICAS_NODE: ReadonlySet<AtomKey> = new Set([
  // emitida por extract.ts para `obj[expr]` com chave NÃO literal — não é
  // SyntaxKind; FORBIDDEN_ALWAYS por design (quebra a decidibilidade).
  'node:ComputedNonLiteralAccess',
  // declarada por paridade com a anterior (FORBIDDEN_ALWAYS por design),
  // mesmo que o corpus atual não a emita.
  'node:CommaListExpression',
]);

/** Resultado da coleta de emissões sobre o corpus real. */
interface EmissoesCorpus {
  /** chaves únicas por eixo (`node`, `op`, `decl`, `global`, `api`). */
  porEixo: Map<string, Set<AtomKey>>;
}

/**
 * Roda o EXTRATOR REAL sobre o CORPUS REAL: `extractAtoms` em cada superfície
 * de código da trilha — solutionCode/starterCode/testsCode de TODO desafio
 * (aula, módulo e proficiência) + o código da teoria via `collectLessonCode`
 * (o MESMO caminho que `audit.ts` usa). Se uma chave não aparecer aqui, ela
 * não existe no produto; se aparecer e não estiver no vocabulário, o teste de
 * cobertura precisa saber por quê.
 *
 * Superfícies que NÃO parseiam são puladas (uma chave de código quebrado é
 * defeito de CONTEÚDO, caçado pelo `auditTrack` — fora do contrato deste
 * pacote, que é o vocabulário); os pisos de substância abaixo garantem que a
 * coleta nunca passe por omissão.
 */
function coletarEmissoes(track: LoadedTrack): EmissoesCorpus {
  const porEixo = new Map<string, Set<AtomKey>>();
  const add = (key: AtomKey): void => {
    const eixo = axisOf(key) ?? '?';
    let set = porEixo.get(eixo);
    if (!set) {
      set = new Set<AtomKey>();
      porEixo.set(eixo, set);
    }
    set.add(key);
  };
  const surf = (code: string, ref: string): void => {
    if (code.trim().length === 0) return;
    const r = extractAtoms(code, { fileName: ref });
    if (!r.ok) return;
    for (const k of r.keys) add(k);
  };

  for (const mod of track.modules) {
    for (const lesson of mod.lessons) {
      const refBase = `${mod.meta.slug}/${lesson.meta.slug}`;
      for (const block of collectLessonCode(lesson.meta.theory ?? []).blocks) {
        if (block.isJavaScript) surf(block.code, `${refBase}#teoria`);
      }
      for (const ch of lesson.challenges) {
        const cref = `${refBase}/${ch.slug}`;
        const files = Array.isArray(ch.files) && ch.files.length > 0 ? ch.files : null;
        if (files !== null) {
          for (const f of files) {
            surf(f.starterCode, `${cref}#starter`);
            surf(f.solutionCode, `${cref}#solution`);
          }
        } else {
          surf(ch.starterCode ?? '', `${cref}#starter`);
          surf(ch.solutionCode ?? '', `${cref}#solution`);
        }
        surf(ch.testsCode, `${cref}#tests`);
      }
    }
    if (mod.challenge) {
      const ch = mod.challenge;
      const cref = `modules/${mod.meta.slug}/challenge`;
      surf(ch.starterCode ?? '', `${cref}#starter`);
      surf(ch.solutionCode ?? '', `${cref}#solution`);
      surf(ch.testsCode, `${cref}#tests`);
    }
  }
  if (track.proficiency) {
    const ch = track.proficiency;
    surf(ch.starterCode ?? '', 'proficiency#starter');
    surf(ch.solutionCode ?? '', 'proficiency#solution');
    surf(ch.testsCode, 'proficiency#tests');
  }

  return { porEixo };
}

let emissoesMemo: Promise<EmissoesCorpus> | null = null;
/** A extração sobre o corpus roda UMA vez por execução do arquivo de teste. */
function coletarEmissoesDoCorpus(): Promise<EmissoesCorpus> {
  emissoesMemo ??= carregarTrilhaReal().then(coletarEmissoes);
  return emissoesMemo;
}

describe('engineVocab: universo de nós (A-P05-2)', () => {
  const atomos = lerAtomos();
  const nos = atomos.axes.node;

  it('tem MAIS DE 100 chaves node:', () => {
    assert.ok(nos.length > 100, `esperado > 100 chaves node:, gerado ${nos.length}`);
    assert.equal(nos.filter((k) => k.startsWith('node:')).length, nos.length);
  });

  it('não contém marcador de faixa do enum', () => {
    for (const chave of nos) {
      assert.ok(!/^node:First/.test(chave) && !/^node:Last/.test(chave), `marcador de faixa vazou: ${chave}`);
    }
    assert.ok(!nos.includes('node:FirstLiteralToken'));
    assert.ok(!nos.includes('node:LastToken'));
    assert.ok(!nos.includes('node:FirstStatement'));
  });

  it('contém os kinds reais que a busca reversa do enum sequestraria', () => {
    assert.ok(nos.includes('node:NumericLiteral'));
    assert.ok(nos.includes('node:ArrowFunction'));
    assert.ok(nos.includes('node:IfStatement'));
    assert.ok(nos.includes('node:ExportKeyword'));
    assert.ok(nos.includes('node:EndOfFileToken'));
  });

  it('exclui JSX, Experimental, trivia e pontuação', () => {
    for (const chave of nos) {
      assert.ok(!/jsx/i.test(chave), `JSX vazou: ${chave}`);
      assert.ok(!/experimental/i.test(chave), `Experimental vazou: ${chave}`);
      assert.ok(!/Trivia/.test(chave), `trivia vazou: ${chave}`);
    }
    assert.ok(!nos.includes('node:JsxElement'));
    assert.ok(!nos.includes('node:SingleLineCommentTrivia'));
    assert.ok(!nos.includes('node:PlusToken'), 'pontuação não pode virar node: (vira op:)');
  });

  it('o eixo node: commitado É a saída do gerador (nada digitado à mão)', () => {
    assert.deepEqual(nos, gerarUniversoNos(runtimeDoProcesso()));
    // e cada sufixo é um nome canônico do enum — a prova de que não há chave inventada
    const canonicos = new Set(nomesCanonicosSyntaxKind(runtimeDoProcesso()));
    for (const chave of nos) {
      assert.ok(canonicos.has(chave.slice('node:'.length)), `não é SyntaxKind canônico: ${chave}`);
    }
  });

  it('cobre as chaves node: do harness e das proibições globais (onda 0)', () => {
    const conjunto = new Set(nos);
    for (const chave of HARNESS_RECEPTIVE_SEED) {
      if (chave.startsWith('node:')) {
        assert.ok(conjunto.has(chave), `seed do harness sem chave no vocabulário: ${chave}`);
      }
    }
    for (const chave of ['node:WithStatement', 'node:DebuggerStatement', 'node:LabeledStatement']) {
      assert.ok(conjunto.has(chave), `proibição global sem chave no vocabulário: ${chave}`);
    }
  });
});

describe('engineVocab: toda chave casa com ATOM_KEY_RE', () => {
  it('valida todas as chaves de atoms.json (seis eixos)', () => {
    const atomos = lerAtomos();
    let total = 0;
    for (const [eixo, chaves] of Object.entries(atomos.axes)) {
      for (const chave of chaves) {
        assert.ok(isAtomKey(chave), `chave inválida em ${eixo}: "${chave}"`);
        assert.ok(ATOM_KEY_RE.test(chave), `ATOM_KEY_RE rejeitou "${chave}"`);
        assert.equal(axisOf(chave), eixo, `eixo declarado ${eixo} ≠ eixo real de "${chave}"`);
        total += 1;
      }
    }
    assert.equal(atomos.total, total, 'campo total tem que ser a soma das chaves');
  });

  it('valida todos os caminhos do catálogo (api_paths)', () => {
    const catalogo = lerCatalogo();
    for (const caminho of catalogo.api_paths) {
      assert.ok(isAtomKey(caminho), `caminho inválido: "${caminho}"`);
      assert.equal(axisOf(caminho), 'api');
    }
  });

  it('os universos puros também validam (fail-closed na geração)', () => {
    const runtime = runtimeDoProcesso();
    const todas = [
      ...gerarUniversoNos(runtime),
      ...gerarUniversoOps(runtime),
      ...gerarUniversoDecl(),
      ...gerarUniversoGlobais(runtime),
      ...gerarUniversoModulos(runtime),
    ];
    for (const chave of todas) assert.ok(ATOM_KEY_RE.test(chave), `gerador emitiu chave inválida: "${chave}"`);
  });
});

describe('engineVocab: o catálogo separa API de linguagem de nome de domínio', () => {
  it('tem estrutura que distingue os receptores built-in', () => {
    const catalogo = lerCatalogo();
    assert.ok(catalogo.receivers.length >= 40, `esperado >= 40 receptores, gerado ${catalogo.receivers.length}`);

    const array = catalogo.receivers.find((r) => r.name === 'Array');
    assert.ok(array, 'Array deveria ser um receptor');
    assert.equal(array.kind, 'class');
    assert.ok(array.members.includes('Array.from'), 'estático de classe deveria estar em members');
    assert.ok(array.prototypeMembers.includes('Array.prototype.push'), 'membro de protótipo deveria estar em prototypeMembers');
    assert.ok(catalogo.api_paths.includes('api:Array.prototype.push'));

    const json = catalogo.receivers.find((r) => r.name === 'JSON');
    assert.ok(json && json.kind === 'object');
    assert.equal(json.prototypeMembers.length, 0, 'objeto singleton não tem protótipo');

    const assertMod = catalogo.receivers.find((r) => r.name === 'assert');
    assert.ok(assertMod && assertMod.kind === 'module');
    assert.ok(assertMod.members.includes('assert.equal'));
    assert.ok(catalogo.api_paths.includes('api:assert.equal'));
  });

  it('o filtro existe e funciona: só entram receptores da lista escolhida', () => {
    const catalogo = lerCatalogo();
    const nomesEscolhidos = new Set([
      ...RECEPTORES_LINGUAGEM.map((r) => r.name),
      ...RECEPTORES_MODULO.map((r) => r.name),
    ]);
    for (const receptor of catalogo.receivers) {
      assert.ok(nomesEscolhidos.has(receptor.name), `receptor fora da lista documentada: ${receptor.name}`);
    }
    // `fetch` existe em globalThis (Node ≥ 18) mas NÃO é linguagem — a prova
    // de que o catálogo não é "tudo que está no runtime".
    assert.ok(!catalogo.receivers.some((r) => r.name === 'fetch'));
    assert.ok(!catalogo.receivers.some((r) => r.name === 'URL'));
  });

  it('campos de dados da trilha real não viram api: (lista DERIVADA do corpus)', async () => {
    const catalogo = lerCatalogo();
    const campos = derivarCamposDeDominio(await carregarTrilhaReal());
    assert.ok(campos.length >= 20, `corpus de campos ínfimo (${campos.length}) — trilha vazia?`);
    const nomesReceptores = new Set(catalogo.receivers.map((r) => r.name));
    for (const campo of campos) {
      if (COLISOES_CAMPO_API.has(campo)) continue;
      assert.ok(!nomesReceptores.has(campo), `campo de domínio virou receptor: ${campo}`);
      assert.ok(!catalogo.api_paths.includes(`api:${campo}`), `campo de domínio virou api:: ${campo}`);
      assert.ok(
        !catalogo.api_paths.some((p) => p.endsWith(`.${campo}`)),
        `campo de domínio virou membro de api:: ${campo}`,
      );
    }
    // acesso a campo com receptor local vira a forma `.campo` no extrator —
    // forma que o catálogo rejeita por construção (nenhum caminho começa com api:.)
    for (const caminho of catalogo.api_paths) {
      assert.ok(!caminho.startsWith('api:.'), `forma de campo de dados vazou: ${caminho}`);
    }
  });

  it('o eixo api: de atoms.json = módulos ∪ catálogo (nada inventado)', () => {
    const atomos = lerAtomos();
    const catalogo = lerCatalogo();
    const runtime = runtimeDoProcesso();
    const esperado = new Set([...gerarUniversoModulos(runtime), ...catalogo.api_paths]);
    assert.equal(atomos.axes.api.length, esperado.size);
    for (const chave of atomos.axes.api) assert.ok(esperado.has(chave), `api: fora do universo derivado: ${chave}`);
  });

  it('cobre as chaves api: que o harness usa (onda 0)', () => {
    const atomos = lerAtomos();
    const conjunto = new Set(atomos.axes.api);
    for (const chave of [
      'api:node:test',
      'api:node:assert',
      'api:node:assert/strict',
      'api:assert',
      'api:assert/strict',
      'api:test',
      'api:assert.equal',
      'api:assert.strictEqual',
      'api:assert.deepEqual',
      'api:assert.deepStrictEqual',
      'api:assert.throws',
      'api:assert.ok',
    ]) {
      assert.ok(conjunto.has(chave), `chave api: do harness ausente: ${chave}`);
    }
  });
});

describe('engineVocab: fidelidade dos módulos built-in (P-29 — onda 2)', () => {
  // P-29 fecha o DICIONÁRIO (piso de consciência do LLM), não o gate: o eixo
  // api: continua aberto no validador. O que este bloco prova:
  //   1. cada membro do JSON É o que `Object.getOwnPropertyNames` do MESMO
  //      runtime vê no `require()` real — mesmos filtros do gerador (só
  //      chaves de string, só propriedades próprias), nada digitado à mão e
  //      nada filtrado de forma escondida;
  //   2. o corpus REAL (trilha nodejs-do-zero) só emite `api:<mod>.<membro>`
  //      que está no catálogo — direto (`fs.readFile`) ou como prefixo de uma
  //      cadeia profunda membro-de-membro (`process.env.PORT` → `process.env`).
  // O runtime do teste e o da geração são o MESMO (byte-a-byte, provado no
  // bloco 'determinismo e proveniência') — é isso que torna o require real do
  // teste um oráculo válido para o artefato commitado.

  it('membros de cada módulo do RECEPTORES_MODULO conferem com o require() real (mesmos filtros do gerador)', () => {
    const runtime = runtimeDoProcesso(); // o mesmo runtime que produziu o artefato
    const catalogo = lerCatalogo();
    const porNome = new Map(catalogo.receivers.map((r) => [r.name, r]));
    assert.equal(porNome.size, catalogo.receivers.length, 'nomes de receptor duplicados no catálogo');
    for (const { name, moduleId } of RECEPTORES_MODULO) {
      const receptor = porNome.get(name);
      assert.ok(receptor, `receptor de módulo ausente no catálogo: ${name}`);
      assert.equal(receptor.kind, 'module', `${name} deveria ser kind module`);
      const modulo = runtime.requireModule(moduleId); // require REAL, como na geração
      const esperados = new Set<string>(
        runtime.ownPropertyNames(modulo).map((m) => {
          assert.equal(typeof m, 'string', `chave não-string em ${moduleId}: ${String(m)}`);
          return `${name}.${m}`;
        }),
      );
      // MESMA regra do gerador (catalog.ts): export que é INSTÂNCIA (objeto) com
      // protótipo de superfície real (≠ Object/Function.prototype — `cluster`/
      // `process` são EventEmitters) soma os próprios da CADEIA de protótipos
      // como membros (`cluster.on`, `process.on` — sem segmento `.prototype.`).
      // Export que é CLASSE/FUNÇÃO não caminha (protótipo de classe é
      // superfície de instância, não membro de módulo).
      const prototipoDeObjeto = runtime.getPrototypeOf({});
      const prototipoDeFuncao = runtime.getPrototypeOf(() => undefined);
      if (typeof modulo === 'object' && modulo !== null) {
        let proto = runtime.getPrototypeOf(modulo);
        while (
          proto !== null &&
          proto !== undefined &&
          proto !== prototipoDeObjeto &&
          proto !== prototipoDeFuncao
        ) {
          for (const m of runtime.ownPropertyNames(proto)) esperados.add(`${name}.${m}`);
          proto = runtime.getPrototypeOf(proto);
        }
      }
      assert.deepEqual(
        receptor.members,
        [...esperados].sort(),
        `members de ${name} (require('${moduleId}')) divergem do catálogo — re-gera o vocabulário`,
      );
      assert.equal(receptor.prototypeMembers.length, 0, `módulo ${name} não pode ter protótipo`);
    }
  });

  it('o corpus real só emite api:<mod>.<membro> que está no catálogo (fs.readFile etc.)', async () => {
    const emissoes = await coletarEmissoesDoCorpus();
    const catalogo = lerCatalogo();
    const nomesModulos = new Set(RECEPTORES_MODULO.map((r) => r.name));
    const caminhos = new Set(catalogo.api_paths);

    const emitidas = emissoes.porEixo.get('api') ?? new Set<AtomKey>();
    const diretasFora: string[] = [];
    const profundasSemPrefixo: string[] = [];
    for (const chave of emitidas) {
      const caminho = chave.slice('api:'.length);
      if (!caminho.includes('.')) continue; // specifier de import — universo de módulos
      const partes = caminho.split('.');
      if (!nomesModulos.has(partes[0])) continue; // raiz npm/domínio/global — aberto por design
      if (partes.length === 2) {
        if (!caminhos.has(chave)) diretasFora.push(chave);
      } else {
        const prefixo = `api:${partes[0]}.${partes[1]}`;
        if (!caminhos.has(prefixo)) profundasSemPrefixo.push(chave);
      }
    }
    assert.deepEqual(
      diretasFora,
      [],
      'emissões api:<mod>.<membro> do corpus fora do catálogo (falsa lacuna no dicionário do LLM)',
    );
    assert.deepEqual(
      profundasSemPrefixo,
      [],
      'cadeias api: com raiz de módulo sem o membro de 1º nível no catálogo',
    );

    // Anti-vácuo + prova contra as emissões reais que motivaram P-29: as
    // chaves do corpus citadas na proposta têm de estar no dicionário.
    for (const chave of [
      'api:fs.readFile',
      'api:fs.readFileSync',
      'api:http.createServer',
      'api:crypto.randomUUID',
      'api:cluster.fork',
      'api:cluster.on',
      'api:cluster.isPrimary',
      'api:process.env',
      'api:process.argv',
      'api:process.version',
    ]) {
      assert.ok(caminhos.has(chave), `emissão do corpus sem entrada no catálogo: ${chave}`);
    }
  });
});

describe('engineVocab: determinismo e proveniência', () => {
  it('duas execuções produzem bytes idênticos', () => {
    const runtime = runtimeDoProcesso();
    assert.equal(gerarAtomos(runtime), gerarAtomos(runtime));
    assert.equal(gerarCatalogoApi(runtime), gerarCatalogoApi(runtime));
  });

  it('o artefato commitado É a saída byte a byte do gerador (A-P05-2)', () => {
    const runtime = runtimeDoProcesso();
    const atomosGerados = gerarAtomos(runtime);
    const catalogoGerado = gerarCatalogoApi(runtime);
    const atomosNoDisco = fs.readFileSync(path.join(VOCAB_DIR, 'atoms.json'), 'utf8');
    const catalogoNoDisco = fs.readFileSync(path.join(VOCAB_DIR, 'api-catalog.json'), 'utf8');
    assert.equal(atomosNoDisco, atomosGerados, 'atoms.json está dessincronizado do gerador — re-gera e commita');
    assert.equal(catalogoNoDisco, catalogoGerado, 'api-catalog.json está dessincronizado do gerador — re-gera e commita');
  });

  it('os artefatos carregam as versões de Node e TypeScript que os produziram', () => {
    const atomos = lerAtomos();
    const catalogo = lerCatalogo();
    const runtime = runtimeDoProcesso();
    assert.equal(atomos.node_version, runtime.nodeVersion);
    assert.equal(atomos.typescript_version, runtime.typescriptVersion);
    assert.equal(catalogo.node_version, runtime.nodeVersion);
    assert.equal(catalogo.typescript_version, runtime.typescriptVersion);
    assert.ok(atomos.node_version.startsWith('v'), 'node_version precisa ter o formato vX.Y.Z');
    assert.ok(/^\d+\.\d+\.\d+/.test(atomos.typescript_version), 'typescript_version precisa ter o formato X.Y.Z');
  });

  it('os eixos são ordenados canonicamente (sem ordem de iteração não garantida)', () => {
    const atomos = lerAtomos();
    for (const [eixo, chaves] of Object.entries(atomos.axes)) {
      const ordenado = [...chaves].sort();
      assert.deepEqual(chaves, ordenado, `eixo ${eixo} fora de ordem canônica`);
    }
    const catalogo = lerCatalogo();
    assert.deepEqual(catalogo.api_paths, [...catalogo.api_paths].sort());
  });
});

describe('engineVocab: consistência com o extrator (onda 0)', () => {
  it('todo global que o extrator reconhece está no vocabulário', () => {
    const atomos = lerAtomos();
    const globaisGerados = new Set(atomos.axes.global);
    for (const nome of RUNTIME_GLOBALS) {
      assert.ok(globaisGerados.has(`global:${nome}`), `extrator reconhece global:${nome} mas o vocabulário não`);
    }
    assert.ok(atomos.axes.global.includes('global:console'));
    assert.ok(atomos.axes.global.includes('global:arguments'));
    assert.ok(atomos.axes.global.includes('global:eval'));
  });

  it('os universos op: e decl: cobrem o que o extrator emite', () => {
    const atomos = lerAtomos();
    const ops = new Set(atomos.axes.op);
    const decls = new Set(atomos.axes.decl);
    for (const chave of [
      'op:binary:!==',
      'op:binary:,',
      'op:binary:in',
      'op:binary:instanceof',
      'op:logical:&&',
      'op:logical:??',
      'op:unary:typeof',
      'op:unary:void',
      'op:unary:delete',
      'op:update:++',
      'op:assign:=',
      'op:assign:+=',
      'op:assign:&&=',
    ]) {
      assert.ok(ops.has(chave), `extrator pode emitir ${chave} mas o vocabulário não`);
    }
    for (const kind of DECLARATION_KINDS) {
      assert.ok(decls.has(`decl:${kind}`));
    }
  });

  it('nada além dos seis eixos entra no vocabulário (chaves estranhas são erro)', () => {
    const atomos = lerAtomos();
    for (const chaves of Object.values(atomos.axes)) {
      for (const chave of chaves) assert.ok(isAtomKey(chave));
    }
  });
});

describe('engineVocab: cobertura das emissões sobre a trilha real (onda 1)', () => {
  // Fix onda 1 (revisão adversarial de P-05): o vocabulário era fechado do
  // lado do ARTEFATO mas ninguém provava que o EXTRATOR não emitia chave fora
  // dele. Medido no corpus real: 1 chave sintética fora (`node:ComputedNonLiteralAccess`,
  // que o gerador nunca pode produzir) e o eixo api: aberto por design
  // (`api:Buffer.from`, `api:express`, `api:app.put`, … — ver o teste abaixo).
  // Estes testes atam o vocabulário ao extrator sobre o conteúdo commitado.

  it('todo átomo emitido tem eixo conhecido e o corpus tem substância', async () => {
    const emissoes = await coletarEmissoesDoCorpus();
    // Anti-vácuo: a coleta TEM de ter encontrado código de verdade; se a
    // extração falhar em tudo um dia, o teste precisa falhar, não passar por
    // omissão. Os pisos são conservadores (o corpus real emite ~86 node:,
    // ~24 op:, ~27 global: e ~425 api: hoje).
    assert.ok((emissoes.porEixo.get('node') ?? new Set()).size >= 50, 'corpo ínfimo de node: — coleta vazia?');
    assert.ok((emissoes.porEixo.get('op') ?? new Set()).size >= 5, 'corpo ínfimo de op: — coleta vazia?');
    assert.ok((emissoes.porEixo.get('decl') ?? new Set()).size >= 1, 'corpo ínfimo de decl: — coleta vazia?');
    assert.ok((emissoes.porEixo.get('global') ?? new Set()).size >= 5, 'corpo ínfimo de global: — coleta vazia?');
    assert.ok((emissoes.porEixo.get('api') ?? new Set()).size >= 100, 'corpo ínfimo de api: — coleta vazia?');
    for (const eixo of emissoes.porEixo.keys()) {
      assert.ok(
        // `form:` é o eixo RESERVADO (P-06): bateria FIXA declarativa em
        // form/rules.ts — por design NÃO é gerado para atoms.json (ver
        // cabeçalho do gerador) e tem contrato próprio de cobertura (as
        // chaves form: são as próprias regras da bateria).
        ['node', 'op', 'decl', 'global', 'api', 'form'].includes(eixo),
        `eixo desconhecido emitido pelo extrator: ${eixo}`,
      );
    }
  });

  it('eixos fechados (node/op/decl/global): toda emissão está no vocabulário ou em exceção declarada', async () => {
    const emissoes = await coletarEmissoesDoCorpus();
    const atomos = lerAtomos();

    // As exceções declaradas SÃO as sintéticas do extrator — chaves montadas à
    // mão (não saem do enum), que o gerador nunca pode produzir; por isso
    // vivem em FORBIDDEN_ALWAYS (atomKeys.ts) e nunca no JSON.
    for (const chave of EXCESSOES_SINTETICAS_NODE) {
      assert.ok(isForbiddenAlways(chave), `exceção declarada sem FORBIDDEN_ALWAYS: ${chave}`);
    }

    const vocabulario = new Set<string>();
    for (const eixo of ['node', 'op', 'decl', 'global'] as const) {
      for (const chave of atomos.axes[eixo]) vocabulario.add(chave);
    }

    for (const [eixo, chaves] of emissoes.porEixo) {
      if (eixo === 'api') continue; // aberto por design — teste próprio abaixo
      if (eixo === 'form') continue; // eixo reservado (P-06): bateria fixa em form/rules.ts,
      // nunca gerada para atoms.json — não é contrato deste pacote
      for (const chave of chaves) {
        assert.ok(
          vocabulario.has(chave) || EXCESSOES_SINTETICAS_NODE.has(chave),
          `extrator emitiu ${chave} (eixo fechado ${eixo}) fora do vocabulário e das exceções declaradas`,
        );
      }
    }
  });

  it('api: — nada do universo fechado (módulos ∪ catálogo) ficou de fora; o resto é universo aberto declarado', async () => {
    const emissoes = await coletarEmissoesDoCorpus();
    const atomos = lerAtomos();
    const catalogo = lerCatalogo();
    const runtime = runtimeDoProcesso();

    const vocabularioApi = new Set(atomos.axes.api);
    const nomesReceptores = new Set(catalogo.receivers.map((r) => r.name));
    const nomesBuiltin = new Set(runtime.builtinModules);
    const modulos = new Set(gerarUniversoModulos(runtime));
    const caminhosCatalogo = new Set(catalogo.api_paths);

    const emitidas = emissoes.porEixo.get('api') ?? new Set<AtomKey>();
    const fora = [...emitidas].filter((k) => !vocabularioApi.has(k)).sort();

    // (1) Direção que o GATE precisa: todo átomo do universo FECHADO de api:
    // está coberto. O universo fechado tem DOIS tipos de chave — nome de
    // módulo built-in (o specifier de `import` não relativo, gerado de
    // builtinModules) e caminho do catálogo (raiz = receptor escolhido em
    // RECEPTORES_LINGUAGEM/RECEPTORES_MODULO).
    //
    // O que é UNIVERSO ABERTO por design (desde a sub-tarefa P-29 da onda 2,
    // que fechou os MEMBROS dos módulos built-in escolhidos):
    //   - raiz npm/domínio (`api:express`, `api:app.put`);
    //   - raiz global de runtime sem módulo (`api:Buffer.from`);
    //   - CADEIA PROFUNDA membro-de-membro (`api:process.env.PORT`,
    //     `api:process.argv.slice`) — o PREFIXO de 1º nível (`process.env`,
    //     `process.argv`) é membro do módulo, logo FECHADO; o resto é aberto,
    //     como `api:express.get` (o extrator emite a cadeia inteira).
    // FECHADO de verdade:
    //   - `api:<mod>.<membro>` com raiz de módulo built-in escolhido
    //     (`api:fs.readFile`, `api:http.createServer`) — tem de estar no
    //     vocabulário; membro de fora com raiz de receptor é bug de cobertura.
    for (const chave of fora) {
      const caminho = chave.slice('api:'.length);
      const partes = caminho.split('.');
      const raiz = partes[0];
      if (!nomesReceptores.has(raiz)) continue; // navega no aberto (npm/domínio/global)
      if (partes.length === 2) {
        assert.ok(
          vocabularioApi.has(chave),
          `membro direto de receptor do catálogo fora do vocabulário — o universo fechado tem membro de fora: ${chave}`,
        );
      } else {
        const prefixo = `api:${partes[0]}.${partes[1]}`;
        assert.ok(
          vocabularioApi.has(prefixo),
          `cadeia api: com raiz de receptor sem o membro de 1º nível no vocabulário: ${chave} (prefixo esperado: ${prefixo})`,
        );
      }
    }
    // Specifier de módulo built-in é FECHADO: o vocabulário tem TODOS os
    // builtinModules nas duas grafias (`api:fs` e `api:node:fs`) — se um nome
    // de módulo emitido não estiver lá, é bug de geração.
    for (const chave of fora) {
      const caminho = chave.slice('api:'.length);
      if (caminho.includes('.')) continue; // membro de módulo/objeto → universo aberto
      if (nomesBuiltin.has(caminho) || nomesBuiltin.has(caminho.replace(/^node:/, ''))) {
        assert.ok(vocabularioApi.has(chave), `nome de módulo built-in emitido fora do vocabulário: ${chave}`);
      }
    }

    // (2) Direção documentada (emissível): toda emitida QUE ESTÁ no vocabulário
    // tem origem de máquina — módulo built-in ou caminho do catálogo — nunca
    // chave inventada. (A proveniência do eixo commitado inteiro já é provada
    // em "o eixo api: de atoms.json = módulos ∪ catálogo" acima.)
    for (const chave of emitidas) {
      if (!vocabularioApi.has(chave)) continue;
      assert.ok(
        modulos.has(chave) || caminhosCatalogo.has(chave),
        `chave api: no vocabulário sem origem de máquina (módulo ou catálogo): ${chave}`,
      );
    }
  });
});