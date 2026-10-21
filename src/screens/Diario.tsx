import { useState } from 'react';
import type { Entry } from '../types';
import { addEntry, deleteEntry, updateEntry, useApp } from '../store/app';
import { navigate } from '../hooks/useRoute';
import { useToast } from '../hooks/useToast';
import { goals, sumEntries } from '../lib/nutrition';
import { decTrim, fmt } from '../lib/format';
import { WEEK_LONG, WEEK_SHORT, addDays, dateKey, longDate, rangeLabel, today } from '../lib/dates';
import { MacroPills } from '../components/MacroTiles';
import { TabBar } from '../components/TabBar';
import './Diario.css';

const MIN_OFFSET = -27, MAX_OFFSET = 1;

export function Diario() {
  const s = useApp();
  const META = goals(s);
  const [mode, setMode] = useState<'dia' | 'semana'>('dia');
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<{ day: string; e: Entry } | null>(null);
  const [toast, showToast, hideToast] = useToast();

  const t0 = today();
  const date = addDays(t0, offset);
  const day = dateKey(date);
  const dt = sumEntries(s.diaries[day]);
  const dOver = dt.kcal > META.kcal * 1.05;
  const label = offset === 0 ? 'Hoje' : offset === 1 ? 'Amanhã' : offset === -1 ? 'Ontem' : WEEK_LONG[date.getDay()];
  const status = offset > 0 ? 'ainda não começou' : dOver ? 'acima da meta' : offset === 0 ? 'em andamento' : 'dentro da meta';
  const entries = s.diaries[day] || [];

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(t0, i - 6);
    return { d, off: i - 6, kcal: sumEntries(s.diaries[dateKey(d)]).kcal };
  });
  const weekAvg = week.reduce((a, w) => a + w.kcal, 0) / 7;

  const go = (o: number) => { setOffset(Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, o))); setEditing(null); };
  const del = (e: Entry) => {
    deleteEntry(day, e.id);
    setDeleted({ day, e });
    setEditing(null);
    showToast('Registro excluído · total recalculado', 4500);
  };
  const undo = () => {
    if (!deleted) return;
    addEntry(deleted.day, deleted.e);
    setDeleted(null);
    hideToast();
  };

  return (
    <>
      <div className="screen">
        <div className="head row-between" style={{ alignItems: 'center' }}>
          <h1 className="h-screen" style={{ lineHeight: 1.3 }}>Diário</h1>
          <div className="seg">
            <button className={mode === 'dia' ? 'on' : ''} onClick={() => setMode('dia')}>Dia</button>
            <button className={mode === 'semana' ? 'on' : ''} onClick={() => setMode('semana')}>Semana</button>
          </div>
        </div>

        {mode === 'dia' ? (
          <>
            <div className="row" style={{ gap: 8 }}>
              <button className="icon-btn" style={{ fontSize: 20 }} aria-label="Dia anterior" disabled={offset <= MIN_OFFSET} onClick={() => go(offset - 1)}>‹</button>
              <div className="grow" style={{ textAlign: 'center' }}>
                <div style={{ font: '700 calc(17 * var(--u)) var(--font)' }}>{label}</div>
                <div className="muted" style={{ font: '500 calc(13 * var(--u)) var(--font)' }}>{longDate(date)}</div>
              </div>
              <button className="icon-btn" style={{ fontSize: 20 }} aria-label="Próximo dia" disabled={offset >= MAX_OFFSET} onClick={() => go(offset + 1)}>›</button>
            </div>
            <div className="strip">
              {week.map(w => {
                const on = w.off === offset;
                const hi = w.kcal > META.kcal * 1.05;
                return (
                  <button key={w.off} className={on ? 'on' : ''} aria-pressed={on} aria-label={longDate(w.d)} onClick={() => go(w.off)}>
                    <span className="strip-d">{WEEK_SHORT[w.d.getDay()]}</span>
                    <span className="strip-n">{w.d.getDate()}</span>
                    <span className="strip-bar"><span style={{ height: Math.max(3, Math.min(24, (w.kcal / 2400) * 24)), background: hi ? 'var(--ambLine)' : on ? 'var(--bg)' : 'var(--pri)' }} /></span>
                  </button>
                );
              })}
            </div>

            <section className="card">
              <div className="row-between">
                <span className="label">Total do dia</span>
                <span className="label" style={{ color: dOver ? 'var(--amb)' : 'var(--ink2)' }}>{status}</span>
              </div>
              <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
                <span className="day-num num">{fmt(dt.kcal)}</span>
                <span className="muted" style={{ font: '600 calc(15 * var(--u)) var(--font)' }}>/ {fmt(META.kcal)} kcal</span>
              </div>
              <div className="bar" style={{ height: 8, borderRadius: 4 }}><div style={{ width: Math.min(100, (dt.kcal / META.kcal) * 100).toFixed(1) + '%', background: dOver ? 'var(--ambLine)' : 'var(--pri)', transition: 'width .6s' }} /></div>
              <MacroPills m={dt} />
            </section>

            {entries.length === 0 && (
              <section className="card empty">
                <div className="empty-ico placeholder" />
                <div className="empty-h">Nada registrado ainda</div>
                <div className="empty-p">Quando você registrar uma refeição, ela aparece aqui com horário e totais.</div>
                <button className="btn pri h48" style={{ marginTop: 6, padding: '0 20px', borderRadius: 16, fontSize: 'calc(15 * var(--u))' }} onClick={() => navigate('registrar')}>Registrar refeição</button>
              </section>
            )}

            {entries.map(e => {
              const ed = editing === e.id;
              return (
                <div key={e.id} className="entry">
                  <div className="entry-rail"><span className="num">{e.time}</span><span className="line" /></div>
                  <div className={'card r20 entry-card' + (e.fora ? ' fora' : '')}>
                    <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                      <div className={'thumb' + (e.photo && !e.thumb ? ' placeholder' : '')} style={e.thumb ? { backgroundImage: `url(${e.thumb})` } : undefined}>{e.thumb ? '' : e.photo ? 'foto' : 'texto'}</div>
                      <div className="grow col" style={{ gap: 3 }}>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <span className="entry-title">{e.title}</span>
                          {e.fora && <span className="badge warn" style={{ padding: '2px 7px', borderRadius: 7, fontSize: 'calc(11 * var(--u))' }}>Fora do plano</span>}
                        </div>
                        <span className="entry-desc">{e.desc}</span>
                      </div>
                      <div style={{ textAlign: 'right', flex: 'none' }}>
                        <div className="entry-kcal num">{fmt(e.kcal * e.mult)}</div>
                        <div className="muted" style={{ font: '500 calc(11 * var(--u)) var(--font)' }}>kcal</div>
                      </div>
                    </div>
                    {ed && (
                      <div className="portion">
                        <span className="grow" style={{ font: '600 calc(14 * var(--u)) var(--font)' }}>Porção</span>
                        <button className="step on-card" aria-label="Menos" onClick={() => updateEntry(day, e.id, x => ({ ...x, mult: Math.max(0.25, x.mult - 0.25) }))}>−</button>
                        <span className="portion-val">{decTrim(e.mult)}×</span>
                        <button className="step on-card" aria-label="Mais" onClick={() => updateEntry(day, e.id, x => ({ ...x, mult: Math.min(3, x.mult + 0.25) }))}>+</button>
                      </div>
                    )}
                    <div className="row" style={{ gap: 8 }}>
                      <button className="entry-btn" onClick={() => setEditing(ed ? null : e.id)}>{ed ? 'Pronto' : 'Editar'}</button>
                      <button className="entry-btn" onClick={() => del(e)}>Excluir</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <section className="card" style={{ gap: 4 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <span className="h-card">{rangeLabel(week[0].d, week[6].d)}</span>
              <span className="label">média {fmt(weekAvg)} kcal</span>
            </div>
            {week.map(w => (
              <button key={w.off} className="week-row" onClick={() => { go(w.off); setMode('dia'); }}>
                <span style={{ font: '600 calc(14 * var(--u)) var(--font)' }}>{w.off === 0 ? 'Hoje' : WEEK_SHORT[w.d.getDay()] + ' ' + w.d.getDate()}</span>
                <span className="week-bar">
                  <span style={{ width: Math.min(100, (w.kcal / 2400) * 100) + '%', background: w.kcal > META.kcal * 1.05 ? 'var(--ambLine)' : 'var(--pri)' }} />
                  <span className="meta-line" style={{ left: Math.min(100, (META.kcal / 2400) * 100).toFixed(1) + '%' }} />
                </span>
                <span className="num" style={{ font: '700 calc(14 * var(--u)) var(--font)', textAlign: 'right' }}>{fmt(w.kcal)}</span>
              </button>
            ))}
            <div className="small" style={{ fontWeight: 500, marginTop: 6 }}>Linha vertical = meta de {fmt(META.kcal)} kcal · toque em um dia para abrir</div>
          </section>
        )}
      </div>
      {toast && (
        <div className="toast bottom action" role="status">
          <span className="grow">{toast}</span>
          {deleted && <button onClick={undo}>Desfazer</button>}
        </div>
      )}
      <TabBar active="diario" />
    </>
  );
}
