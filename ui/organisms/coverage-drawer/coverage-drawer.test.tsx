import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  buildBeads,
  computeCoverage,
  createSession,
  markNoneFit,
  SCENE_KINDS,
  tagScene,
  type Confidence,
  type ScenePart,
  type SessionState,
} from '../../../domain';
import { splitByGuard } from '../../atoms/testing/css';
import { CoverageDrawer } from './coverage-drawer';
import drawerCss from './coverage-drawer.css?raw';

function lockedPart(part_id: string): ScenePart {
  return {
    part_id,
    span: { s: 0, e: 1 },
    locked: true,
    scene_kind: null,
    scene_kind_confidence: null,
    tag_state: 'pending',
  };
}

/** Cobertura nascida do comportamento real do domínio, não de um literal. */
function coverageFixture() {
  const base = createSession({
    durationSec: 12,
    beadSec: 0.5,
    beads: buildBeads(12, 0.5),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'a.wav',
    slug: 's',
  });
  let state: SessionState = {
    ...base,
    parts: [lockedPart('PT1'), lockedPart('PT2'), lockedPart('PT3'), lockedPart('PT4')],
    partsConfirmed: true,
  };
  const tag = (id: string, kind: string, conf: Confidence) => {
    state = tagScene(state, id, kind, conf);
  };
  tag('PT1', 'GLEANING_SCENE', 'high');
  tag('PT2', 'GLEANING_SCENE', 'low');
  tag('PT3', 'APPEAL_SCENE', 'medium');
  state = markNoneFit(state, 'PT4');
  return computeCoverage(state);
}

function openDrawer() {
  fireEvent.click(screen.getByRole('button', { name: 'Cobertura (facilitadora)' }));
  return screen.getByRole('dialog');
}

describe('CoverageDrawer — invisível até ser aberto (PRD v2 §8.5)', () => {
  it('fechado por padrão: nada do painel existe no documento', () => {
    render(<CoverageDrawer coverage={coverageFixture()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Cobertura · só facilitadora')).toBeNull();
    expect(screen.queryByText(/Candidatos a ausência/)).toBeNull();
  });

  it('abre por ação explícita no gatilho e mostra o título', () => {
    render(<CoverageDrawer coverage={coverageFixture()} />);
    const dialog = openDrawer();
    expect(dialog.textContent).toContain('Cobertura · só facilitadora');
  });
});

describe('CoverageDrawer — conteúdo a partir das props', () => {
  it('mostra a contagem de cenas produtivas', () => {
    render(<CoverageDrawer coverage={coverageFixture()} />);
    const dialog = openDrawer();
    expect(dialog.textContent).toContain('Cenas produtivas: 3.');
  });

  it('linhas por tipo: firme/hesitante e alvo "1–2" para rara, "3" para comum', () => {
    render(<CoverageDrawer coverage={coverageFixture()} />);
    const dialog = openDrawer();
    const rows = Array.from(dialog.querySelectorAll('[data-status]'));
    const byKind = new Map(
      rows.map((r) => [r.querySelector('.cds-coverage-drawer-kind')?.textContent, r]),
    );

    const gleaning = byKind.get('GLEANING_SCENE')!;
    expect(gleaning.textContent).toContain('firme 1');
    expect(gleaning.textContent).toContain('hesitante 1');
    expect(gleaning.textContent).toContain('alvo 1–2');
    expect(gleaning.getAttribute('data-status')).toBe('covered');

    const appeal = byKind.get('APPEAL_SCENE')!;
    expect(appeal.textContent).toContain('firme 1');
    expect(appeal.textContent).toContain('hesitante 0');
    expect(appeal.textContent).toContain('alvo 3');
    expect(appeal.getAttribute('data-status')).toBe('partial');

    // tipos sem contagem não viram linha
    expect(byKind.has('VOW_SCENE')).toBe(false);
  });

  it('candidatos a ausência: raras sem firme, com rótulo PT-BR', () => {
    render(<CoverageDrawer coverage={coverageFixture()} />);
    const dialog = openDrawer();
    expect(dialog.textContent).toContain('Candidatos a ausência (raras em aberto)');
    const chips = Array.from(dialog.querySelectorAll('.cds-coverage-drawer-chip')).map(
      (c) => c.textContent,
    );
    expect(chips).toContain('Voto');
    expect(chips).toContain('Casamento');
    // GLEANING tem firme 1 — não é candidato
    expect(chips).not.toContain('Respiga');
    const rareCount = SCENE_KINDS.filter((k) => k.tier === 'ALTA').length;
    expect(chips).toHaveLength(rareCount - 1);
  });
});

describe('CoverageDrawer — dispensa (Radix)', () => {
  it('ESC fecha e devolve o foco ao gatilho', async () => {
    render(<CoverageDrawer coverage={coverageFixture()} />);
    openDrawer();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cobertura (facilitadora)' }),
    );
  });

  it('toque fora do painel fecha', async () => {
    render(<CoverageDrawer coverage={coverageFixture()} />);
    openDrawer();
    // o DismissableLayer registra o listener num tick após abrir e, com
    // button 0, adia a dispensa para o click subsequente ao pointerdown
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('o botão fechar (×) fecha', async () => {
    render(<CoverageDrawer coverage={coverageFixture()} />);
    const dialog = openDrawer();
    fireEvent.click(dialog.querySelector('[aria-label="fechar"]')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('CoverageDrawer — movimento decorativo só sob reduced-motion (§9.3)', () => {
  it('animation/keyframes só dentro da guarda prefers-reduced-motion', () => {
    const guard = /@media\s*\(prefers-reduced-motion:\s*no-preference\)/;
    const { outside } = splitByGuard(drawerCss, guard);
    expect(outside).not.toMatch(/animation|@keyframes/);
  });
});
