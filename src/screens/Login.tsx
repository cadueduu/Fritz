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
  const [nascimento, setNascimento] = useState('');
  const [sexo, setSexo] = useState<'M' | 'F' | ''>('');
  const [altura, setAltura] = useState('');
  const [peso, setPeso] = useState('');
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
        const alt = Math.round(Number(altura.replace(',', '.')));
        const kg = Math.round(Number(peso.replace(',', '.')) * 10) / 10;
        const age = nascimento ? (Date.now() - new Date(nascimento + 'T12:00').getTime()) / 31557600000 : 0;
        if (!sexo) { setError('Escolha o sexo — ele entra no cálculo do gasto calórico.'); return; }
        if (!(age >= 14 && age <= 100)) { setError('Confira a data de nascimento.'); return; }
        if (!(alt >= 120 && alt <= 230)) { setError('Informe a altura em centímetros, por exemplo 172.'); return; }
        if (!(kg >= 35 && kg <= 300)) { setError('Informe o peso atual em kg, por exemplo 84,5.'); return; }
        const body = { sexo, nascimento, idade: Math.floor(age), altura: alt, peso: kg, atividade: 'mod', ritmo: 0.5 };
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim(), body } } });
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
            <>
              <label className="field"><span>Como quer ser chamado?</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="given-name" required /></label>
              <label className="field"><span>Data de nascimento</span><input type="date" value={nascimento} onChange={e => setNascimento(e.target.value)} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} required /></label>
              <div className="field">
                <span>Sexo</span>
                <div className="seg fill" role="radiogroup" aria-label="Sexo">
                  <button type="button" role="radio" aria-checked={sexo === 'F'} className={sexo === 'F' ? 'on' : ''} onClick={() => setSexo('F')}>Feminino</button>
                  <button type="button" role="radio" aria-checked={sexo === 'M'} className={sexo === 'M' ? 'on' : ''} onClick={() => setSexo('M')}>Masculino</button>
                </div>
              </div>
              <div className="grid2" style={{ gap: 10 }}>
                <label className="field"><span>Altura (cm)</span><input inputMode="numeric" value={altura} onChange={e => setAltura(e.target.value)} placeholder="172" required /></label>
                <label className="field"><span>Peso atual (kg)</span><input inputMode="decimal" value={peso} onChange={e => setPeso(e.target.value)} placeholder="84,5" required /></label>
              </div>
            </>
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
