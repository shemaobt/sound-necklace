/**
 * FixtureBucketSource — o BucketSource default headless (§7.4). Os bytes que
 * `fetchBytes` devolve são o formato que o FixtureAudioEngine decodifica (PcmSpec
 * JSON), então o fluxo fixture Setup→decode→grade→hash roda ponta a ponta sem rede.
 */

import { describe, expect, it } from 'vitest';

import { BucketAudioSchema } from '../../contracts';
import { FixtureAudioEngine } from '../audio';
import { FixtureBucketSource } from './fixture';
import { BucketAudioNotFoundError } from './types';

describe('FixtureBucketSource.list', () => {
  it('lista áudios que validam contra o contrato do bucket', async () => {
    const audios = await new FixtureBucketSource().list();

    expect(audios.length).toBeGreaterThanOrEqual(2);
    for (const audio of audios) {
      expect(() => BucketAudioSchema.parse(audio)).not.toThrow();
    }
  });

  it('cobre os dois eixos que a Setup exercita: consentimento presente/ausente e acousteme presente/nulo', async () => {
    const audios = await new FixtureBucketSource().list();

    expect(audios.some((a) => a.consent_present === true)).toBe(true);
    expect(audios.some((a) => a.consent_present === false)).toBe(true);
    expect(audios.some((a) => a.acousteme !== null)).toBe(true);
    expect(audios.some((a) => a.acousteme === null)).toBe(true);
  });

  it('não vaza a referência interna (custódia opaca): mutar o resultado não afeta a próxima listagem', async () => {
    const source = new FixtureBucketSource();
    const first = await source.list();
    first[0]!.filename = 'MUTADO.wav';

    const second = await source.list();
    expect(second[0]!.filename).not.toBe('MUTADO.wav');
  });
});

describe('FixtureBucketSource.fetchBytes', () => {
  it('devolve bytes que o engine de áudio fixture decodifica com a duração anunciada', async () => {
    const source = new FixtureBucketSource();
    const [audio] = await source.list();

    const bytes = await source.fetchBytes(audio!.id);
    const decoded = await new FixtureAudioEngine().decode(bytes);

    expect(decoded.duration).toBeCloseTo(audio!.duration_sec!, 6);
  });

  it('é determinístico: duas buscas do mesmo id devolvem os mesmos bytes', async () => {
    const source = new FixtureBucketSource();
    const { id } = (await source.list())[0]!;

    const a = new Uint8Array(await source.fetchBytes(id));
    const b = new Uint8Array(await source.fetchBytes(id));

    expect([...a]).toEqual([...b]);
  });

  it('lança BucketAudioNotFoundError para um id desconhecido', async () => {
    const source = new FixtureBucketSource();

    await expect(source.fetchBytes('nao-existe')).rejects.toBeInstanceOf(BucketAudioNotFoundError);
  });
});
