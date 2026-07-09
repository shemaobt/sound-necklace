import { describe, expect, it } from 'vitest';

import { CONTRACTS_LAYER } from './index';

describe('contracts layer scaffold', () => {
  it('é importável', () => {
    expect(CONTRACTS_LAYER).toBe('contracts');
  });
});
