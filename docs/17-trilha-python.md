# 17 — A trilha de Python

> **Contrato de CONTEÚDO da ÚNICA trilha do produto.** Slug: `python`. Não é "Python do zero" nem
> "Python avançado" — é **o curso de Python**, do primeiro `print` até o que se cobra de uma pessoa
> sênior. Este documento define O QUÊ cada módulo e cada aula ensinam e o que se presume que o aluno
> já sabe. Ele é o INSUMO da engine: a coluna `Ensina` vira `introduces` e a coluna `Presume` vira o
> grafo de pré-requisitos e o orçamento cumulativo de
> [`16-engine-de-trilha.md`](16-engine-de-trilha.md) §3.5.
>
> **Autoridade.** Onde este documento e [`16-engine-de-trilha.md`](16-engine-de-trilha.md)
> divergirem, o 16 vence. Onde este documento e um gate determinístico divergirem, o gate vence — e
> este documento está errado. As duas divergências normativas que este documento **declara** (a
> regra do par, §"A regra do par", e o teto de consolidações por módulo) estão medidas e explicadas
> no lugar onde aparecem.
>
> **Uma trilha só.** Não existe trilha introdutória separada, não existe trilha de TypeScript e não
> existe trilha "avançada". O aluno entra sem nunca ter programado e sai capaz de trabalhar como
> sênior em Python. A capacidade de auditar TypeScript continua na ENGINE
> (`app/electron/main/engine/lang/typescript.ts`, implementada e testada) — ela é infraestrutura,
> não conteúdo.
>
> **Base.** Fatos de linguagem medidos nesta máquina (CPython 3.14.7 — cada comando aparece ao lado
> do número que ele produz, como exige o `CONTRIBUTING.md`); o adaptador REAL
> (`app/electron/main/engine/lang/python.ts` + `app/electron/main/engine/vocab/py/extract_ast.py`),
> cujo inventário de 632 chaves é o vocabulário fechado desta trilha; os princípios de
> [`02-pedagogia.md`](02-pedagogia.md); e, como fonte externa nomeada, John M. Zelle, *Python as a
> First Language* — "Python programs look like executable pseudo-code", "block structure is
> indicated by indentation", "Python is dynamically typed, so there is no need for variable
> declarations".

---

## A aula 1 é só `print`, e é uma ordem do dono

> "eu nao pedi um curso de programaçao do zero, TODOS OS CURSOS COMECAM DO ZERO E VAO ATE O SENIOR"
>
> "A MERDA DO CURSO DE NODEJS JA COMEÇA FALANDO DE FUNÇAO PARAMETRO NA PRIMEIRA AULA,
> a primeira aula deveria ser so um console.log e acabou"

A versão anterior deste documento punha `print` na **aula 9**, "como contraste", e abria a trilha com
o aluno digitando o número `7` dentro de um invólucro de função congelado. Aquilo está **revogado**.

A aula 1 é:

```python
print("oi")
```

Uma linha, escrita pelo aluno, na coluna zero, sem função, sem parâmetro, sem retorno, sem variável
e sem recuo. Ele roda, vê `oi` aparecer, e acabou.

Tudo o que vem abaixo — a ordem dos módulos, o formato dos testes, o axioma de entrada — é
consequência dessa decisão, não o contrário.

---

## A tensão imprimir × devolver, e como a ferramenta cede

[`16`](16-engine-de-trilha.md) §10 mede o modo de falha número um de exercício gerado: **a solução
imprime enquanto o teste espera retorno** (de 165 exercícios com solução e testes, 51 — 30,9% —
tinham solução que passava nos próprios testes). Foi esse número que fez a versão anterior adiar o
`print` para a aula 9.

**Aquilo era restrição da FERRAMENTA, não da pedagogia — e a ferramenta cede.** O arquivo
`tests/test_solucao.py` é Python arbitrário: ele pode capturar a **saída padrão** com
`io.StringIO` + `contextlib.redirect_stdout` e asseverar o que apareceu na tela, exatamente como
assevera um valor de retorno. Medido nesta máquina, com as quatro provas de execução de
[`16`](16-engine-de-trilha.md) §5.4 passando.

### A progressão de canal, em três fases

| Fase | Módulos | `outputChannel` | O que o teste assevera |
|---|---|---|---|
| **SAÍDA** | M1 a M3 | `impressao` | o texto que o programa imprimiu (`stdout` capturado) |
| **A VIRADA** | M4, aula `imprimir-nao-e-devolver` | `ambos` | o retorno **e** a saída, no mesmo desafio |
| **VALOR** | M4 (a partir da virada) a M26 | `retorno` | o valor que a função devolveu |

A aula da virada é uma das mais importantes do curso, e ela só é possível **depois** de o aluno ter
as duas coisas nas mãos: ele aprende `print` na aula 1 e `return` no módulo 4, e a aula seguinte põe
as duas no mesmo desafio, com três testes que medem três fatos diferentes — o que a caixa devolve, o
que o programa imprime, e que **chamar a caixa sozinha não imprime nada**. O aluno vê com os próprios
olhos que são coisas distintas, em vez de descobrir isso num veredito vermelho.

Inverter a ordem (ensinar `return` antes de `print`, como a versão anterior fazia) troca um problema
por outro: evita o modo de falha nº 1 no gate e **cria** a concepção errada de que "programa que não
devolve não serve", que é o que todo material de Python contradiz na primeira página.

### O formato exato do arquivo de teste — FASE SAÍDA

Este é o arquivo que torna a aula 1 possível. Ele é `frozenRegion` inteira: o aluno lê, nunca edita.

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

**Por que `runpy.run_path` e não `importlib.import_module`.** `api:importlib.import_module` está em
`PY_FORBIDDEN_INVARIANTS` (`app/electron/main/engine/lang/python.ts`) — importar por nome montado em
tempo de execução faz o gate mentir, e a proibição é global. `runpy.run_path` não está na lista, roda
o arquivo **do zero a cada chamada** (o `import` só executa na primeira vez, e um segundo teste leria
saída vazia) e não deixa o módulo em `sys.modules`. Medido: dois testes na mesma classe, os dois
verdes, com a mesma saída.

**Por que não existe `if __name__ == "__main__": unittest.main()`.** O runner é
`unittest discover`, que **nunca** executa esse bloco. Deixá-lo no arquivo faria o aluno ler, na aula
1, um `if`, uma comparação, um `==` e um `__name__` que não têm papel nenhum — quatro construções
receptivas a mais, de graça, num arquivo cuja única função é ser lido. Ele sai.

### O formato exato do arquivo de teste — A VIRADA (`outputChannel: 'ambos'`)

```python
import contextlib
import io
import runpy
import unittest


def rodar():
    """Roda solucao.py do zero; devolve o que ele definiu e o que ele imprimiu."""
    saida = io.StringIO()
    with contextlib.redirect_stdout(saida):
        nomes = runpy.run_path("solucao.py")
    return nomes, saida.getvalue()


class TestImprimirNaoEDevolver(unittest.TestCase):
    def test_devolve_a_saudacao(self):
        """a caixa DEVOLVE a saudacao"""
        nomes, _ = rodar()
        self.assertEqual(nomes["saudacao"]("Ana"), "oi, Ana")

    def test_imprime_a_saudacao(self):
        """o programa IMPRIME a saudacao"""
        _, texto = rodar()
        self.assertEqual(texto, "oi, Ana\n")

    def test_chamar_sozinha_nao_imprime(self):
        """chamar a caixa sozinha nao imprime nada"""
        nomes, _ = rodar()
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            nomes["saudacao"]("Bia")
        self.assertEqual(buffer.getvalue(), "")
```

### O formato exato do arquivo de teste — FASE VALOR

```python
import unittest

from solucao import dobro


class TestDobro(unittest.TestCase):
    def test_dobro_de_2(self):
        """o dobro de 2 e 4"""
        self.assertEqual(dobro(2), 4)
```

### As quatro provas, medidas

```bash
cd <desafio> && python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v
#  solução de referência   -> "Ran 1 test" / OK                 / exit 0
#  starter (só comentário) -> "FAILED (failures=1)"             / exit 1
#  stub vazio (0 bytes)    -> "FAILED (failures=1)"             / exit 1
#  sem tests/__init__.py   -> ImportError: Start directory is not importable
#  diretório sem test_*.py -> "NO TESTS RAN"                    / exit 5
```

O `tests/__init__.py` continua **obrigatório** e continua sendo o exit-guard
(`PY_PACKAGE_MARKER_CONTENT` em `lang/python.ts`): ele é o primeiro código do desafio a rodar e
bloqueia `os._exit`/`os.abort`, que forjariam um relatório verde.

---

## Público e axioma de entrada

**Público: quem nunca programou.** Zero absoluto. E a mesma pessoa, 313 aulas depois, sai sênior —
não há segunda trilha para onde mandá-la.

**Axioma de entrada RECEPTIVO:** a semente do harness (§"A semente receptiva"), pela política
`receptive-seed` ([`16`](16-engine-de-trilha.md) §3.2/D1). É o que o aluno lê no arquivo de teste e
não escreve em lugar nenhum.

**Axioma de entrada PRODUTIVO: duas chaves, e só duas.**

| Chave | Por que é axioma e não aula |
|---|---|
| `node:Call` | não existe programa em Python que **faça** alguma coisa sem uma chamada. Uma aula "chamar" precisaria de um desafio em que o aluno chama algo — e não há nada para chamar antes de `print`. É a gramática de "rodar", não conteúdo. Já está na semente RECEPTIVA do harness (`atomKeys.ts:395`); o axioma apenas a promove |
| `node:StrLiteral` | é a mensagem que o `print` mostra. Separar as duas coisas exigiria uma aula "chamar `print` sem argumento", que não mostra nada na tela e viola J6 (o passo apagado tem de ser o átomo-alvo). Também já está na semente receptiva (`atomKeys.ts:403`) |

**Consequência: a aula 1 introduz EXATAMENTE UM átomo produtivo — `global:print`.** Medido:

```bash
printf 'print("oi")\n' | python3 -I -S app/electron/main/engine/vocab/py/extract_ast.py
# chaves não-estruturais: global:print · node:Call · node:StrLiteral
#   node:Call e node:StrLiteral = axioma · global:print = a aula
```

Isso satisfaz o gate inteiro sem exceção nenhuma: **A6** (a direção puxada — a solução contém
`global:print`, que está em `introduces.productive`), **A7** (1 ≤ 2), **A12/A14a** (1 elemento novo),
**A14b** (1 construção nova na única linha), **A13/A16** (a primeira seção da teoria demonstra
`print("bom dia")` num bloco `python`).

Alargar o axioma além dessas duas chaves é proibido: é exatamente o botão que faz o gate perdoar em
silêncio o que a trilha nunca ensinou.

---

## Os fatos da linguagem que governam esta trilha

Todos medidos nesta máquina; cada linha traz o comando.

| Fato | Consequência de currículo |
|---|---|
| `python3 --version` → **3.14.7** (CPython) | é a versão do inventário `atoms.python.json`; `TemplateStr`/`Interpolation` (PEP 750) só existem a partir dela |
| Runner: `python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v` | não há framework a instalar; `unittest` é stdlib |
| `tests/__init__.py` é **OBRIGATÓRIO** | sem ele o 3.14 recusa a descoberta: `ImportError: Start directory is not importable` |
| Exit **0** passou · **1** falhou · **5** nada rodou | não existe o buraco "exit 0 com zero testes" do Node; a igualdade dupla de contagem continua obrigatória |
| **Não existe `export`** | o `node:ExportKeyword`, 3ª aula produtiva da trilha JS, **não tem aula em Python**: o nome do módulo já é público e o teste faz `from solucao import resposta` |
| **Não existe palavra-chave de declaração** (Zelle) | o eixo `decl:` é repreposto para **formas de ligação** (§"Vocabulário") |
| **Não existe `const`** | nada impede a religação; prometer imutabilidade seria mentir. O lugar dela é ocupado por `print` × `return` e por `None` |
| **Bloco é recuo, não chave** (Zelle) | o recuo é evento de currículo próprio e é **invisível na AST**: entra como `term:recuo` e `notionalMachineDelta` na aula `se` (M2), a primeira em que o aluno escreve uma linha que **pertence a outra** |
| Número, texto, booleano e `None` são o **mesmo** `ast.Constant` | sem refinar o literal por tipo de valor, a aula de texto introduziria ZERO construção nova (A6). O adaptador refina — ver §"As chaves sintéticas" |
| `multiprocessing.get_start_method()` → **`forkserver`** | o padrão do 3.14 no Linux. Toda aula de processo usa **função de módulo**, nunca `lambda` nem closure: o `forkserver` referencia por importação. Medido: `ProcessPoolExecutor` com função de módulo roda dentro do `unittest discover`, verde, em 0,066 s |
| Proibições sempre: `eval`, `exec`, `compile`, `__import__`, `globals()`, `locals()`, `vars()`, `importlib.import_module`, `getattr`/`setattr` com nome não-literal, `__getattr__`/`__getattribute__` definidos | é a lista literal de `PY_FORBIDDEN_INVARIANTS` (`lang/python.ts`). Nenhuma aula desta trilha as ensina, em nível nenhum. Elas aparecem **só em prosa com crase**, nunca em bloco cercado — [`16`](16-engine-de-trilha.md) §5.3: "bloco cercado com tag é código; crase inline é prosa" |

---

## O que o `ast` esconde — as chaves sintéticas REAIS do adaptador

O `ast` do Python colapsa distinções que são eventos de currículo. O adaptador refina, e **estas são
as únicas chaves sintéticas que existem** (fonte: `vocab/py/extract_ast.py`, função `_sinteticos` e
tabela `_LITERAL_NODE`). Nenhuma outra pode ser usada em `Ensina`:

