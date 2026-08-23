#!/usr/bin/env bash
# gerar.sh — reproduz `examples/setup-calculo-python/` INTEIRO, do zero, rodando apenas os
# scripts de `skills/study-method/scripts/`. Nenhum artefato do exemplo é escrito à mão.
#
#   uso:  examples/_gerador/gerar.sh [<diretório de trabalho>]
#         (sem argumento: $TMPDIR/study-method-exemplo)
#
# O resultado fica em <diretório de trabalho>/setup-calculo-python/ e é byte a byte igual ao
# que está commitado, com UMA exceção: `setup_id` são 12 hex sorteados a cada `setup-init.sh`,
# então ele — e as referências a ele — mudam a cada execução.
#
# Determinismo: cada fase exporta STUDY_METHOD_TODAY e STUDY_METHOD_NOW próprios, e é por isso
# que a trajetória ocupa seis semanas de calendário em vez de um segundo de relógio de parede.
set -euo pipefail
EX="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
export SM_DEST="${1:-${SM_DEST:-${TMPDIR:-/tmp}/study-method-exemplo}}"

for fase in 01-setup 02-sessao-0001 04-sessao-0002 05-sessao-0003 06-sessao-0004 \
            07-sessao-0005 08-progresso 09-fechar-estado 10-validar; do
  printf '\n\033[1m══ %s ══\033[0m\n' "$fase"
  bash "$EX/$fase.sh"
done

printf '\n\033[1msetup gerado em: %s/setup-calculo-python\033[0m\n' "$SM_DEST"
