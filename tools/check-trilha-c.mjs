#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Verificação executável Ensina × Presume do docs/20-trilha-c.md (onda 2;
// inventário re-congelado na onda 4 contra o adaptador medido das ondas 3–4).
//
// Node puro (sem libs). Uso:
//   node tools/check-trilha-c.mjs [caminho-do-doc] [--so-doc] [--disco DIR]
//
// DUAS METADES, e a segunda nasceu porque a primeira mentia sozinha (medido em
// 2026-09-22): com 113 das 115 aulas do disco em ESQUELETO — teoria placeholder,
// zero quiz, zero desafio — este script imprimia "VERDE" porque lia exatamente
// UM arquivo: o próprio documento. Contrato conferido contra si mesmo não é
// gate. Agora:
//   (1) DOC   — o contrato consigo mesmo (I12/LACUNA/VOCAB/A7/A6/ESTRUTURA);
//   (2) DISCO — o contrato contra `app/resources/tracks/c-iniciante` (D1-D7).
// `--so-doc` volta ao comportamento antigo, e é o único jeito de pular o disco.
//
// O que reprova (docs/20 §"A verificação"):
//   I12    — slug de aula repetido no mesmo curso
//   LACUNA — `Presume` apontando para aula POSTERIOR ou INEXISTENTE (penhasco)
//   VOCAB  — chave em `Ensina` que NÃO está no inventário congelado do adaptador
//            C (fail-closed)
//   A7     — mais de 2 construções numa aula que NÃO é consolidação
//            (a regra do par; chaves marcadas "derivada:" não contam — mapa
//            de derivadas declarado no doc, §"A regra do par")
//   A6     — aula produtiva que não introduz nenhuma construção sem o marcador
//            `[pendente: …]` (mecanismo mantido; a espinha da onda 4 está SEM
//            células pendentes — docs/20 §8.2)
//   ESTRUTURA — 7 módulos com 21+12+13+15+21+16+17 = 115 aulas, numeradas 1..N
//
// FONTE DA VERDADE DO INVENTÁRIO (conferida olho nu nesta execução; se o
// adaptador mudar, atualize AQUI e o §8 do docs/20 juntos):
//   - app/electron/main/engine/lang/c.ts          → cInventory() (34 kinds),
//     cConstructKey() (eixos node:/decl:/op:/global:/api:) e
//     C_DEFAULT_RUNTIME = 'cc-c11'
//   - app/electron/main/engine/vocab/c/extract_ast.py → _EMITIDOS,
//     _TRANSPARENTES, _familia_do_operador + os guards de tagUsed/macro
//   - app/electron/main/engine/atomKeys.ts        → C_HARNESS_RECEPTIVE_SEED
//     (19 chaves, medida nas ondas 3–4 — a semente NÃO é vocabulário de
//     `Ensina`; o que ela perdoa é envelope do harness)
// O inventário completo e o status de cada chave estão no §8 do docs/20
// (congelado) — este script é o guard executável do mesmo contrato.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const argv = process.argv.slice(2);
const soDoc = argv.includes('--so-doc');
const idxDisco = argv.indexOf('--disco');
const posicionais = argv.filter((a, i) => !a.startsWith('--') && i !== idxDisco + 1);
const docPath = posicionais[0] ? resolve(posicionais[0]) : join(repoRoot, 'docs', '20-trilha-c.md');
const discoDir =
  idxDisco >= 0 && argv[idxDisco + 1]
    ? resolve(argv[idxDisco + 1])
    : join(repoRoot, 'app', 'resources', 'tracks', 'c-iniciante');

// ── O inventário CONGELADO (fonte: cInventory() de lang/c.ts) ────────────────
// 34 kinds — os 28 da onda 2 + os 6 medidos na onda 3 (RecordDecl, MemberExpr,
// TypedefDecl, ConditionalOperator, SwitchStmt, CStyleCastExpr). Se o
// adaptador mudar, atualize AQUI e o §8 do docs/20 juntos.
const NODE_KINDS = [
  'ApiRef', 'ArraySubscriptExpr', 'BinaryOperator', 'BreakStmt', 'CStyleCastExpr',
  'CallExpr', 'CharacterLiteral', 'CompoundAssignOperator', 'CompoundStmt',
  'ConditionalOperator', 'ContinueStmt', 'DeclRefExpr', 'DeclStmt', 'DoStmt',
  'FloatingLiteral', 'ForStmt', 'FunctionDecl', 'GlobalRef', 'IfStmt',
  'IncludeDirective', 'IndirectCall', 'InitListExpr', 'IntegerLiteral', 'MemberExpr',
  'ParmVarDecl', 'RecordDecl', 'ReturnStmt', 'StringLiteral', 'SwitchStmt',
  'TypedefDecl', 'UnaryExprOrTypeTraitExpr', 'UnaryOperator', 'VarDecl', 'WhileStmt',
];

