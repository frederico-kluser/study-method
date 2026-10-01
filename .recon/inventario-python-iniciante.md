# Inventário curricular — Python Iniciante: do primeiro print ao programa completo (`python-iniciante`)

> Gerado por leitura apenas de `app/resources/tracks/python-iniciante/` (nada foi alterado). 
> Ordem: módulos pela ordem de `track.json`, aulas pela ordem de `module.json → lessons`.
>
> **Legenda** — `introduces`: chaves copiadas tal como estão em `lesson.json`.
> `nº testes` = testes contados no `testsCode` do `challenge.json` (regra do curso: `def test_` em `testsCode`); não existem ficheiros `tests/test_solucao.py` em disco — os testes vivem no campo `testsCode`.
> `expectedTestCount` = valor declarado no `challenge.json`.
> Coluna `desafio`: `próprio` = `lessons/<aula>/challenges/<slug>/`; `módulo` = desafio de fecho do módulo; `—` = sem desafio.

## Totais do curso

| métrica | valor |
|---|---|
| módulos | 7 |
| aulas (ordem declarada) | 112 |
| lesson.json em disco | 112 |
| desafios de aula (próprios) | 112 |
| desafios de módulo (fecho) | 1 |
| aulas sem desafio algum | 0 |
| challenge.json em disco | 113 |
| testes contados / `expectedTestCount` somado | 271 / 271 |
| ocorrências de chaves `introduces` produtivas | 162 |
| ocorrências de chaves `introduces` receptivas | 0 |
| chaves produtivas distintas | 123 |
| introduces produtivas por aula (média / mediana / máx) | 1.45 / 1.0 / 3 |

## Módulo 1 — `a-tela` — A tela (20 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 1 | `a-primeira-linha` — A primeira linha *(regular)* | `global:print`, `node:Call`, `node:StrLiteral` | — | próprio `escreva-oi` | **REQ-1** `test_imprime_oi` — O programa deve imprimir exatamente "oi\n". | 1 | 1 |
| 2 | `mais-de-uma-linha` — Mais de uma linha *(consolidation)* | `global:print` | — | próprio `duas-saudacoes` | **REQ-1** `test_imprime_as_duas_saudacoes_na_ordem` — O programa deve imprimir exatamente "bom dia\nboa noite\n". | 1 | 1 |
| 3 | `numero-nao-tem-aspas` — Número não tem aspas *(regular)* | `node:IntLiteral` | — | próprio `imprima-o-doze` | **REQ-1** `test_imprime_doze` — O programa deve imprimir exatamente "12\n". | 1 | 1 |
| 4 | `somar` — Somar *(regular)* | `op:binary:+`, `node:BinOp` | — | próprio `some-dois-numeros` | **REQ-1** `test_imprime_a_soma` — O programa deve imprimir exatamente "6912\n". | 1 | 1 |
| 5 | `subtrair-e-multiplicar` — Subtrair e multiplicar *(regular)* | `op:binary:-`, `op:binary:*` | — | próprio `menos-e-vezes` | **REQ-1** `test_imprime_a_diferenca_e_o_produto` — O programa deve imprimir exatamente "3766\n5535\n". | 1 | 1 |
| 6 | `dividir-da-decimal` — Dividir dá decimal *(regular)* | `op:binary:/`, `node:FloatLiteral` | — | próprio `divida-e-some-decimais` | **REQ-1** `test_imprime_a_divisao_e_a_soma_decimal` — O programa deve imprimir exatamente "1080.25\n3.75\n". | 1 | 1 |
| 7 | `divisao-inteira-e-resto` — Divisão inteira e resto *(regular)* | `op:binary://`, `op:binary:%` | — | próprio `quantas-vezes-e-quanto-sobra` | **REQ-1** `test_imprime_quantas_vezes_cabe_e_o_resto` — O programa deve imprimir exatamente "1080\n1\n". | 1 | 1 |
| 8 | `potencia` — Potência *(regular)* | `op:binary:**` | — | próprio `dois-elevado-a-vinte` | **REQ-1** `test_imprime_dois_elevado_a_vinte` — O programa deve imprimir exatamente "1048576\n". | 1 | 1 |
| 9 | `o-sinal-do-numero` — O sinal do número *(regular)* | `op:unary:-`, `op:unary:+`, `node:UnaryOp` | — | próprio `numeros-com-sinal` | **REQ-1** `test_imprime_as_duas_contas_com_sinal` — O programa deve imprimir exatamente "-234\n-750\n". | 1 | 1 |
| 10 | `dar-nome-a-um-valor` — Dar nome a um valor *(regular)* | `decl:assign`, `node:Assign` | — | próprio `guarde-o-preco` | **REQ-1** `test_imprime_o_valor_guardado_no_nome` — O programa deve imprimir exatamente "1200\n". | 1 | 1 |
| 11 | `religar-o-mesmo-nome` — Religar o mesmo nome *(consolidation)* | `decl:assign` | — | próprio `some-quarenta-e-cinco-ao-preco` | **REQ-1** `test_imprime_o_preco_atualizado` — O programa deve imprimir exatamente "1245\n". | 1 | 1 |
| 12 | `juntar-textos` — Juntar textos *(consolidation)* | `op:binary:+` | — | próprio `monte-a-saudacao` | **REQ-1** `test_imprime_a_saudacao_montada` — O programa deve imprimir exatamente "oi, Ana\n". | 1 | 1 |
| 13 | `texto-com-buraco` — Texto com buraco *(regular)* | `node:JoinedStr`, `node:FormattedValue` | — | próprio `custa-quanto` | **REQ-1** `test_imprime_a_frase_com_o_valor_encaixado` — O programa deve imprimir exatamente "custa 1200 reais\n". | 1 | 1 |
| 14 | `de-texto-para-numero` — De texto para número *(regular)* | `global:int`, `global:str` | — | próprio `converta-nos-dois-sentidos` | **REQ-1** `test_imprime_a_soma_convertida_e_o_texto_colado` — O programa deve imprimir exatamente "75\ntotal: 8\n". | 1 | 1 |
| 15 | `arredondar` — Arredondar *(regular)* | `global:round`, `global:float` | — | próprio `duas-casas-e-um-decimal` | **REQ-1** `test_imprime_o_arredondamento_e_o_decimal` — O programa deve imprimir exatamente "617.29\n2.0\n". | 1 | 1 |
| 16 | `verdadeiro-e-falso` — Verdadeiro e falso *(regular)* | `node:BoolLiteral`, `global:bool` | — | próprio `verdadeiro-e-o-zero` | **REQ-1** `test_imprime_true_e_depois_false` — O programa deve imprimir exatamente "True\nFalse\n". | 1 | 1 |
| 17 | `o-nada` — O nada *(regular)* | `node:NoneLiteral` | — | próprio `o-nada-e-falso` | **REQ-1** `test_imprime_none_e_depois_false` — O programa deve imprimir exatamente "None\nFalse\n". | 1 | 1 |
| 18 | `o-tipo-de-cada-valor` — O tipo de cada valor *(regular)* | `global:type` | — | próprio `de-que-tipo-e-cada-um` | **REQ-1** `test_imprime_os_tres_tipos_na_ordem` — O programa deve imprimir exatamente "<class 'int'>\n<class 'str'>\n<class 'NoneType'>\n". | 1 | 1 |
| 19 | `a-linha-que-o-python-ignora` — A linha que o Python ignora *(consolidation)* | `global:print` | — | próprio `desligue-o-rascunho` | **REQ-1** `test_imprime_so_a_linha_que_sobrou` — O programa deve imprimir exatamente "rodou\n". | 1 | 1 |
| 20 | `quando-da-errado` — Quando dá errado *(consolidation)* | `decl:assign`, `node:JoinedStr` | — | próprio `conserte-o-nome-errado` | **REQ-1** `test_imprime_a_saudacao_depois_do_conserto` — O programa deve imprimir exatamente "oi, Ana\n". | 1 | 1 |

