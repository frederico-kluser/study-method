# Receita da aula — o capítulo C

A parte da receita que depende do adaptador C. O que vale nas três línguas está em
`receita-da-aula.md` (§0 layout · §1 `lesson.json` · §2 `challenge.json` · §3 fases do canal ·
§4 a regra do par e `introduces.derived` · §5 o gate das demonstrações). Abra este arquivo quando
`track.json.programmingLanguage` for `c` — e só então.

Trilha viva: `app/resources/tracks/c-iniciante` (115 aulas em 7 módulos, `runtime: cc-c11`).
Contratos de conteúdo: `docs/20-trilha-c.md` **e** `skills/trilha-author/references/prova-c.md` —
este último é o template congelado do arquivo de teste, e a forma dele é obrigatória.

## 1. Inventário e vocabulário — onde está e como conferir

**C não tem `atoms.c.json`**: o enum fechado mora no código, em `cInventory()`
(`engine/lang/c.ts`). Medido — **34 kinds de nó**, **3 globais** (os fluxos padrão) e o eixo
`decl:` com **duas** formas só (`decl:func`, `decl:var`, de `attrs.declKind` em
`vocab/c/extract_ast.py`):

```bash
cd app && npx tsx -e 'import {getAdapter} from "./electron/main/engine/lang/registry"; const a = getAdapter("c"); console.log(a.inventory().length, [...a.globals()].join(" "), a.forbiddenInvariants.join(" "))'
# → 34 stdin stdout stderr node:IndirectCall api:dlsym api:system
```

- Os kinds emitidos são os do dump do clang (Apple clang 17 nesta máquina) MAIS os portadores
  sintéticos; tudo o que não está na tabela `_EMITIDOS` é TRANSPARENTE (o nó cai e os filhos
  sobem). Não existe `node:StructDecl`: a definição de struct é `node:RecordDecl`; `s.x` e `p->m`
  são o MESMO `node:MemberExpr` (a distinção vai no atributo).
- `node:TranslationUnitDecl` **nunca** é emitido como chave.
- Tag de cerca aceita na teoria: **`c`, e só** (`C_THEORY_FENCE_TAGS`). Bloco com outra tag não é
  código para o gate — A19 reprova como se a demonstração não existisse.
- Chave duvidosa? Rode o extrator (`receita-da-aula.md` §5.1) com `language:"c"` e
  `surface:"theory"`, e use a chave EXATA emitida.

## 2. Axioma de entrada e semente receptiva do harness

Medido: **estruturais 5 · semente 19 · axioma 24 chaves**.

```bash
cd app && npx tsx -e 'import {harnessReceptiveSeed, structuralAlwaysAllowed} from "./electron/main/engine/atomKeys"; const s = harnessReceptiveSeed("c"), e = structuralAlwaysAllowed("c"); console.log(s.length, e.length, new Set([...s, ...e]).size)'
# → 19 5 24
```

- **Estruturais sempre permitidos** (`C_STRUCTURAL_ALWAYS_ALLOWED`): `node:CompoundStmt` ·
  `node:DeclRefExpr` · `node:VarDecl` · `node:FunctionDecl` · `node:ParmVarDecl`. O evento de
  currículo mora no ATRIBUTO (`decl:func`/`decl:var`), não no nó container — por isso o nó é
  perdoado e a chave `decl:` continua gateando.
- **Semente receptiva do harness** (`C_HARNESS_RECEPTIVE_SEED`) — o envelope do `testsCode` na
  convenção counter_protocol: `api:SM_TEST` · `decl:func` · `node:CallExpr` ·
  `node:IntegerLiteral` · `node:StringLiteral` · `node:TypedefDecl` · `api:fprintf` · `api:fflush`
  · `api:fclose` · `api:fopen` · `api:getenv` · `api:strcmp` · `global:stderr` · `api:freopen` ·
  `api:fgets` · `global:stdout` · `node:DeclStmt` · `decl:var` · `node:IncludeDirective`.
- **A semente é RECEPTIVA e só.** `decl:var` e `node:IncludeDirective` estão nela porque o ENVELOPE
  do teste declara variáveis (`FILE *f`, `char linha[80]`) e abre com `#include <stdio.h>` antes da
  aula que os ensina — a solução do aluno que escrever `decl:var` antes dessa aula continua
  reprovando em A2. Ler é perdoado; escrever, não.

## 3. A forma do arquivo de teste — o counter_protocol

**Leia `skills/trilha-author/references/prova-c.md` inteiro antes de escrever a primeira linha de
`testsCode`.** Ele é o contrato executável; aqui ficam só os fatos que decidem a AULA:

- O adaptador GERA `tests/sm_harness.h` (a macro `SM_TEST`, os `checa_*`, o veneno do `assert`),
  `tests/sm_main.c` (o `main` do harness), `sm_fontes.txt` e `run.sh`. O autor escreve **só** o
  `testsCode`, e o aluno **só** o `solucao.c` — **nunca com `main`** (`duplicate symbol '_main'`).
- **Asserção é `checa_*`** (`checa_int`/`checa_long`/`checa_double`/`checa_char`/`checa_str`), com
  **rótulo pt-BR no 1º argumento** — é a legenda do veredito (o papel da docstring do Python).
  `assert` está venenado de propósito: ele abortaria no primeiro erro e esconderia os cenários
  seguintes.
