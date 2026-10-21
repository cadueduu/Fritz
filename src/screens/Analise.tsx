import { useEffect, useRef, useState } from 'react';
import type { Macros } from '../types';
import { addEntry, useApp } from '../store/app';
import { session, useSession, type Draft } from '../store/session';
import { navigate } from '../hooks/useRoute';
import { FOODS, type FoodKey } from '../data/foods';
import { MEAL_LABEL } from '../data/plan';
import { goals, planList, sumEntries, zero } from '../lib/nutrition';
import { clamp, fmt, newId } from '../lib/format';
import { nowTime, todayKey } from '../lib/dates';
import { thumbnail } from '../lib/image';
import { MacroTiles } from '../components/MacroTiles';
import './Analise.css';

// Photo recognition is simulated in this build: every analysis returns this plate.
interface Item { key: FoodKey; g: number; conf: number; alts: FoodKey[]; by: null | 'corrigido' | 'informado' }
interface Question { id: 'preparo' | 'azeite'; q: string; short: string; opts: string[]; ans: string | null }

const initItems = (): Item[] => [
  { key: 'arroz', g: 120, conf: 94, alts: ['integral', 'parbo'], by: null },
  { key: 'feijao', g: 100, conf: 88, alts: ['feijaoPreto', 'lentilha'], by: null },
  { key: 'frango', g: 130, conf: 68, alts: ['frangoFrito', 'patinho'], by: null },
  { key: 'salada', g: 60, conf: 83, alts: ['brocolis'], by: null }
];
const initQs = (): Question[] => [
  { id: 'preparo', q: 'O frango era grelhado ou frito?', short: 'Frango:', opts: ['Grelhado', 'Frito'], ans: null },
  { id: 'azeite', q: 'Tinha azeite na salada?', short: 'Azeite:', opts: ['Sim, ~1 colher', 'Não tinha'], ans: null }
];
const DOTS = ['var(--mC)', 'var(--mF)', 'var(--mP)', 'var(--pri)', 'var(--mG)'];
const TAGPOS = [{ l: '8%', t: '40%' }, { l: '56%', t: '36%' }, { l: '50%', t: '63%' }, { l: '10%', t: '67%' }, { l: '34%', t: '51%' }];

const totals = (items: Item[]) => {
  const t = zero();
  items.forEach(x => { const f = FOODS[x.key]; (['kcal', 'p', 'c', 'g', 'f'] as const).forEach(k => { t[k] += f[k] * x.g; }); });
  return t;
};

interface Row { label: string; val: string; note: string; bad: boolean }
const okRow = (label: string, val: number, plan: number, unit: string, tol: number, lowIsBad = false): Row => {
  const d = val - plan;
  const over = !lowIsBad && d > plan * tol;
  const under = lowIsBad && d < -plan * tol;
  return { label, val: fmt(val) + ' / ' + fmt(plan) + ' ' + unit, note: over ? '+' + fmt(d) + ' ' + unit : under ? fmt(d) + ' ' + unit : 'ok', bad: over || under };
};

function Skeleton() {
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card" style={{ padding: 20, boxShadow: 'none' }}>
        <div className="sk" style={{ height: 14, width: '40%', borderRadius: 7 }} />
        <div className="sk" style={{ height: 40, width: '55%' }} />
        <div className="macro-tiles">{[0, 1, 2, 3].map(i => <div key={i} className="sk" style={{ height: 48 }} />)}</div>
      </div>
      {[0, 1, 2].map(i => (
        <div key={i} className="card r20 p16" style={{ gap: 10, boxShadow: 'none' }}>
          <div className="sk" style={{ height: 16, width: '60%', borderRadius: 8 }} />
          <div className="sk" style={{ height: 44 }} />
        </div>
      ))}
    </div>
  );
}

