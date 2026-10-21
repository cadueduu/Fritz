// In-memory state shared between screens for the current session (not persisted).
import type { MealId } from '../types';
import { mealForNow } from '../data/plan';
import { createStore } from './createStore';

export interface Draft {
  id: number;
  meal: MealId;
  time: string;
  /** object URL of the captured photo, when there is one */
  photoUrl?: string;
  file?: Blob;
  text?: string;
  /** set once the meal was confirmed or discarded, so reopening Análise doesn't log it twice */
  done?: boolean;
}

interface Session {
  regMeal: MealId;
  draft: Draft | null;
  hojeToast: string | null;
  syncError: string | null;
  /** question to send to the agent as soon as its screen opens */
  agentPrompt: string | null;
  /** reopens the questionnaire from Meu plano */
  redoOnboarding: boolean;
}

export const session = createStore<Session>({ regMeal: mealForNow(), draft: null, hojeToast: null, syncError: null, agentPrompt: null, redoOnboarding: false });
export const useSession = session.use;

let draftId = 0;
export const startDraft = (d: Omit<Draft, 'id'>) =>
  session.set(s => {
    if (s.draft?.photoUrl && s.draft.photoUrl !== d.photoUrl) URL.revokeObjectURL(s.draft.photoUrl);
    return { ...s, draft: { ...d, id: ++draftId } };
  });

/** Calorie value the ring on Hoje last showed, so it can animate from there when it remounts. */
export const ringMemo = { shown: null as number | null };
