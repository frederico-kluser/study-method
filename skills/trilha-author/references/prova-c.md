# Prova C — o template de teste congelado da trilha `c-iniciante`

Este arquivo é o **contrato executável** que os agentes de conteúdo da onda de autoria copiam
para cada desafio de C. Ele não é sugestão: é o que o adaptador da engine executa de verdade
(`app/electron/main/engine/lang/c.ts`) e o que as provas de execução exigem. As duas aulas vivas
que implementam o template **na íntegra** são `app/resources/tracks/c-iniciante/modules/a-tela/
lessons/primeira-tela/challenges/tres-linhas/challenge.json` (fase SAÍDA) e
`.../o-esqueleto/challenges/sua-primeira-janela/challenge.json` — copie de lá antes de escrever
qualquer linha. (Os desafios da trilha fecham o cenário de captura com `fflush(stdout)` — a regra
do §3 — e o `fclose` fica restrito ao handle de leitura.)

Fontes normativas (leia junto):

- **`docs/20-trilha-c.md`** — §"A tensão imprimir × devolver" (modelo cenário-do-harness, fases
  SAÍDA/VALOR/`ambos`, exit codes D-V11) e §"Regras para os desafios de aula (`challenge.json`)"
  (o contrato célula a célula);
- **`docs/build-spec/blocks/03-tdd.md`** — §3.9.3 (o **counter_protocol**: dois contadores static,
  helpers `checa_*` que NUNCA abortam, `TESTS_RUN`/`TESTS_FAILED`, filtro `--only`) e §3.9.2
  (o `TEST_CMD` canônico da skill);
- **`skills/trilha-author/references/autoria-aula.md`** — o schema de `lesson.json`/`challenge.json`
  e a regra do par;
- **`skills/trilha-author/references/validacao.md`** — os gates e as quatro provas.

---

## 1. O layout que o adaptador gera (você NUNCA escreve um runner)

Ao rodar um desafio de C, o `layout()` do adaptador (`cLayout`) escreve, num diretório temporário,
nesta ordem:

| Arquivo | Quem escreve | Papel |
|---|---|---|
| `tests/sm_harness.h` | GERADO (`SM_HARNESS_HEADER`) | a macro `SM_TEST`, os helpers `checa_int/checa_long/checa_double/checa_char/checa_str` (STATIC), os contadores, o **veneno do `assert`** (`#define assert(...) _Static_assert(0, …)` — usar `assert` vira erro de compilação) |
| `tests/sm_main.c` | GERADO (`SM_MAIN_SOURCE`) | o **`main` do harness**: registra e roda os cenários e escreve, NO FIM, o relatório com nonce |
| `solucao.c` | **o aluno** (`starterCode`/`solutionCode`) | a função do aluno — **NUNCA com `main`** |
| `tests/test_solucao.c` | **o autor** (`testsCode`), antecedido de `#include "sm_harness.h"` | os cenários `SM_TEST` |
| `sm_fontes.txt` | GERADO | a lista dos `.c` do aluno que o runner compila |
| `run.sh` | GERADO (`SM_RUNNER_SCRIPT`) | o runner: escolhe `cc`→`gcc`→`clang`, gera o nonce, compila, roda com captura, lê o relatório |

O `run.sh` compila **por TU** com `cc -std=c11 -g` (só `.c` entra na lista — `.h` fica em disco para
`#include`) e liga com **`-lm`**. Ele **normaliza o exit** (D-V11): **0** passou · **1** falhou ·
**2** contagem errada (dupla-igualdade da engine) · **3** timeout (kill da engine), ecoando
`EXIT_BRUTO=<bruto>` e `DECORRIDO_MS=<ms>` no stdout. O bruto (134=SIGABRT de `assert`, 5=zero
testes, 137=morto, 139=SIGSEGV) não se perde: segue no `EXIT_BRUTO`. **66** é erro de infra.

