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
> este documento está errado. O vocabulário de átomos deste documento é **PRELIMINAR e assumido**
> (§"Vocabulário" e §"Apêndice"): o adaptador C da engine está sendo construído **em paralelo,
> nesta mesma onda 1**, como nova linha do registro de adaptadores
> (`app/electron/main/engine/lang/` — hoje `javascript.ts`, `python.ts`, `typescript.ts` e
> `registry.ts`; o `c.ts` é irmão deste documento). A onda 2 **congela** as chaves daqui contra o
> `inventory()` real do adaptador e re-executa a verificação Ensina × Presume (§"A verificação").
> Nenhuma chave daqui é origem normativa até esse congelamento.
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
| `a-porta-do-endereco` (~12 aulas) | iniciante → intermediário | `decl:ptr`, `op:unary:*`, `op:unary:&`, `decl:array`, `decl:struct`, `node:Arrow`, `fmt:%s`/`api:strlen`, `api:fopen`/`api:fprintf`/`api:fgets` — as aulas-fonte 8–14 do M5, 1–11 do M6 e 9–14 do M7, reescritas para "quem vem do iniciante" |
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

Uma linha, escrita pelo aluno, dentro do trampolim congelado (abaixo), sem variável, sem `scanf`,
sem função própria. Ele roda, vê `oi` aparecer, e acabou. Tudo o que vem abaixo — a ordem dos
módulos, o formato dos testes, o axioma de entrada — é consequência dessa decisão, não o contrário.

**O trampolim `main`.** C não tem modo script: nada roda fora de uma função, e a função é sempre
`main`. O análogo honesto do script Python de uma linha é o programa cujas partes fixas o aluno
**lê e nunca edita** (`frozenRegion`, como o arquivo de teste):

```c
#include <stdio.h>

int main(void) {
    printf("oi\n");   /* ← a linha que o aluno escreve */
    return 0;
}
```

Nas **aulas 1–3** o aluno usa o trampolim com regiões congeladas e escreve só o corpo (aula 1),
depois o `main` inteiro (aula 2), depois também o `return 0;` (aula 3); na **aula 4** ele escreve o
`#include <stdio.h>` — e vê o aviso do compilador quando esquece. A partir da aula 2 ele já digitou
a porta do programa; a competência "escrever um programa C inteiro sozinho" fica assim, literalmente
verificável desde o começo.

---

### A tensão imprimir × devolver, e a virada em C

O modo de falha nº 1 de exercício gerado (a solução imprime enquanto o teste espera retorno —
30,9% medido em docs/16 §10) não depende de linguagem. A progressão de canal é a mesma em três
fases, com a virada na aula `imprimir-nao-e-devolver` (M4):

| Fase | Módulos | `outputChannel` | O que o teste assevera |
|---|---|---|---|
| **SAÍDA** | M1 a M3 | `impressao` | o texto que o programa imprimiu (`stdout` capturado pelo runner) |
| **A VIRADA** | M4, aula `imprimir-nao-e-devolver` | `ambos` | o retorno **e** a saída, no mesmo desafio |
| **VALOR** | M4 (a partir da virada) a M7 | `retorno` | o valor que a função devolveu (comparado pelo helper `checa_<tipo>` do `counter_protocol`) |

O que muda de forma para C é **como** o teste mede cada fase — e isto é pinado aqui, para a onda 2
congelar com as provas de execução do adaptador:

- **SAÍDA**: o `runner.sh` compila `solucao.c` com os testes e roda o binário do programa
  redirecionando `stdout` para um arquivo; `test_solucao.c` lê o arquivo (`fopen`/`fgets`) e
  assevera com o helper `checa_<tipo>` do `counter_protocol`. O aluno nunca escreve nada disso: é
  semente receptiva (abaixo).
- **VALOR**: `test_solucao.c` declara os **protótipos** das funções do aluno no topo (congelados) e
  assevera o retorno com o helper do `counter_protocol` —
  `checa_int("o dobro de 2 e 4", dobro(2), 4, "o dobro de n é n × 2");`. **Regra de harness
  declarada:** antes
  da aula `a-biblioteca-em-dois-arquivos` (M7), o teste NÃO usa `#include "solucao.h"` — o
  protótipo solto no topo do teste é a forma autorizada, porque o header próprio só nasce como
  conteúdo no M7. A partir daí, `#include "solucao.h"` é a forma legítima (e a esperada).
- **A VIRADA**: os três fatos do desafio são normativos (devolve; imprime; **chamar a caixa
  sozinha não imprime nada**). A mecânica exata do terceiro fato em C (capturar o `stdout` de uma
  chamada dentro do processo do teste, via `dup2`/`freopen`, ou medir num segundo binário que o
  runner monta) é decisão da onda 2 com as quatro provas de execução rodando — este documento
  pinna os fatos e a ordem, não a mecânica.
- **Exit codes desta trilha (D-V11, `languages.md`)**: o teste sai `return falhas == 0 ? 0 : 1`
  (`counter_protocol`) e o `runner.sh` **normaliza** o exit bruto para **0** passou · **1** falhou ·
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
rodar. Ao final, `printf("TESTS_RUN=%d\nTESTS_FAILED=%d\n", total, falhas)` em **stdout** — a
contagem que o gate confere por IGUALDADE contra `expectedTestCount`, nunca `> 0` (DES-4,
[`03-tdd`](build-spec/blocks/03-tdd.md) §3.7.2) —, exit `return falhas == 0 ? 0 : 1`, e o filtro
`--only` via `getenv("SM_ONLY")`: contrato integral de
[`03-tdd`](build-spec/blocks/03-tdd.md) §3.9.3, com a semântica de exit de D-V11.

---

### Público e axioma de entrada

**Público: quem nunca programou.** Zero absoluto — essa é a entrada do `c-iniciante`, e é a única
entrada declarada na cadeia (§1). A mesma pessoa, curso a curso: **115** aulas depois (fim do M7)
escreve um programa C inteiro sozinha; os cursos seguintes partem dessa fronteira (§1). Este
documento não promete prazos — promete a cadeia.

**Axioma de entrada RECEPTIVO: o trampolim e o runner.** O que o aluno lê e não escreve em lugar
nenhum: o `main` congelado das primeiras aulas e o arquivo de teste. O que isso contém (a lista
normativa para a constante `C_HARNESS_RECEPTIVE_SEED` da engine, a congelar na onda 2 — mesma
dívida declarada que o Python carregou em docs/17 §"A semente receptiva"):

```
node:TranslationUnit  node:FunctionDef  node:Return  node:Name  node:IntLiteral
node:StrLiteral  node:Call  decl:var  decl:array  decl:ptr  node:Subscript
node:If  node:While  node:For  node:Prototype  op:aug:+  op:compare:==  op:compare:!=
op:unary:*  hdr:stdio.h  hdr:stdlib.h  hdr:string.h
api:getenv  api:printf  api:fopen  api:fclose  api:fgets  api:fscanf  api:fprintf
api:NULL  api:strcmp  api:strlen
```

(`hdr:assert.h`/`api:assert` saíram da semente com o `counter_protocol`: o teste gerado não usa
`assert.h`; entrou o par que o protocolo exige para o filtro `--only` — `hdr:stdlib.h`/
`api:getenv`, `getenv("SM_ONLY")`, [`03-tdd`](build-spec/blocks/03-tdd.md) §3.9.3.)

**Axioma de entrada PRODUTIVO: duas chaves, e só duas.**

| Chave | Por que é axioma e não aula |
|---|---|
| `node:Call` | não existe programa em C que **faça** alguma coisa sem uma chamada de função (`printf` é uma). Uma aula "chamar" precisaria de um desafio em que o aluno chama algo — e não há nada para chamar antes de `printf`. É a gramática de "rodar", não conteúdo |
| `node:StrLiteral` | é a mensagem que o `printf` mostra. Separar as duas exigiria uma aula "chamar `printf` sem argumento", que não mostra nada na tela e viola J6 (o passo apagado tem de ser o átomo-alvo) |

**Consequência: a aula 1 introduz EXATAMENTE UM átomo produtivo — `api:printf`.** Medido nesta
máquina, o programa de uma linha dentro do trampolim compila com o pin da trilha, roda e sai
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
| `x = 10; x += 3;` → **13** | a atribuição composta é um gesto só (regra do par: `op:aug:+`) |
| `assert.h` que falha → exit **134** (`SIGABRT`) no PRIMEIRO erro, medido | é o motivo de o teste C desta trilha NUNCA usar `assert.h`: o `counter_protocol` é obrigatório ([`03-tdd`](build-spec/blocks/03-tdd.md) §3.7.1, §3.9.3); a falha sai como `TESTS_FAILED` > 0 em stdout e exit 1 — sem abortar os cenários seguintes |
| **Não existe `input()`/`print()` de nível script** | toda E/S passa por `printf`/`scanf` com FORMATO: o `%d` é evento de currículo (aula `buraco-na-frase`) antes da variável |
| **Não existe modo script** — tudo nasce dentro de `main` | o trampolim é a semente receptiva; `decl:main` é aula (a 2ª), `node:FunctionDef` é aula (M4) |
| **O compilador lê de cima para baixo** | protótipo é aula própria (`declarar-antes-de-usar`, M4); sem ele, chamar antes de definir não compila |
| **O array não sabe o próprio tamanho** | `sizeof v / sizeof v[0]` funciona só onde o array foi declarado; dentro de função o tamanho viaja como parâmetro (`a-lista-como-parametro`) |

