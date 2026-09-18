# Ambiente — a máquina pronta antes dos gates

Referência do passo `preparar_ambiente` da autoria: garantir, ANTES de qualquer gate, que a
máquina tem os toolchains reais que os gates SPAWNAM. Sem toolchain o curso não roda — e o
fail-closed do gate é honesto: ele reprova por ambiente e a causa não é conteúdo. O estado
medido disso está no [docs/18 §8.3](../../../docs/18-estado-da-fabricacao-dos-cursos.md)
(`track:validate` reprova 109 desafios rust "corretamente" só porque `RUSTUP_HOME`/`CARGO_HOME`
não estavam exportados). Versões de pacote citadas abaixo são **aproximadas** (as distros movem
as versões sem avisar): o comando de verificação de cada receita é a fonte da verdade, não o
número desta página.

## 1. O que este documento é — e onde a tutoria começa

Este documento é o passo de **autoria**: quem escreve o curso garante a máquina antes de rodar
os gates ([validacao.md](validacao.md)) e antes de publicar. Os quatro gates rodam de `app/`
via npm e o que cada um spawna de real:

| Gate | Spawna de verdade |
|---|---|
| `audit` · `coverage` · `requirements` | node (a engine, a CLI via tsx e o host do parser por subprocesso) + o par da linguagem da trilha — **python**: `python3` (parse `python3 -I -S <extrator>` e runner); **rust**: `node` (host do parser tree-sitter WASM) + `cargo` REAL (`cargo test --offline`, com sysroot resolvido e `RUSTC` pinado); **C**: `clang` (parse `-Xclang -ast-dump=json`) + `python3` (host do extrator `vocab/c/extract_ast.py`) + `cc`→`gcc`→`clang` (runner) |
| `track:validate` · `track:challenge:verify` | o toolchain de CADA desafio, nas quatro provas de execução — um desafio python spawna `python3`, um rust spawna `cargo`, um C spawna `sh` + compilador (`cc`→`gcc`→`clang`) |
| a interface do app em si | node + npm (Electron 37 / electron-vite 5) e `jq` nos scripts da skill |

Duas exigências que o par da linguagem esconde: **gcc SOZINHO não basta para C** — o RUNNER
aceita qualquer compilador (`cc`→`gcc`→`clang`), mas o PARSE de C é clang ou nada
(`-ast-dump=json` é extensão do clang e o gcc não a tem — `lang/c.ts`, decisão 1), e
`PARSE_ERROR` vira violação no gate; **cargo SOZINHO não basta para rust** — o parse roda em
`node`, host do web-tree-sitter WASM (`lang/rust.ts:9`).

**A fronteira com a tutoria é dura.** Na tutoria
([languages.md §6](../../study-method/references/languages.md)), o tutor NUNCA instala nada na
máquina do aluno: mostra o comando exato, oferece a linguagem vizinha instalada e segue —
"nunca: instalar por conta própria". No preparo do ambiente da autoria a regra é a oposta e o
motivo está no P-PROVA: as quatro provas de execução spawnam binários reais, e sem eles a
onda inteira de validação vira reprojeto fantasma por ambiente. A regra ERR-7 da tutoria
("erro de ambiente é seu: resolva e siga") fala de import/versão/path DENTRO da aula — não
autoriza instalar toolchain na máquina de quem está sendo ensinado.

E o detector não instala: `detect-toolchains.sh` (em
`skills/study-method/scripts/`) devolve `available`/`version`/`command`/`path` para as cinco
linguagens implementadas (python, javascript, go, rust, c) e o cabeçalho dele é explícito —
**"NUNCA INSTALA NADA"**. Ausência de toolchain é informação devolvida; a instalação é decisão
deste passo, nunca ação da detecção.

## 2. Matriz — curso → toolchain → prova de prontidão

Prova de prontidão = um comando que EXECUTA um teste de verdade, copiado da
[languages.md §3.1](../../study-method/references/languages.md) (todos verificados executando).
`command -v` (POSIX, languages.md §6) só prova que o binário existe — a prova abaixo prova que
ele compila, roda e julga.