- **`expectedTestCount` = nº de blocos `SM_TEST`** (não de `checa_*`).
- **Captura da fase SAÍDA**: `freopen` → chama a função do aluno → **`fflush(stdout)`, nunca
  `fclose(stdout)`** → `fopen` de leitura → `fgets` → `checa_str` → `fclose(f)`. Depois de
  `fclose(stdout)` um segundo `freopen` é UB (C11 §7.21.4) — e a virada (`ambos`) tem duas
  capturas.
- **Buffer com sentinel**: `char linha[80] = "(nada impresso)";` — ler buffer não inicializado é UB,
  proibição permanente da trilha. O sentinel também é como o teste PROVA O FIM da saída (um `fgets`
  a mais + `checa_str` contra o próprio sentinel): sem isso, o aluno que imprime uma linha extra
  passa.
- Exit normalizado do `run.sh` (D-V11): **0** passou · **1** falhou · **2** contagem errada · **3**
  timeout · **66** infra; o exit bruto segue em `EXIT_BRUTO=`.
- Nome da função: nas aulas 1–3 do M1 é a função congelada `tela`; das que o aluno nomeia em
  diante, o slug do desafio em **camelCase de C** (`dobro-do-numero` → `dobroDoNumero`).
- Textos IMPRESSOS pelo código são **ASCII sem acento**; a prosa pt-BR com acento fica no
  `statement`, na teoria e nos comentários.

## 4. Proibições globais — em qualquer superfície

`C_FORBIDDEN_INVARIANTS` (3 chaves, medidas acima): `node:IndirectCall` · `api:dlsym` ·
`api:system`. Mais as proibições de conteúdo do `docs/20-trilha-c.md`: UB proposital (índice fora
do array, `NULL` desreferenciado, variável não inicializada lida, `gets`), `goto`, macro com
parâmetros e cast arbitrário de ponteiro. Só em prosa com crase, nunca em bloco cercado.

## 5. Armadilhas conhecidas do adaptador

| Armadilha | O que acontece | O que fazer |
|---|---|---|
| fragmento na teoria | `printf("oi\n");` solto não parseia como TU — sem o envelope o gate via ZERO demonstração em toda aula de C | passe `surface: 'theory'`; o ENVELOPE DE FRAGMENTO embrulha o trecho em `#include <stdio.h>`/`<stdlib.h>`/`<string.h>` + `void sm_fragmento_de_teoria(void) { … }`. Medido: sem `surface`, `ERRO clang (1:8): expected parameter declarator`; com ele, `api:printf node:CallExpr node:StringLiteral` |
| fragmento que usa nome não declarado | o envelope é um CORPO DE FUNÇÃO: `x = x + 1;` sozinho → `ERRO clang (1:1): type specifier missing` | declare no MESMO bloco: `int x = 3;` + `x = x + 1;` → `decl:var node:BinaryOperator node:DeclStmt node:IntegerLiteral node:VarDecl op:assign:= op:binary:+` |
| `testsCode` sem `#include <stdio.h>` | o `countDeclared` parseia o teste SEM o header do harness; `FILE *f` vira erro duro e a contagem declarada vira **0** — a dupla-igualdade reprova | todo `testsCode` abre com `#include <stdio.h>` próprio |
| `SM_TEST` com hífen no slug | erro de compilação (identificador inválido) | slug do cenário em snake_case (`tres_linhas_na_ordem`) |
| `checa_double` | compara `==` EXATO, sem epsilon | só `double` de representação binária exata (inteiros, `.5`, `.25`), ou compare via TEXTO no canal SAÍDA |
| `#include "solucao.h"` no teste | o preâmbulo de parse não vê headers do desafio | protótipo solto no topo do teste, até a aula que ensina header próprio |
| `main` no `solucao.c` | `duplicate symbol '_main'` no link | o `main` é do harness; o aluno escreve FUNÇÕES |

## 6. Tetos da barra e o gate da trilha

Os tetos são os mesmos das três línguas (`quality/barra.ts`): A17 ≤2 produtivas novas colapsadas ·
A18 ≤1 na aula 1 · A21 ≤4 novas no total e seções ≥ max(2, ⌈novas/2⌉) · A19 toda chave nova
demonstrada em bloco ` ```c ` DESTA aula · A20 aula sem desafio é aula sem prova · A22 duas formas
(aviso).

```bash
cd app && npm run engine -- barra c-iniciante          # exit 0 sem erro · 1 com erro
cd app && npm run engine -- audit c-iniciante --limite 0
cd app && npm run track -- track:validate c-iniciante
```

> ⚑ **Divergência declarada a re-medir antes de citar.** `prova-c.md` §6 afirma que `coverage` em C
> sai **exit 2** por não existir sintetizador de código mínimo. Medido em 2026-09-22, o despachante
> `engine/quality/minimalPorLinguagem.ts` JÁ lista `c -> quality/minimalC.ts` (o arquivo existe no
> disco). Antes de repetir qualquer um dos dois números, rode `npm run engine -- coverage
> c-iniciante` e cite o que a sua execução mediu.
