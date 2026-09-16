#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""app/electron/main/engine/vocab/c/extract_ast.py — A PORTA 1 DE C.

É o `ts.createSourceFile` do adaptador de C: recebe o JSON do
`clang -Xclang -ast-dump=json` no STDIN e o caminho do FONTE em argv[1],
devolve em stdout UM objeto JSON com a árvore normalizada `LangNode`
(mesmo contrato de `vocab/py/extract_ast.py` — o `ParseResult` do §6).

Invocado por `lang/c.ts`, sempre assim:

    python3 <este arquivo> <fonte.c>          # JSON do clang no STDIN, JSON no STDOUT

POR QUE UM ARQUIVO TEMP E NUNCA STDIN
-------------------------------------
O `-ast-dump=json` do clang não lê fonte da entrada padrão: o fonte tem de ir
a ARQUIVO (medido nesta máquina, Apple clang 17 — stdin produz "no such file").
Quem grava o temp é o adaptador (`lang/c.ts`); este módulo SÓ lê.

AS QUATRO ARMADILHAS DO JSON DO CLANG (todas medidas, Apple clang 17)
---------------------------------------------------------------------
1. `loc` é INCOMPLETO por nós: o dump omite `line`/`file` quando já imprimiu
   o mesmo valor (o LastLoc do dumper). POR ISSO linha e coluna NUNCA saem
   do `loc` do clang — derivam do OFFSET (`range.begin.offset`) contra a
   tabela de inícios de linha do FONTE, aqui.
2. O FIM É O ÚLTIMO TOKEN, NÃO UM-PAST-THE-END: `range.end.offset` aponta
   para o INÍCIO do último token do nó e o COMPRIMENTO dele vai no `tokLen`
   (medido: em `p.x = 3;` o fim do `BinaryOperator` é o offset do `3`). Fim
   do nó = `range.end.offset + end.tokLen` SEMPRE — que cobre também o caso
   particular do token único (`42`, `"texto"`, `x`), em que
   `end.offset == begin.offset` e o `tokLen` é o comprimento do token inteiro.
   Ignorar o `tokLen` do fim truncava o último token de todo nó multi-token.
3. Nós de HEADER entram no dump misturados com os do arquivo principal (o
   `#include <stdio.h>` expande centenas de decls). O filtro é ESTRUTURAL e
   confiável: todo nó vindo de outro arquivo carrega `includedFrom` no
   `loc`/`range.begin`; nós do arquivo principal NUNCA carregam.
4. Nós IMPLÍCIOS (`isImplicit: true` — typedefs builtin como `__int128_t`,
   decls sintetizadas pelo clang como o `printf` de chamada implícita) não
   são código de ninguém: filtrados.

E a conversão byte→caractere é a MESMA armadilha do Python (`col_offset` do
CPython é em BYTES): o offset do clang é em BYTES UTF-8 dentro do buffer, e a
trilha é em pt-BR — um `printf("ação")` deslocaria o snippet todo se o byte
fosse tratado como caractere.

O QUE ESTE ARQUIVO EMITE ALÉM DA ÁRVORE CRUA
--------------------------------------------
1. Nós TRANSPARENTES (`ImplicitCastExpr`, `ParenExpr`, `CaseStmt`, `DefaultStmt`, …)
   são DERRUBADOS mas os FILHOS SOBEM (a conversão devolve uma LISTA, não um
   nó opcional — sem isso o `DeclRefExpr` envolto em todo `ImplicitCastExpr`
   de C desapareceria, e com ele metade das chaves). Só os tipos do enum
   FECHADO de `cInventory()` (`lang/c.ts`) chegam à árvore.
2. Nós PORTADORES sintéticos (`synthetic: true`) — as distinções que o clang
   colapsa e que são eventos de currículo: `ApiRef` (chamada a função de
   biblioteca → `api:printf`), `GlobalRef` (referência livre a stdin/stdout/
   stderr → `global:stdout`), `IncludeDirective` (a diretiva `#include` não
   existe como nó no AST do clang — lida do FONTE) e `IndirectCall`
   (chamada por ponteiro de função → a proibição global de C).
3. Escopos (plano, como o lado JavaScript — limite documentado em
   `lang/c.ts`): `declared`/`imported`/`free`.