export function Analise() {
  const { draft: sDraft, regMeal } = useSession();
  // a direct visit without a capture still shows an analysis for the selected meal
  const draft: Draft = sDraft ?? { id: 0, meal: regMeal, time: nowTime() };
  const opened = useRef(draft);
  useEffect(() => { if (opened.current.done) navigate('registrar', true); }, []);

  const s = useApp();
  const [analyzing, setAnalyzing] = useState(true);
  const [items, setItems] = useState(initItems);
  const [qs, setQs] = useState(initQs);
  const [correcting, setCorrecting] = useState(-1);
  const [result, setResult] = useState<null | 'confirmed' | 'discarded'>(null);
  const [lastAdd, setLastAdd] = useState(0);
  const timer = useRef<number | undefined>(undefined);

  const start = () => {
    clearTimeout(timer.current);
    setAnalyzing(true); setItems(initItems()); setQs(initQs()); setCorrecting(-1); setResult(null);
    timer.current = window.setTimeout(() => setAnalyzing(false), 2300);
  };
  useEffect(() => { start(); return () => clearTimeout(timer.current); }, []);

  const META = goals(s);
  const plan = planList(s).find(p => p.id === draft.meal);
  const isAuto = s.planMode === 'auto';
  const mealName = draft.meal === 'extra' ? 'Extra' : plan?.name ?? 'Refeição';
  const day = todayKey();
  const dayK = sumEntries(s.diaries[day]).kcal;
  const tot = totals(items);

  // compare with this meal in the plan (macros prorated from the daily goals); extras compare with what's left today
  let rows: Row[], headline: string, cmpTitle: string;
  if (plan) {
    const pm = { kcal: plan.kcal, p: Math.round((META.p * plan.kcal) / META.kcal), c: Math.round((META.c * plan.kcal) / META.kcal) };
    rows = [okRow('Calorias', tot.kcal, pm.kcal, 'kcal', 0.1), okRow('Carboidrato', tot.c, pm.c, 'g', 0.1), okRow('Proteína', tot.p, pm.p, 'g', 0.2, true)];
    headline = 'Dentro do planejado';
    if (rows[1].bad && tot.c > pm.c) headline = 'Acima em carboidrato';
    else if (rows[0].bad) headline = 'Acima do planejado';
    else if (rows[2].bad) headline = 'Proteína abaixo do plano';
    cmpTitle = (isAuto ? 'Comparado à sugestão para o ' : 'Comparado ao ') + MEAL_LABEL[draft.meal] + (isAuto ? '' : ' do plano');
  } else {
    const left = Math.max(0, META.kcal - dayK);
    rows = [okRow('Calorias', tot.kcal, left, 'kcal', 0)];
    headline = rows[0].bad ? 'Acima do que resta hoje' : 'Cabe no seu dia';
    cmpTitle = 'Comparado ao que resta hoje';
  }
  const warn = rows.some(r => r.bad);

  const setGrams = (i: number, v: number | string) => {
    const g = clamp(Math.round(+v || 0), 0, 999);
    setItems(its => its.map((x, j) => (j === i ? { ...x, g } : x)));
  };
  const pickAlt = (i: number, key: FoodKey) => {
    setItems(its => its.map((x, j) => (j === i ? { ...x, key, alts: [x.key, ...x.alts.filter(a => a !== key)], conf: 100, by: 'corrigido' } : x)));
    if (key === 'frangoFrito' || key === 'frango') setQs(q => q.map(x => (x.id === 'preparo' ? { ...x, ans: key === 'frango' ? 'Grelhado' : 'Frito' } : x)));
    setCorrecting(-1);
  };
  const answer = (qid: Question['id'], opt: string) => {
    setItems(its => {
      if (qid === 'preparo') return its.map(x => (x.key === 'frango' || x.key === 'frangoFrito' ? { ...x, key: opt === 'Frito' ? 'frangoFrito' : 'frango', conf: 100, by: 'informado' } : x));
      const rest = its.filter(x => x.key !== 'azeite');
      return opt.startsWith('Sim') ? [...rest, { key: 'azeite', g: 8, conf: 100, alts: [], by: 'informado' }] : rest;
    });
    setQs(q => q.map(x => (x.id === qid ? { ...x, ans: opt } : x)));
  };

  const confirm = async () => {
    const t: Macros = totals(items);
    let thumb: string | undefined;
    if (draft.file) { try { thumb = await thumbnail(draft.file); } catch { /* keep the entry without a thumbnail */ } }
    addEntry(day, {
      id: newId(), time: draft.time, meal: draft.meal, title: mealName, desc: items.map(x => FOODS[x.key].short).join(', '),
      ...t, fora: draft.meal === 'extra', photo: !!draft.photoUrl, thumb, mult: 1
    });
    session.set(x => ({ ...x, draft: x.draft ? { ...x.draft, done: true } : null, hojeToast: '+' + fmt(t.kcal) + ' kcal · ' + mealName + ' adicionado' }));
    setLastAdd(t.kcal);
    setResult('confirmed');
    setTimeout(() => navigate('hoje', true), 1100);
  };
  const discard = () => {
    session.set(x => ({ ...x, draft: x.draft ? { ...x.draft, done: true } : null }));
    setCorrecting(-1);
    setResult('discarded');
  };

  const remaining = META.kcal - dayK;
  const photoLabel = draft.text ? '“' + draft.text + '”' : 'foto do prato · ' + MEAL_LABEL[draft.meal] + ' · ' + draft.time;

  return (
    <>
      <div className="screen ana">
        <div className={'ana-photo' + (draft.photoUrl ? '' : ' placeholder')}>
          {draft.photoUrl ? <img src={draft.photoUrl} alt="Foto do prato" /> : <div className="ana-photo-label mono">{photoLabel}</div>}
          <div className="ana-top">
            <button className="icon-btn" aria-label="Voltar" onClick={() => navigate('registrar')}>‹</button>
            <div className="ana-pill">{mealName} · {draft.time}</div>
            <button className="icon-btn" style={{ width: 'auto', padding: '0 14px', font: '600 calc(13 * var(--u)) var(--font)' }} onClick={start}>Refazer</button>
          </div>
          {analyzing && <div className="scanline" />}
          {!analyzing && items.map((x, i) => (
            <div key={i + x.key} className="tag" style={{ left: TAGPOS[i % 5].l, top: TAGPOS[i % 5].t }}>
              <span className="dot" style={{ background: DOTS[i % 5] }} />{FOODS[x.key].short}<span className="muted" style={{ fontWeight: 500 }}>{x.by ? '✓' : x.conf + '%'}</span>
            </div>
          ))}
        </div>

        <div className="ana-body">
          <div className="grabber" />

          {analyzing ? (
            <>
              <div className="col" style={{ gap: 6 }} aria-live="polite">
                <div className="ana-h">Identificando alimentos…</div>
                <div className="muted" style={{ font: '400 calc(14 * var(--u)) var(--font)' }}>Estimando porções a partir da foto. Leva alguns segundos.</div>
              </div>
              <Skeleton />
            </>
          ) : (
            <>
              <section className="card" style={{ padding: 20, gap: 16 }}>
                <div className="row-between" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <div>
                    <div className="label">Total do prato</div>
                    <div className="row" style={{ alignItems: 'baseline', gap: 6 }}><span className="big-num num">{fmt(tot.kcal)}</span><span className="kcal-unit">kcal</span></div>
                  </div>
                  <div className={'cmp-badge' + (warn ? ' warn' : '')}>{headline}</div>
                </div>
                <MacroTiles m={tot} />
                <div className="cmp">
                  <div className="label">{cmpTitle}</div>
                  {rows.map(r => (
                    <div key={r.label} className="cmp-row">
                      <span className="dot" style={{ background: r.bad ? 'var(--ambLine)' : 'var(--pri)' }} />
                      <span className="grow">{r.label}</span>
                      <span className="muted num">{r.val}</span>
                      <span className="cmp-note" style={{ color: r.bad ? 'var(--amb)' : 'var(--pri)' }}>{r.note}</span>
                    </div>
                  ))}
                </div>
              </section>

              {qs.some(q => !q.ans) && <div className="ana-sec" style={{ marginTop: 4 }}>{qs.filter(q => !q.ans).length > 1 ? 'Duas perguntas rápidas' : 'Uma pergunta rápida'}</div>}
              {qs.map(q => (
                <div key={q.id} className="card r20 p16">
                  {!q.ans ? (
                    <>
                      <div style={{ font: '600 calc(15 * var(--u))/1.35 var(--font)' }}>{q.q}</div>
                      <div className="row" style={{ gap: 8 }}>
                        {q.opts.map(o => <button key={o} className="q-opt" onClick={() => answer(q.id, o)}>{o}</button>)}
                      </div>
                    </>
                  ) : (
                    <div className="row">
                      <span className="q-check">✓</span>
                      <span className="grow muted" style={{ font: '500 calc(14 * var(--u)) var(--font)' }}>{q.short} <strong style={{ color: 'var(--ink)' }}>{q.ans}</strong></span>
                      <button className="link-btn" style={{ padding: '0 10px' }} onClick={() => setQs(x => x.map(z => (z.id === q.id ? { ...z, ans: null } : z)))}>alterar</button>
                    </div>
                  )}
                </div>
              ))}

              <div className="row-between" style={{ marginTop: 4 }}>
                <span className="ana-sec">Alimentos identificados</span>
                <span className="muted" style={{ font: '500 calc(13 * var(--u)) var(--font)' }}>{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
              </div>
              {items.map((x, i) => {
                const f = FOODS[x.key];
                const isOil = x.key === 'azeite';
                const hi = x.conf >= 85, mid = x.conf >= 70;
                const ok = !!x.by || hi;
                return (
                  <div key={i + x.key} className="card r20 p16">
                    <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                      <span className="item-dot" style={{ background: DOTS[i % 5] }} />
                      <div className="grow col" style={{ gap: 6 }}>
                        <div className="item-name">{f.name}</div>
                        <div className="row"><span className={'conf ' + (ok ? 'ok' : 'warn')}>{x.by ? (x.by === 'corrigido' ? 'Corrigido por você' : 'Informado por você') : (hi ? 'Confiança alta' : mid ? 'Confiança média' : 'Confiança baixa · confirme') + ' ' + x.conf + '%'}</span></div>
                      </div>
                      <div style={{ textAlign: 'right' }}><div className="item-kcal num">{fmt(f.kcal * x.g)}</div><div className="small" style={{ fontWeight: 500 }}>kcal</div></div>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="step" aria-label="Diminuir porção" onClick={() => setGrams(i, x.g - (isOil ? 2 : 10))}>−</button>
                      <input className="slider" type="range" min={0} max={isOil ? 30 : 400} step={isOil ? 1 : 5} value={x.g} onChange={e => setGrams(i, e.target.value)} aria-label={'Porção de ' + f.short + ' em gramas'} />
                      <button className="step" aria-label="Aumentar porção" onClick={() => setGrams(i, x.g + (isOil ? 2 : 10))}>+</button>
                      <label className="grams"><input type="number" inputMode="numeric" value={x.g} onChange={e => setGrams(i, e.target.value)} aria-label="Gramas" /><span>g</span></label>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="grow muted num" style={{ font: '500 calc(13 * var(--u)) var(--font)' }}>P {fmt(f.p * x.g)} · C {fmt(f.c * x.g)} · G {fmt(f.g * x.g)} · F {fmt(f.f * x.g)} g</span>
                      <button className="pill-btn" onClick={() => setCorrecting(correcting === i ? -1 : i)}>{correcting === i ? 'Fechar' : 'Corrigir'}</button>
                    </div>
                    {correcting === i && (
                      <div className="correct">
                        <div className="label">Era outro alimento?</div>
                        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                          {x.alts.map(a => <button key={a} className="alt" onClick={() => pickAlt(i, a)}>{FOODS[a].name}</button>)}
                          <button className="alt dashed" onClick={() => navigate('registrar')}>Buscar outro</button>
                        </div>
                        <button className="remove" onClick={() => { setItems(its => its.filter((_, j) => j !== i)); setCorrecting(-1); }}>Não estava no prato · remover</button>
                      </div>
                    )}
                  </div>
                );
              })}
              <button className="btn dashed" onClick={() => navigate('registrar')}>+ Adicionar item que a foto não pegou</button>
              <div className="note"><span className="i">i</span><span>Estimativas por foto são aproximadas. Ajustes na dieta devem ser validados com seu nutrólogo.</span></div>
            </>
          )}
        </div>
      </div>

      {!analyzing && (
        <div className="ana-bar">
          <button className="btn pri" style={{ height: 56, borderRadius: 18, fontSize: 'calc(16 * var(--u))' }} onClick={confirm}>Comi isso, adicionar ao dia<span style={{ opacity: .8, fontWeight: 600 }}>· {fmt(tot.kcal)} kcal</span></button>
          <button className="btn txt" style={{ height: 46 }} onClick={discard}>Não comi / descartar</button>
        </div>
      )}

      {result === 'confirmed' && (
        <div className="scrim">
          <div className="sheet" role="dialog" aria-label={mealName + ' adicionado'}>
            <div className="check-circle">✓</div>
            <h2>{mealName} adicionado</h2>
            <p>+{fmt(lastAdd)} kcal no seu dia. {remaining >= 0 ? <>Restam <strong style={{ color: 'var(--ink)' }}>{fmt(remaining)} kcal</strong> para a meta de hoje.</> : <>Você está <strong style={{ color: 'var(--ink)' }}>{fmt(-remaining)} kcal</strong> acima da meta de hoje.</>}</p>
            <div className="row" style={{ gap: 8, width: '100%', marginTop: 10 }}>
              <button className="btn sec flex1" onClick={() => navigate('registrar', true)}>Registrar outra</button>
              <button className="btn pri flex1" onClick={() => navigate('hoje', true)}>Ver meu dia</button>
            </div>
          </div>
        </div>
      )}

      {result === 'discarded' && (
        <div className="discarded">
          <div className="discarded-ico"><div /></div>
          <h2>Tudo certo, nada foi somado</h2>
          <p>{draft.photoUrl ? 'A foto foi descartada' : 'O registro foi descartado'} e seu dia continua igual. Se quiser, registre de outro jeito.</p>
          <div className="col" style={{ gap: 8, width: '100%', marginTop: 12 }}>
            <button className="btn pri" onClick={() => navigate('registrar', true)}>Tirar outra foto</button>
            <button className="btn txt" onClick={() => navigate('hoje', true)}>Voltar para Hoje</button>
          </div>
        </div>
      )}
    </>
  );
}