// Fonte: cConstructKey() (c.ts) + _familia_do_operador (extract_ast.py).
const DECL_KINDS = ['func', 'var']; // FunctionDecl → func, VarDecl → var
const OP_FAMILIES = {
  assign: ['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='],
  binary: ['+', '-', '*', '/', '%', '<', '>', '<=', '>=', '==', '!=', '&', '|', '^', '<<', '>>'],
  logical: ['&&', '||'],
  unary: ['!', '+', '-', '~', '&', '*', 'sizeof'],
  update: ['++', '--'],
};
const GLOBALS = ['stdin', 'stdout', 'stderr'];
const API_RE = /^[A-Za-z_][A-Za-z0-9_]*$/; // eixo aberto: toda função externa

function buildVocabulary() {
  const valid = new Set();
  for (const k of NODE_KINDS) valid.add(`node:${k}`);
  for (const k of DECL_KINDS) valid.add(`decl:${k}`);
  for (const [fam, ops] of Object.entries(OP_FAMILIES)) {
    for (const op of ops) valid.add(`op:${fam}:${op}`);
  }
  for (const g of GLOBALS) valid.add(`global:${g}`);
  return valid;
}

// Eixos que carregam CHAVE (o `term:` é prosa de outro módulo e não é chave).
const KEY_AXIS_RE = /(?:^|[\s(])((?:node|decl|op|api|global):[^\s`)\],;]*)/g;

function isValidKey(key, vocab) {
  if (vocab.has(key)) return true;
  if (key.startsWith('api:')) return API_RE.test(key.slice(4));
  return false;
}

// ── Parse da tabela markdown, ciente de `|` DENTRO de crases ─────────────────
// (o doc tem células como `` `Nome: Ana | Idade: 20` `` e `\|\|` escapado.)
function splitRow(line) {
  const cells = [];
  let cell = '';
  let inCode = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '`') { inCode = !inCode; cell += ch; continue; }
    if (ch === '\\' && line[i + 1] === '|' && !inCode) { cell += '|'; i++; continue; }
    if (ch === '|' && !inCode) { cells.push(cell.trim()); cell = ''; continue; }
    cell += ch;
  }
  cells.push(cell.trim());
  return cells;
}

function extractKeys(ensinaCell, vocab) {
  // 1. chaves marcadas como DERIVADA (regra do par) não contam para A7.
  const semDerivadas = ensinaCell.replace(/derivadas?\s*:[^)]*\)/g, ')');
  // 2. candidatos: só o que casa com um eixo de chave. Menções ao EIXO em si
  //    (`node:`, `decl:`, `op:binary:` — sem o valor depois do último `:`) são
  //    prosa, não chave.
  const found = [];
  for (const m of semDerivadas.matchAll(/`([^`]+)`/g)) {
    const span = m[1].replace(/\\/g, '');
    for (const km of span.matchAll(KEY_AXIS_RE)) {
      const cand = km[1].replace(/[.,;:]+$/, '');
      const parts = cand.split(':');
      // menção ao EIXO a seco (`node:`, `decl:`) — prosa, não chave
      if (parts.length < 2 || parts[1] === '') continue;
      // menção à FAMÍLIA a seco (`op:binary:`) — prosa, não chave
      if (parts[0] === 'op' && (parts.length < 3 || parts[2] === '')) continue;
      found.push(cand);
    }
  }
  // 3. dedupe preservando a ordem.
  return [...new Set(found)];
}

/**
 * As chaves que a célula `Ensina` realmente INTRODUZ — o insumo de D6.
 *
 * Diferente de `extractKeys` (que alimenta A7/VOCAB e conta o TETO DO PASSO):
 * aqui saem também as chaves qualificadas como **"em forma nova"**, que é a
 * convenção do doc para "esta chave JÁ foi ensinada e reaparece noutra forma".
 * Medido em 2026-09-22 na aula 20 do M1 (`uma-letra-e-um-numero`): a célula diz
 * "`node:CharacterLiteral` (a letra que é número; `decl:var` **em forma nova**: o
 * tipo `char` …)" e o `lesson.json` declara SÓ o `node:CharacterLiteral` — e está
 * certo, porque `decl:var` nasceu na aula 7 e re-declará-la diria que ela é nova.
 * Sem este filtro, D6 acusaria a aula correta.
 *
 * A janela é de 80 caracteres DEPOIS do fechamento da crase da chave: a
 * qualificação, na escrita do doc, vem sempre colada na chave que ela qualifica.
 */
function chavesIntroduzidas(ensinaCell, vocab) {
  const todas = extractKeys(ensinaCell, vocab);
  if (!/em forma nova/.test(ensinaCell)) return todas;
  return todas.filter((key) => {
    let from = 0;
    let achou = false;
    for (;;) {
      const i = ensinaCell.indexOf(key, from);
      if (i < 0) break;
      achou = true;
      const janela = ensinaCell.slice(i + key.length, i + key.length + 80);
      if (!/em forma nova/.test(janela)) return true; // esta menção INTRODUZ
      from = i + key.length;
    }
    // Chave cuja ÚNICA menção (ou todas elas) vem qualificada como "em forma
    // nova" NÃO é introduzida aqui. `achou === false` só acontece se a chave
    // veio de um span que o texto cru não contém — nesse caso mantém, porque o
    // silêncio favorece o check e não o conteúdo.
    return !achou;
  });
}

function parseDoc(text) {
  const lines = text.split('\n');
  const modules = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const mod = line.match(/^#### Módulo (\d+) — `([a-z0-9-]+)` \((\d+) aulas\)/);
    if (mod) {
      current = { num: Number(mod[1]), slug: mod[2], declared: Number(mod[3]), line: i + 1, lessons: [] };
      modules.push(current);
      continue;
    }
    if (!current) continue;
    if (!line.startsWith('|')) {
      // fim da tabela do módulo: uma linha em branco depois da tabela encerra
      if (current.lessons.length > 0 && line.trim() === '') current = null;
      continue;
    }
    const cellsRaw = splitRow(line);
    if (cellsRaw.length < 7) continue; // | # | slug | Ensina | Presume | Quiz | Desafio |
    // o split produz uma célula vazia antes do "|" inicial
    const cells = cellsRaw[0] === '' ? cellsRaw.slice(1) : cellsRaw;
    if (cells.length < 6) continue;
    if (!/^\d+$/.test(cells[0])) continue; // cabeçalho/separador
    current.lessons.push({
      num: Number(cells[0]),
      slug: (cells[1].match(/`([^`]+)`/) || [])[1] || '',
      title: cells[1],
      ensina: cells[2],
      presume: cells[3],
      line: i + 1,
    });
  }
  return modules;
}

