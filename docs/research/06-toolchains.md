# 06 — Toolchains: matriz operacional de runners de teste por linguagem

Documento operacional. Objetivo: dado que o aluno escolheu a linguagem X, este arquivo
responde sozinho "como eu monto e rodo um desafio TDD nela" — sem precisar pesquisar de novo.

Marcação usada: **FATO VERIFICADO (fonte)** = confirmado nesta pesquisa via busca web ou
execução real nesta máquina; **INFERÊNCIA** = conhecimento consolidado da linguagem/ferramenta,
não citado a uma página específica desta rodada, mas seguro para operar. Comandos marcados
**[verificado nesta máquina]** foram de fato executados durante esta pesquisa
(CachyOS/Arch Linux x86_64, agosto/2026).

---

## 1. Princípio zero-install

Pergunta decisiva para um aluno iniciante: existe um jeito de rodar um teste nesta linguagem
**sem instalar nada além do runtime**? Isso evita que o primeiro contato com TDD vire luta
contra gerenciador de pacotes.

| Linguagem | Zero-install? | O que é |
|---|---|---|
| Python | **Sim** | `unittest` — stdlib, sempre presente |
| JS/TS (Node) | **Sim** | `node:test`+`node:assert` — builtin desde Node 18 |
| Rust | **Sim** | `cargo test` — parte do próprio toolchain |
| Go | **Sim** | `go test`+`testing` — builtin |
| Elixir | **Sim** | `ExUnit` — stdlib, ativo por padrão em todo `mix new` |
| Julia | **Sim** | `Test` — stdlib, `using Test` sem instalar nada |
| Swift | **Quase-sim** | `XCTest` embutido no toolchain, integra nativo com `swift test`/SwiftPM |
| Ruby | **Sim** | `minitest` — empacotado com o Ruby desde a 1.9 |
| C | **Sim (mínimo absoluto)** | `assert.h` da libc |
| C++ | **Sim (mínimo absoluto)** | `<cassert>` |
| Lua | **Sim (mínimo absoluto)** | `assert()` nativo da linguagem |
| Haskell | **Sim (mínimo absoluto)** | GHC puro + `System.Exit`, sem framework |
| Bash | **Sim (mínimo absoluto)** | o próprio bash + `[ ] \|\| exit 1` |
| Java | **Não** | JUnit não vem com o JDK |
| C# / .NET | **Não** | xUnit/NUnit/MSTest são pacotes NuGet |
| Kotlin | **Não** | sem framework builtin; só `assert()`/`require()` do stdlib |
| PHP | **Não** | `assert()` nativa existe, mas sem test runner real embutido |
| R | **Não** | base R só tem `stopifnot()`, sem framework de teste real |

Linguagens "batteries included" modernas (Python, Node, Rust, Go, Elixir, Julia, Ruby) trazem
teste de verdade de fábrica. Linguagens de sistemas minimalistas (C, C++, Lua, Bash, Haskell
puro) não trazem framework nenhum, mas o assert nativo já basta para o primeiro contato com
TDD. Java, C#, Kotlin, PHP e R exigem pelo menos um download antes do primeiro teste rodar.

---

## 2. A matriz operacional

Comando de detecção = como saber se a linguagem está instalada e em que versão. Comando de
execução = como rodar só os testes do desafio (não a suíte inteira). Ver §6 para a estrutura
de diretório canônica (é a mesma para todas as linguagens, por isso não repetida por linha).