Nota de reconciliação registrada no docs/20: o runner do adaptador compila com `-std=c11 -g`;
o `TEST_CMD` canônico da skill (`03-tdd` §3.9.2) carrega `-O0 -Wall`. A divergência está
DOCUMENTADA (não resolvida aqui) — o desafio de trilha é provado pela superfície (2), o runner
gerado.

## 2. O `testsCode` — a forma congelada

```c
#include <stdio.h>          /* 1. SEMPRE que o teste usar FILE/fgets/freopen/fopen */

/* 2. protótipos das funções do aluno, no topo — o teste declara o que exercita */
void tela(void);

/* 3. UM cenário = UM bloco SM_TEST; 1–4 cenários por desafio de aula.
      O slug do cenário é um IDENTIFICADOR C (sem hífen) e é o que o relatório
      imprime (SM<nonce> T <slug> ok) e o que o campo `requirements[].teste`
      cita. O rótulo pt-BR do veredito é o PRIMEIRO argumento de cada checa_*. */
SM_TEST(tres_linhas_na_ordem) {
    /* 4. captura do stdout DENTRO do teste (fase SAÍDA — ver §3) */
    freopen("sm_saida.tmp", "w", stdout);
    tela();
    fflush(stdout);   /* descarga SEM fechar — A REGRA do §3 (nunca fclose no stdout) */

    /* 5. leitura de volta + checa_* por asserção, com rótulo pt-BR */
    FILE *f = fopen("sm_saida.tmp", "r");
    char linha[80] = "(nada impresso)";   /* sentinel: fgets que não lê NÃO é UB */
    fgets(linha, 80, f);
    checa_str("a primeira linha", linha, "ola, tela!\n",
              "a primeira coisa impressa e a primeira frase");
    fclose(f);
}
```

Regras duras (cada uma tem motivo medido):

1. **Sem `main` em lugar nenhum do `testsCode`** — o `main` é do harness (`tests/sm_main.c`).
2. **Sem `#include <assert.h>`** e sem `assert` — o header do harness já inclui e VENENA a macro
   (o counter_protocol não aborta: `assert` quebra no primeiro erro com exit 134 e esconde os
   cenários seguintes — `03-tdd` §3.7.1).
3. **Sem `#include <stdio.h>` o teste NÃO parseia na contagem declarada.** O `countDeclared` do
   adaptador parseia `SM_COUNT_PREABULO + testsCode` **sem o header do harness**: `FILE *f` sem
   `<stdio.h>` é erro duro ("unknown type name 'FILE'") e a contagem declarada vira **0** —
   a dupla-igualdade reprova. Os únicos includes que um teste de trilha usa: `<stdio.h>`
   (e, quando o desafio pedir, `<stdlib.h>`/`<string.h>`) — **nunca** headers do desafio.
4. **Asserção é `checa_*`** — `checa_int`, `checa_long`, `checa_double`, `checa_char`, `checa_str`
   (strings por `strcmp` interno). Eles são STATIC do header: um símbolo global do aluno não
   conflita nem intercepta. Em divergência imprimem `FALHOU [<cenario>]: obtido …, esperado ….
   <porque>` em **stderr** e SEGUEM para o próximo cenário — um cenário vermelho não esconde os
   demais.
5. **`expectedTestCount` = nº de blocos `SM_TEST`** (não de `checa_*`): o `TESTS_RUN` do relatório
   conta CENÁRIOS. A dupla-igualdade (declarada == executada == esperada) é o gate.
6. **Todo cenário carrega rótulo pt-BR no 1º argumento** — é o que o veredito mostra ao aluno
   (o papel da docstring do Python).
7. **O buffer de leitura nasce com sentinel** (`char linha[80] = "(nada impresso)";`): se a saída
   estiver vazia, `fgets` devolve NULL e o buffer fica com o sentinel — a checagem falha de forma
   determinística, **sem UB** (ler buffer não inicializado é comportamento indefinido, proibição
   permanente da trilha).
