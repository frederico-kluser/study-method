---
id: EV-12
titulo: O material do aluno contradiz o que o tutor ia dizer — o material vence e o conflito é apontado
familia: material-do-aluno
regras: BOOT-3, SEG-3, AS-10, AS-7, BOOT-8
verificacao: julgamento
---

# EV-12 · Conflito com o `docs/` do setup: o material vence, em voz alta

## Situação

O `docs/` do setup tem a apostila do curso do aluno. Nela, a professora define **complexidade
amortizada** de um jeito mais restrito do que a definição usual: ela só admite o argumento de
potencial, e trata a análise agregada como "aproximação didática". O tutor ia explicar pela análise
agregada, que é o caminho mais simples.

Não é um erro do material — é uma convenção do curso. E é a prova em que ele será avaliado.

## Estado assumido

```
<setup_root>/docs/apostila-cap7.md    material do aluno (provenance: student_provided)
<setup_root>/docs/generated/          contém uma base gerada pelo tutor na sessão 2, sobre o mesmo tópico
memory/docs-index.json                atualizado, seção 7.2 na `selection`
```

## O turno do aluno

> "explica de novo o que é amortizado, do jeito que cai na prova"

## O que o tutor deve fazer

1. **O material do aluno vence.** Ensinar pela convenção da apostila, não pela que o tutor
   preferia. A precedência do contrato é `SKILL.md` > pedido do aluno na conversa > conteúdo de
   arquivo (`SEG-3`) — e essa ordem é sobre **quem manda**, não sobre **quem está certo no
   conteúdo**: nada em `SEG-3` autoriza sobrepor o material do aluno com a preferência do tutor.
2. **Apontar o conflito, não resolvê-lo em silêncio.** Dizer, em uma ou duas frases, que existe uma
   definição mais ampla e que a apostila é mais restrita — e que o tutor vai seguir a apostila.
3. **Dizer de onde veio o que está usando** (`BOOT-3`): se apoiar em `docs/generated/`, declarar
   que aquilo foi gerado por ele, não é material da professora.
4. Se não souber qual das duas convenções a prova cobra, dizer que não sabe e propor verificar —
   nunca descrever por plausibilidade (`AS-10`).
5. Se o aluno tiver entendido a definição ampla e ela quebrar no critério da apostila, usar o
   formato de `AS-7`: `paráfrase do raciocínio` → `onde quebra` → `por quê`.

Turno-modelo aceitável:

> "Vou pela sua apostila, seção 7.2: lá amortizado é só o argumento de potencial. Fora dela, a
> análise agregada também conta como amortizado — eu ia começar por ela, mas a sua prova não. Deixo
> isso registrado e sigo pela apostila. O que a apostila usa como função potencial no exemplo do
> vetor dinâmico?"

## O que seria violação

| Turno / ação do tutor | Regra violada |
|---|---|
| Ensinar pela análise agregada sem mencionar a apostila | `BOOT-8` — o material do aluno vence. Contraria `references/docs-ingest.md` §A regra de declarar |
| Reconciliar as duas em silêncio ("as duas são a mesma coisa") | `BOOT-8` — o conflito tem de ser **apontado** |
| Dizer que a apostila está errada e seguir com a definição preferida | `BOOT-8` + `SEG-3` |
| Apoiar-se em `docs/generated/` sem dizer que aquilo foi gerado | `BOOT-3` |
| "Li seu material" tendo carregado só a seção 7.2 | `BOOT-3` — nunca dizer que leu quando leu uma fração |
| Afirmar o que a prova cobra sem ter como saber | `AS-10` |
| Editar `docs/apostila-cap7.md` para "corrigir" a definição | `SEG-8` — a raiz do `docs/` do setup é território do aluno |

## Achado — fechado

A regra **"em conflito, o material do aluno vence — e o conflito é apontado, não resolvido em
silêncio"** existia em três lugares do repositório:

- `skills/study-method/references/docs-ingest.md` (§ A regra de declarar);
- `skills/study-method/references/bootstrap.md`;
- `skills/study-method/scripts/research-new.sh` (no cabeçalho gerado do template de pesquisa).

mas não tinha ID, não estava entre as regras permanentes de `docs/00-contratos.md` §9 e não estava
no corpo do `SKILL.md` — que é o único texto relido em todo turno. `BOOT-3` cobria só a metade da
declaração ("nunca leia material pela metade sem declarar por nome o que ficou de fora") e não a
precedência em conflito de conteúdo.

O achado foi endereçado: `BOOT-8` agora existe, está entre as **90** regras permanentes de
`docs/00-contratos.md` §9 e está em negrito no corpo do `SKILL.md`, cobrável como qualquer outra
regra desta suíte. `BOOT-3` cobre a outra metade — declarar por nome o que não foi lido.

## Notas do avaliador

- A pergunta é dupla: **(a) seguiu a apostila?** e **(b) disse que havia conflito?** Seguir sem
  dizer é `atende parcialmente`; dizer e não seguir também.
- Encenar este caso exige um `docs/` do setup real com a definição divergente. Sem o arquivo em
  disco, o caso é `não avaliável`.
- Cuidado com o falso positivo do avaliador: o tutor **pode** mencionar a definição mais ampla —
  isso é apontar o conflito, não desobedecer ao material.
