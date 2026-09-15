#!/usr/bin/env bash
# install.sh — instala o projeto study-method INTEIRO, sempre, com um comando. Sem flags.
# IDEMPOTENTE: rodar de novo com tudo instalado não refaz nada (skill idêntica não é
# recopiada; npm ci só roda se as dependências não estiverem instaladas; .env.local
# só é criado se faltar). A segunda execução é rápida.
#
# Faz, nesta ordem:
#   1. skills — instala TODAS as skills de skills/*/ em <repo>/.claude/skills/ (skills de
#      PROJETO do Claude Code) por cópia do clone (uma por uma, só recopia se o destino
#      DIFERIR da origem — comparação conteúdo a conteúdo; sem rede, sem sudo, sem tocar em
#      PATH, ~/.bashrc ou config do sistema; NADA é escrito fora do repositório — a variável
#      CLAUDE_SKILLS_DIR continua aceita como override do destino);
#   2. app — cria app/.env.local a partir de app/.env.local.example se faltar
#      (chaves vazias — você preenche; o .env.local é gitignored);
#   3. app — roda `npm ci` em app/ se as dependências NÃO estiverem instaladas
#      (a ÚNICA parte com download; o .npmrc do app libera os postinstall de
#      esbuild/electron que o build exige). Um npm ci morto no meio não deixa
#      estado quebrado irreversível: sem o marcador node_modules/.install-ok,
#      a próxima execução refaz a instalação.
#
# Depois, rode o projeto com:  ./run.sh
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=tools/check-env.sh
. "$SELF_DIR/tools/check-env.sh"

# Destino das skills: LOCAL ao repositório. Nada é escrito em $HOME (nem ~/.claude,
# nem ~/.agents) — skills de projeto carregam de .claude/skills/ na raiz do clone, e o
# clone fica autossuficiente. CLAUDE_SKILLS_DIR sobrescreve (para testes ou gosto).
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$SELF_DIR/.claude/skills}"
APP="$SELF_DIR/app"

# Exit 0 sse todo arquivo de $1 existe em $2 com conteúdo idêntico (cobertura da
# origem). Arquivos que existem só em $2 são ignorados de propósito: extras no
# destino não podem forçar recópia (recopiar por recopiar). Portável (bash 3.2,
# find/sort/sed/cmp do macOS e Linux).
src_installed_in() {
  local src="$1" dest="$2"
  local rel
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    [ -f "$dest/$rel" ] || return 1
    cmp -s -- "$src/$rel" "$dest/$rel" || return 1
  done < <(cd "$src" && find . -type f | sed 's#^\./##' | sort)
  return 0
}

# Instala UMA skill: $1 é o diretório da skill na origem (skills/<nome>/). O nome
# vem do diretório — e o frontmatter TEM que bater com ele, senão a skill não carrega.
install_skill() {
  local src="$1"
  local skill_name dest fm_name
  skill_name="$(basename -- "$src")"
  dest="$SKILLS_DIR/$skill_name"

  [ -f "$src/SKILL.md" ] || { echo "erro: não achei $src/SKILL.md" >&2; exit 1; }

  fm_name="$(sed -n '/^---[[:space:]]*$/,/^---[[:space:]]*$/p' "$src/SKILL.md" \
             | sed -n 's/^name:[[:space:]]*\([^[:space:]]*\)[[:space:]]*$/\1/p' | head -1)"
  if [ "$fm_name" != "$skill_name" ]; then
    echo "erro: o frontmatter diz «name: $fm_name», mas o diretório é «$skill_name»." >&2
    echo "  Uma Agent Skill só carrega quando os dois são iguais. Corrija um dos dois." >&2
    exit 1
  fi

  if [ -e "$dest" ] || [ -L "$dest" ]; then
    # Guarda: só removemos o que é reconhecivelmente esta skill.
    if [ ! -L "$dest" ] && ! grep -qxF "name: $skill_name" "$dest/SKILL.md" 2>/dev/null; then
      echo "erro: $dest existe e não parece a skill $skill_name — remova à mão e rode de novo." >&2
      exit 1
    fi
    # Idempotência: se todo arquivo da origem já está no destino com o mesmo
    # conteúdo, nada a copiar (arquivos extras no destino NÃO forçam recópia —
    # senão qualquer arquivo solto no destino faria recopiar por recopiar).
    if src_installed_in "$src" "$dest"; then
      echo "Skill: já instalada em $dest (origem íntegra no destino — nada a copiar)."
    else
      rm -rf -- "$dest"
      cp -R -- "$src" "$dest"
      echo "Skill: instalada por cópia em $dest"
    fi
  else
    cp -R -- "$src" "$dest"
    echo "Skill: instalada por cópia em $dest"
  fi
}

# ───────────────────────────────────────────────────────────── 1. skills (idempotente)
shopt -s nullglob
skill_dirs=("$SELF_DIR"/skills/*/)
[ "${#skill_dirs[@]}" -gt 0 ] || {
  echo "erro: não achei nenhuma skill em $SELF_DIR/skills/*/ (rode a partir do clone)." >&2
  exit 1
}

# Destino LOCAL (dentro do repositório): herdando as permissões do clone não há segredo
# a proteger (nada de chave/estado do usuário aqui) — só cria o diretório, sem chmod
# especial. O chmod 700 só fazia sentido quando o destino era ~/.claude/skills/.
[ -d "$SKILLS_DIR" ] || mkdir -p -- "$SKILLS_DIR"

for skill_dir in "${skill_dirs[@]}"; do
  install_skill "$skill_dir"
done

# ───────────────────────────────────────────────────────────── 2. app: chaves
ensure_app_env_local "$APP"

# ───────────────────────────────────────────────────────────── 3. app: dependências
if [ ! -f "$APP/package.json" ] || [ ! -f "$APP/package-lock.json" ]; then
  echo "erro: não achei $APP/package.json + package-lock.json" >&2
  exit 1
fi
require_node_ge_22_13

if app_node_modules_ok "$APP"; then
  echo "App: dependências já instaladas em $APP/node_modules (nada a baixar)."
else
  echo "App: instalando dependências (npm ci — baixa pacotes; pode levar alguns minutos)..."
  npm --prefix "$APP" ci
  # Marcador de instalação COMPLETA — sem ele, a próxima execução refaz o ci.
  touch "$APP/node_modules/.install-ok"
  echo "App: dependências instaladas em $APP/node_modules."
fi

echo ""
echo "Pronto. Skills instaladas em $SKILLS_DIR (local ao repositório); dependências do app em $APP/node_modules."
echo "Rode o projeto com:  $SELF_DIR/run.sh"
