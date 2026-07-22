import type { Player } from '../../../adapters/audio';
import type { PlayAction, Span } from '../../../domain';
import { type PaletteEntry, scenePalette } from '../../tokens';

/**
 * Núcleo puro da estação de corte de cenas (Escuta 2, PRD v2 §8.2/§8.4). Mantém
 * a página fina: o redutor `clickBead` do domínio decide o estado e devolve a
 * `PlayAction` (efeito-como-valor); aqui o intérprete a toca no `Player`, o
 * rótulo de cena vira palavra (sem dígitos, §9.2) e a cor sai da paleta terrosa.
 */

/**
 * O item travado dono desta conta, se houver — o `_sceneOf`/`_phraseOf` do estudo
 * "Ouvir no colar" (redesign §11, o `pure` escolhido), com as duas bordas dentro.
 * Serve cena e frase porque a regra não olha o id: item travado é para ouvir, não
 * para cortar. Item reaberto mantém o span e só perde o `locked` — por isso o
 * filtro, sem o qual reabrir viraria armadilha (o corte novo seria engolido).
 */
export function lockedItemAt<T extends { locked: boolean; span: Span | null }>(
  items: readonly T[],
  bead: number,
): T | null {
  return items.find((i) => i.locked && i.span && bead >= i.span.s && bead <= i.span.e) ?? null;
}

/** Toca a ação de seleção: conta única e intervalo por `play`, fronteira por `playEdge`. */
export function playActionOn(player: Player, action: PlayAction): void {
  switch (action.type) {
    case 'single-bead':
      player.play(action.bead, action.bead);
      return;
    case 'range':
      player.play(action.s, action.e);
      return;
    case 'edge':
      player.playEdge(action.edge);
      return;
    case 'transport':
      player.play(action.bead, action.bead);
      return;
  }
}

/**
 * Reprodução ao DEFINIR uma cena/frase (decisão do dono): o toque reproduz a
 * SELEÇÃO INTEIRA (início→fim), não só a janela da borda. O `clickBead` classifica
 * um toque que aproxima a borda como `edge` (janela curta do fim); aqui, enquanto
 * se define o corte, isso vira o intervalo todo — a prévia curta do fim fica
 * reservada ao AJUSTE da fronteira (arrastar o punho / `onEdgeHover` → `playEdge`).
 * Conta única, intervalo e transporte seguem 1:1 (`playActionOn`).
 */
export function playSelectionOrAction(
  player: Player,
  action: PlayAction,
  selection: Span | null,
): void {
  if (action.type === 'edge' && selection) {
    player.play(selection.s, selection.e);
    return;
  }
  playActionOn(player, action);
}

const UNIDADES_PT = [
  '',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'onze',
  'doze',
  'treze',
  'catorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove',
];
const DEZENAS_PT = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa',
];
const UNIDADES_EN = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const DEZENAS_EN = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

/**
 * Cardinal por extenso de 1..99 no idioma da UI; fora do intervalo → '' (o
 * chamador omite o número). EN une dezena+unidade com hífen ("twenty-one"),
 * PT-BR com " e " ("vinte e um").
 */
function cardinal(n: number, lang: string): string {
  if (n < 1 || n > 99) return '';
  const en = lang.startsWith('en');
  const unidades = en ? UNIDADES_EN : UNIDADES_PT;
  const dezenas = en ? DEZENAS_EN : DEZENAS_PT;
  if (n < 20) return unidades[n]!;
  const dez = dezenas[Math.floor(n / 10)]!;
  const uni = n % 10;
  if (uni === 0) return dez;
  return en ? `${dez}-${unidades[uni]!}` : `${dez} e ${unidades[uni]!}`;
}

/**
 * Número de uma cena travada por extenso (redesign §6.3 "Cena N"), a partir do
 * índice 0-based e no idioma da UI: a tela do ouvinte não mostra dígitos (§9.2).
 * Além de 99 cenas — nunca real — devolve '' e o chamador omite o número (a cor
 * do swatch ainda distingue). O prefixo "Cena"/"Scene" vem do i18n, não daqui.
 */
export function sceneOrdinal(index: number, lang: string): string {
  return cardinal(index + 1, lang);
}

/**
 * Rótulo PT-BR "Cena N" por extenso — reusado só pela estação de frases
 * (`phraseLabel` e o cabeçalho da cena-pai). A Escuta 2 monta o rótulo pelo
 * i18n (`sceneOrdinal` + chave `cut.sceneLabel`); migrar as frases para o mesmo
 * caminho (i18n + rank por bead) fica para ENG-343, que refaz aquela estação.
 */
export function sceneLabel(index: number): string {
  const palavra = cardinal(index + 1, 'pt');
  return palavra ? `Cena ${palavra}` : 'Cena';
}

export interface RankedScene<T> {
  part: T;
  /** índice na array `parts` original — o domínio reabre a cena por este índice. */
  arrayIndex: number;
  span: Span;
  /** posição no colar, 0-based (ordenada por bead inicial): a base do número e da cor. */
  rank: number;
}

/**
 * As cenas travadas ordenadas pela posição no colar (bead inicial), não pela
 * ordem de criação da array. Um retorno salvo traz `parts` com spans quaisquer
 * do JSON (contracts/imports.ts); numerar/colorir pela ordem da array faria a
 * primeira cena do colar exibir o número (e a cor) de outra. `arrayIndex`
 * preserva o índice que o domínio usa para reabrir.
 */
export function rankLockedScenes<T extends { locked: boolean; span: Span | null }>(
  parts: readonly T[],
): RankedScene<T>[] {
  return parts
    .flatMap((part, arrayIndex) =>
      part.locked && part.span ? [{ part, arrayIndex, span: part.span }] : [],
    )
    .sort((a, b) => a.span.s - b.span.s)
    .map((e, rank) => ({ ...e, rank }));
}

/** Cor da cena por índice, cíclica na paleta de cenas (§4.2). */
export function sceneColor(index: number): PaletteEntry {
  const n = scenePalette.length;
  return scenePalette[((index % n) + n) % n]!;
}
