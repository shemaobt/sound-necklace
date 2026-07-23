import { describe, expect, it } from 'vitest';

import { FixtureTranscriber } from './fixture';

const SESSION = 's-1';
const P1 = 'respostas/level1/recontar.webm';
const P2 = 'respostas/level2/PT1/quem.webm';

/** Roda o job até terminar (ou estourar o teto) e devolve o último progresso. */
async function runToDone(
  stt: FixtureTranscriber,
  sessionId: string = SESSION,
): Promise<Awaited<ReturnType<FixtureTranscriber['progress']>>> {
  for (let i = 0; i < 20; i++) {
    const p = await stt.progress(sessionId);
    if (p.done) return p;
  }
  throw new Error('o job fixture nunca terminou');
}

describe('FixtureTranscriber — o job assíncrono de transcrição + tradução', () => {
  it('entrega um rascunho para cada gravação pedida', async () => {
    const stt = new FixtureTranscriber();
    await stt.start(SESSION, [P1, P2]);

    const { drafts } = await runToDone(stt);

    expect(Object.keys(drafts).sort()).toEqual([P1, P2].sort());
    for (const path of [P1, P2]) {
      expect(drafts[path]?.source.trim()).not.toBe('');
      expect(drafts[path]?.en.trim()).not.toBe('');
    }
  });

  it('reporta o job em andamento antes de terminar, sem rascunhos pela metade', async () => {
    const stt = new FixtureTranscriber();
    await stt.start(SESSION, [P1]);

    const first = await stt.progress(SESSION);

    expect(first.done).toBe(false);
    expect(first.drafts).toEqual({});
  });

  it('é determinístico: o mesmo pedido produz os mesmos rascunhos', async () => {
    const a = new FixtureTranscriber();
    const b = new FixtureTranscriber();
    await a.start(SESSION, [P1, P2]);
    await b.start(SESSION, [P1, P2]);

    expect((await runToDone(a)).drafts).toEqual((await runToDone(b)).drafts);
  });

  it('cada gravação recebe um rascunho próprio — não o mesmo texto para todas', async () => {
    const stt = new FixtureTranscriber();
    await stt.start(SESSION, [P1, P2]);

    const { drafts } = await runToDone(stt);

    expect(drafts[P1]?.source).not.toBe(drafts[P2]?.source);
  });

  it('sem gravação nenhuma, o job já nasce concluído', async () => {
    const stt = new FixtureTranscriber();
    await stt.start(SESSION, []);

    expect(await stt.progress(SESSION)).toEqual({ done: true, drafts: {} });
  });

  it('perguntar por uma sessão que nunca começou não trava nem inventa rascunho', async () => {
    const stt = new FixtureTranscriber();

    expect(await stt.progress('nunca-comecou')).toEqual({ done: true, drafts: {} });
  });

  it('regravar (force) reabre o job e reprocessa', async () => {
    const stt = new FixtureTranscriber();
    await stt.start(SESSION, [P1]);
    await runToDone(stt);

    await stt.start(SESSION, [P1], { force: true });

    expect((await stt.progress(SESSION)).done).toBe(false);
    expect((await runToDone(stt)).drafts[P1]?.en.trim()).not.toBe('');
  });

  it('sem force, recomeçar um job já concluído não o reabre', async () => {
    const stt = new FixtureTranscriber();
    await stt.start(SESSION, [P1]);
    await runToDone(stt);

    await stt.start(SESSION, [P1]);

    expect((await stt.progress(SESSION)).done).toBe(true);
  });

  it('sessões diferentes não compartilham job', async () => {
    const stt = new FixtureTranscriber();
    await stt.start(SESSION, [P1]);
    await runToDone(stt);

    await stt.start('outra', [P2]);

    expect((await stt.progress('outra')).done).toBe(false);
    expect((await stt.progress(SESSION)).done).toBe(true);
  });
});