| O que a aula precisa distinguir | O que o `ast` entrega | Chave REAL emitida |
|---|---|---|
| número · texto · booleano · `None` · decimal · bytes · `...` | tudo é `Constant` | `node:IntLiteral`, `node:StrLiteral`, `node:BoolLiteral`, `node:NoneLiteral`, `node:FloatLiteral`, `node:BytesLiteral`, `node:ComplexLiteral`, `node:EllipsisLiteral` — e **nunca** um `node:Constant` cru |
| `elif` × `else:` seguido de `if` | AST idêntica; só o `col_offset` difere (4 × 8) | `node:Elif` |
| `if` com `else` × `if` sem `else` | `If.orelse` vazio ou não | `node:IfElse` |
| `for`/`while` com `else` | `For.orelse`/`While.orelse` | `node:ForElse`, `node:WhileElse` |
| `try` com `finally` | `Try.finalbody` | `node:Finally` |
| `except ValueError as e` | `ExceptHandler.name` | `decl:except-as` |
| `*args` · `**kwargs` · parâmetro com padrão | são `arg` comuns | `decl:vararg`, `decl:kwarg`, `decl:default` |
| decorador (`@deco`) | **nenhum nó**: vive em `decorator_list` | `node:Decorator` |
| `a, b = 1, 2` | `Assign` com alvo `Tuple` | `decl:unpack` |
| as outras formas de ligação | `Assign`/`AnnAssign`/`AugAssign`/`NamedExpr`/`Global`/`Nonlocal` | `decl:assign`, `decl:ann`, `decl:aug`, `decl:walrus`, `decl:global`, `decl:nonlocal` |
| método × função | ambos são `FunctionDef` | `node:MethodDef`; e `node:InitMethod`/`node:DunderStr` para os **dois** dunders refinados |
| `int \| None` em anotação × `\|` bit a bit | ambos são `BinOp(BitOr)` | `node:OptionalAnnotation` |
| referência livre a builtin, por escopo (`symtable`) | `Name` | `global:<nome>` |
| cadeia de atributo e import | `Attribute`/`Import`/`ImportFrom` | `api:<caminho>` |
| comparador (um por operador de `a < b < c`) | `Compare.ops` | `op:compare:<op>` |
| proibições indecidíveis | — | `node:ComputedNonLiteralAttribute`, `node:DynamicAttributeHook` |

**As nove chaves que a versão anterior INVENTOU e que não existem.** Cada uma teria produzido uma
aula cujo orçamento nunca casaria, em silêncio. Conferidas contra
`app/electron/main/engine/vocab/atoms.python.json` (eixos `node:`/`op:`/`decl:`/`global:` são
FECHADOS e validados por pertença estrita — `phases/f0Brief.ts:578`):

| Chave inventada | O que o adaptador realmente emite | O que esta versão faz |
|---|---|---|
| `node:ChainedCompare` | `0 < x < 10` → `node:Compare` + **um** `op:compare:<` | a aula `comparar-encadeado` vira consolidação |
| `node:ClassBase` | `class B(A)` → `node:ClassDef` + `node:Name` | `herdar` vira consolidação (forma nova de `ClassDef`) |
| `node:ClassVar` | atributo de classe → `decl:assign` no corpo | `atributo-da-classe` vira consolidação |
| `node:ArgAnnotation` | `def f(x: int)` → `global:int` e mais nada | `anotar-parametro-e-retorno` vira consolidação |
| `node:Returns` | `-> int` → `global:int` e mais nada | idem |
| `node:GenericAnnotation` | `list[int]` → `node:Subscript` + `global:list` | `lista-de-que-tipo` vira consolidação |
| `node:ComprehensionIf` | `[n for n in xs if n]` → `node:ListComp` + `node:comprehension` | `filtrar-na-compreensao` vira consolidação |
| `node:DunderEnter` | `__enter__` → só `node:MethodDef` | `o-proprio-with` vira consolidação |
| `node:DunderExit` | `__exit__` → só `node:MethodDef` | idem |

Comando que reproduz qualquer linha desta tabela:

```bash
printf '0 < x < 10\n' | python3 -I -S app/electron/main/engine/vocab/py/extract_ast.py
python3 -c "import json;d=json.load(open('app/electron/main/engine/vocab/atoms.python.json'));\
print('node:ChainedCompare' in d['axes']['node'], d['total'])"   # -> False 632
```

---

## Vocabulário de átomos desta trilha

Os seis eixos de [`16`](16-engine-de-trilha.md) §3.1, com a forma que cada um assume em Python.

| Eixo | Forma da chave em Python | Aberto? | Exemplo |
|---|---|---|---|
| nós | `node:<ClassName do ast>` mais as sintéticas acima | FECHADO | `node:FunctionDef`, `node:IntLiteral` |
| ligação (o antigo `decl:`) | `decl:<forma de ligação>` — as onze | FECHADO | `decl:assign`, `decl:unpack`, `decl:walrus` |
| operadores | `op:<família>:<op>` — famílias `binary`, `compare`, `bool`, `unary`, `aug` | FECHADO | `op:binary:+`, `op:compare:==`, `op:bool:and` |
| globais | `global:<builtin>` | FECHADO | `global:print`, `global:len`, `global:range` |
| API | `api:<módulo>.<nome>` quando a raiz é importada ou builtin; `api:.<método>` quando o receptor é nome local | **ABERTO** (só formato) | `api:math.sqrt`, `api:.append` |
| termos da prosa | `term:<termo pt-BR>` | não-vocabulário | `term:recuo`, `term:traceback` |

Três decisões declaradas, com o motivo:

1. **`decl:` significa "forma de ligação de nome", não "palavra-chave de declaração".** Python não
   tem `let`/`const`/`var`, mas tem onze formas distintas de ligar um nome a um valor, e trocar de
   forma é exatamente o evento de currículo que I11 exige que tenha aula própria.
2. **A progressão de "variável" é `decl:assign` → `decl:aug` → `decl:unpack` → `decl:global` →
   `decl:nonlocal` → `decl:walrus` → `decl:ann`.** Não há `const`.
3. **`op:compare:` é família própria, separada de `op:binary:`.** Em Python `==`, `<`, `in` e `is`
   são `ast.Compare`, não `ast.BinOp`. Misturar faria o orçamento de uma aula de igualdade liberar
   aritmética.

### A regra do par — a divergência normativa que este documento declara

Uma única construção da linguagem quase nunca produz uma única chave. Medido:

```bash
printf 'x += 1\n' | python3 -I -S app/electron/main/engine/vocab/py/extract_ast.py
# decl:aug · node:AugAssign · op:aug:+ · node:IntLiteral   → TRÊS chaves para UM gesto
```

A regra A7 ([`16`](16-engine-de-trilha.md) §5.1) limita `introduces.productive` a **2 itens**. Lida
sobre chaves cruas, ela tornaria ilegal ensinar `+=`. A resolução, e ela é **normativa aqui**:

> **A tabela `Ensina` lista só a chave que DISTINGUE. O gerador de `introduces` acrescenta as chaves
> que a mesma construção produz inevitavelmente, e o conjunto conta como UM item para A7/I2.**

As chaves acrescentadas (`derivadas`) **não** são origem para efeito de I3 — quem as registra
primeiro fica com elas, e nenhuma aula posterior é acusada de segunda origem. O mapa é fechado e
mecânico; o script de verificação no fim deste documento o implementa:

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

### A semente receptiva do harness Python

O que o aluno lê em TODO desafio e não escreve em nenhum. Entra no receptivo da aula 1 e nunca no
produtivo. **Esta lista é a fonte normativa de `PYTHON_HARNESS_RECEPTIVE_SEED`**
(`app/electron/main/engine/atomKeys.ts:387`):

```
node:Module  node:FunctionDef  node:arguments  node:arg  node:Return  node:Name
node:Expr    node:Call         node:Attribute  node:Import  node:ImportFrom  node:alias
node:ClassDef  node:MethodDef  node:IntLiteral  node:StrLiteral
global:unittest
api:unittest.TestCase  api:unittest.main
api:.assertEqual  api:.assertTrue  api:.assertIsNone  api:.assertRaises
```

**Delta DECLARADO em relação ao código de hoje.** O harness da fase SAÍDA (que a aula 1 exige) usa
construções que a lista acima não tem. Medido sobre o arquivo de teste da aula 1, as chaves que
FALTAM em `PYTHON_HARNESS_RECEPTIVE_SEED`:

```
node:With  node:withitem  node:Assign  decl:assign
api:runpy.run_path  api:io.StringIO  api:contextlib.redirect_stdout  api:.getvalue
```

E duas chaves da lista de hoje que **nunca ocorrem** e são ruído: `global:unittest` (o `unittest` é
importado, não builtin — o extrator emite `api:unittest`) e `api:unittest.main` (só aparece com o
bloco `if __name__ == "__main__"`, que esta trilha remove). Sincronizar `atomKeys.ts` é **dívida
declarada** desta onda; até lá, um desafio da fase SAÍDA reprova em A3 por oito chaves que o
documento autoriza e o código ainda não conhece.

**Estruturais sempre permitidos** (o análogo Python de `STRUCTURAL_ALWAYS_ALLOWED`, fonte de
`PYTHON_STRUCTURAL_ALWAYS_ALLOWED`, `atomKeys.ts:425`): `node:Module`, `node:Name`, `node:Load`,
`node:Store`, `node:Del`, `node:arguments`, `node:Expr`, `node:alias`, `node:keyword`. São contexto
de expressão e container — não carregam didática nenhuma.

`node:keyword` estar aqui tem consequência: **a aula de argumento nomeado (`f(a=1)`) não introduz
átomo nenhum** e é obrigatoriamente uma consolidação. A versão anterior a declarava como
`node:keyword` e ao mesmo tempo listava `node:keyword` como estrutural — contradição consigo mesma,
corrigida aqui.

---

## Princípios pedagógicos aplicados

1. **A primeira construção é a que produz efeito visível.** O aluno escreve `print`, roda e vê. Não
   há invólucro congelado, não há função para preencher, não há "isso a gente explica depois".
2. **Recuo só quando houver o que recuar.** As 20 aulas do módulo 1 são todas na coluna zero. O
   recuo entra na aula `se` (M2), a primeira em que uma linha pertence a outra.
3. **Saída antes de valor, e a diferença é aula.** M1–M3 asseveram `stdout`; M4 ensina `return` e a
   aula seguinte põe os dois no mesmo desafio. Ver §"A tensão imprimir × devolver".
4. **Pre-training → worked example → fading → prática independente.** Cada aula entrega a base
   conceitual, depois um exemplo completamente resolvido com sub-objetivos rotulados, e só então o
   desafio. O desafio nunca é "resolva do zero sem andaime".
5. **Um erro por vez, com nome.** `SyntaxError` e `NameError` na aula 20 do módulo 1, quando o
   traceback ainda tem uma linha; `IndentationError` como consequência da aula `se`; o traceback com
   pilha só em M9, quando já existe função chamando função.
6. **Interleaving e recuperação espaçada** (A15b/I7): toda aula reutiliza ao menos um átomo
   demonstrado antes — a coluna `Presume` é a prova mecânica disso — e nenhuma família sintática
   ocupa três aulas seguidas sem intercalação.
7. **Linguagem simples, zero jargão sem explicação** — analogias do dia a dia; termos em inglês só
   quando são o nome real da coisa (`traceback`, `import`, `GIL`).
8. **Fontes fora do fluxo** — URLs ficam em `sources[]` e aparecem só no botão "Fontes".

---

## Estrutura da trilha

**26 módulos, 337 aulas.** O número de aulas é **saída, não entrada**
([`16`](16-engine-de-trilha.md) §3.6): ele é a consequência de aplicar o teto de ≤2 construções
produtivas novas por aula (pela regra do par) à progressão atômica, mais a decomposição que §3.6
exige de "função", "variável" e "classe". Não foi escolhido; foi contado.

| # | Módulo | Aulas | cons. | Nível | Presume-se que o aluno sabe |
|---|---|---|---|---|---|
| 1 | `a-tela` | 20 | 5 | júnior | nada — é o zero absoluto |
| 2 | `decisao` | 12 | 1 | júnior | `print`, literais, contas e nomes (M1) |
| 3 | `repeticao` | 13 | 3 | júnior | `if`/`else` e o recuo (M2) |
| 4 | `caixas-que-devolvem` | 14 | 10 | júnior | laços (M3) |
| 5 | `listas-e-tuplas` | 22 | 4 | júnior | função com parâmetro e `return` (M4) |
| 6 | `texto-em-profundidade` | 15 | 5 | júnior | listas, `for`, `in` (M5) |
| 7 | `dicionarios-e-conjuntos` | 16 | 5 | júnior | listas e texto (M5+M6) |
| 8 | `funcoes-em-profundidade` | 14 | 7 | júnior | tuplas e dicionários (M7) |
| 9 | `erros-e-excecoes` | 12 | 4 | júnior | funções com parâmetros variados (M8) |
| 10 | `modulos-e-a-biblioteca-padrao` | 14 | 2 | júnior | `try`/`except` (M9) |
| 11 | `arquivos-e-dados` | 13 | 2 | júnior | `import` (M10) |
| 12 | `classes-e-objetos` | 15 | 6 | júnior | arquivos e caminhos (M11) |
| 13 | `o-modelo-de-dados` | 15 | 8 | pleno | classes (M12) |
| 14 | `casamento-de-padrao` | 6 | 0 | pleno | classes e dicionários (M12+M7) |
| 15 | `iteradores-e-geradores` | 10 | 5 | pleno | o protocolo de iteração (M13) |
| 16 | `compreensoes-e-expressoes` | 8 | 3 | pleno | geradores (M15) |
| 17 | `funcoes-como-valor-e-decoradores` | 10 | 4 | pleno | escopo e closure (M8) |
| 18 | `tipagem-estatica` | 14 | 3 | pleno | decoradores (M17) |
| 19 | `testes-automatizados` | 13 | 3 | pleno | anotações e classes (M18+M12) |
| 20 | `concorrencia` | 12 | 2 | pleno | funções como valor (M17) |
| 21 | `assincronismo` | 12 | 1 | pleno | threads e o GIL (M20) |
| 22 | `desempenho-e-perfilamento` | 10 | 5 | **sênior** | tudo acima |
| 23 | `empacotamento-e-distribuicao` | 8 | 4 | sênior | módulos e testes (M10+M19) |
| 24 | `ferramentas-e-qualidade` | 8 | 4 | sênior | empacotamento (M23) |
| 25 | `padroes-de-projeto-em-python` | 10 | 6 | sênior | o modelo de dados e tipagem (M13+M18) |
| 26 | `por-dentro-do-python` | 21 | 7 | sênior | padrões e desempenho (M25+M22) |

