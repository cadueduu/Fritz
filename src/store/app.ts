// Persistent app data (localStorage) and the actions that change it.
import type { AppState, Body, ChatMsg, Entry, Macros } from '../types';
import { seedState } from '../data/seed';
import { createStore } from './createStore';

const KEY = 'leve:v1';

const load = (): AppState => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s && s.version === 1) return s;
    }
  } catch { /* fall through to seed */ }
  return seedState();
};

let saveTimer: number | undefined;
const save = (s: AppState) => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
  }, 150);
};

export const appStore = createStore<AppState>(load(), save);
export const useApp = appStore.use;

const set = appStore.set;
const byTime = (a: Entry, b: Entry) => a.time.localeCompare(b.time);

export const addEntry = (day: string, e: Entry) =>
  set(s => ({ ...s, diaries: { ...s.diaries, [day]: [...(s.diaries[day] || []), e].sort(byTime) } }));

export const updateEntry = (day: string, id: string, fn: (e: Entry) => Entry) =>
  set(s => ({ ...s, diaries: { ...s.diaries, [day]: (s.diaries[day] || []).map(e => (e.id === id ? fn(e) : e)) } }));

export const deleteEntry = (day: string, id: string) =>
  set(s => ({ ...s, diaries: { ...s.diaries, [day]: (s.diaries[day] || []).filter(e => e.id !== id) } }));

export const setWater = (day: string, cups: number) => set(s => ({ ...s, water: { ...s.water, [day]: cups } }));

export const setPlanMode = (planMode: AppState['planMode']) => set(s => ({ ...s, planMode }));

export const setDietGoal = (k: keyof Macros, v: number) => set(s => ({ ...s, dietGoals: { ...s.dietGoals, [k]: v } }));

export const setBody = <K extends keyof Body>(k: K, v: Body[K]) => set(s => ({ ...s, body: { ...s.body, [k]: v } }));

export const addMsg = (m: ChatMsg) => set(s => ({ ...s, msgs: [...s.msgs, m] }));

export const addWeight = (date: string, kg: number) =>
  set(s => ({ ...s, weights: [...s.weights.filter(w => w.date !== date), { date, kg }].sort((a, b) => a.date.localeCompare(b.date)) }));
