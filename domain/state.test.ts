import { describe, expect, it } from 'vitest';

import { buildBeads } from './grid';
import { createSession } from './state';

describe('createSession — espelho do reset de segment() (referência L454–462)', () => {
  it('inicia a sessão pronta para a Escuta 1: história inteira selecionável, nada confirmado', () => {
    const beads = buildBeads(12, 0.5); // 24 contas
    const s = createSession({
      durationSec: 12,
      beadSec: 0.5,
      beads,
      manifestId: 'fnv1a32:00000000',
      audioFilename: 'historia.wav',
      slug: 'historia',
    });

    expect(s.totalBeads).toBe(24);
    expect(s.whole).toEqual({ id: 'S1', span: { s: 0, e: 23 }, confirmed: false });
    expect(s.parts).toEqual([]);
    expect(s.partsConfirmed).toBe(false);
    expect(s.frases).toEqual([]);
    expect(s.current).toEqual({ layer: 'whole', index: -1 });
    expect(s.activeSceneId).toBeNull();
    expect(s.mapping).toBeNull();
    expect(s.selection).toBeNull();
    expect(s.pendingStart).toBeNull();
    expect(s.mode).toBe('escuta');
    expect(s.review).toBe(false);
  });

  it('ecoa os dados do áudio segmentado (grade, hash, nomes)', () => {
    const beads = buildBeads(3, 0.3);
    const s = createSession({
      durationSec: 3,
      beadSec: 0.3,
      beads,
      manifestId: 'fnv1a32:1a884f38',
      audioFilename: 'conta-parcial.wav',
      slug: 'conta-parcial',
    });

    expect(s.durationSec).toBe(3);
    expect(s.beadSec).toBe(0.3);
    expect(s.beads).toBe(beads);
    expect(s.manifestId).toBe('fnv1a32:1a884f38');
    expect(s.audioFilename).toBe('conta-parcial.wav');
    expect(s.slug).toBe('conta-parcial');
  });

  it('grade vazia segue a referência: totalBeads 0 e span 0…−1 (nenhum guard inventado)', () => {
    const s = createSession({
      durationSec: 0,
      beadSec: 0.5,
      beads: [],
      manifestId: 'fnv1a32:00000000',
      audioFilename: 'vazio.wav',
      slug: 'vazio',
    });

    expect(s.totalBeads).toBe(0);
    expect(s.whole.span).toEqual({ s: 0, e: -1 });
  });
});
