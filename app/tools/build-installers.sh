#!/usr/bin/env bash
#
# tools/build-installers.sh — gera os INSTALADORES do Study Method para todos
# os SO a partir de um ÚNICO host (macmini de preferência — REGRA R6: builds
# pesados nunca no portátil Acer).
#
#   bash tools/build-installers.sh                  # todos: mac-arm64 mac-x64 win-x64 linux-x64
#   bash tools/build-installers.sh win-x64 linux-x64
#   npm run dist / dist:mac / dist:win / dist:linux  # atalhos (package.json)
#
# O que faz:
#   1. `npm ci` — node_modules determinístico a partir do package-lock.json;
#   2. instala (--no-save) as VARIANTES nativas de plataforma dos alvos pedidos
#      (@node-llama-cpp/*, sherpa-onnx-*, @mariozechner/clipboard-*,
#      @reflink/reflink-*) nas versões EXATAS do lock — os pacotes são
#      opcionais por plataforma e o npm só instala os do HOST;
#   3. `npm run lint` + `npm run build` (electron-vite; o postbuild copia
#      electron/main/engine/vocab → out/main/vocab — o resolverArtefato do
#      parser Rust só encontra o extrator em out/main/vocab quando
#      empacotado);
#   4. electron-builder por alvo (app/electron-builder.yml — cujos `files` por
#      plataforma excluem as variantes que NÃO são do alvo);
#   5. VERIFICA o app.asar.unpacked de cada alvo: variantes certas presentes,
#      variantes de outras plataformas ausentes (fail-closed, nunca silencioso).
#
# Artefatos: app/dist/ — .exe (NSIS), .dmg/.zip (mac arm64+x64), .AppImage/.deb
# (linux x64) + dist/SHA256SUMS.txt.
#
# NOTA voz (2026-10-01): os assets embutidos de docs/app-gui.md §2.6
# (resources/tts-engine, tts-models, espeak-ng-data, stt-models) NÃO existem
# neste repositório — os instaladores saem sem eles e a voz degrada para o
# download do mirror em runtime. Quando forem materializados em
# app/resources/, o extraResources do electron-builder.yml passa a apanhá-los.
#
set -euo pipefail

# COMPATIBILIDADE: o bash do macOS é o 3.2.57 do sistema — este script usa só
# recursos dele (sem declare -A, sem mapfile, sem assoc arrays). Se adicionar
# bashismo de bash 4+, teste com `bash --posix` ou num mac real.

cd "$(dirname "${BASH_SOURCE[0]}")/.." # .../app

# ---------------------------------------------------------------------------
# Alvos
# ---------------------------------------------------------------------------
if [[ $# -gt 0 ]]; then
  ALVOS=("$@")
else
  ALVOS=(mac-arm64 mac-x64 win-x64 linux-x64)
fi

variantes_do_alvo() {
  case "$1" in
    mac-arm64) echo "sherpa-onnx-darwin-arm64 @node-llama-cpp/mac-arm64-metal @mariozechner/clipboard-darwin-arm64 @reflink/reflink-darwin-arm64" ;;
    mac-x64) echo "sherpa-onnx-darwin-x64 @node-llama-cpp/mac-x64 @mariozechner/clipboard-darwin-x64 @reflink/reflink-darwin-x64" ;;
    win-x64) echo "sherpa-onnx-win-x64 @node-llama-cpp/win-x64 @mariozechner/clipboard-win32-x64-msvc @reflink/reflink-win32-x64-msvc" ;;
    linux-x64) echo "sherpa-onnx-linux-x64 @node-llama-cpp/linux-x64 @mariozechner/clipboard-linux-x64-gnu @reflink/reflink-linux-x64-gnu" ;;
    *)
      echo "alvo desconhecido: $1 (válidos: mac-arm64 mac-x64 win-x64 linux-x64)" >&2
      exit 2
      ;;
  esac
}

builder_args_do_alvo() {
  case "$1" in
    mac-arm64) echo "--mac --arm64" ;;
    mac-x64) echo "--mac --x64" ;;
    win-x64) echo "--win --x64" ;;
    linux-x64) echo "--linux --x64" ;;
  esac
}

