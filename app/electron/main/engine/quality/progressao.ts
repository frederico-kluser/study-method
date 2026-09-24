/**
 * app/electron/main/engine/quality/progressao.ts — a BATERIA A13–A16
 * (ensino-efetivo, micro-avanço, progressividade, primeira-atividade).
 *
 * O orçamento A1–A6 garante "só cobra o que já foi ensinado" por diferença de
 * conjuntos sobre o orçamento CUMULATIVO — e tem os quatro furos que este
 * módulo fecha (spec: `app/content-src/analise-verificadores.md` §3–§6):
 *
 *   A13  ENSINO-EFETIVO — o que a atividade usa/expõe precisa ter sido
 *        DEMONSTRADO num bloco de código (teoria desta aula ou de anteriores —
 *        spec §3.2, para starter/solution E para o teste),
 *        não só liberado pelo orçamento. A semente receptiva do harness
 *        (`HARNESS_RECEPTIVE_SEED`) perdoa em silêncio o pecado nº 1 do
 *        usuário: chamada de função na atividade 1 sem NENHUMA demonstração.
 *        A13d (modo declared): declarar `introduces` não é demonstrar.
 *   A14  MICRO-AVANÇO — A14a: teto de construções VERDADEIRAMENTE novas por
 *        aula (default 4); 0 novas = aviso (aula sem incremento); no modo
 *        declared, `introduces.productive` > 2 = erro (A7/I2 no conteúdo real).
 *        A14b: no máximo 1 construção nova por linha do solutionCode (a lacuna
 *        única do completion problem é uma construção só — "exercitável" §3.6).
 *   A15  PROGRESSIVIDADE — A15a (intra-aula, com 2+ desafios): o degrau reusa
 *        algo do degrau anterior e adiciona no máximo 1 átomo não demonstrado.
 *        A15b (inter-aula): o desafio da aula N reutiliza ≥1 átomo demonstrado
 *        em aulas anteriores (recuperação espaçada, I7 em versão de conteúdo).
 *   A16  PRIMEIRA-ATIVIDADE — o 1º desafio da aula é resolvível com a PRIMEIRA
 *        seção da teoria que tem código + material anterior (§7.1 item 2).
 *
 * Definições (todas derivadas por código, zero LLM — §3.1 da spec):
 *
 *   A(K)          = átomos emitidos por extractAtoms(K)
 *   Demo(i)       = ∪ A(bloco js da teoria de i)
 *   DemoSec1(i)   = ∪ A(blocos js da PRIMEIRA seção de i que tem código)
 *   Cum(i)        = ∪_{j<i} Demo(j)
 *   InitDecl(i)   = introduces declarado de i (modo declared)
 *   AX            = STRUCTURAL_ALWAYS_ALLOWED
 *   H13           = BOILERPLATE ESTREITO (lista versionada abaixo — a semente
 *                   inteira NÃO entra: ela perdoa CallExpression/ArrowFunction
 *                   que H13 propositalmente NÃO perdoa)
 *   S13(code)     = spans MECÂNICOS da superfície (import inteiro; assinatura
 *                   de `test('t', () =>`; `assert.<m>(` até o 1º argumento;
 *                   `() =>` de assert.throws/rejects/doesNotThrow)
 *   Escrito(i)    = A(solutionCode_i) \ A(starterCode_i)
 *   Lido(i)       = A(starterCode_i)
 *   LidoAntes(i)  = A(testsCode_i)
 *
 * As sete regras (a especificação formal e as mensagens pt-BR estão na spec
 * §3–§6; as mensagens aqui são as da spec, texto por texto):
 *
 *   A13a  Escrito(i) ⊆ Demo(i) ∪ Cum(i) ∪ AX ∪ H13            (erro/aviso-D4)
 *   A13b  Lido(i)    ⊆ Demo(i) ∪ Cum(i) ∪ AX ∪ H13            (erro/aviso-D4)
 *   A13c  (LidoAntes(i) \ S13) \ H13 ⊆ Demo(i) ∪ Cum(i) ∪ AX  (erro/aviso-D4;
 *         spec §3.2: a teoria DA MESMA aula também demonstra para o teste — ver
 *         o bloco A13c abaixo; o pecado nº 1 sem demonstração em lugar nenhum
 *         continua sendo erro)
 *   A13d  InitDecl(i) ⊆ Demo(i) ∪ Cum(i)   [só declared]      (erro)
 *   A14a  |Novo(i)| > 4 → erro; == 0 → aviso; [declared] |introduces.productive| > 2 → erro
 *   A14b  >1 ocorrência de chave ∈ Novo(i) na mesma linha da solução → erro
 *   A15a  degrau sem reuso OU com >1 novo não demonstrado → erro
 *   A15b  A(solution_i) ∩ (Cum(i) \ AX) = ∅ (i ≥ 1) → erro
 *   A16b  Escrito(1º desafio) ⊆ DemoSec1(i) ∪ Cum(i) ∪ AX ∪ H13 → erro
 *
 * AVISO13 (D4 — severidade aviso até calibrar): valores/termos que a prosa da
 * teoria pode ensinar sem bloco js (`undefined`, `null`, literais de template,
 * regex, globais String/Number/…). Sem essa lista o gate viraria ruído —
 * medido: 31+18 ocorrências de ruído no corpus real.
 *
 * PURO: este módulo não abre arquivo, não vai à rede e não chama LLM — nunca.
 * Recebe a trilha já carregada (achatada em `ProgressaoLessonInput`) e devolve
 * violações no formato do `audit.ts` (que só adapta o campo `campo`/`faixa`).
 *
 * Referência: `app/content-src/analise-verificadores.md` §3–§6 e
 * `docs/16-engine-de-trilha.md` §5.
 *
 * ─── FACHADA (refatoração L04: arquivo ≤500 linhas e toda função CC≤8) ─────
 *
 * Este caminho público continua o contrato estável dos consumidores
 * (`engine/audit.ts`, testes); a implementação é re-exportada de seis módulos
 * irmãos, sem mudança de comportamento:
 *
 *   - `progressaoVocab.ts`    — `H13` e `AVISO13` (o vocabulário da bateria);
 *   - `progressaoTipos.ts`    — entrada achatada, opções e violações;
 *   - `progressaoSpans.ts`    — os spans mecânicos S13 do arquivo de teste;
 *   - `progressaoDemo.ts`     — Demo(i)/DemoSec1(i) e o colapso do A14b;
 *   - `progressaoRegras.ts`   — as regras A13–A16, uma função por prazo;
 *   - `progressaoAuditoria.ts` — o orquestrador (`auditarProgressao`).
 */

export * from './progressaoVocab';
export * from './progressaoTipos';
export * from './progressaoSpans';
export * from './progressaoDemo';
export * from './progressaoRegras';
export * from './progressaoRegrasAvanco';
export * from './progressaoAuditoria';
