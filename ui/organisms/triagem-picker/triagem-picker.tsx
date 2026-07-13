import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { SCENE_KINDS, SK_PT, type Confidence } from '../../../domain';
import { sceneKindLabel } from '../../i18n/scene-kind-label';
import { Button, Pearl } from '../../atoms';
import { ConfidenceTrio, KindCard, type ConfidenceChoice } from '../../molecules';
import { scenePalette, type PaletteEntry } from '../../tokens';
import './triagem-picker.css';

/**
 * O picker da Triagem (PRD v2 §8.5; protótipo "Colar de Sons - Protótipo",
 * estação Triagem): grade "Mais comuns" (os tipos do tier comum), disclosure
 * "Ver todos os tipos por tema" com os 6 temas decididos no planejamento,
 * cartão tracejado "Nenhum se encaixa" sempre presente e filtro de texto
 * (conveniência da facilitadora). Escolher um tipo troca a grade pelo passo
 * de confiança; confirmar emite os valores contratuais (inglês intocado,
 * alta/média/baixa). Presentacional: nenhuma mutação de domínio acontece aqui.
 *
 * A pertinência de tema é display-only e vive NESTE organismo (não em
 * domain/scene-kinds.ts). Um radiogroup único com headings visuais de tema:
 * `role=group` aninhado em radiogroup não é sancionado pelo ARIA (required
 * owned = radio). Setas movem o foco SEM marcar (variante toolbar do APG) —
 * marcar já revela o passo de confiança, o que tornaria as setas destrutivas.
 * No passo de confiança o trio segue o APG padrão (setas movem E marcam),
 * então marcar ali NUNCA emite: a emissão contratual fica num "Confirmar"
 * explícito, revelado após a primeira escolha (ação dominante única, §9.2).
 *
 * Trade-off documentado: os botões de disclosure ("Ver todos os tipos por
 * tema"/"recolher") vivem DENTRO do elemento radiogroup — movê-los para fora
 * quebraria a ordem visual do protótipo (entre os comuns e o none-fit) sem
 * quebrar o grupo em dois radiogroups. O handler de teclado ignora não-radios;
 * o custo é uma parada de Tab extra no meio do grupo, inevitável para uma
 * ação que precisa ser alcançável.
 */

interface Theme {
  /** id ESTÁVEL (não traduzível): identifica o bloco no DOM (`data-theme`). */
  id: string;
  kinds: string[];
  tint: PaletteEntry;
}

/** Cores por tema = as 6 primeiras entradas do scenePalette (protótipo). */
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
  certeza: 'alta',
  quase: 'média',
  duvida: 'baixa',
};

function tintOf(value: string): PaletteEntry {
  return THEMES.find((t) => t.kinds.includes(value))?.tint ?? scenePalette[5]!;
}

