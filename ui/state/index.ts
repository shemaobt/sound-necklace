/**
 * ui/state — ponte do estado de domínio para as telas (docs/architecture.md §2).
 * Importa domain/ (tipos + reducers) e o zustand; nunca adapters (o autosave
 * chega como porta injetada). Pages/templates/app consomem estes hooks/stores.
 */
export {
  createSessionStore,
  sessionStore,
  useSessionStore,
  type EditorLock,
  type SessionStore,
  type SessionStoreDeps,
} from './session-store';
export { createAppStore, appStore, useAppStore, type AppStore } from './app-store';
export {
  type ClockRecord,
  IDLE_GAP_MS,
  TICK_MS,
  freezeClock,
  markActivity,
  netTimeParts,
  readClock,
  resumeClock,
  startClock,
  useSessionClock,
} from './session-clock';
export {
  createGoalStore,
  goalStore,
  TODAY_GOALS,
  useGoalStore,
  type GoalStore,
  type TodayGoal,
} from './goal-store';
export {
  createProgressStore,
  progressStore,
  useProgressStore,
  type ProgressStore,
} from './progress-store';