O que este arquivo NÃO faz: não decide o que é permitido (é `budget.ts`), não
lê trilha, não executa o fonte e não importa nada fora da stdlib.
"""

from __future__ import annotations

import bisect
import json
import re
import sys

# ---------------------------------------------------------------------------
# A tabela de inícios de linha e a conversão byte→caractere (a mesma do py)
# ---------------------------------------------------------------------------


def _line_starts(src: str) -> list[int]:
    """Offset absoluto (em CARACTERES) do início de cada linha, 0-based.

    Quebra universal (`\\n`, `\\r\\n`, `\\r` sozinho), a mesma semântica do
    tokenizer do CPython e do `vocab/py/extract_ast.py` — nunca
    `str.splitlines()`, que quebra também em `\\v`, `\\f`, `\\x85` e
    `\\u2028`, caracteres que NÃO separam linha em C.
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
    """Converte offset ABSOLUTO (em BYTES) em linha/coluna/índice de caractere."""

    def __init__(self, src: str) -> None:
        self.src = src
        self.starts = _line_starts(src)
        # inícios de linha em BYTES (os offsets do clang são em bytes)
        self._byte_starts = [len(src[:s].encode("utf-8")) for s in self.starts]
        self.total = len(src)

    def line_of_byte(self, byte_offset: int) -> int:
        """Linha 1-based de um offset em bytes (`bisect`, não laço)."""
        return bisect.bisect_right(self._byte_starts, byte_offset)

    def _chars_da_linha(self, linha: int, byte_count: int) -> int:
        """Quantos CARACTERES os primeiros `byte_count` BYTES da linha ocupam.

        O fatiamento de `str` em Python é por CARACTERE — fatiar a linha por
        `byte_count` ignoraria o multibyte (`ação` tem 4 chars e 6 bytes) e
        deslocaria coluna e fim de todo nó depois de um acento. `errors=
        "replace"` porque um corte no meio de um caractere só acontece se o
        clang mentir; nesse caso degrada a coluna, nunca derruba a extração.
        """
        ini_char = self.starts[linha - 1]
        fim_char = self.starts[linha] if linha < len(self.starts) else len(self.src)
        linha_str = self.src[ini_char:fim_char]
        raw = linha_str.encode("utf-8")
        if byte_count >= len(raw):
            return len(linha_str)
        return len(raw[:byte_count].decode("utf-8", "replace"))

    def char_col(self, byte_offset: int) -> int:
        """Coluna 1-based em CARACTERES a partir do offset em BYTES."""
        linha = self.line_of_byte(byte_offset)
        ini = self._byte_starts[linha - 1]
        return self._chars_da_linha(linha, max(0, byte_offset - ini)) + 1

    def absolute(self, byte_offset: int) -> int:
        """Offset em BYTES → índice na STRING Python (por caractere).

        Os offsets do clang contam BYTES UTF-8 do buffer; `LangNode.start`/
        `end` fatiam a string do fonte. A conversão desce até o início da
        linha em bytes e sobe em caracteres dentro dela.
        """
        linha = self.line_of_byte(byte_offset)
        ini = self._byte_starts[linha - 1]
        return self.starts[linha - 1] + self._chars_da_linha(linha, max(0, byte_offset - ini))


# ---------------------------------------------------------------------------
# A tabela de mapeamento clang → inventário fechado (`cInventory()` de c.ts)
# ---------------------------------------------------------------------------

