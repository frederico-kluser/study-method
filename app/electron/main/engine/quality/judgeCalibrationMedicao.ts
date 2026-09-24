/**
 * app/electron/main/engine/quality/judgeCalibrationMedicao.ts — a MEDIÇÃO da
 * taxa de falso-passe contra mutantes, a DECISÃO de desligamento do laço
 * (§6.6) e a remoção por categoria (estado de gerações injetado).
 *
 * O contrato e a prosa normativa vivem na fachada `judgeCalibration.ts`.
 * Refatoração L04: arquivo ≤500 linhas e toda função com CC≤8, sem mudança de
 * comportamento observável.
 */

import { type RevisaoComSeveridade } from '../prompts/reviewer';
import { abreRodada } from '../review/normalize';
import { type ClasseDeDefeito, type DesafioParaMutacao, type Mutante, rodaMutante } from './mutants';
import {
  ErroDeCalibracao,
  type ArtefatosDeCalibracao,
  type CategoriaParaRemover,
  type DecisaoDeCalibracao,
  type DepsDeCalibracao,
  type GeracaoDeMedicao,
  type MedicaoDeFalsoPasse,
  type MedicaoPorClasse,
  PARAMETROS_PADRAO_DE_REMOCAO,
  type ParametrosDeRemocaoPorCategoria,
  limiarDeFalsoPasse,
} from './judgeCalibrationTipos';
import { localizarMarcadorNoMutado, revisaoDetectaDefeito } from './judgeCalibrationDeteccao';

/** Envolve a chamada ao revisor: lançamento vira erro estruturado de calibração. */
async function julgarComSeguranca(
  deps: DepsDeCalibracao,
  artefato: DesafioParaMutacao,
  rotulo: string,
): Promise<RevisaoComSeveridade> {
  try {
    return await deps.revisor(artefato);
  } catch (causa) {
    throw new ErroDeCalibracao(
      'REVISOR_INDISPONIVEL',
      `revisor indisponível durante a calibração (${rotulo}) — fail-closed: a calibração não produz veredito com o juiz fora do ar (§9.3)`,
      causa,
    );
  }
}

/**
 * Mede a taxa de falso-passe de UMA classe: cada mutante dela é mutado,
 * julgado e confrontado com o marcador. Devolve os contadores da classe.
 */
async function medirClasse(
  deps: DepsDeCalibracao,
  valido: DesafioParaMutacao,
  classe: ClasseDeDefeito,
  mutantesDaClasse: readonly Mutante[],
): Promise<MedicaoPorClasse> {
  let falsosPasses = 0;
  for (const mutante of mutantesDaClasse) {
    const mutado = rodaMutante(mutante, valido);
    const revisao = await julgarComSeguranca(deps, mutado, `mutante ${mutante.id}`);
    const marcador = localizarMarcadorNoMutado(mutante, mutado);
    if (!revisaoDetectaDefeito(revisao, mutante, marcador)) falsosPasses += 1;
  }
  const totalMutantes = mutantesDaClasse.length;
  const detectados = totalMutantes - falsosPasses;
  const taxaDeFalsoPasse = totalMutantes === 0 ? 0 : falsosPasses / totalMutantes;
  return {
    classe,
    totalMutantes,
    detectados,
    falsosPasses,
    taxaDeFalsoPasse,
    razaoDeAcerto: 1 - taxaDeFalsoPasse,
  };
}

/**
 * Mede a taxa de falso-passe do revisor: cada artefato (válido + mutantes) é
 * julgado por `deps.revisor`; por classe e no geral, a taxa é
 * falsos-passantes / total da classe. O válido é julgado por SANITY:
 * `achadosNoValido` é diagnóstico, NUNCA entra em nenhuma decisão deste
 * pacote (a decisão lê SÓ a taxa contra os mutantes, §6.6). FAIL-CLOSED:
 * revisor indisponível → `ErroDeCalibracao('REVISOR_INDISPONIVEL')`;
 * calibração sem mutantes → `ErroDeCalibracao('SEM_MUTANTES')`.
 */
export async function medirTaxaDeFalsoPasse(
  deps: DepsDeCalibracao,
  artefatos: ArtefatosDeCalibracao,
): Promise<MedicaoDeFalsoPasse> {
  if (artefatos.mutantes.length === 0) {
    throw new ErroDeCalibracao(
      'SEM_MUTANTES',
      'calibração sem mutantes não é medição — gere os mutantes com `gerarMutantes` antes de medir',
    );
  }

  const revisaoDoValido = await julgarComSeguranca(deps, artefatos.valido, 'artefato válido');
  const achadosNoValido = revisaoDoValido.apontamentos.filter((a) => abreRodada(a.categoria)).length;

  const porClasse: MedicaoPorClasse[] = [];
  for (const classe of [...new Set(artefatos.mutantes.map((m) => m.classe))]) {
    const daClasse = artefatos.mutantes.filter((m) => m.classe === classe);
    porClasse.push(await medirClasse(deps, artefatos.valido, classe, daClasse));
  }

  const frenteAMutantes = artefatos.mutantes.length;
  const falsosPassesTotais = porClasse.reduce((soma, c) => soma + c.falsosPasses, 0);
  return {
    amostras: frenteAMutantes + 1,
    frenteAMutantes,
    taxaGeral: falsosPassesTotais / frenteAMutantes,
    porClasse,
    achadosNoValido,
  };
}

const formatarPorcentagem = (fracao: number): string => `${(fracao * 100).toFixed(1)}%`;

