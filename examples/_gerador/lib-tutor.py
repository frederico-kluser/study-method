#!/usr/bin/env python3
"""lib-tutor.py — escreve no memory/NNNN.json os campos que, por contrato, sao do TUTOR.

docs/00-contratos.md §2, passos 6 e 7: `plan` e escrito em `plan_lesson`; `how_it_happened`,
`skills_observed`, `artifacts`, `affect`, `affect_note` e `docs_coverage` sao escritos em
`teach`, "em checkpoint a cada marco". Nao existe script para eles — e o modelo que escreve.
Este utilitario so faz o merge e reindenta; nao inventa campo nenhum.

Uso: lib-tutor.py <memory/NNNN.json> <patch.json>
"""
import json
import sys

alvo, patch = sys.argv[1], sys.argv[2]
d = json.load(open(alvo, encoding="utf-8"))
d.update(json.load(open(patch, encoding="utf-8")))
with open(alvo, "w", encoding="utf-8") as fh:
    json.dump(d, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
