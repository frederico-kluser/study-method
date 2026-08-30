/**
 * app/electron/main/engine/review/prover.ts — o PROVADOR (pacote P-18, onda 3
 * do plano de execução v1 — o laço F11).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6.1 fluxo 4 ("PROVADOR
 * (script) — transforma candidato em pin executável que falha hoje; candidato
 * sem pin MORRE EM SILÊNCIO") e §6.7 ("Pins de regressão — todo defeito
 * confirmado e corrigido vira IMEDIATAMENTE um teste executável, e nenhuma
 * correção posterior é aceita se quebrar um pin já verde. O conjunto inteiro
 * roda a cada rodada. Ordem de aquisição: pins baratos (token proibido na
 * AST) antes de caros (execução).").
 *
 * TRÊS blocos:
 *
 *   1. `pinAst(artefato, trecho) → boolean` — o PIN BARATO POR AST, FUNÇÃO
 *      PURA: devolve `true` quando o artefato AINDA contém a construção
 *      ofensora exemplificada por `trecho` (token/construção proibida). Verde
 *      ⇔ o defeito saiu ⇔ `pinAst === false`. Dois caminhos DECLARADOS:
 *      (a) por AST quando `trecho` parseia: compara os ATÔMOS SUBSTANTIVOS do
 *      trecho contra o conjunto do artefato (átomos triviais — `Identifier`,
 *      `Block`, `StringLiteral` etc. — ficam de fora, senão todo arquivo JS
 *      casaria); (b) por SUBSTRING quando o trecho não parseia ou não tem
 *      átomo substantivo (artefato em markdown/prosa, trecho citado solto) —
 *      mesmo princípio barato e determinístico da checagem de substring do
 *      §6.4.
 *   2. `PinsDeRegressao` — a COLEÇÃO (api: `adicionarPin`, `todosRodam()`,
 *      `quebrados()`): os pins rodam a CADA rodada; o laço F11 REJEITA
 *      correção que quebre pin verde. Pin de execução (caro) roda as provas
 *      do desafio via o `ProverDeDesafio` (contrato P-31 abaixo); pin de AST
 *      (barato) relê o arquivo via `obterArquivo` injetada.
 *   3. `criarPinParaAchado` — transforma UM achado sobrevivente em pin:
 *      lê o artefato, extrai o trecho do span, e monta pin barato (AST) ou,
 *      para categorias de EXECUÇÃO (`teste_invalido`/`gabarito_nao_passa`)
 *      de um artefato que é um desafio executável, pin caro. Achado sem pin
 *      (trecho vazio/irrecuperável, artefato inexistente) devolve `null` —
 *      MORRE EM SILÊNCIO: nunca chega ao planejador (§6.1 — A-P18-3 do plano).
 *
 * P-31 (importar CONTRA a interface): o pacote `phases/f9Verifier.ts` ainda
 * não aterrissou nesta worktree (onda 3). O contrato CONTRATADO é
 * `criarProverDeDesafio → (input: ChallengeProofsInput) => Promise<ChallengeProofsVerdict>`
 * — declarado AQUI como alias `ProverDeDesafio` sobre os TIPOS REAIS de
 * `exec/proofs.ts`. Quando P-31 aterrissar, o alias vira
 * `import { criarProverDeDesafio } from '../phases/f9Verifier'` e nada mais
 * muda: o laço, os pins de execução e a suíte falam com a MESMA assinatura.
 *
 * Limites DECLARADOS: pin de execução herda as quatro provas do
 * `verifyChallengeProofs` (a passagem INTEGRAL da solução, starter falha,
 * contagem dupla AST+execução, stub vazio falha); um desafio que não carrega
 * campos de provas (ex.: aula sem desafio) não gera pin caro — cai no pin
 * barato ou morre, conforme a categoria.
 */

import { extractAtoms } from '../extract';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../exec/proofs';
import type { Apontamento } from './actionCatalog';

// ---------------------------------------------------------------------------
// P-31 — o contrato do provador de desafio (fases/f9Verifier.ts)
// ---------------------------------------------------------------------------

