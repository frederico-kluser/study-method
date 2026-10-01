# Inventário curricular — Rust Iniciante: da primeira função ao júnior-Rust (`rust-iniciante`)

> Gerado por leitura apenas de `app/resources/tracks/rust-iniciante/` (nada foi alterado). 
> Ordem: módulos pela ordem de `track.json`, aulas pela ordem de `module.json → lessons`.
>
> **Legenda** — `introduces`: chaves copiadas tal como estão em `lesson.json`.
> `nº testes` = testes contados no `testsCode` do `challenge.json` (regra do curso: `#[test]` em `testsCode`); não existem ficheiros `tests/test_solucao.py` em disco — os testes vivem no campo `testsCode`.
> `expectedTestCount` = valor declarado no `challenge.json`.
> Coluna `desafio`: `próprio` = `lessons/<aula>/challenges/<slug>/`; `módulo` = desafio de fecho do módulo; `—` = sem desafio.

## Totais do curso

| métrica | valor |
|---|---|
| módulos | 8 |
| aulas (ordem declarada) | 103 |
| lesson.json em disco | 103 |
| desafios de aula (próprios) | 103 |
| desafios de módulo (fecho) | 8 |
| aulas sem desafio algum | 0 |
| challenge.json em disco | 111 |
| testes contados / `expectedTestCount` somado | 268 / 268 |
| ocorrências de chaves `introduces` produtivas | 184 |
| ocorrências de chaves `introduces` receptivas | 14 |
| chaves produtivas distintas | 104 |
| introduces produtivas por aula (média / mediana / máx) | 1.79 / 1 / 5 |

## Módulo 1 — `a-tela` — A tela (15 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 1 | `a-primeira-funcao` — A primeira função *(regular)* | `node:FunctionItem`, `node:Parameters`, `node:PrimitiveType`, `node:VisibilityModifier`, `node:IntegerLiteral` | `api:todo!`, `node:MacroInvocation`, `node:TokenTree` | próprio `devolva-dois` | **REQ-1** `testa_dois_devolve_dois` — A função dois deve devolver 2. | 1 | 1 |
| 2 | `o-valor-que-entra` — O valor que entra *(regular)* | `node:Parameter` | — | próprio `eco-do-numero` | **REQ-1** `testa_eco_de_sete` — A função eco deve devolver 7 quando chamada com 7.<br>**REQ-2** `testa_eco_de_zero` — A função eco deve devolver 0 quando chamada com 0. | 2 | 2 |
| 3 | `multiplicar` — Multiplicar *(regular)* | `op:binary:*`, `node:BinaryExpression` | `op:unary:-`, `node:UnaryExpression` | próprio `dobre-o-numero` | **REQ-1** `testa_dobro_positivo` — A função dobro deve devolver 4 quando chamada com 2.<br>**REQ-2** `testa_dobro_de_dez` — A função dobro deve devolver 20 quando chamada com 10. | 2 | 2 |
| 4 | `somar` — Somar *(regular)* | `op:binary:+` | — | próprio `some-dois-numeros` | **REQ-1** `testa_a_soma_de_dois_com_tres` — A função soma deve devolver 5 quando chamada com 2 e 3.<br>**REQ-2** `testa_a_soma_de_valores_grandes` — A função soma deve devolver 1245 quando chamada com 1200 e 45. | 2 | 2 |
| 5 | `chamar-a-funcao` — Chamar a função *(regular)* | `node:CallExpression` | — | próprio `o-dobro-do-dobro` | **REQ-1** `testa_o_dobro_do_dobro_de_dois` — A função dobro_do_dobro deve devolver 8 quando chamada com 2.<br>**REQ-2** `testa_o_dobro_do_dobro_de_cinco` — A função dobro_do_dobro deve devolver 20 quando chamada com 5. | 2 | 2 |
| 6 | `a-mensagem-montada` — A mensagem montada *(regular)* | `api:format!`, `node:TypeIdentifier`, `node:StringLiteral` | — | próprio `a-etiqueta-do-pedido` | **REQ-1** `testa_a_etiqueta_do_pedido_sete` — A função etiqueta(7, 3) deve devolver o texto "pedido 7 x 3".<br>**REQ-2** `testa_a_etiqueta_do_pedido_doze` — A função etiqueta(12, 1) deve devolver o texto "pedido 12 x 1". | 2 | 2 |
| 7 | `a-tela` — A tela *(regular)* | `api:println!` | — | próprio `o-bilhete-na-tela` | **REQ-1** `testa_o_bilhete_do_assento_doze` — A função bilhete(12) deve devolver o texto "assento: 12" (e mostrar a linha na tela).<br>**REQ-2** `testa_o_bilhete_do_assento_sete` — A função bilhete(7) deve devolver o texto "assento: 7" (e mostrar a linha na tela). | 2 | 2 |
| 8 | `dar-nome-ao-valor` — Dar nome ao valor *(regular)* | `decl:let`, `node:LetDeclaration` | — | próprio `o-preco-com-taxa` | **REQ-1** `testa_o_preco_de_cem_com_taxa` — A função preco_final(100) deve devolver 107.<br>**REQ-2** `testa_o_preco_de_zero_com_taxa` — A função preco_final(0) deve devolver 7. | 2 | 2 |
| 9 | `mudar-o-valor` — Mudar o valor *(regular)* | `decl:let-mut`, `node:MutableSpecifier` | — | próprio `a-base-movel` | **REQ-1** `testa_a_base_de_dez_mais_dois` — A função base_movel(10) deve devolver 12.<br>**REQ-2** `testa_a_base_de_quarenta_mais_dois` — A função base_movel(40) deve devolver 42. | 2 | 2 |
| 10 | `reatribuir` — Reatribuir *(regular)* | `op:assign:=`, `node:AssignmentExpression` | — | próprio `o-valor-novo` | **REQ-1** `testa_o_valor_novo_de_dez` — A função valor_novo(10) deve devolver 25.<br>**REQ-2** `testa_o_valor_novo_de_zero` — A função valor_novo(0) deve devolver 15. | 2 | 2 |
| 11 | `somar-no-lugar` — Somar no lugar *(regular)* | `op:assign:+=`, `node:CompoundAssignmentExpr` | — | próprio `a-soma-no-lugar` | **REQ-1** `testa_o_acumulo_de_dez_mais_cinco` — A função acumular(10) deve devolver 15.<br>**REQ-2** `testa_o_acumulo_de_zero_mais_cinco` — A função acumular(0) deve devolver 5. | 2 | 2 |
| 12 | `fixar-uma-vez` — Fixar uma vez *(regular)* | `decl:const`, `node:ConstItem` | — | próprio `o-bonus-fixo` | **REQ-1** `testa_os_pontos_de_noventa_e_cinco_com_bonus` — A função pontos_com_bonus(95) deve devolver 100.<br>**REQ-2** `testa_os_pontos_de_zero_com_bonus` — A função pontos_com_bonus(0) deve devolver 5 (o bônus fixo). | 2 | 2 |
| 13 | `o-corpo-e-uma-expressao` — O corpo é uma expressão *(consolidation)* | `node:FunctionItem` | — | próprio `o-corpo-que-devolve` | **REQ-1** `testa_o_triplo_de_quatro` — A função triplo(4) deve devolver 12.<br>**REQ-2** `testa_o_triplo_de_sete` — A função triplo(7) deve devolver 21. | 2 | 2 |
| 14 | `o-erro-de-compilacao` — O erro de compilação *(consolidation)* | `node:FunctionItem` | — | próprio `o-ajuste-que-compila` | **REQ-1** `testa_o_ajuste_e_quinze` — A função ajuste() deve devolver 15.<br>**REQ-2** `testa_o_ajuste_nao_e_o_inicial` — A função ajuste() não deve devolver o valor inicial 10. | 2 | 2 |
| 15 | `a-saida-completa` — A saída completa *(integration)* | `api:format!` | — | próprio `o-recibo-completo` | **REQ-1** `testa_o_recibo_de_tres_por_quatro` — A função recibo(3, 4) deve devolver o texto "4 x 3 = 12" (e mostrar a linha do recibo na tela).<br>**REQ-2** `testa_o_recibo_de_cinco_por_dois` — A função recibo(5, 2) deve devolver o texto "2 x 5 = 10" (e mostrar a linha do recibo na tela). | 2 | 2 |

**Desafio de módulo (fecho):** `a-tela` — O carrinho da feira · nº testes: 4 · expectedTestCount: 4
- **REQ-1** `testa_a_compra_de_tres_por_quatro` — valor_da_compra(4, 3) deve devolver 12 — o preço vezes a quantidade.
- **REQ-2** `testa_a_compra_de_dois_por_dez` — valor_da_compra(2, 10) deve devolver 20 — o preço vezes a quantidade.
- **REQ-3** `testa_o_carrinho_da_primeira_feira` — carrinho(4, 3, 2, 10) deve devolver "3 x 4 + 10 x 2 + 5 = 37" — a nota das duas compras com a taxa da sacola.
- **REQ-4** `testa_o_carrinho_da_segunda_feira` — carrinho(1, 5, 1, 5) deve devolver "5 x 1 + 5 x 1 + 5 = 15" — a nota das duas compras com a taxa da sacola.

