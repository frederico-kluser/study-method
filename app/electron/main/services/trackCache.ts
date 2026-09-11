/**
 * electron/main/services/trackCache.ts — caches de TRILHA no processo main
 * (onda2-load, pedido do dono: "quando clico em Aula dá delay pra carregar").
 *
 * ─── O PROBLEMA MEDIDO ──────────────────────────────────────────────────────
 * track:lesson carregava a trilha INTEIRA do disco a cada clique:
 * `loadTrack` lê+valida 233 JSONs (112 aulas, ~1,3 MB) ≈ 133 ms (page cache
 * quente; frio é pior) — e o clique em "Avançar" refazia o MESMO caminho do
 * zero. `buildTrackLesson` custa ~0,5 ms (repo em memória) / ~0,13 ms
 * (sqlite real vazio): a montagem NÃO é o gargalo — a LEITURA é.
 *
 * ─── A SOLUÇÃO: DOIS CACHES + UMA PRÉ-CARGA ─────────────────────────────────
 * 1. CACHE DE CONTEÚDO (por diretório de trilha — o dir É o slug:
 *    tracksDir/<slug>). A Promise do loadTrack é DEDUPLICADA: chamadas
 *    concorrentes para o mesmo dir compartilham UMA leitura, e o resultado
 *    validado é reusado entre cliques. Por leitura há uma checagem OBRIGATÓRIA
 *    de frescor: fingerprint barato de mtimeMs+size de TODOS os *.json da
 *    trilha (233 stats ≈ 4 ms — vs ~133 ms de recarregar). Qualquer mudança de
 *    disco — de qualquer origem — força recarga; o cache nunca devolve trilha
 *    velha. Invalidação EXPLÍCITA (`invalidateTrackCache`) cobre writers
 *    in-process.
 * 2. CACHE DE PAYLOAD (LRU ≤ 32, chave `${dir}::${lessonSlug}`): o payload
 *    INTEIRO de buildTrackLesson. Por quê o payload inteiro e não só a parte
 *    estática (medido): montar custa < 1 ms, então o que importa é o payload
 *    estar PRONTO no clique; a parte dinâmica (progresso) é protegida por uma
 *    ÉPOCA global — `bumpProgressEpoch()` é chamado por TODO writer de
 *    progresso do main e ZERA o cache: nada velho é servido depois de uma
 *    escrita. Cada entrada também guarda a referência do LoadedTrack usado:
 *    disco mudou (slot novo) → remonta.
 * 3. PRÉ-CARGA da próxima aula: quando um payload é montado (ou acessado de
 *    novo) e o payload tem `nextLesson`, a aula seguinte é montada em
 *    background no MESMO cache — o clique em "Avançar" vira cache hit. A
 *    pré-carga é NÃO-RECURSIVA (um nível só), deduplicada pelo próprio cache
 *    (promessa única por chave) e SILENCIOSA (erro nunca propaga, nunca loga).
 *    O bump do lesson-done inutiliza a entrada pré-carregada (montada com o
 *    progresso antigo) e o próprio handler de lesson-done dispara uma
 *    remontagem em background com o estado NOVO (`prefetchAfterTrackLessonDone`).
 *
 * Onde mora o progresso vs conteúdo: conteúdo = disco (este módulo);
 * progresso = sqlite via repo (época). Os dois nunca se confundem.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import type { TrackLessonPayload } from '../../../shared/ipc-contract';
import type { TrackValidationIssue } from '../content/trackTypes';
import {
  LoadedTrack,
  TrackLoadError,
  findLessonAnywhere,
  listTrackSlugs,
  loadTrack,
} from '../content/trackLoader';
import { TrackProgressLike, buildTrackLesson } from './trackService';

/** Teto do LRU de payloads de aula. */
const PAYLOAD_LRU_MAX = 32;

/**
 * Limpeza no settle SEM criar promessa órfã: `void p.finally(f)` cria um
 * elo que rejeita junto com `p` sem handler → unhandledRejection. `onSettled`
 * anexa o callback aos DOIS ramos e a promessa original já tem dono
 * (o chamador) — a limpeza nunca vaza rejeição.
 */
function onSettled(p: Promise<unknown>, fn: () => void): void {
  p.then(fn, fn);
}

// ─── CACHE DE CONTEÚDO (trilha carregada) ───────────────────────────────────

