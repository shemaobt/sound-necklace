import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { SCENE_KINDS, SK_PT, skShort, type Confidence } from '../../../domain';
import { Pearl } from '../../atoms';
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
 */

interface Theme {
  name: string;
  kinds: string[];
  tint: PaletteEntry;
}

/** Cores por tema = as 6 primeiras entradas do scenePalette (protótipo). */
const THEMES: Theme[] = [
  {
    name: 'Indo e vindo',
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
    name: 'Fala e acordo',
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
  { name: 'Trabalho e terra', kinds: ['GLEANING_SCENE', 'MEAL_SCENE'], tint: scenePalette[2]! },
  { name: 'Sentimento', kinds: ['LAMENT_SCENE', 'BEREAVEMENT_SCENE'], tint: scenePalette[3]! },
  {
    name: 'Rito e aliança',
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
    name: 'Narração',
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
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const groupRef = useRef<HTMLDivElement>(null);

  if (picked) {
    const label = skShort(picked);
    return (
      <div className="cds-triagem-picker" data-stage="confianca">
        <div className="cds-triagem-picker-chosen">
          <Pearl tint={tintOf(picked)} size={22} state="lit" />
          <span className="cds-triagem-picker-chosen-label" title={picked}>
            {label}
          </span>
          <button type="button" className="cds-triagem-picker-swap" onClick={() => setPicked(null)}>
            trocar tipo
          </button>
        </div>
        <p className="cds-triagem-picker-question">O quanto isso parece certo pra você?</p>
        <ConfidenceTrio onSelect={(choice) => onConfirm?.(picked, CONFIDENCE_BY_CHOICE[choice])} />
      </div>
    );
  }

  const query = fold(filter.trim());
  const matches = (value: string) =>
    fold(SK_PT[value] ?? '').includes(query) || fold(value).includes(query);

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
        label={skShort(m.value)}
        en={m.value}
        tint={m.tint}
        tabbable={start + i === tabIdx}
        onSelect={() => setPicked(m.value)}
      />
    ));

  const gridCards = filteredCards ?? commonCards;
  const themeStart = (i: number) =>
    gridCards.length + themeSections.slice(0, i).reduce((n, t) => n + t.kinds.length, 0);
  const noneFitIdx = radioCount - 1;

  const grid = renderCards(gridCards, 0);
  const themeBlocks = themeSections.map((t, i) => (
    <div key={t.name} className="cds-triagem-picker-theme" data-theme={t.name}>
      <div className="cds-triagem-picker-theme-label">
        <span
          className="cds-triagem-picker-theme-dot"
          style={{ background: t.tint.base }}
          aria-hidden="true"
        />
        {t.name}
      </div>
      <div className="cds-triagem-picker-grid">
        {renderCards(
          t.kinds.map((value) => ({ value, tint: t.tint })),
          themeStart(i),
        )}
      </div>
    </div>
  ));

  return (
    <div className="cds-triagem-picker" data-stage="tipos">
      <input
        className="cds-triagem-picker-filter"
        type="search"
        aria-label="filtrar tipos"
        placeholder="filtrar…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label="Tipos de cena"
        className="cds-triagem-picker-group"
        onKeyDown={onGroupKeyDown}
      >
        {filteredCards ? (
          <div className="cds-triagem-picker-grid">{grid}</div>
        ) : (
          <>
            <div className="cds-triagem-picker-section">Mais comuns</div>
            <div className="cds-triagem-picker-grid">{grid}</div>
            {expanded ? (
              <>
                {themeBlocks}
                <button
                  type="button"
                  className="cds-triagem-picker-collapse"
                  aria-expanded="true"
                  onClick={() => setExpanded(false)}
                >
                  recolher
                </button>
              </>
            ) : (
              <button
                type="button"
                className="cds-triagem-picker-disclosure"
                aria-expanded="false"
                onClick={() => setExpanded(true)}
              >
                Ver todos os tipos por tema
              </button>
            )}
          </>
        )}
        <KindCard
          noneFit
          label="Nenhum se encaixa"
          tabbable={tabIdx === noneFitIdx}
          onSelect={() => onNoneFit?.()}
        />
      </div>
    </div>
  );
}
