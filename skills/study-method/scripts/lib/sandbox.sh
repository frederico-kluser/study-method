# shellcheck shell=bash
# lib/sandbox.sh — STUB DE CONTRATO (COMMIT PREP onda 3).
# Contrato em docs/00-contratos.md §7.3; garantias G1..G9 em docs/11-seguranca-privacidade.md §2.
# Valem LIB-1..LIB-6.
# Pilha canônica, de fora para dentro (a ordem NÃO pode ser invertida; cada camada é sondada antes):
#   timeout -s KILL -k 5
#     -> systemd-run --user --scope -p MemoryMax -p MemorySwapMax=0 -p TasksMax=128
#       -> unshare --user --net --pid --fork --map-current-user
#         -> bash -c 'ulimit -t … -f …; cd "$1" || exit 66; shift; exec "$@"'
# VERIFICADO: `timeout` SEM -s KILL não erra o código — ele TRAVA dentro desta pilha (o sinal não
# propaga). Detecção de timeout é por TEMPO DECORRIDO, nunca por exit code.
# VERIFICADO: probe_bwrap exige os 4 --symlink (usr/bin, usr/sbin, usr/lib, usr/lib64); sem
# /lib64 o loader ELF não é encontrado em x86-64 e a sonda falha silenciosamente.

sm_sandbox_probe() { :; }         # -> JSON {timeout,cpu,pidns,netns,memcg,fs_confine,docker} | 0. Cacheado por sessão.
sm_sandbox_report() { :; }        # -> 1 linha pt-BR para o aluno | 0. Dita UMA vez por setup.
sm_sandbox_run() { :; }           # <challenge_dir> -- <argv...> -> stdout/stderr do comando; exit code BRUTO preservado
sm_sandbox_classify_exit() { :; } # <code> <elapsed> <wall> -> passed|failed|timeout|oom|cpu|infra | 0 (desambigua o 137)
