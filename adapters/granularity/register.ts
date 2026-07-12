/**
 * Auto-registro do adapter de granularidade (docs/architecture.md §4): colhido pelo
 * composition root via import.meta.glob. Fixture e real usam o MESMO resolver — a
 * regra O8 (frames × hop) é idêntica nos dois modos; o que difere é o BucketSource
 * que fornece o envelope, não a matemática de granularidade.
 */

import { AcoustemeGranularityResolver } from './resolver';
import type { GranularityResolver } from './types';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<GranularityResolver> = {
  port: 'granularity',
  fixture: () => new AcoustemeGranularityResolver(),
  real: () => new AcoustemeGranularityResolver(),
};

export default registration;
