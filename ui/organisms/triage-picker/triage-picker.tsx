import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { SCENE_KINDS, type Confidence } from '../../../domain';
import { sceneKindLabel } from '../../i18n/scene-kind-label';
import { Button, Pearl } from '../../atoms';
import { ConfidenceTrio, KindCard, type ConfidenceChoice } from '../../molecules';
import { scenePalette, type PaletteEntry } from '../../tokens';
import './triage-picker.css';

/**
 * O picker da Triage (PRD v2 §8.5): os 27 tipos numa grade só, em ordem
 * alfabética do rótulo exibido, mais o cartão tracejado "Nenhum se encaixa"
 * sempre presente. Escolher um tipo troca a grade pelo passo de confiança;
 * confirmar emite os valores contratuais (inglês intocado, high/medium/low).
 * Presentacional: nenhuma mutação de domínio acontece aqui.
 *
 * A primeira validação com gente real derrubou o desenho anterior (grade "Mais
 * comuns" + disclosure "Ver todos os tipos por tema" + blocos por tema): o
 * disclosure era discreto demais e as pessoas classificavam a partir da lista
 * curta acreditando ser a lista inteira, e o agrupamento temático obrigava a
 * adivinhar o balde antes de poder procurar o tipo — a taxonomia é nossa, não
 * delas. Por isso a ordem é alfabética: procura-se pelo nome que se tem na
 * cabeça. E por isso a rolagem é da grade, não da página: "Nenhum se encaixa" e
 * o passo seguinte continuam alcançáveis sem rolar.
 *
 * A tabela THEMES sobrevive SÓ como fonte de cor (`tintOf`): o ponto colorido
 * do cartão continua sendo identidade daquele tipo, apenas não é mais título de
 * grupo. Não é código morto — apagá-la tira a cor dos 27 cartões.
 *
 * Um radiogroup único. Setas movem o foco SEM marcar (variante toolbar do APG)
 * — marcar já revela o passo de confiança, o que tornaria as setas destrutivas.
 * O movimento é linear na ordem do DOM, não 2D: a grade é uma lista que quebra
 * em colunas, e navegá-la como lista é o que o teclado já esperava. No passo de
 * confiança o trio segue o APG padrão (setas movem E marcam), então marcar ali
 * NUNCA emite: a emissão contratual fica num "Confirmar" explícito, revelado
 * após a primeira escolha (ação dominante única, §9.2).
 */

interface Theme {
  /** id ESTÁVEL (não traduzível): nomeia a família de cor, não um bloco na tela. */
  id: string;
  kinds: string[];
  tint: PaletteEntry;
}

/** Cores por família = as 6 primeiras entradas do scenePalette (protótipo). */
const THEMES: Theme[] = [
  {
    id: 'indo-e-vindo',
    kinds: [
      'DEPARTURE_SCENE',
      'ARRIVAL_SCENE',
      'NIGHT_APPROACH_SCENE',
      'PROVISION_HOMECOMING_SCENE',
      'INITIATIVE_SCENE',
    ],
    tint: scenePalette[0]!,
  },
  {
    id: 'fala-e-acordo',
    kinds: [
      'APPEAL_SCENE',
      'INSTRUCTION_SCENE',
      'CONSENT_SCENE',
      'RATIFICATION_SCENE',
      'GATE_COURT_CONVENING_SCENE',
      'REDEMPTION_OFFER_SCENE',
      'REDEMPTION_DECLINE_SCENE',
      'REPORT_SCENE',
    ],
    tint: scenePalette[1]!,
  },
  { id: 'trabalho-e-terra', kinds: ['GLEANING_SCENE', 'MEAL_SCENE'], tint: scenePalette[2]! },
  { id: 'sentimento', kinds: ['LAMENT_SCENE', 'BEREAVEMENT_SCENE'], tint: scenePalette[3]! },
  {
    id: 'rito-e-alianca',
    kinds: [
      'MARRIAGE_SCENE',
      'VOW_SCENE',
      'BIRTH_SCENE',
      'NAMING_SCENE',
      'BLESSING_SCENE',
      'REDEEMER_RECOGNITION_SCENE',
    ],
    tint: scenePalette[4]!,
  },
  {
    id: 'narracao',
    kinds: [
      'NARRATOR_INTRODUCTION_SCENE',
      'NARRATOR_FRAMING_CLOSE_SCENE',
      'OPENING_CHRONICLE_SCENE',
      'GENEALOGY_SCENE',
    ],
    tint: scenePalette[5]!,
  },
];

/** Onde o token presentacional do trio vira o valor gravado (contrato). */
const CONFIDENCE_BY_CHOICE: Record<ConfidenceChoice, Confidence> = {
  certeza: 'high',
  quase: 'medium',
  duvida: 'low',
};

function tintOf(value: string): PaletteEntry {
  return THEMES.find((t) => t.kinds.includes(value))?.tint ?? scenePalette[5]!;
}

interface CardModel {
  value: string;
  label: string;
  tint: PaletteEntry;
}

/** Setas movem o foco (sem marcar — variante toolbar do APG); Home/End saltam. */
const KEY_TARGET: Record<string, 1 | -1 | 'home' | 'end'> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  Home: 'home',
  End: 'end',
};

export interface TriagePickerProps {
  onConfirm?: (kind: string, confidence: Confidence) => void;
  onNoneFit?: () => void;
}

