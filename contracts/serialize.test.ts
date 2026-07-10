import { describe, expect, it } from 'vitest';

import { manifestoFilename, retornoFilename, serializeArtifact } from './serialize';

describe('serializeArtifact — O serializador único (referência download() L1311)', () => {
  it('indenta com 2 espaços e NÃO emite newline final', () => {
    const bytes = serializeArtifact({ a: 1 });
    expect(bytes).toBe('{\n  "a": 1\n}');
    expect(bytes.endsWith('\n')).toBe(false);
  });

  it('emite acentos como UTF-8 cru, nunca \\u-escapado (média com U+00E9)', () => {
    const bytes = serializeArtifact({ scene_kind_confidence: 'média' });
    expect(bytes).toContain('média');
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
    expect(manifestoFilename('fluxo-minimo')).toBe('fluxo-minimo-manifesto-contas.json');
    expect(retornoFilename('fluxo-minimo')).toBe('fluxo-minimo-retorno-ancoragem.json');
  });

  it('slug vazio cai no fallback "colar" (quase morto na prática; portado fiel)', () => {
    expect(manifestoFilename('')).toBe('colar-manifesto-contas.json');
    expect(retornoFilename('')).toBe('colar-retorno-ancoragem.json');
  });
});
