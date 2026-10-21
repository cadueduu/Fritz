import { useState } from 'react';
import { addWeight, useApp } from '../store/app';
import { goals, sumEntries } from '../lib/nutrition';
import { dec, fmt } from '../lib/format';
import { WEEK_LETTER, addDays, dateKey, daysBetween, parseKey, shortDate, today, todayKey } from '../lib/dates';
import { TabBar } from '../components/TabBar';
import './Progresso.css';

const W = 280, H = 150;

// body measurements are not stored yet; the cards show the layout without values
const MEASURES = [['Cintura', 'cm'], ['Quadril', 'cm'], ['Braço', 'cm'], ['Coxa', 'cm'], ['Gordura corporal', '%'], ['Massa magra', 'kg']];

function useWeightChart(weights: { date: string; kg: number }[], n: number) {
  const t0 = today();
  const start = addDays(t0, -(n - 1));
  const pts = weights.filter(w => parseKey(w.date) >= start).map(w => ({ x: daysBetween(start, parseKey(w.date)), kg: w.kg }));
  // 7-day moving average over the weigh-ins in the trailing week
  const all = weights.map(w => ({ t: parseKey(w.date).getTime(), kg: w.kg }));
  const ma = pts.map(p => {
    const end = addDays(start, p.x).getTime();
    const win = all.filter(a => a.t <= end && a.t > end - 7 * 86400000);
    return win.reduce((s, a) => s + a.kg, 0) / win.length;
  });
  if (pts.length < 2) return null;
  const vals = [...pts.map(p => p.kg), ...ma];
  const mn = Math.floor(Math.min(...vals) - 0.3), mx = Math.ceil(Math.max(...vals) + 0.3);
  const X = (x: number) => (x / (n - 1)) * W;
  const Y = (v: number) => H - ((v - mn) / (mx - mn)) * H;
  const path = pts.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(ma[i]).toFixed(1)).join(' ');
  const r0 = n > 40 ? 1.6 : 2.4;
  const dots = pts.map(p => `M${(X(p.x) - r0).toFixed(1)} ${Y(p.kg).toFixed(1)}a${r0} ${r0} 0 1 0 ${2 * r0} 0a${r0} ${r0} 0 1 0 ${-2 * r0} 0`).join('');
  const gv = [0, 1, 2, 3].map(k => mn + ((mx - mn) * k) / 3);
  const last = pts.length - 1;
  return {
    path, dots,
    area: path + ` L${X(pts[last].x).toFixed(1)} ${H} L${X(pts[0].x).toFixed(1)} ${H} Z`,
    grid: gv.map(v => `M0 ${Y(v).toFixed(1)} H${W}`).join(' '),
    labels: gv.map(v => ({ y: Y(v) + 10, label: dec(v, 0) })),
    lx: X(pts[last].x), ly: Y(ma[last]),
    trend: ma[last], todayKg: pts[last].kg, isToday: pts[last].x === n - 1,
    delta: ma[last] - ma[0]
  };
}

