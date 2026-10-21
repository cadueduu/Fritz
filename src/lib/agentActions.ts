// The agent's proposals arrive as loose JSON from the model; keep only well-formed ones.
import type { AgentAction, MealId, PlanMealId } from '../types';
import { newId } from './format';

const MEALS: PlanMealId[] = ['cafe', 'lanche1', 'almoco', 'lanche2', 'jantar'];
const n = (v: unknown, lo = 0, hi = 100000) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const time = (v: unknown) => (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, '0') : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

export function cleanActions(raw: unknown): AgentAction[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a): AgentAction[] => {
    if (!a || typeof a !== 'object') return [];
    const r = a as Record<string, unknown>;
    switch (r.type) {
      case 'dieta': {
        const m = (r.metas ?? {}) as Record<string, unknown>;
        const refeicoes = (Array.isArray(r.refeicoes) ? r.refeicoes : []).flatMap(x => {
          const q = x as Record<string, unknown>;
          return MEALS.includes(q.id as PlanMealId)
            ? [{ id: q.id as PlanMealId, nome: str(q.nome), horario: time(q.horario) ?? '12:00', kcal: Math.round(n(q.kcal, 0, 3000)), itens: strs(q.itens), substituicoes: strs(q.substituicoes) }]
            : [];
        });
        const kcal = Math.round(n(m.kcal, 0, 6000));
        if (!kcal || !refeicoes.length) return [];
        return [{ type: 'dieta', resumo: str(r.resumo), metas: { kcal, p: Math.round(n(m.p, 0, 400)), c: Math.round(n(m.c, 0, 800)), g: Math.round(n(m.g, 0, 300)), f: Math.round(n(m.f, 0, 100)) }, refeicoes }];
      }
      case 'refeicao': {
        const meal = [...MEALS, 'extra'].includes(r.refeicao as string) ? (r.refeicao as MealId) : 'extra';
        const kcal = n(r.kcal, 0, 5000);
        if (!kcal || !str(r.descricao)) return [];
        return [{ type: 'refeicao', id: newId(), refeicao: meal, data: date(r.data), horario: time(r.horario), descricao: str(r.descricao), kcal, p: n(r.p, 0, 500), c: n(r.c, 0, 800), g: n(r.g, 0, 400), f: n(r.f, 0, 150) }];
      }
      case 'peso': {
        const kg = Math.round(n(r.kg) * 10) / 10;
        return kg > 20 && kg < 400 ? [{ type: 'peso', kg, data: date(r.data) }] : [];
      }
      case 'anamnese': {
        const itens = (Array.isArray(r.itens) ? r.itens : []).flatMap(x => {
          const q = x as Record<string, unknown>;
          return str(q.tema) && str(q.resposta) ? [{ tema: str(q.tema).slice(0, 60), resposta: str(q.resposta).slice(0, 500) }] : [];
        });
        return itens.length ? [{ type: 'anamnese', itens }] : [];
      }
      case 'agua':
        return [{ type: 'agua', copos: Math.round(n(r.copos, 0, 8)) }];
      default:
        return [];
    }
  });
}
