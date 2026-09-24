/**
 * app/electron/main/engine/quality/barra.ts — a BARRA PEDAGÓGICA A17–A23,
 * agnóstica de linguagem.
 *
 * POR QUE ELA EXISTE. A bateria A13–A16 (`quality/progressao.ts`) mede
 * ensino-efetivo, micro-avanço, progressividade e primeira-atividade — e é
 * **javascript-only** por construção (`H13`/`AX` são tabelas de
 * `ts.SyntaxKind` e do runner `node:test`; os spans S13 saem de
 * `ts.createSourceFile`). O `audit.ts` a PULA e DECLARA a limitação
 * (`A13-A16-NAO-RODOU`) em toda trilha que não seja JavaScript, e o próprio
 * relatório traz a prova por mutação: *apagar TODOS os blocos de código da
 * teoria da aula 1 de uma trilha de Rust não muda o placar — 0 violações, 0
 * avisos, exit 0.*
 *
 * A consequência foi medida em 2026-09-22, e é o defeito que esta bateria
 * conserta: a aula 1 do `rust-iniciante` declara **11 construções novas** (6
 * produtivas + 5 receptivas) em **UMA** seção de teoria, para um aluno cujo
 * `entryCriteria` é "zero absoluto — nunca programou", e sai do gate com **0
 * violações**. O curso de referência (`python-iniciante`) tem, nas suas 112
 * aulas: no máximo 3 chaves novas por aula, no mínimo 2 seções de teoria por
 * aula, e ZERO chave declarada sem demonstração em bloco de código.
 *
 * O MECANISMO que deixava passar (medido, `budget.ts:281`):
 * `saida = entrada ∪ introduces`. Declarar uma chave em `introduces` a torna
 * LEGAL na própria aula — a aula LEGALIZA o seu próprio penhasco declarando-o.
 * O orçamento A1–A4 continua certo e continua necessário; o que faltava era
 * uma régua sobre o TAMANHO DO PASSO e sobre a EXISTÊNCIA DA DEMONSTRAÇÃO, e
 * é essa régua que mora aqui.
 *
 * AS SETE REGRAS (ids estáveis; `docs/16-engine-de-trilha.md` §5.1):
 *
 *   A17  TETO DO PASSO (erro)      — |novas produtivas colapsadas| ≤ 2
 *   A18  PRIMEIRA AULA (erro)      — na aula 1 da trilha: ≤ 1 produtiva nova, e
 *                                    toda chave que o aluno LÊ (teoria, starter,
 *                                    testes) fora do axioma de entrada tem
 *                                    demonstração NESTA aula
 *   A19  DECLARAR NÃO É DEMONSTRAR — toda chave nova (produtiva ou receptiva)
 *        (erro)                      aparece em bloco cercado com tag da
 *                                    linguagem da trilha, NESTA aula
 *   A20  AULA SEM PROVA (erro)     — aula `regular` sem desafio, ou sem nenhuma
 *                                    construção produtiva nova, não é aula
 *   A21  CARGA DE NOVIDADE (erro)  — |novas colapsadas| ≤ 4 e
 *                                    seções de teoria ≥ max(2, ⌈novas/2⌉)
 *   A22  DUAS FORMAS (aviso)       — cada chave produtiva nova aparece em ≥2
 *                                    ocorrências sintaticamente distintas
 *   A23  DERIVADA MAL DECLARADA    — `introduces.derived` só vale com pai
 *        (erro)                      declarado e CO-OCORRÊNCIA NA MESMA LINHA
 *                                    de um bloco da aula
 *
 * A REGRA DO PAR, FINALMENTE MECÂNICA (A23). O contrato de conteúdo diz que "a
 * chave que distingue + as derivadas que a mesma construção produz
 * inevitavelmente contam como UM item" — e até aqui isso era PROSA: quem
 * contava 2 era o parágrafo do documento, e o único código que contava
 * (`progressao.ts:516`) contava 6 cru e não rodava. Esta bateria faz o
 * colapso, mas exige que ele seja DECLARADO na própria aula e PROVADO pelo
 * disco:
 *
 *     "introduces": {
 *       "productive": ["global:print", "node:Call", "node:StrLiteral"],
 *       "derived": [
 *         { "chave": "node:Call", "de": "global:print" },
 *         { "chave": "node:StrLiteral", "de": "global:print" }
 *       ]
 *     }
 *
 * Uma derivada só é aceita quando existe, em algum bloco de código da teoria
 * DESTA aula, uma LINHA em que a chave e o pai ocorrem juntos — que é
 * exatamente o que "a mesma construção produz inevitavelmente" quer dizer
 * (`print("bom dia")` emite as três na mesma linha). Declaração sem
 * co-ocorrência é A23, e A17/A21 contam a chave cheia. Sem isso, `derived`
 * seria uma porta para calar o gate declarando tudo como derivada.
 *
 * PURO: não abre arquivo, não vai à rede, não chama LLM — nunca. Recebe a
 * trilha já carregada e devolve achados no formato do `audit.ts`.
 *
 * ─── FACHADA (refatoração L04: arquivo ≤500 linhas e toda função CC≤8) ─────
 *
 * Este caminho público continua o contrato estável dos consumidores
 * (`engine/audit.ts`, `modes/convergencia.ts`, `report/report.ts`, CLI e
 * testes); a implementação é re-exportada de seis módulos irmãos, sem mudança
 * de comportamento:
 *
 *   - `barraTipos.ts`     — limiares (A17–A24) e o contrato de achados/métricas;
 *   - `barraLeitura.ts`   — `introduces.derived` e `role` (campos aditivos);
 *   - `barraDemo.ts`      — demonstrações da teoria e o vazamento do quiz (A24);
 *   - `barraGrupos.ts`    — novas/colapso e os grupos da regra do par;
 *   - `barraRegras.ts`    — as regras A17–A24, uma função por regra;
 *   - `barraAuditoria.ts` — o orquestrador (`auditarBarra`/`auditarLicao`).
 */

export * from './barraTipos';
export * from './barraLeitura';
export * from './barraDemo';
export * from './barraGrupos';
export * from './barraRegras';
export * from './barraAuditoria';
