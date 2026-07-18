import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { AudioDecodeError, FixtureAudioEngine, type AudioEngine } from '../../../adapters/audio';
import { FixtureBucketSource, type BucketSource } from '../../../adapters/bucket';
import { AcoustemeGranularityResolver } from '../../../adapters/granularity';
import { FixtureSessionStore } from '../../../adapters/sessions';
import { sessionStore } from '../../state';
import { pt } from '../../i18n/pt';
import setupCss from './setup.css?raw';
import Setup from './index';

/**
 * Estação Setup (PRD v2 §8.1): escolha de áudio do bucket + nível de granularidade +
 * consentimento → decode → grade + manifest_id → sessão criada → Escuta 1. Portas
 * fixture por prop; o hash conhecido bate com o PCM determinístico das fixtures.
 */

// Hash FNV-1a esperado do PCM da fixture `conto-do-boto` (seed 101, 24000 amostras,
// 8000 Hz) com beadSec 0.5 (Média: 25 frames × 20 ms, regra O8) — valor de referência
// independente, computado da fórmula do domínio.
const BOTO_MEDIA_HASH = 'fnv1a32:9943a4ff';

interface Ports {
  bucket: BucketSource;
  resolver: AcoustemeGranularityResolver;
  audioEngine: AudioEngine;
  store: FixtureSessionStore;
  navigate: Mock<(to: string) => void>;
}

function ports(over: Partial<Ports> = {}): Ports {
  return {
    bucket: new FixtureBucketSource(),
    resolver: new AcoustemeGranularityResolver(),
    audioEngine: new FixtureAudioEngine(),
    store: new FixtureSessionStore(),
    navigate: vi.fn<(to: string) => void>(),
    ...over,
  };
}

function renderSetup(p: Ports) {
  return render(
    <Setup
      bucket={p.bucket}
      resolver={p.resolver}
      audioEngine={p.audioEngine}
      store={p.store}
      navigate={p.navigate}
    />,
  );
}

/** Escolhe um áudio do bucket pelo nome de arquivo (aguarda a listagem). */
async function pickAudio(filename: string): Promise<void> {
  const radio = await screen.findByRole('radio', { name: new RegExp(escapeRe(filename)) });
  await userEvent.click(radio);
}

async function confirmConsent(): Promise<void> {
  await userEvent.click(screen.getByRole('checkbox'));
}

beforeEach(() => {
  window.history.replaceState({}, '', '/setup');
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
});
afterEach(() => window.history.replaceState({}, '', '/'));

describe('Setup — eyebrow cerimonial (redesign design parity Fase 3)', () => {
  it('mostra o eyebrow cerimonial "Preparação"', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });
    expect(screen.getByText('Preparação')).toBeTruthy();
  });
});

describe('Setup — criação de sessão (§8.1)', () => {
  it('áudio + nível + consentimento cria a sessão com grade + manifest_id e vai para Escuta 1', async () => {
    const p = ports();
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav'); // média é o nível default
    await confirmConsent();
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    await waitFor(() => expect(p.navigate).toHaveBeenCalled());

    // SessionStore.create recebeu o manifest_id calculado pelo domínio + o fallback
    // do título a partir do nome do arquivo.
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        manifestId: BOTO_MEDIA_HASH,
        beadSec: 0.5,
        granularityLevel: 'medium',
        audioId: 'aud_conto_do_boto',
        storyName: 'conto-do-boto',
        storySlug: 'conto-do-boto',
        pipelineConsent: true,
      }),
    );

    // A sessão viva do domínio existe com grade e cai em Escuta 1 (modo escuta +
    // colar não confirmado é o discriminador escuta1 vs escuta2 no shell).
    const s = sessionStore.getState().session;
    expect(s?.beads.length).toBeGreaterThan(0);
    expect(s?.mode).toBe('escuta');
    expect(s?.whole.confirmed).toBe(false);

    // Navegou para a rota da sessão e o estado inicial ficou persistido (retomável),
    // com o manifest_id calculado pelo domínio.
    const to = p.navigate.mock.calls[0]![0] as string;
    expect(to).toMatch(/^\/session\/.+/);
    const id = to.split('/').pop()!;
    const dto = await p.store.load(id);
    expect(dto.manifestId).toBe(BOTO_MEDIA_HASH);
  });

  it('um título digitado vence o fallback do nome do arquivo', async () => {
    const p = ports();
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav');
    await userEvent.type(screen.getByRole('textbox'), 'jesus-mienoi');
    await confirmConsent();
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ storyName: 'jesus-mienoi', storySlug: 'jesus-mienoi' }),
    );
  });
});

