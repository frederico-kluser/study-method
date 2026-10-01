# 18 — Estado da fabricação dos cursos de Python e Rust

> **Status dos cursos PYTHON (2026-09-11): PARADO NO CURSO INICIANTE, por decisão do dono.** O produto hoje tem DOIS cursos completos no disco (`python-iniciante`, §1–§7, e `rust-iniciante`, §8) e sete planejados (os três seguintes de Python com o desenho no [`17-trilha-python.md`](17-trilha-python.md); os três seguintes de Rust com o desenho no [`20-trilha-rust.md`](20-trilha-rust.md)). Este documento registra o que foi feito, o que foi aprendido durante a criação e o que falta — com as matérias dos cursos pendentes e o roteiro de retomada de cada cadeia.

> ⚑ **A engine é multilíngue e a cadeia de RUST está entregue no iniciante (2026-09-17).** O adaptador da linguagem Rust é a 4ª linha do registro multilíngue da engine (`app/electron/main/engine/lang/rust.ts` + `vocab/atoms.rust.json`, **191 chaves**) e o contrato dos QUATRO cursos de Rust está no [`20-trilha-rust.md`](20-trilha-rust.md) — o `rust-iniciante` desenhado aula a aula (8 módulos, 101 aulas) e AUTORADO (§8), os três cursos seguintes por módulo, no mesmo formato deste documento. As regras de fabricação aqui registradas (§3) valem para a autoria Rust **com as adaptações de forma que o [`20-trilha-rust.md`](20-trilha-rust.md) declara** (ex.: a regra do receptor literal vira `api:str.to_string` em Rust; `node:Tuple` de `for a, b` não se aplica) e com as descobertas próprias de Rust do §8.4.

## 1. Estado atual

| Curso | Módulos no disco | Aulas | Desafios | Gates |
|---|---|---|---|---|
| **python-iniciante** (entregue) | 7 | 112 | 113 | audit **0 violações** · coverage **0 lacunas** · validate ok · 4 provas por desafio · requirements bijetivos nos 92 novos · typewriter 15/15 · suíte do app 4124 testes verdes |
| python-intermediario | — | — | — | planejado (docs/17, §5 abaixo) |
| python-avancado | — | — | — | planejado |
| python-especialista | — | — | — | planejado |

Os 7 módulos de `app/resources/tracks/python-iniciante/`: `a-tela` (20) · `decisao` (12) · `repeticao` (13) · `caixas-que-devolvem` (14) · `listas-e-tuplas` (22) · `texto-em-profundidade` (15) · `dicionarios-e-conjuntos` (16) = 112 aulas, 113 desafios. A fronteira atual do curso: o aluno lê e escreve programas com laços, funções com `return`, listas e tuplas, strings e seus métodos, dicionários e conjuntos — a primeira metade do perfil júnior do contrato.

`main` contém apenas squash commits (um por sub-tarefa/fix) — a história é limpa e reversível commit a commit.

## 2. O que foi feito nesta execução

1. **Deleção do curso antigo**: `app/resources/tracks/python/` ("Python, do primeiro print ao sênior") saiu do repositório; o módulo `a-tela` (20 aulas) foi migrado byte a byte para o `python-iniciante`.
2. **Skill de autoria criada**: `skills/trilha-author/` (SKILL.md + references de autoria-aula, interligacao, validacao e qualidade-aula) — a skill que codifica as premissas da ferramenta: nunca cobrar o que não foi ensinado (orçamento de átomos sobre AST + 4 provas), cursos que se interligam (entryCriteria + módulo porta-de-entrada), validação determinística antes de publicar. `install.sh` passou a instalar **todas** as skills de `skills/*/`.
3. **Contratos atualizados**: `docs/17` reescrito como o contrato dos QUATRO cursos (a espinha de 337 aulas + os módulos porta-de-entrada = 368 planejadas; as 26 tabelas de módulo preservadas); `docs/16` recebeu as agulhas de "trilha única" → "quatro cursos"; `README` atualizado.
4. **Testes do app adaptados**: referências ao slug `python` (como TRILHA) → `python-iniciante`, título novo no e2e, e pins recalibrados para o contrato novo (optionRationales, quizOptionLeak/Order).
5. **Autorado o curso iniciante em 5 ondas de conteúdo + 6 consertos**, cada onda com barreira, revisão e gate determinístico em snapshot: M2 `decisao` (12), M3 `repeticao` (13), M4 `caixas-que-devolvem` (14 — incluindo a aula da virada `imprimir-nao-e-devolver`), M5 `listas-e-tuplas` (22), M6 `texto-em-profundidade` (15), M7 `dicionarios-e-conjuntos` (16).
6. **Três defeitos de engine corrigidos** (ver §3.1), com pin de regressão.

## 3. O que foi aprendido durante a criação

### 3.1 Defeitos reais da engine que só o conteúdo novo expôs (corrigidos nesta execução)

