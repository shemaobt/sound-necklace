/**
 * Auto-registro do adapter de TTS (docs/architecture.md §4): o composition root
 * (ENG-224) colhe todos os adapters/*\/register.ts via import.meta.glob e resolve
 * portas por nome — fixture é o default; o modo real liga por configuração de
 * ambiente (ENG-247).
 *
 * Ausência graciosa (§8.7): num ambiente sem a Web Speech API o default export é
 * `null` — a porta "tts" não entra na registry e o botão "Ouvir a pergunta"
 * (já plumbado na estação Conversa, ENG-249) fica oculto por ausência de porta.
 */

import { FixtureSpeechSynthesizer } from './fixture';
import type { SpeechSynthesizer } from './types';
import { speechSynthesisSupported, WebSpeechSynthesizer } from './web';

export interface AdapterRegistration<TPort> {
  port: string;
  fixture: () => TPort;
  real: () => TPort;
}

const registration: AdapterRegistration<SpeechSynthesizer> | null = speechSynthesisSupported()
  ? {
      port: 'tts',
      fixture: () => new FixtureSpeechSynthesizer(),
      real: () => new WebSpeechSynthesizer(),
    }
  : null;

export default registration;
