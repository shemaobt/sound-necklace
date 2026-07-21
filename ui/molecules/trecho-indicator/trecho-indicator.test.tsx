import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TrechoIndicator } from './trecho-indicator';

const COLOR = { base: '#be4a01', lit: '#e8813e', deep: '#8f3701' };

describe('TrechoIndicator', () => {
  it('mostra o ponto na cor do trecho e o nome, sem dígitos', () => {
    const { container, getByText } = render(<TrechoIndicator color={COLOR} label="Chegada" />);
    expect(container.querySelector('.cds-trecho-indicator-dot')).not.toBeNull();
    expect(getByText('Chegada')).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(/\d/);
  });

  it('o nome usa a cor viva do trecho', () => {
    const { getByText } = render(<TrechoIndicator color={COLOR} label="Chegada" />);
    expect((getByText('Chegada') as HTMLElement).style.color).toBe('rgb(232, 129, 62)'); // #e8813e
  });

  it('renderiza o botão de tocar recebido como children', () => {
    const { getByRole } = render(
      <TrechoIndicator color={COLOR} label="a história inteira">
        <button type="button">▶ ouvir a história</button>
      </TrechoIndicator>,
    );
    expect(getByRole('button', { name: '▶ ouvir a história' })).toBeTruthy();
  });
});
