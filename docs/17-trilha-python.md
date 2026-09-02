# Trilha Python do Zero — especificação de conteúdo

> Contrato de CONTEÚDO da trilha `python-do-zero`. Este documento define O QUÊ cada módulo e cada
> aula ensinam e o que se presume que o aluno já sabe. Ele é o INSUMO da engine de trilhas: a
> coluna `Ensina` vira `introduces` e a coluna `Presume` vira o grafo de pré-requisitos e o
> orçamento cumulativo de [`16-engine-de-trilha.md`](16-engine-de-trilha.md) §3.5.
>
> **Autoridade.** Onde este documento e [`16-engine-de-trilha.md`](16-engine-de-trilha.md)
> divergirem, o 16 vence. Onde este documento e um gate determinístico divergirem, o gate vence — e
> este documento está errado.
>
> **Molde.** A estrutura é a de [`15-trilha-nodejs.md`](15-trilha-nodejs.md); o nível de exigência é
> o de `app/content-src/programacao-do-zero/curriculo.md` (apagado em 2026-09-02 junto com a
> trilha — ver [`15-trilha-nodejs.md`](15-trilha-nodejs.md); o formato do currículo continua
> descrito neste documento)
> — a trilha de maior qualidade do repositório (14 aulas micro, **0 violações** no gate), cujo
> padrão **L1-lê / Ln-escreve** este documento imita aula por aula no módulo 1.
>
> **Base.** Fatos de linguagem medidos nesta máquina (CPython 3.14.7 — cada comando aparece ao lado
> do número que ele produz, como exige o `CONTRIBUTING.md`); o dossiê
> [`research/08-multilingua-trava-deterministica.md`](research/08-multilingua-trava-deterministica.md)
> §5 (ficha Python — Tier A: `ast` + `symtable` na stdlib); os princípios de
> [`02-pedagogia.md`](02-pedagogia.md); e, como fonte externa nomeada, John M. Zelle, *Python as a
> First Language* (Wartburg College) — "Python programs look like executable pseudo-code",
> "block structure is indicated by indentation", "Python is dynamically typed, so there is no need
> for variable declarations" e "a minimal but complete set of simple control structures: one
> selection construct (if-elif-else), one definite loop (for) and one indefinite loop (while)".

## Público e axioma de entrada

**Público: quem nunca programou.** Zero absoluto, igual ao da trilha `programacao-do-zero`.

**Axioma de entrada produtivo: vazio.** Nenhuma construção é exigível do aluno na aula 1. O que ele
lê sem escrever (o invólucro do desafio e o arquivo de teste) entra na faixa **receptiva** pela
política `receptive-seed` ([`16`](16-engine-de-trilha.md) §3.2/D1) e está enumerado abaixo, em
"A semente receptiva do harness Python".

Consequência que governa o módulo 1 inteiro: **nenhuma aula pode cobrar uma construção que nenhuma
aula anterior ensinou**, e "ensinou" quer dizer demonstrou em bloco de código, não declarou em
prosa (A13 — declarar não é demonstrar).

## Os fatos da linguagem que governam esta trilha

Todos medidos nesta máquina; cada linha traz o comando.

| Fato | Consequência de currículo |
|---|---|
| Runner: `python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v` | não há framework a instalar; `unittest` é stdlib |
| `tests/__init__.py` é **OBRIGATÓRIO** | sem ele o Python 3.14 recusa a descoberta: `ImportError: Start directory is not importable`. Medido: `python3 -B -m unittest discover -s tests -t . -p 'test_*.py'` com e sem o arquivo |
| Exit **0** passou · **1** falhou · **5** nada rodou | ao contrário do Node, não existe o buraco "exit 0 com zero testes"; a igualdade dupla de contagem continua obrigatória mesmo assim |
| **Não existe `export`** | o `node:ExportKeyword`, que é a 3ª aula produtiva da trilha JS, **não tem aula em Python**: nomes de módulo já são públicos e o teste faz `from solucao import resposta` |
| **Não existe palavra-chave de declaração** (Zelle) | o eixo `decl:` do vocabulário não tem análogo direto; ele é repropostro para **formas de ligação** (§ "Vocabulário") |
| **Não existe `const`** | a aula de `const` da trilha JS não tem contraparte; o lugar dela na progressão é ocupado por `print` × `return` e por `None` |
| **Bloco é recuo, não chave** (Zelle) | o recuo é evento de currículo próprio, e é **invisível na AST** — tratado na aula `return-e-o-recuo` (§ "Módulo 1") |
| Número e texto são o **mesmo nó** `ast.Constant` | sem refinar o literal por tipo de valor, a aula de texto introduziria ZERO construção nova e violaria A6 (a direção puxada). Medido: `python3 -c "import ast; print(type(ast.parse('7').body[0].value).__name__, type(ast.parse(chr(39)+'oi'+chr(39)).body[0].value).__name__)"` |
| Proibições sempre: `eval`, `exec`, `compile`, `__import__`, `getattr`/`setattr` com nome não-literal, `globals()`, `locals()` | são as construções que fazem o gate mentir ([`16`](16-engine-de-trilha.md) §5.3); nenhuma aula desta trilha as ensina, em nível nenhum |

Comandos de reprodução, na íntegra:

```bash
python3 --version                                        # Python 3.14.7
cd <desafio> && python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v
#   com tests/__init__.py      -> "Ran 1 test" / OK        / exit 0
#   sem tests/__init__.py      -> ImportError: Start directory is not importable
#   diretório sem test_*.py    -> "NO TESTS RAN"           / exit 5
#   solução que levanta erro   -> "FAILED (errors=1)"      / exit 1
```

## O que o `ast` esconde — as doze distinções que o adaptador precisa refinar

Este é o achado mais importante deste documento, e a razão de ele existir antes de qualquer aula
ser escrita. [`16`](16-engine-de-trilha.md) §3.1 abre com a observação de que "o ESTree modela
metade da didática como **atributo**, não como tipo de nó". Em Python o problema é **maior**: o
`ast` esconde doze distinções que são eventos de currículo — e cada uma delas, se não for refinada
pelo `constructKey` do adaptador, produz uma aula que introduz ZERO construção nova (violação A6) ou
uma aula que cobra algo que nenhuma aula anterior ensinou (lacuna de currículo).

O eixo `form:` **não está disponível em Python na v1** (o seletor é tipado sobre `ts.Node`), logo
todo refinamento tem de sair como chave sintética nos eixos `node:` e `decl:`. Há precedente no
próprio repositório: `node:ComputedNonLiteralAccess` é uma chave sintética que não existe em
`ts.SyntaxKind` e mesmo assim é emitida por `extract.ts` e listada em `FORBIDDEN_ALWAYS`
([`../app/electron/main/engine/atomKeys.ts`](../app/electron/main/engine/atomKeys.ts)).

