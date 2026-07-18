/**
 * Tokens Shemá — vocabulário visual do Colar de Sons (redesign PRD §4).
 * Os valores são CONGELADOS pelo teste colocalizado; a fonte visual normativa
 * são os protótipos em docs/design/ (precedência CLAUDE.md, regra 2).
 */

export const colors = {
  /** fundo quieto das telas de trabalho (§4.1) */
  cream: '#F6F5EB',
  /** fundo full-bleed dos momentos cerimoniais: Escuta 1 e Conversation (§4.1) */
  olive: '#3F3E20',
  /** acento único de ação/trilha de reprodução (§4.1) */
  telha: '#BE4A01',
  /** hover/press do telha — escurece, NUNCA clareia (§4.1); também a tinta de erro (§4.4) */
  telhaDeep: '#8F3701',
  /** tinta de títulos em fundo claro */
  ink: '#0A0703',
  /** subtítulos serifados em creme */
  oliveSoft: '#5A5A3E',
  /**
   * labels/eyebrows secundários. O protótipo usa #8A8970, que dá 3.28:1 no
   * creme — reprova o AA 4.5:1 do PRD §13 (regra vence protótipo); este é o
   * substituto AA (4.95:1) escolhido na ENG-278.
   */
  inkSubtle: '#6D6C56',
  /** superfície rebaixada: pills do header, tile "nenhum se encaixa" */
  surfaceMuted: '#ECEADF',
  /** a moldura html/body do protótipo em volta das telas */
  frame: '#EDEBE0',
  /** halo da etapa atual no fio de contas */
  accentSoft: '#F2D8C2',
  /** discos "na dúvida" e afins */
  sand: '#C5C29F',
  /** estados desabilitados */
  sandMuted: '#B8B79E',
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
 * Triplas literais do protótipo (PAL/PALF em Protótipo.dc.html): lit é o
 * brilho do gradiente radial da pérola, deep a sombra — escolhidos à mão por
 * cor, não derivados por fórmula.
 */

/** 8 matizes terrosos para cenas adjacentes sempre separáveis no fio (§4.2) */
export const scenePalette: readonly PaletteEntry[] = [
  { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' },
  { base: '#9A7B2E', lit: '#C2A55A', deep: '#6E5A22' },
  { base: '#4E7A6A', lit: '#7BA595', deep: '#3A5C4F' },
  { base: '#5E6B8C', lit: '#8B97B5', deep: '#46506A' },
  { base: '#8C5A74', lit: '#B4849D', deep: '#694257' },
  { base: '#777D45', lit: '#9EA46B', deep: '#585D31' },
  { base: '#89AAA3', lit: '#B2CCC6', deep: '#5F827B' },
  { base: '#A85D3E', lit: '#CE8767', deep: '#7E442C' },
];

/** 6 tons deliberadamente mais claros — a frase lê como "dentro" da cena (§4.2) */
export const phrasePalette: readonly PaletteEntry[] = [
  { base: '#D98A54', lit: '#F0B489', deep: '#B06A3A' },
  { base: '#C4A96A', lit: '#E0CA97', deep: '#9C844D' },
  { base: '#86AC9C', lit: '#AECFC2', deep: '#688B7D' },
  { base: '#93A0BE', lit: '#BBC5DC', deep: '#71809F' },
  { base: '#B98FA8', lit: '#D8B5C9', deep: '#966F87' },
  { base: '#A3A878', lit: '#C4C8A0', deep: '#7F845B' },
];

/** movimento: suave, aterrado, sem bounces/springs (§4.5) */
export const motion = {
  durationMs: 220,
  easing: 'ease-out',
} as const;

export const typography = {
  /** carrega tudo estrutural: títulos, botões, eyebrows, chips (§4.1) */
  loadBearing: "'Montserrat', system-ui, sans-serif",
  /** a voz quieta: taglines e perguntas do Conversation, em itálico (§4.1) */
  quietVoice: "'Merriweather', Georgia, serif",
} as const;

/** colorways do ícone Shemá: branco em fundo escuro, telha em creme (§4.4) */
export const iconColorways = {
  branco: colors.cream,
  telha: colors.telha,
  verde: colors.olive,
} as const;

export type IconColorway = keyof typeof iconColorways;
