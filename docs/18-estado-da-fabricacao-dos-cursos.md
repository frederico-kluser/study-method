# 18 — Estado da fabricação dos cursos de Python

> **Status (2026-09-11): PARADO NO CURSO INICIANTE, por decisão do dono.** O produto hoje tem UM curso completo no disco (`python-iniciante`) e três planejados (intermediário, avançado, especialista), com o desenho integral no [`17-trilha-python.md`](17-trilha-python.md). Este documento registra o que foi feito, o que foi aprendido durante a criação e o que falta — com as matérias dos cursos pendentes e o roteiro de retomada.

> ⚑ **A engine é multilíngue e a cadeia de RUST começou (2026-09-16).** O adaptador da linguagem Rust está na engine (`app/electron/main/engine/lang/rust.ts` + `vocab/atoms.rust.json`, 190 chaves) e o contrato dos QUATRO cursos de Rust está no [`20-trilha-rust.md`](20-trilha-rust.md) — o `rust-iniciante` desenhado aula a aula (8 módulos, 101 aulas) e os três cursos seguintes por módulo, no mesmo formato deste documento. As regras de fabricação aqui registradas (§3) valem para a autoria Rust **com as adaptações de forma que o [`20-trilha-rust.md`](20-trilha-rust.md) declara** (ex.: a regra do receptor literal vira `api:str.to_string` em Rust; `node:Tuple` de `for a, b` não se aplica).

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

1. Use a skill **`skills/trilha-author`** (fluxo `mapear_curso → desenhar_grafo → autoria_aula → validar_modulo → publicar`) e as tabelas do docs/17.
2. Cada curso novo COMEÇA pela porta-de-entrada (re-introduzir a fronteira do curso anterior — o orçamento é por trilha e não herda o curso anterior).
3. Por onda: escrever módulo → `npm run engine -- audit <slug> --limite 0` (0 violações) → `coverage` (0 lacunas) → `requirements` (bijeção) → `track:validate` → `track:challenge:verify` (4 provas) → `lessonTypewriterReadingSpeed` → gates de repo (newline!) → squash-merge com gate em snapshot.
4. Dívidas do iniciante (a-tela sem requirements[], 29 excessos J5 fase SAÍDA) podem ser quitadas na primeira onda de retomada.
5. `smoke.sh` e o ambiente completo da CI rodam em ubuntu; localmente: PATH com coreutils GNU e bash 3.2 (smoke degradado e declarado).

## 7. Números reproduzíveis

```bash
cd app && find resources/tracks/python-iniciante -name lesson.json | wc -l    # 112
cd app && find resources/tracks/python-iniciante -name challenge.json | wc -l # 113
cd app && npm run engine -- audit python-iniciante --limite 0   # 0 violações
cd app && npm run engine -- coverage python-iniciante           # 0 lacunas
cd app && npm test                                              # 4124 pass · 0 fail · 1 skip
```
