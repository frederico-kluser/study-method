# Linguagens — matriz operacional

Consulte quando o aluno escolher a linguagem da aula. Responde: **está instalada? como
rodo o teste do desafio? onde os arquivos moram? como esta linguagem gera gráfico?**

Fonte do racional: `docs/research/06-toolchains.md` e `docs/06-visualizacao.md`, ambos
no `docs/` **do repositório** (não é o `docs/` do setup do aluno). Você **não** precisa
abrir nenhum dos dois para operar — este arquivo é autossuficiente.

Tudo marcado **[V]** foi confirmado executando nesta máquina em 2026-08-23.

## Sumário
A regra dura · Armadilhas confirmadas por execução · Matriz de linguagens que rodam nesta
máquina · Como plotar · Linguagens que exigem instalação · Quando a linguagem escolhida NÃO
está instalada · Armadilhas transversais de desafio · Decisões abertas geradas aqui

---

## 1. A regra dura — leia antes de qualquer coisa

### 1.1 Exit code: `!= 0`, jamais `== 1`

```bash
if sandbox_exec <comando>; then echo PASSOU; else echo "FALHOU (exit $?)"; fi
```

Falha **não** é 1 em quase metade da matriz: Rust dá **101**, C/C++ com assert nativo dão
**134** (SIGABRT), Elixir e .NET/MTP dão **2**, `unittest` sem teste nenhum dá **5**.
Qualquer código que teste `== 1` classifica falha real como sucesso.

E **timeout não está nessa lista de propósito**: ele não se detecta por exit code (§7). A sandbox
mata com `-s KILL`, o que dá **137** — que também é OOM e limite de CPU. Quem procurar **124** vai
procurar para sempre.

### 1.2 ⭐ Assertar "testes executados > 0" — o exit code não basta

Exit 0 pode significar "passou" **ou** "nada rodou". As duas coisas são
indistinguíveis pelo exit code, e "nada rodou" é o pior resultado possível num tutor de
TDD: o aluno acha que acertou.

**Guard estático, obrigatório, antes de rodar** — funciona em qualquer linguagem:

```bash
grep -cE '<padrão de declaração de teste>' "$ARQUIVO_TESTE"   # precisa ser >= 1
```

**Guard dinâmico, na saída, onde a linguagem dá contagem:**

| Linguagem | Padrão estático no arquivo de teste | Contagem na saída |
|---|---|---|
| Python | `def test_` | `Ran ([1-9][0-9]*) tests?` **[V]** |
| Node | `(^\|[^a-zA-Z])(test\|it)\s*\(` | linhas TAP `^(not )?ok \d+ - ` cujo label **≠ o caminho do arquivo** (ver 2.2) |
| Rust | `#\[test\]` | `test result: .* ([1-9][0-9]*) (passed\|failed)` **[V]** |
| Go | `func Test[A-Z]` | `^=== RUN` com `-v` **[V]** |
| Java | `assert ` ou `@Test` | ConsoleLauncher imprime `tests successful/failed` |
| C / C++ | `assert\s*\(` | não há — só o guard estático |
| Lua | `assert\s*\(` | não há — só o guard estático |
| Bash | `\|\| exit 1` ou `@test ` | TAP do bats, se usado |

**Se o guard falhar, o desafio está mal gerado.** Isso é erro da skill, não do aluno —
regenere o desafio, não reporte "passou".

---

## 2. ⭐ As armadilhas confirmadas por execução

Cinco formas de `EXIT=0` sem nenhum teste ter rodado. Todas **[V]** nesta máquina.

### 2.1 Go — layout genérico dá `EXIT=0` sem rodar teste

Com `stub.go` na raiz e `tests/test_stub.go` numa subpasta:
```
$ go test ./...
?   	demo	[no test files]
?   	demo/tests	[no test files]
$ echo $?
0                       # <-- FALSO POSITIVO
```
Duas regras do Go violadas: o arquivo **precisa** terminar em `_test.go` (o prefixo
`test_` não significa nada), e o teste **precisa** estar no mesmo diretório e mesmo
pacote do código testado. Com `stub_test.go` ao lado de `stub.go`: `EXIT=1` **[V]**.

