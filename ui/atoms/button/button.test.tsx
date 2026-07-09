import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { parseRules } from '../testing/css';
import { Button } from './button';
import buttonCss from './button.css?raw';

describe('Button — ação Shemá (redesign §4.1)', () => {
  it('renderiza primário grande por padrão, acessível pelo rótulo', () => {
    render(<Button>Confirmar a cena</Button>);
    const btn = screen.getByRole('button', { name: 'Confirmar a cena' });
    expect(btn.getAttribute('data-variant')).toBe('primary');
    expect(btn.getAttribute('data-size')).toBe('lg');
  });

  it('variante escura (cordão)', () => {
    render(<Button variant="dark">Guardar os documentos</Button>);
    const btn = screen.getByRole('button', { name: 'Guardar os documentos' });
    expect(btn.getAttribute('data-variant')).toBe('dark');
  });

  it('variante fantasma', () => {
    render(<Button variant="ghost">Ouvir de novo</Button>);
    const btn = screen.getByRole('button', { name: 'Ouvir de novo' });
    expect(btn.getAttribute('data-variant')).toBe('ghost');
  });

  it('tamanho pequeno', () => {
    render(<Button size="sm">Voltar</Button>);
    expect(screen.getByRole('button', { name: 'Voltar' }).getAttribute('data-size')).toBe('sm');
  });

  it('desabilitado de verdade: atributo presente e clique não dispara', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Confirmar a cena
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Confirmar a cena' });
    expect(btn.hasAttribute('disabled')).toBe(true);
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('repassa o clique quando habilitado', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Confirmar a cena</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar a cena' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('não vira submit por acidente dentro de formulários', () => {
    render(<Button>Confirmar a cena</Button>);
    expect(screen.getByRole('button', { name: 'Confirmar a cena' }).getAttribute('type')).toBe(
      'button',
    );
  });
});

describe('Button — o press escurece, nunca clareia (§4.1)', () => {
  const rules = parseRules(buttonCss);

  it.each(['primary', 'dark', 'ghost'] as const)(
    'hover, press e foco de teclado da variante %s escurecem o fundo',
    (variant) => {
      const ofVariant = rules.filter((r) => r.selector.includes(`data-variant='${variant}'`));
      for (const pseudo of [':hover', ':active', ':focus-visible']) {
        const rule = ofVariant.find((r) => r.selector.includes(pseudo));
        expect(rule, `regra de ${variant} para ${pseudo}`).toBeDefined();
        expect(rule?.body).toContain('background');
      }
    },
  );

  it('o primário escurece exatamente para o telha-escuro', () => {
    const press = rules.filter(
      (r) => r.selector.includes("data-variant='primary'") && r.selector.includes(':'),
    );
    for (const rule of press.filter((r) => /:hover|:active|:focus-visible/.test(r.selector))) {
      expect(rule.body).toContain('--cds-telha-deep');
    }
  });
});
