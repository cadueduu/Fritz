export const WEEK_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEK_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEK_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const pad = (n: number) => String(n).padStart(2, '0');

export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const todayKey = () => dateKey(today());

export const keyOffset = (n: number) => dateKey(addDays(today(), n));

export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000);

export const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** "Quarta, 21 de outubro" */
export const longDate = (d: Date) => `${WEEK_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;

/** "15 jul" */
export const shortDate = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;

/** "15 a 21 de outubro", or "28 de set. a 4 de outubro" across months */
export const rangeLabel = (a: Date, b: Date) =>
  a.getMonth() === b.getMonth()
    ? `${a.getDate()} a ${b.getDate()} de ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} de ${MONTHS_SHORT[a.getMonth()]}. a ${b.getDate()} de ${MONTHS[b.getMonth()]}`;

/** "14–20 out" */
export const rangeShort = (a: Date, b: Date) =>
  a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`
    : `${shortDate(a)} – ${shortDate(b)}`;