> Sem `go.mod`, `go test ./...` dá `EXIT=1` com "does not contain main module" — esse
> caso ao menos falha alto. O perigoso é só o do layout. **[V]**

### 2.2 ⭐ Node — arquivo de teste vazio reporta `pass 1` e `EXIT=0`

Não documentado na pesquisa; descoberto executando. `node --test` conta o **próprio
arquivo** como um teste que passou:
```
$ node --test --test-reporter=tap tests/stub.test.js   # arquivo vazio
ok 1 - tests/stub.test.js
# tests 1
# pass 1
$ echo $?
0                       # <-- FALSO POSITIVO
```
Consequência: para Node, "contagem de testes > 0" **não protege sozinha** — o arquivo
vazio já dá 1. O label do `ok 1` é o **caminho do arquivo**, não o nome de um teste.
Com um teste real que falha, o label vira o nome do teste e o exit é 1 **[V]**.

**Regra**: no TAP do Node, ignore todo `ok N - <label>` cujo `<label>` seja igual a um
dos caminhos passados na linha de comando. Se sobrar zero, nada rodou.

### 2.3 Rust — filtrar pelo nome QUALIFICADO num teste de integração dá `EXIT=0`

`tests/test_stub.rs` deste sistema é **teste de integração** (layout `cargo_crate`,
docs/05-challenges-tdd.md §2.3): as funções `#[test]` ficam no TOPO do arquivo, **sem**
`mod tests`. Sem módulo para qualificar, o cargo reporta e filtra cada caso pelo **nome
CURTO** — é esse nome curto que `meta.json` grava em `scenarios[].test_name`:
```
$ cargo test tests::test_add -- --exact   # nome QUALIFICADO — ERRADO aqui
test result: ok. 0 passed; 0 failed; ...; 1 filtered out
$ echo $?
0                       # <-- FALSO POSITIVO: nao existe modulo `tests`, filtro nao casa nada

$ cargo test test_add -- --exact          # nome CURTO — CORRETO aqui
test result: FAILED. 0 passed; 1 failed
$ echo $?
101
```
O filtro do `cargo test` é por substring do **caminho completo** do teste, e o caminho de um
teste de integração sem módulo **é** o próprio nome da função. Qualificar com `tests::` não
casa nada e o `cargo` sai com 0 sem avisar. **[V]**

**Regra**: filtre pelo nome CURTO (o mesmo de `scenarios[].test_name`), sempre com `--
--exact` — sem ele o filtro é por substring e casa mais do que se pediu. **Só** se o teste
estivesse dentro de `#[cfg(test)] mod tests { ... }` (layout diferente do usado aqui) o nome
precisaria ser qualificado como `tests::<nome>`.

### 2.4 Python — `unittest` com zero testes dá `EXIT=5`

```
$ python3 -m unittest discover -s tests -p "test_*.py"
Ran 0 tests in 0.000s
NO TESTS RAN
$ echo $?
5
```
Não é 0 (bom) e não é 1 (armadilha para quem testa `== 1`). Vale igual para `pytest`.
Com um teste que falha: `EXIT=1` **[V]**.

### 2.5 ⭐ Java — `assert` é DESABILITADO por padrão

Não documentado na pesquisa; descoberto executando. Sem `-ea`, a JVM **remove** as
asserções:
```
$ java StubTest        # contém: assert add(1,1) == 2;  e add() retorna 0
fim
$ echo $?
0                       # <-- FALSO POSITIVO: a asserção falsa foi IGNORADA
$ java -ea StubTest
$ echo $?
1
```
**Regra**: todo comando Java zero-install **precisa** de `-ea`. Sem ele, o desafio
sempre "passa". **[V]**

---

## 3. Matriz — linguagens que rodam nesta máquina

Nove linguagens fecham o ciclo completo (desafio + teste + gráfico) sem instalar nada.

### 3.1 Execução

