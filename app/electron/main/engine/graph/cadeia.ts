/**
 * app/electron/main/engine/graph/cadeia.ts — a CADEIA DE CURSOS em código.
 *
 * POR QUE ESTE ARQUIVO EXISTE. A cadeia `iniciante → intermediário → avançado →
 * especialista` estava desenhada em três contratos (`docs/17-trilha-python.md`
 * §1, `docs/20-trilha-rust.md` §1-§3, `docs/20-trilha-c.md` §1-§2, mais
 * `skills/trilha-author/references/interligacao.md`) e NÃO EXISTIA EM CÓDIGO.
 * O estado medido em 2026-09-22, ANTES desta onda, e como reproduzir hoje:
 *
 *   - nenhum `track.json` declarava curso anterior ou posterior. Os três
 *     tinham 23 linhas e o único campo de fronteira era `entryCriteria`, prosa
 *     livre. Hoje (`cd app && for t in python-iniciante rust-iniciante
 *     c-iniciante; do jq -c '{cadeia,nivel,cursoAnterior}'
 *     resources/tracks/$t/track.json; done`): `c-iniciante` devolve as três `null`
 *     (não declara — segue aditivo, está em autoria), `python-iniciante`
 *     devolve `{"cadeia":"python","nivel":1,"cursoAnterior":null}` e
 *     `rust-iniciante` o equivalente em `rust`;
 *   - não existe índice/registro de cursos: a descoberta é `readdir` + `sort()`
 *     alfabético (`content/trackLoader.ts:310`, `listTrackSlugs`), que põe
 *     `c-iniciante` antes de `python-iniciante` por acidente de alfabeto;
 *   - nenhum gate determinístico lê `entryCriteria`: o único leitor que usa o
 *     SENTIDO dele é um prompt de LLM (`services/challengeRegenerator.ts:221-252`,
 *     dentro de `buildRegenerationPrompt`); os outros lugares só o copiam
 *     (`engine/phases/f12Materialize.ts:779`, `engine/fiacao/geraTrilha.ts:1415`);
 *   - `deriveTrackBudget` (`engine/budget.ts:216`) não tem — e continua sem —
 *     parâmetro de predecessor;
 *   - o MÓDULO porta-de-entrada (`interligacao.md` §3) não existia em código.
 *     `grep -rn 'porta-de-entrada\|porta de entrada' --include='*.ts'
 *     --include='*.tsx' electron/ src/ tools/` devolve 6 linhas e NENHUMA é o
 *     módulo: são "porta de entrada" no sentido de porta de API (o loader, o
 *     `conceptId`, a F7…) mais o comentário deste campo em `trackTypes.ts`.
 *
 * A REGRA QUE ISTO RESOLVE (a remediação do dono, textual: "no caso de nem nele
 * e nem nos cursos conectados a ele antes dele, ter o conteúdo, tem que quebrar
 * o conteúdo da aula problemática em mais conteúdos"). Diante de uma construção
 * que uma aula USA e não tem origem nesta trilha, a remediação tem TRÊS ramos:
 *
 *   (a) a construção existe ANTES nesta mesma trilha
 *       → violação de ORDEM: mover a aula ou reescrever o artefato. Quem
 *         responde é `TrackBudget.firstTaughtIn` (`budget.ts`).
 *   (b) a construção existe num CURSO ANTERIOR da cadeia
 *       → entra no módulo PORTA-DE-ENTRADA deste curso, em AULA PRÓPRIA. O
 *         orçamento NÃO SE HERDA: a entrada de toda trilha é axioma estrutural
 *         + semente do harness (`budget.ts:197-208`, `entryAxiom`), e é por isso
 *         que reintroduzir é ENSINAR DE NOVO, não "presumir"
 *         (`interligacao.md` §3).
 *   (c) a construção não existe em lugar nenhum
 *       → QUEBRAR a aula problemática em mais aulas (o ramo que o dono pediu).
 *
 * SEM ESTE ARQUIVO, (b) É INDISTINGUÍVEL DE (c): nada em código sabia quem é o
 * curso anterior, então toda construção sem origem local caía no mesmo balde.
 * `ensinadoAntesNaCadeia` é a função que separa os dois ramos — devolve, por
 * chave de átomo, o ENDEREÇO da aula do curso anterior que a ensina primeiro.
 *
 * O FATO MEDIDO, para ninguém confundir capacidade com efeito: as três trilhas
 * do disco (`python-iniciante`, `rust-iniciante`, `c-iniciante`) são o PRIMEIRO
 * curso de cada cadeia, todas de `nivel: 1` e `cursoAnterior: null`. Para elas,
 * `cadeiaAnteriorDe` devolve `[]` e `ensinadoAntesNaCadeia` devolve mapa VAZIO —
 * ou seja, hoje a resposta é SEMPRE o ramo (c), quebrar a aula. O valor desta
 * função é a cadeia dos cursos 2-4 (`python-intermediario`,
 * `rust-intermediario`, `c-intermediario`, …), que os contratos já desenharam e
 * cuja porta-de-entrada precisa saber o que reintroduzir. Prova, com o número:
 * `npx tsx --test tests/engineCadeia.test.ts` (caso "o disco real de hoje").
 *
 * DETERMINISTA E OFFLINE: zero LLM, zero rede, nenhum estado global. A única
 * E/S é leitura dos `track.json` dos predecessores (e, em
 * `ensinadoAntesNaCadeia`, do curso anterior inteiro via `loadTrack`). A
 * memoização é POR CHAMADA (um `Map` local que morre com a chamada) — cache de
 * módulo devolveria conteúdo velho enquanto os autores editam o disco.
 *
 * FAIL-CLOSED, sem exceção: ciclo, nível repetido ou fora de ordem, predecessor
 * inexistente, predecessor de outra cadeia, `track.json` de predecessor
 * ilegível e slug divergente do diretório LANÇAM `CadeiaError` com código
 * estável. Uma lista de predecessores silenciosamente errada produziria o
 * veredito errado no ramo (b) — reintroduzir na porta uma construção que o
 * curso anterior nunca ensinou — e esse erro é invisível na revisão.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ: não decide a remediação (quem decide é o gate/a
 * skill), não escreve em disco, não ordena aulas (é `budget.ts`) e não mexe em
 * orçamento — não existe "orçamento herdado", e criar um aqui contrariaria
 * `interligacao.md` §3.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import { loadTrack, TrackLoadError, type LoadedTrack } from '../../content/trackLoader';
import {
  TRACK_FILE,
  validateTrackChain,
  validateTrackSource,
  type TrackChainId,
  type TrackSource,
  type TrackValidationIssue,
} from '../../content/trackTypes';
import { deriveTrackBudget, type DeriveOptions } from '../budget';

// ---------------------------------------------------------------------------
// O erro estruturado
// ---------------------------------------------------------------------------

/**
 * Códigos de falha da cadeia — ESTÁVEIS (entram em mensagem de gate e em
 * teste; renomear é mudança de contrato).
 */
