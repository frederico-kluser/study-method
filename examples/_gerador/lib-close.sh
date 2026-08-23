# fechar_sessao <NNNN> <valores.json> — roda o ciclo REQUEST/APPLY de verdade.
fechar_sessao() {
  local nnnn="$1" vals="$2" req="$WORK/req-$1.json" resp="$WORK/resp-$1.json" rc=0
  "$S/session-close.sh" "$SETUP" --session "$nnnn" > "$req" 2>"$WORK/err-$1.txt" || rc=$?
  if [ "$rc" != 10 ]; then
    echo "ERRO: session-close.sh saiu $rc (esperado 10 = needs_model_input)" >&2
    cat "$WORK/err-$1.txt" >&2; cat "$req" >&2; return 1
  fi
  echo "  [$nnnn] PEDIDO kind=$(jq -r .kind "$req") missing=$(jq -c '[.payload.missing_fields[].field]' "$req")"
  python3 "$EX/lib-close.py" "$req" "$vals" > "$resp"
  "$S/session-close.sh" "$SETUP" --session "$nnnn" --apply "$resp"
}