# Kinds do clang que EMERGEM na árvore normalizada. Tudo o que não está aqui
# é TRANSPARENTE: o nó desaparece e os filhos sobem (o `LangNode.type` é
# contrato fechado — nós fora do inventário não podem existir na árvore).
_EMITIDOS = frozenset({
    # declarações (o eixo `decl:`)
    "FunctionDecl",
    "VarDecl",
    "ParmVarDecl",
    # tipos compostos e aliases (onda 3 — docs/20 §8.2 P1/P3)
    "RecordDecl",     # `struct Ponto { … }` — MEDIDO: NÃO existe kind `StructDecl`
                      # no dump JSON do clang (Apple clang 17); a definição de
                      # struct é `RecordDecl` com `tagUsed: "struct"`. O guard
                      # em `_converter` DERRUBA o `tagUsed: "union"` — o
                      # inventário v1 nomeia SÓ o struct (union/`EnumDecl`
                      # ficam fora do escopo e transparentes).
    "TypedefDecl",    # `typedef struct Ponto P;` — os TypedefDecls BUILTIN
                      # (`__int128_t`, medidos) são `isImplicit: true` e sem
                      # posição no fonte: já morrem nos dois filtros de baixo.
    # controle de fluxo
    "IfStmt",
    "WhileStmt",
    "DoStmt",
    "ForStmt",
    "ReturnStmt",
    "BreakStmt",
    "ContinueStmt",
    "SwitchStmt",     # `switch (x) { … }` (onda 3 — P5). `CaseStmt` e
                      # `DefaultStmt` ficam TRANSPARENTES: os filhos (o valor
                      # do case, envolto em `ConstantExpr`, e o corpo) sobem
                      # para dentro do SwitchStmt — "switch/case" é UM evento
                      # de currículo no docs/20 §8.
    # blocos e declarações dentro de corpo
    "CompoundStmt",
    "DeclStmt",
    # operadores (o eixo `op:`)
    "BinaryOperator",
    "CompoundAssignOperator",
    "UnaryOperator",
    "UnaryExprOrTypeTraitExpr",  # `sizeof` — o único trait do curso iniciante
    "ConditionalOperator",       # `a ? b : c` (onda 3 — P4): saiu de
                                 # `_TRANSPARENTES` — ternário é construção
                                 # nomeada no docs/20 §8.
    # acesso a membro e cast explícito (onda 3 — P2/P6)
    "MemberExpr",     # `s.x` e `p->m` — UM kind só (MEDIDO: o clang separa os
                      # dois num único `MemberExpr` com `isArrow`); a
                      # distinção dot/arrow vai no ATRIBUTO `memberAccess`,
                      # porque o docs/20 §8 nomeia "acesso a campo" UMA vez.
    "CStyleCastExpr", # `(int)3.7` (onda 3 — P6): saiu de `_TRANSPARENTES` —
                      # cast é construção nomeada no docs/20 §8; o tipo-alvo
                      # vai no ATRIBUTO `castType`.
    # chamadas e referências
    "CallExpr",
    "DeclRefExpr",
    # literais
    "IntegerLiteral",
    "FloatingLiteral",
    "CharacterLiteral",
    "StringLiteral",
    # indexação e inicialização de vetor
    "ArraySubscriptExpr",
    "InitListExpr",
})

# Kinds que são SÓ ruído de expressão — derrubados com os filhos SUBINDO.
# `ImplicitCastExpr` é o mais comum: envolve TODA expressão em C (a conversão
# int→double etc.) e não ensina nada (o precedente é `_OPERATOR_BASES` do py).
# `CStyleCastExpr` e `ConditionalOperator` SAÍRAM daqui na onda 3 (P6/P4 do
# docs/20 §8.2): cast explícito e ternário são construções nomeadas.
_TRANSPARENTES = frozenset({
    "ImplicitCastExpr",
    "ParenExpr",
    "CompoundLiteralExpr",
    "ImplicitValueInitExpr",
    "AtomicExpr",
    "OffsetOfExpr",
    "ShuffleVectorExpr",
    "ConvertVectorExpr",
    "VAArgExpr",
    "GenericSelectionExpr",
    "BinaryConditionalOperator",
    "ChooseExpr",
    "StmtExpr",
    # os rótulos internos do switch (P5): `case N:` é `CaseStmt` (o valor vem
    # envolto em `ConstantExpr`, MEDIDO) e `default:` é `DefaultStmt` — kind
    # PRÓPRIO, medido no Apple clang 17. Os dois são transparentes: o valor e
    # o corpo sobem para dentro do `SwitchStmt` emitido.
    "CaseStmt",
    "DefaultStmt",
})

# A família de cada opcode — `=` e os compostos (`+=`, `-=`, `*=`, `/=`, …) são
# o eixo `op:assign:` (o mesmo partido do lado JS: "metade da didática está no
# ATRIBUTO"); `&&`/`||` curto-circuito são aula própria (`op:logical:`);
# `++`/`--` são `op:update:`, como o postfix do lado JavaScript.
_OPS_ATRIBUICAO = frozenset({
    "=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=",
})
_OPS_LOGICOS = frozenset({"&&", "||"})
_OPS_UPDATE = frozenset({"++", "--"})


def _familia_do_operador(kind: str, opcode: str) -> str:
    if kind == "CompoundAssignOperator" or opcode in _OPS_ATRIBUICAO:
        return "assign"
    if opcode in _OPS_LOGICOS:
        return "logical"
    if opcode in _OPS_UPDATE:
        return "update"
    return "binary" if kind == "BinaryOperator" else "unary"


# Os GLOBAIS de runtime de C (`cGlobals()` de c.ts). A detecção é pelo TEXTO
# do `DeclRefExpr` — NÃO pelo `referencedDecl.name`: no macOS `stdout` é macro
# para `__stdoutp`, e o nome resolvido mudaria por plataforma; o que o aluno
# ESCREVE é `stdout`.
_GLOBAIS_RUNTIME = frozenset({"stdin", "stdout", "stderr"})