### As duas fronteiras, e o que elas significam

Não são rótulos de marketing: cada uma é definida pelo que a pessoa consegue **fazer** sozinha.

| Fronteira | Onde | O que a pessoa passa a conseguir |
|---|---|---|
| **júnior → pleno** | fim do **M12** (aula `o-seu-proprio-erro`), aula 180 de 337 | escrever um programa Python inteiro sozinha: lê e escreve arquivo, trata erro, organiza em módulos e em classes. É o corte em que ela deixa de precisar de alguém do lado |
| **pleno → sênior** | fim do **M21** (aula `async-nao-e-thread`), aula 306 de 337 | usar a linguagem como ela é, não como se fosse outra: protocolos em vez de `isinstance`, geradores em vez de listas, tipos que o conferidor entende, testes que isolam, e concorrência escolhida com critério |
| **sênior** | M22 a M26 | **medir** antes de decidir, empacotar e distribuir, impor qualidade por ferramenta, escolher (e recusar) padrão de projeto, e abrir o capô: descritor, metaclasse, contagem de referência, bytecode, bits e a fronteira com C |

O que separa o pleno do sênior nesta trilha não é saber mais construção — é **decidir com número na
mão**. Os quatro módulos de sênior começam todos por medir (`timeit`, `cProfile`, `tracemalloc`,
`dis`), e nenhum deles aceita "é mais rápido" sem o comando que produziu o número — a mesma regra que
o `CONTRIBUTING.md` impõe a este repositório.

---

## Conteúdo por aula

Nas tabelas, `Ensina` lista as construções produtivas novas (**no máximo 2**, pela regra do par) e
`Presume` nomeia a aula anterior que ensinou cada construção pressuposta. "cons." marca uma aula de
**consolidação declarada** (`role: "consolidation"`) — ver §"A tensão A6 × I3".

Os quatro primeiros módulos vão ao nível de ÁTOMO, com o que o aluno digita, porque é onde ele não
tem nada.

### Módulo 1 — `a-tela`

Tudo na coluna zero. Sem função, sem bloco, sem recuo. O teste captura `stdout`.

| # | slug | avanço produtivo NOVO | o aluno digita | presume |
|---|---|---|---|---|
| 1 | `a-primeira-linha` | `global:print` | `print("oi")` | nada |
| 2 | `mais-de-uma-linha` | cons. — `global:print` em forma nova (duas instruções, uma por linha) | duas linhas de `print` | `a-primeira-linha` |
| 3 | `numero-nao-tem-aspas` | `node:IntLiteral` | `print(7)` | `a-primeira-linha` |
| 4 | `somar` | `op:binary:+` | `print(2 + 3)` | `numero-nao-tem-aspas` |
| 5 | `subtrair-e-multiplicar` | `op:binary:-`, `op:binary:*` | `print(7 - 2)` | `somar` |
| 6 | `dividir-da-decimal` | `op:binary:/`, `node:FloatLiteral` | `print(7 / 2)` | `subtrair-e-multiplicar` |
| 7 | `divisao-inteira-e-resto` | `op:binary://`, `op:binary:%` | `print(7 // 2)` | `dividir-da-decimal` |
| 8 | `potencia` | `op:binary:**` | `print(2 ** 10)` | `divisao-inteira-e-resto` |
| 9 | `o-sinal-do-numero` | `op:unary:-`, `op:unary:+` | `print(-3 + 10)` | `somar` |
| 10 | `dar-nome-a-um-valor` | `decl:assign` | `preco = 10` e depois `print(preco)` | `a-primeira-linha`, `numero-nao-tem-aspas` |
| 11 | `religar-o-mesmo-nome` | cons. — `decl:assign` em forma nova (o nome dos dois lados do `=`) | `preco = preco + 1` | `dar-nome-a-um-valor`, `somar` |
| 12 | `juntar-textos` | cons. — `op:binary:+` em forma nova (soma de textos) | `print("bom" + " dia")` | `somar`, `a-primeira-linha` |
| 13 | `texto-com-buraco` | `node:JoinedStr`, `node:FormattedValue` | `print(f"custa {preco}")` | `dar-nome-a-um-valor`, `juntar-textos` |
| 14 | `de-texto-para-numero` | `global:int`, `global:str` | `print(int("7") + 1)` | `numero-nao-tem-aspas`, `juntar-textos` |
| 15 | `arredondar` | `global:float`, `global:round` | `print(round(7 / 2, 1))` | `dividir-da-decimal`, `de-texto-para-numero` |
| 16 | `verdadeiro-e-falso` | `node:BoolLiteral`, `global:bool` | `print(True)` | `a-primeira-linha` |
| 17 | `o-nada` | `node:NoneLiteral` | `print(None)` | `verdadeiro-e-falso` |
| 18 | `o-tipo-de-cada-valor` | `global:type` | `print(type(7))` | `numero-nao-tem-aspas`, `verdadeiro-e-falso`, `o-nada` |
| 19 | `a-linha-que-o-python-ignora` | cons. — `global:print` com comentário (`term:comentário`) | `# isto o Python nem lê` | `a-primeira-linha` |
| 20 | `quando-da-errado` | cons. — leitura de erro (`term:traceback`, `term:SyntaxError`, `term:NameError`) | conserta a linha quebrada | `dar-nome-a-um-valor`, `texto-com-buraco` |

**Progressão produtiva do módulo 1 (23 átomos, na ordem):**
`global:print → node:IntLiteral → op:binary:+ → op:binary:- → op:binary:* → op:binary:/ →
node:FloatLiteral → op:binary:// → op:binary:% → op:binary:** → op:unary:- → op:unary:+ →
decl:assign → node:JoinedStr → node:FormattedValue → global:int → global:str → global:float →
global:round → node:BoolLiteral → global:bool → node:NoneLiteral → global:type`

**Por que esta ordem — cada decisão, e o que ela elimina**

- **A aula 1 não presume nada.** Nem função, nem chamada, nem parâmetro, nem nome, nem recuo. O
  arquivo do aluno tem uma linha e ela está na coluna zero. Ver §"A aula 1 é só `print`".
- **A aula 2 existe para o aluno digitar uma SEGUNDA linha** e descobrir sozinho que o Python lê de
  cima para baixo, uma instrução por linha. É a máquina nocional inteira do módulo, e ela não cabe
  numa aula que só mostra uma linha.
- **Número antes de conta.** A aula 3 é a primeira em que o aluno vê que `7` e `"7"` são coisas
  diferentes — e ela existe porque o `ast` colapsa as duas em `Constant`, o que só o refinamento do
  adaptador desfaz.
- **`juntar-textos` é consolidação, não aula nova.** `+` sobre texto é o **mesmo** `op:binary:+` de
  `somar`; o que muda é a forma de uso, e I11 pede aula própria para forma nova — mas aula de
  consolidação, não segunda origem.
- **`de-texto-para-numero` (14) vem logo depois** porque a consolidação anterior termina no
  `TypeError` de somar texto com número. O erro é a motivação, não um acidente.
- **Não há aula de `export`.** Em JavaScript, entregar a caixa ao conferidor é a 4ª aula produtiva.
  Aqui o teste roda o arquivo inteiro com `runpy.run_path` e não importa nada.
- **Não há `input()` no módulo 1.** Testá-lo exige `unittest.mock.patch`, que acrescenta quatro
  chaves receptivas ao harness da aula 1 para uma construção que não é da tela. Ele entra em M11
  (`perguntar-ao-usuario`), junto do resto de entrada e saída.
- **A aula 20 é de leitura pura**: o aluno provoca de propósito um `SyntaxError` (esquece o
  fechamento das aspas) e um `NameError` (erra o nome), lê o `traceback` e conserta. É a aula que
  torna o erro esperado em vez de assustador — e ela vem **antes** de qualquer bloco, quando o
  traceback ainda tem uma linha só.

### Módulo 2 — `decisao`

O primeiro bloco, e portanto o primeiro recuo. Ainda em `stdout`.

| # | slug | avanço produtivo NOVO | o aluno digita | presume |
|---|---|---|---|---|
| 1 | `comparar-numeros` | `op:compare:>`, `op:compare:<` | `print(3 > 2)` | M1 `verdadeiro-e-falso`, M1 `somar` |
| 2 | `igual-e-diferente` | `op:compare:==`, `op:compare:!=` | `print(x == 3)` | `comparar-numeros` |
| 3 | `maior-ou-igual` | `op:compare:>=`, `op:compare:<=` | `print(x >= 3)` | `igual-e-diferente` |
| 4 | `se` | `node:If` (+ `term:recuo`) | `if x > 0:` e a linha recuada | `comparar-numeros` |
| 5 | `o-bloco-vazio` | `node:Pass` | `pass` | `se` |
| 6 | `se-senao` | `node:IfElse` | `else:` e o bloco | `se` |
| 7 | `se-senao-se` | `node:Elif` | `elif x < 0:` | `se-senao` |
| 8 | `e-e-ou` | `op:bool:and`, `op:bool:or` | `if a > 0 and b > 0:` | `igual-e-diferente`, M1 `verdadeiro-e-falso` |
| 9 | `nao` | `op:unary:not` | `if not achou:` | `e-e-ou` |
| 10 | `condicao-em-uma-linha` | `node:IfExp` | `y = 1 if x else 0` | `se-senao`, M1 `dar-nome-a-um-valor` |
| 11 | `e-mesmo-o-nada` | `op:compare:is`, `op:compare:is not` | `if x is None:` | M1 `o-nada`, `se` |
| 12 | `comparar-encadeado` | cons. — `node:Compare` em forma nova (`0 < x < 10`) | `if 0 < x < 10:` | `maior-ou-igual`, `e-e-ou` |

**O recuo entra na aula 4, e não antes.** Nas 20 aulas do módulo 1 toda linha do aluno está na coluna
zero, então errar o recuo é impossível. A aula `se` é a primeira em que uma linha **pertence a
outra** — e é exatamente aí que o recuo passa a ser decidido por ele. Antes seria ensinar uma regra
sem lugar para aplicá-la; depois seria cobrar sem ter ensinado. O recuo não é átomo produtivo porque
**não aparece na AST**: entra como `term:recuo` e como `notionalMachineDelta` da aula.

### Módulo 3 — `repeticao`

| # | slug | avanço produtivo NOVO | o aluno digita | presume |
|---|---|---|---|---|
| 1 | `repetir-um-numero-de-vezes` | `node:For`, `global:range` | `for i in range(3):` | M2 `se` |
| 2 | `de-onde-ate-onde` | cons. — `global:range` em forma nova (`range(1, 5)`, passo) | `for i in range(1, 10, 2):` | `repetir-um-numero-de-vezes` |
| 3 | `acumular-num-nome` | `decl:aug`, `op:aug:+` | `total += i` | `repetir-um-numero-de-vezes`, M1 `dar-nome-a-um-valor` |
| 4 | `tirar-e-multiplicar-no-lugar` | `op:aug:-`, `op:aug:*` | `saldo -= 10` | `acumular-num-nome` |
| 5 | `dividir-no-lugar` | `op:aug:/`, `op:aug://` | `resto //= 2` | `tirar-e-multiplicar-no-lugar`, M1 `divisao-inteira-e-resto` |
| 6 | `resto-e-potencia-no-lugar` | `op:aug:%`, `op:aug:**` | `n %= 7` | `dividir-no-lugar`, M1 `potencia` |
| 7 | `enquanto` | `node:While` | `while saldo > 0:` | M2 `se`, `acumular-num-nome` |
| 8 | `parar-no-meio` | `node:Break` | `break` | `enquanto` |
| 9 | `pular-uma-volta` | `node:Continue` | `continue` | `parar-no-meio` |
| 10 | `o-laco-que-nao-acaba-sozinho` | cons. — `node:While` em forma nova (`while True` + `break`) | `while True:` | `parar-no-meio`, M1 `verdadeiro-e-falso` |
| 11 | `laco-dentro-de-laco` | cons. — `node:For` em forma nova (aninhado) | dois `for` recuados | `repetir-um-numero-de-vezes` |
| 12 | `e-se-nunca-parou` | `node:ForElse` | `else:` depois do `for` | `parar-no-meio`, `repetir-um-numero-de-vezes` |
| 13 | `o-else-do-while` | `node:WhileElse` | `else:` depois do `while` | `e-se-nunca-parou`, `enquanto` |

### Módulo 4 — `caixas-que-devolvem`

O módulo da virada. Começa em `stdout` e termina em `retorno`.