| # | O que a aula precisa distinguir | O que o `ast` entrega | Chave que o adaptador deve emitir |
|---|---|---|---|
| 1 | número · texto · booleano · `None` · decimal | tudo é `Constant` | `node:IntLiteral`, `node:StrLiteral`, `node:BoolLiteral`, `node:NoneLiteral`, `node:FloatLiteral` — e **nunca** um `node:Constant` cru |
| 2 | `elif` × `else:` seguido de `if` | AST **idêntica**; só o `col_offset` do `If` interno difere (4 × 8, medido) | `node:Elif` quando `orelse` é um único `If` com o mesmo `col_offset` do pai |
| 3 | `if` com `else` × `if` sem `else` | `If.orelse` vazio ou não | `node:IfElse` quando `orelse` não é vazio |
| 4 | `for`/`while` com `else` | `For.orelse`/`While.orelse` | `node:ForElse`, `node:WhileElse` |
| 5 | `try` com `finally` | `Try.finalbody` | `node:Finally` |
| 6 | `except ValueError as e` | `ExceptHandler.name` | `decl:except-as` |
| 7 | `*args` e `**kwargs` | são `arg` comuns em `arguments.vararg`/`kwarg` | `decl:vararg`, `decl:kwarg` |
| 8 | parâmetro com valor padrão | `arguments.defaults` não vazio | `decl:default` (o análogo do `form:Parameter[initializer!=null]` do JS) |
| 9 | decorador (`@deco`) | **nenhum nó**: vive em `FunctionDef.decorator_list` | `node:Decorator` |
| 10 | `a, b = 1, 2` | `Assign` com alvo `Tuple` — igual a `x = 1` no eixo de nós | `decl:unpack` |
| 11 | método × função | ambos são `FunctionDef`; só o pai muda | `node:MethodDef` (dentro de `ClassDef`), e `node:InitMethod`/`node:DunderStr` para os dunders que a trilha ensina |
| 12 | `int \| None` em anotação × `\|` bit a bit | ambos são `BinOp(op=BitOr)` | `node:OptionalAnnotation` quando o `BinOp` está em posição de anotação |

Duas distinções que o `ast` **entrega de graça** e que por isso NÃO precisam de refinamento (ficam
registradas para ninguém gastar trabalho à toa): `xs[1]` é `Subscript` e `xs[1:3]` é `Subscript` +
`Slice`; `async def`/`await` são `AsyncFunctionDef`/`Await`.

Comando que produz a tabela acima:

```bash
python3 -c "
import ast
for nome, src in [('elif','def f(x):\n    if x>0:\n        return 1\n    elif x<0:\n        return 2\n'),
                  ('else-if','def f(x):\n    if x>0:\n        return 1\n    else:\n        if x<0:\n            return 2\n')]:
    t = ast.parse(src).body[0].body[0]
    print(nome, 'If pai col', t.col_offset, '| orelse[0]', type(t.orelse[0]).__name__, 'col', t.orelse[0].col_offset)"
# elif    If pai col 4 | orelse[0] If col 4
# else-if If pai col 4 | orelse[0] If col 8
```

## Vocabulário de átomos desta trilha

Os seis eixos de [`16`](16-engine-de-trilha.md) §3.1, com a forma que cada um assume em Python.

| Eixo | Forma da chave em Python | Exemplo |
|---|---|---|
| nós | `node:<ClassName do ast>` mais as chaves sintéticas da tabela acima | `node:FunctionDef`, `node:IntLiteral` |
| ligação (o antigo `decl:`) | `decl:<forma de ligação>` | `decl:assign`, `decl:ann`, `decl:aug`, `decl:unpack`, `decl:walrus`, `decl:global`, `decl:nonlocal`, `decl:vararg`, `decl:kwarg`, `decl:default`, `decl:except-as` |
| operadores | `op:<família>:<op>` — famílias `binary`, `compare`, `bool`, `unary`, `aug` | `op:binary:+`, `op:compare:==`, `op:bool:and`, `op:unary:not`, `op:aug:+` |
| globais | `global:<builtin>` | `global:print`, `global:len`, `global:range` |
| API | `api:<módulo>.<nome>` quando a raiz é importada ou builtin; `api:.<método>` quando o receptor é um nome local | `api:math.sqrt`, `api:.append` |
| termos da prosa | `term:<termo pt-BR>` | `term:recuo`, `term:traceback` |

Três decisões declaradas, com o motivo:

1. **`decl:` deixa de significar "palavra-chave de declaração" e passa a significar "forma de
   ligação de nome".** Python não tem `let`/`const`/`var` (Zelle: "there is no need for variable
   declarations"), mas tem seis formas distintas de ligar um nome a um valor, e trocar de forma é
   exatamente o evento de currículo que I11 exige que tenha aula própria. O eixo é preservado
   porque o VALOR pedagógico dele é a distinção de forma, não a palavra-chave.
2. **A progressão de "variável" nesta trilha é `decl:assign` → `decl:aug` → `decl:unpack` →
   `decl:ann`** — atribuição simples, aumentada, por desempacotamento e anotada. Não há `const`:
   em Python nada impede a religação, e prometer imutabilidade seria mentir sobre a linguagem.
3. **`op:compare:` é família própria, separada de `op:binary:`.** Em Python `==`, `<`, `in` e `is`
   são `ast.Compare`, não `ast.BinOp` — e `x in lista` é comparação, não operador binário como em
   JavaScript. Misturar as famílias faria o orçamento de uma aula de igualdade liberar aritmética.

### A semente receptiva do harness Python

O que o aluno lê em TODO desafio e não escreve em nenhum. Entra no receptivo da aula 1 e nunca no
produtivo (política `receptive-seed`, [`16`](16-engine-de-trilha.md) §3.2/D1):

```
node:Module  node:FunctionDef  node:arguments  node:arg  node:Return  node:Name
node:Expr    node:Call         node:Attribute  node:Import  node:ImportFrom  node:alias
node:ClassDef  node:MethodDef  node:IntLiteral  node:StrLiteral
global:unittest
api:unittest.TestCase  api:unittest.main
api:.assertEqual  api:.assertTrue  api:.assertIsNone  api:.assertRaises
```

Estruturais sempre permitidos (o análogo Python de `STRUCTURAL_ALWAYS_ALLOWED`): `node:Module`,
`node:Name`, `node:Load`, `node:Store`, `node:Del`, `node:arguments`, `node:Expr`, `node:alias`,
`node:keyword`. São contexto de expressão e container — não carregam didática nenhuma e listá-los
em toda aula só aumentaria a chance de esquecer um.

## Princípios pedagógicos aplicados

1. **Recuo antes de multi-linha.** O aluno só escreve a primeira linha nova quando a aula
   `return-e-o-recuo` já explicou que a linha pertence à caixa por causa dos espaços à esquerda.
   Antes disso, toda lacuna fica DENTRO de uma linha que o starter já indentou.
2. **L1-lê / Ln-escreve.** Função, `return`, parâmetro e variável são NOMEADOS como leitura na aula
   1 e só viram produtivos nas aulas 13, 5, 4 e 7 respectivamente — o mesmo padrão que levou
   `programacao-do-zero` a 0 violações.