# A diretiva `#include` — não existe nó no AST do clang (o preprocessor a
# consome antes do Sema). Lida do FONTE, linha a linha (âncora na margem).
_RE_INCLUDE = re.compile(r"^[ \t]*#[ \t]*include[ \t]*([<\"][^>\"]+[>\"])", re.MULTILINE)

# Teto do texto de um atributo — init gigante não entra no relatório.
_ATRIBUTO_MAX = 200


def _attr_text(valor: object) -> str:
    texto = valor if isinstance(valor, str) else json.dumps(valor, ensure_ascii=False)
    return texto if len(texto) <= _ATRIBUTO_MAX else texto[:_ATRIBUTO_MAX] + "…"


def _no(tipo: str, pos: dict, attrs: dict, filhos: list, sintetico: bool,
        texto: str) -> dict:
    return {
        "type": tipo,
        "line": pos["line"],
        "column": pos["column"],
        "start": pos["start"],
        "end": pos["end"],
        "text": texto,
        "attributes": attrs,
        "children": filhos,
        "synthetic": sintetico,
    }


def _offset_inicio(nativo: dict) -> tuple[int, int] | None:
    """(offset em bytes, tokLen) do INÍCIO do nó, na primeira fonte que houver.

    A ordem é a do dump: `range.begin.offset`, depois
    `range.begin.expansionLoc.offset`, depois `loc.offset`, depois
    `loc.expansionLoc.offset`.
    """
    begin = nativo.get("range", {}).get("begin", {})
    if isinstance(begin.get("offset"), int):
        return begin["offset"], begin.get("tokLen") or 0
    if isinstance(begin.get("expansionLoc"), dict) and isinstance(begin["expansionLoc"].get("offset"), int):
        return begin["expansionLoc"]["offset"], begin["expansionLoc"].get("tokLen") or 0
    loc = nativo.get("loc", {})
    if isinstance(loc.get("offset"), int):
        return loc["offset"], loc.get("tokLen") or 0
    if isinstance(loc.get("expansionLoc"), dict) and isinstance(loc["expansionLoc"].get("offset"), int):
        return loc["expansionLoc"]["offset"], loc["expansionLoc"].get("tokLen") or 0
    return None


def _offset_fim(nativo: dict) -> tuple[int, int] | None:
    """(offset em bytes, tokLen) do ÚLTIMO TOKEN do nó, ou None quando não há.

    MEDIDO (Apple clang 17): o `range.end.offset` do dump JSON aponta para o
    INÍCIO do último token do nó — NÃO para um-past-the-end (em `p.x = 3;` o
    fim do `BinaryOperator` é o offset do `3`, com o comprimento dele no
    `tokLen`). Quem soma o `tokLen` é `_pos_do_no`.
    """
    end = nativo.get("range", {}).get("end", {})
    if isinstance(end.get("offset"), int):
        return end["offset"], end.get("tokLen") or 0
    if isinstance(end.get("expansionLoc"), dict) and isinstance(end["expansionLoc"].get("offset"), int):
        return end["expansionLoc"]["offset"], end["expansionLoc"].get("tokLen") or 0
    return None


def _pos_do_no(nativo: dict, off: _Offsets) -> dict | None:
    """Posição do nó a partir dos OFFSETS do clang (nunca do `loc.line`).

    `range.begin.offset` é o início. O FIM é `range.end.offset` + o `tokLen`
    do ÚLTIMO token — MEDIDO (Apple clang 17), o `range.end.offset` aponta
    para o INÍCIO do último token do nó, nunca um-past-the-end; ignorar o
    `tokLen` truncava o último token de TODO nó multi-token (`p.x = 3;` saía
    como `p.x = `, `{1, 2` sem o `}`). A armadilha 2 do cabeçalho — a
    expressão de UM token (`42`, `"texto"`, `x`), em que o clang reporta
    `end == begin` e o comprimento só existe no `tokLen` — é o CASO
    PARTICULAR em que fim == início: a mesma soma cobre os dois. E uma
    EXPANSÃO DE MACRO (`SM_TEST(slug)`) tem loc
    `{spellingLoc, expansionLoc}` — a posição HONESTA é a da EXPANSÃO, no
    arquivo do autor (a do spelling vive no `<scratch space>` do
    preprocessor e não tem endereço no fonte).
    Nós sem offset nenhum (a raiz, os builtin implícitos) devolvem None.
    """
    inicio_e_tok = _offset_inicio(nativo)
    if inicio_e_tok is None:
        return None
    inicio, tok = inicio_e_tok
    fim_e_tok = _offset_fim(nativo)
    if fim_e_tok is None:
        fim = inicio + int(tok)
    else:
        fim = fim_e_tok[0] + fim_e_tok[1]
    return {
        "line": off.line_of_byte(inicio),
        "column": off.char_col(inicio),
        "start": off.absolute(inicio),
        "end": off.absolute(fim),
    }


