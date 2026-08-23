# 50 — Sandbox e detecção de toolchains

Fragmento do BUILD_SPEC. Cobre `SK/scripts/lib/sandbox.sh` e `SK/scripts/detect-toolchains.sh`.
Contrato, não racional: o porquê vive em `docs/11-seguranca-privacidade.md` §2 (garantias G1..G9) e
em `docs/00-contratos.md` §5 e §7.3.

---

## 1. `lib/sandbox.sh` — as quatro funções

Arquivo `0644`, sem shebang, **apenas `source`** (LIB-1). Prefixo `sm_`/`SM_` (LIB-2). Log sempre em
stderr (LIB-3) — delegado a `sm_log` de `lib/common.sh` quando essa função existe, senão escrito
direto. Nenhum `exit` (LIB-4). Roda sob `set -u` e **não quebra** sob `set -e` (LIB-5).

| Função | Argumentos | stdout | Exit code |
|---|---|---|---|
| `sm_sandbox_probe` | `[--force] [--detail]` | JSON das 7 capacidades | `0` sempre |
| `sm_sandbox_report` | `[--once <setup_root>] [--force]` | uma linha em pt-BR | `0` sempre |
| `sm_sandbox_run` | `<challenge_dir> [opções] -- <argv…>` | stdout/stderr do comando | o exit **bruto** do comando · `2` uso incorreto · `66` sandbox não montável |
| `sm_sandbox_classify_exit` | `<code> <elapsed> <wall> [<oom_kill>]` | `passed\|failed\|timeout\|oom\|cpu\|infra` | `0` sempre |

### 1.1 `sm_sandbox_probe`

Saída sem `--detail` — exatamente estas 7 chaves, nesta ordem:

```json
{"timeout":"coreutils_timeout","cpu":true,"pidns":true,"netns":true,"memcg":true,"fs_confine":"bwrap","docker":true}
```

- `timeout` — `coreutils_timeout` · `coreutils_gtimeout` · `perl_alarm` · `none` (casa o enum
  `timeout_source` de `docs/00-contratos.md` §4.1).
- `cpu`, `pidns`, `netns`, `memcg`, `docker` — booleanos.
- `fs_confine` — `bwrap` · `none`.

Com `--detail` sai o documento inteiro, que é também o formato do cache:
`schema`, `host`, `platform`, `capabilities{…7…}`, `detail{unshare_map, oom_policy, bwrap_bind_style}`.

**Cache**: em memória (`SM_SANDBOX_PROBE_DOC`) e em disco, em
`${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}/sandbox-probe.json`
(sobrescrevível por `SM_SANDBOX_CACHE`). O cache é descartado quando `schema` ou `host` divergem.
`--force` re-sonda e regrava.

**As sondas** (todas silenciosas, todas "roda um no-op"):

| Capacidade | Sonda |
|---|---|
| `timeout` | `command -v timeout` → `gtimeout` → `perl` |
| `cpu` | `( ulimit -t 3600 && ulimit -f 65536 )` numa subshell |
| `unshare_map` | `unshare --user --map-current-user -- true`; fallback `--map-root-user` |
| `pidns` | `unshare --user --pid --fork <map> -- true` |
| `netns` | `unshare --user --net <map> -- true` |
| `memcg` | `systemd-run --user --scope -q -p MemoryMax=64M -p MemorySwapMax=0 -p TasksMax=64 /bin/true` |
| `oom_policy` | a mesma, mais `-p OOMPolicy=continue` |
| `fs_confine` | `bwrap --unshare-all --ro-bind /usr /usr` + **os quatro** `--symlink` → fallback `--ro-bind-try` |
| `docker` | `timeout -s KILL -k 2 5 docker info` |

### 1.2 `sm_sandbox_report`

Uma linha, em pt-BR, dita ao aluno. Sem argumento imprime sempre; com `--once <setup_root>`
imprime só na primeira vez por setup (marcador em `$STUDY_METHOD_HOME/reported/`) e devolve stdout
vazio depois. `--force` ignora o marcador.

Forma canônica, quatro itens:

