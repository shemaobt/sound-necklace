import { describe, expect, it, vi } from 'vitest';

import { FixtureSpeechSynthesizer } from './fixture';
import { HttpSpeechSynthesizer } from './http';

/**
 * Audio falso: expõe play/pause e os handlers, e deixa o teste decidir se o play
 * RESOLVE (tocou) ou REJEITA (bloqueio de autoplay — sem gesto do usuário).
 */
class FakeAudio {
  static instances: FakeAudio[] = [];
  static rejectPlay: Error | null = null;

  paused = false;
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly playCalls: number[] = [];

  constructor(readonly src: string) {
    FakeAudio.instances.push(this);
  }

  play(): Promise<void> {
    this.playCalls.push(1);
    return FakeAudio.rejectPlay ? Promise.reject(FakeAudio.rejectPlay) : Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }
}

const MP3 = new Blob([new Uint8Array([0xff, 0xfb, 0x00])], { type: 'audio/mpeg' });

function ok(): Response {
  return { ok: true, status: 200, blob: () => Promise.resolve(MP3) } as unknown as Response;
}

function status(code: number): Response {
  return { ok: false, status: code, blob: () => Promise.resolve(MP3) } as unknown as Response;
}

function build(responses: Array<Response | Error> = [ok()]) {
  FakeAudio.instances = [];
  FakeAudio.rejectPlay = null;

  const queue = [...responses];
  const fetch = vi.fn(() => {
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });

  const fallback = new FixtureSpeechSynthesizer();
  const speaking: boolean[] = [];
  const tts = new HttpSpeechSynthesizer({
    baseUrl: '/api',
    fetch: fetch as unknown as typeof globalThis.fetch,
    fallback,
    token: () => 'tok-1',
    AudioCtor: FakeAudio as unknown as typeof Audio,
    createObjectURL: (blob: Blob) => `blob:${blob.type}:${FakeAudio.instances.length}`,
  });
  tts.onSpeaking((s) => speaking.push(s));

  return { tts, fetch, fallback, speaking };
}

/** Deixa as promessas em voo (fetch → blob → play) assentarem. */
const settle = () => new Promise((r) => setTimeout(r, 0));

const Q = 'Onde essa história acontece?';

describe('HttpSpeechSynthesizer', () => {
  it('POSTa o texto + idioma no serviço de TTS da API e toca o áudio devolvido', async () => {
    const { tts, fetch } = build();

    tts.speak(Q, 'pt-BR');
    await settle();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/platform/tts/speak');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ text: Q, language: 'pt-BR' });
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer tok-1');

    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]!.playCalls).toHaveLength(1);
  });

  it('emite falando=true ao tocar e falando=false ao terminar', async () => {
    const { tts, speaking } = build();

    tts.speak(Q);
    await settle();
    expect(speaking).toEqual([true]);

    FakeAudio.instances[0]!.onended?.();
    expect(speaking).toEqual([true, false]);
  });

  it('cacheia o clipe por (idioma, texto): reouvir a mesma pergunta não refaz o POST', async () => {
    const { tts, fetch } = build();

    tts.speak(Q, 'pt-BR');
    await settle();
    tts.speak(Q, 'pt-BR');
    await settle();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(FakeAudio.instances).toHaveLength(2); // tocou duas vezes, baixou uma
  });

  it('o mesmo texto em OUTRO idioma é outro clipe', async () => {
    const { tts, fetch } = build();

    tts.speak(Q, 'pt-BR');
    await settle();
    tts.speak(Q, 'en-US');
    await settle();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('autoplay bloqueado (sem gesto do usuário) não quebra e NÃO cai no fallback', async () => {
    const { tts, fallback, speaking } = build();
    FakeAudio.rejectPlay = new DOMException('play() failed', 'NotAllowedError');

    tts.speak(Q);
    await settle();

    expect(speaking).not.toContain(true); // não anuncia fala que não aconteceu
    expect(fallback.spoken).toEqual([]); // o botão "Ouvir a pergunta" (gesto) resolve
  });

  it('erro de rede cai no Web Speech de fallback', async () => {
    const { tts, fallback } = build([new TypeError('Failed to fetch')]);

    tts.speak(Q, 'pt-BR');
    await settle();

    expect(fallback.spoken).toEqual([{ text: Q, lang: 'pt-BR' }]);
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('404 (endpoint ausente) cai no fallback e para de insistir — sem 21 POSTs mortos', async () => {
    const { tts, fetch, fallback } = build([status(404)]);

    tts.speak('primeira');
    await settle();
    tts.speak('segunda');
    await settle();

    expect(fetch).toHaveBeenCalledTimes(1); // a segunda nem tenta
    expect(fallback.spoken.map((u) => u.text)).toEqual(['primeira', 'segunda']);
  });

  it('uma queda de rede momentânea NÃO desiste da API: a pergunta seguinte volta a tocar o clipe', async () => {
    // Uma oscilação de Wi-Fi no meio da entrevista não pode degradar a voz do guia pelo
    // resto da sessão — a rede volta (o app é online-only e tem gate de reconexão).
    const { tts, fetch, fallback } = build([new TypeError('Failed to fetch'), ok()]);

    tts.speak('primeira');
    await settle();
    tts.speak('segunda');
    await settle();

    expect(fetch).toHaveBeenCalledTimes(2); // tentou de novo
    expect(fallback.spoken.map((u) => u.text)).toEqual(['primeira']);
    expect(FakeAudio.instances).toHaveLength(1); // a segunda tocou pela API
  });

  it('um corpo de resposta corrompido cai no fallback em vez de derrubar a fala', async () => {
    const broken = {
      ok: true,
      status: 200,
      blob: () => Promise.reject(new Error('corpo abortado')),
    } as unknown as Response;
    const { tts, fallback } = build([broken]);

    tts.speak(Q, 'pt-BR');
    await settle();

    expect(fallback.spoken).toEqual([{ text: Q, lang: 'pt-BR' }]);
  });

  it('um 500 isolado cai no fallback mas NÃO desiste da API', async () => {
    const { tts, fetch, fallback } = build([status(500), ok()]);

    tts.speak('primeira');
    await settle();
    tts.speak('segunda');
    await settle();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fallback.spoken.map((u) => u.text)).toEqual(['primeira']);
    expect(FakeAudio.instances).toHaveLength(1); // a segunda tocou pela API
  });

  it('a fala do fallback propaga o estado "falando" para os assinantes (lip-sync do guia)', async () => {
    const { tts, speaking } = build([new TypeError('offline')]);

    tts.speak(Q);
    await settle();

    expect(speaking).toEqual([true]);
  });

  it('stop() pausa, rebobina e emite falando=false', async () => {
    const { tts, speaking } = build();

    tts.speak(Q);
    await settle();
    FakeAudio.instances[0]!.currentTime = 3;

    tts.stop();

    expect(FakeAudio.instances[0]!.paused).toBe(true);
    expect(FakeAudio.instances[0]!.currentTime).toBe(0);
    expect(speaking).toEqual([true, false]);
  });

  it('uma nova pergunta cancela a anterior', async () => {
    const { tts } = build();

    tts.speak('primeira');
    await settle();
    tts.speak('segunda');
    await settle();

    expect(FakeAudio.instances[0]!.paused).toBe(true);
    expect(FakeAudio.instances[1]!.paused).toBe(false);
  });

  it('avançar antes do clipe chegar descarta a resposta obsoleta: só a última pergunta toca', async () => {
    const { tts } = build();

    tts.speak('primeira'); // fetch em voo
    tts.speak('segunda'); // avança antes de resolver
    await settle();

    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]!.src).toContain('blob:');
  });
});