def _e_expansao_de_macro(nativo: dict) -> bool:
    """O nó nasce da EXPANSÃO de uma macro (o corpo dela mora em outro lugar)?

    MEDIDO (Apple clang 17): o `NULL` do fonte é `#define NULL ((void*)0)` no
    header — o `CStyleCastExpr` da expansão carrega `range.begin` com
    `expansionLoc` (e o corpo no `spellingLoc`). Um nó ESCRITO pelo autor tem
    `range.begin.offset` PLANO. O mesmo sinal estrutural que `_vem_de_header`
    usa, lido do lado da expansão.
    """
    begin = nativo.get("range", {}).get("begin", {})
    if isinstance(begin.get("expansionLoc"), dict):
        return True
    loc = nativo.get("loc", {})
    return isinstance(loc.get("expansionLoc"), dict)


def _vem_de_header(nativo: dict) -> bool:
    """Nó vindo de `#include` de OUTRO arquivo (armadilha 3 do cabeçalho).

    Também DENTRO de `expansionLoc`: uma macro DEFINIDA num header e
    expandida no arquivo principal carrega o `includedFrom` dentro do
    `expansionLoc` — e o que veio de header é header, expanda onde expandir.
    """
    loc = nativo.get("loc", {})
    if "includedFrom" in loc:
        return True
    if isinstance(loc.get("expansionLoc"), dict) and "includedFrom" in loc["expansionLoc"]:
        return True
    begin = nativo.get("range", {}).get("begin", {})
    if "includedFrom" in begin:
        return True
    return isinstance(begin.get("expansionLoc"), dict) and "includedFrom" in begin["expansionLoc"]


def _attrs_do_no(nativo: dict) -> dict:
    """Atributos que PARTICIPAM DA CHAVE (`constructKey` de c.ts consome).

    - `name`      — declarações e referências (`FunctionDecl`, `VarDecl`,
                    `DeclRefExpr`).
    - `refKind`   — o kind do `referencedDecl` no `DeclRefExpr`: é ele que
                    separa chamada a FUNÇÃO (`FunctionDecl`) de chamada por
                    PONTEIRO (`VarDecl`) — a segunda é `IndirectCall`.
    - `declKind`  — o eixo `decl:` (o MESMO contrato do adaptador Python:
                    `attrs.declKind` → `decl:<kind>`).
    - `operator` + `operatorFamily` — o eixo `op:`.
    - `valueType` — o tipo do literal (`int`, `double`, `char`, `string`).
                    A CHAVE do literal é o `node:<Kind>`
                    (IntegerLiteral/FloatingLiteral/…), que o clang JÁ
                    separa — não existe eixo `lit:` neste vocabulário (a
                    decisão está documentada em `lang/c.ts`).
    - `tagUsed`   — o `RecordDecl` só é EVENTO DE CURRÍCULO como struct; o
                    atributo registra `"struct"` (o guard de `_converter`
                    derruba o `tagUsed: "union"` antes de emitir).
    - `memberAccess` — `"dot"` (`s.x`) ou `"arrow"` (`p->m`), do `isArrow`
                    MEDIDO do `MemberExpr`. NÃO participa da chave (o
                    docs/20 §8 nomeia "acesso a campo" uma vez só) — é
                    metadata do relatório, como `resolvedName`.
    - `castType`  — o tipo-alvo do `CStyleCastExpr` (`(int)3.7` → `"int"`),
                    do `type.qualType`. Metadata do relatório; a chave é
                    `node:CStyleCastExpr`.
    """
    kind = nativo.get("kind", "")
    attrs: dict[str, str] = {}

    nome = nativo.get("name")
    if isinstance(nome, str) and nome:
        attrs["name"] = nome
    ref = nativo.get("referencedDecl")
    if isinstance(ref, dict) and isinstance(ref.get("name"), str) and ref["name"]:
        attrs["name"] = ref["name"]
        if isinstance(ref.get("kind"), str):
            attrs["refKind"] = ref["kind"]

    opcode = nativo.get("opcode")
    if isinstance(opcode, str) and opcode:
        attrs["operator"] = opcode
        attrs["operatorFamily"] = _familia_do_operador(kind, opcode)
    elif kind == "UnaryExprOrTypeTraitExpr":
        # `sizeof` — o único trait do curso iniciante (decisão documentada
        # em c.ts: `alignof`/`_Alignof` ficam fora do vocabulário v1).
        attrs["operator"] = "sizeof"
        attrs["operatorFamily"] = "unary"

    if kind in ("IntegerLiteral", "FloatingLiteral", "CharacterLiteral", "StringLiteral"):
        attrs["valueType"] = {
            "IntegerLiteral": "int",
            "FloatingLiteral": "double",
            "CharacterLiteral": "char",
            "StringLiteral": "string",
        }[kind]
        if kind == "CharacterLiteral" and isinstance(nativo.get("value"), int):
            try:
                attrs["value"] = chr(nativo["value"])
            except (ValueError, OverflowError):
                attrs["value"] = str(nativo["value"])
        elif "value" in nativo:
            attrs["value"] = _attr_text(nativo["value"])

    if kind == "FunctionDecl":
        attrs["declKind"] = "func"
    elif kind == "VarDecl":
        attrs["declKind"] = "var"
    elif kind == "MemberExpr":
        # `s.x` (dot) × `p->m` (arrow) — do `isArrow` MEDIDO do dump. A chave
        # é a MESMA (`node:MemberExpr`): o docs/20 §8 nomeia "acesso a campo"
        # uma vez; a distinção fica no atributo para o relatório.
        attrs["memberAccess"] = "arrow" if nativo.get("isArrow") is True else "dot"
    elif kind == "RecordDecl":
        tag = nativo.get("tagUsed")
        if isinstance(tag, str) and tag:
            attrs["tagUsed"] = tag
    elif kind == "CStyleCastExpr":
        alvo = nativo.get("type", {})
        if isinstance(alvo, dict):
            qual = alvo.get("qualType")
            if isinstance(qual, str) and qual:
                attrs["castType"] = qual

    storage = nativo.get("storageClass")
    if isinstance(storage, str) and storage and storage != "none":
        attrs["storageClass"] = storage
    if nativo.get("variadic") is True:
        attrs["variadic"] = "true"
    return attrs