1. **Semente receptiva do harness Python incompleta para a fase VALOR.** O teste da fase VALOR faz `from solucao import <função>` — o extrator emitia `api:solucao.<nome>` (chave que nenhuma aula pode ensinar) e faltavam `api:.assertFalse`/`api:.assertNotEqual`; TODO desafio VALOR reprovaria A3 pelo próprio harness. Corrigido em duas metades: (a) `extract_ast.py` — import do módulo do aluno não emite `api:` (análogo ao import relativo do JS); (b) `PYTHON_HARNESS_RECEPTIVE_SEED` +2 chaves, com teste de regressão em `engineLangPython.test.ts` e corpus `app/tests/fixtures/tracks/trilha-python-valor/` medindo "o harness cabe na semente" também para a fase VALOR, e provas de fronteira (o ARGUMENTO do teste — `dobro(-3)` — continua fora da semente).
2. **`minimalPython.ts` nunca usava a solução de referência como candidato na forma reconhecida.** Teste VALOR com ≥2 casos divergentes nunca é satisfeito por literal → `coverage` saía SEM-SOLUCAO em tudo. A referência virou o último candidato (literais continuam primeiro: teste fraco ainda expõe EXCESSO).
3. **`ATOM_KEY_RE` proíbe espaço** (`atomKeys.ts`): `op:compare:is not` e `op:compare:not in` são descartados do `introduces` em silêncio → lacuna no audit. Workaround normativo adotado: o operador base (`is`, `in`) é produtivo; a negação (`is not`, `not in`) só em prosa com crase. Consertar a regex é decisão de engine para rodada futura.

### 3.2 Limites e formatos medidos (regras que valem para a autoria daqui em diante — estão na skill trilha-author)

- **`assertions` máx. 3 por aula** (MAX_ASSERTIONS_PER_LESSON do loader do produto).
- **`requirements[]` são objetos** `{id, teste, descricao}`, um por método `test_*` — string solta é ignorada e vira gap.
- **Consolidação re-declara o `targetAtom`** em `introduces.productive` (padrão medido no disco: `mais-de-uma-linha → ['global:print']`).
- **Newline final é obrigatório** (gate-lint L-04) e o L-04 **trunca a lista em 8 ocorrências** — quando houver dúvida, varredura própria do último byte.
- **Seções de teoria ≤ 560 chars montados** (o teste typewriter impõe 21 s = 588 chars).
- **`for a, b in ...` emite `node:Tuple`**: enumerate/zip ensinam com `for par in ...` + `par[0]`, e o desempacotamento é aula própria.
- **Receptor literal** (`"-".join(...)`) emite `api:str.join` (chave diferente) → na teoria, demonstre métodos com receptor-nome (variável).
- **Testes que forçam a construção (J5)**: ≥2 casos divergentes, esperados não-escalares (listas, visões `str(d.keys())`, conjuntos de 1 elemento, `hash(-1) == -2`), nunca string crua de dict/set multi-elemento — meta: EXCESSO 0 no coverage (mínimo sintetizado == solução de referência).

### 3.3 Lições de processo e de ambiente

- Ondas de ~2 autores (≈14 aulas cada) + consertos: o ciclo completo levou ~90–120 min por onda; os autores leem as tabelas do contrato (docs/17) e os padrões vivos das ondas anteriores.
- Módulo partido entre dois autores exige **dono do `module.json`** (conflito resolvido por união na ordem do contrato); **`track.json` é singleton** com dono declarado por onda.
- macOS: gates de repo exigem PATH com coreutils GNU (`/opt/homebrew/opt/coreutils/libexec/gnubin`); `smoke.sh` exige bash ≥ 4 (corre na CI ubuntu); Electron em worktree: `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci` + cópia do binário do checkout principal.
- `do-wt.sh remove` morto no meio deixa a worktree destrancada — re-trancar com `git worktree lock --reason "deep-orchestrator-agent-skill run=<id>"` antes de re-remover.
- Divergência contrato × disco segue o padrão ⚑ do docs/17 (declarada, nunca resolvida em silêncio).

## 4. Dívidas conhecidas do curso iniciante

- **a-tela sem `requirements[]`** (21 desafios legados): o `requirements` da trilha inteira sai com 21 GAPs até o backfill (onda de polimento).
- **29 EXCESSOS / 17 aulas não-discriminantes (J5)** na fase SAÍDA legada: o sintetizador mínimo sempre acha `print("literal")`; forcing por teste só é pleno a partir da fase VALOR. Aviso declarado, não violação.
- **Bateria A13–A16 não roda em python** (é javascript-only): o audit declara a limitação (`checagensNaoExecutadas = 1`); o `0` de avisos não fala por ela.

## 5. Cursos que faltam e suas matérias (desenho integral no docs/17; nenhuma aula autorada ainda)

### 5.1 `python-intermediario` (~112 aulas) — entrada: saída do iniciante; saída: pleno
Primeiro o módulo **porta-de-entrada `a-porta-das-classes`** (~12 aulas: re-introduz a fronteira — `o-molde-e-o-objeto` até `o-seu-proprio-erro` — porque o orçamento é por trilha), depois:

