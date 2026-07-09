import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildBeads,
  createSession,
  type ScenePart,
  type SessionState,
  type Span,
} from '../../../domain';
import { splitByGuard } from '../../atoms/testing/css';
import { sessionStore } from '../../state';
import escuta2Css from './escuta2.css?raw';
import Escuta2 from './index';

/**
 * A estação de corte de cenas (PRD v2 §8.4, redesign §6.3): o usuário decide só
 * o FIM de cada cena (início pré-costurado). Os testes afirmam comportamento de
 * fronteira pelo domínio — travar avança para a próxima emenda, reabrir cascateia,
 * a cópia de erro exata surge, "Confirmar as cenas →" só existe com ≥1 travada e
 * leva à Triagem, "Voltar" reabre a história preservando as cenas — mais o
 * minimalismo do ouvinte (§9.2) e o tratamento creme (redesign §6.3, §4.5).
 */

const DURATION = 2.5;
const BEAD_SEC = 0.25; // 10 contas (0…9)

function part(overrides: Partial<ScenePart>): ScenePart {
  return {
    part_id: 'PT1',
    span: null,
    locked: false,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
    ...overrides,
  };
}

function lockedPart(id: string, span: Span): ScenePart {
  return part({ part_id: id, span, locked: true });
}

/** Estado da Escuta 2: história confirmada, modo escuta, cortando cenas. */
function cutting(overrides: Partial<SessionState>): SessionState {
  const beads = buildBeads(DURATION, BEAD_SEC);
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads,
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  return {
    ...base,
    whole: { ...base.whole, confirmed: true },
    mode: 'escuta',
    ...overrides,
  };
}

function load(state: SessionState): void {
  sessionStore.getState().load(state);
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});

describe('Escuta 2 — travar e avançar a emenda (PRD v2 §8.4)', () => {
  it('confirmar a cena trava o span, marca a conta final e reabre a próxima na emenda', async () => {
    load(
      cutting({
        parts: [part({ part_id: 'PT1' })],
        current: { layer: 'parts', index: 0 },
        selection: { s: 0, e: 4 },
        pendingStart: null,
      }),
    );
    render(<Escuta2 />);

    await userEvent.click(screen.getByRole('button', { name: '✓ Confirmar esta cena' }));

    const s = sessionStore.getState().session!;
    expect(s.parts[0]!.locked).toBe(true);
    expect(s.parts[0]!.span).toEqual({ s: 0, e: 4 });
    // uma nova cena abriu, pré-ancorada na emenda (fim anterior + 1)
    expect(s.parts).toHaveLength(2);
    expect(s.pendingStart).toBe(5);
    expect(s.current.index).toBe(1);
    // a cena travada aparece como chip
    expect(screen.getByRole('group', { name: 'Cena um' })).toBeTruthy();
  });

  it('“Confirmar esta cena” sem fim escolhido mostra a cópia exata e não trava', async () => {
    load(
      cutting({
        parts: [part({ part_id: 'PT1' })],
        current: { layer: 'parts', index: 0 },
        selection: null,
        pendingStart: null,
      }),
    );
    render(<Escuta2 />);

    await userEvent.click(screen.getByRole('button', { name: '✓ Confirmar esta cena' }));

    expect(screen.getByText('Clique onde a cena termina, no colar.')).toBeTruthy();
    expect(sessionStore.getState().session!.parts[0]!.locked).toBe(false);
  });

  it('cena começando antes da fronteira mostra a cópia exata com a conta da emenda', async () => {
    load(
      cutting({
        parts: [lockedPart('PT1', { s: 0, e: 4 }), part({ part_id: 'PT2' })],
        current: { layer: 'parts', index: 1 },
        selection: { s: 3, e: 4 }, // antes da emenda (conta 5)
        pendingStart: null,
      }),
    );
    render(<Escuta2 />);

    await userEvent.click(screen.getByRole('button', { name: '✓ Confirmar esta cena' }));

    expect(screen.getByText('A cena não pode começar antes da conta 5.')).toBeTruthy();
    expect(sessionStore.getState().session!.parts[1]!.locked).toBe(false);
  });
});

