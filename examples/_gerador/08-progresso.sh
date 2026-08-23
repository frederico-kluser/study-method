#!/usr/bin/env bash
# 08-progresso.sh — a evidencia de proficiencia, um evento por vez.
#
# docs/04-proficiencia.md: "A entrada e SEMPRE um evento observavel; nunca 'o estado novo'."
# Nenhum estado e informado aqui: proficiency_state, state_reason, confidence e interval_days
# saem da maquina T1..T8 dentro de progress-update.sh.
. "$(cd -- "$(dirname -- "$0")" && pwd -P)/00-env.sh"
SID="$(jq -r .setup_id "$SETUP/setup.json")"

evento() { # <arquivo-json>
  echo "--- evento: $(jq -c '{concept_id,kind,session_id,result,hint_level,error_type,observed_at}' "$1")"
  "$S/progress-update.sh" "$SETUP" --event "$1"
}

mkdir -p "$WORK/eventos"
write_ev() { # <n> <json>
  printf '%s\n' "$2" | jq --arg sid "$SID" '. + {setup_id: $sid}' > "$WORK/eventos/$1.json"
}

write_ev 01 '{"schema_version":"1.0","kind":"challenge","concept_id":"derivada_como_taxa","session_id":"0002","challenge_id":"0001","result":"passed","hint_level":0,"error_type":"none","attempts":2,"observed_at":"2026-07-13","recorded_at":"2026-07-13T19:45:00-03:00","note":"Passou os cenarios afim/quadratica/constante do desafio 0001 sem dica, depois de corrigir sozinho o lambda."}'
write_ev 02 '{"schema_version":"1.0","kind":"challenge","concept_id":"derivada_como_taxa","session_id":"0003","challenge_id":"0001","result":"passed","hint_level":0,"error_type":"none","attempts":1,"observed_at":"2026-07-21","recorded_at":"2026-07-21T19:58:00-03:00","note":"Refez o desafio 0001 do zero, sem consulta e sem dica, oito dias depois."}'
write_ev 03 '{"schema_version":"1.0","kind":"challenge","concept_id":"regra_da_potencia","session_id":"0004","challenge_id":"0001","result":"passed","hint_level":0,"error_type":"none","attempts":1,"observed_at":"2026-08-04","recorded_at":"2026-08-04T19:40:00-03:00","note":"Usou 3*x**2 como conferencia analitica da saida numerica, sem que eu pedisse."}'
write_ev 04 '{"schema_version":"1.0","kind":"challenge","concept_id":"derivada_numerica","session_id":"0004","challenge_id":"0001","result":"passed","hint_level":3,"error_type":"slip","attempts":4,"observed_at":"2026-08-04","recorded_at":"2026-08-04T19:42:00-03:00","note":"Verde no runner na quarta execucao, com os tres degraus da escada de dicas no cenario da cubica."}'
write_ev 05 '{"schema_version":"1.0","kind":"challenge","concept_id":"erro_numerico","session_id":"0004","challenge_id":"0001","result":"failed","hint_level":2,"error_type":"conceptual","attempts":3,"observed_at":"2026-08-04","recorded_at":"2026-08-04T19:44:00-03:00","note":"Sustentou em dois contextos diferentes que aumentar a precisao do tipo elimina o cancelamento."}'
write_ev 06 '{"schema_version":"1.0","kind":"challenge","concept_id":"regra_da_potencia","session_id":"0005","challenge_id":"0001","result":"passed","hint_level":0,"error_type":"none","attempts":1,"observed_at":"2026-08-22","recorded_at":"2026-08-22T10:40:00-03:00","note":"Previu a derivada de x**5 antes de rodar e justificou pelo padrao que ele mesmo leu."}'
write_ev 07 '{"schema_version":"1.0","kind":"challenge","concept_id":"derivada_numerica","session_id":"0005","challenge_id":"0001","result":"passed","hint_level":0,"error_type":"none","attempts":2,"observed_at":"2026-08-22","recorded_at":"2026-08-22T10:45:00-03:00","note":"Refez o varrimento de h sozinho em casa, em Decimal, e apresentou o resultado."}'
write_ev 08 '{"schema_version":"1.0","kind":"exposure","concept_id":"regra_da_cadeia","session_id":"0005","observed_at":"2026-08-22","recorded_at":"2026-08-22T10:58:00-03:00","note":"Acompanhou um exemplo conduzido por mim; nao resolveu nenhum sozinho."}'

for f in "$WORK"/eventos/*.json; do evento "$f"; done
