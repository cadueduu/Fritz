export const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');

export const dec = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

/** decimal with trailing zeros removed: 1.50 → "1,5", 2.00 → "2" */
export const decTrim = (n: number, d = 2) => dec(n, d).replace(/,?0+$/, '');

export const r10 = (n: number) => Math.round(n / 10) * 10;

export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

let uid = 0;
export const newId = () => Date.now().toString(36) + '-' + (++uid).toString(36);
