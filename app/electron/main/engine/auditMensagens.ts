/**
 * app/electron/main/engine/auditMensagens.ts — a TRADUÇÃO achado → violação e
 * as mensagens do gate de auditoria (`audit.ts`). Extraído do módulo original
 * na refatoração do lote L05 sem NENHUMA mudança de comportamento (as mensagens
 * são contrato de saída — ver os testes `cx-gap-l05-audit` e `engineAudit*`).
 */

import { axisOf, humanLabel, type AtomKey } from './atomKeys';
import type { LanguageId } from './lang/registry';
import type { AchadoDaBarra } from './quality/barra';
import type { ProgressaoResult } from './quality/progressao';
import type { Surface, Violation } from './auditTypes';

export type ViolacaoDeProgressao = ProgressaoResult['violations'][number];

/**
 * O rótulo HUMANO da linguagem para a mensagem de parse (A2), POR LINGUAGEM.
 *
 * A mensagem antiga cravava "JavaScript" — e numa trilha C isso é diagnóstico
 * ENGANOSO: o testsCode da convenção counter_protocol não parseia como C (a
 * macro `SM_TEST` só é declarada pelo harness), o clang é quem reprovou, e
 * dizer "não parseia como JavaScript" manda o autor consertar a linguagem
 * errada. O `PARSE_ERROR` já carrega o adapterId da trilha — a mensagem usa-o
 * em vez de cravar o default.
 *
 * ESCOPO EXATO DO QUE MUDOU, POR LINGUAGEM (revisão da onda 3):
 *
 *   - JavaScript: byte a byte a mensagem de antes ("`testsCode` não parseia
 *     como JavaScript: …") — o default continuou default, e o teste trava o
 *     formato antigo.
 *   - Python e TypeScript: MUDANÇA INTENCIONAL, declarada. A base cravava
 *     "JavaScript" para TODAS as linguagens não-C, e estas duas herdavam o
 *     rótulo errado — o mesmo defeito enganoso do C. Agora leem "não parseia
 *     como Python" / "… como TypeScript": melhoria de diagnóstico, não efeito
 *     incidental (o registro abaixo já mapeava as duas; a função passou a
 *     lê-lo).
 *   - C: o A2 NÃO MONTA FRASE NENHUMA — a mensagem é o próprio DETALHE do
 *     erro, verbatim. Quando o clang reprovou, o detalhe JÁ abre com o
 *     prefixo canônico "clang reprovou o fonte (l:c): …" (no referencial do
 *     testsCode — a ante-sala de `extract.ts` rebaseia) e prefixar de novo
 *     duplicaria o diagnóstico; quando o detalhe NÃO abre com esse prefixo, a
 *     falha é de tooling ("extrator C ausente", "clang ausente", timeout) e
 *     inventar "clang reprovou" mentiria sobre quem falhou.
 */
const ROTULO_DE_LINGUAGEM: Readonly<Record<string, string>> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
};

export function mensagemDeParse(label: string, adapterId: LanguageId, erro: { message: string }): string {
  if (adapterId === 'c') {
    // DEDUPE + HONESTIDADE DE ORIGEM (revisão da onda 3): o detalhe do
    // adaptador já diz a origem real — "clang reprovou o fonte (l:c): …"
    // quando o clang reprovou, e a própria causa ("extrator C ausente…",
    // "clang ausente…", timeout) quando a falha é de tooling. O prefixo antigo
    // "clang reprovou o `${label}` da trilha C" DUPLICAVA o diagnóstico do
    // clang e MENTIA na falha de tooling. O A2 de C é então o detalhe
    // verbatim — a superfície segue nos campos `campo` e `trechoOfensor` da
    // violação.
    return erro.message;
  }
  const rotulo = ROTULO_DE_LINGUAGEM[adapterId] ?? adapterId;
  return `\`${label}\` não parseia como ${rotulo}: ${erro.message}`;
}

