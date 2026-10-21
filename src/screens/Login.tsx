import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { AgentMark } from '../components/AgentMark';
import './Login.css';

const MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Email ou senha incorretos.',
  'Email not confirmed': 'Confirme seu email pelo link que enviamos antes de entrar.',
  'User already registered': 'Já existe uma conta com esse email. Entre com sua senha.'
};
const translate = (m: string) =>
  MESSAGES[m] ?? (/password/i.test(m) ? 'A senha precisa ter pelo menos 6 caracteres.' : 'Não deu certo agora. Verifique a conexão e tente de novo.');

export function Login() {
  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setError(translate(error.message));
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } });
        if (error) setError(translate(error.message));
        // with email confirmation on, sign-up returns no session until the link is opened
        else if (!data.session) setSent(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen login">
      <div className="login-brand">
        <AgentMark size={44} radius={15} ring={18} stroke={3.5} />
        <span className="login-name">Leve</span>
      </div>
      <h1 className="h-screen">{mode === 'entrar' ? 'Bem-vindo de volta' : 'Crie sua conta'}</h1>
      <p className="login-sub">Registre refeições por foto ou texto e acompanhe sua evolução, sem culpa.</p>

      {sent ? (
        <section className="card">
          <span className="h-card">Confira seu email</span>
          <span className="muted" style={{ font: '500 calc(14 * var(--u))/1.5 var(--font)' }}>Enviamos um link de confirmação para <strong style={{ color: 'var(--ink)' }}>{email}</strong>. Depois de confirmar, volte aqui e entre.</span>
          <button className="btn pri" onClick={() => { setSent(false); setMode('entrar'); }}>Já confirmei · entrar</button>
        </section>
      ) : (
        <form className="card login-card" onSubmit={submit}>
          <div className="seg fill">
            <button type="button" className={mode === 'entrar' ? 'on' : ''} onClick={() => { setMode('entrar'); setError(null); }}>Entrar</button>
            <button type="button" className={mode === 'criar' ? 'on' : ''} onClick={() => { setMode('criar'); setError(null); }}>Criar conta</button>
          </div>
          {mode === 'criar' && (
            <label className="field"><span>Como quer ser chamado?</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" required /></label>
          )}
          <label className="field"><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" inputMode="email" required /></label>
          <label className="field"><span>Senha</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'} minLength={6} required /></label>
          {error && <div className="warn-box" role="alert">{error}</div>}
          <button type="submit" className="btn pri" disabled={busy}>{busy ? 'Aguarde…' : mode === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
        </form>
      )}
      <p className="small" style={{ textAlign: 'center' }}>Seus dados ficam salvos na sua conta e só você tem acesso.</p>
    </div>
  );
}