/**
 * O PROVADOR DE DESAFIO (contrato P-31): recebe a entrada das QUATRO PROVAS
 * e devolve o veredito estruturado. O laço F11 e os pins de execução usam
 * SOMENTE esta assinatura — quando `fases/f9Verifier.ts` aterrissar, o
 * import real substitui o alias e nada mais muda.
 */
export type ProverDeDesafio = (input: ChallengeProofsInput) => Promise<ChallengeProofsVerdict>;

// ---------------------------------------------------------------------------
// 1. O PIN BARATO POR AST — pinAst (função pura)
// ---------------------------------------------------------------------------

/**
 * Átomos `node:` DISTINTIVOS — a estrutura que denuncia a ofensa. Nós
 * genéricos do parser (`Identifier`, `Block`, `ExpressionStatement`,
 * `EndOfFileToken`, …) aparecem em QUALQUER arquivo e NUNCA podem casar o
 * pin: a substância da comparação por AST são os eixos
 * `op:`/`decl:`/`api:`/`global:`/`form:` (que nunca são triviais) MAIS os
 * nós estruturais distintivos abaixo. A lista é fechada e versionada: um nó
 * novo só casa se for ADICIONADO aqui deliberadamente.
 */
const NODES_DISTINTIVOS: ReadonlySet<string> = new Set<string>([
  'node:ThrowStatement',
  'node:TryStatement',
  'node:CatchClause',
  'node:FinallyClause',
  'node:ForOfStatement',
  'node:ForInStatement',
  'node:SwitchStatement',
  'node:CaseClause',
  'node:LabeledStatement',
  'node:WithStatement',
  'node:DebuggerStatement',
  'node:ComputedNonLiteralAccess',
  'node:ClassDeclaration',
  'node:ImportDeclaration',
  'node:ExportDeclaration',
  'node:ReturnStatement',
  'node:TypeOfExpression',
  'node:DeleteExpression',
  'node:VoidExpression',
  'node:AwaitExpression',
  'node:YieldExpression',
  'node:ConditionalExpression',
  'node:SpreadElement',
  'node:TemplateExpression',
  'node:TaggedTemplateExpression',
  'node:NewExpression',
  'node:ArrowFunction',
  'node:FunctionDeclaration',
  'node:FunctionExpression',
  'node:MethodDeclaration',
  'node:Constructor',
  'node:GetAccessor',
  'node:SetAccessor',
  'node:ObjectLiteralExpression',
  'node:ArrayLiteralExpression',
  'node:TypeAssertionExpression',
  'node:AsExpression',
  'node:NonNullExpression',
]);

/** Substantivo: eixos não-`node:` SEMPRE; `node:` só os distintivos. */
function atomoSubstantivo(chave: string): boolean {
  if (!chave.startsWith('node:')) return true;
  return NODES_DISTINTIVOS.has(chave);
}

/** Tolera trecho sem substância e retorna os átomos relevantes (ou vazio). */
function atomosSubstantivosDo(codigo: string): string[] {
  const resultado = extractAtoms(codigo);
  if (!resultado.ok) return [];
  return resultado.keys.filter(atomoSubstantivo);
}

/**
 * IS: o trecho ofensor ainda tem substância no artefato? FUNÇÃO PURA
 * (A-P18-3): `true` ⇔ o artefato AINDA contém a ofensa — o pin ESTÁ
 * VERMELHO. `false` ⇔ ofensa ausente — pin VERDE.
 *
 * Determinístico, barato e FAKE-SAFE:
 *   - `trecho` vazio → `true` (sem o que fiscalizar, o defeito segue —
 *     o provador, porém, NUNCA cria pin para trecho vazio);
 *   - por AST quando `trecho` parseia E tem átomo substantivo: algum átomo
 *     do trecho existe no artefato? (o tail de `typeof nome !== 'string'` é
 *     `op:unary:typeof`; corrigir o artefato tira o átomo e o pin verdeia);
 *   - por SUBSTRING (limite declarado) quando o trecho não parseia ou só tem
 *     átomos triviais (markdown, trecho em prosa): `artefato.includes(trecho)`.
 */