export function messageFor(key: AtomKey, taughtIn: string | null, ref: string, surface: Surface): string {
  const label = humanLabel(key);
  if (taughtIn === null) {
    return `${label} não é ensinado em NENHUMA aula desta trilha — isto é lacuna de currículo, não erro de redação: falta criar a aula atômica que o introduz`;
  }
  if (taughtIn === ref) {
    // O arquivo de teste é a única superfície medida contra o orçamento de
    // ENTRADA, porque o aluno lê o teste ANTES de estudar a aula. Uma
    // construção introduzida por ESTA aula é, para o teste, futuro.
    return surface === 'testsCode'
      ? `${label} é ensinado nesta mesma aula — mas o arquivo de teste é lido ANTES da aula, e por isso só pode usar o orçamento de ENTRADA`
      : `${label} é ensinado nesta mesma aula, e mesmo assim está fora do orçamento desta superfície`;
  }
  return `${label} só é ensinado em \`${taughtIn}\`, que vem DEPOIS de \`${ref}\` — reescreva sem essa construção, ou mova a aula que a ensina para antes`;
}

/**
 * A SUPERFÍCIE de um achado da barra, por regra — tabela explícita, sem
 * adivinhação.
 *
 * A barra mede a AULA (o `lesson.json`), não um desafio: `campo` diz em qual
 * parte do arquivo está a evidência, e é o que o CLI imprime antes da linha:coluna.
 *
 *   A19, A22            → `theory`  (o que falta é DEMONSTRAÇÃO em bloco de código)
 *   A18 com chave       → `theory`  (a mesma falta, na aula 1: "o aluno só copia")
 *   A17, A18, A20, A21, → `lesson`  (o que está errado é o `introduces`, o
 *   A23                             `theory[]` como um todo ou o `challenges[]`)
 */
export function campoDoAchadoDaBarra(achado: AchadoDaBarra): Surface | 'lesson' {
  if (achado.regra === 'A19' || achado.regra === 'A22') return 'theory';
  if (achado.regra === 'A18' && achado.chave !== null) return 'theory';
  return 'lesson';
}

