/**
 * app/electron/main/engine/quality/minimalCCandidatos.ts — a GERAÇÃO dos
 * candidatos de solução mínima de C, pura e ordenada por minimalidade
 * (printf-único → printf-por-linha → eco → literal → referência por último,
 * com dedupe entre etapas).
 *
 * A prosa normativa (a ordem e o porquê de cada estágio) vive na fachada
 * `minimalC.ts`. Refatoração L04: arquivo ≤500 linhas e toda função com CC≤8,
 * sem mudança de comportamento observável.
 */

import { type ChecaC, type LiteraisDoTesteC, type PrototipoC } from './minimalCTipos';
import { formaDoTesteC } from './minimalCLeitura';

/** Monta a UNIDADE DE TRADUÇÃO mínima: cabeçalho stdio opcional + definição. */
function tuC(assinatura: string, corpo: string, comStdio: boolean): string {
  const incluir = comStdio ? '#include <stdio.h>\n\n' : '';
  return `${incluir}${assinatura} {\n    ${corpo}\n}\n`;
}

/** A função-alvo: a MAIS referenciada pelas verificações. */
function escolherAlvoC(dados: LiteraisDoTesteC): PrototipoC {
  // Empate decide pela ordem de aparição no fonte (o mesmo desempate dos irmãos).
  let melhor = dados.prototipos[0];
  let refs = -1;
  for (const p of dados.prototipos) {
    const n = dados.checas.filter((c) => c.chamadaAlvo === p.nome).length;
    if (n > refs) {
      refs = n;
      melhor = p;
    }
  }
  return melhor;
}

/**
 * 1. e 2. IMPRIMIR — os literais StringLiteral esperados, NA ORDEM do teste:
 * UM printf com os literais adjacentes (a concatenação de C) e depois UM
 * printf por verificação. SEM dedup: a janela de três linhas tem borda de
 * cima e de baixo IGUAIS — dedupiar apagaria a borda final.
 */
function candidatosDeSaida(
  alvo: PrototipoC,
  dados: LiteraisDoTesteC,
  adicionar: (c: string | null | undefined) => void,
): void {
  const literaisDeSaida = dados.checas
    .filter((c) => c.esperadoKind === 'StringLiteral' && c.esperadoTexto !== null)
    .map((c) => c.esperadoTexto as string);
  if (literaisDeSaida.length === 0) return;
  adicionar(tuC(alvo.assinatura, `printf(${literaisDeSaida.join(' ')});`, true));
  adicionar(
    tuC(
      alvo.assinatura,
      literaisDeSaida.map((l) => `printf(${l});`).join('\n    '),
      true,
    ),
  );
}

/** 3. ECO — `return <param>;` quando o teste devolve o próprio argumento. */
function candidatoEcoC(
  alvo: PrototipoC,
  comparacoes: readonly ChecaC[],
  adicionar: (c: string | null | undefined) => void,
): void {
  if (alvo.params.length !== 1) return;
  const p = alvo.params[0];
  const eco = comparacoes.some(
    (c) => c.argumentosAlvo.length >= 1 && c.argumentosAlvo[0] === p && c.esperadoTexto === p,
  );
  if (eco) {
    adicionar(tuC(alvo.assinatura, `return ${p};`, false));
  }
}

/** 4. LITERAL — `return <literal>;` de UM literal esperado. */
function candidatoLiteralC(
  alvo: PrototipoC,
  esperadoTexto: string,
  adicionar: (c: string | null | undefined) => void,
): void {
  adicionar(tuC(alvo.assinatura, `return ${esperadoTexto};`, false));
}

/** 4. LITERAL — até 3 literais distintos, na ordem do código do teste. */
function candidatosLiteraisC(
  alvo: PrototipoC,
  comparacoes: readonly ChecaC[],
  adicionar: (c: string | null | undefined) => void,
): void {
  const vistos = new Set<string>();
  for (const c of comparacoes) {
    if (c.esperadoTexto === null || vistos.has(c.esperadoTexto)) continue;
    vistos.add(c.esperadoTexto);
    candidatoLiteralC(alvo, c.esperadoTexto, adicionar);
    if (vistos.size >= 3) break;
  }
}

/**
 * Gera os candidatos de solução mínima, na ordem de minimalidade (o primeiro
 * que passar nas provas vence). PURO: mesma entrada, mesma saída. Teto de 8.
 *
 *   1. IMPRIMIR único — `printf(<lit1> <lit2> …);` (literais adjacentes de C,
 *      na ORDEM do teste, SEM dedup — ver o cabeçalho)
 *   2. IMPRIMIR por linha — um `printf(<lit>);` por verificação, na ordem
 *   3. ECO — `return <param>;`
 *   4. LITERAL — `return <literal>;` (até 3 literais distintos, ordem do teste)
 *   5. SOLUÇÃO — a referência, sempre a ÚLTIMA quando a forma é reconhecida
 */
export function gerarCandidatosC(
  _starterCode: string,
  solution: string,
  dados: LiteraisDoTesteC,
): string[] {
  const candidatos: string[] = [];
  const adicionar = (c: string | null | undefined): void => {
    if (c === null || c === undefined) return;
    if (!candidatos.includes(c)) candidatos.push(c);
  };

  if (dados.prototipos.length === 0) return [];

  const alvo = escolherAlvoC(dados);
  candidatosDeSaida(alvo, dados, adicionar);

  const comparacoes = dados.checas.filter((c) => c.chamadaAlvo === alvo.nome);
  candidatoEcoC(alvo, comparacoes, adicionar);
  candidatosLiteraisC(alvo, comparacoes, adicionar);

  // 5. ÚLTIMO recurso — a solução de referência, SEMPRE como ÚLTIMO candidato
  // quando a forma é reconhecida (mesma decisão MEDIDA da onda 4 do Python,
  // espelhada no cabeçalho: fase VALOR com ≥2 casos nunca é satisfeita por
  // literal; sem a referência, todo desafio que exige computação sairia
  // SEM_SOLUCAO_ACESSIVEL e o coverage fail-closed reprovaria a fase inteira.
  // Numa forma DESCONHECIDA a referência NÃO entra: ela viraria um "mínimo"
  // que na verdade é o máximo, inflando os átomos e podendo inventar LACUNA).
  if (formaDoTesteC(dados) !== 'desconhecida' && solution.trim() !== '') {
    adicionar(solution);
  }

  return candidatos.slice(0, 8);
}
