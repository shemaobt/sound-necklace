import { describe, expect, it } from 'vitest';

import registration from './register';

const P1 = 'respostas/level1/recontar.webm';

describe('registro do adapter de transcrição', () => {
  it('expõe a porta "stt"', () => {
    expect(registration.port).toBe('stt');
  });

  it('o fixture é um Transcriber utilizável de imediato', async () => {
    const stt = registration.fixture();
    await stt.start('s-1', [P1]);
    for (let i = 0; i < 20 && !(await stt.progress('s-1')).done; i++);
    expect((await stt.progress('s-1')).drafts[P1]?.en.trim()).not.toBe('');
  });

  it('o modo real recusa alto — nunca devolve o fixture disfarçado', () => {
    // um fixture silenciosamente montado como "real" exportaria transcrição
    // inventada como se fosse da API: melhor quebrar do que mentir
    expect(() => registration.real()).toThrow();
  });
});
