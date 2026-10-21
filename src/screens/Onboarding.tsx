import { useState } from 'react';
import type { Activity, Body, Objetivo, Rotina } from '../types';
import { finishOnboarding, useApp } from '../store/app';
import { session } from '../store/session';
import { navigate } from '../hooks/useRoute';
import { OBJETIVOS, autoGoals, idadeDe } from '../lib/nutrition';
import { mealTimes } from '../lib/rotina';
import { dec, fmt } from '../lib/format';
import { MONTHS, addDays, today, todayKey } from '../lib/dates';
import { AgentMark } from '../components/AgentMark';
import './Onboarding.css';

const ACTIVITY: [Activity, string, string][] = [
  ['sed', 'Sedentário', 'Trabalho sentado, quase não me exercito'],
  ['leve', 'Leve', 'Caminho ou treino 1 a 3 vezes por semana'],
  ['mod', 'Moderada', 'Treino 3 a 5 vezes por semana'],
  ['alta', 'Alta', 'Treino pesado quase todo dia ou trabalho físico']
];
const RESTRICOES = ['Vegetariano', 'Vegano', 'Sem lactose', 'Sem glúten', 'Sem carne vermelha', 'Sem peixe'];
const MEAL_NAMES: [keyof Rotina['horarios'], string][] = [['cafe', 'Café da manhã'], ['lanche1', 'Lanche da manhã'], ['almoco', 'Almoço'], ['lanche2', 'Lanche da tarde'], ['jantar', 'Jantar']];

type Step = 'dados' | 'objetivo' | 'atividade' | 'rotina' | 'preferencias' | 'resumo';

const parseNum = (v: string) => Number(v.replace(',', '.'));

function Stepper({ label, value, onChange, step, min, max, unit }: { label: string; value: number; onChange: (n: number) => void; step: number; min: number; max: number; unit: string }) {
  return (
    <div className="row">
      <span className="grow" style={{ font: '600 calc(15 * var(--u)) var(--font)' }}>{label}</span>
      <button type="button" className="step" aria-label={'Diminuir ' + label.toLowerCase()} onClick={() => onChange(Math.max(min, Math.round((value - step) * 10) / 10))}>−</button>
      <span className="ob-val num">{(step < 1 ? dec(value) : value) + unit}</span>
      <button type="button" className="step" aria-label={'Aumentar ' + label.toLowerCase()} onClick={() => onChange(Math.min(max, Math.round((value + step) * 10) / 10))}>+</button>
    </div>
  );
}

