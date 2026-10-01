/**
 * src/components/chat/TypewriterText.tsx — efeito "digitação" (~100 tokens/s
 * default — "livre" para as respostas do tutor; a LessonView passa 10 tps
 * para as REVIEWS de desafio, pedido do dono da onda1-nav-ui).
 *
 * ONDA2-imessage: TODA mensagem do assistente que ENTRA durante a sessão
 * (seção 'next', resposta 'answer', review seedada) é DIGITADA
 * progressivamente — o texto COMPLETO fica no histórico (trackLessonState) e
 * o streaming é SÓ exibição: o componente corta `text` por
 * `typewriterCut(text, elapsedMs, tps)` num interval de
 * `typewriterDelayPerChar(tps)` (~2.5ms/char → ~400 chars/s).
 *
 * REGRAS DE OURO (REPLAN):
 *   - `active={false}` → texto COMPLETO e instantâneo (mensagens RESTAURADAS
 *     do cache ou do seed em remontagem NUNCA digitam — elas não são marcadas
 *     como novas pela LessonView);
 *   - cleanup do interval no desmonte (trocar de aba desmonta a view — nenhum
 *     timer vivo; o StrictMode do dev roda setup→cleanup→setup no mesmo
 *     fiber, o que reinicia a digitação na 2ª passada sem vazar o 1º timer);
 *   - `onStart`/`onDone` avisam a LessonView (indicador "digitando" e
 *     auto-scroll — o gating do "Gerar novo desafio" da review passou a ser
 *     só o turno em voo, ONDA1-NAV-UI); `onTick`
 *     chama a cada step para o auto-scroll acompanhar a digitação;
 *   - `children(partial, cut)` recebe o trecho já digitado E o ÍNDICE do corte
 *     (o render fica com o consumidor).
 *
 * ONDA "chat e código" (o `cut` no children): o consumidor deixou de receber só
 * a string cortada. Fatiar markdown CRU por caractere era o defeito — a bolha
 * mostrava crase, `**` e cerca como texto, e o `<ReactMarkdown>` re-parseava o
 * fragmento 28x/s. Quem renderiza agora (`SegmentedMarkdown`) precisa do ÍNDICE
 * para mapear o mesmo corte sobre SEGMENTOS (prosa e blocos de código) em vez
 * de sobre caracteres. Este componente continua dono APENAS do relógio: ele não
 * sabe o que é markdown, e `typewriterCut`/`typewriterDelayPerChar`/
 * `TYPEWRITER_TPS` seguem intocados — a duração de uma seção é a mesma de
 * antes, bit a bit.
 *
 * ONDA10 (velocidade de LEITURA + `skip`): a TEORIA da aula passa a ser
 * digitada a 7 tps = 28 chars/s (a conta completa está em
 * `TYPEWRITER_TPS` — trackLessonState.ts). O default do componente segue 100
 * (chamador manda): quem escolhe é a LessonView, por `chatBubbleTps`. E para
 * o aluno NUNCA ficar refém da animação, o prop `skip` pula a digitação: um
 * clique no painel, QUALQUER tecla ou o botão "Mostrar tudo" viram `skip=true`
 * na LessonView.
 *
 * ONDA-SKIP-1S (o pulo DEIXA de estourar o texto na cara — pedido do dono):
 * "ela termina de mostrar tudo em 1s ai calculamos a quantidade de caracteres
 * para saber como mostramos eles com mesmo tempo ate dar um segundo". ANTES o
 * `skip` fazia `setCut(text.length)` instantâneo — o resto da mensagem
 * "piscava" inteiro num frame, o texto longo virava um murro e o aluno perdia
 * o fio do que estava sendo escrito (DEFEITO MORTO aqui). AGORA o pulo inicia
 * uma VARREDURA: o restante não revelado é distribuído UNIFORMEMENTE por
 * ~1000 ms (ms por caractere = 1000 / chars restantes — `skipSweepDelayPerChar`,
 * a conta literal do dono), com ticks de ~16 ms calculando o corte pelo tempo
 * decorrido (`skipSweepCut` — trackLessonState.ts, puro e testado). Detalhes
 * do relógio no corpo do efeito; o relógio de DIGITAÇÃO
 * (`typewriterCut`/`typewriterDelayPerChar`/`TYPEWRITER_TPS`) não foi tocado —
 * a varredura é um segundo relógio, só do pulo.
 *
 * ONDA2-CHAT-NINTENDO (erro instantâneo): `instant` desliga o efeito de
 * digitação — o texto COMPLETO aparece no mount, sem interval, e NENHUM
 * callback de stream é disparado (a bolha não está "digitando": o indicador
 * não pisca e o auto-scroll não acompanha tick — a mensagem já está inteira).
 * Usado pela ChatBubble nas bolhas de ERRO de execução (kind 'review' com
 * `errorFor` — o seed `formatErrorBubble` pode ter centenas de chars; a 10 tps
 * levariam ~55s). A review de APROVAÇÃO (sem `errorFor`) continua digitando.
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  SKIP_SWEEP_TICK_MS,
  skipSweepCut,
  typewriterCut,
  typewriterDelayPerChar,
} from '../../lib/trackLessonState';
// ONDA-SKIP-1S: o mesmo helper de sempre (lib/confetti.ts, reusado pela
// RoadmapView) para honrar `prefers-reduced-motion: reduce` (SC 2.3.3) na
// varredura do `skip`.
import { prefersReducedMotion } from '../../lib/confetti';

export function TypewriterText({
  text,
  active,
  tps = 100,
  instant = false,
  skip = false,
  onStart,
  onDone,
  onTick,
  children,
}: {
  /** Texto COMPLETO (o histórico guarda o conteúdo integral — sempre). */
  text: string;
  /**
   * true → DIGITA do 0 ao fim no mount (mensagem nova da sessão); false →
   * completo instantâneo (restaurada do cache/seed antigo — nunca digita).
   * IMUTÁVEL por mensagem: quando true, permanece true até o fim da vida do
   * componente (o estado interno `cut` congela em text.length ao concluir).
   */
  active: boolean;
  /** tokens por segundo do efeito (default 100 — o contrato da Onda 1;
   *  ONDA1-NAV-UI: a LessonView passa 10 para a review do desafio — "escrever
   *  em IA online" a 10 tps; mensagens/replies do tutor seguem "livres" com o
   *  default atual). */
  tps?: number;
  /**
   * ONDA2-CHAT-NINTENDO: true → texto COMPLETO de uma vez (bolha de ERRO de
   * execução — nunca passa pelo typewriter). Sem interval, sem onStart/
   * onDone/onTick. `instant` vence sobre `tps`/`active`.
   */
  instant?: boolean;
  /**
   * ONDA10 + ONDA-SKIP-1S: true → o aluno PULOU a digitação em andamento
   * ("quem lê rápido não pode ficar esperando"). O texto NÃO aparece
   * instantâneo: o restante é revelado numa varredura LINEAR de ~1 s
   * (`SKIP_SWEEP_MS`), cada caractere restante com a mesma fatia de tempo
   * (pedido do dono: "termina de mostrar tudo em 1s … com mesmo tempo ate dar
   * um segundo"). No fim a varredura dispara `onDone` uma única vez, para a
   * LessonView tirar o indicador "digitando" e liberar o card do quiz da
   * seção — o indicador some quando a varredura TERMINA, não no clique.
   * Exceções instantâneas (documentadas no efeito): texto JÁ revelado por
   * inteiro e `prefers-reduced-motion: reduce` (SC 2.3.3). Diferente de
   * `instant`: `instant` é uma decisão do CONTEÚDO (a bolha de erro nunca
   * digita), `skip` é uma decisão do ALUNO no meio da digitação.
   */
  skip?: boolean;
  /** Avisa que a digitação COMEÇOU (indicador "digitando" + auto-scroll). */
  onStart?: () => void;
  /** Avisa que a digitação TERMINOU (texto completo renderizado). */
  onDone?: () => void;
  /** Chamado a cada step — o consumidor rola o painel para o fim. */
  onTick?: () => void;
  /**
   * Recebe o trecho já digitado E o índice do corte, para renderizar. O índice
   * é o que permite ao consumidor cortar por SEGMENTO em vez de por caractere.
   */
  children: (partial: string, cut: number) => ReactNode;
}): ReactElement {
  // Estado de exibição: começa vazio quando vai digitar; completo quando não
  // (restaurada do cache/seed antigo OU `instant` — erro de execução que NÃO
  // passa pelo typewriter).
  const [cut, setCut] = useState<number>(() => (instant || !active ? text.length : 0));
  const startedAtRef = useRef<number | null>(null);
  // ONDA-SKIP-1S: espelho do `cut` para o branch do `skip` ler o corte ATUAL
  // SEM depender do estado (o efeito do pulo roda no mesmo commit em que o
  // `cut` pode ainda estar um tick atrás — o espelho é escrito junto com cada
  // `setCut` e também no render, e assim o `cutAtSkip` da varredura é
  // exatamente onde a digitação parou: nada pisca para trás).
  const cutRef = useRef(cut);
  cutRef.current = cut;
  // ONDA-SKIP-1S: a varredura de `skip` em andamento (null = não há). Guarda o
  // instante do pulo E o corte do pulo — é o que permite RETOMAR a varredura
  // quando o efeito re-rodar no meio dela (StrictMode dev: setup→cleanup→
  // setup; ou o `skip` voltando a false quando uma mensagem nova entra e expira
  // o pedido) sem reiniciar o orçamento de ~1 s.
  const sweepRef = useRef<{ cutAtSkip: number; startedAt: number } | null>(null);
  // ONDA10: bolha JÁ concluída nunca redigita. Sem isto, o `skip` (que é um
  // sinal COMPARTILHADO da LessonView) ao voltar para false — o que acontece
  // sozinho quando uma mensagem NOVA entra — re-rodaria o efeito da bolha
  // antiga, disparando onStart/onDone de novo e piscando o card do quiz dela.
  // `textRef` reabre a porta quando o TEXTO muda (outra mensagem no mesmo
  // fiber); o StrictMode do dev continua reiniciando a digitação porque na 2ª
  // passada `doneRef` ainda é false.
  const doneRef = useRef(false);
  const textRef = useRef(text);
  // Callbacks por REF (identidade estável): o interval não re-registra quando
  // o pai re-renderiza (mesmo padrão do tIRef da LessonView).
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    // `instant` (erro de execução) ou `active={false}` (restaurada) → texto
    // completo imediato: sem interval e sem callbacks de stream (a bolha não
    // "digita" — o indicador e o auto-scroll não precisam acompanhar nada).
    // São decisões de CONTEÚDO, não o pulo do aluno (ONDA2-CHAT-NINTENDO) —
    // continuam INSTANTÂNEAS mesmo com a varredura da ONDA-SKIP-1S.
    if (!active || instant) return;
    if (textRef.current !== text) {
      textRef.current = text;
      doneRef.current = false;
      // ONDA-SKIP-1S: texto NOVO no mesmo fiber → a varredura pendente do
      // texto anterior não sobrevive (aquele relógio era do texto antigo).
      sweepRef.current = null;
    }
    if (doneRef.current) return;

    // ONDA-SKIP-1S — o relógio do PULO do aluno (o "acelerar"/"mostrar tudo").
    // `startSweep` é o MESMO corpo para COMEÇAR e para RETOMAR a varredura:
    // ticks de ~16 ms (`SKIP_SWEEP_TICK_MS`) em que o corte sai do tempo
    // DECORRIDO desde o pulo (`skipSweepCut`) — nunca de um acumulado por
    // tick, então timer atrasado não estica o orçamento de ~1 s. Por que não
    // um `setTimeout` POR CARACTERE: timers aninhados são clampados a ~4 ms
    // pelo browser — 500 chars restantes levariam ≥ 2 s, quebrando o "1s" do
    // dono justamente nas mensagens longas. `onTick` roda a cada passo (o
    // auto-scroll da LessonView acompanha a varredura como acompanha a
    // digitação) e `onDone` dispara UMA vez no fim (guard `doneRef`).
    const startSweep = (): (() => void) => {
      const sweep = sweepRef.current;
      if (!sweep) return () => {};
      const timer = window.setInterval(() => {
        const elapsed = Date.now() - sweep.startedAt;
        const next = skipSweepCut(text.length, sweep.cutAtSkip, elapsed);
        cutRef.current = next;
        setCut(next);
        onTickRef.current?.();
        if (next >= text.length) {
          // Fim da varredura: texto inteiro + `onDone` UMA vez — o indicador
          // "digitando" SOME AQUI (no fim dos ~1 s), NÃO no clique do aluno.
          doneRef.current = true;
          sweepRef.current = null;
          window.clearInterval(timer);
          onDoneRef.current?.();
        }
      }, SKIP_SWEEP_TICK_MS);
      // Cleanup OBRIGATÓRIO: desmontagem (troca de aba) e StrictMode (dev).
      return () => window.clearInterval(timer);
    };

    // (1) Varredura JÁ em andamento → RETOMA do instante original do pulo
    // (`sweepRef` guarda startedAt/cutAtSkip). É o caminho do StrictMode dev
    // (setup→cleanup→setup no mesmo fiber) e do `skip` que voltou a false no
    // meio da varredura (uma mensagem nova expirou o pedido — ver
    // `skipAtLen` na LessonView): NENHUMA dessas re-rodadas reinicia o
    // orçamento de ~1 s nem vaza dois intervals (o cleanup acima mata o
    // anterior), e `onStart` NÃO é re-chamado — pular no meio não "recomeça".
    if (sweepRef.current !== null) return startSweep();

    // (2) ONDA10 + ONDA-SKIP-1S (pular a animação): o aluno pediu o texto
    // inteiro — mas o texto NÃO estoura mais na tela. Fica ANTES do onStart:
    // pular no meio não "recomeça" a digitação.
    if (skip) {
      // Texto JÁ inteiro na tela (o pulo chegou depois do fim natural, ou
      // texto vazio) → completa na hora: não há resto para varrer. Mesma
      // idempotência de sempre: o `doneRef` impede re-typar/re-disparar.
      if (cutRef.current >= text.length) {
        doneRef.current = true;
        cutRef.current = text.length;
        setCut(text.length);
        onDoneRef.current?.();
        return;
      }
      // SC 2.3.3 (política do projeto, ver src/theme.ts e os blocos
      // `@media (prefers-reduced-motion: reduce)`): sob reduced motion a
      // varredura vira revelação INSTANTÂNEA — o movimento é dispensável, o
      // conteúdo não. Decisão tomada AQUI (no relógio, que conhece o corte)
      // em vez de na LessonView: o consumidor não ganha ramo novo.
      if (prefersReducedMotion()) {
        doneRef.current = true;
        cutRef.current = text.length;
        setCut(text.length);
        onDoneRef.current?.();
        return;
      }
      // A varredura começa EXATAMENTE onde a digitação parou (`cutRef` = o
      // corte do pulo) e distribui o RESTO uniformemente pelos ~1 s da
      // `SKIP_SWEEP_MS`: 1 char sobrando ou 500, cada caractere recebe a
      // mesma fatia de tempo (a conta do dono está em
      // `skipSweepDelayPerChar`).
      sweepRef.current = { cutAtSkip: cutRef.current, startedAt: Date.now() };
      return startSweep();
    }

    // (3) Digitação normal — o relógio de sempre (`typewriterCut`/`tps`),
    // intocado pela ONDA-SKIP-1S.
    onStartRef.current?.();
    startedAtRef.current = Date.now();
    const delay = typewriterDelayPerChar(tps);
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - (startedAtRef.current ?? 0);
      const next = typewriterCut(text, elapsed, tps);
      cutRef.current = next;
      setCut(next);
      onTickRef.current?.();
      if (next >= text.length) {
        // Concluiu: para o interval e avisa (o indicador "digitando" sai do
        // DOM — mount condicional — e o "Gerar novo desafio" habilita).
        doneRef.current = true;
        window.clearInterval(timer);
        onDoneRef.current?.();
      }
    }, delay);
    // Cleanup OBRIGATÓRIO: desmontagem (troca de aba) e StrictMode (dev) —
    // nenhum interval sobrevive ao fim do componente.
    return () => window.clearInterval(timer);
  }, [active, instant, skip, text, tps]);

  return <>{children(text.slice(0, cut), cut)}</>;
}
