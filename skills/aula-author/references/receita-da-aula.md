# Receita de UMA aula — a receita completa

Regras de execução dos passos `ler_contrato (módulo)`, `escrever_teoria`, `escrever_quiz` e
`escrever_desafio_e_testes`. Todo schema e formato abaixo está no disco
(`app/electron/main/content/trackTypes.ts`), nos contratos (`docs/16-engine-de-trilha.md` §10,
`docs/17-trilha-python.md`) e nos padrões-ouro citados pelo caminho real em
`app/resources/tracks/python-iniciante/`. Cada número foi medido nesta execução (2026-09-11).

## 0. A aula como unidade — layout físico obrigatório

Uma aula = `lesson.json` **mais** um ou mais `challenges/<slug>/challenge.json`. Layout (I13:
`slug === basename(dir)`; docs/17, "Regras para os desafios de aula"):

```
modules/<mod>/lessons/<aula>/lesson.json
modules/<mod>/lessons/<aula>/challenges/<desafio>/challenge.json
modules/<mod>/lessons/<aula>/challenges/<desafio>/solucao.py        ← raiz do desafio
modules/<mod>/lessons/<aula>/challenges/<desafio>/tests/__init__.py  ← OBRIGATÓRIO
modules/<mod>/lessons/<aula>/challenges/<desafio>/tests/test_solucao.py
```

- **`tests/__init__.py` é obrigatório e é o exit-guard** (`PY_PACKAGE_MARKER` em
  `electron/main/engine/lang/python.ts`): sem ele o CPython 3.14 recusa a descoberta com
  `ImportError: Start directory is not importable` e o desafio "falha" sem ter rodado nada
  (medido no docs/17). Conteúdo: o comentário padrão do harness; não inventar.
- O `challenge.json` **não lista os arquivos** — o layout é fixo: `solucao.py` na raiz,
  `tests/test_solucao.py` (tem de casar o `-p 'test_*.py'` do discover), `tests/__init__.py`.
- O desafio de **módulo** vive em `modules/<mod>/challenges/<slug>/challenge.json`, declarado no
  `module.json` como `challenge` (ex.: `a-tela/challenges/rachando-a-conta`); ele compõe o que o
  módulo ensinou e **não pode introduzir construção nova**.

## 1. `lesson.json` — o schema real

`schemaVersion: 1` (bumpar é **proibido** — docs/16 §10). Campos, com onde ver no padrão-ouro:

