import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../atoms';
import { ScenePhraseChip } from './scene-phrase-chip';

const telha = { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' };

describe('ScenePhraseChip — pílula de cena/frase com ▶ e ações (redesign §6.3, §6.5)', () => {
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

  it('o botão ▶ chama onPlay', async () => {
    const onPlay = vi.fn();
    render(<ScenePhraseChip label="Cena da fogueira" onPlay={onPlay} />);
    await userEvent.click(screen.getByRole('button', { name: 'Tocar' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('em reprodução, o botão vira Pausar e anuncia o estado pressionado', () => {
    render(<ScenePhraseChip label="Cena da fogueira" playing />);
    const play = screen.getByRole('button', { name: 'Pausar' });
    expect(play.getAttribute('aria-pressed')).toBe('true');
  });

  it('parado, o botão Tocar não está pressionado', () => {
    render(<ScenePhraseChip label="Cena da fogueira" />);
    expect(screen.getByRole('button', { name: 'Tocar' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
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
