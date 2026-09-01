import { skEnShort, skShort } from '../../domain';

/**
 * Rótulo EXIBIDO de um `scene_kind`, por idioma da UI (ENG-279).
 *
 * O `value` inglês (`GLEANING_SCENE`) é o valor ARMAZENADO e NUNCA muda — isto aqui é
 * só display. PT usa `skShort` (rótulo PT-BR, com fallback inglês); EN usa `skEnShort`.
 * Nada em `domain/` muda: os dois rótulos já existiam lá, e a tela só escolhe qual
 * pedir. (O relatório que consumia `skEnShort` saiu na ENG-691; esta continua sendo a
 * única leitora dos dois.)
 */
export function sceneKindLabel(value: string, lang: string): string {
  return lang.startsWith('en') ? skEnShort(value) : skShort(value);
}
