#!/usr/bin/env bash
# tools/estado-dos-cursos.sh — O ESTADO MEDIDO DE TODOS OS CURSOS, num comando.
#
# Por que este arquivo existe. O `CONTRIBUTING.md` manda: "todo número que aparece
# em documento, README ou mensagem ao aluno tem que ser reproduzível por um
# comando". Até 2026-09-22 esse comando não existia para a pergunta mais básica do
# produto — **os cursos estão prontos?** — e a consequência foi medida: o
# `c-iniciante` tinha 113 das 115 aulas em esqueleto (teoria placeholder, zero
# quiz, zero desafio) e os cinco gates que rodam offline saíam TODOS exit 0, porque
# cada um iterava DESAFIOS (havia 2) e nenhum perguntava se a aula tem conteúdo.
#
# Este script não inventa gate nenhum: ele RODA os que existem, na ordem certa,
# com o ambiente certo, e imprime uma linha por curso. O veredito continua sendo
# de quem mede.
#
# Uso:
#   bash tools/estado-dos-cursos.sh              # todos os cursos de resources/tracks
#   bash tools/estado-dos-cursos.sh rust-iniciante
#   SEM_EXECUCAO=1 bash tools/estado-dos-cursos.sh   # pula os gates que spawnam runner
#
# Os seis gates, na ordem em que rodam: `audit` (orçamento + a barra mesclada),
# `barra` (A17–A24, a pedagogia), `requirements` (bijeção), `coverage` (o código
# mínimo que passa), `track:validate` (as quatro provas por desafio) e
# `convergir` (o ponto fixo do laço de entrega). Para o `c-iniciante`, mais o
# guard do contrato contra o disco (`check-trilha-c.mjs`, D1–D7).
#
# Exit: 0 quando TODO curso medido está verde nos gates de leitura (audit, barra,
# requirements) e nos de execução quando eles rodaram; 1 quando algum reprova; 2 em
# erro de uso ou de ambiente. Gate que NÃO PÔDE rodar é impresso como
# `nao-medido` — e `nao-medido` NUNCA conta como verde (docs/16 §9.3, fail-closed).
set -uo pipefail

REPO="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$REPO/app"
TRACKS="$APP/resources/tracks"

if [ ! -d "$TRACKS" ]; then
    printf 'erro: %s não existe (rode a partir do clone do repositório)\n' "$TRACKS" >&2
    exit 2
fi

# O cargo do Homebrew é KEG-ONLY (medido em 2026-09-22): os shims ficam em
# $(brew --prefix rustup)/bin e NÃO entram no PATH sozinhos. Sem isto, todo gate
# de execução de uma trilha rust reprova por AMBIENTE — e reprovação por ambiente
# não é sinal sobre o curso.
if command -v brew >/dev/null 2>&1; then
    _rustup_prefix="$(brew --prefix rustup 2>/dev/null || true)"
    if [ -n "${_rustup_prefix:-}" ] && [ -d "$_rustup_prefix/bin" ]; then
        PATH="$_rustup_prefix/bin:$PATH"
        export PATH
    fi
fi

