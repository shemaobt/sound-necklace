import { describe, expect, it } from 'vitest';

import { DOMAIN_LAYER } from './index';

describe('domain layer scaffold', () => {
  it('é importável (pipeline unit ativo; pureza é verificada pelo depcruise)', () => {
    expect(DOMAIN_LAYER).toBe('domain');
  });
});