## Módulo 2 — `decisao` — Decisão (12 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 16 | `comparar-numeros` — Comparar números *(regular)* | `op:compare:>`, `op:compare:<`, `node:BinaryExpression` | — | próprio `maior-e-menor` | **REQ-1** `testa_tres_e_maior_que_dois` — A função maior deve devolver true quando chamada com 3 e 2.<br>**REQ-2** `testa_dois_e_menor_que_tres` — A função menor deve devolver true quando chamada com 2 e 3.<br>**REQ-3** `testa_iguais_nao_sao_maior_nem_menor` — Com 4 e 4, as duas funções devem devolver false — iguais não são maiores nem menores. | 3 | 3 |
| 17 | `igual` — Igual *(regular)* | `op:compare:==`, `node:BinaryExpression` | — | próprio `dois-e-igual-a-dois` | **REQ-1** `testa_dois_e_igual_a_dois` — A função sao_iguais deve devolver true quando chamada com 2 e 2.<br>**REQ-2** `testa_dois_e_tres_nao_sao_iguais` — A função sao_iguais deve devolver false quando chamada com 2 e 3.<br>**REQ-3** `testa_sete_e_igual_a_sete` — A função sao_iguais deve devolver true quando chamada com 7 e 7. | 3 | 3 |
| 18 | `e-e` — E lógico *(regular)* | `op:logical:&&`, `node:BinaryExpression` | — | próprio `os-dois-positivos` | **REQ-1** `testa_tres_e_dois_sao_positivos` — A função os_dois_positivos deve devolver true quando chamada com 3 e 2.<br>**REQ-2** `testa_tres_e_zero_nao_sao_os_dois` — A função os_dois_positivos deve devolver false quando um dos dois é 0 (3 e 0).<br>**REQ-3** `testa_dois_zeros_nao_sao_positivos` — A função os_dois_positivos deve devolver false quando os dois são 0. | 3 | 3 |
| 19 | `o-negativo` — O negativo *(regular)* | `op:unary:-`, `node:UnaryExpression` | — | próprio `o-oposto-do-numero` | **REQ-1** `testa_oposto_de_tres_e_menos_tres` — A função oposto deve devolver -3 quando chamada com 3.<br>**REQ-2** `testa_oposto_de_menos_tres_e_tres` — A função oposto deve devolver 3 quando chamada com -3.<br>**REQ-3** `testa_oposto_de_zero_e_zero` — A função oposto deve devolver 0 quando chamada com 0. | 3 | 3 |
| 20 | `negar` — Negar *(regular)* | `op:unary:!`, `node:UnaryExpression` | — | próprio `nao-sao-os-dois-positivos` | **REQ-1** `testa_tres_e_dois_sao_os_dois_positivos` — Com 3 e 2 (os dois positivos), a função deve devolver false.<br>**REQ-2** `testa_tres_e_zero_um_nao_e_positivo` — Com 3 e 0 (um não é positivo), a função deve devolver true.<br>**REQ-3** `testa_dois_zeros_nenhum_e_positivo` — Com 0 e 0 (nenhum positivo), a função deve devolver true. | 3 | 3 |
| 21 | `se` — Se *(regular)* | `node:IfExpression` | — | próprio `o-maior-dos-dois` | **REQ-1** `testa_o_maior_de_tres_e_dois` — A função o_maior deve devolver 3 quando chamada com 3 e 2.<br>**REQ-2** `testa_o_maior_de_dois_e_tres` — A função o_maior deve devolver 3 quando chamada com 2 e 3.<br>**REQ-3** `testa_quando_sao_iguais_fica_o_primeiro` — Com 4 e 4 (iguais), a função deve devolver 4 — o valor guardado de início. | 3 | 3 |
| 22 | `se-senao` — Se senão *(regular)* | `node:ElseClause` | — | próprio `o-absoluto` | **REQ-1** `testa_o_absoluto_de_cinco_e_cinco` — A função o_absoluto deve devolver 5 quando chamada com 5.<br>**REQ-2** `testa_o_absoluto_de_menos_tres_e_tres` — A função o_absoluto deve devolver 3 quando chamada com -3.<br>**REQ-3** `testa_o_absoluto_de_zero_e_zero` — A função o_absoluto deve devolver 0 quando chamada com 0 (o ramo do else). | 3 | 3 |
| 23 | `se-senao-se` — Se senão se *(regular)* | `node:ElseIf` | — | próprio `o-caso-do-numero` | **REQ-1** `testa_menos_sete_e_o_caso_menos_um` — A função o_caso_do_numero deve devolver -1 para o número -7.<br>**REQ-2** `testa_zero_e_o_caso_zero` — A função o_caso_do_numero deve devolver 0 para o número 0.<br>**REQ-3** `testa_nove_e_o_caso_um` — A função o_caso_do_numero deve devolver 1 para o número 9 (o caso que sobra). | 3 | 3 |
| 24 | `o-se-que-devolve` — O se que devolve *(consolidation)* | `node:IfExpression` | — | próprio `o-se-que-vira-valor` | **REQ-1** `testa_o_maior_de_oito_e_tres` — A função o_maior_dos_dois deve devolver 8 quando chamada com 8 e 3.<br>**REQ-2** `testa_o_maior_de_tres_e_oito` — A função o_maior_dos_dois deve devolver 8 quando chamada com 3 e 8.<br>**REQ-3** `testa_quando_sao_iguais_devolve_qualquer_um` — Com 4 e 4, a função deve devolver 4 pelo ramo do else. | 3 | 3 |
| 25 | `a-condicao-que-guarda` — A condição que guarda *(consolidation)* | `op:compare:==` | — | próprio `a-soma-confere` | **REQ-1** `testa_o_palpite_cinco_confere_a_soma` — Com 2, 3 e palpite 5, a função deve devolver true — o palpite é igual à soma.<br>**REQ-2** `testa_o_palpite_quatro_nao_confere` — Com 2, 3 e palpite 4, a função deve devolver false — a soma é 5.<br>**REQ-3** `testa_soma_zerada_com_palpite_zero_confere` — Com 0, 0 e palpite 0, a função deve devolver true — a soma zerada confere. | 3 | 3 |
| 26 | `a-logica-invertida` — A lógica invertida *(consolidation)* | `op:unary:!` | — | próprio `sao-diferentes` | **REQ-1** `testa_dois_e_tres_sao_diferentes` — A função sao_diferentes deve devolver true quando chamada com 2 e 3.<br>**REQ-2** `testa_dois_e_dois_nao_sao_diferentes` — A função sao_diferentes deve devolver false quando chamada com 2 e 2.<br>**REQ-3** `testa_sete_e_sete_nao_sao_diferentes` — A função sao_diferentes deve devolver false quando chamada com 7 e 7. | 3 | 3 |
| 27 | `o-classificador` — O classificador *(integration)* | `node:ElseIf` | — | próprio `o-classificador` | **REQ-1** `testa_nota_nove_e_excelente` — A nota 9 deve receber o rótulo "nota 9 excelente".<br>**REQ-2** `testa_nota_sete_e_boa` — A nota 7 deve receber o rótulo "nota 7 boa".<br>**REQ-3** `testa_nota_tres_precisa_estudar` — A nota 3 deve receber o rótulo "nota 3 precisa estudar". | 3 | 3 |

**Desafio de módulo (fecho):** `decisao` — A torre de controle · nº testes: 6 · expectedTestCount: 6
- **REQ-1** `testa_a_bateria_sem_carga` — voo(false, 0) deve devolver "bateria 0: carregue antes de voar" — a carga zerada, o primeiro ramo.
- **REQ-2** `testa_a_bateria_negativa` — voo(false, -7) deve devolver "bateria -7: carga invalida" — o negativo do módulo no veredito.
- **REQ-3** `testa_o_voo_liberado_fora_do_eco` — voo(false, 60) deve devolver "bateria 60: voo liberado" — acima do limite de fora do eco (50).
- **REQ-4** `testa_o_voo_liberado_no_eco` — voo(true, 30) deve devolver "bateria 30: voo liberado" — acima do limite do eco (20), decidido pelo if que vira valor.
- **REQ-5** `testa_o_voo_que_somente_o_eco_aceita` — voo(false, 30) deve devolver "bateria 30: so no modo eco" — o ramo do E e da negação.
- **REQ-6** `testa_a_bateria_abaixo_do_minimo` — voo(true, 10) deve devolver "bateria 10: recarregue" — o senão que sobra depois da fila.

