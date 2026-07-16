/**
 * Auto-registro do adapter de som de UI (docs/architecture.md §4). A fixture é a
 * silenciosa: testes e2e/unit rodam mudos sem precisar saber que este adapter
 * existe. O composition root liga a real e volta à silenciosa quando o
 * cabeçalho está mudo.
 */

import { SilentUiSound } from './silent';
import type { UiSound } from './types';
import { WebAudioUiSound } from './web-audio';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<UiSound> = {
  port: 'ui-sound',
  fixture: () => new SilentUiSound(),
  real: () => new WebAudioUiSound(),
};

export default registration;