3. **Pre-training → worked example → fading → prática independente.** Cada aula entrega a base
   conceitual, depois um exemplo completamente resolvido com sub-objetivos rotulados, e só então o
   desafio. O desafio nunca é "resolva do zero sem andaime".
4. **`print` × `return` cedo.** [`16`](16-engine-de-trilha.md) §10 registra que a solução que
   imprime enquanto o teste espera retorno é **o modo de falha número um** medido em exercícios
   gerados. Em Python isso é ainda mais provável, porque `print` é a primeira coisa que todo
   material de Python ensina. Esta trilha inverte a ordem: o aluno aprende `return` na aula 5 e só
   encontra `print` na aula 9, já sabendo que o conferidor não enxerga o que é impresso.
5. **Um erro por vez, com nome.** `IndentationError`, `NameError` e `TypeError` são apresentados
   como leitura na aula 12, antes de qualquer aula poder produzi-los sem aviso.
6. **Interleaving e recuperação espaçada** (A15b/I7): toda aula reutiliza ao menos um átomo
   demonstrado antes, e nenhuma família sintática ocupa três aulas seguidas sem intercalação.
7. **Linguagem simples, zero jargão sem explicação** — analogias do dia a dia; termos em inglês só
   quando são o nome real da coisa (`traceback`, `import`).
8. **Fontes fora do fluxo** — URLs ficam em `sources[]` e aparecem só no botão "Fontes".

## Estrutura da trilha

**14 módulos, 154 aulas.** O número de aulas é **saída, não entrada**
([`16`](16-engine-de-trilha.md) §3.6): ele é a consequência de aplicar o teto de ≤2 construções
produtivas novas por aula à progressão atômica abaixo, não uma meta.

| # | Módulo | Aulas | Presume-se que o aluno sabe |
|---|---|---|---|
| 1 | `fundamentos-do-zero` | 14 | Nada — é o zero absoluto |
| 2 | `contas-e-comparacoes` | 17 | O invólucro, o `return`, o nome e os literais (M1) |
| 3 | `decisao` | 8 | Comparação e operadores lógicos (M2) |
| 4 | `repeticao` | 8 | `if`/`else` (M3) |
| 5 | `listas` | 16 | `for` e `range` (M4) |
| 6 | `texto-em-profundidade` | 11 | Listas, `for`, `in` (M5) |
| 7 | `dicionarios-e-conjuntos` | 12 | Listas e texto (M5+M6) |
| 8 | `funcoes-em-profundidade` | 12 | Tuplas e dicionários (M7) |
| 9 | `erros-e-excecoes` | 8 | Funções com parâmetros variados (M8) |
| 10 | `modulos-arquivos-e-dados` | 9 | `try`/`except` (M9) |
| 11 | `classes-e-objetos` | 12 | `import` e dicionários (M10+M7) |
| 12 | `tipos-e-anotacoes` | 7 | Classes (M11) |
| 13 | `testes-e-qualidade` | 6 | Anotações e classes (M12+M11) |
| 14 | `python-idiomatico` | 14 | Tudo acima |

## Módulo 1 — `fundamentos-do-zero` (nível de átomo)

Este módulo é especificado no mesmo nível de exigência do `curriculo.md` de `programacao-do-zero`:
avanço produtivo NOVO por aula e exatamente o que o aluno digita. **Cada aula avança ≤1 átomo
produtivo**; tudo o mais é congelado no starter e declarado.

| # | slug | avanço produtivo NOVO | o aluno digita | presume |
|---|---|---|---|---|
| 1 | `como-o-conferidor-le-seu-codigo` | `node:IntLiteral` | `7` | nada |
| 2 | `valor-e-instrucao` | — (reforço de `node:IntLiteral`) | `42` | aula 1 |
| 3 | `chamar-a-caixa` | `node:Call` | `resposta()` | aula 1 |
| 4 | `parametro-e-argumento` | `node:arg` | `x` | aula 1 |
| 5 | `return-e-o-recuo` | `node:Return` (+ `term:recuo`) | `return x` | aula 4 |
| 6 | `texto-como-valor` | `node:StrLiteral` | `return "oi"` | aula 5 |
| 7 | `dar-nome-a-um-valor` | `decl:assign` | `contador = 0` | aulas 1, 5 |
| 8 | `ler-depois-de-escrever` | — (reforço de `decl:assign`) | `contador = 0` (e lê `contador = 5` congelado) | aula 7 |
| 9 | `mostrar-nao-e-devolver` | `global:print` | `print(mensagem)` | aulas 5, 6, 7 |
| 10 | `none-a-ausencia-de-valor` | `node:NoneLiteral` | `return None` | aulas 5, 9 |
| 11 | `verdadeiro-e-falso` | `node:BoolLiteral` | `return True` | aula 5 |
| 12 | `erro-de-sintaxe-e-erro-de-valor` | — (leitura; `term:IndentationError`, `term:NameError`, `term:TypeError`, `term:traceback`) | `6` | aulas 1–11 |
| 13 | `escrever-a-caixa-inteira` | `node:FunctionDef` | `def eco(x):` + corpo | aulas 4, 5 |
| 14 | `todas-as-pecas-juntas` | — (revisão) | invólucro com parâmetro, nome e texto | aulas 1–13 |

**Progressão produtiva do módulo 1 (10 átomos):**

`node:IntLiteral → node:Call → node:arg → node:Return → node:StrLiteral → decl:assign →
global:print → node:NoneLiteral → node:BoolLiteral → node:FunctionDef`

**Por que esta ordem — cada decisão, e o que ela elimina**

- **A aula 1 não presume função, chamada, parâmetro nem nome.** O aluno digita **um número**; todo
  o invólucro está congelado:

  ```python
  def resposta():
      return ␣
  ```

  A seção "como ler o desafio" ensina o invólucro **como leitura** e o declara em
  `avancos.receptivo`. Uma seção de vocabulário ("as palavras da caixa") **nomeia como leitura** os
  quatro conceitos — função (a caixa), `return` (a entrega), parâmetro (a janelinha por onde um
  valor entra) e variável (um nome que guarda um valor) — e mais dois que só existem em Python: os
  **dois-pontos** que abrem a caixa e o **recuo** que diz quais linhas estão dentro dela. Nada
  disso é cobrado produtivamente na aula 1: o produtivo dela é só `node:IntLiteral`.
- **A chamada (aula 3) vem antes da declaração (aula 13)** pelo mesmo motivo da trilha JS: escrever
  a declaração obrigaria a escrever o `return`, que é a aula 5. O starter da aula 3 traz duas
  caixas prontas e a lacuna é só `resposta()`.
- **Não há aula de `export`.** Em JavaScript, entregar a caixa ao conferidor é a 4ª aula produtiva
  (`node:ExportKeyword`). Em Python o nome do módulo já é público e o teste faz
  `from solucao import resposta`. O lugar que sobra na progressão é ocupado por `global:print`
  (aula 9) e `node:NoneLiteral` (aula 10) — os dois conceitos que a trilha JS não precisa ter.
