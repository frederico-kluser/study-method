/**
 * tests/i18n-resources.test.ts — contrato dos resources i18n (sem jsdom).
 *
 * Cobre: (a) paridade exata de chaves entre pt-BR e en; (b) todo valor não-vazio;
 * (c) isSupportedLng; (d) createAppI18n('en') resolve com tradução não-vazia;
 * (e) interpolação em ambas as línguas (chave com placeholder), sem asserção de
 * valores específicos (sujeitos a revisão de redação).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import {
  createAppI18n,
  DEFAULT_LANGUAGE,
  detectSystemLanguage,
  getSavedLanguage,
  isSupportedLng,
  LANGUAGE_STORAGE_KEY,
  resolveInitialLanguage,
  saveLanguage,
  SUPPORTED_LANGS,
  SUPPORTED_LANGUAGES,
} from '../src/i18n/index';

type JsonRecord = Record<string, unknown>;

/** localStorage fake in-memory, injetado em globalThis para os testes. */
function makeStorage(): { storage: Map<string, string>; install(): () => void } {
  const storage = new Map<string, string>();
  const fake = {
    getItem(k: string): string | null {
      return storage.has(k) ? (storage.get(k) as string) : null;
    },
    setItem(k: string, v: string): void {
      storage.set(k, v);
    },
    removeItem(k: string): void {
      storage.delete(k);
    },
  };
  return {
    storage,
    install() {
      const prev = (globalThis as { localStorage?: unknown }).localStorage;
      (globalThis as { localStorage: unknown }).localStorage = fake;
      return () => {
        (globalThis as { localStorage?: unknown }).localStorage = prev;
      };
    },
  };
}

/** Achata um objeto aninhado em chaves pontilhadas ("a.b" → "a.b.c"). */
function flattenKeys(obj: JsonRecord, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as JsonRecord, path);
    }
    return [path];
  });
}

/** Devolve o valor de uma chave pontilhada num objeto aninhado. */
function valueAt(obj: JsonRecord, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>((acc, part) => (acc as JsonRecord | undefined)?.[part], obj);
}

describe('i18n resources: paridade de chaves', () => {
  const ptKeys = flattenKeys(ptBR as JsonRecord).sort();
  const enKeys = flattenKeys(en as JsonRecord).sort();

  it('mesmo conjunto exato de chaves em pt-BR e en (sem faltas nem sobras)', () => {
    assert.deepEqual(enKeys, ptKeys, 'pt-BR e en devem ter as MESMAS chaves achatadas');
  });

  it('cada locale é arquivo JSON com ≥1 chave e é não-vazio', () => {
    assert.ok(ptKeys.length > 0, 'pt-BR deve ter chaves');
    assert.ok(enKeys.length > 0, 'en deve ter chaves');
  });

  it('todo valor é texto não-vazio (após trim)', () => {
    for (const key of ptKeys) {
      const v = valueAt(ptBR as JsonRecord, key);
      assert.equal(typeof v, 'string', `pt-BR["${key}"] deve ser string`);
      assert.ok((v as string).trim().length > 0, `pt-BR["${key}"] não deve ser vazio`);
    }
    for (const key of enKeys) {
      const v = valueAt(en as JsonRecord, key);
      assert.equal(typeof v, 'string', `en["${key}"] deve ser string`);
      assert.ok((v as string).trim().length > 0, `en["${key}"] não deve ser vazio`);
    }
  });
});

describe('isSupportedLng', () => {
  it('cobre exatamente os locales suportados', () => {
    for (const lng of SUPPORTED_LANGS) {
      assert.equal(isSupportedLng(lng), true, `${lng} deve ser suportada`);
    }
  });
  it('rejeita valores não suportados', () => {
    for (const bad of ['fr', 'en-US', 'PT-br', null, undefined, 42, '']) {
      assert.equal(isSupportedLng(bad), false, `${JSON.stringify(bad)} não deve ser suportada`);
    }
  });
});

describe('createAppI18n', () => {
  it('DEFAULT_LANGUAGE é "pt-BR"', () => {
    assert.equal(DEFAULT_LANGUAGE, 'pt-BR');
  });

  it("resolve com 'en' e traduz sem erro (não cai em key vazia)", async () => {
    const i18n = await createAppI18n('en');
    assert.equal(i18n.isInitialized, true);
    assert.equal(i18n.language, 'en');
    const enHome = i18n.t('nav.home');
    assert.equal(typeof enHome, 'string');
    assert.ok(enHome.length > 0, 'nav.home não deve traduzir para vazio (error-free)');
    // tradução real: não é a key crua nem um placeholder vazio
    assert.notEqual(enHome, 'nav.home');
  });

  it('traduz para pt-BR (default) com chaves diferentes de en', async () => {
    const enI18n = await createAppI18n('en');
    const ptI18n = await createAppI18n('pt-BR');
    assert.equal(ptI18n.language, 'pt-BR');
    const enNav = enI18n.t('nav.home');
    const ptNav = ptI18n.t('nav.home');
    assert.ok(enNav.length > 0 && ptNav.length > 0);
    assert.notEqual(enNav, ptNav, 'pt-BR e en devem ter traduções distintas');
  });

  it('lng inválido cai no fallback default sem lançar', async () => {
    const i18n = await createAppI18n('xx');
    assert.ok(['pt-BR', 'en'].includes(i18n.language), 'deve cair num language suportado');
  });
});

