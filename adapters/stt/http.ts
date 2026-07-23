/**
 * Transcriber real sobre o job assíncrono da API (ENG-325, tripod-api PR #123): a
 * transcrição + tradução das respostas gravadas roda NO SERVIDOR — a chave do provedor
 * nunca chega ao navegador, e o trabalho é lento demais para o SPA segurar. O SPA só
 * dispara e consulta.
 *
 * Dois verbos no mesmo caminho `/api/sound-necklace/sessions/{id}/transcriptions`:
 * - `POST {language, force}` enfileira (202) — idempotente; `force` reprocessa uma
 *   resposta regravada. `paths` da porta são ignorados aqui: o servidor deriva as
 *   respostas gravadas da própria sessão. `language` é o locale BCP-47 da entrevista
 *   (o SPA é quem sabe em que língua as perguntas foram feitas).
 * - `GET` devolve o progresso: `{total, ready, failed, pending, answers[]}`. `done` é
 *   `pending === 0`; uma resposta com falha é uma linha `failed`, nunca o job inteiro.
 *
 * A resposta é JSON, então validamos com um schema Zod LOCAL do adapter — o snapshot
 * OpenAPI de `contracts/` (camada congelada) não precisa mudar por isto, no mesmo
 * espírito do TTS (que evitou DTO devolvendo bytes crus).
 *
 * `fetch`/`token`/`onUnauthorized` são injetados pelo composition root (ENG-247); os
 * testes de `adapters/` rodam em node com um `fetch` fake, sem rede.
 */

import { z } from 'zod';

import type { AnswerDraft, Transcriber, TranscriptionProgress } from './types';

const AnswerSchema = z.object({
  path: z.string(),
  status: z.enum(['pending', 'ready', 'failed']),
  transcript_source: z.string().nullable().optional(),
  translation_en: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});

const ProgressSchema = z.object({
  total: z.number(),
  ready: z.number(),
  failed: z.number(),
  pending: z.number(),
  answers: z.array(AnswerSchema),
});

export interface HttpSttDeps {
  /** Base compartilhada terminada em `/api`; as rotas daqui somam `/sound-necklace`. */
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  /** Locale BCP-47 da entrevista (`pt-BR`/`en-US`) — o servidor exige. */
  language: () => string;
  /** Token Bearer atual (do AuthProvider). */
  token?: () => string | null;
  /** 401 = sessão caducada — o wiring decide (renova ou volta ao login). */
  onUnauthorized?: () => void;
}

export class HttpTranscriber implements Transcriber {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #language: () => string;
  readonly #token?: () => string | null;
  readonly #onUnauthorized?: () => void;

  constructor(deps: HttpSttDeps) {
    this.#baseUrl = deps.baseUrl.replace(/\/$/, '');
    this.#fetch = deps.fetch;
    this.#language = deps.language;
    this.#token = deps.token;
    this.#onUnauthorized = deps.onUnauthorized;
  }

  #url(sessionId: string): string {
    return `${this.#baseUrl}/sound-necklace/sessions/${encodeURIComponent(sessionId)}/transcriptions`;
  }

  #headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = this.#token?.();
    if (token) headers['authorization'] = `Bearer ${token}`;
    return headers;
  }

  async start(
    sessionId: string,
    _paths: readonly string[],
    opts?: { force?: boolean },
  ): Promise<void> {
    const res = await this.#fetch(this.#url(sessionId), {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify({ language: this.#language(), force: opts?.force ?? false }),
    });
    if (res.status === 401) this.#onUnauthorized?.();
    if (!res.ok) throw new Error(`POST ${this.#url(sessionId)} → ${res.status}`);
  }

  async progress(sessionId: string): Promise<TranscriptionProgress> {
    const res = await this.#fetch(this.#url(sessionId), { headers: this.#headers() });
    if (res.status === 401) this.#onUnauthorized?.();
    // rejeita no não-ok: o hook (@/ui/pages/report/use-stt-drafts) trata como "ainda
    // rodando" e re-tenta, em vez de ler lixo como job concluído
    if (!res.ok) throw new Error(`GET ${this.#url(sessionId)} → ${res.status}`);

    const data = ProgressSchema.parse(await res.json());
    const drafts: Record<string, AnswerDraft> = {};
    for (const a of data.answers) {
      // só a resposta PRONTA vira rascunho; pendente ou com falha não tem inglês, e a
      // pessoa a resolve digitando — o gate de exportação já cobre isso
      if (a.translation_en != null) {
        drafts[a.path] = { source: a.transcript_source ?? '', en: a.translation_en };
      }
    }
    return { done: data.pending === 0, drafts };
  }
}
