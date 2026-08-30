/**
 * app/electron/main/engine/prompts/reviewer.ts — PROMPT DO REVISOR da engine
 * de trilhas (pacote P-12, onda 1 do plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6.2 (papéis e
 * restrições de roteamento), §6.3 (schema do apontamento — evidência antes
 * do veredito), §6.5 (severidade por TABELA FIXA, nunca opinada; sem nota
 * 1–5), §7 (convenções dos prompts canônicos) e §7.2 (o revisor).
 *
 * O REVISOR não escreve, não pontua e não aprova (§7.2):
 *
 *   - A proibição de código é ESTRUTURAL, não exortativa (A-P12-1): o schema
 *     de SAÍDA do revisor é `RevisaoSchema` (findings do P-04 + bloco de
 *     cinco predicados, nenhum com campo de código) com STRICT em TODOS os
 *     níveis (onda 2 — H-1): `alvo`/`evidencia` são reconstruídos como
 *     `z.object(...).strict()` — o `.strict()` de topo sozinho deixaria o
 *     strip-mode aninhado descartar `codigo`/`patch`/`correcao` em silêncio
 *     (success=true). Além do zod strict, `validarRevisaoSemCodigo` percorre
 *     o DRAFT CRU antes do parse (fail-closed: a PRESENÇA da chave
 *     `code`/`codigo`/`patch`/`correcao`/`correcao_sugerida`/`fix` em qualquer
 *     profundidade invalida a resposta, mesmo que o zod a removesse).
 *   - O modelo NÃO emite `severity` (onda 2 — H-4): `RevisaoSchema` omite o
 *     campo (o exemplo de saída do prompt o remove e instrui explicitamente a
 *     não emiti-lo); a severidade é anexada PELA TABELA FIXA do §6.5 depois
 *     do parse, por `anexarSeveridadePorTabela` — saída do modelo COM
 *     `severity` é REJEITADA (campo extra em schema strict).
 *   - O revisor NUNCA recebe o raciocínio, o plano ou o rascunho do AUTOR
 *     (§6.2; A-P12-6): `construirPromptRevisor` é uma função PURA cuja
 *     entrada tem EXATAMENTE três campos — artefato NORMALIZADO (saída de
 *     `review/normalize.ts`), catálogo de regras e saída dos verificadores
 *     determinísticos. Não existe campo onde o rascunho do autor caiba, e o
 *     prompt construído não contém esses materiais.
 *   - INV-04 (§6.3): o bloco de predicados tem `justificativa` ANTES de
 *     `veredito` (o nome `veredito` está em `DECISION_FIELD_NAMES` do lint
 *     do P-04 — a ordem é imposta em build, não por nota de review).
 *   - "Nada de 'pense profundamente, passo a passo'" e "Proibido 'recomece
 *     do zero'" (§7) — o controle de profundidade é parâmetro, não texto;
 *     o prompt abaixo não contém nenhuma das duas frases.
 *
 * Este arquivo NÃO escreve em disco, não chama LLM e não valida nada além
 * da própria montagem: `construirPromptRevisor` devolve uma string pronta
 * para o laço F11 (onda 3) mandar ao modelo do revisor juntamente com o
 * `RevisaoSchema` como contrato de saída estruturada.
 */

import { z } from 'zod';

import { ApontamentoSchema, FindingsSchema, SeveritySchema } from '../schemas/artifacts';
import { severidadeDeCategoria } from '../review/normalize';

// ---------------------------------------------------------------------------
// Catálogo de regras (entrada do prompt)
// ---------------------------------------------------------------------------

/** Uma regra do catálogo FECHADO de regras (a constituição C1–C8 do §6.7). */
export interface RegraDoCatalogo {
  /** identificador normativo da regra (ex.: `'C1'`). */
  id: string;
  /** texto normativo da regra, um parágrafo. */
  texto: string;
}

/**
 * A entrada do prompt do revisor — EXATAMENTE estes três campos (A-P12-6).
 * Não há campo para raciocínio, plano ou rascunho do AUTOR: a ausência é
 * estrutural, o prompt simplesmente não os contém (§6.2 restrição 3).
 */
