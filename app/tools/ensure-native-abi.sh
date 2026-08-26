#!/usr/bin/env bash
# tools/ensure-native-abi.sh — compila o addon nativo better-sqlite3-electron para
# o ABI do Electron instalado, de forma idempotente.
#
# Por que existe: `better-sqlite3` (13.x, usado pelos testes sob o Node do sistema)
# e o alias `better-sqlite3-electron` (12.11.1, usado dentro do Electron) dividem o
# MESMO node_modules, mas os dois runtimes têm ABIs diferentes. O Electron 33 embute
# Node 20 (NAPI 9) e o Node do sistema pode ser outro (NAPI 10+). O prebuild do npm
# é compilado para o Node do SISTEMA; carregá-lo dentro do Electron segfaulta em
# silêncio (SIGSEGV não é exceção JS). Aqui recompilamos o alias contra os headers
# do Electron (--dist-url) para o ABI certo. Roda automaticamente em
# postinstall/predev/pretest:e2e*.
#
# Idempotente: um marker em node_modules/.bsqlite3-eabi-<EV>-<PLAT>-<ARCH> evita
# recompilar a cada execução (fast path <1s). Saída 0 também quando o npm ci ainda
# não rodou (nada a compilar) — o script nunca quebra o `npm install` inicial.
set -euo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP"

# npm ci ainda não rodou — não há binário do Electron nem addon para compilar.
if [ ! -d node_modules/electron ]; then
  echo "[ensure-native-abi] node_modules/electron ausente (npm ci pendente) — pulando." >&2
  exit 0
fi

EV="$(cat node_modules/electron/dist/version 2>/dev/null || true)"
if [ -z "$EV" ]; then
  echo "[ensure-native-abi] sem node_modules/electron/dist/version — pulando." >&2
  exit 0
fi

PLAT="$(node -p 'process.platform')"
ARCH="$(node -p 'process.arch')"
MARKER="node_modules/.bsqlite3-eabi-${EV}-${PLAT}-${ARCH}"

# Fast path: já compilado para exatamente este Electron/plataforma/arch.
if [ -f "$MARKER" ]; then
  exit 0
fi

if [ ! -d node_modules/better-sqlite3-electron ]; then
  echo "[ensure-native-abi] ERRO: node_modules/better-sqlite3-electron ausente." >&2
  echo "  rode \`npm ci\` (ou ./install.sh) primeiro para instalar o alias." >&2
  exit 1
fi

echo "[ensure-native-abi] compilando better-sqlite3-electron para Electron ${EV} (${PLAT}-${ARCH})…"

# Prefere o node-gyp local (vem do electron-builder/@electron/rebuild) e cai para
# o npx como fallback. O caminho é resolvido antes do cd porque o build roda em
# outro cwd (node_modules/better-sqlite3-electron).
NODE_GYP=""
if [ -x "$APP/node_modules/.bin/node-gyp" ]; then
  NODE_GYP="$APP/node_modules/.bin/node-gyp"
elif [ -x "$APP/node_modules/better-sqlite3-electron/node_modules/.bin/node-gyp" ]; then
  NODE_GYP="$APP/node_modules/better-sqlite3-electron/node_modules/.bin/node-gyp"
fi

if ! (
  cd node_modules/better-sqlite3-electron
  export npm_config_force_build=1
  export HUSKY=0
  if [ -n "$NODE_GYP" ]; then
    "$NODE_GYP" rebuild --target="$EV" --arch="$ARCH" --dist-url=https://electronjs.org/headers
  else
    npx --yes node-gyp rebuild --target="$EV" --arch="$ARCH" --dist-url=https://electronjs.org/headers
  fi
); then
  echo "[ensure-native-abi] ERRO: falha ao compilar better-sqlite3-electron para Electron ${EV}." >&2
  echo "  Toolchain: instale Xcode Command Line Tools (macOS) ou build-essential + python3 (Linux)." >&2
  echo "  Rede: os headers vêm de https://electronjs.org/headers — confira conectividade." >&2
  exit 1
fi

if [ -f node_modules/better-sqlite3-electron/build/Release/better_sqlite3.node ]; then
  touch "$MARKER"
  echo "[ensure-native-abi] ok — node_modules/better-sqlite3-electron/build/Release/better_sqlite3.node"
  exit 0
fi

echo "[ensure-native-abi] ERRO: build/Release/better_sqlite3.node não foi gerado." >&2
echo "  Toolchain: instale Xcode Command Line Tools (macOS) ou build-essential + python3 (Linux)." >&2
echo "  Rede: os headers vêm de https://electronjs.org/headers — confira conectividade." >&2
exit 1
