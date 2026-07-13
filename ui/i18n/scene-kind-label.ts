import { skEnShort, skShort } from '../../domain';

/**
 * Rótulo EXIBIDO de um `scene_kind`, por idioma da UI (ENG-279).
 *
 * O `value` inglês (`GLEANING_SCENE`) é o contrato com o Compilador e NUNCA muda —
 * isto aqui é só display. PT usa `skShort` (rótulo PT-BR, com fallback inglês); EN usa
 * `skEnShort`, o MESMO inglês curto que o relatório já emite. Nada em `domain/` muda,
 * e o caminho do artefato continua chamando `skShort` direto: o golden segue idêntico.
 */
export function sceneKindLabel(value: string, lang: string): string {
  return lang.startsWith('en') ? skEnShort(value) : skShort(value);
}
