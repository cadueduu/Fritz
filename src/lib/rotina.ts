// Turns the daily routine from the questionnaire into meal times.
import type { PlanMealId } from '../types';

export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
export const toTime = (min: number) => {
  const m = ((Math.round(min / 15) * 15) % 1440 + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * Breakfast 30 min after waking (and at least 30 min before leaving), lunch at the stated time,
 * dinner about 3 h before bed (at least 4 h after lunch), snacks halfway in between.
 */
export function mealTimes(acorda: string, almoco: string, dorme: string, sai?: string): Record<PlanMealId, string> {
  const wake = toMin(acorda);
  const lunch = toMin(almoco);
  let bed = toMin(dorme);
  if (bed < wake) bed += 1440; // sleeps after midnight
  let cafe = wake + 30;
  if (sai) cafe = Math.max(wake + 10, Math.min(cafe, toMin(sai) - 30));
  const jantar = clamp(bed - 180, lunch + 240, Math.max(lunch + 240, bed - 90));
  return {
    cafe: toTime(cafe),
    lanche1: toTime((cafe + lunch) / 2),
    almoco: toTime(lunch),
    lanche2: toTime((lunch + jantar) / 2),
    jantar: toTime(jantar)
  };
}