## Módulo 3 — `repeticao` — Repetição (12 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 28 | `repetir-para-sempre` — Repetir para sempre *(regular)* | `node:LoopExpression`, `node:BreakExpression` | — | próprio `a-primeira-volta` | **REQ-1** `testa_a_soma_ate_quatro` — A função soma_ate deve devolver 10 quando chamada com 4 (1 + 2 + 3 + 4).<br>**REQ-2** `testa_a_soma_ate_um` — A função soma_ate deve devolver 1 quando chamada com 1.<br>**REQ-3** `testa_a_soma_ate_zero_nao_soma_nada` — A função soma_ate deve devolver 0 quando chamada com 0. | 3 | 3 |
| 29 | `parar-no-meio` — Parar no meio *(consolidation)* | `node:BreakExpression` | — | próprio `a-soma-que-passa-do-teto` | **REQ-1** `testa_a_soma_que_passa_de_dez` — A função soma_ate_passar deve devolver 15 quando chamada com o teto 10 (1 + 2 + 3 + 4 + 5).<br>**REQ-2** `testa_a_soma_que_passa_de_zero` — A função soma_ate_passar deve devolver 1 quando chamada com o teto 0 — a primeira soma já passa.<br>**REQ-3** `testa_a_soma_que_passa_de_dois` — A função soma_ate_passar deve devolver 3 quando chamada com o teto 2 (1 não passa; 3 passa). | 3 | 3 |
| 30 | `contar-ate` — Contar até *(regular)* | `node:ForExpression`, `op:range:..`, `node:RangeExpression` | — | próprio `a-contagem-do-intervalo` | **REQ-1** `testa_os_quadrados_ate_quatro` — A função soma_dos_quadrados deve devolver 14 quando chamada com 4 (0 + 1 + 4 + 9, sem o 4).<br>**REQ-2** `testa_os_quadrados_ate_cinco` — A função soma_dos_quadrados deve devolver 30 quando chamada com 5 (0 + 1 + 4 + 9 + 16, sem o 5).<br>**REQ-3** `testa_o_intervalo_vazio_devolve_zero` — A função soma_dos_quadrados deve devolver 0 quando chamada com 0 (intervalo vazio). | 3 | 3 |
| 31 | `ate-inclusive` — Até inclusive *(regular)* | `op:range:..=`, `node:RangeExpression` | — | próprio `a-soma-inclusiva` | **REQ-1** `testa_a_soma_inclusiva_ate_quatro` — A função soma_de_1_ate deve devolver 10 quando chamada com 4 (1 + 2 + 3 + 4, com o fim incluído).<br>**REQ-2** `testa_a_soma_inclusiva_ate_um` — A função soma_de_1_ate deve devolver 1 quando chamada com 1 — o intervalo 1..=1 tem só o 1.<br>**REQ-3** `testa_o_intervalo_invertido_e_vazio` — A função soma_de_1_ate deve devolver 0 quando chamada com 0 — o intervalo 1..=0 é vazio. | 3 | 3 |
| 32 | `enquanto` — Enquanto *(regular)* | `node:WhileExpression` | — | próprio `as-voltas-de-dobra` | **REQ-1** `testa_as_voltas_ate_a_meta_oito` — A função voltas_de_dobra deve devolver 3 quando chamada com a meta 8 (1, 2, 4 — três dobras até o 8).<br>**REQ-2** `testa_a_meta_que_ja_esta_atingida` — A função voltas_de_dobra deve devolver 0 quando chamada com a meta 1 — o total já chegou e o laço nem roda.<br>**REQ-3** `testa_as_voltas_ate_a_meta_sete` — A função voltas_de_dobra deve devolver 3 quando chamada com a meta 7 (o total passa para 8 e a condição vira false). | 3 | 3 |
| 33 | `acumular-no-laco` — Acumular no laço *(consolidation)* | `op:assign:+=` | — | próprio `o-sorteio-dos-grandes` | **REQ-1** `testa_os_grandes_com_cota_dois` — A função soma_dos_grandes deve devolver 7 quando chamada com limite 5 e cota 2 (3 + 4).<br>**REQ-2** `testa_os_grandes_com_cota_um` — A função soma_dos_grandes deve devolver 5 quando chamada com limite 4 e cota 1 (2 + 3).<br>**REQ-3** `testa_quando_ninguem_passa_da_cota` — A função soma_dos_grandes deve devolver 0 quando chamada com limite 3 e cota 10 — ninguém passa da cota. | 3 | 3 |
| 34 | `o-contador-mutavel` — O contador mutável *(consolidation)* | `decl:let-mut` | — | próprio `os-passos-de-tres-em-tres` | **REQ-1** `testa_os_passos_ate_passar_de_dez` — A função voltas_de_tres_em_tres deve devolver 4 quando chamada com o limite 10 (passos 3, 6, 9 e 12).<br>**REQ-2** `testa_os_passos_que_permanecem_antes_do_limite` — A função voltas_de_tres_em_tres deve devolver 3 quando chamada com o limite 9 (com o passo em 9, a condição vira false).<br>**REQ-3** `testa_o_primeiro_passo_ja_passa_do_limite` — A função voltas_de_tres_em_tres deve devolver 1 quando chamada com o limite 2 (o primeiro passo já passa). | 3 | 3 |
| 35 | `parar-com-valor` — Parar com valor *(consolidation)* | `node:BreakExpression` | — | próprio `o-primeiro-quadrado-que-passa` | **REQ-1** `testa_o_primeiro_quadrado_passando_de_dez` — A função primeiro_quadrado_apos deve devolver 16 quando chamada com o teto 10 (1, 4 e 9 não passam; 16 passa).<br>**REQ-2** `testa_o_primeiro_quadrado_passando_de_vinte_e_cinco` — A função primeiro_quadrado_apos deve devolver 36 quando chamada com o teto 25 (25 não PASSA de 25; 36 passa).<br>**REQ-3** `testa_o_primeiro_quadrado_passando_do_zero` — A função primeiro_quadrado_apos deve devolver 1 quando chamada com o teto 0 — o primeiro quadrado já passa. | 3 | 3 |
| 36 | `de-dois-em-dois` — De dois em dois *(regular)* | `api:.step_by`, `node:FieldExpression`, `node:FieldIdentifier` | — | próprio `os-passos-que-somam` | **REQ-1** `testa_a_soma_de_dois_em_dois_ate_dez` — A função soma_de_dois_em_dois deve devolver 20 quando chamada com 10 (0 + 2 + 4 + 6 + 8).<br>**REQ-2** `testa_a_soma_de_dois_em_dois_ate_cinco` — A função soma_de_dois_em_dois deve devolver 6 quando chamada com 5 (0 + 2 + 4).<br>**REQ-3** `testa_o_intervalo_de_um_so_restara_o_zero` — A função soma_de_dois_em_dois deve devolver 0 quando chamada com 1 (de 2 em 2, só o 0). | 3 | 3 |
| 37 | `laco-dentro-de-laco` — Laço dentro de laço *(consolidation)* | `node:ForExpression` | — | próprio `a-soma-da-grade` | **REQ-1** `testa_a_grade_de_tres_por_quatro` — A função soma_da_grade deve devolver 18 quando chamada com 3 linhas e 4 colunas.<br>**REQ-2** `testa_a_grade_de_dois_por_tres` — A função soma_da_grade deve devolver 3 quando chamada com 2 linhas e 3 colunas.<br>**REQ-3** `testa_a_grade_de_uma_por_uma` — A função soma_da_grade deve devolver 0 quando chamada com 1 linha e 1 coluna — a única célula vale 0 * 0. | 3 | 3 |
| 38 | `o-limite-do-laco` — O limite do laço *(consolidation)* | `node:WhileExpression` | — | próprio `as-voltas-do-intervalo` | **REQ-1** `testa_as_voltas_do_intervalo_ate_cinco` — A função voltas_do_intervalo deve devolver 4 quando chamada com o limite 5 (as voltas do 1 ao 4).<br>**REQ-2** `testa_as_voltas_do_intervalo_ate_dois` — A função voltas_do_intervalo deve devolver 1 quando chamada com o limite 2 (só a volta do 1).<br>**REQ-3** `testa_a_borda_onde_o_laco_nem_roda` — A função voltas_do_intervalo deve devolver 0 quando chamada com o limite 1 — a pergunta 1 < 1 já é false na porta. | 3 | 3 |
| 39 | `a-tabuada` — A tabuada *(integration)* | `node:ForExpression` | — | próprio `a-tabuada-em-texto` | **REQ-1** `testa_a_tabuada_do_tres` — A função tabuada deve devolver as três linhas da tabuada do 3 (3 x 1 = 3, 3 x 2 = 6, 3 x 3 = 9), com quebra de linha entre elas.<br>**REQ-2** `testa_a_tabuada_do_cinco` — A função tabuada deve devolver as três linhas da tabuada do 5 (5 x 1 = 5, 5 x 2 = 10, 5 x 3 = 15), com quebra de linha entre elas.<br>**REQ-3** `testa_a_tabuada_do_dez` — A função tabuada deve devolver as três linhas da tabuada do 10 (10 x 1 = 10, 10 x 2 = 20, 10 x 3 = 30), com quebra de linha entre elas. | 3 | 3 |