export type CadeiaErrorCode =
  /** a trilha (ou um predecessor) declara a cadeia de forma inválida/incompleta. */
  | 'CADEIA_DECLARACAO_INVALIDA'
  /** `cursoAnterior` aponta para um diretório que não existe em `tracksDir`. */
  | 'CADEIA_CURSO_AUSENTE'
  /** o `track.json` do predecessor existe mas não lê/não valida. */
  | 'CADEIA_CURSO_ILEGIVEL'
  /** o predecessor declara OUTRA cadeia (`rust` apontando para `python`). */
  | 'CADEIA_TROCADA'
  /** predecessor com o MESMO `nivel` do sucessor (dois cursos no mesmo degrau). */
  | 'CADEIA_NIVEL_REPETIDO'
  /** predecessor com `nivel` MAIOR que o do sucessor (a cadeia andaria para trás). */
  | 'CADEIA_NIVEL_FORA_DE_ORDEM'
  /** o caminho de predecessores volta a um curso já visitado. */
  | 'CADEIA_CICLO'
  /** o `slug` declarado no `track.json` difere do nome do diretório. */
  | 'CADEIA_SLUG_DIVERGENTE';

export interface CadeiaErrorDetalhes {
  /** slug de quem se estava resolvendo quando a falha apareceu. */
  slug?: string;
  /** caminho absoluto do arquivo/diretório envolvido. */
  caminho?: string;
  /** cadeia esperada (a do curso de partida). */
  cadeia?: string;
  /** o caminho percorrido até aqui, do curso de partida em diante. */
  caminhoDaCadeia?: string[];
  /** issues de validação, quando a falha vem de um validador. */
  issues?: TrackValidationIssue[];
}

export class CadeiaError extends Error {
  constructor(
    readonly code: CadeiaErrorCode,
    message: string,
    readonly detalhes: CadeiaErrorDetalhes = {},
  ) {
    super(message);
    this.name = 'CadeiaError';
  }
}

// ---------------------------------------------------------------------------
// A declaração da cadeia num `track.json`
// ---------------------------------------------------------------------------