/**
 * A TRADUÇÃO `AchadoDaBarra` → `Violation`, campo por campo, sem inventar campo
 * nenhum. Escrita explícita (e não por spread) porque os dois formatos NÃO são
 * o mesmo objeto: a barra fala de aula e ação prescrita, a violação fala de
 * arquivo, ponto no arquivo e origem da construção.
 *
 *   regra                 ← achado.regra (A17…A23; ids estáveis do catálogo)
 *   arquivo               ← o `lesson.json` da aula (a barra dá a `ref`)
 *   ref, construcao       ← achado.ref, achado.chave
 *   campo                 ← `campoDoAchadoDaBarra` (tabela acima)
 *   linha, coluna         ← 1:1 — A BARRA NÃO MEDE PONTO NO ARQUIVO. Ela mede a
 *                           aula inteira (quantas construções novas, quantas
 *                           seções, se existe desafio), e 1:1 é a MESMA
 *                           convenção que os estruturais I12/I14/I15/I16 já
 *                           usam para o defeito que é do arquivo, não de um
 *                           trecho dele. Cravar a linha de um bloco daria uma
 *                           precisão falsa.
 *   eixo                  ← `axisOf(chave)` quando há chave
 *   faixa                 ← `null` SEMPRE: a barra não confronta superfície
 *                           contra faixa de orçamento (é o que A1–A4 fazem);
 *                           ela mede o TAMANHO DO PASSO. Dizer `productive`
 *                           aqui misturaria o achado da barra com o agrupamento
 *                           por faixa do relatório (§9.2) e mentiria sobre a
 *                           régua que reprovou.
 *   trechoOfensor         ← achado.evidencia (a evidência vem ANTES do veredito,
 *                           §6.3 — é o que o disco mostra)
 *   primeiraAulaQueEnsina ← `firstTaughtIn` da chave, com a PRÓPRIA aula como
 *                           piso. NUNCA `null` quando há chave: `null` significa
 *                           LACUNA DE CURRÍCULO no placar
 *                           (`totals.lacunasDeCurriculo` — "nenhuma aula ensina
 *                           isto, falta criar a aula"), e toda chave de achado
 *                           da barra está declarada no `introduces` DESTA aula,
 *                           por construção (A19/A18/A22 percorrem as novas da
 *                           aula; A23, as derivadas declaradas). O piso é
 *                           necessário e foi MEDIDO: `budget.ts:290` só registra
 *                           `firstTaughtIn` a partir de `introduces.productive`,
 *                           então uma chave nova só RECEPTIVA não está no mapa —
 *                           sem o piso, o `audit` do `rust-iniciante` passava a
 *                           reportar 1 lacuna de currículo que não existe
 *                           (`npm run engine -- audit rust-iniciante --limite 0
 *                           --json` → `totals.lacunasDeCurriculo`: 1 com `null`,
 *                           0 com o piso). Com `chave` nula (A17/A20/A21 e o
 *                           A18 do teto) o campo é `null`, que é a MESMA
 *                           convenção dos estruturais I12/I14/I15/I16/I17 —
 *                           sem construção não existe aula que a ensine, e
 *                           `totals.lacunasDeCurriculo` não conta esses casos
 *                           (ele exige `construcao !== null`). Atenção ao
 *                           imprimir: a saída humana do CLI rotula
 *                           `primeiraAulaQueEnsina === null` como "LACUNA DE
 *                           CURRICULO" (`cli.ts`, na linha do achado), e esse
 *                           rótulo já era impreciso para os estruturais —
 *                           passa a ser também para a barra.
 *   mensagem              ← achado.mensagem + a AÇÃO PRESCRITA do catálogo
 *                           fechado (§6.7). A ação não tem campo em `Violation`,
 *                           e perdê-la seria perder a única parte do achado que
 *                           diz o que FAZER — então ela entra na frase, nomeada.
 *   severidade            ← achado.severidade (A22 é aviso; o resto é erro)
 */
export function violacaoDaBarra(
  achado: AchadoDaBarra,
  lessonDir: string,
  firstTaughtIn: ReadonlyMap<AtomKey, string>,
): Violation {
  return {
    regra: achado.regra,
    arquivo: `${lessonDir}/lesson.json`,
    ref: achado.ref,
    campo: campoDoAchadoDaBarra(achado),
    linha: 1,
    coluna: 1,
    construcao: achado.chave,
    eixo: achado.chave === null ? null : axisOf(achado.chave),
    faixa: null,
    trechoOfensor: achado.evidencia,
    primeiraAulaQueEnsina: achado.chave === null ? null : firstTaughtIn.get(achado.chave) ?? achado.ref,
    mensagem: `${achado.mensagem} — acao prescrita: ${achado.acao}`,
    severidade: achado.severidade,
  };
}

/**
 * A TRADUÇÃO `violations` da bateria A13–A16 → `Violation` do gate, campo por
 * campo (mesmo padrão explícito de `violacaoDaBarra`). As violações são
 * mescladas no loop por aula (mesmo padrão dos estruturais), para que
 * `metrics.violacoes` e o placar contem a bateria nova como as demais.
 */
export function converterViolacaoDeProgressao(pv: ViolacaoDeProgressao): Violation {
  return {
    regra: pv.regra,
    arquivo: pv.arquivo,
    ref: pv.ref,
    campo: pv.campo,
    linha: pv.linha,
    coluna: pv.coluna,
    construcao: pv.construcao,
    eixo: pv.eixo,
    faixa: pv.faixa,
    trechoOfensor: pv.trechoOfensor,
    primeiraAulaQueEnsina: pv.primeiraAulaQueEnsina,
    mensagem: pv.mensagem,
    severidade: pv.severidade,
  };
}
