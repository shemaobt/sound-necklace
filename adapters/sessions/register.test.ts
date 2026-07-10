import { describe, expect, it } from 'vitest';

import { FixtureSessionStore } from './fixture';
import registration from './register';

describe('sessions register', () => {
  it('registers the sessions port with a fixture factory', () => {
    expect(registration.port).toBe('sessions');
    expect(registration.fixture()).toBeInstanceOf(FixtureSessionStore);
    expect(typeof registration.real).toBe('function');
  });
});
