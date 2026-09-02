# Trilha TypeScript a partir do JavaScript — especificação de conteúdo

> Contrato de CONTEÚDO da trilha `typescript-a-partir-do-javascript`. Este documento define O QUÊ
> cada módulo e cada aula ensinam e o que se presume que o aluno já sabe. Ele é o INSUMO da engine
> de trilhas: a coluna `Ensina` vira `introduces` e a coluna `Presume` vira o grafo de
> pré-requisitos e o orçamento cumulativo de [`16-engine-de-trilha.md`](16-engine-de-trilha.md) §3.5.
>
> **Autoridade.** Onde este documento e [`16-engine-de-trilha.md`](16-engine-de-trilha.md)
> divergirem, o 16 vence. Onde este documento e um gate determinístico divergirem, o gate vence.
>
> **Molde.** A estrutura é a de [`15-trilha-nodejs.md`](15-trilha-nodejs.md); o nível de exigência é
> o de `app/content-src/programacao-do-zero/curriculo.md` (apagado em 2026-09-02 junto com a
> trilha — ver [`15-trilha-nodejs.md`](15-trilha-nodejs.md); o formato do currículo continua
> descrito neste documento).
>
> **Base.** Fatos medidos nesta máquina (Node v24.19.0 e `typescript@5.8.3`, com o comando ao lado
> de cada número); o dossiê
> [`research/08-multilingua-trava-deterministica.md`](research/08-multilingua-trava-deterministica.md)
> §5 (ficha TypeScript — Tier A, e a trava com DUAS camadas decidíveis); os princípios de
> [`02-pedagogia.md`](02-pedagogia.md); e, como fonte externa nomeada, o **TypeScript Handbook**
> (<https://www.typescriptlang.org/docs/handbook/intro.html>), cuja ordem de capítulos e cujo
> escopo declarado sustentam as duas decisões de projeto da seção seguinte.

## A decisão: esta trilha PRESSUPÕE JavaScript

**Decidido: sim.** O axioma de entrada desta trilha é "sabe escrever JavaScript moderno". A trilha
ensina **a camada de tipos**, e só ela.

**Por quê — quatro razões, em ordem de peso**

1. **A fonte de referência da linguagem faz o mesmo, e diz isso por escrito.** O TypeScript
   Handbook declara: *"If you are coming to TypeScript without a JavaScript background, with the
   intention of TypeScript being your first language, we recommend you first start reading the
   documentation on either the Microsoft Learn JavaScript tutorial or read JavaScript at the
   Mozilla Web Docs."* E lista explicitamente, entre o que **não** cobre: *"Core JavaScript basics
   like functions, classes, and closures"*. A porta de entrada dele chama-se, literalmente,
   "TypeScript for JavaScript Programmers".
2. **Expertise reversal.** [`02-pedagogia.md`](02-pedagogia.md) §3.3 é explícito e a implicação
   aqui é direta: *"o worked example completo, com toda linha comentada, entregue a quem já domina
   o padrão, não é neutro — é dano"*. Reensinar `let`, `for` e função a quem veio aprender tipos é
   redundância pura, e redundância consome memória de trabalho à toa.
3. **Unicidade de origem entre trilhas.** I3 exige que nenhuma construção seja introduzida por duas
   aulas. Uma trilha de TypeScript do zero absoluto introduziria `node:FunctionDeclaration`,
   `decl:let`, `node:IfStatement` — todas já introduzidas por `programacao-do-zero` e por
   `nodejs-do-zero`. Duas origens para o mesmo átomo é o começo de duas trilhas que divergem em
   silêncio: um conserto pedagógico feito numa não chega na outra.
4. **Economia mensurável.** Sem o axioma, as primeiras ~40 aulas seriam idênticas às de
   `nodejs-do-zero` módulo 1 + 9 a 12. Com o axioma, a trilha tem **82 aulas** e cada uma delas
   ensina algo que só existe em TypeScript.

**O que fica fora de escopo por causa dessa decisão** (e onde a pessoa deve ir):

| Fora desta trilha | Onde está |
|---|---|
| Variável, função, parâmetro, retorno, chamada | `programacao-do-zero` (14 aulas micro, zero absoluto) |
| `if`, laços, array, objeto, classe, closure, `async`/`await`, módulos ESM | `nodejs-do-zero` módulos 1, 3 e 9 a 13 |
| Node, HTTP, banco, deploy | `nodejs-do-zero` módulos 2 e 4 a 8 |
| `mypy`, anotação em Python | [`17-trilha-python.md`](17-trilha-python.md) módulo 12 |
| JSX/TSX, decorators experimentais, `namespace` legado, `enum` const, build (webpack, vite, babel) | fora do produto — o Handbook também os declara fora do seu escopo |

**O axioma de entrada, formalmente.** `entryConstructs` desta trilha = o orçamento **produtivo**
acumulado ao fim dos módulos 1, 3, 9, 10, 11 e 12 de `nodejs-do-zero`, a saber:

- nós: declaração e expressão de função, arrow, parâmetro, `return`, chamada, `new`, bloco,
  literais (número, texto, template, booleano, `null`), array e objeto literais, acesso por ponto e
  por colchete, `if`/`else`, ternário, `for`, `for...of`, `while`, `switch`, `throw`, `try`/`catch`,
  classe com método, propriedade, `constructor`, `get`/`set`, `static`, `extends`, `super`,
  `import`/`export`, spread e rest, desestruturação de objeto e de array, `await`;
- `decl:let`, `decl:const`;
- as famílias de operador `binary`, `logical`, `unary`, `assign`, `update` completas;
- globais e API: `console`, `Object`, `Array`, `JSON`, `Math`, `Promise`, `Error`, `Map`, `Set`,
  mais `Array.prototype.*` e `Object.*`, mais `node:test` e `node:assert/strict`.

**O portão de entrada é verificável, não é confiança.** O aluno entra na trilha por um dos dois
caminhos: aprovação no `proficiency.json` de `nodejs-do-zero`, ou aprovação no
`proficiency.json` desta trilha, que é um **teste de JavaScript** (não de TypeScript) cobrindo
exatamente o axioma acima. Quem não passa é encaminhado para a trilha de JavaScript com a lista dos
conceitos que faltaram — nunca é deixado dentro de uma trilha cujo orçamento de entrada ele não
tem.

## A segunda decisão: o erro de tipo não é observável rodando o teste

Este é o fato que muda a didática inteira, e ele foi medido:

```bash
node --version                                     # v24.19.0
node --test --test-reporter=spec test.ts           # ℹ pass 1 · ℹ fail 0 · EXIT=0
```

com a solução contendo, de propósito, um erro de tipo:

```ts
export function dobro(x: number): number {
  const rotulo: number = "isto e uma string";   // erro de tipo
  console.log(rotulo);
  return x * 2;
}
```

O mesmo arquivo, no conferidor de tipos:

```bash
app/node_modules/.bin/tsc --version   # Version 5.8.3
app/node_modules/.bin/tsc --noEmit --strict --target es2022 --module nodenext \
  --moduleResolution nodenext --allowImportingTsExtensions solution.ts
# solution.ts(2,9): error TS2322: Type 'string' is not assignable to type 'number'.
# EXIT=2
```

**O Node APAGA os tipos; ele não os confere.** Roda, imprime a string, sai 0. Para o aluno isso é
uma armadilha pedagógica de primeira ordem: numa trilha em que "o teste ficou verde" sempre
significou "acertei", uma aula sobre tipos ficaria verde estando errada. Três consequências, todas
normativas:

### 1. O conferidor de tipos é uma QUINTA prova, aplicada só ao lado da solução

[`16`](16-engine-de-trilha.md) §5.4 exige quatro provas de execução. Esta trilha acrescenta uma:

| Prova | Canal | Vale para TypeScript? |
|---|---|---|
| 1. a solução de referência passa nos testes | `node --test` | sim, inalterada |
| 2. o `starterCode` falha | `node --test` | sim, **e continua sendo só runtime** |
| 3. a contagem de testes bate com `expectedTestCount` | `node --test` | sim, inalterada |
| 4. um stub vazio falha | `node --test` | sim, **e continua sendo só runtime** |
| 5. **`typesCheck`: a solução de referência passa no `tsc --noEmit --strict`** | `tsc` | **nova, e só aqui** |

As provas 2 e 4 **não** podem contar falha de `tsc`, e isso não é detalhe: um starter de TypeScript
quase sempre tem erro de tipo por construção (a lacuna está vazia, o tipo do retorno não bate), e um
stub vazio com `import` vira erro de compilação. Se a falha de tipo contasse, as duas provas
passariam trivialmente e parariam de provar o que existem para provar — a igualdade dupla que
[`16`](16-engine-de-trilha.md) §5.4 chama de o que salva o executor.

### 2. O veredito mostrado ao aluno tem DUAS listas de checks

- **"o que o programa faz"** — os checks de `node --test`, um por `test(...)`;
- **"o que os tipos prometem"** — o resultado do `tsc --noEmit` sobre o código do aluno, com o
  código do diagnóstico (`TS2322`, `TS2345`, `TS2551`…) e a linha/coluna.

Aprovação exige as duas verdes. Um aluno que fica verde no runtime e vermelho no `tsc` recebe
exatamente a mensagem que a aula existe para ensinar: *o programa roda; o contrato está quebrado.*
O código `TSxxxx` é a máquina nocional do conferidor de tipos e aparece na teoria **literalmente**,
nunca parafraseado — é por ele que o aluno vai pesquisar quando estiver sozinho.

### 3. Sem `@ts-expect-error`, a asserção negativa de tipo vive no `wrongSolutions[]`

`any`, `as unknown as`, `@ts-ignore` e `@ts-expect-error` são **proibidos em qualquer nível** desta
trilha (teoria, starter, teste, solução) — os dois primeiros anulam a camada semântica da trava, os
dois últimos a desligam linha a linha.

Isso tem um custo, e ele precisa ser resolvido em vez de ignorado: `@ts-expect-error` é a forma
idiomática de escrever um **teste de tipo** ("esta linha NÃO pode compilar"), e sem ela a trilha
perde a capacidade de afirmar o negativo. A substituição é estrutural, não retórica:

> Toda aula cujo `targetAtom` é uma construção de tipo declara **ao menos um** `wrongSolutions[]`
> que **passa** em `node --test` e **falha** no `tsc`, com o código do diagnóstico esperado. A
> teoria mostra esse código errado lado a lado com o certo, e o veredito da prova 5 é o que separa
> os dois. É a asserção negativa, expressa por catálogo verificável em vez de por diretiva no
> arquivo.

## Vocabulário de átomos desta trilha

Os seis eixos de [`16`](16-engine-de-trilha.md) §3.1, aplicados à camada de tipos.

**A boa notícia, verificada:** `vocab/atoms.json` **já contém o universo TypeScript inteiro** — 275
chaves `node:` incluindo `InterfaceDeclaration`, `TypeAliasDeclaration`, `MappedType`,
`ConditionalType`, `InferType`, `SatisfiesExpression`. Esta trilha **não precisa de artefato novo em
`vocab/`**. Comando:

```bash
cd app && python3 -c "
import json; n=set(json.load(open('electron/main/engine/vocab/atoms.json'))['axes']['node'])
alvo=['node:InterfaceDeclaration','node:TypeAliasDeclaration','node:MappedType','node:ConditionalType','node:InferType','node:SatisfiesExpression','node:TypePredicate','node:IndexedAccessType']
print([k for k in alvo if k not in n])"   # []
```

**A outra boa notícia:** ao contrário de Python, o eixo `form:` **está disponível** — o seletor é
tipado sobre `ts.Node`. É ele que resolve o problema central do vocabulário de tipos: **a anotação
não é um nó, é um atributo**. `function f(x: string): number` produz `Parameter` e
`FunctionDeclaration` (que o aluno já sabia do axioma JS) mais `StringKeyword` e `NumberKeyword` —
mas **anotar o parâmetro** e **anotar o retorno** são duas aulas diferentes, e no eixo `node:` elas
são indistinguíveis. No eixo `form:` são triviais.

### As formas novas que a bateria precisa registrar

`form/rules.ts` compila hoje **cinco** formas, todas de JavaScript
([`../app/electron/main/engine/form/rules.ts`](../app/electron/main/engine/form/rules.ts)). Esta
trilha exige as **catorze** abaixo. Cada uma é um par mínimo e cada uma é evento de currículo por
I11 (mudar a forma de algo já ensinado exige aula dedicada):

| Chave | O par mínimo que ela separa |
|---|---|
| `form:VariableDeclaration[type!=null]` | `const a: number = 1` × `const a = 1` |
| `form:Parameter[type!=null]` | `f(x: string)` × `f(x)` |
| `form:FunctionDeclaration[type!=null]` | `function f(): number` × `function f()` |
| `form:ArrowFunction[type!=null]` | `(x): number => x` × `(x) => x` |
| `form:Parameter[questionToken!=null]` | `f(x?: string)` × `f(x: string)` |
| `form:PropertySignature[questionToken!=null]` | `{ a?: string }` × `{ a: string }` |
| `form:PropertyDeclaration[type!=null]` | `class A { x: number }` × `class A { x }` |
| `form:Parameter[modifiers!=null]` | `constructor(private x: number)` — parameter property |
| `form:Parameter[dotDotDotToken!=null]` | `f(...xs: number[])` × `f(xs: number[])` |
| `form:FunctionDeclaration[body=null]` | assinatura de sobrecarga × declaração com corpo |
| `form:TypeParameter[constraint!=null]` | `<T extends object>` × `<T>` |
| `form:TypeParameter[default!=null]` | `<T = string>` × `<T>` |
| `form:IfStatement[expression=TypeOfExpression]` | `if (typeof x === 'string')` — o estreitamento por `typeof` |
| `form:IfStatement[expression=BinaryExpression]` | `if (forma.tipo === 'circulo')` — o estreitamento por igualdade |

**As catorze foram verificadas contra a DSL do seletor**, e não só escritas: o casamento de atributo
exige que a propriedade **exista** no nó (`f.resolvedName in record` em
[`../app/electron/main/engine/form/selector.ts`](../app/electron/main/engine/form/selector.ts)), e a
`nodeFactory` do TypeScript atribui todas as opcionais como propriedades próprias com valor
`undefined`. Conferido nó a nó — `type`, `questionToken`, `dotDotDotToken`, `modifiers`, `body`,
`constraint`, `default` e `expression` existem nos nós citados:

```bash
cd app && node -e "
const ts=require('typescript');
const sf=ts.createSourceFile('t.ts','function f(x) {}',ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let p; (function w(n){ if(!p && ts.SyntaxKind[n.kind]==='Parameter') p=n; ts.forEachChild(n,w); })(sf);
console.log(['type','questionToken','dotDotDotToken','modifiers'].map(k=>k+':'+(k in p)).join(' '))"
# type:true questionToken:true dotDotDotToken:true modifiers:true
```

`questionToken` é visitado pelo `forEachChild` mas **não está no inventário gerado** (o extrator
descarta pontuação, §5.3 passe 1). Por isso a forma opcional tem de sair pelo eixo `form:`, e não
por `node:QuestionToken`. Verificado:

```bash
cd app && node -e "
const ts=require('typescript');
const sf=ts.createSourceFile('t.ts','interface I { a?: string }',ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const s=new Set(); (function w(n){s.add(ts.SyntaxKind[n.kind]); ts.forEachChild(n,w);})(sf);
console.log([...s].join(' '))"
# EndOfFileToken Identifier InterfaceDeclaration PropertySignature QuestionToken SourceFile StringKeyword
```

### As três chaves sintéticas que faltam

Estas o eixo `node:` não entrega e o seletor atual não consegue expressar — o valor de um filtro é
`null` ou um **tipo de nó**, e nos três casos abaixo o discriminante é um `SyntaxKind` guardado
como número (`TypeOperator.operator`) ou um booleano (`isTypeOnly`). Precedente para chave sintética
no eixo `node:`: `node:ComputedNonLiteralAccess`, emitida por `extract.ts` e listada em
`FORBIDDEN_ALWAYS`, não existe em `ts.SyntaxKind`.

| Chave sintética | Por que é necessária | Medido |
|---|---|---|
| `node:KeyOfType` | `keyof T` e `readonly T[]` produzem **o mesmo** `node:TypeOperator` | `keyof T` → `TypeAliasDeclaration TypeOperator TypeReference`; `readonly string[]` → `TypeAliasDeclaration TypeOperator ArrayType StringKeyword` |
| `node:ReadonlyArrayType` | idem, o outro lado do par | idem |
| `node:TypeOnlyImport` / `node:TypeOnlyExport` | `import type { A }` × `import { A }`: a diferença é `ImportClause.isTypeOnly`, um booleano | — |

**Globais em posição de tipo.** `Partial`, `Pick`, `Omit`, `Record`, `Required`, `ReturnType`,
`Parameters`, `Awaited`, `Promise` e `AsyncIterable` são nomes globais do `lib.d.ts`, exatamente como
`Array` e `Math` são globais de valor. Entram no eixo `global:` (`global:Partial`, `global:Pick`…),
e a única exigência sobre o extrator é que ele resolva identificador global também quando ele
aparece dentro de um `TypeReference` — hoje o passe de globais olha só posição de valor.

### A semente receptiva do harness TypeScript

O que o aluno lê em todo desafio e não escreve em nenhum — a semente do JavaScript
(`HARNESS_RECEPTIVE_SEED` em [`../app/electron/main/engine/atomKeys.ts`](../app/electron/main/engine/atomKeys.ts))
mais, porque o arquivo de teste desta trilha é `.ts`:

```
form:Parameter[type!=null]     form:FunctionDeclaration[type!=null]
node:StringKeyword  node:NumberKeyword  node:BooleanKeyword
node:TypeReference  node:ArrayType
```

Motivo: o `test.ts` de qualquer desafio importa uma função **tipada** e a chama; sem essas chaves na
faixa receptiva, todo desafio da trilha nasceria violando A3 por causa do próprio harness — que é
exatamente o defeito que a política `receptive-seed` existe para evitar. Elas nunca entram na faixa
produtiva: escrever a anotação continua sendo o conteúdo das aulas 1 a 4 do módulo 1.

## Princípios pedagógicos aplicados

1. **Nada de reensino.** Nenhuma aula desta trilha introduz construção do axioma JavaScript. Onde
   uma aula precisa de uma construção JS, ela aparece na coluna `Presume` como "axioma JS" — e
   nunca em `Ensina`.
2. **O erro de tipo é sempre mostrado, nunca só descrito.** Toda aula cujo alvo é uma construção de
   tipo traz, na teoria, o código do diagnóstico `TSxxxx` que o aluno vai ver, e traz o
   `wrongSolutions[]` que o produz.
3. **A forma mais simples primeiro** (I9): anotação explícita antes de inferência; `interface` antes
   de tipo mapeado; guarda com `typeof` antes de `is`; `as` só depois de o aluno saber estreitar —
   e apresentado como última saída, não como ferramenta.
4. **Pre-training → worked example → fading → prática independente**, como em toda trilha do
   produto: base conceitual, exemplo completamente resolvido com sub-objetivos rotulados, e só
   então o desafio.
5. **Interleaving e recuperação espaçada** (A15b/I7): toda aula reutiliza ao menos um átomo
   demonstrado antes; nenhuma família ocupa três aulas seguidas sem intercalação.
6. **Fontes fora do fluxo** — URLs em `sources[]`, visíveis só no botão "Fontes".

## Estrutura da trilha

**10 módulos, 82 aulas.** O número é **saída, não entrada** ([`16`](16-engine-de-trilha.md) §3.6): é
a consequência de aplicar o teto de ≤2 construções produtivas novas por aula à camada de tipos, com
o axioma JavaScript já dado. A ordem dos módulos 1 a 8 é a do TypeScript Handbook (The Basics →
Everyday Types → Narrowing → More on Functions → Object Types → Generics → Type Manipulation →
Classes → Modules); os módulos 9 e 10 acrescentam o que o Handbook declara fora do seu escopo e o
produto precisa ter.

| # | Módulo | Aulas | Presume-se que o aluno sabe |
|---|---|---|---|
| 1 | `o-conferidor-de-tipos` | 10 | Axioma JavaScript (ver acima) — e nada de TypeScript |
| 2 | `tipos-do-dia-a-dia` | 13 | Anotar nome, parâmetro e retorno (M1) |
| 3 | `estreitamento` | 8 | União e literal (M2) |
| 4 | `funcoes-tipadas` | 8 | Estreitamento (M3) |
| 5 | `tipos-de-objeto` | 7 | Tipo de objeto anônimo e assinatura de índice (M2+M4) |
| 6 | `genericos` | 6 | Interface e interseção (M5) |
| 7 | `tipos-a-partir-de-tipos` | 9 | Genéricos e `keyof` (M6) |
| 8 | `classes-em-typescript` | 8 | Genéricos (M6) e classes do axioma JS |
| 9 | `modulos-e-fronteira` | 8 | Tipos de objeto (M5) e `unknown` (M2) |
| 10 | `assincronismo-tipado` | 5 | Genéricos (M6) e `async`/`await` do axioma JS |

## Conteúdo por aula

Nas tabelas, `Ensina` lista as construções produtivas novas (**no máximo 2**) e `Presume` nomeia a
aula que ensinou cada construção pressuposta, ou "axioma JS" quando ela vem do axioma de entrada.
"cons." marca uma aula de **consolidação declarada** (`role: "consolidation"`) — ver § "A tensão
A6 × I3".

### Módulo 1 — `o-conferidor-de-tipos`

| Aula | Ensina | Presume |
|---|---|---|
| `dois-conferidores` | `form:VariableDeclaration[type!=null]`, `node:NumberKeyword` | axioma JS (`const`, número) |
| `texto-e-booleano` | `node:StringKeyword`, `node:BooleanKeyword` | `dois-conferidores` |
| `anotar-o-parametro` | `form:Parameter[type!=null]` | `texto-e-booleano`, axioma JS (parâmetro) |
| `anotar-o-retorno` | `form:FunctionDeclaration[type!=null]` | `anotar-o-parametro`, axioma JS (`return`) |
| `o-erro-que-o-teste-nao-ve` | cons. — o aluno roda o teste (verde) e o `tsc` (TS2322) sobre o MESMO arquivo; reforça `form:VariableDeclaration[type!=null]` | `anotar-o-retorno` |
| `inferencia` | cons. — apagar a anotação e o tipo continuar lá; reforça `form:VariableDeclaration[type!=null]` | `o-erro-que-o-teste-nao-ve` |
| `lista-tipada` | `node:ArrayType` | `texto-e-booleano`, axioma JS (array) |
| `nao-devolve-nada` | `node:VoidKeyword` | `anotar-o-retorno` |
| `batizar-um-tipo` | `node:TypeAliasDeclaration` | `lista-tipada` |
| `arrow-tipada` | `form:ArrowFunction[type!=null]` | `anotar-o-retorno`, axioma JS (arrow) |

### Módulo 2 — `tipos-do-dia-a-dia`

| Aula | Ensina | Presume |
|---|---|---|
| `uniao` | `node:UnionType` (`string \| number`) | M1 `texto-e-booleano` |
| `tipo-literal` | `node:LiteralType` (`"aberto"` como tipo) | `uniao` |
| `uniao-de-literais` | cons. — o conjunto fechado de valores; reforça `node:UnionType` | `tipo-literal` |
| `nulo-e-indefinido` | `node:NullKeyword`, `node:UndefinedKeyword` (em posição de tipo) | `uniao` |
| `pode-faltar` | `form:Parameter[questionToken!=null]` | `nulo-e-indefinido`, M1 `anotar-o-parametro` |
| `objeto-anonimo` | `node:TypeLiteral`, `node:PropertySignature` | M1 `batizar-um-tipo`, axioma JS (objeto) |
| `propriedade-opcional` | `form:PropertySignature[questionToken!=null]` | `objeto-anonimo`, `pode-faltar` |
| `so-leitura` | `node:ReadonlyKeyword` | `objeto-anonimo` |
| `tupla` | `node:TupleType` | M1 `lista-tipada` |
| `tupla-nomeada` | `node:NamedTupleMember`, `node:OptionalType` | `tupla` |
| `qualquer-objeto` | `node:ObjectKeyword` | `objeto-anonimo` |
| `enumeracao` | `node:EnumDeclaration`, `node:EnumMember` | `uniao-de-literais` |
| `desconhecido` | `node:UnknownKeyword` (e por que `any` é proibido nesta trilha) | `uniao`, `qualquer-objeto` |

### Módulo 3 — `estreitamento`

| Aula | Ensina | Presume |
|---|---|---|
| `estreitar-com-typeof` | `form:IfStatement[expression=TypeOfExpression]` | M2 `uniao`, axioma JS (`typeof`, `if`) |
| `estreitar-com-igualdade` | `form:IfStatement[expression=BinaryExpression]` | `estreitar-com-typeof`, M2 `tipo-literal` |
| `estreitar-com-instanceof-e-in` | cons. — reforça `form:IfStatement[expression=BinaryExpression]` | `estreitar-com-igualdade`, axioma JS (`instanceof`, `in`) |
| `o-guarda-que-voce-escreve` | `node:TypePredicate` (`x is Gato`) | `estreitar-com-typeof`, M1 `anotar-o-retorno` |
| `uniao-discriminada` | cons. — o campo `tipo` literal como discriminante; reforça `node:UnionType` | `estreitar-com-igualdade`, M2 `objeto-anonimo` |
| `exaustividade-com-never` | `node:NeverKeyword` | `uniao-discriminada` |
| `afirmar-o-tipo` | `node:AsExpression` (a última saída, não a ferramenta) | `o-guarda-que-voce-escreve` |
| `nao-e-nulo` | `node:NonNullExpression` (`!`) e por que quase sempre é um erro disfarçado | `afirmar-o-tipo`, M2 `nulo-e-indefinido` |

### Módulo 4 — `funcoes-tipadas`

| Aula | Ensina | Presume |
|---|---|---|
| `tipo-de-funcao` | `node:FunctionType` | M1 `arrow-tipada` |
| `funcao-que-recebe-funcao` | cons. — callback tipado; reforça `node:FunctionType` | `tipo-de-funcao` |
| `rest-tipado` | `form:Parameter[dotDotDotToken!=null]` | M1 `lista-tipada`, axioma JS (rest) |
| `sobrecarga` | `form:FunctionDeclaration[body=null]` | `tipo-de-funcao`, M2 `uniao` |
| `o-this-da-funcao` | `node:ThisType` | `tipo-de-funcao`, axioma JS (`this`) |
| `assinatura-de-construtor` | `node:ConstructorType` | `tipo-de-funcao`, axioma JS (`new`) |
| `metodo-num-tipo` | `node:MethodSignature` | M2 `objeto-anonimo` |
| `chave-calculada-no-tipo` | `node:IndexSignature` | `metodo-num-tipo` |

### Módulo 5 — `tipos-de-objeto`

| Aula | Ensina | Presume |
|---|---|---|
| `interface` | `node:InterfaceDeclaration` | M2 `objeto-anonimo`, M1 `batizar-um-tipo` |
| `estender-interface` | `node:HeritageClause` | `interface` |
| `intersecao` | `node:IntersectionType` | `estender-interface` |
| `chave-qualquer` | cons. — dicionário tipado; reforça `node:IndexSignature` | `interface`, M4 `chave-calculada-no-tipo` |
| `lista-so-de-leitura` | `node:ReadonlyArrayType` | M2 `so-leitura`, M1 `lista-tipada` |
| `o-tipo-de-um-valor` | `node:TypeQuery` (`typeof config` em posição de tipo) | `interface` |
| `dois-tipos-que-casam` | cons. — tipagem estrutural: o TypeScript compara forma, não nome; reforça `node:InterfaceDeclaration` | `interface`, `intersecao` |

### Módulo 6 — `genericos`

| Aula | Ensina | Presume |
|---|---|---|
| `o-primeiro-generico` | `node:TypeParameter` | M5 `interface`, M4 `tipo-de-funcao` |
| `dois-parametros-de-tipo` | cons. — `<A, B>`; reforça `node:TypeParameter` | `o-primeiro-generico` |
| `restringir-o-generico` | `form:TypeParameter[constraint!=null]` (`<T extends object>`) | `dois-parametros-de-tipo`, M2 `qualquer-objeto` |
| `as-chaves-de-um-tipo` | `node:KeyOfType` | `restringir-o-generico`, M5 `interface` |
| `valor-padrao-de-tipo` | `form:TypeParameter[default!=null]` | `restringir-o-generico` |
| `generico-em-interface` | cons. — `interface Caixa<T>`; reforça `node:TypeParameter` | `valor-padrao-de-tipo`, M5 `interface` |

### Módulo 7 — `tipos-a-partir-de-tipos`

| Aula | Ensina | Presume |
|---|---|---|
| `pegar-um-campo` | `node:IndexedAccessType` (`Pessoa["nome"]`) | M6 `as-chaves-de-um-tipo` |
| `tipo-que-decide` | `node:ConditionalType` | `pegar-um-campo`, M6 `restringir-o-generico` |
| `descobrir-com-infer` | `node:InferType` | `tipo-que-decide` |
| `tipo-que-percorre` | `node:MappedType` | M6 `as-chaves-de-um-tipo` |
| `texto-como-tipo` | `node:TemplateLiteralType` | `tipo-que-percorre`, M2 `tipo-literal` |
| `partial-e-required` | `global:Partial`, `global:Required` | `tipo-que-percorre` |
| `escolher-e-descartar` | `global:Pick`, `global:Omit` | `partial-e-required` |
| `dicionario-tipado` | `global:Record` | `escolher-e-descartar`, M5 `chave-qualquer` |
| `o-que-a-funcao-devolve` | `global:ReturnType`, `global:Parameters` | `descobrir-com-infer`, M4 `tipo-de-funcao` |

### Módulo 8 — `classes-em-typescript`

| Aula | Ensina | Presume |
|---|---|---|
| `campo-tipado` | `form:PropertyDeclaration[type!=null]` | M1 `anotar-o-parametro`, axioma JS (classe) |
| `privado-de-verdade` | `node:PrivateKeyword` (e o contraste com o `#` do JavaScript) | `campo-tipado` |
| `publico-e-protegido` | `node:PublicKeyword`, `node:ProtectedKeyword` | `privado-de-verdade` |
| `campo-so-leitura` | cons. — `readonly` em campo de classe; reforça `node:ReadonlyKeyword` | `campo-tipado`, M2 `so-leitura` |
| `parametro-que-vira-campo` | `form:Parameter[modifiers!=null]` (parameter property) | `publico-e-protegido` |
| `implementar-uma-interface` | cons. — `implements`; reforça `node:HeritageClause` | `campo-tipado`, M5 `interface` |
| `classe-abstrata` | `node:AbstractKeyword` | `implementar-uma-interface` |
| `classe-generica` | cons. — `class Caixa<T>`; reforça `node:TypeParameter` | `campo-tipado`, M6 `generico-em-interface` |

### Módulo 9 — `modulos-e-fronteira`

| Aula | Ensina | Presume |
|---|---|---|
| `importar-com-extensao-ts` | cons. — `from './solution.ts'` roda no Node 24 sem flag; reforça `node:ImportDeclaration` | axioma JS (ESM) |
| `importar-so-o-tipo` | `node:TypeOnlyImport` | `importar-com-extensao-ts`, M5 `interface` |
| `exportar-um-tipo` | `node:TypeOnlyExport` | `importar-so-o-tipo` |
| `declaracao-de-modulo` | `node:ModuleDeclaration` | `exportar-um-tipo` |
| `arquivo-de-declaracao-e-strict` | `node:DeclareKeyword` (e o que `strict` liga, uma flag por vez) | `declaracao-de-modulo` |
| `satisfies` | `node:SatisfiesExpression` (o que ele faz que `as` não faz) | M3 `afirmar-o-tipo` |
| `importar-um-tipo-de-fora` | `node:ImportType` | `importar-so-o-tipo` |
| `dado-de-fora-e-desconhecido` | cons. — JSON que chega da rede é `unknown` até ser validado; reforça `node:UnknownKeyword` e `node:TypePredicate` | M2 `desconhecido`, M3 `o-guarda-que-voce-escreve` |

### Módulo 10 — `assincronismo-tipado`

| Aula | Ensina | Presume |
|---|---|---|
| `promessa-tipada` | `global:Promise` em posição de tipo | M6 `o-primeiro-generico`, axioma JS (Promise) |
| `async-devolve-promessa` | cons. — o retorno de `async` é sempre `Promise<T>`; reforça `form:FunctionDeclaration[type!=null]` | `promessa-tipada`, axioma JS (`async`) |
| `o-erro-do-catch-e-desconhecido` | cons. — em `strict`, `catch (e)` dá `unknown`; reforça `node:UnknownKeyword` | M2 `desconhecido`, axioma JS (`try`/`catch`) |
| `iterador-assincrono-tipado` | `global:AsyncIterable` | `promessa-tipada` |
| `o-tipo-de-dentro-da-promessa` | `global:Awaited` | `iterador-assincrono-tipado`, M7 `descobrir-com-infer` |

## A tensão A6 × I3, e como esta trilha a resolve

A bateria tem duas regras que, lidas ao pé da letra, se contradizem em toda aula de consolidação:
**A6** exige que a solução puxe ao menos um átomo de `introduces.productive`; **I3** proíbe que uma
construção seja introduzida por duas aulas.

**Resolução adotada:** I3 fala da **primeira introdução** (a aula que é `primeiraAulaQueEnsina`
para o átomo), não de toda menção. Uma aula de consolidação declara `role: "consolidation"`, lista
em `introduces.productive` o átomo que **reexercita**, e mantém `targetAtom` apontando para a aula
de origem. `programacao-do-zero` faz exatamente isso — a aula 2 declara o mesmo
`node:NumericLiteral` da aula 1 — e passa no audit com 0 violações.

**Regra: no máximo 2 aulas de consolidação por módulo**, sempre com um degrau real (forma nova do
mesmo átomo). São **17 consolidações em 82 aulas (21%)**, distribuídas M1 2, M2 1, M3 2, M4 1, M5 2,
M6 2, M7 0, M8 3, M9 2, M10 2 — todas dentro do teto **menos o módulo 8**, que tem 3 e é a única
exceção declarada. O motivo pelo qual esta trilha tem tantas consolidações — e por que a exceção
cai justamente em `classes-em-typescript` — é estrutural, não preguiça: **com o axioma JavaScript
dado, boa parte do estreitamento e das classes é semântica pura** — a sintaxe é a que o aluno já
escreve (`class`, `extends`, `readonly`, `<T>` já vieram do JavaScript ou de módulos anteriores), e
o que muda
é o que o conferidor de tipos sabe depois dela. Uma aula que ensina "depois deste `if`, o `tsc` sabe
que `x` é `string`" não introduz construção nova nenhuma, e forçá-la a introduzir uma seria inventar
sintaxe para satisfazer o gate. A saída correta é a que está aqui: declarar `role: "consolidation"`,
declarar o `notionalMachineDelta` (o que o conferidor passou a saber) e deixar o átomo reexercitado
no `introduces.productive`.

## A verificação Ensina × Presume

**Feita, e o método foi este.** Para cada uma das 82 aulas montei o conjunto cumulativo
`disponível(N) = axioma JS ∪ semente receptiva ∪ ⋃(Ensina de todas as aulas anteriores)` na ordem
em que as tabelas aparecem, e conferi que **toda construção citada em `Presume` está no conjunto**.
Cada célula de `Presume` nomeia a aula de origem (ou "axioma JS"), para a conferência ser
reexecutável por quem ler.

**E é literalmente reexecutável.** As tabelas são o dado; a conferência roda sobre este próprio
arquivo e reprova três coisas — slug repetido (I12), referência de `Presume` que aponta para aula
que ainda não veio (lacuna de currículo ou inversão de ordem) e átomo introduzido por duas aulas
fora de consolidação (I3). "axioma JS" é subtraído antes, porque o axioma de entrada não é aula:

```bash
python3 - docs/18-trilha-typescript.md <<'EOF'
import re, sys
txt = open(sys.argv[1], encoding='utf-8').read()
infence = False; mod = None; aulas = []
for ln in txt.split('\n'):
    if ln.strip().startswith('```'): infence = not infence; continue
    if infence: continue
    m = re.match(r'^### Módulo (\d+) — ', ln)
    if m: mod = int(m.group(1)); continue
    if ln.startswith('## ') and 'Módulo' not in ln: mod = None
    if mod and ln.startswith('| ') and not re.match(r'^\|[\s\-:|]+\|$', ln):
        c = [x.strip() for x in re.split(r'(?<!\\)\|', ln.strip().strip('|'))]
        if c[0] == 'Aula': continue
        aulas.append((mod, c[0].strip('`'), c[1], c[2]))
vistos = set(); origem = {}; falhas = []
for mod, slug, ensina, presume in aulas:
    if slug in vistos: falhas.append(f'I12 slug repetido: {slug}')
    p = re.sub(r'axioma JS( \([^)]*\))?', '', presume)   # o axioma de entrada não é aula
    for r in re.findall(r'`([a-z0-9][a-z0-9\-]{2,})`', p):
        if '-' in r and r not in vistos: falhas.append(f'LACUNA M{mod}/{slug} presume {r}')
    if 'cons.' not in ensina:
        for a in re.findall(r'`((?:node|decl|op|global|api|form|term):[^`]+)`', ensina):
            if a in origem: falhas.append(f'I3 {a}: {origem[a]} e {slug}')
            else: origem[a] = slug
    vistos.add(slug)
print(len(aulas), 'aulas ·', len(origem), 'átomos com origem única ·',
      len(falhas), 'falhas'); [print(' ', f) for f in falhas]
EOF
# 82 aulas · 75 átomos com origem única · 0 falhas
```

**O que a verificação encontrou e o que mudou por causa dela:**

1. **`node:IndexSignature` era pressuposto por `chave-qualquer` (M5) sem aula de origem.** A
   assinatura de índice estava só no módulo de objetos, mas o módulo de funções já a usava em
   `metodo-num-tipo`. Corrigido: a origem passou a ser M4 `chave-calculada-no-tipo`, e M5
   `chave-qualquer` virou consolidação.
2. **`node:NeverKeyword` estava no módulo 2 (`tipos-do-dia-a-dia`) e era usado no módulo 3.** Um
   `never` apresentado sem o caso de uso — a exaustividade da união discriminada — é vocabulário
   sem sentido. Movido para M3 `exaustividade-com-never`, imediatamente depois de
   `uniao-discriminada`.
3. **`node:KeyOfType` estava no módulo 7 e era pressuposto pelo módulo 6.** Restringir um genérico
   com `keyof` é o uso canônico de `keyof` e vem antes de qualquer tipo mapeado. Movido para M6
   `as-chaves-de-um-tipo`, e M7 começa em `pegar-um-campo`, que o pressupõe.
4. **`node:TypeParameter` era pressuposto por `classe-generica` (M8) e por `promessa-tipada` (M10)
   sem que a ordem dos módulos garantisse M6 antes.** A coluna `Presume` de M8 e M10 passou a citar
   M6 explicitamente, e a tabela de módulos declara essa dependência.
5. **`node:AsExpression` aparecia antes de o aluno saber estreitar.** Numa primeira versão, `as`
   estava no módulo 2, junto com `unknown`. Isso ensina a saída de emergência antes da porta:
   I9 (a forma mais simples primeiro) e o próprio Handbook põem `Narrowing` antes de qualquer
   asserção. Movido para o fim de M3, depois de `o-guarda-que-voce-escreve`, e reescrito como
   última saída.
6. **`node:TypePredicate` era pressuposto por `dado-de-fora-e-desconhecido` (M9).** A célula passou
   a citar M3 `o-guarda-que-voce-escreve`.
7. **`node:ImportDeclaration` e `node:HeritageClause` estavam sendo "ensinados" quando já são do
   axioma.** `import` é JavaScript; `extends` de classe é JavaScript. O que é novo é `import type`
   (chave sintética própria) e `extends` **de interface** (`HeritageClause` em
   `InterfaceDeclaration`, que é um nó que o JavaScript não produz). As aulas foram reescritas para
   introduzir só o que é de fato novo, e `importar-com-extensao-ts` virou consolidação.
8. **Um módulo inteiro de "limites" foi eliminado.** Ele teria 5 aulas de consolidação em 6 — sinal
   claro de que não era um módulo, e sim material disperso. O apagamento de tipos foi para M1
   `o-erro-que-o-teste-nao-ve`, a tipagem estrutural para M5 `dois-tipos-que-casam` e a fronteira de
   dados para M9 `dado-de-fora-e-desconhecido`.

**O que a verificação NÃO prova.** Ausência de lacuna de currículo e ausência de inversão de ordem
no nível de construção — sim. Teto de composição (§3.7) — não: é responsabilidade das aulas
`role: "integration"` derivadas pela fase F3 e do gate A9. Teto de 120 s por desafio — não: só é
mensurável depois de a solução de referência existir.

## Desafios de módulo

No fim de cada um dos 10 módulos existe um **desafio de MÓDULO**
(`modules/<slug>/challenges/<slug>/challenge.json`, declarado em `module.json` como `challenge`):

- **Multi-arquivo** — `files[]` com 2–3 arquivos `.ts` que se importam entre si (é aqui que
  `import type` e os arquivos de declaração ganham sentido); o editor mostra uma aba por arquivo;
- **Elaborado** — cenário do mundo real (2–4 mil caracteres), 4–6 testes;
- **Autoral** — não é gerado por LLM; o botão "Gerar novo desafio" não aparece quando o target é
  `module`;
- **Não pode introduzir construção nova** — pode compor livremente o que o módulo ensinou. Um
  desafio de módulo que precisa de algo não ensinado é a prova de que falta uma aula;
- **A prova 5 (`typesCheck`) vale para todos os arquivos** do desafio de módulo, não só para um.

## UX

- **Teoria determinística** — a aula apresenta a teoria direto do `lesson.json` (markdown, seção por
  seção): sem LLM e sem loading. O LLM é usado só para dúvidas (`answer`) e para gerar novo desafio.
- **Falha rápida sem chave** — sem chave de LLM o `answer` devolve `TUTOR_UNAVAILABLE`; o fluxo
  nunca trava em spinner.
- **Duas listas de checks no veredito** (§ "A segunda decisão"): "o que o programa faz"
  (`node --test`, um check por `test(...)`) e "o que os tipos prometem" (`tsc --noEmit`, um check por
  diagnóstico, com `TSxxxx`, linha e coluna). A aprovação exige as duas verdes; o confete só com as
  duas verdes.
- **O caso "verde no teste, vermelho no tipo" tem texto próprio.** É o caso pedagogicamente mais
  importante da trilha e não pode aparecer como "falhou": a mensagem é *"seu programa roda e
  entrega o valor certo — mas o contrato de tipos está quebrado na linha N"*, seguida do
  diagnóstico literal.
- **O `tsc` é ~6× mais lento que o teste** — medido nesta máquina sobre o mesmo par de arquivos:
  `tsc --noEmit --strict` 494/502/502 ms contra `node --test` 69/83/79 ms. O veredito mostra a lista de
  runtime assim que ela existe e a de tipos em seguida, em vez de segurar as duas.

## Teste de proficiência (`proficiency.json`)

**Atenção: o teste de proficiência desta trilha é de JavaScript, não de TypeScript.** Ele é o
portão de ENTRADA — cobre o axioma declarado acima (nome e valor, função com parâmetro e retorno,
array, objeto, classe, módulo, `async`/`await`) com enunciado em linguagem simples. Quem passa
destrava a trilha inteira; quem não passa recebe a lista dos conceitos que faltaram e o link para
`nodejs-do-zero`. Dificuldade 5, carência da 1ª estrela 120 s.

Um segundo teste, de SAÍDA, cobre a camada de tipos (anotação, união, estreitamento, interface,
genérico, utilitário) e é o que marca a trilha como concluída.

## Regras para os desafios de aula (`challenge.json`)

- `language: 'typescript'`; no `track.json`: `programmingLanguage: 'typescript'`,
  `runtime: 'node-24 + typescript-5.8.3'`, `harnessLanguage: 'typescript'`;
- layout: `solution.ts` na raiz e `test.ts` ao lado — **`.ts`, nunca `.mjs`**; o
  `SAFE_FILE_PATH_RE` da engine está travado em `\.mjs$` e precisa virar campo do adaptador;
- o teste importa com `from './solution.ts'` (extensão explícita) e usa `node:test` +
  `node:assert/strict`; roda com `node --test --test-reporter=spec test.ts`, **sem flag nenhuma** no
  Node 24 (medido);
- as **cinco** provas de §"A segunda decisão" — as quatro de execução mais `typesCheck` sobre a
  solução de referência, com `tsc --noEmit --strict`;
- `expectedTestCount` = nº de testes; 2–4 testes por desafio de aula;
- a função do desafio é derivada do slug (kebab → camelCase: `dobro-do-numero` → `dobroDoNumero`);
- toda aula cujo `targetAtom` é construção de tipo declara ≥1 `wrongSolutions[]` que **passa** no
  runtime e **falha** no `tsc`, com o código `TSxxxx` esperado;
- **cenário `error` só é exigível se `op:throw` e `api:assert.throws` estiverem no orçamento**
  (A11) — vindos do axioma JavaScript, o que nesta trilha é verdade desde a aula 1; ainda assim, um
  cenário de erro **de tipo** não é um cenário de execução e nunca deve ser escrito como tal: ele é
  um `wrongSolutions[]`;
- statement em markdown pt-BR, linguagem simples, terminando com o lembrete de ler o enunciado e
  clicar em "Começar";
- **proibições sempre**, em qualquer aula, starter, teste, teoria ou solução: `any`,
  `as unknown as`, `@ts-ignore`, `@ts-expect-error` — mais todas as proibições globais herdadas do
  JavaScript (`eval`, `new Function`, `with`, `arguments`, acesso computado não-literal).

## O que esta trilha exige da engine (resumo acionável)

Lista fechada do que precisa existir para esta especificação virar trilha, em ordem de dependência:

1. `programmingLanguage`/`runtime`/`harnessLanguage` no `track.json` e `language: 'typescript'` no
   `challenge.json` (research §6);
2. `SAFE_FILE_PATH_RE` e o `layout` como campos do adaptador — hoje `.mjs` está fixo;
3. `ExtractOptions.dialect: 'ts'` ligado (a costura **já existe** em `extract.ts` e não tem
   chamador);
4. as **catorze formas** novas em `form/rules.ts` (a bateria tem cinco hoje);
5. as **três chaves sintéticas** `node:KeyOfType`, `node:ReadonlyArrayType`,
   `node:TypeOnlyImport`/`node:TypeOnlyExport`;
6. o passe de globais do extrator resolvendo identificador também em posição de tipo
   (`global:Partial` e companhia);
7. o acréscimo à `HARNESS_RECEPTIVE_SEED` das chaves listadas em "A semente receptiva do harness
   TypeScript";
8. a quinta prova `typesCheck`, em spawn separado sob o mesmo semáforo de execução, aplicada só ao
   lado da solução;
9. o segundo canal de checks no veredito da UI.

Nada aqui exige dependência nova: `typescript@5.8.3` já é dependência direta de `app`, e o Node 24
roda `.ts` sem flag.
