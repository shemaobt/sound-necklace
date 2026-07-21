import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { splitByGuard } from '../../atoms/testing/css';
import { SaveChip } from './save-chip';
import saveChipCss from './save-chip.css?raw';

describe('SaveChip — selo de salvamento automático', () => {
  it('salvando: mostra o ponto pulsante e a copy de salvamento', () => {
    const { container, getByText } = render(
      <SaveChip status="saving" savingLabel="Salvando…" savedLabel="Tudo salvo" />,
    );
    expect(container.querySelector('.cds-save-chip')?.getAttribute('data-status')).toBe('saving');
    expect(container.querySelector('.cds-save-chip-dot')).not.toBeNull();
    expect(container.querySelector('.cds-save-chip-check')).toBeNull();
    expect(getByText('Salvando…')).toBeTruthy();
  });

  it('salvo: mostra o ✓ e a copy de "pode sair e voltar"', () => {
    const { container, getByText } = render(
      <SaveChip
        status="saved"
        savingLabel="Salvando…"
        savedLabel="Tudo salvo — pode sair e voltar"
      />,
    );
    expect(container.querySelector('.cds-save-chip')?.getAttribute('data-status')).toBe('saved');
    expect(container.querySelector('.cds-save-chip-check')).not.toBeNull();
    expect(container.querySelector('.cds-save-chip-dot')).toBeNull();
    expect(getByText('Tudo salvo — pode sair e voltar')).toBeTruthy();
  });

  it('a copy chega por prop (nada de dígito ou texto fixo embutido)', () => {
    const { getByText } = render(
      <SaveChip status="saving" savingLabel="Saving…" savedLabel="All saved" />,
    );
    expect(getByText('Saving…')).toBeTruthy();
  });

  it('o pulso do ponto só existe sob prefers-reduced-motion (§9.3)', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(saveChipCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
