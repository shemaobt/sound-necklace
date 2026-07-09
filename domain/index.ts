/**
 * domain/ — núcleo puro, congelado (CLAUDE.md).
 * Este barrel começa vazio de lógica: os módulos chegam pelas issues E1
 * (ENG-214 grid/hash/ids → ENG-216 estado/seleção/cenas → ENG-219 triagem/gates
 * → ENG-223 frases/costura → ENG-226 roteiros/answer store).
 * Zero imports de framework/IO — enforcement em .dependency-cruiser.cjs.
 */
export const DOMAIN_LAYER = 'domain' as const;
