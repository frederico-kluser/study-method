#!/usr/bin/env bash
# install.sh — instala a Agent Skill `study-method` no diretório de skills do seu agente.
#
# O que ele faz, e SÓ isso:
#   1. confere que a origem existe e tem SKILL.md;
#   2. confere que o campo `name:` do frontmatter BATE com o nome do diretório — se não bater, a
#      skill não carrega, e é melhor parar aqui do que você descobrir depois;
#   3. cria o diretório de skills se faltar (modo 0700);
#   4. copia (default) ou aponta um symlink (--symlink);
#   5. diz o que fez, e o que não fez.
#
# O que ele NÃO faz: rede, download, `sudo`, mexer em PATH, em ~/.bashrc ou em config do sistema.
# Nada é sobrescrito sem confirmação.
#
# Uso:
#   ./install.sh [--symlink] [--force] [--dry-run] [--prefix <dir-de-skills>] [--quiet]
#   ./install.sh --uninstall [--force] [--dry-run] [--prefix <dir-de-skills>]
#   ./install.sh --help
#
# Env:
#   CLAUDE_SKILLS_DIR   diretório de skills (default: ~/.claude/skills)
#
# Exit: 0 ok (inclusive "nada a fazer") · 1 erro · 2 uso incorreto · 3 origem inválida
set -euo pipefail

SELF_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="study-method"
SRC="$SELF_DIR/skills/$SKILL_NAME"

MODE="install"
LINK=0
FORCE=0
DRY=0
QUIET=0
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

say()  { [ "$QUIET" -eq 1 ] || printf '%s\n' "$*"; }
warn() { printf '%s\n' "$*" >&2; }
die()  { printf 'erro: %s\n' "$2" >&2; exit "$1"; }
run()  { if [ "$DRY" -eq 1 ]; then printf '  [dry-run] %s\n' "$*"; else "$@"; fi; }

usage() { sed -n '2,23p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)   usage; exit 0 ;;
    --symlink)   LINK=1 ;;
    --force|-f)  FORCE=1 ;;
    --dry-run|-n) DRY=1 ;;
    --quiet|-q)  QUIET=1 ;;
    --uninstall) MODE="uninstall" ;;
    --prefix)    [ $# -ge 2 ] || die 2 "--prefix precisa de um diretório"; SKILLS_DIR="$2"; shift ;;
    --prefix=*)  SKILLS_DIR="${1#--prefix=}" ;;
    *)           die 2 "argumento desconhecido «$1». Veja --help." ;;
  esac
  shift
done

DEST="$SKILLS_DIR/$SKILL_NAME"

[ "$DRY" -eq 1 ] && say "MODO --dry-run: nada será escrito. O que segue é o que ACONTECERIA."

# ─────────────────────────────────────────────────────────────────── desinstalação
if [ "$MODE" = "uninstall" ]; then
  if [ ! -e "$DEST" ] && [ ! -L "$DEST" ]; then
    say "Nada a fazer: não há nada em $DEST."
    exit 0
  fi
  kind="diretório"
  [ -L "$DEST" ] && kind="symlink -> $(readlink -- "$DEST")"
  # Guarda: só removemos o que é reconhecivelmente esta skill.
  if [ ! -L "$DEST" ] && ! grep -qxF "name: $SKILL_NAME" "$DEST/SKILL.md" 2>/dev/null; then
    warn "recusando remover $DEST: não parece a skill $SKILL_NAME"
    warn "  (não achei a linha «name: $SKILL_NAME» em $DEST/SKILL.md)"
    warn "  remova à mão se for isso mesmo que você quer."
    exit 1
  fi
  if [ "$FORCE" -eq 0 ] && [ "$DRY" -eq 0 ]; then
    if [ -t 0 ]; then
      printf 'Remover %s (%s)? [s/N] ' "$DEST" "$kind"
      read -r ans
      case "$ans" in s|S|y|Y|sim|SIM) ;; *) say "Cancelado. Nada foi removido."; exit 0 ;; esac
    else
      warn "sem terminal interativo: use --force para remover $DEST"
      exit 1
    fi
  fi
  run rm -rf -- "$DEST"
  say "Removido: $DEST ($kind)"
  say "Nada mais foi tocado. Seus setups de estudo e o STUDY_METHOD_HOME continuam onde estavam —"
  say "esta skill nunca apaga dado seu."
  exit 0
