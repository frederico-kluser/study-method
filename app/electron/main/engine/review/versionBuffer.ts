/**
 * app/electron/main/engine/review/versionBuffer.ts — o VERSION BUFFER
 * (pacote P-18, onda 3 do plano de execução v1 — o laço F11).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6.7 — "Version buffer —
 * toda versão de cada artefato é guardada; rollback e ping-pong escolhem
 * dali", e §6.6 — "1. PARE("pingpong") hash(y_t) == hash(y_t-2) != hash(y_t-1)
 * → devolve o de menor score no buffer · 2. ROLLBACK score_erro_t >
 * score_erro_t-1 + 0,10 → volta para y_t-1".
 *
 * Nada é apagado: cada rodada GUARDA a versão de cada artefato com o seu
 * `score_erro`; o laço consulta:
 *   - `ultima(caminho)` — y_t (a versão corrente);
 *   - `anterior(caminho)` — y_{t-1} (o alvo do ROLLBACK);
 *   - `menorScore(caminho)` — a versão com menor erro (o alvo do PING-PONG).
 * `hashDeConteudo` é a identidade da versão (sha256) — o ping-pong compara
 * hashes de conteúdo, nunca objetos.
 *
 * FUNÇÕES PURAS + UMA classe de estado em memória: sem disco, sem LLM, sem
 * rede.
 */

import * as crypto from 'node:crypto';

/** Uma versão guardada de um artefato. */
export interface VersaoDeArtefato {
  caminho: string;
  conteudo: string;
  /** sha256 do conteúdo (identidade da versão — a mesma de `hashDeConteudo`). */
  hash: string;
  /** o score_erro da rodada a que esta versão pertence. */
  score_erro: number;
  rodada: number;
  /** ordem monotônica de guarda (desempate de menorScore entre iguais). */
  sequencia: number;
}

/** Identidade de conteúdo: sha256 hex-truncado (16 chars — suficiente p/ igualdade). */
export function hashDeConteudo(conteudo: string): string {
  return crypto.createHash('sha256').update(conteudo, 'utf8').digest('hex').slice(0, 16);
}

/**
 * O version buffer (§6.7): TODA versão de cada artefato é guardada; o
 * rollback (y_{t-1}) e o ping-pong (menor score) escolhem daqui.
 */
export class VersionBuffer {
  private readonly _porCaminho = new Map<string, VersaoDeArtefato[]>();
  private _sequencia = 0;

  /** Guarda a versão ATUAL de um artefato com o score da rodada. */
  guardar(versao: Omit<VersaoDeArtefato, 'hash' | 'sequencia'>): VersaoDeArtefato {
    this._sequencia += 1;
    const completa: VersaoDeArtefato = {
      ...versao,
      hash: hashDeConteudo(versao.conteudo),
      sequencia: this._sequencia,
    };
    const historico = this._porCaminho.get(versao.caminho) ?? [];
    historico.push(completa);
    this._porCaminho.set(versao.caminho, historico);
    return completa;
  }

  /** Todo o histórico de um artefato (da mais antiga à mais nova). */
  historico(caminho: string): readonly VersaoDeArtefato[] {
    return this._porCaminho.get(caminho) ?? [];
  }

  /** y_t — a versão corrente (a última guardada). */
  ultima(caminho: string): VersaoDeArtefato | undefined {
    const historico = this._porCaminho.get(caminho);
    return historico === undefined || historico.length === 0 ? undefined : historico[historico.length - 1];
  }

  /** y_{t-1} — a versão anterior à corrente (alvo do ROLLBACK, §6.6). */
  anterior(caminho: string): VersaoDeArtefato | undefined {
    const historico = this._porCaminho.get(caminho);
    if (historico === undefined || historico.length < 2) return undefined;
    return historico[historico.length - 2];
  }

  /** A versão com MENOR score_erro (alvo do PING-PONG, §6.6); desempate: a mais recente. */
  menorScore(caminho: string): VersaoDeArtefato | undefined {
    const historico = this._porCaminho.get(caminho);
    if (historico === undefined || historico.length === 0) return undefined;
    let melhor = historico[0];
    for (const versao of historico) {
      if (versao.score_erro < melhor.score_erro) melhor = versao;
      else if (versao.score_erro === melhor.score_erro && versao.sequencia > melhor.sequencia) melhor = versao;
    }
    return melhor;
  }

  /** O hash da versão corrente (útil ao laço para o histórico de ping-pong). */
  hashDe(caminho: string): string | undefined {
    return this.ultima(caminho)?.hash;
  }

  /** Limpa o buffer (novo laço). */
  limpar(): void {
    this._porCaminho.clear();
    this._sequencia = 0;
  }
}