| # | slug | avanço produtivo NOVO | o aluno digita | presume |
|---|---|---|---|---|
| 1 | `escrever-a-primeira-caixa` | `node:FunctionDef` | `def bom_dia():` e o corpo | M2 `se`, M1 `a-primeira-linha` |
| 2 | `chamar-a-caixa-duas-vezes` | cons. — `node:Call` em forma nova (chamar o que VOCÊ definiu) | `bom_dia()` | `escrever-a-primeira-caixa` |
| 3 | `a-janela-de-entrada` | `node:arg` | `def saudacao(nome):` | `escrever-a-primeira-caixa` |
| 4 | `devolver-em-vez-de-mostrar` | `node:Return` | `return "oi, " + nome` | `a-janela-de-entrada`, M1 `juntar-textos` |
| 5 | `imprimir-nao-e-devolver` | cons. — `node:Return` e `global:print` no MESMO desafio (**a aula da virada**) | a caixa devolve, a última linha imprime | `devolver-em-vez-de-mostrar`, M1 `a-primeira-linha` |
| 6 | `a-caixa-que-nao-devolve-nada` | cons. — `node:NoneLiteral` em forma nova (o `None` implícito) | `return` sozinho | `imprimir-nao-e-devolver`, M1 `o-nada` |
| 7 | `mais-de-uma-janela` | cons. — `node:arg` em forma nova (dois parâmetros) | `def soma(a, b):` | `a-janela-de-entrada` |
| 8 | `devolver-cedo` | cons. — `node:Return` em forma nova (um `return` por ramo) | dois `return` dentro de `if`/`else` | `devolver-em-vez-de-mostrar`, M2 `se-senao` |
| 9 | `devolver-verdadeiro-ou-falso` | cons. — `node:Return` devolvendo a própria comparação | `return idade >= 18` | `devolver-cedo`, M2 `comparar-numeros` |
| 10 | `o-nome-so-vive-dentro` | cons. — `decl:assign` em forma nova (nome local) + `term:escopo` | `total = 0` dentro da caixa | `devolver-em-vez-de-mostrar`, M1 `dar-nome-a-um-valor` |
| 11 | `uma-caixa-chama-outra` | cons. — `node:Call` em forma nova (chamada dentro de caixa) | `return dobro(x) + 1` | `devolver-em-vez-de-mostrar` |
| 12 | `a-caixa-sem-corpo` | cons. — `node:Pass` em forma nova (esqueleto de função) | `pass` dentro do `def` | `escrever-a-primeira-caixa`, M2 `o-bloco-vazio` |
| 13 | `documentar-a-caixa` | cons. — `node:StrLiteral` em forma nova (docstring, e ela é o rótulo do check) | `"""devolve o dobro"""` | `escrever-a-primeira-caixa` |
| 14 | `conferir-a-premissa` | `node:Assert` | `assert n > 0` | `devolver-cedo`, M2 `igual-e-diferente` |

**Por que M4 é o módulo com mais consolidações da trilha (10 de 14), e por que isso está certo.**
[`16`](16-engine-de-trilha.md) §3.6 manda decompor "função" em seis passos (declaração; chamada;
parâmetro; argumento; corpo; `return`) mais uma aula de integração. O `ast` do Python dá **três**
chaves para tudo isso: `node:FunctionDef`, `node:arg` e `node:Return`. A decomposição pedagógica é
obrigatória; as chaves não multiplicam. Cada consolidação aqui nomeia o degrau e é `role:
"consolidation"` com `targetAtom` apontando para a origem — nenhuma delas é segunda origem (I3).

### Módulo 5 — `listas-e-tuplas`

A partir daqui o canal é `retorno` e as tabelas são `Aula | Ensina | Presume`.

| Aula | Ensina | Presume |
|---|---|---|
| `criar-uma-lista` | `node:List` | M4 `devolver-em-vez-de-mostrar` |
| `pegar-pela-posicao` | `node:Subscript` (e o `IndexError`) | `criar-uma-lista` |
| `posicao-negativa` | cons. — `node:Subscript` em forma nova (índice negativo) | `pegar-pela-posicao`, M1 `o-sinal-do-numero` |
| `quantos-itens-tem` | `global:len` | `criar-uma-lista` |
| `acrescentar-no-fim` | `api:.append` (+ `node:Attribute` produtivo) | `criar-uma-lista` |
| `tirar-um-item` | `api:.pop`, `api:.remove` | `acrescentar-no-fim` |
| `inserir-no-meio` | `api:.insert` | `acrescentar-no-fim` |
| `percorrer-uma-lista` | cons. — `node:For` em forma nova (`for` sobre lista, sem `range`) | `criar-uma-lista`, M3 `repetir-um-numero-de-vezes` |
| `esta-na-lista` | `op:compare:in`, `op:compare:not in` | `criar-uma-lista` |
| `achar-a-posicao` | `api:.index`, `api:.count` | `esta-na-lista` |
| `um-pedaco-da-lista` | `node:Slice` | `pegar-pela-posicao` |
| `copiar-em-vez-de-apelidar` | cons. — `node:Slice` em forma nova (`xs[:]`) + `term:referência` | `um-pedaco-da-lista` |
| `ordenar` | `api:.sort`, `global:sorted` (um muda a lista, o outro devolve outra) | `criar-uma-lista` |
| `inverter` | `api:.reverse`, `global:reversed` | `ordenar` |
| `juntar-e-limpar` | `api:.extend`, `api:.clear` | `acrescentar-no-fim` |
| `o-maior-e-o-menor` | `global:max`, `global:min` | `criar-uma-lista` |
| `somar-tudo` | `global:sum` | `o-maior-e-o-menor` |
| `com-o-indice-junto` | `global:enumerate` | `percorrer-uma-lista` |
| `duas-listas-lado-a-lado` | `global:zip` | `com-o-indice-junto` |
| `a-lista-que-nao-muda` | `node:Tuple` | `criar-uma-lista` |
| `abrir-a-tupla-em-nomes` | `decl:unpack` | `a-lista-que-nao-muda` |
| `lista-de-listas` | cons. — `node:Subscript` em forma nova (dois índices) | `pegar-pela-posicao`, `criar-uma-lista` |

### Módulo 6 — `texto-em-profundidade`

| Aula | Ensina | Presume |
|---|---|---|
| `maiusculas-e-minusculas` | `api:.upper`, `api:.lower` | M5 `acrescentar-no-fim` |
| `tirar-os-espacos` | `api:.strip` | `maiusculas-e-minusculas` |
| `trocar-um-pedaco` | `api:.replace` | `tirar-os-espacos` |
| `comeca-e-termina` | `api:.startswith`, `api:.endswith` | `trocar-um-pedaco` |
| `achar-no-texto` | `api:.find` (e por que devolve `-1` em vez de erro) | `comeca-e-termina` |
| `quebrar-em-lista` | `api:.split`, `api:.splitlines` | M5 `criar-uma-lista` |
| `juntar-numa-string` | `api:.join` | `quebrar-em-lista` |
| `o-texto-tem-posicao-tambem` | cons. — `node:Subscript` em forma nova (sobre texto) | M5 `pegar-pela-posicao` |
| `fatiar-o-texto` | cons. — `node:Slice` em forma nova (sobre texto) | M5 `um-pedaco-da-lista` |
| `esta-no-texto` | cons. — `op:compare:in` em forma nova (sobre texto) | M5 `esta-na-lista` |
| `so-numeros-ou-so-letras` | `api:.isdigit`, `api:.isalpha` | `comeca-e-termina` |
| `formatar-com-largura` | cons. — `node:FormattedValue` em forma nova (`{v:>8.2f}`) | M1 `texto-com-buraco` |
| `alinhar-e-preencher` | `api:.ljust`, `api:.zfill` | `formatar-com-largura` |
| `o-texto-nao-muda` | cons. — imutabilidade (`term:imutável`); reforça `api:.replace` | `trocar-um-pedaco` |
| `a-letra-e-um-numero` | `global:ord`, `global:chr` | `o-texto-tem-posicao-tambem` |

### Módulo 7 — `dicionarios-e-conjuntos`

| Aula | Ensina | Presume |
|---|---|---|
| `criar-um-dicionario` | `node:Dict` | M5 `criar-uma-lista` |
| `pegar-pela-chave` | cons. — `node:Subscript` em forma nova (chave, e o `KeyError`) | `criar-um-dicionario`, M5 `pegar-pela-posicao` |
| `pegar-com-padrao` | `api:.get` | `pegar-pela-chave` |
| `guardar-uma-chave-nova` | cons. — `decl:assign` em forma nova (`d["k"] = v`) | `pegar-pela-chave`, M1 `dar-nome-a-um-valor` |
| `apagar-uma-chave` | `node:Delete` | `pegar-pela-chave` |
| `as-chaves-e-os-valores` | `api:.keys`, `api:.values` | `criar-um-dicionario` |
| `chave-e-valor-juntos` | `api:.items` | `as-chaves-e-os-valores` |
| `percorrer-um-dicionario` | cons. — `node:For` em forma nova (`for k, v in d.items()`) | `chave-e-valor-juntos`, M5 `abrir-a-tupla-em-nomes` |
| `a-chave-existe` | cons. — `op:compare:in` em forma nova (sobre dicionário) | `criar-um-dicionario`, M5 `esta-na-lista` |
| `juntar-dicionarios` | `api:.update` | `criar-um-dicionario` |
| `tirar-e-devolver` | `api:.setdefault`, `api:.popitem` | `pegar-com-padrao` |
| `dicionario-de-listas` | cons. — `node:Dict` em forma nova (valor composto) | `criar-um-dicionario`, M5 `criar-uma-lista` |
| `conjunto-sem-repetidos` | `node:Set`, `global:set` | `criar-um-dicionario` |
| `contas-de-conjunto` | `api:.union`, `api:.intersection` | `conjunto-sem-repetidos` |
| `diferenca-e-subconjunto` | `api:.difference`, `api:.issubset` | `contas-de-conjunto` |
| `a-chave-precisa-ser-imutavel` | `global:hash`, `global:frozenset` | `conjunto-sem-repetidos`, M5 `a-lista-que-nao-muda` |

### Módulo 8 — `funcoes-em-profundidade`

| Aula | Ensina | Presume |
|---|---|---|
| `valor-padrao-no-parametro` | `decl:default` | M4 `mais-de-uma-janela` |
| `a-armadilha-do-padrao-mutavel` | cons. — `decl:default` em forma nova (lista como padrão, e por que não) | `valor-padrao-no-parametro`, M5 `criar-uma-lista` |
| `chamar-pelo-nome-do-parametro` | cons. — `node:Call` em forma nova (argumento nomeado; `node:keyword` é estrutural) | `valor-padrao-no-parametro` |
| `quantos-argumentos-quiser` | `decl:vararg` | `chamar-pelo-nome-do-parametro` |
| `argumentos-nomeados-quaisquer` | `decl:kwarg` | `quantos-argumentos-quiser` |
| `espalhar-uma-lista-na-chamada` | `node:Starred` | `quantos-argumentos-quiser`, M5 `criar-uma-lista` |
| `espalhar-um-dicionario` | cons. — `node:Call` em forma nova (`f(**d)`) | `argumentos-nomeados-quaisquer`, M7 `criar-um-dicionario` |
| `so-por-posicao-so-por-nome` | cons. — `node:arg` em forma nova (`/` e `*` na assinatura) | `chamar-pelo-nome-do-parametro` |
| `devolver-mais-de-um-valor` | cons. — `node:Tuple` em forma nova (como retorno) | M5 `abrir-a-tupla-em-nomes`, M4 `devolver-em-vez-de-mostrar` |
| `onde-o-nome-vive` | `decl:global` (e por que `global` quase nunca é a resposta) | M4 `o-nome-so-vive-dentro` |
| `funcao-dentro-de-funcao` | cons. — `node:FunctionDef` em forma nova (aninhada) | `onde-o-nome-vive` |
| `lembrar-do-de-fora` | `decl:nonlocal` | `funcao-dentro-de-funcao` |
| `chamar-a-si-mesma` | cons. — `node:Call` em forma nova (recursão com caso base) | M4 `devolver-cedo`, M4 `uma-caixa-chama-outra` |
| `o-limite-da-recursao` | `api:sys.setrecursionlimit`, `global:RecursionError` | `chamar-a-si-mesma` |

### Módulo 9 — `erros-e-excecoes`

| Aula | Ensina | Presume |
|---|---|---|
| `ler-o-traceback-de-verdade` | cons. — leitura guiada de erro real com pilha (`term:traceback`) | M1 `quando-da-errado`, M8 `chamar-a-si-mesma` |
| `levantar-um-erro` | `node:Raise`, `global:ValueError` | `ler-o-traceback-de-verdade`, M4 `conferir-a-premissa` |
| `tentar-e-tratar` | `node:Try`, `node:ExceptHandler` | `levantar-um-erro` |
| `qual-erro-aconteceu` | `global:TypeError`, `global:KeyError` | `tentar-e-tratar`, M7 `pegar-pela-chave` |
| `indice-e-divisao-por-zero` | `global:IndexError`, `global:ZeroDivisionError` | `qual-erro-aconteceu`, M5 `pegar-pela-posicao` |
| `varios-except` | cons. — `node:ExceptHandler` em forma nova (tupla de tipos) | `qual-erro-aconteceu`, M5 `a-lista-que-nao-muda` |
| `guardar-o-erro-num-nome` | `decl:except-as` | `varios-except` |
| `a-mensagem-do-erro` | `api:.args` | `guardar-o-erro-num-nome` |
| `e-se-nao-deu-erro` | cons. — `node:Try` em forma nova (o `else` do `try`) | `tentar-e-tratar` |
| `sempre-no-fim` | `node:Finally` | `guardar-o-erro-num-nome` |
| `deixar-subir` | cons. — `node:Raise` em forma nova (`raise` sem argumento, re-levantar) | `guardar-o-erro-num-nome` |
| `ainda-nao-implementado` | `global:NotImplementedError` | `levantar-um-erro`, M4 `a-caixa-sem-corpo` |