| Módulo | Aulas | Matérias |
|---|---|---|
| `o-modelo-de-dados` | 15 | os dunders: `__repr__`/`__str__`, `__eq__` + `NotImplemented`, `functools.total_ordering`, `__hash__`, `__len__`, `__getitem__`, `__iter__`/`__next__`, `__contains__`, `__add__`, `__call__`, `__bool__`, `__format__`, `__enter__`/`__exit__` |
| `casamento-de-padrao` | 6 | `match`/`case`: valor, `_`, sequência + estrela, mapeamento, classe, `\|` e singletons |
| `iteradores-e-geradores` | 10 | `yield`, gerador infinito, `itertools.islice/count`, `yield from`, `send`/`close`, preguiça, `tee`, cadeias, iterador esgotado |
| `compreensoes-e-expressoes` | 8 | list/dict/set comp, filtro, aninhada, `GeneratorExp`, `:=` (walrus), quando NÃO usar |
| `funcoes-como-valor-e-decoradores` | 10 | função como valor, `lambda`, `map`/`filter`, `sorted(key=)`, `reduce`, `partial`, `cache`/`lru_cache`, escrever decorador, `wraps`, decorador com argumento |
| `tipagem-estatica` | 14 | anotação de nome/assinatura, `Optional`, `list[int]`, `Any`, `Callable`, `TypeAlias`, `TypeVar`, `TypeVarTuple`/`ParamSpec`, `Protocol`, `Literal`/`Enum`, `dataclass`, `get_type_hints`, mypy |
| `testes-automatizados` | 13 | `unittest` produtivo, asserções, `assertRaises`, `setUp`/`tearDown`, `subTest`, skip, `mock.patch`, capturar stdout, `runpy`, TDD, bordas, `trace.Trace` |
| `concorrencia` | 12 | `Thread`, `join`, `Lock`, `Queue`, `Event`, GIL medido, `Process`, `ThreadPoolExecutor`/`ProcessPoolExecutor`, `result`/`as_completed`, `multiprocessing.Queue`/`Value`, `shutdown` |
| `assincronismo` | 12 | `async def`/`await`, `asyncio.run`, `sleep`, `gather`, `create_task`, `TaskGroup`, `timeout`, `Queue` assíncrona, `AsyncFor`/`AsyncWith`, `IsolatedAsyncioTestCase`, async ≠ thread |

### 5.2 `python-avancado` (~35 aulas) — entrada: pleno; saída: sênior
Porta-de-entrada `a-porta-da-medicao` (~9 aulas: re-introduz import, função como valor + `functools.cache`, lista/conjunto, atributo de classe, generator-exp), depois:

| Módulo | Aulas | Matérias |
|---|---|---|
| `desempenho-e-perfilamento` | 10 | `timeit`, `cProfile`/`pstats`, `sys.getsizeof`, `tracemalloc`, custo set × lista MEDIDO, cache medido, `__slots__`, gerador × lista, `itertools.batched`, quando parar de otimizar |
| `empacotamento-e-distribuicao` | 8 | import relativo, `pyproject.toml`, `tomllib`, venv/pip, `importlib.metadata`, `__name__`/`__main__.py`, `argparse`/`sys.argv`, wheel/sdist |
| `ferramentas-e-qualidade` | 8 | PEP 8, formatador, lint, `logging` + níveis, `os.environ`, `warnings`, CI |

### 5.3 `python-especialista` (~41 aulas) — entrada: sênior; saída: abertura do capô
Porta-de-entrada `a-porta-dos-padroes` (~10 aulas: re-introduz herança, Protocol, yield, with próprio — o que M25 presume), depois:

| Módulo | Aulas | Matérias |
|---|---|---|
| `padroes-de-projeto-em-python` | 10 | `abc.ABC`/`abstractmethod`, estratégia-como-função, fábrica com dict, `singledispatch`, `contextmanager`, `ExitStack`/`suppress`, dataclass `frozen`, injeção por parâmetro, registro de plugins, quando NÃO usar padrão |
| `por-dentro-do-python` | 21 | tudo é objeto, `dir`/`hasattr`, `getattr`/`setattr` (nome literal), descritor, metaclasse, `type` de 3 argumentos, `sys.getrefcount`/`gc`, `weakref`, `dis`, `inspect`, bits (`&`, `^`, `<<`, `>>`, `~` e aug), `TemplateStr`/PEP 750, `ctypes`, 0.1 + 0.2, ler o fonte do CPython |

## 6. Roteiro de retomada

1. Use a skill **`skills/trilha-author`** (fluxo `mapear_curso → preparar_ambiente → desenhar_grafo → autoria_aula → validar_modulo → publicar`, com a re-checagem `--check` em `validar_modulo` e `publicar`) e as tabelas do docs/17.
2. Cada curso novo COMEÇA pela porta-de-entrada (re-introduzir a fronteira do curso anterior — o orçamento é por trilha e não herda o curso anterior).
3. Por onda: escrever módulo → `npm run engine -- audit <slug> --limite 0` (0 violações) → `coverage` (0 lacunas) → `requirements` (bijeção) → `track:validate` → `track:challenge:verify` (4 provas) → `lessonTypewriterReadingSpeed` → gates de repo (newline!) → squash-merge com gate em snapshot.
4. Dívidas do iniciante (a-tela sem requirements[], 29 excessos J5 fase SAÍDA) podem ser quitadas na primeira onda de retomada.
5. `smoke.sh` e o ambiente completo da CI rodam em ubuntu; localmente: PATH com coreutils GNU e bash 3.2 (smoke degradado e declarado).

## 7. Números reproduzíveis (python-iniciante)