slugs=("$@")
if [ ${#slugs[@]} -eq 0 ]; then
    while IFS= read -r d; do
        [ -f "$d/track.json" ] && slugs+=("$(basename "$d")")
    done < <(find "$TRACKS" -mindepth 1 -maxdepth 1 -type d | sort)
fi

if [ ${#slugs[@]} -eq 0 ]; then
    printf 'erro: nenhum curso em %s\n' "$TRACKS" >&2
    exit 2
fi

vermelho=0

# pad <texto> <largura> — alinhamento por CARACTERE, não por byte. `printf %-34s`
# conta BYTES, e rótulo em pt-BR tem acento: "orçamento" ocupa 9 caracteres e 10
# bytes, e a coluna sai torta. Em bash ≥ 4 com locale UTF-8, `${#var}` conta
# caracteres; em bash 3.2 (macOS) conta bytes e o alinhamento degrada — a mesma
# degradação declarada que `tests/smoke.sh` já tem.
pad() {
    local texto="$1" largura="$2" n
    n=$(( largura - ${#texto} ))
    printf '%s' "$texto"
    while [ $n -gt 0 ]; do printf ' '; n=$(( n - 1 )); done
}

# roda_gate <rotulo> <comando...> — imprime "ok"/"REPROVOU (exit N)" e devolve o exit.
roda_gate() {
    local rotulo="$1"
    shift
    local saida status
    saida="$("$@" 2>&1)"
    status=$?
    if [ $status -eq 0 ]; then
        printf '    %s ok\n' "$(pad "$rotulo" 34)"
    else
        printf '    %s REPROVOU (exit %d)\n' "$(pad "$rotulo" 34)" "$status"
        printf '%s\n' "$saida" | tail -6 | sed 's/^/        /'
        vermelho=1
    fi
    return $status
}

printf '\n'
printf 'ESTADO DOS CURSOS — medido em %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
printf 'ambiente: node %s · npm %s · python3 %s · clang %s · cargo %s\n' \
    "$(node --version 2>/dev/null || echo AUSENTE)" \
    "$(npm --version 2>/dev/null || echo AUSENTE)" \
    "$(python3 --version 2>/dev/null | awk '{print $2}' || echo AUSENTE)" \
    "$(clang --version 2>/dev/null | head -1 | awk '{print $NF}' || echo AUSENTE)" \
    "$(cargo --version 2>/dev/null | awk '{print $2}' || echo AUSENTE)"
printf '\n'

for slug in "${slugs[@]}"; do
    dir="$TRACKS/$slug"
    if [ ! -f "$dir/track.json" ]; then
        printf '  %s: não é um curso (sem track.json)\n' "$slug"
        vermelho=1
        continue
    fi

    aulas=$(find "$dir" -name lesson.json | wc -l | tr -d ' ')
    desafios=$(find "$dir" -name challenge.json | wc -l | tr -d ' ')
    modulos=$(find "$dir/modules" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')
    lingua=$(sed -n 's/.*"programmingLanguage"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$dir/track.json" | head -1)

    printf '  %s (%s) — %s módulos · %s aulas · %s desafios\n' "$slug" "${lingua:-?}" "$modulos" "$aulas" "$desafios"

    ( cd "$APP" && roda_gate 'audit (orçamento + barra)' npx tsx tools/track-engine/cli.ts audit "$slug" --limite 0 ) || vermelho=1
    ( cd "$APP" && roda_gate 'barra (A17-A24, pedagogia)' npx tsx tools/track-engine/cli.ts barra "$slug" --limite 0 ) || vermelho=1
    ( cd "$APP" && roda_gate 'requirements (bijeção)' npx tsx tools/track-engine/cli.ts requirements "$slug" ) || vermelho=1

    if [ "${SEM_EXECUCAO:-0}" = "1" ]; then
        printf '    %s nao-medido (SEM_EXECUCAO=1)\n' "$(pad 'coverage (código mínimo)' 34)"
        printf '    %s nao-medido (SEM_EXECUCAO=1)\n' "$(pad 'track:validate (4 provas)' 34)"
        vermelho=1
    elif [ "$lingua" = 'rust' ] && ! command -v cargo >/dev/null 2>&1; then
        printf '    %s nao-medido (sem cargo no PATH)\n' "$(pad 'coverage (código mínimo)' 34)"
        printf '    %s nao-medido (sem cargo no PATH)\n' "$(pad 'track:validate (4 provas)' 34)"
        printf '        instale e re-exporte: bash skills/study-method/scripts/_ensure-toolchain.sh --ensure --language rust\n'
        vermelho=1
    else
        ( cd "$APP" && roda_gate 'coverage (código mínimo)' npx tsx tools/track-engine/cli.ts coverage "$slug" ) || vermelho=1
        ( cd "$APP" && roda_gate 'track:validate (4 provas)' npx tsx tools/track-cli.ts track:validate "$slug" ) || vermelho=1
    fi

    if [ "$slug" = 'c-iniciante' ]; then
        ( cd "$REPO" && roda_gate 'contrato C × disco (D1-D7)' node tools/check-trilha-c.mjs ) || vermelho=1
    fi

    # O SEXTO GATE, e o que fecha a entrega: o laço. Ele só sai 0 em PONTO-FIXO
    # (achados vazios E nada aplicado), e é a pergunta que os outros cinco não
    # fazem — "isto está pronto, ou só passou uma vez?". Em dry-run ele não
    # escreve conteúdo; escreve UMA linha no ledger de convergência do curso.
    ( cd "$APP" && roda_gate 'convergir (ponto fixo do laço)' npx tsx tools/track-engine/cli.ts convergir "$slug" --limite 0 ) || vermelho=1
    printf '\n'
done

if [ $vermelho -eq 0 ]; then
    printf 'VERDE: todos os cursos medidos passaram em todos os gates que rodaram.\n\n'
    exit 0
fi

printf 'VERMELHO: há curso reprovado ou gate não medido — e não medido nunca conta como verde.\n\n'
exit 1
