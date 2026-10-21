import type { Macros } from '../types';

/** Per-gram nutrition for foods the photo analysis can identify (TACO values). */
export interface Food {
  name: string;
  short: string;
  kcal: number;
  p: number;
  c: number;
  g: number;
  f: number;
}

export const FOODS = {
  arroz: { name: 'Arroz branco cozido', short: 'Arroz', kcal: 1.28, p: 0.025, c: 0.281, g: 0.002, f: 0.016 },
  integral: { name: 'Arroz integral cozido', short: 'Arroz integral', kcal: 1.24, p: 0.026, c: 0.258, g: 0.01, f: 0.027 },
  parbo: { name: 'Arroz parboilizado', short: 'Arroz parb.', kcal: 1.23, p: 0.025, c: 0.27, g: 0.003, f: 0.01 },
  feijao: { name: 'Feijão carioca cozido', short: 'Feijão', kcal: 0.76, p: 0.048, c: 0.136, g: 0.005, f: 0.085 },
  feijaoPreto: { name: 'Feijão preto cozido', short: 'Feijão preto', kcal: 0.77, p: 0.045, c: 0.14, g: 0.005, f: 0.084 },
  lentilha: { name: 'Lentilha cozida', short: 'Lentilha', kcal: 0.93, p: 0.063, c: 0.163, g: 0.005, f: 0.079 },
  frango: { name: 'Peito de frango grelhado', short: 'Frango', kcal: 1.59, p: 0.32, c: 0, g: 0.025, f: 0 },
  frangoFrito: { name: 'Frango frito', short: 'Frango frito', kcal: 2.46, p: 0.24, c: 0.08, g: 0.13, f: 0.003 },
  patinho: { name: 'Patinho grelhado', short: 'Patinho', kcal: 2.19, p: 0.359, c: 0, g: 0.073, f: 0 },
  salada: { name: 'Alface e tomate', short: 'Salada', kcal: 0.15, p: 0.01, c: 0.03, g: 0.002, f: 0.018 },
  brocolis: { name: 'Brócolis cozido', short: 'Brócolis', kcal: 0.25, p: 0.021, c: 0.044, g: 0.005, f: 0.034 },
  azeite: { name: 'Azeite de oliva', short: 'Azeite', kcal: 8.84, p: 0, c: 0, g: 1, f: 0 }
} satisfies Record<string, Food>;

export type FoodKey = keyof typeof FOODS;

/** Food search sample. Values are per listed portion. */
export interface SearchFood extends Macros {
  n: string;
  portion: string;
  src: 'TACO' | 'OFF';
}

export const SEARCH: SearchFood[] = [
  { n: 'Arroz branco cozido', portion: '100 g', kcal: 128, p: 2.5, c: 28.1, g: 0.2, f: 1.6, src: 'TACO' },
  { n: 'Batata inglesa cozida', portion: '100 g', kcal: 52, p: 1.2, c: 11.9, g: 0, f: 1.3, src: 'TACO' },
  { n: 'Feijão carioca cozido', portion: '100 g', kcal: 76, p: 4.8, c: 13.6, g: 0.5, f: 8.5, src: 'TACO' },
  { n: 'Peito de frango grelhado', portion: '100 g', kcal: 159, p: 32, c: 0, g: 2.5, f: 0, src: 'TACO' },
  { n: 'Banana prata', portion: '1 un · 70 g', kcal: 69, p: 0.9, c: 18.2, g: 0.1, f: 1.4, src: 'TACO' },
  { n: 'Ovo de galinha cozido', portion: '1 un · 50 g', kcal: 73, p: 6.7, c: 0.3, g: 4.8, f: 0, src: 'TACO' },
  { n: 'Aveia em flocos', portion: '30 g', kcal: 118, p: 4.4, c: 20, g: 2.6, f: 2.9, src: 'TACO' },
  { n: 'Batata-doce cozida', portion: '100 g', kcal: 77, p: 0.6, c: 18.4, g: 0.1, f: 2.2, src: 'TACO' },
  { n: 'Iogurte natural integral', portion: 'pote 170 g', kcal: 112, p: 6.5, c: 8.2, g: 5.1, f: 0, src: 'OFF' },
  { n: 'Pão de forma integral', portion: '2 fatias · 50 g', kcal: 124, p: 4.7, c: 24.9, g: 1.9, f: 3.4, src: 'OFF' },
  { n: 'Whey protein sabor baunilha', portion: '30 g', kcal: 118, p: 23, c: 3, g: 1.5, f: 0, src: 'OFF' },
  { n: 'Barra de proteína amendoim', portion: '45 g', kcal: 172, p: 15, c: 15, g: 6.5, f: 3, src: 'OFF' }
];

export const RECENTES = SEARCH.slice(0, 5);
export const FAVORITOS = [3, 5, 8, 10].map(i => SEARCH[i]);
