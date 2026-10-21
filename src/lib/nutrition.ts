import type { AppState, Body, Entry, Macros, PlanMeal, PlanMealId } from '../types';
import { AUTO_SHARE } from '../data/plan';
import { r10 } from './format';

export const MACRO_KEYS = ['kcal', 'p', 'c', 'g', 'f'] as const;

export const zero = (): Macros => ({ kcal: 0, p: 0, c: 0, g: 0, f: 0 });

export const sumEntries = (entries: Entry[] = []) => {
  const t = zero();
  entries.forEach(e => MACRO_KEYS.forEach(k => { t[k] += e[k] * e.mult; }));
  return t;
};

export interface AutoGoals extends Macros {
  tdee: number;
  def: number;
  floored: boolean;
}

/** Mifflin-St Jeor BMR × activity factor, minus a deficit for the chosen pace, never below a safe floor. */
export const autoGoals = (b: Body): AutoGoals => {
  const fac = { sed: 1.2, leve: 1.375, mod: 1.55, alta: 1.725 }[b.atividade];
  const bmr = 10 * b.peso + 6.25 * b.altura - 5 * b.idade + (b.sexo === 'M' ? 5 : -161);
  const tdee = bmr * fac;
  const def = b.ritmo * 1100;
  const floor = b.sexo === 'M' ? 1500 : 1200;
  const kcal = Math.max(floor, r10(tdee - def));
  const p = Math.round(Math.min(1.8 * b.peso, (kcal * 0.35) / 4));
  const g = Math.round((kcal * 0.27) / 9);
  const c = Math.round((kcal - p * 4 - g * 9) / 4);
  const f = Math.max(25, Math.round((kcal * 14) / 1000));
  return { kcal, p, c, g, f, tdee: r10(tdee), def: Math.round(def), floored: tdee - def < floor };
};

export const goals = (s: AppState): Macros => (s.planMode === 'auto' ? autoGoals(s.body) : s.dietGoals);

export const autoPlan = (kcal: number): PlanMeal[] =>
  AUTO_SHARE.map(m => ({ id: m.id, name: m.name, time: m.time, kcal: r10(kcal * m.share) }));

export const planList = (s: AppState): PlanMeal[] =>
  s.planMode === 'auto'
    ? autoPlan(autoGoals(s.body).kcal)
    : s.dietMeals.map(m => ({ id: m.id, name: m.name, time: m.time, kcal: m.kcal }));

/** Portion suggestion for a meal of `k` kcal when the user has no diet. */
export const autoSug = (id: PlanMealId, k: number) => ({
  cafe: '2 ovos + ' + Math.max(1, Math.round((k - 150) / 70)) + ' fatia(s) de pão integral + 1 fruta',
  lanche1: 'Iogurte natural + ' + Math.max(1, Math.round((k - 110) / 40)) + ' col. de aveia',
  almoco: r10((k * 0.3) / 1.28) + ' g de arroz + ' + r10((k * 0.15) / 0.76) + ' g de feijão + ' + r10((k * 0.4) / 1.59) + ' g de frango + salada à vontade',
  lanche2: '1 fruta + ' + Math.max(10, r10((k - 70) / 6)) + ' g de castanhas',
  jantar: r10((k * 0.45) / 1.59) + ' g de frango ou peixe + ' + r10((k * 0.3) / 0.77) + ' g de batata-doce + legumes'
})[id];