---

### Vocabulário de átomos desta trilha — PRELIMINAR (assumido)

O adaptador C está sendo construído **agora**, em paralelo a este documento
(`app/electron/main/engine/lang/`); o seu `inventory()` é o vocabulário REAL, e a onda 2 o congela.
Enquanto isso, a espinha usa as chaves **mais prováveis**, seguindo os eixos do repositório
(`docs/17` §"Vocabulário"): `node:`, `decl:`, `op:binary:`, `op:compare:`, `op:bool:`, `op:unary:`,
`op:aug:`, `api:` — e três eixos novos que o C exige e o Python não tinha (`fmt:`, `hdr:`,
`type:`), mais dois de uma linha cada (`cast:`, `qualifier:`). A lista integral, com o status de
cada chave, está no **§"Apêndice"**. Nenhuma chave daqui é origem normativa antes do congelamento;
a verificação de eixo fechado da onda 2 rejeita qualquer chave que o `inventory()` não emita.

Três decisões de vocabulário declaradas, com o motivo:

1. **`decl:` continua "forma de ligação de nome".** Em C a declaração carrega o tipo: `decl:var`
   (escalar), `decl:array`, `decl:ptr`, `decl:param`, `decl:struct`, `decl:typedef`,
   `decl:array2d`. A **primeira** declaração de um tipo primitivo produz o tipo como chave
   **derivada** (regra do par): `decl:var` → `type:int`. `int`, `double` e `char` são os únicos
   tipos primitivos produtivos da trilha (`bool` vem de `hdr:stdbool.h`; `unsigned`, `short`,
   `long`, `float` estão fora de escopo — §"Fora de escopo").
2. **Atribuição é operador, não ligação.** `x = 10;` num nome que já existe é `op:assign`; a
   **inicialização na declaração** (`int x = 10;`) é parte de `decl:var`. É a distinção que o C
   faz de verdade (declaração × expressão de atribuição), e a que o orçamento precisa.
3. **Comparação é família própria (`op:compare:`), separada de `op:binary:`** — mesmo em C as duas
   famílias serem `BinaryOp` para o parser. O motivo é o de docs/17: misturar faria o orçamento de
   uma aula de igualdade liberar aritmética. A onda 2 confirma se o adaptador refina; se não
   refinar, as aulas de comparação continuam nas mesmas posições, com as chaves que o
   `inventory()` emitir.

#### A regra do par — a divergência normativa que este documento declara

Vale a redação normativa de docs/17, reproduzida por ser o que a onda 2 implementa:

> **A tabela `Ensina` lista só a chave que DISTINGUE. O gerador de `introduces` acrescenta as
> chaves que a mesma construção produz inevitavelmente, e o conjunto conta como UM item para
> A7/I2.**

O mapa de derivadas é mecânico; o análogo C, a congelar com o adaptador:

| Chave listada em `Ensina` | Derivadas que a mesma construção produz |
|---|---|
| `decl:var` (primeira ocorrência) | `type:int` (o tipo que a declaração carrega) |
| `decl:array` | `node:InitList` quando com inicializador entre chaves |
| `decl:struct` | `node:Member` — o acesso `p.x` é o par inevitável da primeira ficha |
| `node:FunctionDef` | `decl:param` só quando a aula é a de parâmetro; caso contrário nada |
| `node:Switch` | `node:Case`, `node:Default` |
| `op:binary:<qualquer>` | o nó container da expressão binária do adaptador C |
| `op:unary:<qualquer>` | o nó container da expressão unária do adaptador C |
| `op:compare:<qualquer>` | idem, na família de comparação |
| `op:aug:<qualquer>` | o nó container da atribuição composta |
| `cast:explicit` | o nó container do cast |
| `api:printf`/`api:fprintf`/`api:snprintf` | as chaves de formato `fmt:` usadas na MESMA aula não são segunda origem para I3 (quem as registra primeiro fica com elas) |

---

### Princípios pedagógicos aplicados

1. **A primeira construção é a que produz efeito visível.** O aluno escreve `printf`, roda e vê.
   O trampolim é `frozenRegion`, não "isso a gente explica depois" — e nas aulas 2–4 ele vira
   conteúdo, uma peça por aula.
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
| 1 | `a-tela` | 21 | 2 | base | nada — é o zero absoluto |
| 2 | `decisao` | 12 | 4 | base | variáveis, contas e comparações (M1) |
| 3 | `repeticao` | 13 | 9 | base | `if`/`else` e as chaves de bloco (M2) |
| 4 | `caixas-que-devolvem` | 15 | 11 | base | laços (M3) |
| 5 | `listas-e-enderecos` | 21 | 13 | base | função com parâmetro e `return` (M4) |
| 6 | `texto-em-profundidade` | 16 | 9 | base | arrays e ponteiros básicos (M5) |
| 7 | `structs-e-arquivos` | 17 | 9 | base | strings e seus bibliotecários (M6) |

**Por que 115, e por que tantas consolidações (57 de 115, ~50%).** O número é **saída, não entrada**
([`16`](16-engine-de-trilha.md) §3.6). O C dá MENOS chaves por gesto que o Python: um
`node:Subscript` cobre ler, escrever e indexar; `node:Member` cobre todo acesso a campo; e as
construções que definem o curso — `swap` que funciona, lista como parâmetro, string terminada em
`\0`, registro em arquivo — são **composições**, e composição vira aula própria (P-MICRO). O M4
concentra consolidações pelo mesmo motivo medido em docs/17 (10 de 14 lá, 12 de 15 aqui): a
decomposição pedagógica de "função" é obrigatória, e as chaves não multiplicam. Toda consolidação
nomeia o degrau na própria célula `Ensina` ("em forma nova (…)").

### A tensão A6 × I3, e como esta trilha a resolve

Mesma resolução normativa de docs/17: I3 fala da **primeira introdução**; a aula de consolidação
declara `role: "consolidation"`, lista em `introduces.productive` o átomo que **reexercita**, e
mantém `targetAtom` apontando para a aula de origem. Duas consequências específicas do C,
declaradas:

- **`node:Break` nasce no `switch` (M2), não no laço.** Em C o primeiro `break` legítimo é o do
  `switch` — a aula `escolher-por-valor` o introduz, e a aula `parar-no-meio` (M3) é consolidação
  ("em forma nova: sair de um laço"). O Python não tinha essa inversão porque não tem
  fallthrough.
- **`node:Return` nasce no `main` (M1), e volta em forma nova no M4.** O Python ensinava
  `node:Return` no M4 porque o aluno nunca o tinha escrito; aqui a aula 3 `devolver-zero` é a
  origem, e o M4 reexercita com degrau ("um valor para quem chamou").

---

### A verificação Ensina × Presume

**Reexecutável na onda 2 — e é a rede.** Como em docs/17, o script lê as tabelas deste arquivo,
monta a ordem da cadeia e reprova: **I12** (slug repetido no mesmo curso), **LACUNA** (`Presume`
apontando para aula que ainda não veio), **I3** (átomo com duas origens ou origem em aula que é
axioma), **VOCAB** (chave que o `inventory()` do adaptador C não emite — fail-closed: sem o
inventário no disco, reprova), **A7** (mais de 2 átomos numa aula que não é consolidação) e
**A6** (aula que não introduz nem consolida nada; consolidação que reforça átomo sem origem
anterior na cadeia). A rodada desta onda 1 é MANUAL (o inventário ainda não existe); a rodada
executável é condição de aceite da onda 2, que também roda os quatro gates da engine sobre as
primeiras aulas autoradas.

---

### Conteúdo por aula