**Regra de harness declarada, e ela vale de M9 a M10.** O arquivo de teste que espera um erro usa a
forma de **chamada** — `self.assertRaises(ValueError, dividir, 1, 0)` — e nunca o gerenciador de
contexto. Motivo medido: `with self.assertRaises(...)` emite `node:With` e `node:withitem`, e
`node:With` só é ensinado em M11 (`abrir-um-arquivo`); usá-lo antes violaria A3
(`atomos(testsCode) ⊆ budget_ENTRADA.receptive`). A partir de M11 as duas formas são legítimas.

### Módulo 10 — `modulos-e-a-biblioteca-padrao`

| Aula | Ensina | Presume |
|---|---|---|
| `trazer-uma-ferramenta` | `node:Import`, `api:math.sqrt` | M9 `tentar-e-tratar` |
| `trazer-so-um-nome` | `node:ImportFrom` | `trazer-uma-ferramenta` |
| `apelidar-o-import` | cons. — `node:Import` em forma nova (`import x as y`) | `trazer-so-um-nome` |
| `mais-contas` | `api:math.floor`, `api:math.ceil` | `trazer-uma-ferramenta` |
| `sorteio` | `api:random.randint`, `api:random.choice` | `trazer-so-um-nome`, M5 `criar-uma-lista` |
| `data-e-hora` | `api:datetime.date`, `api:datetime.datetime` | `trazer-so-um-nome` |
| `diferenca-entre-datas` | `api:datetime.timedelta` | `data-e-hora` |
| `texto-com-padrao` | `api:re.search`, `api:re.findall` | `trazer-so-um-nome`, M6 `achar-no-texto` |
| `trocar-com-padrao` | `api:re.sub` | `texto-com-padrao`, M6 `trocar-um-pedaco` |
| `contar-e-agrupar` | `api:collections.Counter`, `api:collections.defaultdict` | `trazer-so-um-nome`, M7 `criar-um-dicionario` |
| `fila-e-pilha` | `api:collections.deque` | `contar-e-agrupar` |
| `decimal-exato` | `api:decimal.Decimal`, `api:fractions.Fraction` | `trazer-so-um-nome`, M1 `arredondar` |
| `ferramentas-de-iteracao` | `api:itertools.chain`, `api:itertools.groupby` | `trazer-so-um-nome`, M5 `percorrer-uma-lista` |
| `o-seu-proprio-modulo` | cons. — `node:ImportFrom` em forma nova (importar arquivo do próprio desafio) | `trazer-so-um-nome` |

### Módulo 11 — `arquivos-e-dados`

| Aula | Ensina | Presume |
|---|---|---|
| `abrir-um-arquivo` | `node:With`, `global:open` | M10 `trazer-uma-ferramenta` |
| `ler-o-conteudo` | `api:.read`, `api:.readlines` | `abrir-um-arquivo` |
| `ler-linha-por-linha` | cons. — `node:For` em forma nova (sobre o arquivo aberto) | `ler-o-conteudo`, M5 `percorrer-uma-lista` |
| `escrever-num-arquivo` | `api:.write` | `abrir-um-arquivo` |
| `acrescentar-no-fim-do-arquivo` | cons. — `global:open` em forma nova (modo `"a"`) | `escrever-num-arquivo` |
| `caminhos-sem-barra-na-mao` | `api:pathlib.Path` | M10 `trazer-so-um-nome` |
| `existe-esse-arquivo` | `api:.exists`, `global:FileNotFoundError` | `caminhos-sem-barra-na-mao`, M9 `tentar-e-tratar` |
| `dados-em-json` | `api:json.dumps`, `api:json.loads` | M10 `trazer-so-um-nome`, M7 `criar-um-dicionario` |
| `json-em-arquivo` | `api:json.dump`, `api:json.load` | `dados-em-json`, `escrever-num-arquivo` |
| `planilha-em-csv` | `api:csv.DictReader`, `api:csv.DictWriter` | `dados-em-json`, `ler-linha-por-linha` |
| `bytes-em-vez-de-texto` | `node:BytesLiteral`, `api:.encode` | `ler-o-conteudo` |
| `perguntar-ao-usuario` | `global:input` | M4 `devolver-em-vez-de-mostrar` |
| `arquivo-temporario` | `api:tempfile.TemporaryDirectory` | `escrever-num-arquivo`, `caminhos-sem-barra-na-mao` |

### Módulo 12 — `classes-e-objetos`

| Aula | Ensina | Presume |
|---|---|---|
| `o-molde-e-o-objeto` | `node:ClassDef` | M11 `caminhos-sem-barra-na-mao` |
| `criar-um-objeto` | cons. — `node:Call` em forma nova (chamar a classe) | `o-molde-e-o-objeto` |
| `o-construtor` | `node:MethodDef`, `node:InitMethod` | `criar-um-objeto`, M8 `valor-padrao-no-parametro` |
| `guardar-dado-no-objeto` | cons. — `decl:assign` em forma nova (`self.nome = nome`) | `o-construtor` |
| `metodo-que-usa-o-dado` | cons. — `node:MethodDef` em forma nova (método que lê `self`) | `guardar-dado-no-objeto` |
| `mostrar-o-objeto` | `node:DunderStr` | `metodo-que-usa-o-dado`, M1 `texto-com-buraco` |
| `atributo-da-classe` | cons. — `decl:assign` em forma nova (no corpo da classe, não do método) | `guardar-dado-no-objeto` |
| `herdar` | cons. — `node:ClassDef` em forma nova (com classe-base) | `o-molde-e-o-objeto` |
| `chamar-a-classe-mae` | `global:super` | `herdar` |
| `trocar-o-comportamento` | cons. — `node:MethodDef` em forma nova (sobrescrever) | `chamar-a-classe-mae` |
| `e-desse-tipo` | `global:isinstance`, `global:issubclass` | `herdar`, M1 `o-tipo-de-cada-valor` |
| `metodo-sem-objeto` | `node:Decorator`, `global:staticmethod` | `metodo-que-usa-o-dado` |
| `metodo-da-classe` | `global:classmethod` | `metodo-sem-objeto` |
| `propriedade-calculada` | `global:property` | `metodo-sem-objeto` |
| `o-seu-proprio-erro` | `global:Exception` | `herdar`, M9 `levantar-um-erro` |

### Módulo 13 — `o-modelo-de-dados`

Os dunders. **O adaptador refina só dois** (`node:InitMethod` e `node:DunderStr`, medido); todos os
outros são `node:MethodDef` para o gate. Por isso este módulo tem 8 consolidações em 15 — cada uma
com o degrau nomeado, e cada uma trazendo o builtin que o protocolo serve.

| Aula | Ensina | Presume |
|---|---|---|
| `o-que-o-python-chama-por-baixo` | cons. — `node:MethodDef` em forma nova (nome com dois sublinhados; `term:protocolo`) | M12 `mostrar-o-objeto` |
| `repr-para-quem-programa` | `global:repr` (`__repr__` × `__str__`) | `o-que-o-python-chama-por-baixo` |
| `comparar-dois-objetos` | `global:NotImplemented` (`__eq__`) | `o-que-o-python-chama-por-baixo`, M2 `igual-e-diferente` |
| `ordenar-objetos` | `api:functools.total_ordering` (`__lt__`) | `comparar-dois-objetos`, M5 `ordenar` |
| `ser-chave-de-dicionario` | cons. — `global:hash` em forma nova (`__hash__` junto de `__eq__`) | `comparar-dois-objetos`, M7 `a-chave-precisa-ser-imutavel` |
| `ter-tamanho` | cons. — `global:len` em forma nova (`__len__` do seu objeto) | `o-que-o-python-chama-por-baixo`, M5 `quantos-itens-tem` |
| `ser-indexavel` | cons. — `node:Subscript` em forma nova (`__getitem__` do seu objeto) | `ter-tamanho`, M5 `pegar-pela-posicao` |
| `ser-percorrivel` | `global:iter` (`__iter__`) | `ser-indexavel` |
| `entregar-o-proximo` | `global:next`, `global:StopIteration` (`__next__`) | `ser-percorrivel` |
| `estar-dentro` | cons. — `op:compare:in` em forma nova (`__contains__`) | `ser-percorrivel`, M5 `esta-na-lista` |
| `somar-objetos` | cons. — `op:binary:+` em forma nova (`__add__`) | `o-que-o-python-chama-por-baixo`, M1 `somar` |
| `ser-chamavel` | `global:callable` (`__call__`) | `o-que-o-python-chama-por-baixo` |
| `valer-como-verdadeiro` | cons. — `global:bool` em forma nova (`__bool__` e o que Python já considera falso) | `ter-tamanho`, M1 `verdadeiro-e-falso` |
| `virar-texto-formatado` | `global:format` (`__format__`) | `repr-para-quem-programa`, M6 `formatar-com-largura` |
| `o-proprio-with` | cons. — `node:With` em forma nova (`__enter__`/`__exit__` do seu objeto) | `ser-chamavel`, M11 `abrir-um-arquivo` |

**Dívida DECLARADA.** Para o gate distinguir esses protocolos seria preciso acrescentar chaves
sintéticas ao `extract_ast.py`, na mesma forma de `node:DunderStr`: `node:DunderRepr`,
`node:DunderEq`, `node:DunderHash`, `node:DunderLen`, `node:DunderGetItem`, `node:DunderIter`,
`node:DunderNext`, `node:DunderContains`, `node:DunderCall`, `node:DunderBool`, `node:DunderAdd`,
`node:DunderEnter`, `node:DunderExit`, `node:DunderFormat`. **Elas não existem hoje e nenhuma tabela
deste documento as usa.** Enquanto não existirem, essas aulas emitem aviso A14a-0 (zero construção
verdadeiramente nova) — aviso, não erro.

### Módulo 14 — `casamento-de-padrao`

| Aula | Ensina | Presume |
|---|---|---|
| `escolher-por-valor` | `node:Match`, `node:MatchValue` | M2 `se-senao-se` |
| `o-caso-que-sobra` | `node:MatchAs` | `escolher-por-valor` |
| `casar-uma-lista` | `node:MatchSequence`, `node:MatchStar` | `o-caso-que-sobra`, M5 `criar-uma-lista` |
| `casar-um-dicionario` | `node:MatchMapping` | `casar-uma-lista`, M7 `criar-um-dicionario` |
| `casar-uma-classe` | `node:MatchClass` | `casar-um-dicionario`, M12 `o-construtor` |
| `um-ou-outro` | `node:MatchOr`, `node:MatchSingleton` | `casar-uma-classe`, M2 `e-mesmo-o-nada` |

### Módulo 15 — `iteradores-e-geradores`

| Aula | Ensina | Presume |
|---|---|---|
| `a-funcao-que-pausa` | `node:Yield` | M13 `entregar-o-proximo` |
| `gerador-que-nunca-acaba` | cons. — `node:Yield` em forma nova (dentro de `while True`) | `a-funcao-que-pausa`, M3 `o-laco-que-nao-acaba-sozinho` |
| `pegar-so-os-primeiros` | `api:itertools.islice`, `api:itertools.count` | `gerador-que-nunca-acaba`, M10 `ferramentas-de-iteracao` |
| `delegar-para-outro` | `node:YieldFrom` | `a-funcao-que-pausa` |
| `mandar-valor-para-dentro` | `api:.send`, `api:.close` | `delegar-para-outro` |
| `o-gerador-e-preguicoso` | cons. — `node:Yield` em forma nova (medindo memória contra a lista) | `a-funcao-que-pausa`, M5 `criar-uma-lista` |
| `o-iterador-na-mao` | cons. — `node:MethodDef` em forma nova (a classe com `__iter__` e `__next__`) | M13 `entregar-o-proximo` |
| `duplicar-um-iterador` | `api:itertools.tee` | `pegar-so-os-primeiros` |
| `gerador-em-cadeia` | cons. — `node:Yield` em forma nova (um gerador consumindo outro) | `delegar-para-outro` |
| `so-passa-uma-vez` | cons. — `global:iter` em forma nova (o iterador esgotado) | M13 `ser-percorrivel`, `a-funcao-que-pausa` |

### Módulo 16 — `compreensoes-e-expressoes`

| Aula | Ensina | Presume |
|---|---|---|
| `lista-por-compreensao` | `node:ListComp` | M5 `percorrer-uma-lista` |
| `filtrar-na-compreensao` | cons. — `node:ListComp` em forma nova (com `if`) | `lista-por-compreensao`, M2 `se` |
| `compreensao-aninhada` | cons. — `node:ListComp` em forma nova (dois `for`) | `filtrar-na-compreensao`, M3 `laco-dentro-de-laco` |
| `dicionario-por-compreensao` | `node:DictComp` | `filtrar-na-compreensao`, M7 `chave-e-valor-juntos` |
| `conjunto-por-compreensao` | `node:SetComp` | `dicionario-por-compreensao`, M7 `conjunto-sem-repetidos` |
| `gerar-sem-guardar` | `node:GeneratorExp` | `conjunto-por-compreensao`, M15 `o-gerador-e-preguicoso` |
| `atribuir-no-meio-da-expressao` | `decl:walrus` | M3 `enquanto`, M2 `se` |
| `quando-nao-usar-compreensao` | cons. — `node:ListComp` em forma nova (a que deve virar `for`) | `compreensao-aninhada` |

### Módulo 17 — `funcoes-como-valor-e-decoradores`

