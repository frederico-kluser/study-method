/**
 * app/electron/main/engine/prompts/author.ts — O PROMPT CENTRAL DO AUTOR DE
 * AULA (pacote P-11, onda 1 do plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §7.1 inteiro (papel,
 * entrada do dossiê, as DEZOITO regras duras numeradas) e as convenções do §7.
 *
 * Este arquivo é onde "mora o estudo de como se ensina uma matéria quebrada
 * em partes simples" (§7.1). O prompt é uma FUNÇÃO PURA do dossiê
 * (`gerarPromptAutor`): mesmo dossiê → mesmo texto BYTE A BYTE (A-P11-3);
 * nenhum estado, nenhum relógio, nenhum random. O orçamento entra LITERAL e
 * COMPLETO no texto (A-P11-2b) e as 18 regras do §7.1 entram TRANSCRITAS,
 * cada uma numa linha nomeada e rastreável por id (`R1`..`R18`), nunca
 * parafraseadas (A-P11-2).
 *
 * Convenções do §7 presentes aqui:
 *   - rastreabilidade por id: `REGRAS_DURAS_DO_AUTOR` é a fonte única, e o
 *     teste barra regra faltante iterando os ids.
 *   - nada da frase proibida ("pense profundamente, passo a passo" e
 *     variações) nem de instrução de recomeço no texto do prompt (A-P11-4) —
 *     descrevemos as proibições SEM citar a literal.
 *   - checksum de cauda (A-P11-5): o prompt TERMINA pedindo a repetição da
 *     lista de construções permitidas; `compararChecksum` é a conferência da
 *     máquina.
 *   - saída de emergência `blocked` como resultado LEGÍTIMO e ESPERADO
 *     (§7.1 R3): improvisar fora do orçamento é o defeito; `isBlocked` é o
 *     discriminador que a aceita como resultado válido, não como falha.
 *   - teto de saída: `MAX_TOKENS_SAIDA_AUTOR = 2000` (§7); o transporte NÃO
 *     trunca ("o transporte devolve o conteúdo INTACTO, sem truncar e sem
 *     reclamar" — callLlm.ts) — o outro lado REJEITA acima do teto via
 *     `rejeitarAcimaDoTeto`.
 *
 * Schema de saída (A-P11-7): o pacote define `AuthorOutputSchema` por
 * ESTENSÃO do `LessonDraftSchema` do P-04 com `raciocinio_de_projeto`
 * posicionado PRIMEIRO (INV-04: justificativa antes de decisão). O zod
 * `.extend()` só anexa; para posicionar o campo na frente reconstruímos o
 * object zod com o shape do draft preservado (mesmos schemas de campo, ordem
 * nova). O lint do P-04 (`lintOrdemCampos`) roda sobre este schema no teste.
 */

import { z } from 'zod';
import { LessonDraftSchema } from '../schemas/artifacts';
import type { Dossier } from './dossier';

// ---------------------------------------------------------------------------
// Teto de saída (§7: "Toda saída cabe em 2.000 tokens")
// ---------------------------------------------------------------------------

/** O teto de toda saída do autor, em tokens (§7). */
export const MAX_TOKENS_SAIDA_AUTOR = 2000;

/**
 * Estimativa local e determinística de tokens (~4 caracteres por token,
 * heurística clássica sem dependência). O valor é contraste, não medição de
 * tokenizer: serve o portão de rejeição, que é fail-closed por construção.
 */
