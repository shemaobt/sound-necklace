import { phrasePalette, scenePalette, type PaletteEntry } from './tokens';

/**
 * A cor de uma cena e a de uma frase, por posição no colar (redesign §4.2).
 * Moravam dentro das páginas (Cortar e Frases) até a ENG-725: a Rever pinta o
 * colar inteiro pela cor da cena, e uma página não importa de outra página — por
 * isso as duas vivem aqui, ao lado das paletas que ciclam. É movimentação, não
 * reescrita: o comportamento é o mesmo, e Cortar e Frases continuam a
 * reexportá-las para quem já as pedia lá.
 */

/** Cor da cena por índice, cíclica na paleta de cenas (§4.2). */
export function sceneColor(index: number): PaletteEntry {
  const n = scenePalette.length;
  return scenePalette[((index % n) + n) % n]!;
}

/** Cor da frase por posição na cena, cíclica na paleta de frases (§4.2). */
export function phraseColor(index: number): PaletteEntry {
  const n = phrasePalette.length;
  return phrasePalette[((index % n) + n) % n]!;
}
