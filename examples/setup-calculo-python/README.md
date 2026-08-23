# Cálculo em Python

> No de grafo de conhecimento do study-method. As secoes entre os
> marcadores `<!-- study-method:begin ... -->` sao regeneradas por
> `readme-sync.sh`. Tudo que estiver fora deles e seu e nunca e reescrito.

## Identidade

<!-- study-method:begin identidade -->
| campo | valor |
|---|---|
| setup_id | 1a4cb04a8753 |
| setup_name | calculo-python |
| title | Cálculo em Python |
| subject | calculo_diferencial |
| linguagem | python |
| criado em | 2026-07-06 |
| sessoes abertas | 5 |
<!-- study-method:end identidade -->

## Taxonomia e proficiencia

<!-- study-method:begin taxonomia -->
- `calculo_diferencial` · sem registro
- `limites` · sem registro
- `derivadas` · sem registro
- `derivada_como_taxa` · `fragile`
- `regra_da_potencia` · `mastered`
- `regra_da_cadeia` · `unknown`
- `derivada_numerica` · `fragile`
- `erro_numerico` · `unknown`
<!-- study-method:end taxonomia -->

## Base teorica

<!-- study-method:begin base-teorica -->
| arquivo | topicos que sustenta | resumo |
|---|---|---|
| `apostila-derivadas.md` | Anotações da apostila — capítulo 3: derivadas, 3.1 Taxa de variação média, 3.2 Derivada, 3.3 Regra da potência | Anotações da apostila — capítulo 3: derivadas |
<!-- study-method:end base-teorica -->

## Destilados

<!-- study-method:begin destilados -->
| arquivo | topico | status |
|---|---|---|
| `researchs/0001.md` | derivada-definicao | active |
| `researchs/0002.md` | derivada-numerica-erro | active |
<!-- study-method:end destilados -->

## Desafios

<!-- study-method:begin desafios -->
| desafio | conceito | status |
|---|---|---|
| `challenges/0001-derivada-numerica/` | derivada_numerica, derivada_como_taxa, regra_da_potencia, erro_numerico | `draft` |
<!-- study-method:end desafios -->

## Linha do tempo

<!-- study-method:begin linha-do-tempo -->
5 sessoes registradas · periodo: 2026-07-06 a 2026-08-22

- `0001` (2026-07-06) — Chegou à derivada como inclinação pelo zoom no gráfico; a definição formal veio cedo demais e atrapalhou.
- `0002` (2026-07-13) — Escreveu a taxa média em Python; a autópsia do TypeError ensinou mais que a dica que veio antes dela.
- `0003` (2026-07-21) — Viu o erro subir de novo abaixo de 1e-11 e explicou como cansaço do computador; a causa real ficou para a próxima.
- `0004` (2026-08-04) — Passou no desafio 0001 com três degraus de dica; ainda acha que Decimal faz o cancelamento sumir.
- `0005` (2026-08-22) — Leu a regra da potência no padrão numérico e previu x**5 antes de rodar; a regra da cadeia ficou só no exemplo conduzido.
<!-- study-method:end linha-do-tempo -->

## Pontes para outros setups

<!-- study-method:begin pontes -->
_Nenhuma ponte para outro setup ainda._

A ponte e unilateral: ela existe apenas aqui, no setup que leu.
<!-- study-method:end pontes -->

## Estado atual

<!-- study-method:begin estado-atual -->
- Solido: 1 de 5 conceitos em `mastered` — `regra_da_potencia`
- Em consolidacao: 2 em `fragile` — `derivada_como_taxa`, `derivada_numerica`
- Sem evidencia: 2 em `unknown` — `erro_numerico`, `regra_da_cadeia`
- Proxima revisao agendada: 2026-07-26
- Pendente: 6 fio(s) em aberto — Por que challenge-verify.sh reprovou o desafio 0001 no passo 0 com «build_command saiu 127», se um desafio em Python não tem etapa de build?

`unknown` quer dizer que nao ha registro de desafio, nao que o aluno nao sabe.
<!-- study-method:end estado-atual -->