export function estimarTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * A REJEIÇÃO do outro lado (o transporte NÃO trunca — callLlm.ts §"Limite
 * declarado"): conteúdo acima do teto é erro estruturado, nunca saída aceita.
 * Função pura: `void` quando cabe, `Error` quando estoura. A mensagem nomeia
 * o teto e a estimativa medida.
 */
export function rejeitarAcimaDoTeto(content: string): void {
  const estimado = estimarTokens(content);
  if (estimado > MAX_TOKENS_SAIDA_AUTOR) {
    throw new Error(
      `saída do autor acima do teto: ${estimado} tokens estimados > ${MAX_TOKENS_SAIDA_AUTOR} ` +
        '(docs §7, A-P11-5) — o transporte não trunca; a saída é REJEITADA',
    );
  }
}

// ---------------------------------------------------------------------------
// As DEZOITO regras duras do §7.1 — fonte única, uma linha nomeada por regra
// ---------------------------------------------------------------------------

/** Uma regra dura: id rastreável (`R1`..`R18`), nome curto e texto TRANSCRITO do §7.1. */
export interface RegraDuraAutor {
  id: string;
  nome: string;
  /** Transcrição da regra — nunca paráfrase (A-P11-2). */
  texto: string;
}

/**
 * As 18 regras do §7.1, transcritas quase literalmente (ajustes pontuais
 * APENAS onde a literal carregaria um truncamento tipográfico: o exemplo JSON
 * da regra 3 sai com placeholders em vez de reticências — o contrato do
 * `blocked` é fixado na seção SAÍDA do prompt e em `RespostaBlockedSchema`).
 * Cada texto é UMA linha: sem quebras internas.
 */
export const REGRAS_DURAS_DO_AUTOR: readonly RegraDuraAutor[] = [
  {
    id: 'R1',
    nome: 'ordem das habilidades',
    texto:
      'Ordem das habilidades, sem exceção: ler semântica → escrever sintaxe → ler template → escrever template. Read before write; semantics before templates. O estágio de template é opcional por construção.',
  },
  {
    id: 'R2',
    nome: 'prever antes de escrever',
    texto:
      'A primeira interação do aluno é sempre PREVER a saída de um programa que não é dele. Ele nunca começa num editor em branco. A predição pergunta o quê, jamais o como, não conta para nada, e é seguida da execução que a confronta. A posse é monotônica: não é meu → parcialmente meu → meu.',
  },
  {
    id: 'R3',
    nome: 'orçamento é lei',
    texto:
      'Orçamento é lei. Qualquer construção, palavra-chave, operador ou API fora das listas é proibida em qualquer lugar: prosa, exemplo, starter, solução, teste. Se você acha que precisa de algo fora do orçamento, isso é defeito do grafo, não licença. Devolva {"blocked": true, "missing": ["<construção fora do orçamento>"], "motivo": "<por quê>"} e pare. Não improvise, não ensine o pré-requisito de passagem, não explique rapidinho.',
  },
  {
    id: 'R4',
    nome: 'formato segue o tipo de conhecimento',
    texto:
      'O formato segue o tipo de conhecimento. Fato → enunciado direto e drill, não explique (não há o que explicar). Categoria ou conceito → exemplos contrastantes positivos e negativos, deixe induzir. Regra ou habilidade → worked example e prática, evite sobre-explicar. Princípio → explicação com rationale obrigatória. Integrativo → explicação obrigatória; exemplo sozinho não basta.',
  },
  {
    id: 'R5',
    nome: 'formato segue a interatividade dos elementos',
    texto:
      'O formato segue também a interatividade dos elementos, e ela inverte a receita. Se os elementos só fazem sentido juntos (for com condição, incremento e corpo), o worked example antes do primeiro desafio é obrigatório. Se são aprendíveis isoladamente (nomes de tipos, métodos de array, o que é NaN), worked example completo é defeito: deixe o aluno gerar a resposta e receber feedback, porque nesse material quem gera aprende mais.',
  },
  {
    id: 'R6',
    nome: 'onda semântica completa',
    texto:
      'Toda explicação percorre uma onda semântica completa: nomeie o termo técnico → desempacote (troque o termo por palavra comum, dê uma analogia concreta) → reempacote, obrigatoriamente (volte ao termo técnico dentro do código, mostrando a analogia aplicada linha a linha) → diga onde a analogia quebra. Explicação que não sobe de volta é rejeitada. Só termo técnico é flatlining alto; só analogia é flatlining baixo.',
  },
  {
    id: 'R7',
    nome: 'worked example orientado a processo',
    texto:
      'O worked example é orientado a processo, não a produto. Mostre o código sendo construído em incrementos que rodam: escreve poucas linhas → roda → mostra a saída ou o erro real → lê a mensagem → corrige → roda de novo. O aluno precisa ver que programas não são escritos de cima a baixo sem erro numa passada só. As instruções ficam dentro do código como comentários, nunca ao lado. Use os subgoal labels recebidos, sem inventar rótulo novo. Ao menos 2 worked examples por construção nova, variando o contexto e mantendo a estrutura.',
  },
  {
    id: 'R8',
    nome: 'duas formas sintaticamente distintas',
    texto:
      'Nunca introduza a construção nova só com o código mais simples imaginável. Ela deve aparecer em pelo menos duas formas sintaticamente distintas (argumento como literal e como expressão composta; condição como comparação e como booleano pronto). Mostrar um caso só faz o aluno induzir uma regra restrita demais.',
  },
  {
    id: 'R9',
    nome: 'refutar explicitamente',
    texto:
      'Refute explicitamente. Para cada concepção da lista, escreva o par errado/certo ancorado na spec. Tocar num território sem refutar a concepção dele pode reforçá-la.',
  },
  {
    id: 'R10',
    nome: 'pergunta de estado',
    texto:
      'Inclua ao menos um item cuja pergunta seja "qual é o estado agora?", não só "qual é a saída?". Perguntas sobre estado têm taxa de erro dramaticamente mais alta, e é onde moram as concepções erradas.',
  },
  {
    id: 'R11',
    nome: 'retrieval ancestral',
    texto: 'Comece com retrieval — uma pergunta sobre uma aula ancestral declarada.',
  },
  {
    id: 'R12',
    nome: 'três slots',
    texto:
      'Separe três slots: teoria (modelo mental, antes e apartada do desafio), referência just-in-time (sintaxe e assinatura, colada ao desafio) e drill (opcional). Se uma construção foi ensinada há mais de k aulas e não está visível, ela entra na referência just-in-time — exigir na aula 14 algo da aula 6 sem lembrete é atenção dividida no tempo.',
  },
  {
    id: 'R13',
    nome: 'carga germane',
    texto:
      'Proibido adicionar atividade para aumentar a carga germane. Carga germane redistribui, não adiciona. Só existem dois botões: reduzir a carga extrínseca e gerenciar a intrínseca por decomposição.',
  },
  {
    id: 'R14',
    nome: 'reversão de expertise',
    texto:
      'Não re-explique com andaime de novato o que já está consolidado no orçamento. É reversão de expertise, e tem a mesma severidade que cobrar fora do orçamento.',
  },
  {
    id: 'R15',
    nome: 'escopo pedido e pare',
    texto: 'Entregue o escopo pedido e pare. Nada de seção não solicitada.',
  },
  {
    id: 'R16',
    nome: 'sem chave dinâmica nem alias',
    texto: 'Nada de obj[expr] com chave não-literal; nada de alias de função.',
  },
  {
    id: 'R17',
    nome: 'português do brasil',
    texto:
      'Português do Brasil: traduza o conceito, mantenha API e sintaxe em inglês. Termo novo fora da lista é lacuna de currículo, não licença.',
  },
  {
    id: 'R18',
    nome: 'checksum de cauda',
    texto: 'Ao final, repita a lista de construções permitidas (checksum).',
  },
];

// ---------------------------------------------------------------------------
// Schema de saída do autor — estende o draft do P-04 com raciocínio PRIMEIRO
// ---------------------------------------------------------------------------

/**
 * A saída do autor (A-P11-7): `LessonDraftSchema` do P-04 estendido com
 * `raciocinio_de_projeto` posicionado ANTES de qualquer campo de decisão
 * (INV-04, docs §6.3). O zod `.extend()` apenas anexa; aqui reconstruímos o
 * object zod com o shape do draft preservado — mesmos schemas de campo, ordem
 * nova (raciocínio no índice 0). O lint do P-04 roda sobre este schema no
 * teste (`lintOrdemCampos` + `encontrarCamposOpcionais`): com o raciocínio na
 * frente, nenhum par decisão×justificativa fica invertido, e nada fica
 * opcional. Quem registra este schema em `SCHEMA_REGISTRY` (onda 2+) ganha o
 * lint de build de graça.
 */
export const AuthorOutputSchema = z.object({
  raciocinio_de_projeto: z.string().min(1),
  ...LessonDraftSchema.shape,
});
export type SaidaAutor = z.infer<typeof AuthorOutputSchema>;

// ---------------------------------------------------------------------------
// Saída de emergência `blocked` (§7.1 R3) — resultado VÁLIDO, não falha
// ---------------------------------------------------------------------------

/** O contrato do `blocked`: as MESMAS chaves do §7.1 R3, tipadas. */
export const RespostaBlockedSchema = z.object({
  blocked: z.literal(true),
  missing: z.array(z.string()),
  motivo: z.string().min(1),
});
export type RespostaBlocked = z.infer<typeof RespostaBlockedSchema>;

/**
 * O discriminador da saída de emergência: `isBlocked(resposta)` é TRUE para
 * uma resposta `blocked` bem formada — e aceitar `blocked` como RESULTADO
 * VÁLIDO da chamada (não falha) é o comportamento esperado da engine (§7.1
 * R3: "Não improvise"; improvisar é o defeito, blocked é a saída legítima).
 * A chamada faz `isBlocked(resposta) ? tratarBlocked(...) : AuthorOutputSchema.parse(...)`.
 * Função pura, sem efeitos.
 */
export function isBlocked(resposta: unknown): resposta is RespostaBlocked {
  return RespostaBlockedSchema.safeParse(resposta).success;
}

// ---------------------------------------------------------------------------
// Checksum de cauda (A-P11-5)
// ---------------------------------------------------------------------------

/**
 * A lista de construções PERMITIDAS, derivada do dossiê: a união das três
 * listas de orçamento (receptivo ∪ produtivo ∪ teste), na ordem do dossiê, sem
 * duplicatas. É exatamente o que o prompt manda o modelo repetir no final e o
 * que `compararChecksum` confere.
 */
export function construcoesPermitidas(dossie: Dossier): string[] {
  const uniao: string[] = [];
  for (const lista of [dossie.budget_receptivo, dossie.budget_produtivo, dossie.budget_teste]) {
    for (const item of lista) {
      if (!uniao.includes(item)) {
        uniao.push(item);
      }
    }
  }
  return uniao;
}

/** O resultado da conferência da máquina contra a repetição do modelo. */
export interface ResultadoChecksum {
  /** true quando a repetição confere (sem faltando e sem extras). */
  ok: boolean;
  /** itens permitidos que o modelo NÃO repetiu. */
  faltando: string[];
  /** itens que o modelo repetiu e NÃO estão na lista permitida. */
  extras: string[];
}

/** Extrai itens de texto de lista: trims, bullets de markdown e crases. */
function normalizarItensDeLista(linhas: readonly string[]): string[] {
  const itens: string[] = [];
  for (const linha of linhas) {
    let limpa = linha.trim();
    limpa = limpa.replace(/^[-*]\s+/, '');
    limpa = limpa.replace(/^`|`$/g, '');
    if (limpa.length > 0 && !limpa.startsWith('#')) {
      itens.push(limpa);
    }
  }
  return itens;
}

/**
 * A conferência da máquina (A-P11-5): compara a lista permitida com a
 * repetição do modelo; DIVERGÊNCIA detectada (faltando ≠ vazio ou extras ≠
 * vazio) devolve `ok: false` com os dois lados nomeados. Função pura, sem
 * lançamento — quem chama decide o tratamento (fail-closed é do chamador).
 */
export function compararChecksum(listaPermitida: readonly string[], respostaModelo: string): ResultadoChecksum {
  const esperado = normalizarItensDeLista(listaPermitida);
  const obtido = normalizarItensDeLista(respostaModelo.split(/\r?\n/));
  const faltando = esperado.filter((item) => !obtido.includes(item));
  const extras = obtido.filter((item) => !esperado.includes(item));
  return { ok: faltando.length === 0 && extras.length === 0, faltando, extras };
}

// ---------------------------------------------------------------------------
// A renderização do prompt (função pura do dossiê — A-P11-3)
// ---------------------------------------------------------------------------

function renderItens(itens: readonly string[]): string {
  return itens.map((item) => `  - ${item}`).join('\n');
}

function renderObjetivo(dossie: Dossier): string {
  const o = dossie.objetivo;
  return [
    `objetivo.verbo: ${o.verbo}`,
    `objetivo.objeto: ${o.objeto}`,
    `objetivo.contexto: ${o.contexto}`,
    `objetivo.criterio: ${o.criterio}`,
  ].join('\n');
}

function renderDesafiosJaEscritos(dossie: Dossier): string {
  if (dossie.desafios_ja_escritos.length === 0) {
    return '  (nenhum desafio escrito ainda)';
  }
  const blocos = dossie.desafios_ja_escritos.map((d) => {
    const linhas: string[] = [];
    linhas.push(`  desafio.slug: ${d.slug}`);
    linhas.push(`  desafio.conceito: ${d.conceito}`);
    linhas.push(`  desafio.statement: ${d.statement}`);
    linhas.push(`  desafio.starterCode: ${d.starterCode}`);
    linhas.push(`  desafio.solutionCode: ${d.solutionCode}`);
    linhas.push(`  desafio.testsCode: ${d.testsCode}`);
    linhas.push(`  desafio.expectedTestCount: ${d.expectedTestCount}`);
    linhas.push(`  desafio.outputChannel: ${d.outputChannel}`);
    linhas.push(`  desafio.requires: ${d.requires.join(', ')}`);
    linhas.push(`  desafio.notRequired: ${d.notRequired.join(', ')}`);
    linhas.push(`  desafio.subgoals: ${d.subgoals.join(', ')}`);
    for (const cenario of d.scenarios) {
      linhas.push(`  desafio.cenario: [tipo=${cenario.tipo}, derivado_de=${cenario.derivado_de}] ${cenario.descricao}`);
    }
    linhas.push(`  desafio.taskSkill: ${d.taskSkill}`);
    linhas.push(`  desafio.supportLevel: ${d.supportLevel}`);
    linhas.push(`  desafio.surfaceDomain: ${d.surfaceDomain}`);
    linhas.push(`  desafio.solutionAlternates: ${d.solutionAlternates.join(', ')}`);
    linhas.push(`  desafio.wrongSolutions: ${d.wrongSolutions.join(', ')}`);
    for (const req of d.requirements) {
      linhas.push(`  desafio.requirement: [id=${req.id}, teste=${req.teste}] ${req.descricao}`);
    }
    linhas.push(`  desafio.justificativa: ${d.justificativa}`);
    linhas.push(`  desafio.aprovado: ${String(d.aprovado)}`);
    return linhas.join('\n');
  });
  return blocos.join('\n');
}

/** O dossiê COMPLETO (todos os campos do §7.1), literal e integral. */
function renderDossie(dossie: Dossier): string {
  const linhas: string[] = [];
  linhas.push(renderObjetivo(dossie));
  linhas.push('');
  linhas.push('introduces.productive (máximo 2):');
  linhas.push(renderItens(dossie.introduces_productive));
  linhas.push('');
  linhas.push('budget_produtivo (lista literal e completa, sem resumo, sem truncamento):');
  linhas.push(renderItens(dossie.budget_produtivo));
  linhas.push('');
  linhas.push('budget_receptivo (lista literal e completa, sem resumo, sem truncamento):');
  linhas.push(renderItens(dossie.budget_receptivo));
  linhas.push('');
  linhas.push('budget_teste (lista literal e completa, sem resumo, sem truncamento):');
  linhas.push(renderItens(dossie.budget_teste));
  linhas.push('');
  linhas.push(`kc_type: ${dossie.kc_type}`);
  linhas.push(`ei_class: ${dossie.ei_class}`);
  linhas.push('');
  linhas.push('subgoals (labels que o worked example DEVE usar sem inventar rótulo novo):');
  linhas.push(renderItens(dossie.subgoals));
  linhas.push('');
  linhas.push('terms já definidos (reutilizar, nunca redefinir):');
  linhas.push(renderItens(dossie.terms));
  linhas.push('');
  linhas.push(`notional_machine_delta: ${dossie.notional_machine_delta}`);
  linhas.push('');
  linhas.push('fora_de_escopo (com motivo de cada item):');
  linhas.push(dossie.fora_de_escopo.map((item) => `  - ${item.item} — motivo: ${item.motivo}`).join('\n'));
  linhas.push('');
  linhas.push('misconceptions_a_refutar (com âncora na spec):');
  linhas.push(
    dossie.misconceptions_a_refutar.map((c) => `  - ${c.concepcao} — ancora_na_spec: ${c.ancora_na_spec}`).join('\n'),
  );
  linhas.push('');
  linhas.push('desafios já escritos (a teoria desta aula precisa ensinar o que eles cobram):');
  linhas.push(renderDesafiosJaEscritos(dossie));
  return linhas.join('\n');
}

function renderRegras(): string {
  return REGRAS_DURAS_DO_AUTOR.map((regra) => `${regra.id} — ${regra.nome}: ${regra.texto}`).join('\n');
}

const PAPEL_E_ESTADO = [
  '=== PAPEL ===',
  'Você é o AUTOR DE AULA da engine de trilhas. Escreve UMA aula atômica. Não vê as outras aulas, não decide o que vem antes ou depois. Recebe um estado de conhecimento exato (o dossiê congelado abaixo) e escreve o MENOR incremento demonstrável sobre ele.',
  '',
  '=== ESTADO DE CONHECIMENTO EXATO ===',
  'O dossiê abaixo é o estado de conhecimento exato do aluno neste ponto, congelado no FREEZE: nada além destes campos é conhecido. Os orçamentos são LISTAS LITERAIS E COMPLETAS — nenhum resumo, nenhum trecho truncado, nenhuma omissão. Tudo o que o aluno já consolida está no orçamento receptivo; o que a aula introduz está em introduces.productive. Nenhuma construção fora das listas entra em lugar nenhum.',
].join('\n');

const CONVENCOES = [
  '=== CONVENCOES (§7) ===',
  '- Raciocínio antes de decisão (INV-04): em todo campo de decisão do schema de saída, o raciocínio vem ANTES — escreva a justificativa primeiro e decida depois.',
  '- Teto de saída: toda a sua resposta (draft ou blocked) cabe em 2000 tokens. O transporte não trunca: acima do teto a saída é REJEITADA pelo outro lado. Produza dentro do teto.',
  '- O controle de profundidade do raciocínio é parâmetro do sistema, não texto do prompt: não peça ao aluno raciocínio encenado em etapas e não escreva a frase proibida por convenção neste documento.',
  '- Proibido descartar a aula e reiniciá-la em branco: as restrições do orçamento se acumulam ao longo do texto, e reiniciar apagaria exatamente as restrições que garantem a proibição dura.',
  '- Não improvise dentro da resposta: se o orçamento não permite o que a aula pede, isso é defeito do grafo, não licença — responda blocked (seção SAÍDA) e pare.',
].join('\n');

const SAIDA = [
  '=== SAIDA ===',
  'Duas formas de resposta, excludentes:',
  '',
  '1) DRAFT (a aula inteira) — um objeto JSON com EXATAMENTE estes campos, na ordem:',
  'raciocinio_de_projeto (a justificativa do projeto da aula, escrita ANTES de qualquer decisão), slug, title, objective {verbo, enunciado, contexto, criterio}, introduces {receptive[], productive[] com no máximo 2 itens}, introducesTerms[], foraDeEscopo[] (não vazio), eiClass (fato|categoria|regra|principio|integrativo), targetAtom, notionalMachineDelta, budgetHash, budgetVersion, research[], theory[] (seções teoria|referencia|drill; cada item com id, markdown e tag), justificativa, role (regular|integration), status (rascunho|pronto_para_revisao|bloqueado|aprovado), aprovado.',
  'Nenhum campo é opcional: ausência semanticamente válida é valor vazio EXPLÍCITO (array vazio, string vazia, ou a string vazia onde o tipo pede texto).',
  '',
  '2) BLOCKED (emergência legítima e esperada quando o orçamento não permite o que a aula pede) — um objeto JSON EXATO com estas chaves:',
  '{"blocked": true, "missing": ["<cada construção fora do orçamento>"], "motivo": "<por que o orçamento vigente não permite>"}',
  'blocked é resultado VÁLIDO da chamada, não falha; improvisar é que é defeito.',
].join('\n');

/** A cauda de checksum — o prompt TERMINA aqui (A-P11-5). */
function renderChecksumDeCauda(dossie: Dossier): string {
  return [
    '=== CHECKSUM DE CAUDA ===',
    'Ao final da sua resposta, repita a lista de construções permitidas, item a item, sem resumo e sem truncamento. A máquina confere a sua repetição contra esta lista e a divergência rejeita a saída. Repita mesmo quando a sua resposta for blocked, como seção final. A lista de construções permitidas é:',
    renderItens(construcoesPermitidas(dossie)),
  ].join('\n');
}

/**
 * O PROMPT CENTRAL do autor, FUNÇÃO PURA do dossiê (A-P11-3): mesmo dossiê →
 * mesmo texto byte a byte. Seções: papel/estado → dossiê completo (12 campos
 * do §7.1, literal) → as 18 regras duras transcritas (R1..R18) → convenções
 * do §7 → saída (draft com raciocínio primeiro, ou blocked) → checksum de
 * cauda (o prompt TERMINA com ele).
 */
export function gerarPromptAutor(dossie: Dossier): string {
  const partes = [
    PAPEL_E_ESTADO,
    '=== DOSSIE (entrada congelada) ===',
    renderDossie(dossie),
    '=== AS DEZOITO REGRAS DURAS (§7.1) ===',
    renderRegras(),
    CONVENCOES,
    SAIDA,
    renderChecksumDeCauda(dossie),
  ];
  return partes.join('\n\n') + '\n';
}