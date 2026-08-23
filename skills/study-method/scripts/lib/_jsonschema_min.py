#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verificador minimo de JSON Schema — stdlib apenas.

Nao existe `jsonschema` nesta maquina e o PEP 668 impede instalar. Este verificador
cobre, DE PROPOSITO, apenas o subconjunto que os schemas do projeto usam
(docs/00-contratos.md §4.3): type (string ou array de strings), required, enum,
pattern, properties, items, additionalProperties, minimum/maximum,
minLength/maxLength, minItems.

Sem $ref, sem allOf/anyOf/oneOf, sem if/then/else, sem $defs — por contrato (I-08).
Palavra-chave desconhecida e IGNORADA em silencio: cobertura parcial declarada,
nunca falso negativo silencioso sobre o que ele cobre.

Uso:   _jsonschema_min.py <instancia.json> <schema.json>
Saida: uma linha por erro em stderr, no formato "<json-pointer>: <motivo>".
Exit:  0 valido · 5 invalido (ou instancia/schema ilegivel).
"""

import json
import re
import sys

ERRORS = []
MAX_ERRORS = 200


def pointer(parts):
    if not parts:
        return ""
    out = []
    for p in parts:
        p = str(p).replace("~", "~0").replace("/", "~1")
        out.append(p)
    return "/" + "/".join(out)


def fail(parts, motivo):
    if len(ERRORS) < MAX_ERRORS:
        ERRORS.append("%s: %s" % (pointer(parts), motivo))


def type_name(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "desconhecido"


def type_matches(value, expected):
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    if expected == "string":
        return isinstance(value, str)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    return True


def validate(value, schema, parts):
    if not isinstance(schema, dict):
        return

    # --- type (string ou array de strings) ---------------------------------
    if "type" in schema:
        expected = schema["type"]
        if isinstance(expected, str):
            expected = [expected]
        if isinstance(expected, list) and expected:
            if not any(type_matches(value, t) for t in expected):
                fail(parts, "tipo esperado %s, encontrado %s"
                     % ("|".join(str(t) for t in expected), type_name(value)))
                return

    # --- enum ---------------------------------------------------------------
    if "enum" in schema and isinstance(schema["enum"], list):
        if value not in schema["enum"]:
            fail(parts, "valor fora do enum %s: %s"
                 % (json.dumps(schema["enum"], ensure_ascii=False),
                    json.dumps(value, ensure_ascii=False)))

    # --- const --------------------------------------------------------------
    if "const" in schema and value != schema["const"]:
        fail(parts, "valor esperado %s" % json.dumps(schema["const"], ensure_ascii=False))

    # --- string -------------------------------------------------------------
    if isinstance(value, str):
        pat = schema.get("pattern")
        if isinstance(pat, str):
            try:
                if re.search(pat, value) is None:
                    fail(parts, "nao casa o pattern %s: %s" % (pat, json.dumps(value, ensure_ascii=False)))
            except re.error as exc:
                fail(parts, "pattern invalido no schema (%s)" % exc)
        mn = schema.get("minLength")
        if isinstance(mn, int) and len(value) < mn:
            fail(parts, "comprimento %d abaixo do minimo %d" % (len(value), mn))
        mx = schema.get("maxLength")
        if isinstance(mx, int) and len(value) > mx:
            fail(parts, "comprimento %d acima do maximo %d" % (len(value), mx))

    # --- numero -------------------------------------------------------------
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        mn = schema.get("minimum")
        if isinstance(mn, (int, float)) and not isinstance(mn, bool) and value < mn:
            fail(parts, "valor %s abaixo do minimo %s" % (value, mn))
        mx = schema.get("maximum")
        if isinstance(mx, (int, float)) and not isinstance(mx, bool) and value > mx:
            fail(parts, "valor %s acima do maximo %s" % (value, mx))

    # --- array --------------------------------------------------------------
    if isinstance(value, list):
        mn = schema.get("minItems")
        if isinstance(mn, int) and len(value) < mn:
            fail(parts, "%d itens, minimo %d" % (len(value), mn))
        mx = schema.get("maxItems")
        if isinstance(mx, int) and len(value) > mx:
            fail(parts, "%d itens, maximo %d" % (len(value), mx))
        items = schema.get("items")
        if isinstance(items, dict):
            for i, item in enumerate(value):
                validate(item, items, parts + [i])
        elif isinstance(items, list):
            for i, sub in enumerate(items):
                if i < len(value):
                    validate(value[i], sub, parts + [i])

    # --- object -------------------------------------------------------------
    if isinstance(value, dict):
        required = schema.get("required")
        if isinstance(required, list):
            for key in required:
                if key not in value:
                    fail(parts, "propriedade obrigatoria ausente: %s" % key)
        props = schema.get("properties")
        props = props if isinstance(props, dict) else {}
        for key, sub in props.items():
            if key in value:
                validate(value[key], sub, parts + [key])
        addl = schema.get("additionalProperties", True)
        if addl is False:
            for key in value:
                if key not in props:
                    fail(parts, "propriedade nao permitida: %s" % key)
        elif isinstance(addl, dict):
            for key in value:
                if key not in props:
                    validate(value[key], addl, parts + [key])


def load(path, rotulo):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        ERRORS.append(": %s ausente: %s" % (rotulo, path))
    except OSError as exc:
        ERRORS.append(": %s ilegivel: %s (%s)" % (rotulo, path, exc))
    except ValueError as exc:
        ERRORS.append(": %s nao e JSON valido: %s (%s)" % (rotulo, path, exc))
    return None


def main(argv):
    if len(argv) != 3:
        sys.stderr.write("uso: _jsonschema_min.py <instancia.json> <schema.json>\n")
        return 5
    instance = load(argv[1], "instancia")
    schema = load(argv[2], "schema")
    if ERRORS:
        for line in ERRORS:
            sys.stderr.write(line + "\n")
        return 5
    validate(instance, schema, [])
    if ERRORS:
        for line in ERRORS:
            sys.stderr.write(line + "\n")
        return 5
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