export function pinAst(artefato: string, trecho: string): boolean {
  const t = trecho.trim();
  if (t.length === 0) return true;
  const atomosDoTrecho = atomosSubstantivosDo(t);
  if (atomosDoTrecho.length > 0) {
    const atomosDoArtefato = atomosSubstantivosDo(artefato);
    if (atomosDoArtefato.length > 0 || artefato.trim().length > 0) {
      // Artefato que é prosa (não parseia → lista vazia) cai no substring;
      // artefato que é código compara por AST.
      if (atomosDoArtefato.length > 0) {
        return atomosDoTrecho.some((chave) => atomosDoArtefato.includes(chave));
      }
    }
  }
  return artefato.includes(t);
}

// ---------------------------------------------------------------------------
// 2. O PIN e a COLEÇÃO — PinsDeRegressao
// ---------------------------------------------------------------------------

/** A aferição de um pin: COMO o pin decide se está verde. */
export type AfericaoDePin =
  | {
      tipo: 'ast';
      /** verde ⇔ `!pinAst(conteudoDoArquivo, trecho)` — a ofensa saiu. */
      trecho: string;
    }
  | {
      tipo: 'execucao';
      /** monta a entrada das QUATRO PROVAS a partir do artefato ATUAL. */
      construirEntrada: () => Promise<ChallengeProofsInput>;
      /** qual estado das provas verdea o pin ('provas_validas' = a solução passa). */
      verdeQuando: 'provas_validas' | 'provas_invalidas';
    };

/** Um pin de regressão — o teste executável que um defeito vira (§6.7). */
export interface PinDeRegressao {
  id: string;
  /** o apontamento que originou o pin (o laço o regenera quando o pin é vermelho). */
  apontamento: Apontamento;
  /** descrição legível do que o pin exige (vai renderizada ao corretor). */
  descricao: string;
  /** o arquivo que o pin fiscaliza (relido a cada rodada). */
  alvo: { caminho: string };
  afericao: AfericaoDePin;
  criado_na_rodada: number;
}

/** O veredito de UM pin numa rodada. */
export interface VereditoDePin {
  pin: PinDeRegressao;
  verde: boolean;
  /** por quê — detalhe do veredito (fail-closed explica a falha). */
  detalhe: string;
}

/** Dependências da coleção: o mundo que os pins tocam (injetado, A-P07-2). */
export interface DepsDaColecaoDePins {
  proverDesafio: ProverDeDesafio;
  obterArquivo: (caminho: string) => Promise<string | null>;
}

/** Guarda de runtime da discriminação de aferição. */
function isAfericaoDeExecucao(a: AfericaoDePin): a is Extract<AfericaoDePin, { tipo: 'execucao' }> {
  return a.tipo === 'execucao';
}

/**
 * A COLEÇÃO de pins de regressão (§6.7): o conjunto INTEIRO roda a CADA
 * rodada; `quebrados()` alimenta o score e a decisão de rejeição do laço
 * (correção que quebra pin verde é REJEITADA).
 */
export class PinsDeRegressao {
  private readonly _pins: PinDeRegressao[] = [];
  private readonly _ultimosVereditos = new Map<string, VereditoDePin>();

  constructor(private readonly deps: DepsDaColecaoDePins) {}

  /** O pin entra na coleção (id duplicado é no-op — mesma regressão, um pin). */
  adicionarPin(pin: PinDeRegressao): void {
    if (this._pins.some((p) => p.id === pin.id)) return;
    this._pins.push(pin);
  }

  get pins(): readonly PinDeRegressao[] {
    return this._pins;
  }

