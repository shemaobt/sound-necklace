import { phrasePalette, type PaletteEntry } from '../../tokens';
import { sceneLabel } from '../escuta2/cutting';

/**
 * Núcleo puro da estação de frases (Segmentação, PRD v2 §8.6). O rótulo "Frase N"
 * sai por extenso — a tela do ouvinte não mostra dígitos (§9.2) — e a cor de cada
 * frase cicla a paleta de frases (§4.2). A numeração de cena e o áudio-como-valor
 * (`playActionOn`, `sceneColor`, `sceneLabel`) são reaproveitados da Escuta 2:
 * mesma cerimônia de ancoragem, sem duplicar o cardinal já testado.
 */

/** "Frase N" por extenso: reusa o cardinal de `sceneLabel` ("Cena N") trocando só
 *  o substantivo — além do intervalo por extenso cai em "Frase" (a cor distingue). */
export function phraseLabel(index: number): string {
  return sceneLabel(index).replace('Cena', 'Frase');
}

/** Cor da frase por posição na cena, cíclica na paleta de frases (§4.2). */
export function phraseColor(index: number): PaletteEntry {
  const n = phrasePalette.length;
  return phrasePalette[((index % n) + n) % n]!;
}
