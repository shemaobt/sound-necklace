import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../atoms';
import { ScenePhraseChip } from './scene-phrase-chip';

const telha = { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' };

describe('ScenePhraseChip — pílula de cena/frase com ações (redesign §6.3, §6.5)', () => {
  it('é um grupo nomeado, não um botão (sem aninhar interativos)', () => {
    render(<ScenePhraseChip label="Cena da fogueira" swatch={telha} />);
    const group = screen.getByRole('group', { name: 'Cena da fogueira' });
    expect(group.tagName).not.toBe('BUTTON');
  });

  it('mostra o rótulo e o swatch tingido', () => {
    const { container } = render(<ScenePhraseChip label="Cena da fogueira" swatch={telha} />);
    expect(screen.getByText('Cena da fogueira')).toBeDefined();
    const tinted = [...container.querySelectorAll<HTMLElement>('.cds-pearl')].filter(
      (el) => el.style.getPropertyValue('--cds-pearl-base') === telha.base,
    );
    expect(tinted).toHaveLength(1);
  });

  it('não tem ▶ próprio — o som vem das contas do colar (decisão do dono)', () => {
    render(<ScenePhraseChip label="Cena da fogueira" swatch={telha} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('rende os botões de ação do slot e repassa seus cliques', async () => {
    const onReopen = vi.fn();
    render(
      <ScenePhraseChip
        label="Cena da fogueira"
        actions={<Button onClick={onReopen}>Reabrir</Button>}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reabrir' }));
    expect(onReopen).toHaveBeenCalledTimes(1);
  });
});
