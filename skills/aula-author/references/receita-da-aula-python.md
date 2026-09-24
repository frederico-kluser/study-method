# Receita da aula — o capítulo PYTHON

A parte da receita que depende do adaptador Python. O que vale nas três línguas está em
`receita-da-aula.md` (§0 layout · §1 `lesson.json` · §2 `challenge.json` · §3 fases do canal ·
§4 a regra do par e `introduces.derived` · §5 o gate das demonstrações). Abra este arquivo quando
`track.json.programmingLanguage` for `python` — e só então.

Trilha viva: `app/resources/tracks/python-iniciante` (112 aulas; `npm run engine -- barra
python-iniciante` → **0 erros · 30 avisos A22 · 112 aulas · exit 0**, medido em 2026-09-22).
É o curso de REFERÊNCIA: os tetos da barra são o que ele cumpre sem exceção.
Contrato de conteúdo: `docs/17-trilha-python.md`.

## 1. Inventário e vocabulário — onde está e como conferir

`app/electron/main/engine/vocab/atoms.python.json` — **632 chaves** (node 118 · op 42 · decl 11 ·
global 164 · api 297):

```bash
cd app && python3 -c "import json; d=json.load(open('electron/main/engine/vocab/atoms.python.json')); print(d['total'], {k: len(v) for k, v in d['axes'].items()})"
# → 632 {'node': 118, 'op': 42, 'decl': 11, 'global': 164, 'api': 297}
```

Eixos `node:`/`op:`/`decl:`/`global:` são **FECHADOS** (pertença estrita); `api:` é aberto só no
formato; `term:` é não-vocabulário. Tags de cerca aceitas na teoria: `py`, `python`, `python3`
(`PY_THEORY_FENCE_TAGS`). Glossário de chave por chave: `glossario-atomos.md`.

As chaves sintéticas (o `ast` colapsa distinções que são evento de currículo; o adaptador refina) e
as **nove chaves inventadas que NÃO existem** (`node:ChainedCompare`, `node:ClassBase`,
`node:ClassVar`, `node:ArgAnnotation`, `node:Returns`, `node:GenericAnnotation`,
`node:ComprehensionIf`, `node:DunderEnter`, `node:DunderExit`) estão em `glossario-atomos.md` §3.
Nunca invente chave: rode o extrator (`receita-da-aula.md` §5.1, ou o extrator puro abaixo).

```bash
# o extrator PURO de Python (roda sem node_modules) — devolve o DUMP do ast em JSON, com os
# atributos de onde as chaves saem (`declKind`, `operatorFamily`):
printf 'x += 1\n' | python3 -I -S app/electron/main/engine/vocab/py/extract_ast.py
# a lista de CHAVES do mesmo trecho sai pelo caminho da engine (receita-da-aula.md §5.1) e foi
# medida em 2026-09-22:
#   decl:aug · node:AugAssign · node:IntLiteral · node:Name · node:Store · op:aug:+
# → `node:Name`/`node:Store` são estruturais; as quatro restantes são UM gesto só (a regra do par)
```

## 2. Axioma de entrada e semente receptiva do harness

Medido: **estruturais 9 · semente 35 · axioma 39 chaves**.

```bash
cd app && npx tsx -e 'import {harnessReceptiveSeed, structuralAlwaysAllowed} from "./electron/main/engine/atomKeys"; const s = harnessReceptiveSeed("python"), e = structuralAlwaysAllowed("python"); console.log(s.length, e.length, new Set([...s, ...e]).size)'
# → 35 9 39
```

- **Axioma PRODUTIVO da trilha: `node:Call` + `node:StrLiteral`, e só.** Alargar é proibido — é o
  botão que faz o gate perdoar em silêncio o que a trilha nunca ensinou. Medido:
  `print("oi")` → `global:print` (a aula) + `node:Call` + `node:StrLiteral` (axioma). No disco a
  aula 1 declara os três em `productive` **com os dois últimos em `derived`** (é a forma medida da
  regra do par — `receita-da-aula.md` §4).
- **Estruturais sempre permitidos** (`PYTHON_STRUCTURAL_ALWAYS_ALLOWED`, `atomKeys.ts:545`):
  `node:Module` · `node:Name` · `node:Load` · `node:Store` · `node:Del` · `node:arguments` ·
  `node:Expr` · `node:alias` · `node:keyword`. Consequência de currículo: **`f(a=1)` (argumento
  nomeado) não introduz átomo nenhum** e é obrigatoriamente consolidação.
