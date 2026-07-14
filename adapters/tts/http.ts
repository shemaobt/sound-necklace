/**
 * SpeechSynthesizer real sobre o serviço de TTS da plataforma (ENG-283): as perguntas
 * da entrevista são faladas por uma voz ElevenLabs, sintetizada e cacheada na API, não
 * no navegador. O SPA NUNCA fala com a ElevenLabs — só com a nossa API (PRD v2 §12:
 * nenhum terceiro no caminho dos dados da sessão).
 *
 * `POST /platform/tts/speak {text, language}` devolve `audio/mpeg` cru — sem envelope
 * JSON, portanto sem DTO novo em `contracts/` (camada congelada). O `language` viaja
 * como locale BCP-47 completo (`pt-BR`/`en-US`): o mapa locale→voz vive na API.
 *
 * `fallback` é o Web Speech (web.ts): se a API não responde, ainda não está deployada,
 * ou devolve erro, o guia continua falando. A porta nunca fica muda.
 *
 * As dependências de plataforma são injetáveis — os testes de `adapters/` rodam em
 * node, onde não existem `Audio` nem `URL.createObjectURL`.
 */

import { DEFAULT_SPEECH_LANG, type SpeechSynthesizer, type Unsubscribe } from './types';

const TTS_PATH = '/platform/tts/speak';

export interface HttpSpeechDeps {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  /** Web Speech (web.ts) — assume quando a API falha. */
  fallback: SpeechSynthesizer;
  /** Token Bearer atual (do AuthProvider/ENG-239). */
  token?: () => string | null;
  AudioCtor?: typeof Audio;
  createObjectURL?: (blob: Blob) => string;
}

export class HttpSpeechSynthesizer implements SpeechSynthesizer {
  readonly #subs = new Set<(speaking: boolean) => void>();
  /**
   * `${lang}|${texto}` → objectURL. As 21 perguntas são strings congeladas
   * (domain/mapeamento-scripts.ts), então o mapa é limitado por natureza: reouvir uma
   * pergunta não rebaixa o clipe.
   *
   * ponytail: os objectURLs nunca são revogados — ~21 clipes × ~80 KB vivem enquanto a
   * aba viver. Se um dia o texto falado deixar de ser um conjunto fechado, revogar no
   * despejo de um LRU.
   */
  readonly #clips = new Map<string, string>();
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #fallback: SpeechSynthesizer;
  readonly #token?: () => string | null;
  readonly #AudioCtor?: typeof Audio;
  readonly #createObjectURL?: (blob: Blob) => string;

  #audio: HTMLAudioElement | null = null;
  #speaking = false;
  /** Geração da fala em curso: uma resposta que chega tarde (o ouvinte já avançou) é descartada. */
  #generation = 0;
  /**
   * O endpoint não EXISTE (404/501) — não insista a cada pergunta. Só falhas estruturais
   * prendem aqui; rede, 401 e 500 são transitórios (ver #load).
   *
   * ponytail: prende pela vida da aba. Uma aba aberta ATRAVÉS do deploy do backend segue na
   * voz robótica do navegador até um F5 — aceitável para uma entrevista de uma sentada. Se
   * incomodar, zere a trava no evento `online` ou num TTL curto.
   */
  #apiDown = false;

  constructor(deps: HttpSpeechDeps) {
    this.#baseUrl = deps.baseUrl.replace(/\/$/, '');
    this.#fetch = deps.fetch;
    this.#fallback = deps.fallback;
    this.#token = deps.token;
    this.#AudioCtor = deps.AudioCtor ?? (typeof Audio !== 'undefined' ? Audio : undefined);
    this.#createObjectURL =
      deps.createObjectURL ??
      (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? (blob: Blob) => URL.createObjectURL(blob)
        : undefined);

    // A fala do fallback também precisa acender o lip-sync do guia.
    this.#fallback.onSpeaking((speaking) => this.#emit(speaking));
  }