**Desafio de módulo (fecho):** `repeticao` — O treino da semana · nº testes: 6 · expectedTestCount: 6
- **REQ-1** `testa_a_semana_de_tres_dias` — soma_dos_dias(3) deve devolver 6 — o for no intervalo 1..=3 acumulando dia a dia.
- **REQ-2** `testa_a_semana_de_dez_dias` — soma_dos_dias(10) deve devolver 55 — o for no intervalo 1..=10 acumulando dia a dia.
- **REQ-3** `testa_a_meta_atingida_com_sobra` — treinos_ate_a_meta(10, 3) deve devolver 4 — o while roda uma vez a mais para ULTRAPASSAR a meta (3+3+3+3).
- **REQ-4** `testa_a_meta_atingida_de_batida` — treinos_ate_a_meta(9, 3) deve devolver 3 — o while para na batida exata da meta (3+3+3).
- **REQ-5** `testa_as_dobras_do_dez` — dobras_ate_passar(10) deve devolver 4 — o loop dobra 10 até passar de 100 (20, 40, 80, 160) e o break devolve a contagem.
- **REQ-6** `testa_as_dobras_do_um` — dobras_ate_passar(1) deve devolver 7 — o loop dobra 1 até passar de 100 (2, 4, 8, 16, 32, 64, 128).

## Módulo 4 — `o-dono-do-valor` — O dono do valor (13 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 40 | `o-texto-que-e-dono` — O texto que é dono *(regular)* | `api:String::from`, `global:String`, `node:ScopedIdentifier` | — | próprio `os-dois-temas` | **REQ-1** `testa_o_tema_escuro` — tema(true) deve devolver o String dono "tema escuro", montado com String::from.<br>**REQ-2** `testa_o_tema_claro` — tema(false) deve devolver o String dono "tema claro", montado com String::from. | 2 | 2 |
| 41 | `copiar-em-vez-de-mover` — Copiar em vez de mover *(regular)* | `api:.clone`, `node:FieldExpression`, `node:FieldIdentifier` | — | próprio `a-copia-do-relatorio` | **REQ-1** `testa_a_copia_do_doc_setenta_e_sete` — protocolar deve devolver a cópia do relatório DOC-77, criada com .clone.<br>**REQ-2** `testa_a_copia_do_doc_oitenta_e_oito` — protocolar deve devolver a cópia do relatório DOC-88, criada com .clone. | 2 | 2 |
| 42 | `o-movimento` — O movimento *(consolidation)* | `decl:let` | — | próprio `o-pacote-que-troca-de-dono` | **REQ-1** `testa_o_pacote_azul_troca_de_dono` — transferir deve devolver o pacote azul recebido, movido para uma ligação nova.<br>**REQ-2** `testa_o_pacote_verde_troca_de_dono` — transferir deve devolver o pacote verde recebido, movido para uma ligação nova. | 2 | 2 |
| 43 | `a-caixa-que-consome` — A caixa que consome *(consolidation)* | `node:FunctionItem` | — | próprio `a-caixa-aberta` | **REQ-1** `testa_a_caixa_verde` — abrir deve devolver o aviso "[verde] aberta" para a caixa verde recebida por valor.<br>**REQ-2** `testa_a_caixa_azul` — abrir deve devolver o aviso "[azul] aberta" para a caixa azul recebida por valor. | 2 | 2 |
| 44 | `devolver-o-dono` — Devolver o dono *(consolidation)* | `node:FunctionItem` | — | próprio `a-fabrica-de-etiquetas` | **REQ-1** `testa_a_etiqueta_fabricada` — fabricar deve devolver o String dono "CX-42", criado com String::from numa ligação nova dentro da função. | 1 | 1 |
| 45 | `o-que-copia-e-o-que-move` — O que copia e o que move *(consolidation)* | `decl:let` | — | próprio `o-numero-que-sobrevive` | **REQ-1** `testa_a_duplicacao_de_sete` — duplica_o_valor(7) deve devolver 14 — a soma do original com a cópia.<br>**REQ-2** `testa_a_duplicacao_de_seis` — duplica_o_valor(6) deve devolver 12 — a soma do original com a cópia. | 2 | 2 |
| 46 | `reusar-o-nome` — Reusar o nome *(consolidation)* | `decl:let` | — | próprio `a-etiqueta-que-sobrescreve` | **REQ-1** `testa_a_etiqueta_da_nota_seis` — reetiquetar(6) deve devolver "nota 7", com a nota somada por sombreamento.<br>**REQ-2** `testa_a_etiqueta_da_nota_nove` — reetiquetar(9) deve devolver "nota 10", com a nota somada por sombreamento. | 2 | 2 |
| 47 | `o-tamanho-do-texto` — O tamanho do texto *(regular)* | `api:.len` | — | próprio `o-peso-do-texto` | **REQ-1** `testa_o_peso_de_abc` — peso deve devolver 3 para o texto "abc" — o tamanho vindo do .len.<br>**REQ-2** `testa_o_peso_de_casa` — peso deve devolver 4 para o texto "casa" — o tamanho vindo do .len. | 2 | 2 |
| 48 | `juntar-textos` — Juntar textos *(consolidation)* | `op:binary:+`, `node:BinaryExpression` | — | próprio `a-palavra-exclamada` | **REQ-1** `testa_a_exclamacao_de_viva` — exclamar deve devolver "viva!" — a soma de textos com o + movendo a caixa da esquerda.<br>**REQ-2** `testa_a_exclamacao_de_fora` — exclamar deve devolver "fora!" — a soma de textos com o + movendo a caixa da esquerda. | 2 | 2 |
| 49 | `crescer-o-texto` — Crescer o texto *(regular)* | `api:.push_str` | — | próprio `o-texto-que-cresce` | **REQ-1** `testa_o_crescimento_de_oi` — crescer deve devolver "oi!!!" — o texto recebido crescido com push_str.<br>**REQ-2** `testa_o_crescimento_de_socorro` — crescer deve devolver "socorro!!!" — o texto recebido crescido com push_str. | 2 | 2 |
| 50 | `de-fatia-para-dono` — De fatia para dono *(regular)* | `api:.to_string` | `node:ReferenceType` | próprio `a-fatia-que-vira-dono` | **REQ-1** `testa_a_fatia_da_ana` — para_dono deve devolver o String dono "Ana" a partir da fatia emprestada, com .to_string.<br>**REQ-2** `testa_a_fatia_do_sol` — para_dono deve devolver o String dono "sol" a partir da fatia emprestada, com .to_string. | 2 | 2 |
| 51 | `a-funcao-que-transforma` — A função que transforma *(consolidation)* | `node:FunctionItem` | — | próprio `o-texto-que-vira-rotulo` | **REQ-1** `testa_o_rotulo_de_ano` — transformar deve devolver o rótulo "[ano]" — a String nova construída a partir da recebida.<br>**REQ-2** `testa_o_rotulo_de_ordem` — transformar deve devolver o rótulo "[ordem]" — a String nova construída a partir da recebida. | 2 | 2 |
| 52 | `o-construtor-de-frase` — O construtor de frase *(integration)* | `api:format!` | — | próprio `o-recibo-do-dono` | **REQ-1** `testa_o_recibo_da_ana` — recibo("Ana", 3, 5) deve devolver "Ana levou 3 pecas por 15" — com o total computado (pecas * preco).<br>**REQ-2** `testa_o_recibo_da_bia` — recibo("Bia", 2, 7) deve devolver "Bia levou 2 pecas por 14" — com o total computado (pecas * preco). | 2 | 2 |

**Desafio de módulo (fecho):** `o-dono-do-valor` — O crachá do evento · nº testes: 3 · expectedTestCount: 3
- **REQ-1** `testa_o_cracha_da_ana` — cracha(String::from("Ana")) deve devolver "CRACHA do evento: Ana (3 letras) - verso: Ana \| acesso liberado" — frente intacta (clone) e verso crescido (push_str).
- **REQ-2** `testa_o_cracha_do_luiz` — cracha("Luiz".to_string()) deve devolver "CRACHA do evento: Luiz (4 letras) - verso: Luiz \| acesso liberado" — o nome conta 4 letras.
- **REQ-3** `testa_o_cracha_da_sol` — cracha("Sol".to_string()) deve devolver "CRACHA do evento: Sol (3 letras) - verso: Sol \| acesso liberado" — outro nome, outra contagem, mesmo formato.

