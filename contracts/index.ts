/**
 * contracts/ — DTOs validados por schema + mappers (camada CONGELADA, CLAUDE.md).
 * Módulos chegam pelas issues E1: ENG-227 (manifesto/retorno/serializer),
 * ENG-233 (relatório .md), ENG-234 (session-state + imports), ENG-235 (API/bucket).
 * Importa apenas domain/ (+ zod, raiz "zod" somente).
 */
export const CONTRACTS_LAYER = 'contracts' as const;
