import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

import { type Coverage, type KindCoverage } from '../../../domain';
import { sceneKindLabel } from '../../i18n/scene-kind-label';
import { ScenePearlDisc, type ScenePearlFill } from '../../molecules';
import type { PaletteEntry } from '../../tokens';
import './coverage-drawer.css';

/**
 * "Cobertura · só facilitadora" (PRD v2 §8.5; protótipo "Colar de Sons -
 * Protótipo", drawer da Triage): painel olive que desliza da direita, fechado
 * por padrão e invisível ao ouvinte até a facilitadora abrir pela aba lateral.
 * Contagens por tipo em mono (superfície densa de facilitadora — dígitos são
 * permitidos aqui) e "candidatos a ausência" = raras sem cobertura firme.
 * Presentacional: recebe um `Coverage` pronto do domínio.
 *
 * ENG-726 — a Rever monta o MESMO organismo e ganha uma segunda seção, atrás
 * da prop opcional `storyOverview`: o resumo da história inteira (cenas,
 * frases, duração, confiança) e a lista cena a cena, ambos derivados de
 * `state.parts`/`state.frases` NA PÁGINA (não em `domain/`, que é congelado) e
 * entregues já prontos — o organismo só desenha. A Triagem nunca passa essa
 * prop, e sem ela nada do conteúdo novo existe no documento: é o que mantém
 * `ui/pages/triage` intocada.
 *
 * Sobre Radix Dialog: `Title` é obrigatório; sem `Description`, o `Content`
 * leva `aria-describedby={undefined}` para não apontar para id inexistente.
 */

/** O domain dá o alvo numérico; a exibição do range das raras é do drawer. */
function targetLabel(k: KindCoverage): string {
  return k.tier === 'ALTA' ? '1–2' : String(k.target);
}

/** Uma linha da lista cena a cena — pronta pela página, a partir de `ReviewScene`. */
export interface CoverageSceneRow {
  /** `part_id` — chave de lista e o que distingue a linha selecionada. */
  key: string;
  /** O nome do tipo, já traduzido, ou o texto de "nenhum se encaixou". */
  label: string;
  /** A MESMA codificação de confiança da pérola do panorama (§9.2: sem marca de erro). */
  fill: ScenePearlFill;
  tint?: PaletteEntry;
  /** mm:ss já formatado — não é dado de domínio, é conversão de unidade. */
  duration: string;
  phraseCount: number;
  selected: boolean;
  /** Seleciona E toca a cena no panorama atrás da gaveta. */
  onSelect: () => void;
}

/** O resumo da história inteira que só a Rever mostra (ENG-726). */
export interface CoverageStoryOverview {
  totalScenes: number;
  namedScenes: number;
  noneFitScenes: number;
  totalPhrases: number;
  scenesWithoutPhrases: number;
  /** mm:ss já formatado. */
  duration: string;
  /** Segundos por conta do projeto — a legenda da duração. */
  beadSec: number;
  confidenceHigh: number;
  confidenceMedium: number;
  confidenceLow: number;
  /** Na ordem da história. */
  scenes: CoverageSceneRow[];
}

export interface CoverageDrawerProps {
  coverage: Coverage;
  /** ENG-726 — só a Rever passa isto. */
  storyOverview?: CoverageStoryOverview;
}