export interface EntradaPromptRevisor {
  /**
   * O artefato NORMALIZADO (saída de `review/normalize.ts`): sem comentários,
   * sem autoria, sem nome de modelo, sem changelog, sem auto-avaliação e com
   * tom neutralizado. Nunca o rascunho do autor. O laço F11 pode prefixar um
   * cabeçalho `Artefato:`/`Rodada:`/`Hash:` — o prompt instrui ecoar esses
   * valores quando presentes.
   */
  artefatoNormalizado: string;
  /** o catálogo FECHADO de regras (C1–C8); nunca vazio (FAIL-CLOSED). */
  regras: readonly RegraDoCatalogo[];
  /**
   * Saída dos verificadores determinísticos (violações tipadas do §6.1) —
   * texto já montado pelo laço; string vazia é renderizada como "nenhuma
   * violação mecânica".
   */
  verificadores: string;
}

// ---------------------------------------------------------------------------
// O bloco de cinco predicados por aula (§7.2)
// ---------------------------------------------------------------------------

/**
 * Os cinco predicados por aula do §7.2 — respondidos com sim/não e
 * justificativa, SEM escrever código. Ordem fixa e versionada: mudar uma
 * pergunta aqui muda o prompt e o contrato de saída de uma vez.
 */
export const PREDICADOS_DA_AULA: readonly { id: string; pergunta: string }[] = [
  {
    id: 'E1',
    pergunta: 'A aula contém elemento sintático E semântico novo (em relação ao orçamento de entrada)?',
  },
  {
    id: 'E2',
    pergunta: 'A aula é adição mínima ao conhecimento prévio (nada além do incremento declarado)?',
  },
  {
    id: 'E3',
    pergunta: 'A aula está explicitamente relacionada a um pré-requisito nomeado?',
  },
  {
    id: 'E4',
    pergunta: 'A construção nova aparece em um exemplo relevante da teoria?',
  },
  {
    id: 'E5',
    pergunta: 'A construção nova é exigida no desafio desta aula?',
  },
];

/**
 * Um predicado respondido. INV-04 (§6.3): `justificativa` (evidência) vem
 * ANTES de `veredito` (decisão sim/não) — `veredito` é nome reconhecido pelo
 * `lintOrdemCampos` do P-04, então inverter a ordem QUEBRA o build. Nenhum
 * campo de código (A-P12-1): predicados se respondem em prosa, §7.2.
 */
export const PredicadoSchema = z
  .object({
    id: z.enum(['E1', 'E2', 'E3', 'E4', 'E5']),
    pergunta: z.string().min(1),
    justificativa: z.string().min(1),
    veredito: z.enum(['sim', 'nao']),
  })
  .strict();

/** Os cinco predicados juntos — exatamente 5 itens (§7.2). */
export const PredicadosSchema = z
  .object({
    predicados: z.array(PredicadoSchema).length(5),
  })
  .strict();

// ---------------------------------------------------------------------------
// Rejeição estrutural de código em QUALQUER profundidade (A-P12-1; H-1)
// ---------------------------------------------------------------------------

/**
 * Nomes de chave PROIBIDOS na resposta do revisor, em QUALQUER nível (H-1):
 * `code`, `codigo`, `patch`, `correcao`, `correcao_sugerida`, `fix`. A
 * PRESENÇA da chave invalida a resposta — mesmo que o zod a removesse em
 * modo strip — por isso a varredura roda sobre o DRAFT CRU, antes do parse.
 */
export const NOMES_PROIBIDOS_DE_CODIGO: readonly string[] = [
  'code',
  'codigo',
  'patch',
  'correcao',
  'correcao_sugerida',
  'fix',
];

/** Normaliza uma chave para comparação: minúsculas, sem separadores. */
function chaveNormalizadaDeCodigo(chave: string): string {
  return chave.toLowerCase().replace(/[_\- ]/g, '');
}