- **O recuo entra na aula 5, e não antes.** Nas aulas 1 a 4 a lacuna está sempre DENTRO de uma
  linha que o starter já indentou, então errar o recuo é impossível. A aula 5 é a primeira em que o
  aluno escreve uma linha inteira — e é exatamente aí que o recuo passa a ser decidido por ele.
  Colocar o recuo antes seria ensinar uma regra sem lugar para aplicá-la; depois seria cobrar sem
  ter ensinado. O recuo não é átomo produtivo porque **não aparece na AST**: ele entra como
  `term:recuo` e como `notionalMachineDelta` da aula.
- **`print` só na aula 9, e como CONTRASTE.** A aula chama-se `mostrar-nao-e-devolver` e o desafio
  exige as duas coisas: imprimir E devolver. O aluno vê com os próprios olhos que o conferidor
  aprova pelo `return` e ignora o `print`. É a inoculação direta contra o modo de falha nº 1.
- **`None` na aula 10** porque é a consequência imediata da aula 9: uma caixa que só imprime
  devolve `None`. O aluno lê isso no veredito antes de escrever `return None`.
- **A aula 12 é de leitura pura** — o aluno provoca de propósito um `IndentationError` (tirando um
  espaço) e um `NameError` (escrevendo o nome errado), lê o `traceback` e só então digita `6` na
  lacuna. É a aula que torna o erro esperado em vez de assustador.

**Reuso e desafio progressivo (A15).** Inter-aula (A15b): a 3 reusa o `return` lido; a 5 reusa o
parâmetro escrito na 4; a 6 reusa o `return` da 5; a 7 reusa o `return`; a 9 reusa o nome da 7 e o
texto da 6; a 10 reusa o `return`; a 13 reusa parâmetro e `return`; a 14 reusa tudo. Esticar
(A15a): toda aula com conteúdo tem um 2º desafio que reusa o "fixar" e adiciona ≤1 átomo já
demonstrado na teoria (ex.: a 6 devolve um texto diferente; a 13 troca o corpo por `return x`
usando um nome intermediário).

## Conteúdo por aula — módulos 2 a 14

Nas tabelas abaixo, `Ensina` lista as construções produtivas novas (**no máximo 2**) e `Presume`
nomeia a aula anterior que ensinou cada construção pressuposta. "cons." marca uma aula de
**consolidação declarada** (`role: "consolidation"`) — ver § "A tensão A6 × I3".

### Módulo 2 — `contas-e-comparacoes`

| Aula | Ensina | Presume |
|---|---|---|
| `somar` | `op:binary:+` entre números | M1 (`parametro-e-argumento`, `return-e-o-recuo`) |
| `subtrair` | `op:binary:-`, `op:unary:-` | `somar` |
| `multiplicar` | `op:binary:*` | `subtrair` |
| `dividir` | `op:binary:/` (e o resultado é sempre decimal) | `multiplicar` |
| `divisao-inteira` | `op:binary://` | `dividir` |
| `resto-da-divisao` | `op:binary:%` | `divisao-inteira` |
| `potencia` | `op:binary:**` | `resto-da-divisao` |
| `ordem-das-contas` | cons. — parênteses e precedência; reforça `op:binary:*` | `potencia` |
| `juntar-textos` | `global:str` (+ `term:concatenação`: `+` sobre texto, e o `TypeError` de somar texto com número) | `somar`, M1 `texto-como-valor` |
| `texto-para-numero` | `global:int` | `juntar-textos` |
| `numeros-com-virgula` | `node:FloatLiteral`, `global:float` | `texto-para-numero`, `dividir` |
| `comparar-maior-menor` | `op:compare:>`, `op:compare:<` | `somar` |
| `igual-e-diferente` | `op:compare:==`, `op:compare:!=` | `comparar-maior-menor` |
| `maior-ou-igual` | `op:compare:>=`, `op:compare:<=` | `igual-e-diferente` |
| `e-e-ou` | `op:bool:and`, `op:bool:or` | `igual-e-diferente`, M1 `verdadeiro-e-falso` |
| `nao` | `op:unary:not` | `e-e-ou` |
| `somar-no-proprio-nome` | `decl:aug`, `op:aug:+` | M1 `dar-nome-a-um-valor`, `somar` |

### Módulo 3 — `decisao`

| Aula | Ensina | Presume |
|---|---|---|
| `se` | `node:If` | M2 `comparar-maior-menor` |
| `se-senao` | `node:IfElse` | `se` |
| `se-senao-se` | `node:Elif` | `se-senao` |
| `condicoes-compostas` | cons. — condição com `and`/`or` dentro do `if`; reforça `node:If` | `se-senao-se`, M2 `e-e-ou` |
| `verdadeiro-por-conveniencia` | `global:bool` (o que Python considera falso: `0`, `""`, lista vazia, `None`) | `se`, M1 `none-a-ausencia-de-valor` |
| `condicao-em-uma-linha` | `node:IfExp` (`a if cond else b`) | `se-senao` |
| `e-mesmo-o-nada` | `op:compare:is`, `op:compare:is-not` (`is None`, e por que não `== None`) | M1 `none-a-ausencia-de-valor`, `se` |
| `comparar-encadeado` | `node:ChainedCompare` (`0 < x < 10`) | M2 `maior-ou-igual` |

### Módulo 4 — `repeticao`

| Aula | Ensina | Presume |
|---|---|---|
| `contar-com-range` | `node:For`, `global:range` | M3 `se` |
| `percorrer-um-texto` | cons. — `for` sobre um texto, letra a letra; reforça `node:For` | `contar-com-range`, M1 `texto-como-valor` |
| `quantos-tem` | `global:len` | `percorrer-um-texto` |
| `acumular-num-nome` | cons. — somar dentro do laço; reforça `decl:aug` | `contar-com-range`, M2 `somar-no-proprio-nome` |
| `enquanto` | `node:While` | `acumular-num-nome`, M3 `se` |
| `parar-no-meio` | `node:Break` | `enquanto` |
| `pular-uma-volta` | `node:Continue` | `parar-no-meio` |
| `somar-tudo-de-uma-vez` | `global:sum` | `contar-com-range` |

### Módulo 5 — `listas`

