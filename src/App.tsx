import { useEffect, useState } from 'react';
import { useRoute } from './hooks/useRoute';
import { session as sessionStore, useSession } from './store/session';
import { loadUserData, resetUserData, useApp } from './store/app';
import { supabase } from './lib/supabase';
import { AgentMark } from './components/AgentMark';
import { Login } from './screens/Login';
import { Hoje } from './screens/Hoje';
import { Registrar } from './screens/Registrar';
import { Analise } from './screens/Analise';
import { Diario } from './screens/Diario';
import { Progresso } from './screens/Progresso';
import { Agente } from './screens/Agente';
import { Plano } from './screens/Plano';
import { Onboarding } from './screens/Onboarding';

type Auth = { state: 'checking' | 'out' | 'loading' | 'ready' } | { state: 'error'; userId: string; email: string };

function useAuth() {
  const [auth, setAuth] = useState<Auth>({ state: 'checking' });
  useEffect(() => {
    let loadedFor: string | null = null;
    const load = (userId: string, email: string) => {
      setAuth({ state: 'loading' });
      loadUserData(userId, email).then(
        () => setAuth({ state: 'ready' }),
        err => { console.error(err); loadedFor = null; setAuth({ state: 'error', userId, email }); }
      );
    };
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      const userId = s?.user.id ?? null;
      if (!userId) { loadedFor = null; resetUserData(); setAuth({ state: 'out' }); return; }
      if (userId === loadedFor) return; // token refreshes don't need a reload
      loadedFor = userId;
      // Supabase advises against awaiting its own calls inside this callback
      setTimeout(() => load(userId, s?.user.email ?? ''), 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const retry = () => {
    if (auth.state !== 'error') return;
    const { userId, email } = auth;
    setAuth({ state: 'loading' });
    loadUserData(userId, email).then(() => setAuth({ state: 'ready' }), () => setAuth({ state: 'error', userId, email }));
  };
  return [auth, retry] as const;
}

export function App() {
  const route = useRoute();
  const { draft, syncError, redoOnboarding } = useSession();
  const { onboardedAt } = useApp();
  const [auth, retry] = useAuth();
  useEffect(() => { document.querySelector('.screen')?.scrollTo(0, 0); }, [route]);
  useEffect(() => {
    if (!syncError) return;
    const t = setTimeout(() => sessionStore.set(s => ({ ...s, syncError: null })), 4500);
    return () => clearTimeout(t);
  }, [syncError]);

  if (auth.state !== 'ready') {
    return (
      <main className="app">
        {auth.state === 'out' ? <Login /> : (
          <div className="loading" aria-live="polite">
            <AgentMark size={44} radius={15} ring={18} stroke={3.5} />
            {auth.state === 'error' ? (
              <>
                <span>Não conseguimos carregar seus dados. Verifique a conexão.</span>
                <button className="btn pri h48" onClick={retry}>Tentar de novo</button>
                <button className="btn txt" onClick={() => supabase.auth.signOut()}>Sair da conta</button>
              </>
            ) : <span>Carregando…</span>}
          </div>
        )}
      </main>
    );
  }

  if (!onboardedAt || redoOnboarding) {
    return (
      <main className="app">
        <Onboarding />
        {syncError && <div className="toast top" role="alert" style={{ zIndex: 45 }}>{syncError}</div>}
      </main>
    );
  }

  return (
    <main className="app">
      {route === 'hoje' && <Hoje />}
      {route === 'registrar' && <Registrar />}
      {/* a new capture remounts Análise so the analysis starts over */}
      {route === 'analise' && <Analise key={draft?.id ?? 0} />}
      {route === 'diario' && <Diario />}
      {route === 'progresso' && <Progresso />}
      {route === 'agente' && <Agente />}
      {route === 'plano' && <Plano />}
      {syncError && <div className="toast top" role="alert" style={{ zIndex: 45 }}>{syncError}</div>}
    </main>
  );
}