## Módulo 5 — `emprestar` — Emprestar (13 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 53 | `emprestar-o-texto` — Emprestar o texto *(regular)* | `node:ReferenceType` | — | próprio `a-assinatura-que-empresta` | **REQ-1** `testa_o_tamanho_da_ana` — tamanho deve receber o texto emprestado (&str) e devolver 3 para "Ana".<br>**REQ-2** `testa_o_tamanho_do_bom_dia` — tamanho deve receber o texto emprestado (&str) e devolver 7 para "bom dia". | 2 | 2 |
| 54 | `emprestar-qualquer-coisa` — Emprestar qualquer coisa *(regular)* | `op:unary:&`, `node:ReferenceExpression` | — | próprio `o-nome-do-emprestimo` | **REQ-1** `testa_a_medida_do_emprestimo_da_ana` — mede_o_emprestimo deve medir pela referência &texto e devolver 3 para "Ana", sem mover o dono.<br>**REQ-2** `testa_a_medida_do_emprestimo_do_bom_dia` — mede_o_emprestimo deve medir pela referência &texto e devolver 7 para "bom dia", sem mover o dono. | 2 | 2 |
| 55 | `ler-pelo-emprestimo` — Ler pelo empréstimo *(consolidation)* | `op:unary:&`, `node:ReferenceExpression` | — | próprio `a-chamada-que-empresta` | **REQ-1** `testa_a_medida_dos_dois_emprestimos` — mede_dois deve somar as medidas dos dois textos emprestados na chamada (&) e devolver 6 para "Ana" e "sol".<br>**REQ-2** `testa_a_medida_do_bom_dia_e_do_x` — mede_dois deve somar as medidas dos dois textos emprestados na chamada (&) e devolver 8 para "bom dia" e "x". | 2 | 2 |
| 56 | `emprestar-para-mudar` — Emprestar para mudar *(regular)* | `node:MutableReference`, `node:MutableSpecifier` | — | próprio `a-caixa-que-pode-mudar` | **REQ-1** `testa_a_gravacao_do_ana` — grava deve receber &mut String, gravar o pedaço com push_str, devolver 6 e deixar o rótulo do chamador em "Ana: 2".<br>**REQ-2** `testa_a_gravacao_do_bo` — grava deve receber &mut String, gravar o pedaço com push_str, devolver 5 e deixar o rótulo do chamador em "Bo: 9". | 2 | 2 |
| 57 | `o-emprestimo-mutavel-na-chamada` — O empréstimo mutável na chamada *(consolidation)* | `op:unary:&`, `node:ReferenceExpression` | — | próprio `o-emprestimo-na-fila` | **REQ-1** `testa_a_pilha_do_placar` — empilha deve emprestar &mut na chamada da ajudante, escrever o pedaço e devolver 9 para "Placar" e " 10".<br>**REQ-2** `testa_a_pilha_do_texto_vazio` — empilha deve emprestar &mut na chamada da ajudante, escrever o pedaço e devolver 1 para a pilha vazia e "x". | 2 | 2 |
| 58 | `mudar-pelo-emprestimo` — Mudar pelo empréstimo *(regular)* | `op:unary:*`, `node:UnaryExpression` | — | próprio `o-valor-que-muda-la-dentro` | **REQ-1** `testa_a_soma_no_placar_de_dez` — soma_no_lugar deve escrever pelo deref *r e devolver 15, deixando o placar do chamador em 15.<br>**REQ-2** `testa_a_soma_no_placar_de_dois` — soma_no_lugar deve escrever pelo deref *r e devolver 5, deixando o placar do chamador em 5. | 2 | 2 |
| 59 | `um-ou-muitos` — Um ou muitos *(consolidation)* | `node:MutableReference`, `node:MutableSpecifier` | — | próprio `o-placar-que-dobra` | **REQ-1** `testa_a_dobra_do_placar_de_dez` — dobra deve receber &mut i32, dobrar pelo deref e devolver 20, deixando o placar do chamador em 20.<br>**REQ-2** `testa_a_dobra_do_placar_de_dois` — dobra deve receber &mut i32, dobrar pelo deref e devolver 4, deixando o placar do chamador em 4. | 2 | 2 |
| 60 | `o-emprestimo-morre-junto` — O empréstimo morre junto *(consolidation)* | `node:ReferenceType` | — | próprio `o-emprestimo-que-acaba` | **REQ-1** `testa_a_resposta_do_bom_dia` — resposta deve medir pela fatia emprestada com anotação &str e devolver 7 para "bom dia", sem anotar lifetime.<br>**REQ-2** `testa_a_resposta_do_sol` — resposta deve medir pela fatia emprestada com anotação &str e devolver 3 para "sol", sem anotar lifetime. | 2 | 2 |
| 61 | `a-funcao-que-so-le` — A função que só lê *(consolidation)* | `node:ReferenceType` | — | próprio `a-assinatura-que-aceita-os-dois` | **REQ-1** `testa_a_medida_do_dono_emprestado` — mede deve aceitar o dono emprestado (&nome com &str na assinatura) e devolver 7 para "bom dia".<br>**REQ-2** `testa_a_medida_da_fatia_crua` — mede deve aceitar a fatia crua ("sol" direto na chamada) e devolver 3. | 2 | 2 |
| 62 | `a-fatia-do-texto` — A fatia do texto *(regular)* | `node:IndexExpression` | — | próprio `o-pedaco-do-comeco` | **REQ-1** `testa_o_pedaco_do_bom_dia` — recorta deve devolver a fatia &frase[0..ate] — "bom" para "bom dia" com ate 3.<br>**REQ-2** `testa_o_pedaco_do_sol` — recorta deve devolver a fatia &frase[0..ate] — "so" para "sol" com ate 2. | 2 | 2 |
| 63 | `percorrer-o-texto` — Percorrer o texto *(regular)* | `api:.chars`, `node:FieldExpression`, `node:FieldIdentifier` | — | próprio `os-espacos-do-texto` | **REQ-1** `testa_os_espacos_do_bom_dia` — conta_espacos deve percorrer com .chars e devolver 1 para "bom dia".<br>**REQ-2** `testa_os_espacos_do_um_dois_tres` — conta_espacos deve percorrer com .chars e devolver 2 para "um dois tres".<br>**REQ-3** `testa_os_espacos_do_sol` — conta_espacos deve percorrer com .chars e devolver 0 para "sol". | 3 | 3 |
| 64 | `mover-ou-emprestar` — Mover ou emprestar *(consolidation)* | `node:ReferenceType` | — | próprio `o-que-guarda-e-o-que-le` | **REQ-1** `testa_a_medida_do_sol_com_bang` — junta_e_medir deve receber o dono String e o fim emprestado (&str), juntar com push_str e devolver 6 para "sol" e "!!!".<br>**REQ-2** `testa_a_medida_do_a_com_b` — junta_e_medir deve receber o dono String e o fim emprestado (&str), juntar com push_str e devolver 2 para "a" e "b". | 2 | 2 |
| 65 | `o-placar` — O placar *(integration)* | `op:unary:*`, `node:UnaryExpression` | — | próprio `o-placar-final` | **REQ-1** `testa_o_placar_da_ana` — atualiza deve somar pelo deref, montar a frase com format! e devolver "Ana tem 15 pontos", deixando o placar em 15.<br>**REQ-2** `testa_o_placar_do_bo` — atualiza deve somar pelo deref, montar a frase com format! e devolver "Bo tem 5 pontos", deixando o placar em 5. | 2 | 2 |

**Desafio de módulo (fecho):** `emprestar` — A fila do balcão · nº testes: 2 · expectedTestCount: 2
- **REQ-1** `testa_a_fila_da_ana` — chama("ana", &mut fila, 2) com fila em 4 soma pelo deref (a fila vira 6), recorta a sigla "an", conta 0 espaços e devolve "an entrou na fila 6 (espacos: 0)".
- **REQ-2** `testa_a_fila_do_bo_e_da_clara` — chama aceita o &String do dono (String::from("bo clara")) como &str, soma 3 pelo deref, conta 1 espaço no nome e devolve "bo entrou na fila 3 (espacos: 1)", deixando a fila em 3.

