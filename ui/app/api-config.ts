/**
 * Configuração de ambiente da API real (ENG-247). Lida UMA vez na carga pelo
 * composition root; os adapters nunca leem env — recebem baseUrl/token injetados.
 *
 * O modo `real` governa TODAS as portas de IO: auth, TTS, bucket, sessões (estado,
 * artefatos, recursos de voz) e o engine de áudio — a troca é por adapter, atrás
 * desta mesma flag, nos singletons de ui/app e nas ports das páginas.
 */

export const API_MODE: 'real' | 'fixture' =
  import.meta.env.VITE_API_MODE === 'real' ? 'real' : 'fixture';

/** Base da API com o prefixo /api (ex.: https://tripod-backend-….run.app/api). */
export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(
  /\/$/,
  '',
);