interface TrackSlot {
  /** A promessa de loadTrack — compartilhada por TODAS as chamadas concorrentes. */
  promise: Promise<LoadedTrack>;
  /** null enquanto o primeiro load está em voo (não há o que checar ainda). */
  fingerprint: string | null;
}

/** slots por diretório de trilha (path.resolve). Nunca guarda erro. */
const trackSlots = new Map<string, TrackSlot>();
/** recargas em andamento (dedup de recargas concorrentes após staleness). */
const trackReloads = new Map<string, Promise<LoadedTrack>>();

/**
 * Fingerprint barato do conteúdo JSON da trilha: (relpath, mtimeMs, size) de
 * TODO *.json sob o diretório. 233 arquivos ≈ 4 ms (medido) — o custo da
 * checagem obrigatória de frescor por leitura, ~33× mais barato que recarregar.
 */
async function fingerprintTrack(trackDir: string): Promise<string> {
  const out: string[] = [];
  const rec = async (d: string): Promise<void> => {
    const entries = await fs.readdir(d, { withFileTypes: true });
    await Promise.all(
      entries.map(async (e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return rec(p);
        if (!e.name.endsWith('.json')) return;
        const st = await fs.stat(p);
        out.push(`${path.relative(trackDir, p)}:${st.mtimeMs}:${st.size}`);
      }),
    );
  };
  await rec(trackDir);
  return out.sort().join('|');
}

/**
 * Dispara o load de uma trilha e registra o slot SINCRONAMENTE (antes de
 * qualquer await) — duas chamadas frias concorrentes compartilham a MESMA
 * promessa (dedup de leitura). O slot NUNCA guarda erro: load rejeitado →
 * slot removido → o próximo acesso tenta do zero.
 */
function startTrackLoad(key: string): Promise<LoadedTrack> {
  // `promise` é preenchido logo abaixo, ANTES de qualquer await do corpo —
  // o placeholder existe só para o objeto Slot nascer completo.
  const slot: TrackSlot = { promise: undefined as unknown as Promise<LoadedTrack>, fingerprint: null };
  const pendingLoad = (async (): Promise<LoadedTrack> => {
    try {
      const track = await loadTrack(key);
      slot.fingerprint = await fingerprintTrack(key);
      return track;
    } catch (err) {
      trackSlots.delete(key);
      throw err;
    }
  })();
  slot.promise = pendingLoad;
  trackSlots.set(key, slot);
  return pendingLoad;
}

/**
 * Checagem de frescor por leitura: fingerprint igual → compartilha; diferente
 * → recarrega (com dedup de recargas concorrentes). Fail-closed: fingerprint
 * ilegível (dir removido/ilegível) vira recarga, e a recarga expõe o erro
 * real ao chamador. A PROMESSA devolvida aqui é um wrapper — a IDENTIDADE que
 * o cache garante é a da INSTÂNCIA resolvida (mesmo objeto = nunca relêu); a
 * identidade de promessa é garantida nos caminhos frio/em-voo/recarga (ver
 * `loadTrackCached`).
 */
async function ensureFreshTrack(key: string, slot: TrackSlot): Promise<LoadedTrack> {
  let fresh = false;
  try {
    fresh = (await fingerprintTrack(key)) === slot.fingerprint;
  } catch {
    fresh = false; // disco estranho → trata como mudou → recarrega (fail-closed)
  }
  if (fresh) return slot.promise;
  const pending = trackReloads.get(key);
  if (pending) return pending;
  const reload = startTrackLoad(key);
  trackReloads.set(key, reload);
  onSettled(reload, () => trackReloads.delete(key));
  return reload;
}

/**
 * Carrega UMA trilha com cache por diretório (o dir É o slug). Contrato:
 *   - uma ÚNICA leitura para chamadas concorrentes (frias e em voo: MESMA
 *     promessa) e nenhuma releitura com disco estável (MESMA instância);
 *   - frescor checado por leitura (fingerprint de *.json — qualquer mudança
 *     de disco força recarga);
 *   - invalidação explícita disponível para writers in-process.
 */
export function loadTrackCached(trackDir: string): Promise<LoadedTrack> {
  const key = path.resolve(trackDir);
  const slot = trackSlots.get(key);
  if (!slot) return startTrackLoad(key);
  if (slot.fingerprint === null) return slot.promise; // 1º load em voo → MESMA promessa
  const pendingReload = trackReloads.get(key);
  if (pendingReload) return pendingReload; // recarga em voo → MESMA promessa
  return ensureFreshTrack(key, slot);
}

