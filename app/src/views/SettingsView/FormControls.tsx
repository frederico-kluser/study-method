/**
 * src/views/SettingsView/FormControls.tsx — controles de formulário reutilizados
 * pelos painéis de Settings (campo de senha com mostrar/ocultar, estado textual).
 */
import type { ReactElement, ReactNode } from 'react';

/** Input tipo senha com botão de mostrar/ocultar (compatível com type password). */
export function PasswordField({
  value,
  onChange,
  placeholder,
  label,
  readOnly,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  label?: string;
  readOnly?: boolean;
}): ReactElement {
  return (
    <label className="form-field">
      {label ? <span className="form-field__label">{label}</span> : null}
      <input
        type="password"
        className="form-field__input"
        value={value}
        placeholder={placeholder}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Mensagem de estado colorida (success/danger/muted). */
export function StatusText({
  tone,
  children,
}: {
  tone: 'success' | 'danger' | 'muted';
  children: ReactNode;
}): ReactElement {
  return <p className={`status-text status-text--${tone}`}>{children}</p>;
}

/** Spinner inline + texto, usado durante operações assíncronas. */
export function InlineSpinner({ text }: { text: string }): ReactElement {
  return (
    <span className="inline-spinner" role="status">
      <span className="inline-spinner__dot" aria-hidden="true" />
      {text}
    </span>
  );
}