/**
 * Auto-registro do adapter de bucket (docs/architecture.md §4): o composition root
 * (ENG-224) colhe todos os adapters/*\/register.ts via import.meta.glob e resolve
 * portas por nome — fixture é o default; o modo real liga por configuração de
 * ambiente (ENG-247, que injeta baseUrl/token reais).
 */

import { FixtureBucketSource } from './fixture';
import { HttpBucketSource, type HttpBucketSourceOptions } from './http';
import type { BucketSource } from './types';

/** Wiring do composition root (ENG-247): baseUrl, projectId resolvido e token vivo. */
export type RealBucketWiring = Partial<Omit<HttpBucketSourceOptions, 'projectId'>> &
  Pick<HttpBucketSourceOptions, 'projectId'>;

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: (wiring: RealBucketWiring) => TPort;
}

const registration: AdapterRegistration<BucketSource> = {
  port: 'bucket',
  fixture: () => new FixtureBucketSource(),
  real: (wiring) =>
    new HttpBucketSource({
      baseUrl: wiring.baseUrl ?? '/api',
      fetch: wiring.fetch ?? globalThis.fetch.bind(globalThis),
      projectId: wiring.projectId,
      token: wiring.token,
    }),
};

export default registration;
