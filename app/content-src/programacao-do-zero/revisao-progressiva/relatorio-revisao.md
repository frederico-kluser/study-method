# Revisão Progressiva — programacao-do-zero

- Orçamento: **declared** (mesma fonte do audit em modo declared — introduces do lesson.json)
- Convergência: **SIM** em **2** iteração(ões) (hash estável do relatório + válvula anti-loop)

## Placar

| Métrica | Valor |
|---|---|
| Aulas | 14 |
| Cobertas | 14 |
| Com lacuna (candidata a SPLIT) | 0 |
| Não-revisáveis (fail-closed) | 0 |
| Com excesso (ajuste) | 7 |
| Splits pendentes (minimalCode preservado) | 0 |

## Aula 1 — fundamentos-js/como-o-site-confere-seu-codigo (Como o site confere seu código)

**Decisão: COBERTA**

> aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.

**Memória vigente nesta revisão** — aula anterior: `(nenhuma)`; lacunas já vistas: (nenhuma).

### Desafios

- **digite-o-numero-7** — ok — mínimo com 4 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:NumericLiteral`, `node:ReturnStatement`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 2 — fundamentos-js/valor-e-instrucao (O que é um valor e uma instrução)

**Decisão: COBERTA**

> aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/como-o-site-confere-seu-codigo`; lacunas já vistas: (nenhuma).

### Desafios

- **digite-outro-numero** — ok — mínimo com 4 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:NumericLiteral`, `node:ReturnStatement`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 3 — fundamentos-js/funcao-e-chamada (Função e chamada)

**Decisão: COBERTA**

> aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/valor-e-instrucao`; lacunas já vistas: (nenhuma).

### Desafios

- **chamar-a-caixa** — ok — mínimo com 9 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:NumericLiteral`, `node:ReturnStatement`
  - **EXCESSO** (aula ensina, teste não cobra): `node:CallExpression`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 4 — fundamentos-js/export-entrega (export: a entrega ao conferidor)

**Decisão: COBERTA**

> aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/funcao-e-chamada`; lacunas já vistas: (nenhuma).

### Desafios

- **entregar-a-caixa** — ok — mínimo com 5 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:NumericLiteral`, `node:ReturnStatement`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 5 — fundamentos-js/parametro-e-argumento (Parâmetro e argumento)

**Decisão: COBERTA**

> aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/export-entrega`; lacunas já vistas: (nenhuma).

### Desafios

- **eco-com-parametro** — ok — mínimo com 4 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:Parameter`, `node:ReturnStatement`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 6 — fundamentos-js/return (return: a linha que entrega e encerra)

**Decisão: COBERTA**

> aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/parametro-e-argumento`; lacunas já vistas: (nenhuma).

### Desafios

- **eco-escreve-o-return** — ok — mínimo com 4 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:Parameter`, `node:ReturnStatement`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 7 — fundamentos-js/let-e-atribuicao (let e atribuição: a caixa que guarda)

**Decisão: COBERTA**

> aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/return`; lacunas já vistas: (nenhuma).

### Desafios

- **contador-com-let** — ok — mínimo com 4 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:NumericLiteral`, `node:ReturnStatement`
  - **EXCESSO** (aula ensina, teste não cobra): `decl:let`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 8 — fundamentos-js/string-como-valor (Texto também é valor: a string)

**Decisão: COBERTA**

> aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/let-e-atribuicao`; lacunas já vistas: (nenhuma).

### Desafios

- **saudacao-com-string** — ok — mínimo com 4 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:ReturnStatement`, `node:StringLiteral`
  - **EXCESSO** (aula ensina, teste não cobra): `decl:let`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 9 — fundamentos-js/estado-ler-depois-de-escrever (Estado: ler depois de escrever)

**Decisão: COBERTA**

> aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/string-como-valor`; lacunas já vistas: (nenhuma).

### Desafios

