import { describe, expect, it, vi } from 'vitest';

import { FixtureSpeechSynthesizer } from './fixture';
import { HttpSpeechSynthesizer } from './http';

/**
 * Audio falso. `play()` tem três modos, e o terceiro é o que importa: `deferPlay` deixa a
 * promise PENDENTE até o teste resolvê-la à mão, para conseguir exprimir a corrida real —
 * o play do clipe 1 ainda em voo quando o clipe 2 já começou. Sem isso a suíte não
 * consegue nem enunciar o bug, e o guard vira sorte em vez de correção.
 */
class FakeAudio {
  static instances: FakeAudio[] = [];
  /** play() rejeita na hora (autoplay bloqueado). */
  static autoRejectWith: Error | null = null;
  /** play() fica pendente; o teste chama `settlePlay(ok)`. */
  static deferPlay = false;

  paused = false;
  currentTime = 0;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly playCalls: number[] = [];
  settlePlay: ((started: boolean) => void) | null = null;

  constructor(readonly src: string) {
    FakeAudio.instances.push(this);
  }

  play(): Promise<void> {
    this.playCalls.push(1);
    if (FakeAudio.autoRejectWith) return Promise.reject(FakeAudio.autoRejectWith);
    if (!FakeAudio.deferPlay) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.settlePlay = (started) =>
        started ? resolve() : reject(new DOMException('interrupted by pause()', 'AbortError'));
    });
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
  FakeAudio.autoRejectWith = null;
  FakeAudio.deferPlay = false;

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
    FakeAudio.autoRejectWith = new DOMException('play() failed', 'NotAllowedError');

    tts.speak(Q);
    await settle();

    expect(speaking).not.toContain(true); // não anuncia fala que não aconteceu
    expect(fallback.spoken).toEqual([]); // o botão "Ouvir a pergunta" (gesto) resolve
  });

  it('o play() abortado de um clipe obsoleto não apaga o lip-sync do clipe em curso', async () => {
    // O ouvinte avança enquanto o clipe 1 ainda está começando. O pause() faz o play() do
    // clipe 1 rejeitar com AbortError DEPOIS que o clipe 2 já está tocando — sem a guarda,
    // esse erro tardio congelaria a boca do guia pela pergunta inteira.
    const { tts, speaking } = build();
    FakeAudio.deferPlay = true;

    tts.speak('primeira');
    await settle();
    const first = FakeAudio.instances[0]!;

    tts.speak('segunda');
    await settle();
    FakeAudio.instances[1]!.settlePlay!(true); // o clipe 2 começa a tocar
    await settle();
    expect(speaking).toEqual([true]);

    first.settlePlay!(false); // só agora o play() do clipe 1 rejeita
    await settle();

    expect(speaking).toEqual([true]); // o guia continua falando
  });

  it('stop() com o play() em voo não deixa o guia falando para sempre', async () => {
    // O toggle de som é um GATE DE CONSENTIMENTO (§12). Se o play() cumpre depois do stop()
    // — a reprodução já tinha começado, então o pause() não desfaz a promise — o estado
    // "falando" grudava em true e nada mais podia zerá-lo: um <audio> pausado nunca emite
    // `ended`. O guia seguiria mexendo a boca depois de você mutar o som.
    const { tts, speaking } = build();
    FakeAudio.deferPlay = true;

    tts.speak(Q);
    await settle();
    const audio = FakeAudio.instances[0]!;

    tts.stop();
    audio.settlePlay!(true);
    await settle();

    expect(speaking).toEqual([]); // nunca anunciou fala depois do stop
  });

  it('um clipe que chega tarde ainda entra no cache: a pergunta não é re-baixada', async () => {
    const { tts, fetch } = build();

    tts.speak(Q, 'pt-BR'); // fetch em voo
    tts.stop(); // o ouvinte saiu antes de o clipe chegar
    await settle();

    tts.speak(Q, 'pt-BR'); // volta para a mesma pergunta
    await settle();

    expect(fetch).toHaveBeenCalledTimes(1); // o clipe valia, tenha ou não quem ouvir
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

  it('um 200 que não é áudio (proxy servindo HTML) cai no fallback em vez de silenciar o guia', async () => {
    // fetch passa, blob() passa, createObjectURL passa — e o <audio> falha ao decodificar.
    // Sem isto o guia fica mudo a entrevista inteira, com o clipe ruim ainda cacheado.
    const { tts, fallback } = build();

    tts.speak(Q, 'pt-BR');
    await settle();
    FakeAudio.instances[0]!.onerror?.();

    expect(fallback.spoken).toEqual([{ text: Q, lang: 'pt-BR' }]);
  });

  it('o clipe que falhou não fica cacheado: a mesma pergunta tenta a API de novo', async () => {
    const { tts, fetch } = build();

    tts.speak(Q, 'pt-BR');
    await settle();
    FakeAudio.instances[0]!.onerror?.();

    tts.speak(Q, 'pt-BR');
    await settle();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('o erro de um clipe obsoleto não faz o guia falar a pergunta anterior', async () => {
    const { tts, fallback } = build();

    tts.speak('primeira');
    await settle();
    const stale = FakeAudio.instances[0]!;
    tts.speak('segunda'); // o ouvinte avançou
    await settle();

    stale.onerror?.(); // o <audio> abandonado falha agora

    expect(fallback.spoken).toEqual([]);
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
    expect(FakeAudio.instances[1]!.playCalls).toHaveLength(1); // `paused` nasce false: não prova nada
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
