import { useRef, useState } from 'react';
import type { Activity, Body, Macros } from '../types';
import { setBody, setDietGoal, setPlanMode, useApp } from '../store/app';
import { navigate } from '../hooks/useRoute';
import { useToast } from '../hooks/useToast';
import { autoGoals, autoPlan, autoSug } from '../lib/nutrition';
import { dec, fmt } from '../lib/format';
import { MacroTiles } from '../components/MacroTiles';
import { TabBar } from '../components/TabBar';
import './Plano.css';

const GOAL_FIELDS: [keyof Macros, string, string, string][] = [
  ['kcal', 'Calorias', 'kcal', 'var(--pri)'], ['p', 'Proteína', 'g', 'var(--mP)'], ['c', 'Carboidrato', 'g', 'var(--mC)'], ['g', 'Gordura', 'g', 'var(--mG)'], ['f', 'Fibra', 'g', 'var(--mF)']
];
const BODY_FIELDS: [keyof Pick<Body, 'idade' | 'altura' | 'peso'>, string, number, string, number, number][] = [
  ['idade', 'Idade', 1, ' anos', 14, 99], ['altura', 'Altura', 1, ' cm', 130, 220], ['peso', 'Peso', 0.5, ' kg', 40, 250]
];
const ACTIVITY: [Activity, string][] = [['sed', 'Sedentário'], ['leve', 'Leve'], ['mod', 'Moderada'], ['alta', 'Alta']];

function ModeCard({ on, title, sub, onClick }: { on: boolean; title: string; sub: string; onClick: () => void }) {
  return (
    <button className={'mode' + (on ? ' on' : '')} role="radio" aria-checked={on} onClick={onClick}>
      <span className="radio"><span /></span>
      <span className="col" style={{ gap: 2 }}>
        <span style={{ font: '700 calc(15 * var(--u)) var(--font)' }}>{title}</span>
        <span className="muted" style={{ font: '500 calc(12.5 * var(--u)) var(--font)' }}>{sub}</span>
      </span>
    </button>
  );
}