fi

# ───────────────────────────────────────────────────────── verificação da origem
[ -d "$SRC" ]           || die 3 "não achei a skill em $SRC (rode a partir do clone do repositório)"
[ -f "$SRC/SKILL.md" ]  || die 3 "não achei $SRC/SKILL.md"

# O `name` do frontmatter TEM que bater com o nome do diretório, senão a skill não carrega.
# Leitura por sed, sem YAML parser: o frontmatter é `chave: valor`, uma linha, sem aspas.
FM_NAME="$(sed -n '/^---[[:space:]]*$/,/^---[[:space:]]*$/p' "$SRC/SKILL.md" \
           | sed -n 's/^name:[[:space:]]*\([^[:space:]]*\)[[:space:]]*$/\1/p' | head -1)"
if [ -z "$FM_NAME" ]; then
  die 3 "não achei o campo «name:» no frontmatter de $SRC/SKILL.md"
fi
if [ "$FM_NAME" != "$SKILL_NAME" ]; then
  warn "erro: o frontmatter diz «name: $FM_NAME», mas o diretório é «$SKILL_NAME»."
  warn "  Uma Agent Skill só carrega quando os dois são iguais. Corrija um dos dois antes de instalar."
  exit 3
fi
say "Origem verificada: $SRC (frontmatter name: $FM_NAME — bate com o diretório)"

# ──────────────────────────────────────────────────────────── destino já ocupado
already_identical() {
  if [ "$LINK" -eq 1 ]; then
    [ -L "$DEST" ] && [ "$(readlink -- "$DEST")" = "$SRC" ]
  else
    [ -d "$DEST" ] && [ ! -L "$DEST" ] && diff -r -q -- "$SRC" "$DEST" >/dev/null 2>&1
  fi
}

if already_identical; then
  say "Nada a fazer: $DEST já é exatamente o que seria instalado."
  exit 0
fi

if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  if [ -L "$DEST" ]; then
    say "Já existe um symlink em $DEST -> $(readlink -- "$DEST")"
  else
    say "Já existe um diretório em $DEST"
    if [ -f "$DEST/SKILL.md" ]; then
      n_diff="$(diff -r -q -- "$SRC" "$DEST" 2>/dev/null | wc -l || true)"
      say "  (é uma skill instalada; $n_diff diferença(s) em relação a esta origem)"
    else
      say "  (não tem SKILL.md — não parece uma skill instalada)"
    fi
  fi
  if [ "$FORCE" -eq 0 ] && [ "$DRY" -eq 0 ]; then
    if [ -t 0 ]; then
      printf 'Substituir? [s/N] '
      read -r ans
      case "$ans" in s|S|y|Y|sim|SIM) ;; *) say "Cancelado. Nada foi alterado."; exit 0 ;; esac
    else
      warn "sem terminal interativo e o destino já existe: use --force para substituir."
      warn "  destino: $DEST"
      exit 1
    fi
  fi
  run rm -rf -- "$DEST"
fi

# ──────────────────────────────────────────────────────────────────── instalação
if [ ! -d "$SKILLS_DIR" ]; then
  run mkdir -p -- "$SKILLS_DIR"
  run chmod 700 -- "$SKILLS_DIR"
  say "Criado: $SKILLS_DIR"
fi

if [ "$LINK" -eq 1 ]; then
  run ln -s -- "$SRC" "$DEST"
  say "Instalado por symlink: $DEST -> $SRC"
  say "  (editar o clone passa a valer na hora; mover o clone quebra o link)"
else
  run cp -R -- "$SRC" "$DEST"
  say "Instalado por cópia: $DEST"
  say "  (para desenvolver no clone e ver a mudança na hora, use --symlink)"
fi

say ""
say "Feito. O que NÃO foi tocado: PATH, ~/.bashrc, config do sistema, nada fora de $SKILLS_DIR."
say "Nenhum download foi feito: se faltar algo (bash, python3, jq, bubblewrap), a skill diz na hora."
say ""
say "Confira de onde a skill vai carregar — uma skill pessoal vence uma de projeto de mesmo nome:"
say "  ls -la $DEST"
say "Para remover:  $0 --uninstall"
