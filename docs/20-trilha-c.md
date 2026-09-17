# 20 — Trilha C: o contrato de conteúdo da cadeia de C

> **Contrato de CONTEÚDO dos quatro cursos de C** — `c-iniciante`, `c-intermediario`,
> `c-avancado` e `c-especialista`. Não é "C do zero" nem "C avançado": é **a cadeia de C**, do
> primeiro `printf` até o que se cobra de quem mantém C em produção. Este documento define O QUÊ
> cada módulo e cada aula ensinam e o que se presume que o aluno já sabe, seguindo a forma viva de
> [`17-trilha-python.md`](17-trilha-python.md) — a coluna `Ensina` vira `introduces`, a coluna
> `Presume` vira o grafo de pré-requisitos e o orçamento cumulativo de
> [`16-engine-de-trilha.md`](16-engine-de-trilha.md) §3.5.
>
> **Autoria agora: SÓ o `c-iniciante`.** A cadeia inteira está desenhada (§1); a **fabricação é
> incremental** — precedente: [`18-estado-da-fabricacao-dos-cursos.md`](18-estado-da-fabricacao-dos-cursos.md),
> onde o `python-iniciante` foi entregue curso inteiro antes de qualquer curso seguinte ser
> autorado. Os cursos 2–4 deste documento são **desenho normativo de fronteira**, não tabela de
> aula: as tabelas aula por aula deles só existem quando a onda que autora cada curso as contar
> (§1, "a regra de fechamento").
>
> **Autoridade.** Onde este documento e [`16-engine-de-trilha.md`](16-engine-de-trilha.md)
> divergirem, o 16 vence. Onde este documento e um gate determinístico divergirem, o gate vence — e
> este documento está errado. O vocabulário de átomos deste documento foi **CONGELADO na onda 2** e
> **RE-CONGELADO nas ondas 3–4** contra o `inventory()` real do adaptador C
> (`app/electron/main/engine/lang/c.ts`, função `cInventory()` — hoje **34 kinds** — e
> `app/electron/main/engine/vocab/c/extract_ast.py`, tabela `_EMITIDOS` + os guards de
> `tagUsed`/macro — o adaptador existe e é irmão deste documento na `lang/`) e contra a semente
> receptiva medida (`app/electron/main/engine/atomKeys.ts`, `C_HARNESS_RECEPTIVE_SEED` — **19
> chaves**). A verificação executável Ensina × Presume roda em
> `tools/check-trilha-c.mjs` (§"A verificação"). As construções que as ondas 3–4 deixaram SEM chave
> estão registradas na §8.2 — 4 delas por NATUREZA (prosa, sem nó no AST) e 2 em defer; as seis
> pendências P1–P6 da onda 2 **saíram com chave medida** (§8.2).
>
> **Base.** Fatos de linguagem medidos nesta máquina (cada linha traz o número que o comando
> produziu, como exige o `CONTRIBUTING.md`): a matriz de execução de C de
> `skills/study-method/references/languages.md` (gcc 16.2.1, `-std=c11`; o `assert.h`/exit **134**
> medido lá é a armadilha que torna o `counter_protocol` obrigatório —
> [`03-tdd`](build-spec/blocks/03-tdd.md) §3.7.1) re-medida nesta execução com o MESMO comando
> (Apple clang 17.0.0 — mesmo pin, mesmo comportamento medido, §4);
> os princípios de [`02-pedagogia.md`](02-pedagogia.md); e, como fontes externas nomeadas,
> Brian W. Kernighan & Dennis M. Ritchie, *The C Programming Language* ("C is a relatively 'low
> level' language"; "the only way to learn a new programming language is by writing programs in
> it") e Dennis M. Ritchie, *The Development of the C Language*.

## 1. A cadeia — os quatro cursos de C

A cadeia tem quatro cursos encadeados. O `c-iniciante` é a **porta da cadeia** (zero absoluto, sem
módulo porta-de-entrada — §2); cada curso seguinte recorta uma faixa da espinha e ganha, quando
preciso, um módulo porta-de-entrada que re-introduz as construções de fronteira do curso anterior
(§2). As fronteiras vêm do que a pessoa consegue **fazer sozinha** — nunca de rótulo
(`references/interligacao.md` §2).

| Slug | Título | Módulos | Aulas | Fronteira de SAÍDA (o que a pessoa passa a conseguir) | `entryCriteria` (o que o curso presume ao entrar) |
|---|---|---|---|---|---|
| `c-iniciante` | Do primeiro `printf` ao programador C de arquivos | M1–M7 | **115** | **programa C inteiro, sozinho** — escrever um programa C de dois arquivos com funções próprias declaradas em `.h`, structs, arrays e strings, leitura/escrita de arquivo com `stdio`, compilado por ela com `-std=c11 -Wall -Wextra` e **zero warnings** (fim do M7, a aula `consolidacao-structs-arquivos`) | **nada** — zero absoluto: axiomas estruturais + semente receptiva do harness (§"Público e axioma de entrada") |
| `c-intermediario` | Da memória medida ao C que o compilador enxerga | `a-porta-do-endereco` + M8–M15 | ~12 + ~100 | **memória sob comando** — alocar e liberar (`malloc`/`free`/`realloc`) sem vazamento medido, ponteiros para ponteiros e para função, recursão com caso base, `union`/`enum`/bit a bit, multi-arquivo com linker limpo e debugger (`gdb`) + sanitizers (`-fsanitize=address,undefined`) como rotina | a saída do iniciante — o programador de arquivos de M1–M7, com ponteiros, structs e arquivos re-introduzidos na porta |
| `c-avancado` | Do C que roda ao C que se mede | `a-porta-da-medicao` + M16–M19 | ~8 + ~30 | **sênior, medindo** — medir antes de decidir (`perf`, cache, alinhamento/padding), concorrência com `pthreads` e `atomics` pelo memory model do C11, build determinístico (`make`), e a ABI como contrato | a saída do intermediário — o dominador de memória de M8–M15 |
| `c-especialista` | O capô aberto do C | `a-porta-do-metal` + M20–M22 | ~8 + ~28 | **o capô aberto** — undefined behavior por dentro (o que o otimizador pode fazer), memory model e reordenamento, ABI de chamada, expor C a outras linguagens (FFI) e ler o padrão (N3220) como instrumento de trabalho | a saída do avançado — o sênior que mede de M16–M19 |

**Total previsto da cadeia: 7 + 3 módulos porta · ~301 aulas** (115 contadas nas tabelas de §3 +
~186 previstas nas faixas dos cursos 2–4). O número de aulas é **saída, não entrada**
([`16`](16-engine-de-trilha.md) §3.6): consequência do teto de ≤2 construções produtivas novas por
aula (regra do par) sobre a progressão atômica. As faixas dos cursos 2–4 são **previstas**; a
contagem final de cada curso sai das tabelas que a sua onda de autoria escrever, não deste resumo.
O que é normativo já agora: as fronteiras (coluna 5) e as portas (§2).

### As fronteiras em duas frases por curso

- **`c-iniciante` → `c-intermediario`.** Sai quem escreve um programa C inteiro sozinha — funções
  com protótipos, structs, arrays e strings, arquivos com `stdio`, compilação própria em `.h`/`.c`
  com zero warnings — e ainda **não sabe onde a memória que o programa usa nasce e morre**. Entra
  no intermediário quem vai assumir esse controle (`malloc`/`free`) sem mais pedir ao compilador
  que adivinhe tamanhos.
- **`c-intermediario` → `c-avancado`.** Sai quem domina memória e ferramentas (sanitizers,
  debugger, multi-arquivo) mas ainda **decide por intuição**; entra no avançado quem passa a medir
  (custo de cache, alinhamento, concorrência) antes de decidir.
- **`c-avancado` → `c-especialista`.** Sai quem mede e concorre com critério; entra no
  especialista quem abre o capô — o que o padrão promete, o que o compilador pode fazer, e o que a
  ABI obriga — e passa a ler o N3220 como quem lê um contrato.

## 2. A cadeia de interligação e os módulos porta-de-entrada (P-CADEIA)

**Por que cada curso é autocontido para a engine.** O orçamento cumulativo é derivado **por
trilha** ([`16`](16-engine-de-trilha.md) §3.5): `budget_entrada(N) = entryConstructs ∪
fecho-para-baixo(desbloqueado_por(N))`, e `entryConstructs` é **axiomas estruturais + semente
receptiva do harness** — **não existe entrada declarada por construção**. A trilha
`c-intermediario` não pode declarar "o aluno já sabe ponteiros": o que ela usa, ela re-introduz em
aulas próprias. Por isso o mecanismo da porta-de-entrada vale para os três cursos seguintes
exatamente como vale na cadeia de Python (docs/17 §1), e a **regra de fechamento** é normativa:
todo átomo produtivo que as tabelas de um curso usam e que não tem origem naquela trilha ganha
aula própria no módulo porta.

**O `c-iniciante` é a porta da cadeia — e não tem porta.** Ele parte do zero absoluto: a entrada é
o axioma produtivo (§"Público e axioma de entrada") e a semente receptiva do harness C. Cada
curso seguinte re-introduz as construções de fronteira do anterior em aulas próprias:

| Porta (prevista) | De → para | Re-introduz (as construções de fronteira) |
|---|---|---|
| `a-porta-do-endereco` (~12 aulas) | iniciante → intermediário | `decl:var` em forma nova (ponteiro e array — o inventário emite `decl:var` para os dois), `op:unary:*`, `op:unary:&`, structs e acesso a campo (com chave medida: `node:RecordDecl`/`node:MemberExpr` — §8), `api:strlen`, `api:fopen`/`api:fprintf`/`api:fgets` — as aulas-fonte 8–14 do M5, 1–11 do M6 e 9–14 do M7, reescritas para "quem vem do iniciante" |
| `a-porta-da-medicao` (~8 aulas) | intermediário → avançado | ponteiros para função, recursão, `malloc`/`free`, multi-arquivo com linker, `gdb`/sanitizers — o que M16+ presume medir |
| `a-porta-do-metal` (~8 aulas) | avançado → especialista | `pthreads`/`atomics`, `make`, ABI, alinhamento — o que M20+ presume abrir |

**Nota de desenho (a semente de cada porta).** As aulas das portas são **previstas**, não
tabeladas: a onda que autora cada curso as conta contra o inventário da sua trilha. O que já é
normativo: (a) a porta existe; (b) cada aula dela tem `introduces` próprios **naquela trilha** (a
unicidade de origem I3 percorre por curso, como em docs/17); (c) o `entryCriteria[]` do
`track.json` declara as competências da coluna 6 de §1.

## 3. O conteúdo pedagógico — a espinha do `c-iniciante`

Esta seção é o desenho integral do curso que vai ser autorado: 7 módulos, 115 aulas, com a MESMA
progressão pedagógica da espinha de Python (tela → decisão → repetição → funções que devolvem →
arrays e ponteiros → strings em profundidade → a "coleção" da linguagem — em C, structs e
arquivos).

---

### A aula 1 é só `printf`, e é uma ordem do dono

O dono já decidiu isto para a cadeia inteira, em palavras registradas no docs/17 (§"A aula 1 é só
`print`"): "**TODOS OS CURSOS COMECAM DO ZERO E VAO ATE O SENIOR**", e a primeira aula "deveria ser
só um `console.log` e acabou". Para C a mesma decisão significa:

```c
printf("oi\n");
```

Uma linha, escrita pelo aluno, dentro da função congelada (abaixo), sem variável, sem `scanf`,
sem nada além da linha. Ele roda, vê `oi` aparecer, e acabou. Tudo o que vem abaixo — a ordem dos
módulos, o formato dos testes, o axioma de entrada — é consequência dessa decisão, não o contrário.

**O modelo cenário-do-harness (re-pinado na onda 2, contra o que o adaptador executa de verdade).**
C não tem modo script: nada roda fora de uma função, e o `main` — SEMPRE — é do harness
(`lang/c.ts`: o `main` do harness é decisão documentada do adaptador; um `main` em `solucao.c`
não linka — `duplicate symbol '_main'`). O análogo honesto do script Python de uma linha é o
programa cujas partes fixas o aluno **lê e nunca edita** (`frozenRegion`, como o arquivo de
teste): o `main` do harness chama a função que o aluno escreve, e a captura do `stdout` acontece
DENTRO do próprio teste (freopen para arquivo temporário — §"A tensão imprimir × devolver"):

```c
/* main do harness — o aluno LÊ, nunca edita (frozenRegion) */
#include <stdio.h>

void tela(void) {
    printf("oi\n");   /* ← a linha que o aluno escreve */
}
/* … o main do harness chama tela(); captura o stdout; devolve o exit — congelado … */
```

Nas **aulas 1–3** o aluno usa a função congelada `tela` com graus crescentes: escreve só o corpo
(aula 1), escreve a função inteira (aula 2) e LÊ o `return 0;` do `main` do harness — o código de
saída (aula 3); na **aula 4** ele escreve o `#include <stdio.h>` do SEU arquivo — e vê o aviso do
compilador quando esquece. A partir da aula 2 ele já escreve funções C inteiras; a competência
"escrever um programa C inteiro sozinho" (§1) é fechada no M7, quando o `.h`/`.c` e a compilação
própria entram — e a compilação por ela mesma com 0 warnings é PRÁTICA DE TERMINAL descrita na
prosa, não gate do desafio (o adaptador não tem caminho de dados para warnings — §4).

---

### A tensão imprimir × devolver, e a virada em C

O modo de falha nº 1 de exercício gerado (a solução imprime enquanto o teste espera retorno —
30,9% medido em docs/16 §10) não depende de linguagem. A progressão de canal é a mesma em três
fases, com a virada na aula `imprimir-nao-e-devolver` (M4):

| Fase | Módulos | `outputChannel` | O que o teste assevera |
|---|---|---|---|
| **SAÍDA** | M1 a M3 | `impressao` | o texto que a função do aluno imprimiu (`stdout` capturado DENTRO do próprio teste) |
| **A VIRADA** | M4, aula `imprimir-nao-e-devolver` | `ambos` | o retorno **e** a saída, no mesmo desafio |
| **VALOR** | M4 (a partir da virada) a M7 | `retorno` | o valor que a função devolveu (comparado pelo helper `checa_<tipo>` do `counter_protocol`) |

O que muda de forma para C é **como** o teste mede cada fase — pinado na onda 2 contra o que o
adaptador executa de verdade (repro empírica de `SM_HARNESS_HEADER`/`SM_MAIN_SOURCE`/
`SM_RUNNER_SCRIPT` de `lang/c.ts`):

- **SAÍDA — modelo cenário-do-harness.** `solucao.c` NUNCA tem `main` (o `main` é sempre do
  harness — um `main` do aluno não linka: `duplicate symbol '_main'`; e o `stdout` do programa só
  chega à engine num run que FALHA, o que tornaria a captura-do-runner inimplementável para um
  teste que passa). O desafio da fase SAÍDA verifica a impressão chamando a FUNÇÃO do aluno e
  capturando o `stdout` NO PRÓPRIO TESTE: `freopen` de `stdout` para arquivo temporário dentro de
  `testsCode` (stdlib puro, roda no harness atual sem mudança de engine), depois asserção com o
  helper `checa_<tipo>` do `counter_protocol`. O aluno nunca escreve nada disso: é semente
  receptiva (abaixo).
- **VALOR**: `test_solucao.c` declara os **protótipos** das funções do aluno no topo (congelados) e
  assevera o retorno com o helper do `counter_protocol` —
  `checa_int("o dobro de 2 e 4", dobro(2), 4, "o dobro de n é n × 2");`. **Regra de harness
  declarada (re-prefinada na onda 4, com repro medida):** o teste NUNCA usa `#include` de header do
  desafio — o protótipo solto no topo é a forma autorizada EM TODA aula, inclusive depois do M7,
  porque o `countDeclared` da engine parseia o teste num tempdir VAZIO (`lang/c.ts`:
  `cParse(SM_COUNT_PREABULO + testsCode)`): um `#include "../ponto.h"` no teste não resolve lá
  (`clang: fatal error: '../ponto.h' file not found`, medido com as mesmas flags do adaptador), a
  contagem declarada vira **0** e a dupla-igualdade reprova. O header do próprio desafio é
  incluído por QUEM O USA no programa: o `.c` do aluno (`ponto.c` abre com `#include "ponto.h"` —
  é o conteúdo da aula `a-biblioteca-em-dois-arquivos`) e o `main.c` de LEITURA da teoria; o
  `solucao.h`/`ponto.h` entra como arquivo do ALUNO (`files[]`) só a partir dessa aula.
- **A VIRADA**: os três fatos do desafio são normativos (devolve; imprime; **chamar a caixa
  sozinha não imprime nada**). A mecânica do terceiro fato em C é a MESMA da fase SAÍDA: capturar
  o `stdout` de uma chamada dentro do processo do teste (`freopen` para arquivo temporário em
  `testsCode`) — pinada na onda 2 com as provas de execução rodando.
- **Exit codes desta trilha (D-V11, `languages.md`)**: o teste sai `return falhas == 0 ? 0 : 1`
  (`counter_protocol`) e o runner **normaliza** o exit bruto para **0** passou · **1** falhou ·
  **2** contagem errada · **3** timeout, ecoando `EXIT_BRUTO` e `DECORRIDO_MS` no stdout — o
  diagnóstico bruto não se perde (134=`SIGABRT` de `assert.h`, 5=zero testes coletados, 137=morto);
  **66** é erro de infraestrutura ([`00-contratos.md`](00-contratos.md) §5.3); **qualquer outro
  código após a normalização é defeito do runner**, nunca sinal para o aluno. Timeout **não** é
  detectável por exit code — se detecta por tempo decorrido (`DECORRIDO_MS`; com `-s KILL` o bruto
  chega 137) e vira o exit **3** da normalização (`languages.md` §7, D-V11).

O formato exato dos arquivos de teste C (o análogo dos três formatos de docs/17) será congelado na
onda 3 (template de prova), já com as quatro provas de execução (`track:challenge:verify`) rodando
sobre desafios C reais. O que já vale agora é o **`counter_protocol`**
([`03-tdd`](build-spec/blocks/03-tdd.md) §3.9.3, [VERIFICADO em C]): o teste C **não usa
`assert.h`** — o `assert` aborta no PRIMEIRO erro com `SIGABRT` (exit 134) e esconde os demais
cenários, inaceitável num teste cujo propósito é enumerar cenários (§3.7.1) — e é `frozenRegion`
inteira (`tests/__init__.py` não existe em C; não há módulo). Cada cenário é asseverado por um
helper `checa_<tipo>(cenario, obtido, esperado, porque)` sobre dois contadores
`static int total, falhas` — **o rótulo que o veredito mostra é o `cenario` do helper, uma frase em
pt-BR**: a promessa didática sobrevive, agora por CENÁRIO em vez de por `assert` (o papel da
docstring do Python):

```c
checa_int("o dobro de 2 e 4", dobro(2), 4,
          "o dobro de n é n × 2");
```

Na divergência, o helper incrementa `falhas` e imprime em **stderr** `FALHOU [<cenario>]: obtido
…, esperado …. <porque>` — e **nunca aborta**: um cenário vermelho não impede os seguintes de
rodar. **Semântica do `TESTS_RUN` (re-pinada na onda 2, medida no adaptador):** o contador que o
gate confere por IGUALDADE contra `expectedTestCount` é o de **CENÁRIOS** — os blocos `SM_TEST`
(`SM_TEST(cenario) { … }`), não as chamadas de `checa_<tipo>` (medido: 2 blocos `SM_TEST` com 3
`checa_int` imprimem `TESTS_RUN=2`); são **1–4 cenários por desafio de aula**. Os contadores
`total`/`falhas` do `counter_protocol` continuam contando CHECAS para o exit
(`return falhas == 0 ? 0 : 1`), nunca `> 0` como gate (DES-4, [`03-tdd`](build-spec/blocks/03-tdd.md)
§3.7.2). **Guard de contagem:** a linha nunca aparece nua no stdout — o relatório real é
`SM<nonce> TESTS_RUN=…` (namespace do runner) e o canal CONFIÁVEL é o **arquivo de relatório com
nonce**, que o `run.sh` lê (não o stdout — que a captura pode poluir). Filtro `--only` via
`getenv("SM_ONLY")`: contrato integral de
[`03-tdd`](build-spec/blocks/03-tdd.md) §3.9.3, com a semântica de exit de D-V11.

---

### Público e axioma de entrada

**Público: quem nunca programou.** Zero absoluto — essa é a entrada do `c-iniciante`, e é a única
entrada declarada na cadeia (§1). A mesma pessoa, curso a curso: **115** aulas depois (fim do M7)
escreve um programa C inteiro sozinha; os cursos seguintes partem dessa fronteira (§1). Este
documento não promete prazos — promete a cadeia.

**Axioma de entrada RECEPTIVO: a função congelada e o runner.** O que o aluno lê e não escreve em lugar
nenhum: o `main` congelado das primeiras aulas e o arquivo de teste. A lista da constante
`C_HARNESS_RECEPTIVE_SEED` da engine (`app/electron/main/engine/atomKeys.ts`) foi **MEDIDA nas
ondas 3–4** sobre os TUs do harness real (`SM_HARNESS_HEADER`/`SM_MAIN_SOURCE` + o envelope de
captura da fase SAÍDA) e ficou em **19 chaves** — a lista preliminar da onda 2 (25 chaves,
incluindo `node:ReturnStmt`/`node:ArraySubscriptExpr`/`op:*`) foi SUBSTITUÍDA por ela: a semente
não perdoa CONTEÚDO do curso, só o envelope que o próprio harness escreve:

```
api:SM_TEST  decl:func  node:CallExpr  node:IntegerLiteral  node:StringLiteral
node:TypedefDecl  api:fprintf  api:fflush  api:fclose  api:fopen  api:getenv
api:strcmp  global:stderr  api:freopen  api:fgets  global:stdout  node:DeclStmt
decl:var  node:IncludeDirective
```

A composição, grupo a grupo: o **envelope** do `counter_protocol` (`api:SM_TEST`, `decl:func`,
`node:CallExpr`, `node:IntegerLiteral`, `node:StringLiteral`) mais o **typedef do próprio
harness** (`typedef void (*SmTestFn)(void);` → `node:TypedefDecl`) e as chamadas dos TUs do main
(`api:fprintf`/`api:fflush`/`api:fclose`/`api:fopen`/`api:getenv`/`api:strcmp`,
`global:stderr`); e as **seis do envelope de captura** da fase SAÍDA (onda 4):
`api:freopen`, `api:fgets`, `global:stdout`, `node:DeclStmt`, `decl:var`,
`node:IncludeDirective`. Três fronteiras declaradas: (1) `decl:var` é **RECEPTIVA APENAS** — é
conteúdo ensinado em M1 a7 (`um-nome-para-um-valor`), mas o envelope do teste declara `FILE*`/
`char[]` antes; a solução antecipada continua REPROVANDO no A2 (o precedente é o
`node:TypedefDecl` da onda 3). (2) `node:IncludeDirective` idem — o `testsCode` SEMPRE abre com
`#include <stdio.h>` próprio (regra 3 do `prova-c.md` §2 — sem ele a contagem declarada vira 0):
envelope, não escolha do autor; a aula M1 a4 continua ENSINANDO o include como conteúdo
produtivo. (3) O que o harness NÃO perdoa: `node:IndirectCall` (proibição global), e todo
CONTEÚDO de curso (`node:IfStmt`/`node:ForStmt`/`op:*`/…) — o testsCode que USAR essas
construções é o autor exigindo do aluno o que ele ainda não leu: reprovação legítima, não ruído.

**Axioma de entrada PRODUTIVO: duas chaves, e só duas.**

| Chave | Por que é axioma e não aula |
|---|---|
| `node:CallExpr` | não existe programa em C que **faça** alguma coisa sem uma chamada de função (`printf` é uma). Uma aula "chamar" precisaria de um desafio em que o aluno chama algo — e não há nada para chamar antes de `printf`. É a gramática de "rodar", não conteúdo |
| `node:StringLiteral` | é a mensagem que o `printf` mostra. Separar as duas exigiria uma aula "chamar `printf` sem argumento", que não mostra nada na tela e viola J6 (o passo apagado tem de ser o átomo-alvo) |

**Consequência: a aula 1 introduz EXATAMENTE UM átomo produtivo — `api:printf`.** Medido nesta
máquina, o programa de uma linha dentro da função congelada compila com o pin da trilha, roda e sai
`oi\n` com exit 0:

```bash
printf '#include <stdio.h>\nint main(void){printf("oi\\n");return 0;}\n' \
  | cc -std=c11 -Wall -Wextra -Wpedantic -x c - -o /tmp/c-hello && /tmp/c-hello
# stdout: oi   ·   exit 0   ·   0 warnings
```

Isso satisfaz o gate inteiro: **A6** (a solução contém `api:printf`), **A7** (1 ≤ 2), **A14b** (1
construção nova na única linha), **A13** (a primeira seção da teoria demonstra `printf("oi\n")` em
bloco `c`). Alargar o axioma além das duas chaves é proibido: é o botão que faz o gate perdoar em
silêncio o que a trilha nunca ensinou.

---

### Os fatos da linguagem que governam esta trilha

Medidos nesta execução (Apple clang 17.0.0, que neste sistema é o `gcc` do PATH); a matriz de
`skills/study-method/references/languages.md` mediu o MESMO comando no gcc 16.2.1 — o pin é
portável entre as duas máquinas do produto:

```bash
cc --version                       # Apple clang version 17.0.0 (clang-1700.0.13.5)
printf '...cprobe...' | cc -std=c11 -Wall -Wextra -x c - -o /tmp/cprobe && /tmp/cprobe
```

| Fato (medido) | Consequência de currículo |
|---|---|
| `7 / 2` → **3** · `17 % 5` → **2** | a divisão inteira corta: é aula própria (`multiplicar-e-dividir`, `o-resto`) e a motivação do cast real (`a-divisao-real`) |
| `sizeof(int)` → **4** · `sizeof(double)` → **8** · `sizeof(char)` → **1** · `sizeof(bool)` → **1** · `sizeof(int[5])` → **20** | o tipo tem TAMANHO e ele é uma aula (`quantos-bytes`, M5); `20 = 5 × 4` é a prova de que o array repete o molde |
| `strlen("abc")` → **3** | o terminador `\0` não conta: é a aula que abre o M6 |
| `printf("%c", 'A' + 1)` → **B** | letra é número: a aula `uma-letra-e-um-numero` (M1) semeia o M6 inteiro |
| `INT_MAX` → **2147483647** | o limite é impresso, não decorado; overflow é prosa de aviso (UB), nunca desafio |
| `x = 10; x += 3;` → **13** | a atribuição composta é um gesto só (regra do par: `op:assign:+=`) |
| `assert.h` que falha → exit **134** (`SIGABRT`) no PRIMEIRO erro, medido | é o motivo de o teste C desta trilha NUNCA usar `assert.h`: o `counter_protocol` é obrigatório ([`03-tdd`](build-spec/blocks/03-tdd.md) §3.7.1, §3.9.3); a falha sai como `TESTS_FAILED` > 0 em stdout e exit 1 — sem abortar os cenários seguintes |
| **Não existe `input()`/`print()` de nível script** | toda E/S passa por `printf`/`scanf` com FORMATO: o `%d` é evento de currículo (aula `buraco-na-frase`) antes da variável — descrito em prosa na célula (o eixo `fmt:` não existe no inventário; §8) |
| **Não existe modo script** — tudo nasce dentro de `main` | o `main` do harness é a semente receptiva (LEITURA); `decl:func` é aula (a 2ª, a função que o aluno escreve), e `node:ReturnStmt` ganha ESCRITA no M4 (§"A tensão A6 × I3") |
| **O compilador lê de cima para baixo** | protótipo é aula própria (`declarar-antes-de-usar`, M4); sem ele, chamar antes de definir não compila |
| **O array não sabe o próprio tamanho** | `sizeof v / sizeof v[0]` funciona só onde o array foi declarado; dentro de função o tamanho viaja como parâmetro (`a-lista-como-parametro`) |

---

### Vocabulário de átomos desta trilha — CONGELADO (onda 2)

O vocabulário foi **CONGELADO na onda 2** e **RE-CONGELADO nas ondas 3–4** contra o `inventory()`
real do adaptador C (`app/electron/main/engine/lang/c.ts`, `cInventory()` + `cConstructKey()`; e
`app/electron/main/engine/vocab/c/extract_ast.py`, `_EMITIDOS` + `_familia_do_operador` +
os guards de `tagUsed`/macro — confirmado olho nu nas duas fontes). O adaptador emite CINCO eixos:
`node:` (os **34 kinds** do `cInventory()` — os 28 da onda 2 mais `RecordDecl`, `MemberExpr`,
`TypedefDecl`, `ConditionalOperator`, `SwitchStmt` e `CStyleCastExpr`, medidos na onda 3),
`decl:` (`decl:func` · `decl:var`), `op:` (`op:assign:` · `op:binary:` ·
`op:logical:` · `op:unary:` · `op:update:`), `global:` (`stdin`/`stdout`/`stderr`) e `api:`
(aberto por formato: toda função externa chamada). Os eixos preliminares que NÃO existem no
adaptador (`fmt:`, `hdr:`, `type:`, `cast:`, `qualifier:`, `op:compare:`, `op:bool:`, `op:aug:`)
foram remapeados célula a célula (o mapa integral está no §8.1); das construções que a onda 2
encontrou sem chave, as SEIS curriculares ganharam chave medida (§8.2, P1–P6), quatro ficaram
**prosa sem chave por natureza** (sem nó no AST ou macro — P7–P10) e duas seguem em **defer**
(P11–P12). A verificação executável (`tools/check-trilha-c.mjs`) rejeita qualquer chave fora do
congelado (fail-closed).

Três decisões de vocabulário congeladas, com o motivo:

1. **`decl:` ficou com DOIS valores: `decl:func` e `decl:var`.** O adaptador seguiu o partido do
   Python ("a didática mora na FORMA"): `decl:var` cobre TODA declaração de variável — escalar,
   array, array 2D, ponteiro — e o tipo/literal não ganham chave (o clang JÁ separa os literais
   em kinds: `node:IntegerLiteral`, `node:FloatingLiteral`, `node:CharacterLiteral`,
   `node:StringLiteral`); o parâmetro é `node:ParmVarDecl` (estrutura de toda função, não aula).
   Consequência: as aulas que ensinavam `decl:array`/`decl:ptr`/`type:` viram **consolidações
   "em forma nova" de `decl:var`** com o distinguível real na célula (literal, inicializador,
   `*`/`[]`). Struct emite `node:RecordDecl` e typedef emite `node:TypedefDecl` desde a onda 3
   (§8.2, P1/P3).
2. **Atribuição é família `op:assign:` — com os compostos dentro.** `x = 10;` é `op:assign:=`;
   `x += 3;` é `op:assign:+=` (o adaptador NÃO tem `op:aug:` — compostos são
   `CompoundAssignOperator` com o opcode COMPOSTO no mesmo eixo: medido nesta execução com
   `cc -Xclang -ast-dump=json`, `x += 3` carrega `opcode: '+='` — a chave é `op:assign:+=`, não
   `op:assign:+`); `++`/`--` são `op:update:++`/`op:update:--` (NÃO `op:unary:`); a
   **inicialização na declaração** (`int x = 10;`) continua parte de `decl:var`.
3. **Comparação é `op:binary:` — o adaptador NÃO refinou família própria.** `==`/`!=`/`<`/`<=`/`>`/`>=`
   são `BinaryOperator` e emitem `op:binary:<op>`, como o doc antecipava ("se não refinar, as
   aulas de comparação continuam nas mesmas posições, com as chaves que o `inventory()` emitir" —
   confirmado). E/ou é `op:logical:` (`&&`/`||` — família própria, curto-circuito é aula própria).

#### A regra do par — o mapa de derivadas congelado

Vale a redação normativa de docs/17, reproduzida por ser o que a verificação implementa:

> **A tabela `Ensina` lista só a chave que DISTINGUE. O gerador de `introduces` acrescenta as
> chaves que a mesma construção produz inevitavelmente, e o conjunto conta como UM item para
> A7/I2.**

O mapa de derivadas é mecânico, congelado contra `cConstructKey`/`extract_ast.py`:

| Chave listada em `Ensina` | Derivadas que a mesma construção produz |
|---|---|
| `decl:var` (com inicializador) | o literal da inicialização (`node:IntegerLiteral`, `node:FloatingLiteral`, `node:CharacterLiteral`, `node:StringLiteral`); `node:InitListExpr` quando entre chaves; `node:DeclStmt` (o nó container da declaração) |
| `decl:func` | `node:CompoundStmt` (o corpo); `node:ParmVarDecl` só quando a aula é a de parâmetro; caso contrário nada |
| `op:binary:<qualquer>` | `node:BinaryOperator` (o nó container) |
| `op:logical:<qualquer>` | `node:BinaryOperator` (idem) |
| `op:unary:<qualquer>` | `node:UnaryOperator` (o nó container) |
| `op:assign:<qualquer>` | `node:CompoundAssignOperator` quando composto; `node:BinaryOperator` quando simples (`=`) |
| `op:update:<qualquer>` | `node:UnaryOperator` (o clang só muda `isPostfix`) |
| `op:unary:sizeof` | `node:UnaryExprOrTypeTraitExpr` é o MESMO nó (a chave sai do atributo) |
| `api:<qualquer>` | `node:CallExpr` + `node:ApiRef` (os portadores da chamada externa) |
| `global:<stream>` | `node:DeclRefExpr` + `node:GlobalRef` (os portadores da referência) |
| `node:RecordDecl` | os campos (`FieldDecl`) são TRANSPARENTES — a ficha é UM evento; a variável-ficha declarada no mesmo gesto emite `decl:var` (VarDecl) |
| `node:MemberExpr` | o `.` e o `->` vão no atributo `memberAccess` (`dot`/`arrow`) — UMA chave para as duas formas |
| `node:TypedefDecl` | os TypedefDecls builtin (`__int128_t` e família) são `isImplicit` e morrem nos filtros — só o typedef do fonte emite |
| `node:SwitchStmt` | os rótulos internos sobem como filhos — `CaseStmt`/`DefaultStmt` são TRANSPARENTES e não emitem chave ("switch/case" é UM evento) |
| `node:CStyleCastExpr` | o tipo-alvo vai no atributo `castType`; o cast de MACRO (`NULL` → `((void*)0)`) é derrubado pelo guard do extrator e NÃO emite — o aluno escreveu `NULL`, não um cast |
| `node:ConditionalOperator` | sem derivadas além das do par (`decl:var`/`op:assign:` da atribuição que a recebe) |

---

### Princípios pedagógicos aplicados

1. **A primeira construção é a que produz efeito visível.** O aluno escreve `printf`, roda e vê.
   A função congelada é `frozenRegion`, não "isso a gente explica depois" — e nas aulas 2–4 o que
   ela esconde vira conteúdo, uma peça por aula (a função inteira, o `return 0;` do harness LIDO,
   o include).
2. **As chaves de bloco entram quando existe o que agrupar.** Nas aulas 1–3 do M1 o corpo é de uma
   linha. A aula `se` (M2) é a primeira em que uma linha **pertence a outra** — e é aí que o
   `term:blocos-de-chaves` é decidido por ele. A regra declarada da trilha: **chaves sempre**, e a
   concepção errada "chaves são opcionais com uma linha" é refutada na própria aula (regra 9 de
   `references/qualidade-aula.md`).
3. **Saída antes de valor, e a diferença é aula.** M1–M3 asseveram `stdout`; M4 ensina `return` em
   função e a aula seguinte põe os dois canais no mesmo desafio. Ver §"A tensão imprimir ×
   devolver".
4. **Pre-training → worked example → fading → prática independente.** Igual a docs/17. Em C o
   worked example compila a cada incremento — o erro de compilação é o feedback mais rápido que
   existe, e a trilha o usa de propósito (princípio 7).
5. **Um erro por vez, com nome.** O M1 encadeia os três erros na ordem natural do C: aviso de
   **compilação** (aula 4, o `#include` que falta), erro de **link/declaração implícita** (M4, o
   protótipo que falta) e **comportamento indefinido em prosa** (índice fora do array, M5) — o
   crash de runtime é narrado com analogia ANTES de poder acontecer num desafio.
6. **Interleaving e recuperação espaçada** (A15b/I7): toda aula reutiliza ao menos um átomo
   demonstrado antes — a coluna `Presume` é a prova mecânica disso. O C ajuda: `printf` nunca
   para de ser usado, do M1 ao M7.
7. **Linguagem simples, zero jargão sem explicação** — analogias do dia a dia (`a casa e o papel
   com o endereço` para ponteiros, §6); termos em inglês só quando são o nome real da coisa
   (`printf`, `stdout`, `NULL`).
8. **Fontes fora do fluxo** — URLs ficam em `sources[]` e aparecem só no botão "Fontes" (P-FONTE,
   §5).

---

### Estrutura da espinha — 7 módulos, 115 aulas

| # | Módulo | Aulas | cons. | Nível | Presume-se que o aluno sabe |
|---|---|---|---|---|---|
| 1 | `a-tela` | 21 | 6 | base | nada — é o zero absoluto |
| 2 | `decisao` | 12 | 6 | base | variáveis, contas e comparações (M1) |
| 3 | `repeticao` | 13 | 9 | base | `if`/`else` e as chaves de bloco (M2) |
| 4 | `caixas-que-devolvem` | 15 | 13 | base | laços (M3) |
| 5 | `listas-e-enderecos` | 21 | 17 | base | função com parâmetro e `return` (M4) |
| 6 | `texto-em-profundidade` | 16 | 11 | base | arrays e ponteiros básicos (M5) |
| 7 | `structs-e-arquivos` | 17 | 10 | base | strings e seus bibliotecários (M6) |

**Por que 115, e por que tantas consolidações (72 de 115, ~63%).** O número é **saída, não entrada**
([`16`](16-engine-de-trilha.md) §3.6). O C dá MENOS chaves por gesto que o Python — e o
inventário congelado deu MENOS chaves ainda que o vocabulário preliminar: um
`node:ArraySubscriptExpr` cobre ler, escrever e indexar; `decl:var` cobre escalar, array, 2D e
ponteiro; o acesso a campo emite UMA chave só para o `.` e o `->` (`node:MemberExpr` — §8) — e as
construções que
definem o curso — `swap` que funciona, lista como parâmetro, string terminada em `\0`, registro em
arquivo — são **composições**, e composição vira aula própria (P-MICRO). O M4
concentra consolidações pelo mesmo motivo medido em docs/17 (10 de 14 lá, 13 de 15 aqui): a
decomposição pedagógica de "função" é obrigatória, e as chaves não multiplicam. Toda consolidação
nomeia o degrau na própria célula `Ensina` ("em forma nova (…)"). As aulas cujo conteúdo novo é
prosa sem chave (o `const`, o `NULL` — §8.2, P7/P8) também viram consolidações com o degrau
nomeado.

### A tensão A6 × I3, e como esta trilha a resolve

Mesma resolução normativa de docs/17: I3 fala da **primeira introdução**; a aula de consolidação
declara `role: "consolidation"`, lista em `introduces.productive` o átomo que **reexercita**, e
mantém `targetAtom` apontando para a aula de origem. Duas consequências específicas do C,
declaradas:

- **`node:BreakStmt` nasce no `switch` (M2), não no laço.** Em C o primeiro `break` legítimo é o do
  `switch` — a aula `escolher-por-valor` o introduz, e a aula `parar-no-meio` (M3) é consolidação
  ("em forma nova: sair de um laço"). O Python não tinha essa inversão porque não tem
  fallthrough.
- **`node:ReturnStmt` nasce em LEITURA no M1 e vira ESCRITA no M4.** O `main` é sempre do harness
  (modelo cenário-do-harness, §"A aula 1"): na aula 3 `devolver-zero` o aluno LÊ o `return 0;` do
  harness e aprende o que é código de saída (o desafio assevera exit 0) — a origem listada da
  chave é esta aula; a ESCRITA do `node:ReturnStmt` num corpo próprio chega em
  `devolver-em-vez-de-mostrar` (M4), que é consolidação com degrau nomeado ("um valor para quem
  chamou"), não segunda origem. O Python ensinava `node:Return` no M4 porque o aluno nunca o
  tinha escrito; aqui a leitura vem antes, a escrita na mesma posição.

---

### A verificação Ensina × Presume

**EXECUTÁVEL desde a onda 2 — e é a rede.** O script é
`tools/check-trilha-c.mjs` (node puro, sem libs): lê as tabelas deste arquivo, monta a ordem da
cadeia e reprova: **I12** (slug repetido no mesmo curso), **LACUNA** (`Presume` apontando para
aula posterior ou inexistente), **VOCAB** (chave que o inventário CONGELADO (§8) não emite —
fail-closed; o marcador `[pendente: …]` que a onda 2 usava aceitava chave da lista PENDENTE e
hoje está SEM células), **A7** (mais de 2 construções numa aula que não é
consolidação — derivadas do mapa da regra do par não contam) e **A6** (aula produtiva que não
introduz nada sem marcador `[pendente: …]`; consolidação sem chave é permitida quando o degrau é
prosa — `term:`). A rodada executável da onda 2 saiu verde (Registro de execução); as ondas 3–4
rodaram os quatro gates da engine sobre o scaffold + M1 a1/a2 (`prova-c.md` §6:
`track:validate`/`requirements` verdes; `audit` com 2 violações A2 do preâmbulo do parse — gap
declarado da onda 3C — e o resto zero violação sobre as 115 aulas).

---

### Conteúdo por aula

Nas tabelas, `Ensina` lista as construções produtivas novas (**no máximo 2**, pela regra do par) e
`Presume` nomeia a aula anterior que ensinou cada construção pressuposta. "cons." marca uma aula de
**consolidação declarada** (`role: "consolidation"`, com o degrau nomeado). A coluna `Quiz` traz
UMA afirmação para o quiz da aula (maestria obrigatória, ciclo de remediação — docs/17 §"O quiz da
aula"); a coluna `Desafio` traz o slug e o cenário de teste. Os 7 módulos vão ao nível de átomo.

O vocabulário de átomos está **CONGELADO** (§"Vocabulário" e §8, re-congelado nas ondas 3–4): as
chaves aqui usadas são as que o `inventory()` real do adaptador C emite — 34 kinds `node:`; as
construções SEM chave ficam em **prosa na célula** (o `const`, o `NULL`, as macros, o tipo
`bool` — §8.2, P7–P10), nunca em chave.

---

#### Módulo 1 — `a-tela` (21 aulas)

A tela, a variável, a aritmética. Fase SAÍDA (`outputChannel: impressao`) nas 21 aulas, sob o
modelo cenário-do-harness (o aluno escreve a função que a tela pede; o `main` é do harness e é
LEITURA — §"A aula 1"). As aulas 1–3 usam a função congelada `tela` em graus; a aula 2 é a
primeira em que o aluno escreve a função inteira.

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `primeira-tela` — A primeira linha na tela | `api:printf` | nada | O `\n` no fim do literal manda a próxima saída para outra linha. | `tres-linhas` — imprime três linhas fixas; o teste compara o stdout capturado. |
| 2 | `o-esqueleto` — A porta do programa | `decl:func` | `primeira-tela` | Todo programa C começa a rodar pela função `main` — e ela chama a função que você escreve. | `sua-primeira-janela` — o aluno escreve a função inteira (a linha de dentro já é dele); o `main` do harness a chama; teste compara o stdout. |
| 3 | `devolver-zero` — O programa termina e diz como foi | `node:ReturnStmt` (LEITURA: o `return 0;` do `main` do harness; a ESCRITA nasce no M4) | `o-esqueleto` | O `0` que o `main` devolve é o código de saída: zero significa "terminou bem". | `fim-limpo` — o aluno escreve a função; o runner exige exit 0 do run; o `return 0;` do harness é lido na teoria. |
| 4 | `a-lista-de-ferramentas` — O inventário de cima | `node:IncludeDirective` (o `#include <stdio.h>` do SEU arquivo) | `primeira-tela` | Sem `#include <stdio.h>` o compilador não sabe o que `printf` é e avisa na compilação. | `include-proprio` — o starter vem SEM o include; o aluno o adiciona; o desafio falha antes (compilação) e passa depois. |
| 5 | `o-que-o-compilador-ignora` — O que o compilador ignora | cons. — `api:printf` em forma nova (com comentários; `term:comentário`) | `primeira-tela` | O compilador ignora tudo entre `//` e o fim da linha, e entre `/*` e `*/`. | `ficha-comentada` — função com comentário de cabeçalho e por linha; o teste prova que a saída não muda. |
| 6 | `buraco-na-frase` — O buraco na frase | cons. — `api:printf` em forma nova (o especificador `%d` em prosa: cada `%d` consome um argumento inteiro, na ordem) | `primeira-tela` | Cada `%d` consome um argumento inteiro, na ordem em que aparecem. | `ficha-numerada` — frase com dois números fixos interpolados; teste compara a frase inteira. |
| 7 | `um-nome-para-um-valor` — Um nome para um valor | `decl:var` (com inicialização; o literal `node:IntegerLiteral` é derivada) | `buraco-na-frase` | Após `int idade = 20;`, `idade` vale 20 até alguém mudar. | `idade-na-tela` — declara a idade e imprime com `%d`; teste compara a linha. |
| 8 | `mudar-o-valor` — Mudar o valor | `op:assign:=` | `um-nome-para-um-valor` | O valor antigo é perdido no momento da atribuição. | `trocar-os-valores` — troca os valores de duas variáveis usando uma terceira; teste imprime as duas depois da troca. |
| 9 | `somar-e-subtrair` — As contas de inteiro | `op:binary:+`, `op:binary:-` | `mudar-o-valor` | O C calcula a conta e então atribui: `x = 2 + 3;` deixa 5 em `x`. | `total-da-compra` — soma e subtrai valores fixos; teste compara o resultado impresso. |
| 10 | `multiplicar-e-dividir` — Multiplicar, e o corte da divisão | `op:binary:*`, `op:binary:/` | `somar-e-subtrair` | Entre inteiros, `7 / 2` é 3 — o C corta, sem arredondar (medido). | `repartir-figurinhas` — reparte figurinhas entre amigos (divisão inteira); teste compara o quociente. |
| 11 | `o-resto` — O resto que sobra | `op:binary:%` | `multiplicar-e-dividir` | `17 % 5` é 2 — o resto da divisão inteira (medido). | `minutos-e-segundos` — decompõe um total de segundos fixo em minutos e segundos; teste compara os dois números. |
| 12 | `o-numero-com-virgula` — O número com vírgula | cons. — `decl:var` em forma nova (o tipo real `double`; derivada: `node:FloatingLiteral`; o `%f` fica em prosa) | `um-nome-para-um-valor`, `buraco-na-frase` | `%f` imprime seis casas por padrão: 3.5 sai como `3.500000`. | `preco-com-decimais` — imprime um preço `double`; teste compara a saída com seis casas. |
| 13 | `a-divisao-real` — Dividir de verdade | `node:CStyleCastExpr` (o cast `(double)7 / 2` — saiu de `_TRANSPARENTES` na onda 3; o tipo-alvo vai no atributo `castType`; cast de MACRO não emite — §8) | `multiplicar-e-dividir`, `o-numero-com-virgula` | `(double)7 / 2` é 3.5 — o cast de UM lado basta para a conta virar real. | `media-de-dois` — média de dois inteiros fixos com casas decimais; teste compara o valor com `%f`. |
| 14 | `a-ordem-das-contas` — A ordem das contas | cons. — `op:binary:*` e `op:binary:+` em forma nova (precedência; os parênteses não emitem chave — `ParenExpr` é transparente) | `somar-e-subtrair`, `multiplicar-e-dividir` | `2 + 3 * 4` é 14; `(2 + 3) * 4` é 20. | `media-ponderada` — média ponderada com parênteses corretos; teste compara o valor exato. |
| 15 | `somar-no-lugar` — Somar no próprio nome | `op:assign:+=`, `op:assign:-=` | `mudar-o-valor`, `somar-e-subtrair` | `x += 3` é o mesmo que `x = x + 3;` (medido: 10 → 13). | `contador-de-visitas` — acumula três valores com `+=`; teste compara o total. |
| 16 | `um-de-cada-vez` — De um em um | `op:update:++`, `op:update:--` | `somar-no-lugar` | `x++;` sozinho soma um — e é por isso que a condição do laço nunca pode esquecer o passo. | `ovos-na-cesta` — incrementa um contador três vezes e imprime; teste compara o total. |
| 17 | `comparacoes` — Comparar devolve 0 ou 1 | `op:binary:==`, `op:binary:>=` (a família `== != < <= > >=` é toda `op:binary:`) | `multiplicar-e-dividir` | `printf("%d", 3 > 2)` imprime 1: em C a comparação É um número. | `tabela-de-comparacoes` — imprime o resultado (0/1) de cinco comparações fixas; teste compara a tabela. |
| 18 | `perguntar-ao-usuario` — Perguntar ao usuário | `api:scanf`, `op:unary:&` | `um-nome-para-um-valor` | O `&` entrega à `scanf` o ENDEREÇO da variável — é ela quem preenche a casa. | `dobro-do-digitado` — lê um inteiro e imprime o dobro; teste injeta 21 no stdin e espera 42. |
| 19 | `dois-valores-de-uma-vez` — Dois valores de uma vez | cons. — `api:scanf` em forma nova (dois `%d` na mesma chamada, em prosa) | `perguntar-ao-usuario` | Digitando `3 4`, o `%d %d` lê os dois — espaço e Enter servem os dois. | `soma-digitada` — lê dois inteiros e imprime a soma; teste injeta 3 e 4, espera 7. |
| 20 | `uma-letra-e-um-numero` — A letra que é um número | `node:CharacterLiteral` (a letra que é número; `decl:var` em forma nova: o tipo `char`; o `%c` fica em prosa) | `um-nome-para-um-valor`, `buraco-na-frase` | `'A'` é o número 65: `printf("%c", 'A' + 1)` imprime `B` (medido). | `proxima-letra` — dada a letra declarada no código, imprime a seguinte; teste compara a letra. |
| 21 | `o-limite-do-int` — O maior número que cabe | cons. — `node:IncludeDirective` em forma nova (o `#include <limits.h>`; `INT_MAX`/`INT_MIN` são MACRO: sem nó no AST e sem `ApiRef` após a expansão — não emitem chave, §8.2) | `comparacoes` | `INT_MAX` é 2147483647 nesta máquina (medido); passar dele não é erro de compilação — é comportamento indefinido, e a trilha o evita, nunca o testa. | `o-teto-e-o-piso` — imprime `INT_MAX` e `INT_MIN`; teste compara os dois números. |

**Progressão produtiva do M1 (22 chaves congeladas, na ordem — recontada após o remapeamento da
onda 4: o cast saiu do `[pendente:]` e ganhou a chave `node:CStyleCastExpr`):** `api:printf →
decl:func →
node:ReturnStmt (leitura) → node:IncludeDirective → decl:var → op:assign:= → op:binary:+ →
op:binary:- → op:binary:* → op:binary:/ → op:binary:% → node:FloatingLiteral →
node:CStyleCastExpr →
op:assign:+= → op:assign:-= → op:update:++ → op:update:-- → op:binary:== → op:binary:>= →
api:scanf → op:unary:& → node:CharacterLiteral`.

**Por que esta ordem — cada decisão, e o que ela elimina**

- **`printf` antes de `decl:func`** porque o efeito visível vem primeiro (princípio 1) — e a
  função congelada torna isso possível SEM mentir: o `main` do harness é semente receptiva
  (LEITURA — o `main` é SEMPRE do harness, modelo cenário-do-harness), e a aula 2 entrega a
  função inteira como conteúdo, uma peça inteira.
- **O `%d` antes da variável.** `printf("idade: %d", 20)` com número fixo mostra que o buraco e o
  valor são coisas separadas; quando a variável entra (aula 7), o aluno já sabe que ela é "um
  valor com nome" que se encaixa no buraco.
- **A divisão inteira vem ANTES do `double`** (aulas 10 → 12 → 13): o corte é o motivo de
  existirem os dois mundos; ensinar `double` primeiro faria `7 / 2` parecer bug.
- **`scanf` entra com o `&` no mesmo gesto (regra do par), e o endereço é narrado** ("o endereço
  da casa, para o carteiro preencher") — a semente do M5, que formaliza em `enderecos`. Sem o
  `&`, a `scanf` derruba o programa: o erro é citado em prosa, nunca testado (UB fora de
  escopo).
- **Não há aula de `unsigned` nem de `float`.** `unsigned` e os tamanhos (`short`/`long`) ficam
  fora de escopo (§"Fora de escopo"); `float` é redundante para quem já tem `double` — o C
  moderno imprime e calcula em `double` por padrão.
- **A aula 21 é de leitura**: o aluno imprime os limites e LÊ a prosa do overflow. Nenhum desafio
  provoca overflow (UB fora de escopo).

#### Módulo 2 — `decisao` (12 aulas)

O primeiro bloco — e portanto as primeiras chaves. Ainda em `stdout`.

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `se` — O primeiro desvio | `node:IfStmt` (+ `term:blocos-de-chaves`) | `comparacoes` | Sem chaves, só a PRIMEIRA linha depois do `if` pertence a ele — nesta trilha, chaves sempre. | `maior-de-idade` — lê a idade e imprime uma linha só se `>= 18`; teste com 21 (imprime) e 15 (não imprime). |
| 2 | `se-senao` — Um caminho ou outro | cons. — `node:IfStmt` em forma nova (o caminho `else`; o `if`/`else` é UM nó no clang) | `se` | Exatamente um dos dois blocos roda. | `par-ou-impar` — lê um inteiro e diz par ou ímpar com `%`; teste com 7 e 8. |
| 3 | `e-logico` — Duas condições ao mesmo tempo | `op:logical:&&` | `se`, `comparacoes` | `1 && 0` é 0: os dois lados precisam ser verdadeiros. | `na-faixa` — lê um número e imprime `ok` se estiver em 1..100 (`&&` de duas comparações); teste com 50, 0 e 101. |
| 4 | `ou-logico` — Um caminho ou o outro | `op:logical:\|\|` | `e-logico` | `0 \|\| 7` é 1: basta um lado verdadeiro. | `fim-de-semana` — lê o dia (1–7) e imprime `folga` para 6 ou 7; teste com 6, 7 e 3. |
| 5 | `negacao` — Inverter a condição | `op:unary:!` | `ou-logico` | `!(3 > 2)` é 0: a negação troca verdadeiro por falso. | `fora-da-faixa` — inverte o desafio da faixa com `!`; teste com 0 e 50. |
| 6 | `verdadeiro-e-falso-com-nome` — Dar nome à verdade | cons. — `node:IncludeDirective` em forma nova (o `#include <stdbool.h>`; o tipo `bool` e os nomes `true`/`false` ficam em prosa — não há eixo de tipo; `decl:var` reexercitado) | `negacao` | `bool` guarda 0 ou 1 com os nomes `false` e `true` — e imprime com `%d`. | `flag-de-aprovado` — `flag = nota >= 6;` e imprime com `%d`; teste com 8 (1) e 4 (0). |
| 7 | `em-cascata` — Vários caminhos em ordem | cons. — `node:IfStmt` em forma nova (cascata `else if`) | `se-senao` | Quando duas condições são verdadeiras, roda só a PRIMEIRA que casou. | `conceito-da-nota` — cascata 9–10 A, 7–8 B, 5–6 C, senão D; teste com 9, 7, 5 e 3. |
| 8 | `escolher-por-valor` — O painel de botões | `node:SwitchStmt`, `node:BreakStmt` (o par: a estrutura e a saída; os rótulos `case`/`default` são filhos TRANSPARENTES do nó — sobem sem chave própria) | `em-cascata` | Sem o `break`, a execução CAI para o `case` de baixo (fallthrough). | `menu-do-dia` — `switch` sobre o dia 1–7 com `break`; teste com 1 e 6. |
| 9 | `escolher-em-uma-linha` — A condição que devolve | `node:ConditionalOperator` (o ternário `max = a > b ? a : b;` — saiu de `_TRANSPARENTES` na onda 3) | `se-senao`, `um-nome-para-um-valor` | `max = a > b ? a : b;` atribui um dos dois valores numa linha. | `maior-de-dois` — lê dois números e imprime o maior via ternário; teste com (3, 9) e (9, 3). |
| 10 | `faixas-com-prioridade` — Faixas com prioridade | cons. — `op:logical:&&` em forma nova (condições compostas dentro da cascata) | `em-cascata`, `e-logico` | A ordem das faixas importa: o teste é de cima para baixo. | `classificar-imc` — lê peso e altura (com cast real), calcula o IMC e classifica em cascata; teste com um valor de cada faixa. |
| 11 | `desvio-dentro-de-desvio` — Desvio dentro de desvio | cons. — `node:IfStmt` em forma nova (aninhado; o `else` pertence ao `if` mais próximo) | `se-senao` | O `else` gruda no `if` mais interno quando faltam chaves — por aqui, as chaves sempre. | `entrada-do-show` — `if (idade >= 18) { if (ingresso) ... }` senão barra; teste com (20, sim), (20, não) e (16, sim). |
| 12 | `consolidacao-decisao` — O projeto do módulo | cons. — projeto (porta + faixa + menu) | `se` a `escolher-em-uma-linha` | (quiz) Entre cascata e `switch`, o que escolher quando os valores não são consecutivos? | `frete-da-loja` — lê peso e distância e decide a faixa de frete (condições compostas + cascata); 4 testes de faixa. |

**Por que o `switch` vem com `break` na mão (e a prova).** O fallthrough é o defeito nº 1 de quem
copia `switch` de tutorial: a aula o NOMEIA (regra 9 — refutar a concepção errada ancorada na
fonte: [cppreference, `switch`](https://en.cppreference.com/w/c/language/switch)) e o desafio o
exige certo. `default` entra na mesma construção (derivada do par — é `DefaultStmt`, filho
transparente do `node:SwitchStmt`, sem chave própria: "switch/case/default" é UM evento de
currículo, §8).

#### Módulo 3 — `repeticao` (13 aulas)

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `enquanto` — Repetir enquanto | `node:WhileStmt` | `se`, `somar-no-lugar` | Se a condição nunca vira falsa, o laço nunca acaba — o contador precisa andar dentro do corpo. | `contar-ate-dez` — imprime 1..10 com `while`; teste compara a sequência. |
| 2 | `contar-para-tras` — Contar para trás | cons. — `node:WhileStmt` em forma nova (decremento `--`) | `enquanto`, `um-de-cada-vez` | A contagem decrescente termina em 1: a condição é `>= 1`. | `contagem-final` — imprime 10..1 e `FOGO`; teste compara as 11 linhas. |
| 3 | `somar-tudo` — Somar tudo | cons. — `op:assign:+=` em forma nova (o acumulador dentro do laço) | `enquanto`, `somar-no-lugar` | A soma precisa começar em 0 FORA do laço — se começar dentro, cada volta esquece a anterior. | `soma-ate-n` — lê N e soma 1..N; teste com N=5 (15) e N=1 (1). |
| 4 | `para` — O laço de três partes | `node:ForStmt` | `enquanto` | `for (início; condição; passo)` — o passo roda DEPOIS do corpo, na subida. | `tabuada` — lê N e imprime a tabuada 1..10; teste compara as 10 linhas. |
| 5 | `passo-de-dois` — Passo de dois | cons. — `node:ForStmt` em forma nova (passo `i += 2`; decrescente com `i--`) | `para`, `somar-no-lugar` | O passo pode ser qualquer atribuição — inclusive andar para trás. | `pares-e-regressivos` — imprime os pares 2..N e, numa segunda lista, os múltiplos de 5 de trás para frente; teste compara as duas listas. |
| 6 | `ler-ate-sentar` — Ler até sentar | cons. — `api:scanf` em forma nova (o retorno como condição: quantos campos leu; `EOF` só em prosa) | `para`, `perguntar-ao-usuario` | `scanf` devolve QUANTOS campos leu — é por isso que ele pode ser condição de laço. | `soma-ate-sentinela` — lê inteiros até o valor -1 e soma os anteriores; teste injeta `5 7 3 -1`, espera 15. |
| 7 | `repetir-ao-menos-uma-vez` — Repetir ao menos uma vez | `node:DoStmt` | `enquanto` | O do-while executa o corpo PRIMEIRO e testa depois — ao menos uma vez. | `menu-valido` — repete até a opção ser 1–3; teste injeta `9 0 2` e espera a resposta da opção 2. |
| 8 | `parar-no-meio` — Parar no meio | cons. — `node:BreakStmt` em forma nova (sair de um laço) | `para`, `escolher-por-valor` | O `break` sai do laço mais interno na hora — o que veio depois dele no corpo não roda. | `primeiro-divisor` — acha o menor divisor > 1 de N e para; teste com 15 (3) e 13 (13). |
| 9 | `pular-uma-volta` — Pular uma volta | `node:ContinueStmt` | `parar-no-meio` | O `continue` pula para o PRÓXIMO passo — diferente do `break`, que sai. | `impares-fora` — imprime 1..20 pulando múltiplos de 3 com `continue`; teste compara a lista. |
| 10 | `laco-dentro-de-laco` — Laço dentro de laço | cons. — `node:ForStmt` em forma nova (aninhado) | `para` | 3×4 são 12 iterações: para cada volta de fora, o de dentro roda inteiro. | `retangulo-de-hashtags` — lê L e C e desenha L linhas com C `#`; teste compara o desenho. |
| 11 | `o-triangulo` — O triângulo | cons. — `node:ForStmt` aninhado em forma nova (o interno depende do externo: `j <= i`) | `laco-dentro-de-laco` | A linha i tem i caracteres: a condição do laço de dentro usa o contador de fora. | `triangulo-de-hashtags` — desenha um triângulo de N linhas; teste compara o desenho. |
| 12 | `a-flag-da-busca` — A flag da busca | cons. — `decl:var` em forma nova (a flag `bool` que sobrevive ao laço; o tipo fica em prosa) | `parar-no-meio`, `verdadeiro-e-falso-com-nome` | Se você precisa saber DEPOIS do laço se achou, a flag guarda o resultado — o `break` só sai. | `e-primo` — testa se N é primo com flag; teste com 13 (1) e 15 (0). |
| 13 | `consolidacao-repeticao` — O projeto do módulo | cons. — projeto (leitura de tamanho desconhecido + estatística) | `enquanto` a `a-flag-da-busca` | (quiz) Qual laço para entrada de tamanho desconhecido — e por quê? | `estatisticas-de-notas` — lê notas até -1, imprime média (cast real), máxima e quantos aprovados; 4 testes. |

#### Módulo 4 — `caixas-que-devolvem` (15 aulas)

O módulo da virada. Começa em `stdout` e termina em `retorno`. É o módulo com mais consolidações
da espinha (13 de 15) — o mesmo efeito medido em docs/17 (10 de 14 no Python): a decomposição
pedagógica de "função" é obrigatória e as chaves não multiplicam. Sob o inventário congelado,
`decl:func` já nasceu no M1 (a função que a tela pede) e o protótipo emite a MESMA chave
`decl:func` — por isso `sua-primeira-caixa` e `declarar-antes-de-usar` viram consolidações "em
forma nova".

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `sua-primeira-caixa` — A sua primeira caixa | cons. — `decl:func` em forma nova (a caixa SUA: definir, não só a função-da-tela; quem define precisa CHAMAR) | `devolver-zero`, `buraco-na-frase` | Definir não roda: quem define `void saudacao(void) { ... }` precisa CHAMAR. | `saudacao-em-dois-mundos` — define e chama a função duas vezes; teste compara as duas linhas. |
| 2 | `chamar-a-caixa` — Chamar a caixa | cons. — `node:CallExpr` em forma nova (chamar o que VOCÊ definiu) | `sua-primeira-caixa` | A chamada executa o corpo e volta para a linha de baixo. | `saudacao-tres-vezes` — chama a mesma função três vezes; teste compara as três linhas. |
| 3 | `a-janela-de-entrada` — A janela de entrada | `node:ParmVarDecl` (o parâmetro — o adaptador o emite no eixo `node:`, não no `decl:`) | `chamar-a-caixa` | O parâmetro é uma CÓPIA: mudá-lo dentro da caixa não muda quem chamou. | `dobro-caixa` — `dobra(n)` imprime o dobro de cada valor chamado; teste com 2 e -3. |
| 4 | `devolver-em-vez-de-mostrar` — Devolver em vez de mostrar | cons. — `node:ReturnStmt` em forma nova (um valor para quem chamou — a ESCRITA própria da chave) | `a-janela-de-entrada` | O `return` ENCERRA a caixa no ato e entrega o valor na linha da chamada. | `maior-caixa` — `maior(a, b)` devolve o maior e o `main` imprime; teste espera 9 para (3, 9) e (9, 3). |
| 5 | `imprimir-nao-e-devolver` — Imprimir não é devolver | cons. — `node:ReturnStmt` e `api:printf` no MESMO desafio (**a aula da virada**) | `devolver-em-vez-de-mostrar` | Chamar a caixa sozinha não imprime nada — imprimir e devolver são canais diferentes. | `a-virada` — três testes: devolve, imprime, e chamar sozinha não imprime (formato de docs/17 §"A VIRADA"). |
| 6 | `a-caixa-que-nao-devolve-nada` — A caixa que não devolve nada | cons. — `decl:func` em forma nova (`void` explícito; `return;` sozinho) | `imprimir-nao-e-devolver` | `void` devolve "nada"; o `return` sem valor só encerra cedo. | `cedo-demais` — função que imprime só para positivo, encerrando antes com `return;`; teste com 5 e -5. |
| 7 | `mais-de-uma-janela` — Mais de uma janela | cons. — `node:ParmVarDecl` em forma nova (dois parâmetros) | `a-janela-de-entrada` | A ordem dos argumentos é a ordem dos parâmetros. | `area-e-perimetro` — duas funções com os MESMOS dois parâmetros; teste compara os dois resultados. |
| 8 | `devolver-cedo` — Devolver cedo | cons. — `node:ReturnStmt` em forma nova (um return por ramo) | `devolver-em-vez-de-mostrar`, `se-senao` | Depois do `return`, nada mais da caixa roda. | `divisao-segura` — `dividir(a, b)` devolve 0 se `b == 0` (a guarda); teste com (7, 2) → 3 e (7, 0) → 0. |
| 9 | `devolver-verdade-ou-falso` — Devolver verdade ou falso | cons. — `node:ReturnStmt` em forma nova (devolver a própria comparação) | `devolver-cedo`, `verdadeiro-e-falso-com-nome` | `return idade >= 18;` já devolve o 0/1 da comparação. | `maioridade-caixa` — `ehMaior(idade)` devolve `bool` e o `main` usa em `if`; teste com 21 e 15. |
| 10 | `o-nome-so-vive-dentro` — O nome só vive dentro | cons. — `decl:var` em forma nova (nome local) + `term:escopo` | `devolver-em-vez-de-mostrar`, `um-nome-para-um-valor` | O nome da variável local nasce na chamada e morre no `return`. | `sombra-de-nome` — starter que usa um nome local fora da função (erro de compilação); o aluno conserta devolvendo o valor; teste compara o valor devolvido. |
| 11 | `uma-caixa-chama-outra` — Uma caixa chama outra | cons. — `node:CallExpr` em forma nova (chamada dentro de caixa) | `devolver-em-vez-de-mostrar` | A caixa que chama recebe o valor devolvido na hora da expressão. | `enquadra` — `enquadra(x, min, max)` usa `maior`/`menor` internas; teste com (5, 0, 10) → 5 e (15, 0, 10) → 10. |
| 12 | `declarar-antes-de-usar` — O cartaz na porta | cons. — `decl:func` em forma nova (o protótipo: a promessa sem corpo — no clang é `FunctionDecl` e emite a MESMA chave) | `uma-caixa-chama-outra` | O compilador lê de cima para baixo: sem protótipo, chamar antes de definir não compila. | `ordem-invertida` — starter com a chamada antes da definição (não compila); o aluno acrescenta o protótipo; teste: compila e o valor devolvido bate. |
| 13 | `mais-contas` — As contas que vêm de fora | `api:sqrt` (com o `#include <math.h>` — a mesma chave `node:IncludeDirective`, em forma nova; o `-lm` no comando fica em prosa) | `devolver-em-vez-de-mostrar`, `a-divisao-real` | `sqrt` recebe e devolve `double`; o `-lm` no comando liga a biblioteca matemática (o runner já traz). | `hipotenusa` — `hipotenusa(a, b)` com `sqrt`; teste com (3, 4) → 5.0. |
| 14 | `copias-no-vestibulo` — Cópias no vestíbulo | cons. — `node:ParmVarDecl` em forma nova (a cópia que não volta; `term:passagem por valor`) | `a-janela-de-entrada`, `mudar-o-valor` | A função tenta trocar e falha: os parâmetros são cópias — é assim que C funciona por padrão. | `a-troca-que-nao-troca` — chama `tentarTrocar(a, b)`; o teste prova que os originais NÃO mudaram (imprime o estado depois da chamada). |
| 15 | `consolidacao-caixas` — O projeto do módulo | cons. — projeto (menu + funções de conversão) | `sua-primeira-caixa` a `copias-no-vestibulo` | (quiz) Por que os protótipos ficam em cima do arquivo? | `conversor-de-unidades` — menu em `switch` + `do-while`, uma função por conversão (comprimento e massa); 4 testes de conversão. |

**Por que a `copias-no-vestibulo` falha DE PROPÓSITO.** É a aula mais importante do módulo e a
semente do M5: o aluno vê, com teste verde num desafio que "não funciona", que a cópia é o
comportamento — e não um erro dele. A refutação explícita (regra 9) fica ancorada no desafio, e o
payoff chega na aula `a-troca-que-funciona` (M5, aula 11), que reexercita o MESMO desafio com
ponteiro e o faz funcionar.

#### Módulo 5 — `listas-e-enderecos` (21 aulas)

Arrays e ponteiros básicos — o módulo que o C cobra e o Python esconde. A fase continua `retorno`
a partir do M4; a coluna `Ensina` segue a regra do par. Sob o inventário congelado, array e
ponteiro são `decl:var` (o adaptador não distingue a FORMA da declaração) — o distinguível real
de cada aula está na célula; a promoção de formas próprias (`decl:array`/`decl:ptr`) segue em
defer (§8.2, P12). As aulas 18–19 ensinam conteúdo SEM chave (o `const` e o `NULL`) e por isso
são consolidações com o degrau nomeado.

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `a-caixa-com-gavetas` — A caixa com gavetas | `node:InitListExpr` (o inicializador entre chaves; o par da regra do par: `decl:var` em forma nova — o array `int notas[5]`) | `mais-de-uma-janela`, `um-nome-para-um-valor` | `int notas[5]` cria 5 gavetas numeradas 0..4 — a gaveta 5 não existe. | `notas-na-tela` — imprime as 5 notas do inicializador; teste compara as 5 linhas. |
| 2 | `pegar-pela-gaveta` — Pegar pela gaveta | `node:ArraySubscriptExpr` | `a-caixa-com-gavetas` | `notas[i]` lê E escreve; fora do 0..4 é comportamento indefinido — e o compilador não avisa. | `dobra-as-notas` — dobra cada nota (escreve pelo índice) e imprime; teste compara as 5 linhas dobradas. |
| 3 | `varrer-a-lista` — Varrer a lista | cons. — `node:ForStmt` em forma nova (o for que percorre o array) | `pegar-pela-gaveta`, `para` | O laço anda de 0 até n-1: `i < 5`, nunca `<=`. | `soma-das-notas` — soma os elementos com `for`; teste compara a soma. |
| 4 | `o-maximo-da-lista` — O máximo da lista | cons. — `node:ArraySubscriptExpr` em forma nova (o padrão do máximo) | `varrer-a-lista`, `devolver-em-vez-de-mostrar` | Comece o máximo com o PRIMEIRO elemento, não com zero. | `maior-nota` — acha a maior nota; teste com listas cujo máximo está no início e no fim. |
| 5 | `gavetas-vazias` — Gavetas vazias | cons. — `node:InitListExpr` em forma nova (inicializador parcial: o resto fica em 0) | `a-caixa-com-gavetas` | `int v[5] = {1, 2};` deixa as outras três gavetas em 0. | `zeros-garantidos` — imprime o array parcialmente inicializado; teste compara os 5 valores. |
| 6 | `contando-iguais` — Contando iguais | cons. — `node:ArraySubscriptExpr` + `op:binary:==` na composição (contador de ocorrências) | `varrer-a-lista`, `se` | O contador cresce SÓ dentro do `if`. | `quantos-aprovados` — conta as notas `>= 6`; teste com listas de contagens conhecidas. |
| 7 | `quantos-bytes` — Quantos bytes o molde ocupa | `op:unary:sizeof` (o nó é `node:UnaryExprOrTypeTraitExpr` — a chave sai do atributo) | `a-caixa-com-gavetas` | `sizeof(int)` é 4 nesta máquina (medido); `sizeof v / sizeof v[0]` devolve QUANTOS elementos. | `o-tamanho-real` — calcula `n = sizeof v / sizeof v[0]` e imprime `n` e o array; teste espera n=5 e os valores. |
| 8 | `enderecos` — O endereço das casas | cons. — `op:unary:&` em forma nova (o mesmo `&` da aula `perguntar-ao-usuario`, agora com nome de operador; o `%p` fica em prosa — não há eixo de formato) | `quantos-bytes`, `perguntar-ao-usuario` | `&x` devolve o endereço de `x` — o mesmo `&` que a `scanf` sempre pediu; agora com nome. | `enderecos-na-tela` — imprime endereço e valor de duas variáveis; teste compara as duas linhas (cada uma com `%p` e o valor). |
| 9 | `o-papel-com-o-endereco` — O papel com o endereço | cons. — `decl:var` em forma nova (o ponteiro: `int *p = &x;` — o adaptador emite `decl:var`; a FORMA ponteiro fica em prosa — §8.2, P12) | `enderecos` | `int *p = &x;` — o `p` não guarda número: guarda ONDE o número está. | `aponta-para-mim` — declara `p` e imprime `p` e `&x`; teste: as duas impressões são o mesmo endereço. |
| 10 | `ir-ate-a-casa` — Ir até a casa | `op:unary:*` (a desreferência) | `o-papel-com-o-endereco` | `*p` é o valor que está NO endereço: ler e escrever pela outra porta. | `via-ponteiro` — muda `x` só escrevendo em `*p`; teste compara o novo valor de `x`. |
| 11 | `a-troca-que-funciona` — A troca que funciona | cons. — `op:unary:*` em forma nova (mudar o original via parâmetro-ponteiro) | `ir-ate-a-casa`, `copias-no-vestibulo` | Passando `&a` e `&b`, a função troca DE VERDADE: a cópia é do endereço, não do valor. | `o-swap` — `trocar(int *a, int *b)` que funciona; teste compara os dois valores trocados (o payoff do M4). |
| 12 | `a-lista-como-parametro` — A lista como parâmetro | cons. — `node:ParmVarDecl` em forma nova (na função: `int v[]` — o parâmetro-array; a lista não copia; o tamanho viaja junto) | `a-troca-que-funciona`, `varrer-a-lista` | O array vira o endereço do primeiro elemento; por isso o parâmetro `n` acompanha. | `soma-em-funcao` — `somaLista(v, n)` devolve a soma; teste com duas listas de tamanhos diferentes. |
| 13 | `devolver-dois-valores` — Devolver dois valores | cons. — `node:ParmVarDecl` em forma nova (dois parâmetros-ponteiro de saída) | `a-lista-como-parametro`, `a-troca-que-funciona` | Sem structs ainda, a forma de devolver DOIS valores em C é o par de ponteiros de saída. | `minimo-e-maximo` — `minimoEMaximo(v, 5, &min, &max)`; teste compara os dois valores. |
| 14 | `preencher-lendo` — Preencher lendo | cons. — `node:ArraySubscriptExpr` + `op:unary:&` na composição (`&v[i]`) | `a-lista-como-parametro`, `perguntar-ao-usuario` | `scanf("%d", &v[i])` preenche a gaveta `i` pelo endereço dela. | `leitor-de-notas` — lê `n` (≤ 50) e `n` notas e imprime na ordem INVERSA; teste injeta 4 notas e compara as 4 linhas invertidas. |
| 15 | `inverter-a-lista` — Inverter a lista | cons. — composição (trocar os simétricos com o swap até n/2) | `preencher-lendo`, `a-troca-que-funciona` | Chega até n/2: trocar além disso desfaz a troca. | `o-inversor` — inverte o array lido no próprio lugar e imprime; teste compara a ordem invertida. |
| 16 | `procurar-na-lista` — Procurar na lista | cons. — `node:ReturnStmt` em forma nova (devolver o índice ou -1) | `a-lista-como-parametro`, `se` | -1 é a convenção de "não achei": índices válidos começam em 0. | `o-procurador` — `procurar(v, n, x)` devolve a posição ou -1; teste com valor presente e ausente. |
| 17 | `ordenar-a-lista` — Ordenar a lista | cons. — composição (for aninhado + swap: o primeiro algoritmo completo) | `inverter-a-lista`, `laco-dentro-de-laco` | Cada passada empurra o maior para o fim; n-1 passadas bastam. | `o-ordenador` — ordena as notas lidas em ordem crescente; teste compara as n linhas ordenadas. |
| 18 | `a-promessa-de-nao-mudar` — A promessa de não mudar | cons. — `decl:func` em forma nova (o contrato de leitura na assinatura; o qualificador `const` fica em PROSA — `term:const`: qualificador de TIPO, sem nó no AST do clang, nunca emite chave — §8.2 P7) | `a-lista-como-parametro` | `const int v[]` diz "esta função só lê" — tentar mudar vira ERRO de compilação. | `soma-com-promessa` — refaz `somaLista` com `const int v[]`; teste compara a soma (igual) e exige compilação limpa. |
| 19 | `o-ponteiro-que-nao-aponta` — O papel sem endereço | cons. — `decl:var` em forma nova (o ponteiro que pode não apontar) + `op:binary:!=` (o teste do nulo; `NULL` fica em PROSA — `term:NULL`: macro, expande para `((void*)0)` e o cast da expansão é derrubado pelo guard do extrator — não emite chave, §8.2 P8) | `o-papel-com-o-endereco` | `NULL` é o endereço "nenhum"; usá-lo como casa desaba o programa — por isso se testa antes. | `o-gate-do-nulo` — `maiorDe(v, n)` devolve ponteiro para o maior, ou `NULL` se `n == 0`; o `main` testa `!= NULL`; teste com n=0 e n>0. |
| 20 | `andar-de-ponteiro` — Andar de ponteiro | cons. — `op:unary:*` em forma nova (aritmética: `*(p + i)` é o mesmo que `v[i]`) | `ir-ate-a-casa`, `a-lista-como-parametro` | `p + 1` avança UM ELEMENTO (4 bytes num `int`, medido) — não um byte. | `o-passeio` — imprime o array usando só um ponteiro que anda; teste compara as n linhas. |
| 21 | `consolidacao-listas` — O projeto do módulo | cons. — projeto (leitura + estatística + ordenação) | `a-caixa-com-gavetas` a `andar-de-ponteiro` | (quiz) Quando o tamanho precisa viajar com a lista — e por que `sizeof` não resolve dentro da função? | `as-vendas-do-dia` — lê `n` vendas, imprime total, máxima e o top 3 ordenado decrescente; 4 testes. |

**Ponteiros sem assustar — o momento e a analogia (declaração didática).** O M5 semeia o assunto
DUAIS vezes antes de nomeá-lo: o `&` da `scanf` (M1, aula 18) e a falha da cópia (M4, aula 14). Só
então, nas aulas 8–10, chega a analogia declarada: **a variável é a casa; o ponteiro é um papel
com o endereço da casa; `*p` é ir até a casa**; `NULL` é um papel em branco (nunca uma casa). A
analogia quebra onde toda analogia de endereço quebra — em `andar-de-ponteiro` — e é aí que o
`*(p + i) ≡ v[i]` é demonstrado, não narrado. O teto de composição (A9) é cumprido por `role:
"integration"` nas aulas 11–17 do módulo.

#### Módulo 6 — `texto-em-profundidade` (16 aulas)

Strings em C são arrays terminados em `\0` — e a espinha ensina o mecanismo ANTES da biblioteca:
copiar à mão (aula 5) vem antes de `strncpy` (aula 6), gritar à mão (aula 9) antes de `toupper`
(aula 10). Quem aprendeu o mecanismo lê a man-page sem medo.

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `a-string-e-o-zero` — O texto que acaba em zero | cons. — `decl:var` em forma nova (o array de `char`; o terminador `\0` e o `%s` ficam em prosa — o literal `node:StringLiteral` já nasceu na aula 1) | `a-caixa-com-gavetas`, `uma-letra-e-um-numero` | `"abc"` são 4 gavetas: `a`, `b`, `c` e o terminador `\0` que marca o fim. | `saudacao-nome` — imprime a saudação com o nome fixo do código, via `%s`; teste compara a linha. |
| 2 | `o-comprimento` — Quantas letras tem | `api:strlen` (com o `#include <string.h>` — `node:IncludeDirective` em forma nova) | `a-string-e-o-zero` | `strlen` devolve o tamanho SEM contar o `\0`: `strlen("abc")` é 3 (medido). | `medidor-de-palavras` — imprime o tamanho de 3 palavras fixas; teste compara os 3 números. |
| 3 | `ler-uma-palavra` — Ler uma palavra | cons. — `api:scanf` em forma nova (`%s`, sem `&`; o limite de largura `%49s` em prosa) | `a-string-e-o-zero`, `perguntar-ao-usuario` | O nome do array JÁ é endereço: sem `&` no `%s`. O 49 em `%49s` é o freio de mão. | `eco-de-nome` — lê uma palavra e imprime com `%s`; teste injeta `Ana` e espera a linha. |
| 4 | `percorrer-a-string` — Percorrer a string | cons. — `node:ForStmt` em forma nova (até `strlen` ou até `s[i] != '\0'`) | `o-comprimento`, `varrer-a-lista` | Perceber o fim é VER o `\0`: as duas condições ensinam a mesma coisa. | `contador-de-vogais` — conta as vogais (aeiou, sem acento) de uma palavra lida; teste com 2 palavras de contagens conhecidas. |
| 5 | `copiar-a-mao` — Copiar à mão | cons. — `node:ArraySubscriptExpr` em forma nova (copiar até o `\0` INCLUSIVE) | `percorrer-a-string`, `pegar-pela-gaveta` | Se o `\0` não copia, a cópia é um texto sem fim. | `o-copiador` — copia a palavra para um buffer e imprime os dois; teste compara as duas linhas iguais. |
| 6 | `copiar-com-limite` — Copiar com freio de mão | `api:strncpy` | `copiar-a-mao` | `strncpy(dst, src, sizeof dst)` nunca passa do limite — e cabe a VOCÊ garantir o `\0` no fim. | `o-copiador-seguro` — refaz a cópia com `strncpy` + terminador explícito; teste compara as duas linhas. |
| 7 | `comparar-textos` — Comparar textos | `api:strcmp` | `o-comprimento` | `strcmp` devolve 0 quando IGUAL — `==` compara ENDEREÇOS, nunca textos. | `a-porta-secreta` — lê a palavra e compara com `abrir`; teste com `abrir` e `fechar`. |
| 8 | `montar-um-texto` — Montar um texto novo | `api:snprintf` | `buraco-na-frase`, `a-string-e-o-zero` | `snprintf(buffer, sizeof buffer, ...)` é o `printf` que escreve num buffer, com limite. | `a-etiqueta` — monta `Nome: Ana \| Idade: 20` num buffer e imprime; teste compara a linha. |
| 9 | `gritar-a-mao` — Gritar à mão | cons. — `node:ArraySubscriptExpr` em forma nova (mudar in-place; a aritmética de letras: `'A' + 1` é `'B'`, medido) | `percorrer-a-string`, `uma-letra-e-um-numero` | Maiúscula é minúscula menos a distância da tabela: letras SÃO números. | `o-gritador` — converte a palavra lida em maiúsculas no próprio lugar; teste injeta `ana`, espera `ANA`. |
| 10 | `a-biblioteca-de-letras` — A biblioteca das letras | `api:toupper` (com o `#include <ctype.h>` — `node:IncludeDirective` em forma nova) | `gritar-a-mao` | `toupper(c)` faz a mesma conta sem mágica — e funciona para qualquer letra. | `o-gritador-biblioteca` — refaz com `toupper`; teste idêntico ao da aula 9 (mesma saída, outro caminho). |
| 11 | `a-string-como-parametro` — A string como parâmetro | cons. — `node:ParmVarDecl` em forma nova (`char s[]` em função; a função ENXERGA o original) | `percorrer-a-string`, `a-lista-como-parametro` | A string em função é como a lista: o endereço do primeiro caractere — mudar muda o original. | `conta-espacos` — `contaEspacos(frase)` devolve a contagem; teste com 2 frases. |
| 12 | `a-lista-de-strings` — A lista de listas de letras | cons. — `decl:var` em forma nova (o array de arrays: `char nomes[5][20]` — o adaptador emite `decl:var`; a FORMA 2D fica em prosa — §8.2 P12) | `a-string-e-o-zero`, `a-caixa-com-gavetas` | `char nomes[5][20]`: 5 palavras de até 19 letras + terminador cada. | `lista-de-convidados` — lê 3 nomes e lista numerada; teste injeta 3 nomes e compara as 3 linhas. |
| 13 | `procurar-na-lista-de-strings` — Procurar na lista de strings | cons. — `api:strcmp` + `node:ForStmt` na composição | `a-lista-de-strings`, `comparar-textos` | Buscar é comparar com `strcmp` DENTRO do laço — nunca com `==`. | `lista-de-presenca` — checa se o nome lido está na lista; teste com nome presente e ausente. |
| 14 | `ao-contrario` — Ao contrário, e o espelho | cons. — composição (swap de caracteres nas pontas + comparação com o original: palíndromo simples) | `copiar-a-mao`, `inverter-a-lista` | Palíndromo: comparar a palavra com ela mesma invertida, posição a posição. | `o-espelho` — verifica se a palavra lida é palíndromo (sem acento); teste com `arara` (1) e `porta` (0). |
| 15 | `contar-palavras` — Contar palavras | cons. — composição (flag dentro/fora de palavra: `bool` + percurso) | `percorrer-a-string`, `verdadeiro-e-falso-com-nome` | Uma palavra começa quando se sai do estado "dentro de espaço" — a flag guarda o estado. | `contador-de-palavras` — conta as palavras da frase lida; teste com 2 frases de contagens conhecidas. |
| 16 | `consolidacao-texto` — O projeto do módulo | cons. — projeto (capitalização por palavra) | `a-string-e-o-zero` a `contar-palavras` | (quiz) Por que todo texto precisa de espaço para o `\0`? | `o-normalizador` — lê um nome composto e capitaliza a inicial de cada palavra (`ctype`, laços, buffer com `snprintf`); 3 testes. |

**Regra de acentos declarada.** Todo desafio de texto desta trilha trabalha com letras ASCII
(a–z, A–Z): acentuação em C abre o assunto de codificação (`wchar_t`, locale, UTF-8), que é
conteúdo do `c-intermediario`. O enunciado declara a restrição; a man-page de `toupper` (§5) é a
fonte do porquê.

#### Módulo 7 — `structs-e-arquivos` (17 aulas)

A "coleção" do C — o módulo que ocupa o lugar dos dicionários da espinha de Python: agrupar dados
heterogêneos (`struct`) e persistir (`stdio`). O curso inteiro aponta para a aula 15: o programa
em `.h`/`.c` é a fronteira de saída do `c-iniciante`. **Chaves do módulo (medidas na onda 3):** a
declaração do molde emite `node:RecordDecl` (só com `tagUsed: "struct"` — a `union` é o MESMO
kind com `tagUsed: "union"` e é DERRUBADA pelo guard do extrator; os campos `FieldDecl` são
transparentes), o acesso a campo emite `node:MemberExpr` (UMA chave para `.` e `->` — a
distinção vai no atributo `memberAccess`) e o typedef emite `node:TypedefDecl`. As exceções SEM
chave: o `const` (§8.2 P7) e — de novo — o `NULL` (macro, P8), ambos em prosa.

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `o-molde-e-o-dado` — O molde e o dado | `node:RecordDecl` (o molde — só `tagUsed: "struct"`; a union é derrubada e os campos `FieldDecl` são transparentes), `node:MemberExpr` (o acesso a campo `p.x`) | `um-nome-para-um-valor` | `struct Ponto` agrupa valores DIFERENTES numa ficha só; cada campo tem o seu tipo. | `cartao-de-ponto` — declara o struct e imprime os campos; teste compara a linha. |
| 2 | `mudar-o-dado` — Mudar o dado | cons. — `node:MemberExpr` em forma nova (atribuir campo; atribuir o struct INTEIRO copia tudo — a atribuição de ficha é `op:assign:=` reexercitado) | `o-molde-e-o-dado`, `mudar-o-valor` | `p2 = p1` copia campo a campo — a foto, não o molde. | `o-clonador` — copia um struct para outro e muda o original; teste prova que a cópia não mudou. |
| 3 | `o-apelido-do-molde` — O apelido do molde | `node:TypedefDecl` (o apelido — `Ponto` passa a ser um tipo seu, sem a palavra `struct`; a chave também é RECEPTIVA na semente: o typedef do próprio harness — §"Axioma de entrada"; os TypedefDecls builtin são `isImplicit` e morrem nos filtros) | `o-molde-e-o-dado` | `typedef struct { ... } Ponto;` — `Ponto` passa a ser um tipo seu, sem a palavra `struct`. | `o-retangulo` — typedef de `Retangulo` com 4 campos e impressão; teste compara a linha. |
| 4 | `o-dado-na-caixa` — O dado na caixa | cons. — `node:ParmVarDecl` em forma nova (struct por valor entra e sai da função) | `o-apelido-do-molde`, `devolver-em-vez-de-mostrar` | A função recebe a CÓPIA: mudar o parâmetro não muda o original (o vestíbulo de novo). | `o-movedor` — `mover(p, dx, dy)` devolve o ponto novo; teste compara `x` e `y` devolvidos. |
| 5 | `mudar-o-original` — Mudar o original | `node:MemberExpr` em forma nova (o campo via ponteiro: a MESMA chave do `p.x` — o `->` vai no atributo `memberAccess: "arrow"`; o degrau é o `*` do M5 aplicado à ficha) | `o-dado-na-caixa`, `ir-ate-a-casa` | `p->x` é `(*p).x`: o ponteiro enxerga o original e muda de verdade. | `o-movedor-de-verdade` — `moverVia(Ponto *p, dx, dy)` muda o original; teste compara os campos do original. |
| 6 | `a-lista-de-fichas` — A lista de fichas | cons. — `decl:var` em forma nova (array de structs) + `node:MemberExpr` (o acesso `pontos[i].x`) | `o-apelido-do-molde`, `varrer-a-lista` | `pontos[i].x`: primeiro a gaveta, depois o campo. | `o-ponto-mais-longe` — imprime todos e acha o mais distante da origem (`sqrt`); teste compara o índice. |
| 7 | `ficha-dentro-de-ficha` — Ficha dentro de ficha | cons. — `node:MemberExpr` em forma nova (struct aninhada: `pessoa.casa.x` — um nó `MemberExpr` por nível de campo) | `o-apelido-do-molde` | O campo pode ser outro struct: um ponto por nível de ponto. | `a-ficha-da-pessoa` — `Pessoa { nome, casa: Ponto }`; imprime nome e casa; teste compara a linha. |
| 8 | `a-ficha-completa` — A ficha completa | cons. — composição (struct com `char nome[40]` lida com `scanf`; o campo já é endereço — sem `&`; `node:MemberExpr` em `p.nome`) | `o-apelido-do-molde`, `ler-uma-palavra` | `scanf("%s", p.nome)`: o campo já é endereço — sem `&`. | `o-cadastro` — lê 2 pessoas (nome, idade, altura) e imprime a mais alta; teste injeta os dados e compara a linha. |
| 9 | `o-caderno` — O caderno do disco | `api:fopen`, `api:fclose` | `o-ponteiro-que-nao-aponta` | `fopen` devolve um ponteiro — ou `NULL` quando o caderno não abre; cada `fopen` pede um `fclose`. | `o-abridor` — abre `diario.txt` em `"w"`, testa `!= NULL` e fecha; teste verifica que o arquivo existe no disco depois de rodar. |
| 10 | `escrever-no-caderno` — Escrever no caderno | `api:fprintf` | `o-caderno`, `buraco-na-frase` | `fprintf` é o `printf` que escolhe o caderno: mesmo `%d`, mesmo `%s`. | `o-diario` — escreve 3 linhas de log com `fprintf`; teste lê o arquivo e compara as 3 linhas. |
| 11 | `ler-o-caderno` — Ler linha por linha | `api:fgets` | `o-caderno`, `percorrer-a-string` | `fgets(buffer, tamanho, f)` lê UMA linha por vez — e traz o `\n` junto. | `o-leitor-do-diario` — lê e imprime numerado; teste compara as linhas numeradas. |
| 12 | `acrescentar-no-fim` — Acrescentar no fim | cons. — `api:fopen` em forma nova (modo `"a"`) | `escrever-no-caderno` | `"w"` apaga tudo; `"a"` escreve no fim — a diferença é uma letra. | `o-diario-crescente` — roda a escrita duas vezes; teste compara as 6 linhas acumuladas. |
| 13 | `ler-numeros-do-caderno` — Ler números do caderno | `api:fscanf` | `o-caderno`, `perguntar-ao-usuario` | `fscanf` devolve QUANTOS campos leu: o laço termina quando não lê mais (`!= 2`). | `a-soma-do-arquivo` — lê números de um arquivo até o fim e soma; teste com arquivo de 5 números, compara a soma. |
| 14 | `o-caderno-de-fichas` — O caderno de fichas | cons. — composição (`fprintf`/`fscanf` campo a campo: uma linha, um registro; `node:MemberExpr` nos campos) | `a-ficha-completa`, `ler-numeros-do-caderno` | Um campo por vez, na MESMA ordem para escrever e ler. | `a-agenda` — salva 2 pessoas em arquivo e re-lê imprimindo; teste compara as 2 fichas re-lidas. |
| 15 | `a-biblioteca-em-dois-arquivos` — A biblioteca em dois arquivos | cons. — `node:IncludeDirective` em forma nova (o include do SEU header: `ponto.c` abre com `#include "ponto.h"`; `term:header`) | `declarar-antes-de-usar`, `o-apelido-do-molde` | O `.h` guarda os cartazes (os tipos e os protótipos); o `.c` guarda as caixas — e quem inclui o `.h` é o `.c` do ALUNO, nunca o teste (o `main` nem é do aluno: é do harness). | `a-biblioteca-geometria` — `files[]` com `ponto.h` + `ponto.c`, AMBOS escritos pelo aluno; o `main` é do harness (nunca `main.c` do aluno); o teste declara PROTÓTIPOS no topo — sem include do header do desafio (§"A tensão") — e exercita a API plana da biblioteca (`distancia`, `areaRetangulo`); 3 cenários. |
| 16 | `compilar-sozinho` — Compilar com as próprias mãos | cons. — leitura do compilador (`term:warning`, `term:flag`) — PRÁTICA DE TERMINAL: o 0 warnings NÃO é gate do desafio (o adaptador não tem caminho de dados para warnings — §4) | `a-biblioteca-em-dois-arquivos` | `-Wall -Wextra` acende os avisos que viram aliados; a prática de terminal exige 0 warnings antes de seguir. | `zero-avisos` — o starter tem 3 avisos conhecidos (`unused variable`, `missing initializer`, `return` sem valor); o aluno conserta rodando o compilador no terminal; o teste do desafio assestra exit 0 + saída correta. |
| 17 | `consolidacao-structs-arquivos` — O projeto final do curso | cons. — projeto final (cadastro persistido, biblioteca própria) | `o-molde-e-o-dado` a `compilar-sozinho` | (quiz) O que vai no `.h` — e o que NUNCA vai? | `o-inventario-final` — cadastro de itens em arquivo com biblioteca própria `.h`/`.c` (adicionar, listar, total e mais caro); 5 testes end-to-end. |

**Por que o `main` da biblioteca é LEITURA — o redesenho da aula 15 (onda 4).** O desenho anterior
desta aula colocava o ALUNO escrevendo `ponto.h`/`ponto.c`/`main.c` — e o `main` do aluno nunca
linka: o `main` é SEMPRE do harness (`duplicate symbol '_main'`, o mesmo fato que moldou a aula 1
do M1). O redesenho separa o PROGRAMA (que é de três arquivos) do DESAFIO (que é de dois): o
aluno escreve `ponto.h` (a ficha `Ponto` + os cartazes) e `ponto.c` (as caixas, abrindo com
`#include "ponto.h"` — a construção ensinada); o `main.c` de três arquivos vira **LEITURA na
teoria**, na posição do `return 0;` do M1 a3: o aluno LÊ o arquivo que inclui `"ponto.h"`, chama
`distancia` e `mover` e termina em `return 0;` — o programa inteiro existe, ele só não é quem o
escreve (o `main` do desafio é o do harness). Três invariantes do desafio (`a-biblioteca-geometria`),
todos medidos: (1) `files[]` com os dois arquivos do aluno — `ponto.h` e `ponto.c` (o
`filePathPattern` do adaptador aceita `.c`/`.h`; só `.c` entra na lista de TUs — o header chega
ao compilador pelo include do `ponto.c`, como manda `prova-c.md` §4); (2) o teste declara
**protótipos no topo** e NUNCA inclui o header do desafio — o `countDeclared` parseia o teste num
tempdir vazio e o include não resolve lá (contagem declarada 0, dupla-igualdade reprova — §"A
tensão", medido com as flags do adaptador); consequência: a API exercitada pelo teste tem
**assinaturas planas** (`double distancia(double ax, double ay, double bx, double by)`,
`double areaRetangulo(double largura, double altura)`) — a ficha e o acesso a campo vivem DENTRO
da biblioteca e são provados pelo comportamento dela, e o uso da ficha por fora é o que o `main.c`
de LEITURA demonstra; (3) o starter do `ponto.h` traz a ficha e os cartazes pela metade (um
protótipo sem definição no `.c` → link reprova com símbolo indefinido — prova 2 do template) — o
aluno completa os DOIS lados do contrato. A regra do `solucao.h` (§"Regras para os desafios") vale
desta aula em diante: o header entra como ARQUIVO DO ALUNO, nunca como include do teste.

---

### Desafios de módulo

A última aula de cada módulo carrega o **desafio de MÓDULO**
(`modules/<mod>/challenges/<slug>/challenge.json`, declarado no `module.json` como `challenge`) —
mesma forma de docs/17: **elaborado** (statement longo com cenário do mundo real, 4–6 testes),
**autoral** (o botão "Gerar novo desafio" não aparece), **multi-arquivo quando o módulo permite**
(a partir do M7, `files[]` com `.h`/`.c` que se incluem), e **restrição de orçamento igual à das
aulas** — pode compor livremente o que o módulo ensinou, mas não pode introduzir construção nova.
Os aninhamentos que ficaram fora das tabelas por não serem átomos (laço dentro de laço com
condição composta, array de structs com busca, string manipulada campo a campo) são o material
natural desses desafios: composição é o que eles testam.

### Regras para os desafios de aula (`challenge.json`)

- `language: 'c'`; `programmingLanguage: 'c'`; `runtime: 'cc-c11'`; `harnessLanguage: 'c'` no
  `track.json`; slug da trilha: `c-iniciante` (§1). O token de runtime é o do pin de §4 —
  **validado na onda 2** contra o adaptador (`c.ts`: `C_DEFAULT_RUNTIME = 'cc-c11'`, o par
  (toolchain, padrão) — `gcc-c11` do vocabulário preliminar NÃO existe no adaptador).
- **Duas superfícies de runner, sem conflito (explicitado na onda 2).** (1) O fluxo da SKILL
  (`challenge-new.sh`) usa `runner.sh` + `.build/test_bin` com o `TEST_CMD` canônico de C do repo
  ([`03-tdd`](build-spec/blocks/03-tdd.md) §3.9.2):
  `gcc -std=c11 -g -O0 -Wall -o .build/test_bin stub.c tests/test_stub.c -lm && .build/test_bin`.
  (2) O LAYOUT do desafio de TRILHA é o que o ADAPTADOR gera: `run.sh` num diretório temporário
  (`lang/c.ts` — `SM_HARNESS_HEADER`/`SM_MAIN_SOURCE`/`SM_RUNNER_SCRIPT`), que compila com
  `-std=c11 -g`, roda o binário com o `main` do harness e lê o ARQUIVO DE RELATÓRIO com nonce.
  Este documento desenha os DESAFIOS para a superfície (2); o `TEST_CMD` canônico continua sendo
  o pin da skill. O header do ALUNO (`solucao.h`, `ponto.h`) entra como arquivo do aluno
  (`files[]`) só a partir da aula `a-biblioteca-em-dois-arquivos` (M7) — e quem o inclui é o
  `.c` do próprio aluno, NUNCA o teste (a regra do protótipo vale em toda aula; §"A tensão
  imprimir × devolver"). **NOTA (reconciliação da onda 3 — template de prova):**
  o runner do adaptador da engine compila só com `-std=c11 -g`; a divergência de flags frente ao
  `TEST_CMD` canônico (`-O0 -Wall`) fica registrada aqui para a onda 3 reconciliar no template de
  prova — este documento não decide no lugar dela.
- layout do desafio: `solucao.c` na raiz — **NUNCA com `main`** (o `main` é do harness; um
  `main` do aluno não linka — §"A tensão"); `tests/test_solucao.c` com os **protótipos
  congelados** das funções do aluno no topo — em TODA aula, inclusive nos desafios multi-arquivo
  do M7: o teste nunca inclui header do desafio, porque o `countDeclared` parseia o teste num
  tempdir sem os arquivos dele (§"A tensão imprimir × devolver", `prova-c.md` §2 regra 3 e §4);
- **fase SAÍDA** (M1–M3): `outputChannel: 'impressao'` — modelo cenário-do-harness: o teste chama
  a função do aluno e captura o `stdout` NO PRÓPRIO TESTE (`freopen` para arquivo temporário em
  `testsCode`), e assevera com o helper `checa_<tipo>`; `solucao.c` NUNCA tem `main`;
- **a virada** (M4 `imprimir-nao-e-devolver`): `outputChannel: 'ambos'`, três testes — devolve,
  imprime, e chamar sozinha não imprime (mesma mecânica de captura da fase SAÍDA, §"A tensão");
- **fase VALOR** (M4 em diante): `outputChannel: 'retorno'` — o teste chama por protótipo e
  assevera com o helper `checa_<tipo>` do `counter_protocol`;
- o teste **falha** com o starter e **passa** com a solução; `expectedTestCount` = nº de
  **CENÁRIOS** (blocos `SM_TEST`), conferido por IGUALDADE contra o `TESTS_RUN=` do relatório
  (guard com namespace: `SM<nonce> TESTS_RUN=…`; canal confiável: o arquivo de relatório, não o
  stdout), nunca `> 0` (DES-4, [`00-contratos.md`](00-contratos.md) §5.3); **1–4 cenários** por
  desafio de aula; todo cenário carrega o rótulo pt-BR no primeiro argumento (`cenario`) do
  helper `checa_<tipo>` — é o que o veredito mostra (§"A tensão");
- **exit codes (D-V11, `languages.md`)**: o teste sai `falhas == 0 ? 0 : 1` (`counter_protocol`,
  [`03-tdd`](build-spec/blocks/03-tdd.md) §3.9.3) e o runner normaliza para **0** passou · **1**
  falhou · **2** contagem errada · **3** timeout, ecoando `EXIT_BRUTO` e `DECORRIDO_MS` no stdout;
  **66** = erro de infraestrutura ([`00-contratos.md`](00-contratos.md) §5.3); qualquer outro
  código após a normalização é defeito do runner, nunca sinal para o aluno — o bruto (134=`SIGABRT`,
  5=zero testes, 137=morto) segue visível no `EXIT_BRUTO`;
- a função do desafio é derivada do slug (kebab → camelCase de C: `dobro-do-numero` →
  `dobroDoNumero`; C não tem snake_case de convenção nesta trilha — os identificadores do aluno
  seguem o padrão das bibliotecas que ele usa: funções em camelCase, tipos em PascalCase, como
  `minimoEMaximo` e `Ponto` acima);
- **cenário `error` não existe nesta trilha** — C não tem exceção para o iniciante, e provocar
  crash/UB em desafio viola a proibição de comportamento indefinido. Os cenários possíveis são
  `example` e `boundary` (a guarda que substitui o erro — `divisao-segura`, `o-gate-do-nulo` — é
  conteúdo, não cenário);
- statement em markdown pt-BR, linguagem simples;
- **proibições sempre**, em qualquer aula, starter, teoria ou solução: comportamento indefinido
  proposital (índice fora do array, desreferenciar `NULL`, variável não inicializada lida,
  `gets`), `goto`, macro com parâmetros, conversão de ponteiro por cast arbitrário, e qualquer
  função marcada obsoleta nas man-pages (`gets` foi removida do próprio C11). Aparecem **só em
  prosa com crase**, nunca em bloco cercado.

### Teste de proficiência (`proficiency.json`)

O `c-iniciante` tem o seu `proficiency.json`, cobrindo os conceitos centrais dos 7 módulos — tela
e formato, nome e valor, decisão, repetição, função com parâmetro e retorno, array e índice,
string e terminador, struct e campo, arquivo e modo. Enunciado em linguagem simples que **não
pressupõe programação** (o aluno pode fazer o teste antes da primeira aula). Dificuldade 5,
carência da 1ª estrela 120 s. Quem passa destrava o curso inteiro — e a entrada do
`c-intermediario` é a fronteira de saída do iniciante (§1).

### Fora de escopo (declarado)

O que o `c-iniciante` **não** ensina, e por quê. Cada item é uma decisão, não um esquecimento; o
lugar de cada um está na cadeia (§1):

- **`malloc`/`free`/`realloc` e ponteiros para ponteiros.** O iniciante não administra memória:
  todos os arrays são de tamanho fixo conhecido no código, e é isso que torna cada desafio
  verificável e cada UB impossível. É a fronteira do `c-intermediario` (porta
  `a-porta-do-endereco`).
- **Recursão e ponteiros para função.** Exigem o modelo de pilha, que o iniciante ainda não tem.
  `c-intermediario`.
- **`unsigned`, `short`, `long`, `float`.** Um tipo inteiro (`int`), um real (`double`), um
  caractere (`char`) e o `bool` de `stdbool.h` cobrem o programa do iniciante; os outros tipos só
  multiplicam armadilhas de conversão.
- **`union`, `enum`, bit a bit, bitfields.** `c-intermediario`.
- **`goto`, macros com parâmetros, varargs (`...`), `volatile`.** Ferramentas de meta-programação
  e de sistema; nenhuma é necessária para a fronteira do curso, e todas abrem UB.
- **`struct` com array flexível, atribuição de ponteiro entre tipos, `void*`.** O `void*` está
  implícito em `malloc` e chega com ele.
- **Multi-thread, rede, bibliotecas de terceiros.** A trilha roda só com o compilador e a libc —
  é o que torna o desafio executável sem instalação e o gate determinístico (mesma razão de
  docs/17). Concorrência: `c-avancado`.
- **Sistemas de build (`make`, `CMake`).** O iniciante compila com UM comando, mostrado na aula
  `compilar-sozinho`; o `make` entra no `c-avancado`.

## 4. Toolchain e runtime — pinados

Como docs/17 pinou o `cpython-3.14`, esta trilha pina o compilador. A decisão e a justificativa:

| Pin | Valor | Justificativa |
|---|---|---|
| Compilador | **qualquer `cc` C11-conformante** — na matriz medida do repo: **gcc 16.2.1** (`skills/study-method/references/languages.md` §"A matriz"); nesta execução: **Apple clang 17.0.0**, que é o `gcc` do PATH e produziu os MESMOS resultados com o MESMO comando | a trilha não pode depender de sabor de compilador: o pin é o PADRÃO (`-std=c11`), não o binário. Ambas as máquinas do produto rodam o mesmo comando e produzem o mesmo comportamento medido — inclusive o abort 134 do `assert.h` que torna o `counter_protocol` obrigatório — medido nas duas |
| Padrão | **`-std=c11`** | é o padrão que a matriz de execução do repo já usa para C (medido); é o primeiro padrão estável e universalmente suportado com `stdbool.h`; evita os recursos ainda em rotação do C23 (o `bool` keyword, os `constexpr`) e o modo GNU implícito. O `c-intermediario` decide entre C17/C23 com número na mão — o iniciante não participa dessa discussão |
| Flags de qualidade | **`-Wall -Wextra -Wpedantic`** (prática de terminal e gate da skill) · **`-g`** (runner) · **`-lm`** (quando `math.h`) | o warning é o aliado didático do C (§6, item 8). **O "0 warnings" é PRÁTICA DE TERMINAL, NUNCA gate do desafio** (re-pinado na onda 2): o adaptador não tem caminho de dados para warnings — eles vão para a captura e são descartados num run que passa; a exigência de 0 warnings vive na prosa da aula `compilar-sozinho` e no fluxo da skill. `-lm` já vem no runner, e a aula `mais-contas` explica o porquê |
| Runner | compilar `solucao.c` + `tests/test_solucao.c` → binário com o `main` do harness (`run.sh` gerado pelo adaptador; o `TEST_CMD` canônico de C da skill é OUTRA superfície — §"Regras para os desafios de aula"); o teste imprime os contadores no relatório com namespace (`SM<nonce> TESTS_RUN=`/`TESTS_FAILED=`) e sai `falhas == 0 ? 0 : 1` (`counter_protocol`, §3.9.3); o runner lê o ARQUIVO DE RELATÓRIO (não o stdout) e normaliza para **0** passou · **1** falhou · **2** contagem errada · **3** timeout (D-V11), ecoando `EXIT_BRUTO`/`DECORRIDO_MS`; 66 = infra; outro código pós-normalização = defeito do runner (fail-closed) | é a linha C da matriz de execução do repo, re-pinada na onda 2 contra o adaptador; guard de contagem: `SM<nonce> TESTS_RUN=([0-9]+)` lido do arquivo de relatório — o guard nu `^TESTS_RUN=` NUNCA casa (o relatório sai com o namespace do runner) e o `TESTS_RUN` conta CENÁRIOS (blocos `SM_TEST`), não chamadas de `checa_` — o guard `assert\s*\(` de `languages.md` §"O guard de cada linguagem" não se aplica ao teste gerado: o `counter_protocol` proíbe `assert.h` |
| Adaptador da engine | **`app/electron/main/engine/lang/c.ts`** — nova linha do registro (`LanguageId: 'c'`, ao lado de `javascript`, `python`, `typescript`) | o adaptador C EXISTE (construído na onda 1); o vocabulário deste documento foi CONGELADO na onda 2 contra o seu `inventory()` (`cInventory()`), `cConstructKey()` e o extrator `vocab/c/extract_ast.py` |
| Runtime token | `runtime: 'cc-c11'` · `harnessLanguage: 'c'` · `language: 'c'` | alinhado na onda 2 com `C_DEFAULT_RUNTIME` do adaptador (`c.ts`) — o par (toolchain, padrão); o preliminar `gcc-c11` não existe no adaptador |

## 5. Política de fontes (P-FONTE)

**2–3 fontes oficiais por aula** (`sources[]`), URLs verificáveis, **nunca inventada** — a mesma
cláusula de `references/autoria-aula.md` §1. A base oficial desta trilha, com o status de
verificação de cada grupo (verificado nesta execução: as 40 URLs cppreference abaixo responderam
HTTP 200; man7/GCC/Clang/WG14 confirmados por busca oficial):

| Fonte | URL base | O que cobre | Status |
|---|---|---|---|
| **cppreference (C)** | https://en.cppreference.com/w/c — linguagem: https://en.cppreference.com/w/c/language | referência da linguagem e da libc; a fonte primária de TODA aula de sintaxe | base confirmada; páginas citadas abaixo responderam HTTP 200 nesta execução |
| — por tópico | `…/w/c/language/if` · `…/language/switch` · `…/language/while` · `…/language/do` · `…/language/for` · `…/language/break` · `…/language/continue` · `…/language/function_definition` · `…/language/struct` · `…/language/typedef` · `…/language/sizeof` · `…/language/cast` · `…/language/pointer` · `…/language/array` · `…/language/operator_member_access` · `…/language/operator_other` (o ternário) · `…/language/declarations` · `…/language/statements` | as 21 aulas de linguagem do M1–M4 e os ponteiros/structs de M5–M7 | HTTP 200 (todas) |
| — E/S e tipos | `…/w/c/io` · `…/w/c/io/printf` (printf/fprintf/sprintf/snprintf) · `…/w/c/io/fscanf` (scanf/fscanf/sscanf) · `…/w/c/io/fgets` · `…/w/c/io/fopen` · `…/w/c/io/fclose` · `…/w/c/types` · `…/w/c/types/limits` (INT_MAX) · `…/w/c/types/boolean` (stdbool) · `…/w/c/types/NULL` · `…/w/c/header` | M1 (printf/scanf/limits), M2 (stdbool), M7 (todo o stdio) | HTTP 200 (todas) |
| — strings e matemática | `…/w/c/string` · `…/w/c/string/byte/strlen` · `…/w/c/string/byte/strcmp` · `…/w/c/string/byte/strncpy` · `…/w/c/string/byte/toupper` (ctype) · `…/w/c/numeric/math/sqrt` | M6 inteiro + `mais-contas`/`o-ponto-mais-longe` | HTTP 200 (todas) |
| **ISO/IEC 9899 — WG14** | draft público **N3220**: https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3220.pdf · página do projeto: https://www.open-std.org/jtc1/sc22/wg14/www/projects | o padrão por dentro; citado quando a aula toca o que o padrão PROMETE (p. ex. "o `\0` é obrigatório" — N3220 §7.1.4) | confirmada por busca (o N3220 é o working draft livre de ISO/IEC 9899:2024; o N3096 é o último draft pré-C23 livre, no mesmo repositório de documentos da WG14) |
| **man7.org — man-pages** | https://man7.org/linux/man-pages — páginas: `…/man3/printf.3.html` · `…/man3/scanf.3.html` · `…/man3/strlen.3.html` ·
`…/man3/strcmp.3.html` · `…/man3/strncpy.3.html` · `…/man3/snprintf.3.html` · `…/man3/fopen.3.html` · `…/man3/fgets.3.html` · `…/man3/toupper.3.html` · `…/man3/sqrt.3.html` · `…/man3/assert.3.html` | a referência da libc como o Linux a define — 2ª fonte de toda aula de `api:` | **Re-verificadas na onda 2 (HTTP 200, todas as 11):** printf, scanf, strlen, strcmp, strncpy, snprintf, fopen, fgets, toupper, sqrt e assert responderam 200 nesta execução — nenhuma 404, nada a substituir |
| **GCC online docs** | https://gcc.gnu.org/onlinedocs — warnings: https://gcc.gnu.org/onlinedocs/gcc/Warning-Options.html · C dialect: `…/onlinedocs/gcc/C-Dialect-Options.html` | `-std=c11`, `-Wall`/`-Wextra`/`-Wpedantic` — aulas `a-lista-de-ferramentas` e `compilar-sozinho` | confirmada |
| **Clang docs** | https://clang.llvm.org/docs/UsersManual.html · https://clang.llvm.org/docs/DiagnosticsReference.html | o segundo compilador do pin; diagnósticos nomeados da aula `compilar-sozinho` | confirmada |

**Proibido como fonte primária** (cláusula P-FONTE): blog SEO, `w3schools`, `tutorialspoint`,
`geeksforgeeks` e afins — podem aparecer em `sources[]` como LEITURA COMPLEMENTAR nunca como
primeira fonte, e nunca como a fonte de uma afirmação de linguagem. As aulas que narram história
do C citam Ritchie (*The Development of the C Language*) por nome, sem URL.

**Mapa por módulo** (o mínimo por aula; a onda de autoria completa com a segunda fonte da linha
acima):

| Módulo | Fontes primárias (2–3 por aula) |
|---|---|
| M1 `a-tela` | cppreference `language/declarations`, `io/printf`, `io/fscanf`, `types/limits`, `types/boolean`; man `printf.3`, `scanf.3` |
| M2 `decisao` | cppreference `language/if`, `language/switch`, `language/operator_other`; N3220 §6.8.4 |
| M3 `repeticao` | cppreference `language/while`, `language/do`, `language/for`, `language/break`, `language/continue` |
| M4 `caixas-que-devolvem` | cppreference `language/function_definition`, `numeric/math/sqrt`; man `sqrt.3` |
| M5 `listas-e-enderecos` | cppreference `language/array`, `language/pointer`, `language/sizeof`, `types/NULL`; man-pages de `string.h` quando `NULL`/aritmética |
| M6 `texto-em-profundidade` | cppreference `string/byte/strlen|strcmp|strncpy|toupper`; man `strlen.3`, `strcmp.3`, `strncpy.3`, `toupper.3` |
| M7 `structs-e-arquivos` | cppreference `language/struct`, `language/typedef`, `io/fopen`, `io/printf`, `io/fgets`, `io/fscanf`, `io/fclose`; man `fopen.3`, `fgets.3`; GCC `Warning-Options` na aula 16 |

## 6. O que o C tem de diferente — e a didática decorrente

Oito diferenças estruturais do C frente ao Python da espinha de docs/17, cada uma com a decisão
de currículo que dela decorre e a fonte que a ancora:

1. **A tela passa por um FORMATO.** Não existe `print("custa", preco)` nem interpolação: existe o
   buraco no texto (`%d`, `%f`, `%c`, `%s`) e a ordem dos argumentos. **Didática:** o primeiro
   buraco (%d) é aula (M1, aula 6) ANTES da primeira variável — quem já viu o buraco entende a
   variável como "valor que se encaixa". Fonte: cppreference `io/printf`, man `printf.3`.
2. **Todo valor tem tipo, e o tipo tem TAMANHO medido.** `sizeof(int)` é 4, nesta máquina e na
   matriz do repo. **Didática:** `sizeof` é aula de array (M5, aula 7), e o número medido aparece
   no quiz — o tamanho é fato de máquina, não decoreba. Fonte: cppreference `language/sizeof`,
   N3220 §6.5.3.4.
3. **O valor e o objeto.** Em C existem valores (o número) e objetos (a gaveta com tipo e
   endereço) — e a atribuição copia o valor. **Didática:** a palavra "gaveta" entra na aula
   `um-nome-para-um-valor` e é a ponte para `enderecos`; a máquina nocional do C (valor × gaveta ×
   endereço) é declarada na teoria do M5, não no glossário. Fonte: N3220 §3.15 (object),
   §6.2.1–6.2.2.
4. **Não existe garbage collector.** O que o programa usa, o programa controla. **Didática:** o
   iniciante não administra memória NENHUMA (fora de escopo, §"Fora de escopo") — mas a PROSA da
   trilha nunca mente: a aula `a-caixa-com-gavetas` diz "essas gavetas vivem enquanto o `main`
   roda", e o `c-intermediario` nasce exatamente aí.
5. **O array não sabe o próprio tamanho.** `int v[5]` é 5 gavetas contíguas; dentro de função,
   `v` vira o endereço do primeiro elemento e o `sizeof` não responde mais. **Didática:** é a
   razão de `a-lista-como-parametro` existir como aula (o `n` viaja junto) e do quiz do M5
   ("quando o tamanho precisa viajar com a lista"). Fonte: cppreference `language/array`, N3220
   §6.7.6.2.
6. **A string é um array terminado em `\0`.** Não existe tipo texto: existe array de `char` com
   convenção de fim. **Didática:** o M6 ensina o MECANISMO antes da biblioteca (copiar à mão antes
   de `strncpy`) — quem viu o `\0` copiado à mão lê a man-page de `strcpy` e entende por que ela
   é perigosa. Fonte: man `strlen.3` ("excluding the terminating null byte"), N3220 §7.1.4.
7. **A função precisa ser anunciada antes de usada.** O compilador lê de cima para baixo; o
   protótipo é o cartaz. **Didática:** `declarar-antes-de-usar` é aula própria (M4, aula 12) com
   starter que NÃO compila — o erro de compilação é o conteúdo. A fronteira do curso é organizar
   em `.h`/`.c` (M7, aula 15). Fonte: cppreference `language/function_definition`, GCC
   `Warning-Options`.
8. **O compilador é um aliado com nome.** Os avisos de `-Wall -Wextra` pegam em tempo de
   compilação o que em Python viraria `NameError` em runtime. **Didática:** a trilha inteira é
   pinada com warnings ligados e a PRÁTICA DE TERMINAL exige 0 warnings (re-pinado na onda 2: não
   é gate do desafio — o adaptador não tem caminho de dados para warnings; §4); a aula
   `compilar-sozinho` transforma três avisos reais em exercício. É a "rede de proteção" que o C
   dá de graça — e o motivo de o curso terminar com compilação própria. Fonte: GCC
   `Warning-Options`, Clang `DiagnosticsReference`.

### Ponteiros, sem assustar — o momento e a analogia (declaração didática)

O assunto nº 1 do medo de C é tratado com três proteções de desenho:

- **O momento.** Nada de ponteiro antes do M5 — e o M5 só o nomeia na aula 9, depois de duas
  sementes espalhadas: o `&` da `scanf` (M1, aula 18, narrado como "o endereço da casa, para o
  carteiro preencher") e a cópia que não volta (M4, aula 14, provada em desafio).
- **A analogia.** A variável é a **casa**; o ponteiro é um **papel com o endereço da casa**;
  `*p` é **ir até a casa**; `NULL` é um **papel em branco** — nunca uma casa, e por isso se testa
  antes de ir. A analogia quebra onde toda analogia de endereço quebra: `p + 1` não é "a casa
  seguinte do mapa" genérico, é o elemento seguinte do array — e a aula `andar-de-ponteiro` é a
  que declara a quebra (regra 6 da onda semântica).
- **O payoff.** O assunto paga a dívida que ele mesmo criou: `a-troca-que-funciona` (M5, aula 11)
  refaz o desafio que falhou no M4 e o faz funcionar. Quem sai do M5 nunca viu ponteiro como
  "coisa difícil" — viu duas aulas em que o mesmo problema não funcionava e passou a funcionar.

## 7. Contagem — módulos e aulas por curso

Contado sobre as tabelas de §3 (a conferência executável roda na onda 2, §"A verificação"):

| Curso | Módulos | Aulas | Status |
|---|---|---|---|
| `c-iniciante` | M1–M7 | 21+12+13+15+21+16+17 = **115** | **desenhado integralmente nesta onda; a autorar** |
| `c-intermediario` | porta `a-porta-do-endereco` + M8–M15 | ~12 + ~100 | desenho de fronteira (§1); tabelas na onda que o autora |
| `c-avancado` | porta `a-porta-da-medicao` + M16–M19 | ~8 + ~30 | idem |
| `c-especialista` | porta `a-porta-do-metal` + M20–M22 | ~8 + ~28 | idem |
| **cadeia** | 7 da espinha + 3 portas | **115** + ~186 previstas | — |

## 8. Apêndice — vocabulário de átomos CONGELADO (ondas 2–4)

**CONGELADO na onda 2** e **RE-CONGELADO nas ondas 3–4** contra o inventário REAL do adaptador C
— fonte da verdade lida e confirmada nesta execução: `app/electron/main/engine/lang/c.ts`
(`cInventory()` + `cConstructKey()`), `app/electron/main/engine/vocab/c/extract_ast.py`
(`_EMITIDOS` + `_TRANSPARENTES` + `_familia_do_operador` + os guards de `tagUsed`/macro) e
`app/electron/main/engine/atomKeys.ts` (`C_HARNESS_RECEPTIVE_SEED`, medida). A
verificação executável (`tools/check-trilha-c.mjs`) reproduz estas listas com comentário apontando
a fonte e reprova qualquer chave fora delas (fail-closed). A correção de chave errada é re-mapear
a célula, nunca relaxar o gate.

**Origem: `cInventory()` — os 34 kinds do eixo `node:`** (nó é chave com o prefixo
`node:<Kind>`; a ordem é a da função): `ApiRef` · `ArraySubscriptExpr` · `BinaryOperator` ·
`BreakStmt` · `CStyleCastExpr` (onda 3 — P6: saiu de `_TRANSPARENTES`; o tipo-alvo vai no
atributo `castType`; o cast de MACRO — ex. `NULL` → `((void*)0)` — é derrubado pelo guard e NÃO
emite) · `CallExpr` · `CharacterLiteral` · `CompoundAssignOperator` · `CompoundStmt` ·
`ConditionalOperator` (onda 3 — P4: saiu de `_TRANSPARENTES`; o ternário) · `ContinueStmt` ·
`DeclRefExpr` · `DeclStmt` · `DoStmt` · `FloatingLiteral` · `ForStmt` · `FunctionDecl` ·
`GlobalRef` · `IfStmt` ·
`IncludeDirective` (portadora sintética lida do FONTE — o clang não emite nó para o
preprocessor) · `IndirectCall` (proibida — `C_FORBIDDEN_INVARIANTS`) · `InitListExpr` ·
`IntegerLiteral` · `MemberExpr` (onda 3 — P2: `s.x` e `p->m` são o MESMO kind — a distinção
`dot`/`arrow` vai no atributo `memberAccess`) · `ParmVarDecl` · `RecordDecl` (onda 3 — P1: NÃO
existe kind `StructDecl`; a struct é `RecordDecl` com `tagUsed: "struct"` — o guard derruba o
`tagUsed: "union"` e os campos `FieldDecl` são transparentes) · `ReturnStmt` · `StringLiteral` ·
`SwitchStmt` (onda 3 — P5: os rótulos `CaseStmt`/`DefaultStmt` ficam transparentes e sobem como
filhos) · `TypedefDecl` (onda 3 — P3: os TypedefDecls builtin são `isImplicit` e morrem nos
filtros) · `UnaryExprOrTypeTraitExpr` ·
`UnaryOperator` · `VarDecl` · `WhileStmt`.

**Eixo `decl:`** (2 valores — `declKind`): `decl:func` (`FunctionDecl`, inclusive o protótipo e a
`main`) · `decl:var` (`VarDecl` — escalar, array, array 2D e ponteiro: a FORMA não é distinguida).

**Eixo `op:`** (famílias de `_familia_do_operador`, `op:<família>:<opcode>`):
`op:assign:` — `= += -= *= /= %= &= |= ^= <<= >>=` · `op:binary:` — `+ - * / % < > <= >= == != & | ^ << >>` ·
`op:logical:` — `&& ||` · `op:unary:` — `! + - ~ & * sizeof` · `op:update:` — `++ --`.

**Eixo `api:`** — aberto por formato: toda chamada a função externa (`CallExpr` → `ApiRef`)
emite `api:<nome>`; o usado na espinha: `printf` · `scanf` · `sqrt` · `strlen` · `strncpy` ·
`strcmp` · `snprintf` · `toupper` · `fopen` · `fclose` · `fprintf` · `fgets` · `fscanf` — e os
RECEPTIVOS da semente: `SM_TEST` · `getenv` · `fflush` · `freopen` (§"Axioma de entrada").

**Eixo `global:`** — `stdin` · `stdout` · `stderr` (detectados pelo TEXTO, decisão do adaptador).

**Fora do vocabulário (e não é chave):** `term:` (prosa pt-BR de outro módulo) e o eixo `form:`
(desabilitado — `C_FORM_AXIS_SUPPORTED = false`).

### 8.1 — O remapeamento (preliminar → congelado), eixo a eixo

| Preliminar | Congelado | O que aconteceu |
|---|---|---|
| `node:Call` | `node:CallExpr` | renome para o kind real |
| `node:StrLiteral`/`node:IntLiteral` | `node:StringLiteral`/`node:IntegerLiteral` | idem |
| `node:Return`/`node:If`/`node:While`/`node:For`/`node:DoWhile`/`node:Break`/`node:Continue` | `node:ReturnStmt`/`node:IfStmt`/`node:WhileStmt`/`node:ForStmt`/`node:DoStmt`/`node:BreakStmt`/`node:ContinueStmt` | kinds do clang; `if`/`else` é UM nó (`node:IfStmt`) — `node:IfElse` não existe |
| `node:Subscript` | `node:ArraySubscriptExpr` | idem |
| `node:Switch`/`node:Case`/`node:Default` | `node:SwitchStmt` | o `switch` emite (onda 3, P5); `CaseStmt`/`DefaultStmt` ficam TRANSPARENTES — os rótulos sobem como filhos, sem chave própria |
| `node:Ternary`/`node:Paren` | `node:ConditionalOperator` / — | o ternário SAIU de `_TRANSPARENTES` na onda 3 (P4); o `ParenExpr` continua transparente (e sem aula) |
| `node:Member`/`node:Arrow` | `node:MemberExpr` | UM kind para `.` e `->`; a distinção vai no atributo `memberAccess` (`dot`/`arrow`) — onda 3, P2 |
| `node:FunctionDef`/`node:Prototype` | `decl:func` | definição e protótipo são `FunctionDecl` → `decl:func` |
| `decl:main` | `decl:func` | a `main` é `FunctionDecl` como qualquer outra |
| `decl:param` | `node:ParmVarDecl` | o parâmetro fica no eixo `node:` (decisão do adaptador) |
| `decl:array`/`decl:array2d`/`decl:ptr` | `decl:var` | o `declKind` é `var` para TODA declaração de variável — a FORMA não emite chave (promoção em DEFER — §8.2, P12) |
| `decl:struct`/`decl:typedef` | `node:RecordDecl`/`node:TypedefDecl` | NÃO existe kind `StructDecl` no dump do clang (a struct é `RecordDecl` com `tagUsed: "struct"`; a union, derrubada) — onda 3, P1/P3 |
| `op:assign` (sem dois-pontos) | `op:assign:=` | o eixo é `op:<família>:<opcode>` |
| `op:aug:<op>` | `op:assign:<op>` | os compostos são `CompoundAssignOperator` na MESMA família |
| `op:compare:<op>` | `op:binary:<op>` | o adaptador NÃO refinou família de comparação |
| `op:bool:&&`/`op:bool:\|\|` | `op:logical:&&`/`op:logical:\|\|` | família própria para curto-circuito |
| `op:unary:++`/`op:unary:--` | `op:update:++`/`op:update:--` | família própria de incremento (pré e pós) |
| `op:unary:sizeof` | `op:unary:sizeof` | MANTIDO (o `UnaryExprOrTypeTraitExpr` recebe o atributo) |
| `fmt:%d/%f/%c/%s/%p` | prosa na célula | eixo NÃO existe; o especificador fica descrito na célula da aula que o usa (sem segunda chave) |
| `hdr:<header>` | `node:IncludeDirective` | o `#include` vira portadora sintética; a chave NÃO distingue o header (o `path` fica no atributo — distinguir é decisão da onda 3) |
| `type:int/double/char/bool` | `decl:var` + literal derivado (`node:IntegerLiteral`, `node:FloatingLiteral`, `node:CharacterLiteral`) ou prosa | eixo NÃO existe; o clang separa os LITERAIS por kind |
| `cast:explicit` | `node:CStyleCastExpr` | saiu de `_TRANSPARENTES` na onda 3 (P6); cast de MACRO (`NULL` → `((void*)0)`) é derrubado pelo guard e não emite |
| `qualifier:const` | — | qualificador de TIPO não tem nó no AST do clang — PROSA SEM CHAVE (§8.2, P7; decisão de natureza, não pendência) |
| `api:NULL`/`api:INT_MAX`/`api:INT_MIN` | — | são MACROS: não há `CallExpr`, logo não há `ApiRef` — PROSA SEM CHAVE (§8.2, P8/P9) |
| `node:TranslationUnit` (receptivo) | — | a raiz do dump (`TranslationUnitDecl`) não é chave de construção |

### 8.2 — O destino das pendências de inventário (decidido e MEDIDO nas ondas 3–4)

Na onda 2, as construções abaixo eram conteúdo do `c-iniciante` sem chave no adaptador, e a
decisão de estendê-lo (scaffold/fix) era da onda 3. A decisão ACONTECEU e está medida no
extrator (`extract_ast.py`) e no `cInventory()` de `lang/c.ts`: as SEIS construções curriculares
(P1–P6) **ganharam chave própria**; quatro ficaram **prosa sem chave POR NATUREZA** (P7–P10 —
não há nó no AST, ou é macro); duas seguem em **defer** (P11–P12). Nenhuma célula da espinha usa
mais `[pendente: …]`.

**P1–P6 — RESOLVIDAS, com a chave medida:**

| # | Construção (as aulas que a ensinam) | Chave medida (onda 3) | O que mudou no extrator |
|---|---|---|---|
| P1 | `struct` — a declaração do molde e a variável-ficha (M7 a1; porta do intermediário) | **`node:RecordDecl`** | NÃO existe kind `StructDecl` no dump do clang (Apple clang 17, medido): a definição é `RecordDecl` com `tagUsed: "struct"` — o guard DERRUBA o `tagUsed: "union"` (fora do escopo, como sempre foi); os campos `FieldDecl` são transparentes; a variável-ficha emite `decl:var`, como qualquer `VarDecl` |
| P2 | acesso a campo — `p.x` e `s->m` (M7 a1/a2/a5/a6/a7/a8/a14) | **`node:MemberExpr`** | saiu do derrube "desconhecido": UM kind para `.` e `->`, com o atributo `memberAccess` (`dot`/`arrow`) — o docs/20 nomeia "acesso a campo" UMA vez, e a chave é UMA |
| P3 | `typedef` — o apelido do molde (M7 a3) | **`node:TypedefDecl`** | em `_EMITIDOS` — e também na semente receptiva (o typedef do próprio harness: `typedef void (*SmTestFn)(void);`); os TypedefDecls builtin (`__int128_t` e família) são `isImplicit` e morrem nos filtros |
| P4 | ternário `? :` (M2 a9) | **`node:ConditionalOperator`** | SAIU de `_TRANSPARENTES` — a decisão da onda 2 ("fora do escopo iniciante") foi revertida: o ternário é conteúdo nomeado da espinha |
| P5 | `switch`/`case`/`default` (M2 a8; M4 a15; M6 a16) | **`node:SwitchStmt`** | em `_EMITIDOS`; `CaseStmt` e `DefaultStmt` (kind próprio, medido) ficam TRANSPARENTES — os rótulos sobem como filhos e "switch/case/default" é UM evento de currículo; o `node:BreakStmt` de dentro já emitia |
| P6 | cast explícito `(double)7 / 2` (M1 a13; M3 a13; M5 desafios) | **`node:CStyleCastExpr`** | SAIU de `_TRANSPARENTES` ("ImplicitCastExpr é o mais comum" derrubava o cast EXPLÍCITO junto); o tipo-alvo vai no atributo `castType`; o cast de MACRO (`NULL` → `((void*)0)`) é derrubado por guard próprio — o aluno escreveu `NULL`, não um cast |

**P7–P10 — PROSA SEM CHAVE (decisão de natureza — não existe nó a emitir; nada pendente):**

| # | Construção (as aulas que a ensinam) | Por que NUNCA emite chave | Onde vive no doc |
|---|---|---|---|
| P7 | `const` — o qualificador (M5 a18) | qualificador de TIPO (`QualType`): sem nó próprio no AST do clang — só o texto do fonte o mostra | M5 a18 é consolidação com `term:const` em prosa |
| P8 | `NULL` (M5 a19; M7 a9) | macro (`#define NULL ((void*)0)`): sem `CallExpr` → sem `ApiRef`; e o cast da expansão é derrubado pelo guard do P6 — o que o aluno escreveu é `NULL`, não um cast | M5 a19 é consolidação com `term:NULL` em prosa |
| P9 | `INT_MAX`/`INT_MIN` (M1 a21) | macro → literal após a expansão; sem nó nomeável | M1 a21 (consolidação) cita em prosa |
| P10 | `bool` como tipo distinto (M2 a6; M3 a12) | tipo — a declaração emite `decl:var` e a aula é consolidação "em forma nova" com o tipo em prosa | M2 a6 / M3 a12 |

**P11–P12 — DEFER (a decisão volta à onda que estender o vocabulário; hoje nada muda):**

| # | Construção | Estado |
|---|---|---|
| P11 | distinção do `#include` por HEADER (o `path` que o extrator JÁ captura no atributo) | a chave continua única (`node:IncludeDirective`) — promover a chave por `path` é decisão de engine (o precedente é `api:<nome>`) |
| P12 | formas de declaração — array/2D/ponteiro (M5/M6) | tudo `decl:var` — promover exigiria derivar a forma do `QualType`; enquanto isso o distinguível real vive na célula |

**Regra de ouro, mantida:** nenhuma chave nasce por decreto deste documento — ela nasce do
adaptador medido e o `tools/check-trilha-c.mjs` reprova o que sai dele (fail-closed). As células
com conteúdo sem chave usam prosa nomeada (`term:`) em consolidações, nunca chave inventada.

**O que o apêndice NÃO lista.** As chaves receptivas do harness C ALÉM da semente medida de 19 de
§"Público e axioma de entrada" — a lista definitiva sai da leitura real dos `test_solucao.c`
autorados (como fez docs/17 com as oito chaves do `runpy`); e as chaves derivadas de nó
container, que seguem o mapa da regra do par (§"Vocabulário").

---

### Registro de execução desta onda

- Pesquisa de fontes: **5/5 chamadas `surf-search-normal`** (teto respeitado; backend Brave, 0
  falhas; sem síntese LLM — modo degradado declarado, evidência lida diretamente). Verificação
  adicional: 40 URLs do cppreference conferidas por HTTP 200 nesta execução; fatos de C re-medidos
  nesta máquina com os comandos ao lado (§"Os fatos").
- `PROJECT-ROUTER`: `.claude/skills/project-router/SKILL.md` e
  `.agents/skills/project-router/SKILL.md` **não existem** neste repo (verificado) — registrado no
  handoff, tarefa prosseguiu sem ele.
- Dívidas declaradas: para a **onda 2** — congelar o vocabulário contra o `inventory()`; rodar a
  verificação Ensina × Presume executável; decidir a mecânica do terceiro teste da virada;
  re-verificar as URLs man7 do esquema. Para a **onda 3** (template de prova) — congelar os
  formatos de `test_solucao.c`/`runner.sh` com as quatro provas de execução, agora **sob o
  `counter_protocol`** ([`03-tdd`](build-spec/blocks/03-tdd.md) §3.9.3): o que se congela é a
  implementação do protocolo (dois `static int total, falhas`; helpers `checa_<tipo>` com rótulo
  pt-BR por cenário; `FALHOU [<cenario>]` em stderr sem abortar; `TESTS_RUN=`/`TESTS_FAILED=` em
  stdout; exit `falhas == 0 ? 0 : 1`; filtro `getenv("SM_ONLY")`) e o `TEST_CMD` canônico
  (`-std=c11 -g -O0 -Wall … -lm`), com a divergência de flags do runner do adaptador da engine
  (`-std=c11 -g`) reconciliada no template de prova (NOTA do §"Regras para os desafios de aula").
- **Correção desta rodada (fix-revisão — 2 achados CONFIRMADOS da revisão adversarial):**
  (1) **o pin do protocolo de teste saiu de `assert.h`/exit 134 para o `counter_protocol`**
  ([`03-tdd`](build-spec/blocks/03-tdd.md) §3.7.1 e §3.9.3;
  [`00-contratos.md`](00-contratos.md) §5.3; D-V11 de `languages.md`): reescrito no §"A tensão
  imprimir × devolver" (fases SAÍDA/VALOR, exit codes, formato de teste e exemplo), no §"Público e
  axioma de entrada" (semente receptiva: `hdr:assert.h`/`api:assert` → `hdr:stdlib.h`/
  `api:getenv`, igual no apêndice), no §"Os fatos", no §"Regras para os desafios de aula"
  (com o `TEST_CMD` canônico `-std=c11 -g -O0 -Wall … -lm` e a NOTA de reconciliação da onda 3) e
  no §4 (linhas Compilador e Runner); o "qualquer outro código é defeito do runner" virou a
  semântica D-V11 (0/1/2/3 + `EXIT_BRUTO`/`DECORRIDO_MS` + 66 de infra);
  (2) **o penhasco Ensina × Presume do M5 foi fechado trocando as aulas 12 e 13**:
  `a-lista-como-parametro` (agora a12 — ensina `decl:array` em forma nova, array como parâmetro)
  passou a vir ANTES de `devolver-dois-valores` (agora a13 — cujo desafio `minimo-e-maximo` chama
  `minimoEMaximo(v, 5, &min, &max)`, que passa array para função), com o `Presume` da a13 ajustado
  para `a-lista-como-parametro`, `a-troca-que-funciona`; as 115 linhas recontadas intactas (slug/
  Ensina/Presume/quiz/desafio, verificação manual pós-edição). (Registros de ondas anteriores
  preservam o vocabulário da época — hoje remapeado, §8.1.)

- **DÍVIDA "CONGELAR VOCABULÁRIO" — CONCLUÍDA (onda 2, esta execução).** Resumo do remapeamento:
  (a) inventário REAL confirmado olho nu em `lang/c.ts` (`cInventory()`: 28 kinds; `cConstructKey()`:
  eixos `node:`/`decl:`/`op:`/`global:`/`api:`; `C_DEFAULT_RUNTIME = 'cc-c11'`) e
  `vocab/c/extract_ast.py` (`_EMITIDOS`, `_TRANSPARENTES`, `_familia_do_operador`);
  (b) as **115 células `Ensina` remapeadas** das chaves preliminares para as congeladas (mapa
  integral em §8.1): `op:compare:*` → `op:binary:*`; `op:bool:*` → `op:logical:*`;
  `op:aug:*` → `op:assign:*`; `op:assign` → `op:assign:=`; `op:unary:++/--` → `op:update:*`;
  `node:If/IfElse` → `node:IfStmt`; `node:While/For/DoWhile/Break/Continue/Return` →
  `node:*Stmt`/`node:DoStmt`; `node:Subscript` → `node:ArraySubscriptExpr`;
  `node:FunctionDef/Prototype/decl:main` → `decl:func`; `decl:param` → `node:ParmVarDecl`;
  `decl:array/array2d/ptr` → `decl:var` (forma nova / PENDENTE); `hdr:*` → `node:IncludeDirective`;
  `fmt:*`/`type:*` → prosa na célula (regra da tarefa);
  (c) **13 células com `[pendente: …]`** — construções sem chave no adaptador (cast, ternário,
  switch, const, NULL, struct, typedef, acesso a campo, array 2D) — lista integral com kinds
  clang prováveis em §8.2 (input direto da onda 3);
  (d) aulas que ensinavam chave que colapsou (double, char, include de limits/ctype/string.h,
  ponteiro, array como parâmetro, protótipo, `sua-primeira-caixa`) viraram **consolidações "em
  forma nova"** com o distinguível real nomeado — contagem de consolidações atualizada
  (70/115); progressão produtiva do M1 recongelada; o `op:aug:+` preliminar virou
  `op:assign:+=` — opcode COMPOSTO medido com `cc -Xclang -ast-dump=json` (`x += 3` →
  `opcode: '+='`), não `op:assign:+`;
  (e) semente receptiva recongelada com as chaves reais (§"Axioma de entrada": `decl:func`,
  `node:*Stmt`, `node:DeclRefExpr`, `op:assign:+=`, `op:binary:==/!=`, `node:IncludeDirective`,
  `api:getenv`…); `api:NULL`/`node:TranslationUnit` saíram;
  (f) runtime `gcc-c11` → **`cc-c11`** (§"Regras" e §4); NOTA de reconciliação de flags da onda 3
  PRESERVADA; (g) **as 11 URLs man7 do esquema re-verificadas por HTTP 200 nesta execução**
  (printf, scanf, strlen, strcmp, strncpy, snprintf, fopen, fgets, toupper, sqrt, assert) —
  nenhuma 404, nada a substituir; status do §5 atualizado;
  (h) verificação executável criada: **`tools/check-trilha-c.mjs`** (node puro) — I12, LACUNA,
  VOCAB (fail-closed contra o congelado + PENDENTE), A7 (regra do par com mapa de derivadas) e
  A6 — **verde sobre o doc após o remapeamento** (5 testes negativos executados sobre CÓPIAS
  temporárias — chave fora do inventário, 3 construções, Presume para aula posterior, Presume
  fantasma, slug repetido — TODOS pegos com exit 1; estado quebrado NÃO commitado).

- **Correção da revisão de integração (onda 2 — steering do orquestrador, 5 achados de repro
  empírica de `lang/c.ts`):** SAÍDA re-pinada para o **modelo cenário-do-harness** — `solucao.c`
  NUNCA tem `main` (`duplicate symbol '_main'`; captura do stdout só sai com exit≠0): o aluno
  escreve FUNÇÕES que a tela pede, o teste captura o stdout NO PRÓPRIO TESTE (`freopen` para
  arquivo temporário em `testsCode` — stdlib puro) — §"A aula 1", §"A tensão" e as células M1
  a2/a3 ajustadas; **`TESTS_RUN` conta CENÁRIOS** (blocos `SM_TEST`), não chamadas de `checa_` —
  `expectedTestCount` = nº de cenários, 1–4 por desafio; **guard com namespace**
  (`SM<nonce> TESTS_RUN=`) e canal confiável = arquivo de relatório com nonce (o guard nu
  `^TESTS_RUN=` nunca casa); **duas superfícies de runner** explicitadas (`runner.sh`/`.build/
  test_bin` = fluxo da skill; `run.sh` em dir temporário = layout gerado pelo adaptador);
  **0-warnings é PRÁTICA DE TERMINAL**, nunca gate do desafio (§4, §6 item 8, aula M7 a16).
  As chaves do inventário NÃO mudam com este steering.

- **DÍVIDA "CONGELAR VOCABULÁRIO" — CONCLUÍDA (onda 4, esta execução).** As pendências da onda 2
  foram resolvidas CONTRA o adaptador medido das ondas 3–4 e o doc passou ao presente:
  (a) **inventário re-contado e re-congelado: 34 kinds `node:`** (28 da onda 2 + `RecordDecl`,
  `MemberExpr`, `TypedefDecl`, `ConditionalOperator`, `SwitchStmt`, `CStyleCastExpr` —
  confirmados olho nu em `cInventory()` de `lang/c.ts` e em `_EMITIDOS`/`_TRANSPARENTES` +
  guards de `tagUsed`/macro do `extract_ast.py`); semente receptiva recongelada na lista MEDIDA
  de **19 chaves** de `C_HARNESS_RECEPTIVE_SEED` (`atomKeys.ts`), com a fronteira declarada
  (`decl:var`/`node:IncludeDirective` RECEPTIVAS APENAS — a solução antecipada continua
  reprovando no A2);
  (b) **13 células com `[pendente: …]` remapeadas para a chave real ou para prosa nomeada** —
  M1 a13 cast → `node:CStyleCastExpr`; M2 a8 switch → `node:SwitchStmt` (+ `node:BreakStmt`); M2
  a9 ternário → `node:ConditionalOperator`; M5 a18/a19 (const/NULL) → consolidações com
  `term:const`/`term:NULL` (prosa sem chave — P7/P8); M7 a1 → `node:RecordDecl` +
  `node:MemberExpr`; M7 a2/a6/a7/a8/a14 → `node:MemberExpr` (consolidações); M7 a3 →
  `node:TypedefDecl`; M7 a5 → `node:MemberExpr` (a MESMA chave, atributo `memberAccess`);
  progressão do M1 recontada: **22 chaves congeladas** (o cast saiu do pendente e o número
  ficou verdadeiro); §8/§8.1/§8.2 reescritos (P1–P6 RESOLVIDOS com a chave medida; P7–P10 prosa
  por natureza; P11–P12 defer); mapa de derivadas com as seis linhas novas;
  (c) **M7 a15 (`a-biblioteca-em-dois-arquivos`) redesenhado**: o `main` nunca foi do aluno
  (`duplicate symbol '_main'`) — o aluno escreve `ponto.h` + `ponto.c` (`files[]`), o `main.c`
  de três arquivos vira LEITURA na teoria (posição do `return 0` do M1), e o teste declara
  PROTÓTIPOS no topo SEM include do header do desafio — repro medida: o `countDeclared` parseia
  o teste num tempdir vazio (`cParse(SM_COUNT_PREABULO + testsCode)`), o include não resolve lá
  (`clang: fatal error: '../ponto.h' file not found` com as flags do adaptador) e a contagem
  declarada vira 0 (dupla-igualdade reprova); consequência de desenho: API exercitada com
  assinaturas planas, a ficha provada pelo comportamento da biblioteca;
  (d) **o pipe não escapado da célula M6 a8 corrigido** (`Nome: Ana \| Idade: 20` — o
  `splitRow` do check já tolerava o pipe dentro de crases, mas a tabela markdown quebrava na
  renderização GFM);
  (e) contagens atualizadas: M5 17 de 21 consolidações (a18/a19 viraram cons.), 72 de 115 no
  total; `tools/check-trilha-c.mjs` com `NODE_KINDS` = 34 — **VERDE** sobre o doc, com teste
  negativo sobre cópia em /tmp (chave fora do inventário → exit 1, descartada em seguida).
