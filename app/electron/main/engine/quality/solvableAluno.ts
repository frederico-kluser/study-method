/**
 * app/electron/main/engine/quality/solvableAluno.ts — o PROMPT do aluno
 * simulado (contexto = orçamento e nada além) e o PARSE fail-closed da
 * resposta dele (J3, P-19).
 *
 * A prosa normativa vive na fachada `solvable.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { type DadosDoPromptDoAluno, type RespostaDoAluno, type RespostaSemTentativa } from './solvableTipos';

/**
 * Monta o prompt do aluno simulado com EXATAMENTE o contexto dele: enunciado +
 * starter + a lista literal do orçamento. A assinatura é a PROVA estrutural de
 * que a solução de referência, os testes e a teoria não entram: quem chama nem
 * tem onde passá-los (o teste A-P19-4 ainda verifica por string, defesa em
 * profundidade — e um probe de tipo no teste quebra se alguém adicionar campo).
 */
export function montarPromptDoAluno(dados: DadosDoPromptDoAluno): string {
  const linhasOrcamento = dados.orcamento.length > 0
    ? dados.orcamento.map((chave) => `- ${chave}`).join('\n')
    : '- (vazio)';
  return [
    'Você é o ALUNO SIMULADO de um desafio de programação. Seu contexto é EXATAMENTE o que está abaixo — nem mais, nem menos: o enunciado do desafio, o código inicial (starter) e o ORÇAMENTO (a lista literal de construções de linguagem que você pode usar). Você NÃO vê os testes do desafio: eles existem e serão executados por um verificador, fora do seu alcance.',
    '',
    'ORÇAMENTO — construções permitidas (seu ÚNICO vocabulário):',
    linhasOrcamento,
    '',
    'ENUNCIADO DO DESAFIO:',
    dados.enunciado,
    '',
    'CÓDIGO INICIAL (starter):',
    '```js',
    dados.starter,
    '```',
    '',
    'REGRAS:',
    '1. Escreva uma solução completa usando SOMENTE construções do ORÇAMENTO.',
    '2. Não escreva testes. Seu código será executado contra testes externos.',
    '3. Se alguma construção necessária para resolver NÃO estiver no ORÇAMENTO, NÃO invente: reporte bloqueio.',
    '',
    'Responda SOMENTE com JSON, sem markdown e sem comentários, em UM destes dois formatos:',
    '- {"codigo": "..."} — sua tentativa: o arquivo solution.mjs completo (um único arquivo).',
    '- {"bloqueado": true, "precisoDe": ["chave1", "chave2"]} — as construções que faltam ao ORÇAMENTO, da mais necessária para a menos.',
  ].join('\n');
}

/** Schema informativo do callLlm (identidade de cache + documentação). */
export const ALUNO_SCHEMA = JSON.stringify({
  codigo: 'string — tentativa (solution.mjs completo)',
  bloqueado: 'boolean — true marca bloqueio',
  precisoDe: 'string[] — construções que faltam ao orçamento (ordem de necessidade)',
});

/**
 * O objeto JSON já parseado como `{"codigo": …}` ou `{"bloqueado": true,
 * "precisoDe": […]}` — `null` quando a resposta não é nenhum dos dois (aí o
 * chamador devolve `resposta_invalida` com o motivo nominal).
 */
function comoTentativaOuBloqueado(p: Record<string, unknown>): RespostaDoAluno | null {
  if (typeof p.codigo === 'string' && p.codigo.trim().length > 0) {
    return { tipo: 'tentativa', codigo: p.codigo };
  }
  if (p.bloqueado !== true) return null;
  if (!Array.isArray(p.precisoDe) || p.precisoDe.some((item) => typeof item !== 'string')) {
    return { tipo: 'resposta_invalida', razao: 'bloqueado sem precisoDe válido (array de strings)' };
  }
  return { tipo: 'bloqueado', precisoDe: p.precisoDe as string[] };
}

/**
 * Parse da resposta do aluno (fail-closed: shape inesperado = resposta
 * inválida — nunca tentativa inventada, nunca exceção).
 */
export function parseRespostaDoAluno(content: string): RespostaDoAluno {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { tipo: 'resposta_invalida', razao: 'resposta não é JSON válido' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { tipo: 'resposta_invalida', razao: 'resposta não é um objeto JSON' };
  }
  const interpretada = comoTentativaOuBloqueado(parsed as Record<string, unknown>);
  if (interpretada !== null) return interpretada;
  return { tipo: 'resposta_invalida', razao: 'formato de resposta desconhecido (esperado {"codigo": ...} ou {"bloqueado": true, "precisoDe": [...]})' };
}

/** O resultado da medição quando o aluno NÃO devolveu tentativa executável. */
export function resultadoSemTentativa(resposta: RespostaSemTentativa): {
  resposta: RespostaDoAluno;
  passou: false;
  razao: string;
} {
  const razao = resposta.tipo === 'bloqueado'
    ? 'aluno reportou bloqueio: construção necessária fora do orçamento'
    : resposta.razao;
  return { resposta, passou: false, razao };
}
