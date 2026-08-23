/**
 * src/views/LessonView/LessonView.tsx — tela de Aula: assunto → pesquisa → aula.
 *
 * Fluxo:
 *  1. O usuário digita o assunto e clica "Gerar aula".
 *  2. A view assina `study.onLessonProgress` (fases pesquisando/autorando/
 *     materializando/validando/concluindo) antes de chamar `study.generateLesson`.
 *  3. Ao resolver, o payload é normalizado por `parseLessonResult` (aceita
 *     `StudyLesson` direto ou `{ lesson, rejected }`) e renderizado via
 *     react-markdown v9 com blocos de código estilizados pelo tema.
 *
 * Assinatura de generateLesson: no api-schema está `generateLesson(): Promise<unknown>`
 * (a implementação do main chega em outra onda), mas o runtime do preload encaminha
 * argumentos ao invoke; passamos o `subject` como primeiro argumento — conforme
 * documentado no contrato de requisição ("o renderer passa args").
 */
import ReactMarkdown from 'react-markdown';
import { useCallback, useState, type ReactElement } from 'react';
import type { StudyFinding } from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import { useLessonProgress } from '../../hooks/useLessonProgress';
import { parseLessonProgressEvent, type LessonPhaseState } from '../../lib/lessonProgress';
import { parseLessonResult, type ParsedLesson } from '../../lib/lessonParse';
import { validateSubject } from '../../lib/validate';
import { StatusText, InlineSpinner } from '../SettingsView/FormControls';

const PHASE_LABELS: Record<LessonPhaseState['phase'], string> = {
  pesquisando: 'Pesquisando',
  autorando: 'Autorando',
  materializando: 'Materializando',
  validando: 'Validando',
  concluindo: 'Concluindo',
  gerando: 'Gerando',
};

type GenerateStatus = 'idle' | 'running' | 'done' | 'error';