```
Sandbox: tempo OK · memória OK (cgroup) · rede isolada OK · escrita confinada NÃO (instale bubblewrap ou use --docker)
```

| Item | Valores possíveis |
|---|---|
| tempo | `OK` · `OK (gtimeout)` · `OK (perl alarm)` · `SÓ de CPU (ulimit -t; loop que dorme não é morto)` · `NÃO` |
| memória | `OK (cgroup)` · `parcial (ulimit -v, só C/C++/Python/Go)` · `NÃO` |
| rede isolada | `OK` · `NÃO (só variáveis de proxy: lombada, não muro)` |
| escrita confinada | `OK (bubblewrap)` · `NÃO (rode com --docker para confinar)` · `NÃO (instale bubblewrap ou use --docker)` |

Um quinto item, `· netos NÃO contidos (pode sobrar processo após o teste)`, é inserido **antes** do
item de escrita **somente quando é má notícia** (sem PID namespace e sem bwrap). A linha só cresce
para declarar o que não está protegido; nunca para se elogiar.

### 1.3 `sm_sandbox_run`

Opções, todas opcionais, entre `<challenge_dir>` e `--`; cada uma com env equivalente:

| Opção | Env | Default |
|---|---|---|
| `--wall N` | `SM_SANDBOX_WALL` | `30` s |
| `--cpu N` | `SM_SANDBOX_CPU` | `wall + 5` s |
| `--mem V` | `SM_SANDBOX_MEM` | `512M` |
| `--fsize N` | `SM_SANDBOX_FSIZE` | `65536` blocos de 1024 B = 64 MB (§5.4) |
| `--tasks N` | `SM_SANDBOX_TASKS` | `512` (ver §3) |
| `--phase P` | `SM_SANDBOX_PHASE` | `test` (sem rede) · `prepare` (com rede) |
| `--language L` | `SM_SANDBOX_LANGUAGE` | vazio; decide se `ulimit -v` pode entrar |
| `--mode M` | `SM_SANDBOX_MODE` | `posix_floor` · `docker_strict` · `none` |
| `--image I` | `SM_SANDBOX_IMAGE` | — |

`SM_SANDBOX_CONSENT=1` é **exigido** para rodar sem relógio ou com `--mode none`; sem ele a função
devolve `66` e explica em stderr. `SM_SANDBOX_BIND_RO="a:b"` acrescenta binds read-only no bwrap.

Depois da execução ficam definidos, **no shell do chamador** (portanto: não invoque `sm_sandbox_run`
dentro de `$( )`, ou os valores se perdem na subshell):

`SM_SANDBOX_LAST_EXIT` · `SM_SANDBOX_LAST_ELAPSED` (segundos, 3 casas) · `SM_SANDBOX_LAST_WALL` ·
`SM_SANDBOX_LAST_OOM` (`0|1|unknown`) · `SM_SANDBOX_LAST_LAYERS` (csv das camadas aplicadas) ·
`SM_SANDBOX_LAST_TIMEOUT_SOURCE` · `SM_SANDBOX_LAST_MODE`.

### 1.4 `sm_sandbox_classify_exit`

```
0                       -> passed
66                      -> infra
124|137|142|143|152     -> familia "morte por limite", decidida abaixo
153                     -> failed  (SIGXFSZ: estourou ulimit -f; aviso em stderr)
qualquer outro          -> failed
```

Dentro da família:

1. `elapsed + 0,05 s >= wall` → **timeout**;
2. `124` → **timeout** (e avisa que a pilha foi montada sem `-s KILL`); `142` → **timeout**;
3. `oom_kill > 0` → **oom**;
4. `143` com cgroup ativo e sem `OOMPolicy=continue` → **oom**;
5. senão → **cpu**.

Códigos de saída normal (`1`, `2`, `101`, `134`…) **nunca** viram timeout, por mais lento que o
processo tenha sido: um processo que saiu sozinho não foi morto. É o que impede o `134` do
`assert.h` de virar timeout por acidente.

---

## 2. A pilha canônica, camada a camada

