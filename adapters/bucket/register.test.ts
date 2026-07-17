/**
 * register.ts — auto-registro aditivo (docs/architecture.md §4): o composition
 * root colhe via import.meta.glob('/adapters/*\/register.ts'); cada adapter exporta
 * { port, fixture, real } com a fixture como default.
 */

import { describe, expect, it } from 'vitest';

import { FixtureBucketSource } from './fixture';
import registration from './register';

describe('registro do adapter de bucket', () => {
  it('declara a porta "bucket" com a fixture como default', () => {
    expect(registration.port).toBe('bucket');
    expect(registration.fixture()).toBeInstanceOf(FixtureBucketSource);
  });

  it('a factory real constrói sem rede (wiring do composition root)', () => {
    expect(() => registration.real({ projectId: () => 'proj-1' })).not.toThrow();
  });
});