| Aula | Ensina | Presume |
|---|---|---|
| `funcao-e-um-valor` | cons. — `decl:assign` em forma nova (ligar um nome a uma função sem chamar) | M8 `funcao-dentro-de-funcao` |
| `funcao-sem-nome` | `node:Lambda` | `funcao-e-um-valor` |
| `passar-funcao-como-argumento` | `global:map`, `global:filter` | `funcao-sem-nome`, M5 `percorrer-uma-lista` |
| `ordenar-com-criterio` | cons. — `global:sorted` em forma nova (`key=`) | `passar-funcao-como-argumento`, M5 `ordenar` |
| `reduzir-a-um-valor` | `api:functools.reduce` | `passar-funcao-como-argumento` |
| `fixar-argumentos` | `api:functools.partial` | `funcao-e-um-valor`, M8 `valor-padrao-no-parametro` |
| `lembrar-o-resultado` | `api:functools.cache`, `api:functools.lru_cache` | `fixar-argumentos`, M8 `chamar-a-si-mesma` |
| `escrever-um-decorador` | cons. — `node:Decorator` em forma nova (definir, não aplicar) | M12 `metodo-sem-objeto`, M8 `lembrar-do-de-fora` |
| `preservar-o-nome-decorado` | `api:functools.wraps` | `escrever-um-decorador` |
| `decorador-com-argumento` | cons. — `node:FunctionDef` em forma nova (três níveis de aninhamento) | `preservar-o-nome-decorado` |

### Módulo 18 — `tipagem-estatica`

| Aula | Ensina | Presume |
|---|---|---|
| `anotar-um-nome` | `decl:ann` | M1 `o-tipo-de-cada-valor` |
| `anotar-parametro-e-retorno` | cons. — `decl:ann` em forma nova (na assinatura, e ela não gera chave própria) | `anotar-um-nome`, M4 `a-janela-de-entrada` |
| `pode-faltar` | `node:OptionalAnnotation`, `op:binary:\|` | `anotar-parametro-e-retorno`, M1 `o-nada` |
| `lista-de-que-tipo` | cons. — `node:Subscript` em forma nova (em posição de tipo: `list[int]`) | `anotar-parametro-e-retorno`, M5 `criar-uma-lista` |
| `qualquer-coisa` | `api:typing.Any` | `lista-de-que-tipo` |
| `funcao-como-tipo` | `api:typing.Callable` | `qualquer-coisa`, M17 `funcao-e-um-valor` |
| `apelido-de-tipo` | `node:TypeAlias` | `lista-de-que-tipo` |
| `generico-de-verdade` | `node:TypeVar` | `apelido-de-tipo` |
| `generico-variadico` | `node:TypeVarTuple`, `node:ParamSpec` | `generico-de-verdade`, M8 `quantos-argumentos-quiser` |
| `o-contrato-sem-heranca` | `api:typing.Protocol`, `node:EllipsisLiteral` | `generico-de-verdade`, M12 `herdar` |
| `valores-fixos` | `api:typing.Literal`, `api:enum.Enum` | `qualquer-coisa`, M12 `atributo-da-classe` |
| `dado-sem-boilerplate` | `api:dataclasses.dataclass`, `api:dataclasses.field` | `anotar-um-nome`, M17 `escrever-um-decorador` |
| `tipo-em-tempo-de-execucao` | `api:typing.get_type_hints` | `anotar-parametro-e-retorno` |
| `o-conferidor-de-tipos-e-outro-programa` | cons. — `decl:ann` em forma nova (a anotação que o Python **não** confere; `term:mypy`) | `tipo-em-tempo-de-execucao`, M12 `e-desse-tipo` |

### Módulo 19 — `testes-automatizados`

O aluno vem lendo o arquivo de teste desde a aula 1. Aqui ele passa a **escrever** — a mudança de
faixa receptiva para produtiva é, ela mesma, o evento de currículo (I11).

| Aula | Ensina | Presume |
|---|---|---|
| `o-arquivo-que-voce-vem-lendo` | cons. — `node:ImportFrom` em forma nova (ler o próprio harness do desafio) | M10 `trazer-so-um-nome` |
| `escrever-o-primeiro-teste` | `api:unittest.TestCase` (produtivo) | `o-arquivo-que-voce-vem-lendo`, M12 `herdar` |
| `as-asercoes` | `api:.assertEqual`, `api:.assertTrue` (produtivos) | `escrever-o-primeiro-teste` |
| `esperar-um-erro` | `api:.assertRaises` (produtivo) | `as-asercoes`, M9 `levantar-um-erro` |
| `preparar-o-cenario` | `api:.setUp`, `api:.tearDown` | `as-asercoes` |
| `um-caso-por-linha` | `api:.subTest` | `preparar-o-cenario`, M5 `percorrer-uma-lista` |
| `pular-e-esperar-falhar` | `api:.skipTest`, `api:unittest.expectedFailure` | `preparar-o-cenario` |
| `trocar-uma-peca` | `api:unittest.mock.patch`, `api:unittest.mock.MagicMock` | `preparar-o-cenario`, M17 `escrever-um-decorador` |
| `capturar-a-saida` | `api:contextlib.redirect_stdout`, `api:io.StringIO` (produtivos — fecha o arco de M1) | `as-asercoes`, M1 `a-primeira-linha` |
| `rodar-o-arquivo-inteiro` | `api:runpy.run_path` (produtivo) | `capturar-a-saida`, M11 `abrir-um-arquivo` |
| `escrever-o-teste-antes` | cons. — `api:.assertEqual` em forma nova (o teste que falha primeiro; `term:TDD`) | `as-asercoes` |
| `casos-de-borda` | cons. — `api:.assertEqual` em forma nova (vazio, zero, negativo) | `escrever-o-teste-antes`, M5 `criar-uma-lista` |
| `o-que-o-teste-nao-cobre` | `api:trace.Trace` | `casos-de-borda` |

### Módulo 20 — `concorrencia`

| Aula | Ensina | Presume |
|---|---|---|
| `dois-trabalhos-ao-mesmo-tempo` | `api:threading.Thread` | M10 `trazer-so-um-nome`, M17 `funcao-e-um-valor` |
| `esperar-terminar` | cons. — `api:.join` em forma nova (esperar uma thread, não juntar texto) | `dois-trabalhos-ao-mesmo-tempo`, M6 `juntar-numa-string` |
| `a-corrida-pelo-mesmo-nome` | `api:threading.Lock` | `esperar-terminar` |
| `fila-entre-threads` | `api:queue.Queue` | `a-corrida-pelo-mesmo-nome`, M10 `fila-e-pilha` |
| `avisar-que-terminou` | `api:threading.Event` | `fila-entre-threads` |
| `o-gil-em-uma-aula` | cons. — `api:threading.Thread` em forma nova (medindo CPU contra E/S; `term:GIL`) | `dois-trabalhos-ao-mesmo-tempo` |
| `processos-em-vez-de-threads` | `api:multiprocessing.Process` | `o-gil-em-uma-aula` |
| `piscina-de-threads` | `api:concurrent.futures.ThreadPoolExecutor` | `esperar-terminar` |
| `piscina-de-processos` | `api:concurrent.futures.ProcessPoolExecutor` | `piscina-de-threads`, `processos-em-vez-de-threads` |
| `o-resultado-que-ainda-nao-veio` | `api:.result`, `api:concurrent.futures.as_completed` | `piscina-de-threads` |
| `mandar-dado-entre-processos` | `api:multiprocessing.Queue`, `api:multiprocessing.Value` | `processos-em-vez-de-threads`, `fila-entre-threads` |
| `desligar-com-ordem` | `api:.shutdown` | `o-resultado-que-ainda-nao-veio` |

**Regra de harness declarada.** Toda aula de processo usa **função de módulo**, nunca `lambda` nem
closure: o `forkserver` (padrão do 3.14 no Linux, medido) referencia o alvo por importação. Uma
solução com `lambda` num `ProcessPoolExecutor` levanta `PicklingError` — e seria culpa da trilha,
não do aluno.

### Módulo 21 — `assincronismo`

| Aula | Ensina | Presume |
|---|---|---|
| `a-funcao-que-espera` | `node:AsyncFunctionDef`, `node:Await` | M20 `dois-trabalhos-ao-mesmo-tempo` |
| `rodar-uma-corrotina` | `api:asyncio.run` | `a-funcao-que-espera` |
| `dormir-sem-travar` | `api:asyncio.sleep` | `rodar-uma-corrotina` |
| `esperar-varias-de-uma-vez` | `api:asyncio.gather` | `dormir-sem-travar` |
| `tarefa-em-segundo-plano` | `api:asyncio.create_task` | `esperar-varias-de-uma-vez` |
| `grupo-de-tarefas` | `api:asyncio.TaskGroup`, `node:TryStar` | `tarefa-em-segundo-plano`, M9 `varios-except` |
| `desistir-no-tempo` | `api:asyncio.timeout`, `global:TimeoutError` | `grupo-de-tarefas` |
| `fila-assincrona` | `api:asyncio.Queue` | `tarefa-em-segundo-plano`, M20 `fila-entre-threads` |
| `percorrer-assincrono` | `node:AsyncFor` | `a-funcao-que-espera`, M15 `a-funcao-que-pausa` |
| `contexto-assincrono` | `node:AsyncWith` | `a-funcao-que-espera`, M13 `o-proprio-with` |
| `testar-codigo-assincrono` | `api:unittest.IsolatedAsyncioTestCase` | `rodar-uma-corrotina`, M19 `escrever-o-primeiro-teste` |
| `async-nao-e-thread` | cons. — `node:Await` em forma nova (a mesma tarefa nos dois modelos) | `esperar-varias-de-uma-vez`, M20 `o-gil-em-uma-aula` |

### Módulo 22 — `desempenho-e-perfilamento`

| Aula | Ensina | Presume |
|---|---|---|
| `medir-antes-de-otimizar` | `api:timeit.timeit` | M10 `trazer-so-um-nome`, M17 `funcao-e-um-valor` |
| `onde-o-tempo-vai` | `api:cProfile.run`, `api:pstats.Stats` | `medir-antes-de-otimizar` |
| `quanto-ocupa-na-memoria` | `api:sys.getsizeof` | `medir-antes-de-otimizar`, M5 `criar-uma-lista` |
| `rastrear-a-memoria` | `api:tracemalloc.start`, `api:tracemalloc.get_traced_memory` | `quanto-ocupa-na-memoria` |
| `a-estrutura-certa-muda-tudo` | cons. — `op:compare:in` em forma nova (custo em lista contra conjunto, medido) | `medir-antes-de-otimizar`, M7 `conjunto-sem-repetidos` |
| `guardar-o-que-ja-calculou` | cons. — `api:functools.cache` em forma nova (medindo o ganho) | `medir-antes-de-otimizar`, M17 `lembrar-o-resultado` |
| `economizar-com-slots` | cons. — `decl:assign` em forma nova (`__slots__` no corpo da classe) | `quanto-ocupa-na-memoria`, M12 `atributo-da-classe` |
| `gerar-em-vez-de-materializar` | cons. — `node:GeneratorExp` em forma nova (medindo memória) | `quanto-ocupa-na-memoria`, M16 `gerar-sem-guardar` |
| `fazer-em-lote` | `api:itertools.batched` | `gerar-em-vez-de-materializar` |
| `quando-parar-de-otimizar` | cons. — `api:timeit.timeit` em forma nova (o ganho que não paga a legibilidade) | `onde-o-tempo-vai` |

### Módulo 23 — `empacotamento-e-distribuicao`

| Aula | Ensina | Presume |
|---|---|---|
| `o-pacote-e-uma-pasta` | cons. — `node:ImportFrom` em forma nova (import relativo, `from . import x`) | M10 `o-seu-proprio-modulo` |
| `o-arquivo-que-descreve-o-projeto` | cons. — leitura de `pyproject.toml` (`term:pyproject`, `term:build backend`) | `o-pacote-e-uma-pasta` |
| `ler-o-proprio-toml` | `api:tomllib.load` | `o-arquivo-que-descreve-o-projeto`, M11 `abrir-um-arquivo` |
| `ambiente-isolado` | cons. — leitura de `venv` e `pip` (`term:ambiente virtual`) | `o-arquivo-que-descreve-o-projeto` |
| `a-versao-do-seu-pacote` | `api:importlib.metadata.version` | `ambiente-isolado` |
| `rodar-como-programa` | `global:__name__` (o `if __name__ == "__main__"` e o `__main__.py`) | `o-pacote-e-uma-pasta`, M2 `igual-e-diferente` |
| `argumentos-da-linha-de-comando` | `api:argparse.ArgumentParser`, `api:sys.argv` | `rodar-como-programa` |
| `publicar` | cons. — leitura de `wheel` e `sdist` (`term:wheel`, `term:sdist`) | `a-versao-do-seu-pacote` |

### Módulo 24 — `ferramentas-e-qualidade`

| Aula | Ensina | Presume |
|---|---|---|
| `o-estilo-tem-nome` | cons. — leitura da PEP 8 (`term:PEP 8`, `term:snake_case`) | M12 `o-construtor` |
| `o-formatador-decide-por-voce` | cons. — leitura de formatador automático (`term:formatador`) | `o-estilo-tem-nome` |
| `o-lint-acha-o-que-voce-nao-ve` | cons. — leitura de lint (`term:lint`) | `o-formatador-decide-por-voce` |
| `registrar-em-vez-de-imprimir` | `api:logging.getLogger`, `api:logging.basicConfig` | M1 `a-primeira-linha`, M10 `trazer-so-um-nome` |
| `os-niveis-do-registro` | `api:.warning`, `api:.exception` | `registrar-em-vez-de-imprimir`, M9 `guardar-o-erro-num-nome` |
| `configuracao-por-ambiente` | `api:os.environ` | `registrar-em-vez-de-imprimir` |
| `avisar-que-vai-sumir` | `api:warnings.warn`, `global:DeprecationWarning` | `os-niveis-do-registro` |
| `o-robo-que-roda-os-testes` | cons. — leitura de integração contínua (`term:CI`) | M19 `escrever-o-teste-antes` |