De fora para dentro. Cada camada é sondada antes de entrar e **pulada** se faltar. A ordem não pode
ser invertida.

```bash
timeout -s KILL -k 5 "$WALL"                                   # G1
  systemd-run --user --scope -q                                # G7/G8
    -p MemoryMax="$MEM" -p MemorySwapMax=0
    -p TasksMax="$TASKS" -p OOMPolicy=continue
    bash -c '<wrapper>' _ "$STATEFILE" "$KILLGRP" "$READCG"     # leitor de OOM / matador de grupo
      bwrap --die-with-parent --unshare-all …                   # G3/G4/G6   (preferido)
      unshare --user --net --pid --fork --map-current-user --   # G3/G4      (sem bwrap)
        bash -c 'ulimit -t "$1"; ulimit -f "$2";
                 [ "$3" = - ] || ulimit -v "$3";
                 cd "$4" || exit 66; shift 4; exec "$@"'        # G2/G9/G5
```

**Por que o wrapper existe**: é o único ponto que está **dentro** do cgroup e **fora** dos
namespaces. Ali, depois que o comando morre, dá para ler `memory.events` do próprio cgroup — que é o
que desambigua o 137 — e matar o grupo de processos quando não há PID namespace. Ele preserva stdin
(fd 8) e o exit code bruto, e silencia o stderr do `wait` só para suprimir a linha `Morto`/`Killed`
que o bash imprime ao reapear um filho morto por sinal.

**Restrição do wrapper**: nenhuma chave `${…}` pode aparecer no texto do snippet. Ele viaja como
argumento do `systemd-run`, e o systemd expande `${VAR}` na linha de comando antes de executar.

**Camada bwrap** — quando `fs_confine=bwrap`, o `bwrap` substitui o `unshare` (o `--unshare-all` já
traz user, pid, net, mount e ipc) e o `cd` interno passa a ser `/work`:

```
bwrap --die-with-parent --unshare-all [--share-net na fase prepare]
      --ro-bind /usr /usr
      --symlink usr/bin /bin --symlink usr/sbin /sbin
      --symlink usr/lib /lib --symlink usr/lib64 /lib64      (ou --ro-bind-try, ver §3)
      --ro-bind-try /etc /etc --ro-bind-try /opt /opt
      --proc /proc --dev /dev --tmpfs /tmp
      --setenv HOME /tmp --setenv XDG_CACHE_HOME /tmp/.cache --setenv TMPDIR /tmp
      [--ro-bind <dir do binário> /sm/bin]
      [--ro-bind $HOME/.cargo /sm/cargo      --setenv CARGO_HOME  /sm/cargo]
      [--ro-bind $HOME/.rustup /sm/rustup    --setenv RUSTUP_HOME /sm/rustup]
      [--ro-bind $HOME/go/pkg/mod /sm/gomodcache --setenv GOMODCACHE /sm/gomodcache]
      [--ro-bind $HOME/.npm /sm/npm          --setenv npm_config_cache /sm/npm]
      --setenv PATH "/sm/bin:/sm/cargo/bin:/usr/local/bin:/usr/bin:/bin:…"
      --bind "$CHALLENGE_DIR" /work --chdir /work --
```

Nada é montado sob `/home`, e o root de remapeamento é `/sm` (não `/opt`, que é montado
read-only e por isso não aceita `mkdir` de diretório novo).

**Duas fases**, decisão de projeto:

| Fase | Rede | Quando |
|---|---|---|
| `prepare` | **com** rede (`--share-net` no bwrap; sem `--net` no unshare) | resolver dependências, com confirmação do aluno e mostrando o que baixa |
| `test` | **sem** rede, sempre | rodar o teste do desafio |

Sem `netns` e sem `bwrap`, a fase `test` injeta `http_proxy`/`https_proxy`/`all_proxy`
(`http://127.0.0.1:1`) na frente do comando e **declara em stderr** que isso é lombada, não muro.

---

## 3. Degradação, por plataforma