  private async aferir(pin: PinDeRegressao): Promise<VereditoDePin> {
    if (isAfericaoDeExecucao(pin.afericao)) {
      try {
        const entrada = await pin.afericao.construirEntrada();
        const veredito = await this.deps.proverDesafio(entrada);
        const verde = pin.afericao.verdeQuando === 'provas_validas' ? veredito.valid : !veredito.valid;
        const detalhe = veredito.valid
          ? `provas válidas (${veredito.executed} testes)`
          : `provas inválidas: ${veredito.failures.map((f) => f.reason).join('; ')}`;
        return { pin, verde, detalhe };
      } catch (erro) {
        return {
          pin,
          verde: false,
          detalhe: `pin de execução não pôde rodar: ${erro instanceof Error ? erro.message : String(erro)} (fail-closed)`,
        };
      }
    }
    // AST — verde ⇔ a ofensa saiu do arquivo.
    try {
      const conteudo = await this.deps.obterArquivo(pin.alvo.caminho);
      if (conteudo === null) {
        return { pin, verde: false, detalhe: `artefato "${pin.alvo.caminho}" sumiu — pin não verificável (fail-closed)` };
      }
      const ofensaPresente = pinAst(conteudo, pin.afericao.trecho);
      return {
        pin,
        verde: !ofensaPresente,
        detalhe: ofensaPresente ? `o artefato ainda contém a construção ofensora do trecho "..."` : 'ofensa ausente do artefato',
      };
    } catch (erro) {
      return {
        pin,
        verde: false,
        detalhe: `pin de AST não pôde ser aferido: ${erro instanceof Error ? erro.message : String(erro)} (fail-closed)`,
      };
    }
  }

  /**
   * O conjunto INTEIRO roda — a CADA rodada (§6.7). Devolve os vereditos na
   * ordem dos pins e guarda a última rodada (para `quebrados()`).
   */
  async todosRodam(): Promise<VereditoDePin[]> {
    const vereditos = await Promise.all(this._pins.map((pin) => this.aferir(pin)));
    this._ultimosVereditos.clear();
    for (const veredito of vereditos) this._ultimosVereditos.set(veredito.pin.id, veredito);
    return vereditos;
  }

  /** Conveniência do laço: TODOS os pins verdes? (véu da rodada atual.) */
  async todosVerdes(): Promise<boolean> {
    return (await this.todosRodam()).every((v) => v.verde);
  }

  /** Os pins VERMELHOS da última `todosRodam()` — ordem de inserção. */
  quebrados(): PinDeRegressao[] {
    return [...this._ultimosVereditos.values()].filter((v) => !v.verde).map((v) => v.pin);
  }

  /** Quantos pins vermelhos na última rodada (componente do score). */
  quantosQuebrados(): number {
    return this.quebrados().length;
  }

  /** Renderização verbatim para o prompt do corretor (P-13 — `pins`). */
  renderizar(): string[] {
    return this._pins.map((pin) => `${pin.id}: ${pin.descricao}`);
  }

  /**
   * REMOVE um pin da coleção — o canal da EXCEÇÃO INTENCIONAL (§6.7): um
   * apontamento declarado `excecao_intencional` no ledger "não reabre rodada",
   * e a regressão mecânica dele também sai do conjunto (o pin contradiz a
   * decisão de projeto; o ledger desconta a importância — o laço desarma). A
   * remoção é idempotente.
   */
  removerPin(id: string): void {
    const indice = this._pins.findIndex((pin) => pin.id === id);
    if (indice >= 0) this._pins.splice(indice, 1);
    this._ultimosVereditos.delete(id);
  }
}

// ---------------------------------------------------------------------------
// 3. de achado → pin (provador do laço)
// ---------------------------------------------------------------------------

/** Dependências do provador de achados (injetadas pelo laço F11). */
export interface DepsDoProvador {
  /** lê o artefato ATUAL por caminho (pins caros relêem a cada rodada). */
  obterArquivo: (caminho: string) => Promise<string | null>;
  proverDesafio: ProverDeDesafio;
}

/** Categorias cujo pin é DE EXECUÇÃO: só um desafio executável as prova. */
const CATEGORIAS_DE_EXECUCAO: ReadonlySet<string> = new Set<string>([
  'teste_invalido',
  'gabarito_nao_passa',
]);

/** Campos das provas de um desafio dentro do artefato (JSON). */
const CAMPOS_DE_PROVA = ['solutionCode', 'starterCode', 'testsCode', 'expectedTestCount'];

/**
 * Tenta ler as QUATRO PROVAS de um artefato de desafio (JSON). Devolve `null`
 * quando o artefato não é um desafio executável (aula sem desafio, prosa…).
 */
