/**
 * Auto-registro do adapter de bucket (docs/architecture.md §4): o composition root
 * (ENG-224) colhe todos os adapters/*\/register.ts via import.meta.glob e resolve
 * portas por nome — fixture é o default; o modo real liga por configuração de
 * ambiente (ENG-247, que injeta baseUrl/token reais).
 */

import { FixtureBucketSource } from './fixture';
import { HttpBucketSource } from './http';
import type { BucketSource } from './types';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<BucketSource> = {
  port: 'bucket',
  fixture: () => new FixtureBucketSource(),
  // baseUrl/token reais são injetados pelo wiring (ENG-247); o esqueleto aponta para
  // um baseUrl relativo e usa o fetch do browser.
  real: () => new HttpBucketSource({ baseUrl: '/api', fetch: globalThis.fetch.bind(globalThis) }),
};

export default registration;