Nas tabelas, `Ensina` lista as construções produtivas novas (**no máximo 2**, pela regra do par) e
`Presume` nomeia a aula anterior que ensinou cada construção pressuposta. "cons." marca uma aula de
**consolidação declarada** (`role: "consolidation"`, com o degrau nomeado). A coluna `Quiz` traz
UMA afirmação para o quiz da aula (maestria obrigatória, ciclo de remediação — docs/17 §"O quiz da
aula"); a coluna `Desafio` traz o slug e o cenário de teste. Os 7 módulos vão ao nível de átomo.

O vocabulário de átomos é **PRELIMINAR** (§"Vocabulário"): a onda 2 o congela contra o
`inventory()` do adaptador C; as chaves aqui usadas estão listadas no apêndice.

---

#### Módulo 1 — `a-tela` (21 aulas)

A tela, a variável, a aritmética. Fase SAÍDA (`outputChannel: impressao`) nas 21 aulas. As aulas
1–3 usam o trampolim com regiões congeladas em graus; a aula 2 é a primeira em que o aluno digita o
programa inteiro.

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `primeira-tela` — A primeira linha na tela | `api:printf` | nada | O `\n` no fim do literal manda a próxima saída para outra linha. | `tres-linhas` — imprime três linhas fixas; o teste compara o stdout inteiro. |
| 2 | `o-esqueleto` — A porta do programa | `decl:main` | `primeira-tela` | Todo programa C começa a rodar pela função `main`. | `sua-primeira-janela` — o aluno digita o `main` inteiro (o include e o `return` continuam congelados) e imprime uma linha própria; teste compara o stdout. |
| 3 | `devolver-zero` — O programa termina e diz como foi | `node:Return` | `o-esqueleto` | O `0` que o `main` devolve é o código de saída: zero significa "terminou bem". | `fim-limpo` — o aluno escreve também o `return 0;`; o runner exige exit 0 e captura a saída. |
| 4 | `a-lista-de-ferramentas` — O inventário de cima | `hdr:stdio.h` | `primeira-tela` | Sem `#include <stdio.h>` o compilador não sabe o que `printf` é e avisa na compilação. | `include-proprio` — o starter vem SEM o include; o aluno o adiciona; o desafio falha antes (compilação) e passa depois. |
| 5 | `o-que-o-compilador-ignora` — O que o compilador ignora | cons. — `api:printf` em forma nova (com comentários; `term:comentário`) | `primeira-tela` | O compilador ignora tudo entre `//` e o fim da linha, e entre `/*` e `*/`. | `ficha-comentada` — programa com comentário de cabeçalho e por linha; o teste prova que a saída não muda. |
| 6 | `buraco-na-frase` — O buraco na frase | `fmt:%d` | `primeira-tela` | Cada `%d` consome um argumento inteiro, na ordem em que aparecem. | `ficha-numerada` — frase com dois números fixos interpolados; teste compara a frase inteira. |
| 7 | `um-nome-para-um-valor` — Um nome para um valor | `decl:var` (com inicialização; `type:int` é derivada) | `buraco-na-frase` | Após `int idade = 20;`, `idade` vale 20 até alguém mudar. | `idade-na-tela` — declara a idade e imprime com `%d`; teste compara a linha. |
| 8 | `mudar-o-valor` — Mudar o valor | `op:assign` | `um-nome-para-um-valor` | O valor antigo é perdido no momento da atribuição. | `trocar-os-valores` — troca os valores de duas variáveis usando uma terceira; teste imprime as duas depois da troca. |
| 9 | `somar-e-subtrair` — As contas de inteiro | `op:binary:+`, `op:binary:-` | `mudar-o-valor` | O C calcula a conta e então atribui: `x = 2 + 3;` deixa 5 em `x`. | `total-da-compra` — soma e subtrai valores fixos; teste compara o resultado impresso. |
| 10 | `multiplicar-e-dividir` — Multiplicar, e o corte da divisão | `op:binary:*`, `op:binary:/` | `somar-e-subtrair` | Entre inteiros, `7 / 2` é 3 — o C corta, sem arredondar (medido). | `repartir-figurinhas` — reparte figurinhas entre amigos (divisão inteira); teste compara o quociente. |
| 11 | `o-resto` — O resto que sobra | `op:binary:%` | `multiplicar-e-dividir` | `17 % 5` é 2 — o resto da divisão inteira (medido). | `minutos-e-segundos` — decompõe um total de segundos fixo em minutos e segundos; teste compara os dois números. |
| 12 | `o-numero-com-virgula` — O número com vírgula | `type:double`, `fmt:%f` | `um-nome-para-um-valor`, `buraco-na-frase` | `%f` imprime seis casas por padrão: 3.5 sai como `3.500000`. | `preco-com-decimais` — imprime um preço `double`; teste compara a saída com seis casas. |
| 13 | `a-divisao-real` — Dividir de verdade | `cast:explicit` | `multiplicar-e-dividir`, `o-numero-com-virgula` | `(double)7 / 2` é 3.5 — o cast de UM lado basta para a conta virar real. | `media-de-dois` — média de dois inteiros fixos com casas decimais; teste compara o valor com `%f`. |
| 14 | `a-ordem-das-contas` — A ordem das contas | `node:Paren` | `somar-e-subtrair`, `multiplicar-e-dividir` | `2 + 3 * 4` é 14; `(2 + 3) * 4` é 20. | `media-ponderada` — média ponderada com parênteses corretos; teste compara o valor exato. |
| 15 | `somar-no-lugar` — Somar no próprio nome | `op:aug:+`, `op:aug:-` | `mudar-o-valor`, `somar-e-subtrair` | `x += 3` é o mesmo que `x = x + 3;` (medido: 10 → 13). | `contador-de-visitas` — acumula três valores com `+=`; teste compara o total. |
| 16 | `um-de-cada-vez` — De um em um | `op:unary:++`, `op:unary:--` | `somar-no-lugar` | `x++;` sozinho soma um — e é por isso que a condição do laço nunca pode esquecer o passo. | `ovos-na-cesta` — incrementa um contador três vezes e imprime; teste compara o total. |
| 17 | `comparacoes` — Comparar devolve 0 ou 1 | `op:compare:==`, `op:compare:>=` (a família `== != < <= > >=`) | `multiplicar-e-dividir` | `printf("%d", 3 > 2)` imprime 1: em C a comparação É um número. | `tabela-de-comparacoes` — imprime o resultado (0/1) de cinco comparações fixas; teste compara a tabela. |
| 18 | `perguntar-ao-usuario` — Perguntar ao usuário | `api:scanf`, `op:unary:&` | `um-nome-para-um-valor` | O `&` entrega à `scanf` o ENDEREÇO da variável — é ela quem preenche a casa. | `dobro-do-digitado` — lê um inteiro e imprime o dobro; teste injeta 21 no stdin e espera 42. |
| 19 | `dois-valores-de-uma-vez` — Dois valores de uma vez | cons. — `api:scanf` em forma nova (dois `%d` na mesma chamada) | `perguntar-ao-usuario` | Digitando `3 4`, o `%d %d` lê os dois — espaço e Enter servem os dois. | `soma-digitada` — lê dois inteiros e imprime a soma; teste injeta 3 e 4, espera 7. |
| 20 | `uma-letra-e-um-numero` — A letra que é um número | `type:char`, `fmt:%c` | `um-nome-para-um-valor`, `buraco-na-frase` | `'A'` é o número 65: `printf("%c", 'A' + 1)` imprime `B` (medido). | `proxima-letra` — dada a letra declarada no código, imprime a seguinte; teste compara a letra. |
| 21 | `o-limite-do-int` — O maior número que cabe | `hdr:limits.h` | `comparacoes` | `INT_MAX` é 2147483647 nesta máquina (medido); passar dele não é erro de compilação — é comportamento indefinido, e a trilha o evita, nunca o testa. | `o-teto-e-o-piso` — imprime `INT_MAX` e `INT_MIN`; teste compara os dois números. |

**Progressão produtiva do M1 (27 átomos, na ordem):** `api:printf → decl:main → node:Return →
hdr:stdio.h → fmt:%d → decl:var → op:assign → op:binary:+ → op:binary:- → op:binary:* →
op:binary:/ → op:binary:% → type:double → fmt:%f → cast:explicit → node:Paren → op:aug:+ →
op:aug:- → op:unary:++ → op:unary:-- → op:compare:== → op:compare:>= → api:scanf → op:unary:& →
type:char → fmt:%c → hdr:limits.h`.

**Por que esta ordem — cada decisão, e o que ela elimina**

- **`printf` antes de `main`** porque o efeito visível vem primeiro (princípio 1) — e o trampolim
  torna isso possível SEM mentir: o `main` congelado é semente receptiva, e a aula 2 o entrega
  como conteúdo, uma peça inteira.
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
| 1 | `se` — O primeiro desvio | `node:If` (+ `term:blocos-de-chaves`) | `comparacoes` | Sem chaves, só a PRIMEIRA linha depois do `if` pertence a ele — nesta trilha, chaves sempre. | `maior-de-idade` — lê a idade e imprime uma linha só se `>= 18`; teste com 21 (imprime) e 15 (não imprime). |
| 2 | `se-senao` — Um caminho ou outro | `node:IfElse` | `se` | Exatamente um dos dois blocos roda. | `par-ou-impar` — lê um inteiro e diz par ou ímpar com `%`; teste com 7 e 8. |
| 3 | `e-logico` — Duas condições ao mesmo tempo | `op:bool:&&` | `se`, `comparacoes` | `1 && 0` é 0: os dois lados precisam ser verdadeiros. | `na-faixa` — lê um número e imprime `ok` se estiver em 1..100 (`&&` de duas comparações); teste com 50, 0 e 101. |
| 4 | `ou-logico` — Um caminho ou o outro | `op:bool:\|\|` | `e-logico` | `0 \|\| 7` é 1: basta um lado verdadeiro. | `fim-de-semana` — lê o dia (1–7) e imprime `folga` para 6 ou 7; teste com 6, 7 e 3. |
| 5 | `negacao` — Inverter a condição | `op:unary:!` | `ou-logico` | `!(3 > 2)` é 0: a negação troca verdadeiro por falso. | `fora-da-faixa` — inverte o desafio da faixa com `!`; teste com 0 e 50. |
| 6 | `verdadeiro-e-falso-com-nome` — Dar nome à verdade | `hdr:stdbool.h`, `type:bool` | `negacao` | `bool` guarda 0 ou 1 com os nomes `false` e `true` — e imprime com `%d`. | `flag-de-aprovado` — `flag = nota >= 6;` e imprime com `%d`; teste com 8 (1) e 4 (0). |
| 7 | `em-cascata` — Vários caminhos em ordem | cons. — `node:IfElse` em forma nova (cascata `else if`) | `se-senao` | Quando duas condições são verdadeiras, roda só a PRIMEIRA que casou. | `conceito-da-nota` — cascata 9–10 A, 7–8 B, 5–6 C, senão D; teste com 9, 7, 5 e 3. |
| 8 | `escolher-por-valor` — O painel de botões | `node:Switch`, `node:Break` | `em-cascata` | Sem o `break`, a execução CAI para o `case` de baixo (fallthrough). | `menu-do-dia` — `switch` sobre o dia 1–7 com `break`; teste com 1 e 6. |
| 9 | `escolher-em-uma-linha` — A condição que devolve | `node:Ternary` | `se-senao`, `um-nome-para-um-valor` | `max = a > b ? a : b;` atribui um dos dois valores numa linha. | `maior-de-dois` — lê dois números e imprime o maior via ternário; teste com (3, 9) e (9, 3). |
| 10 | `faixas-com-prioridade` — Faixas com prioridade | cons. — `op:bool:&&` em forma nova (condições compostas dentro da cascata) | `em-cascata`, `e-logico` | A ordem das faixas importa: o teste é de cima para baixo. | `classificar-imc` — lê peso e altura (com cast real), calcula o IMC e classifica em cascata; teste com um valor de cada faixa. |
| 11 | `desvio-dentro-de-desvio` — Desvio dentro de desvio | cons. — `node:If` em forma nova (aninhado; o `else` pertence ao `if` mais próximo) | `se-senao` | O `else` gruda no `if` mais interno quando faltam chaves — por aqui, as chaves sempre. | `entrada-do-show` — `if (idade >= 18) { if (ingresso) ... }` senão barra; teste com (20, sim), (20, não) e (16, sim). |
| 12 | `consolidacao-decisao` — O projeto do módulo | cons. — projeto (porta + faixa + menu) | `se` a `escolher-em-uma-linha` | (quiz) Entre cascata e `switch`, o que escolher quando os valores não são consecutivos? | `frete-da-loja` — lê peso e distância e decide a faixa de frete (condições compostas + cascata); 4 testes de faixa. |

**Por que `switch` vem com `break` na mão (e a prova).** O fallthrough é o defeito nº 1 de quem
copia `switch` de tutorial: a aula o NOMEIA (regra 9 — refutar a concepção errada ancorada na
fonte: [cppreference, `switch`](https://en.cppreference.com/w/c/language/switch)) e o desafio o
exige certo. `default` entra na mesma construção (derivada do par).

#### Módulo 3 — `repeticao` (13 aulas)

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `enquanto` — Repetir enquanto | `node:While` | `se`, `somar-no-lugar` | Se a condição nunca vira falsa, o laço nunca acaba — o contador precisa andar dentro do corpo. | `contar-ate-dez` — imprime 1..10 com `while`; teste compara a sequência. |
| 2 | `contar-para-tras` — Contar para trás | cons. — `node:While` em forma nova (decremento `--`) | `enquanto`, `um-de-cada-vez` | A contagem decrescente termina em 1: a condição é `>= 1`. | `contagem-final` — imprime 10..1 e `FOGO`; teste compara as 11 linhas. |
| 3 | `somar-tudo` — Somar tudo | cons. — `op:aug:+` em forma nova (o acumulador dentro do laço) | `enquanto`, `somar-no-lugar` | A soma precisa começar em 0 FORA do laço — se começar dentro, cada volta esquece a anterior. | `soma-ate-n` — lê N e soma 1..N; teste com N=5 (15) e N=1 (1). |
| 4 | `para` — O laço de três partes | `node:For` | `enquanto` | `for (início; condição; passo)` — o passo roda DEPOIS do corpo, na subida. | `tabuada` — lê N e imprime a tabuada 1..10; teste compara as 10 linhas. |
| 5 | `passo-de-dois` — Passo de dois | cons. — `node:For` em forma nova (passo `i += 2`; decrescente com `i--`) | `para`, `somar-no-lugar` | O passo pode ser qualquer atribuição — inclusive andar para trás. | `pares-e-regressivos` — imprime os pares 2..N e, numa segunda lista, os múltiplos de 5 de trás para frente; teste compara as duas listas. |
| 6 | `ler-ate-sentar` — Ler até sentar | cons. — `api:scanf` em forma nova (o retorno como condição: quantos campos leu; `EOF` só em prosa) | `para`, `perguntar-ao-usuario` | `scanf` devolve QUANTOS campos leu — é por isso que ele pode ser condição de laço. | `soma-ate-sentinela` — lê inteiros até o valor -1 e soma os anteriores; teste injeta `5 7 3 -1`, espera 15. |
| 7 | `repetir-ao-menos-uma-vez` — Repetir ao menos uma vez | `node:DoWhile` | `enquanto` | O do-while executa o corpo PRIMEIRO e testa depois — ao menos uma vez. | `menu-valido` — repete até a opção ser 1–3; teste injeta `9 0 2` e espera a resposta da opção 2. |
| 8 | `parar-no-meio` — Parar no meio | cons. — `node:Break` em forma nova (sair de um laço) | `para`, `escolher-por-valor` | O `break` sai do laço mais interno na hora — o que veio depois dele no corpo não roda. | `primeiro-divisor` — acha o menor divisor > 1 de N e para; teste com 15 (3) e 13 (13). |
| 9 | `pular-uma-volta` — Pular uma volta | `node:Continue` | `parar-no-meio` | O `continue` pula para o PRÓXIMO passo — diferente do `break`, que sai. | `impares-fora` — imprime 1..20 pulando múltiplos de 3 com `continue`; teste compara a lista. |
| 10 | `laco-dentro-de-laco` — Laço dentro de laço | cons. — `node:For` em forma nova (aninhado) | `para` | 3×4 são 12 iterações: para cada volta de fora, o de dentro roda inteiro. | `retangulo-de-hashtags` — lê L e C e desenha L linhas com C `#`; teste compara o desenho. |
| 11 | `o-triangulo` — O triângulo | cons. — `node:For` aninhado em forma nova (o interno depende do externo: `j <= i`) | `laco-dentro-de-laco` | A linha i tem i caracteres: a condição do laço de dentro usa o contador de fora. | `triangulo-de-hashtags` — desenha um triângulo de N linhas; teste compara o desenho. |
| 12 | `a-flag-da-busca` — A flag da busca | cons. — `type:bool` em forma nova (a flag que sobrevive ao laço) | `parar-no-meio`, `verdadeiro-e-falso-com-nome` | Se você precisa saber DEPOIS do laço se achou, a flag guarda o resultado — o `break` só sai. | `e-primo` — testa se N é primo com flag; teste com 13 (1) e 15 (0). |
| 13 | `consolidacao-repeticao` — O projeto do módulo | cons. — projeto (leitura de tamanho desconhecido + estatística) | `enquanto` a `a-flag-da-busca` | (quiz) Qual laço para entrada de tamanho desconhecido — e por quê? | `estatisticas-de-notas` — lê notas até -1, imprime média (cast real), máxima e quantos aprovados; 4 testes. |

#### Módulo 4 — `caixas-que-devolvem` (15 aulas)

O módulo da virada. Começa em `stdout` e termina em `retorno`. É o módulo com mais consolidações
da espinha (11 de 15) — o mesmo efeito medido em docs/17 (10 de 14 no Python): a decomposição
pedagógica de "função" é obrigatória e as chaves não multiplicam.

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `sua-primeira-caixa` — A sua primeira caixa | `node:FunctionDef` | `devolver-zero`, `buraco-na-frase` | Definir não roda: quem define `void saudacao(void) { ... }` precisa CHAMAR. | `saudacao-em-dois-mundos` — define e chama a função duas vezes; teste compara as duas linhas. |
| 2 | `chamar-a-caixa` — Chamar a caixa | cons. — `node:Call` em forma nova (chamar o que VOCÊ definiu) | `sua-primeira-caixa` | A chamada executa o corpo e volta para a linha de baixo. | `saudacao-tres-vezes` — chama a mesma função três vezes; teste compara as três linhas. |
| 3 | `a-janela-de-entrada` — A janela de entrada | `decl:param` | `chamar-a-caixa` | O parâmetro é uma CÓPIA: mudá-lo dentro da caixa não muda quem chamou. | `dobro-caixa` — `dobra(n)` imprime o dobro de cada valor chamado; teste com 2 e -3. |
| 4 | `devolver-em-vez-de-mostrar` — Devolver em vez de mostrar | cons. — `node:Return` em forma nova (um valor para quem chamou) | `a-janela-de-entrada` | O `return` ENCERRA a caixa no ato e entrega o valor na linha da chamada. | `maior-caixa` — `maior(a, b)` devolve o maior e o `main` imprime; teste espera 9 para (3, 9) e (9, 3). |
| 5 | `imprimir-nao-e-devolver` — Imprimir não é devolver | cons. — `node:Return` e `api:printf` no MESMO desafio (**a aula da virada**) | `devolver-em-vez-de-mostrar` | Chamar a caixa sozinha não imprime nada — imprimir e devolver são canais diferentes. | `a-virada` — três testes: devolve, imprime, e chamar sozinha não imprime (formato de docs/17 §"A VIRADA"). |
| 6 | `a-caixa-que-nao-devolve-nada` — A caixa que não devolve nada | cons. — `node:FunctionDef` em forma nova (`void` explícito; `return;` sozinho) | `imprimir-nao-e-devolver` | `void` devolve "nada"; o `return` sem valor só encerra cedo. | `cedo-demais` — função que imprime só para positivo, encerrando antes com `return;`; teste com 5 e -5. |
| 7 | `mais-de-uma-janela` — Mais de uma janela | cons. — `decl:param` em forma nova (dois parâmetros) | `a-janela-de-entrada` | A ordem dos argumentos é a ordem dos parâmetros. | `area-e-perimetro` — duas funções com os MESMOS dois parâmetros; teste compara os dois resultados. |
| 8 | `devolver-cedo` — Devolver cedo | cons. — `node:Return` em forma nova (um return por ramo) | `devolver-em-vez-de-mostrar`, `se-senao` | Depois do `return`, nada mais da caixa roda. | `divisao-segura` — `dividir(a, b)` devolve 0 se `b == 0` (a guarda); teste com (7, 2) → 3 e (7, 0) → 0. |
| 9 | `devolver-verdade-ou-falso` — Devolver verdade ou falso | cons. — `node:Return` em forma nova (devolver a própria comparação) | `devolver-cedo`, `verdadeiro-e-falso-com-nome` | `return idade >= 18;` já devolve o 0/1 da comparação. | `maioridade-caixa` — `ehMaior(idade)` devolve `bool` e o `main` usa em `if`; teste com 21 e 15. |
| 10 | `o-nome-so-vive-dentro` — O nome só vive dentro | cons. — `decl:var` em forma nova (nome local) + `term:escopo` | `devolver-em-vez-de-mostrar`, `um-nome-para-um-valor` | O nome da variável local nasce na chamada e morre no `return`. | `sombra-de-nome` — starter que usa um nome local fora da função (erro de compilação); o aluno conserta devolvendo o valor; teste compara o valor devolvido. |
| 11 | `uma-caixa-chama-outra` — Uma caixa chama outra | cons. — `node:Call` em forma nova (chamada dentro de caixa) | `devolver-em-vez-de-mostrar` | A caixa que chama recebe o valor devolvido na hora da expressão. | `enquadra` — `enquadra(x, min, max)` usa `maior`/`menor` internas; teste com (5, 0, 10) → 5 e (15, 0, 10) → 10. |
| 12 | `declarar-antes-de-usar` — O cartaz na porta | `node:Prototype` | `uma-caixa-chama-outra` | O compilador lê de cima para baixo: sem protótipo, chamar antes de definir não compila. | `ordem-invertida` — starter com a chamada antes da definição (não compila); o aluno acrescenta o protótipo; teste: compila e o valor devolvido bate. |
| 13 | `mais-contas` — As contas que vêm de fora | `hdr:math.h`, `api:sqrt` | `devolver-em-vez-de-mostrar`, `a-divisao-real` | `sqrt` recebe e devolve `double`; o `-lm` no comando liga a biblioteca matemática (o runner já traz). | `hipotenusa` — `hipotenusa(a, b)` com `sqrt`; teste com (3, 4) → 5.0. |
| 14 | `copias-no-vestibulo` — Cópias no vestíbulo | cons. — `decl:param` em forma nova (a cópia que não volta; `term:passagem por valor`) | `a-janela-de-entrada`, `mudar-o-valor` | A função tenta trocar e falha: os parâmetros são cópias — é assim que C funciona por padrão. | `a-troca-que-nao-troca` — chama `tentarTrocar(a, b)`; o teste prova que os originais NÃO mudaram (imprime o estado depois da chamada). |
| 15 | `consolidacao-caixas` — O projeto do módulo | cons. — projeto (menu + funções de conversão) | `sua-primeira-caixa` a `copias-no-vestibulo` | (quiz) Por que os protótipos ficam em cima do arquivo? | `conversor-de-unidades` — menu em `switch` + `do-while`, uma função por conversão (comprimento e massa); 4 testes de conversão. |

**Por que a `copias-no-vestibulo` falha DE PROPÓSITO.** É a aula mais importante do módulo e a
semente do M5: o aluno vê, com teste verde num desafio que "não funciona", que a cópia é o
comportamento — e não um erro dele. A refutação explícita (regra 9) fica ancorada no desafio, e o
payoff chega na aula `a-troca-que-funciona` (M5, aula 11), que reexercita o MESMO desafio com
ponteiro e o faz funcionar.

#### Módulo 5 — `listas-e-enderecos` (21 aulas)

Arrays e ponteiros básicos — o módulo que o C cobra e o Python esconde. A fase continua `retorno`
a partir do M4; a coluna `Ensina` segue a regra do par.

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `a-caixa-com-gavetas` — A caixa com gavetas | `decl:array` | `mais-de-uma-janela`, `um-nome-para-um-valor` | `int notas[5]` cria 5 gavetas numeradas 0..4 — a gaveta 5 não existe. | `notas-na-tela` — imprime as 5 notas do inicializador; teste compara as 5 linhas. |
| 2 | `pegar-pela-gaveta` — Pegar pela gaveta | `node:Subscript` | `a-caixa-com-gavetas` | `notas[i]` lê E escreve; fora do 0..4 é comportamento indefinido — e o compilador não avisa. | `dobra-as-notas` — dobra cada nota (escreve pelo índice) e imprime; teste compara as 5 linhas dobradas. |
| 3 | `varrer-a-lista` — Varrer a lista | cons. — `node:For` em forma nova (o for que percorre o array) | `pegar-pela-gaveta`, `para` | O laço anda de 0 até n-1: `i < 5`, nunca `<=`. | `soma-das-notas` — soma os elementos com `for`; teste compara a soma. |
| 4 | `o-maximo-da-lista` — O máximo da lista | cons. — `node:Subscript` em forma nova (o padrão do máximo) | `varrer-a-lista`, `devolver-em-vez-de-mostrar` | Comece o máximo com o PRIMEIRO elemento, não com zero. | `maior-nota` — acha a maior nota; teste com listas cujo máximo está no início e no fim. |
| 5 | `gavetas-vazias` — Gavetas vazias | cons. — `decl:array` em forma nova (inicializador parcial: o resto fica em 0) | `a-caixa-com-gavetas` | `int v[5] = {1, 2};` deixa as outras três gavetas em 0. | `zeros-garantidos` — imprime o array parcialmente inicializado; teste compara os 5 valores. |
| 6 | `contando-iguais` — Contando iguais | cons. — `node:Subscript` + `op:compare:==` na composição (contador de ocorrências) | `varrer-a-lista`, `se` | O contador cresce SÓ dentro do `if`. | `quantos-aprovados` — conta as notas `>= 6`; teste com listas de contagens conhecidas. |
| 7 | `quantos-bytes` — Quantos bytes o molde ocupa | `op:unary:sizeof` | `a-caixa-com-gavetas` | `sizeof(int)` é 4 nesta máquina (medido); `sizeof v / sizeof v[0]` devolve QUANTOS elementos. | `o-tamanho-real` — calcula `n = sizeof v / sizeof v[0]` e imprime `n` e o array; teste espera n=5 e os valores. |
| 8 | `enderecos` — O endereço das casas | `fmt:%p` (o degrau: o mesmo `&` da aula `perguntar-ao-usuario`, agora com nome de operador) | `quantos-bytes`, `perguntar-ao-usuario` | `&x` devolve o endereço de `x` — o mesmo `&` que a `scanf` sempre pediu; agora com nome. | `enderecos-na-tela` — imprime endereço e valor de duas variáveis; teste compara as duas linhas (cada uma com `%p` e o valor). |
| 9 | `o-papel-com-o-endereco` — O papel com o endereço | `decl:ptr` | `enderecos` | `int *p = &x;` — o `p` não guarda número: guarda ONDE o número está. | `aponta-para-mim` — declara `p` e imprime `p` e `&x`; teste: as duas impressões são o mesmo endereço. |
| 10 | `ir-ate-a-casa` — Ir até a casa | `op:unary:*` | `o-papel-com-o-endereco` | `*p` é o valor que está NO endereço: ler e escrever pela outra porta. | `via-ponteiro` — muda `x` só escrevendo em `*p`; teste compara o novo valor de `x`. |
| 11 | `a-troca-que-funciona` — A troca que funciona | cons. — `op:unary:*` em forma nova (mudar o original via parâmetro-ponteiro) | `ir-ate-a-casa`, `copias-no-vestibulo` | Passando `&a` e `&b`, a função troca DE VERDADE: a cópia é do endereço, não do valor. | `o-swap` — `trocar(int *a, int *b)` que funciona; teste compara os dois valores trocados (o payoff do M4). |
| 12 | `a-lista-como-parametro` — A lista como parâmetro | cons. — `decl:array` em forma nova (na função: `int v[]` — a lista não copia; o tamanho viaja junto) | `a-troca-que-funciona`, `varrer-a-lista` | O array vira o endereço do primeiro elemento; por isso o parâmetro `n` acompanha. | `soma-em-funcao` — `somaLista(v, n)` devolve a soma; teste com duas listas de tamanhos diferentes. |
| 13 | `devolver-dois-valores` — Devolver dois valores | cons. — `decl:param` em forma nova (dois parâmetros-ponteiro de saída) | `a-lista-como-parametro`, `a-troca-que-funciona` | Sem structs ainda, a forma de devolver DOIS valores em C é o par de ponteiros de saída. | `minimo-e-maximo` — `minimoEMaximo(v, 5, &min, &max)`; teste compara os dois valores. |
| 14 | `preencher-lendo` — Preencher lendo | cons. — `node:Subscript` + `op:unary:&` na composição (`&v[i]`) | `a-lista-como-parametro`, `perguntar-ao-usuario` | `scanf("%d", &v[i])` preenche a gaveta `i` pelo endereço dela. | `leitor-de-notas` — lê `n` (≤ 50) e `n` notas e imprime na ordem INVERSA; teste injeta 4 notas e compara as 4 linhas invertidas. |
| 15 | `inverter-a-lista` — Inverter a lista | cons. — composição (trocar os simétricos com o swap até n/2) | `preencher-lendo`, `a-troca-que-funciona` | Chega até n/2: trocar além disso desfaz a troca. | `o-inversor` — inverte o array lido no próprio lugar e imprime; teste compara a ordem invertida. |
| 16 | `procurar-na-lista` — Procurar na lista | cons. — `node:Return` em forma nova (devolver o índice ou -1) | `a-lista-como-parametro`, `se` | -1 é a convenção de "não achei": índices válidos começam em 0. | `o-procurador` — `procurar(v, n, x)` devolve a posição ou -1; teste com valor presente e ausente. |
| 17 | `ordenar-a-lista` — Ordenar a lista | cons. — composição (for aninhado + swap: o primeiro algoritmo completo) | `inverter-a-lista`, `laco-dentro-de-laco` | Cada passada empurra o maior para o fim; n-1 passadas bastam. | `o-ordenador` — ordena as notas lidas em ordem crescente; teste compara as n linhas ordenadas. |
| 18 | `a-promessa-de-nao-mudar` — A promessa de não mudar | `qualifier:const` | `a-lista-como-parametro` | `const int v[]` diz "esta função só lê" — tentar mudar vira ERRO de compilação. | `soma-com-promessa` — refaz `somaLista` com `const int v[]`; teste compara a soma (igual) e exige compilação limpa. |
| 19 | `o-ponteiro-que-nao-aponta` — O papel sem endereço | `api:NULL` | `o-papel-com-o-endereco` | `NULL` é o endereço "nenhum"; usá-lo como casa desaba o programa — por isso se testa antes. | `o-gate-do-nulo` — `maiorDe(v, n)` devolve ponteiro para o maior, ou `NULL` se `n == 0`; o `main` testa `!= NULL`; teste com n=0 e n>0. |
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
| 1 | `a-string-e-o-zero` — O texto que acaba em zero | `fmt:%s` | `a-caixa-com-gavetas`, `uma-letra-e-um-numero` | `"abc"` são 4 gavetas: `a`, `b`, `c` e o terminador `\0` que marca o fim. | `saudacao-nome` — imprime a saudação com o nome fixo do código, via `%s`; teste compara a linha. |
| 2 | `o-comprimento` — Quantas letras tem | `hdr:string.h`, `api:strlen` | `a-string-e-o-zero` | `strlen` devolve o tamanho SEM contar o `\0`: `strlen("abc")` é 3 (medido). | `medidor-de-palavras` — imprime o tamanho de 3 palavras fixas; teste compara os 3 números. |
| 3 | `ler-uma-palavra` — Ler uma palavra | cons. — `api:scanf` em forma nova (`%s`, sem `&`; o limite de largura `%49s`) | `a-string-e-o-zero`, `perguntar-ao-usuario` | O nome do array JÁ é endereço: sem `&` no `%s`. O 49 em `%49s` é o freio de mão. | `eco-de-nome` — lê uma palavra e imprime com `%s`; teste injeta `Ana` e espera a linha. |
| 4 | `percorrer-a-string` — Percorrer a string | cons. — `node:For` em forma nova (até `strlen` ou até `s[i] != '\0'`) | `o-comprimento`, `varrer-a-lista` | Perceber o fim é VER o `\0`: as duas condições ensinam a mesma coisa. | `contador-de-vogais` — conta as vogais (aeiou, sem acento) de uma palavra lida; teste com 2 palavras de contagens conhecidas. |
| 5 | `copiar-a-mao` — Copiar à mão | cons. — `node:Subscript` em forma nova (copiar até o `\0` INCLUSIVE) | `percorrer-a-string`, `pegar-pela-gaveta` | Se o `\0` não copia, a cópia é um texto sem fim. | `o-copiador` — copia a palavra para um buffer e imprime os dois; teste compara as duas linhas iguais. |
| 6 | `copiar-com-limite` — Copiar com freio de mão | `api:strncpy` | `copiar-a-mao` | `strncpy(dst, src, sizeof dst)` nunca passa do limite — e cabe a VOCÊ garantir o `\0` no fim. | `o-copiador-seguro` — refaz a cópia com `strncpy` + terminador explícito; teste compara as duas linhas. |
| 7 | `comparar-textos` — Comparar textos | `api:strcmp` | `o-comprimento` | `strcmp` devolve 0 quando IGUAL — `==` compara ENDEREÇOS, nunca textos. | `a-porta-secreta` — lê a palavra e compara com `abrir`; teste com `abrir` e `fechar`. |
| 8 | `montar-um-texto` — Montar um texto novo | `api:snprintf` | `buraco-na-frase`, `a-string-e-o-zero` | `snprintf(buffer, sizeof buffer, ...)` é o `printf` que escreve num buffer, com limite. | `a-etiqueta` — monta `Nome: Ana | Idade: 20` num buffer e imprime; teste compara a linha. |
| 9 | `gritar-a-mao` — Gritar à mão | cons. — `node:Subscript` em forma nova (mudar in-place; a aritmética de letras: `'A' + 1` é `'B'`, medido) | `percorrer-a-string`, `uma-letra-e-um-numero` | Maiúscula é minúscula menos a distância da tabela: letras SÃO números. | `o-gritador` — converte a palavra lida em maiúsculas no próprio lugar; teste injeta `ana`, espera `ANA`. |
| 10 | `a-biblioteca-de-letras` — A biblioteca das letras | `hdr:ctype.h`, `api:toupper` | `gritar-a-mao` | `toupper(c)` faz a mesma conta sem mágica — e funciona para qualquer letra. | `o-gritador-biblioteca` — refaz com `toupper`; teste idêntico ao da aula 9 (mesma saída, outro caminho). |
| 11 | `a-string-como-parametro` — A string como parâmetro | cons. — `decl:array` em forma nova (`char s[]` em função; a função ENXERGA o original) | `percorrer-a-string`, `a-lista-como-parametro` | A string em função é como a lista: o endereço do primeiro caractere — mudar muda o original. | `conta-espacos` — `contaEspacos(frase)` devolve a contagem; teste com 2 frases. |
| 12 | `a-lista-de-strings` — A lista de listas de letras | `decl:array2d` | `a-string-e-o-zero`, `a-caixa-com-gavetas` | `char nomes[5][20]`: 5 palavras de até 19 letras + terminador cada. | `lista-de-convidados` — lê 3 nomes e lista numerada; teste injeta 3 nomes e compara as 3 linhas. |
| 13 | `procurar-na-lista-de-strings` — Procurar na lista de strings | cons. — `api:strcmp` + `node:For` na composição | `a-lista-de-strings`, `comparar-textos` | Buscar é comparar com `strcmp` DENTRO do laço — nunca com `==`. | `lista-de-presenca` — checa se o nome lido está na lista; teste com nome presente e ausente. |
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
em `.h`/`.c` é a fronteira de saída do `c-iniciante`.

| # | slug — título | Ensina | Presume | Quiz (afirmação) | Desafio (slug + cenário) |
|---|---|---|---|---|---|
| 1 | `o-molde-e-o-dado` — O molde e o dado | `decl:struct`, `node:Member` | `um-nome-para-um-valor` | `struct Ponto` agrupa valores DIFERENTES numa ficha só; cada campo tem o seu tipo. | `cartao-de-ponto` — declara o struct e imprime os campos; teste compara a linha. |
| 2 | `mudar-o-dado` — Mudar o dado | cons. — `node:Member` em forma nova (atribuir campo; atribuir o struct INTEIRO copia tudo) | `o-molde-e-o-dado`, `mudar-o-valor` | `p2 = p1` copia campo a campo — a foto, não o molde. | `o-clonador` — copia um struct para outro e muda o original; teste prova que a cópia não mudou. |
| 3 | `o-apelido-do-molde` — O apelido do molde | `decl:typedef` | `o-molde-e-o-dado` | `typedef struct { ... } Ponto;` — `Ponto` passa a ser um tipo seu, sem a palavra `struct`. | `o-retangulo` — typedef de `Retangulo` com 4 campos e impressão; teste compara a linha. |
| 4 | `o-dado-na-caixa` — O dado na caixa | cons. — `decl:param` em forma nova (struct por valor entra e sai da função) | `o-apelido-do-molde`, `devolver-em-vez-de-mostrar` | A função recebe a CÓPIA: mudar o parâmetro não muda o original (o vestíbulo de novo). | `o-movedor` — `mover(p, dx, dy)` devolve o ponto novo; teste compara `x` e `y` devolvidos. |
| 5 | `mudar-o-original` — Mudar o original | `node:Arrow` (`s->m`: o campo via ponteiro; o degrau é o `*` do M5 aplicado à ficha) | `o-dado-na-caixa`, `ir-ate-a-casa` | `p->x` é `(*p).x`: o ponteiro enxerga o original e muda de verdade. | `o-movedor-de-verdade` — `moverVia(Ponto *p, dx, dy)` muda o original; teste compara os campos do original. |
| 6 | `a-lista-de-fichas` — A lista de fichas | cons. — `decl:array` em forma nova (array de structs) | `o-apelido-do-molde`, `varrer-a-lista` | `pontos[i].x`: primeiro a gaveta, depois o campo. | `o-ponto-mais-longe` — imprime todos e acha o mais distante da origem (`sqrt`); teste compara o índice. |
| 7 | `ficha-dentro-de-ficha` — Ficha dentro de ficha | cons. — `node:Member` em forma nova (struct aninhada: `pessoa.casa.x`) | `o-apelido-do-molde` | O campo pode ser outro struct: um ponto por nível de ponto. | `a-ficha-da-pessoa` — `Pessoa { nome, casa: Ponto }`; imprime nome e casa; teste compara a linha. |
| 8 | `a-ficha-completa` — A ficha completa | cons. — composição (struct com `char nome[40]` lida com `scanf`) | `o-apelido-do-molde`, `ler-uma-palavra` | `scanf("%s", p.nome)`: o campo já é endereço — sem `&`. | `o-cadastro` — lê 2 pessoas (nome, idade, altura) e imprime a mais alta; teste injeta os dados e compara a linha. |
| 9 | `o-caderno` — O caderno do disco | `api:fopen`, `api:fclose` | `o-ponteiro-que-nao-aponta` | `fopen` devolve um ponteiro — ou `NULL` quando o caderno não abre; cada `fopen` pede um `fclose`. | `o-abridor` — abre `diario.txt` em `"w"`, testa `!= NULL` e fecha; teste verifica que o arquivo existe no disco depois de rodar. |
| 10 | `escrever-no-caderno` — Escrever no caderno | `api:fprintf` | `o-caderno`, `buraco-na-frase` | `fprintf` é o `printf` que escolhe o caderno: mesmo `%d`, mesmo `%s`. | `o-diario` — escreve 3 linhas de log com `fprintf`; teste lê o arquivo e compara as 3 linhas. |
| 11 | `ler-o-caderno` — Ler linha por linha | `api:fgets` | `o-caderno`, `percorrer-a-string` | `fgets(buffer, tamanho, f)` lê UMA linha por vez — e traz o `\n` junto. | `o-leitor-do-diario` — lê e imprime numerado; teste compara as linhas numeradas. |
| 12 | `acrescentar-no-fim` — Acrescentar no fim | cons. — `api:fopen` em forma nova (modo `"a"`) | `escrever-no-caderno` | `"w"` apaga tudo; `"a"` escreve no fim — a diferença é uma letra. | `o-diario-crescente` — roda a escrita duas vezes; teste compara as 6 linhas acumuladas. |
| 13 | `ler-numeros-do-caderno` — Ler números do caderno | `api:fscanf` | `o-caderno`, `perguntar-ao-usuario` | `fscanf` devolve QUANTOS campos leu: o laço termina quando não lê mais (`!= 2`). | `a-soma-do-arquivo` — lê números de um arquivo até o fim e soma; teste com arquivo de 5 números, compara a soma. |
| 14 | `o-caderno-de-fichas` — O caderno de fichas | cons. — composição (`fprintf`/`fscanf` campo a campo: uma linha, um registro) | `a-ficha-completa`, `ler-numeros-do-caderno` | Um campo por vez, na MESMA ordem para escrever e ler. | `a-agenda` — salva 2 pessoas em arquivo e re-lê imprimindo; teste compara as 2 fichas re-lidas. |
| 15 | `a-biblioteca-em-dois-arquivos` — A biblioteca em dois arquivos | `hdr:local.h` (o include do SEU header) + `term:header` | `declarar-antes-de-usar`, `o-apelido-do-molde` | O `.h` guarda os cartazes (protótipos e tipos); o `.c` guarda as caixas; o `main` inclui o `.h`. | `a-biblioteca-geometria` — `ponto.h`/`ponto.c`/`main.c`; o teste compila os três e compara os valores devolvidos. |
| 16 | `compilar-sozinho` — Compilar com as próprias mãos | cons. — leitura do compilador (`term:warning`, `term:flag`) | `a-biblioteca-em-dois-arquivos` | `-Wall -Wextra` acende os avisos que viram aliados; o gate desta trilha exige 0 warnings. | `zero-avisos` — o starter tem 3 avisos conhecidos (`unused variable`, `missing initializer`, `return` sem valor); o aluno conserta até o runner sair limpo; teste: exit 0 + saída correta. |
| 17 | `consolidacao-structs-arquivos` — O projeto final do curso | cons. — projeto final (cadastro persistido, biblioteca própria) | `o-molde-e-o-dado` a `compilar-sozinho` | (quiz) O que vai no `.h` — e o que NUNCA vai? | `o-inventario-final` — cadastro de itens em arquivo com biblioteca própria `.h`/`.c` (adicionar, listar, total e mais caro); 5 testes end-to-end. |

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

- `language: 'c'`; `programmingLanguage: 'c'`; `runtime: 'gcc-c11'`; `harnessLanguage: 'c'` no
  `track.json`; slug da trilha: `c-iniciante` (§1). O token de runtime é o do pin de §4 — a onda 2
  o valida contra o adaptador (`registry.ts`).
- layout obrigatório: `solucao.c` na raiz; `tests/test_solucao.c` com os **protótipos congelados**
  das funções do aluno no topo (até o M7, ver §"A tensão imprimir × devolver"); `runner.sh` — o
  `TEST_CMD` canônico de C do repo ([`03-tdd`](build-spec/blocks/03-tdd.md) §3.9.2):
  `gcc -std=c11 -g -O0 -Wall -o .build/test_bin stub.c tests/test_stub.c -lm && .build/test_bin`;
  o runner lê `TESTS_RUN=`/`TESTS_FAILED=` do stdout e normaliza o exit (D-V11); `solucao.h` entra
  como arquivo do aluno só a partir da aula `a-biblioteca-em-dois-arquivos` (M7). **NOTA
  (reconciliação da onda 3 — template de prova):** o runner do adaptador da engine compila só com
  `-std=c11 -g`; a divergência de flags frente ao `TEST_CMD` canônico (`-O0 -Wall`) fica
  registrada aqui para a onda 3 reconciliar no template de prova — este documento não decide no
  lugar dela.
- **fase SAÍDA** (M1–M3): `outputChannel: 'impressao'` — o runner captura o `stdout` do programa e
  o teste compara;
- **a virada** (M4 `imprimir-nao-e-devolver`): `outputChannel: 'ambos'`, três testes — devolve,
  imprime, e chamar sozinha não imprime (mecânica da onda 2, §"A tensão");
- **fase VALOR** (M4 em diante): `outputChannel: 'retorno'` — o teste chama por protótipo e
  assevera com o helper `checa_<tipo>` do `counter_protocol`;
- o teste **falha** com o starter e **passa** com a solução; `expectedTestCount` = nº de testes,
  conferido por IGUALDADE contra o `TESTS_RUN=` impresso pelo próprio teste, nunca `> 0` (DES-4,
  [`00-contratos.md`](00-contratos.md) §5.3); 2–4 testes por desafio de aula; todo cenário carrega
  o rótulo pt-BR no primeiro argumento (`cenario`) do helper `checa_<tipo>` — é o que o veredito
  mostra (§"A tensão");
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
| Flags de qualidade | **`-Wall -Wextra -Wpedantic`** (desafios e gate) · **`-g`** (runner) · **`-lm`** (quando `math.h`) | o warning é o aliado didático do C (§6, item 8); o gate desta trilha exige **0 warnings** — é o equivalente C do "limiar 100% em código" (P-DURA). `-lm` já vem no runner, e a aula `mais-contas` explica o porquê |
| Runner | compilar `solucao.c` + `tests/test_solucao.c` → `.build/test_bin` (`TEST_CMD` canônico de C, [`03-tdd`](build-spec/blocks/03-tdd.md) §3.9.2); o teste imprime `TESTS_RUN=`/`TESTS_FAILED=` em stdout e sai `falhas == 0 ? 0 : 1` (`counter_protocol`, §3.9.3); o runner normaliza para **0** passou · **1** falhou · **2** contagem errada · **3** timeout (D-V11), ecoando `EXIT_BRUTO`/`DECORRIDO_MS`; 66 = infra; outro código pós-normalização = defeito do runner (fail-closed) | é a linha C da matriz de execução do repo, re-medida nesta execução; guard de contagem: `^TESTS_RUN=([0-9]+)` impresso pelo próprio teste (`03-tdd` §3.9.2) — o guard `assert\s*\(` de `languages.md` §"O guard de cada linguagem" não se aplica ao teste gerado: o `counter_protocol` proíbe `assert.h` |
| Adaptador da engine | **`app/electron/main/engine/lang/`** — nova linha do registro (`LanguageId: 'c'`, ao lado de `javascript`, `python`, `typescript`) | o adaptador C é construído **nesta mesma onda 1**, em worktree irmã; `registry.ts` já define a tabela de 15 responsabilidades e o fail-closed de `getAdapter`. Este documento NÃO lê nem antecipa o trabalho do irmão: o vocabulário daqui é preliminar e a onda 2 congela contra o `inventory()` real |
| Runtime token | `runtime: 'gcc-c11'` · `harnessLanguage: 'c'` · `language: 'c'` | análogo direto do `runtime: 'cpython-3.14'` / `harnessLanguage: 'python'` de docs/17 |

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
| **man7.org — man-pages** | https://man7.org/linux/man-pages — páginas: `…/man3/printf.3.html` · `…/man3/scanf.3.html` · `…/man3/strlen.3.html` · `…/man3/strcmp.3.html` · `…/man3/strncpy.3.html` · `…/man3/snprintf.3.html` · `…/man3/fopen.3.html` · `…/man3/fgets.3.html` · `…/man3/toupper.3.html` · `…/man3/sqrt.3.html` · `…/man3/assert.3.html` | a referência da libc como o Linux a define — 2ª fonte de toda aula de `api:` | printf/scanf/strlen confirmadas ao vivo; as demais seguem o MESMO esquema `man3/<nome>.3.html` (esquema confirmado) — a onda 2 re-verifica cada uma com HTTP 200 |
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
   pinada com warnings ligados e o gate exige 0; a aula `compilar-sozinho` transforma três avisos
   reais em exercício. É a "rede de proteção" que o C dá de graça — e o motivo de o curso terminar
   com compilação própria. Fonte: GCC `Warning-Options`, Clang `DiagnosticsReference`.

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

## 8. Apêndice — vocabulário de átomos preliminar assumido

**PRELIMINAR — a congelar na onda 2** contra o `inventory()` real do adaptador C
(`app/electron/main/engine/lang/`). As chaves da espinha de §3 estão aqui na íntegra, por eixo.
Nenhuma delas é origem normativa antes do congelamento; chaves que o adaptador não emitir
derrubam a aula correspondente na verificação VOCAB (fail-closed) — e a correção é re-mapear a
chave na tabela, não relaxar o gate.

**Eixos existentes do repo, reutilizados:** `node:`, `decl:`, `op:binary:`, `op:compare:`,
`op:bool:`, `op:unary:`, `op:aug:`, `api:`, `term:`. **Eixos novos que o C exige (proposta deste
documento):** `fmt:` (o especificador de printf como evento de currículo), `hdr:` (o `#include`),
`type:` (o tipo primitivo com nome), `cast:`, `qualifier:`.

| Eixo | Chaves usadas na espinha (a congelar) | Status |
|---|---|---|
| axioma produtivo | `node:Call` · `node:StrLiteral` | assumido (mesma dupla do Python; a onda 2 confirma os nomes que o adaptador emite) |
| `node:` | `node:TranslationUnit` · `node:Return` · `node:Name` · `node:IntLiteral` · `node:Paren` · `node:If` · `node:IfElse` · `node:Switch` (derivadas: `node:Case`, `node:Default`) · `node:Ternary` · `node:While` · `node:DoWhile` · `node:For` · `node:Break` · `node:Continue` · `node:FunctionDef` (derivada: `decl:param` só na aula de parâmetro) · `node:Prototype` · `node:Subscript` · `node:Member` · `node:Arrow` | assumido — nomes mais prováveis; `node:IfElse`/`node:Ternary`/`node:Paren` são sintéticas no modelo do adaptador Python |
| `decl:` | `decl:main` · `decl:var` · `decl:param` · `decl:array` · `decl:array2d` · `decl:ptr` · `decl:struct` · `decl:typedef` | assumido |
| `op:` | `op:assign` · `op:binary:+` · `op:binary:-` · `op:binary:*` · `op:binary:/` · `op:binary:%` · `op:compare:==` · `op:compare:>=` (família `== != < <= > >=`) · `op:bool:&&` · `op:bool:\|\|` · `op:unary:!` · `op:unary:&` · `op:unary:*` · `op:unary:++` · `op:unary:--` · `op:unary:sizeof` · `op:aug:+` · `op:aug:-` (família `+= -= *= /=`) | assumido — `op:assign` é extensão proposta; `++/--/sizeof` entram na família unary |
| `fmt:` | `fmt:%d` · `fmt:%f` · `fmt:%c` · `fmt:%s` · `fmt:%p` | eixo novo proposto |
| `hdr:` | `hdr:stdio.h` · `hdr:limits.h` · `hdr:stdbool.h` · `hdr:math.h` · `hdr:string.h` · `hdr:ctype.h` · `hdr:stdlib.h` (receptivo) · `hdr:local.h` (o include do header do próprio aluno; a onda 2 decide se o eixo distingue por nome ou emite uma chave única) | eixo novo proposto |
| `type:` | `type:int` (derivada de `decl:var`) · `type:double` · `type:char` · `type:bool` | eixo novo proposto |
| `cast:` / `qualifier:` | `cast:explicit` · `qualifier:const` | eixos de uma chave cada |
| `api:` | `api:printf` · `api:scanf` · `api:sqrt` · `api:strlen` · `api:strncpy` · `api:strcmp` · `api:snprintf` · `api:toupper` · `api:fopen` · `api:fclose` · `api:fprintf` · `api:fgets` · `api:fscanf` · `api:NULL` · `api:INT_MAX` · `api:INT_MIN` · (receptivo: `api:getenv`) | eixo aberto por formato (docs/17) |
| `term:` | `term:comentário` · `term:blocos-de-chaves` · `term:escopo` · `term:passagem por valor` · `term:header` · `term:warning` · `term:flag` | não-vocabulário (prosa), sem eixo fechado |

**O que o apêndice NÃO lista.** As chaves receptivas do harness C além da semente de §"Público e
axioma de entrada" (a lista da onda 2 sai da leitura real dos `test_solucao.c` autorados, como
fez docs/17 com as oito chaves do `runpy`) e as chaves derivadas de nó container
(`node:BinaryOp`-equivalentes do adaptador C), que seguem o mapa da regra do par.

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
  Ensina/Presume/quiz/desafio, verificação manual pós-edição).