| Camada | Linux completo | Linux sem systemd/delegação | Linux sem user namespace | macOS |
|---|---|---|---|---|
| Relógio (G1) | `timeout -s KILL -k 5` | idem | idem | `gtimeout` (brew) → `perl -e 'alarm shift; exec @ARGV'` (exit 142) → só com consentimento |
| CPU (G2) | `ulimit -t` | `ulimit -t` | `ulimit -t` | `ulimit -t` |
| Netos (G3) | PID namespace | PID namespace | grupo de processos + `kill -- -PGID` (não cobre `setsid`) | idem, risco residual declarado |
| Rede (G4) | `unshare --net` / `bwrap` | idem | variáveis de proxy | variáveis de proxy |
| cwd (G5) | `cd \|\| exit 66` | idem | idem | idem |
| Escrita (G6) | `bwrap` | `bwrap` | `bwrap` se houver | **nenhuma** sem Docker |
| Memória (G7) | `MemoryMax` + `MemorySwapMax=0` | `ulimit -v` **só** para `c`, `cpp`, `python`, `go` | idem | **nenhuma** — `ulimit -v` é inconsistente lá |
| Processos (G8) | `TasksMax` | PID namespace | nada | nada |
| Arquivo (G9) | `ulimit -f` | idem | idem | idem |

Sem `--language`, `ulimit -v` **não** é aplicado: aplicá-lo às cegas quebraria Node e JVM.
Ausência de ferramenta nunca vira instalação: degrada e declara.

---

## 4. Fatos verificados que sustentam cada escolha

Todos medidos executando, nesta máquina (Linux 7.2, util-linux 2.42.2, coreutils 9.11, bubblewrap
0.11.2, systemd com `cpu io memory pids` delegados, 32 CPUs).

| # | Fato | Consequência no código |
|---|---|---|
| 1 | `timeout` **sem** `-s KILL` trava dentro desta pilha: o sinal não propaga por `unshare`/`systemd-run` (medido: 12002 ms sem terminar). Com `-s KILL -k 5`: exit **137** em 2001 ms | `-s KILL` sempre; **timeout se detecta por tempo decorrido**, nunca por exit code — 124 não chega |
| 2 | `unshare --user --net --pid` **não** confina escrita: o processo gravou em `$HOME` sem erro | G6 só existe com `bwrap` ou Docker; sem eles o piso é **nenhum**, e o `report` diz isso |
| 3 | A sonda de `bwrap` precisa dos **quatro** `--symlink`. Sem `/lib64`: `execvp /bin/true: No such file or directory` — o loader ELF não é achado em x86-64 | a sonda declara os quatro; senão o confinamento sumiria em silêncio em todo Linux |
| 4 | `ulimit -v` quebra runtime com JIT: Node 24 falha com `-v 512M` e `-v 1G` (exit 133), só sobe com 2G; Python vai bem com 256M | limite de memória é `MemoryMax` do cgroup; `ulimit -v` só em `c`/`cpp`/`python`/`go` |
| 5 | `ulimit -u` conta processos do **UID inteiro**: com 176 processos de desktop vivos, um teto baixo falha antes de o comando começar | nunca `ulimit -u`; use `TasksMax` ou PID namespace |
| 6 | ⭐ **`TasksMax=128` derruba `go test` com cache de build frio**: `fork/exec …/compile: resource temporarily unavailable`. 256 passa. O cgroup conta **threads**, e o Go abre um `compile` por CPU | default subiu para **512**; ainda contém fork bomb com folga |
| 7 | ⭐ **Sem `-p OOMPolicy=continue`, o systemd para o escopo no OOM**: o comando sai **143** (não 137) e `memory.events` some antes de ser lido. Com a propriedade: 137 e `oom_kill 1` | a propriedade entra sempre que sondada como aceita; o 143 vira heurística de OOM no `classify` |
| 8 | ⭐ Montar cache de toolchain **no caminho original** faz o `bwrap` criar `/home/<aluno>` dentro do sandbox, e esse diretório é gravável — o aluno via "escrevi em `$HOME`" (num diretório efêmero) | os caches são remapeados para `/sm/…`; `/home` não existe dentro, e a tentativa falha com `FileNotFoundError` |
| 9 | O systemd expande `${VAR}` nos argumentos: com `${__cg}` no wrapper, ele avisava `Referenced but unset environment variable` e apagava o trecho | nenhuma chave `${…}` no snippet do wrapper |
| 10 | `--map-current-user` (`-c`) preserva o uid; `--map-root-user` (`-r`) faz `id -u` devolver 0 | `-c` preferido, `-r` só como fallback |
| 11 | `timeout` sozinho **não** mata neto que fez `setsid` (medido: 1 órfão sobrevive); com a pilha, 0 | PID namespace é obrigatório para G3 |
| 12 | Exit codes observados: `timeout -s KILL` → 137 · `ulimit -t` → 137 · `ulimit -f` → 153 · `cd` falho → 66 · `perl alarm` → 142 | tabela de `classify` |