| Aula | Ensina | Presume |
|---|---|---|
| `criar-uma-lista` | `node:List` | M4 `contar-com-range` |
| `pegar-pela-posicao` | `node:Subscript` (e o `IndexError`) | `criar-uma-lista` |
| `posicao-negativa` | cons. — `xs[-1]`; reforça `node:Subscript` | `pegar-pela-posicao`, M2 `subtrair` |
| `acrescentar` | `api:.append` | `criar-uma-lista` |
| `tirar-o-ultimo` | `api:.pop` | `acrescentar` |
| `percorrer-uma-lista` | cons. — `for` sobre lista; reforça `node:For` | `criar-uma-lista`, M4 `contar-com-range` |
| `um-pedaco-da-lista` | `node:Slice` | `pegar-pela-posicao` |
| `esta-na-lista` | `op:compare:in`, `op:compare:not-in` | `criar-uma-lista` |
| `procurar-a-posicao` | `api:.index` | `esta-na-lista` |
| `inserir-e-remover` | `api:.insert`, `api:.remove` | `acrescentar` |
| `ordenar` | `api:.sort`, `global:sorted` (a diferença: um muda a lista, o outro devolve outra) | `criar-uma-lista` |
| `inverter` | `api:.reverse` | `ordenar` |
| `juntar-listas` | `api:.extend` | `acrescentar` |
| `maior-e-menor` | `global:max`, `global:min` | `criar-uma-lista` |
| `com-indice` | `global:enumerate` | `percorrer-uma-lista` |
| `duas-listas-lado-a-lado` | `global:zip` | `com-indice` |

### Módulo 6 — `texto-em-profundidade`

| Aula | Ensina | Presume |
|---|---|---|
| `maiusculas-e-minusculas` | `api:.upper`, `api:.lower` | M1 `texto-como-valor` |
| `tirar-os-espacos` | `api:.strip` | `maiusculas-e-minusculas` |
| `trocar-um-pedaco` | `api:.replace` | `tirar-os-espacos` |
| `comeca-e-termina` | `api:.startswith`, `api:.endswith` | `trocar-um-pedaco` |
| `esta-no-texto` | cons. — `in` sobre texto; reforça `op:compare:in` | M5 `esta-na-lista` |
| `achar-a-posicao` | `api:.find` (e por que devolve `-1` em vez de erro) | `esta-no-texto` |
| `quebrar-em-lista` | `api:.split` | M5 `criar-uma-lista` |
| `juntar-numa-string` | `api:.join` | `quebrar-em-lista` |
| `texto-formatado` | `node:JoinedStr`, `node:FormattedValue` (f-string) | M1 `dar-nome-a-um-valor`, `maiusculas-e-minusculas` |
| `contar-ocorrencias` | `api:.count` | `achar-a-posicao` |
| `so-numeros-ou-so-letras` | `api:.isdigit`, `api:.isalpha` | `comeca-e-termina` |

### Módulo 7 — `dicionarios-e-conjuntos`

| Aula | Ensina | Presume |
|---|---|---|
| `criar-um-dicionario` | `node:Dict` | M5 `criar-uma-lista` |
| `pegar-pela-chave` | cons. — `d["nome"]` e o `KeyError`; reforça `node:Subscript` | `criar-um-dicionario`, M5 `pegar-pela-posicao` |
| `pegar-com-padrao` | `api:.get` | `pegar-pela-chave` |
| `apagar-uma-chave` | `node:Delete` | `pegar-pela-chave` |
| `todas-as-chaves` | `api:.keys` | `criar-um-dicionario` |
| `todos-os-valores` | `api:.values` | `todas-as-chaves` |
| `chave-e-valor-juntos` | `api:.items` | `todos-os-valores` |
| `desempacotar-dois-nomes` | `decl:unpack` | `chave-e-valor-juntos` |
| `percorrer-um-dicionario` | cons. — `for chave, valor in d.items()`; reforça `node:For` | `desempacotar-dois-nomes`, M5 `percorrer-uma-lista` |
| `juntar-dicionarios` | `api:.update` | `criar-um-dicionario` |
| `conjunto-sem-repetidos` | `node:Set`, `global:set` | `criar-um-dicionario` |
| `operacoes-de-conjunto` | `api:.union`, `api:.intersection` | `conjunto-sem-repetidos` |

### Módulo 8 — `funcoes-em-profundidade`

| Aula | Ensina | Presume |
|---|---|---|
| `mais-de-um-parametro` | cons. — dois parâmetros; reforça `node:arg` | M1 `escrever-a-caixa-inteira` |
| `valor-padrao-no-parametro` | `decl:default` | `mais-de-um-parametro` |
| `chamar-pelo-nome` | `node:keyword` (argumento nomeado na chamada) | `valor-padrao-no-parametro` |
| `devolver-mais-de-um-valor` | `node:Tuple` | M7 `desempacotar-dois-nomes` |
| `quantos-argumentos-quiser` | `decl:vararg` (`*args`) | `chamar-pelo-nome` |
| `argumentos-nomeados-quaisquer` | `decl:kwarg` (`**kwargs`) | `quantos-argumentos-quiser` |
| `onde-o-nome-vive` | `decl:global` (escopo local × global, e por que `global` quase nunca é a resposta) | M1 `dar-nome-a-um-valor` |
| `funcao-dentro-de-funcao` | `decl:nonlocal` | `onde-o-nome-vive` |
| `funcao-sem-nome` | `node:Lambda` | `funcao-dentro-de-funcao` |
| `aplicar-em-todos` | `global:map` | `funcao-sem-nome`, M5 `percorrer-uma-lista` |
| `filtrar` | `global:filter` | `aplicar-em-todos` |
| `chamar-a-si-mesma` | cons. — recursão com caso base; reforça `node:Call` | `mais-de-um-parametro`, M3 `se-senao` |

### Módulo 9 — `erros-e-excecoes`

| Aula | Ensina | Presume |
|---|---|---|
| `ler-um-traceback` | cons. — leitura guiada de erro real; reforça `node:Call` | M1 `erro-de-sintaxe-e-erro-de-valor` |
| `levantar-um-erro` | `node:Raise`, `global:ValueError` | `ler-um-traceback`, M8 `mais-de-um-parametro` |
| `tentar-e-tratar` | `node:Try`, `node:ExceptHandler` | `levantar-um-erro` |
| `qual-erro-aconteceu` | `global:TypeError`, `global:KeyError` | `tentar-e-tratar` |
| `guardar-o-erro-num-nome` | `decl:except-as` | `qual-erro-aconteceu` |
| `sempre-no-fim` | `node:Finally` | `guardar-o-erro-num-nome` |
| `conferir-uma-premissa` | `node:Assert` | `tentar-e-tratar` |
| `erro-com-mensagem-util` | cons. — mensagem construída com f-string; reforça `node:Raise` | `levantar-um-erro`, M6 `texto-formatado` |

### Módulo 10 — `modulos-arquivos-e-dados`

| Aula | Ensina | Presume |
|---|---|---|
| `trazer-uma-ferramenta` | `node:Import`, `api:math.sqrt` | M9 `tentar-e-tratar` |
| `trazer-so-um-nome` | `node:ImportFrom` | `trazer-uma-ferramenta` |
| `abrir-um-arquivo` | `node:With`, `global:open` | `trazer-uma-ferramenta` |
| `ler-o-conteudo` | `api:.read` | `abrir-um-arquivo` |
| `ler-linha-por-linha` | cons. — `for linha in arquivo`; reforça `node:For` | `ler-o-conteudo`, M5 `percorrer-uma-lista` |
| `escrever-num-arquivo` | `api:.write` | `abrir-um-arquivo` |
| `dados-em-json` | `api:json.dumps`, `api:json.loads` | `trazer-so-um-nome`, M7 `criar-um-dicionario` |
| `caminhos-com-pathlib` | `api:pathlib.Path` | `trazer-so-um-nome` |
| `datas` | `api:datetime.date` | `trazer-so-um-nome` |

