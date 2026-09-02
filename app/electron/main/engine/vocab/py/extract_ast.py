#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""app/electron/main/engine/vocab/py/extract_ast.py — A PORTA 1 DE PYTHON.

É o `ts.createSourceFile` do adaptador de Python: recebe o FONTE em stdin,
devolve em stdout UM objeto JSON com a árvore normalizada e a resolução de
escopo. Invocado por `lang/python.ts` com `spawnSync`, sempre assim:

    python3 -I -S <este arquivo>          # fonte no STDIN, JSON no STDOUT

POR QUE STDIN E NUNCA `-c`
--------------------------
`python3 -c "<fonte>"` exigiria escapar aspas, barras e quebras de linha do
código do aluno — e, pior, DESTRUIRIA a fidelidade de `col_offset`: qualquer
reescrita do fonte muda as colunas, e o relatório da engine é
`arquivo:linha:coluna`. O fonte entra byte a byte como o adaptador o tem.

POR QUE `-I -S`
---------------
`-I` (isolated) implica `-E` (ignora as variáveis `PYTHON*` do ambiente) e
`-s` (sem site-packages do usuário) e tira o diretório do script do
`sys.path`; `-S` não importa o `site`. Juntos garantem que NENHUM
`sitecustomize.py`, `.pth` ou pacote do usuário participe da ANÁLISE — o
parser é um artefato de build determinístico, não um programa do aluno.
(O RUNNER dos testes NÃO pode usar `-I`: ele precisa do diretório corrente no
`sys.path` para achar `solucao.py`. Ver `lang/python.ts`, testCommand.)

A ARMADILHA CENTRAL: `col_offset` É EM BYTES UTF-8
-------------------------------------------------
`LangNode` (`lang/registry.ts`) exige offsets ABSOLUTOS `start`/`end` sobre a
STRING do fonte. O CPython dá `lineno`/`col_offset`, e `col_offset` é o offset
em **bytes UTF-8** dentro da linha, não em caracteres. Medido nesta máquina:

    x = "ação"      -> Constant col_offset 4, end_col_offset 12
                       (12 BYTES; em caracteres a linha termina em 10)

Tratar `col_offset` como caractere desloca todo snippet com acento — e a
trilha é em pt-BR. Por isso este módulo converte byte→caractere decodificando
o prefixo da linha (`char_col`), e a tabela de início de linha
(`_line_starts`) é construída com quebra de linha UNIVERSAL (`\\n`, `\\r\\n` e
`\\r` sozinho — medido: o tokenizer do CPython conta `a=1\\rb=2` como duas
linhas), nunca com `str.splitlines()`, que também quebra em `\\v`, `\\f`,
`\\x85`, `\\u2028` e `\\u2029` — caracteres que o tokenizer do Python NÃO
trata como fim de linha e que, dentro de uma string literal, deslocariam tudo.

O QUE ESTE ARQUIVO EMITE ALÉM DA ÁRVORE CRUA
--------------------------------------------
1. `symtable` no MESMO subprocesso (é o que põe Python em Tier A e não em
   Tier B): `declared`/`imported`/`free`, com `free` calculado POR TABELA —
   um `len = 3` dentro de uma função não apaga o `global:len` de outra função,
   ao contrário da resolução PLANA do lado JS (`extract.ts:38-43`, que se
   autodocumenta como cega a shadowing).
2. As CHAVES SINTÉTICAS de `docs/17-trilha-python.md` §"O que o `ast`
   esconde" — as doze distinções que o `ast` colapsa e que são eventos de
   currículo. Elas saem como NÓS SINTÉTICOS filhos (ou, no caso de
   `Constant`, como refinamento do próprio `type`), para que cada chave
   continue tendo linha e coluna próprias no relatório.