export function Progresso() {
  const s = useApp();
  const META = goals(s);
  const [period, setPeriod] = useState<28 | 84>(84);
  const [weighing, setWeighing] = useState(false);
  const lastKg = s.weights.length ? s.weights[s.weights.length - 1].kg : s.body.peso;
  const [kgInput, setKgInput] = useState('');
  const chart = useWeightChart(s.weights, period);

  const t0 = today();
  const dayK = (o: number) => sumEntries(s.diaries[dateKey(addDays(t0, o))]);
  const week = Array.from({ length: 7 }, (_, i) => ({ d: addDays(t0, i - 6), kcal: dayK(i - 6).kcal }));

  // adherence: share of logged entries that were part of the plan
  const adherence = (from: number) => {
    let inPlan = 0, total = 0;
    for (let o = from; o < from + 7; o++) (s.diaries[dateKey(addDays(t0, o))] || []).forEach(e => { total++; if (!e.fora) inPlan++; });
    return total ? Math.round((inPlan / total) * 100) : null;
  };
  const adh = adherence(-6), adhPrev = adherence(-13);
  const consist = Array.from({ length: 28 }, (_, i) => (s.diaries[dateKey(addDays(t0, i - 27))] || []).length);
  const logged = consist.filter(n => n > 0).length;

  const first = s.weights[0];
  const ADH_C = 2 * Math.PI * 38;

  const saveWeight = () => {
    const kg = parseFloat(kgInput.replace(',', '.'));
    if (!(kg > 20 && kg < 400)) return;
    addWeight(todayKey(), Math.round(kg * 10) / 10);
    setWeighing(false);
  };

  return (
    <>
      <div className="screen">
        <div className="head row-between" style={{ alignItems: 'center' }}>
          <h1 className="h-screen" style={{ lineHeight: 1.3 }}>Progresso</h1>
          <button className="btn h44" style={{ background: 'var(--card)', boxShadow: 'var(--shadow)', color: 'var(--ink)', fontWeight: 600, padding: '0 14px' }} onClick={() => { setKgInput(dec(lastKg).replace(/,0$/, '')); setWeighing(true); }}>+ Pesagem</button>
        </div>

        <section className="card r28" style={{ padding: 20, gap: 14 }}>
          <div className="row-between" style={{ alignItems: 'center' }}>
            <span className="h-card">Peso</span>
            <div className="seg sm">
              <button className={period === 28 ? 'on' : ''} onClick={() => setPeriod(28)}>4 sem</button>
              <button className={period === 84 ? 'on' : ''} onClick={() => setPeriod(84)}>12 sem</button>
            </div>
          </div>
          {chart ? (
            <>
              <div className="row-between" style={{ alignItems: 'flex-end', gap: 12 }}>
                <div>
                  <div className="ring-cap-sm">Tendência</div>
                  <div className="row" style={{ alignItems: 'baseline', gap: 6 }}><span className="trend-num num">{dec(chart.trend)}</span><span className="muted" style={{ font: '600 calc(16 * var(--u)) var(--font)' }}>kg</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="badge ok" style={{ display: 'inline-block', padding: '6px 10px', fontSize: 'calc(14 * var(--u))' }}>{dec(chart.delta).replace('-', '−')} kg em {period === 28 ? 4 : 12} sem</div>
                  <div className="small" style={{ fontWeight: 500, marginTop: 6 }}>{chart.isToday ? 'pesagem de hoje' : 'última pesagem'} {dec(chart.todayKg)} kg</div>
                  {s.rotina && <div className="small" style={{ fontWeight: 600, marginTop: 2, color: 'var(--pri)' }}>meta {dec(s.rotina.pesoMeta)} kg · {Math.abs(chart.trend - s.rotina.pesoMeta) < 0.3 ? 'chegou!' : 'faltam ' + dec(Math.abs(chart.trend - s.rotina.pesoMeta)) + ' kg'}</div>}
                </div>
              </div>
              <div className="chart">
                <svg width="100%" height="170" viewBox="0 -10 310 170" preserveAspectRatio="xMinYMid meet" role="img" aria-label={'Tendência de peso ' + dec(chart.trend) + ' kg'}>
                  <path d={chart.grid} stroke="var(--line)" strokeWidth="1" fill="none" />
                  <path d={chart.area} fill="var(--priSoft)" opacity=".7" />
                  <path d={chart.dots} fill="var(--ink2)" opacity=".35" />
                  <path d={chart.path} stroke="var(--pri)" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx={chart.lx} cy={chart.ly} r="6" fill="var(--card)" stroke="var(--pri)" strokeWidth="3" />
                  {chart.labels.map(l => <text key={l.label + l.y} x="306" y={l.y - 10} dominantBaseline="middle" textAnchor="end" className="axis">{l.label}</text>)}
                </svg>
              </div>
              <div className="row small" style={{ gap: 16, fontWeight: 500 }}>
                <span className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 3.5, borderRadius: 2, background: 'var(--pri)' }} />Média móvel 7 dias</span>
                <span className="row" style={{ gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--ink2)', opacity: .5 }} />Pesagem diária</span>
              </div>
            </>
          ) : (
            <div className="muted" style={{ font: '500 calc(14 * var(--u))/1.5 var(--font)', padding: '12px 0' }}>Registre pelo menos duas pesagens para ver sua tendência.</div>
          )}
          <div className="muted" style={{ font: '500 calc(13 * var(--u))/1.45 var(--font)', borderTop: '1px solid var(--line)', paddingTop: 12 }}>O peso do dia varia com água e sal. Olhe para a linha: ela mostra a direção real.</div>
        </section>

        <div className="row-between" style={{ marginTop: 4 }}><span className="h-sec">Medidas</span></div>
        <div className="grid2">
          {MEASURES.map(([label, unit]) => (
            <div key={label} className="card r20 measure">
              <span className="label">{label}</span>
              <span className="measure-val">—<span className="label"> {unit}</span></span>
              <span className="measure-delta muted" style={{ color: 'var(--ink2)' }}>sem registro</span>
            </div>
          ))}
        </div>

        <div className="row-between" style={{ marginTop: 4 }}><span className="h-sec">Fotos de progresso</span><span style={{ font: '600 calc(13 * var(--u)) var(--font)', color: 'var(--pri)' }}>Comparar</span></div>
        <div className="card photos">
          <div className="col" style={{ gap: 6 }}><div className="photo placeholder mono">foto · antes</div><span className="photo-cap">{first ? shortDate(parseKey(first.date)) + ' · ' + dec(first.kg) + ' kg' : '—'}</span></div>
          <div className="col" style={{ gap: 6 }}><div className="photo placeholder mono">foto · agora</div><span className="photo-cap">{shortDate(addDays(t0, -1))} · {chart ? dec(chart.trend) : dec(lastKg)} kg</span></div>
        </div>

        <section className="card">
          <div className="row-between"><span className="h-card">Calorias vs meta</span><span className="small" style={{ fontWeight: 500 }}>últimos 7 dias</span></div>
          <div className="kbars">
            <div className="kbars-meta" style={{ bottom: (Math.min(1, META.kcal / 2400) * 130).toFixed(1) + 'px' }} />
            {week.map((w, i) => <div key={i} style={{ height: Math.max(4, (w.kcal / 2400) * 130), background: w.kcal > META.kcal * 1.05 ? 'var(--ambLine)' : 'var(--pri)' }} />)}
          </div>
          <div className="kbars-labels">{week.map((w, i) => <span key={i}>{WEEK_LETTER[w.d.getDay()]}</span>)}</div>
          <div className="row small" style={{ gap: 14, fontWeight: 500 }}>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--pri)' }} />na meta</span>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--ambLine)' }} />acima</span>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 14, borderTop: '2px dashed var(--ink2)' }} />{fmt(META.kcal)}</span>
          </div>
        </section>

        <div className="grid2">
          <div className="card p16" style={{ alignItems: 'center', gap: 8 }}>
            <span style={{ font: '700 calc(14 * var(--u)) var(--font)', alignSelf: 'flex-start' }}>Aderência ao plano</span>
            <div style={{ position: 'relative', width: 96, height: 96 }}>
              <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }} aria-hidden>
                <circle cx="48" cy="48" r="38" fill="none" stroke="var(--track)" strokeWidth="10" />
                <circle cx="48" cy="48" r="38" fill="none" stroke="var(--pri)" strokeWidth="10" strokeLinecap="round" strokeDasharray={ADH_C.toFixed(2)} strokeDashoffset={(ADH_C * (1 - (adh ?? 0) / 100)).toFixed(2)} />
              </svg>
              <span className="adh-num">{adh == null ? '—' : adh + '%'}</span>
            </div>
            <span className="small" style={{ fontWeight: 500, textAlign: 'center' }}>{adh != null && adhPrev != null ? (adh - adhPrev >= 0 ? '+' : '−') + Math.abs(adh - adhPrev) + ' pts vs semana passada' : 'registros fora do plano contam contra'}</span>
          </div>
          <div className="card p16" style={{ gap: 10 }}>
            <span style={{ font: '700 calc(14 * var(--u)) var(--font)' }}>Consistência</span>
            <div className="consist">
              {consist.map((n, i) => <span key={i} className={n >= 3 ? 'full' : n > 0 ? 'part' : ''} />)}
            </div>
            <span className="small" style={{ fontWeight: 500 }}>{logged} de 28 dias registrados</span>
          </div>
        </div>
      </div>

      {weighing && (
        <div className="scrim" onClick={e => { if (e.target === e.currentTarget) setWeighing(false); }}>
          <form className="sheet" role="dialog" aria-label="Nova pesagem" onSubmit={e => { e.preventDefault(); saveWeight(); }}>
            <h2>Pesagem de hoje</h2>
            <p>Pese-se de manhã, em jejum, para comparar dias parecidos.</p>
            <label className="kg-field"><input autoFocus inputMode="decimal" value={kgInput} onChange={e => setKgInput(e.target.value)} aria-label="Peso em kg" /><span>kg</span></label>
            <div className="row" style={{ gap: 8, width: '100%', marginTop: 10 }}>
              <button type="button" className="btn sec flex1" onClick={() => setWeighing(false)}>Cancelar</button>
              <button type="submit" className="btn pri flex1">Salvar</button>
            </div>
          </form>
        </div>
      )}
      <TabBar active="progresso" />
    </>
  );
}
