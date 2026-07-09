import { listAddons, type AddonComponent } from './registries';
import './addons-layer.css';

/**
 * Camada de overlay dos addons de nível-app (docs/architecture.md §4): chrome como
 * o popup de tutorial (ENG-231) monta ADICIONANDO um arquivo em `ui/app/addons/`.
 * Em produção o diretório começa vazio; a lista é injetável para teste.
 */
export function AddonsLayer({ addons = listAddons() }: { addons?: AddonComponent[] }) {
  if (addons.length === 0) return null;
  return (
    <div className="cds-addons-layer">
      {addons.map((Addon, i) => (
        <Addon key={i} />
      ))}
    </div>
  );
}
