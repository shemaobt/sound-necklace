import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { parseRules } from '../../atoms/testing/css';
import { ScenePearl } from './scene-pearl';
import scenePearlCss from './scene-pearl.css?raw';

const telha = { base: '#BE4A01', lit: '#E8813E', deep: '#8F3701' };

/**
 * A pérola de cena da Rever (ENG-725; desenho docs/design/revisao-tela-nova.html, `_confFill`): a
 * confiança não é um disco ao lado — é o PREENCHIMENTO da própria pérola. Cheia
 * para a certeza, meia para o quase, tracejada para a dúvida, e creme tracejada
 * para a cena que ficou fora dos tipos. O nome vai embaixo, e é o nome do botão.
 */

/** Regra css cujo seletor (última linha, sem o comentário anterior) contém `needle`. */
function rule(needle: string): string {
  const found = parseRules(scenePearlCss).find((r) =>
    r.selector.split('\n').pop()?.trim().includes(needle),
  );
  if (!found) throw new Error(`sem regra css para ${needle}`);
  return found.body;
}

describe('ScenePearl — o nome e o toque', () => {
  it('o nome do tipo é o nome do botão, e o toque avisa quem monta', async () => {
    const onClick = vi.fn();
    render(<ScenePearl label="Nascimento" fill="high" tint={telha} onClick={onClick} />);

    await userEvent.click(screen.getByRole('button', { name: 'Nascimento' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a pérola leva a cor da cena', () => {
    render(<ScenePearl label="Nascimento" fill="high" tint={telha} />);
    const disc = screen.getByRole('button').querySelector<HTMLElement>('.cds-scene-pearl-disc');
    expect(disc?.style.getPropertyValue('--cds-pearl-base')).toBe(telha.base);
  });
});

describe('ScenePearl — a confiança mora no preenchimento (desenho `_confFill`)', () => {
  it('certeza cheia, quase pela metade, na dúvida tracejada — três preenchimentos distintos', () => {
    const { rerender } = render(<ScenePearl label="Nascimento" fill="high" tint={telha} />);
    expect(screen.getByRole('button').getAttribute('data-fill')).toBe('high');
    rerender(<ScenePearl label="Nascimento" fill="medium" tint={telha} />);
    expect(screen.getByRole('button').getAttribute('data-fill')).toBe('medium');
    rerender(<ScenePearl label="Nascimento" fill="low" tint={telha} />);
    expect(screen.getByRole('button').getAttribute('data-fill')).toBe('low');

    // cheia: o gradiente da pérola; meia: corte duro a 50%; dúvida: aro tracejado
    expect(rule("[data-fill='high'] .cds-scene-pearl-disc")).toMatch(/radial-gradient/);
    expect(rule("[data-fill='medium'] .cds-scene-pearl-disc")).toMatch(/50%/);
    expect(rule("[data-fill='low'] .cds-scene-pearl-disc")).toMatch(/dashed/);
  });

  it('fora dos tipos: rótulo por extenso em itálico, pérola creme tracejada, nenhuma marca de alerta', () => {
    render(<ScenePearl label="sem nome nos tipos" fill="none" />);

    const button = screen.getByRole('button', { name: 'sem nome nos tipos' });
    expect(button.getAttribute('data-fill')).toBe('none');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(button.textContent).not.toMatch(/[⚠⌀!]/);
    expect(rule("[data-fill='none'] .cds-scene-pearl-name")).toMatch(/font-style:\s*italic/);
    expect(rule("[data-fill='none'] .cds-scene-pearl-disc")).toMatch(/dashed/);
  });

  it('a escolhida ganha um anel; as outras não', () => {
    const { rerender } = render(<ScenePearl label="Nascimento" fill="high" tint={telha} />);
    expect(screen.getByRole('button').hasAttribute('data-selected')).toBe(false);
    rerender(<ScenePearl label="Nascimento" fill="high" tint={telha} selected />);
    expect(screen.getByRole('button').getAttribute('data-selected')).toBe('true');
    expect(rule("[data-selected='true'] .cds-scene-pearl-disc")).toMatch(/box-shadow/);
  });
});