### Módulo 11 — `classes-e-objetos`

| Aula | Ensina | Presume |
|---|---|---|
| `o-que-e-um-objeto` | `node:ClassDef` | M10 `trazer-so-um-nome` |
| `criar-um-objeto` | cons. — `Pessoa()`; reforça `node:Call` | `o-que-e-um-objeto` |
| `o-construtor` | `node:MethodDef`, `node:InitMethod` | `criar-um-objeto`, M8 `mais-de-um-parametro` |
| `guardar-dados-no-objeto` | `node:Attribute` produtivo (`self.nome = nome`) | `o-construtor` |
| `metodos-que-usam-os-dados` | cons. — método que lê `self`; reforça `node:MethodDef` | `guardar-dados-no-objeto` |
| `mostrar-o-objeto` | `node:DunderStr` | `metodos-que-usam-os-dados`, M6 `texto-formatado` |
| `atributo-de-classe` | `node:ClassVar` | `guardar-dados-no-objeto` |
| `herdar` | `node:ClassBase` | `o-que-e-um-objeto` |
| `chamar-a-classe-mae` | `global:super` | `herdar` |
| `metodo-sem-objeto` | `node:Decorator`, `global:staticmethod` | `metodos-que-usam-os-dados` |
| `propriedade-calculada` | `global:property` | `metodo-sem-objeto` |
| `o-proprio-erro` | `global:Exception` (classe própria que herda dele — a herança em si vem de `herdar`) | `herdar`, M9 `levantar-um-erro` |

### Módulo 12 — `tipos-e-anotacoes`

| Aula | Ensina | Presume |
|---|---|---|
| `o-nome-do-tipo` | `global:type` | M11 `o-que-e-um-objeto` |
| `checar-o-tipo` | `global:isinstance` | `o-nome-do-tipo` |
| `anotar-um-nome` | `decl:ann` | `o-nome-do-tipo` |
| `anotar-parametro-e-retorno` | `node:ArgAnnotation`, `node:Returns` | `anotar-um-nome` |
| `pode-faltar` | `node:OptionalAnnotation` (`int \| None`) | `anotar-parametro-e-retorno`, M1 `none-a-ausencia-de-valor` |
| `lista-de-que-tipo` | `node:GenericAnnotation` (`list[int]`) | `anotar-parametro-e-retorno`, M5 `criar-uma-lista` |
| `a-anotacao-nao-confere-nada` | cons. — leitura: Python **não** verifica anotação em execução; conferir tipo é ferramenta separada; reforça `global:isinstance` | `lista-de-que-tipo`, `checar-o-tipo` |

### Módulo 13 — `testes-e-qualidade`

| Aula | Ensina | Presume |
|---|---|---|
| `por-que-testar` | cons. — leitura do próprio arquivo de teste que o aluno vem lendo desde a aula 1; reforça `node:ImportFrom` | M12 `a-anotacao-nao-confere-nada` |
| `escrever-o-primeiro-teste` | `api:unittest.TestCase` produtivo (o aluno escreve a classe de teste) | `por-que-testar`, M11 `herdar` |
| `as-asercoes` | `api:.assertEqual`, `api:.assertTrue` produtivos | `escrever-o-primeiro-teste` |
| `esperar-um-erro` | `api:.assertRaises` | `as-asercoes`, M9 `levantar-um-erro` |
| `preparar-o-cenario` | `api:.setUp` | `as-asercoes` |
| `casos-de-borda` | cons. — lista vazia, zero, texto vazio; reforça `api:.assertEqual` | `as-asercoes`, M5 `criar-uma-lista` |

### Módulo 14 — `python-idiomatico`

| Aula | Ensina | Presume |
|---|---|---|
| `lista-por-compreensao` | `node:ListComp`, `node:comprehension` | M5 `percorrer-uma-lista` |
| `filtrar-na-compreensao` | `node:ComprehensionIf` | `lista-por-compreensao`, M3 `se` |
| `dicionario-por-compreensao` | `node:DictComp` | `filtrar-na-compreensao`, M7 `chave-e-valor-juntos` |
| `conjunto-por-compreensao` | `node:SetComp` | `dicionario-por-compreensao`, M7 `conjunto-sem-repetidos` |
| `gerar-aos-poucos` | `node:GeneratorExp` | `conjunto-por-compreensao` |
| `funcao-que-gera` | `node:Yield` | `gerar-aos-poucos` |
| `espalhar-com-estrela` | `node:Starred` | M8 `quantos-argumentos-quiser` |
| `contexto-proprio` | `node:DunderEnter`, `node:DunderExit` | M11 `metodos-que-usam-os-dados`, M10 `abrir-um-arquivo` |
| `escrever-um-decorador` | cons. — o aluno escreve o próprio decorador (forma nova: aplicar × definir); reforça `node:Decorator` | M11 `metodo-sem-objeto`, M8 `funcao-dentro-de-funcao` |
| `dataclass` | `api:dataclasses.dataclass` | `escrever-um-decorador`, M12 `anotar-um-nome` |
| `atribuir-no-meio-da-condicao` | `decl:walrus` | M3 `se`, M4 `enquanto` |
| `escolher-por-padrao` | `node:Match`, `node:match_case` | M3 `se-senao-se` |
| `contar-e-agrupar` | `api:collections.Counter`, `api:collections.defaultdict` | M7 `criar-um-dicionario`, M10 `trazer-so-um-nome` |
| `medir-antes-de-otimizar` | `api:timeit.timeit` | `contar-e-agrupar` |

## A tensão A6 × I3, e como esta trilha a resolve

A bateria tem duas regras que, lidas ao pé da letra, se contradizem em toda aula de consolidação:

- **A6** (erro) — `atomos(solutionCode) ∩ introduces.productive ≠ ∅`: a aula tem de **puxar** algo.
- **I3** — nenhuma construção é introduzida por duas aulas (unicidade de origem).

Uma aula que só reforça (a aula de recuperação espaçada que A15b/I7 exigem) não pode satisfazer A6
sem re-declarar um átomo já introduzido, o que aparenta violar I3.

**Resolução adotada, e é a mesma que a trilha de 0 violações usa:** I3 fala da **primeira
introdução** (a aula que é `primeiraAulaQueEnsina` para o átomo), não de toda menção. Uma aula de
consolidação declara `role: "consolidation"` e lista em `introduces.productive` o átomo que
**reexercita**; o campo `targetAtom` continua apontando para a aula de origem. `programacao-do-zero`
faz exatamente isso — a aula 2 (`valor-e-instrucao`) declara `avancos.produtivo:
["node:NumericLiteral"]`, o mesmo da aula 1 — e passa no audit com 0 violações.