// ── A verificação ─────────────────────────────────────────────────────────────
const errors = [];
const warn = [];
function err(rule, line, msg) { errors.push(`[${rule}] linha ${line}: ${msg}`); }

const text = readFileSync(docPath, 'utf8');
const modules = parseDoc(text);
const vocab = buildVocabulary();

// ESTRUTURA: 7 módulos, contagens do doc.
const EXPECTED = [21, 12, 13, 15, 21, 16, 17];
if (modules.length !== 7) {
  err('ESTRUTURA', 0, `esperados 7 módulos, encontrei ${modules.length}`);
}
modules.forEach((mod, idx) => {
  if (mod.num !== idx + 1) err('ESTRUTURA', mod.line, `módulo fora de ordem: #${mod.num}`);
  if (mod.lessons.length !== mod.declared) {
    err('ESTRUTURA', mod.line, `módulo ${mod.num} declara ${mod.declared} aulas mas a tabela tem ${mod.lessons.length}`);
  }
  if (EXPECTED[idx] !== undefined && mod.lessons.length !== EXPECTED[idx]) {
    err('ESTRUTURA', mod.line, `módulo ${mod.num} tem ${mod.lessons.length} aulas; a espinha espera ${EXPECTED[idx]}`);
  }
  mod.lessons.forEach((lesson, j) => {
    if (lesson.num !== j + 1) err('ESTRUTURA', lesson.line, `aula #${lesson.num} fora de sequência no módulo ${mod.num}`);
    if (!lesson.slug) err('ESTRUTURA', lesson.line, `aula ${lesson.num} do módulo ${mod.num} sem slug`);
  });
});