export function Plano() {
  const s = useApp();
  const isAuto = s.planMode === 'auto';
  const [openMeal, setOpenMeal] = useState<string | null>('almoco');
  const [importing, setImporting] = useState(false);
  const [toast, showToast] = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const ag = autoGoals(s.body);
  const b = s.body;

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    // reading the diet is simulated in this build
    setImporting(true);
    setTimeout(() => {
      setImporting(false);
      showToast('Dieta lida: ' + s.dietMeals.length + ' refeições · ' + fmt(s.dietGoals.kcal) + ' kcal. Revise e salve.', 3600);
    }, 1800);
  };
  const editManual = () => showToast('Toque em uma refeição para editar porções e substituições');

  return (
    <>
      <div className="screen">
        <div className="head row" style={{ gap: 10 }}>
          <button className="icon-btn" aria-label="Voltar" onClick={() => navigate('hoje')}>‹</button>
          <h1 className="h-screen" style={{ lineHeight: 1.3 }}>Meu plano</h1>
        </div>
        <div className="muted" style={{ font: '500 calc(14 * var(--u))/1.45 var(--font)', marginTop: -4 }}>De onde vêm suas metas diárias?</div>
        <div className="grid2" role="radiogroup" aria-label="Origem das metas">
          <ModeCard on={!isAuto} title="Tenho dieta" sub="prescrita pelo nutrólogo" onClick={() => setPlanMode('nutro')} />
          <ModeCard on={isAuto} title="Não tenho dieta" sub="o Leve calcula para mim" onClick={() => setPlanMode('auto')} />
        </div>

        {!isAuto ? (
          <>
            <section className="card">
              <div className="row" style={{ gap: 12 }}>
                <div className="pdf placeholder mono">PDF</div>
                <div className="grow">
                  <div style={{ font: '700 calc(15 * var(--u)) var(--font)' }}>Dieta · Dra. Marina Alves</div>
                  <div className="muted" style={{ font: '500 calc(13 * var(--u)) var(--font)' }}>Prescrita em 15 jul · revisão em 12 nov</div>
                </div>
              </div>
              {importing && (
                <div className="reading" aria-live="polite">
                  <span style={{ font: '600 calc(13 * var(--u)) var(--font)' }}>Lendo sua dieta…</span>
                  <span className="sk" style={{ height: 10, width: '80%', borderRadius: 5 }} />
                  <span className="sk" style={{ height: 10, width: '60%', borderRadius: 5 }} />
                </div>
              )}
              <div className="row" style={{ gap: 8 }}>
                <button className="btn pri h46 flex1" onClick={() => fileRef.current?.click()}>Importar foto ou PDF</button>
                <button className="btn sec h46 flex1" onClick={editManual}>Digitar à mão</button>
              </div>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={onImport} />
              <span className="small">A IA lê refeições, porções e substituições. Você revisa tudo antes de salvar.</span>
            </section>

            <section className="card">
              <div className="row-between"><span className="h-card">Metas diárias</span><span className="small" style={{ fontWeight: 500 }}>definidas pelo nutrólogo</span></div>
              <div className="grid2" style={{ gap: 8 }}>
                {GOAL_FIELDS.map(([k, label, unit, color]) => (
                  <label key={k} className="goal">
                    <span className="goal-label"><span className="mdot" style={{ background: color }} />{label}</span>
                    <span className="row" style={{ alignItems: 'baseline', gap: 4 }}>
                      <input type="number" inputMode="numeric" value={s.dietGoals[k]} onChange={e => setDietGoal(k, Math.max(0, Math.round(+e.target.value || 0)))} />
                      <span className="label">{unit}</span>
                    </span>
                  </label>
                ))}
              </div>
              <span className="small">O agente nunca muda essas metas. Sugestões viram uma proposta para você levar à consulta.</span>
            </section>

            <div className="row-between" style={{ marginTop: 4 }}><span className="h-sec">Refeições da dieta</span><span className="muted" style={{ font: '500 calc(13 * var(--u)) var(--font)' }}>{s.dietMeals.length} refeições</span></div>
            {s.dietMeals.map(m => {
              const open = openMeal === m.id;
              return (
                <div key={m.id} className="card flat r20">
                  <button className="diet-head" aria-expanded={open} onClick={() => setOpenMeal(open ? null : m.id)}>
                    <span className="diet-time">{m.time}</span>
                    <span className="grow col">
                      <span style={{ font: '600 calc(15 * var(--u)) var(--font)' }}>{m.name}</span>
                      <span className="muted" style={{ font: '500 calc(13 * var(--u)) var(--font)' }}>~{fmt(m.kcal)} kcal · {m.subs.length} {m.subs.length > 1 ? 'substituições' : 'substituição'}</span>
                    </span>
                    <span className="chev" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
                  </button>
                  {open && (
                    <div className="diet-body">
                      <div className="bullets" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                        {m.items.map(t => <span key={t}><span className="bullet" />{t}</span>)}
                      </div>
                      <span className="label" style={{ fontSize: 'calc(12 * var(--u))' }}>Substituições permitidas</span>
                      <div className="chips">{m.subs.map(t => <span key={t} className="sub">{t}</span>)}</div>
                    </div>
                  )}
                </div>
              );
            })}
            <button className="btn dashed" onClick={editManual}>+ Adicionar refeição</button>
          </>
        ) : (
          <>
            <div className="auto-intro">Sem dieta prescrita, o Leve calcula suas metas com seus dados e o ritmo que você escolher — e sugere o que comer em cada refeição. É uma estimativa: vale validar com um profissional quando puder.</div>
            <section className="card">
              <span className="h-card">Seus dados</span>
              <div className="seg fill">
                <button className={b.sexo === 'M' ? 'on' : ''} style={{ height: 40 }} onClick={() => setBody('sexo', 'M')}>Masculino</button>
                <button className={b.sexo === 'F' ? 'on' : ''} style={{ height: 40 }} onClick={() => setBody('sexo', 'F')}>Feminino</button>
              </div>
              {BODY_FIELDS.map(([k, label, st, unit, mn, mx]) => (
                <div key={k} className="row">
                  <span className="grow" style={{ font: '600 calc(15 * var(--u)) var(--font)' }}>{label}</span>
                  <button className="step" aria-label={'Diminuir ' + label.toLowerCase()} onClick={() => setBody(k, Math.max(mn, b[k] - st))}>−</button>
                  <span className="body-val num">{(st < 1 ? dec(b[k]) : b[k]) + unit}</span>
                  <button className="step" aria-label={'Aumentar ' + label.toLowerCase()} onClick={() => setBody(k, Math.min(mx, b[k] + st))}>+</button>
                </div>
              ))}
              <span className="label" style={{ marginTop: 4 }}>Nível de atividade</span>
              <div className="chips">{ACTIVITY.map(([id, label]) => <button key={id} className={'chip' + (b.atividade === id ? ' on' : '')} aria-pressed={b.atividade === id} onClick={() => setBody('atividade', id)}>{label}</button>)}</div>
              <span className="label" style={{ marginTop: 4 }}>Ritmo de perda</span>
              <div className="chips">{[0.25, 0.5, 0.75].map(r => <button key={r} className={'chip' + (b.ritmo === r ? ' on' : '')} aria-pressed={b.ritmo === r} onClick={() => setBody('ritmo', r)}>{dec(r, 2).replace(/0$/, '')} kg/semana</button>)}</div>
            </section>

            <section className="card">
              <span className="label">Sua meta diária calculada</span>
              <div className="row" style={{ alignItems: 'baseline', gap: 6 }}><span className="calc-num num">{fmt(ag.kcal)}</span><span className="muted" style={{ font: '600 calc(15 * var(--u)) var(--font)' }}>kcal</span></div>
              <span className="muted" style={{ font: '500 calc(13 * var(--u))/1.45 var(--font)' }}>Gasto estimado {fmt(ag.tdee)} kcal − déficit {fmt(ag.def)} kcal</span>
              {ag.floored && <span className="warn-box" style={{ borderRadius: 12 }}>Ajustamos para o mínimo seguro. Para perder mais rápido, converse com um profissional.</span>}
              <MacroTiles m={ag} small />
            </section>

            <div className="row-between" style={{ marginTop: 4 }}><span className="h-sec">O que comer hoje</span><span className="muted" style={{ font: '500 calc(13 * var(--u)) var(--font)' }}>recalcula com seus dados</span></div>
            {autoPlan(ag.kcal).map(m => (
              <div key={m.id} className="card r20 auto-meal">
                <span className="diet-time" style={{ paddingTop: 2 }}>{m.time}</span>
                <span className="grow col" style={{ gap: 4 }}>
                  <span className="row-between"><span style={{ font: '600 calc(15 * var(--u)) var(--font)' }}>{m.name}</span><span style={{ font: '700 calc(14 * var(--u)) var(--font)', whiteSpace: 'nowrap' }}>~{fmt(m.kcal)} kcal</span></span>
                  <span className="muted" style={{ font: '500 calc(13.5 * var(--u))/1.45 var(--font)' }}>{autoSug(m.id, m.kcal)}</span>
                </span>
              </div>
            ))}
            <button className="btn sec" style={{ background: 'var(--card)', fontSize: 'calc(14 * var(--u))' }} onClick={() => navigate('agente')}>Pedir outras opções ao agente</button>
            <button className="btn txt" style={{ height: 44, color: 'var(--pri)', fontSize: 'calc(14 * var(--u))' }} onClick={() => setPlanMode('nutro')}>Recebi uma dieta · cadastrar agora</button>
          </>
        )}
      </div>
      {toast && <div className="toast bottom" role="status">{toast}</div>}
      <TabBar active="plano" />
    </>
  );
}
