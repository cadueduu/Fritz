import { useEffect, useRef, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { addAnamnese, addEntry, addMsg, addWeight, appStore, applyDiet, setWater, useApp } from '../store/app';
import { navigate } from '../hooks/useRoute';
import { session } from '../store/session';
import { CHIPS } from '../data/agent';
import { addDays, dateKey, parseKey, rangeShort, today } from '../lib/dates';
import { goals, goalsAuto, idadeDe, planList, sumEntries } from '../lib/nutrition';
import { dec, fmt } from '../lib/format';
import { cleanActions } from '../lib/agentActions';
import { MEAL_LABEL } from '../data/plan';
import { supabase } from '../lib/supabase';
import type { AgentAction, AppState, DietProposal } from '../types';
import { AgentMark } from '../components/AgentMark';
import { TabBar } from '../components/TabBar';
import './Agente.css';

/** Numbers for the last 7 full days, computed from the user's own records. */
function weeklySummary(s: AppState) {
  const t0 = today();
  const days = Array.from({ length: 7 }, (_, i) => dateKey(addDays(t0, i - 7)));
  const plan = planList(s);
  const entries = days.flatMap(d => (s.diaries[d] || []).map(e => ({ ...e, day: d })));
  const total = entries.length;
  const inPlan = entries.filter(e => !e.fora).length;
  const logged = days.reduce((a, d) => a + plan.filter(p => (s.diaries[d] || []).some(e => e.meal === p.id)).length, 0);
  const daysWithData = days.filter(d => (s.diaries[d] || []).length > 0);
  const protein = daysWithData.reduce((a, d) => a + (s.diaries[d] || []).reduce((x, e) => x + e.p * e.mult, 0), 0);
  const recent = s.weights.filter(w => parseKey(w.date) >= addDays(t0, -14));
  let trend = '—';
  if (recent.length >= 2) {
    const a = recent[0], b = recent[recent.length - 1];
    const span = (parseKey(b.date).getTime() - parseKey(a.date).getTime()) / 86400000;
    if (span >= 3) trend = dec(((b.kg - a.kg) / span) * 7).replace('-', '−') + ' kg/sem';
  }
  const best = plan.map(p => ({ p, n: days.filter(d => (s.diaries[d] || []).some(e => e.meal === p.id)).length })).sort((x, y) => y.n - x.n)[0];
  const fora = entries.filter(e => e.fora).length;
  return {
    hasData: total > 0,
    tiles: [
      ['Tendência de peso', trend],
      ['Aderência', total ? Math.round((inPlan / total) * 100) + '%' : '—'],
      ['Refeições registradas', logged + ' de ' + plan.length * 7],
      ['Proteína média', daysWithData.length ? fmt(protein / daysWithData.length) + ' g' : '—']
    ],
    pattern: best && best.n > 0 ? `${best.p.name.toLowerCase()} registrado ${best.n} de 7 dias.` : null,
    improve: fora > 0 ? `${fora} ${fora > 1 ? 'registros ficaram' : 'registro ficou'} fora do plano nesta semana.` : null
  };
}

/** What the agent gets to know about the user with each question. */
function agentContext(s: AppState) {
  const t0 = today();
  const day = (o: number) => {
    const k = dateKey(addDays(t0, o));
    const list = s.diaries[k] || [];
    const t = sumEntries(list);
    return { dia: k, kcal: Math.round(t.kcal), p: Math.round(t.p), c: Math.round(t.c), g: Math.round(t.g), f: Math.round(t.f),
      refeicoes: list.map(e => `${e.time} ${e.title}: ${e.desc} (${Math.round(e.kcal * e.mult)} kcal${e.fora ? ', fora do plano' : ''})`) };
  };
  return {
    data_hoje: dateKey(t0),
    hora_agora: new Date().toTimeString().slice(0, 5),
    nome: s.profile.name,
    dados_corporais: { ...s.body, idade: idadeDe(s.body) },
    objetivo: s.rotina ? { tipo: goalsAuto(s).objetivo, peso_meta_kg: s.rotina.pesoMeta, ritmo_kg_semana: s.body.ritmo } : null,
    anamnese_ja_respondida: s.rotina?.anamnese ?? [],
    rotina: s.rotina ? {
      acorda: s.rotina.acorda, sai_de_casa: s.rotina.sai ?? 'trabalha/estuda em casa', almoco: s.rotina.almoco, dorme: s.rotina.dorme,
      treino: { dias_por_semana: s.rotina.treinoDias, horario: s.rotina.treinoHorario ?? null },
      horarios_das_refeicoes: s.rotina.horarios
    } : null,
    preferencias: s.rotina ? { restricoes: s.rotina.restricoes, nao_gosta: s.rotina.naoGosta } : null,
    origem_das_metas: s.planMode === 'nutro' ? 'dieta cadastrada' : 'calculadas pelo app (sem dieta)',
    metas_diarias: goals(s),
    calculo_automatico: goalsAuto(s),
    plano_atual: s.planMode === 'nutro' ? s.dietMeals : planList(s),
    hoje: day(0),
    agua_hoje_copos: s.water[dateKey(t0)] ?? 0,
    ultimos_7_dias: Array.from({ length: 7 }, (_, i) => day(i - 7)).filter(d => d.refeicoes.length),
    // older days as daily totals only, to keep the request small
    dias_8_a_28: Array.from({ length: 21 }, (_, i) => day(i - 28)).filter(d => d.refeicoes.length).map(({ refeicoes, ...t }) => ({ ...t, n_registros: refeicoes.length })),
    pesagens_recentes: s.weights.slice(-30)
  };
}

const ERRORS: Record<string, string> = {
  missing_key: 'O agente ainda não está configurado: falta a chave do Gemini (GEMINI_API_KEY) no Supabase.',
  bad_key: 'A chave do Gemini configurada no Supabase não é válida ou o modelo não está disponível.',
  rate_limited: 'O limite gratuito do Gemini foi atingido por agora. Espere um minuto e tente de novo.',
  overloaded: 'A IA gratuita está sobrecarregada agora (isso costuma passar em alguns minutos). Tente de novo daqui a pouco.'
};

function DietCard({ d }: { d: DietProposal }) {
  const s = useApp();
  const applied = s.planMode === 'nutro' && s.dietGoals.kcal === d.metas.kcal && s.dietMeals.length === d.refeicoes.length && s.dietMeals.every((m, i) => m.name === d.refeicoes[i]?.nome && m.kcal === d.refeicoes[i]?.kcal);
  const share = async () => {
    const text = `Dieta proposta · ${fmt(d.metas.kcal)} kcal (P ${d.metas.p} · C ${d.metas.c} · G ${d.metas.g} · F ${d.metas.f} g)\n\n` +
      d.refeicoes.map(r => `${r.horario} ${r.nome} (~${fmt(r.kcal)} kcal)\n${r.itens.map(i => '• ' + i).join('\n')}`).join('\n\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Dieta · Leve', text });
      else await navigator.clipboard.writeText(text);
    } catch { /* share sheet dismissed */ }
  };
  return (
    <section className="card diet-card">
      <div className="row" style={{ gap: 8 }}><span className="badge ok" style={{ padding: '4px 9px', borderRadius: 8 }}>Dieta</span><span style={{ font: '700 calc(15 * var(--u)) var(--font)' }}>{fmt(d.metas.kcal)} kcal por dia</span></div>
      <div className="muted" style={{ font: '500 calc(13.5 * var(--u))/1.45 var(--font)' }}>{d.resumo}</div>
      <div className="macro-pills">
        {(['p', 'c', 'g', 'f'] as const).map((k, i) => <span key={k}><span className="mdot" style={{ background: ['var(--mP)', 'var(--mC)', 'var(--mG)', 'var(--mF)'][i] }} />{k.toUpperCase()} {d.metas[k]} g</span>)}
      </div>
      {d.refeicoes.map(r => (
        <div key={r.id} className="diet-meal">
          <div className="row-between"><span style={{ font: '600 calc(14.5 * var(--u)) var(--font)' }}>{r.horario} · {r.nome}</span><span style={{ font: '700 calc(13 * var(--u)) var(--font)', whiteSpace: 'nowrap' }}>~{fmt(r.kcal)} kcal</span></div>
          <div className="bullets">{r.itens.map(t => <span key={t}><span className="bullet" />{t}</span>)}</div>
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        {applied
          ? <button className="btn sec h46 flex1" onClick={() => navigate('plano')}>Aplicada ✓ · ver plano</button>
          : <button className="btn pri h46 flex1" onClick={() => applyDiet(d)}>Usar esta dieta</button>}
        <button className="btn sec h46" style={{ padding: '0 16px' }} onClick={share}>Compartilhar</button>
      </div>
    </section>
  );
}

/** Confirm card for a meal, weigh-in or water total the agent proposed. Applying is idempotent. */
function ActionCard({ a }: { a: Exclude<AgentAction, { type: 'dieta' | 'anamnese' }> }) {
  const s = useApp();
  const day = ('data' in a && a.data) || dateKey(today());
  const dayLabel = day === dateKey(today()) ? 'hoje' : parseKey(day).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  let title: string, sub: string, label: string, done: boolean, apply: () => void;
  if (a.type === 'refeicao') {
    const plan = planList(s).find(p => p.id === a.refeicao);
    const name = a.refeicao === 'extra' ? 'Extra' : plan?.name ?? MEAL_LABEL[a.refeicao];
    title = `${name} · ${fmt(a.kcal)} kcal`;
    sub = `${a.descricao} · P ${fmt(a.p)} · C ${fmt(a.c)} · G ${fmt(a.g)} · F ${fmt(a.f)} g · ${dayLabel}`;
    label = 'Adicionar ao dia';
    done = (s.diaries[day] || []).some(e => e.id === a.id);
    apply = () => addEntry(day, {
      id: a.id, time: a.horario ?? new Date().toTimeString().slice(0, 5), meal: a.refeicao, title: name, desc: a.descricao,
      kcal: a.kcal, p: a.p, c: a.c, g: a.g, f: a.f, fora: a.refeicao === 'extra', photo: false, mult: 1
    });
  } else if (a.type === 'peso') {
    title = `Pesagem · ${dec(a.kg)} kg`;
    sub = 'Entra no gráfico de Progresso · ' + dayLabel;
    label = 'Salvar pesagem';
    done = s.weights.some(w => w.date === day && w.kg === a.kg);
    apply = () => addWeight(day, a.kg);
  } else {
    title = `Água · ${dec(a.copos * 0.25, 2).replace(/,?0+$/, '')} L hoje`;
    sub = `${a.copos} de 8 copos de 250 ml`;
    label = 'Atualizar água';
    done = (s.water[dateKey(today())] ?? 0) === a.copos;
    apply = () => setWater(dateKey(today()), a.copos);
  }
  return (
    <section className="card action-card">
      <div className="col" style={{ gap: 3 }}>
        <span style={{ font: '700 calc(15 * var(--u)) var(--font)' }}>{title}</span>
        <span className="muted" style={{ font: '500 calc(13 * var(--u))/1.4 var(--font)' }}>{sub}</span>
      </div>
      {done
        ? <span className="badge ok" style={{ alignSelf: 'flex-start' }}>Registrado ✓</span>
        : <button className="btn pri h44" style={{ alignSelf: 'flex-start' }} onClick={apply}>{label}</button>}
    </section>
  );
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

export function Agente() {
  const s = useApp();
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const mounted = useRef(false);
  useEffect(() => {
    const el = chatRef.current;
    // jump straight to the latest message on open, animate for new ones
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: mounted.current ? 'smooth' : 'auto' });
    mounted.current = true;
  }, [s.msgs.length, typing, failure]);

  const ask = async () => {
    setFailure(null);
    setTyping(true);
    const st = appStore.get();
    try {
      const { data, error } = await supabase.functions.invoke<{ text: string; actions?: unknown }>('agente', {
        body: { messages: st.msgs.slice(-20).map(m => ({ from: m.from, text: m.text })), context: agentContext(st) }
      });
      if (error) {
        let code = '';
        if (error instanceof FunctionsHttpError) { try { code = (await error.context.json()).error ?? ''; } catch { /* not json */ } }
        throw new Error(code);
      }
      if (!data?.text) throw new Error('');
      const actions = cleanActions(data.actions);
      // anamnesis notes are the user's own answers: keep them on the profile right away
      actions.forEach(a => { if (a.type === 'anamnese') addAnamnese(a.itens); });
      addMsg({ from: 'agent', text: data.text, actions: actions.length ? actions : undefined });
    } catch (e) {
      setFailure(ERRORS[(e as Error).message] ?? 'Não consegui responder agora. Verifique a conexão e tente de novo.');
    } finally {
      setTyping(false);
    }
  };

  const send = (text: string) => {
    if (!text.trim() || typing) return;
    addMsg({ from: 'user', text: text.trim() });
    setInput('');
    ask();
  };

  // a question queued by another screen (e.g. the end of the questionnaire) is sent on arrival
  useEffect(() => {
    const q = session.get().agentPrompt;
    if (q) { session.set(x => ({ ...x, agentPrompt: null })); send(q); }
  }, []);

  const t0 = today();
  const name = s.profile.name;
  const sum = weeklySummary(s);

  return (
    <>
      <header className="agent-head">
        <AgentMark size={42} radius={15} ring={16} stroke={3} />
        <div className="grow">
          <div style={{ font: '700 calc(17 * var(--u)) var(--font)' }}>Agente Leve</div>
          <div className="muted" style={{ font: '500 calc(12.5 * var(--u)) var(--font)' }}>Monta sua dieta e analisa seus registros</div>
        </div>
      </header>

      <div ref={chatRef} className="chat" aria-live="polite">
        <div className="bubble agent">{greeting()}{name ? ', ' + name : ''}. {sum.hasData ? 'Fechei o resumo da sua semana.' : 'Registre suas refeições por alguns dias e eu monto o resumo da sua semana.'}</div>

        <section className="card" style={{ padding: 18, gap: 14 }}>
          <div className="row-between"><span style={{ font: '700 calc(17 * var(--u)) var(--display)' }}>Resumo semanal</span><span className="small" style={{ fontWeight: 500 }}>{rangeShort(addDays(t0, -7), addDays(t0, -1))}</span></div>
          <div className="grid2" style={{ gap: 8 }}>
            {sum.tiles.map(([k, v]) => (
              <div key={k} className="sum-tile"><div>{k}</div><div>{v}</div></div>
            ))}
          </div>
          <div className="col" style={{ gap: 8, font: '500 calc(14 * var(--u))/1.45 var(--font)' }}>
            {sum.pattern && <div className="row" style={{ alignItems: 'flex-start' }}><span className="dot" style={{ background: 'var(--pri)', marginTop: 7 }} /><span><strong>Padrão:</strong> {sum.pattern}</span></div>}
            {sum.improve && <div className="row" style={{ alignItems: 'flex-start' }}><span className="dot" style={{ background: 'var(--ambLine)', marginTop: 7 }} /><span><strong>Ponto de melhora:</strong> {sum.improve}</span></div>}
          </div>
        </section>

        {s.msgs.map((m, i) => (
          <div key={i} className="col" style={{ gap: 12 }}>
            <div className={'bubble ' + m.from}>{m.text}</div>
            {m.actions?.map((a, j) => (
              a.type === 'dieta' ? <DietCard key={j} d={a} />
                : a.type === 'anamnese' ? <div key={j} className="noted">Anotado no seu perfil: {a.itens.map(i => i.tema.toLowerCase()).join(', ')}</div>
                : <ActionCard key={j} a={a} />
            ))}
          </div>
        ))}
        {typing && <div className="bubble agent typing" aria-label="Agente pensando"><span /><span /><span /></div>}
        {failure && (
          <div className="bubble agent failure" role="alert">
            {failure}
            <button className="link-btn" style={{ display: 'block', padding: 0 }} onClick={ask}>Tentar de novo</button>
          </div>
        )}
      </div>

      <div className="composer">
        <div className="composer-chips">
          {CHIPS.map(c => <button key={c} className="chip" onClick={() => send(c)}>{c}</button>)}
        </div>
        <form className="row" style={{ gap: 8, padding: '0 16px' }} onSubmit={e => { e.preventDefault(); send(input); }}>
          <input className="chat-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Pergunte sobre seu plano…" aria-label="Mensagem para o agente" enterKeyHint="send" />
          <button type="submit" className="send" aria-label="Enviar" disabled={typing}>↑</button>
        </form>
      </div>
      <TabBar active="agente" />
    </>
  );
}