// Índice global de slugs (ordem da cadeia = ordem das tabelas).
const order = [];
const slugIndex = new Map();
for (const mod of modules) {
  for (const lesson of mod.lessons) {
    if (slugIndex.has(lesson.slug)) {
      err('I12', lesson.line, `slug repetido: \`${lesson.slug}\` (já na linha ${slugIndex.get(lesson.slug).line})`);
    } else {
      slugIndex.set(lesson.slug, lesson);
      order.push(lesson);
    }
  }
}

let countableTotal = 0;
let pendingCells = 0;
let consolidated = 0;

for (const mod of modules) {
  for (const lesson of mod.lessons) {
    const isCons = /^\s*cons\.\s*—/.test(lesson.ensina);
    if (isCons) consolidated++;

    // VOCAB — toda chave em `Ensina` tem de estar no inventário congelado.
    const keys = extractKeys(lesson.ensina, vocab);
    for (const key of keys) {
      if (!isValidKey(key, vocab)) {
        err('VOCAB', lesson.line, `\`${key}\` em \`${lesson.slug}\` não é emitida pelo inventário congelado (docs/20 §8; c.ts cInventory()/cConstructKey())`);
      }
    }
    countableTotal += keys.length;

    // A7 — regra do par (só aulas que não são consolidação).
    if (!isCons && keys.length > 2) {
      err('A7', lesson.line, `\`${lesson.slug}\` lista ${keys.length} construções (${keys.join(', ')}) — teto de 2`);
    }

    // A6 — aula produtiva precisa introduzir algo, ou declarar pendência.
    const pendente = lesson.ensina.includes('[pendente:');
    if (pendente) pendingCells++;
    if (!isCons && keys.length === 0 && !pendente) {
      err('A6', lesson.line, `\`${lesson.slug}\` não é consolidação e não introduz nenhuma construção`);
    }
    if (isCons && keys.length === 0 && !pendente && !/term:|projeto|leitura|composição|compilação/.test(lesson.ensina)) {
      warn.push(`linha ${lesson.line}: consolidação \`${lesson.slug}\` sem chave nem degrau visível — confira`);
    }

    // LACUNA — `Presume` aponta para aula posterior ou inexistente.
    const presume = lesson.presume.trim();
    if (presume !== '' && presume !== 'nada') {
      let rest = presume;
      // faixa "`X` a `Y`" — o módulo inteiro entre as duas aulas é pressuposto
      const range = rest.match(/`([^`]+)`\s+a\s+`([^`]+)`/);
      if (range) {
        const [aSlug, bSlug] = [range[1], range[2]];
        const a = slugIndex.get(aSlug);
        const b = slugIndex.get(bSlug);
        if (!a) err('LACUNA', lesson.line, `\`${lesson.slug}\` presume faixa começando em aula inexistente: \`${aSlug}\``);
        if (!b) err('LACUNA', lesson.line, `\`${lesson.slug}\` presume faixa terminando em aula inexistente: \`${bSlug}\``);
        if (a && b) {
          if (order.indexOf(a) >= order.indexOf(lesson)) {
            err('LACUNA', lesson.line, `\`${lesson.slug}\` presume faixa que começa NELA ou depois: \`${aSlug}\``);
          }
          if (order.indexOf(b) >= order.indexOf(lesson)) {
            err('LACUNA', lesson.line, `\`${lesson.slug}\` presume faixa que termina NELA ou depois: \`${bSlug}\``);
          }
        }
        rest = rest.replace(range[0], '');
      }
      for (const m of rest.matchAll(/`([^`]+)`/g)) {
        const slug = m[1];
        const target = slugIndex.get(slug);
        if (!target) {
          err('LACUNA', lesson.line, `\`${lesson.slug}\` presume aula inexistente: \`${slug}\``);
        } else if (order.indexOf(target) >= order.indexOf(lesson)) {
          err('LACUNA', lesson.line, `\`${lesson.slug}\` presume aula POSTERIOR: \`${slug}\``);
        }
      }
    }
  }
}

