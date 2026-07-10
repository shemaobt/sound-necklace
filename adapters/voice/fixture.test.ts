import { describe, expect, it } from 'vitest';

import type { ResourcePath } from '../../contracts';
import { FixtureSessionStore } from '../sessions/fixture';

import { FixtureVoiceRecorder } from './fixture';
import { MemoryVoiceStore } from './memory-store';
import type { VoiceResourceStore } from './types';

const P1 = 'respostas/level1/recontar.webm' as ResourcePath;
const P2 = 'respostas/level2/PT1/quem.webm' as ResourcePath;

describe('FixtureVoiceRecorder', () => {
  it('gravar → parar persiste no caminho exato e devolve blob + duração', async () => {
    const store = new MemoryVoiceStore();
    const rec = new FixtureVoiceRecorder(store);

    const recording = await rec.start(P1);
    const answer = await recording.stop();

    expect(answer.blob.size).toBeGreaterThan(0);
    expect(answer.durationSec).toBeGreaterThanOrEqual(0);
    expect(await rec.has(P1)).toBe(true);
    const bytes = await store.get(P1);
    expect(bytes.byteLength).toBe(answer.blob.size);
  });

  it('re-gravar substitui o arquivo no mesmo caminho (um por pergunta)', async () => {
    const store = new MemoryVoiceStore();
    const rec = new FixtureVoiceRecorder(store);

    await (await rec.start(P1)).stop();
    const first = await store.get(P1);
    await (await rec.start(P1)).stop();
    const second = await store.get(P1);

    // uma única entrada para a chave, e a leitura devolve a última gravação
    expect(await rec.has(P1)).toBe(true);
    expect(second).toBeInstanceOf(Uint8Array);
    expect(first.byteLength).toBe(second.byteLength);
  });

  it('has/delete refletem o estado persistido', async () => {
    const rec = new FixtureVoiceRecorder();
    expect(await rec.has(P2)).toBe(false);

    await (await rec.start(P2)).stop();
    expect(await rec.has(P2)).toBe(true);

    await rec.delete(P2);
    expect(await rec.has(P2)).toBe(false);
  });

  it('play só toca o que existe; sem gravação, lança', async () => {
    const rec = new FixtureVoiceRecorder();
    await expect(rec.play(P1)).rejects.toThrow();

    await (await rec.start(P1)).stop();
    await expect(rec.play(P1)).resolves.toBeUndefined();
    rec.stopPlayback();
  });

  it('o nível emite SÓ durante a gravação — nada depois de parar', async () => {
    const rec = new FixtureVoiceRecorder();
    const recording = await rec.start(P1);

    const levels: number[] = [];
    recording.onLevel((l) => levels.push(l));
    recording.tick();
    recording.tick();
    const duringCount = levels.length;
    expect(duringCount).toBe(2);
    expect(levels.every((l) => l >= 0 && l <= 1)).toBe(true);

    await recording.stop();
    recording.tick();
    expect(levels.length).toBe(duringCount); // parou de emitir
  });

  it('níveis são determinísticos para a mesma semente', async () => {
    const runLevels = async (seed: number) => {
      const rec = new FixtureVoiceRecorder(new MemoryVoiceStore(), seed);
      const recording = await rec.start(P1);
      const out: number[] = [];
      recording.onLevel((l) => out.push(l));
      recording.tick();
      recording.tick();
      recording.tick();
      return out;
    };
    expect(await runLevels(42)).toEqual(await runLevels(42));
  });

  it('persiste através de um VoiceResourceStore apoiado no SessionStore (§10.4)', async () => {
    const sessions = new FixtureSessionStore();
    const summary = await sessions.create({
      projectId: 'proj-1',
      storyName: 'História',
      storySlug: 'historia',
      audioId: 'aud-1',
      granularityLevel: 'media',
      beadSec: 0.25,
      manifestId: 'fnv1a32:00000000',
      pipelineConsent: true,
    });
    const id = summary.id;

    const bridge: VoiceResourceStore = {
      put: (p, b) => sessions.putResource(id, p, b),
      get: (p) => sessions.getResource(id, p),
      has: async (p) => (await sessions.listResources(id, p)).includes(p),
      delete: async (p) => {
        await sessions.putResource(id, p, new Uint8Array());
      },
    };

    const rec = new FixtureVoiceRecorder(bridge);
    const answer = await (await rec.start(P2)).stop();

    const stored = await sessions.getResource(id, P2);
    expect(stored.byteLength).toBe(answer.blob.size);
  });
});
