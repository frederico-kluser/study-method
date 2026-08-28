#!/usr/bin/env bash
# tools/check-env.sh — checagens de ambiente COMPARTILHADAS por run.sh e install.sh.
#
# Fonte única de verdade para:
#   * versão mínima do Node (≥ 22.13 — node:sqlite unflagged);
#   * criação de app/.env.local a partir do example;
#   * prova de que as dependências do app estão instaladas POR COMPLETO.
#
# Uso (a partir de run.sh / install.sh — não executa nada sozinho):
#   . "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/tools/check-env.sh"
#
# Funções:
#   require_node_ge_22_13             — sai 1 com mensagem clara se node/npm ausentes
#                                       ou Node < 22.13 (ANTES de qualquer download).
#   ensure_app_env_local APP_DIR      — cria APP_DIR/.env.local do example se faltar
#                                       (nunca sobrescreve um .env.local existente).
#   app_node_modules_ok APP_DIR       — exit 0 sse APP_DIR/node_modules/.install-ok existe.
#
# Por que node_modules/.install-ok e não só `[ -d node_modules ]`?
#   Um `npm ci` morto no meio (disco lento, queda de rede) deixa node_modules pela
#   metade — a pasta EXISTE, mas a instalação NÃO terminou. O marcador só é escrito
#   depois de um `npm ci` que retornou sucesso; sem ele, a próxima execução refaz
#   a instalação (nunca fica estado quebrado irreversível). `npm ci` remove
#   node_modules inteiro antes de instalar, então o marcador nunca sobra de um ci
#   anterior — só de um ci que terminou de verdade.

NODE_MIN_MAJOR=22
NODE_MIN_MINOR=13

# node/npm presentes e Node ≥ 22.13. Sai 1 com mensagem clara; nunca baixa nada.
require_node_ge_22_13() {
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "erro: faltam node/npm no PATH (o app exige Node ≥ ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}, npm ≥ 11). Instale e rode de novo." >&2
    exit 1
  fi
  local node_ok
  node_ok="$(node -p "const [m,n]=process.versions.node.split('.').map(Number); m>${NODE_MIN_MAJOR}||(m===${NODE_MIN_MAJOR}&&n>=${NODE_MIN_MINOR}) ? 'ok' : 'old'" 2>/dev/null || echo old)"
  if [ "$node_ok" != "ok" ]; then
    echo "erro: node $(node --version) é velho demais — o app exige Node ≥ ${NODE_MIN_MAJOR}.${NODE_MIN_MINOR} (node:sqlite unflagged)." >&2
    exit 1
  fi
}

# Cria $1/.env.local a partir de $1/.env.local.example quando o primeiro faltar.
# Nunca sobrescreve um .env.local existente. Sem example: no-op.
ensure_app_env_local() {
  local app_dir="$1"
  if [ -f "$app_dir/.env.local.example" ] && [ ! -e "$app_dir/.env.local" ]; then
    cp -- "$app_dir/.env.local.example" "$app_dir/.env.local"
    echo "aviso: criei $app_dir/.env.local a partir do example — preencha as chaves (DEEPSEEK_API_KEY e BRAVE_API_KEY)."
  fi
}

# Exit 0 sse a instalação das dependências do app foi CONCLUÍDA (marcador presente).
app_node_modules_ok() {
  local app_dir="$1"
  [ -f "$app_dir/node_modules/.install-ok" ]
}
