import { describe, expect, it } from 'vitest';

import type { ResourcePath } from '../../contracts';

import registration from './register';

const P1 = 'respostas/level1/recontar.webm' as ResourcePath;

describe('registro do adapter de voz', () => {
  it('expõe a porta "voice" com fixture e real', () => {
    expect(registration.port).toBe('voice');
    expect(typeof registration.fixture).toBe('function');
    expect(typeof registration.real).toBe('function');
  });

  it('o fixture é um VoiceRecorder utilizável de imediato', async () => {
    const rec = registration.fixture();
    await (await rec.start(P1)).stop();
    expect(await rec.has(P1)).toBe(true);
  });
});
