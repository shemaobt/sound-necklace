import type { Player } from '../../../adapters/audio';
import type { PlayAction } from '../../../domain';
import { type PaletteEntry, scenePalette } from '../../tokens';

/**
 * Núcleo puro da estação de corte de cenas (Escuta 2, PRD v2 §8.2/§8.4). Mantém
 * a página fina: o redutor `clickBead` do domínio decide o estado e devolve a
 * `PlayAction` (efeito-como-valor); aqui o intérprete a toca no `Player`, o
 * rótulo de cena vira palavra (sem dígitos, §9.2) e a cor sai da paleta terrosa.
 */

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

const UNIDADES = [
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
const DEZENAS = [
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

/** Cardinal PT-BR de 1..99; fora do intervalo → '' (o chamador omite o número). */
function cardinal(n: number): string {
  if (n < 1 || n > 99) return '';
  if (n < 20) return UNIDADES[n]!;
  const dez = DEZENAS[Math.floor(n / 10)]!;
  const uni = n % 10;
  return uni === 0 ? dez : `${dez} e ${UNIDADES[uni]!}`;
}

/**
 * Rótulo de uma cena travada a partir do índice 0-based (redesign §6.3 "Cena N"),
 * mas por extenso: a tela do ouvinte não mostra dígitos (§9.2). Além de 99 cenas
 * — nunca real — cai em "Cena" (a cor do swatch ainda distingue).
 */
export function sceneLabel(index: number): string {
  const palavra = cardinal(index + 1);
  return palavra ? `Cena ${palavra}` : 'Cena';
}

/** Cor da cena por índice, cíclica na paleta de cenas (§4.2). */
export function sceneColor(index: number): PaletteEntry {
  const n = scenePalette.length;
  return scenePalette[((index % n) + n) % n]!;
}