/**
 * Percorre um valor JSON (o DRAFT cru da resposta do modelo) em qualquer
 * profundidade — objetos, arrays e valores — e devolve os CAMINHOS (notação
 * por pontos) de toda chave cujo nome normalizado é um dos
 * `NOMES_PROIBIDOS_DE_CODIGO`. FAIL-CLOSED (H-1): a PRESENÇA da chave já
 * invalida, mesmo que o zod a removesse no strip-mode do P-04. Casamento por
 * igualdade normalizada, nunca por substring: `fixacao`/`codigoFonte` não
 * são falso-positivo.
 */
export function encontrarChavesDeCodigoNoDraft(draft: unknown, prefixo = '$'): string[] {
  const encontradas: string[] = [];
  const visitados = new WeakSet<object>();
  const normalizadosProibidos = new Set(NOMES_PROIBIDOS_DE_CODIGO.map(chaveNormalizadaDeCodigo));

  const percorrer = (valor: unknown, caminho: string): void => {
    if (valor === null || typeof valor !== 'object') return;
    if (visitados.has(valor)) return;
    visitados.add(valor);
    if (Array.isArray(valor)) {
      valor.forEach((item, indice) => percorrer(item, `${caminho}[${indice}]`));
      return;
    }
    for (const [chave, filho] of Object.entries(valor)) {
      if (normalizadosProibidos.has(chaveNormalizadaDeCodigo(chave))) {
        encontradas.push(`${caminho}.${chave}`);
      }
      percorrer(filho, `${caminho}.${chave}`);
    }
  };

  percorrer(draft, prefixo);
  return encontradas;
}

/**
 * FAIL-CLOSED para o laço F11 (H-1): valida que a resposta CRUA do modelo não
 * traz chave de código em nenhuma profundidade e LANÇA se trouxer (com os
 * caminhos). Roda sobre o DRAFT CRU, ANTES do parse — um zod em strip-mode
 * removeria as chaves e o parse passaria com success=true.
 */
export function validarRevisaoSemCodigo(draft: unknown): void {
  const ocorrencias = encontrarChavesDeCodigoNoDraft(draft);
  if (ocorrencias.length > 0) {
    throw new Error(
      `resposta do revisor inválida: chave(s) de código em ${ocorrencias.join('; ')} — a proibição é estrutural (A-P12-1)`,
    );
  }
}

// ---------------------------------------------------------------------------
// O schema de SAÍDA do revisor (sem `severity` — H-4; strict em todo nível)
// ---------------------------------------------------------------------------

/**
 * O apontamento NA SAÍDA DO MODELO (H-4): o `ApontamentoSchema` do P-04 SEM o
 * campo `severity` — a severidade é derivada por TABELA FIXA fora da
 * resposta (`anexarSeveridadePorTabela`, abaixo). Strict em TODOS os níveis
 * (H-1): `alvo`/`evidencia` são reconstruídos como `z.object(...).strict()`
 * para que QUALQUER chave extra em QUALQUER profundidade — inclusive
 * `severity` e chaves de código — seja REJEITADA, e não silenciosamente
 * strippada como no strip-mode do P-04 (artifacts.ts usa `z.object` puro).
 */
const ApontamentoDoRevisorSchema = z
  .object({
    ...ApontamentoSchema.omit({ severity: true }).shape,
    alvo: z.object(ApontamentoSchema.shape.alvo.shape).strict(),
    evidencia: z.object(ApontamentoSchema.shape.evidencia.shape).strict(),
  })
  .strict();

/**
 * A SAÍDA do revisor por rodada (H-4): o `FindingsSchema` do P-04 (apontamentos
 * com evidência antes de veredito, sem campo de código/patch e SEM `severity`)
 * + o bloco dos cinco predicados. Usada pelo laço F11 (onda 3) para validar a
 * resposta estruturada do modelo; `anexarSeveridadePorTabela` regenera a
 * severidade DEPOIS do parse. Passa no `lintOrdemCampos` (INV-04) e na
 * varredura de campos opcionais (INV-05) — verificado em
 * `tests/engineReviewer.test.ts`.
 */
