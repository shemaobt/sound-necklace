/**
 * Superfície pública do adapter de granularidade (ENG-241). O app resolve o
 * GranularityResolver pela porta 'granularity' do register.ts; estes exports servem
 * a testes e à camada de wiring (ui/pages/setup).
 */

export type { GranularityResolution, GranularityResolver } from './types';
export { StubGranularityResolver } from './stub';
