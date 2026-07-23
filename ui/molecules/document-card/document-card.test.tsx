import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentCard } from './document-card';

const base = {
  filename: 'anchoring-return.json',
  title: 'As decisões de vocês',
  description: 'Onde cada cena e cada frase começa e termina.',
};

describe('DocumentCard — cartão de documento com estado Baixar/baixado (redesign §6.7)', () => {
  it('mostra o título humano, a explicação e o nome do arquivo', () => {
    render(<DocumentCard {...base} />);
    expect(screen.getByText('As decisões de vocês')).toBeDefined();
    expect(screen.getByText('Onde cada cena e cada frase começa e termina.')).toBeDefined();
    expect(screen.getByText('anchoring-return.json')).toBeDefined();
  });

  it('o botão diz "Baixar" e chama onDownload', async () => {
    const onDownload = vi.fn();
    render(<DocumentCard {...base} onDownload={onDownload} />);
    await userEvent.click(screen.getByRole('button', { name: 'Baixar' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it('depois de baixado, o botão passa a dizer "baixado"', () => {
    render(<DocumentCard {...base} downloaded />);
    expect(screen.getByRole('button', { name: 'baixado' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Baixar' })).toBeNull();
  });
});