export const RevisaoSchema = z
  .object({
    ...FindingsSchema.shape,
    apontamentos: z.array(ApontamentoDoRevisorSchema).max(12),
    predicados: z.array(PredicadoSchema).length(5),
  })
  .strict();

/** A revisão como o MODELO a produz (sem `severity` em nenhum apontamento). */
export type RevisaoDoRevisor = z.infer<typeof RevisaoSchema>;

type Severidade = z.infer<typeof SeveritySchema>;

/** A revisão DEPOIS do pipeline: cada apontamento ganhou `severity` da tabela. */
export type RevisaoComSeveridade = Omit<RevisaoDoRevisor, 'apontamentos'> & {
  apontamentos: Array<RevisaoDoRevisor['apontamentos'][number] & { severity: Severidade }>;
};

/**
 * O PIPELINE após o parse (H-4): anexa a severidade de CADA apontamento pela
 * TABELA FIXA do §6.5 (`severidadeDeCategoria`), nunca por opinião do modelo.
 * Categoria desconhecida LANÇA (`ErroDeCategoriaDesconhecida`, FAIL-CLOSED) —
 * catálogo fora de sincronia para o laço F11. O resultado tem o mesmo formato
 * do `FindingsSchema` do P-04 (com `severity`), inclusive validando nos
 * schemas originais.
 */
export function anexarSeveridadePorTabela(revisao: RevisaoDoRevisor): RevisaoComSeveridade {
  return {
    ...revisao,
    apontamentos: revisao.apontamentos.map((apontamento) => ({
      ...apontamento,
      severity: severidadeDeCategoria(apontamento.categoria),
    })),
  };
}

// ---------------------------------------------------------------------------
// O prompt — função PURA
// ---------------------------------------------------------------------------

/** Renderização determinística do catálogo de regras para dentro do prompt. */
function renderizarRegras(regras: readonly RegraDoCatalogo[]): string {
  if (regras.length === 0) {
    throw new Error('prompt do revisor: catálogo de regras vazio — o revisor sem constituição não existe (FAIL-CLOSED)');
  }
  return regras.map((r) => `- ${r.id}: ${r.texto}`).join('\n');
}

/** Renderização determinística da saída dos verificadores. */
function renderizarVerificadores(saida: string): string {
  const texto = saida.trim();
  return texto.length > 0 ? texto : '(nenhuma violação mecânica — verificadores verdes)';
}

const CATEGORIAS_VALIDAS =
  'construcao_nao_ensinada, api_nao_ensinada, pre_requisito_violado, teste_invalido, ' +
  'gabarito_nao_passa, cobertura_faltante, teoria_desalinhada_do_desafio, ambiguidade_de_enunciado, ' +
  'granularidade, estilo, tom, prosa';

/**
 * Monta o prompt completo do revisor (system/instruções + entrada). Função
 * PURA: mesma entrada → mesma string, zero efeito colateral. O resultado
 * NÃO contém o raciocínio, o plano nem o rascunho do autor (A-P12-6) — os
 * únicos três insumos são os três campos de `EntradaPromptRevisor`.
 */
