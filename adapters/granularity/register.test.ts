/**
 * register.ts — auto-registro aditivo (docs/architecture.md §4). O modo real
 * aponta para o mesmo stub até a regra O8 (ENG-242) chegar.
 */

import { describe, expect, it } from 'vitest';

import registration from './register';
import { StubGranularityResolver } from './stub';

describe('registro do adapter de granularidade', () => {
  it('declara a porta "granularity" com fixture e real construíveis', () => {
    expect(registration.port).toBe('granularity');
    expect(registration.fixture()).toBeInstanceOf(StubGranularityResolver);
    expect(() => registration.real()).not.toThrow();
  });

  it('a fixture resolve um beadSec > 0', () => {
    expect(registration.fixture().resolve('media', null).beadSec).toBeGreaterThan(0);
  });
});