/**
 * A DECISÃO da calibração — função pura paramétrica no limiar. `taxaGeral ≥
 * limiar` devolve `{aprovado: false, motivo: 'LIMIAR_FALSO_PASSE'}` com a
 * mensagem explícita do §6.6: este revisor nunca remove nada, mais rodadas e
 * mais amostras não salvam — PARE o laço e conserte o juiz. A decisão lê
 * SOMENTE a taxa contra os mutantes; o veredito agregado do revisor não é
 * alarme em lugar nenhum deste pacote.
 */
export function decisaoDeCalibracao(
  medicao: MedicaoDeFalsoPasse,
  limiar: number = limiarDeFalsoPasse(),
): DecisaoDeCalibracao {
  if (medicao.taxaGeral >= limiar) {
    return {
      aprovado: false,
      motivo: 'LIMIAR_FALSO_PASSE',
      mensagem:
        `LIMIAR_FALSO_PASSE: o revisor marcou ${formatarPorcentagem(medicao.taxaGeral)} dos mutantes como passe ` +
        `(limiar ${formatarPorcentagem(limiar)}, limite ≥ ${String(limiar)}) — um revisor assim NUNCA remove nada; ` +
        'mais rodadas não salvam, mais amostras não salvam. PARE o laço e conserte o juiz (§6.6).',
      limiar,
      taxaGeral: medicao.taxaGeral,
    };
  }
  return {
    aprovado: true,
    mensagem:
      `calibração aprovada: taxa geral de falso-passe ${formatarPorcentagem(medicao.taxaGeral)} abaixo do limiar ` +
      `${formatarPorcentagem(limiar)} — o laço pode ser ligado nesta trilha.`,
    limiar,
    taxaGeral: medicao.taxaGeral,
  };
}

/**
 * DESLIGAMENTO AUTOMÁTICO POR CATEGORIA — função PURA com o estado de
 * gerações INJETADO (o histórico é parâmetro, nunca estado global). Uma
 * classe cuja razão de acerto (1 − taxa de falso-passe da classe) fique
 * ABAIXO de `limiarDeAcerto` por `geracoesConsecutivas` gerações
 * CONSECUTIVAS é devolvida para REMOÇÃO do revisor; uma geração acima do
 * limiar ZERA o contador da classe. A decisão de remoção usa SÓ a taxa por
 * classe contra os mutantes — o mesmo princípio do §6.6, aplicado por
 * categoria.
 */
export function categoriasParaRemover(
  historico: readonly GeracaoDeMedicao[],
  parametros: ParametrosDeRemocaoPorCategoria = PARAMETROS_PADRAO_DE_REMOCAO,
): CategoriaParaRemover[] {
  if (parametros.geracoesConsecutivas < 1) {
    throw new Error('categoriasParaRemover: geracoesConsecutivas tem de ser ≥ 1');
  }

  const ordenado = [...historico].sort((a, b) => a.geracao - b.geracao);
  const estado = new Map<ClasseDeDefeito, { consecutivas: number; ultimaRazaoDeAcerto: number }>();

  for (const geracao of ordenado) {
    for (const medicaoDaClasse of geracao.medicao.porClasse) {
      const abaixo = medicaoDaClasse.razaoDeAcerto < parametros.limiarDeAcerto;
      const anterior = estado.get(medicaoDaClasse.classe);
      estado.set(medicaoDaClasse.classe, {
        consecutivas: abaixo ? (anterior?.consecutivas ?? 0) + 1 : 0,
        ultimaRazaoDeAcerto: medicaoDaClasse.razaoDeAcerto,
      });
    }
  }

  const saida: CategoriaParaRemover[] = [];
  for (const [classe, st] of estado) {
    if (st.consecutivas >= parametros.geracoesConsecutivas) {
      saida.push({ classe, geracoesConsecutivasAbaixo: st.consecutivas, ultimaRazaoDeAcerto: st.ultimaRazaoDeAcerto });
    }
  }
  return saida.sort((a, b) => a.classe.localeCompare(b.classe));
}

/**
 * A-P20-2 — a calibração roda ANTES de o laço ser ligado numa trilha real.
 *
 * CONTRATO PARA O P-22 (o laço F11): antes de ligar o laço de revisão de uma
 * trilha, o P-22 DEVE
 *
 *   1. gerar os mutantes (`gerarMutantes(desafioValidoExemplo())` — ou sobre
 *      um desafio controlado da trilha em questão, via
 *      `engine/quality/mutants.ts`);
 *   2. medir o revisor REAL (`medirTaxaDeFalsoPasse` com o pipeline P-12
 *      completo injetado) — a medição falha fechada se o revisor estiver
 *      fora do ar;
 *   3. guardar cada medição no histórico e consultar ESTA função: devolve
 *      `true` enquanto faltar uma calibração APROVADA, e o laço não pode ser
 *      ligado. `false` só quando a ÚLTIMA medição do histórico foi aprovada
 *      por `decisaoDeCalibracao` (taxa geral abaixo do limiar).
 *
 * A função é PURA: o histórico é parâmetro. Histórico vazio → `true`
 * (nunca se liga um laço nunca calibrado). Mediçoes subsequentes aprovadas
 * mantêm `false`; a primeira medição que cruzar o limiar volta a exigir
 * calibração.
 */
export function calibracaoNecessariaAntesDeLigar(
  medicoesHistorico: readonly MedicaoDeFalsoPasse[],
  limiar: number = limiarDeFalsoPasse(),
): boolean {
  if (medicoesHistorico.length === 0) return true;
  const ultima = medicoesHistorico[medicoesHistorico.length - 1];
  return !decisaoDeCalibracao(ultima, limiar).aprovado;
}
