import { useEffect, useRef, useState } from 'react';

import type { SpeechSynthesizer } from '../../../adapters/tts/types';

/**
 * O automatismo de "Mãos livres" que o dono ainda pode vetar (ENG-649): o microfone
 * que abre sozinho quando a pergunta acaba de ser falada.
 *
 * O protótipo v4 implementa só o avanço automático, e a cópia do cartão promete
 * três coisas; publicar a promessa sem cumpri-la seria mentir na tela de quem não
 * pode conferir lendo. Das três, a fala ao chegar deixou de morar aqui — o dono
 * decidiu (2026-08-29) que ela vale nos DOIS modos, e ela voltou a ser o efeito
 * incondicional da ENG-280, em `QuestionScreen`. Sobrou este, que é o que tem a
 * aresta de privacidade: um microfone abrindo sem ninguém tocar.
 *
 * Se o veto vier, o conserto é apagar este arquivo e as duas chamadas em
 * `QuestionScreen`. O pedido do modo, a pílula, o avanço automático e a voz da
 * pergunta não passam por aqui e continuam de pé — nada mais no app importa deste
 * módulo, e é essa ausência de ramificações que faz o veto ser barato.
 */

/**
 * Quanto se espera pela fala COMEÇAR antes de desistir dela.
 *
 * Não é um palpite de duração — a duração continua vindo da porta, e só dela. É um
 * piso sobre "a fala chegou a existir?", e existe porque a porta real pode aceitar
 * `speak()` e não emitir nada: o adapter HTTP depende de um `<audio>` que o
 * navegador pode recusar tocar sozinho (política de autoplay), e o fallback do Web
 * Speech é um no-op onde a API não existe. Sem este piso, o mãos livres ficava
 * parado para sempre numa tela sem microfone, sem próxima pergunta e sem uma
 * palavra dizendo o que houve — e a única saída era a pílula, que ninguém procura
 * justamente no modo em que ninguém está olhando para a tela.
 */
export const SPEECH_WATCHDOG_MS = 4000;

/**
 * E quanto se espera pela fala TERMINAR, depois de ela ter começado.
 *
 * O piso acima não alcança a porta que começa e não acaba, e essa é a que aparece
 * de verdade: um probe no Chromium headless mostrou `speak` → `start` → nada, para
 * sempre — o mãos livres esperando um `end` que nunca vinha, numa tela parada.
 *
 * Isto continua não sendo um palpite de duração: enquanto a porta se comportar, é o
 * `end` dela que manda, e este teto nunca chega perto. Ele é o limite de quanto
 * tempo o mãos livres fica em silêncio antes de devolver o microfone à pessoa —
 * bem além da pergunta mais longa do roteiro falada devagar, porque abrir por cima
 * do guia ainda falando é o erro pior dos dois.
 */
export const SPEECH_CEILING_MS = 20000;

/**
 * Abre o microfone sozinho, UMA vez por pergunta, quando a pergunta terminou de
 * ser falada.
 *
 * Duas travas, e cada uma responde a um jeito diferente de errar:
 *
 * `ready` é derivada do gravador — só o gravador PARADO e sem resposta em risco
 * abre. É ela que impede a abertura por cima de uma gravação em curso (perderia o
 * que a pessoa está dizendo), por cima de uma resposta que já existe (apagaria a
 * que já foi dada, sem perguntar), durante a procura pela resposta gravada e
 * durante o salvamento.
 *
 * `armed` é a mão humana. Assim que alguém age nesta pergunta — pausa a fala,
 * desliga o som, toca o microfone, pede ajuda, marca sem resposta —, quem conduz é
 * essa pessoa, e um microfone abrindo sozinho depois disso é o app passando por
 * cima dela. O caso que mandou escrever esta trava: pausar a pergunta chega à porta
 * como "a fala parou", exatamente igual a ela ter terminado, e sem `armed` o gesto
 * de pedir silêncio era o gesto que abria o microfone.
 */
export function useOpenMicWhenSpoken(params: {
  handsFree: boolean;
  /** a pergunta já foi falada — ou não haverá fala para esperar */
  spoken: boolean;
  ready: boolean;
  /** ninguém agiu nesta pergunta ainda */
  armed: boolean;
  open: () => void;
}): void {
  const { handsFree, spoken, ready, armed, open } = params;
  const opened = useRef(false);
  useEffect(() => {
    if (!handsFree || !spoken || !ready || !armed || opened.current) return;
    opened.current = true;
    open();
  }, [handsFree, spoken, ready, armed, open]);
}

/**
 * Se a fala desta pergunta já terminou. Medido pelas transições REAIS da porta
 * (`onSpeaking`), nunca por um relógio: a duração de uma fala sintetizada não é
 * previsível, e chutá-la abriria o microfone no meio da pergunta.
 *
 * Sem fala prevista — som desligado, ambiente sem voz, ou simplesmente toque a
 * toque — já nasce terminada: esperar um fim que não vem deixaria o mãos livres
 * parado para sempre. Pela mesma razão existe o `SPEECH_WATCHDOG_MS`, para a fala
 * que foi pedida e nunca começou.
 *
 * Assina a porta por conta própria, em vez de receber um `speaking` de fora, para
 * que "já começou" seja uma variável local DESTA assinatura: uma assinatura por
 * espera, descartada com ela.
 *
 * A fala PASSAR A EXISTIR (a dupla escolheu mãos livres agora) recomeça a espera, e
 * recomeça no próprio render — o efeito que abre o microfone corre no mesmo commit,
 * e um render de atraso já é um microfone aberto por cima da pergunta que mal
 * começou a ser dita. A fala DEIXAR de existir (alguém desligou o som no meio) não
 * termina a espera: a pergunta foi silenciada, não foi dita, e tratar as duas como
 * a mesma coisa fazia desligar o som abrir o microfone.
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
    setSpoken({ forWillSpeak: willSpeak, done: willSpeak ? false : spoken.done });
  }

  useEffect(() => {
    if (!willSpeak || !speaker) return;
    let started = false;
    const finish = () => setSpoken({ forWillSpeak: willSpeak, done: true });
    // o piso: a fala que não começou até aqui não vai começar
    let watchdog = setTimeout(finish, SPEECH_WATCHDOG_MS);
    const unsubscribe = speaker.onSpeaking((speaking) => {
      if (speaking) {
        started = true;
        // começou: o piso não vale mais, e passa a valer o teto
        clearTimeout(watchdog);
        watchdog = setTimeout(finish, SPEECH_CEILING_MS);
        return;
      }
      // um `false` antes de qualquer `true` não é um fim — é a porta se apresentando
      if (!started) return;
      clearTimeout(watchdog);
      finish();
    });
    return () => {
      clearTimeout(watchdog);
      unsubscribe();
    };
  }, [willSpeak, speaker]);

  return spoken.done;
}