describe('Setup — validação (§8.1)', () => {
  it('listagem do bucket que FALHA mostra o aviso em vez de prender a tela (ENG-247)', async () => {
    const quebrado: BucketSource = {
      list: () => Promise.reject(new Error('HTTP 401 na listagem do bucket')),
      fetchBytes: () => Promise.reject(new Error('sem áudio')),
    };
    renderSetup(ports({ bucket: quebrado }));

    expect(await screen.findByText(pt.setup.bucketError)).toBeTruthy();
  });

  it('sem áudio, orienta a escolher primeiro e não cria', async () => {
    const p = ports();
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);
    await screen.findByRole('radio', { name: /conto-do-boto/ }); // listagem pronta

    await confirmConsent();
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    expect(await screen.findByText('Escolha um arquivo de áudio primeiro.')).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('sem confirmar o consentimento de pipeline, bloqueia a criação', async () => {
    const p = ports();
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav');
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    expect(
      await screen.findByText('Confirme o consentimento de uso no pipeline para continuar.'),
    ).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('falha de decodificação mostra a cópia PT-BR e não cria', async () => {
    const audioEngine: AudioEngine = {
      decode: () => Promise.reject(new AudioDecodeError('formato ruim')),
      createPlayer: () => {
        throw new Error('não deve criar player');
      },
      setGain: () => {},
    };
    const p = ports({ audioEngine });
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav');
    await confirmConsent();
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    expect(
      await screen.findByText(
        'Não consegui decodificar este áudio (formato ruim). Tente um WAV PCM.',
      ),
    ).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('uma falha de sistema ao criar mostra orientação e reabilita o botão (não trava)', async () => {
    const fixtureList = new FixtureBucketSource();
    const bucket = {
      list: () => fixtureList.list(),
      fetchBytes: () => Promise.reject(new Error('rede caiu')),
    } as unknown as FixtureBucketSource;
    const p = ports({ bucket });
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav');
    await confirmConsent();
    const btn = screen.getByRole('button', { name: /criar a sessão/i });
    await userEvent.click(btn);

    expect(await screen.findByText('Não foi possível criar a sessão. Tente de novo.')).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(false); // não latcheou em "Criando…"
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('um resolver que não devolve tamanho de conta positivo bloqueia a criação', async () => {
    const resolver = { resolve: () => ({ beadSec: 0 }) };
    const p = ports({ resolver: resolver as unknown as AcoustemeGranularityResolver });
    const createSpy = vi.spyOn(p.store, 'create');
    renderSetup(p);

    await pickAudio('conto-do-boto.wav');
    await confirmConsent();
    await userEvent.click(screen.getByRole('button', { name: /criar a sessão/i }));

    expect(
      await screen.findByText('Não consegui definir o tamanho da conta para este áudio.'),
    ).toBeTruthy();
    expect(createSpy).not.toHaveBeenCalled();
  });
});

describe('Setup — consentimento de coleta (§12/O6)', () => {
  it('indica consentimento presente e avisa quando ausente', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });

    const present = screen.getByRole('radio', { name: /conto-do-boto/ });
    // badge curto (ENG-310): a frase contratual completa segue no title/aria
    expect(within(present).getByTitle('Consentimento de coleta registrado')).toBeTruthy();

    const absent = screen.getByRole('radio', { name: /gravacao-antiga/ });
    expect(within(absent).getByTitle('Sem registro de consentimento de coleta.')).toBeTruthy();
  });
});

describe('Setup — granularidade por nível, sem campo numérico (§8.1)', () => {
  it('não existe campo numérico de segundos por conta', async () => {
    const { container } = renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });
    expect(container.querySelector('input[type="number"]')).toBeNull();
  });

  it('exatamente três cards de nível, navegáveis por teclado', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });

    const group = screen.getByRole('radiogroup', { name: /tamanho da conta/i });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);

    const media = within(group).getByRole('radio', { name: 'Média' });
    expect(media.getAttribute('aria-checked')).toBe('true'); // média é o default
    await userEvent.click(media); // foca o item marcado (roving)
    await userEvent.keyboard('{ArrowRight}'); // seta move o foco para Grande
    expect(within(group).getByRole('radio', { name: 'Grande' })).toBe(document.activeElement);
    await userEvent.keyboard(' '); // espaço confirma a seleção do item focado
    await waitFor(() =>
      expect(
        within(group).getByRole('radio', { name: 'Grande' }).getAttribute('aria-checked'),
      ).toBe('true'),
    );
  });
});

describe('Setup — cópias fixadas (§8.1/O7)', () => {
  it('mostra a linha de confiança e a nota de trava da conta', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });
    expect(screen.getByText(pt.setup.trustLine)).toBeTruthy();
    expect(screen.getByText(pt.setup.gridWarning)).toBeTruthy();
  });

  it('divulga que a voz do guia é sintética (§12; exigência da policy da ElevenLabs)', async () => {
    renderSetup(ports());
    await screen.findByRole('radio', { name: /conto-do-boto/ });
    expect(screen.getByText(pt.setup.aiVoiceNotice)).toBeTruthy();
  });
});

describe('Setup — grid compacto de áudios (ENG-310)', () => {
  it('a lista é um grid responsivo, não uma coluna única', () => {
    const rule = /\.cds-setup-audios\s*{[^}]*}/.exec(setupCss)?.[0] ?? '';
    expect(rule).toContain('display: grid');
    expect(rule).toContain('auto-fill');
  });
});

describe('Setup — portas de entrada (§8.9, ENG-311)', () => {
  it('“entrega” e “retorno” ficam visíveis mas DESABILITADAS — clicar não sai do zero', async () => {
    const p = ports();
    renderSetup(p);

    const entrega = screen.getByRole('radio', { name: /confirmar uma entrega/i });
    const retorno = screen.getByRole('radio', { name: /retomar um retorno/i });
    expect((entrega as HTMLButtonElement).disabled).toBe(true);
    expect((retorno as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(entrega);
    // a porta do zero segue selecionada: o formulário de criar continua na tela
    expect(await screen.findByRole('heading', { name: /escolha um áudio/i })).toBeTruthy();
  });

  it('a lista de áudios mostra esqueleto enquanto o bucket responde (ENG-311)', async () => {
    const bucket = new FixtureBucketSource();
    const real = bucket.list.bind(bucket);
    let release: (() => void) | null = null;
    vi.spyOn(bucket, 'list').mockImplementation(
      () =>
        new Promise((res) => {
          release = () => void real().then(res);
        }),
    );
    renderSetup(ports({ bucket }));

    expect(document.querySelectorAll('.cds-skeleton').length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toBeTruthy();

    await act(async () => release?.());
    expect(await screen.findByRole('radio', { name: /conto-do-boto/ })).toBeTruthy();
    expect(document.querySelectorAll('.cds-skeleton')).toHaveLength(0);
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