8. **Acentos**: os textos IMPRESSOS pelo código (do aluno e do teste) são ASCII (sem acento); a
   prosa em pt-BR com acentos fica no `statement`, na teoria e nos comentários (UTF-8 é aceito pelo
   clang). Mesma regra de acentos do docs/20 §M6.
9. **Proibições sempre** (docs/20 §"Regras"): UB proposital (índice fora do array, `NULL`
   desreferenciado, variável não inicializada lida, `gets`), `goto`, macro com parâmetros, cast
   arbitrário de ponteiro, `system`/`dlsym` (proibição global do adaptador). Em prosa com crase,
   nunca em bloco cercado.
10. **O nome da função exercitada**: nas aulas 1–3 do M1 é a função congelada `tela` (o contrato
    com o harness — docs/20 §"A aula 1 é só printf"); das funções que o ALUNO nomeia em diante, o
    nome vem do slug do desafio em camelCase de C (`dobro-do-numero` → `dobroDoNumero`; nesta
    trilha identificadores de função são camelCase e tipos em PascalCase — docs/20 §"Regras").
 11. **A saída TERMINA onde a aula diz que termina** — e o teste PROVA o fim: depois da última
    linha esperada, um buffer NOVO com sentinel + um `fgets` a mais + `checa_str` contra o próprio
    sentinel (`"nao ha linha a mais"`). O aluno que imprime uma linha extra reprova; na EOF o
    `fgets` devolve NULL e o buffer fica com o sentinel — a checagem passa, sem `if`, sem UB
    (exemplo no cenário 2 do §3).
 12. **`checa_double` compara `==` EXATO** (sem epsilon — medido em `lang/c.ts`,
    `if (!(obtido == esperado))`): só assevere `double` de representação binária exata (inteiros,
    `.5`, `.25` — p. ex. `(double)7 / 2` é exatamente 3.5 e `sqrt(25)` é exatamente 5.0) ou
    compare via TEXTO (o `%f` no canal SAÍDA). Nunca o resultado acumulado de contas reais nem um
    irracional (`sqrt(2)`) — o `==` exato reprova por 1 ulp, e o cenário ficaria verde numa máquina
    e vermelho na outra.

## 3. A captura do stdout — o padrão congelado da fase SAÍDA (M1–M3) e da virada

O `solucao.c` **NUNCA tem `main`** (um `main` do aluno não linka — `duplicate symbol '_main'`; e o
`stdout` do programa só chega à engine num run que FALHA, o que tornaria a captura-do-runner
inimplementável para um teste que passa). O desafio de SAÍDA verifica a impressão chamando a
**função** do aluno e capturando o `stdout` **NO PRÓPRIO TESTE**:

```c
freopen("sm_saida.tmp", "w", stdout);   /* o stdout vira um arquivo (stdlib puro) */
tela();                                  /* o teste chama a FUNÇÃO do aluno */
fflush(stdout);                          /* descarga SEM fechar — A REGRA abaixo */

FILE *f = fopen("sm_saida.tmp", "r");    /* lê de volta e checa */
```

**A REGRA (uma só): `fflush(stdout)`, nunca `fclose(stdout)`.** Depois de `fclose(stdout)` o
stream está fechado e o valor de `stdout` fica indeterminado (C11 §7.21.4) — um SEGUNDO
`freopen(…, stdout)` no MESMO desafio é comportamento indefinido, e é exatamente o que acontece
num `ambos` com ≥2 cenários de captura (a virada do M4 tem dois). Com `fflush` o stdio fica aberto
no estado legal: o próximo `freopen` fecha e reabre por definição (C11 §7.21.6.2) e o dado já está
no arquivo antes da leitura de volta. `fclose` fica para o handle de LEITURA (`fclose(f)`).
Medido nesta onda: o exemplo `ambos` abaixo roda VERDE com os dois `freopen` (3 cenários, exit 0)
e reprova linha extra impressa pelo aluno.

