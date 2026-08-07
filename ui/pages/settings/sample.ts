import type { BucketAudio, GranularityLevel } from '../../../contracts';
import type { GranularityResolution } from '../../../adapters/granularity';

/**
 * A amostra da granularidade (decisão do dono, 2026-08-06).
 *
 * Escolher o tamanho da conta olhando um cordão de contas inventadas pede um ato de
 * fé: ninguém sabe o que "Pequena" significa até ouvir. A amostra troca a fé por
 * evidência — o MESMO trecho de áudio do projeto, e a quantidade de contas que cada
 * nível produz nele. Pequena mostra muitas contas, Grande mostra poucas, e a pessoa
 * decide ouvindo em vez de adivinhando.
 *
 * Núcleo puro: só aritmética de grade. Quem busca bytes, decodifica e toca é a
 * página — aqui não entra IO nenhum, e por isso isto se testa sem montar tela.
 */

/**
 * Quantos segundos do começo do áudio a amostra usa. Só o INÍCIO (decisão do dono):
 * o suficiente para o ouvido pegar o ritmo das contas, curto o bastante para repetir
 * nos três níveis sem virar espera.
 */
export const SAMPLE_SEC = 6;

/**
 * Teto de contas desenhadas. Um acousteme muito fino resolveria para uma conta de
 * poucos milissegundos e a amostra viraria uma régua ilegível — o cordão é para dar
 * a NOÇÃO da densidade, não para contar uma a uma.
 */
export const SAMPLE_BEAD_CAP = 60;

/**
 * O áudio que vira amostra: o PRIMEIRO da listagem (decisão do dono). A ordem é a
 * que o bucket devolve — a mesma que a Setup mostra, então a amostra é o áudio que a
 * pessoa vê no topo da lista, não um sorteado.
 */
export function sampleAudio(audios: readonly BucketAudio[] | null): BucketAudio | null {
  return audios?.[0] ?? null;
}

/**
 * Quantas contas o trecho de amostra tem no nível dado. Piso de 1: um `beadSec` maior
 * que a amostra ainda é uma conta — dizer "zero contas" seria falso e deixaria o
 * cordão vazio justamente no nível mais grosso, que é o que ele deveria ilustrar.
 */
export function sampleBeadCount(beadSec: number, sampleSec: number = SAMPLE_SEC): number {
  if (!(beadSec > 0) || !(sampleSec > 0)) return 0;
  return Math.min(SAMPLE_BEAD_CAP, Math.max(1, Math.floor(sampleSec / beadSec + 1e-9)));
}

/**
 * O tamanho de desenho da conta, para o cordão caber na largura do cartão: quanto
 * mais contas, menor cada uma. Decoração — o cordão é `aria-hidden`.
 */
export function sampleBeadSize(count: number): number {
  if (count <= 14) return 27;
  if (count <= 24) return 18;
  if (count <= 36) return 13;
  return 9;
}

/** Resolve o nível para o beadSec da amostra, com o acousteme do áudio escolhido. */
export function resolveSample(
  resolve: (level: GranularityLevel, acousteme: BucketAudio['acousteme']) => GranularityResolution,
  level: GranularityLevel,
  audio: BucketAudio | null,
): number | null {
  if (!audio) return null;
  const { beadSec } = resolve(level, audio.acousteme ?? null);
  return beadSec > 0 ? beadSec : null;
}