```bash
cd app && find resources/tracks/python-iniciante -name lesson.json | wc -l    # 112
cd app && find resources/tracks/python-iniciante -name challenge.json | wc -l # 113
cd app && npm run engine -- audit python-iniciante --limite 0   # 0 violações
cd app && npm run engine -- coverage python-iniciante           # 0 lacunas
cd app && npm test                                              # 4124 pass · 0 fail · 1 skip
```

## 8. Estado da fabricação do curso de Rust

> **Status (2026-09-17): `rust-iniciante` ENTREGUE.** O disco tem o SEGUNDO curso completo (`app/resources/tracks/rust-iniciante/`) — 8 módulos · 101 aulas · 109 desafios — e o desenho integral da cadeia dos QUATRO cursos de Rust no [`20-trilha-rust.md`](20-trilha-rust.md). Esta seção espelha, para Rust, o que as §1–§7 registram para Python: o que foi feito, o que o ambiente e a autoria ensinaram, e o que ficou de dívida — com os números reproduzíveis no fim (§8.6). As dívidas de ENGINE registradas durante a fabricação estão, com a prova de cada uma, no [`20-trilha-rust.md`](20-trilha-rust.md) §"⚑ Dívidas de ENGINE registradas durante a fabricação".

### 8.1 Tabela de estado

| Curso | Módulos no disco | Aulas | Desafios | Gates (estado final, medido — §8.6) |
|---|---|---|---|---|
| **rust-iniciante** (entregue) | 8 | 101 | 101 de aula + 8 de módulo = **109** | audit **0 violações** (101 desafios de aula; A13–A16 declarada) · coverage **109/109 · 0 lacunas · 1 excesso declarado** · requirements bijetivos **109/109** · `track:validate` **109 verificados ✓** · suíte do app **4824 · 0 · 1** |
| rust-intermediario | — | — | — | planejado (desenho por módulo no [`20-trilha-rust.md`](20-trilha-rust.md) §3) |
| rust-avancado | — | — | — | planejado (idem) |
| rust-especialista | — | — | — | planejado (idem) |

Os 8 módulos de `app/resources/tracks/rust-iniciante/`: `a-tela` (13) · `decisao` (12) · `repeticao` (12) · `o-dono-do-valor` (13) · `emprestar` (13) · `estruturas` (12) · `variantes-e-match` (13) · `colecoes` (13) = 101 aulas, 101 desafios de aula + 8 desafios de MÓDULO (`modules/<slug>/challenges/<slug>/challenge.json`, declarados no `module.json` de cada módulo) = **109 desafios**. A fronteira do curso é a do contrato: o **júnior-Rust** — dono, movimento e empréstimo aplicados sem lutar com o compilador (fim do M8).

### 8.2 O que foi feito nesta fabricação

1. **O adaptador Rust da engine — a 4ª linha do registro multilíngue** (`KNOWN_LANGUAGE_IDS = ['javascript', 'python', 'typescript', 'rust']`, em `lang/registry.ts`): `lang/rust.ts` — parser por SUBPROCESSO (node + WASM do tree-sitter), runner `cargo test --offline`, exit 101, proibições globais (`RS_FORBIDDEN_INVARIANTS`), semente receptiva do harness (`RUST_HARNESS_RECEPTIVE_SEED`, 25 chaves) — mais o vocabulário FECHADO gerado do corpus (`vocab/atoms.rust.json`, **191 chaves**; 77 `node:`, 14 `op:`, 4 `decl:`, 77 `global:`, 19 `api:`; toolchain 1.98.1).
2. **O contrato dos QUATRO cursos** ([`20-trilha-rust.md`](20-trilha-rust.md)): a cadeia de 24 módulos · 279 aulas previstas, o iniciante desenhado aula a aula (§2, 101 medidas), a regra do par com o mapa fechado de derivadas, a semente receptiva e a verificação Ensina × Presume REEXECUTÁVEL embutida no documento (`0 falhas` — 8 módulos · 101 aulas · 64 átomos com origem única).
3. **O conteúdo em 5 ondas de conteúdo + fixes** (ondas 3–7 do orquestrador; cada onda com barreira, revisão adversarial e gate determinístico em snapshot): M1+M2 · M3+M4 · M5+M6 · M7+M8 · desafios de MÓDULO M1–M8 + quitamento das dívidas de conteúdo declaradas no contrato (forcing J5 por desafio; o backfill de `requirements[]` previsto no docs/20 §5 não foi preciso — todos os 109 desafios rust NASCERAM com `requirements[]` bijetivos, ao contrário do legado Python); entre as ondas, ondas de fix (corpus cresce com a variante que carrega, promoção do break, mapas do par ganham as linhas de método/leitura de campo/caminho-qualificado, reconciliação do M7 com o disco).
4. **O realce dedicado Rust**: `@codemirror/lang-rust` como dependência nova — no editor (`src/lib/editorLanguage.ts`, label 'Rust') e nos blocos de código de markdown (`src/components/markdown/codeHighlight.ts`, tags `rust`/`rs`).

### 8.3 O que o ambiente ensinou (gotchas medidos, com a regra de cada um)

