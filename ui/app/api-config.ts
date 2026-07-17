/**
 * Configuração de ambiente da API real (ENG-247). Lida UMA vez na carga pelo
 * composition root; os adapters nunca leem env — recebem baseUrl/token injetados.
 *
 * Por ora o modo `real` governa AUTH (login real por e-mail no tripod-api) e a base
 * do TTS (voz ElevenLabs da plataforma). Sessões, bucket e áudio seguem fixture até
 * o restante da ENG-247 — a troca é por adapter, atrás da mesma flag.
 */

export const API_MODE: 'real' | 'fixture' =
  import.meta.env.VITE_API_MODE === 'real' ? 'real' : 'fixture';

/** Base da API com o prefixo /api (ex.: https://tripod-backend-….run.app/api). */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(
  /\/$/,
  '',
);