**Custo aceito**: dentro do `bwrap`, `GOCACHE` cai no tmpfs `/tmp` e o build do Go é frio a cada
execução (≈2,3 s num módulo pequeno). O ganho é `/home` inexistente lá dentro.

---

## 5. `detect-toolchains.sh`

`0755`, `set -euo pipefail`. **Autossuficiente**: não dá `source` em `lib/`, porque roda no
bootstrap, antes de existir setup.

```
detect-toolchains.sh [--cached] [--setup <setup_root>] [--language <l>] [--json]
```

| Flag | Efeito |
|---|---|
| `--cached` | lê o cache **sem re-sondar**; sem cache → exit `1` com instrução |
| `--setup <root>` | acrescenta `"setup": {root, language, available}` lendo `setup.json`; diretório inexistente vira aviso, não erro |
| `--language <l>` | recorta a saída para essa linguagem; fora do enum §4.1 → exit `2` |
| `--json` | explícito; a saída **já é JSON sempre** |

Exit codes: `0` ok · `1` erro de execução (inclui `--cached` sem cache) · `2` uso incorreto.

**Cache**: `${STUDY_METHOD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/study-method}/toolchains.json`,
escrito atomicamente (tmp + `mv`). Guarda **sempre o documento canônico da máquina**: com
`--language` ou `--setup`, o cache **não** é reescrito — recortá-lo ou carimbá-lo com um setup
envenenaria toda leitura posterior com `--cached`. Falha de escrita do cache é aviso, não erro.

**Escopo desta versão**: as cinco linguagens zero-install. As outras 14 do enum são **declaradas**,
não sondadas.

| `language` | Sonda (candidatos, em ordem) | Versão extraída de | Comando de teste |
|---|---|---|---|
| `python` | `python3`, `python` | `Python 3.14.7` | `python3 -m unittest discover -s tests -p "test_*.py" -v` |
| `javascript` | `node` | `v24.19.0` | `node --test --test-reporter=tap tests/stub.test.js` |
| `go` | `go version` | `go version go1.26.5-X:nodwarf5 linux/amd64` → `1.26.5` | `go test ./... -v` |
| `rust` | `cargo` | `cargo 1.98.0 (…)` | `cargo test` |
| `c` | `gcc`, `cc`, `clang` | `gcc (GCC) 16.2.1 20260810` | `gcc -std=c11 -g stub.c tests/test_stub.c -o runner -lm && ./runner` |

Forma de cada entrada:

```json
"python": {"available": true, "version": "3.14.7", "command": "python3",
           "path": "/usr/bin/python3", "implemented": true, "test_command": "…"}
"java":   {"available": null, "version": null, "command": null, "path": null,
           "implemented": false, "reason": "not_implemented_in_this_version"}
```

`available: null` é **"eu não sei"**, não "não tem": a linguagem não implementada não foi sondada, e
dizer "não instalada" sobre o que não foi procurado faria o tutor decidir em cima de mentira.
`available: false` só aparece para linguagem implementada e realmente ausente.

Cada sonda de versão roda sob `timeout -s KILL -k 2 10` quando `timeout` existe: nenhuma ferramenta
travada segura o bootstrap. **O script nunca instala nada.**
