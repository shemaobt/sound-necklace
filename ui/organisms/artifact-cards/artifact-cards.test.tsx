import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { ArtifactCards, type ArtifactDownloads } from './artifact-cards';
import cardsCss from './artifact-cards.css?raw';

const nenhum: ArtifactDownloads = { anchoring: false, manifest: false, report: false };
const todos: ArtifactDownloads = { anchoring: true, manifest: true, report: true };

const CHIP = 'documentos salvos — nada saiu deste computador';

function cardByTitle(title: string): HTMLElement {
  const card = screen.getByText(title).closest('.cds-document-card');
  if (!(card instanceof HTMLElement)) throw new Error(`card "${title}" não encontrado`);
  return card;
}

describe('ArtifactCards (PRD §8.8 / redesign §6.7 — os três documentos)', () => {
  it('renderiza os três cards com filename e nome humano exatos', () => {
    render(<ArtifactCards downloaded={nenhum} />);

    expect(screen.getByText('anchoring-return.json')).toBeDefined();
    expect(screen.getByText('As decisões de vocês')).toBeDefined();
    expect(screen.getByText('bead-manifest.json')).toBeDefined();
    expect(screen.getByText('O mapa das contas')).toBeDefined();
    expect(screen.getByText('mapping-report.md')).toBeDefined();
    expect(screen.getByText('A conversa sobre o sentido')).toBeDefined();
  });

  it('roteia downloaded[kind] para o card certo (flip Baixar → baixado)', () => {
    const { rerender } = render(<ArtifactCards downloaded={nenhum} />);
    expect(screen.getAllByRole('button', { name: 'Baixar' })).toHaveLength(3);

    rerender(<ArtifactCards downloaded={{ ...nenhum, anchoring: true }} />);
    const retorno = cardByTitle('As decisões de vocês');
    expect(within(retorno).getByRole('button', { name: 'baixado' })).toBeDefined();
    expect(screen.getAllByRole('button', { name: 'Baixar' })).toHaveLength(2);
  });

  it('Baixar dispara onDownload com a chave do documento clicado', () => {
    const onDownload = vi.fn();
    render(<ArtifactCards downloaded={nenhum} onDownload={onDownload} />);

    const manifesto = cardByTitle('O mapa das contas');
    const botao = manifesto.querySelector('button');
    if (!botao) throw new Error('botão do manifesto não encontrado');
    fireEvent.click(botao);

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledWith('manifest');
  });

  it('a live region existe desde o início e só recebe o texto do chip com os três baixados (ARIA22)', () => {
    const { rerender } = render(<ArtifactCards downloaded={nenhum} />);
    expect(screen.getByRole('status').textContent).not.toContain(CHIP);

    rerender(<ArtifactCards downloaded={{ ...todos, report: false }} />);
    expect(screen.getByRole('status').textContent).not.toContain(CHIP);

    rerender(<ArtifactCards downloaded={todos} />);
    expect(screen.getByRole('status').textContent).toContain(CHIP);
  });

  it('o chip de celebração aparece como elemento visível quando tudo foi baixado', () => {
    const { container, rerender } = render(<ArtifactCards downloaded={nenhum} />);
    expect(container.querySelector('.cds-artifact-cards-chip')).toBeNull();

    rerender(<ArtifactCards downloaded={todos} />);
    const chip = container.querySelector('.cds-artifact-cards-chip');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain(CHIP);
  });

  it('minimalismo §9.2: nenhum dígito em texto, aria-label ou title', () => {
    const { container } = render(<ArtifactCards downloaded={todos} />);

    expect(container.textContent ?? '').not.toMatch(/\d/);
    for (const el of container.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
    }
    for (const el of container.querySelectorAll('[title]')) {
      expect(el.getAttribute('title')).not.toMatch(/\d/);
    }
  });
});

describe('ArtifactCards — movimento respeita prefers-reduced-motion (§4.5)', () => {
  it('nenhuma animação vive fora da guarda de movimento', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(cardsCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
