# Revisão Progressiva — python-iniciante

- Orçamento: **declared** (mesma fonte do audit em modo declared — introduces do lesson.json)
- Convergência: **SIM** em **2** iteração(ões) (hash estável do relatório + válvula anti-loop)

## Placar

| Métrica | Valor |
|---|---|
| Aulas | 2 |
| Cobertas | 2 |
| Com lacuna (candidata a SPLIT) | 0 |
| Não-revisáveis (fail-closed) | 0 |
| Com excesso (ajuste) | 0 |
| Splits pendentes (minimalCode preservado) | 0 |

## Aula 1 — a-tela/a-primeira-linha (A primeira linha)

**Decisão: COBERTA**

> aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.

**Memória vigente nesta revisão** — aula anterior: `(nenhuma)`; lacunas já vistas: (nenhuma).

### Desafios

- **escreva-oi** — ok — mínimo com 2 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `global:print`, `node:Call`, `node:Expr`, `node:Load`, `node:Name`, `node:StrLiteral`
  - Sinal secundário (bijeção requirements × test): OK

## Aula 2 — a-tela/mais-de-uma-linha (Mais de uma linha)

**Decisão: COBERTA**

> aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.

**Memória vigente nesta revisão** — aula anterior: `a-tela/a-primeira-linha`; lacunas já vistas: (nenhuma).

### Desafios

- **duas-saudacoes** — ok — mínimo com 2 linha(s), provas válidas
  - Átomos cobrados pelo teste (`atoms` do mínimo): `global:print`, `node:Call`, `node:Expr`, `node:Load`, `node:Name`, `node:StrLiteral`
  - Sinal secundário (bijeção requirements × test): OK

## Memória final (progressividade — o que foi aprendido e reavaliado)

- Última aula revisada: `a-tela/mais-de-uma-linha`
- Lacunas vistas no curso: (nenhuma)
- Decisões: 2
  - [ok] a-tela/a-primeira-linha: aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.
  - [ok] a-tela/mais-de-uma-linha: aula coberta: todo o mínimo que o teste cobra está no orçamento da aula.
