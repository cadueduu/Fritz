export type MealId = 'cafe' | 'lanche1' | 'almoco' | 'lanche2' | 'jantar' | 'extra';
export type PlanMealId = Exclude<MealId, 'extra'>;

export interface Macros {
  kcal: number;
  p: number;
  c: number;
  g: number;
  f: number;
}

export interface Entry extends Macros {
  id: string;
  time: string;
  meal: MealId;
  title: string;
  desc: string;
  fora: boolean;
  /** true when the entry came from a photo; `thumb` holds a small JPEG data URL when one was captured */
  photo: boolean;
  thumb?: string;
  mult: number;
}

export interface DietMeal {
  id: PlanMealId;
  name: string;
  time: string;
  kcal: number;
  items: string[];
  subs: string[];
}

export interface PlanMeal {
  id: PlanMealId;
  name: string;
  time: string;
  kcal: number;
}

export type Activity = 'sed' | 'leve' | 'mod' | 'alta';

export interface Body {
  sexo: 'M' | 'F';
  idade: number;
  altura: number;
  peso: number;
  atividade: Activity;
  ritmo: number;
}

export interface ChatMsg {
  from: 'user' | 'agent';
  text: string;
}

export interface Weigh {
  date: string;
  kg: number;
}

export interface AppState {
  version: 1;
  profile: { name: string };
  planMode: 'nutro' | 'auto';
  dietGoals: Macros;
  dietMeals: DietMeal[];
  body: Body;
  /** keyed by local date, YYYY-MM-DD */
  diaries: Record<string, Entry[]>;
  water: Record<string, number>;
  weights: Weigh[];
  msgs: ChatMsg[];
}