- **qual-e-o-ultimo-valor** — ok — mínimo com 4 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:NumericLiteral`, `node:ReturnStatement`
  - **EXCESSO** (aula ensina, teste não cobra): `decl:let`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 10 — fundamentos-js/const (const: o valor que não muda)

**Decisão: COBERTA**

> aula coberta pelo teste. EXCESSO (2 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/estado-ler-depois-de-escrever`; lacunas já vistas: (nenhuma).

### Desafios

- **const-fixa-e-let-mutavel** — ok — mínimo com 4 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:NumericLiteral`, `node:ReturnStatement`
  - **EXCESSO** (aula ensina, teste não cobra): `decl:const`, `decl:let`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 11 — fundamentos-js/erro-sintaxe-vs-erro-valor (Erro de sintaxe vs. erro de valor)

**Decisão: COBERTA**

> aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/const`; lacunas já vistas: (nenhuma).

### Desafios

- **leia-a-mensagem-do-conferidor** — ok — mínimo com 4 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:NumericLiteral`, `node:ReturnStatement`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 12 — fundamentos-js/involucro-completo (Montar o invólucro inteiro)

**Decisão: COBERTA**

> aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/erro-sintaxe-vs-erro-valor`; lacunas já vistas: (nenhuma).

### Desafios

- **montar-conferir** — ok — mínimo com 3 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:NumericLiteral`, `node:ReturnStatement`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 13 — fundamentos-js/nomear-bem (Dar nome às coisas)

**Decisão: COBERTA**

> aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/involucro-completo`; lacunas já vistas: (nenhuma).

### Desafios

- **const-fruta** — ok — mínimo com 4 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:ReturnStatement`, `node:StringLiteral`
  - **EXCESSO** (aula ensina, teste não cobra): `decl:const`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 14 — fundamentos-js/todas-as-pecas-juntas (Todas as peças juntas)

**Decisão: COBERTA**

> aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).

**Memória vigente nesta revisão** — aula anterior: `fundamentos-js/nomear-bem`; lacunas já vistas: (nenhuma).

### Desafios

- **frase-completa** — ok — mínimo com 3 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `node:Block`, `node:EndOfFileToken`, `node:ExportKeyword`, `node:FunctionDeclaration`, `node:Identifier`, `node:ReturnStatement`, `node:StringLiteral`
  - **EXCESSO** (aula ensina, teste não cobra): `decl:const`
  - Sinal secundário (bijeção requirements × test): OK

## Memória final (progressividade — o que foi aprendido e reavaliado)

- Última aula revisada: `fundamentos-js/todas-as-pecas-juntas`
- Lacunas vistas no curso: (nenhuma)
- Decisões: 14
  - [ok] fundamentos-js/como-o-site-confere-seu-codigo: aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.
  - [ok] fundamentos-js/valor-e-instrucao: aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.
  - [ok] fundamentos-js/funcao-e-chamada: aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).
  - [ok] fundamentos-js/export-entrega: aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.
  - [ok] fundamentos-js/parametro-e-argumento: aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.
  - [ok] fundamentos-js/return: aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.
  - [ok] fundamentos-js/let-e-atribuicao: aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).
  - [ok] fundamentos-js/string-como-valor: aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).
  - [ok] fundamentos-js/estado-ler-depois-de-escrever: aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).
  - [ok] fundamentos-js/const: aula coberta pelo teste. EXCESSO (2 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).
  - [ok] fundamentos-js/erro-sintaxe-vs-erro-valor: aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.
  - [ok] fundamentos-js/involucro-completo: aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.
  - [ok] fundamentos-js/nomear-bem: aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).
  - [ok] fundamentos-js/todas-as-pecas-juntas: aula coberta pelo teste. EXCESSO (1 átomo(s) de introduces.productive não usados pelo mínimo): candidato a REMOVER do introduces OU COBRIR com desafio — decisão de ajuste, não violação (excesso receptivo é by-design).
