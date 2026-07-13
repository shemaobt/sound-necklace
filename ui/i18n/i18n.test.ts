import { afterEach, describe, expect, it } from 'vitest';

import { initialLang, LANG_STORAGE_KEY } from './index';

/**
 * Idioma inicial persistido (ENG-279): a escolha PT/EN sobrevive ao reload lendo
 * `localStorage` na inicialização — mesmo padrão tolerante-a-falha do tutorial-popup.
 * PT é o default; valor ausente ou inválido cai em PT.
 */

afterEach(() => {
  try {
    localStorage.removeItem(LANG_STORAGE_KEY);
  } catch {
    /* jsdom sempre tem storage; guarda por paridade com o app */
  }
});

describe('initialLang — idioma inicial (ENG-279)', () => {
  it('cai em pt quando não há preferência salva', () => {
    localStorage.removeItem(LANG_STORAGE_KEY);
    expect(initialLang()).toBe('pt');
  });

  it('lê en quando salvo', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'en');
    expect(initialLang()).toBe('en');
  });

  it('ignora valor inválido e volta a pt', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'klingon');
    expect(initialLang()).toBe('pt');
  });
});
