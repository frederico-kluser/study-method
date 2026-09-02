#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""app/electron/main/engine/vocab/py/gerar_inventario.py — O GERADOR DE
`vocab/atoms.python.json`.

É o análogo Python de `vocab/generate.ts`, e existe pelo mesmo motivo:
**vocabulário nunca é digitado à mão.** Lista escrita à mão erra nos dois
sentidos — esquecer um nome faz o gate deixar passar, e inventar um nome faz o
gate reprovar código correto.

    python3 app/electron/main/engine/vocab/py/gerar_inventario.py   # regrava o JSON
    python3 .../gerar_inventario.py --stdout                        # só imprime

POR QUE O ARTEFATO CARREGA `python_version`
-------------------------------------------
Como o `atoms.json` do JavaScript carrega `node_version`/`typescript_version`,
este carrega `python_version` e `python_implementation` — e não é decoração:
o CPython 3.14 ACRESCENTOU `TemplateStr`/`Interpolation` ao `ast` (PEP 750).
Um inventário gerado no 3.12 e usado no 3.14 reprovaria uma t-string válida;
gerado no 3.14 e usado no 3.12, liberaria uma construção que nem existe. Por
isso a versão que produziu o artefato vai DENTRO dele, e `python.ts::detect()`
compara com o `python3` da máquina e reporta a divergência.

DETERMINISMO: todos os arrays são ordenados e não há timestamp — o mesmo
interpretador produz os mesmos bytes.

OS CINCO EIXOS (o `term:` é prosa pt-BR por trilha e não tem fonte de máquina;
o `form:` está DESABILITADO em Python na v1 — ver `lang/python.ts`):

  node:   classes do módulo `ast` (subclasses de `ast.AST`) + as CHAVES
          SINTÉTICAS das doze distinções de `docs/17-trilha-python.md`, MENOS
          as classes que são só operador (viram eixo `op:`) e MENOS
          `ast.Constant`, que nunca é emitido cru (vira `node:IntLiteral`,
          `node:StrLiteral`, …).
  op:     os textos de operador das cinco famílias (`binary`, `compare`,
          `bool`, `unary`, `aug`), derivados das MESMAS tabelas que
          `extract_ast.py` usa — importadas dele, nunca copiadas.
  decl:   as onze FORMAS DE LIGAÇÃO (§"Vocabulário" de `docs/17`). Python não
          tem palavra-chave de declaração; o eixo foi repreposto.
  global: `dir(builtins)` (os ~150 embutidos) MAIS os dunders de módulo
          (`__file__`, `__builtins__`, …). A chave `builtins` do JSON, fora
          dos eixos, guarda só o subconjunto da LINGUAGEM — é a separação
          `globals()`/`builtins()` que o §6 pede e que JavaScript não tem.
  api:    `sys.stdlib_module_names` — os 297 módulos da stdlib. É o DICIONÁRIO
          DE ENSINO (piso de consciência), não o teto do gate: o extrator
          emite `api:` para qualquer cadeia, inclusive de pacote externo,
          exatamente como o lado JavaScript faz com `api:express`.
