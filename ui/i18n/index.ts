import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { en } from './en';
import { pt } from './pt';

/**
 * Init do i18next (ENG-279) — SPA client-only: recursos inline (bundled, sem fetch),
 * init síncrono, sem `<I18nextProvider>` (o singleton basta via `initReactI18next`).
 * PT é default e fallback. A escolha PT/EN persiste em localStorage lida na init —
 * sem o plugin language-detector (que sobrescreveria a escolha no reload). Só chrome
 * da UI passa pelo i18n; artefatos exportados ficam PT-BR congelados, fora daqui.
 */

export const LANG_STORAGE_KEY = 'colar-de-sons:lang:v1';

export type Lang = 'pt' | 'en';

/** Idioma inicial: lê a preferência salva; ausente ou inválido cai em PT. */
export function initialLang(): Lang {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY) === 'en' ? 'en' : 'pt';
  } catch {
    // storage bloqueado (ex.: Safari com cookies bloqueados) — segue em PT
    return 'pt';
  }
}

void i18n.use(initReactI18next).init({
  resources: { pt: { translation: pt }, en: { translation: en } },
  lng: initialLang(),
  fallbackLng: 'pt',
  interpolation: { escapeValue: false }, // o React já escapa — sem risco de XSS
});

setHtmlLang(initialLang());

/** Troca o idioma da UI, persiste a escolha e atualiza `<html lang>`. */
export function setLang(lang: Lang): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // sem storage a escolha vale só nesta sessão — nunca quebrar o app
  }
  setHtmlLang(lang);
}

function setHtmlLang(lang: Lang): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR';
  }
}

export default i18n;