**Desafio de módulo (fecho):** `rachando-a-conta` — Rachando a conta · nº testes: 1 · expectedTestCount: 1
- **REQ-1** `test_imprime_o_recibo_completo` — O programa deve imprimir exatamente "RACHANDO A CONTA\nconsumo: 187.4\ngorjeta: 18.74\ntotal: 206.14\n4 pessoas pagam 51.54 cada\nem notas de 50: 5\n".

## Módulo 2 — `decisao` — Decisão (12 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 21 | `comparar-numeros` — Comparar números *(regular)* | `op:compare:>`, `op:compare:<`, `node:Compare` | — | próprio `tres-e-maior-que-dois` | **REQ-1** `test_imprime_as_respostas_das_duas_perguntas` — o programa diz se 3 e maior que 2 e se 3 e menor que 2 | 1 | 1 |
| 22 | `igual-e-diferente` — Igual e diferente *(regular)* | `op:compare:==`, `op:compare:!=`, `node:Compare` | — | próprio `e-igual-ou-diferente` | **REQ-1** `test_imprime_as_respostas_do_igual_e_do_diferente` — o programa diz se x e igual a 3 e se x e diferente de 3 | 1 | 1 |
| 23 | `maior-ou-igual` — Maior ou igual *(regular)* | `op:compare:>=`, `op:compare:<=`, `node:Compare` | — | próprio `quatro-e-maior-ou-igual` | **REQ-1** `test_imprime_as_respostas_do_maior_ou_igual_e_do_menor_ou_igual` — o programa diz se x e maior ou igual a 3 e se x e menor ou igual a 3 | 1 | 1 |
| 24 | `se` — Se *(regular)* | `node:If` | — | próprio `so-quando-for-positivo` | **REQ-1** `test_imprime_positivo_quando_x_e_maior_que_zero` — o programa imprime positivo quando x e maior que 0 | 1 | 1 |
| 25 | `o-bloco-vazio` — O bloco vazio *(regular)* | `node:Pass` | — | próprio `preencha-com-pass` | **REQ-1** `test_imprime_feito_depois_do_bloco_com_pass` — o programa imprime feito depois do bloco com pass | 1 | 1 |
| 26 | `se-senao` — Se... senão *(regular)* | `node:IfElse` | — | próprio `maior-ou-nao` | **REQ-1** `test_imprime_menor_ou_igual_quando_x_nao_e_maior_que_tres` — o programa imprime menor ou igual quando x nao e maior que 3 | 1 | 1 |
| 27 | `se-senao-se` — Se... senão se *(regular)* | `node:Elif` | — | próprio `positivo-negativo-ou-zero` | **REQ-1** `test_imprime_zero_quando_x_nao_e_nem_positivo_nem_negativo` — o programa imprime zero quando x nao e nem positivo nem negativo | 1 | 1 |
| 28 | `e-e-ou` — E e ou *(regular)* | `op:bool:and`, `op:bool:or`, `node:BoolOp` | — | próprio `os-dois-ou-pelo-menos-um` | **REQ-1** `test_imprime_os_dois_positivos_e_pelo_menos_um_positivo` — o programa mostra os dois positivos com and e pelo menos um positivo com or | 1 | 1 |
| 29 | `nao` — Não *(regular)* | `op:unary:not`, `node:UnaryOp` | — | próprio `quando-nao-achou` | **REQ-1** `test_imprime_continuar_procurando_quando_nao_achou` — o programa imprime continuar procurando quando nao achou | 1 | 1 |
| 30 | `condicao-em-uma-linha` — Condição em uma linha *(regular)* | `node:IfExp` | — | próprio `escolha-em-uma-linha` | **REQ-1** `test_imprime_o_valor_escolhido_pela_condicao` — o programa imprime o valor que a condicao escolheu para x | 1 | 1 |
| 31 | `e-mesmo-o-nada` — É mesmo o nada *(regular)* | `op:compare:is`, `node:Compare` | — | próprio `ainda-nao-tem-valor` | **REQ-1** `test_imprime_ainda_nao_tem_valor_quando_x_e_none` — o programa diz que x ainda nao tem valor quando x e None | 1 | 1 |
| 32 | `comparar-encadeado` — Comparar encadeado *(consolidation)* | `node:Compare` | — | próprio `dentro-do-intervalo` | **REQ-1** `test_imprime_dentro_quando_x_esta_entre_zero_e_dez` — o programa imprime dentro quando x esta entre 0 e 10 | 1 | 1 |

*Módulo sem desafio de fecho.*

## Módulo 3 — `repeticao` — Repetição (13 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 33 | `repetir-um-numero-de-vezes` — Repetir um número de vezes *(regular)* | `node:For`, `global:range` | — | próprio `conte-ate-tres` | **test_imprime_0_1_e_2** `test_imprime_0_1_e_2` — o programa imprime 0, 1 e 2, um numero por linha | 1 | 1 |
| 34 | `de-onde-ate-onde` — De onde até onde *(consolidation)* | `global:range` | — | próprio `os-impares-ate-nove` | **test_imprime_os_impares_ate_nove** `test_imprime_os_impares_ate_nove` — o programa imprime os impares de 1 a 9, um por linha | 1 | 1 |
| 35 | `acumular-num-nome` — Acumular num nome *(regular)* | `decl:aug`, `op:aug:+`, `node:AugAssign` | — | próprio `some-um-a-quatro` | **test_imprime_a_soma_de_um_a_quatro** `test_imprime_a_soma_de_um_a_quatro` — o programa imprime a soma de 1 a 4 | 1 | 1 |
| 36 | `tirar-e-multiplicar-no-lugar` — Tirar e multiplicar no lugar *(regular)* | `op:aug:-`, `op:aug:*` | — | próprio `o-saldo-do-lanche` | **test_imprime_o_saldo_depois_do_lanche** `test_imprime_o_saldo_depois_do_lanche` — o programa imprime o saldo depois do lanche e da dobrada | 1 | 1 |
| 37 | `dividir-no-lugar` — Dividir no lugar *(regular)* | `op:aug:/`, `op:aug://` | — | próprio `metade-de-cada-um` | **test_imprime_a_divisao_inteira_e_a_normal** `test_imprime_a_divisao_inteira_e_a_normal` — o programa imprime 25 // 4 e 5 / 2, um por linha | 1 | 1 |
| 38 | `resto-e-potencia-no-lugar` — Resto e potência no lugar *(regular)* | `op:aug:%`, `op:aug:**` | — | próprio `o-resto-que-vira-quadrado` | **test_imprime_o_resto_e_o_quadrado_do_resto** `test_imprime_o_resto_e_o_quadrado_do_resto` — o programa imprime o resto de 13 por 7 e o quadrado dele | 1 | 1 |
| 39 | `enquanto` — Enquanto *(regular)* | `node:While` | — | próprio `a-contagem-regressiva` | **test_imprime_a_contagem_regressiva** `test_imprime_a_contagem_regressiva` — o programa imprime 3, 2 e 1, um por linha | 1 | 1 |
| 40 | `parar-no-meio` — Parar no meio *(regular)* | `node:Break` | — | próprio `pare-antes-do-tres` | **test_imprime_1_e_2_e_para_no_3** `test_imprime_1_e_2_e_para_no_3` — o programa imprime 1 e 2 e para antes do 3 | 1 | 1 |
| 41 | `pular-uma-volta` — Pular uma volta *(regular)* | `node:Continue` | — | próprio `pule-o-numero-tres` | **test_imprime_0_1_2_4_e_5** `test_imprime_0_1_2_4_e_5` — o programa imprime de 0 a 5, menos o 3 | 1 | 1 |
| 42 | `o-laco-que-nao-acaba-sozinho` — O laço que não acaba sozinho *(consolidation)* | `node:While` | — | próprio `a-maquina-de-ecos` | **test_imprime_0_1_2_e_3** `test_imprime_0_1_2_e_3` — o programa imprime 0, 1, 2 e 3, um por linha | 1 | 1 |
| 43 | `laco-dentro-de-laco` — Laço dentro de laço *(consolidation)* | `node:For` | — | próprio `a-tabela-de-pares` | **test_imprime_a_tabela_de_pares** `test_imprime_a_tabela_de_pares` — o programa imprime os quatro pares de 0 e 1, um por linha | 1 | 1 |
| 44 | `e-se-nunca-parou` — E se nunca parou *(regular)* | `node:ForElse` | — | próprio `a-contagem-que-se-despede` | **test_imprime_a_contagem_e_o_fim** `test_imprime_a_contagem_e_o_fim` — o programa imprime 0, 1, 2 e o fim do else | 1 | 1 |
| 45 | `o-else-do-while` — O else do while *(regular)* | `node:WhileElse` | — | próprio `o-saldo-que-avisa-que-zerou` | **test_imprime_a_contagem_e_o_acabou** `test_imprime_a_contagem_e_o_acabou` — o programa imprime 3, 2, 1 e o acabou do else | 1 | 1 |

