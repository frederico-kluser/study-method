# Glossário de átomos — referência rápida das chaves

O vocabulário fechado da trilha vive em `app/electron/main/engine/vocab/atoms.python.json`
(**632 chaves** medidas: node 118 · op 42 · decl 11 · global 164 · api 297). Eixos
`node:`/`op:`/`decl:`/`global:` são **FECHADOS** (pertença estrita); `api:` é aberto só no formato;
`term:` é não-vocabulário (prosa). Toda chave abaixo foi conferida no código, no contrato ou no
**extrator real** (`printf '...' | python3 -I -S app/electron/main/engine/vocab/py/extract_ast.py`).

## 1. Os seis eixos

| Eixo | Forma | Exemplo | Aberto? |
|---|---|---|---|
| nós | `node:<tipo>` | `node:If`, `node:FunctionDef` | FECHADO |
| ligação | `decl:<forma de ligação>` (as onze) | `decl:assign`, `decl:unpack`, `decl:walrus` | FECHADO |
| operadores | `op:<família>:<op>` | `op:binary:+`, `op:compare:==`, `op:bool:and` | FECHADO |
| globais | `global:<builtin>` | `global:print`, `global:len` | FECHADO |
| API | `api:<módulo>.<nome>` (raiz importada/builtin) · `api:.<método>` (receptor local) | `api:math.sqrt`, `api:.append` | só formato |
| termos da prosa | `term:<termo pt-BR>` | `term:recuo`, `term:traceback` | não-vocabulário |

## 2. Código → chave emitida (medido no extrator real)

| Código | Chaves não-estruturais emitidas |
|---|---|
| `print("oi")` | `global:print` · `node:Call` · `node:StrLiteral` (os dois últimos = axioma) |
| `print(7)` | `global:print` · `node:Call` · `node:IntLiteral` |
| `x += 1` | `decl:aug` · `node:AugAssign` · `op:aug:+` · `node:IntLiteral` (regra do par: UM item) |
| `preco = 10` | `decl:assign` · `node:Assign` · `node:IntLiteral` |
| `0 < x < 10` | `node:Compare` · `op:compare:<` (um por operador; **não** existe `node:ChainedCompare`) |
| `if x is None:` | `node:If` · `op:compare:is` (e `global:print` no corpo) — `is not` é indizível como chave |
| `x in itens` / `x not in itens` | `op:compare:in` — a negação `not in` só em prosa com crase |
| `for a, b in pares:` | `node:For` · `node:Tuple` (**nunca** `decl:unpack` aqui — unpack é `a, b = ...`) |
| `separador.join(itens)` | `api:.join` (receptor = nome local) |
| `"-".join(itens)` | `api:str.join` (receptor = literal — chave DIFERENTE) |
| `from solucao import dobro` | **nada** — import do módulo do aluno não emite `api:` (fix desta execução) |
| `class B(A):` | `node:ClassDef` · `node:Name` (sem `node:ClassBase`) |
| `def f(x: int) -> int:` | `node:FunctionDef` · `global:int` (sem `node:ArgAnnotation` nem `node:Returns`) |
| `d = {"pao": 4}` | `node:Dict` · `node:IntLiteral` · `decl:assign` · `node:Assign` |
| `print({1, 2})` | `node:Set` · `global:set` (quando o nome `set` aparece) · literais |
| `x = 1 if cond else 0` | `node:IfExp` |

## 3. As chaves sintéticas do adaptador (as ÚNICAS que existem)

Fonte: `vocab/py/extract_ast.py` (`_sinteticos` + `_LITERAL_NODE`); docs/17.

- Literais refinados: `node:IntLiteral` · `node:StrLiteral` · `node:BoolLiteral` ·
  `node:NoneLiteral` · `node:FloatLiteral` · `node:BytesLiteral` · `node:ComplexLiteral` ·
  `node:EllipsisLiteral` — **nunca** `node:Constant` cru.
- Estrutura de bloco: `node:Elif` · `node:IfElse` · `node:ForElse` · `node:WhileElse` ·
  `node:Finally`.
- Parâmetros e ligação: `decl:vararg` (`*args`) · `decl:kwarg` (`**kwargs`) · `decl:default`
  (padrão) · `decl:except-as` (`except ValueError as e`) · `decl:unpack` (`a, b = 1, 2`) ·
  `decl:assign` · `decl:ann` · `decl:aug` · `decl:walrus` · `decl:global` · `decl:nonlocal`.
- Funções: `node:MethodDef` · `node:InitMethod` · `node:DunderStr` (os ÚNICOS dois dunders
  refinados; os outros 14 protocolos emitem `node:MethodDef` — dívida declarada docs/17).
- `node:Decorator` (`@deco` vive em `decorator_list`, não é nó) · `node:OptionalAnnotation`
  (`int | None` em anotação — emite também `op:binary:|` + `node:BinOp`).