def _converter(nativo: dict, off: _Offsets, ctx: dict) -> list[dict]:
    """Nós do clang → `LangNode`s. Devolve uma LISTA (normalmente de 0 ou 1).

    Devolve [] para: nós de header (`includedFrom`), decls implícitas de
    kind emitido (`printf` sintetizado por chamada implícita) e nós sem
    posição nenhuma. Kinds transparentes/desconhecidos derrubam O PRÓPRIO
    nó mas DEVOLVEM OS FILHOS — sem isso todo `DeclRefExpr` de C, que vive
    dentro de um `ImplicitCastExpr`, desapareceria.
    """
    if _vem_de_header(nativo):
        return []

    kind = nativo.get("kind", "")
    implicito = nativo.get("isImplicit") is True

    filhos: list[dict] = []
    for bruto in nativo.get("inner", []) or []:
        filhos.extend(_converter(bruto, off, ctx))

    # `RecordDecl` só é EVENTO DE CURRÍCULO como struct (MEDIDO: `union U {…}`
    # é o MESMO kind com `tagUsed: "union"`, e o docs/20 §8 nomeia só o
    # struct). O union DERRUBA o nó — os filhos (FieldDecl, já transparentes)
    # sobem vazios e o union continua fora do vocabulário, como antes.
    if kind == "RecordDecl" and nativo.get("tagUsed") != "struct":
        return filhos

    # O CAST QUE O ALUNO NÃO ESCREVEU (medido, Apple clang 17): `NULL` é
    # `#define NULL ((void*)0)` — TODO `NULL` do fonte vira um
    # `CStyleCastExpr` (`castKind: "NullToPointer"`) cujo `range.begin` é um
    # `expansionLoc` (o corpo da macro mora no header; a expansão aponta para
    # o token `NULL`). Emitir esse nó como `node:CStyleCastExpr` cobraria
    # "cast" de toda aula que usa `NULL` — o mesmo defeito de nomear pelo
    # `__stdoutp` em vez do `stdout` (o que o aluno ESCREVEU é `NULL`, não um
    # cast). O cast REAL (`(int)3.7`) começa num offset PLANO, sem
    # `expansionLoc` — medido: `castKind: "FloatingToIntegral"`, begin direto.
    # O guard é SÓ para o cast: a expansão de `SM_TEST` produz `FunctionDecl`
    # com `expansionLoc` e PRECISA emergir (a dupla-igualdade conta por ela).
    if kind == "CStyleCastExpr" and _e_expansao_de_macro(nativo):
        return filhos

    pos = _pos_do_no(nativo, off)
    if pos is None:
        return []

    if kind not in _EMITIDOS or kind in _TRANSPARENTES:
        return filhos  # derruba o nó; os filhos sobem ao pai
    if implicito:
        return []  # decls sintetizadas pelo clang (printf implícito etc.)

    texto = ctx["src"][pos["start"]:pos["end"]]
    attrs = _attrs_do_no(nativo)

    # O NOME DE UMA REFERÊNCIA É O QUE O ALUNO ESCREVEU, não o que o
    # preprocessor resolveu: no macOS `stdout` é `#define stdout __stdoutp`,
    # e `putc`/`getc` são macros que expandem para `__sputc`/`__sgetc` —
    # referenciar pelo nome resolvido emitaria `global:__stdoutp` e
    # `api:__sputc`, nomes que não existem no fonte e mudam por plataforma.
    # O texto de um `DeclRefExpr` é exatamente o token do identificador.
    if kind == "DeclRefExpr" and re.fullmatch(r"[A-Za-z_]\w*", texto):
        if attrs.get("name") and attrs["name"] != texto:
            attrs["resolvedName"] = attrs["name"]
        attrs["name"] = texto

    # ── nós PORTADORES sintéticos ────────────────────────────────────────
    # (a) ApiRef — chamada a FUNÇÃO que não é declarada no arquivo: API
    #     externa (`api:printf`, `api:scanf`, …). A função do PRÓPRIO
    #     arquivo não é API — é o artefato sob teste (o mesmo partido do
    #     `from solucao import X` do Python, que não emite `api:`).
    # (b) IndirectCall — a chamada cujo alvo não é um nome de FUNÇÃO:
    #     ponteiro de função. É a proibição global de C (a API chamada é
    #     indecidível para o orçamento).
    if kind == "CallExpr":
        alvo = filhos[0] if filhos else None
        if (
            alvo is not None
            and alvo["type"] == "DeclRefExpr"
            and alvo["attributes"].get("refKind") == "FunctionDecl"
        ):
            nome = alvo["attributes"].get("name")
            if nome is not None and nome not in ctx["funcoes"]:
                filhos.append(_no("ApiRef", pos, {"apiPath": nome}, [], True, texto))
        elif alvo is not None:
            filhos.append(_no("IndirectCall", pos, {}, [], True, texto))
    elif kind == "DeclRefExpr":
        # (c) GlobalRef — referência LIVRE a stdin/stdout/stderr, pelo TEXTO
        #     (no macOS `stdout` resolve para `__stdoutp`; o aluno escreve
        #     `stdout`).
        nome = attrs.get("name")
        if nome in _GLOBAIS_RUNTIME and nome not in ctx["declarados"]:
            filhos.append(_no("GlobalRef", pos, {"globalName": nome}, [], True, texto))

    return [_no(kind, pos, attrs, filhos, False, texto)]