export function Onboarding() {
  const s = useApp();
  const r = s.rotina;
  const needsBody = !s.body.nascimento;
  const steps: Step[] = [...(needsBody ? (['dados'] as Step[]) : []), 'objetivo', 'atividade', 'rotina', 'preferencias', 'resumo'];
  const [i, setI] = useState(0);
  const step = steps[i];
  const [error, setError] = useState<string | null>(null);

  // body
  const [nascimento, setNascimento] = useState(s.body.nascimento ?? '');
  const [sexo, setSexo] = useState<Body['sexo']>(s.body.sexo);
  const [altura, setAltura] = useState(String(s.body.altura));
  const [peso, setPeso] = useState(dec(s.weights.at(-1)?.kg ?? s.body.peso).replace(/,0$/, ''));
  // goal and activity
  const pesoAtual = parseNum(peso) || s.body.peso;
  const [objetivo, setObjetivo] = useState<Objetivo>(r?.objetivo ?? 'emagrecer');
  const [pesoMeta, setPesoMeta] = useState(r?.pesoMeta ?? Math.round(pesoAtual * 0.92));
  const [ritmo, setRitmo] = useState(s.body.ritmo);
  const [atividade, setAtividade] = useState<Activity>(s.body.atividade);
  const [treinoDias, setTreinoDias] = useState(r?.treinoDias ?? 3);
  const [treinoHorario, setTreinoHorario] = useState(r?.treinoHorario ?? '');
  // routine
  const [acorda, setAcorda] = useState(r?.acorda ?? '06:30');
  const [saiFora, setSaiFora] = useState(r ? !!r.sai : true);
  const [sai, setSai] = useState(r?.sai ?? '07:30');
  const [almoco, setAlmoco] = useState(r?.almoco ?? '12:00');
  const [dorme, setDorme] = useState(r?.dorme ?? '23:00');
  // preferences
  const [restricoes, setRestricoes] = useState<string[]>(r?.restricoes ?? []);
  const [naoGosta, setNaoGosta] = useState(r?.naoGosta ?? '');

  const age = nascimento ? idadeDe({ ...s.body, nascimento }) : 0;
  const body: Body = { ...s.body, nascimento: nascimento || undefined, idade: age || s.body.idade, sexo, altura: Math.round(parseNum(altura)) || s.body.altura, peso: pesoAtual, atividade, ritmo };
  const horarios = mealTimes(acorda, almoco, dorme, saiFora ? sai : undefined);
  const g = autoGoals(body, pesoMeta, objetivo);
  const diff = Math.abs(pesoAtual - pesoMeta);
  const semanas = objetivo === 'emagrecer' || objetivo === 'cutting' ? Math.ceil(diff / ritmo) : objetivo === 'bulking' ? Math.ceil(diff / 0.25) : 0;
  const pickObjetivo = (o: Objetivo) => {
    setObjetivo(o);
    // start the goal weight on the right side of the current one
    if (o === 'bulking' && pesoMeta <= pesoAtual) setPesoMeta(Math.round(pesoAtual + 4));
    if ((o === 'emagrecer' || o === 'cutting') && pesoMeta >= pesoAtual) setPesoMeta(Math.round(pesoAtual * 0.92));
    if (o === 'manter' || o === 'recomposicao') setPesoMeta(Math.round(pesoAtual * 2) / 2);
  };
  const chegada = addDays(today(), semanas * 7);

  const validate = (): string | null => {
    if (step === 'dados') {
      if (!(age >= 14 && age <= 100)) return 'Confira a data de nascimento.';
      if (!(body.altura >= 120 && body.altura <= 230)) return 'Informe a altura em centímetros, por exemplo 172.';
      if (!(pesoAtual >= 35 && pesoAtual <= 300)) return 'Informe o peso atual em kg, por exemplo 84,5.';
    }
    if (step === 'rotina' && (!acorda || !almoco || !dorme || (saiFora && !sai))) return 'Preencha os horários.';
    return null;
  };
  const next = () => {
    const err = validate();
    setError(err);
    if (!err) setI(x => Math.min(steps.length - 1, x + 1));
  };
  const finish = (comAgente: boolean) => {
    const rotina: Rotina = {
      objetivo, pesoMeta, treinoDias, treinoHorario: treinoHorario || undefined, acorda, sai: saiFora ? sai : undefined, almoco, dorme,
      restricoes, naoGosta: naoGosta.trim(), horarios, anamnese: r?.anamnese
    };
    finishOnboarding(body, rotina, todayKey());
    session.set(x => ({ ...x, redoOnboarding: false, agentPrompt: comAgente ? 'Quero montar minha dieta.' : null }));
    navigate(comAgente ? 'agente' : 'hoje', true);
  };

  const toggle = (v: string) => setRestricoes(x => (x.includes(v) ? x.filter(y => y !== v) : [...x, v]));

  return (
    <div className="screen ob">
      <div className="ob-progress" aria-label={`Etapa ${i + 1} de ${steps.length}`}>
        {steps.map((st, j) => <span key={st} className={j <= i ? 'on' : ''} />)}
      </div>

      {step === 'dados' && (
        <>
          <div className="ob-head"><AgentMark size={40} radius={14} ring={16} stroke={3} /><h1 className="h-screen">Vamos te conhecer</h1></div>
          <p className="ob-sub">Esses dados são a base do cálculo das suas metas.</p>
          <section className="card">
            <label className="field"><span>Data de nascimento</span><input type="date" value={nascimento} onChange={e => setNascimento(e.target.value)} max={todayKey()} /></label>
            <div className="field">
              <span>Sexo</span>
              <div className="seg fill">
                <button type="button" className={sexo === 'F' ? 'on' : ''} onClick={() => setSexo('F')}>Feminino</button>
                <button type="button" className={sexo === 'M' ? 'on' : ''} onClick={() => setSexo('M')}>Masculino</button>
              </div>
            </div>
            <div className="grid2" style={{ gap: 10 }}>
              <label className="field"><span>Altura (cm)</span><input inputMode="numeric" value={altura} onChange={e => setAltura(e.target.value)} /></label>
              <label className="field"><span>Peso atual (kg)</span><input inputMode="decimal" value={peso} onChange={e => setPeso(e.target.value)} /></label>
            </div>
          </section>
        </>
      )}

      {step === 'objetivo' && (
        <>
          <h1 className="h-screen">Qual é o seu objetivo?</h1>
          <p className="ob-sub">Hoje você está com {dec(pesoAtual).replace(/,0$/, '')} kg.</p>
          <section className="card" style={{ gap: 8 }}>
            {OBJETIVOS.map(([id, label, desc]) => (
              <button key={id} type="button" className={'ob-option' + (objetivo === id ? ' on' : '')} aria-pressed={objetivo === id} onClick={() => pickObjetivo(id)}>
                <span className="radio"><span /></span>
                <span className="col" style={{ gap: 2 }}><span className="ob-option-t">{label}</span><span className="muted" style={{ font: '500 calc(13 * var(--u)) var(--font)' }}>{desc}</span></span>
              </button>
            ))}
          </section>
          {objetivo !== 'manter' && (
            <section className="card">
              <Stepper label="Peso desejado" value={pesoMeta} onChange={setPesoMeta} step={0.5} min={35} max={300} unit=" kg" />
              {(objetivo === 'emagrecer' || objetivo === 'cutting') && (
                <>
                  <span className="label" style={{ marginTop: 4 }}>Em que ritmo?</span>
                  <div className="chips">
                    {[0.25, 0.5, 0.75].map(v => (
                      <button key={v} type="button" className={'chip' + (ritmo === v ? ' on' : '')} onClick={() => setRitmo(v)}>{dec(v, 2).replace(/0$/, '')} kg/semana</button>
                    ))}
                  </div>
                  <span className="small">0,5 kg por semana é um bom equilíbrio entre resultado e conforto.</span>
                </>
              )}
            </section>
          )}
          <section className="ob-callout">
            {(objetivo === 'emagrecer' || objetivo === 'cutting') && <>Perder <strong>{dec(diff).replace(/,0$/, '')} kg</strong> leva cerca de <strong>{semanas} semanas</strong> — previsão para <strong>{MONTHS[chegada.getMonth()]} de {chegada.getFullYear()}</strong>.{objetivo === 'cutting' && ' Proteína mais alta para preservar músculo.'}</>}
            {objetivo === 'bulking' && <>Ganhar <strong>{dec(diff).replace(/,0$/, '')} kg</strong> com um excedente pequeno leva cerca de <strong>{semanas} semanas</strong>. Treino de força é essencial.</>}
            {objetivo === 'recomposicao' && <>Na recomposição o peso muda pouco: a ideia é trocar gordura por músculo, com déficit leve e proteína alta. Acompanhe as medidas.</>}
            {objetivo === 'manter' && <>Seu objetivo é <strong>manter o peso</strong>. As metas ficam no seu gasto do dia a dia.</>}
          </section>
        </>
      )}

      {step === 'atividade' && (
        <>
          <h1 className="h-screen">Como é sua rotina de exercícios?</h1>
          <p className="ob-sub">Isso muda quanto você gasta por dia.</p>
          <section className="card" style={{ gap: 8 }}>
            {ACTIVITY.map(([id, label, desc]) => (
              <button key={id} type="button" className={'ob-option' + (atividade === id ? ' on' : '')} aria-pressed={atividade === id} onClick={() => setAtividade(id)}>
                <span className="radio"><span /></span>
                <span className="col" style={{ gap: 2 }}><span className="ob-option-t">{label}</span><span className="muted" style={{ font: '500 calc(13 * var(--u)) var(--font)' }}>{desc}</span></span>
              </button>
            ))}
          </section>
          <section className="card">
            <Stepper label="Dias de treino por semana" value={treinoDias} onChange={setTreinoDias} step={1} min={0} max={7} unit="" />
            {treinoDias > 0 && <label className="field"><span>Horário em que costuma treinar (opcional)</span><input type="time" value={treinoHorario} onChange={e => setTreinoHorario(e.target.value)} /></label>}
          </section>
        </>
      )}

      {step === 'rotina' && (
        <>
          <h1 className="h-screen">Seus horários</h1>
          <p className="ob-sub">Com eles eu organizo as refeições no seu dia.</p>
          <section className="card">
            <div className="grid2" style={{ gap: 10 }}>
              <label className="field"><span>Acordo às</span><input type="time" value={acorda} onChange={e => setAcorda(e.target.value)} /></label>
              <label className="field"><span>Almoço às</span><input type="time" value={almoco} onChange={e => setAlmoco(e.target.value)} /></label>
              <label className="field"><span>Durmo às</span><input type="time" value={dorme} onChange={e => setDorme(e.target.value)} /></label>
              {saiFora && <label className="field"><span>Saio de casa às</span><input type="time" value={sai} onChange={e => setSai(e.target.value)} /></label>}
            </div>
            <label className="ob-check"><input type="checkbox" checked={!saiFora} onChange={e => setSaiFora(!e.target.checked)} /> Trabalho ou estudo em casa</label>
          </section>
          <section className="card ob-times">
            <span className="label">Suas refeições ficam assim</span>
            {MEAL_NAMES.map(([id, name]) => <div key={id} className="row-between"><span>{name}</span><strong className="num">{horarios[id]}</strong></div>)}
            <span className="small">Dá para ajustar depois em Meu plano ou pedindo ao agente.</span>
          </section>
        </>
      )}

      {step === 'preferencias' && (
        <>
          <h1 className="h-screen">Algo que você não come?</h1>
          <p className="ob-sub">O agente leva isso em conta ao montar a dieta.</p>
          <section className="card">
            <span className="label">Restrições</span>
            <div className="chips">{RESTRICOES.map(v => <button key={v} type="button" className={'chip' + (restricoes.includes(v) ? ' on' : '')} aria-pressed={restricoes.includes(v)} onClick={() => toggle(v)}>{v}</button>)}</div>
            <label className="field" style={{ marginTop: 4 }}><span>Alimentos que você não gosta (opcional)</span><input value={naoGosta} onChange={e => setNaoGosta(e.target.value)} placeholder="Ex.: fígado, beterraba, peixe" /></label>
          </section>
        </>
      )}

      {step === 'resumo' && (
        <>
          <h1 className="h-screen">Tudo pronto{s.profile.name ? ', ' + s.profile.name : ''}</h1>
          <p className="ob-sub">Esta é a sua base. Antes de montar a dieta, o agente conversa com você como um nutrólogo para entender sua saúde, sono, intestino e hábitos.</p>
          <section className="card">
            <span className="label">Sua meta diária</span>
            <div className="row" style={{ alignItems: 'baseline', gap: 6 }}><span className="ob-kcal num">{fmt(g.kcal)}</span><span className="muted" style={{ font: '600 calc(15 * var(--u)) var(--font)' }}>kcal</span></div>
            <span className="muted" style={{ font: '500 calc(13 * var(--u))/1.45 var(--font)' }}>
              Gasto estimado {fmt(g.tdee)} kcal{g.def > 0 ? ` − déficit ${fmt(g.def)} kcal` : g.def < 0 ? ` + ${fmt(-g.def)} kcal` : ''} · P {g.p} · C {g.c} · G {g.g} · F {g.f} g
            </span>
            {g.floored && <span className="warn-box">Ajustamos para o mínimo seguro. Para ir mais rápido, converse com um profissional.</span>}
            <span className="muted" style={{ font: '500 calc(13 * var(--u))/1.45 var(--font)' }}>
              {OBJETIVOS.find(o => o[0] === objetivo)?.[1]} · {dec(pesoAtual)} kg{objetivo !== 'manter' && objetivo !== 'recomposicao' ? ` → ${dec(pesoMeta)} kg` : ''}{semanas ? ` · cerca de ${semanas} semanas` : ''}
            </span>
          </section>
          <section className="card ob-times">
            <span className="label">Horários das refeições</span>
            {MEAL_NAMES.map(([id, name]) => <div key={id} className="row-between"><span>{name}</span><strong className="num">{horarios[id]}</strong></div>)}
          </section>
        </>
      )}

      {error && <div className="warn-box" role="alert">{error}</div>}

      <div className="ob-nav">
        {step === 'resumo' ? (
          <>
            <button type="button" className="btn pri" onClick={() => finish(true)}>Conversar com o agente e montar a dieta</button>
            <button type="button" className="btn txt" onClick={() => finish(false)}>Ir para o Hoje</button>
          </>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            {i > 0 && <button type="button" className="btn sec" onClick={() => { setError(null); setI(x => x - 1); }}>Voltar</button>}
            <button type="button" className="btn pri flex1" onClick={next}>Continuar</button>
          </div>
        )}
        {s.onboardedAt && <button type="button" className="btn txt" style={{ height: 40 }} onClick={() => session.set(x => ({ ...x, redoOnboarding: false }))}>Cancelar</button>}
      </div>
    </div>
  );
}