*Módulo sem desafio de fecho.*

## Módulo 4 — `caixas-que-devolvem` — Caixas que devolvem (14 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 46 | `escrever-a-primeira-caixa` — Escrever a primeira caixa *(regular)* | `node:FunctionDef` | — | próprio `a-primeira-caixa` | **test_cumprimenta_na_tela** `test_cumprimenta_na_tela` — a caixa bom_dia mostra bom dia na tela | 1 | 1 |
| 47 | `chamar-a-caixa-duas-vezes` — Chamar a caixa duas vezes *(consolidation)* | `node:Call` | — | próprio `duas-chamadas` | **test_imprime_duas_vezes** `test_imprime_duas_vezes` — o programa mostra bom dia duas vezes | 1 | 1 |
| 48 | `a-janela-de-entrada` — A janela de entrada *(consolidation)* | `node:arg` | — | próprio `cumprimente-alguem` | **test_cumprimenta_ana** `test_cumprimenta_ana` — a caixa saudacao mostra oi, Ana quando recebe Ana<br>**test_cumprimenta_bia** `test_cumprimenta_bia` — a caixa saudacao mostra oi, Bia quando recebe Bia | 2 | 2 |
| 49 | `devolver-em-vez-de-mostrar` — Devolver em vez de mostrar *(regular)* | `node:Return` | — | próprio `a-saudacao-devolvida` | **test_devolve_ana** `test_devolve_ana` — a caixa devolve oi, Ana quando recebe Ana<br>**test_devolve_bia** `test_devolve_bia` — a caixa devolve oi, Bia quando recebe Bia | 2 | 2 |
| 50 | `imprimir-nao-e-devolver` — Imprimir não é devolver *(consolidation)* | `node:Return`, `global:print` | — | próprio `devolver-e-imprimir` | **test_devolve_a_saudacao** `test_devolve_a_saudacao` — a caixa devolve a saudacao<br>**test_imprime_a_saudacao** `test_imprime_a_saudacao` — o programa imprime a saudacao<br>**test_chamar_sozinha_nao_imprime** `test_chamar_sozinha_nao_imprime` — chamar a caixa sozinha nao imprime nada | 3 | 3 |
| 51 | `a-caixa-que-nao-devolve-nada` — A caixa que não devolve nada *(consolidation)* | `node:NoneLiteral` | — | próprio `a-caixa-que-nao-responde` | **test_mostra_na_tela** `test_mostra_na_tela` — a caixa mostra oi, Ana na tela<br>**test_nao_devolve_nada** `test_nao_devolve_nada` — a caixa devolve None | 2 | 2 |
| 52 | `mais-de-uma-janela` — Mais de uma janela *(consolidation)* | `node:arg` | — | próprio `monte-a-soma` | **test_soma_dois_e_tres** `test_soma_dois_e_tres` — a caixa devolve 5 quando recebe 2 e 3<br>**test_soma_com_zero** `test_soma_com_zero` — a caixa devolve o mesmo numero quando recebe zero<br>**test_soma_de_negativos** `test_soma_de_negativos` — a caixa devolve 1 quando recebe -2 e 3 | 3 | 3 |
| 53 | `devolver-cedo` — Devolver cedo *(consolidation)* | `node:Return` | — | próprio `pode-ou-nao-pode` | **test_devolve_pode_para_dezoito** `test_devolve_pode_para_dezoito` — a caixa devolve pode para a idade 18<br>**test_devolve_nao_pode_para_dezessete** `test_devolve_nao_pode_para_dezessete` — a caixa devolve nao pode para a idade 17<br>**test_devolve_pode_para_quarenta** `test_devolve_pode_para_quarenta` — a caixa devolve pode para a idade 40 | 3 | 3 |
| 54 | `devolver-verdadeiro-ou-falso` — Devolver verdadeiro ou falso *(consolidation)* | `node:Return` | — | próprio `e-de-maior` | **test_devolve_true_para_vinte** `test_devolve_true_para_vinte` — a caixa devolve True para a idade 20<br>**test_devolve_false_para_quinze** `test_devolve_false_para_quinze` — a caixa devolve False para a idade 15<br>**test_devolve_true_para_dezoito** `test_devolve_true_para_dezoito` — a caixa devolve True para a idade 18 | 3 | 3 |
| 55 | `o-nome-so-vive-dentro` — O nome só vive dentro *(consolidation)* | `decl:assign` | — | próprio `calcule-o-total` | **test_calcula_cinco** `test_calcula_cinco` — a caixa devolve 15 quando recebe 5<br>**test_calcula_zero** `test_calcula_zero` — a caixa devolve 10 quando recebe 0<br>**test_calcula_cem** `test_calcula_cem` — a caixa devolve 110 quando recebe 100 | 3 | 3 |
| 56 | `uma-caixa-chama-outra` — Uma caixa chama outra *(consolidation)* | `node:Call` | — | próprio `o-dobro-mais-um` | **test_devolve_sete_para_tres** `test_devolve_sete_para_tres` — a caixa devolve 7 quando recebe 3<br>**test_devolve_um_para_zero** `test_devolve_um_para_zero` — a caixa devolve 1 quando recebe 0 | 2 | 2 |
| 57 | `a-caixa-sem-corpo` — A caixa sem corpo *(consolidation)* | `node:Pass` | — | próprio `a-caixa-em-branco` | **test_nao_faz_nada_por_enquanto** `test_nao_faz_nada_por_enquanto` — a caixa proximo_passo nao devolve nada | 1 | 1 |
| 58 | `documentar-a-caixa` — Documentar a caixa *(consolidation)* | `node:StrLiteral` | — | próprio `a-caixa-documentada` | **test_devolve_quatro_para_dois** `test_devolve_quatro_para_dois` — a caixa devolve 4 quando recebe 2<br>**test_devolve_dez_para_cinco** `test_devolve_dez_para_cinco` — a caixa devolve 10 quando recebe 5 | 2 | 2 |
| 59 | `conferir-a-premissa` — Conferir a premissa *(regular)* | `node:Assert` | — | próprio `a-premissa-conferida` | **test_devolve_oito_para_dez** `test_devolve_oito_para_dez` — a caixa devolve 8 quando recebe 10<br>**test_devolve_tres_para_cinco** `test_devolve_tres_para_cinco` — a caixa devolve 3 quando recebe 5 | 2 | 2 |

*Módulo sem desafio de fecho.*

