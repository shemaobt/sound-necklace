import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { THEME_ATTRIBUTE, THEME_STORAGE_KEY, initTheme, readTheme, toggleTheme } from './theme';

/**
 * Tema claro/escuro (ENG-391). O que se testa aqui é comportamento observável:
 * o que o documento passa a valer e o que sobrevive a um recarregamento. O
 * atributo e a chave de storage são o contrato com o script de boot do
 * index.html — quem lê o tema antes do React existir.
 */

/** jsdom não implementa matchMedia; cada teste declara o que o SO prefere. */
function stubOsPrefersDark(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? prefersDark : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  stubOsPrefersDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('escolha do tema', () => {
  it('alternar troca o tema do documento e a escolha sobrevive ao recarregamento', () => {
    initTheme();
    expect(readTheme()).toBe('light');

    toggleTheme();

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');

    // simula um recarregamento: o documento esquece, o storage não
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    initTheme();

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
  });

  it('alternar duas vezes volta ao claro', () => {
    initTheme();
    toggleTheme();
    toggleTheme();

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
  });
});

describe('primeiro acesso, sem escolha guardada', () => {
  it('segue o sistema quando ele pede escuro', () => {
    stubOsPrefersDark(true);

    initTheme();

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');
  });

  it('segue o sistema quando ele pede claro', () => {
    stubOsPrefersDark(false);

    initTheme();

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
  });

  it('não grava nada: quem nunca escolheu continua acompanhando o sistema', () => {
    stubOsPrefersDark(true);

    initTheme();

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});

describe('escolha explícita vence o sistema', () => {
  it('quem escolheu claro continua no claro mesmo com o sistema no escuro', () => {
    stubOsPrefersDark(true);
    initTheme();
    // o sistema deu escuro; o usuário pede claro
    toggleTheme();

    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    initTheme();

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
  });
});

describe('ambiente sem storage (janela anônima travada, quota estourada)', () => {
  it('o app ainda abre e o tema ainda alterna', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => initTheme()).not.toThrow();
    expect(() => toggleTheme()).not.toThrow();
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('dark');

    setItem.mockRestore();
  });
});