| Superfície | Toolchain (binário mínimo) | Detecção | Prova de prontidão (roda de verdade) |
|---|---|---|---|
| `python-iniciante` | python3 | `command -v python3` | `python3 -m unittest discover -s tests -p "test_*.py" -v` |
| javascript (e typescript por transpilação) | node | `command -v node` | `node --test --test-reporter=tap tests/stub.test.js` |
| `rust-iniciante` | rustup → cargo | `command -v cargo` | `cargo test` |
| `c-iniciante` | gcc + clang (o runner aceita `cc`→`gcc`→`clang`; o PARSE exige clang) | `command -v gcc clang` | `gcc -std=c11 -g stub.c tests/test_stub.c -o runner -lm && ./runner && clang -std=c11 -fsyntax-only stub.c` |
| o app (interface Electron) | node ≥ 22.13 + npm + jq | `command -v node npm jq` | `node --version && npm --version && jq --version` |

As três primeiras provas presumem a árvore mínima do desafio (languages.md §3.2). Os quatro
blocos abaixo montam essa árvore num diretório temporário e rodam a prova — os quatro foram
executados de verdade nesta máquina ao escrever esta página. Em cada um, prontidão = exit 0
COM um teste rodado (`Ran 1 test`, TAP `ok 1`, `test result: ok. 1 passed`, e o `runner`
saindo silencioso).

Python (o `stub.py` mora em `tests/` — com `-s tests`, o topo do path é o próprio diretório):

```bash
d=$(mktemp -d) && cd "$d" && mkdir -p tests && touch tests/__init__.py
printf 'def soma(a, b):\n    return a + b\n' > tests/stub.py
cat > tests/test_stub.py <<'EOF'
import unittest
from stub import soma
class TestStub(unittest.TestCase):
    def test_soma(self):
        self.assertEqual(soma(1, 2), 3)
EOF
python3 -m unittest discover -s tests -p "test_*.py" -v
```

Node (`node:test` + `node:assert`, builtin desde o Node 18):

```bash
d=$(mktemp -d) && cd "$d" && mkdir -p tests
cat > tests/stub.test.js <<'EOF'
const test = require('node:test');
const assert = require('node:assert');
test('soma', () => { assert.strictEqual(1 + 2, 3); });
EOF
node --test --test-reporter=tap tests/stub.test.js
```

Rust (`Cargo.toml` obrigatório; teste de integração direto em `tests/`):

```bash
d=$(mktemp -d) && cd "$d"
cat > Cargo.toml <<'EOF'
[package]
name = "stub"
version = "0.1.0"
edition = "2021"
EOF
mkdir -p src tests
printf 'pub fn soma(a: i32, b: i32) -> i32 {\n    a + b\n}\n' > src/lib.rs
cat > tests/test_stub.rs <<'EOF'
#[test]
fn soma() {
    assert_eq!(stub::soma(1, 2), 3);
}
EOF
cargo test
```

C (o teste vê a declaração por header — `#include "../stub.h"`, languages.md §3.2) — prova do
RUNNER (gcc) e prova do PARSE (clang):

```bash
d=$(mktemp -d) && cd "$d" && mkdir -p tests
printf 'int soma(int a, int b);\n' > stub.h
printf '#include "stub.h"\nint soma(int a, int b) {\n    return a + b;\n}\n' > stub.c
cat > tests/test_stub.c <<'EOF'
#include <assert.h>
#include "../stub.h"
int main(void) {
    assert(soma(1, 2) == 3);
    return 0;
}
EOF
gcc -std=c11 -g stub.c tests/test_stub.c -o runner -lm && ./runner
clang -std=c11 -fsyntax-only stub.c
```

A prova do PARSE usa `-fsyntax-only` por ser barata — a exigência REAL da engine é o clang com
AST dump (`clang -std=c11 -fsyntax-only -Xclang -ast-dump=json`, decisão 1 de `lang/c.ts`), e sem
clang o `PARSE_ERROR` vira violação no gate. Compilar com gcc e passar **NÃO** prova prontidão de
autoria C.

Duas notas de fronteira. Primeira: prontidão não é "exit 0" solto — exit 0 pode significar
"nada rodou" (python com zero testes sai **5**; node com arquivo vazio conta o próprio arquivo
como `pass 1`; cargo com filtro qualificado filtra tudo e sai 0 — languages.md §2). Segunda:
a engine implementa cinco linguagens (python, javascript, go, rust, c) e nenhuma receita de
`go` está aqui porque nenhum curso publicado a usa ainda — o comando de prova dela é o da
languages.md §3.1, e a instalação segue o padrão de pacote da família da distro (§3).