"""

from __future__ import annotations

import argparse
import ast
import json
import platform
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from extract_ast import (  # noqa: E402  (o sys.path acima é deliberado)
    BUILTIN_NAMES,
    MODULE_DUNDERS,
    _LITERAL_NODE,
    _OP_BINARY,
    _OP_BOOL,
    _OP_COMPARE,
    _OP_UNARY,
    _OPERATOR_BASES,
)

# ---------------------------------------------------------------------------
# As chaves SINTÉTICAS (docs/17-trilha-python.md, "as doze distinções")
# ---------------------------------------------------------------------------
#
# Precedente de nomenclatura: `node:ComputedNonLiteralAccess` de
# `engine/atomKeys.ts` — nome em PascalCase que NÃO existe no enum do parser e
# mesmo assim é emitido pelo extrator. Toda chave abaixo segue esse padrão.

NOS_SINTETICOS: tuple[str, ...] = (
    # #1 literais — `7` e `"oi"` são o MESMO `ast.Constant`
    *sorted(set(_LITERAL_NODE.values())),
    # #2 `elif` × `else:` seguido de `if` (só o col_offset difere)
    "Elif",
    # #3 `if` COM `else`
    "IfElse",
    # #4 `for`/`while` com `else`
    "ForElse",
    "WhileElse",
    # #5 `try` com `finally`
    "Finally",
    # #9 decorador — não tem nó; vive em `decorator_list`
    "Decorator",
    # #11 método × função, e os dunders que a trilha ensina
    "MethodDef",
    "InitMethod",
    "DunderStr",
    # #12 `int | None` em anotação × `|` bit a bit
    "OptionalAnnotation",
    # PROIBIÇÕES GLOBAIS — as construções que fazem o gate mentir
    "ComputedNonLiteralAttribute",
    "DynamicAttributeHook",
)

# As FORMAS DE LIGAÇÃO — o eixo `decl:` repreposto (docs/17, decisão 1).
FORMAS_DE_LIGACAO: tuple[str, ...] = (
    "ann",
    "assign",
    "aug",
    "default",
    "except-as",
    "global",
    "kwarg",
    "nonlocal",
    "unpack",
    "vararg",
    "walrus",
)

# Nós que o emissor NUNCA produz e que por isso ficam fora do inventário:
#   - `Constant`  — sempre refinado por tipo de valor (#1);
#   - `AST`       — a raiz abstrata da hierarquia, não é nó de código;
#   - os marcadores de escopo/marcação do próprio `extract_ast.py` (`Op`,
#     `Binding`, `GlobalRef`, `ApiRef`), que carregam chave de OUTRO eixo.
NAO_EMITIDOS: frozenset[str] = frozenset({"AST", "Constant"})


def nomes_de_no() -> list[str]:
    """Toda classe do `ast` que é nó de código, mais as sintéticas."""
    do_ast = {
        nome
        for nome in dir(ast)
        if isinstance(getattr(ast, nome), type)
        and issubclass(getattr(ast, nome), ast.AST)
        and not issubclass(getattr(ast, nome), _OPERATOR_BASES)
        and nome not in NAO_EMITIDOS
    }
    # `dir(ast)` traz aliases depreciados (`ast.Num`, `ast.Str`, `ast.Bytes`,
    # `ast.NameConstant`, `ast.Ellipsis`) que o parser do 3.8+ NUNCA produz —
    # `type(n).__name__` devolve `Constant`. Um nome que não é o `__name__` da
    # própria classe é alias, e alias não entra no universo.
    canonicos = {nome for nome in do_ast if getattr(ast, nome).__name__ == nome}
    return sorted(canonicos | set(NOS_SINTETICOS))


def chaves_de_operador() -> list[str]:
    familias = (
        ("binary", _OP_BINARY),
        ("compare", _OP_COMPARE),
        ("bool", _OP_BOOL),
        ("unary", _OP_UNARY),
        # `aug` reusa os operadores binários: `+=` é `AugAssign(op=Add)`.
        ("aug", _OP_BINARY),
    )
    return sorted({f"op:{familia}:{texto}" for familia, tabela in familias for texto in tabela.values()})


def gerar() -> dict:
    nos = [f"node:{n}" for n in nomes_de_no()]
    ops = chaves_de_operador()
    decls = [f"decl:{d}" for d in FORMAS_DE_LIGACAO]
    # O eixo `global:` é `dir(builtins)` MAIS os dunders de módulo — é o
    # universo exato que `extract_ast.py` cruza com as referências livres.
    globais = sorted({f"global:{n}" for n in (BUILTIN_NAMES | MODULE_DUNDERS)})
    apis = sorted({f"api:{m}" for m in sys.stdlib_module_names})
    return {
        "schema": 1,
        "python_version": platform.python_version(),
        "python_implementation": platform.python_implementation(),
        "axes": {
            "node": nos,
            "op": ops,
            "decl": decls,
            "global": globais,
            "api": apis,
        },
        # `builtins` NÃO é um eixo: é o SUBCONJUNTO de `axes.global` que a
        # LINGUAGEM embute (`len`, `range`, `ValueError`), separado dos dunders
        # que o RUNTIME de módulo põe (`__file__`, `__builtins__`). O §6 do
        # research 08 lista `globals()`/`builtins()` com barra exatamente por
        # causa desta separação, que em JavaScript não existe (lá tudo é
        # propriedade de `globalThis` e os dois conjuntos coincidem).
        "builtins": sorted(BUILTIN_NAMES),
        "total": len(nos) + len(ops) + len(decls) + len(globais) + len(apis),
    }


def main() -> int:
    p = argparse.ArgumentParser(description="gera vocab/atoms.python.json")
    p.add_argument("--stdout", action="store_true", help="imprime em vez de gravar")
    args = p.parse_args()

    dados = gerar()
    texto = json.dumps(dados, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    if args.stdout:
        sys.stdout.write(texto)
        return 0
    destino = Path(__file__).resolve().parent.parent / "atoms.python.json"
    destino.write_text(texto, encoding="utf-8")
    eixos = {k: len(v) for k, v in dados["axes"].items()}
    sys.stderr.write(f"{destino}\n  python {dados['python_version']}  {eixos}  total {dados['total']}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
