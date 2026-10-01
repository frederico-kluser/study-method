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
    # SÓ AppImage pelo electron-builder: o fpm empacotado dele está quebrado
    # no macOS (ver gerar_deb abaixo) — o .deb sai do gerador próprio.
    linux-x64) echo "--linux AppImage --x64" ;;
  esac
}

# ---------------------------------------------------------------------------
# gerar_deb — .deb sem o fpm
# ---------------------------------------------------------------------------
# O fpm-1.9.3 empacotado do electron-builder falha SEMPRE no macOS ao gerar
# deb ("Process failed: ar failed (exit code 1)"): chama `ar -qc` com
# debian-binary/control.tar.gz relativos a um CWD onde eles não estão —
# reproduzido isoladamente, com e sem espaços no nome de saída.
# Um .deb não tem segredo: um arquivo `ar` de três membros — debian-binary
# ("2.0"), control.tar.gz (control + scripts) e data.tar.gz (a árvore).
# Os campos espelham os que o próprio fpm usava (vê-se no log da falha):
# depends do Electron, icons em hicolor e .desktop.
gerar_deb() {
  local versao nome tmp data ctrl size debfinal
  versao=$(node -p "require('./package.json').version")
  nome="study-method-gui_${versao}_amd64.deb"
  debfinal="dist/Study Method-${versao}-linux-amd64.deb"
  tmp=$(mktemp -d /tmp/study-method-deb.XXXXXX)
  data="$tmp/data"
  ctrl="$tmp/ctrl"

  mkdir -p "$data/opt" "$data/usr/share/applications"
  mkdir -p "$data/usr/share/icons/hicolor"
  cp -R "dist/linux-unpacked" "$data/opt/Study Method"
  cp -R node_modules/app-builder-lib/templates/icons/electron-linux "$data/usr/share/icons/hicolor/.icons-tmp"
  local s
  for s in 16x16 32x32 48x48 64x64 128x128 256x256; do
    mkdir -p "$data/usr/share/icons/hicolor/$s/apps"
    cp "$data/usr/share/icons/hicolor/.icons-tmp/$s.png" "$data/usr/share/icons/hicolor/$s/apps/study-method-gui.png"
  done
  rm -rf "$data/usr/share/icons/hicolor/.icons-tmp"

  cat >"$data/usr/share/applications/study-method-gui.desktop" <<'DESKTOP'
[Desktop Entry]
Name=Study Method
Comment=Tutor de programação com aula, desafios validados por teste e memória de progresso
Exec="/opt/Study Method/study-method-gui" %U
Terminal=false
Type=Application
Icon=study-method-gui
StartupWMClass=Study Method
Categories=Education;
DESKTOP

  mkdir -p "$ctrl"
  size=$(du -sk "$data/opt" | cut -f1)
  cat >"$ctrl/control" <<CONTROL
Package: study-method-gui
Version: ${versao}
Section: utils
Priority: optional
Architecture: amd64
Installed-Size: ${size}
Maintainer: study-method <study-method@users.noreply.github.com>
Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0
Recommends: libappindicator3-1
Homepage: https://github.com/frederico-kluser/study-method#readme
Description: Tutor de programação com aula e desafios validados por teste
 GUI Electron para o tutor study-method — LLM local (node-llama-cpp),
 editor de código sem autocomplete, pesquisa Brave e pi coding agent
 (GLM 5.3 Flash via OpenRouter).
CONTROL
  cat >"$ctrl/postinst" <<'POSTINST'
#!/bin/sh
set -e
update-desktop-database -q /usr/share/applications >/dev/null 2>&1 || true
gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor >/dev/null 2>&1 || true
exit 0
POSTINST
  chmod 755 "$ctrl/postinst"

  # dono root nos membros do tar (sem os flags o tar guarda uid do build)
  (cd "$data" && tar --uid 0 --gid 0 --uname root --gname root -czf "$tmp/data.tar.gz" .) 2>/dev/null ||
    (cd "$data" && tar -czf "$tmp/data.tar.gz" .)
  (cd "$ctrl" && tar --uid 0 --gid 0 --uname root --gname root -czf "$tmp/control.tar.gz" .) 2>/dev/null ||
    (cd "$ctrl" && tar -czf "$tmp/control.tar.gz" .)
  printf '2.0\n' >"$tmp/debian-binary"

  # nome interno sem espaços (o ar de alguns hosts é sensível); mv no fim
  (cd "$tmp" && /usr/bin/ar -rc "$tmp/pkg.deb" debian-binary control.tar.gz data.tar.gz)
  mv "$tmp/pkg.deb" "$debfinal"
  rm -rf "$tmp"
  echo "OK   (linux-x64): deb gerado em $debfinal"
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
# Lista os NOMES das variantes de plataforma efetivamente empacotadas:
# clipboard-*/reflink-*/sherpa-onnx-* em QUALQUER profundidade (o npm aninha as
# variantes sob o pacote pai — @mariozechner/clipboard/node_modules/…) e as
# variantes @node-llama-cpp/* (escopo por path: os prebuilds do tree-sitter-rust
# têm nomes iguais — darwin-x64, linux-x64 — e NÃO são variantes nossas).
listar_variantes() {
  {
    find "$1" -type d \( -name "clipboard-*" -o -name "reflink-*" -o -name "sherpa-onnx-*" \) -prune -print 2>/dev/null
    find "$1" -type d -path "*/@node-llama-cpp/*" -prune -print 2>/dev/null
  } | awk -F/ '{print $NF}' | sort -u
}

verificar_unpacked() {
  local root="$1" alvo="$2"
  local lista nome pat
  local esperados forbidos

  if [[ ! -d "$root" ]]; then
    echo "FALHA ($alvo): não existe $root" >&2
    exit 1
  fi
  lista=$(listar_variantes "$root")

  case "$alvo" in
    win-x64)
      esperados="clipboard-win32-x64-msvc reflink-win32-x64-msvc sherpa-onnx-win-x64 win-x64"
      forbidos="clipboard-darwin-* clipboard-linux-* clipboard-win32-arm64-* reflink-darwin-* reflink-linux-* reflink-win32-arm64-* sherpa-onnx-darwin-* sherpa-onnx-linux-* sherpa-onnx-win-ia32 mac-* linux-* win-arm64 win-x64-cuda* win-x64-vulkan"
      ;;
    linux-x64)
      esperados="clipboard-linux-x64-gnu reflink-linux-x64-gnu sherpa-onnx-linux-x64 linux-x64"
      forbidos="clipboard-darwin-* clipboard-win32-* clipboard-linux-arm64-* clipboard-linux-riscv64-* clipboard-linux-x64-musl reflink-darwin-* reflink-win32-* reflink-linux-arm64-* reflink-linux-x64-musl sherpa-onnx-darwin-* sherpa-onnx-win-* sherpa-onnx-linux-arm64 mac-* win-* linux-arm* linux-x64-cuda* linux-x64-vulkan"
      ;;
    mac-*)
      # ambos os archs darwin em cada .app (decisão do config: cada instalador
      # mac roda nativo E sob Rosetta)
      esperados="clipboard-darwin-arm64 clipboard-darwin-x64 reflink-darwin-arm64 reflink-darwin-x64 sherpa-onnx-darwin-arm64 sherpa-onnx-darwin-x64 mac-arm64-metal mac-x64"
      forbidos="clipboard-linux-* clipboard-win32-* clipboard-darwin-universal reflink-linux-* reflink-win32-* sherpa-onnx-linux-* sherpa-onnx-win-* linux-* win-*"
      ;;
  esac

  for nome in $esperados; do
    if ! printf '%s\n' "$lista" | grep -qx "$nome"; then
      echo "FALHA ($alvo): variante esperada ausente em $root: $nome" >&2
      echo "variantes encontradas: $(printf '%s' "$lista" | tr '\n' ' ')" >&2
      exit 1
    fi
  done
  while IFS= read -r nome; do
    [[ -n "$nome" ]] || continue
    for pat in $forbidos; do
      # shellcheck disable=SC2254  # padrão shell-glob vindo de variável
      case "$nome" in
        $pat)
          echo "FALHA ($alvo): variante estrangeira empacotada em $root: $nome" >&2
          exit 1
          ;;
      esac
    done
  done <<<"$lista"
  echo "OK   ($alvo): variantes nativas corretas em $root"
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
      gerar_deb
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
