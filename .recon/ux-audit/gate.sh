#!/usr/bin/env bash
# gate.sh — GATE CENTRAL de verificação da onda 2 (UX/UI fixes).
# Corre DEPOIS de todos os implementadores terminarem. Uso: bash .recon/ux-audit/gate.sh
# Sai à primeira falha (set -e) com saída legível. Cada secção imprime o PASSO.
set -uo pipefail

ROOT="/home/ondokai/Projects/study-method"
cd "$ROOT/app" || exit 2

step() { echo; echo "════════ $* ════════"; }

step "1/5 · lint (tsc ambos os tsconfigs)"
npm run lint || { echo "GATE FAIL: lint"; exit 1; }

step "2/5 · suite unitária completa (baseline era 7147 testes, 0 falhas)"
npm test || { echo "GATE FAIL: unit"; exit 1; }

step "3/5 · build de produção (electron-vite)"
npm run build || { echo "GATE FAIL: build"; exit 1; }

step "4/5 · e2e — invariantes de spacing (quebra-nunca-recorta, SC 1.4.12)"
npx playwright test \
  tests/e2e/e2e-spacing.spec.ts \
  tests/e2e/e2e-sidebar-aula-spacing.spec.ts \
  --reporter=line || { echo "GATE FAIL: e2e spacing"; exit 1; }

step "5/5 · e2e — superfícies alteradas (rail, tour, fontes, aula, trilhas)"
npx playwright test \
  tests/e2e/perf-settings.spec.ts \
  tests/e2e/e2e-i18n.spec.ts \
  tests/e2e/e2e-nav-history.spec.ts \
  tests/e2e/e2e-onboarding.spec.ts \
  tests/e2e/more-flows.spec.ts \
  tests/e2e/e2e-fontes.spec.ts \
  tests/e2e/e2e-lesson.spec.ts \
  --reporter=line || { echo "GATE FAIL: e2e superfícies"; exit 1; }

echo
echo "✅ GATE VERDE — lint + unit + build + e2e invariantes + e2e superfícies"