## Módulo 6 — `estruturas` — Estruturas (12 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 66 | `o-molde-e-o-valor` — O molde e o valor *(regular)* | `node:StructItem`, `node:FieldDeclarationList`, `node:FieldDeclaration`, `node:FieldIdentifier` | `node:StructExpression`, `node:FieldInitializerList`, `node:FieldInitializer` | próprio `o-campo-que-faltava` | **REQ-1** `testa_o_y_do_ponto_dois_por_tres` — O molde do Ponto declara o campo pub y: i32 e ponto_de(2, 3) monta a peça com y valendo 3.<br>**REQ-2** `testa_o_x_do_ponto_dois_por_tres` — ponto_de(2, 3) monta a peça com o campo x valendo 2. | 2 | 2 |
| 67 | `criar-a-partir-do-molde` — Criar a partir do molde *(regular)* | `node:StructExpression`, `node:FieldInitializerList`, `node:FieldInitializer`, `node:FieldIdentifier` | — | próprio `montar-o-ponto` | **REQ-1** `testa_o_x_do_ponto_montado_dois_por_tres` — ponto_de(2, 3) monta a peça do molde Ponto com o campo x valendo 2.<br>**REQ-2** `testa_o_y_do_ponto_montado_cinco_por_sete` — ponto_de(5, 7) monta a peça do molde Ponto com o campo y valendo 7. | 2 | 2 |
| 68 | `ler-o-campo` — Ler o campo *(consolidation)* | `node:FieldExpression`, `api:.x` | `api:.y` | próprio `a-abscissa-do-ponto` | **REQ-1** `testa_a_abscissa_do_ponto_dois_por_tres` — abscissa(ponto_de(2, 3)) devolve o campo x do ponto: 2.<br>**REQ-2** `testa_a_abscissa_do_ponto_negativo_quatro_por_cinco` — abscissa(ponto_de(-4, 5)) devolve o campo x do ponto: -4.<br>**REQ-3** `testa_a_abscissa_do_ponto_zero_por_nove` — abscissa(ponto_de(0, 9)) devolve o campo x do ponto: 0. | 3 | 3 |
| 69 | `o-metodo` — O método *(regular)* | `node:ImplItem`, `node:SelfParameter` | `node:Self` | próprio `a-area-do-ponto` | **REQ-1** `testa_a_area_do_ponto_dois_por_tres` — O método area no impl Ponto devolve self.x * self.y: 6 para o ponto (2, 3).<br>**REQ-2** `testa_a_area_do_ponto_quatro_por_cinco` — O método area no impl Ponto devolve self.x * self.y: 20 para o ponto (4, 5). | 2 | 2 |
| 70 | `o-self-e-o-valor` — O self e o valor *(regular)* | `node:Self` | — | próprio `o-dobro-da-area` | **REQ-1** `testa_o_dobro_da_area_do_dois_por_tres` — O método dobro_da_area no impl Ponto devolve self.x * self.y * 2: 12 para o ponto (2, 3).<br>**REQ-2** `testa_o_dobro_da_area_do_um_por_um` — O método dobro_da_area no impl Ponto devolve self.x * self.y * 2: 2 para o ponto (1, 1).<br>**REQ-3** `testa_o_dobro_da_area_do_zero_por_cinco` — O método dobro_da_area no impl Ponto devolve self.x * self.y * 2: 0 para o ponto (0, 5). | 3 | 3 |
| 71 | `o-metodo-que-muda` — O método que muda *(consolidation)* | `node:SelfParameter` | — | próprio `o-ponto-que-dobra` | **REQ-1** `testa_o_x_dobrado_do_ponto_dois_por_tres` — O método dobrar_x com &mut self muda self.x e devolve 4 para o ponto (2, 3).<br>**REQ-2** `testa_o_x_dobrado_do_ponto_tres_por_um` — O método dobrar_x com &mut self muda self.x e devolve 6 para o ponto (3, 1). | 2 | 2 |
| 72 | `o-construtor` — O construtor *(consolidation)* | `node:ImplItem` | — | próprio `o-construtor-do-ponto` | **REQ-1** `testa_o_x_do_construtor_dois_por_tres` — A função associada Ponto::new monta a peça com o campo x valendo 2.<br>**REQ-2** `testa_o_y_do_construtor_negativo_um_por_quatro` — A função associada Ponto::new monta a peça com o campo y valendo 4. | 2 | 2 |
| 73 | `a-estampa-do-compilador` — A estampa do compilador *(regular)* | `api:derive.Debug`, `node:Attribute`, `node:AttributeItem` | — | próprio `a-estampa-do-ponto` | **REQ-1** `testa_a_estampa_do_ponto_dois_por_tres` — A struct Ponto tem #[derive(Debug)] e mostra(ponto_de(2, 3)) devolve a estampa "Ponto { x: 2, y: 3 }".<br>**REQ-2** `testa_a_estampa_do_ponto_origem` — mostra(ponto_de(0, 0)) devolve a estampa "Ponto { x: 0, y: 0 }". | 2 | 2 |
| 74 | `comparar-estruturas` — Comparar estruturas *(regular)* | `api:derive.PartialEq`, `node:Attribute`, `node:AttributeItem` | — | próprio `o-ponto-repetido` | **REQ-1** `testa_os_dois_pontos_iguais` — A struct Ponto tem #[derive(PartialEq)] e iguais(ponto_de(2, 3), ponto_de(2, 3)) devolve true.<br>**REQ-2** `testa_os_dois_pontos_trocados` — iguais(ponto_de(2, 3), ponto_de(3, 2)) devolve false: o == compara campo por campo. | 2 | 2 |
| 75 | `copiar-a-estrutura` — Copiar a estrutura *(regular)* | `api:derive.Clone`, `api:derive.Copy`, `node:Attribute`, `node:AttributeItem` | — | próprio `o-ponto-que-sobrevive` | **REQ-1** `testa_o_ponto_dois_por_tres_sobrevive_a_copia` — A struct Ponto deriva Clone e Copy, e dobra_e_devolve(ponto_de(2, 3)) devolve 4 com o p vivo depois da cópia.<br>**REQ-2** `testa_o_ponto_origem_sobrevive_a_copia` — dobra_e_devolve(ponto_de(0, 0)) devolve 0. | 2 | 2 |
| 76 | `o-atalho-do-campo` — O atalho do campo *(regular)* | `node:ShorthandFieldInitializer` | — | próprio `a-estatistica-do-turno` | **REQ-1** `testa_o_minimo_da_estatistica_dois_por_nove` — estatistica(2, 9) monta a peça com o atalho e o campo minimo vale 2.<br>**REQ-2** `testa_o_maximo_da_estatistica_dois_por_nove` — estatistica(2, 9) monta a peça com o atalho e o campo maximo vale 9. | 2 | 2 |
| 77 | `o-inventario` — O inventário *(integration)* | `node:StructExpression` | — | próprio `o-relatorio-do-item` | **REQ-1** `testa_o_relatorio_do_parafuso` — O método linha no impl Item devolve "nome: N unidades" e relatorio_de(String::from("parafuso"), 30) devolve "parafuso: 30 unidades".<br>**REQ-2** `testa_o_relatorio_da_porca` — relatorio_de(String::from("porca"), 12) devolve "porca: 12 unidades". | 2 | 2 |

**Desafio de módulo (fecho):** `estruturas` — A ficha do turno · nº testes: 3 · expectedTestCount: 3
- **REQ-1** `testa_o_turno_da_ana` — turno(String::from("ana"), 10, 5) monta a ficha pelo atalho do campo, anota os pontos na corrente e devolve "ana tem 15 pontos".
- **REQ-2** `testa_a_ficha_do_bo_depois_do_ganho` — O método soma(&mut self) muda o placar da ficha (12 + 8) e o método linha(&self) devolve "bo tem 20 pontos" — a mutação fica vista pelo teste.
- **REQ-3** `testa_a_ficha_da_ana_anotada` — O método anota(mut self) chama o soma por dentro, devolve a ficha mudada e a linha dela é "ana tem 15 pontos".

