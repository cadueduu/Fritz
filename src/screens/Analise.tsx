import { useEffect, useRef, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { Macros, MealId } from '../types';
import { addEntry, useApp } from '../store/app';
import { session, useSession, type Draft } from '../store/session';
import { navigate } from '../hooks/useRoute';
import { MEAL_CHIPS, MEAL_LABEL } from '../data/plan';
import { goals, planList, sumEntries, zero } from '../lib/nutrition';
import { clamp, fmt, newId } from '../lib/format';
import { nowTime, todayKey } from '../lib/dates';
import { thumbnail, toJpegBase64 } from '../lib/image';
import { supabase } from '../lib/supabase';
import { searchFoods, type SearchFood } from '../data/foods';
import { MacroTiles } from '../components/MacroTiles';
import './Analise.css';

/** Nutrition per 100 g. `fonte` says whether the values come from the TACO table or the AI's estimate. */
interface Food100 { nome: string; taco_nome?: string | null; fonte?: 'TACO' | 'IA'; kcal: number; p: number; c: number; g: number; f: number }
interface Item extends Food100 {
  key: string;
  gramas: number;
  conf: number;
  alts: Food100[];
  /** the user has to look at every item before the meal can be logged */
  status: 'pendente' | 'ok' | 'corrigido';
  busy?: boolean;
}
interface Raw extends Food100 { gramas?: number; confianca?: number; alternativas?: Food100[] }

const DOTS = ['var(--mC)', 'var(--mF)', 'var(--mP)', 'var(--pri)', 'var(--mG)'];
const TAGPOS = [{ l: '8%', t: '40%' }, { l: '56%', t: '36%' }, { l: '50%', t: '63%' }, { l: '10%', t: '67%' }, { l: '34%', t: '51%' }];
const ERRORS: Record<string, string> = {
  missing_key: 'A análise ainda não está configurada: faltam as chaves de IA (ANTHROPIC_API_KEY / GEMINI_API_KEY) no Supabase.',
  bad_key: 'Uma chave de IA configurada no Supabase não é válida.',
  no_credits: 'Os créditos de IA acabaram. Recarregue em console.anthropic.com ou troque a chave do Gemini por uma de um projeto gratuito.',
  rate_limited: 'O limite de uso da IA foi atingido por agora. Espere um minuto e tente de novo.',
  overloaded: 'A IA está sobrecarregada agora. Tente de novo em alguns instantes.',
  too_big: 'A foto ficou grande demais. Tente de novo.'
};

const num = (v: unknown, hi: number) => clamp(Number(v) || 0, 0, hi);
const food = (r: Food100): Food100 => ({
  nome: String(r.nome || 'Alimento'), taco_nome: r.taco_nome ?? null, fonte: r.fonte === 'TACO' ? 'TACO' : 'IA',
  kcal: num(r.kcal, 950), p: num(r.p, 100), c: num(r.c, 100), g: num(r.g, 100), f: num(r.f, 100)
});
const toItem = (r: Raw): Item => ({
  ...food(r), key: newId(),
  gramas: Math.round(num(r.gramas, 2000)) || 100,
  conf: Math.round(num(r.confianca, 100)),
  alts: (Array.isArray(r.alternativas) ? r.alternativas : []).slice(0, 3).map(food),
  status: 'pendente'
});
/** A food from the app's own table, per 100 g, plus the grams of its listed portion. */
const fromSearch = (f: SearchFood): Food100 & { porcao: number } => {
  const porcao = Number(/(\d+(?:[.,]\d+)?)\s*(?:g|ml)\b/.exec(f.portion)?.[1].replace(',', '.')) || 100;
  const k = 100 / porcao;
  return { nome: f.n, taco_nome: f.src === 'TACO' ? f.n : null, fonte: f.src === 'TACO' ? 'TACO' : 'IA', kcal: f.kcal * k, p: f.p * k, c: f.c * k, g: f.g * k, f: f.f * k, porcao };
};

/** Matches from the app's food table while the person types, so picking one needs no AI call. */
function Suggestions({ query, onPick }: { query: string; onPick: (f: Food100 & { porcao: number }) => void }) {
  // amounts and household measures ("1 copo de suco de laranja") are not part of a food's name
  const q = query.replace(/\d+([.,]\d+)?/g, ' ').replace(/\b(g|ml|kg|un|unidades?|copos?|x[ií]caras?|colher(es)?|sopa|ch[aá]|fatias?|por[cç](ão|ões)|pratos?|potes?|de|do|da|com)\b/gi, ' ');
  const hits = q.trim().length >= 2 ? searchFoods(q, 6) : [];
  if (!hits.length) return null;
  return (
    <div className="sugs" role="listbox" aria-label="Alimentos da tabela">
      {hits.map(h => (
        <button key={h.n + h.portion} className="sug" role="option" aria-selected={false} onClick={() => onPick(fromSearch(h))}>
          <span>{h.n}</span><span className="muted num">{fmt(h.kcal)} kcal · {h.portion}</span>
        </button>
      ))}
    </div>
  );
}

const per = (it: Food100, gramas: number): Macros => ({ kcal: it.kcal * gramas / 100, p: it.p * gramas / 100, c: it.c * gramas / 100, g: it.g * gramas / 100, f: it.f * gramas / 100 });

/** Calls the `analisar` function; throws an Error whose message is an ERRORS key or ''. */
async function analyze(body: Record<string, string>) {
  const { data, error } = await supabase.functions.invoke<{ itens?: Raw[]; aviso?: string }>('analisar', { body });
  if (error) {
    let code = '';
    if (error instanceof FunctionsHttpError) { try { code = (await error.context.json()).error ?? ''; } catch { /* not json */ } }
    throw new Error(code);
  }
  return { itens: (data?.itens ?? []).map(toItem), aviso: data?.aviso ?? '' };
}

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
  const { draft: sDraft } = useSession();
  const draft = useRef<Draft | null>(sDraft).current;
  const s = useApp();

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [failure, setFailure] = useState('');
  const [aviso, setAviso] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [meal, setMeal] = useState<MealId>(draft?.meal ?? 'almoco');
  const [time, setTime] = useState(draft?.time ?? nowTime());
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [adding, setAdding] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [result, setResult] = useState<null | 'confirmed' | 'discarded'>(null);
  const [lastAdd, setLastAdd] = useState(0);

  const start = async () => {
    if (!draft) return;
    setPhase('loading'); setFailure(''); setAviso(''); setItems([]); setCorrecting(null); setResult(null);
    try {
      const body: Record<string, string> = { refeicao: MEAL_LABEL[draft.meal] };
      if (draft.file) body.imagem = await toJpegBase64(draft.file);
      if (draft.text) body.texto = draft.text;
      const r = await analyze(body);
      setItems(r.itens);
      setAviso(r.aviso);
      setPhase('ready');
    } catch (e) {
      setFailure(ERRORS[(e as Error).message] ?? 'Não consegui analisar agora. Verifique a conexão e tente de novo.');
      setPhase('error');
    }
  };
  useEffect(() => {
    // without a capture (or after it was logged) there is nothing to analyse
    if (!draft || draft.done) { navigate('registrar', true); return; }
    start();
  }, []);

  if (!draft) return null;

  const META = goals(s);
  const plan = planList(s).find(p => p.id === meal);
  const isAuto = s.planMode === 'auto';
  const mealName = meal === 'extra' ? 'Extra' : plan?.name ?? 'Refeição';
  const day = todayKey();
  const dayK = sumEntries(s.diaries[day]).kcal;
  const tot = items.reduce((t, it) => { const m = per(it, it.gramas); return { kcal: t.kcal + m.kcal, p: t.p + m.p, c: t.c + m.c, g: t.g + m.g, f: t.f + m.f }; }, zero());
  const checked = items.filter(i => i.status !== 'pendente').length;
  const allChecked = items.length > 0 && checked === items.length;

  // compare with this meal in the plan (macros prorated from the daily goals); extras compare with what's left today
  type Row = { label: string; val: string; note: string; bad: boolean };
  const okRow = (label: string, val: number, planned: number, unit: string, tol: number, lowIsBad = false): Row => {
    const d = val - planned;
    const over = !lowIsBad && d > planned * tol;
    const under = lowIsBad && d < -planned * tol;
    return { label, val: fmt(val) + ' / ' + fmt(planned) + ' ' + unit, note: over ? '+' + fmt(d) + ' ' + unit : under ? fmt(d) + ' ' + unit : 'ok', bad: over || under };
  };
  let rows: Row[], headline: string, cmpTitle: string;
  if (plan) {
    const pm = { kcal: plan.kcal, p: Math.round((META.p * plan.kcal) / META.kcal), c: Math.round((META.c * plan.kcal) / META.kcal) };
    rows = [okRow('Calorias', tot.kcal, pm.kcal, 'kcal', 0.1), okRow('Carboidrato', tot.c, pm.c, 'g', 0.1), okRow('Proteína', tot.p, pm.p, 'g', 0.2, true)];
    headline = 'Dentro do planejado';
    if (rows[1].bad && tot.c > pm.c) headline = 'Acima em carboidrato';
    else if (rows[0].bad) headline = 'Acima do planejado';
    else if (rows[2].bad) headline = 'Proteína abaixo do plano';
    cmpTitle = (isAuto ? 'Comparado à sugestão para o ' : 'Comparado ao ') + MEAL_LABEL[meal] + (isAuto ? '' : ' do plano');
  } else {
    const left = Math.max(0, META.kcal - dayK);
    rows = [okRow('Calorias', tot.kcal, left, 'kcal', 0)];
    headline = rows[0].bad ? 'Acima do que resta hoje' : 'Cabe no seu dia';
    cmpTitle = 'Comparado ao que resta hoje';
  }
  const warn = rows.some(r => r.bad);

  const update = (key: string, fn: (it: Item) => Item) => setItems(its => its.map(it => (it.key === key ? fn(it) : it)));
  const setGrams = (key: string, v: number | string) => update(key, it => ({ ...it, gramas: clamp(Math.round(+v || 0), 0, 2000) }));
  const pickAlt = (key: string, alt: Food100) => {
    update(key, it => ({ ...it, ...alt, alts: [food(it), ...it.alts.filter(a => a !== alt)], conf: 100, status: 'corrigido' }));
    setCorrecting(null);
  };
  const pickFood = (key: string, f: Food100 & { porcao: number }) => {
    const { porcao: _p, ...rest } = f;
    update(key, it => ({ ...it, ...rest, alts: [food(it), ...it.alts], conf: 100, status: 'corrigido' }));
    setOther('');
    setCorrecting(null);
  };
  const addFood = (f: Food100 & { porcao: number }) => {
    const { porcao, ...rest } = f;
    setItems(its => [...its, { ...rest, key: newId(), gramas: Math.round(porcao), conf: 100, alts: [], status: 'ok' }]);
    setAdding('');
  };
  const typeOther = async (key: string) => {
    const name = other.trim();
    if (!name) return;
    update(key, it => ({ ...it, busy: true }));
    try {
      const r = await analyze({ alimento: name });
      const n = r.itens[0];
      update(key, it => (n ? { ...it, ...food(n), alts: [food(it), ...it.alts], conf: 100, status: 'corrigido', busy: false } : { ...it, busy: false }));
      setOther('');
      setCorrecting(null);
    } catch (e) {
      update(key, it => ({ ...it, busy: false }));
      setFailure(ERRORS[(e as Error).message] ?? 'Não consegui buscar esse alimento agora.');
    }
  };
  const addItem = async () => {
    const name = adding.trim();
    if (!name) return;
    setAddBusy(true);
    try {
      const r = await analyze({ alimento: name });
      if (r.itens[0]) setItems(its => [...its, { ...r.itens[0], conf: 100, status: 'ok' }]);
      setAdding('');
    } catch (e) {
      setFailure(ERRORS[(e as Error).message] ?? 'Não consegui buscar esse alimento agora.');
    } finally {
      setAddBusy(false);
    }
  };

  const confirm = async () => {
    if (!allChecked) return;
    let thumb: string | undefined;
    if (draft.file) { try { thumb = await thumbnail(draft.file); } catch { /* keep the entry without a thumbnail */ } }
    addEntry(day, {
      id: newId(), time, meal, title: mealName, desc: items.map(i => `${i.nome} (${i.gramas} g)`).join(', '),
      ...tot, fora: meal === 'extra', photo: !!draft.photoUrl, thumb, mult: 1
    });
    session.set(x => ({ ...x, draft: x.draft ? { ...x.draft, done: true } : null, hojeToast: '+' + fmt(tot.kcal) + ' kcal · ' + mealName + ' adicionado' }));
    setLastAdd(tot.kcal);
    setResult('confirmed');
    setTimeout(() => navigate('hoje', true), 1400);
  };
  const discard = () => {
    session.set(x => ({ ...x, draft: x.draft ? { ...x.draft, done: true } : null }));
    setCorrecting(null);
    setResult('discarded');
  };

  const remaining = META.kcal - dayK;
  const photoLabel = draft.text ? '“' + draft.text + '”' : 'foto do prato';

  return (
    <>
      <div className="screen ana">
        <div className={'ana-photo' + (draft.photoUrl ? '' : ' placeholder')}>
          {draft.photoUrl ? <img src={draft.photoUrl} alt="Foto do prato" /> : <div className="ana-photo-label mono">{photoLabel}</div>}
          <div className="ana-top">
            <button className="icon-btn" aria-label="Voltar" onClick={() => navigate('registrar')}>‹</button>
            <div className="ana-pill">{mealName} · {time}</div>
            <button className="icon-btn" style={{ width: 'auto', padding: '0 14px', font: '600 calc(13 * var(--u)) var(--font)' }} onClick={start} disabled={phase === 'loading'}>Refazer</button>
          </div>
          {phase === 'loading' && <div className="scanline" />}
          {phase === 'ready' && items.slice(0, 5).map((x, i) => (
            <div key={x.key} className="tag" style={{ left: TAGPOS[i].l, top: TAGPOS[i].t }}>
              <span className="dot" style={{ background: DOTS[i % 5] }} />{x.nome.split(/[ ,]/)[0]}<span className="muted" style={{ fontWeight: 500 }}>{x.status === 'pendente' ? x.conf + '%' : '✓'}</span>
            </div>
          ))}
        </div>

        <div className="ana-body">
          <div className="grabber" />

          {phase === 'loading' && (
            <>
              <div className="col" style={{ gap: 6 }} aria-live="polite">
                <div className="ana-h">Identificando alimentos…</div>
                <div className="muted" style={{ font: '400 calc(14 * var(--u)) var(--font)' }}>{draft.file ? 'A IA está olhando a foto e estimando as porções.' : 'A IA está separando os itens e estimando as porções.'} Leva alguns segundos.</div>
              </div>
              <Skeleton />
            </>
          )}

          {phase === 'error' && (
            <section className="card" role="alert">
              <span className="h-card">Não deu para analisar</span>
              <span className="muted" style={{ font: '500 calc(14 * var(--u))/1.5 var(--font)' }}>{failure}</span>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn pri h46 flex1" onClick={start}>Tentar de novo</button>
                <button className="btn sec h46 flex1" onClick={() => navigate('registrar', true)}>Registrar de outro jeito</button>
              </div>
            </section>
          )}

          {phase === 'ready' && items.length === 0 && (
            <section className="card">
              <span className="h-card">Não encontrei comida aqui</span>
              <span className="muted" style={{ font: '500 calc(14 * var(--u))/1.5 var(--font)' }}>{aviso || 'Tente outra foto, de cima e com o prato inteiro, ou descreva o que comeu.'}</span>
              <button className="btn pri h46" onClick={() => navigate('registrar', true)}>Tirar outra foto</button>
            </section>
          )}

          {phase === 'ready' && items.length > 0 && (
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

              <section className="card when">
                <span className="ana-sec">Quando você comeu?</span>
                <div className="chips">
                  {MEAL_CHIPS.map(([id, label]) => <button key={id} className={'chip' + (meal === id ? ' on' : '')} aria-pressed={meal === id} onClick={() => setMeal(id)}>{label}</button>)}
                </div>
                <label className="row" style={{ gap: 10 }}>
                  <span className="grow" style={{ font: '600 calc(15 * var(--u)) var(--font)' }}>Horário</span>
                  <input className="time-in" type="time" value={time} onChange={e => e.target.value && setTime(e.target.value)} />
                </label>
              </section>

              {aviso && <div className="note"><span className="i">i</span><span>{aviso}</span></div>}

              <div className="row-between" style={{ marginTop: 4 }}>
                <span className="ana-sec">Confira cada alimento</span>
                <span className={'muted' + (allChecked ? ' ok-count' : '')} style={{ font: '600 calc(13 * var(--u)) var(--font)' }}>{checked} de {items.length} conferidos</span>
              </div>
              {items.map((x, i) => {
                const m = per(x, x.gramas);
                const hi = x.conf >= 85, mid = x.conf >= 70;
                const open = correcting === x.key;
                return (
                  <div key={x.key} className={'card r20 p16 item' + (x.status !== 'pendente' ? ' checked' : '')}>
                    <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                      <span className="item-dot" style={{ background: DOTS[i % 5] }} />
                      <div className="grow col" style={{ gap: 6 }}>
                        <div className="item-name">{x.nome}</div>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          <span className={'conf ' + (x.status !== 'pendente' || hi ? 'ok' : 'warn')}>
                            {x.status === 'ok' ? 'Conferido por você' : x.status === 'corrigido' ? 'Corrigido por você' : (hi ? 'IA: confiança alta' : mid ? 'IA: confiança média' : 'IA: confiança baixa') + ' ' + x.conf + '%'}
                          </span>
                          <span className="src-tag" title={x.taco_nome ?? undefined}>{x.fonte === 'TACO' ? 'TACO' : 'estimativa IA'}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}><div className="item-kcal num">{fmt(m.kcal)}</div><div className="small" style={{ fontWeight: 500 }}>kcal</div></div>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="step" aria-label="Diminuir porção" onClick={() => setGrams(x.key, x.gramas - 10)}>−</button>
                      <input className="slider" type="range" min={0} max={Math.max(400, Math.ceil(x.gramas * 2 / 50) * 50)} step={5} value={x.gramas} onChange={e => setGrams(x.key, e.target.value)} aria-label={'Quantidade de ' + x.nome + ' em gramas'} />
                      <button className="step" aria-label="Aumentar porção" onClick={() => setGrams(x.key, x.gramas + 10)}>+</button>
                      <label className="grams"><input type="number" inputMode="numeric" value={x.gramas} onChange={e => setGrams(x.key, e.target.value)} aria-label="Gramas" /><span>g</span></label>
                    </div>
                    <span className="muted num" style={{ font: '500 calc(13 * var(--u)) var(--font)' }}>P {fmt(m.p)} · C {fmt(m.c)} · G {fmt(m.g)} · F {fmt(m.f)} g{x.taco_nome && x.taco_nome !== x.nome ? ` · TACO: ${x.taco_nome}` : ''}</span>
                    {x.status === 'pendente' && !open ? (
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn pri h44 flex1" onClick={() => update(x.key, it => ({ ...it, status: 'ok' }))}>Está certo</button>
                        <button className="btn sec h44 flex1" onClick={() => { setCorrecting(x.key); setOther(''); }}>Não é isso</button>
                      </div>
                    ) : !open && (
                      <button className="link-btn" style={{ alignSelf: 'flex-start', padding: 0 }} onClick={() => { setCorrecting(x.key); setOther(''); }}>Trocar alimento</button>
                    )}
                    {open && (
                      <div className="correct">
                        {x.alts.length > 0 && <div className="label">Era um destes?</div>}
                        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                          {x.alts.map(a => <button key={a.nome} className="alt" onClick={() => pickAlt(x.key, a)}>{a.nome}</button>)}
                        </div>
                        <div className="label">Ou digite o que era</div>
                        <div className="row" style={{ gap: 8 }}>
                          <input className="other-in" value={other} onChange={e => setOther(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') typeOther(x.key); }} placeholder="Ex.: carne moída" aria-label="Nome do alimento" />
                          <button className="btn pri h44" onClick={() => typeOther(x.key)} disabled={x.busy || !other.trim()}>{x.busy ? '…' : 'Usar'}</button>
                        </div>
                        <Suggestions query={other} onPick={f => pickFood(x.key, f)} />
                        <div className="row-between">
                          <button className="remove" onClick={() => { setItems(its => its.filter(it => it.key !== x.key)); setCorrecting(null); }}>Não estava no prato · remover</button>
                          <button className="link-btn" style={{ padding: 0 }} onClick={() => setCorrecting(null)}>Fechar</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <section className="card add-item">
                <span className="label">A foto não pegou algum item?</span>
                <div className="row" style={{ gap: 8 }}>
                  <input className="other-in" value={adding} onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addItem(); }} placeholder="Ex.: 1 copo de suco de laranja" aria-label="Adicionar item" />
                  <button className="btn sec h44" onClick={addItem} disabled={addBusy || !adding.trim()}>{addBusy ? '…' : '+ Adicionar'}</button>
                </div>
                <Suggestions query={adding} onPick={addFood} />
              </section>
              {failure && <div className="warn-box" role="alert">{failure}</div>}
              <div className="note"><span className="i">i</span><span>Estimativas por foto são aproximadas: confira alimentos e quantidades. Valores nutricionais da tabela TACO (NEPA/UNICAMP) quando disponíveis. Ajustes na dieta devem ser validados com seu nutrólogo.</span></div>
            </>
          )}
        </div>
      </div>

      {phase === 'ready' && items.length > 0 && (
        <div className="ana-bar">
          <button className="btn pri" style={{ height: 56, borderRadius: 18, fontSize: 'calc(16 * var(--u))' }} onClick={confirm} disabled={!allChecked}>
            {allChecked ? <>Comi isso, adicionar ao dia<span style={{ opacity: .8, fontWeight: 600 }}>· {fmt(tot.kcal)} kcal</span></> : `Confira os itens · ${checked} de ${items.length}`}
          </button>
          <button className="btn txt" style={{ height: 46 }} onClick={discard}>Não comi / descartar</button>
        </div>
      )}

      {result === 'confirmed' && (
        <div className="scrim">
          <div className="sheet" role="dialog" aria-label={mealName + ' adicionado'}>
            <div className="check-circle">✓</div>
            <h2>{mealName} adicionado</h2>
            <p>+{fmt(lastAdd)} kcal às {time}. {remaining - lastAdd >= 0 ? <>Restam <strong style={{ color: 'var(--ink)' }}>{fmt(remaining - lastAdd)} kcal</strong> para a meta de hoje.</> : <>Você está <strong style={{ color: 'var(--ink)' }}>{fmt(lastAdd - remaining)} kcal</strong> acima da meta de hoje.</>}</p>
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
