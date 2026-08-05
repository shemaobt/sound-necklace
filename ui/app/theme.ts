/**
 * Tema claro/escuro (ENG-391). O tema vive num atributo do `<html>` — não no
 * estado do React — porque quem o aplica primeiro é o script síncrono do
 * `index.html`, antes de existir React. Aqui mora a mesma precedência para o
 * app em execução.
 *
 * DUPLICAÇÃO DELIBERADA: a precedência abaixo está repetida no `<script>` do
 * `index.html`. Não é descuido — um efeito do React roda depois da primeira
 * pintura e o usuário veria um piscar do tema errado. Mudou aqui, muda lá
 * (mesmo atributo, mesma chave, mesma ordem).
 */

export type Theme = 'light' | 'dark';

/** Atributo do `<html>` que os blocos de tema do tokens.css selecionam. */
export const THEME_ATTRIBUTE = 'data-cds-theme';

/** Chave da escolha explícita (convenção do app: `colar-de-sons:<coisa>:v1`). */
export const THEME_STORAGE_KEY = 'colar-de-sons:theme:v1';

/**
 * Escolha guardada, se houver e se o storage responder. Janela anônima travada
 * ou quota estourada não podem impedir o app de abrir — daí o catch.
 */
function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
}

/** Preferência do sistema; sem `matchMedia` (jsdom, browsers velhos), claro. */
function osTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Precedência: escolha explícita > preferência do sistema > claro. */
function resolveTheme(): Theme {
  return storedTheme() ?? osTheme();
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
}

/**
 * Tema em vigor: o que o documento está mostrando (posto pelo script de boot ou
 * por um toggle desta sessão) e, na ausência dele, o que a precedência resolve.
 * Ler o atributo é o que faz o toggle continuar funcionando sem storage.
 */
export function readTheme(): Theme {
  const applied = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  return applied === 'dark' || applied === 'light' ? applied : resolveTheme();
}

/**
 * Aplica o tema no boot. NÃO grava nada: quem nunca escolheu segue o sistema
 * para sempre — gravar aqui o congelaria no que o SO dizia da primeira vez.
 */
export function initTheme(): Theme {
  const theme = resolveTheme();
  applyTheme(theme);
  return theme;
}

/** Alterna e guarda a escolha; sem storage, vale só por esta sessão. */
export function toggleTheme(): Theme {
  const next: Theme = readTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // storage bloqueado: o documento já mudou, a escolha só não sobrevive ao reload
  }
  return next;
}
