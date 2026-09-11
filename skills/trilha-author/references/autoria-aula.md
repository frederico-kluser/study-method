# Autoria de UMA aula — a receita completa

Regras de execução para o passo `autoria_aula`. Todo fato de schema e formato abaixo está no disco
(`app/electron/main/content/trackTypes.ts`) e nos contratos (`docs/16-engine-de-trilha.md` §10 e
`docs/17-trilha-python.md`). O exemplo vivo é a trilha `python` em
`app/resources/tracks/python/modules/a-tela/`.

## 0. A aula como unidade

Uma aula = `lesson.json` (teoria + quiz + fontes + `introduces`) **mais** um ou mais
`challenges/<slug>/challenge.json` (desafio com testes). Layout físico obrigatório (docs/17,
"Regras para os desafios de aula" e I13):

```
modules/<mod>/lessons/<aula>/lesson.json
modules/<mod>/lessons/<aula>/challenges/<desafio>/challenge.json
modules/<mod>/lessons/<aula>/challenges/<desafio>/solucao.py
modules/<mod>/lessons/<aula>/challenges/<desafio>/tests/__init__.py   ← OBRIGATÓRIO
modules/<mod>/lessons/<aula>/challenges/<desafio>/tests/test_solucao.py
```

O desafio de MÓDULO vive em `modules/<mod>/challenges/<slug>/challenge.json`, declarado no
`module.json` como `challenge` (ex.: `a-tela` → `rachando-a-conta`); ele compõe livremente o que o
módulo ensinou e **não pode introduzir construção nova** — um desafio de módulo que precisa de algo
não ensinado é a prova de que falta uma aula.

## 1. `lesson.json` — o schema

`schemaVersion: 1` (bumpar é **proibido**: comparado por igualdade estrita em quatro lugares,
docs/16 §10). Campos:

| Campo | O que vai |
|---|---|
| `slug` | kebab-case, ASCII; **globalmente único na trilha** (I12) e `slug === basename(dir)` (I13) |
| `title` / `summary` | pt-BR; resumo de uma linha |
| `difficulty` | 1..5 — **nenhum gate pode lê-lo** (docs/16 §10: não é sinal de nada, é o cronômetro do produto); preencha pela rampa do grafo |
| `role` | `regular` (introduz) · `integration` (composição — docs/16 §3.7) — o enum da engine tem esses dois valores; `consolidation` é o valor que o conteúdo de `python` usa no disco com o degrau nomeado, divergência declarada nos docs |
| `targetAtom` | a chave que a aula distingue (o átomo-alvo da lacuna única) |
| `concepts[]` | `concept.id` (não slug de aula); `challenge.concept` tem de pertencer a `lesson.concepts` (I16) |
| `prerequisites[]` | `concept.id` de arestas duras ou de `usa` — **nunca** `lesson.slug` (docs/16 §3.4: type check duro) |
| `introduces` | `productive[]` (≤2 itens — A7/I2; contados pela regra do par, §4) e `receptive[]`; invariante `productive ⊆ receptive` |
| `introducesTerms[]` | termos novos da prosa (`term:`) — não são átomos e não entram em `introduces.productive` |
| `theory[]` | seções `{id único (I15), title, markdown}` — markdown pt-BR com **blocos cercados ```python** (bloco com tag é código; crase inline é prosa; docs/16 §5.3) |
| `assertions[]` | o quiz da aula: `id`, `statement`, `question`, `options` (**exatamente 4**, não vazias, únicas), `answerIndex`, `feedback`, `sectionId?` (a seção que demonstra a afirmação), `optionRationales?` (opcional; se presente não-vazio, comprimento **exatamente igual** ao de `options`, na MESMA ordem — docs/16 §10) |
| `sources[]` | **2–3 fontes oficiais** (P-FONTE): `title`, `url` verificável (`docs.python.org`, `peps.python.org`), `description`. Nunca URL inventada |
| `challenges[]` | slugs dos desafios desta aula |

## 2. `challenge.json` — o schema

`language: "python"`, `concept` (pertencente a `lesson.concepts`), `difficulty`, `statement`
(markdown pt-BR, linguagem simples), `starterCode`, `testsCode`, `solutionCode`,
`expectedTestCount` (= nº de testes), `outputChannel`, e campos aditivos opcionais registrados em
docs/16 §10 (`requirements` — bijeção com os testes; `notRequired`; `subgoals`; `foraDeEscopo` não
vazio na aula). Regras duras do conteúdo:

- `outputChannel` segue a **progressão de canal** (docs/17):
  `impressao` (M1–M3: o teste assevera o `stdout` capturado) → `ambos` (a virada: retorno E saída no
  mesmo desafio) → `retorno` (o valor que a função devolveu). A ordem é pedagógica e não se
  inverte: inverter troca o modo de falha nº 1 de exercício gerado (solução imprime, teste espera
  retorno — docs/16 §10, 30,9% medido) por uma concepção errada sobre `print` × `return`.
- A função do desafio é derivada do slug (kebab → **snake_case**: `dobro-do-numero` →
  `dobro_do_numero`).
- `expectedTestCount` = contagem exata; a igualdade dupla (declarada == executada) é obrigatória em
  toda linguagem.
- 2–4 testes por desafio de aula; todo método de teste carrega **docstring de uma linha em pt-BR**
  — é o rótulo que o veredito mostra.

## 3. O arquivo de teste — os dois formatos

**FASE SAÍDA** (`outputChannel: "impressao"`): o arquivo é `frozenRegion` inteira — o aluno lê,
nunca edita. Captura `stdout` com `runpy.run_path` (roda o arquivo do zero a cada chamada) +
`io.StringIO` + `contextlib.redirect_stdout`:

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

**A VIRADA** (`outputChannel: "ambos"`): três testes — devolve, imprime, e **chamar sozinha não
imprime nada**:

```python
def rodar():
    """Roda solucao.py do zero; devolve o que ele definiu e o que ele imprimiu."""
    saida = io.StringIO()
    with contextlib.redirect_stdout(saida):
        nomes = runpy.run_path("solucao.py")
    return nomes, saida.getvalue()