/**
 * Invalidação EXPLÍCITA do cache de conteúdo do slug — para TODO writer
 * in-process de lessons/tracks chamar APÓS a escrita (o fingerprint cobre
 * mudanças de qualquer origem; esta é a forma determinística e imediata).
 * HOJE (verificado na onda) nenhum processo do main escreve em
 * resources/tracks: lessonAuthor/lessonOrchestrator escrevem em workspaces
 * tmp e o CLI tools/track-cli.ts roda fora do processo — o ponto existe como
 * o contrato que os futuros writers devem chamar.
 */
export function invalidateTrackCache(trackDir: string): void {
  const key = path.resolve(trackDir);
  trackSlots.delete(key);
  trackReloads.delete(key);
}

/**
 * Lista TODAS as trilhas usando o cache — o `track:list` da Home AQUECE o
 * cache de conteúdo, então o primeiro clique em aula depois do boot não paga
 * os ~133 ms de leitura integral: já veio na listagem.
 */
export async function loadAllTracksCached(
  tracksDir: string,
): Promise<{ tracks: LoadedTrack[]; issues: TrackValidationIssue[] }> {
  const slugs = await listTrackSlugs(tracksDir);
  const tracks: LoadedTrack[] = [];
  const issues: TrackValidationIssue[] = [];
  for (const slug of slugs) {
    try {
      tracks.push(await loadTrackCached(path.join(tracksDir, slug)));
    } catch (err) {
      if (err instanceof TrackLoadError) {
        issues.push(...err.issues);
      } else {
        issues.push({ file: path.join(tracksDir, slug), message: `erro ao carregar trilha: ${String(err)}` });
      }
    }
  }
  return { tracks, issues };
}

// ─── CACHE DE PAYLOAD DE AULA (LRU + época de progresso) ────────────────────

interface PayloadEntry {
  /** A promessa do build (settled quando a entrada existe) — devolvida aos hits. */
  promise: Promise<TrackLessonPayload | null>;
  /** A trilha de que o payload saiu: disco mudou (outra instância) → remonta. */
  trackRef: LoadedTrack;
  /** Época de progresso em que o payload foi montado. */
  epoch: number;
}

/** LRU de payloads (ordem de inserção = recência; toque move para o fim). */
const payloadLru = new Map<string, PayloadEntry>();
/** Builds em andamento — dedup de concorrentes (inclui a pré-carga em voo). */
const payloadInFlight = new Map<string, Promise<TrackLessonPayload | null>>();
/** Época global de progresso: TODO writer de progresso do main faz bump. */
let progressEpoch = 0;

/** Zera o LRU de payloads. Ver `bumpProgressEpoch`. */
function clearPayloadCache(): void {
  payloadLru.clear();
  payloadInFlight.clear();
}

/**
 * Progresso do aluno mudou (lesson-done, proficiência, tentativa de desafio,
 * quiz, desafio regenerado, reset) → os payloads cacheados ficaram velhos.
 * O bump zera o cache inteiro: a próxima leitura remonta com o estado novo, e
 * qualquer pré-carga em voo é descartada no settle (guarda de época). Barato:
 * payloads são remontados em < 1 ms.
 */
export function bumpProgressEpoch(): void {
  progressEpoch += 1;
  clearPayloadCache();
}

function trimPayloadLru(): void {
  while (payloadLru.size > PAYLOAD_LRU_MAX) {
    const oldest = payloadLru.keys().next().value;
    if (oldest === undefined) break;
    payloadLru.delete(oldest);
  }
}

/**
 * Pré-carga (um nível, nunca recursivo) da aula seguinte: `nextLesson` vem no
 * payload (estado COMO SE a atual já estivesse concluída) — se a aula
 * seguinte ainda não está em cache nem em voo, monta-a em background. Erro é
 * SILENCIOSO (catch vazio): nunca afeta quem pediu a aula atual, nunca loga.
 */
function scheduleNextLessonPrefetch(track: LoadedTrack, payload: TrackLessonPayload, repo: TrackProgressLike): void {
  const next = payload.nextLesson;
  if (!next || !next.slug) return;
  const found = findLessonAnywhere(track, next.slug);
  if (!found) return;
  void buildTrackLessonCached(track, found.moduleSlug, next.slug, repo, { prefetched: true }).catch(() => {
    /* pré-carga falhou → no-op deliberado (o clique normal remonta) */
  });
}

