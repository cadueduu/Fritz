import { navigate, type Route } from '../hooks/useRoute';
import './TabBar.css';

type Tab = 'hoje' | 'diario' | 'progresso' | 'agente';

const Item = ({ id, label, active, children }: { id: Tab; label: string; active?: Route; children: React.ReactNode }) => (
  <button className={'tab' + (active === id ? ' on' : '')} aria-label={label} aria-current={active === id ? 'page' : undefined} onClick={() => navigate(id)}>
    {children}
    {label}
  </button>
);

export function TabBar({ active }: { active?: Route }) {
  return (
    <nav className="tabbar">
      <Item id="hoje" label="Hoje" active={active}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2.2" /><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>
      </Item>
      <Item id="diario" label="Diário" active={active}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="4" y="5" width="16" height="2.4" rx="1.2" fill="currentColor" /><rect x="4" y="10.8" width="16" height="2.4" rx="1.2" fill="currentColor" /><rect x="4" y="16.6" width="10" height="2.4" rx="1.2" fill="currentColor" /></svg>
      </Item>
      <div className="tab-add-wrap">
        <button className="tab-add" aria-label="Registrar refeição" onClick={() => navigate('registrar')}>
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden><rect x="11.6" y="4" width="2.8" height="18" rx="1.4" fill="currentColor" /><rect x="4" y="11.6" width="18" height="2.8" rx="1.4" fill="currentColor" /></svg>
        </button>
      </div>
      <Item id="progresso" label="Progresso" active={active}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="4" y="12" width="3.6" height="8" rx="1.4" fill="currentColor" /><rect x="10.2" y="7" width="3.6" height="13" rx="1.4" fill="currentColor" /><rect x="16.4" y="4" width="3.6" height="16" rx="1.4" fill="currentColor" /></svg>
      </Item>
      <Item id="agente" label="Agente" active={active}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden><rect x="3.5" y="4.5" width="17" height="12.5" rx="5" stroke="currentColor" strokeWidth="2.2" /><circle cx="8" cy="19.5" r="1.6" fill="currentColor" /></svg>
      </Item>
    </nav>
  );
}
