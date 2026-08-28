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
 *   - `children(partial)` recebe o trecho já digitado (o render — markdown —
 *     fica com o consumidor; a review usa ReactMarkdown sobre o partial).
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
import { typewriterCut, typewriterDelayPerChar } from '../../lib/trackLessonState';

export function TypewriterText({
  text,
  active,
  tps = 100,
  instant = false,
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
  /** Avisa que a digitação COMEÇOU (indicador "digitando" + auto-scroll). */
  onStart?: () => void;
  /** Avisa que a digitação TERMINOU (texto completo renderizado). */
  onDone?: () => void;
  /** Chamado a cada step — o consumidor rola o painel para o fim. */
  onTick?: () => void;
  /** Recebe o trecho já digitado para renderizar. */
  children: (partial: string) => ReactNode;
}): ReactElement {
  // Estado de exibição: começa vazio quando vai digitar; completo quando não
  // (restaurada do cache/seed antigo OU `instant` — erro de execução que NÃO
  // passa pelo typewriter).
  const [cut, setCut] = useState<number>(() => (instant || !active ? text.length : 0));
  const startedAtRef = useRef<number | null>(null);
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
    if (!active || instant) return;
    onStartRef.current?.();
    startedAtRef.current = Date.now();
    const delay = typewriterDelayPerChar(tps);
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - (startedAtRef.current ?? 0);
      const next = typewriterCut(text, elapsed, tps);
      setCut(next);
      onTickRef.current?.();
      if (next >= text.length) {
        // Concluiu: para o interval e avisa (o indicador "digitando" sai do
        // DOM — mount condicional — e o "Gerar novo desafio" habilita).
        window.clearInterval(timer);
        onDoneRef.current?.();
      }
    }, delay);
    // Cleanup OBRIGATÓRIO: desmontagem (troca de aba) e StrictMode (dev) —
    // nenhum interval sobrevive ao fim do componente.
    return () => window.clearInterval(timer);
  }, [active, instant, text, tps]);

  return <>{children(text.slice(0, cut))}</>;
}