| Linguagem | Detecção | Teste zero-install | Comando exato do desafio | Exit de falha |
|---|---|---|---|---|
| **Python** 3.14.7 | `python3 --version` | `unittest` (stdlib) | `python3 -m unittest discover -s tests -p "test_*.py" -v` | **1** (5 = zero testes) **[V]** |
| **Node** 24.19.0 | `node --version` | `node:test` + `node:assert` | `node --test --test-reporter=tap tests/stub.test.js` | **1** (0 se o arquivo estiver vazio — §2.2) **[V]** |
| **Rust** 1.98.0 | `cargo --version` | `cargo test` | `cargo test` (sem filtro; se filtrar: `cargo test <nome> -- --exact` — nome CURTO, §2.3) | **101** **[V]** |
| **Go** 1.26.5 | `go version` | `go test` + `testing` | `go test ./... -v` | **1** **[V]** |
| **C** gcc 16.2.1 | `gcc --version` | `assert.h` | `gcc -std=c11 -g stub.c tests/test_stub.c -o runner -lm && ./runner` | **134** (SIGABRT) **[V]** |
| **C++** g++ 16.2.1 | `g++ --version` | `<cassert>` | `g++ -std=c++17 -g stub.cpp tests/test_stub.cpp -o runner && ./runner` | **134** (SIGABRT) **[V]** |
| **Java** JDK 17.0.19 | `javac -version` | `assert` **só com `-ea`** (§2.5) | `javac -d classes Stub.java tests/StubTest.java && java -ea -cp classes StubTest` | **1** — **0 sem `-ea`** **[V]** |
| **Lua** 5.5.1 / 5.4.8 | `lua -v` | `assert()` nativo | `lua tests/test_stub.lua` | **1** **[V]** |
| **Bash** 5.3.15 | `bash --version` | `[ ] \|\| exit 1` | `bash tests/test_stub.sh` | **1** **[V]** |

### 3.2 Layout do desafio

| Linguagem | Manifesto exigido | Nome do arquivo de teste | Onde o fonte mora |
|---|---|---|---|
| **Python** | nenhum | livre por invocação explícita; `test_*.py` para o `discover` | livre; `import` relativo |
| **Node** | nenhum (`node:test`) | livre; idiomático `*.test.js` | livre; `require`/`import` relativo |
| ⚠️ **Rust** | **`Cargo.toml` obrigatório** | integração: livre, **direto** em `tests/` (não em subpasta); unitário: `#[cfg(test)] mod tests` no próprio fonte | **dentro de `src/`** (`lib.rs` ou módulo) — nunca solto na raiz |
| ⚠️ **Go** | **`go.mod` obrigatório** | **sufixo `_test.go` obrigatório** — `test_` não vale | **mesmo diretório e mesmo pacote** do código testado — nunca em `tests/` |
| **C / C++** | nenhum | livre — listado explicitamente no comando de compilação | livre |
| ⚠️ **Java** | nenhum para `-ea`/ConsoleLauncher | **nome do arquivo = nome exato da classe pública** (regra do `javac`, case-sensitive) | idem: arquivo nomeado pela classe pública |
| **Lua** | nenhum | livre (`require`/`dofile` explícito) | livre |
| **Bash** | nenhum | livre (`.bats` só se usar bats-core, que **não** está instalado) | livre |

⚠️ = o layout genérico do desafio **quebra**; gere a árvore adaptada.

Árvores que funcionam, todas **[V]** com o comando exato da §3.1:
```
Rust:  Cargo.toml · src/lib.rs · tests/test_stub.rs · runner.sh
Go:    go.mod · stub.go · stub_test.go · runner.sh          (mesmo diretório!)
Java:  Stub.java · tests/StubTest.java · runner.sh
C/C++: stub.c · stub.h · tests/test_stub.c · runner.sh      (header ou protótipo!)
Resto: stub.<ext> · tests/test_stub.<ext> · runner.sh
```

Duas nuances verificadas ao montar essas árvores:

- **Java**: o comando `javac -d classes Stub.java tests/StubTest.java` só funciona
  porque **nenhuma** das duas classes declara `package`. Se o desafio usar pacote, o
  caminho do fonte precisa espelhar o pacote e o `-cp`/nome da classe mudam. Para
  desafio de uma função, **não use `package`**. **[V]**
