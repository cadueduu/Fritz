import { useEffect, useRef, useState } from 'react';
import { addMsg, useApp } from '../store/app';
import { useToast } from '../hooks/useToast';
import { CHIPS, FALLBACK_REPLY, PROPOSAL, REPLIES } from '../data/agent';
import { addDays, rangeShort, today } from '../lib/dates';
import { AgentMark } from '../components/AgentMark';
import { TabBar } from '../components/TabBar';
import './Agente.css';

const SUMMARY = [
  ['Tendência de peso', '−0,4 kg/sem'],
  ['Aderência', '82%'],
  ['Refeições registradas', '31 de 35'],
  ['Proteína média', '118 g']
];

export function Agente() {
  const s = useApp();
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [toast, showToast] = useToast();
  const chatRef = useRef<HTMLDivElement>(null);
  const replyTimer = useRef<number | undefined>(undefined);

  const mounted = useRef(false);
  useEffect(() => {
    const el = chatRef.current;
    // jump straight to the latest message on open, animate for new ones
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: mounted.current ? 'smooth' : 'auto' });
    mounted.current = true;
  }, [s.msgs.length, typing]);
  useEffect(() => () => clearTimeout(replyTimer.current), []);

  const send = (text: string) => {
    if (!text.trim() || typing) return;
    addMsg({ from: 'user', text: text.trim() });
    setInput('');
    setTyping(true);
    replyTimer.current = window.setTimeout(() => {
      setTyping(false);
      addMsg({ from: 'agent', text: REPLIES[text.trim()] || FALLBACK_REPLY });
    }, 1400);
  };

  const proposalText = 'Proposta para levar ao nutrólogo\n' + PROPOSAL.map((p, i) => `${i + 1}. ${p}`).join('\n');
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: 'Proposta · Leve', text: proposalText }); return; }
      await navigator.clipboard.writeText(proposalText);
      showToast('Proposta copiada · cole onde quiser enviar');
    } catch { /* share sheet dismissed */ }
  };

  const t0 = today();
  const name = s.profile.name;

  return (
    <>
      <header className="agent-head">
        <AgentMark size={42} radius={15} ring={16} stroke={3} />
        <div className="grow">
          <div style={{ font: '700 calc(17 * var(--u)) var(--font)' }}>Agente Leve</div>
          <div className="muted" style={{ font: '500 calc(12.5 * var(--u)) var(--font)' }}>Analisa seus registros · não altera suas metas</div>
        </div>
      </header>

      <div ref={chatRef} className="chat" aria-live="polite">
        <div className="bubble agent">Bom dia, {name}. Fechei o resumo da sua semana.</div>

        <section className="card" style={{ padding: 18, gap: 14 }}>
          <div className="row-between"><span style={{ font: '700 calc(17 * var(--u)) var(--display)' }}>Resumo semanal</span><span className="small" style={{ fontWeight: 500 }}>{rangeShort(addDays(t0, -7), addDays(t0, -1))}</span></div>
          <div className="grid2" style={{ gap: 8 }}>
            {SUMMARY.map(([k, v]) => (
              <div key={k} className="sum-tile"><div>{k}</div><div>{v}</div></div>
            ))}
          </div>
          <div className="col" style={{ gap: 8, font: '500 calc(14 * var(--u))/1.45 var(--font)' }}>
            <div className="row" style={{ alignItems: 'flex-start' }}><span className="dot" style={{ background: 'var(--pri)', marginTop: 7 }} /><span><strong>Padrão:</strong> café da manhã registrado 7 de 7 dias, sempre dentro do plano.</span></div>
            <div className="row" style={{ alignItems: 'flex-start' }}><span className="dot" style={{ background: 'var(--ambLine)', marginTop: 7 }} /><span><strong>Ponto de melhora:</strong> o lanche da tarde ficou fora do plano 3 vezes, sempre depois das 17h.</span></div>
          </div>
        </section>

        <section className="card proposal">
          <div className="row" style={{ gap: 8 }}><span className="badge ok" style={{ padding: '4px 9px', borderRadius: 8 }}>Proposta</span><span style={{ font: '700 calc(15 * var(--u)) var(--font)' }}>Para levar ao nutrólogo</span></div>
          <div className="col" style={{ gap: 10, font: '500 calc(14 * var(--u))/1.45 var(--font)' }}>
            {PROPOSAL.map((p, i) => <div key={i} className="row" style={{ alignItems: 'flex-start' }}><span style={{ fontWeight: 700, color: 'var(--pri)' }}>{i + 1}</span><span>{p}</span></div>)}
          </div>
          <div className="muted" style={{ font: '500 calc(12.5 * var(--u))/1.45 var(--font)' }}>Suas metas continuam as mesmas até o nutrólogo validar. Próxima consulta: 12 nov.</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn pri h46 flex1" onClick={() => showToast('PDF da proposta gerado · pronto para enviar')}>Exportar PDF</button>
            <button className="btn sec h46 flex1" onClick={share}>Compartilhar</button>
          </div>
        </section>

        {s.msgs.map((m, i) => <div key={i} className={'bubble ' + m.from}>{m.text}</div>)}
        {typing && <div className="bubble agent typing" aria-label="Agente digitando"><span /><span /><span /></div>}
      </div>

      <div className="composer">
        <div className="composer-chips">
          {CHIPS.map(c => <button key={c} className="chip" onClick={() => send(c)}>{c}</button>)}
        </div>
        <form className="row" style={{ gap: 8, padding: '0 16px' }} onSubmit={e => { e.preventDefault(); send(input); }}>
          <input className="chat-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Pergunte sobre seu plano…" aria-label="Mensagem para o agente" enterKeyHint="send" />
          <button type="submit" className="send" aria-label="Enviar">↑</button>
        </form>
      </div>
      {toast && <div className="toast agent-toast" role="status">{toast}</div>}
      <TabBar active="agente" />
    </>
  );
}