export function TriagePicker({ onConfirm, onNoneFit }: TriagePickerProps) {
  const { t, i18n } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);
  const [choice, setChoice] = useState<ConfidenceChoice | null>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const groupRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Trocar de estágio desmonta o elemento focado; sem gestão o foco cai no
  // body (WCAG 2.4.3). Ao entrar na confiança, foco no rádio tabbável do trio;
  // ao voltar, no cartão tabbável da grade.
  const prevStage = useRef<'tipos' | 'confianca'>('tipos');
  useEffect(() => {
    const stage = picked ? 'confianca' : 'tipos';
    if (prevStage.current === stage) return;
    prevStage.current = stage;
    rootRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus();
  }, [picked]);

  /*
   * "Ainda tem tipo abaixo?" (ENG-390). A grade dos 27 rola, e numa janela de
   * 900px aparecem 12: se ela rolar em silêncio, a pessoa classifica a partir do
   * que vê — que é o defeito que achatar a lista veio consertar. A pista tem de
   * ficar POR CIMA dos cartões (eles são opacos: uma sombra no fundo da caixa
   * some atrás deles), e por isso é um elemento, não um `background`.
   *
   * O estado é medido, não presumido: quantos cartões cabem depende da altura
   * que a estação entrega e do tamanho da fonte. Depende de `picked` porque a
   * caixa sai do DOM no passo da confiança e volta outra depois.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const [temMais, setTemMais] = useState(false);
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    /* 1px de folga: alturas fracionárias nunca fecham a conta exatamente */
    const medir = () => setTemMais(box.scrollTop + box.clientHeight < box.scrollHeight - 1);
    medir();
    box.addEventListener('scroll', medir, { passive: true });
    // ResizeObserver não existe no jsdom; lá a medida síncrona basta.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
    ro?.observe(box);
    return () => {
      box.removeEventListener('scroll', medir);
      ro?.disconnect();
    };
  }, [picked]);

  if (picked) {
    const label = sceneKindLabel(picked, i18n.language);
    return (
      <div className="cds-triage-picker" data-stage="confianca" ref={rootRef}>
        <div className="cds-triage-picker-chosen-row">
          <div className="cds-triage-picker-chosen">
            <Pearl tint={tintOf(picked)} size={20} state="lit" />
            <span className="cds-triage-picker-chosen-label" title={picked}>
              {label}
            </span>
          </div>
          <button
            type="button"
            className="cds-triage-picker-swap"
            onClick={() => {
              setPicked(null);
              setChoice(null);
            }}
          >
            {t('triagePicker.swap')}
          </button>
        </div>
        <p className="cds-triage-picker-question">{t('triagePicker.confidenceQuestion')}</p>
        {/* O trio e o Confirmar dividem uma linha quando há largura (ver o CSS): a
            pilha vertical empurrava o botão para fora da área visível numa janela
            baixa. O berço do botão fica SEMPRE montado, vazio antes da escolha —
            assim o trio não desliza para o lado no instante em que se escolhe. */}
        <div className="cds-triage-picker-answer">
          <ConfidenceTrio
            value={choice ?? undefined}
            onSelect={setChoice}
            label={t('triagePicker.confidenceQuestion')}
            choiceLabels={{
              certeza: t('confidence.certeza'),
              quase: t('confidence.quase'),
              duvida: t('confidence.duvida'),
            }}
          />
          <div className="cds-triage-picker-confirm">
            {choice ? (
              <Button onClick={() => onConfirm?.(picked, CONFIDENCE_BY_CHOICE[choice])}>
                {t('triagePicker.confirm')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // Alfabética pelo rótulo EXIBIDO, não pelo valor inglês: quem procura procura
  // a palavra que está lendo na tela, e a ordem tem de seguir a língua da UI.
  const cards: CardModel[] = SCENE_KINDS.map((k) => ({
    value: k.value,
    label: sceneKindLabel(k.value, i18n.language),
    tint: tintOf(k.value),
  })).sort((a, b) => a.label.localeCompare(b.label, i18n.language));

  const noneFitIdx = cards.length; // o none-fit é o último rádio na ordem do DOM
  const tabIdx = Math.min(focusedIdx, noneFitIdx);

  const onGroupKeyDown = (e: ReactKeyboardEvent) => {
    const target = KEY_TARGET[e.key];
    if (target === undefined) return;
    const radios = Array.from(
      groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
    );
    const at = radios.indexOf(document.activeElement as HTMLElement);
    if (at < 0 || radios.length === 0) return;
    e.preventDefault();
    const next =
      target === 'home'
        ? 0
        : target === 'end'
          ? radios.length - 1
          : (at + target + radios.length) % radios.length;
    radios[next]?.focus();
    setFocusedIdx(next);
  };

  return (
    <div className="cds-triage-picker" data-stage="tipos" ref={rootRef}>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={t('triagePicker.groupAria')}
        className="cds-triage-picker-group"
        onKeyDown={onGroupKeyDown}
      >
        {/* só a grade rola: o none-fit fica fora da caixa de rolagem (mas dentro
            do grupo) para nunca depender de uma rolagem para ser encontrado */}
        <div className="cds-triage-picker-scroll" ref={scrollRef} data-more={temMais}>
          <div className="cds-triage-picker-grid">
            {cards.map((m, i) => (
              <KindCard
                key={m.value}
                label={m.label}
                en={m.value}
                tint={m.tint}
                tabbable={i === tabIdx}
                onSelect={() => {
                  setPicked(m.value);
                  setChoice(null);
                }}
              />
            ))}
          </div>
          {/* a borda que diz "continua" — decoração pura: quem não enxerga já
              ouve a contagem dos 27 pelo radiogroup */}
          <div className="cds-triage-picker-more" aria-hidden="true" />
        </div>
        <KindCard
          noneFit
          label={t('triagePicker.noneFit')}
          tabbable={tabIdx === noneFitIdx}
          onSelect={() => onNoneFit?.()}
        />
      </div>
    </div>
  );
}
