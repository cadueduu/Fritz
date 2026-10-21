import { useEffect, useState } from 'react';
import { setWater, useApp } from '../store/app';
import { ringMemo, session, useSession } from '../store/session';
import { navigate } from '../hooks/useRoute';
import { goals, planList, sumEntries } from '../lib/nutrition';
import { decTrim, fmt } from '../lib/format';
import { longDate, today, todayKey } from '../lib/dates';
import { TabBar } from '../components/TabBar';
import { AgentMark } from '../components/AgentMark';
import './Hoje.css';

const C = 2 * Math.PI * 96; // ring circumference, 603.19

/** Counts the number up from wherever the ring was last time, so confirming a meal animates the ring. */
function useRingValue(target: number) {
  const [shown, setShown] = useState(ringMemo.shown ?? target);
  useEffect(() => {
    const from = ringMemo.shown ?? target;
    ringMemo.shown = target;
    if (from === target) { setShown(target); return; }
    const st = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - st) / 1300);
      setShown(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

export function Hoje() {
  const s = useApp();
  const { hojeToast } = useSession();
  const day = todayKey();
  const META = goals(s);
  const PLAN = planList(s);
  const isAuto = s.planMode === 'auto';
  const ents = s.diaries[day] || [];
  const tot = sumEntries(ents);
  const target = Math.round(tot.kcal);
  const shown = useRingValue(target);
  // first paint uses the previous value so the stroke transition runs
  const [ringK, setRingK] = useState(ringMemo.shown ?? target);
  useEffect(() => { const r = requestAnimationFrame(() => setRingK(target)); return () => cancelAnimationFrame(r); }, [target]);

  useEffect(() => {
    if (!hojeToast) return;
    const t = setTimeout(() => session.set(x => ({ ...x, hojeToast: null })), 3600);
    return () => clearTimeout(t);
  }, [hojeToast]);

  const over = tot.kcal > META.kcal;
  const offset = C * (1 - Math.min(1, ringK / META.kcal));
  const water = s.water[day] ?? 0;
  const name = s.profile.name;

  let nextFound = false;
  const planRows = PLAN.map(p => {
    const mine = ents.filter(e => e.meal === p.id);
    const done = mine.length > 0;
    const isNext = !done && !nextFound;
    if (isNext) nextFound = true;
    const k = mine.reduce((a, e) => a + e.kcal * e.mult, 0);
    return { ...p, done, isNext, k };
  });
  const doneCount = planRows.filter(p => p.done).length;

  const macros = ([['Proteína', 'p', 'var(--mP)'], ['Carboidrato', 'c', 'var(--mC)'], ['Gordura', 'g', 'var(--mG)'], ['Fibra', 'f', 'var(--mF)']] as const).map(([label, k, color]) => {
    const val = tot[k], m = META[k], left = m - val;
    return { label, k, color, val, m, pct: m ? Math.min(100, (val / m) * 100) : 0, note: left > 0 ? 'faltam ' + fmt(left) + ' g' : 'meta atingida' };
  });

  return (
    <>
      <div className="screen">
        <div className="head row-between hoje-head">
          <div>
            <div className="hoje-date">{longDate(today())}</div>
            <h1 className="h-screen">{name ? 'Olá, ' + name : 'Olá!'}</h1>
          </div>
          <button className="avatar" aria-label="Meu plano e perfil" onClick={() => navigate('plano')}>{(name || s.profile.email || '?').slice(0, 2).toUpperCase()}</button>
        </div>

        <section className="card r28 ring-card">
          <div className="row-between" style={{ alignItems: 'center' }}>
            <span className="h-card">Calorias</span>
            <span className="badge neutral" style={{ fontWeight: 600 }}>{isAuto ? 'Meta calculada' : 'Meta da sua dieta'}</span>
          </div>
          <div className="ring">
            <svg width="224" height="224" viewBox="0 0 224 224" aria-hidden>
              <circle cx="112" cy="112" r="96" fill="none" stroke="var(--track)" strokeWidth="18" />
              <circle cx="112" cy="112" r="96" fill="none" stroke={over ? 'var(--amb)' : 'var(--pri)'} strokeWidth="18" strokeLinecap="round" strokeDasharray={C.toFixed(2)} strokeDashoffset={offset.toFixed(1)} className="ring-arc" />
            </svg>
            <div className="ring-center">
              <span className="ring-cap">Consumido</span>
              <span className="ring-num num">{fmt(shown)}</span>
              <span className="ring-of">de {fmt(META.kcal)} kcal</span>
            </div>
          </div>
          <div className="ring-stats">
            <div><div className="stat-num num" style={{ color: over ? 'var(--amb)' : 'var(--pri)' }}>{fmt(Math.abs(META.kcal - tot.kcal))}</div><div className="stat-label">{over ? 'acima da meta' : 'restantes'}</div></div>
            <div className="mid"><div className="stat-num">{fmt(META.kcal)}</div><div className="stat-label">meta kcal</div></div>
            <div><div className="stat-num">{doneCount} de {PLAN.length}</div><div className="stat-label">refeições</div></div>
          </div>
          {over && <div className="warn-box">Você passou um pouco da meta hoje. Tudo bem — o que conta é a tendência da semana.</div>}
          {hojeToast && <div className="ring-toast" role="status">{hojeToast}</div>}
        </section>

        <section className="card macros-card">
          {macros.map(m => (
            <div key={m.k} className="macro-row">
              <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                <span className="grow macro-name">{m.label}</span>
                <span className="macro-val num">{fmt(m.val)}<span className="muted" style={{ fontWeight: 500 }}> / {fmt(m.m)} g</span></span>
              </div>
              <div className="bar"><div className="macro-fill" style={{ width: m.pct.toFixed(1) + '%', background: m.color }} /></div>
              <span className="small">{m.note}</span>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="row-between">
            <span className="h-card">Água</span>
            <span className="water-val num">{decTrim(water * 0.25)} L<span className="muted" style={{ fontWeight: 500 }}> / 2 L</span></span>
          </div>
          <div className="cups">
            {Array.from({ length: 8 }, (_, i) => (
              <button key={i} aria-label={'Copo ' + (i + 1)} aria-pressed={i < water} onClick={() => setWater(day, water === i + 1 ? i : i + 1)}>
                <div style={{ height: i < water ? '100%' : '0%' }} />
              </button>
            ))}
          </div>
          <div className="steps-row">
            <span className="h-card grow">Passos</span>
            <span className="water-val">6.240<span className="muted" style={{ fontWeight: 500 }}> / 8.000</span></span>
          </div>
          <div className="steps-bar"><div style={{ width: '78%' }} /></div>
        </section>

        <div className="row-between" style={{ marginTop: 6 }}>
          <span className="h-sec">{isAuto ? 'Sugestão de refeições' : 'Refeições do plano'}</span>
          <button className="link-btn" onClick={() => navigate('plano')}>{isAuto ? 'Ajustar' : 'Ver plano'}</button>
        </div>
        {planRows.map(p => (
          <div key={p.id} className={'meal-row' + (p.isNext ? ' next' : '')}>
            <div className="meal-time num">{p.time}</div>
            <div className="grow">
              <div className="meal-name">{p.name}</div>
              <div className="meal-sub">{p.done ? fmt(p.k) + ' de ~' + fmt(p.kcal) + ' kcal' : '~' + fmt(p.kcal) + (isAuto ? ' kcal · sugestão do Leve' : ' kcal no plano')}</div>
            </div>
            {p.isNext
              ? <button className="btn pri h44" onClick={() => { session.set(x => ({ ...x, regMeal: p.id })); navigate('registrar'); }}>Registrar</button>
              : <span className={'badge ' + (p.done ? 'ok' : 'neutral')}>{p.done ? 'Feita ✓' : 'Pendente'}</span>}
          </div>
        ))}
        {ents.filter(e => e.fora).map(e => (
          <div key={e.id} className="meal-row fora">
            <div className="meal-time num">{e.time}</div>
            <div className="grow">
              <div className="meal-name">{e.title}</div>
              <div className="meal-sub">{fmt(e.kcal * e.mult)} kcal · {e.desc}</div>
            </div>
            <span className="badge warn">Fora do plano</span>
          </div>
        ))}

        <section className="tip">
          <div className="row"><AgentMark size={32} radius={12} ring={12} stroke={2.5} /><span className="tip-title">Dica do agente</span></div>
          <div className="tip-text">Você bateu a meta de proteína 4 dias seguidos. No almoço de hoje, a porção de frango do plano (120–150 g) já garante metade do que falta.</div>
          <button className="btn h44" style={{ alignSelf: 'flex-start', background: 'var(--card)', color: 'var(--ink)', fontWeight: 600 }} onClick={() => navigate('agente')}>Conversar</button>
        </section>
      </div>
      <TabBar active="hoje" />
    </>
  );
}