export function extrairProvasDoArtefato(conteudo: string): ChallengeProofsInput | null {
  let dado: unknown;
  try {
    dado = JSON.parse(conteudo);
  } catch {
    return null;
  }
  if (typeof dado !== 'object' || dado === null) return null;
  const d = dado as Record<string, unknown>;
  for (const campo of CAMPOS_DE_PROVA) {
    if (typeof d[campo] !== 'string' && campo !== 'expectedTestCount') return null;
  }
  if (typeof d.solutionCode !== 'string' || typeof d.starterCode !== 'string') return null;
  if (typeof d.testsCode !== 'string' || typeof d.expectedTestCount !== 'number') return null;
  if (!Number.isInteger(d.expectedTestCount) || d.expectedTestCount < 1) return null;
  return {
    solutionCode: d.solutionCode,
    starterCode: d.starterCode,
    testsCode: d.testsCode,
    expectedTestCount: d.expectedTestCount,
  };
}

/**
 * O trecho ofensor de um achado: o slice do span no conteúdo do artefato.
 * Cai para o fragmento citado na evidência quando o span resolve vazio.
 * Devolve `null` quando não há trecho recuperável — o achado NÃO vira pin.
 */
export function trechoOfensorDoAchado(apontamento: Apontamento, conteudo: string): string | null {
  const [inicio, fim] = apontamento.alvo.span;
  if (inicio >= 0 && fim >= inicio && fim <= conteudo.length) {
    const slice = conteudo.slice(inicio, fim).trim();
    if (slice.length >= 3) return slice;
  }
  const fragmentos = apontamento.evidencia.prova.match(/`([^`]+)`/g);
  if (fragmentos && fragmentos.length > 0) {
    const primeiro = fragmentos[0].replace(/`/g, '').trim();
    if (primeiro.length >= 3) return primeiro;
  }
  const token = apontamento.alvo.token.trim();
  return token.length >= 3 ? token : null;
}

/**
 * PROVADOR do F11: transforma UM achado sobrevivente em PIN EXECUTÁVEL que
 * falha hoje (§6.1 fluxo 4).
 *
 *   - categoria de EXECUÇÃO + artefato executável → pin CARO (provas); o pin
 *     verdeia quando o desafio voltar a passar/status esperado;
 *   - caso contrário → pin BARATO por AST (o trecho ofensor não pode mais
 *     aparecer no artefato);
 *   - sem trecho recuperável ou sem artefato → `null` — o achado MORRE EM
 *     SILÊNCIO (nunca chega ao planejador, §6.1).
 */
export async function criarPinParaAchado(
  apontamento: Apontamento,
  deps: DepsDoProvador,
): Promise<PinDeRegressao | null> {
  const conteudo = await deps.obterArquivo(apontamento.alvo.caminho);
  if (conteudo === null) return null;

  if (CATEGORIAS_DE_EXECUCAO.has(apontamento.categoria)) {
    const provas = extrairProvasDoArtefato(conteudo);
    if (provas !== null) {
      return {
        id: `pin-${apontamento.id}`,
        apontamento,
        descricao: `provas de execução do desafio "${apontamento.alvo.caminho}" voltam a passar (${apontamento.defeito})`,
        alvo: { caminho: apontamento.alvo.caminho },
        criado_na_rodada: apontamento.rodada,
        afericao: {
          tipo: 'execucao',
          verdeQuando: 'provas_validas',
          construirEntrada: async () => {
            const atual = await deps.obterArquivo(apontamento.alvo.caminho);
            if (atual === null) throw new Error(`artefato "${apontamento.alvo.caminho}" sumiu durante o pin de execução`);
            const provasAtuais = extrairProvasDoArtefato(atual);
            if (provasAtuais === null) throw new Error(`artefato "${apontamento.alvo.caminho}" deixou de ser um desafio executável`);
            return provasAtuais;
          },
        },
      };
    }
  }

  const trecho = trechoOfensorDoAchado(apontamento, conteudo);
  if (trecho === null) return null;

  return {
    id: `pin-${apontamento.id}`,
    apontamento,
    descricao: `a construção ofensora de "${apontamento.alvo.caminho}" desaparece (${apontamento.defeito})`,
    alvo: { caminho: apontamento.alvo.caminho },
    criado_na_rodada: apontamento.rodada,
    afericao: { tipo: 'ast', trecho },
  };
}