- **C/C++**: não existe import — o arquivo de teste precisa ver a declaração da função,
  via header (`#include "../stub.h"`) ou protótipo repetido no topo. Sem isso o link
  falha ou (pior, em C antigo) compila com declaração implícita. **[V]**

---

## 4. Como plotar — a ponte é sempre a mesma

⭐ **O renderizador é ortogonal à linguagem da aula.** Nenhuma linguagem precisa de
biblioteca de plotagem. O ciclo é sempre:

**o programa do aluno calcula → grava um JSON → `scripts/render-plot.py` desenha.**

Formato mínimo do JSON que o programa do aluno grava (chaves em inglês snake_case,
textos em pt-BR):

```json
{
  "type": "function|line|scatter|bar",
  "title": "raiz de x",
  "x_label": "x",
  "y_label": "raiz de x",
  "takeaway": "cresce cada vez mais devagar",
  "series": [ { "label": "sqrt(x)", "points": [[0,0], [0.5,0.7071], [1,1]] } ]
}
```

Como cada linguagem grava isso — todos **[V]**, todos zero-install:

| Linguagem | Como gravar o JSON (default) | Fallback |
|---|---|---|
| **Python** | `json.dump(spec, open("plot.json","w"))` — stdlib | — |
| **Node** | `fs.writeFileSync("plot.json", JSON.stringify(spec))` — stdlib | — |
| **Go** | `json.NewEncoder(f).Encode(spec)` (`encoding/json`) — stdlib | — |
| **Rust** | `write!(f, r#"{{"series":[...]}}"#, ...)` com `format!` — **sem serde** | `cargo add serde_json` se o aluno já usa Cargo com rede |
| **Java** | `PrintWriter.printf` montando a string (JSON **não** é stdlib no Java) | — |
| **C / C++** | `fprintf`/`ofstream` montando a string | — |
| **Lua** | `io.open` + `string.format` + `table.concat` | — |
| **Bash** | `jq -n '{...}'` (jq **está** instalado) ou `printf` | `printf` puro |

Depois:
```bash
python3 scripts/render-plot.py --spec plot.json \
        --out-dir researchs/assets/<NNNN>-<slug> --basename <nome>
```

O diretório de saída é **`researchs/assets/<NNNN>-<slug>/`** do setup — o subdiretório do research
a que a figura pertence. `<sessão>/viz/` não existe: uma sessão é `memory/NNNN.json`, um arquivo,
não um diretório.
As quatro saídas (SVG, HTML, ASCII, descrição) saem iguais, qualquer que seja a
linguagem que gerou os dados.

**Escrever o JSON à mão é parte do exercício**, não um obstáculo: em C, Rust ou Lua o
aluno aprende que serializar é montar texto com cuidado (vírgula, aspas, ponto decimal
— cuidado com locale: force `LC_ALL=C` ou `Locale.ROOT`, senão vírgula decimal corrompe
o JSON).

**Nenhuma linguagem usa biblioteca de plot como default.** matplotlib (Python, via venv)
só entra pelos casos de upgrade oferecido (VIZ-5), regidos pela própria instrução de
visualização, que o `SKILL.md` carrega no passo `teach` para gráfico.

---

## 5. Linguagens que exigem instalação

**Nenhuma destas roda nesta máquina.** Nunca as ofereça como se estivessem prontas.

