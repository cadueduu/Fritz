// App data, loaded from Supabase after sign-in. Actions update the screen immediately and save in the background.
import type { AppState, Body, ChatMsg, DietMeal, DietProposal, Entry, Macros, MealId } from '../types';
import { DEFAULT_GOALS, DIET } from '../data/plan';
import { supabase } from '../lib/supabase';
import { createStore } from './createStore';
import { session } from './session';

export const DEFAULT_BODY: Body = { sexo: 'M', idade: 35, altura: 170, peso: 80, atividade: 'mod', ritmo: 0.5 };

const empty = (): AppState => ({
  version: 1,
  profile: { name: '', email: '' },
  planMode: 'auto',
  dietGoals: { ...DEFAULT_GOALS },
  dietMeals: DIET,
  body: { ...DEFAULT_BODY },
  diaries: {},
  water: {},
  weights: [],
  msgs: []
});

export const appStore = createStore<AppState>(empty());
export const useApp = appStore.use;

const set = appStore.set;
const byTime = (a: Entry, b: Entry) => a.time.localeCompare(b.time);

// ---------- Supabase rows ----------

interface EntryRow {
  id: string; day: string; time: string; meal: MealId; title: string; description: string;
  kcal: number; p: number; c: number; g: number; f: number; fora: boolean; photo: boolean; thumb: string | null; mult: number;
}

const toRow = (day: string, e: Entry): EntryRow => ({
  id: e.id, day, time: e.time, meal: e.meal, title: e.title, description: e.desc,
  kcal: e.kcal, p: e.p, c: e.c, g: e.g, f: e.f, fora: e.fora, photo: e.photo, thumb: e.thumb ?? null, mult: e.mult
});

const fromRow = (r: EntryRow): Entry => ({
  id: r.id, time: r.time, meal: r.meal, title: r.title, desc: r.description,
  kcal: +r.kcal, p: +r.p, c: +r.c, g: +r.g, f: +r.f, fora: r.fora, photo: r.photo, thumb: r.thumb ?? undefined, mult: +r.mult
});

const fail = (error: unknown) => {
  console.error(error);
  session.set(s => ({ ...s, syncError: 'Não foi possível salvar. Verifique sua conexão e tente de novo.' }));
};

/** Runs a save in the background and surfaces failures as a toast. */
const save = (op: PromiseLike<{ error: unknown }>) => {
  Promise.resolve(op).then(({ error }) => { if (error) fail(error); }, fail);
};

let profileUser: string | null = null;

/** Loads everything for the signed-in user. */
export async function loadUserData(userId: string, email = '') {
  const [profile, entries, water, weights, msgs] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('entries').select('*').order('day').order('time'),
    supabase.from('water').select('day, cups'),
    supabase.from('weights').select('day, kg').order('day'),
    supabase.from('messages').select('sender, text, diet').order('created_at')
  ]);
  const err = profile.error || entries.error || water.error || weights.error || msgs.error;
  if (err) throw err;

  const s = empty();
  s.profile.email = email;
  const p = profile.data;
  if (p) {
    s.profile.name = p.name ?? '';
    s.planMode = p.plan_mode === 'nutro' ? 'nutro' : 'auto';
    if (p.diet_goals) s.dietGoals = { ...DEFAULT_GOALS, ...(p.diet_goals as Macros) };
    if (p.diet_meals) s.dietMeals = p.diet_meals as DietMeal[];
    if (p.body) s.body = { ...DEFAULT_BODY, ...(p.body as Body) };
  } else {
    // the profile is created by a database trigger on sign-up; recreate it if it is missing
    save(supabase.from('profiles').insert({ user_id: userId }));
  }
  (entries.data as EntryRow[]).forEach(r => { (s.diaries[r.day] ||= []).push(fromRow(r)); });
  Object.values(s.diaries).forEach(list => list.sort(byTime));
  (water.data as { day: string; cups: number }[]).forEach(w => { s.water[w.day] = w.cups; });
  s.weights = (weights.data as { day: string; kg: number }[]).map(w => ({ date: w.day, kg: +w.kg }));
  s.msgs = (msgs.data as { sender: ChatMsg['from']; text: string; diet: DietProposal | null }[]).map(m => ({ from: m.sender, text: m.text, diet: m.diet ?? undefined }));
  set(() => s);
  profileUser = userId;
}

export const resetUserData = () => { profileUser = null; set(() => empty()); };

// goals and body change on every keystroke or tap, so profile saves are debounced
let profileTimer: number | undefined;
const saveProfile = () => {
  clearTimeout(profileTimer);
  profileTimer = window.setTimeout(() => {
    if (!profileUser) return;
    const s = appStore.get();
    save(supabase.from('profiles').update({
      plan_mode: s.planMode, diet_goals: s.dietGoals, diet_meals: s.dietMeals, body: s.body, updated_at: new Date().toISOString()
    }).eq('user_id', profileUser));
  }, 500);
};

// ---------- actions ----------

export const addEntry = (day: string, e: Entry) => {
  set(s => ({ ...s, diaries: { ...s.diaries, [day]: [...(s.diaries[day] || []), e].sort(byTime) } }));
  save(supabase.from('entries').insert(toRow(day, e)));
};

export const updateEntry = (day: string, id: string, fn: (e: Entry) => Entry) => {
  const cur = (appStore.get().diaries[day] || []).find(e => e.id === id);
  if (!cur) return;
  const next = fn(cur);
  set(s => ({ ...s, diaries: { ...s.diaries, [day]: (s.diaries[day] || []).map(e => (e.id === id ? next : e)) } }));
  const { id: _id, ...row } = toRow(day, next);
  save(supabase.from('entries').update(row).eq('id', id));
};

export const deleteEntry = (day: string, id: string) => {
  set(s => ({ ...s, diaries: { ...s.diaries, [day]: (s.diaries[day] || []).filter(e => e.id !== id) } }));
  save(supabase.from('entries').delete().eq('id', id));
};

export const setWater = (day: string, cups: number) => {
  set(s => ({ ...s, water: { ...s.water, [day]: cups } }));
  save(supabase.from('water').upsert({ day, cups }, { onConflict: 'user_id,day' }));
};

export const setPlanMode = (planMode: AppState['planMode']) => { set(s => ({ ...s, planMode })); saveProfile(); };

export const setDietGoal = (k: keyof Macros, v: number) => { set(s => ({ ...s, dietGoals: { ...s.dietGoals, [k]: v } })); saveProfile(); };

export const setBody = <K extends keyof Body>(k: K, v: Body[K]) => { set(s => ({ ...s, body: { ...s.body, [k]: v } })); saveProfile(); };

export const addMsg = (m: ChatMsg) => {
  set(s => ({ ...s, msgs: [...s.msgs, m] }));
  save(supabase.from('messages').insert({ sender: m.from, text: m.text, diet: m.diet ?? null }));
};

/** Makes an agent-proposed diet the user's plan (goals and meals). Only called from the user's tap. */
export const applyDiet = (d: DietProposal) => {
  set(s => ({
    ...s,
    planMode: 'nutro',
    dietGoals: { ...d.metas },
    dietMeals: d.refeicoes.map(r => ({ id: r.id, name: r.nome, time: r.horario, kcal: r.kcal, items: r.itens, subs: r.substituicoes }))
  }));
  saveProfile();
};

export const addWeight = (date: string, kg: number) => {
  set(s => ({ ...s, weights: [...s.weights.filter(w => w.date !== date), { date, kg }].sort((a, b) => a.date.localeCompare(b.date)) }));
  save(supabase.from('weights').upsert({ day: date, kg }, { onConflict: 'user_id,day' }));
};