**Regra que esta trilha se impõe:** no máximo **duas** aulas de consolidação por módulo, sempre
marcadas "cons." na tabela e sempre com um degrau real (forma nova do mesmo átomo: `for` sobre lista
depois de `for` sobre `range`, `Subscript` com chave depois de `Subscript` com posição). Consolidação
sem degrau é aula que não ensina nada, e o gate está certo em reclamar.

**São 24 aulas de consolidação em 154 (16%), e há uma exceção declarada: o módulo 1 tem 4** (as
aulas 2, 8, 12 e 14). A exceção é deliberada e tem precedente medido: `programacao-do-zero` tem 5
aulas de reforço em 14 (36%) e passa com 0 violações. Para quem nunca programou, o reforço **é** o
conteúdo — a aula 2 existe para o aluno digitar um segundo número e perceber que a regra vale sempre,
e a aula 12 existe para ele provocar um erro de propósito. A partir do módulo 2 o teto de duas vale
sem exceção, e a contagem por módulo é: M2 1, M3 1, M4 2, M5 2, M6 1, M7 2, M8 2, M9 2, M10 1,
M11 2, M12 1, M13 2, M14 1.

## A verificação Ensina × Presume

**Feita, e o método foi este.** Para cada uma das 154 aulas montei o conjunto cumulativo
`disponível(N) = semente receptiva ∪ ⋃(Ensina de todas as aulas anteriores)` na ordem em que as
tabelas aparecem, e conferi que **toda construção citada na coluna `Presume` está no conjunto** —
com o slug da aula de origem escrito na própria célula, para a conferência ser reexecutável por
quem ler.

**E é literalmente reexecutável.** Como as tabelas são o dado, a conferência roda sobre este próprio
arquivo. Este script lê as 14 tabelas, monta a ordem global e reprova três coisas — slug repetido
(I12), referência de `Presume` que aponta para uma aula que ainda não veio (lacuna de currículo ou
inversão de ordem) e átomo introduzido por duas aulas fora de consolidação (I3):

```bash
python3 - docs/17-trilha-python.md <<'EOF'
import re, sys
txt = open(sys.argv[1], encoding='utf-8').read()
infence = False; mod = None; aulas = []
for ln in txt.split('\n'):
    if ln.strip().startswith('```'): infence = not infence; continue
    if infence: continue
    m = re.match(r'^#{2,3} Módulo (\d+) — ', ln)
    if m: mod = int(m.group(1)); continue
    if ln.startswith('## ') and 'Módulo' not in ln: mod = None
    if mod and ln.startswith('| ') and not re.match(r'^\|[\s\-:|]+\|$', ln):
        c = [x.strip() for x in re.split(r'(?<!\\)\|', ln.strip().strip('|'))]
        if c[0] in ('Aula', '#'): continue
        if len(c) == 3: aulas.append((mod, c[0].strip('`'), c[1], c[2]))
        elif len(c) == 5: aulas.append((mod, c[1].strip('`'), c[2], c[4]))
vistos = set(); origem = {}; falhas = []
for mod, slug, ensina, presume in aulas:
    if slug in vistos: falhas.append(f'I12 slug repetido: {slug}')
    for r in re.findall(r'`([a-z0-9][a-z0-9\-]{2,})`', presume):
        if '-' in r and r not in vistos: falhas.append(f'LACUNA M{mod}/{slug} presume {r}')
    if 'cons.' not in ensina and '— (re' not in ensina and '— (revisão)' not in ensina \
       and '— (leitura' not in ensina:
        for a in re.findall(r'`((?:node|decl|op|global|api|form|term):[^`]+)`', ensina):
            if a in origem: falhas.append(f'I3 {a}: {origem[a]} e {slug}')
            else: origem[a] = slug
    vistos.add(slug)
print(len(aulas), 'aulas ·', len(origem), 'átomos com origem única ·',
      len(falhas), 'falhas'); [print(' ', f) for f in falhas]
