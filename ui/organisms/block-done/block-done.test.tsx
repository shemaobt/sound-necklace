import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { phrasePalette, scenePalette } from '../../tokens';
import { BlockDone, type BlockDoneProps } from './block-done';
import blockDoneCss from './block-done.css?raw';

/**
 * A tela de fim de bloco (ENG-651; protótipo v4 "FIM DE BLOCO", linhas 842-855).
 * Nos dois limites estruturais do fluxo ela marca que um bloco fechou, antes do
 * próximo começar. Tela de quem ouve (§9.2): nenhum dígito, nenhum id, uma ação
 * dominante. Os testes afirmam a cópia congelada da issue e o comportamento dos
 * dois botões — nunca chamadas internas.
 */

const TRIAGEM = {
  headline: 'As cenas todas têm nome.',
  subtitle: 'Agora vem a parte de dentro: as frases de cada cena.',
  primary: 'Seguir para as frases',
};
const SEGMENTACAO = {
  headline: 'Todas as frases no cordão.',
  subtitle: 'Falta só a conversa sobre o sentido — a parte mais gostosa.',
  primary: 'Começar a conversa',
};
const REST = 'Guardar e descansar';

function props(over: Partial<BlockDoneProps> = {}): BlockDoneProps {
  return {
    block: 'triagem',
    tints: scenePalette.slice(0, 3),
    onContinue: vi.fn(),
    onRest: vi.fn(),
    ...over,
  };
}

describe('BlockDone — o que a tela diz em cada limite (ENG-651)', () => {
  it('sem bloco fechado não há tela nenhuma', () => {
    render(<BlockDone {...props({ block: null })} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a Triagem fechada anuncia a Triagem e continua para as frases', () => {
    render(<BlockDone {...props({ block: 'triagem' })} />);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Um bloco fechado')).toBeDefined();
    expect(screen.getByRole('heading', { name: TRIAGEM.headline })).toBeDefined();
    expect(screen.getByText(TRIAGEM.subtitle)).toBeDefined();
    expect(screen.getByRole('button', { name: TRIAGEM.primary })).toBeDefined();
    expect(screen.getByRole('button', { name: REST })).toBeDefined();
  });

  it('a Segmentação fechada anuncia a Segmentação e continua para a conversa', () => {
    render(<BlockDone {...props({ block: 'segmentacao', tints: phrasePalette.slice(0, 5) })} />);

    expect(screen.getByRole('heading', { name: SEGMENTACAO.headline })).toBeDefined();
    expect(screen.getByText(SEGMENTACAO.subtitle)).toBeDefined();
    expect(screen.getByRole('button', { name: SEGMENTACAO.primary })).toBeDefined();
    expect(screen.getByRole('button', { name: REST })).toBeDefined();
  });

  it('o botão que continua avisa quem continua; o de descansar, quem guarda', async () => {
    const onContinue = vi.fn();
    const onRest = vi.fn();
    render(<BlockDone {...props({ onContinue, onRest })} />);

    await userEvent.click(screen.getByRole('button', { name: TRIAGEM.primary }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onRest).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: REST }));
    expect(onRest).toHaveBeenCalledTimes(1);
  });

  it('declara UMA ação dominante, e é a que continua (§9.2)', () => {
    render(<BlockDone {...props()} />);
    const dominant = screen
      .getAllByRole('dialog')[0]!
      .querySelectorAll('[data-role="primary-action"]');
    expect(dominant.length).toBe(1);
    expect(dominant[0]!.textContent).toBe(TRIAGEM.primary);
  });

  it('não mostra dígito, contagem nem id — é tela do ouvinte (§9.2)', () => {
    const { rerender } = render(<BlockDone {...props({ block: 'triagem' })} />);
    expect(screen.getByRole('dialog').textContent ?? '').not.toMatch(/\d/);

    rerender(<BlockDone {...props({ block: 'segmentacao' })} />);
    expect(screen.getByRole('dialog').textContent ?? '').not.toMatch(/\d/);
  });

  it('as contas são decorativas: cinco, a última fechando o fio', () => {
    const { container } = render(<BlockDone {...props()} />);
    const beads = container.ownerDocument.querySelectorAll('.cds-block-done-beads .cds-pearl');
    expect(beads.length).toBe(5);
    expect(beads[4]!.getAttribute('data-scene-end')).toBe('true');
    expect(beads[0]!.getAttribute('data-scene-end')).toBeNull();
  });

  it('as cores das contas vêm dos dados, não de literais na tela', () => {
    const { container } = render(
      <BlockDone {...props({ block: 'segmentacao', tints: phrasePalette.slice(0, 5) })} />,
    );
    const beads = container.ownerDocument.querySelectorAll<HTMLElement>(
      '.cds-block-done-beads .cds-pearl',
    );
    expect(beads[0]!.style.getPropertyValue('--cds-pearl-base')).toBe(phrasePalette[0]!.base);
    expect(beads[3]!.style.getPropertyValue('--cds-pearl-base')).toBe(phrasePalette[3]!.base);
  });
});

describe('BlockDone — movimento só para quem o aceita (§4.5)', () => {
  const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;

  it('toda animação do css vive dentro da guarda de opt-in', () => {
    expect(blockDoneCss).toMatch(guard);
    expect(splitByGuard(blockDoneCss, guard).outside).not.toMatch(/animation|@keyframes/);
  });
});
