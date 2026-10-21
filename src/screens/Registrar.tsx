import { useRef, useState } from 'react';
import type { Macros, MealId } from '../types';
import { addEntry, useApp } from '../store/app';
import { session, startDraft, useSession } from '../store/session';
import { navigate } from '../hooks/useRoute';
import { useToast } from '../hooks/useToast';
import { FAVORITOS, RECENTES, searchFoods, type SearchFood } from '../data/foods';
import { MEAL_CHIPS, MEAL_LABEL } from '../data/plan';
import { autoSug, goals, planList, sumEntries } from '../lib/nutrition';
import { fmt, newId, norm } from '../lib/format';
import { keyOffset, nowTime, todayKey } from '../lib/dates';
import './Registrar.css';

interface TrayItem extends Macros { n: string; qty: number }
type Tab = 'recentes' | 'favoritos' | 'plano';

export function Registrar() {
  const s = useApp();
  const { regMeal } = useSession();
  const [toast, showToast] = useToast();
  const [query, setQuery] = useState('');
  const [mealText, setMealText] = useState('');
  const [tab, setTab] = useState<Tab>('recentes');
  const [tray, setTray] = useState<TrayItem[]>([]);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const META = goals(s);
  const PLAN = planList(s);
  const isAuto = s.planMode === 'auto';
  const day = todayKey();
  const todayK = sumEntries(s.diaries[day]).kcal;
  const regPlan = PLAN.find(p => p.id === regMeal);
  const dietMeal = s.dietMeals.find(m => m.id === regMeal);
  const setMeal = (m: MealId) => session.set(x => ({ ...x, regMeal: m }));

  const q = norm(query.trim());
  const found = q ? searchFoods(query) : [];
  const listSrc = q ? found : tab === 'recentes' ? RECENTES : tab === 'favoritos' ? FAVORITOS : [];

  const addTray = (r: { n: string } & Macros) =>
    setTray(t => (t.some(x => x.n === r.n) ? t.map(x => (x.n === r.n ? { ...x, qty: x.qty + 1 } : x)) : [...t, { n: r.n, kcal: r.kcal, p: r.p, c: r.c, g: r.g, f: r.f, qty: 1 }]));
  const decTray = (r: SearchFood) => setTray(t => t.map(x => (x.n === r.n ? { ...x, qty: x.qty - 1 } : x)).filter(x => x.qty > 0));
  const trayTot = tray.reduce((a, t) => ({ kcal: a.kcal + t.kcal * t.qty, p: a.p + t.p * t.qty, c: a.c + t.c * t.qty, g: a.g + t.g * t.qty, f: a.f + t.f * t.qty }), { kcal: 0, p: 0, c: 0, g: 0, f: 0 });
  const trayQty = tray.reduce((a, t) => a + t.qty, 0);
  const trayNames = tray.map(t => (t.qty > 1 ? t.qty + '× ' : '') + t.n).join(', ');

  const title = regMeal === 'extra' ? 'Extra' : regPlan ? regPlan.name : 'Refeição';
  const commit = (m: Macros, desc: string) => {
    addEntry(day, { id: newId(), time: nowTime(), meal: regMeal, title, desc, ...m, fora: regMeal === 'extra', photo: false, mult: 1 });
    setTray([]);
    showToast('Adicionado ao ' + MEAL_LABEL[regMeal] + ' · +' + fmt(m.kcal) + ' kcal');
    session.set(x => ({ ...x, hojeToast: '+' + fmt(m.kcal) + ' kcal · ' + title + ' adicionado' }));
  };

  // plan meal macros, prorated from the daily goals
  const planMacros = (kcal: number): Macros => ({ kcal, p: (META.p * kcal) / META.kcal, c: (META.c * kcal) / META.kcal, g: (META.g * kcal) / META.kcal, f: (META.f * kcal) / META.kcal });
  const planItems = regPlan ? (isAuto ? [autoSug(regPlan.id, regPlan.kcal)] : dietMeal ? dietMeal.items : []) : [];

  const yesterday = (s.diaries[keyOffset(-1)] || []).filter(e => e.meal === regMeal);
  const yTot = sumEntries(yesterday);
  const yDesc = yesterday.map(e => e.desc).join(' · ');

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    startDraft({ meal: regMeal, time: nowTime(), photoUrl: URL.createObjectURL(file), file });
    navigate('analise');
  };
  const analyzeText = () => {
    startDraft({ meal: regMeal, time: nowTime(), text: mealText.trim() });
    navigate('analise');
  };

  const ctx = (regPlan ? regPlan.name + ' · ~' + fmt(regPlan.kcal) + ' kcal ' + (isAuto ? 'sugeridas' : 'no plano') : 'Fora do plano') + ' · restam ' + fmt(Math.max(0, META.kcal - todayK)) + ' hoje';

  return (
    <>
      <div className="screen reg">
        <div className="head reg-head">
          <div className="col" style={{ gap: 2 }}>
            <h1 className="reg-title">O que você comeu?</h1>
            <span className="reg-ctx">{ctx}</span>
          </div>
          <button className="icon-btn soft" aria-label="Fechar" style={{ fontWeight: 500, fontSize: 22 }} onClick={() => navigate('hoje')}>×</button>
        </div>

        <div className="chips scroll" role="radiogroup" aria-label="Refeição">
          {MEAL_CHIPS.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={regMeal === id} className={'chip' + (regMeal === id ? ' on' : '')} style={{ fontSize: 'calc(14 * var(--u))' }} onClick={() => setMeal(id)}>{label}</button>
          ))}
        </div>

        <div className="cam">
          <div className="cam-hint">Enquadre o prato inteiro, de cima</div>
          <div className="cam-frame" aria-hidden>
            <span className="c tl" /><span className="c tr" /><span className="c bl" /><span className="c br" />
          </div>
          <div className="cam-controls">
            <button className="cam-gal" onClick={() => galRef.current?.click()}><span className="gal-ico" />Galeria</button>
            <button className="cam-shutter" aria-label="Tirar foto" onClick={() => camRef.current?.click()}><span /></button>
            <span className="cam-note">IA estima as porções</span>
          </div>
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          <input ref={galRef} type="file" accept="image/*" hidden onChange={onFile} />
        </div>

        <div className="card describe">
          <div className="row" style={{ gap: 8 }}>
            <input className="describe-input" value={mealText} onChange={e => setMealText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && mealText.trim()) analyzeText(); }} placeholder="Ou descreva: arroz, feijão e frango…" aria-label="Descreva o que comeu" />
            <button className="mic" aria-label="Falar" onClick={() => showToast('Ouvindo… fale o que você comeu')}><span /></button>
          </div>
          {mealText.trim() && <button className="btn pri h44" onClick={analyzeText}>Analisar descrição</button>}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <label className="search">
            <span className="search-ico" aria-hidden />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar alimento ou marca" aria-label="Buscar alimento ou marca" type="search" />
          </label>
          <button className="barcode" aria-label="Ler código de barras" onClick={() => showToast('Câmera aberta para ler o código de barras')}>
            {[2, 4, 2, 3, 2, 4].map((w, i) => <span key={i} style={{ width: w }} />)}
          </button>
        </div>

        {!q && (
          <div className="seg fill">
            {([['recentes', 'Recentes'], ['favoritos', 'Favoritos'], ['plano', 'Do plano']] as const).map(([id, label]) => (
              <button key={id} className={tab === id ? 'on' : ''} style={{ height: 38, fontSize: 'calc(13.5 * var(--u))' }} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        )}
        {q && <div className="row-between"><span style={{ font: '700 calc(15 * var(--u)) var(--font)' }}>Resultados</span><span className="small" style={{ fontWeight: 500 }}>TACO · Open Food Facts</span></div>}

        {(q || tab !== 'plano') && (
          <div className="card flat r20">
            {listSrc.slice(0, q ? 20 : 6).map((r, i) => {
              const t = tray.find(x => x.n === r.n);
              return (
                <div key={r.n} className="result" style={{ borderTopColor: i ? 'var(--line)' : 'transparent' }}>
                  <div className="grow col" style={{ gap: 3 }}>
                    <div className="result-name">{r.n}</div>
                    <div className="result-sub"><span>{r.portion} · {r.kcal} kcal</span><span className="src">{r.src === 'OFF' ? 'OPEN FOOD FACTS' : 'TACO'}</span></div>
                  </div>
                  {t ? (
                    <div className="qty">
                      <button aria-label="Menos" onClick={() => decTray(r)}>−</button>
                      <span>{t.qty}</span>
                      <button aria-label="Mais" onClick={() => addTray(r)}>+</button>
                    </div>
                  ) : (
                    <button className="add" aria-label={'Adicionar ' + r.n} onClick={() => addTray(r)}>+</button>
                  )}
                </div>
              );
            })}
            {q && found.length === 0 && <div className="no-results">Nada encontrado para “{query}”. Tente outro nome ou leia o código de barras.</div>}
          </div>
        )}

        {!q && tab === 'plano' && (
          <div className="card plan-card">
            <div className="row-between">
              <span className="h-card">{regPlan ? (isAuto ? 'Sugestão · ' : 'Do plano · ') + regPlan.name : 'Refeição extra'}</span>
              <span style={{ font: '700 calc(14 * var(--u)) var(--font)', whiteSpace: 'nowrap' }}>~{fmt(regPlan?.kcal ?? 0)} kcal</span>
            </div>
            <div className="bullets">
              {(regPlan ? planItems : ['Extras não fazem parte do plano — registre por foto ou busca.']).map(t => <span key={t}><span className="bullet" />{t}</span>)}
            </div>
            {regPlan && <button className="btn pri h48" onClick={() => commit(planMacros(regPlan.kcal), planItems.join(', '))}>Comi exatamente isso</button>}
            <span className="small" style={{ lineHeight: 1.3 }}>Comeu diferente? Tire uma foto ou busque os itens — o Leve compara com o plano.</span>
          </div>
        )}

        {yesterday.length > 0 && (
          <button className="repeat" onClick={() => !tray.some(t => t.n === 'Refeição de ontem') && addTray({ n: 'Refeição de ontem', ...yTot })}>
            <div className="repeat-ico">↻</div>
            <div className="grow">
              <div className="result-name">Repetir {MEAL_LABEL[regMeal]} de ontem</div>
              <div className="result-sub" style={{ display: 'block' }}>{yDesc} · {fmt(yTot.kcal)} kcal</div>
            </div>
          </button>
        )}
      </div>

      {tray.length > 0 && (
        <div className="tray">
          <div className="grow col">
            <span className="tray-k">{fmt(trayTot.kcal)} kcal · {trayQty} {trayQty > 1 ? 'itens' : 'item'}</span>
            <span className="tray-names">{trayNames}</span>
          </div>
          <button className="tray-clear" onClick={() => setTray([])}>Limpar</button>
          <button className="btn pri h48" style={{ borderRadius: 16 }} onClick={() => commit(trayTot, trayNames)}>Adicionar ao dia</button>
        </div>
      )}
      {toast && <div className="toast top" role="status">{toast}</div>}
    </>
  );
}
