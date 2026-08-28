import { useEffect, useRef, useState } from 'react';

import type { SpeechSynthesizer } from '../../../adapters/tts/types';

/**
 * Os DOIS automatismos de "Mãos livres" que o dono ainda pode vetar (ENG-649):
 * falar a pergunta ao chegar nela, e abrir o microfone quando ela acaba de ser
 * falada. O protótipo v4 implementa só o terceiro — o avanço automático —, e a
 * cópia do cartão promete os três; publicar a promessa sem cumpri-la seria mentir
 * na tela de quem não pode conferir lendo. Então eles existem, e existem AQUI.
 *
 * O microfone que abre sem ninguém tocar tem uma aresta de privacidade, e o dono
 * foi avisado. Se o veto vier, o conserto é apagar este arquivo e as duas chamadas
 * em `QuestionScreen`: o pedido do modo, a pílula e o avanço automático não passam
 * por aqui e continuam de pé. Nada mais no app importa deste módulo — é essa
 * ausência de ramificações que faz o veto ser barato.
 */

/**
 * Fala a pergunta ao chegar nela, e cala ao sair (nada de voz órfã em cima da
 * pergunta seguinte). Sob "toque a toque" NÃO fala: o modo quieto é quieto — quem
 * quiser ouvir toca "Ouvir a pergunta", que continua sendo o mesmo caminho de fala.
 */
export function useSpeakOnArrival(params: {
  handsFree: boolean;
  speaker: SpeechSynthesizer | null;
  muted: boolean;
  text: string;
  lang: string;
}): void {
  const { handsFree, speaker, muted, text, lang } = params;
  useEffect(() => {
    if (!speaker || muted || !handsFree) return;
    speaker.speak(text, lang);
    return () => speaker.stop();
  }, [speaker, muted, handsFree, text, lang]);
}

/**
 * Abre o microfone sozinho, UMA vez por pergunta, quando a pergunta terminou de
 * ser falada — ou de imediato, quando não vai haver fala nenhuma (som desligado,
 * ambiente sem voz): esperar por um fim que nunca chega deixaria o mãos livres
 * parado para sempre.
 *
 * `ready` é a única trava, e é derivada: só o gravador PARADO e sem resposta em
 * risco a abre. É ela que impede a abertura por cima de uma gravação em curso
 * (perderia o que a pessoa está dizendo), por cima de uma resposta que já existe
 * (apagaria a que já foi dada, sem perguntar), durante a procura pela resposta
 * gravada e durante o salvamento.
 */
export function useOpenMicWhenSpoken(params: {
  handsFree: boolean;
  /** a pergunta já foi falada — ou não haverá fala para esperar */
  spoken: boolean;
  ready: boolean;
  open: () => void;
}): void {
  const { handsFree, spoken, ready, open } = params;
  const opened = useRef(false);
  useEffect(() => {
    if (!handsFree || !spoken || !ready || opened.current) return;
    opened.current = true;
    open();
  }, [handsFree, spoken, ready, open]);
}

/**
 * Se a fala desta pergunta já terminou. Medido pelas transições REAIS da porta
 * (`onSpeaking`), nunca por um relógio: a duração de uma fala sintetizada não é
 * previsível, e chutá-la abriria o microfone no meio da pergunta.
 *
 * Sem fala prevista — som desligado, ambiente sem voz, ou simplesmente toque a
 * toque — já nasce terminada: esperar um fim que não vem deixaria o mãos livres
 * parado para sempre.
 *
 * Assina a porta por conta própria, em vez de receber um `speaking` de fora, para
 * que "já começou" seja uma variável local DESTA assinatura: uma assinatura por
 * espera, descartada com ela. Trocar de modo no meio da pergunta faz a fala passar
 * a existir, e então a espera recomeça inteira — no próprio render, porque o efeito
 * que abre o microfone corre no mesmo commit e um render de atraso já é um
 * microfone aberto por cima da pergunta que mal começou a ser dita.
 *
 * DEVE ser chamado ANTES de `useSpeakOnArrival`: os efeitos correm na ordem em que
 * são declarados, e assinar depois de falar perde a primeira transição.
 */
export function useSpokenYet(params: {
  willSpeak: boolean;
  speaker: SpeechSynthesizer | null;
}): boolean {
  const { willSpeak, speaker } = params;
  const [spoken, setSpoken] = useState({ forWillSpeak: willSpeak, done: !willSpeak });

  if (spoken.forWillSpeak !== willSpeak) {
    setSpoken({ forWillSpeak: willSpeak, done: !willSpeak });
  }

  useEffect(() => {
    if (!willSpeak || !speaker) return;
    let started = false;
    return speaker.onSpeaking((speaking) => {
      if (speaking) {
        started = true;
        return;
      }
      if (started) setSpoken({ forWillSpeak: willSpeak, done: true });
    });
  }, [willSpeak, speaker]);

  return spoken.forWillSpeak === willSpeak ? spoken.done : !willSpeak;
}