/** Busca sem acentos, em minúsculas — "bencao" encontra "Bênção". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

interface CardModel {
  value: string;
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

export interface TriagemPickerProps {
  onConfirm?: (kind: string, confidence: Confidence) => void;
  onNoneFit?: () => void;
}

export function TriagemPicker({ onConfirm, onNoneFit }: TriagemPickerProps) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');
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

  // Expandir/recolher troca um botão pelo outro; seguir com o foco evita a
  // queda para o body no meio do grupo.
  const prevExpanded = useRef(expanded);
  useEffect(() => {
    if (prevExpanded.current === expanded) return;
    prevExpanded.current = expanded;
    rootRef.current
      ?.querySelector<HTMLElement>(
        expanded ? '.cds-triagem-picker-collapse' : '.cds-triagem-picker-disclosure',
      )
      ?.focus();
  }, [expanded]);

  if (picked) {
    const label = sceneKindLabel(picked, i18n.language);
    return (
      <div className="cds-triagem-picker" data-stage="confianca" ref={rootRef}>
        <div className="cds-triagem-picker-chosen">
          <Pearl tint={tintOf(picked)} size={22} state="lit" />
          <span className="cds-triagem-picker-chosen-label" title={picked}>
            {label}
          </span>
          <button
            type="button"
            className="cds-triagem-picker-swap"
            onClick={() => {
              setPicked(null);
              setChoice(null);
            }}
          >
            {t('triagemPicker.swap')}
          </button>
        </div>
        <p className="cds-triagem-picker-question">{t('triagemPicker.confidenceQuestion')}</p>
        <ConfidenceTrio value={choice ?? undefined} onSelect={setChoice} />
        {choice ? (
          <div className="cds-triagem-picker-confirm">
            <Button onClick={() => onConfirm?.(picked, CONFIDENCE_BY_CHOICE[choice])}>
              {t('triagemPicker.confirm')}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const query = fold(filter.trim());
  // Casa com o rótulo EXIBIDO (PT ou EN), com o rótulo PT-BR e com o valor de contrato:
  // filtrar nunca fica pior por trocar de idioma.
  const matches = (value: string) =>
    fold(SK_PT[value] ?? '').includes(query) ||
    fold(sceneKindLabel(value, i18n.language)).includes(query) ||
    fold(value).includes(query);

  const commonCards: CardModel[] = SCENE_KINDS.filter((k) => k.tier === 'comum').map((k) => ({
    value: k.value,
    tint: tintOf(k.value),
  }));
  const filteredCards: CardModel[] | null = query
    ? SCENE_KINDS.filter((k) => matches(k.value)).map((k) => ({
        value: k.value,
        tint: tintOf(k.value),
      }))
    : null;
  const themeSections = !query && expanded ? THEMES : [];

  const radioCount =
    (filteredCards ? filteredCards.length : commonCards.length) +
    themeSections.reduce((n, t) => n + t.kinds.length, 0) +
    1; // + "Nenhum se encaixa"
  const tabIdx = Math.min(focusedIdx, radioCount - 1);

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

  // offsets na ordem do DOM para o roving tabindex (um só tabbável)
  const renderCards = (cards: CardModel[], start: number) =>
    cards.map((m, i) => (
      <KindCard
        key={m.value}
        label={sceneKindLabel(m.value, i18n.language)}
        en={m.value}
        tint={m.tint}
        tabbable={start + i === tabIdx}
        onSelect={() => {
          setPicked(m.value);
          setChoice(null);
        }}
      />
    ));

  const gridCards = filteredCards ?? commonCards;
  const themeStart = (i: number) =>
    gridCards.length + themeSections.slice(0, i).reduce((n, t) => n + t.kinds.length, 0);
  const noneFitIdx = radioCount - 1;

  const grid = renderCards(gridCards, 0);
  const themeBlocks = themeSections.map((theme, i) => (
    <div key={theme.id} className="cds-triagem-picker-theme" data-theme={theme.id}>
      <div className="cds-triagem-picker-theme-label">
        <span
          className="cds-triagem-picker-theme-dot"
          style={{ background: theme.tint.base }}
          aria-hidden="true"
        />
        {t(`triagemPicker.theme.${theme.id}`)}
      </div>
      <div className="cds-triagem-picker-grid">
        {renderCards(
          theme.kinds.map((value) => ({ value, tint: theme.tint })),
          themeStart(i),
        )}
      </div>
    </div>
  ));

  return (
    <div className="cds-triagem-picker" data-stage="tipos" ref={rootRef}>
      <input
        className="cds-triagem-picker-filter"
        type="search"
        aria-label={t('triagemPicker.filterAria')}
        placeholder={t('triagemPicker.filterPlaceholder')}
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setFocusedIdx(0); // a lista muda de identidade; roving recomeça previsível
        }}
      />
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={t('triagemPicker.groupAria')}
        className="cds-triagem-picker-group"
        onKeyDown={onGroupKeyDown}
      >
        {filteredCards ? (
          <div className="cds-triagem-picker-grid">{grid}</div>
        ) : (
          <>
            <div className="cds-triagem-picker-section">{t('triagemPicker.common')}</div>
            <div className="cds-triagem-picker-grid">{grid}</div>
            {expanded ? (
              <>
                {themeBlocks}
                <button
                  type="button"
                  className="cds-triagem-picker-collapse"
                  aria-expanded="true"
                  onClick={() => {
                    setExpanded(false);
                    setFocusedIdx(0);
                  }}
                >
                  {t('triagemPicker.collapse')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="cds-triagem-picker-disclosure"
                aria-expanded="false"
                onClick={() => {
                  setExpanded(true);
                  setFocusedIdx(0);
                }}
              >
                {t('triagemPicker.seeAll')}
              </button>
            )}
          </>
        )}
        <KindCard
          noneFit
          label={t('triagemPicker.noneFit')}
          tabbable={tabIdx === noneFitIdx}
          onSelect={() => onNoneFit?.()}
        />
      </div>
    </div>
  );
}