### Módulo 25 — `padroes-de-projeto-em-python`

| Aula | Ensina | Presume |
|---|---|---|
| `o-contrato-abstrato` | `api:abc.ABC`, `api:abc.abstractmethod` | M12 `herdar`, M18 `o-contrato-sem-heranca` |
| `estrategia-e-uma-funcao` | cons. — `node:Lambda` em forma nova (a estratégia passada como valor) | M17 `passar-funcao-como-argumento` |
| `fabrica-com-dicionario` | cons. — `node:Dict` em forma nova (nome para construtor) | M7 `criar-um-dicionario`, M12 `criar-um-objeto` |
| `despacho-por-tipo` | `api:functools.singledispatch` | `o-contrato-abstrato`, M17 `escrever-um-decorador` |
| `contexto-sem-classe` | `api:contextlib.contextmanager` | M15 `a-funcao-que-pausa`, M13 `o-proprio-with` |
| `fechar-varios-de-uma-vez` | `api:contextlib.ExitStack`, `api:contextlib.suppress` | `contexto-sem-classe` |
| `objeto-que-nao-muda` | cons. — `api:dataclasses.dataclass` em forma nova (`frozen=True`) | M18 `dado-sem-boilerplate` |
| `trocar-a-peca-de-fora` | cons. — `node:arg` em forma nova (injeção de dependência por parâmetro) | `estrategia-e-uma-funcao`, M8 `valor-padrao-no-parametro` |
| `o-registro-de-plugins` | cons. — `node:Decorator` em forma nova (decorador que registra num dicionário) | `fabrica-com-dicionario`, M17 `escrever-um-decorador` |
| `o-que-python-nao-precisa-de-padrao` | cons. — `node:ClassDef` em forma nova (a classe que devia ser função) | `estrategia-e-uma-funcao`, M12 `o-molde-e-o-objeto` |

### Módulo 26 — `por-dentro-do-python`

| Aula | Ensina | Presume |
|---|---|---|
| `tudo-e-objeto` | cons. — `global:type` em forma nova (`type(type)`) | M1 `o-tipo-de-cada-valor`, M12 `o-molde-e-o-objeto` |
| `o-atributo-mora-num-dicionario` | `global:dir`, `global:hasattr` | `tudo-e-objeto` |
| `ler-um-atributo-pelo-nome` | `global:getattr`, `global:setattr` (**só com nome literal** — nome montado é proibição global) | `o-atributo-mora-num-dicionario` |
| `o-descritor` | cons. — `node:MethodDef` em forma nova (`__get__`/`__set__`/`__set_name__`) | M12 `propriedade-calculada`, M13 `o-que-o-python-chama-por-baixo` |
| `a-classe-tambem-tem-molde` | cons. — `node:ClassDef` em forma nova (`metaclass=`; `node:keyword` é estrutural) | `tudo-e-objeto`, M12 `herdar` |
| `criar-classe-em-tempo-de-execucao` | cons. — `global:type` em forma nova (três argumentos) | `a-classe-tambem-tem-molde` |
| `contar-referencias` | `api:sys.getrefcount`, `api:gc.collect` | M22 `quanto-ocupa-na-memoria` |
| `referencia-fraca` | `api:weakref.ref` | `contar-referencias` |
| `o-bytecode` | `api:dis.dis` | M22 `onde-o-tempo-vai` |
| `inspecionar-o-proprio-codigo` | `api:inspect.signature`, `api:inspect.getsource` | `o-atributo-mora-num-dicionario`, M8 `so-por-posicao-so-por-nome` |
| `bit-a-bit` | `op:binary:&`, `op:binary:^` | M1 `somar`, `o-bytecode` |
| `o-mesmo-tubo-em-dois-lugares` | cons. — `op:binary:\|` em forma nova (sobre inteiros, depois de tê-lo visto em tipo) | `bit-a-bit`, M18 `pode-faltar` |
| `deslocar-bits` | `op:binary:<<`, `op:binary:>>` | `bit-a-bit` |
| `inverter-os-bits` | `op:unary:~` | `deslocar-bits` |
| `bits-no-proprio-nome` | `op:aug:&`, `op:aug:\|` | `deslocar-bits`, M3 `acumular-num-nome` |
| `deslocar-no-proprio-nome` | `op:aug:^`, `op:aug:<<` | `bits-no-proprio-nome` |
| `o-ultimo-deslocamento` | `op:aug:>>`, `api:.bit_length` | `deslocar-no-proprio-nome` |
| `texto-com-molde` | `node:TemplateStr`, `node:Interpolation` | M1 `texto-com-buraco`, M6 `formatar-com-largura` |
| `chamar-c-de-dentro-do-python` | `api:ctypes.CDLL` | `contar-referencias` |
| `o-decimal-mente` | cons. — `node:FloatLiteral` em forma nova (`0.1 + 0.2`) | M1 `dividir-da-decimal`, M10 `decimal-exato` |
| `ler-o-fonte-do-cpython` | cons. — `api:inspect.getsource` em forma nova (do próprio módulo da stdlib) | `inspecionar-o-proprio-codigo`, `o-bytecode` |

---

## A tensão A6 × I3, e como esta trilha a resolve

A bateria tem duas regras que, lidas ao pé da letra, se contradizem em toda aula de consolidação:

- **A6** (erro) — `atomos(solutionCode) ∩ introduces.productive ≠ ∅`: a aula tem de **puxar** algo.
- **I3** — nenhuma construção é introduzida por duas aulas (unicidade de origem).

Uma aula que só reforça não pode satisfazer A6 sem re-declarar um átomo já introduzido, o que
aparenta violar I3.

**Resolução adotada:** I3 fala da **primeira introdução** (a aula que é `primeiraAulaQueEnsina` para
o átomo), não de toda menção. Uma aula de consolidação declara `role: "consolidation"` e lista em
`introduces.productive` o átomo que **reexercita**; `targetAtom` continua apontando para a aula de
origem. É o que a trilha de 0 violações do repositório já faz.

**São 109 aulas de consolidação em 337 (32%), e a distribuição é desigual de propósito.** A régua
"≤2 por módulo" da versão anterior não sobrevive ao contato com o `ast` do Python, e mentir sobre
isso seria pior que declarar. Os três módulos que estouram, com a causa **medida**:

| Módulo | cons. | Causa |
|---|---|---|
| M4 `caixas-que-devolvem` | 10 de 14 | §3.6 manda decompor "função" em seis passos; o `ast` dá **três** chaves (`node:FunctionDef`, `node:arg`, `node:Return`) |
| M13 `o-modelo-de-dados` | 8 de 15 | o adaptador refina **dois** dunders (`node:InitMethod`, `node:DunderStr`); os outros catorze protocolos são `node:MethodDef` para o gate |
| M8 `funcoes-em-profundidade` | 7 de 14 | `f(a=1)`, `f(**d)`, `def f(a, /, b, *, c)` e a recursão são quatro eventos de currículo distintos sobre **zero** chave nova (`node:keyword` é estrutural) |

A regra que esta trilha se impõe no lugar da antiga: **toda consolidação nomeia o degrau na própria
célula `Ensina`** ("em forma nova (…)"), e o script abaixo reprova consolidação que reforce átomo sem
origem anterior. Consolidação sem degrau é aula que não ensina nada, e o gate está certo em
reclamar.

---

## A verificação Ensina × Presume

**É reexecutável, e ela é a rede.** Como as tabelas são o dado, a conferência roda sobre este próprio
arquivo. O script lê as 26 tabelas, monta a ordem global e reprova **seis** coisas:

| # | O que reprova |
|---|---|
| I12 | slug de aula repetido |
| LACUNA | `Presume` apontando para aula que ainda não veio (lacuna de currículo ou inversão de ordem) |
| I3 | átomo introduzido por duas aulas fora de consolidação — ou por uma aula, sendo axioma |
| VOCAB | chave de eixo FECHADO (`node:`/`op:`/`decl:`/`global:`) que não existe em `atoms.python.json`; `api:`/`term:` só por formato |
| A7 | mais de 2 átomos numa aula que não é consolidação |
| A6 | aula que não introduz nem consolida nada · consolidação que reforça átomo sem origem anterior |

Ele é **fail-closed**: sem o inventário no disco ele reprova, em vez de calar a checagem de eixo
fechado.

```bash
cd <raiz do repositório>
python3 - docs/17-trilha-python.md <<'EOF'
import json, os, re, sys

txt = open(sys.argv[1], encoding='utf-8').read()
REL = os.path.join('app', 'electron', 'main', 'engine', 'vocab', 'atoms.python.json')
inv, d = None, os.path.dirname(os.path.abspath(sys.argv[1]))
for base in [os.getcwd(), d, os.path.dirname(d), os.path.dirname(os.path.dirname(d))]:
    if os.path.exists(os.path.join(base, REL)): inv = os.path.join(base, REL); break
# FAIL-CLOSED (docs/16 §9.3): sem o inventário o eixo fechado não é conferido, e
# um gate que se cala quando não consegue conferir é pior que gate nenhum.
if inv is None:
    print('FALHA: não achei %s — rode a partir da raiz do repositório' % REL); sys.exit(1)
VOCAB = set()
for eixo in json.load(open(inv, encoding='utf-8'))['axes'].values():
    VOCAB.update(eixo)

AXIOMA = {'node:Call', 'node:StrLiteral'}
ESTRUTURAL = {'node:Module', 'node:Name', 'node:Load', 'node:Store', 'node:Del',
              'node:arguments', 'node:Expr', 'node:alias', 'node:keyword'}
SEMENTE = {'node:FunctionDef', 'node:arg', 'node:Return', 'node:Attribute', 'node:Import',
           'node:ImportFrom', 'node:ClassDef', 'node:MethodDef', 'node:IntLiteral',
           'node:With', 'node:withitem', 'node:Assign', 'decl:assign',
           'api:unittest.TestCase', 'api:.assertEqual', 'api:.assertTrue',
           'api:.assertIsNone', 'api:.assertRaises', 'api:runpy.run_path',
           'api:io.StringIO', 'api:contextlib.redirect_stdout', 'api:.getvalue'}

PAR = {'decl:assign': ['node:Assign'], 'decl:unpack': ['node:Assign'],
       'decl:ann': ['node:AnnAssign'], 'decl:aug': ['node:AugAssign'],
       'decl:walrus': ['node:NamedExpr'], 'decl:global': ['node:Global'],
       'decl:nonlocal': ['node:Nonlocal'], 'decl:except-as': ['node:ExceptHandler'],
       'node:With': ['node:withitem'], 'node:AsyncWith': ['node:withitem'],
       'node:ListComp': ['node:comprehension'], 'node:SetComp': ['node:comprehension'],
       'node:DictComp': ['node:comprehension'], 'node:GeneratorExp': ['node:comprehension'],
       'node:Match': ['node:match_case']}
FAMILIA = {'op:binary:': 'node:BinOp', 'op:bool:': 'node:BoolOp', 'op:unary:': 'node:UnaryOp',
           'op:compare:': 'node:Compare', 'op:aug:': 'node:AugAssign'}
FORMATO = re.compile(r'^(?:api|term):\S')
CONS = re.compile(r'cons\.|^— \(')

infence = False; mod = None; aulas = []
for ln in txt.split('\n'):
    if ln.strip().startswith('```'):
        infence = not infence; continue
    if infence: continue
    m = re.match(r'^#{2,4} Módulo (\d+) — ', ln)
    if m: mod = int(m.group(1)); continue
    if ln.startswith('## ') and 'Módulo' not in ln: mod = None
    if mod and ln.startswith('| ') and not re.match(r'^\|[\s\-:|]+\|$', ln):
        c = [x.strip().replace('\\|', '|') for x in re.split(r'(?<!\\)\|', ln.strip().strip('|'))]
        if c[0] in ('Aula', '#'): continue
        if len(c) == 3: aulas.append((mod, c[0].strip('`'), c[1], c[2]))
        elif len(c) == 5: aulas.append((mod, c[1].strip('`'), c[2], c[4]))

vistos = set(); origem = {}; derivado = set(); falhas = []
disponivel = lambda a: a in origem or a in derivado or a in AXIOMA or a in ESTRUTURAL or a in SEMENTE
ATOMO = re.compile(r'`((?:node|decl|op|global|api|form|term):[^`]+)`')

for i, (mod, slug, ensina, presume) in enumerate(aulas):
    if slug in vistos: falhas.append('I12 slug repetido: %s' % slug)
    if i > 0 and not presume.strip(): falhas.append('PRESUME vazio: %s' % slug)
    if i == 0 and presume.strip() != 'nada':
        falhas.append('A aula 1 tem de presumir "nada" (achei %r)' % presume)
    for r in re.findall(r'`([a-z0-9][a-z0-9\-]{2,})`', presume):
        if '-' in r and r not in vistos:
            falhas.append('LACUNA M%d/%s presume %s' % (mod, slug, r))
    atomos = ATOMO.findall(ensina)
    for a in atomos:
        eixo = a.split(':', 1)[0]
        if eixo in ('node', 'decl', 'op', 'global'):
            if a not in VOCAB:
                falhas.append('VOCAB M%d/%s: %s não está em atoms.python.json' % (mod, slug, a))
        elif not FORMATO.match(a):
            falhas.append('FORMATO M%d/%s: %s' % (mod, slug, a))
    if CONS.search(ensina):
        # `term:` numa aula de consolidação é termo NOVO da prosa, não átomo
        # reforçado: ele vive em `introducesTerms` e não tem eixo fechado.
        for a in [x for x in atomos if not x.startswith('term:')]:
            if not disponivel(a):
                falhas.append('CONS M%d/%s reforça %s, que nenhuma aula anterior ensinou' % (mod, slug, a))
    else:
        if len(atomos) > 2:
            falhas.append('A7 M%d/%s introduz %d átomos (teto 2)' % (mod, slug, len(atomos)))
        if not atomos:
            falhas.append('A6 M%d/%s não introduz nem consolida nada' % (mod, slug))
        for a in atomos:
            if a in origem: falhas.append('I3 %s: %s e %s' % (a, origem[a], slug))
            elif a in AXIOMA: falhas.append('I3 %s é AXIOMA e %s reintroduz' % (a, slug))
            else: origem[a] = slug
            for d in PAR.get(a, []): derivado.add(d)
            for pre, d in FAMILIA.items():
                if a.startswith(pre): derivado.add(d)
    vistos.add(slug)

