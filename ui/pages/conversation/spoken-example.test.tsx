import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O «Como assim?» (ENG-611) numa pergunta que TEM exemplo escrito.
 *
 * O roteiro congelado ainda não tem exemplo nenhum — a Márcia não os escreveu —
 * e essa ausência é o estado correto (a guarda dela vive em `conversation.test.tsx`).
 * Para provar o mecanismo é preciso uma pergunta com exemplo, então este arquivo
 * INJETA uma: substitui o módulo do roteiro por uma cópia com `example` na primeira
 * pergunta de nível 1. Não havia precedente nesta pasta; o mais próximo no repo é o
 * `vi.mock` com `importOriginal` de `ui/app/App.test.tsx`. O que se dubla é o DADO
 * congelado (uma fixture do roteiro), nunca o comportamento sob teste: a decisão de
 * mostrar e a fala continuam sendo as reais, medidas pela porta de voz de verdade.
 */
const EXAMPLE = vi.hoisted(() => ({
  pt: 'Por exemplo: era uma vez um menino que morava perto do rio.',
}));

vi.mock('../../../domain/mapeamento-scripts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../domain/mapeamento-scripts')>();
  return {
    ...real,
    L1_Q: real.L1_Q.map((q, i) => (i === 0 ? { ...q, example: EXAMPLE.pt } : q)),
  };
});

const { FixtureSpeechSynthesizer } = await import('../../../adapters/tts/fixture');
const { buildBeads, createSession } = await import('../../../domain');
const { NavFooterOutlet, NavFooterProvider } =
  await import('../../organisms/nav-footer/nav-footer');
const { appStore, sessionStore } = await import('../../state');
const { default: Conversation } = await import('./index');

const DURATION = 7.5;
const BEAD_SEC = 0.25;

/** Sessão em Mapeamento — só o nível 1 interessa aqui (a pergunta com exemplo é a 1ª). */
function loadMapping(): void {
  const base = createSession({
    durationSec: DURATION,
    beadSec: BEAD_SEC,
    beads: buildBeads(DURATION, BEAD_SEC),
    manifestId: 'fnv1a32:00000000',
    audioFilename: 'historia.wav',
    slug: 'historia',
  });
  sessionStore.getState().load({
    ...base,
    whole: { ...base.whole, confirmed: true },
    partsConfirmed: true,
    mode: 'mapeamento',
    parts: [
      {
        part_id: 'PT1',
        span: { s: 2, e: 8 },
        locked: true,
        scene_kind: 'BIRTH_SCENE',
        scene_kind_confidence: 'high',
        tag_state: 'tagged',
      },
    ],
    frases: [],
  });
}

/**
 * A conversa abre pedindo o modo (ENG-649) e escolher é a única saída. Aqui é
 * "Mãos livres", porque o segundo caso mede a fala de CHEGADA — a que só existe
 * nesse modo — e o primeiro precisa da mesma tela para tocar o «Como assim?».
 */
function renderConversation(speaker: InstanceType<typeof FixtureSpeechSynthesizer>) {
  const view = render(
    <NavFooterProvider>
      <Conversation speaker={speaker} />
      <NavFooterOutlet />
    </NavFooterProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Mãos livres/ }));
  return view;
}

beforeEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
  if (appStore.getState().muted) appStore.getState().toggleMuted(); // som LIGADO por padrão
});
afterEach(() => {
  sessionStore.setState({ session: null, review: false, lock: null, online: true });
  if (appStore.getState().muted) appStore.getState().toggleMuted();
});

describe('Conversation — o «Como assim?» na pergunta que tem exemplo (ENG-611)', () => {
  it('o link aparece e, ao ser tocado, pede à porta de voz a fala DAQUELE exemplo', async () => {
    const tts = new FixtureSpeechSynthesizer();
    loadMapping();
    renderConversation(tts);

    await userEvent.click(screen.getByRole('button', { name: 'Como assim?' }));

    expect(tts.spoken.at(-1)).toEqual({ text: EXAMPLE.pt, lang: 'pt-BR' });
  });

  it('chegar na pergunta fala a PERGUNTA e não o exemplo — a ajuda é opcional', () => {
    const tts = new FixtureSpeechSynthesizer();
    loadMapping();
    renderConversation(tts);

    expect(tts.spoken.map((u) => u.text)).not.toContain(EXAMPLE.pt);
  });
});