## Módulo 7 — `variantes-e-match` — Variantes e match (13 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 78 | `a-escolha-fixa` — A escolha fixa *(regular)* | `node:EnumItem`, `node:EnumVariantList`, `node:EnumVariant` | — | próprio `a-etiqueta-do-queijo` | **REQ-1** `testa_a_etiqueta_do_dia_zero` — O enum Maturidade declara as variantes Suave, Maturado e Extra, e a_etiqueta_de(0) devolve Maturidade::Suave.<br>**REQ-2** `testa_a_etiqueta_do_dia_tres` — a_etiqueta_de(3) devolve a variante Maturado: dois ou três dias são Maturado.<br>**REQ-3** `testa_a_etiqueta_do_dia_sete` — a_etiqueta_de(7) devolve a variante Extra: quatro dias ou mais são Extra. | 3 | 3 |
| 79 | `o-caminho-da-variante` — O caminho da variante *(consolidation)* | `node:ScopedIdentifier` | — | próprio `o-estado-do-espelho` | **REQ-1** `testa_o_estado_da_colo` — estado_da_colo devolve a variante Novo pelo caminho Estado::Novo.<br>**REQ-2** `testa_o_estado_da_vitrine` — estado_da_vitrine devolve a variante Riscado pelo caminho Estado::Riscado.<br>**REQ-3** `testa_o_estado_do_fundo_do_bau` — estado_do_fundo_do_bau devolve a variante Quebrado pelo caminho Estado::Quebrado. | 3 | 3 |
| 80 | `o-casamento` — O casamento *(regular)* | `node:MatchExpression`, `node:MatchBlock`, `node:MatchArm`, `node:MatchPattern` | — | próprio `o-apetite-do-mato` | **REQ-1** `testa_a_resposta_ao_sol_pleno` — A função a_resposta_do_mato responde ao braço de Sol::Pleno com "cresce".<br>**REQ-2** `testa_a_resposta_ao_sol_nublado` — A função a_resposta_do_mato responde ao braço de Sol::Nublado com "sobrevive".<br>**REQ-3** `testa_a_resposta_ao_sol_escuro` — A função a_resposta_do_mato responde ao braço de Sol::Escuro com "murcha". | 3 | 3 |
| 81 | `um-braco-por-variante` — Um braço por variante *(consolidation)* | `node:MatchArm`, `node:MatchPattern` | — | próprio `o-peso-da-balanca` | **REQ-1** `testa_o_peso_do_prato_cheio` — O braço de Prato::Cheio no match devolve 2 e o match é exaustivo.<br>**REQ-2** `testa_o_peso_do_prato_vazio` — O braço de Prato::Vazio no match devolve -2. | 2 | 2 |
| 82 | `o-braco-que-sobra` — O braço que sobra *(consolidation)* | `node:MatchArm`, `node:MatchPattern` | — | próprio `o-rotulo-do-teclado` | **REQ-1** `testa_o_rotulo_da_tecla_enter` — O braço nomeado de Tecla::Enter devolve a String "processa" no match de o_rotulo_da.<br>**REQ-2** `testa_o_rotulo_da_tecla_volume` — O braço que sobra (_) devolve a String "ignora" para as demais teclas, como Volume e Bloqueio.<br>**REQ-3** `testa_o_rotulo_da_tecla_bloqueio` — O braço que sobra (_) responde por Bloqueio com a String "ignora". | 3 | 3 |
| 83 | `a-variante-que-carrega` — A variante que carrega *(regular)* | `node:TupleStructPattern` | `node:OrderedFieldDeclarationList` | próprio `o-vale-do-brinde` | **REQ-1** `testa_o_vale_de_cinquenta` — O padrão Brinde::Vale(valor) extrai o valor carregado e o_vale_do(Brinde::Vale(50)) devolve 50.<br>**REQ-2** `testa_o_vale_do_nada` — O braço de Brinde::Nada devolve 0. | 2 | 2 |
| 84 | `casar-o-que-carrega` — Casar o que carrega *(consolidation)* | `node:TupleStructPattern` | — | próprio `a-etiqueta-do-pedido-fechado` | **REQ-1** `testa_a_etiqueta_da_comanda_doze` — O braço de Pedido::Fechado(n) extrai o número e a etiqueta da comanda 12 é "comanda: 12".<br>**REQ-2** `testa_a_etiqueta_do_pedido_aberto` — O braço de Pedido::Aberto devolve "sem comanda". | 2 | 2 |
| 85 | `a-caixa-que-pode-vir-vazia` — A caixa que pode vir vazia *(regular)* | `global:Some`, `global:None` | `node:GenericType`, `node:TypeArguments` | próprio `a-caixa-do-dobro` | **REQ-1** `testa_o_aviso_da_caixa_cheia_do_leite_tres` — Com leite positivo, o_leite_de monta a caixa cheia: o_aviso_da(o_leite_de(3)) responde "veio: 6".<br>**REQ-2** `testa_o_aviso_da_caixa_vazia_do_leite_negativo` — Com leite zero ou negativo, o_leite_de devolve a caixa vazia: o_aviso_da responde "nao veio". | 2 | 2 |
| 86 | `casar-a-caixa` — Casar a caixa *(consolidation)* | `node:TupleStructPattern` | — | próprio `a-resposta-da-caixa` | **REQ-1** `testa_o_nove_na_tela_da_caixa_cheia` — O braço de Some(v) extrai o conteúdo e o_numero_na_tela(Some(9)) devolve 9.<br>**REQ-2** `testa_o_zero_na_tela_da_caixa_vazia` — O braço de None devolve 0 quando a caixa vem vazia. | 2 | 2 |
| 87 | `a-resposta-que-pode-falhar` — A resposta que pode falhar *(regular)* | `global:Ok`, `global:Err` | — | próprio `o-embarque-do-aviao` | **REQ-1** `testa_o_bilhete_da_poltrona_doze` — Com poltrona não-negativa, o_embarque_de monta o Ok com o número: o_bilhete_da(o_embarque_de(12)) responde "bilhete: 12".<br>**REQ-2** `testa_o_bilhete_da_poltrona_negativa` — Com poltrona negativa, o_embarque_de devolve Err carregando o motivo: o_bilhete_da responde "poltrona negativa". | 2 | 2 |
| 88 | `casar-a-resposta` — Casar a resposta *(consolidation)* | `node:TupleStructPattern` | — | próprio `o-veredito-do-juiz` | **REQ-1** `testa_o_veredito_da_nota_oito` — O braço de Ok(n) devolve "nota: 8" para a resposta Ok(8).<br>**REQ-2** `testa_o_veredito_da_falta_de_resposta` — O braço de Err(motivo) devolve "sem nota: falta resposta" para o erro carregado. | 2 | 2 |
| 89 | `a-porta-rapida` — A porta rápida *(regular)* | `api:.unwrap`, `api:.expect` | — | próprio `a-porta-do-dobro-garantido` | **REQ-1** `testa_o_dobro_garantido_do_quatro` — o_dobro_garantido abre a caixa com unwrap e devolve 8 para o leite 4.<br>**REQ-2** `testa_o_dobro_com_motivo_do_dois` — o_dobro_com_motivo abre a caixa com expect e a mensagem "o leite do dia precisa ser positivo", devolvendo 4 para o leite 2. | 2 | 2 |
| 90 | `converter-texto-em-numero` — Converter texto em número *(integration)* | `api:.parse` | — | próprio `o-numero-do-formulario` | **REQ-1** `testa_a_idade_do_formulario_quarenta_e_dois` — A String "42" vira o número 42: idade.parse() produz a resposta e unwrap a abre.<br>**REQ-2** `testa_a_idade_do_formulario_sete` — A String "7" vira o número 7 pelo mesmo caminho. | 2 | 2 |

**Desafio de módulo (fecho):** `variantes-e-match` — O bilhete do formulário · nº testes: 6 · expectedTestCount: 6
- **REQ-1** `testa_o_bilhete_da_poltrona_sete` — lugar_da(7) casa a variante que carrega: Fileira::Frente(7), e bilhete(String::from("7")) devolve "frente: poltrona 7".
- **REQ-2** `testa_o_bilhete_da_poltrona_dezenove` — lugar_da(19) casa a variante vazia: Fileira::Fundo, e bilhete(String::from("19")) devolve "fundo".
- **REQ-3** `testa_o_bilhete_do_texto_quebrado` — O texto quebrado abre a caixa vazia: bilhete(String::from("abc")) devolve "numero invalido".
- **REQ-4** `testa_a_caixa_da_poltrona_quatro` — caixa_da(String::from("4")) casa o Ok com Some(4) — a caixa cheia.
- **REQ-5** `testa_a_caixa_do_texto_quebrado` — caixa_da(String::from("x")) casa o Err(_) com None — a caixa vazia.
- **REQ-6** `testa_a_porta_rapida_do_formulario_valido` — Pela porta rápida, caixa_da(String::from("4")).unwrap() é 4 — o unwrap do formulário que o teste sabe válido.

## Módulo 8 — `colecoes` — Coleções (13 aulas)

