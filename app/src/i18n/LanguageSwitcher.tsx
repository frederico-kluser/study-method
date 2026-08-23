/**
 * src/i18n/LanguageSwitcher.tsx — trocador de idioma do Study Method.
 *
 * Componente React que troca o idioma ativo via `i18n.changeLanguage(lng)`
 * (instância registrada pelo react-i18next).
 *
 * PERSISTÊNCIA: repassada ao núcleo. `createAppI18n`/`initI18n` já grava a
 * preferência no localStorage (chave `LANGUAGE_STORAGE_KEY = 'app-language'`) no
 * evento `languageChanged` — então este componente só chama `changeLanguage` e a
 * persistência é efeito do evento. Na montagem aplica o idioma salvo como
 * segurança caso a instância tenha sido inicializada sem ler o localStorage.
 *
 * Onda 7 (MUI shell): agora renderiza componentes Material UI v9 (path imports)
 * para integrar com o AppBar do shell:
 *   - `variant: 'menu'` (default) → um ToggleButtonGroup compacto (ícone+flag),
 *     pensado para caber à direita na AppBar;
 *   - `variant: 'select'` → um MUI Select com MenuItem.
 * Os rótulos saem de `SUPPORTED_LANGUAGES` (code/name/flag). **IMPORTANTE:** este
 * componente continua sendo lógica-pura-friendly (sem dependência de DOM global)
 * — os testes node:test de i18n não montam React; manter o narrador com a mesma
 * interface `variant` preserva a compatibilidade com quem o consome.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Tooltip from '@mui/material/Tooltip';
import {
  DEFAULT_LANGUAGE,
  getSavedLanguage,
  isSupportedLng,
  SUPPORTED_LANGUAGES,
  type SupportedLng,
} from './index';

interface LanguageSwitcherProps {
  variant?: 'menu' | 'select';
}

/**
 * Aplica o idioma salvo no localStorage, se divergir do atual — garante que a
 * última escolha do usuário vale mesmo quando a instância foi criada sem o
 * localStorage (ex.: algum ponto que inicializou com lng explícito).
 */
async function applyPersistedLanguage(
  i18n: { language: string; changeLanguage(lng: string): Promise<unknown> },
): Promise<void> {
  const saved = getSavedLanguage();
  if (saved && saved !== i18n.language) {
    await i18n.changeLanguage(saved);
  }
}

function onChangeLang(
  i18n: { changeLanguage(lng: string): Promise<unknown> },
  value: string,
): void {
  if (!isSupportedLng(value)) return;
  // Persistência em localStorage acontece no evento languageChanged (núcleo).
  void i18n.changeLanguage(value).catch(() => undefined);
}

/** Nome curto do locale para round-trip acessível (ex.: "pt-BR" → "PT"). */
function shortCode(code: SupportedLng): string {
  return code.split('-')[0].toUpperCase();
}

/** Rótulo de exibição por locale (nome + bandeira). */
function labelFor(code: SupportedLng): string {
  const entry = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return entry ? `${entry.flag} ${entry.name}` : code;
}

function FlagLabel({ code }: { code: SupportedLng }): ReactElement {
  const entry = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return <span aria-hidden="true">{entry?.flag ?? shortCode(code)}</span>;
}

/** Variante 'menu': botão compacto que abre um Menu dropdown (usado na AppBar). */
function MenuSwitcher({
  currentCode,
  onChange,
}: {
  currentCode: SupportedLng;
  onChange: (code: string) => void;
}): ReactElement {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  return (
    <div role="group" aria-label="Idioma / Language">
      <Tooltip title={labelFor(currentCode)}>
        <IconButton
          size="small"
          color="inherit"
          aria-label="Select language"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ border: 1, borderColor: 'divider' }}
        >
          <FlagLabel code={currentCode} />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
        {SUPPORTED_LANGUAGES.map(({ code }) => (
          <MenuItem
            key={code}
            selected={currentCode === code}
            onClick={() => {
              onChange(code);
              setAnchorEl(null);
            }}
          >
            {labelFor(code)}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}

export default function LanguageSwitcher({ variant = 'menu' }: LanguageSwitcherProps): ReactElement {
  const { i18n } = useTranslation();
  const current = i18n.language;
  const currentCode: SupportedLng = isSupportedLng(current) ? current : DEFAULT_LANGUAGE;

  useEffect(() => {
    void applyPersistedLanguage(i18n).catch(() => undefined);
  }, [i18n]);

  if (variant === 'select') {
    return (
      <Select
        aria-label="Idioma / Language"
        size="small"
        value={currentCode}
        onChange={(e) => onChangeLang(i18n, e.target.value as string)}
        sx={{ minWidth: 180 }}
      >
        {SUPPORTED_LANGUAGES.map(({ code }) => (
          <MenuItem key={code} value={code}>
            {labelFor(code)}
          </MenuItem>
        ))}
      </Select>
    );
  }

  return (
    <MenuSwitcher
      currentCode={currentCode}
      onChange={(code) => onChangeLang(i18n, code)}
    />
  );
}