def _coletar_declarados(arvore: dict) -> tuple[set[str], set[str]]:
    """Nomes DECLARADOS no arquivo (funções, variáveis, parâmetros) e as
    funções dele — os dois sets que os portadores precisam.

    Passe PRÉVIO sobre o dump cru (com o mesmo filtro de header/implícito):
    o `CallExpr` precisa saber o que é função do arquivo ANTES de virar
    `ApiRef`, e a resolução de escopo é consumida pelos dois lados.
    """
    declarados: set[str] = set()
    funcoes: set[str] = set()

    def passe(nativo: dict) -> None:
        if nativo.get("isImplicit") is True or _vem_de_header(nativo):
            return
        kind = nativo.get("kind", "")
        if kind in ("FunctionDecl", "VarDecl", "ParmVarDecl"):
            nome = nativo.get("name")
            if isinstance(nome, str) and nome:
                declarados.add(nome)
                if kind == "FunctionDecl":
                    funcoes.add(nome)
        for bruto in nativo.get("inner", []) or []:
            passe(bruto)

    passe(arvore)
    return declarados, funcoes


def _includes_do_fonte(src: str, off: _Offsets) -> list[dict]:
    """A diretiva `#include` como nó portador (`node:IncludeDirective`).

    O clang NÃO a emite (o preprocessor a consome antes do Sema) — e é evento
    de currículo da aula 1 de C ("o que é #include e por que ele vem antes").
    A decisão entre chave própria e não-analisável está documentada em
    `lang/c.ts`: chave própria, portadora sintética, lida do FONTE.
    """
    nos: list[dict] = []
    for m in _RE_INCLUDE.finditer(src):
        byte_inicio = len(src[:m.start()].encode("utf-8"))
        byte_fim = len(src[:m.end()].encode("utf-8"))
        pos = {
            "line": off.line_of_byte(byte_inicio),
            "column": off.char_col(byte_inicio),
            "start": off.absolute(byte_inicio),
            "end": off.absolute(byte_fim),
        }
        nos.append(_no("IncludeDirective", pos, {"path": m.group(1)}, [], True,
                       src[m.start():m.end()]))
    return nos