// ── (2) A METADE DO DISCO — D1-D7 ────────────────────────────────────────────
//
// O que cada regra reprova, e por que ela existe (cada uma nasceu de um defeito
// MEDIDO no dia 2026-09-22, não de imaginação):
//   D1 aula do doc que não existe no disco
//   D2 aula no disco que o doc não declara
//   D3 ordem do `lessons[]` do module.json diferente da ordem da tabela do doc
//   D4 aula sem desafio — o defeito que deixava o aluno CONCLUIR 113 aulas vazias
//      em 113 cliques (o app não bloqueia a conclusão de aula sem desafio)
//   D5 aula ESQUELETO: nenhum bloco cercado com tag `c` na teoria, ou a teoria é
//      o placeholder de autoria (o aluno lia nota interna do repositório)
//   D6 chave que o doc declara em `Ensina` e o disco não declara em `introduces`
//   D7 módulo que o doc lista e o disco não tem (ou o contrário)
const disco = { rodou: false, aulas: 0, esqueletos: 0, semDesafio: 0 };
if (!soDoc) {
  const trackJson = join(discoDir, 'track.json');
  if (!existsSync(trackJson)) {
    err('D7', 0, `--disco ${discoDir} não tem track.json (use --so-doc para conferir só o documento)`);
  } else {
    disco.rodou = true;
    const track = JSON.parse(readFileSync(trackJson, 'utf8'));
    const modulosNoDisco = Array.isArray(track.modules) ? track.modules : [];
    const modulosNoDoc = modules.map((m) => m.slug);
    for (const slug of modulosNoDoc) {
      if (!modulosNoDisco.includes(slug)) err('D7', 0, `módulo \`${slug}\` está no doc e não no track.json`);
    }
    for (const slug of modulosNoDisco) {
      if (!modulosNoDoc.includes(slug)) err('D7', 0, `módulo \`${slug}\` está no track.json e não no doc`);
    }

    for (const mod of modules) {
      const modDir = join(discoDir, 'modules', mod.slug);
      const modJson = join(modDir, 'module.json');
      if (!existsSync(modJson)) {
        err('D7', mod.line, `módulo \`${mod.slug}\` sem module.json no disco`);
        continue;
      }
      const meta = JSON.parse(readFileSync(modJson, 'utf8'));
      const noDisco = Array.isArray(meta.lessons) ? meta.lessons : [];
      const noDoc = mod.lessons.map((l) => l.slug);

      // D3 — a ordem é conteúdo: o orçamento cumulativo é uma dobra sobre ela.
      if (noDisco.join(',') !== noDoc.join(',')) {
        const faltando = noDoc.filter((s) => !noDisco.includes(s));
        const sobrando = noDisco.filter((s) => !noDoc.includes(s));
        if (faltando.length > 0) err('D1', mod.line, `módulo \`${mod.slug}\`: aula(s) do doc ausente(s) do module.json: ${faltando.join(', ')}`);
        if (sobrando.length > 0) err('D2', mod.line, `módulo \`${mod.slug}\`: aula(s) no module.json que o doc não declara: ${sobrando.join(', ')}`);
        if (faltando.length === 0 && sobrando.length === 0) {
          err('D3', mod.line, `módulo \`${mod.slug}\`: a ORDEM do module.json difere da tabela do doc (doc: ${noDoc.join(' → ')})`);
        }
      }

      for (const lesson of mod.lessons) {
        const lessonJson = join(modDir, 'lessons', lesson.slug, 'lesson.json');
        if (!existsSync(lessonJson)) {
          err('D1', lesson.line, `aula \`${mod.slug}/${lesson.slug}\` não existe no disco`);
          continue;
        }
        disco.aulas++;
        const L = JSON.parse(readFileSync(lessonJson, 'utf8'));

        // D5 — esqueleto. Duas assinaturas: o summary de autoria e a ausência de
        // qualquer bloco cercado com tag `c` na teoria.
        const teoria = Array.isArray(L.theory) ? L.theory : [];
        const markdown = teoria.map((s2) => String(s2.markdown ?? '')).join('\n');
        const temBlocoC = /```c\b/.test(markdown);
        const ehPlaceholder = String(L.summary ?? '').startsWith('Aula em esqueleto');
        if (ehPlaceholder || !temBlocoC) {
          disco.esqueletos++;
          err('D5', lesson.line, `aula \`${mod.slug}/${lesson.slug}\` é ESQUELETO no disco (${ehPlaceholder ? 'summary de autoria' : 'nenhum bloco cercado com tag c na teoria'}) — o aluno leria nota interna do repositório no lugar da aula`);
        }

        // D4 — aula sem desafio não é aula (o app não bloqueia a conclusão dela).
        const desafios = Array.isArray(L.challenges) ? L.challenges : [];
        if (desafios.length === 0) {
          disco.semDesafio++;
          err('D4', lesson.line, `aula \`${mod.slug}/${lesson.slug}\` sem desafio (challenges[] vazio)`);
        }
        for (const ch of desafios) {
          const chJson = join(modDir, 'lessons', lesson.slug, 'challenges', ch, 'challenge.json');
          if (!existsSync(chJson)) err('D4', lesson.line, `aula \`${mod.slug}/${lesson.slug}\` declara o desafio \`${ch}\` e ele não existe no disco`);
        }

        // D6 — a chave do doc tem de estar declarada no disco. O contrário NÃO
        // é erro: o disco declara também as DERIVADAS da regra do par
        // (`introduces.derived`), que a célula do doc resume em prosa.
        const declaradas = new Set([
          ...(L.introduces?.productive ?? []),
          ...(L.introduces?.receptive ?? []),
        ]);
        for (const key of chavesIntroduzidas(lesson.ensina, vocab)) {
          if (!isValidKey(key, vocab)) continue; // já reportado por VOCAB
          if (!declaradas.has(key)) {
            err('D6', lesson.line, `aula \`${mod.slug}/${lesson.slug}\`: o doc declara \`${key}\` em Ensina e o lesson.json não o declara em introduces`);
          }
        }
      }
    }
  }
}