| Campo | O que vai | Exemplo vivo |
|---|---|---|
| `slug` | kebab-case ASCII; único na trilha (I12); `=== basename(dir)` (I13) | `a-primeira-linha` |
| `title` / `summary` | pt-BR; resumo de uma linha | `A primeira linha` |
| `difficulty` | 1..5 — **nenhum gate pode lê-lo** (docs/16 §10: é o cronômetro do produto, não sinal de nada); use a rampa do grafo | `1`..`4` |
| `role` | `regular` (introduz) · `integration` (composição) — enum da engine; `consolidation` é o que o disco usa com o degrau nomeado (divergência ⚑ declarada em docs/16 §3.7 e docs/17) | `regular`, `consolidation` |
| `targetAtom` | a chave que a aula distingue (o átomo-alvo da lacuna única) | `global:print`, `node:If` |
| `concepts[]` | `concept.id` (nunca slug de aula); `challenge.concept` ∈ `lesson.concepts` (I16) | `["imprimir"]` |
| `prerequisites[]` | `concept.id` — type check duro, **nunca** `lesson.slug` (docs/16 §3.4; 105 de 134 referências violavam na trilha legada) | `["devolver-em-vez-de-mostrar"]` |
| `introduces` | `productive[]` (≤2 itens por A7/I2, contados pela regra do par §4) e `receptive[]`; invariante `productive ⊆ receptive` | ver `se` |
| `introducesTerms[]` | termos novos da prosa (`term:`) — não são átomos, não entram em `productive` | `["term:recuo", "term:IndentationError"]` |
| `notionalMachineDelta?` | o que muda na máquina nocional | aula `se` |
| `theory[]` | seções `{id, title, markdown}` — ids únicos (I15) e são **âncoras do quiz** (`sectionId`); markdown pt-BR com blocos cercados ```python (bloco com tag é código; crase inline é prosa — docs/16 §5.3) | `se`, `ordenar` |
| `assertions[]` | o quiz: `id`, `statement`, `question`, `options` (**exatamente 4**, não vazias, únicas), `answerIndex`, `feedback`, `sectionId?`, `optionRationales?` | `imprimir-nao-e-devolver` (com rationales) |
| `sources[]` | **2–3 fontes oficiais** (P-FONTE): `title`, `url` verificável, `description` | `se` (3 fontes) |
| `challenges[]` | slugs dos desafios desta aula | `["escreva-oi"]` |

**Quiz — regras duras (medidas):**

- **Máx. 3 afirmações por aula** — `MAX_ASSERTIONS_PER_LESSON = 3` (`trackTypes.ts:508`); o loader
  reprova 4+ (`assertions com N itens (máximo 3 por aula)`). Use 2–3.
- `options` com **exatamente 4** itens, não vazios, únicos; `answerIndex` aponta o certo.
- `feedback` é o texto pós-resposta: diz por que a alternativa certa é certa (ou o erro do distrator),
  em tom diagnóstico, **nunca** dirigido à pessoa.
- `optionRationales`: ausente = válido (estado das 20 aulas de `a-tela`); `[]` = ausência explícita;
  não-vazio = comprimento **exatamente igual** ao de `options`, um racional por alternativa, na
  MESMA ordem (docs/16 §10). Racional = material que o tutor usa quando o aluno erra: a explicação
  do **distrator escolhido**.
- `sectionId` deve apontar a seção de teoria que demonstra a afirmação — **não renomeie ids de
  seção sem revalidar** (o quiz ancora neles).

## 2. `challenge.json` — o schema real

| Campo | O que vai |
|---|---|
| `slug` / `title` / `concept` | slug kebab único; `concept` ∈ `lesson.concepts` |
| `difficulty` | herda a rampa da aula (provisório, sem peso de gate) |
| `language` | `"python"` (o `track.json` da trilha declara `programmingLanguage: 'python'`, `runtime: 'cpython-3.14'`, `harnessLanguage: 'python'`) |
| `outputChannel` | a fase do canal: `"impressao"` · `"ambos"` · `"retorno"` (§3) |
| `statement` | markdown pt-BR, linguagem simples; o exemplo do enunciado **nunca** é caso de teste (J4) |
| `starterCode` | o esqueleto do aluno; **falha** nas provas (prova 2) |
| `testsCode` | o arquivo de teste (layout da fase, §3) |
| `solutionCode` | a solução de referência; **passa** e contém o átomo-alvo (A6/J2) |
| `expectedTestCount` | = número exato de testes (igualdade dupla: declarada == executada) |
| `requirements[]` | **objetos** `{id, teste, descricao}`, UM por método `test_*` (§2.1) |

Campos aditivos opcionais (docs/16 §10): `notRequired[]` (não vazio quando houver o que declarar),
`subgoals[]`, `foraDeEscopo` (obrigatório não-vazio na aula). O `a-tela` legado não tem
`requirements` — os **21 desafios legados saem com 21 GAPs declarados** no `requirements` da trilha
(dívida medida: `112 - 20 = 92` desafios novos com bijeção completa, 21 com gap).

- A função do desafio é derivada do slug (**kebab → snake_case**: `dobro-do-numero` →
  `dobro_do_numero`; **nunca** camelCase).
- **2–4 testes** por desafio de aula; **todo método `test_*` carrega docstring de uma linha em
  pt-BR** — é o rótulo do check no veredito (`unittest -v` imprime a docstring abaixo do id;
  sem ela o aluno leria `test_imprime_oi`, que é ruído).
- Proibições **sempre** (lista literal de `PY_FORBIDDEN_INVARIANTS`, `lang/python.ts:617`):
  `global:eval` · `global:exec` · `global:compile` · `global:__import__` · `global:globals` ·
  `global:locals` · `global:vars` · `api:importlib.import_module` ·
  `node:ComputedNonLiteralAttribute` · `node:DynamicAttributeHook`. Em **qualquer** superfície:
  statement, starter, teoria, solução, teste. Só em prosa com crase, nunca em bloco cercado.

### 2.1 `requirements[]` — bijeção 1:1 com os testes

O campo é um **array de objetos** `{id, teste, descricao}`; **string solta é ignorada e vira gap**
(medido). Um por método `test_*`, `teste` = o nome exato do método. Exemplo real (`ordenar`):

```json
"requirements": [
  { "id": "test_ordem_crescente_devolve_a_lista_em_ordem",
    "teste": "test_ordem_crescente_devolve_a_lista_em_ordem",
    "descricao": "ordem_crescente devolve a lista em ordem crescente" }
]
```

Fonte normativa: `derivarRequirements` lê os `test('…')`/`def test_...` do **arquivo de teste** (não
da solução nem do enunciado) e `validarRequirements` confere a bijeção nos dois sentidos — gap
`sempre` `testesSemRequirement`. Na trilha o placar real medido: **113 desafios · 92 bijeção
completa · 21 com gap** (os legados de `a-tela`), `requirements` sai **1** — e o `audit` continua 0.

## 3. As TRÊS fases de canal — o formato exato do arquivo de teste

A progressão é pedagógica e **não se inverte** (docs/17, "A tensão imprimir × devolver"): inverter
troca o modo de falha nº 1 de exercício gerado — solução imprime enquanto o teste espera retorno
(30,9% medido — docs/16 §10) — por uma concepção errada sobre `print` × `return`.

### FASE SAÍDA (`outputChannel: "impressao"`, M1–M3) — o arquivo é `frozenRegion` inteira

O aluno lê, nunca edita. Captura `stdout` com `runpy.run_path` (roda o arquivo **do zero a cada
chamada** — o `import` só executa na primeira vez e o segundo teste leria saída vazia) +
`io.StringIO` + `contextlib.redirect_stdout`. O arquivo do aluno é um **script**, sem função.
Exemplo real (`a-tela/a-primeira-linha/challenges/escreva-oi`):

```python
import contextlib
import io
import runpy
import unittest