function SourceList({ findings }: { findings: StudyFinding[] }): ReactElement {
  if (findings.length === 0) return <p className="lesson__none">Nenhuma fonte registrada.</p>;
  return (
    <ul className="source-list">
      {findings.map((f, i) => (
        <li className="source-list__item" key={`${f.url}-${i}`}>
          <a
            className="source-list__link"
            href={f.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {f.title}
          </a>
          {f.description ? <p className="source-list__desc">{f.description}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function ChallengesSection({
  parsed,
  rejected,
}: {
  parsed: ParsedLesson;
  rejected: ParsedLesson['rejected'];
}): ReactElement {
  const challenges = parsed.lesson?.challenges ?? [];
  return (
    <section className="lesson__block">
      <h3 className="lesson__h3">Desafios aprovados</h3>
      {challenges.length === 0 ? (
        <p className="lesson__none">Nenhum desafio gerado.</p>
      ) : (
        <div className="challenge-grid">
          {challenges.map((c) => (
            <article className="challenge-card" key={c.challengeId}>
              <h4 className="challenge-card__title">{c.title}</h4>
              <div className="challenge-card__meta">
                <span className="badge badge--muted">{c.language}</span>
                {c.verdict ? <span className="badge badge--ok">{c.verdict}</span> : null}
              </div>
              <span className="badge badge--accent">editor chega em breve</span>
            </article>
          ))}
        </div>
      )}
      {rejected.length > 0 ? (
        <div className="lesson__warn">
          <strong>Aviso:</strong> {rejected.length} desafio(s) rejeitado(s) na
          geração (editor real chega na onda 4).
          <ul>
            {rejected.map((r, i) => (
              <li key={i}>
                {r.title}
                {r.reason ? ` — ${r.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default function LessonView(): ReactElement {
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState<GenerateStatus>('idle');
  const [phase, setPhase] = useState<LessonPhaseState>({
    phase: 'gerando',
    fraction: 0,
    message: '',
    done: false,
  });
  const [parsed, setParsed] = useState<ParsedLesson | null>(null);
  const [error, setError] = useState('');

  const onProgress = useCallback((raw: unknown) => {
    const next = parseLessonProgressEvent(raw);
    setPhase(next);
    setStatus((s) => (s === 'idle' ? 'running' : s));
  }, []);

  useLessonProgress(onProgress);

  const generate = async (): Promise<void> => {
    const check = validateSubject(subject);
    if (!check.ok) {
      setError(check.message ?? 'Assunto inválido.');
      setStatus('error');
      return;
    }
    setError('');
    setParsed(null);
    setStatus('running');
    setPhase({ phase: 'gerando', fraction: 0, message: 'Iniciando…', done: false });
    try {
      // generateLesson é tipado como ()=>Promise<unknown>; o runtime encaminha
      // args ao invoke — passamos o subject como primeiro argumento.
      const typed = getApi().study.generateLesson as (s: string) => Promise<unknown>;
      const payload = await typed(subject.trim());
      const result = parseLessonResult(payload);
      if (!result.ok) {
        setError(result.error ?? 'Falha ao gerar aula.');
        setStatus('error');
        return;
      }
      setParsed(result);
      setPhase((prev) => ({ ...prev, phase: 'concluindo', done: true }));
      setStatus('done');
    } catch (err) {
      setError(`Erro ao gerar a aula: ${String(err)}`);
      setStatus('error');
    }
  };

  const canGenerate = status !== 'running';

  return (
    <section className="view lesson">
      <h1 className="lesson__title">Aula</h1>

      <div className="lesson__input">
        <label className="form-field form-field--grow" htmlFor="lesson-subject">
          <span className="form-field__label">Qual assunto você quer estudar?</span>
          <input
            id="lesson-subject"
            type="text"
            className="form-field__input"
            value={subject}
            placeholder="ex.: filas em C, recursão, machine learning do zero…"
            disabled={status === 'running'}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn--primary lesson__generate"
          disabled={!canGenerate}
          onClick={generate}
        >
          {status === 'running' ? <InlineSpinner text="Gerando…" /> : 'Gerar aula'}
        </button>
      </div>

      {status === 'running' || status === 'done' ? (
        <div className="phase-steps" role="status">
          {(Object.keys(PHASE_LABELS) as LessonPhaseState['phase'][]).map((key) => {
            const active = phase.phase === key;
            // phases com índice menor que a atual foram concluídas.
            const order = Object.keys(PHASE_LABELS).indexOf(key);
            const currentOrder = Object.keys(PHASE_LABELS).indexOf(phase.phase);
            const done = order < currentOrder;
            return (
              <div
                className={
                  'phase-step' +
                  (done ? ' is-done' : '') +
                  (active ? ' is-active' : '')
                }
                key={key}
              >
                <span className="phase-step__mark">{done ? '✓' : active ? '●' : '○'}</span>
                <span className="phase-step__label">{PHASE_LABELS[key]}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {status === 'running' && phase.message ? (
        <StatusText tone="muted">
          <InlineSpinner text={phase.message} />
        </StatusText>
      ) : null}

      {error ? <StatusText tone="danger">{error}</StatusText> : null}

      {parsed?.lesson && status === 'done' ? (
        <article className="lesson__card">
          <h2 className="lesson__card-title">{parsed.lesson.title}</h2>
          {parsed.lesson.subject ? (
            <p className="lesson__subject">Assunto: {parsed.lesson.subject}</p>
          ) : null}
          <div className="lesson__markdown">
            <ReactMarkdown
              components={{
                pre: ({ children }) => <pre className="md-pre">{children}</pre>,
                code: (props) => <code className="md-code" {...props} />,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer noopener">
                    {children}
                  </a>
                ),
              }}
            >
              {parsed.lesson.markdown}
            </ReactMarkdown>
          </div>

          <section className="lesson__block">
            <h3 className="lesson__h3">Fontes</h3>
            <SourceList findings={parsed.lesson.findings} />
          </section>

          <ChallengesSection parsed={parsed} rejected={parsed.rejected} />
        </article>
      ) : null}
    </section>
  );
}