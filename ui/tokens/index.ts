/**
 * ui/tokens — a única fonte de vocabulário visual (redesign PRD §4).
 * Consumo: atoms/molecules importam DAQUI; nunca hardcodam hex.
 * Side effects: importar './fonts' e os css uma vez no shell.
 */
export { ShemaIcon } from './icon';
export {
  colors,
  darken30,
  iconColorways,
  motion,
  phrasePalette,
  scenePalette,
  typography,
  type IconColorway,
  type PaletteEntry,
} from './tokens';