export function construirPromptRevisor(entrada: EntradaPromptRevisor): string {
  const { artefatoNormalizado, regras, verificadores } = entrada;
  const perguntaDosPredicados = PREDICADOS_DA_AULA.map((p) => `- ${p.id} — ${p.pergunta}`).join('\n');

  return [
    'Você é o REVISOR da engine de trilhas de aprendizado. Seu ÚNICO papel é apontar defeitos verificáveis.',
    'Você NÃO escreve código, NÃO pontua e NÃO aprova: não há campo de código, nota nem veredito agregado',
    'na saída — a proibição é estrutural, o schema de saída não tem onde colocá-los.',
    '',
    'Você recebe APENAS os três blocos desta mensagem: (1) o catálogo de regras, (2) a saída dos',
    'verificadores determinísticos e (3) o artefato a revisar — já NORMALIZADO (sem autoria, sem',
    'comentários, sem changelog, sem auto-avaliação). Nenhum outro material do processo de autoria.',
    '',
    '## Regras duras',
    '- Todo apontamento carrega evidência CITÁVEL e verificável: alvo com `caminho`, `linha`, `span`',
    '  [início, fim] em caracteres do artefato, `no_ast` e `token`; `evidencia.prova` deve citar um',
    '  trecho literal que exista no artefato, DENTRO do span informado. Apontamento sem span é',
    '  descartado antes de chegar ao planejador.',
    '- Reporte TUDO o que encontrar. A triagem por severidade é etapa separada e não é sua: não cale',
    '  achado por julgar "pouco grave" e não se instrua a ser conservador — você reporta, não calibra.',
    '- Não use nota de 1 a 5 e não atribua severidade por opinião: escolha apenas a `categoria` do',
    '  catálogo abaixo; a severidade é derivada por TABELA FIXA fora da sua resposta (nunca por você).',
    '- NÃO inclua o campo "severity" em NENHUM apontamento: o schema de saída o REJEITA (é campo',
    '  extra, a proibição é estrutural). Sua resposta termina em `categoria`; a severidade é anexada',
    '  pelo pipeline, por tabela fixa, depois do seu JSON.',
    `- Categorias válidas de apontamento (escolha EXATAMENTE uma por apontamento): ${CATEGORIAS_VALIDAS}.`,
    '- NÃO escreva código em lugar nenhum da sua resposta. A saída é APENAS o JSON do formato abaixo.',
    '- Você não aprova nem reprova o artefato: não existe campo de aprovação na sua saída.',
    '',
    '## Os cinco predicados por aula',
    perguntaDosPredicados,
    'Para cada predicado: responda `sim` ou `não` com uma justificativa que cite o trecho do artefato',
    'que a sustenta. Nenhum predicado exige escrever código. Na resposta em JSON, a ordem dos campos',
    'do item é `id`, `pergunta`, `justificativa`, `veredito` — justificativa ANTES do veredito. Produza',
    'EXATAMENTE cinco itens, `E1` a `E5`, na ordem do bloco acima.',
    '',
    '## Formato de saída',
    'Responda APENAS com JSON válido neste formato (todo campo é obrigatório):',
    '{',
    '  "artefato": "m01/a03",',
    '  "hash_artefato": "abc123",',
    '  "rodada": 1,',
    '  "apontamentos": [',
    '    {',
    '      "id": "APT-0042",',
    '      "rodada": 1,',
    '      "artefato": "desafio",',
    '      "alvo": { "caminho": "…", "linha": 7, "span": [122, 149], "no_ast": "ThrowStatement", "token": "throw" },',
    '      "evidencia": {',
    '        "tipo": "orcamento",',
    '        "prova": "token `throw` não pertence ao orçamento de m01/a03",',
    '        "introduzido_em": "m02/a05",',
    '        "reproduzivel_por": "npm run engine -- audit m01/a03"',
    '      },',
    '      "defeito": "O desafio usa `throw` na linha 7.",',
    '      "regra_violada": "C1",',
    '      "categoria": "construcao_nao_ensinada",',
    '      "acao_sugerida": "…",',
    '      "confianca": 0.95',
    '    }',
    '  ],',
    '  "resumo": "…",',
    '  "predicados": [',
    '    { "id": "E1", "pergunta": "…", "justificativa": "…", "veredito": "sim" }',
    '  ]',
    '}',
    'Se o cabeçalho do artefato recebido tiver linhas `Artefato:`, `Rodada:` e `Hash:`, ecoe esses',
    'valores em `artefato`, `rodada` e `hash_artefato`; em apontamentos, `artefato` é o tipo do alvo',
    '(`desafio` ou o nome do arquivo revisado).',
    '',
    '## Catálogo de regras',
    renderizarRegras(regras),
    '',
    '## Saída dos verificadores determinísticos',
    renderizarVerificadores(verificadores),
    '',
    '## Artefato a revisar (normalizado)',
    artefatoNormalizado,
  ].join('\n');
}