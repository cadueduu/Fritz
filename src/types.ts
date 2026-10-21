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

/** A full diet proposed by the agent (field names match the agent's tool schema). */
export interface DietProposal {
  resumo: string;
  metas: Macros;
  refeicoes: { id: PlanMealId; nome: string; horario: string; kcal: number; itens: string[]; substituicoes: string[] }[];
}

/** Something the agent proposed; it only takes effect when the user taps the card's button. */
export type AgentAction =
  | ({ type: 'dieta' } & DietProposal)
  | { type: 'refeicao'; id: string; refeicao: MealId; data?: string; horario?: string; descricao: string; kcal: number; p: number; c: number; g: number; f: number }
  | { type: 'peso'; kg: number; data?: string }
  | { type: 'agua'; copos: number };

export interface ChatMsg {
  from: 'user' | 'agent';
  text: string;
  actions?: AgentAction[];
}

export interface Weigh {
  date: string;
  kg: number;
}

export interface AppState {
  version: 1;
  profile: { name: string; email: string };
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