- `op:compare:<op>` é família própria: `==`, `<`, `in`, `is` são `ast.Compare`, **não** `BinOp`.

**Nove chaves que NÃO existem** (inventadas pela versão anterior do contrato — usar qualquer uma
produz aula cujo orçamento nunca casa): `node:ChainedCompare` · `node:ClassBase` · `node:ClassVar` ·
`node:ArgAnnotation` · `node:Returns` · `node:GenericAnnotation` · `node:ComprehensionIf` ·
`node:DunderEnter` · `node:DunderExit`.

## 4. Estruturais sempre permitidos (não carregam didática)

`node:Module` · `node:Name` · `node:Load` · `node:Store` · `node:Del` · `node:arguments` ·
`node:Expr` · `node:alias` · `node:keyword` — fonte: `PYTHON_STRUCTURAL_ALWAYS_ALLOWED`
(`atomKeys.ts:545`). Consequência de currículo: **argumento nomeado (`f(a=1)`) não introduz átomo
nenhum** (é consolidação), e `node:keyword` não pode ser declarado como aula.

## 5. Axioma e semente

- **Axioma PRODUTIVO (duas chaves, e só duas):** `node:Call` + `node:StrLiteral` — alargar é
  proibido. No disco a aula 1 as declara em `introduces.productive` junto de `global:print`
  (divergência ⚑ declarada, docs/17 — passa no audit nos dois modos).
- **Semente receptiva do harness (`PYTHON_HARNESS_RECEPTIVE_SEED`, `atomKeys.ts:490` — lista
  ATUAL, já com as correções das ondas):** `node:Module FunctionDef arguments arg Return Name Expr
  Call Attribute Import ImportFrom alias ClassDef MethodDef IntLiteral StrLiteral` + fase SAÍDA
  (`node:With withitem Assign decl:assign`) + módulos do harness (`api:unittest api:io
  api:contextlib api:runpy`) + membros (`api:unittest.TestCase api:io.StringIO
  api:contextlib.redirect_stdout api:runpy.run_path api:.getvalue api:.assertEqual api:.assertTrue
  api:.assertIsNone api:.assertRaises`) + fase VALOR consertada (`api:.assertFalse
  api:.assertNotEqual`). O `from solucao import X` não emite `api:` — o módulo do aluno não é API.

## 6. Proibições globais — em qualquer superfície

`PY_FORBIDDEN_INVARIANTS` (`lang/python.ts:617`): `global:eval` · `global:exec` ·
`global:compile` · `global:__import__` · `global:globals` · `global:locals` · `global:vars` ·
`api:importlib.import_module` · `node:ComputedNonLiteralAttribute` · `node:DynamicAttributeHook`.
São a condição de existência do gate: análise estática fica indecidível com elas. Também proibido:
`obj[expr]` com chave não-literal, alias de função (`const f = console.log`), e — na trilha —
ensinar `getattr`/`setattr` com nome montado ou definir `__getattr__`/`__getattribute__`. Elas
aparecem **só em prosa com crase**, nunca em bloco cercado.

## 7. Contagem para a regra do par (A7/I2: ≤2 itens em `introduces.productive`)

`Ensina` lista a chave que DISTINGUE; as derivadas da mesma construção contam como UM item e não
são origem (I3). Mapa fechado: `decl:assign`/`decl:unpack` → `node:Assign` · `decl:ann` →
`node:AnnAssign` · `decl:aug`/`op:aug:*` → `node:AugAssign` · `decl:walrus` → `node:NamedExpr` ·
`decl:global` → `node:Global` · `decl:nonlocal` → `node:Nonlocal` · `decl:except-as` →
`node:ExceptHandler` · `op:binary:*` → `node:BinOp` · `op:bool:*` → `node:BoolOp` · `op:unary:*` →
`node:UnaryOp` · `op:compare:*` → `node:Compare` · `node:With`/`node:AsyncWith` → `node:withitem` ·
compreensões/gerador → `node:comprehension` · `node:Match` → `node:match_case` · `node:Lambda`/
`node:FunctionDef` → `node:arg` só na aula de parâmetro. (Tabela completa em
`receita-da-aula.md` §4; a fonte normativa é o docs/17 e o verificador Ensina × Presume.)

## 8. Dica de uso rápido

- Chave duvidosa? Rode o extrator real — ele roda **sem node_modules**:
  `printf 'SEU TRECHO\n' | python3 -I -S app/electron/main/engine/vocab/py/extract_ast.py`.
- Eixo fechado fora do inventário = VOCAB reprovado no audit (pertença estrita,
  `phases/f0Brief.ts:578`). Comando de conferência: `python3 -c "import json; d=json.load(open(
  'app/electron/main/engine/vocab/atoms.python.json')); print(d['total'])"` → 632.
- A aula cujo `Ensina` não gera chave nenhuma (ex.: argumento nomeado) é **consolidação** com o
  degrau nomeado — não invente chave para ela.
