import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { replaySessionSteps, type GoldenCase, type GoldenStep } from './registry';

const __dirname = dirname(fileURLToPath(import.meta.url));

function minimalFlow(): GoldenCase {
  return JSON.parse(
    readFileSync(join(__dirname, 'cases', 'minimal-flow.json'), 'utf8'),
  ) as GoldenCase;
}

describe('replaySessionSteps — passos de cena do golden case 2 (ENG-216)', () => {
  it('replaya o prefixo de cenas do minimal-flow e para pendente na triagem (ENG-219)', () => {
    const { steps } = minimalFlow();
    const r = replaySessionSteps(steps);

    // status documentado: tudo até confirmParts consumido, triage pendente
    expect(r.pendingAt).toEqual({ index: 5, type: 'triage' });

    // 96000 amostras / 8000 Hz = 12 s a 0.5 s/conta → 24 contas
    expect(r.state.totalBeads).toBe(24);
    expect(r.state.whole.confirmed).toBe(true);
    expect(r.state.parts.map((p) => ({ id: p.part_id, span: p.span, locked: p.locked }))).toEqual([
      { id: 'PT1', span: { s: 0, e: 9 }, locked: true },
      { id: 'PT2', span: { s: 10, e: 23 }, locked: true },
    ]);
    expect(r.state.partsConfirmed).toBe(true);
    expect(r.state.mode).toBe('triagem');
  });

  it('reopenScene destrava em cascata e o re-corte preserva os PT#s', () => {
    const { steps } = minimalFlow();
    const segment = steps[0] as GoldenStep;
    const replayed = replaySessionSteps([
      segment,
      { type: 'confirmWhole' },
      { type: 'cutScene', endBead: 9 },
      { type: 'cutScene', endBead: 23 },
      { type: 'reopenScene', index: 0 },
      { type: 'cutScene', endBead: 5 },
      { type: 'cutScene', endBead: 23 },
      { type: 'confirmParts' },
    ]);

    expect(replayed.pendingAt).toBeNull();
    expect(
      replayed.state.parts.map((p) => ({ id: p.part_id, span: p.span, locked: p.locked })),
    ).toEqual([
      { id: 'PT1', span: { s: 0, e: 5 }, locked: true },
      { id: 'PT2', span: { s: 6, e: 23 }, locked: true },
    ]);
    expect(replayed.state.partsConfirmed).toBe(true);
  });

  it('recusa passo de sessão antes do segment', () => {
    expect(() => replaySessionSteps([{ type: 'confirmWhole' }])).toThrow(/segment/);
  });

  it('falha ALTO quando o domínio recusa um passo — nunca replay pela metade', () => {
    const { steps } = minimalFlow();
    const segment = steps[0] as GoldenStep;
    // confirmParts sem nenhuma cena travada → NO_LOCKED_SCENE
    expect(() =>
      replaySessionSteps([segment, { type: 'confirmWhole' }, { type: 'confirmParts' }]),
    ).toThrow(/NO_LOCKED_SCENE/);
  });
});