/** Um curso ANTERIOR na cadeia, já resolvido no disco. */
export interface CursoDaCadeia {
  /** slug do curso (= nome do diretório, conferido). */
  slug: string;
  /** degrau dele na cadeia (1..4). */
  nivel: number;
  /** caminho absoluto do diretório da trilha (`<tracksDir>/<slug>`). */
  dir: string;
}

/** A declaração de cadeia de um `track.json`, quando ela existe. */
export interface DeclaracaoDeCadeia {
  cadeia: TrackChainId;
  nivel: number;
  cursoAnterior: string | null;
}

/**
 * Lê a declaração de cadeia de uma raiz de trilha.
 *
 * ADITIVIDADE: as três ausentes → `null` (trilha FORA de cadeia), e isso NÃO é
 * erro — é o estado das três trilhas do disco. Declaração parcial ou fora de
 * faixa LANÇA, porque meia declaração não define ordem nem aresta: quem lesse
 * teria de adivinhar qual metade valia. As regras locais vivem num lugar só
 * (`validateTrackChain`, em `content/trackTypes.ts`) para o loader, o CLI de
 * autoria e esta função nunca discordarem.
 */
export function declaracaoDeCadeia(raiz: TrackSource, onde: string): DeclaracaoDeCadeia | null {
  const issues = validateTrackChain(raiz, onde);
  if (issues.length > 0) {
    throw new CadeiaError(
      'CADEIA_DECLARACAO_INVALIDA',
      `declaração de cadeia inválida em ${onde}: ${issues.map((i) => i.message).join(' · ')}`,
      { slug: raiz.slug, caminho: onde, issues },
    );
  }
  if (raiz.cadeia === undefined || raiz.nivel === undefined || raiz.cursoAnterior === undefined) {
    return null;
  }
  return { cadeia: raiz.cadeia, nivel: raiz.nivel, cursoAnterior: raiz.cursoAnterior };
}

// ---------------------------------------------------------------------------
// Leitura das raízes (memoizada POR CHAMADA)
// ---------------------------------------------------------------------------

/** Memo local de uma chamada: slug → raiz validada. Nunca módulo, nunca global. */
type MemoDeRaizes = Map<string, TrackSource>;

/**
 * Lê e valida o `track.json` de um curso — SÓ a raiz, de propósito.
 *
 * Por que não `loadTrack` aqui: percorrer a cadeia precisa de três campos da
 * raiz, e `loadTrack` lê o curso inteiro (o `python-iniciante` tem 112 aulas).
 * Além do custo, a raiz basta para o caminho ser confiável mesmo enquanto um
 * curso da cadeia está sendo AUTORADO e ainda tem aula em esqueleto — quem
 * precisa do curso inteiro é `ensinadoAntesNaCadeia`, e essa é a função que
 * exige o curso legível.
 */
async function lerRaizDeCurso(
  tracksDir: string,
  slug: string,
  memo: MemoDeRaizes,
): Promise<{ raiz: TrackSource; dir: string }> {
  const dir = path.join(tracksDir, slug);
  const arquivo = path.join(dir, TRACK_FILE);
  const jaLido = memo.get(slug);
  if (jaLido !== undefined) return { raiz: jaLido, dir };

  let texto: string;
  try {
    texto = await fs.readFile(arquivo, 'utf8');
  } catch (err) {
    const codigo = (err as { code?: string }).code;
    if (codigo === 'ENOENT' || codigo === 'ENOTDIR') {
      throw new CadeiaError(
        'CADEIA_CURSO_AUSENTE',
        `curso ${JSON.stringify(slug)} declarado na cadeia não existe em ${tracksDir} (sem ${TRACK_FILE})`,
        { slug, caminho: arquivo },
      );
    }
    throw new CadeiaError(
      'CADEIA_CURSO_ILEGIVEL',
      `curso ${JSON.stringify(slug)}: falha ao ler ${arquivo} — ${String(err)}`,
      { slug, caminho: arquivo },
    );
  }

  let cru: unknown;
  try {
    cru = JSON.parse(texto);
  } catch (err) {
    throw new CadeiaError(
      'CADEIA_CURSO_ILEGIVEL',
      `curso ${JSON.stringify(slug)}: ${TRACK_FILE} não é JSON válido — ${String(err)}`,
      { slug, caminho: arquivo },
    );
  }

  const issues = validateTrackSource(cru, arquivo);
  if (issues.length > 0) {
    throw new CadeiaError(
      'CADEIA_CURSO_ILEGIVEL',
      `curso ${JSON.stringify(slug)}: ${TRACK_FILE} inválido — ${issues.map((i) => i.message).join(' · ')}`,
      { slug, caminho: arquivo, issues },
    );
  }
  const raiz = cru as TrackSource;

  // O endereço que `ensinadoAntesNaCadeia` devolve é `<slug>/<módulo>/<aula>`,
  // com o slug DECLARADO, enquanto o diretório vem do `cursoAnterior`. Se os
  // dois divergirem, o endereço aponta para um curso que ninguém encontra —
  // e `loadTrack` não confere isso (`trackLoader.ts:142`).
  if (raiz.slug !== slug) {
    throw new CadeiaError(
      'CADEIA_SLUG_DIVERGENTE',
      `curso em ${dir} declara slug ${JSON.stringify(raiz.slug)} — o diretório diz ${JSON.stringify(slug)}`,
      { slug, caminho: arquivo },
    );
  }

  memo.set(slug, raiz);
  return { raiz, dir };
}

