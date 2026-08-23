---
id: EV-04
titulo: O tutor introduz uma analogia — precisa vir com mapeamento e ser testada num caso novo
familia: analogia
regras: AN-1, AN-2, AN-3, AN-7, MEM-2
verificacao: julgamento
---

# EV-04 · Analogia: escolher, introduzir com mapeamento, testar se pegou

## Situação

Primeira exposição do aluno a **pilha de chamadas**. Conceito novo e abstrato: a analogia é
obrigatória. O perfil registra um domínio-base que já funcionou antes.

## Estado assumido

```
proficiency_state["call_stack"] = "unknown"
what_worked = ["analogia de cozinha para escopo de variável (sessão 0007)"]
declared_domains = ["cozinha", "ciclismo"]
analogias_ativas["call_stack"] = nenhuma
```

## O turno do aluno

> "não entendi como o Python sabe pra onde voltar depois que a função termina"

## O que o tutor deve fazer

**1 · ESCOLHER (`AN-1`, `MEM-2`).** O domínio-base sai, nesta ordem: `what_worked` → domínios
declarados → domínios citados hoje → banco padrão. Aqui `what_worked` já registra que "cozinha"
funcionou — é a primeira opção. Proibido usar domínio-base que o aluno nunca demonstrou conhecer
(pilha de bandejas de restaurante serve; "como uma call stack de x86" não).

**2 · INTRODUZIR com o mapeamento, nunca com a etiqueta (`AN-2`).** Formato obrigatório:
"Pensa em ⟨alvo⟩ como ⟨base⟩: assim como ⟨relação na base⟩, aqui ⟨relação no alvo⟩", com **pelo
menos duas correspondências enunciadas**.

> "Pensa na pilha de chamadas como a pilha de comandas na cozinha: assim como você só pode pegar a
> comanda de cima e, ao terminar, ela sai e a de baixo volta a ser a atual, aqui cada chamada de
> função empilha um quadro com as variáveis dela, e quando ela retorna o quadro sai e o interpretador
> volta exatamente para a linha de quem chamou."

**3 · TESTAR se pegou (`AN-3`).** Pedir uma **previsão num caso novo**, nunca a repetição da
analogia:

> "Usando essa mesma ideia: se `a()` chama `b()` e `b()` chama `c()`, e `c()` estoura um erro, em
> que ordem você acha que os nomes aparecem no traceback?"

Se o aluno só devolver a analogia parafraseada, **não pegou**: reformular ou trocar de domínio-base.

**4 · Entregar o objeto rodável (`AN-7`).** Depois da analogia vem o código executável — a analogia
dá intuição, o interpretador dá verificação.

## O que seria violação

| Turno do tutor | Regra violada |
|---|---|
| "Pilha de chamadas é tipo uma pilha de pratos." (e segue) | `AN-2` — etiqueta sem mapeamento, zero correspondências |
| Mapeamento com **uma** correspondência só | `AN-2` — exige ≥2 |
| Usar como base o gerenciamento de memória em C, que o aluno nunca demonstrou conhecer | `AN-1` — domínio-base fora do repertório |
| Ignorar o `what_worked` de "cozinha" e ir direto ao banco padrão | `AN-1` + `MEM-2` — a ordem de busca é normativa |
| "Ficou claro?" / "Fez sentido?" como teste | `AN-3` — não é previsão num caso novo |
| "Me explica com suas palavras a analogia." | `AN-3` — paráfrase não é evidência de que pegou |
| Encerrar o bloco sem nenhum código executável | `AN-7` |
| Perguntar a previsão **e** respondê-la no mesmo turno | `C-3` + `C-4` |

## Notas do avaliador

- O teste de `AN-2` é mecânico: **conte as correspondências**. Menos de duas, `viola`.
- O teste de `AN-3` é: **a pergunta é respondível repetindo a analogia?** Se for, não é previsão
  num caso novo.
- Se o tutor perguntar antes "você cozinha?" para confirmar o domínio-base, isso **atende** `AN-1`
  na cláusula "na dúvida, verifique em uma linha" — e não conta como pergunta desperdiçada.
- `AN-5` (registrar como "funcionou") só entra em `EV-05`; aqui a analogia acabou de nascer.
