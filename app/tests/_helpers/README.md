# tests/_helpers — helpers compartilhados dos testes

Convenções dos testes da app (node:test + tsx, via `bash tools/t.sh tests`):

- Arquivos de teste terminam em `.test.ts` / `.test.tsx` e vivem sob `tests/`.
- NUNCA dependem de rede real: HTTP (OpenRouter/Brave) é mockado com
  `mock.fetch` (node:test) ou injetando um `fetch` fake.
- SDKs pesados (pi, node-llama-cpp) são lazy-import e mockados por adoção de
  módulo (mock.module) ou por injeção de factory — nunca requerem binários.
- Scripts da skill são fixtures em `tests/_fixtures/skill/` (um `<script>.sh`
  fake que imita o contrato de exit codes, incluindo o exit 10 REQUEST/APPLY).
- Diretórios temporários sempre via `mkTempDir()` deste helpers/fs.ts e
  removidos no `after()` — nada é criado fora de tmp.

## fs.ts
`mkTempDir(prefix?)` → Promise<string> (fs.mkdtemp em os.tmpdir()).
`rmrf(dir)` → Promise<void> (fs.rm recursive).
