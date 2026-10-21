// Example data for a first run, laid out relative to today so the screens look like the design.
import type { AppState, Entry, MealId } from '../types';
import { addDays, dateKey, today } from '../lib/dates';
import { newId } from '../lib/format';
import { DEFAULT_GOALS, DIET } from './plan';
import { REPLIES } from './agent';

const E = (time: string, meal: MealId, title: string, desc: string, kcal: number, p: number, c: number, g: number, f: number, fora: boolean, photo: boolean): Entry =>
  ({ id: newId(), time, meal, title, desc, kcal, p, c, g, f, fora, photo, mult: 1 });

const pastDay = (kcal: number): Entry[] => {
  const a = [
    E('07:15', 'cafe', 'Café da manhã', 'Tapioca com queijo branco e café', 340, 20, 42, 9, 2, false, true),
    E('10:00', 'lanche1', 'Lanche da manhã', 'Maçã e 3 castanhas', 170, 3, 22, 8, 4, false, false),
    E('12:50', 'almoco', 'Almoço', 'Arroz, feijão, patinho e legumes', 590, 42, 62, 16, 10, false, true),
    E('16:20', 'lanche2', 'Lanche da tarde', 'Iogurte natural com aveia', 210, 11, 28, 5, 4, false, false)
  ];
  const r = kcal - 1310;
  a.push(kcal > 2000
    ? E('20:30', 'extra', 'Pizza', '2 fatias de mussarela', r, r * 0.045, r * 0.1, r * 0.038, 2, true, true)
    : E('19:40', 'jantar', 'Jantar', 'Omelete de 2 ovos, salada e legumes', r, r * 0.07, r * 0.06, r * 0.05, 5, false, true));
  return a;
};

// days −27…−7: 2 = full day, 1 = partly logged, 0 = nothing logged
const OLDER = '222212222222022221222';
const OLDER_KCAL = [1740, 1810, 1690, 1920, 1760, 1700, 1850, 1780, 1720, 2080, 1790, 1750, 0, 1810, 1700, 1690, 1770, 1830, 1720, 1950, 1760];
const LAST_WEEK = [1760, 1690, 2150, 1980, 1720, 1810];

const weightSeries = () => {
  let s = 11;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const a: number[] = [];
  for (let i = 0; i < 84; i++) a.push(92.4 - 5.1 * (i / 83) + Math.sin(i / 4.3) * 0.3 + (rnd() - 0.5) * 1.2);
  return a;
};

export const MEASURES = [
  { label: 'Cintura', val: '98', unit: 'cm', delta: '−4,5 cm' },
  { label: 'Quadril', val: '104', unit: 'cm', delta: '−2,0 cm' },
  { label: 'Braço', val: '34', unit: 'cm', delta: '−1,0 cm' },
  { label: 'Coxa', val: '60', unit: 'cm', delta: '−1,5 cm' },
  { label: 'Gordura corporal', val: '27,4', unit: '%', delta: '−2,1 pts' },
  { label: 'Massa magra', val: '63,5', unit: 'kg', delta: 'estável' }
];

export const seedState = (): AppState => {
  const t0 = today();
  const diaries: Record<string, Entry[]> = {};
  OLDER.split('').forEach((c, i) => {
    const k = dateKey(addDays(t0, i - 27));
    diaries[k] = c === '0' ? [] : c === '1' ? pastDay(OLDER_KCAL[i]).slice(0, 2) : pastDay(OLDER_KCAL[i]);
  });
  LAST_WEEK.forEach((kcal, i) => { diaries[dateKey(addDays(t0, i - 6))] = pastDay(kcal); });
  diaries[dateKey(t0)] = [
    E('07:20', 'cafe', 'Café da manhã', '2 ovos mexidos, pão integral e café sem açúcar', 320, 19, 22, 16, 3, false, true),
    E('10:05', 'lanche1', 'Lanche da manhã', 'Iogurte natural e 1 banana', 180, 8, 30, 3, 2, false, false),
    E('11:10', 'extra', 'Pão de queijo', '2 unidades pequenas', 170, 4, 22, 8, 0, true, true)
  ];
  const ws = weightSeries();
  return {
    version: 1,
    profile: { name: 'Rafael' },
    planMode: 'nutro',
    dietGoals: { ...DEFAULT_GOALS },
    dietMeals: DIET,
    body: { sexo: 'M', idade: 38, altura: 178, peso: 88, atividade: 'mod', ritmo: 0.5 },
    diaries,
    water: { [dateKey(t0)]: 6 },
    weights: ws.map((kg, i) => ({ date: dateKey(addDays(t0, i - 83)), kg: Math.round(kg * 10) / 10 })),
    msgs: [
      { from: 'user', text: 'Posso trocar o arroz por batata?' },
      { from: 'agent', text: REPLIES['Posso trocar o arroz por batata?'] }
    ]
  };
};