## Módulo 5 — `listas-e-tuplas` — Listas e tuplas (22 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 60 | `criar-uma-lista` — Criar uma lista *(regular)* | `node:List` | — | próprio `minha-lista` | **test_devolve_7_8_9** `test_devolve_7_8_9` — minha_lista devolve a lista [7, 8, 9]<br>**test_devolve_1_2** `test_devolve_1_2` — outra_lista devolve a lista [1, 2] | 2 | 2 |
| 61 | `pegar-pela-posicao` — Pegar pela posição *(regular)* | `node:Subscript` | — | próprio `pegando-pela-posicao` | **test_pega_o_primeiro** `test_pega_o_primeiro` — pegar devolve o item da posicao 0<br>**test_pega_o_segundo** `test_pega_o_segundo` — pegar devolve o item da posicao 1<br>**test_pega_o_ultimo** `test_pega_o_ultimo` — pegar devolve o item da ultima posicao | 3 | 3 |
| 62 | `posicao-negativa` — Posição negativa *(consolidation)* | `node:Subscript` | — | próprio `pegando-de-tras-para-frente` | **test_devolve_o_ultimo** `test_devolve_o_ultimo` — ultimo devolve o ultimo item da lista<br>**test_ultimo_de_lista_de_um** `test_ultimo_de_lista_de_um` — ultimo de uma lista de um item devolve esse item<br>**test_devolve_o_penultimo** `test_devolve_o_penultimo` — penultimo devolve o penultimo item da lista | 3 | 3 |
| 63 | `quantos-itens-tem` — Quantos itens tem *(regular)* | `global:len` | — | próprio `contando-itens` | **test_conta_tres_itens** `test_conta_tres_itens` — quantos devolve 3 para uma lista de 3 itens<br>**test_conta_um_item** `test_conta_um_item` — quantos devolve 1 para uma lista de 1 item<br>**test_lista_vazia_tem_zero** `test_lista_vazia_tem_zero` — quantos devolve 0 para a lista vazia | 3 | 3 |
| 64 | `acrescentar-no-fim` — Acrescentar no fim *(regular)* | `api:.append`, `node:Attribute` | — | próprio `acrescente-um-item` | **test_adiciona_ao_fim** `test_adiciona_ao_fim` — adicionar poe o item no fim e devolve a lista<br>**test_adiciona_em_lista_vazia** `test_adiciona_em_lista_vazia` — adicionar funciona com a lista vazia<br>**test_muda_a_lista_original** `test_muda_a_lista_original` — a lista passada fica com o item novo | 3 | 3 |
| 65 | `tirar-um-item` — Tirar um item *(regular)* | `api:.pop`, `api:.remove` | — | próprio `tirando-itens` | **test_tira_o_ultimo** `test_tira_o_ultimo` — tirar_ultimo devolve o ultimo item<br>**test_tira_o_escolhido** `test_tira_o_escolhido` — tirar devolve a lista sem o item escolhido<br>**test_tira_o_primeiro_que_achar** `test_tira_o_primeiro_que_achar` — tirar remove so o primeiro item igual<br>**test_muda_a_lista** `test_muda_a_lista` — tirar muda a lista passada | 4 | 4 |
| 66 | `inserir-no-meio` — Inserir no meio *(regular)* | `api:.insert` | — | próprio `inserindo-no-meio` | **test_insere_no_meio** `test_insere_no_meio` — encaixar poe o item na posicao pedida<br>**test_insere_no_comeco** `test_insere_no_comeco` — encaixar na posicao 0 poe no comeco<br>**test_insere_na_lista_vazia** `test_insere_na_lista_vazia` — encaixar funciona com a lista vazia<br>**test_muda_a_lista_original** `test_muda_a_lista_original` — a lista passada fica com o item novo | 4 | 4 |
| 67 | `percorrer-uma-lista` — Percorrer uma lista *(consolidation)* | `node:For` | — | próprio `somando-a-lista` | **test_soma_tres_numeros** `test_soma_tres_numeros` — somar_lista devolve a soma dos itens<br>**test_soma_um_numero** `test_soma_um_numero` — somar_lista de um item devolve o proprio item<br>**test_lista_vazia_soma_zero** `test_lista_vazia_soma_zero` — somar_lista da lista vazia devolve 0 | 3 | 3 |
| 68 | `esta-na-lista` — Está na lista? *(regular)* | `op:compare:in` | — | próprio `o-item-esta-na-lista` | **test_item_que_esta** `test_item_que_esta` — tem devolve True quando o item esta na lista<br>**test_item_no_comeco** `test_item_no_comeco` — tem devolve True para o primeiro item<br>**test_item_que_nao_esta** `test_item_que_nao_esta` — tem devolve False quando o item nao esta na lista<br>**test_lista_vazia** `test_lista_vazia` — tem devolve False para a lista vazia | 4 | 4 |
| 69 | `achar-a-posicao` — Achar a posição *(regular)* | `api:.index`, `api:.count` | — | próprio `achando-a-posicao` | **test_posicao_do_item** `test_posicao_do_item` — posicao_de devolve a posicao do item<br>**test_posicao_do_primeiro** `test_posicao_do_primeiro` — posicao_de devolve a posicao do primeiro item<br>**test_conta_as_vezes** `test_conta_as_vezes` — quantas_vezes devolve quantas vezes o item aparece<br>**test_count_de_item_ausente** `test_count_de_item_ausente` — quantas_vezes devolve 0 para item que nao esta | 4 | 4 |
| 70 | `um-pedaco-da-lista` — Um pedaço da lista *(regular)* | `node:Slice` | — | próprio `fatie-um-pedaco` | **test_pega_o_meio** `test_pega_o_meio` — pedaco devolve do inicio ate um antes do fim<br>**test_pega_do_comeco** `test_pega_do_comeco` — pedaco com inicio 0 devolve do comeco<br>**test_pega_ate_o_fim** `test_pega_ate_o_fim` — pedaco com fim passando do tamanho vai ate o fim<br>**test_pedaco_vazio** `test_pedaco_vazio` — pedaco com inicio igual ao fim devolve lista vazia | 4 | 4 |
| 71 | `copiar-em-vez-de-apelidar` — Copiar em vez de apelidar *(consolidation)* | `node:Slice` | — | próprio `copie-a-lista` | **test_devolve_a_lista_inteira** `test_devolve_a_lista_inteira` — copia devolve a lista inteira numa lista nova<br>**test_mexer_na_copia_nao_muda_a_original** `test_mexer_na_copia_nao_muda_a_original` — mexer na lista devolvida nao muda a original | 2 | 2 |
| 72 | `ordenar` — Ordenar uma lista *(regular)* | `api:.sort`, `global:sorted` | — | próprio `ordene-a-lista` | **test_ordem_crescente_devolve_a_lista_em_ordem** `test_ordem_crescente_devolve_a_lista_em_ordem` — ordem_crescente devolve a lista em ordem crescente<br>**test_ordem_crescente_muda_a_lista_original** `test_ordem_crescente_muda_a_lista_original` — ordem_crescente muda a lista original no lugar<br>**test_em_ordem_nao_muda_a_lista_original** `test_em_ordem_nao_muda_a_lista_original` — em_ordem devolve outra lista e nao muda a original<br>**test_em_ordem_com_um_item_so** `test_em_ordem_com_um_item_so` — em_ordem com um item so devolve a lista igual | 4 | 4 |
| 73 | `inverter` — Inverter uma lista *(regular)* | `api:.reverse`, `global:reversed` | — | próprio `inverta-a-lista` | **test_inverter_na_hora_devolve_a_lista_invertida** `test_inverter_na_hora_devolve_a_lista_invertida` — inverter_na_hora devolve a lista invertida<br>**test_inverter_na_hora_muda_a_lista_original** `test_inverter_na_hora_muda_a_lista_original` — inverter_na_hora muda a lista original no lugar<br>**test_ao_contrario_devolve_invertida_sem_mudar** `test_ao_contrario_devolve_invertida_sem_mudar` — ao_contrario devolve a lista invertida e nao muda a original<br>**test_ao_contrario_com_um_item_so** `test_ao_contrario_com_um_item_so` — ao_contrario com um item so devolve a lista igual | 4 | 4 |
| 74 | `juntar-e-limpar` — Juntar e limpar listas *(regular)* | `api:.extend`, `api:.clear` | — | próprio `junte-e-esvazie` | **test_juntar_devolve_as_duas_listas** `test_juntar_devolve_as_duas_listas` — juntar devolve os itens das duas listas em uma so<br>**test_juntar_muda_a_primeira_lista** `test_juntar_muda_a_primeira_lista` — juntar coloca os itens novos na primeira lista<br>**test_esvaziar_devolve_lista_vazia** `test_esvaziar_devolve_lista_vazia` — esvaziar devolve uma lista vazia<br>**test_esvaziar_muda_a_lista** `test_esvaziar_muda_a_lista` — esvaziar tira todos os itens da lista original | 4 | 4 |
| 75 | `o-maior-e-o-menor` — O maior e o menor *(regular)* | `global:max`, `global:min` | — | próprio `qual-e-o-maior` | **test_o_maior_acha_o_numero_grande** `test_o_maior_acha_o_numero_grande` — o_maior devolve o maior numero da lista<br>**test_o_maior_com_um_item_so** `test_o_maior_com_um_item_so` — o_maior com uma lista de um item devolve esse item<br>**test_o_menor_acha_o_numero_pequeno** `test_o_menor_acha_o_numero_pequeno` — o_menor devolve o menor numero da lista<br>**test_o_menor_com_um_item_so** `test_o_menor_com_um_item_so` — o_menor com uma lista de um item devolve esse item | 4 | 4 |
| 76 | `somar-tudo` — Somar tudo *(regular)* | `global:sum` | — | próprio `some-a-lista` | **test_somar_tudo_soma_os_itens** `test_somar_tudo_soma_os_itens` — somar_tudo devolve a soma dos itens da lista<br>**test_somar_tudo_com_lista_vazia** `test_somar_tudo_com_lista_vazia` — somar_tudo com lista vazia devolve zero<br>**test_somar_tudo_com_um_item** `test_somar_tudo_com_um_item` — somar_tudo com um item devolve o proprio item | 3 | 3 |
| 77 | `com-o-indice-junto` — Com o índice junto *(regular)* | `global:enumerate` | — | próprio `numerar-itens` | **test_numerar_coloca_posicao_e_item** `test_numerar_coloca_posicao_e_item` — numerar devolve uma frase para cada item com a posicao dele<br>**test_numerar_com_uma_lista_vazia** `test_numerar_com_uma_lista_vazia` — numerar com lista vazia devolve lista vazia<br>**test_numerar_com_um_item** `test_numerar_com_um_item` — numerar com um item devolve a posicao zero | 3 | 3 |
| 78 | `duas-listas-lado-a-lado` — Duas listas lado a lado *(regular)* | `global:zip` | — | próprio `par-e-par` | **test_juntar_por_posicao_pareia_os_itens** `test_juntar_por_posicao_pareia_os_itens` — juntar_por_posicao devolve um nome completo para cada par<br>**test_juntar_por_posicao_com_uma_lista_so** `test_juntar_por_posicao_com_uma_lista_so` — juntar_por_posicao para no fim da lista mais curta<br>**test_juntar_por_posicao_com_listas_vazias** `test_juntar_por_posicao_com_listas_vazias` — juntar_por_posicao com duas listas vazias devolve lista vazia | 3 | 3 |
| 79 | `a-lista-que-nao-muda` — A lista que não muda *(regular)* | `node:Tuple` | — | próprio `uma-dupla-de-notas` | **test_par_de_notas_guarda_o_primeiro_valor** `test_par_de_notas_guarda_o_primeiro_valor` — par_de_notas guarda o primeiro valor no lugar zero<br>**test_par_de_notas_guarda_o_segundo_valor** `test_par_de_notas_guarda_o_segundo_valor` — par_de_notas guarda o segundo valor no lugar um<br>**test_par_de_notas_na_ordem_contraria** `test_par_de_notas_na_ordem_contraria` — par_de_notas devolve a ordem contraria quando recebe a ordem contraria | 3 | 3 |
| 80 | `abrir-a-tupla-em-nomes` — Abrir a tupla em nomes *(regular)* | `decl:unpack` | — | próprio `abrir-a-dupla` | **test_somar_dupla_soma_os_dois_itens** `test_somar_dupla_soma_os_dois_itens` — somar_dupla devolve a soma dos dois itens da tupla<br>**test_somar_dupla_com_outros_valores** `test_somar_dupla_com_outros_valores` — somar_dupla devolve a soma com outros valores<br>**test_somar_dupla_com_valores_iguais** `test_somar_dupla_com_valores_iguais` — somar_dupla devolve a soma de dois valores iguais | 3 | 3 |
| 81 | `lista-de-listas` — Lista de listas *(consolidation)* | `node:Subscript` | — | próprio `nota-da-tabela` | **test_nota_de_pega_a_nota_da_linha_e_coluna** `test_nota_de_pega_a_nota_da_linha_e_coluna` — nota_de devolve a nota na linha e na coluna pedidas<br>**test_nota_de_com_uma_linha_so** `test_nota_de_com_uma_linha_so` — nota_de com uma linha so usa a coluna dentro dela<br>**test_nota_de_com_outra_celula** `test_nota_de_com_outra_celula` — nota_de devolve a nota de outra celula da tabela | 3 | 3 |