describe('Escuta 2 — chips das cenas confirmadas (redesign §6.3)', () => {
  it('reabrir uma cena destrava ela e todas as seguintes (cascata refletida nos chips)', async () => {
    load(
      cutting({
        parts: [
          lockedPart('PT1', { s: 0, e: 2 }),
          lockedPart('PT2', { s: 3, e: 5 }),
          lockedPart('PT3', { s: 6, e: 8 }),
          part({ part_id: 'PT4' }),
        ],
        current: { layer: 'parts', index: 3 },
        selection: null,
        pendingStart: null,
      }),
    );
    render(<Escuta2 />);

    expect(screen.getAllByRole('group')).toHaveLength(3);

    const cenaDois = screen.getByRole('group', { name: 'Cena dois' });
    await userEvent.click(within(cenaDois).getByRole('button', { name: 'Reabrir' }));

    // reabrir a cena 2 destrava 2 e 3 → sobra só a cena 1
    const chips = screen.getAllByRole('group');
    expect(chips).toHaveLength(1);
    expect(chips[0]!.getAttribute('aria-label')).toBe('Cena um');
    expect(sessionStore.getState().session!.current.index).toBe(1);
  });
});

describe('Escuta 2 — confirmar as cenas e voltar (PRD v2 §8.4)', () => {
  it('“Confirmar as cenas →” só existe com ≥1 cena travada', () => {
    load(
      cutting({
        parts: [part({ part_id: 'PT1' })],
        current: { layer: 'parts', index: 0 },
        selection: null,
        pendingStart: null,
      }),
    );
    render(<Escuta2 />);
    expect(screen.queryByRole('button', { name: 'Confirmar as cenas →' })).toBeNull();
  });

  it('“Confirmar as cenas →” leva à Triagem', async () => {
    load(
      cutting({
        parts: [lockedPart('PT1', { s: 0, e: 4 }), part({ part_id: 'PT2' })],
        current: { layer: 'parts', index: 1 },
        selection: null,
        pendingStart: null,
      }),
    );
    render(<Escuta2 />);

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar as cenas →' }));

    const s = sessionStore.getState().session!;
    expect(s.mode).toBe('triagem');
    expect(s.partsConfirmed).toBe(true);
  });

  it('“← Voltar” reabre a história (passo 1) preservando as cenas travadas', async () => {
    load(
      cutting({
        parts: [lockedPart('PT1', { s: 0, e: 4 }), part({ part_id: 'PT2' })],
        current: { layer: 'parts', index: 1 },
        selection: null,
        pendingStart: null,
      }),
    );
    render(<Escuta2 />);

    await userEvent.click(screen.getByRole('button', { name: '← Voltar' }));

    const s = sessionStore.getState().session!;
    expect(s.whole.confirmed).toBe(false);
    expect(s.mode).toBe('escuta');
    // a cena travada continua lá
    expect(s.parts.some((p) => p.locked && p.part_id === 'PT1')).toBe(true);
  });
});

describe('Escuta 2 — minimalismo para o ouvinte (PRD v2 §9.2)', () => {
  it('não mostra dígito, tem ≤1 linha de instrução e exatamente uma ação dominante', () => {
    const { container } = render(
      (() => {
        load(
          cutting({
            parts: [lockedPart('PT1', { s: 0, e: 4 }), part({ part_id: 'PT2' })],
            current: { layer: 'parts', index: 1 },
            selection: { s: 5, e: 5 },
            pendingStart: 5,
          }),
        );
        return <Escuta2 />;
      })(),
    );

    expect(container.textContent ?? '').not.toMatch(/\d/);
    for (const el of container.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label')).not.toMatch(/\d/);
    }
    for (const el of container.querySelectorAll('[title]')) {
      expect(el.getAttribute('title')).not.toMatch(/\d/);
    }
    expect(container.querySelectorAll('[data-role="instruction"]').length).toBeLessThanOrEqual(1);
    expect(container.querySelectorAll('[data-role="primary-action"]')).toHaveLength(1);
  });
});

describe('Escuta 2 — tratamento creme (redesign §6.3, §4.5)', () => {
  it('o palco aplica o fundo creme e destaca "esta cena termina" em telha', () => {
    load(
      cutting({
        parts: [part({ part_id: 'PT1' })],
        current: { layer: 'parts', index: 0 },
        selection: null,
        pendingStart: null,
      }),
    );
    const { container } = render(<Escuta2 />);

    expect(container.querySelector('.cds-escuta2')).not.toBeNull();
    expect(container.querySelector('.cds-escuta2-emph')?.textContent).toBe('esta cena termina');
    expect(escuta2Css).toMatch(/\.cds-escuta2\s*\{[^}]*var\(--cds-cream\)/);
    expect(escuta2Css).toMatch(/\.cds-escuta2-emph\s*\{[^}]*var\(--cds-telha\)/);
  });

  it('todo movimento decorativo fica sob prefers-reduced-motion: no-preference', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(escuta2Css, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
