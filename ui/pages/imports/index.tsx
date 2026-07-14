import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  applyDelivery,
  applyReturn,
  type Delivery,
  DeliverySchema,
  DELIVERY_NO_GRID_MSG,
  MANIFEST_MISMATCH_MSG,
  type ReturnImport,
  ReturnSchema,
  RETURN_NO_GRID_MSG,
} from '../../../contracts';
import { sessionStore, useSessionStore } from '../../state';
import './imports.css';

/**
 * Estação de interoperabilidade com o pipeline (PRD v2 §8.9): as duas portas que
 * ligam o Colar ao "Compilador" — carregar uma ENTREGA (propostas destravadas,
 * "confirme de ouvido") e retomar um RETORNO (confirmações travadas, flags
 * reaplicadas). Superfície de FACILITADORA (§7.2) → contagens permitidas.
 *
 * A página só faz seleção de arquivo, exibição de erro e substituição do estado:
 * TODO o mapeamento vem de contracts/imports.ts (parse pelo schema na borda +
 * `applyDelivery`/`applyReturn`, ports 1:1 da referência). O estado resultante
 * substitui a sessão viva via `sessionStore.apply` (autosave + gate de edição);
 * arquivo ilegível não toca o store. Ambas exigem áudio já segmentado (grade) —
 * senão o mapper recusa com a cópia PT-BR própria.
 */

type Tone = 'ok' | 'warn' | 'err';
interface Notice {
  tone: Tone;
  text: string;
}

type Door = 'entrega' | 'anchoring';

export function Imports() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const [notices, setNotices] = useState<Notice[]>([]);

  const failure = (door: Door, e: unknown): string =>
    t('imports.failure', {
      alvo: door === 'entrega' ? t('imports.targetEntrega') : t('imports.targetRetorno'),
      detail: e instanceof Error ? e.message : String(e),
    });

  const onDelivery = async (file: File): Promise<void> => {
    // try/catch SÓ na fronteira de sistema (ler + parsear o arquivo); o mapper
    // puro e o `apply` do store rodam FORA — um bug de domínio borbulha com o
    // stack trace, não vira "arquivo ilegível" (CLAUDE.md, regra de try/catch).
    let dto: Delivery;
    try {
      dto = DeliverySchema.parse(JSON.parse(await file.text()));
    } catch (e) {
      setNotices([{ tone: 'err', text: failure('entrega', e) }]);
      return;
    }
    const current = sessionStore.getState().session;
    if (!current) return;
    const outcome = applyDelivery(current, dto);
    if (!outcome.ok) {
      setNotices([{ tone: 'err', text: DELIVERY_NO_GRID_MSG }]);
      return;
    }
    const msgs: Notice[] = [];
    if (outcome.manifestMismatch) msgs.push({ tone: 'warn', text: MANIFEST_MISMATCH_MSG });
    sessionStore.getState().apply(() => outcome.state);
    msgs.push({
      tone: 'ok',
      text: t('imports.deliveryOk', {
        cenas: outcome.state.parts.length,
        frases: outcome.state.frases.length,
      }),
    });
    setNotices(msgs);
  };

  const onReturn = async (file: File): Promise<void> => {
    let dto: ReturnImport;
    try {
      dto = ReturnSchema.parse(JSON.parse(await file.text()));
    } catch (e) {
      setNotices([{ tone: 'err', text: failure('anchoring', e) }]);
      return;
    }
    const current = sessionStore.getState().session;
    if (!current) return;
    const outcome = applyReturn(current, dto);
    if (!outcome.ok) {
      setNotices([{ tone: 'err', text: RETURN_NO_GRID_MSG }]);
      return;
    }
    sessionStore.getState().apply(() => outcome.state);
    setNotices([
      {
        tone: 'ok',
        text: t('imports.returnOk', {
          cenas: outcome.state.parts.length,
          frases: outcome.state.frases.length,
        }),
      },
    ]);
  };

  if (!session) {
    return (
      <section className="cds-imports">
        <p className="cds-imports-guidance">{t('imports.guidanceNoSession')}</p>
      </section>
    );
  }

  return (
    <section className="cds-imports">
      <h2 className="cds-imports-title">{t('imports.title')}</h2>
      <p className="cds-imports-intro">{t('imports.intro')}</p>

      <label className="cds-imports-door">
        <span>{t('imports.doorEntrega')}</span>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onDelivery(f);
          }}
        />
      </label>

      <label className="cds-imports-door">
        <span>{t('imports.doorRetorno')}</span>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onReturn(f);
          }}
        />
      </label>

      <div className="cds-imports-notices">
        {notices.map((n, i) => (
          <p
            key={i}
            className="cds-imports-notice"
            data-tone={n.tone}
            role={n.tone === 'err' ? 'alert' : 'status'}
          >
            {n.text}
          </p>
        ))}
      </div>
    </section>
  );
}

export default Imports;
