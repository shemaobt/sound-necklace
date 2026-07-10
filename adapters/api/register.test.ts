import { describe, expect, it } from 'vitest';

import { FixtureAuthProvider } from './fixture';
import registration from './register';

describe('api register', () => {
  it('registers the auth port with a fixture factory', () => {
    expect(registration.port).toBe('auth');
    expect(registration.fixture()).toBeInstanceOf(FixtureAuthProvider);
    expect(typeof registration.real).toBe('function');
  });
});
