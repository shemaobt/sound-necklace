/**
 * Superfície pública do adapter de bucket (ENG-241). O app resolve o BucketSource
 * pela porta 'bucket' do register.ts; estes exports servem a testes e à camada de
 * wiring (ui/pages/setup, ui/app).
 */

export { BucketAudioNotFoundError, type BucketSource } from './types';
export { FixtureBucketSource } from './fixture';
export { HttpBucketSource, type HttpBucketSourceOptions } from './http';