O que este arquivo NÃO faz: não decide o que é permitido (é `budget.ts`), não
lê trilha, não executa o código do aluno e não importa nada fora da stdlib.
"""

from __future__ import annotations

import ast
import builtins
import json
import platform
import sys
import symtable

# Os ~150 nomes embutidos, LIDOS DA MÁQUINA e nunca digitados: uma lista à mão
# erra nos dois sentidos (esquecer faz o gate deixar passar; inventar faz o
# gate reprovar código correto). `dir(builtins)` é a fonte que não mente.
BUILTIN_NAMES: frozenset[str] = frozenset(dir(builtins))

# Os dunders que TODO módulo tem e que `dir(builtins)` não cobre inteiro.
# `if __name__ == "__main__":` é a última linha de todo `test_*.py` da trilha
# (`__name__` já está em `dir(builtins)`); `__file__` e `__builtins__` não
# estão, e sem eles uma referência a `__file__` sairia como nome livre sem
# eixo — silêncio, que é o modo de falha que esta engine existe para eliminar.
MODULE_DUNDERS: frozenset[str] = frozenset({
    "__annotations__",
    "__builtins__",
    "__dict__",
    "__file__",
    "__path__",
})

# O universo do eixo `global:` — é ele que `atoms.python.json` esgota.
_BUILTINS: frozenset[str] = BUILTIN_NAMES | MODULE_DUNDERS

# ---------------------------------------------------------------------------
# Tabela de offsets de linha (byte→caractere→offset absoluto)
# ---------------------------------------------------------------------------

def _line_starts(src: str) -> list[int]:
    """Offset absoluto (em CARACTERES) do início de cada linha, 0-based.

    `starts[0] == 0`; `starts[i]` é o começo da linha `i+1` do AST (que é
    1-based). Quebra universal, na mesma semântica do tokenizer.
    """
    starts = [0]
    i = 0
    n = len(src)
    while i < n:
        ch = src[i]
        if ch == "\r":
            i += 2 if i + 1 < n and src[i + 1] == "\n" else 1
            starts.append(i)
        elif ch == "\n":
            i += 1
            starts.append(i)
        else:
            i += 1
    return starts


class _Offsets:
    """Converte (lineno, col_offset em BYTES) em offset absoluto de caractere."""

    def __init__(self, src: str) -> None:
        self.src = src
        self.starts = _line_starts(src)
        self.total = len(src)
        # cache de (linha 1-based) -> bytes da linha, só das linhas tocadas.
        self._line_bytes: dict[int, bytes] = {}

    def _line_text(self, lineno: int) -> str:
        idx = lineno - 1
        if idx < 0 or idx >= len(self.starts):
            return ""
        ini = self.starts[idx]
        fim = self.starts[idx + 1] if idx + 1 < len(self.starts) else self.total
        return self.src[ini:fim]

    def char_col(self, lineno: int, byte_col: int) -> int:
        """Coluna em CARACTERES a partir da coluna em BYTES UTF-8."""
        if byte_col <= 0:
            return 0
        raw = self._line_bytes.get(lineno)
        if raw is None:
            raw = self._line_text(lineno).encode("utf-8")
            self._line_bytes[lineno] = raw
        if byte_col >= len(raw):
            # Fim de linha (ou além): a coluna é o tamanho em caracteres.
            return len(raw.decode("utf-8", "replace"))
        # `errors="replace"` porque um corte no meio de um caractere multibyte
        # só acontece se o CPython mentir; nesse caso o certo é degradar a
        # coluna, nunca derrubar a extração inteira.
        return len(raw[:byte_col].decode("utf-8", "replace"))

    def absolute(self, lineno: int, byte_col: int) -> int:
        idx = lineno - 1
        if idx < 0:
            return 0
        if idx >= len(self.starts):
            return self.total
        return min(self.total, self.starts[idx] + self.char_col(lineno, byte_col))


# ---------------------------------------------------------------------------
# Operadores — o eixo `op:` (docs/17-trilha-python.md, tabela "Vocabulário")
# ---------------------------------------------------------------------------
#
# Cinco famílias, e a separação de `compare` é DECISÃO DE CURRÍCULO, não
# estética: em Python `==`, `<`, `in` e `is` são `ast.Compare`, não
# `ast.BinOp`. Misturar as famílias faria o orçamento de uma aula de igualdade
# liberar aritmética de graça.

_OP_BINARY = {
    "Add": "+", "Sub": "-", "Mult": "*", "Div": "/", "FloorDiv": "//",
    "Mod": "%", "Pow": "**", "LShift": "<<", "RShift": ">>",
    "BitOr": "|", "BitXor": "^", "BitAnd": "&", "MatMult": "@",
}
_OP_COMPARE = {
    "Eq": "==", "NotEq": "!=", "Lt": "<", "LtE": "<=", "Gt": ">", "GtE": ">=",
    "Is": "is", "IsNot": "is not", "In": "in", "NotIn": "not in",
}
_OP_BOOL = {"And": "and", "Or": "or"}
_OP_UNARY = {"Not": "not", "USub": "-", "UAdd": "+", "Invert": "~"}


def _op_text(node: ast.AST | None) -> str | None:
    if node is None:
        return None
    nome = type(node).__name__
    for tabela in (_OP_BINARY, _OP_COMPARE, _OP_BOOL, _OP_UNARY):
        if nome in tabela:
            return tabela[nome]
    return None


# Classes do `ast` que são SÓ operador — consumidas pelo eixo `op:` e nunca
# emitidas como `node:` (seriam ruído: `node:Add` não é aula nenhuma).
_OPERATOR_BASES = (ast.operator, ast.cmpop, ast.boolop, ast.unaryop)


# ---------------------------------------------------------------------------
# Literais — a distinção #1 de docs/17 (`7` e `"oi"` são o MESMO ast.Constant)
# ---------------------------------------------------------------------------
#
# Refinamento por `type(node.value)`, e NUNCA um `node:Constant` cru: sem isto
# a aula de texto introduziria ZERO construção nova (violação A6).
# `bool` ANTES de `int` porque `True` é `int` em Python (`isinstance(True, int)`
# é `True`) — a ordem do dicionário aqui é irrelevante; a checagem é explícita.

_LITERAL_NODE = {
    "bool": "BoolLiteral",
    "int": "IntLiteral",
    "float": "FloatLiteral",
    "complex": "ComplexLiteral",
    "str": "StrLiteral",
    "bytes": "BytesLiteral",
    "NoneType": "NoneLiteral",
    "ellipsis": "EllipsisLiteral",
}


def _literal_kind(value: object) -> tuple[str, str]:
    """(nome do tipo do valor, nome do nó sintético) para um `Constant`."""
    if value is None:
        return "NoneType", "NoneLiteral"
    if value is Ellipsis:
        return "ellipsis", "EllipsisLiteral"
    if isinstance(value, bool):  # ANTES de int — bool é subclasse de int
        return "bool", "BoolLiteral"
    nome = type(value).__name__
    return nome, _LITERAL_NODE.get(nome, "Constant")


def _json_scalar(value: object) -> object:
    """Valor de campo escalar seguro para JSON (o resto vira `repr`)."""
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        # NaN/Infinity não são JSON válido (`JSON.parse` recusa) — viram repr.
        return value if value == value and abs(value) != float("inf") else repr(value)
    return repr(value)


# ---------------------------------------------------------------------------
# symtable — a resolução de escopo que põe Python em Tier A
# ---------------------------------------------------------------------------


# Nomes que o COMPILADOR cria e que nenhum humano escreveu. Não são nome de
# ninguém, e deixá-los vazar para `free` faria o eixo `global:` reportar uma
# construção que não está no fonte. Os que começam com ponto (`.0`, `.format`)
# caem na regra geral; estes têm cara de dunder e precisam de lista.
#   `__conditional_annotations__` — CPython 3.14, PEP 649/749 (anotação dentro
#   de `if`/`try`); aparece no escopo de MÓDULO como global implícito.
#   `__classdict__`/`__classcell__`/`__class__` — células de classe (o
#   `super()` sem argumento e o `__annotate__` de método); chegam como
#   `is_free()` e já são filtrados por isso, mas ficam listados para que a
#   próxima versão do CPython não os reintroduza em silêncio.
_NOMES_DO_COMPILADOR: frozenset[str] = frozenset({
    "__conditional_annotations__",
    "__classdict__",
    "__classcell__",
    "__class__",
})


def _tabelas(top: symtable.SymbolTable) -> list[symtable.SymbolTable]:
    saida: list[symtable.SymbolTable] = []
    pilha = [top]
    while pilha:
        t = pilha.pop()
        saida.append(t)
        pilha.extend(t.get_children())
    return saida


def _ligado(sym: symtable.Symbol) -> bool:
    """O símbolo LIGA um nome nesta tabela (atribui, importa ou é parâmetro)?"""
    return bool(sym.is_assigned() or sym.is_imported() or sym.is_parameter())


def _resolver_escopos(top: symtable.SymbolTable) -> dict[str, list[str]]:
    """`declared`/`imported`/`free` a partir do `symtable`.

    `free` é POR TABELA (é aqui que Python fica melhor que o lado JS): um nome
    é livre quando alguma tabela o referencia como GLOBAL sem ligá-lo E ele não
    é ligado na tabela do MÓDULO. Consequência medida:

        def f():
            len = 3          # sombra local — não apaga o global de g()
            return len
        def g():
            return len([1])  # AQUI `len` continua sendo global:len

    A resolução PLANA do lado JS perderia o `global:len` de `g` por causa do
    `len` de `f`. A por-tabela não perde. Já um `len = 3` no NÍVEL DE MÓDULO
    apaga o global de todo o arquivo — e apaga certo, porque em Python ele
    realmente passa a ser o nome do módulo.

    As tabelas `annotation` do PEP 649 (CPython 3.14 cria uma `__annotate__`
    por função anotada) ENTRAM na conta: `def f(x: int)` referencia `int` de
    verdade, e deixar a tabela de fora tiraria `int` de `free`. O parâmetro
    sintético `.format` que elas carregam é descartado pela regra geral de
    ignorar nomes começados por ponto (os nomes implícitos do compilador).
    """
    tabelas = _tabelas(top)

    ligados_no_modulo = {s.get_name() for s in top.get_symbols() if _ligado(s)}

    declared: set[str] = set()
    imported: set[str] = set()
    free: set[str] = set()

    for tabela in tabelas:
        eh_modulo = tabela is top
        for sym in tabela.get_symbols():
            nome = sym.get_name()
            if nome.startswith(".") or nome in _NOMES_DO_COMPILADOR:
                continue  # nomes implícitos do compilador (.0, .format, dunders)
            if sym.is_imported():
                declared.add(nome)
                imported.add(nome)
                continue
            if _ligado(sym):
                declared.add(nome)
                continue
            if sym.is_global() and sym.is_referenced():
                if eh_modulo or nome not in ligados_no_modulo:
                    free.add(nome)

    return {
        "declared": sorted(declared),
        "imported": sorted(imported),
        "free": sorted(free),
    }


# ---------------------------------------------------------------------------
# O emissor da árvore normalizada
# ---------------------------------------------------------------------------


class _Emissor:
    def __init__(self, src: str, offsets: _Offsets, top: symtable.SymbolTable,
                 escopos: dict[str, list[str]]) -> None:
        self.src = src
        self.off = offsets
        self.declared = set(escopos["declared"])
        self.imported = set(escopos["imported"])
        self.builtins = _BUILTINS
        self.top = top
        self.ligados_no_modulo = {s.get_name() for s in top.get_symbols() if _ligado(s)}
        # A PILHA DE ESCOPOS — é ela que faz `global:len` ser POR ESCOPO.
        # Sem ela, um `len = 3` dentro de UMA função apagaria o `global:len`
        # de todas as outras, que é exatamente a cegueira que `extract.ts:38-43`
        # declara no lado JavaScript.
        self.pilha: list[symtable.SymbolTable] = [top]

    # ---- escopo por nó --------------------------------------------------

    def _tabela_de(self, nome: str, lineno: int) -> symtable.SymbolTable | None:
        """A sub-tabela do symtable que corresponde a este `def`/`class`/`lambda`.

        Casada por (nome, linha) — o par é único no CPython. Tabelas do tipo
        `annotation` (PEP 649) nunca casam: elas se chamam `__annotate__`.
        Quando não há casamento (comprehensions embutidas pelo PEP 709 no 3.12+
        não criam tabela), a resposta é `None` e a travessia SEGUE no escopo
        atual — degradar para o escopo de fora é conservador e correto, porque
        uma comprehension embutida realmente compartilha os nomes de fora.
        """
        atual = self.pilha[-1]
        for filha in atual.get_children():
            if filha.get_type() == "annotation":
                continue
            if filha.get_name() == nome and filha.get_lineno() == lineno:
                return filha
        return None

    def _livre_aqui(self, nome: str) -> bool:
        """O nome é uma referência LIVRE (candidata a global) NESTE escopo?"""
        if nome in _NOMES_DO_COMPILADOR:
            return False
        tabela = self.pilha[-1]
        try:
            sym = tabela.lookup(nome)
        except KeyError:
            return True  # não consta na tabela: só pode vir de fora
        if _ligado(sym) or sym.is_free():
            return False  # ligado aqui, ou fechado sobre uma função de fora
        if not sym.is_global():
            return False
        if tabela is self.top:
            return True
        return nome not in self.ligados_no_modulo

    # ---- posição --------------------------------------------------------

    def _pos(self, node: ast.AST, herdada: dict[str, int]) -> dict[str, int]:
        """Posição do nó, ou a HERDADA do pai quando o `ast` não a fornece.

        Nós sem posição existem e são muitos (`ast.Load`, `ast.arguments`, os
        operadores). `LangNode` exige `line`/`column`/`start`/`end` sempre —
        herdar do pai é a única resposta honesta: a construção realmente
        acontece ali.
        """
        lineno = getattr(node, "lineno", None)
        if lineno is None:
            return herdada
        col = getattr(node, "col_offset", 0) or 0
        end_line = getattr(node, "end_lineno", None) or lineno
        end_col = getattr(node, "end_col_offset", None)
        if end_col is None:
            end_col = col
        start = self.off.absolute(lineno, col)
        end = self.off.absolute(end_line, end_col)
        if end < start:
            end = start
        return {
            "line": lineno,
            "column": self.off.char_col(lineno, col) + 1,
            "start": start,
            "end": end,
        }

    def _no(self, tipo: str, pos: dict[str, int], attrs: dict[str, object],
            children: list[dict] | None = None, sintetico: bool = False) -> dict:
        return {
            "type": tipo,
            "line": pos["line"],
            "column": pos["column"],
            "start": pos["start"],
            "end": pos["end"],
            "text": self.src[pos["start"]:pos["end"]],
            "attributes": {k: str(v) for k, v in attrs.items() if v is not None},
            "children": children if children is not None else [],
            "synthetic": sintetico,
        }

    def _marcador(self, tipo: str, pos: dict[str, int], **attrs: object) -> dict:
        """Nó SINTÉTICO: uma das doze distinções que o `ast` colapsa."""
        return self._no(tipo, pos, attrs, [], sintetico=True)

    # ---- api: -----------------------------------------------------------

    def _cadeia_atributo(self, node: ast.Attribute) -> str | None:
        """`math.sqrt` / `.append` — a chave do eixo `api:`.

        Regra de `docs/17-trilha-python.md`: raiz IMPORTADA ou BUILTIN vira
        caminho completo (`api:math.sqrt`, `api:str.join`); receptor que é nome
        LOCAL vira só o método (`api:.append`) — porque o tipo do receptor não
        é decidível sem inferência de tipos, e prometer que é seria mentir.
        """
        partes: list[str] = []
        atual: ast.expr = node
        while isinstance(atual, ast.Attribute):
            partes.append(atual.attr)
            atual = atual.value
        partes.reverse()
        if isinstance(atual, ast.Name):
            raiz = atual.id
            if raiz in self.imported or (raiz in self.builtins and self._livre_aqui(raiz)):
                return ".".join([raiz, *partes])
            return "." + partes[-1]
        if isinstance(atual, ast.Constant):
            # `"a,b".split(",")` — receptor literal: o tipo É decidível.
            tipo, _ = _literal_kind(atual.value)
            return ".".join([tipo, *partes])
        return "." + partes[-1]

    # ---- as doze distinções ---------------------------------------------

    def _sinteticos(self, node: ast.AST, pos: dict[str, int],
                    dentro_de_classe: bool, em_anotacao: bool) -> list[dict]:
        """Os nós sintéticos que ESTE nó gera (docs/17, tabela das doze)."""
        out: list[dict] = []
        t = type(node)

        # #9 decorador — não existe nó; vive em `decorator_list`.
        for deco in getattr(node, "decorator_list", []) or []:
            out.append(self._marcador("Decorator", self._pos(deco, pos)))

        if isinstance(node, ast.If):
            orelse = node.orelse
            # #2 elif × else:+if — AST idêntica; só a coluna difere (4 × 8).
            eh_elif = (
                len(orelse) == 1
                and isinstance(orelse[0], ast.If)
                and getattr(orelse[0], "col_offset", -1) == getattr(node, "col_offset", -2)
            )
            if eh_elif:
                out.append(self._marcador("Elif", self._pos(orelse[0], pos)))
            elif orelse:
                # #3 `if` COM `else` × `if` sem `else`.
                out.append(self._marcador("IfElse", self._pos(orelse[0], pos)))

        # #4 `for`/`while` com `else` — a construção que quase ninguém conhece.
        elif isinstance(node, ast.For) or isinstance(node, ast.AsyncFor):
            if node.orelse:
                out.append(self._marcador("ForElse", self._pos(node.orelse[0], pos)))
        elif isinstance(node, ast.While):
            if node.orelse:
                out.append(self._marcador("WhileElse", self._pos(node.orelse[0], pos)))

        # #5 `try` com `finally`.
        elif isinstance(node, ast.Try) or t.__name__ == "TryStar":
            if getattr(node, "finalbody", None):
                out.append(self._marcador("Finally", self._pos(node.finalbody[0], pos)))

        # #6 `except ValueError as e`.
        elif isinstance(node, ast.ExceptHandler):
            if node.name:
                out.append(self._marcador("Binding", pos, declKind="except-as", name=node.name))

        # #7 e #8 — `*args`, `**kwargs` e parâmetro com valor padrão.
        elif isinstance(node, ast.arguments):
            if node.vararg is not None:
                out.append(self._marcador("Binding", self._pos(node.vararg, pos),
                                          declKind="vararg", name=node.vararg.arg))
            if node.kwarg is not None:
                out.append(self._marcador("Binding", self._pos(node.kwarg, pos),
                                          declKind="kwarg", name=node.kwarg.arg))
            padroes = list(node.defaults) + [d for d in node.kw_defaults if d is not None]
            if padroes:
                out.append(self._marcador("Binding", self._pos(padroes[0], pos),
                                          declKind="default"))

        # #10 `a, b = 1, 2` — mesma AST de `x = 1` no eixo de nós.
        elif isinstance(node, ast.Assign):
            desempacota = any(isinstance(alvo, (ast.Tuple, ast.List)) for alvo in node.targets)
            out.append(self._marcador("Binding", pos,
                                      declKind="unpack" if desempacota else "assign"))
        elif isinstance(node, ast.AnnAssign):
            out.append(self._marcador("Binding", pos, declKind="ann"))
        elif isinstance(node, ast.AugAssign):
            out.append(self._marcador("Binding", pos, declKind="aug"))
        elif isinstance(node, ast.NamedExpr):
            out.append(self._marcador("Binding", pos, declKind="walrus"))
        elif isinstance(node, ast.Global):
            out.append(self._marcador("Binding", pos, declKind="global"))
        elif isinstance(node, ast.Nonlocal):
            out.append(self._marcador("Binding", pos, declKind="nonlocal"))

        # #12 `int | None` em anotação × `|` bit a bit.
        elif isinstance(node, ast.BinOp):
            if em_anotacao and isinstance(node.op, ast.BitOr):
                out.append(self._marcador("OptionalAnnotation", pos))

        # #1 já é feito no `type` do próprio nó (nunca um `node:Constant` cru).

        # #11 método × função (e os dunders que a trilha ensina).
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and dentro_de_classe:
            out.append(self._marcador("MethodDef", pos, name=node.name))
            if node.name == "__init__":
                out.append(self._marcador("InitMethod", pos))
            elif node.name == "__str__":
                out.append(self._marcador("DunderStr", pos))
            if node.name in ("__getattr__", "__getattribute__"):
                # PROIBIÇÃO GLOBAL: atributo dinâmico faz o gate mentir.
                out.append(self._marcador("DynamicAttributeHook", pos, name=node.name))

        # `op:compare:` — um marcador por comparador (`a < b < c` tem dois).
        if isinstance(node, ast.Compare):
            for op in node.ops:
                texto = _op_text(op)
                if texto is not None:
                    out.append(self._marcador("Op", pos, operator=texto,
                                              operatorFamily="compare"))

        # eixo `global:` — referência LIVRE a um builtin, com o symtable por trás.
        # `_livre_aqui` é POR ESCOPO: `len = 3` numa função não apaga o
        # `global:len` de outra.
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            if node.id in self.builtins and self._livre_aqui(node.id):
                out.append(self._marcador("GlobalRef", pos, globalName=node.id))

        # eixo `api:` — cadeia de atributo e import.
        if isinstance(node, ast.Attribute):
            caminho = self._cadeia_atributo(node)
            if caminho:
                out.append(self._marcador("ApiRef", pos, apiPath=caminho))
        elif isinstance(node, ast.Import):
            for alias in node.names:
                out.append(self._marcador("ApiRef", pos, apiPath=alias.name))
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            for alias in node.names:
                caminho = f"{base}.{alias.name}" if base else alias.name
                out.append(self._marcador("ApiRef", pos, apiPath=caminho))

        # PROIBIÇÃO GLOBAL: `getattr(o, nome_variavel)` — nome não literal.
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            alvo = node.func.id
            if alvo in ("getattr", "setattr", "delattr") and len(node.args) >= 2:
                arg = node.args[1]
                literal = isinstance(arg, ast.Constant) and isinstance(arg.value, str)
                if not literal:
                    out.append(self._marcador("ComputedNonLiteralAttribute", pos, name=alvo))

        return out

    # ---- a travessia ----------------------------------------------------

    def visitar(self, node: ast.AST, herdada: dict[str, int],
                dentro_de_classe: bool = False, em_anotacao: bool = False,
                campo_pai: str | None = None) -> dict:
        pos = self._pos(node, herdada)
        tipo = type(node).__name__
        attrs: dict[str, object] = {}
        # De QUAL campo do pai este nó veio. Sem essa etiqueta a árvore
        # normalizada perde a identidade dos campos (`bases` × `body` de um
        # `ClassDef`, `test` × `body` de um `If`) — e é exatamente ela que
        # `countDeclared` usa para exigir que o método `test*` esteja no CORPO
        # de uma classe que herda de `unittest.TestCase`, e não em qualquer
        # lugar. Nenhum nó do `ast` tem campo chamado `field`: não há colisão.
        if campo_pai is not None:
            attrs["field"] = campo_pai

        # #1 — o literal NUNCA sai como `node:Constant` cru.
        if isinstance(node, ast.Constant):
            tipo_valor, tipo = _literal_kind(node.value)
            attrs["valueType"] = tipo_valor
            attrs["value"] = repr(node.value)
        elif isinstance(node, ast.BinOp):
            texto = _op_text(node.op)
            if texto is not None:
                attrs["operator"] = texto
                attrs["operatorFamily"] = "binary"
        elif isinstance(node, ast.BoolOp):
            texto = _op_text(node.op)
            if texto is not None:
                attrs["operator"] = texto
                attrs["operatorFamily"] = "bool"
        elif isinstance(node, ast.UnaryOp):
            texto = _op_text(node.op)
            if texto is not None:
                attrs["operator"] = texto
                attrs["operatorFamily"] = "unary"
        elif isinstance(node, ast.AugAssign):
            texto = _op_text(node.op)
            if texto is not None:
                attrs["operator"] = texto
                attrs["operatorFamily"] = "aug"

        # Os sintéticos do PRÓPRIO nó saem no escopo de FORA (é onde o `def` e
        # os decoradores são avaliados); os filhos, no escopo de DENTRO.
        sinteticos = self._sinteticos(node, pos, dentro_de_classe, em_anotacao)

        empilhou = False
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            tabela = self._tabela_de(node.name, node.lineno)
            if tabela is not None:
                self.pilha.append(tabela)
                empilhou = True
        elif isinstance(node, ast.Lambda):
            tabela = self._tabela_de("lambda", node.lineno)
            if tabela is not None:
                self.pilha.append(tabela)
                empilhou = True
        elif isinstance(node, ast.GeneratorExp):
            tabela = self._tabela_de("genexpr", node.lineno)
            if tabela is not None:
                self.pilha.append(tabela)
                empilhou = True

        filhos: list[dict] = []
        eh_classe = isinstance(node, ast.ClassDef)
        try:
            for campo in node._fields:
                valor = getattr(node, campo, None)
                if isinstance(valor, ast.AST):
                    if isinstance(valor, _OPERATOR_BASES):
                        continue  # consumido pelo eixo `op:` — `node:Add` é ruído
                    anotacao = em_anotacao or campo in ("annotation", "returns")
                    filhos.append(self.visitar(valor, pos, eh_classe, anotacao, campo))
                elif isinstance(valor, list):
                    anotacao = em_anotacao or campo in ("annotation", "returns")
                    for item in valor:
                        if isinstance(item, ast.AST):
                            if isinstance(item, _OPERATOR_BASES):
                                continue
                            filhos.append(self.visitar(item, pos, eh_classe, anotacao, campo))
                        elif item is not None:
                            attrs.setdefault(campo, repr(item))
                elif valor is not None and campo not in attrs:
                    attrs[campo] = _json_scalar(valor)
        finally:
            if empilhou:
                self.pilha.pop()

        filhos.extend(sinteticos)
        return self._no(tipo, pos, attrs, filhos)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def analisar(src: str, nome_modulo: str = "<trecho>") -> dict:
    """O contrato de saída — o MESMO `ParseResult` que o lado JS produz."""
    try:
        arvore = ast.parse(src, filename=nome_modulo)
    except SyntaxError as err:
        # `SyntaxError.offset` é coluna 1-based em CARACTERES (medido:
        # `x = "ação" +* 2` -> offset 13, e o `*` é o 13º CARACTERE).
        # Não confundir com `col_offset` do AST, que é em BYTES.
        return {
            "ok": False,
            "error": {
                "code": "PARSE_ERROR",
                "message": err.msg or "erro de sintaxe",
                "line": err.lineno if err.lineno and err.lineno > 0 else 1,
                "column": err.offset if err.offset and err.offset > 0 else 1,
            },
        }
    except ValueError as err:  # NUL byte, recursão do parser, etc.
        return {
            "ok": False,
            "error": {"code": "PARSE_ERROR", "message": str(err), "line": 1, "column": 1},
        }

    try:
        top = symtable.symtable(src, nome_modulo, "exec")
        escopos = _resolver_escopos(top)
    except (SyntaxError, ValueError) as err:  # o symtable é mais estrito que o ast
        return {
            "ok": False,
            "error": {
                "code": "PARSE_ERROR",
                "message": str(getattr(err, "msg", err)),
                "line": getattr(err, "lineno", None) or 1,
                "column": getattr(err, "offset", None) or 1,
            },
        }

    offsets = _Offsets(src)
    emissor = _Emissor(src, offsets, top, escopos)
    raiz_pos = {"line": 1, "column": 1, "start": 0, "end": len(src)}
    raiz = emissor.visitar(arvore, raiz_pos)
    # O `Module` do `ast` não tem posição: cobre o arquivo inteiro.
    raiz.update(raiz_pos)
    raiz["text"] = src

    return {
        "ok": True,
        "pythonVersion": platform.python_version(),
        "implementation": platform.python_implementation(),
        "root": raiz,
        "scopes": escopos,
    }


def main() -> int:
    dados = sys.stdin.buffer.read()
    try:
        src = dados.decode("utf-8")
    except UnicodeDecodeError as err:
        resultado = {
            "ok": False,
            "error": {
                "code": "PARSE_ERROR",
                "message": f"fonte não é UTF-8 válido: {err}",
                "line": 1,
                "column": 1,
            },
        }
    else:
        nome = sys.argv[1] if len(sys.argv) > 1 else "<trecho>"
        resultado = analisar(src, nome)
    saida = json.dumps(resultado, ensure_ascii=False, allow_nan=False, sort_keys=False)
    sys.stdout.write(saida)
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
