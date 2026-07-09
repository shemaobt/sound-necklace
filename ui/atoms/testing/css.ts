/**
 * Helpers de teste para afirmar invariantes no TEXTO dos css dos átomos
 * (jsdom não avalia media queries nem cascade — precedente em
 * ui/tokens/tokens.test.tsx). Importados só por *.test.tsx.
 */

/** Separa o css em conteúdo dentro/fora dos blocos `@media <guard> { … }` (chaves balanceadas). */
export function splitByGuard(css: string, guard: RegExp): { inside: string; outside: string } {
  let outside = css;
  let inside = '';
  let match = outside.match(guard);
  while (match?.index !== undefined) {
    const open = outside.indexOf('{', match.index);
    let depth = 1;
    let i = open + 1;
    while (i < outside.length && depth > 0) {
      if (outside[i] === '{') depth += 1;
      if (outside[i] === '}') depth -= 1;
      i += 1;
    }
    inside += outside.slice(open + 1, i);
    outside = outside.slice(0, match.index) + outside.slice(i);
    match = outside.match(guard);
  }
  return { inside, outside };
}

/** Parser mínimo de regras planas `seletor { corpo }` (ignora blocos @). */
export function parseRules(css: string): { selector: string; body: string }[] {
  const rules: { selector: string; body: string }[] = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    rules.push({ selector: (m[1] ?? '').trim(), body: m[2] ?? '' });
  }
  return rules;
}
