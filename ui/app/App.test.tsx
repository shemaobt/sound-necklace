import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('casca do esqueleto', () => {
  it('renderiza (prova o pipeline jsdom + Testing Library)', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Colar de Sons' })).toBeDefined();
  });
});
