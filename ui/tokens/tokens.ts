/**
 * Tokens Shemá — vocabulário visual do Colar de Sons (redesign PRD §4).
 * Os valores são CONGELADOS pelo teste colocalizado; a fonte visual normativa
 * são os protótipos em docs/design/ (precedência CLAUDE.md, regra 2).
 */

export const colors = {
  /** fundo quieto das telas de trabalho (§4.1) */
  cream: '#F6F5EB',
  /** fundo full-bleed dos momentos cerimoniais: Escuta 1 (§4.1) */
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

/**
 * 40 matizes para cenas. As 8 primeiras são as triplas do protótipo, intactas e na
 * mesma ordem — uma sessão antiga não muda de cor. As 32 seguintes são as MESMAS 8
 * famílias em quatro variações (clara, profunda, quente, fria), derivadas em HSL
 * sobre a família inteira (base + lit + deep juntos), de modo que a relação interna
 * da pérola — brilho e sombra — sobrevive à variação.
 *
 * A ordem é por VARIAÇÃO, não por família: índices 0–7 são as oito matizes
 * originais, 8–15 as oito claras, e assim por diante. É isso que mantém a promessa
 * do §4.2 — `sceneColor` indexa por posição no colar, então cenas vizinhas caem
 * sempre em matizes DIFERENTES, nunca em duas variações da mesma cor.
 *
 * Os valores são literais, não calculados em runtime: a derivação foi feita uma vez
 * e revisada. O par vizinho menos separado aqui (verde escuro → azul escuro, ~0,14
 * em distância RGB) é o mesmo par que a paleta original já trazia (~0,16): a
 * extensão não piora a separabilidade que já estava aprovada.
 */
export const scenePalette: readonly PaletteEntry[] = [
  { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' },
  { base: '#9A7B2E', lit: '#C2A55A', deep: '#6E5A22' },
  { base: '#4E7A6A', lit: '#7BA595', deep: '#3A5C4F' },
  { base: '#5E6B8C', lit: '#8B97B5', deep: '#46506A' },
  { base: '#8C5A74', lit: '#B4849D', deep: '#694257' },
  { base: '#777D45', lit: '#9EA46B', deep: '#585D31' },
  { base: '#89AAA3', lit: '#B2CCC6', deep: '#5F827B' },
  { base: '#A85D3E', lit: '#CE8767', deep: '#7E442C' },
  { base: '#E7600B', lit: '#E8A071', deep: '#BA4C09' },
  { base: '#BC983F', lit: '#CDB882', deep: '#917832' },
  { base: '#649784', lit: '#9BB8AD', deep: '#507969' },
  { base: '#7A86A3', lit: '#ABB3C8', deep: '#5C6887' },
  { base: '#A3768D', lit: '#C6A5B6', deep: '#865871' },
  { base: '#949B5A', lit: '#B1B68C', deep: '#767C45' },
  { base: '#A8BEBA', lit: '#D1E0DC', deep: '#799B94' },
  { base: '#BD785C', lit: '#D7A791', deep: '#A05A3D' },
  { base: '#8D3904', lit: '#E46615', deep: '#602602' },
  { base: '#796021', lit: '#B1913D', deep: '#4C3E16' },
  { base: '#3B5F52', lit: '#61917F', deep: '#284137' },
  { base: '#4A5672', lit: '#6D7DA5', deep: '#333B4F' },
  { base: '#71475D', lit: '#A46686', deep: '#4E2F40' },
  { base: '#5C6133', lit: '#878D54', deep: '#3C4020' },
  { base: '#6D988F', lit: '#95BBB2', deep: '#4B6862' },
  { base: '#89492F', lit: '#C76A40', deep: '#5E311E' },
  { base: '#A66A04', lit: '#EAA328', deep: '#794C03' },
  { base: '#8C8727', lit: '#BFBA49', deep: '#605E1C' },
  { base: '#456E69', lit: '#6E9E97', deep: '#32504C' },
  { base: '#555781', lit: '#7E80AE', deep: '#3D3F5E' },
  { base: '#80515E', lit: '#AD7686', deep: '#5D3944' },
  { base: '#5F713D', lit: '#879C5E', deep: '#435029' },
  { base: '#7CA1A2', lit: '#A5C4C4', deep: '#567677' },
  { base: '#9B6C37', lit: '#CB9655', deep: '#704D25' },
  { base: '#CD280C', lit: '#E3715C', deep: '#A01F0A' },
  { base: '#A86E3A', lit: '#C49971', deep: '#7D542C' },
  { base: '#5A876C', lit: '#8CAD99', deep: '#466A53' },
  { base: '#6C8398', lit: '#9CAEBD', deep: '#526577' },
  { base: '#99678D', lit: '#BC96B3', deep: '#764E6D' },
  { base: '#8A8351', lit: '#ABA57D', deep: '#6B653C' },
  { base: '#99B3A7', lit: '#C2D5CC', deep: '#6C8F7F' },
  { base: '#B5514B', lit: '#D0857F', deep: '#8C3C37' },
];

/** A cor da história inteira (STORY do protótipo): oliva suave, distinta de
 *  cenas e frases — o trecho "história" na barra de progresso da conversa (§4.2). */
export const storyColor: PaletteEntry = { base: '#A9A06A', lit: '#CFC894', deep: '#82794C' };

/**
 * 30 tons de frase — deliberadamente mais claros que os de cena, para a frase ler
 * como "dentro" da cena (§4.2). Mesma construção da paleta de cenas: as 6 famílias
 * do protótipo nas seis primeiras posições, depois as mesmas 6 em quatro variações,
 * ordenadas por variação para que frases vizinhas nunca compartilhem matiz.
 */
export const phrasePalette: readonly PaletteEntry[] = [
  { base: '#D98A54', lit: '#F0B489', deep: '#B06A3A' },
  { base: '#C4A96A', lit: '#E0CA97', deep: '#9C844D' },
  { base: '#86AC9C', lit: '#AECFC2', deep: '#688B7D' },
  { base: '#93A0BE', lit: '#BBC5DC', deep: '#71809F' },
  { base: '#B98FA8', lit: '#D8B5C9', deep: '#966F87' },
  { base: '#A3A878', lit: '#C4C8A0', deep: '#7F845B' },
  { base: '#DEA782', lit: '#F3D1B9', deep: '#C3855A' },
  { base: '#D0BD91', lit: '#EADDC0', deep: '#B19C6B' },
  { base: '#A5C0B5', lit: '#CFE1DA', deep: '#85A196' },
  { base: '#B4BCD0', lit: '#DDE2ED', deep: '#919CB2' },
  { base: '#CBB0C0', lit: '#E9D7E1', deep: '#AA8E9F' },
  { base: '#B7BB98', lit: '#D7DAC1', deep: '#989D75' },
  { base: '#D66F2A', lit: '#EF995C', deep: '#90552C' },
  { base: '#BA9746', lit: '#D8B971', deep: '#7F6B3C' },
  { base: '#699B86', lit: '#90BFAD', deep: '#547266' },
  { base: '#7586AE', lit: '#9BABCE', deep: '#5A6988' },
  { base: '#A97192', lit: '#CA95B3', deep: '#7D5A70' },
  { base: '#8F955D', lit: '#B3B981', deep: '#666A47' },
  { base: '#D8A240', lit: '#F0C675', deep: '#A37B33' },
  { base: '#C0BA59', lit: '#DDD886', deep: '#908B45' },
  { base: '#79A59D', lit: '#A0C8C2', deep: '#5F807B' },
  { base: '#8588B7', lit: '#ADAFD6', deep: '#656997' },
  { base: '#B28293', lit: '#D2A7B5', deep: '#8C6573' },
  { base: '#8EA16B', lit: '#B1C192', deep: '#6B7952' },
  { base: '#D8806F', lit: '#EFB1A4', deep: '#BB5C49' },
  { base: '#C7A180', lit: '#E3C6AE', deep: '#A87E5B' },
  { base: '#97B5A1', lit: '#BFD7C8', deep: '#779682' },
  { base: '#A5B7C6', lit: '#CDD9E3', deep: '#8297A7' },
  { base: '#C1A0BC', lit: '#DFC7DB', deep: '#9F7F9A' },
  { base: '#B0AB8A', lit: '#D0CCB2', deep: '#918C68' },
];

/** movimento: suave, aterrado, sem bounces/springs (§4.5) */
export const motion = {
  durationMs: 220,
  easing: 'ease-out',
} as const;

export const typography = {
  /** carrega tudo estrutural: títulos, botões, eyebrows, chips (§4.1) */
  loadBearing: "'Montserrat', system-ui, sans-serif",
  /** a voz quieta: taglines e manchetes, em itálico (§4.1) */
  quietVoice: "'Merriweather', Georgia, serif",
} as const;

/** colorways do ícone Shemá: branco em fundo escuro, telha em creme (§4.4) */
export const iconColorways = {
  branco: colors.cream,
  telha: colors.telha,
  verde: colors.olive,
} as const;

export type IconColorway = keyof typeof iconColorways;
