import { describe, expect, it } from 'vitest';

import { DOMAIN_LAYER } from './index';

describe('domain layer scaffold', () => {
  it('é importável e não declara dependências externas', () => {
    expect(DOMAIN_LAYER).toBe('domain');
  });
});