| Linguagem | Falta | Teste zero-install | Exit de falha | Manifesto | Instalação (Arch/CachyOS) |
|---|---|---|---|---|---|
| C# / .NET | `dotnet` | não tem (xUnit é NuGet) | **1** (VSTest) / **2** (MTP — já padrão) | `.csproj` | `pacman -S dotnet-sdk` |
| Ruby | `ruby` | `minitest` (vem com o Ruby) | **1** | nenhum | `pacman -S ruby` |
| Elixir | `elixir` | `ExUnit` | **2** (não 1! — 1 é falha de compilação) | `mix.exs` | `pacman -S elixir` |
| Kotlin | `kotlinc` | não tem | **1** | `build.gradle.kts` | `pacman -S kotlin` (+ gradle) |
| Swift | `swift` | `XCTest` | **1** | `Package.swift` | não empacotado; toolchain do swift.org |
| PHP | `php` | `assert()` sem runner | 0/1/2 — trate como `!= 0` | nenhum (PHAR) | `pacman -S php` |
| Julia | `julia` | `Test` (stdlib) | **1** | `Project.toml` (recomendado) | `pacman -S julia` |
| R | `Rscript` | `stopifnot()` | ⚠️ **0 mesmo com falha!** exige `stop_on_failure=TRUE` | nenhum p/ `test_dir` | `pacman -S r` |
| Haskell | `ghc` | GHC + `System.Exit` manual | **1** *se* o `Main.hs` chamar `exitFailure` | `.cabal` | `pacman -S ghc cabal-install` |

Também ausentes, e relevantes: `pytest`, `maven`, `gradle`, `cmake`, `bats`, `luarocks`,
`entr`/`watchexec`, `gnuplot`, `graphviz`, `matplotlib`.

⚠️ **R é o único runner da matriz que mente por padrão**: `testthat::test_dir()` tem
`stop_on_failure = FALSE` e sai com 0 com testes quebrados. Se o aluno escolher R, o
runner **precisa** de `stop_on_failure=TRUE` mais um `grep` na saída por `Fail|Error`.

---

## 6. Quando a linguagem escolhida NÃO está instalada

Detecte **antes** de gerar qualquer desafio: `command -v <bin>` (POSIX, mais portátil
que `which`). Nunca gere um desafio numa linguagem que você não confirmou.

Nesse caso, faça as duas coisas na mesma mensagem:

1. **Diga o comando exato** de instalação da tabela §5 — e **não execute**. Instalar
   software na máquina do aluno é decisão dele.
2. **Ofereça continuar hoje** numa linguagem instalada próxima, sem tratar isso como
   rebaixamento:

> Ruby não está instalado aqui. Você pode instalar com `sudo pacman -S ruby` e a gente
> retoma nele. Se preferir começar agora, Python está pronto e a ideia que vamos
> estudar é a mesma — o `minitest` do Ruby e o `unittest` do Python funcionam igual.
> Qual você prefere?

**Nunca**: tentar mesmo assim ("vamos ver se funciona") — produz erro de shell sem
diagnóstico, e o aluno não distingue "não instalado" de "meu código está errado.
**Nunca**: instalar por conta própria. **Nunca**: bloquear a aula até instalar.

Vizinhas naturais: Ruby/PHP → Python · Kotlin → Java · C# → Java ou Go · Elixir → não
tem vizinha próxima (ofereça a instalação, ou mude de assunto) · Julia/R → Python ·
Swift → Rust · Haskell → não tem vizinha próxima.

Registre no **`setup.json`** (o manifesto na raiz do setup) qual linguagem foi confirmada e sua
versão exata. Não é no `meta.json`: esse é o manifesto de **um desafio**, em
`challenges/<NNNN>-<slug>/`, e o estado do setup gravado ali seria reperguntado a cada desafio.

---

## 7. Armadilhas transversais de desafio

Fixe no runner, sempre — independem da linguagem:

```bash
export LC_ALL=C.UTF-8 TZ=UTC PYTHONHASHSEED=0
cd "$CHALLENGE_DIR" || exit 66        # 66 = infraestrutura, NUNCA falha de teste
sandbox_exec <comando>                # de lib/sandbox.sh — nunca monte sandbox à mão
```

Três coisas que **não** se improvisa aqui:

- **`|| exit 66`**, em todo lugar do produto. Não 1, não 70. É o código que distingue "o
  diretório do desafio não existe" de "o teste falhou", e ele só serve se for o mesmo em todos
  os scripts.
- **O confinamento vem de `sandbox_exec`**, definido em `lib/sandbox.sh`. Ele já aplica
  `timeout -s KILL -k 5`, `ulimit -t`/`-f`, namespaces e cgroup, na ordem certa e sondando cada
  camada. Um `timeout 10 <comando>` escrito à mão parece equivalente e não é: sem `-s KILL`, o
  `SIGTERM` chega ao wrapper (`unshare`/`systemd-run`) e **não** propaga ao processo do aluno —
  verificado: o comando **trava** em vez de morrer.