| Linguagem | Runtime mínimo | Detecção | Zero-install | Recomendado | Comando (só o desafio) | Falha legível como | Exit code de falha |
|---|---|---|---|---|---|---|---|
| Python | CPython 3.9+ | `python3 --version` | `unittest` | `pytest` | `python3 -m pytest tests/test_x.py -q` | pytest reescreve o `assert` e mostra os dois lados; `unittest` só com `assertEqual` | **1** (5 = nada coletado — vale tanto para `pytest` quanto para `python3 -m unittest`, **verificado nesta máquina**) |
| JS/TS (Node) | Node 18+ | `node --version` | `node:test`+`node:assert` | vitest (novo) / jest (legado) | `node --test tests/x.test.js` ou `npx vitest run tests/x.test.ts` | `node:test`: TAP+stack; vitest/jest: diff colorido | **1** |
| Rust | rustc/cargo via rustup | `cargo --version` | `cargo test` | idem | `cargo test tests::x -- --exact` (nome **qualificado** — ver nota abaixo) | `assert_eq!` mostra `left`/`right` lado a lado | **101** (não 1 — exit code de panic) |
| Go | toolchain Go | `go version` | `go test`+`testing` | idem (+testify opcional p/ assertions) | `go test ./x/... -run '^TestX$' -v` | `t.Errorf` com arquivo:linha, **sem diff automático** | **1** (panic interno teria 2, mas é escondido) |
| Java | JDK 17+ | `java --version`; `mvn --version` | nenhum (jar standalone do console-launcher é o mais leve) | JUnit 5 via Maven/Gradle | `mvn -Dtest=XTest test -q` ou `./gradlew test --tests X` | `AssertionFailedError` com `expected`/`was` | **1** (2 = sem testes com `--fail-if-no-tests`) |
| C# / .NET | .NET SDK | `dotnet --version` | nenhum | xUnit (`dotnet new xunit`) | `dotnet test --filter "FullyQualifiedName~X"` | `Assert.Equal` mostra `Expected`/`Actual` | **1** (VSTest clássico) / **2** (Microsoft.Testing.Platform — MTP; ver nota abaixo) |
| Ruby | CRuby | `ruby --version` | `minitest` | RSpec (`gem install rspec`) | `ruby -Ilib -Itest test/x_test.rb` ou `bundle exec rspec spec/x_spec.rb` | minitest: "expected X, got Y"; RSpec: diff de matcher | **1** |
| Elixir | Elixir + OTP | `elixir --version` | `ExUnit` | idem | `mix test test/x_test.exs` | diff colorido `assert esquerda == direita` | **2** (não 1! — 1 é reservado a falha de compilação) |
| Kotlin | JDK + kotlinc/Gradle | `kotlinc -version` | nenhum (só assert cru) | JUnit 5 via Gradle + `kotlin.test` | `./gradlew test --tests X` | `AssertionError` (delegado a JUnit 5) | **1** |
| Swift | toolchain Swift | `swift --version` | `XCTest` | idem, ou `swift-testing` | `swift test --filter XTests` | `XCTAssertEqual failed: (a) is not equal to (b)` | **1** |
| C | gcc/clang | `gcc --version` | `assert.h` | Unity (1 `.c`+2 headers) / Criterion (pacote do SO) | `gcc -o r x.c x_test.c && ./r` | `assert.h` cru: sem valores; Unity: "Expected X Was Y" | `assert.h`: **134** (SIGABRT); Unity: contagem de falhas |
| C++ | g++/clang++ | `g++ --version` | `<cassert>` | doctest (mais leve p/ compilar) / Catch2 (amalgamated) / GoogleTest (CMake) | `g++ -std=c++17 x_test.cpp -o r && ./r` | `CHECK(a==b)` mostra os valores reais capturados | zero-install (`<cassert>`): **134** (SIGABRT, idêntico ao C — **verificado nesta máquina**); framework (Catch2/doctest/GoogleTest): **1**/não-zero |
| PHP | PHP CLI | `php --version` | `assert()` nativa (sem runner) | PHPUnit via PHAR — sem Composer | `php phpunit.phar tests/XTest.php` | `assertEquals` com diff formatado | 0/1/2 (`SUCCESS`/`FAILURE`/`EXCEPTION_EXIT`) — números exatos não confirmados numa única fonte; tratar como `!= 0` |
| Lua | Lua 5.1–5.4/LuaJIT | `lua -v` | `assert()` nativa | busted (`luarocks install busted`) | `lua x_test.lua` ou `busted x_spec.lua` | assert nativo: mensagem custom; busted: describe/it aninhado | **1** |
| Julia | Julia 1.x | `julia --version` | `Test` (stdlib) | idem | `julia --project=. test/runtests.jl` | `@test` mostra "Evaluated: real == esperado" | **1** (`TestSetException` propagada) |
| R | R/Rscript | `Rscript --version` | `stopifnot()` (base, sem framework real) | testthat (`install.packages`) | `Rscript -e 'testthat::test_dir("tests/testthat", stop_on_failure=TRUE)'` | `expect_equal` com diff via `waldo` | **0 por padrão mesmo com falha!** só vira 1 com `stop_on_failure=TRUE` explícito |
| Haskell | GHC (+cabal/stack opcional) | `ghc --version` | GHC puro + `System.Exit` manual | HUnit+QuickCheck via `cabal test` | `cabal test --test-show-details=streaming` | HUnit: "expected X but got Y"; QuickCheck: contraexemplo mínimo (shrinking) | depende do `Main.hs` chamar `exitFailure`; convenção típica **1** |
| Bash | bash ≥ 3.2 | `bash --version` | `[ "$a" = "$b" ] \|\| exit 1` cru | bats-core (`git clone`+`install.sh`) | `bats x.bats` | TAP `not ok N - descrição`; helper `run` captura saída | **1** |

### Notas críticas (a explicação por trás dos casos fora do padrão)

- **Python `unittest` — 0 testes coletados também retorna 5, não só o `pytest`**: rodar
  `python3 -m unittest` (via `discover` ou apontando direto para um módulo sem nenhum
  `TestCase`) imprime "NO TESTS RAN" e sai com **exit 5**, exatamente como o `pytest`.
  **FATO VERIFICADO nesta máquina**:
  ```
  $ python3 -m unittest discover -s tests -p "test_*.py"
  Ran 0 tests in 0.000s
  NO TESTS RAN
  EXIT=5
  ```
  Isso importa porque "0 testes coletados" é justamente o cenário de falso positivo mais
  perigoso para um runner de desafio: se o runner externo checar só `!= 0` isso já protege,
  mas se alguém tratar `unittest` como "sempre 1 em qualquer problema", o exit 5 passa
  despercebido.
- **Rust — exit 101, não 1**: painics do Rust (inclusive `assert_eq!` falho) saem com o exit
  code padrão de erro do Rust, `ERROR_EXIT_CODE = 101` em `libtest`, e `cargo test` propaga isso.
  **FATO VERIFICADO** (users.rust-lang.org, discussão sobre exit code 101 em panic).
- **Rust — `cargo test <nome>` sem qualificar o módulo é um footgun de falso positivo**: o
  idioma padrão de teste unitário em Rust é `#[cfg(test)] mod tests { ... }` (é o exemplo usado
  neste próprio documento). Se o teste vive dentro desse módulo, filtrar só pelo nome curto da
  função **não casa com nada** — o `cargo test` interpreta o argumento como um filtro de nome
  substring, não encontra `test_add` (o nome completo é `tests::test_add`), e retorna
  **exit 0** silenciosamente. **FATO VERIFICADO nesta máquina**:
  ```
  $ cargo test test_add -- --exact      # nome curto — ERRADO
  running 0 tests
  test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out
  EXIT=0

  $ cargo test tests::test_add -- --exact   # nome qualificado — CORRETO
  test tests::test_add ... FAILED
  EXIT=101
  ```
  Um runner de desafio que gera o comando de teste automaticamente **precisa** montar o caminho
  qualificado (`<módulo>::<nome_do_teste>`), nunca só o nome da função.
