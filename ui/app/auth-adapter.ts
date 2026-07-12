/**
 * AuthProvider app-global (§7.1): UM singleton fixture partilhado por Login, Dashboard
 * e a raiz de sessão — o mesmo token que o Login emite é o que a expiração invalida,
 * venha o gatilho do Dashboard ou de dentro de `/session/:id`. Sem este singleton
 * único, expirar mid-Triagem não teria a quem avisar. A seleção do modo real por
 * ambiente é ENG-247.
 */

import { FixtureAuthProvider } from '../../adapters/api';

let auth: FixtureAuthProvider | undefined;

export function appAuth(): FixtureAuthProvider {
  return (auth ??= new FixtureAuthProvider());
}
