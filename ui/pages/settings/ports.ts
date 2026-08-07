/**
 * Resolução default das portas de Configurações (ENG-352). O store é o MESMO singleton
 * app-global que o Setup usa — as duas telas precisam ver a mesma decisão, e na fixture
 * "a mesma" só existe se for a mesma instância.
 *
 * Nos testes a página recebe as portas por prop — estes defaults só valem em produção,
 * então ficam sem cobertura de teste de propósito.
 */

import type { ProjectSettingsStore } from '../../../adapters/project-settings';
import { appProjectSettings } from '../../app/project-settings-adapter';

// O papel é o mesmo nas duas telas: a trava do Setup (ENG-363) o lê para escolher a
// variante, esta tela para oferecer ou não a confirmação. Uma definição só.
// O bucket, o motor de áudio e o resolvedor também: a amostra da granularidade ouve o
// MESMO primeiro áudio que a Setup lista, resolvido pela MESMA regra O8.
export {
  defaultAudioEngine,
  defaultBucket,
  defaultCanEdit,
  defaultProjectId,
  defaultResolver,
} from '../setup/ports';

export function defaultProjectSettings(): ProjectSettingsStore {
  return appProjectSettings();
}