- **Elixir — exit 2 por padrão, não 1**: `mix test` usa `--exit-status` com default **2**
  quando a suíte falha; 1 é reservado para falha de *compilação*. **FATO VERIFICADO**
  (hexdocs.pm/mix — `Mix.Tasks.Test`). Gotcha extra: historicamente `mix test --failed` podia
  não recompilar se o arquivo não compilou na rodada anterior e devolver sucesso indevido
  (relatado em elixir-lang/elixir issue #10781, de 2021 — a issue foi **fechada sem a correção
  ser implementada** e José Valim rejeitou explicitamente essa mudança de comportamento). O fato
  em si é real, só a fonte da correção estava errada: a correção efetiva ("Taint failure
  manifest if requiring or compiling tests fail") está nas **release notes oficiais do Elixir
  1.18.0** (github.com/elixir-lang/elixir/releases/tag/v1.18.0), não na issue #10781.
  **FATO VERIFICADO**.
- **R — o único runner que "mente" por padrão**: `devtools::test()`/`testthat::test_dir()` tem
  `stop_on_failure = FALSE` como default, então o exit code do shell é **0 mesmo com testes
  quebrados**. **FATO VERIFICADO** (github.com/r-lib/testthat issue #912). Há ainda histórico de
  inconsistência do próprio `Rscript` em propagar exit code de `stop()` não capturado
  (github.com/jupyterhub/repo2docker issue #929) — por segurança, sempre envolver a chamada de
  teste num `tryCatch` que chama `quit(status = 1, save = "no")` explicitamente, e considerar
  também dar `grep` na saída textual como camada redundante.
- **C com `assert.h` — exit 134, não 1**: o processo recebe `SIGABRT`, e o shell reporta
  `128 + sinal(6) = 134` — convenção POSIX padrão. **INFERÊNCIA** (bem estabelecida, não citada
  a uma fonte específica). Unity evita isso: `main()` retorna a contagem de falhas via
  `return UNITY_END();`, sempre `!= 0` em falha mas **não sempre 1**.
- **Java — o custo real de "recomendado"**: a primeira execução de `mvn test`/`gradle test` num
  projeto novo baixa o Maven Central inteiro de dependências transitivas (JUnit Jupiter API +
  engine + platform + surefire) e o wrapper do Gradle — pode levar minutos com rede lenta. Para
  gerar um desafio Java rapidamente, o **jar standalone do JUnit ConsoleLauncher** é
  operacionalmente mais barato: um único download, sem `pom.xml`, sem resolução de dependências.
  **FATO VERIFICADO** (docs.junit.org — Console Launcher roda sem Maven/Gradle).
- **Haskell — `exitcode-stdio-1.0` não garante nada sozinho**: essa interface do Cabal exige que
  o `Main.hs` do autor efetivamente chame `exitFailure` em caso de falha (HUnit/Hspec já fazem
  isso internamente) — um `Main.hs` escrito à mão sem essa chamada pode terminar com exit 0
  mesmo tendo testes quebrados.
- **PHPUnit — números exatos não confirmados**: as constantes `TestRunner::SUCCESS_EXIT` /
  `FAILURE_EXIT` / `EXCEPTION_EXIT` existem (github.com/sebastianbergmann/phpunit), mas não há
  uma página oficial única confirmando os três valores numéricos — na prática 0/1/2, mas
  histórico de bugs reportados de exit 0 com falha em cenários específicos (múltiplas
  testsuites) recomenda checar também a saída textual (`OK` vs `FAILURES!`).
- **Catch2 — "zero testes" também é falha, e tem flag própria para desligar isso**: por padrão,
  um binário Catch2 retorna exit code não-zero se nenhum teste rodou (binário vazio, filtro sem
  match, ou tudo pulado em runtime); a flag `--allow-running-no-tests` existe especificamente
  para permitir isso deliberadamente (exit 0 mesmo com zero testes executados). **FATO
  VERIFICADO** (github.com/catchorg/Catch2 — `docs/command-line.md`).
- **doctest — não tem `--allow-running-no-tests`; tem `--no-exitcode`, que é outra coisa**:
  `--allow-running-no-tests` é **exclusiva do Catch2**. O doctest não trata "zero testes" como
  um caso especial configurável; o que ele tem é `-ne`/`--no-exitcode=<bool>`, que **sempre**
  força um exit code de sucesso — inclusive quando há teste real que falhou. São flags com
  propósitos diferentes e não substituem uma à outra. **FATO VERIFICADO**
  (github.com/doctest/doctest — `doc/markdown/commandline.md`).
- **.NET moderno (MTP) — exit 2 para falha de teste, e já é o padrão nos runners atuais**: o
  `Microsoft.Testing.Platform` (MTP), o backend por trás do `dotnet test` moderno, define
  `exit code 2` como "at least one test failure". **FATO VERIFICADO** (Microsoft Learn —
  "Microsoft.Testing.Platform exit codes": *"An exit code of 2 is used to indicate that there
  was at least one test failure"*). Isso não é mais um caso de canto raro: **xUnit.net v3** e o
  **MSTest.Sdk** — os runners por trás de `dotnet new xunit`/`dotnet new mstest` nos SDKs atuais
  — já usam MTP **por padrão**. **FATO VERIFICADO** (docs oficiais de ambos, ver Fontes).

---

## 3. Detecção de ambiente

Algoritmo portátil (Linux/macOS/WSL), baseado em `command -v` (POSIX, mais portátil que
`which`), com fallback de versão:

```bash
#!/usr/bin/env bash
# detect-toolchains.sh — varre o que existe na máquina do aluno
set -u

check() {
  local nome="$1" bin="$2"; shift 2
  local ver_args=("$@")
  if command -v "$bin" >/dev/null 2>&1; then
    local caminho ver
    caminho="$(command -v "$bin")"
    ver="$("$bin" "${ver_args[@]}" 2>&1 | head -n1)"
    printf '%-10s OK       %-30s %s\n' "$nome" "$caminho" "$ver"
  else
    printf '%-10s AUSENTE\n' "$nome"
  fi
}

check Python  python3 --version
check Node    node    --version
check Rust    cargo   --version
check Go      go      version
check Java    java    --version
check Maven   mvn     --version
check Gradle  gradle  --version
check Dotnet  dotnet  --version
check Ruby    ruby    --version
check Elixir  elixir  --version
check Kotlin  kotlinc -version
check Swift   swift   --version
check C-gcc   gcc     --version
check Cpp-g++ g++     --version
check PHP     php     --version
check Lua     lua     -v
check Julia   julia   --version
check R       Rscript --version
check Haskell ghc     --version
check Bash    bash    --version

echo
echo "gerenciadores de versão presentes:"
for vm in pyenv nvm asdf rbenv rvm ghcup; do
  if command -v "$vm" >/dev/null 2>&1 || [ -d "$HOME/.$vm" ] || [ -s "$HOME/.${vm}/${vm}.sh" ]; then
    echo "  - $vm"
  fi
done
```

**Múltiplas versões (pyenv/nvm/asdf)**: quando um gerenciador de versão está presente, o
binário no `PATH` não é garantia do que o aluno pretende usar. Prioridade recomendada:

1. Se o diretório do desafio tiver um arquivo de pin (`.python-version`, `.nvmrc`,
   `.tool-versions` — este último cobre várias linguagens num arquivo só via `asdf`), respeitar.
2. Senão, usar a versão "corrente" já resolvida pelo gerenciador: `pyenv version` /
   `nvm current` / `asdf current <linguagem>`.
3. Senão, cair no binário simples resolvido por `command -v`.
4. Registrar no `meta.yaml` do desafio (§6) qual versão exata gerou/validou o desafio.

`asdf` é a ferramenta mais conveniente para desafios multi-linguagem (um `.tool-versions` só).
**Nesta máquina não há nenhum gerenciador de versão ativo** — existe apenas `~/.nvm/nvm.sh`
(instalação nvm presente, não confirmada ativa na sessão) — **verificado nesta máquina**.

---

## 4. Execução isolada e segura

### timeout

Linux (GNU coreutils) tem `timeout` por padrão — **verificado nesta máquina**
(`timeout (GNU coreutils) 9.11`). **macOS não tem `timeout` por padrão** (ships BSD coreutils).
**FATO VERIFICADO**. Alternativas confirmadas: `brew install coreutils` instala a versão GNU
prefixada como `gtimeout` (não `timeout`, para não colidir com o BSD do sistema); ferramentas
standalone mais leves também existem (`brew install aisk/tap/timeout`).

```bash
run_with_timeout() {
  local segundos="$1"; shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$segundos" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$segundos" "$@"
  else
    perl -e 'alarm shift; exec @ARGV' "$segundos" "$@"   # fallback sem coreutils (perl vem no macOS)
  fi
}
```

O fallback via `perl -e 'alarm ...; exec ...'` é idioma conhecido da comunidade —
**INFERÊNCIA** (a alternativa confirmada e preferível é `gtimeout` via `brew install coreutils`).

### ulimit

Builtin do bash nas duas plataformas, mas opções/limites divergem — **FATO VERIFICADO** (nem
todas as opções de `ulimit` existem em todas as plataformas; macOS tem particularidades, ex.:
teto histórico de arquivos abertos menor que no Linux). Recomendação — usar só as opções mais
portáveis:

```bash
ulimit -t 10        # tempo de CPU em segundos — portátil Linux/macOS
ulimit -f 65536     # tamanho máx. de arquivo em blocos — evita disco cheio por loop de escrita
# ulimit -u N       # nº processos — cuidado: default varia muito entre distros/macOS
```

`ulimit -v` (memória virtual) é inconsistente entre plataformas e frequentemente indisponível
no macOS — não usar como controle primário cross-platform; para limite de memória real, preferir
container (cgroups no Linux) a `ulimit -v` puro.

### cwd fixo

```bash
cd "$CHALLENGE_DIR" || exit 1
```
sempre antes do comando de teste — nunca confiar no diretório de onde o runner foi chamado.

### Sem rede

Não existe "desligar rede" portátil só com bash/ulimit — é isolamento de kernel. Duas
aproximações, em ordem de robustez: (1) container com `--network=none` (isolamento real); (2)
variáveis de proxy inválidas como lombada barata:
```bash
export http_proxy=http://127.0.0.1:1 https_proxy=http://127.0.0.1:1 no_proxy=""
```
Isso não impede sockets brutos nem runtimes que ignoram essas variáveis — registrar como
limitação conhecida, não garantia de segurança.

---

## 5. Regra de ouro do exit code

**Sempre checar `código != 0`, nunca `código == 1`.** A matriz da §2 já mostra runners que
fogem do padrão "1 = falhou": `cargo test` (101), `mix test` (2), `assert.h` puro em C e
`<cassert>` em C++ (134), `dotnet test` via Microsoft.Testing.Platform/MTP — já o padrão em
xUnit.net v3 e MSTest.Sdk (2), `Unity` (contagem de falhas), `testthat`/`devtools::test()`
(**0 mesmo com falha**, exige `stop_on_failure = TRUE`). Checagem segura universal para um
runner multi-linguagem:

```bash
if run_with_timeout 10 <comando-de-teste-da-linguagem>; then
  echo "PASSOU"
else
  echo "FALHOU (exit $?)"
fi
```

Para R especificamente, ir além do exit code: mesmo com `stop_on_failure = TRUE`, vale também
`grep` na saída textual por "Fail"/"Error" como camada redundante, dado o histórico de
inconsistência documentado do `Rscript`.

---

## 6. Estrutura de diretório canônica do desafio

**Atenção — o layout abaixo é conceitual, não um literal universal.** Ele descreve o *papel*
de cada arquivo (o que o aluno edita, o que valida, o que fica escondido), mas **Go, Rust e
Java rejeitam essa árvore ao pé da letra** — cada um por uma regra de linguagem diferente, e o
caso do Go é o mais perigoso: ele não dá erro nenhum, só finge que rodou. `challenge-new.sh`
(a ferramenta que materializa isso na próxima onda) **precisa gerar uma árvore adaptada por
linguagem**, seguindo a tabela §6.2 — não este esqueleto genérico ao pé da letra.

Agnóstica de linguagem — `<ext>` é a extensão real (`.py`, `.rs`, `.go`, `.ex`, etc.):

```
challenges/<slug-do-desafio>/
├── meta.yaml                  # linguagem, framework, comando de teste, timeout, versão detectada
├── README.md                  # enunciado — o que o aluno lê antes de começar
├── stub.<ext>                 # arquivo que o aluno preenche (função com corpo vazio/TODO)
├── tests/
│   └── test_stub.<ext>        # teste(s) que validam o stub — aluno NÃO edita
├── solution/
│   └── solution.<ext>         # solução de referência — escondida do aluno na entrega
└── runner.sh                  # roda SÓ os testes deste desafio, isolado (timeout/ulimit/cwd fixo)
```

Este esqueleto **funciona ao pé da letra** para Python, Node, Ruby, C, C++, Lua e Bash — desde
que `runner.sh` invoque o teste por **caminho explícito** (ex.: `tests/test_stub.py`), o que já
é como o comando de cada linguagem é descrito na §2. **Verificado nesta máquina** para Python
(`python3 -m unittest tests.test_stub`), Node (`node --test tests/test_stub.js`) e C
(`gcc stub.c tests/test_stub.c -o r && ./r`) — os três rodam, falham corretamente com o stub
vazio, e voltam ao exit code documentado na §2 (1, 1 e 134 respectivamente).

### 6.1 Onde o layout genérico quebra: Go, Rust, Java (verificado executando)

**Go — falso positivo silencioso, `EXIT=0`.** Rodando a árvore exata do esqueleto acima
(`stub.go` na raiz, `tests/test_stub.go` na subpasta):
```
$ go test ./...
?   	demo	[no test files]
?   	demo/tests	[no test files]
$ echo $?
0
```
Nada rodou — nenhuma asserção foi avaliada — e o exit code é **0**. Duas violações
independentes das regras do Go: (1) o nome do arquivo precisa terminar em `_test.go`; o prefixo
`test_` não tem nenhum significado para o toolchain; (2) um teste só é associado ao pacote que
testa se estiver **no mesmo diretório** — não existe "pacote de testes" separado numa subpasta.
Isso é exatamente o falso positivo silencioso que a §5 deste documento manda nunca deixar
passar, e aqui ele nasce da própria estrutura de diretório, não do runner.

Estrutura que de fato funciona — **verificado nesta máquina**:
```
challenges/<slug>/
├── go.mod              # obrigatório: go test em módulo precisa de manifesto na raiz
├── stub.go             # package <slug>
├── stub_test.go        # MESMO diretório, MESMO pacote — sufixo _test.go obrigatório
└── runner.sh
```
```
$ go test ./...
--- FAIL: TestAdd (0.00s)
    stub_test.go:7: Add(1,1) = 0; want 2
FAIL
$ echo $?
1
```

**Rust — não compila sem manifesto, e não resolve o import do stub fora de `src/`.** Sem
`Cargo.toml` na árvore:
```
$ cargo test
error: could not find `Cargo.toml` in `.../challenges/demo` or any parent directory
$ echo $?
101
```
Com `Cargo.toml` presente mas `stub.rs` solto na raiz do desafio (fora de `src/`):
```
$ cargo test
error[E0433]: cannot find module or crate `demo` in this scope
 --> tests/test_stub.rs:1:5
  = help: if you wanted to use a crate named `demo`, use `cargo add demo`
$ echo $?
101
```
Sem manifesto, `cargo` nem chega a existir como projeto; com manifesto mas sem `src/`, o teste
de integração não tem crate nenhuma para importar. Estrutura que funciona — **verificado nesta
máquina**:
```
challenges/<slug>/
├── Cargo.toml
├── src/
│   └── lib.rs          # o stub mora AQUI — nunca solto na raiz do desafio
├── tests/
│   └── test_stub.rs    # teste de integração: nome livre, mas precisa estar direto em tests/
└── runner.sh
```
```
$ cargo test
test test_add ... FAILED
thread 'test_add' panicked: assertion `left == right` failed: left: 0, right: 2
$ echo $?
101
```

**Java — não compila; o nome do arquivo tem que ser exatamente o nome da classe pública.**
```
$ javac stub.java     # arquivo minúsculo contendo "public class Stub"
stub.java:1: error: class Stub is public, should be declared in a file named Stub.java
$ echo $?
1
```
Essa é uma regra do `javac` (Java Language Specification), não do JUnit — vale para **qualquer**
`.java` com classe pública, inclusive o arquivo de teste. Estrutura que funciona — **verificado
nesta máquina**, compilado e executado de ponta a ponta via JUnit Console Launcher standalone
(`junit-platform-console-standalone-1.11.4.jar`, o caminho zero-Maven já recomendado na §2):
```
challenges/<slug>/
├── Stub.java            # nome do arquivo = nome da classe pública, exato (case-sensitive)
├── tests/
│   └── StubTest.java    # idem: nome do arquivo = nome da classe pública de teste
└── runner.sh
```
```
$ javac -d classes -cp junit-console.jar Stub.java tests/StubTest.java
$ java -jar junit-console.jar execute -cp classes --scan-classpath
StubTest ✔
  addsTwoNumbers() ✘  expected: <2> but was: <0>
1 tests failed
$ echo $?
1
```

### 6.2 Tabela de adaptação obrigatória por linguagem

Contrato que `challenge-new.sh` precisa implementar — o layout genérico da §6 só é válido onde
a coluna "onde mora o stub" permitir "livre":

| Linguagem | Manifesto exigido | Convenção do arquivo de teste | Onde mora o stub/fonte | Exit de falha |
|---|---|---|---|---|
| Python | Nenhum | Livre — invocação explícita aceita qualquer nome (prefixo `test_*.py` só importa para auto-discovery) | Livre (verificado) | **1** (5 = zero coletado) |
| Node/JS/TS | Nenhum p/ `node:test`; `package.json` p/ vitest/jest | Livre por invocação explícita — verificado; padrão idiomático é sufixo `.test.js` | Livre, `require`/`import` relativo (verificado) | **1** |
| **Rust** | **`Cargo.toml` obrigatório** (verificado) | Teste de integração: arquivo livre, direto em `tests/` (não subpasta); teste unitário: `#[cfg(test)] mod tests {}` no próprio arquivo fonte — filtro exige nome **qualificado** `tests::nome` (§2 nota) | **Dentro de `src/`** (`lib.rs` ou módulo declarado a partir dele) — nunca solto na raiz do desafio (verificado) | **101** |
| **Go** | **`go.mod` obrigatório** (verificado) | **Sufixo `_test.go` obrigatório** — prefixo `test_` não é reconhecido | **Mesmo diretório e mesmo pacote** do código testado — não pode morar em subpasta `tests/` (verificado) | **1** |
| **Java** | Nenhum p/ jar standalone do ConsoleLauncher; `pom.xml`/`build.gradle` só se usar Maven/Gradle | **Nome do arquivo = nome exato da classe pública nele declarada** (regra do `javac`, não do JUnit) | idem — nome do arquivo = nome da classe pública (verificado) | **1** (2 com `--fail-if-no-tests`) |
| C# / .NET | `.csproj` obrigatório (`dotnet new xunit` gera) | Livre — C# não amarra arquivo↔classe; framework descobre via atributos (`[Fact]`/`[Test]`/`[TestMethod]`) | Qualquer `.cs` dentro da árvore do projeto (glob automático do SDK-style csproj) | **1** (VSTest) / **2** (MTP — já padrão em xUnit v3/MSTest.Sdk, verificado via docs) |
| Ruby | Nenhum p/ minitest; `Gemfile` recomendado p/ RSpec (bundler) | Livre p/ minitest (invocação explícita); RSpec por convenção usa sufixo `_spec.rb` | Livre, `require_relative` | **1** |
| Elixir | `mix.exs` obrigatório (`mix new` gera) | Sufixo `_test.exs` — convenção de descoberta do `mix test` (INFERÊNCIA; Elixir não instalado nesta máquina) | `lib/<app>.ex` (convenção Mix: código em `lib/`, teste em `test/`) | **2** |
| Kotlin | `build.gradle.kts` obrigatório | Livre — Kotlin não amarra arquivo↔classe como Java (INFERÊNCIA) | `src/main/kotlin/` (convenção Gradle) | **1** |
| Swift | `Package.swift` obrigatório (SwiftPM) | Convenção `*Tests.swift`, mas o que importa é o target de teste declarado no manifesto (INFERÊNCIA) | `Sources/<Módulo>/`; teste em `Tests/<Módulo>Tests/` | **1** |
| C | Nenhum (verificado) | Livre | Livre, qualquer diretório, desde que listado explicitamente no comando `gcc` (verificado) | **134** (`assert.h`) |
| C++ | Nenhum p/ `<cassert>`/doctest header-only; `CMakeLists.txt` recomendado p/ Catch2/GoogleTest maiores | Livre | Livre, mesma lógica do C (verificado) | **134** (`<cassert>`, verificado) / **1**/não-zero (framework) |
| PHP | Nenhum p/ PHAR standalone; `composer.json` só se usar autoload PSR-4 | Convenção PHPUnit: classe termina em `Test`; PHP não amarra arquivo↔classe como o `javac` | Livre | 0/1/2 (ver §2) |
| Lua | Nenhum | Livre (`require`/`dofile` explícito) | Livre | **1** |
| Julia | `Project.toml` recomendado (resolve o pacote via `--project=.`); não estritamente obrigatório para `Test` stdlib puro | Convenção: `test/runtests.jl` como entry point | `src/<Nome>.jl` (convenção de pacote) ou `include()` direto | **1** |
| R | `DESCRIPTION` só se usar pacote formal (`devtools::test()`); `testthat::test_dir()` direto não exige | Convenção testthat: `test-*.R` (hífen, não underscore) dentro de `tests/testthat/` (INFERÊNCIA; R não instalado nesta máquina) | Livre | **0 por padrão!** (exige `stop_on_failure=TRUE`) |
| Haskell | `.cabal` obrigatório p/ `cabal test` | Definida no próprio `.cabal` (`main-is: ...`) — não é uma convenção de nome fixa | `src/`/`app/` conforme stanzas do `.cabal` | convenção **1** (depende do `Main.hs` chamar `exitFailure`) |
| Bash | Nenhum | `bats-core` exige extensão `.bats` (não `.sh`) | Livre | **1** |

Linhas em **negrito** (Rust, Go, Java) são as que o esqueleto genérico da §6 quebra e que
`challenge-new.sh` precisa tratar como caso especial, não como o layout padrão.

Notas de design (o que continua valendo para as linguagens onde o layout genérico funciona):

- **`stub.<ext>` separado do teste**: o aluno só edita o stub; o teste nunca é sobrescrito por
  engano — vale mesmo em linguagens onde seria tecnicamente possível juntar tudo num arquivo
  (ex.: doctest permite teste no mesmo arquivo da implementação; não fazer isso aqui).
- **`solution/` escondida**: não incluída na entrega ao aluno (removida na geração da versão
  "para o aluno", ou mantida fora do material entregue).
- **`runner.sh` é o único ponto de entrada testável por script externo**: encapsula o comando
  exato da linguagem (§2 e §6.2), aplica `run_with_timeout`+`ulimit`+`cd` fixo, e normaliza o
  exit code (mesmo que o runner interno use 101, 134 ou 2 — §5) — o orquestrador externo só
  precisa checar um exit code, com o mesmo significado, independente da linguagem escolhida.
- **`meta.yaml`** registra pelo menos: `language`, `runtime_version_detectada`,
  `test_framework`, `test_command`, `timeout_seconds`.

---

## 7. Watch mode / feedback rápido (loop red-green)

| Linguagem/runner | Watch nativo? | Comando |
|---|---|---|
| Python (pytest) | Não | `pip install pytest-watch` → `ptw` (ou `pytest-watcher`) |
| Node (node:test) | **Sim** | `node --test --watch` — **FATO VERIFICADO** |
| Node (vitest) | **Sim (é o padrão!)** | `vitest` já entra em watch fora de CI; `vitest run` desliga |
| Node (jest) | Sim | `jest --watch` (só relacionados) / `--watchAll` |
| Rust | Não | `cargo install cargo-watch` → `cargo watch -x test` |
| Go | Não | sem proposta nativa aceita; `gow` (`go install github.com/mitranim/gow@latest`) ou `watchexec`/`entr` |
| Java/Kotlin (Gradle) | **Sim** | `gradle test --continuous` (`-t`) |
| C# (.NET) | **Sim** | `dotnet watch test` — **FATO VERIFICADO** |
| Ruby | Não | `guard` + `guard-minitest`/`guard-rspec` |
| Elixir | Não (padrão de fato) | `mix_test_watch` (hex) → `mix test.watch` |
| Swift | Não relatado | `entr`/`watchexec` genérico |
| C/C++ | Não | `entr`/`watchexec` genérico |
| PHP | Não | `phpunit-watcher` ou `entr` |
| Lua | Não | `entr`/`watchexec` genérico |
| Julia | Parcial | `Revise.jl` (hot-reload de código, não é "watch de testes" pronto) + loop manual |
| R | Não | `entr`/`watchexec` genérico |
| Haskell | **Sim (ferramenta dedicada)** | `ghcid` — abre `ghci` e roda `:reload` a cada mudança — **FATO VERIFICADO** |
| Bash (bats) | Não | `entr -c bats challenge.bats` |

Destaques: **node:test**, **vitest** e **dotnet watch test** têm o melhor loop nativo (zero
ferramenta externa). **Gradle `--continuous`** cobre Java e Kotlin juntos. Para o resto, `entr`
é o denominador comum mais simples (`ls arquivo | entr -c comando`).

---

## 8. Armadilhas por linguagem

- **Ponto flutuante**: nunca comparar `float`/`double` com `==` direto — usar tolerância
  (`assertAlmostEqual`/`abs(a-b) < epsilon`). Regra de IEEE 754, vale para todas as linguagens
  compiladas/JIT da lista. **INFERÊNCIA** (fato bem estabelecido).
- **Ordem de dicionário/mapa**: Python — dicts preservam ordem de inserção como garantia de
  linguagem desde 3.7. JavaScript — chaves string preservam ordem de inserção, mas chaves
  numéricas-como-string são reordenadas primeiro (spec ECMAScript). Go — iteração de `map` é
  **deliberadamente aleatorizada** por design a cada execução; teste dependente de ordem de
  `map` em Go é flaky por definição. Java/C# — `HashMap`/`Dictionary` não garantem ordem;
  `LinkedHashMap`/`OrderedDictionary` garantem.
- **Encoding**: Python 3 usa o encoding do locale do SO se não especificado —
  `open(path, encoding="utf-8")` é a forma segura. Java também usa "default charset" da
  plataforma se não especificado. Fixar UTF-8 explicitamente em qualquer desafio de texto.
- **Locale**: comparação/formatação sensível a locale (`strcoll` em C, separador decimal
  vírgula/ponto) muda o resultado do teste conforme o ambiente — fixar `LC_ALL=C.UTF-8` no
  runner evita "passou aqui, falhou lá".
- **Timezone**: qualquer desafio com data/hora deve fixar `TZ=UTC` no runner — comparar
  `datetime.now()`/`Date()`/`time.Now()` sem timezone fixo é fonte clássica de flakiness.
- **Aleatoriedade sem seed**: qualquer desafio com `random`/`rand`/`Math.random()` deve fixar
  seed explícita no teste (`random.seed(42)` em Python; `SeedableRng` em Rust; `rand.NewSource(42)`
  em Go) — sem isso, o teste não é reproduzível.

---

## 9. Perfil desta máquina

Detectado nesta sessão (CachyOS Linux, kernel 7.2.0-1-cachyos, x86_64, 32 threads, 31 GiB RAM)
— vira o default de primeiro setup do usuário.

| Linguagem | Status | Detalhe |
|---|---|---|
| Python | **Instalado** | 3.14.7 (`/usr/bin/python3`); `pytest` **não instalado** — só `unittest` |
| Node.js | **Instalado** | v24.19.0 (Active LTS); npm 11.17.0; npx 11.17.0; `node:test` OK |
| Bun | **Instalado** | 1.4.0 — runtime alternativo, fora da matriz principal |
| nvm | Presente (não confirmado ativo) | `~/.nvm/nvm.sh` existe |
| Rust | **Instalado** | rustc/cargo 1.98.0, rustup 1.29.0 |
| Go | **Instalado** | go1.26.5 |
| Java (JDK) | **Instalado (parcial)** | OpenJDK 17.0.19; **Maven ausente**; **Gradle ausente** |
| Kotlin | **Ausente** | nem `kotlin` nem `kotlinc` |
| .NET / C# | **Ausente** | `dotnet` não encontrado |
| Ruby | **Ausente** | nem `ruby` nem `gem` |
| Elixir | **Ausente** | nem `elixir` nem `mix` nem `erl` |
| Swift | **Ausente** | |
| C | **Instalado** | gcc 16.2.1, clang 22.1.8 |
| C++ | **Instalado** | g++ 16.2.1, clang++; `cmake` ausente; `criterion` ausente |
| PHP | **Ausente** | nem `php`, `phpunit`, nem `composer` |
| Lua | **Instalado** | Lua 5.5.1 e 5.4; `luarocks`/`busted` ausentes |
| Julia | **Ausente** | |
| R | **Ausente** | nem `R` nem `Rscript` |
| Haskell | **Ausente** | nem `ghc`, `stack`, `cabal`, nem `ghcup` |
| Bash | **Instalado** | 5.3.15; `bats` ausente |
| asdf | **Ausente** | nenhum gerenciador de versão multi-linguagem |
| `timeout` (coreutils) | **Instalado** | 9.11 |
| `entr`/`watchexec`/`reflex` | **Ausentes** | nenhuma ferramenta de watch genérica |

**Seis linguagens rodam desafio de ponta a ponta sem instalar nada**: Python (`unittest`),
Node.js (`node:test`), Rust (`cargo test`), Go (`go test`), C (`assert.h`), C++ (`<cassert>`) —
contadas separadamente, como o resto deste documento sempre trata C e C++ (runtimes, comandos e
exit codes distintos: 134 para ambos via assert nativo, mas toolchains e extensões diferentes).
Java exigiria no mínimo o jar standalone do JUnit; as demais nove (C#, Ruby, Elixir, Kotlin,
Swift, PHP, Julia, R, Haskell) não têm runtime nenhum instalado nesta máquina.

---

## Fontes

- [pytest — Exit codes](https://docs.pytest.org/en/stable/reference/exit-codes.html)
- [Python docs — unittest](https://docs.python.org/3/library/unittest.html)
- [Node.js v26 — Test runner](https://nodejs.org/api/test.html)
- [Node.js issue #50355 — watch mode](https://github.com/nodejs/node/issues/50355)
- [Vitest — Command Line Interface](https://vitest.dev/guide/cli)
- [Vitest discussion #7672 — watch vs run default](https://github.com/vitest-dev/vitest/discussions/7672)
- [Jest — CLI Options](https://jestjs.io/docs/cli)
- [Cargo Book — cargo test](https://doc.rust-lang.org/cargo/commands/cargo-test.html)
- [Rust forum — exit code 101 on panic](https://users.rust-lang.org/t/solved-why-101-exit-code-when-use-panic/80061)
- [golang/go issue #45508 — go test exit status](https://github.com/golang/go/issues/45508)
- [ieftimov.com — Testing in Go: Failing Tests](https://ieftimov.com/posts/testing-in-go-failing-tests/)
- [JUnit — Console Launcher docs](https://docs.junit.org/6.1.2/running-tests/console-launcher.html)
- [org.junit.platform.console API (exit codes)](https://docs.junit.org/6.2.0/api/org.junit.platform.console/org/junit/platform/console/package-summary.html)
- [Maven Surefire — Using JUnit 5 Platform](https://maven.apache.org/surefire/maven-surefire-plugin/examples/junit-platform.html)
- [Microsoft Learn — dotnet test](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-test)
- [Microsoft Learn — dotnet watch](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-watch)
- [Microsoft Learn — Microsoft.Testing.Platform exit codes](https://learn.microsoft.com/en-us/dotnet/core/testing/microsoft-testing-platform-exit-codes)
- [Microsoft Learn — MSTest SDK: MTP como runner padrão](https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-mstest-sdk)
- [xUnit.net v3 — getting started (MTP como runner padrão)](https://xunit.net/docs/getting-started/v3/getting-started)
- [Minitest / rake test guide](https://medium.com/@tegon/quick-guide-to-minitest-arguments-745bf9fe4b3)
- [RSpec — exit status / failure-exit-code](https://rspec.info/features/3-13/rspec-core/command-line/exit-status/)
- [Mix.Tasks.Test — --exit-status default](https://hexdocs.pm/mix/Mix.Tasks.Test.html)
- [Elixir 1.18.0 — release notes (fonte correta para o "taint" de mix test)](https://github.com/elixir-lang/elixir/releases/tag/v1.18.0)
- [Elixir issue #10781 — mix test --failed caveat (fechada sem a correção; contexto histórico, não fonte da correção)](https://github.com/elixir-lang/elixir/issues/10781)
- [kotlin-test docs — JUnit5 delegation](https://kotlinlang.org/api/core/kotlin-test/)
- [swift-corelibs-xctest](https://github.com/swiftlang/swift-corelibs-xctest)
- [Criterion — setup/pkg-config](https://criterion.readthedocs.io/en/master/setup.html)
- [ThrowTheSwitch/Unity](https://github.com/ThrowTheSwitch/Unity)
- [Catch2 — amalgamated distribution](https://github.com/catchorg/Catch2/blob/devel/extras/catch_amalgamated.hpp)
- [Catch2 — command-line docs (--allow-running-no-tests)](https://github.com/catchorg/Catch2/blob/devel/docs/command-line.md)
- [doctest — fastest single-header C++ framework](https://github.com/doctest/doctest)
- [doctest — command-line docs (--no-exitcode)](https://github.com/doctest/doctest/blob/master/doc/markdown/commandline.md)
- [Go — testing package docs (_test.go suffix, same-package rule)](https://pkg.go.dev/testing)
- [Cargo — project layout (src/ vs tests/)](https://doc.rust-lang.org/cargo/guide/project-layout.html)
- [Java Language Specification — top-level class/file name rule](https://docs.oracle.com/javase/specs/jls/se17/html/jls-7.html#jls-7.6)
- [PHPUnit — Installation (PHAR)](https://docs.phpunit.de/en/10.5/installation.html)
- [busted (lunarmodules)](https://lunarmodules.github.io/busted/)
- [Julia — Test stdlib](https://docs.julialang.org/en/v1/stdlib/Test/)
- [testthat issue #912 — stop_on_failure default](https://github.com/r-lib/testthat/issues/912)
- [repo2docker issue #929 — Rscript exit code inconsistency](https://github.com/jupyterhub/repo2docker/issues/929)
- [Cabal — test-suite interfaces (exitcode-stdio-1.0)](https://gist.github.com/1343429/a51775b26d6eb7a2e0fd56faaadfcd15c92d0ff9)
- [ghcid — GHCi based bare bones IDE](https://github.com/ndmitchell/ghcid)
- [bats-core](https://github.com/bats-core/bats-core)
- [macOS timeout — kitemetric.com](https://kitemetric.com/blogs/bringing-the-timeout-command-to-macos-without-installing-gnu-coreutils)
- [ulimit — ss64.com/mac](https://ss64.com/mac/ulimit.html)
- [asdf / version managers overview](https://medium.com/@vladkens/asdf-a-good-replacement-for-brew-nvm-pyenv-conda-etc-1e713eac7345)
- [gow — missing watch mode for Go](https://github.com/mitranim/gow)
- [Node.js release schedule 2026](https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule)
