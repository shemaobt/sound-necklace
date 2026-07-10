import { useState } from 'react';

import {
  applyDelivery,
  applyReturn,
  DeliverySchema,
  DELIVERY_NO_GRID_MSG,
  MANIFEST_MISMATCH_MSG,
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

type Door = 'entrega' | 'retorno';

function failure(door: Door, e: unknown): string {
  const detail = e instanceof Error ? e.message : String(e);
  const alvo = door === 'entrega' ? 'a entrega' : 'o retorno';
  return `Não consegui ler ${alvo} (${detail}).`;
}

export function Imports() {
  const session = useSessionStore((s) => s.session);
  const [notices, setNotices] = useState<Notice[]>([]);

  const onDelivery = async (file: File): Promise<void> => {
    try {
      const dto = DeliverySchema.parse(JSON.parse(await file.text()));
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
        text: `✓ Entrega carregada: ${outcome.state.parts.length} cena(s), ${outcome.state.frases.length} frase(s). As cenas são propostas — confirme de ouvido.`,
      });
      setNotices(msgs);
    } catch (e) {
      setNotices([{ tone: 'err', text: failure('entrega', e) }]);
    }
  };

  const onReturn = async (file: File): Promise<void> => {
    try {
      const dto = ReturnSchema.parse(JSON.parse(await file.text()));
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
          text: `✓ Retomado: ${outcome.state.parts.length} cena(s), ${outcome.state.frases.length} frase(s).`,
        },
      ]);
    } catch (e) {
      setNotices([{ tone: 'err', text: failure('retorno', e) }]);
    }
  };

  if (!session) {
    return (
      <section className="cds-imports">
        <p className="cds-imports-guidance">Abra uma sessão para carregar arquivos do pipeline.</p>
      </section>
    );
  }

  return (
    <section className="cds-imports">
      <h2 className="cds-imports-title">Arquivos do pipeline</h2>
      <p className="cds-imports-intro">
        Carregue uma entrega do projeto ou retome um retorno já salvo.
      </p>

      <label className="cds-imports-door">
        <span>Carregar entrega do projeto (.json)</span>
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
        <span>Retomar retorno salvo (.json)</span>
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