// ── Veredito ──────────────────────────────────────────────────────────────────
const totalAulas = modules.reduce((n, m) => n + m.lessons.length, 0);
if (errors.length > 0) {
  console.error(`✗ check-trilha-c: ${errors.length} problema(s) em ${docPath}\n`);
  for (const e of errors) console.error('  ' + e);
  console.error(`\naulas: ${totalAulas} · chaves contadas: ${countableTotal} · consolidações: ${consolidated} · células pendentes: ${pendingCells}`);
  if (disco.rodou) console.error(`disco (${discoDir}): ${disco.aulas} aulas lidas · ${disco.esqueletos} esqueleto(s) · ${disco.semDesafio} sem desafio`);
  process.exit(1);
}

console.log(`✓ check-trilha-c: VERDE`);
console.log(`  metades rodadas: doc${disco.rodou ? ' + DISCO (' + discoDir + ')' : ' SÓ (--so-doc: o disco NÃO foi conferido)'}`);
console.log(`  módulos: ${modules.length} · aulas: ${totalAulas} (esperado 115)`);
if (disco.rodou) console.log(`  disco: ${disco.aulas} aulas lidas · ${disco.esqueletos} esqueleto(s) · ${disco.semDesafio} sem desafio`);
console.log(`  chaves congeladas contadas: ${countableTotal} · consolidações: ${consolidated}/${totalAulas} · células [pendente:]: ${pendingCells}`);
console.log(`  inventário: ${NODE_KINDS.length} kinds node: · decl: ${DECL_KINDS.join('/')} · op:assign ${OP_FAMILIES.assign.length} ops · op:binary ${OP_FAMILIES.binary.length} ops · op:logical ${OP_FAMILIES.logical.length} ops · op:unary ${OP_FAMILIES.unary.length} ops · op:update ${OP_FAMILIES.update.length} ops · global: ${GLOBALS.length} · api: eixo aberto`);
if (warn.length > 0) {
  console.log('\n  avisos (não reprovam):');
  for (const w of warn) console.log('  ⚠ ' + w);
}