// ---------------------------------------------------------------------------
// A API pública
// ---------------------------------------------------------------------------

/**
 * Os cursos ANTERIORES da cadeia, DO MAIS PRÓXIMO AO MAIS DISTANTE.
 *
 * Segue a aresta explícita `cursoAnterior` e CONFERE a escala (`cadeia` +
 * `nivel`) em cada passo. Trilha fora de cadeia (as três de hoje, que não
 * declaram os campos) e primeiro curso da cadeia (`cursoAnterior: null`)
 * devolvem `[]` — a ausência é resposta legítima, nunca erro.
 *
 * FAIL-CLOSED (e a ordem das checagens é deliberada): ciclo é detectado ANTES
 * de comparar nível, para o relato nomear o ciclo em vez de um sintoma dele.
 *
 * TERMINAÇÃO: o conjunto de visitados mais a exigência de `nivel` ESTRITAMENTE
 * DECRESCENTE a cada passo — dois travamentos independentes — garantem que o
 * caminho é finito sem precisar de teto artificial de profundidade.
 */
export async function cadeiaAnteriorDe(track: LoadedTrack, tracksDir: string): Promise<CursoDaCadeia[]> {
  const memo: MemoDeRaizes = new Map();
  const ondeEstou = path.join(track.dir, TRACK_FILE);
  const declaracao = declaracaoDeCadeia(track.root, ondeEstou);
  if (declaracao === null) return [];

  const anteriores: CursoDaCadeia[] = [];
  const visitados = new Set<string>([track.root.slug]);
  const caminhoDaCadeia = [track.root.slug];

  let atual: { slug: string; nivel: number; cursoAnterior: string | null } = {
    slug: track.root.slug,
    nivel: declaracao.nivel,
    cursoAnterior: declaracao.cursoAnterior,
  };

  while (atual.cursoAnterior !== null) {
    const proximo = atual.cursoAnterior;
    if (visitados.has(proximo)) {
      throw new CadeiaError(
        'CADEIA_CICLO',
        `ciclo na cadeia ${JSON.stringify(declaracao.cadeia)}: ` +
          `${[...caminhoDaCadeia, proximo].join(' → ')} — ${JSON.stringify(proximo)} já aparece no caminho`,
        { slug: proximo, cadeia: declaracao.cadeia, caminhoDaCadeia: [...caminhoDaCadeia, proximo] },
      );
    }

    const { raiz, dir } = await lerRaizDeCurso(tracksDir, proximo, memo);
    const arquivo = path.join(dir, TRACK_FILE);
    const dele = declaracaoDeCadeia(raiz, arquivo);
    if (dele === null) {
      throw new CadeiaError(
        'CADEIA_DECLARACAO_INVALIDA',
        `curso ${JSON.stringify(proximo)} é o predecessor de ${JSON.stringify(atual.slug)} e não declara cadeia ` +
          `(cadeia/nivel/cursoAnterior ausentes) — quem entra numa cadeia declara a cadeia`,
        { slug: proximo, caminho: arquivo, cadeia: declaracao.cadeia, caminhoDaCadeia: [...caminhoDaCadeia, proximo] },
      );
    }
    if (dele.cadeia !== declaracao.cadeia) {
      throw new CadeiaError(
        'CADEIA_TROCADA',
        `curso ${JSON.stringify(proximo)} declara cadeia ${JSON.stringify(dele.cadeia)} mas é predecessor de ` +
          `${JSON.stringify(atual.slug)}, da cadeia ${JSON.stringify(declaracao.cadeia)} — predecessor de outra cadeia ` +
          `não ensinou o que esta cadeia pressupõe`,
        { slug: proximo, caminho: arquivo, cadeia: declaracao.cadeia, caminhoDaCadeia: [...caminhoDaCadeia, proximo] },
      );
    }
    if (dele.nivel === atual.nivel) {
      throw new CadeiaError(
        'CADEIA_NIVEL_REPETIDO',
        `curso ${JSON.stringify(proximo)} e ${JSON.stringify(atual.slug)} declaram o MESMO nivel ${dele.nivel} na cadeia ` +
          `${JSON.stringify(declaracao.cadeia)} — dois cursos no mesmo degrau não têm ordem`,
        { slug: proximo, caminho: arquivo, cadeia: declaracao.cadeia, caminhoDaCadeia: [...caminhoDaCadeia, proximo] },
      );
    }
    if (dele.nivel > atual.nivel) {
      throw new CadeiaError(
        'CADEIA_NIVEL_FORA_DE_ORDEM',
        `curso ${JSON.stringify(proximo)} tem nivel ${dele.nivel}, maior que o nivel ${atual.nivel} de ` +
          `${JSON.stringify(atual.slug)}, de quem é predecessor — a cadeia andaria para trás`,
        { slug: proximo, caminho: arquivo, cadeia: declaracao.cadeia, caminhoDaCadeia: [...caminhoDaCadeia, proximo] },
      );
    }

    anteriores.push({ slug: proximo, nivel: dele.nivel, dir });
    visitados.add(proximo);
    caminhoDaCadeia.push(proximo);
    atual = { slug: proximo, nivel: dele.nivel, cursoAnterior: dele.cursoAnterior };
  }

  return anteriores;
}