Desafio `ambos` de exemplo — 2 cenários de captura, completo e verde (a forma da virada do M4):

```c
#include <stdio.h>

/* protótipos congelados das funções do aluno (M4 — protótipo solto, sem header) */
int dobro(int n);
void aviso(void);

/* cenário 1 — DEVOLVE: o retorno, sem captura (fase VALOR) */
SM_TEST(o_dobro_de_2_e_4) {
    checa_int("o dobro de 2 e 4", dobro(2), 4, "o dobro de n e n x 2");
}

/* cenário 2 — IMPRIME: captura 1, com a prova do FIM da saída (regra 11) */
SM_TEST(o_aviso_imprime_duas_linhas) {
    freopen("sm_saida_1.tmp", "w", stdout);
    aviso();
    fflush(stdout);

    FILE *f = fopen("sm_saida_1.tmp", "r");
    char linha[80] = "(nada impresso)";
    fgets(linha, 80, f);
    checa_str("a linha de cima", linha, "=====\n",
              "o aviso comeca pela borda");
    fgets(linha, 80, f);
    checa_str("a linha de baixo", linha, "o dobro vem da funcao\n",
              "a mensagem do aviso vem na segunda linha");
    char fim[80] = "(nada impresso)";
    fgets(fim, 80, f);
    checa_str("nao ha linha a mais", fim, "(nada impresso)",
              "a saida acaba na segunda linha: nenhuma linha extra e aceita");
    fclose(f);
}

/* cenário 3 — CHAMAR SOZINHA NÃO IMPRIME: captura 2 NO MESMO desafio — a prova
   de que fflush deixa o stdout no estado legal para o 2º freopen */
SM_TEST(chamar_sozinha_nao_imprime) {
    freopen("sm_saida_2.tmp", "w", stdout);
    dobro(2);            /* chama e descarta o valor: nenhum printf roda */
    fflush(stdout);

    FILE *f = fopen("sm_saida_2.tmp", "r");
    char linha[80] = "(nada impresso)";
    fgets(linha, 80, f);
    checa_str("chamar sozinha nao imprime", linha, "(nada impresso)",
              "a chamada devolve um valor; imprimir e outro canal");
    fclose(f);
}
```

Com a solução do aluno `int dobro(int n) { return n * 2; }` e
`void aviso(void) { printf("=====\n"); printf("o dobro vem da funcao\n"); }`, os três cenários
rodam verdes (`SM… TESTS_RUN=3`, `TESTS_FAILED=0`, exit 0); com UMA linha a mais no `aviso`, o
cenário 2 reprova com `FALHOU [nao ha linha a mais]`. Os nomes de captura são POR CENÁRIO
(`sm_saida_1.tmp`, `sm_saida_2.tmp`) — um cenário nunca lê a captura de outro.

- O padrão é `freopen` → chama a função → `fflush(stdout)` → `fopen` de leitura → `fgets` linha a
  linha → `checa_str` por linha → `fclose(f)`. **Documento no docs/20 e medido nesta onda** com as
  provas de execução rodando — e os desafios vivos da trilha (M1 a1/a2) o seguem: fecham o cenário
  de captura com `fflush(stdout)`, e o `fclose` fica restrito ao handle de leitura.
- `sm_saida*.tmp` é criado no diretório de execução (temp), com modo `"w"` que TRUNCA — a prova do
  starter nunca herda a saída da solução.
- O relatório de contagem não passa pelo stdout do processo de teste: vai no ARQUIVO com nonce,
  escrito no fim pelo `main` do harness — o aluno pode imprimir o que quiser, a contagem confiável
  é linha com `SM<nonce>`.