def rodar():
    """Roda solucao.py do zero e devolve tudo o que ele imprimiu."""
    saida = io.StringIO()
    with contextlib.redirect_stdout(saida):
        runpy.run_path("solucao.py")
    return saida.getvalue()


class TestAPrimeiraLinha(unittest.TestCase):
    def test_imprime_oi(self):
        """o programa imprime oi"""
        self.assertEqual(rodar(), "oi\n")
```

- **Não existe** `if __name__ == "__main__": unittest.main()` no arquivo: o runner é
  `unittest discover`, que **nunca** executa esse bloco; deixá-lo faria o aluno ler `if`, `==` e
  `__name__` sem papel nenhum (4 construções receptivas a mais, de graça).
- **Por que `runpy.run_path` e não `importlib.import_module`**: `api:importlib.import_module` está
  em `PY_FORBIDDEN_INVARIANTS` — importar por nome montado em runtime faz o gate mentir.

### A VIRADA (`outputChannel: "ambos"` — M4, aula `imprimir-nao-e-devolver`) — TRÊS asserts

O mesmo desafio mede três fatos diferentes: o que a caixa **devolve**, o que o programa **imprime**,
e que **chamar a caixa sozinha não imprime nada** (o `print` da última linha é quem imprime).
Exemplo real (`caixas-que-devolvem/imprimir-nao-e-devolver/challenges/devolver-e-imprimir`,
`expectedTestCount: 3`):

```python
def test_devolve_a_saudacao(self):
    """a caixa devolve a saudacao"""
    self.assertEqual(saudacao("Ana"), "oi, Ana")

def test_imprime_a_saudacao(self):
    """o programa imprime a saudacao"""
    self.assertEqual(rodar(), "oi, Ana\n")

def test_chamar_sozinha_nao_imprime(self):
    """chamar a caixa sozinha nao imprime nada"""
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        saudacao("Bia")
    self.assertEqual(buffer.getvalue(), "")
```

### FASE VALOR (`outputChannel: "retorno"`, da virada em diante) — `from solucao import X`

```python
import unittest

from solucao import dobro


class TestDobro(unittest.TestCase):
    def test_dobro_de_2(self):
        """o dobro de 2 e 4"""
        self.assertEqual(dobro(2), 4)
