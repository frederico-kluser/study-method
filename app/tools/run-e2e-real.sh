#!/usr/bin/env bash
# tools/run-e2e-real.sh — roda APENAS os specs E2E REAIS (onda 18).
#
# Estes specs exercitam a didática REAL (autoria via OpenRouter, pesquisa Brave,
# runner de verdade) e PORTAMO as chaves reais por envars do processo. O script
# NÃO contém/grava nenhuma chave: exige que o dev/CI as exporte antes, e FALHA
# com mensagem clara se estiverem ausentes (para o dev saber que falta algo).
#
# Uso:
#   export OPENROUTER_API_KEY=sk-or-v1-...
#   export BRAVE_API_KEY=BSAq...
#   npm run test:e2e:real
set -u

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

missing=()
[[ -n "${OPENROUTER_API_KEY:-}" ]] || missing+=("OPENROUTER_API_KEY")
[[ -n "${BRAVE_API_KEY:-}" ]] || missing+=("BRAVE_API_KEY")

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "[e2e:real] Chaves reais ausentes — exporte-as no shell e rode de novo:" >&2
  echo >&2
  for m in "${missing[@]}"; do
    echo "    export $m=..." >&2
  done
  echo >&2
  echo "[e2e:real] A suíte mock (npm run test:e2e) continua verde sem essas chaves." >&2
  exit 1
fi

exec npx playwright test \
  tests/e2e/real-lesson.spec.ts \
  tests/e2e/real-didactics.spec.ts \
  tests/e2e/real-search.spec.ts "$@"