def analisar(dump_json: bytes, caminho_fonte: str) -> dict:
    """O contrato de saída — o MESMO `ParseResult` que o lado JS produz."""
    try:
        arvore = json.loads(dump_json.decode("utf-8", "replace"))
    except ValueError as err:
        return {
            "ok": False,
            "error": {
                "code": "PARSE_ERROR",
                "message": f"saída do clang não é JSON válido: {err}",
                "line": 1,
                "column": 1,
            },
        }

    try:
        # newline="" — O CLANG CONTA BYTES, inclusive o '\r' de um fonte CRLF;
        # o modo texto default do Python (universal newlines) CONVERTERIA
        # '\r\n' em '\n' e dessincronizaria EM SILÊNCIO toda a tabela de
        # inícios de linha contra os offsets em bytes do dump (linha, coluna,
        # start/end e snippet errados a partir da 2ª linha). Com newline=""
        # a string lida tem EXATAMENTE os bytes do arquivo que o clang viu.
        with open(caminho_fonte, "r", encoding="utf-8", newline="") as f:
            src = f.read()
    except OSError as err:
        return {
            "ok": False,
            "error": {
                "code": "PARSE_ERROR",
                "message": f"fonte temporário ilegível: {err}",
                "line": 1,
                "column": 1,
            },
        }

    off = _Offsets(src)
    declarados, funcoes = _coletar_declarados(arvore)
    ctx = {"src": src, "declarados": declarados, "funcoes": funcoes}

    filhos: list[dict] = []
    for bruto in arvore.get("inner", []) or []:
        filhos.extend(_converter(bruto, off, ctx))

    # as diretivas `#include` entram como portadoras, na posição do fonte
    filhos.extend(_includes_do_fonte(src, off))
    filhos.sort(key=lambda no: no["start"])

    # ── escopos (PLANO — o mesmo limite declarado do lado JavaScript) ────
    # `free`: nome referenciado e não declarado no arquivo. C tem escopo de
    # bloco e shadowing legal; a resolução PLANA aqui é o MESMO limite que
    # `extract.ts:38-43` declara para JavaScript — um shadowing deliberado
    # de nome global deixaria de reportar `global:<nome>`. Limite aceito e
    # documentado (a alternativa seria reimplementar o linker de símbolos
    # do clang fora dele).
    referenciados: set[str] = set()

    def passe_refs(no: dict) -> None:
        if no["type"] == "DeclRefExpr":
            nome = no["attributes"].get("name")
            if nome is not None:
                referenciados.add(nome)
        for filho in no["children"]:
            passe_refs(filho)

    for filho in filhos:
        passe_refs(filho)
    livres = sorted(referenciados - declarados)

    raiz = _no(
        "TranslationUnitDecl",
        {"line": 1, "column": 1, "start": 0, "end": len(src)},
        {},
        filhos,
        False,
        src,
    )
    return {
        "ok": True,
        "clangKind": arvore.get("kind", "TranslationUnitDecl"),
        "root": raiz,
        "scopes": {
            "declared": sorted(declarados),
            "imported": [],  # C não tem import — `#include` é expansão de texto
            "free": livres,
        },
    }


def main() -> int:
    dump = sys.stdin.buffer.read()
    fonte = sys.argv[1] if len(sys.argv) > 1 else ""
    if not fonte:
        resultado = {
            "ok": False,
            "error": {
                "code": "PARSE_ERROR",
                "message": "uso: extract_ast.py <fonte.c> (o JSON do clang vem no stdin)",
                "line": 1,
                "column": 1,
            },
        }
    else:
        resultado = analisar(dump, fonte)
    sys.stdout.write(json.dumps(resultado, ensure_ascii=False))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