```

**FASE VALOR** (`outputChannel: "retorno"`): importa o nome:

```python
import unittest

from solucao import dobro


class TestDobro(unittest.TestCase):
    def test_dobro_de_2(self):
        """o dobro de 2 e 4"""
        self.assertEqual(dobro(2), 4)
```

Regras do arquivo de teste (todas medidas, docs/17):

- `tests/__init__.py` é **obrigatório** — é o exit-guard (`PY_PACKAGE_MARKER_CONTENT`) e sem ele o
  `python3 -B -m unittest discover` recusa a descoberta: `ImportError: Start directory is not
  importable`.
- **Não** existe `if __name__ == "__main__": unittest.main()` no arquivo: o runner é
  `unittest discover`, que nunca executa esse bloco; deixá-lo faria o aluno ler 4 construções
  receptivas a mais sem papel nenhum.
- O runner é: `python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v`.
  Exit **0** passou · **1** falhou · **5** nada rodou.
- Antes da aula `levantar-um-erro` (M9 da trilha de referência), cenários possíveis são `example` e
  `boundary`; cenário `error` só existe se o orçamento tiver a construção de levantar erro (A11).
- Antes da aula `abrir-um-arquivo` (M11 de referência), teste que espera erro usa a **forma de
  chamada** — `self.assertRaises(ValueError, dividir, 1, 0)` — e nunca o gerenciador de contexto:
  `with self.assertRaises(...)` emite `node:With`, que A3 reprovaria no orçamento de entrada.
- **Proibições sempre**, em qualquer aula, starter, teoria ou solução (lista literal de
  `PY_FORBIDDEN_INVARIANTS`): `eval`, `exec`, `compile`, `__import__`, `globals()`, `locals()`,
  `vars()`, `importlib.import_module`, `getattr`/`setattr` com nome não-literal, e definir
  `__getattr__`/`__getattribute__`. Elas aparecem **só em prosa com crase**, nunca em bloco cercado.

## 4. A regra do par — como contar "construções produtivas novas"

Uma única construção da linguagem quase nunca produz uma única chave. Medido
(`printf 'x += 1\n' | extract_ast.py`): `x += 1` emite `decl:aug` · `node:AugAssign` · `op:aug:+` ·
`node:IntLiteral` — **três chaves para UM gesto**, e A7 limita `introduces.productive` a 2 itens.
A resolução é normativa em docs/17:

> A tabela `Ensina` lista só a chave que DISTINGUE. O gerador de `introduces` acrescenta as chaves
> que a mesma construção produz inevitavelmente, e o conjunto conta como UM item para A7/I2.

As derivadas **não** são origem para efeito de I3 (quem registra primeiro fica com elas). O mapa é
fechado e mecânico:

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
| `node:Lambda`, `node:FunctionDef` | `node:arg` só quando a aula é a de parâmetro; caso contrário nada |

## 5. As chaves sintéticas do adaptador Python — as ÚNICAS que existem

O `ast` do Python colapsa distinções que são evento de currículo; o adaptador refina e emite
(**fontes**: `vocab/py/extract_ast.py`, `_sinteticos` e `_LITERAL_NODE`; docs/17 §"As chaves
sintéticas REAIS"). Nenhuma outra chave sintética pode ser usada em `Ensina`:

- literais refinados: `node:IntLiteral`, `node:StrLiteral`, `node:BoolLiteral`, `node:NoneLiteral`,
  `node:FloatLiteral`, `node:BytesLiteral`, `node:ComplexLiteral`, `node:EllipsisLiteral` — e
  **nunca** um `node:Constant` cru;
- `node:Elif` (elif × else+if têm AST idêntica, só o `col_offset` difere) · `node:IfElse` (if com
  else × sem) · `node:ForElse` / `node:WhileElse` · `node:Finally`;
- `decl:except-as` · `decl:vararg` / `decl:kwarg` / `decl:default` (parâmetros) ·
  `node:Decorator` (vive em `decorator_list`, não é nó) · `decl:unpack` (`a, b = 1, 2`) ·
  `decl:assign` / `decl:ann` / `decl:aug` / `decl:walrus` / `decl:global` / `decl:nonlocal`;
- `node:MethodDef` (método × função) e os **dois** dunders refinados: `node:InitMethod`,
  `node:DunderStr` — todos os outros dunders são `node:MethodDef` para o gate;
- `node:OptionalAnnotation` (`int | None` em anotação, que emite também `op:binary:|` +
  `node:BinOp`) · `op:compare:<op>` (família própria: `==`, `<`, `in`, `is` são `ast.Compare`,
  não `BinOp`) · `global:<builtin>` · `api:<caminho>`.

Nove chaves que a versão anterior **inventou e não existem** (cada uma produziria aula cujo
orçamento nunca casaria, em silêncio): `node:ChainedCompare`, `node:ClassBase`, `node:ClassVar`,
`node:ArgAnnotation`, `node:Returns`, `node:GenericAnnotation`, `node:ComprehensionIf`,
`node:DunderEnter`, `node:DunderExit`. Os eixos `node:`/`op:`/`decl:`/`global:` são **FECHADOS**,
validados por pertença estrita ao inventário (`app/electron/main/engine/vocab/atoms.python.json`,
632 chaves); `api:` é aberto só no formato.

## 6. A entrada da trilha — axioma, semente e estruturais

Todo orçamento começa da entrada. Para a trilha de referência (docs/17, §"Público e axioma de
entrada"):

- **Axioma de entrada PRODUTIVO: duas chaves, e só duas** — `node:Call` e `node:StrLiteral`
  (gramática de "rodar" e o texto que o `print` mostra; alargar o axioma é proibido — é o botão que
  faz o gate perdoar em silêncio o que a trilha nunca ensinou). Estruturais sempre permitidos
  (`PYTHON_STRUCTURAL_ALWAYS_ALLOWED`): `node:Module`, `node:Name`, `node:Load`, `node:Store`,
  `node:Del`, `node:arguments`, `node:Expr`, `node:alias`, `node:keyword`.
- **Semente receptiva do harness Python** (`PYTHON_HARNESS_RECEPTIVE_SEED`, `atomKeys.ts:387`):
  `node:Module  node:FunctionDef  node:arguments  node:arg  node:Return  node:Name` ·
  `node:Expr  node:Call  node:Attribute  node:Import  node:ImportFrom  node:alias` ·
  `node:ClassDef  node:MethodDef  node:IntLiteral  node:StrLiteral` · `global:unittest` ·
  `api:unittest.TestCase  api:unittest.main` · `api:.assertEqual  api:.assertTrue  api:.assertIsNone
  api:.assertRaises`. O harness da fase SAÍDA usa mais oito chaves ( `node:With`, `node:withitem`,
  `node:Assign`, `decl:assign`, `api:runpy.run_path`, `api:io.StringIO`,
  `api:contextlib.redirect_stdout`, `api:.getvalue` ) — dívida declarada no contrato até
  `atomKeys.ts` sincronizar.
- Consequência medida: a aula 1 (`print("oi")`) introduz **exatamente um** átomo produtivo no
  texto do contrato (`global:print`); no disco as duas chaves do axioma também aparecem declaradas
  na aula 1 — as duas leituras passam no `audit` (divergência declarada entre doc e disco, e nenhuma
  das duas é defeito).

## 7. Antes de escrever — confira a cadeia

1. `introduces.productive` ≤ 2 (regra do par aplicada); `productive ⊆ receptive` (A7).
2. Toda chave de `Ensina` existe no inventário (eixos fechados) — conferido pela verificação
   Ensina × Presume do docs/17 (script reexecutável sobre as tabelas) e pela validação de pertença
   estrita da engine (`phases/f0Brief.ts:578`).
3. O que a aula cobra está demonstrado em bloco cercado da própria teoria (A13) e reaparece no
   desafio (A6/J2) — não escreva teste que passe com `return` constante nem com um único literal
   impresso (J5; ver `qualidade-aula.md`).
4. O teste usa só o orçamento de ENTRADA (A3) — releia o teste com os olhos do aluno pré-aula.
5. 2–3 `sources[]` oficiais e verificáveis.