- **Timeout se detecta por tempo decorrido**, não por exit code. Com `-s KILL` o código é **137**
  (que também é OOM e limite de CPU), e **124 nunca acontece**. O `runner.sh` mede o tempo antes e
  depois e compara com o limite; é o `DECORRIDO_MS` que ele imprime.

- **ponto flutuante**: nunca `==`; sempre tolerância (`abs(a-b) < 1e-9`);
- **ordem de mapa**: em Go a iteração de `map` é **deliberadamente aleatória** — teste
  que depende dela é flaky por definição. Ordene as chaves antes de comparar;
- **locale**: vírgula decimal corrompe JSON e quebra comparação de string — `LC_ALL=C`;
- **timezone**: `TZ=UTC` em qualquer desafio com data/hora;
- **aleatoriedade**: seed fixa e explícita, sempre;
- **encoding**: UTF-8 explícito (`open(..., encoding="utf-8")` em Python; Java usa o
  charset da plataforma se não disser).

---

## Decisões abertas geradas aqui

| ID | Pergunta ao usuário | Opções | Default sugerido | Reversibilidade |
|----|---------------------|--------|------------------|-----------------|
| D-V04 | A linguagem da aula é escolhida no **setup** (uma para todo o estudo) ou por **sessão**? | (a) por setup, com override explícito por sessão; (b) por sessão, sempre perguntada; (c) por assunto (uma para matemática, outra para programação) | **(a)** — consistência acumula fluência; o override cobre quem quer variar | moderate (desafios já gerados ficam na linguagem antiga) |
| D-V05 | Quando a linguagem escolhida **não está instalada**, o que a skill faz? | (a) mostrar o comando de instalação, sem executar; (b) sugerir a instalada mais próxima e seguir; (c) tentar mesmo assim; (d) bloquear até instalar | **(a)+(b) na mesma mensagem** — nunca (c), que dá erro sem diagnóstico, nem (d), que trava a aula | cheap |
| D-V11 | **RESOLVIDA** — o `runner.sh` deve **normalizar** o exit code (101/134/2/5 → 1) ou repassar o bruto? | (a) normalizar para 0/1 e logar o bruto; (b) repassar bruto; (c) **normalizar para 0/1/2/3 e ecoar `EXIT_BRUTO` e `DECORRIDO_MS` no stdout** | **(c)** — `0` passou · `1` falhou · `2` contagem errada · `3` timeout, mais o `66` do `cd`. É a **exceção nomeada 1** à tabela de exit codes dos scripts da skill, e o diagnóstico (134=SIGABRT, 5=zero testes, 137=morto) não se perde porque o bruto vai no stdout | cheap |
| D-V12 | O guard "testes executados > 0" deve rodar sempre, ou só quando o exit for 0? | (a) sempre, antes e depois; (b) só quando o exit for 0 (barato); (c) só na geração do desafio | **(a)** — é grep, custa nada, e é a única defesa contra as 5 armadilhas da §2 | cheap |
| D-V13 | Quando o aluno escolher uma linguagem com toolchain **parcial** (Java sem Maven/Gradle, C++ sem cmake), a skill usa o caminho zero-install ou pede o build system? | (a) zero-install sempre (`-ea`, `g++` direto), e só mencionar o build system se o aluno pedir; (b) pedir Maven/Gradle/cmake de saída | **(a)** — a primeira execução de `mvn test` baixa o Maven Central inteiro; para um desafio de uma função isso é absurdo | cheap |
| D-V14 | A skill deve rodar a detecção de toolchains uma vez no setup, ou reverificar a cada sessão? | (a) uma vez no setup, gravado no `setup.json`; (b) a cada sessão; (c) no setup e revalidar só a linguagem em uso (`command -v` único) | **(c)** — um `command -v` por sessão custa milissegundos e pega o caso "instalei ontem" ou "desinstalei" | cheap |
