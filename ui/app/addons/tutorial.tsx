import { TutorialPopup } from '../../organisms/tutorial-popup/tutorial-popup';
import { useSessionStore } from '../../state';
import { stepperStations } from '../stepper-model';

/**
 * Addon do popup de tutorial (ENG-231), descoberto pela registry do shell
 * (glob /ui/app/addons/*.tsx) e renderizado na AddonsLayer. Deriva a estação
 * atual da sessão e a entrega ao organismo; sem sessão (login/dashboard) não
 * há etapa para explicar.
 */
export default function TutorialAddon() {
  const session = useSessionStore((s) => s.session);
  if (!session) return null;
  const station = stepperStations(session).find((s) => s.state === 'current')?.key;
  return station ? <TutorialPopup station={station} /> : null;
}