- **A toolchain cargo fica confinada ao run** do orquestrador (`.deep-orchestrator/run-<id>/toolchain/{rustup,cargo}`): os gates de cargo exigem `RUSTUP_HOME`/`CARGO_HOME`/`PATH` exportados para ela. Sem o env, o `track:validate` reprova os 109 "corretamente" — o fail-closed é honesto, e a causa é ambiente, não conteúdo.
- **`npm ci` do app passa de 10 min** e os **postinstalls vêm bloqueados** (o aviso `allow-scripts` do npm é o estado normal); o dist do Electron não é baixado (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`) — é **copiado do checkout principal** (`cp -R app/node_modules/electron/dist` do checkout para o worktree).
- **Cold-start do prover**: a PRIMEIRA bateria que spawna cargo em lote numa sessão nova (coverage, validate) sai com TODOS os desafios reprovados por ambiente ("exit 1 (erro de uso do cargo)", medido na onda 8: 109× SEM-SOLUCAO no 1º run, 109/109 no 2º) ou estoura timeout (~60s). Regra do run: **sempre 1 re-run em worktree nova** antes de diagnosticar conteúdo.
- **Contenção de cargo**: gates de cargo em paralelo com outros agentes no MESMO `CARGO_HOME` produzem 1–2 ✗ ALEATÓRIOS (provado por `ps`: rustc concorrente; onda 5: validate 73✓/2✗ que fechou 75✓/0✗ isolado). Protocolo: serializar os gates de cargo, ou protocolar "N✗ aleatórios + re-verificação isolada" — ✗ que fecha isolado não é conteúdo.
- **ENOENT APFS** (P-20260827-001): spawn ENOENT intermitente em volume externo APFS — recriar o diretório/binário do zero antes de culpar código.
- **node_modules parcial/corrompido fabrica violação fantasma**: 21 violações de orçamento com deps quebradas → 0 com deps íntegras (onda 5); o veredito vale só com `npm ci` íntegro.

### 8.4 Regras de autoria descobertas (medidas; o [`20-trilha-rust.md`](20-trilha-rust.md) as codifica)

- **Globais dentro de macro emitem chave**: o identificador é nó nomeado dentro do `token_tree` — `assert_eq!(Some(6), …)` emite `global:Some` (onda 6, M7). A macro não esconde chave global: o starter traz o "conferente" completo e os testes compõem `conferente(fn(...))`.
- **Aritmética FORA de macros**: dentro do `token_tree` só há varredura de token — `x * 2` dentro de `format!` emite `op:unary:*` (a heurística de prefixo não vê o operando da esquerda), a chave ERRADA. Aritmética vai em expressão real, fora de macro, onde o tree-sitter emite `op:binary:*` + `node:BinaryExpression` (onda 4, M3).
- **Parens de agrupamento fora**: `(2 + 3)` emite `node:ParenthesizedExpression` — chave fora do inventário (o corpus nunca a usou) e sem aula; a trilha inteira foi autorada sem agrupamento por parêntese (as 0 lacunas do coverage provam).
- **`node:PrimitiveType` nunca é produtivo — o starter carrega os primitivos**: a contenção produtiva é por CHAVE contra o que o starter JÁ emite (`audit.ts:632`), então todo primitivo que a solução emite (`i32`/`usize`/`bool`) precisa estar no starter (cláusula 11 do docs/20).
- **`use desafio::` um por linha**: `use desafio::{a, b};` emite `node:UseList`/`node:ScopedUseList` FORA da semente — os testes usam um `use desafio::<nome>;` por linha (cláusula 12).
- **Convenção `role: "consolidation"`**: a marcação normativa de consolidação das trilhas rust (o loader ignora `role`; a marcação real é o `introduces` da lesson.json) — decisão do dono, divergência declarada no [`16-engine-de-trilha.md`](16-engine-de-trilha.md) §3.7.
- **Construção na lacuna do aluno é PROMOÇÃO, não isenção**: o `break` da aula 1 do M3 nasceu receptivo e o gate só passava pela isenção inteiro-arquivo do worked example (`audit.ts:632`) — refutado por contrafactual ("sem `ate_tres` → A2 dispara") e corrigido: o break é PRODUTIVO da aula que o ensina (fix onda 4). O `match` do M7 seguiu a mesma regra: o match INTEIRO sai da lacuna do aluno ("o casamento" é aula produtiva), não Starter isentando.

### 8.5 Dívidas conhecidas do rust-iniciante

- **13+1 dívidas de corpus com substitutos** (docs/20 §"Dívidas de corpus"): `op:binary:-`, `op:binary:/`, `op:binary:%`, `op:compare:!=`, `op:compare:<=`, `op:compare:>=`, `op:logical:||`, `op:assign:-=` (e os compostos restantes), `node:FloatLiteral`, `node:CharLiteral`, `node:ArrayExpression`, `node:TupleExpression`, `node:ContinueExpression` — mais 1: a anotação de lifetime explícita. Nenhuma aula depende delas; quem as introduz primeiro cresce o `corpus.rs` e regenera o inventário.
- **Multi-arquivo `files[]` para rust aguarda o validador multilíngue** do produto: `trackTypes.ts` valida `files[].path` contra o adaptador DEFAULT (`\.mjs$`) — o `RS_SAFE_FILE_PATH_RE` (`\.rs$`) já existe no adaptador e o SUBMIT já usa o adaptador do desafio; os 8 desafios de módulo foram autorados arquivo-único (M8 com `mod` inline).
- **`cmdChallengeVerify` não alcança desafio de módulo** (resolve por `lessons/<aula>/challenges/`): usar `track:validate` (os 109 ✓) ou `verifyChallengePair` direto.
- **Desafios de módulo FORA do `auditTrack`** (o audit cobre só `lesson.challenges`): a contenção deles foi garantida por sondas fail-closed por módulo + o coverage fim-da-trilha (109/109, incluindo os 8).
- **`statement` não-extraído pelo audit** (`challengeSurfaces` = starter/solution/tests): lacuna pré-existente da ENGINE, vale para Python também — promessa vale por disciplina de autoria (docs/20 §"O que o gate NÃO mede").
- **`api:.or_insert` nunca emitida em cadeia** (`contar-as-palavras`, M8): a chave é ensinada e NÃO medida — o coverage a mostra como o ÚNICO excesso declarado (1), não como lacuna.
- **`api:`-dentro-de-`assert_eq!` é cego pré-existente**: dentro do `token_tree` não existe `scoped_identifier` — `String::from` num assert emite `global:String` mas NÃO `api:String::from` (sonda da onda 8); dormente nas trilhas atuais.
- **A13–A16 são javascript-only para rust**: o audit declara a checagem não-executada; o `0` de avisos não fala por ela — a discriminação J5 do Rust é medida aula a aula (assimetrias declaradas no docs/20 §2).

### 8.6 Números reproduzíveis (estado final — onda 8)

```bash
export RUSTUP_HOME=<toolchain do run>/rustup CARGO_HOME=<toolchain do run>/cargo
export PATH="$CARGO_HOME/bin:$PATH"        # os gates de cargo exigem o env do run
cd app && find resources/tracks/rust-iniciante -name lesson.json | wc -l    # 101
cd app && find resources/tracks/rust-iniciante -name challenge.json | wc -l # 109
cd app && npm run engine -- audit rust-iniciante --limite 0  # 0 violações · 101 aulas · 101 desafios (A13–A16 declarada)
cd app && npm run engine -- coverage rust-iniciante          # 109/109 · lacunas 0 · excessos 1 (api:.or_insert)
cd app && npm run engine -- requirements rust-iniciante      # bijeção completa 109 · 0 gaps
cd app && npm run track -- track:validate rust-iniciante     # verificados: 109 · reprovados: 0 (exit 0)
cd app && npm test                                           # 4824 pass · 0 fail · 1 skip
cd <raiz> && python3 - docs/20-trilha-rust.md <<<'…'          # 8 módulos · 101 aulas · 0 falhas (script embutido)
```

> Repetindo a regra da §3.3: **cold-start do prover reprova o lote inteiro por ambiente no 1º run** — o 2º run no mesmo estado fecha os números acima (medido: coverage 109× SEM-SOLUCAO → 109/109).

---

## 9. A premissa de revisão acumulada (2026-09-27) — análise, régua e campanha

O dono levantou a segunda premissa do produto — a primeira é negativa ("um desafio nunca cobra o
que não foi ensinado"), esta é positiva: *"os desafios finais da aula englobem conteúdos das aulas
anteriores, misturando na prova conhecimentos que ele já possui — claro, não precisamos
LITERALMENTE colocar tudo, mas ter um controle de modo que o aluno sempre pratique num desafio de
aula ou de módulo todo o conhecimento anterior daquele curso ou cursos anteriores àquele que estão
conectados"*. A pergunta desta execução: **todos os cursos cumprem?** A resposta medida: **não** — e
a correção foi a campanha descrita abaixo.

### 9.1 A régua nova — `npm run engine -- pratica <slug>`

A premissa já tinha o mecanismo de RUNTIME (`services/reviewSelection.ts` →
`engine/coverage/practiceLedger.ts`, que seleciona O QUE revisar por nunca-praticado → espaçamento →
intercalação), mas **nenhum gate media o conteúdo já escrito**. A régua nova é determinística (extrai
os átomos da solução de referência — zero LLM, zero execução) e tem duas medidas:

- **MISTURA (por desafio)** — `atoms(solução) ∩ ensinadoAntes(bloco)` ≠ ∅, contando só
  **átomos-conceito** (`decl/op/global/api/term`). `node:`/`form:` são a estrutura do código: contar
  `node:Call` como revisão aprovaria todo desafio que imprime algo — a régua viraria teatro (medido:
  python-iniciante passava 112/113 com a régua larga e 70/113 com a régua de conceito). E
  `api:todo!` (o stub do starter) nunca conta: era o ÚNICO "conceito" anterior dos dois primeiros
  desafios do rust-iniciante — sem a exclusão a régua exigia revisão impossível. Isento por
  vacuidade: as aulas onde ainda não há nada ensinado antes.
- **FECHAMENTO (por módulo e por curso)** — `faltantesDoModulo` do `practiceLedger`: todo átomo
  **produtivo** do módulo praticado por algum desafio até ao desafio do módulo, e nenhum
  nunca-praticado no curso. Receptivo ("sabe ler") nunca é exigido como prática.

Código: `app/electron/main/engine/coverage/praticaAcumulada.ts` (puro; importa só `atomKeys` e
`practiceLedger`), comando `pratica` no `app/tools/track-engine/cli.ts`, suíte
`app/tests/enginePraticaAcumulada.test.ts` (11 testes), contrato em
[`16-engine-de-trilha.md`](16-engine-de-trilha.md) §8 e na skill (`references/validacao.md` §1.1,
`references/autoria-aula.md` §8). O `--json` por desafio traz `atoms`/`ensinadosAntes`/
`revisaoContavel`/`novos`/`sugestao` (a sugestão vem do MESMO `selecionarRevisao` do runtime: o que
praticar agora, por espaçamento).

### 9.2 O estado medido ANTES da correção (baseline)

| Curso | Desafios | REVISAO_OK | SEM_REVISAO | Isentos | Faltantes de módulo | Nunca praticados | Sem desafio |
|---|---|---|---|---|---|---|---|
| python-iniciante | 113 | 69 | **43** | 1 | 0 | 0 | **6 módulos sem desafio de módulo** |
| rust-iniciante | 111 | 91 | **17** | 3 | **1** (`api:.or_insert`) | **1** (`api:.or_insert`) | 0 |
| c-iniciante | 117 | 116 | 0 | 1 | **2** (`op:assign:-=`, `op:update:--` no a-tela) | 0 | **4 aulas + 1 módulo** |

Padrão do defeito (o mesmo em todos): o desafio praticava **só o alvo novo** mais o encanamento
estrutural (`def`/`return`/chamada) — ex.: `garantindo-e-tirando` (dict `popitem`/`setdefault`)
não arrastava nenhum conceito de aulas anteriores. O c-iniciante (autorado depois do
`practiceLedger` existir) já nasceu misturando — prova de que a régua é exequível sem inflar o
desafio.

### 9.3 A correção — 19 subagents em paralelo

Duas frentes, tudo verificado por `track:challenge:verify` (solução passa · starter falha) desafio a
desafio:

1. **Mistura** — os 60 desafios `SEM_REVISAO` (43 python + 17 rust) ganharam 1–2 conceitos
   anteriores no código que resolve (o enunciado, os testes, a solução e os `requirements[]`
   andam juntos), seguindo a `sugestao` da régua (nunca-praticado primeiro, depois espaçamento,
   intercalando origem). O `api:.or_insert` do rust (o único nunca-praticado do curso) entrou no
   desafio da aula `contar-as-palavras`.
2. **Prova em falta** — 6 desafios de MÓDULO novos no python-iniciante (todos os módulos exceto
   `a-tela`, que já tinha), o desafio de módulo de `texto-em-profundidade` (c-iniciante, o único
   módulo do curso sem um) e as 4 aulas-esqueleto do c-iniciante autoradas por inteiro
   (`procurar-na-lista-de-strings` · `ao-contrario` · `contar-palavras` · `consolidacao-texto` —
   teoria + quiz + desafio, cada uma pela sua ficha `autoria` do `lesson.json`) — os desafios de
   módulo são a vassoura da garantia *"todo o conhecimento acaba praticado num desafio de aula ou
   de módulo"*.

### 9.4 Resultado medido (gates finais, 2026-09-27)

`npm run engine -- pratica <slug>` — a premissa, medida depois da campanha:

| Curso | Desafios | Com revisão | SEM_REVISAO | Isentos | Faltantes de módulo | Nunca praticados | Blocos sem desafio |
|---|---|---|---|---|---|---|---|
| python-iniciante | 119 | 118 | **0** | 1 | 0 | 0 | 0 |
| rust-iniciante | 111 | 108 | **0** | 3 | 0 | 0 | 0 |
| c-iniciante | 122 | 121 | **0** | 1 | 0 | 0 | 0 |

E os outros gates, com o conteúdo novo no disco (cada desafio alterado/criado passou por
`track:challenge:verify` — solução passa · starter falha — um a um):

| Gate | python-iniciante | rust-iniciante | c-iniciante |
|---|---|---|---|
| `audit --limite 0` | **0 violações** (112 aulas) | **0 violações** (103 aulas) | **0 violações** (115 aulas) |
| `coverage` | 119/119 medidos · 0 lacunas | 111/111 medidos · 0 lacunas · **0 excessos** | 122/122 medidos · 0 lacunas |
| `requirements` | bijeção 119/119 · 0 gaps | bijeção 111/111 · 0 gaps | bijeção 122/122 · 0 gaps |
| `track:validate` | **119 ✓ · 0 reprovados** | **111 ✓ · 0 reprovados** | **122 ✓ · 0 reprovados** |

E a suíte do app (`npm test`), sobre tudo isto: **7137 testes · 7135 pass · 0 fail · 2 skipped**.

Os avisos que sobram (A22/A24: 102 no python, 145 no rust, 17 no C) são os pré-existentes, medidos e
declarados — A22 sozinho nunca reprova e o A24 por afirmação isolada é aviso. E a limitação
A13–A16 (javascript-only) continua declarada na saída de cada audit, como sempre.

Além da premissa, a campanha quitou a **dívida de audit pré-existente do c-iniciante** (era o único
curso com erros: 22 no início da execução — 4× A20 das aulas-esqueleto, mais A2/A3/A4 de ORDEM:
`op:unary:-`, `op:binary:!=`, `op:binary:<=` usados antes de ensinados e `op:binary:>` usado sem
nunca ser produtivo), por reescrita com construções já ensinadas (ex.: `a > b` → `b < a`;
`x != 0` → `!(x == 0)`; sentinela `-1` → `9999`; casos de teste sem negativos).

### 9.5 O que a campanha ensinou (regras medidas, agora na skill e na régua)

- **A régua dos eixos é a decisão central.** Conceito = `decl/op/global/api/term`; `node:`/`form:`
  não contam (senão `node:Call` aprovaria todo desafio que imprime algo — medido: python passava
  112/113 com a régua larga e 70/113 com a de conceito) e `api:todo!` nunca conta (era o único
  "conceito" anterior dos 2 primeiros desafios do rust).
- **Revisão tem de ser ESCREVÍVEL**: só átomos que uma aula anterior ensinou a escrever
  (`introduces.productive`) contam — tanto na mistura como na sugestão. Átomo só-receptivo no
  `solutionCode` é violação A2 (a armadilha `api:.y` do rust, que a sugestão apontava e o audit
  barrava; e `op:unary:-` do rust, que só vira produtivo em `decisao/o-negativo`).
- **Armadilhas de adaptador que os fixers encontraram** (registadas na memória CoALA):
  rust — `node:ParenthesizedExpression` fora do inventário (`(a + b) * 2` é ilegal), doc-comment
  `///` emite `node:DocComment` (A3 reprova; o rótulo é `//` antes do `#[test]`), operador dentro
  de argumento de macro classifica-se errado (`preco * qtd` dentro de `format!` sai
  `op:unary:*`), `use` em lista emite `node:UseList` (A3); python — receptor literal
  `"-".join(...)` emite `api:str.join` (usar receptor-nome), `not in`/`is not` emitem
  `op:compare:not in` (nunca ensinado); C — bloco ```c da teoria tem de ser autossuficiente
  (variáveis declaradas dentro do bloco) senão o A19 reprova por fail-closed, e o `testsCode` do
  desafio de MÓDULO lê o orçamento de entrada da última aula do módulo.
- **O extrator Rust não emite `api:.metodo`** quando o receptor é uma chamada encadeada
  (`contagem.entry(p).or_insert(0)` só emite `api:.entry`) — a forma que extrai é a entrada nomeada.

### 9.6 A premissa nos GERADORES (mesmo dia, depois da campanha)

A pergunta natural depois de corrigir o disco: *"ao criar cursos e ao gerar desafios novos, o
sistema já pensa nesta lógica?"* — sim, e foi adaptado nos dois fluxos:

- **`generate` (F0..F12) — prompt do autor de desafio (F8): ADAPTADO.** O dossiê de desafio ganhou
  a seção `REVISAO_ACUMULADA` — a lista determinística do que o aluno já sabe **escrever** antes da
  aula (interseção `budget_teste` ∩ `budget_produtivo`, calculada do próprio dossiê; só-receptivo
  fica de fora pela mesma razão do A2) — e a convenção da premissa: *"o solutionCode deve praticar,
  ao lado do alvo da aula, 1 ou 2 construções da lista — misturar, não encher; o alvo novo continua
  a ser o núcleo"*. O gate pós-geração continua o `pratica` no `validar_modulo`. (`prompts/author.ts`
  está CONGELADO por contrato — a especificidade do desafio vive na F8, que é onde entrou.)
- **"Gerar novo desafio" (app, `services/challengeRegenerator.ts`): JÁ TINHA a lógica** (a seção
  `TAMBÉM REVISE`, alimentada pelo `reviewSelection` → `practiceLedger`), e foi **refinada** com as
  descobertas da campanha: a regra passou a exigir a mistura **no caminho que o aluno escreve**
  (`solutionCode` pratica 1–2 itens e os testes exigem esse caminho — teste sozinho não pratica
  nada), e a seleção (`services/reviewSelection.ts`) passou a considerar só átomos **escrevíveis**
  (`entrada.productive`) — antes podia sugerir átomos só-receptivos, a armadilha `api:.y`.
- Pin do contrato atualizado em `app/tests/challengeReviewInjection.test.ts` (o texto do prompt é
  travado por teste; prompt e pin mudam juntos).

### 9.7 Dívidas que ficam, declaradas

- Os **desafios de módulo continuam FORA do `auditTrack`** (o audit cobre só `lesson.challenges`) —
  a contenção deles é `coverage` + `requirements` + `track:validate` + `pratica`.
- **`statement` continua não-extraído pelo audit** (`challengeSurfaces` = starter/solution/tests).
- **`check-trilha-c.mjs`** marca 2 achados [D6] pré-existentes (`a-string-e-o-zero` declara
  `node:StringLiteral` no doc e não no `introduces`; `mudar-o-dado` idem com `op:assign:=`) —
  divergência doc×disco por decidir (promover o átomo a `introduces` ou ajustar a célula do doc).
- **A22/A24** (duas formas sintáticas × quiz acertável pelo comprimento) continuam em aviso em
  massa (102/145/17) — material de uma onda de polimento de teoria/quiz, não de desafios.
