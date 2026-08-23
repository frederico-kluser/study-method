# Fragmentos do BUILD_SPEC

Cada sub-tarefa da onda 3 entrega **o fragmento do que acabou de implementar** — quem escreveu o
código é quem sabe descrevê-lo sem alucinar. A onda 4 costura tudo num `BUILD_SPEC.md` **único**
(o usuário pediu um documento), e `tests/spec-conformance.sh` verifica mecanicamente que o
documento não divergiu do repositório.

Regra de cada fragmento: **contrato, não racional**. O que o artefato recebe, o que produz, o
algoritmo e as condições de erro. O porquê já vive em `docs/`.

| Arquivo | Dono (sub-tarefa) | Cobre |
|---|---|---|
| `10-decisoes.md` | 3.0a/b/c | catálogo de decisões, 3 camadas, protocolo de entrevista |
| `20-skill-md.md` | 3.1 | frontmatter, roteador, regras permanentes |
| `30-lib-setup.md` | 3.3a | `lib/common.sh`, `lib/json.sh`, `setup-init.sh`, `setup-list.sh` |
| `31-sessao-docs.md` | 3.3b | `session-new.sh`, `session-close.sh`, `research-new.sh`, `docs-index.sh` |
| `40-memoria.md` | 3.4a | `memory-index.sh`, `memory-digest.sh`, `memory-compact.sh` |
| `41-progresso-readme.md` | 3.4b | `progress-update.sh`, `readme-sync.sh` |
| `50-sandbox.md` | 3.5a | `lib/sandbox.sh`, `detect-toolchains.sh` |
| `51-challenge-new.md` | 3.5b | `challenge-new.sh`, materialização por `layout_profile` |
| `52-challenge-verify.md` | 3.5c | `challenge-verify.sh`, motor de mutação, REQUEST/APPLY |
| `60-templates.md` | 3.6 | contrato dos templates e placeholders |
| `70-render.md` | 3.7 | `render-plot.py`, spec JSON, 4 saídas |
| `80-gate.md` | 3.8 | `tests/*`, invariantes verificadas |
| `90-researchs.md` | 3.9 | formato do destilado, proveniência |