*Módulo sem desafio de fecho.*

## Módulo 6 — `texto-em-profundidade` — Texto em profundidade (15 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 82 | `maiusculas-e-minusculas` — Maiúsculas e minúsculas *(regular)* | `api:.upper`, `api:.lower` | — | próprio `maiscula-ou-minuscula` | **test_maiusculas_deixa_tudo_grande** `test_maiusculas_deixa_tudo_grande` — maiusculas devolve o texto com letras grandes<br>**test_maiusculas_com_espaco** `test_maiusculas_com_espaco` — maiusculas devolve o texto com espaco em maiusculas<br>**test_minusculas_deixa_tudo_pequeno** `test_minusculas_deixa_tudo_pequeno` — minusculas devolve o texto com letras pequenas<br>**test_minusculas_com_numero** `test_minusculas_com_numero` — minusculas deixa o numero como esta | 4 | 4 |
| 83 | `tirar-os-espacos` — Tirar os espaços *(regular)* | `api:.strip` | — | próprio `sem-espacos-sobrando` | **test_tira_espacos_dos_dois_lados** `test_tira_espacos_dos_dois_lados` — limpar tira os espacos dos dois lados<br>**test_tira_espacos_do_comeco** `test_tira_espacos_do_comeco` — limpar tira os espacos do comeco<br>**test_tira_espacos_do_fim** `test_tira_espacos_do_fim` — limpar tira os espacos do fim<br>**test_espacos_do_meio_ficam** `test_espacos_do_meio_ficam` — limpar deixa os espacos do meio como estao<br>**test_texto_vazio_continua_vazio** `test_texto_vazio_continua_vazio` — limpar devolve o texto vazio como esta | 5 | 5 |
| 84 | `trocar-um-pedaco` — Trocar um pedaço *(regular)* | `api:.replace` | — | próprio `troque-o-pedaco` | **test_troca_todas_as_vezes** `test_troca_todas_as_vezes` — trocar devolve o texto com todas as vezes do pedaco trocadas<br>**test_troca_uma_vez_so** `test_troca_uma_vez_so` — trocar devolve o texto com uma unica troca<br>**test_sem_match_devolve_igual** `test_sem_match_devolve_igual` — trocar devolve o texto igual quando o pedaco nao existe<br>**test_pedaco_maior_que_uma_letra** `test_pedaco_maior_que_uma_letra` — trocar troca pedacos de mais de uma letra | 4 | 4 |
| 85 | `comeca-e-termina` — Começa e termina *(regular)* | `api:.startswith`, `api:.endswith` | — | próprio `como-comeca-e-como-termina` | **test_comeca_com_true** `test_comeca_com_true` — comeca_com devolve True quando o texto comeca com o pedaco<br>**test_comeca_com_false_mesmo_dentro** `test_comeca_com_false_mesmo_dentro` — comeca_com devolve False quando o pedaco esta so no meio<br>**test_termina_com_true** `test_termina_com_true` — termina_com devolve True quando o texto termina com o pedaco<br>**test_termina_com_false_mesmo_no_comeco** `test_termina_com_false_mesmo_no_comeco` — termina_com devolve False quando o pedaco esta so no comeco | 4 | 4 |
| 86 | `achar-no-texto` — Achar no texto *(regular)* | `api:.find` | — | próprio `onde-esta-o-pedaco` | **test_acha_no_meio** `test_acha_no_meio` — achar devolve a posicao do pedaco no meio do texto<br>**test_acha_no_comeco** `test_acha_no_comeco` — achar devolve a posicao do pedaco no comeco do texto<br>**test_acha_a_primeira_ocorrencia** `test_acha_a_primeira_ocorrencia` — achar devolve a primeira posicao onde o pedaco aparece<br>**test_nao_acha_devolve_menos_um** `test_nao_acha_devolve_menos_um` — achar devolve -1 quando o pedaco nao existe | 4 | 4 |
| 87 | `quebrar-em-lista` — Quebrar em lista *(regular)* | `api:.split`, `api:.splitlines` | — | próprio `quebre-em-pedacos` | **test_quebra_pela_virgula** `test_quebra_pela_virgula` — quebrar corta o texto em cada virgula<br>**test_quebra_pelo_espaco** `test_quebra_pelo_espaco` — quebrar corta o texto em cada espaco<br>**test_sem_separador_devolve_lista_com_um** `test_sem_separador_devolve_lista_com_um` — quebrar devolve o texto inteiro num item quando o separador nao existe<br>**test_texto_vazio_devolve_item_vazio** `test_texto_vazio_devolve_item_vazio` — quebrar devolve um item vazio para o texto vazio<br>**test_quebra_linhas** `test_quebra_linhas` — quebrar_linhas devolve uma lista com cada linha<br>**test_texto_vazio_sem_linhas** `test_texto_vazio_sem_linhas` — quebrar_linhas devolve lista vazia para o texto vazio | 6 | 6 |
| 88 | `juntar-numa-string` — Juntar numa string *(regular)* | `api:.join` | — | próprio `junte-com-um-separador` | **test_junta_com_virgula** `test_junta_com_virgula` — juntar devolve os itens colados com a virgula<br>**test_junta_com_espaco** `test_junta_com_espaco` — juntar devolve os itens colados com o espaco<br>**test_separador_vazio_cola_tudo** `test_separador_vazio_cola_tudo` — juntar cola os itens sem nada entre eles quando o separador e vazio<br>**test_um_item_so_sem_separador** `test_um_item_so_sem_separador` — juntar devolve o item sozinho quando a lista tem um item<br>**test_lista_vazia_devolve_vazio** `test_lista_vazia_devolve_vazio` — juntar devolve o texto vazio para a lista vazia | 5 | 5 |
| 89 | `o-texto-tem-posicao-tambem` — O texto tem posição também *(consolidation)* | `node:Subscript` | — | próprio `pegue-a-letra-da-posicao` | **test_pega_a_primeira_letra** `test_pega_a_primeira_letra` — pegar_letra devolve a letra da posicao 0<br>**test_pega_a_segunda_letra** `test_pega_a_segunda_letra` — pegar_letra devolve a letra da posicao 1<br>**test_pega_a_ultima_letra** `test_pega_a_ultima_letra` — pegar_letra devolve a letra da ultima posicao<br>**test_pega_em_palavra_curta** `test_pega_em_palavra_curta` — pegar_letra devolve a letra da ultima posicao de uma palavra curta | 4 | 4 |
| 90 | `fatiar-o-texto` — Fatiar o texto *(consolidation)* | `node:Slice` | — | próprio `fatia-o-texto` | **test_pega_do_meio** `test_pega_do_meio` — pedaco devolve o trecho do meio do texto<br>**test_pega_do_comeco** `test_pega_do_comeco` — pedaco devolve o trecho do comeco do texto<br>**test_pega_uma_letra_so** `test_pega_uma_letra_so` — pedaco devolve uma letra quando o trecho tem tamanho um<br>**test_ate_o_fim_sem_incluir_o_fim** `test_ate_o_fim_sem_incluir_o_fim` — pedaco devolve ate antes do fim pedido | 4 | 4 |
| 91 | `esta-no-texto` — Está no texto? *(consolidation)* | `op:compare:in` | — | próprio `o-pedaco-esta-no-texto` | **test_pedaco_esta_no_meio** `test_pedaco_esta_no_meio` — esta devolve True quando o pedaco esta no meio do texto<br>**test_pedaco_do_comeco_tambem_esta** `test_pedaco_do_comeco_tambem_esta` — esta devolve True quando o pedaco esta no comeco do texto<br>**test_pedaco_fora_devolve_false** `test_pedaco_fora_devolve_false` — esta devolve False quando o pedaco nao esta no texto<br>**test_pedaco_espalhado_devolve_false** `test_pedaco_espalhado_devolve_false` — esta devolve False quando as letras nao aparecem em ordem | 4 | 4 |
| 92 | `so-numeros-ou-so-letras` — Só números ou só letras *(regular)* | `api:.isdigit`, `api:.isalpha` | — | próprio `so-numero-ou-so-letra` | **test_numero_puro** `test_numero_puro` — so_numero devolve True para texto so de numeros<br>**test_numero_com_letra** `test_numero_com_letra` — so_numero devolve False quando tem letra no meio<br>**test_texto_vazio_nao_e_numero** `test_texto_vazio_nao_e_numero` — so_numero devolve False para o texto vazio<br>**test_letra_pura** `test_letra_pura` — so_letra devolve True para texto so de letras<br>**test_letra_com_numero** `test_letra_com_numero` — so_letra devolve False quando tem numero no meio<br>**test_texto_vazio_nao_e_letra** `test_texto_vazio_nao_e_letra` — so_letra devolve False para o texto vazio | 6 | 6 |
| 93 | `formatar-com-largura` — Formatar com largura *(consolidation)* | `node:FormattedValue` | — | próprio `alinhe-o-numero` | **test_preenche_a_esquerda_com_espacos** `test_preenche_a_esquerda_com_espacos` — formatar alinha o numero a direita em 8 posicoes<br>**test_fixa_duas_casas_decimais** `test_fixa_duas_casas_decimais` — formatar completa a segunda casa decimal<br>**test_numero_inteiro_tambem** `test_numero_inteiro_tambem` — formatar aceita numero inteiro e formata como decimal | 3 | 3 |
| 94 | `alinhar-e-preencher` — Alinhar e preencher *(regular)* | `api:.ljust`, `api:.zfill` | — | próprio `preencha-os-espacos` | **test_completa_com_espacos** `test_completa_com_espacos` — alinhar poe espacos a direita ate a largura<br>**test_um_espaco_so** `test_um_espaco_so` — alinhar poe um espaco quando falta uma posicao<br>**test_ja_cabe_nao_muda** `test_ja_cabe_nao_muda` — alinhar devolve o texto como esta quando ele ja cabe<br>**test_completa_com_zeros** `test_completa_com_zeros` — preencher poe zeros a esquerda ate a largura<br>**test_um_zero_so** `test_um_zero_so` — preencher poe um zero quando falta uma posicao<br>**test_ja_cabe_nao_poe_zero** `test_ja_cabe_nao_poe_zero` — preencher devolve o texto como esta quando ele ja cabe | 6 | 6 |
| 95 | `o-texto-nao-muda` — O texto não muda *(consolidation)* | `api:.replace` | — | próprio `troque-sem-apagar-o-original` | **test_devolve_o_texto_trocado** `test_devolve_o_texto_trocado` — trocar devolve o texto novo com o pedaco trocado<br>**test_sem_match_devolve_igual** `test_sem_match_devolve_igual` — trocar devolve o texto igual quando o pedaco nao existe<br>**test_o_texto_recebido_nao_muda** `test_o_texto_recebido_nao_muda` — trocar nao muda o texto que recebeu | 3 | 3 |
| 96 | `a-letra-e-um-numero` — A letra é um número *(regular)* | `global:ord`, `global:chr` | — | próprio `a-letra-vira-numero` | **test_a_maisculo_e_65** `test_a_maisculo_e_65` — codigo_da_letra devolve o numero do A maisculo<br>**test_a_minusculo_e_97** `test_a_minusculo_e_97` — codigo_da_letra devolve o numero do a minusculo<br>**test_65_e_o_a_maisculo** `test_65_e_o_a_maisculo` — letra_do_numero devolve o A maisculo para 65<br>**test_97_e_o_a_minusculo** `test_97_e_o_a_minusculo` — letra_do_numero devolve o a minusculo para 97 | 4 | 4 |

