/**
 * app/electron/main/engine/auditEstruturais.ts — os invariantes de ESTRUTURA
 * que o loader não cobre (I12/I14/I15/I16/I17, `docs/16` §5.2). Extraído do
 * módulo `audit.ts` original na refatoração do lote L05 sem NENHUMA mudança de
 * comportamento (as mensagens são contrato de saída).
 */

import type { LoadedTrack } from '../content/trackLoader';
import type { TrackChallengeSource } from '../content/trackTypes';
import type { Surface, Violation } from './auditTypes';

type EmpurrarViolacao = (v: Violation) => void;

/**
 * Os estruturais de TRILHA: ordem de módulo duplicada (I14), slug de aula
 * duplicado (I12, chave GLOBAL de progresso) e `theory[].id` duplicado (I15).
 * A ORDEM dos pushes é a ordem de caminhada do disco — contrato do relatório.
 */
export function auditarEstruturaisDaTrilha(track: LoadedTrack, push: EmpurrarViolacao): void {
  const slugSeen = new Map<string, string>();
  const orderSeen = new Map<number, string>();
  for (const mod of track.modules) {
    const prevOrder = orderSeen.get(mod.meta.order);
    if (prevOrder !== undefined) {
      push({
        regra: 'I14',
        arquivo: `modules/${mod.meta.slug}/module.json`,
        ref: mod.meta.slug,
        campo: 'module',
        linha: 1,
        coluna: 1,
        construcao: null,
        eixo: null,
        faixa: null,
        trechoOfensor: `order: ${mod.meta.order}`,
        primeiraAulaQueEnsina: null,
        mensagem: `\`order\` ${mod.meta.order} está duplicado com o módulo \`${prevOrder}\` — a ordem pedagógica fica indefinida e o orçamento cumulativo passa a depender da ordem do disco`,
      });
    } else {
      orderSeen.set(mod.meta.order, mod.meta.slug);
    }

    for (const lesson of mod.lessons) {
      const prev = slugSeen.get(lesson.meta.slug);
      if (prev !== undefined) {
        push({
          regra: 'I12',
          arquivo: `modules/${mod.meta.slug}/lessons/${lesson.meta.slug}/lesson.json`,
          ref: `${mod.meta.slug}/${lesson.meta.slug}`,
          campo: 'lesson',
          linha: 1,
          coluna: 1,
          construcao: null,
          eixo: null,
          faixa: null,
          trechoOfensor: lesson.meta.slug,
          primeiraAulaQueEnsina: null,
          mensagem: `slug de aula duplicado (também existe em \`${prev}\`) — o slug é chave GLOBAL de progresso do aluno: as duas aulas compartilhariam o registro de conclusão`,
        });
      } else {
        slugSeen.set(lesson.meta.slug, `${mod.meta.slug}/${lesson.meta.slug}`);
      }

      const idsSeen = new Set<string>();
      for (const section of lesson.meta.theory ?? []) {
        if (idsSeen.has(section.id)) {
          push({
            regra: 'I15',
            arquivo: `modules/${mod.meta.slug}/lessons/${lesson.meta.slug}/lesson.json`,
            ref: `${mod.meta.slug}/${lesson.meta.slug}`,
            campo: 'theory',
            linha: 1,
            coluna: 1,
            construcao: null,
            eixo: null,
            faixa: null,
            trechoOfensor: section.id,
            primeiraAulaQueEnsina: null,
            mensagem: `\`theory[].id\` duplicado (\`${section.id}\`) — a segunda seção com esse id nunca é apresentada e a aula "termina" mais cedo`,
          });
        }
        idsSeen.add(section.id);
      }
    }
  }
}

/**
 * Os estruturais de DESAFIO: o conceito tem aula dona (I16) e nenhum
 * `files[].path` usa nome reservado pelo runner (I17).
 */
export function auditarEstruturaisDoDesafio(
  challenge: TrackChallengeSource,
  challengeFile: string,
  ref: string,
  conceitosDaAula: readonly string[],
  push: EmpurrarViolacao,
): void {
  // I16 — o conceito do desafio existe na aula?
  if (!conceitosDaAula.includes(challenge.concept)) {
    push({
      regra: 'I16',
      arquivo: challengeFile,
      ref,
      campo: 'lesson' as Surface | 'lesson',
      linha: 1,
      coluna: 1,
      construcao: null,
      eixo: null,
      faixa: null,
      trechoOfensor: challenge.concept,
      primeiraAulaQueEnsina: null,
      mensagem: `o desafio exercita o conceito \`${challenge.concept}\`, que a aula não declara em \`concepts\` — conceito sem aula dona não entra em nenhum orçamento`,
    });
  }

  // I17 — arquivo do aluno com nome reservado pelo runner.
  for (const file of challenge.files ?? []) {
    if (file.path === 'test.mjs' || file.path === 'package.json') {
      push({
        regra: 'I17',
        arquivo: challengeFile,
        ref,
        campo: 'starterCode',
        linha: 1,
        coluna: 1,
        construcao: null,
        eixo: null,
        faixa: null,
        trechoOfensor: file.path,
        primeiraAulaQueEnsina: null,
        mensagem: `\`files[].path\` = \`${file.path}\` é sobrescrito pelo runner em silêncio — o que o aluno escrever nesse arquivo desaparece`,
      });
    }
  }
}
