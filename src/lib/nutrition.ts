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

type Food = [kcal: number, min: number, max: number, label: (n: number) => string];

/** Adds units of each food in turn, within its min/max, until the meal reaches about `k` kcal. */
const fill = (k: number, foods: Food[]) => {
  const n = foods.map(f => f[1]);
  let total = foods.reduce((a, f, i) => a + f[0] * n[i], 0);
  for (let added = true; added;) {
    added = false;
    foods.forEach((f, i) => {
      if (n[i] < f[2] && total + f[0] <= k + f[0] * 0.3) { n[i]++; total += f[0]; added = true; }
    });
  }
  return foods.flatMap((f, i) => (n[i] > 0 ? [f[3](n[i])] : [])).join(' + ');
};

const g10 = (kcal: number, perGram: number, lo: number, hi: number) => clampN(r10(kcal / perGram), lo, hi);
const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const pl = (n: number, one: string, many: string) => n + ' ' + (n > 1 ? many : one);

/** Portion suggestion for a meal of `k` kcal when the user has no diet. Portions stay within everyday amounts. */
export const autoSug = (id: PlanMealId, k: number): string => {
  switch (id) {
    case 'cafe':
      return fill(k, [
        [70, 2, 3, n => pl(n, 'ovo', 'ovos')],
        [65, 1, 2, n => pl(n, 'fatia de pão integral', 'fatias de pão integral')],
        [70, 0, 1, () => '1 fruta'],
        [70, 0, 1, () => '30 g de queijo branco'],
        [110, 0, 1, () => '1 iogurte natural'],
        [40, 0, 2, n => pl(n, 'col. de aveia', 'col. de aveia')]
      ]);
    case 'lanche1':
      return fill(k, [
        [110, 1, 1, () => 'Iogurte natural'],
        [70, 0, 1, () => '1 fruta'],
        [40, 0, 2, n => pl(n, 'col. de aveia', 'col. de aveia')],
        [60, 0, 2, n => n * 10 + ' g de castanhas']
      ]);
    case 'almoco':
      return g10(k * 0.3, 1.28, 60, 200) + ' g de arroz + ' + g10(k * 0.15, 0.76, 60, 160) + ' g de feijão + ' + g10(k * 0.4, 1.59, 100, 200) + ' g de frango + salada à vontade com 1 col. chá de azeite';
    case 'lanche2':
      return fill(k, [
        [70, 1, 1, () => '1 fruta'],
        [60, 0, 3, n => n * 10 + ' g de castanhas'],
        [110, 0, 1, () => '1 iogurte natural']
      ]);
    case 'jantar':
      return g10(k * 0.5, 1.59, 100, 200) + ' g de frango ou peixe + ' + g10(k * 0.3, 0.77, 80, 250) + ' g de batata-doce + legumes à vontade';
  }
};
