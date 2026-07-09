/**
 * Tokens Shemá — vocabulário visual do Colar de Sons (redesign PRD §4).
 * Os valores são CONGELADOS pelo teste colocalizado; a fonte visual normativa
 * são os protótipos em docs/design/ (precedência CLAUDE.md, regra 2).
 */

export const colors = {
  /** fundo quieto das telas de trabalho (§4.1) */
  cream: '#F6F5EB',
  /** fundo full-bleed dos momentos cerimoniais: Escuta 1 e Mapeamento (§4.1) */
  olive: '#3F3E20',
  /** acento único de ação/trilha de reprodução (§4.1) */
  telha: '#BE4A01',
  /** hover/press do telha — escurece, NUNCA clareia (§4.1); também a tinta de erro (§4.4) */
  telhaDeep: '#8F3701',
  /** confiança "Certeza": disco cheio oliva (§4.4) */
  confidenceFilled: '#777D45',
  /** confiança "Quase": meio disco dourado (§4.4) */
  confidenceHalf: '#9A7B2E',
  warningBg: '#F5E9D2',
  warningInk: '#755C20',
  error: '#8F3701',
  /** pérola não tocada (§4.2) */
  pearl: '#E7E3D3',
  pearlHighlight: '#FBFAF3',
} as const;

export interface PaletteEntry {
  base: string;
  lit: string;
  deep: string;
}

/**
 * deep = base 30% mais escuro — mesma fórmula do shade() da referência
 * (docs/reference/index.html L534): cada canal × 0.7, arredondado.
 */
export function darken30(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.7);
  const g = Math.round(((n >> 8) & 255) * 0.7);
  const b = Math.round((n & 255) * 0.7);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function entry(base: string): PaletteEntry {
  return { base, lit: base, deep: darken30(base) };
}

/** 8 matizes terrosos para cenas adjacentes sempre separáveis no fio (§4.2) */
export const scenePalette: readonly PaletteEntry[] = [
  '#BE4A01',
  '#9A7B2E',
  '#4E7A6A',
  '#5E6B8C',
  '#8C5A74',
  '#777D45',
  '#89AAA3',
  '#A85D3E',
].map(entry);

/** 6 tons deliberadamente mais claros — a frase lê como "dentro" da cena (§4.2) */
export const phrasePalette: readonly PaletteEntry[] = [
  '#D98A54',
  '#C4A96A',
  '#86AC9C',
  '#93A0BE',
  '#B98FA8',
  '#A3A878',
].map(entry);

/** movimento: suave, aterrado, sem bounces/springs (§4.5) */
export const motion = {
  durationMs: 220,
  easing: 'ease-out',
} as const;

export const typography = {
  /** carrega tudo estrutural: títulos, botões, eyebrows, chips (§4.1) */
  loadBearing: "'Montserrat', system-ui, sans-serif",
  /** a voz quieta: taglines e perguntas do Mapeamento, em itálico (§4.1) */
  quietVoice: "'Merriweather', Georgia, serif",
} as const;

/** colorways do ícone Shemá: branco em fundo escuro, telha em creme (§4.4) */
export const iconColorways = {
  branco: colors.cream,
  telha: colors.telha,
  verde: colors.olive,
} as const;

export type IconColorway = keyof typeof iconColorways;
