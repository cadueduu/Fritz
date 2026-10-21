import type { DietMeal, MealId, PlanMealId } from '../types';

export const DEFAULT_GOALS = { kcal: 1800, p: 130, c: 180, g: 55, f: 30 };

export const DIET: DietMeal[] = [
  { id: 'cafe', name: 'Café da manhã', time: '07:30', kcal: 350, items: ['2 ovos mexidos', '1 fatia de pão integral (25 g)', 'Café sem açúcar'], subs: ['Pão ↔ 2 col. de tapioca', 'Ovos ↔ 30 g de queijo branco'] },
  { id: 'lanche1', name: 'Lanche da manhã', time: '10:00', kcal: 180, items: ['Iogurte natural (170 g)', '1 fruta média'], subs: ['Iogurte ↔ 200 ml de leite desnatado'] },
  { id: 'almoco', name: 'Almoço', time: '12:30', kcal: 550, items: ['Arroz: 4 col. (120 g)', 'Feijão: 1 concha (100 g)', 'Frango ou patinho: 120–150 g', 'Salada à vontade + 1 col. chá de azeite'], subs: ['Arroz ↔ batata 200 g', 'Arroz ↔ mandioca 100 g', 'Frango ↔ peixe 150 g'] },
  { id: 'lanche2', name: 'Lanche da tarde', time: '16:00', kcal: 200, items: ['1 fruta', '30 g de castanhas'], subs: ['Castanhas ↔ 1 col. de pasta de amendoim'] },
  { id: 'jantar', name: 'Jantar', time: '19:30', kcal: 450, items: ['Proteína magra: 120 g', 'Legumes à vontade', 'Carboidrato: 2 col. (60 g)'], subs: ['Jantar ↔ omelete de 2 ovos + salada'] }
];

/** How the calculated goal is split across meals when there is no prescribed diet. */
export const AUTO_SHARE: { id: PlanMealId; name: string; time: string; share: number }[] = [
  { id: 'cafe', name: 'Café da manhã', time: '07:30', share: 0.25 },
  { id: 'lanche1', name: 'Lanche da manhã', time: '10:00', share: 0.1 },
  { id: 'almoco', name: 'Almoço', time: '12:30', share: 0.3 },
  { id: 'lanche2', name: 'Lanche da tarde', time: '16:00', share: 0.1 },
  { id: 'jantar', name: 'Jantar', time: '19:30', share: 0.25 }
];

export const MEAL_CHIPS: [MealId, string][] = [
  ['cafe', 'Café'], ['lanche1', 'Lanche manhã'], ['almoco', 'Almoço'], ['lanche2', 'Lanche tarde'], ['jantar', 'Jantar'], ['extra', 'Extra']
];

/** lowercase meal names used inside sentences */
export const MEAL_LABEL: Record<MealId, string> = {
  cafe: 'café da manhã', lanche1: 'lanche da manhã', almoco: 'almoço', lanche2: 'lanche da tarde', jantar: 'jantar', extra: 'extra'
};

/** Picks the plan meal closest to the current time, so Registrar opens on the right one. */
export const mealForNow = (d = new Date()): PlanMealId => {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 9 * 60) return 'cafe';
  if (m < 11 * 60) return 'lanche1';
  if (m < 15 * 60) return 'almoco';
  if (m < 18 * 60) return 'lanche2';
  return 'jantar';
};
