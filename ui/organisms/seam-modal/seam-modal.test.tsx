import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { BorderOffer } from '../../../domain';
import { splitByGuard } from '../../atoms/testing/css';
import { SeamModal, type SeamModalProps } from './seam-modal';
import modalCss from './seam-modal.css?raw';

const TELHA = { base: '#BE4A01', lit: '#E8813E', deep: '#853401' };
const VERDE = { base: '#777D45', lit: '#9AA05E', deep: '#53572F' };

/** Oferta forjada no formato público do domain — question/warning carregam
 *  dígitos de propósito: o modal do ouvinte nunca pode vazá-los (§9.2). */
function makeOffer(over: Partial<BorderOffer> = {}): BorderOffer {
  return {
    fraseIndex: 0,
    sel: { s: 12, e: 26 },
    crossStart: false,
    crossEnd: true,
    delta: 2,
    thr: 4,
    consumed: false,
    kind: 'simple',
    canMove: true,
    question: 'Esta frase passa o fim da cena (Encounter 2). O tipo continua aqui?',
    warning: null,
    ...over,
  };
}

function baseProps(over: Partial<SeamModalProps> = {}): SeamModalProps {
  return {
    offer: makeOffer(),
    scene: { span: { s: 10, e: 24 }, tint: TELHA },
    neighbor: { span: { s: 25, e: 40 }, tint: VERDE },
    onMove: vi.fn(),
    onReanchor: vi.fn(),
    onGoTriage: vi.fn(),
    ...over,
  };
}

function buttonNames(): (string | undefined)[] {
  return screen.getAllByRole('button').map((b) => b.textContent?.trim());
}

/** As três variantes da oferta (PRD v2 §8.6): cada uma renderiza EXATAMENTE o
 *  seu conjunto de opções — a escalada nunca oferece mover; consumed esconde
 *  "Mover mesmo assim"; só o small mostra a linha de consequência. */
