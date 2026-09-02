import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
import { CoverageDrawer, type CoverageStoryOverview } from './coverage-drawer';
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
    fireEvent.click(dialog.querySelector('[aria-label="Fechar"]')!);
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

/**
 * ENG-726 — a gaveta cresce na Rever: resumo da história inteira + lista cena a
 * cena, tudo atrás da mesma prop opcional `storyOverview`. A Triagem nunca a
 * passa, então o teste mais importante da fatia é o primeiro: sem ela, nada do
 * conteúdo novo aparece — a Triagem não pode regredir.
 */
function storyOverviewFixture(over: Partial<CoverageStoryOverview> = {}): CoverageStoryOverview {
  return {
    totalScenes: 3,
    namedScenes: 2,
    noneFitScenes: 1,
    totalPhrases: 4,
    scenesWithoutPhrases: 1,
    duration: '12:36',
    beadSec: 5,
    confidenceHigh: 1,
    confidenceMedium: 1,
    confidenceLow: 0,
    scenes: [
      {
        key: 'PT1',
        label: 'Respiga na lavoura',
        fill: 'high',
        duration: '2:05',
        phraseCount: 2,
        selected: false,
        onSelect: () => {},
      },
      {
        key: 'PT2',
        label: 'Refeição compartilhada',
        fill: 'medium',
        duration: '3:10',
        phraseCount: 0,
        selected: true,
        onSelect: () => {},
      },
      {
        key: 'PT3',
        label: 'nenhum se encaixa',
        fill: 'none',
        duration: '1:00',
        phraseCount: 2,
        selected: false,
        onSelect: () => {},
      },
    ],
    ...over,
  };
}

describe('CoverageDrawer — sem storyOverview, nada do resumo aparece (a Triagem não regride, ENG-726)', () => {
  it('a Triagem — sem a prop nova — não ganha nem o resumo nem a lista cena a cena', () => {
    render(<CoverageDrawer coverage={coverageFixture()} />);
    const dialog = openDrawer();
    expect(screen.queryByText('Cena a cena')).toBeNull();
    expect(dialog.textContent).not.toMatch(/12:36|Certeza \d/);
  });
});

describe('CoverageDrawer — o resumo da história inteira (ENG-726, facilitadora)', () => {
  it('resume as cenas: quantas há, quantas têm tipo e quantas ficaram fora dos tipos', () => {
    render(<CoverageDrawer coverage={coverageFixture()} storyOverview={storyOverviewFixture()} />);
    const dialog = openDrawer();
    expect(dialog.textContent).toContain('3');
    expect(dialog.textContent).toContain('2 com tipo · 1 fora dos tipos');
  });

  it('resume as frases: quantas há no total, e quantas cenas ficaram sem nenhuma', () => {
    render(<CoverageDrawer coverage={coverageFixture()} storyOverview={storyOverviewFixture()} />);
    const dialog = openDrawer();
    expect(dialog.textContent).toContain('4');
    expect(dialog.textContent).toContain('1 cena sem frases');
  });

  it('quando toda cena com tipo tem frase, diz isso em vez de contar zero', () => {
    render(
      <CoverageDrawer
        coverage={coverageFixture()}
        storyOverview={storyOverviewFixture({ scenesWithoutPhrases: 0 })}
      />,
    );
    const dialog = openDrawer();
    expect(dialog.textContent).toContain('todas as cenas com frases');
  });

  it('mostra a duração da história inteira', () => {
    render(<CoverageDrawer coverage={coverageFixture()} storyOverview={storyOverviewFixture()} />);
    const dialog = openDrawer();
    expect(dialog.textContent).toContain('12:36');
  });

  it('mostra como as confianças se repartem entre certeza, quase e na dúvida', () => {
    render(<CoverageDrawer coverage={coverageFixture()} storyOverview={storyOverviewFixture()} />);
    const dialog = openDrawer();
    expect(dialog.textContent).toContain('Certeza 1');
    expect(dialog.textContent).toContain('Quase 1');
    expect(dialog.textContent).toContain('Na dúvida 0');
  });
});

describe('CoverageDrawer — cena a cena (ENG-726)', () => {
  function sceneRows(dialog: HTMLElement): HTMLElement[] {
    return Array.from(dialog.querySelectorAll('.cds-coverage-drawer-scene-row'));
  }

  it('lista uma linha por cena, na ordem da história, com o tipo, o tamanho e as frases', () => {
    render(<CoverageDrawer coverage={coverageFixture()} storyOverview={storyOverviewFixture()} />);
    const dialog = openDrawer();
    const rows = sceneRows(dialog);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('Respiga na lavoura');
    expect(rows[0]?.textContent).toContain('2:05');
    expect(rows[0]?.textContent).toContain('2');
    expect(rows[2]?.textContent).toContain('nenhum se encaixa');
  });

  it('a marca de confiança da linha é o mesmo preenchimento da pérola', () => {
    render(<CoverageDrawer coverage={coverageFixture()} storyOverview={storyOverviewFixture()} />);
    const dialog = openDrawer();
    const rows = sceneRows(dialog);
    expect(rows[0]?.querySelector('[data-fill="high"]')).toBeTruthy();
    expect(rows[1]?.querySelector('[data-fill="medium"]')).toBeTruthy();
  });

  it('uma cena sem tipo aparece na lista sem marca de erro, como na fila de pérolas', () => {
    render(<CoverageDrawer coverage={coverageFixture()} storyOverview={storyOverviewFixture()} />);
    const dialog = openDrawer();
    const rows = sceneRows(dialog);
    const noneRow = rows[2]!;
    expect(noneRow.querySelector('[data-fill="none"]')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(noneRow.textContent).not.toMatch(/[⚠⌀]/);
  });

  it('tocar numa linha chama o onSelect daquela cena', () => {
    const onSelect = vi.fn();
    const overview = storyOverviewFixture();
    overview.scenes[0]!.onSelect = onSelect;
    render(<CoverageDrawer coverage={coverageFixture()} storyOverview={overview} />);
    const dialog = openDrawer();
    fireEvent.click(sceneRows(dialog)[0]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('a linha da cena selecionada se distingue das outras', () => {
    render(<CoverageDrawer coverage={coverageFixture()} storyOverview={storyOverviewFixture()} />);
    const dialog = openDrawer();
    const rows = sceneRows(dialog);
    expect(rows[1]?.getAttribute('data-selected')).toBe('true');
    expect(rows[0]?.getAttribute('data-selected')).toBeNull();
    expect(rows[2]?.getAttribute('data-selected')).toBeNull();
  });
});

describe('CoverageDrawer — com storyOverview, a contagem por tipo e os candidatos a ausência continuam lá (ENG-726)', () => {
  it('a contagem por tipo e os candidatos a ausência aparecem do mesmo jeito que na Triagem', () => {
    render(<CoverageDrawer coverage={coverageFixture()} storyOverview={storyOverviewFixture()} />);
    const dialog = openDrawer();
    expect(dialog.textContent).toContain('Cenas produtivas: 3.');
    expect(dialog.textContent).toContain('Candidatos a ausência (raras em aberto)');
  });
});