/**
 * O que os CURSOS ANTERIORES da cadeia já ensinaram: chave de átomo → endereço
 * `<slug>/<módulo>/<aula>` do curso anterior que a ensina PRIMEIRO.
 *
 * É a função que separa o ramo (b) do ramo (c) da remediação (ver o cabeçalho):
 * chave presente aqui → reintroduzir em AULA PRÓPRIA no módulo
 * porta-de-entrada; chave ausente aqui E sem origem nesta trilha → QUEBRAR a
 * aula em mais aulas.
 *
 * "PRIMEIRO" é na ordem da cadeia: percorre do curso MAIS ANTIGO ao mais
 * recente e o primeiro a registrar uma chave fica com ela — reintroduzir na
 * porta é responsabilidade do curso onde a construção NASCE, e apontar para a
 * reintrodução mais recente esconderia a origem.
 *
 * ATENÇÃO, E É O PONTO INTEIRO: isto NÃO é orçamento herdado. `entryAxiom`
 * (`budget.ts:197-208`) continua sendo a entrada de TODA trilha — axioma
 * estrutural + semente do harness. O mapa é INFORMAÇÃO PARA A DECISÃO DE
 * AUTORIA, não permissão de gate (`interligacao.md` §3: a trilha B não herda
 * nada da trilha A).
 *
 * FAIL-CLOSED: curso anterior ilegível (qualquer arquivo inválido, referência
 * quebrada, linguagem sem adaptador) LANÇA `CadeiaError` — um mapa parcial
 * mandaria reintroduzir menos do que o necessário, e o buraco só apareceria
 * no aluno.
 */
export async function ensinadoAntesNaCadeia(
  track: LoadedTrack,
  tracksDir: string,
  options: DeriveOptions = {},
): Promise<Map<string, string>> {
  const anteriores = await cadeiaAnteriorDe(track, tracksDir);
  const mapa = new Map<string, string>();
  // Do mais ANTIGO ao mais recente: `cadeiaAnteriorDe` devolve do mais próximo
  // ao mais distante, então a ordem da origem é a inversa.
  for (const curso of [...anteriores].reverse()) {
    let carregado: LoadedTrack;
    try {
      carregado = await loadTrack(curso.dir);
    } catch (err) {
      throw new CadeiaError(
        'CADEIA_CURSO_ILEGIVEL',
        `curso anterior ${JSON.stringify(curso.slug)} não carrega — o que ele ensinou não pode ser medido: ${String(err)}`,
        {
          slug: curso.slug,
          caminho: curso.dir,
          ...(err instanceof TrackLoadError ? { issues: err.issues } : {}),
        },
      );
    }
    let orcamento: ReturnType<typeof deriveTrackBudget>;
    try {
      orcamento = deriveTrackBudget(carregado, options);
    } catch (err) {
      throw new CadeiaError(
        'CADEIA_CURSO_ILEGIVEL',
        `curso anterior ${JSON.stringify(curso.slug)}: o orçamento não pôde ser derivado — ${String(err)}`,
        { slug: curso.slug, caminho: curso.dir },
      );
    }
    for (const [chave, ref] of orcamento.firstTaughtIn) {
      if (!mapa.has(chave)) mapa.set(chave, `${curso.slug}/${ref}`);
    }
  }
  return mapa;
}