describe('SeamModal — conjuntos de opções por variante (§8.6)', () => {
  it('small overshoot: mover + reancorar, com a linha de consequência', () => {
    render(<SeamModal {...baseProps()} />);
    expect(buttonNames()).toEqual(['Mover a borda até aqui', 'Reancorar dentro da cena']);
    expect(screen.getByText('A cena de hoje cresce, a vizinha encolhe')).toBeTruthy();
  });

  it('large overshoot não-consumido: Triage + Mover mesmo assim + reancorar, sem consequência', () => {
    render(
      <SeamModal
        {...baseProps({
          offer: makeOffer({
            kind: 'escalation',
            canMove: true,
            delta: 9,
            sel: { s: 12, e: 33 },
            warning: '⚑ Ajuste grande (são 9 contas, acima do limiar de 4) — parece re-corte.',
          }),
        })}
      />,
    );
    expect(buttonNames()).toEqual([
      'Voltar à Triagem',
      'Mover mesmo assim',
      'Reancorar dentro da cena',
    ]);
    expect(screen.queryByText('A cena de hoje cresce, a vizinha encolhe')).toBeNull();
  });

  it('large overshoot consumido: só Triage + reancorar (nunca mover)', () => {
    render(
      <SeamModal
        {...baseProps({
          offer: makeOffer({
            kind: 'escalation',
            canMove: false,
            consumed: true,
            delta: 17,
            sel: { s: 12, e: 41 },
            warning: '⚑ Ajuste grande (engole a cena vizinha inteira) — parece re-corte.',
          }),
        })}
      />,
    );
    expect(buttonNames()).toEqual(['Voltar à Triagem', 'Reancorar dentro da cena']);
  });

  it('escalada two-productive: só Triage + reancorar', () => {
    render(
      <SeamModal
        {...baseProps({
          offer: makeOffer({
            kind: 'two-productive',
            canMove: false,
            warning: '⚑ A cena vizinha é produtiva e já tem frases — trate na Triage.',
          }),
        })}
      />,
    );
    expect(buttonNames()).toEqual(['Voltar à Triagem', 'Reancorar dentro da cena']);
  });

  it('sem oferta, nada é renderizado', () => {
    render(<SeamModal {...baseProps({ offer: null })} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

/** Headline do redesign §6.5 vira o nome acessível do diálogo. */
describe('SeamModal — headline e a11y', () => {
  it('o diálogo se chama "A frase passou da borda da cena."', () => {
    render(<SeamModal {...baseProps()} />);
    expect(screen.getByRole('dialog', { name: 'A frase passou da borda da cena.' })).toBeTruthy();
  });

  it('o foco inicial cai na ação menos destrutiva (Reancorar) — APG/§9.5', () => {
    render(<SeamModal {...baseProps()} />);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Reancorar dentro da cena' }),
    );
  });
});

/** Cada botão dispara o seu callback exatamente uma vez (DoD). */
describe('SeamModal — callbacks', () => {
  it('mover / reancorar / triage disparam 1× cada, sem cruzamento', () => {
    const props = baseProps({
      offer: makeOffer({ kind: 'escalation', canMove: true, delta: 9, sel: { s: 12, e: 33 } }),
    });
    render(<SeamModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mover mesmo assim' }));
    expect(props.onMove).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à Triagem' }));
    expect(props.onGoTriage).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reancorar dentro da cena' }));
    expect(props.onReanchor).toHaveBeenCalledTimes(1);
  });

  it('"Mover a borda até aqui" (small) dispara onMove', () => {
    const props = baseProps();
    render(<SeamModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mover a borda até aqui' }));
    expect(props.onMove).toHaveBeenCalledTimes(1);
    expect(props.onReanchor).not.toHaveBeenCalled();
    expect(props.onGoTriage).not.toHaveBeenCalled();
  });

  it('ESC mapeia para onReanchor (default seguro), uma vez', () => {
    const props = baseProps();
    render(<SeamModal {...props} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onReanchor).toHaveBeenCalledTimes(1);
    expect(props.onMove).not.toHaveBeenCalled();
  });

  it('clique no overlay mapeia para onReanchor; dentro do diálogo, não', async () => {
    const props = baseProps();
    render(<SeamModal {...props} />);
    // o DismissableLayer registra o listener num setTimeout(0) — dar o tick
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.pointerDown(screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('dialog'));
    expect(props.onReanchor).not.toHaveBeenCalled();
    const overlay = document.querySelector('.cds-seam-modal-overlay');
    expect(overlay).not.toBeNull();
    // clique real = pointerdown + click; o modal difere a dispensa para o click
    fireEvent.pointerDown(overlay!);
    fireEvent.click(overlay!);
    expect(props.onReanchor).toHaveBeenCalledTimes(1);
  });
});

/** Preview da costura: as duas bordas (de hoje / nova) existem no DOM e a
 *  direção acompanha o lado da travessia (redesign §6.5 "Decided"). */
describe('SeamModal — preview antes/depois da emenda', () => {
  it('crossEnd: a borda de hoje vem antes da borda nova no cordão', () => {
    render(<SeamModal {...baseProps()} />);
    const before = screen.getByText('borda de hoje');
    const after = screen.getByText('borda nova');
    expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('crossStart: a borda nova vem antes da borda de hoje (espelhado)', () => {
    render(
      <SeamModal
        {...baseProps({
          offer: makeOffer({ crossStart: true, crossEnd: false, sel: { s: 6, e: 15 }, delta: 4 }),
          neighbor: { span: { s: 0, e: 9 }, tint: VERDE },
        })}
      />,
    );
    const before = screen.getByText('borda de hoje');
    const after = screen.getByText('borda nova');
    expect(after.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // zonas espelhadas: vizinha (contas antes da seleção), contas que passaram, cena
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelectorAll('[data-zone="neighbor"]').length).toBe(3);
    expect(dialog.querySelectorAll('[data-zone="overshoot"]').length).toBe(4);
    expect(dialog.querySelectorAll('[data-zone="scene"]').length).toBe(4);
  });

  it('consumido além da vizinha: a borda nova ainda aparece (contas viram overshoot)', () => {
    render(
      <SeamModal
        {...baseProps({
          offer: makeOffer({
            kind: 'escalation',
            canMove: false,
            consumed: true,
            delta: 18,
            sel: { s: 12, e: 42 },
          }),
        })}
      />,
    );
    const before = screen.getByText('borda de hoje');
    const after = screen.getByText('borda nova');
    expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('crossStart sem vizinha: o trecho para na borda nova, sem contas de vizinha', () => {
    render(
      <SeamModal
        {...baseProps({
          offer: makeOffer({ crossStart: true, crossEnd: false, sel: { s: 6, e: 15 }, delta: 4 }),
          neighbor: null,
        })}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelectorAll('[data-zone="neighbor"]').length).toBe(0);
    expect(dialog.querySelectorAll('[data-zone="overshoot"]').length).toBe(4);
    expect(screen.getByText('borda nova')).toBeTruthy();
  });

  it('o trecho mostra a cena, as contas que passaram e a vizinha encolhendo', () => {
    render(<SeamModal {...baseProps()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelectorAll('[data-zone="scene"]').length).toBeGreaterThan(0);
    expect(dialog.querySelectorAll('[data-zone="overshoot"]').length).toBe(2);
    expect(dialog.querySelectorAll('[data-zone="neighbor"]').length).toBeGreaterThan(0);
  });

  it('sem vizinha, a borda só estica a cena — nenhuma conta de vizinha', () => {
    render(<SeamModal {...baseProps({ neighbor: null })} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelectorAll('[data-zone="neighbor"]').length).toBe(0);
    expect(screen.getByText('borda nova')).toBeTruthy();
  });
});

/** §9.2 — superfície do ouvinte: nenhum dígito em texto/aria/title, mesmo com
 *  delta/thr/copy do domain cheios de números. */
describe('SeamModal — minimalismo do ouvinte (§9.2)', () => {
  const offers: [string, BorderOffer][] = [
    ['simple', makeOffer()],
    [
      'escalation',
      makeOffer({
        kind: 'escalation',
        canMove: true,
        delta: 9,
        sel: { s: 12, e: 33 },
        warning: '⚑ Ajuste grande (são 9 contas, acima do limiar de 4) — parece re-corte.',
      }),
    ],
    [
      'escalation consumida',
      makeOffer({ kind: 'escalation', canMove: false, consumed: true, sel: { s: 12, e: 41 } }),
    ],
    ['two-productive', makeOffer({ kind: 'two-productive', canMove: false })],
  ];

  it.each(offers)('variante %s não vaza dígitos', (_label, offer) => {
    render(<SeamModal {...baseProps({ offer })} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).not.toMatch(/\d/);
    for (const el of dialog.querySelectorAll('[aria-label], [title]')) {
      expect(el.getAttribute('aria-label') ?? '').not.toMatch(/\d/);
      expect(el.getAttribute('title') ?? '').not.toMatch(/\d/);
    }
  });
});

/** §4.5 — o deslize é decorativo: animação SÓ dentro do bloco opt-in
 *  no-preference; fora dele, os estados antes/depois são estáticos. */
describe('SeamModal — reduced-motion (fonte CSS)', () => {
  it('animation/@keyframes vivem apenas sob prefers-reduced-motion: no-preference', () => {
    const { inside, outside } = splitByGuard(
      modalCss,
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)/,
    );
    expect(inside).toMatch(/animation|@keyframes/);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
