/**
 * Resolução default das portas de Configurações (ENG-352). O store é o MESMO singleton
 * app-global que o Setup usa — as duas telas precisam ver a mesma decisão, e na fixture
 * "a mesma" só existe se for a mesma instância.
 *
 * Nos testes a página recebe as portas por prop — estes defaults só valem em produção,
 * então ficam sem cobertura de teste de propósito.
 */

import type { ProjectSettingsStore } from '../../../adapters/project-settings';
import { API_MODE } from '../../app/api-config';
import { canEditProjectGranularity } from '../../app/bucket-adapter';
import { appProjectSettings } from '../../app/project-settings-adapter';

export { defaultProjectId } from '../setup/ports';

export function defaultProjectSettings(): ProjectSettingsStore {
  return appProjectSettings();
}

/**
 * Quem pode confirmar a granularidade: no modo real o papel vem de `my-project-roles`;
 * na fixture pode sempre, senão o app sem API não passaria da primeira tela.
 */
export function defaultCanEdit(projectId: string): Promise<boolean> {
  return API_MODE === 'real' ? canEditProjectGranularity(projectId) : Promise.resolve(true);
}