function startPayloadBuild(
  key: string,
  track: LoadedTrack,
  moduleSlug: string,
  lessonSlug: string,
  repo: TrackProgressLike,
  schedulePrefetch: boolean,
): Promise<TrackLessonPayload | null> {
  const epochAtStart = progressEpoch;
  const promise = buildTrackLesson(track, moduleSlug, lessonSlug, repo)
    .then((payload) => {
      if (payload === null) return null; // aula inexistente: não cacheia null
      if (progressEpoch !== epochAtStart) {
        // progresso mudou durante o build (ex.: aluno concluiu a aula no meio
        // de uma pré-carga) → o resultado é DESCARTADO; a remontagem pós-write
        // (lesson-done + bump) cobre o estado novo.
        return payload;
      }
      payloadLru.set(key, { promise, trackRef: track, epoch: epochAtStart });
      trimPayloadLru();
      if (schedulePrefetch) scheduleNextLessonPrefetch(track, payload, repo);
      return payload;
    })
    .catch((err) => {
      payloadInFlight.delete(key);
      throw err;
    });
  return promise;
}

/**
 * Monta o payload de UMA aula com cache LRU (chave `${dir}::${lessonSlug}`):
 *  - dedup de builds em voo (promessa única por chave — inclui pré-cargas);
 *  - hit só quando o payload veio da MESMA instância de trilha E a época de
 *    progresso não mudou; qualquer divergência → remonta;
 *  - a cada payload acessado/montado, a PRÓXIMA aula (nextLesson) é
 *    pré-carregada em background (a menos de `opts.prefetched` — a pré-carga
 *    não encadeia).
 * `null` (aula inexistente) NUNCA é cacheado: se o disco ganhar a aula depois,
 * o hit não pode devolver "não existe".
 */
export function buildTrackLessonCached(
  track: LoadedTrack,
  moduleSlug: string,
  lessonSlug: string,
  repo: TrackProgressLike,
  opts?: { prefetched?: boolean },
): Promise<TrackLessonPayload | null> {
  const key = `${path.resolve(track.dir)}::${lessonSlug}`;
  const inFlight = payloadInFlight.get(key);
  if (inFlight) return inFlight;
  const entry = payloadLru.get(key);
  if (entry && entry.trackRef === track && entry.epoch === progressEpoch) {
    // toque de recência (LRU) + pré-carga do próximo nível (idempotente).
    payloadLru.delete(key);
    payloadLru.set(key, entry);
    if (!opts?.prefetched) {
      void entry.promise
        .then((payload) => {
          if (payload) scheduleNextLessonPrefetch(track, payload, repo);
        })
        .catch(() => {});
    }
    return entry.promise;
  }
  const promise = startPayloadBuild(key, track, moduleSlug, lessonSlug, repo, !opts?.prefetched);
  payloadInFlight.set(key, promise);
  onSettled(promise, () => payloadInFlight.delete(key));
  return promise;
}

/**
 * Disparado pelo handler `track:lesson-done` DEPOIS da gravação: remonta o
 * payload da aula concluída em background (o estado novo já está no repo) — e
 * a remontagem, por sua vez, pré-carrega a `nextLesson` com o progresso NOVO,
 * de modo que o clique em "Avançar" encontra a próxima aula pronta no cache.
 * Fire-and-forget: erro nunca propaga para o handler.
 */
export function prefetchAfterTrackLessonDone(track: LoadedTrack, lessonSlug: string, repo: TrackProgressLike): void {
  const found = findLessonAnywhere(track, lessonSlug);
  if (!found) return;
  void buildTrackLessonCached(track, found.moduleSlug, lessonSlug, repo).catch(() => {
    /* remontagem pós-done falhou → o clique normal do aluno remonta */
  });
}

/**
 * Zera todos os caches deste módulo — para testes (estado de módulo não
 * vaza entre arquivos de teste; os testes desta onda usam dirs tmp únicos,
 * esta função existe por higiene/disciplina de teste).
 */
export function __resetTrackCachesForTests(): void {
  trackSlots.clear();
  trackReloads.clear();
  clearPayloadCache();
  progressEpoch = 0;
}

/** Espia o cache de payload (testes): a aula X está pronta/cacheada? */
export function __peekTrackLessonCache(trackDir: string, lessonSlug: string): boolean {
  const key = `${path.resolve(trackDir)}::${lessonSlug}`;
  const entry = payloadLru.get(key);
  return entry !== undefined && entry.epoch === progressEpoch;
}