# ---------------------------------------------------------------------------
# 1. node_modules determinístico
# ---------------------------------------------------------------------------
echo "==> npm ci"
npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# 2. variantes nativas dos alvos (união, versões do lock)
# ---------------------------------------------------------------------------
versao_no_lock() {
  node -e '
    const lock = require("./package-lock.json");
    const p = lock.packages["node_modules/" + process.argv[1]];
    if (!p) {
      console.error("sem entrada no package-lock.json: " + process.argv[1]);
      process.exit(1);
    }
    process.stdout.write(p.version);
  ' "$1"
}

# lista plana "nome@versao" — compatível com bash 3.2 do macOS (sem declare -A)
NECESSARIOS=()
ja_na_lista() {
  local n="$1" x
  for x in "${NECESSARIOS[@]:-}"; do
    [[ "$x" == "$n@"* ]] && return 0
  done
  return 1
}

for alvo in "${ALVOS[@]}"; do
  # valida o alvo já aqui (a função também descreve as variantes)
  variantes_do_alvo "$alvo" >/dev/null
  for pkg in $(variantes_do_alvo "$alvo"); do
    if ! ja_na_lista "$pkg"; then
      NECESSARIOS+=("${pkg}@$(versao_no_lock "$pkg")")
    fi
  done
done

if [[ ${#NECESSARIOS[@]} -gt 0 ]]; then
  echo "==> instalando variantes nativas (--no-save): ${NECESSARIOS[*]}"
  # --force: o npm recusa EBADPLATFORM instalar a variante de OUTRA plataforma
  # (ex.: clipboard-darwin-x64 num host arm64) — que é exatamente o que
  # precisamos de pôr em node_modules para empacotar cross-plataforma.
  # --ignore-scripts: os install scripts não são necessários (koffi/web-tree-
  # sitter carregam dos prebuilds do tarball) e o npm 11 bloqueia-os por
  # omissão (allow-scripts) de qualquer forma.
  npm install --no-save --force --no-audit --no-fund --ignore-scripts "${NECESSARIOS[@]}"
  for spec in "${NECESSARIOS[@]}"; do
    dir="${spec%@*}"
    [[ -d "node_modules/$dir" ]] || {
      echo "FALHA: variante $dir não ficou em node_modules/" >&2
      exit 1
    }
  done
fi

# ---------------------------------------------------------------------------
# 3. lint + bundle
# ---------------------------------------------------------------------------
echo "==> npm run lint"
npm run lint

echo "==> npm run build"
npm run build

# ---------------------------------------------------------------------------
# 4–5. electron-builder por alvo + verificação fail-closed
# ---------------------------------------------------------------------------
verificar_unpacked() {
  local unpacked="$1" alvo="$2"
  local esperados forbidos pat hit p

  if [[ ! -d "$unpacked" ]]; then
    echo "FALHA ($alvo): não existe $unpacked" >&2
    exit 1
  fi

  case "$alvo" in
    win-x64)
      esperados=(sherpa-onnx-win-x64 @node-llama-cpp/win-x64 @mariozechner/clipboard-win32-x64-msvc @reflink/reflink-win32-x64-msvc)
      forbidos=(
        '@node-llama-cpp/linux-*' '@node-llama-cpp/mac-*' '@node-llama-cpp/win-arm64' '@node-llama-cpp/win-x64-cuda*' '@node-llama-cpp/win-x64-vulkan'
        'sherpa-onnx-darwin-*' 'sherpa-onnx-linux-*' 'sherpa-onnx-win-ia32'
        '@mariozechner/clipboard-darwin-*' '@mariozechner/clipboard-linux-*' '@mariozechner/clipboard-win32-arm64-*'
        '@reflink/reflink-darwin-*' '@reflink/reflink-linux-*' '@reflink/reflink-win32-arm64-*'
      )
      ;;
    linux-x64)
      esperados=(sherpa-onnx-linux-x64 @node-llama-cpp/linux-x64 @mariozechner/clipboard-linux-x64-gnu @reflink/reflink-linux-x64-gnu)
      forbidos=(
        '@node-llama-cpp/mac-*' '@node-llama-cpp/win-*' '@node-llama-cpp/linux-arm*' '@node-llama-cpp/linux-x64-cuda*' '@node-llama-cpp/linux-x64-vulkan'
        'sherpa-onnx-darwin-*' 'sherpa-onnx-win-*' 'sherpa-onnx-linux-arm64'
        '@mariozechner/clipboard-darwin-*' '@mariozechner/clipboard-win32-*' '@mariozechner/clipboard-linux-arm64-*' '@mariozechner/clipboard-linux-riscv64-*' '@mariozechner/clipboard-linux-x64-musl'
        '@reflink/reflink-darwin-*' '@reflink/reflink-win32-*' '@reflink/reflink-linux-arm64-*' '@reflink/reflink-linux-x64-musl'
      )
      ;;
    mac-*)
      esperados=(sherpa-onnx-darwin-arm64 @node-llama-cpp/mac-arm64-metal @mariozechner/clipboard-darwin-arm64 @reflink/reflink-darwin-arm64)
      forbidos=(
        '@node-llama-cpp/linux-*' '@node-llama-cpp/win-*'
        'sherpa-onnx-linux-*' 'sherpa-onnx-win-*'
        '@mariozechner/clipboard-linux-*' '@mariozechner/clipboard-win32-*' '@mariozechner/clipboard-darwin-universal'
        '@reflink/reflink-linux-*' '@reflink/reflink-win32-*'
      )
      ;;
  esac

  for p in "${esperados[@]}"; do
    [[ -e "$unpacked/$p" ]] || {
      echo "FALHA ($alvo): variante esperada ausente em $unpacked: $p" >&2
      exit 1
    }
  done
  for pat in "${forbidos[@]}"; do
    hit=$(compgen -G "$unpacked/$pat" || true)
    if [[ -n "$hit" ]]; then
      echo "FALHA ($alvo): variante estrangeira empacotada em $unpacked: $pat" >&2
      echo "$hit" >&2
      exit 1
    fi
  done
  echo "OK   ($alvo): variantes nativas corretas em $unpacked"
}