describe('interpolação (sem asserção de valores específicos)', () => {
  it('chave com placeholder interpola em ambas as línguas', async () => {
    // challenge.confirmDelete: "Apagar {{name}}?" / "Delete {{name}}?"
    const ptI18n = await createAppI18n('pt-BR');
    const enI18n = await createAppI18n('en');

    for (const i18n of [ptI18n, enI18n]) {
      const raw = i18n.t('challenge.confirmDelete', { name: 'BURACO_DE_NOME' });
      const noName = i18n.t('challenge.confirmDelete', { name: 'X' });
      assert.equal(typeof raw, 'string');
      assert.ok(raw.length > 0, 'chave interpolada não deve ser vazia');
      assert.ok(raw.includes('BURACO_DE_NOME'), 'valor do placeholder deve ser injetado');
      assert.ok(
        !raw.includes('{{name}}'),
        'placeholder não deve permanecer {{name}} cru depois da interpolação',
      );
      assert.notEqual(raw, noName, 'nome diferente deve mudar a string final');
    }
  });
});

describe('metadados do i18n (Ondokai-compatíveis)', () => {
  it('SUPPORTED_LANGUAGES lista code/name/flag para pt-BR e en', () => {
    assert.equal(SUPPORTED_LANGUAGES.length, 2);
    assert.deepEqual(
      SUPPORTED_LANGUAGES.map((l) => l.code),
      ['pt-BR', 'en'],
    );
    for (const l of SUPPORTED_LANGUAGES) {
      assert.ok(l.name.length > 0);
      assert.ok(l.flag.length > 0);
    }
  });

  it('LANGUAGE_STORAGE_KEY é "app-language"', () => {
    assert.equal(LANGUAGE_STORAGE_KEY, 'app-language');
  });
});

describe('persistência em localStorage', () => {
  it('saveLanguage + getSavedLanguage fazem round-trip na chave certa', () => {
    const fs = makeStorage();
    const restore = fs.install();
    try {
      assert.equal(getSavedLanguage(), null, 'nada salvo -> null');
      saveLanguage('en');
      assert.equal(fs.storage.get(LANGUAGE_STORAGE_KEY), 'en');
      assert.equal(getSavedLanguage(), 'en');
      saveLanguage('pt-BR');
      assert.equal(getSavedLanguage(), 'pt-BR');
    } finally {
      restore();
    }
  });

  it('getSavedLanguage rejeita valor não suportado (limpar/sticky inválido)', () => {
    const fs = makeStorage();
    const restore = fs.install();
    try {
      fs.storage.set(LANGUAGE_STORAGE_KEY, 'fr');
      assert.equal(getSavedLanguage(), null, 'valor inválido -> tratado como nada salvo');
    } finally {
      restore();
    }
  });

  it('changeLanguage grava no localStorage via languageChanged', async () => {
    const fs = makeStorage();
    const restore = fs.install();
    try {
      const i18n = await createAppI18n('pt-BR');
      assert.equal(fs.storage.get(LANGUAGE_STORAGE_KEY), 'pt-BR', 'init também dispara o evento');
      await i18n.changeLanguage('en');
      assert.equal(fs.storage.get(LANGUAGE_STORAGE_KEY), 'en');
      assert.equal(getSavedLanguage(), 'en');
    } finally {
      restore();
    }
  });

  it('resolveInitialLanguage prioriza localStorage sobre o default', () => {
    const fs = makeStorage();
    const restore = fs.install();
    try {
      fs.storage.set(LANGUAGE_STORAGE_KEY, 'en');
      assert.equal(resolveInitialLanguage(), 'en');
      // lng explícito vence o salvo
      assert.equal(resolveInitialLanguage('pt-BR'), 'pt-BR');
    } finally {
      restore();
    }
  });
});

describe('detecção do idioma do sistema', () => {
  function withNavigator(language: string | null | undefined): () => void {
    const prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      value: { language: language ?? '' },
      configurable: true,
      writable: true,
    });
    return () => {
      if (prev) Object.defineProperty(globalThis, 'navigator', prev);
    };
  }

  it('pt* -> pt-BR', () => {
    for (const l of ['pt-BR', 'pt-PT']) {
      const restore = withNavigator(l);
      try {
        assert.equal(detectSystemLanguage(), 'pt-BR', `${l} deve mapear para pt-BR`);
      } finally {
        restore();
      }
    }
  });

  it('en* -> en', () => {
    const restore = withNavigator('en-US');
    try {
      assert.equal(detectSystemLanguage(), 'en');
    } finally {
      restore();
    }
  });

  it('idioma não suportado ou ausente -> null', () => {
    for (const l of ['de-DE', '', null, undefined]) {
      const restore = withNavigator(l);
      try {
        assert.equal(detectSystemLanguage(), null, `${String(l)} deve ser null`);
      } finally {
        restore();
      }
    }
  });
});