export function CoverageDrawer({ coverage, storyOverview }: CoverageDrawerProps) {
  const { t, i18n } = useTranslation();
  const rows = coverage.kinds.filter((k) => k.firm + k.hesitant > 0);
  const absent = coverage.kinds.filter((k) => k.candidateAbsence);
  return (
    <Dialog.Root>
      <Dialog.Trigger className="cds-coverage-drawer-tab" aria-label={t('coverageDrawer.tabAria')}>
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M3 20h18" />
          <path d="M6 20V9" />
          <path d="M12 20V4" />
          <path d="M18 20v-8" />
        </svg>
        <span className="cds-coverage-drawer-tab-label">{t('coverageDrawer.tabLabel')}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="cds-coverage-drawer-overlay" />
        <Dialog.Content className="cds-coverage-drawer-panel" aria-describedby={undefined}>
          <div className="cds-coverage-drawer-head">
            <Dialog.Title className="cds-coverage-drawer-title">
              {t('coverageDrawer.title')}
            </Dialog.Title>
            <Dialog.Close
              className="cds-coverage-drawer-close"
              aria-label={t('coverageDrawer.close')}
            >
              ×
            </Dialog.Close>
          </div>
          {storyOverview ? (
            <>
              <div className="cds-coverage-drawer-overview">
                <div className="cds-coverage-drawer-card">
                  <span className="cds-coverage-drawer-card-label">
                    {t('coverageDrawer.overviewScenes')}
                  </span>
                  <span className="cds-coverage-drawer-card-value">
                    {storyOverview.totalScenes}
                  </span>
                  <span className="cds-coverage-drawer-card-sub">
                    {t('coverageDrawer.overviewScenesSub', {
                      named: storyOverview.namedScenes,
                      none: storyOverview.noneFitScenes,
                    })}
                  </span>
                </div>
                <div className="cds-coverage-drawer-card">
                  <span className="cds-coverage-drawer-card-label">
                    {t('coverageDrawer.overviewPhrases')}
                  </span>
                  <span className="cds-coverage-drawer-card-value">
                    {storyOverview.totalPhrases}
                  </span>
                  <span className="cds-coverage-drawer-card-sub">
                    {storyOverview.scenesWithoutPhrases > 0
                      ? t('coverageDrawer.overviewPhrasesSome', {
                          count: storyOverview.scenesWithoutPhrases,
                        })
                      : t('coverageDrawer.overviewPhrasesAll')}
                  </span>
                </div>
                <div className="cds-coverage-drawer-card">
                  <span className="cds-coverage-drawer-card-label">
                    {t('coverageDrawer.overviewDuration')}
                  </span>
                  <span className="cds-coverage-drawer-card-value">{storyOverview.duration}</span>
                  <span className="cds-coverage-drawer-card-sub">
                    {t('coverageDrawer.overviewDurationCaption', {
                      seconds: storyOverview.beadSec,
                    })}
                  </span>
                </div>
                <div className="cds-coverage-drawer-card">
                  <span className="cds-coverage-drawer-card-label">
                    {t('coverageDrawer.overviewConfidence')}
                  </span>
                  <span className="cds-coverage-drawer-card-sub cds-coverage-drawer-card-conf">
                    {t('coverageDrawer.overviewConfidenceLine', {
                      high: storyOverview.confidenceHigh,
                      medium: storyOverview.confidenceMedium,
                      low: storyOverview.confidenceLow,
                    })}
                  </span>
                </div>
              </div>

              <div className="cds-coverage-drawer-section-title">
                {t('coverageDrawer.sceneByScene')}
              </div>
              <div className="cds-coverage-drawer-scenes">
                {storyOverview.scenes.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    className="cds-coverage-drawer-scene-row"
                    data-selected={row.selected || undefined}
                    onClick={row.onSelect}
                  >
                    <ScenePearlDisc fill={row.fill} tint={row.tint} size={14} />
                    <span className="cds-coverage-drawer-scene-label">{row.label}</span>
                    <span className="cds-coverage-drawer-scene-meta">
                      {t('coverageDrawer.sceneMeta', {
                        duration: row.duration,
                        phrases: t('coverageDrawer.scenePhraseCount', { count: row.phraseCount }),
                      })}
                    </span>
                  </button>
                ))}
              </div>

              <div className="cds-coverage-drawer-section-title">{t('coverageDrawer.byKind')}</div>
            </>
          ) : null}
          <p className="cds-coverage-drawer-intro">
            {t('coverageDrawer.introPre')}
            <strong>{coverage.productive}</strong>
            {t('coverageDrawer.introPost')}
          </p>
          <div className="cds-coverage-drawer-rows">
            {rows.map((k) => (
              <div key={k.value} className="cds-coverage-drawer-row" data-status={k.status}>
                <span className="cds-coverage-drawer-kind">{k.value}</span>
                <span className="cds-coverage-drawer-counts">
                  {t('coverageDrawer.counts', {
                    firm: k.firm,
                    hesitant: k.hesitant,
                    target: targetLabel(k),
                  })}
                </span>
              </div>
            ))}
          </div>
          <div className="cds-coverage-drawer-absence">{t('coverageDrawer.absence')}</div>
          <div className="cds-coverage-drawer-chips">
            {absent.map((k) => (
              <span key={k.value} className="cds-coverage-drawer-chip">
                {sceneKindLabel(k.value, i18n.language)}
              </span>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
