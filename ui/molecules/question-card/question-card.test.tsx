import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { QuestionCard } from './question-card';

describe('QuestionCard — pergunta do Conversation com marcador de papel (redesign §6.6)', () => {
  it('mostra o texto da pergunta', () => {
    render(<QuestionCard question="Sobre o que é essa história?" />);
    expect(screen.getByText('Sobre o que é essa história?')).toBeDefined();
  });

  it('a pergunta conduzida pela facilitadora carrega um marcador de papel legível', () => {
    render(<QuestionCard question="Tem algo que essa história não diz?" facilitatorLed />);
    expect(screen.getByRole('img', { name: 'conduzida pela facilitadora' })).toBeDefined();
  });

  it('sem facilitatorLed não há marcador de papel', () => {
    render(<QuestionCard question="Sobre o que é essa história?" />);
    expect(screen.queryByLabelText('conduzida pela facilitadora')).toBeNull();
  });

  it('o botão "Ouvir a pergunta" chama onListen quando fornecido', async () => {
    const onListen = vi.fn();
    render(<QuestionCard question="Sobre o que é essa história?" onListen={onListen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ouvir a pergunta' }));
    expect(onListen).toHaveBeenCalledTimes(1);
  });

  it('sem onListen não há botão de ouvir', () => {
    render(<QuestionCard question="Sobre o que é essa história?" />);
    expect(screen.queryByRole('button', { name: 'Ouvir a pergunta' })).toBeNull();
  });

  it('rende a resposta passada como slot', () => {
    render(
      <QuestionCard question="Sobre o que é essa história?">
        <p>a resposta gravada</p>
      </QuestionCard>,
    );
    expect(screen.getByText('a resposta gravada')).toBeDefined();
  });
});