## 3. Receitas de instalação por família de distro

Formato de cada família: comando de instalação, verificação pós-install e fontes oficiais
(P-FONTE — as mesmas regras de `sources[]` de aula valem a esta página: 2–3 fontes oficiais
por receita, URL verificável, nunca URL inventada). Todas as receitas instalam o CONJUNTO
mínimo do produto: python3, gcc, clang, node+npm, jq — e o rust pelo caminho que a família tem.

### 3.1 Debian 12 / Ubuntu 24.04 (apt)

```bash
sudo apt update
sudo apt install -y python3 build-essential clang jq
```

- `build-essential` traz gcc, g++, make e os headers da libc de uma vez (Debian 12 entrega
  gcc 12.x; Ubuntu 24.04, gcc 13.x).
- O pacote `clang` é a exigência do PARSE de C (não do runner): `-ast-dump=json` é extensão do
  clang e o gcc não a tem — sem clang não há Porta 1 para C e o gate reprova (§1).
- O `nodejs`+`npm` do apt (Node 18.x nas duas distros) RODA os desafios javascript da engine
  (`node:test` existe desde o Node 18), mas NÃO atende o app — `engines.node >= 22.13` em
  `app/package.json` (§5). Para o app, use uma alternativa moderna: NodeSource, `nvm` ou o
  tarball oficial — a página oficial
  [nodejs.org/en/download/package-manager](https://nodejs.org/en/download/package-manager)
  lista o comando atual de cada caminho.
- Para rust, o apt entrega rustc/cargo congelados; o padrão do produto é rustup (§4).

Verificação pós-install:

```bash
python3 --version && gcc --version && clang --version && jq --version && node --version && npm --version
```

Fontes: [wiki.debian.org/Python](https://wiki.debian.org/Python) ·
[packages.debian.org/bookworm/build-essential](https://packages.debian.org/bookworm/build-essential) ·
[packages.debian.org/bookworm/clang](https://packages.debian.org/bookworm/clang) ·
[packages.ubuntu.com/noble/python3](https://packages.ubuntu.com/noble/python3) ·
[packages.ubuntu.com/noble/build-essential](https://packages.ubuntu.com/noble/build-essential) ·
[packages.debian.org/bookworm/jq](https://packages.debian.org/bookworm/jq) ·
[packages.ubuntu.com/noble/jq](https://packages.ubuntu.com/noble/jq)

### 3.2 Fedora (dnf)

```bash
sudo dnf install -y python3 gcc clang gcc-c++ make jq nodejs npm
```

- O grupo `Development Tools` (`sudo dnf group install -y development-tools`) é o equivalente
  do `build-essential` — a lista explícita acima é preferida porque fecha o mesmo conjunto sem
  arrastar o grupo inteiro.
- O pacote `clang` (Fedora) é a exigência do PARSE de C — o `gcc` segue para o runner (§1).
- Rust: `sudo dnf install -y rust cargo` existe, mas o padrão do produto é rustup (§4).

Verificação pós-install:

```bash
python3 --version && gcc --version && clang --version && jq --version && node --version && npm --version
```

Fontes: [packages.fedoraproject.org/pkgs/python3](https://packages.fedoraproject.org/pkgs/python3) ·
[packages.fedoraproject.org/pkgs/clang](https://packages.fedoraproject.org/pkgs/clang) ·
[packages.fedoraproject.org/pkgs/jq](https://packages.fedoraproject.org/pkgs/jq) ·
[fedoraproject.org/wiki/Development_Tools](https://fedoraproject.org/wiki/Development_Tools)

### 3.3 Alpine (apk)

```bash
apk add --no-cache python3 build-base clang nodejs npm jq
```

- `build-base` é o `build-essential` do Alpine: gcc, g++, make e **musl-dev** — sem o musl-dev
  os headers C não existem e nenhum desafio de C compila.
- O pacote `clang` (Alpine) é a exigência do PARSE de C — o gcc do `build-base` cobre só o
  runner (§1).
- Rust: `apk add --no-cache rust cargo` (versão congelada da distro) ou rustup (§4).
- INFERÊNCIA (não medida nesta página): o Alpine usa musl em vez de glibc, e binários
  pré-compilados de Electron/`node-llama-cpp` têm histórico de exigir glibc — para validar os
  GATES das cinco linguagens o Alpine basta; para subir o APP em si, prefira as bases
  glibc (debian/ubuntu/fedora).

Verificação pós-install:

```bash
python3 --version && gcc --version && clang --version && jq --version && node --version && npm --version
```

Fontes: [pkgs.alpinelinux.org/packages?name=python3](https://pkgs.alpinelinux.org/packages?name=python3) ·
[pkgs.alpinelinux.org/packages?name=build-base](https://pkgs.alpinelinux.org/packages?name=build-base) ·
[pkgs.alpinelinux.org/packages?name=clang](https://pkgs.alpinelinux.org/packages?name=clang) ·
[pkgs.alpinelinux.org/packages?name=nodejs](https://pkgs.alpinelinux.org/packages?name=nodejs) ·
[pkgs.alpinelinux.org/packages?name=jq](https://pkgs.alpinelinux.org/packages?name=jq)

### 3.4 Arch / CachyOS (pacman)

```bash
sudo pacman -Syu --needed python nodejs npm gcc jq rustup
sudo pacman -S --needed --noconfirm clang
rustup default stable
```

- O `clang` é a exigência do PARSE de C — o runner aceita o gcc (`cc`→`gcc`→`clang`), mas o
  parse é clang-only e sem clang o gate reprova (§1).
- O pacote `rustup` NÃO traz toolchain por si (é o instalador): sem
  `rustup default stable` o `cargo` não existe — é a armadilha nº 1 da família
  ([wiki.archlinux.org/title/Rust](https://wiki.archlinux.org/title/Rust)).
- Alternativa sem rustup: `sudo pacman -S rust` entrega rustc/cargo direto da distro e os
  gates rodam — mas o padrão do produto é rustup (§4), que é o que
  [docs/research/06-toolchains.md §9](../../../docs/research/06-toolchains.md) mediu na
  máquina de referência (CachyOS, rustup 1.29).
- CachyOS é derivada do Arch: mesmos pacotes, mesmos comandos.

Verificação pós-install:

```bash
python --version && node --version && npm --version && gcc --version && clang --version \
  && jq --version && cargo --version && rustc --version
```

Fontes: [archlinux.org/packages/core/x86_64/python](https://archlinux.org/packages/core/x86_64/python/) ·
[archlinux.org/packages/extra/x86_64/clang](https://archlinux.org/packages/extra/x86_64/clang/) ·
[archlinux.org/packages/extra/x86_64/nodejs](https://archlinux.org/packages/extra/x86_64/nodejs/) ·
[archlinux.org/packages/extra/x86_64/jq](https://archlinux.org/packages/extra/x86_64/jq/) ·
[archlinux.org/groups/x86_64/base-devel](https://archlinux.org/groups/x86_64/base-devel/) ·
[wiki.archlinux.org/title/Rust](https://wiki.archlinux.org/title/Rust)

### 3.5 macOS (Command Line Tools + Homebrew)

```bash
xcode-select --install
brew install python3 node jq
```

- O clang vem no Command Line Tools do Xcode (`xcode-select --install`) — é por isso que o
  macOS NÃO precisa de receita extra de clang: o PARSE de C da engine é clang-only e o CLT já
  entrega o clang. No macOS o `gcc` é na verdade o clang da Apple: o runner de C gerado pela
  engine escolhe `cc`→`gcc`→`clang` ([prova-c.md](prova-c.md)) e a detecção da skill testa os
  três candidatos (`gcc`, `cc`, `clang`) nessa ordem.
- `brew install python3` e não `python@3.12`: o formula versionado é "keg-only" e NÃO cria
  `python3` no PATH — os symlinks ficam em
  `$HOMEBREW_PREFIX/opt/python@3.12/libexec/bin`
  ([formulae.brew.sh/formula/python@3.12](https://formulae.brew.sh/formula/python@3.12)); com o
  `python3` (formula `python`), a verificação abaixo checa o que foi instalado.
- **coreutils GNU**: os gates de repo em macOS exigem PATH com coreutils GNU — instale
  (`brew install coreutils`) e exporte `/opt/homebrew/opt/coreutils/libexec/gnubin` no PATH
  ([docs/18 §3.3](../../../docs/18-estado-da-fabricacao-dos-cursos.md)).
- Rust: rustup oficial (§4) — o Homebrew não é o caminho recomendado para o rust do produto.

Verificação pós-install:

```bash
python3 --version && gcc --version && jq --version && node --version && npm --version
```

Fontes: [developer.apple.com/xcode/resources](https://developer.apple.com/xcode/resources/) ·
[formulae.brew.sh/formula/python](https://formulae.brew.sh/formula/python) ·
[formulae.brew.sh/formula/node](https://formulae.brew.sh/formula/node) ·
[formulae.brew.sh/formula/jq](https://formulae.brew.sh/formula/jq)

## 4. Rust via rustup oficial (fora do gerenciador de pacotes)

Quando a família de distro não tem rustup (Debian/Ubuntu/Fedora/Alpine/macOS) ou quando se
quer a versão estável corrente, o caminho oficial é o `rustup-init`. Não-interativo, perfil
mínimo, toolchain estável:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
source "$HOME/.cargo/env"
rustc --version && cargo --version
```

- `-y` aceita os defaults sem prompt; `--profile minimal` instala rustc+cargo SEM rustfmt,
  clippy e docs ([rustup book — Profiles](https://rust-lang.github.io/rustup/concepts/profiles.html))
  — `cargo test` não usa nada disso, e o perfil enxuto é o que os gates precisam.
- As duas variáveis que governam o destino
  ([rustup book — Environment variables](https://rust-lang.github.io/rustup/environment-variables.html)):
  `RUSTUP_HOME` (as toolchains; default `~/.rustup`) e `CARGO_HOME` (binários e registry;
  default `~/.cargo`). Definidas ANTES do `rustup-init`, mudam onde tudo é instalado.

O padrão do orquestrador é toolchain confinada ao run — e é aqui que os gates cobram:

```bash
export RUSTUP_HOME="$HOME/toolchain/rustup" CARGO_HOME="$HOME/toolchain/cargo"
export PATH="$CARGO_HOME/bin:$PATH"
```

Três regras medidas, todas de [docs/18 §8.3](../../../docs/18-estado-da-fabricacao-dos-cursos.md):

1. **Os gates de cargo exigem o env.** Sem `RUSTUP_HOME`/`CARGO_HOME`/`PATH` exportados para a
   toolchain do run, o `track:validate` reprova TODOS os desafios rust — o fail-closed é
   honesto e a causa é ambiente, não conteúdo.
2. **Cold-start do prover**: a primeira bateria que spawna cargo em lote numa sessão/worktree
   nova sai com o lote inteiro reprovado por ambiente (medido: 109× SEM-SOLUCAO no 1º run,
   109/109 no 2º) ou estoura timeout. Regra: **sempre 1 re-run antes de diagnosticar conteúdo**.
3. **Contenção**: gates de cargo em paralelo com outro agente no MESMO `CARGO_HOME` produzem
   1–2 reprovados ALEATÓRIOS (rustc concorrente, provado por `ps`). Protocolo: serializar os
   gates de cargo — reprovado que fecha em re-verificação isolada não é conteúdo.

## 5. Node mínimo para o app (Electron)

- **O número que vale é o do repositório**: `app/package.json` declara `engines.node: >=22.13`
  (com Electron 37.2.4 e electron-vite ^5). É a exigência do produto, não a genérica.
- **A genérica, para referência**: os pré-requisitos oficiais do Electron recomendam Node.js
  "latest LTS", SEM piso de versão explícito
  ([electron/electron — docs/tutorial/tutorial-1-prerequisites.md](https://github.com/electron/electron/blob/main/docs/tutorial/tutorial-1-prerequisites.md);
  a página `tutorial/development` do site saiu do ar). O electron-vite
  ([electron-vite.org](https://electron-vite.org)) documenta seus requisitos na própria página —
  mas QUEM DEFINE o piso deste projeto é o `engines.node: ">=22.13"` do `app/package.json`.
- **O node da distro não basta para o app**: Debian 12 e Ubuntu 24.04 entregam Node 18.x —
  roda os desafios javascript da engine, não atende o `>=22.13`. Caminhos modernos, na página
  oficial [nodejs.org/en/download/package-manager](https://nodejs.org/en/download/package-manager):
  repositório NodeSource, `nvm`, ou o tarball de
  [nodejs.org/download](https://nodejs.org/download/).
- **`npm ci` do app, o que esperar** ([docs/18 §8.3](../../../docs/18-estado-da-fabricacao-dos-cursos.md)):
  passa de 10 minutos; os postinstalls vêm BLOQUEADOS (o aviso `allow-scripts` do npm é o
  estado normal, não defeito); o dist do Electron não é baixado
  (`ELECTRON_SKIP_BINARY_DOWNLOAD=1`) — é copiado do checkout principal
  (`cp -R app/node_modules/electron/dist`). E `node_modules` parcial fabrica violação fantasma
  (21 violações de orçamento com deps quebradas → 0 com deps íntegras): o veredito dos gates
  vale só com `npm ci` íntegro.
- **jq é dependência real**: os scripts da skill study-method usam `jq`
  (`detect-toolchains.sh --cached --language`, `challenge-new.sh`, `challenge-verify.sh`,
  `lib/json.sh`). Sem jq, a detecção degrada com aviso e alguns scripts falham — instale.

## 6. Emulador Docker — máquina limpa

As receitas do §3 são verificáveis DE ZERO: um contêiner da imagem base oficial prova que o
conjunto instala do nada — é o teste da própria documentação, e a defensiva contra o "funciona
na minha máquina".

### 6.1 O que cada base NÃO traz

Nenhuma das quatro bases oficiais traz python3, gcc, node, cargo ou jq. Nenhuma traz
também `curl`/`ca-certificates` garantidos — trate como ausentes e instale antes de qualquer
download dentro do contêiner (§6.3).

| Ferramenta | ubuntu:24.04 | debian:12 | archlinux | alpine |
|---|---|---|---|---|
| python3 | ausente | ausente | ausente | ausente |
| gcc / build-essential | ausente | ausente | ausente | ausente |
| node + npm | ausente | ausente | ausente | ausente |
| cargo / rustc | ausente | ausente | ausente | ausente |
| jq | ausente | ausente | ausente | ausente |
| curl / ca-certificates | ausente | ausente | ausente | ausente |

Notas por imagem: `debian:12` é construída da variante minbase com só os pacotes "required" —
o pedido para trazer `ca-certificates` por default está aberto desde 2017 no repositório
oficial das imagens; `archlinux` contém só o meta-pacote `base`, e `curl` não é membro dele;
`alpine` tem ~5 MB e nada além do busybox.

Fontes: [hub.docker.com/_/ubuntu](https://hub.docker.com/_/ubuntu) ·
[hub.docker.com/_/debian](https://hub.docker.com/_/debian) ·
[hub.docker.com/_/archlinux](https://hub.docker.com/_/archlinux) ·
[hub.docker.com/_/alpine](https://hub.docker.com/_/alpine) ·
[github.com/archlinux/archlinux-docker](https://github.com/archlinux/archlinux-docker) ·
[debuerreotype/docker-debian-artifacts #15](https://github.com/debuerreotype/docker-debian-artifacts/issues/15)

### 6.2 Montando o emulador

```bash
docker run --rm -it -v "$PWD":/repo -w /repo ubuntu:24.04 bash    # alpine: ... sh
```

O bind-mount do repositório é leitura-escrita de propósito: os gates escrevem diretórios
temporários e o cache do cargo. Cada `docker run --rm` devolve uma máquina limpa — o estado
instalado morre com o contêiner, que é o ponto.

### 6.3 Roteiro de validação ponta a ponta

1. **Detectar na máquina limpa** — a detecção deve devolver `available: false` para as cinco
   linguagens; se devolver `true`, a base não está limpa:

   ```bash
   python3 skills/study-method/scripts/detect-toolchains.sh
   ```

2. **Instalar** a receita da família (§3) — em ubuntu/debian, os pré-requisitos de rede vêm
   primeiro, porque `curl`/`ca-certificates` não estão lá:

   ```bash
   apt-get update && apt-get install -y ca-certificates curl
   ```

   Em arch, é o `pacman -Sy` que vem antes de instalar: o `--ensure` do
   `_ensure-toolchain.sh` roda `pacman -S --needed --noconfirm` SEM o `-Sy` de propósito
   (sincronizar a base de dados é preparo do operador, não parte da instalação). Se o
   `-Sy` falhar por assinatura ou base de dados velha (snapshot antigo da imagem), instale
   o keyring e repita:

   ```bash
   pacman -Sy || { pacman -Sy --noconfirm archlinux-keyring && pacman -Sy; }
   ```

3. **Provar** cada toolchain com os quatro blocos do §2 (cada um deve sair exit 0 com UM teste
   rodado).

4. **Rodar os gates** ([validacao.md](validacao.md)):

   ```bash
   cd app && npm ci          # §5: mais de 10 min; postinstalls bloqueados é o estado normal
   npm run engine -- audit python-iniciante --limite 0
   npm run engine -- coverage python-iniciante
   npm run engine -- requirements python-iniciante
   npm run track -- track:validate python-iniciante
   ```

   Para a trilha rust dentro do contêiner, exporte `RUSTUP_HOME`/`CARGO_HOME`/`PATH` (§4) —
   dentro do emulador vale a mesma regra dos gates.

## 7. Fontes

Receitas de pacotes (páginas oficiais das distros e gerenciadores):

- Debian: [wiki.debian.org/Python](https://wiki.debian.org/Python) ·
  [packages.debian.org/bookworm/build-essential](https://packages.debian.org/bookworm/build-essential) ·
  [packages.debian.org/bookworm/clang](https://packages.debian.org/bookworm/clang) ·
  [packages.debian.org/bookworm/jq](https://packages.debian.org/bookworm/jq)
- Ubuntu: [packages.ubuntu.com/noble/python3](https://packages.ubuntu.com/noble/python3) ·
  [packages.ubuntu.com/noble/build-essential](https://packages.ubuntu.com/noble/build-essential) ·
  [packages.ubuntu.com/noble/jq](https://packages.ubuntu.com/noble/jq)
- Fedora: [packages.fedoraproject.org/pkgs/python3](https://packages.fedoraproject.org/pkgs/python3) ·
  [packages.fedoraproject.org/pkgs/clang](https://packages.fedoraproject.org/pkgs/clang) ·
  [packages.fedoraproject.org/pkgs/jq](https://packages.fedoraproject.org/pkgs/jq) ·
  [fedoraproject.org/wiki/Development_Tools](https://fedoraproject.org/wiki/Development_Tools)
- Alpine: [pkgs.alpinelinux.org/packages](https://pkgs.alpinelinux.org/packages)
  (consulte por `python3`, `build-base`, `clang`, `nodejs`, `jq`, `rust`)
- Arch: [archlinux.org/packages](https://archlinux.org/packages/) ·
  [archlinux.org/packages/extra/x86_64/clang](https://archlinux.org/packages/extra/x86_64/clang/) ·
  [archlinux.org/groups/x86_64/base-devel](https://archlinux.org/groups/x86_64/base-devel/) ·
  [wiki.archlinux.org/title/Rust](https://wiki.archlinux.org/title/Rust)
- macOS: [developer.apple.com/xcode/resources](https://developer.apple.com/xcode/resources/) ·
  [formulae.brew.sh/formula/node](https://formulae.brew.sh/formula/node)
- Node: [nodejs.org/en/download/package-manager](https://nodejs.org/en/download/package-manager) ·
  [nodejs.org/learn/node-api/getting-started/tools](https://nodejs.org/learn/node-api/getting-started/tools)

Rust/rustup (o livro oficial do rustup):

- [rustup.rs](https://rustup.rs) ·
  [rustup book — Installation](https://rust-lang.github.io/rustup/installation/index.html) ·
  [rustup book — Environment variables](https://rust-lang.github.io/rustup/environment-variables.html) ·
  [rustup book — Profiles](https://rust-lang.github.io/rustup/concepts/profiles.html) ·
  [Cargo Book — cargo install](https://doc.rust-lang.org/cargo/commands/cargo-install.html)

Electron e Docker:

- [electron/electron — docs/tutorial/tutorial-1-prerequisites.md](https://github.com/electron/electron/blob/main/docs/tutorial/tutorial-1-prerequisites.md) ·
  [electron-vite.org](https://electron-vite.org)
- [hub.docker.com/_/ubuntu](https://hub.docker.com/_/ubuntu) ·
  [hub.docker.com/_/debian](https://hub.docker.com/_/debian) ·
  [hub.docker.com/_/archlinux](https://hub.docker.com/_/archlinux) ·
  [hub.docker.com/_/alpine](https://hub.docker.com/_/alpine) ·
  [docs.docker.com — CA certificates](https://docs.docker.com/engine/network/ca-certs/)