- **Semente receptiva do harness** (`PYTHON_HARNESS_RECEPTIVE_SEED`, `atomKeys.ts:490`) — o que o
  aluno LÊ em todo desafio e não escreve em nenhum:

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
# fase VALOR — as asserções; o `from solucao import X` NÃO emite api::
api:.assertFalse  api:.assertNotEqual
```

Ela entra no receptivo da aula 1 e **nunca** no produtivo.

## 3. A forma do arquivo de teste, por fase

O que o adaptador GERA por desafio (nunca escreva no repositório): `solucao.py` na raiz,
`tests/test_solucao.py`, e **`tests/__init__.py`, que é o exit-guard** (`PY_PACKAGE_MARKER`,
`lang/python.ts:639`) — sem ele o CPython recusa a descoberta com `ImportError: Start directory is
not importable` e o desafio "falha" sem ter rodado nada. Runner:
`python3 -B -m unittest discover -s tests -t . -p 'test_*.py' -v` — exit **0** passou · **1** falhou
· **5** nada rodou.

### FASE SAÍDA (`outputChannel: "impressao"`) — o arquivo é `frozenRegion` inteira

Captura de `stdout` com `runpy.run_path` (roda o arquivo **do zero a cada chamada** — o `import` só
executa na primeira vez e o segundo teste leria saída vazia) + `io.StringIO` +
`contextlib.redirect_stdout`. O arquivo do aluno é um **script**, sem função.

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

- **Não existe** `if __name__ == "__main__": unittest.main()`: o runner é `unittest discover`, que
  **nunca** executa esse bloco; deixá-lo faria o aluno ler `if`, `==` e `__name__` de graça.
- **`runpy.run_path` e não `importlib.import_module`**: `api:importlib.import_module` é proibição
  global — importar por nome montado em runtime faz o gate mentir.

### A VIRADA (`outputChannel: "ambos"`) — TRÊS asserts

O mesmo desafio mede o que a caixa **devolve**, o que o programa **imprime**, e que **chamar a
caixa sozinha não imprime nada**.

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

### FASE VALOR (`outputChannel: "retorno"`) — `from solucao import X`

```python
import unittest

from solucao import dobro


class TestDobro(unittest.TestCase):
    def test_dobro_de_2(self):
        """o dobro de 2 e 4"""
        self.assertEqual(dobro(2), 4)
```

**Medido:** `from solucao import dobro` **não emite** `api:` nenhuma (o módulo do aluno não é API).
O `runpy` também serve à fase VALOR quando o teste quer o arquivo inteiro
(`rodar()["ordem_crescente"]`, ex.: `ordenar`).

### Regras do arquivo de teste (todas medidas)

- Função do desafio: **kebab → snake_case** (`dobro-do-numero` → `dobro_do_numero`; nunca
  camelCase). **Todo método `test_*` carrega docstring de uma linha em pt-BR** — é o rótulo que o
  `unittest -v` imprime ao aluno.
- **Antes da aula `levantar-um-erro` (M9)** os cenários possíveis são `example` e `boundary`;
  cenário `error` só existe se o orçamento já tem a construção de levantar erro (A11).
- **Antes da aula `abrir-um-arquivo` (M11)**, teste que espera erro usa a **forma de chamada**
  `self.assertRaises(ValueError, dividir, 1, 0)` — **nunca** o gerenciador de contexto (`with`
  emite `node:With` + `node:withitem`, que A3 reprovaria no orçamento de entrada).
- Em M20/M21, toda função enviada a processo é **função de módulo**, nunca `lambda` nem closure (o
  `forkserver` referencia o alvo por importação; `lambda` levantaria `PicklingError`).

## 4. Proibições globais — em qualquer superfície

`PY_FORBIDDEN_INVARIANTS` (`lang/python.ts`, 10 chaves): `global:eval` · `global:exec` ·
`global:compile` · `global:__import__` · `global:globals` · `global:locals` · `global:vars` ·
`api:importlib.import_module` · `node:ComputedNonLiteralAttribute` · `node:DynamicAttributeHook`.
Em statement, starter, teoria, solução e teste. Só em prosa com crase, nunca em bloco cercado.

## 5. Armadilhas conhecidas do adaptador (cada uma já custou caro)

| Armadilha | O que acontece | O que fazer |
|---|---|---|
| `for a, b in ...` | emite `node:Tuple`, **não** `decl:unpack` | enumerate/zip ensinam com `for par in ...` + `par[0]`/`par[1]`; o desempacotamento é aula própria |
| receptor literal | `"-".join(...)` → `api:str.join`, chave DIFERENTE de `api:.join` | demonstre método com receptor-nome (`separador.join(itens)`) |
| `op:compare:is not` / `not in` | `ATOM_KEY_RE` (`atomKeys.ts:120`) recusa chave com espaço — some do `introduces` em silêncio e vira lacuna no audit | ensine o operador base (`is`, `in`) como produtivo; a negação só em prosa com crase |
| consolidação sem degrau | aula que não introduz nada reprova em A20 | consolidação **re-declara** o `targetAtom` em `introduces.productive` (medido: `mais-de-uma-linha → ['global:print']`) |
| `node:Constant` cru | não existe: o adaptador refina em `IntLiteral`/`StrLiteral`/… | use a chave refinada que o extrator emitiu |
| `difficulty` | nenhum gate o lê | preencha pela rampa do grafo, sem esperar veredito |

## 6. Tetos medidos desta trilha

| Métrica | Valor medido no `python-iniciante` | Comando |
|---|---|---|
| erros da barra A17–A23 | 0 | `npm run engine -- barra python-iniciante` |
| avisos A22 (duas formas) | 30 | idem |
| aulas | 112 | idem |
| aulas que declaram `introduces.derived` | 5 | `grep -rl '"derived"' app/resources/tracks/python-iniciante --include=lesson.json \| wc -l` |
| maior seção montada | ≤ 560 chars (teto 588) | `npx tsx --test tests/lessonTypewriterReadingSpeed.test.ts` → 15 pass · 0 fail |
