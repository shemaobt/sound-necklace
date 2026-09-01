import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

/**
 * A meta de hoje (ENG-653): até onde a facilitadora e quem conta pretendem chegar
 * nesta sentada. Escolhe-se no Setup, aparece como uma marca fixa na barra do topo,
 * e ao ser alcançada o app diz isso e oferece parar.
 *
 * Mora aqui, e NÃO no DTO da sessão, por duas razões. A primeira é de camada:
 * `contracts/` é congelado e nada disto entra em artefato nenhum — a meta não é uma
 * decisão sobre a história, é um combinado sobre o dia. A segunda é de alcance: quem
 * a escolhe (o Setup) e quem a desenha (a barra do shell) são telas diferentes, em
 * rotas diferentes, e entre uma e outra a sessão sequer existe ainda — a escolha
 * precede a criação. Um store em memória, ao lado do `appStore` e do `progressStore`,
 * é o único lugar que atravessa as duas e morre com a aba.
 *
 * Não tem `reset()`: a meta é escolhida ANTES de a sessão nascer, e zerá-la à
 * montagem da sessão apagaria exatamente a escolha que acabou de ser feita. Quem
 * rearma o "já comemorei" é a montagem do organismo, que o shell remonta por sessão.
 */

/**
 * As metas do protótipo v4 (linha 1640), na ordem em que se oferecem. As "12
 * conversas" saíram com a Conversa (ENG-689); as cinco restantes cabem todas no
 * fluxo que ficou.
 */
export type TodayGoal = 'twoScenes' | 'fourScenes' | 'triage' | 'phrases' | 'wholeStory';

export const TODAY_GOALS: readonly TodayGoal[] = [
  'twoScenes',
  'fourScenes',
  'triage',
  'phrases',
  'wholeStory',
];

export interface GoalStore {
  /** A meta escolhida, ou nenhuma — que é um estado válido e o default. */
  goal: TodayGoal | null;
  /** Escolhe; escolher a que já está escolhida DESFAZ a escolha (protótipo `setMeta`). */
  chooseGoal(goal: TodayGoal): void;
}

export function createGoalStore() {
  return createStore<GoalStore>((set) => ({
    goal: null,
    chooseGoal(goal) {
      set((s) => ({ goal: s.goal === goal ? null : goal }));
    },
  }));
}

export const goalStore = createGoalStore();

export function useGoalStore<T>(selector: (s: GoalStore) => T): T {
  return useStore(goalStore, selector);
}
