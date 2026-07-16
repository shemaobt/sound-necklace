import type { UiSound } from './types';

/**
 * UiSound que não toca nada. É a fixture (testes e2e/unit rodam mudos) E o modo
 * mudo do cabeçalho: silenciar é trocar a porta, não espalhar `if (muted)` por
 * cada chamador.
 */
export class SilentUiSound implements UiSound {
  lock(): void {}
  advance(): void {}
  refuse(): void {}
  tap(): void {}
  recordStart(): void {}
  recordStop(): void {}
  saved(): void {}
}