- **Fase `retorno` (M4+)**: o teste declara o **protótipo** da função no topo e assevera com
  `checa_int("o dobro de 2 e 4", dobro(2), 4, "o dobro de n é n × 2");` — sem captura.
  **Regra de harness declarada:** antes da aula `a-biblioteca-em-dois-arquivos` (M7) o teste NÃO
  usa `#include "solucao.h"` — o protótipo solto no topo é a forma autorizada (docs/20 §"A tensão
  imprimir × devolver"). `double` via `checa_double` só em representação exata (regra 12).
- **A virada (`ambos`, M4 `imprimir-nao-e-devolver`)**: os três fatos no mesmo desafio — devolve
  (`checa_int`), imprime (captura 1, com a prova do fim) e chamar sozinha não imprime (captura 2,
  `checa_str` contra o sentinel) — o exemplo completo está acima, e a segunda captura é legal POR
  CAUSA da regra do fflush.

## 4. Multi-arquivo (M7 em diante)

`files[]` com paths seguros (`^[a-zA-Z0-9_\-/]+\.(c|h)$`). **Só `.c` entra na lista de TUs** —
um `.h` compilado isolado produz precompiled header e o link reprova; o header chega ao compilador
por `#include`. O `testsCode` de um desafio multi-arquivo continua **sem headers do desafio**: usa
**protótipos no topo** (o `countDeclared` não vê os headers do desafio). A forma legítima de
`#include "solucao.h"` só passa a existir quando o header próprio nasce como conteúdo (M7,
`a-biblioteca-em-dois-arquivos`).

## 5. As quatro provas de execução (por desafio)

```bash
cd app && npm run track -- track:challenge:verify c-iniciante <modulo> <aula> <desafio>
```

| # | Prova | Como o template a satisfaz |
|---|---|---|
| 1 | a solução de referência **passa** | `solutionCode` correto; `TESTS_RUN == expectedTestCount == TESTS_FAILED 0`, exit 0 |
| 2 | o starter **falha** | aula 1: corpo vazio → sentinel nos checas → exit 1; aula 2+: função ausente → **link reprova com símbolo indefinido** (`_tela`) |
| 3 | a contagem **bate** (igualdade dupla) | `countDeclared` (por AST, com o preâmbulo) == `expectedTestCount` == `TESTS_RUN` do relatório com nonce |
| 4 | um **stub vazio falha** | neste template o starter É o stub (corpo vazio / função ausente) — a prova 2 já o cobre |

Armadilha que o template elimina por construção: teste tautológico não existe — a prova 4 reprova
qualquer `SM_TEST` que passe sem o código do aluno, porque o cenário comparam a SAÍDA da função do
aluno (nada impresso = sentinel = FALHOU).

## 6. Os gates e o que hoje NÃO fecha (gap da onda 3C)

Rode os quatro gates (de `app/`, sem rede, sem chave):

```bash
cd app && npm run track -- track:validate c-iniciante          # provas de TODOS os desafios
cd app && npm run track -- track:challenge:verify c-iniciante <mod> <aula> <desafio>
cd app && npm run engine -- audit c-iniciante --limite 0       # orçamento (0 = só placar)
cd app && npm run engine -- requirements c-iniciante           # bijeção requirements × SM_TEST
cd app && npm run engine -- coverage c-iniciante               # código mínimo (pendente p/ C, §6)
```

Estado medido nesta onda (scaffold + M1 a1/a2):

- `track:validate` — **verde** (2/2 desafios verificados por execução);
- `requirements` — **verde** (bijeição completa por slug, descrição derivada do texto real dos
  `checa_*`; a derivação C já existe em `engine/quality/requirements.ts`);
- `audit` — **2 violações A2, ambas "testsCode não parseia"** (o clang reprova o testsCode BRUTO
  porque o `SM_TEST(slug)` está sem o `SM_COUNT_PREABULO` — o parâmetro do slug vira "implicit
  int"). **Não conserte o conteúdo por isso**: é o gap do preâmbulo agendado para a onda 3C
  (o audit deve parsear testsCode com o MESMO preâmbulo de `cCountDeclared`). O que resta do
  audit (A1/A2 de starter/solution, A4 de teoria, A6, I14–I17, DEC) saiu **zero violação** sobre
  as 115 aulas.
- `coverage` — **exit 2** (uso indevido declarado): não existe sintetizador de código mínimo para
  C em `engine/quality/minimalPorLinguagem.ts` (`quality/minimalC.ts` é trabalho de engine — onda
  3C ou seguinte). Fail-closed correto: reprovar é melhor que veredito falso.

**Inventário MEDIDO de chaves que o envelope padrão do teste emite** (sondado nesta onda com o
parser do adaptador, testsCode das duas aulas vivas ± `SM_COUNT_PREABULO`). Com o preâmbulo, os
dois testsCode parseiam e emitem: `api:SM_TEST`, `api:fclose`, `api:fgets`, `api:fopen`,
`api:freopen`, `decl:func`, `decl:var`, `global:stdout`, `node:CallExpr`, `node:CompoundStmt`,
`node:DeclRefExpr`, `node:DeclStmt`, `node:IncludeDirective`, `node:IntegerLiteral`,
`node:ParmVarDecl`, `node:StringLiteral` — e, com a regra do fflush do §3, `api:fflush` entra no
lugar do fclose do stdout (ambos já estão na semente). Contra a entrada da aula 1 (axioma =
estruturais + semente de 12 chaves em `engine/atomKeys.ts`), ficam FORA **6 chaves**:
`api:freopen`, `api:fgets`, `global:stdout`, `node:DeclStmt`, `decl:var`,
`node:IncludeDirective` — é a lista exata que a onda que estender `C_HARNESS_RECEPTIVE_SEED` (ou
o preâmbulo do audit) precisa cobrir para o audit C fechar 0 violações.
(`node:TranslationUnitDecl` aparece só na caminhada crua da raiz — `extractAtoms` NUNCA o emite
como chave, coerente com docs/20 §8.1.) O preâmbulo de parse não vê o header do harness, por isso
o teste declara o `#include <stdio.h>` próprio (regra 3 do §2).

## 7. Erros comuns (todos medidos nesta onda)

| Erro | Sintoma | Conserto |
|---|---|---|
| `main` no `solucao.c` | `duplicate symbol '_main'` no link | o `main` é do harness — o aluno escreve FUNÇÕES |
| `assert`/`#include <assert.h>` no teste | erro de compilação (`assert() e proibido…`) | use `checa_*` (counter_protocol) |
| `fclose(stdout)` + 2º `freopen` no mesmo desafio | UB por C11 §7.21.4 (crash silencioso ou captura vazia, conforme a libc) | A REGRA do §3: `fflush(stdout)` — o stdout fica aberto para o próximo `freopen` |
| `testsCode` sem `#include <stdio.h>` | `countDeclared` = 0 → dupla-igualdade reprova | inclua `<stdio.h>` no topo do teste |
| `SM_TEST` com slug contendo hífen | erro de compilação (identificador inválido) | slug do cenário em snake_case (`tres_linhas_na_ordem`) |
| buffer de leitura sem inicializador | UB no run do starter (fgets NULL) | sentinel: `char linha[80] = "(nada impresso)";` |
| teste que não prova o FIM da saída | aluno que imprime linha extra PASSA | regra 11: buffer novo com sentinel + `fgets` a mais + `checa_str` contra o sentinel |
| `checa_double` com resultado não exato | verde aqui, vermelho lá (1 ulp) | regra 12: só `double` de representação exata, ou compare o `%f` no canal SAÍDA |
| `expectedTestCount` ≠ nº de `SM_TEST` | exit 2 da engine (dupla-igualdade) | conte os BLOCOS, não os `checa_*` |
| chamar função do aluno que não existe | `Undefined symbols: _tela` no link (prova 2 falha passando) | protótipo no teste PRECISA casar com o que o starter/solução define |
| `printf` do aluno no lugar da função | teste vê o main do harness, não a função | o teste chama a FUNÇÃO do aluno dentro do cenário |