  speak(text: string, lang: string = DEFAULT_SPEECH_LANG): void {
    this.#cancel();
    const generation = ++this.#generation;

    if (this.#apiDown || !this.#AudioCtor || !this.#createObjectURL) {
      this.#fallback.speak(text, lang);
      return;
    }

    const key = `${lang}|${text}`;
    const cached = this.#clips.get(key);
    if (cached !== undefined) {
      this.#play(cached, text, lang);
      return;
    }

    void this.#load(text, lang).then((url) => {
      // Cacheia ANTES de checar a geração: o clipe é válido tenha ou não quem ouvir agora.
      // Descartá-lo porque o ouvinte avançou vazaria o objectURL e re-baixaria a mesma
      // pergunta na próxima vez — e a chave é uma string congelada, esse é o ponto do cache.
      if (url !== null) this.#clips.set(key, url);

      if (generation !== this.#generation) return; // o ouvinte já avançou: não toca
      if (url === null) {
        this.#fallback.speak(text, lang);
        return;
      }
      this.#play(url, text, lang);
    });
  }

  stop(): void {
    this.#generation += 1; // invalida o que estiver em voo
    this.#cancel();
  }

  onSpeaking(cb: (speaking: boolean) => void): Unsubscribe {
    this.#subs.add(cb);
    return () => this.#subs.delete(cb);
  }

  /**
   * Busca o clipe na API. NUNCA rejeita — `null` = não deu, e o chamador cai no fallback.
   * (Um `throw` aqui viraria unhandled rejection lá no `speak`, e o guia emudeceria sem
   * fallback nenhum: `res.blob()` pode falhar mesmo depois de um `res.ok` verdadeiro.)
   */
  async #load(text: string, lang: string): Promise<string | null> {
    const token = this.#token?.();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['authorization'] = `Bearer ${token}`;

    try {
      const res = await this.#fetch(`${this.#baseUrl}${TTS_PATH}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text, language: lang }),
      });

      if (!res.ok) {
        // 404/501 = o endpoint NÃO EXISTE (dev sem backend, API ainda não deployada) e não
        // vai passar a existir no meio da sessão: desiste, para não pagar 21 POSTs mortos
        // numa entrevista. Um 401/500 é transitório — a próxima pergunta tenta de novo.
        if (res.status === 404 || res.status === 501) this.#apiDown = true;
        return null;
      }

      return this.#createObjectURL!(await res.blob());
    } catch {
      // Offline, DNS, CORS, corpo abortado. TRANSITÓRIO — não trava a API: o app é
      // online-only e a rede volta. Uma oscilação de Wi-Fi não pode degradar a voz do
      // guia pelo resto da entrevista; sem rede, o fetch falha rápido e barato.
      return null;
    }
  }

  #play(url: string, text: string, lang: string): void {
    const audio = new this.#AudioCtor!(url);
    this.#audio = audio;

    // A guarda `#audio !== audio` descarta eventos de um <audio> já abandonado: sem ela,
    // o erro tardio de um clipe obsoleto faria o guia falar a pergunta ANTERIOR.
    audio.onended = () => {
      if (this.#audio === audio) this.#emit(false);
    };

    // O <audio> falhou a decodificar bytes que a API deu como bons (200 com corpo que não
    // é áudio — proxy servindo HTML, resposta truncada). Isso É falha da API: descarta o
    // clipe ruim do cache e cai no fallback, senão o guia fica MUDO a entrevista inteira.
    audio.onerror = () => {
      if (this.#audio !== audio) return;
      this.#emit(false);
      this.#clips.delete(`${lang}|${text}`);
      this.#fallback.speak(text, lang);
    };

    // O autoplay bloqueado (sem gesto do usuário — ex.: reload direto na URL do
    // Mapeamento) REJEITA o play(). Isso NÃO é falha da API: não cai no fallback (que
    // sofre da mesma política), apenas não anuncia uma fala que não aconteceu. O botão
    // "Ouvir a pergunta" é um gesto e resolve.
    void audio.play().then(
      () => {
        if (this.#audio === audio) this.#emit(true);
      },
      () => {
        if (this.#audio === audio) this.#emit(false);
      },
    );
  }

  #cancel(): void {
    this.#fallback.stop();
    if (this.#audio) {
      this.#audio.pause();
      this.#audio.currentTime = 0;
      this.#audio = null;
    }
    this.#emit(false);
  }

  #emit(speaking: boolean): void {
    if (this.#speaking === speaking) return;
    this.#speaking = speaking;
    for (const cb of this.#subs) cb(speaking);
  }
}