```

**Medido no extrator real:** `from solucao import dobro` **não emite** `api:` nenhuma (o módulo do
aluno não é API — o import do módulo do aluno não gera chave, análogo ao import relativo do JS;
corrigido nesta execução). Variações legítimas vistas no disco: o teste pode importar com
`from solucao import x` (ex.: `juntar-numa-string`) ou rodar o arquivo com `runpy.run_path` e
indexar o dicionário (`rodar()["ordem_crescente"]`, ex.: `ordenar`) — o `runpy` também serve à fase
VALOR quando o teste quer o arquivo inteiro.

### Regras do arquivo de teste (todas medidas)

- `tests/__init__.py` obrigatório (exit-guard; sem ele nada roda).
- Runner: `python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v` — exit **0** passou ·
  **1** falhou · **5** nada rodou. Medido no docs/17: starter (só comentário) → exit 1; stub vazio
  (0 bytes) → exit 1; sem `tests/__init__.py` → `ImportError`; diretório sem `test_*.py` →
  `NO TESTS RAN` / exit 5.
- **Antes da aula `levantar-um-erro` (M9)**, os cenários possíveis são `example` e `boundary`;
  cenário `error` só existe se o orçamento tem a construção de levantar erro (A11 — foi a causa-raiz
  do desafio impossível da aula 1 da trilha legada).
- **Antes da aula `abrir-um-arquivo` (M11)**, teste que espera erro usa a **forma de chamada**
  `self.assertRaises(ValueError, dividir, 1, 0)` — **nunca** o gerenciador de contexto:
  `with self.assertRaises(...)` emite `node:With` + `node:withitem`, que A3 reprovaria no orçamento
  de entrada. A partir de M11 as duas formas são legítimas; o harness de M9–M10 usa a forma de
  chamada (regra declarada no docs/17).
- Em M20/M21, toda função enviada a processo é **função de módulo**, nunca `lambda` nem closure (o
  `forkserver` — padrão do 3.14 no Linux, medido — referencia o alvo por importação; `lambda`
  levantaria `PicklingError`).
- Cada teste falha com o starter e passa com a solução; `expectedTestCount` = nº exato.

## 4. A regra do par — como contar "construções produtivas novas"

Uma construção quase nunca produz uma única chave. Medido no extrator real:

```
printf 'x += 1\n' | python3 -I -S app/electron/main/engine/vocab/py/extract_ast.py
# → decl:aug · node:AugAssign · op:aug:+ · node:IntLiteral   (TRÊS chaves para UM gesto)
```

E A7/I2 limitam `introduces.productive` a **2 itens**. A resolução é normativa no docs/17:

> A tabela `Ensina` lista só a chave que **DISTINGUE**. O gerador de `introduces` acrescenta as
> chaves que a mesma construção produz inevitavelmente, e o conjunto conta como **UM item** para
> A7/I2.

As derivadas **não** são origem para efeito de I3 (quem registra primeiro fica com elas). O mapa é
fechado e mecânico (fonte: docs/17, verificador Ensina × Presume — 14 derivados na cadeia):

| Chave listada em `Ensina` | Derivadas que a mesma construção produz |
|---|---|
| `decl:assign`, `decl:unpack` | `node:Assign` |
| `decl:ann` | `node:AnnAssign` |
| `decl:aug`, `op:aug:<qualquer>` | `node:AugAssign` |
| `decl:walrus` | `node:NamedExpr` |
| `decl:global` | `node:Global` |
| `decl:nonlocal` | `node:Nonlocal` |
| `decl:except-as` | `node:ExceptHandler` |
| `op:binary:<qualquer>` | `node:BinOp` |
| `op:bool:<qualquer>` | `node:BoolOp` |
| `op:unary:<qualquer>` | `node:UnaryOp` |
| `op:compare:<qualquer>` | `node:Compare` |
| `node:With`, `node:AsyncWith` | `node:withitem` |
| `node:ListComp`, `node:SetComp`, `node:DictComp`, `node:GeneratorExp` | `node:comprehension` |
| `node:Match` | `node:match_case` |
| `node:Lambda`, `node:FunctionDef` | `node:arg` só quando a aula é a de parâmetro; senão nada |

## 5. As chaves sintéticas reais do adaptador Python — as ÚNICAS que existem

O `ast` do Python colapsa distinções que são evento de currículo; o adaptador refina
(fonte: `vocab/py/extract_ast.py`, `_sinteticos` e `_LITERAL_NODE`; docs/17):

| O que a aula precisa distinguir | Chave REAL emitida |
|---|---|
| número · texto · booleano · `None` · decimal · bytes · `...` | `node:IntLiteral`, `node:StrLiteral`, `node:BoolLiteral`, `node:NoneLiteral`, `node:FloatLiteral`, `node:BytesLiteral`, `node:ComplexLiteral`, `node:EllipsisLiteral` — **nunca** `node:Constant` cru |
| `elif` × `else:` + `if` (só o `col_offset` difere) | `node:Elif` |
| `if` com `else` × sem | `node:IfElse` |
| `for`/`while` com `else` | `node:ForElse`, `node:WhileElse` |
| `try` com `finally` | `node:Finally` |
| `except ValueError as e` | `decl:except-as` |
| `*args` · `**kwargs` · parâmetro com padrão | `decl:vararg`, `decl:kwarg`, `decl:default` |
| decorador (`@deco` — não é nó, vive em `decorator_list`) | `node:Decorator` |
| `a, b = 1, 2` | `decl:unpack` |
| as outras formas de ligação | `decl:assign` · `decl:ann` · `decl:aug` · `decl:walrus` · `decl:global` · `decl:nonlocal` |
| método × função | `node:MethodDef`; e os **dois** dunders refinados: `node:InitMethod`, `node:DunderStr` (os outros 14 protocolos são `MethodDef` para o gate — dívida declarada no docs/17) |
| `int \| None` em anotação (emite também `op:binary:\|` + `node:BinOp`) | `node:OptionalAnnotation` |
| comparador (um por operador de `a < b < c`) | `op:compare:<op>` |
| referência livre a builtin, por escopo (`symtable`) | `global:<nome>` |
| cadeia de atributo e import | `api:<caminho>` |
| proibições indecidíveis | `node:ComputedNonLiteralAttribute`, `node:DynamicAttributeHook` |

**Nove chaves INVENTADAS pela versão anterior que não existem** (cada uma produziria aula cujo
orçamento nunca casaria, em silêncio): `node:ChainedCompare`, `node:ClassBase`, `node:ClassVar`,
`node:ArgAnnotation`, `node:Returns`, `node:GenericAnnotation`, `node:ComprehensionIf`,
`node:DunderEnter`, `node:DunderExit`. Os eixos `node:`/`op:`/`decl:`/`global:` são **FECHADOS** e
validados por pertença estrita ao inventário `app/electron/main/engine/vocab/atoms.python.json`
(medido: **632 chaves** = node 118 · op 42 · decl 11 · global 164 · api 297); `api:` é aberto só no
formato. Nunca invente chave: rode o extrator real (§7) e use a chave EXATA emitida.

## 6. A entrada da trilha — axioma, estruturais e a semente receptiva ATUAL

Todo orçamento começa da entrada (docs/17, "Público e axioma de entrada").

- **Axioma de entrada PRODUTIVO: duas chaves, e só duas** — `node:Call` (a gramática de "rodar")
  e `node:StrLiteral` (a mensagem que o `print` mostra). Alargar o axioma é proibido: é o botão que
  faz o gate perdoar em silêncio o que a trilha nunca ensinou. Medido: `print("oi")` →
  `global:print` (a aula) + `node:Call` + `node:StrLiteral` (axioma). No disco, a aula 1 declara os
  três em `introduces.productive` (divergência ⚑ contrato × disco, declarada no docs/17 — as duas
  leituras passam no audit).
- **Estruturais sempre permitidos** (`PYTHON_STRUCTURAL_ALWAYS_ALLOWED`, `atomKeys.ts:545`):
  `node:Module` · `node:Name` · `node:Load` · `node:Store` · `node:Del` · `node:arguments` ·
  `node:Expr` · `node:alias` · `node:keyword`. Contexto de expressão e container — não carregam
  didática. Consequência: **`f(a=1)` (argumento nomeado) não introduz átomo nenhum** e é
  obrigatoriamente consolidação — `node:keyword` é estrutural.
- **Semente receptiva do harness Python ATUAL** (`PYTHON_HARNESS_RECEPTIVE_SEED`, `atomKeys.ts:490`
  — já com as correções desta execução): o que o aluno LÊ em todo desafio e não escreve em nenhum.

```
node:Module  node:FunctionDef  node:arguments  node:arg  node:Return  node:Name
node:Expr    node:Call         node:Attribute  node:Import  node:ImportFrom  node:alias
node:ClassDef  node:MethodDef  node:IntLiteral  node:StrLiteral
# fase SAÍDA — a captura de stdout:
node:With  node:withitem  node:Assign  decl:assign
# os módulos importados pelo harness, um por alias:
api:unittest  api:io  api:contextlib  api:runpy
# os membros que o harness chama:
api:unittest.TestCase  api:io.StringIO  api:contextlib.redirect_stdout  api:runpy.run_path
api:.getvalue  api:.assertEqual  api:.assertTrue  api:.assertIsNone  api:.assertRaises
# fase VALOR — as asserções consertadas (onda 4); o `from solucao import X` NÃO emite api::
api:.assertFalse  api:.assertNotEqual
```

Ela entra no receptivo da aula 1 e **nunca** no produtivo. Dívida do contrato paga: `global:unittest`
e `api:unittest.main` saíram (o `unittest` é importado → `api:unittest`; o bloco `__main__` foi
removido) e as oito chaves da SAÍDA entraram.

## 7. Antes de escrever — a cadeia de conferências

1. `introduces.productive` ≤ 2 (regra do par aplicada); `productive ⊆ receptive` (A7).
2. Toda chave existe no inventário (eixos fechados) — em dúvida, rode o extrator real:
   `printf 'SEU TRECHO\n' | python3 -I -S app/electron/main/engine/vocab/py/extract_ast.py` e use a
   chave EXATA emitida (nunca inventar; o universo é `atoms.python.json`, 632 chaves). O extrator
   roda sem node_modules — é Python puro com a stdlib.
3. O que a aula cobra está demonstrado em bloco cercado da PRÓPRIA teoria (A13) e reaparece no
   desafio (A6/J2); a primeira seção de teoria resolve o 1º desafio (A16).
4. O teste usa só o orçamento de ENTRADA (A3) — releia o teste com os olhos do aluno pré-aula.
5. Teste que **força** o átomo-alvo (P-CONTRA): ≥2 casos divergentes, esperados não-escalares,
   meta EXCESSO 0. Padrões "não-crú" (não-literal) medidos no curso: valores computados
   (`round(7 / 2, 1)`), visões `str(d.keys())`, conjuntos de 1 elemento, `hash(-1) == -2` —
   **nunca** string crua de dict/set multi-elemento (o mínimo sintetizado acharia o literal).
6. 2–3 `sources[]` oficiais com URL verificada (`curl -sI` → 200).
7. Newline final em todo arquivo (gate-lint L-04; a lista trunca em 8 — varredura própria do
   último byte quando houver dúvida).

## 8. Medições das ondas 1–5 (2026-09-11) — regras de produção que já custaram caro

- **Seções de teoria ≤ 560 chars MONTADOS** (markdown + cercas ```lang\ncode\n``` + explanation, o
  que o tutor realmente digita). O teste `tests/lessonTypewriterReadingSpeed.test.ts` trava a
  velocidade de leitura em 28 chars/s (7 tps) e o teto de paciência em **21 s por seção** → 21 × 28
  = **588 chars**; o alvo de 560 deixa folga. Acima disso, **encurte a prosa — nunca remova a
  demonstração da construção nova**.
- **`for a, b in ...` emite `node:Tuple`** (medido no extrator). Enumerate/zip ensinam com
  `for par in ...` + `par[0]`/`par[1]`; o desempacotamento (`decl:unpack`) é aula própria
  (`abrir-a-tupla-em-nomes`).
- **Receptor literal emite `api:str.join`** (medido: `"-".join(...)` → `api:str.join`), chave
  diferente de `api:.join`. Na teoria e na solução, demonstre métodos com **receptor-nome**
  (variável): `separador.join(itens)` → `api:.join` (`juntar-numa-string` faz exatamente isso).
- **Consolidação re-declara o `targetAtom` em `introduces.productive`** (padrão medido no disco:
  `mais-de-uma-linha → ['global:print']`; `imprimir-nao-e-devolver → ['node:Return',
  'global:print']`) — é como A6 (puxar algo) e I3 (unicidade de ORIGEM, não de menção) convivem.
  Consolidação sem degrau nomeado é aula que não ensina nada e o gate reclama.
- **`op:compare:is not` / `not in` NÃO são declaráveis**: `ATOM_KEY_RE` (`atomKeys.ts:120`) é
  `/^(node|decl|op|global|api|term|form):[^\s]+$/` — chave com espaço é descartada do `introduces`
  em silêncio → lacuna no audit. O operador base (`is`, `in`) é produtivo; a negação **só em prosa
  com crase** (é a regra normativa do docs/17; consertar a regex é decisão de engine para rodada
  futura).
- **`difficulty` 1..5** preencha pela rampa do grafo; nenhum gate pode lê-lo.
- **O veredito por leitura é proibido**: a sequência de saída é `audit` 0 → `coverage` 0 → 
  `requirements` bijeção → `track:validate`/`track:challenge:verify` (4 provas) → typewriter →
  gates de repo (comandos e exits em `validacao.md`; o que cada vermelho significa em
  `situacoes.md`).