mods = sorted({m for m, _, _, _ in aulas})
print('%d módulos · %d aulas · %d átomos com origem única · %d derivados · %d falhas'
      % (len(mods), len(aulas), len(origem), len(derivado), len(falhas)))
for f in falhas[:200]: print(' ', f)
sys.exit(1 if falhas else 0)
EOF
# 26 módulos · 337 aulas · 331 átomos com origem única · 14 derivados · 0 falhas
```

**Resultado desta versão: `0 falhas`** — 26 módulos, 337 aulas, 331 átomos com origem única, 14
chaves derivadas pela regra do par.

**A rede foi testada com mutantes**, porque script que nunca reprovou nada não é rede. Cinco defeitos
injetados um a um sobre este mesmo arquivo, todos pegos:

| Mutante injetado | O que o script disse |
|---|---|
| `node:ChainedCompare` no lugar da consolidação de `comparar-encadeado` | `VOCAB M2/comparar-encadeado: node:ChainedCompare não está em atoms.python.json` |
| `arredondar` passa a presumir `o-tipo-de-cada-valor` (aula 18, quatro depois) | `LACUNA M1/arredondar presume o-tipo-de-cada-valor` |
| a aula `nao` deixa de ensinar qualquer coisa | `A6 M2/nao não introduz nem consolida nada` |
| `sorteio` ganha um terceiro átomo | `A7 M10/sorteio introduz 3 átomos (teto 2)` |
| `pegar-so-os-primeiros` reintroduz `api:itertools.chain` | `I3 api:itertools.chain: ferramentas-de-iteracao e pegar-so-os-primeiros` |

**O que a verificação encontrou nesta reescrita** (cada item é um defeito que estaria na trilha):

1. **Nove chaves de átomo INVENTADAS pela versão anterior** — `node:ChainedCompare`,
   `node:ClassBase`, `node:ClassVar`, `node:ArgAnnotation`, `node:Returns`, `node:GenericAnnotation`,
   `node:ComprehensionIf`, `node:DunderEnter`, `node:DunderExit`. Nenhuma existe em
   `atoms.python.json`; os eixos `node:`/`op:`/`decl:`/`global:` são FECHADOS e validados por
   pertença estrita. As nove aulas viraram consolidação, com o degrau nomeado.
2. **`node:keyword` era átomo e estrutural ao mesmo tempo.** A versão anterior dava a aula
   `chamar-pelo-nome` como `node:keyword` e listava `node:keyword` entre os estruturais sempre
   permitidos, duas seções acima. A aula virou consolidação.
3. **`api:.join` tinha duas origens** — `juntar-numa-string` (M6, `",".join(xs)`) e `esperar-terminar`
   (M20, `thread.join()`). É a **mesma chave**: o extrator emite `api:.<método>` quando o receptor é
   nome local, e não sabe o tipo dele. A aula de M20 virou consolidação, e o degrau (juntar texto ×
   esperar thread) virou o conteúdo dela.
4. **`op:binary:|` era pressuposto pela aula de `int | None` sem aula de origem.** Medido:
   `int | None` em anotação emite `node:OptionalAnnotation` **e** `op:binary:|` **e** `node:BinOp`.
   A aula `pode-faltar` (M18) passou a introduzir os dois, e a aula de bit a bit (M26) virou
   consolidação com o degrau explícito (o mesmo `|` sobre inteiros).
5. **`api:itertools.chain` era introduzido duas vezes** (M10 e M15). O de M15 virou
   `api:itertools.tee`, que é o que aquela aula de fato ensina.
6. **`global:hash` tinha duas origens** — a aula de chave de dicionário (M7) e a de `__hash__` (M13).
   Ficou em M7, onde a pergunta "por que a chave precisa ser imutável" nasce; a de M13 virou
   consolidação.
7. **A regra do par não estava escrita, e sem ela `x += 1` é ilegal.** Medido: três chaves para um
   gesto (`decl:aug`, `node:AugAssign`, `op:aug:+`), contra um teto de 2. Ver §"A regra do par".
8. **O harness da fase SAÍDA não cabia na semente receptiva do código.** Oito chaves faltam em
   `PYTHON_HARNESS_RECEPTIVE_SEED` e duas sobram sem nunca ocorrer. Dívida declarada em §"A semente
   receptiva".
9. **`with self.assertRaises(...)` em M9 cobrava `node:With`, ensinado só em M11.** Virou regra de
   harness declarada: antes de M11 o teste usa a forma de chamada.
10. **`importlib.import_module` no harness de captura de saída é PROIBIÇÃO GLOBAL.** Está literal em
    `PY_FORBIDDEN_INVARIANTS`. O harness passou a usar `runpy.run_path`, que além de permitido roda o
    arquivo do zero a cada chamada — sem isso, o segundo teste da mesma classe leria saída vazia.

**O que a verificação NÃO prova.** Ela prova ausência de lacuna de currículo e de inversão de ordem
no nível de construção. Ela **não** prova o teto de composição ([`16`](16-engine-de-trilha.md) §3.7:
saber `if` e saber função não é saber `if` dentro de função) — isso é responsabilidade das aulas
`role: "integration"` que a fase F3 deriva, e do gate A9. Também não prova o teto de 120 s por
desafio, que só é mensurável depois de a solução de referência existir.

---

## Desafios de módulo

No fim de cada um dos 26 módulos existe um **desafio de MÓDULO**
(`modules/<slug>/challenges/<slug>/challenge.json`, declarado em `module.json` como `challenge`):

- **Multi-arquivo** — `files[]` com 2–3 arquivos que se importam entre si (a partir de M10, quando
  `import` existe; antes disso, arquivo único);
- **Elaborado** — statement longo com cenário do mundo real (2–4 mil caracteres) e 4–6 testes;
- **Autoral** — não é gerado por LLM: o botão "Gerar novo desafio" não aparece quando o target é
  `module`;
- **Restrição de orçamento igual à das aulas** — pode compor livremente o que o módulo ensinou, mas
  **não pode introduzir construção nova**. Um desafio de módulo que precisa de algo não ensinado é a
  prova de que falta uma aula;
- Os aninhamentos que ficaram de fora das tabelas por não serem átomos (laço dentro de laço, lista de
  listas, dicionário de listas) são o material natural desses desafios: composição é o que eles
  testam.

## UX

- **Teoria determinística** — a aula apresenta a teoria direto do `lesson.json` (markdown, seção por
  seção): sem LLM e sem loading. O LLM é usado só para dúvidas (`answer`) e para gerar novo desafio.
- **Falha rápida sem chave** — sem chave de LLM o `answer` devolve erro estruturado
  (`TUTOR_UNAVAILABLE`); o fluxo nunca trava em spinner.
- **Checks por teste** — o veredito mostra ✓/✗ por teste. **Em Python o rótulo do check é a docstring
  do método**, não o nome dele: medido, `unittest -v` imprime a linha do id e, quando existe
  docstring, a primeira linha dela logo abaixo, antes do `... ok`:

  ```
  test_imprime_oi (tests.test_solucao.TestAPrimeiraLinha.test_imprime_oi)
  o programa imprime oi ... ok
  ```

  Logo: **todo método de teste desta trilha carrega uma docstring de uma linha em pt-BR**. Sem ela o
  aluno leria `test_imprime_oi`, que é ruído.
- **Erro de recuo tem tratamento próprio.** `IndentationError` e `TabError` acontecem na importação,
  então o `unittest` reporta erro de coleta e nenhum teste roda. O veredito precisa dizer "seu arquivo
  não chegou a rodar: o recuo está errado na linha N", nunca "0 de 3 testes passaram" — que é
  verdadeiro e inútil.
- **Na fase SAÍDA o veredito mostra o que o programa imprimiu**, lado a lado com o que era esperado.
  É a mesma tela que o aluno vai ler 337 aulas depois quando um teste de valor falhar, e ela precisa
  ser a mesma desde a aula 1.

## Regras para os desafios de aula (`challenge.json`)

- `language: 'python'`; `programmingLanguage: 'python'`, `runtime: 'cpython-3.14'`,
  `harnessLanguage: 'python'` no `track.json`; slug da trilha: **`python`**;
- layout obrigatório: `solucao.py` na raiz, `tests/__init__.py` (o exit-guard, e **sem ele nada
  roda**) e `tests/test_solucao.py`;
- **fase SAÍDA** (M1–M3): `outputChannel: 'impressao'`, o teste captura `stdout` com
  `runpy.run_path` + `contextlib.redirect_stdout`; o arquivo do aluno é um **script**, sem função;
- **a virada** (M4 `imprimir-nao-e-devolver`): `outputChannel: 'ambos'`, três testes — devolve,
  imprime, e chamar sozinha não imprime;
- **fase VALOR** (M4 em diante): `outputChannel: 'retorno'`, o teste importa com
  `from solucao import <funcao>`;
- o teste **falha** com o starter e **passa** com a solução; `expectedTestCount` = nº de testes;
  2–4 testes por desafio de aula;
- a função do desafio é derivada do slug (kebab → snake_case: `dobro-do-numero` → `dobro_do_numero`)
  — **snake_case, não camelCase**;
- todo método de teste tem docstring de uma linha em pt-BR (é o rótulo do check);
- **cenário `error` só existe se o orçamento permitir** (A11): exigir "entrada inválida que deve
  falhar" antes da aula `levantar-um-erro` (M9) é precisamente a causa-raiz que produziu o desafio
  impossível da aula 1 da trilha legada. Antes de M9, os cenários possíveis são `example` e
  `boundary`;
- **antes de M11**, teste que espera erro usa `self.assertRaises(Erro, funcao, arg)` — nunca o `with`;
- **em M20 e M21**, toda função enviada a processo é função de módulo, nunca `lambda` nem closure;
- statement em markdown pt-BR, linguagem simples;
- **proibições sempre**, em qualquer aula, starter, teoria ou solução: `eval`, `exec`, `compile`,
  `__import__`, `globals()`, `locals()`, `vars()`, `importlib.import_module`, `getattr`/`setattr` com
  nome não-literal, e definir `__getattr__`/`__getattribute__`.

## Teste de proficiência (`proficiency.json`)

Cobre os conceitos centrais de todos os módulos: saída e valor, nome e ligação, decisão, repetição,
função com parâmetro e retorno, lista, dicionário, erro tratado, arquivo, classe, protocolo, gerador,
tipo anotado e concorrência. Enunciado em linguagem simples que **não pressupõe programação** (o aluno
pode fazer o teste antes da primeira aula). Dificuldade 5, carência da 1ª estrela 120 s — pressão de
tempo degrada acurácia. Quem passa destrava a trilha inteira.

## Fora de escopo (declarado)

O que esta trilha **não** ensina, e por quê. Cada item é uma decisão, não um esquecimento:

- **Pacotes de terceiros** (`numpy`, `pandas`, `requests`, `django`, `flask`, `pytest`). A trilha
  inteira roda só com o interpretador e a stdlib — é o que torna o desafio executável sem instalação
  e o gate determinístico. `venv`/`pip` aparecem como **leitura** em M23, e o assunto do módulo é
  empacotar o **seu** código, não instalar o dos outros. Consequência aceita: `op:binary:@` e
  `op:aug:@` (multiplicação de matriz) não têm aula, porque nenhum tipo da stdlib os implementa.
- **Web, banco de dados e ciência de dados.** Todos dependem do item acima.
- **Metaprogramação por nome montado** — `eval`, `exec`, `globals()`, `locals()`, `vars()`,
  `getattr` com nome variável, `__getattr__`/`__getattribute__`. **Não é escolha de escopo, é
  condição de existência do gate**: são exatamente as construções que tornam a análise estática
  indecidível, e estão em `PY_FORBIDDEN_INVARIANTS`. Descritor (`__get__`/`__set__`) e metaclasse
  (`class M(type)`) **não** estão na lista e por isso têm aula, em M26.
- **`node:ComplexLiteral`** (`3j`). Está no vocabulário e nenhuma aula o ensina: número complexo não
  aparece no trabalho de quem programa em Python fora de domínio científico, e o domínio científico
  cai no primeiro item.
- **Os nós de modo de parse** (`node:Interactive`, `node:Expression`, `node:FunctionType`,
  `node:Suite`) e os legados do `ast` anterior ao 3.9 (`node:Index`, `node:ExtSlice`,
  `node:AugLoad`, `node:AugStore`): não ocorrem ao parsear um arquivo `.py` no 3.14. Estão no
  inventário porque o inventário é gerado do `ast`, não escolhido.
- **`node:TypeIgnore`** (`# type: ignore` como nó) — só existe com `ast.parse(..., type_comments=True)`,
  que o extrator não usa.
- **Interface gráfica** (`tkinter`, `turtle`). São stdlib, mas nenhum desafio delas é verificável por
  asserção de valor ou de saída.
