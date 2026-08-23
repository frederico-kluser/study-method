/**
 * src/features/onboarding/logic/onboardingSignals.ts
 *
 * SINAIS de runtime do Study Method para o `evaluateStepAction`.
 *
 * O hook `useOnboarding` constrói o `OnboardingRuntimeContext` a partir:
 *  - da aba ativa do shell (`activeView`, passada pelo OnboardingHost);
 *  - de leituras de DOM confiáveis das viewss (campos/estado reais), seguindo o
 *    mesmo espírito do ondokai (`getTargetInputText` / `getShortcutEditorState`).
 *
 * Para sinais que as views expõem só em render (geração de aula, teste de
 * resposta), adicionamos atributos `data-onboarding-signal` MÍNIMOS nas views
 * (regra do handoff: "adicione APENAS o atributo"). As funções abaixo são PURAS
 * (sem React) e o motivo de lerem via um `DocumentLike` mínimo é permitir teste
 * unitário sem jsdom.
 *
 * Fonte de verdade dos marcadores (grep `data-onboarding-signal`):
 *  - LessonView: `data-onboarding-signal="lesson-status:<idle|running|done|error>"`
 *    no contêiner da tela de Aula — espelha o estado de geração (`status`).
 *  - ChallengeView: `data-onboarding-signal="test-status:<idle|running|done|error>"`
 *    no botão/contêiner de "Testar resposta" — espelha `testStatus`.
 */

/** Forma mínima de elemento de DOM usada nas leituras. */
export interface SignalElement {
  getAttribute(name: string): string | null;
  textContent?: string | null;
  value?: string;
}

/** Forma mínima de documento (querySelector/querySelectorAll). */
export interface SignalDocumentLike {
  querySelector(selector: string): SignalElement | null;
  querySelectorAll(selector: string): SignalElement[] | ArrayLike<SignalElement>;
}

function doc(): SignalDocumentLike | undefined {
  return (globalThis as unknown as { document?: SignalDocumentLike }).document;
}

/** Lê o valor alvo de um input/textarea (`data-onboarding-target=<id>`). */
export function readInputValue(targetId: string): string {
  const d = doc();
  if (!d) return '';
  const root = d.querySelector(`[data-onboarding-target="${targetId}"]`);
  if (!root) return '';
  const input =
    (root as unknown as { querySelector?: (s: string) => SignalElement | null })
      .querySelector?.('input, textarea');
  const el = input ?? root;
  return typeof el.value === 'string' ? el.value : '';
}

/** Valor de um sinal `data-onboarding-signal="name:<value>"` no DOM. */
export function readSignalValue(name: string): string | null {
  const d = doc();
  if (!d) return null;
  const nodes = d.querySelectorAll(`[data-onboarding-signal^="${name}:"]`);
  const arr = nodes as SignalElement[];
  for (let i = 0; i < arr.length; i += 1) {
    const attr = arr[i]?.getAttribute('data-onboarding-signal');
    if (attr && attr.startsWith(`${name}:`)) {
      return attr.slice(name.length + 1);
    }
  }
  return null;
}

/** Conteúdo de texto do editor CodeMirror do desafio (`.cm-content`). */
export function readEditorText(targetId: string): string {
  const d = doc();
  if (!d) return '';
  const root = d.querySelector(`[data-onboarding-target="${targetId}"]`);
  if (!root) return '';
  const content = (root as unknown as { querySelector?: (s: string) => SignalElement | null })
    .querySelector?.('.cm-content');
  return (content?.textContent ?? '').trim();
}

/** Constrói o contexto runtime a partir das leituras de DOM + aba ativa. */
export function buildRuntimeContext(activeView: string): {
  activeView: string;
  lessonSubjectNonEmpty: boolean;
  lessonRunningOrDone: boolean;
  studioCodeNonEmpty: boolean;
  testAnswerTriggered: boolean;
  keysFilled: boolean;
} {
  const lessonStatus = readSignalValue('lesson-status');
  const testStatus = readSignalValue('test-status');
  const deepseekKey = readKeysPanelValue(0);
  const braveKey = readKeysPanelValue(1);
  // ACHADO-5: se as chaves ALREADY estão configuradas (vindas do status/gate do
  // KeysPanel), o passo `settings-keys-filled` fica satisfeito mesmo com os
  // inputs vazios — o usuário não precisa redigitar chaves já salvas.
  const keysConfigured = readSignalValue('keys-configured') === 'true';

  return {
    activeView,
    lessonSubjectNonEmpty: readInputValue('lesson-subject').trim().length > 0,
    lessonRunningOrDone:
      lessonStatus === 'running' || lessonStatus === 'done',
    studioCodeNonEmpty: readEditorText('challenge-editor').length > 0,
    testAnswerTriggered:
      testStatus === 'running' || testStatus === 'done' || testStatus === 'error',
    keysFilled: (deepseekKey.length > 0 && braveKey.length > 0) || keysConfigured,
  };
}

/** Lê o n-ésimo input de chave dentro da seção `settings-keys-section`. */
function readKeysPanelValue(index: number): string {
  const d = doc();
  if (!d) return '';
  const root = d.querySelector('[data-onboarding-target="settings-keys-section"]');
  if (!root) return '';
  const inputs =
    (root as unknown as { querySelectorAll?: (s: string) => SignalElement[] })
      .querySelectorAll?.('input') ?? [];
  const arr = inputs as SignalElement[];
  for (let i = 0; i < arr.length; i += 1) {
    if (i === index) {
      return arr[i]?.value ?? '';
    }
  }
  return '';
}