*Módulo sem desafio de fecho.*

## Módulo 7 — `dicionarios-e-conjuntos` — Dicionários e conjuntos (16 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 97 | `criar-um-dicionario` — Criar um dicionário *(regular)* | `node:Dict` | — | próprio `meu-primeiro-dicionario` | **test_anotacao_guarda_um_par** `test_anotacao_guarda_um_par` — anotacao devolve o dicionario com a chave nome valendo Ana<br>**test_vazia_nao_guarda_nada** `test_vazia_nao_guarda_nada` — vazia devolve o dicionario vazio<br>**test_cardapio_guarda_o_preco_do_pao** `test_cardapio_guarda_o_preco_do_pao` — cardapio devolve o dicionario com a chave pao valendo 4 | 3 | 3 |
| 98 | `pegar-pela-chave` — Pegar pela chave *(consolidation)* | `node:Subscript` | — | próprio `pegando-pela-chave` | **test_pega_o_valor_da_chave** `test_pega_o_valor_da_chave` — pegar devolve o valor guardado na chave pedida<br>**test_pega_outra_chave** `test_pega_outra_chave` — pegar devolve o valor de outra chave do mesmo dicionario<br>**test_pega_em_outro_dicionario** `test_pega_em_outro_dicionario` — pegar devolve o valor guardado em outro dicionario | 3 | 3 |
| 99 | `pegar-com-padrao` — Pegar com padrão *(regular)* | `api:.get` | — | próprio `pegando-com-padrao` | **test_pega_quando_a_chave_existe** `test_pega_quando_a_chave_existe` — pegar devolve o valor da chave quando ela existe<br>**test_devolve_o_padrao_sem_a_chave** `test_devolve_o_padrao_sem_a_chave` — pegar devolve o padrao quando a chave nao existe<br>**test_devolve_outro_padrao** `test_devolve_outro_padrao` — pegar devolve o padrao pedido em cada chamada<br>**test_chave_presente_ignora_o_padrao** `test_chave_presente_ignora_o_padrao` — pegar com chave presente nao usa o padrao | 4 | 4 |
| 100 | `guardar-uma-chave-nova` — Guardar uma chave nova *(consolidation)* | `decl:assign` | — | próprio `guardando-uma-chave-nova` | **test_guarda_a_chave_nova** `test_guarda_a_chave_nova` — guardar poe a chave nova no dicionario<br>**test_muda_o_valor_da_chave** `test_muda_o_valor_da_chave` — guardar troca o valor quando a chave ja existe<br>**test_guarda_em_dicionario_vazio** `test_guarda_em_dicionario_vazio` — guardar funciona com o dicionario vazio | 3 | 3 |
| 101 | `apagar-uma-chave` — Apagar uma chave *(regular)* | `node:Delete` | — | próprio `apagando-uma-chave` | **test_apaga_a_chave_pedida** `test_apaga_a_chave_pedida` — apagar tira a chave pedida do dicionario<br>**test_apaga_a_ultima_chave** `test_apaga_a_ultima_chave` — apagar funciona com a ultima chave<br>**test_apagar_esvazia_o_dicionario** `test_apagar_esvazia_o_dicionario` — apagar a unica chave esvazia o dicionario | 3 | 3 |
| 102 | `as-chaves-e-os-valores` — As chaves e os valores *(regular)* | `api:.keys`, `api:.values` | — | próprio `separando-chaves-e-valores` | **test_chaves_devolve_a_visao_das_chaves** `test_chaves_devolve_a_visao_das_chaves` — chaves devolve a visao das chaves do dicionario<br>**test_chaves_de_outro_dicionario** `test_chaves_de_outro_dicionario` — chaves funciona com outro dicionario<br>**test_valores_devolve_a_visao_dos_valores** `test_valores_devolve_a_visao_dos_valores` — valores devolve a visao dos valores guardados<br>**test_valores_de_outro_dicionario** `test_valores_de_outro_dicionario` — valores devolve a visao dos valores de outro dicionario | 4 | 4 |
| 103 | `chave-e-valor-juntos` — Chave e valor juntos *(regular)* | `api:.items` | — | próprio `os-pares-de-cada-chave` | **test_pares_devolve_os_pares** `test_pares_devolve_os_pares` — pares devolve um par por chave e valor<br>**test_pares_de_outro_dicionario** `test_pares_de_outro_dicionario` — pares devolve os pares de outro dicionario | 2 | 2 |
| 104 | `percorrer-um-dicionario` — Percorrer um dicionário *(consolidation)* | `node:For` | — | próprio `frases-do-dicionario` | **test_monta_uma_frase_por_par** `test_monta_uma_frase_por_par` — frases monta uma frase por par chave valor<br>**test_funciona_com_outro_dicionario** `test_funciona_com_outro_dicionario` — frases funciona com outro dicionario<br>**test_dicionario_vazio_da_lista_vazia** `test_dicionario_vazio_da_lista_vazia` — frases de um dicionario vazio devolve a lista vazia | 3 | 3 |
| 105 | `a-chave-existe` — A chave existe? *(consolidation)* | `op:compare:in` | — | próprio `a-chave-tem-dono` | **test_chave_que_esta** `test_chave_que_esta` — tem_chave devolve True quando a chave esta<br>**test_primeira_chave** `test_primeira_chave` — tem_chave devolve True para a primeira chave<br>**test_chave_que_nao_esta** `test_chave_que_nao_esta` — tem_chave devolve False quando a chave nao esta<br>**test_dicionario_vazio** `test_dicionario_vazio` — tem_chave devolve False para o dicionario vazio | 4 | 4 |
| 106 | `juntar-dicionarios` — Juntar dicionários *(regular)* | `api:.update` | — | próprio `juntando-dois-dicionarios` | **test_junta_as_chaves_novas** `test_junta_as_chaves_novas` — juntar acrescenta as chaves do segundo dicionario<br>**test_chave_repetida_fica_com_o_valor_novo** `test_chave_repetida_fica_com_o_valor_novo` — juntar troca o valor das chaves repetidas<br>**test_junta_com_o_dicionario_vazio** `test_junta_com_o_dicionario_vazio` — juntar com o dicionario vazio nao muda nada | 3 | 3 |
| 107 | `tirar-e-devolver` — Tirar e devolver *(regular)* | `api:.setdefault`, `api:.popitem` | — | próprio `garantindo-e-tirando` | **test_garantir_devolve_o_valor_guardado** `test_garantir_devolve_o_valor_guardado` — garantir devolve o valor quando a chave ja existe<br>**test_garantir_guarda_o_padrao** `test_garantir_guarda_o_padrao` — garantir guarda o padrao quando a chave nao existe<br>**test_tirar_ultimo_devolve_o_ultimo_par** `test_tirar_ultimo_devolve_o_ultimo_par` — tirar_ultimo devolve o ultimo par guardado<br>**test_tirar_ultimo_remove_o_par** `test_tirar_ultimo_remove_o_par` — tirar_ultimo tira o par do dicionario | 4 | 4 |
| 108 | `dicionario-de-listas` — Dicionário de listas *(consolidation)* | `node:Dict` | — | próprio `as-regioes` | **test_sul_tem_duas_cidades** `test_sul_tem_duas_cidades` — regioes guarda a lista do sul com duas cidades<br>**test_norte_tem_uma_cidade** `test_norte_tem_uma_cidade` — regioes guarda a lista do norte com uma cidade<br>**test_tem_as_duas_regioes** `test_tem_as_duas_regioes` — regioes guarda as duas regioes | 3 | 3 |
| 109 | `conjunto-sem-repetidos` — Conjunto sem repetidos *(regular)* | `node:Set`, `global:set` | — | próprio `sem-repetidos` | **test_unicos_tira_as_repeticoes** `test_unicos_tira_as_repeticoes` — unicos elimina os numeros repetidos<br>**test_unicos_sem_repeticoes** `test_unicos_sem_repeticoes` — unicos so com numeros sozinhos devolve os mesmos numeros<br>**test_unicos_da_lista_vazia** `test_unicos_da_lista_vazia` — unicos da lista vazia devolve o conjunto vazio<br>**test_dupla_de_conjuntos_tem_dois_conjuntos** `test_dupla_de_conjuntos_tem_dois_conjuntos` — dupla_de_conjuntos devolve a lista com os conjuntos {1} e {2} | 4 | 4 |
| 110 | `contas-de-conjunto` — Contas de conjunto *(regular)* | `api:.union`, `api:.intersection` | — | próprio `juntando-e-intersecando` | **test_juntar_une_os_dois_conjuntos** `test_juntar_une_os_dois_conjuntos` — juntar devolve os numeros dos dois conjuntos sem repetir<br>**test_juntar_sem_nada_em_comum** `test_juntar_sem_nada_em_comum` — juntar de conjuntos sem nada em comum junta tudo<br>**test_comuns_acha_o_numero_que_esta_nos_dois** `test_comuns_acha_o_numero_que_esta_nos_dois` — comuns devolve o numero que esta nos dois conjuntos<br>**test_comuns_sem_nada_em_comum** `test_comuns_sem_nada_em_comum` — comuns de conjuntos sem nada em comum devolve o conjunto vazio | 4 | 4 |
| 111 | `diferenca-e-subconjunto` — Diferença e subconjunto *(regular)* | `api:.difference`, `api:.issubset` | — | próprio `diferenca-e-contido` | **test_so_em_devolve_o_que_so_a_tem** `test_so_em_devolve_o_que_so_a_tem` — so_em devolve o que o primeiro tem e o segundo nao<br>**test_so_em_de_iguais** `test_so_em_de_iguais` — so_em de conjuntos iguais devolve o conjunto vazio<br>**test_contido_devolve_true** `test_contido_devolve_true` — contido devolve True quando o primeiro cabe no segundo<br>**test_contido_devolve_false** `test_contido_devolve_false` — contido devolve False quando o primeiro nao cabe no segundo<br>**test_vazio_cabe_em_tudo** `test_vazio_cabe_em_tudo` — contido do conjunto vazio devolve True | 5 | 5 |
| 112 | `a-chave-precisa-ser-imutavel` — A chave precisa ser imutável *(regular)* | `global:frozenset`, `global:hash` | — | próprio `congelando-e-marcando` | **test_congelar_tira_as_repeticoes** `test_congelar_tira_as_repeticoes` — congelar devolve o conjunto congelado sem repeticoes<br>**test_congelar_devolve_um_frozenset** `test_congelar_devolve_um_frozenset` — congelar devolve um frozenset de um numero<br>**test_marca_de_um_numero_e_o_proprio_numero** `test_marca_de_um_numero_e_o_proprio_numero` — marca devolve o proprio numero para numeros<br>**test_marca_de_menos_um_e_menos_dois** `test_marca_de_menos_um_e_menos_dois` — marca devolve -2 para -1 porque o Python reserva o -1 | 4 | 4 |