| # | aula | introduces (produtivas) | introduces (receptivas) | desafio | requirements do desafio | nº testes | expectedTestCount |
|---|---|---|---|---|---|---|---|
| 91 | `a-lista-que-cresce` — A lista que cresce *(regular)* | `api:vec!`, `node:GenericType`, `node:TypeArguments` | — | próprio `a-primeira-lista` | **REQ-1** `testa_o_primeiro_par` — pares() monta a lista com vec! e devolve 2 na posição 0: pares()[0] == 2.<br>**REQ-2** `testa_os_outros_dois_pares` — pares() devolve 4 na posição 1 e 6 na posição 2, na ordem do vec!. | 2 | 2 |
| 92 | `guardar-mais-um` — Guardar mais um *(regular)* | `api:.push`, `node:FieldExpression`, `node:FieldIdentifier` | — | próprio `a-fila-que-cresce` | **REQ-1** `testa_o_guarde_no_fim_da_fila` — guarde(&mut fila, 6) põe o 6 no fim: fila[2] == 6 depois do push.<br>**REQ-2** `testa_a_fila_cresceu_duas_vezes` — Dois pushes seguidos crescem a fila de 1 para 3: fila.len() == 3, com o 2 intacto em fila[0]. | 2 | 2 |
| 93 | `quantos-tem` — Quantos tem *(consolidation)* | `api:.len` | — | próprio `a-lista-contada` | **REQ-1** `testa_a_fila_de_tres` — quantos(&vec![2, 4, 6]) devolve o tamanho da lista: 3.<br>**REQ-2** `testa_a_fila_vazia` — quantos(&vec![]) devolve 0 — a lista vazia tem tamanho zero. | 2 | 2 |
| 94 | `pegar-pela-posicao` — Pegar pela posição *(consolidation)* | `node:IndexExpression` | — | próprio `o-colchete-da-lista` | **REQ-1** `testa_o_terceiro_de_cinco_seis_sete` — terceiro(&vec![5, 6, 7]) devolve o valor da posição 2: 7.<br>**REQ-2** `testa_o_terceiro_da_segunda_fila` — terceiro(&vec![9, 8, 1]) devolve o valor da posição 2: 1. | 2 | 2 |
| 95 | `tirar-do-fim` — Tirar do fim *(regular)* | `api:.pop`, `node:FieldExpression`, `node:FieldIdentifier` | — | próprio `a-pilha-que-entrega` | **REQ-1** `testa_a_entrega_do_ultimo` — entrega(&mut pilha) numa pilha [1, 2, 3] devolve Some(3) — o último valor, na caixa.<br>**REQ-2** `testa_a_pilha_que_acabou` — Na pilha [5], a primeira entrega devolve Some(5) e a segunda devolve None — pilha vazia não panica. | 2 | 2 |
| 96 | `percorrer-a-lista` — Percorrer a lista *(consolidation)* | `node:ForExpression` | — | próprio `a-soma-da-fila` | **REQ-1** `testa_a_soma_de_dois_quatro_seis` — soma(vec![2, 4, 6]) percorre a lista emprestada e devolve 12.<br>**REQ-2** `testa_a_soma_da_fila_vazia` — soma(vec![]) devolve 0 — a fila vazia soma zero. | 2 | 2 |
| 97 | `mudar-dentro-do-laco` — Mudar dentro do laço *(consolidation)* | `node:ForExpression` | — | próprio `o-soma-um-em-cada` | **REQ-1** `testa_o_soma_um_na_fila` — soma_um(&mut fila) soma 1 em cada peça: fila[0] vira 2 na fila [1, 2, 3].<br>**REQ-2** `testa_a_fila_inteira_mudou` — soma_um(&mut fila) na fila [9, 9] deixa 10 nas duas posições. | 2 | 2 |
| 98 | `trazer-o-mapa` — Trazer o mapa *(regular)* | `api:std::collections::HashMap`, `api:std::collections`, `global:std`, `node:UseDeclaration`, `node:ScopedIdentifier` | — | próprio `a-porta-do-mapa` | **REQ-1** `testa_o_rotulo_do_mapa` — O arquivo traz o HashMap com use std::collections::HashMap; e rotulo() devolve "std::collections::HashMap".<br>**REQ-2** `testa_o_endereco_de_25_letras` — rotulo().len() responde 25 — o endereço completo tem 25 caracteres. | 2 | 2 |
| 99 | `o-mapa-vazio` — O mapa vazio *(regular)* | `api:HashMap::new`, `node:ScopedIdentifier` | — | próprio `a-mochila-vazia` | **REQ-1** `testa_a_mochila_nasce_vazia` — mochila() devolve o mapa construído com HashMap::new, com tamanho 0.<br>**REQ-2** `testa_as_duas_mochilas_nascem_iguais` — Duas chamadas de mochila() produzem dois mapas independentes, ambos com tamanho 0. | 2 | 2 |
| 100 | `guardar-no-mapa` — Guardar no mapa *(regular)* | `api:.insert`, `node:FieldExpression`, `node:FieldIdentifier` | — | próprio `a-idade-anotada` | **REQ-1** `testa_a_idade_da_ana` — anota(&mut idades, String::from("ana"), 9) guarda o par: idades["ana"] == 9.<br>**REQ-2** `testa_o_valor_trocado` — Anotar "bo" com 4 e depois com 5 troca o valor: idades["bo"] == 5. | 2 | 2 |
| 101 | `consultar-o-mapa` — Consultar o mapa *(regular)* | `api:.get`, `node:FieldExpression`, `node:FieldIdentifier` | — | próprio `a-consulta-segura` | **REQ-1** `testa_a_idade_da_ana` — consulta(&idades, "ana") no mapa com a ana anotada em 9 devolve Some(9).<br>**REQ-2** `testa_a_chave_que_nao_existe` — consulta(&idades, "ana") sem a chave "ana" devolve None — a caixa vazia. | 2 | 2 |
| 102 | `contar-as-palavras` — Contar as palavras *(regular)* | `api:.entry`, `api:.or_insert`, `node:FieldExpression`, `node:FieldIdentifier` | — | próprio `a-contagem-de-palavras` | **REQ-1** `testa_o_sol_e_a_lua` — contar conta com o padrão entry: c["sol"] == 2 e c["lua"] == 1 na lista [sol, lua, sol].<br>**REQ-2** `testa_a_quantidade_de_chaves` — contar não repete chave: o mapa de [sol, sol] tem exatamente 1 chave. | 2 | 2 |
| 103 | `o-analisador-de-votos` — O analisador de votos *(integration)* | `api:std::collections::HashMap` | — | próprio `a-urna-apurada` | **REQ-1** `testa_a_ana_com_dois_votos` — apuramento conta com Vec + HashMap (padrão entry) e devolve "ana: 2 votos" para [ana, bo, ana].<br>**REQ-2** `testa_a_ana_sem_voto_nenhum` — Sem voto da ana, o get devolve None e o apuramento devolve "ana: 0 votos".<br>**REQ-3** `testa_a_urna_vazia` — Urna vazia: o mapa fica vazio e o apuramento devolve "ana: 0 votos". | 3 | 3 |

**Desafio de módulo (fecho):** `colecoes` — A urna do módulo · nº testes: 2 · expectedTestCount: 2
- **REQ-1** `testa_a_urna_da_ana_e_do_bo` — apura consome a urna (ana, bo, ana) com o laço que empresta e o padrão entry, e deixa contagem["ana"] em 2 e contagem["bo"] em 1.
- **REQ-2** `testa_a_urna_do_bo_so` — Três votos do bo: o padrão entry acumula até 3 e contagem.len() fica 1 — uma chave só.

## Sequência deduplicada das chaves produtivas (primeira ocorrência)

104 chaves distintas, por ordem de primeira ocorrência (`#aula` = índice global no curso):

- `#1` → `node:FunctionItem`
- `#1` → `node:Parameters`
- `#1` → `node:PrimitiveType`
- `#1` → `node:VisibilityModifier`
- `#1` → `node:IntegerLiteral`
- `#2` → `node:Parameter`
- `#3` → `op:binary:*`
- `#3` → `node:BinaryExpression`
- `#4` → `op:binary:+`
- `#5` → `node:CallExpression`
- `#6` → `api:format!`
- `#6` → `node:TypeIdentifier`
- `#6` → `node:StringLiteral`
- `#7` → `api:println!`
- `#8` → `decl:let`
- `#8` → `node:LetDeclaration`
- `#9` → `decl:let-mut`
- `#9` → `node:MutableSpecifier`
- `#10` → `op:assign:=`
- `#10` → `node:AssignmentExpression`
- `#11` → `op:assign:+=`
- `#11` → `node:CompoundAssignmentExpr`
- `#12` → `decl:const`
- `#12` → `node:ConstItem`
- `#16` → `op:compare:>`
- `#16` → `op:compare:<`
- `#17` → `op:compare:==`
- `#18` → `op:logical:&&`
- `#19` → `op:unary:-`
- `#19` → `node:UnaryExpression`
- `#20` → `op:unary:!`
- `#21` → `node:IfExpression`
- `#22` → `node:ElseClause`
- `#23` → `node:ElseIf`
- `#28` → `node:LoopExpression`
- `#28` → `node:BreakExpression`
- `#30` → `node:ForExpression`
- `#30` → `op:range:..`
- `#30` → `node:RangeExpression`
- `#31` → `op:range:..=`
- `#32` → `node:WhileExpression`
- `#36` → `api:.step_by`
- `#36` → `node:FieldExpression`
- `#36` → `node:FieldIdentifier`
- `#40` → `api:String::from`
- `#40` → `global:String`
- `#40` → `node:ScopedIdentifier`
- `#41` → `api:.clone`
- `#47` → `api:.len`
- `#49` → `api:.push_str`
- `#50` → `api:.to_string`
- `#53` → `node:ReferenceType`
- `#54` → `op:unary:&`
- `#54` → `node:ReferenceExpression`
- `#56` → `node:MutableReference`
- `#58` → `op:unary:*`
- `#62` → `node:IndexExpression`
- `#63` → `api:.chars`
- `#66` → `node:StructItem`
- `#66` → `node:FieldDeclarationList`
- `#66` → `node:FieldDeclaration`
- `#67` → `node:StructExpression`
- `#67` → `node:FieldInitializerList`
- `#67` → `node:FieldInitializer`
- `#68` → `api:.x`
- `#69` → `node:ImplItem`
- `#69` → `node:SelfParameter`
- `#70` → `node:Self`
- `#73` → `api:derive.Debug`
- `#73` → `node:Attribute`
- `#73` → `node:AttributeItem`
- `#74` → `api:derive.PartialEq`
- `#75` → `api:derive.Clone`
- `#75` → `api:derive.Copy`
- `#76` → `node:ShorthandFieldInitializer`
- `#78` → `node:EnumItem`
- `#78` → `node:EnumVariantList`
- `#78` → `node:EnumVariant`
- `#80` → `node:MatchExpression`
- `#80` → `node:MatchBlock`
- `#80` → `node:MatchArm`
- `#80` → `node:MatchPattern`
- `#83` → `node:TupleStructPattern`
- `#85` → `global:Some`
- `#85` → `global:None`
- `#87` → `global:Ok`
- `#87` → `global:Err`
- `#89` → `api:.unwrap`
- `#89` → `api:.expect`
- `#90` → `api:.parse`
- `#91` → `api:vec!`
- `#91` → `node:GenericType`
- `#91` → `node:TypeArguments`
- `#92` → `api:.push`
- `#95` → `api:.pop`
- `#98` → `api:std::collections::HashMap`
- `#98` → `api:std::collections`
- `#98` → `global:std`
- `#98` → `node:UseDeclaration`
- `#99` → `api:HashMap::new`
- `#100` → `api:.insert`
- `#101` → `api:.get`
- `#102` → `api:.entry`
- `#102` → `api:.or_insert`

## Integridade

Sem discrepâncias: nº de `lesson.json` (103) = nº de aulas contadas (103); todos os desafios declarados existem; contagens de testes batem certo com `expectedTestCount`.
