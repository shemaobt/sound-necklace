/**
 * ui/organisms — composições que consomem estado do domínio via props/hooks.
 * Podem importar tipos de domain/ e os barrels de atoms/molecules/tokens; nunca
 * adapters (dependency-cruiser garante). Consumidores (pages/templates) importam
 * DESTE barrel; irmãos importam-se por caminho direto.
 */
export { Necklace, type NecklaceProps, type NecklaceSegment } from './necklace/necklace';