*Módulo sem desafio de fecho.*

## Sequência deduplicada das chaves produtivas (primeira ocorrência)

123 chaves distintas, por ordem de primeira ocorrência (`#aula` = índice global no curso):

- `#1` → `global:print`
- `#1` → `node:Call`
- `#1` → `node:StrLiteral`
- `#3` → `node:IntLiteral`
- `#4` → `op:binary:+`
- `#4` → `node:BinOp`
- `#5` → `op:binary:-`
- `#5` → `op:binary:*`
- `#6` → `op:binary:/`
- `#6` → `node:FloatLiteral`
- `#7` → `op:binary://`
- `#7` → `op:binary:%`
- `#8` → `op:binary:**`
- `#9` → `op:unary:-`
- `#9` → `op:unary:+`
- `#9` → `node:UnaryOp`
- `#10` → `decl:assign`
- `#10` → `node:Assign`
- `#13` → `node:JoinedStr`
- `#13` → `node:FormattedValue`
- `#14` → `global:int`
- `#14` → `global:str`
- `#15` → `global:round`
- `#15` → `global:float`
- `#16` → `node:BoolLiteral`
- `#16` → `global:bool`
- `#17` → `node:NoneLiteral`
- `#18` → `global:type`
- `#21` → `op:compare:>`
- `#21` → `op:compare:<`
- `#21` → `node:Compare`
- `#22` → `op:compare:==`
- `#22` → `op:compare:!=`
- `#23` → `op:compare:>=`
- `#23` → `op:compare:<=`
- `#24` → `node:If`
- `#25` → `node:Pass`
- `#26` → `node:IfElse`
- `#27` → `node:Elif`
- `#28` → `op:bool:and`
- `#28` → `op:bool:or`
- `#28` → `node:BoolOp`
- `#29` → `op:unary:not`
- `#30` → `node:IfExp`
- `#31` → `op:compare:is`
- `#33` → `node:For`
- `#33` → `global:range`
- `#35` → `decl:aug`
- `#35` → `op:aug:+`
- `#35` → `node:AugAssign`
- `#36` → `op:aug:-`
- `#36` → `op:aug:*`
- `#37` → `op:aug:/`
- `#37` → `op:aug://`
- `#38` → `op:aug:%`
- `#38` → `op:aug:**`
- `#39` → `node:While`
- `#40` → `node:Break`
- `#41` → `node:Continue`
- `#44` → `node:ForElse`
- `#45` → `node:WhileElse`
- `#46` → `node:FunctionDef`
- `#48` → `node:arg`
- `#49` → `node:Return`
- `#59` → `node:Assert`
- `#60` → `node:List`
- `#61` → `node:Subscript`
- `#63` → `global:len`
- `#64` → `api:.append`
- `#64` → `node:Attribute`
- `#65` → `api:.pop`
- `#65` → `api:.remove`
- `#66` → `api:.insert`
- `#68` → `op:compare:in`
- `#69` → `api:.index`
- `#69` → `api:.count`
- `#70` → `node:Slice`
- `#72` → `api:.sort`
- `#72` → `global:sorted`
- `#73` → `api:.reverse`
- `#73` → `global:reversed`
- `#74` → `api:.extend`
- `#74` → `api:.clear`
- `#75` → `global:max`
- `#75` → `global:min`
- `#76` → `global:sum`
- `#77` → `global:enumerate`
- `#78` → `global:zip`
- `#79` → `node:Tuple`
- `#80` → `decl:unpack`
- `#82` → `api:.upper`
- `#82` → `api:.lower`
- `#83` → `api:.strip`
- `#84` → `api:.replace`
- `#85` → `api:.startswith`
- `#85` → `api:.endswith`
- `#86` → `api:.find`
- `#87` → `api:.split`
- `#87` → `api:.splitlines`
- `#88` → `api:.join`
- `#92` → `api:.isdigit`
- `#92` → `api:.isalpha`
- `#94` → `api:.ljust`
- `#94` → `api:.zfill`
- `#96` → `global:ord`
- `#96` → `global:chr`
- `#97` → `node:Dict`
- `#99` → `api:.get`
- `#101` → `node:Delete`
- `#102` → `api:.keys`
- `#102` → `api:.values`
- `#103` → `api:.items`
- `#106` → `api:.update`
- `#107` → `api:.setdefault`
- `#107` → `api:.popitem`
- `#109` → `node:Set`
- `#109` → `global:set`
- `#110` → `api:.union`
- `#110` → `api:.intersection`
- `#111` → `api:.difference`
- `#111` → `api:.issubset`
- `#112` → `global:frozenset`
- `#112` → `global:hash`

## Integridade

Sem discrepâncias: nº de `lesson.json` (112) = nº de aulas contadas (112); todos os desafios declarados existem; contagens de testes batem certo com `expectedTestCount`.
