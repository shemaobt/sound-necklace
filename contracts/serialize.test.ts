import { describe, expect, it } from 'vitest';

import { manifestoFilename, retornoFilename, serializeArtifact } from './serialize';

describe('serializeArtifact — O serializador único (referência download() L1311)', () => {
  it('indenta com 2 espaços e NÃO emite newline final', () => {
    const bytes = serializeArtifact({ a: 1 });
    expect(bytes).toBe('{\n  "a": 1\n}');
    expect(bytes.endsWith('\n')).toBe(false);
  });

  // O artefato normalizou para inglês (ENG-356), mas `story_slug`/`audio_filename`
  // ainda carregam o nome PT-BR do arquivo de campo — o acento cru segue sendo contrato.
  it('emite acentos como UTF-8 cru, nunca \\u-escapado (história com U+00F3)', () => {
    const bytes = serializeArtifact({ story_slug: 'história' });
    expect(bytes).toContain('história');
    expect(bytes).not.toContain('\\u');
  });

  it('formata números na forma mais curta, sem zeros à direita (0.25, 0.9, 10.371)', () => {
    const bytes = serializeArtifact({ v: [0.25, 0.9, 10.371, 24] });
    expect(bytes).toBe('{\n  "v": [\n    0.25,\n    0.9,\n    10.371,\n    24\n  ]\n}');
  });

  it('preserva a ordem de inserção das chaves (byte-identidade depende disso)', () => {
    expect(serializeArtifact({ b: 1, a: 2 })).toBe('{\n  "b": 1,\n  "a": 2\n}');
  });
});

describe('nomes de arquivo dos artefatos (referência L1331/L1336)', () => {
  it('prefixa com o slug da história', () => {
    expect(manifestoFilename('fluxo-minimo')).toBe('fluxo-minimo-bead-manifest.json');
    expect(retornoFilename('fluxo-minimo')).toBe('fluxo-minimo-anchoring-return.json');
  });

  it('slug vazio cai no fallback "story" — unificado com o .md na ENG-359', () => {
    expect(manifestoFilename('')).toBe('story-bead-manifest.json');
    expect(retornoFilename('')).toBe('story-anchoring-return.json');
  });
});