EOF
# 154 aulas · 165 átomos com origem única · 0 falhas
```

**O que a verificação encontrou e o que mudou por causa dela** (cada item é um defeito que estaria
na trilha se a verificação não tivesse sido feita):

1. **`op:compare:in` era cobrado em `texto-em-profundidade` antes de existir.** A primeira aula que
   ensina `in` é `esta-na-lista` (M5). A aula `esta-no-texto` (M6) passou a declarar `Presume: M5
   esta-na-lista` e virou consolidação em vez de introdução.
2. **`node:Import` estava em `modulos-e-biblioteca-padrao` (um módulo 12 na primeira versão), mas
   `json` e `pathlib` eram usados no módulo de arquivos, antes.** Lacuna de currículo clássica.
   Corrigido movendo `trazer-uma-ferramenta`/`trazer-so-um-nome` para o topo do M10 e fundindo o
   módulo de módulos com o de arquivos: **usar um módulo vem antes de escrever um**.
3. **`decl:unpack` era pressuposto por `percorrer-um-dicionario` e por
   `devolver-mais-de-um-valor` sem aula de origem.** `a, b = 1, 2` tem a mesma AST de `x = 1`
   (medido), então "o aluno já sabe atribuir" não cobre. Criada a aula `desempacotar-dois-nomes`
   (M7), antes das duas.
4. **`global:str` era pressuposto por `juntar-textos` sem aula.** Sem ele o aluno não consegue
   concatenar número com texto e só encontra o `TypeError`. A aula passou a **introduzir**
   `global:str`, e a concatenação virou o termo e a máquina nocional da aula.
5. **A aula de `elif` cobrava uma distinção que a AST não faz.** Sem a chave sintética
   `node:Elif` (distinguida por `col_offset`), `se-senao-se` introduziria zero construção nova →
   violação A6. Entrou na tabela das doze distinções.
6. **A aula de texto introduziria zero construção nova**, porque `7` e `"oi"` são o mesmo
   `ast.Constant`. Mesma causa, mesma correção: `node:StrLiteral` refinado pelo adaptador.
7. **Recuo cobrado antes de ensinado.** Na primeira versão a aula de `return` vinha antes da de
   parâmetro, e o aluno escrevia uma linha inteira sem nenhuma aula ter falado de recuo. A ordem
   final põe `parametro-e-argumento` (lacuna dentro de uma linha já indentada) antes de
   `return-e-o-recuo` (primeira linha inteira escrita pelo aluno).
8. **`print` estava na aula 2 na primeira versão** — o que é o costume dos materiais de Python e é
   exatamente o que produz o modo de falha nº 1. Movido para a aula 9, depois de `return`, e
   reescrito como contraste.
9. **`node:ClassBase` tinha duas origens (I3)** — `herdar` e `o-proprio-erro`, as duas no módulo 11.
   Foi o script acima que pegou. A aula `o-proprio-erro` passou a introduzir o que de fato é novo
   nela (`global:Exception`) e a herança ficou onde já estava.
10. **`node:Decorator` tinha duas origens (I3)** — `metodo-sem-objeto` (M11, o aluno **aplica**
    `@staticmethod`) e `escrever-um-decorador` (M14, o aluno **define** o seu). Aplicar e definir são
    formas diferentes do mesmo átomo, e I11 diz que forma nova é evento de currículo — mas evento de
    currículo com aula própria, não com segunda origem. A aula do M14 virou consolidação declarada,
    com o degrau explícito (aplicar × definir).

**O que a verificação NÃO prova.** Ela prova ausência de lacuna de currículo e ausência de
inversão de ordem no nível de construção. Ela **não** prova o teto de composição (§3.7: saber `if`
e saber função não é saber `if` dentro de função) — isso é responsabilidade das aulas marcadas
`role: "integration"` que a fase F3 da engine deriva, e do gate A9. Também não prova o teto de
tempo de 120 s por desafio, que só é mensurável depois da solução de referência existir.

## Desafios de módulo

No fim de cada um dos 14 módulos existe um **desafio de MÓDULO**
(`modules/<slug>/challenges/<slug>/challenge.json`, declarado em `module.json` como `challenge`):

- **Multi-arquivo** — `files[]` com 2–3 arquivos (ex.: `pedidos.py`, `relatorio.py`) que se
  importam entre si; o editor mostra uma aba por arquivo e o submit envia o código de todos;
- **Elaborado** — statement longo com cenário do mundo real (2–4 mil caracteres) e 4–6 testes;
- **Autoral** — não é gerado por LLM: o botão "Gerar novo desafio" não aparece quando o target é
  `module`;
- **Restrição de orçamento igual à das aulas** — o desafio de módulo pode compor livremente o que o
  módulo ensinou, mas **não pode introduzir construção nova**. Um desafio de módulo que precisa de
  algo não ensinado é a prova de que falta uma aula.
- Os aninhamentos que ficaram de fora das tabelas por não serem átomos (laço dentro de laço, lista
  de listas, dicionário de listas) são o material natural desses desafios: composição é o que eles
  testam.

## UX

- **Teoria determinística** — a aula apresenta a teoria direto do `lesson.json` (markdown, seção
  por seção): sem LLM e sem loading. O LLM é usado só para dúvidas (`answer`) e para gerar novo
  desafio.
- **Falha rápida sem chave** — sem chave de LLM o `answer` devolve erro estruturado
  (`TUTOR_UNAVAILABLE`); o fluxo nunca trava em spinner.
- **Checks por teste** — o veredito mostra a lista de checks individuais (✓/✗ por teste, com nome)
  e a razão parcial "N de M testes passaram". **Em Python o nome do check é a docstring do método
  de teste**, não o nome do método: medido, `unittest -v` imprime a linha do id e, quando existe
  docstring, a primeira linha dela logo abaixo, antes do `... ok`:

  ```
  test_devolve_7 (tests.test_resposta.TestResposta.test_devolve_7)
  a caixa devolve o número 7 ... ok
  ```

  Logo: **todo método de teste desta trilha carrega uma docstring de uma linha em pt-BR**, e ela é
  o rótulo mostrado ao aluno. Sem docstring o aluno leria `test_devolve_7`, que é ruído.
- **Erro de recuo tem tratamento próprio.** `IndentationError` e `TabError` acontecem na
  IMPORTAÇÃO, então o `unittest` reporta um erro de coleta e nenhum teste roda. O veredito precisa
  dizer "seu arquivo não chegou a rodar: o recuo está errado na linha N", nunca "0 de 3 testes
  passaram" — que é verdadeiro e inútil.

## Teste de proficiência (`proficiency.json`)

Cobre os conceitos centrais de todos os módulos: nome e valor, função com parâmetro e retorno,
decisão, repetição, lista, dicionário, erro tratado, arquivo e classe. Enunciado em linguagem
simples que **não pressupõe programação** (o aluno pode fazer o teste antes da primeira aula).
Dificuldade 5, carência da 1ª estrela 120 s — pressão de tempo degrada acurácia. Quem passa
destrava a trilha inteira.

## Regras para os desafios de aula (`challenge.json`)

- `language: 'python'`; `programmingLanguage: 'python'`, `runtime: 'cpython-3.14'`,
  `harnessLanguage: 'python'` no `track.json`;
- layout obrigatório: `solucao.py` na raiz, `tests/__init__.py` (vazio, e **sem ele nada roda**) e
  `tests/test_<slug>.py`;
- o teste importa com `from solucao import <funcao>` e usa `unittest.TestCase`;
- o teste **falha** com o starter e **passa** com a solução; `expectedTestCount` = nº de testes;
  2–4 testes por desafio de aula;
- a função do desafio é derivada do slug (kebab → snake_case: `dobro-do-numero` → `dobro_do_numero`)
  — **snake_case, não camelCase**: em Python o nome camelCase é erro de estilo, e ensinar estilo
  errado desde a aula 1 é dívida que o aluno paga depois;
- todo método de teste tem docstring de uma linha em pt-BR (é o rótulo do check);
- **cenário `error` só existe se o orçamento permitir** (A11): exigir "entrada inválida que deve
  falhar" antes da aula `levantar-um-erro` (M9) e da aula `esperar-um-erro` (M13) é precisamente a
  causa-raiz que produziu o desafio impossível da aula 1 da trilha legada. Antes de M9, os cenários
  possíveis são `example` e `boundary`;
- `outputChannel: 'retorno'` em todas as aulas, exceto as que ensinam `print`, onde é `'impressao'`
  e o teste captura a saída;
- statement em markdown pt-BR, linguagem simples, terminando com o lembrete de ler o enunciado e
  clicar em "Começar";
- **proibições sempre**, em qualquer aula, starter, teoria ou solução: `eval`, `exec`, `compile`,
  `__import__`, `getattr`/`setattr` com nome não-literal, `globals()`, `locals()`.

## Fora de escopo (declarado)

O que esta trilha **não** ensina, e onde a pessoa deve procurar:

- **Ambientes virtuais, `pip` e pacotes de terceiros.** A trilha inteira roda só com o
  interpretador e a stdlib — é o que torna o desafio executável sem instalação e o gate
  determinístico. `venv`/`pip` são conteúdo de um módulo de ferramentas, não de linguagem.
- **`async`/`await` e concorrência.** `AsyncFunctionDef` e `Await` são nós próprios e caberiam no
  vocabulário, mas assincronismo em Python exige um laço de eventos observável, o que o harness de
  desafio (uma função, uma asserção) não oferece sem infraestrutura nova.
- **Web, banco de dados, ciência de dados, `numpy`/`pandas`.** Todos dependem de pacote de
  terceiros.
- **Verificação estática de tipos (`mypy`/`pyright`).** O módulo 12 ensina a **escrever** anotação
  e ensina explicitamente que Python **não a confere em execução**; conferir tipo com ferramenta é
  o assunto da trilha de TypeScript ([`18-trilha-typescript.md`](18-trilha-typescript.md)), onde o
  conferidor de tipos é parte do produto.
- **Metaprogramação** (`metaclass`, `__getattr__`, descritores). São exatamente as construções que
  tornam a análise estática indecidível — proibi-las não é escolha de escopo, é condição de
  existência do gate.