for alvo in "${ALVOS[@]}"; do
  echo "==> electron-builder ($alvo)"
  # shellcheck disable=SC2046  # split intencional dos args do alvo
  npx electron-builder --config electron-builder.yml --publish never $(builder_args_do_alvo "$alvo")

  case "$alvo" in
    win-x64)
      verificar_unpacked "dist/win-unpacked/resources/app.asar.unpacked/node_modules" "$alvo"
      ;;
    linux-x64)
      verificar_unpacked "dist/linux-unpacked/resources/app.asar.unpacked/node_modules" "$alvo"
      ;;
    mac-*)
      # cada build mac produz a sua .app; verificar TODAS as que existirem
      # (o check é por plataforma, vale igual para arm64 e x64) — loop
      # while-read em vez de mapfile (bash 3.2 do macOS)
      napps=0
      while IFS= read -r unpacked; do
        napps=$((napps + 1))
        verificar_unpacked "$unpacked" "$alvo"
      done < <(find dist -type d -path "*.app/Contents/Resources/app.asar.unpacked/node_modules" 2>/dev/null)
      [[ $napps -gt 0 ]] || {
        echo "FALHA ($alvo): nenhuma .app com app.asar.unpacked em dist/" >&2
        exit 1
      }
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Relatório final
# ---------------------------------------------------------------------------
echo
echo "==> instaladores em app/dist/"
find dist -maxdepth 1 -type f \( -name "*.exe" -o -name "*.dmg" -o -name "*.zip" -o -name "*.AppImage" -o -name "*.deb" \) | sort | while read -r f; do
  printf '  %8s  %s\n' "$(du -h "$f" | cut -f1)" "$f"
done

if command -v sha256sum >/dev/null 2>&1; then
  SHA="sha256sum"
else
  SHA="shasum -a 256"
fi
find dist -maxdepth 1 -type f \( -name "*.exe" -o -name "*.dmg" -o -name "*.zip" -o -name "*.AppImage" -o -name "*.deb" \) | sort | xargs $SHA >dist/SHA256SUMS.txt
echo "==> checksums em app/dist/SHA256SUMS.txt"
