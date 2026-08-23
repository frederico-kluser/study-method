---
id: EV-11
titulo: Já existe setup — a skill NÃO pergunta se cria, abre e continua
familia: bootstrap
regras: BOOT-4, BOOT-6, MEM-1, C-1
verificacao: assistida
---

# EV-11 · O ramo condicional que não roda

Este é o par simétrico de `EV-10`, e é o **erro mais caro possível** segundo o próprio `SKILL.md`:
ler os nove passos como uma fila obrigatória faz a skill perguntar "quer criar um setup?" em toda
sessão — o oposto do que o aluno pediu.

## Situação

Retomada normal. O usuário invoca a skill de dentro de um setup existente e válido, com memória de
três sessões anteriores.

## Estado assumido

```
$PWD/setup.json      existe e parseia
$PWD/memory/         existe, com INDEX.json e 3 sessões
$PWD/docs/           existe, e memory/docs-index.json está atualizado (nada mudou de tamanho/mtime)
$PWD/README.md       existe
registry: 1 entrada active, apontando para $PWD
digest: última sessão fechou com pendência "voltar ao caso base da recursão"
```

Nesse estado, **`setup_interview` não roda** (a guarda é falsa) e **`load_docs` não roda** (o cache
está válido). O fluxo é `bootstrap` → `load_memory` → `open_session` → `plan_lesson` → `teach`.

## O turno do aluno

> "vamos continuar de onde paramos"

## O que o tutor deve fazer

1. **Não perguntar nada sobre criar setup** (`BOOT-4`). Nem uma linha do `setup_interview`.
2. Anunciar em **uma linha**, não em relatório de status (`BOOT-6`).
3. Ter lido o digest e o perfil antes de abrir a aula (`MEM-1`): `proficiency_state`,
   `what_worked`, `what_didnt_work`, analogias e fronteiras já declaradas, `recent_affect`,
   pendências.
4. Abrir em ≤4 linhas, na ordem de `C-1`: onde paramos · **uma pergunta de recuperação** · o que
   faremos hoje. Então **parar e esperar**.
5. Não anunciar ingestão de material quando não houve ingestão — `load_docs` não rodou.

Turno-modelo aceitável:

> "Da última vez você fechou o caso base da recursão sozinho. Sem olhar o código: o que acontece se
> `fatorial` receber 0? Hoje eu queria levar isso para a pilha de chamadas."

## O que seria violação

| Turno do tutor | Regra violada |
|---|---|
| "Quer que eu crie um setup de estudo?" | `BOOT-4` — o ramo condicional rodou com a guarda falsa |
| "Não encontrei um setup, posso criar um em `$PWD`?" (com `setup.json` ao lado) | `BOOT-4` |
| Relatório de abertura listando setup, sessões, arquivos lidos e próximos passos | `BOOT-6` + `C-2` |
| "Li seu material: 4 arquivos, 31 KB." quando `load_docs` não rodou | `BOOT-3` — declaração de leitura que não houve |
| Abrir com um **resumo** do que já foi ensinado, em vez da pergunta de recuperação | `C-1` |
| Abrir com pergunta de recuperação **e** já responder | `C-3` + `C-4` |
| Abertura com 9 linhas | `C-1` + `C-2` |
| Ignorar a pendência registrada e propor um tópico novo sem mencioná-la | `MEM-1` |

## Padrões verificáveis por texto

Em `patterns.tsv`, `case_id = EV-11`: `deny`/`dura` para a oferta de criação de setup
("quer que eu crie", "posso criar um setup", "não encontrei nenhum setup"); `require`/`sinal` para
a presença de um `?` na abertura (a pergunta de recuperação de `C-1`).

## Notas do avaliador

- Conte as linhas da abertura. Mais de 4 é `viola` em `C-1`, mesmo que o conteúdo esteja certo.
- A pergunta de recuperação precisa ser **sobre a sessão anterior**, não sobre o tópico de hoje.
  "O que você lembra de recursão?" é genérica demais para atender `C-1`; a regra pede recuperação
  do que **ficou pendente**.
- Se a skill perguntar sobre criar setup mesmo uma vez, o caso é `viola` — não há gradação aqui.
